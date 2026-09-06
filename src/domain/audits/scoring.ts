import { UnknownDefinitionVersionError } from "@/domain/definitions";

export const SCORING_DEFINITION_VERSION = "dv-score-v1.0";

export const scoreCategoryKeys = [
  "websitePerformance",
  "seo",
  "localSearch",
  "conversion",
  "aiReadiness",
  "authority",
] as const;

export type ScoreCategoryKey = (typeof scoreCategoryKeys)[number];

export type CheckStatus =
  | "PASS"
  | "WARNING"
  | "FAIL"
  | "ERROR"
  | "UNAVAILABLE"
  | "NOT_APPLICABLE";

export type AuditCheckDefinition = {
  key: string;
  category: ScoreCategoryKey;
  maxPenaltyWeight: number;
  autoOpportunity: boolean;
};

export type AuditCheckResult = {
  checkKey: string;
  status: CheckStatus;
};

export type CategoryScoreResult = {
  category: ScoreCategoryKey;
  score: number | null;
  evidenceCoverage: number;
  lowCoverage: boolean;
  applicableMaxPenalty: number;
  availableMaxPenalty: number;
  actualPenalty: number;
};

export type OverallScoreResult = {
  score: number | null;
  provisional: boolean;
};

export const scoreCategoryWeights: Record<ScoreCategoryKey, number> = {
  websitePerformance: 20,
  seo: 25,
  localSearch: 15,
  conversion: 15,
  aiReadiness: 10,
  authority: 15,
};

export const auditCheckDefinitions: AuditCheckDefinition[] = [
  { key: "perf.lcp", category: "websitePerformance", maxPenaltyWeight: 22, autoOpportunity: true },
  { key: "perf.inp", category: "websitePerformance", maxPenaltyWeight: 18, autoOpportunity: true },
  { key: "perf.cls", category: "websitePerformance", maxPenaltyWeight: 14, autoOpportunity: true },
  { key: "perf.https", category: "websitePerformance", maxPenaltyWeight: 14, autoOpportunity: true },
  { key: "perf.mobile_render", category: "websitePerformance", maxPenaltyWeight: 16, autoOpportunity: true },
  { key: "perf.critical_functionality", category: "websitePerformance", maxPenaltyWeight: 16, autoOpportunity: true },
  { key: "seo.indexability", category: "seo", maxPenaltyWeight: 18, autoOpportunity: true },
  { key: "seo.robots_sitemap", category: "seo", maxPenaltyWeight: 10, autoOpportunity: true },
  { key: "seo.canonical", category: "seo", maxPenaltyWeight: 10, autoOpportunity: true },
  { key: "seo.title", category: "seo", maxPenaltyWeight: 12, autoOpportunity: true },
  { key: "seo.meta_description", category: "seo", maxPenaltyWeight: 6, autoOpportunity: true },
  { key: "seo.heading_structure", category: "seo", maxPenaltyWeight: 10, autoOpportunity: true },
  { key: "seo.internal_links", category: "seo", maxPenaltyWeight: 14, autoOpportunity: true },
  { key: "seo.content_targeting", category: "seo", maxPenaltyWeight: 20, autoOpportunity: true },
  { key: "local.business_identity", category: "localSearch", maxPenaltyWeight: 15, autoOpportunity: true },
  { key: "local.gbp_presence", category: "localSearch", maxPenaltyWeight: 20, autoOpportunity: true },
  { key: "local.category_service_alignment", category: "localSearch", maxPenaltyWeight: 15, autoOpportunity: true },
  { key: "local.location_clarity", category: "localSearch", maxPenaltyWeight: 12, autoOpportunity: true },
  { key: "local.local_pages", category: "localSearch", maxPenaltyWeight: 12, autoOpportunity: true },
  { key: "local.structured_business_data", category: "localSearch", maxPenaltyWeight: 10, autoOpportunity: true },
  { key: "local.review_signal", category: "localSearch", maxPenaltyWeight: 16, autoOpportunity: true },
  { key: "conv.primary_cta", category: "conversion", maxPenaltyWeight: 18, autoOpportunity: true },
  { key: "conv.lead_form", category: "conversion", maxPenaltyWeight: 18, autoOpportunity: true },
  { key: "conv.mobile_contact", category: "conversion", maxPenaltyWeight: 12, autoOpportunity: true },
  { key: "conv.offer_clarity", category: "conversion", maxPenaltyWeight: 16, autoOpportunity: true },
  { key: "conv.trust_signals", category: "conversion", maxPenaltyWeight: 14, autoOpportunity: true },
  { key: "conv.friction", category: "conversion", maxPenaltyWeight: 12, autoOpportunity: true },
  { key: "conv.measurement", category: "conversion", maxPenaltyWeight: 10, autoOpportunity: true },
  { key: "ai.identity_clarity", category: "aiReadiness", maxPenaltyWeight: 14, autoOpportunity: true },
  { key: "ai.service_clarity", category: "aiReadiness", maxPenaltyWeight: 16, autoOpportunity: true },
  { key: "ai.location_clarity", category: "aiReadiness", maxPenaltyWeight: 10, autoOpportunity: true },
  { key: "ai.entity_consistency", category: "aiReadiness", maxPenaltyWeight: 12, autoOpportunity: true },
  { key: "ai.answerability", category: "aiReadiness", maxPenaltyWeight: 14, autoOpportunity: true },
  { key: "ai.structured_data", category: "aiReadiness", maxPenaltyWeight: 10, autoOpportunity: true },
  { key: "ai.citability", category: "aiReadiness", maxPenaltyWeight: 12, autoOpportunity: true },
  { key: "ai.crawlability", category: "aiReadiness", maxPenaltyWeight: 12, autoOpportunity: true },
  { key: "auth.reviews", category: "authority", maxPenaltyWeight: 18, autoOpportunity: true },
  { key: "auth.third_party_mentions", category: "authority", maxPenaltyWeight: 16, autoOpportunity: true },
  { key: "auth.referring_domains", category: "authority", maxPenaltyWeight: 16, autoOpportunity: true },
  { key: "auth.credentials", category: "authority", maxPenaltyWeight: 14, autoOpportunity: true },
  { key: "auth.business_transparency", category: "authority", maxPenaltyWeight: 12, autoOpportunity: true },
  { key: "auth.expertise_content", category: "authority", maxPenaltyWeight: 12, autoOpportunity: true },
  { key: "auth.entity_consistency", category: "authority", maxPenaltyWeight: 12, autoOpportunity: true },
];

