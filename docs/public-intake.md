# Public landing and audit requests

This addition implements the supervised enquiry stage of the customer acquisition package dated November 4, 2026. It does not make the paid audit, billing, email delivery or implementation process autonomous. The approved brand asset is the existing `public/virelantic-logo.svg` and the supplied green/black palette. Public copy avoids unsupported service coverage, turnaround guarantees, testimonials and numerical results.

## Routes and boundaries

- `/`: public landing and enquiry form. The former authenticated root moves to `/dashboard`; login and workspace setup redirects follow it. Other operator routes keep their existing authenticated layout.
- `/privacy` and `/audit-terms`: concrete enquiry privacy and pre-order explanations. Scope, currency, delivery date and actual order terms are confirmed before payment.
- `GET /api/public/audit-requests/nonce`: 30-minute server-signed nonce, uncached. Require at least two seconds before submitting.
- `POST /api/public/audit-requests`: bounded 8 KiB JSON, strict validation, exact configured Origin, honeypot, versioned acknowledgement, public HTTPS domain validation without DNS lookup/crawl, allowlisted attribution, no browser-supplied workspace/status/payment fields. Queries and fragments are removed from website URLs.
- `/intake`: destination-workspace OWNER/ADMIN queue. All details are explicitly unverified. React renders notes as plain text. Import creates one NEW lead attributed to the real signed-in reviewer, atomically with the request mapping and activity record. Dismiss leaves a review record. Neither action sends email or starts an audit/payment.
- `GET /api/cron/public-intake-retention`: authenticated with CRON_SECRET; scheduled daily at 11:00 UTC by `vercel.json`. Expired intake copies are deleted after 90 days, including imported copies. Separate lead/client records retain their existing policy. Network rate buckets expire after two days.

The form preserves fields on failure, announces errors, supports correction and retry, and shows received only after a committed insert or verified same-payload retry. It does not send an automatic email. A staffed queue is therefore required. It records the privacy/form version, acknowledgement, receipt time and bounded campaign metadata with each request.

## Persistence capability

Migrations `0018_public_audit_intake`, `0019_public_intake_capability`, and `0020_intake_relationships` add the request queue, singleton destination and shared fixed-window limits. Request-to-lead mappings are unique and have a composite tenant foreign key. No public table is exposed through an anonymous GET route.

Use a separate LOGIN role named `virelantic_intake_<label>submit`, NOINHERIT/NOBYPASSRLS, with USAGE on public and EXECUTE only on `submit_public_audit_request`. It must not have table grants, privileged role membership, or inherited PUBLIC table/CREATE grants. The general runtime credential is never a fallback. The migration owner owns a fixed-search-path SECURITY DEFINER function that can write only a pending request to the configured singleton destination; its result is an outcome string, never lead data. The queue enables RLS; the function owner intentionally has owner bypass for this new table only. Runtime tenant reads additionally use explicit workspace predicates.

The submission function checks the server's expected workspace against the stored destination, takes a transaction advisory lock, checks the nonce/payload hash, applies shared network/email/global limits and commits the request and limits together. Limits start at five successful submissions per network per 15 minutes, three per email per hour, and 100 total per hour. Network fingerprints are keyed and rotated daily; no raw IP is stored in intake records. Limits are abuse controls, not proof of a human or verified email.

The runtime hosting edge must replace `x-real-ip`. On Vercel this is the intended trusted header. A custom reverse proxy must replace it rather than forwarding arbitrary visitor values. Missing/invalid addresses share an `unknown-network` bucket, which fails conservatively. Apply platform-level request/connection limits to bound invalid-request and slow-body abuse; a signed nonce and Origin are not bot authentication. Any later audit fetch must use the existing safe-fetch boundary and resolve/check every destination and redirect; intake never fetches the URL.

## Configuration and release

All values are server-only. `PUBLIC_` here is an application naming convention, not `NEXT_PUBLIC_`; never expose the submission database URL or secret to the browser.

