# Service payment production configuration and launch runbook

This change makes the fixed-price service payment path production-capable. It does **not** activate a merchant, publish a customer-facing payment path, provision credentials, change payouts, create a live webhook, or process a live payment. `SERVICE_PAYMENTS_MODE=disabled` remains the committed default. Owner approval and a separate deployment/activation action remain required.

This covers the $495 prepaid Digital Visibility Audit and uncredited quoted Optimization Launch from $1,500, with a 50% deposit and 50% balance after accepted completion. Managed monthly retainers and future software subscriptions remain separate; this change does not implement recurring charges, audit credits, custom schedules, tax calculation or automatic fulfillment.

## Modes and stages

| Configuration | Behavior |
| --- | --- |
| Missing/`disabled` mode | No payment preparation, recovery or webhook processing. Webhook returns 503. |
| `test` | Non-production only; test credentials and test provider objects; hosted sandbox payments. |
| `live` with approved configuration, collection held | Readiness checks, signed webhook reconciliation and operator review are available; new Checkouts are blocked. |
| `live` with approved configuration and collection enabled | Owner/Admin can prepare a scope-bound hosted live Checkout after merchant/endpoint checks. The customer chooses whether to pay. |

Live mode requires `NODE_ENV=production` and `APP_ENV=production`. If `VERCEL_ENV` is present, it must be `production`. Test mode is forbidden when either application or Vercel environment is production. Preview must never receive live credentials or a production database URL.

## Configuration inventory

Store server-side keys in the deployment's narrowly scoped secret store, never in browser code, source control, shell arguments, screenshots or chat. Do not pull production credentials into local development for testing. Empty values in `.env.example` do not enable collection.

| Production variable | Required value or meaning |
| --- | --- |
| `SERVICE_PAYMENTS_MODE` | Initially `disabled`; staged `live` only in the separately authorized production deployment |
| `SERVICE_PAYMENTS_LIVE_ACTIVATION` | Exact `approved-v1`, only after the owner has approved the launch record |
| `SERVICE_PAYMENTS_LIVE_COLLECTION_ENABLED` | Default `false`; exact `true` is a separate final collection-release step |
| `SERVICE_PAYMENTS_LIVE_APPROVAL_REFERENCE` | Private launch-review record reference covering the seller, account, payout verification, policies and release |
| `SERVICE_PAYMENTS_LIVE_LEGAL_SELLER` | Approved legal seller name, including any appropriate trading-name relationship |
| `SERVICE_PAYMENTS_LIVE_TERMS_VERSION` | Reviewed service terms version required on newly recorded live scopes |
| `SERVICE_PAYMENTS_LIVE_WORKSPACE_ID` | Server-owned production service workspace UUID |
| `SERVICE_PAYMENTS_LIVE_BASE_URL` | Public HTTPS application origin, no path/query/credentials/trailing slash |
| `BETTER_AUTH_URL` | Exactly the same canonical origin |
| `STRIPE_SERVICE_LIVE_ACCOUNT_ID` | Actual owner-verified live merchant `acct_...`, not the sandbox account |
| `STRIPE_SERVICE_LIVE_SECRET_KEY` | Matching `rk_live_...` preferred, or protected `sk_live_...`; organization/publishable/test keys are rejected |
| `STRIPE_SERVICE_LIVE_WEBHOOK_SECRET` | The live endpoint's signing secret, distinct from its API key and from the test listener's secret |
| `STRIPE_SERVICE_LIVE_WEBHOOK_ENDPOINT_ID` | The matching classic snapshot WebhookEndpoint `we_...` ID |

The origin check rejects HTTP, IP literals, localhost, internal/local names, credentials, paths and origin/auth mismatches. It is a syntax and binding check, not proof of domain ownership or public reachability. Confirm DNS, TLS and endpoint reachability separately.

