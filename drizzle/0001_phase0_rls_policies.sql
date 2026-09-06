CREATE OR REPLACE FUNCTION public.current_app_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.workspace_id', true), '')::uuid
$$;
--> statement-breakpoint

ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workspaces" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspaces_workspace_context" ON "workspaces"
  USING ("id" = public.current_app_workspace_id())
  WITH CHECK ("id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "workspace_memberships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workspace_memberships" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_memberships_workspace_context" ON "workspace_memberships"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "leads" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "leads_workspace_context" ON "leads"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "clients" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "clients_workspace_context" ON "clients"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "websites" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "websites" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "websites_workspace_context" ON "websites"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "approval_policies" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "approval_policies" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "approval_policies_workspace_context" ON "approval_policies"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "integration_connections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "integration_connections" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "integration_connections_workspace_context" ON "integration_connections"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "workspace_feature_flags" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workspace_feature_flags" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_feature_flags_workspace_context" ON "workspace_feature_flags"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
--> statement-breakpoint

ALTER TABLE "activity_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "activity_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "activity_events_workspace_context" ON "activity_events"
  USING ("workspace_id" = public.current_app_workspace_id())
  WITH CHECK ("workspace_id" = public.current_app_workspace_id());
