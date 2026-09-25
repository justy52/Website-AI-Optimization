"use server";
import { OperationsValidationError } from "@/domain/operations/policy";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createReportForAudit,
  finalizeAudit,
  startAuditForWebsite,
} from "@/server/audits";
import { getWorkspaceShellContext } from "@/server/auth";

function value(formData: FormData, key: string): string {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

export async function startAuditAction(formData: FormData) {
  try {
  const shell = await getWorkspaceShellContext();
  const audit = await startAuditForWebsite(
    shell.workspaceContext,
    value(formData, "websiteId"),
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

export async function createReportAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const report = await createReportForAudit(
    shell.workspaceContext,
    value(formData, "auditId"),
  );

  revalidatePath("/reports");
  redirect(`/reports/${report.id}`);
}
