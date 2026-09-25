import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { usageLedger } from "@/db/schema";
import type { WorkspaceContext } from "@/domain/tenancy/context";
import { withTenantContext } from "@/db/tenant";
import { usdFromCents } from "@/domain/operations/policy";
export type OperationsTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Reconcile only persisted measurements. Historical provider zero defaults are
// ambiguous and remain null. A budget reservation is NOT an estimated charge.
export async function syncUsageLedger(tx: OperationsTx, c: WorkspaceContext, at = new Date()) {
  const month = at.toISOString().slice(0, 7);
  await tx.execute(sql`insert into usage_ledger(workspace_id,client_id,website_id,agent_run_id,source_key,provider,category,calls,tool_calls,input_tokens,output_tokens,estimated_cost_usd,actual_cost_usd,state,outcome,occurred_at,measurement_window,source_version)
    select r.workspace_id,r.client_id,r.website_id,r.id,'agent:'||r.id,r.provider,
      case when r.permission_level='EXECUTE' then 'QA_EXECUTE' when r.agent_key='verification' then 'VERIFICATION' else 'PREPARE' end,
      case when r.provider='deterministic' then 0 when r.actual_model_calls>0 then r.actual_model_calls else null end,
      r.actual_tool_calls,case when r.provider='deterministic' or r.actual_input_tokens>0 then r.actual_input_tokens else null end,
      case when r.provider='deterministic' or r.actual_output_tokens>0 then r.actual_output_tokens else null end,
      case when r.provider='deterministic' then 0 when r.estimated_cost_cents>0 then r.estimated_cost_cents/100.0 else null end,
      case when r.provider='deterministic' then 0 when r.actual_cost_cents>0 then r.actual_cost_cents/100.0 else null end,
      case when r.completed_at is null then 'RESERVED' else 'RECORDED' end,r.status::text,r.created_at,to_char(timezone('UTC',r.created_at),'YYYY-MM'),r.agent_version
    from agent_runs r where r.workspace_id=${c.workspaceId} and r.created_at>=(${month}||'-01')::date
    on conflict(workspace_id,source_key) do update set tool_calls=excluded.tool_calls,
      calls=coalesce(excluded.calls,usage_ledger.calls),input_tokens=coalesce(excluded.input_tokens,usage_ledger.input_tokens),output_tokens=coalesce(excluded.output_tokens,usage_ledger.output_tokens),
      estimated_cost_usd=coalesce(excluded.estimated_cost_usd,usage_ledger.estimated_cost_usd),actual_cost_usd=coalesce(excluded.actual_cost_usd,usage_ledger.actual_cost_usd),state=excluded.state,outcome=excluded.outcome,updated_at=now()`);
  await tx.execute(sql`insert into usage_ledger(workspace_id,client_id,website_id,visibility_run_id,source_key,provider,category,calls,input_tokens,output_tokens,actual_cost_usd,state,outcome,occurred_at,measurement_window,source_version,metadata)
    select r.workspace_id,r.client_id,r.website_id,r.id,'visibility:'||r.id,case when r.source='API' then 'perplexity' else 'deterministic' end,'AI_VISIBILITY',
      case when r.source<>'API' then 0 else (select count(*)::int from ai_visibility_calls c left join ai_visibility_observations o on o.workspace_id=c.workspace_id and o.call_id=c.id where c.workspace_id=r.workspace_id and c.run_id=r.id and (o.id is null or not (o.limitations ?| array['PROVIDER_NOT_CONFIGURED','FACTS_OR_ENTITLEMENTS_CHANGED','VERIFIED_FACTS_UNAVAILABLE','PROVIDER_RUN_STOPPED_AFTER_ERROR','PROVIDER_COST_BUDGET_EXHAUSTED','WORKSPACE_AUTOMATION_BLOCKED']))) end,
      case when r.completed_at is not null then (r.usage->>'inputTokens')::int else null end,case when r.completed_at is not null then (r.usage->>'outputTokens')::int else null end,
      case when r.source<>'API' then 0 else (r.usage->>'costUsd')::numeric end,
      case when r.completed_at is null then 'RESERVED' else 'RECORDED' end,r.status,r.created_at,to_char(timezone('UTC',r.created_at),'YYYY-MM'),r.adapter_version,jsonb_build_object('source',r.source,'cadenceWindow',r.window)
    from ai_visibility_runs r where r.workspace_id=${c.workspaceId} and r.created_at>=(${month}||'-01')::date
    on conflict(workspace_id,source_key) do update set calls=excluded.calls,input_tokens=excluded.input_tokens,output_tokens=excluded.output_tokens,actual_cost_usd=excluded.actual_cost_usd,state=excluded.state,outcome=excluded.outcome,updated_at=now()`);
  await tx.execute(sql`insert into usage_ledger(workspace_id,client_id,website_id,monitoring_run_id,source_key,provider,category,calls,actual_cost_usd,state,outcome,occurred_at,measurement_window,source_version)
    select r.workspace_id,r.client_id,r.website_id,r.id,'monitor:'||r.id,case when r.monitor_key='website_health' then 'public-http' else 'google-search-console' end,'MONITORING',null,
      case when r.monitor_key='website_health' then 0 when r.cost_cents>0 then r.cost_cents/100.0 else null end,
      case when r.completed_at is null then 'RESERVED' else 'RECORDED' end,r.status::text,r.created_at,to_char(timezone('UTC',r.created_at),'YYYY-MM'),r.monitor_version
    from monitoring_runs r where r.workspace_id=${c.workspaceId} and r.created_at>=(${month}||'-01')::date
    on conflict(workspace_id,source_key) do update set actual_cost_usd=excluded.actual_cost_usd,state=excluded.state,outcome=excluded.outcome,updated_at=now()`);
  await tx.execute(sql`insert into usage_ledger(workspace_id,client_id,website_id,audit_run_id,source_key,provider,category,calls,actual_cost_usd,state,outcome,occurred_at,measurement_window,source_version)
    select r.workspace_id,w.client_id,r.website_id,r.id,'audit:'||r.id,'public-http','AUDIT',null,0,
      case when r.completed_at is null then 'RESERVED' else 'RECORDED' end,r.status::text,r.created_at,to_char(timezone('UTC',r.created_at),'YYYY-MM'),'bounded-audit-v1'
    from audit_runs r join websites w on w.workspace_id=r.workspace_id and w.id=r.website_id where r.workspace_id=${c.workspaceId} and r.created_at>=(${month}||'-01')::date
    on conflict(workspace_id,source_key) do update set state=excluded.state,outcome=excluded.outcome,updated_at=now()`);
}

