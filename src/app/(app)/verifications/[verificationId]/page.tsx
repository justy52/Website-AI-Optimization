import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkspaceShellContext } from "@/server/auth";
import { getVerificationDetail } from "@/server/verification";
import type { VerificationObservation } from "@/domain/verification/verification";
import { PageHeader, Panel, StatusChip } from "../../ui";

export default async function VerificationPage({ params }: { params: Promise<{ verificationId: string }> }) {
  const shell = await getWorkspaceShellContext();
  const record = await getVerificationDetail(shell.workspaceContext, (await params).verificationId);
  if (!record) notFound();
  const observation = record.evidence.observation as VerificationObservation | undefined;
  return <>
    <PageHeader title="Implementation Verification" eyebrow={`${record.methodKind} · ${record.verifiedAt.toISOString()}`} />
    <Panel title="Recorded result" right={<StatusChip tone={record.status === "VERIFIED" ? "good" : record.status === "VERIFICATION_FAILED" ? "bad" : "warn"}>{record.status}</StatusChip>}>
      <p>Method/version: {record.verificationMethod}</p><p>Implementation record: {record.implementationRecordId}</p><p>{String(record.evidence.summary ?? "")}</p>
      {record.implementation ? <div><p>Recorded change: {record.implementation.whatImplemented}</p><p>Implemented {record.implementation.implementationDate} - {record.implementation.manualMinutes} manual minutes - actor {record.implementation.implementedByUserId}</p><p>Artifact version actually implemented: {record.implementation.artifactVersion ?? "No artifact selected"}</p><p>Human reference: {record.implementation.evidenceReference ?? "None"}</p></div> : null}
      {record.evidence.appliesToCurrent === false ? <p>This historical attempt applies to an older implementation and did not change current completion.</p> : null}
      <p><Link href={`/monthly-cycles/${record.monthlyCycleId}`}>Monthly cycle</Link> · <Link href={`/opportunities/${record.opportunityId}`}>Opportunity</Link>{record.implementationPackageId ? <> · <Link href={`/implementation-packages/${record.implementationPackageId}` as never}>Exact approved package and artifact</Link></> : null}{record.agentRunId ? <> · <Link href={`/runs/${record.agentRunId}`}>Agent Run</Link></> : null}</p>
    </Panel>
    <div className="mx-spacer" />
    <Panel title="Independent evidence">
      {observation ? <><p>Target: {observation.targetUrl}</p><p>Observed URL: {observation.finalUrl ?? "Unavailable"} · HTTP {observation.statusCode ?? "unavailable"}</p><p>Content hash: {observation.contentHash ?? "No successful fetch"}</p><p>Observed: {observation.observedAt}</p>{observation.comparisons.map((comparison, index) => <div key={index}><h3>{comparison.kind} — {comparison.result}</h3><p>{comparison.rationale}</p><pre className="mx-report">{JSON.stringify({ expected: comparison.expected, observed: comparison.observed }, null, 2)}</pre></div>)}{observation.limitations.map(text => <p key={text}>{text}</p>)}</> : <><p>Human verification; no independent automated public-page observation is claimed.</p><pre className="mx-report">{JSON.stringify(record.evidence, null, 2)}</pre></>}
    </Panel>
  </>;
}
