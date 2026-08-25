# 25 - Implementation Decisions, Gap Closures & Launch Gates

## Status

Authoritative implementation-decisions document for the Website & AI Optimization SaaS build. This document closes architectural and operational gaps identified during the August 18, 2026 pre-build audit.

When Documents 19-23 describe a technology generically and this document makes a specific selection, **Document 25 controls the initial implementation**. A later documented architecture decision record may replace a selection deliberately.

---

# 1. Fixed Initial Technology Stack

Use this stack unless repository reality makes a change necessary and the change is explicitly documented before implementation:

- **Application:** Next.js App Router with TypeScript.
- **UI:** Tailwind CSS + shadcn/ui-compatible component architecture.
- **Hosting / deployment:** Vercel.
- **Database:** Neon Postgres.
- **Database access / schema:** Drizzle ORM with checked-in SQL/Drizzle migrations. Tenant-critical constraints must exist in the database, not only in TypeScript.
- **Authentication:** self-hosted Better Auth using Neon Postgres for identity/session storage. Neon Auth is not a V1 hard dependency. Codex may only substitute managed Neon Auth after verifying its production/GA status and migration compatibility at build time, and must document that substitution before implementation.
- **AI application layer:** Vercel AI SDK.
- **AI provider routing:** Vercel AI Gateway so providers/models can change without rewriting business logic.
- **Durable work / agents:** Vercel Workflows / Workflow Development Kit. Long-running agent and monitoring work must not depend on a single HTTP request remaining alive.
- **Object storage:** private Vercel Blob for screenshots, raw evidence, generated files, and immutable report artifacts.
- **Scheduling:** Vercel Cron may trigger scheduler/dispatcher workflows; durable execution belongs in Workflows.
- **Package manager:** pnpm.
- **Testing:** Vitest-compatible unit/integration testing and Playwright for critical browser/end-to-end flows.
- **Observability:** Vercel Observability plus structured application/agent audit logs stored in the product database. A dedicated third-party error platform may be added later but is not a V1 dependency.

Do not pin the architecture document to an exact package patch version. Codex must install a current mutually compatible stable version set and lock it in `pnpm-lock.yaml`.

---

# 2. Environment Topology

Use separate environments with no shared production secrets:

## Local
- Local app.
- Development database branch/project.
- Sandbox/test external integrations.
- EXECUTE external writes disabled by default.

## QA
- Separate Vercel QA project.
- Separate Neon QA project or fully isolated database branch with QA-only credentials.
- Separate Blob store.
- Sandbox or QA integration credentials.
- EXECUTE actions may be tested only behind explicit QA feature flags.

## Production
- Separate Vercel production project.
- Production Neon database.
- Production private Blob store.
- Production OAuth credentials/integration registrations where providers require them.
- External EXECUTE actions deny-by-default and enabled per action/workspace only after QA verification.

Never point preview or QA deployments at the production database.

---

# 3. Tenant Isolation Decision

The application must use **defense in depth**:

1. Every tenant-owned row contains `workspace_id`.
2. Domain/service functions require server-derived workspace context.
3. Composite uniqueness/foreign-key patterns prevent cross-workspace parent-child relationships where practical.
4. PostgreSQL Row Level Security is required on tenant-owned tables as a defense-in-depth layer.
5. Database policies must use transaction-scoped tenant/user context established by trusted server code; do not rely on browser-supplied workspace IDs.
6. Direct browser access to the database is not part of the architecture.
7. Background jobs re-establish and re-authorize workspace scope before every material step.

Cross-tenant isolation tests are deployment-blocking.

---

# 4. Service Plan Entitlements vs SaaS Billing

Two plan concepts must remain separate:

## Service Plan
The optimization service purchased by the agency's client:
- NONE
- AUDIT_ONLY
- LAUNCH
- ESSENTIALS
- GROWTH
- PRO
- CUSTOM

## SaaS Subscription Plan
The future software subscription purchased by an agency/workspace. This is **not defined or priced in V1**.

Create a versioned `ServicePlanDefinition` / entitlement model so monthly-cycle automation can determine included deliverables and monitoring cadence without hard-coding pricing into agent prompts.

Initial service-plan entitlement concepts should include:
- monitoring set/cadence;
- number of major content deliverables;
- number of existing-page optimizations;
- competitor-monitoring depth;
- AI-visibility prompt-set depth;
- quarterly-strategy requirement;
- manual/custom website-work allowance;
- optional add-ons.

The 2 / 4 / 7-hour website-work allowances are **manual/custom implementation allowances**. Routine agent monitoring, analysis, drafting, and reporting do not decrement those hours.

---

# 5. Client Business Facts & AI Content Controls

AI content must have a controlled factual source.

Add:

