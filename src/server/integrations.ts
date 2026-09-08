import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import {
  activityEvents,
  clients,
  integrationConnections,
  integrationOAuthStates,
  integrationSecrets,
  operationalNotifications,
  searchConsoleObservations,
  searchConsoleProperties,
  websites,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import {
  type GoogleOAuthTokenResponse,
  assertSearchConsoleReadonlyScopes,
  LiveSearchConsoleProvider,
  type SearchConsoleProvider,
} from "@/domain/integrations/google-search-console-adapter";
import {
  GOOGLE_SEARCH_CONSOLE_PROVIDER,
  GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE,
  normalizeSearchConsoleRow,
  propertyTypeForSiteUrl,
  searchConsolePropertyMatchesWebsite,
} from "@/domain/integrations/search-console";
import {
  createOAuthState,
  hashOAuthState,
  oauthStateExpiresAt,
} from "@/domain/integrations/oauth-state";
import { assertOAuthStateMatchesContext } from "@/domain/integrations/oauth-security";
import {
  assertWorkspaceRole,
  type WorkspaceContext,
} from "@/domain/tenancy/context";
import {
  decryptCredentialSecret,
  encryptCredentialSecret,
  type EncryptedSecretPayload,
} from "@/security/credential-encryption";
import { serverEnv } from "@/lib/env";

type IntegrationDatabase = typeof db;
type IntegrationTransaction = Parameters<
  Parameters<IntegrationDatabase["transaction"]>[0]
>[0];

type StoredGoogleTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string | null;
  scopes: string[];
  tokenType: string;
};

function now() {
  return new Date();
}

function gscConfig() {
  if (
    !serverEnv.GOOGLE_OAUTH_CLIENT_ID ||
    !serverEnv.GOOGLE_OAUTH_CLIENT_SECRET ||
    !serverEnv.GOOGLE_OAUTH_REDIRECT_URI
  ) {
    return null;
  }

  return {
    clientId: serverEnv.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: serverEnv.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: serverEnv.GOOGLE_OAUTH_REDIRECT_URI,
  };
}

function safeRedirectPath(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (path.includes("\n") || path.includes("\r")) return null;
  return path;
}

function tokenPayload(token: GoogleOAuthTokenResponse): StoredGoogleTokens {
  if (!token.accessToken || !token.refreshToken) {
    throw new Error("Search Console OAuth requires an access and refresh token.");
  }

  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: token.expiresAt?.toISOString() ?? null,
    scopes: token.scope,
    tokenType: token.tokenType,
  };
}

async function recordActivity(
  tx: IntegrationTransaction,
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
  tx: IntegrationTransaction,
  context: WorkspaceContext,
  input: {
    type: string;
    title: string;
    summary: string;
    resourceType?: string;
    resourceId?: string;
  },
) {
  await tx.insert(operationalNotifications).values({
    workspaceId: context.workspaceId,
    type: input.type,
    severity: "MEDIUM",
    title: input.title,
    summary: input.summary,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
  });
}

export function isGoogleSearchConsoleConfigured() {
  return Boolean(gscConfig());
}

