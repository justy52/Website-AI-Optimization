import { parse, type DefaultTreeAdapterTypes } from "parse5";

export type StructuredDataItem = {
  types: string[];
  valid: boolean;
};

export type PageAnalysis = {
  title: string | null;
  metaDescription: string | null;
  robotsDirectives: string[];
  canonicalUrls: string[];
  h1: string[];
  h2: string[];
  anchors: { href: string; text: string }[];
  buttons: string[];
  structuredData: StructuredDataItem[];
  visibleText: string;
};

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " "));
}

// This is a conservative static HTML approximation, not browser-rendered text.
// In particular, metadata, comments and markup explicitly hidden from users
// must not make verified business facts appear on the page.
function extractPageText(html: string): string {
  const excluded = new Set(["head", "script", "style", "template", "noscript", "svg"]);
  const parts: string[] = [];
  function visit(node: DefaultTreeAdapterTypes.Node): void {
    if ("tagName" in node) {
      if (excluded.has(node.tagName)) return;
      const attrs = new Map(node.attrs.map((attr) => [attr.name.toLowerCase(), attr.value]));
      if (attrs.has("hidden") || attrs.get("aria-hidden")?.trim().toLowerCase() === "true") return;
      const style = attrs.get("style")?.toLowerCase() ?? "";
      if (/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))\s*(?:!important\s*)?(?:;|$)/.test(style)) return;
    }
    if (node.nodeName === "#text" && "value" in node) parts.push(node.value);
    if ("childNodes" in node) for (const child of node.childNodes) visit(child);
  }
  visit(parse(html));
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function attribute(tag: string, name: string): string | null {
  const match = tag.match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );

  return match ? decodeHtml(match[2] ?? match[3] ?? match[4] ?? "") : null;
}

function findTags(html: string, tagName: string): string[] {
  return Array.from(html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi"))).map(
    (match) => match[0],
  );
}

function findPairedTags(html: string, tagName: string): string[] {
  return Array.from(
    html.matchAll(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi")),
  ).map((match) => match[1] ?? "");
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = match ? stripTags(match[1] ?? "") : "";
  return title || null;
}

function extractMeta(html: string, name: string): string | null {
  for (const tag of findTags(html, "meta")) {
    const tagName = attribute(tag, "name")?.toLowerCase();
    const property = attribute(tag, "property")?.toLowerCase();

    if (tagName === name || property === name) {
      const content = attribute(tag, "content");
      return content || null;
    }
  }

  return null;
}

function extractCanonicals(html: string): string[] {
  return findTags(html, "link").flatMap((tag) => {
    const rel = attribute(tag, "rel")?.toLowerCase() ?? "";

    if (!rel.split(/\s+/).includes("canonical")) {
      return [];
    }

    const href = attribute(tag, "href");
    return href ? [href] : [];
  });
}

function extractAnchors(html: string) {
  return Array.from(
    html.matchAll(/<a\b[^>]*href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi),
  ).map((match) => ({
    href: decodeHtml(match[2] ?? match[3] ?? match[4] ?? ""),
    text: stripTags(match[5] ?? ""),
  }));
}

function collectJsonLdTypes(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];

  if (Array.isArray(value)) {
    return value.flatMap(collectJsonLdTypes);
  }

  const record = value as Record<string, unknown>;
  const ownTypes = Array.isArray(record["@type"])
    ? record["@type"].filter((item): item is string => typeof item === "string")
    : typeof record["@type"] === "string"
      ? [record["@type"]]
      : [];
  const graphTypes = collectJsonLdTypes(record["@graph"]);

  return [...ownTypes, ...graphTypes];
}

