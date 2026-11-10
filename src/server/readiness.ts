import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { serverEnv } from "@/lib/env";
import { enrollmentPolicy } from "@/auth/enrollment";

// Catalog/control checks only. Do not read customer records or make provider calls.
export async function productionReadiness(database = db) {
  const checks = {
    database: false,
    runtimeRole: false,
    tenantPolicies: false,
    automationControl: false,
    operatorConfigured: Boolean(serverEnv.PLATFORM_OPERATOR_USER_IDS?.trim()),
    enrollmentClosed: !enrollmentPolicy(serverEnv).signupEnabled,
    environment: serverEnv.APP_ENV === "production" && process.env.VERCEL_ENV === "production",
  };
  let automationPaused = true;
  try {
    const result = await database.transaction(async tx => {
      await tx.execute(sql`set local statement_timeout = '5s'`);
      return tx.execute(sql`select
        current_user = 'virelantic_runtime' and not (
          r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb
          or r.rolreplication or r.rolinherit
          or exists (select from pg_auth_members where member = r.oid)
          or exists (select from pg_class where relowner = r.oid and relnamespace = 'public'::regnamespace)
          or exists (select from pg_database where datdba = r.oid)
          or exists (select from pg_namespace where nspowner = r.oid)
          or exists (select from pg_proc where proowner = r.oid)
          or has_schema_privilege(current_user, 'public', 'CREATE')
          or has_database_privilege(current_user, current_database(), 'CREATE')
        ) as runtime_safe,
        exists (select from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname='workspaces' and c.relrowsecurity and c.relforcerowsecurity)
        and not exists (
          select from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relkind='r'
            and (c.relname='workspaces' or exists (select from pg_attribute a
              where a.attrelid=c.oid and a.attname='workspace_id' and not a.attisdropped))
            and (not c.relrowsecurity or not c.relforcerowsecurity)
        ) as tenant_policies,
        (select count(*)=1 from platform_operations where id='global') as control_exists,
        (select paused_all from platform_operations where id='global') as paused_all
        from pg_roles r where r.rolname=current_user`);
    });
    const row = result.rows[0];
    checks.database = true;
    checks.runtimeRole = row?.runtime_safe === true;
    checks.tenantPolicies = row?.tenant_policies === true;
    checks.automationControl = row?.control_exists === true;
    automationPaused = row?.paused_all !== false || serverEnv.AUTOMATION_EMERGENCY_STOP;
  } catch {
    // Errors may contain credentials, endpoints or SQL. Return only bounded flags.
  }
  return {
    ready: Object.values(checks).every(Boolean) && !automationPaused,
    checks,
    automationPaused,
  };
}
