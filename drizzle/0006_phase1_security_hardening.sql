-- Phase 1 security hardening:
-- During membership bootstrap the application has an authenticated user id but
-- intentionally has no active workspace id yet. This narrow read-only policy
-- lets that user resolve only non-archived workspaces for their own ACTIVE
-- memberships. Once app.workspace_id is set, normal tenant isolation remains
-- governed by workspaces_workspace_context.
CREATE POLICY "workspaces_bootstrap_active_membership_select" ON "workspaces"
  FOR SELECT
  USING (
    public.current_app_workspace_id() IS NULL
    AND "archived_at" IS NULL
    AND "deletion_pending_at" IS NULL
    AND EXISTS (
      SELECT 1
      FROM "workspace_memberships"
      WHERE "workspace_memberships"."workspace_id" = "workspaces"."id"
        AND "workspace_memberships"."user_id" = public.current_app_user_id()
        AND "workspace_memberships"."status" = 'ACTIVE'
    )
  );
