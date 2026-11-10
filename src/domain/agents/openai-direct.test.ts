import { describe, expect, it, vi } from "vitest";
import { createBudgetSnapshot } from "./budget";
import { prepareDraftBudget } from "./catalog";
import { createDeterministicPageOptimizationOutput, maliciousFixtureInput } from "./page-optimization";
import { createDirectOpenAIPrepareProvider, DIRECT_OPENAI_MODEL } from "./openai-direct";

const budget = createBudgetSnapshot(prepareDraftBudget);
const input = maliciousFixtureInput();

describe("direct OpenAI prepare provider", () => {
  it("validates a draft and accounts for provider usage", async () => {
    const output = createDeterministicPageOptimizationOutput(input);
    output.proposals = [{ field: "no_change", currentValue: null, proposedValue: null, rationale: "More verified information is required.", evidenceRefs: ["homepage-html"], factualBasis: [], requiresHumanInput: true }];
    const transport = vi.fn(async () => new Response(JSON.stringify({
      status: "completed", model: DIRECT_OPENAI_MODEL,
      usage: { input_tokens: 100, output_tokens: 50 },
      output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }],
    }), { status: 200 }));
    const provider = createDirectOpenAIPrepareProvider({ apiKey: "test-key", budget, timeoutMs: 1000, transport: transport as typeof fetch });
    const result = await provider.generate(input);
    expect(result.output).toMatchObject({ artifactTitle: "Additional business information needed", proposals: [{ field: "no_change", proposedValue: null, requiresHumanInput: true }] });
    expect(result.usage).toMatchObject({ inputTokens: 100, outputTokens: 50, actualCostCents: 1 });
    const request = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(request[1].body as string)).toMatchObject({ store: false, model: DIRECT_OPENAI_MODEL, max_output_tokens: budget.maxOutputTokens });
  });

  it("rejects proposed content when there are no public verified business facts", async () => {
    const output = createDeterministicPageOptimizationOutput(input);
    const transport = vi.fn(async () => new Response(JSON.stringify({
      status: "completed", model: DIRECT_OPENAI_MODEL,
      usage: { input_tokens: 100, output_tokens: 50 },
      output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }],
    }), { status: 200 }));
    const onUsage = vi.fn(async () => {});
    const provider = createDirectOpenAIPrepareProvider({ apiKey: "test-key", budget, timeoutMs: 1000, transport: transport as typeof fetch, onUsage });
    await expect(provider.generate(input)).rejects.toThrow(/public verified business facts/i);
    expect(onUsage).toHaveBeenCalledOnce();
  });

  it("turns a model request for missing facts into a safe review handoff", async () => {
    const output = createDeterministicPageOptimizationOutput(input);
    output.proposals = [{ field: "meta_description", currentValue: null, proposedValue: null, rationale: "Verified facts are needed for a compliant draft.", evidenceRefs: ["homepage-html"], factualBasis: [], requiresHumanInput: true }];
    const transport = vi.fn(async () => new Response(JSON.stringify({ status: "completed", model: DIRECT_OPENAI_MODEL, usage: { input_tokens: 100, output_tokens: 50 }, output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }] }), { status: 200 }));
    const provider = createDirectOpenAIPrepareProvider({ apiKey: "test-key", budget, timeoutMs: 1000, transport: transport as typeof fetch });
    const result = await provider.generate(input);
    expect(result.output.proposals).toMatchObject([{ field: "no_change", proposedValue: null, requiresHumanInput: true }]);
  });

  it("keeps a missing-input proposal reviewable without treating instructions as claims", async () => {
    const output = createDeterministicPageOptimizationOutput(input);
    output.proposals = [{ field: "meta_description", currentValue: null, proposedValue: null, rationale: "Add approved service-area wording if it should appear in metadata.", evidenceRefs: ["homepage-html"], factualBasis: [], requiresHumanInput: true }];
    const transport = vi.fn(async () => new Response(JSON.stringify({ status: "completed", model: DIRECT_OPENAI_MODEL, usage: { input_tokens: 100, output_tokens: 50 }, output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }] }), { status: 200 }));
    const provider = createDirectOpenAIPrepareProvider({ apiKey: "test-key", budget, timeoutMs: 1000, transport: transport as typeof fetch });
    const withFact = { ...input, businessFacts: [{ id: "fact-1", factType: "business_name", value: "Fixture", verificationStatus: "VERIFIED", sensitivity: "PUBLIC", sourceReference: "test" }] };
    const result = await provider.generate(withFact);
    expect(result.output.proposals[0]).toMatchObject({ proposedValue: null, requiresHumanInput: true });
  });

  it("does not call OpenAI when the run budget cannot cover an estimate", async () => {
    const transport = vi.fn();
    const provider = createDirectOpenAIPrepareProvider({ apiKey: "test-key", budget: { ...budget, maxCostCents: 0 }, timeoutMs: 1000, transport });
    await expect(provider.generate(input)).rejects.toThrow(/budget/i);
    expect(transport).not.toHaveBeenCalled();
  });

  it("fails closed on an incomplete response or missing usage", async () => {
    const transport = vi.fn(async () => new Response(JSON.stringify({ status: "incomplete", model: DIRECT_OPENAI_MODEL }), { status: 200 }));
    const provider = createDirectOpenAIPrepareProvider({ apiKey: "test-key", budget, timeoutMs: 1000, transport: transport as typeof fetch });
    await expect(provider.generate(input)).rejects.toThrow(/incomplete or unaccountable/i);
  });

  it("records billable usage even when the provider reports an incomplete response", async () => {
    const transport = vi.fn(async () => new Response(JSON.stringify({
      status: "incomplete", model: DIRECT_OPENAI_MODEL,
      usage: { input_tokens: 100, output_tokens: 50 },
    }), { status: 200 }));
    const onUsage = vi.fn(async () => {});
    const provider = createDirectOpenAIPrepareProvider({ apiKey: "test-key", budget, timeoutMs: 1000, transport: transport as typeof fetch, onUsage });
    await expect(provider.generate(input)).rejects.toThrow(/incomplete/i);
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 100, outputTokens: 50 }));
  });

  it("rejects a draft that invents an evidence reference", async () => {
    const output = createDeterministicPageOptimizationOutput(input);
    output.proposals[0].evidenceRefs = ["not-supplied"];
    const transport = vi.fn(async () => new Response(JSON.stringify({
      status: "completed", model: DIRECT_OPENAI_MODEL,
      usage: { input_tokens: 100, output_tokens: 50 },
      output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }],
    }), { status: 200 }));
    const onUsage = vi.fn(async () => {});
    const provider = createDirectOpenAIPrepareProvider({ apiKey: "test-key", budget, timeoutMs: 1000, transport: transport as typeof fetch, onUsage });
    await expect(provider.generate({ ...input, businessFacts: [{ id: "fact-1", factType: "business_name", value: "Fixture", verificationStatus: "VERIFIED", sensitivity: "PUBLIC", sourceReference: "test" }] })).rejects.toThrow(/evidenceRef/i);
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 100, outputTokens: 50, providerCostUsd: expect.any(Number) }));
  });
});
