# 26 - Deterministic Audit Check Catalog & Scoring Rubric

## Status

Authoritative V1 audit-business-rule specification.

This document closes the scoring gap identified during the second pre-build audit. Codex must implement these rules as versioned configuration/data, not invent substitute weights or thresholds.

Initial scoring definition version: `dv-score-v1.0`.

---

# 1. Client-Facing Score Model

The scored categories are:

1. Website Performance -> overall weight **20%**
2. SEO -> **25%**
3. Local Search -> **15%**
4. Conversion -> **15%**
5. AI Readiness -> **10%**
6. Authority -> **15%**

**Observed AI Visibility is not part of the numerical score.** It is reported separately using Document 28.

If a category is genuinely not applicable, exclude it from the overall calculation and renormalize the remaining overall category weights proportionally.

Do not mark a category N/A merely because an integration is disconnected. Missing evidence is `UNAVAILABLE`, not N/A.

---

# 2. Category Score Formula

Every check has a `max_penalty_weight` within its category.

For applicable checks:

- PASS penalty factor = `0.00`
- WARNING penalty factor = `0.50`
- FAIL penalty factor = `1.00`
- ERROR / UNAVAILABLE = no numerical penalty, but lowers evidence coverage and must be disclosed
- NOT_APPLICABLE = excluded from denominator

Formula:

`category_score = round(100 * (1 - sum(actual_penalty) / sum(applicable_max_penalty)))`

where:

`actual_penalty = max_penalty_weight * result_penalty_factor`

Clamp score to 0-100.

A category with less than **60% evidence coverage by applicable max weight** must display `LOW COVERAGE` beside the score.

The overall score is the weighted average of category scores that have sufficient evidence coverage. A low-coverage category may be shown but must not silently create a precise overall score; if any required category falls below 60% coverage, overall score is labeled **Provisional**.

---

# 3. Website Performance Checks -> 100 penalty weight

| Key | Weight | PASS | WARNING | FAIL | Auto-opportunity |
|---|---:|---|---|---|---|
| `perf.lcp` | 22 | LCP <= 2.5s | >2.5s and <=4.0s | >4.0s | Yes |
| `perf.inp` | 18 | INP <=200ms | >200ms and <=500ms | >500ms | Yes |
| `perf.cls` | 14 | CLS <=0.10 | >0.10 and <=0.25 | >0.25 | Yes |
| `perf.https` | 14 | HTTPS valid, no primary-page mixed-content error | Minor non-blocking mixed-content/security warning | HTTP, invalid cert, or blocking mixed content | Yes |
| `perf.mobile_render` | 16 | responsive viewport + no material horizontal overflow on sampled primary pages | isolated layout issue | primary navigation/content unusable on common mobile viewport | Yes |
| `perf.critical_functionality` | 16 | primary navigation, primary CTA, and key lead form/link smoke tests pass | non-primary defect | primary navigation, CTA, phone link, or lead form materially broken | Yes |

Core Web Vitals thresholds above intentionally track Google's current documented Good / Needs Improvement / Poor bands. Field data is preferred when available; otherwise lab evidence must be labeled as lab data.

---

# 4. SEO Checks -> 100 penalty weight

