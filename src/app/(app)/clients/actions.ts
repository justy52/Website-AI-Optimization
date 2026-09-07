"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ServicePlanKey } from "@/domain/service-plans";
import { getWorkspaceShellContext } from "@/server/auth";
import {
  createBusinessFact,
  createClaimPolicy,
  createClientKnowledgeSource,
} from "@/server/agents";
import { archiveClient, updateClient } from "@/server/revenue";

function value(formData: FormData, key: string): string {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

export async function updateClientAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const clientId = value(formData, "clientId");

  await updateClient(shell.workspaceContext, clientId, {
    name: value(formData, "name"),
    servicePlan: value(formData, "servicePlan") as ServicePlanKey,
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  redirect(`/clients/${clientId}`);
}

export async function archiveClientAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const clientId = value(formData, "clientId");

  await archiveClient(shell.workspaceContext, clientId);
  revalidatePath("/clients");
  redirect("/clients");
}

export async function createBusinessFactAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const clientId = value(formData, "clientId");

  await createBusinessFact(shell.workspaceContext, clientId, {
    factType: value(formData, "factType"),
    value: value(formData, "factValue"),
    sourceReference: value(formData, "sourceReference"),
    verificationStatus: value(formData, "verificationStatus"),
  });

  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

export async function createClientKnowledgeSourceAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const clientId = value(formData, "clientId");

  await createClientKnowledgeSource(shell.workspaceContext, clientId, {
    sourceType: value(formData, "sourceType"),
    title: value(formData, "sourceTitle"),
    sourceUrl: value(formData, "sourceUrl"),
    excerpt: value(formData, "sourceExcerpt"),
    verificationStatus: value(formData, "sourceVerificationStatus"),
  });

  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

export async function createClaimPolicyAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const clientId = value(formData, "clientId");

  await createClaimPolicy(shell.workspaceContext, clientId, {
    ruleType: value(formData, "ruleType"),
    claimCategory: value(formData, "claimCategory"),
    rule: value(formData, "claimRule"),
    requiredDisclaimer: value(formData, "requiredDisclaimer"),
  });

  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}
