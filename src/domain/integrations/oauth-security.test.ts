import { describe, expect, it } from "vitest";

import { GOOGLE_SEARCH_CONSOLE_PROVIDER } from "./search-console";
import { assertOAuthStateMatchesContext } from "./oauth-security";

const validState = {
  workspaceId: "workspace-a",
  createdByUserId: "user-a",
  provider: GOOGLE_SEARCH_CONSOLE_PROVIDER,
  status: "PENDING" as const,
  expiresAt: new Date("2026-09-07T10:10:00.000Z"),
};
const context = {
  workspaceId: "workspace-a",
  userId: "user-a",
  provider: GOOGLE_SEARCH_CONSOLE_PROVIDER,
  now: new Date("2026-09-07T10:00:00.000Z"),
};

describe("OAuth callback state security", () => {
  it("accepts a pending state for the authenticated user and workspace", () => {
    expect(() => assertOAuthStateMatchesContext(validState, context)).not.toThrow();
  });

  it("rejects invalid, consumed, or expired state", () => {
    expect(() => assertOAuthStateMatchesContext(null, context)).toThrow(
      "invalid or expired",
    );
    expect(() =>
      assertOAuthStateMatchesContext({ ...validState, status: "CONSUMED" }, context),
    ).toThrow("invalid or expired");
    expect(() =>
      assertOAuthStateMatchesContext(
        { ...validState, expiresAt: new Date("2026-09-07T09:59:00.000Z") },
        context,
      ),
    ).toThrow("invalid or expired");
  });

  it("rejects state from another workspace or user", () => {
    expect(() =>
      assertOAuthStateMatchesContext(
        { ...validState, workspaceId: "workspace-b" },
        context,
      ),
    ).toThrow("workspace");
    expect(() =>
      assertOAuthStateMatchesContext(
        { ...validState, createdByUserId: "user-b" },
        context,
      ),
    ).toThrow("user");
  });

  it("rejects provider confusion", () => {
    expect(() =>
      assertOAuthStateMatchesContext({ ...validState, provider: "other" }, context),
    ).toThrow("provider");
  });
});
