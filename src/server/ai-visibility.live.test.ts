import { Pool, type PoolClient } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import type { Db } from "@/db/client";
import type { WorkspaceContext } from "@/domain/tenancy/context";
import { serverEnv } from "@/lib/env";
import { createBusinessFact } from "./agents";
import { approveVisibilityCompetitorAliases, createVisibilityPromptSet, finishVisibilityRun, getVisibilityPanel, observeVisibilityPrompt, recordManualVisibilityObservation, requestVisibilityRun, visibilityCycleSummary, visibilityRunPromptIds } from "./ai-visibility";
import { parsePerplexityResponse, PERPLEXITY_MODEL, type VisibilityProvider } from "@/domain/ai-visibility/provider";
import { createMonthlyCycle, generateMonthlyReportDraft } from "./monthly-cycles";

const connectionString = process.env.OPTIQ_TEST_RUNNER_URL;
const workspaceId = randomUUID(), otherWorkspace = "00000000-0000-4000-8000-0000000000a1";
const context: WorkspaceContext = { workspaceId, actorType: "USER", role: "OWNER", userId: "rls-user-b" };
const tables = ["ai_visibility_prompt_sets", "ai_visibility_prompts", "ai_visibility_runs", "ai_visibility_calls", "ai_visibility_observations", "ai_visibility_captures"];
describe.skipIf(!connectionString)("Phase 9 live visibility and non-bypass RLS", () => {
  let pool: Pool, client: PoolClient, database: Db, websiteId: string, clientId: string;
  const originalEnv = serverEnv.APP_ENV;
  beforeAll(async () => {
    const url = new URL(connectionString!);
    if (url.pathname !== "/optiq_phase5_review_final_20260922" || !url.hostname.startsWith("ep-shy-firefly-arkuloja")) throw new Error("Designated disposable test database only");
    pool = new Pool({ connectionString }); client = await pool.connect();
    expect((await client.query("select rolsuper,rolbypassrls from pg_roles where rolname=current_user")).rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    const pinned = drizzle({ client, schema }); database = { transaction: async (operation: (tx: typeof pinned) => Promise<unknown>) => operation(pinned) } as unknown as Db;
  });
  beforeEach(async () => {
    serverEnv.APP_ENV = "qa";
    await client.query("begin");
    await client.query("select set_config('app.workspace_id',$1,true),set_config('app.user_id','rls-user-b',true)", [workspaceId]);
    await client.query("insert into workspaces(id,name,slug) values($1,'Phase 9 isolated disposable tenant',$2)", [workspaceId, `phase9-${workspaceId}`]);
    await client.query("insert into workspace_memberships(workspace_id,user_id,role) values($1,'rls-user-b','OWNER')", [workspaceId]);
    clientId = (await client.query("insert into clients(workspace_id,name,service_plan) values($1,'Visibility disposable client','GROWTH') returning id", [workspaceId])).rows[0].id;
    websiteId = (await client.query("insert into websites(workspace_id,client_id,display_name,domain,canonical_url) values($1,$2,'Visibility disposable website','cedar.example','https://cedar.example') returning id", [workspaceId, clientId])).rows[0].id;
    for (const [factType, value] of [["business_name", "Cedar Plumbing"], ["canonical_domain", "cedar.example"], ["service", "plumbing"], ["location", "Denver"]]) await createBusinessFact(context, clientId, { factType, value, sourceReference: "Human reviewed disposable fixture", verificationStatus: "VERIFIED", sensitivity: "PUBLIC" }, database);
  });
  afterEach(async () => { await client.query("rollback"); serverEnv.APP_ENV = originalEnv; vi.restoreAllMocks(); });
  afterAll(async () => { client?.release(); await pool?.end(); });
  const provider = (): VisibilityProvider => ({ surface: "Perplexity Agent API", version: "perplexity-agent-v1.0", model: PERPLEXITY_MODEL, observe: vi.fn(async () => parsePerplexityResponse({ id: "disposable-provider-result", status: "completed", model: PERPLEXITY_MODEL, output: [{ type: "message", content: [{ type: "output_text", text: "We recommend Cedar Plumbing in Denver." }] }, { type: "search_results", results: [{ id: 1, url: "https://cedar.example/services" }] }], usage: { input_tokens: 5, output_tokens: 10, cost: { currency: "USD", total_cost: 0.001 } } })) });
  async function runAll(source: "API" | "QA_FIXTURE" = "QA_FIXTURE") {
    const set = await createVisibilityPromptSet(context, websiteId, database);
    const run = await requestVisibilityRun(context, websiteId, source, database);
    const ids = await visibilityRunPromptIds(context, run.id, database);
    const adapter = provider();
    for (const id of ids) await observeVisibilityPrompt(context, run.id, id, database, source === "API" ? adapter : undefined);
    expect(await finishVisibilityRun(context, run.id, database)).toBe(true);
    return { run, set, ids, adapter };
  }
  async function rejected(query: string, values: unknown[] = [], code = "23514") {
    await client.query("savepoint rejected_change");
    try { await expect(client.query(query, values)).rejects.toMatchObject({ code: code === "42501" ? expect.stringMatching(/^(42501|23514)$/) : code }); } finally { await client.query("rollback to savepoint rejected_change"); }
  }
  it("creates a versioned set once and preserves exact PUBLIC VERIFIED references", async () => {
    const set = await createVisibilityPromptSet(context, websiteId, database);
    expect((await createVisibilityPromptSet(context, websiteId, database)).id).toBe(set.id);
    expect(set.aliases.client.names).toContain("Cedar Plumbing");
    const panel = await getVisibilityPanel(context, websiteId, database); expect(panel.prompts.length).toBeGreaterThan(0); expect(panel.prompts.length).toBeLessThanOrEqual(20);
    await rejected("update ai_visibility_prompt_sets set version=2 where id=$1", [set.id]);
    await rejected("delete from ai_visibility_prompt_sets where id=$1", [set.id]);
  });
  it("requires explicit competitor alias approval and limits configured competitors", async () => {
    await client.query("insert into competitor_targets(workspace_id,client_id,website_id,name,domain,canonical_url,created_by_user_id) values($1,$2,$3,'Aspen Plumbing','aspen.example','https://aspen.example','rls-user-b')", [workspaceId, clientId, websiteId]);
    expect((await createVisibilityPromptSet(context, websiteId, database)).aliases.competitors).toHaveLength(0);
    await approveVisibilityCompetitorAliases(context, websiteId, database);
    const set = await createVisibilityPromptSet(context, websiteId, database); expect(set.aliases.competitors.some(c => c.names.includes("Aspen Plumbing"))).toBe(true); expect(set.aliases.competitors.length).toBeLessThanOrEqual(5); expect(set.version).toBe(2);
    await expect(approveVisibilityCompetitorAliases({ ...context, role: "ANALYST" }, websiteId, database)).rejects.toThrow();
  });
  it("duplicate run and prompt execution consumes one provider call per prompt", async () => {
    const { run, ids, adapter } = await runAll("API");
    expect((await requestVisibilityRun(context, websiteId, "API", database)).id).toBe(run.id);
    for (const id of ids) await observeVisibilityPrompt(context, run.id, id, database, adapter);
    expect(adapter.observe).toHaveBeenCalledTimes(ids.length);
    expect((await client.query("select count(*)::int n from ai_visibility_observations where run_id=$1", [run.id])).rows[0].n).toBe(ids.length);
  });
  it("API observations feed cycle usage and sampled report, not audit scores", async () => {
    const auditId = (await client.query("insert into audits(workspace_id,website_id,title) values($1,$2,'Score isolation fixture') returning id", [workspaceId, websiteId])).rows[0].id;
    const auditRunId = (await client.query("insert into audit_runs(workspace_id,audit_id,website_id,overall_score) values($1,$2,$3,80) returning id", [workspaceId, auditId, websiteId])).rows[0].id;
    await client.query("insert into audit_category_scores(workspace_id,audit_run_id,category,score,evidence_coverage_basis_points,low_coverage,applicable_max_penalty,available_max_penalty,actual_penalty_basis_points) values($1,$2,'aiReadiness',80,10000,false,100,100,2000)", [workspaceId, auditRunId]);
    const before = (await client.query("select * from audit_category_scores order by audit_run_id,category")).rows;
    const { run, ids } = await runAll("API");
    const month = run.createdAt.toISOString().slice(0, 7);
    const summary = await database.transaction(tx => visibilityCycleSummary(tx, workspaceId, clientId, websiteId, `${month}-01`, `${month}-28`));
    expect(summary.observationsUsed).toBe(ids.length); expect(summary.completedWindows).toBe(1); expect(summary.sections[0].copy).toContain("sampled Perplexity Agent API");
    expect((await client.query("select * from audit_category_scores order by audit_run_id,category")).rows).toEqual(before);
    expect((await client.query("select overall_score from audit_runs where id=$1", [auditRunId])).rows[0].overall_score).toBe(80);
    const cycle = await createMonthlyCycle(context, { clientId }, database);
    const report = await generateMonthlyReportDraft(context, cycle.id, database);
    expect(JSON.stringify(report.sections.observedAiVisibility)).toContain("SAMPLED_API_OBSERVATIONS");
  });
  it("QA fixtures earn zero entitlement and do not enter API report sections", async () => {
    await runAll();
    const summary = await database.transaction(tx => visibilityCycleSummary(tx, workspaceId, clientId, websiteId, "2026-09-01", "2026-09-30"));
    expect(summary.observationsUsed).toBe(0); expect(summary.completedWindows).toBe(0); expect(summary.sections).toHaveLength(0);
  });
  it("unavailable provider is retained with zero usage and failed denominators", async () => {
    await createVisibilityPromptSet(context, websiteId, database);
    const run = await requestVisibilityRun(context, websiteId, "API", database);
    for (const id of await visibilityRunPromptIds(context, run.id, database)) await observeVisibilityPrompt(context, run.id, id, database);
    await finishVisibilityRun(context, run.id, database);
    expect((await client.query("select status,success_count from ai_visibility_runs where id=$1", [run.id])).rows[0]).toEqual({ status: "UNAVAILABLE", success_count: 0 });
  });
  it("manual capture retains recorder, timestamp and labels, with no API credit", async () => {
    await createVisibilityPromptSet(context, websiteId, database); const panel = await getVisibilityPanel(context, websiteId, database);
    const manual = await recordManualVisibilityObservation({ ...context, role: "ANALYST" }, websiteId, { promptId: panel.prompts[0].id, surface: "Consumer UI manually inspected", answer: "Cedar Plumbing serves Denver.", observedAt: "2026-09-01T12:00:00Z", limitations: "Screenshot retained by reviewer; personalized session; manual only." }, database);
    expect(manual?.source).toBe("MANUAL");
    expect((await client.query("select recorded_by_user_id,source from ai_visibility_observations where run_id=$1", [manual!.id])).rows[0]).toEqual({ recorded_by_user_id: "rls-user-b", source: "MANUAL" });
  });
  it("changed or revoked facts block old-set calls and preserve old versions", async () => {
    const set = await createVisibilityPromptSet(context, websiteId, database); const run = await requestVisibilityRun(context, websiteId, "API", database); const ids = await visibilityRunPromptIds(context, run.id, database);
    await client.query("update business_facts set verification_status='NEEDS_REVIEW' where workspace_id=$1 and fact_type='service'", [workspaceId]);
    const adapter = provider(); await observeVisibilityPrompt(context, run.id, ids[0], database, adapter); expect(adapter.observe).not.toHaveBeenCalled();
    expect((await client.query("select status from ai_visibility_observations where run_id=$1", [run.id])).rows[0].status).toBe("UNAVAILABLE");
    expect((await client.query("select id from ai_visibility_prompt_sets where id=$1", [set.id])).rowCount).toBe(1);
  });
  it("unknown outcome is not retried and becomes unavailable after the deadline", async () => {
    const set = await createVisibilityPromptSet(context, websiteId, database); const run = await requestVisibilityRun(context, websiteId, "API", database); const ids = await visibilityRunPromptIds(context, run.id, database);
    await client.query("insert into ai_visibility_calls(workspace_id,prompt_set_id,run_id,prompt_id,created_at) values($1,$2,$3,$4,now()-interval '5 minutes')", [workspaceId, set.id, run.id, ids[0]]);
    const adapter = provider(); await observeVisibilityPrompt(context, run.id, ids[0], database, adapter); expect(adapter.observe).not.toHaveBeenCalled();
    expect((await client.query("select limitations from ai_visibility_observations where run_id=$1", [run.id])).rows[0].limitations).toContain("INDETERMINATE_PROVIDER_ATTEMPT_NOT_RETRIED");
  });
  it.each(tables)("%s rejects UPDATE/DELETE and enforces cross-tenant CRUD", async table => {
    await runAll();
    const row = (await client.query(`select * from ${table} where workspace_id=$1 limit 1`, [workspaceId])).rows[0]; expect(row).toBeTruthy();
    await rejected(`update ${table} set id=id where id=$1`, [row.id]);
    await rejected(`delete from ${table} where id=$1`, [row.id]);
    const policy = (await client.query("select relrowsecurity,relforcerowsecurity from pg_class where relname=$1", [table])).rows[0]; expect(policy).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    await client.query("select set_config('app.workspace_id',$1,true)", [otherWorkspace]);
    expect((await client.query(`select id from ${table} where id=$1`, [row.id])).rowCount).toBe(0);
    expect((await client.query(`update ${table} set id=id where id=$1`, [row.id])).rowCount).toBe(0);
    expect((await client.query(`delete from ${table} where id=$1`, [row.id])).rowCount).toBe(0);
    await rejected(`insert into ${table} select * from jsonb_populate_record(null::${table},$1::jsonb)`, [JSON.stringify({ ...row, id: randomUUID() })], "42501");
    await client.query("select set_config('app.workspace_id',$1,true)", [workspaceId]);
  });
  it("cross-workspace run/prompt/observation references fail", async () => {
    const { run } = await runAll();
    const call = (await client.query("select * from ai_visibility_calls where run_id=$1 limit 1", [run.id])).rows[0];
    await client.query("select set_config('app.workspace_id',$1,true)", [otherWorkspace]);
    await rejected("insert into ai_visibility_calls select * from jsonb_populate_record(null::ai_visibility_calls,$1::jsonb)", [JSON.stringify({ ...call, id: randomUUID(), workspace_id: otherWorkspace })], "23503");
    await expect(createVisibilityPromptSet({ ...context, workspaceId: otherWorkspace }, websiteId, database)).rejects.toThrow("not found");
  });
  it("production cannot use deterministic provider fixtures", async () => { serverEnv.APP_ENV = "production"; await expect(requestVisibilityRun(context, websiteId, "QA_FIXTURE", database)).rejects.toThrow("QA-only"); });
  it("stops the run after a provider error instead of sending a burst or retrying", async () => {
    await createVisibilityPromptSet(context, websiteId, database); const run = await requestVisibilityRun(context, websiteId, "API", database); const ids = await visibilityRunPromptIds(context, run.id, database);
    const adapter = provider(); vi.mocked(adapter.observe).mockResolvedValue({ ...parsePerplexityResponse(null), retryable: true, retryAfterSeconds: 60, limitations: ["PROVIDER_HTTP_429"] });
    for (const id of ids) await observeVisibilityPrompt(context, run.id, id, database, adapter);
    await finishVisibilityRun(context, run.id, database);
    expect(adapter.observe).toHaveBeenCalledTimes(1);
    expect((await client.query("select status,success_count,error_count,unavailable_count from ai_visibility_runs where id=$1", [run.id])).rows[0]).toEqual({ status: "FAILED", success_count: 0, error_count: 1, unavailable_count: ids.length - 1 });
  });
  it("same-window prompt revision cannot cause a second paid run", async () => {
    const { run } = await runAll("API"); await createBusinessFact(context, clientId, { factType: "service_subtype", value: "drain cleaning", sourceReference: "QA verified", verificationStatus: "VERIFIED" }, database);
    const next = await createVisibilityPromptSet(context, websiteId, database); expect(next.version).toBe(2);
    expect((await requestVisibilityRun(context, websiteId, "API", database)).id).toBe(run.id);
  });
  it("two concurrent requests and workflow attempts make exactly one provider call", async () => {
    await createVisibilityPromptSet(context, websiteId, database);
    // This guarded disposable proof retains committed fixtures until the next
    // schema reset, just like the existing execution concurrency proof.
    await client.query("commit");
    const concurrentDb = drizzle({ client: pool, schema });
    const runs = await Promise.all([requestVisibilityRun(context, websiteId, "API", concurrentDb), requestVisibilityRun(context, websiteId, "API", concurrentDb)]);
    expect(runs[0].id).toBe(runs[1].id);
    const ids = await visibilityRunPromptIds(context, runs[0].id, concurrentDb); const adapter = provider();
    const response = await adapter.observe("Fixture response"); vi.mocked(adapter.observe).mockClear();
    let release!: () => void, entered!: () => void;
    const enteredProvider = new Promise<void>(resolve => { entered = resolve; });
    const released = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(adapter.observe).mockImplementationOnce(async () => { entered(); await released; return response; });
    const firstAttempt = observeVisibilityPrompt(context, runs[0].id, ids[0], concurrentDb, adapter);
    await enteredProvider;
    try {
      await Promise.all([observeVisibilityPrompt(context, runs[0].id, ids[0], concurrentDb, adapter), observeVisibilityPrompt(context, runs[0].id, ids[1], concurrentDb, adapter)]);
      expect(adapter.observe).toHaveBeenCalledTimes(1);
    } finally { release(); await firstAttempt; }
    expect(adapter.observe).toHaveBeenCalledTimes(1);
    for (const id of ids.slice(1)) await observeVisibilityPrompt(context, runs[0].id, id, concurrentDb, adapter);
    await finishVisibilityRun(context, runs[0].id, concurrentDb);
    await client.query("begin"); await client.query("select set_config('app.workspace_id',$1,true)", [workspaceId]);
    expect((await client.query("select count(*)::int n from ai_visibility_calls where run_id=$1 and prompt_id=$2", [runs[0].id, ids[0]])).rows[0].n).toBe(1);
  });
});
