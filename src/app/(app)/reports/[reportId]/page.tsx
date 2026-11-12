import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { checkLabel, findingGuidance, hasReportableScore, isCategoryScoreWithheld, type BuiltAuditReport } from "@/domain/audits/report";
import { getReport } from "@/server/audits";
import { getWorkspaceShellContext } from "@/server/auth";

import { finalizeReportAction } from "../actions";
import {
  formatDate,
  PageHeader,
  Panel,
  StatusChip,
  statusTone,
} from "../../ui";

function percent(value: number) {
  return `${Math.round(value / 100)}%`;
}

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const shell = await getWorkspaceShellContext();
  const report = await getReport(shell.workspaceContext, reportId);

  if (!report) {
    notFound();
  }

  const data = report.reportData as BuiltAuditReport["reportData"];

  return (
    <>
      <PageHeader
        action={
          <Link className="mx-btn mx-btn-ghost" href="/reports">
            <ArrowLeft aria-hidden size={14} />
            Reports
          </Link>
        }
        eyebrow={`Report - ${formatDate(report.createdAt)}`}
        title={report.title}
      />
      <article className="mx-report">
        <Panel
          right={<StatusChip tone="info">{report.status}</StatusChip>}
          title="Executive summary"
        >
          <p>{hasReportableScore(data.overallScore, data.evidenceCoverageBasisPoints) ? report.executiveSummary : report.executiveSummary.replace(/Overall (?:deterministic )?score:\s*\d+(?:\/| out of )100\./, "An overall score is withheld because evidence is insufficient.")}</p>
          {report.status === "DRAFT" ? (
            <form action={finalizeReportAction} className="mx-action-inline">
              <input name="reportId" type="hidden" value={report.id} />
              <button className="mx-btn" type="submit">
                <CheckCircle2 aria-hidden size={14} />
                Finalize report
              </button>
            </form>
          ) : report.finalizedAt ? (
            <a className="mx-btn" href={`/api/reports/audit/${report.id}/download`}>
              Download finalized report
            </a>
          ) : null}
        </Panel>
        <div className="mx-spacer" />
        <div className="mx-grid mx-grid-2">
          <Panel title="Score and coverage">
            <div className="mx-score-block">
              <span className="mx-score">
                {hasReportableScore(data.overallScore, data.evidenceCoverageBasisPoints) ? data.overallScore : "No score"}
              </span>
              <div>
                <StatusChip tone={data.provisional ? "warn" : "good"}>
                  {data.provisional ? "Provisional" : "Final coverage"}
                </StatusChip>
                <div className="mx-method">
                  <span>Evidence coverage</span>
                  <span>{percent(data.evidenceCoverageBasisPoints)}</span>
                </div>
                <div className="mx-method">
                  <span>Scoring</span>
                  <span>{data.methodology.scoringDefinitionVersion}</span>
                </div>
                <div className="mx-method">
                  <span>Checks</span>
                  <span>{data.methodology.checkCatalogVersion}</span>
                </div>
              </div>
            </div>
          </Panel>
          <Panel title="Website">
            <div className="mx-method">
              <span>Name</span>
              <span>{data.website.displayName}</span>
            </div>
            <div className="mx-method">
              <span>URL</span>
              <span>{data.website.canonicalUrl}</span>
            </div>
            <div className="mx-method">
              <span>Domain</span>
              <span>{data.website.domain}</span>
            </div>
          </Panel>
        </div>
        <div className="mx-spacer" />
        <Panel title="Category scores">
          <div className="mx-grid mx-grid-3">
            {data.categoryScores.map((score) => (
              <div className="mx-mini-panel" key={score.category}>
                <span className="mx-eyebrow">{score.category}</span>
                <span className="mx-kpi-value">
                  {isCategoryScoreWithheld(score.category, score.score, score.lowCoverage, data.methodology.collectorVersion) ? "NA" : score.score}
                </span>
                <span className="mx-muted">
                  Coverage {percent(score.evidenceCoverageBasisPoints)}
                </span>
                {score.category === "aiReadiness" && isCategoryScoreWithheld(score.category, score.score, score.lowCoverage, data.methodology.collectorVersion) && <span className="mx-muted">AI score withheld: core checks are incomplete.</span>}
              </div>
            ))}
          </div>
        </Panel>
        <div className="mx-spacer" />
        <Panel title="High-priority findings">
          {data.highPriorityFindings.length > 0 ? (
            <div className="mx-list">
              {data.highPriorityFindings.map((finding) => (
                <div className="mx-check-row" key={finding.checkKey}>
                  <div>
                    <div className="mx-row-title">{findingGuidance(finding.checkKey)?.title ?? finding.title}</div>
                    <div className="mx-row-meta">{finding.summary}</div>
                    {findingGuidance(finding.checkKey) && <p>Next step: {findingGuidance(finding.checkKey)?.nextStep}</p>}
                  </div>
                  <StatusChip tone={finding.severity === "CRITICAL" ? "bad" : "warn"}>
                    {finding.severity}
                  </StatusChip>
                </div>
              ))}
            </div>
          ) : (
            <p className="mx-muted">No critical or high findings were stored.</p>
          )}
        </Panel>
        <div className="mx-spacer" />
        {data.additionalFindings && data.additionalFindings.length > 0 ? (
          <>
            <Panel title="Additional findings">
              <div className="mx-list">
                {data.additionalFindings.map((finding) => (
                  <div className="mx-check-row" key={finding.checkKey}>
                    <div>
                      <div className="mx-row-title">{findingGuidance(finding.checkKey)?.title ?? finding.title}</div>
                      <div className="mx-row-meta">{finding.summary}</div>
                      {findingGuidance(finding.checkKey) && <p>Next step: {findingGuidance(finding.checkKey)?.nextStep}</p>}
                    </div>
                    <StatusChip tone={finding.severity === "CRITICAL" ? "bad" : "warn"}>{finding.severity}</StatusChip>
                  </div>
                ))}
              </div>
            </Panel>
            <div className="mx-spacer" />
          </>
        ) : null}
        {data.passedChecks ? (
          <>
            <Panel title="What is working">
              {data.passedChecks.length > 0 ? (
                <div className="mx-list">
                  {data.passedChecks.map((check) => (
                    <div className="mx-check-row" key={check.checkKey}>
                      <div>
                        <div className="mx-row-title">{checkLabel(check.checkKey) ?? check.checkKey}</div>
                        <div className="mx-row-meta">{check.reason}</div>
                      </div>
                      <StatusChip tone="good">PASS</StatusChip>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mx-muted">No check passed.</p>
              )}
            </Panel>
            <div className="mx-spacer" />
          </>
        ) : null}
        <Panel title="Unavailable and errored checks">
          {data.unavailableChecks.length > 0 ? (
            <div className="mx-list">
              {data.unavailableChecks.map((check) => (
                <div className="mx-check-row" key={check.checkKey}>
                  <div>
                    <div className="mx-row-title">{check.checkKey}</div>
                    <div className="mx-row-meta">{check.reason}</div>
                  </div>
                  <StatusChip tone={statusTone(check.status)}>{check.status}</StatusChip>
                </div>
              ))}
            </div>
          ) : (
            <p className="mx-muted">No unavailable checks were stored.</p>
          )}
        </Panel>
      </article>
    </>
  );
}
