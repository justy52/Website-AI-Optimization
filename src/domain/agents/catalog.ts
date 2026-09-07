import type { AgentPermissionLevel } from "./permissions";

export const AGENT_CATALOG_VERSION = "agent-catalog-v1.0";
export const EXISTING_PAGE_OPTIMIZATION_AGENT_KEY =
  "existing-page-optimization";
export const EXISTING_PAGE_OPTIMIZATION_AGENT_VERSION = "epo-prepare-v1.0";
export const EXISTING_PAGE_OPTIMIZATION_OUTPUT_SCHEMA_VERSION =
  "existing-page-optimization-output-v1.0";

export type AgentCapabilityType =
  | "WEBSITE_HEALTH"
  | "SEARCH_SEO"
  | "KEYWORD_COMPETITOR"
  | "AI_VISIBILITY"
  | "CONTENT_OPPORTUNITY"
  | "CONTENT_PRODUCTION"
  | "EXISTING_PAGE_OPTIMIZATION"
  | "INTERNAL_LINKING"
  | "SCHEMA"
  | "CONVERSION"
  | "REPORTING"
  | "CLIENT_COMMUNICATION"
  | "VERIFICATION"
  | "ORCHESTRATOR";

export type AgentBudgetLimits = {
  maxToolCalls: number;
  maxModelCalls: number;
  maxEvidenceBytes: number;
  maxInputBytes: number;
  maxOutputBytes: number;
  maxOutputTokens: number;
  maxCostCents: number;
};

export type AgentDefinition = {
  key: string;
  version: string;
  name: string;
  capabilityType: AgentCapabilityType;
  defaultPermissionLevel: AgentPermissionLevel;
  allowedToolKeys: string[];
  defaultTimeoutSeconds: number;
  budgetLimits: AgentBudgetLimits;
  outputSchemaVersion: string;
  enabled: boolean;
};

const observeBudget: AgentBudgetLimits = {
  maxToolCalls: 5,
  maxModelCalls: 0,
  maxEvidenceBytes: 12_000,
  maxInputBytes: 16_000,
  maxOutputBytes: 4_000,
  maxOutputTokens: 0,
  maxCostCents: 0,
};

export const prepareDraftBudget: AgentBudgetLimits = {
  maxToolCalls: 8,
  maxModelCalls: 1,
  maxEvidenceBytes: 18_000,
  maxInputBytes: 24_000,
  maxOutputBytes: 10_000,
  maxOutputTokens: 1_500,
  maxCostCents: 50,
};

const observeTools = [
  "read.opportunity.v1",
  "read.audit_results.v1",
  "read.captured_evidence.v1",
  "read.client_site_context.v1",
  "read.service_plan_definition.v1",
  "read.business_facts.v1",
];

const prepareTools = [
  ...observeTools,
  "create.draft_artifact.v1",
  "create.approval_request.v1",
];

