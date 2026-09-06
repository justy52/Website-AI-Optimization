import { UnknownDefinitionVersionError } from "@/domain/definitions";

export const SERVICE_PLAN_DEFINITION_VERSION = "service-plans-v1.0";

export const servicePlanKeys = [
  "NONE",
  "AUDIT_ONLY",
  "LAUNCH",
  "ESSENTIALS",
  "GROWTH",
  "PRO",
  "CUSTOM",
] as const;

export type ServicePlanKey = (typeof servicePlanKeys)[number];

export type MonitoringCadence = "none" | "weekly" | "monthly" | "twice_monthly";

export type ServicePlanDefinition = {
  version: typeof SERVICE_PLAN_DEFINITION_VERSION;
  key: ServicePlanKey;
  label: string;
  monthlyPriceCents: number | null;
  monitoring: {
    websiteHealth: MonitoringCadence;
    searchConsole: MonitoringCadence;
    rankKeywordObservation: MonitoringCadence;
    competitorDeepReview: MonitoringCadence;
    aiReadinessRecheck: MonitoringCadence;
    observedAiVisibility: MonitoringCadence;
  };
  limits: {
    trackedPriorityKeywords: number | null;
    configuredCompetitors: number | null;
    observedAiVisibilityPrompts: number | null;
    observedAiVisibilitySurfaces: number | null;
    majorContentAssets: number | null;
    existingPageOptimizations: number | null;
    manualImplementationMinutes: number | null;
  };
  quarterlyStrategy: "not_included" | "internal_optional" | "included";
};

export const servicePlanDefinitions: Record<
  ServicePlanKey,
  ServicePlanDefinition
