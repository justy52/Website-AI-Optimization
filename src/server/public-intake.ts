import { Pool } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import type { Inquiry } from "@/domain/intake/validation";
import { intakeHash } from "@/security/intake-nonce";
import { getIntakeConfig } from "./intake-config";

let pool: Pool | undefined;
export async function persistInquiry(input: Inquiry, network: string) {
  const config = getIntakeConfig();
  if (!config) throw new Error("INTAKE_UNAVAILABLE");
  pool ??= new Pool({ connectionString: config.PUBLIC_INTAKE_DATABASE_URL, max: 3, connectionTimeoutMillis: 8000 });
  const { nonce, companyFax: _honeypot, ...payload } = input;
  void _honeypot;
  const canonical = JSON.stringify(payload);
  const result = await pool.query<{ outcome: string }>(
    "select public.submit_public_audit_request($1::jsonb,$2,$3,$4,$5,$6::uuid) as outcome",
    [canonical, intakeHash(config.PUBLIC_INTAKE_SECRET, "nonce-id", nonce),
      createHash("sha256").update(canonical).digest("hex"),
      intakeHash(config.PUBLIC_INTAKE_SECRET, "network", `${new Date().toISOString().slice(0, 10)}:${network}`),
      intakeHash(config.PUBLIC_INTAKE_SECRET, "email", input.email.toLowerCase()),
      config.PUBLIC_INTAKE_WORKSPACE_ID],
  );
  return result.rows[0].outcome;
}
