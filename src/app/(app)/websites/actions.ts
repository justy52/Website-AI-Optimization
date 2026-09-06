"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getWorkspaceShellContext } from "@/server/auth";
import {
  archiveWebsite,
  createWebsite,
  updateWebsite,
} from "@/server/revenue";

function value(formData: FormData, key: string): string {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

export async function createWebsiteAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const website = await createWebsite(shell.workspaceContext, {
    clientId: value(formData, "clientId"),
    displayName: value(formData, "displayName"),
    canonicalUrl: value(formData, "canonicalUrl"),
    domain: value(formData, "domain"),
    authorizationScope: value(formData, "authorizationScope"),
  });

  revalidatePath("/websites");
  revalidatePath(`/clients/${website.clientId}`);
  redirect(`/websites/${website.id}`);
}

export async function updateWebsiteAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const websiteId = value(formData, "websiteId");

  await updateWebsite(shell.workspaceContext, websiteId, {
    displayName: value(formData, "displayName"),
    canonicalUrl: value(formData, "canonicalUrl"),
    domain: value(formData, "domain"),
    authorizationScope: value(formData, "authorizationScope"),
  });

  revalidatePath(`/websites/${websiteId}`);
  revalidatePath("/websites");
}

export async function archiveWebsiteAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const websiteId = value(formData, "websiteId");

  await archiveWebsite(shell.workspaceContext, websiteId);
  revalidatePath("/websites");
  redirect("/websites");
}
