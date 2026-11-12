import { describe, expect, it, vi } from "vitest";

import type { SafeFetchResult } from "@/security/safe-fetch";

import { collectBacklinkEvidence, normalizeBacklinkTarget, type BacklinkEvidence } from "./backlinks";
import { evaluatePhase1Checks, type CollectedWebsiteEvidence } from "./execution";
import { analyzeHtml } from "./page-analysis";

const credentials = { login: "login@example.com", password: "private-password" };

function provider(items: Array<Record<string, unknown>>, overrides: Record<string, unknown> = {}) {
  const calls: Array<{ url: string; body: unknown; headers: Record<string, string> }> = [];
  const fn = vi.fn(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: init?.headers as Record<string, string> });
    return new Response(JSON.stringify({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ items }] }], ...overrides }), { status: 200 });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

describe("referring-domain evidence", () => {
  it("accepts only bare public hostnames as targets", () => {
    expect(normalizeBacklinkTarget("https://www.Example.com/path?x=1")).toBe("example.com");
    expect(normalizeBacklinkTarget("shop.example.co.uk")).toBe("shop.example.co.uk");
    for (const bad of ["", "localhost", "10.0.0.1", "not a domain", "https://user:pw@", "example"]) expect(normalizeBacklinkTarget(bad)).toBeNull();
  });

  it("sends only domains, prefers root-domain counts, and computes a competitor median", async () => {
    const io = provider([
      { target: "example.com", referring_domains: 60, referring_main_domains: 40 },
      { target: "rival-a.com", referring_main_domains: 20 },
      { target: "rival-b.com", referring_main_domains: 80 },
      { target: "rival-c.com", referring_domains: 50 },
    ]);
    const evidence = await collectBacklinkEvidence({ siteDomain: "www.example.com", competitorDomains: ["https://rival-a.com/", "rival-b.com", "rival-c.com", "example.com", "rival-a.com"], competitorSource: "configured" }, credentials, io.fn);
    expect(evidence).toMatchObject({ provider: "DataForSEO", referringDomains: 40, competitorMedian: 50, competitorSource: "configured" });
    expect(evidence?.competitors).toHaveLength(3);
    expect(io.calls[0].url).toBe("https://api.dataforseo.com/v3/backlinks/bulk_referring_domains/live");
    expect(io.calls[0].body).toEqual([{ targets: ["example.com", "rival-a.com", "rival-b.com", "rival-c.com"] }]);
    expect(io.calls[0].headers.Authorization).toMatch(/^Basic /);
    expect(JSON.stringify(io.calls[0].body)).not.toMatch(/private-password|login@example/);
  });

  it("withholds a median for fewer than three competitors and a figure the provider did not report", async () => {
    const two = await collectBacklinkEvidence({ siteDomain: "example.com", competitorDomains: ["rival-a.com", "rival-b.com"], competitorSource: "google_listings" }, credentials,
      provider([{ target: "example.com", referring_main_domains: 12 }, { target: "rival-a.com", referring_main_domains: 5 }, { target: "rival-b.com", referring_main_domains: 9 }]).fn);
    expect(two).toMatchObject({ referringDomains: 12, competitorMedian: null });
    const missing = await collectBacklinkEvidence({ siteDomain: "example.com", competitorDomains: [], competitorSource: "none" }, credentials, provider([{ target: "example.com", referring_main_domains: "12" }]).fn);
    expect(missing).toMatchObject({ referringDomains: null, competitorSource: "none" });
  });

  it("names rejected credentials and provider errors without logging secrets or domains", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const input = { siteDomain: "example.com", competitorDomains: [], competitorSource: "none" as const };
      expect(await collectBacklinkEvidence(input, credentials, (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch)).toBeNull();
      expect(await collectBacklinkEvidence(input, credentials, provider([], { status_code: 40100 }).fn)).toBeNull();
      expect(await collectBacklinkEvidence(input, credentials, (async () => { throw new Error("private-password example.com"); }) as unknown as typeof fetch)).toBeNull();
      expect(warn.mock.calls.map((call) => (call[1] as { reason: string }).reason)).toEqual(["credentials_rejected", "credentials_rejected", "request_or_parse_error"]);
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/private-password|example\.com|login@/);
    } finally { warn.mockRestore(); }
  });
});

describe("auth.referring_domains rule", () => {
  const html = '<html><head><title>Example Roofing</title><meta name="viewport" content="width=device-width"></head><body><h1>Example Roofing</h1><p>Roof repair.</p></body></html>';
  const fetched = (finalUrl: string, bodyText: string): SafeFetchResult => ({ requestedUrl: finalUrl, finalUrl, status: 200, headers: { "content-type": "text/html" }, bodyText, contentHash: "0".repeat(64), redirects: [] });
  const collected = (backlinks: BacklinkEvidence | null, configured = true): CollectedWebsiteEvidence => ({
    canonicalUrl: "https://example.com/", page: fetched("https://example.com/", html), robots: null, sitemap: null, collectionError: null,
    pageAnalysis: analyzeHtml(html), backlinks, backlinksConfigured: configured,
  });
  const evidence = (overrides: Partial<BacklinkEvidence> = {}): BacklinkEvidence => ({
    provider: "DataForSEO", fetchedAt: "2026-11-12T00:00:00.000Z", referringDomains: 40, competitorSource: "configured", competitorMedian: 50,
    competitors: [20, 50, 80].map((referringDomains, index) => ({ domain: `rival-${index}.com`, referringDomains })), ...overrides,
  });
  const result = (input: CollectedWebsiteEvidence) => evaluatePhase1Checks(input).checkResults.find((check) => check.checkKey === "auth.referring_domains")!;

  it("applies the Doc 26 thresholds against the competitor median", () => {
    expect(result(collected(evidence()))).toMatchObject({ status: "PASS", evidenceConfidence: "HIGH", evidenceRefs: ["backlinks"] });
    expect(result(collected(evidence({ referringDomains: 37 }))).status).toBe("WARNING");
    expect(result(collected(evidence({ referringDomains: 13 }))).status).toBe("WARNING");
    expect(result(collected(evidence({ referringDomains: 12 }))).status).toBe("FAIL");
    expect(result(collected(evidence({ referringDomains: 0 }))).status).toBe("FAIL");
    expect(result(collected(evidence({ competitorSource: "google_listings" }))).evidenceConfidence).toBe("MEDIUM");
  });

  it("stays unavailable rather than guessing without a provider, a figure, or a comparison set", () => {
    expect(result(collected(null, false))).toMatchObject({ status: "UNAVAILABLE", evidenceRefs: [] });
    expect(result(collected(null, true)).reason).toContain("did not return a usable response");
    expect(result(collected(evidence({ referringDomains: null }))).status).toBe("UNAVAILABLE");
    const noMedian = result(collected(evidence({ competitorMedian: null, competitors: [] })));
    expect(noMedian.status).toBe("UNAVAILABLE");
    expect(noMedian.reason).toContain("40 referring domains");
  });

  it("stores the provider figures as audit evidence", () => {
    const audit = evaluatePhase1Checks(collected(evidence()));
    expect(audit.evidence.find((item) => item.id === "backlinks")?.metadata).toMatchObject({ provider: "DataForSEO", referringDomains: 40, competitorMedian: 50, competitorsCompared: 3 });
  });
});
