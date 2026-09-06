"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ServicePlanKey } from "@/domain/service-plans";
import { getWorkspaceShellContext } from "@/server/auth";
import { archiveClient, updateClient } from "@/server/revenue";

function value(formData: FormData, key: string): string {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

export async function updateClientAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const clientId = value(formData, "clientId");

  await updateClient(shell.workspaceContext, clientId, {
    name: value(formData, "name"),
    servicePlan: value(formData, "servicePlan") as ServicePlanKey,
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
}

export async function archiveClientAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const clientId = value(formData, "clientId");

  await archiveClient(shell.workspaceContext, clientId);
  revalidatePath("/clients");
  redirect("/clients");
}
