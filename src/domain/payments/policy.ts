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

export function paymentConfiguration(source: Record<string, string | undefined> = process.env) {
  if (source.SERVICE_PAYMENTS_MODE !== "test") throw new ServicePaymentError("Service payments are disabled. Test mode must be explicitly enabled.");
  if (source.APP_ENV === "production" || source.VERCEL_ENV === "production") throw new ServicePaymentError("Test service payments cannot run in production.");
  if (!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(source.STRIPE_SERVICE_SECRET_KEY ?? "")) throw new ServicePaymentError("A Stripe test secret or restricted key is required.");
  if (!/^acct_[A-Za-z0-9]+$/.test(source.STRIPE_SERVICE_ACCOUNT_ID ?? "")) throw new ServicePaymentError("A verified Stripe account ID is required.");
  const workspaceId = z.uuid().parse(source.SERVICE_PAYMENTS_WORKSPACE_ID);
  const url = new URL(source.SERVICE_PAYMENTS_BASE_URL ?? "");
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new ServicePaymentError("Use an HTTPS application origin (HTTP localhost is allowed).");
  const webhookSecret = source.STRIPE_SERVICE_WEBHOOK_SECRET;
  if (!webhookSecret?.startsWith("whsec_")) throw new ServicePaymentError("Configure the test webhook signing secret.");
  return { workspaceId, accountId: source.STRIPE_SERVICE_ACCOUNT_ID!, secretKey: source.STRIPE_SERVICE_SECRET_KEY!, webhookSecret, baseUrl: url.origin };
}

export type PaymentMatch = { id: string; orderId: string; amountCents: number; sessionId: string | null; customerId: string | null };
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
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (session.livemode || session.mode !== "payment" || session.id !== payment.sessionId || !customerId || customerId !== payment.customerId || session.currency !== "usd" || session.amount_total !== payment.amountCents || session.metadata?.service_payment_id !== payment.id || session.metadata?.service_order_id !== payment.orderId) {
    throw new ServicePaymentError("Stripe session does not match the stored service payment.");
  }
  return session.status === "complete" && session.payment_status === "paid";
}
