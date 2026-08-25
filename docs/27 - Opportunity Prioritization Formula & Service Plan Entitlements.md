# 27 - Opportunity Prioritization Formula & Service Plan Entitlements

## Status

Authoritative V1 business-rule specification for work ordering and recurring package automation.

Priority definition version: `op-priority-v1.0`.
Service-plan definition version: `service-plans-v1.0`.

---

# 1. Priority Input Scales

Each Opportunity receives deterministic 0-5 values:

## Impact
0 none; 1 cosmetic; 2 small; 3 meaningful; 4 high; 5 direct major lead/revenue/search/business-risk effect.

## Confidence
0 unsupported; 1 weak; 2 limited; 3 reasonable; 4 strong; 5 direct deterministic/verified evidence.

## Urgency
0 no timing pressure; 1 someday; 2 low; 3 normal; 4 time-sensitive; 5 currently broken, rapidly worsening, or business-critical.

## Strategic Fit
0 unrelated; 1 weak; 2 peripheral; 3 supports stated goal; 4 strong alignment; 5 directly supports primary client business goal.

## Plan Fit
0 explicitly out of scope; 1 mostly outside; 2 may need add-on; 3 fits if capacity permits; 4 clearly included; 5 explicitly required by current plan/cycle.

## Staleness
0 newly created; 1 >14 days; 2 >30; 3 >60; 4 >90; 5 >180 days unresolved.

## Effort
1 <30 min; 2 30-90 min; 3 1.5-3 hr; 4 3-8 hr; 5 >8 hr or multi-party/custom project.

---

# 2. Base Priority Formula

Normalize each 0-5 factor by multiplying by 20.

`base =`
- Impact x 0.30
- Confidence x 0.20
- Urgency x 0.15
- Strategic Fit x 0.15
- Plan Fit x 0.10
- Staleness x 0.10

where each factor has already been normalized to 0-100.

Then apply effort modifier:
- Effort 1: +10
- Effort 2: +5
- Effort 3: 0
- Effort 4: -10
- Effort 5: -20

Then apply:
- unresolved hard dependency: -25
- awaiting required client input: -15
- awaiting approval: do **not** reduce importance score; mark execution state blocked instead
- confirmed duplicate/superseded opportunity: score 0 and close/supersede
- CRITICAL finding: final priority minimum 95

`final_priority = clamp(round(base + modifiers), 0, 100)`

Bands:
- 90-100 Immediate
- 75-89 High
- 55-74 Normal
- 35-54 Backlog
- 0-34 Low

The UI must expose factor values and the deterministic reason for the score.

---

# 3. Monthly Selection Rule

The Orchestrator selects work in this order:

1. unresolved CRITICAL issues;
2. approved/in-scope HIGH opportunities;
3. contractual recurring deliverables not yet fulfilled;
4. highest priority score;
5. lower effort as tie-breaker;
6. older opportunity as second tie-breaker.

Do not manufacture low-value work merely to consume an allowance.

Out-of-scope high-value opportunities remain visible and may create an add-on/change-order recommendation.

---

# 4. Initial Service Plan Definitions

## AUDIT_ONLY
- recurring monitoring: none after audit unless separately purchased
- content deliverables: 0
- existing-page optimizations: 0
- report: audit report only

## LAUNCH
Project-scoped implementation based on approved proposal, not monthly entitlement.

## ESSENTIALS -> $750/month
- Website Health: weekly
- Search Console: weekly when connected
- rank/keyword observation: weekly when provider connected
- tracked priority keywords: up to 25
- configured competitors: up to 3
- competitor deep review: monthly
- AI-readiness recheck: monthly for materially changed areas
- observed AI visibility: monthly; starter prompt set up to 10 prompts; 1 enabled V1 surface
- major new content assets: 0 included
- existing-page optimization: 1/month
- manual/custom website-work allowance: up to 2 hours/month
- monthly report: 1
- quarterly strategy meeting: not included
- additional locations: add-on unless agreement says otherwise

## GROWTH -> $1,250/month
- Website Health: weekly
- Search Console: weekly
- rank/keyword observation: weekly
- tracked priority keywords: up to 75
- configured competitors: up to 5
- competitor deep review: monthly
- AI-readiness recheck: monthly
- observed AI visibility: monthly; starter prompt set up to 20 prompts; up to 2 enabled V1 surfaces
- major content assets: 1/month
- existing-page optimization: 1/month
- manual/custom website-work allowance: up to 4 hours/month
- monthly report: 1
- quarterly strategy review: internal; client meeting optional unless agreement adds it
- additional locations: add-on unless agreement says otherwise

## PRO -> $2,000/month
- Website Health: weekly
- Search Console: weekly
- rank/keyword observation: weekly
- tracked priority keywords: up to 150
- configured competitors: up to 8
- competitor deep review: at least monthly; material changes may trigger interim review
- AI-readiness recheck: monthly
- observed AI visibility: twice monthly; starter prompt set up to 30 prompts; up to 3 enabled V1 surfaces
- major content assets: 2/month
- existing-page optimization: 2/month
- manual/custom website-work allowance: up to 7 hours/month
- monthly report: 1
- quarterly strategy review: included
- additional locations: add-on unless agreement says otherwise

---

# 5. Entitlement Accounting

Routine agent activity does not consume manual/custom website-work hours.

Track separately:
- `agent_work_units`
- `manual_implementation_minutes`
- `major_content_assets_completed`
- `existing_page_optimizations_completed`
- `ai_visibility_observations_used`
- `competitor_targets_active`
- `tracked_keywords_active`

Unused manual/custom website-work allowance does not automatically roll over.

A plan definition is versioned. Existing client agreements retain their assigned plan-definition version until deliberately migrated.

---

# 6. Cost Guardrail

Package entitlements are maximum included service scope, not a requirement to spend the maximum AI/tool budget every month.

The system should prefer useful evidence and contractual deliverables over unnecessary provider calls.
