import type { EvidenceConfidence } from "@/domain/opportunities/generation";

import type { BacklinkEvidence } from "./backlinks";
import type { CrawlSummary, SampledPage, SampledPageKind } from "./crawl";
import type { PageAnalysis } from "./page-analysis";
import { normalizeBusinessName, type PlacesEvidence } from "./places";
import { normalizePhone, usStateNames, type FormSignal, type PageSignals } from "./site-signals";

/**
 * Deterministic rules for checks that need more than the homepage response:
 * a bounded same-site page sample, static page signals and (optionally) a
 * Google Places listing. Every rule reports what it examined. None of them
 * executes JavaScript, submits a form or infers facts that were not observed.
 */

export type SitePage = {
  ref: string;
  url: string;
  kind: SampledPageKind | "home";
  analysis: PageAnalysis;
  signals: PageSignals;
};

export type SiteContext = {
  home: SitePage;
  /** The homepage followed by every sampled page that returned HTML. */
  pages: SitePage[];
  /** Sampled pages that did not return a usable HTML response. */
  failed: SampledPage[];
  crawl: CrawlSummary | null;
  facts: Array<{ id: string; factType: string; value: string }>;
  places: PlacesEvidence | null;
  placesConfigured: boolean;
  backlinks: BacklinkEvidence | null;
  backlinksConfigured: boolean;
  siteHost: string;
  homeHasPrimaryCta: boolean;
};

export type ExtendedOutcome = {
  status: "PASS" | "WARNING" | "FAIL" | "UNAVAILABLE";
  reason: string;
  severity?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  evidenceConfidence?: EvidenceConfidence;
  evidenceRefs?: string[];
  observedValue?: Record<string, unknown>;
};

const STATIC_NOTE = "This is a static HTML check: no JavaScript ran and nothing was submitted.";

function scopeText(ctx: SiteContext): string {
  const sampled = ctx.pages.length - 1;
  return sampled > 0 ? `the homepage and ${sampled} sampled page${sampled === 1 ? "" : "s"}` : "the homepage (no other page could be sampled)";
}

function refsOf(pages: SitePage[], limit = 6): string[] {
  return [...new Set(pages.map((page) => page.ref))].slice(0, limit);
}

