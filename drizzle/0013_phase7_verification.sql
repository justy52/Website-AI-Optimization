ALTER TYPE "public"."implementation_verification_status" ADD VALUE 'UNAVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."monthly_work_completion_state" ADD VALUE 'UNAVAILABLE';--> statement-breakpoint
CREATE TABLE "implementation_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"artifact_version" integer NOT NULL,
	"approval_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "implementation_packages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.implementation_packages FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY implementation_packages_workspace_context ON public.implementation_packages
  USING (workspace_id = public.current_app_workspace_id())
  WITH CHECK (workspace_id = public.current_app_workspace_id());
--> statement-breakpoint
ALTER TABLE "implementation_verification_records" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "implementation_verification_records" ADD COLUMN "implementation_package_id" uuid;--> statement-breakpoint
ALTER TABLE "implementation_verification_records" ADD COLUMN "method_kind" text DEFAULT 'HUMAN' NOT NULL;--> statement-breakpoint
ALTER TABLE "manual_implementation_records" ADD COLUMN "implementation_package_id" uuid;--> statement-breakpoint
ALTER TABLE "implementation_packages" ADD CONSTRAINT "implementation_packages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementation_packages" ADD CONSTRAINT "implementation_packages_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementation_packages" ADD CONSTRAINT "implementation_packages_site_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementation_packages" ADD CONSTRAINT "implementation_packages_opportunity_fk" FOREIGN KEY ("workspace_id","client_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","client_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementation_packages" ADD CONSTRAINT "implementation_packages_artifact_fk" FOREIGN KEY ("workspace_id","artifact_id","artifact_version") REFERENCES "public"."draft_artifacts"("workspace_id","id","artifact_version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementation_packages" ADD CONSTRAINT "implementation_packages_approval_fk" FOREIGN KEY ("workspace_id","approval_id") REFERENCES "public"."approval_requests"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "implementation_packages_workspace_id_unique" ON "implementation_packages" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "implementation_packages_artifact_unique" ON "implementation_packages" USING btree ("workspace_id","artifact_id","artifact_version");--> statement-breakpoint
CREATE UNIQUE INDEX "implementation_packages_binding_unique" ON "implementation_packages" USING btree ("workspace_id","id","artifact_id","artifact_version");--> statement-breakpoint
ALTER TABLE "implementation_verification_records" ADD CONSTRAINT "implementation_verification_run_fk" FOREIGN KEY ("workspace_id","agent_run_id") REFERENCES "public"."agent_runs"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementation_verification_records" ADD CONSTRAINT "implementation_verification_package_fk" FOREIGN KEY ("workspace_id","implementation_package_id") REFERENCES "public"."implementation_packages"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_implementation_records" ADD CONSTRAINT "manual_implementation_package_binding_fk" FOREIGN KEY ("workspace_id","implementation_package_id","artifact_id","artifact_version") REFERENCES "public"."implementation_packages"("workspace_id","id","artifact_id","artifact_version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "implementation_verification_run_unique" ON "implementation_verification_records" USING btree ("workspace_id","agent_run_id");--> statement-breakpoint
ALTER TABLE "implementation_verification_records" ADD CONSTRAINT "implementation_verification_method_check" CHECK ("implementation_verification_records"."method_kind" in ('HUMAN', 'DETERMINISTIC'));--> statement-breakpoint
ALTER TABLE "manual_implementation_records" ADD CONSTRAINT "manual_implementation_package_binding_check" CHECK ("manual_implementation_records"."implementation_package_id" is null or ("manual_implementation_records"."artifact_id" is not null and "manual_implementation_records"."artifact_version" is not null));
--> statement-breakpoint
INSERT INTO agent_definitions (key, version, name, capability_type, default_permission_level, allowed_tool_keys, default_timeout_seconds, budget_limits, output_schema_version, enabled) VALUES ('verification', 'verification-v1.1', 'Verification Agent', 'VERIFICATION', 'OBSERVE', '["read.implementation_package.v1","read.public_verification_target.v1","compare.approved_implementation.v1"]'::jsonb, 45, '{"maxToolCalls":3,"maxModelCalls":0,"maxEvidenceBytes":262144,"maxInputBytes":24000,"maxOutputBytes":16000,"maxOutputTokens":0,"maxCostCents":0}'::jsonb, 'implementation-verification-v1.0', true) ON CONFLICT (key, version) DO NOTHING;

--> statement-breakpoint
CREATE FUNCTION public.protect_implementation_package() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Implementation packages are immutable approved-version snapshots.' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.draft_artifacts a JOIN public.approval_requests r
      ON r.workspace_id=a.workspace_id AND r.target_artifact_id=a.id AND r.target_artifact_version=a.artifact_version
    WHERE a.workspace_id=NEW.workspace_id AND a.id=NEW.artifact_id AND a.artifact_version=NEW.artifact_version
      AND a.client_id=NEW.client_id AND a.website_id=NEW.website_id AND a.opportunity_id=NEW.opportunity_id
      AND a.status='APPROVED' AND r.id=NEW.approval_id AND r.status='APPROVED' AND r.proposed_external_execution=false
      AND NEW.snapshot->>'artifactId'=a.id::text AND (NEW.snapshot->>'artifactVersion')::integer=a.artifact_version
      AND NEW.snapshot->>'artifactHash'=a.content_hash
  ) THEN RAISE EXCEPTION 'Exact approved artifact/package binding required.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER implementation_package_immutable_binding BEFORE INSERT OR UPDATE ON public.implementation_packages FOR EACH ROW EXECUTE FUNCTION public.protect_implementation_package();
--> statement-breakpoint
CREATE FUNCTION public.protect_verification_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'Verification attempts are historical; record a new attempt.' USING ERRCODE='23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER verification_history_immutable BEFORE UPDATE ON public.implementation_verification_records FOR EACH ROW EXECUTE FUNCTION public.protect_verification_history();
