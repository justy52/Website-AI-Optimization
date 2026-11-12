import { parse, type DefaultTreeAdapterTypes } from "parse5";

/**
 * Static, deterministic signals read from one fetched HTML document.
 * Nothing here executes JavaScript, submits a form or contacts another host.
 * Website text is untrusted data: it is only pattern-matched, never interpreted.
 */

export type FormSignal = {
  action: string | null;
  method: string;
  fieldCount: number;
  requiredCount: number;
  hasSubmit: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasMessage: boolean;
  hasPassword: boolean;
  isSearch: boolean;
};

export type EntitySignal = {
  types: string[];
  name: string | null;
  telephone: string | null;
  email: string | null;
  url: string | null;
  streetAddress: string | null;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
  areaServed: string[];
  sameAs: string[];
  ratingValue: number | null;
  reviewCount: number | null;
  hasReviews: boolean;
  hasOpeningHours: boolean;
  hasOfferCatalog: boolean;
  hasCredential: boolean;
  hasMap: boolean;
  foundingDate: string | null;
};

export type ExternalProfile = {
  platform: string;
  kind: "review_directory" | "social" | "google_business";
  url: string;
};

export type PageSignals = {
  viewport: string | null;
  ogSiteName: string | null;
  forms: FormSignal[];
  embeddedLeadTools: string[];
  measurementTags: string[];
  pageviewOnlyTags: string[];
  entities: EntitySignal[];
  schemaTypes: string[];
  telLinks: string[];
  mailtoLinks: string[];
  phones: string[];
  locationMentions: string[];
  externalProfiles: ExternalProfile[];
  questionHeadings: string[];
  headingTexts: string[];
  hasTimeElement: boolean;
  hasAuthorMarkup: boolean;
  wordCount: number;
};

type Element = DefaultTreeAdapterTypes.Element;
type Node = DefaultTreeAdapterTypes.Node;

const leadToolHosts: Array<[RegExp, string]> = [
  [/(^|\.)typeform\.com$/, "Typeform"],
  [/(^|\.)jotform\.com$/, "Jotform"],
  [/(^|\.)calendly\.com$/, "Calendly"],
  [/(^|\.)hsforms\.(?:com|net)$/, "HubSpot Forms"],
  [/(^|\.)hubspot\.com$/, "HubSpot Forms"],
  [/(^|\.)wufoo\.com$/, "Wufoo"],
  [/(^|\.)formstack\.com$/, "Formstack"],
  [/(^|\.)cognitoforms\.com$/, "Cognito Forms"],
  [/(^|\.)acuityscheduling\.com$/, "Acuity Scheduling"],
  [/(^|\.)squareup\.com$/, "Square Appointments"],
  [/(^|\.)housecallpro\.com$/, "Housecall Pro"],
  [/(^|\.)getjobber\.com$/, "Jobber"],
  [/(^|\.)servicetitan\.com$/, "ServiceTitan"],
  [/(^|\.)tally\.so$/, "Tally"],
  [/(^|\.)leadconnectorhq\.com$/, "LeadConnector"],
  [/(^|\.)msgsndr\.com$/, "LeadConnector"],
];

