"use server";
import { OperationsValidationError } from "@/domain/operations/policy";
import { AuthorizationError } from "@/domain/tenancy/context";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  closeStaleAuditRun,
  createReportForAudit,
  finalizeAudit,
  findDuplicateAuditForWebsite,
  startAuditForWebsite,
} from "@/server/audits";
import { getWorkspaceShellContext } from "@/server/auth";
import { z } from "zod";

function value(formData: FormData, key: string): string {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

export async function startAuditAction(formData: FormData) {
  try {
  const shell = await getWorkspaceShellContext();
  const websiteId = value(formData, "websiteId");
  // A repeated click must open the audit it duplicates, not start another.
  const duplicateOf = await findDuplicateAuditForWebsite(shell.workspaceContext, websiteId);
  if (duplicateOf) redirect(`/audits/${duplicateOf}`);
  const audit = await startAuditForWebsite(
    shell.workspaceContext,
    websiteId,
  );

  revalidatePath("/audits");
  redirect(`/audits/${audit.id}`);
  } catch (error) {
    if (error instanceof OperationsValidationError) redirect(`/operations?validation=${encodeURIComponent(error.message)}` as never);
    throw error;
  }
}

export async function finalizeAuditAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const auditId = value(formData, "auditId");

  await finalizeAudit(shell.workspaceContext, auditId);
  revalidatePath(`/audits/${auditId}`);
  redirect(`/audits/${auditId}`);
}

export async function closeStaleAuditRunAction(formData: FormData) {
  const { workspaceContext } = await getWorkspaceShellContext();
  const auditId = value(formData, "auditId");
  if (!z.uuid().safeParse(auditId).success) redirect("/audits");
  const detailPath = `/audits/${auditId}` as const;
  try {
    await closeStaleAuditRun(workspaceContext, {
      auditId,
      runId: value(formData, "runId"),
      reason: value(formData, "reason"),
    });
  } catch (error) {
    if (error instanceof OperationsValidationError || error instanceof AuthorizationError) {
      redirect(`${detailPath}?recovery=unavailable` as never);
    }
    throw error;
  }
  revalidatePath("/audits");
  revalidatePath(detailPath);
  redirect(detailPath);
}

export async function createReportAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const report = await createReportForAudit(
    shell.workspaceContext,
    value(formData, "auditId"),
  );

  revalidatePath("/reports");
  redirect(`/reports/${report.id}`);
}
