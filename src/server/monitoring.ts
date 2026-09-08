import { createHash } from "node:crypto";

import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  activityEvents,
  auditCheckResults,
  auditRuns,
  clients,
  monitoringObservations,
  monitoringRuns,
  monitoringSchedules,
  operationalNotifications,
  searchConsoleProperties,
  websites,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import {
  MONITOR_DEFINITION_VERSION,
  SEARCH_CONSOLE_MONITOR_KEY,
  WEBSITE_HEALTH_MONITOR_KEY,
  monitorDefinitionsForPlan,
  nextRunAtForCadence,
  type Phase4aMonitorKey,
} from "@/domain/monitoring/definitions";
import type { MonitoringCadence } from "@/domain/service-plans";
import {
  assertWorkspaceRole,
  type WorkspaceContext,
} from "@/domain/tenancy/context";

import { startAuditForWebsite } from "./audits";
import { syncSearchConsoleObservations } from "./integrations";

type MonitoringDatabase = typeof db;
type MonitoringTransaction = Parameters<
  Parameters<MonitoringDatabase["transaction"]>[0]
>[0];

function now() {
  return new Date();
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function riskFromAuditSeverity(severity: string | null): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (severity === "CRITICAL") return "CRITICAL";
  if (severity === "HIGH") return "HIGH";
  if (severity === "MEDIUM") return "MEDIUM";
  return "LOW";
}

function safeErrorSummary(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 300)
    : "Monitoring run failed.";
}

export function buildMonitoringScheduleCompletionUpdate(input: {
  status: "SUCCEEDED" | "PARTIAL" | "FAILED";
  completedAt: Date;
  nextRunAt: Date | null;
  errorSummary?: string;
}) {
  const update: {
    lastRunAt: Date;
    lastSuccessAt?: Date;
    lastErrorAt?: Date | null;
    lastErrorSummary?: string | null;
    nextRunAt: Date | null;
    updatedAt: Date;
  } = {
    lastRunAt: input.completedAt,
    nextRunAt: input.nextRunAt,
    updatedAt: input.completedAt,
  };

  if (input.status === "SUCCEEDED") {
    update.lastSuccessAt = input.completedAt;
    update.lastErrorAt = null;
    update.lastErrorSummary = null;
  }

  if (input.status === "FAILED") {
    update.lastErrorAt = input.completedAt;
    update.lastErrorSummary = input.errorSummary ?? "Monitoring run failed.";
  }

  return update;
}