// Tags able to record a lead action (event, conversion or call), not only a page view.
const measurementPatterns: Array<[RegExp, string]> = [
  [/googletagmanager\.com\/gtm\.js|googletagmanager\.com\/ns\.html|\bGTM-[A-Z0-9]{4,}\b/, "Google Tag Manager"],
  [/googletagmanager\.com\/gtag\/js|\bgtag\s*\(|\bG-[A-Z0-9]{6,}\b/, "Google Analytics 4"],
  [/google-analytics\.com\/(?:analytics|ga)\.js/, "Google Analytics (legacy)"],
  [/\bAW-\d{6,}\b|googleadservices\.com\/pagead\/conversion/, "Google Ads conversion tag"],
  [/connect\.facebook\.net\/[^"'\s]*\/fbevents\.js|\bfbq\s*\(/, "Meta Pixel"],
  [/snap\.licdn\.com\/li\.lms-analytics|_linkedin_partner_id/, "LinkedIn Insight Tag"],
  [/analytics\.tiktok\.com/, "TikTok Pixel"],
  [/bat\.bing\.com\/bat\.js/, "Microsoft Advertising UET"],
  [/js\.hs-scripts\.com|js\.hs-analytics\.net/, "HubSpot tracking"],
  [/cdn\.segment\.com\/analytics\.js/, "Segment"],
  [/cdn\.callrail\.com|calltrk\.com/, "CallRail call tracking"],
  [/tctm\.co|calltrackingmetrics\.com/, "CallTrackingMetrics"],
  [/whatconverts\.com/, "WhatConverts"],
  [/plausible\.io\/js|\/js\/plausible\./, "Plausible"],
  [/cdn\.usefathom\.com/, "Fathom"],
  [/matomo\.js|piwik\.js/, "Matomo"],
  [/cdn\.mxpnl\.com|mixpanel\.com\/lib/, "Mixpanel"],
  [/posthog\.com\/static|\bposthog\.init\s*\(/, "PostHog"],
];

const pageviewOnlyPatterns: Array<[RegExp, string]> = [
  [/static\.cloudflareinsights\.com\/beacon/, "Cloudflare Web Analytics"],
  [/\/_vercel\/insights\/script\.js|va\.vercel-scripts\.com/, "Vercel Web Analytics"],
  [/clarity\.ms\/tag/, "Microsoft Clarity"],
  [/static\.hotjar\.com/, "Hotjar"],
];

const profileHosts: Array<[RegExp, string, ExternalProfile["kind"]]> = [
  [/(^|\.)g\.page$|(^|\.)maps\.app\.goo\.gl$|(^|\.)business\.google\.com$|(^|\.)g\.co$/, "Google Business Profile", "google_business"],
  [/(^|\.)yelp\.com$/, "Yelp", "review_directory"],
  [/(^|\.)bbb\.org$/, "Better Business Bureau", "review_directory"],
  [/(^|\.)trustpilot\.com$/, "Trustpilot", "review_directory"],
  [/(^|\.)angi\.com$|(^|\.)angieslist\.com$/, "Angi", "review_directory"],
  [/(^|\.)homeadvisor\.com$/, "HomeAdvisor", "review_directory"],
  [/(^|\.)houzz\.com$/, "Houzz", "review_directory"],
  [/(^|\.)thumbtack\.com$/, "Thumbtack", "review_directory"],
  [/(^|\.)nextdoor\.com$/, "Nextdoor", "review_directory"],
  [/(^|\.)tripadvisor\.com$/, "Tripadvisor", "review_directory"],
  [/(^|\.)clutch\.co$/, "Clutch", "review_directory"],
  [/(^|\.)g2\.com$/, "G2", "review_directory"],
  [/(^|\.)avvo\.com$/, "Avvo", "review_directory"],
  [/(^|\.)healthgrades\.com$/, "Healthgrades", "review_directory"],
  [/(^|\.)zillow\.com$/, "Zillow", "review_directory"],
  [/(^|\.)porch\.com$/, "Porch", "review_directory"],
  [/(^|\.)yellowpages\.com$/, "Yellow Pages", "review_directory"],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, "Facebook", "social"],
  [/(^|\.)instagram\.com$/, "Instagram", "social"],
  [/(^|\.)linkedin\.com$/, "LinkedIn", "social"],
  [/(^|\.)x\.com$|(^|\.)twitter\.com$/, "X", "social"],
  [/(^|\.)youtube\.com$/, "YouTube", "social"],
  [/(^|\.)tiktok\.com$/, "TikTok", "social"],
  [/(^|\.)pinterest\.com$/, "Pinterest", "social"],
];

export const usStateNames: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};

const stateAlternation = [...Object.keys(usStateNames).map((name) => name.replace(/\b\w/g, (c) => c.toUpperCase())), ...Object.values(usStateNames)].join("|");
const locationPattern = new RegExp(`\\b([A-Z][a-zA-Z.'-]+(?: [A-Z][a-zA-Z.'-]+){0,2}),\\s*(${stateAlternation})\\b`, "g");

function attrs(element: Element): Map<string, string> {
  return new Map(element.attrs.map((attr) => [attr.name.toLowerCase(), attr.value]));
}

function isHidden(map: Map<string, string>): boolean {
  if (map.has("hidden") || map.get("aria-hidden")?.trim().toLowerCase() === "true") return true;
  const style = map.get("style")?.toLowerCase() ?? "";
  return /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))\s*(?:!important\s*)?(?:;|$)/.test(style);
}

