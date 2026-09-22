import { describe, expect, it } from "vitest";

import { monthlyCycleCloseReadiness } from "./monthly-cycles";

function deliverable(status: string) {
  return { status, deliverableKey: status === "UNAVAILABLE" ? "observed_ai_visibility" : "quarterly_strategy", targetCount: status === "NOT_APPLICABLE" ? 0 : 1,
    completedCount: status === "COMPLETE" ? 1 : 0, completedAt: new Date(), completedByUserId: "owner", completionEvidence: { summary: "Review notes" },
    limitations: { code: "PROVIDER_NOT_ACTIVE", due: "NOT_DUE_THIS_MONTH" }, waivedAt: new Date(), waivedByUserId: "owner", waiverReason: "Client deferred review" };
}
describe("monthly cycle close readiness", () => {
  it("allows close only when deliverables are complete, unavailable, not applicable, or waived", () => {
    expect(
      monthlyCycleCloseReadiness({
        deliverables: [
          deliverable("COMPLETE"),
          deliverable("UNAVAILABLE"),
          deliverable("NOT_APPLICABLE"),
          deliverable("WAIVED"),
        ],
        hasFinalizedReport: true,
        hiddenCriticalCount: 0,
      }),
    ).toMatchObject({ ready: true, unfinishedDeliverables: 0 });
  });

  it("blocks close when contractual work is still blocked or hidden critical work exists", () => {
    expect(
      monthlyCycleCloseReadiness({
        deliverables: [deliverable("BLOCKED")],
        hasFinalizedReport: true,
        hiddenCriticalCount: 1,
      }),
    ).toMatchObject({
      ready: false,
      unfinishedDeliverables: 1,
      hiddenCriticalCount: 1,
    });
  });

  it("requires a finalized human-reviewed monthly report", () => {
    expect(
      monthlyCycleCloseReadiness({
        deliverables: [deliverable("COMPLETE")],
        hasFinalizedReport: false,
        hiddenCriticalCount: 0,
      }),
    ).toMatchObject({ ready: false, reportFinalized: false });
  });
});
