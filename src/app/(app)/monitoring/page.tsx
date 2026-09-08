import Link from "next/link";

import { Activity, AlertTriangle, Globe2 } from "lucide-react";

import { getWorkspaceShellContext } from "@/server/auth";
import { getMonitoringOverview } from "@/server/monitoring";

import { EmptyState, formatDate, PageHeader, Panel, RowLink, StatusChip } from "../ui";

function statusTone(status: string) {
  if (status === "SUCCEEDED") return "good";
  if (status === "FAILED" || status === "TIMED_OUT") return "bad";
  if (status === "PARTIAL" || status === "BUDGET_LIMITED") return "warn";
  if (status === "QUEUED" || status === "RUNNING") return "info";
  return "neutral";
}

export default async function MonitoringPage() {
  const shell = await getWorkspaceShellContext();
  const overview = await getMonitoringOverview(shell.workspaceContext);

  return (
    <>
      <PageHeader
        action={
          <Link className="mx-btn mx-btn-ghost" href="/websites">
            <Globe2 aria-hidden size={14} />
            Websites
          </Link>
        }
        eyebrow="Recurring read-only observation"
        title="Monitoring"
      />
      <div className="mx-grid mx-grid-2">
        <Panel
          right={<StatusChip tone="info">{overview.schedules.length} schedules</StatusChip>}
          title="Schedules"
        >
          {overview.schedules.length > 0 ? (
            <div className="mx-list">
              {overview.schedules.map((schedule) => (
                <RowLink
                  chips={
                    <StatusChip tone={schedule.enabled ? "good" : "neutral"}>
                      {schedule.enabled ? "Enabled" : "Paused"}
                    </StatusChip>
                  }
                  href={`/websites/${schedule.websiteId}`}
                  key={schedule.id}
                  meta={`${schedule.clientName} - ${schedule.monitorKey} - next ${formatDate(
                    schedule.nextRunAt,
                  )}`}
                  title={schedule.websiteName}
                />
              ))}
            </div>
          ) : (
            <EmptyState>
              Open a website and sync plan schedules to begin recurring
              monitoring.
            </EmptyState>
          )}
        </Panel>
        <Panel title="Recent runs">
          {overview.runs.length > 0 ? (
            <div className="mx-list">
              {overview.runs.map((run) => (
                <div className="mx-row mx-row-static" key={run.id}>
                  <div className="mx-row-main">
                    <span className="mx-row-title">{run.monitorKey}</span>
                    <span className="mx-row-meta">
                      {run.triggerType} - {formatDate(run.createdAt)} -{" "}
                      {run.observationsProduced} observations
                    </span>
                    {run.errorSummary ? (
                      <span className="mx-row-meta">{run.errorSummary}</span>
                    ) : null}
                  </div>
                  <StatusChip tone={statusTone(run.status)}>{run.status}</StatusChip>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>No monitoring runs have been recorded yet.</EmptyState>
          )}
        </Panel>
      </div>
      <div className="mx-spacer" />
      <Panel title="Observation boundaries">
        <div className="mx-safety-lock">
          <Activity aria-hidden size={16} />
          <span>
            Phase 4A monitoring records historical observations and can refresh
            deterministic Opportunities. It does not write to client sites or
            third-party systems.
          </span>
        </div>
        <div className="mx-safety-lock">
          <AlertTriangle aria-hidden size={16} />
          <span>
            Ranking and observed AI visibility remain unavailable until approved
            read providers or Phase 4B live-model gates are enabled.
          </span>
        </div>
      </Panel>
    </>
  );
}
