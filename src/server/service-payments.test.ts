import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import type { WorkspaceContext } from "@/domain/tenancy/context";
import { emptyOnboarding, paymentConfiguration } from "@/domain/payments/policy";
import type { CheckoutRequest, ProviderSession, ServicePaymentProvider } from "@/domain/payments/stripe";
import { createServiceOrder, listServiceOrders, prepareServiceCheckout, processServicePaymentEvent, reconcileServicePayment, recoverServiceCheckout, updateServiceOnboarding } from "./service-payments";
import { exportWorkspace } from "./workspace-export";
import { livePaymentEnvironment } from "@/domain/payments/test-fixtures";
import { verifyServicePaymentReadiness } from "./service-payments";

describe.sequential("Service orders with isolated Postgres and non-bypass RLS", () => {
  let pg: PGlite, database: Db, c: WorkspaceContext, clientId: string, websiteId: string, otherClient: string, otherWebsite: string;
  let config: ReturnType<typeof paymentConfiguration>, provider: ServicePaymentProvider;
  let sessions: Map<string, ProviderSession>, requests: CheckoutRequest[], timeoutOnce: boolean;
  const dependencies = () => ({ database, configuration: config, provider });
  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec("CREATE ROLE virelantic_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT");
    for (const file of readdirSync("drizzle").filter(f => /^\d+.*\.sql$/.test(f)).sort()) await pg.exec(readFileSync(`drizzle/${file}`, "utf8"));
    database = drizzle(pg, { schema }) as unknown as Db;
  }, 60000);
  beforeEach(async () => {
    const workspaceId = randomUUID(), userId = randomUUID();
    c = { workspaceId, userId, actorType: "USER", role: "OWNER" };
    clientId = randomUUID(); websiteId = randomUUID(); otherClient = randomUUID(); otherWebsite = randomUUID();
    await pg.query('INSERT INTO "user" (id,name,email) VALUES ($1,$1,$2)', [userId, `${userId}@example.com`]);
    await pg.query("INSERT INTO workspaces (id,name,slug) VALUES ($1,'Synthetic payment test',$2)", [workspaceId, workspaceId]);
    await pg.query("INSERT INTO workspace_memberships (workspace_id,user_id,role) VALUES ($1,$2,'OWNER')", [workspaceId, userId]);
    for (const [id, site] of [[clientId, websiteId], [otherClient, otherWebsite]]) {
      await pg.query("INSERT INTO clients(id,workspace_id,name) VALUES($1,$2,'Synthetic client')", [id, workspaceId]);
      await pg.query("INSERT INTO websites(id,workspace_id,client_id,display_name,domain,canonical_url) VALUES($1,$2,$3,'Synthetic site',$4,$5)", [site, workspaceId, id, `${site}.example.com`, `https://${site}.example.com`]);
    }
    config = paymentConfiguration({ SERVICE_PAYMENTS_MODE: "test", STRIPE_SERVICE_SECRET_KEY: "sk_test_fixture", STRIPE_SERVICE_WEBHOOK_SECRET: "whsec_fixture", STRIPE_SERVICE_ACCOUNT_ID: "acct_fixture", SERVICE_PAYMENTS_WORKSPACE_ID: workspaceId, SERVICE_PAYMENTS_BASE_URL: "http://localhost:3000" });
    sessions = new Map(); requests = []; timeoutOnce = false;
    provider = {
      verifyAccount: vi.fn(async () => {}),
      createCheckout: vi.fn(async request => {
        requests.push(request);
        const id = `cs_${config.mode}_${request.paymentId}`;
        if (!sessions.has(id)) sessions.set(id, { id, mode: "payment", livemode: config.mode === "live", status: "open", payment_status: "unpaid", currency: "usd", amount_total: request.amountCents, customer: `cus_${request.paymentId}`, metadata: { service_payment_id: request.paymentId, service_order_id: request.orderId, ...(config.mode === "live" ? { service_payment_mode: "live" } : {}) }, url: `https://checkout.stripe.com/c/pay/${id}`, financialReview: false });
        if (timeoutOnce) { timeoutOnce = false; throw new Error("Synthetic timeout after provider creation"); }
        return structuredClone(sessions.get(id)!);
      }),
      retrieveCheckout: vi.fn(async id => structuredClone(sessions.get(id)!)),
      paymentIdForCharge: vi.fn(async () => [...sessions.values()][0]?.metadata?.service_payment_id),
    };
    await pg.exec("SET ROLE virelantic_runtime");
    const roles = await pg.query<{ rolsuper: boolean; rolbypassrls: boolean }>("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user");
    expect(roles.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });
  afterEach(async () => { await pg.exec("RESET ROLE"); });
  afterAll(async () => { await pg?.close(); });
  function input(overrides = {}) { return { clientId, websiteId, service: "AUDIT_ONLY", scopeReference: `signed-${randomUUID()}`, scopeSha256: "a".repeat(64), termsVersion: "test-terms-v1", signedAt: "2026-01-01T00:00:00.000Z", customerEmail: "synthetic@example.com", deliveryOperator: "Synthetic operator", totalCents: 49500, depositCents: 49500, ...overrides }; }
  async function order(overrides = {}) { return createServiceOrder(c, input(overrides), dependencies()); }
  async function panel() { return listServiceOrders(c, database, config.mode); }
  async function checkout() { const o = await order(); await prepareServiceCheckout(c, o.id, "INITIAL", dependencies()); return o; }
  function paid() { for (const session of sessions.values()) { session.status = "complete"; session.payment_status = "paid"; } }
  async function event(id = "evt_paid", type = "checkout.session.completed") { const s = [...sessions.values()][0]; return processServicePaymentEvent({ id, type, objectId: s.id, livemode: config.mode === "live", paymentId: s.metadata!.service_payment_id }, dependencies()); }
  it("applies the entire migration chain and protects new tables with forced RLS", async () => {
    const rows = await pg.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('service_orders','service_payments','service_payment_events') ORDER BY relname");
    expect(rows.rows).toHaveLength(3);
    for (const row of rows.rows) expect(row).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
    const grants = await pg.query<{ allowed: boolean }>("SELECT has_table_privilege('virelantic_runtime','service_payments','SELECT,INSERT,UPDATE') AS allowed");
    expect(grants.rows[0].allowed).toBe(true);
  });
  it("binds order to client+website and deduplicates signed references", async () => {
    const data = input(); const a = await createServiceOrder(c, data, dependencies());
    expect((await createServiceOrder(c, data, dependencies())).id).toBe(a.id);
    await expect(createServiceOrder(c, { ...data, customerEmail: "changed@example.com" }, dependencies())).rejects.toThrow("different schedule");
    await expect(order({ websiteId: otherWebsite })).rejects.toThrow("not found");
  });
  it("rechecks current membership, blocks analysts, suspended users and forged workspace", async () => {
    await order();
    const stranger = { ...c, workspaceId: randomUUID() };
    await expect(listServiceOrders(stranger, database)).rejects.toThrow();
    await withTenantContext(database, c, async tx => { await tx.update(schema.workspaceMemberships).set({ role: "ANALYST" }).where(and(eq(schema.workspaceMemberships.workspaceId, c.workspaceId), eq(schema.workspaceMemberships.userId, c.userId!))); });
    await expect(order()).rejects.toThrow("ANALYST");
    expect((await panel()).orders).toHaveLength(1);
    await pg.exec("RESET ROLE"); await pg.query("UPDATE workspace_memberships SET status='SUSPENDED' WHERE workspace_id=$1", [c.workspaceId]); await pg.exec("SET ROLE virelantic_runtime");
    await expect(panel()).rejects.toThrow();
  });
  it("keeps one payment on duplicate and concurrent checkout requests", async () => {
    const o = await order();
    const urls = await Promise.all([prepareServiceCheckout(c, o.id, "INITIAL", dependencies()), prepareServiceCheckout(c, o.id, "INITIAL", dependencies())]);
    expect(urls[0]).toBe(urls[1]); expect(sessions.size).toBe(1); expect(requests).toHaveLength(1);
    expect((await panel()).orders[0].payments).toHaveLength(1);
  });
  it("retries an uncertain provider outcome with identical payment identity and expiry", async () => {
    const o = await order(); timeoutOnce = true;
    await expect(prepareServiceCheckout(c, o.id, "INITIAL", dependencies())).rejects.toThrow("timeout");
    await prepareServiceCheckout(c, o.id, "INITIAL", dependencies());
    expect(requests).toHaveLength(2); expect(requests[0]).toEqual(requests[1]); expect(sessions.size).toBe(1);
  });
  it("processes paid events once and never grants automatic fulfillment", async () => {
    await checkout(); paid();
    expect(await event()).toBe("RECONCILED"); expect(await event()).toBe("DUPLICATE");
    expect(await event("evt_second")).toBe("RECONCILED");
    const p = await panel(); expect(p.orders[0].payments[0].state).toBe("PAID"); expect(p.orders[0].blocked).toContain("Minimum intake and approval contact");
    const logs = await withTenantContext(database, c, tx => tx.select().from(schema.activityEvents).where(and(eq(schema.activityEvents.workspaceId, c.workspaceId), eq(schema.activityEvents.action, "service.payment.reconciled"))));
    expect(logs).toHaveLength(1);
  });
  it("recovers a timed-out provider session without creating a second payment", async () => {
    const o = await order(); timeoutOnce = true;
    await expect(prepareServiceCheckout(c, o.id, "INITIAL", dependencies())).rejects.toThrow("timeout");
    const p = (await panel()).orders[0].payments[0], session = [...sessions.values()][0];
    session.amount_total = 1;
    await expect(recoverServiceCheckout(c, p.id, session.id, dependencies())).rejects.toThrow("does not match");
    session.amount_total = 49500; paid();
    await recoverServiceCheckout(c, p.id, session.id, dependencies());
    expect((await panel()).orders[0].payments[0]).toMatchObject({ state: "PAID", sessionId: session.id });
    expect(requests).toHaveLength(1);
  });
  it("keeps unpaid and processing sessions pending even with completed-event delivery", async () => {
    await checkout(); await event();
    expect((await panel()).orders[0].payments[0].state).toBe("PENDING");
  });
  it("blocks old uncertain attempts before the provider idempotency key can expire", async () => {
    const o = await order(); timeoutOnce = true;
    await expect(prepareServiceCheckout(c, o.id, "INITIAL", dependencies())).rejects.toThrow("timeout");
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 26 * 60 * 60 * 1000);
    try { await expect(prepareServiceCheckout(c, o.id, "INITIAL", dependencies())).rejects.toThrow("too old"); }
    finally { clock.mockRestore(); }
    expect(requests).toHaveLength(1); expect(sessions.size).toBe(1);
  });
  it("exports service records while removing hosted Checkout links", async () => {
    await checkout(); paid(); await event();
    const exported = await exportWorkspace(c, c.workspaceId, database);
    expect(exported.schemaVersion).toBe("0026");
    expect(exported.counts.service_orders).toBe(1); expect(exported.counts.service_payments).toBe(1); expect(exported.counts.service_payment_events).toBe(1);
    expect(JSON.stringify(exported)).not.toContain("checkout_url");
  });
  it("persists failed receipts and retries them after recovery", async () => {
    await checkout(); paid();
    vi.mocked(provider.retrieveCheckout).mockRejectedValueOnce(new Error("Synthetic outage"));
    await expect(event()).rejects.toThrow("outage");
    expect((await panel()).events[0].outcome).toBe("FAILED_RETRY");
    expect(await event()).toBe("RECONCILED"); expect((await panel()).events[0].outcome).toBe("RECONCILED");
  });
  it("rejects wrong account/mode and mismatched provider amount without marking paid", async () => {
    await checkout(); paid(); const s = [...sessions.values()][0];
    await expect(processServicePaymentEvent({ id: "evt_live", type: "checkout.session.completed", objectId: s.id, livemode: true }, dependencies())).rejects.toThrow("Wrong mode");
    await expect(processServicePaymentEvent({ id: "evt_wrong", type: "checkout.session.completed", objectId: s.id, livemode: false, account: "acct_other" }, dependencies())).rejects.toThrow("Wrong mode");
    s.amount_total = 1; await expect(event()).rejects.toThrow("does not match");
    expect((await panel()).orders[0].payments[0].state).toBe("PENDING");
  });
  it("marks refunds/disputes for sticky review, including reordered paid events", async () => {
    await checkout(); paid(); await event();
    await event("evt_refund", "charge.refunded"); await event("evt_late_paid");
    const o = (await panel()).orders[0]; expect(o.payments[0].state).toBe("REVIEW"); expect(o.blocked).toContain("Verified initial payment");
  });
  it("refreshes provider truth manually when webhook delivery was missed", async () => {
    await checkout(); paid(); const p = (await panel()).orders[0].payments[0];
    await reconcileServicePayment(c, p.id, dependencies());
    expect((await panel()).orders[0].payments[0].state).toBe("PAID");
  });
  it("revokes readiness with scope changes and detects stale checklist updates", async () => {
    const o = await checkout(); paid(); await event();
    const ready = Object.fromEntries(Object.keys(emptyOnboarding).map(k => [k, true]));
    await updateServiceOnboarding(c, o.id, 1, ready, dependencies());
    expect((await panel()).orders[0].blocked).toEqual([]);
    await expect(updateServiceOnboarding(c, o.id, 1, ready, dependencies())).rejects.toThrow("changed");
    await updateServiceOnboarding(c, o.id, 2, { ...ready, scopeStillValid: false }, dependencies());
    expect((await panel()).orders[0].blocked).toContain("Current signed scope");
  });
  it("requires paid deposit and accepted completion before a single launch balance", async () => {
    const o = await order({ service: "LAUNCH", totalCents: 150000, depositCents: 75000 });
    await expect(prepareServiceCheckout(c, o.id, "BALANCE", dependencies())).rejects.toThrow("Accepted completion");
    await prepareServiceCheckout(c, o.id, "INITIAL", dependencies()); paid(); await event();
    await expect(prepareServiceCheckout(c, o.id, "BALANCE", dependencies())).rejects.toThrow("Accepted completion");
    await updateServiceOnboarding(c, o.id, 1, { ...emptyOnboarding, completionAccepted: true }, dependencies());
    await prepareServiceCheckout(c, o.id, "BALANCE", dependencies());
    const payments = (await panel()).orders[0].payments; expect(payments.map(p => p.amountCents)).toEqual([75000, 75000]);
    expect(payments.map(p => p.installment).sort()).toEqual(["BALANCE", "INITIAL"]);
  });
  it("blocks direct mutation of signed amounts and cross-workspace SQL reads", async () => {
    const o = await checkout();
    await expect(withTenantContext(database, c, tx => tx.update(schema.serviceOrders).set({ customerEmail: "tamper@example.com" }).where(eq(schema.serviceOrders.id, o.id)))).rejects.toThrow();
    const hidden = await withTenantContext(database, { ...c, workspaceId: randomUUID() }, tx => tx.select().from(schema.serviceOrders));
    expect(hidden).toEqual([]);
    const hiddenUnauthenticated = await withTenantContext(database, { ...c, userId: "unknown" }, tx => tx.select().from(schema.serviceOrders));
    expect(hiddenUnauthenticated).toEqual([]);
  });
  it("blocks new checkouts for an archived client", async () => {
    const o = await order();
    await withTenantContext(database, c, tx => tx.update(schema.clients).set({ archivedAt: new Date() }).where(and(eq(schema.clients.workspaceId, c.workspaceId), eq(schema.clients.id, clientId))));
    await expect(prepareServiceCheckout(c, o.id, "INITIAL", dependencies())).rejects.toThrow("archived");
    expect(provider.createCheckout).not.toHaveBeenCalled();
  });
  function selectLive() {
    config = paymentConfiguration(livePaymentEnvironment({ SERVICE_PAYMENTS_LIVE_WORKSPACE_ID: c.workspaceId }));
  }
  it("checks live readiness without creating customer or payment objects", async () => {
    selectLive();
    expect(await verifyServicePaymentReadiness(c, dependencies())).toMatchObject({ mode: "live", providerConfigurationVerified: true });
    expect(provider.verifyAccount).toHaveBeenCalledOnce(); expect(provider.createCheckout).not.toHaveBeenCalled();
    expect((await panel()).orders).toHaveLength(0);
  });
  it("keeps same-account test and live orders and replay receipts separate", async () => {
    const testOrder = await checkout(); paid(); await event("evt_shared_namespace");
    selectLive();
    expect((await panel()).orders).toHaveLength(0);
    await expect(prepareServiceCheckout(c, testOrder.id, "INITIAL", dependencies())).rejects.toThrow("scope");
    await expect(reconcileServicePayment(c, [...sessions.values()][0].metadata!.service_payment_id, dependencies())).rejects.toThrow("No matching");
    await expect(order()).rejects.toThrow("approved live terms");
    const liveOrder = await order({ scopeReference: testOrder.scopeReference, termsVersion: config.live!.termsVersion });
    await prepareServiceCheckout(c, liveOrder.id, "INITIAL", dependencies());
    const liveSession = [...sessions.values()].find(s => s.livemode)!;
    liveSession.status = "complete"; liveSession.payment_status = "paid";
    expect(await processServicePaymentEvent({ id: "evt_shared_namespace", type: "checkout.session.completed", objectId: liveSession.id, livemode: true, paymentId: liveSession.metadata!.service_payment_id }, dependencies())).toBe("RECONCILED");
    const live = await panel(); expect(live.orders).toHaveLength(1); expect(live.orders[0].payments[0]).toMatchObject({ paymentMode: "live", state: "PAID" });
    expect(live.events).toHaveLength(1);
    expect((await listServiceOrders(c, database, "test")).orders[0].payments[0].state).toBe("PAID");
  });
  it("rejects wrong-mode events and makes persisted mode immutable", async () => {
    const o = await checkout();
    await expect(processServicePaymentEvent({ id: "evt_wrong_mode", type: "checkout.session.completed", objectId: [...sessions.values()][0].id, livemode: true }, dependencies())).rejects.toThrow("Wrong mode");
    const payment = (await panel()).orders[0].payments[0];
    await expect(withTenantContext(database, c, tx => tx.update(schema.servicePayments).set({ paymentMode: "live" }).where(eq(schema.servicePayments.id, payment.id)))).rejects.toThrow();
    await expect(withTenantContext(database, c, tx => tx.update(schema.serviceOrders).set({ paymentMode: "live" }).where(eq(schema.serviceOrders.id, o.id)))).rejects.toThrow();
    await expect(withTenantContext(database, c, tx => tx.insert(schema.servicePayments).values({ workspaceId: c.workspaceId, orderId: o.id, paymentMode: "live", installment: "BALANCE", amountCents: 1, accountId: config.accountId, baseUrl: config.baseUrl }))).rejects.toThrow();
  });
  it("holds new live collection while allowing preflight and existing-payment reconciliation", async () => {
    selectLive();
    const o = await order({ termsVersion: config.live!.termsVersion });
    await prepareServiceCheckout(c, o.id, "INITIAL", dependencies()); paid();
    config = { ...config, collectionEnabled: false };
    await expect(prepareServiceCheckout(c, o.id, "INITIAL", dependencies())).rejects.toThrow("collection is held");
    await verifyServicePaymentReadiness(c, dependencies());
    const p = (await panel()).orders[0].payments[0];
    await reconcileServicePayment(c, p.id, dependencies());
    expect((await panel()).orders[0].payments[0].state).toBe("PAID");
    expect(provider.verifyAccount).toHaveBeenCalledWith("reconciliation");
    expect(requests).toHaveLength(1);
  });
  it("blocks checkout if the immutable seller, merchant, or terms binding changes", async () => {
    selectLive(); const original = config;
    const o = await order({ termsVersion: config.live!.termsVersion });
    for (const change of [{ accountId: "acct_other" }, { live: { ...original.live!, legalSeller: "Other seller" } }, { live: { ...original.live!, termsVersion: "other-terms" } }, { live: { ...original.live!, approvalReference: "other-approval" } }]) {
      config = { ...original, ...change };
      await expect(prepareServiceCheckout(c, o.id, "INITIAL", dependencies())).rejects.toThrow("configuration changed");
    }
    expect(provider.createCheckout).not.toHaveBeenCalled();
  });
});