> = {
  NONE: {
    version: SERVICE_PLAN_DEFINITION_VERSION,
    key: "NONE",
    label: "None",
    monthlyPriceCents: null,
    monitoring: {
      websiteHealth: "none",
      searchConsole: "none",
      rankKeywordObservation: "none",
      competitorDeepReview: "none",
      aiReadinessRecheck: "none",
      observedAiVisibility: "none",
    },
    limits: {
      trackedPriorityKeywords: 0,
      configuredCompetitors: 0,
      observedAiVisibilityPrompts: 0,
      observedAiVisibilitySurfaces: 0,
      majorContentAssets: 0,
      existingPageOptimizations: 0,
      manualImplementationMinutes: 0,
    },
    quarterlyStrategy: "not_included",
  },
  AUDIT_ONLY: {
    version: SERVICE_PLAN_DEFINITION_VERSION,
    key: "AUDIT_ONLY",
    label: "Audit Only",
    monthlyPriceCents: null,
    monitoring: {
      websiteHealth: "none",
      searchConsole: "none",
      rankKeywordObservation: "none",
      competitorDeepReview: "none",
      aiReadinessRecheck: "none",
      observedAiVisibility: "none",
    },
    limits: {
      trackedPriorityKeywords: 0,
      configuredCompetitors: 0,
      observedAiVisibilityPrompts: 0,
      observedAiVisibilitySurfaces: 0,
      majorContentAssets: 0,
      existingPageOptimizations: 0,
      manualImplementationMinutes: 0,
    },
    quarterlyStrategy: "not_included",
  },
  LAUNCH: {
    version: SERVICE_PLAN_DEFINITION_VERSION,
    key: "LAUNCH",
    label: "Optimization Launch",
    monthlyPriceCents: null,
    monitoring: {
      websiteHealth: "none",
      searchConsole: "none",
      rankKeywordObservation: "none",
      competitorDeepReview: "none",
      aiReadinessRecheck: "none",
      observedAiVisibility: "none",
    },
    limits: {
      trackedPriorityKeywords: null,
      configuredCompetitors: null,
      observedAiVisibilityPrompts: null,
      observedAiVisibilitySurfaces: null,
      majorContentAssets: null,
      existingPageOptimizations: null,
      manualImplementationMinutes: null,
    },
    quarterlyStrategy: "not_included",
  },
  ESSENTIALS: {
    version: SERVICE_PLAN_DEFINITION_VERSION,
    key: "ESSENTIALS",
    label: "Essentials",
    monthlyPriceCents: 75000,
    monitoring: {
      websiteHealth: "weekly",
      searchConsole: "weekly",
      rankKeywordObservation: "weekly",
      competitorDeepReview: "monthly",
      aiReadinessRecheck: "monthly",
      observedAiVisibility: "monthly",
    },
    limits: {
      trackedPriorityKeywords: 25,
      configuredCompetitors: 3,
      observedAiVisibilityPrompts: 10,
      observedAiVisibilitySurfaces: 1,
      majorContentAssets: 0,
      existingPageOptimizations: 1,
      manualImplementationMinutes: 120,
    },
    quarterlyStrategy: "not_included",
  },
  GROWTH: {
    version: SERVICE_PLAN_DEFINITION_VERSION,
    key: "GROWTH",
    label: "Growth",
    monthlyPriceCents: 125000,
    monitoring: {
      websiteHealth: "weekly",
      searchConsole: "weekly",
      rankKeywordObservation: "weekly",
      competitorDeepReview: "monthly",
      aiReadinessRecheck: "monthly",
      observedAiVisibility: "monthly",
    },
    limits: {
      trackedPriorityKeywords: 75,
      configuredCompetitors: 5,
      observedAiVisibilityPrompts: 20,
      observedAiVisibilitySurfaces: 2,
      majorContentAssets: 1,
      existingPageOptimizations: 1,
      manualImplementationMinutes: 240,
    },
    quarterlyStrategy: "internal_optional",
  },
  PRO: {
    version: SERVICE_PLAN_DEFINITION_VERSION,
    key: "PRO",
    label: "Pro",
    monthlyPriceCents: 200000,
    monitoring: {
      websiteHealth: "weekly",
      searchConsole: "weekly",
      rankKeywordObservation: "weekly",
      competitorDeepReview: "monthly",
      aiReadinessRecheck: "monthly",
      observedAiVisibility: "twice_monthly",
    },
    limits: {
      trackedPriorityKeywords: 150,
      configuredCompetitors: 8,
      observedAiVisibilityPrompts: 30,
      observedAiVisibilitySurfaces: 3,
      majorContentAssets: 2,
      existingPageOptimizations: 2,
      manualImplementationMinutes: 420,
    },
    quarterlyStrategy: "included",
  },
  CUSTOM: {
    version: SERVICE_PLAN_DEFINITION_VERSION,
    key: "CUSTOM",
    label: "Custom",
    monthlyPriceCents: null,
    monitoring: {
      websiteHealth: "weekly",
      searchConsole: "weekly",
      rankKeywordObservation: "weekly",
      competitorDeepReview: "monthly",
      aiReadinessRecheck: "monthly",
      observedAiVisibility: "monthly",
    },
    limits: {
      trackedPriorityKeywords: null,
      configuredCompetitors: null,
      observedAiVisibilityPrompts: null,
      observedAiVisibilitySurfaces: null,
      majorContentAssets: null,
      existingPageOptimizations: null,
      manualImplementationMinutes: null,
    },
    quarterlyStrategy: "internal_optional",
  },
};

export const servicePlanDefinitionsByVersion: Record<
  typeof SERVICE_PLAN_DEFINITION_VERSION,
  typeof servicePlanDefinitions
> = {
  [SERVICE_PLAN_DEFINITION_VERSION]: servicePlanDefinitions,
};

export function getServicePlanDefinition(
  plan: ServicePlanKey,
  version = SERVICE_PLAN_DEFINITION_VERSION,
): ServicePlanDefinition {
  const definitions =
    servicePlanDefinitionsByVersion[
      version as keyof typeof servicePlanDefinitionsByVersion
    ];

  if (!definitions) {
    throw new UnknownDefinitionVersionError("service plan", version);
  }

  return definitions[plan];
}