const penaltyFactors: Record<Exclude<CheckStatus, "ERROR" | "UNAVAILABLE" | "NOT_APPLICABLE">, number> = {
  PASS: 0,
  WARNING: 0.5,
  FAIL: 1,
};

export type AuditScoringDefinition = {
  version: typeof SCORING_DEFINITION_VERSION;
  categoryWeights: typeof scoreCategoryWeights;
  checks: readonly AuditCheckDefinition[];
  penaltyFactors: typeof penaltyFactors;
  lowCoverageThreshold: 0.6;
};

export const auditScoringDefinitionsByVersion: Record<
  typeof SCORING_DEFINITION_VERSION,
  AuditScoringDefinition
> = {
  [SCORING_DEFINITION_VERSION]: {
    version: SCORING_DEFINITION_VERSION,
    categoryWeights: scoreCategoryWeights,
    checks: auditCheckDefinitions,
    penaltyFactors,
    lowCoverageThreshold: 0.6,
  },
};

export function getAuditScoringDefinition(
  version = SCORING_DEFINITION_VERSION,
): AuditScoringDefinition {
  const definition =
    auditScoringDefinitionsByVersion[
      version as keyof typeof auditScoringDefinitionsByVersion
    ];

  if (!definition) {
    throw new UnknownDefinitionVersionError("audit scoring", version);
  }

  return definition;
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getChecksForCategory(
  category: ScoreCategoryKey,
): AuditCheckDefinition[] {
  return auditCheckDefinitions.filter((check) => check.category === category);
}

export function calculateCategoryScore(
  category: ScoreCategoryKey,
  results: AuditCheckResult[],
): CategoryScoreResult {
  const resultByCheck = new Map(
    results.map((result) => [result.checkKey, result.status] as const),
  );

  let applicableMaxPenalty = 0;
  let availableMaxPenalty = 0;
  let actualPenalty = 0;

  for (const check of getChecksForCategory(category)) {
    const status = resultByCheck.get(check.key) ?? "UNAVAILABLE";

    if (status === "NOT_APPLICABLE") {
      continue;
    }

    applicableMaxPenalty += check.maxPenaltyWeight;

    if (status === "ERROR" || status === "UNAVAILABLE") {
      continue;
    }

    availableMaxPenalty += check.maxPenaltyWeight;
    actualPenalty += check.maxPenaltyWeight * penaltyFactors[status];
  }

  const evidenceCoverage =
    applicableMaxPenalty === 0 ? 1 : availableMaxPenalty / applicableMaxPenalty;
  const lowCoverage = evidenceCoverage < 0.6;
  const score =
    applicableMaxPenalty === 0 || availableMaxPenalty === 0
      ? null
      : clamp(
          Math.round(
            100 * (1 - actualPenalty / applicableMaxPenalty),
          ),
        );

  return {
    category,
    score,
    evidenceCoverage,
    lowCoverage,
    applicableMaxPenalty,
    availableMaxPenalty,
    actualPenalty,
  };
}

export function calculateOverallScore(
  categoryScores: CategoryScoreResult[],
): OverallScoreResult {
  const usableScores = categoryScores.filter(
    (categoryScore) => categoryScore.score !== null && !categoryScore.lowCoverage,
  );

  const provisional =
    usableScores.length !== categoryScores.length ||
    categoryScores.some((categoryScore) => categoryScore.lowCoverage);

  const totalWeight = usableScores.reduce(
    (total, categoryScore) => total + scoreCategoryWeights[categoryScore.category],
    0,
  );

  if (totalWeight === 0) {
    return {
      score: null,
      provisional: true,
    };
  }

  const weightedScore = usableScores.reduce(
    (total, categoryScore) =>
      total + categoryScore.score! * scoreCategoryWeights[categoryScore.category],
    0,
  );

  return {
    score: clamp(Math.round(weightedScore / totalWeight)),
    provisional,
  };
}
