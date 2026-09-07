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

  it("uses deterministic governed PREPARE unless AI Gateway is configured", () => {
    const deterministic = getServerEnv({
      APP_ENV: "qa",
      DATABASE_URL: "postgres://example.invalid/app",
      DATABASE_URL_UNPOOLED: "postgres://example.invalid/app",
      BETTER_AUTH_SECRET: "qa-secret-with-enough-length-for-better-auth",
      BETTER_AUTH_URL: "https://qa.example.invalid",
      CREDENTIAL_ENCRYPTION_KEY: "qa-credential-key-with-enough-length",
    });

    expect(deterministic.AGENT_PROVIDER).toBe("deterministic");
    expect(deterministic.AI_GATEWAY_MODEL).toBeUndefined();

    const gateway = getServerEnv({
      APP_ENV: "qa",
      DATABASE_URL: "postgres://example.invalid/app",
      DATABASE_URL_UNPOOLED: "postgres://example.invalid/app",
      BETTER_AUTH_SECRET: "qa-secret-with-enough-length-for-better-auth",
      BETTER_AUTH_URL: "https://qa.example.invalid",
      CREDENTIAL_ENCRYPTION_KEY: "qa-credential-key-with-enough-length",
      AGENT_PROVIDER: "ai_gateway",
      VERCEL: "1",
      AI_GATEWAY_MODEL: "openai/gpt-5.4-mini",
    });

    expect(gateway.AGENT_PROVIDER).toBe("ai_gateway");
    expect(gateway.AI_GATEWAY_MODEL).toBe("openai/gpt-5.4-mini");
  });

  it("fails safely when AI Gateway is selected without a model", () => {
    expect(() =>
      getServerEnv({
        APP_ENV: "qa",
        DATABASE_URL: "postgres://example.invalid/app",
        DATABASE_URL_UNPOOLED: "postgres://example.invalid/app",
        BETTER_AUTH_SECRET: "qa-secret-with-enough-length-for-better-auth",
        BETTER_AUTH_URL: "https://qa.example.invalid",
        CREDENTIAL_ENCRYPTION_KEY: "qa-credential-key-with-enough-length",
        AGENT_PROVIDER: "ai_gateway",
        VERCEL: "1",
      }),
    ).toThrow("Missing required qa AI Gateway variables");
  });

  it("fails safely when AI Gateway has neither Vercel OIDC nor a scoped key", () => {
    expect(() =>
      getServerEnv({
        APP_ENV: "qa",
        DATABASE_URL: "postgres://example.invalid/app",
        DATABASE_URL_UNPOOLED: "postgres://example.invalid/app",
        BETTER_AUTH_SECRET: "qa-secret-with-enough-length-for-better-auth",
        BETTER_AUTH_URL: "https://qa.example.invalid",
        CREDENTIAL_ENCRYPTION_KEY: "qa-credential-key-with-enough-length",
        AGENT_PROVIDER: "ai_gateway",
        AI_GATEWAY_MODEL: "openai/gpt-5.4-mini",
      }),
    ).toThrow("Missing AI Gateway authentication for qa");
  });

  it("allows a scoped AI Gateway key outside Vercel when explicitly supplied", () => {
    const env = getServerEnv({
      APP_ENV: "qa",
      DATABASE_URL: "postgres://example.invalid/app",
      DATABASE_URL_UNPOOLED: "postgres://example.invalid/app",
      BETTER_AUTH_SECRET: "qa-secret-with-enough-length-for-better-auth",
      BETTER_AUTH_URL: "https://qa.example.invalid",
      CREDENTIAL_ENCRYPTION_KEY: "qa-credential-key-with-enough-length",
      AGENT_PROVIDER: "ai_gateway",
      AI_GATEWAY_API_KEY: "qa-ai-gateway-key-placeholder-for-validation",
      AI_GATEWAY_MODEL: "openai/gpt-5.4-mini",
    });

    expect(env.AGENT_PROVIDER).toBe("ai_gateway");
  });
});
