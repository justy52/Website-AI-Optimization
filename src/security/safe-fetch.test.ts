import { describe, expect, it, vi } from "vitest";

import { safeFetchText, SafeFetchError } from "./safe-fetch";

const publicLookup = async () => ["93.184.216.34"];

function textResponse(body: string, init?: ResponseInit) {
  return new Response(body, init);
}

describe("safeFetchText SSRF guard", () => {
  it("rejects non-http schemes before fetching", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      safeFetchText("file:///etc/passwd", { fetchImpl }),
    ).rejects.toMatchObject({ code: "INVALID_SCHEME" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks localhost and loopback targets", async () => {
    await expect(
      safeFetchText("http://localhost", { lookupHost: publicLookup }),
    ).rejects.toMatchObject({ code: "BLOCKED_HOST" });

    await expect(
      safeFetchText("http://127.0.0.1", { lookupHost: publicLookup }),
    ).rejects.toMatchObject({ code: "BLOCKED_HOST" });
  });

  it("blocks private IPv4, IPv6 local/private, and cloud metadata addresses", async () => {
    const blockedTargets = [
      "http://10.0.0.5",
      "http://192.168.1.9",
      "http://172.16.0.1",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://[fd00::1]/",
      "http://[fe80::1]/",
    ];

    for (const target of blockedTargets) {
      await expect(
        safeFetchText(target, { lookupHost: publicLookup }),
      ).rejects.toMatchObject({ code: "BLOCKED_HOST" });
    }
  });

  it("blocks DNS responses that resolve to private networks", async () => {
    await expect(
      safeFetchText("https://example.com", {
        lookupHost: async () => ["192.168.0.10"],
      }),
    ).rejects.toMatchObject({ code: "BLOCKED_HOST" });
  });

  it("revalidates redirects and blocks redirect-to-private targets", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      textResponse("", {
        status: 302,
        headers: { location: "http://127.0.0.1/admin" },
      }),
    );

    await expect(
      safeFetchText("https://example.com", { fetchImpl, lookupHost: publicLookup }),
    ).rejects.toMatchObject({ code: "BLOCKED_HOST" });
  });

  it("detects redirect loops", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      textResponse("", {
        status: 302,
        headers: { location: "https://example.com/" },
      }),
    );

    await expect(
      safeFetchText("https://example.com/", {
        fetchImpl,
        lookupHost: publicLookup,
        maxRedirects: 5,
      }),
    ).rejects.toMatchObject({ code: "REDIRECT_LOOP" });
  });

  it("limits redirect chains", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        textResponse("", { status: 302, headers: { location: "/one" } }),
      )
      .mockResolvedValueOnce(
        textResponse("", { status: 302, headers: { location: "/two" } }),
      );

    await expect(
      safeFetchText("https://example.com", {
        fetchImpl,
        lookupHost: publicLookup,
        maxRedirects: 1,
      }),
    ).rejects.toMatchObject({ code: "REDIRECT_LIMIT" });
  });

  it("rejects oversized responses while reading", async () => {
    await expect(
      safeFetchText("https://example.com", {
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(textResponse("x".repeat(12))),
        lookupHost: publicLookup,
        maxBytes: 10,
      }),
    ).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
  });

  it("times out slow fetches", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    await expect(
      safeFetchText("https://example.com", {
        fetchImpl,
        lookupHost: publicLookup,
        timeoutMs: 1,
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("returns bounded response evidence for public websites", async () => {
    const result = await safeFetchText("https://example.com", {
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        textResponse("<html><title>Example</title></html>", {
          headers: { "content-type": "text/html" },
        }),
      ),
      lookupHost: publicLookup,
    });

    expect(result.finalUrl).toBe("https://example.com/");
    expect(result.status).toBe(200);
    expect(result.headers).toEqual({ "content-type": "text/html" });
    expect(result.contentHash).toHaveLength(64);
  });

  it("uses typed SafeFetchError values", async () => {
    await expect(
      safeFetchText("https://example.invalid", {
        lookupHost: async () => {
          throw new Error("dns failed");
        },
      }),
    ).rejects.toBeInstanceOf(SafeFetchError);
  });
});
