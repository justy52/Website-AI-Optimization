"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ACTIVE_WORKSPACE_COOKIE,
  requireAuthenticatedUser,
  workspaceCookieOptions,
} from "@/server/auth";
import {
  createWorkspaceForAuthenticatedUser,
  listActiveWorkspaceMembershipsForUser,
} from "@/server/workspaces";
import { resolveWorkspaceContextFromMembership } from "@/domain/tenancy/membership";

function requiredString(formData: FormData, key: string): string {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} is required.`);
  }

  return value.trim();
}

export async function switchWorkspaceAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const requestedWorkspaceId = requiredString(formData, "workspaceId");
  const memberships = await listActiveWorkspaceMembershipsForUser(user.id);

  const context = resolveWorkspaceContextFromMembership({
    actor: { userId: user.id },
    memberships,
    requestedWorkspaceId,
  });

  const cookieStore = await cookies();
  cookieStore.set(
    ACTIVE_WORKSPACE_COOKIE,
    context.workspaceId,
    workspaceCookieOptions(),
  );
}

export async function createWorkspaceAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const workspace = await createWorkspaceForAuthenticatedUser({
    userId: user.id,
    name: requiredString(formData, "name"),
  });

  const cookieStore = await cookies();
  cookieStore.set(
    ACTIVE_WORKSPACE_COOKIE,
    workspace.id,
    workspaceCookieOptions(),
  );

  redirect("/");
}
