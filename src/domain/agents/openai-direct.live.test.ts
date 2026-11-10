import { describe, expect, it } from "vitest";
import { createBudgetSnapshot } from "./budget";
import { prepareDraftBudget } from "./catalog";
import { maliciousFixtureInput } from "./page-optimization";
import { createDirectOpenAIPrepareProvider } from "./openai-direct";
import { analyzeHtml } from "@/domain/audits/page-analysis";
import { writeFile } from "node:fs/promises";

describe.skipIf(process.env.OPENAI_DIRECT_LIVE_TEST !== "1")("direct OpenAI live smoke", () => {
  it("generates a validated review-only draft with accounted usage", async () => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Live test key is missing.");
    const provider = createDirectOpenAIPrepareProvider({ apiKey: key, budget: createBudgetSnapshot(prepareDraftBudget), timeoutMs: 60_000 });
    const result = await provider.generate(maliciousFixtureInput({ auditEvidence: [{ id: "homepage-html", label: "Homepage HTML", evidenceType: "HTML", excerpt: "The homepage title is short and contains only the company name." }] }));
    expect(result.output.permissionLevel).toBe("PREPARE");
    expect(result.output.externalExecutionRequested).toBe(false);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
    expect(result.usage.actualCostCents).toBeLessThanOrEqual(prepareDraftBudget.maxCostCents);
  }, 65_000);
});

describe.skipIf(process.env.OPENAI_DIRECT_ALOHA_TEST !== "1")("Aloha Fence public evidence live smoke", () => {
  it("generates a review-only metadata draft with measured usage", async () => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Live test key is missing.");
    const response = await fetch("https://alohafenceco.com/", { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Public homepage returned HTTP ${response.status}.`);
    const page = analyzeHtml(await response.text());
    expect(page.metaDescription).toBeNull();
    const base = maliciousFixtureInput();
    const input = maliciousFixtureInput({
      opportunity: { ...base.opportunity, title: "Review missing meta description", summary: "No meta description was found in the fetched homepage HTML.", recommendedAction: "Prepare a metadata draft for human review.", sourceCheckKey: "seo.meta_description", sourceResultStatus: "WARNING", sourceSeverity: "MEDIUM" },
      client: { ...base.client, name: "TEST — Aloha Fence" },
      website: { ...base.website, displayName: "Aloha Fence", canonicalUrl: "https://alohafenceco.com/", domain: "alohafenceco.com" },
      auditEvidence: [{ id: "homepage-html", label: "Public homepage HTML", evidenceType: "HTML", sourceUrl: "https://alohafenceco.com/", excerpt: `Title: ${page.title ?? "not found"}. Meta description: not found. First heading: ${page.h1[0] ?? "not found"}.` }],
    });
    let usageRecorded = false;
    const transport: typeof fetch = async (url, init) => {
      const result = await fetch(url, init);
      if (process.env.OPENAI_ALOHA_DIAGNOSTIC_PATH && result.ok) {
        const body = await result.clone().json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
        const text = body.output?.flatMap(item => item.content ?? []).find(item => item.type === "output_text")?.text;
        if (text) await writeFile(process.env.OPENAI_ALOHA_DIAGNOSTIC_PATH, text, "utf8");
      }
      return result;
    };
    const provider = createDirectOpenAIPrepareProvider({ apiKey: key, budget: createBudgetSnapshot(prepareDraftBudget), timeoutMs: 60_000, transport, onUsage: async () => { usageRecorded = true; } });
    const result = await provider.generate(input);
    expect(usageRecorded).toBe(true);
    expect(result.output.permissionLevel).toBe("PREPARE");
    expect(result.output.externalExecutionRequested).toBe(false);
    expect(result.usage.actualCostCents).toBeLessThanOrEqual(prepareDraftBudget.maxCostCents);
  }, 85_000);
});