function extractStructuredData(html: string): StructuredDataItem[] {
  return Array.from(
    html.matchAll(
      /<script\b[^>]*type\s*=\s*("application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ).map((match) => {
    try {
      const parsed = JSON.parse(match[2] ?? "");
      return { types: collectJsonLdTypes(parsed), valid: true };
    } catch {
      return { types: [], valid: false };
    }
  });
}

export function analyzeHtml(html: string): PageAnalysis {
  return {
    title: extractTitle(html),
    metaDescription: extractMeta(html, "description"),
    robotsDirectives: [extractMeta(html, "robots"), extractMeta(html, "googlebot")]
      .filter((value): value is string => Boolean(value))
      .flatMap((value) => value.toLowerCase().split(",").map((item) => item.trim())),
    canonicalUrls: extractCanonicals(html),
    h1: findPairedTags(html, "h1").map(stripTags).filter(Boolean),
    h2: findPairedTags(html, "h2").map(stripTags).filter(Boolean),
    anchors: extractAnchors(html),
    buttons: findPairedTags(html, "button").map(stripTags).filter(Boolean),
    structuredData: extractStructuredData(html),
    visibleText: extractPageText(html),
  };
}

export function robotsTxtBlocksAll(robotsTxt: string | null | undefined): boolean {
  if (!robotsTxt) return false;

  const lines = robotsTxt
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim().toLowerCase())
    .filter(Boolean);
  let agents: string[] = [];
  let hasRules = false;
  let disallowsRoot = false;
  let hasAllow = false;

  const groupBlocksAll = () => agents.includes("*") && disallowsRoot && !hasAllow;

  for (const line of lines) {
    const [rawKey, ...rawValue] = line.split(":");
    const key = rawKey?.trim();
    const value = rawValue.join(":").trim();

    if (key === "user-agent") {
      if (hasRules) {
        if (groupBlocksAll()) return true;
        agents = [];
        hasRules = false;
        disallowsRoot = false;
        hasAllow = false;
      }
      agents.push(value);
    } else if (key === "disallow" || key === "allow") {
      hasRules = true;
      if (key === "disallow" && value === "/") disallowsRoot = true;
      if (key === "allow" && value) hasAllow = true;
    }
  }

  return groupBlocksAll();
}

/** Check a named crawler's rules for the root URL, not the whole site. */
export function robotsTxtBlocksHomepage(robotsTxt: string | null | undefined, crawler: "googlebot" | "oai-searchbot"): boolean {
  if (!robotsTxt) return false;
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let agents: string[] = [];
  let rules: Array<{ allow: boolean; path: string }> = [];
  let startedRules = false;
  const flush = () => { if (agents.length) groups.push({ agents, rules }); agents = []; rules = []; startedRules = false; };
  for (const raw of robotsTxt.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      if (startedRules) flush();
      agents.push(value.toLowerCase());
    } else if (key === "allow" || key === "disallow") {
      startedRules = true;
      if (value) rules.push({ allow: key === "allow", path: value });
    }
  }
  flush();
  const isCrawler = (agent: string) => agent === crawler || agent.startsWith(`${crawler}/`) || agent.startsWith(`${crawler}*`);
  const hasSpecific = groups.some(group => group.agents.some(isCrawler));
  const applicable = groups.filter(group => hasSpecific ? group.agents.some(isCrawler) : group.agents.includes("*"));
  const matches = applicable.flatMap(group => group.rules).filter(rule => {
    // The audited URL path is exactly '/'. Only '/', '*' and a final '$'
    // can match it; other literal characters require a longer path.
    if (!rule.path.startsWith("/")) return false;
    return /^\/\**\$?$/.test(rule.path);
  });
  if (!matches.length) return false;
  const longest = Math.max(...matches.map(rule => rule.path.length));
  return !matches.some(rule => rule.path.length === longest && rule.allow);
}

export function robotsTxtBlocksGooglebotHomepage(robotsTxt: string | null | undefined): boolean {
  return robotsTxtBlocksHomepage(robotsTxt, "googlebot");
}

export function firstSitemapUrl(robotsTxt: string | null | undefined): string | null {
  if (!robotsTxt) return null;

  const match = robotsTxt.match(/^sitemap:\s*(\S+)/im);
  return match?.[1] ?? null;
}
