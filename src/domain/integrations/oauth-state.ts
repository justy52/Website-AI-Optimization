import { createHash, randomBytes } from "node:crypto";

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOAuthState(state: string): string {
  if (!state) {
    throw new Error("OAuth state is required.");
  }

  return createHash("sha256").update(state).digest("hex");
}

export function oauthStateExpiresAt(from = new Date()): Date {
  const expires = new Date(from);
  expires.setUTCMinutes(expires.getUTCMinutes() + 10);
  return expires;
}
