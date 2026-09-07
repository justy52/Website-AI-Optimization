"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getWorkspaceShellContext } from "@/server/auth";
import {
  removeOpportunityFromWorkPlan,
  selectOpportunityForWorkPlan,
} from "@/server/opportunities";

function value(formData: FormData, key: string): string {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

function destination(formData: FormData) {
  const clientId = value(formData, "clientId");
  return clientId ? `/work-plan?clientId=${encodeURIComponent(clientId)}` : "/work-plan";
}

export async function selectOpportunityForWorkPlanAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();

  await selectOpportunityForWorkPlan(
    shell.workspaceContext,
    value(formData, "opportunityId"),
  );

  revalidatePath("/work-plan");
  redirect(destination(formData) as never);
}

export async function removeOpportunityFromWorkPlanAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();

  await removeOpportunityFromWorkPlan(
    shell.workspaceContext,
    value(formData, "opportunityId"),
  );

  revalidatePath("/work-plan");
  redirect(destination(formData) as never);
}
