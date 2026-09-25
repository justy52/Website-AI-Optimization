import { cleanupWorkspace } from "@/server/retention";
export async function retentionCleanupWorkflow(workspaceId: string) {
  "use workflow";
  return cleanupStep(workspaceId);
}
export async function cleanupStep(workspaceId: string) {
  "use step";
  return cleanupWorkspace({ workspaceId, actorType: "SYSTEM", role: "ADMIN" });
}
