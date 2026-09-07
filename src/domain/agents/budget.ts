import type { AgentBudgetLimits } from "./catalog";

export type AgentRunBudgetSnapshot = AgentBudgetLimits & {
  capturedAt: string;
};

export class AgentBudgetError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "TOOL_CALL_LIMIT"
      | "MODEL_CALL_LIMIT"
      | "EVIDENCE_SIZE_LIMIT"
      | "INPUT_SIZE_LIMIT"
      | "OUTPUT_SIZE_LIMIT"
      | "COST_LIMIT",
  ) {
    super(message);
    this.name = "AgentBudgetError";
  }
}

export type AgentBudgetUsage = {
  toolCalls: number;
  modelCalls: number;
  evidenceBytes: number;
  inputBytes: number;
  outputBytes: number;
  costCents: number;
};

export function createBudgetSnapshot(
  limits: AgentBudgetLimits,
  capturedAt = new Date(),
): AgentRunBudgetSnapshot {
  return {
    ...limits,
    capturedAt: capturedAt.toISOString(),
  };
}

export function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export function assertWithinBudget(
  snapshot: AgentRunBudgetSnapshot | AgentBudgetLimits,
  usage: AgentBudgetUsage,
): void {
  if (usage.toolCalls > snapshot.maxToolCalls) {
    throw new AgentBudgetError(
      `Agent tool-call limit exceeded: ${usage.toolCalls}/${snapshot.maxToolCalls}.`,
      "TOOL_CALL_LIMIT",
    );
  }

  if (usage.modelCalls > snapshot.maxModelCalls) {
    throw new AgentBudgetError(
      `Agent model-call limit exceeded: ${usage.modelCalls}/${snapshot.maxModelCalls}.`,
      "MODEL_CALL_LIMIT",
    );
  }

  if (usage.evidenceBytes > snapshot.maxEvidenceBytes) {
    throw new AgentBudgetError(
      `Agent evidence-size limit exceeded: ${usage.evidenceBytes}/${snapshot.maxEvidenceBytes}.`,
      "EVIDENCE_SIZE_LIMIT",
    );
  }

  if (usage.inputBytes > snapshot.maxInputBytes) {
    throw new AgentBudgetError(
      `Agent input-size limit exceeded: ${usage.inputBytes}/${snapshot.maxInputBytes}.`,
      "INPUT_SIZE_LIMIT",
    );
  }

  if (usage.outputBytes > snapshot.maxOutputBytes) {
    throw new AgentBudgetError(
      `Agent output-size limit exceeded: ${usage.outputBytes}/${snapshot.maxOutputBytes}.`,
      "OUTPUT_SIZE_LIMIT",
    );
  }

  if (usage.costCents > snapshot.maxCostCents) {
    throw new AgentBudgetError(
      `Agent cost limit exceeded: ${usage.costCents}/${snapshot.maxCostCents}.`,
      "COST_LIMIT",
    );
  }
}
