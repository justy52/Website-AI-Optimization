CREATE TABLE "ai_visibility_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"prompt_set_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_visibility_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_visibility_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL,
	"answer" text NOT NULL,
	"provider_data" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_vis_capture_bounds" CHECK (length("ai_visibility_captures"."answer")<=100000 and "ai_visibility_captures"."expires_at">"ai_visibility_captures"."created_at")
);
--> statement-breakpoint
ALTER TABLE "ai_visibility_captures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_visibility_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"prompt_set_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"source" text NOT NULL,
	"surface" text NOT NULL,
	"model" text NOT NULL,
	"status" text NOT NULL,
	"rendered_prompt" text NOT NULL,
	"prompt_hash" text NOT NULL,
	"answer_hash" text,
	"provider_response_id" text,
	"parsed" jsonb,
	"parser_version" text NOT NULL,
	"usage" jsonb NOT NULL,
	"limitations" jsonb NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"recorded_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_vis_observation_status" CHECK ("ai_visibility_observations"."status" in ('SUCCEEDED','FAILED','UNAVAILABLE') and (("ai_visibility_observations"."status"='SUCCEEDED' and "ai_visibility_observations"."parsed" is not null and "ai_visibility_observations"."answer_hash" is not null) or ("ai_visibility_observations"."status"<>'SUCCEEDED' and "ai_visibility_observations"."parsed" is null)))
);
--> statement-breakpoint
ALTER TABLE "ai_visibility_observations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_visibility_prompt_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"key" text NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"template_version" text NOT NULL,
	"generated_from_fact_refs" jsonb NOT NULL,
	"aliases" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_vis_sets_version_positive" CHECK ("ai_visibility_prompt_sets"."version">0 and "ai_visibility_prompt_sets"."status" in ('ACTIVE','RETIRED'))
);
--> statement-breakpoint
ALTER TABLE "ai_visibility_prompt_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_visibility_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"prompt_set_id" uuid NOT NULL,
	"key" text NOT NULL,
	"template_key" text NOT NULL,
	"rendered_prompt" text NOT NULL,
	"prompt_hash" text NOT NULL,
	"service_fact_id" uuid NOT NULL,
	"location_fact_id" uuid NOT NULL,
	"optional_fact_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_vis_prompt_bounds" CHECK (length("ai_visibility_prompts"."rendered_prompt") between 1 and 1500)
);
--> statement-breakpoint
ALTER TABLE "ai_visibility_prompts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_visibility_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"website_id" uuid NOT NULL,
	"prompt_set_id" uuid NOT NULL,
	"prompt_set_version" integer NOT NULL,
	"source" text NOT NULL,
	"surface" text NOT NULL,
	"adapter_version" text NOT NULL,
	"model" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"window" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"context" jsonb NOT NULL,
	"budget" jsonb NOT NULL,
	"prompt_count" integer NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"unavailable_count" integer DEFAULT 0 NOT NULL,
	"usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"limitations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actor_user_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_vis_run_bounds" CHECK ("ai_visibility_runs"."prompt_count" between 1 and 30 and "ai_visibility_runs"."success_count">=0 and "ai_visibility_runs"."error_count">=0 and "ai_visibility_runs"."unavailable_count">=0 and "ai_visibility_runs"."source" in ('API','MANUAL','QA_FIXTURE') and "ai_visibility_runs"."status" in ('QUEUED','RUNNING','SUCCEEDED','PARTIAL','FAILED','UNAVAILABLE'))
);
--> statement-breakpoint
ALTER TABLE "ai_visibility_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_vis_calls_binding" ON "ai_visibility_calls" USING btree ("workspace_id","prompt_set_id","run_id","prompt_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_vis_calls_once" ON "ai_visibility_calls" USING btree ("workspace_id","run_id","prompt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_vis_capture_observation" ON "ai_visibility_captures" USING btree ("workspace_id","observation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_vis_observations_binding" ON "ai_visibility_observations" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_vis_observations_once" ON "ai_visibility_observations" USING btree ("workspace_id","run_id","prompt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_vis_sets_binding" ON "ai_visibility_prompt_sets" USING btree ("workspace_id","client_id","website_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_vis_sets_version" ON "ai_visibility_prompt_sets" USING btree ("workspace_id","website_id","key","version");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_vis_prompts_binding" ON "ai_visibility_prompts" USING btree ("workspace_id","prompt_set_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_vis_prompts_key" ON "ai_visibility_prompts" USING btree ("workspace_id","prompt_set_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_vis_runs_binding" ON "ai_visibility_runs" USING btree ("workspace_id","prompt_set_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_vis_runs_idempotency" ON "ai_visibility_runs" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_vis_runs_paid_window" ON "ai_visibility_runs" USING btree ("workspace_id","website_id","surface","window") WHERE "ai_visibility_runs"."source"='API';--> statement-breakpoint
ALTER TABLE "ai_visibility_calls" ADD CONSTRAINT "ai_visibility_calls_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_calls" ADD CONSTRAINT "ai_vis_calls_run_fk" FOREIGN KEY ("workspace_id","prompt_set_id","run_id") REFERENCES "public"."ai_visibility_runs"("workspace_id","prompt_set_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_calls" ADD CONSTRAINT "ai_vis_calls_prompt_fk" FOREIGN KEY ("workspace_id","prompt_set_id","prompt_id") REFERENCES "public"."ai_visibility_prompts"("workspace_id","prompt_set_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_captures" ADD CONSTRAINT "ai_visibility_captures_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_captures" ADD CONSTRAINT "ai_vis_capture_observation_fk" FOREIGN KEY ("workspace_id","observation_id") REFERENCES "public"."ai_visibility_observations"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_observations" ADD CONSTRAINT "ai_visibility_observations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_observations" ADD CONSTRAINT "ai_visibility_observations_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_observations" ADD CONSTRAINT "ai_vis_observation_call_fk" FOREIGN KEY ("workspace_id","prompt_set_id","run_id","prompt_id","call_id") REFERENCES "public"."ai_visibility_calls"("workspace_id","prompt_set_id","run_id","prompt_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_prompt_sets" ADD CONSTRAINT "ai_visibility_prompt_sets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_prompt_sets" ADD CONSTRAINT "ai_visibility_prompt_sets_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_prompt_sets" ADD CONSTRAINT "ai_vis_sets_site_fk" FOREIGN KEY ("workspace_id","client_id","website_id") REFERENCES "public"."websites"("workspace_id","client_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_prompts" ADD CONSTRAINT "ai_visibility_prompts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_prompts" ADD CONSTRAINT "ai_vis_prompts_set_fk" FOREIGN KEY ("workspace_id","client_id","website_id","prompt_set_id") REFERENCES "public"."ai_visibility_prompt_sets"("workspace_id","client_id","website_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_prompts" ADD CONSTRAINT "ai_vis_prompts_service_fk" FOREIGN KEY ("workspace_id","service_fact_id") REFERENCES "public"."business_facts"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_prompts" ADD CONSTRAINT "ai_vis_prompts_location_fk" FOREIGN KEY ("workspace_id","location_fact_id") REFERENCES "public"."business_facts"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_runs" ADD CONSTRAINT "ai_visibility_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_runs" ADD CONSTRAINT "ai_visibility_runs_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_runs" ADD CONSTRAINT "ai_vis_runs_set_fk" FOREIGN KEY ("workspace_id","client_id","website_id","prompt_set_id") REFERENCES "public"."ai_visibility_prompt_sets"("workspace_id","client_id","website_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ai_visibility_prompt_sets','ai_visibility_prompts','ai_visibility_runs','ai_visibility_calls','ai_visibility_observations','ai_visibility_captures'] LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY %I ON public.%I USING (workspace_id=public.current_app_workspace_id()) WITH CHECK (workspace_id=public.current_app_workspace_id())',t||'_tenant',t);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.protect_ai_visibility_history() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_TABLE_NAME='ai_visibility_captures' THEN
    IF TG_OP='DELETE' AND OLD.expires_at<=now() THEN RETURN OLD; END IF;
  END IF;
  RAISE EXCEPTION 'AI visibility evidence is immutable and retained; create a new version.' USING ERRCODE='23514';
END $$;
CREATE TRIGGER ai_vis_set_history BEFORE UPDATE OR DELETE ON public.ai_visibility_prompt_sets FOR EACH ROW EXECUTE FUNCTION public.protect_ai_visibility_history();
CREATE TRIGGER ai_vis_prompt_history BEFORE UPDATE OR DELETE ON public.ai_visibility_prompts FOR EACH ROW EXECUTE FUNCTION public.protect_ai_visibility_history();
CREATE TRIGGER ai_vis_call_history BEFORE UPDATE OR DELETE ON public.ai_visibility_calls FOR EACH ROW EXECUTE FUNCTION public.protect_ai_visibility_history();
CREATE TRIGGER ai_vis_observation_history BEFORE UPDATE OR DELETE ON public.ai_visibility_observations FOR EACH ROW EXECUTE FUNCTION public.protect_ai_visibility_history();
CREATE TRIGGER ai_vis_capture_history BEFORE UPDATE OR DELETE ON public.ai_visibility_captures FOR EACH ROW EXECUTE FUNCTION public.protect_ai_visibility_history();
--> statement-breakpoint
CREATE FUNCTION public.validate_ai_visibility_binding() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE s public.ai_visibility_prompt_sets; r public.ai_visibility_runs; p public.ai_visibility_prompts; f uuid;
BEGIN
  IF TG_TABLE_NAME='ai_visibility_prompt_sets' THEN
    FOR f IN SELECT jsonb_array_elements_text(NEW.generated_from_fact_refs)::uuid LOOP
      IF NOT EXISTS(SELECT 1 FROM public.business_facts b WHERE b.workspace_id=NEW.workspace_id AND b.client_id=NEW.client_id AND (b.website_id IS NULL OR b.website_id=NEW.website_id) AND b.id=f AND b.sensitivity='PUBLIC' AND b.verification_status='VERIFIED' AND b.approved_by_user_id IS NOT NULL AND b.archived_at IS NULL AND (b.expires_at IS NULL OR b.expires_at>now()) AND (b.effective_at IS NULL OR b.effective_at<=now())) THEN RAISE EXCEPTION 'Verified tenant fact required.' USING ERRCODE='23514'; END IF;
    END LOOP;
    FOR f IN SELECT jsonb_array_elements_text(NEW.aliases->'client'->'factRefs')::uuid
      UNION ALL SELECT jsonb_array_elements_text(e.value->'factRefs')::uuid FROM jsonb_array_elements(NEW.aliases->'competitors') e LOOP
      IF NOT (NEW.generated_from_fact_refs ? f::text) THEN RAISE EXCEPTION 'Alias fact must belong to the verified tenant snapshot.' USING ERRCODE='23514'; END IF;
    END LOOP;
  ELSIF TG_TABLE_NAME='ai_visibility_prompts' THEN
    IF EXISTS(SELECT 1 FROM public.ai_visibility_runs WHERE workspace_id=NEW.workspace_id AND prompt_set_id=NEW.prompt_set_id) THEN RAISE EXCEPTION 'An observed prompt set cannot gain new prompts.' USING ERRCODE='23514'; END IF;
    SELECT * INTO s FROM public.ai_visibility_prompt_sets WHERE workspace_id=NEW.workspace_id AND id=NEW.prompt_set_id;
    IF NOT FOUND OR NOT (s.generated_from_fact_refs ? NEW.service_fact_id::text) OR NOT (s.generated_from_fact_refs ? NEW.location_fact_id::text) THEN RAISE EXCEPTION 'Prompt fact binding required.' USING ERRCODE='23514'; END IF;
    FOR f IN SELECT jsonb_array_elements_text(NEW.optional_fact_refs)::uuid LOOP
      IF NOT (s.generated_from_fact_refs ? f::text) THEN RAISE EXCEPTION 'Optional fact must belong to the verified tenant snapshot.' USING ERRCODE='23514'; END IF;
    END LOOP;
    IF NOT EXISTS(SELECT 1 FROM public.business_facts WHERE workspace_id=NEW.workspace_id AND id=NEW.service_fact_id AND fact_type='service') OR NOT EXISTS(SELECT 1 FROM public.business_facts WHERE workspace_id=NEW.workspace_id AND id=NEW.location_fact_id AND fact_type IN ('service_area','location')) THEN RAISE EXCEPTION 'Service and location fact types required.' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='ai_visibility_runs' THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Visibility runs are retained.' USING ERRCODE='23514'; END IF;
    IF TG_OP='UPDATE' THEN
      IF OLD.completed_at IS NOT NULL OR (to_jsonb(OLD)-ARRAY['status','success_count','error_count','unavailable_count','usage','limitations','started_at','completed_at']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','success_count','error_count','unavailable_count','usage','limitations','started_at','completed_at']) THEN RAISE EXCEPTION 'Visibility run history is immutable.' USING ERRCODE='23514'; END IF;
      IF NOT ((OLD.status='QUEUED' AND NEW.status IN ('RUNNING','UNAVAILABLE')) OR (OLD.status='RUNNING' AND NEW.status IN ('RUNNING','SUCCEEDED','PARTIAL','FAILED','UNAVAILABLE'))) THEN RAISE EXCEPTION 'Invalid visibility run transition.' USING ERRCODE='23514'; END IF;
    ELSE
      SELECT * INTO s FROM public.ai_visibility_prompt_sets WHERE workspace_id=NEW.workspace_id AND id=NEW.prompt_set_id;
      IF NOT FOUND OR s.version<>NEW.prompt_set_version THEN RAISE EXCEPTION 'Exact prompt-set version required.' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='ai_visibility_observations' THEN
    SELECT * INTO r FROM public.ai_visibility_runs WHERE workspace_id=NEW.workspace_id AND id=NEW.run_id;
    SELECT * INTO p FROM public.ai_visibility_prompts WHERE workspace_id=NEW.workspace_id AND id=NEW.prompt_id;
    IF r.completed_at IS NOT NULL OR NEW.source<>r.source OR NEW.surface<>r.surface OR NEW.rendered_prompt<>p.rendered_prompt OR NEW.prompt_hash<>p.prompt_hash THEN RAISE EXCEPTION 'Exact observation source and prompt required.' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_vis_set_binding BEFORE INSERT ON public.ai_visibility_prompt_sets FOR EACH ROW EXECUTE FUNCTION public.validate_ai_visibility_binding();
CREATE TRIGGER ai_vis_prompt_binding BEFORE INSERT ON public.ai_visibility_prompts FOR EACH ROW EXECUTE FUNCTION public.validate_ai_visibility_binding();
CREATE TRIGGER ai_vis_run_binding BEFORE INSERT OR UPDATE OR DELETE ON public.ai_visibility_runs FOR EACH ROW EXECUTE FUNCTION public.validate_ai_visibility_binding();
CREATE TRIGGER ai_vis_observation_binding BEFORE INSERT ON public.ai_visibility_observations FOR EACH ROW EXECUTE FUNCTION public.validate_ai_visibility_binding();
--> statement-breakpoint
-- The dispatcher has no tenant until bootstrap. This ID-only helper is the only
-- privileged read; all material operations re-establish normal tenant context.
CREATE FUNCTION public.list_ai_visibility_site_refs(batch_size integer DEFAULT 25)
RETURNS TABLE(workspace_id uuid, website_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT DISTINCT s.workspace_id,s.website_id FROM public.ai_visibility_prompt_sets s
 JOIN public.websites w ON w.workspace_id=s.workspace_id AND w.id=s.website_id
 JOIN public.clients c ON c.workspace_id=s.workspace_id AND c.id=s.client_id
 WHERE w.archived_at IS NULL AND c.archived_at IS NULL AND c.service_plan IN ('ESSENTIALS','GROWTH','PRO')
 AND NOT EXISTS(SELECT 1 FROM public.ai_visibility_runs r WHERE r.workspace_id=s.workspace_id AND r.website_id=s.website_id AND r.source='API'
   AND r.window=to_char(timezone('UTC',now()),'YYYY-MM')||':'||CASE WHEN c.service_plan='PRO' AND extract(day from timezone('UTC',now()))>=16 THEN '2' ELSE '1' END AND r.completed_at IS NOT NULL)
 ORDER BY s.workspace_id,s.website_id LIMIT least(greatest(batch_size,1),100)
$$;
REVOKE ALL ON FUNCTION public.list_ai_visibility_site_refs(integer) FROM PUBLIC;
