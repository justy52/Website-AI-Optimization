"use server";
import { OperationsValidationError } from "@/domain/operations/policy";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { start } from "workflow/api";
import { getWorkspaceShellContext } from "@/server/auth";
import { approveVisibilityCompetitorAliases, createVisibilityPromptSet, recordManualVisibilityObservation, requestVisibilityRun } from "@/server/ai-visibility";
import { VisibilityValidationError } from "@/domain/ai-visibility/model";
import { AuthorizationError } from "@/domain/tenancy/context";
import { aiVisibilityWorkflow } from "@/workflows/ai-visibility";
const field = (data: FormData, key: string) => String(data.get(key) ?? "");
export async function visibilityAction(data: FormData) {
  const { workspaceContext: context } = await getWorkspaceShellContext();
  const websiteId = field(data, "websiteId");
  let path = `/ai-visibility?websiteId=${encodeURIComponent(websiteId)}`;
  try {
    switch (field(data, "operation")) {
      case "generate": await createVisibilityPromptSet(context, websiteId); break;
      case "aliases": await approveVisibilityCompetitorAliases(context, websiteId); break;
      case "run": case "fixture": {
        const run = await requestVisibilityRun(context, websiteId, field(data, "operation") === "fixture" ? "QA_FIXTURE" : "API");
        if (!run.completedAt) await start(aiVisibilityWorkflow, [run.id, context]);
        break;
      }
      case "manual": await recordManualVisibilityObservation(context, websiteId, { promptId: field(data, "promptId"), surface: field(data, "surface"), answer: field(data, "answer"), observedAt: field(data, "observedAt"), limitations: field(data, "limitations") }); break;
      default: throw new VisibilityValidationError("Unknown visibility operation.");
    }
  } catch (error) {
    if (!(error instanceof VisibilityValidationError) && !(error instanceof OperationsValidationError || error instanceof AuthorizationError)) throw error;
    path += `&validation=${encodeURIComponent(error.message)}`;
  }
  revalidatePath("/ai-visibility"); redirect(path as never);
}
