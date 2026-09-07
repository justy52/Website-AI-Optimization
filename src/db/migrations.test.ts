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
  "opportunities",
  "work_plan_cycles",
  "work_plan_items",
  "agent_runs",
  "agent_tool_calls",
  "client_knowledge_sources",
  "business_facts",
  "claim_policies",
  "draft_artifacts",
  "approval_requests",
  "operational_notifications",
  "reports",
  "approval_policies",
  "integration_connections",
  "workspace_feature_flags",
  "activity_events",
] as const;

function readMigration(name: string): string {
  return readFileSync(join(process.cwd(), "drizzle", name), "utf8");
}

function expectBefore(sql: string, earlier: string, later: string): void {
  const earlierIndex = sql.indexOf(earlier);
  const laterIndex = sql.indexOf(later);

  expect(earlierIndex).toBeGreaterThanOrEqual(0);
  expect(laterIndex).toBeGreaterThanOrEqual(0);
  expect(earlierIndex).toBeLessThan(laterIndex);
}

describe("phase 0 migrations", () => {
  it("enables and forces RLS on every tenant-owned table", () => {
    const migration = [
      readMigration("0001_phase0_rls_policies.sql"),
      readMigration("0003_phase1_revenue_loop.sql"),
      readMigration("0007_phase2_opportunities.sql"),
      readMigration("0008_phase3_governed_prepare.sql"),
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
      readMigration("0007_phase2_opportunities.sql"),
      readMigration("0008_phase3_governed_prepare.sql"),
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
    expect(migration).toContain(
      'CONSTRAINT "opportunities_client_workspace_fk" FOREIGN KEY ("workspace_id","client_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "opportunities_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "opportunities_audit_workspace_fk" FOREIGN KEY ("workspace_id","source_audit_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "opportunities_audit_run_workspace_fk" FOREIGN KEY ("workspace_id","source_audit_run_id","source_audit_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "opportunities_finding_workspace_fk" FOREIGN KEY ("workspace_id","source_finding_id","source_audit_run_id","source_audit_id","source_check_key")',
    );
    expect(migration).toContain(
      'CONSTRAINT "opportunities_check_result_workspace_fk" FOREIGN KEY ("workspace_id","source_check_result_id","source_audit_run_id","source_audit_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "work_plan_cycles_client_workspace_fk" FOREIGN KEY ("workspace_id","client_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "work_plan_items_cycle_workspace_fk" FOREIGN KEY ("workspace_id","client_id","work_plan_cycle_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "work_plan_items_opportunity_workspace_fk" FOREIGN KEY ("workspace_id","client_id","opportunity_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "agent_runs_client_workspace_fk" FOREIGN KEY ("workspace_id","client_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "agent_runs_website_workspace_fk" FOREIGN KEY ("workspace_id","client_id","website_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "agent_runs_opportunity_workspace_fk" FOREIGN KEY ("workspace_id","client_id","opportunity_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "agent_tool_calls_run_workspace_fk" FOREIGN KEY ("workspace_id","agent_run_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "client_knowledge_sources_client_workspace_fk" FOREIGN KEY ("workspace_id","client_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "business_facts_client_workspace_fk" FOREIGN KEY ("workspace_id","client_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "claim_policies_client_workspace_fk" FOREIGN KEY ("workspace_id","client_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "draft_artifacts_opportunity_workspace_fk" FOREIGN KEY ("workspace_id","client_id","opportunity_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "approval_requests_artifact_version_workspace_fk" FOREIGN KEY ("workspace_id","target_artifact_id","target_artifact_version")',
    );
  });

  it("creates composite unique indexes before foreign keys that depend on them", () => {
    const phase0 = readMigration("0000_phase0_foundation.sql");
    const phase1 = readMigration("0003_phase1_revenue_loop.sql");
    const phase2 = readMigration("0007_phase2_opportunities.sql");

    expectBefore(
      phase0,
      'CREATE UNIQUE INDEX "leads_workspace_id_id_unique"',
      'CONSTRAINT "clients_source_lead_workspace_fk"',
    );
    expectBefore(
      phase0,
      'CREATE UNIQUE INDEX "clients_workspace_id_id_unique"',
      'CONSTRAINT "websites_client_workspace_fk"',
    );
    expectBefore(
      phase0,
      'CREATE UNIQUE INDEX "websites_workspace_id_id_unique"',
      'CONSTRAINT "integration_connections_website_workspace_fk"',
    );
    expectBefore(
      phase1,
      'CREATE UNIQUE INDEX "audits_workspace_id_website_id_unique"',
      'CONSTRAINT "audit_runs_audit_workspace_fk"',
    );
    expectBefore(
      phase1,
      'CREATE UNIQUE INDEX "audit_runs_workspace_id_id_audit_id_unique"',
      'CONSTRAINT "reports_run_workspace_fk"',
    );
    expectBefore(
      phase1,
      'CREATE UNIQUE INDEX "audit_snapshots_workspace_id_id_unique"',
      'CONSTRAINT "reports_snapshot_workspace_fk"',
    );
    expectBefore(
      phase2,
      'CREATE UNIQUE INDEX "websites_workspace_client_id_unique"',
      'CONSTRAINT "opportunities_website_workspace_fk"',
    );
    expectBefore(
      phase2,
      'CREATE UNIQUE INDEX "audit_check_results_workspace_full_unique"',
      'CONSTRAINT "opportunities_check_result_workspace_fk"',
    );
    expectBefore(
      phase2,
      'CREATE UNIQUE INDEX "audit_findings_workspace_full_unique"',
      'CONSTRAINT "opportunities_finding_workspace_fk"',
    );
    expectBefore(
      phase2,
      'CREATE UNIQUE INDEX "opportunities_workspace_client_id_unique"',
      'CONSTRAINT "work_plan_items_opportunity_workspace_fk"',
    );
    expectBefore(
      phase2,
      'CREATE UNIQUE INDEX "work_plan_cycles_workspace_client_id_unique"',
      'CONSTRAINT "work_plan_items_cycle_workspace_fk"',
    );

    const phase3 = readMigration("0008_phase3_governed_prepare.sql");

    expectBefore(
      phase3,
      'CREATE UNIQUE INDEX "agent_runs_workspace_id_id_unique"',
      'CONSTRAINT "agent_tool_calls_run_workspace_fk"',
    );
    expectBefore(
      phase3,
      'CREATE UNIQUE INDEX "client_knowledge_sources_workspace_id_id_unique"',
      'CONSTRAINT "business_facts_knowledge_source_workspace_fk"',
    );
    expectBefore(
      phase3,
      'CREATE UNIQUE INDEX "draft_artifacts_workspace_version_unique"',
      'CONSTRAINT "approval_requests_artifact_version_workspace_fk"',
    );
  });

  it("deduplicates open materially equivalent opportunities at the database layer", () => {
    const migration = readMigration("0007_phase2_opportunities.sql");

    expect(migration).toContain(
      'CREATE UNIQUE INDEX "opportunities_open_equivalent_unique"',
    );
    expect(migration).toContain(
      '"workspace_id","website_id","source_check_key","normalized_remediation_family"',
    );
    expect(migration).toContain(
      "WHERE \"opportunities\".\"status\" in ('DRAFT', 'READY', 'BLOCKED', 'IN_PROGRESS')",
    );
  });

  it("keeps closed opportunities outside the open dedupe uniqueness window", () => {
    const migration = readMigration("0007_phase2_opportunities.sql");
    const uniqueIndexBlock = migration.match(
      /CREATE UNIQUE INDEX "opportunities_open_equivalent_unique"[\s\S]*?statement-breakpoint/,
    )?.[0];

    expect(uniqueIndexBlock).toBeDefined();
    expect(uniqueIndexBlock).toContain("'DRAFT', 'READY', 'BLOCKED', 'IN_PROGRESS'");
    expect(uniqueIndexBlock).not.toContain("COMPLETED");
    expect(uniqueIndexBlock).not.toContain("DISMISSED");
    expect(uniqueIndexBlock).not.toContain("SUPERSEDED");
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

  it("seeds the Phase 3 agent capability catalog deny-by-default", () => {
    const migration = readMigration("0008_phase3_governed_prepare.sql");

    expect(migration).toContain("INSERT INTO \"agent_definitions\"");
    expect(migration).toContain(
      "('existing-page-optimization', 'epo-prepare-v1.0'",
    );
    expect(migration).toContain(
      "'existing-page-optimization-output-v1.0', true",
    );
    expect(migration).toContain("ON CONFLICT (\"key\", \"version\") DO UPDATE");
    expect(migration).toContain(
      'CONSTRAINT "approval_requests_no_external_execute_phase3_check"',
    );
    expect(migration).toContain('"proposed_external_execution" = false');
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
      readMigration("0007_phase2_opportunities.sql"),
      readMigration("0008_phase3_governed_prepare.sql"),
    ].join("\n");

    expect(migration).not.toMatch(/\bDROP\s+(TABLE|TYPE|SCHEMA|DATABASE)\b/i);
  });
});
