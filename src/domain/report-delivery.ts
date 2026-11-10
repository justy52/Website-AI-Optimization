import { findingGuidance, hasReportableScore, type BuiltAuditReport } from "./audits/report";
import type { ScoreCategoryKey } from "./audits/scoring";

const categoryLabels: Record<ScoreCategoryKey, string> = {
  websitePerformance: "Website performance",
  seo: "Search visibility",
  localSearch: "Local search",
  conversion: "Conversion",
  aiReadiness: "AI readiness",
  authority: "Authority",
};

const entities: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

function escape(value: string | number) {
  return String(value).replace(/[&<>"']/g, (character) => entities[character]);
}

function list(items: string[], empty: string) {
  return items.length ? `<ul>${items.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>` : `<p>${escape(empty)}</p>`;
}

function section(title: string, body: string) {
  return `<section><h2>${escape(title)}</h2>${body}</section>`;
}

function document(title: string, finalizedAt: string, body: string) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escape(title)}</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;color:#17221b;margin:2rem auto;padding:0 1.25rem;max-width:52rem;overflow-wrap:anywhere}
h1,h2{line-height:1.2}h2{border-bottom:1px solid #bbb;padding-bottom:.3rem}
li{margin:.4rem 0} .brand{font-weight:bold;color:#1c5e40} .date{color:#45534a}
@media print{body{margin:0;padding:0;font-size:11pt}h2{break-after:avoid}li{break-inside:avoid}}
</style></head><body><main>
<header><p class="brand">Virelantic</p><h1>${escape(title)}</h1><p class="date">Finalized ${escape(finalizedAt.slice(0, 10))} UTC</p></header>
${body}
</main></body></html>`;
}

function reportUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "https:" || url.protocol === "http:") return url.origin + url.pathname;
  } catch {
    // Older snapshots may have a missing or invalid URL.
  }
  return "Website URL unavailable";
}

export function renderAuditReport(
  report: Pick<BuiltAuditReport, "title" | "executiveSummary" | "reportData">,
  finalizedAt: string,
) {
  const data = report.reportData;
  const coverage = (basisPoints: number) => Math.round(basisPoints / 100) + "%";
  const reportable = hasReportableScore(data.overallScore, data.evidenceCoverageBasisPoints);
  const summary = reportable ? report.executiveSummary : report.executiveSummary.replace(
    /Overall deterministic score:\s*\d+\/100\./, "An overall score is withheld because evidence is insufficient.",
  );
  const findings = (entries: BuiltAuditReport["reportData"]["highPriorityFindings"]) =>
    entries.map((finding) => {
      const guidance = findingGuidance(finding.checkKey);
      return `${finding.severity}: ${guidance?.title ?? finding.title}. ${finding.summary}${guidance ? ` Next step: ${guidance.nextStep}` : ""}`;
    });
  return document(report.title, finalizedAt, [
    section("Executive summary", `<p>${escape(summary)}</p>`),
    section("Website and evidence coverage", list([
      reportUrl(data.website.canonicalUrl),
      `Overall score: ${reportable ? `${data.overallScore}/100` : "Withheld due to insufficient evidence"}`,
      `Evidence coverage: ${coverage(data.evidenceCoverageBasisPoints)}${data.provisional ? " (provisional)" : ""}`,
      `Methodology: ${data.methodology.scoringDefinitionVersion} · ${data.methodology.checkCatalogVersion} · ${data.methodology.collectorVersion}`,
    ], "")),
    section("Category scores", list(data.categoryScores.map((category) => {
      const withheld = category.category === "aiReadiness" || category.lowCoverage || category.score === null;
      return `${categoryLabels[category.category]}: ${withheld ? "Withheld" : `${category.score}/100`} · ${coverage(category.evidenceCoverageBasisPoints)} coverage`;
    }), "No category scores were recorded.")),
    section("High-priority findings", list(findings(data.highPriorityFindings), "No high or critical findings were recorded.")),
    section("Additional findings", list(findings(data.additionalFindings ?? []), "No additional findings were recorded.")),
    section("Evidence limitations", list(data.unavailableChecks.map((check) => {
      const title = findingGuidance(check.checkKey)?.title ?? `${categoryLabels[check.category] ?? "Additional"} check`;
      return `${title} (${check.status.toLowerCase()}): ${check.reason}`;
    }), "No unavailable or errored checks were recorded.")),
  ].join(""));
}

type WorkItem = { title: string; completionState: string; verificationStatus?: string | null };

export type MonthlyDeliverySnapshot = {
  title: string;
  executiveSummary: string;
  methodologyVersion: string;
  finalizedAt: string;
  period: { startDate: string; endDate: string; timezone: string };
  sections: {
    workCompleted?: { items: WorkItem[] };
    workPreparedApproved?: { items: WorkItem[] };
    verificationAttention?: { items: WorkItem[] };
    websiteHealth?: { runsCompleted: number; failures: number; criticalRegressions: number };
    searchPerformance?: { runsCompleted: number; status: string };
    competitorChanges?: { observations: number; materialMetadataChanges: number };
    observedAiVisibility?: { explanation?: string; samples?: { copy: string; window: string }[] };
    nextMonthPriorities?: { title: string; severity: string }[];
  };
  dataLimitations: { source: string; status: string; limitation?: string }[];
};

export function renderMonthlyReport(snapshot: MonthlyDeliverySnapshot) {
  const { sections, period } = snapshot;
  const work = (items: WorkItem[] = []) => list(items.map((item) =>
    `${item.title} · ${item.completionState.replaceAll("_", " ")}${item.verificationStatus ? ` · Verification: ${item.verificationStatus.replaceAll("_", " ")}` : ""}`,
  ), "No work was recorded in this section.");
  const observations = [
    ...(sections.websiteHealth ? [`Website health: ${sections.websiteHealth.runsCompleted} runs completed, ${sections.websiteHealth.failures} monitoring failures and ${sections.websiteHealth.criticalRegressions} critical regressions.`] : []),
    ...(sections.searchPerformance ? [`Search Console: ${sections.searchPerformance.runsCompleted} runs completed. ${sections.searchPerformance.status}.`] : []),
    ...(sections.competitorChanges ? [`Competitor review: ${sections.competitorChanges.observations} observations and ${sections.competitorChanges.materialMetadataChanges} material metadata changes. Keyword ranks are unavailable.`] : []),
  ];
  const visibility = sections.observedAiVisibility;
  return document(snapshot.title, snapshot.finalizedAt, [
    section("Executive summary", `<p>${escape(snapshot.executiveSummary)}</p><p>${escape(`${period.startDate} to ${period.endDate} (${period.timezone}) · Methodology: ${snapshot.methodologyVersion}`)}</p>`),
    section("Implemented work", work(sections.workCompleted?.items)),
    section("Prepared or approved proposals", work(sections.workPreparedApproved?.items)),
    section("Verification follow-up", work(sections.verificationAttention?.items)),
    section("Monitoring evidence", list(observations, "No monitoring summary was recorded.")),
    section("Observed AI visibility", list(
      visibility?.samples?.map((sample) => `${sample.window}: ${sample.copy}`) ?? [],
      visibility?.explanation ?? "No sampled AI visibility observations were recorded.",
    ) + "<p>These observations reflect the sampled prompts and period. AI readiness is assessed separately.</p>"),
    section("Data limitations", list(snapshot.dataLimitations.map((item) =>
      `${item.source}: ${item.status}${item.limitation ? ` · ${item.limitation}` : ""}`,
    ), "No additional data limitations were recorded.")),
    section("Next priorities", list((sections.nextMonthPriorities ?? []).map((item) => `${item.severity}: ${item.title}`), "No next priorities were recorded.")),
  ].join(""));
}