| Key | Weight | PASS | WARNING | FAIL | Auto-opportunity |
|---|---:|---|---|---|---|
| `seo.indexability` | 18 | sampled intended pages return indexable 200 responses | isolated unintended noindex/canonical ambiguity | homepage or material money pages blocked/noindexed/unindexable | Yes |
| `seo.robots_sitemap` | 10 | robots and XML sitemap present/coherent where applicable | minor sitemap freshness/coverage issue | robots blocks intended site sections or sitemap missing/broken on material site | Yes |
| `seo.canonical` | 10 | canonical tags coherent on sampled primary pages | isolated missing/self-canonical inconsistency | widespread conflicting canonicals | Yes |
| `seo.title` | 12 | unique descriptive titles on sampled priority pages | isolated weak/duplicate title | widespread missing/duplicate/non-descriptive titles on priority pages | Yes |
| `seo.meta_description` | 6 | useful unique descriptions on priority pages | some missing/duplicate descriptions | widespread absence/duplication on priority pages | Yes |
| `seo.heading_structure` | 10 | clear primary heading and logical hierarchy | isolated hierarchy issue | widespread missing/duplicated/meaningless primary headings | Yes |
| `seo.internal_links` | 14 | priority pages are meaningfully linked and no material orphan condition | weak depth/anchor opportunities | material money pages orphaned or effectively unreachable internally | Yes |
| `seo.content_targeting` | 20 | priority pages clearly satisfy a distinct service/user intent without material duplication | partial overlap/thinness | material duplicate/thin/cannibalizing service content | Yes |

Do not use arbitrary character-count rules as the sole basis for PASS/FAIL on titles, descriptions, or content.

---

# 5. Local Search Checks -> 100 penalty weight

Applicable when the business serves a defined local/regional market.

| Key | Weight | PASS | WARNING | FAIL | Auto-opportunity |
|---|---:|---|---|---|---|
| `local.business_identity` | 15 | name/address-or-service-area/phone facts are internally consistent | minor inconsistency | material conflicting identity/contact facts | Yes |
| `local.gbp_presence` | 20 | verified/claimed GBP connection or reliable evidence of active profile | profile exists but optimization/access status uncertain | no usable profile for an eligible local business | Yes |
| `local.category_service_alignment` | 15 | primary business category/services align with actual core services | secondary/service gaps | material misclassification | Yes |
| `local.location_clarity` | 12 | site clearly states legitimate served locations/service area | incomplete or buried location context | ambiguous/misleading location/service-area claims | Yes |
| `local.local_pages` | 12 | service/location content is useful, distinct, and legitimate | coverage gap | thin doorway/location-page pattern or absent location relevance where needed | Yes |
| `local.structured_business_data` | 10 | relevant LocalBusiness/Organization structured facts are coherent where used | incomplete | conflicting/invalid business structured facts | Yes |
| `local.review_signal` | 16 | review presence and recency are reasonably competitive for configured local competitor set | meaningful gap | no meaningful review signal or severe competitive deficit | Yes |

`local.review_signal` V1 comparator:
- PASS: client review count >=75% of configured local competitor median **and** at least one review in past 120 days when data is available.
- WARNING: 25-74% of median or no review in past 120 days.
- FAIL: <25% of median or zero reviews.
If reliable competitor review data is unavailable, return UNAVAILABLE rather than guessing.

---

# 6. Conversion Checks -> 100 penalty weight

| Key | Weight | PASS | WARNING | FAIL | Auto-opportunity |
|---|---:|---|---|---|---|
| `conv.primary_cta` | 18 | primary action is clear and readily available on priority pages | present but weak/inconsistent | absent/unclear on material lead pages | Yes |
| `conv.lead_form` | 18 | primary lead form successfully passes smoke test | friction/field issues but functional | broken or no practical lead path where one is expected | Yes |
| `conv.mobile_contact` | 12 | mobile contact/call action is usable | minor friction | materially inaccessible/broken | Yes |
| `conv.offer_clarity` | 16 | visitor can determine service, audience, and next step quickly | partial ambiguity | materially unclear offering or next action | Yes |
| `conv.trust_signals` | 14 | meaningful credible trust proof is present near decision points | sparse/poorly placed | material absence of credibility support | Yes |
| `conv.friction` | 12 | no obvious unnecessary steps in sampled core journey | moderate friction | severe navigation/form/process friction | Yes |
| `conv.measurement` | 10 | primary lead actions are measured or reliably attributable to a source | partial tracking | no practical measurement of primary digital lead actions | Yes |

Conversion checks are evidence-backed UX/business rules, not guarantees that a change will increase revenue.

---

# 7. AI Readiness Checks -> 100 penalty weight

