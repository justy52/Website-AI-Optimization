import { describe, expect, it } from "vitest";
import { inquirySchema, publicWebsite } from "./validation";
import { issueIntakeNonce, verifyIntakeNonce } from "@/security/intake-nonce";

describe("public intake boundary", () => {
  it.each(["http://business.com", "https://localhost", "https://127.0.0.1", "https://2130706433", "https://[::1]", "https://user:password@business.com", "https://host.internal", "https://host.local", "https://business.com:8443"])("rejects unsafe website %s", value => {
    expect(() => publicWebsite(value)).toThrow();
  });
  it("normalizes without retaining query credentials or fragments", () => {
    expect(publicWebsite("https://BUSINESS.com/path?token=private#secret")).toBe("https://business.com/path");
  });
  it("rejects tenant routing, payment, attribution and consent tampering", () => {
    const input = { contactName: "Alex", companyName: "Service Business", email: "alex+work@business.com", website: "https://business.com", goal: "calls", acknowledgement: true, nonce: "x".repeat(60), companyFax: "", formVersion: "audit-inquiry-v1", privacyVersion: "2026-11-04" };
    expect(inquirySchema.safeParse(input).success).toBe(true);
    for (const extra of [{ workspaceId: "attacker" }, { status: "PAID" }, { acknowledgement: false }, { attribution: { utm_source: "safe", token: "secret" } }, { companyFax: "bot" }]) expect(inquirySchema.safeParse({ ...input, ...extra }).success).toBe(false);
  });
  it("requires an untampered, mature, unexpired server nonce", () => {
    const secret = "s".repeat(40); const now = Date.now();
    const nonce = issueIntakeNonce(secret, now);
    expect(verifyIntakeNonce(secret, nonce, now + 3000)).toBe(true);
    expect(verifyIntakeNonce(secret, nonce, now + 100)).toBe(false);
    expect(verifyIntakeNonce(secret, nonce, now + 31 * 60000)).toBe(false);
    expect(verifyIntakeNonce(secret, nonce + "0", now + 3000)).toBe(false);
    expect(verifyIntakeNonce("other", nonce, now + 3000)).toBe(false);
  });
});
