import { setAutomationPause, setWorkspaceBudgets } from "./operations";
import { createQaExecutionFixture, setQaExecutionFlag, requestQaExecutionApproval, decideQaExecutionApproval, requestQaExecution, applyQaExecution, processQaExecution, requestQaRollback, getQaExecutionDetail } from "./qa-execution";
import { fixtureUrl, renderQaFixture, QA_WORKSPACE_FLAG, QA_ACTION_FLAG } from "@/domain/execution/qa-execution";
import { requestPrepareDraftForOpportunity, executePrepareDraftAgentRun, decideApprovalRequest, getDraftArtifact, createBusinessFact } from "./agents";
import { nominateContentOpportunity } from "./content-opportunities";
import { agentDefinitions as runtimeDefinitions } from "@/domain/agents/catalog";
import { requirePersistedAgentDefinition } from "@/domain/agents/persisted-catalog";
import { createImplementationPackage, getImplementationPackage, requestImplementationVerification, executeImplementationVerification, getVerificationDetail, getVerificationDashboard } from "./verification";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { Db } from "@/db/client";
import { buildMonthlyEntitlementSnapshot } from "@/domain/monthly-cycles/entitlements";
import type { WorkspaceContext } from "@/domain/tenancy/context";
import { closeMonthlyCycle, finalizeMonthlyReport, recordImplementationVerification, recordManualImplementation, updateMonthlyDeliverableStatus, generateMonthlyReportDraft, createMonthlyCycle, createScheduledMonthlyCycle } from "./monthly-cycles";

// Opt in only after scripts/phase5-fresh-proof.mjs has created the disposable fixtures.
const connectionString = process.env.OPTIQ_TEST_RUNNER_URL;
const b = "00000000-0000-4000-8000-0000000000b1";
const a = "00000000-0000-4000-8000-0000000000a1";
const cycleId = "81000000-0000-4000-8000-0000000000b1";
const workId = "83000000-0000-4000-8000-0000000000b1";
const context: WorkspaceContext = { workspaceId: b, actorType: "USER", userId: "rls-user-b", role: "OWNER" };
const verification = { status: "VERIFIED" as const, verificationMethod: "Human evidence review", evidence: "Actual test implementation inspected" };
const manual = { whatImplemented: "Test metadata update", implementationDate: "2026-09-01", manualMinutes: 45, evidenceReference: "disposable:test" };
const tables = ["monthly_cycles", "monthly_cycle_deliverables", "monthly_cycle_work_items", "manual_implementation_records", "implementation_verification_records", "monthly_reports"];

