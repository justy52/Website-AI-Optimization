-- Retain material fulfillment evidence. Workspace FKs remain unchanged;
-- any future privileged purge needs a separate, explicitly reviewed path.
CREATE FUNCTION public.reject_fulfillment_history_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'Fulfillment audit history is retained; ordinary deletion is prohibited.' USING ERRCODE = '23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER implementation_package_retained BEFORE DELETE ON public.implementation_packages
FOR EACH ROW EXECUTE FUNCTION public.reject_fulfillment_history_delete();
--> statement-breakpoint
CREATE TRIGGER verification_history_retained BEFORE DELETE ON public.implementation_verification_records
FOR EACH ROW EXECUTE FUNCTION public.reject_fulfillment_history_delete();
