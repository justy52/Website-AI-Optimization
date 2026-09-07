import { describe, expect, it } from "vitest";

import {
  buildOpportunityDraft,
  derivePlanFit,
  shouldAutoCreateOpportunity,
  sortOpportunitiesForWorkPlan,
  type AuditResultOpportunitySource,
} from "./generation";

const baseSource: AuditResultOpportunitySource = {
  checkKey: "seo.title",
  checkVersion: "seo.title@dv-score-v1.0",
  category: "seo",
  status: "FAIL",
  severity: "HIGH",
  maxPenaltyWeight: 12,
  reason: "Title evidence",
  evidenceRefs: ["homepage-html"],
  evidenceConfidence: "HIGH",
  clientServicePlan: "GROWTH",
  clientServicePlanVersion: "service-plans-v1.0",
};

describe("opportunity auto-generation rules", () => {
  it("creates eligible opportunities for FAIL results", () => {
    expect(shouldAutoCreateOpportunity(baseSource)).toBe(true);
    const draft = buildOpportunityDraft(baseSource);

    expect(draft?.normalizedRemediationFamily).toBe("on_page_metadata");
    expect(draft?.status).toBe("DRAFT");
    expect(draft?.sourceSeverity).toBe("HIGH");
    expect(draft?.confidence).toBe(5);
    expect(draft?.priorityDefinitionVersion).toBe("op-priority-v1.0");
  });

  it("creates eligible opportunities for qualifying WARNING results", () => {
    expect(
      shouldAutoCreateOpportunity({
        ...baseSource,
        status: "WARNING",
        severity: "MEDIUM",
        maxPenaltyWeight: 12,
      }),
    ).toBe(true);
  });

  it("does not create opportunities for low-weight warnings", () => {
    expect(
      shouldAutoCreateOpportunity({
        ...baseSource,
        checkKey: "seo.meta_description",
        status: "WARNING",
        severity: "MEDIUM",
        maxPenaltyWeight: 6,
      }),
    ).toBe(false);
  });

  it("does not create opportunities for unavailable or not-applicable checks", () => {
    expect(
      shouldAutoCreateOpportunity({
        ...baseSource,
        status: "UNAVAILABLE",
        severity: null,
      }),
    ).toBe(false);
    expect(
      shouldAutoCreateOpportunity({
        ...baseSource,
        status: "NOT_APPLICABLE",
        severity: null,
      }),
    ).toBe(false);
  });

  it("blocks auto-generation when evidence confidence is low", () => {
    expect(
      shouldAutoCreateOpportunity({
        ...baseSource,
        evidenceConfidence: "LOW",
      }),
    ).toBe(false);
  });

  it("always creates CRITICAL opportunities with immediate priority", () => {
    const draft = buildOpportunityDraft({
      ...baseSource,
      checkKey: "perf.https",
      category: "websitePerformance",
      severity: "CRITICAL",
      evidenceConfidence: "LOW",
    });

    expect(draft?.immediateAttention).toBe(true);
    expect(draft?.finalPriority).toBeGreaterThanOrEqual(95);
    expect(draft?.priorityBand).toBe("Immediate");
  });
});

describe("plan fit and work-plan ordering", () => {
  it("keeps out-of-scope audit-only work visible", () => {
    const fit = derivePlanFit(
      "AUDIT_ONLY",
      "service-plans-v1.0",
      "seo",
      "on_page_metadata",
    );

    expect(fit.planScope).toBe("OUT_OF_SCOPE");
    expect(fit.planFit).toBe(0);
  });

  it("fails safely for unknown service-plan definition versions", () => {
    expect(() =>
      derivePlanFit("GROWTH", "missing-version", "seo", "on_page_metadata"),
    ).toThrow("Unknown service plan definition version: missing-version.");
  });

  it("sorts work plans by critical, score, effort, then age", () => {
    const old = new Date("2026-01-01T00:00:00Z");
    const recent = new Date("2026-02-01T00:00:00Z");
    const sorted = sortOpportunitiesForWorkPlan([
      {
        status: "READY",
        sourceSeverity: "HIGH",
        finalPriority: 85,
        effort: 3,
        createdAt: old,
        id: "high",
      },
      {
        status: "READY",
        sourceSeverity: "CRITICAL",
        finalPriority: 95,
        effort: 5,
        createdAt: recent,
        id: "critical",
      },
      {
        status: "READY",
        sourceSeverity: "HIGH",
        finalPriority: 85,
        effort: 1,
        createdAt: recent,
        id: "lower-effort",
      },
    ]);

    expect(sorted.map((item) => item.id)).toEqual([
      "critical",
      "lower-effort",
      "high",
    ]);
  });
});