export async function listIntegrationConnections(
  context: WorkspaceContext,
  database = db,
) {
  return withTenantContext(database, context, async (tx) =>
    tx
      .select({
        id: integrationConnections.id,
        provider: integrationConnections.provider,
        connectionType: integrationConnections.connectionType,
        scopes: integrationConnections.scopes,
        status: integrationConnections.status,
        clientId: integrationConnections.clientId,
        clientName: clients.name,
        websiteId: integrationConnections.websiteId,
        websiteName: websites.displayName,
        websiteDomain: websites.domain,
        selectedPropertyUrl: searchConsoleProperties.propertyUrl,
        grantedAt: integrationConnections.createdAt,
        lastSuccessAt: integrationConnections.lastSuccessAt,
        lastErrorAt: integrationConnections.lastErrorAt,
        lastErrorSummary: integrationConnections.lastErrorSummary,
      })
      .from(integrationConnections)
      .leftJoin(
        clients,
        and(
          eq(clients.workspaceId, integrationConnections.workspaceId),
          eq(clients.id, integrationConnections.clientId),
        ),
      )
      .leftJoin(
        websites,
        and(
          eq(websites.workspaceId, integrationConnections.workspaceId),
          eq(websites.id, integrationConnections.websiteId),
        ),
      )
      .leftJoin(
        searchConsoleProperties,
        and(
          eq(
            searchConsoleProperties.workspaceId,
            integrationConnections.workspaceId,
          ),
          eq(
            searchConsoleProperties.integrationConnectionId,
            integrationConnections.id,
          ),
          eq(searchConsoleProperties.selected, true),
          isNull(searchConsoleProperties.archivedAt),
        ),
      )
      .where(eq(integrationConnections.workspaceId, context.workspaceId))
      .orderBy(desc(integrationConnections.createdAt)),
  );
}

export async function getWebsiteSearchConsolePanel(
  context: WorkspaceContext,
  websiteId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [website] = await tx
      .select({
        id: websites.id,
        clientId: websites.clientId,
        domain: websites.domain,
      })
      .from(websites)
      .where(
        and(
          eq(websites.workspaceId, context.workspaceId),
          eq(websites.id, websiteId),
          isNull(websites.archivedAt),
        ),
      )
      .limit(1);

    if (!website) {
      throw new Error("Website was not found.");
    }

    const connections = await tx
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.workspaceId, context.workspaceId),
          eq(integrationConnections.websiteId, website.id),
          eq(integrationConnections.provider, GOOGLE_SEARCH_CONSOLE_PROVIDER),
        ),
      )
      .orderBy(desc(integrationConnections.createdAt));
    const properties = await tx
      .select()
      .from(searchConsoleProperties)
      .where(
        and(
          eq(searchConsoleProperties.workspaceId, context.workspaceId),
          eq(searchConsoleProperties.websiteId, website.id),
          isNull(searchConsoleProperties.archivedAt),
        ),
      )
      .orderBy(desc(searchConsoleProperties.selected), desc(searchConsoleProperties.createdAt));
    const latestObservations = await tx
      .select()
      .from(searchConsoleObservations)
      .where(
        and(
          eq(searchConsoleObservations.workspaceId, context.workspaceId),
          eq(searchConsoleObservations.websiteId, website.id),
        ),
      )
      .orderBy(desc(searchConsoleObservations.windowEndDate))
      .limit(12);

    return {
      configured: isGoogleSearchConsoleConfigured(),
      website,
      connections,
      properties,
      latestObservations,
    };
  });
}

export async function beginGoogleSearchConsoleOAuth(
  context: WorkspaceContext,
  websiteId: string,
  redirectPath?: string | null,
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN"]);
  const config = gscConfig();

  if (!config) {
    throw new Error("Google Search Console OAuth is not configured for this environment.");
  }

  const state = createOAuthState();
  const stateHash = hashOAuthState(state);
  const scopes = [GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE];

  await withTenantContext(database, context, async (tx) => {
    const [website] = await tx
      .select({
        id: websites.id,
        clientId: websites.clientId,
        domain: websites.domain,
      })
      .from(websites)
      .where(
        and(
          eq(websites.workspaceId, context.workspaceId),
          eq(websites.id, websiteId),
          isNull(websites.archivedAt),
        ),
      )
      .limit(1);

    if (!website) {
      throw new Error("Website was not found.");
    }

    await tx.insert(integrationOAuthStates).values({
      workspaceId: context.workspaceId,
      clientId: website.clientId,
      websiteId: website.id,
      provider: GOOGLE_SEARCH_CONSOLE_PROVIDER,
      stateHash,
      scopes,
      redirectPath: safeRedirectPath(redirectPath),
      createdByUserId: context.userId,
      expiresAt: oauthStateExpiresAt(),
    });

    await recordActivity(
      tx,
      context,
      "integration.oauth_started",
      "website",
      website.id,
      { provider: GOOGLE_SEARCH_CONSOLE_PROVIDER, scopes },
    );
  });

  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", scopes.join(" "));
  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("prompt", "consent");
  authorizationUrl.searchParams.set("include_granted_scopes", "true");
  authorizationUrl.searchParams.set("state", state);

  return authorizationUrl.toString();
}

