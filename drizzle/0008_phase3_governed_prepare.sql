CREATE TYPE "public"."agent_permission_level" AS ENUM('OBSERVE', 'PREPARE', 'EXECUTE');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELED', 'TIMED_OUT', 'BUDGET_LIMITED', 'BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."agent_tool_call_status" AS ENUM('SUCCEEDED', 'FAILED', 'SKIPPED', 'BUDGET_LIMITED');--> statement-breakpoint
CREATE TYPE "public"."agent_trigger_type" AS ENUM('USER', 'SCHEDULE', 'EVENT', 'ORCHESTRATOR');--> statement-breakpoint
CREATE TYPE "public"."approval_decision" AS ENUM('APPROVED_UNCHANGED', 'APPROVED_MINOR_EDIT', 'APPROVED_MAJOR_EDIT', 'REJECTED', 'CHANGES_REQUESTED');--> statement-breakpoint
CREATE TYPE "public"."approval_request_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'EXPIRED', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."claim_policy_rule_type" AS ENUM('ALLOWED', 'REQUIRES_APPROVAL', 'PROHIBITED', 'REQUIRED_DISCLAIMER', 'STRICTER_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."draft_artifact_status" AS ENUM('DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."draft_artifact_type" AS ENUM('METADATA_PROPOSAL', 'EXISTING_PAGE_OPTIMIZATION_PROPOSAL', 'INTERNAL_LINK_PROPOSAL', 'SCHEMA_PROPOSAL', 'CONTENT_BRIEF', 'CONTENT_DRAFT', 'CLIENT_MESSAGE_DRAFT', 'REPORT_SECTION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."fact_sensitivity" AS ENUM('PUBLIC', 'INTERNAL', 'CONFIDENTIAL');--> statement-breakpoint
CREATE TYPE "public"."fact_verification_status" AS ENUM('VERIFIED', 'SOURCE_DERIVED_DRAFT', 'NEEDS_REVIEW', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."knowledge_source_type" AS ENUM('WEBSITE_PAGE', 'ONBOARDING_ANSWER', 'SERVICE_LIST', 'SERVICE_AREA', 'PRICING_STATEMENT', 'CREDENTIAL_LICENSE', 'WARRANTY_GUARANTEE', 'BRAND_GUIDANCE', 'REFERENCE_MATERIAL');--> statement-breakpoint
CREATE TYPE "public"."operational_notification_status" AS ENUM('UNREAD', 'READ', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TABLE "agent_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"version" text NOT NULL,
	"name" text NOT NULL,
	"capability_type" text NOT NULL,
	"default_permission_level" "agent_permission_level" NOT NULL,
	"allowed_tool_keys" jsonb NOT NULL,
	"default_timeout_seconds" integer NOT NULL,
	"budget_limits" jsonb NOT NULL,
	"output_schema_version" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_definition_id" uuid,
	"client_id" uuid,
	"website_id" uuid,
	"audit_id" uuid,
	"opportunity_id" uuid,
	"work_plan_cycle_id" uuid,
	"parent_run_id" uuid,
	"trigger_type" "agent_trigger_type" NOT NULL,
	"agent_key" text NOT NULL,
	"agent_version" text NOT NULL,
	"permission_level" "agent_permission_level" NOT NULL,
	"status" "agent_run_status" DEFAULT 'QUEUED' NOT NULL,
	"input_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_tool_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"budget_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timeout_seconds" integer NOT NULL,
	"deadline_at" timestamp with time zone,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_template_version" text NOT NULL,
	"output_schema_version" text NOT NULL,
	"structured_output" jsonb,
	"output_ref" text,
	"rationale" text,
	"confidence" "evidence_confidence",
	"source" text,
	"next_action" text,
	"estimated_tool_calls" integer DEFAULT 0 NOT NULL,
	"actual_tool_calls" integer DEFAULT 0 NOT NULL,
	"estimated_model_calls" integer DEFAULT 0 NOT NULL,
	"actual_model_calls" integer DEFAULT 0 NOT NULL,
	"estimated_input_tokens" integer DEFAULT 0 NOT NULL,
	"actual_input_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_output_tokens" integer DEFAULT 0 NOT NULL,
	"actual_output_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_cents" integer DEFAULT 0 NOT NULL,
	"actual_cost_cents" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_summary" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"workflow_run_id" text,
	"created_by_user_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_runs_timeout_positive_check" CHECK ("agent_runs"."timeout_seconds" > 0)
);
--> statement-breakpoint
CREATE TABLE "agent_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"tool_key" text NOT NULL,
	"tool_version" text NOT NULL,
	"permission_level" "agent_permission_level" NOT NULL,
	"target_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "agent_tool_call_status" NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"external_request_id" text,
	"error_summary" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid,
	"website_id" uuid,
	"opportunity_id" uuid,
	"request_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_artifact_id" uuid NOT NULL,
	"target_artifact_version" integer NOT NULL,
	"risk_level" "risk_level" NOT NULL,
	"requested_by_user_id" text,
	"requested_by_agent_run_id" uuid,
	"status" "approval_request_status" DEFAULT 'PENDING' NOT NULL,
	"decision" "approval_decision",
	"approver_user_id" text,
	"decision_comments" text,
	"decision_reason_category" text,
	"immutable_summary" jsonb NOT NULL,
	"proposed_external_execution" boolean DEFAULT false NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_requests_no_external_execute_phase3_check" CHECK ("approval_requests"."proposed_external_execution" = false)
);
--> statement-breakpoint
CREATE TABLE "business_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid,
	"knowledge_source_id" uuid,
	"fact_type" text NOT NULL,
	"value" text NOT NULL,
	"structured_value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_reference" text NOT NULL,
	"verification_status" "fact_verification_status" DEFAULT 'NEEDS_REVIEW' NOT NULL,
	"approved_by_user_id" text,
	"sensitivity" "fact_sensitivity" DEFAULT 'PUBLIC' NOT NULL,
	"effective_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "claim_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"rule_type" "claim_policy_rule_type" NOT NULL,
	"claim_category" text NOT NULL,
	"rule" text NOT NULL,
	"required_disclaimer" text,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "client_knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid,
	"source_type" "knowledge_source_type" NOT NULL,
	"title" text NOT NULL,
	"source_url" text,
	"source_ref" text,
	"excerpt" text,
	"verification_status" "fact_verification_status" DEFAULT 'NEEDS_REVIEW' NOT NULL,
	"approved_by_user_id" text,
	"sensitivity" "fact_sensitivity" DEFAULT 'PUBLIC' NOT NULL,
	"effective_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "draft_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid,
	"opportunity_id" uuid,
	"artifact_type" "draft_artifact_type" NOT NULL,
	"artifact_version" integer NOT NULL,
	"status" "draft_artifact_status" DEFAULT 'DRAFT' NOT NULL,
	"prepared_by_agent_run_id" uuid,
	"source_evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"structured_proposal" jsonb NOT NULL,
	"rendered_preview" text NOT NULL,
	"factual_basis_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risk_level" "risk_level" DEFAULT 'LOW' NOT NULL,
	"content_hash" text NOT NULL,
	"supersedes_artifact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "draft_artifacts_artifact_version_positive_check" CHECK ("draft_artifacts"."artifact_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "operational_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" text NOT NULL,
	"severity" "risk_level" DEFAULT 'LOW' NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"status" "operational_notification_status" DEFAULT 'UNREAD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_workspace_id_id_unique" ON "agent_runs" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_knowledge_sources_workspace_id_id_unique" ON "client_knowledge_sources" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_artifacts_workspace_id_id_unique" ON "draft_artifacts" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_artifacts_workspace_version_unique" ON "draft_artifacts" USING btree ("workspace_id","id","artifact_version");--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_definition_id_agent_definitions_id_fk" FOREIGN KEY ("agent_definition_id") REFERENCES "public"."agent_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_client_workspace_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_audit_workspace_fk" FOREIGN KEY ("workspace_id","audit_id") REFERENCES "public"."audits"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_opportunity_workspace_fk" FOREIGN KEY ("workspace_id","client_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","client_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_work_plan_cycle_workspace_fk" FOREIGN KEY ("workspace_id","client_id","work_plan_cycle_id") REFERENCES "public"."work_plan_cycles"("workspace_id","client_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_parent_workspace_fk" FOREIGN KEY ("workspace_id","parent_run_id") REFERENCES "public"."agent_runs"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_calls" ADD CONSTRAINT "agent_tool_calls_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_calls" ADD CONSTRAINT "agent_tool_calls_run_workspace_fk" FOREIGN KEY ("workspace_id","agent_run_id") REFERENCES "public"."agent_runs"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_approver_user_id_user_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_client_workspace_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_opportunity_workspace_fk" FOREIGN KEY ("workspace_id","client_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","client_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_artifact_version_workspace_fk" FOREIGN KEY ("workspace_id","target_artifact_id","target_artifact_version") REFERENCES "public"."draft_artifacts"("workspace_id","id","artifact_version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_agent_run_workspace_fk" FOREIGN KEY ("workspace_id","requested_by_agent_run_id") REFERENCES "public"."agent_runs"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_facts" ADD CONSTRAINT "business_facts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_facts" ADD CONSTRAINT "business_facts_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_facts" ADD CONSTRAINT "business_facts_client_workspace_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_facts" ADD CONSTRAINT "business_facts_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_facts" ADD CONSTRAINT "business_facts_knowledge_source_workspace_fk" FOREIGN KEY ("workspace_id","knowledge_source_id") REFERENCES "public"."client_knowledge_sources"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_policies" ADD CONSTRAINT "claim_policies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_policies" ADD CONSTRAINT "claim_policies_client_workspace_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_knowledge_sources" ADD CONSTRAINT "client_knowledge_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_knowledge_sources" ADD CONSTRAINT "client_knowledge_sources_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_knowledge_sources" ADD CONSTRAINT "client_knowledge_sources_client_workspace_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_knowledge_sources" ADD CONSTRAINT "client_knowledge_sources_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_artifacts" ADD CONSTRAINT "draft_artifacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_artifacts" ADD CONSTRAINT "draft_artifacts_client_workspace_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_artifacts" ADD CONSTRAINT "draft_artifacts_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_artifacts" ADD CONSTRAINT "draft_artifacts_opportunity_workspace_fk" FOREIGN KEY ("workspace_id","client_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","client_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_artifacts" ADD CONSTRAINT "draft_artifacts_agent_run_workspace_fk" FOREIGN KEY ("workspace_id","prepared_by_agent_run_id") REFERENCES "public"."agent_runs"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_artifacts" ADD CONSTRAINT "draft_artifacts_supersedes_workspace_fk" FOREIGN KEY ("workspace_id","supersedes_artifact_id") REFERENCES "public"."draft_artifacts"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_notifications" ADD CONSTRAINT "operational_notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_definitions_key_version_unique" ON "agent_definitions" USING btree ("key","version");--> statement-breakpoint
