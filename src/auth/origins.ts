import type { BetterAuthOptions } from "better-auth";

type AuthEnvironment = {
  APP_ENV: "local" | "qa" | "production";
  BETTER_AUTH_URL: string;
  VERCEL?: string;
  VERCEL_URL?: string;
  VERCEL_BRANCH_URL?: string;
};

function validHostname(value: string): boolean {
  return value.length <= 253 && value.split(".").every(
    (label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label),
  );
}

// Only deployment-generated configuration contributes hosts. Never accept
// browser Origin/Host headers here, including forwarded headers.
export function authOriginOptions(env: AuthEnvironment): Pick<BetterAuthOptions, "baseURL" | "trustedOrigins"> {
  const canonical = new URL(env.BETTER_AUTH_URL);
  if (canonical.username || canonical.password || canonical.search || canonical.hash || canonical.pathname !== "/") {
    throw new Error("BETTER_AUTH_URL must be an origin without credentials or a path.");
  }
  if (env.APP_ENV === "local") {
    return { baseURL: canonical.origin, trustedOrigins: [canonical.origin] };
  }
  if (canonical.protocol !== "https:" || canonical.port || !validHostname(canonical.hostname)) {
    throw new Error("Deployed BETTER_AUTH_URL must use a valid HTTPS hostname.");
  }
  const hosts = new Set([canonical.hostname]);
  if (env.VERCEL === "1") {
    for (const candidate of [env.VERCEL_URL, env.VERCEL_BRANCH_URL]) {
      if (candidate && validHostname(candidate) && candidate.toLowerCase().endsWith(".vercel.app")) {
        hosts.add(candidate.toLowerCase());
      }
    }
  }
  return {
    baseURL: { allowedHosts: [...hosts], protocol: "https", fallback: canonical.origin },
    trustedOrigins: [...hosts].map((host) => `https://${host}`),
  };
}
