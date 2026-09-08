import { normalizeDomain } from "@/domain/websites/url";

export const GOOGLE_SEARCH_CONSOLE_PROVIDER = "google_search_console";
export const GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly";

export type SearchConsolePropertyType = "URL_PREFIX" | "DOMAIN" | "UNKNOWN";

export type SearchConsoleSiteEntry = {
  siteUrl: string;
  permissionLevel?: string;
};

export type SearchConsoleObservationInput = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

export type NormalizedSearchConsoleObservation = {
  query: string | null;
  page: string | null;
  clicks: number;
  impressions: number;
  ctrBasisPoints: number;
  averagePositionBasisPoints: number;
  completeness: "COMPLETE" | "PARTIAL";
};

export function propertyTypeForSiteUrl(siteUrl: string): SearchConsolePropertyType {
  if (siteUrl.startsWith("sc-domain:")) return "DOMAIN";

  try {
    const url = new URL(siteUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? "URL_PREFIX"
      : "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

export function searchConsolePropertyMatchesWebsite(
  propertyUrl: string,
  websiteDomain: string,
): boolean {
  const normalizedWebsiteDomain = normalizeDomain(websiteDomain);

  if (propertyUrl.startsWith("sc-domain:")) {
    const propertyDomain = propertyUrl
      .slice("sc-domain:".length)
      .toLowerCase()
      .replace(/\.$/, "")
      .replace(/^www\./, "");

    return (
      normalizedWebsiteDomain === propertyDomain ||
      normalizedWebsiteDomain.endsWith(`.${propertyDomain}`)
    );
  }

  try {
    return normalizeDomain(propertyUrl) === normalizedWebsiteDomain;
  } catch {
    return false;
  }
}

function clampBasisPoints(value: number, max?: number): number {
  const rounded = Math.round(value);
  const lowerBounded = Number.isFinite(rounded) && rounded > 0 ? rounded : 0;

  return typeof max === "number" ? Math.min(lowerBounded, max) : lowerBounded;
}

export function normalizeSearchConsoleRow(
  row: SearchConsoleObservationInput,
): NormalizedSearchConsoleObservation {
  const keys = row.keys ?? [];
  const clicks = Math.max(0, Math.round(row.clicks ?? 0));
  const impressions = Math.max(0, Math.round(row.impressions ?? 0));
  const ctrBasisPoints = clampBasisPoints((row.ctr ?? 0) * 10_000, 10_000);
  const averagePositionBasisPoints = clampBasisPoints((row.position ?? 0) * 100);

  return {
    query: keys[0] ?? null,
    page: keys[1] ?? null,
    clicks,
    impressions,
    ctrBasisPoints,
    averagePositionBasisPoints,
    completeness:
      typeof row.clicks === "number" &&
      typeof row.impressions === "number" &&
      typeof row.ctr === "number" &&
      typeof row.position === "number"
        ? "COMPLETE"
        : "PARTIAL",
  };
}