Non-production test configuration uses `SERVICE_PAYMENTS_TEST_WORKSPACE_ID`, `SERVICE_PAYMENTS_TEST_BASE_URL`, `STRIPE_SERVICE_TEST_ACCOUNT_ID`, `STRIPE_SERVICE_TEST_SECRET_KEY`, and `STRIPE_SERVICE_TEST_WEBHOOK_SECRET`. The previously tested generic variable names remain accepted **only in test mode**. Conflicting generic/explicit values are rejected. Live and test API secrets must not coexist in the same deployment configuration.

Use separate test and production databases and workspaces. Stored mode is an additional boundary, not a replacement for environment isolation.

## Merchant and endpoint gates

Before preparing a live Checkout, the server retrieves the current Stripe account through the configured key and requires:

- Exact account ID match.
- `charges_enabled`, `payouts_enabled`, and `details_submitted` true.
- `capabilities.card_payments` active.
- No disabled reason, currently due or past-due requirements, or pending verification.

These are technical collection gates. They do not prove bank ownership, legal authority, tax treatment, the correctness of public policies, or capacity to deliver. Those require owner review in the referenced launch record. No bank details or personal verification documents are copied into application records.

The server then retrieves the configured WebhookEndpoint using the same key and requires `livemode=true`, `status=enabled`, API version **2026-10-28.endive**, the exact URL below, and exactly the six named event types. Wildcard or incomplete selections are rejected.

