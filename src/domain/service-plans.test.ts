import { describe, expect, it } from "vitest";

import {
  getServicePlanDefinition,
  SERVICE_PLAN_DEFINITION_VERSION,
  servicePlanDefinitions,
} from "./service-plans";

describe("service plan definitions", () => {
  it("keeps recurring plans on the authoritative V1 definition version", () => {
    expect(servicePlanDefinitions.ESSENTIALS.version).toBe(
      SERVICE_PLAN_DEFINITION_VERSION,
    );
    expect(servicePlanDefinitions.GROWTH.version).toBe(
      SERVICE_PLAN_DEFINITION_VERSION,
    );
    expect(servicePlanDefinitions.PRO.version).toBe(
      SERVICE_PLAN_DEFINITION_VERSION,
    );
  });

  it("tracks manual implementation minutes separately from agent work", () => {
    expect(servicePlanDefinitions.ESSENTIALS.limits.manualImplementationMinutes).toBe(
      120,
    );
    expect(servicePlanDefinitions.GROWTH.limits.manualImplementationMinutes).toBe(
      240,
    );
    expect(servicePlanDefinitions.PRO.limits.manualImplementationMinutes).toBe(
      420,
    );
  });

  it("matches observed AI visibility prompt and surface limits by plan", () => {
    expect(servicePlanDefinitions.ESSENTIALS.limits.observedAiVisibilityPrompts).toBe(
      10,
    );
    expect(servicePlanDefinitions.GROWTH.limits.observedAiVisibilitySurfaces).toBe(
      2,
    );
    expect(servicePlanDefinitions.PRO.limits.observedAiVisibilitySurfaces).toBe(3);
  });

  it("returns service-plan definitions by explicit version", () => {
    const definition = getServicePlanDefinition(
      "GROWTH",
      SERVICE_PLAN_DEFINITION_VERSION,
    );

    expect(definition.label).toBe("Growth");
    expect(definition.monthlyPriceCents).toBe(125000);
    expect(definition.limits.trackedPriorityKeywords).toBe(75);
    expect(definition.limits.configuredCompetitors).toBe(5);
  });

  it("fails safely for unknown service-plan versions", () => {
    expect(() => getServicePlanDefinition("PRO", "missing-version")).toThrow(
      "Unknown service plan definition version: missing-version.",
    );
  });
});
