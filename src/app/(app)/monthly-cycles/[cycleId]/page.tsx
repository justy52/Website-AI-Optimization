import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  PlusCircle,
  RotateCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import type { MonthlyEntitlementSnapshot } from "@/domain/monthly-cycles/entitlements";
import { getMonthlyCycleDetail } from "@/server/monthly-cycles";
import { getWorkspaceShellContext } from "@/server/auth";

import {
  addOpportunityToMonthlyCycleAction,
  closeMonthlyCycleAction,
  finalizeMonthlyReportAction,
  generateMonthlyReportDraftAction,
  recordImplementationVerificationAction,
  recordManualImplementationAction,
  removeOpportunityFromMonthlyCycleAction,
  requestMonthlyPrepareDraftAction,
  selectMonthlyCycleWorkAction,
  updateMonthlyDeliverableStatusAction,
  waiveMonthlyDeliverableAction,
} from "../actions";
import {
  EmptyState,
  formatDate,
  PageHeader,
  Panel,
  StatusChip,
} from "../../ui";

function cycleLabel(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function tone(status: string) {
  if (
    status === "COMPLETE" ||
    status === "VERIFIED" ||
    status === "CLOSED" ||
    status === "FINALIZED"
  ) {
    return "good";
  }

  if (
    status === "BLOCKED" ||
    status === "UNAVAILABLE" ||
    status === "REVIEW_REQUIRED" ||
    status === "VERIFICATION_WARNING"
  ) {
    return "warn";
  }

  if (status === "VERIFICATION_FAILED") return "bad";
  if (status === "WAIVED" || status === "REMOVED" || status === "NOT_APPLICABLE") {
    return "neutral";
  }

  return "info";
}

function usedLimit(used: number, limit: number | null) {
  return limit === null ? `${used} / custom` : `${used} / ${limit}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function limitationText(limitations: Record<string, unknown>) {
  const entries = Object.entries(limitations);
  if (entries.length === 0) return "No limitations recorded";
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(" | ");
}

export default async function MonthlyCycleDetailPage({
  params,
}: {
  params: Promise<{ cycleId: string }>;
}) {
  const { cycleId } = await params;
  const shell = await getWorkspaceShellContext();
  const detail = await getMonthlyCycleDetail(shell.workspaceContext, cycleId);

  if (!detail) {
    notFound();
  }

  const { cycle } = detail;
  const snapshot = cycle.entitlementSnapshot as MonthlyEntitlementSnapshot;
  const activeWorkIds = new Set(
    detail.workItems
      .filter((row) => row.item.status !== "REMOVED")
      .map((row) => row.item.opportunityId),
  );
  const addableOpportunities = detail.sortedEligibleOpportunities.filter(
    (opportunity) => !activeWorkIds.has(opportunity.id),
  );
  const reportSections = detail.report?.sections as
    | Record<string, unknown>
    | undefined;

  return (
    <>
      <PageHeader
        action={
          <div className="mx-top-actions">
            <StatusChip tone={tone(cycle.status)}>{cycle.status}</StatusChip>
            <Link className="mx-btn mx-btn-ghost" href={"/monthly-cycles" as never}>
              <ArrowLeft aria-hidden size={14} />
              Monthly Cycles
            </Link>
          </div>
        }
        eyebrow={`${detail.clientName} - ${cycleLabel(cycle.cycleYear, cycle.cycleMonth)}`}
        title="Monthly Fulfillment Cycle"
      />
      <div className="mx-grid mx-grid-3">
        <Panel title="Plan snapshot">
          <div className="mx-method">
            <span>Plan</span>
            <span>{snapshot.label}</span>
          </div>
          <div className="mx-method">
            <span>Version</span>
            <span>{snapshot.servicePlanDefinitionVersion}</span>
          </div>
          <div className="mx-method">
            <span>Period</span>
            <span>
              {cycle.periodStartDate} to {cycle.periodEndDate}
            </span>
          </div>
          <div className="mx-method">
            <span>Timezone</span>
            <span>{cycle.timezone}</span>
          </div>
        </Panel>
        <Panel title="Usage">
          <div className="mx-method">
            <span>Manual minutes</span>
            <span>
              {usedLimit(
                cycle.manualImplementationMinutes,
                snapshot.limits.manualImplementationMinutes,
              )}
            </span>
          </div>
          <div className="mx-method">
            <span>Page optimizations</span>
            <span>
              {usedLimit(
                cycle.existingPageOptimizationsCompleted,
                snapshot.limits.existingPageOptimizations,
              )}
            </span>
          </div>
          <div className="mx-method">
            <span>Content assets</span>
            <span>
              {usedLimit(
                cycle.majorContentAssetsCompleted,
                snapshot.limits.majorContentAssets,
              )}
            </span>
          </div>
          <div className="mx-method">
            <span>AI observations used</span>
            <span>{cycle.aiVisibilityObservationsUsed}</span>
          </div>
        </Panel>
        <Panel title="Monitoring context">
          <div className="mx-method">
            <span>Website</span>
            <span>{detail.websiteName ?? "No primary website"}</span>
          </div>
          <div className="mx-method">
            <span>Domain</span>
            <span>{detail.websiteDomain ?? "Not set"}</span>
          </div>
          <div className="mx-method">
            <span>Website Health runs</span>
            <span>{detail.monitoringSummary.websiteHealthRuns}</span>
          </div>
          <div className="mx-method">
            <span>Search Console</span>
            <span>
              {detail.monitoringSummary.searchConsoleConnected
                ? `${detail.monitoringSummary.searchConsoleRuns} runs`
                : "BLOCKED / SEARCH CONSOLE NOT CONNECTED"}
            </span>
          </div>
          <div className="mx-method">
            <span>Competitor observations</span>
            <span>{detail.monitoringSummary.competitorObservations}</span>
          </div>
          <div className="mx-method">
            <span>AI-readiness rechecks</span>
            <span>{detail.monitoringSummary.aiReadinessRechecks}</span>
          </div>
          <div className="mx-method">
            <span>Failures</span>
            <span>{detail.monitoringSummary.failures}</span>
          </div>
          <div className="mx-method">
            <span>New Opportunities</span>
            <span>{detail.monitoringSummary.newOpportunities}</span>
          </div>
        </Panel>
      </div>
      <div className="mx-spacer" />
      <Panel
        right={
          <form action={selectMonthlyCycleWorkAction}>
            <input name="monthlyCycleId" type="hidden" value={cycle.id} />
            <button className="mx-btn mx-btn-ghost" type="submit">
              <RotateCw aria-hidden size={14} />
              Refresh selection
            </button>
          </form>
        }
        title="Contractual deliverables"
      >
        {detail.deliverables.length > 0 ? (
          <div className="mx-list">
            {detail.deliverables.map((deliverable) => (
              <div className="mx-check-row" key={deliverable.id}>
                <div>
                  <div className="mx-row-title">{deliverable.title}</div>
                  <div className="mx-row-meta">
                    {deliverable.entitlementSourceRule} -{" "}
                    {deliverable.completedCount}/{deliverable.targetCount}
                  </div>
                  <div className="mx-row-meta">
                    {limitationText(deliverable.limitations)}
                  </div>
                  {deliverable.waiverReason ? (
                    <div className="mx-row-meta">
                      Waiver: {deliverable.waiverReason}
                    </div>
                  ) : null}
                </div>
                <div className="mx-action-stack">
                  <StatusChip tone={tone(deliverable.status)}>
                    {deliverable.status}
                  </StatusChip>
                  {deliverable.status !== "WAIVED" ? (
                    <form
                      action={updateMonthlyDeliverableStatusAction}
                      className="mx-form"
                    >
                      <input name="monthlyCycleId" type="hidden" value={cycle.id} />
                      <input
                        name="deliverableId"
                        type="hidden"
                        value={deliverable.id}
                      />
                      <label>
                        Status
                        <select
                          className="mx-input"
                          defaultValue={deliverable.status}
                          name="status"
                        >
                          <option value="NOT_STARTED">NOT_STARTED</option>
                          <option value="IN_PROGRESS">IN_PROGRESS</option>
                          <option value="BLOCKED">BLOCKED</option>
                          <option value="READY_FOR_REVIEW">
                            READY_FOR_REVIEW
                          </option>
                          <option value="COMPLETE">COMPLETE</option>
                          <option value="UNAVAILABLE">UNAVAILABLE</option>
                          <option value="NOT_APPLICABLE">NOT_APPLICABLE</option>
                        </select>
                      </label>
                      <label>
                        Completed
                        <input
                          className="mx-input"
                          defaultValue={deliverable.completedCount}
                          min={0}
                          name="completedCount"
                          type="number"
                        />
                      </label>
                      <label className="mx-form-wide">
                        Evidence
                        <input
                          className="mx-input"
                          name="completionEvidence"
                          type="text"
                        />
                      </label>
                      <label className="mx-form-wide">
                        Limitations
                        <input className="mx-input" name="limitations" type="text" />
                      </label>
                      <button className="mx-btn mx-btn-ghost mx-form-wide" type="submit">
                        <ClipboardCheck aria-hidden size={14} />
                        Update
                      </button>
                    </form>
                  ) : null}
                  {deliverable.status !== "COMPLETE" &&
                  deliverable.status !== "WAIVED" ? (
                    <form action={waiveMonthlyDeliverableAction} className="mx-form">
                      <input name="monthlyCycleId" type="hidden" value={cycle.id} />
                      <input name="deliverableId" type="hidden" value={deliverable.id} />
                      <input
                        className="mx-input"
                        name="reason"
                        placeholder="Waiver reason"
                        required
                        type="text"
                      />
                      <button className="mx-btn mx-btn-ghost" type="submit">
                        <ShieldCheck aria-hidden size={14} />
                        Waive
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>No recurring deliverables were created for this cycle.</EmptyState>
        )}
      </Panel>
      <div className="mx-spacer" />
      <Panel title="Add eligible Opportunity">
        {addableOpportunities.length > 0 ? (
          <form action={addOpportunityToMonthlyCycleAction} className="mx-form">
            <input name="monthlyCycleId" type="hidden" value={cycle.id} />
            <label>
              Opportunity
              <select className="mx-input" name="opportunityId" required>
                {addableOpportunities.map((opportunity) => (
                  <option key={opportunity.id} value={opportunity.id}>
                    {opportunity.finalPriority} {opportunity.priorityBand} -{" "}
                    {opportunity.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="mx-form-wide">
              Override reason
              <input className="mx-input" name="reason" required type="text" />
            </label>
            <button className="mx-btn mx-form-wide" type="submit">
              <PlusCircle aria-hidden size={14} />
              Add to cycle
            </button>
          </form>
        ) : (
          <EmptyState>No additional open Opportunities are eligible right now.</EmptyState>
        )}
      </Panel>
      <div className="mx-spacer" />
      <Panel title="Cycle work queue">
        {detail.workItems.length > 0 ? (
          <div className="mx-list">
            {detail.workItems.map((row) => (
              <div className="mx-check-row" key={row.item.id}>
                <div>
                  <Link
                    className="mx-row-title"
                    href={`/opportunities/${row.item.opportunityId}`}
                  >
                    {row.opportunityTitle}
                  </Link>
                  <div className="mx-row-meta">{row.opportunitySummary}</div>
                  <div className="mx-action-inline">
                    <StatusChip tone={tone(row.item.status)}>
                      {row.item.status}
                    </StatusChip>
                    <StatusChip tone={tone(row.item.completionState)}>
                      {row.item.completionState}
                    </StatusChip>
                    <StatusChip tone="info">
                      {row.finalPriority} {row.priorityBand}
                    </StatusChip>
                    <StatusChip tone={row.item.consumesEntitlement ? "good" : "neutral"}>
                      {row.item.consumesEntitlement
                        ? row.item.entitlementType
                        : "no included entitlement"}
                    </StatusChip>
                  </div>
                  <div className="mx-row-meta">
                    Selected: {row.item.selectedReason}
                    {row.item.contractualDeliverableReason
                      ? ` - ${row.item.contractualDeliverableReason}`
                      : ""}
                  </div>
                  <div className="mx-row-meta">
                    Draft {row.item.draftState} - Approval {row.item.approvalState} -
                    Manual {row.item.manualImplementationMinutes} min
                  </div>
                  <div className="mx-evidence-refs">
                    Evidence refs: {row.sourceEvidenceRefs.join(", ") || "None"}
                  </div>
                </div>
                <div className="mx-action-stack">
                  {row.item.status !== "REMOVED" ? (
                    <>
                      <form action={requestMonthlyPrepareDraftAction}>
                        <input name="monthlyCycleId" type="hidden" value={cycle.id} />
                        <input
                          name="opportunityId"
                          type="hidden"
                          value={row.item.opportunityId}
                        />
                        <button className="mx-btn" type="submit">
                          <Bot aria-hidden size={14} />
                          Prepare draft
                        </button>
                      </form>
                      <form action={recordManualImplementationAction} className="mx-form">
                        <input name="monthlyCycleId" type="hidden" value={cycle.id} />
                        <input
                          name="cycleWorkItemId"
                          type="hidden"
                          value={row.item.id}
                        />
                        <label>
                          Implemented date
                          <input
                            className="mx-input"
                            defaultValue={today()}
                            name="implementationDate"
                            required
                            type="date"
                          />
                        </label>
                        <label>
                          Manual minutes
                          <input
                            className="mx-input"
                            min={0}
                            name="manualMinutes"
                            required
                            type="number"
                          />
                        </label>
                        <label className="mx-form-wide">
                          What changed
                          <input
                            className="mx-input"
                            name="whatImplemented"
                            required
                            type="text"
                          />
                        </label>
                        <label className="mx-form-wide">
                          Evidence/reference
                          <input className="mx-input" name="evidenceReference" type="text" />
                        </label>
                        <label className="mx-form-wide">
                          Notes
                          <textarea
                            className="mx-input"
                            name="implementationNotes"
                            rows={2}
                          />
                        </label>
                        <button className="mx-btn mx-form-wide" type="submit">
                          <ClipboardCheck aria-hidden size={14} />
                          Record manual implementation
                        </button>
                      </form>
                      <form
                        action={recordImplementationVerificationAction}
                        className="mx-form"
                      >
                        <input name="monthlyCycleId" type="hidden" value={cycle.id} />
                        <input
                          name="cycleWorkItemId"
                          type="hidden"
                          value={row.item.id}
                        />
                        <label>
                          Verification state
                          <select className="mx-input" name="status">
                            <option value="VERIFIED">VERIFIED</option>
                            <option value="VERIFICATION_WARNING">
                              VERIFICATION_WARNING
                            </option>
                            <option value="VERIFICATION_FAILED">
                              VERIFICATION_FAILED
                            </option>
                          </select>
                        </label>
                        <label>
                          Method
                          <input
                            className="mx-input"
                            defaultValue="human verification"
                            name="verificationMethod"
                            required
                            type="text"
                          />
                        </label>
                        <label className="mx-form-wide">
                          Evidence
                          <input className="mx-input" name="evidence" required type="text" />
                        </label>
                        <label className="mx-form-wide">
                          Limitations
                          <input className="mx-input" name="limitations" type="text" />
                        </label>
                        <button className="mx-btn mx-form-wide" type="submit">
                          <CheckCircle2 aria-hidden size={14} />
                          Record verification
                        </button>
                      </form>
                      <form action={removeOpportunityFromMonthlyCycleAction} className="mx-form">
                        <input name="monthlyCycleId" type="hidden" value={cycle.id} />
                        <input
                          name="cycleWorkItemId"
                          type="hidden"
                          value={row.item.id}
                        />
                        <input
                          className="mx-input"
                          name="reason"
                          placeholder="Removal reason"
                          required
                          type="text"
                        />
                        <button className="mx-btn mx-btn-ghost" type="submit">
                          <XCircle aria-hidden size={14} />
                          Remove
                        </button>
                      </form>
                    </>
                  ) : (
                    <StatusChip tone="neutral">Removed from cycle</StatusChip>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>
            No work has been selected for this cycle.
          </EmptyState>
        )}
      </Panel>
      <div className="mx-spacer" />
      <Panel
        right={
          detail.report ? <StatusChip tone={tone(detail.report.status)}>{detail.report.status}</StatusChip> : null
        }
        title="Monthly report"
      >
        {detail.report ? (
          <div className="mx-list">
            <div className="mx-row mx-row-static">
              <div className="mx-row-main">
                <span className="mx-row-title">{detail.report.title}</span>
                <span className="mx-row-meta">
                  {detail.report.methodologyVersion} - created{" "}
                  {formatDate(detail.report.createdAt)}
                </span>
                <span className="mx-row-meta">{detail.report.executiveSummary}</span>
              </div>
            </div>
            <div className="mx-grid mx-grid-3">
              <div className="mx-mini-panel">
                <span className="mx-eyebrow">Sections</span>
                <span className="mx-kpi-value">
                  {reportSections ? Object.keys(reportSections).length : 0}
                </span>
              </div>
              <div className="mx-mini-panel">
                <span className="mx-eyebrow">Limitations</span>
                <span className="mx-kpi-value">
                  {detail.report.dataLimitations.length}
                </span>
              </div>
              <div className="mx-mini-panel">
                <span className="mx-eyebrow">Snapshot</span>
                <span className="mx-muted">
                  {detail.report.snapshotHash ?? "Draft mutable"}
                </span>
              </div>
            </div>
            {detail.report.status === "DRAFT" ? (
              <form action={finalizeMonthlyReportAction} className="mx-action-inline">
                <input name="monthlyCycleId" type="hidden" value={cycle.id} />
                <input
                  name="monthlyReportId"
                  type="hidden"
                  value={detail.report.id}
                />
                <button className="mx-btn" type="submit">
                  <ShieldCheck aria-hidden size={14} />
                  Finalize report
                </button>
              </form>
            ) : null}
          </div>
        ) : (
          <EmptyState>No monthly report draft exists for this cycle.</EmptyState>
        )}
        <form action={generateMonthlyReportDraftAction} className="mx-action-inline">
          <input name="monthlyCycleId" type="hidden" value={cycle.id} />
          <button className="mx-btn mx-btn-ghost" type="submit">
            <FileText aria-hidden size={14} />
            Generate draft
          </button>
        </form>
      </Panel>
      <div className="mx-spacer" />
      <Panel title="Close gate">
        <div className="mx-safety-lock">
          <ShieldCheck aria-hidden size={16} />
          <span>
            Closing requires tracked deliverables to be complete, unavailable,
            not applicable, or waived, plus a finalized human-reviewed monthly
            report. Open unresolved Opportunities carry forward; no external
            EXECUTE path exists here.
          </span>
        </div>
        <form action={closeMonthlyCycleAction} className="mx-action-inline">
          <input name="monthlyCycleId" type="hidden" value={cycle.id} />
          <button className="mx-btn" type="submit">
            <CheckCircle2 aria-hidden size={14} />
            Close cycle
          </button>
        </form>
      </Panel>
    </>
  );
}
