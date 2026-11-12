import {
  analyzeHtml,
  firstSitemapUrl,
  robotsTxtBlocksAll,
  robotsTxtBlocksGooglebotHomepage,
  robotsTxtBlocksHomepage,
  type PageAnalysis,
} from "./page-analysis";
import {
  auditCheckDefinitions,
  calculateCategoryScore,
  calculateOverallScore,
  getAuditScoringDefinition,
  SCORING_DEFINITION_VERSION,
  scoreCategoryKeys,
  type AuditCheckDefinition,
  type CheckStatus,
  type ScoreCategoryKey,
} from "./scoring";
import type { EvidenceConfidence } from "@/domain/opportunities/generation";
import { collectBacklinkEvidence, type BacklinkCredentials, type BacklinkEvidence } from "./backlinks";
import { fetchSamplePages, selectSamplePages, type CrawlSummary, type SampledPage } from "./crawl";
import { evaluateDeclaredFactCheck, evaluateExtendedCheck, type ExtendedOutcome, type SiteContext, type SitePage } from "./extended-checks";
import { collectMobileLabEvidence, type MobileLabEvidence } from "./pagespeed";
import { collectPlacesEvidence, type PlacesEvidence } from "./places";
import { analyzeSignals, type PageSignals } from "./site-signals";
import {
  safeFetchText,
  type SafeFetchOptions,
  SafeFetchError,
  type SafeFetchResult,
} from "@/security/safe-fetch";

export type AuditEvidenceType =
  | "HTTP_RESPONSE"
  | "HTML"
  | "HEADER"
  | "ROBOTS_TXT"
  | "SITEMAP_XML"
  | "STRUCTURED_DATA"
  | "LINK"
  | "TEXT"
  | "ERROR";

export type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type AuditEvidenceItem = {
  id: string;
  evidenceType: AuditEvidenceType;
  sourceUrl?: string;
  sourceLabel: string;
  httpStatus?: number;
  contentHash?: string;
  excerpt?: string;
  metadata?: Record<string, unknown>;
};

export type Phase1CheckResult = {
  checkKey: string;
  checkVersion: string;
  category: ScoreCategoryKey;
  status: CheckStatus;
  severity: FindingSeverity | null;
  evidenceConfidence: EvidenceConfidence;
  maxPenaltyWeight: number;
  reason: string;
  evidenceRefs: string[];
  observedValue: Record<string, unknown>;
};

export type Phase1CategoryScore = ReturnType<typeof calculateCategoryScore>;
export type Phase1OverallScore = ReturnType<typeof calculateOverallScore>;

export type Phase1AuditResult = {
  scoringDefinitionVersion: typeof SCORING_DEFINITION_VERSION;
  checkCatalogVersion: typeof SCORING_DEFINITION_VERSION;
  evidence: AuditEvidenceItem[];
  checkResults: Phase1CheckResult[];
  categoryScores: Phase1CategoryScore[];
  overall: Phase1OverallScore;
  evidenceCoverage: number;
};

export type CollectedWebsiteEvidence = {
  canonicalUrl: string;
  page: SafeFetchResult | null;
  robots: SafeFetchResult | null;
  sitemap: SafeFetchResult | null;
  auxiliaryScopeLimited?: boolean;
  collectionError: string | null;
  pageAnalysis: PageAnalysis | null;
  mobileLab?: MobileLabEvidence | null;
  /** Static signals for the homepage; derived on demand when absent. */
  homepageSignals?: PageSignals | null;
  /** A bounded sample of same-site pages linked from the homepage or sitemap. */
  sampledPages?: SampledPage[];
  crawl?: CrawlSummary | null;
  places?: PlacesEvidence | null;
  placesConfigured?: boolean;
  backlinks?: BacklinkEvidence | null;
  backlinksConfigured?: boolean;
};

export type AuditCollectionOptions = {
  pagespeedApiKey?: string;
  placesApiKey?: string;
  backlinkCredentials?: BacklinkCredentials;
  /** Competitor domains the operator configured for this website. */
  competitorDomains?: string[];
  verifiedPublicFacts?: AuditBusinessContext["verifiedPublicFacts"];
  /** Injected in tests; defaults to the global fetch for provider APIs. */
  providerTransport?: typeof fetch;
};

export type AuditBusinessContext = {
  localSearchApplicable?: boolean;
  verifiedPublicFacts?: Array<{ id: string; factType: string; value: string }>;
};

// Record evaluator changes independently of the unchanged scoring weights.
export const AUDIT_COLLECTOR_VERSION = "site-sample-deterministic-v2.0";

const unsupportedCheckReasons: Record<string, string> = {
  "perf.lcp": "Core Web Vitals are unavailable until an official lab or field data source is connected.",
  "perf.inp": "No real-user or lab responsiveness measurement was available for this page.",
  "perf.cls": "Core Web Vitals are unavailable until an official lab or field data source is connected.",
  "auth.referring_domains": "Referring-domain counts require backlink data from a licensed provider, and none is configured. No link data was inferred.",
};

function excerpt(value: string | null | undefined, maxLength = 500) {
  return value?.replace(/\s+/g, " ").trim().slice(0, maxLength) || undefined;
}

function checkVersion(check: AuditCheckDefinition) {
  return `${check.key}@${SCORING_DEFINITION_VERSION}`;
}

function unavailable(check: AuditCheckDefinition, reason?: string): Phase1CheckResult {
  return {
    checkKey: check.key,
    checkVersion: checkVersion(check),
    category: check.category,
    status: "UNAVAILABLE",
    severity: null,
    evidenceConfidence: "LOW",
    maxPenaltyWeight: check.maxPenaltyWeight,
    reason: reason ?? unsupportedCheckReasons[check.key] ?? "No Phase 1 evidence source is available for this check.",
    evidenceRefs: [],
    observedValue: {},
  };
}

