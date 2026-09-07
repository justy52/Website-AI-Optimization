import { createHash } from "node:crypto";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  activityEvents,
  agentDefinitions as agentDefinitionsTable,
  agentRuns,
  agentToolCalls,
  approvalRequests,
  auditEvidence,
  businessFacts,
  claimPolicies,
  clientKnowledgeSources,
  clients,
  draftArtifacts,
  operationalNotifications,
  opportunities,
  websites,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import {
  createBudgetSnapshot,
  assertWithinBudget,
  byteLength,
  AgentBudgetError,
  type AgentRunBudgetSnapshot,
} from "@/domain/agents/budget";
import {
  approvalDecisionToStatuses,
  assertPhase3ApprovalTarget,
  type ApprovalDecision,
} from "@/domain/agents/approvals";
import {
  EXISTING_PAGE_OPTIMIZATION_AGENT_KEY,
  getEnabledAgentDefinition,
} from "@/domain/agents/catalog";
import {
  assertPrepareOutputPolicy,
  createAiGatewayPrepareProvider,
  createDeterministicPrepareProvider,
  filterModelVisibleBusinessFacts,
  PAGE_OPTIMIZATION_PROMPT_VERSION,
  renderDraftPreview,
  type ExistingPageOptimizationInput,
  type PrepareModelProvider,
} from "@/domain/agents/page-optimization";
import { assertToolAllowedForAgent } from "@/domain/agents/tool-registry";
import { openOpportunityStatuses } from "@/domain/opportunities/generation";
import {
  assertWorkspaceRole,
  type WorkspaceContext,
} from "@/domain/tenancy/context";
import { getServicePlanDefinition } from "@/domain/service-plans";
import { serverEnv } from "@/lib/env";

type AgentDatabase = typeof db;
type AgentTransaction = Parameters<Parameters<AgentDatabase["transaction"]>[0]>[0];

const prepareRunStatuses = ["QUEUED", "RUNNING"] as const;
const approvalOpenStatuses = ["PENDING"] as const;

function now() {
  return new Date();
}

function hashContent(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeErrorSummary(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }

  return "Agent run failed.".slice(0, 500);
}

function providerForRun(
  budget: AgentRunBudgetSnapshot,
  context: WorkspaceContext,
  runId: string,
  override?: PrepareModelProvider,
): PrepareModelProvider {
  if (override) return override;

  if (serverEnv.AGENT_PROVIDER === "ai_gateway" && serverEnv.AI_GATEWAY_MODEL) {
    return createAiGatewayPrepareProvider({
      model: serverEnv.AI_GATEWAY_MODEL,
      maxOutputTokens: budget.maxOutputTokens,
      timeoutMs: 60_000,
      budget,
      tags: [
        `environment:${serverEnv.APP_ENV}`,
        "feature:governed-prepare",
        "agent:existing-page-optimization",
        `run:${runId}`,
        `workspace:${context.workspaceId}`,
      ],
      user: context.userId ? `user:${context.userId}` : undefined,
      quotaEntityId: `workspace:${context.workspaceId}`,
    });
  }

  return createDeterministicPrepareProvider();
}

