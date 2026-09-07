import {
  auditCheckDefinitions,
  type CheckStatus,
  type ScoreCategoryKey,
} from "@/domain/audits/scoring";
import {
  getServicePlanDefinition,
  type ServicePlanKey,
} from "@/domain/service-plans";

import {
  calculateOpportunityPriority,
  PRIORITY_DEFINITION_VERSION,
  type PriorityBand,
  type PriorityInputs,
} from "./priority";

export type EvidenceConfidence = "LOW" | "MEDIUM" | "HIGH";

export type OpportunityStatus =
  | "DRAFT"
  | "READY"
  | "BLOCKED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "DISMISSED"
  | "SUPERSEDED";

export type OpportunityPlanScope =
  | "INCLUDED"
  | "MAY_REQUIRE_ADD_ON"
  | "OUT_OF_SCOPE";

export type DependencyState = "NONE" | "HARD_DEPENDENCY";
export type ClientInputState = "NOT_REQUIRED" | "REQUIRED" | "RECEIVED";
export type ApprovalBlockedState = "NOT_BLOCKED" | "AWAITING_APPROVAL";

export const opportunityStatuses: OpportunityStatus[] = [
  "DRAFT",
  "READY",
  "BLOCKED",
  "IN_PROGRESS",
  "COMPLETED",
  "DISMISSED",
  "SUPERSEDED",
];

export const openOpportunityStatuses: OpportunityStatus[] = [
  "DRAFT",
  "READY",
  "BLOCKED",
  "IN_PROGRESS",
];

export type AuditResultOpportunitySource = {
  checkKey: string;
  checkVersion: string;
  category: ScoreCategoryKey;
  status: CheckStatus;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | null;
  maxPenaltyWeight: number;
  reason: string;
  evidenceRefs: string[];
  evidenceConfidence: EvidenceConfidence;
  clientServicePlan: ServicePlanKey;
  clientServicePlanVersion: string;
  findingTitle?: string | null;
  findingSummary?: string | null;
};

export type OpportunityDraft = {
  normalizedRemediationFamily: string;
  title: string;
  summary: string;
  recommendedAction: string;
  status: "DRAFT";
  priorityDefinitionVersion: typeof PRIORITY_DEFINITION_VERSION;
  impact: number;
  confidence: number;
  urgency: number;
  strategicFit: number;
  planFit: number;
  staleness: number;
  effort: PriorityInputs["effort"];
  dependencyState: DependencyState;
  clientInputState: ClientInputState;
  approvalBlockedState: ApprovalBlockedState;
  basePriority: number;
  modifiers: Record<string, unknown>;
  finalPriority: number;
  priorityBand: PriorityBand;
  priorityReasons: string[];
  planScope: OpportunityPlanScope;
  sourceEvidenceRefs: string[];
  sourceSeverity: NonNullable<AuditResultOpportunitySource["severity"]>;
  immediateAttention: boolean;
};

const checkDefinitionByKey = new Map(
  auditCheckDefinitions.map((definition) => [definition.key, definition]),
);

const remediationFamiliesByCheckKey: Record<string, string> = {
  "perf.lcp": "performance",
  "perf.inp": "performance",
  "perf.cls": "performance",
  "perf.https": "technical_security",
  "perf.mobile_render": "mobile_usability",
  "perf.critical_functionality": "critical_functionality",
  "seo.indexability": "technical_seo",
  "seo.robots_sitemap": "technical_seo",
  "seo.canonical": "technical_seo",
  "seo.title": "on_page_metadata",
  "seo.meta_description": "on_page_metadata",
  "seo.heading_structure": "on_page_structure",
  "seo.internal_links": "internal_linking",
  "seo.content_targeting": "content_targeting",
  "local.business_identity": "local_identity",
  "local.gbp_presence": "local_profile",
  "local.category_service_alignment": "local_profile",
  "local.location_clarity": "local_content",
  "local.local_pages": "local_content",
  "local.structured_business_data": "structured_data",
  "local.review_signal": "reviews",
  "conv.primary_cta": "conversion_path",
  "conv.lead_form": "conversion_path",
  "conv.mobile_contact": "conversion_path",
  "conv.offer_clarity": "offer_clarity",
  "conv.trust_signals": "trust_credibility",
  "conv.friction": "conversion_path",
  "conv.measurement": "measurement",
  "ai.identity_clarity": "ai_readiness_identity",
  "ai.service_clarity": "ai_readiness_content",
  "ai.location_clarity": "ai_readiness_content",
  "ai.entity_consistency": "ai_readiness_identity",
  "ai.answerability": "ai_readiness_content",
  "ai.structured_data": "structured_data",
  "ai.citability": "expertise_content",
  "ai.crawlability": "technical_seo",
  "auth.reviews": "reviews",
  "auth.third_party_mentions": "authority_mentions",
  "auth.referring_domains": "authority_links",
  "auth.credentials": "trust_credibility",
  "auth.business_transparency": "trust_credibility",
  "auth.expertise_content": "expertise_content",
  "auth.entity_consistency": "authority_consistency",
};

