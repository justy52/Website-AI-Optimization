import { timingSafeEqual } from "node:crypto";
import { purgeIntakeRequests } from "@/server/intake-queue";

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : "";
  const actual = request.headers.get("authorization") ?? "";
  const expectedBytes = Buffer.from(expected); const actualBytes = Buffer.from(actual);
  if (!expected || actualBytes.length !== expectedBytes.length || !timingSafeEqual(expectedBytes, actualBytes)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const removed = await purgeIntakeRequests();
  return Response.json({ removed }, { headers: { "Cache-Control": "no-store" } });
}