async function recordActivity(
  tx: AgentTransaction,
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

async function createNotification(
  tx: AgentTransaction,
  context: WorkspaceContext,
  input: {
    type: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    title: string;
    summary: string;
    resourceType?: string;
    resourceId?: string;
  },
) {
  await tx.insert(operationalNotifications).values({
    workspaceId: context.workspaceId,
    type: input.type,
    severity: input.severity,
    title: input.title,
    summary: input.summary,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
  });
}

async function recordToolCall(
  tx: AgentTransaction,
  context: WorkspaceContext,
  input: {
    agentRunId: string;
    toolKey: string;
    permissionLevel: "OBSERVE" | "PREPARE";
    targetSummary?: Record<string, unknown>;
    inputSummary?: Record<string, unknown>;
    outputSummary?: Record<string, unknown>;
    status?: "SUCCEEDED" | "FAILED" | "SKIPPED" | "BUDGET_LIMITED";
    errorSummary?: string;
  },
) {
  const tool = assertToolAllowedForAgent(
    getEnabledAgentDefinition(EXISTING_PAGE_OPTIMIZATION_AGENT_KEY),
    input.toolKey,
  );

  await tx.insert(agentToolCalls).values({
    workspaceId: context.workspaceId,
    agentRunId: input.agentRunId,
    toolKey: tool.key,
    toolVersion: tool.version,
    permissionLevel: input.permissionLevel,
    targetSummary: input.targetSummary ?? {},
    inputSummary: input.inputSummary ?? {},
    outputSummary: input.outputSummary ?? {},
    status: input.status ?? "SUCCEEDED",
    errorSummary: input.errorSummary,
    endedAt: now(),
  });
}

export type PrepareDraftRequestResult = {
  agentRunId: string;
  shouldStartWorkflow: boolean;
  status: string;
};

export async function requestPrepareDraftForOpportunity(
  context: WorkspaceContext,
  opportunityId: string,
  database = db,
): Promise<PrepareDraftRequestResult> {
  assertWorkspaceRole(context, ["OWNER", "ADMIN", "ANALYST"]);

  const agent = getEnabledAgentDefinition(EXISTING_PAGE_OPTIMIZATION_AGENT_KEY);
  const allowedTools = agent.allowedToolKeys.map((toolKey) => {
    const tool = assertToolAllowedForAgent(agent, toolKey);
    return tool.key;
  });
  const budget = createBudgetSnapshot(agent.budgetLimits);

  return withTenantContext(database, context, async (tx) => {
    const [opportunity] = await tx
      .select({
        id: opportunities.id,
        clientId: opportunities.clientId,
        websiteId: opportunities.websiteId,
        sourceAuditId: opportunities.sourceAuditId,
        sourceAuditRunId: opportunities.sourceAuditRunId,
        sourceCheckKey: opportunities.sourceCheckKey,
        sourceSeverity: opportunities.sourceSeverity,
        status: opportunities.status,
        title: opportunities.title,
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

    if (!openOpportunityStatuses.includes(opportunity.status)) {
      throw new Error("Only open Opportunities can request PREPARE work.");
    }

    const [pendingApproval] = await tx
      .select({
        id: approvalRequests.id,
        agentRunId: approvalRequests.requestedByAgentRunId,
      })
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.workspaceId, context.workspaceId),
          eq(approvalRequests.opportunityId, opportunity.id),
          inArray(approvalRequests.status, approvalOpenStatuses),
        ),
      )
      .orderBy(desc(approvalRequests.requestedAt))
      .limit(1);

    if (pendingApproval?.agentRunId) {
      return {
        agentRunId: pendingApproval.agentRunId,
        shouldStartWorkflow: false,
        status: "PENDING_APPROVAL",
      };
    }

    const [existingRun] = await tx
      .select({ id: agentRuns.id, status: agentRuns.status })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.workspaceId, context.workspaceId),
          eq(agentRuns.opportunityId, opportunity.id),
          eq(agentRuns.agentKey, agent.key),
          inArray(agentRuns.status, prepareRunStatuses),
        ),
      )
      .orderBy(desc(agentRuns.createdAt))
      .limit(1);

    if (existingRun) {
      return {
        agentRunId: existingRun.id,
        shouldStartWorkflow: false,
        status: existingRun.status,
      };
    }

    const [latestArtifact] = await tx
      .select({ version: draftArtifacts.artifactVersion })
      .from(draftArtifacts)
      .where(
        and(
          eq(draftArtifacts.workspaceId, context.workspaceId),
          eq(draftArtifacts.opportunityId, opportunity.id),
        ),
      )
      .orderBy(desc(draftArtifacts.artifactVersion))
      .limit(1);
    const nextVersion = (latestArtifact?.version ?? 0) + 1;
    const [definitionRecord] = await tx
      .select({ id: agentDefinitionsTable.id })
      .from(agentDefinitionsTable)
      .where(
        and(
          eq(agentDefinitionsTable.key, agent.key),
          eq(agentDefinitionsTable.version, agent.version),
        ),
      )
      .limit(1);

    const [run] = await tx
      .insert(agentRuns)
      .values({
        workspaceId: context.workspaceId,
        agentDefinitionId: definitionRecord?.id,
        clientId: opportunity.clientId,
        websiteId: opportunity.websiteId,
        auditId: opportunity.sourceAuditId,
        opportunityId: opportunity.id,
        triggerType: "USER",
        agentKey: agent.key,
        agentVersion: agent.version,
        permissionLevel: agent.defaultPermissionLevel,
        status: "QUEUED",
        inputSummary: {
          opportunityId: opportunity.id,
          title: opportunity.title,
          sourceCheckKey: opportunity.sourceCheckKey,
          sourceSeverity: opportunity.sourceSeverity,
          requestedArtifactVersion: nextVersion,
        },
        evidenceRefs: [],
        allowedToolSnapshot: allowedTools,
        budgetSnapshot: budget,
        timeoutSeconds: agent.defaultTimeoutSeconds,
        deadlineAt: new Date(Date.now() + agent.defaultTimeoutSeconds * 1_000),
        provider:
          serverEnv.AGENT_PROVIDER === "ai_gateway" && serverEnv.AI_GATEWAY_MODEL
            ? "vercel-ai-gateway"
            : "deterministic",
        model:
          serverEnv.AGENT_PROVIDER === "ai_gateway" && serverEnv.AI_GATEWAY_MODEL
            ? serverEnv.AI_GATEWAY_MODEL
            : "deterministic-existing-page-optimization-v1",
        promptTemplateVersion: PAGE_OPTIMIZATION_PROMPT_VERSION,
        outputSchemaVersion: agent.outputSchemaVersion,
        estimatedToolCalls: allowedTools.length,
        estimatedModelCalls: 1,
        idempotencyKey: `prepare:${opportunity.id}:${agent.version}:v${nextVersion}`,
        createdByUserId: context.userId,
      })
      .returning();

    await recordActivity(tx, context, "agent_run.queued", "agent_run", run.id, {
      opportunityId: opportunity.id,
      agentKey: agent.key,
      permissionLevel: agent.defaultPermissionLevel,
    });

    return {
      agentRunId: run.id,
      shouldStartWorkflow: true,
      status: run.status,
    };
  });
}

export async function recordWorkflowRunId(
  context: WorkspaceContext,
  agentRunId: string,
  workflowRunId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    await tx
      .update(agentRuns)
      .set({ workflowRunId, updatedAt: now() })
      .where(
        and(
          eq(agentRuns.workspaceId, context.workspaceId),
          eq(agentRuns.id, agentRunId),
        ),
      );
  });
}

