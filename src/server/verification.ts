import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { activityEvents, agentDefinitions, agentRuns, approvalRequests, draftArtifacts, implementationPackages, implementationVerificationRecords, manualImplementationRecords, monthlyCycles, monthlyCycleWorkItems, operationalNotifications, opportunities, websites } from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import { getEnabledAgentDefinition } from "@/domain/agents/catalog";
import { requirePersistedAgentDefinition } from "@/domain/agents/persisted-catalog";
import { createBudgetSnapshot, assertWithinBudget, byteLength, type AgentRunBudgetSnapshot } from "@/domain/agents/budget";
import { assertToolAllowedForAgent } from "@/domain/agents/tool-registry";
import { MonthlyCycleValidationError } from "@/domain/monthly-cycles/validation";
import { assertWorkspaceRole, type WorkspaceContext } from "@/domain/tenancy/context";
import { buildImplementationPackage, observeImplementation, packageSchema, VERIFICATION_METHOD_VERSION, type VerificationObservation } from "@/domain/verification/verification";
import type { SafeFetchOptions } from "@/security/safe-fetch";
import { recordToolCall } from "./agents";
import { recordImplementationVerification } from "./monthly-cycles";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const scoped = (workspaceId: string, id: string) => and(eq(agentRuns.workspaceId, workspaceId), eq(agentRuns.id, id));

export async function createImplementationPackage(context: WorkspaceContext, artifactId: string, database = db) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN", "ANALYST"]);
  if (context.actorType !== "USER" || !context.userId) throw new MonthlyCycleValidationError("A human must request the implementation package.");
  return withTenantContext(database, context, async tx => {
    const [artifact] = await tx.select().from(draftArtifacts).where(and(eq(draftArtifacts.workspaceId, context.workspaceId), eq(draftArtifacts.id, artifactId), eq(draftArtifacts.status, "APPROVED"))).limit(1);
    if (!artifact?.websiteId || !artifact.clientId || !artifact.opportunityId) throw new MonthlyCycleValidationError("An approved artifact version for this workspace is required.");
    const [approval] = await tx.select().from(approvalRequests).where(and(eq(approvalRequests.workspaceId, context.workspaceId), eq(approvalRequests.targetArtifactId, artifact.id), eq(approvalRequests.targetArtifactVersion, artifact.artifactVersion), eq(approvalRequests.status, "APPROVED"))).limit(1);
    if (!approval || approval.proposedExternalExecution) throw new MonthlyCycleValidationError("Exact version approval was not found.");
    const [existing] = await tx.select().from(implementationPackages).where(and(eq(implementationPackages.workspaceId, context.workspaceId), eq(implementationPackages.artifactId, artifact.id), eq(implementationPackages.artifactVersion, artifact.artifactVersion))).limit(1);
    if (existing) return existing;
    const [site] = await tx.select().from(websites).where(and(eq(websites.workspaceId, context.workspaceId), eq(websites.id, artifact.websiteId), eq(websites.clientId, artifact.clientId))).limit(1);
    if (!site) throw new MonthlyCycleValidationError("Website was not found for the approved artifact.");
    const snapshot = buildImplementationPackage({ ...artifact, evidenceRefs: artifact.sourceEvidenceRefs }, site.canonicalUrl);
    const [created] = await tx.insert(implementationPackages).values({ workspaceId: context.workspaceId, clientId: artifact.clientId, websiteId: artifact.websiteId, opportunityId: artifact.opportunityId, artifactId: artifact.id, artifactVersion: artifact.artifactVersion, approvalId: approval.id, snapshot, contentHash: hash(snapshot), createdByUserId: context.userId }).onConflictDoNothing().returning();
    if (!created) {
      const [concurrent] = await tx.select().from(implementationPackages).where(and(eq(implementationPackages.workspaceId, context.workspaceId), eq(implementationPackages.artifactId, artifact.id))).limit(1);
      if (!concurrent) throw new Error("Implementation package insert did not produce its exact version snapshot.");
      return concurrent;
    }
    await tx.insert(activityEvents).values({ workspaceId: context.workspaceId, actorType: context.actorType, actorUserId: context.userId, action: "implementation_package.created", resourceType: "implementation_package", resourceId: created.id, summary: { artifactId, artifactVersion: artifact.artifactVersion, externalExecution: false } });
    return created;
  });
}

