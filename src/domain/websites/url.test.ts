import { describe, expect, it } from "vitest";

import { normalizeCanonicalUrl, normalizeDomain, WebsiteUrlError } from "./url";

describe("website URL normalization", () => {
  it("normalizes public URLs and domains", () => {
    expect(normalizeCanonicalUrl("example.com")).toBe("https://example.com/");
    expect(normalizeCanonicalUrl("HTTPS://WWW.Example.COM/path#frag")).toBe(
      "https://www.example.com/path",
    );
    expect(normalizeDomain("https://www.Example.com/service")).toBe("example.com");
  });

  it("rejects unsafe or unsupported website targets", () => {
    const invalidTargets = [
      "ftp://example.com",
      "http://localhost",
      "http://127.0.0.1",
      "http://[::1]",
      "https://user:pass@example.com",
      "internal",
    ];

    for (const target of invalidTargets) {
      expect(() => normalizeCanonicalUrl(target)).toThrow(WebsiteUrlError);
    }
  });
});
