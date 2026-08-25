# AI-First Revision Summary

## Why this package was revised

The August 17 build specification treated the SaaS primarily as an evidence-backed audit and report generator with AI assistance. The business strategy changed on August 18: AI agents will perform the majority of repeatable fulfillment work for the recurring website, SEO, conversion, local-search, content, and AI-visibility service.

This revision changes the application from an **AI-assisted audit product** into a **governed AI fulfillment operating system**.

## Commercial model now reflected throughout the package

- Digital Visibility Audit -> **$495 one-time**
- Optimization Launch -> **starting at $1,500**
- Essentials -> **$750/month**
- Growth -> **$1,250/month**
- Pro -> **$2,000/month**
- The $495 audit is credited toward an Optimization Launch begun within 30 days.
- Monthly plans begin with a 3-month commitment, then continue month-to-month with 30 days' notice.

## Human fulfillment targets

| Plan | Earlier Manual Estimate | AI-First Human Target |
|---|---:|---:|
| Essentials | 2-3 hours/month | 45-60 minutes/month |
| Growth | 4-5 hours/month | ~1.5 hours/month |
| Pro | 7-8 hours/month | ~3 hours/month |

The app must be designed to make these targets realistic without reducing quality or eliminating required human judgment.

## Major product changes

### 1. V1 is no longer audit-only

Old V1:
Lead -> Website -> Audit -> Findings -> Final Report

New V1:
Lead -> Client -> Website -> Audit/Baseline -> Opportunity Queue -> Draft Work -> Approval Queue -> Verification -> Monthly Cycle -> Report

### 2. AI agents are first-class product infrastructure

The revised system defines logical agents for:

- Website Health
- Search / SEO
- Keyword & Competitor Intelligence
- AI Visibility
- Content Opportunity
- Content Production
- Existing Page Optimization
- Internal Linking
- Schema / Structured Data
- Conversion
- Reporting
- Client Communication Drafting
- Verification / QA
- Orchestration / Prioritization

### 3. Agent permissions are explicit

- **OBSERVE:** monitor, crawl, read, measure, compare, report.
- **PREPARE:** create recommendations, drafts, patches, reports, and work items.
- **EXECUTE:** perform only explicitly allowlisted, low-risk, reversible external actions.

External EXECUTE actions are deny-by-default in production.

### 4. Human approval is risk-based, not blanket manual labor

Humans remain responsible for strategy, client relationships, quality control, and consequential approvals. The system should not require a human to manually recreate or individually approve every low-risk evidence-backed observation.

Human approval remains mandatory initially for substantive live publishing, destructive actions, client-facing sends, pricing/contracts, third-party spend, permission escalation, and other consequential changes.

### 5. Verification is separate from execution

A successful write/API response does not mean a task is complete. Executed actions must be independently re-read or tested and classified as verified, warning, failed verification, rollback, or human review required.

### 6. The data model now supports fulfillment

The revised specification adds:

- AgentDefinition / AgentRun / AgentToolCall
- Opportunity
- WorkItem
- DraftArtifact
- ApprovalPolicy / ApprovalRequest
- ExecutionRecord
- VerificationRun
- MonitoringDefinition / MonitoringSnapshot
- IntegrationConnection
- Competitor
- AIVisibilityPromptSet / Run / Observation
- MonthlyCycle / MonthlyCycleItem
- UsageLedger

### 7. AI visibility is split into two concepts

- **AI Readiness:** website/entity/content characteristics that improve machine understanding.
- **Observed AI Visibility:** repeatable sampled tests against supported AI/answer-engine integrations.

The app must never present sampled AI-answer observations as guaranteed rankings.

### 8. Prompt-injection and autonomy boundaries are explicit

External webpages, emails, search results, and documents are untrusted data. They cannot expand agent permissions, tool allowlists, tenant scope, approval policy, budgets, authentication, or system instructions.

## Build order

1. Deterministic tenant/auth/domain foundation
2. Audit collectors, evidence, scoring, and reports
3. Durable agent runtime, tool registry, and run logs
4. Opportunities, orchestrator, work queue, and approvals
5. Monitoring plus Search Console, competitor, and AI-visibility adapters
6. Content/page/schema/internal-link agents and draft artifacts
7. Monthly cycles and automated reporting
8. Verification plus narrowly allowlisted EXECUTE actions in QA
9. Selected production EXECUTE actions behind flags
10. Commercial SaaS billing/limits after internal fulfillment is proven

## Codex read order

Read Documents **19-23 first**, then README, then 01-18 for business process, and 24 for exact public pricing.
