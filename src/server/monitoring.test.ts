import { describe, expect, it } from "vitest";

import { buildMonitoringScheduleCompletionUpdate } from "./monitoring";

describe("monitoring schedule completion state", () => {
  it("preserves last successful run across partial and failed runs", () => {
    const t1 = new Date("2026-09-08T10:00:00.000Z");
    const t2 = new Date("2026-09-08T11:00:00.000Z");
    const t3 = new Date("2026-09-08T12:00:00.000Z");
    const t4 = new Date("2026-09-08T13:00:00.000Z");
    const nextRunAt = new Date("2026-09-15T10:00:00.000Z");
    const state: Record<string, unknown> = {};

    Object.assign(
      state,
      buildMonitoringScheduleCompletionUpdate({
        status: "SUCCEEDED",
        completedAt: t1,
        nextRunAt,
      }),
    );
    expect(state.lastSuccessAt).toBe(t1);
    expect(state.lastErrorAt).toBeNull();

    Object.assign(
      state,
      buildMonitoringScheduleCompletionUpdate({
        status: "PARTIAL",
        completedAt: t2,
        nextRunAt,
      }),
    );
    expect(state.lastRunAt).toBe(t2);
    expect(state.lastSuccessAt).toBe(t1);
    expect(state.lastErrorAt).toBeNull();

    Object.assign(
      state,
      buildMonitoringScheduleCompletionUpdate({
        status: "FAILED",
        completedAt: t3,
        nextRunAt,
        errorSummary: "Provider unavailable.",
      }),
    );
    expect(state.lastRunAt).toBe(t3);
    expect(state.lastSuccessAt).toBe(t1);
    expect(state.lastErrorAt).toBe(t3);
    expect(state.lastErrorSummary).toBe("Provider unavailable.");

    Object.assign(
      state,
      buildMonitoringScheduleCompletionUpdate({
        status: "SUCCEEDED",
        completedAt: t4,
        nextRunAt,
      }),
    );
    expect(state.lastRunAt).toBe(t4);
    expect(state.lastSuccessAt).toBe(t4);
    expect(state.lastErrorAt).toBeNull();
    expect(state.lastErrorSummary).toBeNull();
  });

  it("does not manufacture a success timestamp for partial Search Console availability", () => {
    const update = buildMonitoringScheduleCompletionUpdate({
      status: "PARTIAL",
      completedAt: new Date("2026-09-08T11:00:00.000Z"),
      nextRunAt: new Date("2026-09-15T11:00:00.000Z"),
    });

    expect(update.lastRunAt).toEqual(new Date("2026-09-08T11:00:00.000Z"));
    expect(update).not.toHaveProperty("lastSuccessAt");
    expect(update).not.toHaveProperty("lastErrorAt");
    expect(update).not.toHaveProperty("lastErrorSummary");
  });
});
