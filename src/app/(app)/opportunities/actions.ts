"use server";
import { failAction } from "../action-errors";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dispatchQueuedRun } from "@/server/workflow-dispatch";

import {
  requestPrepareDraftForOpportunity,
} from "@/server/agents";
import { getWorkspaceShellContext } from "@/server/auth";
import { updateOpportunity } from "@/server/opportunities";
import { ContentOpportunityValidationError, nominateContentOpportunity } from "@/server/content-opportunities";

export async function nominateContentOpportunityAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  let id: string;
  try {
    const result = await nominateContentOpportunity(shell.workspaceContext, { websiteId: value(formData, "websiteId"), title: value(formData, "title"), rationale: value(formData, "rationale"), kind: value(formData, "kind") });
    id = result.id;
  } catch (error) {
    if (error instanceof ContentOpportunityValidationError) redirect(`/opportunities?validation=${encodeURIComponent(error.message)}`);
    throw error;
  }
  revalidatePath("/opportunities");
  redirect(`/opportunities/${id}`);
}

function value(formData: FormData, key: string): string {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

export async function updateOpportunityAction(formData: FormData) {
  try {
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
  } catch (error) {
    failAction(error, `/opportunities/${value(formData, "opportunityId")}`);
  }
}

export async function requestPrepareDraftAction(formData: FormData) {
  try {
  const shell = await getWorkspaceShellContext();
  const opportunityId = value(formData, "opportunityId");
  const prepared = await requestPrepareDraftForOpportunity(
    shell.workspaceContext,
    opportunityId,
  );

  if (prepared.shouldStartWorkflow) {
    await dispatchQueuedRun(shell.workspaceContext, "prepare", prepared.agentRunId);
  }

  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath("/runs");
  revalidatePath("/approvals");
  redirect(`/opportunities/${opportunityId}` as never);
  } catch (error) {
    failAction(error, `/opportunities/${value(formData, "opportunityId")}`);
  }
}
