import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { activityEvents, clients, serviceOrders, servicePayments, servicePaymentEvents, websites, workspaceMemberships, workspaces } from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import { AuthorizationError, assertWorkspaceRole, type WorkspaceContext } from "@/domain/tenancy/context";
import { emptyOnboarding, isStripeCheckoutUrl, onboardingInput, orderInput, paymentConfiguration, readiness, ServicePaymentError, verifySession } from "@/domain/payments/policy";
import { StripeServicePayments, type PaymentEvent, type ServicePaymentProvider } from "@/domain/payments/stripe";
import { enforceActionRateLimit } from "./operations";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Configuration = ReturnType<typeof paymentConfiguration>;
type Dependencies = { database?: typeof db; configuration?: Configuration; provider?: ServicePaymentProvider };
function setup(deps: Dependencies) {
  const configuration = deps.configuration ?? paymentConfiguration();
  return { database: deps.database ?? db, config: configuration, provider: deps.provider ?? new StripeServicePayments(configuration.secretKey, configuration.accountId) };
}
async function authorize(tx: Tx, c: WorkspaceContext, write: boolean) {
  if (c.actorType !== "USER" || !c.userId) throw new AuthorizationError();
  const [membership] = await tx.select().from(workspaceMemberships).where(and(eq(workspaceMemberships.workspaceId, c.workspaceId), eq(workspaceMemberships.userId, c.userId), eq(workspaceMemberships.status, "ACTIVE")));
  const [workspace] = await tx.select().from(workspaces).where(and(eq(workspaces.id, c.workspaceId), isNull(workspaces.archivedAt), isNull(workspaces.deletionPendingAt)));
  if (!membership || !workspace) throw new AuthorizationError();
  if (write) assertWorkspaceRole({ ...c, role: membership.role }, ["OWNER", "ADMIN"]);
}
async function activity(tx: Tx, c: WorkspaceContext, action: string, id: string, summary: Record<string, unknown> = {}) {
  await tx.insert(activityEvents).values({ workspaceId: c.workspaceId, actorType: c.actorType, actorUserId: c.userId, action, resourceType: "service_order", resourceId: id, summary });
}
function assertMerchantWorkspace(c: WorkspaceContext, config: Configuration) {
  if (c.workspaceId !== config.workspaceId) throw new AuthorizationError("Payments are configured for another workspace.");
}
async function assertActiveTarget(tx: Tx, c: WorkspaceContext, order: typeof serviceOrders.$inferSelect) {
  const [target] = await tx.select({ id: websites.id }).from(websites).innerJoin(clients, and(eq(clients.id, websites.clientId), eq(clients.workspaceId, websites.workspaceId))).where(and(eq(websites.workspaceId, c.workspaceId), eq(websites.id, order.websiteId), eq(clients.id, order.clientId), eq(clients.status, "ACTIVE"), isNull(clients.archivedAt), isNull(websites.archivedAt)));
  if (!target) throw new ServicePaymentError("The client or website is paused or archived; new checkout is blocked.");
}

export async function createServiceOrder(c: WorkspaceContext, input: unknown, deps: Dependencies = {}) {
  const { database, config } = setup(deps);
  assertMerchantWorkspace(c, config);
  await enforceActionRateLimit(c, "service_payment", database);
  const data = orderInput.parse(input);
  return withTenantContext(database, c, async tx => {
    await authorize(tx, c, true);
    const [site] = await tx.select({ id: websites.id }).from(websites).innerJoin(clients, and(eq(clients.id, websites.clientId), eq(clients.workspaceId, websites.workspaceId))).where(and(eq(websites.workspaceId, c.workspaceId), eq(websites.clientId, data.clientId), eq(websites.id, data.websiteId), isNull(websites.archivedAt), isNull(clients.archivedAt)));
    if (!site) throw new ServicePaymentError("Active client website not found.");
    const [existing] = await tx.select().from(serviceOrders).where(and(eq(serviceOrders.workspaceId, c.workspaceId), eq(serviceOrders.scopeReference, data.scopeReference)));
    if (existing) {
      if (existing.clientId !== data.clientId || existing.websiteId !== data.websiteId || existing.scopeSha256 !== data.scopeSha256 || existing.service !== data.service || existing.totalCents !== data.totalCents || existing.depositCents !== data.depositCents || existing.customerEmail !== data.customerEmail || existing.termsVersion !== data.termsVersion || existing.signedAt.getTime() !== new Date(data.signedAt).getTime() || existing.deliveryOperator !== data.deliveryOperator) throw new ServicePaymentError("Scope reference already belongs to a different schedule.");
      return existing;
    }
    const [order] = await tx.insert(serviceOrders).values({ ...data, workspaceId: c.workspaceId, signedAt: new Date(data.signedAt), onboarding: emptyOnboarding, createdBy: c.userId! }).returning();
    await activity(tx, c, "service.order.recorded", order.id, { scopeSha256: order.scopeSha256, service: order.service, testMode: true });
    return order;
  });
}

