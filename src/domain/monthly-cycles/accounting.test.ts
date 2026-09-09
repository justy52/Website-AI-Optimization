import { describe, expect, it } from "vitest";

import {
  countsAsCompletedEntitlement,
  entitlementCompletionStates,
  isVerifiedImplementation,
} from "./accounting";

describe("monthly entitlement accounting", () => {
  it("does not count prepared or approved drafts as implemented work", () => {
    expect(countsAsCompletedEntitlement("DRAFT_PREPARED")).toBe(false);
    expect(
      countsAsCompletedEntitlement("APPROVED_FOR_MANUAL_IMPLEMENTATION"),
    ).toBe(false);
  });

  it("counts implementation states without falsely marking all as verified", () => {
    expect(countsAsCompletedEntitlement("IMPLEMENTED_UNVERIFIED")).toBe(true);
    expect(countsAsCompletedEntitlement("VERIFICATION_WARNING")).toBe(true);
    expect(countsAsCompletedEntitlement("VERIFIED")).toBe(true);
    expect(isVerifiedImplementation("IMPLEMENTED_UNVERIFIED")).toBe(false);
    expect(isVerifiedImplementation("VERIFIED")).toBe(true);
  });

  it("keeps failed verification out of completed entitlement counts", () => {
    expect(entitlementCompletionStates).not.toContain("VERIFICATION_FAILED");
    expect(countsAsCompletedEntitlement("VERIFICATION_FAILED")).toBe(false);
  });
});
