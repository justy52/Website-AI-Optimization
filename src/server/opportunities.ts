import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db/client";
import {
  activityEvents,
  auditCheckResults,
  auditFindings,
  audits,
  clients,
  opportunities,
  websites,
  workPlanCycles,
  workPlanItems,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import {
  buildOpportunityDraft,
  openOpportunityStatuses,
  opportunityStatuses,
  sortOpportunitiesForWorkPlan,
  type ApprovalBlockedState,
  type ClientInputState,
  type DependencyState,
  type OpportunityStatus,
} from "@/domain/opportunities/generation";
import {
  calculateOpportunityPriority,
  type PriorityBand,
  type PriorityInputs,
} from "@/domain/opportunities/priority";
import { getServicePlanDefinition } from "@/domain/service-plans";
import type { WorkspaceContext } from "@/domain/tenancy/context";

type OpportunityDatabase = typeof db;
type OpportunityTransaction =
  Parameters<Parameters<OpportunityDatabase["transaction"]>[0]>[0];

const closedOpportunityStatuses: OpportunityStatus[] = [
  "COMPLETED",
  "DISMISSED",
  "SUPERSEDED",
];

const dependencyStates: DependencyState[] = ["NONE", "HARD_DEPENDENCY"];
const clientInputStates: ClientInputState[] = [
  "NOT_REQUIRED",
  "REQUIRED",
  "RECEIVED",
];
const approvalBlockedStates: ApprovalBlockedState[] = [
  "NOT_BLOCKED",
  "AWAITING_APPROVAL",
];

function now() {
  return new Date();
}

async function recordActivity(
  tx: OpportunityTransaction,
  context: WorkspaceContext,
  action: string,
  resourceType: string,
  resourceId: string,
  summary: Record<string, unknown> = {},
) {
  await tx.insert(activityEvents).values({
    workspaceId: context.workspaceId,
    actorType: context.actorType,
    actorUserId: context.userId,
    actorAgentRunId: context.agentRunId,
    action,
    resourceType,
    resourceId,
    summary,
    correlationId: context.correlationId,
  });
}

function isOpportunityStatus(value: string): value is OpportunityStatus {
  return opportunityStatuses.includes(value as OpportunityStatus);
}

function parseScale(value: string, name: string, min: number, max: number) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  }

  return parsed;
}

function parseDependencyState(value: string): DependencyState {
  if (!dependencyStates.includes(value as DependencyState)) {
    throw new Error("Dependency state is not valid.");
  }

  return value as DependencyState;
}

function parseClientInputState(value: string): ClientInputState {
  if (!clientInputStates.includes(value as ClientInputState)) {
    throw new Error("Client-input state is not valid.");
  }

  return value as ClientInputState;
}

function parseApprovalBlockedState(value: string): ApprovalBlockedState {
  if (!approvalBlockedStates.includes(value as ApprovalBlockedState)) {
    throw new Error("Approval-blocked state is not valid.");
  }

  return value as ApprovalBlockedState;
}

function optionalOwnerUserId(value: string, context: WorkspaceContext) {
  if (!value || value === "UNASSIGNED") return null;
  if (value === context.userId) return value;
  throw new Error("Only assigning the current user is supported in Phase 2.");
}

function recalculatePriority(input: {
  impact: number;
  confidence: number;
  urgency: number;
  strategicFit: number;
  planFit: number;
  staleness: number;
  effort: PriorityInputs["effort"];
  dependencyState: DependencyState;
  clientInputState: ClientInputState;
  status: OpportunityStatus;
  sourceSeverity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}) {
  const priority = calculateOpportunityPriority({
    impact: input.impact,
    confidence: input.confidence,
    urgency: input.urgency,
    strategicFit: input.strategicFit,
    planFit: input.planFit,
    staleness: input.staleness,
    effort: input.effort,
    hasUnresolvedHardDependency: input.dependencyState === "HARD_DEPENDENCY",
    awaitingClientInput: input.clientInputState === "REQUIRED",
    isConfirmedDuplicate: input.status === "SUPERSEDED",
    isCriticalFinding: input.sourceSeverity === "CRITICAL",
  });

  return {
    basePriority: priority.baseScore,
    modifiers: {
      dependencyState: input.dependencyState,
      clientInputState: input.clientInputState,
      effort: input.effort,
      modifierTotal: priority.modifierTotal,
      superseded: input.status === "SUPERSEDED",
    },
    finalPriority: priority.score,
    priorityBand: priority.band,
    priorityReasons: priority.reasons,
  };
}

