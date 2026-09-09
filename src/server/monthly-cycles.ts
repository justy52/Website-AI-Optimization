import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  sql,
} from "drizzle-orm";

import { db } from "@/db/client";
import {
  activityEvents,
  approvalRequests,
  auditCheckResults,
  auditRuns,
  clients,
  competitorObservations,
  competitorTargets,
  draftArtifacts,
  implementationVerificationRecords,
  manualImplementationRecords,
  monthlyCycleDeliverables,
  monthlyCycleWorkItems,
  monthlyCycles,
  monthlyReports,
  monitoringRuns,
  opportunities,
  searchConsoleProperties,
  websites,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import {
  entitlementCompletionStates,
} from "@/domain/monthly-cycles/accounting";
import {
  buildMonthlyDeliverableTemplates,
  buildMonthlyEntitlementSnapshot,
  cycleDueAt,
  monthlyPeriod,
  monthlyPeriodForDate,
  shouldCreateRecurringMonthlyCycle,
  type MonthlyEntitlementSnapshot,
} from "@/domain/monthly-cycles/entitlements";
import {
  buildMonthlyReportDraft,
  monthlyReportSnapshotHash,
} from "@/domain/monthly-cycles/reports";
import {
  classifyMonthlyOpportunityEntitlement,
  selectMonthlyWork,
  sortMonthlySelectionCandidates,
  type MonthlySelectionCandidate,
} from "@/domain/monthly-cycles/selection";
import { openOpportunityStatuses } from "@/domain/opportunities/generation";
import type { ServicePlanKey } from "@/domain/service-plans";
import {
  assertWorkspaceRole,
  type WorkspaceContext,
} from "@/domain/tenancy/context";

type MonthlyDatabase = typeof db;
type MonthlyTransaction = Parameters<
  Parameters<MonthlyDatabase["transaction"]>[0]
>[0];

const mutableCycleStatuses = [
  "OPEN",
  "IN_PROGRESS",
  "REVIEW_REQUIRED",
] as const;

function now() {
  return new Date();
}

function dateStart(value: string | Date): Date {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  return new Date(`${text}T00:00:00.000Z`);
}

function dayAfter(value: string | Date): Date {
  const date = dateStart(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function optionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function safeActorUser(context: WorkspaceContext) {
  return context.actorType === "USER" ? context.userId : undefined;
}

async function recordActivity(
  tx: MonthlyTransaction,
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

async function findPrimaryWebsite(
  tx: MonthlyTransaction,
  context: Pick<WorkspaceContext, "workspaceId">,
  clientId: string,
) {
  const [website] = await tx
    .select()
    .from(websites)
    .where(
      and(
        eq(websites.workspaceId, context.workspaceId),
        eq(websites.clientId, clientId),
        isNull(websites.archivedAt),
      ),
    )
    .orderBy(asc(websites.createdAt))
    .limit(1);

  return website ?? null;
}

async function hasConnectedSearchConsole(
  tx: MonthlyTransaction,
  context: Pick<WorkspaceContext, "workspaceId">,
  websiteId: string | null,
) {
  if (!websiteId) return false;

  const [property] = await tx
    .select({ id: searchConsoleProperties.id })
    .from(searchConsoleProperties)
    .where(
      and(
        eq(searchConsoleProperties.workspaceId, context.workspaceId),
        eq(searchConsoleProperties.websiteId, websiteId),
        eq(searchConsoleProperties.selected, true),
        isNull(searchConsoleProperties.archivedAt),
      ),
    )
    .limit(1);

  return Boolean(property);
}

async function loadCycle(
  tx: MonthlyTransaction,
  context: Pick<WorkspaceContext, "workspaceId">,
  monthlyCycleId: string,
) {
  const [cycle] = await tx
    .select()
    .from(monthlyCycles)
    .where(
      and(
        eq(monthlyCycles.workspaceId, context.workspaceId),
        eq(monthlyCycles.id, monthlyCycleId),
      ),
    )
    .limit(1);

  if (!cycle) {
    throw new Error("Monthly cycle was not found.");
  }

  return cycle;
}

function assertCycleMutable(status: string) {
  if (!mutableCycleStatuses.includes(status as (typeof mutableCycleStatuses)[number])) {
    throw new Error("Only open monthly cycles can be changed.");
  }
}

async function refreshMonthlyCycleAccounting(
  tx: MonthlyTransaction,
  context: Pick<WorkspaceContext, "workspaceId">,
  monthlyCycleId: string,
) {
  const cycle = await loadCycle(tx, context, monthlyCycleId);
  const [manual] = await tx
    .select({
      minutes: sql<number>`coalesce(sum(${manualImplementationRecords.manualMinutes}), 0)::int`,
    })
    .from(manualImplementationRecords)
    .where(
      and(
        eq(manualImplementationRecords.workspaceId, context.workspaceId),
        eq(manualImplementationRecords.monthlyCycleId, monthlyCycleId),
        eq(manualImplementationRecords.qualifiesForPlan, true),
      ),
    );
  const [pageCount] = await tx
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(monthlyCycleWorkItems)
    .where(
      and(
        eq(monthlyCycleWorkItems.workspaceId, context.workspaceId),
        eq(monthlyCycleWorkItems.monthlyCycleId, monthlyCycleId),
        eq(
          monthlyCycleWorkItems.entitlementType,
          "existing_page_optimizations_completed",
        ),
        inArray(monthlyCycleWorkItems.completionState, [
          ...entitlementCompletionStates,
        ]),
      ),
    );
  const [contentCount] = await tx
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(monthlyCycleWorkItems)
    .where(
      and(
        eq(monthlyCycleWorkItems.workspaceId, context.workspaceId),
        eq(monthlyCycleWorkItems.monthlyCycleId, monthlyCycleId),
        eq(monthlyCycleWorkItems.entitlementType, "major_content_assets_completed"),
        inArray(monthlyCycleWorkItems.completionState, [
          ...entitlementCompletionStates,
        ]),
      ),
    );
  const [competitors] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(competitorTargets)
    .where(
      and(
        eq(competitorTargets.workspaceId, context.workspaceId),
        eq(competitorTargets.clientId, cycle.clientId),
        eq(competitorTargets.active, true),
        isNull(competitorTargets.archivedAt),
      ),
    );
  const [agentUnits] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(monthlyCycleWorkItems)
    .where(
      and(
        eq(monthlyCycleWorkItems.workspaceId, context.workspaceId),
        eq(monthlyCycleWorkItems.monthlyCycleId, monthlyCycleId),
        sql`${monthlyCycleWorkItems.draftState} <> 'NOT_REQUESTED'`,
      ),
    );

  const manualMinutes = manual?.minutes ?? 0;
  const pageCompleted = pageCount?.count ?? 0;
  const contentCompleted = contentCount?.count ?? 0;
  const updatedAt = now();

  await tx
    .update(monthlyCycles)
    .set({
      agentWorkUnits: agentUnits?.count ?? 0,
      manualImplementationMinutes: manualMinutes,
      majorContentAssetsCompleted: contentCompleted,
      existingPageOptimizationsCompleted: pageCompleted,
      aiVisibilityObservationsUsed: 0,
      competitorTargetsActive: competitors?.count ?? 0,
      trackedKeywordsActive: 0,
      updatedAt,
    })
    .where(
      and(
        eq(monthlyCycles.workspaceId, context.workspaceId),
        eq(monthlyCycles.id, monthlyCycleId),
      ),
    );

  await updateCountedDeliverable(tx, context, monthlyCycleId, {
    key: "existing_page_optimization",
    completedCount: pageCompleted,
  });
  await updateCountedDeliverable(tx, context, monthlyCycleId, {
    key: "major_content_asset",
    completedCount: contentCompleted,
  });

  return {
    agentWorkUnits: agentUnits?.count ?? 0,
    manualImplementationMinutes: manualMinutes,
    majorContentAssetsCompleted: contentCompleted,
    existingPageOptimizationsCompleted: pageCompleted,
    aiVisibilityObservationsUsed: 0,
    competitorTargetsActive: competitors?.count ?? 0,
    trackedKeywordsActive: 0,
  };
}

async function updateCountedDeliverable(
  tx: MonthlyTransaction,
  context: Pick<WorkspaceContext, "workspaceId">,
  monthlyCycleId: string,
  input: {
    key: string;
    completedCount: number;
  },
) {
  const [deliverable] = await tx
    .select()
    .from(monthlyCycleDeliverables)
    .where(
      and(
        eq(monthlyCycleDeliverables.workspaceId, context.workspaceId),
        eq(monthlyCycleDeliverables.monthlyCycleId, monthlyCycleId),
        eq(monthlyCycleDeliverables.deliverableKey, input.key),
      ),
    )
    .limit(1);

  if (!deliverable) return;

  if (deliverable.status === "COMPLETE") {
    await tx
      .update(monthlyCycleDeliverables)
      .set({
        completedCount: Math.max(deliverable.completedCount, input.completedCount),
        updatedAt: now(),
      })
      .where(
        and(
          eq(monthlyCycleDeliverables.workspaceId, context.workspaceId),
          eq(monthlyCycleDeliverables.id, deliverable.id),
        ),
      );
    return;
  }

  if (["WAIVED", "UNAVAILABLE", "BLOCKED", "NOT_APPLICABLE"].includes(deliverable.status)) {
    await tx
      .update(monthlyCycleDeliverables)
      .set({ completedCount: input.completedCount, updatedAt: now() })
      .where(
        and(
          eq(monthlyCycleDeliverables.workspaceId, context.workspaceId),
          eq(monthlyCycleDeliverables.id, deliverable.id),
        ),
      );
    return;
  }

  const complete =
    deliverable.targetCount > 0 && input.completedCount >= deliverable.targetCount;

  await tx
    .update(monthlyCycleDeliverables)
    .set({
      completedCount: input.completedCount,
      status: complete
        ? "COMPLETE"
        : input.completedCount > 0
          ? "IN_PROGRESS"
          : "NOT_STARTED",
      completedAt: complete ? (deliverable.completedAt ?? now()) : null,
      updatedAt: now(),
    })
    .where(
      and(
        eq(monthlyCycleDeliverables.workspaceId, context.workspaceId),
        eq(monthlyCycleDeliverables.id, deliverable.id),
      ),
    );
}

async function monthlyCycleMonitoringSummary(
  tx: MonthlyTransaction,
  context: Pick<WorkspaceContext, "workspaceId">,
  cycle: typeof monthlyCycles.$inferSelect,
) {
  const periodStart = dateStart(cycle.periodStartDate);
  const periodEndExclusive = dayAfter(cycle.periodEndDate);
  const [websiteHealthRuns] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(monitoringRuns)
    .where(
      and(
        eq(monitoringRuns.workspaceId, context.workspaceId),
        eq(monitoringRuns.clientId, cycle.clientId),
        eq(monitoringRuns.monitorKey, "website_health"),
        inArray(monitoringRuns.status, ["SUCCEEDED", "PARTIAL"]),
        gte(monitoringRuns.completedAt, periodStart),
        lt(monitoringRuns.completedAt, periodEndExclusive),
      ),
    );
  const [searchRuns] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(monitoringRuns)
    .where(
      and(
        eq(monitoringRuns.workspaceId, context.workspaceId),
        eq(monitoringRuns.clientId, cycle.clientId),
        eq(monitoringRuns.monitorKey, "search_console"),
        inArray(monitoringRuns.status, ["SUCCEEDED", "PARTIAL"]),
        gte(monitoringRuns.completedAt, periodStart),
        lt(monitoringRuns.completedAt, periodEndExclusive),
      ),
    );
  const [failures] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(monitoringRuns)
    .where(
      and(
        eq(monitoringRuns.workspaceId, context.workspaceId),
        eq(monitoringRuns.clientId, cycle.clientId),
        inArray(monitoringRuns.status, ["FAILED", "BUDGET_LIMITED", "TIMED_OUT"]),
        gte(monitoringRuns.createdAt, periodStart),
        lt(monitoringRuns.createdAt, periodEndExclusive),
      ),
    );
  const [aiReadinessRechecks] = await tx
    .select({ count: sql<number>`count(distinct ${auditRuns.id})::int` })
    .from(auditRuns)
    .innerJoin(
      websites,
      and(
        eq(websites.workspaceId, auditRuns.workspaceId),
        eq(websites.id, auditRuns.websiteId),
      ),
    )
    .innerJoin(
      auditCheckResults,
      and(
        eq(auditCheckResults.workspaceId, auditRuns.workspaceId),
        eq(auditCheckResults.auditRunId, auditRuns.id),
      ),
    )
    .where(
      and(
        eq(auditRuns.workspaceId, context.workspaceId),
        eq(websites.clientId, cycle.clientId),
        inArray(auditRuns.status, ["SUCCEEDED", "PARTIAL"]),
        sql`${auditCheckResults.checkKey} like 'ai.%'`,
        gte(auditRuns.completedAt, periodStart),
        lt(auditRuns.completedAt, periodEndExclusive),
      ),
    );
  const [competitorTargetCount] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(competitorTargets)
    .where(
      and(
        eq(competitorTargets.workspaceId, context.workspaceId),
        eq(competitorTargets.clientId, cycle.clientId),
        eq(competitorTargets.active, true),
        isNull(competitorTargets.archivedAt),
      ),
    );
  const [competitorObservationCount] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(competitorObservations)
    .where(
      and(
        eq(competitorObservations.workspaceId, context.workspaceId),
        eq(competitorObservations.clientId, cycle.clientId),
        gte(competitorObservations.observedAt, periodStart),
        lt(competitorObservations.observedAt, periodEndExclusive),
      ),
    );
  const [competitorChanges] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(competitorObservations)
    .where(
      and(
        eq(competitorObservations.workspaceId, context.workspaceId),
        eq(competitorObservations.clientId, cycle.clientId),
        eq(competitorObservations.changedSincePrevious, true),
        gte(competitorObservations.observedAt, periodStart),
        lt(competitorObservations.observedAt, periodEndExclusive),
      ),
    );
  const [newOpportunityCount] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.workspaceId, context.workspaceId),
        eq(opportunities.clientId, cycle.clientId),
        gte(opportunities.createdAt, periodStart),
        lt(opportunities.createdAt, periodEndExclusive),
      ),
    );
  const [criticalRegressions] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.workspaceId, context.workspaceId),
        eq(opportunities.clientId, cycle.clientId),
        eq(opportunities.sourceSeverity, "CRITICAL"),
        inArray(opportunities.status, openOpportunityStatuses),
      ),
    );

  return {
    websiteHealthRuns: websiteHealthRuns?.count ?? 0,
    searchConsoleRuns: searchRuns?.count ?? 0,
    failures: failures?.count ?? 0,
    aiReadinessRechecks: aiReadinessRechecks?.count ?? 0,
    activeCompetitorTargets: competitorTargetCount?.count ?? 0,
    competitorObservations: competitorObservationCount?.count ?? 0,
    materialCompetitorMetadataChanges: competitorChanges?.count ?? 0,
    newOpportunities: newOpportunityCount?.count ?? 0,
    criticalRegressions: criticalRegressions?.count ?? 0,
  };
}

