import { Pool } from "@neondatabase/serverless";

const connectionString =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const roleName = process.env.RLS_TEST_ROLE;
const rolePassword = process.env.RLS_TEST_PASSWORD;

if (!connectionString || !roleName || !rolePassword) {
  throw new Error(
    "DATABASE_URL, RLS_TEST_ROLE, and RLS_TEST_PASSWORD are required.",
  );
}

if (!/^[a-z_][a-z0-9_]*$/i.test(roleName)) {
  throw new Error("RLS_TEST_ROLE must be a simple SQL identifier.");
}

const escapedPassword = rolePassword.replaceAll("'", "''");
const pool = new Pool({ connectionString });

try {
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${roleName}') THEN
        CREATE ROLE ${roleName}
          LOGIN PASSWORD '${escapedPassword}'
          NOSUPERUSER NOBYPASSRLS;
      ELSE
        ALTER ROLE ${roleName}
          WITH LOGIN PASSWORD '${escapedPassword}';
      END IF;
    END $$;
  `);
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${roleName}`);
  await pool.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${roleName}`,
  );
  await pool.query(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${roleName}`,
  );
  await pool.query(
    `GRANT EXECUTE ON FUNCTION public.current_app_workspace_id() TO ${roleName}`,
  );
  await pool.query(
    `GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO ${roleName}`,
  );
  console.log(`RLS test role ${roleName} is ready.`);
} finally {
  await pool.end();
}
