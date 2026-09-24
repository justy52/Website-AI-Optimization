"use server";

import { MonthlyCycleValidationError } from "@/domain/monthly-cycles/validation";
import { AuthorizationError } from "@/domain/tenancy/context";

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
  assertMonthlyCyclePrepareTarget,
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
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) throw new MonthlyCycleValidationError("Enter a whole number.");
  return parsed;
}

function cyclePath(cycleId: string) {
  return `/monthly-cycles/${cycleId}`;
}

async function createMonthlyCycleActionImpl(formData: FormData) {
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

async function selectMonthlyCycleWorkActionImpl(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const cycleId = value(formData, "monthlyCycleId");

  await selectMonthlyCycleWork(shell.workspaceContext, cycleId);
  revalidatePath("/");
  revalidatePath("/monthly-cycles");
  revalidatePath(cyclePath(cycleId));
  redirect(cyclePath(cycleId) as never);
}

async function addOpportunityToMonthlyCycleActionImpl(formData: FormData) {
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

async function removeOpportunityFromMonthlyCycleActionImpl(formData: FormData) {
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

async function requestMonthlyPrepareDraftActionImpl(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const cycleId = value(formData, "monthlyCycleId");
  const opportunityId = value(formData, "opportunityId");
  await assertMonthlyCyclePrepareTarget(shell.workspaceContext, cycleId, opportunityId);
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

async function recordManualImplementationActionImpl(formData: FormData) {
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
      implementationPackageId: value(formData, "implementationPackageId"),
    },
  );
  revalidatePath("/");
  revalidatePath("/monthly-cycles");
  revalidatePath(cyclePath(cycleId));
  redirect(cyclePath(cycleId) as never);
}

async function recordImplementationVerificationActionImpl(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const cycleId = value(formData, "monthlyCycleId");
  const status = value(formData, "status");

  if (
    status !== "VERIFIED" &&
    status !== "VERIFICATION_WARNING" &&
    status !== "VERIFICATION_FAILED"
  ) {
    throw new MonthlyCycleValidationError("Verification status is not valid.");
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

async function generateMonthlyReportDraftActionImpl(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const cycleId = value(formData, "monthlyCycleId");

  await generateMonthlyReportDraft(shell.workspaceContext, cycleId);
  revalidatePath("/");
  revalidatePath("/reports");
  revalidatePath("/monthly-cycles");
  revalidatePath(cyclePath(cycleId));
  redirect(cyclePath(cycleId) as never);
}

async function finalizeMonthlyReportActionImpl(formData: FormData) {
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

async function updateMonthlyDeliverableStatusActionImpl(formData: FormData) {
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
    throw new MonthlyCycleValidationError("Deliverable status is not valid.");
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

async function waiveMonthlyDeliverableActionImpl(formData: FormData) {
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

async function closeMonthlyCycleActionImpl(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const cycleId = value(formData, "monthlyCycleId");

  const result = await closeMonthlyCycle(shell.workspaceContext, cycleId);
  if ("error" in result) redirect(`${cyclePath(cycleId)}?validation=${encodeURIComponent(result.error!)}` as never);
  revalidatePath("/");
  revalidatePath("/monthly-cycles");
  revalidatePath(cyclePath(cycleId));
  redirect(cyclePath(cycleId) as never);
}

async function runMonthlyAction(operation: () => Promise<void>, formData: FormData) {
  let message: string | undefined;
  try {
    await operation();
  } catch (error) {
    if (!(error instanceof MonthlyCycleValidationError) && !(error instanceof AuthorizationError)) throw error;
    message = error.message;
  }
  if (message) {
    const cycleId = value(formData, "monthlyCycleId");
    const path = cycleId ? cyclePath(encodeURIComponent(cycleId)) : "/monthly-cycles";
    redirect(`${path}?validation=${encodeURIComponent(message)}` as never);
  }
}

export async function createMonthlyCycleAction(formData: FormData) {
  await runMonthlyAction(() => createMonthlyCycleActionImpl(formData), formData);
}

export async function selectMonthlyCycleWorkAction(formData: FormData) {
  await runMonthlyAction(() => selectMonthlyCycleWorkActionImpl(formData), formData);
}

export async function addOpportunityToMonthlyCycleAction(formData: FormData) {
  await runMonthlyAction(() => addOpportunityToMonthlyCycleActionImpl(formData), formData);
}

export async function removeOpportunityFromMonthlyCycleAction(formData: FormData) {
  await runMonthlyAction(() => removeOpportunityFromMonthlyCycleActionImpl(formData), formData);
}

export async function requestMonthlyPrepareDraftAction(formData: FormData) {
  await runMonthlyAction(() => requestMonthlyPrepareDraftActionImpl(formData), formData);
}

export async function recordManualImplementationAction(formData: FormData) {
  await runMonthlyAction(() => recordManualImplementationActionImpl(formData), formData);
}

export async function recordImplementationVerificationAction(formData: FormData) {
  await runMonthlyAction(() => recordImplementationVerificationActionImpl(formData), formData);
}

export async function generateMonthlyReportDraftAction(formData: FormData) {
  await runMonthlyAction(() => generateMonthlyReportDraftActionImpl(formData), formData);
}

export async function finalizeMonthlyReportAction(formData: FormData) {
  await runMonthlyAction(() => finalizeMonthlyReportActionImpl(formData), formData);
}

export async function updateMonthlyDeliverableStatusAction(formData: FormData) {
  await runMonthlyAction(() => updateMonthlyDeliverableStatusActionImpl(formData), formData);
}

export async function waiveMonthlyDeliverableAction(formData: FormData) {
  await runMonthlyAction(() => waiveMonthlyDeliverableActionImpl(formData), formData);
}

export async function closeMonthlyCycleAction(formData: FormData) {
  await runMonthlyAction(() => closeMonthlyCycleActionImpl(formData), formData);
}