async function syncOperationalDeliverablesForCycle(
  tx: MonthlyTransaction,
  context: Pick<WorkspaceContext, "workspaceId">,
  cycle: typeof monthlyCycles.$inferSelect,
) {
  const summary = await monthlyCycleMonitoringSummary(tx, context, cycle);
  const searchConsoleConnected = await hasConnectedSearchConsole(
    tx,
    context,
    cycle.websiteId,
  );

  await updateCountedDeliverable(tx, context, cycle.id, {
    key: "website_health",
    completedCount: summary.websiteHealthRuns,
  });

  if (!searchConsoleConnected) {
    await tx
      .update(monthlyCycleDeliverables)
      .set({
        status: "BLOCKED",
        completedCount: 0,
        limitations: { code: "SEARCH_CONSOLE_NOT_CONNECTED" },
        updatedAt: now(),
      })
      .where(
        and(
          eq(monthlyCycleDeliverables.workspaceId, context.workspaceId),
          eq(monthlyCycleDeliverables.monthlyCycleId, cycle.id),
          eq(monthlyCycleDeliverables.deliverableKey, "search_console"),
          sql`${monthlyCycleDeliverables.status} <> 'WAIVED'`,
        ),
      );
  } else {
    await tx
      .update(monthlyCycleDeliverables)
      .set({ status: "NOT_STARTED", limitations: {}, updatedAt: now() })
      .where(
        and(
          eq(monthlyCycleDeliverables.workspaceId, context.workspaceId),
          eq(monthlyCycleDeliverables.monthlyCycleId, cycle.id),
          eq(monthlyCycleDeliverables.deliverableKey, "search_console"),
          eq(monthlyCycleDeliverables.status, "BLOCKED"),
        ),
      );
    await updateCountedDeliverable(tx, context, cycle.id, {
      key: "search_console",
      completedCount: summary.searchConsoleRuns,
    });
  }

  await updateCountedDeliverable(tx, context, cycle.id, {
    key: "competitor_review",
    completedCount: summary.competitorObservations > 0 ? 1 : 0,
  });
  await updateCountedDeliverable(tx, context, cycle.id, {
    key: "ai_readiness_recheck",
    completedCount: summary.aiReadinessRechecks > 0 ? 1 : 0,
  });

  return { ...summary, searchConsoleConnected };
}

async function insertCycleDeliverables(
  tx: MonthlyTransaction,
  context: WorkspaceContext,
  cycle: typeof monthlyCycles.$inferSelect,
  searchConsoleConnected: boolean,
) {
  const templates = buildMonthlyDeliverableTemplates({
    snapshot: cycle.entitlementSnapshot as MonthlyEntitlementSnapshot,
    period: { month: cycle.cycleMonth },
    searchConsoleConnected,
    observedAiVisibilityEnabled: false,
  });

  for (const template of templates) {
    await tx
      .insert(monthlyCycleDeliverables)
      .values({
        workspaceId: context.workspaceId,
        monthlyCycleId: cycle.id,
        clientId: cycle.clientId,
        websiteId: cycle.websiteId,
        deliverableKey: template.key,
        deliverableType: template.type,
        title: template.title,
        status: template.status,
        entitlementSourceRule: template.entitlementSourceRule,
        servicePlanVersion: template.servicePlanVersion,
        targetCount: template.targetCount,
        completedCount: template.completedCount,
        consumesEntitlement: template.consumesEntitlement,
        entitlementType: template.entitlementType,
        entitlementUnits: template.entitlementUnits,
        limitations: template.limitations,
      })
      .onConflictDoNothing();
  }
}

