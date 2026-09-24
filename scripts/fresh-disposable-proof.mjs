import { readFileSync, writeFileSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";
import { config } from "dotenv";

// This is the dedicated optiq-phase1-test project (aged-cloud-70719532), never QA.
config({ path: ".vercel/.env.phase5-test.local", quiet: true });
const urls = [process.env.OPTIQ_TEST_DATABASE_URL, process.env.OPTIQ_TEST_RUNNER_URL];
for (const value of urls) {
  if (!value) throw new Error("Disposable test connection required");
  const url = new URL(value);
  if (url.hostname.replace("-pooler.", ".") !== "ep-shy-firefly-arkuloja.c-4.us-west-2.aws.neon.tech" || url.pathname !== "/optiq_phase5_review_final_20260922") throw new Error("Refusing any target other than the designated disposable test database");
}
if (!process.argv.includes("--reset-reviewed-disposable")) throw new Error("Explicit disposable reset flag required");
const owner = new Pool({ connectionString: urls[0].replace("-pooler.", ".") });
const runner = new Pool({ connectionString: urls[1].replace("-pooler.", ".") });
const connection = await owner.connect();
const tenants = ["00000000-0000-4000-8000-0000000000a1", "00000000-0000-4000-8000-0000000000b1"];
const quote = value => '"' + value.replaceAll('"', '""') + '"';
try {
  const tables = (await connection.query("select tablename from pg_tables where schemaname='public'")).rows.map(r => r.tablename);
  const edges = (await connection.query("select a.relname child,b.relname parent from pg_constraint f join pg_class a on a.oid=f.conrelid join pg_class b on b.oid=f.confrelid join pg_namespace n on n.oid=a.relnamespace where f.contype='f' and n.nspname='public' and a.oid<>b.oid")).rows;
  const ordered = [];
  while (ordered.length < tables.length) {
    const ready = tables.filter(t => !ordered.includes(t) && edges.filter(e => e.child === t).every(e => ordered.includes(e.parent)));
    if (!ready.length) throw new Error("Fixture FK dependency cycle");
    ordered.push(...ready);
  }
  const reuse = process.argv.includes("--reuse-reviewed-fixtures");
  const fixtures = reuse ? JSON.parse(readFileSync(".vercel/disposable-proof-fixtures.json", "utf8")) : {};
  for (const table of reuse ? [] : ordered) {
    const unique = new Map();
    for (const tenant of tenants) {
      await connection.query("select set_config('app.workspace_id',$1,false)", [tenant]);
      const rows = (await connection.query(`select * from ${quote(table)}`)).rows;
      if (rows.length > 5000) throw new Error("Unexpected fixture volume");
      rows.forEach(row => unique.set(JSON.stringify(row), row));
    }
    fixtures[table] = [...unique.values()];
  }
  // Recovery copy contains only disposable fixtures; never log row contents.
  if (!reuse) writeFileSync(".vercel/disposable-proof-fixtures.json", JSON.stringify(fixtures));
  await connection.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) {
    await connection.query(readFileSync(`drizzle/${entry.tag}.sql`, "utf8"));
    console.log(`migration_ok=${entry.tag}`);
  }
  await connection.query("GRANT USAGE ON SCHEMA public TO optiq_phase1_rls_runner; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO optiq_phase1_rls_runner; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO optiq_phase1_rls_runner;");
  const role = (await runner.query("select rolsuper,rolbypassrls from pg_roles where rolname=current_user")).rows[0];
  if (role.rolsuper || role.rolbypassrls) throw new Error("Test role must not bypass RLS");
  const rls = await runner.connect();
  try {
    for (const phase of [1, 2, 3]) {
      await rls.query(readFileSync(`scripts/phase${phase}-live-postgres-rls.sql`, "utf8").split(/\r?\n/).filter(l => !l.startsWith("\\")).join("\n"));
      console.log(`phase${phase}_live_rls_ok`);
    }
  } finally { rls.release(); }
  const definitions = (await connection.query("select id,key,version from agent_definitions")).rows;
  for (const run of fixtures.agent_runs ?? []) {
    if (!run.agent_definition_id) continue;
    const old = fixtures.agent_definitions.find(d => d.id === run.agent_definition_id);
    const current = definitions.find(d => d.key === old?.key && d.version === old?.version);
    if (!current) throw new Error("Historical fixture definition missing after migration");
    run.agent_definition_id = current.id;
  }
  for (const table of ordered.filter(t => !["agent_definitions", "service_plan_definitions"].includes(t))) {
    for (const row of fixtures[table]) {
      await connection.query("select set_config('app.workspace_id',$1,false)", [row.workspace_id ?? row.id ?? tenants[0]]);
      const columns = Object.keys(row).map(quote).join(",");
      await connection.query(`insert into ${quote(table)} (${columns}) select ${columns} from json_populate_record(null::${quote(table)}, $1::json) on conflict do nothing`, [JSON.stringify(row)]);
    }
  }
  // A rerun may not mutate any catalog version, including IDs and timestamps.
  const before = JSON.stringify((await connection.query("select * from agent_definitions order by key,version")).rows);
  await connection.query(readFileSync("drizzle/0012_phase6_agent_catalog.sql", "utf8"));
  const after = JSON.stringify((await connection.query("select * from agent_definitions order by key,version")).rows);
  if (before !== after) throw new Error("Catalog migration is not immutable/idempotent");
  console.log(`fresh_chain_ok=${journal.entries.at(-1).tag}; non_bypass_rls_ok; fixture_restore_ok; immutable_catalog_rerun_ok`);
} finally { connection.release(); await owner.end(); await runner.end(); }
