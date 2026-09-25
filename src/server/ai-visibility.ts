import { assertOperationalAdmission, assertAutomationAllowed, enforceActionRateLimit, operationalUsage, operationalEvent, OperationsValidationError, withOperationalContext, platformPauseState, filterUnpausedWorkspaceRefs } from "./operations";
import { reserveUsage } from "./usage-ledger";
import { pauseApplies } from "@/domain/operations/policy";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { activityEvents, aiVisibilityCalls, aiVisibilityCaptures, aiVisibilityObservations, aiVisibilityPrompts, aiVisibilityPromptSets, aiVisibilityRuns, businessFacts, clients, competitorTargets, websites, workspaces } from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import { serverEnv } from "@/lib/env";
import { assertWorkspaceRole, type WorkspaceContext } from "@/domain/tenancy/context";
import { buildAliases, eligibleFacts, generateVisibilityPrompts, PARSER_VERSION, PERPLEXITY_SURFACE, PROMPT_TEMPLATE_VERSION, visibilityHash, visibilityLimits, visibilityWindow, VisibilityValidationError, type ObservationSource } from "@/domain/ai-visibility/model";
import { aggregateVisibility, parseVisibilityAnswer, sampledReportCopy } from "@/domain/ai-visibility/parser";
import { createPerplexityProvider, PERPLEXITY_ADAPTER_VERSION, PERPLEXITY_MODEL, unavailableProviderResult, VISIBILITY_BUDGET, type ProviderResult, type VisibilityProvider } from "@/domain/ai-visibility/provider";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const scoped = (workspaceId: string) => eq(aiVisibilityRuns.workspaceId, workspaceId);
const requireId = (id: string) => { if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) throw new VisibilityValidationError("Invalid visibility reference."); };
function human(context: WorkspaceContext) { assertWorkspaceRole(context, ["OWNER", "ADMIN", "ANALYST"]); }
async function activity(tx: Tx, context: WorkspaceContext, action: string, id: string) {
  await tx.insert(activityEvents).values({ workspaceId: context.workspaceId, actorType: context.actorType, actorUserId: context.userId, action, resourceType: "ai_visibility", resourceId: id, summary: {} });
}
async function site(tx: Tx, context: WorkspaceContext, websiteId: string) {
  requireId(websiteId);
  const [row] = await tx.select({ website: websites, client: clients }).from(websites).innerJoin(clients, and(eq(clients.workspaceId, websites.workspaceId), eq(clients.id, websites.clientId)))
    .where(and(eq(websites.workspaceId, context.workspaceId), eq(websites.id, websiteId), isNull(websites.archivedAt), isNull(clients.archivedAt))).limit(1);
  if (!row) throw new VisibilityValidationError("Website was not found.");
  return row;
}
async function sourceData(tx: Tx, context: WorkspaceContext, websiteId: string) {
  const target = await site(tx, context, websiteId);
  const limits = visibilityLimits(target.client.servicePlan, target.client.servicePlanVersion);
  const facts = await tx.select().from(businessFacts).where(and(eq(businessFacts.workspaceId, context.workspaceId), eq(businessFacts.clientId, target.client.id), sql`(${businessFacts.websiteId} is null or ${businessFacts.websiteId}=${websiteId})`));
  const competitors = await tx.select().from(competitorTargets).where(and(eq(competitorTargets.workspaceId, context.workspaceId), eq(competitorTargets.websiteId, websiteId), eq(competitorTargets.active, true), isNull(competitorTargets.archivedAt))).orderBy(competitorTargets.createdAt).limit(limits.competitors);
  const clientFacts = facts.filter(f => !f.structuredValue.competitorTargetId);
  const aliases = buildAliases(clientFacts, competitors.map(c => ({ key: c.id, facts: facts.filter(f => f.structuredValue.competitorTargetId === c.id) })), limits.competitors);
  const prompts = generateVisibilityPrompts(clientFacts, target.client.servicePlan, target.client.servicePlanVersion);
  const allocated = await tx.execute(sql`select count(*)::int as n from public.ai_visibility_prompts p
    join public.ai_visibility_prompt_sets s on s.workspace_id=p.workspace_id and s.id=p.prompt_set_id
    where s.workspace_id=${context.workspaceId} and s.client_id=${target.client.id} and s.website_id<>${websiteId}
      and not exists(select 1 from public.ai_visibility_prompt_sets newer where newer.workspace_id=s.workspace_id and newer.website_id=s.website_id and newer.version>s.version)`);
  if (Number(allocated.rows[0]?.n ?? 0) + prompts.length > limits.prompts) throw new VisibilityValidationError("The client's active prompt sets would exceed the service-plan prompt maximum.");
  const refs = [...new Set([...aliases.client.factRefs, ...aliases.competitors.flatMap(c => c.factRefs), ...prompts.flatMap(p => [p.serviceFactId, p.locationFactId, ...p.optionalFactRefs])])];
  return { ...target, limits, aliases, prompts, refs, contentHash: visibilityHash({ aliases, prompts }) };
}

