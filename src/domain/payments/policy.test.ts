import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { emptyOnboarding, orderInput, paymentConfiguration, readiness, verifySession } from "./policy";
import { parsePaymentEvent, StripeServicePayments } from "./stripe";

const configuration = { SERVICE_PAYMENTS_MODE: "test", STRIPE_SERVICE_SECRET_KEY: "sk_test_fake", STRIPE_SERVICE_ACCOUNT_ID: "acct_fake", SERVICE_PAYMENTS_WORKSPACE_ID: "10000000-0000-4000-8000-000000000001", STRIPE_SERVICE_WEBHOOK_SECRET: "whsec_fake", SERVICE_PAYMENTS_BASE_URL: "http://localhost:3000" };
const payment = { id: "payment", orderId: "order", amountCents: 49500, sessionId: "cs_test_one", customerId: "cus_one" };
const session = { id: "cs_test_one", livemode: false, mode: "payment", status: "complete", payment_status: "paid", currency: "usd", amount_total: 49500, customer: "cus_one", metadata: { service_payment_id: "payment", service_order_id: "order" } };
describe("Test service payment policy", () => {
  it("requires explicit configuration and forbids production or live keys", () => {
    expect(() => paymentConfiguration({})).toThrow();
    expect(paymentConfiguration(configuration).baseUrl).toBe("http://localhost:3000");
    for (const change of [{ SERVICE_PAYMENTS_MODE: "live" }, { STRIPE_SERVICE_SECRET_KEY: "sk_live_fake" }, { APP_ENV: "production" }, { VERCEL_ENV: "production" }, { SERVICE_PAYMENTS_BASE_URL: "http://example.com" }, { SERVICE_PAYMENTS_BASE_URL: "https://example.com/path" }]) expect(() => paymentConfiguration({ ...configuration, ...change })).toThrow();
    expect(() => new StripeServicePayments({ ...paymentConfiguration(configuration), secretKey: "sk_live_fake" })).toThrow();
  });
  it("refuses underpriced audits, recurring plans, and unsigned or invented schedules", () => {
    const data = { clientId: configuration.SERVICE_PAYMENTS_WORKSPACE_ID, websiteId: configuration.SERVICE_PAYMENTS_WORKSPACE_ID, service: "AUDIT_ONLY", scopeReference: "signed-test", scopeSha256: "a".repeat(64), termsVersion: "terms-1", signedAt: "2026-01-01T00:00:00Z", customerEmail: "test@example.com", deliveryOperator: "Test operator", totalCents: 49500, depositCents: 49500 };
    expect(orderInput.safeParse(data).success).toBe(true);
    for (const change of [{ totalCents: 1 }, { scopeReference: "" }, { service: "GROWTH" }, { scopeSha256: "x" }, { signedAt: "2099-01-01T00:00:00Z" }]) expect(orderInput.safeParse({ ...data, ...change }).success).toBe(false);
    expect(orderInput.safeParse({ ...data, service: "LAUNCH", totalCents: 150000, depositCents: 75000 }).success).toBe(true);
    expect(orderInput.safeParse({ ...data, service: "LAUNCH", totalCents: 100500, depositCents: 50250 }).success).toBe(false);
  });
  it("does not confuse processing, redirect, amount, mode, customer, or metadata with payment", () => {
    expect(verifySession(payment, session)).toBe(true);
    expect(verifySession(payment, { ...session, payment_status: "unpaid" })).toBe(false);
    expect(verifySession(payment, { ...session, status: "open" })).toBe(false);
    for (const change of [{ amount_total: 1 }, { currency: "eur" }, { customer: "cus_other" }, { livemode: true }, { id: "cs_test_other" }, { metadata: {} }, { mode: "subscription" }]) expect(() => verifySession(payment, { ...session, ...change })).toThrow();
  });
  it("keeps unsigned, unpaid, unverified and refunded orders blocked", () => {
    expect(readiness("AUDIT_ONLY", emptyOnboarding, "PAID")).toContain("Minimum intake and approval contact");
    const ready = Object.fromEntries(Object.keys(emptyOnboarding).map(k => [k, true])) as typeof emptyOnboarding;
    expect(readiness("LAUNCH", ready, "PAID")).toEqual([]);
    expect(readiness("LAUNCH", ready, "REVIEW")).toContain("Verified initial payment");
    expect(readiness("LAUNCH", { ...ready, scopeStillValid: false }, "PAID")).toContain("Current signed scope");
    expect(readiness("LAUNCH", { ...ready, backupRollbackVerified: false }, "PAID")).toContain("Backup and rollback");
  });
  it("verifies real Stripe signatures on unchanged raw bodies and rejects stale replay", () => {
    const stripe = new Stripe("sk_test_fake");
    const body = JSON.stringify({ id: "evt_test", type: "checkout.session.completed", livemode: false, data: { object: { id: "cs_test_one" } } });
    const secret = "whsec_fixture";
    const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret });
    expect(parsePaymentEvent(stripe, body, signature, secret).id).toBe("evt_test");
    expect(() => parsePaymentEvent(stripe, `${body} `, signature, secret)).toThrow();
    expect(() => parsePaymentEvent(stripe, body, signature, "whsec_wrong")).toThrow();
    expect(() => parsePaymentEvent(stripe, body, stripe.webhooks.generateTestHeaderString({ payload: body, secret, timestamp: Math.floor(Date.now() / 1000) - 400 }), secret)).toThrow();
  });
});
