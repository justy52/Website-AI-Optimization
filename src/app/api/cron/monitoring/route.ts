import { NextResponse } from "next/server";
import { start } from "workflow/api";

import {
  listDueMonitoringScheduleRefs,
  recordMonitoringWorkflowRunId,
  requestScheduledMonitoringRun,
} from "@/server/monitoring";
import { monitoringRunWorkflow } from "@/workflows/monitoring";
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
    );

    if (prepared?.shouldStartWorkflow) {
      const run = await start(monitoringRunWorkflow, [
        prepared.monitoringRunId,
        prepared.context,
      ]);
      await recordMonitoringWorkflowRunId(
        prepared.context,
        prepared.monitoringRunId,
        run.runId,
      );
      queued += 1;
    }
  }

  return NextResponse.json({ due: due.length, queued });
}
