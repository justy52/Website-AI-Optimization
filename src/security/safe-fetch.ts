import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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
  fetchImpl?: typeof fetch;
  lookupHost?: (hostname: string) => Promise<string[]>;
};

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
  const addresses = await lookup(hostname, { all: true, verbatim: false });
  return addresses.map((address) => address.address);
}

export async function assertSafePublicUrl(
  url: URL,
  lookupHost: (hostname: string) => Promise<string[]> = defaultLookupHost,
): Promise<void> {
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

    return;
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
}

function selectedHeaders(headers: Headers): Record<string, string> {
  const selected = ["content-type", "x-robots-tag", "location"];

  return Object.fromEntries(
    selected.flatMap((header) => {
      const value = headers.get(header);
      return value ? [[header, value]] : [];
    }),
  );
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytesRead = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    bytesRead += value.byteLength;

    if (bytesRead > maxBytes) {
      throw new SafeFetchError(
        "RESPONSE_TOO_LARGE",
        "Website response exceeded the configured size limit.",
      );
    }

    chunks.push(decoder.decode(value, { stream: true }));
  }

  chunks.push(decoder.decode());
  return chunks.join("");
}

export async function safeFetchText(
  input: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? defaultMaxRedirects;
  const maxBytes = options.maxBytes ?? defaultMaxBytes;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const fetchImpl = options.fetchImpl ?? fetch;
  const lookupHost = options.lookupHost ?? defaultLookupHost;
  const redirects: string[] = [];
  const visited = new Set<string>();
  const requestedUrl = input;
  let currentUrl = new URL(input);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    await assertSafePublicUrl(currentUrl, lookupHost);

    const current = currentUrl.toString();

    if (visited.has(current)) {
      throw new SafeFetchError("REDIRECT_LOOP", "Redirect loop detected.");
    }

    visited.add(current);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;

    try {
      response = await fetchImpl(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
          "user-agent": "OPTIQ-Phase1-Audit/1.0",
        },
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new SafeFetchError("TIMEOUT", "Website fetch timed out.");
      }

      throw new SafeFetchError(
        "FETCH_FAILED",
        error instanceof Error ? error.message : "Website fetch failed.",
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");

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

    const bodyText = await readLimitedText(response, maxBytes);

    return {
      requestedUrl,
      finalUrl: current,
      status: response.status,
      headers: selectedHeaders(response.headers),
      bodyText,
      contentHash: createHash("sha256").update(bodyText).digest("hex"),
      redirects,
    };
  }

  throw new SafeFetchError("REDIRECT_LIMIT", "Too many redirects.");
}