CREATE INDEX "agent_definitions_enabled_idx" ON "agent_definitions" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_workspace_idempotency_unique" ON "agent_runs" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "agent_runs_workspace_status_idx" ON "agent_runs" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "agent_runs_workspace_opportunity_idx" ON "agent_runs" USING btree ("workspace_id","opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_tool_calls_workspace_id_id_unique" ON "agent_tool_calls" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "agent_tool_calls_workspace_run_idx" ON "agent_tool_calls" USING btree ("workspace_id","agent_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_requests_workspace_id_id_unique" ON "approval_requests" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_requests_one_pending_artifact_version_unique" ON "approval_requests" USING btree ("workspace_id","target_artifact_id","target_artifact_version") WHERE "approval_requests"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "approval_requests_workspace_status_idx" ON "approval_requests" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "approval_requests_workspace_opportunity_idx" ON "approval_requests" USING btree ("workspace_id","opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_facts_workspace_id_id_unique" ON "business_facts" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "business_facts_workspace_client_idx" ON "business_facts" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_policies_workspace_id_id_unique" ON "claim_policies" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "claim_policies_workspace_client_idx" ON "claim_policies" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "client_knowledge_sources_workspace_client_idx" ON "client_knowledge_sources" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "draft_artifacts_workspace_opportunity_idx" ON "draft_artifacts" USING btree ("workspace_id","opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "operational_notifications_workspace_id_id_unique" ON "operational_notifications" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "operational_notifications_workspace_status_idx" ON "operational_notifications" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "operational_notifications_workspace_created_idx" ON "operational_notifications" USING btree ("workspace_id","created_at");
--> statement-breakpoint
ALTER TABLE "agent_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agent_runs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "agent_runs_workspace_context" ON "agent_runs"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "agent_tool_calls" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agent_tool_calls" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "agent_tool_calls_workspace_context" ON "agent_tool_calls"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "client_knowledge_sources" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "client_knowledge_sources" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "client_knowledge_sources_workspace_context" ON "client_knowledge_sources"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "business_facts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business_facts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "business_facts_workspace_context" ON "business_facts"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "claim_policies" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "claim_policies" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "claim_policies_workspace_context" ON "claim_policies"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "draft_artifacts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "draft_artifacts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "draft_artifacts_workspace_context" ON "draft_artifacts"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "approval_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "approval_requests" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "approval_requests_workspace_context" ON "approval_requests"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "operational_notifications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "operational_notifications" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "operational_notifications_workspace_context" ON "operational_notifications"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

INSERT INTO "agent_definitions" (
  "key",
  "version",
  "name",
  "capability_type",
  "default_permission_level",
  "allowed_tool_keys",
  "default_timeout_seconds",
  "budget_limits",
  "output_schema_version",
  "enabled"
) VALUES
  ('website-health', 'website-health-v1.0', 'Website Health Agent', 'WEBSITE_HEALTH', 'OBSERVE', $$["read.opportunity.v1","read.audit_results.v1","read.captured_evidence.v1","read.client_site_context.v1","read.service_plan_definition.v1","read.business_facts.v1"]$$::jsonb, 45, $${"maxToolCalls":5,"maxModelCalls":0,"maxEvidenceBytes":12000,"maxInputBytes":16000,"maxOutputBytes":4000,"maxOutputTokens":0,"maxCostCents":0}$$::jsonb, 'observe-output-v1.0', false),
  ('search-seo', 'search-seo-v1.0', 'Search / SEO Agent', 'SEARCH_SEO', 'OBSERVE', $$["read.opportunity.v1","read.audit_results.v1","read.captured_evidence.v1","read.client_site_context.v1","read.service_plan_definition.v1","read.business_facts.v1"]$$::jsonb, 45, $${"maxToolCalls":5,"maxModelCalls":0,"maxEvidenceBytes":12000,"maxInputBytes":16000,"maxOutputBytes":4000,"maxOutputTokens":0,"maxCostCents":0}$$::jsonb, 'observe-output-v1.0', false),
  ('keyword-competitor', 'keyword-competitor-v1.0', 'Keyword & Competitor Agent', 'KEYWORD_COMPETITOR', 'OBSERVE', $$["read.opportunity.v1","read.audit_results.v1","read.captured_evidence.v1","read.client_site_context.v1","read.service_plan_definition.v1","read.business_facts.v1"]$$::jsonb, 45, $${"maxToolCalls":5,"maxModelCalls":0,"maxEvidenceBytes":12000,"maxInputBytes":16000,"maxOutputBytes":4000,"maxOutputTokens":0,"maxCostCents":0}$$::jsonb, 'observe-output-v1.0', false),
  ('ai-visibility', 'ai-visibility-v1.0', 'AI Visibility Agent', 'AI_VISIBILITY', 'OBSERVE', $$["read.opportunity.v1","read.audit_results.v1","read.captured_evidence.v1","read.client_site_context.v1","read.service_plan_definition.v1","read.business_facts.v1"]$$::jsonb, 45, $${"maxToolCalls":5,"maxModelCalls":0,"maxEvidenceBytes":12000,"maxInputBytes":16000,"maxOutputBytes":4000,"maxOutputTokens":0,"maxCostCents":0}$$::jsonb, 'observe-output-v1.0', false),
  ('content-opportunity', 'content-opportunity-v1.0', 'Content Opportunity Agent', 'CONTENT_OPPORTUNITY', 'PREPARE', $$["read.opportunity.v1","read.audit_results.v1","read.captured_evidence.v1","read.client_site_context.v1","read.service_plan_definition.v1","read.business_facts.v1","create.draft_artifact.v1","create.approval_request.v1"]$$::jsonb, 60, $${"maxToolCalls":8,"maxModelCalls":1,"maxEvidenceBytes":18000,"maxInputBytes":24000,"maxOutputBytes":10000,"maxOutputTokens":1500,"maxCostCents":50}$$::jsonb, 'prepare-output-v1.0', false),
  ('content-production', 'content-production-v1.0', 'Content Production Agent', 'CONTENT_PRODUCTION', 'PREPARE', $$["read.opportunity.v1","read.audit_results.v1","read.captured_evidence.v1","read.client_site_context.v1","read.service_plan_definition.v1","read.business_facts.v1","create.draft_artifact.v1","create.approval_request.v1"]$$::jsonb, 60, $${"maxToolCalls":8,"maxModelCalls":1,"maxEvidenceBytes":18000,"maxInputBytes":24000,"maxOutputBytes":10000,"maxOutputTokens":1500,"maxCostCents":50}$$::jsonb, 'prepare-output-v1.0', false),
  ('existing-page-optimization', 'epo-prepare-v1.0', 'Existing Page Optimization PREPARE Agent', 'EXISTING_PAGE_OPTIMIZATION', 'PREPARE', $$["read.opportunity.v1","read.audit_results.v1","read.captured_evidence.v1","read.client_site_context.v1","read.service_plan_definition.v1","read.business_facts.v1","create.draft_artifact.v1","create.approval_request.v1"]$$::jsonb, 60, $${"maxToolCalls":8,"maxModelCalls":1,"maxEvidenceBytes":18000,"maxInputBytes":24000,"maxOutputBytes":10000,"maxOutputTokens":1500,"maxCostCents":50}$$::jsonb, 'existing-page-optimization-output-v1.0', true),
  ('internal-linking', 'internal-linking-v1.0', 'Internal Linking Agent', 'INTERNAL_LINKING', 'PREPARE', $$["read.opportunity.v1","read.audit_results.v1","read.captured_evidence.v1","read.client_site_context.v1","read.service_plan_definition.v1","read.business_facts.v1","create.draft_artifact.v1","create.approval_request.v1"]$$::jsonb, 60, $${"maxToolCalls":8,"maxModelCalls":1,"maxEvidenceBytes":18000,"maxInputBytes":24000,"maxOutputBytes":10000,"maxOutputTokens":1500,"maxCostCents":50}$$::jsonb, 'prepare-output-v1.0', false),
  ('schema', 'schema-v1.0', 'Schema Agent', 'SCHEMA', 'PREPARE', $$["read.opportunity.v1","read.audit_results.v1","read.captured_evidence.v1","read.client_site_context.v1","read.service_plan_definition.v1","read.business_facts.v1","create.draft_artifact.v1","create.approval_request.v1"]$$::jsonb, 60, $${"maxToolCalls":8,"maxModelCalls":1,"maxEvidenceBytes":18000,"maxInputBytes":24000,"maxOutputBytes":10000,"maxOutputTokens":1500,"maxCostCents":50}$$::jsonb, 'prepare-output-v1.0', false),
  ('conversion', 'conversion-v1.0', 'Conversion Agent', 'CONVERSION', 'PREPARE', $$["read.opportunity.v1","read.audit_results.v1","read.captured_evidence.v1","read.client_site_context.v1","read.service_plan_definition.v1","read.business_facts.v1","create.draft_artifact.v1","create.approval_request.v1"]$$::jsonb, 60, $${"maxToolCalls":8,"maxModelCalls":1,"maxEvidenceBytes":18000,"maxInputBytes":24000,"maxOutputBytes":10000,"maxOutputTokens":1500,"maxCostCents":50}$$::jsonb, 'prepare-output-v1.0', false),
  ('reporting', 'reporting-v1.0', 'Reporting Agent', 'REPORTING', 'PREPARE', $$["read.opportunity.v1","read.audit_results.v1","read.captured_evidence.v1","read.client_site_context.v1","read.service_plan_definition.v1","read.business_facts.v1","create.draft_artifact.v1","create.approval_request.v1"]$$::jsonb, 60, $${"maxToolCalls":8,"maxModelCalls":1,"maxEvidenceBytes":18000,"maxInputBytes":24000,"maxOutputBytes":10000,"maxOutputTokens":1500,"maxCostCents":50}$$::jsonb, 'prepare-output-v1.0', false),
  ('client-communication', 'client-communication-v1.0', 'Client Communication Drafting Agent', 'CLIENT_COMMUNICATION', 'PREPARE', $$["read.opportunity.v1","read.audit_results.v1","read.captured_evidence.v1","read.client_site_context.v1","read.service_plan_definition.v1","read.business_facts.v1","create.draft_artifact.v1","create.approval_request.v1"]$$::jsonb, 60, $${"maxToolCalls":8,"maxModelCalls":1,"maxEvidenceBytes":18000,"maxInputBytes":24000,"maxOutputBytes":10000,"maxOutputTokens":1500,"maxCostCents":50}$$::jsonb, 'prepare-output-v1.0', false),
  ('verification', 'verification-v1.0', 'Verification Agent', 'VERIFICATION', 'OBSERVE', $$["read.opportunity.v1","read.audit_results.v1","read.captured_evidence.v1","read.client_site_context.v1","read.service_plan_definition.v1","read.business_facts.v1"]$$::jsonb, 45, $${"maxToolCalls":5,"maxModelCalls":0,"maxEvidenceBytes":12000,"maxInputBytes":16000,"maxOutputBytes":4000,"maxOutputTokens":0,"maxCostCents":0}$$::jsonb, 'observe-output-v1.0', false),
  ('orchestrator', 'orchestrator-v1.0', 'Orchestrator', 'ORCHESTRATOR', 'PREPARE', $$["read.opportunity.v1","read.audit_results.v1","read.captured_evidence.v1","read.client_site_context.v1","read.service_plan_definition.v1","read.business_facts.v1","create.draft_artifact.v1","create.approval_request.v1"]$$::jsonb, 60, $${"maxToolCalls":8,"maxModelCalls":1,"maxEvidenceBytes":18000,"maxInputBytes":24000,"maxOutputBytes":10000,"maxOutputTokens":1500,"maxCostCents":50}$$::jsonb, 'prepare-output-v1.0', false)
ON CONFLICT ("key", "version") DO UPDATE SET
  "name" = EXCLUDED."name",
  "capability_type" = EXCLUDED."capability_type",
  "default_permission_level" = EXCLUDED."default_permission_level",
  "allowed_tool_keys" = EXCLUDED."allowed_tool_keys",
  "default_timeout_seconds" = EXCLUDED."default_timeout_seconds",
  "budget_limits" = EXCLUDED."budget_limits",
  "output_schema_version" = EXCLUDED."output_schema_version",
  "enabled" = EXCLUDED."enabled",
  "updated_at" = now();
