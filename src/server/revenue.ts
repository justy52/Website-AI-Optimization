import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  activityEvents,
  clients,
  leads,
  websites,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import { getServicePlanDefinition, type ServicePlanKey } from "@/domain/service-plans";
import type { WorkspaceContext } from "@/domain/tenancy/context";
import {
  normalizeCanonicalUrl,
  normalizeDomain,
} from "@/domain/websites/url";
import { planLeadConversion } from "@/domain/revenue/workflows";

export const leadStatuses = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "AUDIT_OFFERED",
  "AUDIT_PURCHASED",
  "CONVERTED",
  "LOST",
  "DISQUALIFIED",
] as const;

export type LeadStatus = (typeof leadStatuses)[number];

export const websiteAuthorizationScopes = [
  "PUBLIC_PAGES_ONLY",
  "PUBLIC_SITE_WITH_CLIENT_AUTHORIZATION",
  "LIMITED_TO_LISTED_URLS",
] as const;

export type WebsiteAuthorizationScope = (typeof websiteAuthorizationScopes)[number];

export type DashboardSummary = {
  activeLeads: number;
  activeClients: number;
  activeWebsites: number;
  recentLeadNames: string[];
};

type RevenueDatabase = typeof db;

function now() {
  return new Date();
}

function isLeadStatus(value: string): value is LeadStatus {
  return leadStatuses.includes(value as LeadStatus);
}

function isWebsiteAuthorizationScope(
  value: string,
): value is WebsiteAuthorizationScope {
  return websiteAuthorizationScopes.includes(value as WebsiteAuthorizationScope);
}

function optionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function optionalWebsiteUrl(value: string | null | undefined): string | null {
  const trimmed = optionalString(value);
  return trimmed ? normalizeCanonicalUrl(trimmed) : null;
}

async function recordActivity(
  tx: Parameters<Parameters<RevenueDatabase["transaction"]>[0]>[0],
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

export async function getDashboardSummary(
  context: WorkspaceContext,
  database = db,
): Promise<DashboardSummary> {
  return withTenantContext(database, context, async (tx) => {
    const [leadCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(eq(leads.workspaceId, context.workspaceId), isNull(leads.archivedAt)));

    const [clientCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(clients)
      .where(
        and(
          eq(clients.workspaceId, context.workspaceId),
          isNull(clients.archivedAt),
        ),
      );

    const [websiteCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(websites)
      .where(
        and(
          eq(websites.workspaceId, context.workspaceId),
          isNull(websites.archivedAt),
        ),
      );

    const recentLeads = await tx
      .select({ companyName: leads.companyName })
      .from(leads)
      .where(and(eq(leads.workspaceId, context.workspaceId), isNull(leads.archivedAt)))
      .orderBy(desc(leads.createdAt))
      .limit(5);

    return {
      activeLeads: leadCount?.count ?? 0,
      activeClients: clientCount?.count ?? 0,
      activeWebsites: websiteCount?.count ?? 0,
      recentLeadNames: recentLeads.map((lead) => lead.companyName),
    };
  });
}

export async function listLeads(context: WorkspaceContext, database = db) {
  return withTenantContext(database, context, async (tx) =>
    tx
      .select()
      .from(leads)
      .where(and(eq(leads.workspaceId, context.workspaceId), isNull(leads.archivedAt)))
      .orderBy(desc(leads.createdAt)),
  );
}

export async function getLead(
  context: WorkspaceContext,
  leadId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [lead] = await tx
      .select()
      .from(leads)
      .where(and(eq(leads.workspaceId, context.workspaceId), eq(leads.id, leadId)))
      .limit(1);

    return lead ?? null;
  });
}

export async function createLead(
  context: WorkspaceContext,
  input: {
    companyName: string;
    status?: string;
    source?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    websiteUrl?: string | null;
    notes?: string | null;
  },
  database = db,
) {
  const companyName = input.companyName.trim();
  const status = input.status ? input.status.trim() : "NEW";

  if (!companyName) {
    throw new Error("Company name is required.");
  }

  if (!isLeadStatus(status)) {
    throw new Error("Lead status is not valid.");
  }

  return withTenantContext(database, context, async (tx) => {
    const [lead] = await tx
      .insert(leads)
      .values({
        workspaceId: context.workspaceId,
        companyName,
        status,
        source: optionalString(input.source),
        contactName: optionalString(input.contactName),
        contactEmail: optionalString(input.contactEmail),
        websiteUrl: optionalWebsiteUrl(input.websiteUrl),
        notes: optionalString(input.notes),
        createdByUserId: context.userId,
      })
      .returning();

    await recordActivity(tx, context, "lead.created", "lead", lead.id, {
      companyName,
      status,
    });

    return lead;
  });
}

export async function updateLead(
  context: WorkspaceContext,
  leadId: string,
  input: {
    companyName: string;
    status: string;
    source?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    websiteUrl?: string | null;
    notes?: string | null;
  },
  database = db,
) {
  const companyName = input.companyName.trim();
  const status = input.status.trim();

  if (!companyName) {
    throw new Error("Company name is required.");
  }

  if (!isLeadStatus(status)) {
    throw new Error("Lead status is not valid.");
  }

  return withTenantContext(database, context, async (tx) => {
    const [lead] = await tx
      .update(leads)
      .set({
        companyName,
        status,
        source: optionalString(input.source),
        contactName: optionalString(input.contactName),
        contactEmail: optionalString(input.contactEmail),
        websiteUrl: optionalWebsiteUrl(input.websiteUrl),
        notes: optionalString(input.notes),
        updatedAt: now(),
      })
      .where(and(eq(leads.workspaceId, context.workspaceId), eq(leads.id, leadId)))
      .returning();

    if (!lead) {
      throw new Error("Lead was not found.");
    }

    await recordActivity(tx, context, "lead.updated", "lead", lead.id, {
      companyName,
      status,
    });

    return lead;
  });
}

export async function archiveLead(
  context: WorkspaceContext,
  leadId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [lead] = await tx
      .update(leads)
      .set({ archivedAt: now(), updatedAt: now() })
      .where(and(eq(leads.workspaceId, context.workspaceId), eq(leads.id, leadId)))
      .returning();

    if (!lead) {
      throw new Error("Lead was not found.");
    }

    await recordActivity(tx, context, "lead.archived", "lead", lead.id);
    return lead;
  });
}

