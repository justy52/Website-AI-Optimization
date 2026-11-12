import { notifyOwnerLater } from "@/server/email";
import { paymentConfiguration } from "@/domain/payments/policy";
import { parsePaymentEvent, StripeServicePayments } from "@/domain/payments/stripe";
import { processServicePaymentEvent } from "@/server/service-payments";

export const runtime = "nodejs";
export async function POST(request: Request) {
  let config;
  try { config = paymentConfiguration(); } catch { return Response.json({ error: "Service payments unavailable" }, { status: 503 }); }
  const signature = request.headers.get("stripe-signature");
  if (!signature || !request.body) return Response.json({ error: "Signature required" }, { status: 400 });
  const limit = 262144;
  if (Number(request.headers.get("content-length")) > limit) return new Response(null, { status: 413 });
  const chunks: Uint8Array[] = []; let size = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); return new Response(null, { status: 413 }); }
    chunks.push(value);
  }
  const provider = new StripeServicePayments(config);
  let event;
  try { event = parsePaymentEvent(provider.stripe, Buffer.concat(chunks).toString("utf8"), signature, config.webhookSecret); }
  catch { return Response.json({ error: "Invalid signature or event" }, { status: 400 }); }
  if (event.livemode !== (config.mode === "live") || (event.account && event.account !== config.accountId)) return Response.json({ error: "Wrong payment mode or account" }, { status: 400 });
  try {
    await processServicePaymentEvent(event, { configuration: config, provider });
    return Response.json({ received: true });
  } catch (error) {
    // No raw payment, email, credential, or provider error details in responses/logs.
    console.error("service_payment_event_failed", { eventId: event.id, type: event.type, name: error instanceof Error ? error.name : typeof error });
    notifyOwnerLater(
      "A Stripe payment event needs review",
      "Virelantic could not process a payment event from Stripe. Stripe will retry it. If this repeats, open Service orders in the app and review the payment.",
    );
    return Response.json({ error: "Reconciliation pending; retry delivery" }, { status: 503 });
  }
}
