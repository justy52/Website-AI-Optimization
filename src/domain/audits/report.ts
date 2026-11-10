import type { CheckStatus, ScoreCategoryKey } from "./scoring";
import type { EvidenceConfidence } from "@/domain/opportunities/generation";

export function canFinalizeAudit(auditStatus: string, runStatus: string): boolean {
  return ["SUCCEEDED", "PARTIAL"].includes(runStatus) &&
    ["READY_TO_FINALIZE", "REVIEW_REQUIRED"].includes(auditStatus);
}

export function hasReportableScore(score: number | null | undefined, coverageBasisPoints: number | null | undefined): boolean {
  return score != null && (coverageBasisPoints ?? 0) >= 6000;
}

// Suggestions are deliberately diagnostic: the observed check alone does not
// establish the cause or guarantee that any particular change will help.
export function findingGuidance(checkKey: string): { title: string; nextStep: string } | null {
  const guidance: Record<string, { title: string; nextStep: string }> = {
    "perf.lcp": { title: "Review mobile loading speed", nextStep: "Repeat the mobile test and inspect its diagnostics to identify what delays the largest visible element." },
    "perf.inp": { title: "Review real-user responsiveness", nextStep: "Inspect field data and interaction diagnostics to identify which user actions respond slowly." },
    "perf.cls": { title: "Review unexpected layout movement", nextStep: "Repeat the mobile test and inspect which elements move while the page loads." },
    "perf.https": { title: "Review the secure connection", nextStep: "Check the website's HTTPS configuration and redirects with its hosting provider." },
    "seo.meta_description": { title: "Review the page description", nextStep: "Prepare a concise, accurate description of the page for review before adding it to the website." },
    "seo.title": { title: "Review the page title", nextStep: "Check the page title and prepare an accurate, descriptive title for review." },
    "seo.heading_structure": { title: "Review the page headings", nextStep: "Check that the visible headings are useful and organized clearly for readers." },
    "seo.canonical": { title: "Review the canonical address", nextStep: "Check that the page's canonical address points to the intended version of the page." },
    "seo.indexability": { title: "Review search access", nextStep: "Check the page response and indexing instructions before changing search settings." },
    "seo.robots_sitemap": { title: "Review the sitemap and crawler instructions", nextStep: "Check the robots.txt and sitemap responses, then fix any confirmed errors." },
    "seo.internal_links": { title: "Review internal links", nextStep: "Check that visitors and search crawlers can reach relevant pages from the homepage." },
    "conv.primary_cta": { title: "Review the primary call to action", nextStep: "Check whether visitors can easily see and use the next step you want them to take." },
    "conv.mobile_contact": { title: "Review mobile contact options", nextStep: "Check the contact options on a mobile device and confirm they work as intended." },
    "ai.identity_clarity": { title: "Review the business name on the homepage", nextStep: "Check the verified name against the visible page, including alternate wording and content that loads in a browser." },
    "ai.service_clarity": { title: "Review how the homepage describes the service", nextStep: "Check whether the verified service is described clearly, including synonyms and links to relevant service pages." },
    "ai.location_clarity": { title: "Review location information on the homepage", nextStep: "Check the verified location or service area against the homepage and relevant location pages." },
    "ai.crawlability": { title: "Review AI search access to the homepage", nextStep: "Review the homepage text, robots.txt, and any firewall restrictions. Decide whether to allow OAI-SearchBot based on the business's preferences; this is separate from GPTBot's training setting and does not guarantee inclusion." },
  };
  return guidance[checkKey] ?? null;
}

export type SnapshotCheckResult = {
  checkKey: string;
  category: ScoreCategoryKey;
  status: CheckStatus;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | null;
  evidenceConfidence?: EvidenceConfidence;
  reason: string;
  evidenceRefs: string[];
};

export type SnapshotCategoryScore = {
  category: ScoreCategoryKey;
  score: number | null;
  evidenceCoverageBasisPoints: number;
  lowCoverage: boolean;
};

