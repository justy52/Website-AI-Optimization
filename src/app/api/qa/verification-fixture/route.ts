import { serverEnv } from "@/lib/env";

// A read-only, fixed-content test target. No writes, secrets, user HTML or
// verifier exceptions. Time windows let E2E independently observe correction
// without editing an external website. Never available in customer production.
export function GET(request: Request) {
  if (serverEnv.APP_ENV !== "qa") return new Response(null, { status: 404 });
  const url = new URL(request.url);
  const readyAt = Number(url.searchParams.get("readyAt"));
  const correctAt = Number(url.searchParams.get("correctAt"));
  const now = Date.now();
  if (!Number.isSafeInteger(readyAt) || !Number.isSafeInteger(correctAt) || correctAt <= readyAt || correctAt - readyAt > 900_000 || Math.abs(now - readyAt) > 3_600_000) return new Response(null, { status: 404 });
  const title = now < readyAt ? "Home" : "Verification fixture | OPTIQ QA Fixture";
  const description = now < readyAt ? "" : now < correctAt ? "Intentionally mismatched QA description" : "OPTIQ QA Fixture helps customers with verification fixture. Contact the team to discuss the next step.";
  const headings = now < readyAt ? "" : `<h1>${now < correctAt ? "Intentionally mismatched QA heading" : "Verification fixture"}</h1><h2>Services</h2><h2>Why choose OPTIQ QA Fixture</h2><h2>Contact</h2>`;
  const schema = now < readyAt ? "" : `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Organization", name: now < correctAt ? "Intentionally mismatched QA entity" : "OPTIQ QA Fixture" })}</script>`;
  return new Response(`<!doctype html><html lang="en"><head><title>${title}</title>${description ? `<meta name="description" content="${description}">` : ""}${schema}</head><body>${headings}<p>Read-only OPTIQ verification test fixture. This is fixed harmless QA content, not a customer website. Its scheduled representations exercise independent verification. No site write is performed.</p><a href="/api/health">Public health</a></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-OPTIQ-QA-Fixture": "true" } });
}
