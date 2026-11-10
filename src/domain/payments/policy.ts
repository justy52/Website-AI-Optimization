import { z } from "zod";

export class ServicePaymentError extends Error {}

const reference = z.string().trim().min(3).max(200);
export const orderInput = z.object({
  clientId: z.uuid(), websiteId: z.uuid(),
  service: z.enum(["AUDIT_ONLY", "LAUNCH"]),
  scopeReference: reference,
  scopeSha256: z.string().regex(/^[a-f0-9]{64}$/),
  termsVersion: reference,
  signedAt: z.iso.datetime(),
  customerEmail: z.email().max(254),
  deliveryOperator: reference,
  // Enter the final amounts from the signed schedule; no unapproved credit policy.
  totalCents: z.number().int().min(49500).max(10000000),
  depositCents: z.number().int().min(1).max(10000000),
}).superRefine((v, ctx) => {
  if (v.service === "AUDIT_ONLY" && (v.totalCents !== 49500 || v.depositCents !== 49500)) {
    ctx.addIssue({ code: "custom", message: "The audit is USD $495 prepaid." });
  }
  if (v.service === "LAUNCH" && (v.totalCents < 150000 || v.depositCents * 2 !== v.totalCents)) {
    ctx.addIssue({ code: "custom", message: "Launch starts at $1,500 with a 50% deposit. Credited/custom schedules require operator invoicing until credit policy is approved." });
  }
  if (new Date(v.signedAt).getTime() > Date.now()) ctx.addIssue({ code: "custom", message: "Signature date cannot be in the future." });
});

export const onboardingInput = z.object({
  minimumIntakeVerified: z.boolean(),
  crawlAuthorizationVerified: z.boolean(),
  requiredAccessVerified: z.boolean(),
  providerCapabilitiesVerified: z.boolean(),
  baselineVerified: z.boolean(),
  backupRollbackVerified: z.boolean(),
  scopeStillValid: z.boolean(),
  completionAccepted: z.boolean(),
});
export type OnboardingEvidence = z.infer<typeof onboardingInput>;
export const emptyOnboarding: OnboardingEvidence = {
  minimumIntakeVerified: false, crawlAuthorizationVerified: false,
  requiredAccessVerified: false, providerCapabilitiesVerified: false,
  baselineVerified: false, backupRollbackVerified: false,
  scopeStillValid: true, completionAccepted: false,
};

export function readiness(service: string, gates: OnboardingEvidence, payment: string | undefined) {
  const blocked: string[] = [];
  if (!gates.scopeStillValid) blocked.push("Current signed scope");
  if (payment !== "PAID") blocked.push("Verified initial payment");
  if (!gates.minimumIntakeVerified) blocked.push("Minimum intake and approval contact");
  if (!gates.crawlAuthorizationVerified) blocked.push("Authorized website scope");
  if (!gates.requiredAccessVerified) blocked.push("Required delegated access (or public-only scope)");
  if (!gates.providerCapabilitiesVerified) blocked.push("Supported delivery components");
  if (service === "LAUNCH") {
    if (!gates.baselineVerified) blocked.push("Baseline evidence");
    if (!gates.backupRollbackVerified) blocked.push("Backup and rollback");
  }
  return blocked;
}

