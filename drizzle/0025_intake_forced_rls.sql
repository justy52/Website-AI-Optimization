-- The migration/function owner is a dedicated administrative BYPASSRLS role.
-- Anonymous callers have only the submission capability, and the application
-- has only tenant-scoped queue access. Private routing/buckets have no policies.
ALTER TABLE public.public_audit_requests FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.public_intake_destination ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.public_intake_destination FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.public_intake_limits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.public_intake_limits FORCE ROW LEVEL SECURITY;