export const agentDefinitions: AgentDefinition[] = [
  {
    key: "website-health",
    version: "website-health-v1.0",
    name: "Website Health Agent",
    capabilityType: "WEBSITE_HEALTH",
    defaultPermissionLevel: "OBSERVE",
    allowedToolKeys: observeTools,
    defaultTimeoutSeconds: 45,
    budgetLimits: observeBudget,
    outputSchemaVersion: "observe-output-v1.0",
    enabled: false,
  },
  {
    key: "search-seo",
    version: "search-seo-v1.0",
    name: "Search / SEO Agent",
    capabilityType: "SEARCH_SEO",
    defaultPermissionLevel: "OBSERVE",
    allowedToolKeys: observeTools,
    defaultTimeoutSeconds: 45,
    budgetLimits: observeBudget,
    outputSchemaVersion: "observe-output-v1.0",
    enabled: false,
  },
  {
    key: "keyword-competitor",
    version: "keyword-competitor-v1.0",
    name: "Keyword & Competitor Agent",
    capabilityType: "KEYWORD_COMPETITOR",
    defaultPermissionLevel: "OBSERVE",
    allowedToolKeys: observeTools,
    defaultTimeoutSeconds: 45,
    budgetLimits: observeBudget,
    outputSchemaVersion: "observe-output-v1.0",
    enabled: false,
  },
  {
    key: "ai-visibility",
    version: "ai-visibility-v1.0",
    name: "AI Visibility Agent",
    capabilityType: "AI_VISIBILITY",
    defaultPermissionLevel: "OBSERVE",
    allowedToolKeys: observeTools,
    defaultTimeoutSeconds: 45,
    budgetLimits: observeBudget,
    outputSchemaVersion: "observe-output-v1.0",
    enabled: false,
  },
  {
    key: "content-opportunity",
    version: "content-opportunity-v1.0",
    name: "Content Opportunity Agent",
    capabilityType: "CONTENT_OPPORTUNITY",
    defaultPermissionLevel: "PREPARE",
    allowedToolKeys: prepareTools,
    defaultTimeoutSeconds: 60,
    budgetLimits: prepareDraftBudget,
    outputSchemaVersion: "prepare-output-v1.0",
    enabled: false,
  },
  {
    key: "content-production",
    version: "content-production-v1.0",
    name: "Content Production Agent",
    capabilityType: "CONTENT_PRODUCTION",
    defaultPermissionLevel: "PREPARE",
    allowedToolKeys: prepareTools,
    defaultTimeoutSeconds: 60,
    budgetLimits: prepareDraftBudget,
    outputSchemaVersion: "prepare-output-v1.0",
    enabled: false,
  },
  {
    key: EXISTING_PAGE_OPTIMIZATION_AGENT_KEY,
    version: EXISTING_PAGE_OPTIMIZATION_AGENT_VERSION,
    name: "Existing Page Optimization PREPARE Agent",
    capabilityType: "EXISTING_PAGE_OPTIMIZATION",
    defaultPermissionLevel: "PREPARE",
    allowedToolKeys: prepareTools,
    defaultTimeoutSeconds: 60,
    budgetLimits: prepareDraftBudget,
    outputSchemaVersion: EXISTING_PAGE_OPTIMIZATION_OUTPUT_SCHEMA_VERSION,
    enabled: true,
  },
  {
    key: "internal-linking",
    version: "internal-linking-v1.0",
    name: "Internal Linking Agent",
    capabilityType: "INTERNAL_LINKING",
    defaultPermissionLevel: "PREPARE",
    allowedToolKeys: prepareTools,
    defaultTimeoutSeconds: 60,
    budgetLimits: prepareDraftBudget,
    outputSchemaVersion: "prepare-output-v1.0",
    enabled: false,
  },
  {
    key: "schema",
    version: "schema-v1.0",
    name: "Schema Agent",
    capabilityType: "SCHEMA",
    defaultPermissionLevel: "PREPARE",
    allowedToolKeys: prepareTools,
    defaultTimeoutSeconds: 60,
    budgetLimits: prepareDraftBudget,
    outputSchemaVersion: "prepare-output-v1.0",
    enabled: false,
  },
  {
    key: "conversion",
    version: "conversion-v1.0",
    name: "Conversion Agent",
    capabilityType: "CONVERSION",
    defaultPermissionLevel: "PREPARE",
    allowedToolKeys: prepareTools,
    defaultTimeoutSeconds: 60,
    budgetLimits: prepareDraftBudget,
    outputSchemaVersion: "prepare-output-v1.0",
    enabled: false,
  },
  {
    key: "reporting",
    version: "reporting-v1.0",
    name: "Reporting Agent",
    capabilityType: "REPORTING",
    defaultPermissionLevel: "PREPARE",
    allowedToolKeys: prepareTools,
    defaultTimeoutSeconds: 60,
    budgetLimits: prepareDraftBudget,
    outputSchemaVersion: "prepare-output-v1.0",
    enabled: false,
  },
  {
    key: "client-communication",
    version: "client-communication-v1.0",
    name: "Client Communication Drafting Agent",
    capabilityType: "CLIENT_COMMUNICATION",
    defaultPermissionLevel: "PREPARE",
    allowedToolKeys: prepareTools,
    defaultTimeoutSeconds: 60,
    budgetLimits: prepareDraftBudget,
    outputSchemaVersion: "prepare-output-v1.0",
    enabled: false,
  },
  {
    key: "verification",
    version: "verification-v1.0",
    name: "Verification Agent",
    capabilityType: "VERIFICATION",
    defaultPermissionLevel: "OBSERVE",
    allowedToolKeys: observeTools,
    defaultTimeoutSeconds: 45,
    budgetLimits: observeBudget,
    outputSchemaVersion: "observe-output-v1.0",
    enabled: false,
  },
  {
    key: "orchestrator",
    version: "orchestrator-v1.0",
    name: "Orchestrator",
    capabilityType: "ORCHESTRATOR",
    defaultPermissionLevel: "PREPARE",
    allowedToolKeys: prepareTools,
    defaultTimeoutSeconds: 60,
    budgetLimits: prepareDraftBudget,
    outputSchemaVersion: "prepare-output-v1.0",
    enabled: false,
  },
];

export function getAgentDefinition(
  key: string,
  version?: string,
): AgentDefinition {
  const definition = agentDefinitions.find(
    (item) => item.key === key && (!version || item.version === version),
  );

  if (!definition) {
    throw new Error(`Unknown agent definition: ${key}${version ? `@${version}` : ""}`);
  }

  return definition;
}

export function getEnabledAgentDefinition(key: string): AgentDefinition {
  const definition = getAgentDefinition(key);

  if (!definition.enabled) {
    throw new Error(`Agent definition ${key} is disabled.`);
  }

  return definition;
}
