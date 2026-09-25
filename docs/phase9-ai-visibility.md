# Phase 9 — Observed AI Visibility

Observed AI Visibility is sampled evidence. It never enters Document 26 scoring,
changes audit scores, or grants EXECUTE. No consumer UI scraping is implemented.

## Approved provider adjustment (2026-09-25)

The user approved the successor **Perplexity Agent API** instead of the retiring
Sonar endpoints. This is a distinct surface label, not `Perplexity Sonar API`.
The versioned adapter `perplexity-agent-v1.0` uses `perplexity/sonar` with only
the web_search tool, forced grounding, one tool call, two steps, 1,200 output
tokens, no preset/fallback model, no external custom tools and no provider storage.
Official references checked on 2026-09-25:

- [Retirement announcement](https://community.perplexity.ai/t/sonar-is-moving-to-the-agent-api/5802)
- [Agent model catalog](https://docs.perplexity.ai/docs/agent-api/models)
- [Official request mapping](https://github.com/perplexityai/api-platform-developers/blob/main/skills/migrate-sonar-to-agent-api/references/request-mapping.md)
- [Official response mapping](https://github.com/perplexityai/api-platform-developers/blob/main/skills/migrate-sonar-to-agent-api/references/response-and-streaming.md)

The public models API returned HTTP 401 without a credential. The model identifier
is confirmed by the official model catalog. No live inference was attempted.
QA currently has no PERPLEXITY_API_KEY. Activation requires a server-managed key
and a tiny live contract/cost smoke before enabling scheduled customer use.
OpenAI web-grounded API and Gemini API + Google Search grounding remain disabled.

## Evidence and retention

Six tenant tables retain prompt sets, exact prompts, runs, committed call
reservations, normalized observations and expiring answer captures. Composite FKs,
RLS and FORCE RLS protect all tables. Prompt sets are immutable from creation;
new facts produce a new version. The latest version is the active set. Historical
versions remain visible and cannot gain prompts after a run exists.

Only effective PUBLIC VERIFIED facts with a recorded human approver can enter
prompts or alias snapshots. Competitor names/domains must be explicitly configured
and then approved by OWNER/ADMIN. No aliases come from captured webpage prose.
Normalized observations and terminal runs reject UPDATE and DELETE. Raw captures
have a 90-day expiry, are hidden after expiry and may then be deleted; automated
physical cleanup is deferred. Their answer hashes and normalized evidence remain.

## Reliability and budgets

One active visibility run per workspace, serial prompts, at most 30 calls, 45
seconds per call, 256 KiB response, zero automatic provider retries. Provider
errors stop further calls and retain unavailable remaining prompts. A $3 run
cost ceiling stops subsequent calls when provider-reported cost reaches it;
it is not a provider-side billing guarantee. Actual cost is null when unavailable.

Each prompt gets a committed unique call reservation before the request. Completed
results are reused. An unknown outcome is never called again: after two minutes
recovery records UNAVAILABLE. This intentionally favors avoiding duplicate spend
over automatically recovering a lost response. Workflow replay is safe.

Paid run uniqueness is per workspace/site/surface/cadence window, even if the
prompt set changes. An unavailable run also retains its window; activating a
credential applies to the next window rather than silently retrying a potential
paid attempt. Duplicate and concurrent requests return the same run.

## Fulfillment and reporting

Plan definitions supply prompt, competitor and surface maxima and monthly/twice
monthly cadence. Aggregate active prompt allocation is bounded across a client's
websites. Only successful API observations consume usage. A cadence window earns
completion only when all selected prompts succeed. QA fixtures and manual records
never consume API usage or complete contractual deliverables.

`ai-vis-parser-v1.1` uses provider-native sources first and approved alias/domain
matches second. Lists alone do not imply recommendation, negatives cannot become
recommendation wins, ambiguous common names require review, and prose URLs are
not provider citations. Unknown sources remain OTHER; no authority is inferred.
Version 1.1 requires an explicit accepted-abbreviation fact and matching case;
uppercase spelling or a location alone cannot disambiguate a single-word name.
Earlier v1.0 QA observations retain their original parser version and result.

Reports disclose surface, window, sample size, failures, limitations, and sampled
rates. Failed/unavailable prompts do not enter successful denominators. No safe
automatic Opportunity threshold is defined in Doc 28, so this phase creates none.

QA uses an explicitly labeled deterministic fixture. It does not stand in for a
paid-provider acceptance pass. Phase 8 sandbox execution and production EXECUTE
policy remain unchanged. AI Gateway remains disabled.
