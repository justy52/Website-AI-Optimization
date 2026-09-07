"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getWorkspaceShellContext } from "@/server/auth";
import { updateOpportunity } from "@/server/opportunities";

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
