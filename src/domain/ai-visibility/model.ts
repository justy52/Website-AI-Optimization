import { createHash } from "node:crypto";
import { getServicePlanDefinition, type ServicePlanKey } from "@/domain/service-plans";

export const PROMPT_TEMPLATE_VERSION = "ai-vis-local-services-v1";
export const PARSER_VERSION = "ai-vis-parser-v1.1";
export const PERPLEXITY_SURFACE = "Perplexity Agent API";
export const SURFACES = [PERPLEXITY_SURFACE, "OpenAI web-grounded API", "Gemini API + Google Search grounding"] as const;
export type ObservationSource = "API" | "MANUAL" | "QA_FIXTURE";
export type Classification = "DIRECT_RECOMMENDATION" | "DIRECT_MENTION" | "CITED_SOURCE" | "URL_MENTION" | "CONTEXT_ONLY" | "NO_MENTION" | "REVIEW_REQUIRED";
export type AliasEntity = { key: string; names: string[]; abbreviations?: string[]; domains: string[]; locations: string[]; factRefs: string[] };
export type AliasSnapshot = { client: AliasEntity; competitors: AliasEntity[]; authorityDomains: string[] };
export type VisibilityFact = { id: string; factType: string; value: string; verificationStatus: string; sensitivity: string; approvedByUserId?: string | null; structuredValue?: Record<string, unknown>; archivedAt?: Date | null; effectiveAt?: Date | null; expiresAt?: Date | null };
export type RenderedPrompt = { key: string; templateKey: string; text: string; serviceFactId: string; locationFactId: string; optionalFactRefs: string[] };
export type NativeCitation = { url: string; title?: string; index: string; relationship: "PROVIDER_SOURCE" | "ANSWER_CITATION" };
export type ParsedCitation = NativeCitation & { domain: string; owner: "CLIENT" | "COMPETITOR" | "INDEPENDENT_AUTHORITY" | "OTHER"; entityKey: string | null };
export type EntityResult = { key: string; classification: Classification; confidence: "HIGH" | "MEDIUM" | "LOW"; evidence: string | null; negative: boolean };
export type ParsedObservation = { parserVersion: string; client: EntityResult; competitors: EntityResult[]; citations: ParsedCitation[]; clientCitationCount: number; competitorCitationCount: number; independentSourceCitationCount: number; limitations: string[] };
export class VisibilityValidationError extends Error { constructor(message: string) { super(message); this.name = "VisibilityValidationError"; } }
export const visibilityHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function visibilityLimits(plan: ServicePlanKey, version?: string) {
  const definition = getServicePlanDefinition(plan, version);
  return { prompts: definition.limits.observedAiVisibilityPrompts ?? 0, surfaces: definition.limits.observedAiVisibilitySurfaces ?? 0, competitors: definition.limits.configuredCompetitors ?? 0, windows: definition.monitoring.observedAiVisibility === "twice_monthly" ? 2 : definition.monitoring.observedAiVisibility === "monthly" ? 1 : 0 };
}
export function visibilityWindow(date: Date, windows: number) {
  const month = date.toISOString().slice(0, 7);
  return `${month}:${windows === 2 && date.getUTCDate() >= 16 ? "2" : "1"}`;
}
export function eligibleFacts(facts: VisibilityFact[], at = new Date()) {
  return facts.filter(f => f.sensitivity === "PUBLIC" && f.verificationStatus === "VERIFIED" && f.approvedByUserId && !f.archivedAt && (!f.effectiveAt || f.effectiveAt <= at) && (!f.expiresAt || f.expiresAt > at));
}
export function normalizeDomain(input: string): string | null {
  try {
    const url = new URL(input.includes("://") ? input : `https://${input}`);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || !url.hostname.includes(".")) return null;
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch { return null; }
}
export function buildAliases(facts: VisibilityFact[], competitorFacts: { key: string; facts: VisibilityFact[] }[] = [], competitorLimit = 0): AliasSnapshot {
  const entity = (key: string, source: VisibilityFact[]): AliasEntity => {
    const approved = eligibleFacts(source);
    const names = approved.filter(f => ["business_name", "legal_name", "display_name", "brand_name", "accepted_abbreviation", "relevant_former_name"].includes(f.factType));
    const domains = approved.filter(f => f.factType === "canonical_domain");
    const locations = approved.filter(f => ["location", "service_area"].includes(f.factType));
    return { key, names: [...new Set(names.map(f => f.value.trim()).filter(v => v.length >= 2 && v.length <= 160))], abbreviations: names.filter(f => f.factType === "accepted_abbreviation").map(f => f.value.trim()), domains: [...new Set(domains.map(f => normalizeDomain(f.value)).filter((v): v is string => Boolean(v)))], locations: locations.map(f => f.value.trim()), factRefs: [...names, ...domains, ...locations].map(f => f.id) };
  };
  const client = entity("client", facts);
  if (!client.names.length || !client.domains.length) throw new VisibilityValidationError("Add PUBLIC VERIFIED business name and canonical_domain facts before creating aliases.");
  return { client, competitors: competitorFacts.slice(0, competitorLimit).map(c => entity(c.key, c.facts)).filter(c => c.names.length && c.domains.length), authorityDomains: [] };
}