export async function convertLeadToClient(
  context: WorkspaceContext,
  leadId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [lead] = await tx
      .select()
      .from(leads)
      .where(and(eq(leads.workspaceId, context.workspaceId), eq(leads.id, leadId)))
      .limit(1);

    if (!lead) {
      throw new Error("Lead was not found.");
    }

    const [existingClient] = await tx
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.workspaceId, context.workspaceId),
          eq(clients.sourceLeadId, lead.id),
        ),
      )
      .limit(1);

    const decision = planLeadConversion({
      context,
      lead,
      existingClient,
    });

    if (decision.kind === "existing") {
      return existingClient;
    }

    const [client] = await tx
      .insert(clients)
      .values({
        workspaceId: context.workspaceId,
        sourceLeadId: decision.sourceLeadId,
        name: decision.clientName,
        servicePlan: "AUDIT_ONLY",
      })
      .returning();

    await tx
      .update(leads)
      .set({ status: "CONVERTED", updatedAt: now() })
      .where(and(eq(leads.workspaceId, context.workspaceId), eq(leads.id, lead.id)));

    await recordActivity(tx, context, "lead.converted", "lead", lead.id, {
      clientId: client.id,
    });

    return client;
  });
}

export async function listClients(context: WorkspaceContext, database = db) {
  return withTenantContext(database, context, async (tx) =>
    tx
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.workspaceId, context.workspaceId),
          isNull(clients.archivedAt),
        ),
      )
      .orderBy(desc(clients.createdAt)),
  );
}

export async function getClient(
  context: WorkspaceContext,
  clientId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [client] = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.workspaceId, context.workspaceId), eq(clients.id, clientId)))
      .limit(1);

    return client ?? null;
  });
}

export async function updateClient(
  context: WorkspaceContext,
  clientId: string,
  input: {
    name: string;
    servicePlan: ServicePlanKey;
  },
  database = db,
) {
  const name = input.name.trim();
  const plan = getServicePlanDefinition(input.servicePlan);

  if (!name) {
    throw new Error("Client name is required.");
  }

  return withTenantContext(database, context, async (tx) => {
    const [client] = await tx
      .update(clients)
      .set({
        name,
        servicePlan: plan.key,
        servicePlanVersion: plan.version,
        updatedAt: now(),
      })
      .where(and(eq(clients.workspaceId, context.workspaceId), eq(clients.id, clientId)))
      .returning();

    if (!client) {
      throw new Error("Client was not found.");
    }

    await recordActivity(tx, context, "client.updated", "client", client.id, {
      name,
      servicePlan: plan.key,
      servicePlanVersion: plan.version,
    });

    return client;
  });
}

export async function archiveClient(
  context: WorkspaceContext,
  clientId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [client] = await tx
      .update(clients)
      .set({ status: "ARCHIVED", archivedAt: now(), updatedAt: now() })
      .where(and(eq(clients.workspaceId, context.workspaceId), eq(clients.id, clientId)))
      .returning();

    if (!client) {
      throw new Error("Client was not found.");
    }

    await recordActivity(tx, context, "client.archived", "client", client.id);
    return client;
  });
}