export async function createMonthlyCycle(
  context: WorkspaceContext,
  input: {
    clientId: string;
    year?: number;
    month?: number;
    timezone?: string;
    notes?: string | null;
  },
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN"]);

  const period =
    input.year && input.month
      ? monthlyPeriod(input.year, input.month)
      : monthlyPeriodForDate(now());
  const timezone = optionalString(input.timezone) ?? "America/Denver";

  return withTenantContext(database, context, async (tx) => {
    const [client] = await tx
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.workspaceId, context.workspaceId),
          eq(clients.id, input.clientId),
          isNull(clients.archivedAt),
        ),
      )
      .limit(1);

    if (!client) {
      throw new Error("Client was not found.");
    }

    if (!shouldCreateRecurringMonthlyCycle(client.servicePlan as ServicePlanKey)) {
      throw new Error(
        `${client.servicePlan} does not create recurring monthly fulfillment cycles.`,
      );
    }

    const website = await findPrimaryWebsite(tx, context, client.id);
    const snapshot = buildMonthlyEntitlementSnapshot(
      client.servicePlan as ServicePlanKey,
      client.servicePlanVersion,
    );
    const [inserted] = await tx
      .insert(monthlyCycles)
      .values({
        workspaceId: context.workspaceId,
        clientId: client.id,
        websiteId: website?.id,
        servicePlan: client.servicePlan,
        servicePlanVersion: client.servicePlanVersion,
        cycleYear: period.year,
        cycleMonth: period.month,
        periodStartDate: period.startDate,
        periodEndDate: period.endDate,
        timezone,
        status: "OPEN",
        creationSource: "MANUAL",
        dueAt: cycleDueAt(period),
        createdByUserId: context.userId,
        entitlementSnapshot: snapshot,
        notes: optionalString(input.notes),
      })
      .onConflictDoNothing()
      .returning();
    const cycle =
      inserted ??
      (
        await tx
          .select()
          .from(monthlyCycles)
          .where(
            and(
              eq(monthlyCycles.workspaceId, context.workspaceId),
              eq(monthlyCycles.clientId, client.id),
              eq(monthlyCycles.cycleYear, period.year),
              eq(monthlyCycles.cycleMonth, period.month),
            ),
          )
          .limit(1)
      )[0];

    if (!cycle) {
      throw new Error("Monthly cycle could not be created.");
    }

    const searchConsoleConnected = await hasConnectedSearchConsole(
      tx,
      context,
      cycle.websiteId,
    );
    await insertCycleDeliverables(tx, context, cycle, searchConsoleConnected);

    if (inserted) {
      await recordActivity(tx, context, "monthly_cycle.created", "monthly_cycle", cycle.id, {
        clientId: client.id,
        servicePlan: cycle.servicePlan,
        servicePlanVersion: cycle.servicePlanVersion,
        period: `${period.year}-${String(period.month).padStart(2, "0")}`,
      });
      await selectWorkForCycle(tx, context, cycle.id);
      await refreshMonthlyCycleAccounting(tx, context, cycle.id);
    }

    return cycle;
  });
}

export async function createScheduledMonthlyCycle(
  workspaceId: string,
  clientId: string,
  input: { year?: number; month?: number } = {},
  database = db,
) {
  const context: WorkspaceContext = {
    workspaceId,
    actorType: "SYSTEM",
    role: "ADMIN",
    correlationId: `monthly-cycle:${clientId}:${input.year ?? "current"}:${input.month ?? "current"}`,
  };
  const period =
    input.year && input.month
      ? monthlyPeriod(input.year, input.month)
      : monthlyPeriodForDate(now());

  return withTenantContext(database, context, async (tx) => {
    const [client] = await tx
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.workspaceId, workspaceId),
          eq(clients.id, clientId),
          eq(clients.status, "ACTIVE"),
          isNull(clients.archivedAt),
        ),
      )
      .limit(1);

    if (!client || !shouldCreateRecurringMonthlyCycle(client.servicePlan as ServicePlanKey)) {
      return { monthlyCycleId: null, created: false, skipped: true };
    }

    const website = await findPrimaryWebsite(tx, context, client.id);
    const snapshot = buildMonthlyEntitlementSnapshot(
      client.servicePlan as ServicePlanKey,
      client.servicePlanVersion,
    );
    const [inserted] = await tx
      .insert(monthlyCycles)
      .values({
        workspaceId,
        clientId: client.id,
        websiteId: website?.id,
        servicePlan: client.servicePlan,
        servicePlanVersion: client.servicePlanVersion,
        cycleYear: period.year,
        cycleMonth: period.month,
        periodStartDate: period.startDate,
        periodEndDate: period.endDate,
        timezone: "America/Denver",
        status: "OPEN",
        creationSource: "SYSTEM",
        dueAt: cycleDueAt(period),
        entitlementSnapshot: snapshot,
      })
      .onConflictDoNothing()
      .returning();

    if (!inserted) {
      const [existing] = await tx
        .select({ id: monthlyCycles.id })
        .from(monthlyCycles)
        .where(
          and(
            eq(monthlyCycles.workspaceId, workspaceId),
            eq(monthlyCycles.clientId, client.id),
            eq(monthlyCycles.cycleYear, period.year),
            eq(monthlyCycles.cycleMonth, period.month),
          ),
        )
        .limit(1);

      return { monthlyCycleId: existing?.id ?? null, created: false, skipped: false };
    }

    const searchConsoleConnected = await hasConnectedSearchConsole(
      tx,
      context,
      inserted.websiteId,
    );
    await insertCycleDeliverables(tx, context, inserted, searchConsoleConnected);
    await recordActivity(
      tx,
      context,
      "monthly_cycle.created",
      "monthly_cycle",
      inserted.id,
      {
        clientId: client.id,
        servicePlan: inserted.servicePlan,
        servicePlanVersion: inserted.servicePlanVersion,
        source: "scheduled",
      },
    );
    await selectWorkForCycle(tx, context, inserted.id);
    await refreshMonthlyCycleAccounting(tx, context, inserted.id);

    return { monthlyCycleId: inserted.id, created: true, skipped: false };
  });
}

async function latestPrepareStateSelect(
  tx: MonthlyTransaction,
  context: Pick<WorkspaceContext, "workspaceId">,
  opportunityIds: string[],
) {
  if (opportunityIds.length === 0) {
    return new Map<string, { draftState: string; approvalState: string }>();
  }

  const artifacts = await tx
    .selectDistinctOn([draftArtifacts.opportunityId], {
      opportunityId: draftArtifacts.opportunityId,
      status: draftArtifacts.status,
      id: draftArtifacts.id,
      artifactVersion: draftArtifacts.artifactVersion,
    })
    .from(draftArtifacts)
    .where(
      and(
        eq(draftArtifacts.workspaceId, context.workspaceId),
        inArray(draftArtifacts.opportunityId, opportunityIds),
      ),
    )
    .orderBy(draftArtifacts.opportunityId, desc(draftArtifacts.artifactVersion));
  const approvals =
    artifacts.length > 0
      ? await tx
          .select()
          .from(approvalRequests)
          .where(
            and(
              eq(approvalRequests.workspaceId, context.workspaceId),
              inArray(
                approvalRequests.targetArtifactId,
                artifacts.map((artifact) => artifact.id),
              ),
            ),
          )
      : [];
  const approvalByArtifact = new Map(
    approvals.map((approval) => [approval.targetArtifactId, approval]),
  );

  return new Map(
    artifacts
      .filter((artifact) => Boolean(artifact.opportunityId))
      .map((artifact) => {
        const approval = approvalByArtifact.get(artifact.id);
        return [
          artifact.opportunityId as string,
          {
            draftState: artifact.status,
            approvalState: approval?.status ?? "NOT_REQUESTED",
          },
        ] as const;
      }),
  );
}

function candidateFromOpportunity(
  row: typeof opportunities.$inferSelect,
): MonthlySelectionCandidate {
  return {
    id: row.id,
    status: row.status,
    sourceSeverity: row.sourceSeverity,
    priorityBand: row.priorityBand,
    planScope: row.planScope,
    finalPriority: row.finalPriority,
    effort: row.effort,
    createdAt: row.createdAt,
    normalizedRemediationFamily: row.normalizedRemediationFamily,
    category: row.category,
    approvalBlockedState: row.approvalBlockedState,
    dependencyState: row.dependencyState,
    clientInputState: row.clientInputState,
  };
}

async function selectWorkForCycle(
  tx: MonthlyTransaction,
  context: WorkspaceContext,
  monthlyCycleId: string,
) {
  const cycle = await loadCycle(tx, context, monthlyCycleId);
  assertCycleMutable(cycle.status);

  const candidates = await tx
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.workspaceId, context.workspaceId),
        eq(opportunities.clientId, cycle.clientId),
        inArray(opportunities.status, openOpportunityStatuses),
      ),
    );
  const selected = selectMonthlyWork({
    candidates: candidates.map(candidateFromOpportunity),
    snapshot: cycle.entitlementSnapshot as MonthlyEntitlementSnapshot,
    usage: {
      majorContentAssetsCompleted: cycle.majorContentAssetsCompleted,
      existingPageOptimizationsCompleted: cycle.existingPageOptimizationsCompleted,
    },
  });
  const deliverables = await tx
    .select()
    .from(monthlyCycleDeliverables)
    .where(
      and(
        eq(monthlyCycleDeliverables.workspaceId, context.workspaceId),
        eq(monthlyCycleDeliverables.monthlyCycleId, monthlyCycleId),
      ),
    );
  const deliverableByKey = new Map(
    deliverables.map((deliverable) => [deliverable.deliverableKey, deliverable]),
  );
  const prepareState = await latestPrepareStateSelect(
    tx,
    context,
    selected.map((item) => item.candidate.id),
  );
  let inserted = 0;

  for (const item of selected) {
    const opportunity = candidates.find((candidate) => candidate.id === item.candidate.id);
    const state = prepareState.get(item.candidate.id);

    if (!opportunity) continue;

    const [row] = await tx
      .insert(monthlyCycleWorkItems)
      .values({
        workspaceId: context.workspaceId,
        monthlyCycleId: cycle.id,
        clientId: cycle.clientId,
        websiteId: opportunity.websiteId,
        opportunityId: opportunity.id,
        deliverableId: item.contractualDeliverableKey
          ? deliverableByKey.get(item.contractualDeliverableKey)?.id
          : null,
        selectedReason: item.selectedReason,
        contractualDeliverableReason: item.contractualDeliverableReason,
        scopeFit: opportunity.planScope,
        consumesEntitlement: item.consumesEntitlement,
        entitlementType: item.entitlementType,
        entitlementUnits: item.entitlementUnits,
        estimatedEffort: opportunity.effort,
        status: opportunity.status === "BLOCKED" ? "BLOCKED" : "SELECTED",
        draftState: state?.draftState ?? "NOT_REQUESTED",
        approvalState: state?.approvalState ?? "NOT_REQUESTED",
        selectedByUserId: safeActorUser(context),
      })
      .onConflictDoNothing()
      .returning({ id: monthlyCycleWorkItems.id });

    if (row) inserted += 1;
  }

  if (inserted > 0) {
    await tx
      .update(monthlyCycles)
      .set({ status: "IN_PROGRESS", updatedAt: now() })
      .where(
        and(
          eq(monthlyCycles.workspaceId, context.workspaceId),
          eq(monthlyCycles.id, cycle.id),
        ),
      );
    await recordActivity(
      tx,
      context,
      "monthly_cycle.work_selected",
      "monthly_cycle",
      cycle.id,
      { selected: inserted },
    );
  }

  return { selected: inserted };
}

