import { describe, expect, it } from "vitest";

import {
  AuthorizationError,
  assertCanMutateWorkspaceResource,
  assertCanReadWorkspaceResource,
  assertSameWorkspace,
  assertWorkspaceContext,
  assertWorkspaceRole,
  canManageWorkspace,
  type WorkspaceContext,
} from "./context";

const ownerContext: WorkspaceContext = {
  workspaceId: "workspace-a",
  actorType: "USER",
  role: "OWNER",
  userId: "user-1",
};

describe("workspace context guards", () => {
  it("requires a server-derived workspace context", () => {
    expect(() => assertWorkspaceContext(null)).toThrow(AuthorizationError);
  });

  it("blocks cross-workspace resource access", () => {
    expect(() =>
      assertSameWorkspace(ownerContext, { workspaceId: "workspace-b" }),
    ).toThrow("Cross-workspace resource access was blocked.");
  });

  it("allows workspace A to read its own records", () => {
    expect(() =>
      assertCanReadWorkspaceResource(ownerContext, {
        workspaceId: "workspace-a",
      }),
    ).not.toThrow();
  });

  it("blocks workspace A from mutating workspace B records", () => {
    expect(() =>
      assertCanMutateWorkspaceResource(ownerContext, {
        workspaceId: "workspace-b",
      }),
    ).toThrow("Cross-workspace resource access was blocked.");
  });

  it("separates management permissions by role", () => {
    const analystContext: WorkspaceContext = {
      ...ownerContext,
      role: "ANALYST",
    };

    expect(canManageWorkspace(ownerContext)).toBe(true);
    expect(canManageWorkspace(analystContext)).toBe(false);
    expect(() => assertWorkspaceRole(analystContext, ["OWNER", "ADMIN"])).toThrow(
      "Workspace role ANALYST is not allowed for this action.",
    );
  });
});
