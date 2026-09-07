import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft, Bot, ClipboardList, Save, ShieldCheck } from "lucide-react";

import {
  opportunityStatuses,
  type ApprovalBlockedState,
  type ClientInputState,
  type DependencyState,
} from "@/domain/opportunities/generation";
import { getWorkspaceShellContext } from "@/server/auth";
import { getOpportunityPrepareState } from "@/server/agents";
import { getOpportunityDetail } from "@/server/opportunities";

import { requestPrepareDraftAction, updateOpportunityAction } from "../actions";
import {
  formatDate,
  PageHeader,
  Panel,
  StatusChip,
} from "../../ui";

const scaleValues = [0, 1, 2, 3, 4, 5] as const;
const effortValues = [1, 2, 3, 4, 5] as const;
const dependencyStates: DependencyState[] = ["NONE", "HARD_DEPENDENCY"];
const clientInputStates: ClientInputState[] = [
  "NOT_REQUIRED",
  "REQUIRED",
  "RECEIVED",
];
const approvalBlockedStates: ApprovalBlockedState[] = [
  "NOT_BLOCKED",
  "AWAITING_APPROVAL",
];

function bandTone(band: string) {
  if (band === "Immediate") return "bad";
  if (band === "High") return "warn";
  if (band === "Normal") return "good";
  return "neutral";
}

function planTone(scope: string) {
  if (scope === "INCLUDED") return "good";
  if (scope === "MAY_REQUIRE_ADD_ON") return "warn";
  return "info";
}

function statusTone(status: string) {
  if (status === "BLOCKED") return "warn";
  if (status === "COMPLETED") return "good";
  if (status === "DISMISSED" || status === "SUPERSEDED") return "neutral";
  return "info";
}

function runTone(status: string) {
  if (status === "SUCCEEDED") return "good";
  if (status === "FAILED" || status === "BUDGET_LIMITED") return "bad";
  if (status === "QUEUED" || status === "RUNNING") return "info";
  return "neutral";
}

