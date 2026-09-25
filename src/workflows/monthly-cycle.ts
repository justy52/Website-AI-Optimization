import { OperationsValidationError } from "@/domain/operations/policy";
import { createScheduledMonthlyCycle } from "@/server/monthly-cycles";

export async function monthlyCycleCreationWorkflow(input: {
  workspaceId: string;
  clientId: string;
  year: number;
  month: number;
}) {
  "use workflow";

  return runMonthlyCycleCreationStep(input);
}

export async function runMonthlyCycleCreationStep(input: {
  workspaceId: string;
  clientId: string;
  year: number;
  month: number;
}) {
  "use step";

  return createScheduledMonthlyCycle(input.workspaceId, input.clientId, {
    year: input.year,
    month: input.month,
  }).catch(error => { if (error instanceof OperationsValidationError) return { skipped: true, reason: error.code }; throw error; });
}
