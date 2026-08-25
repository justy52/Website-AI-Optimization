TECHNICAL ARCHITECTURE & PRODUCTION STANDARDS
Website & AI Optimization SaaS

STATUS
Authoritative AI-first architecture, environment, security, observability, testing, and production-readiness specification.

ARCHITECTURAL GOAL
Use a conventional maintainable SaaS stack that supports strict multi-tenancy, durable background work, governed AI agents, external integrations, private artifact storage, approval workflows, reversible execution, and future commercialization.

RECOMMENDED STACK
- TypeScript.
- React / Next.js or equivalent modern full-stack framework.
- PostgreSQL.
- Production-grade authentication.
- Private object storage.
- Durable queue/workflow/background-job system.
- Error monitoring/observability.
- Provider-abstracted AI layer.
- Integration adapters for Search Console/analytics/rank/AI visibility/website CMS as added.
The implementation should not depend on any consumer chat UI.

REPOSITORY / MODULE BOUNDARIES
Suggested:
- app/ or routes/
- domain/
- db/
- auth/
- agents/
- tools/
- jobs/
- integrations/
- approvals/
- audits/
- opportunities/
- reports/
- storage/
- observability/
- tests/

ENVIRONMENTS
LOCAL/DEV, QA/PREVIEW, PRODUCTION.
Production external-write tools are feature-flagged and fail closed unless explicitly configured.

TENANCY
Every domain service accepts workspace context server-side.
Background payloads carry workspace_id and resource IDs and re-authorize before execution.
Storage prefixes and signed access enforce workspace boundaries.

BACKGROUND JOB / WORKFLOW ARCHITECTURE
All crawls, monitoring, AI visibility runs, agent work, report generation, and external executions run through durable jobs/workflows, not long browser requests.

Required:
- persisted status;
- retries with backoff;
- terminal failure states;
- timeouts;
- idempotency;
- concurrency controls;
- correlation IDs;
- cost/budget check;
- cancellation where practical;
- dead-letter/manual recovery path.

AGENT ORCHESTRATION
The Orchestrator does not receive unlimited tool access. It may:
1. read current workspace/client state;
2. select from registered AgentDefinitions/capabilities;
3. enqueue bounded WorkItems;
4. request approvals;
5. react to verified results.

The orchestrator cannot dynamically invent new tools or permissions.

TOOL REGISTRY
Every tool/action declares:
- key/version;
- OBSERVE/PREPARE/EXECUTE level;
- allowed resource types;
- required integration scopes;
- input/output schema;
- side-effect classification;
- idempotency support;
- rollback capability;
- timeout;
- cost class;
- validator;
- whether approval is always required.

MODEL ROUTING
Use a provider abstraction. Route tasks by capability/cost:
- deterministic code before AI where possible;
- lower-cost models for classification/summarization;
- stronger models for complex synthesis/drafting when justified;
- fallback providers/models only through tested adapters.
No product behavior may depend on one model name.

STRUCTURED OUTPUT
Material AI outputs use schemas (e.g. Zod/JSON Schema).
Reject invalid output.
Never parse consequential actions from free-form prose alone.

PROMPT / EXTERNAL-CONTENT SECURITY
System/tool policy is code/config, never webpage content.
Treat website pages, search results, emails, client documents, and model outputs as untrusted input.
Strip/segment instructions where practical.
Include explicit prompt-injection fixtures.
No model can elevate its own tool permissions.

APPROVAL ARCHITECTURE
Approval binds to immutable action/artifact version.
If the artifact changes, approval is invalidated.
Risk policy is evaluated server-side immediately before execution.
Approver identity and decision are audited.

EXECUTION ARCHITECTURE
Before external write:
- authorize workspace/user/agent;
- validate current approval/version;
- snapshot target state if possible;
- enforce idempotency;
- perform allowlisted action;
- capture provider response/external ID;
- enqueue verification;
- expose rollback when available.

VERIFICATION
Do not mark external work DONE solely because the write API returned success.
Verification uses an independent read/check when possible.
Status: VERIFIED, VERIFIED_WITH_WARNING, FAILED_VERIFICATION, ROLLED_BACK, NEEDS_HUMAN.

