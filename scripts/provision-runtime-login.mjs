import { Pool } from "@neondatabase/serverless";

// Run in a migration/admin job. No owner URL or password is ever printed.
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
const password = process.env.RUNTIME_DATABASE_PASSWORD;
const expectedHost = process.env.RUNTIME_ROLE_TARGET_HOST;
const expectedDatabase = process.env.RUNTIME_ROLE_TARGET_DATABASE;
if (!ownerUrl || !password || password.length < 32 || !expectedHost || !expectedDatabase) {
  throw new Error("Migration URL, 32+ character runtime password, and explicit target host/database are required.");
}
const target = new URL(ownerUrl);
if (target.hostname !== expectedHost || target.pathname !== `/${expectedDatabase}` || target.hostname.includes("-pooler.")) {
  throw new Error("Owner connection does not match the explicit direct migration target.");
}
const pool = new Pool({ connectionString: ownerUrl });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const identity = (await client.query("select current_database() as database")).rows[0];
  if (identity.database !== expectedDatabase) throw new Error("Unexpected database identity.");
  const role = (await client.query(`select rolcanlogin, rolsuper, rolbypassrls,
    rolcreaterole, rolcreatedb, rolreplication, rolinherit,
    exists(select from pg_auth_members where member=r.oid) as member
    from pg_roles r where rolname='virelantic_runtime'`)).rows[0];
  if (!role || role.rolsuper || role.rolbypassrls || role.rolcreaterole || role.rolcreatedb || role.rolreplication || role.rolinherit || role.member) {
    throw new Error("Apply the runtime-role migration and resolve unsafe role attributes first.");
  }
  if (role.rolcanlogin && !process.argv.includes("--rotate-password")) {
    throw new Error("Runtime login already exists. Explicit --rotate-password is required to replace its credential.");
  }
  // Utility statements do not accept bind parameters. Quote a literal, never an identifier.
  await client.query("SET LOCAL standard_conforming_strings = on");
  const literal = "'" + password.replaceAll("'", "''") + "'";
  await client.query(`ALTER ROLE virelantic_runtime LOGIN PASSWORD ${literal}`);
  await client.query("COMMIT");
  console.log("Restricted runtime login provisioned for the verified target. No application environment was changed.");
} catch {
  await client.query("ROLLBACK");
  throw new Error("Runtime provisioning failed; transaction rolled back. Check target, migration, role attributes, and rotation flag.");
} finally {
  client.release();
  await pool.end();
}