async function loadPrepareInput(
  tx: AgentTransaction,
  context: WorkspaceContext,
  runId: string,
) {
  const [row] = await tx
    .select({
      run: agentRuns,
      opportunity: opportunities,
      client: clients,
      website: websites,
    })
    .from(agentRuns)
    .innerJoin(
      opportunities,
      and(
        eq(opportunities.workspaceId, agentRuns.workspaceId),
        eq(opportunities.id, agentRuns.opportunityId),
      ),
    )
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
      and(eq(agentRuns.workspaceId, context.workspaceId), eq(agentRuns.id, runId)),
    )
    .limit(1);

  if (!row) {
    throw new Error("Agent run was not found.");
  }

  const evidenceRows = await tx
    .select()
    .from(auditEvidence)
    .where(
      and(
        eq(auditEvidence.workspaceId, context.workspaceId),
        eq(auditEvidence.auditRunId, row.opportunity.sourceAuditRunId),
      ),
    )
    .orderBy(desc(auditEvidence.collectedAt));
  const factRows = await tx
    .select()
    .from(businessFacts)
    .where(
      and(
        eq(businessFacts.workspaceId, context.workspaceId),
        eq(businessFacts.clientId, row.client.id),
        eq(businessFacts.verificationStatus, "VERIFIED"),
        eq(businessFacts.sensitivity, "PUBLIC"),
        isNull(businessFacts.archivedAt),
      ),
    );
  const policyRows = await tx
    .select()
    .from(claimPolicies)
    .where(
      and(
        eq(claimPolicies.workspaceId, context.workspaceId),
        eq(claimPolicies.clientId, row.client.id),
        eq(claimPolicies.active, true),
        isNull(claimPolicies.archivedAt),
      ),
    );

  const input: ExistingPageOptimizationInput = {
    opportunity: {
      id: row.opportunity.id,
      title: row.opportunity.title,
      summary: row.opportunity.summary,
      recommendedAction: row.opportunity.recommendedAction,
      sourceCheckKey: row.opportunity.sourceCheckKey,
      sourceResultStatus: row.opportunity.sourceResultStatus,
      sourceSeverity: row.opportunity.sourceSeverity,
      evidenceConfidence: row.opportunity.evidenceConfidence,
      sourceEvidenceRefs: row.opportunity.sourceEvidenceRefs,
    },
    client: {
      id: row.client.id,
      name: row.client.name,
      servicePlan: row.client.servicePlan,
      servicePlanVersion: row.client.servicePlanVersion,
    },
    website: {
      id: row.website.id,
      displayName: row.website.displayName,
      canonicalUrl: row.website.canonicalUrl,
      domain: row.website.domain,
    },
    auditEvidence: evidenceRows.map((evidence) => ({
      id:
        typeof evidence.metadata.localEvidenceId === "string"
          ? evidence.metadata.localEvidenceId
          : evidence.id,
      label: evidence.sourceLabel,
      evidenceType: evidence.evidenceType,
      sourceUrl: evidence.sourceUrl,
      excerpt: evidence.excerpt?.slice(0, 2_000),
      metadata: evidence.metadata,
    })),
    businessFacts: filterModelVisibleBusinessFacts(
      factRows.map((fact) => ({
        id: fact.id,
        factType: fact.factType,
        value: fact.value,
        verificationStatus: fact.verificationStatus,
        sensitivity: fact.sensitivity,
        sourceReference: fact.sourceReference,
      })),
    ),
    claimPolicies: policyRows.map((policy) => ({
      id: policy.id,
      ruleType: policy.ruleType,
      claimCategory: policy.claimCategory,
      rule: policy.rule,
      requiredDisclaimer: policy.requiredDisclaimer,
    })),
  };

  return { ...row, input };
}

async function markRunBudgetLimited(
  context: WorkspaceContext,
  runId: string,
  error: AgentBudgetError,
  database: AgentDatabase,
) {
  await withTenantContext(database, context, async (tx) => {
    await tx
      .update(agentRuns)
      .set({
        status: "BUDGET_LIMITED",
        errorCode: error.code,
        errorSummary: safeErrorSummary(error),
        completedAt: now(),
        updatedAt: now(),
      })
      .where(
        and(
          eq(agentRuns.workspaceId, context.workspaceId),
          eq(agentRuns.id, runId),
        ),
      );
    await createNotification(tx, context, {
      type: "agent_run_budget_limited",
      severity: "HIGH",
      title: "Agent run stopped by budget",
      summary: safeErrorSummary(error),
      resourceType: "agent_run",
      resourceId: runId,
    });
    await recordActivity(
      tx,
      context,
      "agent_run.budget_limited",
      "agent_run",
      runId,
      { errorCode: error.code },
    );
  });
}

async function markRunFailed(
  context: WorkspaceContext,
  runId: string,
  error: unknown,
  database: AgentDatabase,
) {
  await withTenantContext(database, context, async (tx) => {
    await tx
      .update(agentRuns)
      .set({
        status: "FAILED",
        errorCode: error instanceof Error ? error.name : "AgentRunError",
        errorSummary: safeErrorSummary(error),
        completedAt: now(),
        updatedAt: now(),
      })
      .where(
        and(
          eq(agentRuns.workspaceId, context.workspaceId),
          eq(agentRuns.id, runId),
        ),
      );
    await createNotification(tx, context, {
      type: "agent_run_failed",
      severity: "HIGH",
      title: "Agent run failed",
      summary: safeErrorSummary(error),
      resourceType: "agent_run",
      resourceId: runId,
    });
    await recordActivity(tx, context, "agent_run.failed", "agent_run", runId, {
      errorSummary: safeErrorSummary(error),
    });
  });
}

