import { createHash } from "node:crypto";

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  activityEvents,
  auditCategoryScores,
  auditCheckResults,
  auditEvidence,
  auditFindings,
  auditRuns,
  audits,
  auditSnapshots,
  reports,
  websites,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import {
  runPhase1DeterministicAudit,
  type Phase1AuditResult,
} from "@/domain/audits/execution";
import {
  buildAuditReportFromSnapshot,
  type AuditSnapshotData,
} from "@/domain/audits/report";
import type { WorkspaceContext } from "@/domain/tenancy/context";

type AuditDatabase = typeof db;
type AuditTransaction = Parameters<Parameters<AuditDatabase["transaction"]>[0]>[0];

function now() {
  return new Date();
}

function hashSnapshot(snapshot: AuditSnapshotData): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

async function recordActivity(
  tx: AuditTransaction,
  context: WorkspaceContext,
  action: string,
  resourceType: string,
  resourceId: string,
  summary: Record<string, unknown> = {},
) {
  await tx.insert(activityEvents).values({
    workspaceId: context.workspaceId,
    actorType: context.actorType,
    actorUserId: context.userId,
    actorAgentRunId: context.agentRunId,
    action,
    resourceType,
    resourceId,
    summary,
    correlationId: context.correlationId,
  });
}

export async function listAudits(context: WorkspaceContext, database = db) {
  return withTenantContext(database, context, async (tx) =>
    tx
      .select({
        id: audits.id,
        title: audits.title,
        status: audits.status,
        websiteId: audits.websiteId,
        websiteName: websites.displayName,
        domain: websites.domain,
        createdAt: audits.createdAt,
        finalizedAt: audits.finalizedAt,
      })
      .from(audits)
      .innerJoin(
        websites,
        and(
          eq(websites.workspaceId, audits.workspaceId),
          eq(websites.id, audits.websiteId),
        ),
      )
      .where(eq(audits.workspaceId, context.workspaceId))
      .orderBy(desc(audits.createdAt)),
  );
}

export async function listReports(context: WorkspaceContext, database = db) {
  return withTenantContext(database, context, async (tx) =>
    tx
      .select()
      .from(reports)
      .where(eq(reports.workspaceId, context.workspaceId))
      .orderBy(desc(reports.createdAt)),
  );
}

async function persistAuditResult(
  tx: AuditTransaction,
  context: WorkspaceContext,
  auditId: string,
  runId: string,
  result: Phase1AuditResult,
) {
  const runStatus = result.checkResults.some((check) => check.status === "ERROR")
    ? "PARTIAL"
    : "SUCCEEDED";
  const auditStatus = runStatus === "PARTIAL" ? "REVIEW_REQUIRED" : "READY_TO_FINALIZE";

  await tx.insert(auditEvidence).values(
    result.evidence.map((item) => ({
      workspaceId: context.workspaceId,
      auditRunId: runId,
      checkKey: null,
      evidenceType: item.evidenceType,
      sourceUrl: item.sourceUrl,
      sourceLabel: item.sourceLabel,
      httpStatus: item.httpStatus,
      contentHash: item.contentHash,
      excerpt: item.excerpt,
      metadata: { localEvidenceId: item.id, ...(item.metadata ?? {}) },
    })),
  );

  const savedResults = await tx
    .insert(auditCheckResults)
    .values(
      result.checkResults.map((check) => ({
        workspaceId: context.workspaceId,
        auditId,
        auditRunId: runId,
        checkKey: check.checkKey,
        checkVersion: check.checkVersion,
        category: check.category,
        status: check.status,
        severity: check.severity,
        maxPenaltyWeight: check.maxPenaltyWeight,
        reason: check.reason,
        evidenceRefs: check.evidenceRefs,
        observedValue: check.observedValue,
      })),
    )
    .returning({
      id: auditCheckResults.id,
      checkKey: auditCheckResults.checkKey,
      status: auditCheckResults.status,
      severity: auditCheckResults.severity,
      reason: auditCheckResults.reason,
      evidenceRefs: auditCheckResults.evidenceRefs,
    });

  await tx.insert(auditCategoryScores).values(
    result.categoryScores.map((score) => ({
      workspaceId: context.workspaceId,
      auditRunId: runId,
      category: score.category,
      score: score.score,
      evidenceCoverageBasisPoints: Math.round(score.evidenceCoverage * 10_000),
      lowCoverage: score.lowCoverage,
      applicableMaxPenalty: score.applicableMaxPenalty,
      availableMaxPenalty: score.availableMaxPenalty,
      actualPenaltyBasisPoints: Math.round(score.actualPenalty * 100),
    })),
  );

  const findingRows = savedResults
    .filter(
      (check) =>
        check.severity &&
        (check.status === "FAIL" ||
          check.status === "WARNING" ||
          check.status === "ERROR"),
    )
    .map((check) => ({
      workspaceId: context.workspaceId,
      auditId,
      auditRunId: runId,
      checkResultId: check.id,
      checkKey: check.checkKey,
      severity: check.severity!,
      title: `${check.checkKey} ${check.status}`,
      summary: check.reason,
      evidenceRefs: check.evidenceRefs,
    }));

  if (findingRows.length > 0) {
    await tx.insert(auditFindings).values(findingRows);
  }

  await tx
    .update(auditRuns)
    .set({
      status: runStatus,
      overallScore: result.overall.score,
      provisional: result.overall.provisional,
      evidenceCoverageBasisPoints: Math.round(result.evidenceCoverage * 10_000),
      completedAt: now(),
      updatedAt: now(),
    })
    .where(
      and(
        eq(auditRuns.workspaceId, context.workspaceId),
        eq(auditRuns.id, runId),
      ),
    );

  await tx
    .update(audits)
    .set({ status: auditStatus, updatedAt: now() })
    .where(and(eq(audits.workspaceId, context.workspaceId), eq(audits.id, auditId)));
}