const effortByFamily: Record<string, PriorityInputs["effort"]> = {
  technical_security: 2,
  performance: 3,
  mobile_usability: 3,
  critical_functionality: 3,
  technical_seo: 2,
  on_page_metadata: 1,
  on_page_structure: 1,
  internal_linking: 2,
  content_targeting: 3,
  local_identity: 2,
  local_profile: 3,
  local_content: 3,
  structured_data: 2,
  reviews: 4,
  conversion_path: 2,
  offer_clarity: 2,
  trust_credibility: 2,
  measurement: 3,
  ai_readiness_identity: 2,
  ai_readiness_content: 3,
  expertise_content: 4,
  authority_mentions: 4,
  authority_links: 5,
  authority_consistency: 3,
};

const titleByCheckKey: Record<string, string> = {
  "perf.https": "Fix HTTPS/security transport issue",
  "seo.indexability": "Resolve indexability blocker",
  "seo.robots_sitemap": "Repair robots.txt or sitemap visibility",
  "seo.canonical": "Clean up canonical signals",
  "seo.title": "Improve page title signal",
  "seo.meta_description": "Improve meta description coverage",
  "seo.heading_structure": "Improve heading structure",
  "seo.internal_links": "Strengthen internal linking",
  "local.structured_business_data": "Add or repair business structured data",
  "conv.primary_cta": "Clarify primary call to action",
  "conv.mobile_contact": "Improve mobile contact path",
  "ai.structured_data": "Improve structured data for AI readiness",
  "ai.crawlability": "Improve crawlable page content",
};

function evidenceConfidenceFactor(confidence: EvidenceConfidence): number {
  if (confidence === "HIGH") return 5;
  if (confidence === "MEDIUM") return 3;
  return 1;
}

function severityImpact(severity: NonNullable<AuditResultOpportunitySource["severity"]>) {
  if (severity === "CRITICAL") return 5;
  if (severity === "HIGH") return 4;
  if (severity === "MEDIUM") return 3;
  return 2;
}

function severityUrgency(severity: NonNullable<AuditResultOpportunitySource["severity"]>) {
  if (severity === "CRITICAL") return 5;
  if (severity === "HIGH") return 4;
  if (severity === "MEDIUM") return 3;
  return 2;
}

export function normalizeRemediationFamily(checkKey: string): string {
  return remediationFamiliesByCheckKey[checkKey] ?? checkKey.split(".")[0] ?? "general";
}

export function shouldAutoCreateOpportunity(
  source: AuditResultOpportunitySource,
): boolean {
  if (source.severity === "CRITICAL") {
    return true;
  }

  const definition = checkDefinitionByKey.get(source.checkKey);

  if (!definition?.autoOpportunity) {
    return false;
  }

  if (!["MEDIUM", "HIGH"].includes(source.evidenceConfidence)) {
    return false;
  }

  return (
    source.status === "FAIL" ||
    (source.status === "WARNING" && source.maxPenaltyWeight >= 12)
  );
}

