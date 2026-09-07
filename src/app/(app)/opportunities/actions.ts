"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { start } from "workflow/api";

import {
  recordWorkflowRunId,
  requestPrepareDraftForOpportunity,
} from "@/server/agents";
import { getWorkspaceShellContext } from "@/server/auth";
import { updateOpportunity } from "@/server/opportunities";
import { prepareOpportunityDraftWorkflow } from "@/workflows/prepare-draft";

function value(formData: FormData, key: string): string {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

export async function updateOpportunityAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const opportunityId = value(formData, "opportunityId");

  await updateOpportunity(shell.workspaceContext, opportunityId, {
    title: value(formData, "title"),
    summary: value(formData, "summary"),
    status: value(formData, "status"),
    impact: value(formData, "impact"),
    confidence: value(formData, "confidence"),
    urgency: value(formData, "urgency"),
    strategicFit: value(formData, "strategicFit"),
    planFit: value(formData, "planFit"),
    staleness: value(formData, "staleness"),
    effort: value(formData, "effort"),
    dependencyState: value(formData, "dependencyState"),
    clientInputState: value(formData, "clientInputState"),
    approvalBlockedState: value(formData, "approvalBlockedState"),
    ownerUserId: value(formData, "ownerUserId"),
  });

  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${opportunityId}`);
  redirect(`/opportunities/${opportunityId}` as never);
}

export async function requestPrepareDraftAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const opportunityId = value(formData, "opportunityId");
  const prepared = await requestPrepareDraftForOpportunity(
    shell.workspaceContext,
    opportunityId,
  );

  if (prepared.shouldStartWorkflow) {
    const run = await start(prepareOpportunityDraftWorkflow, [
      prepared.agentRunId,
      shell.workspaceContext,
    ]);
    await recordWorkflowRunId(
      shell.workspaceContext,
      prepared.agentRunId,
      run.runId,
    );
  }

  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath("/runs");
  revalidatePath("/approvals");
  redirect(`/opportunities/${opportunityId}` as never);
}
