import { describe, expect, it } from "vitest";

import { orderInput } from "./policy";
import { installmentLabel, orderAmounts, paymentEventLabel, paymentStateLabel, reviewReasonLabel, serviceName } from "./pricing";

describe("order amounts entered in dollars", () => {
  it("fixes the audit price whatever is typed", () => {
    expect(orderAmounts("AUDIT_ONLY", "")).toEqual({ totalCents: 49500, depositCents: 49500 });
    expect(orderAmounts("AUDIT_ONLY", "1")).toEqual({ totalCents: 49500, depositCents: 49500 });
  });

  it("splits a launch total into two equal halves", () => {
    expect(orderAmounts("LAUNCH", "1500")).toEqual({ totalCents: 150000, depositCents: 75000 });
    expect(orderAmounts("LAUNCH", " 2250.50 ")).toEqual({ totalCents: 225050, depositCents: 112525 });
  });

  it("rejects totals that are not plain dollar amounts or cannot be halved", () => {
    for (const bad of ["", "abc", "1,500", "$1500", "-1500", "1500.555", "1500.01", "1e5"]) expect(orderAmounts("LAUNCH", bad)).toBeNull();
  });

  it("produces amounts the payment rules accept", () => {
    const base = {
      clientId: "11111111-1111-4111-8111-111111111111", websiteId: "22222222-2222-4222-8222-222222222222",
      scopeReference: "Signed agreement", scopeSha256: "a".repeat(64), termsVersion: "2026-11-04",
      signedAt: "2026-11-01T00:00:00.000Z", customerEmail: "customer@example.test", deliveryOperator: "Operator",
    };
    expect(orderInput.safeParse({ ...base, service: "AUDIT_ONLY", ...orderAmounts("AUDIT_ONLY", "")! }).success).toBe(true);
    expect(orderInput.safeParse({ ...base, service: "LAUNCH", ...orderAmounts("LAUNCH", "1500")! }).success).toBe(true);
    // Below the launch minimum is still refused by the rules, not silently accepted.
    expect(orderInput.safeParse({ ...base, service: "LAUNCH", ...orderAmounts("LAUNCH", "1000")! }).success).toBe(false);
  });
});

describe("plain-language payment labels", () => {
  it("names services, payments, states and Stripe messages", () => {
    expect(serviceName("AUDIT_ONLY")).toBe("Digital Visibility Audit");
    expect(installmentLabel("INITIAL", "AUDIT_ONLY")).toBe("Full payment");
    expect(installmentLabel("BALANCE", "LAUNCH")).toBe("Second half (on completion)");
    expect(paymentStateLabel("PAID")).toBe("Paid");
    expect(reviewReasonLabel("REFUND_OR_DISPUTE")).toMatch(/refund or dispute/);
    expect(paymentEventLabel("charge.dispute.created")).toBe("A customer disputed a charge");
  });

  it("never shows a raw code for a value it does not know", () => {
    expect(paymentStateLabel("SOME_NEW_STATE")).toBe("Some new state");
    expect(paymentEventLabel("invoice.paid")).toBe("Invoice paid");
  });
});