async function recordActivity(
  tx: MonitoringTransaction,
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

async function createNotification(
  tx: MonitoringTransaction,
  context: WorkspaceContext,
  input: {
    type: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    title: string;
    summary: string;
    resourceType?: string;
    resourceId?: string;
  },
) {
  await tx.insert(operationalNotifications).values({
    workspaceId: context.workspaceId,
    type: input.type,
    severity: input.severity,
    title: input.title,
    summary: input.summary,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
  });
}

export async function ensureMonitoringSchedulesForWebsite(
  context: WorkspaceContext,
  websiteId: string,
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN", "ANALYST"]);

  return withTenantContext(database, context, async (tx) => {
    const [target] = await tx
      .select({
        websiteId: websites.id,
        clientId: websites.clientId,
        servicePlan: clients.servicePlan,
        servicePlanVersion: clients.servicePlanVersion,
      })
      .from(websites)
      .innerJoin(
        clients,
        and(
          eq(clients.workspaceId, websites.workspaceId),
          eq(clients.id, websites.clientId),
        ),
      )
      .where(
        and(
          eq(websites.workspaceId, context.workspaceId),
          eq(websites.id, websiteId),
          isNull(websites.archivedAt),
          isNull(clients.archivedAt),
        ),
      )
      .limit(1);

    if (!target) {
      throw new Error("Website was not found.");
    }

    const definitions = monitorDefinitionsForPlan(
      target.servicePlan,
      target.servicePlanVersion,
    );
    const activeDefinitions = definitions.filter((definition) => definition.enabled);
    const scheduleRows = activeDefinitions.map((definition) => ({
      workspaceId: context.workspaceId,
      clientId: target.clientId,
      websiteId: target.websiteId,
      monitorKey: definition.key,
      monitorVersion: definition.version,
      cadence: definition.cadence,
      enabled: true,
      configuration: { source: "service_plan", version: target.servicePlanVersion },
      nextRunAt: nextRunAtForCadence(definition.cadence, now()),
      createdByUserId: context.userId,
      updatedAt: now(),
    }));

    if (scheduleRows.length > 0) {
      for (const row of scheduleRows) {
        await tx
          .insert(monitoringSchedules)
          .values(row)
          .onConflictDoUpdate({
            target: [
              monitoringSchedules.workspaceId,
              monitoringSchedules.websiteId,
              monitoringSchedules.monitorKey,
              monitoringSchedules.monitorVersion,
            ],
            set: {
              cadence: row.cadence,
              enabled: true,
              configuration: row.configuration,
              nextRunAt: row.nextRunAt,
              archivedAt: null,
              updatedAt: now(),
            },
          });
      }
    }

    await tx
      .update(websites)
      .set({
        monitoringStatus: scheduleRows.length > 0 ? "ACTIVE" : "NOT_CONFIGURED",
        updatedAt: now(),
      })
      .where(
        and(eq(websites.workspaceId, context.workspaceId), eq(websites.id, websiteId)),
      );
    await recordActivity(
      tx,
      context,
      "monitoring.schedules_updated",
      "website",
      websiteId,
      { activeMonitors: scheduleRows.map((row) => row.monitorKey) },
    );

    return tx
      .select()
      .from(monitoringSchedules)
      .where(
        and(
          eq(monitoringSchedules.workspaceId, context.workspaceId),
          eq(monitoringSchedules.websiteId, websiteId),
          isNull(monitoringSchedules.archivedAt),
        ),
      )
      .orderBy(monitoringSchedules.monitorKey);
  });
}

export async function requestManualMonitoringRun(
  context: WorkspaceContext,
  websiteId: string,
  monitorKey: Phase4aMonitorKey,
  database = db,
) {
  assertWorkspaceRole(context, ["OWNER", "ADMIN", "ANALYST"]);
  await ensureMonitoringSchedulesForWebsite(context, websiteId, database);

  return withTenantContext(database, context, async (tx) => {
    const [schedule] = await tx
      .select()
      .from(monitoringSchedules)
      .where(
        and(
          eq(monitoringSchedules.workspaceId, context.workspaceId),
          eq(monitoringSchedules.websiteId, websiteId),
          eq(monitoringSchedules.monitorKey, monitorKey),
          eq(monitoringSchedules.enabled, true),
          isNull(monitoringSchedules.archivedAt),
        ),
      )
      .limit(1);

    if (!schedule) {
      throw new Error("This monitor is not included in the current service plan.");
    }

    const [run] = await tx
      .insert(monitoringRuns)
      .values({
        workspaceId: context.workspaceId,
        monitoringScheduleId: schedule.id,
        clientId: schedule.clientId,
        websiteId: schedule.websiteId,
        monitorKey: schedule.monitorKey,
        monitorVersion: schedule.monitorVersion,
        triggerType: "MANUAL",
        status: "QUEUED",
        idempotencyKey: `${schedule.id}:manual:${Date.now()}`,
        createdByUserId: context.userId,
      })
      .returning();

    await recordActivity(
      tx,
      context,
      "monitoring.run_requested",
      "monitoring_run",
      run.id,
      { monitorKey, websiteId },
    );

    return { monitoringRunId: run.id, shouldStartWorkflow: true };
  });
}

export async function recordMonitoringWorkflowRunId(
  context: WorkspaceContext,
  monitoringRunId: string,
  workflowRunId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) =>
    tx
      .update(monitoringRuns)
      .set({ workflowRunId, updatedAt: now() })
      .where(
        and(
          eq(monitoringRuns.workspaceId, context.workspaceId),
          eq(monitoringRuns.id, monitoringRunId),
        ),
      ),
  );
}

