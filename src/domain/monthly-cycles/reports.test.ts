import { describe, expect, it } from "vitest";

import { buildMonthlyEntitlementSnapshot } from "./entitlements";
import {
  buildMonthlyReportDraft,
  monthlyReportSnapshotHash,
} from "./reports";

describe("monthly report draft", () => {
  it("discloses period windows and unavailable data sources without inventing metrics", () => {
    const report = buildMonthlyReportDraft({
      cycle: {
        id: "cycle-1",
        clientName: "Acme Dental",
        servicePlan: "GROWTH",
        servicePlanVersion: "service-plans-v1.0",
        periodStartDate: "2026-09-01",
        periodEndDate: "2026-09-30",
        timezone: "America/Denver",
        entitlementSnapshot: buildMonthlyEntitlementSnapshot("GROWTH"),
      },
      deliverables: [
        {
          title: "Weekly Search Console",
          status: "BLOCKED",
          targetCount: 4,
          completedCount: 0,
          entitlementSourceRule: "Growth: Search Console weekly when connected",
          limitations: { code: "SEARCH_CONSOLE_NOT_CONNECTED" },
        },
        {
          title: "Observed AI Visibility",
          status: "UNAVAILABLE",
          targetCount: 1,
          completedCount: 0,
          entitlementSourceRule: "Growth: observed AI visibility monthly",
          limitations: { code: "PROVIDER_NOT_ACTIVE" },
        },
      ],
      workItems: [],
      monitoring: {
        websiteHealthRuns: 2,
        searchConsoleRuns: 0,
        searchConsoleUnavailable: true,
        failures: 0,
        newOpportunities: 1,
        criticalRegressions: 0,
      },
      competitor: {
        activeTargets: 3,
        observations: 2,
        materialMetadataChanges: 1,
        limitations: ["Rank/keyword provider is not active in this phase."],
      },
      unresolvedRisks: [],
    });

    expect(report.sourceWindows.cyclePeriod).toEqual({
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
    expect(report.sections.searchPerformance).toMatchObject({
      runsCompleted: 0,
      status: "BLOCKED / SEARCH CONSOLE NOT CONNECTED",
    });
    expect(report.sections.competitorChanges).toMatchObject({
      observations: 2,
      materialMetadataChanges: 1,
      unavailableRankKeywordData: true,
    });
    expect(JSON.stringify(report)).not.toMatch(/ranking gain|traffic lift/i);
    expect(report.dataLimitations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "Weekly Search Console",
          status: "BLOCKED",
        }),
        expect.objectContaining({
          source: "Observed AI Visibility",
          status: "UNAVAILABLE",
        }),
      ]),
    );
  });

  it("discloses waived work without representing it as performed", () => {
    const report = buildMonthlyReportDraft({
      cycle: {
        id: "cycle-2",
        clientName: "Northstar HVAC",
        servicePlan: "PRO",
        servicePlanVersion: "service-plans-v1.0",
        periodStartDate: "2026-12-01",
        periodEndDate: "2026-12-31",
        timezone: "UTC",
        entitlementSnapshot: buildMonthlyEntitlementSnapshot("PRO"),
      },
      deliverables: [
        {
          title: "Quarterly Strategy Review",
          status: "WAIVED",
          targetCount: 1,
          completedCount: 0,
          entitlementSourceRule: "Pro: quarterly strategy review included",
          waiverReason: "Client postponed until January.",
        },
      ],
      workItems: [],
      monitoring: {
        websiteHealthRuns: 0,
        searchConsoleRuns: 0,
        searchConsoleUnavailable: false,
        failures: 0,
        newOpportunities: 0,
        criticalRegressions: 0,
      },
      competitor: {
        activeTargets: 0,
        observations: 0,
        materialMetadataChanges: 0,
        limitations: [],
      },
      unresolvedRisks: [],
    });

    expect(report.dataLimitations).toContainEqual({
      source: "Quarterly Strategy Review",
      status: "WAIVED",
      reason: "Client postponed until January.",
    });
    expect(report.sections.deliverablesAndPlanUsage).toMatchObject({
      deliverableStatusCounts: { WAIVED: 1 },
      noRollover: true,
    });
  });

  it("uses deterministic hashes for finalized immutable snapshots", () => {
    const snapshot = {
      title: "September Monthly Report",
      finalizedAt: "2026-10-01T00:00:00.000Z",
      sections: { workCompleted: [] },
    };

    expect(monthlyReportSnapshotHash(snapshot)).toBe(
      monthlyReportSnapshotHash(snapshot),
    );
    expect(monthlyReportSnapshotHash(snapshot)).not.toBe(
      monthlyReportSnapshotHash({ ...snapshot, title: "Edited" }),
    );
  });
});
