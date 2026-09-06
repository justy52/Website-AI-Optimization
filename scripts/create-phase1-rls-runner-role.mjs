import { Pool } from "@neondatabase/serverless";

const ownerConnectionString = process.env.OPTIQ_OWNER_DATABASE_URL;
const runnerPassword = process.env.OPTIQ_RLS_RUNNER_PASSWORD;

if (!ownerConnectionString) {
  throw new Error("Set OPTIQ_OWNER_DATABASE_URL for the disposable test database.");
}

if (!runnerPassword) {
  throw new Error("Set OPTIQ_RLS_RUNNER_PASSWORD for the disposable RLS runner role.");
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

const pool = new Pool({ connectionString: ownerConnectionString });

try {
  const existing = await pool.query(
    "select 1 from pg_roles where rolname = 'optiq_phase1_rls_runner'",
  );

  if (existing.rowCount === 0) {
    await pool.query(
      `CREATE ROLE optiq_phase1_rls_runner LOGIN PASSWORD ${quoteLiteral(
        runnerPassword,
      )} NOBYPASSRLS`,
    );
  } else {
    await pool.query(
      `ALTER ROLE optiq_phase1_rls_runner PASSWORD ${quoteLiteral(
        runnerPassword,
      )} NOBYPASSRLS`,
    );
  }

  await pool.query("GRANT USAGE ON SCHEMA public TO optiq_phase1_rls_runner");
  await pool.query(
    "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO optiq_phase1_rls_runner",
  );
  await pool.query(
    "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO optiq_phase1_rls_runner",
  );

  const role = await pool.query(
    "select rolname, rolsuper, rolbypassrls from pg_roles where rolname = 'optiq_phase1_rls_runner'",
  );

  console.log(`runner_role=${JSON.stringify(role.rows[0])}`);
} finally {
  await pool.end();
}
