import type { WorkspaceContext } from "@/domain/tenancy/context";
import { executeMonitoringRun } from "@/server/monitoring";

export async function monitoringRunWorkflow(
  monitoringRunId: string,
  context: WorkspaceContext,
) {
  "use workflow";

  return runMonitoringStep(monitoringRunId, context);
}

export async function runMonitoringStep(
  monitoringRunId: string,
  context: WorkspaceContext,
) {
  "use step";

  return executeMonitoringRun(context, monitoringRunId);
}