export function derivePlanFit(
  plan: ServicePlanKey,
  version: string,
  category: ScoreCategoryKey,
  remediationFamily: string,
): { planFit: number; planScope: OpportunityPlanScope; reason: string } {
  const definition = getServicePlanDefinition(plan, version);

  if (definition.key === "NONE" || definition.key === "AUDIT_ONLY") {
    return {
      planFit: 0,
      planScope: "OUT_OF_SCOPE",
      reason: `${definition.label} does not include implementation work.`,
    };
  }

  if (definition.key === "LAUNCH" || definition.key === "CUSTOM") {
    return {
      planFit: 3,
      planScope: "MAY_REQUIRE_ADD_ON",
      reason: `${definition.label} scope must be checked against the approved work package.`,
    };
  }

  if (
    remediationFamily === "authority_links" ||
    remediationFamily === "authority_mentions" ||
    remediationFamily === "reviews"
  ) {
    return {
      planFit: definition.key === "PRO" ? 3 : 2,
      planScope: "MAY_REQUIRE_ADD_ON",
      reason: "Authority/review work often needs third-party access, client input, or add-on scope.",
    };
  }

  if (remediationFamily === "content_targeting" || remediationFamily === "ai_readiness_content") {
    if ((definition.limits.majorContentAssets ?? 0) > 0) {
      return {
        planFit: 4,
        planScope: "INCLUDED",
        reason: `${definition.label} includes recurring content or page optimization capacity.`,
      };
    }

    return {
      planFit: 2,
      planScope: "MAY_REQUIRE_ADD_ON",
      reason: `${definition.label} has limited content-production entitlement.`,
    };
  }

  if (
    category === "websitePerformance" ||
    category === "seo" ||
    category === "conversion" ||
    category === "localSearch" ||
    category === "aiReadiness"
  ) {
    return {
      planFit: 4,
      planScope: "INCLUDED",
      reason: `${definition.label} includes monitoring and optimization for this category.`,
    };
  }

  return {
    planFit: 2,
    planScope: "MAY_REQUIRE_ADD_ON",
    reason: "The current service plan may require add-on review for this work.",
  };
}

export function buildOpportunityDraft(
  source: AuditResultOpportunitySource,
): OpportunityDraft | null {
  if (!source.severity || !shouldAutoCreateOpportunity(source)) {
    return null;
  }

  const normalizedRemediationFamily = normalizeRemediationFamily(source.checkKey);
  const planFit = derivePlanFit(
    source.clientServicePlan,
    source.clientServicePlanVersion,
    source.category,
    normalizedRemediationFamily,
  );
  const inputs: PriorityInputs = {
    impact: severityImpact(source.severity),
    confidence: evidenceConfidenceFactor(source.evidenceConfidence),
    urgency: severityUrgency(source.severity),
    strategicFit: 3,
    planFit: planFit.planFit,
    staleness: 0,
    effort: effortByFamily[normalizedRemediationFamily] ?? 3,
    isCriticalFinding: source.severity === "CRITICAL",
  };
  const priority = calculateOpportunityPriority(inputs);

  return {
    normalizedRemediationFamily,
    title:
      source.findingTitle ??
      titleByCheckKey[source.checkKey] ??
      `Resolve ${source.checkKey}`,
    summary: source.findingSummary ?? source.reason,
    recommendedAction: `Review ${source.checkKey} evidence and prepare a scoped remediation plan.`,
    status: "DRAFT",
    priorityDefinitionVersion: priority.definitionVersion,
    impact: inputs.impact,
    confidence: inputs.confidence,
    urgency: inputs.urgency,
    strategicFit: inputs.strategicFit,
    planFit: inputs.planFit,
    staleness: inputs.staleness,
    effort: inputs.effort,
    dependencyState: "NONE",
    clientInputState: "NOT_REQUIRED",
    approvalBlockedState: "NOT_BLOCKED",
    basePriority: priority.baseScore,
    modifiers: {
      effort: inputs.effort,
      modifierTotal: priority.modifierTotal,
      planFitReason: planFit.reason,
    },
    finalPriority: priority.score,
    priorityBand: priority.band,
    priorityReasons: priority.reasons,
    planScope: planFit.planScope,
    sourceEvidenceRefs: source.evidenceRefs,
    sourceSeverity: source.severity,
    immediateAttention: source.severity === "CRITICAL",
  };
}

export type WorkPlanSortableOpportunity = {
  status: OpportunityStatus;
  sourceSeverity: AuditResultOpportunitySource["severity"];
  finalPriority: number;
  effort: number;
  createdAt: Date | string;
};

export function sortOpportunitiesForWorkPlan<T extends WorkPlanSortableOpportunity>(
  opportunities: T[],
): T[] {
  return [...opportunities].sort((left, right) => {
    const leftCritical =
      left.sourceSeverity === "CRITICAL" && openOpportunityStatuses.includes(left.status);
    const rightCritical =
      right.sourceSeverity === "CRITICAL" && openOpportunityStatuses.includes(right.status);

    if (leftCritical !== rightCritical) return leftCritical ? -1 : 1;
    if (left.finalPriority !== right.finalPriority) {
      return right.finalPriority - left.finalPriority;
    }
    if (left.effort !== right.effort) return left.effort - right.effort;
    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });
}
