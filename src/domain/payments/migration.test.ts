import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";

// Historical Neon migrations contain multiple DDL statements per breakpoint.
// PGlite's prepared query path rejects these; use its simple-query transport
// for unparameterized DDL while retaining the real Drizzle journal/migrator.
function migrationClient(client: PGlite): PGlite {
  return new Proxy(client, {
    get(target, key) {
      if (key === "query") return async (...args: Parameters<PGlite["query"]>) => {
        if (!args[1]?.length && !/^\s*(select|with)\b/i.test(args[0])) return (await target.exec(args[0])).at(-1) ?? { rows: [], fields: [] };
        return target.query(...args);
      };
      if (key === "transaction") return (operation: (tx: PGlite) => Promise<unknown>) => target.transaction(tx => operation(migrationClient(tx as unknown as PGlite)));
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

it("upgrades historical test payments without changing identity or replay history, and reruns as a no-op", async () => {
  const pg = new PGlite();
  const directory = mkdtempSync(join(tmpdir(), "virelantic-payment-upgrade-"));
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  try {
    mkdirSync(join(directory, "meta"));
    writeFileSync(join(directory, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.filter((entry: { idx: number }) => entry.idx < 26) }));
    for (const entry of journal.entries.filter((entry: { idx: number }) => entry.idx < 26)) copyFileSync(`drizzle/${entry.tag}.sql`, join(directory, `${entry.tag}.sql`));
    const database = drizzle(migrationClient(pg));
    await migrate(database, { migrationsFolder: directory });
    const workspace = "10000000-0000-4000-8000-000000000001", client = "10000000-0000-4000-8000-000000000002", site = "10000000-0000-4000-8000-000000000003", order = "10000000-0000-4000-8000-000000000004";
    await pg.exec(`INSERT INTO "user"(id,name,email) VALUES('upgrade-user','Synthetic user','upgrade@example.com')`);
    await pg.query("INSERT INTO workspaces(id,name,slug) VALUES($1,'Synthetic upgrade','synthetic-upgrade')", [workspace]);
    await pg.query("INSERT INTO clients(id,workspace_id,name) VALUES($1,$2,'Synthetic client')", [client, workspace]);
    await pg.query("INSERT INTO websites(id,workspace_id,client_id,display_name,domain,canonical_url) VALUES($1,$2,$3,'Synthetic','example.com','https://example.com')", [site, workspace, client]);
    await pg.query("INSERT INTO service_orders(id,workspace_id,client_id,website_id,service,scope_reference,scope_sha256,terms_version,signed_at,customer_email,delivery_operator,total_cents,deposit_cents,onboarding,created_by) VALUES($1,$2,$3,$4,'AUDIT_ONLY','synthetic-upgrade',repeat('a',64),'old-terms',now(),'synthetic@example.com','Synthetic operator',49500,49500,'{}','upgrade-user')", [order, workspace, client, site]);
    await pg.query("INSERT INTO service_payments(workspace_id,order_id,installment,amount_cents,account_id,base_url,state,session_id,customer_id,paid_at) VALUES($1,$2,'INITIAL',49500,'acct_fixture','https://qa.example.com','PAID','cs_test_historical','cus_fixture',now())", [workspace, order]);
    await pg.query("INSERT INTO service_payment_events(workspace_id,account_id,event_id,event_type,object_id,outcome) VALUES($1,'acct_fixture','evt_historical','checkout.session.completed','cs_test_historical','RECONCILED')", [workspace]);
    const before = await pg.query("SELECT (SELECT to_jsonb(o) FROM service_orders o) AS order_row,(SELECT to_jsonb(p) FROM service_payments p) AS payment_row,(SELECT to_jsonb(e) FROM service_payment_events e) AS event_row");
    await migrate(database, { migrationsFolder: "drizzle" });
    const after = await pg.query("SELECT (SELECT to_jsonb(o)-ARRAY['payment_mode','merchant_account_id','legal_seller','activation_approval_reference'] FROM service_orders o) AS order_row,(SELECT to_jsonb(p)-'payment_mode' FROM service_payments p) AS payment_row,(SELECT to_jsonb(e)-'payment_mode' FROM service_payment_events e) AS event_row");
    expect(after.rows).toEqual(before.rows);
    expect((await pg.query("SELECT payment_mode FROM service_orders UNION ALL SELECT payment_mode FROM service_payments UNION ALL SELECT payment_mode FROM service_payment_events")).rows).toEqual([{ payment_mode: "test" }, { payment_mode: "test" }, { payment_mode: "test" }]);
    await expect(pg.query("UPDATE service_payments SET payment_mode='live'")).rejects.toThrow("identity");
    await migrate(database, { migrationsFolder: "drizzle" });
    expect((await pg.query<{ count: number }>("SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations")).rows[0].count).toBe(journal.entries.length);
  } finally {
    await pg.close();
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith("virelantic-payment-upgrade-")) throw new Error("Unexpected migration-test directory");
    rmSync(directory, { recursive: true });
  }
}, 60000);
