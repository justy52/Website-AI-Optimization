"use server";
import { OperationsValidationError } from "@/domain/operations/policy";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { start } from "workflow/api";
import { getWorkspaceShellContext } from "@/server/auth";
import { createQaExecutionFixture, setQaExecutionFlag, requestQaExecutionApproval, decideQaExecutionApproval, requestQaExecution, requestQaRollback } from "@/server/qa-execution";
import { ExecutionValidationError } from "@/domain/execution/qa-execution";
import { AuthorizationError } from "@/domain/tenancy/context";
import { qaExecutionWorkflow } from "@/workflows/qa-execution";
import { recordWorkflowRunId } from "@/server/agents";
const field=(f:FormData,k:string)=>String(f.get(k)??"");
export async function qaExecutionAction(data:FormData) {
 const {workspaceContext:c}=await getWorkspaceShellContext(); let path="/qa-execution";
 try {
  switch(field(data,"operation")) {
   case "fixture": await createQaExecutionFixture(c,field(data,"faultMode")); break;
   case "flag": await setQaExecutionFlag(c,field(data,"key"),field(data,"enabled")==="true"); break;
   case "request": await requestQaExecutionApproval(c,field(data,"packageId")); break;
   case "approve": await decideQaExecutionApproval(c,field(data,"approvalId"),"APPROVED"); break;
   case "reject": await decideQaExecutionApproval(c,field(data,"approvalId"),"REJECTED"); break;
   case "execute": case "rollback": {
    const row=field(data,"operation")==="execute" ? await requestQaExecution(c,field(data,"approvalId")) : await requestQaRollback(c,field(data,"executionId"));
    if (!row.completedAt) { const run=await start(qaExecutionWorkflow,[row.id,c]); await recordWorkflowRunId(c,row.agentRunId,run.runId); }
    path="/executions/"+row.id; break;
   }
   default: throw new ExecutionValidationError("Unknown QA operation.");
  }
 } catch(error) {
  if(error instanceof ExecutionValidationError || error instanceof OperationsValidationError || error instanceof AuthorizationError) redirect(("/qa-execution?validation="+encodeURIComponent(error.message)) as never);
  throw error;
 }
 revalidatePath("/qa-execution"); revalidatePath(path); redirect(path as never);
}