export async function updateServiceOnboarding(c: WorkspaceContext, orderId: string, version: number, input: unknown, deps: Dependencies = {}) {
  const { database, config } = setup(deps); assertMerchantWorkspace(c, config); z.uuid().parse(orderId);
  await enforceActionRateLimit(c, "service_payment", database);
  z.number().int().positive().parse(version);
  const evidence = onboardingInput.parse(input);
  return withTenantContext(database, c, async tx => {
    await authorize(tx, c, true);
    const [order] = await tx.update(serviceOrders).set({ onboarding: evidence, onboardingVersion: version + 1, updatedAt: new Date() }).where(and(eq(serviceOrders.workspaceId, c.workspaceId), eq(serviceOrders.id, orderId), eq(serviceOrders.onboardingVersion, version))).returning();
    if (!order) throw new ServicePaymentError("Order changed; reload before updating readiness.");
    await activity(tx, c, "service.onboarding.reviewed", orderId, { evidence, version: version + 1 });
    return order;
  });
}

export async function prepareServiceCheckout(c: WorkspaceContext, orderId: string, installment: "INITIAL" | "BALANCE", deps: Dependencies = {}) {
  const { database, config, provider } = setup(deps); assertMerchantWorkspace(c, config); z.uuid().parse(orderId);
  await enforceActionRateLimit(c, "service_payment", database);
  z.enum(["INITIAL", "BALANCE"]).parse(installment);
  // Commit identity and request expiry before any provider call. Uncertain outcomes
  // can only retry this exact identity, never silently create another payment.
  const payment = await withTenantContext(database, c, async tx => {
    await authorize(tx, c, true);
    const [order] = await tx.select().from(serviceOrders).where(and(eq(serviceOrders.workspaceId, c.workspaceId), eq(serviceOrders.id, orderId))).for("update");
    if (!order?.onboarding.scopeStillValid) throw new ServicePaymentError("Current signed scope is required.");
    await assertActiveTarget(tx, c, order);
    if (installment === "BALANCE") {
      const [initial] = await tx.select().from(servicePayments).where(and(eq(servicePayments.workspaceId, c.workspaceId), eq(servicePayments.orderId, orderId), eq(servicePayments.installment, "INITIAL")));
      if (order.service !== "LAUNCH" || !order.onboarding.completionAccepted || initial?.state !== "PAID") throw new ServicePaymentError("Accepted completion and paid deposit are required before final payment.");
    }
    const [existing] = await tx.select().from(servicePayments).where(and(eq(servicePayments.workspaceId, c.workspaceId), eq(servicePayments.orderId, orderId), eq(servicePayments.installment, installment)));
    if (existing) return existing;
    const attemptedAt = new Date();
    const [created] = await tx.insert(servicePayments).values({ workspaceId: c.workspaceId, orderId, installment, amountCents: installment === "INITIAL" ? order.depositCents : order.totalCents - order.depositCents, accountId: config.accountId, baseUrl: config.baseUrl, attemptedAt, expiresAt: new Date(attemptedAt.getTime() + 23 * 60 * 60 * 1000) }).returning();
    await activity(tx, c, "service.checkout.reserved", orderId, { paymentId: created.id, installment });
    return created;
  });
  if (payment.accountId !== config.accountId || payment.baseUrl !== config.baseUrl) throw new ServicePaymentError("Payment configuration changed; operator review required.");
  const result = await withTenantContext(database, c, async tx => {
    await authorize(tx, c, true);
    const [order] = await tx.select().from(serviceOrders).where(and(eq(serviceOrders.workspaceId, c.workspaceId), eq(serviceOrders.id, orderId))).for("update");
    const [locked] = await tx.select().from(servicePayments).where(and(eq(servicePayments.workspaceId, c.workspaceId), eq(servicePayments.id, payment.id))).for("update");
    if (!order.onboarding.scopeStillValid || locked.state !== "PENDING") throw new ServicePaymentError("Payment is paid, under review, or scope has been revoked.");
    await assertActiveTarget(tx, c, order);
    if (installment === "BALANCE") {
      const [initial] = await tx.select().from(servicePayments).where(and(eq(servicePayments.workspaceId, c.workspaceId), eq(servicePayments.orderId, orderId), eq(servicePayments.installment, "INITIAL"))).for("update");
      if (!order.onboarding.completionAccepted || initial?.state !== "PAID") throw new ServicePaymentError("Deposit status or completion acceptance changed; final payment is blocked.");
    }
    if (!locked.expiresAt || locked.expiresAt.getTime() < Date.now() + (locked.sessionId ? 0 : 31 * 60 * 1000)) throw new ServicePaymentError("Checkout expired or outcome is too old. Reconcile manually before preparing another payment.");
    await provider.verifyAccount();
    if (locked.sessionId) {
      const session = await provider.retrieveCheckout(locked.sessionId);
      await applySnapshot(tx, c, locked, session);
      if (session.url && !isStripeCheckoutUrl(session.url)) throw new ServicePaymentError("Unexpected Checkout URL.");
      return session.status === "open" && !session.financialReview ? session.url : null;
    }
    const session = await provider.createCheckout({ paymentId: locked.id, orderId, email: order.customerEmail, amountCents: locked.amountCents, label: `Virelantic ${order.service === "AUDIT_ONLY" ? "Digital Visibility Audit" : `Optimization Launch ${installment === "INITIAL" ? "deposit" : "final balance"}`} (TEST)`, baseUrl: locked.baseUrl, expiresAt: locked.expiresAt });
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (!session.id.startsWith("cs_test_") || !session.url || !isStripeCheckoutUrl(session.url) || !customerId) throw new ServicePaymentError("Unexpected test Checkout response; reconcile before retrying.");
    verifySession({ ...locked, sessionId: session.id, customerId }, session);
    await tx.update(servicePayments).set({ customerId, sessionId: session.id, checkoutUrl: session.url, updatedAt: new Date() }).where(and(eq(servicePayments.workspaceId, c.workspaceId), eq(servicePayments.id, locked.id)));
    await activity(tx, c, "service.checkout.prepared", orderId, { paymentId: locked.id, sessionId: session.id });
    return session.url;
  });
  if (!result) throw new ServicePaymentError("Checkout is no longer open. Payment status has been refreshed.");
  return result;
}

