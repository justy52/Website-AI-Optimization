import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const tenantTables = [
  "workspaces",
  "workspace_memberships",
  "leads",
  "clients",
  "websites",
  "audits",
  "audit_runs",
  "audit_evidence",
  "audit_check_results",
  "audit_category_scores",
  "audit_findings",
  "audit_snapshots",
  "reports",
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
    const migration = [
      readMigration("0001_phase0_rls_policies.sql"),
      readMigration("0003_phase1_revenue_loop.sql"),
    ].join("\n");

    for (const table of tenantTables) {
      expect(migration).toContain(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`,
      );
      expect(migration).toContain(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`,
      );
      if (table !== "workspace_memberships") {
        expect(migration).toContain(
          `CREATE POLICY "${table}_workspace_context" ON "${table}"`,
        );
      }
    }
  });

  it("keeps membership bootstrap scoped to the authenticated user without opening writes", () => {
    const migration = [
      readMigration("0003_phase1_revenue_loop.sql"),
      readMigration("0006_phase1_security_hardening.sql"),
    ].join("\n");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.current_app_user_id()");
    expect(migration).toContain(
      'CREATE POLICY "workspace_memberships_workspace_context_select"',
    );
    expect(migration).toContain('"user_id" = public.current_app_user_id()');
    expect(migration).toContain('"status" = \'ACTIVE\'');
    expect(migration).toContain(
      'CREATE POLICY "workspace_memberships_workspace_context_insert"',
    );
    expect(migration).toContain(
      'CREATE POLICY "workspace_memberships_workspace_context_update"',
    );
    expect(migration).toContain(
      'CREATE POLICY "workspace_memberships_workspace_context_delete"',
    );
    expect(migration).toContain(
      'CREATE POLICY "workspaces_bootstrap_active_membership_select"',
    );
    expect(migration).toContain("public.current_app_workspace_id() IS NULL");
    expect(migration).toContain('"workspace_memberships"."workspace_id" = "workspaces"."id"');
    expect(migration).toContain('"workspace_memberships"."user_id" = public.current_app_user_id()');
    expect(migration).toContain('"workspace_memberships"."status" = \'ACTIVE\'');
    expect(migration).toContain('"archived_at" IS NULL');
    expect(migration).toContain('"deletion_pending_at" IS NULL');
    expect(migration).not.toMatch(/SECURITY\s+DEFINER/i);
  });

  it("keeps service-plan seed initialization idempotent", () => {
    const migration = readMigration("0002_seed_service_plan_definitions.sql");

    expect(migration).toContain('ON CONFLICT ("version", "plan") DO UPDATE');
  });

  it("uses composite tenant foreign keys for cross-owned records", () => {
    const migration = [
      readMigration("0000_phase0_foundation.sql"),
      readMigration("0003_phase1_revenue_loop.sql"),
    ].join("\n");

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
    expect(migration).toContain(
      'CONSTRAINT "audits_website_workspace_fk" FOREIGN KEY ("workspace_id","website_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "audit_runs_audit_workspace_fk" FOREIGN KEY ("workspace_id","audit_id","website_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "audit_check_results_run_workspace_fk" FOREIGN KEY ("workspace_id","audit_run_id","audit_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "audit_evidence_run_workspace_fk" FOREIGN KEY ("workspace_id","audit_run_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "audit_findings_check_result_workspace_fk" FOREIGN KEY ("workspace_id","check_result_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "reports_run_workspace_fk" FOREIGN KEY ("workspace_id","audit_run_id","audit_id")',
    );
  });

  it("prevents duplicate client conversion from the same source lead", () => {
    const migration = readMigration("0004_phase1_conversion_constraints.sql");

    expect(migration).toContain(
      'CREATE UNIQUE INDEX "clients_workspace_source_lead_unique"',
    );
    expect(migration).toContain('"workspace_id","source_lead_id"');
  });

  it("prevents duplicate Phase 1 reports for the same audit", () => {
    const migration = readMigration("0005_phase1_report_constraints.sql");

    expect(migration).toContain(
      'CREATE UNIQUE INDEX "reports_workspace_audit_unique"',
    );
    expect(migration).toContain('"workspace_id","audit_id"');
  });

  it("does not include destructive table or type drops", () => {
    const migration = [
      readMigration("0000_phase0_foundation.sql"),
      readMigration("0001_phase0_rls_policies.sql"),
      readMigration("0002_seed_service_plan_definitions.sql"),
      readMigration("0003_phase1_revenue_loop.sql"),
      readMigration("0004_phase1_conversion_constraints.sql"),
      readMigration("0005_phase1_report_constraints.sql"),
      readMigration("0006_phase1_security_hardening.sql"),
    ].join("\n");

    expect(migration).not.toMatch(/\bDROP\s+(TABLE|TYPE|SCHEMA|DATABASE)\b/i);
  });
});
