import { timingSafeEqual } from "node:crypto";
import { productionReadiness } from "@/server/readiness";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.MONITORING_SECRET;
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  const headers = { "Cache-Control": "no-store" };
  if (!secret || secret.length < 32 || received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return Response.json({ status: "unauthorized" }, { status: 401, headers });
  }
  const result = await productionReadiness();
  return Response.json({ status: result.ready ? "ready" : "held", ...result }, {
    status: result.ready ? 200 : 503,
    headers,
  });
}