async function applySnapshot(tx: Tx, c: WorkspaceContext, payment: typeof servicePayments.$inferSelect, session: Awaited<ReturnType<ServicePaymentProvider["retrieveCheckout"]>>) {
  const paid = verifySession(payment, session);
  const state = payment.state === "REVIEW" || session.financialReview || (payment.state === "PAID" && !paid) ? "REVIEW" : paid ? "PAID" : payment.state;
  await tx.update(servicePayments).set({ state, paidAt: paid ? payment.paidAt ?? new Date() : payment.paidAt, reviewReason: session.financialReview ? "REFUND_OR_DISPUTE" : payment.reviewReason, updatedAt: new Date() }).where(and(eq(servicePayments.workspaceId, c.workspaceId), eq(servicePayments.id, payment.id)));
  if (state !== payment.state) await activity(tx, c, "service.payment.reconciled", payment.orderId, { paymentId: payment.id, previousState: payment.state, state });
}

export async function reconcileServicePayment(c: WorkspaceContext, paymentId: string, deps: Dependencies = {}) {
  const { database, config, provider } = setup(deps); assertMerchantWorkspace(c, config); z.uuid().parse(paymentId);
  await enforceActionRateLimit(c, "service_payment", database);
  await withTenantContext(database, c, async tx => {
    await authorize(tx, c, true);
    const [payment] = await tx.select().from(servicePayments).where(and(eq(servicePayments.workspaceId, c.workspaceId), eq(servicePayments.id, paymentId))).for("update");
    if (!payment?.sessionId || payment.accountId !== config.accountId) throw new ServicePaymentError("No matching Checkout session. Unknown creation outcome requires operator review.");
    await provider.verifyAccount();
    await applySnapshot(tx, c, payment, await provider.retrieveCheckout(payment.sessionId));
  });
}

// Operator-assisted recovery never creates a provider object. It binds only an
// existing test session whose immutable metadata and amount match the reservation.
export async function recoverServiceCheckout(c: WorkspaceContext, paymentId: string, sessionId: string, deps: Dependencies = {}) {
  const { database, config, provider } = setup(deps); assertMerchantWorkspace(c, config);
  z.uuid().parse(paymentId); z.string().regex(/^cs_test_[A-Za-z0-9_-]+$/).parse(sessionId);
  await enforceActionRateLimit(c, "service_payment", database);
  await withTenantContext(database, c, async tx => {
    await authorize(tx, c, true);
    const [payment] = await tx.select().from(servicePayments).where(and(eq(servicePayments.workspaceId, c.workspaceId), eq(servicePayments.id, paymentId))).for("update");
    if (!payment || payment.accountId !== config.accountId || payment.sessionId || payment.state !== "PENDING") throw new ServicePaymentError("Only an unbound pending payment can be recovered.");
    await provider.verifyAccount();
    const session = await provider.retrieveCheckout(sessionId);
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (!customerId || (session.url && !isStripeCheckoutUrl(session.url))) throw new ServicePaymentError("Unexpected provider session.");
    const bound = { ...payment, sessionId, customerId, checkoutUrl: session.url };
    verifySession(bound, session);
    await tx.update(servicePayments).set({ sessionId, customerId, checkoutUrl: session.url, updatedAt: new Date() }).where(and(eq(servicePayments.workspaceId, c.workspaceId), eq(servicePayments.id, paymentId)));
    await applySnapshot(tx, c, bound, session);
    await activity(tx, c, "service.checkout.recovered", payment.orderId, { paymentId, sessionId });
  });
}

