import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/reports/[kind]/[reportId]/download/route";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import { evaluatePhase1Checks } from "@/domain/audits/execution";
import { buildMonthlyEntitlementSnapshot } from "@/domain/monthly-cycles/entitlements";
import { buildMonthlyReportDraft } from "@/domain/monthly-cycles/reports";
import type { WorkspaceContext } from "@/domain/tenancy/context";
import { closeStaleAuditRun, finalizeAudit, finalizeReport, getAuditDetail, startAuditForWebsite } from "./audits";
import { operationalUsage } from "./operations";

const mocks = vi.hoisted(() => ({
  database: null as Db | null,
  user: vi.fn(),
  shell: vi.fn(),
  collect: vi.fn(),
}));
vi.mock("@/db/client", () => ({ get db() { return mocks.database; } }));
vi.mock("@/server/auth", () => ({
  getOptionalAuthenticatedUser: mocks.user,
  getWorkspaceShellContext: mocks.shell,
}));
vi.mock("@/domain/audits/execution", async (original) => ({
  ...await original<typeof import("@/domain/audits/execution")>(),
  runPhase1DeterministicAudit: mocks.collect,
}));

describe.sequential("Finalized report delivery with restricted Postgres role", () => {
  let pg: PGlite;
  let database: Db;
  const workspaceId = randomUUID();
  const otherWorkspaceId = randomUUID();
  const userId = randomUUID();
  const secondUserId = randomUUID();
  const analystId = randomUUID();
  const websiteId = randomUUID();
  const archivedWebsiteId = randomUUID();
  const auditReportId = randomUUID();
  const monthlyReportId = randomUUID();
  const draftMonthlyReportId = randomUUID();
  const owner: WorkspaceContext = { workspaceId, userId, actorType: "USER", role: "OWNER" };
  const otherTenant: WorkspaceContext = { ...owner, workspaceId: otherWorkspaceId };
  const unsafeText = '<img src="https://attacker.test/pixel" onerror="alert(1)">';
  const notForDelivery = "PRIVATE_METADATA_MARKER";

  function download(kind: string, reportId: string) {
    return GET(new Request("https://console.test/"), { params: Promise.resolve({ kind, reportId }) });
  }

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec("CREATE ROLE virelantic_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT");
    for (const file of readdirSync("drizzle").filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
      await pg.exec(readFileSync(`drizzle/${file}`, "utf8"));
    }
    const fixture = drizzle(pg, { schema });
    database = fixture as unknown as Db;
    mocks.database = database;
    const clientId = randomUUID();
    const auditId = randomUUID();
    const runId = randomUUID();
    const auditSnapshotId = randomUUID();
    for (const id of [userId, secondUserId, analystId]) {
      await fixture.insert(schema.user).values({ id, name: "Operator", email: `${id}@example.test` });
    }
    await fixture.insert(schema.workspaces).values([workspaceId, otherWorkspaceId].map((id) => ({ id, name: "Test", slug: id })));
    await fixture.insert(schema.workspaceMemberships).values([
      { workspaceId, userId, role: "OWNER" },
      { workspaceId, userId: secondUserId, role: "ADMIN" },
      { workspaceId, userId: analystId, role: "ANALYST" },
      { workspaceId: otherWorkspaceId, userId, role: "OWNER" },
    ]);
    await fixture.insert(schema.clients).values({ id: clientId, workspaceId, name: "Client" });
    await fixture.insert(schema.websites).values([
      { id: websiteId, workspaceId, clientId, displayName: "Site", domain: "example.test", canonicalUrl: "https://example.test/" },
      { id: archivedWebsiteId, workspaceId, clientId, displayName: "Archived", domain: "archived.test", canonicalUrl: "https://archived.test/", archivedAt: new Date() },
    ]);
    await fixture.insert(schema.audits).values({ id: auditId, workspaceId, websiteId, title: "Audit" });
    await fixture.insert(schema.auditRuns).values({ id: runId, workspaceId, auditId, websiteId });
    await fixture.insert(schema.auditSnapshots).values({
      id: auditSnapshotId, workspaceId, auditId, auditRunId: runId,
      scoringDefinitionVersion: "fixture", checkCatalogVersion: "fixture",
      snapshot: {}, snapshotHash: "a".repeat(64),
    });
    await fixture.insert(schema.reports).values({
      id: auditReportId, workspaceId, auditId, auditRunId: runId, auditSnapshotId,
      title: unsafeText, executiveSummary: "Overall deterministic score: 98/100.", methodologyVersion: "fixture",
      reportData: {
        website: { id: websiteId, canonicalUrl: `https://example.test/?secret=${notForDelivery}` },
        overallScore: 98, provisional: true, evidenceCoverageBasisPoints: 2500,
        categoryScores: [{ category: "aiReadiness", score: 97, evidenceCoverageBasisPoints: 8000, lowCoverage: false }],
        highPriorityFindings: [{ checkKey: "seo.title", severity: "HIGH", summary: unsafeText, evidenceRefs: [notForDelivery] }],
        unavailableChecks: [{ checkKey: "perf.inp", category: "websitePerformance", status: "UNAVAILABLE", reason: "Field data is unavailable." }],
        methodology: { scoringDefinitionVersion: "scoring", checkCatalogVersion: "checks", collectorVersion: "collector" },
      },
    });
    for (const [month, id] of [[1, monthlyReportId], [2, draftMonthlyReportId]] as const) {
      const startDate = `2026-0${month}-01`;
      const endDate = month === 1 ? "2026-01-31" : "2026-02-28";
      const [cycle] = await fixture.insert(schema.monthlyCycles).values({
        workspaceId, clientId, servicePlan: "ESSENTIALS", cycleYear: 2026, cycleMonth: month,
        periodStartDate: startDate, periodEndDate: endDate, dueAt: new Date(endDate), entitlementSnapshot: {},
      }).returning();
      const draft = buildMonthlyReportDraft({
        cycle: {
          id: cycle.id, clientName: unsafeText, servicePlan: "ESSENTIALS", servicePlanVersion: "fixture",
          periodStartDate: startDate, periodEndDate: endDate, timezone: "UTC",
          entitlementSnapshot: buildMonthlyEntitlementSnapshot("ESSENTIALS"),
        },
        deliverables: [{
          title: "Search Console", status: "UNAVAILABLE", targetCount: 1, completedCount: 0,
          entitlementSourceRule: "When connected", limitations: { internal: notForDelivery },
        }],
        workItems: [{ title: "Updated the homepage", status: "COMPLETE", completionState: "VERIFIED", selectedReason: notForDelivery }],
        observedAiVisibility: [{ copy: "One sampled observation", window: "January", runId: notForDelivery }],
        monitoring: { websiteHealthRuns: 1, searchConsoleRuns: 0, searchConsoleUnavailable: true, failures: 0, newOpportunities: 0, criticalRegressions: 0 },
        competitor: { activeTargets: 1, observations: 1, materialMetadataChanges: 0, limitations: [] },
        unresolvedRisks: [],
      });
      await fixture.insert(schema.monthlyReports).values({
        id, workspaceId, clientId, monthlyCycleId: cycle.id, title: "Mutable title",
        executiveSummary: "Mutable summary", timezone: "UTC", servicePlan: "ESSENTIALS",
        servicePlanVersion: "fixture", planSnapshot: {}, sections: {}, reportPeriodStartDate: startDate, reportPeriodEndDate: endDate,
        ...(id === monthlyReportId ? {
          status: "FINALIZED",
          finalizedAt: new Date(endDate),
          snapshotHash: "b".repeat(64),
          immutableSnapshot: {
            id, title: draft.title, executiveSummary: draft.executiveSummary, finalizedAt: endDate, methodologyVersion: draft.methodologyVersion,
            period: { startDate, endDate, timezone: "UTC" },
            sections: draft.sections,
            dataLimitations: draft.dataLimitations,
          },
        } : {}),
      });
    }
    await pg.exec("SET ROLE virelantic_runtime");
    mocks.shell.mockResolvedValue({ workspaceContext: owner });
  }, 60_000);

  afterAll(async () => { await pg?.close(); });

  it("refuses unauthenticated requests before workspace lookup and hides drafts and other tenants", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await download("monthly", monthlyReportId)).status).toBe(401);
    expect(mocks.shell).not.toHaveBeenCalled();
    mocks.user.mockResolvedValue({ id: userId });
    expect((await download("audit", auditReportId)).status).toBe(404);
    expect((await download("monthly", draftMonthlyReportId)).status).toBe(404);
    mocks.shell.mockResolvedValueOnce({ workspaceContext: otherTenant });
    expect((await download("monthly", monthlyReportId)).status).toBe(404);
    expect((await download("audit", "malformed")).status).toBe(404);
  });

  it("preserves the winning finalizer and records one event for concurrent finalize calls", async () => {
    const [first, second] = await Promise.all([
      finalizeReport(owner, auditReportId, database),
      finalizeReport({ ...owner, userId: secondUserId, role: "ADMIN" }, auditReportId, database),
    ]);
    expect(first.status).toBe("FINALIZED");
    expect(first.finalizedAt).toBeInstanceOf(Date);
    expect([userId, secondUserId]).toContain(first.finalizedByUserId);
    expect(second).toEqual(first);
    const count = await withTenantContext(database, owner, (tx) => tx.execute<{ count: number }>(
      sql`select count(*)::int from activity_events where action = 'report.finalized' and resource_id = ${auditReportId}`,
    ));
    expect(count.rows[0].count).toBe(1);
    mocks.shell.mockResolvedValueOnce({ workspaceContext: otherTenant });
    expect((await download("audit", auditReportId)).status).toBe(404);
  });

  it("returns a private passive attachment with selected evidence, escaped text and no internal metadata", async () => {
    for (const [kind, id] of [["audit", auditReportId], ["monthly", monthlyReportId]]) {
      const response = await download(kind, id);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("content-disposition")).toBe(`attachment; filename="virelantic-${kind}-report.html"`);
      expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
      const html = await response.text();
      expect(html).toContain("&lt;img src=&quot;");
      expect(html).not.toMatch(/<(img|script|iframe|a)\b/i);
      expect(html).not.toContain(notForDelivery);
      expect(html).not.toContain(id);
      expect(html).not.toContain(workspaceId);
      if (kind === "audit") {
        expect(html).toContain("Review the page title");
        expect(html).toContain("Field data is unavailable.");
        expect(html).toContain("AI readiness: Withheld");
        expect(html).toContain("Review real-user responsiveness");
        expect(html).not.toMatch(/aiReadiness|perf\.inp/);
        expect(html).toContain("insufficient evidence");
        expect(html).not.toMatch(/9[78]\/100/);
      } else {
        expect(html).toContain("1 work item(s) implemented; 1 verified.");
        expect(html).toContain("Updated the homepage");
        expect(html).toContain("Search Console: UNAVAILABLE");
        expect(html).toContain("One sampled observation");
        expect(html).not.toContain("Mutable summary");
      }
    }
  });

  it("refuses archived audit targets before a run or evidence collection", async () => {
    await expect(startAuditForWebsite(owner, archivedWebsiteId, database)).rejects.toThrow("Website was not found.");
    expect(mocks.collect).not.toHaveBeenCalled();
    const result = await withTenantContext(database, owner, (tx) => tx.execute<{ audits: number; runs: number }>(
      sql`select (select count(*)::int from audits where website_id = ${archivedWebsiteId}) as audits,
        (select count(*)::int from audit_runs where website_id = ${archivedWebsiteId}) as runs`,
    ));
    expect(result.rows[0]).toEqual({ audits: 0, runs: 0 });
  });

  it("closes only an authorized stale run, releases its slot, and fences late collection", async () => {
    let enterCollector!: () => void;
    const collectorEntered = new Promise<void>((resolve) => { enterCollector = resolve; });
    const lateResult = evaluatePhase1Checks({
      canonicalUrl: "https://example.test/", page: null, robots: null, sitemap: null, pageAnalysis: null,
      collectionError: "Synthetic late result",
    });
    let finishCollector!: (result: typeof lateResult) => void;
    const collectorResult = new Promise<typeof lateResult>((resolve) => { finishCollector = resolve; });
    mocks.collect.mockImplementationOnce(() => {
      enterCollector();
      return collectorResult;
    });
    const pending = startAuditForWebsite(owner, websiteId, database);
    try {
      await Promise.race([collectorEntered, pending]);
      const [run] = await withTenantContext(database, owner, (tx) => tx.select().from(schema.auditRuns)
        .where(and(eq(schema.auditRuns.websiteId, websiteId), eq(schema.auditRuns.status, "RUNNING"))));
      const input = { auditId: run.auditId, runId: run.id, reason: "  Verified the worker had stopped.  " };
      expect((await getAuditDetail(owner, run.auditId, database))?.canCloseStaleRun).toBe(false);
      await expect(closeStaleAuditRun(owner, input, database)).rejects.toThrow("after 15 minutes");
      await expect(closeStaleAuditRun(otherTenant, input, database)).rejects.toThrow("not found");
      await expect(closeStaleAuditRun({ ...owner, role: "ANALYST" }, input, database)).rejects.toThrow("ANALYST");
      await withTenantContext(database, owner, async (tx) => {
        await tx.update(schema.auditRuns).set({ startedAt: new Date(Date.now() - 16 * 60_000) }).where(eq(schema.auditRuns.id, run.id));
        await tx.insert(schema.auditEvidence).values({ workspaceId, auditRunId: run.id, evidenceType: "HTTP_RESPONSE", sourceLabel: "Prior evidence" });
      });
      expect((await getAuditDetail(owner, run.auditId, database))?.canCloseStaleRun).toBe(true);
      await expect(closeStaleAuditRun({ ...owner, userId: analystId }, input, database)).rejects.toThrow("active owner or admin");
      const usageBefore = await withTenantContext(database, owner, (tx) => operationalUsage(tx, owner));
      const admin: WorkspaceContext = { ...owner, userId: secondUserId, role: "ADMIN" };
      const closed = await closeStaleAuditRun(admin, input, database);
      expect(closed.status).toBe("CANCELED");
      expect(await closeStaleAuditRun(owner, { ...input, reason: "Duplicate submission" }, database)).toEqual(closed);
      const usageAfter = await withTenantContext(database, owner, (tx) => operationalUsage(tx, owner));
      expect(usageAfter.crawls).toBe(usageBefore.crawls - 1);

      finishCollector(lateResult);
      await pending;
      const detail = await getAuditDetail(owner, run.auditId, database);
      expect(detail?.audit.status).toBe("CANCELED");
      expect(detail?.run?.status).toBe("CANCELED");
      expect(detail?.checks).toHaveLength(0);
      expect(detail?.evidence.map((evidence) => evidence.sourceLabel)).toEqual(["Prior evidence"]);
      await expect(finalizeAudit(owner, run.auditId, database)).rejects.toThrow("finish successfully");
      const events = await withTenantContext(database, owner, (tx) => tx.select().from(schema.activityEvents)
        .where(and(eq(schema.activityEvents.resourceId, run.auditId), eq(schema.activityEvents.action, "audit.stale_run_closed"))));
      expect(events).toHaveLength(1);
      expect(events[0].summary).toEqual({ runId: run.id, reason: "Verified the worker had stopped." });
      expect(mocks.collect).toHaveBeenCalledTimes(1);
    } finally {
      finishCollector(lateResult);
      await pending.catch(() => {});
    }
  });
});
