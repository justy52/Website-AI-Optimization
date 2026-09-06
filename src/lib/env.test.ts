import { describe, expect, it } from "vitest";

import { getServerEnv, resolveAppEnv } from "./env";

describe("server environment validation", () => {
  it("uses safe local defaults for developer-only startup", () => {
    const env = getServerEnv({});

    expect(env.APP_ENV).toBe("local");
    expect(env.DATABASE_URL).toContain("localhost:5432/optiq");
    expect(env.BETTER_AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it("resolves Vercel preview as QA and production as production", () => {
    expect(resolveAppEnv({ VERCEL_ENV: "preview" })).toBe("qa");
    expect(resolveAppEnv({ VERCEL_ENV: "production" })).toBe("production");
  });

  it("fails safely when production required values are missing", () => {
    expect(() => getServerEnv({ APP_ENV: "production" })).toThrow(
      "Missing required production environment variables",
    );
  });

  it("rejects short production secrets with useful messages", () => {
    expect(() =>
      getServerEnv({
        APP_ENV: "production",
        DATABASE_URL: "postgres://example.invalid/app",
        DATABASE_URL_UNPOOLED: "postgres://example.invalid/app",
        BETTER_AUTH_SECRET: "short",
        BETTER_AUTH_URL: "https://example.invalid",
        CREDENTIAL_ENCRYPTION_KEY: "short",
      }),
    ).toThrow("BETTER_AUTH_SECRET must be at least 32 characters long.");
  });

  it("does not require later-phase blob storage for QA startup", () => {
    const env = getServerEnv({
      APP_ENV: "qa",
      DATABASE_URL: "postgres://example.invalid/app",
      DATABASE_URL_UNPOOLED: "postgres://example.invalid/app",
      BETTER_AUTH_SECRET: "qa-secret-with-enough-length-for-better-auth",
      BETTER_AUTH_URL: "https://qa.example.invalid",
      CREDENTIAL_ENCRYPTION_KEY: "qa-credential-key-with-enough-length",
    });

    expect(env.APP_ENV).toBe("qa");
    expect(env.BLOB_READ_WRITE_TOKEN).toBeUndefined();
  });
});
