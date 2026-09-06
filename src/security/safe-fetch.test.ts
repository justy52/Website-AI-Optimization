import { describe, expect, it, vi } from "vitest";

import {
  safeFetchText,
  SafeFetchError,
  type PinnedHttpRequest,
  type PinnedHttpResponse,
} from "./safe-fetch";

const publicLookup = async () => ["93.184.216.34"];

function textResponse(
  bodyText: string,
  init: {
    status?: number;
    headers?: Record<string, string>;
  } = {},
): PinnedHttpResponse {
  return {
    status: init.status ?? 200,
    headers: init.headers ?? {},
    bodyText,
  };
}

describe("safeFetchText SSRF guard", () => {
  it("rejects non-http schemes before fetching", async () => {
    const requestImpl = vi.fn<PinnedHttpRequest>();

    await expect(
      safeFetchText("file:///etc/passwd", { requestImpl }),
    ).rejects.toMatchObject({ code: "INVALID_SCHEME" });
    expect(requestImpl).not.toHaveBeenCalled();
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
    const requestImpl = vi.fn<PinnedHttpRequest>().mockResolvedValue(
      textResponse("", {
        status: 302,
        headers: { location: "http://127.0.0.1/admin" },
      }),
    );

    await expect(
      safeFetchText("https://example.com", { requestImpl, lookupHost: publicLookup }),
    ).rejects.toMatchObject({ code: "BLOCKED_HOST" });
  });

  it("detects redirect loops", async () => {
    const requestImpl = vi.fn<PinnedHttpRequest>().mockResolvedValue(
      textResponse("", {
        status: 302,
        headers: { location: "https://example.com/" },
      }),
    );

    await expect(
      safeFetchText("https://example.com/", {
        requestImpl,
        lookupHost: publicLookup,
        maxRedirects: 5,
      }),
    ).rejects.toMatchObject({ code: "REDIRECT_LOOP" });
  });

  it("limits redirect chains", async () => {
    const requestImpl = vi
      .fn<PinnedHttpRequest>()
      .mockResolvedValueOnce(
        textResponse("", { status: 302, headers: { location: "/one" } }),
      )
      .mockResolvedValueOnce(
        textResponse("", { status: 302, headers: { location: "/two" } }),
      );

    await expect(
      safeFetchText("https://example.com", {
        requestImpl,
        lookupHost: publicLookup,
        maxRedirects: 1,
      }),
    ).rejects.toMatchObject({ code: "REDIRECT_LIMIT" });
  });

  it("rejects oversized responses while reading", async () => {
    await expect(
      safeFetchText("https://example.com", {
        requestImpl: vi.fn<PinnedHttpRequest>().mockResolvedValue(textResponse("x".repeat(12))),
        lookupHost: publicLookup,
        maxBytes: 10,
      }),
    ).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
  });

  it("times out slow fetches", async () => {
    const requestImpl = vi.fn<PinnedHttpRequest>(() => new Promise(() => undefined));

    await expect(
      safeFetchText("https://example.com", {
        requestImpl,
        lookupHost: publicLookup,
        timeoutMs: 1,
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("returns bounded response evidence for public websites", async () => {
    const result = await safeFetchText("https://example.com", {
      requestImpl: vi.fn<PinnedHttpRequest>().mockResolvedValue(
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

  it("pins the connection lookup to the validated public DNS answer", async () => {
    const lookupHost = vi
      .fn<() => Promise<string[]>>()
      .mockResolvedValueOnce(["93.184.216.34"]);
    const requestImpl = vi.fn<PinnedHttpRequest>(
      async (_url, { lookup, validatedAddresses }) => {
        const connected = await new Promise<{ address: string; family: number }>(
          (resolve, reject) => {
            lookup("example.com", { family: 4 }, (error, address, family) => {
              if (error) {
                reject(error);
                return;
              }

              resolve({ address: address as string, family: family ?? 0 });
            });
          },
        );

        expect(validatedAddresses).toEqual([
          { address: "93.184.216.34", family: 4 },
        ]);
        expect(connected).toEqual({ address: "93.184.216.34", family: 4 });

        return textResponse("ok", { headers: { "content-type": "text/plain" } });
      },
    );

    await expect(
      safeFetchText("https://example.com", {
        lookupHost,
        requestImpl,
      }),
    ).resolves.toMatchObject({ bodyText: "ok" });

    expect(lookupHost).toHaveBeenCalledTimes(1);
  });

  it("does not perform a second unvalidated DNS lookup that can rebind to private IPs", async () => {
    const lookupHost = vi
      .fn<() => Promise<string[]>>()
      .mockResolvedValueOnce(["93.184.216.34"])
      .mockResolvedValueOnce(["127.0.0.1"]);
    const requestImpl = vi.fn<PinnedHttpRequest>(
      async (_url, { lookup }) => {
        const connected = await new Promise<{ address: string; family: number }>(
          (resolve, reject) => {
            lookup("example.com", {}, (error, address, family) => {
              if (error) {
                reject(error);
                return;
              }

              resolve({ address: address as string, family: family ?? 0 });
            });
          },
        );

        expect(connected.address).toBe("93.184.216.34");
        expect(connected.address).not.toBe("127.0.0.1");

        return textResponse("ok");
      },
    );

    await expect(
      safeFetchText("https://example.com", { lookupHost, requestImpl }),
    ).resolves.toMatchObject({ bodyText: "ok" });

    expect(lookupHost).toHaveBeenCalledTimes(1);
  });

  it("rejects a transport lookup request for a hostname outside the validated target", async () => {
    const requestImpl = vi.fn<PinnedHttpRequest>(
      async (_url, { lookup }) => {
        await expect(
          new Promise((resolve, reject) => {
            lookup("127.0.0.1", {}, (error, address) => {
              if (error) {
                reject(error);
                return;
              }

              resolve(address);
            });
          }),
        ).rejects.toMatchObject({ code: "ENOTFOUND" });

        return textResponse("ok");
      },
    );

    await expect(
      safeFetchText("https://example.com", {
        lookupHost: publicLookup,
        requestImpl,
      }),
    ).resolves.toMatchObject({ bodyText: "ok" });
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
