import { describe, expect, it } from "vitest";

import { createBudgetSnapshot, AgentBudgetError } from "./budget";
import { prepareDraftBudget } from "./catalog";
import {
  assertGatewayEstimateWithinBudget,
  estimateGatewayGenerationCost,
  extractGatewayGenerationId,
  gatewayActualCostFromGenerationInfo,
  parseUsdPerToken,
  usdToConservativeCents,
  type GatewayModelPricing,
} from "./gateway-cost";

const lowCostPricing: GatewayModelPricing = {
  input: "0.00000075",
  output: "0.0000045",
};

describe("AI Gateway cost accounting", () => {
  it("parses Gateway pricing and rejects missing pricing fail-closed", () => {
    expect(parseUsdPerToken("0.00000075", "input")).toBe(0.00000075);

    expect(() => parseUsdPerToken("unknown", "input")).toThrow(
      AgentBudgetError,
    );
  });

  it("estimates worst-case cost before a model call", () => {
    const estimate = estimateGatewayGenerationCost({
      prompt: "x".repeat(4_000),
      maxOutputTokens: 1_500,
      pricing: lowCostPricing,
    });

    expect(estimate.inputTokens).toBe(1_000);
    expect(estimate.outputTokens).toBe(1_500);
    expect(estimate.costCents).toBe(1);
    expect(() =>
      assertGatewayEstimateWithinBudget(
        estimate,
        createBudgetSnapshot(prepareDraftBudget),
      ),
    ).not.toThrow();
  });

  it("blocks estimated cost above the configured run budget", () => {
    const estimate = estimateGatewayGenerationCost({
      prompt: "x".repeat(24_000),
      maxOutputTokens: 1_500,
      pricing: {
        input: "0.0001",
        output: "0.0001",
      },
    });

    expect(() =>
      assertGatewayEstimateWithinBudget(
        estimate,
        createBudgetSnapshot(prepareDraftBudget),
      ),
    ).toThrow("Estimated AI Gateway cost limit exceeded");
  });

  it("rounds any nonzero billed Gateway cost up to at least one cent", () => {
    expect(usdToConservativeCents(0)).toBe(0);
    expect(usdToConservativeCents(0.000001)).toBe(1);
    expect(usdToConservativeCents(0.510001)).toBe(52);
  });

  it("extracts and normalizes Gateway generation cost metadata", () => {
    expect(
      extractGatewayGenerationId({
        gateway: { generationId: "gen_01ABC" },
      }),
    ).toBe("gen_01ABC");

    const actual = gatewayActualCostFromGenerationInfo({
      id: "gen_01ABC",
      totalCost: 0.00049,
      upstreamInferenceCost: 0,
      usage: 0.00049,
      createdAt: "2026-01-01T00:00:00Z",
      model: "openai/gpt-5.4-mini",
      isByok: false,
      providerName: "openai",
      streamed: false,
      finishReason: "stop",
      latency: 120,
      generationTime: 950,
      promptTokens: 800,
      completionTokens: 120,
      reasoningTokens: 10,
      cachedTokens: 0,
      cacheCreationTokens: 0,
      billableWebSearchCalls: 0,
    });

    expect(actual).toMatchObject({
      generationId: "gen_01ABC",
      providerName: "openai",
      model: "openai/gpt-5.4-mini",
      costCents: 1,
      inputTokens: 800,
      outputTokens: 120,
      totalTokens: 930,
    });
  });
});
