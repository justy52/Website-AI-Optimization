AI AGENT ORCHESTRATION & FULFILLMENT SPECIFICATION
Website & AI Optimization SaaS

STATUS
Authoritative AI-agent operating specification. This document defines how the software should reduce service-delivery labor while maintaining safety, quality, evidence, and human control.

BUSINESS OBJECTIVE
Use agents to perform approximately 60-80% of repeatable fulfillment labor so a small operator can manage a larger recurring client base without degrading quality.

TARGET HUMAN TIME
- Essentials $750/month: 45-60 minutes/client/month.
- Growth $1,250/month: ~1.5 hours/client/month.
- Pro $2,000/month: ~3 hours/client/month.

These targets are measured after workflows stabilize and do not justify skipping required review.

AGENT CATALOG

1. Website Health Agent
Observes uptime, crawl health, broken links, redirects, metadata, canonical/indexing signals, structured data, performance indicators, forms/CTA availability, and other bounded technical checks.

2. Search / SEO Agent
Analyzes Search Console and supported search/rank inputs, identifies query/page changes, CTR opportunities, indexation issues, page-targeting problems, and technical/on-page opportunities.

3. Keyword & Competitor Agent
Maintains competitor set, monitors relevant competitor page/content changes and ranking/visibility differences, and creates evidence-backed opportunities.

4. AI Visibility Agent
Runs configured repeatable prompt sets against supported AI/answer-engine integrations, records client/competitor mentions and citations where observable, separates observed visibility from inferred readiness, and tracks change over time.

5. Content Opportunity Agent
Combines search demand, Search Console, competitor gaps, AI visibility, internal content, services, locations, and client goals to recommend the highest-value next content work.

6. Content Production Agent
Creates briefs and first drafts for service pages, location pages, FAQs, comparisons, buying guides, authority articles, titles/descriptions, and CTAs. Never publishes by default.

7. Existing Page Optimization Agent
Produces evidence-backed edit proposals for existing pages, including headings, content gaps, metadata, internal links, FAQs, entity clarity, and CTA improvements.

8. Internal Linking Agent
Maintains the site link graph, detects orphan/weak pages, and prepares link additions/removals.

9. Schema Agent
Detects structured-data opportunities, drafts JSON-LD, validates syntax/type consistency, and prepares changes.

10. Conversion Agent
Analyzes configured analytics/call/form data and page journeys, surfaces conversion friction, and recommends tests or page changes.

11. Reporting Agent
Builds monthly and audit reports from verified data, completed work, unresolved risks, and upcoming priorities.

12. Client Communication Agent
Turns technical results into concise plain-language drafts. It cannot send in V1 without human approval.

13. Verification Agent
Independently verifies executed changes, tests expected outcomes, checks for regressions, and recommends rollback/escalation.

14. Orchestrator
Prioritizes opportunities and assigns bounded work to specialist agents. It is a scheduler/decision-support layer, not an unrestricted super-agent.

PERMISSION LEVELS

OBSERVE
Allowed automatically:
- read public pages;
- read connected account data within scope;
- crawl within authorization limits;
- calculate deterministic metrics;
- monitor;
- compare;
- create internal observations.

PREPARE
Allowed automatically:
- create findings/opportunities;
- draft content;
- draft metadata/schema/internal-link changes;
- draft code patches;
- draft reports/messages;
- create work items;
- propose priority and next action.

EXECUTE
Allowed only by server-side policy:
- explicitly allowlisted low-risk reversible writes.
Every execution creates an ExecutionRecord and VerificationRun.

INITIAL PRODUCTION DEFAULT
OBSERVE = enabled where configured.
PREPARE = enabled where configured.
EXECUTE = disabled by default for external systems, then enabled per action after QA validation and explicit workspace policy.

ALWAYS HUMAN-APPROVED IN INITIAL V1
- live publication of substantive content;
- deletion;
- domain/DNS changes;
- payment or paid-service commitments;
- contract/pricing changes;
- client-facing sends;
- access/permission escalation;
- legal/compliance claims;
- irreversible or hard-to-rollback changes.