export async function startAuditForWebsite(
  context: WorkspaceContext,
  websiteId: string,
  database = db,
) {
  const prepared = await withTenantContext(database, context, async (tx) => {
    const [website] = await tx
      .select()
      .from(websites)
      .where(and(eq(websites.workspaceId, context.workspaceId), eq(websites.id, websiteId)))
      .limit(1);

    if (!website) {
      throw new Error("Website was not found.");
    }

    const [audit] = await tx
      .insert(audits)
      .values({
        workspaceId: context.workspaceId,
        websiteId: website.id,
        title: `${website.displayName} Digital Visibility Audit`,
        status: "RUNNING",
        startedByUserId: context.userId,
      })
      .returning();

    const [run] = await tx
      .insert(auditRuns)
      .values({
        workspaceId: context.workspaceId,
        auditId: audit.id,
        websiteId: website.id,
        status: "RUNNING",
        startedAt: now(),
      })
      .returning();

    await recordActivity(tx, context, "audit.started", "audit", audit.id, {
      websiteId: website.id,
      domain: website.domain,
    });

    return { audit, run, website };
  });

  const result = await runPhase1DeterministicAudit(prepared.website.canonicalUrl);

  await withTenantContext(database, context, async (tx) => {
    await persistAuditResult(tx, context, prepared.audit.id, prepared.run.id, result);
    await recordActivity(tx, context, "audit.completed", "audit", prepared.audit.id, {
      runId: prepared.run.id,
      overallScore: result.overall.score,
      provisional: result.overall.provisional,
    });
  });

  return prepared.audit;
}

async function loadAuditDetail(
  tx: AuditTransaction,
  context: WorkspaceContext,
  auditId: string,
) {
    const [audit] = await tx
      .select()
      .from(audits)
      .where(and(eq(audits.workspaceId, context.workspaceId), eq(audits.id, auditId)))
      .limit(1);

    if (!audit) return null;

    const [website] = await tx
      .select()
      .from(websites)
      .where(
        and(
          eq(websites.workspaceId, context.workspaceId),
          eq(websites.id, audit.websiteId),
        ),
      )
      .limit(1);
    const [run] = await tx
      .select()
      .from(auditRuns)
      .where(and(eq(auditRuns.workspaceId, context.workspaceId), eq(auditRuns.auditId, audit.id)))
      .orderBy(desc(auditRuns.createdAt))
      .limit(1);
    const checks = run
      ? await tx
          .select()
          .from(auditCheckResults)
          .where(
            and(
              eq(auditCheckResults.workspaceId, context.workspaceId),
              eq(auditCheckResults.auditRunId, run.id),
            ),
          )
          .orderBy(asc(auditCheckResults.checkKey))
      : [];
    const scores = run
      ? await tx
          .select()
          .from(auditCategoryScores)
          .where(
            and(
              eq(auditCategoryScores.workspaceId, context.workspaceId),
              eq(auditCategoryScores.auditRunId, run.id),
            ),
          )
          .orderBy(asc(auditCategoryScores.category))
      : [];
    const evidence = run
      ? await tx
          .select()
          .from(auditEvidence)
          .where(
            and(
              eq(auditEvidence.workspaceId, context.workspaceId),
              eq(auditEvidence.auditRunId, run.id),
            ),
          )
          .orderBy(asc(auditEvidence.sourceLabel))
      : [];
    const findings = run
      ? await tx
          .select()
          .from(auditFindings)
          .where(
            and(
              eq(auditFindings.workspaceId, context.workspaceId),
              eq(auditFindings.auditRunId, run.id),
            ),
          )
          .orderBy(asc(auditFindings.checkKey))
      : [];
    const [snapshot] = await tx
      .select()
      .from(auditSnapshots)
      .where(
        and(
          eq(auditSnapshots.workspaceId, context.workspaceId),
          eq(auditSnapshots.auditId, audit.id),
        ),
      )
      .limit(1);
    const [report] = await tx
      .select()
      .from(reports)
      .where(and(eq(reports.workspaceId, context.workspaceId), eq(reports.auditId, audit.id)))
      .limit(1);

    return { audit, website, run, checks, scores, evidence, findings, snapshot, report };
}

