/**
 * Optional, read-only referring-domain counts from DataForSEO's Backlinks API
 * (bulk referring domains). Used only when DATAFORSEO_LOGIN and
 * DATAFORSEO_PASSWORD are configured. Only public domain names are sent.
 * A missing or malformed figure stays unavailable; nothing is estimated.
 */

export type BacklinkEvidence = {
  provider: "DataForSEO";
  fetchedAt: string;
  /** Referring root domains for the audited site, or null when not reported. */
  referringDomains: number | null;
  competitors: Array<{ domain: string; referringDomains: number }>;
  competitorSource: "configured" | "google_listings" | "none";
  competitorMedian: number | null;
  /** Domains sent in the one bulk request, for usage reporting. */
  targets: number;
};

export type BacklinkCredentials = { login: string; password: string };

const endpoint = "https://api.dataforseo.com/v3/backlinks/bulk_referring_domains/live";
export const MAX_BACKLINK_COMPETITORS = 10;

/** A bare registrable-looking host: no scheme, path, port or credentials. */
export function normalizeBacklinkTarget(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  return /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ? host : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export async function collectBacklinkEvidence(
  input: { siteDomain: string; competitorDomains: string[]; competitorSource: BacklinkEvidence["competitorSource"] },
  credentials: BacklinkCredentials,
  transport: typeof fetch = fetch,
): Promise<BacklinkEvidence | null> {
  const unavailable = (reason: string, status?: number) => {
    // A bounded category only: never log domains, provider bodies or credentials.
    console.warn("backlink_lookup_unavailable", { reason, ...(status === undefined ? {} : { status }) });
    return null;
  };
  const site = normalizeBacklinkTarget(input.siteDomain);
  if (!site) return unavailable("unsupported_domain");
  const competitors = [...new Set(input.competitorDomains.map(normalizeBacklinkTarget).filter((domain): domain is string => domain !== null && domain !== site))].slice(0, MAX_BACKLINK_COMPETITORS);

  try {
    const response = await transport(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${credentials.login}:${credentials.password}`).toString("base64")}`,
      },
      body: JSON.stringify([{ targets: [site, ...competitors] }]),
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 401 || response.status === 403) return unavailable("credentials_rejected", response.status);
    if (response.status === 402) return unavailable("payment_required", response.status);
    if (!response.ok) return unavailable("provider_http", response.status);
    const text = await response.text();
    if (text.length > 1_000_000) return unavailable("response_too_large");
    const body = JSON.parse(text) as { status_code?: unknown; tasks?: Array<{ status_code?: unknown; result?: unknown }> };
    const task = body.tasks?.[0];
    // DataForSEO reports success as 20000 inside a 200 response.
    if (body.status_code !== 20000 || task?.status_code !== 20000) {
      // Report whichever level actually failed.
      const failed = [body.status_code, task?.status_code].find((value) => typeof value === "number" && value !== 20000);
      const code = typeof failed === "number" ? failed : undefined;
      return unavailable(code === 40100 ? "credentials_rejected" : code === 40200 || code === 40210 ? "payment_required" : code === 40204 ? "subscription_required" : "provider_task_error", code);
    }
    const results = Array.isArray(task.result) ? task.result as Array<Record<string, unknown>> : [];
    const items = results.flatMap((result) => Array.isArray(result.items) ? result.items as Array<Record<string, unknown>> : "target" in result ? [result] : []);
    const byTarget = new Map<string, number>();
    for (const item of items) {
      const target = typeof item.target === "string" ? normalizeBacklinkTarget(item.target) : null;
      // Root domains are the comparable unit; fall back to all referring hosts.
      const value = count(item.referring_main_domains) ?? count(item.referring_domains);
      if (target && value !== null) byTarget.set(target, value);
    }
    const measured = competitors.flatMap((domain) => byTarget.has(domain) ? [{ domain, referringDomains: byTarget.get(domain)! }] : []);
    return {
      provider: "DataForSEO",
      fetchedAt: new Date().toISOString(),
      referringDomains: byTarget.get(site) ?? null,
      competitors: measured,
      competitorSource: measured.length ? input.competitorSource : "none",
      // A median of fewer than three domains is not a usable comparison set.
      competitorMedian: measured.length >= 3 ? median(measured.map((item) => item.referringDomains)) : null,
      targets: 1 + competitors.length,
    };
  } catch (error) {
    return unavailable(error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name) ? "timeout" : "request_or_parse_error");
  }
}