function priorityOrdering() {
  return [
    sql`case when ${opportunities.sourceSeverity} = 'CRITICAL' and ${opportunities.status} not in ('COMPLETED', 'DISMISSED', 'SUPERSEDED') then 0 else 1 end`,
    desc(opportunities.finalPriority),
    asc(opportunities.effort),
    asc(opportunities.createdAt),
  ] as const;
}

export type OpportunityFilters = {
  band?: string;
  status?: string;
  clientId?: string;
  websiteId?: string;
  attention?: "immediate" | "high" | "blocked";
};

export async function generateOpportunitiesForAuditRun(
  tx: OpportunityTransaction,
  context: WorkspaceContext,
  input: {
    clientId: string;
    websiteId: string;
    auditId: string;
    auditRunId: string;
  },
) {
  const [client] = await tx
    .select({
      id: clients.id,
      servicePlan: clients.servicePlan,
      servicePlanVersion: clients.servicePlanVersion,
    })
    .from(clients)
    .where(
      and(
        eq(clients.workspaceId, context.workspaceId),
        eq(clients.id, input.clientId),
      ),
    )
    .limit(1);

  if (!client) {
    throw new Error("Client was not found for opportunity generation.");
  }

  getServicePlanDefinition(client.servicePlan, client.servicePlanVersion);

  const checkRows = await tx
    .select({
      id: auditCheckResults.id,
      auditId: auditCheckResults.auditId,
      auditRunId: auditCheckResults.auditRunId,
      checkKey: auditCheckResults.checkKey,
      checkVersion: auditCheckResults.checkVersion,
      category: auditCheckResults.category,
      status: auditCheckResults.status,
      severity: auditCheckResults.severity,
      evidenceConfidence: auditCheckResults.evidenceConfidence,
      maxPenaltyWeight: auditCheckResults.maxPenaltyWeight,
      reason: auditCheckResults.reason,
      evidenceRefs: auditCheckResults.evidenceRefs,
      findingId: auditFindings.id,
      findingTitle: auditFindings.title,
      findingSummary: auditFindings.summary,
    })
    .from(auditCheckResults)
    .leftJoin(
      auditFindings,
      and(
        eq(auditFindings.workspaceId, auditCheckResults.workspaceId),
        eq(auditFindings.checkResultId, auditCheckResults.id),
      ),
    )
    .where(
      and(
        eq(auditCheckResults.workspaceId, context.workspaceId),
        eq(auditCheckResults.auditId, input.auditId),
        eq(auditCheckResults.auditRunId, input.auditRunId),
      ),
    );

  let created = 0;
  let deduped = 0;
  let immediate = 0;

  for (const row of checkRows) {
    const draft = buildOpportunityDraft({
      checkKey: row.checkKey,
      checkVersion: row.checkVersion,
      category: row.category,
      status: row.status,
      severity: row.severity,
      maxPenaltyWeight: row.maxPenaltyWeight,
      reason: row.reason,
      evidenceRefs: row.evidenceRefs,
      evidenceConfidence: row.evidenceConfidence,
      clientServicePlan: client.servicePlan,
      clientServicePlanVersion: client.servicePlanVersion,
      findingTitle: row.findingTitle,
      findingSummary: row.findingSummary,
    });

    if (!draft) {
      continue;
    }

    const [existing] = await tx
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.workspaceId, context.workspaceId),
          eq(opportunities.websiteId, input.websiteId),
          eq(opportunities.sourceCheckKey, row.checkKey),
          eq(
            opportunities.normalizedRemediationFamily,
            draft.normalizedRemediationFamily,
          ),
          inArray(opportunities.status, openOpportunityStatuses),
        ),
      )
      .limit(1);

    if (existing) {
      await tx
        .update(opportunities)
        .set({
          sourceAuditId: input.auditId,
          sourceAuditRunId: input.auditRunId,
          sourceFindingId: row.findingId,
          sourceCheckResultId: row.id,
          sourceCheckVersion: row.checkVersion,
          sourceResultStatus: row.status,
          sourceSeverity: draft.sourceSeverity,
          sourceEvidenceRefs: draft.sourceEvidenceRefs,
          evidenceConfidence: row.evidenceConfidence,
          immediateAttention: draft.immediateAttention,
          updatedAt: now(),
        })
        .where(
          and(
            eq(opportunities.workspaceId, context.workspaceId),
            eq(opportunities.id, existing.id),
          ),
        );
      await recordActivity(
        tx,
        context,
        "opportunity.updated",
        "opportunity",
        existing.id,
        {
          reason: "deduplicated_new_audit_evidence",
          sourceAuditId: input.auditId,
          sourceCheckKey: row.checkKey,
        },
      );
      deduped += 1;
      continue;
    }

    const [opportunity] = await tx
      .insert(opportunities)
      .values({
        workspaceId: context.workspaceId,
        clientId: input.clientId,
        websiteId: input.websiteId,
        sourceAuditId: input.auditId,
        sourceAuditRunId: input.auditRunId,
        sourceFindingId: row.findingId,
        sourceCheckResultId: row.id,
        sourceCheckKey: row.checkKey,
        sourceCheckVersion: row.checkVersion,
        sourceResultStatus: row.status,
        sourceSeverity: draft.sourceSeverity,
        sourceEvidenceRefs: draft.sourceEvidenceRefs,
        evidenceConfidence: row.evidenceConfidence,
        category: row.category,
        normalizedRemediationFamily: draft.normalizedRemediationFamily,
        title: draft.title,
        summary: draft.summary,
        recommendedAction: draft.recommendedAction,
        status: draft.status,
        priorityDefinitionVersion: draft.priorityDefinitionVersion,
        impact: draft.impact,
        confidence: draft.confidence,
        urgency: draft.urgency,
        strategicFit: draft.strategicFit,
        planFit: draft.planFit,
        staleness: draft.staleness,
        effort: draft.effort,
        dependencyState: draft.dependencyState,
        clientInputState: draft.clientInputState,
        approvalBlockedState: draft.approvalBlockedState,
        basePriority: draft.basePriority,
        modifiers: draft.modifiers,
        finalPriority: draft.finalPriority,
        priorityBand: draft.priorityBand,
        priorityReasons: draft.priorityReasons,
        planScope: draft.planScope,
        immediateAttention: draft.immediateAttention,
      })
      .returning({ id: opportunities.id });

    await recordActivity(
      tx,
      context,
      "opportunity.created",
      "opportunity",
      opportunity.id,
      {
        sourceAuditId: input.auditId,
        sourceCheckKey: row.checkKey,
        priorityBand: draft.priorityBand,
      },
    );

    if (draft.immediateAttention) {
      await recordActivity(
        tx,
        context,
        "opportunity.immediate_attention",
        "opportunity",
        opportunity.id,
        {
          sourceAuditId: input.auditId,
          sourceCheckKey: row.checkKey,
        },
      );
      immediate += 1;
    }

    created += 1;
  }

  return { created, deduped, immediate };
}

