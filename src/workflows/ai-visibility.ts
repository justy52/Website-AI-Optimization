import { sleep } from "workflow";
import type { WorkspaceContext } from "@/domain/tenancy/context";
import { finishVisibilityRun, observeVisibilityPrompt, visibilityRunPromptIds } from "@/server/ai-visibility";

export async function aiVisibilityWorkflow(runId: string, context: WorkspaceContext) {
  "use workflow";
  const ids = await visibilityPromptIdsStep(runId, context);
  for (const promptId of ids) await visibilityObserveStep(runId, promptId, context);
  for (let recovery = 0; recovery <= ids.length && !await visibilityFinishStep(runId, context); recovery++) {
    await sleep("2 minutes");
    for (const promptId of ids) await visibilityObserveStep(runId, promptId, context);
  }
}
async function visibilityPromptIdsStep(runId: string, context: WorkspaceContext) {
  "use step";
  return visibilityRunPromptIds(context, runId);
}
async function visibilityObserveStep(runId: string, promptId: string, context: WorkspaceContext) {
  "use step";
  await observeVisibilityPrompt(context, runId, promptId);
}
async function visibilityFinishStep(runId: string, context: WorkspaceContext) {
  "use step";
  return finishVisibilityRun(context, runId);
}
