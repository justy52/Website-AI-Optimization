import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft, FileText, ShieldCheck } from "lucide-react";

import { getWorkspaceShellContext } from "@/server/auth";
import { getAgentRunDetail } from "@/server/agents";

import { formatDate, PageHeader, Panel, StatusChip } from "../../ui";

function statusTone(status: string) {
  if (status === "SUCCEEDED") return "good";
  if (status === "QUEUED" || status === "RUNNING") return "info";
  if (status === "FAILED" || status === "BUDGET_LIMITED") return "bad";
  return "neutral";
}

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const shell = await getWorkspaceShellContext();
  const detail = await getAgentRunDetail(shell.workspaceContext, runId);

  if (!detail) {
    notFound();
  }

  return (
    <>
      <PageHeader
        action={
          <Link className="mx-btn mx-btn-ghost" href={"/runs" as never}>
            <ArrowLeft aria-hidden size={14} />
            Runs
          </Link>
        }
        eyebrow={`${detail.clientName ?? "Client"} - ${
          detail.websiteName ?? "Website"
        } - ${formatDate(detail.run.createdAt)}`}
        title={detail.opportunityTitle ?? detail.run.agentKey}
      />
      <div className="mx-grid mx-grid-2">
        <Panel
          right={
            <StatusChip tone={statusTone(detail.run.status)}>
              {detail.run.status}
            </StatusChip>
          }
          title="Run record"
        >
          <div className="mx-method">
            <span>Agent</span>
            <span>
              {detail.run.agentKey} {detail.run.agentVersion}
            </span>
          </div>
          <div className="mx-method">
            <span>Permission</span>
            <span>{detail.run.permissionLevel}</span>
          </div>
          <div className="mx-method">
            <span>Trigger</span>
            <span>{detail.run.triggerType}</span>
          </div>
          <div className="mx-method">
            <span>Provider</span>
            <span>{detail.run.provider ?? "Not set"}</span>
          </div>
          <div className="mx-method">
            <span>Model</span>
            <span>{detail.run.model ?? "Not set"}</span>
          </div>
          {detail.artifact ? (
            <Link className="mx-btn" href={`/drafts/${detail.artifact.id}` as never}>
              <FileText aria-hidden size={14} />
              Open draft artifact
            </Link>
          ) : null}
        </Panel>
        <Panel title="Concise rationale">
          <p className="mx-muted">
            {detail.run.rationale ??
              detail.run.errorSummary ??
              "The run has not produced a rationale yet."}
          </p>
          <div className="mx-method">
            <span>Confidence</span>
            <span>{detail.run.confidence ?? "Not set"}</span>
          </div>
          <div className="mx-method">
            <span>Next action</span>
            <span>{detail.run.nextAction ?? "Pending"}</span>
          </div>
          <div className="mx-safety-lock">
            <ShieldCheck aria-hidden size={16} />
            <span>No hidden reasoning is stored or displayed.</span>
          </div>
        </Panel>
      </div>
      <div className="mx-spacer" />
      <Panel title="Allowed tools">
        {detail.tools.length > 0 ? (
          <div className="mx-list">
            {detail.tools.map((tool) => (
              <div className="mx-row mx-row-static" key={tool.id}>
                <div className="mx-row-main">
                  <span className="mx-row-title">
                    {tool.toolKey} {tool.toolVersion}
                  </span>
                  <span className="mx-row-meta">
                    {tool.permissionLevel} - {tool.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <pre className="mx-report">{json(detail.run.allowedToolSnapshot)}</pre>
        )}
      </Panel>
      <div className="mx-spacer" />
      <div className="mx-grid mx-grid-2">
        <Panel title="Budget snapshot">
          <pre className="mx-report">{json(detail.run.budgetSnapshot)}</pre>
        </Panel>
        <Panel title="Structured output">
          <pre className="mx-report">
            {json(detail.run.structuredOutput ?? detail.run.inputSummary)}
          </pre>
        </Panel>
      </div>
    </>
  );
}
