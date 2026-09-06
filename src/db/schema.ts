import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { SCORING_DEFINITION_VERSION } from "@/domain/audits/scoring";
import { SERVICE_PLAN_DEFINITION_VERSION } from "@/domain/service-plans";

export const workspaceRoleEnum = pgEnum("workspace_role", [
  "OWNER",
  "ADMIN",
  "ANALYST",
]);

export const membershipStatusEnum = pgEnum("membership_status", [
  "ACTIVE",
  "INVITED",
  "SUSPENDED",
]);

export const leadStatusEnum = pgEnum("lead_status", [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "AUDIT_OFFERED",
  "AUDIT_PURCHASED",
  "CONVERTED",
  "LOST",
  "DISQUALIFIED",
]);

export const servicePlanEnum = pgEnum("service_plan", [
  "NONE",
  "AUDIT_ONLY",
  "LAUNCH",
  "ESSENTIALS",
  "GROWTH",
  "PRO",
  "CUSTOM",
]);

export const clientStatusEnum = pgEnum("client_status", [
  "ACTIVE",
  "PAUSED",
  "ARCHIVED",
]);

export const monitoringStatusEnum = pgEnum("monitoring_status", [
  "NOT_CONFIGURED",
  "ACTIVE",
  "PAUSED",
  "DEGRADED",
]);

export const integrationStatusEnum = pgEnum("integration_status", [
  "DISCONNECTED",
  "CONNECTED",
  "REVOKED",
  "ERROR",
]);

export const actorTypeEnum = pgEnum("actor_type", ["USER", "AGENT", "SYSTEM"]);

export const auditStatusEnum = pgEnum("audit_status", [
  "DRAFT",
  "QUEUED",
  "RUNNING",
  "REVIEW_REQUIRED",
  "READY_TO_FINALIZE",
  "FINALIZED",
  "FAILED",
  "CANCELED",
]);

export const auditRunStatusEnum = pgEnum("audit_run_status", [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "PARTIAL",
  "FAILED",
  "CANCELED",
]);

export const auditResultStatusEnum = pgEnum("audit_result_status", [
  "PASS",
  "WARNING",
  "FAIL",
  "ERROR",
  "UNAVAILABLE",
  "NOT_APPLICABLE",
]);

export const auditScoreCategoryEnum = pgEnum("audit_score_category", [
  "websitePerformance",
  "seo",
  "localSearch",
  "conversion",
  "aiReadiness",
  "authority",
]);

export const auditEvidenceTypeEnum = pgEnum("audit_evidence_type", [
  "HTTP_RESPONSE",
  "HTML",
  "HEADER",
  "ROBOTS_TXT",
  "SITEMAP_XML",
  "STRUCTURED_DATA",
  "LINK",
  "TEXT",
  "ERROR",
]);

export const findingSeverityEnum = pgEnum("finding_severity", [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
]);

export const reportStatusEnum = pgEnum("report_status", [
  "DRAFT",
  "FINALIZED",
]);

function createdAt() {
  return timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
}

function updatedAt() {
  return timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
}

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const authSchema = {
  user,
  session,
  account,
  verification,
};

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletionPendingAt: timestamp("deletion_pending_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("workspaces_slug_unique").on(table.slug)],
);

export const workspaceMemberships = pgTable(
  "workspace_memberships",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: workspaceRoleEnum("role").notNull(),
    status: membershipStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.userId],
      name: "workspace_memberships_pk",
    }),
    index("workspace_memberships_user_id_idx").on(table.userId),
  ],
);

