"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { start } from "workflow/api";

import {
  archiveCompetitorTarget,
  createCompetitorTarget,
  observeCompetitorTarget,
} from "@/server/competitors";
import { getWorkspaceShellContext } from "@/server/auth";
import {
  beginGoogleSearchConsoleOAuth,
  disconnectIntegrationConnection,
  selectSearchConsoleProperty,
  syncSearchConsoleObservations,
} from "@/server/integrations";
import {
  ensureMonitoringSchedulesForWebsite,
  recordMonitoringWorkflowRunId,
  requestManualMonitoringRun,
} from "@/server/monitoring";
import {
  archiveWebsite,
  createWebsite,
  updateWebsite,
} from "@/server/revenue";
import { monitoringRunWorkflow } from "@/workflows/monitoring";

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
  redirect(`/websites/${websiteId}`);
}

export async function archiveWebsiteAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const websiteId = value(formData, "websiteId");

  await archiveWebsite(shell.workspaceContext, websiteId);
  revalidatePath("/websites");
  redirect("/websites");
}

export async function ensureMonitoringSchedulesAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const websiteId = value(formData, "websiteId");

  await ensureMonitoringSchedulesForWebsite(shell.workspaceContext, websiteId);
  revalidatePath(`/websites/${websiteId}`);
  revalidatePath("/monitoring");
  redirect(`/websites/${websiteId}`);
}

export async function requestMonitoringRunAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const websiteId = value(formData, "websiteId");
  const monitorKey = value(formData, "monitorKey");

  if (monitorKey !== "website_health" && monitorKey !== "search_console") {
    throw new Error("Unsupported monitor key.");
  }

  const prepared = await requestManualMonitoringRun(
    shell.workspaceContext,
    websiteId,
    monitorKey,
  );

  if (prepared.shouldStartWorkflow) {
    const run = await start(monitoringRunWorkflow, [
      prepared.monitoringRunId,
      shell.workspaceContext,
    ]);
    await recordMonitoringWorkflowRunId(
      shell.workspaceContext,
      prepared.monitoringRunId,
      run.runId,
    );
  }

  revalidatePath(`/websites/${websiteId}`);
  revalidatePath("/monitoring");
  redirect(`/websites/${websiteId}`);
}

export async function beginSearchConsoleOAuthAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const websiteId = value(formData, "websiteId");
  const authorizationUrl = await beginGoogleSearchConsoleOAuth(
    shell.workspaceContext,
    websiteId,
    `/websites/${websiteId}`,
  );

  redirect(authorizationUrl as never);
}

export async function selectSearchConsolePropertyAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const websiteId = value(formData, "websiteId");

  await selectSearchConsoleProperty(
    shell.workspaceContext,
    value(formData, "propertyId"),
  );
  revalidatePath(`/websites/${websiteId}`);
  revalidatePath("/settings/integrations");
  redirect(`/websites/${websiteId}`);
}

export async function syncSearchConsoleAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const websiteId = value(formData, "websiteId");

  await syncSearchConsoleObservations(
    shell.workspaceContext,
    value(formData, "propertyId"),
  );
  revalidatePath(`/websites/${websiteId}`);
  revalidatePath("/settings/integrations");
  redirect(`/websites/${websiteId}`);
}

export async function disconnectIntegrationAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const websiteId = value(formData, "websiteId");

  await disconnectIntegrationConnection(
    shell.workspaceContext,
    value(formData, "connectionId"),
  );
  revalidatePath(`/websites/${websiteId}`);
  revalidatePath("/settings/integrations");
  redirect(`/websites/${websiteId}`);
}

export async function createCompetitorTargetAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const websiteId = value(formData, "websiteId");

  await createCompetitorTarget(shell.workspaceContext, websiteId, {
    name: value(formData, "name"),
    domainOrUrl: value(formData, "domainOrUrl"),
    relationship: value(formData, "relationship"),
    notes: value(formData, "notes"),
  });
  revalidatePath(`/websites/${websiteId}`);
  redirect(`/websites/${websiteId}`);
}

export async function observeCompetitorTargetAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const websiteId = value(formData, "websiteId");

  await observeCompetitorTarget(
    shell.workspaceContext,
    value(formData, "competitorTargetId"),
  );
  revalidatePath(`/websites/${websiteId}`);
  redirect(`/websites/${websiteId}`);
}

export async function archiveCompetitorTargetAction(formData: FormData) {
  const shell = await getWorkspaceShellContext();
  const websiteId = value(formData, "websiteId");

  await archiveCompetitorTarget(
    shell.workspaceContext,
    value(formData, "competitorTargetId"),
  );
  revalidatePath(`/websites/${websiteId}`);
  redirect(`/websites/${websiteId}`);
}
