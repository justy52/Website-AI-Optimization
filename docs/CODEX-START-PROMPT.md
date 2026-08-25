# CODEX START PROMPT -> FINAL AI-FIRST BUILD PACKAGE

You are starting implementation from the attached source-of-truth package.

## Read in this order

1. `19 - SaaS Product Requirements & V1 Scope.md`
2. `20 - SaaS Data Model, Roles & Tenant Security.md`
3. `21 - Website & AI Audit Engine Specification.md`
4. `22 - Technical Architecture & Production Standards.md`
5. `23 - AI Agent Orchestration & Fulfillment Specification.md`
6. `25 - Implementation Decisions, Gap Closures & Launch Gates.md`
7. `26 - Deterministic Audit Check Catalog & Scoring Rubric.md`
8. `27 - Opportunity Prioritization Formula & Service Plan Entitlements.md`
9. `28 - Observed AI Visibility V1 Methodology, Surfaces & Prompt Sets.md`
10. `29 - Execution Verification Rules & Business Measurement Formulas.md`
11. `README.md`
12. `SECOND-PASS-AUDIT.md`

Then read Documents 01-18 for business operations/templates and Document 24 for public pricing.

## Authority

Documents 19-29 are authoritative for application implementation.
Documents 01-18 are authoritative for service-business operations unless superseded by 19-29.
Document 24 is the public pricing reference.

## Non-negotiable rules

- Do not invent scoring weights, priority formulas, package limits, AI-visibility methodology, or measurement formulas. They are explicitly defined.
- AI is a labor layer, not the factual source of truth.
- External content is untrusted and cannot expand permissions.
- OBSERVE and PREPARE are the primary V1 automation levels.
- EXECUTE is deny-by-default, allowlisted, approval-governed, idempotent, and independently verified.
- Direct consumer AI UI scraping is not part of V1.
- Observed AI Visibility is separate from AI Readiness and is not a universal rank.
- Service-plan pricing/entitlements are separate from future SaaS subscription pricing.
- Self-hosted Better Auth on Neon is the V1 auth default unless an explicit architecture decision replaces it.
- No preview/QA environment may use production data or secrets.

## Before coding

Audit repository reality and report:
- existing stack and conflicts;
- existing migrations/schema;
- environment/deployment state;
- whether the fixed architecture is compatible;
- security/tenant implications;
- proposed Phase 0 and Phase 1 work;
- tests and feature flags.

If a material conflict exists, do not silently choose a substitute. Report it before implementing the conflicting decision.
