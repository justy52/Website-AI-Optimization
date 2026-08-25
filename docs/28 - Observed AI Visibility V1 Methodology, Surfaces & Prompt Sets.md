# 28 - Observed AI Visibility V1 Methodology, Surfaces & Prompt Sets

## Status

Authoritative V1 methodology for the measured AI-search feature.

The product must distinguish:
- **AI Readiness** -> scored by Document 26.
- **Observed AI Visibility** -> sampled provider/API observations defined here.

Observed AI Visibility is not a universal rank and is not included in the overall Digital Visibility Score.

---

# 1. V1 Supported Automated Surfaces

V1 may automate only official/API-accessible surfaces that can be used consistently and lawfully.

Initial adapters:

1. **OpenAI web-grounded API observation**
   - OpenAI Responses API using the supported web-search tool.
   - Label results as `OpenAI web-grounded API`.
   - Do **not** label these results "ChatGPT ranking" or imply they reproduce the consumer ChatGPT app.

2. **Perplexity Sonar observation**
   - Official Sonar API using web-grounded answers.
   - Label results as `Perplexity Sonar API`.

3. **Gemini web-grounded observation**
   - Official Gemini API with Google Search grounding when available for the chosen model/account.
   - Label results as `Gemini API + Google Search grounding`.
   - Do **not** label them "Google AI Overview ranking."

Consumer ChatGPT, Gemini app UI, Google AI Overviews, and other non-API surfaces may be recorded only as **manual observations** unless an official, compliant integration is later added.

No scraping of consumer AI UIs in V1.

---

# 2. Surface Rollout

Phase order:
1. Perplexity Sonar adapter.
2. OpenAI web-grounded adapter.
3. Gemini Google-Search-grounded adapter.

A surface is enabled in production only after:
- request/response adapter tests;
- citation/metadata parser tests;
- cost/rate-limit controls;
- terms/access review;
- QA sample comparison;
- failure/degraded-mode tests.

Plan entitlement allows 1/2/3 surfaces, but a client can only use surfaces actually enabled on the platform.

---

# 3. Business Entity Alias Set

Before parsing an answer, create an approved alias set from BusinessFact data:

- exact business legal/display names;
- accepted abbreviations;
- website domain(s);
- canonical brand spelling;
- former name only if still relevant;
- location disambiguation terms.

Competitors receive the same alias structure.

Never infer a mention from a generic noun that happens to resemble the business name.

---

# 4. Mention Classification

For each answer/provider response, classify client and competitor presence as:

- `DIRECT_RECOMMENDATION` -> named as a recommended provider/business.
- `DIRECT_MENTION` -> named substantively but not clearly recommended.
- `CITED_SOURCE` -> client domain/page appears in provider citation/source metadata.
- `URL_MENTION` -> canonical domain appears in answer text.
- `CONTEXT_ONLY` -> name appears incidentally and should not count as visibility success.
- `NO_MENTION`.

Use provider-native structured citation/source metadata first.

Deterministic alias/domain matching runs second.

An AI-assisted parser may resolve ambiguous text only when:
- deterministic parser reports ambiguity;
- it receives the answer plus alias sets;
- it returns structured classification and quoted evidence span;
- confidence is MEDIUM/HIGH;
- LOW confidence routes to review.

Do not let the same model that produced the answer silently self-grade its own visibility result without deterministic checks.

---

# 5. Citation Parsing

Store citations from structured provider metadata when available:
- source URL
- title/domain
- citation index/relationship to answer
- whether source belongs to client, competitor, independent authority, or other

If only prose contains a URL, normalize/parse it and classify as URL_MENTION, not a provider citation.

---

# 6. Observation Metrics

Per prompt:
- client mention classification
- competitor mention classifications
- client citation count
- competitor citation count
- independent-source citations
- provider/surface
- model/version where available
- timestamp
- localization/context actually applied
- prompt-set/version
- parser version
- error/limitation state

Aggregate, per reporting window:
- **Mention Rate** = prompts with DIRECT_RECOMMENDATION or DIRECT_MENTION / successful prompts
- **Recommendation Rate** = prompts with DIRECT_RECOMMENDATION / successful prompts
- **Citation Rate** = prompts citing client-owned source / successful prompts
- **Share of Mentions** = client direct mentions / (client + configured competitor direct mentions), when denominator >0

These are sampled rates, not market share or rankings.

---

# 7. Starter Prompt Set v1

Prompt set version: `ai-vis-local-services-v1`.

Generate prompts only from verified services and legitimate locations in BusinessFact.

Core templates:

1. `What are the best {service} companies in {location}?`
2. `Who should I hire for {service} in {location}?`
3. `Which companies provide {service} near {location}?`
4. `Recommend a reputable {service} company in {location}.`
5. `What local companies specialize in {service} in {location}?`
6. `Who is known for {service} around {location}?`
7. `What should I look for when choosing a {service} company in {location}, and which local companies fit those criteria?`
8. `Which {service} providers in {location} have strong customer trust signals?`
9. `Who can help with {specific verified service need} in {location}?`
10. `Compare reputable options for {service} in {location}.`

Growth/Pro expansion templates:

11. `{service} company serving {secondary location}`
12. `Best company for {service subtype} in {location}`
13. `Who handles {high-value service use case} in {location}?`
14. `Local expert for {service-related problem} in {location}`
15. `Recommended {service} contractors/businesses near {location}`

Do not generate prompts for services or locations the client does not actually offer/serve.

---

# 8. Prompt Selection

Each plan's prompt budget in Document 27 is a maximum active prompt set.

Select prompts to cover:
- top revenue services;
- core locations;
- high-intent service/use-case combinations;
- known competitive opportunities.

Avoid trivial permutations that do not add decision value.

Prompt sets are versioned. Historical observations retain the exact rendered prompt.

---

# 9. Reporting Language

Allowed:
- "Your business was mentioned in 4 of 10 sampled Perplexity Sonar prompts this month."
- "The client domain was cited in 2 sampled answers."

Not allowed:
- "You rank #1 in AI."
- "ChatGPT ranks you third."
- "You appear in 40% of all AI searches."
- "Google AI prefers your company."

---

# 10. Parser Acceptance Tests

Include fixtures for:
- exact business mention;
- abbreviated alias;
- ambiguous common-name business;
- competitor-only answer;
- client cited but not named;
- client URL in prose but not citation metadata;
- multiple businesses in one sentence;
- negative/non-recommendation mention;
- misspelling;
- no mention;
- provider citation metadata unavailable;
- malformed provider response.
