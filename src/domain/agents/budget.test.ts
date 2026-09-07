import { describe, expect, it } from "vitest";

import { prepareDraftBudget } from "./catalog";
import {
  AgentBudgetError,
  assertWithinBudget,
  byteLength,
  createBudgetSnapshot,
} from "./budget";

describe("agent run budgets", () => {
  it("captures durable run budget snapshots", () => {
    const capturedAt = new Date("2026-01-01T00:00:00Z");
    const snapshot = createBudgetSnapshot(prepareDraftBudget, capturedAt);

    expect(snapshot).toMatchObject(prepareDraftBudget);
    expect(snapshot.capturedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("allows bounded usage and rejects each exceeded limit", () => {
    const snapshot = createBudgetSnapshot(prepareDraftBudget);

    expect(() =>
      assertWithinBudget(snapshot, {
        toolCalls: snapshot.maxToolCalls,
        modelCalls: snapshot.maxModelCalls,
        evidenceBytes: snapshot.maxEvidenceBytes,
        inputBytes: snapshot.maxInputBytes,
        outputBytes: snapshot.maxOutputBytes,
        costCents: snapshot.maxCostCents,
      }),
    ).not.toThrow();

    expect(() =>
      assertWithinBudget(snapshot, {
        toolCalls: snapshot.maxToolCalls + 1,
        modelCalls: 0,
        evidenceBytes: 0,
        inputBytes: 0,
        outputBytes: 0,
        costCents: 0,
      }),
    ).toThrow(AgentBudgetError);
    expect(() =>
      assertWithinBudget(snapshot, {
        toolCalls: 0,
        modelCalls: snapshot.maxModelCalls + 1,
        evidenceBytes: 0,
        inputBytes: 0,
        outputBytes: 0,
        costCents: 0,
      }),
    ).toThrow("model-call limit exceeded");
    expect(() =>
      assertWithinBudget(snapshot, {
        toolCalls: 0,
        modelCalls: 0,
        evidenceBytes: snapshot.maxEvidenceBytes + 1,
        inputBytes: 0,
        outputBytes: 0,
        costCents: 0,
      }),
    ).toThrow("evidence-size limit exceeded");
    expect(() =>
      assertWithinBudget(snapshot, {
        toolCalls: 0,
        modelCalls: 0,
        evidenceBytes: 0,
        inputBytes: snapshot.maxInputBytes + 1,
        outputBytes: 0,
        costCents: 0,
      }),
    ).toThrow("input-size limit exceeded");
    expect(() =>
      assertWithinBudget(snapshot, {
        toolCalls: 0,
        modelCalls: 0,
        evidenceBytes: 0,
        inputBytes: 0,
        outputBytes: snapshot.maxOutputBytes + 1,
        costCents: 0,
      }),
    ).toThrow("output-size limit exceeded");
    expect(() =>
      assertWithinBudget(snapshot, {
        toolCalls: 0,
        modelCalls: 0,
        evidenceBytes: 0,
        inputBytes: 0,
        outputBytes: 0,
        costCents: snapshot.maxCostCents + 1,
      }),
    ).toThrow("cost limit exceeded");
  });

  it("measures input size in bytes", () => {
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("\u00e9")).toBe(2);
  });
});
