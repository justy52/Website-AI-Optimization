import Link from "next/link";

import { Filter, ListChecks } from "lucide-react";

import { opportunityStatuses } from "@/domain/opportunities/generation";
import { getWorkspaceShellContext } from "@/server/auth";
import { listOpportunities } from "@/server/opportunities";
import { listClients, listWebsites } from "@/server/revenue";

import {
  EmptyState,
  formatDate,
  PageHeader,
  Panel,
  RowLink,
  StatusChip,
} from "../ui";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

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

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const shell = await getWorkspaceShellContext();
  const filters = {
    attention: one(query.attention) as "immediate" | "high" | "blocked" | undefined,
    status: one(query.status),
    clientId: one(query.clientId),
    websiteId: one(query.websiteId),
  };
  const [opportunities, clients, websites] = await Promise.all([
    listOpportunities(shell.workspaceContext, filters),
    listClients(shell.workspaceContext),
    listWebsites(shell.workspaceContext),
  ]);

  return (
    <>
      <PageHeader
        action={
          <Link className="mx-btn" href={"/work-plan" as never}>
            <ListChecks aria-hidden size={14} />
            Work Plan
          </Link>
        }
        eyebrow="Audit findings converted to work"
        title="Opportunities"
      />
      <Panel
        right={
          <Link className="mx-btn mx-btn-ghost" href={"/opportunities" as never}>
            Clear filters
          </Link>
        }
        title="Filters"
      >
        <form className="mx-form" action="/opportunities">
          <label>
            Focus
            <select className="mx-input" defaultValue={filters.attention ?? ""} name="attention">
              <option value="">All</option>
              <option value="immediate">Immediate</option>
              <option value="high">High</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>
          <label>
            Status
            <select className="mx-input" defaultValue={filters.status ?? ""} name="status">
              <option value="">All</option>
              {opportunityStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Client
            <select className="mx-input" defaultValue={filters.clientId ?? ""} name="clientId">
              <option value="">All</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Website
            <select className="mx-input" defaultValue={filters.websiteId ?? ""} name="websiteId">
              <option value="">All</option>
              {websites.map((website) => (
                <option key={website.id} value={website.id}>
                  {website.displayName}
                </option>
              ))}
            </select>
          </label>
          <button className="mx-btn mx-form-wide" type="submit">
            <Filter aria-hidden size={14} />
            Apply filters
          </button>
        </form>
      </Panel>
      <div className="mx-spacer" />
      <Panel
        right={<StatusChip tone="info">{opportunities.length} shown</StatusChip>}
        title="Operational work queue"
      >
        {opportunities.length > 0 ? (
          <div className="mx-list">
            {opportunities.map((opportunity) => (
              <RowLink
                chips={
                  <>
                    <StatusChip tone={bandTone(opportunity.priorityBand)}>
                      {opportunity.finalPriority} {opportunity.priorityBand}
                    </StatusChip>
                    <StatusChip tone={planTone(opportunity.planScope)}>
                      {opportunity.planScope}
                    </StatusChip>
                    <StatusChip tone="neutral">{opportunity.status}</StatusChip>
                  </>
                }
                href={`/opportunities/${opportunity.id}`}
                key={opportunity.id}
                meta={`${opportunity.clientName} - ${opportunity.domain} - ${opportunity.sourceCheckKey} - ${formatDate(opportunity.createdAt)}`}
                title={opportunity.title}
              />
            ))}
          </div>
        ) : (
          <EmptyState>
            No Opportunities match this filter. Run or finalize an audit with
            eligible findings to populate the queue.
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