describe.skipIf(!connectionString)("Phase 5 live server and RLS proof", () => {
  let pool: Pool;
  let client: PoolClient;
  let database: Db;
  beforeAll(async () => {
    if (!/^\/optiq_phase5_review_(final_)?20260922$/.test(new URL(connectionString!).pathname)) throw new Error("Disposable Phase 5 test database required");
    pool = new Pool({ connectionString });
    client = await pool.connect();
    const role = (await client.query("select rolsuper, rolbypassrls from pg_roles where rolname=current_user")).rows[0];
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
    const pinned = drizzle({ client, schema });
    database = { transaction: async (operation: (tx: typeof pinned) => Promise<unknown>) => operation(pinned) } as unknown as Db;
  });
  beforeEach(async () => {
    await client.query("begin");
    await client.query("select set_config('app.workspace_id', $1, true), set_config('app.user_id','rls-user-b',true)", [b]);
    await client.query("update integration_connections set status='DISCONNECTED' where workspace_id=$1", [b]);
    await client.query("update monthly_cycles set entitlement_snapshot=$1, status='OPEN' where id=$2", [JSON.stringify(buildMonthlyEntitlementSnapshot("GROWTH")), cycleId]);
  });
  afterEach(async () => { await client.query("rollback"); });
  afterAll(async () => { client?.release(); await pool?.end(); });

  it("Phase 10 PREPARE request is blocked by pause and budget before creating a run", async () => {
    const before=(await client.query("select count(*)::int n from agent_runs where workspace_id=$1",[b])).rows[0].n;
    await setAutomationPause(context,{scope:"WORKSPACE",category:"ai",paused:true,reason:"Live PREPARE request proof"},database);
    await expect(requestPrepareDraftForOpportunity(context,"80000000-0000-4000-8000-0000000000b1",database)).rejects.toMatchObject({code:"PAUSED"});
    await setAutomationPause(context,{scope:"WORKSPACE",category:"ai",paused:false,reason:"Resume live proof"},database);
    await setWorkspaceBudgets(context,{monthlyCostUsd:"0",activeWorkflowLimit:0,aiCallLimit:100,visibilityCallLimit:100,crawlConcurrency:2},"Deny new workflow",database);
    await expect(requestPrepareDraftForOpportunity(context,"80000000-0000-4000-8000-0000000000b1",database)).rejects.toMatchObject({code:"BUDGET"});
    expect((await client.query("select count(*)::int n from agent_runs where workspace_id=$1",[b])).rows[0].n).toBe(before);
  });

  it("Phase 10 ordinary PREPARE requests cannot replay an uncertain earlier paid failure",async()=>{
    const opp=(await client.query("select * from opportunities where id='80000000-0000-4000-8000-0000000000b1'")).rows[0];
    await client.query("insert into agent_runs(workspace_id,client_id,website_id,opportunity_id,trigger_type,agent_key,agent_version,permission_level,status,timeout_seconds,provider,model,prompt_template_version,output_schema_version,idempotency_key,completed_at) values($1,$2,$3,$4,'USER','existing-page-optimization','test','PREPARE','FAILED',60,'vercel-ai-gateway','synthetic','test','test',$5,now())",[b,opp.client_id,opp.website_id,opp.id,randomUUID()]);
    const before=(await client.query("select count(*)::int n from agent_runs where workspace_id=$1",[b])).rows[0].n;
    await expect(requestPrepareDraftForOpportunity(context,opp.id,database)).rejects.toMatchObject({code:"MANUAL_REVIEW"});
    expect((await client.query("select count(*)::int n from agent_runs where workspace_id=$1",[b])).rows[0].n).toBe(before);
  });

  async function clearImplementation() {
    expect((await client.query("select count(*)::int n from implementation_verification_records where monthly_cycle_id=$1", [cycleId])).rows[0].n).toBe(0);
    await client.query("delete from manual_implementation_records where monthly_cycle_id=$1", [cycleId]);
    await client.query("update monthly_cycle_work_items set completion_state='NOT_STARTED', status='SELECTED' where id=$1", [workId]);
  }
  async function row(table: string) { return (await client.query(`select * from ${table} where workspace_id=$1 ${table === "opportunities" ? "and id='80000000-0000-4000-8000-0000000000b1'" : ""} limit 1`, [b])).rows[0]; }

  it.each(["VERIFIED", "VERIFICATION_WARNING", "VERIFICATION_FAILED"] as const)("rejects %s without implementation", async status => {
    await clearImplementation();
    await expect(recordImplementationVerification(context, workId, { ...verification, status }, database)).rejects.toThrow("Record an implementation");
    expect((await row("opportunities")).status).toBe("READY");
    expect((await client.query("select count(*)::int n from implementation_verification_records")).rows[0].n).toBe(0);
  });
  it("approved draft state alone cannot be verified or consume fulfillment", async () => {
    await clearImplementation();
    await client.query("update monthly_cycle_work_items set completion_state='APPROVED_FOR_MANUAL_IMPLEMENTATION', approval_state='APPROVED' where id=$1", [workId]);
    await expect(recordImplementationVerification(context, workId, verification, database)).rejects.toThrow("approved draft");
    await closeMonthlyCycle(context, cycleId, database);
    expect((await row("monthly_cycles")).existing_page_optimizations_completed).toBe(0);
  });
  it("manual implementation then verification succeeds and closes only once", async () => {
    await clearImplementation();
    await recordManualImplementation(context, workId, manual, database);
    await recordManualImplementation(context, workId, manual, database);
    expect((await row("monthly_cycles")).manual_implementation_minutes).toBe(45);
    expect((await row("monthly_cycle_work_items")).completion_state).toBe("IMPLEMENTED_UNVERIFIED");
    await recordImplementationVerification(context, workId, verification, database);
    const first = await row("opportunities");
    await recordImplementationVerification(context, workId, verification, database);
    const repeated = await row("opportunities");
    expect(repeated.status).toBe("COMPLETED");
    expect(repeated.completed_at).toEqual(first.completed_at);
    expect((await row("monthly_cycles")).existing_page_optimizations_completed).toBe(1);
    expect((await row("monthly_cycles")).manual_implementation_minutes).toBe(45);
  });
  it("failed verification does not close or count successful fulfillment", async () => {
    await clearImplementation();
    await recordManualImplementation(context, workId, manual, database);
    await recordImplementationVerification(context, workId, { ...verification, status: "VERIFICATION_FAILED" }, database);
    expect((await row("opportunities")).status).toBe("READY");
    expect((await row("monthly_cycles")).existing_page_optimizations_completed).toBe(0);
    expect((await row("monthly_cycles")).manual_implementation_minutes).toBe(45);
  });
  it("new implementation requires fresh verification before the Opportunity is completed again", async () => {
    await clearImplementation();
    await recordManualImplementation(context, workId, manual, database);
    await recordImplementationVerification(context, workId, verification, database);
    await recordManualImplementation(context, workId, { ...manual, whatImplemented: "Follow-up implementation", manualMinutes: 15 }, database);
    expect((await row("opportunities")).status).toBe("IN_PROGRESS");
    expect((await row("monthly_cycle_work_items")).completion_state).toBe("IMPLEMENTED_UNVERIFIED");
    expect((await row("monthly_cycles")).manual_implementation_minutes).toBe(60);
    await recordImplementationVerification(context, workId, verification, database);
    expect((await row("opportunities")).status).toBe("COMPLETED");
    expect((await row("monthly_cycles")).existing_page_optimizations_completed).toBe(1);
  });
  it("a failed recheck reopens previously verified work without consuming successful fulfillment", async () => {
    await clearImplementation();
    await recordManualImplementation(context, workId, manual, database);
    await recordImplementationVerification(context, workId, verification, database);
    await recordImplementationVerification(context, workId, { ...verification, status: "VERIFICATION_FAILED" }, database);
    expect((await row("opportunities")).status).toBe("BLOCKED");
    expect((await row("monthly_cycles")).existing_page_optimizations_completed).toBe(0);
  });
  it("repeated finalization preserves the immutable snapshot and only finalized reports fulfill reporting", async () => {
    await client.query("update monthly_cycle_deliverables set deliverable_key='monthly_report'");
    const draft = await generateMonthlyReportDraft(context, cycleId, database);
    const first = await finalizeMonthlyReport(context, draft.id, database);
    const second = await finalizeMonthlyReport(context, draft.id, database);
    expect(second.snapshotHash).toBe(first.snapshotHash);
    expect(second.immutableSnapshot).toEqual(first.immutableSnapshot);
    expect(await row("monthly_cycle_deliverables")).toMatchObject({ status: "COMPLETE", completed_count: 1 });
  });
  it("cross-workspace server implementation and verification requests are rejected", async () => {
    const other = { ...context, workspaceId: a, userId: "rls-user-a" };
    await expect(recordManualImplementation(other, workId, manual, database)).rejects.toThrow("not found");
    await expect(recordImplementationVerification(other, workId, verification, database)).rejects.toThrow("not found");
  });
  it.each(["website_health", "search_console", "competitor_review", "ai_readiness_recheck", "observed_ai_visibility", "monthly_report", "existing_page_optimization", "major_content_asset"])("rejects manual completion for %s", async key => {
    await client.query("update monthly_cycle_deliverables set deliverable_key=$1 where monthly_cycle_id=$2", [key, cycleId]);
    const item = await row("monthly_cycle_deliverables");
    await expect(updateMonthlyDeliverableStatus(context, item.id, { status: "COMPLETE", completedCount: 1, completionEvidence: "Force complete" }, database)).rejects.toThrow("source evidence");
  });
  it("recomputes a forged 4/4 Website Health before close", async () => {
    await client.query("update monthly_cycle_deliverables set deliverable_key='website_health', target_count=4, completed_count=4, status='COMPLETE', completed_at=now()");
    const result = await closeMonthlyCycle(context, cycleId, database);
    expect(result).toHaveProperty("error", "Cycle has unfinished or blocked deliverables.");
    const item = await row("monthly_cycle_deliverables");
    expect(item.status).not.toBe("COMPLETE");
    expect(item.completed_count).toBeLessThan(4);
    expect((await row("monthly_cycles")).status).toBe("REVIEW_REQUIRED");
  });
  it.each([["observed_ai_visibility", "UNAVAILABLE"], ["search_console", "BLOCKED"], ["monthly_report", "NOT_STARTED"]])("repairs stale %s COMPLETE", async (key, status) => {
    await client.query("update monthly_cycle_deliverables set deliverable_key=$1, completed_count=4, status='COMPLETE', completed_at=now()", [key]);
    await closeMonthlyCycle(context, cycleId, database);
    expect(await row("monthly_cycle_deliverables")).toMatchObject({ status, completed_count: 0, completed_at: null });
  });
  it.each([1, 4])("derives Website Health from %i actual runs", async count => {
    await client.query("update monthly_cycle_deliverables set deliverable_key='website_health', target_count=4, completed_count=4, status='COMPLETE', completed_at=now()");
    await client.query("update monitoring_runs set completed_at='2026-09-10' where workspace_id=$1", [b]);
    const sample = await row("monitoring_runs");
    for (let index = 1; index < count; index++) {
      await client.query("insert into monitoring_runs select * from jsonb_populate_record(null::monitoring_runs,$1::jsonb)", [JSON.stringify({ ...sample, id: randomUUID(), idempotency_key: randomUUID() })]);
    }
    await closeMonthlyCycle(context, cycleId, database);
    expect(await row("monthly_cycle_deliverables")).toMatchObject({ completed_count: count, status: count === 4 ? "COMPLETE" : "IN_PROGRESS" });
  });
  it.each(["ESSENTIALS", "GROWTH", "PRO"])("scheduled %s creates one retry-safe cycle", async plan => {
    await client.query("update clients set service_plan=$1, status='ACTIVE' where id='20000000-0000-4000-8000-0000000000b1'", [plan]);
    const args = { year: 2026, month: 10 };
    const first = await createScheduledMonthlyCycle(b, "20000000-0000-4000-8000-0000000000b1", args, database);
    const second = await createScheduledMonthlyCycle(b, "20000000-0000-4000-8000-0000000000b1", args, database);
    expect(first.created).toBe(true);
    expect(second.monthlyCycleId).toBe(first.monthlyCycleId);
    expect(second.created).toBe(false);
  });
  it.each(["website_health", "search_console", "observed_ai_visibility"])("preserves WAIVED for %s while removing false performed counts", async key => {
    await client.query("update monthly_cycle_deliverables set deliverable_key=$1, status='WAIVED', completed_count=4, waived_at=now(), waived_by_user_id='rls-user-b', waiver_reason='Client deferred obligation'", [key]);
    await closeMonthlyCycle(context, cycleId, database);
    expect(await row("monthly_cycle_deliverables")).toMatchObject({ status: "WAIVED", completed_count: 0, waiver_reason: "Client deferred obligation" });
  });
  it("refuses undocumented waiver and not-applicable bypasses", async () => {
    for (const status of ["WAIVED", "NOT_APPLICABLE"]) {
      await client.query("update monthly_cycle_deliverables set status=$1", [status]);
      expect(await closeMonthlyCycle(context, cycleId, database)).toHaveProperty("error");
    }
  });
  it("manual completion requires OWNER/ADMIN, evidence and actual count", async () => {
    await client.query("update monthly_cycle_deliverables set deliverable_key='quarterly_strategy', target_count=1, completed_count=0");
    const item = await row("monthly_cycle_deliverables");
    await expect(updateMonthlyDeliverableStatus({ ...context, role: "ANALYST" }, item.id, { status: "COMPLETE", completedCount: 1, completionEvidence: "Reviewed" }, database)).rejects.toThrow("not allowed");
    await expect(updateMonthlyDeliverableStatus(context, item.id, { status: "COMPLETE", completedCount: 1 }, database)).rejects.toThrow("explicit evidence");
    await expect(updateMonthlyDeliverableStatus(context, item.id, { status: "COMPLETE", completedCount: 0, completionEvidence: "Reviewed" }, database)).rejects.toThrow("actual target count");
    const saved = await updateMonthlyDeliverableStatus(context, item.id, { status: "COMPLETE", completedCount: 1, completionEvidence: "Strategy meeting notes" }, database);
    expect(saved.completedAt).toBeTruthy();
    expect(saved.completedByUserId).toBe(context.userId);
  });
  it.each(tables)("blocks cross-workspace SELECT INSERT UPDATE DELETE on %s", async table => {
    if (table === "implementation_verification_records") await recordImplementationVerification(context, workId, verification, database);
    const original = await row(table);
    expect(original).toBeTruthy();
    const copy = { ...original, id: randomUUID() };
    await client.query("select set_config('app.workspace_id', $1, true)", [a]);
    expect((await client.query(`select * from ${table} where id=$1`, [original.id])).rows).toHaveLength(0);
    expect((await client.query(`update ${table} set id=id where id=$1`, [original.id])).rowCount).toBe(0);
    expect((await client.query(`delete from ${table} where id=$1`, [original.id])).rowCount).toBe(0);
    await client.query("savepoint reject_insert");
    await expect(client.query(`insert into ${table} select * from jsonb_populate_record(null::${table}, $1::jsonb)`, [JSON.stringify(copy)])).rejects.toMatchObject({ code: "42501" });
    await client.query("rollback to savepoint reject_insert");
    await client.query("savepoint reject_reference");
    // Valid tenant A ownership with tenant B relationships must fail composite FKs.
    copy.workspace_id = a;
    await expect(client.query(`insert into ${table} select * from jsonb_populate_record(null::${table}, $1::jsonb)`, [JSON.stringify(copy)])).rejects.toMatchObject({ code: "23503" });
    await client.query("rollback to savepoint reject_reference");
  });
  it("report builder uses recorded work states and does not count approval as implementation", async () => {
    await clearImplementation();
    const report = await generateMonthlyReportDraft(context, cycleId, database);
    expect(report.sections.workCompleted).toMatchObject({ items: [] });
    await recordManualImplementation(context, workId, manual, database);
    const implemented = await generateMonthlyReportDraft(context, cycleId, database);
    expect(JSON.stringify(implemented.sections.workCompleted)).toContain("IMPLEMENTED_UNVERIFIED");
  });
  it("cycle creation retries do not duplicate cycles or deliverables", async () => {
    const input = { clientId: "20000000-0000-4000-8000-0000000000b1", year: 2026, month: 10 };
    const first = await createMonthlyCycle(context, input, database);
    const second = await createMonthlyCycle(context, input, database);
    expect(second.id).toBe(first.id);
    const duplicates = await client.query("select deliverable_key from monthly_cycle_deliverables where monthly_cycle_id=$1 group by deliverable_key having count(*)>1", [first.id]);
    expect(duplicates.rows).toHaveLength(0);
  });
  it.each(["NONE", "AUDIT_ONLY", "LAUNCH"])("scheduled %s creates no recurring cycle", async plan => {
    await client.query("update clients set service_plan=$1 where id='20000000-0000-4000-8000-0000000000b1'", [plan]);
    const result = await createScheduledMonthlyCycle(b, "20000000-0000-4000-8000-0000000000b1", { year: 2026, month: 10 }, database);
    expect(result).toMatchObject({ monthlyCycleId: null, created: false, skipped: true });
  });
  it("cron bootstrap has locked search path, minimal output and no PUBLIC execute", async () => {
    const fn = (await client.query("select prosecdef, proconfig, pg_get_function_result(oid) result, proacl::text acl from pg_proc where proname='bootstrap_due_monthly_cycle_clients'")).rows[0];
    expect(fn.prosecdef).toBe(true);
    expect(fn.proconfig).toContain("search_path=public");
    expect(fn.result).toBe("TABLE(workspace_id uuid, client_id uuid, cycle_year integer, cycle_month integer)");
    expect(fn.acl).not.toMatch(/[{,]=X/);
    expect(readFileSync("src/app/api/cron/monthly-cycles/route.ts", "utf8")).toContain("!serverEnv.CRON_SECRET");
  });
  it.each([
    ["seo.content_targeting", "content_targeting", "CONTENT_BRIEF"],
    ["seo.internal_links", "internal_linking", "INTERNAL_LINK_PROPOSAL"],
    ["ai.structured_data", "structured_data", "SCHEMA_PROPOSAL"],
  ])("Phase 6 persists %s through approval and new version without fulfillment", async (check, family, artifactType) => {
    await clearImplementation();
    const opportunityId = "80000000-0000-4000-8000-0000000000b1";
    // Preserve the fixture's composite check-result FK; family is trusted DB routing state.
    await client.query("update opportunities set normalized_remediation_family=$1 where id=$2", [family, opportunityId]);
    await client.query("update monthly_cycle_work_items set entitlement_type='major_content_assets_completed' where id=$1", [workId]);
    await createBusinessFact(context, "20000000-0000-4000-8000-0000000000b1", { factType: "business_name", value: "Example Company", sourceReference: "QA human review", verificationStatus: "VERIFIED", sensitivity: "PUBLIC" }, database);
    const first = await requestPrepareDraftForOpportunity(context, opportunityId, database);
    const linked = (await client.query("select r.agent_definition_id, r.agent_version, r.budget_snapshot, d.version, d.budget_limits from agent_runs r join agent_definitions d on d.id=r.agent_definition_id where r.id=$1", [first.agentRunId])).rows[0];
    expect(linked.agent_definition_id).toBeTruthy();
    expect(linked.agent_version).toBe(linked.version);
    const { capturedAt: _capturedAt, ...limits } = linked.budget_snapshot;
    expect(_capturedAt).toBeTruthy();
    expect(limits).toEqual(linked.budget_limits);
    const repeated = await requestPrepareDraftForOpportunity(context, opportunityId, database);
    expect(repeated.agentRunId).toBe(first.agentRunId);
    const result = await executePrepareDraftAgentRun(context, first.agentRunId, database);
    expect(result.artifact, JSON.stringify((await client.query("select status,error_summary from agent_runs where id=$1", [first.agentRunId])).rows)).not.toBeNull();
    expect(result.artifact!.artifactType).toBe(artifactType);
    const retry = await executePrepareDraftAgentRun(context, first.agentRunId, database);
    expect(retry.artifact!.id).toBe(result.artifact!.id);
    expect((await client.query("select count(*)::int n from activity_events where action='monthly_cycle.draft_prepared' and summary->>'agentRunId'=$1", [first.agentRunId])).rows[0].n).toBe(1);
    expect(result.artifact!.status).toBe("AWAITING_APPROVAL");
    await closeMonthlyCycle(context, cycleId, database);
    expect((await row("monthly_cycles")).major_content_assets_completed).toBe(0);
    await decideApprovalRequest(context, result.approval!.id, { decision: "APPROVED_UNCHANGED", comments: "Reviewed draft only" }, database);
    const second = await requestPrepareDraftForOpportunity(context, opportunityId, database);
    const revision = await executePrepareDraftAgentRun(context, second.agentRunId, database);
    expect(revision.artifact!.artifactVersion).toBe(result.artifact!.artifactVersion + 1);
    expect(revision.approval!.status).toBe("PENDING");
    expect((await getDraftArtifact(context, result.artifact!.id, database))!.artifact.status).toBe("APPROVED");
    await closeMonthlyCycle(context, cycleId, database);
    expect((await row("monthly_cycles")).major_content_assets_completed).toBe(0);
    expect((await row("monthly_cycles")).manual_implementation_minutes).toBe(0);
    const other = { ...context, workspaceId: a, userId: "rls-user-a" };
    expect(await getDraftArtifact(other, result.artifact!.id, database)).toBeNull();
    await expect(requestPrepareDraftForOpportunity(other, opportunityId, database)).rejects.toThrow("not found");
    await client.query("select set_config('app.workspace_id',$1,true)", [a]);
    await client.query("savepoint phase6_bad_link");
    await expect(client.query("update approval_requests set target_artifact_id=$1 where workspace_id=$2", [result.artifact!.id, a])).rejects.toMatchObject({ code: "23503" });
    await client.query("rollback to savepoint phase6_bad_link");
  });
  it("Phase 6 nomination rejects cross-tenant website and missing verified fact", async () => {
    await expect(nominateContentOpportunity(context, { websiteId: "30000000-0000-4000-8000-0000000000a1", title: "A topic", rationale: "Human requested an educational resource" }, database)).rejects.toThrow("Website was not found");
    await client.query("delete from business_facts where workspace_id=$1 and fact_type='service'", [b]);
    await expect(nominateContentOpportunity(context, { websiteId: "30000000-0000-4000-8000-0000000000b1", title: "A topic", rationale: "Human requested an educational resource" }, database)).rejects.toThrow("PUBLIC VERIFIED service fact");
  });
  it("every enabled runtime definition exactly matches the persisted catalog and historical versions remain", async () => {
    const definitions = await drizzle({ client, schema }).select().from(schema.agentDefinitions);
    for (const agent of runtimeDefinitions.filter(a => a.enabled)) {
      expect(requirePersistedAgentDefinition(agent, definitions.find(d => d.key === agent.key && d.version === agent.version)).id).toBeTruthy();
    }
    expect(definitions.filter(d => d.enabled).map(d => `${d.key}@${d.version}`).sort()).toEqual(runtimeDefinitions.filter(d => d.enabled).map(d => `${d.key}@${d.version}`).sort());
    for (const key of ["content-opportunity", "internal-linking", "schema"]) {
      expect(definitions.find(d => d.key === key && d.version === `${key}-v1.0`)).toMatchObject({ enabled: false, outputSchemaVersion: "prepare-output-v1.0" });
    }
  });
  it("missing persisted version fails closed before inserting a run", async () => {
    await client.query("update opportunities set normalized_remediation_family='structured_data' where id='80000000-0000-4000-8000-0000000000b1'");
    await client.query("update agent_definitions set version='schema-test-missing' where key='schema' and version='schema-v1.1'");
    const before = (await client.query("select count(*)::int n from agent_runs")).rows[0].n;
    await expect(requestPrepareDraftForOpportunity(context, "80000000-0000-4000-8000-0000000000b1", database)).rejects.toThrow("configuration mismatch");
    expect((await client.query("select count(*)::int n from agent_runs")).rows[0].n).toBe(before);
  });
  it.each(["WARNING", "PASS"] as const)("schema nomination preserves real %s audit evidence and rejects passing checks", async status => {
    const pinned = drizzle({ client, schema });
    const [existingCheck] = await pinned.select().from(schema.auditCheckResults).limit(1);
    await pinned.insert(schema.auditCheckResults).values({ ...existingCheck, id: randomUUID(), checkKey: "ai.structured_data", category: "aiReadiness", status, severity: "LOW" });
    const input = { websiteId: "30000000-0000-4000-8000-0000000000b1", kind: "SCHEMA", title: "Review schema finding", rationale: "Human review of the existing audit schema finding" };
    if (status === "PASS") {
      await expect(nominateContentOpportunity(context, input, database)).rejects.toThrow("existing audit warning or failure");
      return;
    }
    const created = await nominateContentOpportunity(context, input, database);
    expect(created).toMatchObject({ sourceResultStatus: "WARNING", sourceSeverity: "LOW", normalizedRemediationFamily: "structured_data" });
    expect((await nominateContentOpportunity(context, input, database)).id).toBe(created.id);
    await expect(nominateContentOpportunity({ ...context, actorType: "SYSTEM", userId: undefined }, input, database)).rejects.toThrow("A human must nominate");
    await expect(nominateContentOpportunity(context, { ...input, websiteId: "30000000-0000-4000-8000-0000000000a1" }, database)).rejects.toThrow("Website was not found");
    await expect(nominateContentOpportunity(context, { ...input, kind: "EXECUTE" }, database)).rejects.toThrow("Unsupported nomination type");
  });

  async function approvedPackage(title = "Expected title", version = 20) {
    const pinned = drizzle({ client, schema });
    const [old] = await pinned.select().from(schema.draftArtifacts).limit(1);
    const [artifact] = await pinned.insert(schema.draftArtifacts).values({ ...old, id: randomUUID(), artifactVersion: version, status: "APPROVED", artifactType: "EXISTING_PAGE_OPTIMIZATION_PROPOSAL", opportunityId: "80000000-0000-4000-8000-0000000000b1", clientId: "20000000-0000-4000-8000-0000000000b1", websiteId: "30000000-0000-4000-8000-0000000000b1", contentHash: `approved-${title}-${version}`, structuredProposal: { proposals: [{ field: "title", currentValue: "Captured old title", proposedValue: title, requiresHumanInput: false }] } }).returning();
    const [oldApproval] = await pinned.select().from(schema.approvalRequests).limit(1);
    await pinned.insert(schema.approvalRequests).values({ ...oldApproval, id: randomUUID(), targetArtifactId: artifact.id, targetArtifactVersion: artifact.artifactVersion, status: "APPROVED" });
    const pkg = await createImplementationPackage(context, artifact.id, database);
    return { artifact, pkg };
  }
  const publicResponse = (title: string) => ({ lookupHost: async () => ["93.184.216.34"], requestImpl: async () => ({ status: 200, headers: { "content-type": "text/html" }, bodyText: `<title>${title}</title>` }) });
  it("Phase 7 binds implementation to the selected historical approved version, never latest", async () => {
    await clearImplementation();
    const old = await approvedPackage("Old approved", 20);
    const newer = await approvedPackage("New approved", 21);
    const implementation = await recordManualImplementation(context, workId, { ...manual, implementationPackageId: old.pkg.id }, database);
    expect(implementation).toMatchObject({ artifactId: old.artifact.id, artifactVersion: 20, implementationPackageId: old.pkg.id });
    expect(implementation.artifactId).not.toBe(newer.artifact.id);
    expect((await getImplementationPackage(context, old.pkg.id, database))!.snapshot.artifactVersion).toBe(20);
    const plain = await recordManualImplementation(context, workId, { ...manual, whatImplemented: "Manual work without a version selection" }, database);
    expect(plain.artifactId).toBeNull();
    await expect(requestImplementationVerification(context, plain.id, database)).rejects.toThrow("Select an approved implementation package");
  });
  it("Phase 7 requires exact approval and immutable package/history records", async () => {
    const { artifact, pkg } = await approvedPackage();
    expect((await createImplementationPackage(context, artifact.id, database)).id).toBe(pkg.id);
    await client.query("update draft_artifacts set status='AWAITING_APPROVAL' where id=$1", [artifact.id]);
    await expect(createImplementationPackage(context, artifact.id, database)).rejects.toThrow("approved artifact version");
    await expect(recordManualImplementation(context, workId, { ...manual, implementationPackageId: pkg.id }, database)).rejects.toThrow("not approved");
    await client.query("savepoint immutable_package");
    await expect(client.query("update implementation_packages set snapshot='{}' where id=$1", [pkg.id])).rejects.toMatchObject({ code: "23514" });
    await client.query("rollback to savepoint immutable_package");
    await client.query("savepoint retained_package");
    await expect(client.query("delete from implementation_packages where id=$1", [pkg.id])).rejects.toMatchObject({ code: "23514" });
    await client.query("rollback to savepoint retained_package");
    expect(await getImplementationPackage(context, pkg.id, database)).not.toBeNull();
  });
  it("Phase 7 failure, correction, retry, history and accounting remain consistent", async () => {
    await clearImplementation();
    const { pkg } = await approvedPackage();
    const implementation = await recordManualImplementation(context, workId, { ...manual, implementationPackageId: pkg.id }, database);
    const first = await requestImplementationVerification(context, implementation.id, database);
    expect((await requestImplementationVerification(context, implementation.id, database)).agentRunId).toBe(first.agentRunId);
    expect(await closeMonthlyCycle(context, cycleId, database)).toMatchObject({ error: "Cycle has a queued or running implementation verification." });
    const failed = await executeImplementationVerification(context, first.agentRunId, database, publicResponse("Wrong title"));
    expect(failed.structuredOutput?.result).toBe("VERIFICATION_FAILED");
    expect((await row("opportunities")).status).not.toBe("COMPLETED");
    expect((await row("monthly_cycles")).existing_page_optimizations_completed).toBe(0);
    const second = await requestImplementationVerification(context, implementation.id, database);
    const passed = await executeImplementationVerification(context, second.agentRunId, database, publicResponse("Expected title"));
    expect(passed.structuredOutput?.result).toBe("VERIFIED");
    expect(passed.agentDefinitionId).toBeTruthy(); expect(passed.permissionLevel).toBe("OBSERVE"); expect(passed.actualModelCalls).toBe(0);
    expect((await row("opportunities")).status).toBe("COMPLETED");
    const completedAt = (await row("opportunities")).completed_at;
    await executeImplementationVerification(context, second.agentRunId, database, publicResponse("Expected title"));
    expect((await row("opportunities")).completed_at).toEqual(completedAt);
    expect((await row("monthly_cycles")).existing_page_optimizations_completed).toBe(1);
    expect((await row("monthly_cycles")).manual_implementation_minutes).toBe(45);
    const history = (await client.query("select status,method_kind from implementation_verification_records where implementation_record_id=$1 order by verified_at", [implementation.id])).rows;
    expect(history.map(h => h.status)).toEqual(["VERIFICATION_FAILED", "VERIFIED"]);
    expect(history.every(h => h.method_kind === "DETERMINISTIC")).toBe(true);
    expect((await getVerificationDetail(context, String(passed.outputRef), database))!.evidence.observation).toBeTruthy();
    expect((await getVerificationDashboard(context, database)).verified).toBeGreaterThan(0);
    await client.query("savepoint immutable_attempt");
    await expect(client.query("update implementation_verification_records set evidence='{}' where id=$1", [passed.outputRef])).rejects.toMatchObject({ code: "23514" });
    await client.query("rollback to savepoint immutable_attempt");
    for (const attempt of [failed.outputRef, passed.outputRef]) {
      await client.query("savepoint retained_attempt");
      await expect(client.query("delete from implementation_verification_records where id=$1", [attempt])).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback to savepoint retained_attempt");
    }
    expect((await client.query("select status from implementation_verification_records where implementation_record_id=$1 order by verified_at", [implementation.id])).rows.map(r => r.status)).toEqual(["VERIFICATION_FAILED", "VERIFIED"]);
  });
  it("Phase 7 unavailable is preserved and does not consume successful fulfillment", async () => {
    await clearImplementation(); const { pkg } = await approvedPackage();
    const implementation = await recordManualImplementation(context, workId, { ...manual, implementationPackageId: pkg.id }, database);
    const run = await requestImplementationVerification(context, implementation.id, database);
    const result = await executeImplementationVerification(context, run.agentRunId, database, { lookupHost: async () => ["127.0.0.1"] });
    expect(result.structuredOutput?.result).toBe("UNAVAILABLE");
    expect((await row("monthly_cycle_work_items")).completion_state).toBe("UNAVAILABLE");
    expect((await row("monthly_cycles")).existing_page_optimizations_completed).toBe(0);
    expect((await row("opportunities")).status).not.toBe("COMPLETED");
  });
  it("Phase 7 verification keeps sensitive roles and all run/evidence reads tenant-scoped", async () => {
    await clearImplementation(); const { pkg } = await approvedPackage();
    const implementation = await recordManualImplementation(context, workId, { ...manual, implementationPackageId: pkg.id }, database);
    await expect(requestImplementationVerification({ ...context, role: "ANALYST" }, implementation.id, database)).rejects.toThrow();
    const other = { ...context, workspaceId: a, userId: "rls-user-a" };
    await expect(requestImplementationVerification(other, implementation.id, database)).rejects.toThrow("Select an approved implementation package");
    const run = await requestImplementationVerification(context, implementation.id, database);
    await expect(executeImplementationVerification(other, run.agentRunId, database, publicResponse("Expected title"))).rejects.toThrow("not found");
    const result = await executeImplementationVerification(context, run.agentRunId, database, publicResponse("Expected title"));
    expect(await getVerificationDetail(other, String(result.outputRef), database)).toBeNull();
  });
  it("Phase 7 warning retains the reviewed Phase 5 implementation credit rule without closing work", async () => {
    await clearImplementation(); const { pkg } = await approvedPackage();
    const implementation = await recordManualImplementation(context, workId, { ...manual, implementationPackageId: pkg.id }, database);
    const run = await requestImplementationVerification(context, implementation.id, database);
    const result = await executeImplementationVerification(context, run.agentRunId, database, publicResponse("Expected title</title><title>Other"));
    expect(result.structuredOutput?.result).toBe("VERIFICATION_WARNING");
    expect((await row("monthly_cycles")).existing_page_optimizations_completed).toBe(1);
    expect((await row("opportunities")).status).not.toBe("COMPLETED");
  });
  it("Phase 7 a stale queued attempt remains history and cannot close a newer implementation", async () => {
    await clearImplementation(); const old = await approvedPackage();
    const implementation = await recordManualImplementation(context, workId, { ...manual, implementationPackageId: old.pkg.id }, database);
    const run = await requestImplementationVerification(context, implementation.id, database);
    const next = await approvedPackage("New expected title", 21);
    await recordManualImplementation(context, workId, { ...manual, whatImplemented: "New version implementation", implementationPackageId: next.pkg.id }, database);
    const result = await executeImplementationVerification(context, run.agentRunId, database, publicResponse("Expected title"));
    expect((await getVerificationDetail(context, String(result.outputRef), database))!.evidence.appliesToCurrent).toBe(false);
    expect((await row("monthly_cycle_work_items")).completion_state).toBe("IMPLEMENTED_UNVERIFIED");
    expect((await row("opportunities")).status).not.toBe("COMPLETED");
    await expect(requestImplementationVerification(context, implementation.id, database)).rejects.toThrow("current implementation");
  });
  it("Phase 7 package RLS blocks all cross-tenant operations and composite references", async () => {
    const { artifact, pkg } = await approvedPackage();
    const implementation = await recordManualImplementation(context, workId, { ...manual, implementationPackageId: pkg.id }, database);
    const implementationRow = (await client.query("select * from manual_implementation_records where id=$1", [implementation.id])).rows[0];
    const other = { ...context, workspaceId: a, userId: "rls-user-a" };
    expect(await getImplementationPackage(other, pkg.id, database)).toBeNull();
    await expect(createImplementationPackage(other, artifact.id, database)).rejects.toThrow("approved artifact version");
    await client.query("select set_config('app.workspace_id',$1,true)", [a]);
    expect((await client.query("select * from implementation_packages where id=$1", [pkg.id])).rowCount).toBe(0);
    expect((await client.query("update implementation_packages set content_hash='forged' where id=$1", [pkg.id])).rowCount).toBe(0);
    expect((await client.query("delete from implementation_packages where id=$1", [pkg.id])).rowCount).toBe(0);
    await client.query("savepoint bad_package_insert");
    await expect(client.query("insert into implementation_packages select * from json_populate_record(null::implementation_packages,$1::json)", [JSON.stringify({ id: randomUUID(), workspace_id: b, client_id: pkg.clientId, website_id: pkg.websiteId, opportunity_id: pkg.opportunityId, artifact_id: pkg.artifactId, artifact_version: pkg.artifactVersion, approval_id: pkg.approvalId, snapshot: pkg.snapshot, content_hash: pkg.contentHash, created_at: new Date() })])).rejects.toBeTruthy();
    await client.query("rollback to savepoint bad_package_insert");
    await client.query("savepoint bad_package_fk");
    await expect(client.query("insert into manual_implementation_records select * from json_populate_record(null::manual_implementation_records,$1::json)", [JSON.stringify({ ...implementationRow, id: randomUUID(), workspace_id: a })])).rejects.toMatchObject({ code: "23503" });
    await client.query("rollback to savepoint bad_package_fk");
    expect((await client.query("select pg_get_constraintdef(oid) definition from pg_constraint where conname='manual_implementation_package_binding_fk'")).rows[0].definition).toContain("FOREIGN KEY (workspace_id, implementation_package_id, artifact_id, artifact_version)");
    const security = (await client.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='public.implementation_packages'::regclass")).rows[0];
    expect(security).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });
  it("Phase 7 retry retires expired older attempts without claiming successful evidence", async () => {
    await clearImplementation(); const { pkg } = await approvedPackage();
    const old = await recordManualImplementation(context, workId, { ...manual, implementationPackageId: pkg.id }, database);
    const expired = await requestImplementationVerification(context, old.id, database);
    await client.query("update agent_runs set deadline_at=now()-interval '1 second' where id=$1", [expired.agentRunId]);
    const current = await recordManualImplementation(context, workId, { ...manual, whatImplemented: "Corrected implementation", implementationPackageId: pkg.id }, database);
    const retry = await requestImplementationVerification(context, current.id, database);
    expect((await client.query("select status from agent_runs where id=$1", [expired.agentRunId])).rows[0].status).toBe("TIMED_OUT");
    expect((await client.query("select count(*)::int n from implementation_verification_records where agent_run_id=$1", [expired.agentRunId])).rows[0].n).toBe(0);
    const result = await executeImplementationVerification(context, retry.agentRunId, database, publicResponse("Expected title"));
    expect(result.structuredOutput?.result).toBe("VERIFIED");
  });

  const qaEnv = { APP_ENV: "qa", BETTER_AUTH_URL: "https://optiq-qa.vercel.app", QA_EXECUTE_ENABLED: true };
  async function qaSetup(faultMode = "NONE") {
    const fixtureId = randomUUID();
    await client.query("update websites set canonical_url=$1 where id=$2", [fixtureUrl(b, fixtureId), "30000000-0000-4000-8000-0000000000b1"]);
    await client.query("insert into workspace_memberships(workspace_id,user_id,role,status) values($1,$2,'OWNER','ACTIVE') on conflict(workspace_id,user_id) do update set role='OWNER',status='ACTIVE'", [b,context.userId]);
    await client.query("insert into qa_execution_fixtures(id,workspace_id,client_id,website_id,fault_mode,created_by_user_id) values($1,$2,$3,$4,$5,$6)",[fixtureId,b,"20000000-0000-4000-8000-0000000000b1","30000000-0000-4000-8000-0000000000b1",faultMode,context.userId]);
    await setQaExecutionFlag(context,QA_WORKSPACE_FLAG,true,database,qaEnv); await setQaExecutionFlag(context,QA_ACTION_FLAG,true,database,qaEnv);
    const {pkg,artifact}=await approvedPackage("Approved QA title");
    const approval=await requestQaExecutionApproval(context,pkg.id,database,qaEnv);
    const fetchOptions={lookupHost:async()=>["93.184.216.34"],requestImpl:async()=>{
      const f=(await client.query("select title,description,fault_mode,last_operation from qa_execution_fixtures where id=$1",[fixtureId])).rows[0];
      return {status:200,headers:{"content-type":"text/html"},bodyText:renderQaFixture({...f,faultMode:f.fault_mode,lastOperation:f.last_operation})};
    }};
    return {pkg,artifact,fixtureId,approval,fetchOptions};
  }
  async function queuedQa(faultMode="NONE") {
    const setup=await qaSetup(faultMode); await decideQaExecutionApproval(context,setup.approval.id,"APPROVED",database,qaEnv);
    const record=await requestQaExecution(context,setup.approval.id,database,qaEnv); return {...setup,record};
  }
  it("Phase 8 separate approval is mandatory; analyst and cross-tenant requests fail",async()=>{
    const q=await qaSetup();
    await expect(requestQaExecution(context,q.approval.id,database,qaEnv)).rejects.toThrow("Separate approved execution approval");
    await expect(decideQaExecutionApproval({...context,role:"ANALYST"},q.approval.id,"APPROVED",database,qaEnv)).rejects.toThrow("not allowed");
    await expect(requestQaExecution({...context,role:"ANALYST"},q.approval.id,database,qaEnv)).rejects.toThrow("not allowed");
    await expect(requestQaExecutionApproval({...context,workspaceId:a,userId:"rls-user-a"},q.pkg.id,database,qaEnv)).rejects.toThrow("not found");
    expect((await requestQaExecutionApproval(context,q.pkg.id,database,qaEnv)).id).toBe(q.approval.id);
  });
  it("Phase 8 exact action applies once, independently verifies and preserves terminal history",async()=>{
    const q=await queuedQa(); const result=await processQaExecution(context,q.record.id,database,qaEnv,q.fetchOptions);
    expect(result.status).toBe("VERIFIED"); expect(result.verificationStatus).toBe("VERIFIED");
    expect((await requestQaExecution(context,q.approval.id,database,qaEnv)).id).toBe(q.record.id);
    expect((await processQaExecution(context,q.record.id,database,qaEnv,q.fetchOptions)).id).toBe(q.record.id);
    expect((await client.query("select revision,title from qa_execution_fixtures where id=$1",[q.fixtureId])).rows[0]).toEqual({revision:2,title:"Approved QA title"});
    const runs=(await client.query("select permission_level,agent_definition_id from agent_runs where id=any($1)",[[result.agentRunId,result.verificationRunId]])).rows;
    expect(runs.map(r=>r.permission_level).sort()).toEqual(["EXECUTE","OBSERVE"]);expect(runs.every(r=>r.agent_definition_id)).toBe(true);
    for(const query of ["update execution_records set status='FAILED' where id=$1","delete from execution_records where id=$1"]) {
      await client.query("savepoint retained_execution");await expect(client.query(query,[q.record.id])).rejects.toMatchObject({code:"23514"});await client.query("rollback to savepoint retained_execution");
    }
    expect((await row("monthly_cycles")).existing_page_optimizations_completed).toBe(0);
  });
  it("Phase 8 deterministic failure rolls back and independently verifies; original failure remains",async()=>{
    const q=await queuedQa("TITLE_MISMATCH"); const result=await processQaExecution(context,q.record.id,database,qaEnv,q.fetchOptions);
    expect(result.status).toBe("FAILED");expect(result.verificationStatus).toBe("VERIFICATION_FAILED");
    const detail=await getQaExecutionDetail(context,result.id,database);expect(detail!.rollbacks).toHaveLength(1);expect(detail!.rollbacks[0]).toMatchObject({status:"ROLLED_BACK",verificationStatus:"VERIFIED"});
    await processQaExecution(context,q.record.id,database,qaEnv,q.fetchOptions);
    expect((await client.query("select revision,title from qa_execution_fixtures where id=$1",[q.fixtureId])).rows[0]).toEqual({revision:3,title:"Home"});
    expect((await getQaExecutionDetail(context,result.id,database))!.record.status).toBe("FAILED");
  });
  it("Phase 10 rollback admission respects workspace pause and workflow ceiling",async()=>{
    const q=await queuedQa();await processQaExecution(context,q.record.id,database,qaEnv,q.fetchOptions);
    await setAutomationPause(context,{scope:"WORKSPACE",category:"execution",paused:true,reason:"Block rollback material work"},database);
    await expect(requestQaRollback(context,q.record.id,false,database,qaEnv)).rejects.toMatchObject({code:"PAUSED"});
    await setAutomationPause(context,{scope:"WORKSPACE",category:"execution",paused:false,reason:"Resume after inspection"},database);
    await setWorkspaceBudgets(context,{monthlyCostUsd:"0",activeWorkflowLimit:0,aiCallLimit:100,visibilityCallLimit:100,crawlConcurrency:2},"Stop new workflows",database);
    await expect(requestQaRollback(context,q.record.id,false,database,qaEnv)).rejects.toMatchObject({code:"BUDGET"});
    expect((await getQaExecutionDetail(context,q.record.id,database))!.rollbacks).toHaveLength(0);
  });
  it("Phase 8 manual rollback is authorized, idempotent and preserves the original success",async()=>{
    const q=await queuedQa();await processQaExecution(context,q.record.id,database,qaEnv,q.fetchOptions);
    await expect(requestQaRollback({...context,role:"ANALYST"},q.record.id,false,database,qaEnv)).rejects.toThrow("not allowed");
    const rollback=await requestQaRollback(context,q.record.id,false,database,qaEnv);
    expect((await requestQaRollback(context,q.record.id,false,database,qaEnv)).id).toBe(rollback.id);
    expect((await processQaExecution(context,rollback.id,database,qaEnv,q.fetchOptions)).status).toBe("ROLLED_BACK");
    expect((await getQaExecutionDetail(context,q.record.id,database))!.record.status).toBe("VERIFIED");
  });
  it.each(["global","workspace","action","production","local","role"])("Phase 8 %s stop is rechecked after queueing and performs no write",async gate=>{
    const q=await queuedQa();let env=qaEnv;
    if(gate==="global")env={...qaEnv,QA_EXECUTE_ENABLED:false};
    if(gate==="production"||gate==="local")env={...qaEnv,APP_ENV:gate};
    if(gate==="workspace"||gate==="action")await setQaExecutionFlag(context,gate==="workspace"?QA_WORKSPACE_FLAG:QA_ACTION_FLAG,false,database,qaEnv);
    if(gate==="role")await client.query("update workspace_memberships set role='ANALYST' where workspace_id=$1 and user_id=$2",[b,context.userId]);
    expect((await applyQaExecution(context,q.record.id,database,env)).status).toBe("BLOCKED");
    expect((await client.query("select revision from qa_execution_fixtures where id=$1",[q.fixtureId])).rows[0].revision).toBe(1);
  });
  it("Phase 8 stale precondition blocks after another approved action, and new artifacts cannot alter approval",async()=>{
    const q=await queuedQa(); const newer=await approvedPackage("New version title",21);
    const approval=await requestQaExecutionApproval(context,newer.pkg.id,database,qaEnv);await decideQaExecutionApproval(context,approval.id,"APPROVED",database,qaEnv);
    const later=await requestQaExecution(context,approval.id,database,qaEnv);
    await processQaExecution(context,q.record.id,database,qaEnv,q.fetchOptions);
    expect((await applyQaExecution(context,later.id,database,qaEnv)).status).toBe("BLOCKED");
    expect((await getQaExecutionDetail(context,q.record.id,database))!.record.actionSummary.artifactId).toBe(q.artifact.id);
    for(const query of ["update execution_approvals set action_hash='forged' where id=$1","delete from execution_approvals where id=$1"]) {
      await client.query("savepoint immutable_action");await expect(client.query(query,[q.approval.id])).rejects.toMatchObject({code:"23514"});await client.query("rollback to savepoint immutable_action");
    }
  });
  it("Phase 8 unavailable public fetch remains unavailable with no blind rollback",async()=>{
    const q=await queuedQa(); const result=await processQaExecution(context,q.record.id,database,qaEnv,{lookupHost:async()=>["127.0.0.1"]});
    expect(result.status).toBe("SUCCEEDED");expect(result.verificationStatus).toBe("UNAVAILABLE");expect((await getQaExecutionDetail(context,result.id,database))!.rollbacks).toHaveLength(0);
  });
  it("Phase 8 tenant RLS and composite references protect every new table",async()=>{
    const q=await queuedQa();
    const rows=(await Promise.all(["qa_execution_fixtures","execution_approvals","execution_records"].map(async table=>({table,row:(await client.query("select * from "+table+" where workspace_id=$1 limit 1",[b])).rows[0]}))));
    await client.query("select set_config('app.workspace_id',$1,true)",[a]);
    for(const {table,row:r} of rows){
      expect((await client.query("select * from "+table+" where id=$1",[r.id])).rowCount).toBe(0);
      expect((await client.query("update "+table+" set workspace_id=$1 where id=$2",[a,r.id])).rowCount).toBe(0);
      expect((await client.query("delete from "+table+" where id=$1",[r.id])).rowCount).toBe(0);
      for(const workspace of [b,a]){
        await client.query("savepoint bad_execution_tenant");
        await expect(client.query("insert into "+table+" select * from json_populate_record(null::"+table+",$1::json)",[JSON.stringify({...r,id:randomUUID(),workspace_id:workspace})])).rejects.toBeTruthy();
        await client.query("rollback to savepoint bad_execution_tenant");
      }
      expect((await client.query("select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass",["public."+table])).rows[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true});
    }
    expect(await getQaExecutionDetail({...context,workspaceId:a},q.record.id,database)).toBeNull();
  });

  it("Phase 8 fixture creation retains website domain uniqueness with normal validation",async()=>{
    const fixture=await createQaExecutionFixture(context,"NONE",database,qaEnv);
    expect(fixture.faultMode).toBe("NONE");
    await expect(createQaExecutionFixture(context,"TITLE_MISMATCH",database,qaEnv)).rejects.toThrow("one-website-per-domain");
    expect((await client.query("select count(*)::int n from qa_execution_fixtures where workspace_id=$1",[b])).rows[0].n).toBe(1);
  });
  it("Phase 8 concurrent request and workflow retries commit exactly one mutation",async()=>{
    const q=await qaSetup(); await decideQaExecutionApproval(context,q.approval.id,"APPROVED",database,qaEnv);
    // Only the disposable database: committed fixtures are retained for this real
    // multi-connection proof, and removed only by the next guarded schema reset.
    await client.query("commit");
    const concurrentDb=drizzle({client:pool,schema});
    const requests=await Promise.all([requestQaExecution(context,q.approval.id,concurrentDb,qaEnv),requestQaExecution(context,q.approval.id,concurrentDb,qaEnv)]);
    expect(requests[0].id).toBe(requests[1].id);
    const outcomes=await Promise.all([applyQaExecution(context,requests[0].id,concurrentDb,qaEnv),applyQaExecution(context,requests[1].id,concurrentDb,qaEnv)]);
    expect(outcomes.every(r=>r.status==="SUCCEEDED")).toBe(true);
    await client.query("begin");await client.query("select set_config('app.workspace_id',$1,true)",[b]);
    expect((await client.query("select revision from qa_execution_fixtures where id=$1",[q.fixtureId])).rows[0].revision).toBe(2);
    expect((await client.query("select count(*)::int n from execution_records where approval_id=$1",[q.approval.id])).rows[0].n).toBe(1);
    expect((await client.query("select count(*)::int n from agent_tool_calls where agent_run_id=$1",[requests[0].agentRunId])).rows[0].n).toBe(1);
  });

});
