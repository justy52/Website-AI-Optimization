"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { markAlertsRead } from "@/server/attention";
import { getWorkspaceShellContext } from "@/server/auth";

import { failAction } from "../action-errors";

export async function markAlertsReadAction(formData: FormData) {
  try {
    const shell = await getWorkspaceShellContext();
    const ids = formData.getAll("alertId").filter((item): item is string => typeof item === "string");
    await markAlertsRead(shell.workspaceContext, ids);
    revalidatePath("/dashboard");
    redirect("/dashboard");
  } catch (error) {
    failAction(error, "/dashboard");
  }
}