export async function listOpportunities(
  context: WorkspaceContext,
  filters: OpportunityFilters = {},
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const conditions: SQL[] = [eq(opportunities.workspaceId, context.workspaceId)];

    if (filters.band) {
      conditions.push(eq(opportunities.priorityBand, filters.band as PriorityBand));
    }

    if (filters.status && isOpportunityStatus(filters.status)) {
      conditions.push(eq(opportunities.status, filters.status));
    }

    if (filters.clientId) {
      conditions.push(eq(opportunities.clientId, filters.clientId));
    }

    if (filters.websiteId) {
      conditions.push(eq(opportunities.websiteId, filters.websiteId));
    }

    if (filters.attention === "immediate") {
      conditions.push(eq(opportunities.priorityBand, "Immediate"));
      conditions.push(inArray(opportunities.status, openOpportunityStatuses));
    }

    if (filters.attention === "high") {
      conditions.push(eq(opportunities.priorityBand, "High"));
      conditions.push(inArray(opportunities.status, openOpportunityStatuses));
    }

    if (filters.attention === "blocked") {
      conditions.push(eq(opportunities.status, "BLOCKED"));
    }

    return tx
      .select({
        id: opportunities.id,
        workspaceId: opportunities.workspaceId,
        clientId: opportunities.clientId,
        clientName: clients.name,
        websiteId: opportunities.websiteId,
        websiteName: websites.displayName,
        domain: websites.domain,
        sourceAuditId: opportunities.sourceAuditId,
        sourceAuditRunId: opportunities.sourceAuditRunId,
        sourceFindingId: opportunities.sourceFindingId,
        sourceCheckKey: opportunities.sourceCheckKey,
        category: opportunities.category,
        title: opportunities.title,
        summary: opportunities.summary,
        status: opportunities.status,
        finalPriority: opportunities.finalPriority,
        priorityBand: opportunities.priorityBand,
        planScope: opportunities.planScope,
        sourceSeverity: opportunities.sourceSeverity,
        effort: opportunities.effort,
        dependencyState: opportunities.dependencyState,
        clientInputState: opportunities.clientInputState,
        approvalBlockedState: opportunities.approvalBlockedState,
        immediateAttention: opportunities.immediateAttention,
        ownerUserId: opportunities.ownerUserId,
        createdAt: opportunities.createdAt,
        updatedAt: opportunities.updatedAt,
      })
      .from(opportunities)
      .innerJoin(
        clients,
        and(
          eq(clients.workspaceId, opportunities.workspaceId),
          eq(clients.id, opportunities.clientId),
        ),
      )
      .innerJoin(
        websites,
        and(
          eq(websites.workspaceId, opportunities.workspaceId),
          eq(websites.id, opportunities.websiteId),
        ),
      )
      .where(and(...conditions))
      .orderBy(...priorityOrdering());
  });
}

