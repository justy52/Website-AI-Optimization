import Link from "next/link";

import { Bot, ShieldCheck } from "lucide-react";

import { getWorkspaceShellContext } from "@/server/auth";
import { listAgentRuns } from "@/server/agents";

import {
  EmptyState,
  formatDate,
  PageHeader,
  Panel,
  RowLink,
  StatusChip,
} from "../ui";

function statusTone(status: string) {
  if (status === "SUCCEEDED") return "good";
  if (status === "QUEUED" || status === "RUNNING") return "info";
  if (status === "FAILED" || status === "BUDGET_LIMITED") return "bad";
  return "neutral";
}

export default async function RunsPage() {
  const shell = await getWorkspaceShellContext();
  const runs = await listAgentRuns(shell.workspaceContext);

  return (
    <>
      <PageHeader
        action={
          <Link className="mx-btn mx-btn-ghost" href={"/approvals" as never}>
            <ShieldCheck aria-hidden size={14} />
            Approvals
          </Link>
        }
        eyebrow="Bounded OBSERVE/PREPARE history"
        title="Runs"
      />
      <Panel title="Agent run history">
        {runs.length > 0 ? (
          <div className="mx-list">
            {runs.map((run) => (
              <RowLink
                chips={
                  <StatusChip tone={statusTone(run.status)}>
                    {run.status}
                  </StatusChip>
                }
                href={`/runs/${run.id}`}
                key={run.id}
                meta={`${run.clientName ?? "Client"} - ${
                  run.websiteName ?? "Website"
                } - ${run.permissionLevel} - ${formatDate(run.createdAt)}`}
                title={run.opportunityTitle ?? run.agentKey}
              />
            ))}
          </div>
        ) : (
          <EmptyState>No PREPARE runs have been requested yet.</EmptyState>
        )}
      </Panel>
      <div className="mx-spacer" />
      <Panel title="Permission boundary">
        <div className="mx-safety-lock">
          <Bot aria-hidden size={16} />
          <span>
            Phase 3 runs can observe bounded evidence and prepare internal
            drafts. They cannot publish, email, edit websites, or perform
            external EXECUTE actions.
          </span>
        </div>
      </Panel>
    </>
  );
}
