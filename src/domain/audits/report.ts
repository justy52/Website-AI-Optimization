import type { CheckStatus, ScoreCategoryKey } from "./scoring";
import type { EvidenceConfidence } from "@/domain/opportunities/generation";

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
  const unavailableChecks = snapshot.checkResults.filter(
    (check) => check.status === "UNAVAILABLE" || check.status === "ERROR",
  );
  const scoreText =
    snapshot.run.overallScore === null
      ? "No overall score is available"
      : `Overall deterministic score: ${snapshot.run.overallScore}/100`;
  const coveragePercent = Math.round(
    snapshot.run.evidenceCoverageBasisPoints / 100,
  );
  const provisionalText = snapshot.run.provisional
    ? "The score is provisional because evidence coverage is incomplete."
    : "The score is not provisional under the configured evidence-coverage rule.";

  return {
    title: `${snapshot.website.displayName} Digital Visibility Audit`,
    executiveSummary: [
      `${scoreText}.`,
      `${provisionalText}`,
      `${highPriorityFindings.length} critical or high findings are listed for review.`,
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
      unavailableChecks,
      methodology: {
        scoringDefinitionVersion: snapshot.audit.scoringDefinitionVersion,
        checkCatalogVersion: snapshot.audit.checkCatalogVersion,
        collectorVersion: snapshot.run.collectorVersion,
      },
    },
  };
}
