import type { CheckStatus, ScoreCategoryKey } from "./scoring";
import type { EvidenceConfidence } from "@/domain/opportunities/generation";

export function canFinalizeAudit(auditStatus: string, runStatus: string): boolean {
  return ["SUCCEEDED", "PARTIAL"].includes(runStatus) &&
    ["READY_TO_FINALIZE", "REVIEW_REQUIRED"].includes(auditStatus);
}

export function hasReportableScore(score: number | null | undefined, coverageBasisPoints: number | null | undefined): boolean {
  return score != null && (coverageBasisPoints ?? 0) >= 6000;
}

/**
 * Whether a category score must be hidden. Audits collected before the
 * site-sample collector could not evaluate the core AI-readiness checks, so
 * their AI readiness score stays withheld however it was stored.
 */
export function isCategoryScoreWithheld(
  category: string,
  score: number | null | undefined,
  lowCoverage: boolean | null | undefined,
  collectorVersion: string | null | undefined,
): boolean {
  if (score === null || score === undefined || lowCoverage) return true;
  return category === "aiReadiness" && !(collectorVersion ?? "").startsWith("site-sample-");
}

// Suggestions are deliberately diagnostic: the observed check alone does not
// establish the cause or guarantee that any particular change will help.
export function findingGuidance(checkKey: string): { title: string; nextStep: string } | null {
  const guidance: Record<string, { title: string; nextStep: string }> = {
    "perf.lcp": { title: "Review mobile loading speed", nextStep: "Repeat the mobile test and inspect its diagnostics to identify what delays the largest visible element." },
    "perf.inp": { title: "Review real-user responsiveness", nextStep: "Inspect field data and interaction diagnostics to identify which user actions respond slowly." },
    "perf.cls": { title: "Review unexpected layout movement", nextStep: "Repeat the mobile test and inspect which elements move while the page loads." },
    "perf.https": { title: "Review the secure connection", nextStep: "Check the website's HTTPS configuration and redirects with its hosting provider." },
    "seo.meta_description": { title: "Review the page description", nextStep: "Prepare a concise, accurate description of the page for review before adding it to the website." },
    "seo.title": { title: "Review the page title", nextStep: "Check the page title and prepare an accurate, descriptive title for review." },
    "seo.heading_structure": { title: "Review the page headings", nextStep: "Check that the visible headings are useful and organized clearly for readers." },
    "seo.canonical": { title: "Review the canonical address", nextStep: "Check that the page's canonical address points to the intended version of the page." },
    "seo.indexability": { title: "Review search access", nextStep: "Check the page response and indexing instructions before changing search settings." },
    "seo.robots_sitemap": { title: "Review the sitemap and crawler instructions", nextStep: "Check the robots.txt and sitemap responses, then fix any confirmed errors." },
    "seo.internal_links": { title: "Review internal links", nextStep: "Check that visitors and search crawlers can reach relevant pages from the homepage." },
    "conv.primary_cta": { title: "Review the primary call to action", nextStep: "Check whether visitors can easily see and use the next step you want them to take." },
    "conv.mobile_contact": { title: "Review mobile contact options", nextStep: "Check the contact options on a mobile device and confirm they work as intended." },
    "ai.identity_clarity": { title: "Review the business name on the homepage", nextStep: "Check the verified name against the visible page, including alternate wording and content that loads in a browser." },
    "ai.service_clarity": { title: "Review how the homepage describes the service", nextStep: "Check whether the verified service is described clearly, including synonyms and links to relevant service pages." },
    "ai.location_clarity": { title: "Review location information on the homepage", nextStep: "Check the verified location or service area against the homepage and relevant location pages." },
    "perf.mobile_render": { title: "Review how the site displays on phones", nextStep: "Open the affected pages on a phone and confirm each one declares a responsive viewport and fits the screen." },
    "perf.critical_functionality": { title: "Review broken links and contact paths", nextStep: "Open the listed pages and links, confirm which ones fail for visitors, and repair or redirect them." },
    "seo.content_targeting": { title: "Review overlapping or thin pages", nextStep: "Compare the listed pages and decide which should be merged, expanded, or given a distinct purpose." },
    "local.business_identity": { title: "Review the business name, phone and location details", nextStep: "Confirm the correct name, phone number and address or service area, then make them match everywhere on the site." },
    "local.gbp_presence": { title: "Review the Google Business Profile", nextStep: "Confirm whether the business has a claimed, active Google Business Profile and that the website links to it." },
    "local.category_service_alignment": { title: "Review the business category", nextStep: "Check that the category on the Google Business Profile and in the site's structured data matches the main service." },
    "local.location_clarity": { title: "Review how the site states the area served", nextStep: "Confirm the real service area and state it in the homepage text, a heading, and the business structured data." },
    "local.local_pages": { title: "Review service and location pages", nextStep: "Check whether each core service and each genuine service area has a useful page of its own, with distinct content." },
    "local.review_signal": { title: "Review the volume and recency of Google reviews", nextStep: "Compare the review count with nearby competitors and consider a compliant process for asking real customers for reviews." },
    "local.structured_business_data": { title: "Review the business structured data", nextStep: "Check that valid business structured data with the correct name, phone and address is present on the homepage." },
    "conv.lead_form": { title: "Review the enquiry form", nextStep: "Submit a test enquiry, confirm it arrives, and remove any fields that are not needed to respond." },
    "conv.offer_clarity": { title: "Review how quickly the homepage explains the offer", nextStep: "Check that the main heading and opening lines say what is offered, who or where it is for, and what to do next." },
    "conv.trust_signals": { title: "Review proof of credibility", nextStep: "Gather genuine reviews, credentials, guarantees or examples of work and place them near the points where visitors decide to enquire." },
    "conv.friction": { title: "Review the steps needed to enquire", nextStep: "Walk through the enquiry journey on a phone and remove unnecessary steps or fields." },
    "conv.measurement": { title: "Review lead tracking", nextStep: "Confirm with the site's analytics owner whether form submissions and calls are recorded, and set up tracking if they are not." },
    "ai.entity_consistency": { title: "Review consistency of business facts across the site", nextStep: "Compare the name, phone and address in the page text, metadata and structured data, and correct any that differ." },
    "ai.answerability": { title: "Review whether the site answers common customer questions", nextStep: "Add clear, accurate answers for the questions listed as not found, such as services, area, hours, pricing and process." },
    "ai.structured_data": { title: "Review structured data for search and AI systems", nextStep: "Check that the homepage has valid structured data describing the business and fix any block that fails to parse." },
    "ai.citability": { title: "Review how specific and source-worthy the content is", nextStep: "Add accurate specifics that a reader could cite, such as figures, process details, credentials and worked examples." },
    "auth.reviews": { title: "Review the visibility of customer reviews", nextStep: "Link to the review profiles where customers can verify feedback and show genuine reviews on the site." },
    "auth.third_party_mentions": { title: "Review third-party business profiles", nextStep: "Confirm which directory and review profiles the business really has, complete them, and link them from the site." },
    "auth.referring_domains": { title: "Review links from other websites", nextStep: "Connect a licensed backlink data source to measure this, then compare the result with relevant competitors." },
    "auth.credentials": { title: "Review stated credentials", nextStep: "List genuine licenses, certifications and experience, and include a detail a visitor can check, such as a license number." },
    "auth.business_transparency": { title: "Review how openly the business identifies itself", nextStep: "Check that an about page, direct contact details and an address or service area are easy to find." },
    "auth.expertise_content": { title: "Review educational content", nextStep: "Consider publishing accurate guides or answers to common questions, with a named author or a date where appropriate." },
    "auth.entity_consistency": { title: "Review consistency with the Google listing", nextStep: "Compare the name, phone and website on the Google Business Profile with the site and correct whichever is out of date." },
    "ai.crawlability": { title: "Review AI search access to the homepage", nextStep: "Review the homepage text, robots.txt, and any firewall restrictions. Decide whether to allow OAI-SearchBot based on the business's preferences; this is separate from GPTBot's training setting and does not guarantee inclusion." },
  };
  return guidance[checkKey] ?? null;
}

