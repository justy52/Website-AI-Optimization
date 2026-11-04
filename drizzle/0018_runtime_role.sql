-- Runtime credentials are provisioned separately. Never give this role ownership
-- or membership in neon_superuser (Console/API-created roles inherit it).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'virelantic_runtime') THEN
    CREATE ROLE virelantic_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS
      NOCREATEROLE NOCREATEDB NOREPLICATION NOINHERIT;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'virelantic_runtime'
    AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolinherit))
    OR EXISTS (SELECT FROM pg_auth_members WHERE member = 'virelantic_runtime'::regrole)
    OR EXISTS (SELECT FROM pg_class WHERE relowner = 'virelantic_runtime'::regrole)
    OR EXISTS (SELECT FROM pg_database WHERE datdba = 'virelantic_runtime'::regrole)
    OR EXISTS (SELECT FROM pg_namespace WHERE nspowner = 'virelantic_runtime'::regrole)
    OR EXISTS (SELECT FROM pg_proc WHERE proowner = 'virelantic_runtime'::regrole)
  THEN
    RAISE EXCEPTION 'Existing virelantic_runtime role is privileged; investigate before migration';
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO virelantic_runtime', current_database());
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO virelantic_runtime;
--> statement-breakpoint
-- Grant only the tenant tables present at this migration. New tables must be
-- reviewed and granted explicitly in their migration; no blanket default ACLs.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND (c.relname = 'workspaces' OR EXISTS (
        SELECT FROM pg_attribute a WHERE a.attrelid = c.oid
          AND a.attname = 'workspace_id' AND NOT a.attisdropped))
  LOOP
    IF NOT t.relrowsecurity OR NOT t.relforcerowsecurity THEN
      RAISE EXCEPTION 'Refusing runtime grant on tenant table without forced RLS: %', t.relname;
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO virelantic_runtime', t.relname);
  END LOOP;
END $$;
--> statement-breakpoint
-- Better Auth and its shared rate limiter run before workspace resolution.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public."user", public.account, public.session, public.verification,
  public.auth_rate_limits TO virelantic_runtime;
--> statement-breakpoint
GRANT SELECT ON TABLE public.service_plan_definitions, public.agent_definitions TO virelantic_runtime;
--> statement-breakpoint
-- The platform singleton has its own operator-only UPDATE policy, no INSERT/DELETE.
GRANT SELECT, UPDATE ON TABLE public.platform_operations TO virelantic_runtime;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.current_app_workspace_id(), public.current_app_user_id(),
  public.bootstrap_due_monitoring_schedules(integer),
  public.bootstrap_due_monthly_cycle_clients(integer),
  public.list_ai_visibility_site_refs(integer),
  public.list_retention_workspace_refs(integer) TO virelantic_runtime;
--> statement-breakpoint
-- Harden the two earlier definer helpers against writable search paths.
ALTER FUNCTION public.bootstrap_due_monitoring_schedules(integer) SET search_path = pg_catalog, public;
--> statement-breakpoint
ALTER FUNCTION public.bootstrap_due_monthly_cycle_clients(integer) SET search_path = pg_catalog, public;