export async function executePrepareDraftAgentRun(
  context: WorkspaceContext,
  runId: string,
  database = db,
  providerOverride?: PrepareModelProvider,
) {
  try {
    const prepared = await withTenantContext(database, context, async (tx) => {
      const loaded = await loadPrepareInput(tx, context, runId);
      const budget = loaded.run.budgetSnapshot as AgentRunBudgetSnapshot;

      await tx
        .update(agentRuns)
        .set({ status: "RUNNING", startedAt: now(), updatedAt: now() })
        .where(
          and(
            eq(agentRuns.workspaceId, context.workspaceId),
            eq(agentRuns.id, runId),
          ),
        );
      await recordToolCall(tx, context, {
        agentRunId: runId,
        toolKey: "read.opportunity.v1",
        permissionLevel: "OBSERVE",
        targetSummary: { opportunityId: loaded.opportunity.id },
        outputSummary: { sourceCheckKey: loaded.opportunity.sourceCheckKey },
      });
      await recordToolCall(tx, context, {
        agentRunId: runId,
        toolKey: "read.audit_results.v1",
        permissionLevel: "OBSERVE",
        targetSummary: { auditId: loaded.opportunity.sourceAuditId },
        outputSummary: { sourceAuditRunId: loaded.opportunity.sourceAuditRunId },
      });
      await recordToolCall(tx, context, {
        agentRunId: runId,
        toolKey: "read.captured_evidence.v1",
        permissionLevel: "OBSERVE",
        targetSummary: { auditRunId: loaded.opportunity.sourceAuditRunId },
        outputSummary: { evidenceCount: loaded.input.auditEvidence.length },
      });
      await recordToolCall(tx, context, {
        agentRunId: runId,
        toolKey: "read.client_site_context.v1",
        permissionLevel: "OBSERVE",
        targetSummary: { clientId: loaded.client.id, websiteId: loaded.website.id },
      });
      getServicePlanDefinition(
        loaded.client.servicePlan,
        loaded.client.servicePlanVersion,
      );
      await recordToolCall(tx, context, {
        agentRunId: runId,
        toolKey: "read.service_plan_definition.v1",
        permissionLevel: "OBSERVE",
        inputSummary: {
          plan: loaded.client.servicePlan,
          version: loaded.client.servicePlanVersion,
        },
      });
      await recordToolCall(tx, context, {
        agentRunId: runId,
        toolKey: "read.business_facts.v1",
        permissionLevel: "OBSERVE",
        targetSummary: { clientId: loaded.client.id },
        outputSummary: { factCount: loaded.input.businessFacts.length },
      });
      await recordActivity(tx, context, "agent_run.started", "agent_run", runId, {
        agentKey: loaded.run.agentKey,
      });

      const inputBytes = byteLength(JSON.stringify(loaded.input));
      const evidenceBytes = byteLength(
        JSON.stringify(loaded.input.auditEvidence),
      );

      assertWithinBudget(budget, {
        toolCalls: 6,
        modelCalls: 0,
        evidenceBytes,
        inputBytes,
        outputBytes: 0,
        costCents: 0,
      });

      return { loaded, budget, inputBytes, evidenceBytes };
    });

    const provider = providerForRun(
      prepared.budget,
      context,
      runId,
      providerOverride,
    );
    const generated = await provider.generate(prepared.loaded.input);
    const output = assertPrepareOutputPolicy(
      generated.output,
      prepared.loaded.input,
    );
    const renderedPreview = renderDraftPreview(output);
    const outputBytes = byteLength(JSON.stringify(output));
    const runCostCents =
      generated.usage.actualCostCents ?? generated.usage.estimatedCostCents ?? 0;

    assertWithinBudget(prepared.budget, {
      toolCalls: 8,
      modelCalls: 1,
      evidenceBytes: prepared.evidenceBytes,
      inputBytes: prepared.inputBytes,
      outputBytes,
      costCents: runCostCents,
    });

    return await withTenantContext(database, context, async (tx) => {
      const [latestArtifact] = await tx
        .select({
          id: draftArtifacts.id,
          version: draftArtifacts.artifactVersion,
          status: draftArtifacts.status,
        })
        .from(draftArtifacts)
        .where(
          and(
            eq(draftArtifacts.workspaceId, context.workspaceId),
            eq(draftArtifacts.opportunityId, prepared.loaded.opportunity.id),
          ),
        )
        .orderBy(desc(draftArtifacts.artifactVersion))
        .limit(1);

      if (latestArtifact && latestArtifact.status !== "APPROVED") {
        await tx
          .update(draftArtifacts)
          .set({
            status: "SUPERSEDED",
            supersededAt: now(),
            updatedAt: now(),
          })
          .where(
            and(
              eq(draftArtifacts.workspaceId, context.workspaceId),
              eq(draftArtifacts.id, latestArtifact.id),
            ),
          );
        await tx
          .update(approvalRequests)
          .set({ status: "CANCELED", updatedAt: now() })
          .where(
            and(
              eq(approvalRequests.workspaceId, context.workspaceId),
              eq(approvalRequests.targetArtifactId, latestArtifact.id),
              eq(approvalRequests.status, "PENDING"),
            ),
          );
      }

      const artifactVersion = (latestArtifact?.version ?? 0) + 1;
      const [artifact] = await tx
        .insert(draftArtifacts)
        .values({
          workspaceId: context.workspaceId,
          clientId: prepared.loaded.client.id,
          websiteId: prepared.loaded.website.id,
          opportunityId: prepared.loaded.opportunity.id,
          artifactType: "EXISTING_PAGE_OPTIMIZATION_PROPOSAL",
          artifactVersion,
          status: "AWAITING_APPROVAL",
          preparedByAgentRunId: runId,
          sourceEvidenceRefs: prepared.loaded.opportunity.sourceEvidenceRefs,
          structuredProposal: output,
          renderedPreview,
          factualBasisRefs: output.proposals.flatMap((proposal) =>
            proposal.factualBasis.map((basis) => basis.ref),
          ),
          riskLevel: output.riskLevel,
          contentHash: hashContent(`${renderedPreview}\n${JSON.stringify(output)}`),
          supersedesArtifactId: latestArtifact?.id,
        })
        .returning();

      const [approval] = await tx
        .insert(approvalRequests)
        .values({
          workspaceId: context.workspaceId,
          clientId: prepared.loaded.client.id,
          websiteId: prepared.loaded.website.id,
          opportunityId: prepared.loaded.opportunity.id,
          requestType: "PREPARE_ARTIFACT_REVIEW",
          targetType: "DRAFT_ARTIFACT",
          targetArtifactId: artifact.id,
          targetArtifactVersion: artifact.artifactVersion,
          riskLevel: artifact.riskLevel,
          requestedByUserId: prepared.loaded.run.createdByUserId,
          requestedByAgentRunId: runId,
          immutableSummary: {
            artifactId: artifact.id,
            artifactVersion: artifact.artifactVersion,
            artifactType: artifact.artifactType,
            title: output.artifactTitle,
            permissionLevel: output.permissionLevel,
            proposedExternalExecution: false,
            contentHash: artifact.contentHash,
          },
          proposedExternalExecution: false,
        })
        .returning();

      await tx
        .update(opportunities)
        .set({ approvalBlockedState: "AWAITING_APPROVAL", updatedAt: now() })
        .where(
          and(
            eq(opportunities.workspaceId, context.workspaceId),
            eq(opportunities.id, prepared.loaded.opportunity.id),
          ),
        );

      await recordToolCall(tx, context, {
        agentRunId: runId,
        toolKey: "create.draft_artifact.v1",
        permissionLevel: "PREPARE",
        targetSummary: { artifactId: artifact.id },
        outputSummary: { artifactVersion: artifact.artifactVersion },
      });
      await recordToolCall(tx, context, {
        agentRunId: runId,
        toolKey: "create.approval_request.v1",
        permissionLevel: "PREPARE",
        targetSummary: { approvalRequestId: approval.id },
      });
      await tx
        .update(agentRuns)
        .set({
          status: "SUCCEEDED",
          structuredOutput: output,
          outputRef: artifact.id,
          rationale: output.conciseRationale,
          confidence: output.confidence,
          source: "captured_audit_evidence_and_business_facts",
          nextAction: output.nextAction,
          actualToolCalls: 8,
          actualModelCalls: 1,
          estimatedInputTokens: generated.usage.estimatedInputTokens ?? 0,
          estimatedOutputTokens: generated.usage.estimatedOutputTokens ?? 0,
          estimatedTotalTokens:
            (generated.usage.estimatedInputTokens ?? 0) +
            (generated.usage.estimatedOutputTokens ?? 0),
          estimatedCostCents: generated.usage.estimatedCostCents ?? 0,
          actualInputTokens: generated.usage.inputTokens ?? 0,
          actualOutputTokens: generated.usage.outputTokens ?? 0,
          actualTotalTokens: generated.usage.totalTokens ?? 0,
          actualCostCents: generated.usage.actualCostCents ?? 0,
          modelGenerationId: generated.usage.gatewayGenerationId,
          providerMetadata: generated.usage.providerMetadata ?? {},
          completedAt: now(),
          updatedAt: now(),
          provider: provider.provider,
          model: generated.usage.actualModel ?? provider.model,
        })
        .where(
          and(
            eq(agentRuns.workspaceId, context.workspaceId),
            eq(agentRuns.id, runId),
          ),
        );
      await recordActivity(tx, context, "draft_artifact.created", "draft_artifact", artifact.id, {
        opportunityId: prepared.loaded.opportunity.id,
        artifactVersion: artifact.artifactVersion,
      });
      await recordActivity(tx, context, "approval.requested", "approval_request", approval.id, {
        artifactId: artifact.id,
        artifactVersion: artifact.artifactVersion,
        externalExecution: false,
      });
      await recordActivity(tx, context, "agent_run.succeeded", "agent_run", runId, {
        artifactId: artifact.id,
        approvalRequestId: approval.id,
      });
      await createNotification(tx, context, {
        type: "approval_requested",
        severity: output.riskLevel === "HIGH" ? "HIGH" : "MEDIUM",
        title: "Draft ready for human approval",
        summary: output.artifactTitle,
        resourceType: "approval_request",
        resourceId: approval.id,
      });

      return { artifact, approval, output };
    });
  } catch (error) {
    if (error instanceof AgentBudgetError) {
      await markRunBudgetLimited(context, runId, error, database);
      return { artifact: null, approval: null, output: null };
    }

    await markRunFailed(context, runId, error, database);
    return { artifact: null, approval: null, output: null };
  }
}

