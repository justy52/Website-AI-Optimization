import { createHash } from "node:crypto";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  activityEvents,
  clients,
  competitorObservations,
  competitorTargets,
  operationalNotifications,
  websites,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import {
  competitorLimitForPlan,
  normalizeCompetitorTargetUrl,
  summarizeCompetitorObservation,
} from "@/domain/competitors/observations";
import {
  assertWorkspaceRole,
  type WorkspaceContext,
} from "@/domain/tenancy/context";
import { safeFetchText } from "@/security/safe-fetch";

type CompetitorDatabase = typeof db;
type CompetitorTransaction = Parameters<
  Parameters<CompetitorDatabase["transaction"]>[0]
>[0];

function now() {
  return new Date();
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function recordActivity(
  tx: CompetitorTransaction,
  context: WorkspaceContext,
  action: string,
  resourceType: string,
  resourceId: string,
  summary: Record<string, unknown> = {},
) {
  await tx.insert(activityEvents).values({
    workspaceId: context.workspaceId,
    actorType: context.actorType,
    actorUserId: context.userId,
    actorAgentRunId: context.agentRunId,
    action,
    resourceType,
    resourceId,
    summary,
    correlationId: context.correlationId,
  });
}

async function createNotification(
  tx: CompetitorTransaction,
  context: WorkspaceContext,
  input: {
    type: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    title: string;
    summary: string;
    resourceType?: string;
    resourceId?: string;
  },
) {
  await tx.insert(operationalNotifications).values({
    workspaceId: context.workspaceId,
    type: input.type,
    severity: input.severity,
    title: input.title,
    summary: input.summary,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
  });
}

export async function listWebsiteCompetitorTargets(
  context: WorkspaceContext,
  websiteId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const targets = await tx
      .select()
      .from(competitorTargets)
      .where(
        and(
          eq(competitorTargets.workspaceId, context.workspaceId),
          eq(competitorTargets.websiteId, websiteId),
          isNull(competitorTargets.archivedAt),
        ),
      )
      .orderBy(desc(competitorTargets.createdAt));
    const observations = await tx
      .select()
      .from(competitorObservations)
      .where(
        and(
          eq(competitorObservations.workspaceId, context.workspaceId),
          eq(competitorObservations.websiteId, websiteId),
        ),
      )
      .orderBy(desc(competitorObservations.observedAt))
      .limit(10);

    return { targets, observations };
  });
}

export async function createCompetitorTarget(
  context: WorkspaceContext,
  websiteId: string,
  input: {
    name: string;
    domainOrUrl: string;
    relationship?: string;
    notes?: string;
  },
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN"]);
  const name = input.name.trim();

  if (!name) {
    throw new Error("Competitor name is required.");
  }

  const normalized = normalizeCompetitorTargetUrl(input.domainOrUrl);
  const relationship = input.relationship?.trim() || "DIRECT_COMPETITOR";
  const notes = input.notes?.trim() || null;

  return withTenantContext(database, context, async (tx) => {
    const [targetWebsite] = await tx
      .select({
        websiteId: websites.id,
        clientId: websites.clientId,
        servicePlan: clients.servicePlan,
        servicePlanVersion: clients.servicePlanVersion,
      })
      .from(websites)
      .innerJoin(
        clients,
        and(
          eq(clients.workspaceId, websites.workspaceId),
          eq(clients.id, websites.clientId),
        ),
      )
      .where(
        and(
          eq(websites.workspaceId, context.workspaceId),
          eq(websites.id, websiteId),
          isNull(websites.archivedAt),
          isNull(clients.archivedAt),
        ),
      )
      .limit(1);

    if (!targetWebsite) {
      throw new Error("Website was not found.");
    }

    const [count] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(competitorTargets)
      .where(
        and(
          eq(competitorTargets.workspaceId, context.workspaceId),
          eq(competitorTargets.websiteId, websiteId),
          eq(competitorTargets.active, true),
          isNull(competitorTargets.archivedAt),
        ),
      );
    const planLimit = competitorLimitForPlan(
      targetWebsite.servicePlan,
      targetWebsite.servicePlanVersion,
    );

    if (planLimit !== null && (count?.count ?? 0) >= planLimit) {
      await createNotification(tx, context, {
        type: "entitlement.limit_reached",
        severity: "MEDIUM",
        title: "Competitor limit reached",
        summary: `The current service plan allows ${planLimit} competitor targets.`,
        resourceType: "website",
        resourceId: websiteId,
      });
      throw new Error(`The current service plan allows ${planLimit} competitor targets.`);
    }

    const [target] = await tx
      .insert(competitorTargets)
      .values({
        workspaceId: context.workspaceId,
        clientId: targetWebsite.clientId,
        websiteId,
        name,
        domain: normalized.domain,
        canonicalUrl: normalized.canonicalUrl,
        relationship,
        notes,
        createdByUserId: context.userId,
      })
      .returning();

    await recordActivity(
      tx,
      context,
      "competitor_target.created",
      "competitor_target",
      target.id,
      { websiteId, domain: normalized.domain },
    );

    return target;
  });
}