const coreTemplates = [
  "What are the best {service} companies in {location}?",
  "Who should I hire for {service} in {location}?",
  "Which companies provide {service} near {location}?",
  "Recommend a reputable {service} company in {location}.",
  "What local companies specialize in {service} in {location}?",
  "Who is known for {service} around {location}?",
  "What should I look for when choosing a {service} company in {location}, and which local companies fit those criteria?",
  "Which {service} providers in {location} have strong customer trust signals?",
  "Compare reputable options for {service} in {location}.",
];
export function generateVisibilityPrompts(facts: VisibilityFact[], plan: ServicePlanKey, version?: string): RenderedPrompt[] {
  const limit = visibilityLimits(plan, version).prompts;
  if (!limit) throw new VisibilityValidationError("This plan has no configured AI visibility prompt allowance.");
  const approved = eligibleFacts(facts).filter(f => f.value.trim().length > 0 && f.value.length <= 160 && !/[\r\n<>\x00-\x1f]/.test(f.value));
  const byType = (type: string[]) => approved.filter(f => type.includes(f.factType)).sort((a, b) => Number(b.structuredValue?.primary === true) - Number(a.structuredValue?.primary === true) || a.id.localeCompare(b.id));
  const services = byType(["service"]), locations = byType(["service_area", "location"]);
  if (!services.length || !locations.length) throw new VisibilityValidationError("PUBLIC VERIFIED service and location facts are required. Add and verify the missing facts.");
  const prompts: RenderedPrompt[] = [];
  const add = (template: string, templateKey: string, service: VisibilityFact, location: VisibilityFact, optional?: VisibilityFact) => {
    const text = template.replaceAll("{service}", service.value.trim()).replaceAll("{location}", location.value.trim()).replaceAll("{optional}", optional?.value.trim() ?? "");
    if (prompts.some(p => p.text.toLowerCase() === text.toLowerCase()) || prompts.length >= limit) return;
    prompts.push({ key: visibilityHash([templateKey, service.id, location.id, optional?.id]).slice(0, 24), templateKey, text, serviceFactId: service.id, locationFactId: location.id, optionalFactRefs: optional ? [optional.id] : [] });
  };
  // Round-robin distinct services first; one deliberate location pairing per service,
  // rather than a Cartesian explosion of near-identical permutations.
  for (let t = 0; t < coreTemplates.length; t++) for (let i = 0; i < services.length; i++) add(coreTemplates[t], `core-${t < 8 ? t + 1 : 10}`, services[i], locations[i % locations.length]);
  for (const fact of byType(["specific_service_need"])) add("Who can help with {optional} in {location}?", "core-9", services[0], locations[0], fact);
  if (limit > 10) {
    for (const location of locations.slice(1)) add("{service} company serving {location}", "expansion-11", services[0], location);
    for (const [type, template, key] of [["service_subtype", "Best company for {optional} in {location}", "12"], ["high_value_use_case", "Who handles {optional} in {location}?", "13"], ["service_problem", "Local expert for {optional} in {location}", "14"]]) {
      for (const fact of byType([type])) add(template, `expansion-${key}`, services[0], locations[0], fact);
    }
  }
  return prompts;
}