export const servicePlanDefinitions = pgTable(
  "service_plan_definitions",
  {
    version: text("version")
      .notNull()
      .default(SERVICE_PLAN_DEFINITION_VERSION),
    plan: servicePlanEnum("plan").notNull(),
    displayName: text("display_name").notNull(),
    monthlyPriceCents: integer("monthly_price_cents"),
    entitlements: jsonb("entitlements")
      .$type<Record<string, unknown>>()
      .notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({
      columns: [table.version, table.plan],
      name: "service_plan_definitions_pk",
    }),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    status: leadStatusEnum("status").notNull().default("NEW"),
    source: text("source"),
    companyName: text("company_name").notNull(),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    websiteUrl: text("website_url"),
    notes: text("notes"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("leads_workspace_id_id_unique").on(table.workspaceId, table.id),
    index("leads_workspace_status_idx").on(table.workspaceId, table.status),
  ],
);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceLeadId: uuid("source_lead_id"),
    name: text("name").notNull(),
    servicePlan: servicePlanEnum("service_plan").notNull().default("NONE"),
    servicePlanVersion: text("service_plan_version")
      .notNull()
      .default(SERVICE_PLAN_DEFINITION_VERSION),
    status: clientStatusEnum("status").notNull().default("ACTIVE"),
    primaryConversionActions: jsonb("primary_conversion_actions")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    businessFactsStatus: text("business_facts_status")
      .notNull()
      .default("NOT_CONFIGURED"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("clients_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("clients_workspace_source_lead_unique").on(
      table.workspaceId,
      table.sourceLeadId,
    ),
    index("clients_workspace_status_idx").on(table.workspaceId, table.status),
    foreignKey({
      columns: [table.workspaceId, table.sourceLeadId],
      foreignColumns: [leads.workspaceId, leads.id],
      name: "clients_source_lead_workspace_fk",
    }).onDelete("restrict"),
  ],
);

export const websites = pgTable(
  "websites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    displayName: text("display_name").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    domain: text("domain").notNull(),
    authorizationScope: jsonb("authorization_scope")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    monitoringStatus: monitoringStatusEnum("monitoring_status")
      .notNull()
      .default("NOT_CONFIGURED"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("websites_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("websites_workspace_domain_unique").on(
      table.workspaceId,
      table.domain,
    ),
    index("websites_workspace_client_idx").on(table.workspaceId, table.clientId),
    foreignKey({
      columns: [table.workspaceId, table.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
      name: "websites_client_workspace_fk",
    }).onDelete("cascade"),
  ],
);

export const audits = pgTable(
  "audits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    websiteId: uuid("website_id").notNull(),
    title: text("title").notNull(),
    status: auditStatusEnum("status").notNull().default("DRAFT"),
    scoringDefinitionVersion: text("scoring_definition_version")
      .notNull()
      .default(SCORING_DEFINITION_VERSION),
    checkCatalogVersion: text("check_catalog_version")
      .notNull()
      .default(SCORING_DEFINITION_VERSION),
    startedByUserId: text("started_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    finalizedByUserId: text("finalized_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("audits_workspace_id_id_unique").on(table.workspaceId, table.id),
    uniqueIndex("audits_workspace_id_website_id_unique").on(
      table.workspaceId,
      table.id,
      table.websiteId,
    ),
    index("audits_workspace_status_idx").on(table.workspaceId, table.status),
    index("audits_workspace_website_idx").on(
      table.workspaceId,
      table.websiteId,
    ),
    foreignKey({
      columns: [table.workspaceId, table.websiteId],
      foreignColumns: [websites.workspaceId, websites.id],
      name: "audits_website_workspace_fk",
    }).onDelete("restrict"),
  ],
);

export const auditRuns = pgTable(
  "audit_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    auditId: uuid("audit_id").notNull(),
    websiteId: uuid("website_id").notNull(),
    status: auditRunStatusEnum("status").notNull().default("QUEUED"),
    scoringDefinitionVersion: text("scoring_definition_version")
      .notNull()
      .default(SCORING_DEFINITION_VERSION),
    checkCatalogVersion: text("check_catalog_version")
      .notNull()
      .default(SCORING_DEFINITION_VERSION),
    collectorVersion: text("collector_version")
      .notNull()
      .default("phase1-deterministic-v1.0"),
    overallScore: integer("overall_score"),
    provisional: boolean("provisional").notNull().default(true),
    evidenceCoverageBasisPoints: integer("evidence_coverage_basis_points")
      .notNull()
      .default(0),
    errorSummary: text("error_summary"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("audit_runs_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("audit_runs_workspace_id_id_audit_id_unique").on(
      table.workspaceId,
      table.id,
      table.auditId,
    ),
    index("audit_runs_workspace_audit_idx").on(
      table.workspaceId,
      table.auditId,
    ),
    index("audit_runs_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    foreignKey({
      columns: [table.workspaceId, table.auditId, table.websiteId],
      foreignColumns: [audits.workspaceId, audits.id, audits.websiteId],
      name: "audit_runs_audit_workspace_fk",
    }).onDelete("cascade"),
  ],
);

