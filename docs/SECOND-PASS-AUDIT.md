# SECOND-PASS AUDIT -> Claude Findings Reconciliation

## Result

**PASS -> Claude-identified business-rule gaps closed.**

The external Claude audit was materially correct on the four principal gaps:
1. deterministic scoring/check catalog;
2. deterministic opportunity prioritization;
3. concrete AI-visibility surfaces/parser/prompt set;
4. structured recurring plan entitlements.

It also correctly identified auth maturity as a stack risk.

## Remediation

### Scoring
Closed by Document 26:
- concrete check catalog;
- weights;
- thresholds;
- formulas;
- evidence coverage behavior;
- auto-opportunity rules;
- versioning.

### Prioritization
Closed by Document 27:
- input scales;
- formula;
- modifiers;
- priority bands;
- deterministic monthly selection order.

### Service-plan entitlements
Closed by Document 27:
- monitoring cadence;
- keyword limits;
- competitor limits;
- AI-visibility depth;
- content deliverables;
- manual implementation allowance;
- strategy cadence.

### AI visibility
Closed by Document 28:
- V1 API-accessible surfaces;
- no scraping of consumer AI UIs;
- alias model;
- deterministic + AI-assisted fallback parsing;
- citation classification;
- starter prompt set;
- sampling metrics;
- safe reporting language.

### Verification / estimated lead value
Closed by Document 29:
- per-action verification;
- failure/rollback handling;
- lead/qualification definitions;
- estimated pipeline/revenue/gross-profit formulas;
- attribution truth rules.

### Auth risk
Document 25 now uses **self-hosted Better Auth on Neon Postgres** as the fixed V1 default. Managed Neon Auth may only replace it after explicit current-status verification and documented architecture approval. Vercel Workflows remains the durable-execution choice.

## V1 autonomy expectation

The audit's warning is accepted:
- V1 production launches with OBSERVE and PREPARE doing most repeatable analysis/drafting.
- EXECUTE remains narrowly allowlisted and rolls out after QA verification.
- The mature 1 / 1.5 / 3 hour human-fulfillment targets are an end-state operating target, not a claim that the first production release immediately performs every client-site change autonomously.

## Final build authority

Documents 19-29 are authoritative for software/product implementation.
Documents 01-18 govern service operations.
Document 24 governs public pricing.
