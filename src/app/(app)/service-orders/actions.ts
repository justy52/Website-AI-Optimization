"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getWorkspaceShellContext } from "@/server/auth";
import { createServiceOrder, prepareServiceCheckout, reconcileServicePayment, recoverServiceCheckout, updateServiceOnboarding, verifyServicePaymentReadiness } from "@/server/service-payments";
import { emptyOnboarding, ServicePaymentError } from "@/domain/payments/policy";

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
        await createServiceOrder(c, {
          clientId: value(f, "clientId"), websiteId: value(f, "websiteId"), service: value(f, "service"),
          scopeReference: value(f, "scopeReference"), scopeSha256: value(f, "scopeSha256"), termsVersion: value(f, "termsVersion"),
          signedAt: `${value(f, "signedAt")}T00:00:00.000Z`, customerEmail: value(f, "customerEmail"), deliveryOperator: value(f, "deliveryOperator"),
          totalCents: Number(value(f, "totalCents")), depositCents: Number(value(f, "depositCents")),
        }); break;
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
    const message = error instanceof ServicePaymentError ? error.message : "Unable to save. Check the fields, payment configuration, and your current access.";
    redirect(`/service-orders?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/service-orders");
  if (checkout) redirect(checkout as `https://${string}`);
  if (verified) redirect("/service-orders?verified=1");
  redirect("/service-orders");
}
