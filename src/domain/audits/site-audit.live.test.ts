import { appendFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { runPhase1DeterministicAudit } from "./execution";

/**
 * Opt-in live run against real public websites. It contacts only the listed
 * sites (and Google, when keys are supplied) and writes nothing.
 *
 * Set OPTIQ_AUDIT_LIVE_OUT to a file path to also save the per-check output.
 *
 *   OPTIQ_AUDIT_LIVE_URLS="https://example.com/,https://example.org/" pnpm vitest run src/domain/audits/site-audit.live.test.ts
 */
const out = process.env.OPTIQ_AUDIT_LIVE_OUT;
const log = (line: string) => { console.log(line); if (out) appendFileSync(out, `${line}\n`); };
const urls = (process.env.OPTIQ_AUDIT_LIVE_URLS ?? "").split(",").map((url) => url.trim()).filter(Boolean);

describe.skipIf(urls.length === 0)("live site audit", () => {
  it.each(urls)("evaluates every check for %s", async (url) => {
    const audit = await runPhase1DeterministicAudit(url, {}, {
      pagespeedApiKey: process.env.GOOGLE_PAGESPEED_API_KEY || undefined,
      placesApiKey: process.env.GOOGLE_PLACES_API_KEY || undefined,
    });
    const counts: Record<string, number> = {};
    for (const check of audit.checkResults) counts[check.status] = (counts[check.status] ?? 0) + 1;
    log(`\n=== ${url} overall=${audit.overall.score} provisional=${audit.overall.provisional} coverage=${Math.round(audit.evidenceCoverage * 100)}% ${JSON.stringify(counts)}`);
    for (const score of audit.categoryScores) log(`  [${score.category}] score=${score.score} coverage=${Math.round(score.evidenceCoverage * 100)}%${score.lowCoverage ? " LOW" : ""}`);
    for (const check of audit.checkResults) log(`  ${check.status.padEnd(11)} ${check.checkKey.padEnd(34)} ${check.reason}`);
    log(`  sample: ${JSON.stringify(audit.evidence.find((item) => item.id === "page-sample")?.metadata ?? null)}`);
    for (const item of audit.evidence.filter((entry) => entry.id.startsWith("sampled-page-"))) log(`    ${item.httpStatus ?? "ERR"} ${item.sourceLabel} ${item.sourceUrl}`);
    expect(audit.checkResults.every((check) => check.status !== "ERROR")).toBe(true);
  }, 150_000);
});