function factorSelect(name: string, label: string, value: number) {
  return (
    <label>
      {label}
      <select className="mx-input" defaultValue={value} name={name}>
        {scaleValues.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;
  const shell = await getWorkspaceShellContext();
  const [detail, prepareState] = await Promise.all([
    getOpportunityDetail(shell.workspaceContext, opportunityId),
    getOpportunityPrepareState(shell.workspaceContext, opportunityId),
  ]);

  if (!detail) {
    notFound();
  }

  const opportunity = detail.opportunity;

  return (
    <>
      <PageHeader
        action={
          <div className="mx-top-actions">
            <StatusChip tone={statusTone(opportunity.status)}>
              {opportunity.status}
            </StatusChip>
            <Link className="mx-btn mx-btn-ghost" href={"/opportunities" as never}>
              <ArrowLeft aria-hidden size={14} />
              Opportunities
            </Link>
          </div>
        }
        eyebrow={`${detail.clientName} - ${detail.domain} - ${formatDate(opportunity.createdAt)}`}
        title={opportunity.title}
      />
      <div className="mx-grid mx-grid-2">
        <Panel
          right={
            <StatusChip tone={bandTone(opportunity.priorityBand)}>
              {opportunity.finalPriority} {opportunity.priorityBand}
            </StatusChip>
          }
          title="Priority explanation"
        >
          <div className="mx-method">
            <span>Definition</span>
            <span>{opportunity.priorityDefinitionVersion}</span>
          </div>
          <div className="mx-method">
            <span>Base priority</span>
            <span>{opportunity.basePriority}</span>
          </div>
          <div className="mx-method">
            <span>Plan fit</span>
            <span>{opportunity.planFit}/5</span>
          </div>
          <div className="mx-method">
            <span>Plan scope</span>
            <StatusChip tone={planTone(opportunity.planScope)}>
              {opportunity.planScope}
            </StatusChip>
          </div>
          <div className="mx-list">
            {opportunity.priorityReasons.map((reason) => (
              <div className="mx-row mx-row-static" key={reason}>
                <span className="mx-row-meta">{reason}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Source evidence">
          <div className="mx-method">
            <span>Audit</span>
            <Link href={`/audits/${opportunity.sourceAuditId}`}>
              {detail.auditTitle}
            </Link>
          </div>
          <div className="mx-method">
            <span>Check</span>
            <span>{opportunity.sourceCheckKey}</span>
          </div>
          <div className="mx-method">
            <span>Result</span>
            <span>{opportunity.sourceResultStatus}</span>
          </div>
          <div className="mx-method">
            <span>Severity</span>
            <span>{opportunity.sourceSeverity}</span>
          </div>
          <div className="mx-method">
            <span>Evidence confidence</span>
            <span>{opportunity.evidenceConfidence}</span>
          </div>
          <p className="mx-muted">{opportunity.summary}</p>
          {opportunity.sourceEvidenceRefs.length > 0 ? (
            <p className="mx-evidence-refs">
              Evidence refs: {opportunity.sourceEvidenceRefs.join(", ")}
            </p>
          ) : null}
        </Panel>
      </div>
      <div className="mx-spacer" />
      <Panel
        right={
          prepareState.approval ? (
            <StatusChip tone={statusTone(prepareState.approval.status)}>
              {prepareState.approval.status}
            </StatusChip>
          ) : prepareState.run ? (
            <StatusChip tone={runTone(prepareState.run.status)}>
              {prepareState.run.status}
            </StatusChip>
          ) : (
            <StatusChip tone="neutral">No draft</StatusChip>
          )
        }
        title="Governed PREPARE"
      >
        <div className="mx-grid mx-grid-2">
          <div className="mx-safety-lock">
            <ShieldCheck aria-hidden size={16} />
            <span>
              PREPARE can create an internal draft and approval request only. It
              cannot publish, email, edit a website, or execute externally.
            </span>
          </div>
          <div className="mx-action-stack">
            {prepareState.run ? (
              <Link
                className="mx-btn mx-btn-ghost"
                href={`/runs/${prepareState.run.id}` as never}
              >
                <Bot aria-hidden size={14} />
                Inspect run
              </Link>
            ) : null}
            {prepareState.artifact ? (
              <Link
                className="mx-btn mx-btn-ghost"
                href={`/drafts/${prepareState.artifact.id}` as never}
              >
                <ClipboardList aria-hidden size={14} />
                Review draft
              </Link>
            ) : null}
            {prepareState.approval ? (
              <Link
                className="mx-btn mx-btn-ghost"
                href={`/approvals/${prepareState.approval.id}` as never}
              >
                <ShieldCheck aria-hidden size={14} />
                Open approval
              </Link>
            ) : null}
            {!prepareState.approval ||
            prepareState.approval.status !== "PENDING" ? (
              <form action={requestPrepareDraftAction}>
                <input name="opportunityId" type="hidden" value={opportunity.id} />
                <button className="mx-btn" type="submit">
                  <Bot aria-hidden size={14} />
                  Prepare draft
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </Panel>
      <div className="mx-spacer" />
      <Panel title="Operational update">
        <form action={updateOpportunityAction} className="mx-form">
          <input name="opportunityId" type="hidden" value={opportunity.id} />
          <label className="mx-form-wide">
            Title
            <input
              className="mx-input"
              defaultValue={opportunity.title}
              name="title"
              required
              type="text"
            />
          </label>
          <label className="mx-form-wide">
            Summary
            <textarea
              className="mx-input"
              defaultValue={opportunity.summary}
              name="summary"
              required
              rows={4}
            />
          </label>
          <label>
            Status
            <select className="mx-input" defaultValue={opportunity.status} name="status">
              {opportunityStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Owner
            <select
              className="mx-input"
              defaultValue={opportunity.ownerUserId ?? "UNASSIGNED"}
              name="ownerUserId"
            >
              <option value="UNASSIGNED">Unassigned</option>
              <option value={shell.user.id}>Assign to me</option>
            </select>
          </label>
          {factorSelect("impact", "Impact", opportunity.impact)}
          {factorSelect("confidence", "Confidence", opportunity.confidence)}
          {factorSelect("urgency", "Urgency", opportunity.urgency)}
          {factorSelect("strategicFit", "Strategic fit", opportunity.strategicFit)}
          {factorSelect("planFit", "Plan fit", opportunity.planFit)}
          {factorSelect("staleness", "Staleness", opportunity.staleness)}
          <label>
            Effort
            <select className="mx-input" defaultValue={opportunity.effort} name="effort">
              {effortValues.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Dependency
            <select
              className="mx-input"
              defaultValue={opportunity.dependencyState}
              name="dependencyState"
            >
              {dependencyStates.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>
          <label>
            Client input
            <select
              className="mx-input"
              defaultValue={opportunity.clientInputState}
              name="clientInputState"
            >
              {clientInputStates.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>
          <label>
            Approval state
            <select
              className="mx-input"
              defaultValue={opportunity.approvalBlockedState}
              name="approvalBlockedState"
            >
              {approvalBlockedStates.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>
          <button className="mx-btn mx-form-wide" type="submit">
            <Save aria-hidden size={14} />
            Save and recalculate
          </button>
        </form>
      </Panel>
      <div className="mx-spacer" />
      <Panel title="Next internal action">
        <div className="mx-safety-lock">
          <ClipboardList aria-hidden size={16} />
          <span>{opportunity.recommendedAction}</span>
        </div>
        <p className="mx-muted">
          This remains internal planning and human-approved PREPARE work only.
          No external EXECUTE behavior is present in Phase 3.
        </p>
      </Panel>
    </>
  );
}