export type SnapshotFinding = {
  checkKey: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  summary: string;
  evidenceRefs: string[];
};

export type AuditSnapshotData = {
  audit: {
    id: string;
    title: string;
    finalizedAt: string;
    scoringDefinitionVersion: string;
    checkCatalogVersion: string;
  };
  run: {
    id: string;
    overallScore: number | null;
    provisional: boolean;
    evidenceCoverageBasisPoints: number;
    collectorVersion: string;
  };
  website: {
    id: string;
    displayName: string;
    canonicalUrl: string;
    domain: string;
  };
  checkResults: SnapshotCheckResult[];
  categoryScores: SnapshotCategoryScore[];
  findings: SnapshotFinding[];
};

export type BuiltAuditReport = {
  title: string;
  executiveSummary: string;
  methodologyVersion: string;
  reportData: {
    website: AuditSnapshotData["website"];
    overallScore: AuditSnapshotData["run"]["overallScore"];
    provisional: boolean;
    evidenceCoverageBasisPoints: number;
    categoryScores: SnapshotCategoryScore[];
    highPriorityFindings: SnapshotFinding[];
    additionalFindings?: SnapshotFinding[];
    unavailableChecks: SnapshotCheckResult[];
    methodology: {
      scoringDefinitionVersion: string;
      checkCatalogVersion: string;
      collectorVersion: string;
    };
  };
};

function severityRank(finding: SnapshotFinding): number {
  return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[finding.severity];
}

export function buildAuditReportFromSnapshot(
  snapshot: AuditSnapshotData,
): BuiltAuditReport {
  const highPriorityFindings = snapshot.findings
    .filter((finding) => finding.severity === "CRITICAL" || finding.severity === "HIGH")
    .sort((a, b) => severityRank(a) - severityRank(b))
    .slice(0, 10);
  const featured = new Set(highPriorityFindings);
  const additionalFindings = snapshot.findings.filter(finding => !featured.has(finding)).sort((a, b) => severityRank(a) - severityRank(b));
  const unavailableChecks = snapshot.checkResults.filter(
    (check) => check.status === "UNAVAILABLE" || check.status === "ERROR",
  );
  const scoreText =
    !hasReportableScore(snapshot.run.overallScore, snapshot.run.evidenceCoverageBasisPoints)
      ? "An overall score is withheld because evidence is insufficient"
      : `Overall deterministic score: ${snapshot.run.overallScore}/100`;
  const coveragePercent = Math.round(
    snapshot.run.evidenceCoverageBasisPoints / 100,
  );
  const provisionalText = snapshot.run.provisional
    ? "The assessment is provisional because evidence coverage is incomplete."
    : "The score is not provisional under the configured evidence-coverage rule.";

  return {
    title: `${snapshot.website.displayName} Digital Visibility Audit`,
    executiveSummary: [
      `${scoreText}.`,
      `${provisionalText}`,
      `${highPriorityFindings.length} critical or high findings are listed for review.`,
      `${additionalFindings.length} additional findings are listed for review.`,
      `${unavailableChecks.length} checks were unavailable or errored and are disclosed rather than inferred.`,
      `Evidence coverage: ${coveragePercent}%.`,
    ].join(" "),
    methodologyVersion: snapshot.audit.scoringDefinitionVersion,
    reportData: {
      website: snapshot.website,
      overallScore: snapshot.run.overallScore,
      provisional: snapshot.run.provisional,
      evidenceCoverageBasisPoints: snapshot.run.evidenceCoverageBasisPoints,
      categoryScores: snapshot.categoryScores,
      highPriorityFindings,
      additionalFindings,
      unavailableChecks,
      methodology: {
        scoringDefinitionVersion: snapshot.audit.scoringDefinitionVersion,
        checkCatalogVersion: snapshot.audit.checkCatalogVersion,
        collectorVersion: snapshot.run.collectorVersion,
      },
    },
  };
}