function errorResult(
  check: AuditCheckDefinition,
  reason: string,
): Phase1CheckResult {
  return {
    ...unavailable(check, reason),
    status: "ERROR",
    severity: "HIGH",
  };
}

function result(
  check: AuditCheckDefinition,
  status: CheckStatus,
  reason: string,
  options: {
    severity?: FindingSeverity | null;
    evidenceConfidence?: EvidenceConfidence;
    evidenceRefs?: string[];
    observedValue?: Record<string, unknown>;
  } = {},
): Phase1CheckResult {
  const evidenceRefs = options.evidenceRefs ?? [];
  const observedValue = options.observedValue ?? {};
  const evidenceConfidence =
    options.evidenceConfidence ??
    (evidenceRefs.length > 0
      ? "HIGH"
      : Object.keys(observedValue).length > 0
        ? "MEDIUM"
        : "LOW");

  return {
    checkKey: check.key,
    checkVersion: checkVersion(check),
    category: check.category,
    status,
    severity: options.severity ?? (status === "FAIL" ? "HIGH" : status === "WARNING" ? "MEDIUM" : null),
    evidenceConfidence,
    maxPenaltyWeight: check.maxPenaltyWeight,
    reason,
    evidenceRefs,
    observedValue,
  };
}

type AuditFetchTransport = Pick<SafeFetchOptions, "requestImpl" | "lookupHost">;

async function collectOptional(url: string, options: SafeFetchOptions) {
  try {
    // A sitemap can be tens of megabytes. Only its opening is needed to
    // recognise it, so read a bounded prefix rather than calling it missing.
    const response = await safeFetchText(url, { ...options, maxBytes: 1_000_000, allowTruncated: true, timeoutMs: 6_000 });
    return { response, outOfScope: false };
  } catch (error) {
    return { response: null, outOfScope: error instanceof SafeFetchError && error.code === "OUT_OF_SCOPE" };
  }
}

export async function collectWebsiteEvidence(
  canonicalUrl: string,
  options: AuditCollectionOptions = {},
  transport: AuditFetchTransport = {},
): Promise<CollectedWebsiteEvidence> {
  try {
    const canonical = new URL(canonicalUrl);
    const canonicalHost = canonical.hostname.replace(/\.$/, "");
    const counterpart = canonicalHost.startsWith("www.") ? canonicalHost.slice(4) : `www.${canonicalHost}`;
    const allowTarget = (target: URL, from: URL) =>
      [canonicalHost, counterpart].includes(target.hostname.replace(/\.$/, "")) &&
      (target.protocol === "https:" || (target.protocol === "http:" && from.protocol === "http:"));

    const page = await safeFetchText(canonicalUrl, {
      ...transport,
      isTargetAllowed: (target, from) => allowTarget(target, from ?? canonical),
      // Page-builder homepages routinely exceed 1 MB of HTML; a smaller cap
      // turned every check for those sites into an error.
      maxBytes: 5_000_000,
      allowTruncated: true,
      timeoutMs: 10_000,
    });
    const finalPage = new URL(page.finalUrl);
    const origin = finalPage.origin;
    const auxiliaryFetch: SafeFetchOptions = {
      ...transport,
      isTargetAllowed: (target, from) => allowTarget(target, from ?? finalPage),
    };
    const labPromise = options.pagespeedApiKey ? collectMobileLabEvidence(page.finalUrl, options.pagespeedApiKey, options.providerTransport) : Promise.resolve(null);
    const robots = await collectOptional(`${origin}/robots.txt`, auxiliaryFetch);
    const sitemapUrl = firstSitemapUrl(robots.response?.bodyText) ?? `${origin}/sitemap.xml`;
    const sitemap = await collectOptional(sitemapUrl, auxiliaryFetch);
    const pageAnalysis = analyzeHtml(page.bodyText);
    const homepageSignals = analyzeSignals(page.bodyText, page.finalUrl);

    // Sample a few same-site pages. A non-2xx homepage is not worth sampling from.
    let sampledPages: SampledPage[] = [];
    let crawl: CrawlSummary | null = null;
    if (successful(page)) {
      const robotsText = successful(robots.response) ? robots.response?.bodyText : null;
      const selection = selectSamplePages(page.finalUrl, pageAnalysis.anchors, appearsToBeSitemap(sitemap.response) ? sitemap.response?.bodyText : null,
        (hostname) => [canonicalHost, counterpart].includes(hostname.replace(/\.$/, "")));
      const fetchedSample = await fetchSamplePages(selection.candidates, robotsText, auxiliaryFetch);
      sampledPages = fetchedSample.pages;
      crawl = {
        candidateCount: selection.candidateCount,
        attempted: fetchedSample.pages.length,
        fetched: fetchedSample.pages.filter((sampled) => sampled.analysis).length,
        skippedByRobots: fetchedSample.skippedByRobots,
        source: selection.usedSitemap ? "homepage_links_and_sitemap" : "homepage_links",
      };
    }

    let places: PlacesEvidence | null = null;
    if (options.placesApiKey && successful(page)) {
      const facts = options.verifiedPublicFacts ?? [];
      const fact = (types: string[]) => facts.find((item) => types.includes(item.factType) && item.value.trim().length >= 3)?.value.trim() ?? null;
      const entity = homepageSignals.entities.find((item) => item.name && !item.types.includes("WebSite")) ?? null;
      const businessName = fact(["business_name", "display_name", "brand_name"]) ?? entity?.name ?? homepageSignals.ogSiteName;
      const locality = fact(["location", "service_area"]) ?? (entity?.locality ? [entity.locality, entity.region].filter(Boolean).join(", ") : null) ?? homepageSignals.locationMentions[0] ?? null;
      if (businessName) {
        places = await collectPlacesEvidence({
          businessName, locality, websiteHost: finalPage.hostname,
          phones: [...new Set([homepageSignals, ...sampledPages.map((sampled) => sampled.signals)].flatMap((signals) => signals?.phones ?? []))],
        }, options.placesApiKey, options.providerTransport);
      }
    }
    let backlinks: BacklinkEvidence | null = null;
    if (options.backlinkCredentials && successful(page)) {
      // Prefer the operator's competitor set; otherwise use the websites of
      // the nearby same-category listings Google returned.
      const configured = options.competitorDomains ?? [];
      const listed = (places?.competitors ?? []).flatMap((competitor) => competitor.websiteHost ? [competitor.websiteHost] : []);
      backlinks = await collectBacklinkEvidence({
        siteDomain: finalPage.hostname,
        competitorDomains: configured.length ? configured : listed,
        competitorSource: configured.length ? "configured" : listed.length ? "google_listings" : "none",
      }, options.backlinkCredentials, options.providerTransport);
    }
    const mobileLab = await labPromise;

    return {
      canonicalUrl,
      page,
      robots: robots.response,
      sitemap: sitemap.response,
      auxiliaryScopeLimited: robots.outOfScope || sitemap.outOfScope,
      collectionError: null,
      pageAnalysis,
      mobileLab,
      homepageSignals,
      sampledPages,
      crawl,
      places,
      placesConfigured: Boolean(options.placesApiKey),
      backlinks,
      backlinksConfigured: Boolean(options.backlinkCredentials),
    };
  } catch (error) {
    return {
      canonicalUrl,
      page: null,
      robots: null,
      sitemap: null,
      collectionError:
        error instanceof SafeFetchError ? error.message : "Website evidence collection failed.",
      pageAnalysis: null,
    };
  }
}

