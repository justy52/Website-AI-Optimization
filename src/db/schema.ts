import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
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
import { PRIORITY_DEFINITION_VERSION } from "@/domain/opportunities/priority";
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

export const evidenceConfidenceEnum = pgEnum("evidence_confidence", [
  "LOW",
  "MEDIUM",
  "HIGH",
]);

export const opportunityStatusEnum = pgEnum("opportunity_status", [
  "DRAFT",
  "READY",
  "BLOCKED",
  "IN_PROGRESS",
  "COMPLETED",
  "DISMISSED",
  "SUPERSEDED",
]);

export const opportunityPriorityBandEnum = pgEnum("opportunity_priority_band", [
  "Immediate",
  "High",
  "Normal",
  "Backlog",
  "Low",
]);

export const opportunityPlanScopeEnum = pgEnum("opportunity_plan_scope", [
  "INCLUDED",
  "MAY_REQUIRE_ADD_ON",
  "OUT_OF_SCOPE",
]);

export const opportunityDependencyStateEnum = pgEnum(
  "opportunity_dependency_state",
  ["NONE", "HARD_DEPENDENCY"],
);

export const opportunityClientInputStateEnum = pgEnum(
  "opportunity_client_input_state",
  ["NOT_REQUIRED", "REQUIRED", "RECEIVED"],
);

export const opportunityApprovalBlockedStateEnum = pgEnum(
  "opportunity_approval_blocked_state",
  ["NOT_BLOCKED", "AWAITING_APPROVAL"],
);

export const workPlanStatusEnum = pgEnum("work_plan_status", [
  "OPEN",
  "CLOSED",
]);

export const agentPermissionLevelEnum = pgEnum("agent_permission_level", [
  "OBSERVE",
  "PREPARE",
  "EXECUTE",
]);

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "PARTIAL",
  "FAILED",
  "CANCELED",
  "TIMED_OUT",
  "BUDGET_LIMITED",
  "BLOCKED",
]);

export const agentTriggerTypeEnum = pgEnum("agent_trigger_type", [
  "USER",
  "SCHEDULE",
  "EVENT",
  "ORCHESTRATOR",
]);

export const agentToolCallStatusEnum = pgEnum("agent_tool_call_status", [
  "SUCCEEDED",
  "FAILED",
  "SKIPPED",
  "BUDGET_LIMITED",
]);

export const knowledgeSourceTypeEnum = pgEnum("knowledge_source_type", [
  "WEBSITE_PAGE",
  "ONBOARDING_ANSWER",
  "SERVICE_LIST",
  "SERVICE_AREA",
  "PRICING_STATEMENT",
  "CREDENTIAL_LICENSE",
  "WARRANTY_GUARANTEE",
  "BRAND_GUIDANCE",
  "REFERENCE_MATERIAL",
]);

export const factVerificationStatusEnum = pgEnum("fact_verification_status", [
  "VERIFIED",
  "SOURCE_DERIVED_DRAFT",
  "NEEDS_REVIEW",
  "REJECTED",
]);

export const factSensitivityEnum = pgEnum("fact_sensitivity", [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
]);

export const claimPolicyRuleTypeEnum = pgEnum("claim_policy_rule_type", [
  "ALLOWED",
  "REQUIRES_APPROVAL",
  "PROHIBITED",
  "REQUIRED_DISCLAIMER",
  "STRICTER_REVIEW",
]);

export const draftArtifactTypeEnum = pgEnum("draft_artifact_type", [
  "METADATA_PROPOSAL",
  "EXISTING_PAGE_OPTIMIZATION_PROPOSAL",
  "INTERNAL_LINK_PROPOSAL",
  "SCHEMA_PROPOSAL",
  "CONTENT_BRIEF",
  "CONTENT_DRAFT",
  "CLIENT_MESSAGE_DRAFT",
  "REPORT_SECTION",
  "OTHER",
]);

export const draftArtifactStatusEnum = pgEnum("draft_artifact_status", [
  "DRAFT",
  "AWAITING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "SUPERSEDED",
]);

export const approvalRequestStatusEnum = pgEnum("approval_request_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CHANGES_REQUESTED",
  "EXPIRED",
  "CANCELED",
]);

export const approvalDecisionEnum = pgEnum("approval_decision", [
  "APPROVED_UNCHANGED",
  "APPROVED_MINOR_EDIT",
  "APPROVED_MAJOR_EDIT",
  "REJECTED",
  "CHANGES_REQUESTED",
]);

