import { start } from "workflow/api";
import { serverEnv } from "@/lib/env";
import { retentionWorkspaceRefs } from "@/server/retention";
import { retentionCleanupWorkflow } from "@/workflows/retention";
export async function GET(request: Request) {
  if (!serverEnv.CRON_SECRET) return Response.json({ error: "Cron is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${serverEnv.CRON_SECRET}`) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const refs = await retentionWorkspaceRefs();
  for (const workspaceId of refs) await start(retentionCleanupWorkflow, [workspaceId]);
  return Response.json({ queued: refs.length, maximumCapturesPerWorkspace: 100 });
}