export async function reserveUsage(tx: OperationsTx, c: WorkspaceContext, input: Omit<typeof usageLedger.$inferInsert, "workspaceId" | "occurredAt" | "measurementWindow">, at = new Date()) {
  await tx.insert(usageLedger).values({ ...input, workspaceId: c.workspaceId, occurredAt: at, measurementWindow: at.toISOString().slice(0, 7) }).onConflictDoNothing();
}
export async function recordPrepareUsage(c: WorkspaceContext, runId: string, provider: string, usage: { inputTokens?: number; outputTokens?: number; estimatedCostCents?: number; actualCostCents?: number }, database = db) {
  await withTenantContext(database, c, async tx => {
    await tx.update(usageLedger).set({ calls: provider === "deterministic" ? 0 : 1, inputTokens: usage.inputTokens ?? null, outputTokens: usage.outputTokens ?? null,
      estimatedCostUsd: provider === "deterministic" ? "0" : usdFromCents(usage.estimatedCostCents), actualCostUsd: provider === "deterministic" ? "0" : usdFromCents(usage.actualCostCents), updatedAt: new Date(),
      metadata: { measurement: "provider-returned", attemptCommitted: true } }).where(and(eq(usageLedger.workspaceId, c.workspaceId), eq(usageLedger.agentRunId, runId)));
  });
}
