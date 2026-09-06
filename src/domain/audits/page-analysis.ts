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

function attribute(tag: string, name: string): string | null {
  const match = tag.match(
    new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
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
  const withoutScripts = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");

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
    visibleText: stripTags(withoutScripts),
  };
}

export function robotsTxtBlocksAll(robotsTxt: string | null | undefined): boolean {
  if (!robotsTxt) return false;

  const lines = robotsTxt
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim().toLowerCase())
    .filter(Boolean);
  let appliesToAll = false;

  for (const line of lines) {
    const [rawKey, ...rawValue] = line.split(":");
    const key = rawKey?.trim();
    const value = rawValue.join(":").trim();

    if (key === "user-agent") {
      appliesToAll = value === "*";
    }

    if (appliesToAll && key === "disallow" && value === "/") {
      return true;
    }
  }

  return false;
}

export function firstSitemapUrl(robotsTxt: string | null | undefined): string | null {
  if (!robotsTxt) return null;

  const match = robotsTxt.match(/^sitemap:\s*(\S+)/im);
  return match?.[1] ?? null;
}
