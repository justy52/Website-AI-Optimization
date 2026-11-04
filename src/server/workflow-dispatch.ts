import { start } from "workflow/api";
import { db } from "@/db/client";
import type { WorkspaceContext } from "@/domain/tenancy/context";
import { prepareOpportunityDraftWorkflow } from "@/workflows/prepare-draft";
import { monitoringRunWorkflow } from "@/workflows/monitoring";
import { verifyImplementationWorkflow } from "@/workflows/verify-implementation";
import { aiVisibilityWorkflow } from "@/workflows/ai-visibility";
import { qaExecutionWorkflow } from "@/workflows/qa-execution";
import { claimQueuedDispatch, settleQueuedDispatch, listQueuedDispatchRefs, type DispatchClaim, type DispatchKind } from "./dispatch-state";

async function launchWorkflow(claim: DispatchClaim) {
  const args: [string, WorkspaceContext] = [claim.workflowTargetId, claim.context];
  switch (claim.kind) {
    case "prepare": return start(prepareOpportunityDraftWorkflow, args);
    case "monitor": return start(monitoringRunWorkflow, args);
    case "verification": return start(verifyImplementationWorkflow, args);
    case "visibility": return start(aiVisibilityWorkflow, args);
    case "qa_execute": return start(qaExecutionWorkflow, args);
  }
}

// At-least-once dispatch. A timeout can mean start() succeeded, and a process
// can die before saving its runId. Retry the SAME application run, never create
// a replacement attempt. Worker claims / visibility call reservations own safety.
export async function dispatchQueuedRun(c: WorkspaceContext, kind: DispatchKind, id: string, database = db, launch: (claim: DispatchClaim) => Promise<{ runId: string }> = launchWorkflow, at = new Date()) {
  const claim = await claimQueuedDispatch(c, kind, id, database, at);
  if (!claim) return { status: "SKIPPED" as const };
  let workflowRunId: string | null = null;
  try { workflowRunId = (await launch(claim)).runId; }
  catch { /* The durable lease expires even if the process dies here. */ }
  try { await settleQueuedDispatch(claim, workflowRunId, database, at); }
  catch {
    // Do not report a committed request as a creation failure. This may already
    // be executing; the lease and worker claim make eventual redispatch safe.
    console.error("workflow_dispatch.receipt_unconfirmed", { kind, id, workspaceId: c.workspaceId });
  }
  return { status: workflowRunId ? "STARTED" as const : "PENDING" as const };
}

export async function dispatchQueuedBatch(limit = 25, database = db) {
  const refs = await listQueuedDispatchRefs(limit, database);
  let started = 0, pending = 0, skipped = 0;
  for (const ref of refs) {
    try {
      const result = await dispatchQueuedRun({ workspaceId: ref.workspace_id, actorType: "SYSTEM", role: "ADMIN" }, ref.kind, ref.run_id, database);
      if (result.status === "STARTED") started++;
      else if (result.status === "PENDING") pending++;
      else skipped++;
    } catch {
      // One paused tenant or database failure must not starve the rest.
      pending++;
      console.error("workflow_dispatch.deferred", { kind: ref.kind, id: ref.run_id, workspaceId: ref.workspace_id });
    }
  }
  return { due: refs.length, started, pending, skipped };
}
