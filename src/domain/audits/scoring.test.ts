import { describe, expect, it } from "vitest";

import {
  auditCheckDefinitions,
  calculateCategoryScore,
  calculateOverallScore,
  getAuditScoringDefinition,
  SCORING_DEFINITION_VERSION,
  scoreCategoryKeys,
  scoreCategoryWeights,
} from "./scoring";

describe("audit scoring definition", () => {
  it("keeps each category at 100 max penalty weight", () => {
    for (const category of scoreCategoryKeys) {
      const weight = auditCheckDefinitions
        .filter((check) => check.category === category)
        .reduce((total, check) => total + check.maxPenaltyWeight, 0);

      expect(weight).toBe(100);
    }
  });

  it("exposes the authoritative docs 26 scoring version", () => {
    const definition = getAuditScoringDefinition(SCORING_DEFINITION_VERSION);

    expect(definition.version).toBe("dv-score-v1.0");
    expect(definition.categoryWeights).toMatchObject({
      websitePerformance: 20,
      seo: 25,
      localSearch: 15,
      conversion: 15,
      aiReadiness: 10,
      authority: 15,
    });
    expect(definition.lowCoverageThreshold).toBe(0.6);
  });

  it("fails safely for unknown scoring versions", () => {
    expect(() => getAuditScoringDefinition("missing-version")).toThrow(
      "Unknown audit scoring definition version: missing-version.",
    );
  });

  it("keeps client-facing category weights at 100 overall points", () => {
    const totalWeight = Object.values(scoreCategoryWeights).reduce(
      (total, weight) => total + weight,
      0,
    );

    expect(totalWeight).toBe(100);
  });

  it("calculates warning and fail penalties without penalizing unavailable evidence", () => {
    const score = calculateCategoryScore("websitePerformance", [
      { checkKey: "perf.lcp", status: "FAIL" },
      { checkKey: "perf.inp", status: "WARNING" },
      { checkKey: "perf.cls", status: "PASS" },
      { checkKey: "perf.https", status: "PASS" },
      { checkKey: "perf.mobile_render", status: "PASS" },
      { checkKey: "perf.critical_functionality", status: "UNAVAILABLE" },
    ]);

    expect(score.actualPenalty).toBe(31);
    expect(score.score).toBe(69);
    expect(score.lowCoverage).toBe(false);
  });

  it("flags low evidence coverage when missing checks dominate a category", () => {
    const score = calculateCategoryScore("conversion", [
      { checkKey: "conv.primary_cta", status: "PASS" },
    ]);

    expect(score.score).toBe(100);
    expect(score.evidenceCoverage).toBe(0.18);
    expect(score.lowCoverage).toBe(true);
  });

  it("marks overall scores provisional when any included category has low coverage", () => {
    const categoryScores = scoreCategoryKeys.map((category) =>
      calculateCategoryScore(
        category,
        category === "conversion"
          ? [{ checkKey: "conv.primary_cta", status: "PASS" }]
          : auditCheckDefinitions
              .filter((check) => check.category === category)
              .map((check) => ({ checkKey: check.key, status: "PASS" as const })),
      ),
    );

    const overall = calculateOverallScore(categoryScores);

    expect(overall.score).toBe(100);
    expect(overall.provisional).toBe(true);
  });
});