function hasBusinessStructuredData(analysis: PageAnalysis): boolean {
  const businessTypes = new Set([
    "LocalBusiness",
    "Organization",
    "Corporation",
    "ProfessionalService",
  ]);

  return analysis.structuredData.some(
    (item) => item.valid && item.types.some((type) => businessTypes.has(type)),
  );
}

function hasInvalidStructuredData(analysis: PageAnalysis): boolean {
  return analysis.structuredData.some((item) => !item.valid);
}

function successful(response: SafeFetchResult | null): boolean {
  return Boolean(response && response.status >= 200 && response.status < 300);
}

function appearsToBeSitemap(response: SafeFetchResult | null): boolean {
  return successful(response) && /<(?:\w+:)?(?:urlset|sitemapindex)\b/i.test(response?.bodyText ?? "");
}

function hasPrimaryCta(analysis: PageAnalysis): boolean {
  const labels = [...analysis.anchors.map((anchor) => anchor.text), ...analysis.buttons];
  if (labels.some((label) => /^request\s+(?:an\s+)?audit(?:\s*[↗→])?$/i.test(label.trim()))) return true;

  const text = labels.join(" ").toLowerCase();
  if (/\b(?:get|request)\s+(?:(?:a|an|your)\s+)?(?:(?:instant|free|online)\s+)?(?:quote|estimate)\b/i.test(text)) return true;

  return [
    "contact",
    "call",
    "schedule",
    "book",
    "request a quote",
    "get a quote",
    "free estimate",
    "get started",
  ].some((phrase) => text.includes(phrase));
}

function hasContactFallback(analysis: PageAnalysis): boolean {
  return analysis.anchors.some((anchor) =>
    /^(tel:|mailto:)|contact/i.test(anchor.href) || /contact|email|phone/i.test(anchor.text),
  );
}

function sameHostInternalLinks(analysis: PageAnalysis, pageUrl: string) {
  const page = new URL(pageUrl);

  return analysis.anchors.flatMap((anchor) => {
    try {
      const url = new URL(anchor.href, page);

      if (!["http:", "https:"].includes(url.protocol) || url.hostname !== page.hostname) {
        return [];
      }

      return [{ href: url.toString(), text: anchor.text }];
    } catch {
      return [];
    }
  });
}

const usStates: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};

function factMatchVariants(value: string, isLocation: boolean): string[] {
  if (!isLocation) return [value];
  const parts = value.split(",").map(part => part.trim());
  if (parts.length !== 2 || parts[0].length < 3) return [value];
  const state = parts[1].toLowerCase();
  const name = Object.keys(usStates).find(key => key === state || usStates[key].toLowerCase() === state);
  return name ? [value, `${parts[0]} ${name}`, `${parts[0]} ${usStates[name]}`] : [value];
}

export function sampledPageRef(index: number): string {
  return `sampled-page-${index + 1}`;
}

function buildSiteContext(collected: CollectedWebsiteEvidence, businessContext: AuditBusinessContext): SiteContext | null {
  const page = collected.page;
  const analysis = collected.pageAnalysis;
  if (!page || !analysis || !successful(page)) return null;
  const home: SitePage = { ref: "homepage-html", url: page.finalUrl, kind: "home", analysis, signals: collected.homepageSignals ?? analyzeSignals(page.bodyText, page.finalUrl) };
  const sampled = collected.sampledPages ?? [];
  const usable = sampled.flatMap((item, index): SitePage[] => item.analysis && item.signals ? [{ ref: sampledPageRef(index), url: item.url, kind: item.kind, analysis: item.analysis, signals: item.signals }] : []);
  return {
    home,
    pages: [home, ...usable],
    failed: sampled.filter((item) => !item.analysis),
    crawl: collected.crawl ?? null,
    facts: (businessContext.verifiedPublicFacts ?? []).filter((fact) => fact.value.trim().length >= 3 && fact.value.trim().length <= 200),
    places: collected.places ?? null,
    placesConfigured: collected.placesConfigured ?? false,
    backlinks: collected.backlinks ?? null,
    backlinksConfigured: collected.backlinksConfigured ?? false,
    siteHost: new URL(page.finalUrl).hostname.replace(/^www\./, ""),
    homeHasPrimaryCta: hasPrimaryCta(analysis),
  };
}

