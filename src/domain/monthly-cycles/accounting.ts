export type MonthlyWorkCompletionState =
  | "NOT_STARTED"
  | "DRAFT_PREPARED"
  | "APPROVED_FOR_MANUAL_IMPLEMENTATION"
  | "IMPLEMENTED_UNVERIFIED"
  | "VERIFIED"
  | "VERIFICATION_WARNING"
  | "VERIFICATION_FAILED";

export const entitlementCompletionStates = [
  "IMPLEMENTED_UNVERIFIED",
  "VERIFIED",
  "VERIFICATION_WARNING",
] as const satisfies MonthlyWorkCompletionState[];

export function countsAsCompletedEntitlement(
  state: MonthlyWorkCompletionState,
): boolean {
  return entitlementCompletionStates.includes(
    state as (typeof entitlementCompletionStates)[number],
  );
}

export function isVerifiedImplementation(
  state: MonthlyWorkCompletionState,
): boolean {
  return state === "VERIFIED";
}