export async function getOpportunityDetail(
  context: WorkspaceContext,
  opportunityId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [row] = await tx
      .select({
        opportunity: opportunities,
        clientName: clients.name,
        clientServicePlan: clients.servicePlan,
        clientServicePlanVersion: clients.servicePlanVersion,
        websiteName: websites.displayName,
        domain: websites.domain,
        auditTitle: audits.title,
      })
      .from(opportunities)
      .innerJoin(
        clients,
        and(
          eq(clients.workspaceId, opportunities.workspaceId),
          eq(clients.id, opportunities.clientId),
        ),
      )
      .innerJoin(
        websites,
        and(
          eq(websites.workspaceId, opportunities.workspaceId),
          eq(websites.id, opportunities.websiteId),
        ),
      )
      .innerJoin(
        audits,
        and(
          eq(audits.workspaceId, opportunities.workspaceId),
          eq(audits.id, opportunities.sourceAuditId),
        ),
      )
      .where(
        and(
          eq(opportunities.workspaceId, context.workspaceId),
          eq(opportunities.id, opportunityId),
        ),
      )
      .limit(1);

    return row ?? null;
  });
}

export async function updateOpportunity(
  context: WorkspaceContext,
  opportunityId: string,
  input: {
    title: string;
    summary: string;
    status: string;
    impact: string;
    confidence: string;
    urgency: string;
    strategicFit: string;
    planFit: string;
    staleness: string;
    effort: string;
    dependencyState: string;
    clientInputState: string;
    approvalBlockedState: string;
    ownerUserId?: string;
  },
  database = db,
) {
  const title = input.title.trim();
  const summary = input.summary.trim();
  const status = input.status.trim();

  if (!title) throw new Error("Opportunity title is required.");
  if (!summary) throw new Error("Opportunity summary is required.");
  if (!isOpportunityStatus(status)) {
    throw new Error("Opportunity status is not valid.");
  }

  const dependencyState = parseDependencyState(input.dependencyState);
  const clientInputState = parseClientInputState(input.clientInputState);
  const approvalBlockedState = parseApprovalBlockedState(
    input.approvalBlockedState,
  );
  const factors = {
    impact: parseScale(input.impact, "impact", 0, 5),
    confidence: parseScale(input.confidence, "confidence", 0, 5),
    urgency: parseScale(input.urgency, "urgency", 0, 5),
    strategicFit: parseScale(input.strategicFit, "strategic fit", 0, 5),
    planFit: parseScale(input.planFit, "plan fit", 0, 5),
    staleness: parseScale(input.staleness, "staleness", 0, 5),
    effort: parseScale(input.effort, "effort", 1, 5) as PriorityInputs["effort"],
  };

  return withTenantContext(database, context, async (tx) => {
    const [current] = await tx
      .select()
      .from(opportunities)
      .where(
        and(
          eq(opportunities.workspaceId, context.workspaceId),
          eq(opportunities.id, opportunityId),
        ),
      )
      .limit(1);

    if (!current) {
      throw new Error("Opportunity was not found.");
    }

    const recalculated = recalculatePriority({
      ...factors,
      dependencyState,
      clientInputState,
      status,
      sourceSeverity: current.sourceSeverity,
    });
    const currentTime = now();
    const isClosed = closedOpportunityStatuses.includes(status);
    const completedAt =
      status === "COMPLETED" ? (current.completedAt ?? currentTime) : null;
    const closedAt = isClosed ? (current.closedAt ?? currentTime) : null;
    const supersededAt =
      status === "SUPERSEDED" ? (current.supersededAt ?? currentTime) : null;

    const [updated] = await tx
      .update(opportunities)
      .set({
        title,
        summary,
        status,
        impact: factors.impact,
        confidence: factors.confidence,
        urgency: factors.urgency,
        strategicFit: factors.strategicFit,
        planFit: factors.planFit,
        staleness: factors.staleness,
        effort: factors.effort,
        dependencyState,
        clientInputState,
        approvalBlockedState,
        ownerUserId: optionalOwnerUserId(input.ownerUserId ?? "", context),
        ...recalculated,
        updatedAt: currentTime,
        completedAt,
        closedAt,
        supersededAt,
      })
      .where(
        and(
          eq(opportunities.workspaceId, context.workspaceId),
          eq(opportunities.id, opportunityId),
        ),
      )
      .returning();

    await recordActivity(tx, context, "opportunity.updated", "opportunity", updated.id, {
      status,
      priority: updated.finalPriority,
    });

    if (current.status !== updated.status) {
      await recordActivity(
        tx,
        context,
        "opportunity.status_changed",
        "opportunity",
        updated.id,
        { from: current.status, to: updated.status },
      );
    }

    if (current.finalPriority !== updated.finalPriority) {
      await recordActivity(
        tx,
        context,
        "opportunity.priority_changed",
        "opportunity",
        updated.id,
        { from: current.finalPriority, to: updated.finalPriority },
      );
    }

    if (updated.status === "COMPLETED" && current.status !== "COMPLETED") {
      await recordActivity(
        tx,
        context,
        "opportunity.completed",
        "opportunity",
        updated.id,
      );
    }

    if (updated.status === "DISMISSED" && current.status !== "DISMISSED") {
      await recordActivity(
        tx,
        context,
        "opportunity.dismissed",
        "opportunity",
        updated.id,
      );
    }

    if (updated.status === "SUPERSEDED" && current.status !== "SUPERSEDED") {
      await recordActivity(
        tx,
        context,
        "opportunity.superseded",
        "opportunity",
        updated.id,
      );
    }

    return updated;
  });
}

