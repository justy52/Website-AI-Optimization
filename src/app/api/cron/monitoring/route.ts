import { OperationsValidationError } from "@/domain/operations/policy";
import { NextResponse } from "next/server";
import { dispatchQueuedRun } from "@/server/workflow-dispatch";

import {
  listDueMonitoringScheduleRefs,
  requestScheduledMonitoringRun,
} from "@/server/monitoring";
import { serverEnv } from "@/lib/env";

export async function GET(request: Request) {
  if (!serverEnv.CRON_SECRET) {
    return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${serverEnv.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const due = await listDueMonitoringScheduleRefs(25);
  let queued = 0;

  for (const ref of due) {
    const prepared = await requestScheduledMonitoringRun(
      ref.workspace_id,
      ref.schedule_id,
    ).catch(error => { if (error instanceof OperationsValidationError) return null; throw error; });

    if (prepared?.shouldStartWorkflow) {
      await dispatchQueuedRun(prepared.context, "monitor", prepared.monitoringRunId);
      queued += 1;
    }
  }

  return NextResponse.json({ due: due.length, queued });
}
