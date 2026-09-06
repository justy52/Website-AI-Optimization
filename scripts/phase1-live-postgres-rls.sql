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
INSERT INTO "reports" ("id", "workspace_id", "audit_id", "audit_run_id", "status", "title", "executive_summary", "methodology_version", "report_data")
VALUES ('60000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '40000000-0000-4000-8000-0000000000b1', '50000000-0000-4000-8000-0000000000b1', 'DRAFT', 'Report B', 'Summary B', 'phase1-deterministic-v1.0', '{}'::jsonb);
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
SELECT set_config('app.workspace_id', '00000000-0000-4000-8000-0000000000g1', true);
SELECT set_config('app.user_id', 'rls-user-a', true);
INSERT INTO "workspaces" ("id", "name", "slug", "deletion_pending_at")
VALUES ('00000000-0000-4000-8000-0000000000g1', 'Workspace G', 'rls-workspace-g', now());
INSERT INTO "workspace_memberships" ("workspace_id", "user_id", "role", "status")
VALUES ('00000000-0000-4000-8000-0000000000g1', 'rls-user-a', 'ANALYST', 'ACTIVE');
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
  other_reports integer;
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

  SELECT count(*) INTO other_audits
  FROM "audits"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';

  IF other_audits <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read Workspace B audits, saw %', other_audits;
  END IF;

  UPDATE "audits"
  SET "title" = 'cross-workspace audit mutation'
  WHERE "id" = '40000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Workspace A mutated Workspace B audits.';
  END IF;

  SELECT count(*) INTO other_reports
  FROM "reports"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';

  IF other_reports <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read Workspace B reports, saw %', other_reports;
  END IF;

  UPDATE "reports"
  SET "title" = 'cross-workspace report mutation'
  WHERE "id" = '60000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Workspace A mutated Workspace B reports.';
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
    INSERT INTO "reports" ("id", "workspace_id", "audit_id", "audit_run_id", "status", "title", "executive_summary", "methodology_version", "report_data")
    VALUES ('60000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1', '40000000-0000-4000-8000-0000000000b1', '50000000-0000-4000-8000-0000000000b1', 'DRAFT', 'Blocked Report', 'Blocked', 'phase1-deterministic-v1.0', '{}'::jsonb);
    RAISE EXCEPTION 'Workspace A linked a report to Workspace B audit/run.';
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
