import { Pool, type PoolClient } from "@neondatabase/serverless";

// Verify the database identity, not the username in the connection string.
// A non-bypass login can still SET ROLE through membership, or own objects.
export const runtimeRoleCheckSql = `
  select current_user as role_name,
    r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb
      or r.rolreplication or r.rolinherit
      or exists (select from pg_auth_members where member = r.oid)
      or exists (select from pg_class where relowner = r.oid and relnamespace = 'public'::regnamespace)
      or exists (select from pg_database where datdba = r.oid)
      or exists (select from pg_namespace where nspowner = r.oid)
      or exists (select from pg_proc where proowner = r.oid)
      or has_schema_privilege(current_user, 'public', 'CREATE')
      or has_database_privilege(current_user, current_database(), 'CREATE')
      as unsafe
  from pg_roles r where rolname = current_user
`;

export async function assertRuntimeRole(client: Pick<PoolClient, "query">) {
  const { rows } = await client.query<{ role_name: string; unsafe: boolean }>(runtimeRoleCheckSql);
  if (rows.length !== 1 || rows[0].role_name !== "virelantic_runtime" || rows[0].unsafe) {
    throw new Error("Unsafe database runtime role. Use the restricted virelantic_runtime login; keep migration credentials outside the application.");
  }
}

export function createRuntimePool(connectionString: string) {
  // pg-pool's verify callback gates each new physical connection before either
  // query() or connect() receives it. Verified in the installed Neon driver.
  const options = {
    connectionString,
    verify(client: PoolClient, done: (error?: Error) => void) {
      void assertRuntimeRole(client).then(() => done(), (error: Error) => done(error));
    },
  };
  const pool = new Pool(options);
  // Neon may otherwise route pool.query() over HTTP, skipping pg-pool.verify.
  // A connect listener disables that fast path in the installed driver.
  pool.on("connect", () => {});
  // An idle connection the database closes emits "error" on the pool. With no
  // listener Node treats that as fatal and the request in progress fails.
  pool.on("error", (error: Error) => {
    console.error("db_pool_idle_connection_error", { name: error?.name ?? "Error" });
  });
  return pool;
}
