"use server";
import { failAction } from "../action-errors";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getWorkspaceShellContext } from "@/server/auth";
import { reviewIntakeRequest } from "@/server/intake-queue";

export async function reviewIntakeAction(data: FormData) {
  try {
    const shell = await getWorkspaceShellContext();
    const id = z.uuid().parse(data.get("requestId"));
    const decision = z.enum(["import", "dismiss"]).parse(data.get("decision"));
    const leadId = await reviewIntakeRequest(shell.workspaceContext, id, decision);
    revalidatePath("/intake"); revalidatePath("/leads");
    if (leadId) redirect(`/leads/${leadId}`);
  } catch (error) {
    failAction(error, "/intake");
  }
}