function norm(value: string): string {
  return ` ${value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
}

function textOf(page: SitePage): string {
  return page.analysis.visibleText;
}

function pagesOf(ctx: SiteContext, ...kinds: Array<SitePage["kind"]>): SitePage[] {
  return ctx.pages.filter((page) => kinds.includes(page.kind));
}

function factValues(ctx: SiteContext, types: string[]): string[] {
  return ctx.facts.filter((fact) => types.includes(fact.factType)).map((fact) => fact.value.trim()).filter((value) => value.length >= 3 && value.length <= 200);
}

// ---------------------------------------------------------------- similarity

function shingles(text: string, size = 6): Set<string> {
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean).slice(0, 6_000);
  const set = new Set<string>();
  for (let index = 0; index + size <= words.length; index += 1) set.add(words.slice(index, index + size).join(" "));
  return set;
}

/** Per-page shingles with site-wide boilerplate (navigation, footer) removed. */
function distinctiveShingles(pages: SitePage[]): Map<string, Set<string>> {
  const sets = new Map(pages.map((page) => [page.ref, shingles(textOf(page))] as const));
  if (pages.length >= 3) {
    const frequency = new Map<string, number>();
    for (const set of sets.values()) for (const shingle of set) frequency.set(shingle, (frequency.get(shingle) ?? 0) + 1);
    // Only text on (nearly) every page is boilerplate. A lower bar would hide
    // the very duplication this is meant to find, e.g. three copied pages.
    const threshold = pages.length <= 5 ? pages.length : Math.ceil(pages.length * 0.9);
    for (const set of sets.values()) for (const shingle of [...set]) if ((frequency.get(shingle) ?? 0) >= threshold) set.delete(shingle);
  }
  return sets;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function nearDuplicatePairs(pages: SitePage[], sets: Map<string, Set<string>>): Array<[SitePage, SitePage]> {
  const pairs: Array<[SitePage, SitePage]> = [];
  for (let i = 0; i < pages.length; i += 1) {
    for (let j = i + 1; j < pages.length; j += 1) {
      const a = sets.get(pages[i].ref)!, b = sets.get(pages[j].ref)!;
      if (a.size >= 40 && b.size >= 40 && jaccard(a, b) >= 0.8) pairs.push([pages[i], pages[j]]);
    }
  }
  return pairs;
}

// ------------------------------------------------------------------ identity

const businessEntity = (types: string[]) => !types.some((type) => /^(?:WebSite|WebPage|BreadcrumbList|Person|ImageObject|SearchAction)$/.test(type));

/**
 * Pages that describe the business itself. Location, service and review pages
 * legitimately list branches, partners and reviewers as separate entities.
 */
function identityPages(ctx: SiteContext): SitePage[] {
  return pagesOf(ctx, "home", "about", "contact");
}

function declaredNames(ctx: SiteContext): string[] {
  const names = new Set<string>();
  for (const page of identityPages(ctx)) for (const entity of page.signals.entities) if (entity.name && businessEntity(entity.types)) names.add(entity.name);
  if (ctx.home.signals.ogSiteName) names.add(ctx.home.signals.ogSiteName);
  for (const name of factValues(ctx, ["business_name", "display_name", "brand_name"])) names.add(name);
  return [...names];
}

/** Group names that are the same after removing legal suffixes and punctuation. */
function nameClusters(names: string[]): string[][] {
  const clusters: Array<{ key: string; members: string[] }> = [];
  for (const name of names) {
    const key = normalizeBusinessName(name);
    if (key.length < 2) continue;
    const match = clusters.find((cluster) => cluster.key === key || cluster.key.includes(key) || key.includes(cluster.key));
    if (match) match.members.push(name); else clusters.push({ key, members: [name] });
  }
  return clusters.map((cluster) => cluster.members);
}

function schemaPhones(ctx: SiteContext): string[] {
  const phones = new Set<string>();
  for (const page of identityPages(ctx)) for (const entity of page.signals.entities) {
    const phone = entity.telephone ? normalizePhone(entity.telephone) : null;
    if (phone) phones.add(phone);
  }
  return [...phones];
}

function displayedPhones(ctx: SiteContext): string[] {
  return [...new Set(ctx.pages.flatMap((page) => page.signals.phones))];
}

type LocationEvidence = { schema: string[]; body: string[]; prominent: boolean; anywhere: boolean; cities: string[] };

function locationEvidence(ctx: SiteContext): LocationEvidence {
  const schema = new Set<string>();
  for (const page of ctx.pages) for (const entity of page.signals.entities) {
    if (entity.locality) schema.add(entity.region ? `${entity.locality}, ${entity.region}` : entity.locality);
    for (const area of entity.areaServed) schema.add(area);
  }
  const body = ctx.home.signals.locationMentions;
  const verified = factValues(ctx, ["location", "service_area"]);
  const cities = new Set<string>();
  for (const value of [...schema, ...body, ...verified, ...ctx.pages.flatMap((page) => page.signals.locationMentions)]) {
    const city = value.split(",")[0].trim();
    if (city.length >= 3) cities.add(city);
  }
  const homeText = norm(textOf(ctx.home));
  const verifiedInBody = verified.some((value) => homeText.includes(norm(value)) || homeText.includes(norm(value.split(",")[0])));
  const schemaInBody = [...schema].some((value) => homeText.includes(norm(value.split(",")[0])));
  const prominentText = norm([ctx.home.analysis.title ?? "", ctx.home.analysis.metaDescription ?? "", ...ctx.home.analysis.h1, ...ctx.home.analysis.h2].join(" | "));
  const prominent = [...cities].some((city) => prominentText.includes(norm(city)));
  const bodyFound = body.length > 0 || verifiedInBody || schemaInBody;
  const elsewhere = ctx.pages.slice(1).some((page) => page.signals.locationMentions.length > 0);
  return { schema: [...schema], body: bodyFound ? (body.length ? body : [...schema, ...verified].slice(0, 3)) : [], prominent, anywhere: bodyFound || schema.size > 0 || elsewhere || prominent, cities: [...cities] };
}

// ---------------------------------------------------------------- lead paths

function isLeadForm(form: FormSignal): boolean {
  if (form.isSearch || form.hasPassword) return false;
  // A single box is a newsletter sign-up or a lookup, not an enquiry path.
  return form.hasMessage || ((form.hasPhone || form.hasEmail) && form.fieldCount >= 2);
}

function leadPath(ctx: SiteContext) {
  const candidates = [ctx.home, ...pagesOf(ctx, "contact"), ...ctx.pages.filter((page) => page.kind !== "home" && page.kind !== "contact")];
  let form: FormSignal | null = null, formPage: SitePage | null = null;
  for (const page of candidates) {
    const found = page.signals.forms.filter(isLeadForm).sort((a, b) => Number(b.hasSubmit) - Number(a.hasSubmit) || a.fieldCount - b.fieldCount)[0];
    if (found) { form = found; formPage = page; break; }
  }
  const toolPage = [ctx.home, ...pagesOf(ctx, "contact")].find((page) => page.signals.embeddedLeadTools.length > 0) ?? null;
  const tel = ctx.pages.some((page) => page.signals.telLinks.length > 0);
  const mailto = ctx.pages.some((page) => page.signals.mailtoLinks.length > 0);
  const onHome = ctx.home.signals.forms.some(isLeadForm) || ctx.home.signals.embeddedLeadTools.length > 0 || ctx.home.signals.telLinks.length > 0 || ctx.home.signals.mailtoLinks.length > 0;
  return { form, formPage, toolPage, tel, mailto, onHome };
}

// ------------------------------------------------------------------ patterns

const credentialPatterns: Array<[string, RegExp]> = [
  ["licensing", /\blicen[sc]ed\b|\blicen[sc]e\s*(?:#|no\.?|number)/i],
  ["insurance or bonding", /\b(?:fully\s+)?insured\b|\bbonded\b/i],
  ["certification or accreditation", /\bcertified\b|\bcertifications?\b|\baccredited\b/i],
  ["memberships", /\bmember of\b|\bchamber of commerce\b|\bassociation of\b/i],
  ["awards", /\baward(?:s|ed|[- ]winning)?\b|\bbest of \d{4}\b/i],
  ["experience", /\b\d{1,3}\+?\s+years?\b(?:\s+of)?\s+(?:experience|in business|of service|serving)|\b(?:since|established|founded)\s+(?:in\s+)?(?:19|20)\d{2}\b|\bfamily[- ]owned\b/i],
  ["professional designations", /\b(?:CPA|DDS|DMD|M\.D\.|J\.D\.|Esq\.|NATE|OSHA|LEED|ISO\s?\d{4,5})\b/],
];
const licenseNumberPattern = /\blic(?:en[sc]e)?\.?\s*(?:#|no\.?|number)\s*:?\s*[A-Z0-9][A-Z0-9-]{3,}/i;

const trustPatterns: Array<[string, RegExp]> = [
  ["customer testimonials or reviews", /\btestimonials?\b|what (?:our )?(?:clients|customers|patients) (?:say|are saying)|\b5[- ]star\b|★|\bcustomer reviews?\b|\breviews\b/i],
  ["ratings", /\b[45](?:\.\d)?\s*(?:\/\s*5|out of 5|stars?)\b|\brated\s+[45]/i],
  ["credentials", /\blicen[sc]ed\b|\binsured\b|\bbonded\b|\bcertified\b|\baccredited\b/i],
  ["guarantees or warranties", /\bguarantee[ds]?\b|\bwarrant(?:y|ies)\b|\bmoney[- ]back\b/i],
  ["experience", credentialPatterns[5][1]],
  ["client proof", /\bcase stud(?:y|ies)\b|\btrusted by\b|\bour clients\b|\bas seen (?:in|on)\b|\bfeatured in\b|\bportfolio\b/i],
];

const genericCategoryWords = new Set(["service", "services", "company", "contractor", "contractors", "store", "shop", "business", "local", "general", "professional", "establishment", "point", "interest", "home", "goods", "organization", "construction"]);
const genericSchemaTypes = new Set(["Organization", "LocalBusiness", "Corporation", "ProfessionalService", "HomeAndConstructionBusiness", "Store", "WebSite", "WebPage", "Service", "Place", "Brand", "OnlineBusiness"]);

function categoryTokens(labels: string[]): string[] {
  return [...new Set(labels.flatMap((label) => label.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z]+/)).filter((token) => token.length >= 4 && !genericCategoryWords.has(token)))];
}

function overlaps(tokens: string[], haystack: string): string[] {
  const words = new Set(haystack.toLowerCase().split(/[^a-z]+/).filter((word) => word.length >= 4));
  return tokens.filter((token) => {
    const stem = token.slice(0, Math.max(4, Math.min(token.length, 5)));
    for (const word of words) if (word.startsWith(stem.slice(0, 4)) && (word.startsWith(stem) || token.startsWith(word.slice(0, 5)))) return true;
    return false;
  });
}

function serviceSignals(ctx: SiteContext) {
  const servicePages = pagesOf(ctx, "services");
  const headings = ctx.home.signals.headingTexts.filter((heading) => /\bservices?\b|what we do|we offer|our work|solutions|specialt|treatments?|practice areas?/i.test(heading));
  const schema = ctx.pages.some((page) => page.signals.entities.some((entity) => entity.hasOfferCatalog) || page.signals.schemaTypes.some((type) => /^(?:Service|Offer|OfferCatalog|Product)$/.test(type)));
  const verified = factValues(ctx, ["service"]);
  const homeText = norm(textOf(ctx.home));
  const verifiedFound = verified.filter((value) => homeText.includes(norm(value)));
  return { servicePages, headings, schema, verified, verifiedFound };
}

// --------------------------------------------------------------------- rules

function mobileRender(ctx: SiteContext): ExtendedOutcome {
  const responsive = (viewport: string | null) => viewport !== null && /width\s*=\s*device-width/i.test(viewport);
  const missing = ctx.pages.filter((page) => !responsive(page.signals.viewport));
  const zoomBlocked = ctx.pages.filter((page) => /user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=\s*1(?:\.0+)?(?:\D|$)/i.test(page.signals.viewport ?? ""));
  const observedValue = { pagesChecked: ctx.pages.length, pagesWithoutResponsiveViewport: missing.length, homepageViewport: ctx.home.signals.viewport };
  if (!responsive(ctx.home.signals.viewport)) {
    return { status: "FAIL", reason: "The homepage does not declare a responsive viewport (width=device-width), so phones lay it out at desktop width. Layout was not rendered in a browser.", evidenceRefs: [ctx.home.ref], observedValue };
  }
  if (missing.length) {
    return { status: "WARNING", reason: `${missing.length} of ${ctx.pages.length} sampled pages do not declare a responsive viewport. Layout was not rendered in a browser.`, evidenceRefs: refsOf(missing), observedValue };
  }
  if (zoomBlocked.length) {
    return { status: "WARNING", reason: "Every sampled page declares a responsive viewport, but at least one blocks pinch-zoom, which makes small text hard to read on phones.", evidenceRefs: refsOf(zoomBlocked), observedValue };
  }
  return { status: "PASS", evidenceConfidence: "MEDIUM", reason: `A responsive viewport is declared on ${scopeText(ctx)}. Horizontal overflow was not measured because the pages were not rendered in a browser.`, evidenceRefs: refsOf(ctx.pages), observedValue };
}

function criticalFunctionality(ctx: SiteContext): ExtendedOutcome {
  const broken = ctx.failed.filter((page) => (page.status ?? 0) >= 400);
  const unreachable = ctx.failed.filter((page) => page.status === null);
  const attempted = ctx.crawl?.attempted ?? 0;
  const invalidTel = ctx.home.signals.telLinks.filter((link) => !normalizePhone(link));
  const deadCtas = ctx.home.analysis.anchors.filter((anchor) => /contact|quote|estimate|book|schedule|get started|call/i.test(anchor.text) && /^(?:#|javascript:|)$/i.test(anchor.href.trim()));
  const observedValue = { pagesAttempted: attempted, brokenPages: broken.map((page) => ({ url: page.url, status: page.status })), unreachablePages: unreachable.length, invalidPhoneLinks: invalidTel.length, deadCallToActionLinks: deadCtas.length };
  const contactBroken = broken.filter((page) => page.kind === "contact");
  // One slow page on a large site is noise; a slow contact page or a mostly
  // unresponsive sample is a defect worth reporting.
  const slow = unreachable.some((page) => page.kind === "contact") || (attempted >= 2 && unreachable.length / attempted >= 0.5) ? unreachable : [];
  if (contactBroken.length || invalidTel.length || (attempted >= 2 && broken.length / attempted >= 0.5)) {
    const cause = contactBroken.length ? `the contact page linked from the homepage returned HTTP ${contactBroken[0].status}` : invalidTel.length ? "a homepage phone link does not contain a dialable number" : `${broken.length} of ${attempted} sampled internal pages returned an error status`;
    return { status: "FAIL", reason: `A primary path is broken: ${cause}. ${STATIC_NOTE}`, evidenceRefs: [ctx.home.ref], observedValue };
  }
  if (broken.length || slow.length || deadCtas.length) {
    const causes = [
      broken.length ? `${broken.length} sampled internal page${broken.length === 1 ? "" : "s"} returned an error status` : null,
      slow.length ? `${slow.length} sampled page${slow.length === 1 ? "" : "s"} did not respond in time` : null,
      deadCtas.length ? "a call-to-action link has no destination in the fetched HTML" : null,
    ].filter(Boolean).join("; ");
    return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: `A non-primary defect was observed: ${causes}. ${STATIC_NOTE}`, evidenceRefs: [ctx.home.ref], observedValue };
  }
  const responded = attempted - unreachable.length;
  return { status: "PASS", evidenceConfidence: "MEDIUM", reason: `${attempted > 0 ? `${responded} of ${attempted} sampled internal pages returned successful responses${unreachable.length ? " (the rest were slow to respond)" : ""}, and` : "No other internal page was available to sample;"} homepage phone links and call-to-action links are well formed. ${STATIC_NOTE}`, evidenceRefs: refsOf(ctx.pages), observedValue };
}

function contentTargeting(ctx: SiteContext): ExtendedOutcome {
  const content = ctx.pages.filter((page) => !["legal", "contact"].includes(page.kind));
  if (content.length < 2) {
    const substantive = ctx.home.signals.wordCount >= 150 && ctx.home.analysis.h1.length > 0;
    return {
      status: substantive ? "PASS" : "WARNING", evidenceConfidence: "MEDIUM", evidenceRefs: [ctx.home.ref],
      reason: substantive ? "Only the homepage was available to assess. It has a primary heading and substantive text, and there are no other sampled pages it could duplicate." : "Only the homepage was available to assess, and it has little text or no primary heading to establish a distinct service intent.",
      observedValue: { pagesCompared: content.length, homepageWords: ctx.home.signals.wordCount },
    };
  }
  const sets = distinctiveShingles(content);
  const pairs = nearDuplicatePairs(content, sets);
  const titleGroups = new Map<string, SitePage[]>();
  for (const page of content) {
    const title = page.analysis.title?.trim().toLowerCase();
    if (title) titleGroups.set(title, [...(titleGroups.get(title) ?? []), page]);
  }
  const duplicateTitlePages = [...titleGroups.values()].filter((group) => group.length > 1).flat();
  const thin = content.filter((page) => ["services", "locations"].includes(page.kind) && (sets.get(page.ref)?.size ?? 0) < 60);
  const observedValue = { pagesCompared: content.length, nearDuplicatePairs: pairs.map(([a, b]) => [a.url, b.url]), pagesSharingATitle: duplicateTitlePages.map((page) => page.url), thinPriorityPages: thin.map((page) => page.url) };
  if (pairs.length >= 2 || (content.length >= 3 && duplicateTitlePages.length >= content.length / 2 && pairs.length >= 1)) {
    return { status: "FAIL", reason: `${pairs.length} pairs of sampled pages have nearly identical body text, so priority pages do not address distinct intents.`, evidenceRefs: refsOf(pairs.flat()), observedValue };
  }
  if (pairs.length || duplicateTitlePages.length || thin.length) {
    const causes = [
      pairs.length ? "two sampled pages have nearly identical body text" : null,
      duplicateTitlePages.length ? `${duplicateTitlePages.length} sampled pages share a title` : null,
      thin.length ? `${thin.length} service or location page${thin.length === 1 ? " has" : "s have"} very little text of ${thin.length === 1 ? "its" : "their"} own` : null,
    ].filter(Boolean).join("; ");
    return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: `Partial overlap or thin content was observed: ${causes}. Compared ${content.length} sampled pages after removing shared navigation text.`, evidenceRefs: refsOf([...pairs.flat(), ...duplicateTitlePages, ...thin]), observedValue };
  }
  return { status: "PASS", evidenceConfidence: "MEDIUM", reason: `The ${content.length} sampled content pages have distinct titles and body text with no near-duplicate pairs. Search intent and rankings were not evaluated.`, evidenceRefs: refsOf(content), observedValue };
}

function identityFindings(ctx: SiteContext) {
  const clusters = nameClusters(declaredNames(ctx));
  const fromSchema = schemaPhones(ctx);
  const displayed = displayedPhones(ctx);
  const phoneConflict = fromSchema.length > 0 && displayed.length > 0 && !fromSchema.some((phone) => displayed.includes(phone));
  const verifiedNames = factValues(ctx, ["business_name", "display_name", "brand_name"]);
  const siteText = norm(ctx.pages.map((page) => `${page.analysis.title ?? ""} ${textOf(page)}`).join(" "));
  const verifiedNameMissing = verifiedNames.length > 0 && !verifiedNames.some((name) => siteText.includes(norm(name)));
  return { clusters, fromSchema, displayed, phoneConflict, verifiedNameMissing };
}

function businessIdentity(ctx: SiteContext): ExtendedOutcome {
  const found = identityFindings(ctx);
  const location = locationEvidence(ctx);
  const hasName = found.clusters.length > 0;
  const hasPhone = found.displayed.length > 0 || found.fromSchema.length > 0;
  const observedValue = { declaredNames: found.clusters.map((cluster) => cluster[0]), distinctPhoneNumbers: found.displayed.length, structuredDataPhones: found.fromSchema.length, locationFound: location.anywhere };
  if (found.phoneConflict || found.clusters.length >= 3) {
    return { status: "FAIL", reason: found.phoneConflict ? "The phone number in the site's structured data does not match any phone number shown on the sampled pages." : `${found.clusters.length} different business names are declared across the site's structured data and metadata.`, evidenceRefs: refsOf(ctx.pages), observedValue };
  }
  const gaps = [
    found.clusters.length === 2 ? `two different names are declared (“${found.clusters[0][0]}” and “${found.clusters[1][0]}”)` : null,
    found.verifiedNameMissing ? "the verified business name does not appear on the sampled pages" : null,
    ctx.home.signals.phones.length >= 3 ? `${ctx.home.signals.phones.length} different phone numbers appear on the homepage` : null,
    !hasName ? "no business name is declared in structured data or site metadata" : null,
    !hasPhone ? "no phone number was found" : null,
    !location.anywhere ? "no address or service area was found" : null,
  ].filter(Boolean);
  if (gaps.length) {
    return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: `Name, phone and location facts are incomplete or vary: ${gaps.join("; ")}. Checked ${scopeText(ctx)}.`, evidenceRefs: refsOf(ctx.pages), observedValue };
  }
  return { status: "PASS", reason: `One business name, a phone number and a location are declared consistently across ${scopeText(ctx)}.`, evidenceRefs: refsOf(ctx.pages), observedValue };
}

