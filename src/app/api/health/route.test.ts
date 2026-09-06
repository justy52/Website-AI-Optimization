import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("/api/health", () => {
  it("returns a small non-sensitive health response", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      status: "ok",
      app: "optiq",
      phase: "1",
    });
    expect(JSON.stringify(body)).not.toMatch(
      /DATABASE_URL|BETTER_AUTH_SECRET|CREDENTIAL_ENCRYPTION_KEY|postgres:\/\//,
    );
  });
});