export async function completeGoogleSearchConsoleOAuth(
  context: WorkspaceContext,
  input: { state: string; code: string },
  provider: SearchConsoleProvider = new LiveSearchConsoleProvider(),
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN"]);
  const config = gscConfig();

  if (!config) {
    throw new Error("Google Search Console OAuth is not configured for this environment.");
  }

  const stateHash = hashOAuthState(input.state);
  const pending = await withTenantContext(database, context, async (tx) => {
    const [row] = await tx
      .select({
        id: integrationOAuthStates.id,
        workspaceId: integrationOAuthStates.workspaceId,
        clientId: integrationOAuthStates.clientId,
        websiteId: integrationOAuthStates.websiteId,
        websiteDomain: websites.domain,
        provider: integrationOAuthStates.provider,
        status: integrationOAuthStates.status,
        createdByUserId: integrationOAuthStates.createdByUserId,
        scopes: integrationOAuthStates.scopes,
        redirectPath: integrationOAuthStates.redirectPath,
        expiresAt: integrationOAuthStates.expiresAt,
      })
      .from(integrationOAuthStates)
      .innerJoin(
        websites,
        and(
          eq(websites.workspaceId, integrationOAuthStates.workspaceId),
          eq(websites.clientId, integrationOAuthStates.clientId),
          eq(websites.id, integrationOAuthStates.websiteId),
          isNull(websites.archivedAt),
        ),
      )
      .where(
        and(
          eq(integrationOAuthStates.workspaceId, context.workspaceId),
          eq(integrationOAuthStates.stateHash, stateHash),
          eq(integrationOAuthStates.provider, GOOGLE_SEARCH_CONSOLE_PROVIDER),
          eq(integrationOAuthStates.status, "PENDING"),
          eq(integrationOAuthStates.createdByUserId, context.userId ?? ""),
        ),
      )
      .limit(1);

    assertOAuthStateMatchesContext(row, {
      workspaceId: context.workspaceId,
      userId: context.userId,
      provider: GOOGLE_SEARCH_CONSOLE_PROVIDER,
    });

    return row;
  });
  assertSearchConsoleReadonlyScopes(pending.scopes);

  const token = await provider.exchangeCode({
    code: input.code,
    redirectUri: config.redirectUri,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  });
  assertSearchConsoleReadonlyScopes(token.scope);
  const sites = await provider.listSites(token.accessToken);

  return withTenantContext(database, context, async (tx) => {
    const encrypted = encryptCredentialSecret(JSON.stringify(tokenPayload(token)), {
      keyMaterial: serverEnv.CREDENTIAL_ENCRYPTION_KEY,
      keyVersion: serverEnv.CREDENTIAL_KEY_VERSION,
    });
    const [connection] = await tx
      .insert(integrationConnections)
      .values({
        workspaceId: context.workspaceId,
        clientId: pending.clientId,
        websiteId: pending.websiteId,
        provider: GOOGLE_SEARCH_CONSOLE_PROVIDER,
        connectionType: "OAUTH",
        scopes: token.scope,
        status: "CONNECTED",
        keyVersion: encrypted.keyVersion,
        tokenMetadata: {
          expiresAt: token.expiresAt?.toISOString() ?? null,
          tokenType: token.tokenType,
          scopes: token.scope,
          refreshTokenStored: true,
        },
        createdByUserId: context.userId,
        lastSuccessAt: now(),
      })
      .returning();
    const [secret] = await tx
      .insert(integrationSecrets)
      .values({
        workspaceId: context.workspaceId,
        integrationConnectionId: connection.id,
        secretType: "OAUTH_TOKEN",
        algorithm: encrypted.algorithm,
        keyVersion: encrypted.keyVersion,
        nonce: encrypted.nonce,
        ciphertext: encrypted.ciphertext,
        authTag: encrypted.authTag,
        metadata: { provider: GOOGLE_SEARCH_CONSOLE_PROVIDER },
      })
      .returning();

    await tx
      .update(integrationConnections)
      .set({ secretRef: secret.id, updatedAt: now() })
      .where(
        and(
          eq(integrationConnections.workspaceId, context.workspaceId),
          eq(integrationConnections.id, connection.id),
        ),
      );

    for (const site of sites) {
      const verifiedSiteMatch = searchConsolePropertyMatchesWebsite(
        site.siteUrl,
        pending.websiteDomain,
      );

      await tx
        .insert(searchConsoleProperties)
        .values({
          workspaceId: context.workspaceId,
          integrationConnectionId: connection.id,
          clientId: pending.clientId,
          websiteId: pending.websiteId,
          propertyUrl: site.siteUrl,
          propertyType: propertyTypeForSiteUrl(site.siteUrl),
          permissionLevel: site.permissionLevel ?? null,
          verifiedSiteMatch,
          selected: false,
        })
        .onConflictDoNothing();
    }

    await tx
      .update(integrationOAuthStates)
      .set({ status: "CONSUMED", consumedAt: now() })
      .where(
        and(
          eq(integrationOAuthStates.workspaceId, context.workspaceId),
          eq(integrationOAuthStates.id, pending.id),
        ),
      );

    await recordActivity(
      tx,
      context,
      "integration.connected",
      "integration_connection",
      connection.id,
      {
        provider: GOOGLE_SEARCH_CONSOLE_PROVIDER,
        scopes: token.scope,
        propertiesDiscovered: sites.length,
      },
    );

    return connection;
  });
}

