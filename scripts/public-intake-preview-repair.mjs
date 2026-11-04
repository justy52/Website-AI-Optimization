// Repair only the retained disposable preview's function grant after a local edit.
import { Pool } from "@neondatabase/serverless";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
config({ path: ".env.local", quiet: true });
const url = new URL(process.env.DATABASE_URL_UNPOOLED);
if (url.hostname !== "ep-delicate-paper-arppa8no.c-4.us-west-2.aws.neon.tech" || url.pathname !== "/virelantic_public_intake_preview") throw new Error("Not the disposable preview.");
const pool = new Pool({connectionString:url.toString()});
try {
  const migration = readFileSync("drizzle/0021_public_intake_capability.sql","utf8");
  const purge = migration.slice(migration.indexOf("CREATE FUNCTION public.purge_public_intake()"));
  await pool.query(purge.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"));
  await pool.query("grant execute on function public.purge_public_intake() to virelantic_intake_preview_app");
  if(!(await pool.query("select 1 from pg_constraint where conname='public_audit_requests_tenant_lead_fk'")).rowCount) await pool.query(readFileSync("drizzle/0022_intake_relationships.sql","utf8"));
  console.log("preview_cleanup_function_grant_ready");
} finally { await pool.end(); }