function entityConsistency(ctx: SiteContext): ExtendedOutcome {
  const found = identityFindings(ctx);
  const homeText = norm(`${ctx.home.analysis.title ?? ""} ${textOf(ctx.home)}`);
  const nameAgrees = found.clusters.length === 1 && found.clusters[0].some((name) => homeText.includes(norm(name)));
  const phoneAgrees = found.fromSchema.some((phone) => found.displayed.includes(phone));
  const phonePages = ctx.pages.filter((page) => page.signals.phones.length > 0);
  const phoneRepeats = phonePages.length >= 2 && phonePages.every((page) => page.signals.phones.some((phone) => phonePages[0].signals.phones.includes(phone)));
  const foreignUrl = ctx.pages.flatMap((page) => page.signals.entities).some((entity) => {
    if (!entity.url || !businessEntity(entity.types)) return false;
    try { return new URL(entity.url).hostname.replace(/^www\./, "") !== ctx.siteHost; } catch { return false; }
  });
  const agreements = [nameAgrees, phoneAgrees, phoneRepeats].filter(Boolean).length;
  const observedValue = { declaredNames: found.clusters.map((cluster) => cluster[0]), nameMatchesVisibleText: nameAgrees, structuredPhoneMatchesDisplayed: phoneAgrees, phoneConsistentAcrossPages: phoneRepeats, agreements };
  if (found.phoneConflict || found.clusters.length >= 3) {
    return { status: "FAIL", reason: found.phoneConflict ? "Structured data and visible page text give different phone numbers for the business." : "Three or more different business names are declared across first-party pages.", evidenceRefs: refsOf(ctx.pages), observedValue };
  }
  if (found.clusters.length === 2 || foreignUrl || found.verifiedNameMissing) {
    return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: found.clusters.length === 2 ? `Two different business names are declared (“${found.clusters[0][0]}” and “${found.clusters[1][0]}”).` : foreignUrl ? "The site's structured data names a different website address than the audited site." : "The verified business name does not appear on the sampled pages.", evidenceRefs: refsOf(ctx.pages), observedValue };
  }
  if (!agreements) {
    return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: `Key facts are stated in only one place on ${scopeText(ctx)}, so first-party sources could not be cross-checked. Declaring the business name and phone in structured data would allow that.`, evidenceRefs: refsOf(ctx.pages), observedValue };
  }
  return { status: "PASS", reason: `The business name and contact facts agree across structured data, metadata and visible text on ${scopeText(ctx)}. Third-party sources were not compared here.`, evidenceRefs: refsOf(ctx.pages), observedValue };
}

