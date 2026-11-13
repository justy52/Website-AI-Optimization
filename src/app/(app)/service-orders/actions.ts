"use server";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { getWorkspaceShellContext } from "@/server/auth";
import { createServiceOrder, prepareServiceCheckout, reconcileServicePayment, recoverServiceCheckout, updateServiceOnboarding, verifyServicePaymentReadiness } from "@/server/service-payments";
import { emptyOnboarding, ServicePaymentError } from "@/domain/payments/policy";
import { orderAmounts } from "@/domain/payments/pricing";

function value(f: FormData, key: string) { const v = f.get(key); return typeof v === "string" ? v : ""; }
export async function serviceOrderAction(f: FormData) {
  const { workspaceContext: c } = await getWorkspaceShellContext();
  let checkout: string | undefined;
  let verified = false;
  try {
    switch (value(f, "action")) {
      case "preflight": await verifyServicePaymentReadiness(c); verified = true; break;
      case "create":
        if (f.get("signatureVerified") !== "on") throw new ServicePaymentError("Verify the completed signed scope before recording an order.");
        {
          if (!/^[a-f0-9]{64}$/.test(value(f, "scopeSha256"))) throw new ServicePaymentError("Choose the signed agreement file so its fingerprint can be recorded.");
          // The form asks for dollars; the audit price is fixed and a launch is two equal halves.
          const amounts = orderAmounts(value(f, "service"), value(f, "totalDollars"));
          if (!amounts) throw new ServicePaymentError("Enter the launch total in dollars, for example 1500 or 2250.50. It must split into two equal payments.");
          await createServiceOrder(c, {
            clientId: value(f, "clientId"), websiteId: value(f, "websiteId"), service: value(f, "service"),
            scopeReference: value(f, "scopeReference"), scopeSha256: value(f, "scopeSha256"), termsVersion: value(f, "termsVersion"),
            signedAt: `${value(f, "signedAt")}T00:00:00.000Z`, customerEmail: value(f, "customerEmail"), deliveryOperator: value(f, "deliveryOperator"),
            ...amounts,
          });
        }
        break;
      case "onboarding":
        await updateServiceOnboarding(c, value(f, "orderId"), Number(value(f, "version")), Object.fromEntries(Object.keys(emptyOnboarding).map(k => [k, f.get(k) === "on"]))); break;
      case "checkout":
        if (value(f, "installment") !== "INITIAL" && value(f, "installment") !== "BALANCE") throw new ServicePaymentError("Invalid installment.");
        checkout = await prepareServiceCheckout(c, value(f, "orderId"), value(f, "installment") as "INITIAL" | "BALANCE"); break;
      case "reconcile": await reconcileServicePayment(c, value(f, "paymentId")); break;
      case "recover": await recoverServiceCheckout(c, value(f, "paymentId"), value(f, "sessionId")); break;
      default: throw new ServicePaymentError("Unknown action.");
    }
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof ServicePaymentError ? error.message
      : error instanceof ZodError ? (error.issues[0]?.code === "custom" ? error.issues[0].message : "One of the details is missing or not valid. Check the form and try again.")
      : "That could not be saved. Check the details and try again.";
    if (!(error instanceof ServicePaymentError) && !(error instanceof ZodError)) console.error("service_order_action_failed", { name: error instanceof Error ? error.name : typeof error });
    redirect(`/service-orders?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/service-orders");
  if (checkout) redirect(checkout as `https://${string}`);
  if (verified) redirect("/service-orders?verified=1");
  redirect("/service-orders");
}
