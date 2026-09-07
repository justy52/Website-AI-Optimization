import type { WorkspaceContext } from "@/domain/tenancy/context";
import { executePrepareDraftAgentRun } from "@/server/agents";

export async function prepareOpportunityDraftWorkflow(
  agentRunId: string,
  context: WorkspaceContext,
) {
  "use workflow";

  return runPrepareOpportunityDraftStep(agentRunId, context);
}

export async function runPrepareOpportunityDraftStep(
  agentRunId: string,
  context: WorkspaceContext,
) {
  "use step";

  return executePrepareDraftAgentRun(context, agentRunId);
}