function gbpPresence(ctx: SiteContext): ExtendedOutcome {
  const places = ctx.places;
  if (places) {
    const listing = places.listing;
    const observedValue = { matchBasis: places.matchBasis, candidates: places.candidateCount, operational: listing?.operational ?? null, reviewCount: listing?.reviewCount ?? null, fetchedAt: places.fetchedAt };
    if (!listing) return { status: "FAIL", evidenceConfidence: "MEDIUM", reason: "A Google Places search for the business name and location returned no listing matching its name, website or phone number.", evidenceRefs: ["places"], observedValue };
    if (!listing.operational) return { status: "WARNING", reason: "A matching Google listing exists but is not marked as operational.", evidenceRefs: ["places"], observedValue };
    if (places.matchBasis === "name") return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: "A Google listing with a matching name was found, but its website and phone number could not be tied to the audited site. Ownership and verification status are not visible to this check.", evidenceRefs: ["places"], observedValue };
    return { status: "PASS", reason: `An operational Google listing was found whose ${places.matchBasis} matches the audited site. Ownership and verification status are not visible to this check.`, evidenceRefs: ["places"], observedValue };
  }
  const linked = ctx.pages.filter((page) => page.signals.externalProfiles.some((profile) => profile.kind === "google_business") || page.signals.entities.some((entity) => entity.hasMap));
  if (linked.length) {
    return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: "The site links to a Google Maps or Business Profile page, but the listing itself was not checked, so its status is uncertain.", evidenceRefs: refsOf(linked), observedValue: { profileLinkFound: true, placesLookup: false } };
  }
  return { status: "UNAVAILABLE", reason: ctx.placesConfigured ? "The Google Places lookup did not return a usable response, and the site does not link to a Google Business Profile. No conclusion was drawn." : "A Google Places lookup is not configured, and the site does not link to a Google Business Profile. No conclusion was drawn." };
}

function categoryAlignment(ctx: SiteContext): ExtendedOutcome {
  const siteTerms = [ctx.home.analysis.title ?? "", ctx.home.analysis.metaDescription ?? "", ...ctx.home.analysis.h1, ...ctx.home.analysis.h2, ...factValues(ctx, ["service"])].join(" ");
  const listing = ctx.places?.listing;
  if (listing && (listing.primaryTypeLabel || listing.primaryType)) {
    const primary = categoryTokens([listing.primaryTypeLabel ?? "", listing.primaryType ?? ""]);
    const secondary = categoryTokens(listing.types);
    const observedValue = { primaryCategory: listing.primaryTypeLabel ?? listing.primaryType, matchedPrimaryTerms: overlaps(primary, siteTerms), matchedSecondaryTerms: overlaps(secondary, siteTerms) };
    if (observedValue.matchedPrimaryTerms.length) return { status: "PASS", reason: `The Google listing's primary category (“${observedValue.primaryCategory}”) matches the services named in the homepage title and headings.`, evidenceRefs: ["places", ctx.home.ref], observedValue };
    if (observedValue.matchedSecondaryTerms.length) return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: `The Google listing's primary category (“${observedValue.primaryCategory}”) is not reflected in the homepage title and headings; only a secondary category matches.`, evidenceRefs: ["places", ctx.home.ref], observedValue };
    return { status: "FAIL", evidenceConfidence: "MEDIUM", reason: `The Google listing's primary category (“${observedValue.primaryCategory}”) does not match any service named in the homepage title, description or headings. Review whether the category or the page wording is wrong.`, evidenceRefs: ["places", ctx.home.ref], observedValue };
  }
  const specific = [...new Set(ctx.pages.flatMap((page) => page.signals.entities.flatMap((entity) => entity.types)).filter((type) => !genericSchemaTypes.has(type)))];
  if (specific.length) {
    const matched = overlaps(categoryTokens(specific), siteTerms);
    return matched.length
      ? { status: "PASS", evidenceConfidence: "MEDIUM", reason: `The business category declared in structured data (${specific.slice(0, 3).join(", ")}) matches the services named in the homepage title and headings. A Google Business Profile category was not compared.`, evidenceRefs: [ctx.home.ref], observedValue: { declaredTypes: specific, matchedTerms: matched } }
      : { status: "WARNING", evidenceConfidence: "MEDIUM", reason: `The business category declared in structured data (${specific.slice(0, 3).join(", ")}) is not reflected in the homepage title, description or headings.`, evidenceRefs: [ctx.home.ref], observedValue: { declaredTypes: specific, matchedTerms: [] } };
  }
  return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: "No specific business category is declared: the site's structured data uses only a generic type (or none), and no Google Business Profile category was available to compare with the services described.", evidenceRefs: [ctx.home.ref], observedValue: { declaredTypes: [] } };
}

function localLocationClarity(ctx: SiteContext): ExtendedOutcome {
  const location = locationEvidence(ctx);
  const observedValue = { homepageMentions: location.body.slice(0, 5), structuredData: location.schema.slice(0, 5), inTitleOrHeadings: location.prominent };
  if (!location.anywhere) return { status: "FAIL", evidenceConfidence: "MEDIUM", reason: `No city, region or service area was found in the text or structured data of ${scopeText(ctx)}.`, evidenceRefs: refsOf(ctx.pages), observedValue };
  if (location.body.length && (location.prominent || location.schema.length)) return { status: "PASS", reason: `The homepage states where the business operates (${location.body[0]}) and repeats it in ${location.prominent ? "its title or headings" : "structured data"}.`, evidenceRefs: [ctx.home.ref], observedValue };
  return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: location.body.length ? "A location appears in the homepage body text only; it is not in the title, headings or structured data." : "Location information exists in structured data or on another page, but is not stated in the visible homepage text.", evidenceRefs: refsOf(ctx.pages), observedValue };
}

function localPages(ctx: SiteContext): ExtendedOutcome {
  const location = locationEvidence(ctx);
  const targeted = pagesOf(ctx, "services", "locations");
  const locationPages = pagesOf(ctx, "locations");
  const mentions = (page: SitePage) => page.signals.locationMentions.length > 0 || location.cities.some((city) => norm(`${page.analysis.title ?? ""} ${textOf(page)}`).includes(norm(city)));
  const doorway = locationPages.length >= 2 ? nearDuplicatePairs(locationPages, distinctiveShingles(ctx.pages)) : [];
  const withLocation = targeted.filter(mentions);
  const observedValue = { serviceOrLocationPagesSampled: targeted.length, pagesNamingALocation: withLocation.length, nearDuplicateLocationPairs: doorway.length };
  if (!location.anywhere) return { status: "FAIL", evidenceConfidence: "MEDIUM", reason: "No sampled page names a city, region or service area, so the site has no local relevance to build on.", evidenceRefs: refsOf(ctx.pages), observedValue };
  if (doorway.length) return { status: "FAIL", reason: "Sampled location pages have nearly identical body text, which is a thin doorway-page pattern.", evidenceRefs: refsOf(doorway.flat()), observedValue };
  if (!targeted.length) return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: "No dedicated service or location page was found among the pages linked from the homepage or listed in the sitemap.", evidenceRefs: [ctx.home.ref], observedValue };
  if (!withLocation.length) return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: `None of the ${targeted.length} sampled service or location pages names the area served.`, evidenceRefs: refsOf(targeted), observedValue };
  return { status: "PASS", evidenceConfidence: "MEDIUM", reason: `${withLocation.length} of ${targeted.length} sampled service or location pages name the area served, with distinct content.`, evidenceRefs: refsOf(withLocation), observedValue };
}

function reviewComparison(ctx: SiteContext): { ratio: number | null; recent: boolean; count: number | null; median: number | null } {
  const listing = ctx.places?.listing ?? null;
  const count = listing?.reviewCount ?? null;
  const median = ctx.places?.competitorMedianReviews ?? null;
  const ratio = count === null || median === null ? null : median === 0 ? (count > 0 ? 1 : 0) : count / median;
  const recent = Boolean(listing?.latestReviewAt && Date.parse(ctx.places!.fetchedAt) - Date.parse(listing.latestReviewAt) <= 120 * 86_400_000);
  return { ratio, recent, count, median };
}

function reviewSignal(ctx: SiteContext): ExtendedOutcome {
  if (!ctx.places?.listing) return { status: "UNAVAILABLE", reason: ctx.places ? "No Google listing could be matched to this business, so its reviews could not be compared." : "Review counts require a Google Places lookup, which is not configured. No review data was inferred." };
  const { ratio, recent, count, median } = reviewComparison(ctx);
  const observedValue = { reviewCount: count, competitorMedian: median, competitorsCompared: ctx.places.competitors.length, reviewSeenInLast120Days: recent, fetchedAt: ctx.places.fetchedAt };
  if (count === null) return { status: "UNAVAILABLE", reason: "The matched Google listing did not report a review count." };
  if (count === 0) return { status: "FAIL", reason: "The matched Google listing has no reviews.", evidenceRefs: ["places"], observedValue };
  if (ratio === null) return { status: "UNAVAILABLE", reason: "Fewer than three comparable nearby listings were returned, so a competitor median could not be calculated." };
  const percent = Math.round(ratio * 100);
  const basis = `The Google listing has ${count} reviews, ${percent}% of the median (${median}) across ${ctx.places.competitors.length} nearby same-category listings returned by Google.`;
  if (ratio < 0.25) return { status: "FAIL", reason: basis, evidenceRefs: ["places"], observedValue };
  if (ratio < 0.75) return { status: "WARNING", reason: basis, evidenceRefs: ["places"], observedValue };
  return { status: "PASS", reason: `${basis}${recent ? " A review from the last 120 days was returned." : " Review dates were not complete enough to confirm recency."}`, evidenceRefs: ["places"], observedValue };
}

