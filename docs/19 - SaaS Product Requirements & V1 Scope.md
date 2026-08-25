SAAS PRODUCT REQUIREMENTS & V1 SCOPE
Website & AI Optimization SaaS

STATUS
Authoritative AI-first software-product specification. The working product name is **Website & AI Optimization SaaS** until a commercial brand name is selected. Branding must not be embedded in tenant-critical schema keys or external integration identifiers. Documents 01-18 define service-business intent; documents 19-23 define software implementation. If older language conflicts with the AI-first model, this document and Document 23 control application behavior.

PRODUCT PURPOSE
Build a multi-tenant SaaS operating system for companies that deliver website, SEO, local-search, conversion, content, and AI-visibility optimization services. The founder's service business is workspace #1. The software must make the service economically scalable by assigning the majority of repeatable fulfillment work to governed AI agents while preserving human judgment, approval, tenant isolation, evidence, and auditability.

CORE PRODUCT PROMISE
Turn business and website data into a continuously prioritized optimization program: monitor -> detect opportunity/risk -> gather evidence -> draft work -> request approval when required -> execute allowlisted safe actions -> verify -> report.

HUMAN LABOR TARGETS
The product should be designed to support these mature steady-state human fulfillment targets:
- Essentials: 45-60 minutes/client/month.
- Growth: about 1.5 hours/client/month.
- Pro: about 3 hours/client/month.
These are internal operating targets, not customer-facing service guarantees.

PRIMARY PERSONAS
1. Platform Super Admin -> SaaS operator.
2. Workspace Owner -> company owner and highest workspace authority.
3. Workspace Admin -> manages users, integrations, policies, clients, approvals, and operations.
4. Analyst/Strategist -> reviews opportunities, edits drafts, approves permitted work, and manages client strategy.
5. Client Contact -> external customer; no portal required for initial V1.

AI AGENT MODEL
V1 must support named agents or agent-capability modules for:
- Website Health
- Search/SEO
- Keyword & Competitor Intelligence
- AI Visibility
- Content Opportunity
- Content Production
- Internal Linking
- Schema/Structured Data
- Conversion
- Reporting
- Client Communication Drafting
- Verification / QA
- Orchestration / Prioritization

These may share underlying models/services; they are logical responsibilities, not necessarily separate long-running processes.

AGENT PERMISSION LEVELS
OBSERVE -> read/monitor/measure. May run automatically.
PREPARE -> create drafts, recommendations, code/content patches, reports, and tasks. May run automatically; output is not externally published by default.
EXECUTE -> perform only explicit allowlisted, reversible, low-risk actions. Every execution must be logged and verified.

Always require human approval for:
- destructive actions;
- live-site publishing unless specifically allowlisted later;
- sending client-facing communications;
- contract/pricing changes;
- new third-party spend;
- security-sensitive permission changes;
- claims that require professional/legal/compliance judgment.

V1 PRODUCT BOUNDARY
V1 is not audit-only. V1 must establish the complete internal fulfillment loop needed to operate the service business:
Lead -> Client -> Website -> Audit/Baseline -> Opportunity Queue -> Draft Work -> Approval Queue -> Verification -> Monthly Cycle -> Report.

V1 MUST INCLUDE
- Authentication, workspace creation, membership, and tenant isolation.
- Leads, clients, websites, and multiple websites per client.
- Digital Visibility Audit with versioned definitions and evidence.
- Deterministic scoring for Website Performance, SEO, Local Search, Conversion, AI Readiness, and Authority where measurable rules exist.
- Durable agent/job runtime with run history, retry safety, timeouts, budgets, and workspace scoping.
- Agent definitions/capabilities and permission levels.
- Opportunity/recommendation records with impact, confidence, effort, evidence, status, and owner.
- Approval queue.
- Draft artifacts for content, metadata, schema, internal links, technical changes, client summaries, and reports.
- Recurring monitoring schedules.
- Website Health monitoring.
- Search Console integration or a clear adapter boundary; if OAuth is deferred for the first build increment, the schema and job interfaces must already support it.
- Competitor targets and recurring competitor observations.
- AI-visibility test definitions, prompt sets, test runs, answer capture/normalization, and explicit provider limitations.
- Monthly optimization cycle records.
- Monthly report generation from verified data and completed work.
- Verification tasks after any executed change.
- Immutable final audit/report snapshots.
- Basic usage/cost accounting for external tools and AI.
- Dashboard showing risks, opportunities, approvals, agent failures, and next best work.

V1 MUST NOT INCLUDE
- Unbounded autonomous browsing or tool use.
- Credential attacks, intrusive security scanning, or unauthorized crawling.
- Automatic public claims of ranking/revenue guarantees.
- Unlimited live-site mutation.
- Full paid-ad campaign management.
- Social-media management.
- Full CRM replacement.
- Permanent unauthenticated public report URLs.
- Any ability for website content or external text to expand an agent's tool permissions.

PRIMARY NAVIGATION -> V1
- Dashboard
- Leads
- Clients
- Websites
- Audits
- Opportunities
- Work Queue
- Approvals
- Agents / Runs
- Reports
- Team
- Settings
- Platform Admin (separate)