export async function approveVisibilityCompetitorAliases(context: WorkspaceContext, websiteId: string, database = db) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN"]);
  return withTenantContext(database, context, async tx => {
    const target = await site(tx, context, websiteId);
    const limit = visibilityLimits(target.client.servicePlan, target.client.servicePlanVersion).competitors;
    const competitors = await tx.select().from(competitorTargets).where(and(eq(competitorTargets.workspaceId, context.workspaceId), eq(competitorTargets.websiteId, websiteId), eq(competitorTargets.active, true), isNull(competitorTargets.archivedAt))).orderBy(competitorTargets.createdAt).limit(limit);
    for (const competitor of competitors) {
      for (const [factType, value] of [["business_name", competitor.name], ["canonical_domain", competitor.domain]]) {
        const [existing] = await tx.select({ id: businessFacts.id }).from(businessFacts).where(and(eq(businessFacts.workspaceId, context.workspaceId), eq(businessFacts.clientId, target.client.id), eq(businessFacts.factType, factType), eq(businessFacts.value, value), sql`${businessFacts.structuredValue}->>'competitorTargetId'=${competitor.id}`)).limit(1);
        if (!existing) await tx.insert(businessFacts).values({ workspaceId: context.workspaceId, clientId: target.client.id, websiteId, factType, value, structuredValue: { competitorTargetId: competitor.id }, sourceReference: `Human approval of configured competitor ${competitor.id}`, sensitivity: "PUBLIC", verificationStatus: "VERIFIED", approvedByUserId: context.userId });
      }
    }
    await activity(tx, context, "ai_visibility.competitor_aliases_approved", websiteId);
  });
}

export async function createVisibilityPromptSet(context: WorkspaceContext, websiteId: string, database = db) {
  human(context);
  return withTenantContext(database, context, async tx => {
    await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, context.workspaceId)).for("update");
    const data = await sourceData(tx, context, websiteId);
    const [latest] = await tx.select().from(aiVisibilityPromptSets).where(and(eq(aiVisibilityPromptSets.workspaceId, context.workspaceId), eq(aiVisibilityPromptSets.websiteId, websiteId))).orderBy(desc(aiVisibilityPromptSets.version)).limit(1);
    if (latest?.contentHash === data.contentHash) return latest;
    const [set] = await tx.insert(aiVisibilityPromptSets).values({ workspaceId: context.workspaceId, clientId: data.client.id, websiteId, key: PROMPT_TEMPLATE_VERSION, version: (latest?.version ?? 0) + 1, name: "Local services sampled visibility", templateVersion: PROMPT_TEMPLATE_VERSION, generatedFromFactRefs: data.refs, aliases: data.aliases, contentHash: data.contentHash, createdByUserId: context.userId! }).returning();
    await tx.insert(aiVisibilityPrompts).values(data.prompts.map(p => ({ workspaceId: context.workspaceId, clientId: data.client.id, websiteId, promptSetId: set.id, key: p.key, templateKey: p.templateKey, renderedPrompt: p.text, promptHash: visibilityHash(p.text), serviceFactId: p.serviceFactId, locationFactId: p.locationFactId, optionalFactRefs: p.optionalFactRefs })));
    await activity(tx, context, "ai_visibility.prompt_set_created", set.id);
    return set;
  });
}