function authorityReviews(ctx: SiteContext): ExtendedOutcome {
  if (ctx.places?.listing && ctx.places.listing.reviewCount !== null) {
    const { ratio, count, median } = reviewComparison(ctx);
    const observedValue = { reviewCount: count, rating: ctx.places.listing.rating, competitorMedian: median, fetchedAt: ctx.places.fetchedAt };
    if (count === 0) return { status: "FAIL", reason: "The matched Google listing has no reviews.", evidenceRefs: ["places"], observedValue };
    if (ratio !== null) {
      const basis = `The Google listing has ${count} reviews against a nearby same-category median of ${median}.`;
      return { status: ratio >= 0.75 ? "PASS" : ratio >= 0.25 ? "WARNING" : "FAIL", reason: basis, evidenceRefs: ["places"], observedValue };
    }
    return { status: count! >= 10 ? "PASS" : "WARNING", evidenceConfidence: "MEDIUM", reason: `The Google listing has ${count} reviews. No competitor median was available, so competitiveness was not compared.`, evidenceRefs: ["places"], observedValue };
  }
  const sources = [ctx.home, ...ctx.pages.slice(1)];
  const profiles = [...new Set(sources.flatMap((page) => page.signals.externalProfiles.filter((profile) => profile.kind !== "social").map((profile) => profile.platform)))];
  const aggregate = sources.flatMap((page) => page.signals.entities).find((entity) => entity.reviewCount !== null || entity.ratingValue !== null) ?? null;
  const onSite = sources.filter((page) => page.signals.entities.some((entity) => entity.hasReviews) || page.signals.schemaTypes.includes("Review") || trustPatterns[0][1].test(textOf(page)) || trustPatterns[1][1].test(textOf(page)));
  const observedValue = { reviewPlatformsLinked: profiles, onSiteRating: aggregate ? { ratingValue: aggregate.ratingValue, reviewCount: aggregate.reviewCount } : null, pagesWithReviewContent: onSite.length };
  const hasContent = Boolean(aggregate) || onSite.length > 0;
  const scope = "Review counts were not verified with the platforms and were not compared with competitors.";
  if (profiles.length && hasContent) return { status: "PASS", evidenceConfidence: "MEDIUM", reason: `The site shows review content and links to ${profiles.slice(0, 3).join(", ")}. ${scope}`, evidenceRefs: refsOf(onSite.length ? onSite : [ctx.home]), observedValue };
  if (profiles.length || hasContent) return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: `${profiles.length ? `The site links to ${profiles.slice(0, 3).join(", ")} but shows no review content of its own` : "The site shows review or testimonial content but links to no third-party review profile where it can be checked"}. ${scope}`, evidenceRefs: refsOf(onSite.length ? onSite : [ctx.home]), observedValue };
  return { status: "FAIL", evidenceConfidence: "MEDIUM", reason: `No reviews, ratings, testimonials or links to a review platform were found on ${scopeText(ctx)}.`, evidenceRefs: refsOf(ctx.pages), observedValue };
}

function thirdPartyMentions(ctx: SiteContext): ExtendedOutcome {
  const platforms = new Map<string, string>();
  for (const page of ctx.pages) for (const profile of page.signals.externalProfiles) platforms.set(profile.platform, profile.kind);
  if (ctx.places?.listing && ctx.places.matchBasis !== "name") platforms.set("Google Business Profile", "google_business");
  const names = [...platforms.keys()];
  const directories = [...platforms.entries()].filter(([, kind]) => kind !== "social").map(([name]) => name);
  const observedValue = { platforms: names, directoriesOrReviewPlatforms: directories };
  const scope = "These are profiles the site declares; they were not opened, and press or other independent mentions were not searched.";
  if (!names.length) return { status: "FAIL", evidenceConfidence: "MEDIUM", reason: `No third-party business profile or citation is linked from ${scopeText(ctx)} or declared in its structured data.`, evidenceRefs: refsOf(ctx.pages), observedValue };
  if (names.length >= 3 && directories.length >= 1) return { status: "PASS", evidenceConfidence: "MEDIUM", reason: `${names.length} third-party profiles are declared (${names.slice(0, 5).join(", ")}), including a directory or review platform. ${scope}`, evidenceRefs: refsOf(ctx.pages), observedValue };
  return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: `${names.length} third-party profile${names.length === 1 ? " is" : "s are"} declared (${names.join(", ")})${directories.length ? "" : ", none of them a business directory or review platform"}. ${scope}`, evidenceRefs: refsOf(ctx.pages), observedValue };
}

function referringDomains(ctx: SiteContext): ExtendedOutcome {
  const data = ctx.backlinks;
  if (!data) {
    return { status: "UNAVAILABLE", reason: ctx.backlinksConfigured ? "The backlink data provider did not return a usable response. No link data was inferred." : "Referring-domain counts require backlink data from a licensed provider, and none is configured. No link data was inferred." };
  }
  if (data.referringDomains === null) return { status: "UNAVAILABLE", reason: "The backlink data provider reported no figure for this domain. No link data was inferred." };
  const count = data.referringDomains;
  const source = data.competitorSource === "configured" ? "the competitor websites configured for this client" : "the websites of nearby same-category Google listings";
  const observedValue = { referringDomains: count, competitorMedian: data.competitorMedian, competitorsCompared: data.competitors.length, competitorSource: data.competitorSource, provider: data.provider, fetchedAt: data.fetchedAt };
  const note = `Counts are ${data.provider}'s index of referring root domains, not Google's, and say nothing about link quality.`;
  if (count === 0) return { status: "FAIL", reason: `${data.provider} reports no referring domains for this website. ${note}`, evidenceRefs: ["backlinks"], observedValue };
  if (data.competitorMedian === null) {
    return { status: "UNAVAILABLE", reason: `${data.provider} reports ${count} referring domain${count === 1 ? "" : "s"} for this website, but fewer than three competitor websites were available to compare it with. Add competitor targets to this website to score this check.` };
  }
  const ratio = data.competitorMedian === 0 ? 1 : count / data.competitorMedian;
  const basis = `${data.provider} reports ${count} referring domain${count === 1 ? "" : "s"}, ${Math.round(ratio * 100)}% of the median (${data.competitorMedian}) across ${data.competitors.length} of ${source}. ${note}`;
  return { status: ratio >= 0.75 ? "PASS" : ratio >= 0.25 ? "WARNING" : "FAIL", evidenceConfidence: data.competitorSource === "configured" ? "HIGH" : "MEDIUM", reason: basis, evidenceRefs: ["backlinks"], observedValue };
}

function thirdPartyConsistency(ctx: SiteContext): ExtendedOutcome {
  const listing = ctx.places?.listing;
  if (!listing) return { status: "UNAVAILABLE", reason: ctx.places ? "No Google listing could be matched to this business, so no third-party source was available to compare." : "Comparing the site with a third-party source requires a Google Places lookup, which is not configured." };
  const compared: string[] = [], mismatched: string[] = [];
  const names = declaredNames(ctx);
  const listingName = normalizeBusinessName(listing.name);
  if (names.length) {
    compared.push("name");
    if (!names.some((name) => { const key = normalizeBusinessName(name); return key === listingName || key.includes(listingName) || listingName.includes(key); })) mismatched.push("name");
  }
  const phones = [...displayedPhones(ctx), ...schemaPhones(ctx)];
  if (listing.phone && phones.length) { compared.push("phone"); if (!phones.includes(listing.phone)) mismatched.push("phone"); }
  if (listing.websiteHost) { compared.push("website"); if (listing.websiteHost !== ctx.siteHost) mismatched.push("website"); }
  const observedValue = { compared, mismatched, source: "Google Places listing", fetchedAt: ctx.places!.fetchedAt };
  if (compared.length < 2) return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: "Only one fact could be compared with the Google listing, so consistency is not established.", evidenceRefs: ["places"], observedValue };
  if (mismatched.includes("name") || mismatched.length >= 2) return { status: "FAIL", reason: `The Google listing's ${mismatched.join(" and ")} differ${mismatched.length === 1 ? "s" : ""} from the audited site.`, evidenceRefs: ["places", ctx.home.ref], observedValue };
  if (mismatched.length) return { status: "WARNING", reason: `The Google listing's ${mismatched[0]} differs from the audited site; ${compared.filter((item) => !mismatched.includes(item)).join(" and ")} match.`, evidenceRefs: ["places", ctx.home.ref], observedValue };
  return { status: "PASS", reason: `The Google listing's ${compared.join(", ")} match the audited site. Other directories were not compared.`, evidenceRefs: ["places", ctx.home.ref], observedValue };
}

