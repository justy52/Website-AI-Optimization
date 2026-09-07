import { z } from "zod";

const localDatabaseUrl = [
  "postgresql://",
  "optiq",
  ":",
  "local-only",
  "@localhost:5432/optiq",
].join("");
const localAuthSecret = "unsafe-local-better-auth-secret-change-me";
const localCredentialKey = "unsafe-local-credential-key-change-me";
type EnvSource = Record<string, string | undefined>;

const optionalNonEmpty = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const versionString = z.preprocess(
  (value) => (value === "" || value == null ? "1" : value),
  z.string().min(1),
);

const rawEnvSchema = z.object({
  APP_ENV: z.enum(["local", "qa", "production"]).optional(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  VERCEL_ENV: optionalNonEmpty,
  DATABASE_URL: optionalNonEmpty,
  DATABASE_URL_UNPOOLED: optionalNonEmpty,
  BETTER_AUTH_SECRET: optionalNonEmpty,
  BETTER_AUTH_URL: optionalNonEmpty,
  CREDENTIAL_ENCRYPTION_KEY: optionalNonEmpty,
  CREDENTIAL_KEY_VERSION: versionString,
  AI_GATEWAY_API_KEY: optionalNonEmpty,
  AI_GATEWAY_MODEL: optionalNonEmpty,
  VERCEL: optionalNonEmpty,
  VERCEL_OIDC_TOKEN: optionalNonEmpty,
  AGENT_PROVIDER: z
    .enum(["deterministic", "ai_gateway"])
    .optional()
    .default("deterministic"),
  BLOB_READ_WRITE_TOKEN: optionalNonEmpty,
  GOOGLE_OAUTH_CLIENT_ID: optionalNonEmpty,
  GOOGLE_OAUTH_CLIENT_SECRET: optionalNonEmpty,
  GOOGLE_OAUTH_REDIRECT_URI: optionalNonEmpty,
  PERPLEXITY_API_KEY: optionalNonEmpty,
  GEMINI_API_KEY: optionalNonEmpty,
});

const deployedRequiredKeys = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "CREDENTIAL_ENCRYPTION_KEY",
] as const;

export type AppEnv = "local" | "qa" | "production";
export type ServerEnv = Omit<z.infer<typeof rawEnvSchema>, "APP_ENV"> & {
  APP_ENV: AppEnv;
  DATABASE_URL: string;
  DATABASE_URL_UNPOOLED: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  CREDENTIAL_ENCRYPTION_KEY: string;
};

export function resolveAppEnv(source: EnvSource = process.env): AppEnv {
  if (source.APP_ENV === "qa" || source.APP_ENV === "production") {
    return source.APP_ENV;
  }

  if (source.VERCEL_ENV === "production") {
    return "production";
  }

  if (source.VERCEL_ENV === "preview") {
    return "qa";
  }

  return "local";
}

function withLocalDefaults(appEnv: AppEnv, source: EnvSource): EnvSource {
  if (appEnv !== "local") {
    return {
      ...source,
      APP_ENV: appEnv,
    };
  }

  return {
    ...source,
    APP_ENV: appEnv,
    DATABASE_URL: source.DATABASE_URL || localDatabaseUrl,
    DATABASE_URL_UNPOOLED:
      source.DATABASE_URL_UNPOOLED ||
      source.DATABASE_URL ||
      localDatabaseUrl,
    BETTER_AUTH_SECRET: source.BETTER_AUTH_SECRET || localAuthSecret,
    BETTER_AUTH_URL: source.BETTER_AUTH_URL || "http://localhost:3000",
    CREDENTIAL_ENCRYPTION_KEY:
      source.CREDENTIAL_ENCRYPTION_KEY || localCredentialKey,
    CREDENTIAL_KEY_VERSION: source.CREDENTIAL_KEY_VERSION || "1",
  };
}

function assertRequiredValues(
  env: z.infer<typeof rawEnvSchema>,
  appEnv: AppEnv,
): asserts env is ServerEnv {
  const missing = deployedRequiredKeys.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required ${appEnv} environment variables: ${missing.join(", ")}`,
    );
  }

  if (env.BETTER_AUTH_SECRET!.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters long.");
  }

  if (env.CREDENTIAL_ENCRYPTION_KEY!.length < 32) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY must be at least 32 characters long.",
    );
  }

  if (env.AGENT_PROVIDER === "ai_gateway") {
    if (!env.AI_GATEWAY_MODEL) {
      throw new Error(
        `Missing required ${appEnv} AI Gateway variables: AI_GATEWAY_MODEL`,
      );
    }

    const hasGatewayAuth =
      Boolean(env.AI_GATEWAY_API_KEY) ||
      Boolean(env.VERCEL_OIDC_TOKEN) ||
      env.VERCEL === "1";

    if (!hasGatewayAuth) {
      throw new Error(
        `Missing AI Gateway authentication for ${appEnv}: use Vercel OIDC on Vercel or provide a scoped AI_GATEWAY_API_KEY.`,
      );
    }
  }
}

export function getServerEnv(source: EnvSource = process.env): ServerEnv {
  const appEnv = resolveAppEnv(source);
  const parsed = rawEnvSchema.safeParse(withLocalDefaults(appEnv, source));

  if (!parsed.success) {
    throw new Error(z.prettifyError(parsed.error));
  }

  assertRequiredValues(parsed.data, appEnv);

  return {
    ...parsed.data,
    APP_ENV: appEnv,
  };
}

export const serverEnv = getServerEnv();
