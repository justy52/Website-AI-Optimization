import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const tenantTables = [
  "workspaces",
  "workspace_memberships",
  "leads",
  "clients",
  "websites",
  "approval_policies",
  "integration_connections",
  "workspace_feature_flags",
  "activity_events",
] as const;

function readMigration(name: string): string {
  return readFileSync(join(process.cwd(), "drizzle", name), "utf8");
}

describe("phase 0 migrations", () => {
  it("enables and forces RLS on every tenant-owned table", () => {
    const migration = readMigration("0001_phase0_rls_policies.sql");

    for (const table of tenantTables) {
      expect(migration).toContain(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`,
      );
      expect(migration).toContain(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`,
      );
      expect(migration).toContain(
        `CREATE POLICY "${table}_workspace_context" ON "${table}"`,
      );
    }
  });

  it("keeps service-plan seed initialization idempotent", () => {
    const migration = readMigration("0002_seed_service_plan_definitions.sql");

    expect(migration).toContain('ON CONFLICT ("version", "plan") DO UPDATE');
  });

  it("uses composite tenant foreign keys for cross-owned records", () => {
    const migration = readMigration("0000_phase0_foundation.sql");

    expect(migration).toContain(
      'CONSTRAINT "clients_source_lead_workspace_fk" FOREIGN KEY ("workspace_id","source_lead_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "websites_client_workspace_fk" FOREIGN KEY ("workspace_id","client_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "integration_connections_client_workspace_fk" FOREIGN KEY ("workspace_id","client_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "integration_connections_website_workspace_fk" FOREIGN KEY ("workspace_id","website_id")',
    );
  });

  it("does not include destructive table or type drops", () => {
    const migration = [
      readMigration("0000_phase0_foundation.sql"),
      readMigration("0001_phase0_rls_policies.sql"),
      readMigration("0002_seed_service_plan_definitions.sql"),
    ].join("\n");

    expect(migration).not.toMatch(/\bDROP\s+(TABLE|TYPE|SCHEMA|DATABASE)\b/i);
  });
});
