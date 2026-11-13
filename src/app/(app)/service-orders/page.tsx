import { canManageWorkspace } from "@/domain/tenancy/context";
import { paymentConfiguration, paymentConfigurationProblem } from "@/domain/payments/policy";
import { getWorkspaceShellContext } from "@/server/auth";
import { listServiceOrders } from "@/server/service-payments";
import { listClients, listWebsites } from "@/server/revenue";
import { installmentLabel, paymentEventLabel, paymentStateLabel, reviewReasonLabel, serviceName } from "@/domain/payments/pricing";
import { formatDate, PageHeader, Panel, StatusChip } from "../ui";
import { serviceOrderAction } from "./actions";
import { OrderForm } from "./order-form";

const labels = {
  minimumIntakeVerified: "I have the business details, their main goals and who approves work",
  crawlAuthorizationVerified: "The customer has confirmed which website addresses I may review",
  requiredAccessVerified: "I have the logins or access the work needs (or it is a public-pages-only audit)",
  providerCapabilitiesVerified: "Everything promised in the agreement can be delivered with the current tools",
  baselineVerified: "Launch only: starting measurements are recorded",
  backupRollbackVerified: "Launch only: a backup exists and changes can be undone",
  scopeStillValid: "The signed agreement is still the current version",
  completionAccepted: "Launch only: the work is finished and the customer has accepted it (unlocks the second payment)",
};
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
export default async function ServiceOrdersPage({ searchParams }: { searchParams: Promise<{ error?: string; verified?: string }> }) {
  const shell = await getWorkspaceShellContext();
  const { error, verified } = await searchParams;
  let configuration: ReturnType<typeof paymentConfiguration> | undefined;
  try { const selected = paymentConfiguration(); if (selected.workspaceId === shell.workspaceContext.workspaceId) configuration = selected; } catch { /* Disabled by default. */ }
  // When a payment mode is selected but cannot start, tell an owner or admin
  // which setting is at fault. Only the setting's name and rule are shown.
  const problem = canManageWorkspace(shell.workspaceContext) ? paymentConfigurationProblem() : null;
  if (!configuration) return <><PageHeader eyebrow="Client services" title="Service orders"/>{problem ? <p className="mx-notice-problem" role="alert">Payments cannot start: {problem}</p> : null}<Panel title="Payments are switched off"><p className="mx-muted">This workspace is not set up to take card payments through Stripe yet. Nothing here can charge a customer.</p><p className="mx-muted">Prices: the audit is $495, paid up front. A launch is a signed quote from $1,500, half before work starts and half on completion.</p></Panel></>;
  const [panel, clients, websites] = await Promise.all([listServiceOrders(shell.workspaceContext, undefined, configuration.mode), listClients(shell.workspaceContext), listWebsites(shell.workspaceContext)]);
  const manage = canManageWorkspace(shell.workspaceContext);
  const live = configuration.mode === "live";
  const canCollect = configuration.collectionEnabled;
  const clientName = (id: string) => clients.find(c => c.id === id)?.name ?? "Client";
  return <>
    <PageHeader
      action={manage ? <form action={serviceOrderAction}><input type="hidden" name="action" value="preflight"/><button className="mx-btn mx-btn-ghost" type="submit">Check Stripe connection</button></form> : undefined}
      eyebrow={live ? "Client payments" : "Client payments · test mode"}
      title="Service orders"
    />
    {error && <p className="mx-notice-problem" role="alert">{error.slice(0, 300)}</p>}
    {verified === "1" && <p className="mx-notice-ok" role="status">Stripe connection confirmed: the key, account and webhook all match. Nothing was charged.</p>}
    {!canCollect && <p className="mx-notice-info" role="status">Taking payments is switched off. You can record orders and check the Stripe connection, but no payment page can be created until collection is turned on.</p>}
    {!live && <p className="mx-notice-info" role="status">Test mode: use Stripe&apos;s test cards only. No real money moves.</p>}

    {manage && <Panel title="Record a signed order">
      <p className="mx-muted">Do this once the customer has signed. It records what they agreed to and lets you send them a payment page. It does not charge anyone by itself.{configuration.live ? ` Seller on record: ${configuration.live.legalSeller}.` : ""}</p>
      {clients.length === 0
        ? <p className="mx-empty">Add a client and their website before recording an order.</p>
        : <OrderForm
            clients={clients.map(c => ({ id: c.id, name: c.name }))}
            mode={configuration.mode}
            operatorName={shell.user.name}
            termsVersion={configuration.live?.termsVersion}
            today={new Date().toISOString().slice(0, 10)}
            websites={websites.map(w => ({ id: w.id, label: `${w.displayName} (${w.domain})`, clientId: w.clientId }))}
          />}
    </Panel>}

    {panel.orders.length === 0 && <Panel title="Orders"><p className="mx-empty">No orders recorded yet.</p></Panel>}
    {panel.orders.map(order => {
      const installments = ["INITIAL", ...(order.service === "LAUNCH" ? ["BALANCE"] : [])];
      return <Panel title={`${clientName(order.clientId)} · ${serviceName(order.service)} · ${money(order.totalCents)}`} key={order.id}>
        <p className="mx-muted">Agreement: {order.scopeReference}. Delivered by {order.deliveryOperator}. Terms version {order.termsVersion}.</p>

        <h3 className="mx-subhead">Payments</h3>
        {order.payments.length === 0 && <p className="mx-muted">No payment page has been created for this order.</p>}
        {order.payments.map(p => <div className="mx-attention-item" key={p.id}>
          <span>
            <strong>{installmentLabel(p.installment, order.service)}: {money(p.amountCents)}</strong>{" "}
            <StatusChip tone={p.state === "PAID" ? "good" : p.state === "REVIEW" ? "bad" : "warn"}>{paymentStateLabel(p.state)}</StatusChip>
            {p.reviewReason ? ` Reason: ${reviewReasonLabel(p.reviewReason)}.` : ""}
          </span>
          {manage && p.sessionId ? <form action={serviceOrderAction}><input type="hidden" name="action" value="reconcile"/><input type="hidden" name="paymentId" value={p.id}/><button className="mx-btn mx-btn-ghost" type="submit">Update from Stripe</button></form> : null}
          {manage && !p.sessionId ? <details className="mx-details">
            <summary>Advanced: link a payment page that already exists in Stripe</summary>
            <form action={serviceOrderAction} className="mx-form">
              <input type="hidden" name="action" value="recover"/><input type="hidden" name="paymentId" value={p.id}/>
              <label className="mx-form-wide">Checkout Session ID from Stripe (starts with cs_{configuration.mode}_)
                <input className="mx-input" name="sessionId" required pattern={`cs_${configuration.mode}_[A-Za-z0-9_-]+`}/>
                <span className="mx-help">Only needed if a payment page was created in Stripe but this app lost track of it. In Stripe, confirm the session&apos;s metadata shows payment {p.id}.</span>
              </label>
              <button className="mx-btn mx-btn-ghost" type="submit">Link this session</button>
            </form>
          </details> : null}
        </div>)}
        {manage && canCollect ? <div className="mx-action-row">
          {installments.map(installment => <form key={installment} action={serviceOrderAction}><input type="hidden" name="action" value="checkout"/><input type="hidden" name="orderId" value={order.id}/><input type="hidden" name="installment" value={installment}/>
            <button className="mx-btn" type="submit">Open payment page: {installmentLabel(installment, order.service).toLowerCase()}</button>
          </form>)}
          <span className="mx-help">{live ? "This opens a real Stripe payment page for the amount above. Copy its address from your browser and send it to the customer." : "This opens a Stripe test payment page."}</span>
        </div> : null}

        <h3 className="mx-subhead">Before the work is scheduled</h3>
        <p className={order.blocked.length ? "mx-muted" : "mx-notice-ok"}>{order.blocked.length ? `Still needed: ${order.blocked.join("; ")}.` : "Everything on the checklist is done. Schedule the work."}</p>
        {manage && <details className="mx-details">
          <summary>Open the checklist</summary>
          <form action={serviceOrderAction} className="mx-checklist"><input type="hidden" name="action" value="onboarding"/><input type="hidden" name="orderId" value={order.id}/><input type="hidden" name="version" value={order.onboardingVersion}/>
            {Object.entries(labels).map(([key, label]) => <label className="mx-form-check" key={key}><input type="checkbox" name={key} defaultChecked={order.onboarding[key as keyof typeof labels]}/><span>{label}</span></label>)}
            <button className="mx-btn mx-btn-ghost" type="submit">Save checklist</button>
          </form>
        </details>}
      </Panel>;
    })}

    <Panel title="Messages from Stripe">
      {panel.events.length
        ? panel.events.map(e => <div className="mx-attention-item" key={e.eventId}><span>{paymentEventLabel(e.eventType)}</span><StatusChip tone={e.outcome === "FAILED_RETRY" ? "bad" : "neutral"}>{e.outcome === "FAILED_RETRY" ? "Could not be processed; Stripe will retry" : e.outcome.replaceAll("_", " ").toLowerCase()}</StatusChip><span className="mx-muted">{formatDate(e.receivedAt)}</span></div>)
        : <p className="mx-empty">Stripe has not sent anything yet. The first message arrives when a customer pays.</p>}
    </Panel>
  </>;
}
