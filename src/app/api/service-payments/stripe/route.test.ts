import Stripe from "stripe";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const { processEvent } = vi.hoisted(() => ({ processEvent: vi.fn() }));
vi.mock("@/server/service-payments", () => ({ processServicePaymentEvent: processEvent }));
import { POST } from "./route";
const stripe = new Stripe("sk_test_fixture"), secret = "whsec_fixture";
function request(overrides = {}, tamper = false) {
  const body = JSON.stringify({ id: "evt_fixture", type: "checkout.session.completed", livemode: false, data: { object: { id: "cs_test_fixture", metadata: { service_payment_id: "payment" } } }, ...overrides });
  const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  return new Request("http://localhost/api/service-payments/stripe", { method: "POST", headers: { "stripe-signature": signature }, body: tamper ? `${body} ` : body });
}
describe("Service payment webhook HTTP boundary", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries({ APP_ENV: "local", VERCEL_ENV: "development", SERVICE_PAYMENTS_MODE: "test", STRIPE_SERVICE_SECRET_KEY: "sk_test_fixture", STRIPE_SERVICE_WEBHOOK_SECRET: secret, STRIPE_SERVICE_ACCOUNT_ID: "acct_fixture", SERVICE_PAYMENTS_WORKSPACE_ID: "10000000-0000-4000-8000-000000000001", SERVICE_PAYMENTS_BASE_URL: "http://localhost:3000" })) vi.stubEnv(key, value);
    processEvent.mockReset(); processEvent.mockResolvedValue("RECONCILED");
  });
  afterEach(() => vi.unstubAllEnvs());
  it("fails closed when disabled", async () => {
    vi.stubEnv("SERVICE_PAYMENTS_MODE", "disabled"); expect((await POST(request())).status).toBe(503); expect(processEvent).not.toHaveBeenCalled();
  });
  it("rejects missing signature, changed body, live events and wrong merchant", async () => {
    expect((await POST(new Request("http://localhost", { method: "POST", body: "{}" }))).status).toBe(400);
    expect((await POST(request({}, true))).status).toBe(400);
    expect((await POST(request({ livemode: true }))).status).toBe(400);
    expect((await POST(request({ account: "acct_other" }))).status).toBe(400);
    expect(processEvent).not.toHaveBeenCalled();
  });
  it("caps raw payload size before verification", async () => {
    const req = new Request("http://localhost", { method: "POST", headers: { "stripe-signature": "invalid" }, body: "a".repeat(262145) });
    expect((await POST(req)).status).toBe(413); expect(processEvent).not.toHaveBeenCalled();
  });
  it("acknowledges only after durable processing and retries outages without leaking details", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(processEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "evt_fixture", objectId: "cs_test_fixture" }), expect.any(Object));
    processEvent.mockRejectedValue(new Error("synthetic private provider error"));
    const response = await POST(request()); expect(response.status).toBe(503); expect(await response.text()).not.toContain("private provider");
  });
});