export async function selectMonthlyCycleWork(
  context: WorkspaceContext,
  monthlyCycleId: string,
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN", "ANALYST"]);

  return withTenantContext(database, context, async (tx) => {
    const result = await selectWorkForCycle(tx, context, monthlyCycleId);
    const cycle = await loadCycle(tx, context, monthlyCycleId);
    await syncOperationalDeliverablesForCycle(tx, context, cycle);
    await refreshMonthlyCycleAccounting(tx, context, monthlyCycleId);
    return result;
  });
}

export async function addOpportunityToMonthlyCycle(
  context: WorkspaceContext,
  monthlyCycleId: string,
  input: { opportunityId: string; reason: string },
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN", "ANALYST"]);
  const reason = input.reason.trim();

  if (!reason) {
    throw new Error("Manual selection reason is required.");
  }

  return withTenantContext(database, context, async (tx) => {
    const cycle = await loadCycle(tx, context, monthlyCycleId);
    assertCycleMutable(cycle.status);

    const [opportunity] = await tx
      .select()
      .from(opportunities)
      .where(
        and(
          eq(opportunities.workspaceId, context.workspaceId),
          eq(opportunities.clientId, cycle.clientId),
          eq(opportunities.id, input.opportunityId),
          inArray(opportunities.status, openOpportunityStatuses),
        ),
      )
      .limit(1);

    if (!opportunity) {
      throw new Error("Eligible Opportunity was not found for this cycle.");
    }

    const candidate = candidateFromOpportunity(opportunity);
    const entitlement = classifyMonthlyOpportunityEntitlement(candidate);
    const deliverables = await tx
      .select()
      .from(monthlyCycleDeliverables)
      .where(
        and(
          eq(monthlyCycleDeliverables.workspaceId, context.workspaceId),
          eq(monthlyCycleDeliverables.monthlyCycleId, monthlyCycleId),
        ),
      );
    const deliverable = entitlement
      ? deliverables.find((item) => item.deliverableKey === entitlement.deliverableKey)
      : null;
    const underLimit =
      entitlement?.entitlementType === "existing_page_optimizations_completed"
        ? cycle.existingPageOptimizationsCompleted <
          ((cycle.entitlementSnapshot as MonthlyEntitlementSnapshot).limits
            .existingPageOptimizations ?? 0)
        : entitlement?.entitlementType === "major_content_assets_completed"
          ? cycle.majorContentAssetsCompleted <
            ((cycle.entitlementSnapshot as MonthlyEntitlementSnapshot).limits
              .majorContentAssets ?? 0)
          : false;
    const consumesEntitlement =
      opportunity.planScope === "INCLUDED" && Boolean(entitlement) && underLimit;
    const state = (
      await latestPrepareStateSelect(tx, context, [opportunity.id])
    ).get(opportunity.id);
    const [workItem] = await tx
      .insert(monthlyCycleWorkItems)
      .values({
        workspaceId: context.workspaceId,
        monthlyCycleId: cycle.id,
        clientId: cycle.clientId,
        websiteId: opportunity.websiteId,
        opportunityId: opportunity.id,
        deliverableId: consumesEntitlement ? deliverable?.id : null,
        selectedReason: "manual override",
        contractualDeliverableReason: consumesEntitlement
          ? entitlement?.reason
          : null,
        scopeFit: opportunity.planScope,
        consumesEntitlement,
        entitlementType: consumesEntitlement ? entitlement?.entitlementType : null,
        entitlementUnits: consumesEntitlement ? 1 : 0,
        estimatedEffort: opportunity.effort,
        status: opportunity.status === "BLOCKED" ? "BLOCKED" : "SELECTED",
        draftState: state?.draftState ?? "NOT_REQUESTED",
        approvalState: state?.approvalState ?? "NOT_REQUESTED",
        selectedByUserId: context.userId,
        manualOverrideReason: reason,
      })
      .onConflictDoUpdate({
        target: [
          monthlyCycleWorkItems.workspaceId,
          monthlyCycleWorkItems.monthlyCycleId,
          monthlyCycleWorkItems.opportunityId,
        ],
        set: {
          status: opportunity.status === "BLOCKED" ? "BLOCKED" : "SELECTED",
          selectedReason: "manual override",
          manualOverrideReason: reason,
          removedAt: null,
          removedByUserId: null,
          removalReason: null,
          updatedAt: now(),
        },
      })
      .returning();

    await recordActivity(
      tx,
      context,
      "monthly_cycle.work_selected",
      "monthly_cycle_work_item",
      workItem.id,
      {
        monthlyCycleId: cycle.id,
        opportunityId: opportunity.id,
        reason,
        manualOverride: true,
      },
    );
    await refreshMonthlyCycleAccounting(tx, context, cycle.id);

    return workItem;
  });
}

export async function removeOpportunityFromMonthlyCycle(
  context: WorkspaceContext,
  cycleWorkItemId: string,
  input: { reason: string },
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN", "ANALYST"]);
  const reason = input.reason.trim();

  if (!reason) {
    throw new Error("Removal reason is required.");
  }

  return withTenantContext(database, context, async (tx) => {
    const [workItem] = await tx
      .update(monthlyCycleWorkItems)
      .set({
        status: "REMOVED",
        removedAt: now(),
        removedByUserId: context.userId,
        removalReason: reason,
        updatedAt: now(),
      })
      .where(
        and(
          eq(monthlyCycleWorkItems.workspaceId, context.workspaceId),
          eq(monthlyCycleWorkItems.id, cycleWorkItemId),
        ),
      )
      .returning();

    if (!workItem) {
      throw new Error("Cycle work item was not found.");
    }

    const cycle = await loadCycle(tx, context, workItem.monthlyCycleId);
    assertCycleMutable(cycle.status);

    await recordActivity(
      tx,
      context,
      "monthly_cycle.work_removed",
      "monthly_cycle_work_item",
      workItem.id,
      {
        monthlyCycleId: workItem.monthlyCycleId,
        opportunityId: workItem.opportunityId,
        reason,
      },
    );
    await refreshMonthlyCycleAccounting(tx, context, workItem.monthlyCycleId);

    return workItem;
  });
}

export async function recordManualImplementation(
  context: WorkspaceContext,
  cycleWorkItemId: string,
  input: {
    whatImplemented: string;
    implementationDate: string;
    manualMinutes: number;
    implementationNotes?: string | null;
    evidenceReference?: string | null;
  },
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN"]);

  const whatImplemented = input.whatImplemented.trim();

  if (!whatImplemented) {
    throw new Error("Implemented work summary is required.");
  }

  if (!Number.isInteger(input.manualMinutes) || input.manualMinutes < 0) {
    throw new Error("Manual minutes must be a non-negative integer.");
  }

  return withTenantContext(database, context, async (tx) => {
    const [workItem] = await tx
      .select()
      .from(monthlyCycleWorkItems)
      .where(
        and(
          eq(monthlyCycleWorkItems.workspaceId, context.workspaceId),
          eq(monthlyCycleWorkItems.id, cycleWorkItemId),
        ),
      )
      .limit(1);

    if (!workItem || workItem.status === "REMOVED") {
      throw new Error("Active cycle work item was not found.");
    }

    const cycle = await loadCycle(tx, context, workItem.monthlyCycleId);
    assertCycleMutable(cycle.status);

    const [artifact] = await tx
      .select()
      .from(draftArtifacts)
      .where(
        and(
          eq(draftArtifacts.workspaceId, context.workspaceId),
          eq(draftArtifacts.opportunityId, workItem.opportunityId),
          eq(draftArtifacts.status, "APPROVED"),
        ),
      )
      .orderBy(desc(draftArtifacts.artifactVersion))
      .limit(1);
    const [record] = await tx
      .insert(manualImplementationRecords)
      .values({
        workspaceId: context.workspaceId,
        monthlyCycleId: workItem.monthlyCycleId,
        cycleWorkItemId: workItem.id,
        clientId: workItem.clientId,
        websiteId: workItem.websiteId,
        opportunityId: workItem.opportunityId,
        artifactId: artifact?.id,
        artifactVersion: artifact?.artifactVersion,
        whatImplemented,
        implementationDate: input.implementationDate,
        manualMinutes: input.manualMinutes,
        implementationNotes: optionalString(input.implementationNotes),
        evidenceReference: optionalString(input.evidenceReference),
        qualifiesForPlan: workItem.scopeFit === "INCLUDED",
        implementedByUserId: context.userId,
        createdByUserId: context.userId,
      })
      .returning();

    await tx
      .update(monthlyCycleWorkItems)
      .set({
        status: "IN_PROGRESS",
        completionState: "IMPLEMENTED_UNVERIFIED",
        manualImplementationMinutes:
          workItem.manualImplementationMinutes + input.manualMinutes,
        draftState: artifact?.status ?? workItem.draftState,
        approvalState: artifact ? "APPROVED" : workItem.approvalState,
        updatedAt: now(),
      })
      .where(
        and(
          eq(monthlyCycleWorkItems.workspaceId, context.workspaceId),
          eq(monthlyCycleWorkItems.id, workItem.id),
        ),
      );

    await recordActivity(
      tx,
      context,
      "implementation.recorded",
      "manual_implementation_record",
      record.id,
      {
        monthlyCycleId: workItem.monthlyCycleId,
        opportunityId: workItem.opportunityId,
        manualMinutes: input.manualMinutes,
        verified: false,
      },
    );
    await refreshMonthlyCycleAccounting(tx, context, workItem.monthlyCycleId);

    return record;
  });
}

