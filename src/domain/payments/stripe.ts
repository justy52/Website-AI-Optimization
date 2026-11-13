import Stripe from "stripe";
import { SERVICE_PAYMENT_EVENTS, STRIPE_SERVICE_API_VERSION, ServicePaymentError, type PaymentConfiguration, type SessionSnapshot } from "./policy";

export type CheckoutRequest = {
  paymentId: string; orderId: string; email: string; amountCents: number;
  label: string; baseUrl: string; expiresAt: Date;
};
export type ProviderSession = SessionSnapshot & { url: string | null; financialReview: boolean };
export interface ServicePaymentProvider {
  verifyAccount(purpose?: "collection" | "reconciliation"): Promise<void>;
  createCheckout(input: CheckoutRequest): Promise<ProviderSession>;
  retrieveCheckout(id: string): Promise<ProviderSession>;
  paymentIdForCharge(chargeId: string): Promise<string | undefined>;
}
export type PaymentEvent = { id: string; type: string; livemode: boolean; account?: string; objectId: string; paymentId?: string };

export class StripeServicePayments implements ServicePaymentProvider {
  readonly stripe: Stripe;
  constructor(private readonly config: PaymentConfiguration) {
    if (!["test", "live"].includes(config.mode) || !new RegExp(`^(sk|rk)_${config.mode}_[A-Za-z0-9]+$`).test(config.secretKey) || (config.mode === "live" && !config.live)) throw new ServicePaymentError("Payment credentials do not match the explicit configuration.");
    this.stripe = new Stripe(config.secretKey, { apiVersion: STRIPE_SERVICE_API_VERSION, maxNetworkRetries: 1, timeout: 15000 });
  }
  async verifyAccount(purpose: "collection" | "reconciliation" = "collection") {
    const account: Stripe.Account = await this.stripe.rawRequest("GET", "/v1/account");
    if (account.id !== this.config.accountId) throw new ServicePaymentError("Stripe key belongs to a different merchant account.");
    if (this.config.mode === "live" && purpose === "collection") {
      const requirements = account.requirements;
      // Name each failed condition so the owner knows what to finish in Stripe.
      // These are Stripe's own status and requirement names, not account data.
      const gaps: string[] = [];
      const names = (list: string[] | null | undefined) => (list ?? []).slice(0, 5).map(item => item.replace(/[^a-z0-9_.]/gi, "").slice(0, 60)).join(", ");
      if (!account.charges_enabled) gaps.push("charges are not enabled");
      if (!account.payouts_enabled) gaps.push("payouts are not enabled");
      if (!account.details_submitted) gaps.push("account details are not submitted");
      if (account.capabilities?.card_payments !== "active") gaps.push(`card payments capability is ${account.capabilities ? String(account.capabilities.card_payments ?? "missing").replace(/[^a-z_]/gi, "") : "not reported to this key"}`);
      if (!requirements) gaps.push("verification requirements are not reported to this key");
      else {
        if (requirements.disabled_reason) gaps.push(`Stripe reports the account as disabled (${requirements.disabled_reason.replace(/[^a-z0-9_.]/gi, "").slice(0, 60)})`);
        if ((requirements.currently_due?.length ?? 0) > 0) gaps.push(`information due now: ${names(requirements.currently_due)}`);
        if ((requirements.past_due?.length ?? 0) > 0) gaps.push(`information past due: ${names(requirements.past_due)}`);
        if ((requirements.pending_verification?.length ?? 0) > 0) gaps.push(`Stripe is still verifying: ${names(requirements.pending_verification)}`);
      }
      if (gaps.length > 0) throw new ServicePaymentError(`Merchant activation, payouts, card capability or account verification is incomplete: ${gaps.join("; ")}.`.slice(0, 290));
      const endpoint = await this.stripe.webhookEndpoints.retrieve(this.config.live!.webhookEndpointId);
      if (endpoint.id !== this.config.live!.webhookEndpointId || endpoint.livemode !== true || endpoint.status !== "enabled" || endpoint.url !== `${this.config.baseUrl}/api/service-payments/stripe` || endpoint.api_version !== STRIPE_SERVICE_API_VERSION || endpoint.enabled_events.length !== SERVICE_PAYMENT_EVENTS.length || !SERVICE_PAYMENT_EVENTS.every(type => endpoint.enabled_events.includes(type))) throw new ServicePaymentError("Live webhook endpoint mode, origin, version or event selection does not match the approved configuration.");
    }
  }
  private async normalize(session: Stripe.Checkout.Session): Promise<ProviderSession> {
    let financialReview = false;
    if (session.payment_intent) {
      const intent = await this.stripe.paymentIntents.retrieve(typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id, { expand: ["latest_charge"] });
      const charge = intent.latest_charge;
      financialReview = typeof charge === "object" && charge !== null && (charge.refunded || charge.amount_refunded > 0 || charge.disputed);
    }
    if (session.livemode !== (this.config.mode === "live")) throw new ServicePaymentError("Provider session belongs to the other payment mode.");
    return { ...session, financialReview };
  }
  async createCheckout(input: CheckoutRequest) {
    if (!this.config.collectionEnabled) throw new ServicePaymentError("Live collection is held.");
    const live = this.config.mode === "live";
    // Preserve the tested request/key shape for uncertain legacy test reservations.
    const namespace = live ? "service-live" : "service";
    const customer = await this.stripe.customers.create({ email: input.email, metadata: { service_order_id: input.orderId, ...(live ? { service_payment_mode: "live" } : {}) } }, { idempotencyKey: `${namespace}-customer:${input.paymentId}` });
    if (customer.livemode !== live) throw new ServicePaymentError("Provider customer belongs to the other payment mode.");
    const metadata = { service_payment_id: input.paymentId, service_order_id: input.orderId, ...(live ? { service_payment_mode: "live" } : {}) };
    const session = await this.stripe.checkout.sessions.create({
      mode: "payment", customer: customer.id,
      allowed_payment_method_types: ["card"],
      client_reference_id: input.paymentId,
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: input.amountCents, product_data: { name: input.label } } }],
      metadata, payment_intent_data: { metadata },
      expires_at: Math.floor(input.expiresAt.getTime() / 1000),
      success_url: `${input.baseUrl}/service-payment/return`, cancel_url: `${input.baseUrl}/service-payment/return?canceled=1`,
    }, { idempotencyKey: `${namespace}-checkout:${input.paymentId}` });
    return this.normalize(session);
  }
  async retrieveCheckout(id: string) { return this.normalize(await this.stripe.checkout.sessions.retrieve(id)); }
  async paymentIdForCharge(id: string) {
    const charge = await this.stripe.charges.retrieve(id);
    if (charge.livemode !== (this.config.mode === "live")) throw new ServicePaymentError("Charge belongs to the other payment mode.");
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
