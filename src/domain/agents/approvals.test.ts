import { describe, expect, it } from "vitest";

import {
  approvalDecisionToStatuses,
  assertPhase3ApprovalTarget,
} from "./approvals";

describe("Phase 3 approval boundaries", () => {
  it("binds approval to the exact artifact version", () => {
    expect(() =>
      assertPhase3ApprovalTarget({
        targetArtifactVersion: 1,
        artifactVersion: 1,
        proposedExternalExecution: false,
      }),
    ).not.toThrow();

    expect(() =>
      assertPhase3ApprovalTarget({
        targetArtifactVersion: 1,
        artifactVersion: 2,
        proposedExternalExecution: false,
      }),
    ).toThrow("Approval target version does not match artifact version.");
  });

  it("does not allow approval to authorize external EXECUTE behavior", () => {
    expect(() =>
      assertPhase3ApprovalTarget({
        targetArtifactVersion: 1,
        artifactVersion: 1,
        proposedExternalExecution: true,
      }),
    ).toThrow("Phase 3 approvals cannot authorize external execution.");
  });

  it("maps structured human feedback to durable approval and artifact states", () => {
    expect(approvalDecisionToStatuses("APPROVED_UNCHANGED")).toMatchObject({
      approvalStatus: "APPROVED",
      artifactStatus: "APPROVED",
      approved: true,
      changesRequested: false,
    });
    expect(approvalDecisionToStatuses("APPROVED_MINOR_EDIT")).toMatchObject({
      approvalStatus: "APPROVED",
      artifactStatus: "APPROVED",
      approved: true,
    });
    expect(approvalDecisionToStatuses("REJECTED")).toMatchObject({
      approvalStatus: "REJECTED",
      artifactStatus: "REJECTED",
      approved: false,
      changesRequested: false,
    });
    expect(approvalDecisionToStatuses("CHANGES_REQUESTED")).toMatchObject({
      approvalStatus: "CHANGES_REQUESTED",
      artifactStatus: "REJECTED",
      approved: false,
      changesRequested: true,
    });
  });
});