export async function recordImplementationVerification(
  context: WorkspaceContext,
  cycleWorkItemId: string,
  input: {
    status: "VERIFIED" | "VERIFICATION_WARNING" | "VERIFICATION_FAILED";
    verificationMethod: string;
    evidence: string;
    limitations?: string | null;
  },
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN", "ANALYST"]);
  const verificationMethod = input.verificationMethod.trim();
  const evidenceText = input.evidence.trim();

  if (!verificationMethod || !evidenceText) {
    throw new Error("Verification method and evidence are required.");
  }

  return withTenantContext(database, context, async (tx) => {
    const [workItem] = await tx
      .select()
      .from(monthlyCycleWorkItems)
      .where(
        and(
          eq(monthlyCycleWorkItems.workspaceId, context.workspaceId),
          eq(monthlyCycleWorkItems.id, cycleWorkItemId),
        ),
      )
      .limit(1);

    if (!workItem || workItem.status === "REMOVED") {
      throw new Error("Active cycle work item was not found.");
    }

    const cycle = await loadCycle(tx, context, workItem.monthlyCycleId);
    assertCycleMutable(cycle.status);

    const [implementation] = await tx
      .select()
      .from(manualImplementationRecords)
      .where(
        and(
          eq(manualImplementationRecords.workspaceId, context.workspaceId),
          eq(manualImplementationRecords.cycleWorkItemId, workItem.id),
        ),
      )
      .orderBy(desc(manualImplementationRecords.createdAt))
      .limit(1);

    const [record] = await tx
      .insert(implementationVerificationRecords)
      .values({
        workspaceId: context.workspaceId,
        monthlyCycleId: workItem.monthlyCycleId,
        cycleWorkItemId: workItem.id,
        implementationRecordId: implementation?.id,
        clientId: workItem.clientId,
        websiteId: workItem.websiteId,
        opportunityId: workItem.opportunityId,
        status: input.status,
        verificationMethod,
        evidence: { summary: evidenceText },
        limitations: optionalString(input.limitations)
          ? { summary: optionalString(input.limitations) }
          : {},
        verifiedByUserId: context.userId,
      })
      .returning();
    const nextStatus =
      input.status === "VERIFIED"
        ? "COMPLETED"
        : input.status === "VERIFICATION_FAILED"
          ? "BLOCKED"
          : "IN_PROGRESS";

    await tx
      .update(monthlyCycleWorkItems)
      .set({
        status: nextStatus,
        completionState: input.status,
        updatedAt: now(),
      })
      .where(
        and(
          eq(monthlyCycleWorkItems.workspaceId, context.workspaceId),
          eq(monthlyCycleWorkItems.id, workItem.id),
        ),
      );

    if (input.status === "VERIFIED") {
      await tx
        .update(opportunities)
        .set({ status: "COMPLETED", completedAt: now(), closedAt: now(), updatedAt: now() })
        .where(
          and(
            eq(opportunities.workspaceId, context.workspaceId),
            eq(opportunities.id, workItem.opportunityId),
          ),
        );
    }

    await recordActivity(
      tx,
      context,
      "verification.recorded",
      "implementation_verification_record",
      record.id,
      {
        monthlyCycleId: workItem.monthlyCycleId,
        opportunityId: workItem.opportunityId,
        status: input.status,
        method: verificationMethod,
      },
    );
    await refreshMonthlyCycleAccounting(tx, context, workItem.monthlyCycleId);

    return record;
  });
}

async function reportDataForCycle(
  tx: MonthlyTransaction,
  context: WorkspaceContext,
  cycle: typeof monthlyCycles.$inferSelect,
) {
  const [client] = await tx
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(
      and(
        eq(clients.workspaceId, context.workspaceId),
        eq(clients.id, cycle.clientId),
      ),
    )
    .limit(1);

  if (!client) {
    throw new Error("Client was not found.");
  }

  const periodStart = dateStart(cycle.periodStartDate);
  const periodEndExclusive = dayAfter(cycle.periodEndDate);
  const deliverables = await tx
    .select()
    .from(monthlyCycleDeliverables)
    .where(
      and(
        eq(monthlyCycleDeliverables.workspaceId, context.workspaceId),
        eq(monthlyCycleDeliverables.monthlyCycleId, cycle.id),
      ),
    )
    .orderBy(asc(monthlyCycleDeliverables.createdAt));
  const workRows = await tx
    .select({
      item: monthlyCycleWorkItems,
      opportunityTitle: opportunities.title,
    })
    .from(monthlyCycleWorkItems)
    .innerJoin(
      opportunities,
      and(
        eq(opportunities.workspaceId, monthlyCycleWorkItems.workspaceId),
        eq(opportunities.id, monthlyCycleWorkItems.opportunityId),
      ),
    )
    .where(
      and(
        eq(monthlyCycleWorkItems.workspaceId, context.workspaceId),
        eq(monthlyCycleWorkItems.monthlyCycleId, cycle.id),
        sql`${monthlyCycleWorkItems.status} <> 'REMOVED'`,
      ),
    );
  const [websiteHealthRuns] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(monitoringRuns)
    .where(
      and(
        eq(monitoringRuns.workspaceId, context.workspaceId),
        eq(monitoringRuns.clientId, cycle.clientId),
        eq(monitoringRuns.monitorKey, "website_health"),
        inArray(monitoringRuns.status, ["SUCCEEDED", "PARTIAL"]),
        gte(monitoringRuns.completedAt, periodStart),
        lt(monitoringRuns.completedAt, periodEndExclusive),
      ),
    );
  const [searchRuns] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(monitoringRuns)
    .where(
      and(
        eq(monitoringRuns.workspaceId, context.workspaceId),
        eq(monitoringRuns.clientId, cycle.clientId),
        eq(monitoringRuns.monitorKey, "search_console"),
        inArray(monitoringRuns.status, ["SUCCEEDED", "PARTIAL"]),
        gte(monitoringRuns.completedAt, periodStart),
        lt(monitoringRuns.completedAt, periodEndExclusive),
      ),
    );
  const [failures] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(monitoringRuns)
    .where(
      and(
        eq(monitoringRuns.workspaceId, context.workspaceId),
        eq(monitoringRuns.clientId, cycle.clientId),
        inArray(monitoringRuns.status, ["FAILED", "BUDGET_LIMITED", "TIMED_OUT"]),
        gte(monitoringRuns.createdAt, periodStart),
        lt(monitoringRuns.createdAt, periodEndExclusive),
      ),
    );
  const [competitorTargetCount] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(competitorTargets)
    .where(
      and(
        eq(competitorTargets.workspaceId, context.workspaceId),
        eq(competitorTargets.clientId, cycle.clientId),
        eq(competitorTargets.active, true),
        isNull(competitorTargets.archivedAt),
      ),
    );
  const [competitorObservationCount] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(competitorObservations)
    .where(
      and(
        eq(competitorObservations.workspaceId, context.workspaceId),
        eq(competitorObservations.clientId, cycle.clientId),
        gte(competitorObservations.observedAt, periodStart),
        lt(competitorObservations.observedAt, periodEndExclusive),
      ),
    );
  const [competitorChanges] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(competitorObservations)
    .where(
      and(
        eq(competitorObservations.workspaceId, context.workspaceId),
        eq(competitorObservations.clientId, cycle.clientId),
        eq(competitorObservations.changedSincePrevious, true),
        gte(competitorObservations.observedAt, periodStart),
        lt(competitorObservations.observedAt, periodEndExclusive),
      ),
    );
  const [newOpportunityCount] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.workspaceId, context.workspaceId),
        eq(opportunities.clientId, cycle.clientId),
        gte(opportunities.createdAt, periodStart),
        lt(opportunities.createdAt, periodEndExclusive),
      ),
    );
  const unresolvedRisks = await tx
    .select({
      title: opportunities.title,
      severity: opportunities.sourceSeverity,
      priority: opportunities.finalPriority,
    })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.workspaceId, context.workspaceId),
        eq(opportunities.clientId, cycle.clientId),
        inArray(opportunities.status, openOpportunityStatuses),
      ),
    )
    .orderBy(desc(opportunities.finalPriority))
    .limit(10);
  const searchConsoleDeliverable = deliverables.find(
    (deliverable) => deliverable.deliverableKey === "search_console",
  );

  return buildMonthlyReportDraft({
    cycle: {
      id: cycle.id,
      clientName: client.name,
      servicePlan: cycle.servicePlan,
      servicePlanVersion: cycle.servicePlanVersion,
      periodStartDate: cycle.periodStartDate,
      periodEndDate: cycle.periodEndDate,
      timezone: cycle.timezone,
      entitlementSnapshot: cycle.entitlementSnapshot as MonthlyEntitlementSnapshot,
    },
    deliverables: deliverables.map((deliverable) => ({
      title: deliverable.title,
      status: deliverable.status,
      targetCount: deliverable.targetCount,
      completedCount: deliverable.completedCount,
      entitlementSourceRule: deliverable.entitlementSourceRule,
      limitations: deliverable.limitations,
      waiverReason: deliverable.waiverReason,
    })),
    workItems: workRows.map((row) => ({
      title: row.opportunityTitle,
      status: row.item.status,
      completionState: row.item.completionState,
      selectedReason: row.item.selectedReason,
      entitlementType: row.item.entitlementType,
      entitlementUnits: row.item.entitlementUnits,
      manualImplementationMinutes: row.item.manualImplementationMinutes,
      verificationStatus:
        row.item.completionState.startsWith("VERIFICATION") ||
        row.item.completionState === "VERIFIED"
          ? row.item.completionState
          : null,
    })),
    monitoring: {
      websiteHealthRuns: websiteHealthRuns?.count ?? 0,
      searchConsoleRuns: searchRuns?.count ?? 0,
      searchConsoleUnavailable:
        searchConsoleDeliverable?.status === "BLOCKED" ||
        searchConsoleDeliverable?.status === "UNAVAILABLE",
      failures: failures?.count ?? 0,
      newOpportunities: newOpportunityCount?.count ?? 0,
      criticalRegressions: unresolvedRisks.filter(
        (risk) => risk.severity === "CRITICAL",
      ).length,
    },
    competitor: {
      activeTargets: competitorTargetCount?.count ?? 0,
      observations: competitorObservationCount?.count ?? 0,
      materialMetadataChanges: competitorChanges?.count ?? 0,
      limitations: ["Rank/keyword provider is not active in this phase."],
    },
    unresolvedRisks,
  });
}

