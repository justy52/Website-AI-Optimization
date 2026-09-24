"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { start } from "workflow/api";
import { MonthlyCycleValidationError } from "@/domain/monthly-cycles/validation";
import { AuthorizationError } from "@/domain/tenancy/context";
import { getWorkspaceShellContext } from "@/server/auth";
import { createImplementationPackage, requestImplementationVerification } from "@/server/verification";
import { recordWorkflowRunId } from "@/server/agents";
import { verifyImplementationWorkflow } from "@/workflows/verify-implementation";

const field = (data: FormData, key: string) => String(data.get(key) ?? "");
export async function createImplementationPackageAction(data: FormData) {
  const shell = await getWorkspaceShellContext();
  let id: string;
  const artifactId = field(data, "artifactId");
  try { id = (await createImplementationPackage(shell.workspaceContext, artifactId)).id; }
  catch (error) {
    if (error instanceof MonthlyCycleValidationError || error instanceof AuthorizationError) redirect(`/drafts/${encodeURIComponent(artifactId)}?validation=${encodeURIComponent(error.message)}` as never);
    throw error;
  }
  revalidatePath("/monthly-cycles");
  redirect(`/implementation-packages/${id}` as never);
}
export async function verifyImplementationAction(data: FormData) {
  const shell = await getWorkspaceShellContext();
  const path = `/monthly-cycles/${encodeURIComponent(field(data, "monthlyCycleId"))}`;
  try {
    const result = await requestImplementationVerification(shell.workspaceContext, field(data, "implementationId"));
    if (result.shouldStartWorkflow) {
      const workflow = await start(verifyImplementationWorkflow, [result.agentRunId, shell.workspaceContext]);
      await recordWorkflowRunId(shell.workspaceContext, result.agentRunId, workflow.runId);
    }
  } catch (error) {
    if (error instanceof MonthlyCycleValidationError || error instanceof AuthorizationError) redirect(`${path}?validation=${encodeURIComponent(error.message)}` as never);
    throw error;
  }
  revalidatePath(path); revalidatePath("/"); revalidatePath("/runs");
  redirect(path as never);
}
