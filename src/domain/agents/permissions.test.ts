import { describe, expect, it } from "vitest";

import { AuthorizationError } from "@/domain/tenancy/context";

import {
  assertAgentPermission,
  assertKnownPermissionLevel,
  assertNoExternalExecuteTool,
  canUsePermission,
  EXTERNAL_EXECUTE_ENABLED,
} from "./permissions";

describe("agent permission model", () => {
  it("allows OBSERVE and PREPARE according to server-side rank", () => {
    expect(canUsePermission("OBSERVE", "OBSERVE")).toBe(true);
    expect(canUsePermission("PREPARE", "OBSERVE")).toBe(true);
    expect(canUsePermission("PREPARE", "PREPARE")).toBe(true);
    expect(canUsePermission("OBSERVE", "PREPARE")).toBe(false);
  });

  it("keeps EXECUTE disabled even when the concept exists", () => {
    expect(EXTERNAL_EXECUTE_ENABLED).toBe(false);
    expect(canUsePermission("EXECUTE", "EXECUTE")).toBe(false);
    expect(() => assertAgentPermission("PREPARE", "EXECUTE")).toThrow(
      AuthorizationError,
    );
  });

  it("rejects unknown permission levels and external execute tool keys", () => {
    expect(() => assertKnownPermissionLevel("ROOT")).toThrow(AuthorizationError);
    expect(() => assertNoExternalExecuteTool("publish.execute.v1")).toThrow(
      AuthorizationError,
    );
  });
});
