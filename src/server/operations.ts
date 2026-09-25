import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { activityEvents, operationRateLimits, platformOperations, usageLedger, workspaceOperations, workspaces } from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import { assertWorkspaceRole, type WorkspaceContext } from "@/domain/tenancy/context";
import { assertBudget, DEFAULT_BUDGETS, OperationsValidationError, pauseApplies, RATE_LIMITS, rateWindow, UNPAUSED, type OperationAction, type PauseState } from "@/domain/operations/policy";
import { serverEnv } from "@/lib/env";
import { syncUsageLedger, type OperationsTx } from "./usage-ledger";
export { OperationsValidationError } from "@/domain/operations/policy";
export async function operationalEvent(tx: OperationsTx, c: WorkspaceContext, action: string, summary: Record<string, unknown>) {
  await tx.insert(activityEvents).values({ workspaceId: c.workspaceId, actorType: c.actorType, actorUserId: c.userId, action, resourceType: "operations", resourceId: c.workspaceId, summary });
}
export async function withOperationalContext<T>(database: typeof db, c: WorkspaceContext, operation: (tx: OperationsTx) => Promise<T>): Promise<T> {
  try { return await withTenantContext(database, c, operation); }
  catch (error) {
    if (error instanceof OperationsValidationError) await withTenantContext(database, c, tx => operationalEvent(tx, c, `operations.${error.code.toLowerCase()}`, { reason: error.message }));
    throw error;
  }
}
export async function enforceActionRateLimit(c: WorkspaceContext, action: OperationAction, database = db, at = new Date()) {
  if (c.actorType !== "USER") return;
  if (!c.userId) throw new OperationsValidationError("A signed-in user is required.");
  const windowStart = rateWindow(at);
  const denied = await withTenantContext(database, c, async tx => {
    const [counter] = await tx.insert(operationRateLimits).values({ workspaceId: c.workspaceId, actorKey: c.userId!, action, windowStart, count: 1 })
      .onConflictDoUpdate({ target: [operationRateLimits.workspaceId, operationRateLimits.actorKey, operationRateLimits.action, operationRateLimits.windowStart], set: { count: sql`least(${operationRateLimits.count}+1,1000000)` } }).returning();
    const exceeded = counter.count > RATE_LIMITS[action];
    if (exceeded && (counter.count === RATE_LIMITS[action] + 1 || counter.count % 20 === 0)) await operationalEvent(tx, c, "operations.rate_limit", { action, attempts: counter.count, windowStart: windowStart.toISOString() });
    return exceeded;
  });
  if (denied) throw new OperationsValidationError(`Too many ${action.replaceAll("_", " ")} requests. Try again after the current one-minute window.`, "RATE_LIMIT");
}
export function isPlatformOperator(c: WorkspaceContext) {
  return c.actorType === "USER" && !!c.userId && (serverEnv.PLATFORM_OPERATOR_USER_IDS ?? "").split(",").map(v => v.trim()).filter(Boolean).includes(c.userId);
}
export async function platformPauseState(database = db): Promise<PauseState> {
  const [row] = await database.select().from(platformOperations).where(eq(platformOperations.id, "global"));
  if (!row) throw new OperationsValidationError("Platform controls are unavailable; automation is blocked.", "PAUSED");
  return { ...row, pausedAll: row.pausedAll || serverEnv.AUTOMATION_EMERGENCY_STOP };
}
export async function lockOperationalWorkspace(tx: OperationsTx, c: WorkspaceContext) {
  const [workspace] = await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, c.workspaceId)).for("update");
  if (!workspace) throw new OperationsValidationError("Workspace was not found.");
}
export async function assertAutomationAllowed(tx: OperationsTx, c: WorkspaceContext, action: OperationAction) {
  // Take the same workspace lock for admission, pause mutation and step policy.
  await lockOperationalWorkspace(tx, c);
  const [platform] = await tx.select().from(platformOperations).where(eq(platformOperations.id, "global"));
  const [workspace] = await tx.select().from(workspaceOperations).where(eq(workspaceOperations.workspaceId, c.workspaceId));
  if (!platform || serverEnv.AUTOMATION_EMERGENCY_STOP || pauseApplies(platform, action) || pauseApplies(workspace ?? UNPAUSED, action)) throw new OperationsValidationError("Automation is paused for this action. Viewing and reporting remain available.", "PAUSED");
  return workspace ?? { ...DEFAULT_BUDGETS, ...UNPAUSED };
}
export async function operationalUsage(tx: OperationsTx, c: WorkspaceContext, at = new Date()) {
  const result = await tx.execute(sql`select
    coalesce(sum(case when state='RESERVED' then greatest(reserved_cost_usd,coalesce(actual_cost_usd,0)) else coalesce(actual_cost_usd,greatest(reserved_cost_usd,coalesce(estimated_cost_usd,0))) end),0)::float8 as cost,
    coalesce(sum(case when category='PREPARE' then greatest(coalesce(calls,0),case when state='RESERVED' then reserved_calls else 0 end) else 0 end),0)::int as ai,
    coalesce(sum(case when category='AI_VISIBILITY' then greatest(coalesce(calls,0),case when state='RESERVED' then reserved_calls else 0 end) else 0 end),0)::int as visibility,
    count(*) filter(where provider in ('vercel-ai-gateway','perplexity') and actual_cost_usd is null and reserved_cost_usd=0)::int as unknown
    from usage_ledger where workspace_id=${c.workspaceId} and measurement_window=${at.toISOString().slice(0, 7)}`);
  const active = await tx.execute(sql`select
    (select count(*) from agent_runs where workspace_id=${c.workspaceId} and status in ('QUEUED','RUNNING'))+
    (select count(*) from monitoring_runs where workspace_id=${c.workspaceId} and status in ('QUEUED','RUNNING'))+
    (select count(*) from ai_visibility_runs where workspace_id=${c.workspaceId} and status in ('QUEUED','RUNNING'))+
    (select count(*) from audit_runs a where workspace_id=${c.workspaceId} and status in ('QUEUED','RUNNING') and not exists(select 1 from monitoring_runs m where m.workspace_id=a.workspace_id and m.audit_run_id=a.id and m.status='RUNNING')) as active,
    (select count(*) from monitoring_runs where workspace_id=${c.workspaceId} and status in ('QUEUED','RUNNING'))+
    (select count(*) from audit_runs a where workspace_id=${c.workspaceId} and status in ('QUEUED','RUNNING') and not exists(select 1 from monitoring_runs m where m.workspace_id=a.workspace_id and m.audit_run_id=a.id and m.status='RUNNING')) as crawls`);
  const row = result.rows[0], a = active.rows[0];
  return { committedCostUsd: Number(row.cost), aiCalls: Number(row.ai), visibilityCalls: Number(row.visibility), unknownUnreservedCosts: Number(row.unknown), active: Number(a.active), crawls: Number(a.crawls) };
}
export async function assertOperationalAdmission(tx: OperationsTx, c: WorkspaceContext, action: OperationAction, next: Parameters<typeof assertBudget>[2] = {}, at = new Date()) {
  const limits = await assertAutomationAllowed(tx, c, action);
  await syncUsageLedger(tx, c, at);
  assertBudget(limits, await operationalUsage(tx, c, at), next);
}
export async function checkMaterialStep(c: WorkspaceContext, action: OperationAction, database = db, paidAgentRunId?: string) {
  return withOperationalContext(database, c, async tx => {
    const limits = await assertAutomationAllowed(tx, c, action);
    if (paidAgentRunId) {
      await syncUsageLedger(tx, c);
      const [entry] = await tx.select().from(usageLedger).where(and(eq(usageLedger.workspaceId, c.workspaceId), eq(usageLedger.agentRunId, paidAgentRunId))).for("update");
      if (!entry || entry.measurementWindow !== new Date().toISOString().slice(0, 7) || Number(entry.reservedCostUsd) <= 0) throw new OperationsValidationError("A current provider budget reservation is required; manual review is needed.", "BUDGET");
      if (entry.metadata.attemptCommitted) throw new OperationsValidationError("A provider attempt was already committed. Do not retry an indeterminate paid call; review manually.", "MANUAL_REVIEW");
      const usage = await operationalUsage(tx, c);
      if (usage.committedCostUsd > Number(limits.monthlyCostUsd) || usage.aiCalls > limits.aiCallLimit) throw new OperationsValidationError("Workspace provider budget changed after queueing.", "BUDGET");
      await tx.update(usageLedger).set({ calls: 1, metadata: { attemptCommitted: true }, updatedAt: new Date() }).where(eq(usageLedger.id, entry.id));
    }
  });
}
export async function setAutomationPause(c: WorkspaceContext, input: { scope: "WORKSPACE" | "PLATFORM"; category: "all" | "monitoring" | "ai" | "execution"; paused: boolean; reason: string }, database = db) {
  assertWorkspaceRole(c, ["OWNER", "ADMIN"]);
  if (c.actorType !== "USER" || !c.userId || !input.reason.trim() || input.reason.length > 500) throw new OperationsValidationError("A human actor and a reason of 1–500 characters are required.");
  if (input.scope === "PLATFORM" && !isPlatformOperator(c)) throw new OperationsValidationError("Platform operator access is required.");
  const key = { all: "pausedAll", monitoring: "pausedMonitoring", ai: "pausedAi", execution: "pausedExecution" }[input.category];
  if (!key) throw new OperationsValidationError("Unknown pause category.");
  return withTenantContext(database, c, async tx => {
    await lockOperationalWorkspace(tx, c);
    const at = new Date();
    const changes = { [key]: input.paused, reason: input.reason.trim(), actorUserId: c.userId, updatedAt: at, ...(input.paused ? { pausedAt: at, resumedAt: null, resumedBy: null } : { resumedAt: at, resumedBy: c.userId }) };
    if (input.scope === "PLATFORM") {
      await tx.execute(sql`select set_config('app.platform_operator','true',true)`);
      await tx.update(platformOperations).set(changes).where(eq(platformOperations.id, "global"));
    } else await tx.insert(workspaceOperations).values({ workspaceId: c.workspaceId, ...changes }).onConflictDoUpdate({ target: workspaceOperations.workspaceId, set: changes });
    await operationalEvent(tx, c, input.paused ? "operations.paused" : "operations.resumed", { ...input, at: at.toISOString(), actor: c.userId! });
  });
}
export async function setWorkspaceBudgets(c: WorkspaceContext, input: typeof DEFAULT_BUDGETS, reason: string, database = db) {
  assertWorkspaceRole(c, ["OWNER", "ADMIN"]);
  if (c.actorType !== "USER" || !c.userId || !reason.trim() || reason.length > 500) throw new OperationsValidationError("A human actor and budget-change reason are required.");
  const cost = Number(input.monthlyCostUsd);
  if (!Number.isFinite(cost) || cost < 0 || cost > 10000 || ![[input.activeWorkflowLimit,20],[input.aiCallLimit,10000],[input.visibilityCallLimit,10000],[input.crawlConcurrency,5]].every(([value,max]) => Number.isInteger(value) && value >= 0 && value <= max)) throw new OperationsValidationError("Enter budgets within the displayed bounds.");
  await withTenantContext(database, c, async tx => {
    await lockOperationalWorkspace(tx, c);
    await tx.insert(workspaceOperations).values({ workspaceId: c.workspaceId, ...input, monthlyCostUsd: cost.toFixed(6), actorUserId: c.userId }).onConflictDoUpdate({ target: workspaceOperations.workspaceId, set: { ...input, monthlyCostUsd: cost.toFixed(6), actorUserId: c.userId, updatedAt: new Date() } });
    await operationalEvent(tx, c, "operations.budgets_updated", { ...input, reason });
  });
}
export async function filterUnpausedWorkspaceRefs<T extends { workspace_id: string }>(refs: T[], action: OperationAction, database = db): Promise<T[]> {
  const eligible: T[] = [];
  for (const ref of refs) {
    const allowed = await withTenantContext(database, {workspaceId:ref.workspace_id,actorType:"SYSTEM",role:"ADMIN"}, async tx => {
      const [row] = await tx.select().from(workspaceOperations).where(eq(workspaceOperations.workspaceId,ref.workspace_id));
      return !pauseApplies(row ?? UNPAUSED,action);
    });
    if (allowed) eligible.push(ref);
  }
  return eligible;
}
