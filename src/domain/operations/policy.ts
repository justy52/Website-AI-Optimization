export class OperationsValidationError extends Error {
  constructor(message: string, public readonly code: "PAUSED" | "BUDGET" | "RATE_LIMIT" | "VALIDATION" | "MANUAL_REVIEW" = "VALIDATION") { super(message); this.name = "OperationsValidationError"; }
}
export type OperationAction = "audit" | "monitor" | "prepare" | "verification" | "visibility" | "qa_execute" | "monthly_cycle" | "export" | "cleanup" | "recovery";
export const RATE_LIMITS: Record<OperationAction, number> = { audit: 6, monitor: 10, prepare: 12, verification: 12, visibility: 6, qa_execute: 6, monthly_cycle: 10, export: 2, cleanup: 4, recovery: 4 };
export const DEFAULT_BUDGETS = { monthlyCostUsd: "0", activeWorkflowLimit: 5, aiCallLimit: 100, visibilityCallLimit: 100, crawlConcurrency: 2 };
export type PauseState = { pausedAll: boolean; pausedMonitoring: boolean; pausedAi: boolean; pausedExecution: boolean };
export const UNPAUSED: PauseState = { pausedAll: false, pausedMonitoring: false, pausedAi: false, pausedExecution: false };
export function pauseApplies(state: PauseState, action: OperationAction) {
  if (["export", "cleanup", "recovery"].includes(action)) return false;
  return state.pausedAll || (["audit", "monitor"].includes(action) && state.pausedMonitoring) || (["prepare", "visibility"].includes(action) && state.pausedAi) || (action === "qa_execute" && state.pausedExecution);
}
export function rateWindow(at: Date) { return new Date(Math.floor(at.getTime() / 60000) * 60000); }
export type BudgetLimits = typeof DEFAULT_BUDGETS;
export type BudgetUsage = { committedCostUsd: number; aiCalls: number; visibilityCalls: number; active: number; crawls: number; unknownUnreservedCosts: number };
export function assertBudget(limits: BudgetLimits, usage: BudgetUsage, next: { costUsd?: number; aiCalls?: number; visibilityCalls?: number; workflow?: boolean; crawl?: boolean }) {
  const cost = next.costUsd ?? 0;
  if (cost > 0 && (usage.unknownUnreservedCosts > 0 || usage.committedCostUsd + cost > Number(limits.monthlyCostUsd))) throw new OperationsValidationError("Workspace monthly provider-cost ceiling reached, or unreported cost requires review. No new provider work was started.", "BUDGET");
  if ((next.aiCalls ?? 0) > 0 && usage.aiCalls + next.aiCalls! > limits.aiCallLimit) throw new OperationsValidationError("Workspace monthly AI-call ceiling reached.", "BUDGET");
  if ((next.visibilityCalls ?? 0) > 0 && usage.visibilityCalls + next.visibilityCalls! > limits.visibilityCallLimit) throw new OperationsValidationError("Workspace monthly visibility-call ceiling reached.", "BUDGET");
  if (next.workflow && usage.active >= limits.activeWorkflowLimit) throw new OperationsValidationError("Workspace active workflow ceiling reached.", "BUDGET");
  if (next.crawl && usage.crawls >= limits.crawlConcurrency) throw new OperationsValidationError("Workspace crawl/monitor concurrency ceiling reached.", "BUDGET");
}
export function usdFromCents(value: number | null | undefined) { return value == null ? null : (value / 100).toFixed(6); }
export function safeUsageCost(provider: string, value: number | null | undefined) { return provider === "deterministic" ? "0" : value && value > 0 ? usdFromCents(value) : null; }
