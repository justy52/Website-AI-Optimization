import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant";
import type { WorkspaceContext } from "@/domain/tenancy/context";
import { assertAutomationAllowed } from "./operations";

export type DispatchKind = "prepare" | "monitor" | "verification" | "visibility" | "qa_execute";
export type DispatchRef = { workspace_id: string; run_id: string; kind: DispatchKind };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Only code-owned identifiers/predicates enter SQL. The queued row itself is the
// durable intent, committed together with admission and any budget reservation.
export function dispatchTarget(kind: DispatchKind): { table: string; predicate: SQL; actor: SQL; system: SQL; target: SQL } {
  switch (kind) {
    case "monitor": return { table: "monitoring_runs", predicate: sql`true`, actor: sql`created_by_user_id`, system: sql`trigger_type='SCHEDULE'`, target: sql`id::text` };
    case "visibility": return { table: "ai_visibility_runs", predicate: sql`source in ('API','QA_FIXTURE')`, actor: sql`actor_user_id`, system: sql`trigger='SCHEDULED'`, target: sql`id::text` };
    case "prepare": return { table: "agent_runs", predicate: sql`permission_level='PREPARE'`, actor: sql`created_by_user_id`, system: sql`false`, target: sql`id::text` };
    case "verification": return { table: "agent_runs", predicate: sql`agent_key='verification' and permission_level='OBSERVE' and input_summary ? 'implementationRecordId'`, actor: sql`created_by_user_id`, system: sql`false`, target: sql`id::text` };
    case "qa_execute": return { table: "agent_runs", predicate: sql`permission_level='EXECUTE' and input_summary ? 'executionRecordId'`, actor: sql`created_by_user_id`, system: sql`false`, target: sql`input_summary->>'executionRecordId'` };
  }
}

// Timestamps alone are insufficient for legacy/corrupt queued rows. Any durable
// material-work evidence must keep automatic dispatch and manual recovery shut.
export function unstartedDispatchEvidence(kind: DispatchKind): SQL {
  if (kind === "visibility") return sql`not exists(select 1 from ai_visibility_calls c where c.workspace_id=ai_visibility_runs.workspace_id and c.run_id=ai_visibility_runs.id)`;
  if (kind === "monitor") return sql`audit_run_id is null and observations_produced=0
    and not exists(select 1 from monitoring_observations o where o.workspace_id=monitoring_runs.workspace_id and o.monitoring_run_id=monitoring_runs.id)`;
  return sql`actual_model_calls=0 and actual_tool_calls=0 and model_generation_id is null and output_ref is null
    and not exists(select 1 from agent_tool_calls t where t.workspace_id=agent_runs.workspace_id and t.agent_run_id=agent_runs.id)
    and not exists(select 1 from usage_ledger l where l.workspace_id=agent_runs.workspace_id and l.agent_run_id=agent_runs.id
      and (coalesce((l.metadata->>'attemptCommitted')::boolean,false) or l.calls>0))`;
}

export type DispatchClaim = { kind: DispatchKind; id: string; token: string; context: WorkspaceContext; workflowTargetId: string; attempts: number };
export function dispatchBackoffMs(attempts: number) { return Math.min(60 * 60_000, 60_000 * 2 ** Math.min(Math.max(attempts - 1, 0), 6)); }

async function actorContext(tx: Tx, c: WorkspaceContext, actor: string | null, system: boolean): Promise<WorkspaceContext | null> {
  if (system) return { workspaceId: c.workspaceId, actorType: "SYSTEM", role: "ADMIN" };
  if (!actor) return null;
  const members = await tx.execute(sql`select role from workspace_memberships where workspace_id=${c.workspaceId} and user_id=${actor} and status='ACTIVE' limit 1`);
  const role = members.rows[0]?.role as WorkspaceContext["role"] | undefined;
  return role ? { workspaceId: c.workspaceId, actorType: "USER", role, userId: actor } : null;
}

export async function claimQueuedDispatch(c: WorkspaceContext, kind: DispatchKind, id: string, database = db, at = new Date()): Promise<DispatchClaim | null> {
  const target = dispatchTarget(kind), table = sql.identifier(target.table);
  return withTenantContext(database, c, async tx => {
    // Paused work stays queued. Execution still checks pause/budget immediately
    // before material work, so a pause racing dispatch also fails closed.
    await assertAutomationAllowed(tx, c, kind);
    const token = randomUUID();
    const result = await tx.execute(sql`update ${table} set
      dispatch_attempts=dispatch_attempts+1, dispatch_lease_token=${token},
      dispatch_lease_until=${new Date(at.getTime() + 120_000)},
      dispatch_next_attempt_at=${new Date(at.getTime() + 120_000)}, dispatch_error_code=null
      where workspace_id=${c.workspaceId} and id=${id} and ${target.predicate}
        and ${unstartedDispatchEvidence(kind)}
        and status='QUEUED' and started_at is null and completed_at is null
        and dispatch_next_attempt_at<=${at} and (dispatch_lease_until is null or dispatch_lease_until<=${at})
      returning dispatch_attempts, ${target.actor} as actor, (${target.system}) as system, ${target.target} as workflow_target_id`);
    const row = result.rows[0];
    if (!row) return null;
    const context = await actorContext(tx, c, row.actor as string | null, row.system as boolean);
    if (!context) {
      await tx.execute(sql`update ${table} set dispatch_error_code='ACTOR_UNAVAILABLE',dispatch_lease_token=null,dispatch_lease_until=null,
        dispatch_next_attempt_at=${new Date(at.getTime() + 3600_000)} where workspace_id=${c.workspaceId} and id=${id} and dispatch_lease_token=${token}`);
      return null;
    }
    return { kind, id, token, context, workflowTargetId: String(row.workflow_target_id), attempts: Number(row.dispatch_attempts) };
  });
}

export async function settleQueuedDispatch(claim: DispatchClaim, workflowRunId: string | null, database = db, at = new Date()) {
  const table = sql.identifier(dispatchTarget(claim.kind).table);
  return withTenantContext(database, claim.context, tx => tx.execute(sql`update ${table} set
    workflow_run_id=coalesce(${workflowRunId},workflow_run_id), dispatch_lease_token=null,dispatch_lease_until=null,
    dispatch_next_attempt_at=${new Date(at.getTime() + dispatchBackoffMs(claim.attempts))},
    dispatch_error_code=${workflowRunId ? null : "WORKFLOW_START_UNCONFIRMED"}
    where workspace_id=${claim.context.workspaceId} and id=${claim.id} and dispatch_lease_token=${claim.token}`));
}

export async function listQueuedDispatchRefs(limit = 25, database = db) {
  // This restricted bootstrap returns identifiers only. Every mutation below
  // re-establishes tenant scope. A stale snapshot is harmless to the atomic claim.
  const result = await database.execute(sql`select workspace_id,run_id,kind from public.list_queued_dispatch_refs(${limit})`);
  return result.rows as DispatchRef[];
}
