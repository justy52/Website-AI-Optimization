import { describe, expect, it } from "vitest";

import { buildAuditReportFromSnapshot, canFinalizeAudit, hasReportableScore, type AuditSnapshotData, isCategoryScoreWithheld, checkLabel, findingGuidance } from "./report";
import { auditCheckDefinitions } from "./scoring";

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
    expect(report.executiveSummary).toContain("1 check was unavailable");
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

describe("category score display", () => {
  it("shows an AI readiness score only for audits collected with the site-sample collector", () => {
    expect(isCategoryScoreWithheld("aiReadiness", 82, false, "site-sample-deterministic-v2.0")).toBe(false);
    expect(isCategoryScoreWithheld("aiReadiness", 82, false, "phase1-deterministic-v1.11")).toBe(true);
    expect(isCategoryScoreWithheld("aiReadiness", 82, false, undefined)).toBe(true);
    expect(isCategoryScoreWithheld("aiReadiness", 82, true, "site-sample-deterministic-v2.0")).toBe(true);
    expect(isCategoryScoreWithheld("seo", 90, false, "phase1-deterministic-v1.11")).toBe(false);
    expect(isCategoryScoreWithheld("seo", null, false, "site-sample-deterministic-v2.0")).toBe(true);
  });
});

describe("customer-facing report content", () => {
  it("lists passed checks, orders findings by weight, and summarizes in plain language", () => {
    const full: AuditSnapshotData = {
      ...snapshot,
      run: { ...snapshot.run, overallScore: 81, provisional: false, evidenceCoverageBasisPoints: 10000 },
      checkResults: [
        { checkKey: "perf.https", category: "websitePerformance", status: "PASS", severity: null, reason: "The audited page resolved over HTTPS.", evidenceRefs: ["homepage"] },
        { checkKey: "seo.title", category: "seo", status: "PASS", severity: null, reason: "A non-empty HTML title was found.", evidenceRefs: ["homepage-html"] },
        { checkKey: "auth.credentials", category: "authority", status: "FAIL", severity: "HIGH", reason: "None found.", evidenceRefs: [] },
        { checkKey: "local.gbp_presence", category: "localSearch", status: "NOT_APPLICABLE", severity: null, reason: "Not applicable.", evidenceRefs: [] },
      ],
      findings: [
        { checkKey: "auth.expertise_content", severity: "HIGH", title: "x", summary: "x", evidenceRefs: [] },
        { checkKey: "ai.citability", severity: "HIGH", title: "x", summary: "x", evidenceRefs: [] },
        { checkKey: "local.category_service_alignment", severity: "HIGH", title: "x", summary: "x", evidenceRefs: [] },
      ],
    };
    const report = buildAuditReportFromSnapshot(full);
    expect(report.executiveSummary).toBe("Overall score: 81 out of 100. 2 of 3 checks passed. 3 high-priority findings and 0 other findings are listed, each with a suggested next step. Every check returned a result. Evidence coverage: 100%.");
    expect(report.reportData.passedChecks?.map((check) => check.checkKey)).toEqual(["perf.https", "seo.title"]);
    // Equal severity: the check with the larger scoring weight comes first.
    expect(report.reportData.highPriorityFindings.map((finding) => finding.checkKey)).toEqual(["local.category_service_alignment", "auth.expertise_content", "ai.citability"]);
  });

  it("has a neutral label and a next step for every catalog check", () => {
    for (const check of auditCheckDefinitions) {
      expect(checkLabel(check.key), check.key).toBeTruthy();
      expect(findingGuidance(check.key)?.nextStep, check.key).toBeTruthy();
    }
    expect(findingGuidance("auth.referring_domains")?.nextStep).not.toMatch(/connect a licensed/i);
  });
});
