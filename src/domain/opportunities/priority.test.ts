import { describe, expect, it } from "vitest";

import {
  calculateOpportunityPriority,
  getPriorityDefinition,
  PRIORITY_DEFINITION_VERSION,
} from "./priority";

describe("opportunity priority", () => {
  it("exposes the authoritative docs 27 priority version", () => {
    const definition = getPriorityDefinition(PRIORITY_DEFINITION_VERSION);

    expect(definition.version).toBe("op-priority-v1.0");
    expect(definition.weightedFactors).toMatchObject({
      impact: 0.3,
      confidence: 0.2,
      urgency: 0.15,
      strategicFit: 0.15,
      planFit: 0.1,
      staleness: 0.1,
    });
    expect(definition.modifiers).toMatchObject({
      unresolvedHardDependency: -25,
      awaitingClientInput: -15,
      criticalFindingMinimum: 95,
    });
  });

  it("fails safely for unknown priority versions", () => {
    expect(() => getPriorityDefinition("missing-version")).toThrow(
      "Unknown opportunity priority definition version: missing-version.",
    );
  });

  it("calculates the deterministic V1 weighted score and band", () => {
    const result = calculateOpportunityPriority({
      impact: 5,
      confidence: 4,
      urgency: 5,
      strategicFit: 4,
      planFit: 5,
      staleness: 2,
      effort: 2,
    });

    expect(result.score).toBe(92);
    expect(result.band).toBe("Immediate");
  });

  it("zeros confirmed duplicate opportunities", () => {
    const result = calculateOpportunityPriority({
      impact: 5,
      confidence: 5,
      urgency: 5,
      strategicFit: 5,
      planFit: 5,
      staleness: 5,
      effort: 1,
      isConfirmedDuplicate: true,
    });

    expect(result.score).toBe(0);
    expect(result.band).toBe("Low");
  });

  it("applies the critical finding floor", () => {
    const result = calculateOpportunityPriority({
      impact: 2,
      confidence: 2,
      urgency: 2,
      strategicFit: 2,
      planFit: 2,
      staleness: 0,
      effort: 5,
      isCriticalFinding: true,
    });

    expect(result.score).toBe(95);
    expect(result.band).toBe("Immediate");
  });

  it("blocks invalid scale values", () => {
    expect(() =>
      calculateOpportunityPriority({
        impact: 6,
        confidence: 2,
        urgency: 2,
        strategicFit: 2,
        planFit: 2,
        staleness: 0,
        effort: 2,
      }),
    ).toThrow("impact must be an integer from 0 to 5.");
  });
});
