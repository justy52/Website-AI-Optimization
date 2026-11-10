import { z } from "zod";

const configSchema = z.object({
  PUBLIC_INTAKE_DATABASE_URL: z.url(),
  PUBLIC_INTAKE_SECRET: z.string().min(32),
  PUBLIC_INTAKE_WORKSPACE_ID: z.uuid(),
  PUBLIC_INTAKE_ORIGIN: z.url(),
  PUBLIC_BUSINESS_NAME: z.string().min(1),
  PUBLIC_CONTACT_EMAIL: z.email(),
});

export function getIntakeConfig(source: Record<string, string | undefined> = process.env, requireEnabled = true) {
  if (requireEnabled && source.PUBLIC_INTAKE_ENABLED !== "true") return null;
  // New server-only names are accepted by the hosting platform's Secret fields.
  // Retain the legacy names for existing protected previews.
  const result = configSchema.safeParse({
    ...source,
    PUBLIC_INTAKE_DATABASE_URL: source.VIRELANTIC_INTAKE_DATABASE_URL ?? source.PUBLIC_INTAKE_DATABASE_URL,
    PUBLIC_INTAKE_SECRET: source.VIRELANTIC_INTAKE_SECRET ?? source.PUBLIC_INTAKE_SECRET,
  });
  if (!result.success) return null;
  const config = result.data;
  const origin = new URL(config.PUBLIC_INTAKE_ORIGIN);
  if (origin.origin !== config.PUBLIC_INTAKE_ORIGIN ||
    (origin.protocol !== "https:" && !(source.APP_ENV === "local" && ["localhost", "127.0.0.1"].includes(origin.hostname)))) return null;
  // The public handler must never fall back to the general application credential.
  const intakeUrl = new URL(config.PUBLIC_INTAKE_DATABASE_URL);
  if (!/^virelantic_intake_[a-z0-9_]*submit$/.test(intakeUrl.username)) return null;
  return config;
}
