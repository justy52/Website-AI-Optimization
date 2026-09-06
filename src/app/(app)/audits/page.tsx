import { Play } from "lucide-react";

import { listAudits } from "@/server/audits";
import { getWorkspaceShellContext } from "@/server/auth";
import { listWebsites } from "@/server/revenue";

import { startAuditAction } from "./actions";
import { EmptyState, formatDate, PageHeader, Panel, RowLink, StatusChip } from "../ui";

export default async function AuditsPage() {
  const shell = await getWorkspaceShellContext();
  const [websites, audits] = await Promise.all([
    listWebsites(shell.workspaceContext),
    listAudits(shell.workspaceContext),
  ]);

  return (
    <>
      <PageHeader eyebrow="Deterministic checks" title="Audits" />
      <div className="mx-grid mx-grid-2">
        <Panel title="Start audit">
          {websites.length > 0 ? (
            <form action={startAuditAction} className="mx-form">
              <label>
                Website
                <select className="mx-input" name="websiteId" required>
                  {websites.map((website) => (
                    <option key={website.id} value={website.id}>
                      {website.displayName} - {website.domain}
                    </option>
                  ))}
                </select>
              </label>
              <button className="mx-btn" type="submit">
                <Play aria-hidden size={14} />
                Start audit
              </button>
            </form>
          ) : (
            <EmptyState>Add a client website before starting an audit.</EmptyState>
          )}
        </Panel>
        <Panel title="Audit history">
          {audits.length > 0 ? (
            <div className="mx-list">
              {audits.map((audit) => (
                <RowLink
                  chips={<StatusChip tone="info">{audit.status}</StatusChip>}
                  href={`/audits/${audit.id}`}
                  key={audit.id}
                  meta={`${audit.domain} - ${formatDate(audit.createdAt)}`}
                  title={audit.title}
                />
              ))}
            </div>
          ) : (
            <EmptyState>No audits have been run yet.</EmptyState>
          )}
        </Panel>
      </div>
    </>
  );
}
