// Disposable branch only. Reads its owner connection on stdin; writes ignored
// local preview credentials. Never points at QA or a default/production branch.
import { Pool } from "@neondatabase/serverless";
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

console.log("Ready for disposable branch connection on stdin.");
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const input = createInterface({ input: process.stdin });
const line = await new Promise(resolve => input.once("line", resolve));
input.close();
const url = new URL(JSON.parse(line).connection);
if (url.hostname.replace("-pooler.", ".") !== "ep-delicate-paper-arppa8no.c-4.us-west-2.aws.neon.tech") throw new Error("Wrong disposable branch.");
url.hostname = url.hostname.replace("-pooler.", ".");
const root = new Pool({ connectionString: url.toString() });
const databaseName = "virelantic_public_intake_preview";
if ((await root.query("select 1 from pg_database where datname=$1", [databaseName])).rowCount) throw new Error("Preview already exists; reuse its ignored local environment.");
await root.query(`create database ${databaseName}`);
await root.end();
url.pathname = `/${databaseName}`;
const owner = new Pool({ connectionString: url.toString() });
const appPassword = randomBytes(32).toString("hex");
const intakePassword = randomBytes(32).toString("hex");
const appRole = "virelantic_intake_preview_app";
const publicRole = "virelantic_intake_preview_submit";
try {
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) {
    await owner.query(readFileSync(`drizzle/${entry.tag}.sql`, "utf8"));
    console.log(`migration_ok=${entry.tag}`);
  }
  await owner.query(`create role ${appRole} login noinherit nosuperuser nobypassrls password '${appPassword}'`);
  await owner.query(`create role ${publicRole} login noinherit nosuperuser nobypassrls password '${intakePassword}'`);
  await owner.query(`revoke create on schema public from public; grant usage on schema public to ${appRole},${publicRole}; grant select,insert,update,delete on all tables in schema public to ${appRole}; grant usage,select on all sequences in schema public to ${appRole}; grant execute on function public.submit_public_audit_request(jsonb,text,text,text,text,uuid) to ${publicRole}; grant execute on function public.purge_public_intake() to ${appRole}`);
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  await owner.query("select set_config('app.workspace_id',$1,false)", [workspaceId]);
  await owner.query("insert into workspaces(id,name,slug) values($1,'Virelantic Intake Preview','virelantic-intake-preview')", [workspaceId]);
  await owner.query("insert into public_intake_destination(singleton,workspace_id) values(true,$1)", [workspaceId]);
  const appUrl = new URL(url); appUrl.username = appRole; appUrl.password = appPassword;
  const publicUrl = new URL(url); publicUrl.username = publicRole; publicUrl.password = intakePassword;
  const env = {
    APP_ENV: "local", DATABASE_URL: appUrl.toString(), DATABASE_URL_UNPOOLED: url.toString(),
    BETTER_AUTH_URL: "http://localhost:3107", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString("hex"), PUBLIC_INTAKE_ENABLED: "true",
    PUBLIC_INTAKE_ORIGIN: "http://localhost:3107", PUBLIC_INTAKE_DATABASE_URL: publicUrl.toString(),
    PUBLIC_INTAKE_SECRET: randomBytes(32).toString("hex"), PUBLIC_INTAKE_WORKSPACE_ID: workspaceId,
    PUBLIC_BUSINESS_NAME: "Virelantic — isolated test configuration", PUBLIC_CONTACT_EMAIL: "preview@example.com",
    CRON_SECRET: randomBytes(32).toString("hex"),
  };
  writeFileSync(".env.local", Object.entries(env).map(([key,value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n");
  console.log("disposable_preview_ready; restricted_app_and_submit_roles; ignored_env_written; synthetic_business_contact_only");
} finally { await owner.end(); }