## `ClientKnowledgeSource`
Stores references to approved source material such as:
- client website pages;
- onboarding answers;
- service lists;
- service areas;
- approved pricing statements;
- licenses/certifications;
- guarantees/warranties;
- brand guidelines;
- uploaded/reference documents.

## `BusinessFact`
Structured verified facts:
- fact type;
- value;
- source;
- verification status;
- approved by;
- effective date / expiration where relevant;
- sensitivity classification.

## `ClaimPolicy`
Per-client rules for:
- claims AI may make;
- claims requiring human approval;
- prohibited claims;
- required disclaimers;
- industries requiring stricter review.

Content agents must distinguish:
- verified fact;
- source-derived draft claim;
- inference/recommendation;
- unknown/TBD.

AI must not invent pricing, credentials, service areas, warranties, guarantees, statistics, awards, customer counts, legal/compliance claims, or other business facts.

---

# 6. Integrations Strategy

Use adapter interfaces so provider-specific code does not leak through domain logic.

Initial integration categories:

- Google Search Console.
- Google Analytics / GA4 where useful.
- Google Business Profile when API access and product scope justify it.
- AI/answer-engine visibility providers or first-party APIs where permitted.
- Rank/keyword data provider when added.
- CMS/website write adapters.
- Call tracking / form conversion sources as later integrations.

## V1 requirement
Read/monitor integrations take priority over write integrations.

The core V1 must remain useful if a website has no supported CMS write adapter:
- agents can OBSERVE;
- agents can PREPARE changes;
- a human can implement externally;
- verification can confirm the result afterward.

Do not delay the core platform waiting for universal WordPress/Wix/Squarespace/Webflow/Shopify write support.

---

# 7. OAuth / Integration Secret Storage

Per-client integration credentials must not be stored as plaintext ordinary database fields.

For V1:
- Prefer provider OAuth/delegated access.
- Encrypt refresh tokens and similar long-lived secrets at rest using authenticated encryption.
- Keep the master encryption key in production secret/environment management, separate from the database.
- Store key version, nonce/IV, ciphertext, provider, scopes, and token metadata.
- Build for key rotation.
- Never log access tokens, refresh tokens, API keys, client secrets, or full authorization headers.
- Revocation/disconnect must disable future agent runs that depend on the connection.

---

# 8. Retention Defaults

Initial retention defaults:

- Finalized audits and final reports: retained until workspace/client deletion policy removes them.
- Approval and execution audit records: minimum 24 months unless legal/customer policy requires longer.
- Agent run summaries and tool-call metadata: 12 months.
- Raw crawl page captures and temporary evidence: 90 days by default.
- Screenshots supporting finalized findings: retain with the finalized audit/report when material.
- Raw AI-answer captures used for observed AI visibility: 90 days by default; normalized observations may be retained longer.
- Failed temporary artifacts: purge within 30 days unless needed for incident investigation.

Retention periods must be configurable later. Deletion workflows must remove associated private Blob objects and derived indexes/caches where applicable.

---

# 9. Backup, Recovery & Business Continuity

Production launch requires:

- database backup / point-in-time recovery capability enabled and verified for the selected Neon plan;
- documented restore procedure;
- immutable or recoverable report/evidence artifact strategy;
- migration rollback or forward-fix playbook;
- integration credential recovery/reconnect procedure;
- ability to disable all external EXECUTE actions globally;
- ability to pause all agents for one workspace;
- ability to pause all scheduled agent work platform-wide;
- documented incident owner and recovery checklist.

At least one QA restore/recovery exercise must be completed before onboarding external SaaS customers.

---

# 10. Rate Limits, Budgets & Abuse Protection

Define limits at three levels:

## Platform
Global concurrency and provider-protection ceilings.

## Workspace
Monthly cost budget, crawl concurrency, active workflow count, AI-call limits, and integration quotas.

## Run / Tool
Max pages, redirects, response size, tokens/input size, output length, tool calls, retries, duration, competitor count, visibility prompts, and estimated cost.

Hard-limit behavior:
- stop new costly work;
- preserve completed evidence/state;
- mark the run as budget-limited/blocked;
- create a visible admin event;
- never silently continue with a more permissive limit.

Add API/user-action rate limiting for login-sensitive and high-cost endpoints.

---

# 11. Notification Decision

V1 requires **in-app operational notifications** for:
- failed agent/workflow runs;
- integrations requiring reconnection;
- pending approvals;
- failed verification;
- budget limits;
- monitoring anomalies requiring attention.

Email notification delivery is optional for the first production increment.

Client-facing email sending is not required for core V1. The system may draft client communication, but human-reviewed delivery can occur outside the app until a later Resend/email phase.

---

# 12. Reporting / Attribution Truth Rules

The platform may report:
- traffic;
- impressions;
- rankings/visibility where supported;
- calls;
- forms;
- conversions;
- qualified leads;
- revenue attribution when a reliable source exists.

Never label correlation as attribution.

