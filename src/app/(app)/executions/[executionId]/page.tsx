import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkspaceShellContext } from "@/server/auth";
import { getQaExecutionDetail } from "@/server/qa-execution";
import { PageHeader, Panel } from "../../ui";
import { qaExecutionAction } from "../../qa-execution/actions";
export default async function ExecutionPage({params}:{params:Promise<{executionId:string}>}) {
 const {workspaceContext:c}=await getWorkspaceShellContext(); const detail=await getQaExecutionDetail(c,(await params).executionId); if(!detail) notFound(); const r=detail.record;
 return <><PageHeader title="Execution Record" eyebrow="QA SANDBOX EXECUTION"/><p data-testid="execution-status">{r.kind}: {r.status}</p><p>Verification: {r.verificationStatus??"Awaiting independent observation"}</p><p>{r.errorSummary}</p>
 <p><Link href={"/qa-execution" as never}>QA execution controls</Link> ? <Link href={('/implementation-packages/'+r.implementationPackageId) as never}>Exact package</Link> ? <Link href={('/runs/'+r.agentRunId) as never}>Execution tool audit</Link>{r.verificationRunId?<> ? <Link href={('/runs/'+r.verificationRunId) as never}>Independent OBSERVE run</Link></>:null}</p>
 <Panel title="Immutable action"><p>Target: {r.target}</p><p>Action fingerprint: {r.actionHash}</p><p>Idempotency key: {r.idempotencyKey}</p><p>Change ID: {r.changeId??"No mutation"}</p><p>Started: {r.startedAt?.toISOString()??"Queued"} ? Completed: {r.completedAt?.toISOString()??"Pending"}</p><pre className="mx-report">{JSON.stringify(r.actionSummary,null,2)}</pre></Panel>
 <Panel title="Before / after snapshots"><pre className="mx-report">{JSON.stringify({before:r.preChangeSnapshot,after:r.postChangeSnapshot},null,2)}</pre></Panel>
 <Panel title="Independent verification evidence"><pre className="mx-report">{JSON.stringify(r.verificationSnapshot,null,2)}</pre></Panel>
 <Panel title="Rollback history"><p>Rollback is a separate retained action. The original result is never rewritten.</p>{r.parentExecutionId?<Link href={('/executions/'+r.parentExecutionId) as never}>Original execution</Link>:null}{detail.rollbacks.map(child=><p key={child.id}><Link href={('/executions/'+child.id) as never}>ROLLBACK: {child.status} ? Verification {child.verificationStatus??"pending"}</Link></p>)}{["OWNER","ADMIN"].includes(c.role)&&r.kind==="APPLY"&&r.completedAt&&r.postChangeSnapshot?<form action={qaExecutionAction}><input type="hidden" name="operation" value="rollback"/><input type="hidden" name="executionId" value={r.id}/><button className="mx-btn">Rollback QA Change</button></form>:null}</Panel></>;
}