export async function getOpportunityDashboardSummary(
  context: WorkspaceContext,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [immediate] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.workspaceId, context.workspaceId),
          eq(opportunities.priorityBand, "Immediate"),
          inArray(opportunities.status, openOpportunityStatuses),
        ),
      );
    const [high] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.workspaceId, context.workspaceId),
          eq(opportunities.priorityBand, "High"),
          inArray(opportunities.status, openOpportunityStatuses),
        ),
      );
    const [blocked] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.workspaceId, context.workspaceId),
          eq(opportunities.status, "BLOCKED"),
        ),
      );
    const recent = await tx
      .select({
        id: opportunities.id,
        title: opportunities.title,
        priorityBand: opportunities.priorityBand,
        finalPriority: opportunities.finalPriority,
      })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.workspaceId, context.workspaceId),
          inArray(opportunities.status, openOpportunityStatuses),
        ),
      )
      .orderBy(...priorityOrdering())
      .limit(5);

    return {
      immediate: immediate?.count ?? 0,
      high: high?.count ?? 0,
      blocked: blocked?.count ?? 0,
      recent,
    };
  });
}

async function getOpenWorkPlanCycle(
  tx: OpportunityTransaction,
  context: WorkspaceContext,
  clientId: string,
) {
  const [cycle] = await tx
    .select()
    .from(workPlanCycles)
    .where(
      and(
        eq(workPlanCycles.workspaceId, context.workspaceId),
        eq(workPlanCycles.clientId, clientId),
        eq(workPlanCycles.status, "OPEN"),
      ),
    )
    .limit(1);

  return cycle ?? null;
}

