import type { WorkspaceContext } from "@/domain/tenancy/context";
import { executeImplementationVerification } from "@/server/verification";

export async function verifyImplementationWorkflow(agentRunId: string, context: WorkspaceContext) {
  "use workflow";
  return verifyImplementationStep(agentRunId, context);
}
export async function verifyImplementationStep(agentRunId: string, context: WorkspaceContext) {
  "use step";
  return executeImplementationVerification(context, agentRunId);
}
