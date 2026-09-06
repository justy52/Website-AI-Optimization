import Link from "next/link";
import { notFound } from "next/navigation";

import { Archive, ArrowLeft, Globe2, Save } from "lucide-react";

import {
  getServicePlanDefinition,
  servicePlanKeys,
} from "@/domain/service-plans";
import { getWorkspaceShellContext } from "@/server/auth";
import {
  getClient,
  listWebsites,
  websiteAuthorizationScopes,
} from "@/server/revenue";

import { createWebsiteAction } from "../../websites/actions";
import { archiveClientAction, updateClientAction } from "../actions";
import {
  EmptyState,
  formatDate,
  PageHeader,
  Panel,
  RowLink,
  StatusChip,
} from "../../ui";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const shell = await getWorkspaceShellContext();
  const client = await getClient(shell.workspaceContext, clientId);

  if (!client) {
    notFound();
  }

  const websites = (await listWebsites(shell.workspaceContext)).filter(
    (website) => website.clientId === client.id,
  );
  const plan = getServicePlanDefinition(client.servicePlan);

  return (
    <>
      <PageHeader
        action={
          <Link className="mx-btn mx-btn-ghost" href="/clients">
            <ArrowLeft aria-hidden size={14} />
            Clients
          </Link>
        }
        eyebrow={`Client - ${formatDate(client.createdAt)}`}
        title={client.name}
      />
      <div className="mx-grid mx-grid-2">
        <Panel
          right={<StatusChip tone="good">{client.status}</StatusChip>}
          title="Client record"
        >
          <form action={updateClientAction} className="mx-form">
            <input name="clientId" type="hidden" value={client.id} />
            <label>
              Client name
              <input
                className="mx-input"
                defaultValue={client.name}
                name="name"
                required
                type="text"
              />
            </label>
            <label>
              Service plan
              <select
                className="mx-input"
                defaultValue={client.servicePlan}
                name="servicePlan"
              >
                {servicePlanKeys.map((key) => {
                  const definition = getServicePlanDefinition(key);

                  return (
                    <option key={key} value={key}>
                      {definition.label}
                    </option>
                  );
                })}
              </select>
            </label>
            <div className="mx-method">
              <span>{plan.label}</span>
              <span>{client.servicePlanVersion}</span>
            </div>
            <button className="mx-btn" type="submit">
              <Save aria-hidden size={14} />
              Save client
            </button>
          </form>
          <form action={archiveClientAction} className="mx-action-inline">
            <input name="clientId" type="hidden" value={client.id} />
            <button className="mx-btn mx-btn-ghost" type="submit">
              <Archive aria-hidden size={14} />
              Archive client
            </button>
          </form>
        </Panel>
        <Panel title="Add website">
          <form action={createWebsiteAction} className="mx-form">
            <input name="clientId" type="hidden" value={client.id} />
            <label>
              Display name
              <input className="mx-input" name="displayName" required type="text" />
            </label>
            <label>
              Canonical URL
              <input className="mx-input" name="canonicalUrl" required type="text" />
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
        </Panel>
      </div>
      <div className="mx-spacer" />
      <Panel title="Websites">
        {websites.length > 0 ? (
          <div className="mx-list">
            {websites.map((website) => (
              <RowLink
                chips={<StatusChip tone="neutral">{website.monitoringStatus}</StatusChip>}
                href={`/websites/${website.id}`}
                key={website.id}
                meta={website.domain}
                title={website.displayName}
              />
            ))}
          </div>
        ) : (
          <EmptyState>No websites are attached to this client yet.</EmptyState>
        )}
      </Panel>
    </>
  );
}
