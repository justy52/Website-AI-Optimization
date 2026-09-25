"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { start } from "workflow/api";
import { getWorkspaceShellContext } from "@/server/auth";
import { OperationsValidationError, setAutomationPause, setWorkspaceBudgets } from "@/server/operations";
import { AuthorizationError } from "@/domain/tenancy/context";
import { createRetentionQaFixture } from "@/server/ai-visibility";
import { VisibilityValidationError } from "@/domain/ai-visibility/model";
import { cleanupWorkspace } from "@/server/retention";
import { recoverInternalRun } from "@/server/recovery";
import { prepareOpportunityDraftWorkflow } from "@/workflows/prepare-draft";
import { monitoringRunWorkflow } from "@/workflows/monitoring";
import { verifyImplementationWorkflow } from "@/workflows/verify-implementation";
import { recordWorkflowRunId } from "@/server/agents";
import { recordMonitoringWorkflowRunId } from "@/server/monitoring";
const field = (d: FormData, key: string) => String(d.get(key) ?? "");
export async function operationsAction(d: FormData) {
  const { workspaceContext: c } = await getWorkspaceShellContext();
  let message = "Operation completed.";
  try {
    const action = field(d,"action");
    if (action === "pause") {
      const scope = field(d,"scope"), category = field(d,"category");
      if (!["WORKSPACE","PLATFORM"].includes(scope) || !["all","monitoring","ai","execution"].includes(category)) throw new OperationsValidationError("Invalid pause selection.");
      await setAutomationPause(c, { scope: scope as "WORKSPACE" | "PLATFORM", category: category as "all" | "monitoring" | "ai" | "execution", paused: field(d,"paused") === "true", reason: field(d,"reason") });
    } else if (action === "budgets") {
      await setWorkspaceBudgets(c, { monthlyCostUsd: field(d,"monthlyCostUsd"), activeWorkflowLimit: Number(field(d,"activeWorkflowLimit")), aiCallLimit: Number(field(d,"aiCallLimit")), visibilityCallLimit: Number(field(d,"visibilityCallLimit")), crawlConcurrency: Number(field(d,"crawlConcurrency")) }, field(d,"reason"));
    } else if (action === "retention_fixture") {
      await createRetentionQaFixture(c,field(d,"websiteId"));
      message = "Created one expired and one current synthetic QA capture.";
    } else if (action === "cleanup") {
      const result = await cleanupWorkspace(c, field(d,"dryRun") === "true");
      message = `Cleanup: ${result.eligibleCount} expired eligible, ${result.deletedCount} deleted${result.dryRun ? " (dry run)" : ""}.`;
    } else if (action === "recovery") {
      const kind = field(d,"kind"), mode = field(d,"mode");
      if (!["prepare","monitor","verification","visibility"].includes(kind) || !["retry","review"].includes(mode)) throw new OperationsValidationError("Invalid recovery action.");
      const result = await recoverInternalRun(c, { kind: kind as "prepare" | "monitor" | "verification" | "visibility", mode: mode as "retry" | "review", id: field(d,"id"), reason: field(d,"reason") });
      if (result.kind !== "review" && result.shouldStartWorkflow) {
        if (result.kind === "monitor") { const run = await start(monitoringRunWorkflow, [result.id,c]); await recordMonitoringWorkflowRunId(c,result.id,run.runId); }
        else { const run = result.kind === "prepare" ? await start(prepareOpportunityDraftWorkflow,[result.id,c]) : await start(verifyImplementationWorkflow,[result.id,c]); await recordWorkflowRunId(c,result.id,run.runId); }
      }
    } else throw new OperationsValidationError("Unknown operation.");
  } catch (error) {
    if (error instanceof VisibilityValidationError || error instanceof OperationsValidationError || error instanceof AuthorizationError) redirect(`/operations?validation=${encodeURIComponent(error.message)}` as never);
    throw error;
  }
  revalidatePath("/operations");
  redirect(`/operations?message=${encodeURIComponent(message)}` as never);
}