export async function getImplementationPackage(context: WorkspaceContext, id: string, database = db) {
  return withTenantContext(database, context, async tx => (await tx.select().from(implementationPackages).where(and(eq(implementationPackages.workspaceId, context.workspaceId), eq(implementationPackages.id, id))).limit(1))[0] ?? null);
}

export async function requestImplementationVerification(context: WorkspaceContext, implementationId: string, database = db) {
  // Use the sensitive manual-implementation role boundary for this new action.
  // The existing human-verification role policy remains unchanged.
  assertWorkspaceRole(context, ["OWNER", "ADMIN"]);
  return withTenantContext(database, context, async tx => {
    const [implementation] = await tx.select().from(manualImplementationRecords).where(and(eq(manualImplementationRecords.workspaceId, context.workspaceId), eq(manualImplementationRecords.id, implementationId))).limit(1);
    if (!implementation?.implementationPackageId) throw new MonthlyCycleValidationError("Select an approved implementation package and record implementation before requesting verification.");
    const [cycle] = await tx.select().from(monthlyCycles).where(and(eq(monthlyCycles.workspaceId, context.workspaceId), eq(monthlyCycles.id, implementation.monthlyCycleId))).limit(1).for("update");
    if (!cycle || !["OPEN", "IN_PROGRESS", "REVIEW_REQUIRED"].includes(cycle.status)) throw new MonthlyCycleValidationError("Verification requires an open monthly cycle.");
    const [latest] = await tx.select().from(manualImplementationRecords).where(and(eq(manualImplementationRecords.workspaceId, context.workspaceId), eq(manualImplementationRecords.cycleWorkItemId, implementation.cycleWorkItemId))).orderBy(desc(manualImplementationRecords.createdAt), desc(manualImplementationRecords.id)).limit(1);
    if (latest.id !== implementation.id) throw new MonthlyCycleValidationError("Select the current implementation; older versions remain historical.");
    const [work] = await tx.select().from(monthlyCycleWorkItems).where(and(eq(monthlyCycleWorkItems.workspaceId, context.workspaceId), eq(monthlyCycleWorkItems.id, implementation.cycleWorkItemId))).limit(1);
    if (!work || work.status === "REMOVED") throw new MonthlyCycleValidationError("Active cycle work was not found.");
    const [pkg] = await tx.select().from(implementationPackages).where(and(eq(implementationPackages.workspaceId, context.workspaceId), eq(implementationPackages.id, implementation.implementationPackageId), eq(implementationPackages.artifactId, implementation.artifactId!), eq(implementationPackages.artifactVersion, implementation.artifactVersion!))).limit(1);
    if (!pkg || pkg.opportunityId !== implementation.opportunityId) throw new MonthlyCycleValidationError("Exact implementation package binding was not found.");
    const snapshot = packageSchema.parse(pkg.snapshot);
    if (!snapshot.checks.length) throw new MonthlyCycleValidationError("This package requires human review; no deterministic method is supported.");
    // Retire expired attempts across this cycle, including superseded manual
    // records. Otherwise an orphaned older run could block close indefinitely.
    await tx.update(agentRuns).set({ status: "TIMED_OUT", completedAt: new Date(), errorSummary: "Verification attempt expired without a completed result; no pass is claimed." }).where(and(eq(agentRuns.workspaceId, context.workspaceId), eq(agentRuns.agentKey, "verification"), sql`${agentRuns.inputSummary}->>'monthlyCycleId' = ${cycle.id}`, inArray(agentRuns.status, ["QUEUED", "RUNNING"]), sql`${agentRuns.deadlineAt} < now()`));
    const [active] = await tx.select().from(agentRuns).where(and(eq(agentRuns.workspaceId, context.workspaceId), eq(agentRuns.agentKey, "verification"), sql`${agentRuns.inputSummary}->>'implementationRecordId' = ${implementation.id}`, inArray(agentRuns.status, ["QUEUED", "RUNNING"]))).limit(1);
    if (active && active.deadlineAt && active.deadlineAt > new Date()) return { agentRunId: active.id, shouldStartWorkflow: false };
    if (active) await tx.update(agentRuns).set({ status: "TIMED_OUT", completedAt: new Date(), errorSummary: "Verification attempt expired; request a new attempt." }).where(scoped(context.workspaceId, active.id));
    const agent = getEnabledAgentDefinition("verification");
    const [definition] = await tx.select().from(agentDefinitions).where(and(eq(agentDefinitions.key, agent.key), eq(agentDefinitions.version, agent.version))).limit(1);
    const persisted = requirePersistedAgentDefinition(agent, definition);
    agent.allowedToolKeys.forEach(key => assertToolAllowedForAgent(agent, key));
    const budget = createBudgetSnapshot(agent.budgetLimits);
    assertWithinBudget(budget, { toolCalls: 0, modelCalls: 0, evidenceBytes: 0, inputBytes: byteLength(JSON.stringify(snapshot)), outputBytes: 0, costCents: 0 });
    const [run] = await tx.insert(agentRuns).values({ workspaceId: context.workspaceId, clientId: implementation.clientId, websiteId: implementation.websiteId, opportunityId: implementation.opportunityId, agentDefinitionId: persisted.id, agentKey: agent.key, agentVersion: agent.version, permissionLevel: "OBSERVE", triggerType: "USER", status: "QUEUED", inputSummary: { implementationRecordId: implementation.id, implementationPackageId: pkg.id, artifactId: pkg.artifactId, artifactVersion: pkg.artifactVersion, monthlyCycleId: cycle.id, cycleWorkItemId: work.id, expectedPackageHash: pkg.contentHash }, allowedToolSnapshot: agent.allowedToolKeys, budgetSnapshot: budget, timeoutSeconds: agent.defaultTimeoutSeconds, deadlineAt: new Date(Date.now() + agent.defaultTimeoutSeconds * 1000), provider: "deterministic", model: VERIFICATION_METHOD_VERSION, promptTemplateVersion: "none-deterministic-verification", outputSchemaVersion: agent.outputSchemaVersion, estimatedToolCalls: 3, idempotencyKey: `verification:${implementation.id}:${randomUUID()}`, createdByUserId: context.userId }).returning();
    await tx.insert(activityEvents).values({ workspaceId: context.workspaceId, actorType: context.actorType, actorUserId: context.userId, action: "agent_run.queued", resourceType: "agent_run", resourceId: run.id, summary: { agentKey: agent.key, implementationRecordId: implementation.id, permissionLevel: "OBSERVE" } });
    return { agentRunId: run.id, shouldStartWorkflow: true };
  });
}