export async function requestVisibilityRun(context: WorkspaceContext, websiteId: string, source: ObservationSource = "API", database = db, at = new Date()) {
  human(context);
  if (source === "MANUAL") throw new VisibilityValidationError("Use the explicitly labeled manual observation form.");
  if (source === "QA_FIXTURE" && serverEnv.APP_ENV !== "qa") throw new VisibilityValidationError("Deterministic visibility fixtures are QA-only.");
  // Missing configuration is not a paid attempt and must not occupy a cadence window.
  // Once queued, the durable call reservations and fail-closed recovery still apply.
  if (source === "API" && !serverEnv.PERPLEXITY_API_KEY) throw new VisibilityValidationError("Perplexity Agent API is not configured for this environment.");
  await enforceActionRateLimit(context, "visibility", database);
  return withOperationalContext(database, context, async tx => {
    await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, context.workspaceId)).for("update");
    const data = await sourceData(tx, context, websiteId);
    const [set] = await tx.select().from(aiVisibilityPromptSets).where(and(eq(aiVisibilityPromptSets.workspaceId, context.workspaceId), eq(aiVisibilityPromptSets.websiteId, websiteId))).orderBy(desc(aiVisibilityPromptSets.version)).limit(1);
    if (!set || set.contentHash !== data.contentHash) throw new VisibilityValidationError("Generate a current prompt set from verified facts before running observations.");
    const window = visibilityWindow(at, data.limits.windows);
    const surface = source === "API" ? PERPLEXITY_SURFACE : "QA deterministic fixture (not provider evidence)";
    const configured = source === "QA_FIXTURE" || Boolean(serverEnv.PERPLEXITY_API_KEY);
    const idempotencyKey = visibilityHash([context.workspaceId, websiteId, set.id, set.version, surface, window, configured]);
    const [prior] = await tx.select().from(aiVisibilityRuns).where(and(scoped(context.workspaceId), sql`(${aiVisibilityRuns.idempotencyKey}=${idempotencyKey} or (${aiVisibilityRuns.websiteId}=${websiteId} and ${aiVisibilityRuns.surface}=${surface} and ${aiVisibilityRuns.window}=${window} and ${aiVisibilityRuns.source}='API'))`)).limit(1);
    if (prior) return prior;
    const [active] = await tx.select({ id: aiVisibilityRuns.id }).from(aiVisibilityRuns).where(and(scoped(context.workspaceId), inArray(aiVisibilityRuns.status, ["QUEUED", "RUNNING"]))).limit(1);
    if (active) throw new VisibilityValidationError("A visibility workflow is already active in this workspace.");
    await assertOperationalAdmission(tx, context, "visibility", { workflow: true, costUsd: source === "API" ? VISIBILITY_BUDGET.maxEstimatedCostUsd : 0, visibilityCalls: source === "API" ? data.prompts.length : 0 });
    const [run] = await tx.insert(aiVisibilityRuns).values({ workspaceId: context.workspaceId, clientId: data.client.id, websiteId, promptSetId: set.id, promptSetVersion: set.version, source, surface, adapterVersion: source === "API" ? PERPLEXITY_ADAPTER_VERSION : "qa-visibility-fixture-v1.0", model: source === "API" ? PERPLEXITY_MODEL : "deterministic-test-fixture", trigger: context.actorType === "SYSTEM" ? "SCHEDULED" : "USER", window, idempotencyKey, context: { localization: "Exact prompt location only", personalization: "NONE", aliases: set.aliases, factHash: set.contentHash }, budget: { ...VISIBILITY_BUDGET, maxPrompts: data.prompts.length, maxCalls: data.prompts.length }, promptCount: data.prompts.length, actorUserId: context.userId, status: "QUEUED" }).returning();
    await reserveUsage(tx, context, { visibilityRunId: run.id, clientId: run.clientId, websiteId: run.websiteId, sourceKey: `visibility:${run.id}`, provider: source === "API" ? "perplexity" : "deterministic", category: "AI_VISIBILITY", outcome: run.status, reservedCostUsd: String(source === "API" ? VISIBILITY_BUDGET.maxEstimatedCostUsd : 0), reservedCalls: source === "API" ? data.prompts.length : 0, sourceVersion: run.adapterVersion });
    await activity(tx, context, "ai_visibility.run_queued", run.id);
    return run;
  });
}

function fixtureProvider(set: typeof aiVisibilityPromptSets.$inferSelect): VisibilityProvider {
  return { surface: "QA deterministic fixture (not provider evidence)", version: "qa-visibility-fixture-v1.0", model: "deterministic-test-fixture", async observe() {
    const name = set.aliases.client.names[0];
    const rival = set.aliases.competitors[0];
    const answer = `We recommend ${name} in ${set.aliases.client.locations[0] ?? "the verified service area"}. ${rival ? `${rival.names[0]} also provides local services.` : "No configured competitor in this fixture."}`;
    return { ...unavailableProviderResult(), status: "SUCCEEDED", model: "deterministic-test-fixture", answer, citations: [{ url: `https://${set.aliases.client.domains[0]}/services`, index: "1", relationship: "PROVIDER_SOURCE" }, ...(rival ? [{ url: `https://${rival.domains[0]}/`, index: "2", relationship: "PROVIDER_SOURCE" as const }] : [])], raw: { fixture: "qa-visibility-fixture-v1.0", answer }, costUsd: 0, limitations: ["Synthetic QA fixture; not measured provider visibility and never contractual fulfillment."] };
  } };
}

