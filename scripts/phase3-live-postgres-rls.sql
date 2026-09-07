\set ON_ERROR_STOP on

-- Phase 3 live PostgreSQL RLS/governed PREPARE proof.
-- Run only after all migrations and the Phase 1/2 live proofs have been
-- applied to a disposable database.

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
      ('agent_runs'),
      ('agent_tool_calls'),
      ('client_knowledge_sources'),
      ('business_facts'),
      ('claim_policies'),
      ('draft_artifacts'),
      ('approval_requests'),
      ('operational_notifications')
  )
  SELECT array_agg(c.relname ORDER BY c.relname)
  INTO unforced_tables
  FROM tenant_tables t
  JOIN pg_class c ON c.relname = t.name
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE NOT c.relrowsecurity OR NOT c.relforcerowsecurity;

  IF unforced_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Phase 3 tenant tables are not forced under RLS: %', unforced_tables;
  END IF;
END $$;
COMMIT;

BEGIN;
DO $$
DECLARE
  enabled_count integer;
  execute_count integer;
BEGIN
  SELECT count(*) INTO enabled_count
  FROM "agent_definitions"
  WHERE enabled = true;

  IF enabled_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one enabled Phase 3 agent, saw %', enabled_count;
  END IF;

  SELECT count(*) INTO execute_count
  FROM "agent_definitions"
  WHERE enabled = true
    AND default_permission_level = 'EXECUTE';

  IF execute_count <> 0 THEN
    RAISE EXCEPTION 'Enabled Phase 3 agent definitions may not use EXECUTE.';
  END IF;
END $$;
COMMIT;

