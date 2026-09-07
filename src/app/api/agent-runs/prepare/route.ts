import { NextResponse } from "next/server";
import { start } from "workflow/api";

import {
  recordWorkflowRunId,
  requestPrepareDraftForOpportunity,
} from "@/server/agents";
import { getWorkspaceShellContext } from "@/server/auth";
import { prepareOpportunityDraftWorkflow } from "@/workflows/prepare-draft";

export async function POST(request: Request) {
  const shell = await getWorkspaceShellContext();
  const body = (await request.json()) as { opportunityId?: string };

  if (!body.opportunityId) {
    return NextResponse.json(
      { error: "opportunityId is required." },
      { status: 400 },
    );
  }

  const prepared = await requestPrepareDraftForOpportunity(
    shell.workspaceContext,
    body.opportunityId,
  );

  if (prepared.shouldStartWorkflow) {
    const run = await start(prepareOpportunityDraftWorkflow, [
      prepared.agentRunId,
      shell.workspaceContext,
    ]);
    await recordWorkflowRunId(
      shell.workspaceContext,
      prepared.agentRunId,
      run.runId,
    );
  }

  return NextResponse.json(prepared);
}
