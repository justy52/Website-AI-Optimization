import type { WorkspaceContext } from "@/domain/tenancy/context";
import { processQaExecution } from "@/server/qa-execution";

export async function qaExecutionWorkflow(id: string, context: WorkspaceContext) {
  "use workflow";
  return qaExecutionStep(id, context);
}

export async function qaExecutionStep(id: string, context: WorkspaceContext) {
  "use step";
  return processQaExecution(context, id);
}
