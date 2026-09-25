import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { workspaceOperations, retentionCleanupRuns, activityEvents } from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import type { WorkspaceContext } from "@/domain/tenancy/context";
import { DEFAULT_BUDGETS, UNPAUSED } from "@/domain/operations/policy";
import { serverEnv } from "@/lib/env";
import { syncUsageLedger } from "./usage-ledger";
import { operationalUsage, platformPauseState, isPlatformOperator } from "./operations";
export async function getOperationsPanel(c: WorkspaceContext, database = db) {
  const global = await platformPauseState(database);
  return withTenantContext(database, c, async tx => {
    await syncUsageLedger(tx, c);
    const [workspace] = await tx.select().from(workspaceOperations).where(eq(workspaceOperations.workspaceId, c.workspaceId));
    const usage = await operationalUsage(tx, c);
    const costs = await tx.execute(sql`select provider,category,client_id,count(*)::int runs,coalesce(sum(calls),0)::int calls,sum(actual_cost_usd)::float8 actual,sum(estimated_cost_usd)::float8 estimated,count(*) filter(where actual_cost_usd is null)::int unknown,count(*) filter(where calls is null)::int unknown_calls from usage_ledger where workspace_id=${c.workspaceId} and measurement_window=to_char(timezone('UTC',now()),'YYYY-MM') group by provider,category,client_id order by provider,category,client_id`);
    const health = await tx.execute(sql`select
      (select count(*) from agent_runs where workspace_id=${c.workspaceId} and status='FAILED')+(select count(*) from monitoring_runs where workspace_id=${c.workspaceId} and status='FAILED')+(select count(*) from ai_visibility_runs where workspace_id=${c.workspaceId} and status in ('FAILED','UNAVAILABLE')) as failed,
      (select count(*) from agent_runs where workspace_id=${c.workspaceId} and status='BUDGET_LIMITED')+(select count(*) from activity_events where workspace_id=${c.workspaceId} and action='operations.budget' and created_at>=date_trunc('month',now())) as budget_limited,
      (select count(*) from approval_requests where workspace_id=${c.workspaceId} and status='PENDING') as pending_approvals,
      (select count(*) from implementation_verification_records where workspace_id=${c.workspaceId} and status='VERIFICATION_FAILED') as verification_failures,
      (select count(*) from integration_connections where workspace_id=${c.workspaceId} and status<>'CONNECTED') as reconnect,
      (select count(*) from retention_cleanup_runs where workspace_id=${c.workspaceId} and status='FAILED') as cleanup_failures`);
    const jobs = await tx.execute(sql`select id,'prepare' as kind,agent_key as type,status::text,provider,created_at from agent_runs where workspace_id=${c.workspaceId} and status in ('QUEUED','RUNNING','FAILED','TIMED_OUT','BUDGET_LIMITED') union all select id,'monitor',monitor_key,status::text,source_provider,created_at from monitoring_runs where workspace_id=${c.workspaceId} and status in ('QUEUED','RUNNING','FAILED') union all select id,'visibility',surface,status,'perplexity',created_at from ai_visibility_runs where workspace_id=${c.workspaceId} and status in ('QUEUED','RUNNING','FAILED','UNAVAILABLE') order by created_at desc limit 50`);
    const [cleanup] = await tx.select().from(retentionCleanupRuns).where(eq(retentionCleanupRuns.workspaceId, c.workspaceId)).orderBy(desc(retentionCleanupRuns.completedAt)).limit(1);
    const [successfulCleanup] = await tx.select().from(retentionCleanupRuns).where(and(eq(retentionCleanupRuns.workspaceId,c.workspaceId),eq(retentionCleanupRuns.status,"SUCCEEDED"),eq(retentionCleanupRuns.dryRun,false))).orderBy(desc(retentionCleanupRuns.completedAt)).limit(1);
    const events = await tx.select().from(activityEvents).where(eq(activityEvents.workspaceId, c.workspaceId)).orderBy(desc(activityEvents.createdAt)).limit(30);
    return { global, workspace: workspace ?? { ...DEFAULT_BUDGETS, ...UNPAUSED }, usage, costs: costs.rows, health: health.rows[0], jobs: jobs.rows, cleanup, successfulCleanup, events, platformOperator: isPlatformOperator(c), readiness: environmentReadiness() };
  });
}
export function environmentReadiness() {
  return {
    database: !!serverEnv.DATABASE_URL, auth: !!serverEnv.BETTER_AUTH_SECRET && !!serverEnv.BETTER_AUTH_URL,
    credentialEncryption: !!serverEnv.CREDENTIAL_ENCRYPTION_KEY, cron: !!serverEnv.CRON_SECRET,
    searchConsole: !!serverEnv.GOOGLE_OAUTH_CLIENT_ID && !!serverEnv.GOOGLE_OAUTH_CLIENT_SECRET && !!serverEnv.GOOGLE_OAUTH_REDIRECT_URI,
    perplexity: !!serverEnv.PERPLEXITY_API_KEY,
    aiGateway: !!serverEnv.AI_GATEWAY_MODEL && !!(serverEnv.AI_GATEWAY_API_KEY || serverEnv.VERCEL_OIDC_TOKEN),
    blob: !!serverEnv.BLOB_READ_WRITE_TOKEN, qaExecute: serverEnv.APP_ENV === "qa" && serverEnv.QA_EXECUTE_ENABLED,
    qaEnvironment: serverEnv.APP_ENV === "qa", productionExecute: false, platformOperatorConfigured: !!serverEnv.PLATFORM_OPERATOR_USER_IDS,
    emergencyStop: serverEnv.AUTOMATION_EMERGENCY_STOP,
  };
}
