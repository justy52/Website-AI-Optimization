import type { MonthlyAccountingKey, MonthlyEntitlementSnapshot } from "./entitlements";

export type MonthlySelectionCandidateStatus =
  | "DRAFT"
  | "READY"
  | "BLOCKED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "DISMISSED"
  | "SUPERSEDED";

export type MonthlySelectionCandidate = {
  id: string;
  status: MonthlySelectionCandidateStatus;
  sourceSeverity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  priorityBand: "Immediate" | "High" | "Normal" | "Backlog" | "Low";
  planScope: "INCLUDED" | "MAY_REQUIRE_ADD_ON" | "OUT_OF_SCOPE";
  finalPriority: number;
  effort: number;
  createdAt: Date | string;
  normalizedRemediationFamily: string;
  category: string;
  approvalBlockedState?: "NOT_BLOCKED" | "AWAITING_APPROVAL";
  dependencyState?: "NONE" | "HARD_DEPENDENCY";
  clientInputState?: "NOT_REQUIRED" | "REQUIRED" | "RECEIVED";
};

export type MonthlySelectedWork = {
  candidate: MonthlySelectionCandidate;
  selectedReason: string;
  contractualDeliverableKey: string | null;
  contractualDeliverableReason: string | null;
  consumesEntitlement: boolean;
  entitlementType: MonthlyAccountingKey | null;
  entitlementUnits: number;
};

export type MonthlySelectionUsage = {
  majorContentAssetsCompleted: number;
  existingPageOptimizationsCompleted: number;
};

const openStatuses: MonthlySelectionCandidateStatus[] = [
  "DRAFT",
  "READY",
  "BLOCKED",
  "IN_PROGRESS",
];

const contentFamilies = new Set([
  "content_targeting",
  "ai_readiness_content",
  "local_content",
  "expertise_content",
]);

const pageOptimizationFamilies = new Set([
  "on_page_metadata",
  "on_page_structure",
  "internal_linking",
  "structured_data",
  "conversion_path",
  "offer_clarity",
  "technical_seo",
  "mobile_usability",
  "ai_readiness_identity",
]);

export function isOpenMonthlySelectionCandidate(
  candidate: MonthlySelectionCandidate,
): boolean {
  return openStatuses.includes(candidate.status);
}

export function isUnresolvedCritical(
  candidate: MonthlySelectionCandidate,
): boolean {
  return (
    candidate.sourceSeverity === "CRITICAL" &&
    isOpenMonthlySelectionCandidate(candidate)
  );
}

export function isApprovedInScopeHigh(
  candidate: MonthlySelectionCandidate,
): boolean {
  return (
    candidate.planScope === "INCLUDED" &&
    candidate.priorityBand === "High" &&
    candidate.approvalBlockedState !== "AWAITING_APPROVAL" &&
    (candidate.status === "READY" || candidate.status === "IN_PROGRESS")
  );
}

export function classifyMonthlyOpportunityEntitlement(
  candidate: Pick<
    MonthlySelectionCandidate,
    "normalizedRemediationFamily" | "category"
  >,
): {
  deliverableKey: "major_content_asset" | "existing_page_optimization";
  entitlementType:
    | "major_content_assets_completed"
    | "existing_page_optimizations_completed";
  reason: string;
} | null {
  if (contentFamilies.has(candidate.normalizedRemediationFamily)) {
    return {
      deliverableKey: "major_content_asset",
      entitlementType: "major_content_assets_completed",
      reason: "Candidate fits the recurring major content asset entitlement.",
    };
  }

  if (
    pageOptimizationFamilies.has(candidate.normalizedRemediationFamily) ||
    candidate.category === "seo" ||
    candidate.category === "conversion"
  ) {
    return {
      deliverableKey: "existing_page_optimization",
      entitlementType: "existing_page_optimizations_completed",
      reason: "Candidate fits the recurring existing-page optimization entitlement.",
    };
  }

  return null;
}

function olderFirst(left: MonthlySelectionCandidate, right: MonthlySelectionCandidate) {
  return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
}

