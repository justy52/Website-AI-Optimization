# PRE-BUILD DOCUMENT AUDIT -> FINAL

## Result

**PASS -> BUILD READY after remediation**

The AI-first document package was audited for duplicated authority, stale pricing/terminology, architecture gaps, agent-governance gaps, tenant/security ambiguity, service-plan ambiguity, data/credential lifecycle gaps, reporting truth rules, and launch-readiness requirements.

## Material issues found and fixed

1. **Duplicate authoritative documents**
   - Old Document 09 filename remained alongside renamed Document 09.
   - Old Document 18 filename remained alongside renamed Document 18.
   - Fixed by removing obsolete duplicates.

2. **Architecture selections were still generic**
   - Auth, durable workflows, AI runtime, storage, and hosting were not fully pinned.
   - Fixed in Document 25 with Next.js/TypeScript, Vercel, Neon Postgres + Drizzle, Neon Auth, Vercel AI SDK + AI Gateway, Vercel Workflows, private Vercel Blob, pnpm, and testing/observability direction.

3. **Service-plan hours conflicted conceptually with AI-first fulfillment**
   - Fixed: 2/4/7 hours are manual/custom implementation allowances; routine agent work does not consume them.

4. **Service-plan entitlements lacked a software model**
   - Fixed: versioned service-plan definitions are required and separated from future SaaS subscription plans.

5. **AI content lacked a formal factual source/claim policy**
   - Fixed: ClientKnowledgeSource, BusinessFact, and ClaimPolicy requirements added.

6. **OAuth/integration token storage was underspecified**
   - Fixed: encrypted long-lived secrets, least-privilege OAuth, key versioning/rotation, logging prohibitions, revocation behavior.

7. **Retention rules lacked concrete defaults**
   - Fixed: retention defaults for raw crawls, AI answer captures, agent logs, approvals/executions, and final reports.

8. **Backup/disaster-recovery launch criteria were incomplete**
   - Fixed: recovery capability, restore procedure, kill switches, pause controls, and QA recovery exercise added.

9. **Rate limits/cost controls lacked explicit platform/workspace/run layers**
   - Fixed in Document 25.

10. **Attribution language could overstate business results**
    - Fixed: source/method/window required; correlation cannot be labeled attribution; estimated lead value must be labeled.

11. **Content agents needed duplicate/thin-location-page guardrails**
    - Fixed: cannibalization and useful-content checks; mass thin location pages prohibited.

12. **AI visibility methodology needed stronger report separation**
    - Fixed: AI Readiness and Observed AI Visibility must remain distinct.

13. **Approval policy lacked a concise default risk matrix**
    - Fixed in Document 25.

14. **Commercial launch policy/legal gates were not explicitly tracked**
    - Fixed as external SaaS launch gates without blocking the internal pilot.

15. **Provider failure/degraded mode was incomplete**
    - Fixed with explicit behavior for AI, Search Console, ranking, Blob, Workflows, and CMS adapters.

## Deliberately deferred -> not build gaps

- Commercial brand name. The working name is Website & AI Optimization SaaS and branding is intentionally decoupled from schema.
- Future SaaS subscription pricing.
- Full client portal.
- Universal CMS write automation.
- Paid ads/social media management.
- Automated client-facing email sending.
- Universal rank/SEO data vendor selection.
- External commercial legal documents until before external SaaS launch.

These are deliberate phase decisions, not unresolved architecture holes.

## Final source-of-truth order

1. Documents **19-29** -> software/product architecture and implementation authority.
2. Documents **01-18** -> service-business operations and templates.
3. Document **24** -> public website pricing reference.
4. `README.md`, `CODEX-START-PROMPT.md`, and this audit explain handoff/read order.

## Codex handoff status

The package is suitable to hand to Codex for repository audit, scaffold/architecture validation, and Phase 0/Phase 1 implementation planning.
