import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft, ShieldCheck } from "lucide-react";

import { getWorkspaceShellContext } from "@/server/auth";
import { getDraftArtifact } from "@/server/agents";

import { formatDate, PageHeader, Panel, StatusChip } from "../../ui";

function statusTone(status: string) {
  if (status === "APPROVED") return "good";
  if (status === "AWAITING_APPROVAL") return "warn";
  if (status === "REJECTED") return "bad";
  return "neutral";
}

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export default async function DraftArtifactPage({
  params,
}: {
  params: Promise<{ artifactId: string }>;
}) {
  const { artifactId } = await params;
  const shell = await getWorkspaceShellContext();
  const detail = await getDraftArtifact(shell.workspaceContext, artifactId);

  if (!detail) {
    notFound();
  }

  return (
    <>
      <PageHeader
        action={
          detail.approval ? (
            <Link
              className="mx-btn mx-btn-ghost"
              href={`/approvals/${detail.approval.id}` as never}
            >
              <ArrowLeft aria-hidden size={14} />
              Approval
            </Link>
          ) : (
            <Link className="mx-btn mx-btn-ghost" href={"/runs" as never}>
              <ArrowLeft aria-hidden size={14} />
              Runs
            </Link>
          )
        }
        eyebrow={`${detail.clientName ?? "Client"} - ${
          detail.websiteName ?? "Website"
        } - v${detail.artifact.artifactVersion} - ${formatDate(
          detail.artifact.createdAt,
        )}`}
        title={detail.opportunityTitle ?? detail.artifact.artifactType}
      />
      <div className="mx-grid mx-grid-2">
        <Panel
          right={
            <StatusChip tone={statusTone(detail.artifact.status)}>
              {detail.artifact.status}
            </StatusChip>
          }
          title="Artifact boundary"
        >
          <div className="mx-method">
            <span>Type</span>
            <span>{detail.artifact.artifactType}</span>
          </div>
          <div className="mx-method">
            <span>Risk</span>
            <span>{detail.artifact.riskLevel}</span>
          </div>
          <div className="mx-method">
            <span>Content hash</span>
            <span>{detail.artifact.contentHash}</span>
          </div>
          <div className="mx-safety-lock">
            <ShieldCheck aria-hidden size={16} />
            <span>
              This is an internal PREPARE artifact. Approval does not execute an
              external change.
            </span>
          </div>
        </Panel>
        <Panel title="Factual basis references">
          {detail.artifact.factualBasisRefs.length > 0 ? (
            <div className="mx-list">
              {detail.artifact.factualBasisRefs.map((ref) => (
                <div className="mx-row mx-row-static" key={ref}>
                  <span className="mx-row-title">{ref}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mx-muted">
              The draft did not rely on verified business facts.
            </p>
          )}
        </Panel>
      </div>
      <div className="mx-spacer" />
      <Panel title="Preview">
        <pre className="mx-report">{detail.artifact.renderedPreview}</pre>
      </Panel>
      <div className="mx-spacer" />
      <Panel title="Structured proposal">
        <pre className="mx-report">{json(detail.artifact.structuredProposal)}</pre>
      </Panel>
    </>
  );
}
