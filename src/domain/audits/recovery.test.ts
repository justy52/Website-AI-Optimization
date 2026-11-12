import { describe, expect, it } from "vitest";

import { AUDIT_STALE_AFTER_MS, AuditDeadlineError, isStaleAuditRun, withAuditDeadline } from "./recovery";

describe("audit run recovery rules", () => {
  it("treats a run as stale only once it has been running past the window", () => {
    const at = new Date("2026-11-12T12:00:00Z");
    const started = (ms: number) => ({ status: "RUNNING", startedAt: new Date(at.getTime() - ms), completedAt: null });
    expect(isStaleAuditRun(started(AUDIT_STALE_AFTER_MS - 1), at)).toBe(false);
    expect(isStaleAuditRun(started(AUDIT_STALE_AFTER_MS), at)).toBe(true);
    expect(isStaleAuditRun({ ...started(AUDIT_STALE_AFTER_MS), status: "SUCCEEDED" }, at)).toBe(false);
  });

  it("returns the result of work that finishes inside the deadline", async () => {
    expect(await withAuditDeadline(Promise.resolve("done"), 50)).toBe("done");
  });

  it("rejects with a named error when the work outlasts the deadline", async () => {
    const never = new Promise<string>(() => {});
    await expect(withAuditDeadline(never, 10)).rejects.toBeInstanceOf(AuditDeadlineError);
  });

  it("passes through the original failure", async () => {
    await expect(withAuditDeadline(Promise.reject(new TypeError("boom")), 50)).rejects.toBeInstanceOf(TypeError);
  });
});
