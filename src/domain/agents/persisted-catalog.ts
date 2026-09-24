import { isDeepStrictEqual } from "node:util";
import type { AgentDefinition } from "./catalog";

export type PersistedAgentDefinition = Omit<AgentDefinition, "budgetLimits" | "capabilityType"> & {
  id: string;
  capabilityType: string;
  budgetLimits: Record<string, unknown>;
};

export class AgentCatalogConfigurationError extends Error {
  constructor(key: string, version: string) {
    super(`Agent catalog configuration mismatch: ${key}@${version}. Apply the reviewed catalog migration before starting runs.`);
    this.name = "AgentCatalogConfigurationError";
  }
}

export function requirePersistedAgentDefinition(agent: AgentDefinition, row: PersistedAgentDefinition | undefined): PersistedAgentDefinition {
  const fields = ["key", "version", "name", "capabilityType", "defaultPermissionLevel", "allowedToolKeys", "defaultTimeoutSeconds", "budgetLimits", "outputSchemaVersion", "enabled"] as const;
  if (!agent.enabled || !row?.id || fields.some(field => !isDeepStrictEqual(agent[field], row[field]))) {
    throw new AgentCatalogConfigurationError(agent.key, agent.version);
  }
  return row;
}
