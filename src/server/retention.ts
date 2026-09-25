import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant";
import { assertWorkspaceRole, type WorkspaceContext } from "@/domain/tenancy/context";
import { OperationsValidationError, enforceActionRateLimit, operationalEvent } from "./operations";
import { retentionCleanupRuns } from "@/db/schema";

export async function cleanupWorkspace(c: WorkspaceContext, dryRun = false, database = db, batchSize = 100) {
  assertWorkspaceRole(c, ["OWNER", "ADMIN"]);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new OperationsValidationError("Cleanup batch must be between 1 and 100.");
  await enforceActionRateLimit(c, "cleanup", database);
  try {
    return await withTenantContext(database, c, async tx => {
      const candidates = await tx.execute(sql`select id from ai_visibility_captures where workspace_id=${c.workspaceId} and expires_at<=now() order by expires_at,id limit ${batchSize} for update skip locked`);
      const ids = candidates.rows.map(row => String(row.id));
      let deletedCount = 0;
      if (!dryRun && ids.length) {
        const result = await tx.execute(sql`delete from ai_visibility_captures where workspace_id=${c.workspaceId} and expires_at<=now() and id in (${sql.join(ids.map(id => sql`${id}::uuid`), sql`,`)}) returning id`);
        deletedCount = result.rows.length;
      }
      // Ephemeral rate counters contain no retained fulfillment evidence.
      if (!dryRun) await tx.execute(sql`delete from operation_rate_limits where workspace_id=${c.workspaceId} and window_start<now()-interval '7 days' and (workspace_id,actor_key,action,window_start) in (select workspace_id,actor_key,action,window_start from operation_rate_limits where workspace_id=${c.workspaceId} and window_start<now()-interval '7 days' limit 100)`);
      const [run] = await tx.insert(retentionCleanupRuns).values({ workspaceId: c.workspaceId, status: "SUCCEEDED", startedAt: new Date(), dryRun, eligibleCount: ids.length, deletedCount, batchSize, actorUserId: c.userId, completedAt: new Date() }).returning();
      await operationalEvent(tx, c, "operations.cleanup", { cleanupRunId: run.id, dryRun, eligibleCount: ids.length, deletedCount, batchSize });
      return run;
    });
  } catch (error) {
    await withTenantContext(database, c, async tx => {
      await tx.insert(retentionCleanupRuns).values({ workspaceId: c.workspaceId, status: "FAILED", startedAt: new Date(), eligibleCount: 0, deletedCount: 0, dryRun, batchSize, actorUserId: c.userId, errorCode: "CLEANUP_FAILED", completedAt: new Date() });
      await operationalEvent(tx, c, "operations.cleanup_failed", { dryRun, batchSize });
    });
    throw error;
  }
}
export async function retentionWorkspaceRefs(database = db) {
  const result = await database.execute(sql`select * from public.list_retention_workspace_refs(20)`);
  return result.rows.map(row => String(row.workspace_id));
}