Each reported business outcome must store/source:
- metric provider;
- measurement window;
- event definition;
- attribution method;
- confidence/limitations where applicable.

Estimated lead value must be explicitly labeled **estimated** and use a documented formula.

---

# 13. Content Quality & Duplicate-Content Controls

Before recommending or approving a new content asset, the Content Opportunity Agent must check:
- existing client pages;
- near-duplicate topic overlap;
- cannibalization risk;
- target user/search intent;
- factual source availability;
- service/location legitimacy;
- whether the content adds useful information instead of merely creating search-volume pages.

Mass generation of thin location pages is prohibited.

---

# 14. AI Visibility Methodology Guardrails

Observed AI visibility is a sampled measurement, not a universal rank.

Every visibility observation must retain:
- prompt set/version;
- exact prompt or prompt hash with retrievable versioned template;
- provider/surface/model where available;
- date/time;
- localization/personalization controls actually used;
- client mention outcome;
- competitor mention outcome;
- citations/sources where observable;
- parser/normalizer version;
- run errors/limitations.

Reports must separate:
1. **AI Readiness Score**
2. **Observed AI Visibility**

Do not merge these into a single unsupported score.

---

# 15. Approval Risk Matrix

Initial policy:

## No human approval required
- routine OBSERVE runs;
- internal metric calculations;
- monitoring snapshots;
- internal opportunity creation;
- internal report drafts;
- internal content/metadata/schema drafts.

## Human approval required
- substantive live content publication;
- redirect creation/deletion;
- schema publication where it could create unsupported claims;
- destructive actions;
- plugin/theme/CMS changes;
- DNS/domain changes;
- client-facing sends;
- changes involving legal, medical, financial, regulated, or compliance-sensitive claims;
- paid third-party actions;
- permission/security changes.

A future policy may allow specific low-risk EXECUTE actions only after QA evidence and an explicit allowlist.

---

# 16. Audit Log & Admin Controls

Provide a workspace-visible audit history for material events and a platform-admin view for support/security.

Must capture:
- actor: user or agent;
- workspace;
- action;
- resource;
- old/new summary where applicable;
- approval reference;
- execution/verification reference;
- timestamp;
- correlation/run ID;
- safe error details.

Platform support must **not** silently impersonate a workspace user. Any future support-access mode must be explicit, time-bounded, logged, and visible to authorized platform admins.

---

# 17. Data Export / Portability

Before commercial SaaS launch, Workspace Owner must be able to export core workspace data in a machine-readable format or request an operator-assisted export.

At minimum export:
- clients;
- websites;
- audits/findings;
- opportunities/work items;
- reports;
- agent-run summaries;
- approval/execution history.

Secrets/tokens are never exported.

---

# 18. Legal / Policy Launch Gates

These are not coding blockers for the internal pilot, but they are blockers before accepting external SaaS subscribers:

- Terms of Service.
- Privacy Policy.
- AI/automation disclosure appropriate to the product.
- Data retention/deletion policy.
- Subprocessor/vendor list as appropriate.
- Cookie/analytics disclosure where applicable.
- Abuse/acceptable-use policy.
- Security/contact process.
- Billing/refund/cancellation policy once SaaS subscription pricing exists.

The service business's client agreement remains separate from the future SaaS Terms of Service.

---

# 19. Accessibility & Browser Support

Application UI target:
- WCAG 2.2 AA-oriented implementation for core flows.
- Keyboard-operable navigation and dialogs.
- Semantic labels and accessible form errors.
- Desktop-first operations with functional responsive layouts.

Support the current and previous major versions of Chrome, Edge, Safari, and Firefox for the admin application where practical.

Do not market the client website audit as a legal accessibility certification.

---

# 20. Degraded-Mode Behavior

The product must remain understandable when providers fail:

- AI provider unavailable -> deterministic collectors continue; drafting is queued/blocked visibly.
- Search Console disconnected -> related metrics show unavailable; no fabricated substitute.
- rank provider unavailable -> retain last timestamped data and mark stale.
- AI-visibility provider unavailable -> show run failure/staleness.
- Blob unavailable -> do not finalize artifact that cannot be durably stored.
- Workflow failure -> retry within policy, then surface manual recovery.
- CMS write adapter unavailable -> generate PREPARE artifact and manual implementation instructions.

---

# 21. Definition of Build-Ready

Codex may begin production implementation only after it has read Documents 19-25 and confirms:

- no repository reality conflicts with the fixed stack;
- environment strategy is implementable;
- migrations can enforce the tenant model;
- agent runtime and tool registry boundaries are clear;
- service-plan entitlements are separate from future SaaS billing;
- integration secret storage is designed before OAuth credentials are persisted;
- critical security/acceptance tests are planned;
- no source document requires Codex to invent a business rule.

If Codex finds a material conflict, it must stop that specific implementation decision and report the conflict rather than silently choosing a different architecture.
