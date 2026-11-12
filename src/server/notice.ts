import { createHmac, timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/lib/env";

/**
 * A message shown after a redirect travels in the address, so it is signed:
 * only text this server produced is ever displayed, never text from a link.
 */
function sign(message: string) {
  return createHmac("sha256", serverEnv.BETTER_AUTH_SECRET).update(`notice:${message}`).digest("base64url").slice(0, 32);
}

export function noticeUrl(path: string, message: string) {
  const text = message.slice(0, 300);
  const query = new URLSearchParams({ problem: text, sig: sign(text) }).toString();
  return `${path}${path.includes("?") ? "&" : "?"}${query}`;
}

export function isSignedNotice(message: string, signature: string) {
  if (!message || message.length > 300 || !signature) return false;
  const expected = Buffer.from(sign(message));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
