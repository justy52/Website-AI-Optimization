# Audit check coverage

Collector version `site-sample-deterministic-v2.0`. Scoring weights and thresholds are unchanged (`dv-score-v1.0`, Doc 26). Only the evidence the checks can read has changed.

## What changed

Before this collector, 27 of the 43 catalog checks returned `UNAVAILABLE` on every audit because the engine read only the homepage response. It now also reads:

- **A bounded same-site page sample.** Up to ten pages linked from the homepage (and from the XML sitemap when the homepage has few links): one contact page, one about page, up to three service pages, two location pages, and one each of FAQ, reviews, blog and policy pages. Requests stay on the saved hostname and its `www` counterpart, carry no query string, honour `robots.txt` for `*`, and skip sign-in, cart and account paths.
- **Static page signals** from each sampled page: viewport, forms and their fields, phone and email links, analytics and tag-manager tags, JSON-LD business entities, third-party profile links, question headings and word counts. No JavaScript runs and no form is submitted.
- **PageSpeed extras**: site-wide real-user INP and lab Total Blocking Time, used only as labeled fallbacks for `perf.inp`.
- **Google Places (optional)**: the business listing and nearby same-category listings, when `GOOGLE_PLACES_API_KEY` is set.

## What each audit can now answer

| Source | Checks |
| --- | --- |
| Homepage and page sample (always) | `perf.https`, `perf.mobile_render`, `perf.critical_functionality`, all eight `seo.*`, `local.business_identity`, `local.category_service_alignment`, `local.location_clarity`, `local.local_pages`, `local.structured_business_data`, all seven `conv.*`, all eight `ai.*`, `auth.reviews`, `auth.third_party_mentions`, `auth.credentials`, `auth.business_transparency`, `auth.expertise_content` |
| `GOOGLE_PAGESPEED_API_KEY` | `perf.lcp`, `perf.cls`, `perf.inp` |
| `GOOGLE_PLACES_API_KEY` | `local.gbp_presence`, `local.review_signal`, `auth.entity_consistency`; it also upgrades `local.category_service_alignment` and `auth.reviews` from on-site evidence to listing data |
| `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` | `auth.referring_domains` |

Without a Places key, `local.gbp_presence` returns a warning only when the site itself links to a Google Maps or Business Profile page; otherwise it stays unavailable. Nothing about a listing, review count or backlink is ever inferred.

## How to read the results

- Every result states what was examined. Rules that depend on static HTML say so, and say that forms or tags added only by JavaScript are not visible.
- Heuristic rules report `MEDIUM` evidence confidence. The lab proxy for INP reports `LOW`, which does not create an automatic opportunity.
- When no verified business fact is on file, `ai.identity_clarity`, `ai.service_clarity` and `ai.location_clarity` assess what the site itself declares. With verified facts they compare against those facts, as before.
- AI readiness is scored once `ai.answerability`, `ai.citability` and `ai.entity_consistency` have evidence. Reports for audits collected with an earlier collector keep that score withheld.
- Homepages larger than 5 MB and sitemaps larger than 1 MB are read up to that size instead of failing the audit. Previously a homepage over 1 MB turned every check into an error.

## Enabling Google Places

1. In Google Cloud, enable **Places API (New)** on a project with billing, and create an API key restricted to that API.
2. Add it to the deployment as `GOOGLE_PLACES_API_KEY` (server only).
3. Each audit then makes at most two Text Search requests: one for the business (name and locality only) and one for nearby listings in the same category. Review Google's current pricing and free usage caps before enabling.
4. Places requests are not yet recorded in the usage ledger or counted against the monthly provider ceiling. Track them in the Google Cloud console until that is added.

## Verifying against a live site

```bash
OPTIQ_AUDIT_LIVE_URLS="https://example.com/" corepack pnpm vitest run src/domain/audits/site-audit.live.test.ts
```

Set `OPTIQ_AUDIT_LIVE_OUT` to a file path to save the per-check output. The run contacts only the listed sites (and Google, when keys are supplied) and writes nothing to a database.

## Enabling referring domains (DataForSEO)

1. Create a DataForSEO account and make sure the **Backlinks API** is available on it. Check their current pricing and any minimum commitment first.
2. Add the API login and API password to the deployment as `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` (server only), then redeploy.
3. Each audit makes one bulk request for the audited domain and up to ten competitor domains. Only bare domain names are sent.

The check compares the site with a competitor median, as Doc 26 requires. It uses the active competitor targets saved on the website; when there are none it falls back to the websites of the nearby same-category listings Google Places returned, and reports medium confidence. With fewer than three competitor domains it reports the measured figure but stays unavailable. Like Places, these requests are not yet recorded in the usage ledger.
