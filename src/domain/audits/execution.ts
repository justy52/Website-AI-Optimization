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
import { collectMobileLabEvidence, type MobileLabEvidence } from "./pagespeed";
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
};

export type AuditBusinessContext = {
  localSearchApplicable?: boolean;
  verifiedPublicFacts?: Array<{ id: string; factType: string; value: string }>;
};

// Record evaluator changes independently of the unchanged scoring weights.
export const AUDIT_COLLECTOR_VERSION = "phase1-deterministic-v1.10";

const unsupportedCheckReasons: Record<string, string> = {
  "perf.lcp": "Core Web Vitals are unavailable until an official lab or field data source is connected.",
  "perf.inp": "Interaction to Next Paint requires real-user field data; a simulated lab test cannot measure it.",
  "perf.cls": "Core Web Vitals are unavailable until an official lab or field data source is connected.",
  "perf.mobile_render": "Mobile rendering requires a browser/lab runner that is not part of Phase 1.",
  "perf.critical_functionality": "Critical functionality checks require configured forms or browser workflows.",
  "seo.content_targeting": "Content targeting requires approved service/location facts and intent evidence.",
  "local.business_identity": "Business identity scoring requires verified business facts.",
  "local.gbp_presence": "Google Business Profile evidence requires a read-only integration.",
  "local.category_service_alignment": "Category alignment requires verified GBP/category evidence.",
  "local.location_clarity": "Location clarity requires verified service-area facts beyond one page.",
  "local.local_pages": "Local page coverage requires a bounded crawl and verified target locations.",
  "local.review_signal": "Review signals require third-party review evidence.",
  "conv.lead_form": "Lead-form usability requires configured form targets or browser execution.",
  "conv.offer_clarity": "Offer clarity is deferred until deterministic business-fact rules exist.",
  "conv.trust_signals": "Trust signal scoring requires deterministic evidence rules beyond Phase 1.",
  "conv.friction": "Conversion friction requires configured journeys or browser instrumentation.",
  "conv.measurement": "Measurement checks require analytics/tag integrations.",
  "ai.identity_clarity": "Identity clarity requires verified business facts.",
  "ai.service_clarity": "Service clarity requires verified service facts.",
  "ai.location_clarity": "Location clarity requires verified service-area facts.",
  "ai.entity_consistency": "Entity consistency requires verified business facts across sources.",
  "ai.answerability": "Answerability requires approved question/service facts and page coverage.",
  "ai.citability": "Citability requires deterministic citation/source-depth rules.",
  "auth.reviews": "Review authority requires third-party review evidence.",
  "auth.third_party_mentions": "Third-party mentions require a configured authority data source.",
  "auth.referring_domains": "Referring domains require backlink data from a legitimate provider.",
  "auth.credentials": "Credentials require verified business facts or structured third-party evidence.",
  "auth.business_transparency": "Business transparency requires verified business facts and crawl coverage.",
  "auth.expertise_content": "Expertise content requires crawl coverage and deterministic content rules.",
  "auth.entity_consistency": "Entity consistency requires verified external authority evidence.",
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
    const response = await safeFetchText(url, { ...options, maxBytes: 500_000, timeoutMs: 5_000 });
    return { response, outOfScope: false };
  } catch (error) {
    return { response: null, outOfScope: error instanceof SafeFetchError && error.code === "OUT_OF_SCOPE" };
  }
}

export async function collectWebsiteEvidence(
  canonicalUrl: string,
  options: { pagespeedApiKey?: string } = {},
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
      maxBytes: 1_000_000,
      timeoutMs: 8_000,
    });
    const finalPage = new URL(page.finalUrl);
    const origin = finalPage.origin;
    const auxiliaryFetch: SafeFetchOptions = {
      ...transport,
      isTargetAllowed: (target, from) => allowTarget(target, from ?? finalPage),
    };
    const labPromise = options.pagespeedApiKey ? collectMobileLabEvidence(page.finalUrl, options.pagespeedApiKey) : Promise.resolve(null);
    const robots = await collectOptional(`${origin}/robots.txt`, auxiliaryFetch);
    const sitemapUrl = firstSitemapUrl(robots.response?.bodyText) ?? `${origin}/sitemap.xml`;
    const sitemap = await collectOptional(sitemapUrl, auxiliaryFetch);
    const mobileLab = await labPromise;

    return {
      canonicalUrl,
      page,
      robots: robots.response,
      sitemap: sitemap.response,
      auxiliaryScopeLimited: robots.outOfScope || sitemap.outOfScope,
      collectionError: null,
      pageAnalysis: analyzeHtml(page.bodyText),
      mobileLab,
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
  const text = [...analysis.anchors.map((anchor) => anchor.text), ...analysis.buttons]
    .join(" ")
    .toLowerCase();

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

function evaluateImplementedCheck(
  check: AuditCheckDefinition,
  collected: CollectedWebsiteEvidence,
  businessContext: AuditBusinessContext,
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
      if (value == null) return unavailable(check, "No usable page-level real-user mobile INP was available for this check; a lab test cannot substitute for field data.");
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
      if (!successful(page) || !facts.length) return unavailable(check, "A successful homepage response and a current, public, verified business fact are required for this check.");
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

      return result(check, "FAIL", "No deterministic primary call-to-action phrase was found.", {
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

    default:
      return unavailable(check);
  }
}

function evidenceItems(collected: CollectedWebsiteEvidence): AuditEvidenceItem[] {
  const items: AuditEvidenceItem[] = [];

  if (collected.mobileLab && (collected.mobileLab.lcpMs != null || collected.mobileLab.cls != null)) items.push({ id: "pagespeed-mobile", evidenceType: "TEXT", sourceUrl: collected.mobileLab.requestedUrl, sourceLabel: "Google PageSpeed Insights: simulated mobile lab", metadata: { requestedUrl: collected.mobileLab.requestedUrl, fetchedAt: collected.mobileLab.fetchedAt, lighthouseVersion: collected.mobileLab.lighthouseVersion, lcpMs: collected.mobileLab.lcpMs, cls: collected.mobileLab.cls, dataType: "lab" } });
  if (collected.mobileLab?.fieldInpMs != null) items.push({ id: "pagespeed-field", evidenceType: "TEXT", sourceUrl: collected.mobileLab.requestedUrl, sourceLabel: "Google CrUX: homepage mobile field data", metadata: { fieldInpMs: collected.mobileLab.fieldInpMs, percentile: 75, period: "rolling 28 days", dataType: "field", fetchedAt: collected.mobileLab.fetchedAt } });

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

  return items;
}

export function evaluatePhase1Checks(
  collected: CollectedWebsiteEvidence,
  businessContext: AuditBusinessContext = {},
): Phase1AuditResult {
  getAuditScoringDefinition(SCORING_DEFINITION_VERSION);

  const localSearchApplicable = businessContext.localSearchApplicable ?? true;
  const checkResults = auditCheckDefinitions.map((check) => {
    if (!localSearchApplicable && check.category === "localSearch") {
      return result(
        check,
        "NOT_APPLICABLE",
        "Local Search was marked not applicable for this audit target.",
        { severity: null },
      );
    }

    return evaluateImplementedCheck(check, collected, businessContext);
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
  options: { pagespeedApiKey?: string } = {},
): Promise<Phase1AuditResult> {
  const collected = await collectWebsiteEvidence(canonicalUrl, options);
  return evaluatePhase1Checks(collected, businessContext);
}