export async function listAgentRuns(context: WorkspaceContext, database = db) {
  return withTenantContext(database, context, async (tx) =>
    tx
      .select({
        id: agentRuns.id,
        agentKey: agentRuns.agentKey,
        agentVersion: agentRuns.agentVersion,
        permissionLevel: agentRuns.permissionLevel,
        status: agentRuns.status,
        triggerType: agentRuns.triggerType,
        provider: agentRuns.provider,
        model: agentRuns.model,
        clientId: agentRuns.clientId,
        clientName: clients.name,
        websiteId: agentRuns.websiteId,
        websiteName: websites.displayName,
        opportunityId: agentRuns.opportunityId,
        opportunityTitle: opportunities.title,
        outputRef: agentRuns.outputRef,
        errorSummary: agentRuns.errorSummary,
        startedAt: agentRuns.startedAt,
        completedAt: agentRuns.completedAt,
        createdAt: agentRuns.createdAt,
      })
      .from(agentRuns)
      .leftJoin(
        clients,
        and(
          eq(clients.workspaceId, agentRuns.workspaceId),
          eq(clients.id, agentRuns.clientId),
        ),
      )
      .leftJoin(
        websites,
        and(
          eq(websites.workspaceId, agentRuns.workspaceId),
          eq(websites.id, agentRuns.websiteId),
        ),
      )
      .leftJoin(
        opportunities,
        and(
          eq(opportunities.workspaceId, agentRuns.workspaceId),
          eq(opportunities.id, agentRuns.opportunityId),
        ),
      )
      .where(eq(agentRuns.workspaceId, context.workspaceId))
      .orderBy(desc(agentRuns.createdAt))
      .limit(100),
  );
}

export async function getAgentRunDetail(
  context: WorkspaceContext,
  runId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [run] = await tx
      .select({
        run: agentRuns,
        clientName: clients.name,
        websiteName: websites.displayName,
        opportunityTitle: opportunities.title,
      })
      .from(agentRuns)
      .leftJoin(
        clients,
        and(
          eq(clients.workspaceId, agentRuns.workspaceId),
          eq(clients.id, agentRuns.clientId),
        ),
      )
      .leftJoin(
        websites,
        and(
          eq(websites.workspaceId, agentRuns.workspaceId),
          eq(websites.id, agentRuns.websiteId),
        ),
      )
      .leftJoin(
        opportunities,
        and(
          eq(opportunities.workspaceId, agentRuns.workspaceId),
          eq(opportunities.id, agentRuns.opportunityId),
        ),
      )
      .where(and(eq(agentRuns.workspaceId, context.workspaceId), eq(agentRuns.id, runId)))
      .limit(1);

    if (!run) return null;

    const tools = await tx
      .select()
      .from(agentToolCalls)
      .where(
        and(
          eq(agentToolCalls.workspaceId, context.workspaceId),
          eq(agentToolCalls.agentRunId, runId),
        ),
      )
      .orderBy(desc(agentToolCalls.startedAt));

    const [artifact] = await tx
      .select()
      .from(draftArtifacts)
      .where(
        and(
          eq(draftArtifacts.workspaceId, context.workspaceId),
          eq(draftArtifacts.preparedByAgentRunId, runId),
        ),
      )
      .limit(1);

    return { ...run, tools, artifact: artifact ?? null };
  });
}