function credentials(ctx: SiteContext): ExtendedOutcome {
  const sources = [ctx.home, ...pagesOf(ctx, "about", "services")];
  const text = sources.map(textOf).join(" ");
  const found = credentialPatterns.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  const entities = ctx.pages.flatMap((page) => page.signals.entities);
  const support = [
    licenseNumberPattern.test(text) ? "a license number" : null,
    ctx.pages.some((page) => page.signals.externalProfiles.some((profile) => profile.platform === "Better Business Bureau")) ? "a Better Business Bureau profile link" : null,
    entities.some((entity) => entity.hasCredential) ? "credentials in structured data" : null,
    entities.some((entity) => entity.foundingDate) ? "a founding date in structured data" : null,
  ].filter((item): item is string => item !== null);
  const observedValue = { credentialTypes: found, verifiableSupport: support };
  if (!found.length && !support.length) return { status: "FAIL", evidenceConfidence: "MEDIUM", reason: `No licensing, insurance, certification, membership, award or experience statement was found on ${scopeText(ctx)}.`, evidenceRefs: refsOf(sources), observedValue };
  if (found.length >= 2 && support.length) return { status: "PASS", evidenceConfidence: "MEDIUM", reason: `The site states ${found.slice(0, 4).join(", ")} and supports them with ${support.join(" and ")}. The claims themselves were not verified with an issuing body.`, evidenceRefs: refsOf(sources), observedValue };
  return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: `${found.length ? `The site states ${found.slice(0, 4).join(", ")}` : `The site provides ${support.join(" and ")}`}${support.length || !found.length ? ", but few credential types are presented" : ", but gives nothing a visitor could check, such as a license number or an accrediting body's profile"}.`, evidenceRefs: refsOf(sources), observedValue };
}

function businessTransparency(ctx: SiteContext): ExtendedOutcome {
  const aboutPage = pagesOf(ctx, "about").some((page) => page.signals.wordCount >= 120);
  const aboutSection = ctx.home.signals.headingTexts.some((heading) => /\babout\b|our story|who we are|meet (?:the|our)/i.test(heading));
  const contactDetails = ctx.pages.some((page) => page.signals.phones.length > 0 || page.signals.mailtoLinks.length > 0);
  const location = locationEvidence(ctx);
  const place = location.anywhere || ctx.pages.some((page) => page.signals.entities.some((entity) => entity.streetAddress));
  const present = [aboutPage || aboutSection ? "an about page or section" : null, contactDetails ? "direct contact details" : null, place ? "an address or service area" : null].filter((item): item is string => item !== null);
  const missing = [aboutPage || aboutSection ? null : "an about page or section", contactDetails ? null : "a phone number or email address", place ? null : "an address or service area"].filter((item): item is string => item !== null);
  const observedValue = { aboutPage, aboutSection, contactDetails, addressOrServiceArea: place, contactPageSampled: pagesOf(ctx, "contact").length > 0, policyPageSampled: pagesOf(ctx, "legal").length > 0 };
  if (present.length === 3) return { status: "PASS", reason: `The site provides ${present.join(", ")} on ${scopeText(ctx)}.`, evidenceRefs: refsOf(ctx.pages), observedValue };
  if (present.length === 2) return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: `The site provides ${present.join(" and ")}, but ${missing[0]} was not found on ${scopeText(ctx)}.`, evidenceRefs: refsOf(ctx.pages), observedValue };
  return { status: "FAIL", evidenceConfidence: "MEDIUM", reason: `The business is hard to identify: ${missing.join(", ")} were not found on ${scopeText(ctx)}.`, evidenceRefs: refsOf(ctx.pages), observedValue };
}

function expertiseContent(ctx: SiteContext): ExtendedOutcome {
  const expert = pagesOf(ctx, "blog", "faq");
  const context = (page: SitePage) => page.signals.hasTimeElement || page.signals.hasAuthorMarkup || page.signals.schemaTypes.some((type) => /^(?:Article|BlogPosting|NewsArticle|FAQPage|HowTo|Person)$/.test(type)) || page.signals.questionHeadings.length >= 3;
  const substantive = expert.filter((page) => page.signals.wordCount >= 300);
  const homeFaq = ctx.home.signals.questionHeadings.length >= 3 || ctx.home.signals.schemaTypes.includes("FAQPage");
  const observedValue = { expertisePagesSampled: expert.map((page) => page.url), substantivePages: substantive.length, withAuthorOrDateContext: expert.filter(context).length, homepageFaq: homeFaq };
  if (substantive.length && expert.some(context)) return { status: "PASS", evidenceConfidence: "MEDIUM", reason: `Sampled ${expert.map((page) => page.kind).filter((kind, index, all) => all.indexOf(kind) === index).join(" and ")} content is substantive and carries author, date or question-and-answer context. Accuracy and depth were not judged.`, evidenceRefs: refsOf(expert), observedValue };
  if (expert.length || homeFaq) return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: expert.length ? "Educational or FAQ content exists but is brief or lacks author and date context." : "The homepage answers a few questions, but no dedicated guide, article or FAQ page was found.", evidenceRefs: refsOf(expert.length ? expert : [ctx.home]), observedValue };
  return { status: "FAIL", evidenceConfidence: "MEDIUM", reason: `No blog, guide, resource or FAQ content was found among ${scopeText(ctx)}.`, evidenceRefs: [ctx.home.ref], observedValue };
}

function leadForm(ctx: SiteContext): ExtendedOutcome {
  const path = leadPath(ctx);
  const jsNote = "A form drawn only by JavaScript is not visible to this static check, and no form was submitted.";
  if (path.form && path.formPage) {
    const observedValue = { page: path.formPage.url, fields: path.form.fieldCount, requiredFields: path.form.requiredCount, hasSubmitControl: path.form.hasSubmit };
    const issues = [
      path.form.fieldCount > 8 ? `it asks for ${path.form.fieldCount} fields` : null,
      /^http:\/\//i.test(path.form.action ?? "") ? "it posts to an insecure HTTP address" : null,
    ].filter(Boolean);
    if (issues.length) return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: `A lead form was found on ${path.formPage.kind === "home" ? "the homepage" : "the " + path.formPage.kind + " page"}, but ${issues.join(" and ")}. ${jsNote}`, evidenceRefs: [path.formPage.ref], observedValue };
    return { status: "PASS", evidenceConfidence: "MEDIUM", reason: `A lead form with ${path.form.fieldCount} field${path.form.fieldCount === 1 ? "" : "s"} ${path.form.hasSubmit ? "and a submit control " : "(submitted by script) "}was found on ${path.formPage.kind === "home" ? "the homepage" : "the " + path.formPage.kind + " page"}. It was not submitted, so delivery of enquiries is not confirmed.`, evidenceRefs: [path.formPage.ref], observedValue };
  }
  if (path.toolPage) return { status: "PASS", evidenceConfidence: "MEDIUM", reason: `An embedded ${path.toolPage.signals.embeddedLeadTools[0]} form or scheduler was found. Its contents are hosted elsewhere and were not inspected or submitted.`, evidenceRefs: [path.toolPage.ref], observedValue: { embeddedTool: path.toolPage.signals.embeddedLeadTools[0] } };
  if (path.tel || path.mailto) return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: `No lead form was found on ${scopeText(ctx)}; visitors can only ${path.tel ? "call" : "email"}. ${jsNote}`, evidenceRefs: refsOf(ctx.pages), observedValue: { phoneLink: path.tel, emailLink: path.mailto } };
  return { status: "FAIL", evidenceConfidence: "MEDIUM", reason: `No lead form, phone link or email link was found on ${scopeText(ctx)}. ${jsNote}`, evidenceRefs: refsOf(ctx.pages), observedValue: { phoneLink: false, emailLink: false } };
}