export const riskLevelEnum = pgEnum("risk_level", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const operationalNotificationStatusEnum = pgEnum(
  "operational_notification_status",
  ["UNREAD", "READ", "ARCHIVED"],
);

export const integrationOAuthStateStatusEnum = pgEnum(
  "integration_oauth_state_status",
  ["PENDING", "CONSUMED", "EXPIRED", "FAILED"],
);

export const integrationSecretTypeEnum = pgEnum("integration_secret_type", [
  "OAUTH_TOKEN",
]);

export const searchConsolePropertyTypeEnum = pgEnum(
  "search_console_property_type",
  ["URL_PREFIX", "DOMAIN", "UNKNOWN"],
);

export const monitoringRunStatusEnum = pgEnum("monitoring_run_status", [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "PARTIAL",
  "FAILED",
  "CANCELED",
  "TIMED_OUT",
  "BUDGET_LIMITED",
]);

export const monitoringTriggerTypeEnum = pgEnum("monitoring_trigger_type", [
  "SCHEDULE",
  "MANUAL",
  "SYSTEM",
]);

export const monitoringObservationStatusEnum = pgEnum(
  "monitoring_observation_status",
  ["PASS", "WARNING", "FAIL", "ERROR", "UNAVAILABLE", "NOT_APPLICABLE"],
);

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
    uniqueIndex("websites_workspace_client_id_unique").on(
      table.workspaceId,
      table.clientId,
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
    evidenceConfidence: evidenceConfidenceEnum("evidence_confidence")
      .notNull()
      .default("LOW"),
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
    uniqueIndex("audit_check_results_workspace_full_unique").on(
      table.workspaceId,
      table.id,
      table.auditRunId,
      table.auditId,
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
    uniqueIndex("audit_findings_workspace_full_unique").on(
      table.workspaceId,
      table.id,
      table.auditRunId,
      table.auditId,
      table.checkKey,
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

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    websiteId: uuid("website_id").notNull(),
    sourceAuditId: uuid("source_audit_id").notNull(),
    sourceAuditRunId: uuid("source_audit_run_id").notNull(),
    sourceFindingId: uuid("source_finding_id"),
    sourceCheckResultId: uuid("source_check_result_id").notNull(),
    sourceCheckKey: text("source_check_key").notNull(),
    sourceCheckVersion: text("source_check_version").notNull(),
    sourceResultStatus: auditResultStatusEnum("source_result_status").notNull(),
    sourceSeverity: findingSeverityEnum("source_severity").notNull(),
    sourceEvidenceRefs: jsonb("source_evidence_refs")
      .$type<string[]>()
      .notNull()
      .default([]),
    evidenceConfidence: evidenceConfidenceEnum("evidence_confidence").notNull(),
    category: auditScoreCategoryEnum("category").notNull(),
    normalizedRemediationFamily: text("normalized_remediation_family").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    recommendedAction: text("recommended_action").notNull(),
    status: opportunityStatusEnum("status").notNull().default("DRAFT"),
    priorityDefinitionVersion: text("priority_definition_version")
      .notNull()
      .default(PRIORITY_DEFINITION_VERSION),
    impact: integer("impact").notNull(),
    confidence: integer("confidence").notNull(),
    urgency: integer("urgency").notNull(),
    strategicFit: integer("strategic_fit").notNull(),
    planFit: integer("plan_fit").notNull(),
    staleness: integer("staleness").notNull().default(0),
    effort: integer("effort").notNull(),
    dependencyState: opportunityDependencyStateEnum("dependency_state")
      .notNull()
      .default("NONE"),
    clientInputState: opportunityClientInputStateEnum("client_input_state")
      .notNull()
      .default("NOT_REQUIRED"),
    approvalBlockedState: opportunityApprovalBlockedStateEnum(
      "approval_blocked_state",
    )
      .notNull()
      .default("NOT_BLOCKED"),
    basePriority: integer("base_priority").notNull(),
    modifiers: jsonb("modifiers")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    finalPriority: integer("final_priority").notNull(),
    priorityBand: opportunityPriorityBandEnum("priority_band").notNull(),
    priorityReasons: jsonb("priority_reasons")
      .$type<string[]>()
      .notNull()
      .default([]),
    planScope: opportunityPlanScopeEnum("plan_scope").notNull(),
    ownerUserId: text("owner_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    immediateAttention: boolean("immediate_attention").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("opportunities_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("opportunities_workspace_client_id_unique").on(
      table.workspaceId,
      table.clientId,
      table.id,
    ),
    uniqueIndex("opportunities_open_equivalent_unique")
      .on(
        table.workspaceId,
        table.websiteId,
        table.sourceCheckKey,
        table.normalizedRemediationFamily,
      )
      .where(
        sql`${table.status} in ('DRAFT', 'READY', 'BLOCKED', 'IN_PROGRESS')`,
      ),
    index("opportunities_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    index("opportunities_workspace_priority_idx").on(
      table.workspaceId,
      table.priorityBand,
      table.finalPriority,
    ),
    index("opportunities_workspace_client_idx").on(
      table.workspaceId,
      table.clientId,
    ),
    index("opportunities_workspace_website_idx").on(
      table.workspaceId,
      table.websiteId,
    ),
    foreignKey({
      columns: [table.workspaceId, table.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
      name: "opportunities_client_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.clientId, table.websiteId],
      foreignColumns: [websites.workspaceId, websites.clientId, websites.id],
      name: "opportunities_website_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.sourceAuditId],
      foreignColumns: [audits.workspaceId, audits.id],
      name: "opportunities_audit_workspace_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.workspaceId,
        table.sourceAuditRunId,
        table.sourceAuditId,
      ],
      foreignColumns: [
        auditRuns.workspaceId,
        auditRuns.id,
        auditRuns.auditId,
      ],
      name: "opportunities_audit_run_workspace_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.workspaceId,
        table.sourceFindingId,
        table.sourceAuditRunId,
        table.sourceAuditId,
        table.sourceCheckKey,
      ],
      foreignColumns: [
        auditFindings.workspaceId,
        auditFindings.id,
        auditFindings.auditRunId,
        auditFindings.auditId,
        auditFindings.checkKey,
      ],
      name: "opportunities_finding_workspace_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.workspaceId,
        table.sourceCheckResultId,
        table.sourceAuditRunId,
        table.sourceAuditId,
      ],
      foreignColumns: [
        auditCheckResults.workspaceId,
        auditCheckResults.id,
        auditCheckResults.auditRunId,
        auditCheckResults.auditId,
      ],
      name: "opportunities_check_result_workspace_fk",
    }).onDelete("restrict"),
    check("opportunities_impact_check", sql`${table.impact} BETWEEN 0 AND 5`),
    check(
      "opportunities_confidence_check",
      sql`${table.confidence} BETWEEN 0 AND 5`,
    ),
    check("opportunities_urgency_check", sql`${table.urgency} BETWEEN 0 AND 5`),
    check(
      "opportunities_strategic_fit_check",
      sql`${table.strategicFit} BETWEEN 0 AND 5`,
    ),
    check("opportunities_plan_fit_check", sql`${table.planFit} BETWEEN 0 AND 5`),
    check(
      "opportunities_staleness_check",
      sql`${table.staleness} BETWEEN 0 AND 5`,
    ),
    check("opportunities_effort_check", sql`${table.effort} BETWEEN 1 AND 5`),
    check(
      "opportunities_base_priority_check",
      sql`${table.basePriority} BETWEEN 0 AND 100`,
    ),
    check(
      "opportunities_final_priority_check",
      sql`${table.finalPriority} BETWEEN 0 AND 100`,
    ),
  ],
);

export const workPlanCycles = pgTable(
  "work_plan_cycles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    title: text("title").notNull(),
    status: workPlanStatusEnum("status").notNull().default("OPEN"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("work_plan_cycles_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("work_plan_cycles_workspace_client_id_unique").on(
      table.workspaceId,
      table.clientId,
      table.id,
    ),
    uniqueIndex("work_plan_cycles_open_client_unique")
      .on(table.workspaceId, table.clientId)
      .where(sql`${table.status} = 'OPEN'`),
    index("work_plan_cycles_workspace_client_idx").on(
      table.workspaceId,
      table.clientId,
    ),
    foreignKey({
      columns: [table.workspaceId, table.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
      name: "work_plan_cycles_client_workspace_fk",
    }).onDelete("cascade"),
  ],
);

export const workPlanItems = pgTable(
  "work_plan_items",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    workPlanCycleId: uuid("work_plan_cycle_id").notNull(),
    opportunityId: uuid("opportunity_id").notNull(),
    selectedByUserId: text("selected_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    selectedAt: timestamp("selected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    notes: text("notes"),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.workPlanCycleId, table.opportunityId],
      name: "work_plan_items_pk",
    }),
    index("work_plan_items_workspace_opportunity_idx").on(
      table.workspaceId,
      table.opportunityId,
    ),
    foreignKey({
      columns: [table.workspaceId, table.clientId, table.workPlanCycleId],
      foreignColumns: [
        workPlanCycles.workspaceId,
        workPlanCycles.clientId,
        workPlanCycles.id,
      ],
      name: "work_plan_items_cycle_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.clientId, table.opportunityId],
      foreignColumns: [
        opportunities.workspaceId,
        opportunities.clientId,
        opportunities.id,
      ],
      name: "work_plan_items_opportunity_workspace_fk",
    }).onDelete("cascade"),
  ],
);

