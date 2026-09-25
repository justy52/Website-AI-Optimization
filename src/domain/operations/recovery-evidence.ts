export const recoveryExercise = {
  performedAt: "2026-09-25T13:27:00Z",
  migration: "0017_phase10_operational_controls",
  scope: "Designated disposable Neon test database only",
  method: "Fresh migration chain, reviewed fixture restoration, non-bypass RLS, localhost app reconnection and auth/workspace/session/monthly read smoke",
  result: "PASSED",
  limitation: "Recreation proof; account-level Neon PITR capability/window remains unconfirmed",
} as const;
