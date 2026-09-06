import { Lock } from "lucide-react";

import { getWorkspaceShellContext } from "@/server/auth";

import { PageHeader, Panel, StatusChip } from "../ui";

export default async function SettingsPage() {
  const shell = await getWorkspaceShellContext();

  return (
    <>
      <PageHeader eyebrow="Workspace safety" title="Settings" />
      <div className="mx-grid mx-grid-2">
        <Panel title="Workspace">
          <div className="mx-method">
            <span>Name</span>
            <span>{shell.currentWorkspace.workspaceName}</span>
          </div>
          <div className="mx-method">
            <span>Slug</span>
            <span>{shell.currentWorkspace.workspaceSlug}</span>
          </div>
          <div className="mx-method">
            <span>Your role</span>
            <span>{shell.currentWorkspace.role}</span>
          </div>
        </Panel>
        <Panel
          right={<StatusChip tone="bad">Disabled</StatusChip>}
          title="Future external EXECUTE"
        >
          <div className="mx-safety-lock">
            <Lock aria-hidden size={18} />
            <span>No external EXECUTE behavior is present in Phase 1.</span>
          </div>
          <p className="mx-muted">
            The workspace feature flag foundation remains deny-by-default for
            later phases.
          </p>
        </Panel>
      </div>
    </>
  );
}