async function persistObservation(tx: Tx, context: WorkspaceContext, run: typeof aiVisibilityRuns.$inferSelect, set: typeof aiVisibilityPromptSets.$inferSelect, prompt: typeof aiVisibilityPrompts.$inferSelect, callId: string, response: ProviderResult, observedAt = new Date(), captureCreatedAt = new Date()) {
  const parsed = response.status === "SUCCEEDED" && response.answer ? parseVisibilityAnswer(response.answer, response.citations, set.aliases) : null;
  const [observation] = await tx.insert(aiVisibilityObservations).values({ workspaceId: context.workspaceId, promptSetId: set.id, runId: run.id, promptId: prompt.id, callId, source: run.source, surface: run.surface, model: response.model, status: response.status, renderedPrompt: prompt.renderedPrompt, promptHash: prompt.promptHash, answerHash: response.answer ? visibilityHash(response.answer) : null, providerResponseId: response.providerResponseId, parsed, parserVersion: PARSER_VERSION, usage: { inputTokens: response.inputTokens, outputTokens: response.outputTokens, costUsd: response.costUsd, retryable: response.retryable, retryAfterSeconds: response.retryAfterSeconds }, limitations: [...response.limitations, ...(parsed?.limitations ?? [])], observedAt, recordedByUserId: run.actorUserId }).onConflictDoNothing().returning();
  if (observation && response.answer) await tx.insert(aiVisibilityCaptures).values({ workspaceId: context.workspaceId, observationId: observation.id, answer: response.answer, providerData: response.raw ?? { source: run.source }, createdAt: captureCreatedAt, expiresAt: new Date(captureCreatedAt.getTime() + 90 * 86400_000) });
  return observation;
}

// Commit a reservation BEFORE any paid call. On an indeterminate crash the
// reservation is never reclaimed: recovery records UNAVAILABLE, not a second bill.
export async function observeVisibilityPrompt(context: WorkspaceContext, runId: string, promptId: string, database = db, testProvider?: VisibilityProvider) {
  requireId(runId); requireId(promptId);
  const prepared = await withTenantContext(database, context, async tx => {
    await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, context.workspaceId)).for("update");
    const [run] = await tx.select().from(aiVisibilityRuns).where(and(scoped(context.workspaceId), eq(aiVisibilityRuns.id, runId))).for("update");
    if (!run || run.completedAt) return null;
    const [set] = await tx.select().from(aiVisibilityPromptSets).where(and(eq(aiVisibilityPromptSets.workspaceId, context.workspaceId), eq(aiVisibilityPromptSets.id, run.promptSetId)));
    const [prompt] = await tx.select().from(aiVisibilityPrompts).where(and(eq(aiVisibilityPrompts.workspaceId, context.workspaceId), eq(aiVisibilityPrompts.promptSetId, set.id), eq(aiVisibilityPrompts.id, promptId)));
    if (!prompt) throw new VisibilityValidationError("Prompt was not found in this run's exact set.");
    const [existing] = await tx.select().from(aiVisibilityCalls).where(and(eq(aiVisibilityCalls.workspaceId, context.workspaceId), eq(aiVisibilityCalls.runId, runId), eq(aiVisibilityCalls.promptId, promptId)));
    if (existing) {
      const [observation] = await tx.select({ id: aiVisibilityObservations.id }).from(aiVisibilityObservations).where(and(eq(aiVisibilityObservations.workspaceId, context.workspaceId), eq(aiVisibilityObservations.callId, existing.id)));
      if (!observation && Date.now() - existing.createdAt.getTime() > 120_000) await persistObservation(tx, context, run, set, prompt, existing.id, unavailableProviderResult("INDETERMINATE_PROVIDER_ATTEMPT_NOT_RETRIED"));
      return null;
    }
    // Duplicate workflows may reach different prompts at once. The run lock and
    // durable unresolved reservation keep provider concurrency at one.
    const pending = await tx.execute(sql`select c.id from public.ai_visibility_calls c
      where c.workspace_id=${context.workspaceId} and c.run_id=${runId}
        and not exists(select 1 from public.ai_visibility_observations o where o.workspace_id=c.workspace_id and o.call_id=c.id)
      limit 1`);
    if (pending.rows.length) return null;
    let unavailable: string | null = null;
    try {
      const limits = await assertAutomationAllowed(tx, context, "visibility");
      if (run.source === "API") {
        const usage = await operationalUsage(tx, context);
        if (run.createdAt.toISOString().slice(0, 7) !== new Date().toISOString().slice(0, 7) || usage.committedCostUsd > Number(limits.monthlyCostUsd) || usage.visibilityCalls > limits.visibilityCallLimit) throw new OperationsValidationError("Workspace visibility budget changed after queueing.", "BUDGET");
      }
    } catch (error) {
      if (!(error instanceof OperationsValidationError)) throw error;
      unavailable = "WORKSPACE_AUTOMATION_BLOCKED";
      await operationalEvent(tx, context, `operations.${error.code.toLowerCase()}`, { runId, reason: error.message });
    }
    try { const current = await sourceData(tx, context, run.websiteId); if (current.contentHash !== set.contentHash || current.limits.prompts < run.promptCount || !current.limits.surfaces) unavailable = "FACTS_OR_ENTITLEMENTS_CHANGED"; }
    catch (error) { if (error instanceof VisibilityValidationError) unavailable = "VERIFIED_FACTS_UNAVAILABLE"; else throw error; }
    if (run.source === "QA_FIXTURE" && serverEnv.APP_ENV !== "qa") unavailable = "QA_FIXTURE_DISABLED";
    if (run.source === "API" && !serverEnv.PERPLEXITY_API_KEY && !testProvider) unavailable = "PROVIDER_NOT_CONFIGURED";
    const previous = await tx.select({ status: aiVisibilityObservations.status, usage: aiVisibilityObservations.usage }).from(aiVisibilityObservations).where(and(eq(aiVisibilityObservations.workspaceId, context.workspaceId), eq(aiVisibilityObservations.runId, run.id)));
    if (previous.some(o => o.status === "FAILED")) unavailable = "PROVIDER_RUN_STOPPED_AFTER_ERROR";
    if (previous.reduce((total, o) => total + Number(o.usage.costUsd ?? 0), 0) >= VISIBILITY_BUDGET.maxEstimatedCostUsd) unavailable = "PROVIDER_COST_BUDGET_EXHAUSTED";
    const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(aiVisibilityCalls).where(and(eq(aiVisibilityCalls.workspaceId, context.workspaceId), eq(aiVisibilityCalls.runId, runId)));
    if (count.n >= Math.min(run.budget.maxCalls, VISIBILITY_BUDGET.maxCalls)) unavailable = "PROVIDER_CALL_BUDGET_EXHAUSTED";
    const [call] = await tx.insert(aiVisibilityCalls).values({ workspaceId: context.workspaceId, promptSetId: set.id, runId, promptId }).returning();
    await tx.update(aiVisibilityRuns).set({ status: "RUNNING", startedAt: run.startedAt ?? new Date() }).where(and(scoped(context.workspaceId), eq(aiVisibilityRuns.id, runId)));
    return { run, set, prompt, call, unavailable };
  });
  if (!prepared) return;
  const { run, set, prompt, call } = prepared;
  if (testProvider && process.env.NODE_ENV !== "test") throw new Error("Test provider injection is unavailable outside tests.");
  const provider = testProvider ?? (run.source === "QA_FIXTURE" ? fixtureProvider(set) : createPerplexityProvider(serverEnv.PERPLEXITY_API_KEY));
  const response = prepared.unavailable ? unavailableProviderResult(prepared.unavailable) : await provider.observe(prompt.renderedPrompt);
  await withTenantContext(database, context, async tx => {
    const [locked] = await tx.select().from(aiVisibilityRuns).where(and(scoped(context.workspaceId), eq(aiVisibilityRuns.id, runId))).for("update");
    if (!locked.completedAt) await persistObservation(tx, context, run, set, prompt, call.id, response);
  });
}

