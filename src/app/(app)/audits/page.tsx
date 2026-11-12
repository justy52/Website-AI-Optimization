import { closeAbandonedAudits, listAudits } from "@/server/audits";
import { getWorkspaceShellContext } from "@/server/auth";
import { listWebsites } from "@/server/revenue";

import Link from "next/link";

import { canManageWorkspace } from "@/domain/tenancy/context";

import { setAuditsHiddenAction, startAuditAction } from "./actions";
import { StartAuditButton } from "./start-audit-button";
import { EmptyState, formatDate, PageHeader, Panel, RowLink, StatusChip } from "../ui";

// A mobile lab measurement can take over a minute before the audit is saved.
export const maxDuration = 300;

export default async function AuditsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;
  const shell = await getWorkspaceShellContext();
  await closeAbandonedAudits(shell.workspaceContext);
  const [websites, allAudits] = await Promise.all([
    listWebsites(shell.workspaceContext),
    listAudits(shell.workspaceContext),
  ]);
  const showingHidden = show === "hidden";
  const hiddenCount = allAudits.filter((audit) => audit.hidden).length;
  const audits = allAudits.filter((audit) => audit.hidden === showingHidden);
  const canManage = canManageWorkspace(shell.workspaceContext);

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
              <StartAuditButton />
            </form>
          ) : (
            <EmptyState>Add a client website before starting an audit.</EmptyState>
          )}
        </Panel>
        <Panel title={showingHidden ? "Hidden audits" : "Audit history"}>
          <p className="mx-muted">
            {showingHidden ? (
              <Link href="/audits">Back to audit history</Link>
            ) : hiddenCount > 0 ? (
              <Link href={"/audits?show=hidden" as never}>Show {hiddenCount} hidden {hiddenCount === 1 ? "audit" : "audits"}</Link>
            ) : (
              "Hiding an audit only removes it from this list. Nothing is deleted."
            )}
          </p>
          {audits.length > 0 ? (
            <form action={setAuditsHiddenAction}>
              <input name="intent" type="hidden" value={showingHidden ? "restore" : "hide"} />
              <div className="mx-list">
                {audits.map((audit) => (
                  <div className="mx-audit-row" key={audit.id}>
                    {canManage ? (
                      <input aria-label={`Select ${audit.title}, ${formatDate(audit.createdAt)}`} name="auditId" type="checkbox" value={audit.id} />
                    ) : null}
                    <RowLink
                      chips={<StatusChip tone="info">{audit.status}</StatusChip>}
                      href={`/audits/${audit.id}`}
                      meta={`${audit.domain} - ${formatDate(audit.createdAt)}`}
                      title={audit.title}
                    />
                  </div>
                ))}
              </div>
              {canManage ? (
                <button className="mx-btn mx-btn-ghost" type="submit">
                  {showingHidden ? "Restore selected" : "Hide selected"}
                </button>
              ) : null}
            </form>
          ) : (
            <EmptyState>{showingHidden ? "No audits are hidden." : "No audits have been run yet."}</EmptyState>
          )}
        </Panel>
      </div>
    </>
  );
}
