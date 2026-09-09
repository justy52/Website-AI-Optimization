import { describe, expect, it } from "vitest";

import { monthlyCycleCloseReadiness } from "./monthly-cycles";

describe("monthly cycle close readiness", () => {
  it("allows close only when deliverables are complete, unavailable, not applicable, or waived", () => {
    expect(
      monthlyCycleCloseReadiness({
        deliverables: [
          { status: "COMPLETE" },
          { status: "UNAVAILABLE" },
          { status: "NOT_APPLICABLE" },
          { status: "WAIVED" },
        ],
        hasFinalizedReport: true,
        hiddenCriticalCount: 0,
      }),
    ).toMatchObject({ ready: true, unfinishedDeliverables: 0 });
  });

  it("blocks close when contractual work is still blocked or hidden critical work exists", () => {
    expect(
      monthlyCycleCloseReadiness({
        deliverables: [{ status: "BLOCKED" }],
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
        deliverables: [{ status: "COMPLETE" }],
        hasFinalizedReport: false,
        hiddenCriticalCount: 0,
      }),
    ).toMatchObject({ ready: false, reportFinalized: false });
  });
});