async function ensureOpenWorkPlanCycle(
  tx: OpportunityTransaction,
  context: WorkspaceContext,
  clientId: string,
) {
  const existing = await getOpenWorkPlanCycle(tx, context, clientId);

  if (existing) {
    return existing;
  }

  const [client] = await tx
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(
      and(
        eq(clients.workspaceId, context.workspaceId),
        eq(clients.id, clientId),
        isNull(clients.archivedAt),
      ),
    )
    .limit(1);

  if (!client) {
    throw new Error("Client was not found.");
  }

  const [cycle] = await tx
    .insert(workPlanCycles)
    .values({
      workspaceId: context.workspaceId,
      clientId,
      title: `${client.name} current work cycle`,
      status: "OPEN",
    })
    .returning();

  return cycle;
}

export async function getWorkPlanOverview(
  context: WorkspaceContext,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const rows = await tx
      .select({
        clientId: clients.id,
        clientName: clients.name,
        servicePlan: clients.servicePlan,
        openCount: sql<number>`count(${opportunities.id})::int`,
      })
      .from(clients)
      .leftJoin(
        opportunities,
        and(
          eq(opportunities.workspaceId, clients.workspaceId),
          eq(opportunities.clientId, clients.id),
          inArray(opportunities.status, openOpportunityStatuses),
        ),
      )
      .where(
        and(
          eq(clients.workspaceId, context.workspaceId),
          isNull(clients.archivedAt),
        ),
      )
      .groupBy(clients.id, clients.name, clients.servicePlan)
      .orderBy(desc(sql<number>`count(${opportunities.id})`), asc(clients.name));

    return rows;
  });
}

