import { describe, expect, it, vi } from "vitest";
import { StripeServicePayments } from "./stripe";
import { paymentConfiguration, SERVICE_PAYMENT_EVENTS, STRIPE_SERVICE_API_VERSION } from "./policy";
import { livePaymentEnvironment } from "./test-fixtures";
const testConfig = () => paymentConfiguration({ SERVICE_PAYMENTS_MODE: "test", STRIPE_SERVICE_SECRET_KEY: "sk_test_fixture", STRIPE_SERVICE_ACCOUNT_ID: "acct_fixture", STRIPE_SERVICE_WEBHOOK_SECRET: "whsec_fixture", SERVICE_PAYMENTS_WORKSPACE_ID: "10000000-0000-4000-8000-000000000001", SERVICE_PAYMENTS_BASE_URL: "https://qa.example.com" });

describe("Stripe service payment adapter", () => {
  it("verifies the key account and creates card-only Checkout with stable idempotency", async () => {
    const provider = new StripeServicePayments(testConfig());
    const raw = vi.spyOn(provider.stripe, "rawRequest").mockResolvedValue({ id: "acct_fixture" });
    await provider.verifyAccount(); expect(raw).toHaveBeenCalledWith("GET", "/v1/account");
    raw.mockResolvedValueOnce({ id: "acct_other" }); await expect(provider.verifyAccount()).rejects.toThrow("different merchant");
    const customers = vi.spyOn(provider.stripe.customers, "create").mockResolvedValue({ id: "cus_fixture", livemode: false } as never);
    const create = vi.spyOn(provider.stripe.checkout.sessions, "create").mockResolvedValue({ id: "cs_test_fixture", livemode: false, payment_intent: null } as never);
    const input = { paymentId: "payment", orderId: "order", email: "fixture@example.com", amountCents: 49500, label: "Digital Visibility Audit TEST", baseUrl: "https://qa.example.com", expiresAt: new Date("2026-11-05T00:00:00Z") };
    await provider.createCheckout(input); await provider.createCheckout(input);
    expect(customers.mock.calls[0]).toEqual(customers.mock.calls[1]); expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
    expect(create.mock.calls[0]).toEqual([expect.objectContaining({ mode: "payment", allowed_payment_method_types: ["card"], customer: "cus_fixture", metadata: { service_payment_id: "payment", service_order_id: "order" }, payment_intent_data: { metadata: { service_payment_id: "payment", service_order_id: "order" } }, success_url: "https://qa.example.com/service-payment/return", line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: 49500, product_data: { name: input.label } } }] }), { idempotencyKey: "service-checkout:payment" }]);
  });
  it("checks current charge refund/dispute state when reconciling a session", async () => {
    const provider = new StripeServicePayments(testConfig());
    vi.spyOn(provider.stripe.checkout.sessions, "retrieve").mockResolvedValue({ id: "cs_test_fixture", livemode: false, payment_intent: "pi_fixture" } as never);
    const retrieve = vi.spyOn(provider.stripe.paymentIntents, "retrieve").mockResolvedValue({ latest_charge: { refunded: false, amount_refunded: 100, disputed: false } } as never);
    expect((await provider.retrieveCheckout("cs_test_fixture")).financialReview).toBe(true);
    expect(retrieve).toHaveBeenCalledWith("pi_fixture", { expand: ["latest_charge"] });
    retrieve.mockResolvedValue({ latest_charge: { refunded: false, amount_refunded: 0, disputed: true } } as never);
    expect((await provider.retrieveCheckout("cs_test_fixture")).financialReview).toBe(true);
  });
  const readyAccount = { id: "acct_fixture", charges_enabled: true, payouts_enabled: true, details_submitted: true, capabilities: { card_payments: "active" }, requirements: { disabled_reason: null, currently_due: [], past_due: [], pending_verification: [] } };
  const readyEndpoint = { id: "we_fixture", livemode: true, status: "enabled", url: "https://payments.example.com/api/service-payments/stripe", api_version: STRIPE_SERVICE_API_VERSION, enabled_events: [...SERVICE_PAYMENT_EVENTS] };
  it("verifies live account and endpoint without creating a payment", async () => {
    const provider = new StripeServicePayments(paymentConfiguration(livePaymentEnvironment()));
    vi.spyOn(provider.stripe, "rawRequest").mockResolvedValue(readyAccount);
    const webhook = vi.spyOn(provider.stripe.webhookEndpoints, "retrieve").mockResolvedValue(readyEndpoint as never);
    const create = vi.spyOn(provider.stripe.customers, "create");
    await provider.verifyAccount(); expect(webhook).toHaveBeenCalledWith("we_fixture"); expect(create).not.toHaveBeenCalled();
  });
  it("accepts an account whose requirements list is hidden from a restricted key when the visible conditions pass", async () => {
    const provider = new StripeServicePayments(paymentConfiguration(livePaymentEnvironment()));
    vi.spyOn(provider.stripe, "rawRequest").mockResolvedValue({ ...readyAccount, requirements: undefined });
    const webhook = vi.spyOn(provider.stripe.webhookEndpoints, "retrieve").mockResolvedValue(readyEndpoint as never);
    await expect(provider.verifyAccount()).resolves.toBeUndefined();
    // The webhook match is still checked.
    expect(webhook).toHaveBeenCalledWith("we_fixture");
  });
  it("names the unfinished account conditions without account data", async () => {
    const provider = new StripeServicePayments(paymentConfiguration(livePaymentEnvironment()));
    vi.spyOn(provider.stripe, "rawRequest").mockResolvedValue({ ...readyAccount, payouts_enabled: false, requirements: { disabled_reason: null, currently_due: ["individual.verification.document"], past_due: [], pending_verification: [] } });
    await expect(provider.verifyAccount()).rejects.toThrow(/payouts are not enabled; information due now: individual\.verification\.document/);
  });
  it("can reconcile existing payments after merchant collection eligibility regresses", async () => {
    const provider = new StripeServicePayments(paymentConfiguration(livePaymentEnvironment()));
    vi.spyOn(provider.stripe, "rawRequest").mockResolvedValue({ ...readyAccount, charges_enabled: false, payouts_enabled: false });
    const endpoint = vi.spyOn(provider.stripe.webhookEndpoints, "retrieve");
    await expect(provider.verifyAccount("reconciliation")).resolves.toBeUndefined();
    expect(endpoint).not.toHaveBeenCalled();
  });
  it.each([
    { id: "acct_other" }, { charges_enabled: false }, { payouts_enabled: false }, { details_submitted: false },
    { capabilities: { card_payments: "pending" } }, { capabilities: undefined },
    { requirements: undefined, charges_enabled: false }, { requirements: undefined, payouts_enabled: false },
    { requirements: { disabled_reason: "requirements.past_due" } },
    { requirements: { currently_due: ["company.verification"] } },
    { requirements: { past_due: ["external_account"] } },
    { requirements: { pending_verification: ["representative.verification"] } },
  ])("blocks incomplete or different live merchant %j", async change => {
    const provider = new StripeServicePayments(paymentConfiguration(livePaymentEnvironment()));
    vi.spyOn(provider.stripe, "rawRequest").mockResolvedValue({ ...readyAccount, ...change });
    const webhook = vi.spyOn(provider.stripe.webhookEndpoints, "retrieve");
    await expect(provider.verifyAccount()).rejects.toThrow(); expect(webhook).not.toHaveBeenCalled();
  });
  it.each([
    { id: "we_other" }, { livemode: false }, { status: "disabled" }, { url: "https://wrong.example.com/api/service-payments/stripe" },
    { api_version: null }, { api_version: "2020-08-27" }, { enabled_events: ["*"] }, { enabled_events: ["checkout.session.completed"] },
  ])("blocks a mismatched live webhook endpoint %j", async change => {
    const provider = new StripeServicePayments(paymentConfiguration(livePaymentEnvironment()));
    vi.spyOn(provider.stripe, "rawRequest").mockResolvedValue(readyAccount);
    vi.spyOn(provider.stripe.webhookEndpoints, "retrieve").mockResolvedValue({ ...readyEndpoint, ...change } as never);
    await expect(provider.verifyAccount()).rejects.toThrow("Live webhook");
  });
  it("uses live-specific idempotency and metadata while rejecting other-mode provider results", async () => {
    const provider = new StripeServicePayments(paymentConfiguration(livePaymentEnvironment()));
    const customer = vi.spyOn(provider.stripe.customers, "create").mockResolvedValue({ id: "cus_fixture", livemode: true } as never);
    const checkout = vi.spyOn(provider.stripe.checkout.sessions, "create").mockResolvedValue({ id: "cs_live_fixture", livemode: true, payment_intent: null } as never);
    const input = { paymentId: "payment", orderId: "order", email: "fixture@example.com", amountCents: 49500, label: "Digital Visibility Audit", baseUrl: "https://payments.example.com", expiresAt: new Date("2026-11-05T00:00:00Z") };
    await provider.createCheckout(input);
    expect(customer.mock.calls[0][1]).toEqual({ idempotencyKey: "service-live-customer:payment" });
    expect(checkout.mock.calls[0]).toEqual([expect.objectContaining({ metadata: { service_payment_id: "payment", service_order_id: "order", service_payment_mode: "live" } }), { idempotencyKey: "service-live-checkout:payment" }]);
    customer.mockResolvedValueOnce({ id: "cus_test", livemode: false } as never);
    await expect(provider.createCheckout(input)).rejects.toThrow("other payment mode");
    vi.spyOn(provider.stripe.checkout.sessions, "retrieve").mockResolvedValue({ id: "cs_test_wrong", livemode: false } as never);
    await expect(provider.retrieveCheckout("cs_test_wrong")).rejects.toThrow("other payment mode");
  });
});
