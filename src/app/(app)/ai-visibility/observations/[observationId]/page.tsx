import { notFound } from "next/navigation";
import { VisibilityValidationError } from "@/domain/ai-visibility/model";
import { getWorkspaceShellContext } from "@/server/auth";
import { getVisibilityObservation } from "@/server/ai-visibility";
import { Panel, PageHeader } from "../../../ui";
function safeSourceUrl(value: string) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.toString() : null; }
  catch { return null; }
}
export default async function ObservationPage({ params }: { params: Promise<{ observationId: string }> }) {
  const { workspaceContext } = await getWorkspaceShellContext();
  const detail = await getVisibilityObservation(workspaceContext, (await params).observationId).catch(error => { if (error instanceof VisibilityValidationError) notFound(); throw error; });
  if (!detail) notFound();
  const { observation: o, capture } = detail;
  const sources = (o.parsed?.citations ?? []).flatMap(c => { const url = safeSourceUrl(c.url); return url ? [{ ...c, url }] : []; });
  return <><PageHeader title="AI Visibility Observation" eyebrow={`${o.source} · ${o.surface}`} /><Panel title="Exact sample"><p>{o.renderedPrompt}</p><p>{o.model} · {o.parserVersion} · {o.observedAt.toISOString()}</p><p>{o.status} · {o.parsed?.client.classification} · {o.parsed?.client.confidence}</p><p>{o.limitations.join(" ")}</p><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{capture?.answer ?? "Raw capture unavailable or expired. Normalized history and hashes remain retained."}</pre>{sources.length > 0 && <><h3>Sources cited in this sample</h3><ul>{sources.map((source, i) => <li key={`${source.url}-${i}`}><a className="mx-link" href={source.url} target="_blank" rel="noopener noreferrer">{source.title || source.url}</a></li>)}</ul></>}</Panel><Panel title="Deterministic comparison and citations"><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(o.parsed, null, 2)}</pre><p>Prompt hash {o.promptHash}</p><p>Answer hash {o.answerHash}</p></Panel></>;
}