export const auditEvidence = pgTable(
  "audit_evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    auditRunId: uuid("audit_run_id").notNull(),
    checkKey: text("check_key"),
    evidenceType: auditEvidenceTypeEnum("evidence_type").notNull(),
    sourceUrl: text("source_url"),
    sourceLabel: text("source_label").notNull(),
    httpStatus: integer("http_status"),
    contentHash: text("content_hash"),
    excerpt: text("excerpt"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    collectedAt: timestamp("collected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("audit_evidence_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    index("audit_evidence_workspace_run_idx").on(
      table.workspaceId,
      table.auditRunId,
    ),
    foreignKey({
      columns: [table.workspaceId, table.auditRunId],
      foreignColumns: [auditRuns.workspaceId, auditRuns.id],
      name: "audit_evidence_run_workspace_fk",
    }).onDelete("cascade"),
  ],
);

export const auditCheckResults = pgTable(
  "audit_check_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    auditId: uuid("audit_id").notNull(),
    auditRunId: uuid("audit_run_id").notNull(),
    checkKey: text("check_key").notNull(),
    checkVersion: text("check_version").notNull(),
    category: auditScoreCategoryEnum("category").notNull(),
    status: auditResultStatusEnum("status").notNull(),
    severity: findingSeverityEnum("severity"),
    maxPenaltyWeight: integer("max_penalty_weight").notNull(),
    reason: text("reason").notNull(),
    evidenceRefs: jsonb("evidence_refs").$type<string[]>().notNull().default([]),
    observedValue: jsonb("observed_value")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("audit_check_results_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("audit_check_results_workspace_run_check_unique").on(
      table.workspaceId,
      table.auditRunId,
      table.checkKey,
    ),
    index("audit_check_results_workspace_audit_idx").on(
      table.workspaceId,
      table.auditId,
    ),
    index("audit_check_results_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    foreignKey({
      columns: [table.workspaceId, table.auditRunId, table.auditId],
      foreignColumns: [
        auditRuns.workspaceId,
        auditRuns.id,
        auditRuns.auditId,
      ],
      name: "audit_check_results_run_workspace_fk",
    }).onDelete("cascade"),
  ],
);

export const auditCategoryScores = pgTable(
  "audit_category_scores",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    auditRunId: uuid("audit_run_id").notNull(),
    category: auditScoreCategoryEnum("category").notNull(),
    score: integer("score"),
    evidenceCoverageBasisPoints: integer("evidence_coverage_basis_points")
      .notNull()
      .default(0),
    lowCoverage: boolean("low_coverage").notNull().default(true),
    applicableMaxPenalty: integer("applicable_max_penalty").notNull(),
    availableMaxPenalty: integer("available_max_penalty").notNull(),
    actualPenaltyBasisPoints: integer("actual_penalty_basis_points").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.auditRunId, table.category],
      name: "audit_category_scores_pk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.auditRunId],
      foreignColumns: [auditRuns.workspaceId, auditRuns.id],
      name: "audit_category_scores_run_workspace_fk",
    }).onDelete("cascade"),
  ],
);

export const auditFindings = pgTable(
  "audit_findings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    auditId: uuid("audit_id").notNull(),
    auditRunId: uuid("audit_run_id").notNull(),
    checkResultId: uuid("check_result_id").notNull(),
    checkKey: text("check_key").notNull(),
    severity: findingSeverityEnum("severity").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    evidenceRefs: jsonb("evidence_refs").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("audit_findings_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("audit_findings_workspace_run_check_unique").on(
      table.workspaceId,
      table.auditRunId,
      table.checkKey,
    ),
    index("audit_findings_workspace_audit_idx").on(
      table.workspaceId,
      table.auditId,
    ),
    foreignKey({
      columns: [table.workspaceId, table.checkResultId],
      foreignColumns: [auditCheckResults.workspaceId, auditCheckResults.id],
      name: "audit_findings_check_result_workspace_fk",
    }).onDelete("cascade"),
  ],
);

