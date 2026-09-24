import Link from "next/link";
import { notFound } from "next/navigation";
import { serverEnv } from "@/lib/env";
import { getWorkspaceShellContext } from "@/server/auth";
import { getQaExecutionView } from "@/server/qa-execution";
import { fixtureUrl, parseAction, QA_WORKSPACE_FLAG, QA_ACTION_FLAG } from "@/domain/execution/qa-execution";
import { PageHeader, Panel } from "../ui";
import { qaExecutionAction } from "./actions";
export default async function QaExecutionPage({searchParams}:{searchParams:Promise<{validation?:string}>}) {
 if(serverEnv.APP_ENV!=="qa") notFound();
 const {workspaceContext:c}=await getWorkspaceShellContext(); const view=await getQaExecutionView(c); const human=["OWNER","ADMIN"].includes(c.role); const validation=(await searchParams).validation;
 return <><PageHeader title="QA Execution" eyebrow="QA SANDBOX EXECUTION" />
 <p>Only harmless application-owned fixtures can change. Artifact approval never authorizes execution. No customer CMS is connected. QA actions do not consume customer fulfillment credit.</p>
 {validation?<p role="alert">{validation}</p>:null}
 <Panel title="Emergency stops"><p>Platform QA execution: {serverEnv.QA_EXECUTE_ENABLED?"ENABLED":"DISABLED"}. Production external EXECUTE remains disabled.</p>
 {[[QA_WORKSPACE_FLAG,view.flags.workspaceEnabled,"Workspace execution"],[QA_ACTION_FLAG,view.flags.actionEnabled,"QA metadata action"]].map(([key,enabled,label])=><form key={String(key)} action={qaExecutionAction}><input type="hidden" name="operation" value="flag"/><input type="hidden" name="key" value={String(key)}/><input type="hidden" name="enabled" value={String(!enabled)}/><p>{label}: {enabled?"ENABLED":"DISABLED"}</p>{human?<button className="mx-btn">{enabled?"Pause":"Enable"} {label}</button>:null}</form>)}</Panel>
 <Panel title="Dedicated fixtures"><p>One QA fixture per workspace. Use a separate disposable QA workspace for another scenario.</p>{human && view.fixtures.length === 0?<form action={qaExecutionAction}><input type="hidden" name="operation" value="fixture"/><label>QA scenario<select className="mx-input" name="faultMode"><option value="NONE">Normal delivery</option><option value="TITLE_MISMATCH">Simulated title delivery mismatch</option></select></label><button className="mx-btn">Create QA fixture</button></form>:null}
 {view.fixtures.map(f=><div key={f.id} data-testid="qa-fixture"><p>{f.id} | {f.faultMode} | Revision {f.revision} | Mutations {f.revision-1}</p><Link href={('/websites/'+f.websiteId) as never}>Audit and prepare fixture</Link> | <a href={fixtureUrl(c.workspaceId,f.id)}>Public fixture</a><p>Title: {f.title}</p><p>Description: {f.description || "Empty"}</p></div>)}</Panel>
 <Panel title="Separate execution approvals">{view.approvals.map(a=>{const action=parseAction(a.actionSummary);return <div key={a.id} data-testid="execution-approval"><h3>{a.status} | {action.actionKey}</h3><p>Target: {action.target}</p><p>Artifact v{action.artifactVersion} | Risk LOW (QA fixture only) | Rollback supported | Independent verification required</p><Link href={('/implementation-packages/'+a.implementationPackageId) as never}>Exact implementation package</Link><pre className="mx-report">{JSON.stringify({before:action.before,after:action.after,actionHash:a.actionHash},null,2)}</pre>{human&&a.status==="PENDING"?<><form action={qaExecutionAction}><input type="hidden" name="operation" value="approve"/><input type="hidden" name="approvalId" value={a.id}/><button className="mx-btn">Approve QA Execution</button></form><form action={qaExecutionAction}><input type="hidden" name="operation" value="reject"/><input type="hidden" name="approvalId" value={a.id}/><button className="mx-btn">Reject QA Execution</button></form></>:null}{human&&a.status==="APPROVED"?<form action={qaExecutionAction}><input type="hidden" name="operation" value="execute"/><input type="hidden" name="approvalId" value={a.id}/><button className="mx-btn">Execute QA Change</button></form>:null}</div>})}</Panel>
 <Panel title="Retained execution history">{view.records.map(r=><p key={r.id}><Link href={('/executions/'+r.id) as never}>{r.kind} | {r.status} | {r.id}</Link></p>)}</Panel></>;
}
