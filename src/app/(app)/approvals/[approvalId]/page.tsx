import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";

import { getWorkspaceShellContext } from "@/server/auth";
import { getApprovalRequestDetail } from "@/server/agents";

import { decideApprovalRequestAction } from "../actions";
import { formatDate, PageHeader, Panel, StatusChip } from "../../ui";

function statusTone(status: string) {
  if (status === "APPROVED") return "good";
  if (status === "PENDING" || status === "CHANGES_REQUESTED") return "warn";
  if (status === "REJECTED") return "bad";
  return "neutral";
}

function titleFromSummary(summary: unknown) {
  if (
    summary &&
    typeof summary === "object" &&
    "title" in summary &&
    typeof summary.title === "string"
  ) {
    return summary.title;
  }

  return "Draft artifact review";
}

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export default async function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ approvalId: string }>;
}) {
  const { approvalId } = await params;
  const shell = await getWorkspaceShellContext();
  const detail = await getApprovalRequestDetail(shell.workspaceContext, approvalId);

  if (!detail) {
    notFound();
  }

  const canDecide = ["OWNER", "ADMIN"].includes(shell.currentWorkspace.role);

  return (
    <>
      <PageHeader
        action={
          <Link className="mx-btn mx-btn-ghost" href={"/approvals" as never}>
            <ArrowLeft aria-hidden size={14} />
            Approvals
          </Link>
        }
        eyebrow={`${detail.clientName ?? "Client"} - ${
          detail.websiteName ?? "Website"
        } - requested ${formatDate(detail.approval.requestedAt)}`}
        title={titleFromSummary(detail.approval.immutableSummary)}
      />
      <div className="mx-grid mx-grid-2">
        <Panel
          right={
            <StatusChip tone={statusTone(detail.approval.status)}>
              {detail.approval.status}
            </StatusChip>
          }
          title="Approval target"
        >
          <div className="mx-method">
            <span>Artifact</span>
            <Link href={`/drafts/${detail.artifact.id}` as never}>
              {detail.artifact.artifactType}
            </Link>
          </div>
          <div className="mx-method">
            <span>Version</span>
            <span>{detail.approval.targetArtifactVersion}</span>
          </div>
          <div className="mx-method">
            <span>Risk</span>
            <span>{detail.approval.riskLevel}</span>
          </div>
          <div className="mx-method">
            <span>Prepared by</span>
            <Link href={`/runs/${detail.run?.id}` as never}>
              {detail.run?.agentKey ?? "Agent run"}
            </Link>
          </div>
          <div className="mx-safety-lock">
            <ShieldCheck aria-hidden size={16} />
            <span>
              Approval is for this internal draft version only. It does not
              publish, email, edit a website, or call an EXECUTE tool.
            </span>
          </div>
        </Panel>
        <Panel title="Immutable approval summary">
          <pre className="mx-report">{json(detail.approval.immutableSummary)}</pre>
        </Panel>
      </div>
      <div className="mx-spacer" />
      <Panel title="Draft preview">
        <pre className="mx-report">{detail.artifact.renderedPreview}</pre>
      </Panel>
      <div className="mx-spacer" />
      <Panel title="Decision">
        {detail.approval.status === "PENDING" && canDecide ? (
          <form action={decideApprovalRequestAction} className="mx-form">
            <input name="approvalId" type="hidden" value={detail.approval.id} />
            <label>
              Decision
              <select className="mx-input" name="decision">
                <option value="APPROVED_UNCHANGED">Approve unchanged</option>
                <option value="APPROVED_MINOR_EDIT">Approve after minor edit</option>
                <option value="APPROVED_MAJOR_EDIT">Approve after major edit</option>
                <option value="CHANGES_REQUESTED">Request changes</option>
                <option value="REJECTED">Reject</option>
              </select>
            </label>
            <label>
              Reason category
              <input
                className="mx-input"
                name="reasonCategory"
                placeholder="factual_basis, risk, scope, quality"
                type="text"
              />
            </label>
            <label className="mx-form-wide">
              Comments
              <textarea className="mx-input" name="comments" rows={4} />
            </label>
            <button className="mx-btn mx-form-wide" type="submit">
              <CheckCircle2 aria-hidden size={14} />
              Record human decision
            </button>
          </form>
        ) : (
          <div className="mx-list">
            <div className="mx-row mx-row-static">
              <span className="mx-row-title">
                {detail.approval.status === "PENDING"
                  ? "Owner or Admin approval required"
                  : detail.approval.decision}
              </span>
              <span className="mx-row-meta">
                {detail.approval.decisionComments ??
                  "The approval record is stored with its exact target version."}
              </span>
            </div>
          </div>
        )}
      </Panel>
    </>
  );
}
