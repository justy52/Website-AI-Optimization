WEBSITE & AI AUDIT ENGINE SPECIFICATION
Website & AI Optimization SaaS

STATUS
Authoritative audit/baseline specification for the AI-first platform. The audit engine is both a paid-client deliverable and the evidence foundation used by downstream agents.

GOAL
Create repeatable, evidence-backed Digital Visibility Audits and monitoring snapshots that let agents identify and prioritize work without fabricating facts.

AUDIT / SCORE CATEGORIES
1. Website Performance
2. SEO
3. Local Search
4. Conversion
5. AI Visibility
6. Authority

Internal checks may also use subcategories such as technical health, mobile/usability, analytics/tracking, accessibility red flags, content/trust, and security/maintenance. Client-facing category mapping must remain consistent.

EXECUTION TYPES
AUTOMATED -> deterministic tool/code result.
AI_ASSISTED -> model interprets captured evidence or client context.
MANUAL -> user observation/judgment.
EXTERNAL_INTEGRATION -> verified data from Search Console, analytics, rank provider, AI-answer provider, etc.

AUDIT PRINCIPLES
- Measurements come from deterministic tools/integrations, not model invention.
- Every material finding links to evidence.
- A failed collector records ERROR/UNAVAILABLE rather than a fabricated result.
- AI may synthesize, explain, classify, and draft recommendations.
- Scoring is deterministic from approved rules.
- Sampling limits are disclosed.
- Re-audits create new snapshots and preserve history.

AGENT ROLES WITHIN AUDIT
Website Health Agent -> crawl and technical evidence.
SEO Agent -> indexability/on-page/Search Console interpretation.
Local Search Agent -> location/entity/local signals and verified integration data.
Conversion Agent -> page journey and CTA analysis using evidence/screenshots/analytics.
AI Visibility Agent -> configured answer-engine tests plus website answerability/entity analysis.
Authority Agent -> trust/entity/citation/backlink/review evidence where integrations allow.
Audit Analyst Agent -> deduplicates and synthesizes findings.
Orchestrator -> prioritizes findings into opportunities.
Verification Agent -> validates fix claims and before/after state.

CRAWL / AUTHORIZATION POLICY
The workspace must attest to legitimate authorization or public-observation basis.
Use bounded crawl scope, page count, time, concurrency, file-size, redirect, and domain limits.
No credential attacks, vulnerability exploitation, bypasses, or intrusive scanning.

CHECK DEFINITION CONTRACT
Each check defines:
- key/version/category
- execution type
- required inputs/tools
- timeout/retry policy
- evidence schema
- result schema/status
- severity mapping
- scoring rule or no-score
- recommendation template/AI instruction
- whether the result may auto-create an Opportunity
- verification method

RESULT STATES
PENDING, RUNNING, PASSED, WARNING, FAILED, NOT_APPLICABLE, REVIEW_REQUIRED, ERROR.

FINDING / OPPORTUNITY CREATION
Deterministic high-confidence facts may create draft findings/opportunities automatically.
AI-assisted findings may also create drafts when evidence is attached.
The human does not need to click-approve every low-risk draft finding individually. Instead:
- high-risk/low-confidence/claim-sensitive findings require explicit review;
- low-risk evidence-backed findings can remain system-approved-for-draft under policy;
- final client-facing audit/report requires human finalization in V1.

SEVERITY
CRITICAL -> broken/risky/direct lead loss or serious technical issue.
HIGH -> significant performance/search/conversion/visibility issue.
MEDIUM -> worthwhile optimization.
LOW -> polish/future opportunity.

CONFIDENCE
HIGH -> direct deterministic/integration evidence.
MEDIUM -> strong evidence with interpretation.
LOW -> incomplete/suggestive evidence requiring confirmation.
Confidence is derived from evidence quality and validator signals, not model self-confidence alone.

SCORING
Each client-facing category is 0-100 using deterministic deductions/weights.
Overall score is calculated from versioned category weights.
Store scoring definition version and raw inputs.
AI cannot choose numeric deductions.

AI VISIBILITY
Maintain two separate concepts:
A. AI Readiness -> website/entity/content characteristics that may improve machine understanding.
B. Observed AI Visibility -> results from explicit configured tests against supported answer-engine/model surfaces.

Observed tests store:
- provider/surface/model where known
- prompt set/version
- location/context settings where supported
- timestamp
- response reference
- client mention
- competitor mentions
- cited/referenced sources when available
- normalization/parser version
- limitations

Never claim sampled observed visibility is a universal ranking.

CONTENT / COMPETITOR OPPORTUNITY GENERATION
The audit engine may generate downstream opportunities by combining:
- search queries/impressions/CTR/position;
- page content;
- competitor observations;
- AI-visibility observations;
- internal link graph;
- schema/entity gaps;
- business goals and services.

Every opportunity records why it was created and the evidence that supports it.

FINALIZATION
Finalization creates an immutable AuditSnapshot containing:
- approved/system-accepted findings;
- deterministic scores;
- evidence refs;
- tool versions;
- agent/model/prompt versions for material interpretations;
- limitations;
- report inputs.

REPORT GENERATION
The Reporting Agent generates a draft client report from the snapshot.
A human finalizes the report in V1.
The final artifact must not regenerate historical measurements from newer definitions.

RE-AUDIT / MONITORING COMPARISON
Show:
- score/category changes;
- resolved/new/regressed issues;
- verified performance/search/conversion changes;
- AI-visibility observation changes with sampling caveats;
- completed work related to prior opportunities.

ENGINE ACCEPTANCE TESTS
- deterministic check happy/error/timeout paths;
- structured-data parsing;
- bounded crawler/SSRF protection;
- cross-tenant isolation;
- injected webpage instructions cannot alter agent policy;
- scoring reproducibility;
- AI schema validation;
- finding deduplication;
- audit finalization immutability;
- re-audit comparison;
- observed AI-visibility run reproducibility metadata;
- low-confidence output routes to review;
- monthly monitoring can reuse collectors without mutating finalized audits.
