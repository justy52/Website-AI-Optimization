export type ApprovalDecision =
  | "APPROVED_UNCHANGED"
  | "APPROVED_MINOR_EDIT"
  | "APPROVED_MAJOR_EDIT"
  | "REJECTED"
  | "CHANGES_REQUESTED";

export type ApprovalRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CHANGES_REQUESTED"
  | "EXPIRED"
  | "CANCELED";

export type DraftArtifactStatus =
  | "DRAFT"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "SUPERSEDED";

export function assertPhase3ApprovalTarget(input: {
  targetArtifactVersion: number;
  artifactVersion: number;
  proposedExternalExecution: boolean;
}) {
  if (input.proposedExternalExecution) {
    throw new Error("Phase 3 approvals cannot authorize external execution.");
  }

  if (input.targetArtifactVersion !== input.artifactVersion) {
    throw new Error("Approval target version does not match artifact version.");
  }
}

export function approvalDecisionToStatuses(decision: ApprovalDecision): {
  approvalStatus: ApprovalRequestStatus;
  artifactStatus: DraftArtifactStatus;
  approved: boolean;
  changesRequested: boolean;
} {
  const approved = decision.startsWith("APPROVED");
  const changesRequested = decision === "CHANGES_REQUESTED";

  return {
    approvalStatus: approved
      ? "APPROVED"
      : changesRequested
        ? "CHANGES_REQUESTED"
        : "REJECTED",
    artifactStatus: approved ? "APPROVED" : "REJECTED",
    approved,
    changesRequested,
  };
}