export const auditSnapshots = pgTable(
  "audit_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    auditId: uuid("audit_id").notNull(),
    auditRunId: uuid("audit_run_id").notNull(),
    scoringDefinitionVersion: text("scoring_definition_version").notNull(),
    checkCatalogVersion: text("check_catalog_version").notNull(),
    snapshot: jsonb("snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("audit_snapshots_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("audit_snapshots_workspace_audit_unique").on(
      table.workspaceId,
      table.auditId,
    ),
    foreignKey({
      columns: [table.workspaceId, table.auditRunId, table.auditId],
      foreignColumns: [
        auditRuns.workspaceId,
        auditRuns.id,
        auditRuns.auditId,
      ],
      name: "audit_snapshots_run_workspace_fk",
    }).onDelete("restrict"),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    auditId: uuid("audit_id").notNull(),
    auditRunId: uuid("audit_run_id").notNull(),
    auditSnapshotId: uuid("audit_snapshot_id"),
    status: reportStatusEnum("status").notNull().default("DRAFT"),
    title: text("title").notNull(),
    executiveSummary: text("executive_summary").notNull(),
    methodologyVersion: text("methodology_version").notNull(),
    reportData: jsonb("report_data")
      .$type<Record<string, unknown>>()
      .notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    finalizedByUserId: text("finalized_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("reports_workspace_id_id_unique").on(table.workspaceId, table.id),
    uniqueIndex("reports_workspace_audit_unique").on(
      table.workspaceId,
      table.auditId,
    ),
    index("reports_workspace_audit_idx").on(table.workspaceId, table.auditId),
    index("reports_workspace_status_idx").on(table.workspaceId, table.status),
    foreignKey({
      columns: [table.workspaceId, table.auditRunId, table.auditId],
      foreignColumns: [
        auditRuns.workspaceId,
        auditRuns.id,
        auditRuns.auditId,
      ],
      name: "reports_run_workspace_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.workspaceId, table.auditSnapshotId],
      foreignColumns: [auditSnapshots.workspaceId, auditSnapshots.id],
      name: "reports_snapshot_workspace_fk",
    }).onDelete("restrict"),
  ],
);

export const approvalPolicies = pgTable(
  "approval_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    defaultRules: jsonb("default_rules").$type<Record<string, unknown>>().notNull(),
    executionAllowlist: jsonb("execution_allowlist")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("approval_policies_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    index("approval_policies_workspace_active_idx").on(
      table.workspaceId,
      table.active,
    ),
  ],
);

export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id"),
    websiteId: uuid("website_id"),
    provider: text("provider").notNull(),
    connectionType: text("connection_type").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    status: integrationStatusEnum("status").notNull().default("DISCONNECTED"),
    secretRef: text("secret_ref"),
    keyVersion: text("key_version"),
    tokenMetadata: jsonb("token_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    lastErrorSummary: text("last_error_summary"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("integration_connections_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    index("integration_connections_workspace_provider_idx").on(
      table.workspaceId,
      table.provider,
    ),
    foreignKey({
      columns: [table.workspaceId, table.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
      name: "integration_connections_client_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.websiteId],
      foreignColumns: [websites.workspaceId, websites.id],
      name: "integration_connections_website_workspace_fk",
    }).onDelete("cascade"),
  ],
);

export const workspaceFeatureFlags = pgTable(
  "workspace_feature_flags",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    environment: text("environment").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.key, table.environment],
      name: "workspace_feature_flags_pk",
    }),
  ],
);

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorAgentRunId: uuid("actor_agent_run_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    summary: jsonb("summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    correlationId: text("correlation_id"),
    createdAt: createdAt(),
  },
  (table) => [
    index("activity_events_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("activity_events_correlation_idx").on(table.correlationId),
  ],
);
