import { cache } from "react";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/auth/config";
import type { WorkspaceContext } from "@/domain/tenancy/context";
import { AuthorizationError } from "@/domain/tenancy/context";
import { resolveWorkspaceContextFromMembership } from "@/domain/tenancy/membership";
import { serverEnv } from "@/lib/env";

import {
  listActiveWorkspaceMembershipsForUser,
  type ActiveWorkspaceMembership,
} from "./workspaces";

export const ACTIVE_WORKSPACE_COOKIE = "optiq_active_workspace_id";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
};

export type WorkspaceShellContext = {
  user: AuthenticatedUser;
  memberships: ActiveWorkspaceMembership[];
  currentWorkspace: ActiveWorkspaceMembership;
  workspaceContext: WorkspaceContext;
};

export const getOptionalAuthenticatedUser = cache(async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? session.user.email ?? "Operator",
  } satisfies AuthenticatedUser;
});

export const requireAuthenticatedUser = cache(async () => {
  const user = await getOptionalAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return user;
});

export const getWorkspaceShellContext = cache(async () => {
  const user = await requireAuthenticatedUser();
  const memberships = await listActiveWorkspaceMembershipsForUser(user.id);

  if (memberships.length === 0) {
    redirect("/workspace-setup");
  }

  const cookieStore = await cookies();
  const requestedWorkspaceId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const workspaceContext = resolveWorkspaceContextFromMembership({
    actor: { userId: user.id },
    memberships,
    requestedWorkspaceId,
  });
  const currentWorkspace = memberships.find(
    (membership) => membership.workspaceId === workspaceContext.workspaceId,
  );

  if (!currentWorkspace) {
    throw new AuthorizationError("A valid active workspace membership is required.");
  }

  return {
    user,
    memberships,
    currentWorkspace,
    workspaceContext,
  } satisfies WorkspaceShellContext;
});

export function workspaceCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: serverEnv.APP_ENV !== "local",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}
