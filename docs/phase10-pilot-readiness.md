# Phase 10: internal pilot operations

Phase 10 remains on `agent-phase-10-pilot-readiness`; it is not a main promotion. Phase 9 was fast-forwarded from `0642ce48b0744ad5b29ca1e162375f083b12f00d` to `c8d7a297bb59e12c8472df7e9af8250e9cbed53f`. The Phase 9 starting tip was `48174131fce0ffd6f0ead47cb81924cc6d16198a`.

## Operator controls

`/operations` answers whether automation is ready today. It shows platform and workspace pause categories, workflow failures, pending approvals, verification failures, integration reconnect gaps, cleanup history, provider configuration, monthly usage and budgets. Read-only views, exports and reporting remain accessible during pauses.

Owners/admins can pause all workspace automation or monitoring, AI/PREPARE/Visibility, and execution independently. Each change records actor, reason and time; resume records actor/time without deleting history. Platform updates additionally require the authenticated user ID in `PLATFORM_OPERATOR_USER_IDS`. This allowlist must be configured deliberately; workspace ownership does not confer platform authority. `AUTOMATION_EMERGENCY_STOP=true` is a fail-closed deployment override. The persistent platform singleton is the immediate runtime emergency switch; changing environment variables requires redeployment.

Admission takes a workspace lock, checks pauses and budgets, and inserts new runs/reservations atomically. Dispatchers filter paused workspaces. Queued workers recheck before material external steps. Already in-flight requests cannot be recalled. Resume permits eligible future work, not automatic replay of uncertain requests. Production EXECUTE remains hard-disabled; the only implementation adapter is the existing synthetic QA metadata fixture.

## Usage and ceilings

`usage_ledger` has tenant/client/site and composite source-run references, provider, category, units, model/tool calls, tokens, actual and estimated USD cost, occurrence time, monthly measurement window, source version and metadata. A separate reservation is a ceiling, never an invented estimate or invoice. Source identity is immutable and unique; reconciliation updates measurements idempotently. Current-month existing runs are reconciled on operational reads/admission; previous recorded ledger entries remain retained.

Sources: PREPARE/verification/QA execution agent runs, visibility API/fixture/manual runs, monitoring runs and audits. Deterministic work records zero external provider cost. Ambiguous historical zero defaults for paid providers remain null. HTTP/tool calls without reliable instrumentation remain unknown. Infrastructure hosting/database costs are not inferred or included. This is internal operating data, not SaaS billing or service-plan pricing.

Defaults: monthly provider ceiling $0, 5 active workflows, 100 AI calls, 100 visibility calls, 2 crawl/monitor slots. Maximum operator settings: $10,000 / 20 / 10,000 / 10,000 / 5. Owners/admins must provide a reason to change them. Expensive requests reserve their bounded run maximum before launch. Unknown historical paid cost without a reservation blocks further paid work pending review. Lowered ceilings are rechecked before paid steps. No entitlement/provider call is consumed on admission denial. Completed evidence is unchanged.

Paid PREPARE commits an attempt marker before provider generation. A replay with a committed marker requires manual review. AI Visibility preserves Phase 9's stronger per-prompt durable call reservation: indeterminate requests are never blindly retried or reclaimed. A missing Perplexity credential at request time still fails before any transaction or run insertion.

## Retention and export

Daily `/api/cron/retention` uses the existing cron-secret authentication and durable Workflow. Bootstrap returns at most 20 workspace IDs; each tenant batch deletes at most 100 raw visibility captures, only when `expires_at <= now()`. The database expiry/immutability trigger remains authoritative. Deletion and success audit commit together. Failed cleanup attempts create a separate failure record; retry cannot delete retained history. Dry run takes the same bounded candidate selection without deleting. Expired rate counters are separately bounded and kept seven days.

Visibility raw captures expire at 90 days. Normalized observations, answer hashes, finalized audits/reports, approvals, execution, packages and verification are never deleted by this job. Doc 25's 30-day failed temporary-artifact rule is assessed but not applied to durable drafts: the current model has no safe temporary/failed/incident-hold classification. Guessing from a failed run could delete retained artifacts. Add explicit lifecycle/hold metadata before extending cleanup. Raw audit evidence remains coupled to immutable audit history and is not purged speculatively.

Owner-only `/api/workspace-export` downloads a deterministic JSON structure with workspace identity, timestamp, schema/export versions, entity counts and data. One SQL statement gives all entities one MVCC snapshot. It covers clients/sites, audit findings/snapshots, opportunities, monthly fulfillment/reports, agent summaries, approvals, execution, implementation/verification, visibility normalized history and ledger. Credential/auth/raw-capture tables are excluded; sensitive key names are recursively redacted. No cross-tenant ID from the browser is trusted. V1 rejects exports exceeding 1,000 rows/entity or 10 MiB instead of silently truncating. Large workspaces need an operator-managed scoped export.

## Rate limits and recovery

Better Auth uses shared database rate-limit storage and its existing origin/CSRF protection. User/workspace/action atomic minute windows protect audit (6), monitor (10), PREPARE (12), verification (12), visibility (6), QA EXECUTE (6), manual monthly-cycle creation (10), export (2), cleanup (4), recovery (4). Repeated denials produce events and normal validation/429 responses before run/provider/entitlement mutation. The custom PREPARE API also requires same-origin POSTs. System scheduling uses bounded dispatch, idempotency and admission budgets instead of human request counters. Manual monthly creation and QA rollback also recheck the applicable pause and admission policy.

Recovery creates a new ordinary policy-checked run for terminal failed deterministic PREPARE, website-health monitoring or independent verification. Original history remains. Stuck active, paid, visibility and execution jobs can be marked for manual review, with a notification and audit event. No paid reservation is reset. A lost worker for a running monitoring request is marked for review rather than automatically replayed. Before any manual database intervention, identify the exact tenant/run and inspect provider outcome evidence.

## Storage assessment against Doc 25

Private Vercel Blob is the target in Doc 25, but no Blob credential/store capability or no-cost commitment was confirmed in the current QA configuration. No store, provider account or paid service was created. Raw AI answers and provider JSON are Postgres-backed with explicit expiry. Audit evidence/snapshots, draft artifacts, implementation packages, finalized reports, approvals, executions and verification history are also durable Postgres records. No external immutable file is finalized with a missing Blob object. Current V1 bounded JSON evidence does not depend on an unconfirmed storage integration. A private-Blob migration remains a documented launch gap for larger binary/raw evidence; require account/plan confirmation, private access, object lifecycle and reference-integrity tests first.

## Launch checklist

- Confirm platform operator allowlist, incident owner and escalation contact.
- Keep production EXECUTE disabled; verify QA-only flags and environment.
- Review failed/stuck work, pending approvals, unknown costs and monthly ceilings.
- Confirm cron configuration and successful non-dry-run cleanup.
- Confirm configured Neon recovery/history window and restore authorization in the account; do not assume plan defaults.
- Review optional Search Console, Perplexity, AI Gateway and Blob gaps. Do not create credentials or billing automatically.
- Review recovery exercise and the latest QA/Preview evidence before promoting Phase 10.

No Stripe/subscription billing, customer CMS credentials, WordPress/Webflow/Wix/Squarespace/Shopify write adapter, client email send, Google write scope or production publishing is added.
