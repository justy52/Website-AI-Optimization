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
});
