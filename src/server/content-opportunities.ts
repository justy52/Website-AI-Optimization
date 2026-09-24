import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { activityEvents, auditCheckResults, audits, businessFacts, clients, opportunities, websites } from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import { openOpportunityStatuses } from "@/domain/opportunities/generation";
import { calculateOpportunityPriority } from "@/domain/opportunities/priority";
import { assertWorkspaceRole, type WorkspaceContext } from "@/domain/tenancy/context";

export class ContentOpportunityValidationError extends Error {}

export async function nominateContentOpportunity(context: WorkspaceContext, input: { websiteId: string; title: string; rationale: string }, database = db) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN", "ANALYST"]);
  if (context.actorType !== "USER" || !context.userId) throw new ContentOpportunityValidationError("A human must nominate content work.");
  const title = input.title.trim(); const rationale = input.rationale.trim();
  if (!title || title.length > 160 || rationale.length < 20 || rationale.length > 1000) throw new ContentOpportunityValidationError("Provide a topic and a rationale of 20–1000 characters.");
  return withTenantContext(database, context, async tx => {
    const [site] = await tx.select({ website: websites, plan: clients.servicePlan }).from(websites).innerJoin(clients, and(eq(clients.workspaceId, websites.workspaceId), eq(clients.id, websites.clientId))).where(and(eq(websites.workspaceId, context.workspaceId), eq(websites.id, input.websiteId), isNull(websites.archivedAt))).limit(1);
    if (!site) throw new ContentOpportunityValidationError("Website was not found.");
    const [fact] = await tx.select({ id: businessFacts.id }).from(businessFacts).where(and(eq(businessFacts.workspaceId, context.workspaceId), eq(businessFacts.clientId, site.website.clientId), eq(businessFacts.factType, "service"), eq(businessFacts.verificationStatus, "VERIFIED"), eq(businessFacts.sensitivity, "PUBLIC"), isNull(businessFacts.archivedAt))).limit(1);
    if (!fact) throw new ContentOpportunityValidationError("Record a PUBLIC VERIFIED service fact before nominating content work.");
    const [source] = await tx.select({ check: auditCheckResults }).from(auditCheckResults).innerJoin(audits, and(eq(audits.workspaceId, auditCheckResults.workspaceId), eq(audits.id, auditCheckResults.auditId))).where(and(eq(auditCheckResults.workspaceId, context.workspaceId), eq(audits.websiteId, input.websiteId), eq(auditCheckResults.checkKey, "seo.content_targeting"))).orderBy(desc(auditCheckResults.createdAt)).limit(1);
    if (!source) throw new ContentOpportunityValidationError("Run an audit before nominating content work.");
    const factors = { impact: 3, confidence: 2, urgency: 2, strategicFit: 3, planFit: 3, staleness: 0, effort: 3 as const };
    const priority = calculateOpportunityPriority(factors);
    const [created] = await tx.insert(opportunities).values({
      workspaceId: context.workspaceId, clientId: site.website.clientId, websiteId: site.website.id,
      sourceAuditId: source.check.auditId, sourceAuditRunId: source.check.auditRunId,
      sourceCheckResultId: source.check.id, sourceCheckKey: source.check.checkKey, sourceCheckVersion: source.check.checkVersion,
      sourceResultStatus: source.check.status, sourceSeverity: "LOW", sourceEvidenceRefs: source.check.evidenceRefs,
      evidenceConfidence: "LOW", category: "seo", normalizedRemediationFamily: "content_targeting",
      title, summary: `Human-nominated editorial work, not an automated content-gap finding. ${rationale}`,
      recommendedAction: "Prepare a bounded brief from verified facts; validate the topic with the client.", status: "DRAFT",
      ...factors, basePriority: priority.baseScore, finalPriority: priority.score, priorityBand: priority.band,
      modifiers: { nomination: "HUMAN", supportingFactId: fact.id }, priorityReasons: ["Human editorial nomination; no measured search demand is claimed."],
      planScope: ["GROWTH", "PRO"].includes(site.plan) ? "INCLUDED" : "MAY_REQUIRE_ADD_ON",
    }).onConflictDoNothing().returning();
    if (!created) {
      const [existing] = await tx.select().from(opportunities).where(and(eq(opportunities.workspaceId, context.workspaceId), eq(opportunities.websiteId, input.websiteId), eq(opportunities.sourceCheckKey, "seo.content_targeting"), eq(opportunities.normalizedRemediationFamily, "content_targeting"), inArray(opportunities.status, openOpportunityStatuses))).limit(1);
      if (!existing) throw new Error("Content Opportunity creation failed.");
      return existing;
    }
    await tx.insert(activityEvents).values({ workspaceId: context.workspaceId, actorType: context.actorType, actorUserId: context.userId, action: "opportunity.created", resourceType: "opportunity", resourceId: created.id, summary: { source: "human_editorial_nomination", supportingFactId: fact.id, sourceAuditId: source.check.auditId } });
    return created;
  });
}
