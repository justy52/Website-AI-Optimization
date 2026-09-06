"use server";

import { revalidatePath } from "next/cache";

import { finalizeReport } from "@/server/audits";
import { getWorkspaceShellContext } from "@/server/auth";

function value(formData: FormData, key: string): string {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

export async function finalizeReportAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const reportId = value(formData, "reportId");

  await finalizeReport(shell.workspaceContext, reportId);
  revalidatePath(`/reports/${reportId}`);
  revalidatePath("/reports");
}
