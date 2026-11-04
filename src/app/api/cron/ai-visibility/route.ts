import { dispatchQueuedRun } from "@/server/workflow-dispatch";
import { serverEnv } from "@/lib/env";
import { listVisibilityScheduleRefs, prepareScheduledVisibility } from "@/server/ai-visibility";

export async function GET(request: Request) {
  if (!serverEnv.CRON_SECRET) return Response.json({ error: "Cron is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${serverEnv.CRON_SECRET}`) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const refs = await listVisibilityScheduleRefs(); let queued = 0;
  for (const ref of refs) {
    const prepared = await prepareScheduledVisibility(ref.workspace_id, ref.website_id);
    if (prepared && !prepared.run.completedAt) { await dispatchQueuedRun(prepared.context, "visibility", prepared.run.id); queued++; }
  }
  return Response.json({ queued });
}
