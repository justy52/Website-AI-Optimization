const staleAfterMs = 15 * 60 * 1000;

export function isStaleAuditRun(
  run: { status: string; startedAt: Date | null; completedAt: Date | null },
  at = new Date(),
) {
  return run.status === "RUNNING" && run.completedAt === null && run.startedAt !== null
    && at.getTime() - run.startedAt.getTime() >= staleAfterMs;
}
