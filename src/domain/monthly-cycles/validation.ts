export class MonthlyCycleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonthlyCycleValidationError";
  }
}

export function isManualMonthlyDeliverable(key: string) {
  return key === "quarterly_strategy";
}

export function countedDeliverableState(targetCount: number, actualCount: number) {
  return actualCount >= targetCount && targetCount > 0
    ? "COMPLETE" as const
    : actualCount > 0 ? "IN_PROGRESS" as const : "NOT_STARTED" as const;
}

export function deliverableAllowsClose(item: {
  deliverableKey: string;
  status: string;
  targetCount: number;
  completedCount: number;
  completedAt: Date | null;
  completedByUserId: string | null;
  completionEvidence: Record<string, unknown>;
  limitations: Record<string, unknown>;
  waivedAt: Date | null;
  waivedByUserId: string | null;
  waiverReason: string | null;
}) {
  if (item.status === "WAIVED") {
    return Boolean(item.waivedAt && item.waivedByUserId && item.waiverReason?.trim());
  }
  if (item.status === "UNAVAILABLE") {
    return item.deliverableKey === "observed_ai_visibility" &&
      item.limitations.code === "PROVIDER_NOT_ACTIVE" && item.completedCount === 0;
  }
  if (item.status === "NOT_APPLICABLE") {
    return item.deliverableKey === "quarterly_strategy" && item.targetCount === 0 &&
      item.limitations.due === "NOT_DUE_THIS_MONTH";
  }
  if (item.status !== "COMPLETE" || item.targetCount <= 0 ||
      item.completedCount < item.targetCount || !item.completedAt) return false;
  return !isManualMonthlyDeliverable(item.deliverableKey) ||
    Boolean(item.completedByUserId && String(item.completionEvidence.summary ?? "").trim());
}
