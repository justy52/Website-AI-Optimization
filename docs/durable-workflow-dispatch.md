# Durable workflow dispatch recovery

Implemented on `fix/durable-dispatch-recovery`, based on `3bb0f1c`.

## Problem and resulting behavior

A request could commit a QUEUED run and its budget reservation, then fail in
`start()` or before saving the workflow run ID. A repeated request returned the
existing run without dispatching it, and Operations rejected QUEUED recovery.

The committed run is now the durable dispatch intent. All PREPARE, monitoring,
independent verification, visibility and QA execution launch sites use the same
dispatcher. A bounded authenticated cron retries unstarted QUEUED rows, including
rows stranded before migration 0018. Recovery keeps the same application run ID,
idempotency key and budget reservation; it does not admit a replacement paid run.
Monthly-cycle creation and retention do not commit an application run before
dispatch and retain their existing schedule-based retry behavior.

## Ownership and crash boundaries

- Dispatch uses a two-minute database lease and random fencing token. Only the
  lease owner can save its receipt. Retries back off from one minute to one hour.
  Successful dispatch remains eligible while the application run is unstarted:
  a workflow receipt is evidence of acceptance, not proof of execution.
- A crash before dispatch or before receipt persistence is recovered after the
  lease expires. Ambiguous starts can create duplicate SDK workflows. They all
  target the same application run; dispatch is deliberately at least once.
- PREPARE and monitoring atomically claim QUEUED -> RUNNING before external work.
  A duplicate cannot restart RUNNING or terminal work or overwrite its result.
  PREPARE's execution deadline starts at that first claim, so queue delay does
  not consume its execution budget. Its provider and paid model remain pinned
  to the admitted configuration.
- PREPARE still commits `attemptCommitted` before the model request. The AI SDK
  receives `maxRetries: 0`: retryable errors and lost responses cannot trigger
  hidden additional model requests. Existing verification/QA row locks and
  visibility per-prompt reservations provide their own execution ownership.
- Started or indeterminate paid work is never requeued automatically. Visibility
  reservations are never cleared; their existing recovery records an unavailable
  observation instead of sending the prompt again. A crash after execution claim
  can require human review even if it occurred before the external request.

## Policy and security

Admission remains in the original queue transaction. Dispatch does not create
usage entries, reserve again, or spend a second concurrency entitlement. Pauses
are checked at dispatch and again before material work. Provider budgets are
rechecked at the existing paid-call boundary.

The scheduler bootstrap returns only bounded workspace/run IDs and dispatch kind,
uses a fixed `pg_catalog,public` search path, and has PUBLIC execute revoked.
Every claim and receipt mutation re-establishes tenant context and scopes both
workspace and run. The original requesting user and their current active role
are restored from the database. Missing/suspended actors stay queued with
`ACTOR_UNAVAILABLE`; recovery does not promote them to SYSTEM. Scheduled runs
retain SYSTEM context. Existing QA environment, approval, expiry and execution
switch checks remain authoritative.

## Integration and rollout

1. Integrate this branch into the final release candidate before deployment.
   If another concurrent feature also adds migration 0018, reconcile the Drizzle
   journal and regenerate the final combined schema snapshot in integration.
   Do not edit any migration that has already been applied to a shared target.
2. Apply the additive migration using the normal direct-connection migration
   process. Deploying the new code before the columns/function exist will fail.
3. The database migration owner can execute the bootstrap. A separate runtime
   role needs `GRANT EXECUTE ON FUNCTION
   public.list_queued_dispatch_refs(integer) TO <verified_runtime_role>` plus
   its existing tenant table permissions. Grant no RLS bypass or schema ownership.
4. Configure CRON_SECRET and activate `/api/cron/workflow-dispatch`. The committed
   schedule is every five minutes, 25 candidates per request (SQL cap 100).
   [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) require
   Pro/Enterprise for this frequency; Hobby allows daily only. Account plan was
   not exposed by the connected team response. Confirm support or arrange an
   authorized scheduler before calling automated recovery operational. No plan
   upgrade or recurring purchase was made by this task.
5. First deploy paused. Inspect existing QUEUED rows before resuming: older queued
   rows become eligible automatically. Confirm scheduled dispatch and a harmless
   deterministic run on the final release environment before enabling paid work.
6. Monitor oldest unstarted QUEUED age, `dispatch_attempts`,
   `dispatch_next_attempt_at`, `dispatch_error_code`, and sanitized
   `workflow_dispatch.*` logs. WORKFLOW_START_UNCONFIRMED is retryable;
   ACTOR_UNAVAILABLE and stuck RUNNING work need operator investigation. Never
   reset a paid run's status, timestamps, ledger commitment or call reservations.

## Validation evidence (2026-11-04)

- 15 live PostgreSQL checks passed on dedicated branch
  `virelantic-dispatch-recovery-20261104` (`br-round-wave-arijx2xm`) in disposable
  test project `aged-cloud-70719532`. Queries used `optiq_phase1_rls_runner`,
  confirmed non-superuser and non-BYPASSRLS, with real concurrent transactions.
  Migration 0018 applied successfully on the copied schema. No QA/default branch,
  production/customer rows or provider accounts were modified.
- Covered queue commit without dispatch; ambiguous start/backoff; concurrent
  dispatch leases; crash after start before receipt; stale receipt fencing;
  recorded receipt with no worker; concurrent paid workers and delayed delivery;
  provider failure after spend commitment; crash after execution claim; delayed
  PREPARE deadline; pause/resume; cross-tenant access; duplicate monitoring;
  unavailable original actor; verification versus QA target routing; configuration
  drift and spend evidence; visibility indeterminate reservations; bootstrap ACL.
- 433 ordinary tests passed. The new real-SDK test injects a retryable 503 model
  failure and proves that exactly one model request occurs.
- TypeScript, ESLint, Drizzle metadata validation and `git diff --check` passed.
- Production Next.js/Workflow build passed with `next build --webpack`, including
  the new cron route and the seven existing workflows. The local default
  Turbopack attempt stalled in compilation and was stopped; no Turbopack success
  is claimed.

Reproduce the database proof with `node scripts/verify-dispatch-recovery.mjs`.
It reads ignored `.env.dispatch-test.local` containing DISPATCH_TEST_ADMIN_URL
and DISPATCH_TEST_RUNNER_URL, validates the exact isolated endpoint/database,
applies 0018 SQL only there, grants the restricted test role its bootstrap access,
and runs the live suite. It does not migrate another branch or reset any database.
This manually migrated proof branch is disposable and must not be promoted into
the production migration path. It is retained for inspection and its compute
auto-suspends after five idle minutes; no automatic deletion was performed.

No deployment, cloud scheduler invocation or real paid model call was performed
by this task. Integration smoke verification remains necessary. The guarantee
covers application/SDK initiated attempts, not a provider's internal billing or
delivery behavior. [AI SDK retry documentation](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text#maxretries)
and [Workflow start API](https://workflow-sdk.dev/docs/api-reference/workflow-api/start)
were checked against the installed versions; no new Workflow 5 start-hook API
was assumed for the installed Workflow 4 application.
