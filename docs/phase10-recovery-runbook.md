# OPTIQ backup and recovery runbook

Incident owner: the platform operator designated by the repository/workspace owner. An individual and escalation contact must be assigned before an internal pilot is left unattended. Record incident ID, owner, affected workspace/run IDs, start time and last known-good deployment/migration; never paste credentials into incident notes.

## Immediate containment

1. An allowlisted platform operator opens Operations and pauses all platform automation with an incident reason. A workspace owner/admin can immediately pause their workspace. If normal operator access is unavailable, set `AUTOMATION_EMERGENCY_STOP=true` and redeploy; environment changes do not affect already-built deployments automatically.
2. Confirm schedule dispatch returns no new work, new PREPARE is rejected normally, and queued material steps fail closed. Leave read-only evidence accessible.
3. Capture deployment SHA, workflow IDs and sanitized logs. Treat indeterminate provider calls as spent/committed until proven otherwise. Never clear visibility reservations to force a retry.
4. Keep production EXECUTE off throughout recovery. Do not reset persistent QA.

## Neon assumptions and restore

Neon documents restore within the project's configured history-retention window: [Neon point-in-time restore](https://neon.com/blog/announcing-point-in-time-restore). The current QA account's plan, enabled PITR window and independent backup coverage were **not confirmed** through available account tooling. No backup SLA or particular retention duration is claimed. Before launch, the operator must record the actual project/branch history window, oldest recoverable point, account capability and restore permissions. A JSON workspace export is not a complete database backup.

Prefer restoring to a separate disposable branch/database and validating it before switching application connections. Confirm any cost first. Choose the recovery timestamp/LSN with the incident owner, preserve the original branch, and use the Neon console's supported restore mechanism within the confirmed window. If no valid restore point exists, use a verified encrypted backup under the approved incident plan; do not invent recoverability.

For a full logical backup, retain schema, data, migration journal, auth tables and encrypted credential records using approved encrypted storage. Keep encryption keys in the secret manager, separately protected; without the correct versioned key ring, restored integration ciphertext cannot be decrypted. Restrict access and record backup/restore checksums and time. Core workspace export deliberately omits secrets and is insufficient for full auth/integration restoration.

On the restored database: run all required forward migrations, verify tenant composite FKs and FORCE RLS using a non-bypass role, check representative record counts and immutable history, configure the application's database URLs privately, then deploy to an isolated URL. Prove health, sign-in/session, workspace data reads and an owner export before switching the canonical QA alias. Resume one workspace/category at a time with explicit operator reasons.

## Migration forward-fix

Use the committed Drizzle journal and `corepack pnpm db:migrate`. Verify the target identity first. Normal QA migrations are additive and transactional; never run disposable reset scripts against QA. If a migration fails, inspect transaction/journal state. Fix an unapplied migration before deployment, or append a new forward-fix migration once any shared environment has applied it. Do not edit an already-applied migration or manually advance its journal to hide a failure. Re-run a fresh chain on `optiq-phase1-test` (`aged-cloud-70719532`) and the non-bypass live suites before deploying the fix. Application rollback does not undo database migrations.

## Credentials and reconnection

Revoke compromised provider/OAuth credentials at the provider. Rotate the Vercel environment secret through the existing account, then redeploy. Perplexity and Search Console activation are optional and require deliberate operator provisioning; do not create paid accounts or Google credentials during recovery. Reconnect Search Console through the existing read-only OAuth flow and select the verified property. Never request a Google write scope. For credential encryption rotation, retain old key versions in the configured key ring until every still-needed record is re-encrypted or reconnected and verified. Remove old key material only after proving restored/current records can be decrypted with retained versions.

## Vercel rollback

Select a known-good deployment compatible with the current database and use Vercel's rollback command/dashboard. [Vercel Instant Rollback](https://vercel.com/docs/instant-rollback) restores an earlier build and its configuration; cron configuration also reverts, and new environment edits are not automatically incorporated. See [environment variables](https://vercel.com/docs/environment-variables). Recheck pauses immediately after rollback: older Phase 9 builds do not implement Phase 10 controls, so disable schedules/provider credentials at the environment/deployment layer before rolling back across that boundary. Rebuild if changed secrets must take effect. Confirm alias, health SHA, auth, data reads, provider-unconfigured behavior and runtime error/fatal logs.

## Bounded exercise

The guarded `scripts/fresh-disposable-proof.mjs --reset-reviewed-disposable --reuse-reviewed-fixtures` requires the exact disposable endpoint/database and explicit reset flag. It rebuilds the entire migration chain, restores representative reviewed test fixtures, verifies non-bypass tenant RLS, and verifies immutable catalog migration reruns. It never targets persistent QA. It proves recreation from migration/fixture data, not Neon account PITR. Record the final execution date, migration tip and separate app reconnection/auth/read proof in `phase10-validation.md`.

## Resume checklist

Verify health/auth, RLS, representative data, approvals, execution/verification history, normalized visibility and unknown-cost reservations. Review cleanup counts before enabling deletion. Check no paid/indeterminate attempt is scheduled for replay. Confirm the chosen SHA's runtime logs, migration compatibility and operator access. Record incident resolution and resume actor/time/reason. Follow up on backup-window or storage gaps before calling the pilot launch-ready.
