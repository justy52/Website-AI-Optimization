import { readFileSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".vercel/.env.phase5-test.local", quiet: true });
const ownerUrl = process.env.OPTIQ_TEST_DATABASE_URL?.replace("-pooler.", ".");
const runnerUrl = process.env.OPTIQ_TEST_RUNNER_URL?.replace("-pooler.", ".");
for (const value of [ownerUrl, runnerUrl]) {
  if (!value || !["ep-shy-firefly-arkuloja.c-4.us-west-2.aws.neon.tech"].includes(new URL(value).hostname) || !/^\/optiq_phase5_review_(final_)?20260922$/.test(new URL(value).pathname)) {
    throw new Error("Only the designated fresh Phase 5 disposable proof database is allowed.");
  }
}
const owner = new Pool({ connectionString: ownerUrl });
const runner = new Pool({ connectionString: runnerUrl });
try {
  const existing = await owner.query("select count(*)::int n from information_schema.tables where table_schema='public'");
  if (existing.rows[0].n !== 0) throw new Error("Fresh proof requires an empty database; no reset is performed.");
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) {
    const migration = readFileSync(`drizzle/${entry.tag}.sql`, "utf8");
    await owner.query(migration);
    console.log(`migration_ok=${entry.tag}`);
  }
  await owner.query("GRANT USAGE ON SCHEMA public TO optiq_phase1_rls_runner; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO optiq_phase1_rls_runner; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO optiq_phase1_rls_runner;");
  const role = (await runner.query("select current_user, rolsuper, rolbypassrls from pg_roles where rolname=current_user")).rows[0];
  if (role.rolsuper || role.rolbypassrls) throw new Error("Proof role bypasses RLS");
  console.log(`non_bypass_role=${JSON.stringify(role)}`);
  const connection = await runner.connect();
  try {
    for (const phase of [1, 2, 3]) {
      const sql = readFileSync(`scripts/phase${phase}-live-postgres-rls.sql`, "utf8").split(/\r?\n/).filter(line => !line.startsWith("\\")).join("\n");
      await connection.query(sql);
      console.log(`phase${phase}_live_rls_ok`);
    }
  } finally { connection.release(); }
  console.log("fresh_chain_through_0011_ok");
} finally {
  await owner.end();
  await runner.end();
}
