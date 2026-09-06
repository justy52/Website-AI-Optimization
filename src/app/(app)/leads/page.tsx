import { Plus } from "lucide-react";

import { getWorkspaceShellContext } from "@/server/auth";
import { leadStatuses, listLeads } from "@/server/revenue";

import { createLeadAction } from "./actions";
import { EmptyState, formatDate, PageHeader, Panel, RowLink, StatusChip } from "../ui";

export default async function LeadsPage() {
  const shell = await getWorkspaceShellContext();
  const leads = await listLeads(shell.workspaceContext);

  return (
    <>
      <PageHeader eyebrow="Pipeline" title="Leads" />
      <div className="mx-grid mx-grid-2">
        <Panel title="Create lead">
          <form action={createLeadAction} className="mx-form">
            <label>
              Company
              <input className="mx-input" name="companyName" required type="text" />
            </label>
            <label>
              Status
              <select className="mx-input" defaultValue="NEW" name="status">
                {leadStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Source
              <input className="mx-input" name="source" type="text" />
            </label>
            <label>
              Contact name
              <input className="mx-input" name="contactName" type="text" />
            </label>
            <label>
              Contact email
              <input className="mx-input" name="contactEmail" type="email" />
            </label>
            <label>
              Website URL
              <input className="mx-input" name="websiteUrl" type="text" />
            </label>
            <label className="mx-form-wide">
              Notes
              <textarea className="mx-input" name="notes" rows={4} />
            </label>
            <button className="mx-btn" type="submit">
              <Plus aria-hidden size={14} />
              Create lead
            </button>
          </form>
        </Panel>
        <Panel title="Workspace leads">
          {leads.length > 0 ? (
            <div className="mx-list">
              {leads.map((lead) => (
                <RowLink
                  chips={<StatusChip tone="info">{lead.status}</StatusChip>}
                  href={`/leads/${lead.id}`}
                  key={lead.id}
                  meta={`${lead.source ?? "No source"} - ${formatDate(lead.createdAt)}`}
                  title={lead.companyName}
                />
              ))}
            </div>
          ) : (
            <EmptyState>No active leads yet.</EmptyState>
          )}
        </Panel>
      </div>
    </>
  );
}