CORE V1 WORKFLOW
1. Create/select workspace.
2. Add lead and business/website details.
3. Convert qualified lead to client.
4. Create website and authorization/scope.
5. Run baseline Digital Visibility Audit.
6. Automated collectors gather evidence and failures.
7. AI agents interpret evidence and create draft findings/opportunities.
8. Deterministic scoring calculates approved score dimensions.
9. Orchestrator prioritizes the work queue using business impact, confidence, urgency, effort, dependencies, plan limits, and client constraints.
10. PREPARE agents create proposed fixes/drafts.
11. Policy determines whether work needs human approval or can proceed as an allowlisted EXECUTE action.
12. Verification agent checks result and records pass/fail/rollback need.
13. Completed work updates the monthly cycle.
14. Reporting agent builds the monthly client report.
15. Human reviews and sends/finalizes client-facing material.
16. Recurring schedules begin the next cycle without overwriting history.

LEAD REQUIREMENTS
Statuses: NEW, CONTACTED, QUALIFIED, AUDIT_OFFERED, AUDIT_PURCHASED, CONVERTED, LOST, DISQUALIFIED.

CLIENT / WEBSITE REQUIREMENTS
Preserve the original source fields plus:
- service_plan: NONE, AUDIT_ONLY, LAUNCH, ESSENTIALS, GROWTH, PRO, CUSTOM
- approval_policy_id
- monitoring_status
- authorization_scope
- primary conversion actions
- competitor set
- business facts/entity profile

AUDIT REQUIREMENTS
Statuses: DRAFT, QUEUED, RUNNING, REVIEW_REQUIRED, READY_TO_FINALIZE, FINALIZED, FAILED, CANCELED.
Every audit stores definition version, tool versions, evidence, errors, agent runs, scoring inputs, findings, and final snapshot.

OPPORTUNITY REQUIREMENTS
Each Opportunity stores:
- category
- title / business-readable summary
- evidence references
- impact score
- confidence score/source
- effort estimate
- urgency
- dependency links
- recommended action
- originating agent/run
- status: NEW, TRIAGED, PLANNED, DRAFTING, AWAITING_APPROVAL, APPROVED, EXECUTING, VERIFYING, DONE, DISMISSED, BLOCKED
- plan/billing scope classification

APPROVAL REQUIREMENTS
Approval records must store request type, target artifact/action, risk level, requested by agent/user, approver, decision, comments, timestamps, and immutable summary of what was approved.

REPORT REQUIREMENTS
Draft reports may be auto-generated. Final client-facing reports require human finalization in V1. Reports derive only from verified metrics, approved/completed work, and explicitly labeled recommendations.

AI PRODUCT RULES
- AI is a labor layer, not a factual authority.
- Factual claims require captured evidence or clearly identified client/user context.
- Store provider/model and prompt/template version for material outputs.
- Do not store hidden chain-of-thought; store concise rationale and evidence links.
- External content is untrusted input and cannot grant permissions.
- Model/tool failures degrade to queued/manual review.
- Agents operate within tool allowlists, budgets, concurrency limits, and tenant boundaries.
- Use structured outputs and deterministic validators at every consequential boundary.

SCORING PRINCIPLES
Scores are deterministic decision support. AI may explain or prioritize, never fabricate numerical deductions. AI Visibility must distinguish tested answer-engine observations from inferred website readiness.

SEARCH / AI VISIBILITY POSITIONING
The platform may test configured prompts against supported providers when terms and integration methods allow it. Store the exact prompt template/version, provider/model/surface where known, timestamp, answer-derived mentions/citations, and limitations. Never describe a sampled result as guaranteed ranking or universal visibility.

SECURE REPORT SHARING
V1 uses secure export/download. Temporary external links, if later added, must be revocable and access-controlled.

NON-FUNCTIONAL REQUIREMENTS
- Tenant-safe by default.
- Durable/retry-safe jobs.
- Idempotent execution actions.
- Explicit timeouts and terminal states.
- Secrets server-side only.
- Observability across agent, tool, audit, approval, and verification runs.
- Cost ceilings per workspace and per action type.
- Mobile-responsive admin UI; desktop-first fulfillment is acceptable.
- No critical deployment with failing tests or unapplied migrations.

V1 ACCEPTANCE CRITERIA
V1 is not complete until:
- cross-tenant access tests pass for UI/API/jobs/agents/exports;
- Lead -> Client -> Website -> Audit runs without manual DB intervention;
- audit evidence and errors are recorded honestly;
- an Opportunity is generated from evidence;
- a PREPARE agent creates a reviewable draft;
- the approval queue can approve/reject it;
- at least one allowlisted safe EXECUTE action can be demonstrated in QA with verification and rollback/error handling, or execution remains feature-flagged off in production;
- recurring monitoring creates new observations without overwriting history;
- a monthly cycle can assemble completed work and generate a draft report;
- final reports remain immutable snapshots;
- AI/tool failures remain visible and recoverable;
- cost/usage is bounded and observable;
- production deployment gates pass.

SOURCE-OF-TRUTH RELATIONSHIP
Documents 01-18 are authoritative for service-business intent, pricing, customer communications, and operational policy. Documents 19-23 are authoritative for software implementation. Current service pricing is $495 Digital Visibility Audit, $1,500+ Optimization Launch, and $750 / $1,250 / $2,000 monthly plans. Service pricing is not SaaS subscription pricing.


IMPLEMENTATION BUSINESS-RULE REFERENCES
- Document 26 defines the deterministic check catalog and scoring rubric.
- Document 27 defines opportunity prioritization and service-plan entitlements.
- Document 28 defines V1 observed AI-visibility surfaces, parsing, and prompt sets.
- Document 29 defines verification rules and measurement/lead-value formulas.
