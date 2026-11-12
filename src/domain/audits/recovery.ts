/** A run still marked running this long after it started can no longer be alive. */
export const AUDIT_STALE_AFTER_MS = 15 * 60 * 1000;
const staleAfterMs = AUDIT_STALE_AFTER_MS;

/** Hard limit on one audit's collection, kept below the hosting time limit. */
export const AUDIT_DEADLINE_MS = 270_000;

/** Audits a workspace may start in any 24 hours; each one makes paid lookups. */
export const DAILY_AUDIT_LIMIT = 30;

export class AuditDeadlineError extends Error {
  constructor() {
    super("Audit deadline exceeded.");
    this.name = "AuditDeadlineError";
  }
}

/** Reject with AuditDeadlineError if `work` has not settled within `ms`. */
export async function withAuditDeadline<T>(work: Promise<T>, ms = AUDIT_DEADLINE_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AuditDeadlineError()), ms); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function isStaleAuditRun(
  run: { status: string; startedAt: Date | null; completedAt: Date | null },
  at = new Date(),
) {
  return run.status === "RUNNING" && run.completedAt === null && run.startedAt !== null
    && at.getTime() - run.startedAt.getTime() >= staleAfterMs;
}