export async function archiveCompetitorTarget(
  context: WorkspaceContext,
  competitorTargetId: string,
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN"]);

  return withTenantContext(database, context, async (tx) => {
    const [target] = await tx
      .update(competitorTargets)
      .set({ active: false, archivedAt: now(), updatedAt: now() })
      .where(
        and(
          eq(competitorTargets.workspaceId, context.workspaceId),
          eq(competitorTargets.id, competitorTargetId),
        ),
      )
      .returning();

    if (!target) {
      throw new Error("Competitor target was not found.");
    }

    await recordActivity(
      tx,
      context,
      "competitor_target.archived",
      "competitor_target",
      target.id,
      { domain: target.domain },
    );

    return target;
  });
}

export async function observeCompetitorTarget(
  context: WorkspaceContext,
  competitorTargetId: string,
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN", "ANALYST"]);

  const target = await withTenantContext(database, context, async (tx) => {
    const [row] = await tx
      .select()
      .from(competitorTargets)
      .where(
        and(
          eq(competitorTargets.workspaceId, context.workspaceId),
          eq(competitorTargets.id, competitorTargetId),
          eq(competitorTargets.active, true),
          isNull(competitorTargets.archivedAt),
        ),
      )
      .limit(1);

    if (!row) {
      throw new Error("Competitor target was not found.");
    }

    return row;
  });
  const [previous] = await withTenantContext(database, context, async (tx) =>
    tx
      .select()
      .from(competitorObservations)
      .where(
        and(
          eq(competitorObservations.workspaceId, context.workspaceId),
          eq(competitorObservations.competitorTargetId, target.id),
        ),
      )
      .orderBy(desc(competitorObservations.observedAt))
      .limit(1),
  );

  try {
    const result = await safeFetchText(target.canonicalUrl, {
      maxBytes: 500_000,
      timeoutMs: 8_000,
    });
    const summary = summarizeCompetitorObservation(
      result,
      previous?.contentHash,
    );
    const [observation] = await withTenantContext(database, context, async (tx) => {
      const [row] = await tx
        .insert(competitorObservations)
        .values({
          workspaceId: context.workspaceId,
          competitorTargetId: target.id,
          clientId: target.clientId,
          websiteId: target.websiteId,
          sourceUrl: summary.sourceUrl,
          httpStatus: summary.httpStatus,
          observedTitle: summary.observedTitle,
          observedMetaDescription: summary.observedMetaDescription,
          contentHash: summary.contentHash,
          changedSincePrevious: Boolean(
            previous && previous.contentHash !== summary.contentHash,
          ),
          changeSummary: summary.changeSummary,
          evidence: summary.evidence,
          limitations: summary.limitations,
        })
        .returning();

      await recordActivity(
        tx,
        context,
        "competitor_observation.created",
        "competitor_observation",
        row.id,
        {
          competitorTargetId: target.id,
          changedSincePrevious: row.changedSincePrevious,
        },
      );

      if (row.changedSincePrevious) {
        await createNotification(tx, context, {
          type: "competitor.changed",
          severity: "MEDIUM",
          title: "Competitor change observed",
          summary: "A public competitor homepage metadata change was detected.",
          resourceType: "competitor_observation",
          resourceId: row.id,
        });
      }

      return [row];
    });

    return observation;
  } catch (error) {
    const summary =
      error instanceof Error
        ? error.message.slice(0, 300)
        : "Competitor observation failed.";

    return withTenantContext(database, context, async (tx) => {
      const [row] = await tx
        .insert(competitorObservations)
        .values({
          workspaceId: context.workspaceId,
          competitorTargetId: target.id,
          clientId: target.clientId,
          websiteId: target.websiteId,
          sourceUrl: target.canonicalUrl,
          httpStatus: null,
          observedTitle: null,
          observedMetaDescription: null,
          contentHash: hashText(`error:${summary}:${now().toISOString()}`),
          changedSincePrevious: false,
          changeSummary: "Competitor public-page observation failed.",
          evidence: { errorSummary: summary },
          limitations: {
            fetchFailed: true,
            rankData: "UNAVAILABLE",
            keywordProvider: "UNAVAILABLE",
          },
        })
        .returning();

      await createNotification(tx, context, {
        type: "competitor.observation_failed",
        severity: "MEDIUM",
        title: "Competitor observation failed",
        summary,
        resourceType: "competitor_target",
        resourceId: target.id,
      });
      await recordActivity(
        tx,
        context,
        "competitor_observation.failed",
        "competitor_target",
        target.id,
        { errorSummary: summary },
      );

      return row;
    });
  }
}

export async function getCompetitorDashboardSummary(
  context: WorkspaceContext,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [activeTargets] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(competitorTargets)
      .where(
        and(
          eq(competitorTargets.workspaceId, context.workspaceId),
          eq(competitorTargets.active, true),
          isNull(competitorTargets.archivedAt),
        ),
      );
    const [changes] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(competitorObservations)
      .where(
        and(
          eq(competitorObservations.workspaceId, context.workspaceId),
          eq(competitorObservations.changedSincePrevious, true),
          sql`${competitorObservations.createdAt} >= now() - interval '7 days'`,
        ),
      );

    return {
      activeTargets: activeTargets?.count ?? 0,
      recentChanges: changes?.count ?? 0,
    };
  });
}