| Key | Weight | PASS | WARNING | FAIL | Auto-opportunity |
|---|---:|---|---|---|---|
| `ai.identity_clarity` | 14 | business identity is explicit and consistent | minor ambiguity | business/entity identity materially unclear | Yes |
| `ai.service_clarity` | 16 | core services are explicitly described in useful language | service gaps | core offering materially ambiguous | Yes |
| `ai.location_clarity` | 10 | geographic/service-area facts are explicit where relevant | incomplete | unclear/conflicting | Yes |
| `ai.entity_consistency` | 12 | key facts agree across audited first-party sources | minor mismatch | material conflicting entity facts | Yes |
| `ai.answerability` | 14 | priority customer questions can be answered from substantive site content | important gaps | core questions cannot be answered from site | Yes |
| `ai.structured_data` | 10 | relevant valid structured data supports entity/content understanding | incomplete | invalid/conflicting structured data where relied upon | Yes |
| `ai.citability` | 12 | site contains specific useful source-worthy facts/expertise/content | generic content predominates | little substantive information beyond promotional claims | Yes |
| `ai.crawlability` | 12 | important content is server-readable/indexable and not materially hidden from normal crawlers | isolated JS/render limitation | material core content inaccessible to standard fetch/render path | Yes |

This is a **readiness** score only. Do not infer actual placement in ChatGPT, Gemini, Perplexity, Google AI, or other answer engines from this score.

---

# 8. Authority Checks -> 100 penalty weight

| Key | Weight | PASS | WARNING | FAIL | Auto-opportunity |
|---|---:|---|---|---|---|
| `auth.reviews` | 18 | credible review signal is present and reasonably competitive | gap | absent/severely weak | Yes |
| `auth.third_party_mentions` | 16 | meaningful independent business citations/mentions found | limited | none found in configured evidence sources | Yes |
| `auth.referring_domains` | 16 | referring-domain signal >=75% of configured competitor median | 25-74% | <25% or effectively none | Yes |
| `auth.credentials` | 14 | relevant legitimate credentials/experience/proof are clearly stated and source-supported | incomplete | unsupported or absent where credibility depends on them | Yes |
| `auth.business_transparency` | 12 | clear about/contact/business details | incomplete | anonymous/opaque business presentation | Yes |
| `auth.expertise_content` | 12 | substantive expertise content with responsible authorship/context where appropriate | generic/thin | little evidence of expertise | Yes |
| `auth.entity_consistency` | 12 | important facts consistent across configured first/third-party sources | minor mismatch | material inconsistency | Yes |

Never create fake citations, links, awards, memberships, credentials, testimonials, or review signals to improve Authority.

---

# 9. Finding Severity Mapping

Severity is separate from score deduction.

Default:
- CRITICAL: broken primary conversion path, site inaccessible, material HTTPS/security transport issue, homepage/material site unintentionally noindexed/blocked, or similarly direct business-breaking state.
- HIGH: check FAIL with material business/search/conversion effect.
- MEDIUM: WARNING or lower-impact FAIL.
- LOW: non-blocking polish/opportunity.

A deterministic rule may elevate severity; AI may recommend a severity change but cannot silently override the stored rule.

---

# 10. Auto-Opportunity Rules

A check with `Auto-opportunity = Yes` creates a draft Opportunity when:
- result = FAIL; or
- result = WARNING and `max_penalty_weight >= 12`; and
- evidence confidence is MEDIUM or HIGH; and
- no open materially equivalent Opportunity exists.

CRITICAL findings always create an Opportunity and immediate attention event.

Deduplicate using check key + target resource + normalized remediation family.

---

# 11. Versioning

Never edit a scoring definition in place after it has been used by a finalized audit.

Changes create a new scoring-definition version.

Historical audit scores must remain reproducible from:
- scoring version;
- check version;
- raw normalized result;
- applicable status;
- penalty factor;
- category/overall weights.
