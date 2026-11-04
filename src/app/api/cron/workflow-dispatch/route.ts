import { serverEnv } from "@/lib/env";
import { dispatchQueuedBatch } from "@/server/workflow-dispatch";

export async function GET(request: Request) {
  if (!serverEnv.CRON_SECRET) return Response.json({ error: "Cron is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${serverEnv.CRON_SECRET}`) return Response.json({ error: "Unauthorized." }, { status: 401 });
  return Response.json(await dispatchQueuedBatch());
}