export async function getClientWorkPlan(
  context: WorkspaceContext,
  clientId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [client] = await tx
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.workspaceId, context.workspaceId),
          eq(clients.id, clientId),
          isNull(clients.archivedAt),
        ),
      )
      .limit(1);

    if (!client) {
      throw new Error("Client was not found.");
    }

    const cycle = await getOpenWorkPlanCycle(tx, context, clientId);
    const queue = await tx
      .select({
        id: opportunities.id,
        workspaceId: opportunities.workspaceId,
        clientId: opportunities.clientId,
        clientName: clients.name,
        websiteId: opportunities.websiteId,
        websiteName: websites.displayName,
        domain: websites.domain,
        sourceAuditId: opportunities.sourceAuditId,
        sourceAuditRunId: opportunities.sourceAuditRunId,
        sourceFindingId: opportunities.sourceFindingId,
        sourceCheckKey: opportunities.sourceCheckKey,
        category: opportunities.category,
        title: opportunities.title,
        summary: opportunities.summary,
        status: opportunities.status,
        finalPriority: opportunities.finalPriority,
        priorityBand: opportunities.priorityBand,
        planScope: opportunities.planScope,
        sourceSeverity: opportunities.sourceSeverity,
        effort: opportunities.effort,
        dependencyState: opportunities.dependencyState,
        clientInputState: opportunities.clientInputState,
        approvalBlockedState: opportunities.approvalBlockedState,
        immediateAttention: opportunities.immediateAttention,
        ownerUserId: opportunities.ownerUserId,
        createdAt: opportunities.createdAt,
        updatedAt: opportunities.updatedAt,
      })
      .from(opportunities)
      .innerJoin(
        clients,
        and(
          eq(clients.workspaceId, opportunities.workspaceId),
          eq(clients.id, opportunities.clientId),
        ),
      )
      .innerJoin(
        websites,
        and(
          eq(websites.workspaceId, opportunities.workspaceId),
          eq(websites.id, opportunities.websiteId),
        ),
      )
      .where(
        and(
          eq(opportunities.workspaceId, context.workspaceId),
          eq(opportunities.clientId, clientId),
        ),
      )
      .orderBy(...priorityOrdering());
    const selected = cycle
      ? await tx
          .select({ opportunityId: workPlanItems.opportunityId })
          .from(workPlanItems)
          .where(
            and(
              eq(workPlanItems.workspaceId, context.workspaceId),
              eq(workPlanItems.clientId, clientId),
              eq(workPlanItems.workPlanCycleId, cycle.id),
            ),
          )
      : [];
    const selectedIds = new Set(selected.map((item) => item.opportunityId));
    const sortedQueue = sortOpportunitiesForWorkPlan(queue).filter((item) =>
      openOpportunityStatuses.includes(item.status),
    );

    return {
      client,
      cycle,
      opportunities: sortedQueue.map((item) => ({
        ...item,
        selectedForCycle: selectedIds.has(item.id),
      })),
    };
  });
}

export async function selectOpportunityForWorkPlan(
  context: WorkspaceContext,
  opportunityId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [opportunity] = await tx
      .select({
        id: opportunities.id,
        clientId: opportunities.clientId,
      })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.workspaceId, context.workspaceId),
          eq(opportunities.id, opportunityId),
          inArray(opportunities.status, openOpportunityStatuses),
        ),
      )
      .limit(1);

    if (!opportunity) {
      throw new Error("Opportunity was not found.");
    }

    const cycle = await ensureOpenWorkPlanCycle(
      tx,
      context,
      opportunity.clientId,
    );

    await tx
      .insert(workPlanItems)
      .values({
        workspaceId: context.workspaceId,
        clientId: opportunity.clientId,
        workPlanCycleId: cycle.id,
        opportunityId: opportunity.id,
        selectedByUserId: context.userId,
      })
      .onConflictDoNothing();

    await recordActivity(tx, context, "work_plan.updated", "work_plan", cycle.id, {
      selectedOpportunityId: opportunity.id,
    });

    return cycle;
  });
}

export async function removeOpportunityFromWorkPlan(
  context: WorkspaceContext,
  opportunityId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [opportunity] = await tx
      .select({
        id: opportunities.id,
        clientId: opportunities.clientId,
      })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.workspaceId, context.workspaceId),
          eq(opportunities.id, opportunityId),
        ),
      )
      .limit(1);

    if (!opportunity) {
      throw new Error("Opportunity was not found.");
    }

    const cycle = await getOpenWorkPlanCycle(
      tx,
      context,
      opportunity.clientId,
    );

    if (!cycle) {
      return null;
    }

    await tx
      .delete(workPlanItems)
      .where(
        and(
          eq(workPlanItems.workspaceId, context.workspaceId),
          eq(workPlanItems.clientId, opportunity.clientId),
          eq(workPlanItems.workPlanCycleId, cycle.id),
          eq(workPlanItems.opportunityId, opportunity.id),
        ),
      );

    await recordActivity(tx, context, "work_plan.updated", "work_plan", cycle.id, {
      removedOpportunityId: opportunity.id,
    });

    return cycle;
  });
}
