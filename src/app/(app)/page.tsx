import Link from "next/link";

import {
  AlertTriangle,
  FileText,
  Globe2,
  ListChecks,
  Radar,
  Users,
} from "lucide-react";

import { getWorkspaceShellContext } from "@/server/auth";
import { getOpportunityDashboardSummary } from "@/server/opportunities";
import { getDashboardSummary } from "@/server/revenue";

import { EmptyState, PageHeader, Panel, RowLink, StatusChip } from "./ui";

const statCards = [
  { key: "activeLeads", label: "Active leads", href: "/leads", icon: Radar },
  { key: "activeClients", label: "Clients", href: "/clients", icon: Users },
  { key: "activeWebsites", label: "Websites", href: "/websites", icon: Globe2 },
] as const;

export default async function DashboardPage() {
  const shell = await getWorkspaceShellContext();
  const [summary, opportunitySummary] = await Promise.all([
    getDashboardSummary(shell.workspaceContext),
    getOpportunityDashboardSummary(shell.workspaceContext),
  ]);

  return (
    <>
      <PageHeader
        action={
          <Link className="mx-btn" href="/audits">
            <FileText aria-hidden size={14} />
            Start audit
          </Link>
        }
        eyebrow="Phase 2 optimization operations"
        title="Command Center"
      />
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
