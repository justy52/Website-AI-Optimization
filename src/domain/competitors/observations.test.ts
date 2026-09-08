import { describe, expect, it } from "vitest";

import {
  competitorLimitForPlan,
  normalizeCompetitorTargetUrl,
  summarizeCompetitorObservation,
} from "./observations";

describe("competitor observation foundation", () => {
  it("uses service-plan competitor limits", () => {
    expect(competitorLimitForPlan("ESSENTIALS")).toBe(3);
    expect(competitorLimitForPlan("GROWTH")).toBe(5);
    expect(competitorLimitForPlan("PRO")).toBe(8);
  });

  it("normalizes public competitor targets", () => {
    expect(normalizeCompetitorTargetUrl("WWW.Example.COM")).toEqual({
      canonicalUrl: "https://www.example.com/",
      domain: "example.com",
    });
  });

  it("summarizes homepage metadata and detects changes by hash", () => {
    const first = summarizeCompetitorObservation({
      requestedUrl: "https://example.com/",
      finalUrl: "https://example.com/",
      status: 200,
      headers: {},
      bodyText:
        "<html><head><title>Example</title><meta name=\"description\" content=\"First\"></head><body></body></html>",
      contentHash: "raw-1",
      redirects: [],
    });
    const second = summarizeCompetitorObservation(
      {
        requestedUrl: "https://example.com/",
        finalUrl: "https://example.com/",
        status: 200,
        headers: {},
        bodyText:
          "<html><head><title>Example</title><meta name=\"description\" content=\"Second\"></head><body></body></html>",
        contentHash: "raw-2",
        redirects: [],
      },
      first.contentHash,
    );

    expect(first.observedTitle).toBe("Example");
    expect(first.changeSummary).toContain("Initial");
    expect(second.changeSummary).toContain("changed");
    expect(second.limitations.rankData).toBe("UNAVAILABLE");
  });
});
