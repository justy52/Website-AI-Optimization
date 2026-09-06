import { describe, expect, it } from "vitest";

import type { WorkspaceContext } from "@/domain/tenancy/context";

import { planLeadConversion } from "./workflows";

const context: WorkspaceContext = {
  workspaceId: "workspace-a",
  actorType: "USER",
  role: "OWNER",
  userId: "user-1",
};

describe("lead conversion workflow guards", () => {
  it("plans a client creation for a qualified same-workspace lead", () => {
    const decision = planLeadConversion({
      context,
      lead: {
        id: "lead-1",
        workspaceId: "workspace-a",
        status: "QUALIFIED",
        companyName: "Acme Roofing",
      },
    });

    expect(decision).toEqual({
      kind: "create",
      clientName: "Acme Roofing",
      sourceLeadId: "lead-1",
    });
  });

  it("returns the existing client for repeated conversion attempts", () => {
    const decision = planLeadConversion({
      context,
      lead: {
        id: "lead-1",
        workspaceId: "workspace-a",
        status: "CONVERTED",
        companyName: "Acme Roofing",
      },
      existingClient: {
        id: "client-1",
        workspaceId: "workspace-a",
        sourceLeadId: "lead-1",
      },
    });

    expect(decision).toEqual({ kind: "existing", clientId: "client-1" });
  });

  it("rejects cross-workspace source-lead conversion", () => {
    expect(() =>
      planLeadConversion({
        context,
        lead: {
          id: "lead-1",
          workspaceId: "workspace-b",
          status: "QUALIFIED",
          companyName: "Other Tenant",
        },
      }),
    ).toThrow("Cross-workspace resource access was blocked.");
  });

  it("rejects clients from another workspace during idempotency checks", () => {
    expect(() =>
      planLeadConversion({
        context,
        lead: {
          id: "lead-1",
          workspaceId: "workspace-a",
          status: "CONVERTED",
          companyName: "Acme Roofing",
        },
        existingClient: {
          id: "client-1",
          workspaceId: "workspace-b",
          sourceLeadId: "lead-1",
        },
      }),
    ).toThrow("Cross-workspace resource access was blocked.");
  });

  it("rejects non-qualified statuses", () => {
    expect(() =>
      planLeadConversion({
        context,
        lead: {
          id: "lead-1",
          workspaceId: "workspace-a",
          status: "NEW",
          companyName: "Acme Roofing",
        },
      }),
    ).toThrow("Only qualified or audit-ready leads can be converted.");
  });
});
