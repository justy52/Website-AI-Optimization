import {
  getServicePlanDefinition,
  type MonitoringCadence,
  type ServicePlanKey,
} from "@/domain/service-plans";

export const WEBSITE_HEALTH_MONITOR_KEY = "website_health";
export const SEARCH_CONSOLE_MONITOR_KEY = "search_console";
export const MONITOR_DEFINITION_VERSION = "phase4a-monitor-v1.0";

export type Phase4aMonitorKey =
  | typeof WEBSITE_HEALTH_MONITOR_KEY
  | typeof SEARCH_CONSOLE_MONITOR_KEY;

export type MonitorDefinition = {
  key: Phase4aMonitorKey;
  version: typeof MONITOR_DEFINITION_VERSION;
  name: string;
  cadence: MonitoringCadence;
  enabled: boolean;
};

export function monitorDefinitionsForPlan(
  plan: ServicePlanKey,
  version?: string,
): MonitorDefinition[] {
  const definition = getServicePlanDefinition(plan, version);

  return [
    {
      key: WEBSITE_HEALTH_MONITOR_KEY,
      version: MONITOR_DEFINITION_VERSION,
      name: "Website Health",
      cadence: definition.monitoring.websiteHealth,
      enabled: definition.monitoring.websiteHealth !== "none",
    },
    {
      key: SEARCH_CONSOLE_MONITOR_KEY,
      version: MONITOR_DEFINITION_VERSION,
      name: "Search Console",
      cadence: definition.monitoring.searchConsole,
      enabled: definition.monitoring.searchConsole !== "none",
    },
  ];
}

export function nextRunAtForCadence(
  cadence: MonitoringCadence,
  from = new Date(),
): Date | null {
  if (cadence === "none") return null;

  const next = new Date(from);

  if (cadence === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
  } else if (cadence === "twice_monthly") {
    next.setUTCDate(next.getUTCDate() + 14);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }

  return next;
}
