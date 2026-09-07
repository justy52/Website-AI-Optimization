import Link from "next/link";
import { notFound } from "next/navigation";

import { Archive, ArrowLeft, Globe2, Save } from "lucide-react";

import {
  getServicePlanDefinition,
  servicePlanKeys,
} from "@/domain/service-plans";
import { getWorkspaceShellContext } from "@/server/auth";
import { listClientFactualControls } from "@/server/agents";
import {
  getClient,
  listWebsites,
  websiteAuthorizationScopes,
} from "@/server/revenue";

import { createWebsiteAction } from "../../websites/actions";
import {
  archiveClientAction,
  createBusinessFactAction,
  createClaimPolicyAction,
  createClientKnowledgeSourceAction,
  updateClientAction,
} from "../actions";
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
  const factualControls = await listClientFactualControls(
    shell.workspaceContext,
    client.id,
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
      <div className="mx-spacer" />
      <Panel
        right={
          <StatusChip tone="info">
            {factualControls.sources.length} sources / {factualControls.facts.length} facts
          </StatusChip>
        }
        title="Client factual controls"
      >
        <div className="mx-grid mx-grid-2">
          <form action={createClientKnowledgeSourceAction} className="mx-form">
            <input name="clientId" type="hidden" value={client.id} />
            <label>
              Source type
              <select className="mx-input" name="sourceType">
                <option value="WEBSITE_PAGE">Website page</option>
                <option value="ONBOARDING_ANSWER">Onboarding answer</option>
              </select>
            </label>
            <label>
              Verification
              <select className="mx-input" name="sourceVerificationStatus">
                <option value="NEEDS_REVIEW">Needs review</option>
                <option value="VERIFIED">Verified source</option>
              </select>
            </label>
            <label className="mx-form-wide">
              Source title
              <input className="mx-input" name="sourceTitle" required type="text" />
            </label>
            <label className="mx-form-wide">
              Source URL
              <input className="mx-input" name="sourceUrl" type="url" />
            </label>
            <label className="mx-form-wide">
              Excerpt
              <textarea className="mx-input" name="sourceExcerpt" rows={3} />
            </label>
            <button className="mx-btn mx-form-wide" type="submit">
              <Save aria-hidden size={14} />
              Add source
            </button>
          </form>
          <form action={createBusinessFactAction} className="mx-form">
            <input name="clientId" type="hidden" value={client.id} />
            <label>
              Fact type
              <input
                className="mx-input"
                name="factType"
                placeholder="service, service_area, brand_claim"
                required
                type="text"
              />
            </label>
            <label>
              Verification
              <select className="mx-input" name="verificationStatus">
                <option value="NEEDS_REVIEW">Needs review</option>
                <option value="VERIFIED">Verified fact</option>
              </select>
            </label>
            <label>
              Sensitivity
              <select className="mx-input" name="sensitivity">
                <option value="PUBLIC">Public</option>
                <option value="INTERNAL">Internal</option>
                <option value="CONFIDENTIAL">Confidential</option>
              </select>
            </label>
            <label className="mx-form-wide">
              Value
              <input className="mx-input" name="factValue" required type="text" />
            </label>
            <label className="mx-form-wide">
              Source reference
              <input
                className="mx-input"
                name="sourceReference"
                placeholder="Approved page URL, onboarding answer, or source note"
                required
                type="text"
              />
            </label>
            <button className="mx-btn mx-form-wide" type="submit">
              <Save aria-hidden size={14} />
              Add fact
            </button>
          </form>
        </div>
        <div className="mx-spacer" />
        <form action={createClaimPolicyAction} className="mx-form">
          <input name="clientId" type="hidden" value={client.id} />
          <label>
            Rule type
            <select className="mx-input" name="ruleType">
              <option value="ALLOWED">Allowed</option>
              <option value="REQUIRES_APPROVAL">Requires approval</option>
              <option value="REQUIRED_DISCLAIMER">Required disclaimer</option>
              <option value="STRICTER_REVIEW">Stricter review</option>
              <option value="PROHIBITED">Prohibited</option>
            </select>
          </label>
          <label>
            Claim category
            <input
              className="mx-input"
              name="claimCategory"
              placeholder="pricing, warranty, credentials"
              required
              type="text"
            />
          </label>
          <label className="mx-form-wide">
            Rule
            <input className="mx-input" name="claimRule" required type="text" />
          </label>
          <label className="mx-form-wide">
            Required disclaimer
            <input className="mx-input" name="requiredDisclaimer" type="text" />
          </label>
          <button className="mx-btn mx-form-wide" type="submit">
            <Save aria-hidden size={14} />
            Add claim policy
          </button>
        </form>
        <div className="mx-spacer" />
        {factualControls.sources.length > 0 ? (
          <div className="mx-list">
            {factualControls.sources.map((source) => (
              <div className="mx-row mx-row-static" key={source.id}>
                <div className="mx-row-main">
                  <span className="mx-row-title">{source.title}</span>
                  <span className="mx-row-meta">
                    {source.sourceType} - {source.sourceUrl ?? "internal source"}
                  </span>
                </div>
                <StatusChip
                  tone={source.verificationStatus === "VERIFIED" ? "good" : "warn"}
                >
                  {source.verificationStatus}
                </StatusChip>
              </div>
            ))}
          </div>
        ) : null}
        <div className="mx-spacer" />
        {factualControls.facts.length > 0 ? (
          <div className="mx-list">
            {factualControls.facts.map((fact) => (
              <div className="mx-row mx-row-static" key={fact.id}>
                <div className="mx-row-main">
                  <span className="mx-row-title">{fact.value}</span>
                  <span className="mx-row-meta">
                    {fact.factType} - {fact.sensitivity} - {fact.sourceReference}
                  </span>
                </div>
                <StatusChip
                  tone={fact.verificationStatus === "VERIFIED" ? "good" : "warn"}
                >
                  {fact.verificationStatus}
                </StatusChip>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>
            Add verified facts before asking PREPARE to propose claim-sensitive
            copy.
          </EmptyState>
        )}
        {factualControls.policies.length > 0 ? (
          <>
            <div className="mx-spacer" />
            <div className="mx-list">
              {factualControls.policies.map((policy) => (
                <div className="mx-row mx-row-static" key={policy.id}>
                  <div className="mx-row-main">
                    <span className="mx-row-title">{policy.claimCategory}</span>
                    <span className="mx-row-meta">{policy.rule}</span>
                  </div>
                  <StatusChip tone={policy.ruleType === "PROHIBITED" ? "bad" : "info"}>
                    {policy.ruleType}
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
