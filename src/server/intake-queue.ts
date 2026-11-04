import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { activityEvents, leads, publicAuditRequests } from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import { inquirySchema } from "@/domain/intake/validation";
import { assertWorkspaceRole, AuthorizationError, type WorkspaceContext } from "@/domain/tenancy/context";
import { getIntakeConfig } from "./intake-config";

export function assertIntakeOperator(context: WorkspaceContext) {
  const config = getIntakeConfig(process.env, false);
  assertWorkspaceRole(context, ["OWNER", "ADMIN"]);
  if (!context.userId || context.actorType !== "USER" || !config || context.workspaceId !== config.PUBLIC_INTAKE_WORKSPACE_ID) throw new AuthorizationError("This workspace cannot review public requests.");
}

export async function listIntakeRequests(context: WorkspaceContext, page = 0) {
  assertIntakeOperator(context);
  return withTenantContext(db, context, tx => tx.select().from(publicAuditRequests)
    .where(and(eq(publicAuditRequests.workspaceId, context.workspaceId), gt(publicAuditRequests.retentionUntil, new Date())))
    .orderBy(desc(publicAuditRequests.createdAt), desc(publicAuditRequests.id)).limit(51).offset(Math.min(Math.max(page, 0), 10000) * 50));
}

export async function reviewIntakeRequest(context: WorkspaceContext, requestId: string, decision: "import" | "dismiss") {
  assertIntakeOperator(context);
  return withTenantContext(db, context, async tx => {
    const [request] = await tx.select().from(publicAuditRequests).where(and(eq(publicAuditRequests.id, requestId), eq(publicAuditRequests.workspaceId, context.workspaceId), gt(publicAuditRequests.retentionUntil, new Date()))).for("update");
    if (!request || request.state !== "RECEIVED") return request?.leadId ?? null;
    let leadId: string | null = null;
    if (decision === "import") {
      const payload = inquirySchema.omit({ nonce: true, companyFax: true }).parse(request.payload);
      const [lead] = await tx.insert(leads).values({
        workspaceId: context.workspaceId, companyName: payload.companyName, contactName: payload.contactName,
        contactEmail: payload.email, websiteUrl: payload.website, notes: `Unverified website inquiry. Goal: ${payload.goal}.\n${payload.note}`,
        source: "public-audit-inquiry", status: "NEW", createdByUserId: context.userId,
      }).returning({ id: leads.id });
      leadId = lead.id;
    }
    await tx.update(publicAuditRequests).set({ state: decision === "import" ? "IMPORTED" : "DISMISSED", reviewedBy: context.userId, reviewedAt: new Date(), leadId })
      .where(and(eq(publicAuditRequests.id, request.id), eq(publicAuditRequests.workspaceId, context.workspaceId)));
    await tx.insert(activityEvents).values({ workspaceId: context.workspaceId, actorType: "USER", actorUserId: context.userId,
      action: `intake.${decision}`, resourceType: "public_audit_request", resourceId: request.id,
      summary: { leadId }, correlationId: context.correlationId });
    return leadId;
  });
}

export async function purgeIntakeRequests() {
  // Intake copies expire after 90 days, including imported requests. Existing
  // client/lead records have their separate workspace retention policy.
  const result = await db.execute(sql`select public.purge_public_intake() as removed`);
  return Number(result.rows[0]?.removed ?? 0);
}