function offerClarity(ctx: SiteContext): ExtendedOutcome {
  const h1 = ctx.home.analysis.h1[0]?.trim() ?? "";
  const generic = !h1 || h1.split(/\s+/).length < 2 || /^(?:welcome|home|hello|hi there|untitled|coming soon)\b/i.test(h1);
  const services = serviceSignals(ctx);
  const lead = norm([ctx.home.analysis.title ?? "", h1, ctx.home.analysis.metaDescription ?? "", ...ctx.home.analysis.h2.slice(0, 6), textOf(ctx.home).slice(0, 800)].join(" | "));
  const serviceClear = services.verified.length ? services.verified.some((value) => lead.includes(norm(value))) : !generic && Boolean(ctx.home.analysis.metaDescription || ctx.home.analysis.h2.length);
  const location = locationEvidence(ctx);
  const audienceClear = location.cities.some((city) => lead.includes(norm(city))) || Object.keys(usStateNames).some((state) => lead.includes(` ${state} `))
    || /\b(?:residential|commercial|homeowners?|businesses|families|contractors|patients|teams|companies|owners|professionals)\b/i.test(lead);
  const nextStep = ctx.homeHasPrimaryCta;
  const observedValue = { primaryHeading: h1 || null, serviceStatedEarly: serviceClear, audienceOrAreaStatedEarly: audienceClear, callToActionFound: nextStep };
  const missing = [serviceClear ? null : "what is offered", audienceClear ? null : "who or where it is for", nextStep ? null : "the next step"].filter((item): item is string => item !== null);
  if (!missing.length) return { status: "PASS", evidenceConfidence: "MEDIUM", reason: "The homepage's title, main heading and opening text state the service and the audience or area, and a call to action is present.", evidenceRefs: [ctx.home.ref], observedValue };
  if (missing.length === 1) return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: `The homepage's title, main heading and opening text do not make clear ${missing[0]}.`, evidenceRefs: [ctx.home.ref], observedValue };
  return { status: "FAIL", evidenceConfidence: "MEDIUM", reason: `The homepage's title, main heading and opening text do not make clear ${missing.join(" or ")}.`, evidenceRefs: [ctx.home.ref], observedValue };
}

function trustSignals(ctx: SiteContext): ExtendedOutcome {
  const sources = [ctx.home, ...pagesOf(ctx, "contact", "services", "reviews", "about")];
  const detect = (page: SitePage) => {
    const text = textOf(page);
    const found = trustPatterns.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
    if (page.signals.entities.some((entity) => entity.ratingValue !== null || entity.hasReviews) && !found.includes("ratings")) found.push("ratings");
    if (page.signals.externalProfiles.some((profile) => profile.kind !== "social")) found.push("third-party review or directory profiles");
    return found;
  };
  const onHome = detect(ctx.home);
  const all = [...new Set(sources.flatMap(detect))];
  const observedValue = { trustSignalTypes: all, onHomepage: onHome };
  if (!all.length) return { status: "FAIL", evidenceConfidence: "MEDIUM", reason: `No testimonials, ratings, credentials, guarantees, experience statements or client proof were found on ${scopeText(ctx)}.`, evidenceRefs: refsOf(sources), observedValue };
  if (all.length >= 3 && onHome.length >= 1) return { status: "PASS", evidenceConfidence: "MEDIUM", reason: `${all.length} kinds of trust proof were found (${all.slice(0, 4).join(", ")}), including on the homepage. Their truthfulness was not verified.`, evidenceRefs: refsOf(sources), observedValue };
  return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: all.length >= 3 ? `Trust proof exists (${all.slice(0, 4).join(", ")}) but none of it is on the homepage, where visitors decide whether to enquire.` : `Only ${all.length} kind${all.length === 1 ? "" : "s"} of trust proof ${all.length === 1 ? "was" : "were"} found (${all.join(", ")}).`, evidenceRefs: refsOf(sources), observedValue };
}

function friction(ctx: SiteContext): ExtendedOutcome {
  const path = leadPath(ctx);
  const contactBroken = ctx.failed.some((page) => page.kind === "contact" && (page.status ?? 0) >= 400);
  const hasPath = Boolean(path.form || path.toolPage || path.tel || path.mailto);
  const untappablePhone = ctx.home.signals.phones.length > 0 && ctx.home.signals.telLinks.length === 0;
  const fields = path.form?.fieldCount ?? 0;
  const observedValue = { leadActionOnHomepage: path.onHome, formFields: path.form ? fields : null, requiredFields: path.form?.requiredCount ?? null, phoneShownButNotTappable: untappablePhone };
  if (!hasPath || fields > 12 || (contactBroken && !path.onHome)) {
    return { status: "FAIL", evidenceConfidence: "MEDIUM", reason: !hasPath ? `No way to enquire (form, phone link or email link) was found on ${scopeText(ctx)}.` : fields > 12 ? `The lead form asks for ${fields} fields.` : "The contact page linked from the homepage returns an error and the homepage offers no other way to enquire.", evidenceRefs: refsOf(ctx.pages), observedValue };
  }
  const issues = [
    fields >= 8 ? `the lead form asks for ${fields} fields` : null,
    (path.form?.requiredCount ?? 0) >= 7 ? `${path.form!.requiredCount} form fields are required` : null,
    untappablePhone ? "the homepage shows a phone number that is not a tappable link" : null,
    !path.onHome ? "the homepage itself offers no form, phone link or email link, so every enquiry needs an extra page" : null,
  ].filter(Boolean);
  if (issues.length) return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: `Moderate friction was observed: ${issues.join("; ")}. ${STATIC_NOTE}`, evidenceRefs: refsOf(ctx.pages), observedValue };
  return { status: "PASS", evidenceConfidence: "MEDIUM", reason: `A visitor can enquire directly from the homepage${path.form ? ` and the lead form asks for ${fields} field${fields === 1 ? "" : "s"}` : ""}. The journey was not completed in a browser.`, evidenceRefs: refsOf(ctx.pages), observedValue };
}

function measurement(ctx: SiteContext): ExtendedOutcome {
  const leadPages = pagesOf(ctx, "contact");
  const home = ctx.home.signals.measurementTags;
  const all = [...new Set([ctx.home, ...leadPages].flatMap((page) => page.signals.measurementTags))];
  const pageviewOnly = [...new Set([ctx.home, ...leadPages].flatMap((page) => page.signals.pageviewOnlyTags))];
  const untagged = leadPages.filter((page) => page.signals.measurementTags.length === 0);
  const observedValue = { measurementTags: all, pageviewOnlyTags: pageviewOnly, leadPagesWithoutTags: untagged.map((page) => page.url) };
  const note = "Tags added only after cookie consent or by another script are not visible to this static check, and conversion settings inside the analytics account were not inspected.";
  if (!all.length && !pageviewOnly.length) return { status: "FAIL", evidenceConfidence: "MEDIUM", reason: `No analytics, tag manager, advertising or call-tracking tag was found in the HTML of ${leadPages.length ? "the homepage or contact page" : "the homepage"}. ${note}`, evidenceRefs: refsOf([ctx.home, ...leadPages]), observedValue };
  if (!all.length) return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: `Only page-view analytics was found (${pageviewOnly.join(", ")}); nothing that can record a form submission or call as a conversion. ${note}`, evidenceRefs: [ctx.home.ref], observedValue };
  if (!home.length || untagged.length) return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: `${all.join(", ")} was found, but not on ${!home.length ? "the homepage" : "the contact page"}, so lead actions there may go unmeasured. ${note}`, evidenceRefs: refsOf([ctx.home, ...leadPages]), observedValue };
  return { status: "PASS", evidenceConfidence: "MEDIUM", reason: `${all.join(", ")} was found on ${leadPages.length ? "the homepage and contact page" : "the homepage"}, so lead actions can be measured. ${note}`, evidenceRefs: refsOf([ctx.home, ...leadPages]), observedValue };
}

function declaredIdentityClarity(ctx: SiteContext): ExtendedOutcome {
  const names = [...new Set([...ctx.home.signals.entities.filter((entity) => entity.name && businessEntity(entity.types)).map((entity) => entity.name!), ...(ctx.home.signals.ogSiteName ? [ctx.home.signals.ogSiteName] : [])])];
  const text = norm(textOf(ctx.home));
  const title = norm(ctx.home.analysis.title ?? "");
  const inText = names.find((name) => text.includes(norm(name)));
  const observedValue = { declaredNames: names, appearsInVisibleText: Boolean(inText), source: "site structured data and metadata; no verified business fact was on file" };
  if (inText) return { status: "PASS", evidenceConfidence: "MEDIUM", reason: `The homepage declares the business name “${inText}” in its structured data or metadata and repeats it in visible text${title.includes(norm(inText)) ? " and the title" : ""}. This is a text check, not proof of AI visibility.`, evidenceRefs: [ctx.home.ref], observedValue };
  if (names.length) return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: `The homepage declares the name “${names[0]}” in structured data or metadata, but that exact name does not appear in its visible text.`, evidenceRefs: [ctx.home.ref], observedValue };
  if (ctx.home.analysis.title) return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: "The homepage does not declare a business name in structured data or site metadata; a reader has to infer it from the page title.", evidenceRefs: [ctx.home.ref], observedValue };
  return { status: "FAIL", evidenceConfidence: "MEDIUM", reason: "The homepage has no title and declares no business name in structured data or metadata.", evidenceRefs: [ctx.home.ref], observedValue };
}

