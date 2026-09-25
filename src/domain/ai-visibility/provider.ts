import { z } from "zod";
import { PERPLEXITY_SURFACE, type NativeCitation } from "./model";

export const PERPLEXITY_ADAPTER_VERSION = "perplexity-agent-v1.0";
export const PERPLEXITY_MODEL = "perplexity/sonar";
export const VISIBILITY_BUDGET = Object.freeze({ maxPrompts: 30, maxCalls: 30, concurrency: 1, retries: 0, timeoutMs: 45_000, maxResponseBytes: 262_144, maxOutputTokens: 1200, maxToolCalls: 1, maxSteps: 2, maxEstimatedCostUsd: 3 });
export type ProviderResult = { status: "SUCCEEDED" | "FAILED" | "UNAVAILABLE"; answer: string | null; citations: NativeCitation[]; model: string; providerResponseId: string | null; inputTokens: number; outputTokens: number; costUsd: number | null; raw: Record<string, unknown> | null; retryable: boolean; retryAfterSeconds: number | null; limitations: string[] };
export interface VisibilityProvider { surface: string; version: string; model: string; observe(prompt: string): Promise<ProviderResult> }
const result = (reason: string, status: "FAILED" | "UNAVAILABLE" = "FAILED"): ProviderResult => ({ status, answer: null, citations: [], model: PERPLEXITY_MODEL, providerResponseId: null, inputTokens: 0, outputTokens: 0, costUsd: null, raw: null, retryable: false, retryAfterSeconds: null, limitations: [reason] });

const responseSchema = z.object({
  id: z.string().max(200), status: z.string(), model: z.string().max(150),
  output: z.array(z.object({ type: z.string(), results: z.array(z.object({ id: z.union([z.string(), z.number()]).optional(), url: z.string().max(2048), title: z.string().max(500).optional() })).max(50).optional(), content: z.array(z.object({ type: z.string(), text: z.string().max(100_000).optional(), annotations: z.array(z.object({ type: z.string(), url: z.string().max(2048).optional(), title: z.string().max(500).optional(), start_index: z.number().optional(), end_index: z.number().optional() })).max(50).optional() })).max(20).optional() })).max(50).default([]),
  usage: z.object({ input_tokens: z.number().nonnegative().optional(), output_tokens: z.number().nonnegative().optional(), cost: z.object({ total_cost: z.number().nonnegative().optional(), currency: z.string().optional() }).optional() }).optional(),
});

export function parsePerplexityResponse(raw: unknown): ProviderResult {
  const validated = responseSchema.safeParse(raw);
  if (!validated.success) return result("MALFORMED_PROVIDER_RESPONSE");
  const data = validated.data;
  if (data.status !== "completed") return { ...result(`PROVIDER_${["failed", "cancelled", "incomplete", "queued", "in_progress"].includes(data.status) ? data.status.toUpperCase() : "UNKNOWN_STATUS"}`), providerResponseId: data.id };
  if (data.model !== PERPLEXITY_MODEL) return result("UNEXPECTED_PROVIDER_MODEL");
  const answer = data.output.filter(o => o.type === "message").flatMap(o => o.content ?? []).filter(c => c.type === "output_text").map(c => c.text ?? "").join("\n");
  if (!answer.trim()) return result("EMPTY_PROVIDER_ANSWER");
  const citations: NativeCitation[] = [];
  for (const item of data.output) {
    if (item.type === "search_results") for (const source of item.results ?? []) citations.push({ url: source.url, title: source.title, index: String(source.id ?? citations.length + 1), relationship: "PROVIDER_SOURCE" });
    if (item.type === "message") for (const part of item.content ?? []) for (const annotation of part.annotations ?? []) {
      if (annotation.type === "url_citation" && annotation.url) citations.push({ url: annotation.url, title: annotation.title, index: `${annotation.start_index ?? 0}:${annotation.end_index ?? 0}`, relationship: "ANSWER_CITATION" });
    }
  }
  const unique = citations.filter((c, index, list) => list.findIndex(other => other.url === c.url) === index);
  return { status: "SUCCEEDED", answer, citations: unique, model: data.model, providerResponseId: data.id, inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0, costUsd: data.usage?.cost?.currency === "USD" ? data.usage.cost.total_cost ?? null : null,
    // Only the validated answer/source/usage capture is retained. Headers, request
    // credentials, provider errors and reasoning items are never persisted.
    raw: { id: data.id, model: data.model, status: data.status, answer, citations: unique, usage: data.usage ?? null }, retryable: false, retryAfterSeconds: null,
    limitations: ["Location is supplied in the exact prompt only; no geolocation or consumer-session personalization is applied.", ...(unique.length ? [] : ["No provider-native source metadata returned; grounding could not be confirmed."])] };
}

export function perplexityRequest(prompt: string) {
  if (!prompt.trim() || prompt.length > 1500) throw new Error("Bounded visibility prompt required.");
  return { model: PERPLEXITY_MODEL, input: prompt, tools: [{ type: "web_search", max_results: 5, search_context_size: "low" }], tool_choice: { type: "web_search" }, max_tool_calls: VISIBILITY_BUDGET.maxToolCalls, max_steps: VISIBILITY_BUDGET.maxSteps, max_output_tokens: VISIBILITY_BUDGET.maxOutputTokens, stream: false, store: false };
}
export function createPerplexityProvider(apiKey: string | undefined, transport: typeof fetch = fetch): VisibilityProvider {
  return { surface: PERPLEXITY_SURFACE, version: PERPLEXITY_ADAPTER_VERSION, model: PERPLEXITY_MODEL, async observe(prompt) {
    if (!apiKey) return result("PROVIDER_NOT_CONFIGURED", "UNAVAILABLE");
    try {
      const response = await transport("https://api.perplexity.ai/v1/agent", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify(perplexityRequest(prompt)), redirect: "error", signal: AbortSignal.timeout(VISIBILITY_BUDGET.timeoutMs) });
      if (!response.ok) {
        await response.body?.cancel();
        const retryAfter = Number(response.headers.get("retry-after"));
        return { ...result(`PROVIDER_HTTP_${response.status}`), retryable: response.status === 429 || response.status >= 500, retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 3600) : null };
      }
      if (Number(response.headers.get("content-length")) > VISIBILITY_BUDGET.maxResponseBytes) { await response.body?.cancel(); return result("RESPONSE_SIZE_LIMIT"); }
      const reader = response.body?.getReader();
      if (!reader) return result("EMPTY_PROVIDER_RESPONSE");
      const chunks: Uint8Array[] = []; let bytes = 0;
      try { for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > VISIBILITY_BUDGET.maxResponseBytes) { await reader.cancel(); return result("RESPONSE_SIZE_LIMIT"); } chunks.push(value); } }
      finally { reader.releaseLock(); }
      return parsePerplexityResponse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch { return result("PROVIDER_NETWORK_OR_INVALID_RESPONSE"); }
  } };
}

export function unavailableProviderResult(reason = "PROVIDER_NOT_CONFIGURED") { return result(reason, "UNAVAILABLE"); }
