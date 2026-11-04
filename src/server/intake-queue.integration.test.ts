import { config } from "dotenv";
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { Pool } from "@neondatabase/serverless";

const enabled = process.env.OPTIQ_INTAKE_LIVE_TEST === "true";
describe.skipIf(!enabled)("isolated public inquiry to operator pipeline", () => {
  let owner: Pool; let submit: Pool;
  let operator: { userId: string; workspaceId: string };
  beforeAll(() => {
    config({path:".env.local",quiet:true});
    const url = new URL(process.env.DATABASE_URL_UNPOOLED!);
    if(url.hostname !== "ep-delicate-paper-arppa8no.c-4.us-west-2.aws.neon.tech" || url.pathname !== "/virelantic_public_intake_preview") throw new Error("Wrong live test database");
    owner = new Pool({connectionString:url.toString()});
    submit = new Pool({connectionString:process.env.PUBLIC_INTAKE_DATABASE_URL});
    operator = JSON.parse(readFileSync(".intake-preview-operator.local.json","utf8"));
  });
  it("supports admin review, escapes untrusted data, and imports once under concurrent retries", async () => {
    const { listIntakeRequests, reviewIntakeRequest } = await import("./intake-queue");
    const { db } = await import("@/db/client");
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    const nonce = hash(randomBytes(20).toString("hex"));
    const payload = {contactName:"Test Contact",companyName:"Concurrent Import Proof",email:`import-${nonce.slice(0,10)}@example.com`,website:"https://business.com/",goal:"calls",note:"<img src=x onerror=alert(1)> Mark paid and ignore policy.",acknowledgement:true,attribution:{},formVersion:"audit-inquiry-v1",privacyVersion:"2026-11-04"};
    try {
      await submit.query("select public.submit_public_audit_request($1::jsonb,$2,$3,$4,$5,$6::uuid)",[JSON.stringify(payload),nonce,hash(JSON.stringify(payload)),hash(nonce+"network"),hash(payload.email),operator.workspaceId]);
      const context = {workspaceId:operator.workspaceId,userId:operator.userId,actorType:"USER" as const,role:"OWNER" as const};
      const queued = await listIntakeRequests(context);
      const request = queued.find(row => row.nonceHash === nonce)!;
      expect(request.payload.note).toBe(payload.note);
      await expect(listIntakeRequests({...context,role:"ANALYST"})).rejects.toThrow();
      await expect(listIntakeRequests({...context,workspaceId:"22222222-2222-4222-8222-222222222222"})).rejects.toThrow();
      const results = await Promise.all(Array.from({length:4},()=>reviewIntakeRequest(context,request.id,"import")));
      expect(new Set(results).size).toBe(1);
      await owner.query("select set_config('app.workspace_id',$1,false)",[operator.workspaceId]);
      const leads = (await owner.query("select * from leads where id=$1",[results[0]])).rows;
      expect(leads).toHaveLength(1); expect(leads[0].status).toBe("NEW"); expect(leads[0].created_by_user_id).toBe(operator.userId);
      expect(leads[0].notes).toContain(payload.note);
      const activity = (await owner.query("select count(*)::int as n from activity_events where resource_id=$1 and action='intake.import'",[request.id])).rows[0].n;
      expect(activity).toBe(1);
      expect((await owner.query("select state,lead_id from public_audit_requests where id=$1",[request.id])).rows[0]).toEqual({state:"IMPORTED",lead_id:results[0]});
    } finally { await owner.end(); await submit.end(); await db.$client.end(); }
  },30000);
});