export async function generateMonthlyReportDraft(
  context: WorkspaceContext,
  monthlyCycleId: string,
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN", "ANALYST"]);

  return withTenantContext(database, context, async (tx) => {
    const cycle = await loadCycle(tx, context, monthlyCycleId);
    await syncOperationalDeliverablesForCycle(tx, context, cycle);
    const built = await reportDataForCycle(tx, context, cycle);
    const [existing] = await tx
      .select()
      .from(monthlyReports)
      .where(
        and(
          eq(monthlyReports.workspaceId, context.workspaceId),
          eq(monthlyReports.monthlyCycleId, cycle.id),
        ),
      )
      .limit(1);

    if (existing?.status === "FINALIZED") {
      return existing;
    }

    const values = {
      workspaceId: context.workspaceId,
      monthlyCycleId: cycle.id,
      clientId: cycle.clientId,
      status: "DRAFT" as const,
      title: built.title,
      executiveSummary: built.executiveSummary,
      methodologyVersion: built.methodologyVersion,
      reportPeriodStartDate: cycle.periodStartDate,
      reportPeriodEndDate: cycle.periodEndDate,
      timezone: cycle.timezone,
      servicePlan: cycle.servicePlan,
      servicePlanVersion: cycle.servicePlanVersion,
      planSnapshot: cycle.entitlementSnapshot,
      sourceWindows: built.sourceWindows,
      sections: built.sections,
      dataLimitations: built.dataLimitations,
      createdByUserId: context.userId,
      updatedAt: now(),
    };
    const [report] = existing
      ? await tx
          .update(monthlyReports)
          .set(values)
          .where(
            and(
              eq(monthlyReports.workspaceId, context.workspaceId),
              eq(monthlyReports.id, existing.id),
            ),
          )
          .returning()
      : await tx.insert(monthlyReports).values(values).returning();

    await tx
      .update(monthlyCycleDeliverables)
      .set({ status: "READY_FOR_REVIEW", completedCount: 0, updatedAt: now() })
      .where(
        and(
          eq(monthlyCycleDeliverables.workspaceId, context.workspaceId),
          eq(monthlyCycleDeliverables.monthlyCycleId, cycle.id),
          eq(monthlyCycleDeliverables.deliverableKey, "monthly_report"),
          sql`${monthlyCycleDeliverables.status} <> 'WAIVED'`,
        ),
      );
    await recordActivity(
      tx,
      context,
      "monthly_report.created",
      "monthly_report",
      report.id,
      { monthlyCycleId: cycle.id, deterministic: true },
    );

    return report;
  });
}

export async function finalizeMonthlyReport(
  context: WorkspaceContext,
  monthlyReportId: string,
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN"]);

  return withTenantContext(database, context, async (tx) => {
    const [current] = await tx
      .select()
      .from(monthlyReports)
      .where(
        and(
          eq(monthlyReports.workspaceId, context.workspaceId),
          eq(monthlyReports.id, monthlyReportId),
        ),
      )
      .limit(1);

    if (!current) {
      throw new Error("Monthly report was not found.");
    }

    if (current.status === "FINALIZED") {
      return current;
    }

    const finalizedAt = now();
    const immutableSnapshot = {
      id: current.id,
      monthlyCycleId: current.monthlyCycleId,
      title: current.title,
      executiveSummary: current.executiveSummary,
      methodologyVersion: current.methodologyVersion,
      period: {
        startDate: current.reportPeriodStartDate,
        endDate: current.reportPeriodEndDate,
        timezone: current.timezone,
      },
      servicePlan: current.servicePlan,
      servicePlanVersion: current.servicePlanVersion,
      planSnapshot: current.planSnapshot,
      sourceWindows: current.sourceWindows,
      sections: current.sections,
      dataLimitations: current.dataLimitations,
      finalizedAt: finalizedAt.toISOString(),
      finalizedByUserId: context.userId,
    };
    const [report] = await tx
      .update(monthlyReports)
      .set({
        status: "FINALIZED",
        immutableSnapshot,
        snapshotHash: monthlyReportSnapshotHash(immutableSnapshot),
        finalizedAt,
        finalizedByUserId: context.userId,
        updatedAt: finalizedAt,
      })
      .where(
        and(
          eq(monthlyReports.workspaceId, context.workspaceId),
          eq(monthlyReports.id, current.id),
        ),
      )
      .returning();

    await tx
      .update(monthlyCycleDeliverables)
      .set({
        status: "COMPLETE",
        completedCount: 1,
        completedAt: finalizedAt,
        completedByUserId: context.userId,
        updatedAt: finalizedAt,
      })
      .where(
        and(
          eq(monthlyCycleDeliverables.workspaceId, context.workspaceId),
          eq(monthlyCycleDeliverables.monthlyCycleId, current.monthlyCycleId),
          eq(monthlyCycleDeliverables.deliverableKey, "monthly_report"),
        ),
      );
    await recordActivity(
      tx,
      context,
      "monthly_report.finalized",
      "monthly_report",
      report.id,
      {
        monthlyCycleId: current.monthlyCycleId,
        snapshotHash: report.snapshotHash,
      },
    );

    return report;
  });
}

const deliverableUpdateStatuses = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "BLOCKED",
  "READY_FOR_REVIEW",
  "COMPLETE",
  "UNAVAILABLE",
  "NOT_APPLICABLE",
] as const;

export async function updateMonthlyDeliverableStatus(
  context: WorkspaceContext,
  deliverableId: string,
  input: {
    status: (typeof deliverableUpdateStatuses)[number];
    completedCount?: number;
    completionEvidence?: string | null;
    limitations?: string | null;
  },
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN", "ANALYST"]);

  if (!deliverableUpdateStatuses.includes(input.status)) {
    throw new Error("Deliverable status is not valid for this update.");
  }

  if (
    input.completedCount !== undefined &&
    (!Number.isInteger(input.completedCount) || input.completedCount < 0)
  ) {
    throw new Error("Completed count must be a non-negative integer.");
  }

  return withTenantContext(database, context, async (tx) => {
    const [current] = await tx
      .select()
      .from(monthlyCycleDeliverables)
      .where(
        and(
          eq(monthlyCycleDeliverables.workspaceId, context.workspaceId),
          eq(monthlyCycleDeliverables.id, deliverableId),
        ),
      )
      .limit(1);

    if (!current) {
      throw new Error("Deliverable was not found.");
    }

    if (current.status === "WAIVED") {
      throw new Error("Waived deliverables require a new waiver decision.");
    }

    const cycle = await loadCycle(tx, context, current.monthlyCycleId);
    assertCycleMutable(cycle.status);

    const completedAt = input.status === "COMPLETE" ? now() : null;
    const completedCount =
      input.status === "COMPLETE"
        ? Math.max(input.completedCount ?? current.completedCount, current.targetCount)
        : (input.completedCount ?? current.completedCount);
    const [deliverable] = await tx
      .update(monthlyCycleDeliverables)
      .set({
        status: input.status,
        completedCount,
        completionEvidence: optionalString(input.completionEvidence)
          ? { summary: optionalString(input.completionEvidence) }
          : current.completionEvidence,
        limitations: optionalString(input.limitations)
          ? { summary: optionalString(input.limitations) }
          : current.limitations,
        completedAt,
        completedByUserId:
          input.status === "COMPLETE" ? context.userId : current.completedByUserId,
        updatedAt: now(),
      })
      .where(
        and(
          eq(monthlyCycleDeliverables.workspaceId, context.workspaceId),
          eq(monthlyCycleDeliverables.id, current.id),
        ),
      )
      .returning();

    await recordActivity(
      tx,
      context,
      "monthly_cycle.deliverable_updated",
      "monthly_cycle_deliverable",
      deliverable.id,
      {
        monthlyCycleId: deliverable.monthlyCycleId,
        deliverableKey: deliverable.deliverableKey,
        status: deliverable.status,
        completedCount: deliverable.completedCount,
      },
    );

    return deliverable;
  });
}

