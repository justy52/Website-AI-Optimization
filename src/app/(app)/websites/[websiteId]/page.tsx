import Link from "next/link";
import { notFound } from "next/navigation";

import { Archive, ArrowLeft, Play, PlugZap, RefreshCw, Save } from "lucide-react";

import { getWorkspaceShellContext } from "@/server/auth";
import { listWebsiteCompetitorTargets } from "@/server/competitors";
import { getWebsiteSearchConsolePanel } from "@/server/integrations";
import { getWebsiteMonitoringPanel } from "@/server/monitoring";
import {
  getWebsite,
  websiteAuthorizationScopes,
} from "@/server/revenue";

import {
  archiveCompetitorTargetAction,
  archiveWebsiteAction,
  beginSearchConsoleOAuthAction,
  createCompetitorTargetAction,
  disconnectIntegrationAction,
  ensureMonitoringSchedulesAction,
  observeCompetitorTargetAction,
  requestMonitoringRunAction,
  selectSearchConsolePropertyAction,
  syncSearchConsoleAction,
  updateWebsiteAction,
} from "../actions";
import { startAuditAction } from "../../audits/actions";
import { EmptyState, formatDate, PageHeader, Panel, StatusChip } from "../../ui";

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

  const [monitoring, searchConsole, competitors] = await Promise.all([
    getWebsiteMonitoringPanel(shell.workspaceContext, website.id),
    getWebsiteSearchConsolePanel(shell.workspaceContext, website.id),
    listWebsiteCompetitorTargets(shell.workspaceContext, website.id),
  ]);
  const scope =
    typeof website.authorizationScope.scope === "string"
      ? website.authorizationScope.scope
      : "PUBLIC_PAGES_ONLY";
  const connectedSearchConsole = searchConsole.connections.find(
    (connection) => connection.status === "CONNECTED",
  );
  const selectedProperty = searchConsole.properties.find(
    (property) => property.selected,
  );

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
      <div className="mx-spacer" />
      <div className="mx-grid mx-grid-2">
        <Panel
          right={
            <StatusChip tone={monitoring.schedules.length > 0 ? "good" : "info"}>
              {monitoring.schedules.length > 0 ? "Configured" : "Not configured"}
            </StatusChip>
          }
          title="Recurring monitoring"
        >
          <form action={ensureMonitoringSchedulesAction} className="mx-action-inline">
            <input name="websiteId" type="hidden" value={website.id} />
            <button className="mx-btn" type="submit">
              <RefreshCw aria-hidden size={14} />
              Sync plan schedules
            </button>
          </form>
          {monitoring.schedules.length > 0 ? (
            <div className="mx-list">
              {monitoring.schedules.map((schedule) => (
                <div className="mx-row mx-row-static" key={schedule.id}>
                  <div className="mx-row-main">
                    <span className="mx-row-title">{schedule.monitorKey}</span>
                    <span className="mx-row-meta">
                      {schedule.cadence} - next {formatDate(schedule.nextRunAt)}
                    </span>
                  </div>
                  <StatusChip tone={schedule.enabled ? "good" : "neutral"}>
                    {schedule.enabled ? "Enabled" : "Paused"}
                  </StatusChip>
                  <form action={requestMonitoringRunAction}>
                    <input name="websiteId" type="hidden" value={website.id} />
                    <input
                      name="monitorKey"
                      type="hidden"
                      value={schedule.monitorKey}
                    />
                    <button className="mx-btn mx-btn-ghost" type="submit">
                      <Play aria-hidden size={14} />
                      Run
                    </button>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>
              Sync the current service plan to create the Phase 4A monitoring
              schedule definitions.
            </EmptyState>
          )}
          {monitoring.runs.length > 0 ? (
            <>
              <div className="mx-spacer" />
              <div className="mx-list">
                {monitoring.runs.map((run) => (
                  <div className="mx-row mx-row-static" key={run.id}>
                    <div className="mx-row-main">
                      <span className="mx-row-title">{run.monitorKey}</span>
                      <span className="mx-row-meta">
                        {run.triggerType} - {formatDate(run.createdAt)}
                      </span>
                    </div>
                    <StatusChip
                      tone={
                        run.status === "SUCCEEDED"
                          ? "good"
                          : run.status === "FAILED"
                            ? "bad"
                            : "info"
                      }
                    >
                      {run.status}
                    </StatusChip>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </Panel>
        <Panel
          right={
            <StatusChip tone={connectedSearchConsole ? "good" : "info"}>
              {connectedSearchConsole ? "Connected" : "Disconnected"}
            </StatusChip>
          }
          title="Search Console"
        >
          <div className="mx-method">
            <span>Scope</span>
            <span>webmasters.readonly</span>
          </div>
          {!searchConsole.configured ? (
            <EmptyState>
              Google OAuth variables are not configured for this environment.
            </EmptyState>
          ) : connectedSearchConsole ? (
            <form action={disconnectIntegrationAction} className="mx-action-inline">
              <input name="websiteId" type="hidden" value={website.id} />
              <input
                name="connectionId"
                type="hidden"
                value={connectedSearchConsole.id}
              />
              <button className="mx-btn mx-btn-ghost" type="submit">
                <Archive aria-hidden size={14} />
                Disconnect
              </button>
            </form>
          ) : (
            <form action={beginSearchConsoleOAuthAction} className="mx-action-inline">
              <input name="websiteId" type="hidden" value={website.id} />
              <button className="mx-btn" type="submit">
                <PlugZap aria-hidden size={14} />
                Connect Google
              </button>
            </form>
          )}
          {searchConsole.properties.length > 0 ? (
            <div className="mx-list">
              {searchConsole.properties.map((property) => (
                <div className="mx-row mx-row-static" key={property.id}>
                  <div className="mx-row-main">
                    <span className="mx-row-title">{property.propertyUrl}</span>
                    <span className="mx-row-meta">
                      {property.propertyType} -{" "}
                      {property.verifiedSiteMatch ? "domain match" : "no match"}
                    </span>
                  </div>
                  <StatusChip tone={property.selected ? "good" : "neutral"}>
                    {property.selected ? "Selected" : "Available"}
                  </StatusChip>
                  {!property.selected && property.verifiedSiteMatch ? (
                    <form action={selectSearchConsolePropertyAction}>
                      <input name="websiteId" type="hidden" value={website.id} />
                      <input name="propertyId" type="hidden" value={property.id} />
                      <button className="mx-btn mx-btn-ghost" type="submit">
                        Select
                      </button>
                    </form>
                  ) : null}
                  {property.selected ? (
                    <form action={syncSearchConsoleAction}>
                      <input name="websiteId" type="hidden" value={website.id} />
                      <input name="propertyId" type="hidden" value={property.id} />
                      <button className="mx-btn mx-btn-ghost" type="submit">
                        Sync
                      </button>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
          ) : selectedProperty ? null : (
            <p className="mx-muted">
              Select a matching property after OAuth discovers the Google account
              Search Console sites.
            </p>
          )}
          {searchConsole.latestObservations.length > 0 ? (
            <>
              <div className="mx-spacer" />
              <div className="mx-list">
                {searchConsole.latestObservations.map((observation) => (
                  <div className="mx-row mx-row-static" key={observation.id}>
                    <div className="mx-row-main">
                      <span className="mx-row-title">
                        {observation.query ?? "Query total"}
                      </span>
                      <span className="mx-row-meta">
                        {observation.clicks} clicks / {observation.impressions} impressions
                      </span>
                    </div>
                    <StatusChip tone="info">
                      {(observation.ctrBasisPoints / 100).toFixed(1)}% CTR
                    </StatusChip>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </Panel>
      </div>
      <div className="mx-spacer" />
      <Panel
        right={<StatusChip tone="info">{competitors.targets.length} tracked</StatusChip>}
        title="Competitor targets"
      >
        <form action={createCompetitorTargetAction} className="mx-form">
          <input name="websiteId" type="hidden" value={website.id} />
          <label>
            Name
            <input className="mx-input" name="name" required type="text" />
          </label>
          <label>
            Domain or URL
            <input className="mx-input" name="domainOrUrl" required type="text" />
          </label>
          <label>
            Relationship
            <input
              className="mx-input"
              defaultValue="DIRECT_COMPETITOR"
              name="relationship"
              type="text"
            />
          </label>
          <label>
            Notes
            <input className="mx-input" name="notes" type="text" />
          </label>
          <button className="mx-btn" type="submit">
            <Save aria-hidden size={14} />
            Add competitor
          </button>
        </form>
        <div className="mx-spacer" />
        {competitors.targets.length > 0 ? (
          <div className="mx-list">
            {competitors.targets.map((target) => (
              <div className="mx-row mx-row-static" key={target.id}>
                <div className="mx-row-main">
                  <span className="mx-row-title">{target.name}</span>
                  <span className="mx-row-meta">
                    {target.domain} - {target.relationship}
                  </span>
                </div>
                <form action={observeCompetitorTargetAction}>
                  <input name="websiteId" type="hidden" value={website.id} />
                  <input
                    name="competitorTargetId"
                    type="hidden"
                    value={target.id}
                  />
                  <button className="mx-btn mx-btn-ghost" type="submit">
                    <RefreshCw aria-hidden size={14} />
                    Observe
                  </button>
                </form>
                <form action={archiveCompetitorTargetAction}>
                  <input name="websiteId" type="hidden" value={website.id} />
                  <input
                    name="competitorTargetId"
                    type="hidden"
                    value={target.id}
                  />
                  <button className="mx-btn mx-btn-ghost" type="submit">
                    <Archive aria-hidden size={14} />
                    Archive
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>
            Add public competitor targets to record homepage metadata changes.
          </EmptyState>
        )}
        {competitors.observations.length > 0 ? (
          <>
            <div className="mx-spacer" />
            <div className="mx-list">
              {competitors.observations.map((observation) => (
                <div className="mx-row mx-row-static" key={observation.id}>
                  <div className="mx-row-main">
                    <span className="mx-row-title">
                      {observation.observedTitle ?? observation.sourceUrl}
                    </span>
                    <span className="mx-row-meta">{observation.changeSummary}</span>
                  </div>
                  <StatusChip
                    tone={observation.changedSincePrevious ? "warn" : "neutral"}
                  >
                    {observation.changedSincePrevious ? "Changed" : "Recorded"}
                  </StatusChip>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </Panel>
    </>
  );
}