async function loadStoredTokens(
  context: WorkspaceContext,
  connectionId: string,
  database = db,
) {
  const [row] = await withTenantContext(database, context, async (tx) =>
    tx
      .select({
        connection: integrationConnections,
        secret: integrationSecrets,
      })
      .from(integrationConnections)
      .innerJoin(
        integrationSecrets,
        and(
          eq(integrationSecrets.workspaceId, integrationConnections.workspaceId),
          eq(
            integrationSecrets.integrationConnectionId,
            integrationConnections.id,
          ),
          eq(integrationSecrets.secretType, "OAUTH_TOKEN"),
        ),
      )
      .where(
        and(
          eq(integrationConnections.workspaceId, context.workspaceId),
          eq(integrationConnections.id, connectionId),
          eq(integrationConnections.status, "CONNECTED"),
          isNull(integrationSecrets.revokedAt),
        ),
      )
      .limit(1),
  );

  if (!row) {
    throw new Error("Search Console connection was not found.");
  }

  const secret = row.secret;
  const encrypted: EncryptedSecretPayload = {
    algorithm: "AES-256-GCM",
    keyVersion: secret.keyVersion,
    nonce: secret.nonce,
    ciphertext: secret.ciphertext,
    authTag: secret.authTag,
  };
  const tokens = JSON.parse(
    decryptCredentialSecret(encrypted, {
      keyMaterial: serverEnv.CREDENTIAL_ENCRYPTION_KEY,
    }),
  ) as StoredGoogleTokens;

  return { connection: row.connection, tokens, secret };
}

