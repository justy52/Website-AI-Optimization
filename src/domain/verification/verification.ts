import { parse, type DefaultTreeAdapterMap } from "parse5";
import { z } from "zod";
import { safeFetchText, SafeFetchError, type SafeFetchOptions, type SafeFetchResult } from "@/security/safe-fetch";

export const VERIFICATION_METHOD_VERSION = "public-html-verifier-v1.0";
export const resultSchema = z.enum(["VERIFIED", "VERIFICATION_WARNING", "VERIFICATION_FAILED", "UNAVAILABLE"]);
export type VerificationResult = z.infer<typeof resultSchema>;
export const packageSchema = z.object({
  version: z.literal("implementation-package-v1.0"), artifactId: z.string().uuid(), artifactVersion: z.number().int().positive(),
  artifactHash: z.string(), artifactType: z.string(), targetUrl: z.string().url(), evidenceRefs: z.array(z.string()),
  changes: z.array(z.object({ field: z.string(), currentValue: z.string().nullable(), proposedValue: z.string().nullable() })),
  checks: z.array(z.object({ kind: z.enum(["title", "meta_description", "heading_structure", "internal_link", "schema"]), expected: z.string().max(1000) })).max(8),
  limitations: z.array(z.string()), requiresHumanReview: z.boolean(),
});
export type ImplementationPackage = z.infer<typeof packageSchema>;
export type Comparison = { kind: string; expected: unknown; observed: unknown; result: VerificationResult; rationale: string };
export type VerificationObservation = { result: VerificationResult; rationale: string; methodVersion: string; targetUrl: string; finalUrl?: string; statusCode?: number; contentHash?: string; observedAt: string; comparisons: Comparison[]; limitations: string[]; evidenceBytes: number };

export function buildImplementationPackage(artifact: { id: string; artifactVersion: number; artifactType: string; contentHash: string; evidenceRefs: string[]; structuredProposal: Record<string, unknown> }, targetUrl: string): ImplementationPackage {
  const url = new URL(targetUrl);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Implementation targets require an approved public HTTPS website URL.");
  const proposals = z.array(z.object({ field: z.string(), currentValue: z.string().nullable(), proposedValue: z.string().nullable(), requiresHumanInput: z.boolean() })).parse(artifact.structuredProposal.proposals);
  const checks: ImplementationPackage["checks"] = [];
  const limitations = ["Public HTML observation only; no CMS access, publishing or site edits.", "Verification proves the checked public state, not who performed the change or subjective quality."];
  let requiresHumanReview = false;
  if (artifact.artifactType === "CONTENT_BRIEF") {
    requiresHumanReview = true;
    limitations.push("A content brief is not implemented content. Human authoring/content production and quality review are still required.");
  } else {
    for (const proposal of proposals) {
      if (proposal.field === "missing_inputs") continue;
      if (!["title", "meta_description", "heading_structure", "internal_link", "schema"].includes(proposal.field) || !proposal.proposedValue || proposal.requiresHumanInput) {
        requiresHumanReview = true;
        limitations.push(`${proposal.field}: objective verification is unavailable or requires human input.`);
        continue;
      }
      if (proposal.field === "internal_link") {
        try {
          const link = JSON.parse(proposal.proposedValue);
          if (new URL(link.sourcePage).href !== url.href || new URL(link.destinationPage).origin !== url.origin) throw new Error("target");
          if (!link.suggestedAnchor) throw new Error("anchor");
        } catch { requiresHumanReview = true; limitations.push("Internal-link endpoints/anchor require a valid approved source and destination."); continue; }
      }
      checks.push({ kind: proposal.field as ImplementationPackage["checks"][number]["kind"], expected: proposal.proposedValue });
    }
  }
  return packageSchema.parse({ version: "implementation-package-v1.0", artifactId: artifact.id, artifactVersion: artifact.artifactVersion, artifactHash: artifact.contentHash, artifactType: artifact.artifactType, targetUrl: url.href, evidenceRefs: artifact.evidenceRefs, changes: proposals.map(({ field, currentValue, proposedValue }) => ({ field, currentValue, proposedValue })), checks, limitations, requiresHumanReview });
}

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
function elements(root: Node): Element[] {
  const result: Element[] = [];
  const queue: Node[] = [root];
  while (queue.length) {
    const node = queue.pop()!;
    if ("tagName" in node) {
      if (["template", "noscript", "svg", "math"].includes(node.tagName)) continue;
      result.push(node);
      if (["script", "style"].includes(node.tagName)) continue;
    }
    if ("childNodes" in node) queue.push(...[...node.childNodes].reverse());
  }
  return result;
}
function textContent(node: Node): string {
  const parts: string[] = []; const stack = [node];
  while (stack.length) {
    const current = stack.pop()!;
    if ("value" in current) { parts.push(current.value); continue; }
    if ("tagName" in current && ["script", "style", "template"].includes(current.tagName)) continue;
    if ("childNodes" in current) stack.push(...[...current.childNodes].reverse());
  }
  return parts.join("");
}
const normalized = (value: string) => value.replace(/\s+/g, " ").trim();
const attr = (node: Element, name: string) => node.attrs.find(a => a.name === name)?.value;
function containsProperties(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== "object") return actual === expected;
  if (Array.isArray(expected)) return Array.isArray(actual) && expected.length === actual.length && expected.every((item, i) => containsProperties(actual[i], item));
  return !!actual && typeof actual === "object" && Object.entries(expected).every(([key, value]) => Object.hasOwn(actual, key) && containsProperties((actual as Record<string, unknown>)[key], value));
}
function jsonEntities(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(jsonEntities);
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  return [object, ...(Array.isArray(object["@graph"]) ? object["@graph"].map(item => ({ "@context": object["@context"], ...item })) : [])];
}

