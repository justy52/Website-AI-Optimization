import { describe, expect, it } from "vitest";

import {
  buildOpportunityDraft,
  derivePlanFit,
  recalculateDedupedOpportunityPriority,
  shouldAutoCreateOpportunity,
  sortOpportunitiesForWorkPlan,
  type AuditResultOpportunitySource,
  type DedupedOpportunityOperationalState,
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

describe("deduped opportunity priority refresh", () => {
  const operationalState: DedupedOpportunityOperationalState = {
    strategicFit: 3,
    planFit: 4,
    staleness: 0,
    effort: 2,
    dependencyState: "NONE",
    clientInputState: "NOT_REQUIRED",
    approvalBlockedState: "NOT_BLOCKED",
    status: "READY",
  };

  it("refreshes a MEDIUM-sourced opportunity to the CRITICAL priority floor", () => {
    const refreshed = recalculateDedupedOpportunityPriority(
      {
        ...operationalState,
        planFit: 0,
        effort: 5,
      },
      {
        sourceSeverity: "CRITICAL",
        evidenceConfidence: "HIGH",
      },
    );

    expect(refreshed.impact).toBe(5);
    expect(refreshed.confidence).toBe(5);
    expect(refreshed.urgency).toBe(5);
    expect(refreshed.finalPriority).toBeGreaterThanOrEqual(95);
    expect(refreshed.priorityBand).toBe("Immediate");
    expect(refreshed.immediateAttention).toBe(true);
    expect(refreshed.priorityReasons).toContain(
      "Critical finding priority floor applied at 95.",
    );
  });

  it("refreshes HIGH severity to CRITICAL and raises the stored priority", () => {
    const high = recalculateDedupedOpportunityPriority(operationalState, {
      sourceSeverity: "HIGH",
      evidenceConfidence: "HIGH",
    });
    const critical = recalculateDedupedOpportunityPriority(operationalState, {
      sourceSeverity: "CRITICAL",
      evidenceConfidence: "HIGH",
    });

    expect(critical.finalPriority).toBeGreaterThan(high.finalPriority);
    expect(critical.priorityBand).toBe("Immediate");
    expect(critical.immediateAttention).toBe(true);
  });

  it("refreshes MEDIUM confidence to HIGH confidence consistently", () => {
    const mediumConfidence = recalculateDedupedOpportunityPriority(
      operationalState,
      {
        sourceSeverity: "HIGH",
        evidenceConfidence: "MEDIUM",
      },
    );
    const highConfidence = recalculateDedupedOpportunityPriority(
      operationalState,
      {
        sourceSeverity: "HIGH",
        evidenceConfidence: "HIGH",
      },
    );

    expect(mediumConfidence.confidence).toBe(3);
    expect(highConfidence.confidence).toBe(5);
    expect(highConfidence.finalPriority).toBeGreaterThan(
      mediumConfidence.finalPriority,
    );
  });

  it("preserves human operational blockers while refreshing source-derived factors", () => {
    const refreshed = recalculateDedupedOpportunityPriority(
      {
        ...operationalState,
        effort: 4,
        dependencyState: "HARD_DEPENDENCY",
        clientInputState: "REQUIRED",
        approvalBlockedState: "AWAITING_APPROVAL",
        status: "BLOCKED",
      },
      {
        sourceSeverity: "HIGH",
        evidenceConfidence: "HIGH",
      },
    );

    expect(refreshed.impact).toBe(4);
    expect(refreshed.confidence).toBe(5);
    expect(refreshed.urgency).toBe(4);
    expect(refreshed.modifiers).toMatchObject({
      dependencyState: "HARD_DEPENDENCY",
      clientInputState: "REQUIRED",
      approvalBlockedState: "AWAITING_APPROVAL",
      effort: 4,
    });
    expect(refreshed.priorityReasons).toEqual(
      expect.arrayContaining([
        "Unresolved hard dependency modifier -25.",
        "Awaiting required client input modifier -15.",
      ]),
    );
  });

  it("does not include human status in the dedupe refresh payload", () => {
    const refreshed = recalculateDedupedOpportunityPriority(
      {
        ...operationalState,
        status: "IN_PROGRESS",
      },
      {
        sourceSeverity: "HIGH",
        evidenceConfidence: "HIGH",
      },
    );

    expect("status" in refreshed).toBe(false);
    expect(refreshed.modifiers).toMatchObject({
      refreshRule: "audit_source_refresh_preserve_operational_state",
    });
  });
});
