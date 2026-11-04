-- The migration owner is the narrow SECURITY DEFINER function owner. Keep it
-- distinct from the public LOGIN role and from a non-owner application role.
ALTER TABLE public.public_audit_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY public_audit_requests_workspace ON public.public_audit_requests
  USING (workspace_id = public.current_app_workspace_id())
  WITH CHECK (workspace_id = public.current_app_workspace_id());
--> statement-breakpoint
REVOKE ALL ON public.public_audit_requests, public.public_intake_destination, public.public_intake_limits FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.submit_public_audit_request(
  p_payload jsonb, p_nonce text, p_payload_hash text, p_network text,
  p_email text, p_expected_workspace uuid
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  destination uuid;
  previous public.public_audit_requests%ROWTYPE;
  bucket record;
  used integer;
BEGIN
  SELECT workspace_id INTO destination FROM public.public_intake_destination WHERE singleton = true;
  IF destination IS NULL OR destination <> p_expected_workspace THEN
    RAISE EXCEPTION 'Intake destination unavailable';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR
    NOT p_payload ?& ARRAY['contactName','companyName','email','website','goal','note','acknowledgement','attribution','formVersion','privacyVersion'] OR
    octet_length(p_payload::text) > 8192 OR
    p_payload->>'formVersion' IS DISTINCT FROM 'audit-inquiry-v1' OR
    p_payload->>'privacyVersion' IS DISTINCT FROM '2026-11-04' OR
    p_payload->>'acknowledgement' IS DISTINCT FROM 'true' OR
    length(p_payload->>'contactName') NOT BETWEEN 1 AND 120 OR
    length(p_payload->>'companyName') NOT BETWEEN 1 AND 160 OR
    length(p_payload->>'email') NOT BETWEEN 3 AND 254 OR
    length(p_payload->>'website') NOT BETWEEN 9 AND 2048 OR
    length(p_payload->>'note') > 1000 OR
    p_payload->>'goal' NOT IN ('calls','appointments','enquiries','other') OR
    p_nonce !~ '^[a-f0-9]{64}$' OR p_payload_hash !~ '^[a-f0-9]{64}$' OR
    p_network !~ '^[a-f0-9]{64}$' OR p_email !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid intake payload';
  END IF;
  -- Lock across instances. Retry deduplication and all rate buckets share one
  -- transaction, so concurrent requests cannot exceed the shared allowance.
  PERFORM pg_advisory_xact_lock(hashtext('virelantic-public-intake-v1'));
  SELECT * INTO previous FROM public.public_audit_requests WHERE nonce_hash = p_nonce;
  IF FOUND THEN
    IF previous.workspace_id = destination AND previous.payload_hash = p_payload_hash THEN RETURN 'duplicate'; END IF;
    RETURN 'conflict';
  END IF;
  FOR bucket IN SELECT * FROM (VALUES
    ('network:' || p_network, interval '15 minutes', 5),
    ('email:' || p_email, interval '1 hour', 3),
    ('global', interval '1 hour', 100)
  ) AS b(key, duration, allowance) LOOP
    SELECT count INTO used FROM public.public_intake_limits
      WHERE key = bucket.key AND window_start > now() - bucket.duration;
    IF coalesce(used,0) >= bucket.allowance THEN RETURN 'limited'; END IF;
  END LOOP;
  FOR bucket IN SELECT * FROM (VALUES
    ('network:' || p_network, interval '15 minutes'),
    ('email:' || p_email, interval '1 hour'),
    ('global', interval '1 hour')
  ) AS b(key, duration) LOOP
    INSERT INTO public.public_intake_limits(key,window_start,count) VALUES(bucket.key,now(),1)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN public.public_intake_limits.window_start <= now() - bucket.duration THEN 1 ELSE public.public_intake_limits.count + 1 END,
      window_start = CASE WHEN public.public_intake_limits.window_start <= now() - bucket.duration THEN now() ELSE public.public_intake_limits.window_start END;
  END LOOP;
  INSERT INTO public.public_audit_requests(workspace_id,payload,nonce_hash,payload_hash,email_hash)
    VALUES(destination,p_payload,p_nonce,p_payload_hash,p_email);
  RETURN 'saved';
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.submit_public_audit_request(jsonb,text,text,text,text,uuid) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.purge_public_intake() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE removed integer;
BEGIN
  DELETE FROM public.public_audit_requests WHERE retention_until <= now()
    AND workspace_id = (SELECT workspace_id FROM public.public_intake_destination WHERE singleton = true);
  GET DIAGNOSTICS removed = ROW_COUNT;
  DELETE FROM public.public_intake_limits WHERE window_start < now() - interval '2 days';
  RETURN removed;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.purge_public_intake() FROM PUBLIC;
