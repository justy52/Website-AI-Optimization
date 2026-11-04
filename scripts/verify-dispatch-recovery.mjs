import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { Pool } from "@neondatabase/serverless";

config({ path: ".env.dispatch-test.local", quiet: true });
// This branch was created for this proof, from the disposable test project.
// Never substitute a customer/QA/default endpoint to make this guard pass.
const expected = "ep-ancient-block-arf2ydag.c-4.us-west-2.aws.neon.tech";
for (const key of ["DISPATCH_TEST_ADMIN_URL", "DISPATCH_TEST_RUNNER_URL"]) {
  const url = new URL(process.env[key]);
  if (url.hostname !== expected || url.pathname !== "/optiq_phase5_review_final_20260922") throw new Error("Isolated dispatch proof branch required");
}
const owner = new Pool({ connectionString: process.env.DISPATCH_TEST_ADMIN_URL });
try {
  const exists = await owner.query("select 1 from information_schema.columns where table_name='agent_runs' and column_name='dispatch_attempts'");
  if (!exists.rows.length) {
    await owner.query("begin");
    await owner.query(readFileSync("drizzle/0018_durable_workflow_dispatch.sql", "utf8"));
    await owner.query("commit");
    console.log("migration_0018_applied_on_isolated_branch");
  } else {
    // This private proof branch is manually migrated. Refresh only this
    // not-yet-shared function while iterating the review candidate.
    const migration = readFileSync("drizzle/0018_durable_workflow_dispatch.sql", "utf8");
    await owner.query(migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.list_queued_dispatch_refs")));
  }
  await owner.query("GRANT EXECUTE ON FUNCTION public.list_queued_dispatch_refs(integer) TO optiq_phase1_rls_runner");
} finally { await owner.end(); }
const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "src/server/dispatch-recovery.live.test.ts", "--reporter=verbose"], {
  env: process.env, stdio: "inherit", windowsHide: true,
});
process.exitCode = result.status ?? 1;