export async function visibilityRunPromptIds(context: WorkspaceContext, runId: string, database = db) {
  return withTenantContext(database, context, async tx => {
    const [run] = await tx.select().from(aiVisibilityRuns).where(and(scoped(context.workspaceId), eq(aiVisibilityRuns.id, runId)));
    if (!run || run.completedAt) return [];
    return (await tx.select({ id: aiVisibilityPrompts.id }).from(aiVisibilityPrompts).where(and(eq(aiVisibilityPrompts.workspaceId, context.workspaceId), eq(aiVisibilityPrompts.promptSetId, run.promptSetId))).orderBy(aiVisibilityPrompts.key).limit(run.budget.maxPrompts)).map(p => p.id);
  });
}
export async function finishVisibilityRun(context: WorkspaceContext, runId: string, database = db) {
  return withTenantContext(database, context, async tx => {
    const [run] = await tx.select().from(aiVisibilityRuns).where(and(scoped(context.workspaceId), eq(aiVisibilityRuns.id, runId))).for("update");
    if (!run || run.completedAt) return true;
    const observations = await tx.select().from(aiVisibilityObservations).where(and(eq(aiVisibilityObservations.workspaceId, context.workspaceId), eq(aiVisibilityObservations.runId, runId)));
    if (observations.length < run.promptCount) return false;
    const metrics = aggregateVisibility(observations);
    const status = metrics.successfulPrompts === run.promptCount ? "SUCCEEDED" : metrics.successfulPrompts ? "PARTIAL" : metrics.failedPrompts ? "FAILED" : "UNAVAILABLE";
    await tx.update(aiVisibilityRuns).set({ status, successCount: metrics.successfulPrompts, errorCount: metrics.failedPrompts, unavailableCount: metrics.unavailablePrompts, usage: { inputTokens: observations.reduce((n, o) => n + Number(o.usage.inputTokens ?? 0), 0), outputTokens: observations.reduce((n, o) => n + Number(o.usage.outputTokens ?? 0), 0), costUsd: observations.every(o => typeof o.usage.costUsd === "number") ? observations.reduce((n, o) => n + Number(o.usage.costUsd), 0) : null }, limitations: [...new Set(observations.flatMap(o => o.limitations))], completedAt: new Date() }).where(and(scoped(context.workspaceId), eq(aiVisibilityRuns.id, runId)));
    await activity(tx, context, `ai_visibility.run_${status.toLowerCase()}`, run.id);
    return true;
  });
}