export type SnapshotCheckResult = {
  checkKey: string;
  category: ScoreCategoryKey;
  status: CheckStatus;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | null;
  evidenceConfidence?: EvidenceConfidence;
  reason: string;
  evidenceRefs: string[];
};

export type SnapshotCategoryScore = {
  category: ScoreCategoryKey;
  score: number | null;
  evidenceCoverageBasisPoints: number;
  lowCoverage: boolean;
};

export type SnapshotFinding = {
  checkKey: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  summary: string;
  evidenceRefs: string[];
};

export type AuditSnapshotData = {
  audit: {
    id: string;
    title: string;
    finalizedAt: string;
    scoringDefinitionVersion: string;
    checkCatalogVersion: string;
  };
  run: {
    id: string;
    overallScore: number | null;
    provisional: boolean;
    evidenceCoverageBasisPoints: number;
    collectorVersion: string;
  };
  website: {
    id: string;
    displayName: string;
    canonicalUrl: string;
    domain: string;
  };
  checkResults: SnapshotCheckResult[];
  categoryScores: SnapshotCategoryScore[];
  findings: SnapshotFinding[];
};

export type BuiltAuditReport = {
  title: string;
  executiveSummary: string;
  methodologyVersion: string;
  reportData: {
    website: AuditSnapshotData["website"];
    overallScore: AuditSnapshotData["run"]["overallScore"];
    provisional: boolean;
    evidenceCoverageBasisPoints: number;
    categoryScores: SnapshotCategoryScore[];
    highPriorityFindings: SnapshotFinding[];
    additionalFindings?: SnapshotFinding[];
    unavailableChecks: SnapshotCheckResult[];
    methodology: {
      scoringDefinitionVersion: string;
      checkCatalogVersion: string;
      collectorVersion: string;
    };
  };
};

