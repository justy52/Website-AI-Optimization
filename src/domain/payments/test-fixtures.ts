// Deliberately fake credentials. Only test modules import these fixtures.
export function livePaymentEnvironment(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "production", APP_ENV: "production", VERCEL_ENV: "production", SERVICE_PAYMENTS_MODE: "live",
    SERVICE_PAYMENTS_LIVE_ACTIVATION: "approved-v1",
    SERVICE_PAYMENTS_LIVE_COLLECTION_ENABLED: "true",
    SERVICE_PAYMENTS_LIVE_APPROVAL_REFERENCE: "synthetic-launch-approval",
    SERVICE_PAYMENTS_LIVE_LEGAL_SELLER: "Synthetic Seller LLC",
    SERVICE_PAYMENTS_LIVE_TERMS_VERSION: "live-terms-fixture-v1",
    SERVICE_PAYMENTS_LIVE_WORKSPACE_ID: "10000000-0000-4000-8000-000000000001",
    SERVICE_PAYMENTS_LIVE_BASE_URL: "https://payments.example.com",
    BETTER_AUTH_URL: "https://payments.example.com",
    STRIPE_SERVICE_LIVE_SECRET_KEY: "rk_live_fixture",
    STRIPE_SERVICE_LIVE_ACCOUNT_ID: "acct_fixture",
    STRIPE_SERVICE_LIVE_WEBHOOK_SECRET: "whsec_livefixture",
    STRIPE_SERVICE_LIVE_WEBHOOK_ENDPOINT_ID: "we_fixture",
    ...overrides,
  };
}
