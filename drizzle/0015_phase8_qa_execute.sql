CREATE TABLE "execution_approvals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"fixture_id" uuid NOT NULL,
	"implementation_package_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"artifact_version" integer NOT NULL,
	"action_summary" jsonb NOT NULL,
	"action_hash" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"decided_by_user_id" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "execution_approval_status_check" CHECK ("execution_approvals"."status" in ('PENDING','APPROVED','REJECTED'))
);
--> statement-breakpoint
ALTER TABLE "execution_approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "execution_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"fixture_id" uuid NOT NULL,
	"implementation_package_id" uuid NOT NULL,
	"approval_id" uuid NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"action_key" text NOT NULL,
	"action_version" text NOT NULL,
	"target" text NOT NULL,
	"kind" text NOT NULL,
	"parent_execution_id" uuid,
	"action_summary" jsonb NOT NULL,
	"action_hash" text NOT NULL,
	"pre_change_snapshot" jsonb NOT NULL,
	"post_change_snapshot" jsonb,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"idempotency_key" text NOT NULL,
	"change_id" text,
	"verification_run_id" uuid,
	"verification_status" text,
	"verification_snapshot" jsonb,
	"error_summary" text,
	"actor_user_id" text NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "execution_record_status_check" CHECK ("execution_records"."status" in ('QUEUED','RUNNING','SUCCEEDED','FAILED','ROLLED_BACK','ROLLBACK_FAILED','BLOCKED','VERIFYING','VERIFIED')),
	CONSTRAINT "execution_record_kind_check" CHECK (("execution_records"."kind" = 'APPLY' and "execution_records"."parent_execution_id" is null) or ("execution_records"."kind" = 'ROLLBACK' and "execution_records"."parent_execution_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "qa_execution_fixtures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"title" text DEFAULT 'Home' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"fault_mode" text DEFAULT 'NONE' NOT NULL,
	"last_operation" text DEFAULT 'INITIAL' NOT NULL,
	"last_change_id" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qa_fixture_metadata_bounds" CHECK (length("qa_execution_fixtures"."title") between 1 and 160 and length("qa_execution_fixtures"."description") <= 320 and "qa_execution_fixtures"."revision" > 0),
	CONSTRAINT "qa_fixture_mode_check" CHECK ("qa_execution_fixtures"."fault_mode" in ('NONE','TITLE_MISMATCH') and "qa_execution_fixtures"."last_operation" in ('INITIAL','APPLY','ROLLBACK'))
);
--> statement-breakpoint
ALTER TABLE "qa_execution_fixtures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "execution_approvals_workspace_id_unique" ON "execution_approvals" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "execution_records_workspace_id_unique" ON "execution_records" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "execution_records_idempotency_unique" ON "execution_records" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "qa_execution_fixtures_workspace_id_unique" ON "qa_execution_fixtures" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "qa_execution_fixtures_binding_unique" ON "qa_execution_fixtures" USING btree ("workspace_id","client_id","website_id","id");--> statement-breakpoint
ALTER TABLE "execution_approvals" ADD CONSTRAINT "execution_approvals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_approvals" ADD CONSTRAINT "execution_approvals_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_approvals" ADD CONSTRAINT "execution_approvals_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_approvals" ADD CONSTRAINT "execution_approval_fixture_fk" FOREIGN KEY ("workspace_id","client_id","website_id","fixture_id") REFERENCES "public"."qa_execution_fixtures"("workspace_id","client_id","website_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_approvals" ADD CONSTRAINT "execution_approval_package_fk" FOREIGN KEY ("workspace_id","implementation_package_id","artifact_id","artifact_version") REFERENCES "public"."implementation_packages"("workspace_id","id","artifact_id","artifact_version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_approvals" ADD CONSTRAINT "execution_approval_opportunity_fk" FOREIGN KEY ("workspace_id","client_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","client_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_records" ADD CONSTRAINT "execution_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_records" ADD CONSTRAINT "execution_records_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_records" ADD CONSTRAINT "execution_record_fixture_fk" FOREIGN KEY ("workspace_id","client_id","website_id","fixture_id") REFERENCES "public"."qa_execution_fixtures"("workspace_id","client_id","website_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_records" ADD CONSTRAINT "execution_record_package_fk" FOREIGN KEY ("workspace_id","implementation_package_id") REFERENCES "public"."implementation_packages"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_records" ADD CONSTRAINT "execution_record_approval_fk" FOREIGN KEY ("workspace_id","approval_id") REFERENCES "public"."execution_approvals"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_records" ADD CONSTRAINT "execution_record_run_fk" FOREIGN KEY ("workspace_id","agent_run_id") REFERENCES "public"."agent_runs"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_records" ADD CONSTRAINT "execution_record_verifier_fk" FOREIGN KEY ("workspace_id","verification_run_id") REFERENCES "public"."agent_runs"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_records" ADD CONSTRAINT "execution_record_parent_fk" FOREIGN KEY ("workspace_id","parent_execution_id") REFERENCES "public"."execution_records"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_records" ADD CONSTRAINT "execution_record_opportunity_fk" FOREIGN KEY ("workspace_id","client_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","client_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_execution_fixtures" ADD CONSTRAINT "qa_execution_fixtures_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_execution_fixtures" ADD CONSTRAINT "qa_execution_fixtures_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_execution_fixtures" ADD CONSTRAINT "qa_execution_fixture_site_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE public.execution_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execution_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.execution_approvals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.qa_execution_fixtures FORCE ROW LEVEL SECURITY;
CREATE POLICY execution_records_workspace ON public.execution_records USING (workspace_id=public.current_app_workspace_id()) WITH CHECK (workspace_id=public.current_app_workspace_id());
CREATE POLICY execution_approvals_workspace ON public.execution_approvals USING (workspace_id=public.current_app_workspace_id()) WITH CHECK (workspace_id=public.current_app_workspace_id());
CREATE POLICY qa_execution_fixtures_workspace ON public.qa_execution_fixtures USING (workspace_id=public.current_app_workspace_id()) WITH CHECK (workspace_id=public.current_app_workspace_id());
--> statement-breakpoint
INSERT INTO public.agent_definitions (key,version,name,capability_type,default_permission_level,allowed_tool_keys,default_timeout_seconds,budget_limits,output_schema_version,enabled)
VALUES ('qa-metadata-execution','qa-metadata-execution-v1.0','QA Metadata Execution Agent','QA_EXECUTION','EXECUTE','["execute.qa_metadata.v1"]'::jsonb,60,'{"maxToolCalls":1,"maxModelCalls":0,"maxEvidenceBytes":0,"maxInputBytes":12000,"maxOutputBytes":4000,"maxOutputTokens":0,"maxCostCents":0}'::jsonb,'qa-execution-v1.0',true) ON CONFLICT (key,version) DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION public.protect_execution_approval() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Execution approval history is retained.' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'PENDING' OR NOT EXISTS(SELECT 1 FROM public.implementation_packages p WHERE p.workspace_id=NEW.workspace_id AND p.id=NEW.implementation_package_id AND p.client_id=NEW.client_id AND p.website_id=NEW.website_id AND p.opportunity_id=NEW.opportunity_id AND p.artifact_id=NEW.artifact_id AND p.artifact_version=NEW.artifact_version AND NEW.action_summary->>'packageHash'=p.content_hash)
      OR NEW.action_summary->>'approvalRequestId' IS DISTINCT FROM NEW.id::text
      OR NEW.action_summary->>'workspaceId' IS DISTINCT FROM NEW.workspace_id::text
      OR NEW.action_summary->>'fixtureId' IS DISTINCT FROM NEW.fixture_id::text
      OR NEW.action_summary->>'packageId' IS DISTINCT FROM NEW.implementation_package_id::text
      OR NEW.action_summary->>'actionKey' IS DISTINCT FROM 'qa.metadata.apply'
      OR NEW.action_summary->>'version' IS DISTINCT FROM 'qa.metadata.apply-v1.0'
    THEN RAISE EXCEPTION 'Exact QA execution package/action binding required.' USING ERRCODE='23514'; END IF;
  ELSE
    IF OLD.status<>'PENDING' OR NEW.status NOT IN ('APPROVED','REJECTED') OR NEW.decided_at IS NULL OR NEW.decided_by_user_id IS NULL
      OR (to_jsonb(OLD)-ARRAY['status','decided_at','decided_by_user_id']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','decided_at','decided_by_user_id'])
      THEN RAISE EXCEPTION 'Execution approvals permit one immutable human decision.' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER execution_approval_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.execution_approvals FOR EACH ROW EXECUTE FUNCTION public.protect_execution_approval();
--> statement-breakpoint
CREATE FUNCTION public.protect_execution_record() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE a public.execution_approvals; p public.execution_records;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Execution history is retained.' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    SELECT * INTO a FROM public.execution_approvals WHERE workspace_id=NEW.workspace_id AND id=NEW.approval_id;
    IF NOT FOUND OR a.status<>'APPROVED' OR a.implementation_package_id<>NEW.implementation_package_id OR a.fixture_id<>NEW.fixture_id OR a.opportunity_id<>NEW.opportunity_id OR a.client_id<>NEW.client_id OR a.website_id<>NEW.website_id
      OR a.action_summary IS DISTINCT FROM NEW.action_summary OR a.action_hash IS DISTINCT FROM NEW.action_hash OR NEW.action_key<>'qa.metadata.apply' OR NEW.action_version<>'qa.metadata.apply-v1.0' OR NEW.target IS DISTINCT FROM a.action_summary->>'target' OR NEW.status<>'QUEUED'
      THEN RAISE EXCEPTION 'Exact approved execution binding required.' USING ERRCODE='23514'; END IF;
    IF NEW.kind='APPLY' AND NEW.pre_change_snapshot IS DISTINCT FROM a.action_summary->'before' THEN RAISE EXCEPTION 'Approved precondition required.' USING ERRCODE='23514'; END IF;
    IF NEW.kind='ROLLBACK' THEN
      SELECT * INTO p FROM public.execution_records WHERE workspace_id=NEW.workspace_id AND id=NEW.parent_execution_id;
      IF NOT FOUND OR p.kind<>'APPLY' OR p.approval_id<>NEW.approval_id OR p.post_change_snapshot IS NULL OR NEW.pre_change_snapshot IS DISTINCT FROM p.post_change_snapshot THEN RAISE EXCEPTION 'Exact rollback parent snapshot required.' USING ERRCODE='23514'; END IF;
    END IF;
  ELSE
    IF OLD.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Terminal execution history is immutable.' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(OLD)-ARRAY['status','post_change_snapshot','change_id','verification_run_id','verification_status','verification_snapshot','started_at','completed_at','error_summary','updated_at']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','post_change_snapshot','change_id','verification_run_id','verification_status','verification_snapshot','started_at','completed_at','error_summary','updated_at']) THEN RAISE EXCEPTION 'Approved execution content is immutable.' USING ERRCODE='23514'; END IF;
    IF NOT ((OLD.status='QUEUED' AND NEW.status IN ('RUNNING','BLOCKED','FAILED')) OR (OLD.status='RUNNING' AND NEW.status IN ('SUCCEEDED','FAILED','BLOCKED')) OR (OLD.status='SUCCEEDED' AND NEW.status IN ('VERIFYING','FAILED')) OR (OLD.status='VERIFYING' AND NEW.status IN ('VERIFIED','FAILED','SUCCEEDED','ROLLED_BACK','ROLLBACK_FAILED'))) THEN RAISE EXCEPTION 'Invalid execution transition.' USING ERRCODE='23514'; END IF;
    IF OLD.post_change_snapshot IS NOT NULL AND NEW.post_change_snapshot IS DISTINCT FROM OLD.post_change_snapshot THEN RAISE EXCEPTION 'Post-change snapshot is immutable.' USING ERRCODE='23514'; END IF;
    IF OLD.verification_run_id IS NOT NULL AND NEW.verification_run_id IS DISTINCT FROM OLD.verification_run_id THEN RAISE EXCEPTION 'Verification binding is immutable.' USING ERRCODE='23514'; END IF;
    IF NEW.status IN ('VERIFIED','ROLLED_BACK') AND (NEW.verification_status IS DISTINCT FROM 'VERIFIED' OR NEW.verification_snapshot->>'result' IS DISTINCT FROM 'VERIFIED' OR NEW.verification_run_id IS NULL) THEN RAISE EXCEPTION 'Independent verified evidence required.' USING ERRCODE='23514'; END IF;
    IF NEW.status IN ('FAILED','BLOCKED','VERIFIED','ROLLED_BACK','ROLLBACK_FAILED') AND NEW.completed_at IS NULL THEN RAISE EXCEPTION 'Terminal timestamp required.' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER execution_record_controlled BEFORE INSERT OR UPDATE OR DELETE ON public.execution_records FOR EACH ROW EXECUTE FUNCTION public.protect_execution_record();
--> statement-breakpoint
CREATE FUNCTION public.protect_qa_fixture_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF (to_jsonb(OLD)-ARRAY['title','description','revision','last_operation','last_change_id','updated_at']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['title','description','revision','last_operation','last_change_id','updated_at']) OR NEW.revision<>OLD.revision+1 OR NEW.last_change_id IS NULL OR NEW.last_change_id IS NOT DISTINCT FROM OLD.last_change_id
    THEN RAISE EXCEPTION 'QA fixture mutation must preserve scope and advance its version.' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.execution_records r WHERE r.workspace_id=NEW.workspace_id AND r.fixture_id=NEW.id AND r.status='RUNNING' AND NEW.last_change_id='qa:'||r.id::text AND NEW.last_operation=r.kind
    AND (r.pre_change_snapshot->>'revision')::integer=OLD.revision
    AND r.pre_change_snapshot->>'title'=OLD.title AND r.pre_change_snapshot->>'description'=OLD.description
    AND ((r.kind='APPLY' AND NEW.title=r.action_summary->'after'->>'title' AND NEW.description=r.action_summary->'after'->>'description')
      OR (r.kind='ROLLBACK' AND EXISTS(SELECT 1 FROM public.execution_records p WHERE p.workspace_id=r.workspace_id AND p.id=r.parent_execution_id AND NEW.title=p.pre_change_snapshot->>'title' AND NEW.description=p.pre_change_snapshot->>'description')))) THEN RAISE EXCEPTION 'A governed running execution is required.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qa_fixture_governed_mutation BEFORE UPDATE ON public.qa_execution_fixtures FOR EACH ROW EXECUTE FUNCTION public.protect_qa_fixture_mutation();
