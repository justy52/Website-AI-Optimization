import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "@neondatabase/serverless";

const connectionString =
  process.env.OPTIQ_TEST_DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL_UNPOOLED;

if (!connectionString) {
  throw new Error(
    "Set OPTIQ_TEST_DATABASE_URL to a disposable PostgreSQL database before running live RLS validation.",
  );
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(scriptDir, "phase1-live-postgres-rls.sql"), "utf8")
  .split(/\r?\n/)
  .filter((line) => !line.trimStart().startsWith("\\"))
  .join("\n");

const roleValidationSql = `
  WITH tenant_tables(name) AS (
    VALUES
      ('workspaces'),
      ('workspace_memberships'),
      ('leads'),
      ('clients'),
      ('websites'),
      ('audits'),
      ('audit_runs'),
      ('audit_evidence'),
      ('audit_check_results'),
      ('audit_category_scores'),
      ('audit_findings'),
      ('audit_snapshots'),
      ('opportunities'),
      ('work_plan_cycles'),
      ('work_plan_items'),
      ('agent_runs'),
      ('agent_tool_calls'),
      ('client_knowledge_sources'),
      ('business_facts'),
      ('claim_policies'),
      ('draft_artifacts'),
      ('approval_requests'),
      ('operational_notifications'),
      ('reports'),
      ('approval_policies'),
      ('integration_connections'),
      ('integration_oauth_states'),
      ('integration_secrets'),
      ('search_console_properties'),
      ('search_console_observations'),
      ('monitoring_schedules'),
      ('monitoring_runs'),
      ('monitoring_observations'),
      ('competitor_targets'),
      ('competitor_observations'),
      ('monthly_cycles'),
      ('monthly_cycle_deliverables'),
      ('monthly_cycle_work_items'),
      ('manual_implementation_records'),
      ('implementation_verification_records'),
      ('monthly_reports'),
      ('workspace_feature_flags'),
      ('activity_events')
  )
  SELECT
    current_user,
    session_user,
    r.rolsuper,
    r.rolbypassrls,
    count(c.*) FILTER (WHERE pg_get_userbyid(c.relowner) = current_user) AS owned_tenant_tables,
    bool_and(c.relrowsecurity) AS all_rls_enabled,
    bool_and(c.relforcerowsecurity) AS all_rls_forced
  FROM pg_roles r
  CROSS JOIN tenant_tables t
  JOIN pg_class c ON c.relname = t.name
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE r.rolname = current_user
  GROUP BY current_user, session_user, r.rolsuper, r.rolbypassrls;
`;

const pool = new Pool({ connectionString });
const client = await pool.connect();

try {
  const roleValidation = await client.query(roleValidationSql);
  const role = roleValidation.rows[0];

  console.log(`role_validation=${JSON.stringify(role)}`);

  if (!role) {
    throw new Error("Unable to validate the current PostgreSQL role.");
  }

  if (role.rolsuper || role.rolbypassrls) {
    throw new Error(
      `Refusing to run RLS validation with a bypassing role: ${JSON.stringify(role)}`,
    );
  }

  if (!role.all_rls_enabled || !role.all_rls_forced) {
    throw new Error(
      `Refusing to run RLS validation without forced tenant-table RLS: ${JSON.stringify(role)}`,
    );
  }

  await client.query(sql);
  console.log("phase1_live_postgres_rls_ok");
} finally {
  client.release();
  await pool.end();
}