export async function processServicePaymentEvent(event: PaymentEvent, deps: Dependencies = {}) {
  const { database, config, provider } = setup(deps);
  if (event.livemode || (event.account && event.account !== config.accountId)) throw new ServicePaymentError("Wrong mode or merchant account.");
  const c: WorkspaceContext = { workspaceId: config.workspaceId, actorType: "SYSTEM", role: "ADMIN", correlationId: "service-payment-webhook" };
  try { return await withTenantContext(database, c, async tx => {
    const [receipt] = await tx.insert(servicePaymentEvents).values({ workspaceId: c.workspaceId, accountId: config.accountId, eventId: event.id, eventType: event.type, objectId: event.objectId, outcome: "RECEIVED" }).onConflictDoNothing().returning();
    if (!receipt) {
      const [previous] = await tx.select().from(servicePaymentEvents).where(and(eq(servicePaymentEvents.workspaceId, c.workspaceId), eq(servicePaymentEvents.accountId, config.accountId), eq(servicePaymentEvents.eventId, event.id))).for("update");
      if (previous.outcome !== "FAILED_RETRY") return "DUPLICATE";
    }
    await provider.verifyAccount();
    const checkout = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"].includes(event.type);
    const risk = ["charge.refunded", "charge.dispute.created"].includes(event.type);
    let outcome = "IGNORED";
    if (checkout || risk) {
      const paymentId = risk ? await provider.paymentIdForCharge(event.objectId) : undefined;
      const [payment] = await tx.select().from(servicePayments).where(and(eq(servicePayments.workspaceId, c.workspaceId), eq(servicePayments.accountId, config.accountId), checkout ? eq(servicePayments.sessionId, event.objectId) : eq(servicePayments.id, paymentId && z.uuid().safeParse(paymentId).success ? paymentId : "00000000-0000-4000-8000-000000000000"))).for("update");
      if (payment?.sessionId) {
        const session = await provider.retrieveCheckout(payment.sessionId);
        await applySnapshot(tx, c, payment, { ...session, financialReview: session.financialReview || risk });
        outcome = risk ? "REVIEW" : "RECONCILED";
      } else if (checkout && event.paymentId) {
        // A webhook may race session persistence. Retry rather than lose payment truth.
        throw new ServicePaymentError("Session is not bound yet; retry after checkout persistence or reconcile the unmatched event.");
      } else outcome = "UNMATCHED_REVIEW";
    }
    await tx.update(servicePaymentEvents).set({ outcome }).where(and(eq(servicePaymentEvents.workspaceId, c.workspaceId), eq(servicePaymentEvents.accountId, config.accountId), eq(servicePaymentEvents.eventId, event.id)));
    return outcome;
  }); } catch (error) {
    // A failed attempt remains visible without retaining raw customer payloads.
    // FAILED_RETRY receipts are reprocessed, never mistaken for completed events.
    await withTenantContext(database, c, tx => tx.insert(servicePaymentEvents).values({ workspaceId: c.workspaceId, accountId: config.accountId, eventId: event.id, eventType: event.type, objectId: event.objectId, outcome: "FAILED_RETRY" }).onConflictDoNothing());
    throw error;
  }
}

export async function listServiceOrders(c: WorkspaceContext, database = db) {
  return withTenantContext(database, c, async tx => {
    await authorize(tx, c, false);
    const orders = await tx.select().from(serviceOrders).where(eq(serviceOrders.workspaceId, c.workspaceId)).orderBy(desc(serviceOrders.createdAt)).limit(100);
    const payments = await tx.select().from(servicePayments).where(eq(servicePayments.workspaceId, c.workspaceId));
    const events = await tx.select().from(servicePaymentEvents).where(eq(servicePaymentEvents.workspaceId, c.workspaceId)).orderBy(desc(servicePaymentEvents.receivedAt)).limit(30);
    return { orders: orders.map(o => { const matching = payments.filter(p => p.orderId === o.id); return { ...o, payments: matching, blocked: readiness(o.service, o.onboarding, matching.some(p => p.state === "REVIEW") ? "REVIEW" : matching.find(p => p.installment === "INITIAL")?.state) }; }), events };
  });
}