async function completeRun(
  tx: MonitoringTransaction,
  context: WorkspaceContext,
  run: typeof monitoringRuns.$inferSelect,
  input: {
    status: "SUCCEEDED" | "PARTIAL" | "FAILED";
    observationsProduced: number;
    errorSummary?: string;
  },
) {
  const [schedule] = run.monitoringScheduleId
    ? await tx
        .select({ cadence: monitoringSchedules.cadence })
        .from(monitoringSchedules)
        .where(
          and(
            eq(monitoringSchedules.workspaceId, context.workspaceId),
            eq(monitoringSchedules.id, run.monitoringScheduleId),
          ),
        )
        .limit(1)
    : [];
  const nextRunAt = schedule
    ? nextRunAtForCadence(schedule.cadence as MonitoringCadence, now())
    : null;
  const completedAt = now();

  await tx
    .update(monitoringRuns)
    .set({
      status: input.status,
      observationsProduced: input.observationsProduced,
      errorSummary: input.errorSummary,
      completedAt,
      updatedAt: completedAt,
    })
    .where(
      and(
        eq(monitoringRuns.workspaceId, context.workspaceId),
        eq(monitoringRuns.id, run.id),
      ),
    );

  if (run.monitoringScheduleId) {
    await tx
      .update(monitoringSchedules)
      .set(
        buildMonitoringScheduleCompletionUpdate({
          status: input.status,
          completedAt,
          nextRunAt,
          errorSummary: input.errorSummary,
        }),
      )
      .where(
        and(
          eq(monitoringSchedules.workspaceId, context.workspaceId),
          eq(monitoringSchedules.id, run.monitoringScheduleId),
        ),
      );
  }
}