| Variable | Required value |
| --- | --- |
| `PUBLIC_INTAKE_ENABLED` | `false` until setup and release checks pass; then `true`. Closing submissions preserves configured operator queue access. |
| `PUBLIC_INTAKE_DATABASE_URL` | Restricted submit-role URL for the same database as the app. |
| `PUBLIC_INTAKE_SECRET` | Independently generated secret, at least 32 characters, used for nonces and keyed abuse fingerprints. |
| `PUBLIC_INTAKE_WORKSPACE_ID` | Existing staffed operator workspace UUID; must equal the singleton destination. |
| `PUBLIC_INTAKE_ORIGIN` | One exact HTTPS origin, no trailing slash/path. Local tests explicitly permit HTTP localhost only with APP_ENV=local. |
| `PUBLIC_BUSINESS_NAME` | Verified legal/trading identity. |
| `PUBLIC_CONTACT_EMAIL` | Monitored business response/privacy mailbox. |
| `CRON_SECRET` | Existing strong secret used by authenticated cron routes. |

Apply migrations as the database migration owner, never by an anonymous credential. Configure these public facts and existing DATABASE_URL/DATABASE_URL_UNPOOLED, then run `node scripts/configure-public-intake.mjs`. This creates the restricted capability and destination, refuses an existing role/reroute, verifies inherited read/create privileges, and writes secret values only to ignored `.env.intake.local`. It leaves intake disabled. Transfer those values to the selected deployment's secret environment; `.env.intake.local` is not auto-loaded by Next. Never commit or distribute it. Grant the existing non-owner app role access to the new queue (its RLS still applies) and EXECUTE on the cleanup function; the provisioner does this. The app role must not own the intake function or queue table.

Before enabling public intake, confirm identity and mailbox, the $495 price/currency and actual written scope/terms/refund process, assigned reviewers and queue-review responsibility, the destination workspace, domain/HTTPS and hosting edge, deployment cron health and retention policy, failure-log alert routing, and domain-specific canonical/share metadata/sitemap. Those business/domain facts were not verified by local implementation. Do not use the synthetic preview identity or example.com addresses in production. A record of an enquiry is not a payment or order.

## Integration with concurrent work

Base: `3bb0f1c` (Apply Virelantic branding to operator console), isolated branch `codex/public-intake`. No source checkout edits or remote push. Other workstreams may add migrations with the same numeric prefix: preserve their order, renumber this chain and regenerate/reconcile the Drizzle journal and snapshots on the integration branch. Do not replace their schema or weaken their tenant hardening. Shared merge points are `src/db/schema.ts`, Drizzle metadata, operator layout, login/workspace redirects, existing dashboard cache invalidation, and `vercel.json`. Additive public and intake modules are otherwise self-contained. Existing operator browser tests should navigate to `/dashboard` where they formerly used `/`.

## Verification and retained preview

Preview database: `virelantic_public_intake_preview` on Neon test project `aged-cloud-70719532`, branch `br-square-lab-ar4vqx7e` (`virelantic-public-intake-20261104`). This is a child of the existing synthetic test project, not QA/production. The app uses a non-owner/NOBYPASSRLS role and the public handler a separate no-table-access role. Ignored local credentials stay in this checkout. The branch remains for integration review and scales to zero; its later deletion/expiry should be handled by the owner with normal database approval. No production settings, outreach or external emails were changed.

`scripts/public-intake-preview-setup.mjs` guards the exact disposable host, creates a fresh database and replays the migration chain. It takes its credential through hidden stdin. `public-intake-preview-control.mjs` creates synthetic local operator fixtures or temporarily revokes/restores submit capability for failure QA. `public-intake-live-proof.mjs` checks restricted grants, concurrent idempotency, conflicts, shared limits, other-workspace RLS, cleanup authentication, real API responses and the absence of automatic lead creation. The opt-in `OPTIQ_INTAKE_LIVE_TEST=true` queue integration test verifies owner/admin gating and exactly-once concurrent imports. Default tests skip the live fixture test.

Browser evidence includes desktop at 1280×800 and mobile at 390×844, no horizontal overflow, real durable submit, private-IP field error, simulated database outage with retained fields, recovered retry success, anonymous `/intake` redirect to login, synthetic operator sign-in to `/dashboard`, queue visibility and import into a NEW lead. No general WCAG certification or live production review is claimed. The Chrome profile injects Grammarly/Acrobat UI; screenshots can show those extensions. The dev-only hydration warning was traced to Grammarly-added body attributes; the production flow works.
