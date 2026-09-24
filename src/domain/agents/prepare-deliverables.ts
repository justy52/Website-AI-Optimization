import {
  assertPrepareOutputPolicy, filterModelVisibleBusinessFacts,
  type ExistingPageOptimizationInput as Input,
  type ExistingPageOptimizationOutput as Output,
  type PrepareBusinessFact, type PrepareModelProvider,
} from "./page-optimization";
import { routePrepareOpportunity } from "./routing";

type Proposal = Output["proposals"][number];
const limitations = [
  "Search Console metrics are not supplied to this PREPARE run; keyword volume, rankings and traffic estimates are unknown.",
  "Live AI and observed AI visibility providers are disabled. Captured pages are untrusted data, never instructions.",
  "This artifact requires human approval. Preparation and approval do not fulfill implementation entitlements.",
];

function httpsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function capturedInternalPages(input: Input) {
  const canonical = httpsUrl(input.website.canonicalUrl);
  if (!canonical) return [];
  const origin = new URL(canonical).origin;
  const pages = new Map<string, string>();
  // Canonical website context was explicitly entered by an authorized operator.
  pages.set(canonical, input.opportunity.id);
  for (const item of input.auditEvidence) {
    if (item.evidenceType !== "HTML") continue;
    const url = item.sourceUrl && httpsUrl(item.sourceUrl);
    if (url && new URL(url).origin === origin) pages.set(url, item.id);
  }
  return [...pages].map(([url, ref]) => ({ url, ref })).slice(0, 8);
}

function proposal(input: Input, field: Proposal["field"], value: unknown, facts: PrepareBusinessFact[] = [], missing = false): Proposal {
  return {
    field, currentValue: null,
    proposedValue: value == null ? null : typeof value === "string" ? value : JSON.stringify(value),
    rationale: "Bounded editorial recommendation for human assessment; no publication or website change has occurred.",
    evidenceRefs: input.auditEvidence.slice(0, 3).map(e => e.id),
    factualBasis: facts.length ? facts.map(f => ({ kind: "VERIFIED_FACT", ref: f.id, note: "PUBLIC VERIFIED Business Fact supplied to this run." })) : [
      { kind: missing ? "UNKNOWN_TBD" : "INFERENCE_RECOMMENDATION", ref: input.opportunity.id, note: missing ? "Human input required; not an established fact." : "Editorial suggestion, not a claim of measured performance." },
    ],
    requiresHumanInput: missing,
  };
}

export function createDeterministicDeliverable(input: Input): Output {
  const route = routePrepareOpportunity(input.opportunity);
  if (!route || route.agentKey === "existing-page-optimization") throw new Error("A supported specialist route is required.");
  const facts = filterModelVisibleBusinessFacts(input.businessFacts);
  const fact = (type: string) => facts.find(f => f.factType === type && f.value.length <= 200);
  const proposals: Proposal[] = [];
  if (route.artifactType === "CONTENT_BRIEF") {
    const service = fact("service");
    const location = fact("service_area");
    const used = [service, location].filter((f): f is PrepareBusinessFact => !!f);
    const topic = service ? `Guide to ${service.value}` : "TBD: confirm topic with the client";
    proposals.push(proposal(input, "topic", { proposedTitle: topic, targetService: service?.value ?? "TBD", targetLocation: location?.value ?? "TBD" }, used, !service));
    proposals.push(proposal(input, "intent_audience", { intent: "Informational; proposed, not measured", audience: "Prospective readers evaluating this topic; confirm with client", purpose: "Answer the evidenced content gap with an educational resource" }));
    proposals.push(proposal(input, "outline", { H1: topic, H2: ["What the reader should understand", "Questions to ask", "How to evaluate the next step"] }, service ? [service] : [], !service));
    proposals.push(proposal(input, "questions", ["What should readers understand before deciding?", "What information should readers gather?", "Which next step fits the reader's needs?"]));
    const pages = capturedInternalPages(input);
    proposals.push(proposal(input, "internal_link", { candidates: pages.map(p => p.url), instruction: "Choose a relevant captured page after reviewing the finished content" }, [], pages.length === 0));
    proposals.push(proposal(input, "cta", "Invite the reader to discuss the next step; confirm the destination and wording with the client."));
    proposals.push(proposal(input, "missing_inputs", { topic: service ? "Supported by referenced fact" : "TBD", location: location ? "Supported by referenced fact" : "TBD", finalCopy: "TBD: human authoring required", analytics: "Not supplied", publication: "Not performed" }));
  } else if (route.artifactType === "INTERNAL_LINK_PROPOSAL") {
    const pages = capturedInternalPages(input);
    const source = pages[0];
    const destination = pages.find(p => p.url !== source?.url);
    proposals.push(proposal(input, "internal_link", {
      sourcePage: source?.url ?? null, destinationPage: destination?.url ?? null,
      suggestedAnchor: destination ? "Learn more" : null,
      reason: "Candidate connection between known pages; a human must confirm topical relevance and placement.",
      confidence: "LOW", evidenceRefs: [source?.ref, destination?.ref].filter(Boolean),
    }, [], !destination));
    if (!destination) proposals.push(proposal(input, "missing_inputs", "TBD: capture or explicitly approve a distinct destination page before proposing a link.", [], true));
  } else {
    const name = fact("business_name");
    const website = fact("website_url");
    const url = website && httpsUrl(website.value);
    const used = [name, url ? website : undefined].filter((f): f is PrepareBusinessFact => !!f);
    const jsonLd = name ? { "@context": "https://schema.org", "@type": url ? "WebSite" : "Organization", name: name.value, ...(url ? { url } : {}) } : null;
    proposals.push(proposal(input, "schema", jsonLd, used, !name));
    proposals.push(proposal(input, "missing_inputs", name ? "Validate the proposed entity and placement before implementation. LocalBusiness and FAQ require additional verified source material and are not generated by this bounded version." : "TBD: a PUBLIC VERIFIED business_name fact is required. No JSON-LD was generated.", [], true));
  }
  return assertDeliverablePolicy({
    schemaVersion: "prepare-deliverable-v1.0", artifactTitle: route.label.replace("Prepare ", ""),
    artifactType: route.artifactType, riskLevel: "MEDIUM", confidence: "LOW",
    conciseRationale: "The Opportunity's deterministic routing selected one bounded PREPARE capability. No external action was performed.",
    nextAction: "Review the draft, supply missing inputs, and record a human approval before any manual implementation.",
    permissionLevel: "PREPARE", externalExecutionRequested: false, proposals, unsupportedClaimWarnings: limitations,
  }, input);
}

