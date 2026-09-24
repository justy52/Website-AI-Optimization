import {
  AuthorizationError,
  type WorkspaceContext,
  type WorkspaceRole,
} from "./context";

export type MembershipStatus = "ACTIVE" | "INVITED" | "SUSPENDED";

export type AuthenticatedActor = {
  userId?: string | null;
};

export type WorkspaceMembershipRecord = {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  status: MembershipStatus;
};

export type ResolveWorkspaceContextInput = {
  actor: AuthenticatedActor | null | undefined;
  memberships: readonly WorkspaceMembershipRecord[];
  requestedWorkspaceId?: string | null;
  correlationId?: string;
};

export function resolveWorkspaceContextFromMembership(
  input: ResolveWorkspaceContextInput,
): WorkspaceContext {
  const userId = input.actor?.userId?.trim();

  if (!userId) {
    throw new AuthorizationError("Authentication is required.");
  }

  const activeMemberships = input.memberships.filter(
    (membership) =>
      membership.userId === userId && membership.status === "ACTIVE",
  );

  const requestedWorkspaceId = input.requestedWorkspaceId?.trim();
  const membership = requestedWorkspaceId
    ? activeMemberships.find(
        (candidate) => candidate.workspaceId === requestedWorkspaceId,
      )
    : activeMemberships.length === 1
      ? activeMemberships[0]
      : undefined;

  if (!membership) {
    throw new AuthorizationError(
      "A valid active workspace membership is required.",
    );
  }

  return {
    workspaceId: membership.workspaceId,
    actorType: "USER",
    role: membership.role,
    userId,
    correlationId: input.correlationId,
  };
}

// A browser preference is not an explicit authorization request. It can outlive
// sign-out or membership revocation; select only a current authenticated scope.
// Explicit switchWorkspaceAction continues to use the strict resolver above.
export function resolveWorkspaceShellPreference(input: ResolveWorkspaceContextInput): WorkspaceContext {
  const active = input.memberships.filter(m => m.userId === input.actor?.userId && m.status === "ACTIVE");
  const requested = active.find(m => m.workspaceId === input.requestedWorkspaceId);
  return resolveWorkspaceContextFromMembership({ ...input, requestedWorkspaceId: requested?.workspaceId ?? active[0]?.workspaceId });
}
