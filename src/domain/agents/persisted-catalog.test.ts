import { describe, expect, it } from "vitest";
import { agentDefinitions } from "./catalog";
import { requirePersistedAgentDefinition } from "./persisted-catalog";

describe("immutable persisted runtime catalog", () => {
  it.each(agentDefinitions.filter(a => a.enabled))("requires the exact enabled $key version", agent => {
    const row = { ...agent, id: "persisted-id" };
    expect(requirePersistedAgentDefinition(agent, row)).toBe(row);
    expect(() => requirePersistedAgentDefinition(agent, undefined)).toThrow("configuration mismatch");
    for (const field of ["key", "version", "name", "capabilityType", "defaultPermissionLevel", "allowedToolKeys", "defaultTimeoutSeconds", "budgetLimits", "outputSchemaVersion", "enabled"] as const) {
      expect(() => requirePersistedAgentDefinition(agent, { ...row, [field]: null })).toThrow("configuration mismatch");
    }
  });
});
