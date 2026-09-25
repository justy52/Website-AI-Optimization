CREATE UNIQUE INDEX "ai_vis_runs_workspace_id" ON "ai_visibility_runs" USING btree ("workspace_id","id");
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "auth_rate_limits_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "operation_rate_limits" (
	"workspace_id" uuid NOT NULL,
	"actor_key" text NOT NULL,
	"action" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "operation_rate_limits_workspace_id_actor_key_action_window_start_pk" PRIMARY KEY("workspace_id","actor_key","action","window_start"),
	CONSTRAINT "operation_rate_count" CHECK ("operation_rate_limits"."count">=0)
);
--> statement-breakpoint
ALTER TABLE "operation_rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "platform_operations" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"paused_all" boolean DEFAULT false NOT NULL,
	"paused_monitoring" boolean DEFAULT false NOT NULL,
	"paused_ai" boolean DEFAULT false NOT NULL,
	"paused_execution" boolean DEFAULT false NOT NULL,
	"reason" text,
	"actor_user_id" text,
	"paused_at" timestamp with time zone,
	"resumed_at" timestamp with time zone,
	"resumed_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_operations_singleton" CHECK ("platform_operations"."id"='global')
);
--> statement-breakpoint
ALTER TABLE "platform_operations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "retention_cleanup_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"status" text NOT NULL,
	"dry_run" boolean NOT NULL,
	"eligible_count" integer NOT NULL,
	"deleted_count" integer NOT NULL,
	"batch_size" integer NOT NULL,
	"actor_user_id" text,
	"error_code" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "retention_cleanup_bounds" CHECK ("retention_cleanup_runs"."batch_size" between 1 and 100 and "retention_cleanup_runs"."deleted_count" between 0 and "retention_cleanup_runs"."batch_size" and "retention_cleanup_runs"."eligible_count">=0 and "retention_cleanup_runs"."status" in ('SUCCEEDED','FAILED'))
);
--> statement-breakpoint
ALTER TABLE "retention_cleanup_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "usage_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid,
	"website_id" uuid,
	"agent_run_id" uuid,
	"monitoring_run_id" uuid,
	"visibility_run_id" uuid,
	"audit_run_id" uuid,
	"source_key" text NOT NULL,
	"provider" text NOT NULL,
	"category" text NOT NULL,
	"units" integer DEFAULT 1 NOT NULL,
	"calls" integer,
	"tool_calls" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"estimated_cost_usd" numeric(14, 6),
	"actual_cost_usd" numeric(14, 6),
	"currency" text DEFAULT 'USD' NOT NULL,
	"reserved_cost_usd" numeric(14, 6) DEFAULT '0' NOT NULL,
	"reserved_calls" integer DEFAULT 0 NOT NULL,
	"state" text DEFAULT 'RESERVED' NOT NULL,
	"outcome" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"measurement_window" text NOT NULL,
	"source_version" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_source_exactly_one" CHECK (num_nonnulls("usage_ledger"."agent_run_id","usage_ledger"."monitoring_run_id","usage_ledger"."visibility_run_id","usage_ledger"."audit_run_id")=1),
	CONSTRAINT "usage_bounds" CHECK ("usage_ledger"."units">=0 and "usage_ledger"."calls">=0 and "usage_ledger"."tool_calls">=0 and "usage_ledger"."input_tokens">=0 and "usage_ledger"."output_tokens">=0 and "usage_ledger"."estimated_cost_usd">=0 and "usage_ledger"."actual_cost_usd">=0 and "usage_ledger"."reserved_cost_usd">=0 and "usage_ledger"."reserved_calls">=0 and "usage_ledger"."currency"='USD' and "usage_ledger"."state" in ('RESERVED','RECORDED'))
);
--> statement-breakpoint
ALTER TABLE "usage_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_operations" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"paused_all" boolean DEFAULT false NOT NULL,
	"paused_monitoring" boolean DEFAULT false NOT NULL,
	"paused_ai" boolean DEFAULT false NOT NULL,
	"paused_execution" boolean DEFAULT false NOT NULL,
	"monthly_cost_usd" numeric(14, 6) DEFAULT '0' NOT NULL,
	"active_workflow_limit" integer DEFAULT 5 NOT NULL,
	"ai_call_limit" integer DEFAULT 100 NOT NULL,
	"visibility_call_limit" integer DEFAULT 100 NOT NULL,
	"crawl_concurrency" integer DEFAULT 2 NOT NULL,
	"reason" text,
	"actor_user_id" text,
	"paused_at" timestamp with time zone,
	"resumed_at" timestamp with time zone,
	"resumed_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_operations_bounds" CHECK ("workspace_operations"."monthly_cost_usd" between 0 and 10000 and "workspace_operations"."active_workflow_limit" between 0 and 20 and "workspace_operations"."ai_call_limit" between 0 and 10000 and "workspace_operations"."visibility_call_limit" between 0 and 10000 and "workspace_operations"."crawl_concurrency" between 0 and 5)
);
--> statement-breakpoint
ALTER TABLE "workspace_operations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "operation_rate_limits" ADD CONSTRAINT "operation_rate_limits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_operations" ADD CONSTRAINT "platform_operations_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_operations" ADD CONSTRAINT "platform_operations_resumed_by_user_id_fk" FOREIGN KEY ("resumed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_cleanup_runs" ADD CONSTRAINT "retention_cleanup_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_cleanup_runs" ADD CONSTRAINT "retention_cleanup_runs_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_site_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_agent_fk" FOREIGN KEY ("workspace_id","agent_run_id") REFERENCES "public"."agent_runs"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_monitor_fk" FOREIGN KEY ("workspace_id","monitoring_run_id") REFERENCES "public"."monitoring_runs"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_visibility_fk" FOREIGN KEY ("workspace_id","visibility_run_id") REFERENCES "public"."ai_visibility_runs"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_audit_fk" FOREIGN KEY ("workspace_id","audit_run_id") REFERENCES "public"."audit_runs"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_operations" ADD CONSTRAINT "workspace_operations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_operations" ADD CONSTRAINT "workspace_operations_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_operations" ADD CONSTRAINT "workspace_operations_resumed_by_user_id_fk" FOREIGN KEY ("resumed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_ledger_source_unique" ON "usage_ledger" USING btree ("workspace_id","source_key");--> statement-breakpoint
CREATE INDEX "usage_ledger_window" ON "usage_ledger" USING btree ("workspace_id","measurement_window");--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE workspace_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_operations_tenant ON workspace_operations USING(workspace_id=public.current_app_workspace_id()) WITH CHECK(workspace_id=public.current_app_workspace_id());
ALTER TABLE usage_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY usage_ledger_tenant ON usage_ledger USING(workspace_id=public.current_app_workspace_id()) WITH CHECK(workspace_id=public.current_app_workspace_id());
ALTER TABLE operation_rate_limits FORCE ROW LEVEL SECURITY;
CREATE POLICY operation_rate_limits_tenant ON operation_rate_limits USING(workspace_id=public.current_app_workspace_id()) WITH CHECK(workspace_id=public.current_app_workspace_id());
ALTER TABLE retention_cleanup_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_cleanup_runs_tenant ON retention_cleanup_runs USING(workspace_id=public.current_app_workspace_id()) WITH CHECK(workspace_id=public.current_app_workspace_id());
INSERT INTO platform_operations(id) VALUES('global');
ALTER TABLE platform_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_operations_read ON platform_operations FOR SELECT USING(true);
CREATE POLICY platform_operations_update ON platform_operations FOR UPDATE USING(current_setting('app.platform_operator',true)='true') WITH CHECK(current_setting('app.platform_operator',true)='true');
--> statement-breakpoint
CREATE FUNCTION public.retain_operational_history() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' OR TG_TABLE_NAME='retention_cleanup_runs' THEN RAISE EXCEPTION 'Operational history is retained.' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(OLD)-ARRAY['calls','tool_calls','input_tokens','output_tokens','estimated_cost_usd','actual_cost_usd','state','outcome','metadata','updated_at']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['calls','tool_calls','input_tokens','output_tokens','estimated_cost_usd','actual_cost_usd','state','outcome','metadata','updated_at']) THEN RAISE EXCEPTION 'Usage source and reservation are immutable.' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER retain_usage_history BEFORE UPDATE OR DELETE ON usage_ledger FOR EACH ROW EXECUTE FUNCTION public.retain_operational_history();
CREATE TRIGGER retain_cleanup_history BEFORE UPDATE OR DELETE ON retention_cleanup_runs FOR EACH ROW EXECUTE FUNCTION public.retain_operational_history();
--> statement-breakpoint
-- Bounded ID-only cleanup bootstrap, consistent with the existing scheduler helpers.
CREATE FUNCTION public.list_retention_workspace_refs(batch_size integer DEFAULT 20)
RETURNS TABLE(workspace_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT workspace_id FROM (SELECT workspace_id FROM public.ai_visibility_captures WHERE expires_at<=now() UNION SELECT workspace_id FROM public.operation_rate_limits WHERE window_start<now()-interval '7 days') candidates ORDER BY workspace_id LIMIT least(greatest(batch_size,1),20)
$$;
REVOKE ALL ON FUNCTION public.list_retention_workspace_refs(integer) FROM PUBLIC;
