"use server";
import { failAction } from "../action-errors";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getWorkspaceShellContext } from "@/server/auth";
import { decideApprovalRequest } from "@/server/agents";

function value(formData: FormData, key: string): string {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

export async function decideApprovalRequestAction(formData: FormData) {
  try {
    const shell = await getWorkspaceShellContext();
    const approvalId = value(formData, "approvalId");

    await decideApprovalRequest(shell.workspaceContext, approvalId, {
      decision: value(formData, "decision") as
        | "APPROVED_UNCHANGED"
        | "APPROVED_MINOR_EDIT"
        | "APPROVED_MAJOR_EDIT"
        | "REJECTED"
        | "CHANGES_REQUESTED",
      comments: value(formData, "comments"),
      reasonCategory: value(formData, "reasonCategory"),
    });

    revalidatePath("/approvals");
    revalidatePath(`/approvals/${approvalId}`);
    redirect(`/approvals/${approvalId}` as never);
  } catch (error) {
    failAction(error, `/approvals/${value(formData, "approvalId")}`);
  }
}