export type PaymentMode = "test" | "live";
export const STRIPE_SERVICE_API_VERSION = "2026-10-28.endive";
export const SERVICE_PAYMENT_EVENTS = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired", "charge.refunded", "charge.dispute.created"] as const;
export type PaymentConfiguration = {
  mode: PaymentMode; collectionEnabled: boolean; workspaceId: string; accountId: string; secretKey: string;
  webhookSecret: string; baseUrl: string;
  live?: { approvalReference: string; legalSeller: string; termsVersion: string; webhookEndpointId: string };
};
export function paymentConfiguration(source: Record<string, string | undefined> = process.env): PaymentConfiguration {
  const mode = source.SERVICE_PAYMENTS_MODE;
  if (mode !== "test" && mode !== "live") throw new ServicePaymentError("Service payments are disabled. Select a fully configured payment mode explicitly.");
  const production = source.APP_ENV === "production" || source.VERCEL_ENV === "production";
  if (mode === "test" && production) throw new ServicePaymentError("Test service payments cannot run in production.");
  if (mode === "live" && (source.NODE_ENV !== "production" || source.APP_ENV !== "production" || (source.VERCEL_ENV && source.VERCEL_ENV !== "production"))) throw new ServicePaymentError("Live payments require an explicit production environment.");
  if (mode === "live" && source.SERVICE_PAYMENTS_LIVE_ACTIVATION !== "approved-v1") throw new ServicePaymentError("Live payment activation has not been explicitly approved.");
  const prefix = mode === "test" ? "TEST" : "LIVE";
  function selected(name: string, legacyName?: string) {
    const explicit = source[`STRIPE_SERVICE_${prefix}_${name}`];
    const legacy = legacyName ? source[legacyName] : undefined;
    if (explicit && legacy && explicit !== legacy) throw new ServicePaymentError("Conflicting legacy and test payment configuration.");
    return explicit || legacy;
  }
  const opposite = mode === "test" ? "LIVE" : "TEST";
  if (source[`STRIPE_SERVICE_${opposite}_SECRET_KEY`] || (mode === "live" && source.STRIPE_SERVICE_SECRET_KEY)) throw new ServicePaymentError("Do not provision the other payment mode's credentials in this environment.");
  // Generic legacy variables are accepted only for the previously tested test path.
  const secretKey = selected("SECRET_KEY", mode === "test" ? "STRIPE_SERVICE_SECRET_KEY" : undefined);
  if (!new RegExp(`^(sk|rk)_${mode}_[A-Za-z0-9]+$`).test(secretKey ?? "")) throw new ServicePaymentError(`A matching Stripe ${mode} secret or restricted key is required.`);
  const accountId = selected("ACCOUNT_ID", mode === "test" ? "STRIPE_SERVICE_ACCOUNT_ID" : undefined);
  if (!/^acct_[A-Za-z0-9]+$/.test(accountId ?? "")) throw new ServicePaymentError("A verified merchant account ID is required.");
  const workspaceId = z.uuid().parse(mode === "live" ? source.SERVICE_PAYMENTS_LIVE_WORKSPACE_ID : source.SERVICE_PAYMENTS_TEST_WORKSPACE_ID || source.SERVICE_PAYMENTS_WORKSPACE_ID);
  const url = new URL((mode === "live" ? source.SERVICE_PAYMENTS_LIVE_BASE_URL : source.SERVICE_PAYMENTS_TEST_BASE_URL || source.SERVICE_PAYMENTS_BASE_URL) ?? "");
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || (url.protocol !== "https:" && !(mode === "test" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new ServicePaymentError("Configure a clean HTTPS application origin; only local test mode permits HTTP.");
  if (mode === "live" && (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(url.hostname) || /\.(localhost|local|internal)$/i.test(url.hostname) || source.BETTER_AUTH_URL !== url.origin)) throw new ServicePaymentError("Live payments require a public HTTPS hostname matching BETTER_AUTH_URL exactly.");
  const webhookSecret = selected("WEBHOOK_SECRET", mode === "test" ? "STRIPE_SERVICE_WEBHOOK_SECRET" : undefined);
  if (!/^whsec_[A-Za-z0-9]+$/.test(webhookSecret ?? "")) throw new ServicePaymentError(`Configure the matching ${mode} webhook signing secret.`);
  let live: PaymentConfiguration["live"];
  if (mode === "live") {
    live = {
      approvalReference: reference.parse(source.SERVICE_PAYMENTS_LIVE_APPROVAL_REFERENCE),
      legalSeller: reference.parse(source.SERVICE_PAYMENTS_LIVE_LEGAL_SELLER),
      termsVersion: reference.parse(source.SERVICE_PAYMENTS_LIVE_TERMS_VERSION),
      webhookEndpointId: z.string().regex(/^we_[A-Za-z0-9]+$/).parse(source.STRIPE_SERVICE_LIVE_WEBHOOK_ENDPOINT_ID),
    };
  }
  return { mode, collectionEnabled: mode === "test" || source.SERVICE_PAYMENTS_LIVE_COLLECTION_ENABLED === "true", workspaceId, accountId: accountId!, secretKey: secretKey!, webhookSecret: webhookSecret!, baseUrl: url.origin, ...(live ? { live } : {}) };
}

export type PaymentMatch = { id: string; orderId: string; amountCents: number; sessionId: string | null; customerId: string | null; paymentMode?: PaymentMode };
export type SessionSnapshot = {
  id: string; livemode: boolean; mode: string; status: string | null;
  payment_status: string; currency: string | null; amount_total: number | null;
  customer: string | { id: string } | null;
  metadata: Record<string, string> | null;
};
export function isStripeCheckoutUrl(value: string) {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "checkout.stripe.com" && !url.username && !url.password;
}
export function verifySession(payment: PaymentMatch, session: SessionSnapshot) {
  const mode = payment.paymentMode ?? "test";
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (session.livemode !== (mode === "live") || (session.metadata?.service_payment_mode ?? "test") !== mode || session.mode !== "payment" || session.id !== payment.sessionId || !customerId || customerId !== payment.customerId || session.currency !== "usd" || session.amount_total !== payment.amountCents || session.metadata?.service_payment_id !== payment.id || session.metadata?.service_order_id !== payment.orderId) {
    throw new ServicePaymentError("Stripe session does not match the stored service payment.");
  }
  return session.status === "complete" && session.payment_status === "paid";
}
