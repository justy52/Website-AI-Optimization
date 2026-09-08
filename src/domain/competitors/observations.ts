import { createHash } from "node:crypto";

import { analyzeHtml } from "@/domain/audits/page-analysis";
import { getServicePlanDefinition, type ServicePlanKey } from "@/domain/service-plans";
import { normalizeCanonicalUrl, normalizeDomain } from "@/domain/websites/url";
import type { SafeFetchResult } from "@/security/safe-fetch";

export const COMPETITOR_OBSERVATION_VERSION = "phase4a-competitor-v1.0";

export type CompetitorObservationSummary = {
  sourceUrl: string;
  httpStatus: number | null;
  observedTitle: string | null;
  observedMetaDescription: string | null;
  contentHash: string;
  changeSummary: string;
  evidence: Record<string, unknown>;
  limitations: Record<string, unknown>;
};

export function competitorLimitForPlan(
  plan: ServicePlanKey,
  version?: string,
): number | null {
  return getServicePlanDefinition(plan, version).limits.configuredCompetitors;
}

export function normalizeCompetitorTargetUrl(input: string): {
  canonicalUrl: string;
  domain: string;
} {
  const canonicalUrl = normalizeCanonicalUrl(input);

  return {
    canonicalUrl,
    domain: normalizeDomain(canonicalUrl),
  };
}

export function summarizeCompetitorObservation(
  result: SafeFetchResult,
  previousContentHash?: string | null,
): CompetitorObservationSummary {
  const analysis = analyzeHtml(result.bodyText);
  const observedTitle = analysis.title || null;
  const observedMetaDescription = analysis.metaDescription || null;
  const source = JSON.stringify({
    finalUrl: result.finalUrl,
    status: result.status,
    title: observedTitle,
    metaDescription: observedMetaDescription,
  });
  const contentHash = createHash("sha256").update(source).digest("hex");
  const changedSincePrevious = Boolean(
    previousContentHash && previousContentHash !== contentHash,
  );

  return {
    sourceUrl: result.finalUrl,
    httpStatus: result.status,
    observedTitle,
    observedMetaDescription,
    contentHash,
    changeSummary: changedSincePrevious
      ? "Public homepage metadata changed since the previous observation."
      : previousContentHash
        ? "No homepage metadata change detected."
        : "Initial public homepage metadata observation recorded.",
    evidence: {
      version: COMPETITOR_OBSERVATION_VERSION,
      redirects: result.redirects,
      titlePresent: Boolean(observedTitle),
      metaDescriptionPresent: Boolean(observedMetaDescription),
    },
    limitations: {
      rankData: "UNAVAILABLE",
      keywordProvider: "UNAVAILABLE",
      crawlingDepth: "homepage_only",
      source: "public_first_party_page",
    },
  };
}