export async function getAuditDetail(
  context: WorkspaceContext,
  auditId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) =>
    loadAuditDetail(tx, context, auditId),
  );
}

export async function finalizeAudit(
  context: WorkspaceContext,
  auditId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const detail = await loadAuditDetail(tx, context, auditId);

    if (!detail?.audit || !detail.website || !detail.run) {
      throw new Error("Audit is not ready to finalize.");
    }

    if (detail.snapshot) {
      return detail.snapshot;
    }

    const finalizedAt = now().toISOString();
    const snapshot: AuditSnapshotData = {
      audit: {
        id: detail.audit.id,
        title: detail.audit.title,
        finalizedAt,
        scoringDefinitionVersion: detail.audit.scoringDefinitionVersion,
        checkCatalogVersion: detail.audit.checkCatalogVersion,
      },
      run: {
        id: detail.run.id,
        overallScore: detail.run.overallScore,
        provisional: detail.run.provisional,
        evidenceCoverageBasisPoints: detail.run.evidenceCoverageBasisPoints,
        collectorVersion: detail.run.collectorVersion,
      },
      website: {
        id: detail.website.id,
        displayName: detail.website.displayName,
        canonicalUrl: detail.website.canonicalUrl,
        domain: detail.website.domain,
      },
      checkResults: detail.checks.map((check) => ({
        checkKey: check.checkKey,
        category: check.category,
        status: check.status,
        severity: check.severity,
        reason: check.reason,
        evidenceRefs: check.evidenceRefs,
      })),
      categoryScores: detail.scores.map((score) => ({
        category: score.category,
        score: score.score,
        evidenceCoverageBasisPoints: score.evidenceCoverageBasisPoints,
        lowCoverage: score.lowCoverage,
      })),
      findings: detail.findings.map((finding) => ({
        checkKey: finding.checkKey,
        severity: finding.severity,
        title: finding.title,
        summary: finding.summary,
        evidenceRefs: finding.evidenceRefs,
      })),
    };
    const [savedSnapshot] = await tx
      .insert(auditSnapshots)
      .values({
        workspaceId: context.workspaceId,
        auditId: detail.audit.id,
        auditRunId: detail.run.id,
        scoringDefinitionVersion: snapshot.audit.scoringDefinitionVersion,
        checkCatalogVersion: snapshot.audit.checkCatalogVersion,
        snapshot,
        snapshotHash: hashSnapshot(snapshot),
      })
      .returning();

    await tx
      .update(audits)
      .set({
        status: "FINALIZED",
        finalizedAt: now(),
        finalizedByUserId: context.userId,
        updatedAt: now(),
      })
      .where(and(eq(audits.workspaceId, context.workspaceId), eq(audits.id, auditId)));

    await recordActivity(tx, context, "audit.finalized", "audit", auditId, {
      snapshotId: savedSnapshot.id,
    });

    return savedSnapshot;
  });
}

export async function createReportForAudit(
  context: WorkspaceContext,
  auditId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [existingReport] = await tx
      .select()
      .from(reports)
      .where(and(eq(reports.workspaceId, context.workspaceId), eq(reports.auditId, auditId)))
      .limit(1);

    if (existingReport) {
      return existingReport;
    }

    const [snapshot] = await tx
      .select()
      .from(auditSnapshots)
      .where(
        and(
          eq(auditSnapshots.workspaceId, context.workspaceId),
          eq(auditSnapshots.auditId, auditId),
        ),
      )
      .limit(1);

    if (!snapshot) {
      throw new Error("Audit must be finalized before a report can be created.");
    }

    const built = buildAuditReportFromSnapshot(
      snapshot.snapshot as AuditSnapshotData,
    );
    const [report] = await tx
      .insert(reports)
      .values({
        workspaceId: context.workspaceId,
        auditId,
        auditRunId: snapshot.auditRunId,
        auditSnapshotId: snapshot.id,
        title: built.title,
        executiveSummary: built.executiveSummary,
        methodologyVersion: built.methodologyVersion,
        reportData: built.reportData,
        createdByUserId: context.userId,
      })
      .returning();

    await recordActivity(tx, context, "report.created", "report", report.id, {
      auditId,
    });

    return report;
  });
}

export async function getReport(
  context: WorkspaceContext,
  reportId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [report] = await tx
      .select()
      .from(reports)
      .where(and(eq(reports.workspaceId, context.workspaceId), eq(reports.id, reportId)))
      .limit(1);

    return report ?? null;
  });
}

export async function finalizeReport(
  context: WorkspaceContext,
  reportId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [report] = await tx
      .update(reports)
      .set({
        status: "FINALIZED",
        finalizedAt: now(),
        finalizedByUserId: context.userId,
        updatedAt: now(),
      })
      .where(and(eq(reports.workspaceId, context.workspaceId), eq(reports.id, reportId)))
      .returning();

    if (!report) {
      throw new Error("Report was not found.");
    }

    await recordActivity(tx, context, "report.finalized", "report", report.id, {
      auditId: report.auditId,
    });

    return report;
  });
}
