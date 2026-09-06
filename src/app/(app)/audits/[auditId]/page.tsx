import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft, FileText, Lock } from "lucide-react";

import { scoreCategoryKeys } from "@/domain/audits/scoring";
import { getAuditDetail } from "@/server/audits";
import { getWorkspaceShellContext } from "@/server/auth";

import { createReportAction, finalizeAuditAction } from "../actions";
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
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;
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
              {run?.overallScore === null || run?.overallScore === undefined
                ? "No score"
                : run.overallScore}
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
              {run?.provisional ? (
                <StatusChip tone="warn">Provisional</StatusChip>
              ) : (
                <StatusChip tone="good">Complete coverage</StatusChip>
              )}
            </div>
          </div>
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
              <button className="mx-btn" disabled={!run} type="submit">
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
                  {score?.score === null || score?.score === undefined
                    ? "NA"
                    : score.score}
                </span>
                <span className="mx-muted">
                  Coverage {percentFromBasisPoints(score?.evidenceCoverageBasisPoints)}
                </span>
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