export async function getDraftArtifact(
  context: WorkspaceContext,
  artifactId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [artifact] = await tx
      .select({
        artifact: draftArtifacts,
        clientName: clients.name,
        websiteName: websites.displayName,
        opportunityTitle: opportunities.title,
      })
      .from(draftArtifacts)
      .innerJoin(
        clients,
        and(
          eq(clients.workspaceId, draftArtifacts.workspaceId),
          eq(clients.id, draftArtifacts.clientId),
        ),
      )
      .leftJoin(
        websites,
        and(
          eq(websites.workspaceId, draftArtifacts.workspaceId),
          eq(websites.id, draftArtifacts.websiteId),
        ),
      )
      .leftJoin(
        opportunities,
        and(
          eq(opportunities.workspaceId, draftArtifacts.workspaceId),
          eq(opportunities.id, draftArtifacts.opportunityId),
        ),
      )
      .where(
        and(
          eq(draftArtifacts.workspaceId, context.workspaceId),
          eq(draftArtifacts.id, artifactId),
        ),
      )
      .limit(1);

    if (!artifact) return null;

    const [approval] = await tx
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.workspaceId, context.workspaceId),
          eq(approvalRequests.targetArtifactId, artifactId),
          eq(
            approvalRequests.targetArtifactVersion,
            artifact.artifact.artifactVersion,
          ),
        ),
      )
      .limit(1);

    return { ...artifact, approval: approval ?? null };
  });
}

export async function listApprovalRequests(
  context: WorkspaceContext,
  database = db,
) {
  return withTenantContext(database, context, async (tx) =>
    tx
      .select({
        id: approvalRequests.id,
        status: approvalRequests.status,
        requestType: approvalRequests.requestType,
        riskLevel: approvalRequests.riskLevel,
        targetArtifactId: approvalRequests.targetArtifactId,
        targetArtifactVersion: approvalRequests.targetArtifactVersion,
        proposedExternalExecution: approvalRequests.proposedExternalExecution,
        immutableSummary: approvalRequests.immutableSummary,
        requestedAt: approvalRequests.requestedAt,
        decidedAt: approvalRequests.decidedAt,
        artifactType: draftArtifacts.artifactType,
        opportunityTitle: opportunities.title,
        clientName: clients.name,
        websiteName: websites.displayName,
      })
      .from(approvalRequests)
      .innerJoin(
        draftArtifacts,
        and(
          eq(draftArtifacts.workspaceId, approvalRequests.workspaceId),
          eq(draftArtifacts.id, approvalRequests.targetArtifactId),
          eq(
            draftArtifacts.artifactVersion,
            approvalRequests.targetArtifactVersion,
          ),
        ),
      )
      .leftJoin(
        clients,
        and(
          eq(clients.workspaceId, approvalRequests.workspaceId),
          eq(clients.id, approvalRequests.clientId),
        ),
      )
      .leftJoin(
        websites,
        and(
          eq(websites.workspaceId, approvalRequests.workspaceId),
          eq(websites.id, approvalRequests.websiteId),
        ),
      )
      .leftJoin(
        opportunities,
        and(
          eq(opportunities.workspaceId, approvalRequests.workspaceId),
          eq(opportunities.id, approvalRequests.opportunityId),
        ),
      )
      .where(eq(approvalRequests.workspaceId, context.workspaceId))
      .orderBy(desc(approvalRequests.requestedAt))
      .limit(100),
  );
}

export async function getApprovalRequestDetail(
  context: WorkspaceContext,
  approvalId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [approval] = await tx
      .select({
        approval: approvalRequests,
        artifact: draftArtifacts,
        run: agentRuns,
        clientName: clients.name,
        websiteName: websites.displayName,
        opportunityTitle: opportunities.title,
      })
      .from(approvalRequests)
      .innerJoin(
        draftArtifacts,
        and(
          eq(draftArtifacts.workspaceId, approvalRequests.workspaceId),
          eq(draftArtifacts.id, approvalRequests.targetArtifactId),
          eq(
            draftArtifacts.artifactVersion,
            approvalRequests.targetArtifactVersion,
          ),
        ),
      )
      .leftJoin(
        agentRuns,
        and(
          eq(agentRuns.workspaceId, approvalRequests.workspaceId),
          eq(agentRuns.id, approvalRequests.requestedByAgentRunId),
        ),
      )
      .leftJoin(
        clients,
        and(
          eq(clients.workspaceId, approvalRequests.workspaceId),
          eq(clients.id, approvalRequests.clientId),
        ),
      )
      .leftJoin(
        websites,
        and(
          eq(websites.workspaceId, approvalRequests.workspaceId),
          eq(websites.id, approvalRequests.websiteId),
        ),
      )
      .leftJoin(
        opportunities,
        and(
          eq(opportunities.workspaceId, approvalRequests.workspaceId),
          eq(opportunities.id, approvalRequests.opportunityId),
        ),
      )
      .where(
        and(
          eq(approvalRequests.workspaceId, context.workspaceId),
          eq(approvalRequests.id, approvalId),
        ),
      )
      .limit(1);

    return approval ?? null;
  });
}

