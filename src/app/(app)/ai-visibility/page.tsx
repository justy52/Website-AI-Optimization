import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkspaceShellContext } from "@/server/auth";
import { getVisibilityPanel, getVisibilityDashboard } from "@/server/ai-visibility";
import { aggregateVisibility, sampledReportCopy } from "@/domain/ai-visibility/parser";
import { PERPLEXITY_SURFACE, VisibilityValidationError } from "@/domain/ai-visibility/model";
import { Panel, PageHeader, StatusChip } from "../ui";
import { visibilityAction } from "./actions";

export default async function VisibilityPage({ searchParams }: { searchParams: Promise<{ websiteId?: string; validation?: string }> }) {
  const params = await searchParams;
  const { workspaceContext: context } = await getWorkspaceShellContext();
  const dashboard = await getVisibilityDashboard(context);
  if (!params.websiteId) return <><PageHeader title="Observed AI Visibility" eyebrow="Sampled provider evidence — separate from AI Readiness" /><Panel title="Visibility operations"><p>Runs due {dashboard.due} · Failed runs {dashboard.failed} · Missing verified facts {dashboard.missingFacts} · Provider unavailable {dashboard.unavailable} · Requires review {dashboard.review}</p>{dashboard.sites.map(site => <Link className="mx-row" href={`/ai-visibility?websiteId=${site.id}` as never} key={site.id}>{site.name} — {site.factStatus}</Link>)}</Panel></>;
  const panel = await getVisibilityPanel(context, params.websiteId).catch(error => { if (error instanceof VisibilityValidationError) notFound(); throw error; });
  const operation = (key: string, label: string) => <form action={visibilityAction}><input type="hidden" name="websiteId" value={panel.website.id} /><input type="hidden" name="operation" value={key} /><button className="mx-btn" type="submit">{label}</button></form>;
  return <>
    <PageHeader title="Observed AI Visibility" eyebrow={panel.website.displayName} />
    {params.validation && <p role="alert">{params.validation}</p>}
    <Panel title="AI Readiness is separate"><p>Observed AI Visibility measures sampled answers. It does not change AI Readiness or the Digital Visibility Score. No universal AI rank is reported.</p><Link className="mx-link" href={`/websites/${panel.website.id}`}>Website and scored audits</Link></Panel>
    <Panel title="Facts and prompt set"><p>{panel.factStatus}</p><p>Plan maxima: {panel.limits.prompts} active prompts, {panel.limits.surfaces} supported surfaces. Cadence: {panel.limits.windows === 2 ? "twice monthly" : "monthly"}.</p>
      <Link className="mx-link" href={`/clients/${panel.client.id}`}>Review Business Facts</Link>
      {context.role !== "ANALYST" && operation("aliases", "Approve configured competitor aliases")}
      <p>Competitor alias approval uses only the names and domains you explicitly configured on this website.</p>
      {operation("generate", "Generate versioned prompt set")}
      {panel.sets[0] && <><p data-testid="prompt-set">{panel.sets[0].key} · version {panel.sets[0].version} · {panel.prompts.length} active prompts</p><ol>{panel.prompts.map(p => <li key={p.id}>{p.renderedPrompt}</li>)}</ol><details><summary>Approved alias snapshot and fact references</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(panel.sets[0].aliases, null, 2)}</pre></details></>}
    </Panel>
    <Panel title="Surfaces"><p>{PERPLEXITY_SURFACE}: <strong>{panel.configured ? "CONFIGURED" : "UNAVAILABLE / PROVIDER NOT CONFIGURED"}</strong></p><p>OpenAI web-grounded API: disabled. Gemini API + Google Search grounding: disabled.</p>{panel.sets[0] && operation("run", "Run API observations")}
      {panel.qa && panel.sets[0] && <><p>QA TEST FIXTURE — synthetic answers, zero API usage, no contractual completion.</p>{operation("fixture", "Run deterministic QA fixture")}</>}
    </Panel>
    <Panel title="Observation history"><p>Each run keeps its own surface, exact prompt set, sample window, and parser result. Raw captures expire after 90 days. Normalized history is retained.</p>
      {panel.runs.map(run => { const observations = panel.observations.filter(o => o.runId === run.id); const metrics = aggregateVisibility(observations); const rate = (value: number | null) => value === null ? "Not available" : `${(value * 100).toFixed(1)}%`; return <article className="mx-panel" key={run.id} data-testid="visibility-run"><h3>{run.surface}</h3><StatusChip>{run.status}</StatusChip><p>{run.source} · {run.model} · set v{run.promptSetVersion} · {run.window}</p><p>{sampledReportCopy(run.surface, metrics)}</p><p>Mention rate {rate(metrics.mentionRate)} · Recommendation rate {rate(metrics.recommendationRate)} · Citation rate {rate(metrics.citationRate)} · Share of mentions {rate(metrics.shareOfMentions)}</p><p>Failed {metrics.failedPrompts} · Unavailable {metrics.unavailablePrompts} · Review required {metrics.reviewRequired}</p><p>{run.limitations.join(" ")}</p>{observations.map(o => <Link className="mx-row" key={o.id} href={`/ai-visibility/observations/${o.id}` as never}>{o.renderedPrompt} — {o.parsed?.client.classification ?? o.status} · client citations {o.parsed?.clientCitationCount ?? 0} · competitor citations {o.parsed?.competitorCitationCount ?? 0}</Link>)}</article>; })}
    </Panel>
    {panel.prompts.length > 0 && <Panel title="Record a manual observation"><p>Human-recorded consumer surface evidence. Manual records never consume API entitlement or complete the API deliverable.</p><form action={visibilityAction} className="mx-form-grid"><input type="hidden" name="operation" value="manual" /><input type="hidden" name="websiteId" value={panel.website.id} /><label>Exact observed prompt<select name="promptId">{panel.prompts.map(p => <option key={p.id} value={p.id}>{p.renderedPrompt}</option>)}</select></label><label>Manual surface<input name="surface" required maxLength={100} /></label><label>Observed timestamp (UTC)<input type="datetime-local" name="observedAt" required /></label><label>Captured answer<textarea name="answer" required maxLength={100000} /></label><label>Evidence reference and limitations<textarea name="limitations" required maxLength={2000} /></label><button className="mx-btn" type="submit">Record MANUAL observation</button></form></Panel>}
  </>;
}
