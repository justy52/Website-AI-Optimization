CREATE TYPE "public"."implementation_verification_status" AS ENUM('IMPLEMENTED_UNVERIFIED', 'VERIFIED', 'VERIFICATION_WARNING', 'VERIFICATION_FAILED');--> statement-breakpoint
CREATE TYPE "public"."monthly_cycle_creation_source" AS ENUM('MANUAL', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."monthly_cycle_status" AS ENUM('OPEN', 'IN_PROGRESS', 'REVIEW_REQUIRED', 'READY_TO_CLOSE', 'CLOSED', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."monthly_deliverable_status" AS ENUM('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'READY_FOR_REVIEW', 'COMPLETE', 'UNAVAILABLE', 'NOT_APPLICABLE', 'WAIVED');--> statement-breakpoint
CREATE TYPE "public"."monthly_deliverable_type" AS ENUM('WEBSITE_HEALTH', 'SEARCH_CONSOLE', 'COMPETITOR_REVIEW', 'AI_READINESS_RECHECK', 'OBSERVED_AI_VISIBILITY', 'MAJOR_CONTENT_ASSET', 'EXISTING_PAGE_OPTIMIZATION', 'MONTHLY_REPORT', 'QUARTERLY_STRATEGY');--> statement-breakpoint
CREATE TYPE "public"."monthly_report_status" AS ENUM('DRAFT', 'FINALIZED');--> statement-breakpoint
CREATE TYPE "public"."monthly_work_completion_state" AS ENUM('NOT_STARTED', 'DRAFT_PREPARED', 'APPROVED_FOR_MANUAL_IMPLEMENTATION', 'IMPLEMENTED_UNVERIFIED', 'VERIFIED', 'VERIFICATION_WARNING', 'VERIFICATION_FAILED');--> statement-breakpoint
CREATE TYPE "public"."monthly_work_item_status" AS ENUM('SELECTED', 'IN_PROGRESS', 'BLOCKED', 'REMOVED', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "implementation_verification_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"monthly_cycle_id" uuid NOT NULL,
	"cycle_work_item_id" uuid NOT NULL,
	"implementation_record_id" uuid,
	"client_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"status" "implementation_verification_status" NOT NULL,
	"verification_method" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"limitations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"verified_by_user_id" text,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_implementation_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"monthly_cycle_id" uuid NOT NULL,
	"cycle_work_item_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"artifact_id" uuid,
	"artifact_version" integer,
	"what_implemented" text NOT NULL,
	"implementation_date" date NOT NULL,
	"manual_minutes" integer NOT NULL,
	"implementation_notes" text,
	"evidence_reference" text,
	"qualifies_for_plan" boolean DEFAULT true NOT NULL,
	"entitlement_type" text DEFAULT 'manual_implementation_minutes' NOT NULL,
	"implemented_by_user_id" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_implementation_records_minutes_check" CHECK ("manual_implementation_records"."manual_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "monthly_cycle_deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"monthly_cycle_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid,
	"deliverable_key" text NOT NULL,
	"deliverable_type" "monthly_deliverable_type" NOT NULL,
	"title" text NOT NULL,
	"status" "monthly_deliverable_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"entitlement_source_rule" text NOT NULL,
	"service_plan_version" text NOT NULL,
	"target_count" integer DEFAULT 1 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"consumes_entitlement" boolean DEFAULT false NOT NULL,
	"entitlement_type" text,
	"entitlement_units" integer DEFAULT 0 NOT NULL,
	"supporting_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completion_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"limitations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by_user_id" text,
	"waived_at" timestamp with time zone,
	"waived_by_user_id" text,
	"waiver_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_cycle_deliverables_target_count_check" CHECK ("monthly_cycle_deliverables"."target_count" >= 0),
	CONSTRAINT "monthly_cycle_deliverables_completed_count_check" CHECK ("monthly_cycle_deliverables"."completed_count" >= 0),
	CONSTRAINT "monthly_cycle_deliverables_entitlement_units_check" CHECK ("monthly_cycle_deliverables"."entitlement_units" >= 0)
);
--> statement-breakpoint
CREATE TABLE "monthly_cycle_work_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"monthly_cycle_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"deliverable_id" uuid,
	"selected_reason" text NOT NULL,
	"contractual_deliverable_reason" text,
	"scope_fit" "opportunity_plan_scope" NOT NULL,
	"consumes_entitlement" boolean DEFAULT false NOT NULL,
	"entitlement_type" text,
	"entitlement_units" integer DEFAULT 0 NOT NULL,
	"estimated_effort" integer NOT NULL,
	"status" "monthly_work_item_status" DEFAULT 'SELECTED' NOT NULL,
	"draft_state" text DEFAULT 'NOT_REQUESTED' NOT NULL,
	"approval_state" text DEFAULT 'NOT_REQUESTED' NOT NULL,
	"completion_state" "monthly_work_completion_state" DEFAULT 'NOT_STARTED' NOT NULL,
	"manual_implementation_minutes" integer DEFAULT 0 NOT NULL,
	"selected_by_user_id" text,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"manual_override_reason" text,
	"removed_by_user_id" text,
	"removed_at" timestamp with time zone,
	"removal_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_cycle_work_items_entitlement_units_check" CHECK ("monthly_cycle_work_items"."entitlement_units" >= 0),
	CONSTRAINT "monthly_cycle_work_items_effort_check" CHECK ("monthly_cycle_work_items"."estimated_effort" BETWEEN 1 AND 5),
	CONSTRAINT "monthly_cycle_work_items_manual_minutes_check" CHECK ("monthly_cycle_work_items"."manual_implementation_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "monthly_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid,
	"service_plan" "service_plan" NOT NULL,
	"service_plan_version" text DEFAULT 'service-plans-v1.0' NOT NULL,
	"cycle_year" integer NOT NULL,
	"cycle_month" integer NOT NULL,
	"period_start_date" date NOT NULL,
	"period_end_date" date NOT NULL,
	"timezone" text DEFAULT 'America/Denver' NOT NULL,
	"status" "monthly_cycle_status" DEFAULT 'OPEN' NOT NULL,
	"creation_source" "monthly_cycle_creation_source" DEFAULT 'MANUAL' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"created_by_user_id" text,
	"entitlement_snapshot" jsonb NOT NULL,
	"internal_summary" text,
	"notes" text,
	"agent_work_units" integer DEFAULT 0 NOT NULL,
	"manual_implementation_minutes" integer DEFAULT 0 NOT NULL,
	"major_content_assets_completed" integer DEFAULT 0 NOT NULL,
	"existing_page_optimizations_completed" integer DEFAULT 0 NOT NULL,
	"ai_visibility_observations_used" integer DEFAULT 0 NOT NULL,
	"competitor_targets_active" integer DEFAULT 0 NOT NULL,
	"tracked_keywords_active" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_cycles_year_check" CHECK ("monthly_cycles"."cycle_year" BETWEEN 2000 AND 2200),
	CONSTRAINT "monthly_cycles_month_check" CHECK ("monthly_cycles"."cycle_month" BETWEEN 1 AND 12),
	CONSTRAINT "monthly_cycles_period_check" CHECK ("monthly_cycles"."period_start_date" <= "monthly_cycles"."period_end_date"),
	CONSTRAINT "monthly_cycles_agent_work_units_check" CHECK ("monthly_cycles"."agent_work_units" >= 0),
	CONSTRAINT "monthly_cycles_manual_minutes_check" CHECK ("monthly_cycles"."manual_implementation_minutes" >= 0),
	CONSTRAINT "monthly_cycles_major_content_check" CHECK ("monthly_cycles"."major_content_assets_completed" >= 0),
	CONSTRAINT "monthly_cycles_page_opt_check" CHECK ("monthly_cycles"."existing_page_optimizations_completed" >= 0),
	CONSTRAINT "monthly_cycles_ai_visibility_check" CHECK ("monthly_cycles"."ai_visibility_observations_used" >= 0),
	CONSTRAINT "monthly_cycles_competitors_check" CHECK ("monthly_cycles"."competitor_targets_active" >= 0),
	CONSTRAINT "monthly_cycles_keywords_check" CHECK ("monthly_cycles"."tracked_keywords_active" >= 0)
);
--> statement-breakpoint
CREATE TABLE "monthly_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"monthly_cycle_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"status" "monthly_report_status" DEFAULT 'DRAFT' NOT NULL,
	"title" text NOT NULL,
	"executive_summary" text NOT NULL,
	"methodology_version" text DEFAULT 'monthly-report-deterministic-v1.0' NOT NULL,
	"report_period_start_date" date NOT NULL,
	"report_period_end_date" date NOT NULL,
	"timezone" text NOT NULL,
	"service_plan" "service_plan" NOT NULL,
	"service_plan_version" text NOT NULL,
	"plan_snapshot" jsonb NOT NULL,
	"source_windows" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sections" jsonb NOT NULL,
	"data_limitations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"immutable_snapshot" jsonb,
	"snapshot_hash" text,
	"created_by_user_id" text,
	"finalized_by_user_id" text,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_reports_period_check" CHECK ("monthly_reports"."report_period_start_date" <= "monthly_reports"."report_period_end_date")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "manual_implementation_records_workspace_id_id_unique" ON "manual_implementation_records" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_cycle_deliverables_workspace_cycle_id_unique" ON "monthly_cycle_deliverables" USING btree ("workspace_id","monthly_cycle_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_cycle_work_items_workspace_id_id_unique" ON "monthly_cycle_work_items" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_cycles_workspace_client_id_unique" ON "monthly_cycles" USING btree ("workspace_id","client_id","id");--> statement-breakpoint
ALTER TABLE "implementation_verification_records" ADD CONSTRAINT "implementation_verification_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementation_verification_records" ADD CONSTRAINT "implementation_verification_records_verified_by_user_id_user_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementation_verification_records" ADD CONSTRAINT "implementation_verification_records_cycle_workspace_fk" FOREIGN KEY ("workspace_id","client_id","monthly_cycle_id") REFERENCES "public"."monthly_cycles"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementation_verification_records" ADD CONSTRAINT "implementation_verification_records_work_item_workspace_fk" FOREIGN KEY ("workspace_id","cycle_work_item_id") REFERENCES "public"."monthly_cycle_work_items"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementation_verification_records" ADD CONSTRAINT "implementation_verification_records_implementation_workspace_fk" FOREIGN KEY ("workspace_id","implementation_record_id") REFERENCES "public"."manual_implementation_records"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementation_verification_records" ADD CONSTRAINT "implementation_verification_records_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implementation_verification_records" ADD CONSTRAINT "implementation_verification_records_opportunity_workspace_fk" FOREIGN KEY ("workspace_id","client_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_implementation_records" ADD CONSTRAINT "manual_implementation_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_implementation_records" ADD CONSTRAINT "manual_implementation_records_implemented_by_user_id_user_id_fk" FOREIGN KEY ("implemented_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_implementation_records" ADD CONSTRAINT "manual_implementation_records_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_implementation_records" ADD CONSTRAINT "manual_implementation_records_cycle_workspace_fk" FOREIGN KEY ("workspace_id","client_id","monthly_cycle_id") REFERENCES "public"."monthly_cycles"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_implementation_records" ADD CONSTRAINT "manual_implementation_records_work_item_workspace_fk" FOREIGN KEY ("workspace_id","cycle_work_item_id") REFERENCES "public"."monthly_cycle_work_items"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_implementation_records" ADD CONSTRAINT "manual_implementation_records_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_implementation_records" ADD CONSTRAINT "manual_implementation_records_opportunity_workspace_fk" FOREIGN KEY ("workspace_id","client_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_implementation_records" ADD CONSTRAINT "manual_implementation_records_artifact_workspace_fk" FOREIGN KEY ("workspace_id","artifact_id","artifact_version") REFERENCES "public"."draft_artifacts"("workspace_id","id","artifact_version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cycle_deliverables" ADD CONSTRAINT "monthly_cycle_deliverables_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cycle_deliverables" ADD CONSTRAINT "monthly_cycle_deliverables_completed_by_user_id_user_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cycle_deliverables" ADD CONSTRAINT "monthly_cycle_deliverables_waived_by_user_id_user_id_fk" FOREIGN KEY ("waived_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cycle_deliverables" ADD CONSTRAINT "monthly_cycle_deliverables_cycle_workspace_fk" FOREIGN KEY ("workspace_id","client_id","monthly_cycle_id") REFERENCES "public"."monthly_cycles"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cycle_deliverables" ADD CONSTRAINT "monthly_cycle_deliverables_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cycle_work_items" ADD CONSTRAINT "monthly_cycle_work_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cycle_work_items" ADD CONSTRAINT "monthly_cycle_work_items_selected_by_user_id_user_id_fk" FOREIGN KEY ("selected_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cycle_work_items" ADD CONSTRAINT "monthly_cycle_work_items_removed_by_user_id_user_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cycle_work_items" ADD CONSTRAINT "monthly_cycle_work_items_cycle_workspace_fk" FOREIGN KEY ("workspace_id","client_id","monthly_cycle_id") REFERENCES "public"."monthly_cycles"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cycle_work_items" ADD CONSTRAINT "monthly_cycle_work_items_deliverable_workspace_fk" FOREIGN KEY ("workspace_id","monthly_cycle_id","deliverable_id") REFERENCES "public"."monthly_cycle_deliverables"("workspace_id","monthly_cycle_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cycle_work_items" ADD CONSTRAINT "monthly_cycle_work_items_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cycle_work_items" ADD CONSTRAINT "monthly_cycle_work_items_opportunity_workspace_fk" FOREIGN KEY ("workspace_id","client_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cycles" ADD CONSTRAINT "monthly_cycles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cycles" ADD CONSTRAINT "monthly_cycles_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cycles" ADD CONSTRAINT "monthly_cycles_client_workspace_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cycles" ADD CONSTRAINT "monthly_cycles_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_finalized_by_user_id_user_id_fk" FOREIGN KEY ("finalized_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_cycle_workspace_fk" FOREIGN KEY ("workspace_id","client_id","monthly_cycle_id") REFERENCES "public"."monthly_cycles"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "implementation_verification_records_workspace_id_id_unique" ON "implementation_verification_records" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "implementation_verification_records_workspace_cycle_idx" ON "implementation_verification_records" USING btree ("workspace_id","monthly_cycle_id","verified_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "manual_implementation_records_workspace_id_id_unique" ON "manual_implementation_records" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "manual_implementation_records_workspace_cycle_idx" ON "manual_implementation_records" USING btree ("workspace_id","monthly_cycle_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_cycle_deliverables_workspace_id_id_unique" ON "monthly_cycle_deliverables" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_cycle_deliverables_workspace_cycle_id_unique" ON "monthly_cycle_deliverables" USING btree ("workspace_id","monthly_cycle_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_cycle_deliverables_cycle_key_unique" ON "monthly_cycle_deliverables" USING btree ("workspace_id","monthly_cycle_id","deliverable_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monthly_cycle_deliverables_workspace_status_idx" ON "monthly_cycle_deliverables" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_cycle_work_items_workspace_id_id_unique" ON "monthly_cycle_work_items" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_cycle_work_items_cycle_opportunity_unique" ON "monthly_cycle_work_items" USING btree ("workspace_id","monthly_cycle_id","opportunity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monthly_cycle_work_items_workspace_cycle_idx" ON "monthly_cycle_work_items" USING btree ("workspace_id","monthly_cycle_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monthly_cycle_work_items_workspace_opportunity_idx" ON "monthly_cycle_work_items" USING btree ("workspace_id","opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_cycles_workspace_id_id_unique" ON "monthly_cycles" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_cycles_workspace_client_id_unique" ON "monthly_cycles" USING btree ("workspace_id","client_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_cycles_client_period_unique" ON "monthly_cycles" USING btree ("workspace_id","client_id","cycle_year","cycle_month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monthly_cycles_workspace_status_idx" ON "monthly_cycles" USING btree ("workspace_id","status","due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monthly_cycles_workspace_client_idx" ON "monthly_cycles" USING btree ("workspace_id","client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_reports_workspace_id_id_unique" ON "monthly_reports" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_reports_cycle_unique" ON "monthly_reports" USING btree ("workspace_id","monthly_cycle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monthly_reports_workspace_status_idx" ON "monthly_reports" USING btree ("workspace_id","status","created_at");
--> statement-breakpoint

ALTER TABLE "monthly_cycles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "monthly_cycles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "monthly_cycles_workspace_context" ON "monthly_cycles"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "monthly_cycle_deliverables" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "monthly_cycle_deliverables" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "monthly_cycle_deliverables_workspace_context" ON "monthly_cycle_deliverables"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "monthly_cycle_work_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "monthly_cycle_work_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "monthly_cycle_work_items_workspace_context" ON "monthly_cycle_work_items"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "manual_implementation_records" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "manual_implementation_records" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "manual_implementation_records_workspace_context" ON "manual_implementation_records"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "implementation_verification_records" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "implementation_verification_records" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "implementation_verification_records_workspace_context" ON "implementation_verification_records"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "monthly_reports" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "monthly_reports" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "monthly_reports_workspace_context" ON "monthly_reports"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

-- Phase 5 monthly-cycle dispatcher bootstrap:
-- The cron route is still CRON_SECRET gated and this helper returns only the
-- minimal tenant/client/period refs needed to enter tenant context before
-- material work. It creates no billing records and exposes no client data,
-- provider credentials, report contents, or work artifacts.
CREATE OR REPLACE FUNCTION public.bootstrap_due_monthly_cycle_clients(limit_count integer DEFAULT 50)
RETURNS TABLE(workspace_id uuid, client_id uuid, cycle_year integer, cycle_month integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_period AS (
    SELECT
      EXTRACT(YEAR FROM timezone('UTC', now()))::integer AS cycle_year,
      EXTRACT(MONTH FROM timezone('UTC', now()))::integer AS cycle_month
  )
  SELECT
    "clients"."workspace_id",
    "clients"."id",
    current_period.cycle_year,
    current_period.cycle_month
  FROM public."clients"
  CROSS JOIN current_period
  WHERE "clients"."status" = 'ACTIVE'
    AND "clients"."archived_at" IS NULL
    AND "clients"."service_plan" IN ('ESSENTIALS', 'GROWTH', 'PRO')
    AND NOT EXISTS (
      SELECT 1
      FROM public."monthly_cycles"
      WHERE "monthly_cycles"."workspace_id" = "clients"."workspace_id"
        AND "monthly_cycles"."client_id" = "clients"."id"
        AND "monthly_cycles"."cycle_year" = current_period.cycle_year
        AND "monthly_cycles"."cycle_month" = current_period.cycle_month
    )
  ORDER BY "clients"."updated_at" ASC
  LIMIT least(greatest(limit_count, 0), 100)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.bootstrap_due_monthly_cycle_clients(integer) FROM PUBLIC;