export async function recordManualVisibilityObservation(context: WorkspaceContext, websiteId: string, input: { promptId: string; surface: string; answer: string; observedAt: string; limitations: string }, database = db) {
  human(context); requireId(input.promptId);
  const observedAt = new Date(input.observedAt.endsWith("Z") ? input.observedAt : input.observedAt + "Z");
  if (!input.surface.trim() || input.surface.length > 100 || !input.answer.trim() || input.answer.length > 100_000 || !input.limitations.trim() || input.limitations.length > 2000 || !Number.isFinite(observedAt.getTime()) || observedAt > new Date()) throw new VisibilityValidationError("Provide a surface, captured answer, past observation timestamp, and limitations within the displayed bounds.");
  return withTenantContext(database, context, async tx => {
    const target = await site(tx, context, websiteId);
    const [prompt] = await tx.select().from(aiVisibilityPrompts).where(and(eq(aiVisibilityPrompts.workspaceId, context.workspaceId), eq(aiVisibilityPrompts.websiteId, websiteId), eq(aiVisibilityPrompts.id, input.promptId)));
    if (!prompt) throw new VisibilityValidationError("Prompt was not found.");
    const [set] = await tx.select().from(aiVisibilityPromptSets).where(and(eq(aiVisibilityPromptSets.workspaceId, context.workspaceId), eq(aiVisibilityPromptSets.id, prompt.promptSetId)));
    const [run] = await tx.insert(aiVisibilityRuns).values({ workspaceId: context.workspaceId, clientId: target.client.id, websiteId, promptSetId: set.id, promptSetVersion: set.version, source: "MANUAL", surface: `MANUAL: ${input.surface.trim()}`, model: "Human-recorded; model not independently confirmed", adapterVersion: "manual-observation-v1.0", trigger: "USER", window: observedAt.toISOString().slice(0, 7), idempotencyKey: visibilityHash([context.workspaceId, prompt.id, input]), context: { localization: "Not independently controlled; see recorder limitations" }, budget: { maxCalls: 0 }, promptCount: 1, actorUserId: context.userId }).onConflictDoNothing().returning();
    if (!run) return;
    const [call] = await tx.insert(aiVisibilityCalls).values({ workspaceId: context.workspaceId, promptSetId: set.id, runId: run.id, promptId: prompt.id }).returning();
    await tx.update(aiVisibilityRuns).set({ status: "RUNNING", startedAt: new Date() }).where(and(scoped(context.workspaceId), eq(aiVisibilityRuns.id, run.id)));
    await persistObservation(tx, context, run, set, prompt, call.id, { ...unavailableProviderResult(), status: "SUCCEEDED", answer: input.answer, model: run.model, costUsd: 0, raw: { source: "MANUAL", recorder: context.userId }, limitations: [input.limitations, "Manual capture; no automated consumer UI access; no API entitlement credit."] }, observedAt);
    await tx.update(aiVisibilityRuns).set({ status: "SUCCEEDED", successCount: 1, completedAt: new Date() }).where(and(scoped(context.workspaceId), eq(aiVisibilityRuns.id, run.id)));
    await activity(tx, context, "ai_visibility.manual_observation_recorded", run.id);
    return run;
  });
}

export async function getVisibilityPanel(context: WorkspaceContext, websiteId: string, database = db) {
  return withTenantContext(database, context, async tx => {
    const target = await site(tx, context, websiteId);
    const sets = await tx.select().from(aiVisibilityPromptSets).where(and(eq(aiVisibilityPromptSets.workspaceId, context.workspaceId), eq(aiVisibilityPromptSets.websiteId, websiteId))).orderBy(desc(aiVisibilityPromptSets.version)).limit(20);
    const prompts = sets[0] ? await tx.select().from(aiVisibilityPrompts).where(and(eq(aiVisibilityPrompts.workspaceId, context.workspaceId), eq(aiVisibilityPrompts.promptSetId, sets[0].id))).orderBy(aiVisibilityPrompts.templateKey) : [];
    const runs = await tx.select().from(aiVisibilityRuns).where(and(scoped(context.workspaceId), eq(aiVisibilityRuns.websiteId, websiteId))).orderBy(desc(aiVisibilityRuns.createdAt)).limit(30);
    const observations = runs.length ? await tx.select().from(aiVisibilityObservations).where(and(eq(aiVisibilityObservations.workspaceId, context.workspaceId), inArray(aiVisibilityObservations.runId, runs.map(r => r.id)))).orderBy(desc(aiVisibilityObservations.observedAt)) : [];
    let factStatus = "READY";
    try { await sourceData(tx, context, websiteId); } catch (error) { if (error instanceof VisibilityValidationError) factStatus = error.message; else throw error; }
    return { ...target, limits: visibilityLimits(target.client.servicePlan, target.client.servicePlanVersion), sets, prompts, runs, observations, configured: Boolean(serverEnv.PERPLEXITY_API_KEY), factStatus, qa: serverEnv.APP_ENV === "qa" };
  });
}

