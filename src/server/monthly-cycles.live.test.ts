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

  async function clearImplementation() {
    await client.query("delete from implementation_verification_records where monthly_cycle_id=$1", [cycleId]);
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
});
