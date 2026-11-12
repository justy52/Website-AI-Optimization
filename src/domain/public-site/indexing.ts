/**
 * Search-engine indexing rules for the public marketing pages. Only the
 * production deployment on its configured public origin may be indexed;
 * previews and local runs always ask crawlers to stay out.
 */

export const publicIndexablePaths = ["/", "/privacy", "/audit-terms", "/refunds"] as const;

// Signed-in operator areas and machine endpoints are never useful to a crawler.
export const publicDisallowedPaths = ["/api/", "/dashboard", "/login", "/workspace-setup", "/qa/", "/service-payment/"] as const;

export function publicSiteOrigin(source: Record<string, string | undefined> = process.env): string | null {
  if (source.APP_ENV !== "production") return null;
  const configured = source.PUBLIC_INTAKE_ORIGIN ?? source.BETTER_AUTH_URL;
  if (!configured) return null;
  try {
    const url = new URL(configured);
    return url.protocol === "https:" && url.origin === configured.replace(/\/$/, "") ? url.origin : null;
  } catch {
    return null;
  }
}
