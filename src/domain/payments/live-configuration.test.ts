import { describe, expect, it } from "vitest";
import { paymentConfiguration, paymentConfigurationProblem, verifySession } from "./policy";
import { livePaymentEnvironment } from "./test-fixtures";
describe("Explicit production payment configuration", () => {
  it("remains disabled by default, even when live credentials exist", () => {
    expect(() => paymentConfiguration(livePaymentEnvironment({ SERVICE_PAYMENTS_MODE: undefined }))).toThrow("disabled");
    expect(() => paymentConfiguration(livePaymentEnvironment({ SERVICE_PAYMENTS_MODE: "disabled" }))).toThrow("disabled");
    expect(paymentConfiguration(livePaymentEnvironment())).toMatchObject({ mode: "live", accountId: "acct_fixture", live: { legalSeller: "Synthetic Seller LLC", termsVersion: "live-terms-fixture-v1" } });
  });
  it.each([
    { SERVICE_PAYMENTS_LIVE_ACTIVATION: undefined }, { SERVICE_PAYMENTS_LIVE_ACTIVATION: "true" },
    { APP_ENV: "qa" }, { VERCEL_ENV: "preview" }, { NODE_ENV: "test" }, { NODE_ENV: undefined },
    { STRIPE_SERVICE_LIVE_SECRET_KEY: "sk_test_fixture" }, { STRIPE_SERVICE_LIVE_SECRET_KEY: "sk_org_fixture" },
    { STRIPE_SERVICE_TEST_SECRET_KEY: "sk_test_fixture" }, { STRIPE_SERVICE_SECRET_KEY: "sk_test_fixture" },
    { STRIPE_SERVICE_LIVE_WEBHOOK_SECRET: undefined }, { STRIPE_SERVICE_LIVE_WEBHOOK_ENDPOINT_ID: undefined },
    { SERVICE_PAYMENTS_LIVE_APPROVAL_REFERENCE: undefined }, { SERVICE_PAYMENTS_LIVE_LEGAL_SELLER: undefined }, { SERVICE_PAYMENTS_LIVE_TERMS_VERSION: undefined },
    { SERVICE_PAYMENTS_LIVE_BASE_URL: "http://payments.example.com" },
    { SERVICE_PAYMENTS_LIVE_BASE_URL: "https://localhost", BETTER_AUTH_URL: "https://localhost" },
    { SERVICE_PAYMENTS_LIVE_BASE_URL: "https://127.0.0.1", BETTER_AUTH_URL: "https://127.0.0.1" },
    { SERVICE_PAYMENTS_LIVE_BASE_URL: "https://merchant.internal", BETTER_AUTH_URL: "https://merchant.internal" },
    { SERVICE_PAYMENTS_LIVE_BASE_URL: "https://payments.example.com/path" },
    { BETTER_AUTH_URL: "https://different.example.com" },
  ])("rejects incomplete, mismatched or preview live configuration %j", change => {
    expect(() => paymentConfiguration(livePaymentEnvironment(change))).toThrow();
  });
  it("supports separate test credentials and preserves only test-mode legacy variables", () => {
    const source = { APP_ENV: "qa", SERVICE_PAYMENTS_MODE: "test", STRIPE_SERVICE_TEST_SECRET_KEY: "rk_test_fixture", STRIPE_SERVICE_TEST_ACCOUNT_ID: "acct_fixture", STRIPE_SERVICE_TEST_WEBHOOK_SECRET: "whsec_fixture", SERVICE_PAYMENTS_TEST_WORKSPACE_ID: "10000000-0000-4000-8000-000000000001", SERVICE_PAYMENTS_TEST_BASE_URL: "https://qa.example.com" };
    expect(paymentConfiguration(source).mode).toBe("test");
    expect(() => paymentConfiguration({ ...source, STRIPE_SERVICE_LIVE_SECRET_KEY: "sk_live_fixture" })).toThrow();
    expect(() => paymentConfiguration({ ...source, STRIPE_SERVICE_SECRET_KEY: "sk_test_other" })).toThrow("Conflicting");
  });
  it("holds live collection by default even with approved account configuration", () => {
    expect(paymentConfiguration(livePaymentEnvironment({ SERVICE_PAYMENTS_LIVE_COLLECTION_ENABLED: undefined })).collectionEnabled).toBe(false);
    expect(paymentConfiguration(livePaymentEnvironment({ SERVICE_PAYMENTS_LIVE_COLLECTION_ENABLED: "false" })).collectionEnabled).toBe(false);
  });
  it("matches paid state to the persisted mode, including mandatory live metadata", () => {
    const payment = { id: "payment", orderId: "order", amountCents: 49500, customerId: "cus_fixture", sessionId: "cs_live_fixture", paymentMode: "live" as const };
    const session = { id: payment.sessionId, livemode: true, mode: "payment", status: "complete", payment_status: "paid", currency: "usd", amount_total: 49500, customer: "cus_fixture", metadata: { service_payment_id: payment.id, service_order_id: payment.orderId, service_payment_mode: "live" } };
    expect(verifySession(payment, session)).toBe(true);
    expect(() => verifySession(payment, { ...session, livemode: false })).toThrow();
    expect(() => verifySession(payment, { ...session, metadata: { ...session.metadata, service_payment_mode: "test" } })).toThrow();
    expect(() => verifySession({ ...payment, paymentMode: "test" }, session)).toThrow();
  });
  it("explains a rejected configuration by setting name and rule, never by value", () => {
    expect(paymentConfigurationProblem(livePaymentEnvironment())).toBeNull();
    expect(paymentConfigurationProblem(livePaymentEnvironment({ SERVICE_PAYMENTS_MODE: "disabled" }))).toBeNull();
    const cases: Array<[Record<string, string | undefined>, RegExp]> = [
      [{ STRIPE_SERVICE_LIVE_SECRET_KEY: "pk_live_secretvalue" }, /secret or restricted key/],
      [{ STRIPE_SERVICE_LIVE_WEBHOOK_SECRET: "we_secretvalue" }, /webhook signing secret/],
      [{ SERVICE_PAYMENTS_LIVE_ACTIVATION: "yes-secretvalue" }, /explicitly approved/],
      [{ SERVICE_PAYMENTS_LIVE_WORKSPACE_ID: "secretvalue" }, /SERVICE_PAYMENTS_LIVE_WORKSPACE_ID/],
      [{ SERVICE_PAYMENTS_LIVE_BASE_URL: "secretvalue" }, /SERVICE_PAYMENTS_LIVE_BASE_URL/],
      [{ SERVICE_PAYMENTS_LIVE_TERMS_VERSION: "x" }, /SERVICE_PAYMENTS_LIVE_TERMS_VERSION/],
      [{ STRIPE_SERVICE_LIVE_WEBHOOK_ENDPOINT_ID: "whsec_secretvalue" }, /STRIPE_SERVICE_LIVE_WEBHOOK_ENDPOINT_ID/],
    ];
    for (const [change, expected] of cases) {
      const problem = paymentConfigurationProblem(livePaymentEnvironment(change));
      expect(problem).toMatch(expected);
      expect(problem).not.toMatch(/secretvalue/);
    }
  });
});
