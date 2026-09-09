import { createHash } from "node:crypto";

import type { MonthlyEntitlementSnapshot } from "./entitlements";

export const MONTHLY_REPORT_METHODOLOGY_VERSION =
  "monthly-report-deterministic-v1.0";

export type MonthlyReportCycleInput = {
  id: string;
  clientName: string;
  servicePlan: string;
  servicePlanVersion: string;
  periodStartDate: string | Date;
  periodEndDate: string | Date;
  timezone: string;
  entitlementSnapshot: MonthlyEntitlementSnapshot;
};

export type MonthlyReportDeliverableInput = {
  title: string;
  status: string;
  targetCount: number;
  completedCount: number;
  entitlementSourceRule: string;
  limitations?: Record<string, unknown>;
  waiverReason?: string | null;
};

export type MonthlyReportWorkInput = {
  title: string;
  status: string;
  completionState: string;
  selectedReason: string;
  entitlementType?: string | null;
  entitlementUnits?: number;
  manualImplementationMinutes?: number;
  verificationStatus?: string | null;
};

export type MonthlyReportMonitoringInput = {
  websiteHealthRuns: number;
  searchConsoleRuns: number;
  searchConsoleUnavailable: boolean;
  failures: number;
  newOpportunities: number;
  criticalRegressions: number;
};

export type MonthlyReportCompetitorInput = {
  activeTargets: number;
  observations: number;
  materialMetadataChanges: number;
  limitations: string[];
};

export type MonthlyReportDraftInput = {
  cycle: MonthlyReportCycleInput;
  deliverables: MonthlyReportDeliverableInput[];
  workItems: MonthlyReportWorkInput[];
  monitoring: MonthlyReportMonitoringInput;
  competitor: MonthlyReportCompetitorInput;
  unresolvedRisks: { title: string; severity: string; priority: number }[];
};

export type BuiltMonthlyReport = {
  title: string;
  executiveSummary: string;
  methodologyVersion: typeof MONTHLY_REPORT_METHODOLOGY_VERSION;
  sourceWindows: Record<string, unknown>;
  sections: Record<string, unknown>;
  dataLimitations: Record<string, unknown>[];
};

function dateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function statusCounts(items: { status: string }[]) {
  return items.reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {});
}

function completionCounts(items: { completionState: string }[]) {
  return items.reduce<Record<string, number>>((counts, item) => {
    counts[item.completionState] = (counts[item.completionState] ?? 0) + 1;
    return counts;
  }, {});
}

function limitationFromDeliverable(
  deliverable: MonthlyReportDeliverableInput,
): Record<string, unknown> | null {
  if (deliverable.status === "BLOCKED") {
    return {
      source: deliverable.title,
      status: "BLOCKED",
      limitations: deliverable.limitations ?? {},
    };
  }

  if (deliverable.status === "UNAVAILABLE") {
    return {
      source: deliverable.title,
      status: "UNAVAILABLE",
      limitations: deliverable.limitations ?? {},
    };
  }

  if (deliverable.status === "WAIVED") {
    return {
      source: deliverable.title,
      status: "WAIVED",
      reason: deliverable.waiverReason ?? "Waived by authorized user.",
    };
  }

  return null;
}

