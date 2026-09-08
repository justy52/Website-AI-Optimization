\set ON_ERROR_STOP on

-- Phase 1 live PostgreSQL RLS/bootstrap proof.
-- Run only against a disposable database after applying all migrations from zero.
-- Example:
--   psql "$OPTIQ_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/phase1-live-postgres-rls.sql

BEGIN;
INSERT INTO "user" ("id", "name", "email", "email_verified")
VALUES
  ('rls-user-a', 'RLS User A', 'rls-user-a@example.test', true),
  ('rls-user-b', 'RLS User B', 'rls-user-b@example.test', true);
COMMIT;

BEGIN;
DO $$
DECLARE
  role_record record;
  unforced_tables text[];
  owned_tables text[];
BEGIN
  SELECT rolname, rolsuper, rolbypassrls
  INTO role_record
  FROM pg_roles
  WHERE rolname = current_user;

  IF role_record.rolsuper OR role_record.rolbypassrls THEN
    RAISE EXCEPTION 'RLS proof role % bypasses RLS: rolsuper=%, rolbypassrls=%',
      role_record.rolname,
      role_record.rolsuper,
      role_record.rolbypassrls;
  END IF;

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
      ('workspace_feature_flags'),
      ('activity_events')
  )
  SELECT array_agg(c.relname ORDER BY c.relname)
  INTO unforced_tables
  FROM tenant_tables t
  JOIN pg_class c ON c.relname = t.name
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE NOT c.relrowsecurity OR NOT c.relforcerowsecurity;

  IF unforced_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Tenant tables are not forced under RLS: %', unforced_tables;
  END IF;

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
      ('workspace_feature_flags'),
      ('activity_events')
  )
  SELECT array_agg(c.relname ORDER BY c.relname)
  INTO owned_tables
  FROM tenant_tables t
  JOIN pg_class c ON c.relname = t.name
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_roles r ON r.oid = c.relowner
  WHERE r.rolname = current_user;

  IF owned_tables IS NOT NULL THEN
    RAISE EXCEPTION 'RLS proof role % owns tenant tables and is not a valid app-role proof: %',
      current_user,
      owned_tables;
  END IF;
END $$;
COMMIT;

