import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant";
import { activityEvents, agentDefinitions, agentRuns, agentToolCalls, clients, executionApprovals, executionRecords, implementationPackages, qaExecutionFixtures, websites, workspaceFeatureFlags, workspaceMemberships, workspaces } from "@/db/schema";
import { assertWorkspaceRole, type WorkspaceContext } from "@/domain/tenancy/context";
import { createBudgetSnapshot, assertWithinBudget, byteLength, type AgentRunBudgetSnapshot } from "@/domain/agents/budget";
import { getEnabledAgentDefinition } from "@/domain/agents/catalog";
import { requirePersistedAgentDefinition } from "@/domain/agents/persisted-catalog";
import { getAgentToolDefinition } from "@/domain/agents/tool-registry";
import { actionSchema, assertPrecondition, assertQaEnvironment, assertQaExecutionGates, executionHash, ExecutionValidationError, fixtureSnapshot, fixtureUrl, proposedMetadata, parseAction, QA_ACTION, QA_ACTION_FLAG, QA_AGENT, QA_TOOL, QA_WORKSPACE_FLAG, snapshotSchema, type QaRuntime } from "@/domain/execution/qa-execution";
import { observeImplementation, packageSchema, VERIFICATION_METHOD_VERSION } from "@/domain/verification/verification";
import { serverEnv } from "@/lib/env";
import type { SafeFetchOptions } from "@/security/safe-fetch";
import { createBusinessFact, recordToolCall } from "./agents";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Execution = typeof executionRecords.$inferSelect;
const scope = (workspaceId: string, id: string) => and(eq(executionRecords.workspaceId, workspaceId), eq(executionRecords.id, id));
const human = (c: WorkspaceContext) => { assertWorkspaceRole(c, ["OWNER", "ADMIN"]); if (c.actorType !== "USER" || !c.userId) throw new ExecutionValidationError("A human OWNER/ADMIN is required."); };
async function event(tx: Tx, c: WorkspaceContext, action: string, id: string, summary: Record<string, unknown> = {}) {
  await tx.insert(activityEvents).values({ workspaceId: c.workspaceId, actorType: c.actorType, actorUserId: c.userId, action, resourceType: "execution", resourceId: id, summary: { ...summary, qaSandboxOnly: true } });
}
async function lockWorkspace(tx: Tx, c: WorkspaceContext) { await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, c.workspaceId)).for("update"); }
async function currentRole(tx: Tx, c: WorkspaceContext) {
  const [membership] = await tx.select().from(workspaceMemberships).where(and(eq(workspaceMemberships.workspaceId, c.workspaceId), eq(workspaceMemberships.userId, c.userId!), eq(workspaceMemberships.status, "ACTIVE"))).limit(1);
  return membership?.role ?? "NONE";
}
async function flags(tx: Tx, c: WorkspaceContext) {
  const rows = await tx.select().from(workspaceFeatureFlags).where(and(eq(workspaceFeatureFlags.workspaceId, c.workspaceId), eq(workspaceFeatureFlags.environment, "qa")));
  return { workspaceEnabled: rows.some(r => r.key === QA_WORKSPACE_FLAG && r.enabled), actionEnabled: rows.some(r => r.key === QA_ACTION_FLAG && r.enabled) };
}
export async function setQaExecutionFlag(c: WorkspaceContext, key: string, enabled: boolean, database = db, env: QaRuntime = serverEnv) {
  human(c); assertQaEnvironment(env);
  if (![QA_WORKSPACE_FLAG, QA_ACTION_FLAG].includes(key)) throw new ExecutionValidationError("Unknown execution switch.");
  return withTenantContext(database, c, async tx => {
    await lockWorkspace(tx, c);
    await tx.insert(workspaceFeatureFlags).values({ workspaceId: c.workspaceId, key, environment: "qa", enabled }).onConflictDoUpdate({ target: [workspaceFeatureFlags.workspaceId, workspaceFeatureFlags.key, workspaceFeatureFlags.environment], set: { enabled } });
    await event(tx, c, "execution.switch_changed", c.workspaceId, { key, enabled });
  });
}
export async function createQaExecutionFixture(c: WorkspaceContext, faultMode: string, database = db, env: QaRuntime = serverEnv) {
  human(c); assertQaEnvironment(env);
  if (!["NONE", "TITLE_MISMATCH"].includes(faultMode)) throw new ExecutionValidationError("Unknown QA fixture scenario.");
  const fixture = await withTenantContext(database, c, async tx => {
    const id = randomUUID();
    const [client] = await tx.insert(clients).values({ workspaceId: c.workspaceId, name: `QA Sandbox ${id.slice(0, 8)}`, servicePlan: "GROWTH" }).returning();
    const [site] = await tx.insert(websites).values({ workspaceId: c.workspaceId, clientId: client.id, displayName: "QA SANDBOX EXECUTION", canonicalUrl: fixtureUrl(c.workspaceId, id), domain: "optiq-qa.vercel.app", authorizationScope: { scope: "PUBLIC_PAGES_ONLY", recordedAt: new Date().toISOString() } }).returning();
    const [row] = await tx.insert(qaExecutionFixtures).values({ id, workspaceId: c.workspaceId, clientId: client.id, websiteId: site.id, faultMode: faultMode as "NONE" | "TITLE_MISMATCH", createdByUserId: c.userId! }).returning();
    await event(tx, c, "execution.fixture_created", id, { faultMode, websiteId: site.id });
    return row;
  });
  for (const [factType, value] of [["business_name", "OPTIQ QA Sandbox"], ["service", "QA metadata testing"]]) await createBusinessFact(c, fixture.clientId, { factType, value, sourceReference: "Application-owned harmless QA fixture; no customer business", verificationStatus: "VERIFIED", sensitivity: "PUBLIC" }, database);
  return fixture;
}
export async function getPublicQaFixture(workspaceId: string, fixtureId: string, database = db, env: QaRuntime = serverEnv) {
  assertQaEnvironment(env);
  // This deliberately public read selects only harmless fixture metadata. The
  // URL supplies scope, never authority for any mutation or customer-data read.
  return withTenantContext(database, { workspaceId, actorType: "SYSTEM", role: "OWNER" }, async tx => (await tx.select({ title: qaExecutionFixtures.title, description: qaExecutionFixtures.description, faultMode: qaExecutionFixtures.faultMode, lastOperation: qaExecutionFixtures.lastOperation }).from(qaExecutionFixtures).where(and(eq(qaExecutionFixtures.workspaceId, workspaceId), eq(qaExecutionFixtures.id, fixtureId))).limit(1))[0] ?? null);
}
export async function requestQaExecutionApproval(c: WorkspaceContext, packageId: string, database = db, env: QaRuntime = serverEnv) {
  human(c); assertQaEnvironment(env);
  return withTenantContext(database, c, async tx => {
    await lockWorkspace(tx, c);
    const [pkg] = await tx.select().from(implementationPackages).where(and(eq(implementationPackages.workspaceId, c.workspaceId), eq(implementationPackages.id, packageId))).limit(1);
    if (!pkg) throw new ExecutionValidationError("Approved implementation package was not found.");
    const [fixture] = await tx.select().from(qaExecutionFixtures).where(and(eq(qaExecutionFixtures.workspaceId, c.workspaceId), eq(qaExecutionFixtures.websiteId, pkg.websiteId), eq(qaExecutionFixtures.clientId, pkg.clientId))).limit(1).for("update");
    const snapshot = packageSchema.parse(pkg.snapshot);
    if (!fixture || snapshot.targetUrl !== fixtureUrl(c.workspaceId, fixture.id)) throw new ExecutionValidationError("Only the dedicated QA fixture can be executed.");
    const before = fixtureSnapshot(fixture); const after = proposedMetadata(snapshot, before);
    const existing = await tx.select().from(executionApprovals).where(and(eq(executionApprovals.workspaceId, c.workspaceId), eq(executionApprovals.implementationPackageId, pkg.id), inArray(executionApprovals.status, ["PENDING", "APPROVED"]))).orderBy(desc(executionApprovals.createdAt));
    for (const candidate of existing) {
      if (parseAction(candidate.actionSummary).before.hash !== before.hash) continue;
      const [used] = await tx.select({ id: executionRecords.id }).from(executionRecords).where(and(eq(executionRecords.workspaceId, c.workspaceId), eq(executionRecords.approvalId, candidate.id))).limit(1);
      if (!used) return candidate;
    }
    const id = randomUUID();
    const action = actionSchema.parse({ version: "qa.metadata.apply-v1.0", actionKey: QA_ACTION, toolKey: QA_TOOL, approvalRequestId: id, workspaceId: c.workspaceId, fixtureId: fixture.id, packageId: pkg.id, packageHash: pkg.contentHash, artifactId: pkg.artifactId, artifactVersion: pkg.artifactVersion, target: snapshot.targetUrl, before, after, risk: "LOW", rollback: "RESTORE_EXACT_SNAPSHOT_ON_FAILED_OR_OWNER_ADMIN_REQUEST", verificationRequired: true });
    const [approval] = await tx.insert(executionApprovals).values({ id, workspaceId: c.workspaceId, clientId: pkg.clientId, websiteId: pkg.websiteId, opportunityId: pkg.opportunityId, fixtureId: fixture.id, implementationPackageId: pkg.id, artifactId: pkg.artifactId, artifactVersion: pkg.artifactVersion, actionSummary: action, actionHash: executionHash(action), requestedByUserId: c.userId! }).returning();
    await event(tx, c, "execution.requested", id); await event(tx, c, "execution.approval_requested", id, { actionHash: approval.actionHash });
    return approval;
  });
}
export async function decideQaExecutionApproval(c: WorkspaceContext, id: string, decision: "APPROVED" | "REJECTED", database = db, env: QaRuntime = serverEnv) {
  human(c); assertQaEnvironment(env);
  if (!["APPROVED", "REJECTED"].includes(decision)) throw new ExecutionValidationError("Unknown execution decision.");
  return withTenantContext(database, c, async tx => {
    await lockWorkspace(tx, c);
    const [row] = await tx.select().from(executionApprovals).where(and(eq(executionApprovals.workspaceId, c.workspaceId), eq(executionApprovals.id, id))).limit(1).for("update");
    if (!row) throw new ExecutionValidationError("Execution approval was not found.");
    if (row.status === decision) return row;
    if (row.status !== "PENDING") throw new ExecutionValidationError("The execution decision is immutable; request a new approval.");
    const [saved] = await tx.update(executionApprovals).set({ status: decision, decidedByUserId: c.userId, decidedAt: new Date() }).where(and(eq(executionApprovals.workspaceId, c.workspaceId), eq(executionApprovals.id, id))).returning();
    await event(tx, c, decision === "APPROVED" ? "execution.approved" : "execution.rejected", id, { actionHash: row.actionHash });
    return saved;
  });
}
async function createRun(tx: Tx, c: WorkspaceContext, approval: typeof executionApprovals.$inferSelect, executionId: string, key: string) {
  const agent = getEnabledAgentDefinition(key);
  const [stored] = await tx.select().from(agentDefinitions).where(and(eq(agentDefinitions.key, agent.key), eq(agentDefinitions.version, agent.version))).limit(1);
  const definition = requirePersistedAgentDefinition(agent, stored); const budget = createBudgetSnapshot(agent.budgetLimits);
  const [run] = await tx.insert(agentRuns).values({ workspaceId: c.workspaceId, clientId: approval.clientId, websiteId: approval.websiteId, opportunityId: approval.opportunityId, agentDefinitionId: definition.id, agentKey: agent.key, agentVersion: agent.version, permissionLevel: agent.defaultPermissionLevel, triggerType: "USER", status: "QUEUED", inputSummary: { executionRecordId: executionId, implementationPackageId: approval.implementationPackageId, actionHash: approval.actionHash }, allowedToolSnapshot: agent.allowedToolKeys, budgetSnapshot: budget, timeoutSeconds: agent.defaultTimeoutSeconds, deadlineAt: new Date(Date.now() + agent.defaultTimeoutSeconds * 1000), provider: "deterministic", model: key === "verification" ? VERIFICATION_METHOD_VERSION : "qa-metadata-adapter-v1.0", promptTemplateVersion: "none-deterministic-execution", outputSchemaVersion: agent.outputSchemaVersion, estimatedToolCalls: key === "verification" ? 3 : 1, idempotencyKey: `${key}:${executionId}`, createdByUserId: c.userId }).returning();
  await event(tx, c, "agent_run.queued", run.id, { agentKey: key });
  return run;
}
export async function requestQaExecution(c: WorkspaceContext, approvalId: string, database = db, env: QaRuntime = serverEnv) {
  human(c); assertQaEnvironment(env);
  return withTenantContext(database, c, async tx => {
    await lockWorkspace(tx, c);
    const [approval] = await tx.select().from(executionApprovals).where(and(eq(executionApprovals.workspaceId, c.workspaceId), eq(executionApprovals.id, approvalId))).limit(1).for("update");
    if (!approval || approval.status !== "APPROVED") throw new ExecutionValidationError("Separate approved execution approval is required; artifact approval is insufficient.");
    const action = parseAction(approval.actionSummary);
    const idempotencyKey = `apply:${approval.actionHash}`;
    const [existing] = await tx.select().from(executionRecords).where(and(eq(executionRecords.workspaceId, c.workspaceId), eq(executionRecords.idempotencyKey, idempotencyKey))).limit(1);
    if (existing) return existing;
    const id = randomUUID(); const run = await createRun(tx, c, approval, id, QA_AGENT);
    const [record] = await tx.insert(executionRecords).values({ id, workspaceId: c.workspaceId, clientId: approval.clientId, websiteId: approval.websiteId, opportunityId: approval.opportunityId, fixtureId: approval.fixtureId, implementationPackageId: approval.implementationPackageId, approvalId: approval.id, agentRunId: run.id, actionKey: action.actionKey, actionVersion: action.version, target: action.target, kind: "APPLY", actionSummary: action, actionHash: approval.actionHash, preChangeSnapshot: action.before, idempotencyKey, actorUserId: c.userId!, trigger: "USER" }).returning();
    return record;
  });
}
async function executeAudit(tx: Tx, c: WorkspaceContext, record: Execution, status: "SUCCEEDED" | "FAILED" | "SKIPPED", errorSummary?: string) {
  const tool = getAgentToolDefinition(QA_TOOL);
  await tx.insert(agentToolCalls).values({ workspaceId: c.workspaceId, agentRunId: record.agentRunId, toolKey: tool.key, toolVersion: tool.version, permissionLevel: "EXECUTE", targetSummary: { fixtureId: record.fixtureId, target: record.target }, inputSummary: { actionHash: record.actionHash, executionRecordId: record.id, kind: record.kind }, outputSummary: { changeId: record.changeId, qaOnly: true }, status, errorSummary, endedAt: new Date() });
}
export async function applyQaExecution(c: WorkspaceContext, id: string, database = db, env: QaRuntime = serverEnv) {
  return withTenantContext(database, c, async tx => {
    await lockWorkspace(tx, c);
    const [record] = await tx.select().from(executionRecords).where(scope(c.workspaceId, id)).limit(1).for("update");
    if (!record) throw new ExecutionValidationError("Execution was not found.");
    if (record.status !== "QUEUED") return record;
    const [approval] = await tx.select().from(executionApprovals).where(and(eq(executionApprovals.workspaceId, c.workspaceId), eq(executionApprovals.id, record.approvalId))).limit(1);
    const [fixture] = await tx.select().from(qaExecutionFixtures).where(and(eq(qaExecutionFixtures.workspaceId, c.workspaceId), eq(qaExecutionFixtures.id, record.fixtureId))).limit(1).for("update");
    const [run] = await tx.select().from(agentRuns).where(and(eq(agentRuns.workspaceId, c.workspaceId), eq(agentRuns.id, record.agentRunId))).limit(1);
    let after;
    try {
      const agent = getEnabledAgentDefinition(QA_AGENT); const tool = getAgentToolDefinition(QA_TOOL);
      const action = assertQaExecutionGates({ env, ...await flags(tx, c), role: await currentRole(tx, c), agentKey: run.agentKey, agentVersion: run.agentVersion, agentEnabled: agent.enabled, toolKey: tool.key, permission: run.permissionLevel, approvalStatus: approval.status, action: record.actionSummary, hash: record.actionHash });
      if (tool.requiredPermission !== "EXECUTE" || tool.resourceScope !== "qa/exact-fixture" || agent.allowedToolKeys.length !== 1 || agent.allowedToolKeys[0] !== tool.key) throw new ExecutionValidationError("Execution tool scope mismatch.");
      if (approval.actionHash !== record.actionHash || executionHash(approval.actionSummary) !== record.actionHash || !fixture || fixtureUrl(c.workspaceId, fixture.id) !== record.target) throw new ExecutionValidationError("Immutable action/target binding mismatch.");
      if (!run.deadlineAt || run.deadlineAt < new Date()) throw new ExecutionValidationError("Queued execution expired; a new human approval is required.");
      assertPrecondition(fixtureSnapshot(fixture), snapshotSchema.parse(record.preChangeSnapshot));
      after = action.after;
      if (record.kind === "ROLLBACK") {
        const [parent] = await tx.select().from(executionRecords).where(scope(c.workspaceId, record.parentExecutionId!)).limit(1);
        if (!parent?.postChangeSnapshot || parent.approvalId !== approval.id) throw new ExecutionValidationError("Exact rollback parent was not found.");
        const before = snapshotSchema.parse(parent.preChangeSnapshot); after = { title: before.title, description: before.description };
      }
      tool.inputSchema.parse({ workspaceId: c.workspaceId, executionRecordId: record.id, actionHash: record.actionHash });
      assertWithinBudget(run.budgetSnapshot as AgentRunBudgetSnapshot, { toolCalls: 1, modelCalls: 0, evidenceBytes: 0, inputBytes: byteLength(JSON.stringify(action)), outputBytes: 1000, costCents: 0 });
    } catch (error) {
      if (!(error instanceof ExecutionValidationError)) throw error;
      const [blocked] = await tx.update(executionRecords).set({ status: "BLOCKED", errorSummary: error.message, completedAt: new Date() }).where(scope(c.workspaceId, id)).returning();
      await tx.update(agentRuns).set({ status: "CANCELED", completedAt: new Date(), errorSummary: error.message }).where(and(eq(agentRuns.workspaceId, c.workspaceId), eq(agentRuns.id, run.id)));
      await executeAudit(tx, c, blocked, "SKIPPED", error.message); await event(tx, c, "execution.blocked", id, { reason: error.message }); return blocked;
    }
    await tx.update(executionRecords).set({ status: "RUNNING", startedAt: new Date() }).where(scope(c.workspaceId, id));
    await tx.update(agentRuns).set({ status: "RUNNING", startedAt: new Date() }).where(and(eq(agentRuns.workspaceId, c.workspaceId), eq(agentRuns.id, run.id)));
    await event(tx, c, record.kind === "APPLY" ? "execution.started" : "execution.rollback_started", id);
    const changeId = `qa:${id}`;
    const [changed] = await tx.update(qaExecutionFixtures).set({ ...after, revision: fixture.revision + 1, lastOperation: record.kind, lastChangeId: changeId }).where(and(eq(qaExecutionFixtures.workspaceId, c.workspaceId), eq(qaExecutionFixtures.id, fixture.id))).returning();
    const post = fixtureSnapshot(changed); const tool = getAgentToolDefinition(QA_TOOL); tool.outputSchema.parse({ changeId, revision: changed.revision });
    const [saved] = await tx.update(executionRecords).set({ status: "SUCCEEDED", postChangeSnapshot: post, changeId }).where(scope(c.workspaceId, id)).returning();
    await executeAudit(tx, c, saved, "SUCCEEDED");
    await tx.update(agentRuns).set({ status: "SUCCEEDED", actualToolCalls: 1, completedAt: new Date(), outputRef: id, structuredOutput: { changeId, revision: changed.revision, verificationRequired: true } }).where(and(eq(agentRuns.workspaceId, c.workspaceId), eq(agentRuns.id, run.id)));
    await event(tx, c, "execution.succeeded", id, { changeId, verified: false }); await event(tx, c, "agent_run.succeeded", run.id);
    return saved;
  });
}
export async function verifyQaExecution(c: WorkspaceContext, id: string, database = db, fetchOptions: SafeFetchOptions = {}) {
  await withTenantContext(database, c, async tx => {
    const [record] = await tx.select().from(executionRecords).where(scope(c.workspaceId, id)).limit(1).for("update");
    if (!record || record.completedAt || record.status !== "SUCCEEDED") return;
    const [approval] = await tx.select().from(executionApprovals).where(and(eq(executionApprovals.workspaceId, c.workspaceId), eq(executionApprovals.id, record.approvalId))).limit(1);
    const run = await createRun(tx, c, approval, id, "verification");
    await tx.update(executionRecords).set({ status: "VERIFYING", verificationRunId: run.id }).where(scope(c.workspaceId, id));
    await event(tx, c, "execution.verification_started", id, { verificationRunId: run.id });
  });
  return withTenantContext(database, c, async tx => {
    // Hold the execution row lock across the bounded public read. A concurrent
    // workflow retry cannot mutate twice or create a competing certification.
    // The public fixture GET reads only the already-committed fixture row.
    const [record] = await tx.select().from(executionRecords).where(scope(c.workspaceId, id)).limit(1).for("update");
    if (!record) throw new ExecutionValidationError("Execution was not found.");
    if (record.status !== "VERIFYING" || record.completedAt) return record;
    const [run] = await tx.select().from(agentRuns).where(and(eq(agentRuns.workspaceId, c.workspaceId), eq(agentRuns.id, record.verificationRunId!))).limit(1);
    if (run.agentKey !== "verification" || run.permissionLevel !== "OBSERVE") throw new Error("Independent OBSERVE verifier binding required.");
    const [pkg] = await tx.select().from(implementationPackages).where(and(eq(implementationPackages.workspaceId, c.workspaceId), eq(implementationPackages.id, record.implementationPackageId))).limit(1);
    let expected = parseAction(record.actionSummary).after;
    if (record.kind === "ROLLBACK") {
      const [parent] = await tx.select().from(executionRecords).where(scope(c.workspaceId, record.parentExecutionId!)).limit(1);
      expected = snapshotSchema.parse(parent.preChangeSnapshot);
    }
    const input = { ...packageSchema.parse(pkg.snapshot), targetUrl: record.target, requiresHumanReview: false, checks: [{ kind: "title" as const, expected: expected.title }, { kind: "meta_description" as const, expected: expected.description }] };
    await tx.update(agentRuns).set({ status: "RUNNING", startedAt: new Date() }).where(and(eq(agentRuns.workspaceId, c.workspaceId), eq(agentRuns.id, run.id)));
    await recordToolCall(tx, c, { agentRunId: run.id, toolKey: "read.implementation_package.v1", permissionLevel: "OBSERVE", outputSummary: { packageId: pkg.id, executionRecordId: id, kind: record.kind } });
    const observation = await observeImplementation(input, fetchOptions);
    assertWithinBudget(run.budgetSnapshot as AgentRunBudgetSnapshot, { toolCalls: 3, modelCalls: 0, evidenceBytes: observation.evidenceBytes, inputBytes: byteLength(JSON.stringify(input)), outputBytes: byteLength(JSON.stringify(observation)), costCents: 0 });
    await recordToolCall(tx, c, { agentRunId: run.id, toolKey: "read.public_verification_target.v1", permissionLevel: "OBSERVE", outputSummary: { contentHash: observation.contentHash, statusCode: observation.statusCode } });
    await recordToolCall(tx, c, { agentRunId: run.id, toolKey: "compare.approved_implementation.v1", permissionLevel: "OBSERVE", outputSummary: { result: observation.result, executionRecordId: id } }); // gitleaks:allow -- public tool key
    const status = observation.result === "VERIFIED" ? record.kind === "ROLLBACK" ? "ROLLED_BACK" : "VERIFIED" : observation.result === "VERIFICATION_FAILED" ? record.kind === "ROLLBACK" ? "ROLLBACK_FAILED" : "FAILED" : "SUCCEEDED";
    const [finished] = await tx.update(executionRecords).set({ status, verificationStatus: observation.result, verificationSnapshot: { ...observation }, completedAt: new Date() }).where(scope(c.workspaceId, id)).returning();
    await tx.update(agentRuns).set({ status: "SUCCEEDED", actualToolCalls: 3, completedAt: new Date(), outputRef: id, structuredOutput: { ...observation }, evidenceRefs: [id], rationale: observation.rationale }).where(and(eq(agentRuns.workspaceId, c.workspaceId), eq(agentRuns.id, run.id)));
    await event(tx, c, status === "VERIFIED" ? "execution.verified" : status === "ROLLED_BACK" ? "execution.rolled_back" : status === "ROLLBACK_FAILED" ? "execution.rollback_failed" : status === "FAILED" ? "execution.failed" : "execution.review_required", id, { result: observation.result, verificationRunId: run.id });
    await event(tx, c, "agent_run.succeeded", run.id, { result: observation.result });
    return finished;
  });
}
export async function requestQaRollback(c: WorkspaceContext, parentId: string, automatic = false, database = db, env: QaRuntime = serverEnv) {
  human(c); assertQaEnvironment(env);
  return withTenantContext(database, c, async tx => {
    await lockWorkspace(tx, c);
    const [parent] = await tx.select().from(executionRecords).where(scope(c.workspaceId, parentId)).limit(1).for("update");
    if (!parent || parent.kind !== "APPLY" || !parent.postChangeSnapshot || !parent.completedAt) throw new ExecutionValidationError("A completed QA change with an exact rollback snapshot is required.");
    if (automatic && parent.verificationStatus !== "VERIFICATION_FAILED") throw new ExecutionValidationError("Automatic rollback requires deterministic verification failure.");
    const previous = await tx.select().from(executionRecords).where(and(eq(executionRecords.workspaceId, c.workspaceId), eq(executionRecords.parentExecutionId, parent.id))).orderBy(desc(executionRecords.createdAt));
    if (previous[0] && (previous[0].status !== "BLOCKED" || automatic)) return previous[0];
    const [approval] = await tx.select().from(executionApprovals).where(and(eq(executionApprovals.workspaceId, c.workspaceId), eq(executionApprovals.id, parent.approvalId))).limit(1);
    const id = randomUUID(); const run = await createRun(tx, c, approval, id, QA_AGENT);
    const [record] = await tx.insert(executionRecords).values({ id, workspaceId: c.workspaceId, clientId: parent.clientId, websiteId: parent.websiteId, opportunityId: parent.opportunityId, fixtureId: parent.fixtureId, implementationPackageId: parent.implementationPackageId, approvalId: parent.approvalId, agentRunId: run.id, actionKey: parent.actionKey, actionVersion: parent.actionVersion, target: parent.target, kind: "ROLLBACK", parentExecutionId: parent.id, actionSummary: parent.actionSummary, actionHash: parent.actionHash, preChangeSnapshot: parent.postChangeSnapshot, idempotencyKey: `rollback:${parent.id}:${previous.length + 1}`, actorUserId: c.userId!, trigger: automatic ? "AUTOMATIC_ROLLBACK" : "USER" }).returning();
    await event(tx, c, "execution.requested", id, { parentExecutionId: parent.id, rollback: true, automatic }); return record;
  });
}
export async function processQaExecution(c: WorkspaceContext, id: string, database = db, env: QaRuntime = serverEnv, fetchOptions: SafeFetchOptions = {}) {
  try {
    const applied = await applyQaExecution(c, id, database, env);
    const result = applied.completedAt ? applied : await verifyQaExecution(c, id, database, fetchOptions);
    if (result.kind === "APPLY" && result.verificationStatus === "VERIFICATION_FAILED") {
      const rollback = await requestQaRollback(c, result.id, true, database, env);
      await applyQaExecution(c, rollback.id, database, env);
      await verifyQaExecution(c, rollback.id, database, fetchOptions);
    }
    return result;
  } catch (error) {
    // Do not relabel infrastructure/programming failures as deterministic fail.
    await withTenantContext(database, c, async tx => {
      const [record] = await tx.select().from(executionRecords).where(scope(c.workspaceId, id)).limit(1).for("update");
      if (record && !record.completedAt) {
        await tx.update(executionRecords).set({ status: "FAILED", completedAt: new Date(), errorSummary: "Unexpected execution/verification error; inspect logs. No success is claimed." }).where(scope(c.workspaceId, id));
        await executeAudit(tx, c, record, "FAILED", "Unexpected execution/verification error.");
        await event(tx, c, "execution.failed", id, { unexpected: true });
      }
    });
    throw error;
  }
}
export async function getQaExecutionView(c: WorkspaceContext, database = db) {
  return withTenantContext(database, c, async tx => ({ flags: await flags(tx, c), fixtures: await tx.select().from(qaExecutionFixtures).where(eq(qaExecutionFixtures.workspaceId, c.workspaceId)).orderBy(desc(qaExecutionFixtures.createdAt)), approvals: await tx.select().from(executionApprovals).where(eq(executionApprovals.workspaceId, c.workspaceId)).orderBy(desc(executionApprovals.createdAt)), records: await tx.select().from(executionRecords).where(eq(executionRecords.workspaceId, c.workspaceId)).orderBy(desc(executionRecords.createdAt)) }));
}
export async function getQaExecutionDetail(c: WorkspaceContext, id: string, database = db) {
  return withTenantContext(database, c, async tx => {
    const [record] = await tx.select().from(executionRecords).where(scope(c.workspaceId, id)).limit(1);
    if (!record) return null;
    const rollbacks = await tx.select().from(executionRecords).where(and(eq(executionRecords.workspaceId, c.workspaceId), eq(executionRecords.parentExecutionId, id))).orderBy(desc(executionRecords.createdAt));
    return { record, rollbacks };
  });
}
