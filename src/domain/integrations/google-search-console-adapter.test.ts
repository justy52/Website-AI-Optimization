import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE,
} from "./search-console";
import { LiveSearchConsoleProvider } from "./google-search-console-adapter";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("LiveSearchConsoleProvider adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps OAuth token exchange responses without exposing write scopes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        scope: GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE,
        token_type: "Bearer",
      }),
    );
    const provider = new LiveSearchConsoleProvider();
    const token = await provider.exchangeCode({
      code: "oauth-code",
      redirectUri: "https://qa.example.invalid/callback",
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    const request = fetchMock.mock.calls[0];
    const body = request?.[1]?.body;

    expect(request?.[0]).toBe("https://oauth2.googleapis.com/token");
    expect(String(body)).toContain("grant_type=authorization_code");
    expect(token).toMatchObject({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      scope: [GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE],
      tokenType: "Bearer",
    });
    expect(token.expiresAt).toBeInstanceOf(Date);
  });

  it("refreshes access tokens using the stored refresh token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        access_token: "new-access-token",
        expires_in: 3600,
        scope: GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE,
        token_type: "Bearer",
      }),
    );
    const provider = new LiveSearchConsoleProvider();
    const token = await provider.refreshAccessToken({
      refreshToken: "stored-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
    });

    expect(token.refreshToken).toBe("stored-refresh-token");
    expect(token.scope).toEqual([GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE]);
  });

  it("caps query row limits and maps empty Search Console responses", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ rows: undefined }));
    const provider = new LiveSearchConsoleProvider();
    const rows = await provider.querySearchAnalytics({
      accessToken: "access-token",
      propertyUrl: "https://example.com/",
      window: { startDate: "2026-09-01", endDate: "2026-09-08" },
      rowLimit: 500,
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));

    expect(body.rowLimit).toBe(100);
    expect(rows).toEqual([]);
  });

  it("fails closed on provider errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ error: "rateLimitExceeded" }, { status: 429 }),
    );
    const provider = new LiveSearchConsoleProvider();

    await expect(provider.listSites("access-token")).rejects.toThrow(
      "Search Console site list failed with status 429.",
    );
  });
});
