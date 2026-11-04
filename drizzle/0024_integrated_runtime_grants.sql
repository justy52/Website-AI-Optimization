-- Grant only the capabilities required by the integrated release. Intake
-- destination/rate buckets and anonymous submission remain separate privileges.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.public_audit_requests,
  public.service_orders, public.service_payments, public.service_payment_events
  TO virelantic_runtime;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.list_queued_dispatch_refs(integer),
  public.purge_public_intake() TO virelantic_runtime;