export function buildMonthlyReportDraft(
  input: MonthlyReportDraftInput,
): BuiltMonthlyReport {
  const periodStart = dateOnly(input.cycle.periodStartDate);
  const periodEnd = dateOnly(input.cycle.periodEndDate);
  const completedWork = input.workItems.filter(
    (item) =>
      item.completionState === "VERIFIED" ||
      item.completionState === "IMPLEMENTED_UNVERIFIED" ||
      item.completionState === "APPROVED_FOR_MANUAL_IMPLEMENTATION",
  );
  const deliverableCounts = statusCounts(input.deliverables);
  const workCompletionCounts = completionCounts(input.workItems);
  const manualMinutes = input.workItems.reduce(
    (total, item) => total + (item.manualImplementationMinutes ?? 0),
    0,
  );
  const dataLimitations = [
    ...input.deliverables
      .map(limitationFromDeliverable)
      .filter((item): item is Record<string, unknown> => item !== null),
    ...input.competitor.limitations.map((limitation) => ({
      source: "Competitor review",
      status: "LIMITED",
      limitation,
    })),
  ];
  const unresolvedCritical = input.unresolvedRisks.filter(
    (risk) => risk.severity === "CRITICAL",
  ).length;

  return {
    title: `${input.cycle.clientName} Monthly Optimization Report`,
    executiveSummary: [
      `${input.cycle.clientName} cycle ${periodStart} to ${periodEnd}.`,
      `${completedWork.length} work item(s) are prepared, approved, implemented, or verified.`,
      `${deliverableCounts.BLOCKED ?? 0} deliverable(s) are blocked and ${deliverableCounts.UNAVAILABLE ?? 0} are unavailable.`,
      unresolvedCritical > 0
        ? `${unresolvedCritical} unresolved CRITICAL item(s) remain visible for follow-up.`
        : "No unresolved CRITICAL item is hidden from this report.",
    ].join(" "),
    methodologyVersion: MONTHLY_REPORT_METHODOLOGY_VERSION,
    sourceWindows: {
      cyclePeriod: { startDate: periodStart, endDate: periodEnd },
      timezone: input.cycle.timezone,
      monitoringWindow: { startDate: periodStart, endDate: periodEnd },
      competitorWindow: { startDate: periodStart, endDate: periodEnd },
    },
    sections: {
      executiveSummary: {
        periodStart,
        periodEnd,
        servicePlan: input.cycle.servicePlan,
        servicePlanVersion: input.cycle.servicePlanVersion,
      },
      workCompleted: {
        totalTracked: input.workItems.length,
        completionCounts: workCompletionCounts,
        items: completedWork.map((item) => ({
          title: item.title,
          status: item.status,
          completionState: item.completionState,
          selectedReason: item.selectedReason,
          verificationStatus: item.verificationStatus ?? null,
        })),
      },
      websiteHealth: {
        runsCompleted: input.monitoring.websiteHealthRuns,
        failures: input.monitoring.failures,
        criticalRegressions: input.monitoring.criticalRegressions,
      },
      searchPerformance: {
        runsCompleted: input.monitoring.searchConsoleRuns,
        status: input.monitoring.searchConsoleUnavailable
          ? "BLOCKED / SEARCH CONSOLE NOT CONNECTED"
          : "AVAILABLE_WHEN_CONNECTED_DATA_EXISTS",
      },
      competitorChanges: {
        activeTargets: input.competitor.activeTargets,
        observations: input.competitor.observations,
        materialMetadataChanges: input.competitor.materialMetadataChanges,
        unavailableRankKeywordData: true,
      },
      opportunitiesAndRisks: {
        newOpportunities: input.monitoring.newOpportunities,
        unresolvedRisks: input.unresolvedRisks,
      },
      deliverablesAndPlanUsage: {
        deliverableStatusCounts: deliverableCounts,
        manualImplementationMinutesUsed: manualMinutes,
        manualImplementationMinutesIncluded:
          input.cycle.entitlementSnapshot.limits.manualImplementationMinutes,
        existingPageOptimizationsIncluded:
          input.cycle.entitlementSnapshot.limits.existingPageOptimizations,
        majorContentAssetsIncluded:
          input.cycle.entitlementSnapshot.limits.majorContentAssets,
        noRollover: true,
      },
      nextMonthPriorities: input.unresolvedRisks
        .slice()
        .sort((left, right) => right.priority - left.priority)
        .slice(0, 5),
      dataLimitations,
    },
    dataLimitations,
  };
}

export function monthlyReportSnapshotHash(snapshot: unknown): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
