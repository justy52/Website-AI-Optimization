import {
  GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE,
  type SearchConsoleObservationInput,
  type SearchConsoleSiteEntry,
} from "./search-console";

export type GoogleOAuthTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date | null;
  scope: string[];
  tokenType: string;
};

export type SearchConsoleQueryWindow = {
  startDate: string;
  endDate: string;
};

export interface SearchConsoleProvider {
  exchangeCode(input: {
    code: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
  }): Promise<GoogleOAuthTokenResponse>;
  refreshAccessToken(input: {
    refreshToken: string;
    clientId: string;
    clientSecret: string;
  }): Promise<GoogleOAuthTokenResponse>;
  listSites(accessToken: string): Promise<SearchConsoleSiteEntry[]>;
  querySearchAnalytics(input: {
    accessToken: string;
    propertyUrl: string;
    window: SearchConsoleQueryWindow;
    rowLimit: number;
  }): Promise<SearchConsoleObservationInput[]>;
}

function timeoutSignal() {
  return AbortSignal.timeout(15_000);
}

function assertGoogleOk(response: Response, summary: string) {
  if (!response.ok) {
    throw new Error(`${summary} failed with status ${response.status}.`);
  }
}

function parseScopes(scope: unknown): string[] {
  return typeof scope === "string" ? scope.split(/\s+/).filter(Boolean) : [];
}

export class LiveSearchConsoleProvider implements SearchConsoleProvider {
  async exchangeCode(input: {
    code: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
  }): Promise<GoogleOAuthTokenResponse> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal: timeoutSignal(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: input.code,
        client_id: input.clientId,
        client_secret: input.clientSecret,
        redirect_uri: input.redirectUri,
        grant_type: "authorization_code",
      }),
    });
    assertGoogleOk(response, "Google OAuth token exchange");
    const body = (await response.json()) as Record<string, unknown>;
    const expiresIn =
      typeof body.expires_in === "number" ? body.expires_in : undefined;
    const expiresAt =
      expiresIn === undefined ? null : new Date(Date.now() + expiresIn * 1000);

    return {
      accessToken: String(body.access_token ?? ""),
      refreshToken:
        typeof body.refresh_token === "string" ? body.refresh_token : undefined,
      expiresAt,
      scope: parseScopes(body.scope),
      tokenType: String(body.token_type ?? "Bearer"),
    };
  }

  async listSites(accessToken: string): Promise<SearchConsoleSiteEntry[]> {
    const response = await fetch(
      "https://www.googleapis.com/webmasters/v3/sites",
      {
        signal: timeoutSignal(),
        headers: { authorization: `Bearer ${accessToken}` },
      },
    );
    assertGoogleOk(response, "Search Console site list");
    const body = (await response.json()) as {
      siteEntry?: SearchConsoleSiteEntry[];
    };

    return body.siteEntry ?? [];
  }

  async refreshAccessToken(input: {
    refreshToken: string;
    clientId: string;
    clientSecret: string;
  }): Promise<GoogleOAuthTokenResponse> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal: timeoutSignal(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: input.refreshToken,
        client_id: input.clientId,
        client_secret: input.clientSecret,
        grant_type: "refresh_token",
      }),
    });
    assertGoogleOk(response, "Google OAuth token refresh");
    const body = (await response.json()) as Record<string, unknown>;
    const expiresIn =
      typeof body.expires_in === "number" ? body.expires_in : undefined;

    return {
      accessToken: String(body.access_token ?? ""),
      refreshToken: input.refreshToken,
      expiresAt:
        expiresIn === undefined ? null : new Date(Date.now() + expiresIn * 1000),
      scope: parseScopes(body.scope),
      tokenType: String(body.token_type ?? "Bearer"),
    };
  }

  async querySearchAnalytics(input: {
    accessToken: string;
    propertyUrl: string;
    window: SearchConsoleQueryWindow;
    rowLimit: number;
  }): Promise<SearchConsoleObservationInput[]> {
    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(input.propertyUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        signal: timeoutSignal(),
        headers: {
          authorization: `Bearer ${input.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          startDate: input.window.startDate,
          endDate: input.window.endDate,
          dimensions: ["query", "page"],
          rowLimit: Math.min(input.rowLimit, 100),
        }),
      },
    );
    assertGoogleOk(response, "Search Console query");
    const body = (await response.json()) as {
      rows?: SearchConsoleObservationInput[];
    };

    return body.rows ?? [];
  }
}

export function assertSearchConsoleReadonlyScopes(scopes: string[]) {
  if (
    scopes.length === 0 ||
    scopes.some((scope) => scope !== GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE)
  ) {
    throw new Error("Search Console connection must use read-only scope only.");
  }
}