export async function waiveMonthlyDeliverable(
  context: WorkspaceContext,
  deliverableId: string,
  input: { reason: string },
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN"]);
  const reason = input.reason.trim();

  if (!reason) {
    throw new Error("Waiver reason is required.");
  }

  return withTenantContext(database, context, async (tx) => {
    const [currentDeliverable] = await tx
      .select()
      .from(monthlyCycleDeliverables)
      .where(
        and(
          eq(monthlyCycleDeliverables.workspaceId, context.workspaceId),
          eq(monthlyCycleDeliverables.id, deliverableId),
        ),
      )
      .limit(1);

    if (!currentDeliverable) {
      throw new Error("Deliverable was not found.");
    }

    const cycle = await loadCycle(tx, context, currentDeliverable.monthlyCycleId);
    assertCycleMutable(cycle.status);

    const [deliverable] = await tx
      .update(monthlyCycleDeliverables)
      .set({
        status: "WAIVED",
        waivedAt: now(),
        waivedByUserId: context.userId,
        waiverReason: reason,
        updatedAt: now(),
      })
      .where(
        and(
          eq(monthlyCycleDeliverables.workspaceId, context.workspaceId),
          eq(monthlyCycleDeliverables.id, deliverableId),
        ),
      )
      .returning();

    if (!deliverable) {
      throw new Error("Deliverable was not found.");
    }

    await recordActivity(
      tx,
      context,
      "monthly_cycle.waiver_recorded",
      "monthly_cycle_deliverable",
      deliverable.id,
      {
        monthlyCycleId: deliverable.monthlyCycleId,
        deliverableKey: deliverable.deliverableKey,
        reason,
      },
    );

    return deliverable;
  });
}

export async function closeMonthlyCycle(
  context: WorkspaceContext,
  monthlyCycleId: string,
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN"]);

  return withTenantContext(database, context, async (tx) => {
    const cycle = await loadCycle(tx, context, monthlyCycleId);
    assertCycleMutable(cycle.status);
    await syncOperationalDeliverablesForCycle(tx, context, cycle);

    const deliverables = await tx
      .select()
      .from(monthlyCycleDeliverables)
      .where(
        and(
          eq(monthlyCycleDeliverables.workspaceId, context.workspaceId),
          eq(monthlyCycleDeliverables.monthlyCycleId, cycle.id),
        ),
      );
    const blockingDeliverables = deliverables.filter(
      (deliverable) =>
        ![
          "COMPLETE",
          "UNAVAILABLE",
          "NOT_APPLICABLE",
          "WAIVED",
        ].includes(deliverable.status),
    );
    const [finalizedReport] = await tx
      .select()
      .from(monthlyReports)
      .where(
        and(
          eq(monthlyReports.workspaceId, context.workspaceId),
          eq(monthlyReports.monthlyCycleId, cycle.id),
          eq(monthlyReports.status, "FINALIZED"),
        ),
      )
      .limit(1);
    const [hiddenCritical] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(opportunities)
      .leftJoin(
        monthlyCycleWorkItems,
        and(
          eq(monthlyCycleWorkItems.workspaceId, opportunities.workspaceId),
          eq(monthlyCycleWorkItems.opportunityId, opportunities.id),
          eq(monthlyCycleWorkItems.monthlyCycleId, cycle.id),
          sql`${monthlyCycleWorkItems.status} <> 'REMOVED'`,
        ),
      )
      .where(
        and(
          eq(opportunities.workspaceId, context.workspaceId),
          eq(opportunities.clientId, cycle.clientId),
          eq(opportunities.sourceSeverity, "CRITICAL"),
          inArray(opportunities.status, openOpportunityStatuses),
          sql`${monthlyCycleWorkItems.id} is null`,
        ),
      );

    if (blockingDeliverables.length > 0) {
      await tx
        .update(monthlyCycles)
        .set({ status: "REVIEW_REQUIRED", updatedAt: now() })
        .where(
          and(
            eq(monthlyCycles.workspaceId, context.workspaceId),
            eq(monthlyCycles.id, cycle.id),
          ),
        );
      throw new Error("Cycle has unfinished or blocked deliverables.");
    }

    if (!finalizedReport) {
      throw new Error("Cycle requires a finalized monthly report before close.");
    }

    if ((hiddenCritical?.count ?? 0) > 0) {
      throw new Error("Cycle cannot close while unresolved CRITICAL work is hidden.");
    }

    const closedAt = now();
    const [closed] = await tx
      .update(monthlyCycles)
      .set({ status: "CLOSED", closedAt, updatedAt: closedAt })
      .where(
        and(
          eq(monthlyCycles.workspaceId, context.workspaceId),
          eq(monthlyCycles.id, cycle.id),
        ),
      )
      .returning();

    await recordActivity(tx, context, "monthly_cycle.closed", "monthly_cycle", closed.id, {
      finalizedReportId: finalizedReport.id,
    });

    return closed;
  });
}

export async function getMonthlyCycleDetail(
  context: WorkspaceContext,
  monthlyCycleId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [header] = await tx
      .select({
        cycle: monthlyCycles,
        clientName: clients.name,
        websiteName: websites.displayName,
        websiteDomain: websites.domain,
      })
      .from(monthlyCycles)
      .innerJoin(
        clients,
        and(
          eq(clients.workspaceId, monthlyCycles.workspaceId),
          eq(clients.id, monthlyCycles.clientId),
        ),
      )
      .leftJoin(
        websites,
        and(
          eq(websites.workspaceId, monthlyCycles.workspaceId),
          eq(websites.id, monthlyCycles.websiteId),
        ),
      )
      .where(
        and(
          eq(monthlyCycles.workspaceId, context.workspaceId),
          eq(monthlyCycles.id, monthlyCycleId),
        ),
      )
      .limit(1);

    if (!header) return null;

    const monitoringSummary = await monthlyCycleMonitoringSummary(
      tx,
      context,
      header.cycle,
    );
    const searchConsoleConnected = await hasConnectedSearchConsole(
      tx,
      context,
      header.cycle.websiteId,
    );
    const [deliverables, workRows, implementationRows, verificationRows, reportRows] =
      await Promise.all([
        tx
          .select()
          .from(monthlyCycleDeliverables)
          .where(
            and(
              eq(monthlyCycleDeliverables.workspaceId, context.workspaceId),
              eq(monthlyCycleDeliverables.monthlyCycleId, monthlyCycleId),
            ),
          )
          .orderBy(asc(monthlyCycleDeliverables.createdAt)),
        tx
          .select({
            item: monthlyCycleWorkItems,
            opportunityTitle: opportunities.title,
            opportunitySummary: opportunities.summary,
            sourceSeverity: opportunities.sourceSeverity,
            finalPriority: opportunities.finalPriority,
            priorityBand: opportunities.priorityBand,
            planScope: opportunities.planScope,
            sourceAuditRunId: opportunities.sourceAuditRunId,
            sourceEvidenceRefs: opportunities.sourceEvidenceRefs,
          })
          .from(monthlyCycleWorkItems)
          .innerJoin(
            opportunities,
            and(
              eq(opportunities.workspaceId, monthlyCycleWorkItems.workspaceId),
              eq(opportunities.id, monthlyCycleWorkItems.opportunityId),
            ),
          )
          .where(
            and(
              eq(monthlyCycleWorkItems.workspaceId, context.workspaceId),
              eq(monthlyCycleWorkItems.monthlyCycleId, monthlyCycleId),
            ),
          )
          .orderBy(asc(monthlyCycleWorkItems.createdAt)),
        tx
          .select()
          .from(manualImplementationRecords)
          .where(
            and(
              eq(manualImplementationRecords.workspaceId, context.workspaceId),
              eq(manualImplementationRecords.monthlyCycleId, monthlyCycleId),
            ),
          )
          .orderBy(desc(manualImplementationRecords.createdAt)),
        tx
          .select()
          .from(implementationVerificationRecords)
          .where(
            and(
              eq(implementationVerificationRecords.workspaceId, context.workspaceId),
              eq(implementationVerificationRecords.monthlyCycleId, monthlyCycleId),
            ),
          )
          .orderBy(desc(implementationVerificationRecords.verifiedAt)),
        tx
          .select()
          .from(monthlyReports)
          .where(
            and(
              eq(monthlyReports.workspaceId, context.workspaceId),
              eq(monthlyReports.monthlyCycleId, monthlyCycleId),
            ),
          )
          .orderBy(desc(monthlyReports.createdAt)),
      ]);
    const eligibleOpportunityRows = await tx
      .select()
      .from(opportunities)
      .where(
        and(
          eq(opportunities.workspaceId, context.workspaceId),
          eq(opportunities.clientId, header.cycle.clientId),
          inArray(opportunities.status, openOpportunityStatuses),
        ),
      );
    const sortedEligibleOpportunities = sortMonthlySelectionCandidates(
      eligibleOpportunityRows.map((opportunity) => ({
        ...candidateFromOpportunity(opportunity),
        title: opportunity.title,
        summary: opportunity.summary,
      })),
    );
    const prepareStateByOpportunity = await latestPrepareStateSelect(
      tx,
      context,
      workRows.map((row) => row.item.opportunityId),
    );

    return {
      ...header,
      deliverables,
      workItems: workRows.map((row) => {
        const prepareState = prepareStateByOpportunity.get(row.item.opportunityId);

        return {
          ...row,
          item: {
            ...row.item,
            draftState: prepareState?.draftState ?? row.item.draftState,
            approvalState: prepareState?.approvalState ?? row.item.approvalState,
          },
        };
      }),
      implementations: implementationRows,
      verifications: verificationRows,
      report: reportRows[0] ?? null,
      monitoringSummary: { ...monitoringSummary, searchConsoleConnected },
      sortedEligibleOpportunities,
    };
  });
}

