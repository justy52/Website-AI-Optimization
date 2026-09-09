import { describe, expect, it } from "vitest";

import { buildMonthlyEntitlementSnapshot } from "./entitlements";
import {
  selectMonthlyWork,
  sortMonthlySelectionCandidates,
  type MonthlySelectionCandidate,
} from "./selection";

function candidate(
  id: string,
  overrides: Partial<MonthlySelectionCandidate> = {},
): MonthlySelectionCandidate {
  return {
    id,
    status: "READY",
    sourceSeverity: "MEDIUM",
    priorityBand: "Normal",
    planScope: "INCLUDED",
    finalPriority: 50,
    effort: 3,
    createdAt: "2026-09-10T00:00:00.000Z",
    normalizedRemediationFamily: "technical_seo",
    category: "seo",
    approvalBlockedState: "NOT_BLOCKED",
    dependencyState: "NONE",
    clientInputState: "NOT_REQUIRED",
    ...overrides,
  };
}

describe("monthly selection engine", () => {
  it("sorts by Doc 27 order before deterministic priority tie-breaks", () => {
    const sorted = sortMonthlySelectionCandidates([
      candidate("priority", {
        finalPriority: 99,
        normalizedRemediationFamily: "accessibility",
        category: "websitePerformance",
      }),
      candidate("contractual", {
        finalPriority: 10,
        normalizedRemediationFamily: "on_page_metadata",
      }),
      candidate("high", {
        sourceSeverity: "HIGH",
        priorityBand: "High",
        finalPriority: 15,
      }),
      candidate("critical-blocked", {
        status: "BLOCKED",
        sourceSeverity: "CRITICAL",
        finalPriority: 1,
      }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual([
      "critical-blocked",
      "high",
      "contractual",
      "priority",
    ]);
  });

  it("uses lower effort and older age as the second-level tie-breakers", () => {
    const sorted = sortMonthlySelectionCandidates([
      candidate("newer", { finalPriority: 70, effort: 2, createdAt: "2026-09-20" }),
      candidate("older", { finalPriority: 70, effort: 2, createdAt: "2026-09-01" }),
      candidate("less-effort", { finalPriority: 70, effort: 1, createdAt: "2026-09-30" }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual([
      "less-effort",
      "older",
      "newer",
    ]);
  });

  it("does not select low-value non-contractual work just to consume allowance", () => {
    const selected = selectMonthlyWork({
      snapshot: buildMonthlyEntitlementSnapshot("ESSENTIALS"),
      candidates: [
        candidate("low-value", {
          priorityBand: "Low",
          sourceSeverity: "LOW",
          finalPriority: 5,
          normalizedRemediationFamily: "nice_to_have",
          category: "authority",
        }),
      ],
    });

    expect(selected).toEqual([]);
  });

  it("keeps out-of-scope high-value work visible without counting it as included", () => {
    const selected = selectMonthlyWork({
      snapshot: buildMonthlyEntitlementSnapshot("ESSENTIALS"),
      candidates: [
        candidate("critical-out-of-scope", {
          sourceSeverity: "CRITICAL",
          planScope: "OUT_OF_SCOPE",
          normalizedRemediationFamily: "on_page_metadata",
        }),
      ],
    });

    expect(selected).toHaveLength(1);
    expect(selected[0]?.selectedReason).toBe("unresolved CRITICAL issue");
    expect(selected[0]?.consumesEntitlement).toBe(false);
    expect(selected[0]?.entitlementType).toBeNull();
  });

  it("applies package entitlement caps without rollover or double-counting", () => {
    const selected = selectMonthlyWork({
      snapshot: buildMonthlyEntitlementSnapshot("GROWTH"),
      usage: { existingPageOptimizationsCompleted: 1 },
      candidates: [
        candidate("page-at-cap", {
          normalizedRemediationFamily: "on_page_metadata",
          finalPriority: 80,
        }),
        candidate("content-slot", {
          normalizedRemediationFamily: "content_targeting",
          finalPriority: 70,
        }),
      ],
    });

    expect(selected.map((item) => item.candidate.id)).toEqual(["content-slot"]);
    expect(selected[0]?.entitlementType).toBe("major_content_assets_completed");
  });
});