function textOf(node: Node): string {
  if (node.nodeName === "#text" && "value" in node) return node.value;
  if (!("childNodes" in node)) return "";
  return node.childNodes.map(textOf).join(" ");
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Ten-digit North American number, or the digits as given for other formats. */
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D+/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function asText(value: unknown): string | null {
  if (typeof value === "string") return clean(value).slice(0, 300) || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return asText(record.name ?? record["@value"]);
  }
  return null;
}

function asNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/,/g, "")) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
}

const entityTypePattern = /Organization|Business|Corporation|ProfessionalService|Store$|Contractor$|Restaurant|Dentist|Physician|Attorney|Plumber|Electrician|Locksmith|Roofing|HVAC|Agency|Clinic|Salon|Shop$/;
// Properties whose value is the page's own subject. An organization nested
// anywhere else (memberOf, parentOrganization, brand, review author, branch
// departments...) is a different entity and must not be read as the business.
const subjectProperties = new Set(["@graph", "publisher", "about", "mainEntity", "mainEntityOfPage", "provider", "itemReviewed"]);

function collectEntities(value: unknown, into: EntitySignal[], types: Set<string>, depth = 0, isSubject = true): void {
  if (!value || typeof value !== "object" || depth > 6) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 50)) collectEntities(item, into, types, depth + 1, isSubject);
    return;
  }
  const record = value as Record<string, unknown>;
  const ownTypes = asArray(record["@type"]).filter((item): item is string => typeof item === "string");
  for (const type of ownTypes) types.add(type);
  if (isSubject && ownTypes.some((type) => entityTypePattern.test(type))) {
    const address = asArray(record.address).find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
    const rating = record.aggregateRating && typeof record.aggregateRating === "object" ? record.aggregateRating as Record<string, unknown> : null;
    into.push({
      types: ownTypes,
      name: asText(record.name) ?? asText(record.legalName),
      telephone: asText(record.telephone),
      email: asText(record.email),
      url: asText(record.url),
      streetAddress: address ? asText(address.streetAddress) : typeof record.address === "string" ? asText(record.address) : null,
      locality: address ? asText(address.addressLocality) : null,
      region: address ? asText(address.addressRegion) : null,
      postalCode: address ? asText(address.postalCode) : null,
      areaServed: asArray(record.areaServed).map(asText).filter((item): item is string => Boolean(item)).slice(0, 25),
      sameAs: asArray(record.sameAs).filter((item): item is string => typeof item === "string").slice(0, 25),
      ratingValue: rating ? asNumber(rating.ratingValue) : null,
      reviewCount: rating ? asNumber(rating.reviewCount ?? rating.ratingCount) : null,
      hasReviews: asArray(record.review).length > 0,
      hasOpeningHours: record.openingHours !== undefined || record.openingHoursSpecification !== undefined,
      hasOfferCatalog: record.hasOfferCatalog !== undefined || record.makesOffer !== undefined || record.knowsAbout !== undefined || record.serviceType !== undefined,
      hasCredential: record.hasCredential !== undefined || record.award !== undefined || record.memberOf !== undefined,
      hasMap: record.hasMap !== undefined,
      foundingDate: asText(record.foundingDate),
    });
  }
  for (const [key, child] of Object.entries(record)) {
    if (key !== "@context" && child && typeof child === "object") collectEntities(child, into, types, depth + 1, isSubject && subjectProperties.has(key));
  }
}