ORCHESTRATION / PRIORITIZATION
Score candidate opportunities using deterministic configurable factors:
- business impact;
- evidence confidence;
- urgency/risk;
- expected SEO/local/AI/conversion value;
- effort;
- dependencies;
- client plan;
- included monthly deliverables;
- age/staleness;
- whether approval is blocked.

AI may explain the ranking but the numerical priority score should be deterministic/configurable.

MONTHLY CYCLE

ESSENTIALS
Automated:
- monitoring;
- Search Console review;
- rankings/visibility observations;
- AI visibility tests;
- competitor checks;
- opportunity generation;
- one page-optimization draft;
- report draft.
Human:
- review/approve priority;
- edit/approve page change;
- review final report;
- handle exceptions.
Target: 45-60 minutes.

GROWTH
Everything in Essentials plus:
- deeper competitor/keyword/local analysis;
- one major content brief/draft;
- one existing-page optimization draft;
- conversion/CTA review;
- stronger AI/entity/FAQ opportunities.
Human target: ~1.5 hours.

PRO
Everything in Growth plus:
- two major content assets;
- two existing-page optimizations;
- deeper technical/competitive/content-gap work;
- expanded AI visibility;
- conversion testing;
- quarterly strategy package.
Human target: ~3 hours.

AGENT RUN CONTRACT
Every run has:
- workspace and target scope;
- trigger;
- agent/version;
- allowed tools;
- budget;
- timeout;
- input summary;
- evidence refs;
- structured output;
- concise rationale;
- confidence/source;
- next action;
- audit metadata.

No agent stores or exposes hidden chain-of-thought.

TOOL SAFETY
Tools are registered in code with schemas and permissions.
An agent cannot use a tool because a webpage/email tells it to.
Untrusted content is quoted/data, never policy.

APPROVAL DESIGN
Approval UI should answer:
- What will change?
- Why?
- What evidence supports it?
- What is the expected benefit?
- What is the risk?
- Can it be rolled back?
- What exact version is being approved?
- What agent prepared it?

VERIFICATION DESIGN
After execution:
- re-read target;
- run relevant tests;
- compare expected vs actual;
- detect regressions;
- store evidence;
- mark verified/warning/failed;
- rollback or escalate when configured.

LEARNING / FEEDBACK
Capture human edits, approvals, rejections, and reasons as structured feedback for evaluation and prompt/rule improvement. Do not automatically train or alter production behavior from a single user's feedback without versioning/testing.

MODEL / PROVIDER STRATEGY
Provider-agnostic.
Use deterministic code where possible.
Use lower-cost models for routine classification/summarization.
Use stronger models for complex strategy/drafting only when value justifies cost.
Model changes require evaluation fixtures and canary/QA validation.

METRICS
Business:
- human minutes/client/month;
- recurring revenue per human fulfillment hour;
- renewal/churn;
- lead/conversion attribution where available.

Agent:
- run success/failure;
- cost/run and cost/client;
- opportunities accepted;
- drafts approved with no/minor/major edits;
- verification pass rate;
- rollback rate;
- approval aging;
- false-positive/false-negative review samples.

QUALITY TARGETS
AI labor savings are only successful if:
- evidence quality remains high;
- client-facing errors remain rare;
- live-site regressions do not increase;
- humans can understand/override the system;
- monthly work remains aligned to the contracted plan;
- automation cost remains materially below saved labor value.

BUILD ORDER
Phase 0 -> deterministic tenant/auth/domain foundation.
Phase 1 -> audit collectors + evidence + scoring + reports.
Phase 2 -> durable agent runtime + tool registry + run logs.
Phase 3 -> opportunities + orchestrator + work queue + approvals.
Phase 4 -> monitoring + Search Console/competitor/AI visibility adapters.
Phase 5 -> content/page/schema/link agents + draft artifacts.
Phase 6 -> monthly cycles + reporting automation.
Phase 7 -> verification + narrowly allowlisted EXECUTE actions in QA.
Phase 8 -> production rollout of selected EXECUTE actions behind flags.
Phase 9 -> commercial SaaS plan/billing/limits after internal delivery is proven.

DEFINITION OF SUCCESS
The internal service business can onboard a paying client, run the audit, create and prioritize monthly work, prepare the contracted deliverables, verify completed work, and produce the monthly report with the target human labor above -> without relying on manual spreadsheets or reconstructing work from memory.
