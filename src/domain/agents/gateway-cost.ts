import type {
  GatewayGenerationInfo,
  GatewayLanguageModelEntry,
} from "@ai-sdk/gateway";

import { AgentBudgetError, byteLength, type AgentRunBudgetSnapshot } from "./budget";

export type GatewayModelPricing = NonNullable<GatewayLanguageModelEntry["pricing"]>;

export type GatewayCostEstimate = {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costCents: number;
};

export type GatewayActualCost = {
  generationId: string;
  providerName: string;
  model: string;
  costUsd: number;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  metadata: Record<string, unknown>;
};

export function parseUsdPerToken(value: string, label: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new AgentBudgetError(
      `AI Gateway ${label} pricing is unavailable or invalid.`,
      "COST_LIMIT",
    );
  }

  return parsed;
}

export function estimatePromptTokens(text: string): number {
  return Math.ceil(byteLength(text) / 4);
}

export function usdToConservativeCents(costUsd: number): number {
  if (!Number.isFinite(costUsd) || costUsd < 0) {
    throw new AgentBudgetError(
      "AI Gateway cost metadata is unavailable or invalid.",
      "COST_LIMIT",
    );
  }

  if (costUsd === 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(costUsd * 100));
}

export function estimateGatewayGenerationCost(input: {
  prompt: string;
  maxOutputTokens: number;
  pricing: GatewayModelPricing;
}): GatewayCostEstimate {
  const inputTokens = estimatePromptTokens(input.prompt);
  const outputTokens = input.maxOutputTokens;
  const inputCost = parseUsdPerToken(input.pricing.input, "input");
  const outputCost = parseUsdPerToken(input.pricing.output, "output");
  const costUsd = inputTokens * inputCost + outputTokens * outputCost;

  return {
    inputTokens,
    outputTokens,
    costUsd,
    costCents: usdToConservativeCents(costUsd),
  };
}

export function assertGatewayEstimateWithinBudget(
  estimate: GatewayCostEstimate,
  budget: AgentRunBudgetSnapshot,
): void {
  if (estimate.costCents > budget.maxCostCents) {
    throw new AgentBudgetError(
      `Estimated AI Gateway cost limit exceeded: ${estimate.costCents}/${budget.maxCostCents}.`,
      "COST_LIMIT",
    );
  }
}

export function extractGatewayGenerationId(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }

  const gatewayMetadata = (metadata as Record<string, unknown>).gateway;

  if (!gatewayMetadata || typeof gatewayMetadata !== "object") {
    return undefined;
  }

  const generationId = (gatewayMetadata as Record<string, unknown>).generationId;

  return typeof generationId === "string" && generationId.length > 0
    ? generationId
    : undefined;
}

export function gatewayActualCostFromGenerationInfo(
  generation: GatewayGenerationInfo,
): GatewayActualCost {
  const totalTokens =
    generation.promptTokens +
    generation.completionTokens +
    generation.reasoningTokens;

  return {
    generationId: generation.id,
    providerName: generation.providerName,
    model: generation.model,
    costUsd: generation.totalCost,
    costCents: usdToConservativeCents(generation.totalCost),
    inputTokens: generation.promptTokens,
    outputTokens: generation.completionTokens,
    reasoningTokens: generation.reasoningTokens,
    totalTokens,
    metadata: {
      gateway: {
        generationId: generation.id,
        providerName: generation.providerName,
        model: generation.model,
        totalCostUsd: generation.totalCost,
        finishReason: generation.finishReason,
        latencyMs: generation.latency,
        generationTimeMs: generation.generationTime,
        billableWebSearchCalls: generation.billableWebSearchCalls,
      },
    },
  };
}
