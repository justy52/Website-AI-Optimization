import {
  getServicePlanDefinition,
  SERVICE_PLAN_DEFINITION_VERSION,
  type MonitoringCadence,
  type ServicePlanDefinition,
  type ServicePlanKey,
} from "@/domain/service-plans";

export const MONTHLY_CYCLE_DEFINITION_VERSION = "monthly-cycle-v1.0";

export type MonthlyAccountingKey =
  | "agent_work_units"
  | "manual_implementation_minutes"
  | "major_content_assets_completed"
  | "existing_page_optimizations_completed"
  | "ai_visibility_observations_used"
  | "competitor_targets_active"
  | "tracked_keywords_active";

export type MonthlyDeliverableStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "READY_FOR_REVIEW"
  | "COMPLETE"
  | "UNAVAILABLE"
  | "NOT_APPLICABLE"
  | "WAIVED";

export type MonthlyDeliverableType =
  | "WEBSITE_HEALTH"
  | "SEARCH_CONSOLE"
  | "COMPETITOR_REVIEW"
  | "AI_READINESS_RECHECK"
  | "OBSERVED_AI_VISIBILITY"
  | "MAJOR_CONTENT_ASSET"
  | "EXISTING_PAGE_OPTIMIZATION"
  | "MONTHLY_REPORT"
  | "QUARTERLY_STRATEGY";

export type CyclePeriod = {
  year: number;
  month: number;
  startDate: string;
  endDate: string;
};

export type MonthlyEntitlementSnapshot = {
  definitionVersion: typeof MONTHLY_CYCLE_DEFINITION_VERSION;
  servicePlanDefinitionVersion: typeof SERVICE_PLAN_DEFINITION_VERSION;
  servicePlan: ServicePlanKey;
  label: string;
  monthlyPriceCents: number | null;
  monitoring: ServicePlanDefinition["monitoring"];
  limits: ServicePlanDefinition["limits"];
  quarterlyStrategy: ServicePlanDefinition["quarterlyStrategy"];
  accountingKeys: MonthlyAccountingKey[];
  noRollover: true;
  deferredProviders: {
    observedAiVisibility: "PROVIDER_NOT_ACTIVE";
    rankKeywordObservation: "PROVIDER_NOT_ACTIVE";
  };
};

export type MonthlyDeliverableTemplate = {
  key: string;
  type: MonthlyDeliverableType;
  title: string;
  status: MonthlyDeliverableStatus;
  entitlementSourceRule: string;
  servicePlanVersion: string;
  targetCount: number;
  completedCount: number;
  consumesEntitlement: boolean;
  entitlementType: MonthlyAccountingKey | null;
  entitlementUnits: number;
  limitations: Record<string, unknown>;
};

export const monthlyAccountingKeys: MonthlyAccountingKey[] = [
  "agent_work_units",
  "manual_implementation_minutes",
  "major_content_assets_completed",
  "existing_page_optimizations_completed",
  "ai_visibility_observations_used",
  "competitor_targets_active",
  "tracked_keywords_active",
];

export const recurringMonthlyPlans: ServicePlanKey[] = [
  "ESSENTIALS",
  "GROWTH",
  "PRO",
];

export function shouldCreateRecurringMonthlyCycle(
  plan: ServicePlanKey,
): boolean {
  return recurringMonthlyPlans.includes(plan);
}

export function buildMonthlyEntitlementSnapshot(
  plan: ServicePlanKey,
  version = SERVICE_PLAN_DEFINITION_VERSION,
): MonthlyEntitlementSnapshot {
  const definition = getServicePlanDefinition(plan, version);

  if (definition.version !== SERVICE_PLAN_DEFINITION_VERSION) {
    throw new Error(`Unsupported service-plan definition version: ${version}.`);
  }

  return {
    definitionVersion: MONTHLY_CYCLE_DEFINITION_VERSION,
    servicePlanDefinitionVersion: definition.version,
    servicePlan: definition.key,
    label: definition.label,
    monthlyPriceCents: definition.monthlyPriceCents,
    monitoring: definition.monitoring,
    limits: definition.limits,
    quarterlyStrategy: definition.quarterlyStrategy,
    accountingKeys: monthlyAccountingKeys,
    noRollover: true,
    deferredProviders: {
      observedAiVisibility: "PROVIDER_NOT_ACTIVE",
      rankKeywordObservation: "PROVIDER_NOT_ACTIVE",
    },
  };
}

