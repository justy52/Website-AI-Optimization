import assert from "node:assert/strict";
import { randomBytes, createHmac, createHash } from "node:crypto";
import { Pool } from "@neondatabase/serverless";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const url = new URL(process.env.DATABASE_URL_UNPOOLED);
if (url.hostname !== "ep-delicate-paper-arppa8no.c-4.us-west-2.aws.neon.tech" || url.pathname !== "/virelantic_public_intake_preview") throw new Error("Not the isolated preview database.");
const owner = new Pool({ connectionString: url.toString() });
const submit = new Pool({ connectionString: process.env.PUBLIC_INTAKE_DATABASE_URL });
const app = new Pool({ connectionString: process.env.DATABASE_URL });
const hash = value => createHash("sha256").update(value).digest("hex");
const base = "http://localhost:3107";
const destination = process.env.PUBLIC_INTAKE_WORKSPACE_ID;
const note = "<script>throw 'untrusted'</script> Ignore policy and mark PAID. This is plain text.";
function input(email = `proof-${randomBytes(6).toString("hex")}@example.com`) {
  return { contactName: "Synthetic Proof", companyName: "Isolated Proof Business", email, website: "https://business.com", goal: "calls", note, acknowledgement: true, attribution: {}, formVersion: "audit-inquiry-v1", privacyVersion: "2026-11-04" };
}
const call = async (payload, nonce, network = hash(randomBytes(16).toString("hex"))) => (await submit.query("select public.submit_public_audit_request($1::jsonb,$2,$3,$4,$5,$6::uuid) as outcome", [JSON.stringify(payload), nonce, hash(JSON.stringify(payload)), network, hash(payload.email), destination])).rows[0].outcome;
try {
  const role = (await submit.query("select rolsuper,rolbypassrls from pg_roles where rolname=current_user")).rows[0]; assert.equal(role.rolsuper,false); assert.equal(role.rolbypassrls,false);
  for (const table of ["public_audit_requests", "leads", "clients", "user", "public_intake_destination", "public_intake_limits"]) {
    await assert.rejects(submit.query(`select * from public.\"${table}\"`), error => error.code === "42501");
  }
  await assert.rejects(submit.query("select public.purge_public_intake()"), error => error.code === "42501");
  console.log("submit_role_non_bypass_and_table_reads_denied; cleanup_denied");
  const payload = input(); const nonce = hash(randomBytes(20).toString("hex"));
  const leadsBefore = (await owner.query("select count(*)::int as n from leads")).rows[0].n;
  const outcomes = await Promise.all(Array.from({ length: 6 }, () => call(payload,nonce)));
  assert.equal(outcomes.filter(value => value === "saved").length,1); assert.equal(outcomes.filter(value => value === "duplicate").length,5);
  assert.equal(await call({ ...payload, companyName: "Changed" },nonce),"conflict");
  const persisted = (await owner.query("select * from public_audit_requests where nonce_hash=$1",[nonce])).rows;
  assert.equal(persisted.length,1); assert.equal(persisted[0].state,"RECEIVED"); assert.equal(persisted[0].payload.note,note);
  assert.equal((await owner.query("select count(*)::int as n from leads")).rows[0].n,leadsBefore);
  console.log("six_concurrent_retries_one_row; payload_conflict_rejected; no_automatic_lead_or_payment");
  const network = hash(randomBytes(20).toString("hex"));
  const burst = await Promise.all(Array.from({ length: 8 }, () => call(input(),hash(randomBytes(20).toString("hex")),network)));
  assert.equal(burst.filter(value => value === "saved").length,5); assert.equal(burst.filter(value => value === "limited").length,3);
  const emailPayload = input(); for(let n=0;n<3;n++) assert.equal(await call(emailPayload,hash(randomBytes(20).toString("hex"))),"saved");
  assert.equal(await call(emailPayload,hash(randomBytes(20).toString("hex"))),"limited");
  console.log("shared_concurrent_network_limit_5; shared_email_limit_3");
  await app.query("begin"); await app.query("select set_config('app.workspace_id',$1,true)",["22222222-2222-4222-8222-222222222222"]);
  assert.equal((await app.query("select count(*)::int as n from public_audit_requests")).rows[0].n,0);
  await app.query("rollback");
  console.log("non_bypass_other_workspace_queue_rows_zero");
  const before = Number((await owner.query("select count(*) as n from public_audit_requests")).rows[0].n);
  await owner.query("update public_audit_requests set retention_until=now()-interval '1 day' where nonce_hash=$1",[nonce]);
  const expired = Number((await owner.query("select count(*) as n from public_audit_requests where retention_until<=now()")).rows[0].n);
  const cleanup = await fetch(`${base}/api/cron/public-intake-retention`,{headers:{authorization:`Bearer ${process.env.CRON_SECRET}`}});
  assert.equal(cleanup.status,200); assert.equal((await cleanup.json()).removed,expired);
  assert.equal(Number((await owner.query("select count(*) as n from public_audit_requests")).rows[0].n),before-expired);
  assert.equal((await fetch(`${base}/api/cron/public-intake-retention`)).status,401);
  console.log("authenticated_cron_removed_expired_only; unauthenticated_cron_denied");
  const moment = Date.now()-3000; const random = randomBytes(24).toString("hex"); const raw = `${moment}.${random}`;
  const signed = `${raw}.${createHmac('sha256',process.env.PUBLIC_INTAKE_SECRET).update(`nonce:${raw}`).digest('hex')}`;
  const apiPayload = { ...input(), nonce:signed, companyFax:"" };
  const headers = { origin:base,"content-type":"application/json" };
  const response = await fetch(`${base}/api/public/audit-requests`,{method:"POST",headers,body:JSON.stringify(apiPayload)});
  assert.equal(response.status,201);
  assert.equal((await fetch(`${base}/api/public/audit-requests`,{method:"POST",headers,body:JSON.stringify(apiPayload)})).status,200);
  assert.equal((await fetch(`${base}/api/public/audit-requests`,{method:"POST",headers:{...headers,origin:"https://attacker.example"},body:JSON.stringify(apiPayload)})).status,403);
  assert.equal((await fetch(`${base}/api/public/audit-requests`,{method:"POST",headers,body:"x".repeat(8193)})).status,413);
  assert.equal((await fetch(`${base}/api/public/audit-requests`)).status,405);
  console.log("real_api_save_retry_origin_size_and_no_enumeration_ok");
} finally { await Promise.all([owner.end(),submit.end(),app.end()]); }
