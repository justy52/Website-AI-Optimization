# Service payment and onboarding pilot

This increment is an operator-assisted **test-mode service-business** integration. It does not accept live money or sell subscriptions to Virelantic software. `SERVICE_PAYMENTS_MODE=disabled` is the default; test keys and non-production deployments are required at runtime. Do not enable this feature on a public production application.

## Supported path

1. Qualify the lead, convert it into a client, and register the authorized website using the existing console.
2. Prepare the service scope using docs 08, 09, 14 and 18 plus the prepared customer order schedules. An authorized human completes signing outside the app. No signature requests or other messages are sent by this integration.
3. At `/service-orders`, an Owner or Admin records the completed document reference, SHA-256 of the actual signed document, terms version, date, customer, site, payment amounts, and named delivery operator. The application records the operator's attestation; it does not independently authenticate signatures. Keep the signed document and certificate in approved private storage. Do not paste passwords, payment details, bank data, or secrets into the reference fields.
4. For a Digital Visibility Audit, total and initial payment are exactly 49,500 USD cents ($495). For an uncredited Optimization Launch, total starts at 150,000 cents ($1,500) and the initial payment is exactly half. The final balance requires the verified paid deposit and operator-recorded acceptance of completion. No general-purpose arbitrary charge endpoint is exposed.
5. Open the test Checkout from the order. This creates a customer-specific Stripe-hosted card payment. Card data stays on Stripe. Checkout and customer creation use stable keys derived from the durable local payment reservation. The configured merchant account is verified using Stripe's current account endpoint before provider operations.
6. Signed snapshot webhooks reconcile the current provider state and atomically record the event outcome. The success/return page never marks a payment paid. Owner/Admin can also use **Refresh from Stripe** when a webhook is delayed. Events that fail processing remain visible as `FAILED_RETRY` and can be redelivered from Stripe after the cause is fixed.
7. Complete the readiness checklist after reviewing minimum intake, authority and exact crawl scope, approval contact, delegated access or public-only scope, and supported delivery components. Launch additionally requires baseline and backup/rollback evidence. These are operator checks; the application does not verify passwords, create access invites, or crawl a newly supplied URL here.
8. A ready checklist supports operator scheduling; it does not start audits, agents, monthly cycles, external writes, or change client entitlements. Existing internal delivery tools remain operator-controlled and do not acquire a new global billing prerequisite.

## Configuration and isolated setup

Use a dedicated Virelantic sandbox/test account. The earlier account investigation did not verify one: existing Stripe records concerned Aloha Builders, connected QuickBooks was Aloha Fence, and Docusign sending was blocked. None of those accounts has been repurposed.

In a private `.env.local` or the QA deployment secret settings, configure:

| Variable | Value |
| --- | --- |
| `SERVICE_PAYMENTS_MODE` | `test` |
| `SERVICE_PAYMENTS_WORKSPACE_ID` | Server-owned Virelantic workspace UUID; one merchant workspace per deployment |
| `SERVICE_PAYMENTS_BASE_URL` | QA app HTTPS origin, or `http://localhost:3000`; no path/query |
| `STRIPE_SERVICE_ACCOUNT_ID` | Verified `acct_...` for that sandbox/key |
| `STRIPE_SERVICE_SECRET_KEY` | `rk_test_...` with sufficient restricted permissions, or `sk_test_...`; never live/organization keys |
| `STRIPE_SERVICE_WEBHOOK_SECRET` | Endpoint/listener `whsec_...` signing secret, separate from API key |

The existing database/auth variables are still required. `APP_ENV=qa` for QA. Both `APP_ENV=production` and `VERCEL_ENV=production` block this feature. No new public client API key is required for hosted Checkout.

Install the locked dependencies, apply migration `0018_service_payments_test` using the existing Drizzle migration command to a verified isolated QA database with a direct connection, then build/deploy the isolated branch. The migration was applied across the full migration chain in embedded Postgres tests, including forced RLS under a non-superuser/non-bypass role; it was not applied to an external database in this task. Do not use a production database for the sandbox path.

Integration note: sibling isolated branches also introduce migration 0018 (runtime role, durable dispatch, public intake). Renumber and reconcile the journals/snapshots in the combined branch before applying migrations; do not overwrite a sibling snapshot or reuse an already applied migration index. This migration explicitly grants its three reviewed tables to `virelantic_runtime` if that role already exists; if role creation is integrated later, its reviewed-table grant must include these tables. Retain all forced-RLS policies and immutability triggers when regenerating snapshots. Re-run the complete migration chain and payment/RLS tests after combining the branches.

Register a **snapshot** event destination for **your account**, using API version `2026-10-28.endive` supported by the locked Stripe SDK (23.1.0), at:

