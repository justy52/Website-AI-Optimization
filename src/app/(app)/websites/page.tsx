import { Globe2 } from "lucide-react";

import { getWorkspaceShellContext } from "@/server/auth";
import {
  listClients,
  listWebsites,
  websiteAuthorizationScopes,
} from "@/server/revenue";

import { createWebsiteAction } from "./actions";
import { EmptyState, PageHeader, Panel, RowLink, StatusChip } from "../ui";

export default async function WebsitesPage() {
  const shell = await getWorkspaceShellContext();
  const [clients, websites] = await Promise.all([
    listClients(shell.workspaceContext),
    listWebsites(shell.workspaceContext),
  ]);

  return (
    <>
      <PageHeader eyebrow="Owned targets" title="Websites" />
      <div className="mx-grid mx-grid-2">
        <Panel title="Add website">
          {clients.length > 0 ? (
            <form action={createWebsiteAction} className="mx-form">
              <label>
                Client
                <select className="mx-input" name="clientId" required>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Display name
                <input
                  className="mx-input"
                  name="displayName"
                  required
                  type="text"
                />
              </label>
              <label>
                Canonical URL
                <input
                  className="mx-input"
                  name="canonicalUrl"
                  required
                  type="text"
                />
              </label>
              <label>
                Domain
                <input className="mx-input" name="domain" type="text" />
              </label>
              <label>
                Authorization scope
                <select
                  className="mx-input"
                  defaultValue="PUBLIC_PAGES_ONLY"
                  name="authorizationScope"
                >
                  {websiteAuthorizationScopes.map((scope) => (
                    <option key={scope} value={scope}>
                      {scope}
                    </option>
                  ))}
                </select>
              </label>
              <button className="mx-btn" type="submit">
                <Globe2 aria-hidden size={14} />
                Add website
              </button>
            </form>
          ) : (
            <EmptyState>Create or convert a client before adding a website.</EmptyState>
          )}
        </Panel>
        <Panel title="Workspace websites">
          {websites.length > 0 ? (
            <div className="mx-list">
              {websites.map((website) => (
                <RowLink
                  chips={<StatusChip tone="neutral">{website.monitoringStatus}</StatusChip>}
                  href={`/websites/${website.id}`}
                  key={website.id}
                  meta={`${website.clientName} - ${website.domain}`}
                  title={website.displayName}
                />
              ))}
            </div>
          ) : (
            <EmptyState>No websites have been added yet.</EmptyState>
          )}
        </Panel>
      </div>
    </>
  );
}
