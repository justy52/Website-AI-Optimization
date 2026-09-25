import { OperationsValidationError } from "@/domain/operations/policy";
import { NextResponse } from "next/server";
import { start } from "workflow/api";

import {
  recordWorkflowRunId,
  requestPrepareDraftForOpportunity,
} from "@/server/agents";
import { getWorkspaceShellContext } from "@/server/auth";
import { prepareOpportunityDraftWorkflow } from "@/workflows/prepare-draft";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  try {
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
  } catch (error) {
    if (error instanceof OperationsValidationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "RATE_LIMIT" ? 429 : 400 });
    throw error;
  }
}