BEGIN;
SELECT set_config('app.workspace_id', '00000000-0000-4000-8000-0000000000a1', true);
SELECT set_config('app.user_id', 'rls-user-a', true);
INSERT INTO "workspaces" ("id", "name", "slug")
VALUES ('00000000-0000-4000-8000-0000000000a1', 'Workspace A', 'rls-workspace-a');
INSERT INTO "workspace_memberships" ("workspace_id", "user_id", "role", "status")
VALUES ('00000000-0000-4000-8000-0000000000a1', 'rls-user-a', 'OWNER', 'ACTIVE');
INSERT INTO "leads" ("id", "workspace_id", "company_name", "status")
VALUES ('10000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 'Lead A', 'QUALIFIED');
INSERT INTO "clients" ("id", "workspace_id", "source_lead_id", "name")
VALUES ('20000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', 'Client A');
INSERT INTO "websites" ("id", "workspace_id", "client_id", "display_name", "canonical_url", "domain")
VALUES ('30000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', 'Website A', 'https://example-a.test/', 'example-a.test');
COMMIT;

BEGIN;
SELECT set_config('app.workspace_id', '00000000-0000-4000-8000-0000000000b1', true);
SELECT set_config('app.user_id', 'rls-user-a', true);
INSERT INTO "workspaces" ("id", "name", "slug")
VALUES ('00000000-0000-4000-8000-0000000000b1', 'Workspace B', 'rls-workspace-b');
INSERT INTO "workspace_memberships" ("workspace_id", "user_id", "role", "status")
VALUES ('00000000-0000-4000-8000-0000000000b1', 'rls-user-a', 'ADMIN', 'ACTIVE');
INSERT INTO "leads" ("id", "workspace_id", "company_name", "status")
VALUES ('10000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', 'Lead B', 'QUALIFIED');
INSERT INTO "clients" ("id", "workspace_id", "source_lead_id", "name")
VALUES ('20000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-0000000000b1', 'Client B');
INSERT INTO "websites" ("id", "workspace_id", "client_id", "display_name", "canonical_url", "domain")
VALUES ('30000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', 'Website B', 'https://example-b.test/', 'example-b.test');
INSERT INTO "audits" ("id", "workspace_id", "website_id", "title", "status")
VALUES ('40000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000b1', 'Audit B', 'READY_TO_FINALIZE');
INSERT INTO "audit_runs" ("id", "workspace_id", "audit_id", "website_id", "status")
VALUES ('50000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '40000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000b1', 'SUCCEEDED');
INSERT INTO "audit_evidence" ("id", "workspace_id", "audit_run_id", "evidence_type", "source_label")
VALUES ('51000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '50000000-0000-4000-8000-0000000000b1', 'HTML', 'Homepage HTML');
INSERT INTO "audit_check_results" ("id", "workspace_id", "audit_id", "audit_run_id", "check_key", "check_version", "category", "status", "severity", "max_penalty_weight", "reason")
VALUES ('52000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '40000000-0000-4000-8000-0000000000b1', '50000000-0000-4000-8000-0000000000b1', 'seo.title', 'seo.title@dv-score-v1.0', 'seo', 'FAIL', 'HIGH', 8, 'Fixture result');
INSERT INTO "audit_category_scores" ("workspace_id", "audit_run_id", "category", "score", "evidence_coverage_basis_points", "low_coverage", "applicable_max_penalty", "available_max_penalty", "actual_penalty_basis_points")
VALUES ('00000000-0000-4000-8000-0000000000b1', '50000000-0000-4000-8000-0000000000b1', 'seo', 92, 10000, false, 100, 100, 800);
INSERT INTO "audit_findings" ("id", "workspace_id", "audit_id", "audit_run_id", "check_result_id", "check_key", "severity", "title", "summary")
VALUES ('53000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '40000000-0000-4000-8000-0000000000b1', '50000000-0000-4000-8000-0000000000b1', '52000000-0000-4000-8000-0000000000b1', 'seo.title', 'HIGH', 'Title issue', 'Fixture finding');
INSERT INTO "audit_snapshots" ("id", "workspace_id", "audit_id", "audit_run_id", "scoring_definition_version", "check_catalog_version", "snapshot", "snapshot_hash")
VALUES ('54000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '40000000-0000-4000-8000-0000000000b1', '50000000-0000-4000-8000-0000000000b1', 'dv-score-v1.0', 'dv-score-v1.0', '{"fixture":true}'::jsonb, repeat('b', 64));
INSERT INTO "reports" ("id", "workspace_id", "audit_id", "audit_run_id", "audit_snapshot_id", "status", "title", "executive_summary", "methodology_version", "report_data")
VALUES ('60000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '40000000-0000-4000-8000-0000000000b1', '50000000-0000-4000-8000-0000000000b1', '54000000-0000-4000-8000-0000000000b1', 'DRAFT', 'Report B', 'Summary B', 'phase1-deterministic-v1.0', '{}'::jsonb);
INSERT INTO "integration_connections" ("id", "workspace_id", "client_id", "website_id", "provider", "connection_type", "scopes", "status")
VALUES ('70000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000b1', 'google_search_console', 'OAUTH', '["https://www.googleapis.com/auth/webmasters.readonly"]'::jsonb, 'CONNECTED');
INSERT INTO "integration_oauth_states" ("id", "workspace_id", "client_id", "website_id", "provider", "state_hash", "scopes", "created_by_user_id", "expires_at")
VALUES ('71000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000b1', 'google_search_console', repeat('b', 64), '["https://www.googleapis.com/auth/webmasters.readonly"]'::jsonb, 'rls-user-a', now() + interval '10 minutes');
INSERT INTO "integration_secrets" ("id", "workspace_id", "integration_connection_id", "secret_type", "algorithm", "key_version", "nonce", "ciphertext", "auth_tag")
VALUES ('72000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000b1', 'OAUTH_TOKEN', 'AES-256-GCM', 'test', 'nonce', 'ciphertext', 'tag');
UPDATE "integration_connections"
SET "secret_ref" = '72000000-0000-4000-8000-0000000000b1'
WHERE "id" = '70000000-0000-4000-8000-0000000000b1';
INSERT INTO "search_console_properties" ("id", "workspace_id", "integration_connection_id", "client_id", "website_id", "property_url", "property_type", "verified_site_match", "selected")
VALUES ('73000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000b1', 'sc-domain:example-b.test', 'DOMAIN', true, true);
INSERT INTO "search_console_observations" ("id", "workspace_id", "integration_connection_id", "search_console_property_id", "client_id", "website_id", "window_start_date", "window_end_date", "property_url", "query", "page", "clicks", "impressions", "ctr_basis_points", "average_position_basis_points")
VALUES ('74000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000b1', '73000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000b1', '2026-08-31', '2026-09-06', 'sc-domain:example-b.test', 'blocked query', 'https://example-b.test/', 1, 10, 1000, 123);
INSERT INTO "monitoring_schedules" ("id", "workspace_id", "client_id", "website_id", "monitor_key", "monitor_version", "cadence", "next_run_at")
VALUES ('75000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000b1', 'website_health', 'phase4a-monitor-v1.0', 'weekly', now());
INSERT INTO "monitoring_runs" ("id", "workspace_id", "monitoring_schedule_id", "client_id", "website_id", "audit_id", "audit_run_id", "monitor_key", "monitor_version", "trigger_type", "status", "idempotency_key")
VALUES ('76000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000b1', '40000000-0000-4000-8000-0000000000b1', '50000000-0000-4000-8000-0000000000b1', 'website_health', 'phase4a-monitor-v1.0', 'MANUAL', 'SUCCEEDED', 'workspace-b-run');
INSERT INTO "monitoring_observations" ("id", "workspace_id", "monitoring_run_id", "monitoring_schedule_id", "client_id", "website_id", "observation_key", "observation_type", "status", "summary")
VALUES ('77000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '76000000-0000-4000-8000-0000000000b1', '75000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000b1', 'seo.title', 'website_health_check', 'FAIL', 'Workspace B monitoring observation');
INSERT INTO "competitor_targets" ("id", "workspace_id", "client_id", "website_id", "name", "domain", "canonical_url")
VALUES ('78000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000b1', 'Competitor B', 'competitor-b.test', 'https://competitor-b.test/');
INSERT INTO "competitor_observations" ("id", "workspace_id", "competitor_target_id", "monitoring_run_id", "client_id", "website_id", "source_url", "content_hash", "change_summary")
VALUES ('79000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '78000000-0000-4000-8000-0000000000b1', '76000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000b1', 'https://competitor-b.test/', repeat('c', 64), 'Workspace B competitor observation');
COMMIT;

BEGIN;
SELECT set_config('app.workspace_id', '00000000-0000-4000-8000-0000000000c1', true);
SELECT set_config('app.user_id', 'rls-user-b', true);
INSERT INTO "workspaces" ("id", "name", "slug")
VALUES ('00000000-0000-4000-8000-0000000000c1', 'Workspace C', 'rls-workspace-c');
INSERT INTO "workspace_memberships" ("workspace_id", "user_id", "role", "status")
VALUES ('00000000-0000-4000-8000-0000000000c1', 'rls-user-b', 'OWNER', 'ACTIVE');
INSERT INTO "leads" ("id", "workspace_id", "company_name", "status")
VALUES ('10000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c1', 'Lead C', 'QUALIFIED');
COMMIT;

BEGIN;
SELECT set_config('app.workspace_id', '00000000-0000-4000-8000-0000000000d1', true);
SELECT set_config('app.user_id', 'rls-user-a', true);
INSERT INTO "workspaces" ("id", "name", "slug")
VALUES ('00000000-0000-4000-8000-0000000000d1', 'Workspace D', 'rls-workspace-d');
INSERT INTO "workspace_memberships" ("workspace_id", "user_id", "role", "status")
VALUES ('00000000-0000-4000-8000-0000000000d1', 'rls-user-a', 'ANALYST', 'INVITED');
COMMIT;

BEGIN;
SELECT set_config('app.workspace_id', '00000000-0000-4000-8000-0000000000e1', true);
SELECT set_config('app.user_id', 'rls-user-a', true);
INSERT INTO "workspaces" ("id", "name", "slug")
VALUES ('00000000-0000-4000-8000-0000000000e1', 'Workspace E', 'rls-workspace-e');
INSERT INTO "workspace_memberships" ("workspace_id", "user_id", "role", "status")
VALUES ('00000000-0000-4000-8000-0000000000e1', 'rls-user-a', 'ANALYST', 'SUSPENDED');
COMMIT;

BEGIN;
SELECT set_config('app.workspace_id', '00000000-0000-4000-8000-0000000000f1', true);
SELECT set_config('app.user_id', 'rls-user-a', true);
INSERT INTO "workspaces" ("id", "name", "slug", "archived_at")
VALUES ('00000000-0000-4000-8000-0000000000f1', 'Workspace F', 'rls-workspace-f', now());
INSERT INTO "workspace_memberships" ("workspace_id", "user_id", "role", "status")
VALUES ('00000000-0000-4000-8000-0000000000f1', 'rls-user-a', 'ANALYST', 'ACTIVE');
COMMIT;

BEGIN;
SELECT set_config('app.workspace_id', '00000000-0000-4000-8000-000000000091', true);
SELECT set_config('app.user_id', 'rls-user-a', true);
INSERT INTO "workspaces" ("id", "name", "slug", "deletion_pending_at")
VALUES ('00000000-0000-4000-8000-000000000091', 'Workspace G', 'rls-workspace-g', now());
INSERT INTO "workspace_memberships" ("workspace_id", "user_id", "role", "status")
VALUES ('00000000-0000-4000-8000-000000000091', 'rls-user-a', 'ANALYST', 'ACTIVE');
COMMIT;

BEGIN;
DO $$
DECLARE
  visible_count integer;
BEGIN
  SELECT count(*)
  INTO visible_count
  FROM "workspace_memberships" wm
  INNER JOIN "workspaces" w ON w.id = wm.workspace_id
  WHERE wm.status = 'ACTIVE'
    AND w.archived_at IS NULL
    AND w.deletion_pending_at IS NULL;

  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'Bootstrap without app.user_id exposed % workspaces.', visible_count;
  END IF;
END $$;
COMMIT;

BEGIN;
SELECT set_config('app.user_id', 'rls-user-a', true);
DO $$
DECLARE
  visible_slugs text[];
  fabricated_count integer;
BEGIN
  SELECT array_agg(w.slug ORDER BY w.slug)
  INTO visible_slugs
  FROM "workspace_memberships" wm
  INNER JOIN "workspaces" w ON w.id = wm.workspace_id
  WHERE wm.user_id = 'rls-user-a'
    AND wm.status = 'ACTIVE'
    AND w.archived_at IS NULL
    AND w.deletion_pending_at IS NULL;

  IF visible_slugs IS DISTINCT FROM ARRAY['rls-workspace-a', 'rls-workspace-b'] THEN
    RAISE EXCEPTION 'Unexpected bootstrap workspaces for user A: %', visible_slugs;
  END IF;

  SELECT count(*) INTO fabricated_count
  FROM "workspace_memberships" wm
  INNER JOIN "workspaces" w ON w.id = wm.workspace_id
  WHERE wm.user_id = 'rls-user-a'
    AND wm.status = 'ACTIVE'
    AND wm.workspace_id = '99999999-0000-4000-8000-000000000999';

  IF fabricated_count <> 0 THEN
    RAISE EXCEPTION 'Fabricated workspace id unexpectedly resolved during bootstrap.';
  END IF;
END $$;
COMMIT;

BEGIN;
SELECT set_config('app.user_id', 'rls-user-b', true);
DO $$
DECLARE
  visible_slugs text[];
BEGIN
  SELECT array_agg(w.slug ORDER BY w.slug)
  INTO visible_slugs
  FROM "workspace_memberships" wm
  INNER JOIN "workspaces" w ON w.id = wm.workspace_id
  WHERE wm.user_id = 'rls-user-b'
    AND wm.status = 'ACTIVE'
    AND w.archived_at IS NULL
    AND w.deletion_pending_at IS NULL;

  IF visible_slugs IS DISTINCT FROM ARRAY['rls-workspace-c'] THEN
    RAISE EXCEPTION 'Unexpected bootstrap workspaces for user B: %', visible_slugs;
  END IF;
END $$;
COMMIT;

BEGIN;
SELECT set_config('app.workspace_id', '00000000-0000-4000-8000-0000000000a1', true);
SELECT set_config('app.user_id', 'rls-user-a', true);
DO $$
DECLARE
  own_leads integer;
  other_leads integer;
  changed_rows integer;
  other_audits integer;
  other_audit_runs integer;
  other_audit_evidence integer;
  other_audit_check_results integer;
  other_audit_findings integer;
  other_audit_snapshots integer;
  other_reports integer;
  other_integration_connections integer;
  other_integration_oauth_states integer;
  other_integration_secrets integer;
  other_search_console_properties integer;
  other_search_console_observations integer;
  other_monitoring_schedules integer;
  other_monitoring_runs integer;
  other_monitoring_observations integer;
  other_competitor_targets integer;
  other_competitor_observations integer;
BEGIN
  SELECT count(*) INTO own_leads
  FROM "leads"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000a1';

  IF own_leads <> 1 THEN
    RAISE EXCEPTION 'Workspace A should read its own lead, saw %', own_leads;
  END IF;

  INSERT INTO "leads" ("id", "workspace_id", "company_name", "status")
  VALUES ('10000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000a1', 'Lead A Insert', 'NEW');

  UPDATE "leads"
  SET "notes" = 'Workspace A update'
  WHERE "id" = '10000000-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 1 THEN
    RAISE EXCEPTION 'Workspace A update should affect one row, affected %', changed_rows;
  END IF;

  INSERT INTO "integration_connections" ("id", "workspace_id", "client_id", "website_id", "provider", "connection_type", "scopes", "status")
  VALUES ('70000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000a1', 'google_search_console', 'OAUTH', '["https://www.googleapis.com/auth/webmasters.readonly"]'::jsonb, 'CONNECTED');
  INSERT INTO "integration_oauth_states" ("id", "workspace_id", "client_id", "website_id", "provider", "state_hash", "scopes", "created_by_user_id", "expires_at")
  VALUES ('71000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000a1', 'google_search_console', repeat('a', 64), '["https://www.googleapis.com/auth/webmasters.readonly"]'::jsonb, 'rls-user-a', now() + interval '10 minutes');
  INSERT INTO "integration_secrets" ("id", "workspace_id", "integration_connection_id", "secret_type", "algorithm", "key_version", "nonce", "ciphertext", "auth_tag")
  VALUES ('72000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '70000000-0000-4000-8000-0000000000a1', 'OAUTH_TOKEN', 'AES-256-GCM', 'test', 'nonce', 'ciphertext', 'tag');
  INSERT INTO "search_console_properties" ("id", "workspace_id", "integration_connection_id", "client_id", "website_id", "property_url", "property_type", "verified_site_match", "selected")
  VALUES ('73000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '70000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000a1', 'sc-domain:example-a.test', 'DOMAIN', true, true);
  INSERT INTO "search_console_observations" ("id", "workspace_id", "integration_connection_id", "search_console_property_id", "client_id", "website_id", "window_start_date", "window_end_date", "property_url", "query", "page", "clicks", "impressions", "ctr_basis_points", "average_position_basis_points")
  VALUES ('74000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '70000000-0000-4000-8000-0000000000a1', '73000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000a1', '2026-08-31', '2026-09-06', 'sc-domain:example-a.test', 'own query', 'https://example-a.test/', 2, 20, 1000, 123);
  INSERT INTO "monitoring_schedules" ("id", "workspace_id", "client_id", "website_id", "monitor_key", "monitor_version", "cadence", "next_run_at")
  VALUES ('75000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000a1', 'website_health', 'phase4a-monitor-v1.0', 'weekly', now());
  INSERT INTO "monitoring_runs" ("id", "workspace_id", "monitoring_schedule_id", "client_id", "website_id", "monitor_key", "monitor_version", "trigger_type", "status", "idempotency_key")
  VALUES ('76000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000a1', 'website_health', 'phase4a-monitor-v1.0', 'MANUAL', 'SUCCEEDED', 'workspace-a-run');
  INSERT INTO "monitoring_observations" ("id", "workspace_id", "monitoring_run_id", "monitoring_schedule_id", "client_id", "website_id", "observation_key", "observation_type", "status", "summary")
  VALUES ('77000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '76000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000a1', 'seo.title', 'website_health_check', 'PASS', 'Workspace A monitoring observation');
  INSERT INTO "competitor_targets" ("id", "workspace_id", "client_id", "website_id", "name", "domain", "canonical_url")
  VALUES ('78000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000a1', 'Competitor A', 'competitor-a.test', 'https://competitor-a.test/');
  INSERT INTO "competitor_observations" ("id", "workspace_id", "competitor_target_id", "monitoring_run_id", "client_id", "website_id", "source_url", "content_hash", "change_summary")
  VALUES ('79000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '78000000-0000-4000-8000-0000000000a1', '76000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000a1', 'https://competitor-a.test/', repeat('d', 64), 'Workspace A competitor observation');

  SELECT count(*) INTO other_leads
  FROM "leads"
  WHERE workspace_id IN (
    '00000000-0000-4000-8000-0000000000b1',
    '00000000-0000-4000-8000-0000000000c1'
  );

  IF other_leads <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read other workspace leads, saw %', other_leads;
  END IF;

  UPDATE "leads"
  SET "notes" = 'cross-workspace mutation'
  WHERE "id" = '10000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Workspace A mutated Workspace B leads.';
  END IF;

  DELETE FROM "leads"
  WHERE "id" = '10000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Workspace A deleted Workspace B leads.';
  END IF;

  SELECT count(*) INTO other_audits
  FROM "audits"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';

  IF other_audits <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read Workspace B audits, saw %', other_audits;
  END IF;

  SELECT count(*) INTO other_audit_runs
  FROM "audit_runs"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';

  IF other_audit_runs <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read Workspace B audit runs, saw %', other_audit_runs;
  END IF;

  SELECT count(*) INTO other_audit_evidence
  FROM "audit_evidence"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';

  IF other_audit_evidence <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read Workspace B evidence, saw %', other_audit_evidence;
  END IF;

  SELECT count(*) INTO other_audit_check_results
  FROM "audit_check_results"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';

  IF other_audit_check_results <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read Workspace B check results, saw %', other_audit_check_results;
  END IF;

  SELECT count(*) INTO other_audit_findings
  FROM "audit_findings"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';

  IF other_audit_findings <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read Workspace B findings, saw %', other_audit_findings;
  END IF;

  SELECT count(*) INTO other_audit_snapshots
  FROM "audit_snapshots"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';

  IF other_audit_snapshots <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read Workspace B snapshots, saw %', other_audit_snapshots;
  END IF;

  UPDATE "audits"
  SET "title" = 'cross-workspace audit mutation'
  WHERE "id" = '40000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Workspace A mutated Workspace B audits.';
  END IF;

  UPDATE "audit_runs"
  SET "status" = 'FAILED'
  WHERE "id" = '50000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Workspace A mutated Workspace B audit runs.';
  END IF;

  UPDATE "audit_evidence"
  SET "source_label" = 'cross-workspace evidence mutation'
  WHERE "id" = '51000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Workspace A mutated Workspace B audit evidence.';
  END IF;

  UPDATE "audit_check_results"
  SET "reason" = 'cross-workspace check mutation'
  WHERE "id" = '52000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Workspace A mutated Workspace B check results.';
  END IF;

  UPDATE "audit_findings"
  SET "summary" = 'cross-workspace finding mutation'
  WHERE "id" = '53000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Workspace A mutated Workspace B findings.';
  END IF;

  DELETE FROM "audit_snapshots"
  WHERE "id" = '54000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Workspace A deleted Workspace B snapshots.';
  END IF;

  SELECT count(*) INTO other_reports
  FROM "reports"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';

  IF other_reports <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read Workspace B reports, saw %', other_reports;
  END IF;

  SELECT count(*) INTO other_integration_connections
  FROM "integration_connections"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';

  IF other_integration_connections <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read Workspace B integration connections, saw %', other_integration_connections;
  END IF;

  SELECT count(*) INTO other_integration_oauth_states
  FROM "integration_oauth_states"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';

  IF other_integration_oauth_states <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read Workspace B OAuth states, saw %', other_integration_oauth_states;
  END IF;

  SELECT count(*) INTO other_integration_secrets
  FROM "integration_secrets"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';

  IF other_integration_secrets <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read Workspace B integration secrets, saw %', other_integration_secrets;
  END IF;

  SELECT count(*) INTO other_search_console_properties
  FROM "search_console_properties"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';

  IF other_search_console_properties <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read Workspace B Search Console properties, saw %', other_search_console_properties;
  END IF;

  SELECT count(*) INTO other_search_console_observations
  FROM "search_console_observations"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';

  IF other_search_console_observations <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read Workspace B Search Console observations, saw %', other_search_console_observations;
  END IF;

  SELECT count(*) INTO other_monitoring_schedules
  FROM "monitoring_schedules"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';

  IF other_monitoring_schedules <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read Workspace B monitoring schedules, saw %', other_monitoring_schedules;
  END IF;

  SELECT count(*) INTO other_monitoring_runs
  FROM "monitoring_runs"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';

  IF other_monitoring_runs <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read Workspace B monitoring runs, saw %', other_monitoring_runs;
  END IF;

  SELECT count(*) INTO other_monitoring_observations
  FROM "monitoring_observations"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';

  IF other_monitoring_observations <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read Workspace B monitoring observations, saw %', other_monitoring_observations;
  END IF;

  SELECT count(*) INTO other_competitor_targets
  FROM "competitor_targets"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';

  IF other_competitor_targets <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read Workspace B competitor targets, saw %', other_competitor_targets;
  END IF;

  SELECT count(*) INTO other_competitor_observations
  FROM "competitor_observations"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';

  IF other_competitor_observations <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read Workspace B competitor observations, saw %', other_competitor_observations;
  END IF;

  UPDATE "reports"
  SET "title" = 'cross-workspace report mutation'
  WHERE "id" = '60000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Workspace A mutated Workspace B reports.';
  END IF;

  UPDATE "integration_connections"
  SET "last_error_summary" = 'cross-workspace integration mutation'
  WHERE "id" = '70000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Workspace A mutated Workspace B integration connections.';
  END IF;

  UPDATE "integration_secrets"
  SET "ciphertext" = 'cross-workspace secret mutation'
  WHERE "id" = '72000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Workspace A mutated Workspace B integration secrets.';
  END IF;

  UPDATE "search_console_properties"
  SET "selected" = false
  WHERE "id" = '73000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Workspace A mutated Workspace B Search Console properties.';
  END IF;

  UPDATE "monitoring_runs"
  SET "status" = 'FAILED'
  WHERE "id" = '76000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Workspace A mutated Workspace B monitoring runs.';
  END IF;

  UPDATE "competitor_targets"
  SET "notes" = 'cross-workspace competitor mutation'
  WHERE "id" = '78000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Workspace A mutated Workspace B competitor targets.';
  END IF;
END $$;
COMMIT;

BEGIN;
SELECT set_config('app.workspace_id', '00000000-0000-4000-8000-0000000000a1', true);
SELECT set_config('app.user_id', 'rls-user-a', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO "leads" ("id", "workspace_id", "company_name", "status")
    VALUES ('10000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000b1', 'Blocked Lead', 'NEW');
    RAISE EXCEPTION 'Workspace A inserted a Workspace B lead.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO "clients" ("id", "workspace_id", "source_lead_id", "name")
    VALUES ('20000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000b1', 'Blocked Client');
    RAISE EXCEPTION 'Workspace A linked a client to Workspace B lead.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "websites" ("id", "workspace_id", "client_id", "display_name", "canonical_url", "domain")
    VALUES ('30000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000b1', 'Blocked Website', 'https://blocked.example.test/', 'blocked.example.test');
    RAISE EXCEPTION 'Workspace A linked a website to Workspace B client.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "audits" ("id", "workspace_id", "website_id", "title", "status")
    VALUES ('40000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000b1', 'Blocked Audit', 'DRAFT');
    RAISE EXCEPTION 'Workspace A linked an audit to Workspace B website.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "reports" ("id", "workspace_id", "audit_id", "audit_run_id", "audit_snapshot_id", "status", "title", "executive_summary", "methodology_version", "report_data")
    VALUES ('60000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1', '40000000-0000-4000-8000-0000000000b1', '50000000-0000-4000-8000-0000000000b1', '54000000-0000-4000-8000-0000000000b1', 'DRAFT', 'Blocked Report', 'Blocked', 'phase1-deterministic-v1.0', '{}'::jsonb);
    RAISE EXCEPTION 'Workspace A linked a report to Workspace B audit/run/snapshot.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "integration_connections" ("id", "workspace_id", "client_id", "website_id", "provider", "connection_type", "scopes", "status")
    VALUES ('70000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000b1', 'google_search_console', 'OAUTH', '[]'::jsonb, 'CONNECTED');
    RAISE EXCEPTION 'Workspace A inserted a Workspace B integration connection.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO "integration_secrets" ("id", "workspace_id", "integration_connection_id", "secret_type", "algorithm", "key_version", "nonce", "ciphertext", "auth_tag")
    VALUES ('72000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1', '70000000-0000-4000-8000-0000000000b1', 'OAUTH_TOKEN', 'AES-256-GCM', 'test', 'nonce', 'ciphertext', 'tag');
    RAISE EXCEPTION 'Workspace A linked an integration secret to Workspace B connection.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "search_console_properties" ("id", "workspace_id", "integration_connection_id", "client_id", "website_id", "property_url", "property_type")
    VALUES ('73000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1', '70000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000a1', 'sc-domain:blocked.test', 'DOMAIN');
    RAISE EXCEPTION 'Workspace A linked a Search Console property to Workspace B connection.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "search_console_observations" ("id", "workspace_id", "integration_connection_id", "search_console_property_id", "client_id", "website_id", "window_start_date", "window_end_date", "property_url")
    VALUES ('74000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1', '70000000-0000-4000-8000-0000000000b1', '73000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000a1', '2026-08-31', '2026-09-06', 'sc-domain:blocked.test');
    RAISE EXCEPTION 'Workspace A linked a Search Console observation to Workspace B provider records.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "monitoring_schedules" ("id", "workspace_id", "client_id", "website_id", "monitor_key", "monitor_version", "cadence")
    VALUES ('75000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000b1', 'website_health', 'phase4a-monitor-v1.0', 'weekly');
    RAISE EXCEPTION 'Workspace A linked a monitoring schedule to Workspace B website.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "monitoring_runs" ("id", "workspace_id", "monitoring_schedule_id", "client_id", "website_id", "monitor_key", "monitor_version", "trigger_type", "idempotency_key")
    VALUES ('76000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1', '75000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000a1', 'website_health', 'phase4a-monitor-v1.0', 'MANUAL', 'blocked-run');
    RAISE EXCEPTION 'Workspace A linked a monitoring run to Workspace B schedule.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "monitoring_observations" ("id", "workspace_id", "monitoring_run_id", "client_id", "website_id", "observation_key", "observation_type", "status", "summary")
    VALUES ('77000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1', '76000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000a1', 'seo.title', 'website_health_check', 'FAIL', 'Blocked observation');
    RAISE EXCEPTION 'Workspace A linked a monitoring observation to Workspace B run.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "competitor_targets" ("id", "workspace_id", "client_id", "website_id", "name", "domain", "canonical_url")
    VALUES ('78000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000b1', 'Blocked Competitor', 'blocked-competitor.test', 'https://blocked-competitor.test/');
    RAISE EXCEPTION 'Workspace A linked a competitor target to Workspace B website.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "competitor_observations" ("id", "workspace_id", "competitor_target_id", "client_id", "website_id", "source_url", "content_hash", "change_summary")
    VALUES ('79000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1', '78000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000a1', 'https://blocked-competitor.test/', repeat('e', 64), 'Blocked observation');
    RAISE EXCEPTION 'Workspace A linked a competitor observation to Workspace B target.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;
END $$;
COMMIT;

BEGIN;
SELECT set_config('app.workspace_id', '00000000-0000-4000-8000-0000000000b1', true);
SELECT set_config('app.user_id', 'rls-user-a', true);
DO $$
DECLARE
  lead_notes text;
BEGIN
  SELECT notes INTO lead_notes
  FROM "leads"
  WHERE id = '10000000-0000-4000-8000-0000000000b1';

  IF lead_notes IS NOT NULL THEN
    RAISE EXCEPTION 'Workspace B lead was mutated across tenants: %', lead_notes;
  END IF;
END $$;
COMMIT;

SELECT 'phase1_live_postgres_rls_ok' AS result;
