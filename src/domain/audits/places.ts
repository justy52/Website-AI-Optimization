import { normalizePhone } from "./site-signals";

/**
 * Optional, read-only Google Places (New) lookup for the audited business and
 * nearby same-category listings. It is used only when GOOGLE_PLACES_API_KEY is
 * configured. Only the public business name and locality are sent. Missing or
 * ambiguous data stays unavailable; nothing is guessed.
 */

export type PlaceListing = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  websiteHost: string | null;
  rating: number | null;
  reviewCount: number | null;
  primaryType: string | null;
  primaryTypeLabel: string | null;
  types: string[];
  operational: boolean;
  latestReviewAt: string | null;
};

export type PlacesEvidence = {
  query: string;
  fetchedAt: string;
  candidateCount: number;
  /** How the audited business was tied to a listing; null when none matched. */
  matchBasis: "website" | "phone" | "name" | null;
  listing: PlaceListing | null;
  competitors: Array<{ name: string; reviewCount: number; websiteHost?: string | null }>;
  competitorMedianReviews: number | null;
};

type RawPlace = {
  id?: unknown;
  displayName?: { text?: unknown };
  formattedAddress?: unknown;
  nationalPhoneNumber?: unknown;
  websiteUri?: unknown;
  rating?: unknown;
  userRatingCount?: unknown;
  primaryType?: unknown;
  primaryTypeDisplayName?: { text?: unknown };
  types?: unknown;
  businessStatus?: unknown;
  reviews?: Array<{ publishTime?: unknown }>;
};

const endpoint = "https://places.googleapis.com/v1/places:searchText";
const listingFields = "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.primaryType,places.primaryTypeDisplayName,places.types,places.businessStatus,places.reviews.publishTime";
const competitorFields = "places.id,places.displayName,places.websiteUri,places.userRatingCount,places.businessStatus";

function hostOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

export function normalizeBusinessName(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/&/g, " and ").replace(/\b(?:llc|inc|incorporated|co|corp|corporation|company|ltd|pllc|pc|the)\b/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function toListing(place: RawPlace): PlaceListing | null {
  const name = typeof place.displayName?.text === "string" ? place.displayName.text.slice(0, 200) : null;
  if (typeof place.id !== "string" || !name) return null;
  const times = (Array.isArray(place.reviews) ? place.reviews : [])
    .map((review) => typeof review.publishTime === "string" ? Date.parse(review.publishTime) : NaN)
    .filter((time) => Number.isFinite(time));
  return {
    id: place.id,
    name,
    address: typeof place.formattedAddress === "string" ? place.formattedAddress.slice(0, 300) : null,
    phone: typeof place.nationalPhoneNumber === "string" ? normalizePhone(place.nationalPhoneNumber) : null,
    websiteHost: hostOf(place.websiteUri),
    rating: typeof place.rating === "number" && Number.isFinite(place.rating) ? place.rating : null,
    reviewCount: typeof place.userRatingCount === "number" && Number.isSafeInteger(place.userRatingCount) && place.userRatingCount >= 0 ? place.userRatingCount : null,
    primaryType: typeof place.primaryType === "string" ? place.primaryType : null,
    primaryTypeLabel: typeof place.primaryTypeDisplayName?.text === "string" ? place.primaryTypeDisplayName.text.slice(0, 100) : null,
    types: Array.isArray(place.types) ? place.types.filter((type): type is string => typeof type === "string").slice(0, 30) : [],
    operational: place.businessStatus === undefined || place.businessStatus === "OPERATIONAL",
    latestReviewAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
  };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export async function collectPlacesEvidence(
  input: { businessName: string; locality: string | null; websiteHost: string; phones: string[] },
  apiKey: string,
  transport: typeof fetch = fetch,
): Promise<PlacesEvidence | null> {
  const unavailable = (reason: string, status?: number) => {
    // A bounded category only: never log the query, provider body or key.
    console.warn("places_lookup_unavailable", { reason, ...(status === undefined ? {} : { status }) });
    return null;
  };
  const name = input.businessName.replace(/\s+/g, " ").trim().slice(0, 120);
  if (name.length < 3) return unavailable("no_business_name");
  const locality = input.locality?.replace(/\s+/g, " ").trim().slice(0, 80) || null;
  const query = locality ? `${name} ${locality}` : name;

  const search = async (textQuery: string, fieldMask: string, pageSize: number): Promise<RawPlace[] | null> => {
    const response = await transport(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": fieldMask },
      body: JSON.stringify({ textQuery, pageSize }),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) { unavailable("provider_http", response.status); return null; }
    const text = await response.text();
    if (text.length > 1_000_000) { unavailable("response_too_large"); return null; }
    const body = JSON.parse(text) as { places?: unknown };
    return Array.isArray(body.places) ? body.places as RawPlace[] : [];
  };

  try {
    const raw = await search(query, listingFields, 5);
    if (raw === null) return null;
    const listings = raw.map(toListing).filter((item): item is PlaceListing => item !== null);
    const siteHost = input.websiteHost.toLowerCase().replace(/^www\./, "");
    const wanted = normalizeBusinessName(name);
    const byWebsite = listings.find((listing) => listing.websiteHost === siteHost);
    const byPhone = byWebsite ? undefined : listings.find((listing) => listing.phone && input.phones.includes(listing.phone));
    const byName = byWebsite || byPhone ? undefined : listings.find((listing) => {
      const found = normalizeBusinessName(listing.name);
      return found.length >= 3 && (found === wanted || found.includes(wanted) || wanted.includes(found));
    });
    const listing = byWebsite ?? byPhone ?? byName ?? null;
    const matchBasis = byWebsite ? "website" : byPhone ? "phone" : byName ? "name" : null;

    let competitors: PlacesEvidence["competitors"] = [];
    if (listing && locality && (listing.primaryTypeLabel || listing.primaryType)) {
      const category = listing.primaryTypeLabel ?? listing.primaryType!.replace(/_/g, " ");
      const rawCompetitors = await search(`${category} in ${locality}`, competitorFields, 10);
      competitors = (rawCompetitors ?? []).flatMap((place) => {
        const competitorName = typeof place.displayName?.text === "string" ? place.displayName.text.slice(0, 200) : null;
        const count = typeof place.userRatingCount === "number" && Number.isSafeInteger(place.userRatingCount) && place.userRatingCount >= 0 ? place.userRatingCount : null;
        const open = place.businessStatus === undefined || place.businessStatus === "OPERATIONAL";
        if (!competitorName || count === null || !open || place.id === listing.id || hostOf(place.websiteUri) === siteHost) return [];
        return [{ name: competitorName, reviewCount: count, websiteHost: hostOf(place.websiteUri) }];
      });
    }
    return {
      query,
      fetchedAt: new Date().toISOString(),
      candidateCount: listings.length,
      matchBasis,
      listing,
      competitors,
      // A median of fewer than three listings is not a usable comparison set.
      competitorMedianReviews: competitors.length >= 3 ? median(competitors.map((item) => item.reviewCount)) : null,
    };
  } catch (error) {
    return unavailable(error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name) ? "timeout" : "request_or_parse_error");
  }
}
