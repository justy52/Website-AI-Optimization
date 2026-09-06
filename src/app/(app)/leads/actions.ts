"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getWorkspaceShellContext } from "@/server/auth";
import {
  archiveLead,
  convertLeadToClient,
  createLead,
  updateLead,
} from "@/server/revenue";

function value(formData: FormData, key: string): string {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

export async function createLeadAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const lead = await createLead(shell.workspaceContext, {
    companyName: value(formData, "companyName"),
    status: value(formData, "status"),
    source: value(formData, "source"),
    contactName: value(formData, "contactName"),
    contactEmail: value(formData, "contactEmail"),
    websiteUrl: value(formData, "websiteUrl"),
    notes: value(formData, "notes"),
  });

  revalidatePath("/leads");
  redirect(`/leads/${lead.id}`);
}

export async function updateLeadAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const leadId = value(formData, "leadId");

  await updateLead(shell.workspaceContext, leadId, {
    companyName: value(formData, "companyName"),
    status: value(formData, "status"),
    source: value(formData, "source"),
    contactName: value(formData, "contactName"),
    contactEmail: value(formData, "contactEmail"),
    websiteUrl: value(formData, "websiteUrl"),
    notes: value(formData, "notes"),
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  redirect(`/leads/${leadId}`);
}

export async function archiveLeadAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const leadId = value(formData, "leadId");

  await archiveLead(shell.workspaceContext, leadId);
  revalidatePath("/leads");
  redirect("/leads");
}

export async function convertLeadAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const leadId = value(formData, "leadId");
  const client = await convertLeadToClient(shell.workspaceContext, leadId);

  revalidatePath("/leads");
  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
}
