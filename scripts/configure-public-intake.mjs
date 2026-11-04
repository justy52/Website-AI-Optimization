// Run after migrations with the database migration-owner credential in
// DATABASE_URL_UNPOOLED, the normal runtime DATABASE_URL, and the public facts
// documented in docs/public-intake.md. Does not enable or deploy the website.
import { Pool } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { config } from "dotenv";
config({path:".env.local",quiet:true});
const required = ["DATABASE_URL_UNPOOLED","DATABASE_URL","PUBLIC_INTAKE_WORKSPACE_ID","PUBLIC_INTAKE_ORIGIN","PUBLIC_BUSINESS_NAME","PUBLIC_CONTACT_EMAIL"];
for(const key of required) if(!process.env[key]) throw new Error(`Missing ${key}`);
if(existsSync(".env.intake.local")) throw new Error("Refusing to overwrite existing intake credentials.");
if(!/^[0-9a-f-]{36}$/i.test(process.env.PUBLIC_INTAKE_WORKSPACE_ID)) throw new Error("Invalid workspace UUID");
const origin = new URL(process.env.PUBLIC_INTAKE_ORIGIN);
if(origin.origin !== origin.href.replace(/\/$/,"") || origin.protocol !== "https:") throw new Error("A public HTTPS origin is required");
const ownerUrl = new URL(process.env.DATABASE_URL_UNPOOLED);
const runtimeUrl = new URL(process.env.DATABASE_URL);
if(ownerUrl.hostname.replace("-pooler.",".") !== runtimeUrl.hostname.replace("-pooler.",".") || ownerUrl.pathname !== runtimeUrl.pathname) throw new Error("App and migration connections must name the same database");
const runtimeRole = decodeURIComponent(runtimeUrl.username);
if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(runtimeRole)) throw new Error("Runtime role needs a standard identifier");
const role = "virelantic_intake_public_submit";
const pool = new Pool({connectionString:ownerUrl.toString()});
try {
  const functionOwner = (await pool.query("select pg_get_userbyid(proowner) as owner from pg_proc where oid='public.submit_public_audit_request(jsonb,text,text,text,text,uuid)'::regprocedure")).rows[0];
  const currentUser = (await pool.query("select current_user as name")).rows[0].name;
  if(functionOwner.owner !== currentUser) throw new Error("Run as the intake migration/function owner");
  if((await pool.query("select 1 from pg_roles where rolname=$1",[role])).rowCount) throw new Error("Intake role already exists; inspect its privileges and reuse its existing credential instead of rotating automatically");
  const workspace = process.env.PUBLIC_INTAKE_WORKSPACE_ID;
  await pool.query("begin");
  await pool.query("select set_config('app.workspace_id',$1,true)",[workspace]);
  if(!(await pool.query("select id from workspaces where id=$1 and archived_at is null",[workspace])).rowCount) throw new Error("Active destination workspace not found");
  const destination = (await pool.query("select workspace_id from public_intake_destination where singleton=true for update")).rows[0];
  if(destination && destination.workspace_id !== workspace) throw new Error("Refusing to reroute an existing intake destination");
  const password = randomBytes(32).toString("hex");
  await pool.query(`create role ${role} login noinherit nosuperuser nocreatedb nocreaterole nobypassrls password '${password}'`);
  await pool.query(`grant usage on schema public to ${role}; grant execute on function public.submit_public_audit_request(jsonb,text,text,text,text,uuid) to ${role}; grant execute on function public.purge_public_intake() to "${runtimeRole}"; grant select,insert,update,delete on public.public_audit_requests to "${runtimeRole}"`);
  await pool.query("insert into public_intake_destination(singleton,workspace_id) values(true,$1) on conflict(singleton) do nothing",[workspace]);
  const permissions = (await pool.query("select has_table_privilege($1,'public.public_audit_requests','SELECT') as read,has_table_privilege($1,'public.leads','SELECT') as leads,has_schema_privilege($1,'public','CREATE') as create_schema",[role])).rows[0];
  if(permissions.read || permissions.leads || permissions.create_schema) throw new Error("Publicly inherited privileges are too broad; revoke those grants from PUBLIC before enabling intake");
  const submitUrl = new URL(runtimeUrl); submitUrl.username = role; submitUrl.password = password;
  const values = {
    PUBLIC_INTAKE_ENABLED:"false", PUBLIC_INTAKE_DATABASE_URL:submitUrl.toString(),
    PUBLIC_INTAKE_SECRET:randomBytes(32).toString("hex"),
    PUBLIC_INTAKE_WORKSPACE_ID:workspace, PUBLIC_INTAKE_ORIGIN:origin.origin,
    PUBLIC_BUSINESS_NAME:process.env.PUBLIC_BUSINESS_NAME, PUBLIC_CONTACT_EMAIL:process.env.PUBLIC_CONTACT_EMAIL,
  };
  writeFileSync(".env.intake.local",Object.entries(values).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join("\n")+"\n",{flag:"wx"});
  await pool.query("commit");
  console.log("restricted_intake_role_and_destination_ready; secrets_saved_to_ignored_env_intake_local; intake_remains_disabled");
} catch(error) { await pool.query("rollback"); throw error; }
finally { await pool.end(); }
