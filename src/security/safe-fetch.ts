import { createHash } from "node:crypto";
import type { LookupAddress, LookupOptions } from "node:dns";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";

export type SafeFetchErrorCode =
  | "INVALID_SCHEME"
  | "URL_CREDENTIALS"
  | "BLOCKED_HOST"
  | "DNS_UNAVAILABLE"
  | "REDIRECT_LIMIT"
  | "REDIRECT_LOOP"
  | "FETCH_FAILED"
  | "RESPONSE_TOO_LARGE"
  | "TIMEOUT";

export class SafeFetchError extends Error {
  constructor(
    public readonly code: SafeFetchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SafeFetchError";
  }
}

export type SafeFetchResult = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  bodyText: string;
  contentHash: string;
  redirects: string[];
};

export type SafeFetchOptions = {
  maxRedirects?: number;
  maxBytes?: number;
  timeoutMs?: number;
  lookupHost?: (hostname: string) => Promise<string[]>;
  requestImpl?: PinnedHttpRequest;
};

type ValidatedAddress = {
  address: string;
  family: 4 | 6;
};

export type PinnedHttpRequestOptions = {
  timeoutMs: number;
  maxBytes: number;
  headers: Record<string, string>;
  lookup: LookupFunction;
  validatedAddresses: ValidatedAddress[];
};

export type PinnedHttpResponse = {
  status: number;
  headers: Record<string, string>;
  bodyText: string;
};

export type PinnedHttpRequest = (
  url: URL,
  options: PinnedHttpRequestOptions,
) => Promise<PinnedHttpResponse>;

const defaultMaxRedirects = 5;
const defaultMaxBytes = 1_000_000;
const defaultTimeoutMs = 8_000;

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function normalizeHostname(hostname: string): string {
  return stripIpv6Brackets(hostname).toLowerCase().replace(/\.$/, "");
}

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split(".");

  if (parts.length !== 4) return null;

  let result = 0;

  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value < 0 || value > 255) return null;
    result = (result << 8) + value;
  }

  return result >>> 0;
}

function ipv4InRange(ip: string, base: string, prefixLength: number): boolean {
  const value = ipv4ToNumber(ip);
  const baseValue = ipv4ToNumber(base);

  if (value === null || baseValue === null) return false;

  const mask =
    prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;

  return (value & mask) === (baseValue & mask);
}

function isBlockedIpv4(ip: string): boolean {
  return [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ].some(([base, prefix]) => ipv4InRange(ip, base as string, prefix as number));
}

function expandIpv6(address: string): bigint | null {
  let ip = address.toLowerCase().split("%")[0];

  if (ip.includes(".")) {
    const lastColon = ip.lastIndexOf(":");
    const ipv4 = ip.slice(lastColon + 1);
    const ipv4Number = ipv4ToNumber(ipv4);

    if (ipv4Number === null) return null;

    const high = ((ipv4Number >>> 16) & 0xffff).toString(16);
    const low = (ipv4Number & 0xffff).toString(16);
    ip = `${ip.slice(0, lastColon)}:${high}:${low}`;
  }

  const pieces = ip.split("::");

  if (pieces.length > 2) return null;

  const head = pieces[0] ? pieces[0].split(":") : [];
  const tail = pieces[1] ? pieces[1].split(":") : [];
  const missing = 8 - head.length - tail.length;

  if (missing < 0) return null;

  const parts = [
    ...head,
    ...Array.from({ length: pieces.length === 2 ? missing : 0 }, () => "0"),
    ...tail,
  ];

  if (parts.length !== 8) return null;

  return parts.reduce<bigint | null>((total, part) => {
    if (total === null || !/^[0-9a-f]{1,4}$/.test(part)) return null;
    return (total << 16n) + BigInt(Number.parseInt(part, 16));
  }, 0n);
}

function ipv6InRange(ip: string, base: string, prefixLength: number): boolean {
  const value = expandIpv6(ip);
  const baseValue = expandIpv6(base);

  if (value === null || baseValue === null) return false;

  const shift = BigInt(128 - prefixLength);

  return (value >> shift) === (baseValue >> shift);
}

