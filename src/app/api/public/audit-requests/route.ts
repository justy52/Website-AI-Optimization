import { isIP } from "node:net";
import { inquirySchema } from "@/domain/intake/validation";
import { verifyIntakeNonce } from "@/security/intake-nonce";
import { getIntakeConfig } from "@/server/intake-config";
import { persistInquiry } from "@/server/public-intake";

export const runtime = "nodejs";
const reply = (body: object, status: number, extra = {}) => Response.json(body, { status, headers: { "Cache-Control": "no-store", ...extra } });

export async function POST(request: Request) {
  const config = getIntakeConfig();
  if (!config) return reply({ error: "Audit requests are currently unavailable. Please try again later." }, 503);
  if (request.headers.get("origin") !== config.PUBLIC_INTAKE_ORIGIN) return reply({ error: "Please submit from the Virelantic website." }, 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply({ error: "Use the website form." }, 415);
  if (Number(request.headers.get("content-length")) > 8192) return reply({ error: "The request is too large." }, 413);
  let input: unknown;
  try {
    // Bound the stream itself; Content-Length is not trusted.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "The request is empty." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); return reply({ error: "The request is too large." }, 413); }
      chunks.push(value);
    }
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return reply({ error: "The request could not be read. Please try again." }, 400); }
  const result = inquirySchema.safeParse(input);
  if (!result.success) {
    const fields = Object.fromEntries(result.error.issues.map(issue => [issue.path[0] ?? "form", issue.message]));
    return reply({ error: "Please check the highlighted fields.", fields }, 422);
  }
  if (!verifyIntakeNonce(config.PUBLIC_INTAKE_SECRET, result.data.nonce)) return reply({ error: "The form has expired or was submitted too quickly. Refresh the form and try again.", refreshNonce: true }, 422);
  // Vercel replaces x-real-ip. A custom host must configure a trusted edge that
  // replaces it too; do not accept arbitrary x-forwarded-for chains.
  const candidate = request.headers.get("x-real-ip") ?? "";
  const network = isIP(candidate) ? candidate : "unknown-network";
  try {
    const outcome = await persistInquiry(result.data, network);
    if (outcome === "limited") return reply({ error: "Please wait a few minutes before sending another request." }, 429, { "Retry-After": "900" });
    if (outcome === "conflict") return reply({ error: "This form was already submitted with different details. Refresh the form to send a new request.", refreshNonce: true }, 409);
    if (!["saved", "duplicate"].includes(outcome)) throw new Error("INTAKE_NOT_SAVED");
    return reply({ received: true }, outcome === "saved" ? 201 : 200);
  } catch {
    // No payload, email, URL, credential or provider exception is logged.
    console.error("public_intake_save_failed", { eventId: crypto.randomUUID() });
    return reply({ error: "We couldn’t save your request. Please try again. Nothing has been charged." }, 503);
  }
}
