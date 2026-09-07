\set ON_ERROR_STOP on

-- Phase 2 live PostgreSQL RLS/opportunity proof.
-- Run only after all migrations and the Phase 1 live proof have been applied
-- to a disposable database.

BEGIN;
DO $$
DECLARE
  role_record record;
  unforced_tables text[];
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
      ('opportunities'),
      ('work_plan_cycles'),
      ('work_plan_items')
  )
  SELECT array_agg(c.relname ORDER BY c.relname)
  INTO unforced_tables
  FROM tenant_tables t
  JOIN pg_class c ON c.relname = t.name
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE NOT c.relrowsecurity OR NOT c.relforcerowsecurity;

  IF unforced_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Phase 2 tenant tables are not forced under RLS: %', unforced_tables;
  END IF;
END $$;
COMMIT;

BEGIN;
SELECT set_config('app.workspace_id', '00000000-0000-4000-8000-0000000000a1', true);
SELECT set_config('app.user_id', 'rls-user-a', true);
INSERT INTO "audits" ("id", "workspace_id", "website_id", "title", "status")
VALUES ('40000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000a1', 'Audit A', 'READY_TO_FINALIZE');
INSERT INTO "audit_runs" ("id", "workspace_id", "audit_id", "website_id", "status")
VALUES ('50000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '40000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000a1', 'SUCCEEDED');
INSERT INTO "audit_evidence" ("id", "workspace_id", "audit_run_id", "check_key", "evidence_type", "source_label")
VALUES ('51000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '50000000-0000-4000-8000-0000000000a1', 'seo.title', 'HTML', 'Homepage HTML');
INSERT INTO "audit_check_results" ("id", "workspace_id", "audit_id", "audit_run_id", "check_key", "check_version", "category", "status", "severity", "evidence_confidence", "max_penalty_weight", "reason", "evidence_refs")
VALUES ('52000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '40000000-0000-4000-8000-0000000000a1', '50000000-0000-4000-8000-0000000000a1', 'seo.title', 'seo.title@dv-score-v1.0', 'seo', 'FAIL', 'HIGH', 'HIGH', 8, 'Fixture result', '["51000000-0000-4000-8000-0000000000a1"]'::jsonb);
INSERT INTO "audit_findings" ("id", "workspace_id", "audit_id", "audit_run_id", "check_result_id", "check_key", "severity", "title", "summary", "evidence_refs")
VALUES ('53000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '40000000-0000-4000-8000-0000000000a1', '50000000-0000-4000-8000-0000000000a1', '52000000-0000-4000-8000-0000000000a1', 'seo.title', 'HIGH', 'Title issue A', 'Fixture finding A', '["51000000-0000-4000-8000-0000000000a1"]'::jsonb);
INSERT INTO "opportunities" (
  "id", "workspace_id", "client_id", "website_id", "source_audit_id",
  "source_audit_run_id", "source_finding_id", "source_check_result_id",
  "source_check_key", "source_check_version", "source_result_status",
  "source_severity", "source_evidence_refs", "evidence_confidence", "category",
  "normalized_remediation_family", "title", "summary", "recommended_action",
  "status", "impact", "confidence", "urgency", "strategic_fit", "plan_fit",
  "staleness", "effort", "base_priority", "modifiers", "final_priority",
  "priority_band", "priority_reasons", "plan_scope"
)
VALUES (
  '70000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a1',
  '20000000-0000-4000-8000-0000000000a1',
  '30000000-0000-4000-8000-0000000000a1',
  '40000000-0000-4000-8000-0000000000a1',
  '50000000-0000-4000-8000-0000000000a1',
  '53000000-0000-4000-8000-0000000000a1',
  '52000000-0000-4000-8000-0000000000a1',
  'seo.title',
  'seo.title@dv-score-v1.0',
  'FAIL',
  'HIGH',
  '["51000000-0000-4000-8000-0000000000a1"]'::jsonb,
  'HIGH',
  'seo',
  'on_page_metadata',
  'Fix title metadata',
  'The page title failed the deterministic audit.',
  'Review title metadata and update the page plan.',
  'READY',
  4,
  5,
  4,
  4,
  4,
  0,
  2,
  80,
  '{"modifierTotal":5}'::jsonb,
  85,
  'High',
  '["Base score 80 from weighted V1 factors.","Effort 2 modifier 5."]'::jsonb,
  'INCLUDED'
);
INSERT INTO "work_plan_cycles" ("id", "workspace_id", "client_id", "title", "status")
VALUES ('80000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', 'Client A current work cycle', 'OPEN');
INSERT INTO "work_plan_items" ("workspace_id", "client_id", "work_plan_cycle_id", "opportunity_id", "selected_by_user_id")
VALUES ('00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', '80000000-0000-4000-8000-0000000000a1', '70000000-0000-4000-8000-0000000000a1', 'rls-user-a');
COMMIT;

BEGIN;
SELECT set_config('app.workspace_id', '00000000-0000-4000-8000-0000000000b1', true);
SELECT set_config('app.user_id', 'rls-user-a', true);
INSERT INTO "opportunities" (
  "id", "workspace_id", "client_id", "website_id", "source_audit_id",
  "source_audit_run_id", "source_finding_id", "source_check_result_id",
  "source_check_key", "source_check_version", "source_result_status",
  "source_severity", "source_evidence_refs", "evidence_confidence", "category",
  "normalized_remediation_family", "title", "summary", "recommended_action",
  "status", "impact", "confidence", "urgency", "strategic_fit", "plan_fit",
  "staleness", "effort", "base_priority", "modifiers", "final_priority",
  "priority_band", "priority_reasons", "plan_scope"
)
VALUES (
  '70000000-0000-4000-8000-0000000000b1',
  '00000000-0000-4000-8000-0000000000b1',
  '20000000-0000-4000-8000-0000000000b1',
  '30000000-0000-4000-8000-0000000000b1',
  '40000000-0000-4000-8000-0000000000b1',
  '50000000-0000-4000-8000-0000000000b1',
  '53000000-0000-4000-8000-0000000000b1',
  '52000000-0000-4000-8000-0000000000b1',
  'seo.title',
  'seo.title@dv-score-v1.0',
  'FAIL',
  'HIGH',
  '[]'::jsonb,
  'HIGH',
  'seo',
  'on_page_metadata',
  'Fix title metadata B',
  'Workspace B fixture opportunity.',
  'Review title metadata.',
  'READY',
  4,
  5,
  4,
  4,
  4,
  0,
  2,
  80,
  '{"modifierTotal":5}'::jsonb,
  85,
  'High',
  '["Base score 80 from weighted V1 factors.","Effort 2 modifier 5."]'::jsonb,
  'INCLUDED'
);
INSERT INTO "work_plan_cycles" ("id", "workspace_id", "client_id", "title", "status")
VALUES ('80000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', 'Client B current work cycle', 'OPEN');
INSERT INTO "work_plan_items" ("workspace_id", "client_id", "work_plan_cycle_id", "opportunity_id", "selected_by_user_id")
VALUES ('00000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', '80000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-0000000000b1', 'rls-user-a');
COMMIT;

BEGIN;
SELECT set_config('app.workspace_id', '00000000-0000-4000-8000-0000000000a1', true);
SELECT set_config('app.user_id', 'rls-user-a', true);
DO $$
DECLARE
  own_opportunities integer;
  other_opportunities integer;
  own_cycle_items integer;
  changed_rows integer;
BEGIN
  SELECT count(*) INTO own_opportunities
  FROM "opportunities"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000a1';

  IF own_opportunities <> 1 THEN
    RAISE EXCEPTION 'Workspace A should read its own opportunity, saw %', own_opportunities;
  END IF;

  SELECT count(*) INTO own_cycle_items
  FROM "work_plan_items"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000a1';

  IF own_cycle_items <> 1 THEN
    RAISE EXCEPTION 'Workspace A should read its own work-plan item, saw %', own_cycle_items;
  END IF;

  UPDATE "opportunities"
  SET "summary" = 'Workspace A update'
  WHERE "id" = '70000000-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 1 THEN
    RAISE EXCEPTION 'Workspace A opportunity update should affect one row, affected %', changed_rows;
  END IF;

  UPDATE "work_plan_cycles"
  SET "title" = 'Workspace A updated cycle'
  WHERE "id" = '80000000-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 1 THEN
    RAISE EXCEPTION 'Workspace A work-plan update should affect one row, affected %', changed_rows;
  END IF;

  SELECT count(*) INTO other_opportunities
  FROM "opportunities"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';

  IF other_opportunities <> 0 THEN
    RAISE EXCEPTION 'Workspace A should not read Workspace B opportunities, saw %', other_opportunities;
  END IF;

  UPDATE "opportunities"
  SET "summary" = 'cross-workspace opportunity mutation'
  WHERE "id" = '70000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Workspace A mutated Workspace B opportunities.';
  END IF;

  UPDATE "work_plan_cycles"
  SET "title" = 'cross-workspace cycle mutation'
  WHERE "id" = '80000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Workspace A mutated Workspace B work-plan cycles.';
  END IF;

  DELETE FROM "work_plan_items"
  WHERE "work_plan_cycle_id" = '80000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Workspace A deleted Workspace B work-plan items.';
  END IF;
END $$;
COMMIT;

BEGIN;
SELECT set_config('app.workspace_id', '00000000-0000-4000-8000-0000000000a1', true);
SELECT set_config('app.user_id', 'rls-user-a', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO "opportunities" (
      "id", "workspace_id", "client_id", "website_id", "source_audit_id",
      "source_audit_run_id", "source_finding_id", "source_check_result_id",
      "source_check_key", "source_check_version", "source_result_status",
      "source_severity", "source_evidence_refs", "evidence_confidence", "category",
      "normalized_remediation_family", "title", "summary", "recommended_action",
      "status", "impact", "confidence", "urgency", "strategic_fit", "plan_fit",
      "staleness", "effort", "base_priority", "modifiers", "final_priority",
      "priority_band", "priority_reasons", "plan_scope"
    )
    VALUES (
      '70000000-0000-4000-8000-0000000000bb',
      '00000000-0000-4000-8000-0000000000b1',
      '20000000-0000-4000-8000-0000000000b1',
      '30000000-0000-4000-8000-0000000000b1',
      '40000000-0000-4000-8000-0000000000b1',
      '50000000-0000-4000-8000-0000000000b1',
      '53000000-0000-4000-8000-0000000000b1',
      '52000000-0000-4000-8000-0000000000b1',
      'seo.title',
      'seo.title@dv-score-v1.0',
      'FAIL',
      'HIGH',
      '[]'::jsonb,
      'HIGH',
      'seo',
      'on_page_metadata',
      'Blocked cross-workspace opportunity',
      'Blocked cross-workspace opportunity.',
      'No action.',
      'READY',
      4,
      5,
      4,
      4,
      4,
      0,
      2,
      80,
      '{"modifierTotal":5}'::jsonb,
      85,
      'High',
      '[]'::jsonb,
      'INCLUDED'
    );
    RAISE EXCEPTION 'Workspace A inserted a Workspace B opportunity.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO "opportunities" (
      "id", "workspace_id", "client_id", "website_id", "source_audit_id",
      "source_audit_run_id", "source_finding_id", "source_check_result_id",
      "source_check_key", "source_check_version", "source_result_status",
      "source_severity", "source_evidence_refs", "evidence_confidence", "category",
      "normalized_remediation_family", "title", "summary", "recommended_action",
      "status", "impact", "confidence", "urgency", "strategic_fit", "plan_fit",
      "staleness", "effort", "base_priority", "modifiers", "final_priority",
      "priority_band", "priority_reasons", "plan_scope"
    )
    VALUES (
      '70000000-0000-4000-8000-0000000000bc',
      '00000000-0000-4000-8000-0000000000a1',
      '20000000-0000-4000-8000-0000000000b1',
      '30000000-0000-4000-8000-0000000000b1',
      '40000000-0000-4000-8000-0000000000b1',
      '50000000-0000-4000-8000-0000000000b1',
      '53000000-0000-4000-8000-0000000000b1',
      '52000000-0000-4000-8000-0000000000b1',
      'seo.title',
      'seo.title@dv-score-v1.0',
      'FAIL',
      'HIGH',
      '[]'::jsonb,
      'HIGH',
      'seo',
      'on_page_metadata',
      'Blocked mixed-workspace opportunity',
      'Blocked mixed-workspace opportunity.',
      'No action.',
      'READY',
      4,
      5,
      4,
      4,
      4,
      0,
      2,
      80,
      '{"modifierTotal":5}'::jsonb,
      85,
      'High',
      '[]'::jsonb,
      'INCLUDED'
    );
    RAISE EXCEPTION 'Workspace A linked an opportunity to Workspace B source rows.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "work_plan_cycles" ("id", "workspace_id", "client_id", "title", "status")
    VALUES ('80000000-0000-4000-8000-0000000000bc', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000b1', 'Blocked cycle', 'OPEN');
    RAISE EXCEPTION 'Workspace A linked a work-plan cycle to Workspace B client.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "work_plan_items" ("workspace_id", "client_id", "work_plan_cycle_id", "opportunity_id", "selected_by_user_id")
    VALUES ('00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', '80000000-0000-4000-8000-0000000000a1', '70000000-0000-4000-8000-0000000000b1', 'rls-user-a');
    RAISE EXCEPTION 'Workspace A linked a work-plan item to Workspace B opportunity.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;
END $$;
COMMIT;

BEGIN;
SELECT set_config('app.workspace_id', '00000000-0000-4000-8000-0000000000a1', true);
SELECT set_config('app.user_id', 'rls-user-a', true);
DO $$
DECLARE
  duplicate_count integer;
BEGIN
  BEGIN
    INSERT INTO "opportunities" (
      "id", "workspace_id", "client_id", "website_id", "source_audit_id",
      "source_audit_run_id", "source_finding_id", "source_check_result_id",
      "source_check_key", "source_check_version", "source_result_status",
      "source_severity", "source_evidence_refs", "evidence_confidence", "category",
      "normalized_remediation_family", "title", "summary", "recommended_action",
      "status", "impact", "confidence", "urgency", "strategic_fit", "plan_fit",
      "staleness", "effort", "base_priority", "modifiers", "final_priority",
      "priority_band", "priority_reasons", "plan_scope"
    )
    VALUES (
      '70000000-0000-4000-8000-0000000000ad',
      '00000000-0000-4000-8000-0000000000a1',
      '20000000-0000-4000-8000-0000000000a1',
      '30000000-0000-4000-8000-0000000000a1',
      '40000000-0000-4000-8000-0000000000a1',
      '50000000-0000-4000-8000-0000000000a1',
      '53000000-0000-4000-8000-0000000000a1',
      '52000000-0000-4000-8000-0000000000a1',
      'seo.title',
      'seo.title@dv-score-v1.0',
      'FAIL',
      'HIGH',
      '[]'::jsonb,
      'HIGH',
      'seo',
      'on_page_metadata',
      'Duplicate title metadata',
      'Duplicate open opportunity.',
      'No action.',
      'DRAFT',
      4,
      5,
      4,
      4,
      4,
      0,
      2,
      80,
      '{"modifierTotal":5}'::jsonb,
      85,
      'High',
      '[]'::jsonb,
      'INCLUDED'
    );
    RAISE EXCEPTION 'Open materially equivalent opportunity was duplicated.';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  UPDATE "opportunities"
  SET "status" = 'COMPLETED', "completed_at" = now(), "closed_at" = now()
  WHERE "id" = '70000000-0000-4000-8000-0000000000a1';

  INSERT INTO "opportunities" (
    "id", "workspace_id", "client_id", "website_id", "source_audit_id",
    "source_audit_run_id", "source_finding_id", "source_check_result_id",
    "source_check_key", "source_check_version", "source_result_status",
    "source_severity", "source_evidence_refs", "evidence_confidence", "category",
    "normalized_remediation_family", "title", "summary", "recommended_action",
    "status", "impact", "confidence", "urgency", "strategic_fit", "plan_fit",
    "staleness", "effort", "base_priority", "modifiers", "final_priority",
    "priority_band", "priority_reasons", "plan_scope"
  )
  VALUES (
    '70000000-0000-4000-8000-0000000000ae',
    '00000000-0000-4000-8000-0000000000a1',
    '20000000-0000-4000-8000-0000000000a1',
    '30000000-0000-4000-8000-0000000000a1',
    '40000000-0000-4000-8000-0000000000a1',
    '50000000-0000-4000-8000-0000000000a1',
    '53000000-0000-4000-8000-0000000000a1',
    '52000000-0000-4000-8000-0000000000a1',
    'seo.title',
    'seo.title@dv-score-v1.0',
    'FAIL',
    'HIGH',
    '[]'::jsonb,
    'HIGH',
    'seo',
    'on_page_metadata',
    'New title metadata cycle',
    'Closed work can be represented by a later open item.',
    'Review title metadata.',
    'DRAFT',
    4,
    5,
    4,
    4,
    4,
    0,
    2,
    80,
    '{"modifierTotal":5}'::jsonb,
    85,
    'High',
    '[]'::jsonb,
    'INCLUDED'
  );

  SELECT count(*) INTO duplicate_count
  FROM "opportunities"
  WHERE workspace_id = '00000000-0000-4000-8000-0000000000a1'
    AND website_id = '30000000-0000-4000-8000-0000000000a1'
    AND source_check_key = 'seo.title'
    AND normalized_remediation_family = 'on_page_metadata'
    AND status IN ('DRAFT', 'READY', 'BLOCKED', 'IN_PROGRESS');

  IF duplicate_count <> 1 THEN
    RAISE EXCEPTION 'Expected one open materially equivalent opportunity after close/reopen, saw %', duplicate_count;
  END IF;
END $$;
COMMIT;

SELECT 'phase2_live_postgres_rls_ok' AS result;