function isIpv4MappedIpv6(ip: string): string | null {
  const value = expandIpv6(ip);

  if (value === null) return null;

  const prefix = value >> 32n;

  if (prefix !== 0xffffn) {
    return null;
  }

  const last32 = Number(value & 0xffffffffn);

  return [
    (last32 >>> 24) & 255,
    (last32 >>> 16) & 255,
    (last32 >>> 8) & 255,
    last32 & 255,
  ].join(".");
}

function isBlockedIpv6(ip: string): boolean {
  const mappedIpv4 = isIpv4MappedIpv6(ip);

  if (mappedIpv4) {
    return isBlockedIpv4(mappedIpv4);
  }

  return (
    ipv6InRange(ip, "::", 128) ||
    ipv6InRange(ip, "::1", 128) ||
    ipv6InRange(ip, "fc00::", 7) ||
    ipv6InRange(ip, "fe80::", 10) ||
    ipv6InRange(ip, "ff00::", 8)
  );
}

export function isBlockedIpAddress(ip: string): boolean {
  const version = isIP(stripIpv6Brackets(ip));

  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(stripIpv6Brackets(ip));
  return true;
}

function assertHttpUrl(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchError("INVALID_SCHEME", "Only HTTP and HTTPS URLs are allowed.");
  }

  if (url.username || url.password) {
    throw new SafeFetchError("URL_CREDENTIALS", "URL credentials are not allowed.");
  }
}

async function defaultLookupHost(hostname: string): Promise<string[]> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map((address) => address.address);
}

async function resolveSafePublicAddresses(
  url: URL,
  lookupHost: (hostname: string) => Promise<string[]> = defaultLookupHost,
): Promise<ValidatedAddress[]> {
  assertHttpUrl(url);

  const hostname = normalizeHostname(url.hostname);

  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new SafeFetchError("BLOCKED_HOST", "Localhost targets are blocked.");
  }

  const ipVersion = isIP(hostname);

  if (ipVersion !== 0) {
    if (isBlockedIpAddress(hostname)) {
      throw new SafeFetchError("BLOCKED_HOST", "Private or local IP targets are blocked.");
    }

    return [{ address: hostname, family: ipVersion as 4 | 6 }];
  }

  let addresses: string[];

  try {
    addresses = await lookupHost(hostname);
  } catch {
    throw new SafeFetchError("DNS_UNAVAILABLE", "Unable to resolve website host.");
  }

  if (addresses.length === 0) {
    throw new SafeFetchError("DNS_UNAVAILABLE", "Website host did not resolve.");
  }

  if (addresses.some((address) => isBlockedIpAddress(address))) {
    throw new SafeFetchError("BLOCKED_HOST", "Resolved private or local IP targets are blocked.");
  }

  return addresses.map((address) => {
    const family = isIP(address);

    if (family !== 4 && family !== 6) {
      throw new SafeFetchError("DNS_UNAVAILABLE", "Website host resolved to an invalid address.");
    }

    return { address, family };
  });
}

export async function assertSafePublicUrl(
  url: URL,
  lookupHost: (hostname: string) => Promise<string[]> = defaultLookupHost,
): Promise<void> {
  await resolveSafePublicAddresses(url, lookupHost);
}

function selectedHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const selected = ["content-type", "x-robots-tag", "location"];

  return Object.fromEntries(
    selected.flatMap((header) => {
      const value = headers[header];
      if (!value) return [];
      return [[header, Array.isArray(value) ? value.join(", ") : String(value)]];
    }),
  );
}

function createPinnedLookup(
  expectedHostname: string,
  validatedAddresses: ValidatedAddress[],
): LookupFunction {
  const normalizedExpected = normalizeHostname(expectedHostname);

  return (hostname: string, options: LookupOptions, callback) => {
    const normalizedRequested = normalizeHostname(hostname);
    const all = typeof options === "object" && options?.all === true;
    const family =
      typeof options === "object" && (options.family === 4 || options.family === 6)
        ? options.family
        : undefined;
    const candidates = family
      ? validatedAddresses.filter((address) => address.family === family)
      : validatedAddresses;
    const error = Object.assign(new Error("Pinned DNS lookup rejected the target."), {
      code: "ENOTFOUND",
    }) as NodeJS.ErrnoException;

    if (normalizedRequested !== normalizedExpected || candidates.length === 0) {
      queueMicrotask(() => callback(error, all ? [] : "", family ?? 0));
      return;
    }

    if (all) {
      const addresses: LookupAddress[] = candidates.map((address) => ({
        address: address.address,
        family: address.family,
      }));
      queueMicrotask(() => callback(null, addresses));
      return;
    }

    const selected = candidates[0];
    queueMicrotask(() => callback(null, selected.address, selected.family));
  };
}

