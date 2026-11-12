import { safeFetchText, type SafeFetchOptions, type SafeFetchResult } from "@/security/safe-fetch";

import { analyzeHtml, type PageAnalysis } from "./page-analysis";
import { analyzeSignals, type PageSignals } from "./site-signals";

/**
 * A small, bounded sample of same-site pages. This is not a full crawl: it
 * follows links found on the homepage (and, when those are sparse, the XML
 * sitemap), stays on the approved host, and honours robots.txt for "*".
 */

export type SampledPageKind =
  | "contact" | "about" | "services" | "locations" | "faq" | "reviews" | "blog" | "legal" | "other";

export type SampledPage = {
  url: string;
  kind: SampledPageKind;
  linkText: string;
  status: number | null;
  error: string | null;
  contentHash: string | null;
  analysis: PageAnalysis | null;
  signals: PageSignals | null;
};

export type CrawlSummary = {
  candidateCount: number;
  attempted: number;
  fetched: number;
  skippedByRobots: number;
  source: "homepage_links" | "homepage_links_and_sitemap";
};

export const MAX_SAMPLED_PAGES = 10;

const kindPatterns: Array<[SampledPageKind, RegExp]> = [
  ["contact", /contact|get-?in-?touch|quote|estimate|book|schedul|appointment|request|consult/],
  ["legal", /privacy|terms|legal|polic(?:y|ies)|disclaimer|refund|cookie|accessibility/],
  ["faq", /faq|frequently|questions|help-?center/],
  ["reviews", /review|testimonial|case-?stud|success-?stor|portfolio|gallery|our-?work|projects/],
  ["locations", /location|service-?area|areas?-?(?:we-?)?serve|cities|near-?me|where-?we/],
  ["about", /about|our-?story|our-?team|team|who-?we-?are|company|meet/],
  ["blog", /blog|news|article|resource|guide|learn|insight|tips|journal/],
  ["services", /service|what-?we-?do|solution|product|pricing|plans?|offer|treatment|practice-?area|speciali/],
];

// How many pages of each kind are worth one of the ten sample slots.
const quota: Record<SampledPageKind, number> = {
  contact: 1, about: 1, services: 3, locations: 2, faq: 1, reviews: 1, blog: 1, legal: 1, other: 2,
};

const skippedPath = /\.(?:pdf|jpe?g|png|gif|webp|svg|ico|css|js|json|xml|zip|mp4|mp3|docx?|xlsx?|pptx?)$|^\/(?:wp-admin|wp-login|wp-json|cart|checkout|account|my-account|login|log-in|signin|sign-in|signup|sign-up|register|dashboard|admin|portal|search|feed|cdn-cgi|api)(?:\/|$)|\/(?:tag|author|page)\/\d*/i;

export function classifyPage(pathname: string, linkText: string): SampledPageKind {
  const path = pathname.toLowerCase().replace(/[\s_]+/g, "-");
  for (const [kind, pattern] of kindPatterns) if (pattern.test(path)) return kind;
  // Link text is noisy ("Learn more"), so only a short navigation label counts.
  const label = linkText.toLowerCase().replace(/[^a-z ]+/g, " ").trim().replace(/\s+/g, "-");
  if (label && label.split("-").length <= 3) {
    for (const [kind, pattern] of kindPatterns) if (new RegExp(`^(?:our-)?(?:${pattern.source})(?:-us|s)?$`).test(label)) return kind;
  }
  return "other";
}

/** Longest-match robots.txt evaluation for one path and the "*" group. */
export function robotsAllowsPath(robotsTxt: string | null | undefined, path: string): boolean {
  if (!robotsTxt) return true;
  const rules: Array<{ allow: boolean; path: string }> = [];
  let agents: string[] = [];
  let inRules = false;
  for (const raw of robotsTxt.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      if (inRules) { agents = []; inRules = false; }
      agents.push(value.toLowerCase());
    } else if (key === "allow" || key === "disallow") {
      inRules = true;
      if (value && agents.includes("*")) rules.push({ allow: key === "allow", path: value });
    }
  }
  let best: { allow: boolean; length: number } | null = null;
  for (const rule of rules) {
    // Bound pattern size and wildcard count: robots.txt is untrusted input.
    if (!rule.path.startsWith("/") || rule.path.length > 500 || rule.path.split("*").length > 5) continue;
    const anchored = rule.path.endsWith("$");
    const body = anchored ? rule.path.slice(0, -1) : rule.path;
    const pattern = new RegExp(`^${body.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}${anchored ? "$" : ""}`);
    if (!pattern.test(path)) continue;
    if (!best || rule.path.length > best.length || (rule.path.length === best.length && rule.allow)) best = { allow: rule.allow, length: rule.path.length };
  }
  return best ? best.allow : true;
}

