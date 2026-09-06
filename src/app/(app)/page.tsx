import Link from "next/link";

import { FileText, Globe2, Radar, Users } from "lucide-react";

import { getWorkspaceShellContext } from "@/server/auth";
import { getDashboardSummary } from "@/server/revenue";

import { EmptyState, PageHeader, Panel } from "./ui";

const statCards = [
  { key: "activeLeads", label: "Active leads", href: "/leads", icon: Radar },
  { key: "activeClients", label: "Clients", href: "/clients", icon: Users },
  { key: "activeWebsites", label: "Websites", href: "/websites", icon: Globe2 },
] as const;

export default async function DashboardPage() {
  const shell = await getWorkspaceShellContext();
  const summary = await getDashboardSummary(shell.workspaceContext);

  return (
    <>
      <PageHeader
        action={
          <Link className="mx-btn" href="/audits">
            <FileText aria-hidden size={14} />
            Start audit
          </Link>
        }
        eyebrow="Phase 1 revenue loop"
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
