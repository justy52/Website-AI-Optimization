import { describe, expect, it } from "vitest";

import {
  SEARCH_CONSOLE_MONITOR_KEY,
  WEBSITE_HEALTH_MONITOR_KEY,
  monitorDefinitionsForPlan,
  nextRunAtForCadence,
} from "./definitions";

describe("Phase 4A monitoring definitions", () => {
  it("activates only website health and Search Console from service-plan definitions", () => {
    const definitions = monitorDefinitionsForPlan("ESSENTIALS");

    expect(definitions.map((definition) => definition.key)).toEqual([
      WEBSITE_HEALTH_MONITOR_KEY,
      SEARCH_CONSOLE_MONITOR_KEY,
    ]);
    expect(definitions.every((definition) => definition.cadence === "weekly")).toBe(
      true,
    );
  });

  it("does not activate recurring monitors for audit-only clients", () => {
    expect(
      monitorDefinitionsForPlan("AUDIT_ONLY").filter(
        (definition) => definition.enabled,
      ),
    ).toEqual([]);
  });

  it("calculates deterministic next-run dates", () => {
    const from = new Date("2026-09-07T00:00:00.000Z");

    expect(nextRunAtForCadence("weekly", from)?.toISOString()).toBe(
      "2026-09-14T00:00:00.000Z",
    );
    expect(nextRunAtForCadence("twice_monthly", from)?.toISOString()).toBe(
      "2026-09-21T00:00:00.000Z",
    );
    expect(nextRunAtForCadence("none", from)).toBeNull();
  });
});