function weeksRequired(cadence: MonitoringCadence): number {
  return cadence === "weekly" ? 4 : cadence === "twice_monthly" ? 2 : 1;
}

function hasCadence(cadence: MonitoringCadence): boolean {
  return cadence !== "none";
}

function deliverable(input: Omit<MonthlyDeliverableTemplate, "completedCount">) {
  return {
    ...input,
    completedCount: 0,
  } satisfies MonthlyDeliverableTemplate;
}

export function buildMonthlyDeliverableTemplates(input: {
  snapshot: MonthlyEntitlementSnapshot;
  period: Pick<CyclePeriod, "month">;
  searchConsoleConnected: boolean;
  observedAiVisibilityEnabled?: boolean;
}): MonthlyDeliverableTemplate[] {
  const { snapshot } = input;

  if (!shouldCreateRecurringMonthlyCycle(snapshot.servicePlan)) {
    return [];
  }

  const templates: MonthlyDeliverableTemplate[] = [];

  if (hasCadence(snapshot.monitoring.websiteHealth)) {
    templates.push(
      deliverable({
        key: "website_health",
        type: "WEBSITE_HEALTH",
        title: "Weekly Website Health",
        status: "NOT_STARTED",
        entitlementSourceRule: `${snapshot.label}: Website Health ${snapshot.monitoring.websiteHealth}`,
        servicePlanVersion: snapshot.servicePlanDefinitionVersion,
        targetCount: weeksRequired(snapshot.monitoring.websiteHealth),
        consumesEntitlement: false,
        entitlementType: null,
        entitlementUnits: 0,
        limitations: {},
      }),
    );
  }

  if (hasCadence(snapshot.monitoring.searchConsole)) {
    templates.push(
      deliverable({
        key: "search_console",
        type: "SEARCH_CONSOLE",
        title: "Weekly Search Console",
        status: input.searchConsoleConnected ? "NOT_STARTED" : "BLOCKED",
        entitlementSourceRule: `${snapshot.label}: Search Console ${snapshot.monitoring.searchConsole} when connected`,
        servicePlanVersion: snapshot.servicePlanDefinitionVersion,
        targetCount: weeksRequired(snapshot.monitoring.searchConsole),
        consumesEntitlement: false,
        entitlementType: null,
        entitlementUnits: 0,
        limitations: input.searchConsoleConnected
          ? {}
          : { code: "SEARCH_CONSOLE_NOT_CONNECTED" },
      }),
    );
  }

  if (hasCadence(snapshot.monitoring.competitorDeepReview)) {
    templates.push(
      deliverable({
        key: "competitor_review",
        type: "COMPETITOR_REVIEW",
        title: "Monthly Competitor Review",
        status: "NOT_STARTED",
        entitlementSourceRule: `${snapshot.label}: competitor deep review ${snapshot.monitoring.competitorDeepReview}`,
        servicePlanVersion: snapshot.servicePlanDefinitionVersion,
        targetCount: 1,
        consumesEntitlement: false,
        entitlementType: null,
        entitlementUnits: 0,
        limitations: { rankKeywordData: "PROVIDER_NOT_ACTIVE" },
      }),
    );
  }

  if (hasCadence(snapshot.monitoring.aiReadinessRecheck)) {
    templates.push(
      deliverable({
        key: "ai_readiness_recheck",
        type: "AI_READINESS_RECHECK",
        title: "Monthly AI-Readiness Recheck",
        status: "NOT_STARTED",
        entitlementSourceRule: `${snapshot.label}: AI-readiness recheck ${snapshot.monitoring.aiReadinessRecheck}`,
        servicePlanVersion: snapshot.servicePlanDefinitionVersion,
        targetCount: 1,
        consumesEntitlement: false,
        entitlementType: null,
        entitlementUnits: 0,
        limitations: {},
      }),
    );
  }

  if (hasCadence(snapshot.monitoring.observedAiVisibility)) {
    const enabled = input.observedAiVisibilityEnabled === true;

    templates.push(
      deliverable({
        key: "observed_ai_visibility",
        type: "OBSERVED_AI_VISIBILITY",
        title: "Observed AI Visibility",
        status: enabled ? "NOT_STARTED" : "UNAVAILABLE",
        entitlementSourceRule: `${snapshot.label}: observed AI visibility ${snapshot.monitoring.observedAiVisibility}, up to ${snapshot.limits.observedAiVisibilityPrompts ?? "custom"} prompts`,
        servicePlanVersion: snapshot.servicePlanDefinitionVersion,
        targetCount: snapshot.monitoring.observedAiVisibility === "twice_monthly" ? 2 : 1,
        consumesEntitlement: true,
        entitlementType: "ai_visibility_observations_used",
        entitlementUnits: 0,
        limitations: enabled ? {} : { code: "PROVIDER_NOT_ACTIVE" },
      }),
    );
  }

  const majorContentAssets = snapshot.limits.majorContentAssets ?? 0;

  if (majorContentAssets > 0) {
    templates.push(
      deliverable({
        key: "major_content_asset",
        type: "MAJOR_CONTENT_ASSET",
        title: "Major Content Asset",
        status: "NOT_STARTED",
        entitlementSourceRule: `${snapshot.label}: ${majorContentAssets} major content asset(s) per month`,
        servicePlanVersion: snapshot.servicePlanDefinitionVersion,
        targetCount: majorContentAssets,
        consumesEntitlement: true,
        entitlementType: "major_content_assets_completed",
        entitlementUnits: majorContentAssets,
        limitations: { productionScope: "PREPARE_ONLY_UNTIL_IMPLEMENTED_EXTERNALLY" },
      }),
    );
  }

  const existingPageOptimizations =
    snapshot.limits.existingPageOptimizations ?? 0;

  if (existingPageOptimizations > 0) {
    templates.push(
      deliverable({
        key: "existing_page_optimization",
        type: "EXISTING_PAGE_OPTIMIZATION",
        title: "Existing Page Optimization",
        status: "NOT_STARTED",
        entitlementSourceRule: `${snapshot.label}: ${existingPageOptimizations} existing-page optimization(s) per month`,
        servicePlanVersion: snapshot.servicePlanDefinitionVersion,
        targetCount: existingPageOptimizations,
        consumesEntitlement: true,
        entitlementType: "existing_page_optimizations_completed",
        entitlementUnits: existingPageOptimizations,
        limitations: { executionBoundary: "NO_EXTERNAL_EXECUTE" },
      }),
    );
  }

  templates.push(
    deliverable({
      key: "monthly_report",
      type: "MONTHLY_REPORT",
      title: "Monthly Report",
      status: "NOT_STARTED",
      entitlementSourceRule: `${snapshot.label}: 1 monthly report`,
      servicePlanVersion: snapshot.servicePlanDefinitionVersion,
      targetCount: 1,
      consumesEntitlement: false,
      entitlementType: null,
      entitlementUnits: 0,
      limitations: { finalization: "HUMAN_REQUIRED" },
    }),
  );

  if (snapshot.servicePlan === "PRO") {
    const dueThisMonth = input.period.month % 3 === 0;

    templates.push(
      deliverable({
        key: "quarterly_strategy",
        type: "QUARTERLY_STRATEGY",
        title: "Quarterly Strategy Review",
        status: dueThisMonth ? "NOT_STARTED" : "NOT_APPLICABLE",
        entitlementSourceRule: "Pro: quarterly strategy review included",
        servicePlanVersion: snapshot.servicePlanDefinitionVersion,
        targetCount: dueThisMonth ? 1 : 0,
        consumesEntitlement: false,
        entitlementType: null,
        entitlementUnits: 0,
        limitations: dueThisMonth ? {} : { due: "NOT_DUE_THIS_MONTH" },
      }),
    );
  }

  return templates;
}

export function monthlyPeriodForDate(date: Date): CyclePeriod {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return monthlyPeriod(year, month);
}

export function monthlyPeriod(year: number, month: number): CyclePeriod {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    throw new Error("Cycle year must be an integer from 2000 to 2200.");
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Cycle month must be an integer from 1 to 12.");
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  return {
    year,
    month,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export function cycleDueAt(period: CyclePeriod): Date {
  return new Date(Date.UTC(period.year, period.month, 5, 23, 59, 59));
}