export async function executeImplementationVerification(context: WorkspaceContext, runId: string, database = db, fetchOptions: SafeFetchOptions = {}) {
  const prepared = await withTenantContext(database, context, async tx => {
    const [run] = await tx.select().from(agentRuns).where(and(scoped(context.workspaceId, runId), eq(agentRuns.agentKey, "verification"))).limit(1).for("update");
    if (!run) throw new MonthlyCycleValidationError("Verification run was not found.");
    if (run.status !== "QUEUED") return { run, pkg: null };
    const [pkg] = await tx.select().from(implementationPackages).where(and(eq(implementationPackages.workspaceId, context.workspaceId), eq(implementationPackages.id, String(run.inputSummary.implementationPackageId)))).limit(1);
    if (!pkg || pkg.contentHash !== run.inputSummary.expectedPackageHash || pkg.opportunityId !== run.opportunityId || hash(pkg.snapshot) !== pkg.contentHash) throw new Error("Immutable verification package integrity check failed.");
    const agent = getEnabledAgentDefinition("verification");
    if (run.agentVersion !== agent.version || run.permissionLevel !== "OBSERVE") throw new Error("Verification runtime definition changed.");
    await tx.update(agentRuns).set({ status: "RUNNING", startedAt: new Date() }).where(scoped(context.workspaceId, runId));
    await recordToolCall(tx, context, { agentRunId: runId, toolKey: "read.implementation_package.v1", permissionLevel: "OBSERVE", outputSummary: { packageId: pkg.id, artifactVersion: pkg.artifactVersion } });
    return { run, pkg };
  });
  if (!prepared.pkg) return prepared.run;
  try {
    const snapshot = packageSchema.parse(prepared.pkg.snapshot);
    const observation: VerificationObservation = prepared.run.deadlineAt && prepared.run.deadlineAt < new Date() ? { result: "UNAVAILABLE", rationale: "Verification deadline expired before observation.", methodVersion: VERIFICATION_METHOD_VERSION, targetUrl: snapshot.targetUrl, observedAt: new Date().toISOString(), comparisons: [], limitations: snapshot.limitations, evidenceBytes: 0 } : await observeImplementation(snapshot, fetchOptions);
    assertWithinBudget(prepared.run.budgetSnapshot as AgentRunBudgetSnapshot, { toolCalls: 3, modelCalls: 0, evidenceBytes: observation.evidenceBytes, inputBytes: byteLength(JSON.stringify(snapshot)), outputBytes: byteLength(JSON.stringify(observation)), costCents: 0 });
    return await withTenantContext(database, context, async tx => {
      // Match the cycle -> run lock ordering used by requests and cycle close.
      await tx.select({ id: monthlyCycles.id }).from(monthlyCycles).where(and(eq(monthlyCycles.workspaceId, context.workspaceId), eq(monthlyCycles.id, String(prepared.run.inputSummary.monthlyCycleId)))).limit(1).for("update");
      const [run] = await tx.select().from(agentRuns).where(scoped(context.workspaceId, runId)).limit(1).for("update");
      if (run.status !== "RUNNING") return run;
      const pinned = { transaction: async (operation: (transaction: Tx) => Promise<unknown>) => operation(tx) } as unknown as typeof db;
      const record = await recordImplementationVerification(context, String(run.inputSummary.cycleWorkItemId), { status: observation.result, verificationMethod: VERIFICATION_METHOD_VERSION, evidence: observation.rationale, limitations: observation.limitations.join(" "), agentRunId: runId, implementationRecordId: String(run.inputSummary.implementationRecordId), observation }, pinned);
      await recordToolCall(tx, context, { agentRunId: runId, toolKey: "read.public_verification_target.v1", permissionLevel: "OBSERVE", status: observation.contentHash ? "SUCCEEDED" : "SKIPPED", targetSummary: { url: snapshot.targetUrl }, outputSummary: { contentHash: observation.contentHash, statusCode: observation.statusCode } });
      await recordToolCall(tx, context, { agentRunId: runId, toolKey: "compare.approved_implementation.v1", permissionLevel: "OBSERVE", outputSummary: { result: observation.result, verificationId: record.id } }); // gitleaks:allow -- public tool catalog identifier, not a credential
      const [finished] = await tx.update(agentRuns).set({ status: "SUCCEEDED", structuredOutput: { ...observation, verificationId: record.id }, outputRef: record.id, evidenceRefs: [record.id], rationale: observation.rationale, actualToolCalls: 3, completedAt: new Date(), updatedAt: new Date(), source: "independent-public-html", nextAction: observation.result === "VERIFIED" ? "Review the verification evidence." : "Review evidence and correct or manually assess the implementation." }).where(scoped(context.workspaceId, runId)).returning();
      if (observation.result !== "VERIFIED") {
        const [opportunity] = await tx.select().from(opportunities).where(and(eq(opportunities.workspaceId, context.workspaceId), eq(opportunities.id, run.opportunityId!))).limit(1);
        if (observation.result !== "UNAVAILABLE" || ["HIGH", "CRITICAL"].includes(opportunity?.sourceSeverity ?? "")) await tx.insert(operationalNotifications).values({ workspaceId: context.workspaceId, type: "implementation.verification_attention", severity: observation.result === "VERIFICATION_FAILED" ? "HIGH" : "MEDIUM", title: `Implementation ${observation.result}`, summary: observation.rationale, resourceType: "verification", resourceId: record.id });
      }
      await tx.insert(activityEvents).values({ workspaceId: context.workspaceId, actorType: context.actorType, actorUserId: context.userId, action: "agent_run.succeeded", resourceType: "agent_run", resourceId: runId, summary: { result: observation.result, verificationId: record.id, permissionLevel: "OBSERVE", externalExecution: false } });
      return finished;
    });
  } catch (error) {
    await withTenantContext(database, context, async tx => {
      await tx.update(agentRuns).set({ status: "FAILED", errorSummary: "Unexpected verification failure; inspect server logs and retry.", completedAt: new Date() }).where(scoped(context.workspaceId, runId));
      await tx.insert(activityEvents).values({ workspaceId: context.workspaceId, actorType: context.actorType, actorUserId: context.userId, action: "agent_run.failed", resourceType: "agent_run", resourceId: runId, summary: { agentKey: "verification" } });
    });
    throw error;
  }
}

