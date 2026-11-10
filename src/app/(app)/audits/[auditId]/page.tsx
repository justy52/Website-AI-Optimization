import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft, FileText, Lock } from "lucide-react";

import { scoreCategoryKeys } from "@/domain/audits/scoring";
import { canFinalizeAudit, hasReportableScore } from "@/domain/audits/report";
import { canManageWorkspace } from "@/domain/tenancy/context";
import { getAuditDetail } from "@/server/audits";
import { getWorkspaceShellContext } from "@/server/auth";

import { closeStaleAuditRunAction, createReportAction, finalizeAuditAction } from "../actions";
import {
  formatDate,
  PageHeader,
  Panel,
  StatusChip,
  statusTone,
} from "../../ui";

function percentFromBasisPoints(value: number | null | undefined) {
  return `${Math.round((value ?? 0) / 100)}%`;
}

export default async function AuditDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ auditId: string }>;
  searchParams: Promise<{ recovery?: string }>;
}) {
  const [{ auditId }, { recovery }] = await Promise.all([params, searchParams]);
  const shell = await getWorkspaceShellContext();
  const detail = await getAuditDetail(shell.workspaceContext, auditId);

  if (!detail?.audit || !detail.website) {
    notFound();
  }

  const run = detail.run;
  const checksByCategory = new Map(
    scoreCategoryKeys.map((category) => [
      category,
      detail.checks.filter((check) => check.category === category),
    ]),
  );
  const scoreByCategory = new Map(
    detail.scores.map((score) => [score.category, score]),
  );

  return (
    <>
      <PageHeader
        action={
          <Link className="mx-btn mx-btn-ghost" href="/audits">
            <ArrowLeft aria-hidden size={14} />
            Audits
          </Link>
        }
        eyebrow={`${detail.website.domain} - ${formatDate(detail.audit.createdAt)}`}
        title={detail.audit.title}
      />
      <div className="mx-grid mx-grid-2">
        <Panel
          right={<StatusChip tone="info">{detail.audit.status}</StatusChip>}
          title="Run state"
        >
          <div className="mx-score-block">
            <span className="mx-score">
              {hasReportableScore(run?.overallScore, run?.evidenceCoverageBasisPoints) ? run?.overallScore : "No score"}
            </span>
            <div>
              <div className="mx-method">
                <span>Run</span>
                <span>{run?.status ?? "Not started"}</span>
              </div>
              <div className="mx-method">
                <span>Coverage</span>
                <span>{percentFromBasisPoints(run?.evidenceCoverageBasisPoints)}</span>
              </div>
              <div className="mx-method">
                <span>Scoring</span>
                <span>{detail.audit.scoringDefinitionVersion}</span>
              </div>
              {!run ? null : run.provisional ? (
                <StatusChip tone="warn">Provisional</StatusChip>
              ) : (
                <StatusChip tone="good">Complete coverage</StatusChip>
              )}
            </div>
          </div>
          {recovery === "unavailable" ? <p role="alert">The run could not be closed. Review its current status and try again if it is eligible.</p> : null}
          {run?.status === "CANCELED" && run.errorSummary ? <p>{run.errorSummary}</p> : null}
          {run && detail.canCloseStaleRun && canManageWorkspace(shell.workspaceContext) ? (
            <form action={closeStaleAuditRunAction} className="mx-action-stack">
              <p>This manual audit has been running for at least 15 minutes. Closing it preserves its history and releases its audit slot.</p>
              <input name="auditId" type="hidden" value={auditId} />
              <input name="runId" type="hidden" value={run.id} />
              <label className="mx-label">
                Reason for closing
                <input className="mx-input" name="reason" required maxLength={500} />
              </label>
              <button className="mx-btn" type="submit">Close stale audit run</button>
            </form>
          ) : null}
        </Panel>
        <Panel title="Finalize and report">
          {detail.snapshot ? (
            <div className="mx-action-stack">
              <div className="mx-safety-lock">
                <Lock aria-hidden size={16} />
                <span>Audit snapshot finalized.</span>
              </div>
              {detail.report ? (
                <Link className="mx-btn" href={`/reports/${detail.report.id}`}>
                  <FileText aria-hidden size={14} />
                  Open report
                </Link>
              ) : (
                <form action={createReportAction}>
                  <input name="auditId" type="hidden" value={detail.audit.id} />
                  <button className="mx-btn" type="submit">
                    <FileText aria-hidden size={14} />
                    Create report
                  </button>
                </form>
              )}
            </div>
          ) : (
            <form action={finalizeAuditAction} className="mx-action-stack">
              <input name="auditId" type="hidden" value={detail.audit.id} />
              <button className="mx-btn" disabled={!run || !canFinalizeAudit(detail.audit.status, run.status)} type="submit">
                <Lock aria-hidden size={14} />
                Finalize audit snapshot
              </button>
              <p className="mx-muted">
                Finalization stores an immutable snapshot for reproducible
                reports.
              </p>
            </form>
          )}
        </Panel>
      </div>
      <div className="mx-spacer" />
      <Panel title="Category scores">
        <div className="mx-grid mx-grid-3">
          {scoreCategoryKeys.map((category) => {
            const score = scoreByCategory.get(category);

            return (
              <div className="mx-mini-panel" key={category}>
                <span className="mx-eyebrow">{category}</span>
                <span className="mx-kpi-value">
                  {category === "aiReadiness" || score?.score === null || score?.score === undefined || score.lowCoverage
                    ? "NA"
                    : score.score}
                </span>
                <span className="mx-muted">
                  Coverage {percentFromBasisPoints(score?.evidenceCoverageBasisPoints)}
                </span>
                {category === "aiReadiness" && <span className="mx-muted">AI score withheld: core checks are incomplete.</span>}
              </div>
            );
          })}
        </div>
      </Panel>
      <div className="mx-spacer" />
      {scoreCategoryKeys.map((category) => (
        <Panel key={category} title={category}>
          <div className="mx-list">
            {(checksByCategory.get(category) ?? []).map((check) => (
              <div className="mx-check-row" key={check.id}>
                <div>
                  <div className="mx-row-title">{check.checkKey}</div>
                  <div className="mx-row-meta">{check.reason}</div>
                  {check.evidenceRefs.length > 0 ? (
                    <div className="mx-evidence-refs">
                      Evidence: {check.evidenceRefs.join(", ")}
                    </div>
                  ) : null}
                </div>
                <StatusChip tone={statusTone(check.status)}>{check.status}</StatusChip>
              </div>
            ))}
          </div>
        </Panel>
      ))}
    </>
  );
}
