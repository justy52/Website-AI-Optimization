import Link from "next/link";

import { CalendarPlus, ListChecks } from "lucide-react";

import { monthlyPeriodForDate } from "@/domain/monthly-cycles/entitlements";
import {
  listClientsForMonthlyCycleCreation,
  listMonthlyCycles,
} from "@/server/monthly-cycles";
import { getWorkspaceShellContext } from "@/server/auth";

import {
  EmptyState,
  formatDate,
  PageHeader,
  Panel,
  RowLink,
  StatusChip,
} from "../ui";
import { createMonthlyCycleAction } from "./actions";

function cycleLabel(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function statusTone(status: string) {
  if (status === "CLOSED") return "good";
  if (status === "REVIEW_REQUIRED") return "warn";
  if (status === "CANCELED") return "neutral";
  return "info";
}

export default async function MonthlyCyclesPage() {
  const shell = await getWorkspaceShellContext();
  const [cycles, clients] = await Promise.all([
    listMonthlyCycles(shell.workspaceContext),
    listClientsForMonthlyCycleCreation(shell.workspaceContext),
  ]);
  const currentPeriod = monthlyPeriodForDate(new Date());
  const recurringClients = clients.filter((client) =>
    ["ESSENTIALS", "GROWTH", "PRO"].includes(client.servicePlan),
  );

  return (
    <>
      <PageHeader
        action={
          <Link className="mx-btn mx-btn-ghost" href="/work-plan">
            <ListChecks aria-hidden size={14} />
            Work Plan
          </Link>
        }
        eyebrow="Recurring service delivery"
        title="Monthly Cycles"
      />
      <Panel title="Create monthly cycle">
        {recurringClients.length > 0 ? (
          <form action={createMonthlyCycleAction} className="mx-form">
            <label>
              Client
              <select className="mx-input" name="clientId" required>
                {recurringClients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} - {client.servicePlan}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Year
              <input
                className="mx-input"
                defaultValue={currentPeriod.year}
                name="year"
                required
                type="number"
              />
            </label>
            <label>
              Month
              <input
                className="mx-input"
                defaultValue={currentPeriod.month}
                max={12}
                min={1}
                name="month"
                required
                type="number"
              />
            </label>
            <label>
              Timezone
              <input
                className="mx-input"
                defaultValue="America/Denver"
                name="timezone"
                required
                type="text"
              />
            </label>
            <label className="mx-form-wide">
              Internal notes
              <textarea className="mx-input" name="notes" rows={2} />
            </label>
            <button className="mx-btn mx-form-wide" type="submit">
              <CalendarPlus aria-hidden size={14} />
              Create cycle
            </button>
          </form>
        ) : (
          <EmptyState>
            No active Essentials, Growth, or Pro clients are ready for recurring
            monthly cycles.
          </EmptyState>
        )}
      </Panel>
      <div className="mx-spacer" />
      <Panel title="Cycle history">
        {cycles.length > 0 ? (
          <div className="mx-list">
            {cycles.map((cycle) => (
              <RowLink
                chips={<StatusChip tone={statusTone(cycle.status)}>{cycle.status}</StatusChip>}
                href={`/monthly-cycles/${cycle.id}`}
                key={cycle.id}
                meta={`${cycle.servicePlan} - due ${formatDate(cycle.dueAt)} - ${cycle.manualImplementationMinutes} manual min`}
                title={`${cycle.clientName} ${cycleLabel(cycle.cycleYear, cycle.cycleMonth)}`}
              />
            ))}
          </div>
        ) : (
          <EmptyState>
            No monthly cycles exist for this workspace yet.
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
