import Link from "next/link";

import { CheckCircle2, ListChecks, PlusCircle, XCircle } from "lucide-react";

import { getWorkspaceShellContext } from "@/server/auth";
import { getPrepareStatesForOpportunities } from "@/server/agents";
import {
  getClientWorkPlan,
  getWorkPlanOverview,
} from "@/server/opportunities";

import {
  removeOpportunityFromWorkPlanAction,
  selectOpportunityForWorkPlanAction,
} from "./actions";
import {
  EmptyState,
  formatDate,
  PageHeader,
  Panel,
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

export default async function WorkPlanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const shell = await getWorkspaceShellContext();
  const overview = await getWorkPlanOverview(shell.workspaceContext);
  const requestedClientId = one(query.clientId);
  const selectedClientId =
    requestedClientId ??
    overview.find((client) => client.openCount > 0)?.clientId ??
    overview[0]?.clientId;
  const plan = selectedClientId
    ? await getClientWorkPlan(shell.workspaceContext, selectedClientId)
    : null;
  const prepareStates = plan
    ? await getPrepareStatesForOpportunities(
        shell.workspaceContext,
        plan.opportunities.map((opportunity) => opportunity.id),
      )
    : new Map();

  return (
    <>
      <PageHeader
        action={
          <Link className="mx-btn mx-btn-ghost" href={"/opportunities" as never}>
            <ListChecks aria-hidden size={14} />
            Opportunities
          </Link>
        }
        eyebrow="Current internal execution order"
        title="Work Plan"
      />
      <Panel title="Client queue">
        {overview.length > 0 ? (
          <form action="/work-plan" className="mx-form">
            <label>
              Client
              <select className="mx-input" defaultValue={selectedClientId} name="clientId">
                {overview.map((client) => (
                  <option key={client.clientId} value={client.clientId}>
                    {client.clientName} - {client.openCount} open
                  </option>
                ))}
              </select>
            </label>
            <button className="mx-btn" type="submit">
              Open work plan
            </button>
          </form>
        ) : (
          <EmptyState>No clients are available for work planning yet.</EmptyState>
        )}
      </Panel>
      <div className="mx-spacer" />
      {plan ? (
        <Panel
          right={
            <StatusChip tone="info">
              {plan.cycle ? plan.cycle.title : "No cycle selected yet"}
            </StatusChip>
          }
          title={`${plan.client.name} actionable Opportunities`}
        >
          {plan.opportunities.length > 0 ? (
            <div className="mx-list">
              {plan.opportunities.map((opportunity) => {
                const prepareState = prepareStates.get(opportunity.id);

                return (
                  <div className="mx-check-row" key={opportunity.id}>
                    <div>
                      <Link
                        className="mx-row-title"
                        href={`/opportunities/${opportunity.id}` as never}
                      >
                        {opportunity.title}
                      </Link>
                      <div className="mx-row-meta">
                        {opportunity.domain} - effort {opportunity.effort}/5 -
                        created {formatDate(opportunity.createdAt)}
                      </div>
                      <div className="mx-action-inline">
                        <StatusChip tone={bandTone(opportunity.priorityBand)}>
                          {opportunity.finalPriority} {opportunity.priorityBand}
                        </StatusChip>
                        <StatusChip tone={planTone(opportunity.planScope)}>
                          {opportunity.planScope}
                        </StatusChip>
                        <StatusChip
                          tone={
                            opportunity.status === "BLOCKED" ? "warn" : "neutral"
                          }
                        >
                          {opportunity.status}
                        </StatusChip>
                        {prepareState?.approval ? (
                          <Link
                            href={`/approvals/${prepareState.approval.id}` as never}
                          >
                            <StatusChip tone="warn">
                              {prepareState.approval.status}
                            </StatusChip>
                          </Link>
                        ) : prepareState?.run ? (
                          <Link href={`/runs/${prepareState.run.id}` as never}>
                            <StatusChip tone="info">
                              {prepareState.run.status}
                            </StatusChip>
                          </Link>
                        ) : (
                          <StatusChip tone="neutral">Awaiting draft</StatusChip>
                        )}
                      </div>
                    </div>
                    {opportunity.selectedForCycle ? (
                    <form action={removeOpportunityFromWorkPlanAction}>
                      <input name="opportunityId" type="hidden" value={opportunity.id} />
                      <input name="clientId" type="hidden" value={plan.client.id} />
                      <button className="mx-btn mx-btn-ghost" type="submit">
                        <XCircle aria-hidden size={14} />
                        Remove
                      </button>
                    </form>
                  ) : (
                    <form action={selectOpportunityForWorkPlanAction}>
                      <input name="opportunityId" type="hidden" value={opportunity.id} />
                      <input name="clientId" type="hidden" value={plan.client.id} />
                      <button className="mx-btn" type="submit">
                        <PlusCircle aria-hidden size={14} />
                        Select
                      </button>
                    </form>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState>
              No open Opportunities for this client. Run an audit or clear
              resolved work to change the queue.
            </EmptyState>
          )}
        </Panel>
      ) : null}
      <div className="mx-spacer" />
      <Panel title="Follow-through rule">
        <div className="mx-safety-lock">
          <CheckCircle2 aria-hidden size={16} />
          <span>
            Work is selected for internal follow-through only; implementation,
            approvals, scheduling, billing, and external writes remain deferred.
          </span>
        </div>
      </Panel>
    </>
  );
}
