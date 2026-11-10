import { canManageWorkspace } from "@/domain/tenancy/context";
import { paymentConfiguration } from "@/domain/payments/policy";
import { getWorkspaceShellContext } from "@/server/auth";
import { listServiceOrders } from "@/server/service-payments";
import { listClients, listWebsites } from "@/server/revenue";
import { PageHeader, Panel } from "../ui";
import { serviceOrderAction } from "./actions";

const labels = {
  minimumIntakeVerified: "Business facts, priority goals, approval contact, and intake verified",
  crawlAuthorizationVerified: "Client authority and exact crawl hosts/exclusions verified",
  requiredAccessVerified: "Required delegated access verified (or signed public-only audit scope)",
  providerCapabilitiesVerified: "Agreed delivery components and supported providers available",
  baselineVerified: "Launch baseline evidence recorded",
  backupRollbackVerified: "Launch backup and rollback verified",
  scopeStillValid: "Signed scope and version remain valid",
  completionAccepted: "Launch completed, QA and in-scope revisions accepted for final payment",
};
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
export default async function ServiceOrdersPage({ searchParams }: { searchParams: Promise<{ error?: string; verified?: string }> }) {
  const shell = await getWorkspaceShellContext();
  const { error, verified } = await searchParams;
  let configuration: ReturnType<typeof paymentConfiguration> | undefined;
  try { const selected = paymentConfiguration(); if (selected.workspaceId === shell.workspaceContext.workspaceId) configuration = selected; } catch { /* Disabled by default. */ }
  if (!configuration) return <><PageHeader eyebrow="Client services" title="Service orders"/><Panel title="Payments are disabled"><p>Payments require a complete, approved environment configuration and matching merchant account. Keep payment collection disabled until the launch checks are complete.</p><p>Audit: $495 prepaid. Launch: a signed quote from $1,500, 50% before work and 50% upon completion. Monthly managed services and future software subscriptions remain separate.</p></Panel></>;
  const [panel, clients, websites] = await Promise.all([listServiceOrders(shell.workspaceContext, undefined, configuration.mode), listClients(shell.workspaceContext), listWebsites(shell.workspaceContext)]);
  const manage = canManageWorkspace(shell.workspaceContext);
  return <>
    <PageHeader eyebrow={`Client services · ${configuration.mode} mode`} title="Service orders"/>
    {!configuration.collectionEnabled && <p role="status">Live collection is held. You can check readiness and reconcile existing payments.</p>}
    {error && <p role="alert">{error.slice(0, 300)}</p>}
    {verified === "1" && <p role="status">Provider configuration check completed. No payment was created. Signed webhook delivery acceptance is a separate launch check.</p>}
    {manage && <form action={serviceOrderAction}><input type="hidden" name="action" value="preflight"/><button className="mx-btn mx-btn-ghost">Check Stripe readiness</button></form>}
    <Panel title="Payment and delivery checks">{configuration.live && <p>Legal seller: {configuration.live.legalSeller} · Approved terms: {configuration.live.termsVersion}</p>}<p>{configuration.mode === "test" ? "Use test cards only." : "Live mode: prepared Checkouts can accept real payments."} Recording a scope documents your verification of an existing signed order. It does not request or accept signatures. Do not enter passwords, payment card data, bank details, or access secrets.</p><p>A ready checklist supports operator scheduling. It does not run agents, publish changes, or change client service entitlements.</p><p>Audit credits, custom schedules, and monthly recurring billing require approved terms and operator handling. Monthly service reference: Essentials $750, Growth $1,250, Pro $2,000; three-month initial commitment and 30-day notice.</p></Panel>
    {manage && <Panel title="Record a verified signed order"><form action={serviceOrderAction} className="mx-form-grid">
      <input type="hidden" name="action" value="create"/>
      <label>Client<select name="clientId" required>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Client website<select name="websiteId" required>{websites.map(w => <option key={w.id} value={w.id}>{w.displayName}</option>)}</select></label>
      <label>Service<select name="service"><option value="AUDIT_ONLY">Digital Visibility Audit</option><option value="LAUNCH">Optimization Launch</option></select></label>
      <label>Signed document reference<input name="scopeReference" required maxLength={200}/></label>
      <label>Signed document SHA-256<input name="scopeSha256" required pattern="[a-f0-9]{64}" minLength={64} maxLength={64}/></label>
      <label>Terms version<input name="termsVersion" required maxLength={200} defaultValue={configuration.live?.termsVersion}/></label>
      <label>Signed date<input name="signedAt" type="date" required/></label>
      <label>Customer email<input name="customerEmail" type="email" required maxLength={254}/></label>
      <label>Named delivery operator<input name="deliveryOperator" required maxLength={200}/></label>
      <label>Total USD cents (audit 49500)<input name="totalCents" type="number" min={49500} max={10000000} step={1} defaultValue={49500} required/></label>
      <label>Initial USD cents (audit 49500; launch 50%)<input name="depositCents" type="number" min={1} max={10000000} step={1} defaultValue={49500} required/></label>
      <label><input name="signatureVerified" type="checkbox" required/>I verified all required signatures, scope version, customer, and exact payment schedule.</label>
      <button className="mx-btn">Record {configuration.mode} order</button>
    </form></Panel>}
    {panel.orders.map(order => <Panel title={`${clients.find(c => c.id === order.clientId)?.name ?? "Client"} · ${order.service} · ${money(order.totalCents)}`} key={order.id}>
      <p>Scope: {order.scopeReference} · Terms: {order.termsVersion} · Delivery operator: {order.deliveryOperator}</p>
      <p>{order.blocked.length ? `Before scheduling: ${order.blocked.join("; ")}` : "Readiness checks complete. Operator scheduling is still required."}</p>
      {manage && <form action={serviceOrderAction}><input type="hidden" name="action" value="onboarding"/><input type="hidden" name="orderId" value={order.id}/><input type="hidden" name="version" value={order.onboardingVersion}/>
        {Object.entries(labels).map(([key, label]) => <label key={key} style={{ display: "block", marginBottom: 8 }}><input type="checkbox" name={key} defaultChecked={order.onboarding[key as keyof typeof labels]}/>{label}</label>)}
        <button className="mx-btn">Save readiness review</button>
      </form>}
      {order.payments.map(p => <div key={p.id}><p>{p.installment}: {money(p.amountCents)} · {p.state}{p.reviewReason ? ` · ${p.reviewReason}` : ""}</p>{manage && (p.sessionId ? <form action={serviceOrderAction}><input type="hidden" name="action" value="reconcile"/><input type="hidden" name="paymentId" value={p.id}/><button className="mx-btn mx-btn-ghost">Refresh from Stripe</button></form> : <form action={serviceOrderAction}><input type="hidden" name="action" value="recover"/><input type="hidden" name="paymentId" value={p.id}/><label>Existing {configuration.mode} session ID from Stripe (verify metadata for payment {p.id})<input name="sessionId" required pattern={`cs_${configuration.mode}_[A-Za-z0-9_-]+`}/></label><button className="mx-btn mx-btn-ghost">Recover existing session</button></form> )}</div>)}
      {manage && ["INITIAL", ...(order.service === "LAUNCH" ? ["BALANCE"] : [])].map(installment => <form key={installment} action={serviceOrderAction}><input type="hidden" name="action" value="checkout"/><input type="hidden" name="orderId" value={order.id}/><input type="hidden" name="installment" value={installment}/><button className="mx-btn mx-btn-ghost">Open {configuration.mode} {installment === "INITIAL" ? "initial" : "final"} Checkout</button></form>)}
    </Panel>)}
    <Panel title="Recent payment events">{panel.events.length ? panel.events.map(e => <p key={e.eventId}>{e.eventType} · {e.outcome} · {e.receivedAt.toISOString()}</p>) : <p>No payment events received.</p>}</Panel>
  </>;
}
