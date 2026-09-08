import { describe, expect, it } from "vitest";

import {
  GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE,
  normalizeSearchConsoleRow,
  propertyTypeForSiteUrl,
  searchConsolePropertyMatchesWebsite,
} from "./search-console";
import { assertSearchConsoleReadonlyScopes } from "./google-search-console-adapter";

describe("Search Console integration rules", () => {
  it("requires the Google read-only scope exactly", () => {
    expect(() =>
      assertSearchConsoleReadonlyScopes([GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE]),
    ).not.toThrow();
    expect(() =>
      assertSearchConsoleReadonlyScopes([
        GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE,
        "https://www.googleapis.com/auth/webmasters",
      ]),
    ).toThrow("read-only scope only");
  });

  it("maps and matches URL-prefix and domain properties", () => {
    expect(propertyTypeForSiteUrl("sc-domain:example.com")).toBe("DOMAIN");
    expect(propertyTypeForSiteUrl("https://www.example.com/")).toBe(
      "URL_PREFIX",
    );
    expect(searchConsolePropertyMatchesWebsite("sc-domain:example.com", "www.example.com")).toBe(
      true,
    );
    expect(
      searchConsolePropertyMatchesWebsite(
        "https://www.example.com/",
        "example.com",
      ),
    ).toBe(true);
    expect(searchConsolePropertyMatchesWebsite("sc-domain:other.test", "example.com")).toBe(
      false,
    );
  });

  it("normalizes complete and partial observation rows", () => {
    expect(
      normalizeSearchConsoleRow({
        keys: ["website audit", "https://example.com/a"],
        clicks: 4.2,
        impressions: 80,
        ctr: 0.052,
        position: 7.43,
      }),
    ).toEqual({
      query: "website audit",
      page: "https://example.com/a",
      clicks: 4,
      impressions: 80,
      ctrBasisPoints: 520,
      averagePositionBasisPoints: 743,
      completeness: "COMPLETE",
    });
    expect(normalizeSearchConsoleRow({ keys: [] })).toMatchObject({
      query: null,
      page: null,
      clicks: 0,
      impressions: 0,
      completeness: "PARTIAL",
    });
  });
});