export async function listMonthlyCycles(
  context: WorkspaceContext,
  database = db,
) {
  return withTenantContext(database, context, async (tx) =>
    tx
      .select({
        id: monthlyCycles.id,
        clientId: monthlyCycles.clientId,
        clientName: clients.name,
        servicePlan: monthlyCycles.servicePlan,
        cycleYear: monthlyCycles.cycleYear,
        cycleMonth: monthlyCycles.cycleMonth,
        status: monthlyCycles.status,
        dueAt: monthlyCycles.dueAt,
        manualImplementationMinutes: monthlyCycles.manualImplementationMinutes,
        majorContentAssetsCompleted: monthlyCycles.majorContentAssetsCompleted,
        existingPageOptimizationsCompleted:
          monthlyCycles.existingPageOptimizationsCompleted,
        createdAt: monthlyCycles.createdAt,
      })
      .from(monthlyCycles)
      .innerJoin(
        clients,
        and(
          eq(clients.workspaceId, monthlyCycles.workspaceId),
          eq(clients.id, monthlyCycles.clientId),
        ),
      )
      .where(eq(monthlyCycles.workspaceId, context.workspaceId))
      .orderBy(desc(monthlyCycles.cycleYear), desc(monthlyCycles.cycleMonth)),
  );
}

export async function listMonthlyReports(
  context: WorkspaceContext,
  database = db,
) {
  return withTenantContext(database, context, async (tx) =>
    tx
      .select({
        id: monthlyReports.id,
        monthlyCycleId: monthlyReports.monthlyCycleId,
        clientName: clients.name,
        title: monthlyReports.title,
        status: monthlyReports.status,
        methodologyVersion: monthlyReports.methodologyVersion,
        reportPeriodStartDate: monthlyReports.reportPeriodStartDate,
        reportPeriodEndDate: monthlyReports.reportPeriodEndDate,
        createdAt: monthlyReports.createdAt,
        finalizedAt: monthlyReports.finalizedAt,
        snapshotHash: monthlyReports.snapshotHash,
      })
      .from(monthlyReports)
      .innerJoin(
        clients,
        and(
          eq(clients.workspaceId, monthlyReports.workspaceId),
          eq(clients.id, monthlyReports.clientId),
        ),
      )
      .where(eq(monthlyReports.workspaceId, context.workspaceId))
      .orderBy(desc(monthlyReports.createdAt)),
  );
}

export async function listClientsForMonthlyCycleCreation(
  context: WorkspaceContext,
  database = db,
) {
  return withTenantContext(database, context, async (tx) =>
    tx
      .select({
        id: clients.id,
        name: clients.name,
        servicePlan: clients.servicePlan,
        servicePlanVersion: clients.servicePlanVersion,
      })
      .from(clients)
      .where(
        and(
          eq(clients.workspaceId, context.workspaceId),
          eq(clients.status, "ACTIVE"),
          isNull(clients.archivedAt),
        ),
      )
      .orderBy(asc(clients.name)),
  );
}

export async function getMonthlyCycleDashboardSummary(
  context: WorkspaceContext,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const period = monthlyPeriodForDate(now());
    const recurringPlanSql = sql`${clients.servicePlan} in ('ESSENTIALS', 'GROWTH', 'PRO')`;
    const [clientsWithoutCurrentCycle] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(clients)
      .leftJoin(
        monthlyCycles,
        and(
          eq(monthlyCycles.workspaceId, clients.workspaceId),
          eq(monthlyCycles.clientId, clients.id),
          eq(monthlyCycles.cycleYear, period.year),
          eq(monthlyCycles.cycleMonth, period.month),
        ),
      )
      .where(
        and(
          eq(clients.workspaceId, context.workspaceId),
          eq(clients.status, "ACTIVE"),
          isNull(clients.archivedAt),
          recurringPlanSql,
          sql`${monthlyCycles.id} is null`,
        ),
      );
    const [cyclesNeedingAttention] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(monthlyCycles)
      .where(
        and(
          eq(monthlyCycles.workspaceId, context.workspaceId),
          inArray(monthlyCycles.status, ["OPEN", "IN_PROGRESS", "REVIEW_REQUIRED"]),
        ),
      );
    const [blockedDeliverables] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(monthlyCycleDeliverables)
      .where(
        and(
          eq(monthlyCycleDeliverables.workspaceId, context.workspaceId),
          inArray(monthlyCycleDeliverables.status, ["BLOCKED", "UNAVAILABLE"]),
        ),
      );
    const [reportsAwaitingFinalization] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(monthlyReports)
      .where(
        and(
          eq(monthlyReports.workspaceId, context.workspaceId),
          eq(monthlyReports.status, "DRAFT"),
        ),
      );
    const [unresolvedCritical] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.workspaceId, context.workspaceId),
          eq(opportunities.sourceSeverity, "CRITICAL"),
          inArray(opportunities.status, openOpportunityStatuses),
        ),
      );
    const currentCycles = await tx
      .select({
        manualImplementationMinutes: monthlyCycles.manualImplementationMinutes,
        majorContentAssetsCompleted: monthlyCycles.majorContentAssetsCompleted,
        existingPageOptimizationsCompleted:
          monthlyCycles.existingPageOptimizationsCompleted,
        entitlementSnapshot: monthlyCycles.entitlementSnapshot,
      })
      .from(monthlyCycles)
      .where(
        and(
          eq(monthlyCycles.workspaceId, context.workspaceId),
          eq(monthlyCycles.cycleYear, period.year),
          eq(monthlyCycles.cycleMonth, period.month),
          sql`${monthlyCycles.status} <> 'CANCELED'`,
        ),
      );
    const currentUsage = currentCycles.reduce(
      (totals, cycle) => {
        const snapshot =
          cycle.entitlementSnapshot as unknown as MonthlyEntitlementSnapshot;

        totals.manualMinutesUsed += cycle.manualImplementationMinutes;
        totals.pageOptimizationsUsed += cycle.existingPageOptimizationsCompleted;
        totals.contentAssetsUsed += cycle.majorContentAssetsCompleted;
        totals.manualMinutesIncluded +=
          snapshot.limits.manualImplementationMinutes ?? 0;
        totals.pageOptimizationsIncluded +=
          snapshot.limits.existingPageOptimizations ?? 0;
        totals.contentAssetsIncluded += snapshot.limits.majorContentAssets ?? 0;

        return totals;
      },
      {
        manualMinutesUsed: 0,
        manualMinutesIncluded: 0,
        pageOptimizationsUsed: 0,
        pageOptimizationsIncluded: 0,
        contentAssetsUsed: 0,
        contentAssetsIncluded: 0,
      },
    );

    return {
      clientsWithoutCurrentCycle: clientsWithoutCurrentCycle?.count ?? 0,
      cyclesNeedingAttention: cyclesNeedingAttention?.count ?? 0,
      blockedContractualDeliverables: blockedDeliverables?.count ?? 0,
      reportsAwaitingFinalization: reportsAwaitingFinalization?.count ?? 0,
      unresolvedCritical: unresolvedCritical?.count ?? 0,
      currentCycleCount: currentCycles.length,
      ...currentUsage,
    };
  });
}

export async function getClientMonthlyFulfillmentSummary(
  context: WorkspaceContext,
  clientId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [cycle] = await tx
      .select()
      .from(monthlyCycles)
      .where(
        and(
          eq(monthlyCycles.workspaceId, context.workspaceId),
          eq(monthlyCycles.clientId, clientId),
          inArray(monthlyCycles.status, ["OPEN", "IN_PROGRESS", "REVIEW_REQUIRED", "READY_TO_CLOSE"]),
        ),
      )
      .orderBy(desc(monthlyCycles.cycleYear), desc(monthlyCycles.cycleMonth))
      .limit(1);
    const report = cycle
      ? (
          await tx
            .select()
            .from(monthlyReports)
            .where(
              and(
                eq(monthlyReports.workspaceId, context.workspaceId),
                eq(monthlyReports.monthlyCycleId, cycle.id),
              ),
            )
            .orderBy(desc(monthlyReports.createdAt))
            .limit(1)
        )[0] ?? null
      : null;
    const blocked = cycle
      ? await tx
          .select()
          .from(monthlyCycleDeliverables)
          .where(
            and(
              eq(monthlyCycleDeliverables.workspaceId, context.workspaceId),
              eq(monthlyCycleDeliverables.monthlyCycleId, cycle.id),
              inArray(monthlyCycleDeliverables.status, [
                "BLOCKED",
                "UNAVAILABLE",
              ]),
            ),
          )
          .orderBy(asc(monthlyCycleDeliverables.createdAt))
      : [];

    return { cycle: cycle ?? null, report, blockedDeliverables: blocked };
  });
}

export async function listDueMonthlyCycleClientRefs(
  limit = 50,
  database = db,
) {
  const result = await database.execute(sql`
    select workspace_id, client_id, cycle_year, cycle_month
    from public.bootstrap_due_monthly_cycle_clients(${limit})
  `);

  return (
    result as unknown as {
      rows?: {
        workspace_id: string;
        client_id: string;
        cycle_year: number;
        cycle_month: number;
      }[];
    }
  ).rows ?? [];
}

export function monthlyCycleCloseReadiness(input: {
  deliverables: { status: string }[];
  hasFinalizedReport: boolean;
  hiddenCriticalCount: number;
}) {
  const unfinished = input.deliverables.filter(
    (deliverable) =>
      ![
        "COMPLETE",
        "UNAVAILABLE",
        "NOT_APPLICABLE",
        "WAIVED",
      ].includes(deliverable.status),
  ).length;

  return {
    ready:
      unfinished === 0 &&
      input.hasFinalizedReport &&
      input.hiddenCriticalCount === 0,
    unfinishedDeliverables: unfinished,
    reportFinalized: input.hasFinalizedReport,
    hiddenCriticalCount: input.hiddenCriticalCount,
  };
}