`<SERVICE_PAYMENTS_LIVE_BASE_URL>/api/service-payments/stripe`

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`
- `charge.dispute.created`

Use the account's own classic **snapshot** WebhookEndpoint, not a Connect-wide endpoint, thin-event destination, temporary CLI signing secret or preview endpoint. The adapter uses the locked Stripe SDK/API version. If the SDK/version or event set changes, update the adapter, endpoint and tests together.

The endpoint must be reachable by Stripe without an application session, interactive SSO, redirect or browser challenge. Preserve signature validation on the raw body and protect the operator application. Do not disable deployment protection globally to make webhooks work. Approve and configure only the intended production route/hostname exposure. The current protected preview has not been changed by this work.

Webhook secrets cannot be retrieved from the endpoint after creation, so account/endpoint configuration checks cannot prove that the saved signing secret is correct. Confirm it with an actual provider-signed delivery to the real deployed route before enabling collection. This can use a clearly synthetic provider test delivery without creating a live charge; a generic synthetic event may be ignored because it does not match a service payment. Record its HTTP success separately from payment fulfillment acceptance.

## Owner launch record: required decisions and evidence

1. Confirm the legal seller, authority to trade, public business identity, support contact, statement descriptor and canonical customer domain. Verify that the live Stripe account belongs to that seller. Do not infer that the sandbox account or an unrelated Aloha account is suitable.
2. Complete Stripe's required business/identity activation and payout verification personally or through authorized staff. Confirm the correct payout destination in Stripe without recording bank details in the app. This implementation does not accept provider agreements or change payout settings.
3. Approve the current service terms, privacy notice, AI-assisted work/approval disclosure, delivery expectations, cancellation/refund process, tax treatment and customer-support process. Decide audit-credit eligibility and timing before automating any credited launch. Buying an audit must not imply recurring authorization.
4. Verify the signed-scope process and private document/certificate archive. The app records an operator's attestation, document hash and terms version; it does not authenticate signatures through a signature-provider API.
5. Confirm the delivery operator, capacity, scope, supported providers, client crawl authorization, approval contact, access needs and rollback plan. Payment never starts audits, agents, monthly cycles or publishing automatically.
6. Approve the exact release, migration, production workspace, canonical origin, live merchant ID, credentials, endpoint and deployment-protection exception. The launch record reference is required configuration, not a substitute for performing this review.

## Key permissions and deployment sequence

Prefer a restricted key and validate its permission profile in a separate sandbox first. The application performs current-account read, Customer creation, Checkout Session creation/retrieval, PaymentIntent/Charge reads and WebhookEndpoint read. Its inline product/price data must also be permitted by the selected key profile. Check permission failures in Stripe's request log; do not respond by granting account-wide access automatically. No payout, refund-write, subscription, API-key management or webhook-management write operation is part of the application adapter.

The application requires no public publishable key for its hosted Checkout path. Use sensitive server-only environment values scoped solely to the intended production deployment. Key creation or secret-store transfer needs its own appropriate authorization; none was performed here.

Sequence for the separate launch action:

1. Review and integrate this branch. Apply **0026_service_payment_modes** after the integrated 0000–0025 chain on an isolated QA copy. Run checks there before production migration. Historical order, payment and event rows backfill to test; immutable identity and forced RLS remain in place. Do not reclassify test rows as live.
2. Prepare the owner launch record and resolve every gate above. Confirm production backups, restricted runtime role and migration procedure. The runtime receives no owner credentials.
3. Deploy the reviewed code with mode disabled. Configure and verify the exact production endpoint and narrowly scoped keys through the separately authorized setup. Keep collection false.
4. In staged live mode with collection false, use **Check Stripe readiness** as Owner/Admin. It makes read-only provider requests; it creates no customer, Checkout, charge or subscription. Confirm a real provider-signed delivery reaches the deployed route. Review runtime errors and failed receipts.
5. Independently verify that the prior sandbox acceptance and this branch's tests cover the intended behavior. Mocked live tests do not demonstrate real merchant activation or a working deployed live signing secret. Any later paid acceptance run requires explicit authorization for the particular real transaction; do not improvise a live test charge.
6. Obtain final owner release approval before setting collection true or sharing a live Checkout. Prepare only an actual client-specific signed order with the approved terms version and payment schedule. This task stops at reviewable code and documentation.

## Identity, replay and recovery behavior

Every new order stores its mode and merchant. A live order additionally retains legal seller and launch approval reference, alongside its immutable terms version/scope. Merchant, seller, terms or approval changes block further Checkout preparation for that order rather than silently moving a contract. Test and live payment records cannot cross-link even when Stripe uses the same account ID for both modes. Receipt uniqueness includes mode; session mode, customer, metadata, currency and amount are checked against the stored payment.

The previously tested test request bodies and idempotency keys are preserved, so an uncertain historical test request does not receive a fresh provider key during rollout. New live requests use a distinct idempotency namespace and explicit live metadata. Old attempts still require reconciliation before replacement. Refund/dispute review remains sticky. No new service entitlement or automatic delivery is granted by payment or a success redirect.

For an operational hold, prefer collection false while retaining live mode and valid reconciliation credentials. Existing financial truth continues to reconcile even if the merchant's collection eligibility later regresses. Account/mode/object binding and webhook signatures still apply to all reads/events. Turning the whole mode off stops webhook processing and returns 503; Stripe retries and operator reconciliation are then required.

An application hold does **not** expire already issued Stripe Checkouts. Before stopping real collection, an authorized operator must review outstanding hosted sessions and decide how to handle them in Stripe. No automatic expiry, refund, debt collection, payout adjustment or contract override was added here.

## Verification limits and official sources

This branch's live-mode tests use fake credentials and mocked provider objects, plus embedded Postgres with the release's non-bypass runtime permissions. No production setting, live account, live key, provider endpoint or real payment was changed or accessed. A production build and local browser checks verify disabled defaults; they do not constitute live merchant acceptance.

Official documentation checked November 4, 2026:

- [Account activation and public business information](https://docs.stripe.com/get-started/account/set-up).
- [Account object eligibility and requirements fields](https://docs.stripe.com/api/accounts/object).
- [Separate sandbox/live keys](https://docs.stripe.com/keys) and [restricted-key permissions](https://docs.stripe.com/keys/restricted-api-keys).
- [Webhook signatures and public delivery requirements](https://docs.stripe.com/webhooks).
- [WebhookEndpoint attributes](https://docs.stripe.com/api/webhook_endpoints/object) and [account-scoped endpoint creation](https://docs.stripe.com/api/webhook_endpoints/create).
