export const recoveryExercise = {
  performedAt: "2026-11-04T21:51:23Z",
  migration: "0025_intake_forced_rls",
  scope: "Protected production synthetic records only",
  method: "Historical database branch, exact migration hashes, restricted login, two-account sign-in, tenant denial, report/export and synthetic credential decryption",
  result: "PASSED",
  limitation: "Historical exercise only; independent key escrow, scheduled-backup delivery and operational alerts still require confirmation. This record is not live backup monitoring.",
} as const;
