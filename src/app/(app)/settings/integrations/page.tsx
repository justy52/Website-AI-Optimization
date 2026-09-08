import Link from "next/link";

import { Archive, PlugZap } from "lucide-react";

import { getWorkspaceShellContext } from "@/server/auth";
import {
  isGoogleSearchConsoleConfigured,
  listIntegrationConnections,
} from "@/server/integrations";

import { EmptyState, formatDate, PageHeader, Panel, StatusChip } from "../../ui";
import { disconnectIntegrationFromSettingsAction } from "./actions";

function statusTone(status: string) {
  if (status === "CONNECTED") return "good";
  if (status === "ERROR") return "bad";
  if (status === "REVOKED") return "warn";
  return "neutral";
}

export default async function IntegrationsPage() {
  const shell = await getWorkspaceShellContext();
  const connections = await listIntegrationConnections(shell.workspaceContext);
  const gscConfigured = isGoogleSearchConsoleConfigured();

  return (
    <>
      <PageHeader eyebrow="Read-only connected data" title="Integrations" />
      <div className="mx-grid mx-grid-2">
        <Panel
          right={
            <StatusChip tone={gscConfigured ? "good" : "info"}>
              {gscConfigured ? "OAuth ready" : "Not configured"}
            </StatusChip>
          }
          title="Google Search Console"
        >
          <div className="mx-safety-lock">
            <PlugZap aria-hidden size={16} />
            <span>Requested Google scope is webmasters.readonly only.</span>
          </div>
          <p className="mx-muted">
            Connect Search Console from a website detail screen so the OAuth
            state can bind to the intended workspace, client, and site.
          </p>
        </Panel>
        <Panel title="External EXECUTE">
          <StatusChip tone="bad">Disabled</StatusChip>
          <p className="mx-muted">
            Search Console is read-only. No CMS, Google write, analytics write,
            email, or publish action exists in this phase.
          </p>
        </Panel>
      </div>
      <div className="mx-spacer" />
      <Panel title="Connections">
        {connections.length > 0 ? (
          <div className="mx-list">
            {connections.map((connection) => (
              <div className="mx-row mx-row-static" key={connection.id}>
                <div className="mx-row-main">
                  <span className="mx-row-title">{connection.provider}</span>
                  <span className="mx-row-meta">
                    {connection.clientName ?? "Client"} -{" "}
                    {connection.websiteName ?? "Website"} -{" "}
                    {connection.websiteDomain ?? "domain not set"}
                  </span>
                  <span className="mx-row-meta">
                    Scopes: {connection.scopes.join(", ") || "none"} - Connected{" "}
                    {formatDate(connection.grantedAt)}
                  </span>
                  <span className="mx-row-meta">
                    Last sync {formatDate(connection.lastSuccessAt)} - Last error{" "}
                    {connection.lastErrorSummary ?? "none"}
                  </span>
                  {connection.selectedPropertyUrl ? (
                    <span className="mx-row-meta">
                      Property: {connection.selectedPropertyUrl}
                    </span>
                  ) : null}
                </div>
                <StatusChip tone={statusTone(connection.status)}>
                  {connection.status}
                </StatusChip>
                {connection.websiteId ? (
                  <Link
                    className="mx-btn mx-btn-ghost"
                    href={`/websites/${connection.websiteId}`}
                  >
                    Open site
                  </Link>
                ) : null}
                {connection.status === "CONNECTED" ? (
                  <form action={disconnectIntegrationFromSettingsAction}>
                    <input name="connectionId" type="hidden" value={connection.id} />
                    <button className="mx-btn mx-btn-ghost" type="submit">
                      <Archive aria-hidden size={14} />
                      Disconnect
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>No read-only integrations are connected yet.</EmptyState>
        )}
      </Panel>
    </>
  );
}
