import Link from "next/link";
import { notFound } from "next/navigation";

import { Archive, ArrowLeft, Play, Save } from "lucide-react";

import { getWorkspaceShellContext } from "@/server/auth";
import {
  getWebsite,
  websiteAuthorizationScopes,
} from "@/server/revenue";

import { archiveWebsiteAction, updateWebsiteAction } from "../actions";
import { startAuditAction } from "../../audits/actions";
import { formatDate, PageHeader, Panel, StatusChip } from "../../ui";

export default async function WebsiteDetailPage({
  params,
}: {
  params: Promise<{ websiteId: string }>;
}) {
  const { websiteId } = await params;
  const shell = await getWorkspaceShellContext();
  const website = await getWebsite(shell.workspaceContext, websiteId);

  if (!website) {
    notFound();
  }

  const scope =
    typeof website.authorizationScope.scope === "string"
      ? website.authorizationScope.scope
      : "PUBLIC_PAGES_ONLY";

  return (
    <>
      <PageHeader
        action={
          <Link className="mx-btn mx-btn-ghost" href="/websites">
            <ArrowLeft aria-hidden size={14} />
            Websites
          </Link>
        }
        eyebrow={`Website - ${formatDate(website.createdAt)}`}
        title={website.displayName}
      />
      <div className="mx-grid mx-grid-2">
        <Panel
          right={<StatusChip tone="neutral">{website.monitoringStatus}</StatusChip>}
          title="Website record"
        >
          <form action={updateWebsiteAction} className="mx-form">
            <input name="websiteId" type="hidden" value={website.id} />
            <label>
              Display name
              <input
                className="mx-input"
                defaultValue={website.displayName}
                name="displayName"
                required
                type="text"
              />
            </label>
            <label>
              Canonical URL
              <input
                className="mx-input"
                defaultValue={website.canonicalUrl}
                name="canonicalUrl"
                required
                type="text"
              />
            </label>
            <label>
              Domain
              <input
                className="mx-input"
                defaultValue={website.domain}
                name="domain"
                type="text"
              />
            </label>
            <label>
              Authorization scope
              <select
                className="mx-input"
                defaultValue={scope}
                name="authorizationScope"
              >
                {websiteAuthorizationScopes.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <button className="mx-btn" type="submit">
              <Save aria-hidden size={14} />
              Save website
            </button>
          </form>
          <form action={archiveWebsiteAction} className="mx-action-inline">
            <input name="websiteId" type="hidden" value={website.id} />
            <button className="mx-btn mx-btn-ghost" type="submit">
              <Archive aria-hidden size={14} />
              Archive website
            </button>
          </form>
        </Panel>
        <Panel title="Audit target">
          <div className="mx-method">
            <span>Client</span>
            <Link href={`/clients/${website.clientId}`}>{website.clientName}</Link>
          </div>
          <div className="mx-method">
            <span>Canonical URL</span>
            <span>{website.canonicalUrl}</span>
          </div>
          <div className="mx-method">
            <span>Domain</span>
            <span>{website.domain}</span>
          </div>
          <p className="mx-muted">
            Saving this target does not fetch, crawl, or audit the website.
          </p>
          <form action={startAuditAction} className="mx-action-inline">
            <input name="websiteId" type="hidden" value={website.id} />
            <button className="mx-btn" type="submit">
              <Play aria-hidden size={14} />
              Start audit
            </button>
          </form>
        </Panel>
      </div>
    </>
  );
}
