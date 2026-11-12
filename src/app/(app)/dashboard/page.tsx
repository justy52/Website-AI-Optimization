import Link from "next/link";

import {
  Activity,
  AlertTriangle,
  Bot,
  CalendarDays,
  FileText,
  Globe2,
  ListChecks,
  Radar,
  ShieldCheck,
  Users,
} from "lucide-react";

import { getAttentionSummary } from "@/server/attention";
import { getWorkspaceShellContext } from "@/server/auth";
import { getAgentDashboardSummary } from "@/server/agents";
import { getCompetitorDashboardSummary } from "@/server/competitors";
import { getMonitoringDashboardSummary } from "@/server/monitoring";
import { getMonthlyCycleDashboardSummary } from "@/server/monthly-cycles";
import { getOpportunityDashboardSummary } from "@/server/opportunities";
import { getDashboardSummary } from "@/server/revenue";
import { getVerificationDashboard } from "@/server/verification";
import { getVisibilityDashboard } from "@/server/ai-visibility";

import { EmptyState, formatDate, PageHeader, Panel, RowLink, StatusChip } from "../ui";
import { markAlertsReadAction } from "./actions";

const statCards = [
  { key: "activeLeads", label: "Active leads", href: "/leads", icon: Radar },
  { key: "activeClients", label: "Clients", href: "/clients", icon: Users },
  { key: "activeWebsites", label: "Websites", href: "/websites", icon: Globe2 },
] as const;

