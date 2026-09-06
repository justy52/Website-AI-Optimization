import Link from "next/link";
import { notFound } from "next/navigation";

import { Archive, ArrowLeft, Repeat2, Save } from "lucide-react";

import { convertibleLeadStatuses } from "@/domain/revenue/workflows";
import { getWorkspaceShellContext } from "@/server/auth";
import { getLead, leadStatuses } from "@/server/revenue";

import {
  archiveLeadAction,
  convertLeadAction,
  updateLeadAction,
} from "../actions";
import { formatDate, PageHeader, Panel, StatusChip } from "../../ui";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  const shell = await getWorkspaceShellContext();
  const lead = await getLead(shell.workspaceContext, leadId);

  if (!lead) {
    notFound();
  }

  const canConvert = convertibleLeadStatuses.includes(
    lead.status as (typeof convertibleLeadStatuses)[number],
  );

  return (
    <>
      <PageHeader
        action={
          <Link className="mx-btn mx-btn-ghost" href="/leads">
            <ArrowLeft aria-hidden size={14} />
            Leads
          </Link>
        }
        eyebrow={`Lead - ${formatDate(lead.createdAt)}`}
        title={lead.companyName}
      />
      <div className="mx-grid mx-grid-2">
        <Panel
          right={<StatusChip tone={lead.archivedAt ? "neutral" : "info"}>{lead.status}</StatusChip>}
          title="Lead record"
        >
          <form action={updateLeadAction} className="mx-form">
            <input name="leadId" type="hidden" value={lead.id} />
            <label>
              Company
              <input
                className="mx-input"
                defaultValue={lead.companyName}
                name="companyName"
                required
                type="text"
              />
            </label>
            <label>
              Status
              <select className="mx-input" defaultValue={lead.status} name="status">
                {leadStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Source
              <input
                className="mx-input"
                defaultValue={lead.source ?? ""}
                name="source"
                type="text"
              />
            </label>
            <label>
              Contact name
              <input
                className="mx-input"
                defaultValue={lead.contactName ?? ""}
                name="contactName"
                type="text"
              />
            </label>
            <label>
              Contact email
              <input
                className="mx-input"
                defaultValue={lead.contactEmail ?? ""}
                name="contactEmail"
                type="email"
              />
            </label>
            <label>
              Website URL
              <input
                className="mx-input"
                defaultValue={lead.websiteUrl ?? ""}
                name="websiteUrl"
                type="text"
              />
            </label>
            <label className="mx-form-wide">
              Notes
              <textarea
                className="mx-input"
                defaultValue={lead.notes ?? ""}
                name="notes"
                rows={6}
              />
            </label>
            <button className="mx-btn" type="submit">
              <Save aria-hidden size={14} />
              Save lead
            </button>
          </form>
        </Panel>
        <Panel title="Actions">
          <div className="mx-action-stack">
            <form action={convertLeadAction}>
              <input name="leadId" type="hidden" value={lead.id} />
              <button className="mx-btn" disabled={!canConvert} type="submit">
                <Repeat2 aria-hidden size={14} />
                Convert to client
              </button>
            </form>
            <form action={archiveLeadAction}>
              <input name="leadId" type="hidden" value={lead.id} />
              <button className="mx-btn mx-btn-ghost" type="submit">
                <Archive aria-hidden size={14} />
                Archive lead
              </button>
            </form>
          </div>
          <p className="mx-muted">
            Conversion creates one client linked to this lead and marks the lead
            converted in the same transaction.
          </p>
        </Panel>
      </div>
    </>
  );
}
