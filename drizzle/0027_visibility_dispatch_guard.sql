-- Dispatch metadata is mutable while a run is active; its evidence, identity,
-- and completed history remain immutable. Keep all original binding checks.
CREATE OR REPLACE FUNCTION public.validate_ai_visibility_binding() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
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
      IF OLD.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Visibility run history is immutable.' USING ERRCODE='23514'; END IF;
      IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) AND (to_jsonb(OLD)-ARRAY['workflow_run_id','dispatch_attempts','dispatch_lease_token','dispatch_lease_until','dispatch_next_attempt_at','dispatch_error_code']) = (to_jsonb(NEW)-ARRAY['workflow_run_id','dispatch_attempts','dispatch_lease_token','dispatch_lease_until','dispatch_next_attempt_at','dispatch_error_code']) THEN
        IF OLD.status NOT IN ('QUEUED','RUNNING') THEN RAISE EXCEPTION 'Dispatch metadata requires an active run.' USING ERRCODE='23514'; END IF;
        RETURN NEW;
      END IF;
      IF (to_jsonb(OLD)-ARRAY['status','success_count','error_count','unavailable_count','usage','limitations','started_at','completed_at']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','success_count','error_count','unavailable_count','usage','limitations','started_at','completed_at']) THEN RAISE EXCEPTION 'Visibility run history is immutable.' USING ERRCODE='23514'; END IF;
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
