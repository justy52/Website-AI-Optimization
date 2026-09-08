"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getWorkspaceShellContext } from "@/server/auth";
import { disconnectIntegrationConnection } from "@/server/integrations";

function value(formData: FormData, key: string): string {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

export async function disconnectIntegrationFromSettingsAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();

  await disconnectIntegrationConnection(
    shell.workspaceContext,
    value(formData, "connectionId"),
  );
  revalidatePath("/settings/integrations");
  redirect("/settings/integrations" as never);
}
