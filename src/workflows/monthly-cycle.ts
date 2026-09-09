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
  });
}