export type CrawlCandidate = { url: string; kind: SampledPageKind; linkText: string };

export function selectSamplePages(
  homepageUrl: string,
  anchors: Array<{ href: string; text: string }>,
  sitemapXml: string | null | undefined,
  isAllowedHost: (hostname: string) => boolean,
): { candidates: CrawlCandidate[]; candidateCount: number; usedSitemap: boolean } {
  const home = new URL(homepageUrl);
  const seen = new Map<string, CrawlCandidate>();
  const add = (href: string, text: string) => {
    let url: URL;
    try { url = new URL(href, home); } catch { return; }
    if (url.protocol !== home.protocol || !isAllowedHost(url.hostname)) return;
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === (home.pathname.replace(/\/+$/, "") || "/") || skippedPath.test(path) || path.length > 200) return;
    // Paths only: never carry a query string or fragment into a request.
    const key = path.toLowerCase();
    if (!seen.has(key)) seen.set(key, { url: `${home.origin}${url.pathname}`, kind: classifyPage(path, text), linkText: text.slice(0, 120) });
  };
  for (const anchor of anchors) add(anchor.href, anchor.text);
  let usedSitemap = false;
  if (seen.size < MAX_SAMPLED_PAGES && sitemapXml) {
    const before = seen.size;
    for (const match of sitemapXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
      if (seen.size >= 200) break;
      if (!/\.xml(?:\.gz)?$/i.test(match[1])) add(match[1].replace(/&amp;/g, "&"), "");
    }
    usedSitemap = seen.size > before;
  }
  const all = [...seen.values()];
  const used: Record<string, number> = {};
  const chosen: CrawlCandidate[] = [];
  // Shallow pages first: they are the ones a visitor reaches from the homepage.
  const ordered = [...all].sort((a, b) => new URL(a.url).pathname.split("/").length - new URL(b.url).pathname.split("/").length);
  for (const candidate of ordered) {
    if (chosen.length >= MAX_SAMPLED_PAGES) break;
    const count = used[candidate.kind] ?? 0;
    if (count >= quota[candidate.kind]) continue;
    used[candidate.kind] = count + 1;
    chosen.push(candidate);
  }
  return { candidates: chosen, candidateCount: all.length, usedSitemap };
}

export async function fetchSamplePages(
  candidates: CrawlCandidate[],
  robotsTxt: string | null | undefined,
  fetchOptions: SafeFetchOptions,
  concurrency = 5,
): Promise<{ pages: SampledPage[]; skippedByRobots: number }> {
  const allowed = candidates.filter((candidate) => robotsAllowsPath(robotsTxt, new URL(candidate.url).pathname));
  const pages: SampledPage[] = new Array(allowed.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next++;
      if (index >= allowed.length) return;
      const candidate = allowed[index];
      let response: SafeFetchResult | null = null;
      let error: string | null = null;
      try {
        response = await safeFetchText(candidate.url, { ...fetchOptions, maxBytes: 2_000_000, allowTruncated: true, timeoutMs: 6_000 });
      } catch (caught) {
        error = caught instanceof Error ? caught.name === "SafeFetchError" ? caught.message : "Request failed." : "Request failed.";
      }
      const isHtml = response ? /html/i.test(response.headers["content-type"] ?? "text/html") : false;
      const ok = Boolean(response && response.status >= 200 && response.status < 300 && isHtml);
      pages[index] = {
        url: response?.finalUrl ?? candidate.url,
        kind: candidate.kind,
        linkText: candidate.linkText,
        status: response?.status ?? null,
        error,
        contentHash: response?.contentHash ?? null,
        analysis: ok && response ? analyzeHtml(response.bodyText) : null,
        signals: ok && response ? analyzeSignals(response.bodyText, response.finalUrl) : null,
      };
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, allowed.length) }, worker));
  // A link that redirects to a sign-in or account page is not public content.
  const publicPages = pages.filter((page) => { try { return !skippedPath.test(new URL(page.url).pathname.replace(/\/+$/, "") || "/"); } catch { return true; } });
  return { pages: publicPages, skippedByRobots: candidates.length - allowed.length };
}