const requestHeaders = {
  accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
  "user-agent": "OPTIQ-Phase1-Audit/1.0",
} as const;

const defaultPinnedRequest: PinnedHttpRequest = (url, options) =>
  new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const requestRef: { current?: http.ClientRequest } = {};
    const timeout = setTimeout(() => {
      requestRef.current?.destroy(
        new SafeFetchError("TIMEOUT", "Website fetch timed out."),
      );
    }, options.timeoutMs);
    const clearRequestTimeout = () => {
      clearTimeout(timeout);
    };
    timeout.unref?.();

    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: options.headers,
        lookup: options.lookup,
        servername: url.protocol === "https:" ? url.hostname : undefined,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let bytesRead = 0;

        response.on("data", (chunk: Buffer) => {
          bytesRead += chunk.byteLength;

          if (bytesRead > options.maxBytes) {
            response.destroy(
              new SafeFetchError(
                "RESPONSE_TOO_LARGE",
                "Website response exceeded the configured size limit.",
              ),
            );
            return;
          }

          chunks.push(chunk);
        });

        response.on("end", () => {
          clearRequestTimeout();
          resolve({
            status: response.statusCode ?? 0,
            headers: selectedHeaders(response.headers),
            bodyText: Buffer.concat(chunks).toString("utf8"),
          });
        });

        response.on("error", (error) => {
          clearRequestTimeout();
          reject(error);
        });
      },
    );
    requestRef.current = request;

    request.on("error", (error) => {
      clearRequestTimeout();
      reject(error);
    });

    request.end();
  });

function redirectLocation(headers: Record<string, string>): string | undefined {
  return headers.location;
}

export async function safeFetchText(
  input: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? defaultMaxRedirects;
  const maxBytes = options.maxBytes ?? defaultMaxBytes;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const requestImpl = options.requestImpl ?? defaultPinnedRequest;
  const lookupHost = options.lookupHost ?? defaultLookupHost;
  const redirects: string[] = [];
  const visited = new Set<string>();
  const requestedUrl = input;
  let currentUrl = new URL(input);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const validatedAddresses = await resolveSafePublicAddresses(currentUrl, lookupHost);

    const current = currentUrl.toString();

    if (visited.has(current)) {
      throw new SafeFetchError("REDIRECT_LOOP", "Redirect loop detected.");
    }

    visited.add(current);

    let response: PinnedHttpResponse;
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        reject(new SafeFetchError("TIMEOUT", "Website fetch timed out."));
      }, timeoutMs);

      timeout.unref?.();
    });

    try {
      response = await Promise.race([
        requestImpl(currentUrl, {
          timeoutMs,
          maxBytes,
          headers: requestHeaders,
          lookup: createPinnedLookup(currentUrl.hostname, validatedAddresses),
          validatedAddresses,
        }),
        timeoutPromise,
      ]);
    } catch (error) {
      if (error instanceof SafeFetchError) {
        throw error;
      }

      throw new SafeFetchError(
        "FETCH_FAILED",
        error instanceof Error ? error.message : "Website fetch failed.",
      );
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }

    if (Buffer.byteLength(response.bodyText, "utf8") > maxBytes) {
      throw new SafeFetchError(
        "RESPONSE_TOO_LARGE",
        "Website response exceeded the configured size limit.",
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const location = redirectLocation(response.headers);

      if (!location) {
        throw new SafeFetchError("FETCH_FAILED", "Redirect response was missing a location.");
      }

      if (redirectCount === maxRedirects) {
        throw new SafeFetchError("REDIRECT_LIMIT", "Too many redirects.");
      }

      currentUrl = new URL(location, currentUrl);
      redirects.push(currentUrl.toString());
      continue;
    }

    return {
      requestedUrl,
      finalUrl: current,
      status: response.status,
      headers: response.headers,
      bodyText: response.bodyText,
      contentHash: createHash("sha256").update(response.bodyText).digest("hex"),
      redirects,
    };
  }

  throw new SafeFetchError("REDIRECT_LIMIT", "Too many redirects.");
}
