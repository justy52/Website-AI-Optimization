import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import type { WorkspaceContext } from "@/domain/tenancy/context";
import { serverEnv } from "@/lib/env";
import { createBudgetSnapshot } from "@/domain/agents/budget";
import { prepareDraftBudget } from "@/domain/agents/catalog";
import { createDeterministicPageOptimizationOutput, type PrepareModelProvider } from "@/domain/agents/page-optimization";
import { createDirectOpenAIPrepareProvider, DIRECT_OPENAI_MODEL } from "@/domain/agents/openai-direct";
import { analyzeHtml } from "@/domain/audits/page-analysis";
import { requestPrepareDraftForOpportunity, executePrepareDraftAgentRun } from "./agents";
import { recordPrepareUsage } from "./usage-ledger";

describe("OpenAI prepare flow with isolated Postgres", () => {
  let pg: PGlite, database: Db, context: WorkspaceContext, opportunityId: string, clientId: string;
  const original = { env: serverEnv.APP_ENV, provider: serverEnv.AGENT_PROVIDER, key: serverEnv.OPENAI_API_KEY, stop: serverEnv.AUTOMATION_EMERGENCY_STOP };
  beforeAll(async () => {
    const aloha = process.env.OPENAI_INTEGRATION_ALOHA === "1";
    let evidenceText = "<title></title>";
    if (aloha) {
      const page = await fetch("https://alohafenceco.com/", { signal: AbortSignal.timeout(20_000) });
      if (!page.ok) throw new Error(`Aloha homepage HTTP ${page.status}`);
      const analysis = analyzeHtml(await page.text());
      if (analysis.metaDescription) throw new Error("Aloha homepage now has a meta description; update the test finding.");
      evidenceText = `Homepage title: ${analysis.title ?? "not found"}. Meta description: not found. First heading: ${analysis.h1[0] ?? "not found"}.`;
    }
    pg = new PGlite();
    await pg.exec("CREATE ROLE virelantic_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT");
    for (const file of readdirSync("drizzle").filter(f => /^\d+.*\.sql$/.test(f)).sort()) await pg.exec(readFileSync(`drizzle/${file}`, "utf8"));
    database = drizzle(pg, { schema }) as unknown as Db;
    const workspaceId = randomUUID(), userId = randomUUID();
    context = { workspaceId, userId, actorType: "USER", role: "OWNER" };
    await pg.query('INSERT INTO "user" (id,name,email) VALUES ($1,$1,$2)', [userId, `${userId}@example.test`]);
    await pg.query("INSERT INTO workspaces (id,name,slug) VALUES ($1,'Isolated test',$2)", [workspaceId, workspaceId]);
    await pg.query("INSERT INTO workspace_memberships (workspace_id,user_id,role) VALUES ($1,$2,'OWNER')", [workspaceId, userId]);
    serverEnv.APP_ENV = "qa"; serverEnv.AGENT_PROVIDER = "openai_direct"; serverEnv.OPENAI_API_KEY = "test-only"; serverEnv.AUTOMATION_EMERGENCY_STOP = false;
    await pg.exec("SET ROLE virelantic_runtime");
    await withTenantContext(database, context, async tx => {
      await tx.insert(schema.workspaceOperations).values({ workspaceId, monthlyCostUsd: "2", aiCallLimit: 2, activeWorkflowLimit: 5 });
      const [client] = await tx.insert(schema.clients).values({ workspaceId, name: aloha ? "TEST — Aloha Fence" : "Synthetic client", servicePlan: "GROWTH" }).returning(); clientId = client.id;
      const [site] = await tx.insert(schema.websites).values({ workspaceId, clientId, displayName: aloha ? "Aloha Fence" : "Synthetic site", domain: aloha ? "alohafenceco.com" : "example.com", canonicalUrl: aloha ? "https://alohafenceco.com/" : "https://example.com/" }).returning();
      const [audit] = await tx.insert(schema.audits).values({ workspaceId, websiteId: site.id, title: "Synthetic audit" }).returning();
      const [run] = await tx.insert(schema.auditRuns).values({ workspaceId, auditId: audit.id, websiteId: site.id, status: "SUCCEEDED", completedAt: new Date() }).returning();
      const [evidence] = await tx.insert(schema.auditEvidence).values({ workspaceId, auditRunId: run.id, evidenceType: "HTML", sourceLabel: aloha ? "Aloha public homepage" : "Synthetic title", excerpt: evidenceText, sourceUrl: site.canonicalUrl }).returning();
      const [check] = await tx.insert(schema.auditCheckResults).values({ workspaceId, auditId: audit.id, auditRunId: run.id, checkKey: aloha ? "seo.meta_description" : "seo.title", checkVersion: "test", category: "seo", status: aloha ? "WARNING" : "FAIL", severity: "MEDIUM", evidenceConfidence: "HIGH", maxPenaltyWeight: aloha ? 6 : 12, reason: aloha ? "No meta description found" : "Missing title", evidenceRefs: [evidence.id] }).returning();
      const [opportunity] = await tx.insert(schema.opportunities).values({ workspaceId, clientId, websiteId: site.id, sourceAuditId: audit.id, sourceAuditRunId: run.id, sourceCheckResultId: check.id, sourceCheckKey: check.checkKey, sourceCheckVersion: check.checkVersion, sourceResultStatus: check.status, sourceSeverity: "MEDIUM", sourceEvidenceRefs: [evidence.id], evidenceConfidence: "HIGH", category: "seo", normalizedRemediationFamily: "on_page_metadata", title: aloha ? "Review missing meta description" : "Improve title", summary: check.reason, recommendedAction: "Prepare metadata for review", status: "READY", impact: 3, confidence: 5, urgency: 3, strategicFit: 3, planFit: 5, effort: 1, basePriority: 50, finalPriority: 50, priorityBand: "Normal", planScope: "INCLUDED" }).returning(); opportunityId = opportunity.id;
    });
  }, 60_000);
  afterAll(async () => { serverEnv.APP_ENV = original.env; serverEnv.AGENT_PROVIDER = original.provider; serverEnv.OPENAI_API_KEY = original.key; serverEnv.AUTOMATION_EMERGENCY_STOP = original.stop; await pg?.close(); });

  it("requires verified facts before reserving spend, then creates one reviewable artifact", async () => {
    await expect(requestPrepareDraftForOpportunity(context, opportunityId, database)).rejects.toThrow(/public verified business facts/i);
    await withTenantContext(database, context, async tx => {
      await tx.insert(schema.businessFacts).values({ workspaceId: context.workspaceId, clientId, factType: "business_name", value: process.env.OPENAI_INTEGRATION_ALOHA === "1" ? "Aloha Fence" : "Synthetic client", sourceReference: process.env.OPENAI_INTEGRATION_ALOHA === "1" ? "Public homepage title (test fixture)" : "Synthetic fixture", verificationStatus: "VERIFIED", sensitivity: "PUBLIC" });
    });
    const request = await requestPrepareDraftForOpportunity(context, opportunityId, database);
    let calls = 0;
    const provider: PrepareModelProvider = { provider: "openai-direct", model: DIRECT_OPENAI_MODEL, generate: async input => {
      const output = createDeterministicPageOptimizationOutput(input);
      const live = process.env.OPENAI_PREPARE_INTEGRATION_LIVE === "1";
      const apiKey = live ? process.env.OPENAI_API_KEY : "test-only";
      if (!apiKey) throw new Error("Live test key is missing.");
      const transport: typeof fetch = async (url, init) => {
        calls++;
        if (!live) return new Response(JSON.stringify({ status: "completed", model: DIRECT_OPENAI_MODEL, usage: { input_tokens: 100, output_tokens: 50 }, output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }] }), { status: 200 });
        const response = await fetch(url, init);
        if (process.env.OPENAI_INTEGRATION_DIAGNOSTIC_PATH && response.ok) {
          const body = await response.clone().json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
          const text = body.output?.flatMap(item => item.content ?? []).find(item => item.type === "output_text")?.text;
          if (text) writeFileSync(process.env.OPENAI_INTEGRATION_DIAGNOSTIC_PATH, text);
        }
        return response;
      };
      return createDirectOpenAIPrepareProvider({ apiKey, budget: createBudgetSnapshot(prepareDraftBudget), timeoutMs: 60_000, transport, onUsage: usage => recordPrepareUsage(context, request.agentRunId, "openai-direct", usage, database) }).generate(input);
    } };
    const result = await executePrepareDraftAgentRun(context, request.agentRunId, database, provider);
    const [runState] = await withTenantContext(database, context, tx => tx.select({ status: schema.agentRuns.status, error: schema.agentRuns.errorSummary }).from(schema.agentRuns).where(eq(schema.agentRuns.id, request.agentRunId)));
    expect(result.artifact, `Agent status: ${runState.status}; ${runState.error ?? "no error"}`).not.toBeNull();
    expect(result.approval).not.toBeNull();
    expect(calls).toBe(1);
    const again = await executePrepareDraftAgentRun(context, request.agentRunId, database, provider);
    expect(again.artifact?.id).toBe(result.artifact?.id);
    expect(calls).toBe(1);
    const [ledger] = await withTenantContext(database, context, tx => tx.select().from(schema.usageLedger).where(eq(schema.usageLedger.agentRunId, request.agentRunId)));
    expect(Number(ledger.actualCostUsd)).toBeGreaterThan(0);
  }, 90_000);
});