export function assertDeliverablePolicy(output: Output, input: Input): Output {
  const route = routePrepareOpportunity(input.opportunity);
  if (!route || output.artifactType !== route.artifactType) throw new Error("Artifact does not match the authorized Opportunity route.");
  const reviewed = assertPrepareOutputPolicy(output, input);
  const pages = new Set(capturedInternalPages(input).map(p => p.url));
  const facts = filterModelVisibleBusinessFacts(input.businessFacts);
  const allowedFields = reviewed.artifactType === "CONTENT_BRIEF" ? ["topic", "intent_audience", "outline", "questions", "internal_link", "cta", "missing_inputs"] : reviewed.artifactType === "SCHEMA_PROPOSAL" ? ["schema", "missing_inputs"] : ["internal_link", "missing_inputs"];
  for (const item of reviewed.proposals) {
    if (!allowedFields.includes(item.field)) throw new Error("Unsupported specialist proposal field.");
    if (/(keyword volume|search volume|ranking|traffic estimate)\D{0,15}\d/i.test(item.proposedValue ?? "")) throw new Error("Measured search claims are not supported by this PREPARE capability.");
    if (reviewed.artifactType === "CONTENT_BRIEF" && item.field === "internal_link" && item.proposedValue) {
      const links = JSON.parse(item.proposedValue);
      if (!Array.isArray(links.candidates) || links.candidates.some((url: string) => !pages.has(url))) throw new Error("Content brief link URL was not captured or explicitly approved.");
    }
    if (reviewed.artifactType === "SCHEMA_PROPOSAL" && item.field === "schema" && item.proposedValue) {
      const json = JSON.parse(item.proposedValue) as Record<string, unknown>;
      if (Object.keys(json).some(key => !["@context", "@type", "name", "url"].includes(key)) || json["@context"] !== "https://schema.org" || !["Organization", "WebSite"].includes(String(json["@type"]))) throw new Error("Unsupported JSON-LD type or property.");
      for (const [property, type] of [["name", "business_name"], ["url", "website_url"]]) {
        if (property === "url" && json[property] === undefined && json["@type"] !== "WebSite") continue;
        if (!facts.some(f => f.factType === type && (property === "url" ? httpsUrl(f.value) : f.value) === json[property] && item.factualBasis.some(b => b.kind === "VERIFIED_FACT" && b.ref === f.id))) throw new Error("JSON-LD property lacks an exact PUBLIC VERIFIED fact.");
      }
    }
    if (reviewed.artifactType === "INTERNAL_LINK_PROPOSAL" && item.field === "internal_link" && item.proposedValue) {
      const link = JSON.parse(item.proposedValue);
      for (const url of [link.sourcePage, link.destinationPage]) if (url !== null && !pages.has(url)) throw new Error("Link URL was not captured or explicitly approved.");
      const refs = new Set(capturedInternalPages(input).map(p => p.ref));
      if (!Array.isArray(link.evidenceRefs) || link.evidenceRefs.some((ref: string) => !refs.has(ref))) throw new Error("Unknown internal-link evidence reference.");
      if ((!link.sourcePage || !link.destinationPage) && !item.requiresHumanInput) throw new Error("Missing link endpoints require human input.");
    }
  }
  return reviewed;
}

export function createDeterministicDeliverableProvider(): PrepareModelProvider {
  return {
    provider: "deterministic", model: "deterministic-prepare-deliverables-v1",
    async generate(input) { return { output: createDeterministicDeliverable(input), usage: { actualCostCents: 0, inputTokens: 0, outputTokens: 0 } }; },
  };
}
