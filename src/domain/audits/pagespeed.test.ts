import { describe, expect, it, vi } from "vitest";
import { collectMobileLabEvidence } from "./pagespeed";

const valid = { lighthouseResult: { requestedUrl: "https://example.com/", finalDisplayedUrl: "https://example.com/", lighthouseVersion: "13.6.0", audits: { "largest-contentful-paint": { numericValue: 4400, scoreDisplayMode: "numeric" }, "cumulative-layout-shift": { numericValue: 0.002, scoreDisplayMode: "numeric" } } } };
describe("public mobile lab collection", () => {
  it("sends only a public root URL and returns labeled lab metrics", async () => {
    const transport = vi.fn(async () => new Response(JSON.stringify(valid), { status: 200 }));
    const result = await collectMobileLabEvidence("https://example.com/", "test-key", transport as typeof fetch);
    expect(result).toMatchObject({ requestedUrl: "https://example.com/", lcpMs: 4400, cls: 0.002, lighthouseVersion: "13.6.0" });
    const [url, options] = transport.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get("url")).toBe("https://example.com/");
    expect(url.toString()).not.toContain("test-key");
    expect(options.headers).toMatchObject({ "X-Goog-Api-Key": "test-key" });
  });
  it("never transmits a URL with a private path, query, or credentials", async () => {
    const transport = vi.fn();
    for (const url of ["https://example.com/private", "https://example.com/?token=x", "https://user:secret@example.com/", "http://example.com/"]) expect(await collectMobileLabEvidence(url, "test-key", transport)).toBeNull();
    expect(transport).not.toHaveBeenCalled();
  });
  it("treats quota failures, malformed responses, and mismatched origins as unavailable", async () => {
    const failure = vi.fn(async () => new Response("{}", { status: 429 }));
    expect(await collectMobileLabEvidence("https://example.com/", "x", failure as typeof fetch)).toBeNull();
    const wrong = vi.fn(async () => new Response(JSON.stringify({ lighthouseResult: { ...valid.lighthouseResult, finalDisplayedUrl: "https://other.example/" } }), { status: 200 }));
    expect(await collectMobileLabEvidence("https://example.com/", "x", wrong as typeof fetch)).toBeNull();
    const error = vi.fn(async () => new Response(JSON.stringify({ lighthouseResult: { ...valid.lighthouseResult, runtimeError: { code: "ERROR" } } }), { status: 200 }));
    expect(await collectMobileLabEvidence("https://example.com/", "x", error as typeof fetch)).toBeNull();
  });
  it("records only a safe failure category, not a provider error or credentials", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const failure = vi.fn(async () => { throw new Error("private-token-and-url"); });
      expect(await collectMobileLabEvidence("https://example.com/", "private-key", failure as typeof fetch)).toBeNull();
      expect(warn).toHaveBeenCalledWith("pagespeed_lab_unavailable", { reason: "request_or_parse_error" });
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/private|example/);
    } finally { warn.mockRestore(); }
  });
  it("accepts page-bound field INP and rejects origin fallback or a different page", async () => {
    const field = { id: "https://example.com/", initial_url: "https://example.com/", origin_fallback: false, metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: 240 } } };
    const collect = async (loadingExperience: object) => collectMobileLabEvidence("https://example.com/", "key", vi.fn(async () => new Response(JSON.stringify({ ...valid, loadingExperience }), { status: 200 })) as typeof fetch);
    expect(await collect(field)).toMatchObject({ fieldInpMs: 240 });
    expect(await collect({ ...field, origin_fallback: true })).toMatchObject({ fieldInpMs: null });
    expect(await collect({ ...field, id: "https://example.com/other" })).toMatchObject({ fieldInpMs: null });
    expect(await collect({ ...field, metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: "240" } } })).toMatchObject({ fieldInpMs: null });
  });
  it("names a rejected key with a fixed category and never logs the provider message", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const rejected = vi.fn(async () => new Response(JSON.stringify({ error: { code: 400, message: "API key not valid. Please pass a valid API key. https://example.com/" } }), { status: 400 }));
      expect(await collectMobileLabEvidence("https://example.com/", "private-key", rejected as typeof fetch)).toBeNull();
      expect(rejected).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("pagespeed_lab_unavailable", { reason: "api_key_invalid", status: 400 });
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/private-key|example\.com|Please pass/);
    } finally { warn.mockRestore(); }
  });
  it("retries once without the optional site-wide field when the field selection is refused", async () => {
    const urls: string[] = [];
    const transport = vi.fn(async (url: URL) => {
      urls.push(url.searchParams.get("fields") ?? "");
      return urls.length === 1
        ? new Response(JSON.stringify({ error: { code: 400, message: "Invalid field selection originLoadingExperience" } }), { status: 400 })
        : new Response(JSON.stringify(valid), { status: 200 });
    });
    const result = await collectMobileLabEvidence("https://example.com/", "key", transport as unknown as typeof fetch);
    expect(result).toMatchObject({ lcpMs: 4400, cls: 0.002 });
    expect(urls[0]).toContain("originLoadingExperience");
    expect(urls[1]).not.toContain("originLoadingExperience");
  });
  it("reads site-wide field INP and lab blocking time separately from page-level INP", async () => {
    const body = { ...valid, originLoadingExperience: { id: "https://example.com", metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: 310 } } }, lighthouseResult: { ...valid.lighthouseResult, audits: { ...valid.lighthouseResult.audits, "total-blocking-time": { numericValue: 420.4, scoreDisplayMode: "numeric" } } } };
    const result = await collectMobileLabEvidence("https://example.com/", "key", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch);
    expect(result).toMatchObject({ fieldInpMs: null, originFieldInpMs: 310, tbtMs: 420.4 });
    const other = { ...body, originLoadingExperience: { id: "https://other.example", metrics: body.originLoadingExperience.metrics } };
    expect(await collectMobileLabEvidence("https://example.com/", "key", vi.fn(async () => new Response(JSON.stringify(other), { status: 200 })) as typeof fetch)).toMatchObject({ originFieldInpMs: null });
  });
});
