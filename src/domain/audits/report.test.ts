import { describe, expect, it } from "vitest";

import { buildAuditReportFromSnapshot, canFinalizeAudit, hasReportableScore, type AuditSnapshotData } from "./report";

describe("audit finalization readiness", () => {
  it("accepts only completed runs in reviewable audit states", () => {
    expect(canFinalizeAudit("READY_TO_FINALIZE", "SUCCEEDED")).toBe(true);
    expect(canFinalizeAudit("REVIEW_REQUIRED", "PARTIAL")).toBe(true);
    for (const state of ["QUEUED", "RUNNING", "FAILED"]) {
      expect(canFinalizeAudit("READY_TO_FINALIZE", state)).toBe(false);
    }
    expect(canFinalizeAudit("RUNNING", "SUCCEEDED")).toBe(false);
  });
});

const snapshot: AuditSnapshotData = {
  audit: {
    id: "audit-1",
    title: "Example audit",
    finalizedAt: "2026-09-06T20:00:00.000Z",
    scoringDefinitionVersion: "dv-score-v1.0",
    checkCatalogVersion: "dv-score-v1.0",
  },
  run: {
    id: "run-1",
    overallScore: 74,
    provisional: true,
    evidenceCoverageBasisPoints: 4200,
    collectorVersion: "phase1-deterministic-v1.0",
  },
  website: {
    id: "website-1",
    displayName: "Example Site",
    canonicalUrl: "https://example.com/",
    domain: "example.com",
  },
  checkResults: [
    {
      checkKey: "perf.lcp",
      category: "websitePerformance",
      status: "UNAVAILABLE",
      severity: null,
      reason: "No lab data source.",
      evidenceRefs: [],
    },
    {
      checkKey: "seo.indexability",
      category: "seo",
      status: "PASS",
      severity: null,
      reason: "Indexable.",
      evidenceRefs: ["homepage"],
    },
  ],
  categoryScores: [
    {
      category: "websitePerformance",
      score: null,
      evidenceCoverageBasisPoints: 1400,
      lowCoverage: true,
    },
  ],
  findings: [
    {
      checkKey: "seo.title",
      severity: "HIGH",
      title: "Missing title",
      summary: "Title is missing.",
      evidenceRefs: ["homepage-html"],
    },
  ],
};

describe("audit report builder", () => {
  it("reproduces finalized audit snapshot data without inventing unavailable values", () => {
    const report = buildAuditReportFromSnapshot(snapshot);

    expect(report.title).toBe("Example Site Digital Visibility Audit");
    expect(report.methodologyVersion).toBe("dv-score-v1.0");
    expect(report.reportData.overallScore).toBe(74);
    expect(report.reportData.provisional).toBe(true);
    expect(report.reportData.unavailableChecks).toHaveLength(1);
    expect(report.executiveSummary).toContain("checks were unavailable");
    expect(report.executiveSummary).toContain("Evidence coverage: 42%");
    expect(report.executiveSummary).toContain("score is withheld");
    expect(report.executiveSummary).not.toContain("74/100");
  });

  it("only displays a score when there is sufficient evidence", () => {
    expect(hasReportableScore(92, 2600)).toBe(false);
    expect(hasReportableScore(92, 6000)).toBe(true);
    expect(hasReportableScore(null, 10000)).toBe(false);
  });

  it("does not claim ROI, rankings, revenue, or causation", () => {
    const report = buildAuditReportFromSnapshot(snapshot);

    expect(report.executiveSummary).not.toMatch(/roi|rank #?1|revenue|caused/i);
  });

  it("retains medium findings and high findings beyond the first ten", () => {
    const high = Array.from({ length: 11 }, (_, index) => ({ ...snapshot.findings[0], checkKey: `high-${index}` }));
    const medium = { ...snapshot.findings[0], checkKey: "seo.meta_description", severity: "MEDIUM" as const, title: "No meta description" };
    const report = buildAuditReportFromSnapshot({ ...snapshot, findings: [...high, medium] });
    expect(report.reportData.highPriorityFindings).toHaveLength(10);
    expect(report.reportData.additionalFindings?.map(f => f.checkKey)).toEqual(["high-10", "seo.meta_description"]);
  });
});
