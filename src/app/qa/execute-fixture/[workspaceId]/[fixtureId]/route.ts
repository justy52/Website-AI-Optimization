import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { getPublicQaFixture } from "@/server/qa-execution";
import { QA_ORIGIN, renderQaFixture } from "@/domain/execution/qa-execution";
export async function GET(_request: Request, { params }: { params: Promise<{workspaceId:string; fixtureId:string}> }) {
  if (serverEnv.APP_ENV !== "qa" || ![QA_ORIGIN, QA_ORIGIN + "/"].includes(serverEnv.BETTER_AUTH_URL)) return new Response(null, {status:404});
  const ids = z.object({workspaceId:z.string().uuid(), fixtureId:z.string().uuid()}).safeParse(await params);
  if (!ids.success) return new Response(null,{status:404});
  const fixture = await getPublicQaFixture(ids.data.workspaceId, ids.data.fixtureId);
  if (!fixture) return new Response(null,{status:404});
  return new Response(renderQaFixture(fixture), {headers:{"Content-Type":"text/html; charset=utf-8", "Cache-Control":"no-store", "Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'", "X-Content-Type-Options":"nosniff"}});
}
