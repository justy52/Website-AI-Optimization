import { randomUUID } from "node:crypto";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb } from "./client";
import { createRuntimePool } from "./runtime-role";
import { withTenantContext } from "./tenant";
import { createWorkspaceForAuthenticatedUser, listActiveWorkspaceMembershipsForUser } from "@/server/workspaces";
import type { Db } from "./client";

const runtimeUrl = process.env.OPTIQ_RUNTIME_TEST_URL;
const ownerUrl = process.env.OPTIQ_RUNTIME_OWNER_TEST_URL;
const targetHost = process.env.RUNTIME_ROLE_TARGET_HOST;
const targetDatabase = process.env.RUNTIME_ROLE_TARGET_DATABASE;
describe.skipIf(!runtimeUrl || !ownerUrl)("live restricted runtime role", () => {
  it("enforces tenant isolation, auth bootstrap, scheduler and object permissions through the real login", async () => {
    for (const value of [runtimeUrl!, ownerUrl!]) {
      const url = new URL(value);
      if (url.hostname !== targetHost || url.pathname !== `/${targetDatabase}`) {
        throw new Error("Live test URL does not match the explicit isolated target.");
      }
    }
    const pool = createRuntimePool(runtimeUrl!);
    const client = await pool.connect();
    const a = randomUUID(), b = randomUUID(), userA = randomUUID(), userB = randomUUID();
    const setTenant = (id: string) => client.query("select set_config('app.workspace_id',$1,true)", [id]);
    const denied = async (query: string, code: string) => {
      await client.query("SAVEPOINT denied");
      try {
        await expect(client.query(query)).rejects.toMatchObject({ code });
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT denied");
        await client.query("RELEASE SAVEPOINT denied");
      }
    };
    try {
      const identity = (await client.query("select current_user,session_user,rolbypassrls,rolsuper,rolcreaterole,rolcreatedb from pg_roles where rolname=current_user")).rows[0];
      expect(identity).toMatchObject({ current_user: "virelantic_runtime", session_user: "virelantic_runtime", rolbypassrls: false, rolsuper: false, rolcreaterole: false, rolcreatedb: false });
      await client.query("BEGIN");
      // All fixture writes, including auth records, roll back even on failure.
      for (const [tenant, user] of [[a, userA], [b, userB]]) {
        await setTenant(tenant);
        await client.query('insert into "user"(id,name,email) values($1,$1,$2)', [user, `${user}@example.test`]);
        await client.query("insert into workspaces(id,name,slug) values($1::uuid,'Runtime proof',$2)", [tenant, `proof-${tenant}`]);
        await client.query("insert into workspace_memberships(workspace_id,user_id,role,status) values($1,$2,'OWNER','ACTIVE')", [tenant, user]);
        await client.query("insert into leads(workspace_id,company_name) values($1,'Runtime proof')", [tenant]);
      }
      // No SQL workspace WHERE clause: PostgreSQL itself must hide the other tenant.
      await setTenant(a);
      expect((await client.query("select id from workspaces")).rows).toEqual([{ id: a }]);
      const tables = (await client.query(`select c.relname, c.relrowsecurity, c.relforcerowsecurity
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r' and exists(
          select from pg_attribute a where a.attrelid=c.oid and a.attname='workspace_id' and not a.attisdropped)`)).rows;
      expect(tables.length).toBeGreaterThanOrEqual(56);
      for (const table of tables) {
        expect(table.relrowsecurity && table.relforcerowsecurity).toBe(true);
        const name = '"' + table.relname.replaceAll('"', '""') + '"';
        expect((await client.query(`select count(*)::int as count from ${name} where workspace_id<>$1`, [a])).rows[0].count).toBe(0);
      }
      expect((await client.query("update leads set company_name='wrong' where workspace_id=$1 returning id", [b])).rowCount).toBe(0);
      expect((await client.query("delete from leads where workspace_id=$1 returning id", [b])).rowCount).toBe(0);
      await denied(`insert into leads(workspace_id,company_name) values('${b}','wrong')`, "42501");
      await denied(`update leads set workspace_id='${b}' where workspace_id='${a}'`, "42501");
      expect((await client.query("update leads set company_name='own update' returning id")).rowCount).toBe(1);
      expect((await client.query("delete from leads returning id")).rowCount).toBe(1);
      await setTenant(b);
      expect((await client.query("select workspace_id from leads")).rows).toEqual([{ workspace_id: b }]);
      await setTenant("");
      expect((await client.query("select id from workspaces")).rows).toEqual([]);
      expect((await client.query("select id from leads")).rows).toEqual([]);
      await client.query("select set_config('app.user_id',$1,true)", [userA]);
      expect((await client.query("select id from workspaces")).rows).toEqual([{ id: a }]);
      expect((await client.query("select user_id from workspace_memberships")).rows).toEqual([{ user_id: userA }]);
      await denied("update service_plan_definitions set active=false", "42501");
      await denied("update agent_definitions set id=id", "42501");
      await denied("truncate leads", "42501");
      await denied("alter table leads disable row level security", "42501");
      await denied("create table public.runtime_should_not_create(id integer)", "42501");
      await denied('select * from drizzle.__drizzle_migrations', "42501");
      await denied('set role optiq_qa_owner', "42501");
      expect((await client.query("update platform_operations set reason='must not update' returning id")).rowCount).toBe(0);
      await client.query("select set_config('app.platform_operator','true',true)");
      expect((await client.query("update platform_operations set reason='isolated rollback proof' returning id")).rowCount).toBe(1);
      for (const name of ["bootstrap_due_monitoring_schedules", "bootstrap_due_monthly_cycle_clients", "list_ai_visibility_site_refs", "list_retention_workspace_refs"]) {
        const result = await client.query(`select * from public.${name}(1)`);
        expect(result.rowCount).toBeLessThanOrEqual(1);
      }
      await client.query("ROLLBACK");
      // Transaction-local workspace and user context cannot leak on connection reuse.
      expect((await client.query("select id from workspaces")).rows).toEqual([]);
      expect((await client.query("select id from leads")).rows).toEqual([]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
    // Exercise the actual Drizzle application path and transaction context too.
    const database = createDb(runtimeUrl!);
    try {
      const result = await withTenantContext(database, { workspaceId: a, actorType: "SYSTEM", role: "OWNER" }, tx => tx.execute(sql`select current_user as role_name`));
      expect(result.rows[0]).toMatchObject({ role_name: "virelantic_runtime" });
      const rollback = new Error("rollback application fixtures");
      await expect(database.transaction(async tx => {
        await tx.execute(sql`insert into "user"(id,name,email) values(${userA},'Application role proof',${`${userA}@example.test`})`);
        const workspace = await createWorkspaceForAuthenticatedUser({ userId: userA, name: "Application role proof" }, tx as unknown as Db);
        // Clear the tenant setting before using authenticated membership bootstrap.
        await tx.execute(sql`select set_config('app.workspace_id','',true)`);
        const memberships = await listActiveWorkspaceMembershipsForUser(userA, tx as unknown as Db);
        expect(memberships.map(m => m.workspaceId)).toEqual([workspace.id]);
        throw rollback;
      })).rejects.toBe(rollback);
    } finally { await database.$client.end(); }
    // Reject the owner before both direct queries and transaction checkout, even
    // if another caller enables Neon's HTTP pool.query fast path globally.
    const previousFetch = neonConfig.poolQueryViaFetch;
    neonConfig.poolQueryViaFetch = true;
    const unsafe = createRuntimePool(ownerUrl!);
    try {
      await expect(unsafe.query("select 1")).rejects.toThrow("Unsafe database runtime role");
      await expect(unsafe.connect()).rejects.toThrow("Unsafe database runtime role");
    } finally { await unsafe.end(); neonConfig.poolQueryViaFetch = previousFetch; }
    // An unguarded owner connection still works for the separate migration job.
    const owner = new Pool({ connectionString: ownerUrl! });
    try { expect((await owner.query("select 1 as ok")).rows[0].ok).toBe(1); }
    finally { await owner.end(); }
  }, 120_000);
});