async function getSearchConsoleAccessToken(
  context: WorkspaceContext,
  connectionId: string,
  provider: SearchConsoleProvider,
  database = db,
) {
  const config = gscConfig();

  if (!config) {
    throw new Error("Google Search Console OAuth is not configured for this environment.");
  }

  const stored = await loadStoredTokens(context, connectionId, database);
  const expiresAt = stored.tokens.expiresAt
    ? new Date(stored.tokens.expiresAt)
    : null;

  if (!expiresAt || expiresAt.getTime() - Date.now() > 60_000) {
    return stored.tokens.accessToken;
  }

  const refreshed = await provider.refreshAccessToken({
    refreshToken: stored.tokens.refreshToken,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  });
  const scopes = refreshed.scope.length > 0 ? refreshed.scope : stored.connection.scopes;
  assertSearchConsoleReadonlyScopes(scopes);
  const payload = tokenPayload({ ...refreshed, scope: scopes });
  const encrypted = encryptCredentialSecret(JSON.stringify(payload), {
    keyMaterial: serverEnv.CREDENTIAL_ENCRYPTION_KEY,
    keyVersion: serverEnv.CREDENTIAL_KEY_VERSION,
  });

  await withTenantContext(database, context, async (tx) => {
    await tx
      .update(integrationSecrets)
      .set({
        algorithm: encrypted.algorithm,
        keyVersion: encrypted.keyVersion,
        nonce: encrypted.nonce,
        ciphertext: encrypted.ciphertext,
        authTag: encrypted.authTag,
        rotatedAt: now(),
      })
      .where(
        and(
          eq(integrationSecrets.workspaceId, context.workspaceId),
          eq(integrationSecrets.id, stored.secret.id),
        ),
      );
    await tx
      .update(integrationConnections)
      .set({
        tokenMetadata: {
          expiresAt: payload.expiresAt,
          tokenType: payload.tokenType,
          scopes,
          refreshTokenStored: true,
        },
        updatedAt: now(),
      })
      .where(
        and(
          eq(integrationConnections.workspaceId, context.workspaceId),
          eq(integrationConnections.id, connectionId),
        ),
      );
  });

  return payload.accessToken;
}

export async function selectSearchConsoleProperty(
  context: WorkspaceContext,
  propertyId: string,
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN"]);

  return withTenantContext(database, context, async (tx) => {
    const [property] = await tx
      .select()
      .from(searchConsoleProperties)
      .where(
        and(
          eq(searchConsoleProperties.workspaceId, context.workspaceId),
          eq(searchConsoleProperties.id, propertyId),
          isNull(searchConsoleProperties.archivedAt),
        ),
      )
      .limit(1);

    if (!property) {
      throw new Error("Search Console property was not found.");
    }

    if (!property.verifiedSiteMatch) {
      throw new Error("Selected property does not match this website domain.");
    }

    await tx
      .update(searchConsoleProperties)
      .set({ selected: false, updatedAt: now() })
      .where(
        and(
          eq(searchConsoleProperties.workspaceId, context.workspaceId),
          eq(searchConsoleProperties.websiteId, property.websiteId),
        ),
      );
    const [selected] = await tx
      .update(searchConsoleProperties)
      .set({ selected: true, updatedAt: now() })
      .where(
        and(
          eq(searchConsoleProperties.workspaceId, context.workspaceId),
          eq(searchConsoleProperties.id, property.id),
        ),
      )
      .returning();

    await recordActivity(
      tx,
      context,
      "integration.search_console_property_selected",
      "search_console_property",
      property.id,
      { provider: GOOGLE_SEARCH_CONSOLE_PROVIDER, propertyUrl: property.propertyUrl },
    );

    return selected;
  });
}

