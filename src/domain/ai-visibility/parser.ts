import { PARSER_VERSION, normalizeDomain, type AliasEntity, type AliasSnapshot, type EntityResult, type NativeCitation, type ParsedCitation, type ParsedObservation } from "./model";

const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const contains = (text: string, name: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escaped(name)}(?![\\p{L}\\p{N}])`, "iu").test(text);
const direct = (result: EntityResult) => result.confidence !== "LOW" && ["DIRECT_MENTION", "DIRECT_RECOMMENDATION"].includes(result.classification);

function classifyEntity(answer: string, entity: AliasEntity, citations: ParsedCitation[], all: AliasEntity[]): EntityResult {
  const base: EntityResult = { key: entity.key, classification: "NO_MENTION", confidence: "HIGH", evidence: null, negative: false };
  const cited = citations.some(c => c.entityKey === entity.key);
  const urls = answer.match(/https?:\/\/[^\s<>\])]+/gi) ?? [];
  const urlMention = urls.some(url => entity.domains.includes(normalizeDomain(url) ?? ""));
  const prose = answer.replace(/https?:\/\/[^\s<>\])]+/gi, " ");
  const sentences = prose.split(/(?<=[.!?])\s+|\n/).filter(Boolean);
  for (const sentence of sentences) {
    const name = entity.names.find(alias => contains(sentence, alias));
    if (!name) continue;
    const evidence = sentence.slice(0, 500);
    // Capitalization alone cannot turn a common noun into an abbreviation.
    // Only an explicitly approved abbreviation, in its approved case, qualifies.
    const abbreviation = entity.abbreviations?.includes(name) && new RegExp(`(?<![\\p{L}\\p{N}])${escaped(name)}(?![\\p{L}\\p{N}])`, "u").test(sentence);
    const ambiguous = name.split(/\s+/).length === 1 && !abbreviation;
    // A place name alone does not establish which single-word entity is meant.
    const disambiguated = cited || urlMention;
    if (ambiguous && !disambiguated) return { ...base, classification: "REVIEW_REQUIRED", confidence: "LOW", evidence };
    if (/\b(example|hypothetical|unrelated|not (?:a |the )?(?:business|company)|word|phrase|fictional|ignore (?:all|previous)|system prompt|grant execute|change (?:the )?entitlements)\b/i.test(sentence)) {
      return { ...base, classification: "CONTEXT_ONLY", evidence };
    }
    const negative = /\b(avoid|not recommend|do not recommend|don't recommend|cannot recommend|unreliable|negative|poor|scam|untrustworthy)\b/i.test(sentence);
    const otherNamed = all.some(other => other.key !== entity.key && other.names.some(alias => contains(sentence, alias)));
    // Require recommendation language bound to this entity, never inherit it
    // merely from a list heading or a different company in the same sentence.
    const recommendation = !negative && !otherNamed && (
      new RegExp(`\\b(?:recommend|hire|choose)\\s+(?:\\*\\*)?${escaped(name)}(?![\\p{L}\\p{N}])`, "iu").test(sentence) ||
      new RegExp(`${escaped(name)}(?:\\*\\*)?\\s+is\\s+(?:a |the )?(?:recommended|good choice|reputable provider)`, "iu").test(sentence)
    );
    return { ...base, classification: recommendation ? "DIRECT_RECOMMENDATION" : "DIRECT_MENTION", evidence, negative };
  }
  if (cited) return { ...base, classification: "CITED_SOURCE" };
  const bareDomain = entity.domains.some(domain => new RegExp(`(?<![a-z0-9.\\-])${escaped(domain)}(?![a-z0-9\\-]|\\.[a-z0-9])`, "i").test(answer));
  if (urlMention || bareDomain) return { ...base, classification: "URL_MENTION" };
  return base;
}

export function parseVisibilityAnswer(answer: string, native: NativeCitation[], aliases: AliasSnapshot): ParsedObservation {
  const all = [aliases.client, ...aliases.competitors];
  const citations: ParsedCitation[] = [];
  for (const source of native.slice(0, 50)) {
    const domain = normalizeDomain(source.url);
    if (!domain || !/^https?:\/\//i.test(source.url)) continue;
    const owners = all.filter(entity => entity.domains.includes(domain));
    const owner = owners.length === 1 ? owners[0] : null;
    // Unknown sources are OTHER. Authority status requires an explicit set.
    citations.push({ ...source, domain, owner: owner?.key === "client" ? "CLIENT" : owner ? "COMPETITOR" : aliases.authorityDomains.includes(domain) ? "INDEPENDENT_AUTHORITY" : "OTHER", entityKey: owner?.key ?? null });
  }
  return {
    parserVersion: PARSER_VERSION,
    client: classifyEntity(answer, aliases.client, citations, all),
    competitors: aliases.competitors.map(entity => classifyEntity(answer, entity, citations, all)), citations,
    clientCitationCount: citations.filter(c => c.owner === "CLIENT").length,
    competitorCitationCount: citations.filter(c => c.owner === "COMPETITOR").length,
    independentSourceCitationCount: citations.filter(c => c.owner === "INDEPENDENT_AUTHORITY").length,
    limitations: native.length ? [] : ["Provider citation metadata absent; prose URLs are not citations."],
  };
}

export type MetricObservation = { status: string; parsed: ParsedObservation | null };
export function aggregateVisibility(observations: MetricObservation[]) {
  const successful = observations.filter(o => o.status === "SUCCEEDED" && o.parsed);
  const mentions = successful.filter(o => direct(o.parsed!.client)).length;
  const recommendations = successful.filter(o => o.parsed!.client.classification === "DIRECT_RECOMMENDATION" && o.parsed!.client.confidence !== "LOW").length;
  const citations = successful.filter(o => o.parsed!.clientCitationCount > 0).length;
  const competitorMentions = successful.reduce((n, o) => n + o.parsed!.competitors.filter(direct).length, 0);
  const rate = (n: number) => successful.length ? n / successful.length : null;
  return { successfulPrompts: successful.length, failedPrompts: observations.filter(o => o.status === "FAILED").length, unavailablePrompts: observations.filter(o => o.status === "UNAVAILABLE").length, mentions, recommendations, citations, competitorMentions, mentionRate: rate(mentions), recommendationRate: rate(recommendations), citationRate: rate(citations), shareOfMentions: mentions + competitorMentions ? mentions / (mentions + competitorMentions) : null, reviewRequired: successful.filter(o => o.parsed!.client.classification === "REVIEW_REQUIRED").length };
}
export function sampledReportCopy(surface: string, metrics: ReturnType<typeof aggregateVisibility>) {
  const percentage = (rate: number | null) => rate === null ? "unavailable (no denominator)" : `${(rate * 100).toFixed(1)}%`;
  return `Your business was mentioned in ${metrics.mentions} of ${metrics.successfulPrompts} sampled ${surface} prompts in this reporting window. The client domain was cited in ${metrics.citations} sampled answers. Mention rate: ${percentage(metrics.mentionRate)}. Recommendation rate: ${percentage(metrics.recommendationRate)}. Citation rate: ${percentage(metrics.citationRate)}. Share of mentions among the client and configured competitors: ${percentage(metrics.shareOfMentions)}. ${metrics.failedPrompts} failed and ${metrics.unavailablePrompts} unavailable prompts are excluded from rate denominators. These samples are not universal rankings or market share.`;
}
