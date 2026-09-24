import { serverEnv } from "@/lib/env";
import { qaExecutionAction } from "../../qa-execution/actions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkspaceShellContext } from "@/server/auth";
import { getImplementationPackage } from "@/server/verification";
import { packageSchema } from "@/domain/verification/verification";
import { PageHeader, Panel } from "../../ui";

export default async function ImplementationPackagePage({ params }: { params: Promise<{ packageId: string }> }) {
  const shell = await getWorkspaceShellContext();
  const row = await getImplementationPackage(shell.workspaceContext, (await params).packageId);
  if (!row) notFound();
  const pkg = packageSchema.parse(row.snapshot);
  return <>
    <PageHeader title="Implementation Package" eyebrow={`Approved artifact v${pkg.artifactVersion}`} />
    <Panel title="Exact approved version">
      <p>This package is for a human to implement. It does not authorize or perform external execution.</p>
      <p>Target: {pkg.targetUrl}</p><p>Package hash: {row.contentHash}</p>
      <p><Link href={`/drafts/${row.artifactId}` as never}>Approved artifact v{row.artifactVersion}</Link> · <Link href={`/approvals/${row.approvalId}` as never}>Approval</Link> · <Link href={`/opportunities/${row.opportunityId}`}>Opportunity</Link></p>
      <p>Newer drafts do not change this package or its approval. Select this exact version when recording manual implementation in Monthly Cycles.</p>
    </Panel>
    <div className="mx-spacer" />
    {serverEnv.APP_ENV === "qa" && pkg.targetUrl.startsWith("https://optiq-qa.vercel.app/qa/execute-fixture/") && ["OWNER","ADMIN"].includes(shell.workspaceContext.role) ? <Panel title="QA SANDBOX EXECUTION"><p>This package does not grant execution permission. Request a separate exact execution approval.</p><form action={qaExecutionAction}><input type="hidden" name="operation" value="request"/><input type="hidden" name="packageId" value={row.id}/><button className="mx-btn">Request QA Execution</button></form></Panel> : null}
    <Panel title="Approved changes">{pkg.changes.map((change, index) => <div key={index}><h3>{change.field}</h3><p>Captured current value: {change.currentValue ?? "Not captured"}</p><pre className="mx-report">{change.proposedValue ?? "TBD / human input required"}</pre></div>)}</Panel>
    <div className="mx-spacer" />
    <Panel title="Verification plan"><pre className="mx-report">{JSON.stringify(pkg.checks, null, 2)}</pre>{pkg.limitations.map(text => <p key={text}>{text}</p>)}<p>Evidence references: {pkg.evidenceRefs.join(", ") || "None"}</p></Panel>
  </>;
}
