ALTER TABLE "agent_runs" ADD COLUMN "dispatch_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "dispatch_lease_token" uuid;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "dispatch_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "dispatch_next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "dispatch_error_code" text;--> statement-breakpoint
ALTER TABLE "ai_visibility_runs" ADD COLUMN "workflow_run_id" text;--> statement-breakpoint
ALTER TABLE "ai_visibility_runs" ADD COLUMN "dispatch_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_visibility_runs" ADD COLUMN "dispatch_lease_token" uuid;--> statement-breakpoint
ALTER TABLE "ai_visibility_runs" ADD COLUMN "dispatch_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_visibility_runs" ADD COLUMN "dispatch_next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_visibility_runs" ADD COLUMN "dispatch_error_code" text;--> statement-breakpoint
ALTER TABLE "monitoring_runs" ADD COLUMN "dispatch_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "monitoring_runs" ADD COLUMN "dispatch_lease_token" uuid;--> statement-breakpoint
ALTER TABLE "monitoring_runs" ADD COLUMN "dispatch_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "monitoring_runs" ADD COLUMN "dispatch_next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "monitoring_runs" ADD COLUMN "dispatch_error_code" text;--> statement-breakpoint
CREATE INDEX "agent_runs_dispatch_due" ON "agent_runs" USING btree ("dispatch_next_attempt_at","created_at") WHERE "agent_runs"."status"='QUEUED' and "agent_runs"."started_at" is null and "agent_runs"."completed_at" is null;--> statement-breakpoint
CREATE INDEX "ai_visibility_runs_dispatch_due" ON "ai_visibility_runs" USING btree ("dispatch_next_attempt_at","created_at") WHERE "ai_visibility_runs"."status"='QUEUED' and "ai_visibility_runs"."started_at" is null and "ai_visibility_runs"."completed_at" is null;--> statement-breakpoint
CREATE INDEX "monitoring_runs_dispatch_due" ON "monitoring_runs" USING btree ("dispatch_next_attempt_at","created_at") WHERE "monitoring_runs"."status"='QUEUED' and "monitoring_runs"."started_at" is null and "monitoring_runs"."completed_at" is null;
--> statement-breakpoint
-- Queued runs are durable intents, including pre-migration stranded runs. A
-- receipt never proves a worker started. Return only bounded, tenant-scoped IDs.
CREATE OR REPLACE FUNCTION public.list_queued_dispatch_refs(batch_size integer DEFAULT 25)
RETURNS TABLE(workspace_id uuid,run_id uuid,kind text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  WITH candidates AS (
    SELECT r.workspace_id,r.id AS run_id,
      CASE WHEN r.permission_level='PREPARE' THEN 'prepare'
           WHEN r.permission_level='EXECUTE' THEN 'qa_execute' ELSE 'verification' END AS kind,
      r.dispatch_next_attempt_at,r.dispatch_lease_until,r.created_at
    FROM public.agent_runs r
    WHERE r.status='QUEUED' AND r.started_at IS NULL AND r.completed_at IS NULL
      AND r.actual_model_calls=0 AND r.actual_tool_calls=0 AND r.model_generation_id IS NULL AND r.output_ref IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.agent_tool_calls t WHERE t.workspace_id=r.workspace_id AND t.agent_run_id=r.id)
      AND NOT EXISTS(SELECT 1 FROM public.usage_ledger l WHERE l.workspace_id=r.workspace_id AND l.agent_run_id=r.id
        AND (coalesce((l.metadata->>'attemptCommitted')::boolean,false) OR l.calls>0))
      AND (r.permission_level='PREPARE'
        OR (r.permission_level='EXECUTE' AND r.input_summary ? 'executionRecordId')
        OR (r.permission_level='OBSERVE' AND r.agent_key='verification' AND r.input_summary ? 'implementationRecordId'))
    UNION ALL
    SELECT r.workspace_id,r.id,'monitor',r.dispatch_next_attempt_at,r.dispatch_lease_until,r.created_at
    FROM public.monitoring_runs r WHERE r.status='QUEUED' AND r.started_at IS NULL AND r.completed_at IS NULL
      AND r.audit_run_id IS NULL AND r.observations_produced=0
      AND NOT EXISTS(SELECT 1 FROM public.monitoring_observations o WHERE o.workspace_id=r.workspace_id AND o.monitoring_run_id=r.id)
    UNION ALL
    SELECT r.workspace_id,r.id,'visibility',r.dispatch_next_attempt_at,r.dispatch_lease_until,r.created_at
    FROM public.ai_visibility_runs r WHERE r.status='QUEUED' AND r.started_at IS NULL AND r.completed_at IS NULL AND r.source IN ('API','QA_FIXTURE')
      AND NOT EXISTS(SELECT 1 FROM public.ai_visibility_calls v WHERE v.workspace_id=r.workspace_id AND v.run_id=r.id)
  )
  SELECT c.workspace_id,c.run_id,c.kind FROM candidates c
    JOIN public.workspaces w ON w.id=c.workspace_id
    CROSS JOIN public.platform_operations p
    LEFT JOIN public.workspace_operations o ON o.workspace_id=c.workspace_id
    WHERE p.id='global' AND NOT p.paused_all AND NOT coalesce(o.paused_all,false)
      AND w.archived_at IS NULL AND w.deletion_pending_at IS NULL
      AND c.dispatch_next_attempt_at<=now() AND (c.dispatch_lease_until IS NULL OR c.dispatch_lease_until<=now())
      AND (c.kind<>'monitor' OR (NOT p.paused_monitoring AND NOT coalesce(o.paused_monitoring,false)))
      AND (c.kind NOT IN ('prepare','visibility') OR (NOT p.paused_ai AND NOT coalesce(o.paused_ai,false)))
      AND (c.kind<>'qa_execute' OR (NOT p.paused_execution AND NOT coalesce(o.paused_execution,false)))
    ORDER BY c.dispatch_next_attempt_at,c.created_at,c.workspace_id,c.run_id
    LIMIT least(greatest(batch_size,0),100)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_queued_dispatch_refs(integer) FROM PUBLIC;