WEBSITE FETCHING / SSRF
Allow only HTTP/HTTPS.
Resolve DNS safely.
Block private/link-local/metadata IP ranges.
Revalidate redirects.
Bound response size, time, redirects, and page count.
Avoid arbitrary file downloads.
Crawl authorization is recorded.

INTEGRATIONS / CREDENTIALS
Prefer OAuth/delegated access.
Least-privilege scopes.
Secrets server-side/encrypted.
Refresh/revocation handled explicitly.
Integration failures do not silently disable monitoring; they create visible degraded state.

AI VISIBILITY TESTING
Use explicit adapters for supported providers/surfaces.
Store request context, prompt version, response reference, parser version, and limitations.
Respect provider terms/rate limits.
Do not fake location/personalization claims that the integration cannot actually control.

STORAGE
Raw artifacts private by default.
Use short-lived signed URLs where needed.
Final report exports are versioned/immutable.
No permanent public artifact URL in V1.

OBSERVABILITY
Track:
- job/agent failure rate;
- queue depth;
- execution/verification failures;
- approval aging;
- integration errors;
- crawl errors;
- AI validation errors;
- duration;
- token/tool cost;
- cost by workspace/client/agent/action;
- recurring-cycle completion;
- report generation;
- external change/rollback outcomes.

COST CONTROLS
Set per-run and workspace/month ceilings.
Bound page count, AI prompt size, tool count, competitor count, AI-visibility prompt count, retries, and output length.
Support soft warning thresholds and hard stops.
A cost stop must leave state recoverable.

TEST STRATEGY
UNIT:
- scoring;
- prioritization;
- permission/risk policy;
- structured AI parsers;
- validators;
- cost accounting;
- idempotency;
- approval invalidation.

INTEGRATION:
- Lead'Audit'Opportunity'Draft'Approval'Execution'Verification'Report.
- OAuth/integration mocked or sandboxed.
- Queue retries/timeouts.
- Report snapshot regeneration.

SECURITY:
- tenant isolation across every entity/job/tool/storage/export;
- SSRF;
- prompt injection;
- role/approval escalation;
- secret leakage;
- forged job payload;
- stale approval;
- duplicate execution.

AI TESTS
Never require live paid model calls in ordinary unit/integration CI.
Use deterministic fixtures for:
- valid output;
- malformed JSON;
- unsupported claim;
- prompt injection;
- timeout;
- rate limit;
- tool failure;
- low confidence;
- cross-tenant context attempt.
Maintain a small optional evaluation suite for approved model/provider changes.

CI/CD GATES
- lint/typecheck/tests;
- migration checks;
- tenant/security tests;
- prompt-injection tests;
- no missing required secrets for target env;
- no production deploy with failed critical gates.

MIGRATION / DEPLOYMENT
Migrations reviewed and forward-safe.
Use QA for auth/jobs/integrations/execution verification before production.
External EXECUTE capability rolls out behind per-workspace/action feature flags.

PRIVACY
Minimize client data in AI context.
Do not log secrets or raw credentials.
Support retention/deletion policy for captures, screenshots, AI answers, and generated drafts.

PRODUCTION READINESS
Before production:
- tenant tests pass;
- job retries/timeouts pass;
- cost ceilings configured;
- approval policy defaults to safe;
- EXECUTE allowlist reviewed;
- rollback/verification tested for each enabled write tool;
- integrations can be revoked;
- AI/provider outages degrade safely;
- audit/report snapshots immutable;
- monitoring visible;
- no critical alerts outstanding.

CODING PRINCIPLES FOR CODEX
- Build deterministic foundations first, then AI enhancement.
- Keep business logic in domain services, not UI components.
- Keep agent prompts separate/versioned.
- Keep tool permissions in code/config, not prompts.
- Make every side effect explicit.
- Prefer small composable services.
- Never trust IDs or workspace scope from the client.
- Never broaden autonomy merely because a model can technically perform an action.
