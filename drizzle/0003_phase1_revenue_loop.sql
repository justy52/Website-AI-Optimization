CREATE TYPE "public"."audit_evidence_type" AS ENUM('HTTP_RESPONSE', 'HTML', 'HEADER', 'ROBOTS_TXT', 'SITEMAP_XML', 'STRUCTURED_DATA', 'LINK', 'TEXT', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."audit_result_status" AS ENUM('PASS', 'WARNING', 'FAIL', 'ERROR', 'UNAVAILABLE', 'NOT_APPLICABLE');--> statement-breakpoint
CREATE TYPE "public"."audit_run_status" AS ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."audit_score_category" AS ENUM('websitePerformance', 'seo', 'localSearch', 'conversion', 'aiReadiness', 'authority');--> statement-breakpoint
CREATE TYPE "public"."audit_status" AS ENUM('DRAFT', 'QUEUED', 'RUNNING', 'REVIEW_REQUIRED', 'READY_TO_FINALIZE', 'FINALIZED', 'FAILED', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."finding_severity" AS ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('DRAFT', 'FINALIZED');--> statement-breakpoint
CREATE TABLE "audit_category_scores" (
	"workspace_id" uuid NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"category" "audit_score_category" NOT NULL,
	"score" integer,
	"evidence_coverage_basis_points" integer DEFAULT 0 NOT NULL,
	"low_coverage" boolean DEFAULT true NOT NULL,
	"applicable_max_penalty" integer NOT NULL,
	"available_max_penalty" integer NOT NULL,
	"actual_penalty_basis_points" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_category_scores_pk" PRIMARY KEY("workspace_id","audit_run_id","category")
);
--> statement-breakpoint
CREATE TABLE "audit_check_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"check_key" text NOT NULL,
	"check_version" text NOT NULL,
	"category" "audit_score_category" NOT NULL,
	"status" "audit_result_status" NOT NULL,
	"severity" "finding_severity",
	"max_penalty_weight" integer NOT NULL,
	"reason" text NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"observed_value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"check_key" text,
	"evidence_type" "audit_evidence_type" NOT NULL,
	"source_url" text,
	"source_label" text NOT NULL,
	"http_status" integer,
	"content_hash" text,
	"excerpt" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"check_result_id" uuid NOT NULL,
	"check_key" text NOT NULL,
	"severity" "finding_severity" NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"status" "audit_run_status" DEFAULT 'QUEUED' NOT NULL,
	"scoring_definition_version" text DEFAULT 'dv-score-v1.0' NOT NULL,
	"check_catalog_version" text DEFAULT 'dv-score-v1.0' NOT NULL,
	"collector_version" text DEFAULT 'phase1-deterministic-v1.0' NOT NULL,
	"overall_score" integer,
	"provisional" boolean DEFAULT true NOT NULL,
	"evidence_coverage_basis_points" integer DEFAULT 0 NOT NULL,
	"error_summary" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"scoring_definition_version" text NOT NULL,
	"check_catalog_version" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"snapshot_hash" text NOT NULL,
	"finalized_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "audit_status" DEFAULT 'DRAFT' NOT NULL,
	"scoring_definition_version" text DEFAULT 'dv-score-v1.0' NOT NULL,
	"check_catalog_version" text DEFAULT 'dv-score-v1.0' NOT NULL,
	"started_by_user_id" text,
	"finalized_by_user_id" text,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"audit_snapshot_id" uuid,
	"status" "report_status" DEFAULT 'DRAFT' NOT NULL,
	"title" text NOT NULL,
	"executive_summary" text NOT NULL,
	"methodology_version" text NOT NULL,
	"report_data" jsonb NOT NULL,
	"created_by_user_id" text,
	"finalized_by_user_id" text,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_category_scores" ADD CONSTRAINT "audit_category_scores_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_category_scores" ADD CONSTRAINT "audit_category_scores_run_workspace_fk" FOREIGN KEY ("workspace_id","audit_run_id") REFERENCES "public"."audit_runs"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_check_results" ADD CONSTRAINT "audit_check_results_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_check_results" ADD CONSTRAINT "audit_check_results_run_workspace_fk" FOREIGN KEY ("workspace_id","audit_run_id","audit_id") REFERENCES "public"."audit_runs"("workspace_id","id","audit_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_evidence" ADD CONSTRAINT "audit_evidence_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_evidence" ADD CONSTRAINT "audit_evidence_run_workspace_fk" FOREIGN KEY ("workspace_id","audit_run_id") REFERENCES "public"."audit_runs"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_check_result_workspace_fk" FOREIGN KEY ("workspace_id","check_result_id") REFERENCES "public"."audit_check_results"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_runs" ADD CONSTRAINT "audit_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_runs" ADD CONSTRAINT "audit_runs_audit_workspace_fk" FOREIGN KEY ("workspace_id","audit_id","website_id") REFERENCES "public"."audits"("workspace_id","id","website_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_snapshots" ADD CONSTRAINT "audit_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_snapshots" ADD CONSTRAINT "audit_snapshots_run_workspace_fk" FOREIGN KEY ("workspace_id","audit_run_id","audit_id") REFERENCES "public"."audit_runs"("workspace_id","id","audit_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_started_by_user_id_user_id_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_finalized_by_user_id_user_id_fk" FOREIGN KEY ("finalized_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_website_workspace_fk" FOREIGN KEY ("workspace_id","website_id") REFERENCES "public"."websites"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_finalized_by_user_id_user_id_fk" FOREIGN KEY ("finalized_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_run_workspace_fk" FOREIGN KEY ("workspace_id","audit_run_id","audit_id") REFERENCES "public"."audit_runs"("workspace_id","id","audit_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_snapshot_workspace_fk" FOREIGN KEY ("workspace_id","audit_snapshot_id") REFERENCES "public"."audit_snapshots"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_check_results_workspace_id_id_unique" ON "audit_check_results" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_check_results_workspace_run_check_unique" ON "audit_check_results" USING btree ("workspace_id","audit_run_id","check_key");--> statement-breakpoint
CREATE INDEX "audit_check_results_workspace_audit_idx" ON "audit_check_results" USING btree ("workspace_id","audit_id");--> statement-breakpoint
CREATE INDEX "audit_check_results_workspace_status_idx" ON "audit_check_results" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_evidence_workspace_id_id_unique" ON "audit_evidence" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "audit_evidence_workspace_run_idx" ON "audit_evidence" USING btree ("workspace_id","audit_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_findings_workspace_id_id_unique" ON "audit_findings" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_findings_workspace_run_check_unique" ON "audit_findings" USING btree ("workspace_id","audit_run_id","check_key");--> statement-breakpoint
CREATE INDEX "audit_findings_workspace_audit_idx" ON "audit_findings" USING btree ("workspace_id","audit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_runs_workspace_id_id_unique" ON "audit_runs" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_runs_workspace_id_id_audit_id_unique" ON "audit_runs" USING btree ("workspace_id","id","audit_id");--> statement-breakpoint
CREATE INDEX "audit_runs_workspace_audit_idx" ON "audit_runs" USING btree ("workspace_id","audit_id");--> statement-breakpoint
CREATE INDEX "audit_runs_workspace_status_idx" ON "audit_runs" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_snapshots_workspace_id_id_unique" ON "audit_snapshots" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_snapshots_workspace_audit_unique" ON "audit_snapshots" USING btree ("workspace_id","audit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "audits_workspace_id_id_unique" ON "audits" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "audits_workspace_id_website_id_unique" ON "audits" USING btree ("workspace_id","id","website_id");--> statement-breakpoint
CREATE INDEX "audits_workspace_status_idx" ON "audits" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "audits_workspace_website_idx" ON "audits" USING btree ("workspace_id","website_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_workspace_id_id_unique" ON "reports" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "reports_workspace_audit_idx" ON "reports" USING btree ("workspace_id","audit_id");--> statement-breakpoint
CREATE INDEX "reports_workspace_status_idx" ON "reports" USING btree ("workspace_id","status");
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.user_id', true), '')
$$;
--> statement-breakpoint

DROP POLICY IF EXISTS "workspace_memberships_workspace_context" ON "workspace_memberships";
--> statement-breakpoint
CREATE POLICY "workspace_memberships_workspace_context_select" ON "workspace_memberships"
  FOR SELECT
  USING (
    "workspace_id" = public.current_app_workspace_id()
    OR (
      "user_id" = public.current_app_user_id()
      AND "status" = 'ACTIVE'
    )
  );
--> statement-breakpoint
CREATE POLICY "workspace_memberships_workspace_context_insert" ON "workspace_memberships"
  FOR INSERT
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint
CREATE POLICY "workspace_memberships_workspace_context_update" ON "workspace_memberships"
  FOR UPDATE
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint
CREATE POLICY "workspace_memberships_workspace_context_delete" ON "workspace_memberships"
  FOR DELETE
  USING ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "audits" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audits" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "audits_workspace_context" ON "audits"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "audit_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_runs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "audit_runs_workspace_context" ON "audit_runs"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "audit_evidence" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_evidence" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "audit_evidence_workspace_context" ON "audit_evidence"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "audit_check_results" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_check_results" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "audit_check_results_workspace_context" ON "audit_check_results"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "audit_category_scores" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_category_scores" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "audit_category_scores_workspace_context" ON "audit_category_scores"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "audit_findings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_findings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "audit_findings_workspace_context" ON "audit_findings"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "audit_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_snapshots" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "audit_snapshots_workspace_context" ON "audit_snapshots"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "reports" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "reports_workspace_context" ON "reports"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