export async function getVisibilityObservation(context: WorkspaceContext, observationId: string, database = db) {
  requireId(observationId);
  return withTenantContext(database, context, async tx => {
    const [observation] = await tx.select().from(aiVisibilityObservations).where(and(eq(aiVisibilityObservations.workspaceId, context.workspaceId), eq(aiVisibilityObservations.id, observationId)));
    if (!observation) return null;
    const [capture] = await tx.select().from(aiVisibilityCaptures).where(and(eq(aiVisibilityCaptures.workspaceId, context.workspaceId), eq(aiVisibilityCaptures.observationId, observationId), sql`${aiVisibilityCaptures.expiresAt}>now()`));
    return { observation, capture: capture ?? null };
  });
}

export async function visibilityCycleSummary(tx: Tx, workspaceId: string, clientId: string, websiteId: string | null, start: string, end: string) {
  const runs = await tx.select().from(aiVisibilityRuns).where(and(scoped(workspaceId), eq(aiVisibilityRuns.clientId, clientId), ...(websiteId ? [eq(aiVisibilityRuns.websiteId, websiteId)] : []), eq(aiVisibilityRuns.source, "API"), sql`${aiVisibilityRuns.createdAt}>=${start}::date and ${aiVisibilityRuns.createdAt}<${end}::date+interval '1 day'`));
  const observations = runs.length ? await tx.select().from(aiVisibilityObservations).where(and(eq(aiVisibilityObservations.workspaceId, workspaceId), inArray(aiVisibilityObservations.runId, runs.map(r => r.id)), sql`${aiVisibilityObservations.observedAt}>=${start}::date and ${aiVisibilityObservations.observedAt}<${end}::date+interval '1 day'`)) : [];
  return { configured: Boolean(serverEnv.PERPLEXITY_API_KEY), completedWindows: new Set(runs.filter(r => r.status === "SUCCEEDED" && observations.filter(o => o.runId === r.id && o.status === "SUCCEEDED").length === r.promptCount).map(r => r.window)).size, observationsUsed: observations.filter(o => o.status === "SUCCEEDED").length,
    sections: runs.map(run => { const sample = observations.filter(o => o.runId === run.id); const metrics = aggregateVisibility(sample); return { runId: run.id, surface: run.surface, model: run.model, window: run.window, promptSetVersion: run.promptSetVersion, source: run.source, metrics, copy: sampledReportCopy(run.surface, metrics), limitations: run.limitations }; }).filter(section => section.metrics.successfulPrompts > 0) };
}

export async function listVisibilityScheduleRefs() {
  if (!serverEnv.PERPLEXITY_API_KEY) return [];
  if (pauseApplies(await platformPauseState(), "visibility")) return [];
  const rows = await db.execute(sql`select * from public.list_ai_visibility_site_refs(100)`);
  return filterUnpausedWorkspaceRefs(rows.rows as { workspace_id: string; website_id: string }[], "visibility");
}
export async function prepareScheduledVisibility(workspaceId: string, websiteId: string) {
  const context: WorkspaceContext = { workspaceId, actorType: "SYSTEM", role: "OWNER", correlationId: randomUUID() };
  try { return { context, run: await requestVisibilityRun(context, websiteId) }; }
  catch (error) { if (error instanceof VisibilityValidationError || error instanceof OperationsValidationError) return null; throw error; }
}

