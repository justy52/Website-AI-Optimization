import { describe, expect, it } from "vitest";

import {
  buildMonthlyDeliverableTemplates,
  buildMonthlyEntitlementSnapshot,
  shouldCreateRecurringMonthlyCycle,
} from "./entitlements";

describe("monthly cycle entitlements", () => {
  it("snapshots Doc 27 package limits without rollover", () => {
    const essentials = buildMonthlyEntitlementSnapshot("ESSENTIALS");
    const growth = buildMonthlyEntitlementSnapshot("GROWTH");
    const pro = buildMonthlyEntitlementSnapshot("PRO");

    expect(essentials.limits.manualImplementationMinutes).toBe(120);
    expect(growth.limits.manualImplementationMinutes).toBe(240);
    expect(pro.limits.manualImplementationMinutes).toBe(420);
    expect(essentials.limits.existingPageOptimizations).toBe(1);
    expect(growth.limits.majorContentAssets).toBe(1);
    expect(pro.limits.majorContentAssets).toBe(2);
    expect(pro.limits.existingPageOptimizations).toBe(2);
    expect(essentials.noRollover).toBe(true);
    expect(essentials.deferredProviders.observedAiVisibility).toBe(
      "PROVIDER_NOT_ACTIVE",
    );
  });

  it("only auto-creates cycles for recurring monthly service plans", () => {
    expect(shouldCreateRecurringMonthlyCycle("NONE")).toBe(false);
    expect(shouldCreateRecurringMonthlyCycle("AUDIT_ONLY")).toBe(false);
    expect(shouldCreateRecurringMonthlyCycle("LAUNCH")).toBe(false);
    expect(shouldCreateRecurringMonthlyCycle("ESSENTIALS")).toBe(true);
    expect(shouldCreateRecurringMonthlyCycle("GROWTH")).toBe(true);
    expect(shouldCreateRecurringMonthlyCycle("PRO")).toBe(true);
  });

  it("creates honest recurring deliverables for blocked and deferred providers", () => {
    const templates = buildMonthlyDeliverableTemplates({
      snapshot: buildMonthlyEntitlementSnapshot("ESSENTIALS"),
      period: { month: 9 },
      searchConsoleConnected: false,
    });

    expect(templates.find((item) => item.key === "search_console")?.status).toBe(
      "BLOCKED",
    );
    expect(
      templates.find((item) => item.key === "search_console")?.limitations,
    ).toEqual({ code: "SEARCH_CONSOLE_NOT_CONNECTED" });
    expect(
      templates.find((item) => item.key === "observed_ai_visibility")?.status,
    ).toBe("UNAVAILABLE");
    expect(
      templates.find((item) => item.key === "monthly_report")?.status,
    ).toBe("NOT_STARTED");
  });

  it("surfaces Pro quarterly strategy only for due months", () => {
    const snapshot = buildMonthlyEntitlementSnapshot("PRO");
    const due = buildMonthlyDeliverableTemplates({
      snapshot,
      period: { month: 9 },
      searchConsoleConnected: true,
    });
    const notDue = buildMonthlyDeliverableTemplates({
      snapshot,
      period: { month: 10 },
      searchConsoleConnected: true,
    });

    expect(due.find((item) => item.key === "quarterly_strategy")?.status).toBe(
      "NOT_STARTED",
    );
    expect(
      notDue.find((item) => item.key === "quarterly_strategy")?.status,
    ).toBe("NOT_APPLICABLE");
  });
});