BEGIN;
SELECT set_config('app.workspace_id', '00000000-0000-4000-8000-0000000000a1', true);
SELECT set_config('app.user_id', 'rls-user-a', true);
INSERT INTO "client_knowledge_sources" (
  "id", "workspace_id", "client_id", "website_id", "source_type", "title",
  "source_url", "verification_status", "approved_by_user_id"
)
VALUES (
  '91000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a1',
  '20000000-0000-4000-8000-0000000000a1',
  '30000000-0000-4000-8000-0000000000a1',
  'WEBSITE_PAGE',
  'Approved homepage A',
  'https://example-a.test/',
  'VERIFIED',
  'rls-user-a'
);
INSERT INTO "business_facts" (
  "id", "workspace_id", "client_id", "website_id", "knowledge_source_id",
  "fact_type", "value", "source_reference", "verification_status",
  "approved_by_user_id"
)
VALUES (
  '92000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a1',
  '20000000-0000-4000-8000-0000000000a1',
  '30000000-0000-4000-8000-0000000000a1',
  '91000000-0000-4000-8000-0000000000a1',
  'service',
  'Website optimization',
  'Approved homepage A',
  'VERIFIED',
  'rls-user-a'
);
INSERT INTO "claim_policies" (
  "id", "workspace_id", "client_id", "rule_type", "claim_category", "rule"
)
VALUES (
  '93000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a1',
  '20000000-0000-4000-8000-0000000000a1',
  'PROHIBITED',
  'pricing',
  'Do not draft pricing claims without a verified pricing fact.'
);
INSERT INTO "agent_runs" (
  "id", "workspace_id", "agent_definition_id", "client_id", "website_id",
  "audit_id", "opportunity_id", "trigger_type", "agent_key", "agent_version",
  "permission_level", "status", "input_summary", "evidence_refs",
  "allowed_tool_snapshot", "budget_snapshot", "timeout_seconds", "provider",
  "model", "prompt_template_version", "output_schema_version", "idempotency_key",
  "created_by_user_id"
)
VALUES (
  '90000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a1',
  (SELECT id FROM "agent_definitions" WHERE "key" = 'existing-page-optimization' AND "version" = 'epo-prepare-v1.0'),
  '20000000-0000-4000-8000-0000000000a1',
  '30000000-0000-4000-8000-0000000000a1',
  '40000000-0000-4000-8000-0000000000a1',
  '70000000-0000-4000-8000-0000000000ae',
  'USER',
  'existing-page-optimization',
  'epo-prepare-v1.0',
  'PREPARE',
  'SUCCEEDED',
  '{"source":"phase3-live-rls"}'::jsonb,
  '["51000000-0000-4000-8000-0000000000a1"]'::jsonb,
  '["read.opportunity.v1","create.draft_artifact.v1","create.approval_request.v1"]'::jsonb,
  '{"maxToolCalls":8,"maxModelCalls":1,"maxEvidenceBytes":18000,"maxInputBytes":24000,"maxOutputBytes":10000,"maxOutputTokens":1500,"maxCostCents":50}'::jsonb,
  60,
  'deterministic',
  'deterministic-existing-page-optimization-v1',
  'epo-prompt-v1.0',
  'existing-page-optimization-output-v1.0',
  'phase3-live-a',
  'rls-user-a'
);
INSERT INTO "agent_tool_calls" (
  "id", "workspace_id", "agent_run_id", "tool_key", "tool_version",
  "permission_level", "status"
)
VALUES (
  '90100000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a1',
  '90000000-0000-4000-8000-0000000000a1',
  'read.opportunity.v1',
  '1.0',
  'OBSERVE',
  'SUCCEEDED'
);
INSERT INTO "draft_artifacts" (
  "id", "workspace_id", "client_id", "website_id", "opportunity_id",
  "artifact_type", "artifact_version", "status", "prepared_by_agent_run_id",
  "source_evidence_refs", "structured_proposal", "rendered_preview",
  "factual_basis_refs", "risk_level", "content_hash"
)
VALUES (
  '94000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a1',
  '20000000-0000-4000-8000-0000000000a1',
  '30000000-0000-4000-8000-0000000000a1',
  '70000000-0000-4000-8000-0000000000ae',
  'EXISTING_PAGE_OPTIMIZATION_PROPOSAL',
  1,
  'AWAITING_APPROVAL',
  '90000000-0000-4000-8000-0000000000a1',
  '["51000000-0000-4000-8000-0000000000a1"]'::jsonb,
  '{"artifactTitle":"Title proposal A","externalExecutionRequested":false}'::jsonb,
  '# Title proposal A',
  '["92000000-0000-4000-8000-0000000000a1"]'::jsonb,
  'MEDIUM',
  repeat('a', 64)
);
INSERT INTO "approval_requests" (
  "id", "workspace_id", "client_id", "website_id", "opportunity_id",
  "request_type", "target_type", "target_artifact_id",
  "target_artifact_version", "risk_level", "requested_by_user_id",
  "requested_by_agent_run_id", "immutable_summary"
)
VALUES (
  '95000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a1',
  '20000000-0000-4000-8000-0000000000a1',
  '30000000-0000-4000-8000-0000000000a1',
  '70000000-0000-4000-8000-0000000000ae',
  'PREPARE_ARTIFACT_REVIEW',
  'DRAFT_ARTIFACT',
  '94000000-0000-4000-8000-0000000000a1',
  1,
  'MEDIUM',
  'rls-user-a',
  '90000000-0000-4000-8000-0000000000a1',
  '{"title":"Title proposal A","artifactVersion":1,"proposedExternalExecution":false}'::jsonb
);
INSERT INTO "operational_notifications" (
  "id", "workspace_id", "type", "severity", "title", "summary",
  "resource_type", "resource_id"
)
VALUES (
  '96000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a1',
  'approval_requested',
  'MEDIUM',
  'Approval requested',
  'Draft ready for review.',
  'approval_request',
  '95000000-0000-4000-8000-0000000000a1'
);
COMMIT;