export function compareMonthlySelectionCandidates(
  left: MonthlySelectionCandidate,
  right: MonthlySelectionCandidate,
): number {
  const leftCritical = isUnresolvedCritical(left);
  const rightCritical = isUnresolvedCritical(right);

  if (leftCritical !== rightCritical) return leftCritical ? -1 : 1;

  const leftHigh = isApprovedInScopeHigh(left);
  const rightHigh = isApprovedInScopeHigh(right);

  if (leftHigh !== rightHigh) return leftHigh ? -1 : 1;

  const leftContractual = classifyMonthlyOpportunityEntitlement(left) !== null;
  const rightContractual = classifyMonthlyOpportunityEntitlement(right) !== null;

  if (leftContractual !== rightContractual) return leftContractual ? -1 : 1;

  if (left.finalPriority !== right.finalPriority) {
    return right.finalPriority - left.finalPriority;
  }

  if (left.effort !== right.effort) return left.effort - right.effort;

  return olderFirst(left, right);
}

export function sortMonthlySelectionCandidates<
  T extends MonthlySelectionCandidate,
>(candidates: T[]): T[] {
  return [...candidates]
    .filter(isOpenMonthlySelectionCandidate)
    .sort(compareMonthlySelectionCandidates);
}

function entitlementLimit(
  snapshot: MonthlyEntitlementSnapshot,
  entitlementType: MonthlyAccountingKey,
): number {
  if (entitlementType === "major_content_assets_completed") {
    return snapshot.limits.majorContentAssets ?? 0;
  }

  if (entitlementType === "existing_page_optimizations_completed") {
    return snapshot.limits.existingPageOptimizations ?? 0;
  }

  return 0;
}

function usageFor(
  usage: MonthlySelectionUsage,
  entitlementType: MonthlyAccountingKey,
): number {
  if (entitlementType === "major_content_assets_completed") {
    return usage.majorContentAssetsCompleted;
  }

  if (entitlementType === "existing_page_optimizations_completed") {
    return usage.existingPageOptimizationsCompleted;
  }

  return 0;
}

function incrementUsage(
  usage: MonthlySelectionUsage,
  entitlementType: MonthlyAccountingKey,
): MonthlySelectionUsage {
  if (entitlementType === "major_content_assets_completed") {
    return {
      ...usage,
      majorContentAssetsCompleted: usage.majorContentAssetsCompleted + 1,
    };
  }

  if (entitlementType === "existing_page_optimizations_completed") {
    return {
      ...usage,
      existingPageOptimizationsCompleted:
        usage.existingPageOptimizationsCompleted + 1,
    };
  }

  return usage;
}

export function selectMonthlyWork(input: {
  candidates: MonthlySelectionCandidate[];
  snapshot: MonthlyEntitlementSnapshot;
  usage?: Partial<MonthlySelectionUsage>;
}): MonthlySelectedWork[] {
  let usage: MonthlySelectionUsage = {
    majorContentAssetsCompleted: input.usage?.majorContentAssetsCompleted ?? 0,
    existingPageOptimizationsCompleted:
      input.usage?.existingPageOptimizationsCompleted ?? 0,
  };
  const selected: MonthlySelectedWork[] = [];

  for (const candidate of sortMonthlySelectionCandidates(input.candidates)) {
    const entitlement = classifyMonthlyOpportunityEntitlement(candidate);
    const critical = isUnresolvedCritical(candidate);
    const approvedHigh = isApprovedInScopeHigh(candidate);
    const includedEntitlement =
      entitlement && candidate.planScope === "INCLUDED"
        ? entitlement
        : null;
    const entitlementHasCapacity =
      includedEntitlement !== null &&
      usageFor(usage, includedEntitlement.entitlementType) <
        entitlementLimit(input.snapshot, includedEntitlement.entitlementType);
    const selectedForContract =
      includedEntitlement !== null && entitlementHasCapacity;

    if (!critical && !approvedHigh && !selectedForContract) {
      continue;
    }

    const consumesEntitlement = selectedForContract;
    const selectedReason = critical
      ? "unresolved CRITICAL issue"
      : approvedHigh
        ? "approved/in-scope HIGH opportunity"
        : "contractual recurring deliverable not yet fulfilled";

    selected.push({
      candidate,
      selectedReason,
      contractualDeliverableKey: selectedForContract
        ? includedEntitlement.deliverableKey
        : null,
      contractualDeliverableReason: selectedForContract
        ? includedEntitlement.reason
        : null,
      consumesEntitlement,
      entitlementType: selectedForContract
        ? includedEntitlement.entitlementType
        : null,
      entitlementUnits: consumesEntitlement ? 1 : 0,
    });

    if (includedEntitlement && consumesEntitlement) {
      usage = incrementUsage(usage, includedEntitlement.entitlementType);
    }
  }

  return selected;
}
