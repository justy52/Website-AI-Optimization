import { describe, expect, it } from "vitest";

import { AuthorizationError } from "./context";
import {
  resolveWorkspaceContextFromMembership,
  type WorkspaceMembershipRecord,
} from "./membership";

const memberships: WorkspaceMembershipRecord[] = [
  {
    workspaceId: "workspace-a",
    userId: "user-1",
    role: "OWNER",
    status: "ACTIVE",
  },
  {
    workspaceId: "workspace-b",
    userId: "user-2",
    role: "ADMIN",
    status: "ACTIVE",
  },
  {
    workspaceId: "workspace-c",
    userId: "user-1",
    role: "ANALYST",
    status: "SUSPENDED",
  },
];

describe("workspace membership context resolution", () => {
  it("derives workspace context from an authenticated active membership", () => {
    const context = resolveWorkspaceContextFromMembership({
      actor: { userId: "user-1" },
      memberships,
      requestedWorkspaceId: "workspace-a",
      correlationId: "request-1",
    });

    expect(context).toMatchObject({
      workspaceId: "workspace-a",
      actorType: "USER",
      role: "OWNER",
      userId: "user-1",
      correlationId: "request-1",
    });
  });

  it("rejects unauthenticated access", () => {
    expect(() =>
      resolveWorkspaceContextFromMembership({
        actor: null,
        memberships,
        requestedWorkspaceId: "workspace-a",
      }),
    ).toThrow(AuthorizationError);
  });

  it("rejects inactive or invalid membership", () => {
    expect(() =>
      resolveWorkspaceContextFromMembership({
        actor: { userId: "user-1" },
        memberships,
        requestedWorkspaceId: "workspace-c",
      }),
    ).toThrow("A valid active workspace membership is required.");
  });

  it("blocks workspace A from reading workspace B by changing a request identifier", () => {
    expect(() =>
      resolveWorkspaceContextFromMembership({
        actor: { userId: "user-1" },
        memberships,
        requestedWorkspaceId: "workspace-b",
      }),
    ).toThrow("A valid active workspace membership is required.");
  });

  it("does not let URL, body, or query workspace IDs authorize another tenant", () => {
    const requestSources = ["url", "body", "query"] as const;

    for (const source of requestSources) {
      expect(() =>
        resolveWorkspaceContextFromMembership({
          actor: { userId: "user-1" },
          memberships,
          requestedWorkspaceId: "workspace-b",
          correlationId: source,
        }),
      ).toThrow("A valid active workspace membership is required.");
    }
  });
});