export const agentDefinitions = pgTable(
  "agent_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    version: text("version").notNull(),
    name: text("name").notNull(),
    capabilityType: text("capability_type").notNull(),
    defaultPermissionLevel: agentPermissionLevelEnum("default_permission_level")
      .notNull(),
    allowedToolKeys: jsonb("allowed_tool_keys").$type<string[]>().notNull(),
    defaultTimeoutSeconds: integer("default_timeout_seconds").notNull(),
    budgetLimits: jsonb("budget_limits")
      .$type<Record<string, unknown>>()
      .notNull(),
    outputSchemaVersion: text("output_schema_version").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("agent_definitions_key_version_unique").on(
      table.key,
      table.version,
    ),
    index("agent_definitions_enabled_idx").on(table.enabled),
  ],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentDefinitionId: uuid("agent_definition_id").references(
      () => agentDefinitions.id,
      { onDelete: "restrict" },
    ),
    clientId: uuid("client_id"),
    websiteId: uuid("website_id"),
    auditId: uuid("audit_id"),
    opportunityId: uuid("opportunity_id"),
    workPlanCycleId: uuid("work_plan_cycle_id"),
    parentRunId: uuid("parent_run_id"),
    triggerType: agentTriggerTypeEnum("trigger_type").notNull(),
    agentKey: text("agent_key").notNull(),
    agentVersion: text("agent_version").notNull(),
    permissionLevel: agentPermissionLevelEnum("permission_level").notNull(),
    status: agentRunStatusEnum("status").notNull().default("QUEUED"),
    inputSummary: jsonb("input_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    evidenceRefs: jsonb("evidence_refs").$type<string[]>().notNull().default([]),
    allowedToolSnapshot: jsonb("allowed_tool_snapshot")
      .$type<string[]>()
      .notNull()
      .default([]),
    budgetSnapshot: jsonb("budget_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    timeoutSeconds: integer("timeout_seconds").notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptTemplateVersion: text("prompt_template_version").notNull(),
    outputSchemaVersion: text("output_schema_version").notNull(),
    structuredOutput: jsonb("structured_output")
      .$type<Record<string, unknown>>(),
    outputRef: text("output_ref"),
    rationale: text("rationale"),
    confidence: evidenceConfidenceEnum("confidence"),
    source: text("source"),
    nextAction: text("next_action"),
    estimatedToolCalls: integer("estimated_tool_calls").notNull().default(0),
    actualToolCalls: integer("actual_tool_calls").notNull().default(0),
    estimatedModelCalls: integer("estimated_model_calls").notNull().default(0),
    actualModelCalls: integer("actual_model_calls").notNull().default(0),
    estimatedInputTokens: integer("estimated_input_tokens").notNull().default(0),
    actualInputTokens: integer("actual_input_tokens").notNull().default(0),
    estimatedOutputTokens: integer("estimated_output_tokens").notNull().default(0),
    actualOutputTokens: integer("actual_output_tokens").notNull().default(0),
    estimatedTotalTokens: integer("estimated_total_tokens").notNull().default(0),
    actualTotalTokens: integer("actual_total_tokens").notNull().default(0),
    estimatedCostCents: integer("estimated_cost_cents").notNull().default(0),
    actualCostCents: integer("actual_cost_cents").notNull().default(0),
    modelGenerationId: text("model_generation_id"),
    providerMetadata: jsonb("provider_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    errorCode: text("error_code"),
    errorSummary: text("error_summary"),
    retryCount: integer("retry_count").notNull().default(0),
    idempotencyKey: text("idempotency_key").notNull(),
    workflowRunId: text("workflow_run_id"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("agent_runs_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("agent_runs_workspace_idempotency_unique").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("agent_runs_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    index("agent_runs_workspace_opportunity_idx").on(
      table.workspaceId,
      table.opportunityId,
    ),
    foreignKey({
      columns: [table.workspaceId, table.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
      name: "agent_runs_client_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.clientId, table.websiteId],
      foreignColumns: [websites.workspaceId, websites.clientId, websites.id],
      name: "agent_runs_website_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.auditId],
      foreignColumns: [audits.workspaceId, audits.id],
      name: "agent_runs_audit_workspace_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.workspaceId, table.clientId, table.opportunityId],
      foreignColumns: [
        opportunities.workspaceId,
        opportunities.clientId,
        opportunities.id,
      ],
      name: "agent_runs_opportunity_workspace_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.workspaceId, table.clientId, table.workPlanCycleId],
      foreignColumns: [
        workPlanCycles.workspaceId,
        workPlanCycles.clientId,
        workPlanCycles.id,
      ],
      name: "agent_runs_work_plan_cycle_workspace_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.workspaceId, table.parentRunId],
      foreignColumns: [table.workspaceId, table.id],
      name: "agent_runs_parent_workspace_fk",
    }).onDelete("restrict"),
    check("agent_runs_timeout_positive_check", sql`${table.timeoutSeconds} > 0`),
  ],
);

export const agentToolCalls = pgTable(
  "agent_tool_calls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentRunId: uuid("agent_run_id").notNull(),
    toolKey: text("tool_key").notNull(),
    toolVersion: text("tool_version").notNull(),
    permissionLevel: agentPermissionLevelEnum("permission_level").notNull(),
    targetSummary: jsonb("target_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    inputSummary: jsonb("input_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    outputSummary: jsonb("output_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: agentToolCallStatusEnum("status").notNull(),
    costCents: integer("cost_cents").notNull().default(0),
    externalRequestId: text("external_request_id"),
    errorSummary: text("error_summary"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("agent_tool_calls_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    index("agent_tool_calls_workspace_run_idx").on(
      table.workspaceId,
      table.agentRunId,
    ),
    foreignKey({
      columns: [table.workspaceId, table.agentRunId],
      foreignColumns: [agentRuns.workspaceId, agentRuns.id],
      name: "agent_tool_calls_run_workspace_fk",
    }).onDelete("cascade"),
  ],
);

export const clientKnowledgeSources = pgTable(
  "client_knowledge_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    websiteId: uuid("website_id"),
    sourceType: knowledgeSourceTypeEnum("source_type").notNull(),
    title: text("title").notNull(),
    sourceUrl: text("source_url"),
    sourceRef: text("source_ref"),
    excerpt: text("excerpt"),
    verificationStatus: factVerificationStatusEnum("verification_status")
      .notNull()
      .default("NEEDS_REVIEW"),
    approvedByUserId: text("approved_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    sensitivity: factSensitivityEnum("sensitivity").notNull().default("PUBLIC"),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("client_knowledge_sources_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    index("client_knowledge_sources_workspace_client_idx").on(
      table.workspaceId,
      table.clientId,
    ),
    foreignKey({
      columns: [table.workspaceId, table.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
      name: "client_knowledge_sources_client_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.clientId, table.websiteId],
      foreignColumns: [websites.workspaceId, websites.clientId, websites.id],
      name: "client_knowledge_sources_website_workspace_fk",
    }).onDelete("cascade"),
  ],
);

export const businessFacts = pgTable(
  "business_facts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    websiteId: uuid("website_id"),
    knowledgeSourceId: uuid("knowledge_source_id"),
    factType: text("fact_type").notNull(),
    value: text("value").notNull(),
    structuredValue: jsonb("structured_value")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    sourceReference: text("source_reference").notNull(),
    verificationStatus: factVerificationStatusEnum("verification_status")
      .notNull()
      .default("NEEDS_REVIEW"),
    approvedByUserId: text("approved_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    sensitivity: factSensitivityEnum("sensitivity").notNull().default("PUBLIC"),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("business_facts_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    index("business_facts_workspace_client_idx").on(
      table.workspaceId,
      table.clientId,
    ),
    foreignKey({
      columns: [table.workspaceId, table.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
      name: "business_facts_client_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.clientId, table.websiteId],
      foreignColumns: [websites.workspaceId, websites.clientId, websites.id],
      name: "business_facts_website_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.knowledgeSourceId],
      foreignColumns: [
        clientKnowledgeSources.workspaceId,
        clientKnowledgeSources.id,
      ],
      name: "business_facts_knowledge_source_workspace_fk",
    }).onDelete("restrict"),
  ],
);

export const claimPolicies = pgTable(
  "claim_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    ruleType: claimPolicyRuleTypeEnum("rule_type").notNull(),
    claimCategory: text("claim_category").notNull(),
    rule: text("rule").notNull(),
    requiredDisclaimer: text("required_disclaimer"),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("claim_policies_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    index("claim_policies_workspace_client_idx").on(
      table.workspaceId,
      table.clientId,
    ),
    foreignKey({
      columns: [table.workspaceId, table.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
      name: "claim_policies_client_workspace_fk",
    }).onDelete("cascade"),
  ],
);

export const draftArtifacts = pgTable(
  "draft_artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    websiteId: uuid("website_id"),
    opportunityId: uuid("opportunity_id"),
    artifactType: draftArtifactTypeEnum("artifact_type").notNull(),
    artifactVersion: integer("artifact_version").notNull(),
    status: draftArtifactStatusEnum("status").notNull().default("DRAFT"),
    preparedByAgentRunId: uuid("prepared_by_agent_run_id"),
    sourceEvidenceRefs: jsonb("source_evidence_refs")
      .$type<string[]>()
      .notNull()
      .default([]),
    structuredProposal: jsonb("structured_proposal")
      .$type<Record<string, unknown>>()
      .notNull(),
    renderedPreview: text("rendered_preview").notNull(),
    factualBasisRefs: jsonb("factual_basis_refs")
      .$type<string[]>()
      .notNull()
      .default([]),
    riskLevel: riskLevelEnum("risk_level").notNull().default("LOW"),
    contentHash: text("content_hash").notNull(),
    supersedesArtifactId: uuid("supersedes_artifact_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("draft_artifacts_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("draft_artifacts_workspace_version_unique").on(
      table.workspaceId,
      table.id,
      table.artifactVersion,
    ),
    index("draft_artifacts_workspace_opportunity_idx").on(
      table.workspaceId,
      table.opportunityId,
    ),
    foreignKey({
      columns: [table.workspaceId, table.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
      name: "draft_artifacts_client_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.clientId, table.websiteId],
      foreignColumns: [websites.workspaceId, websites.clientId, websites.id],
      name: "draft_artifacts_website_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.clientId, table.opportunityId],
      foreignColumns: [
        opportunities.workspaceId,
        opportunities.clientId,
        opportunities.id,
      ],
      name: "draft_artifacts_opportunity_workspace_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.workspaceId, table.preparedByAgentRunId],
      foreignColumns: [agentRuns.workspaceId, agentRuns.id],
      name: "draft_artifacts_agent_run_workspace_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.workspaceId, table.supersedesArtifactId],
      foreignColumns: [table.workspaceId, table.id],
      name: "draft_artifacts_supersedes_workspace_fk",
    }).onDelete("restrict"),
    check(
      "draft_artifacts_artifact_version_positive_check",
      sql`${table.artifactVersion} > 0`,
    ),
  ],
);

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id"),
    websiteId: uuid("website_id"),
    opportunityId: uuid("opportunity_id"),
    requestType: text("request_type").notNull(),
    targetType: text("target_type").notNull(),
    targetArtifactId: uuid("target_artifact_id").notNull(),
    targetArtifactVersion: integer("target_artifact_version").notNull(),
    riskLevel: riskLevelEnum("risk_level").notNull(),
    requestedByUserId: text("requested_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    requestedByAgentRunId: uuid("requested_by_agent_run_id"),
    status: approvalRequestStatusEnum("status").notNull().default("PENDING"),
    decision: approvalDecisionEnum("decision"),
    approverUserId: text("approver_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    decisionComments: text("decision_comments"),
    decisionReasonCategory: text("decision_reason_category"),
    immutableSummary: jsonb("immutable_summary")
      .$type<Record<string, unknown>>()
      .notNull(),
    proposedExternalExecution: boolean("proposed_external_execution")
      .notNull()
      .default(false),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("approval_requests_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("approval_requests_one_pending_artifact_version_unique")
      .on(table.workspaceId, table.targetArtifactId, table.targetArtifactVersion)
      .where(sql`${table.status} = 'PENDING'`),
    index("approval_requests_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    index("approval_requests_workspace_opportunity_idx").on(
      table.workspaceId,
      table.opportunityId,
    ),
    foreignKey({
      columns: [table.workspaceId, table.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
      name: "approval_requests_client_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.clientId, table.websiteId],
      foreignColumns: [websites.workspaceId, websites.clientId, websites.id],
      name: "approval_requests_website_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.clientId, table.opportunityId],
      foreignColumns: [
        opportunities.workspaceId,
        opportunities.clientId,
        opportunities.id,
      ],
      name: "approval_requests_opportunity_workspace_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.workspaceId,
        table.targetArtifactId,
        table.targetArtifactVersion,
      ],
      foreignColumns: [
        draftArtifacts.workspaceId,
        draftArtifacts.id,
        draftArtifacts.artifactVersion,
      ],
      name: "approval_requests_artifact_version_workspace_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.workspaceId, table.requestedByAgentRunId],
      foreignColumns: [agentRuns.workspaceId, agentRuns.id],
      name: "approval_requests_agent_run_workspace_fk",
    }).onDelete("restrict"),
    check(
      "approval_requests_no_external_execute_phase3_check",
      sql`${table.proposedExternalExecution} = false`,
    ),
  ],
);

export const operationalNotifications = pgTable(
  "operational_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    severity: riskLevelEnum("severity").notNull().default("LOW"),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    status: operationalNotificationStatusEnum("status")
      .notNull()
      .default("UNREAD"),
    createdAt: createdAt(),
    readAt: timestamp("read_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("operational_notifications_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    index("operational_notifications_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    index("operational_notifications_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
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

export const integrationOAuthStates = pgTable(
  "integration_oauth_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    websiteId: uuid("website_id").notNull(),
    provider: text("provider").notNull(),
    stateHash: text("state_hash").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    redirectPath: text("redirect_path"),
    status: integrationOAuthStateStatusEnum("status")
      .notNull()
      .default("PENDING"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("integration_oauth_states_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("integration_oauth_states_state_hash_unique").on(
      table.stateHash,
    ),
    index("integration_oauth_states_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.expiresAt,
    ),
    foreignKey({
      columns: [table.workspaceId, table.clientId, table.websiteId],
      foreignColumns: [websites.workspaceId, websites.clientId, websites.id],
      name: "integration_oauth_states_website_workspace_fk",
    }).onDelete("cascade"),
  ],
);

export const integrationSecrets = pgTable(
  "integration_secrets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    integrationConnectionId: uuid("integration_connection_id").notNull(),
    secretType: integrationSecretTypeEnum("secret_type").notNull(),
    algorithm: text("algorithm").notNull(),
    keyVersion: text("key_version").notNull(),
    nonce: text("nonce").notNull(),
    ciphertext: text("ciphertext").notNull(),
    authTag: text("auth_tag").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("integration_secrets_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("integration_secrets_connection_type_unique").on(
      table.workspaceId,
      table.integrationConnectionId,
      table.secretType,
    ),
    foreignKey({
      columns: [table.workspaceId, table.integrationConnectionId],
      foreignColumns: [integrationConnections.workspaceId, integrationConnections.id],
      name: "integration_secrets_connection_workspace_fk",
    }).onDelete("cascade"),
  ],
);

export const searchConsoleProperties = pgTable(
  "search_console_properties",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    integrationConnectionId: uuid("integration_connection_id").notNull(),
    clientId: uuid("client_id").notNull(),
    websiteId: uuid("website_id").notNull(),
    propertyUrl: text("property_url").notNull(),
    propertyType: searchConsolePropertyTypeEnum("property_type")
      .notNull()
      .default("UNKNOWN"),
    permissionLevel: text("permission_level"),
    verifiedSiteMatch: boolean("verified_site_match").notNull().default(false),
    selected: boolean("selected").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("search_console_properties_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("search_console_properties_connection_property_unique").on(
      table.workspaceId,
      table.integrationConnectionId,
      table.propertyUrl,
    ),
    index("search_console_properties_workspace_website_idx").on(
      table.workspaceId,
      table.websiteId,
      table.selected,
    ),
    foreignKey({
      columns: [table.workspaceId, table.integrationConnectionId],
      foreignColumns: [integrationConnections.workspaceId, integrationConnections.id],
      name: "search_console_properties_connection_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.clientId, table.websiteId],
      foreignColumns: [websites.workspaceId, websites.clientId, websites.id],
      name: "search_console_properties_website_workspace_fk",
    }).onDelete("cascade"),
  ],
);

export const searchConsoleObservations = pgTable(
  "search_console_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    integrationConnectionId: uuid("integration_connection_id").notNull(),
    searchConsolePropertyId: uuid("search_console_property_id").notNull(),
    clientId: uuid("client_id").notNull(),
    websiteId: uuid("website_id").notNull(),
    windowStartDate: date("window_start_date").notNull(),
    windowEndDate: date("window_end_date").notNull(),
    propertyUrl: text("property_url").notNull(),
    query: text("query"),
    page: text("page"),
    clicks: integer("clicks").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    ctrBasisPoints: integer("ctr_basis_points").notNull().default(0),
    averagePositionBasisPoints: integer("average_position_basis_points")
      .notNull()
      .default(0),
    sourceProvider: text("source_provider")
      .notNull()
      .default("google_search_console"),
    sourceTimezone: text("source_timezone").notNull().default("UTC"),
    completeness: text("completeness").notNull().default("COMPLETE"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("search_console_observations_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    index("search_console_observations_workspace_property_idx").on(
      table.workspaceId,
      table.searchConsolePropertyId,
      table.windowEndDate,
    ),
    foreignKey({
      columns: [table.workspaceId, table.integrationConnectionId],
      foreignColumns: [integrationConnections.workspaceId, integrationConnections.id],
      name: "search_console_observations_connection_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.searchConsolePropertyId],
      foreignColumns: [searchConsoleProperties.workspaceId, searchConsoleProperties.id],
      name: "search_console_observations_property_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.clientId, table.websiteId],
      foreignColumns: [websites.workspaceId, websites.clientId, websites.id],
      name: "search_console_observations_website_workspace_fk",
    }).onDelete("cascade"),
    check("search_console_observations_clicks_check", sql`${table.clicks} >= 0`),
    check(
      "search_console_observations_impressions_check",
      sql`${table.impressions} >= 0`,
    ),
    check(
      "search_console_observations_ctr_check",
      sql`${table.ctrBasisPoints} BETWEEN 0 AND 10000`,
    ),
    check(
      "search_console_observations_position_check",
      sql`${table.averagePositionBasisPoints} >= 0`,
    ),
  ],
);

export const monitoringSchedules = pgTable(
  "monitoring_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    websiteId: uuid("website_id").notNull(),
    monitorKey: text("monitor_key").notNull(),
    monitorVersion: text("monitor_version").notNull(),
    cadence: text("cadence").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    configuration: jsonb("configuration")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    lastErrorSummary: text("last_error_summary"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("monitoring_schedules_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("monitoring_schedules_active_target_unique").on(
      table.workspaceId,
      table.websiteId,
      table.monitorKey,
      table.monitorVersion,
    ),
    index("monitoring_schedules_due_idx").on(
      table.enabled,
      table.nextRunAt,
    ),
    foreignKey({
      columns: [table.workspaceId, table.clientId, table.websiteId],
      foreignColumns: [websites.workspaceId, websites.clientId, websites.id],
      name: "monitoring_schedules_website_workspace_fk",
    }).onDelete("cascade"),
  ],
);

export const monitoringRuns = pgTable(
  "monitoring_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    monitoringScheduleId: uuid("monitoring_schedule_id"),
    clientId: uuid("client_id").notNull(),
    websiteId: uuid("website_id").notNull(),
    auditId: uuid("audit_id"),
    auditRunId: uuid("audit_run_id"),
    monitorKey: text("monitor_key").notNull(),
    monitorVersion: text("monitor_version").notNull(),
    triggerType: monitoringTriggerTypeEnum("trigger_type").notNull(),
    status: monitoringRunStatusEnum("status").notNull().default("QUEUED"),
    sourceProvider: text("source_provider").notNull().default("optiq"),
    observationsProduced: integer("observations_produced").notNull().default(0),
    errorCode: text("error_code"),
    errorSummary: text("error_summary"),
    retryCount: integer("retry_count").notNull().default(0),
    idempotencyKey: text("idempotency_key").notNull(),
    workflowRunId: text("workflow_run_id"),
    costCents: integer("cost_cents").notNull().default(0),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("monitoring_runs_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("monitoring_runs_idempotency_unique").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("monitoring_runs_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
    foreignKey({
      columns: [table.workspaceId, table.monitoringScheduleId],
      foreignColumns: [monitoringSchedules.workspaceId, monitoringSchedules.id],
      name: "monitoring_runs_schedule_workspace_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.workspaceId, table.clientId, table.websiteId],
      foreignColumns: [websites.workspaceId, websites.clientId, websites.id],
      name: "monitoring_runs_website_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.auditRunId, table.auditId],
      foreignColumns: [
        auditRuns.workspaceId,
        auditRuns.id,
        auditRuns.auditId,
      ],
      name: "monitoring_runs_audit_run_workspace_fk",
    }).onDelete("set null"),
  ],
);

export const monitoringObservations = pgTable(
  "monitoring_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    monitoringRunId: uuid("monitoring_run_id").notNull(),
    monitoringScheduleId: uuid("monitoring_schedule_id"),
    clientId: uuid("client_id").notNull(),
    websiteId: uuid("website_id").notNull(),
    observationKey: text("observation_key").notNull(),
    observationType: text("observation_type").notNull(),
    sourceProvider: text("source_provider").notNull().default("optiq"),
    sourceUrl: text("source_url"),
    status: monitoringObservationStatusEnum("status").notNull(),
    severity: riskLevelEnum("severity").notNull().default("LOW"),
    evidenceConfidence: evidenceConfidenceEnum("evidence_confidence")
      .notNull()
      .default("LOW"),
    contentHash: text("content_hash"),
    summary: text("summary").notNull(),
    evidence: jsonb("evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    limitations: jsonb("limitations")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("monitoring_observations_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    index("monitoring_observations_workspace_run_idx").on(
      table.workspaceId,
      table.monitoringRunId,
    ),
    index("monitoring_observations_workspace_site_idx").on(
      table.workspaceId,
      table.websiteId,
      table.observedAt,
    ),
    foreignKey({
      columns: [table.workspaceId, table.monitoringRunId],
      foreignColumns: [monitoringRuns.workspaceId, monitoringRuns.id],
      name: "monitoring_observations_run_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.monitoringScheduleId],
      foreignColumns: [monitoringSchedules.workspaceId, monitoringSchedules.id],
      name: "monitoring_observations_schedule_workspace_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.workspaceId, table.clientId, table.websiteId],
      foreignColumns: [websites.workspaceId, websites.clientId, websites.id],
      name: "monitoring_observations_website_workspace_fk",
    }).onDelete("cascade"),
  ],
);

export const competitorTargets = pgTable(
  "competitor_targets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    websiteId: uuid("website_id").notNull(),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    relationship: text("relationship").notNull().default("DIRECT_COMPETITOR"),
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("competitor_targets_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("competitor_targets_workspace_website_domain_unique").on(
      table.workspaceId,
      table.websiteId,
      table.domain,
    ),
    index("competitor_targets_workspace_site_idx").on(
      table.workspaceId,
      table.websiteId,
      table.active,
    ),
    foreignKey({
      columns: [table.workspaceId, table.clientId, table.websiteId],
      foreignColumns: [websites.workspaceId, websites.clientId, websites.id],
      name: "competitor_targets_website_workspace_fk",
    }).onDelete("cascade"),
  ],
);

export const competitorObservations = pgTable(
  "competitor_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    competitorTargetId: uuid("competitor_target_id").notNull(),
    monitoringRunId: uuid("monitoring_run_id"),
    clientId: uuid("client_id").notNull(),
    websiteId: uuid("website_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    httpStatus: integer("http_status"),
    observedTitle: text("observed_title"),
    observedMetaDescription: text("observed_meta_description"),
    contentHash: text("content_hash").notNull(),
    changedSincePrevious: boolean("changed_since_previous")
      .notNull()
      .default(false),
    changeSummary: text("change_summary").notNull(),
    evidence: jsonb("evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    limitations: jsonb("limitations")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("competitor_observations_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    index("competitor_observations_workspace_target_idx").on(
      table.workspaceId,
      table.competitorTargetId,
      table.observedAt,
    ),
    foreignKey({
      columns: [table.workspaceId, table.competitorTargetId],
      foreignColumns: [competitorTargets.workspaceId, competitorTargets.id],
      name: "competitor_observations_target_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.monitoringRunId],
      foreignColumns: [monitoringRuns.workspaceId, monitoringRuns.id],
      name: "competitor_observations_run_workspace_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.workspaceId, table.clientId, table.websiteId],
      foreignColumns: [websites.workspaceId, websites.clientId, websites.id],
      name: "competitor_observations_website_workspace_fk",
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