export async function executeMonitoringRun(
  context: WorkspaceContext,
  monitoringRunId: string,
  database = db,
) {
  const run = await withTenantContext(database, context, async (tx) => {
    const [row] = await tx
      .update(monitoringRuns)
      .set({ status: "RUNNING", startedAt: now(), updatedAt: now() })
      .where(
        and(
          eq(monitoringRuns.workspaceId, context.workspaceId),
          eq(monitoringRuns.id, monitoringRunId),
        ),
      )
      .returning();

    if (!row) {
      throw new Error("Monitoring run was not found.");
    }

    return row;
  });

  try {
    if (run.monitorKey === WEBSITE_HEALTH_MONITOR_KEY) {
      const audit = await startAuditForWebsite(context, run.websiteId, database);
      let finalStatus: "SUCCEEDED" | "PARTIAL" = "PARTIAL";

      await withTenantContext(database, context, async (tx) => {
        const [auditRun] = await tx
          .select()
          .from(auditRuns)
          .where(
            and(
              eq(auditRuns.workspaceId, context.workspaceId),
              eq(auditRuns.auditId, audit.id),
            ),
          )
          .orderBy(desc(auditRuns.createdAt))
          .limit(1);

        if (!auditRun) {
          throw new Error("Monitoring audit run did not persist.");
        }

        const checks = await tx
          .select()
          .from(auditCheckResults)
          .where(
            and(
              eq(auditCheckResults.workspaceId, context.workspaceId),
              eq(auditCheckResults.auditRunId, auditRun.id),
              inArray(auditCheckResults.checkKey, [
                "perf.https",
                "seo.indexability",
                "seo.robots_sitemap",
                "seo.canonical",
                "seo.title",
                "seo.meta_description",
              ]),
            ),
          );

        if (checks.length > 0) {
          await tx.insert(monitoringObservations).values(
            checks.map((check) => ({
              workspaceId: context.workspaceId,
              monitoringRunId: run.id,
              monitoringScheduleId: run.monitoringScheduleId,
              clientId: run.clientId,
              websiteId: run.websiteId,
              observationKey: check.checkKey,
              observationType: "website_health_check",
              sourceProvider: "optiq_audit",
              sourceUrl: null,
              status: check.status,
              severity: riskFromAuditSeverity(check.severity),
              evidenceConfidence: check.evidenceConfidence,
              contentHash: hashJson({
                checkKey: check.checkKey,
                status: check.status,
                observedValue: check.observedValue,
              }),
              summary: check.reason,
              evidence: {
                auditId: audit.id,
                auditRunId: auditRun.id,
                checkResultId: check.id,
                evidenceRefs: check.evidenceRefs,
              },
              limitations: {
                source: "bounded_phase1_deterministic_audit",
                noExternalWrites: true,
              },
            })),
          );
        }

        const critical = checks.some((check) => check.severity === "CRITICAL");

        await tx
          .update(monitoringRuns)
          .set({ auditId: audit.id, auditRunId: auditRun.id })
          .where(
            and(
              eq(monitoringRuns.workspaceId, context.workspaceId),
              eq(monitoringRuns.id, run.id),
            ),
          );
        const status = auditRun.status === "SUCCEEDED" ? "SUCCEEDED" : "PARTIAL";
        finalStatus = status;

        await completeRun(tx, context, run, {
          status,
          observationsProduced: checks.length,
        });
        await recordActivity(
          tx,
          context,
          "monitoring.run_completed",
          "monitoring_run",
          run.id,
          { monitorKey: run.monitorKey, observations: checks.length },
        );

        if (critical) {
          await createNotification(tx, context, {
            type: "monitoring.critical_regression",
            severity: "CRITICAL",
            title: "Critical monitoring finding",
            summary: "A recurring website-health run produced a critical finding.",
            resourceType: "monitoring_run",
            resourceId: run.id,
          });
        }
      });

      return { status: finalStatus };
    }

    if (run.monitorKey === SEARCH_CONSOLE_MONITOR_KEY) {
      const [selectedProperty] = await withTenantContext(database, context, async (tx) =>
        tx
          .select()
          .from(searchConsoleProperties)
          .where(
            and(
              eq(searchConsoleProperties.workspaceId, context.workspaceId),
              eq(searchConsoleProperties.websiteId, run.websiteId),
              eq(searchConsoleProperties.selected, true),
              isNull(searchConsoleProperties.archivedAt),
            ),
          )
          .limit(1),
      );

      if (!selectedProperty) {
        await withTenantContext(database, context, async (tx) => {
          await tx.insert(monitoringObservations).values({
            workspaceId: context.workspaceId,
            monitoringRunId: run.id,
            monitoringScheduleId: run.monitoringScheduleId,
            clientId: run.clientId,
            websiteId: run.websiteId,
            observationKey: SEARCH_CONSOLE_MONITOR_KEY,
            observationType: "search_console_sync",
            sourceProvider: "google_search_console",
            status: "UNAVAILABLE",
            severity: "LOW",
            evidenceConfidence: "LOW",
            summary: "Search Console is not connected or no matching property is selected.",
            limitations: { missingIntegration: true },
          });
          await completeRun(tx, context, run, {
            status: "PARTIAL",
            observationsProduced: 1,
          });
        });

        return { status: "PARTIAL" as const };
      }

      const synced = await syncSearchConsoleObservations(
        context,
        selectedProperty.id,
        undefined,
        database,
      );

      await withTenantContext(database, context, async (tx) => {
        await tx.insert(monitoringObservations).values({
          workspaceId: context.workspaceId,
          monitoringRunId: run.id,
          monitoringScheduleId: run.monitoringScheduleId,
          clientId: run.clientId,
          websiteId: run.websiteId,
          observationKey: SEARCH_CONSOLE_MONITOR_KEY,
          observationType: "search_console_sync",
          sourceProvider: "google_search_console",
          status: "PASS",
          severity: "LOW",
          evidenceConfidence: "HIGH",
          summary: `${synced.observations} Search Console rows captured for the latest window.`,
          evidence: { window: synced.window, observations: synced.observations },
          limitations: { source: "google_search_console_readonly" },
        });
        await completeRun(tx, context, run, {
          status: "SUCCEEDED",
          observationsProduced: synced.observations + 1,
        });
      });

      return { status: "SUCCEEDED" as const };
    }

    throw new Error("Unsupported monitor key.");
  } catch (error) {
    const summary = safeErrorSummary(error);

    await withTenantContext(database, context, async (tx) => {
      await completeRun(tx, context, run, {
        status: "FAILED",
        observationsProduced: 0,
        errorSummary: summary,
      });
      await createNotification(tx, context, {
        type: "monitoring.run_failed",
        severity: "HIGH",
        title: "Monitoring run failed",
        summary,
        resourceType: "monitoring_run",
        resourceId: run.id,
      });
      await recordActivity(
        tx,
        context,
        "monitoring.run_failed",
        "monitoring_run",
        run.id,
        { monitorKey: run.monitorKey, errorSummary: summary },
      );
    });

    throw error;
  }
}