`https://<qa-app-origin>/api/service-payments/stripe`

Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`
- `charge.dispute.created`

For local forwarding, use `stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,charge.refunded,charge.dispute.created --forward-to localhost:3000/api/service-payments/stripe`. Use the listener's own signing secret. Do not expose a key in a shell command or source file. Creating a new Stripe account, accepting provider agreements, identity verification, payouts, and live activation are owner actions.

## Failure handling

- Unknown provider creation outcome: the reservation survives the failed request. Retry the same order/installment while its stored window is valid; both provider requests retain their original idempotency keys and parameters. The app never silently opens a fresh payment for that installment.
- An unbound session after a timeout can be recovered with its existing `cs_test_...` ID from Stripe. The server verifies the configured account, test mode, payment/order metadata, customer binding, currency and exact amount before attaching it. Recovery never creates a charge.
- Old/expired attempts stop for operator reconciliation before any replacement is considered. The app does not recycle a key after Stripe's idempotency retention window or automatically issue a replacement session. A genuinely expired unpaid order needs a reviewed replacement schedule/flow; do not make duplicate orders to bypass the hold without checking provider truth.
- Refund or dispute: mark the payment `REVIEW`, retain evidence, and block readiness even if a delayed paid event follows. No automatic refund, debt collection, re-charge, review override, or contractual change is made.
- A revoked or voided signed scope: uncheck **Signed scope and version remain valid**. This blocks new Checkouts and readiness. An already shared Checkout may still be paid: the app does not expire sessions or issue a refund automatically. The operator must handle the existing session and client follow-up in Stripe under separately authorized policy.
- A mismatched account, customer, amount, currency, session ID or order/payment metadata fails closed. Webhook failures return a retryable response. The recent event list records failures without raw financial/customer payloads.
- Rotate keys/secrets only within the same verified test account and app origin. Changing account/base origin on a pending reservation requires operator review rather than silently redirecting an existing payment.

Signed order fields and payment identity are immutable at the database layer. User access rechecks active membership and actual role, and composite keys bind websites to their own client/workspace. The webhook workspace comes from server configuration, never event/browser workspace metadata. Webhook privileges permit payment/event reconciliation without creating or modifying signed orders. Reads, updates and inserts use forced RLS; payment actions are limited to 10 per user/workspace/minute. Workspace exports include service orders/payment/event records while removing Checkout URLs.

## Explicitly blocked commercial decisions

- Audit credit timing and allocation have not been approved. The proposed $1,500 minus $495 example produces $502.50 deposit plus $502.50 balance, but this app intentionally refuses that credited schedule until credit eligibility, expiry, refund handling and single-use allocation are approved and implemented. Use a reviewed operator invoice flow for those orders.
- Monthly Essentials ($750), Growth ($1,250), and Pro ($2,000) are **managed service retainers**, not SaaS subscriptions. No recurring charge is created here. Monthly service start, explicit recurring consent, initial three-month dates, notice handling, cancellation/refund policy, dunning, tax treatment and supported signature workflow must be approved before enabling recurring automation. The existing service-plan entitlement model remains unchanged.
- The signed scope hash is an attested link to an external signed document; signature-provider API verification and private document archival are not implemented here.
- No dedicated Virelantic account credentials were available in this checkout or the process environment. Actual Stripe sandbox transactions and a deployed signed-webhook round trip remain unverified. Do not describe mocked provider tests as real Stripe payments.

## Verification and acceptance run

Automated coverage includes full-schema migration application, non-bypass RLS, real SDK webhook-signature verification, exact payment matching, duplicate/concurrent requests, timeout recovery, failed receipt retry, manual reconciliation, refund holds, immutable schedules and stale onboarding edits. Provider calls are simulated; no real or sandbox transaction was submitted.

After the owner makes the verified sandbox available, the acceptance run is: record a synthetic signed audit scope → open hosted test Checkout → use Stripe's documented test card in the hosted UI → verify a signed event and one paid local payment → redeliver the same event → verify no duplicate payment or automatic fulfillment → complete intake gates → simulate a test refund/dispute → confirm `REVIEW` blocks readiness. Repeat with a launch deposit, completion acceptance and one final balance. Exercise an expired/failed payment and a forged return URL as well. This is the remaining external-provider boundary.

Official sources checked November 4, 2026:

- [Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment.md?ui=full-page) — verify current payment status and handle repeat delivery; redirects are insufficient.
- [Webhook handling](https://docs.stripe.com/webhooks) — raw-body signatures, snapshot event configuration and delivery retries.
- [Idempotent requests](https://docs.stripe.com/api/idempotent_requests) — stable request keys and retention limits.
- [Checkout Session creation](https://docs.stripe.com/api/checkout/sessions/create) — current request parameters, including card allowlisting.
- [API keys](https://docs.stripe.com/keys) and [testing](https://docs.stripe.com/testing) — sandbox isolation, separate webhook secret and test-card requirements.
- [Metadata](https://docs.stripe.com/metadata) — explicit Checkout → PaymentIntent metadata and one-time Charge copy for refund/dispute matching.
