# Phase 10 validation record

Performed September 25, 2026. Phase 10 remains unmerged on `agent-phase-10-pilot-readiness`. Production customer execution remains disabled.

## Phase 9 promotion

- Starting Phase 9: `48174131fce0ffd6f0ead47cb81924cc6d16198a`.
- Provider-activation fix and promoted main: `c8d7a297bb59e12c8472df7e9af8250e9cbed53f`.
- Main was fast-forwarded from `0642ce48b0744ad5b29ca1e162375f083b12f00d`, after refreshing remotes and checking ancestry and a clean worktree. No squash or force push.
- Missing Perplexity configuration rejects API requests before transaction/run/call/observation/capture insertion. No cadence slot is consumed. Live tests then configure a fake provider credential and create an idempotent run in that same window. Queued credential loss and indeterminate paid attempts still fail closed.
- Unconfigured UI omits the active API button; deterministic fixtures and manual observations remain usable. Scheduled dispatch returns no work.
- Verification: 394 unit tests plus 97 live tests; verify, build, Drizzle, fresh migration/RLS, whitespace and secret checks passed. Canonical Chromium: 7 passed. Preview auth/visibility: 2 passed; PREPARE also passed separately.
- Main-triggered QA deployment `optiq-2vq8dw3d5-justinfuchs52-8677s-projects.vercel.app` was READY, served the promoted SHA, and passed auth/AI Visibility smoke. Digital Visibility Score source was unchanged; score-isolation tests retained audit score 80 and its category rows. GitHub Vercel check was green; inspected deployment logs had no error/fatal entries.

## Phase 10 application gates

Application-code candidate: `61e58704110c22c05d30742ccb54bb04cf419247`. Subsequent validation-record and browser-harness changes do not modify application code or migrations.

- `corepack pnpm verify`: lint, TypeScript, 426 unit tests and Drizzle check passed. Its 126 opt-in live tests were run separately and all passed: operations 26, monthly/Phase 6/7/8 regression 79, AI Visibility 21. Total: **552 Vitest tests passed** across the two invocations.
- `corepack pnpm build`: passed.
- Coverage includes usage/cost precision and unknown costs, atomic budgets/admission, all rate-limit actions with deterministic clocks, platform/workspace pauses, paused manual monthly creation and QA rollback, worker rechecks, recovery replay guards, retention invariants, export tenant/credential/count checks, Phase 9 prompt/parser/metrics/entitlement/score/provider/idempotency tests, Phase 8 execution and safe-fetch/SSRF regression.
- GitHub Vercel status for the application candidate: success. QA and Preview deployments: READY.
- Canonical Chromium: all 8 required flows passed across the full-suite invocation and corrected targeted reruns. The initial full run passed 6 tests and found the two report-heading harness failures; monthly fulfillment then passed (3.8 minutes) and verification passed (6.7 minutes) with corrected selectors.
- Preview Chromium: all 8 required flows passed across the full-suite invocation and corrected targeted reruns. Auth, Phase 10 operations and Phase 3 passed in the initial invocation; monthly fulfillment passed its corrected rerun (3.9 minutes); verification, QA execution and AI Visibility passed together (3 tests); corrected content/link/schema PREPARE passed separately (1.9 minutes). The initial harness failures are documented below rather than represented as a single clean first run.
- Application-candidate QA: `https://optiq-6ohehrx5d-justinfuchs52-8677s-projects.vercel.app`; Preview: `https://optiq-pciuvkanb-justinfuchs52-8677s-projects.vercel.app`. Separate error/fatal log queries for each returned zero entries during the browser gate.
- Whitespace checks and final harness lint passed. Gitleaks scanned the Phase 10 commit range with redaction and found no leaks. Final documentation/test-only SHA and its deployment smoke are reported in the task completion record; application and migration files remain identical to the candidate above.

## Fresh migration and bounded recovery exercise

The authorized disposable project was `optiq-phase1-test` (`aged-cloud-70719532`), using the pre-existing reviewed disposable database. The guarded command was:

```text
node scripts/fresh-disposable-proof.mjs --reset-reviewed-disposable --reuse-reviewed-fixtures
```

It verified the exact disposable endpoint/database before resetting, migrated the complete chain through `0017_phase10_operational_controls`, recreated representative reviewed fixtures, checked tenant isolation with a non-bypass role, and reran immutable catalog migrations successfully. The 126 live tests then exercised the same disposable infrastructure, including new FORCE RLS tables and composite source references. Persistent QA was never reset; migration 0017 was applied normally through a canonical-QA-target-guarded deployment build.

At `2026-09-25T19:27:00Z`, the built app was connected to the disposable database using `scripts/phase10-recovery-app.mjs`. Local health returned `ok` / Phase 10. Chromium auth/session/workspace/monthly-data smoke passed (1 test, 12 seconds). The local server was stopped afterward. Synthetic local credentials and deterministic providers were used; no paid provider request was made.

This proves migration/fixture recreation and application reconnection, **not account-level Neon PITR restoration**. The actual account recovery window and backup coverage remain unconfirmed and must be recorded by an operator before unattended delivery.

## Browser and accessibility coverage

Firefox smoke passed 3 tests in 6.5 minutes on Preview application revision `3129046161671aee371b7493d9bd7a4e8af3f9f7`: login/dashboard, monthly cycle/approval, and AI Visibility. The later application change adds manual-cycle/rollback launch guards; final Chromium covers those guards. WebKit was not run.

Accessibility fixes include semantic panel headings, one page-level heading, a keyboard skip link and focus treatment, associated control labels and accessible validation alerts. The Phase 10 browser exercise checks the dashboard, client, website, audit, opportunities, monthly cycle, approvals, AI Visibility, operations and QA execution pages; verification is included in fulfillment regression. Mobile smoke checks a 390-pixel viewport. This is a focused engineering pass, not an accessibility certification.

An initial browser harness used generic heading selectors, which became ambiguous after semantic heading fixes; page-title assertions now explicitly select level 1 and report subsections level 3. Monthly/content harnesses also used browser network-idleness waits that could stall on background requests; they now use DOM readiness and retain explicit workflow-outcome assertions. Content PREPARE explicitly awaits its server-action response before polling, preventing a reload from racing the submission. Another harness used 13 sequential requests to test a 12/minute rate limit; a clock-window boundary correctly allowed those requests. A bounded burst of 25 concurrent, idempotent requests now avoids that boundary dependence and checks for normal 429 responses without 500s. These harness corrections did not weaken server policy.

## Operational limits and launch gaps

- No SaaS billing, paid provider account, new spending commitment, customer CMS write adapter, Google write scope, customer email send or production EXECUTE was added.
- Default monthly provider budget is $0. Optional Search Console, Perplexity, AI Gateway and Blob configuration gaps are reported without exposing values.
- Assign the platform-operator allowlist and incident owner/contact. Confirm the actual Neon backup/PITR window and permissions. Review unknown historical provider costs before increasing paid budgets.
- Current bounded evidence is Postgres-backed. No private Blob store/account commitment was created. Larger raw/binary evidence requires the documented private-storage assessment and lifecycle work.
- Failed temporary-artifact cleanup is deferred where the model cannot safely distinguish temporary artifacts from durable history. Capture cleanup is implemented and tested; finalized reports, execution and verification history remain retained.
- Export V1 rejects more than 1,000 rows per entity or 10 MiB rather than silently truncating.

See [implementation and storage assessment](phase10-pilot-readiness.md) and [backup/recovery runbook](phase10-recovery-runbook.md).
