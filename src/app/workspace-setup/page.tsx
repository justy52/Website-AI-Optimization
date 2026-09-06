import { redirect } from "next/navigation";

import { createWorkspaceAction } from "@/app/workspace-actions";
import { requireAuthenticatedUser } from "@/server/auth";
import { listActiveWorkspaceMembershipsForUser } from "@/server/workspaces";

export default async function WorkspaceSetupPage() {
  const user = await requireAuthenticatedUser();
  const memberships = await listActiveWorkspaceMembershipsForUser(user.id);

  if (memberships.length > 0) {
    redirect("/");
  }

  return (
    <main className="mx-auth-root">
      <div className="mx-rain" aria-hidden />
      <div className="mx-scan" aria-hidden />
      <section className="mx-auth-panel">
        <div className="mx-eyebrow">Workspace bootstrap</div>
        <h1 className="mx-title">Create Workspace</h1>
        <p className="mx-muted">
          This creates the first active owner membership for your authenticated
          OPTIQ account.
        </p>
        <form action={createWorkspaceAction} className="mx-form">
          <label>
            Workspace name
            <input
              className="mx-input"
              defaultValue="OPTIQ Workspace"
              name="name"
              required
              type="text"
            />
          </label>
          <button className="mx-btn" type="submit">
            Create workspace
          </button>
        </form>
      </section>
    </main>
  );
}
