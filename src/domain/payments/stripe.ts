import Stripe from "stripe";
import { ServicePaymentError, type SessionSnapshot } from "./policy";

export type CheckoutRequest = {
  paymentId: string; orderId: string; email: string; amountCents: number;
  label: string; baseUrl: string; expiresAt: Date;
};
export type ProviderSession = SessionSnapshot & { url: string | null; financialReview: boolean };
export interface ServicePaymentProvider {
  verifyAccount(): Promise<void>;
  createCheckout(input: CheckoutRequest): Promise<ProviderSession>;
  retrieveCheckout(id: string): Promise<ProviderSession>;
  paymentIdForCharge(chargeId: string): Promise<string | undefined>;
}
export type PaymentEvent = { id: string; type: string; livemode: boolean; account?: string; objectId: string; paymentId?: string };

export class StripeServicePayments implements ServicePaymentProvider {
  readonly stripe: Stripe;
  constructor(secretKey: string, private readonly accountId: string) {
    // Never use this adapter to make live requests, even when directly instantiated.
    if (!/^(sk|rk)_test_/.test(secretKey)) throw new ServicePaymentError("Test keys only.");
    this.stripe = new Stripe(secretKey, { maxNetworkRetries: 1, timeout: 15000 });
  }
  async verifyAccount() {
    const account: { id: string } = await this.stripe.rawRequest("GET", "/v1/account");
    if (account.id !== this.accountId) throw new ServicePaymentError("Stripe key belongs to a different merchant account.");
  }
  private async normalize(session: Stripe.Checkout.Session): Promise<ProviderSession> {
    let financialReview = false;
    if (session.payment_intent) {
      const intent = await this.stripe.paymentIntents.retrieve(typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id, { expand: ["latest_charge"] });
      const charge = intent.latest_charge;
      financialReview = typeof charge === "object" && charge !== null && (charge.refunded || charge.amount_refunded > 0 || charge.disputed);
    }
    return { ...session, financialReview };
  }
  async createCheckout(input: CheckoutRequest) {
    const customer = await this.stripe.customers.create({ email: input.email, metadata: { service_order_id: input.orderId } }, { idempotencyKey: `service-customer:${input.paymentId}` });
    const metadata = { service_payment_id: input.paymentId, service_order_id: input.orderId };
    const session = await this.stripe.checkout.sessions.create({
      mode: "payment", customer: customer.id,
      allowed_payment_method_types: ["card"],
      client_reference_id: input.paymentId,
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: input.amountCents, product_data: { name: input.label } } }],
      metadata, payment_intent_data: { metadata },
      expires_at: Math.floor(input.expiresAt.getTime() / 1000),
      success_url: `${input.baseUrl}/service-payment/return`, cancel_url: `${input.baseUrl}/service-payment/return?canceled=1`,
    }, { idempotencyKey: `service-checkout:${input.paymentId}` });
    return this.normalize(session);
  }
  async retrieveCheckout(id: string) { return this.normalize(await this.stripe.checkout.sessions.retrieve(id)); }
  async paymentIdForCharge(id: string) {
    const charge = await this.stripe.charges.retrieve(id);
    if (charge.livemode) throw new ServicePaymentError("Live charge rejected.");
    return charge.metadata.service_payment_id;
  }
}

export function parsePaymentEvent(stripe: Stripe, body: string, signature: string, secret: string): PaymentEvent {
  const event = stripe.webhooks.constructEvent(body, signature, secret, 300);
  const object = event.data.object as unknown as { id: string; charge?: string | { id: string }; metadata?: Record<string, string> };
  return {
    id: event.id, type: event.type, livemode: event.livemode, account: event.account,
    objectId: event.type === "charge.dispute.created" ? (typeof object.charge === "string" ? object.charge : object.charge?.id ?? "") : object.id,
    paymentId: object.metadata?.service_payment_id,
  };
}