function severityRank(finding: SnapshotFinding): number {
  return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[finding.severity];
}

export function buildAuditReportFromSnapshot(
  snapshot: AuditSnapshotData,
): BuiltAuditReport {
  const highPriorityFindings = snapshot.findings
    .filter((finding) => finding.severity === "CRITICAL" || finding.severity === "HIGH")
    .sort((a, b) => severityRank(a) - severityRank(b))
    .slice(0, 10);
  const featured = new Set(highPriorityFindings);
  const additionalFindings = snapshot.findings.filter(finding => !featured.has(finding)).sort((a, b) => severityRank(a) - severityRank(b));
  const unavailableChecks = snapshot.checkResults.filter(
    (check) => check.status === "UNAVAILABLE" || check.status === "ERROR",
  );
  const scoreText =
    !hasReportableScore(snapshot.run.overallScore, snapshot.run.evidenceCoverageBasisPoints)
      ? "An overall score is withheld because evidence is insufficient"
      : `Overall deterministic score: ${snapshot.run.overallScore}/100`;
  const coveragePercent = Math.round(
    snapshot.run.evidenceCoverageBasisPoints / 100,
  );
  const provisionalText = snapshot.run.provisional
    ? "The assessment is provisional because evidence coverage is incomplete."
    : "The score is not provisional under the configured evidence-coverage rule.";

  return {
    title: `${snapshot.website.displayName} Digital Visibility Audit`,
    executiveSummary: [
      `${scoreText}.`,
      `${provisionalText}`,
      `${highPriorityFindings.length} critical or high findings are listed for review.`,
      `${additionalFindings.length} additional findings are listed for review.`,
      `${unavailableChecks.length} checks were unavailable or errored and are disclosed rather than inferred.`,
      `Evidence coverage: ${coveragePercent}%.`,
    ].join(" "),
    methodologyVersion: snapshot.audit.scoringDefinitionVersion,
    reportData: {
      website: snapshot.website,
      overallScore: snapshot.run.overallScore,
      provisional: snapshot.run.provisional,
      evidenceCoverageBasisPoints: snapshot.run.evidenceCoverageBasisPoints,
      categoryScores: snapshot.categoryScores,
      highPriorityFindings,
      additionalFindings,
      unavailableChecks,
      methodology: {
        scoringDefinitionVersion: snapshot.audit.scoringDefinitionVersion,
        checkCatalogVersion: snapshot.audit.checkCatalogVersion,
        collectorVersion: snapshot.run.collectorVersion,
      },
    },
  };
}
