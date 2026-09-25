import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agentRuns, monitoringRuns, aiVisibilityRuns, operationalNotifications } from "@/db/schema";
import { withTenantContext } from "@/db/tenant";
import { assertWorkspaceRole, type WorkspaceContext } from "@/domain/tenancy/context";
import { OperationsValidationError, enforceActionRateLimit, operationalEvent } from "./operations";
import { requestPrepareDraftForOpportunity } from "./agents";
import { requestManualMonitoringRun } from "./monitoring";
import { requestImplementationVerification } from "./verification";

export async function recoverInternalRun(c: WorkspaceContext, input: { kind: "prepare" | "monitor" | "verification" | "visibility"; id: string; mode: "retry" | "review"; reason: string }, database = db) {
  assertWorkspaceRole(c, ["OWNER", "ADMIN"]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id)) throw new OperationsValidationError("Invalid run ID.");
  if (c.actorType !== "USER" || !c.userId || !input.reason.trim() || input.reason.length > 500) throw new OperationsValidationError("A human recovery reason is required.");
  await enforceActionRateLimit(c, "recovery", database);
  const target = await withTenantContext(database, c, async tx => {
    const table = input.kind === "monitor" ? monitoringRuns : input.kind === "visibility" ? aiVisibilityRuns : agentRuns;
    const [row] = await tx.select().from(table).where(and(eq(table.workspaceId, c.workspaceId), eq(table.id, input.id))).limit(1);
    if (!row) throw new OperationsValidationError("Run not found in this workspace.");
    if (input.mode === "review") {
      await tx.insert(operationalNotifications).values({ workspaceId: c.workspaceId, type: "operations.manual_review", severity: "HIGH", title: "Run needs manual recovery review", summary: input.reason, resourceType: input.kind, resourceId: input.id });
      await operationalEvent(tx, c, "operations.manual_review", { ...input, status: row.status });
      return null;
    }
    if (!["FAILED", "TIMED_OUT", "BUDGET_LIMITED", "CANCELED"].includes(row.status)) throw new OperationsValidationError("Only a terminal failed internal run can be retried. Mark stuck or indeterminate work for manual review.");
    if (input.kind === "visibility" || ("provider" in row && row.provider !== "deterministic") || ("permissionLevel" in row && row.permissionLevel === "EXECUTE")) throw new OperationsValidationError("Paid, indeterminate and execution attempts require manual review. Automatic recovery is prohibited.", "MANUAL_REVIEW");
    if (input.kind === "monitor" && "monitorKey" in row && row.monitorKey !== "website_health") throw new OperationsValidationError("Only the read-only website-health monitor supports automatic recovery.");
    if ("agentKey" in row && ((input.kind === "verification") !== (row.agentKey === "verification"))) throw new OperationsValidationError("Recovery kind does not match the run.");
    // A recovery event preserves the original terminal record; a new attempt uses normal policy.
    await operationalEvent(tx, c, "operations.recovery_requested", input);
    return row;
  });
  if (!target) return { kind: "review" as const };
  if (input.kind === "monitor") {
    const next = await requestManualMonitoringRun(c, target.websiteId!, "website_health", database);
    return { kind: "monitor" as const, id: next.monitoringRunId, shouldStartWorkflow: next.shouldStartWorkflow };
  }
  if (!("inputSummary" in target)) throw new OperationsValidationError("Invalid recovery target.");
  if (input.kind === "verification") {
    const next = await requestImplementationVerification(c, String(target.inputSummary.implementationRecordId), database);
    return { kind: "verification" as const, id: next.agentRunId, shouldStartWorkflow: next.shouldStartWorkflow };
  }
  // Do not allow a provider configuration change to turn a free recovery into paid work.
  const { serverEnv } = await import("@/lib/env");
  if (serverEnv.AGENT_PROVIDER !== "deterministic") throw new OperationsValidationError("Deterministic PREPARE recovery requires the deterministic provider configuration.");
  const next = await requestPrepareDraftForOpportunity(c, target.opportunityId!, database);
  return { kind: "prepare" as const, id: next.agentRunId, shouldStartWorkflow: next.shouldStartWorkflow };
}
