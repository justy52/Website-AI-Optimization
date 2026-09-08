CREATE TYPE "public"."integration_oauth_state_status" AS ENUM('PENDING', 'CONSUMED', 'EXPIRED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."integration_secret_type" AS ENUM('OAUTH_TOKEN');--> statement-breakpoint
CREATE TYPE "public"."monitoring_observation_status" AS ENUM('PASS', 'WARNING', 'FAIL', 'ERROR', 'UNAVAILABLE', 'NOT_APPLICABLE');--> statement-breakpoint
CREATE TYPE "public"."monitoring_run_status" AS ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELED', 'TIMED_OUT', 'BUDGET_LIMITED');--> statement-breakpoint
CREATE TYPE "public"."monitoring_trigger_type" AS ENUM('SCHEDULE', 'MANUAL', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."search_console_property_type" AS ENUM('URL_PREFIX', 'DOMAIN', 'UNKNOWN');--> statement-breakpoint
CREATE TABLE "competitor_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"competitor_target_id" uuid NOT NULL,
	"monitoring_run_id" uuid,
	"client_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"source_url" text NOT NULL,
	"http_status" integer,
	"observed_title" text,
	"observed_meta_description" text,
	"content_hash" text NOT NULL,
	"changed_since_previous" boolean DEFAULT false NOT NULL,
	"change_summary" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"limitations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"canonical_url" text NOT NULL,
	"relationship" text DEFAULT 'DIRECT_COMPETITOR' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "integration_oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"state_hash" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"redirect_path" text,
	"status" "integration_oauth_state_status" DEFAULT 'PENDING' NOT NULL,
	"created_by_user_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"integration_connection_id" uuid NOT NULL,
	"secret_type" "integration_secret_type" NOT NULL,
	"algorithm" text NOT NULL,
	"key_version" text NOT NULL,
	"nonce" text NOT NULL,
	"ciphertext" text NOT NULL,
	"auth_tag" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "monitoring_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"monitoring_run_id" uuid NOT NULL,
	"monitoring_schedule_id" uuid,
	"client_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"observation_key" text NOT NULL,
	"observation_type" text NOT NULL,
	"source_provider" text DEFAULT 'optiq' NOT NULL,
	"source_url" text,
	"status" "monitoring_observation_status" NOT NULL,
	"severity" "risk_level" DEFAULT 'LOW' NOT NULL,
	"evidence_confidence" "evidence_confidence" DEFAULT 'LOW' NOT NULL,
	"content_hash" text,
	"summary" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"limitations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitoring_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"monitoring_schedule_id" uuid,
	"client_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"audit_id" uuid,
	"audit_run_id" uuid,
	"monitor_key" text NOT NULL,
	"monitor_version" text NOT NULL,
	"trigger_type" "monitoring_trigger_type" NOT NULL,
	"status" "monitoring_run_status" DEFAULT 'QUEUED' NOT NULL,
	"source_provider" text DEFAULT 'optiq' NOT NULL,
	"observations_produced" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_summary" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"workflow_run_id" text,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitoring_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"monitor_key" text NOT NULL,
	"monitor_version" text NOT NULL,
	"cadence" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error_summary" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "search_console_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"integration_connection_id" uuid NOT NULL,
	"search_console_property_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"window_start_date" date NOT NULL,
	"window_end_date" date NOT NULL,
	"property_url" text NOT NULL,
	"query" text,
	"page" text,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"ctr_basis_points" integer DEFAULT 0 NOT NULL,
	"average_position_basis_points" integer DEFAULT 0 NOT NULL,
	"source_provider" text DEFAULT 'google_search_console' NOT NULL,
	"source_timezone" text DEFAULT 'UTC' NOT NULL,
	"completeness" text DEFAULT 'COMPLETE' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_console_observations_clicks_check" CHECK ("search_console_observations"."clicks" >= 0),
	CONSTRAINT "search_console_observations_impressions_check" CHECK ("search_console_observations"."impressions" >= 0),
	CONSTRAINT "search_console_observations_ctr_check" CHECK ("search_console_observations"."ctr_basis_points" BETWEEN 0 AND 10000),
	CONSTRAINT "search_console_observations_position_check" CHECK ("search_console_observations"."average_position_basis_points" >= 0)
);
--> statement-breakpoint
CREATE TABLE "search_console_properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"integration_connection_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"property_url" text NOT NULL,
	"property_type" "search_console_property_type" DEFAULT 'UNKNOWN' NOT NULL,
	"permission_level" text,
	"verified_site_match" boolean DEFAULT false NOT NULL,
	"selected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_targets_workspace_id_id_unique" ON "competitor_targets" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "monitoring_runs_workspace_id_id_unique" ON "monitoring_runs" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "monitoring_schedules_workspace_id_id_unique" ON "monitoring_schedules" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "search_console_properties_workspace_id_id_unique" ON "search_console_properties" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "competitor_observations" ADD CONSTRAINT "competitor_observations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_observations" ADD CONSTRAINT "competitor_observations_target_workspace_fk" FOREIGN KEY ("workspace_id","competitor_target_id") REFERENCES "public"."competitor_targets"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_observations" ADD CONSTRAINT "competitor_observations_run_workspace_fk" FOREIGN KEY ("workspace_id","monitoring_run_id") REFERENCES "public"."monitoring_runs"("workspace_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_observations" ADD CONSTRAINT "competitor_observations_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_targets" ADD CONSTRAINT "competitor_targets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_targets" ADD CONSTRAINT "competitor_targets_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_targets" ADD CONSTRAINT "competitor_targets_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_oauth_states" ADD CONSTRAINT "integration_oauth_states_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_oauth_states" ADD CONSTRAINT "integration_oauth_states_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_oauth_states" ADD CONSTRAINT "integration_oauth_states_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_secrets" ADD CONSTRAINT "integration_secrets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_secrets" ADD CONSTRAINT "integration_secrets_connection_workspace_fk" FOREIGN KEY ("workspace_id","integration_connection_id") REFERENCES "public"."integration_connections"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_observations" ADD CONSTRAINT "monitoring_observations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_observations" ADD CONSTRAINT "monitoring_observations_run_workspace_fk" FOREIGN KEY ("workspace_id","monitoring_run_id") REFERENCES "public"."monitoring_runs"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_observations" ADD CONSTRAINT "monitoring_observations_schedule_workspace_fk" FOREIGN KEY ("workspace_id","monitoring_schedule_id") REFERENCES "public"."monitoring_schedules"("workspace_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_observations" ADD CONSTRAINT "monitoring_observations_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_runs" ADD CONSTRAINT "monitoring_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_runs" ADD CONSTRAINT "monitoring_runs_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_runs" ADD CONSTRAINT "monitoring_runs_schedule_workspace_fk" FOREIGN KEY ("workspace_id","monitoring_schedule_id") REFERENCES "public"."monitoring_schedules"("workspace_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_runs" ADD CONSTRAINT "monitoring_runs_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_runs" ADD CONSTRAINT "monitoring_runs_audit_run_workspace_fk" FOREIGN KEY ("workspace_id","audit_run_id","audit_id") REFERENCES "public"."audit_runs"("workspace_id","id","audit_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_schedules" ADD CONSTRAINT "monitoring_schedules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_schedules" ADD CONSTRAINT "monitoring_schedules_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_schedules" ADD CONSTRAINT "monitoring_schedules_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_console_observations" ADD CONSTRAINT "search_console_observations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_console_observations" ADD CONSTRAINT "search_console_observations_connection_workspace_fk" FOREIGN KEY ("workspace_id","integration_connection_id") REFERENCES "public"."integration_connections"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_console_observations" ADD CONSTRAINT "search_console_observations_property_workspace_fk" FOREIGN KEY ("workspace_id","search_console_property_id") REFERENCES "public"."search_console_properties"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_console_observations" ADD CONSTRAINT "search_console_observations_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_console_properties" ADD CONSTRAINT "search_console_properties_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_console_properties" ADD CONSTRAINT "search_console_properties_connection_workspace_fk" FOREIGN KEY ("workspace_id","integration_connection_id") REFERENCES "public"."integration_connections"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_console_properties" ADD CONSTRAINT "search_console_properties_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_observations_workspace_id_id_unique" ON "competitor_observations" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "competitor_observations_workspace_target_idx" ON "competitor_observations" USING btree ("workspace_id","competitor_target_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_targets_workspace_website_domain_unique" ON "competitor_targets" USING btree ("workspace_id","website_id","domain");--> statement-breakpoint
CREATE INDEX "competitor_targets_workspace_site_idx" ON "competitor_targets" USING btree ("workspace_id","website_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_oauth_states_workspace_id_id_unique" ON "integration_oauth_states" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_oauth_states_state_hash_unique" ON "integration_oauth_states" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "integration_oauth_states_workspace_status_idx" ON "integration_oauth_states" USING btree ("workspace_id","status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_secrets_workspace_id_id_unique" ON "integration_secrets" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_secrets_connection_type_unique" ON "integration_secrets" USING btree ("workspace_id","integration_connection_id","secret_type");--> statement-breakpoint
CREATE UNIQUE INDEX "monitoring_observations_workspace_id_id_unique" ON "monitoring_observations" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "monitoring_observations_workspace_run_idx" ON "monitoring_observations" USING btree ("workspace_id","monitoring_run_id");--> statement-breakpoint
CREATE INDEX "monitoring_observations_workspace_site_idx" ON "monitoring_observations" USING btree ("workspace_id","website_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "monitoring_runs_idempotency_unique" ON "monitoring_runs" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "monitoring_runs_workspace_status_idx" ON "monitoring_runs" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "monitoring_schedules_active_target_unique" ON "monitoring_schedules" USING btree ("workspace_id","website_id","monitor_key","monitor_version");--> statement-breakpoint
CREATE INDEX "monitoring_schedules_due_idx" ON "monitoring_schedules" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "search_console_observations_workspace_id_id_unique" ON "search_console_observations" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "search_console_observations_workspace_property_idx" ON "search_console_observations" USING btree ("workspace_id","search_console_property_id","window_end_date");--> statement-breakpoint
CREATE UNIQUE INDEX "search_console_properties_connection_property_unique" ON "search_console_properties" USING btree ("workspace_id","integration_connection_id","property_url");--> statement-breakpoint
CREATE INDEX "search_console_properties_workspace_website_idx" ON "search_console_properties" USING btree ("workspace_id","website_id","selected");
--> statement-breakpoint

ALTER TABLE "integration_oauth_states" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "integration_oauth_states" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "integration_oauth_states_workspace_context" ON "integration_oauth_states"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "integration_secrets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "integration_secrets" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "integration_secrets_workspace_context" ON "integration_secrets"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "search_console_properties" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "search_console_properties" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "search_console_properties_workspace_context" ON "search_console_properties"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "search_console_observations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "search_console_observations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "search_console_observations_workspace_context" ON "search_console_observations"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "monitoring_schedules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "monitoring_schedules" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "monitoring_schedules_workspace_context" ON "monitoring_schedules"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "monitoring_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "monitoring_runs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "monitoring_runs_workspace_context" ON "monitoring_runs"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "monitoring_observations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "monitoring_observations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "monitoring_observations_workspace_context" ON "monitoring_observations"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "competitor_targets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "competitor_targets" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "competitor_targets_workspace_context" ON "competitor_targets"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "competitor_observations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "competitor_observations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "competitor_observations_workspace_context" ON "competitor_observations"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

-- Phase 4A cron dispatcher bootstrap:
-- The browser and normal app never use this function. It exposes only due
-- schedule references to the server-side cron route, which must also present
-- CRON_SECRET before scheduling tenant-scoped Workflow runs. It returns no
-- credentials, observations, client data, or integration tokens.
CREATE OR REPLACE FUNCTION public.bootstrap_due_monitoring_schedules(limit_count integer DEFAULT 25)
RETURNS TABLE(workspace_id uuid, schedule_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "monitoring_schedules"."workspace_id", "monitoring_schedules"."id"
  FROM public."monitoring_schedules"
  WHERE "monitoring_schedules"."enabled" = true
    AND "monitoring_schedules"."archived_at" IS NULL
    AND "monitoring_schedules"."next_run_at" IS NOT NULL
    AND "monitoring_schedules"."next_run_at" <= now()
  ORDER BY "monitoring_schedules"."next_run_at" ASC
  LIMIT least(greatest(limit_count, 0), 100)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.bootstrap_due_monitoring_schedules(integer) FROM PUBLIC;