export async function syncSearchConsoleObservations(
  context: WorkspaceContext,
  propertyId: string,
  provider: SearchConsoleProvider = new LiveSearchConsoleProvider(),
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN", "ANALYST"]);

  const property = await withTenantContext(database, context, async (tx) => {
    const [row] = await tx
      .select()
      .from(searchConsoleProperties)
      .where(
        and(
          eq(searchConsoleProperties.workspaceId, context.workspaceId),
          eq(searchConsoleProperties.id, propertyId),
          eq(searchConsoleProperties.selected, true),
          isNull(searchConsoleProperties.archivedAt),
        ),
      )
      .limit(1);

    if (!row) {
      throw new Error("A selected Search Console property is required.");
    }

    return row;
  });
  const accessToken = await getSearchConsoleAccessToken(
    context,
    property.integrationConnectionId,
    provider,
    database,
  );
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  const window = {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };

  try {
    const rows = await provider.querySearchAnalytics({
      accessToken,
      propertyUrl: property.propertyUrl,
      window,
      rowLimit: 50,
    });
    const normalized = rows.map(normalizeSearchConsoleRow);

    await withTenantContext(database, context, async (tx) => {
      if (normalized.length > 0) {
        await tx.insert(searchConsoleObservations).values(
          normalized.map((row) => ({
            workspaceId: context.workspaceId,
            integrationConnectionId: property.integrationConnectionId,
            searchConsolePropertyId: property.id,
            clientId: property.clientId,
            websiteId: property.websiteId,
            windowStartDate: window.startDate,
            windowEndDate: window.endDate,
            propertyUrl: property.propertyUrl,
            query: row.query,
            page: row.page,
            clicks: row.clicks,
            impressions: row.impressions,
            ctrBasisPoints: row.ctrBasisPoints,
            averagePositionBasisPoints: row.averagePositionBasisPoints,
            completeness: row.completeness,
            metadata: { dimensions: ["query", "page"], rowLimit: 50 },
          })),
        );
      }

      await tx
        .update(integrationConnections)
        .set({ lastSuccessAt: now(), updatedAt: now() })
        .where(
          and(
            eq(integrationConnections.workspaceId, context.workspaceId),
            eq(integrationConnections.id, property.integrationConnectionId),
          ),
        );
      await recordActivity(
        tx,
        context,
        "integration.search_console_synced",
        "search_console_property",
        property.id,
        {
          propertyUrl: property.propertyUrl,
          observations: normalized.length,
          window,
        },
      );
    });

    return { observations: normalized.length, window };
  } catch (error) {
    const summary =
      error instanceof Error ? error.message.slice(0, 240) : "Search Console sync failed.";

    await withTenantContext(database, context, async (tx) => {
      await tx
        .update(integrationConnections)
        .set({
          status: "ERROR",
          lastErrorAt: now(),
          lastErrorSummary: summary,
          updatedAt: now(),
        })
        .where(
          and(
            eq(integrationConnections.workspaceId, context.workspaceId),
            eq(integrationConnections.id, property.integrationConnectionId),
          ),
        );
      await createNotification(tx, context, {
        type: "integration.sync_failed",
        title: "Search Console sync failed",
        summary,
        resourceType: "search_console_property",
        resourceId: property.id,
      });
    });

    throw error;
  }
}

export async function disconnectIntegrationConnection(
  context: WorkspaceContext,
  connectionId: string,
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN"]);

  return withTenantContext(database, context, async (tx) => {
    const [connection] = await tx
      .update(integrationConnections)
      .set({
        status: "REVOKED",
        revokedAt: now(),
        updatedAt: now(),
      })
      .where(
        and(
          eq(integrationConnections.workspaceId, context.workspaceId),
          eq(integrationConnections.id, connectionId),
        ),
      )
      .returning();

    if (!connection) {
      throw new Error("Integration connection was not found.");
    }

    await tx
      .update(integrationSecrets)
      .set({ revokedAt: now() })
      .where(
        and(
          eq(integrationSecrets.workspaceId, context.workspaceId),
          eq(integrationSecrets.integrationConnectionId, connection.id),
        ),
      );
    await tx
      .update(searchConsoleProperties)
      .set({ selected: false, updatedAt: now() })
      .where(
        and(
          eq(searchConsoleProperties.workspaceId, context.workspaceId),
          eq(searchConsoleProperties.integrationConnectionId, connection.id),
        ),
      );
    await createNotification(tx, context, {
      type: "integration.disconnected",
      title: "Integration disconnected",
      summary: `${connection.provider} was disconnected for this website.`,
      resourceType: "integration_connection",
      resourceId: connection.id,
    });
    await recordActivity(
      tx,
      context,
      "integration.disconnected",
      "integration_connection",
      connection.id,
      { provider: connection.provider },
    );

    return connection;
  });
}
