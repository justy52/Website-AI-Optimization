import {
  analyzeHtml,
  firstSitemapUrl,
  robotsTxtBlocksAll,
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
import {
  safeFetchText,
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
  collectionError: string | null;
  pageAnalysis: PageAnalysis | null;
};

export type AuditBusinessContext = {
  localSearchApplicable?: boolean;
};

const unsupportedCheckReasons: Record<string, string> = {
  "perf.lcp": "Core Web Vitals are unavailable until an official lab or field data source is connected.",
  "perf.inp": "Core Web Vitals are unavailable until an official lab or field data source is connected.",
  "perf.cls": "Core Web Vitals are unavailable until an official lab or field data source is connected.",
  "perf.mobile_render": "Mobile rendering requires a browser/lab runner that is not part of Phase 1.",
  "perf.critical_functionality": "Critical functionality checks require configured forms or browser workflows.",
  "seo.internal_links": "A meaningful internal-link graph requires a bounded crawler, which is deferred.",
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
    evidenceRefs?: string[];
    observedValue?: Record<string, unknown>;
  } = {},
): Phase1CheckResult {
  return {
    checkKey: check.key,
    checkVersion: checkVersion(check),
    category: check.category,
    status,
    severity: options.severity ?? (status === "FAIL" ? "HIGH" : status === "WARNING" ? "MEDIUM" : null),
    maxPenaltyWeight: check.maxPenaltyWeight,
    reason,
    evidenceRefs: options.evidenceRefs ?? [],
    observedValue: options.observedValue ?? {},
  };
}

async function collectOptional(url: string): Promise<SafeFetchResult | null> {
  try {
    return await safeFetchText(url, { maxBytes: 500_000, timeoutMs: 5_000 });
  } catch {
    return null;
  }
}

export async function collectWebsiteEvidence(
  canonicalUrl: string,
): Promise<CollectedWebsiteEvidence> {
  try {
    const page = await safeFetchText(canonicalUrl, {
      maxBytes: 1_000_000,
      timeoutMs: 8_000,
    });
    const origin = new URL(page.finalUrl).origin;
    const robots = await collectOptional(`${origin}/robots.txt`);
    const sitemapUrl = firstSitemapUrl(robots?.bodyText) ?? `${origin}/sitemap.xml`;
    const sitemap = await collectOptional(sitemapUrl);

    return {
      canonicalUrl,
      page,
      robots,
      sitemap,
      collectionError: null,
      pageAnalysis: analyzeHtml(page.bodyText),
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

function hasPrimaryCta(analysis: PageAnalysis): boolean {
  const text = [...analysis.anchors.map((anchor) => anchor.text), ...analysis.buttons]
    .join(" ")
    .toLowerCase();

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

function evaluateImplementedCheck(
  check: AuditCheckDefinition,
  collected: CollectedWebsiteEvidence,
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

      if (hasNoindex || robotsTxtBlocksAll(collected.robots?.bodyText)) {
        return result(check, "FAIL", "The page or robots.txt includes noindex/blocking signals.", {
          severity: "CRITICAL",
          evidenceRefs: ["homepage", "robots"],
          observedValue: { hasNoindex },
        });
      }

      return result(check, "PASS", "The homepage returned 2xx without noindex/blocking signals.", {
        evidenceRefs: ["homepage", "robots"],
      });
    }

    case "seo.robots_sitemap": {
      const robotsStatus = collected.robots?.status;
      const sitemapStatus = collected.sitemap?.status;
      const robotsBlocks = robotsTxtBlocksAll(collected.robots?.bodyText);
      const sitemapDeclared = Boolean(firstSitemapUrl(collected.robots?.bodyText));

      if (robotsBlocks) {
        return result(check, "FAIL", "robots.txt blocks all user agents from the site.", {
          severity: "CRITICAL",
          evidenceRefs: ["robots"],
        });
      }

      if (robotsStatus && robotsStatus >= 200 && robotsStatus < 300) {
        if (sitemapStatus && sitemapStatus >= 200 && sitemapStatus < 300) {
          return result(check, "PASS", "robots.txt is reachable and an XML sitemap was reachable.", {
            evidenceRefs: ["robots", "sitemap"],
            observedValue: { sitemapDeclared },
          });
        }

        return result(check, "WARNING", "robots.txt is reachable, but a sitemap was not reachable.", {
          evidenceRefs: ["robots"],
          observedValue: { sitemapDeclared, sitemapStatus },
        });
      }

      if (sitemapStatus && sitemapStatus >= 200 && sitemapStatus < 300) {
        return result(check, "WARNING", "A sitemap was reachable, but robots.txt was not.", {
          evidenceRefs: ["sitemap"],
          observedValue: { robotsStatus },
        });
      }

      return result(check, "FAIL", "Neither robots.txt nor a sitemap was reachable from public site evidence.", {
        evidenceRefs: [],
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

      const canonical = new URL(analysis.canonicalUrls[0], page.finalUrl);
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

      if (analysis.visibleText.length < 100) {
        return result(check, "WARNING", "The homepage had limited crawlable text in the fetched HTML.", {
          evidenceRefs: ["homepage-html"],
          observedValue: { visibleTextLength: analysis.visibleText.length },
        });
      }

      return result(check, "PASS", "The fetched HTML contained crawlable text.", {
        evidenceRefs: ["homepage-html"],
        observedValue: { visibleTextLength: analysis.visibleText.length },
      });
    }

    default:
      return unavailable(check);
  }
}

function evidenceItems(collected: CollectedWebsiteEvidence): AuditEvidenceItem[] {
  const items: AuditEvidenceItem[] = [];

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

    return evaluateImplementedCheck(check, collected);
  });
  const categoryScores = scoreCategoryKeys.map((category) =>
    calculateCategoryScore(category, checkResults),
  );
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
    evidence: evidenceItems(collected),
    checkResults,
    categoryScores,
    overall,
    evidenceCoverage: applicable === 0 ? 1 : available / applicable,
  };
}

export async function runPhase1DeterministicAudit(
  canonicalUrl: string,
  businessContext: AuditBusinessContext = {},
): Promise<Phase1AuditResult> {
  const collected = await collectWebsiteEvidence(canonicalUrl);
  return evaluatePhase1Checks(collected, businessContext);
}
