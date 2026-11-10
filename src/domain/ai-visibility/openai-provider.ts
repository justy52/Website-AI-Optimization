import { z } from "zod";
import { DIRECT_OPENAI_MODEL } from "@/domain/agents/openai-direct";
import type { NativeCitation } from "./model";
import { VISIBILITY_BUDGET, type ProviderResult, type VisibilityProvider } from "./provider";

export const OPENAI_VISIBILITY_SURFACE = "OpenAI web-search API sample";
export const OPENAI_VISIBILITY_VERSION = "openai-web-search-v1.0";
// The model's 400k-token context, 1,200 output tokens, and one web search
// bound a single request to under $0.32 at standard prices (2026-11-06).
export const OPENAI_VISIBILITY_RESERVATION_PER_CALL_USD = 0.32;

const schema = z.object({
  id: z.string().max(200), status: z.string(), model: z.string(),
  output: z.array(z.object({ type: z.string(), status: z.string().optional(), content: z.array(z.object({
    type: z.string(), text: z.string().max(100_000).optional(), annotations: z.array(z.object({ type: z.string(), url: z.string().max(2048).optional(), title: z.string().max(500).optional(), start_index: z.number().optional(), end_index: z.number().optional() })).max(50).optional(),
  })).max(20).optional() })).max(50),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }).optional(),
});

function failure(reason: string, status: "FAILED" | "UNAVAILABLE" = "FAILED"): ProviderResult {
  return { status, answer: null, citations: [], model: DIRECT_OPENAI_MODEL, providerResponseId: null, inputTokens: 0, outputTokens: 0, costUsd: null, raw: null, retryable: false, retryAfterSeconds: null, limitations: [reason] };
}

export function openAIVisibilityRequest(prompt: string) {
  if (!prompt.trim() || prompt.length > 1500) throw new Error("Bounded visibility prompt required.");
  return { model: DIRECT_OPENAI_MODEL, input: prompt, store: false, reasoning: { effort: "none" }, tools: [{ type: "web_search", search_context_size: "low" }], tool_choice: "required", max_tool_calls: 1, max_output_tokens: VISIBILITY_BUDGET.maxOutputTokens };
}

export function parseOpenAIVisibilityResponse(raw: unknown): ProviderResult {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return failure("MALFORMED_PROVIDER_RESPONSE");
  const data = parsed.data;
  if (data.model !== DIRECT_OPENAI_MODEL || !data.usage) return failure("UNACCOUNTABLE_PROVIDER_RESPONSE");
  const searches = data.output.filter(item => item.type === "web_search_call");
  // A missing or incomplete search item leaves tool charges uncertain. Keep
  // the full reservation in that case instead of labeling an estimate actual.
  const costUsd = searches.length === 1 && searches[0].status === "completed" ? data.usage.input_tokens * 0.75 / 1_000_000 + data.usage.output_tokens * 4.5 / 1_000_000 + 0.01 : null;
  const measured = { model: data.model, providerResponseId: data.id, inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens, costUsd };
  if (data.status !== "completed" || searches.length !== 1 || searches[0].status !== "completed") return { ...failure("INCOMPLETE_WEB_SEARCH_SAMPLE"), ...measured };
  const parts = data.output.filter(item => item.type === "message").flatMap(item => item.content ?? []).filter(part => part.type === "output_text");
  const answer = parts.map(part => part.text ?? "").join("\n").trim();
  if (!answer) return { ...failure("EMPTY_PROVIDER_ANSWER"), ...measured };
  const citations: NativeCitation[] = [];
  for (const part of parts) for (const annotation of part.annotations ?? []) {
    if (annotation.type !== "url_citation" || !annotation.url) continue;
    try {
      const url = new URL(annotation.url);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) continue;
      citations.push({ url: url.toString(), title: annotation.title, index: `${annotation.start_index ?? 0}:${annotation.end_index ?? 0}`, relationship: "ANSWER_CITATION" });
    } catch { /* Ignore malformed source URLs. */ }
  }
  const unique = citations.filter((c, i) => citations.findIndex(other => other.url === c.url) === i);
  if (!unique.length) return { ...failure("NO_PROVIDER_NATIVE_CITATIONS"), ...measured };
  const limitations = ["One web-grounded OpenAI API sample; it does not represent consumer ChatGPT results, rankings, or all AI systems.", "Location is supplied only in the prompt; there is no consumer-session personalization."];
  return { status: "SUCCEEDED", answer, citations: unique, ...measured, raw: { id: data.id, model: data.model, answer, citations: unique, usage: data.usage }, retryable: false, retryAfterSeconds: null, limitations };
}

export function createOpenAIVisibilityProvider(apiKey: string | undefined, transport: typeof fetch = fetch): VisibilityProvider {
  return { surface: OPENAI_VISIBILITY_SURFACE, version: OPENAI_VISIBILITY_VERSION, model: DIRECT_OPENAI_MODEL, async observe(prompt) {
    if (!apiKey) return failure("PROVIDER_NOT_CONFIGURED", "UNAVAILABLE");
    try {
      const response = await transport("https://api.openai.com/v1/responses", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify(openAIVisibilityRequest(prompt)), redirect: "error", signal: AbortSignal.timeout(90_000) });
      if (!response.ok) { await response.body?.cancel(); return failure(`PROVIDER_HTTP_${response.status}`); }
      if (Number(response.headers.get("content-length")) > VISIBILITY_BUDGET.maxResponseBytes || !response.body) { await response.body?.cancel(); return failure("RESPONSE_SIZE_LIMIT"); }
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > VISIBILITY_BUDGET.maxResponseBytes) { await reader.cancel(); return failure("RESPONSE_SIZE_LIMIT"); } chunks.push(next.value); } }
      finally { reader.releaseLock(); }
      return parseOpenAIVisibilityResponse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch { return failure("PROVIDER_NETWORK_OR_INVALID_RESPONSE"); }
  } };
}