export async function getVerificationDetail(context: WorkspaceContext, id: string, database = db) {
  return withTenantContext(database, context, async tx => {
    const [record] = await tx.select().from(implementationVerificationRecords).where(and(eq(implementationVerificationRecords.workspaceId, context.workspaceId), eq(implementationVerificationRecords.id, id))).limit(1);
    if (!record) return null;
    const [implementation] = record.implementationRecordId ? await tx.select().from(manualImplementationRecords).where(and(eq(manualImplementationRecords.workspaceId, context.workspaceId), eq(manualImplementationRecords.id, record.implementationRecordId))).limit(1) : [];
    return { ...record, implementation: implementation ?? null };
  });
}

export async function getCycleVerificationContext(context: WorkspaceContext, cycleId: string, database = db) {
  return withTenantContext(database, context, async tx => {
    const [cycle] = await tx.select().from(monthlyCycles).where(and(eq(monthlyCycles.workspaceId, context.workspaceId), eq(monthlyCycles.id, cycleId))).limit(1);
    if (!cycle) return { packages: [], runs: [] };
    const [packages, runs] = await Promise.all([
      tx.select().from(implementationPackages).where(and(eq(implementationPackages.workspaceId, context.workspaceId), eq(implementationPackages.clientId, cycle.clientId))).orderBy(desc(implementationPackages.artifactVersion)),
      tx.select().from(agentRuns).where(and(eq(agentRuns.workspaceId, context.workspaceId), eq(agentRuns.agentKey, "verification"), sql`${agentRuns.inputSummary}->>'monthlyCycleId' = ${cycleId}`)).orderBy(desc(agentRuns.createdAt)),
    ]);
    return { packages, runs };
  });
}

