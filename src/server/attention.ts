import { and, desc, eq, gt, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { auditRuns, audits, operationalNotifications, publicAuditRequests } from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import { assertWorkspaceRole, type WorkspaceContext } from "@/domain/tenancy/context";

import { getIntakeConfig } from "./intake-config";

/** Whether this workspace is the one that receives public audit requests. */
export function receivesPublicRequests(context: WorkspaceContext) {
  return ["OWNER", "ADMIN"].includes(context.role)
    && getIntakeConfig(process.env, false)?.PUBLIC_INTAKE_WORKSPACE_ID === context.workspaceId;
}

/** Public audit requests nobody has imported or dismissed yet. */
export async function countPendingAuditRequests(context: WorkspaceContext, database = db) {
  if (!receivesPublicRequests(context)) return 0;
  return withTenantContext(database, context, async (tx) => {
    const [row] = await tx.select({ count: sql<number>`count(*)::int` }).from(publicAuditRequests)
      .where(and(
        eq(publicAuditRequests.workspaceId, context.workspaceId),
        eq(publicAuditRequests.state, "RECEIVED"),
        gt(publicAuditRequests.retentionUntil, new Date()),
      ));
    return row?.count ?? 0;
  });
}

/**
 * What the owner should look at now: waiting requests, alerts the system has
 * raised, and audits that failed in the last week.
 */
export async function getAttentionSummary(context: WorkspaceContext, database = db) {
  const pendingRequests = await countPendingAuditRequests(context, database);
  return withTenantContext(database, context, async (tx) => {
    const alerts = await tx.select({
      id: operationalNotifications.id,
      severity: operationalNotifications.severity,
      title: operationalNotifications.title,
      summary: operationalNotifications.summary,
      createdAt: operationalNotifications.createdAt,
    }).from(operationalNotifications)
      .where(and(eq(operationalNotifications.workspaceId, context.workspaceId), eq(operationalNotifications.status, "UNREAD")))
      .orderBy(desc(operationalNotifications.createdAt))
      .limit(10);
    const [unread] = await tx.select({ count: sql<number>`count(*)::int` }).from(operationalNotifications)
      .where(and(eq(operationalNotifications.workspaceId, context.workspaceId), eq(operationalNotifications.status, "UNREAD")));
    const failedAudits = await tx.select({
      auditId: audits.id,
      title: audits.title,
      reason: auditRuns.errorSummary,
      failedAt: auditRuns.completedAt,
    }).from(auditRuns)
      .innerJoin(audits, and(eq(audits.workspaceId, auditRuns.workspaceId), eq(audits.id, auditRuns.auditId)))
      .where(and(
        eq(auditRuns.workspaceId, context.workspaceId),
        eq(auditRuns.status, "FAILED"),
        eq(audits.status, "FAILED"),
        gte(auditRuns.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
      ))
      .orderBy(desc(auditRuns.createdAt))
      .limit(5);
    return { pendingRequests, alerts, unreadAlerts: unread?.count ?? 0, failedAudits };
  });
}

/** Mark alerts as seen. Nothing is deleted; they stay in the record as read. */
export async function markAlertsRead(context: WorkspaceContext, alertIds: string[], database = db) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN"]);
  const ids = [...new Set(alertIds)].filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
  if (ids.length === 0) return 0;
  return withTenantContext(database, context, async (tx) => {
    const updated = await tx.update(operationalNotifications)
      .set({ status: "READ", readAt: new Date() })
      .where(and(
        eq(operationalNotifications.workspaceId, context.workspaceId),
        eq(operationalNotifications.status, "UNREAD"),
        inArray(operationalNotifications.id, ids),
      ))
      .returning({ id: operationalNotifications.id });
    return updated.length;
  });
}
