import { isIP } from "node:net";

export class WebsiteUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebsiteUrlError";
  }
}

function withDefaultProtocol(input: string): string {
  const trimmed = input.trim();

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function assertPublicHostname(hostname: string): void {
  const host = hostname.toLowerCase().replace(/\.$/, "");

  if (!host || host === "localhost" || host.endsWith(".localhost")) {
    throw new WebsiteUrlError("Website URL must use a public hostname.");
  }

  if (isIP(host) !== 0) {
    throw new WebsiteUrlError("Website URL must use a public domain, not an IP address.");
  }

  if (!host.includes(".")) {
    throw new WebsiteUrlError("Website URL must include a public domain.");
  }
}

export function normalizeCanonicalUrl(input: string): string {
  let url: URL;

  try {
    url = new URL(withDefaultProtocol(input));
  } catch {
    throw new WebsiteUrlError("Website URL is not valid.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WebsiteUrlError("Website URL must use HTTP or HTTPS.");
  }

  if (url.username || url.password) {
    throw new WebsiteUrlError("Website URL must not include credentials.");
  }

  assertPublicHostname(url.hostname);

  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");

  if (url.pathname === "") {
    url.pathname = "/";
  }

  return url.toString();
}

export function normalizeDomain(input: string): string {
  let url: URL;

  try {
    url = new URL(withDefaultProtocol(input));
  } catch {
    throw new WebsiteUrlError("Domain is not valid.");
  }

  assertPublicHostname(url.hostname);

  return url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}