export async function getVerificationDashboard(context: WorkspaceContext, database = db) {
  return withTenantContext(database, context, async tx => {
    const [counts] = await tx.select({ awaiting: sql<number>`count(*) filter (where ${monthlyCycleWorkItems.completionState} = 'IMPLEMENTED_UNVERIFIED')::int`, failed: sql<number>`count(*) filter (where ${monthlyCycleWorkItems.completionState} = 'VERIFICATION_FAILED')::int`, warnings: sql<number>`count(*) filter (where ${monthlyCycleWorkItems.completionState} = 'VERIFICATION_WARNING')::int`, verified: sql<number>`count(*) filter (where ${monthlyCycleWorkItems.completionState} = 'VERIFIED')::int` }).from(monthlyCycleWorkItems).innerJoin(monthlyCycles, and(eq(monthlyCycles.workspaceId, monthlyCycleWorkItems.workspaceId), eq(monthlyCycles.id, monthlyCycleWorkItems.monthlyCycleId))).where(and(eq(monthlyCycleWorkItems.workspaceId, context.workspaceId), sql`${monthlyCycleWorkItems.status} <> 'REMOVED'`, sql`current_date between ${monthlyCycles.periodStartDate} and ${monthlyCycles.periodEndDate}`));
    return counts;
  });
}