function declaredServiceClarity(ctx: SiteContext): ExtendedOutcome {
  const services = serviceSignals(ctx);
  const signals = [services.servicePages.length ? "a dedicated service page" : null, services.headings.length ? "a services heading on the homepage" : null, services.schema ? "services in structured data" : null].filter((item): item is string => item !== null);
  const depth = ctx.home.signals.wordCount >= 150;
  const observedValue = { servicePagesSampled: services.servicePages.length, serviceHeadings: services.headings.slice(0, 5), servicesInStructuredData: services.schema, homepageWords: ctx.home.signals.wordCount };
  const refs = refsOf([ctx.home, ...services.servicePages]);
  if (signals.length && depth) return { status: "PASS", evidenceConfidence: "MEDIUM", reason: `The site describes its services through ${signals.join(" and ")}, with substantive homepage text. No verified service list was on file to compare, and this is not proof of AI visibility.`, evidenceRefs: refs, observedValue };
  if (signals.length || depth) return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: signals.length ? `The site has ${signals.join(" and ")}, but the homepage itself says little about what is offered.` : "The homepage has descriptive text, but no services heading, dedicated service page or service structured data was found.", evidenceRefs: refs, observedValue };
  return { status: "FAIL", evidenceConfidence: "MEDIUM", reason: `No services heading, service page or service structured data was found on ${scopeText(ctx)}, and the homepage has very little text.`, evidenceRefs: refs, observedValue };
}

function declaredLocationClarity(ctx: SiteContext): ExtendedOutcome {
  const location = locationEvidence(ctx);
  const observedValue = { homepageMentions: location.body.slice(0, 5), structuredData: location.schema.slice(0, 5) };
  if (location.body.length && location.schema.length) return { status: "PASS", evidenceConfidence: "MEDIUM", reason: `The homepage states a location in visible text (${location.body[0]}) and in structured data. This is a text check, not proof of AI visibility.`, evidenceRefs: [ctx.home.ref], observedValue };
  if (location.anywhere) return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: location.body.length ? "A location is stated in the homepage text but not in structured data." : "A location is given in structured data or on another page, but not in the visible homepage text.", evidenceRefs: refsOf(ctx.pages), observedValue };
  return { status: "FAIL", evidenceConfidence: "MEDIUM", reason: `No city, region or service area was found in the text or structured data of ${scopeText(ctx)}.`, evidenceRefs: refsOf(ctx.pages), observedValue };
}

function answerability(ctx: SiteContext): ExtendedOutcome {
  const services = serviceSignals(ctx);
  const allText = ctx.pages.map(textOf).join(" ");
  const location = locationEvidence(ctx);
  const path = leadPath(ctx);
  const questions: Array<[string, boolean]> = [
    ["what the business offers", services.servicePages.length > 0 || services.headings.length > 0 || services.verifiedFound.length > 0 || services.schema],
    ["where it operates", location.anywhere],
    ["how to make contact", Boolean(path.form || path.toolPage || path.tel || path.mailto)],
    ["when it is open", ctx.pages.some((page) => page.signals.entities.some((entity) => entity.hasOpeningHours)) || /\b24\s?\/\s?7\b|\b(?:hours|open)\b[^.]{0,60}\b(?:mon|tue|wed|thu|fri|sat|sun|\d{1,2}(?::\d{2})?\s*(?:am|pm))/i.test(allText)],
    ["what it costs or how pricing works", /\$\s?\d|\bpric(?:e|es|ing)\b|\bcosts?\b|\brates\b|\bfree (?:estimate|quote|consultation|inspection)s?\b|\bfinancing\b/i.test(allText)],
    ["common questions or how the process works", ctx.pages.some((page) => page.signals.schemaTypes.includes("FAQPage")) || ctx.pages.reduce((total, page) => total + page.signals.questionHeadings.length, 0) >= 3 || pagesOf(ctx, "faq").length > 0 || /\bhow it works\b|\bour process\b|\bwhat to expect\b/i.test(allText)],
  ];
  const answered = questions.filter(([, ok]) => ok).map(([label]) => label);
  const missing = questions.filter(([, ok]) => !ok).map(([label]) => label);
  const observedValue = { answered, missing, questionsChecked: questions.length };
  const basis = `${answered.length} of ${questions.length} priority customer questions can be answered from ${scopeText(ctx)}`;
  if (answered.length >= 5) return { status: "PASS", evidenceConfidence: "MEDIUM", reason: `${basis}${missing.length ? `; not found: ${missing.join(", ")}` : ""}. Answer quality was not judged.`, evidenceRefs: refsOf(ctx.pages), observedValue };
  if (answered.length >= 3) return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: `${basis}. Not found: ${missing.join(", ")}.`, evidenceRefs: refsOf(ctx.pages), observedValue };
  return { status: "FAIL", evidenceConfidence: "MEDIUM", reason: `Only ${basis}. Not found: ${missing.join(", ")}.`, evidenceRefs: refsOf(ctx.pages), observedValue };
}

function citability(ctx: SiteContext): ExtendedOutcome {
  const content = ctx.pages.filter((page) => !["legal", "contact"].includes(page.kind));
  const text = content.map(textOf).join(" ");
  const deepPages = content.filter((page) => page.signals.wordCount >= 250).length;
  const specifics = (text.match(/\b\d[\d,.]*\s?(?:%|percent|years?|sq\.?\s?ft|square feet|miles?|hours?|days?|minutes?|customers|clients|projects|homes|reviews|locations|employees)\b|\$\s?\d[\d,]*|\b(?:19|20)\d{2}\b/gi) ?? []).length;
  const expertise = pagesOf(ctx, "blog", "faq").length > 0 || ctx.pages.some((page) => page.signals.schemaTypes.some((type) => /^(?:Article|BlogPosting|FAQPage|HowTo)$/.test(type)));
  const proof = credentialPatterns.some(([, pattern]) => pattern.test(text)) || /\bcase stud(?:y|ies)\b/i.test(text) || ctx.pages.some((page) => page.signals.entities.some((entity) => entity.hasCredential));
  const met = [
    deepPages >= 2 || ctx.home.signals.wordCount >= 600 ? "substantive page text" : null,
    specifics >= 8 ? "specific figures and dates" : null,
    expertise ? "educational or FAQ content" : null,
    proof ? "stated credentials or case studies" : null,
  ].filter((item): item is string => item !== null);
  const observedValue = { pagesWith250WordsOrMore: deepPages, specificFiguresFound: specifics, educationalContent: expertise, credentialsOrCaseStudies: proof };
  if (met.length >= 3) return { status: "PASS", evidenceConfidence: "MEDIUM", reason: `The sampled pages contain ${met.join(", ")} that another source could cite. Whether any AI system cites the site was not measured.`, evidenceRefs: refsOf(content), observedValue };
  if (met.length === 2) return { status: "WARNING", evidenceConfidence: "MEDIUM", reason: `The sampled pages contain ${met.join(" and ")}, but otherwise read as general promotional copy with few citable specifics.`, evidenceRefs: refsOf(content), observedValue };
  return { status: "FAIL", evidenceConfidence: "MEDIUM", reason: `The sampled pages contain little a source could cite${met.length ? ` beyond ${met[0]}` : ""}: few specific figures, no educational content and no stated credentials.`, evidenceRefs: refsOf(content), observedValue };
}

const rules: Record<string, (ctx: SiteContext) => ExtendedOutcome> = {
  "perf.mobile_render": mobileRender,
  "perf.critical_functionality": criticalFunctionality,
  "seo.content_targeting": contentTargeting,
  "local.business_identity": businessIdentity,
  "local.gbp_presence": gbpPresence,
  "local.category_service_alignment": categoryAlignment,
  "local.location_clarity": localLocationClarity,
  "local.local_pages": localPages,
  "local.review_signal": reviewSignal,
  "conv.lead_form": leadForm,
  "conv.offer_clarity": offerClarity,
  "conv.trust_signals": trustSignals,
  "conv.friction": friction,
  "conv.measurement": measurement,
  "ai.entity_consistency": entityConsistency,
  "ai.answerability": answerability,
  "ai.citability": citability,
  "auth.reviews": authorityReviews,
  "auth.third_party_mentions": thirdPartyMentions,
  "auth.referring_domains": referringDomains,
  "auth.credentials": credentials,
  "auth.business_transparency": businessTransparency,
  "auth.expertise_content": expertiseContent,
  "auth.entity_consistency": thirdPartyConsistency,
};

/** Fallbacks used only when no verified business fact of that kind is on file. */
const declaredFactRules: Record<string, (ctx: SiteContext) => ExtendedOutcome> = {
  "ai.identity_clarity": declaredIdentityClarity,
  "ai.service_clarity": declaredServiceClarity,
  "ai.location_clarity": declaredLocationClarity,
};

export function evaluateExtendedCheck(checkKey: string, ctx: SiteContext): ExtendedOutcome | null {
  return rules[checkKey]?.(ctx) ?? null;
}

export function evaluateDeclaredFactCheck(checkKey: string, ctx: SiteContext): ExtendedOutcome | null {
  return declaredFactRules[checkKey]?.(ctx) ?? null;
}

export const extendedCheckKeys = Object.keys(rules);
