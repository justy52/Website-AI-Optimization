import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import type { WorkspaceContext } from "@/domain/tenancy/context";
import type { AuditSnapshotData, BuiltAuditReport } from "@/domain/audits/report";
import { serverEnv } from "@/lib/env";
import { createReportForAudit, finalizeAudit, startAuditForWebsite } from "./audits";

vi.mock("@/security/safe-fetch", () => ({
  SafeFetchError: class SafeFetchError extends Error {},
  safeFetchText: async (url: string) => ({
    requestedUrl: url, finalUrl: url, status: 200,
    headers: { "content-type": url.endsWith(".xml") ? "application/xml" : "text/html" },
    bodyText: url.endsWith("robots.txt") ? "User-agent: *\nAllow: /" : url.endsWith(".xml") ? "<urlset><url><loc>https://example.com/</loc></url></urlset>" : "<title>Example</title><h1>Example</h1><a href='/contact'>Contact</a>",
    contentHash: "0".repeat(64), redirects: [],
  }),
}));

describe("mobile lab evidence through the audit workflow", () => {
  let pg: PGlite, database: Db, context: WorkspaceContext, websiteId: string;
  const previous = { stop: serverEnv.AUTOMATION_EMERGENCY_STOP, key: serverEnv.GOOGLE_PAGESPEED_API_KEY };
  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec("CREATE ROLE virelantic_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT");
    for (const file of readdirSync("drizzle").filter(f => /^\d+.*\.sql$/.test(f)).sort()) await pg.exec(readFileSync(`drizzle/${file}`, "utf8"));
    database = drizzle(pg, { schema }) as unknown as Db;
    const workspaceId = randomUUID(), userId = randomUUID();
    context = { workspaceId, userId, actorType: "USER", role: "OWNER" };
    await pg.query('INSERT INTO "user" (id,name,email) VALUES ($1,$1,$2)', [userId, `${userId}@example.test`]);
    await pg.query("INSERT INTO workspaces (id,name,slug) VALUES ($1,'Isolated audit test',$2)", [workspaceId, workspaceId]);
    await pg.query("INSERT INTO workspace_memberships (workspace_id,user_id,role) VALUES ($1,$2,'OWNER')", [workspaceId, userId]);
    serverEnv.AUTOMATION_EMERGENCY_STOP = false;
    serverEnv.GOOGLE_PAGESPEED_API_KEY = "test-only";
    await pg.exec("SET ROLE virelantic_runtime");
    await withTenantContext(database, context, async tx => {
      await tx.insert(schema.workspaceOperations).values({ workspaceId, monthlyCostUsd: "0", activeWorkflowLimit: 5, crawlConcurrency: 2 });
      const [client] = await tx.insert(schema.clients).values({ workspaceId, name: "Synthetic audit client", servicePlan: "GROWTH" }).returning();
      const [site] = await tx.insert(schema.websites).values({ workspaceId, clientId: client.id, displayName: "Synthetic site", domain: "example.com", canonicalUrl: "https://example.com/" }).returning();
      websiteId = site.id;
      const [otherSite] = await tx.insert(schema.websites).values({ workspaceId, clientId: client.id, displayName: "Other site", domain: "other.example.com", canonicalUrl: "https://other.example.com/" }).returning();
      await tx.insert(schema.businessFacts).values([
        { workspaceId, clientId: client.id, factType: "business_name", value: "Example", sourceReference: "test", verificationStatus: "VERIFIED", sensitivity: "PUBLIC", approvedByUserId: userId },
        { workspaceId, clientId: client.id, factType: "service", value: "Private service", sourceReference: "test", verificationStatus: "VERIFIED", sensitivity: "CONFIDENTIAL", approvedByUserId: userId },
        { workspaceId, clientId: client.id, websiteId: otherSite.id, factType: "location", value: "Other site location", sourceReference: "test", verificationStatus: "VERIFIED", sensitivity: "PUBLIC", approvedByUserId: userId },
        { workspaceId, clientId: client.id, factType: "service", value: "Unapproved service", sourceReference: "test", verificationStatus: "NEEDS_REVIEW", sensitivity: "PUBLIC" },
      ]);
    });
  }, 60_000);
  afterAll(async () => {
    serverEnv.AUTOMATION_EMERGENCY_STOP = previous.stop;
    serverEnv.GOOGLE_PAGESPEED_API_KEY = previous.key;
    vi.unstubAllGlobals();
    await pg?.close();
  });

  it("saves Google lab results as measured checks without inventing field data", async () => {
    const transport = vi.fn(async () => new Response(JSON.stringify({ lighthouseResult: {
      requestedUrl: "https://example.com/", finalDisplayedUrl: "https://example.com/", lighthouseVersion: "13.6.0",
      audits: { "largest-contentful-paint": { numericValue: 4400, scoreDisplayMode: "numeric" }, "cumulative-layout-shift": { numericValue: 0.002, scoreDisplayMode: "numeric" } },
    } }), { status: 200 }));
    vi.stubGlobal("fetch", transport);
    const audit = await startAuditForWebsite(context, websiteId, database);
    const results = await withTenantContext(database, context, tx => tx.select().from(schema.auditCheckResults).where(eq(schema.auditCheckResults.auditId, audit.id)));
    expect(transport).toHaveBeenCalledTimes(1);
    expect(results.find(c => c.checkKey === "perf.lcp")).toMatchObject({ status: "FAIL" });
    expect(results.find(c => c.checkKey === "perf.lcp")?.reason).toContain("not real-user field data");
    expect(results.find(c => c.checkKey === "perf.cls")).toMatchObject({ status: "PASS" });
    expect(results.find(c => c.checkKey === "perf.inp")).toMatchObject({ status: "UNAVAILABLE" });
    expect(results.find(c => c.checkKey === "ai.identity_clarity")).toMatchObject({ status: "PASS" });
    expect(results.find(c => c.checkKey === "ai.service_clarity")).toMatchObject({ status: "UNAVAILABLE" });
    expect(results.find(c => c.checkKey === "ai.location_clarity")).toMatchObject({ status: "UNAVAILABLE" });
    const evidence = await withTenantContext(database, context, tx => tx.select().from(schema.auditEvidence).where(eq(schema.auditEvidence.auditRunId, results[0].auditRunId)));
    expect(evidence.filter(e => e.sourceLabel.startsWith("Public verified business fact:"))).toHaveLength(1);
    const snapshot = await finalizeAudit(context, audit.id, database);
    expect((snapshot.snapshot as AuditSnapshotData).checkResults.find(c => c.checkKey === "ai.identity_clarity")?.evidenceRefs).toContainEqual(expect.stringMatching(/^business-fact:/));
    const report = await createReportForAudit(context, audit.id, database);
    expect((report.reportData as BuiltAuditReport["reportData"]).unavailableChecks.some(c => c.checkKey === "ai.service_clarity")).toBe(true);
  }, 60_000);

  it("retains page-level field INP separately in the audit and report", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      loadingExperience: { id: "https://example.com/", initial_url: "https://example.com/", origin_fallback: false, metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: 230 } } },
      lighthouseResult: { requestedUrl: "https://example.com/", finalDisplayedUrl: "https://example.com/", lighthouseVersion: "13.6.0", audits: { "largest-contentful-paint": { numericValue: 2200, scoreDisplayMode: "numeric" } } },
    }), { status: 200 })));
    const audit = await startAuditForWebsite(context, websiteId, database);
    const checks = await withTenantContext(database, context, tx => tx.select().from(schema.auditCheckResults).where(eq(schema.auditCheckResults.auditId, audit.id)));
    expect(checks.find(c => c.checkKey === "perf.inp")).toMatchObject({ status: "WARNING", evidenceRefs: ["pagespeed-field"] });
    const evidence = await withTenantContext(database, context, tx => tx.select().from(schema.auditEvidence).where(eq(schema.auditEvidence.auditRunId, checks[0].auditRunId)));
    expect(evidence.find(e => e.sourceLabel === "Google CrUX: homepage mobile field data")?.metadata).toMatchObject({ fieldInpMs: 230, dataType: "field" });
    await finalizeAudit(context, audit.id, database);
    const report = await createReportForAudit(context, audit.id, database);
    expect((report.reportData as BuiltAuditReport["reportData"]).additionalFindings?.find(f => f.checkKey === "perf.inp")?.summary).toContain("28-day field-data");
  }, 60_000);
});