export async function decideApprovalRequest(
  context: WorkspaceContext,
  approvalId: string,
  input: {
    decision: ApprovalDecision;
    comments?: string | null;
    reasonCategory?: string | null;
  },
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN"]);

  return withTenantContext(database, context, async (tx) => {
    const [detail] = await tx
      .select({
        approval: approvalRequests,
        artifact: draftArtifacts,
      })
      .from(approvalRequests)
      .innerJoin(
        draftArtifacts,
        and(
          eq(draftArtifacts.workspaceId, approvalRequests.workspaceId),
          eq(draftArtifacts.id, approvalRequests.targetArtifactId),
          eq(
            draftArtifacts.artifactVersion,
            approvalRequests.targetArtifactVersion,
          ),
        ),
      )
      .where(
        and(
          eq(approvalRequests.workspaceId, context.workspaceId),
          eq(approvalRequests.id, approvalId),
        ),
      )
      .limit(1);

    if (!detail) {
      throw new Error("Approval request was not found.");
    }

    if (detail.approval.status !== "PENDING") {
      throw new Error("Only pending approval requests can be decided.");
    }

    assertPhase3ApprovalTarget({
      targetArtifactVersion: detail.approval.targetArtifactVersion,
      artifactVersion: detail.artifact.artifactVersion,
      proposedExternalExecution: detail.approval.proposedExternalExecution,
    });
    const {
      approvalStatus,
      artifactStatus,
      approved,
      changesRequested,
    } = approvalDecisionToStatuses(input.decision);
    const decidedAt = now();

    const [updatedApproval] = await tx
      .update(approvalRequests)
      .set({
        status: approvalStatus,
        decision: input.decision,
        approverUserId: context.userId,
        decisionComments: input.comments?.trim() || null,
        decisionReasonCategory: input.reasonCategory?.trim() || null,
        decidedAt,
        updatedAt: decidedAt,
      })
      .where(
        and(
          eq(approvalRequests.workspaceId, context.workspaceId),
          eq(approvalRequests.id, approvalId),
        ),
      )
      .returning();

    await tx
      .update(draftArtifacts)
      .set({
        status: artifactStatus,
        approvedAt: approved ? decidedAt : null,
        rejectedAt: approved ? null : decidedAt,
        updatedAt: decidedAt,
      })
      .where(
        and(
          eq(draftArtifacts.workspaceId, context.workspaceId),
          eq(draftArtifacts.id, detail.artifact.id),
          eq(draftArtifacts.artifactVersion, detail.artifact.artifactVersion),
        ),
      );

    if (detail.approval.opportunityId) {
      await tx
        .update(opportunities)
        .set({ approvalBlockedState: "NOT_BLOCKED", updatedAt: decidedAt })
        .where(
          and(
            eq(opportunities.workspaceId, context.workspaceId),
            eq(opportunities.id, detail.approval.opportunityId),
          ),
        );
    }

    await recordActivity(
      tx,
      context,
      approved
        ? "approval.approved"
        : changesRequested
          ? "approval.changes_requested"
          : "approval.rejected",
      "approval_request",
      approvalId,
      {
        artifactId: detail.artifact.id,
        artifactVersion: detail.artifact.artifactVersion,
        decision: input.decision,
      },
    );

    return updatedApproval;
  });
}

export async function getOpportunityPrepareState(
  context: WorkspaceContext,
  opportunityId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [run] = await tx
      .select()
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.workspaceId, context.workspaceId),
          eq(agentRuns.opportunityId, opportunityId),
        ),
      )
      .orderBy(desc(agentRuns.createdAt))
      .limit(1);
    const [artifact] = await tx
      .select()
      .from(draftArtifacts)
      .where(
        and(
          eq(draftArtifacts.workspaceId, context.workspaceId),
          eq(draftArtifacts.opportunityId, opportunityId),
        ),
      )
      .orderBy(desc(draftArtifacts.artifactVersion))
      .limit(1);
    const [approval] = artifact
      ? await tx
          .select()
          .from(approvalRequests)
          .where(
            and(
              eq(approvalRequests.workspaceId, context.workspaceId),
              eq(approvalRequests.targetArtifactId, artifact.id),
              eq(
                approvalRequests.targetArtifactVersion,
                artifact.artifactVersion,
              ),
            ),
          )
          .limit(1)
      : [];

    return { run: run ?? null, artifact: artifact ?? null, approval: approval ?? null };
  });
}

export async function getPrepareStatesForOpportunities(
  context: WorkspaceContext,
  opportunityIds: string[],
  database = db,
) {
  if (opportunityIds.length === 0) {
    return new Map<
      string,
      Awaited<ReturnType<typeof getOpportunityPrepareState>>
    >();
  }

  return withTenantContext(database, context, async (tx) => {
    const latestRuns = await tx
      .selectDistinctOn([agentRuns.opportunityId], {
        opportunityId: agentRuns.opportunityId,
        id: agentRuns.id,
        status: agentRuns.status,
        createdAt: agentRuns.createdAt,
      })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.workspaceId, context.workspaceId),
          inArray(agentRuns.opportunityId, opportunityIds),
        ),
      )
      .orderBy(agentRuns.opportunityId, desc(agentRuns.createdAt));
    const latestArtifacts = await tx
      .selectDistinctOn([draftArtifacts.opportunityId], {
        opportunityId: draftArtifacts.opportunityId,
        id: draftArtifacts.id,
        artifactVersion: draftArtifacts.artifactVersion,
        status: draftArtifacts.status,
      })
      .from(draftArtifacts)
      .where(
        and(
          eq(draftArtifacts.workspaceId, context.workspaceId),
          inArray(draftArtifacts.opportunityId, opportunityIds),
        ),
      )
      .orderBy(
        draftArtifacts.opportunityId,
        desc(draftArtifacts.artifactVersion),
      );
    const artifactIds = latestArtifacts.map((artifact) => artifact.id);
    const approvals =
      artifactIds.length > 0
        ? await tx
            .select()
            .from(approvalRequests)
            .where(
              and(
                eq(approvalRequests.workspaceId, context.workspaceId),
                inArray(approvalRequests.targetArtifactId, artifactIds),
              ),
            )
            .orderBy(desc(approvalRequests.requestedAt))
        : [];

    const runByOpportunity = new Map(
      latestRuns
        .filter((run) => Boolean(run.opportunityId))
        .map((run) => [run.opportunityId as string, run]),
    );
    const artifactByOpportunity = new Map(
      latestArtifacts
        .filter((artifact) => Boolean(artifact.opportunityId))
        .map((artifact) => [artifact.opportunityId as string, artifact]),
    );
    const approvalByArtifact = new Map(
      approvals.map((approval) => [approval.targetArtifactId, approval]),
    );

    return new Map(
      opportunityIds.map((opportunityId) => {
        const artifact = artifactByOpportunity.get(opportunityId) ?? null;

        return [
          opportunityId,
          {
            run: runByOpportunity.get(opportunityId) ?? null,
            artifact,
            approval: artifact ? (approvalByArtifact.get(artifact.id) ?? null) : null,
          },
        ];
      }),
    );
  });
}