export async function getWebsiteMonitoringPanel(
  context: WorkspaceContext,
  websiteId: string,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const schedules = await tx
      .select()
      .from(monitoringSchedules)
      .where(
        and(
          eq(monitoringSchedules.workspaceId, context.workspaceId),
          eq(monitoringSchedules.websiteId, websiteId),
          isNull(monitoringSchedules.archivedAt),
        ),
      )
      .orderBy(monitoringSchedules.monitorKey);
    const runs = await tx
      .select()
      .from(monitoringRuns)
      .where(
        and(
          eq(monitoringRuns.workspaceId, context.workspaceId),
          eq(monitoringRuns.websiteId, websiteId),
        ),
      )
      .orderBy(desc(monitoringRuns.createdAt))
      .limit(6);
    const observations = await tx
      .select()
      .from(monitoringObservations)
      .where(
        and(
          eq(monitoringObservations.workspaceId, context.workspaceId),
          eq(monitoringObservations.websiteId, websiteId),
        ),
      )
      .orderBy(desc(monitoringObservations.observedAt))
      .limit(8);

    return { schedules, runs, observations };
  });
}

export async function getMonitoringOverview(
  context: WorkspaceContext,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const schedules = await tx
      .select({
        id: monitoringSchedules.id,
        monitorKey: monitoringSchedules.monitorKey,
        cadence: monitoringSchedules.cadence,
        enabled: monitoringSchedules.enabled,
        nextRunAt: monitoringSchedules.nextRunAt,
        lastRunAt: monitoringSchedules.lastRunAt,
        lastErrorSummary: monitoringSchedules.lastErrorSummary,
        websiteName: websites.displayName,
        websiteId: websites.id,
        clientName: clients.name,
      })
      .from(monitoringSchedules)
      .innerJoin(
        websites,
        and(
          eq(websites.workspaceId, monitoringSchedules.workspaceId),
          eq(websites.id, monitoringSchedules.websiteId),
        ),
      )
      .innerJoin(
        clients,
        and(
          eq(clients.workspaceId, monitoringSchedules.workspaceId),
          eq(clients.id, monitoringSchedules.clientId),
        ),
      )
      .where(
        and(
          eq(monitoringSchedules.workspaceId, context.workspaceId),
          isNull(monitoringSchedules.archivedAt),
        ),
      )
      .orderBy(monitoringSchedules.nextRunAt);
    const runs = await tx
      .select()
      .from(monitoringRuns)
      .where(eq(monitoringRuns.workspaceId, context.workspaceId))
      .orderBy(desc(monitoringRuns.createdAt))
      .limit(12);

    return { schedules, runs };
  });
}