export function comparePublicPage(pkg: ImplementationPackage, page: SafeFetchResult): VerificationObservation {
  const base = { methodVersion: VERIFICATION_METHOD_VERSION, targetUrl: pkg.targetUrl, finalUrl: page.finalUrl, statusCode: page.status, contentHash: page.contentHash, observedAt: new Date().toISOString(), limitations: [...pkg.limitations], evidenceBytes: Buffer.byteLength(page.bodyText), comparisons: [] as Comparison[] };
  if (page.status < 200 || page.status >= 300) return { ...base, result: [404, 410].includes(page.status) ? "VERIFICATION_FAILED" : "UNAVAILABLE", rationale: `Public target returned HTTP ${page.status}.` };
  if (!page.headers["content-type"]?.toLowerCase().includes("text/html")) return { ...base, result: "UNAVAILABLE", rationale: "Target did not return supported HTML." };
  if (new URL(page.finalUrl).origin !== new URL(pkg.targetUrl).origin) return { ...base, result: "UNAVAILABLE", rationale: "Target redirected outside the approved website origin." };
  if (!pkg.checks.length) return { ...base, result: "UNAVAILABLE", rationale: "The approved package has no supported objective verification method." };
  const nodes = elements(parse(page.bodyText));
  const comparisons: Comparison[] = [];
  for (const check of pkg.checks) {
    let observed: unknown = null; let result: VerificationResult = "VERIFICATION_FAILED";
    let rationale = "Expected approved value was not observed.";
    if (check.kind === "title" || check.kind === "meta_description") {
      const matching = nodes.filter(n => check.kind === "title" ? n.tagName === "title" : n.tagName === "meta" && attr(n, "name")?.toLowerCase() === "description");
      observed = matching.map(n => check.kind === "title" ? normalized(textContent(n)) : normalized(attr(n, "content") ?? ""));
      if (matching.length === 1 && (observed as string[])[0] === normalized(check.expected)) result = "VERIFIED";
      else if (matching.length > 1) { result = "VERIFICATION_WARNING"; rationale = "Multiple competing metadata values require human review."; }
    } else if (check.kind === "heading_structure") {
      const expected = check.expected.split(/\r?\n/).map(line => /^(H[1-6]):\s*(.+)$/.exec(line));
      observed = nodes.filter(n => /^h[1-6]$/.test(n.tagName)).map(n => `${n.tagName.toUpperCase()}: ${normalized(textContent(n))}`);
      if (expected.some(x => !x)) { result = "UNAVAILABLE"; rationale = "The approved heading proposal is not an exact structure."; }
      else if (JSON.stringify(observed) === JSON.stringify(expected.map(x => `${x![1]}: ${normalized(x![2])}`))) result = "VERIFIED";
      else if (expected.every(x => (observed as string[]).includes(`${x![1]}: ${normalized(x![2])}`))) { result = "VERIFICATION_WARNING"; rationale = "Expected headings exist, but the overall structure differs."; }
    } else if (check.kind === "internal_link") {
      const expected = JSON.parse(check.expected);
      const baseTag = nodes.find(n => n.tagName === "base" && attr(n, "href"));
      let documentBase = page.finalUrl;
      try { if (baseTag) documentBase = new URL(attr(baseTag, "href")!, page.finalUrl).href; }
      catch { comparisons.push({ kind: check.kind, expected: check.expected, observed: "Invalid document base URL", result: "UNAVAILABLE", rationale: "Link resolution could not be established safely." }); continue; }
      const links = nodes.filter(n => n.tagName === "a" && attr(n, "href")).flatMap(n => {
        try { const url = new URL(attr(n, "href")!, documentBase); return url.protocol === "https:" ? [{ url: url.href, anchor: normalized(textContent(n)) }] : []; } catch { return []; }
      }).filter(link => link.url === new URL(expected.destinationPage).href);
      observed = links.slice(0, 10);
      if (links.some(link => link.anchor === normalized(expected.suggestedAnchor))) result = "VERIFIED";
      else if (links.length) { result = "VERIFICATION_WARNING"; rationale = "Destination link exists, but the approved anchor was not observed."; }
    } else {
      const expected = JSON.parse(check.expected);
      const scripts = nodes.filter(n => n.tagName === "script" && attr(n, "type")?.toLowerCase() === "application/ld+json");
      let invalid = false;
      const values = scripts.flatMap(n => {
        try { return jsonEntities(JSON.parse(n.childNodes.map(textContent).join(""))); } catch { invalid = true; return []; }
      });
      observed = { matchingProperties: values.filter(v => containsProperties(v, expected)).map(() => expected), jsonLdBlocks: scripts.length, invalidJson: invalid };
      if (invalid) { rationale = "A JSON-LD block is invalid; schema regression detected."; }
      else if (values.some(value => containsProperties(value, expected))) result = "VERIFIED";
    }
    if (result === "VERIFIED") rationale = "Independent public HTML observation matches the exact approved expectation.";
    // Hostile pages cannot exhaust the persisted output budget. Comparisons use full
    // bounded evidence; oversized display evidence cannot become a silent pass.
    if (Buffer.byteLength(JSON.stringify(observed)) > 1200) {
      observed = { excerpt: JSON.stringify(observed).slice(0, 250), truncated: true };
      if (result === "VERIFIED") result = "VERIFICATION_WARNING";
      rationale += " Observed display evidence was truncated; review the public target.";
    }
    comparisons.push({ kind: check.kind, expected: check.expected, observed, result, rationale });
  }
  const noindex = nodes.some(n => n.tagName === "meta" && ["robots", "googlebot"].includes(attr(n, "name")?.toLowerCase() ?? "") && /\b(noindex|none)\b/i.test(attr(n, "content") ?? "")) || /\b(noindex|none)\b/i.test(page.headers["x-robots-tag"] ?? "");
  if (noindex) comparisons.push({ kind: "indexability", expected: "No explicit noindex directive", observed: "noindex", result: "VERIFICATION_FAILED", rationale: "Explicit indexing restriction found on the implementation target." });
  const result: VerificationResult = comparisons.some(c => c.result === "VERIFICATION_FAILED") ? "VERIFICATION_FAILED" : comparisons.some(c => c.result === "UNAVAILABLE") ? "UNAVAILABLE" : pkg.requiresHumanReview || comparisons.some(c => c.result === "VERIFICATION_WARNING") ? "VERIFICATION_WARNING" : "VERIFIED";
  return { ...base, comparisons, result, rationale: result === "VERIFIED" ? "All supported approved expectations matched; no checked regression was detected." : "See expected/observed comparisons and limitations; this attempt is not a full verified completion." };
}

export async function observeImplementation(pkg: ImplementationPackage, options: SafeFetchOptions = {}): Promise<VerificationObservation> {
  try {
    const page = await safeFetchText(pkg.targetUrl, { ...options, maxBytes: 262144, timeoutMs: 8000, maxRedirects: 3 });
    const observation = comparePublicPage(pkg, page);
    if (Buffer.byteLength(JSON.stringify(observation)) > 14000) return { ...observation, comparisons: [], result: "UNAVAILABLE", rationale: "Comparison evidence exceeds the bounded result budget; human review is required.", limitations: ["The observation could not be represented within the reviewed output budget; no pass is claimed."] };
    return observation;
  } catch (error) {
    if (!(error instanceof SafeFetchError)) throw error;
    return { result: "UNAVAILABLE", rationale: `Safe public fetch unavailable: ${error.code}.`, methodVersion: VERIFICATION_METHOD_VERSION, targetUrl: pkg.targetUrl, observedAt: new Date().toISOString(), comparisons: [], limitations: [...pkg.limitations, "No successful observation was made; unavailable is never pass."], evidenceBytes: 0 };
  }
}
