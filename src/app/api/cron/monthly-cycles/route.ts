import { NextResponse } from "next/server";
import { start } from "workflow/api";

import { serverEnv } from "@/lib/env";
import { listDueMonthlyCycleClientRefs } from "@/server/monthly-cycles";
import { monthlyCycleCreationWorkflow } from "@/workflows/monthly-cycle";

export async function GET(request: Request) {
  if (!serverEnv.CRON_SECRET) {
    return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${serverEnv.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const due = await listDueMonthlyCycleClientRefs(50);
  let queued = 0;

  for (const ref of due) {
    await start(monthlyCycleCreationWorkflow, [
      {
        workspaceId: ref.workspace_id,
        clientId: ref.client_id,
        year: ref.cycle_year,
        month: ref.cycle_month,
      },
    ]);
    queued += 1;
  }

  return NextResponse.json({ due: due.length, queued });
}
