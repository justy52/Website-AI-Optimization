import Link from "next/link";

import { ShieldCheck } from "lucide-react";

import { getWorkspaceShellContext } from "@/server/auth";
import { listApprovalRequests } from "@/server/agents";

import {
  EmptyState,
  formatDate,
  PageHeader,
  Panel,
  RowLink,
  StatusChip,
} from "../ui";

function statusTone(status: string) {
  if (status === "APPROVED") return "good";
  if (status === "PENDING" || status === "CHANGES_REQUESTED") return "warn";
  if (status === "REJECTED") return "bad";
  return "neutral";
}

function titleFromSummary(summary: unknown) {
  if (
    summary &&
    typeof summary === "object" &&
    "title" in summary &&
    typeof summary.title === "string"
  ) {
    return summary.title;
  }

  return "Draft artifact review";
}

export default async function ApprovalsPage() {
  const shell = await getWorkspaceShellContext();
  const approvals = await listApprovalRequests(shell.workspaceContext);

  return (
    <>
      <PageHeader
        action={
          <Link className="mx-btn mx-btn-ghost" href={"/runs" as never}>
            <ShieldCheck aria-hidden size={14} />
            Runs
          </Link>
        }
        eyebrow="Human authority checkpoint"
        title="Approval Queue"
      />
      <Panel title="Reviewable drafts">
        {approvals.length > 0 ? (
          <div className="mx-list">
            {approvals.map((approval) => (
              <RowLink
                chips={
                  <StatusChip tone={statusTone(approval.status)}>
                    {approval.status}
                  </StatusChip>
                }
                href={`/approvals/${approval.id}`}
                key={approval.id}
                meta={`${approval.clientName ?? "Client"} - ${
                  approval.websiteName ?? "Website"
                } - v${approval.targetArtifactVersion} - ${formatDate(
                  approval.requestedAt,
                )}`}
                title={titleFromSummary(approval.immutableSummary)}
              />
            ))}
          </div>
        ) : (
          <EmptyState>No draft artifacts are awaiting human approval.</EmptyState>
        )}
      </Panel>
    </>
  );
}