export async function getVisibilityDashboard(context: WorkspaceContext, database = db) {
  return withTenantContext(database, context, async tx => {
    const targets = await tx.select({ id: websites.id, name: websites.displayName, clientId: clients.id, plan: clients.servicePlan, planVersion: clients.servicePlanVersion }).from(websites).innerJoin(clients, and(eq(clients.workspaceId, websites.workspaceId), eq(clients.id, websites.clientId))).where(and(eq(websites.workspaceId, context.workspaceId), isNull(websites.archivedAt), isNull(clients.archivedAt), inArray(clients.servicePlan, ["ESSENTIALS", "GROWTH", "PRO"])));
    const facts = eligibleFacts(await tx.select().from(businessFacts).where(eq(businessFacts.workspaceId, context.workspaceId)));
    const runs = await tx.select({ websiteId: aiVisibilityRuns.websiteId, status: aiVisibilityRuns.status, window: aiVisibilityRuns.window }).from(aiVisibilityRuns).where(and(scoped(context.workspaceId), eq(aiVisibilityRuns.source, "API")));
    const [reviews] = await tx.select({ n: sql<number>`count(*)::int` }).from(aiVisibilityObservations).where(and(eq(aiVisibilityObservations.workspaceId, context.workspaceId), eq(aiVisibilityObservations.source, "API"), sql`${aiVisibilityObservations.parsed}->'client'->>'classification'='REVIEW_REQUIRED'`));
    const sites = targets.map(target => {
      const own = facts.filter(f => { const item = f as typeof businessFacts.$inferSelect; return item.clientId === target.clientId && (!item.websiteId || item.websiteId === target.id) && !item.structuredValue.competitorTargetId; });
      const ready = own.some(f => f.factType === "service") && own.some(f => ["location", "service_area"].includes(f.factType)) && own.some(f => ["business_name", "legal_name", "display_name", "brand_name"].includes(f.factType)) && own.some(f => f.factType === "canonical_domain");
      const currentWindow = visibilityWindow(new Date(), visibilityLimits(target.plan, target.planVersion).windows);
      return { ...target, factStatus: ready ? "Verified prompt facts available" : "Missing verified prompt facts", ready, due: ready && !runs.some(r => r.websiteId === target.id && r.window === currentWindow && r.status === "SUCCEEDED") };
    });
    return { sites, due: serverEnv.PERPLEXITY_API_KEY ? sites.filter(s => s.due).length : 0, failed: runs.filter(r => r.status === "FAILED" || r.status === "PARTIAL").length, missingFacts: new Set(sites.filter(s => !s.ready).map(s => s.clientId)).size, unavailable: serverEnv.PERPLEXITY_API_KEY ? 0 : new Set(sites.map(s => s.clientId)).size, review: reviews.n };
  });
}

// Explicit QA-only retention exercise; never provider evidence or API cadence.
export async function createRetentionQaFixture(context: WorkspaceContext, websiteId: string, database = db) {
  human(context); assertWorkspaceRole(context,["OWNER"]);
  if (serverEnv.APP_ENV !== "qa") throw new VisibilityValidationError("Retention fixtures are QA-only.");
  requireId(websiteId);
  await enforceActionRateLimit(context,"visibility",database);
  return withTenantContext(database,context,async tx=>{
    const target=await site(tx,context,websiteId);
    const [set]=await tx.select().from(aiVisibilityPromptSets).where(and(eq(aiVisibilityPromptSets.workspaceId,context.workspaceId),eq(aiVisibilityPromptSets.websiteId,websiteId))).orderBy(desc(aiVisibilityPromptSets.version)).limit(1);
    if(!set) throw new VisibilityValidationError("Generate a QA website prompt set first.");
    const [prompt]=await tx.select().from(aiVisibilityPrompts).where(and(eq(aiVisibilityPrompts.workspaceId,context.workspaceId),eq(aiVisibilityPrompts.promptSetId,set.id))).limit(1);
    for(const expired of [true,false]) {
      const captureAt=new Date(Date.now()-(expired ? 91 : 0)*86400_000);
      const [run]=await tx.insert(aiVisibilityRuns).values({workspaceId:context.workspaceId,clientId:target.client.id,websiteId,promptSetId:set.id,promptSetVersion:set.version,source:"QA_FIXTURE",surface:"QA retention fixture (not provider evidence)",model:"deterministic-test-fixture",adapterVersion:"qa-retention-v1",trigger:"USER",window:"QA_RETENTION",idempotencyKey:randomUUID(),context:{fixture:true,expired},budget:{maxCalls:0},promptCount:1,actorUserId:context.userId}).returning();
      const [call]=await tx.insert(aiVisibilityCalls).values({workspaceId:context.workspaceId,promptSetId:set.id,runId:run.id,promptId:prompt.id}).returning();
      await tx.update(aiVisibilityRuns).set({status:"RUNNING",startedAt:new Date()}).where(and(scoped(context.workspaceId),eq(aiVisibilityRuns.id,run.id)));
      await persistObservation(tx,context,run,set,prompt,call.id,{...unavailableProviderResult(),status:"SUCCEEDED",answer:"Synthetic retention exercise. No provider request.",model:run.model,costUsd:0,limitations:["QA RETENTION FIXTURE; no contractual completion or measured visibility"]},captureAt,captureAt);
      await tx.update(aiVisibilityRuns).set({status:"SUCCEEDED",successCount:1,completedAt:new Date()}).where(and(scoped(context.workspaceId),eq(aiVisibilityRuns.id,run.id)));
    }
    await activity(tx,context,"operations.retention_fixture_created",websiteId);
  });
}
