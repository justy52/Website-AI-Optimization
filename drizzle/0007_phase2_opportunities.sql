CREATE TYPE "public"."evidence_confidence" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."opportunity_approval_blocked_state" AS ENUM('NOT_BLOCKED', 'AWAITING_APPROVAL');--> statement-breakpoint
CREATE TYPE "public"."opportunity_client_input_state" AS ENUM('NOT_REQUIRED', 'REQUIRED', 'RECEIVED');--> statement-breakpoint
CREATE TYPE "public"."opportunity_dependency_state" AS ENUM('NONE', 'HARD_DEPENDENCY');--> statement-breakpoint
CREATE TYPE "public"."opportunity_plan_scope" AS ENUM('INCLUDED', 'MAY_REQUIRE_ADD_ON', 'OUT_OF_SCOPE');--> statement-breakpoint
CREATE TYPE "public"."opportunity_priority_band" AS ENUM('Immediate', 'High', 'Normal', 'Backlog', 'Low');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('DRAFT', 'READY', 'BLOCKED', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."work_plan_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"source_audit_id" uuid NOT NULL,
	"source_audit_run_id" uuid NOT NULL,
	"source_finding_id" uuid,
	"source_check_result_id" uuid NOT NULL,
	"source_check_key" text NOT NULL,
	"source_check_version" text NOT NULL,
	"source_result_status" "audit_result_status" NOT NULL,
	"source_severity" "finding_severity" NOT NULL,
	"source_evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_confidence" "evidence_confidence" NOT NULL,
	"category" "audit_score_category" NOT NULL,
	"normalized_remediation_family" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"recommended_action" text NOT NULL,
	"status" "opportunity_status" DEFAULT 'DRAFT' NOT NULL,
	"priority_definition_version" text DEFAULT 'op-priority-v1.0' NOT NULL,
	"impact" integer NOT NULL,
	"confidence" integer NOT NULL,
	"urgency" integer NOT NULL,
	"strategic_fit" integer NOT NULL,
	"plan_fit" integer NOT NULL,
	"staleness" integer DEFAULT 0 NOT NULL,
	"effort" integer NOT NULL,
	"dependency_state" "opportunity_dependency_state" DEFAULT 'NONE' NOT NULL,
	"client_input_state" "opportunity_client_input_state" DEFAULT 'NOT_REQUIRED' NOT NULL,
	"approval_blocked_state" "opportunity_approval_blocked_state" DEFAULT 'NOT_BLOCKED' NOT NULL,
	"base_priority" integer NOT NULL,
	"modifiers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"final_priority" integer NOT NULL,
	"priority_band" "opportunity_priority_band" NOT NULL,
	"priority_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plan_scope" "opportunity_plan_scope" NOT NULL,
	"owner_user_id" text,
	"immediate_attention" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "opportunities_impact_check" CHECK ("opportunities"."impact" BETWEEN 0 AND 5),
	CONSTRAINT "opportunities_confidence_check" CHECK ("opportunities"."confidence" BETWEEN 0 AND 5),
	CONSTRAINT "opportunities_urgency_check" CHECK ("opportunities"."urgency" BETWEEN 0 AND 5),
	CONSTRAINT "opportunities_strategic_fit_check" CHECK ("opportunities"."strategic_fit" BETWEEN 0 AND 5),
	CONSTRAINT "opportunities_plan_fit_check" CHECK ("opportunities"."plan_fit" BETWEEN 0 AND 5),
	CONSTRAINT "opportunities_staleness_check" CHECK ("opportunities"."staleness" BETWEEN 0 AND 5),
	CONSTRAINT "opportunities_effort_check" CHECK ("opportunities"."effort" BETWEEN 1 AND 5),
	CONSTRAINT "opportunities_base_priority_check" CHECK ("opportunities"."base_priority" BETWEEN 0 AND 100),
	CONSTRAINT "opportunities_final_priority_check" CHECK ("opportunities"."final_priority" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "work_plan_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "work_plan_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "work_plan_items" (
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"work_plan_cycle_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"selected_by_user_id" text,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	CONSTRAINT "work_plan_items_pk" PRIMARY KEY("workspace_id","work_plan_cycle_id","opportunity_id")
);
--> statement-breakpoint
ALTER TABLE "audit_check_results" ADD COLUMN "evidence_confidence" "evidence_confidence" DEFAULT 'LOW' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_check_results_workspace_full_unique" ON "audit_check_results" USING btree ("workspace_id","id","audit_run_id","audit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_findings_workspace_full_unique" ON "audit_findings" USING btree ("workspace_id","id","audit_run_id","audit_id","check_key");--> statement-breakpoint
CREATE UNIQUE INDEX "websites_workspace_client_id_unique" ON "websites" USING btree ("workspace_id","client_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_workspace_id_id_unique" ON "opportunities" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_workspace_client_id_unique" ON "opportunities" USING btree ("workspace_id","client_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_plan_cycles_workspace_id_id_unique" ON "work_plan_cycles" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_plan_cycles_workspace_client_id_unique" ON "work_plan_cycles" USING btree ("workspace_id","client_id","id");--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_client_workspace_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_audit_workspace_fk" FOREIGN KEY ("workspace_id","source_audit_id") REFERENCES "public"."audits"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_audit_run_workspace_fk" FOREIGN KEY ("workspace_id","source_audit_run_id","source_audit_id") REFERENCES "public"."audit_runs"("workspace_id","id","audit_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_finding_workspace_fk" FOREIGN KEY ("workspace_id","source_finding_id","source_audit_run_id","source_audit_id","source_check_key") REFERENCES "public"."audit_findings"("workspace_id","id","audit_run_id","audit_id","check_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_check_result_workspace_fk" FOREIGN KEY ("workspace_id","source_check_result_id","source_audit_run_id","source_audit_id") REFERENCES "public"."audit_check_results"("workspace_id","id","audit_run_id","audit_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_plan_cycles" ADD CONSTRAINT "work_plan_cycles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_plan_cycles" ADD CONSTRAINT "work_plan_cycles_client_workspace_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_plan_items" ADD CONSTRAINT "work_plan_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_plan_items" ADD CONSTRAINT "work_plan_items_selected_by_user_id_user_id_fk" FOREIGN KEY ("selected_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_plan_items" ADD CONSTRAINT "work_plan_items_cycle_workspace_fk" FOREIGN KEY ("workspace_id","client_id","work_plan_cycle_id") REFERENCES "public"."work_plan_cycles"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_plan_items" ADD CONSTRAINT "work_plan_items_opportunity_workspace_fk" FOREIGN KEY ("workspace_id","client_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_open_equivalent_unique" ON "opportunities" USING btree ("workspace_id","website_id","source_check_key","normalized_remediation_family") WHERE "opportunities"."status" in ('DRAFT', 'READY', 'BLOCKED', 'IN_PROGRESS');--> statement-breakpoint
CREATE INDEX "opportunities_workspace_status_idx" ON "opportunities" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "opportunities_workspace_priority_idx" ON "opportunities" USING btree ("workspace_id","priority_band","final_priority");--> statement-breakpoint
CREATE INDEX "opportunities_workspace_client_idx" ON "opportunities" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "opportunities_workspace_website_idx" ON "opportunities" USING btree ("workspace_id","website_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_plan_cycles_open_client_unique" ON "work_plan_cycles" USING btree ("workspace_id","client_id") WHERE "work_plan_cycles"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "work_plan_cycles_workspace_client_idx" ON "work_plan_cycles" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "work_plan_items_workspace_opportunity_idx" ON "work_plan_items" USING btree ("workspace_id","opportunity_id");--> statement-breakpoint
ALTER TABLE "opportunities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "opportunities" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "opportunities_workspace_context" ON "opportunities"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "work_plan_cycles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "work_plan_cycles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "work_plan_cycles_workspace_context" ON "work_plan_cycles"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "work_plan_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "work_plan_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "work_plan_items_workspace_context" ON "work_plan_items"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