BEGIN;
SELECT set_config('app.workspace_id', '00000000-0000-4000-8000-0000000000b1', true);
SELECT set_config('app.user_id', 'rls-user-a', true);
INSERT INTO "client_knowledge_sources" ("id", "workspace_id", "client_id", "website_id", "source_type", "title", "verification_status")
VALUES ('91000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000b1', 'WEBSITE_PAGE', 'Approved homepage B', 'VERIFIED');
INSERT INTO "business_facts" ("id", "workspace_id", "client_id", "website_id", "knowledge_source_id", "fact_type", "value", "source_reference", "verification_status")
VALUES ('92000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000b1', '91000000-0000-4000-8000-0000000000b1', 'service', 'SEO consulting', 'Approved homepage B', 'VERIFIED');
INSERT INTO "claim_policies" ("id", "workspace_id", "client_id", "rule_type", "claim_category", "rule")
VALUES ('93000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', 'PROHIBITED', 'pricing', 'Do not draft pricing claims.');
INSERT INTO "agent_runs" (
  "id", "workspace_id", "agent_definition_id", "client_id", "website_id",
  "audit_id", "opportunity_id", "trigger_type", "agent_key", "agent_version",
  "permission_level", "status", "input_summary", "evidence_refs",
  "allowed_tool_snapshot", "budget_snapshot", "timeout_seconds", "provider",
  "model", "prompt_template_version", "output_schema_version", "idempotency_key",
  "created_by_user_id"
)
VALUES (
  '90000000-0000-4000-8000-0000000000b1',
  '00000000-0000-4000-8000-0000000000b1',
  (SELECT id FROM "agent_definitions" WHERE "key" = 'existing-page-optimization' AND "version" = 'epo-prepare-v1.0'),
  '20000000-0000-4000-8000-0000000000b1',
  '30000000-0000-4000-8000-0000000000b1',
  '40000000-0000-4000-8000-0000000000b1',
  '70000000-0000-4000-8000-0000000000b1',
  'USER',
  'existing-page-optimization',
  'epo-prepare-v1.0',
  'PREPARE',
  'SUCCEEDED',
  '{}'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{"maxToolCalls":8,"maxModelCalls":1}'::jsonb,
  60,
  'deterministic',
  'deterministic-existing-page-optimization-v1',
  'epo-prompt-v1.0',
  'existing-page-optimization-output-v1.0',
  'phase3-live-b',
  'rls-user-a'
);
INSERT INTO "agent_tool_calls" ("id", "workspace_id", "agent_run_id", "tool_key", "tool_version", "permission_level", "status")
VALUES ('90100000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '90000000-0000-4000-8000-0000000000b1', 'read.opportunity.v1', '1.0', 'OBSERVE', 'SUCCEEDED');
INSERT INTO "draft_artifacts" (
  "id", "workspace_id", "client_id", "website_id", "opportunity_id",
  "artifact_type", "artifact_version", "status", "prepared_by_agent_run_id",
  "structured_proposal", "rendered_preview", "risk_level", "content_hash"
)
VALUES (
  '94000000-0000-4000-8000-0000000000b1',
  '00000000-0000-4000-8000-0000000000b1',
  '20000000-0000-4000-8000-0000000000b1',
  '30000000-0000-4000-8000-0000000000b1',
  '70000000-0000-4000-8000-0000000000b1',
  'EXISTING_PAGE_OPTIMIZATION_PROPOSAL',
  1,
  'AWAITING_APPROVAL',
  '90000000-0000-4000-8000-0000000000b1',
  '{"artifactTitle":"Title proposal B","externalExecutionRequested":false}'::jsonb,
  '# Title proposal B',
  'MEDIUM',
  repeat('b', 64)
);
INSERT INTO "approval_requests" (
  "id", "workspace_id", "client_id", "website_id", "opportunity_id",
  "request_type", "target_type", "target_artifact_id",
  "target_artifact_version", "risk_level", "requested_by_user_id",
  "requested_by_agent_run_id", "immutable_summary"
)
VALUES (
  '95000000-0000-4000-8000-0000000000b1',
  '00000000-0000-4000-8000-0000000000b1',
  '20000000-0000-4000-8000-0000000000b1',
  '30000000-0000-4000-8000-0000000000b1',
  '70000000-0000-4000-8000-0000000000b1',
  'PREPARE_ARTIFACT_REVIEW',
  'DRAFT_ARTIFACT',
  '94000000-0000-4000-8000-0000000000b1',
  1,
  'MEDIUM',
  'rls-user-a',
  '90000000-0000-4000-8000-0000000000b1',
  '{"title":"Title proposal B","artifactVersion":1,"proposedExternalExecution":false}'::jsonb
);
INSERT INTO "operational_notifications" ("id", "workspace_id", "type", "severity", "title", "summary")
VALUES ('96000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', 'approval_requested', 'MEDIUM', 'Approval requested', 'Draft ready for review.');
COMMIT;

BEGIN;
SELECT set_config('app.workspace_id', '00000000-0000-4000-8000-0000000000a1', true);
SELECT set_config('app.user_id', 'rls-user-a', true);
DO $$
DECLARE
  own_count integer;
  other_count integer;
  changed_rows integer;
BEGIN
  SELECT count(*) INTO own_count FROM "agent_runs" WHERE workspace_id = '00000000-0000-4000-8000-0000000000a1';
  IF own_count <> 1 THEN RAISE EXCEPTION 'Workspace A should read its agent run, saw %', own_count; END IF;

  SELECT count(*) INTO own_count FROM "draft_artifacts" WHERE workspace_id = '00000000-0000-4000-8000-0000000000a1';
  IF own_count <> 1 THEN RAISE EXCEPTION 'Workspace A should read its draft artifact, saw %', own_count; END IF;

  SELECT count(*) INTO own_count FROM "approval_requests" WHERE workspace_id = '00000000-0000-4000-8000-0000000000a1';
  IF own_count <> 1 THEN RAISE EXCEPTION 'Workspace A should read its approval request, saw %', own_count; END IF;

  UPDATE "agent_runs" SET "status" = 'RUNNING' WHERE "id" = '90000000-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 1 THEN RAISE EXCEPTION 'Workspace A should mutate its run, changed %', changed_rows; END IF;

  UPDATE "draft_artifacts" SET "status" = 'APPROVED' WHERE "id" = '94000000-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 1 THEN RAISE EXCEPTION 'Workspace A should mutate its draft, changed %', changed_rows; END IF;

  UPDATE "approval_requests" SET "status" = 'APPROVED' WHERE "id" = '95000000-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 1 THEN RAISE EXCEPTION 'Workspace A should mutate its approval, changed %', changed_rows; END IF;

  SELECT count(*) INTO other_count FROM "agent_runs" WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';
  IF other_count <> 0 THEN RAISE EXCEPTION 'Workspace A read Workspace B agent runs: %', other_count; END IF;

  SELECT count(*) INTO other_count FROM "agent_tool_calls" WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';
  IF other_count <> 0 THEN RAISE EXCEPTION 'Workspace A read Workspace B tool calls: %', other_count; END IF;

  SELECT count(*) INTO other_count FROM "client_knowledge_sources" WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';
  IF other_count <> 0 THEN RAISE EXCEPTION 'Workspace A read Workspace B knowledge sources: %', other_count; END IF;

  SELECT count(*) INTO other_count FROM "business_facts" WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';
  IF other_count <> 0 THEN RAISE EXCEPTION 'Workspace A read Workspace B business facts: %', other_count; END IF;

  SELECT count(*) INTO other_count FROM "claim_policies" WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';
  IF other_count <> 0 THEN RAISE EXCEPTION 'Workspace A read Workspace B claim policies: %', other_count; END IF;

  SELECT count(*) INTO other_count FROM "draft_artifacts" WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';
  IF other_count <> 0 THEN RAISE EXCEPTION 'Workspace A read Workspace B draft artifacts: %', other_count; END IF;

  SELECT count(*) INTO other_count FROM "approval_requests" WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';
  IF other_count <> 0 THEN RAISE EXCEPTION 'Workspace A read Workspace B approval requests: %', other_count; END IF;

  SELECT count(*) INTO other_count FROM "operational_notifications" WHERE workspace_id = '00000000-0000-4000-8000-0000000000b1';
  IF other_count <> 0 THEN RAISE EXCEPTION 'Workspace A read Workspace B notifications: %', other_count; END IF;

  UPDATE "agent_runs" SET "status" = 'FAILED' WHERE "id" = '90000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 0 THEN RAISE EXCEPTION 'Workspace A mutated Workspace B agent run.'; END IF;

  DELETE FROM "draft_artifacts" WHERE "id" = '94000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 0 THEN RAISE EXCEPTION 'Workspace A deleted Workspace B draft artifact.'; END IF;

  UPDATE "approval_requests" SET "status" = 'REJECTED' WHERE "id" = '95000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 0 THEN RAISE EXCEPTION 'Workspace A mutated Workspace B approval request.'; END IF;
END $$;
COMMIT;

BEGIN;
SELECT set_config('app.workspace_id', '00000000-0000-4000-8000-0000000000a1', true);
SELECT set_config('app.user_id', 'rls-user-a', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO "agent_runs" (
      "id", "workspace_id", "client_id", "trigger_type", "agent_key", "agent_version",
      "permission_level", "status", "timeout_seconds", "provider", "model",
      "prompt_template_version", "output_schema_version", "idempotency_key"
    )
    VALUES (
      '90000000-0000-4000-8000-0000000000bb',
      '00000000-0000-4000-8000-0000000000b1',
      '20000000-0000-4000-8000-0000000000b1',
      'USER',
      'existing-page-optimization',
      'epo-prepare-v1.0',
      'PREPARE',
      'QUEUED',
      60,
      'deterministic',
      'deterministic-existing-page-optimization-v1',
      'epo-prompt-v1.0',
      'existing-page-optimization-output-v1.0',
      'blocked-forged-b'
    );
    RAISE EXCEPTION 'Workspace A inserted a Workspace B agent run.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO "agent_runs" (
      "id", "workspace_id", "client_id", "website_id", "opportunity_id",
      "trigger_type", "agent_key", "agent_version", "permission_level",
      "status", "timeout_seconds", "provider", "model",
      "prompt_template_version", "output_schema_version", "idempotency_key"
    )
    VALUES (
      '90000000-0000-4000-8000-0000000000bc',
      '00000000-0000-4000-8000-0000000000a1',
      '20000000-0000-4000-8000-0000000000b1',
      '30000000-0000-4000-8000-0000000000b1',
      '70000000-0000-4000-8000-0000000000b1',
      'USER',
      'existing-page-optimization',
      'epo-prepare-v1.0',
      'PREPARE',
      'QUEUED',
      60,
      'deterministic',
      'deterministic-existing-page-optimization-v1',
      'epo-prompt-v1.0',
      'existing-page-optimization-output-v1.0',
      'blocked-cross-source'
    );
    RAISE EXCEPTION 'Workspace A linked an agent run to Workspace B source rows.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "agent_tool_calls" ("workspace_id", "agent_run_id", "tool_key", "tool_version", "permission_level", "status")
    VALUES ('00000000-0000-4000-8000-0000000000a1', '90000000-0000-4000-8000-0000000000b1', 'read.opportunity.v1', '1.0', 'OBSERVE', 'SUCCEEDED');
    RAISE EXCEPTION 'Workspace A linked a tool call to Workspace B run.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "client_knowledge_sources" ("workspace_id", "client_id", "source_type", "title")
    VALUES ('00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000b1', 'WEBSITE_PAGE', 'Blocked source');
    RAISE EXCEPTION 'Workspace A linked a knowledge source to Workspace B client.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "business_facts" ("workspace_id", "client_id", "knowledge_source_id", "fact_type", "value", "source_reference")
    VALUES ('00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', '91000000-0000-4000-8000-0000000000b1', 'service', 'Blocked', 'Blocked');
    RAISE EXCEPTION 'Workspace A linked a business fact to Workspace B knowledge source.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "claim_policies" ("workspace_id", "client_id", "rule_type", "claim_category", "rule")
    VALUES ('00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000b1', 'PROHIBITED', 'pricing', 'Blocked');
    RAISE EXCEPTION 'Workspace A linked a claim policy to Workspace B client.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "draft_artifacts" (
      "workspace_id", "client_id", "website_id", "opportunity_id",
      "artifact_type", "artifact_version", "prepared_by_agent_run_id",
      "structured_proposal", "rendered_preview", "content_hash"
    )
    VALUES (
      '00000000-0000-4000-8000-0000000000a1',
      '20000000-0000-4000-8000-0000000000b1',
      '30000000-0000-4000-8000-0000000000b1',
      '70000000-0000-4000-8000-0000000000b1',
      'EXISTING_PAGE_OPTIMIZATION_PROPOSAL',
      1,
      '90000000-0000-4000-8000-0000000000b1',
      '{}'::jsonb,
      'Blocked',
      repeat('c', 64)
    );
    RAISE EXCEPTION 'Workspace A linked a draft artifact to Workspace B source rows.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "approval_requests" (
      "workspace_id", "client_id", "website_id", "opportunity_id",
      "request_type", "target_type", "target_artifact_id",
      "target_artifact_version", "risk_level", "requested_by_agent_run_id",
      "immutable_summary"
    )
    VALUES (
      '00000000-0000-4000-8000-0000000000a1',
      '20000000-0000-4000-8000-0000000000b1',
      '30000000-0000-4000-8000-0000000000b1',
      '70000000-0000-4000-8000-0000000000b1',
      'PREPARE_ARTIFACT_REVIEW',
      'DRAFT_ARTIFACT',
      '94000000-0000-4000-8000-0000000000b1',
      1,
      'MEDIUM',
      '90000000-0000-4000-8000-0000000000b1',
      '{}'::jsonb
    );
    RAISE EXCEPTION 'Workspace A linked an approval to Workspace B artifact/run.';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "approval_requests" (
      "workspace_id", "client_id", "website_id", "opportunity_id",
      "request_type", "target_type", "target_artifact_id",
      "target_artifact_version", "risk_level", "requested_by_agent_run_id",
      "immutable_summary", "proposed_external_execution"
    )
    VALUES (
      '00000000-0000-4000-8000-0000000000a1',
      '20000000-0000-4000-8000-0000000000a1',
      '30000000-0000-4000-8000-0000000000a1',
      '70000000-0000-4000-8000-0000000000ae',
      'PREPARE_ARTIFACT_REVIEW',
      'DRAFT_ARTIFACT',
      '94000000-0000-4000-8000-0000000000a1',
      1,
      'MEDIUM',
      '90000000-0000-4000-8000-0000000000a1',
      '{}'::jsonb,
      true
    );
    RAISE EXCEPTION 'Phase 3 approval accepted proposed external execution.';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END $$;
COMMIT;

SELECT 'phase3_live_postgres_rls_ok' AS result;
