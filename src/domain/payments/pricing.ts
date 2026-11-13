/** Fixed prices the payment rules enforce. Kept free of server imports so forms can show them. */
export const AUDIT_PRICE_CENTS = 49_500;
export const LAUNCH_MINIMUM_CENTS = 150_000;

/**
 * Turn what the operator entered into the amounts the payment rules expect.
 * The audit has one fixed price; a launch is paid in two equal halves.
 * Returns null when the launch total is not a usable dollar amount.
 */
export function orderAmounts(service: string, totalDollars: string): { totalCents: number; depositCents: number } | null {
  if (service === "AUDIT_ONLY") return { totalCents: AUDIT_PRICE_CENTS, depositCents: AUDIT_PRICE_CENTS };
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(totalDollars.trim())) return null;
  const totalCents = Math.round(Number(totalDollars) * 100);
  if (totalCents % 2 !== 0) return null;
  return { totalCents, depositCents: totalCents / 2 };
}

const SERVICE_NAMES: Record<string, string> = { AUDIT_ONLY: "Digital Visibility Audit", LAUNCH: "Optimization Launch" };
const PAYMENT_STATES: Record<string, string> = {
  RESERVED: "Not paid yet",
  PENDING: "Payment page open, not paid yet",
  PAID: "Paid",
  REVIEW: "Needs your review",
  EXPIRED: "Payment page expired",
  FAILED: "Payment failed",
  CANCELED: "Cancelled",
};
const REVIEW_REASONS: Record<string, string> = { REFUND_OR_DISPUTE: "a refund or dispute was reported by Stripe" };
const EVENT_NAMES: Record<string, string> = {
  "checkout.session.completed": "Customer completed the payment page",
  "checkout.session.async_payment_succeeded": "A delayed payment succeeded",
  "checkout.session.async_payment_failed": "A delayed payment failed",
  "checkout.session.expired": "A payment page expired unused",
  "charge.refunded": "A charge was refunded",
  "charge.dispute.created": "A customer disputed a charge",
};

const sentence = (code: string) => {
  const words = code.replaceAll(/[_.]+/g, " ").trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : "Unknown";
};

export const serviceName = (service: string) => SERVICE_NAMES[service] ?? sentence(service);
export const paymentStateLabel = (state: string) => PAYMENT_STATES[state] ?? sentence(state);
export const reviewReasonLabel = (reason: string) => REVIEW_REASONS[reason] ?? sentence(reason);
export const paymentEventLabel = (type: string) => EVENT_NAMES[type] ?? sentence(type);
export const installmentLabel = (installment: string, service: string) =>
  service === "AUDIT_ONLY" ? "Full payment" : installment === "INITIAL" ? "First half (before work starts)" : "Second half (on completion)";
