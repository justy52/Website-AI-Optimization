import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant";
import { assertWorkspaceRole, type WorkspaceContext } from "@/domain/tenancy/context";
import { OperationsValidationError, enforceActionRateLimit, operationalEvent } from "./operations";

// Table names and summary columns are a code-owned allowlist, never request input.
export const EXPORT_ENTITIES = ["clients", "websites", "audits", "audit_runs", "audit_findings", "audit_snapshots", "audit_category_scores", "opportunities", "monthly_cycles", "monthly_cycle_deliverables", "monthly_cycle_work_items", "reports", "monthly_reports", "agent_runs", "approval_requests", "execution_approvals", "execution_records", "implementation_packages", "manual_implementation_records", "implementation_verification_records", "ai_visibility_prompt_sets", "ai_visibility_prompts", "ai_visibility_runs", "ai_visibility_observations", "usage_ledger"] as const;
export function redactExport(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactExport);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !/(?:password|secret|ciphertext|encryption.?key|api.?key|access.?token|refresh.?token|session.?token|authorization|cookie)/i.test(key)).map(([key, item]) => [key, redactExport(item)]));
  return value;
}
export async function exportWorkspace(c: WorkspaceContext, requestedWorkspaceId = c.workspaceId, database = db) {
  assertWorkspaceRole(c, ["OWNER"]);
  if (c.actorType !== "USER" || !c.userId || requestedWorkspaceId !== c.workspaceId) throw new OperationsValidationError("Only the owner can export the current workspace.");
  await enforceActionRateLimit(c, "export", database);
  return withTenantContext(database, c, async tx => {
    // One SQL statement gives every entity the same PostgreSQL MVCC snapshot.
    const selections = EXPORT_ENTITIES.map(name => {
      const fields = name === "agent_runs" ? "id,workspace_id,client_id,website_id,agent_key,agent_version,permission_level,status,provider,model,created_at,completed_at,actual_model_calls,actual_tool_calls,actual_input_tokens,actual_output_tokens,actual_cost_cents" : "*";
      return sql`${name}::text,(select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb) from (select ${sql.raw(fields)} from ${sql.identifier(name)} where workspace_id=${c.workspaceId} order by to_jsonb(${sql.identifier(name)})::text limit 1001) r)`;
    });
    const result = await tx.execute(sql`select jsonb_build_object('workspace',(select jsonb_build_object('id',id,'name',name,'slug',slug) from workspaces where id=${c.workspaceId}),'exportedAt',now(),'data',jsonb_build_object(${sql.join(selections, sql`,`)})) as snapshot`);
    const snapshot = result.rows[0].snapshot as { workspace: unknown; exportedAt: string; data: Record<string, unknown[]> };
    if (!snapshot.workspace) throw new OperationsValidationError("Workspace not found.");
    if (Object.values(snapshot.data).some(rows => rows.length > 1000)) throw new OperationsValidationError("This workspace exceeds the V1 export limit of 1,000 rows per entity. Ask an operator for a scoped database export.");
    const payload = { exportVersion: "optiq-workspace-v1", schemaVersion: "0017", workspace: snapshot.workspace, exportedAt: snapshot.exportedAt, counts: Object.fromEntries(EXPORT_ENTITIES.map(name => [name, snapshot.data[name].length])), data: redactExport(snapshot.data) };
    const json = JSON.stringify(payload, null, 2);
    if (Buffer.byteLength(json, "utf8") > 10 * 1024 * 1024) throw new OperationsValidationError("Export exceeds the 10 MiB V1 limit. Ask an operator for a scoped database export.");
    await operationalEvent(tx, c, "operations.exported", { exportVersion: payload.exportVersion, counts: payload.counts });
    return payload;
  });
}