export async function getAgentDashboardSummary(
  context: WorkspaceContext,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [runsInProgress] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.workspaceId, context.workspaceId),
          inArray(agentRuns.status, ["QUEUED", "RUNNING"]),
        ),
      );
    const [failedRuns] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.workspaceId, context.workspaceId),
          inArray(agentRuns.status, ["FAILED", "BUDGET_LIMITED", "TIMED_OUT"]),
        ),
      );
    const [draftsAwaitingReview] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(draftArtifacts)
      .where(
        and(
          eq(draftArtifacts.workspaceId, context.workspaceId),
          eq(draftArtifacts.status, "AWAITING_APPROVAL"),
        ),
      );
    const [approvalsPending] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.workspaceId, context.workspaceId),
          eq(approvalRequests.status, "PENDING"),
        ),
      );
    const [opportunitiesReadyForPrepare] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.workspaceId, context.workspaceId),
          inArray(opportunities.status, ["DRAFT", "READY", "IN_PROGRESS"]),
          eq(opportunities.approvalBlockedState, "NOT_BLOCKED"),
        ),
      );

    return {
      runsInProgress: runsInProgress?.count ?? 0,
      failedRuns: failedRuns?.count ?? 0,
      draftsAwaitingReview: draftsAwaitingReview?.count ?? 0,
      approvalsPending: approvalsPending?.count ?? 0,
      opportunitiesReadyForPrepare: opportunitiesReadyForPrepare?.count ?? 0,
    };
  });
}

export async function listClientFactualControls(
  context: WorkspaceContext,
  clientId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [client] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(
        and(eq(clients.workspaceId, context.workspaceId), eq(clients.id, clientId)),
      )
      .limit(1);

    if (!client) throw new Error("Client was not found.");

    const sources = await tx
      .select()
      .from(clientKnowledgeSources)
      .where(
        and(
          eq(clientKnowledgeSources.workspaceId, context.workspaceId),
          eq(clientKnowledgeSources.clientId, clientId),
          isNull(clientKnowledgeSources.archivedAt),
        ),
      )
      .orderBy(desc(clientKnowledgeSources.createdAt));
    const facts = await tx
      .select()
      .from(businessFacts)
      .where(
        and(
          eq(businessFacts.workspaceId, context.workspaceId),
          eq(businessFacts.clientId, clientId),
          isNull(businessFacts.archivedAt),
        ),
      )
      .orderBy(desc(businessFacts.createdAt));
    const policies = await tx
      .select()
      .from(claimPolicies)
      .where(
        and(
          eq(claimPolicies.workspaceId, context.workspaceId),
          eq(claimPolicies.clientId, clientId),
          isNull(claimPolicies.archivedAt),
        ),
      )
      .orderBy(desc(claimPolicies.createdAt));

    return { sources, facts, policies };
  });
}

export async function createBusinessFact(
  context: WorkspaceContext,
  clientId: string,
  input: {
    factType: string;
    value: string;
    sourceReference: string;
    verificationStatus?: string;
    sensitivity?: string;
  },
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN", "ANALYST"]);

  const factType = input.factType.trim();
  const value = input.value.trim();
  const sourceReference = input.sourceReference.trim();

  if (!factType || !value || !sourceReference) {
    throw new Error("Fact type, value, and source reference are required.");
  }

  return withTenantContext(database, context, async (tx) => {
    const [fact] = await tx
      .insert(businessFacts)
      .values({
        workspaceId: context.workspaceId,
        clientId,
        factType,
        value,
        sourceReference,
        verificationStatus:
          input.verificationStatus === "VERIFIED" ? "VERIFIED" : "NEEDS_REVIEW",
        approvedByUserId:
          input.verificationStatus === "VERIFIED" ? context.userId : null,
        sensitivity:
          input.sensitivity === "INTERNAL" ||
          input.sensitivity === "CONFIDENTIAL"
            ? input.sensitivity
            : "PUBLIC",
      })
      .returning();

    await recordActivity(tx, context, "business_fact.created", "business_fact", fact.id, {
      clientId,
      factType,
      verificationStatus: fact.verificationStatus,
    });

    return fact;
  });
}

export async function createClientKnowledgeSource(
  context: WorkspaceContext,
  clientId: string,
  input: {
    sourceType: string;
    title: string;
    sourceUrl?: string;
    excerpt?: string;
    verificationStatus?: string;
  },
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN", "ANALYST"]);

  const title = input.title.trim();

  if (!title) {
    throw new Error("Source title is required.");
  }

  return withTenantContext(database, context, async (tx) => {
    const [source] = await tx
      .insert(clientKnowledgeSources)
      .values({
        workspaceId: context.workspaceId,
        clientId,
        sourceType:
          input.sourceType === "ONBOARDING_ANSWER"
            ? "ONBOARDING_ANSWER"
            : "WEBSITE_PAGE",
        title,
        sourceUrl: input.sourceUrl?.trim() || null,
        excerpt: input.excerpt?.trim() || null,
        verificationStatus:
          input.verificationStatus === "VERIFIED" ? "VERIFIED" : "NEEDS_REVIEW",
        approvedByUserId:
          input.verificationStatus === "VERIFIED" ? context.userId : null,
      })
      .returning();

    await recordActivity(
      tx,
      context,
      "client_knowledge_source.created",
      "client_knowledge_source",
      source.id,
      { clientId, sourceType: source.sourceType },
    );

    return source;
  });
}

export async function createClaimPolicy(
  context: WorkspaceContext,
  clientId: string,
  input: {
    ruleType: string;
    claimCategory: string;
    rule: string;
    requiredDisclaimer?: string;
  },
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN", "ANALYST"]);

  const claimCategory = input.claimCategory.trim();
  const rule = input.rule.trim();

  if (!claimCategory || !rule) {
    throw new Error("Claim category and rule are required.");
  }

  return withTenantContext(database, context, async (tx) => {
    const [policy] = await tx
      .insert(claimPolicies)
      .values({
        workspaceId: context.workspaceId,
        clientId,
        ruleType:
          input.ruleType === "PROHIBITED"
            ? "PROHIBITED"
            : input.ruleType === "REQUIRES_APPROVAL"
              ? "REQUIRES_APPROVAL"
              : input.ruleType === "REQUIRED_DISCLAIMER"
                ? "REQUIRED_DISCLAIMER"
                : input.ruleType === "STRICTER_REVIEW"
                  ? "STRICTER_REVIEW"
                  : "ALLOWED",
        claimCategory,
        rule,
        requiredDisclaimer: input.requiredDisclaimer?.trim() || null,
      })
      .returning();

    await recordActivity(tx, context, "claim_policy.created", "claim_policy", policy.id, {
      clientId,
      ruleType: policy.ruleType,
      claimCategory,
    });

    return policy;
  });
}
