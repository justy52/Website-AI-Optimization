import { describe, expect, it, vi } from "vitest";
import { StripeServicePayments } from "./stripe";

describe("Stripe service payment adapter", () => {
  it("verifies the key account and creates card-only Checkout with stable idempotency", async () => {
    const provider = new StripeServicePayments("sk_test_fixture", "acct_fixture");
    const raw = vi.spyOn(provider.stripe, "rawRequest").mockResolvedValue({ id: "acct_fixture" });
    await provider.verifyAccount(); expect(raw).toHaveBeenCalledWith("GET", "/v1/account");
    raw.mockResolvedValueOnce({ id: "acct_other" }); await expect(provider.verifyAccount()).rejects.toThrow("different merchant");
    const customers = vi.spyOn(provider.stripe.customers, "create").mockResolvedValue({ id: "cus_fixture" } as never);
    const create = vi.spyOn(provider.stripe.checkout.sessions, "create").mockResolvedValue({ id: "cs_test_fixture", payment_intent: null } as never);
    const input = { paymentId: "payment", orderId: "order", email: "fixture@example.com", amountCents: 49500, label: "Digital Visibility Audit TEST", baseUrl: "https://qa.example.com", expiresAt: new Date("2026-11-05T00:00:00Z") };
    await provider.createCheckout(input); await provider.createCheckout(input);
    expect(customers.mock.calls[0]).toEqual(customers.mock.calls[1]); expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
    expect(create.mock.calls[0]).toEqual([expect.objectContaining({ mode: "payment", allowed_payment_method_types: ["card"], customer: "cus_fixture", metadata: { service_payment_id: "payment", service_order_id: "order" }, payment_intent_data: { metadata: { service_payment_id: "payment", service_order_id: "order" } }, success_url: "https://qa.example.com/service-payment/return", line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: 49500, product_data: { name: input.label } } }] }), { idempotencyKey: "service-checkout:payment" }]);
  });
  it("checks current charge refund/dispute state when reconciling a session", async () => {
    const provider = new StripeServicePayments("sk_test_fixture", "acct_fixture");
    vi.spyOn(provider.stripe.checkout.sessions, "retrieve").mockResolvedValue({ id: "cs_test_fixture", payment_intent: "pi_fixture" } as never);
    const retrieve = vi.spyOn(provider.stripe.paymentIntents, "retrieve").mockResolvedValue({ latest_charge: { refunded: false, amount_refunded: 100, disputed: false } } as never);
    expect((await provider.retrieveCheckout("cs_test_fixture")).financialReview).toBe(true);
    expect(retrieve).toHaveBeenCalledWith("pi_fixture", { expand: ["latest_charge"] });
    retrieve.mockResolvedValue({ latest_charge: { refunded: false, amount_refunded: 0, disputed: true } } as never);
    expect((await provider.retrieveCheckout("cs_test_fixture")).financialReview).toBe(true);
  });
});