export function classifyExternalProfile(href: string, pageUrl: string): ExternalProfile | null {
  let url: URL;
  try {
    url = new URL(href, pageUrl);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  // Share and intent links point at the visitor's account, not a business profile.
  if (/\/(?:sharer|share|intent|dialog)\b|[?&](?:u|url|text)=/.test(url.pathname + url.search)) return null;
  if ((host === "google.com" || host.endsWith(".google.com")) && /^\/maps\b/.test(url.pathname)) {
    return { platform: "Google Business Profile", kind: "google_business", url: url.origin + url.pathname };
  }
  for (const [pattern, platform, kind] of profileHosts) {
    if (!pattern.test(host)) continue;
    if (kind !== "google_business" && url.pathname.replace(/\/+$/, "") === "") return null;
    return { platform, kind, url: url.origin + url.pathname };
  }
  return null;
}

export function analyzeSignals(html: string, pageUrl: string): PageSignals {
  const signals: PageSignals = {
    viewport: null, ogSiteName: null, forms: [], embeddedLeadTools: [], measurementTags: [], pageviewOnlyTags: [],
    entities: [], schemaTypes: [], telLinks: [], mailtoLinks: [], phones: [], locationMentions: [], externalProfiles: [],
    questionHeadings: [], headingTexts: [], hasTimeElement: false, hasAuthorMarkup: false, wordCount: 0,
  };
  const schemaTypes = new Set<string>();
  const visible: string[] = [];
  const scriptSources: string[] = [];
  const tools = new Set<string>();
  const profiles = new Map<string, ExternalProfile>();

  const noteLeadTool = (source: string | undefined) => {
    if (!source) return;
    try {
      const host = new URL(source, pageUrl).hostname.toLowerCase();
      for (const [pattern, name] of leadToolHosts) if (pattern.test(host)) tools.add(name);
    } catch { /* ignore an unparseable embed address */ }
  };

  function readForm(form: Element): FormSignal {
    const map = attrs(form);
    const signal: FormSignal = {
      action: map.get("action")?.trim() || null, method: (map.get("method") ?? "get").toLowerCase(),
      fieldCount: 0, requiredCount: 0, hasSubmit: false, hasEmail: false, hasPhone: false, hasMessage: false, hasPassword: false,
      isSearch: map.get("role")?.toLowerCase() === "search",
    };
    const walk = (node: Node) => {
      if ("tagName" in node) {
        const a = attrs(node);
        const type = (a.get("type") ?? "text").toLowerCase();
        const label = `${a.get("name") ?? ""} ${a.get("id") ?? ""} ${a.get("placeholder") ?? ""} ${a.get("autocomplete") ?? ""} ${a.get("aria-label") ?? ""}`.toLowerCase();
        if (node.tagName === "input") {
          if (type === "submit" || type === "image") signal.hasSubmit = true;
          else if (type === "password") signal.hasPassword = true;
          else if (type === "search") signal.isSearch = true;
          if (!["hidden", "submit", "button", "image", "reset"].includes(type)) {
            signal.fieldCount += 1;
            if (a.has("required") || a.get("aria-required") === "true") signal.requiredCount += 1;
            if (type === "email" || /e-?mail/.test(label)) signal.hasEmail = true;
            if (type === "tel" || /phone|tel\b|mobile/.test(label)) signal.hasPhone = true;
            if (/^(?:q|s|search|query)\b/.test((a.get("name") ?? "").toLowerCase())) signal.isSearch = true;
          }
        } else if (node.tagName === "textarea") {
          signal.fieldCount += 1;
          signal.hasMessage = true;
          if (a.has("required") || a.get("aria-required") === "true") signal.requiredCount += 1;
        } else if (node.tagName === "select") {
          signal.fieldCount += 1;
          if (a.has("required") || a.get("aria-required") === "true") signal.requiredCount += 1;
        } else if (node.tagName === "button" && ["submit", "text"].includes(type)) {
          // A button inside a form submits it unless its type says otherwise.
          signal.hasSubmit = true;
        }
      }
      if ("childNodes" in node) for (const child of node.childNodes) walk(child);
    };
    walk(form);
    return signal;
  }

  function visit(node: Node, hidden: boolean): void {
    if ("tagName" in node) {
      const tag = node.tagName;
      const map = attrs(node);
      if (tag === "meta") {
        const name = (map.get("name") ?? map.get("property") ?? "").toLowerCase();
        if (name === "viewport" && signals.viewport === null) signals.viewport = map.get("content") ?? "";
        if (name === "og:site_name" && !signals.ogSiteName) signals.ogSiteName = clean(map.get("content") ?? "") || null;
        if (name === "author" && map.get("content")) signals.hasAuthorMarkup = true;
        return;
      }
      if (tag === "script") {
        const type = (map.get("type") ?? "").toLowerCase();
        const body = textOf(node);
        if (type === "application/ld+json") {
          try { collectEntities(JSON.parse(body), signals.entities, schemaTypes); } catch { /* invalid JSON-LD is reported by the structured-data check */ }
        } else {
          scriptSources.push(map.get("src") ?? "", body.slice(0, 20_000));
          noteLeadTool(map.get("src"));
        }
        return;
      }
      if (tag === "noscript") {
        scriptSources.push(textOf(node).slice(0, 5_000));
        return;
      }
      if (tag === "iframe") {
        noteLeadTool(map.get("src") ?? map.get("data-src"));
        return;
      }
      if (["style", "template", "svg"].includes(tag)) return;
      // The head is traversed for metadata and tags, but is never visible text.
      const nowHidden = hidden || tag === "head" || isHidden(map);
      if (tag === "form") signals.forms.push(readForm(node));
      if (tag === "time") signals.hasTimeElement = true;
      if ((map.get("rel") ?? "").toLowerCase().split(/\s+/).includes("author") || /\bauthor\b|\bbyline\b/.test((map.get("class") ?? "").toLowerCase()) || (map.get("itemprop") ?? "").toLowerCase() === "author") signals.hasAuthorMarkup = true;
      if (tag === "a") {
        const href = (map.get("href") ?? "").trim();
        const lower = href.toLowerCase();
        if (lower.startsWith("tel:")) signals.telLinks.push(href.slice(4).trim());
        else if (lower.startsWith("mailto:")) signals.mailtoLinks.push(href.slice(7).split("?")[0].trim().toLowerCase());
        else if (href) {
          const profile = classifyExternalProfile(href, pageUrl);
          if (profile && !profiles.has(profile.platform)) profiles.set(profile.platform, profile);
        }
      }
      if (/^h[1-6]$/.test(tag) && !nowHidden) {
        const heading = clean(textOf(node)).slice(0, 200);
        if (heading) {
          signals.headingTexts.push(heading);
          if (heading.endsWith("?")) signals.questionHeadings.push(heading);
        }
      }
      for (const child of node.childNodes) visit(child, nowHidden);
      return;
    }
    if (node.nodeName === "#text" && "value" in node && !hidden) visible.push(node.value);
    if ("childNodes" in node) for (const child of node.childNodes) visit(child, hidden);
  }
  visit(parse(html), false);

  const text = clean(visible.join(" "));
  signals.wordCount = text ? text.split(" ").length : 0;
  signals.schemaTypes = [...schemaTypes];
  signals.embeddedLeadTools = [...tools];
  for (const entity of signals.entities) {
    for (const link of entity.sameAs) {
      const profile = classifyExternalProfile(link, pageUrl);
      if (profile && !profiles.has(profile.platform)) profiles.set(profile.platform, profile);
    }
  }
  signals.externalProfiles = [...profiles.values()];

  const scripts = scriptSources.join("\n");
  signals.measurementTags = measurementPatterns.filter(([pattern]) => pattern.test(scripts)).map(([, name]) => name);
  signals.pageviewOnlyTags = pageviewOnlyPatterns.filter(([pattern]) => pattern.test(scripts)).map(([, name]) => name);

  const phones = new Set<string>();
  for (const link of signals.telLinks) { const phone = normalizePhone(link); if (phone) phones.add(phone); }
  for (const match of text.matchAll(/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g)) { const phone = normalizePhone(match[0]); if (phone) phones.add(phone); }
  signals.phones = [...phones].slice(0, 20);

  const locations = new Set<string>();
  for (const match of text.matchAll(locationPattern)) {
    const state = usStateNames[match[2].toLowerCase()] ?? match[2];
    locations.add(`${match[1]}, ${state}`);
    if (locations.size >= 25) break;
  }
  signals.locationMentions = [...locations];
  return signals;
}
