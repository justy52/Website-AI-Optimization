"use server";
import { failAction } from "../action-errors";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dispatchQueuedRun } from "@/server/workflow-dispatch";

import {
  archiveCompetitorTarget,
  CompetitorLimitError,
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
  requestManualMonitoringRun,
} from "@/server/monitoring";
import {
  archiveWebsite,
  createWebsite,
  DuplicateWebsiteError,
  updateWebsite,
} from "@/server/revenue";

function value(formData: FormData, key: string): string {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

export async function createWebsiteAction(formData: FormData) {
  try {
    const shell = await getWorkspaceShellContext();
    let website: Awaited<ReturnType<typeof createWebsite>>;
    try {
      website = await createWebsite(shell.workspaceContext, {
        clientId: value(formData, "clientId"),
        displayName: value(formData, "displayName"),
        canonicalUrl: value(formData, "canonicalUrl"),
        domain: value(formData, "domain"),
        authorizationScope: value(formData, "authorizationScope"),
      });
    } catch (error) {
      if (!(error instanceof DuplicateWebsiteError)) throw error;
      // Take the operator to the record that already exists.
      redirect((error.archived ? "/websites?notice=archived-duplicate" : `/websites/${error.websiteId}?notice=already-added`) as never);
    }

    revalidatePath("/websites");
    revalidatePath(`/clients/${website.clientId}`);
    redirect(`/websites/${website.id}`);
  } catch (error) {
    failAction(error, "/websites");
  }
}

export async function updateWebsiteAction(formData: FormData) {
  try {
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
  } catch (error) {
    failAction(error, `/websites/${value(formData, "websiteId")}`);
  }
}

export async function archiveWebsiteAction(formData: FormData) {
  try {
    const shell = await getWorkspaceShellContext();
    const websiteId = value(formData, "websiteId");

    await archiveWebsite(shell.workspaceContext, websiteId);
    revalidatePath("/websites");
    redirect("/websites");
  } catch (error) {
    failAction(error, `/websites/${value(formData, "websiteId")}`);
  }
}

export async function ensureMonitoringSchedulesAction(formData: FormData) {
  try {
    const shell = await getWorkspaceShellContext();
    const websiteId = value(formData, "websiteId");

    await ensureMonitoringSchedulesForWebsite(shell.workspaceContext, websiteId);
    revalidatePath(`/websites/${websiteId}`);
    revalidatePath("/monitoring");
    redirect(`/websites/${websiteId}`);
  } catch (error) {
    failAction(error, `/websites/${value(formData, "websiteId")}`);
  }
}

export async function requestMonitoringRunAction(formData: FormData) {
  try {
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
    await dispatchQueuedRun(shell.workspaceContext, "monitor", prepared.monitoringRunId);
  }

  revalidatePath(`/websites/${websiteId}`);
  revalidatePath("/monitoring");
  redirect(`/websites/${websiteId}`);
  } catch (error) {
    failAction(error, `/websites/${value(formData, "websiteId")}`);
  }
}

export async function beginSearchConsoleOAuthAction(formData: FormData) {
  try {
    const shell = await getWorkspaceShellContext();
    const websiteId = value(formData, "websiteId");
    const authorizationUrl = await beginGoogleSearchConsoleOAuth(
      shell.workspaceContext,
      websiteId,
      `/websites/${websiteId}`,
    );

    redirect(authorizationUrl as never);
  } catch (error) {
    failAction(error, `/websites/${value(formData, "websiteId")}`);
  }
}

export async function selectSearchConsolePropertyAction(formData: FormData) {
  try {
    const shell = await getWorkspaceShellContext();
    const websiteId = value(formData, "websiteId");

    await selectSearchConsoleProperty(
      shell.workspaceContext,
      value(formData, "propertyId"),
    );
    revalidatePath(`/websites/${websiteId}`);
    revalidatePath("/settings/integrations");
    redirect(`/websites/${websiteId}`);
  } catch (error) {
    failAction(error, `/websites/${value(formData, "websiteId")}`);
  }
}

export async function syncSearchConsoleAction(formData: FormData) {
  try {
    const shell = await getWorkspaceShellContext();
    const websiteId = value(formData, "websiteId");

    await syncSearchConsoleObservations(
      shell.workspaceContext,
      value(formData, "propertyId"),
    );
    revalidatePath(`/websites/${websiteId}`);
    revalidatePath("/settings/integrations");
    redirect(`/websites/${websiteId}`);
  } catch (error) {
    failAction(error, `/websites/${value(formData, "websiteId")}`);
  }
}

export async function disconnectIntegrationAction(formData: FormData) {
  try {
    const shell = await getWorkspaceShellContext();
    const websiteId = value(formData, "websiteId");

    await disconnectIntegrationConnection(
      shell.workspaceContext,
      value(formData, "connectionId"),
    );
    revalidatePath(`/websites/${websiteId}`);
    revalidatePath("/settings/integrations");
    redirect(`/websites/${websiteId}`);
  } catch (error) {
    failAction(error, `/websites/${value(formData, "websiteId")}`);
  }
}

export async function createCompetitorTargetAction(formData: FormData) {
  try {
    const shell = await getWorkspaceShellContext();
    const websiteId = value(formData, "websiteId");

    try {
      await createCompetitorTarget(shell.workspaceContext, websiteId, {
        name: value(formData, "name"),
        domainOrUrl: value(formData, "domainOrUrl"),
        relationship: value(formData, "relationship"),
        notes: value(formData, "notes"),
      });
    } catch (error) {
      if (!(error instanceof CompetitorLimitError)) throw error;
      // Explain the plan limit on the page instead of failing the request.
      redirect(`/websites/${websiteId}?notice=competitor-limit&limit=${error.planLimit}` as never);
    }
    revalidatePath(`/websites/${websiteId}`);
    redirect(`/websites/${websiteId}`);
  } catch (error) {
    failAction(error, `/websites/${value(formData, "websiteId")}`);
  }
}

export async function observeCompetitorTargetAction(formData: FormData) {
  try {
    const shell = await getWorkspaceShellContext();
    const websiteId = value(formData, "websiteId");

    await observeCompetitorTarget(
      shell.workspaceContext,
      value(formData, "competitorTargetId"),
    );
    revalidatePath(`/websites/${websiteId}`);
    redirect(`/websites/${websiteId}`);
  } catch (error) {
    failAction(error, `/websites/${value(formData, "websiteId")}`);
  }
}

export async function archiveCompetitorTargetAction(formData: FormData) {
  try {
    const shell = await getWorkspaceShellContext();
    const websiteId = value(formData, "websiteId");

    await archiveCompetitorTarget(
      shell.workspaceContext,
      value(formData, "competitorTargetId"),
    );
    revalidatePath(`/websites/${websiteId}`);
    redirect(`/websites/${websiteId}`);
  } catch (error) {
    failAction(error, `/websites/${value(formData, "websiteId")}`);
  }
}