function fromOutcome(check: AuditCheckDefinition, outcome: ExtendedOutcome): Phase1CheckResult {
  if (outcome.status === "UNAVAILABLE") return unavailable(check, outcome.reason);
  return result(check, outcome.status, outcome.reason, {
    severity: outcome.severity,
    evidenceConfidence: outcome.evidenceConfidence,
    evidenceRefs: outcome.evidenceRefs,
    observedValue: outcome.observedValue,
  });
}

function evaluateImplementedCheck(
  check: AuditCheckDefinition,
  collected: CollectedWebsiteEvidence,
  businessContext: AuditBusinessContext,
  site: SiteContext | null,
): Phase1CheckResult {
  const analysis = collected.pageAnalysis;
  const page = collected.page;

  if (!page || !analysis) {
    if (check.key === "perf.https") {
      const protocol = new URL(collected.canonicalUrl).protocol;

      if (protocol !== "https:") {
        return result(check, "FAIL", "The saved canonical URL does not use HTTPS.", {
          severity: "CRITICAL",
        });
      }
    }

    return errorResult(
      check,
      collected.collectionError ?? "Homepage evidence was not available.",
    );
  }

  switch (check.key) {
    case "perf.inp": {
      const value = collected.mobileLab?.fieldInpMs;
      if (value == null) {
        // Prefer real-user data for the whole origin, then a labeled lab proxy.
        const origin = collected.mobileLab?.originFieldInpMs;
        if (origin != null) {
          return result(check, origin <= 200 ? "PASS" : origin > 500 ? "FAIL" : "WARNING", `Google's Chrome User Experience Report measured a 75th-percentile mobile INP of ${origin} ms across the whole website over the rolling 28-day period. Page-level data for the homepage was not available, so this is a site-wide figure.`, {
            evidenceConfidence: "MEDIUM", evidenceRefs: ["pagespeed-field"], observedValue: { value: origin, unit: "ms", percentile: 75, scope: "origin", dataType: "field", fetchedAt: collected.mobileLab?.fetchedAt },
          });
        }
        const tbt = collected.mobileLab?.tbtMs;
        if (tbt != null) {
          return result(check, tbt <= 200 ? "PASS" : tbt > 600 ? "FAIL" : "WARNING", `No real-user INP data exists for this site, so INP itself could not be measured. As a lab proxy, one simulated mobile PageSpeed test measured Total Blocking Time of ${Math.round(tbt)} ms (good is 200 ms or less). This is lab data, not INP and not real-user data.`, {
            evidenceConfidence: "LOW", evidenceRefs: ["pagespeed-mobile"], observedValue: { value: Math.round(tbt), unit: "ms", metric: "total-blocking-time", dataType: "lab proxy", fetchedAt: collected.mobileLab?.fetchedAt },
          });
        }
        return unavailable(check, "No real-user INP data exists for this page or site, and no lab responsiveness measurement was returned. Nothing was inferred.");
      }
      return result(check, value <= 200 ? "PASS" : value > 500 ? "FAIL" : "WARNING", `Google's Chrome User Experience Report measured a 75th-percentile mobile INP of ${value} ms for this homepage over the rolling 28-day field-data period.`, {
        evidenceRefs: ["pagespeed-field"], observedValue: { value, unit: "ms", percentile: 75, scope: "homepage", dataType: "field", fetchedAt: collected.mobileLab?.fetchedAt },
      });
    }
    case "ai.identity_clarity":
    case "ai.service_clarity":
    case "ai.location_clarity": {
      const types = check.key === "ai.identity_clarity" ? ["business_name", "display_name", "brand_name"]
        : check.key === "ai.service_clarity" ? ["service"] : ["location", "service_area"];
      const facts = (businessContext.verifiedPublicFacts ?? []).filter(f => types.includes(f.factType) && f.value.trim().length >= 3 && f.value.trim().length <= 200);
      if (!successful(page)) return unavailable(check, "A successful homepage response is required for this check.");
      if (!facts.length) {
        // No verified fact on file: assess what the site itself declares.
        const declared = site ? evaluateDeclaredFactCheck(check.key, site) : null;
        return declared ? fromOutcome(check, declared) : unavailable(check, "A successful homepage response is required for this check.");
      }
      const normalize = (s: string) => ` ${s.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
      const visible = normalize(analysis.visibleText);
      const isLocation = check.key === "ai.location_clarity";
      const matched = facts.find(f => factMatchVariants(f.value, isLocation).some(variant => visible.includes(normalize(variant))));
      const selected = matched ?? facts[0];
      const label = check.key === "ai.identity_clarity" ? "business name" : check.key === "ai.service_clarity" ? "service" : "location or service area";
      return result(check, matched ? "PASS" : "WARNING", matched
        ? `The fetched homepage text contains the verified ${label}${isLocation ? " or its equivalent US state abbreviation" : ""}. This is a text check, not proof of AI visibility or overall clarity.`
        : `The verified ${label}${isLocation ? " or its equivalent US state abbreviation" : ""} was not found in the fetched homepage text. Review the page; alternate wording, dynamic content, or other pages may contain it.`, {
        evidenceRefs: ["homepage-html", `business-fact:${selected.id}`],
        observedValue: { factId: selected.id, exactMatch: !!matched && visible.includes(normalize(selected.value)), equivalentStateMatch: !!matched && isLocation && !visible.includes(normalize(selected.value)), scope: "fetched homepage text only" },
      });
    }
    case "perf.lcp":
    case "perf.cls": {
      const lab = collected.mobileLab;
      const value = check.key === "perf.lcp" ? lab?.lcpMs : lab?.cls;
      if (value == null) return unavailable(check, "A simulated mobile PageSpeed measurement was not available; no field data was inferred.");
      const isLcp = check.key === "perf.lcp";
      const good = isLcp ? value <= 2500 : value <= 0.1;
      const poor = isLcp ? value > 4000 : value > 0.25;
      const label = isLcp ? `LCP ${(value / 1000).toFixed(2)} seconds` : `CLS ${value.toFixed(3)}`;
      return result(check, good ? "PASS" : poor ? "FAIL" : "WARNING", `One simulated mobile PageSpeed test measured ${label}; this is lab data, not real-user field data.`, {
        evidenceRefs: ["pagespeed-mobile"], observedValue: { value, unit: isLcp ? "ms" : "score", source: "Google PageSpeed Insights mobile lab", lighthouseVersion: lab?.lighthouseVersion, fetchedAt: lab?.fetchedAt },
      });
    }

    case "perf.https": {
      const savedProtocol = new URL(collected.canonicalUrl).protocol;
      const finalProtocol = new URL(page.finalUrl).protocol;

      if (savedProtocol !== "https:" || finalProtocol !== "https:") {
        return result(check, "FAIL", "The audited page did not resolve over HTTPS.", {
          severity: "CRITICAL",
          evidenceRefs: ["homepage"],
          observedValue: { savedProtocol, finalProtocol },
        });
      }

      return result(check, "PASS", "The audited page resolved over HTTPS.", {
        evidenceRefs: ["homepage"],
      });
    }

    case "seo.indexability": {
      const xRobots = page.headers["x-robots-tag"]?.toLowerCase() ?? "";
      const hasNoindex =
        analysis.robotsDirectives.includes("noindex") || xRobots.includes("noindex");

      if (page.status < 200 || page.status >= 300) {
        return result(check, "FAIL", "The homepage did not return a successful HTTP status.", {
          severity: "CRITICAL",
          evidenceRefs: ["homepage"],
          observedValue: { httpStatus: page.status },
        });
      }

      if (hasNoindex || (successful(collected.robots) && robotsTxtBlocksGooglebotHomepage(collected.robots?.bodyText))) {
        return result(check, "FAIL", "The homepage has a noindex directive or its robots.txt rules block Googlebot from crawling it.", {
          severity: "CRITICAL",
          evidenceRefs: ["homepage", "robots"],
          observedValue: { hasNoindex },
        });
      }

      if (!collected.robots || (collected.robots.status !== 404 && !successful(collected.robots))) {
        return result(check, "WARNING", "The homepage returned 2xx without a noindex directive, but robots.txt could not be verified.", {
          evidenceRefs: ["homepage"],
          observedValue: { robotsStatus: collected.robots?.status ?? null },
        });
      }

      return result(check, "PASS", "The homepage returned 2xx without noindex/blocking signals.", {
        evidenceRefs: collected.robots ? ["homepage", "robots"] : ["homepage"],
      });
    }

    case "seo.robots_sitemap": {
      const robotsStatus = collected.robots?.status;
      const sitemapStatus = collected.sitemap?.status;
      const robotsBlocks = successful(collected.robots) && robotsTxtBlocksAll(collected.robots?.bodyText);
      const sitemapDeclared = successful(collected.robots) && Boolean(firstSitemapUrl(collected.robots?.bodyText));
      const sitemapLooksValid = appearsToBeSitemap(collected.sitemap);

      if (robotsBlocks) {
        return result(check, "WARNING", "A wildcard robots.txt group disallows the root without an allow rule. Review merged groups and crawler-specific rules before drawing conclusions.", {
          evidenceRefs: ["robots"],
        });
      }

      if (collected.auxiliaryScopeLimited) {
        return unavailable(check, "A robots.txt or sitemap destination was outside the approved website scope.");
      }

      if (robotsStatus && robotsStatus >= 200 && robotsStatus < 300) {
        if (sitemapLooksValid) {
          return result(check, "PASS", "robots.txt is reachable and the sitemap response contains an XML sitemap root.", {
            evidenceRefs: ["robots", "sitemap"],
            observedValue: { sitemapDeclared },
          });
        }

        if (sitemapDeclared && !collected.sitemap) {
          return result(check, "WARNING", "robots.txt is reachable and declares a sitemap, but the sitemap did not respond within the audit's time limit, so it could not be confirmed.", {
            evidenceConfidence: "LOW",
            evidenceRefs: ["robots"],
            observedValue: { sitemapDeclared, sitemapStatus },
          });
        }

        return result(check, "WARNING", "robots.txt is reachable, but a recognizable XML sitemap was not found.", {
          evidenceRefs: ["robots"],
          observedValue: { sitemapDeclared, sitemapStatus },
        });
      }

      if (sitemapLooksValid) {
        return result(check, "WARNING", "A sitemap was reachable, but robots.txt was not.", {
          evidenceRefs: ["sitemap"],
          observedValue: { robotsStatus },
        });
      }

      if (!collected.robots && !collected.sitemap) {
        return unavailable(check, "Neither robots.txt nor the sitemap could be checked.");
      }

      return result(check, "WARNING", "A robots.txt file and recognizable XML sitemap could not both be confirmed.", {
        evidenceRefs: [collected.robots ? "robots" : null, collected.sitemap ? "sitemap" : null].filter((ref): ref is string => ref !== null),
        observedValue: { robotsStatus, sitemapStatus },
      });
    }

    case "seo.canonical": {
      if (analysis.canonicalUrls.length === 0) {
        return result(check, "WARNING", "No canonical link was found on the homepage.", {
          evidenceRefs: ["homepage-html"],
        });
      }

      if (analysis.canonicalUrls.length > 1) {
        return result(check, "FAIL", "Multiple canonical links were found on the homepage.", {
          evidenceRefs: ["homepage-html"],
          observedValue: { canonicalUrls: analysis.canonicalUrls },
        });
      }

      let canonical: URL;
      try {
        canonical = new URL(analysis.canonicalUrls[0], page.finalUrl);
        if (!["http:", "https:"].includes(canonical.protocol)) throw new Error("Invalid canonical protocol");
      } catch {
        return result(check, "WARNING", "The homepage canonical link is not a valid HTTP or HTTPS URL.", {
          evidenceRefs: ["homepage-html"],
          observedValue: { canonical: analysis.canonicalUrls[0] },
        });
      }
      const final = new URL(page.finalUrl);

      if (canonical.hostname !== final.hostname) {
        return result(check, "WARNING", "The canonical points to a different host.", {
          evidenceRefs: ["homepage-html"],
          observedValue: { canonical: canonical.toString(), final: final.toString() },
        });
      }

      return result(check, "PASS", "A single same-host canonical link was found.", {
        evidenceRefs: ["homepage-html"],
        observedValue: { canonical: canonical.toString() },
      });
    }

    case "seo.title": {
      const title = analysis.title?.trim();

      if (!title) {
        return result(check, "FAIL", "No HTML title was found.", {
          evidenceRefs: ["homepage-html"],
        });
      }

      if (/^(home|homepage|untitled)$/i.test(title)) {
        return result(check, "WARNING", "The HTML title appears generic.", {
          evidenceRefs: ["homepage-html"],
          observedValue: { title },
        });
      }

      return result(check, "PASS", "A non-empty HTML title was found.", {
        evidenceRefs: ["homepage-html"],
        observedValue: { title },
      });
    }

    case "seo.meta_description": {
      if (!analysis.metaDescription) {
        return result(check, "WARNING", "No meta description was found.", {
          evidenceRefs: ["homepage-html"],
        });
      }

      return result(check, "PASS", "A meta description was found.", {
        evidenceRefs: ["homepage-html"],
        observedValue: { metaDescription: analysis.metaDescription },
      });
    }

    case "seo.heading_structure": {
      if (analysis.h1.length === 0) {
        return result(check, "WARNING", "No H1 heading was found on the homepage.", {
          evidenceRefs: ["homepage-html"],
        });
      }

      if (analysis.h1.length > 1) {
        return result(check, "WARNING", "Multiple H1 headings were found on the homepage.", {
          evidenceRefs: ["homepage-html"],
          observedValue: { h1Count: analysis.h1.length },
        });
      }

      return result(check, "PASS", "A single H1 heading was found on the homepage.", {
        evidenceRefs: ["homepage-html"],
        observedValue: { h1: analysis.h1[0] },
      });
    }

    case "seo.internal_links": {
      const internalLinks = sameHostInternalLinks(analysis, page.finalUrl);
      const pageUrl = new URL(page.finalUrl);
      const navigationalLinks = internalLinks.filter((link) => {
        const linkUrl = new URL(link.href);
        return (
          linkUrl.pathname !== pageUrl.pathname ||
          linkUrl.search !== pageUrl.search ||
          !linkUrl.hash
        );
      });

      if (navigationalLinks.length > 0) {
        return result(check, "PASS", "Same-host internal links were found in the homepage HTML.", {
          evidenceRefs: ["homepage-html"],
          observedValue: { internalLinkCount: internalLinks.length },
        });
      }

      if (internalLinks.length > 0) {
        return result(check, "WARNING", "Only same-page internal links were found on the homepage.", {
          evidenceRefs: ["homepage-html"],
          observedValue: { internalLinkCount: internalLinks.length },
        });
      }

      return result(check, "FAIL", "No same-host internal links were found in the homepage HTML.", {
        evidenceRefs: ["homepage-html"],
      });
    }

    case "conv.primary_cta": {
      if (hasPrimaryCta(analysis)) {
        return result(check, "PASS", "A primary call-to-action phrase was found in links or buttons.", {
          evidenceRefs: ["homepage-html"],
        });
      }

      return result(check, "FAIL", "The automated check found no supported call-to-action label in the fetched homepage links or buttons. Review the page for alternate wording or controls.", {
        evidenceRefs: ["homepage-html"],
      });
    }

    case "conv.mobile_contact": {
      const hasTelephone = analysis.anchors.some((anchor) =>
        anchor.href.toLowerCase().startsWith("tel:"),
      );

      if (hasTelephone) {
        return result(check, "PASS", "A click-to-call telephone link was found.", {
          evidenceRefs: ["homepage-html"],
        });
      }

      if (hasContactFallback(analysis)) {
        return result(check, "WARNING", "A contact path was found, but no click-to-call link was detected.", {
          evidenceRefs: ["homepage-html"],
        });
      }

      if (site?.pages.some((sampled) => sampled.signals.telLinks.length > 0)) {
        return result(check, "WARNING", "A click-to-call link exists on another sampled page, but not on the homepage.", {
          evidenceRefs: ["homepage-html"],
        });
      }

      if (site) {
        return result(check, "FAIL", "No click-to-call link, email link or contact page link was found in the fetched homepage or sampled pages. Controls drawn only by JavaScript are not visible to this static check.", {
          evidenceConfidence: "MEDIUM",
          evidenceRefs: ["homepage-html"],
        });
      }

      return unavailable(
        check,
        "No deterministic mobile-contact evidence was available without a browser workflow.",
      );
    }

    case "local.structured_business_data":
    case "ai.structured_data": {
      if (hasInvalidStructuredData(analysis)) {
        return result(check, "FAIL", "A JSON-LD block was present but could not be parsed.", {
          evidenceRefs: ["homepage-html"],
        });
      }

      if (hasBusinessStructuredData(analysis)) {
        return result(check, "PASS", "Business or organization structured data was found.", {
          evidenceRefs: ["homepage-html"],
        });
      }

      return result(check, "WARNING", "No business or organization structured data was found on the homepage.", {
        evidenceRefs: ["homepage-html"],
      });
    }

    case "ai.crawlability": {
      if (page.status < 200 || page.status >= 300) {
        return result(check, "FAIL", "The homepage did not return crawlable 2xx content.", {
          evidenceRefs: ["homepage"],
          observedValue: { httpStatus: page.status },
        });
      }

      if (analysis.visibleText.length < 25) {
        return result(check, "FAIL", "The homepage had little crawlable text in the fetched HTML.", {
          evidenceRefs: ["homepage-html"],
          observedValue: { visibleTextLength: analysis.visibleText.length },
        });
      }

      if (successful(collected.robots) && robotsTxtBlocksHomepage(collected.robots?.bodyText, "oai-searchbot")) {
        return result(check, "WARNING", "The homepage robots.txt rules block OAI-SearchBot. Review whether excluding this OpenAI search crawler is intentional; this does not describe GPTBot's separate training setting.", {
          evidenceRefs: ["homepage-html", "robots"], observedValue: { visibleTextLength: analysis.visibleText.length, oaiSearchBotBlocked: true },
        });
      }

      if (!collected.robots || (collected.robots.status !== 404 && !successful(collected.robots))) {
        return result(check, "WARNING", "Text was found in the fetched homepage HTML, but robots.txt could not be checked for OAI-SearchBot. This does not prove that any crawler can access or index the page.", {
          evidenceRefs: ["homepage-html"], observedValue: { visibleTextLength: analysis.visibleText.length, robotsStatus: collected.robots?.status ?? null },
        });
      }

      if (analysis.visibleText.length < 100) {
        return result(check, "WARNING", "The homepage had limited crawlable text in the fetched HTML.", {
          evidenceRefs: ["homepage-html"],
          observedValue: { visibleTextLength: analysis.visibleText.length },
        });
      }

      return result(check, "PASS", "The fetched homepage HTML contained text, and the checked robots.txt rules did not block OAI-SearchBot. This does not establish access through a firewall or inclusion in search results.", {
        evidenceRefs: ["homepage-html", ...(successful(collected.robots) ? ["robots"] : [])],
        observedValue: { visibleTextLength: analysis.visibleText.length, oaiSearchBotBlocked: false },
      });
    }

    default: {
      const outcome = site ? evaluateExtendedCheck(check.key, site) : null;
      if (outcome) return fromOutcome(check, outcome);
      if (!site && !successful(page) && check.key !== "auth.referring_domains") {
        return unavailable(check, `The homepage returned HTTP ${page.status}, so this check could not be assessed.`);
      }
      return unavailable(check);
    }
  }
}

function evidenceItems(collected: CollectedWebsiteEvidence): AuditEvidenceItem[] {
  const items: AuditEvidenceItem[] = [];

  if (collected.mobileLab && (collected.mobileLab.lcpMs != null || collected.mobileLab.cls != null || collected.mobileLab.tbtMs != null)) items.push({ id: "pagespeed-mobile", evidenceType: "TEXT", sourceUrl: collected.mobileLab.requestedUrl, sourceLabel: "Google PageSpeed Insights: simulated mobile lab", metadata: { requestedUrl: collected.mobileLab.requestedUrl, fetchedAt: collected.mobileLab.fetchedAt, lighthouseVersion: collected.mobileLab.lighthouseVersion, lcpMs: collected.mobileLab.lcpMs, cls: collected.mobileLab.cls, tbtMs: collected.mobileLab.tbtMs ?? null, dataType: "lab" } });
  if (collected.mobileLab?.fieldInpMs != null) items.push({ id: "pagespeed-field", evidenceType: "TEXT", sourceUrl: collected.mobileLab.requestedUrl, sourceLabel: "Google CrUX: homepage mobile field data", metadata: { fieldInpMs: collected.mobileLab.fieldInpMs, percentile: 75, period: "rolling 28 days", dataType: "field", fetchedAt: collected.mobileLab.fetchedAt } });
  else if (collected.mobileLab?.originFieldInpMs != null) items.push({ id: "pagespeed-field", evidenceType: "TEXT", sourceUrl: collected.mobileLab.requestedUrl, sourceLabel: "Google CrUX: site-wide mobile field data", metadata: { originFieldInpMs: collected.mobileLab.originFieldInpMs, percentile: 75, period: "rolling 28 days", scope: "origin", dataType: "field", fetchedAt: collected.mobileLab.fetchedAt } });

  if (collected.page) {
    items.push({
      id: "homepage",
      evidenceType: "HTTP_RESPONSE",
      sourceUrl: collected.page.finalUrl,
      sourceLabel: "Homepage HTTP response",
      httpStatus: collected.page.status,
      contentHash: collected.page.contentHash,
      metadata: { redirects: collected.page.redirects, headers: collected.page.headers },
    });
    items.push({
      id: "homepage-html",
      evidenceType: "HTML",
      sourceUrl: collected.page.finalUrl,
      sourceLabel: "Homepage HTML",
      httpStatus: collected.page.status,
      contentHash: collected.page.contentHash,
      excerpt: excerpt(collected.page.bodyText),
    });
  } else {
    items.push({
      id: "collection-error",
      evidenceType: "ERROR",
      sourceUrl: collected.canonicalUrl,
      sourceLabel: "Homepage collection error",
      excerpt: collected.collectionError ?? "Homepage evidence collection failed.",
    });
  }

  if (collected.robots) {
    items.push({
      id: "robots",
      evidenceType: "ROBOTS_TXT",
      sourceUrl: collected.robots.finalUrl,
      sourceLabel: "robots.txt",
      httpStatus: collected.robots.status,
      contentHash: collected.robots.contentHash,
      excerpt: excerpt(collected.robots.bodyText),
    });
  }

  if (collected.sitemap) {
    items.push({
      id: "sitemap",
      evidenceType: "SITEMAP_XML",
      sourceUrl: collected.sitemap.finalUrl,
      sourceLabel: "XML sitemap",
      httpStatus: collected.sitemap.status,
      contentHash: collected.sitemap.contentHash,
      excerpt: excerpt(collected.sitemap.bodyText),
    });
  }

  (collected.sampledPages ?? []).forEach((sampled, index) => {
    items.push({
      id: sampledPageRef(index),
      evidenceType: sampled.analysis ? "HTML" : "ERROR",
      sourceUrl: sampled.url,
      sourceLabel: `Sampled page (${sampled.kind})`,
      httpStatus: sampled.status ?? undefined,
      contentHash: sampled.contentHash ?? undefined,
      excerpt: sampled.analysis ? excerpt(sampled.analysis.title ?? sampled.analysis.h1[0] ?? "") : sampled.error ?? `HTTP ${sampled.status}`,
      metadata: { kind: sampled.kind, linkText: sampled.linkText, words: sampled.signals?.wordCount ?? null },
    });
  });
  if (collected.crawl) {
    items.push({ id: "page-sample", evidenceType: "TEXT", sourceUrl: collected.page?.finalUrl, sourceLabel: "Same-site page sample", metadata: { ...collected.crawl } });
  }
  if (collected.backlinks) {
    items.push({
      id: "backlinks",
      evidenceType: "TEXT",
      sourceLabel: "DataForSEO referring domains",
      excerpt: collected.backlinks.referringDomains === null ? "No figure reported for the audited domain" : `${collected.backlinks.referringDomains} referring domains`,
      metadata: {
        provider: collected.backlinks.provider, fetchedAt: collected.backlinks.fetchedAt, referringDomains: collected.backlinks.referringDomains,
        competitorSource: collected.backlinks.competitorSource, competitorsCompared: collected.backlinks.competitors.length,
        competitorMedian: collected.backlinks.competitorMedian, competitors: collected.backlinks.competitors,
      },
    });
  }
  if (collected.places) {
    const listing = collected.places.listing;
    items.push({
      id: "places",
      evidenceType: "TEXT",
      sourceLabel: "Google Places listing lookup",
      excerpt: listing ? `${listing.name}${listing.address ? `, ${listing.address}` : ""}` : "No matching listing",
      metadata: {
        query: collected.places.query, fetchedAt: collected.places.fetchedAt, matchBasis: collected.places.matchBasis,
        candidateCount: collected.places.candidateCount, reviewCount: listing?.reviewCount ?? null, rating: listing?.rating ?? null,
        primaryType: listing?.primaryTypeLabel ?? listing?.primaryType ?? null, competitorMedianReviews: collected.places.competitorMedianReviews,
        competitorsCompared: collected.places.competitors.length,
      },
    });
  }

  return items;
}

export function evaluatePhase1Checks(
  collected: CollectedWebsiteEvidence,
  businessContext: AuditBusinessContext = {},
): Phase1AuditResult {
  getAuditScoringDefinition(SCORING_DEFINITION_VERSION);

  const localSearchApplicable = businessContext.localSearchApplicable ?? true;
  const site = buildSiteContext(collected, businessContext);
  const checkResults = auditCheckDefinitions.map((check) => {
    if (!localSearchApplicable && check.category === "localSearch") {
      return result(
        check,
        "NOT_APPLICABLE",
        "Local Search was marked not applicable for this audit target.",
        { severity: null },
      );
    }

    return evaluateImplementedCheck(check, collected, businessContext, site);
  });
  const categoryScores = scoreCategoryKeys.map((category) => {
    const score = calculateCategoryScore(category, checkResults);
    // Literal homepage matches are useful observations, but they cannot by
    // themselves justify an AI-readiness grade. Missing core checks must also
    // keep the overall score provisional and exclude this category from it.
    const core = ["ai.answerability", "ai.citability", "ai.entity_consistency"];
    if (category === "aiReadiness" && core.some(key => !checkResults.some(c => c.checkKey === key && !["UNAVAILABLE", "ERROR", "NOT_APPLICABLE"].includes(c.status)))) {
      return { ...score, lowCoverage: true };
    }
    return score;
  });
  const overall = calculateOverallScore(categoryScores);
  const applicable = categoryScores.reduce(
    (total, category) => total + category.applicableMaxPenalty,
    0,
  );
  const available = categoryScores.reduce(
    (total, category) => total + category.availableMaxPenalty,
    0,
  );

  return {
    scoringDefinitionVersion: SCORING_DEFINITION_VERSION,
    checkCatalogVersion: SCORING_DEFINITION_VERSION,
    evidence: [...evidenceItems(collected), ...(businessContext.verifiedPublicFacts ?? []).filter(f => f.value.trim().length >= 3 && f.value.trim().length <= 200).map(f => ({ id: `business-fact:${f.id}`, evidenceType: "TEXT" as const, sourceLabel: `Public verified business fact: ${f.factType}`, excerpt: f.value, metadata: { factId: f.id, factType: f.factType } }))],
    checkResults,
    categoryScores,
    overall,
    evidenceCoverage: applicable === 0 ? 1 : available / applicable,
  };
}

export async function runPhase1DeterministicAudit(
  canonicalUrl: string,
  businessContext: AuditBusinessContext = {},
  options: AuditCollectionOptions = {},
): Promise<Phase1AuditResult> {
  const collected = await collectWebsiteEvidence(canonicalUrl, { ...options, verifiedPublicFacts: options.verifiedPublicFacts ?? businessContext.verifiedPublicFacts });
  return evaluatePhase1Checks(collected, businessContext);
}
