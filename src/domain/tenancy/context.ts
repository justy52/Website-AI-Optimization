export const workspaceRoles = ["OWNER", "ADMIN", "ANALYST"] as const;

export type WorkspaceRole = (typeof workspaceRoles)[number];

export type ActorType = "USER" | "AGENT" | "SYSTEM";

export type WorkspaceContext = {
  workspaceId: string;
  actorType: ActorType;
  role: WorkspaceRole;
  userId?: string;
  agentRunId?: string;
  correlationId?: string;
};

export type WorkspaceScopedResource = {
  workspaceId: string;
};

export class AuthorizationError extends Error {
  constructor(message = "The current actor is not authorized for this resource.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function assertWorkspaceContext(
  context: WorkspaceContext | null | undefined,
): asserts context is WorkspaceContext {
  if (!context?.workspaceId) {
    throw new AuthorizationError("A server-derived workspace context is required.");
  }
}

export function assertSameWorkspace(
  context: WorkspaceContext,
  resource: WorkspaceScopedResource,
): void {
  assertWorkspaceContext(context);

  if (context.workspaceId !== resource.workspaceId) {
    throw new AuthorizationError("Cross-workspace resource access was blocked.");
  }
}

export function assertCanReadWorkspaceResource(
  context: WorkspaceContext,
  resource: WorkspaceScopedResource,
): void {
  assertSameWorkspace(context, resource);
}

export function assertCanMutateWorkspaceResource(
  context: WorkspaceContext,
  resource: WorkspaceScopedResource,
): void {
  assertSameWorkspace(context, resource);
}

export function hasWorkspaceRole(
  context: WorkspaceContext,
  allowedRoles: readonly WorkspaceRole[],
): boolean {
  assertWorkspaceContext(context);
  return allowedRoles.includes(context.role);
}

export function assertWorkspaceRole(
  context: WorkspaceContext,
  allowedRoles: readonly WorkspaceRole[],
): void {
  if (!hasWorkspaceRole(context, allowedRoles)) {
    throw new AuthorizationError(
      `Workspace role ${context.role} is not allowed for this action.`,
    );
  }
}

export function canManageWorkspace(context: WorkspaceContext): boolean {
  return hasWorkspaceRole(context, ["OWNER", "ADMIN"]);
}