export async function listWebsites(context: WorkspaceContext, database = db) {
  return withTenantContext(database, context, async (tx) =>
    tx
      .select({
        id: websites.id,
        workspaceId: websites.workspaceId,
        clientId: websites.clientId,
        clientName: clients.name,
        displayName: websites.displayName,
        canonicalUrl: websites.canonicalUrl,
        domain: websites.domain,
        authorizationScope: websites.authorizationScope,
        monitoringStatus: websites.monitoringStatus,
        createdAt: websites.createdAt,
        updatedAt: websites.updatedAt,
        archivedAt: websites.archivedAt,
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
          isNull(websites.archivedAt),
        ),
      )
      .orderBy(desc(websites.createdAt)),
  );
}

export async function getWebsite(
  context: WorkspaceContext,
  websiteId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [website] = await tx
      .select({
        id: websites.id,
        workspaceId: websites.workspaceId,
        clientId: websites.clientId,
        clientName: clients.name,
        displayName: websites.displayName,
        canonicalUrl: websites.canonicalUrl,
        domain: websites.domain,
        authorizationScope: websites.authorizationScope,
        monitoringStatus: websites.monitoringStatus,
        createdAt: websites.createdAt,
        updatedAt: websites.updatedAt,
        archivedAt: websites.archivedAt,
      })
      .from(websites)
      .innerJoin(
        clients,
        and(
          eq(clients.workspaceId, websites.workspaceId),
          eq(clients.id, websites.clientId),
        ),
      )
      .where(and(eq(websites.workspaceId, context.workspaceId), eq(websites.id, websiteId)))
      .limit(1);

    return website ?? null;
  });
}

export async function createWebsite(
  context: WorkspaceContext,
  input: {
    clientId: string;
    displayName: string;
    canonicalUrl: string;
    domain?: string | null;
    authorizationScope: string;
  },
  database = db,
) {
  const displayName = input.displayName.trim();
  const canonicalUrl = normalizeCanonicalUrl(input.canonicalUrl);
  const domain = normalizeDomain(input.domain || canonicalUrl);
  const authorizationScope = input.authorizationScope.trim();

  if (!displayName) {
    throw new Error("Website display name is required.");
  }

  if (!isWebsiteAuthorizationScope(authorizationScope)) {
    throw new Error("Website authorization scope is not valid.");
  }

  return withTenantContext(database, context, async (tx) => {
    const [client] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(
        and(
          eq(clients.workspaceId, context.workspaceId),
          eq(clients.id, input.clientId),
          isNull(clients.archivedAt),
        ),
      )
      .limit(1);

    if (!client) {
      throw new Error("Client was not found.");
    }

    const [website] = await tx
      .insert(websites)
      .values({
        workspaceId: context.workspaceId,
        clientId: client.id,
        displayName,
        canonicalUrl,
        domain,
        authorizationScope: {
          scope: authorizationScope,
          recordedAt: now().toISOString(),
        },
      })
      .returning();

    await recordActivity(tx, context, "website.created", "website", website.id, {
      clientId: client.id,
      domain,
    });

    return website;
  });
}

export async function updateWebsite(
  context: WorkspaceContext,
  websiteId: string,
  input: {
    displayName: string;
    canonicalUrl: string;
    domain?: string | null;
    authorizationScope: string;
  },
  database = db,
) {
  const displayName = input.displayName.trim();
  const canonicalUrl = normalizeCanonicalUrl(input.canonicalUrl);
  const domain = normalizeDomain(input.domain || canonicalUrl);
  const authorizationScope = input.authorizationScope.trim();

  if (!displayName) {
    throw new Error("Website display name is required.");
  }

  if (!isWebsiteAuthorizationScope(authorizationScope)) {
    throw new Error("Website authorization scope is not valid.");
  }

  return withTenantContext(database, context, async (tx) => {
    const [website] = await tx
      .update(websites)
      .set({
        displayName,
        canonicalUrl,
        domain,
        authorizationScope: {
          scope: authorizationScope,
          recordedAt: now().toISOString(),
        },
        updatedAt: now(),
      })
      .where(
        and(
          eq(websites.workspaceId, context.workspaceId),
          eq(websites.id, websiteId),
        ),
      )
      .returning();

    if (!website) {
      throw new Error("Website was not found.");
    }

    await recordActivity(tx, context, "website.updated", "website", website.id, {
      domain,
    });

    return website;
  });
}

export async function archiveWebsite(
  context: WorkspaceContext,
  websiteId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [website] = await tx
      .update(websites)
      .set({ archivedAt: now(), updatedAt: now() })
      .where(
        and(
          eq(websites.workspaceId, context.workspaceId),
          eq(websites.id, websiteId),
        ),
      )
      .returning();

    if (!website) {
      throw new Error("Website was not found.");
    }

    await recordActivity(tx, context, "website.archived", "website", website.id);
    return website;
  });
}