export default async function DashboardPage() {
  const shell = await getWorkspaceShellContext();
  const [
    summary,
    opportunitySummary,
    agentSummary,
    monitoringSummary,
    competitorSummary,
    monthlyCycleSummary,
    verificationSummary,
    visibilitySummary,
    attention,
  ] = await Promise.all([
    getDashboardSummary(shell.workspaceContext),
    getOpportunityDashboardSummary(shell.workspaceContext),
    getAgentDashboardSummary(shell.workspaceContext),
    getMonitoringDashboardSummary(shell.workspaceContext),
    getCompetitorDashboardSummary(shell.workspaceContext),
    getMonthlyCycleDashboardSummary(shell.workspaceContext),
    getVerificationDashboard(shell.workspaceContext),
    getVisibilityDashboard(shell.workspaceContext),
    getAttentionSummary(shell.workspaceContext),
  ]);
  const needsAttention = attention.pendingRequests > 0 || attention.alerts.length > 0 || attention.failedAudits.length > 0;

  return (
    <>
      <PageHeader
        action={
          <Link className="mx-btn" href="/audits">
            <FileText aria-hidden size={14} />
            Start audit
          </Link>
        }
        eyebrow="Governed PREPARE and recurring observation"
        title="Command Center"
      />
      {needsAttention ? (
        <section aria-label="Needs your attention" className="mx-panel mx-attention">
          <div className="mx-panel-title">
            <h2 style={{ fontSize: "inherit", fontWeight: 700, margin: 0 }}>Needs your attention</h2>
          </div>
          {attention.pendingRequests > 0 ? (
            <div className="mx-attention-item">
              <span>
                {attention.pendingRequests === 1
                  ? "1 new audit request is waiting for review."
                  : `${attention.pendingRequests} new audit requests are waiting for review.`}
              </span>
              <Link className="mx-btn" href="/intake">Review requests</Link>
            </div>
          ) : null}
          {attention.failedAudits.map((audit) => (
            <div className="mx-attention-item" key={audit.auditId}>
              <span>
                <strong>{audit.title}</strong> failed. {audit.reason ?? "Open it to see what happened."}
              </span>
              <Link className="mx-btn mx-btn-ghost" href={`/audits/${audit.auditId}`}>Open audit</Link>
            </div>
          ))}
          {attention.alerts.map((alert) => (
            <div className="mx-attention-item" key={alert.id}>
              <span>
                <StatusChip tone={alert.severity === "CRITICAL" || alert.severity === "HIGH" ? "bad" : "warn"}>
                  {alert.severity === "CRITICAL" ? "Critical" : alert.severity === "HIGH" ? "High" : alert.severity === "MEDIUM" ? "Medium" : "Low"}
                </StatusChip>{" "}
                <strong>{alert.title}</strong> {alert.summary}
              </span>
              <span className="mx-muted">{formatDate(alert.createdAt)}</span>
            </div>
          ))}
          {attention.alerts.length > 0 ? (
            <form action={markAlertsReadAction}>
              {attention.alerts.map((alert) => <input key={alert.id} name="alertId" type="hidden" value={alert.id} />)}
              <button className="mx-btn mx-btn-ghost" type="submit">
                {attention.unreadAlerts > attention.alerts.length
                  ? `Mark these ${attention.alerts.length} as read (${attention.unreadAlerts - attention.alerts.length} more)`
                  : "Mark alerts as read"}
              </button>
            </form>
          ) : null}
        </section>
      ) : null}
      <Panel title="Implementation verification — current cycles">
        <div className="mx-grid mx-grid-3">{[["Awaiting verification", verificationSummary.awaiting], ["Verification failures", verificationSummary.failed], ["Verification warnings", verificationSummary.warnings], ["Verified this cycle", verificationSummary.verified]].map(([label, count]) => <Link className="mx-kpi" href="/monthly-cycles" key={label}><span className="mx-kpi-label">{label}</span><span className="mx-kpi-value">{count}</span></Link>)}</div>
      </Panel>
      <div className="mx-spacer" />
      <Panel title="Observed AI Visibility — sampled evidence"><p>Runs due {visibilitySummary.due} · Failed runs {visibilitySummary.failed} · Clients missing verified facts {visibilitySummary.missingFacts} · Provider unavailable {visibilitySummary.unavailable} · Samples requiring review {visibilitySummary.review}</p><Link className="mx-link" href={"/ai-visibility" as never}>Review AI visibility</Link></Panel>
      <div className="mx-grid mx-grid-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          const value = summary[card.key];

          return (
            <Link className="mx-panel mx-kpi" href={card.href} key={card.key}>
              <span className="mx-kpi-label">
                {card.label}
                <Icon aria-hidden size={14} />
              </span>
              <span className="mx-kpi-value">{value}</span>
            </Link>
          );
        })}
      </div>
      <div className="mx-spacer" />
      <div className="mx-grid mx-grid-3">
        <Link
          className="mx-panel mx-kpi"
          href={"/opportunities?attention=immediate" as never}
        >
          <span className="mx-kpi-label">
            Immediate work
            <AlertTriangle aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">{opportunitySummary.immediate}</span>
        </Link>
        <Link
          className="mx-panel mx-kpi"
          href={"/opportunities?attention=high" as never}
        >
          <span className="mx-kpi-label">
            High-priority work
            <ListChecks aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">{opportunitySummary.high}</span>
        </Link>
        <Link
          className="mx-panel mx-kpi"
          href={"/opportunities?attention=blocked" as never}
        >
          <span className="mx-kpi-label">
            Blocked work
            <AlertTriangle aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">{opportunitySummary.blocked}</span>
        </Link>
      </div>
      <div className="mx-spacer" />
      <div className="mx-grid mx-grid-3">
        <Link className="mx-panel mx-kpi" href={"/runs" as never}>
          <span className="mx-kpi-label">
            Runs in progress
            <Bot aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">{agentSummary.runsInProgress}</span>
        </Link>
        <Link className="mx-panel mx-kpi" href={"/approvals" as never}>
          <span className="mx-kpi-label">
            Approvals pending
            <ShieldCheck aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">{agentSummary.approvalsPending}</span>
        </Link>
        <Link className="mx-panel mx-kpi" href={"/opportunities" as never}>
          <span className="mx-kpi-label">
            Ready for PREPARE
            <ListChecks aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">
            {agentSummary.opportunitiesReadyForPrepare}
          </span>
        </Link>
      </div>
      <div className="mx-spacer" />
      <div className="mx-grid mx-grid-2">
        <Link className="mx-panel mx-kpi" href={"/approvals" as never}>
          <span className="mx-kpi-label">
            Drafts awaiting review
            <FileText aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">
            {agentSummary.draftsAwaitingReview}
          </span>
        </Link>
        <Link className="mx-panel mx-kpi" href={"/runs" as never}>
          <span className="mx-kpi-label">
            Failed or limited runs
            <AlertTriangle aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">{agentSummary.failedRuns}</span>
        </Link>
      </div>
      <div className="mx-spacer" />
      <div className="mx-grid mx-grid-3">
        <Link className="mx-panel mx-kpi" href={"/monthly-cycles" as never}>
          <span className="mx-kpi-label">
            Clients without cycle
            <CalendarDays aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">
            {monthlyCycleSummary.clientsWithoutCurrentCycle}
          </span>
        </Link>
        <Link className="mx-panel mx-kpi" href={"/monthly-cycles" as never}>
          <span className="mx-kpi-label">
            Cycles needing attention
            <AlertTriangle aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">
            {monthlyCycleSummary.cyclesNeedingAttention}
          </span>
        </Link>
        <Link className="mx-panel mx-kpi" href={"/monthly-cycles" as never}>
          <span className="mx-kpi-label">
            Blocked deliverables
            <AlertTriangle aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">
            {monthlyCycleSummary.blockedContractualDeliverables}
          </span>
        </Link>
      </div>
      <div className="mx-spacer" />
      <div className="mx-grid mx-grid-3">
        <Link className="mx-panel mx-kpi" href={"/monthly-cycles" as never}>
          <span className="mx-kpi-label">
            Manual minutes
            <ListChecks aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">
            {monthlyCycleSummary.manualMinutesUsed}/
            {monthlyCycleSummary.manualMinutesIncluded}
          </span>
        </Link>
        <Link className="mx-panel mx-kpi" href={"/monthly-cycles" as never}>
          <span className="mx-kpi-label">
            Page deliverables
            <ListChecks aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">
            {monthlyCycleSummary.pageOptimizationsUsed}/
            {monthlyCycleSummary.pageOptimizationsIncluded}
          </span>
        </Link>
        <Link className="mx-panel mx-kpi" href={"/monthly-cycles" as never}>
          <span className="mx-kpi-label">
            Content deliverables
            <FileText aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">
            {monthlyCycleSummary.contentAssetsUsed}/
            {monthlyCycleSummary.contentAssetsIncluded}
          </span>
        </Link>
      </div>
      <div className="mx-spacer" />
      <div className="mx-grid mx-grid-2">
        <Link className="mx-panel mx-kpi" href={"/monthly-cycles" as never}>
          <span className="mx-kpi-label">
            Reports awaiting finalization
            <ShieldCheck aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">
            {monthlyCycleSummary.reportsAwaitingFinalization}
          </span>
        </Link>
        <Link className="mx-panel mx-kpi" href={"/opportunities" as never}>
          <span className="mx-kpi-label">
            Unresolved critical items
            <AlertTriangle aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">
            {monthlyCycleSummary.unresolvedCritical}
          </span>
        </Link>
      </div>
      <div className="mx-spacer" />
      <div className="mx-grid mx-grid-3">
        <Link className="mx-panel mx-kpi" href={"/monitoring" as never}>
          <span className="mx-kpi-label">
            Websites due
            <Activity aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">{monitoringSummary.websitesDue}</span>
        </Link>
        <Link className="mx-panel mx-kpi" href={"/monitoring" as never}>
          <span className="mx-kpi-label">
            Monitoring failures
            <AlertTriangle aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">
            {monitoringSummary.monitoringFailures}
          </span>
        </Link>
        <Link className="mx-panel mx-kpi" href={"/settings/integrations" as never}>
          <span className="mx-kpi-label">
            Search Console disconnected
            <Globe2 aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">
            {monitoringSummary.searchConsoleDisconnected}
          </span>
        </Link>
      </div>
      <div className="mx-spacer" />
      <div className="mx-grid mx-grid-3">
        <Link className="mx-panel mx-kpi" href={"/monitoring" as never}>
          <span className="mx-kpi-label">
            New monitoring problems
            <AlertTriangle aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">
            {monitoringSummary.newMonitoringProblems}
          </span>
        </Link>
        <Link className="mx-panel mx-kpi" href={"/settings/integrations" as never}>
          <span className="mx-kpi-label">
            Search Console errors
            <AlertTriangle aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">
            {monitoringSummary.searchConsoleSyncErrors}
          </span>
        </Link>
        <Link className="mx-panel mx-kpi" href={"/websites" as never}>
          <span className="mx-kpi-label">
            Competitor changes
            <Radar aria-hidden size={14} />
          </span>
          <span className="mx-kpi-value">{competitorSummary.recentChanges}</span>
        </Link>
      </div>
      <div className="mx-spacer" />
      <Panel
        right={
          <a className="mx-btn mx-btn-ghost" href="/work-plan">
            <ListChecks aria-hidden size={14} />
            Work Plan
          </a>
        }
        title="Work-plan queue"
      >
        {opportunitySummary.recent.length > 0 ? (
          <div className="mx-list">
            {opportunitySummary.recent.map((opportunity) => (
              <RowLink
                chips={
                  <StatusChip tone={opportunity.priorityBand === "Immediate" ? "bad" : "warn"}>
                    {opportunity.finalPriority} {opportunity.priorityBand}
                  </StatusChip>
                }
                href={`/opportunities/${opportunity.id}`}
                key={opportunity.id}
                meta="Recent audit finding converted to internal work"
                title={opportunity.title}
              />
            ))}
          </div>
        ) : (
          <EmptyState>
            Run or finalize an audit with eligible findings to populate the
            internal work queue.
          </EmptyState>
        )}
      </Panel>
      <div className="mx-spacer" />
      <Panel title="Recent leads">
        {summary.recentLeadNames.length > 0 ? (
          <div className="mx-list">
            {summary.recentLeadNames.map((name) => (
              <div className="mx-row mx-row-static" key={name}>
                <span className="mx-row-title">{name}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>No leads have been created in this workspace yet.</EmptyState>
        )}
      </Panel>
    </>
  );
}