export async function getMonitoringDashboardSummary(
  context: WorkspaceContext,
  database = db,
) {
  return withTenantContext(database, context, async (tx) => {
    const [due] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(monitoringSchedules)
      .where(
        and(
          eq(monitoringSchedules.workspaceId, context.workspaceId),
          eq(monitoringSchedules.enabled, true),
          isNull(monitoringSchedules.archivedAt),
          lte(monitoringSchedules.nextRunAt, sql`now()`),
        ),
      );
    const [failures] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(monitoringRuns)
      .where(
        and(
          eq(monitoringRuns.workspaceId, context.workspaceId),
          inArray(monitoringRuns.status, ["FAILED", "BUDGET_LIMITED", "TIMED_OUT"]),
        ),
      );
    const [searchConsoleErrors] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(monitoringSchedules)
      .where(
        and(
          eq(monitoringSchedules.workspaceId, context.workspaceId),
          eq(monitoringSchedules.monitorKey, SEARCH_CONSOLE_MONITOR_KEY),
          eq(monitoringSchedules.enabled, true),
          sql`${monitoringSchedules.lastErrorAt} is not null`,
        ),
      );
    const [searchConsoleDisconnected] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(monitoringSchedules)
      .leftJoin(
        searchConsoleProperties,
        and(
          eq(searchConsoleProperties.workspaceId, monitoringSchedules.workspaceId),
          eq(searchConsoleProperties.websiteId, monitoringSchedules.websiteId),
          eq(searchConsoleProperties.selected, true),
          isNull(searchConsoleProperties.archivedAt),
        ),
      )
      .where(
        and(
          eq(monitoringSchedules.workspaceId, context.workspaceId),
          eq(monitoringSchedules.monitorKey, SEARCH_CONSOLE_MONITOR_KEY),
          eq(monitoringSchedules.enabled, true),
          isNull(monitoringSchedules.archivedAt),
          sql`${searchConsoleProperties.id} is null`,
        ),
      );
    const [newProblems] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(monitoringObservations)
      .where(
        and(
          eq(monitoringObservations.workspaceId, context.workspaceId),
          inArray(monitoringObservations.status, ["WARNING", "FAIL", "ERROR"]),
          sql`${monitoringObservations.createdAt} >= now() - interval '7 days'`,
        ),
      );

    return {
      websitesDue: due?.count ?? 0,
      monitoringFailures: failures?.count ?? 0,
      searchConsoleSyncErrors: searchConsoleErrors?.count ?? 0,
      searchConsoleDisconnected: searchConsoleDisconnected?.count ?? 0,
      newMonitoringProblems: newProblems?.count ?? 0,
      version: MONITOR_DEFINITION_VERSION,
    };
  });
}

export async function listDueMonitoringScheduleRefs(
  limit = 25,
  database = db,
) {
  const result = await database.execute(sql`
    select workspace_id, schedule_id
    from public.bootstrap_due_monitoring_schedules(${limit})
  `);

  return (result as unknown as { rows?: { workspace_id: string; schedule_id: string }[] })
    .rows ?? [];
}

export async function requestScheduledMonitoringRun(
  workspaceId: string,
  scheduleId: string,
  database = db,
) {
  const systemContext: WorkspaceContext = {
    workspaceId,
    actorType: "SYSTEM",
    role: "ADMIN",
  };

  return withTenantContext(database, systemContext, async (tx) => {
    const [schedule] = await tx
      .select()
      .from(monitoringSchedules)
      .where(
        and(
          eq(monitoringSchedules.workspaceId, workspaceId),
          eq(monitoringSchedules.id, scheduleId),
          eq(monitoringSchedules.enabled, true),
          isNull(monitoringSchedules.archivedAt),
        ),
      )
      .limit(1);

    if (!schedule) return null;

    const [existing] = await tx
      .select()
      .from(monitoringRuns)
      .where(
        and(
          eq(monitoringRuns.workspaceId, workspaceId),
          eq(monitoringRuns.idempotencyKey, `${schedule.id}:scheduled:${schedule.nextRunAt?.toISOString() ?? "due"}`),
        ),
      )
      .limit(1);

    if (existing) {
      return { monitoringRunId: existing.id, shouldStartWorkflow: false, context: systemContext };
    }

    const [run] = await tx
      .insert(monitoringRuns)
      .values({
        workspaceId,
        monitoringScheduleId: schedule.id,
        clientId: schedule.clientId,
        websiteId: schedule.websiteId,
        monitorKey: schedule.monitorKey,
        monitorVersion: schedule.monitorVersion,
        triggerType: "SCHEDULE",
        status: "QUEUED",
        idempotencyKey: `${schedule.id}:scheduled:${schedule.nextRunAt?.toISOString() ?? "due"}`,
      })
      .returning();

    return { monitoringRunId: run.id, shouldStartWorkflow: true, context: systemContext };
  });
}
