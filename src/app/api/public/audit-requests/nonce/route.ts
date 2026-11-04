import { getIntakeConfig } from "@/server/intake-config";
import { issueIntakeNonce } from "@/security/intake-nonce";

export const runtime = "nodejs";
export async function GET() {
  const config = getIntakeConfig();
  if (!config) return Response.json({ error: "Audit requests are currently unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json({ nonce: issueIntakeNonce(config.PUBLIC_INTAKE_SECRET) }, { headers: { "Cache-Control": "no-store" } });
}
