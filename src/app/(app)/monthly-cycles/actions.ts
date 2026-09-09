"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { start } from "workflow/api";

import {
  recordWorkflowRunId,
  requestPrepareDraftForOpportunity,
} from "@/server/agents";
import { getWorkspaceShellContext } from "@/server/auth";
import {
  addOpportunityToMonthlyCycle,
  closeMonthlyCycle,
  createMonthlyCycle,
  finalizeMonthlyReport,
  generateMonthlyReportDraft,
  recordImplementationVerification,
  recordManualImplementation,
  removeOpportunityFromMonthlyCycle,
  selectMonthlyCycleWork,
  updateMonthlyDeliverableStatus,
  waiveMonthlyDeliverable,
} from "@/server/monthly-cycles";
import { prepareOpportunityDraftWorkflow } from "@/workflows/prepare-draft";

function value(formData: FormData, key: string): string {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

function optionalNumber(input: string): number | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function cyclePath(cycleId: string) {
  return `/monthly-cycles/${cycleId}`;
}

export async function createMonthlyCycleAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const cycle = await createMonthlyCycle(shell.workspaceContext, {
    clientId: value(formData, "clientId"),
    year: optionalNumber(value(formData, "year")),
    month: optionalNumber(value(formData, "month")),
    timezone: value(formData, "timezone"),
    notes: value(formData, "notes"),
  });

  revalidatePath("/");
  revalidatePath("/clients");
  revalidatePath("/monthly-cycles");
  redirect(cyclePath(cycle.id) as never);
}

export async function selectMonthlyCycleWorkAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const cycleId = value(formData, "monthlyCycleId");

  await selectMonthlyCycleWork(shell.workspaceContext, cycleId);
  revalidatePath("/");
  revalidatePath("/monthly-cycles");
  revalidatePath(cyclePath(cycleId));
  redirect(cyclePath(cycleId) as never);
}

export async function addOpportunityToMonthlyCycleAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const cycleId = value(formData, "monthlyCycleId");

  await addOpportunityToMonthlyCycle(shell.workspaceContext, cycleId, {
    opportunityId: value(formData, "opportunityId"),
    reason: value(formData, "reason"),
  });
  revalidatePath("/");
  revalidatePath("/monthly-cycles");
  revalidatePath(cyclePath(cycleId));
  redirect(cyclePath(cycleId) as never);
}

export async function removeOpportunityFromMonthlyCycleAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const cycleId = value(formData, "monthlyCycleId");

  await removeOpportunityFromMonthlyCycle(
    shell.workspaceContext,
    value(formData, "cycleWorkItemId"),
    { reason: value(formData, "reason") },
  );
  revalidatePath("/");
  revalidatePath("/monthly-cycles");
  revalidatePath(cyclePath(cycleId));
  redirect(cyclePath(cycleId) as never);
}

export async function requestMonthlyPrepareDraftAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const cycleId = value(formData, "monthlyCycleId");
  const opportunityId = value(formData, "opportunityId");
  const prepared = await requestPrepareDraftForOpportunity(
    shell.workspaceContext,
    opportunityId,
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

  revalidatePath("/runs");
  revalidatePath("/approvals");
  revalidatePath("/monthly-cycles");
  revalidatePath(cyclePath(cycleId));
  redirect(cyclePath(cycleId) as never);
}

export async function recordManualImplementationAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const cycleId = value(formData, "monthlyCycleId");

  await recordManualImplementation(
    shell.workspaceContext,
    value(formData, "cycleWorkItemId"),
    {
      whatImplemented: value(formData, "whatImplemented"),
      implementationDate: value(formData, "implementationDate"),
      manualMinutes: optionalNumber(value(formData, "manualMinutes")) ?? 0,
      implementationNotes: value(formData, "implementationNotes"),
      evidenceReference: value(formData, "evidenceReference"),
    },
  );
  revalidatePath("/");
  revalidatePath("/monthly-cycles");
  revalidatePath(cyclePath(cycleId));
  redirect(cyclePath(cycleId) as never);
}

export async function recordImplementationVerificationAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const cycleId = value(formData, "monthlyCycleId");
  const status = value(formData, "status");

  if (
    status !== "VERIFIED" &&
    status !== "VERIFICATION_WARNING" &&
    status !== "VERIFICATION_FAILED"
  ) {
    throw new Error("Verification status is not valid.");
  }

  await recordImplementationVerification(
    shell.workspaceContext,
    value(formData, "cycleWorkItemId"),
    {
      status,
      verificationMethod: value(formData, "verificationMethod"),
      evidence: value(formData, "evidence"),
      limitations: value(formData, "limitations"),
    },
  );
  revalidatePath("/");
  revalidatePath("/monthly-cycles");
  revalidatePath(cyclePath(cycleId));
  redirect(cyclePath(cycleId) as never);
}

export async function generateMonthlyReportDraftAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const cycleId = value(formData, "monthlyCycleId");

  await generateMonthlyReportDraft(shell.workspaceContext, cycleId);
  revalidatePath("/");
  revalidatePath("/reports");
  revalidatePath("/monthly-cycles");
  revalidatePath(cyclePath(cycleId));
  redirect(cyclePath(cycleId) as never);
}

export async function finalizeMonthlyReportAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const cycleId = value(formData, "monthlyCycleId");

  await finalizeMonthlyReport(
    shell.workspaceContext,
    value(formData, "monthlyReportId"),
  );
  revalidatePath("/");
  revalidatePath("/reports");
  revalidatePath("/monthly-cycles");
  revalidatePath(cyclePath(cycleId));
  redirect(cyclePath(cycleId) as never);
}

export async function updateMonthlyDeliverableStatusAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const cycleId = value(formData, "monthlyCycleId");
  const status = value(formData, "status");

  if (
    status !== "NOT_STARTED" &&
    status !== "IN_PROGRESS" &&
    status !== "BLOCKED" &&
    status !== "READY_FOR_REVIEW" &&
    status !== "COMPLETE" &&
    status !== "UNAVAILABLE" &&
    status !== "NOT_APPLICABLE"
  ) {
    throw new Error("Deliverable status is not valid.");
  }

  await updateMonthlyDeliverableStatus(
    shell.workspaceContext,
    value(formData, "deliverableId"),
    {
      status,
      completedCount: optionalNumber(value(formData, "completedCount")),
      completionEvidence: value(formData, "completionEvidence"),
      limitations: value(formData, "limitations"),
    },
  );
  revalidatePath("/");
  revalidatePath("/monthly-cycles");
  revalidatePath(cyclePath(cycleId));
  redirect(cyclePath(cycleId) as never);
}

export async function waiveMonthlyDeliverableAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const cycleId = value(formData, "monthlyCycleId");

  await waiveMonthlyDeliverable(
    shell.workspaceContext,
    value(formData, "deliverableId"),
    { reason: value(formData, "reason") },
  );
  revalidatePath("/");
  revalidatePath("/monthly-cycles");
  revalidatePath(cyclePath(cycleId));
  redirect(cyclePath(cycleId) as never);
}

export async function closeMonthlyCycleAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const cycleId = value(formData, "monthlyCycleId");

  await closeMonthlyCycle(shell.workspaceContext, cycleId);
  revalidatePath("/");
  revalidatePath("/monthly-cycles");
  revalidatePath(cyclePath(cycleId));
  redirect(cyclePath(cycleId) as never);
}
