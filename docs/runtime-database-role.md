# Runtime database role rollout

Migration `0018_runtime_role` separates the application login from the owner used
to migrate the schema. PostgreSQL superusers and BYPASSRLS roles ignore tenant
policies, even on FORCE RLS tables. Neon roles created through its Console/API/CLI
are administrators; create this runtime role through the SQL migration instead.

References: [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html),
[Neon role management](https://neon.com/docs/manage/roles).

## Access model

`virelantic_runtime` starts as NOLOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE,
NOCREATEDB, NOREPLICATION, NOINHERIT, with no role memberships or owned objects.
It receives:

- SELECT/INSERT/UPDATE/DELETE on existing tenant tables only after checking that
  each enables and forces RLS. Existing immutable-history triggers still apply.
- Better Auth CRUD on user, account, session, verification, and auth_rate_limits.
  These are global authentication records, authorized by Better Auth rather than tenant RLS.
- SELECT on service_plan_definitions and agent_definitions.
- SELECT/UPDATE on the platform operations singleton, subject to its operator policy.
- EXECUTE on the two tenant-context readers and four bounded scheduler/retention
  helpers. These helpers intentionally return references across workspaces to
  the authenticated cron handlers; they do not grant general cross-tenant reads.

There is no ownership, schema CREATE, database CREATE, TRUNCATE, REFERENCES,
TRIGGER, sequence, migration-table access, or blanket future-table grant.
UUID defaults require no sequences. Future migrations must review and explicitly
grant new runtime tables/functions; keep definer functions revoked from PUBLIC.

Every new physical application connection is checked before checkout. Both
Drizzle transactions and direct queries reject unsafe identities. The installed
Neon driver's pg-pool verify hook gates checkout; a connect listener also disables
the HTTP query shortcut that would skip the hook. Repeat the live rejection test
when upgrading the driver. Local development uses the same restricted login.

This is defense against omitted tenant filters. The server still authenticates
users and derives workspace membership before setting transaction-local context.
The role can set custom settings and operate as any tenant context chosen by the
trusted server; it does not protect against arbitrary SQL execution in that server.

## Deploy in this order

1. Verify the intended hosting project, database project, branch, database name,
   and release commit. First run this procedure on an isolated branch. Preserve
   the prior deployment/configuration in the secret manager for rollback.
2. In a separate migration job, provide a direct owner `MIGRATION_DATABASE_URL`.
   Run `corepack pnpm db:migrate`. The migration job rejects missing owner config
   and pooled hostnames. Never put that variable in the application deployment.
3. Provision the SQL-created runtime login using
   `node scripts/provision-runtime-login.mjs` with all of:
   `MIGRATION_DATABASE_URL`, `RUNTIME_DATABASE_PASSWORD` (32+ random characters),
   `RUNTIME_ROLE_TARGET_HOST` (exact direct host), and
   `RUNTIME_ROLE_TARGET_DATABASE` (exact database name). The script checks both
   URL target and database identity, runs transactionally, and does not print a
   credential. An existing login requires `--rotate-password`; do not rotate a
   live credential without a coordinated environment update.
4. Construct a connection URL for `virelantic_runtime` using that password.
   Set application `DATABASE_URL` to its pooled URL. Remove any owner-valued
   `DATABASE_URL_UNPOOLED`; omit it or use a direct URL for this same runtime
   login. Remove other owner credentials from runtime configuration. Never use
   Neon Console/API "create role" for this login.
5. Before traffic, run the live proof below on the isolated branch. Deploy the
   reviewed code and verify sign-in, workspace creation/switching, audit/report
   delivery, exports, and cron helpers on that exact target. The runtime guard
   deliberately fails closed if code goes live before the credential switch.

If public schema CREATE has been granted to PUBLIC on an older database, review
its other users and revoke that grant in a separate controlled change. The
application refuses such a role instead of silently weakening the guard.

## Repeatable isolated proof

Use a normal disposable Neon branch of QA (not its main branch). Supply only in
an ignored environment file or the test process environment:

- `OPTIQ_RUNTIME_TEST_URL`: actual restricted login URL.
- `OPTIQ_RUNTIME_OWNER_TEST_URL`: owner URL for the rejection check only.
- `RUNTIME_ROLE_TARGET_HOST`, `RUNTIME_ROLE_TARGET_DATABASE`: exact isolated target.

Run `node --env-file=<ignored-file> node_modules/vitest/vitest.mjs run src/db/runtime-role.live.test.ts`.
The test asserts both session_user and current_user equal virelantic_runtime; it
does not rely on SET ROLE. It checks all workspace-column tables, actual two-tenant
read/insert/update/delete denial, authenticated membership bootstrap, absence of
context after transaction completion, DDL/catalog/migration denial, platform
operator gating, four bounded helpers, real server workspace creation, and owner
rejection through both query and transaction checkout with HTTP optimization on.
All application/auth fixtures roll back; the branch retains only role/grant changes.
Target guards are a safeguard, not proof by themselves: verify the branch in Neon
before providing these variables. Set an expiry on the disposable branch.

## Rollback and remaining rollout work

The migration is additive and leaves existing owners, policies, customer rows,
and credentials unchanged. Roll back code and environment together using the
preserved deployment and secret-manager version. A prior owner connection may
restore availability but reopens the known RLS-bypass risk; keep customer traffic
paused until the restricted release is restored. Do not drop the runtime role or
revoke active grants as an emergency rollback. To disable an unused isolated
login, an administrator can set it NOLOGIN after confirming no deployment uses it.

The review branch alone does not secure a deployment still using its owner URL.
Shared QA and production must complete the verified migration/credential/redeploy
steps. Production data, secrets, and hosted environment values are not changed by
this implementation's isolated proof.

## Verification record — November 4, 2026

- Code base: preview commit `e238034`, isolated branch `fix/runtime-tenant-role`.
- Database project: `optiq-qa` / `crimson-queen-00913220`; isolated child
  `security-runtime-role-20261104` / `br-wild-wind-ar9rpgfs`, parent
  `br-young-truth-ar6t8kwm`. Child expires November 7, 2026 at 20:00 UTC.
- Existing QA clone upgraded through the Drizzle migrator. The final SQL was
  also applied through all 19 Drizzle migrations on empty isolated database
  `runtime_security_final_20261104`; the live proof passed on that fresh chain
  and the upgraded clone. Runtime fixtures rolled back.
- Actual login/session identity: `virelantic_runtime`; superuser, bypassrls,
  createrole, createdb, replication, inherit all false; zero role memberships.
- Full suite with live proof enabled: **431 passed, 126 skipped**, 50 test files
  passed. The skipped older live suites require a different dedicated fixture
  database; their host guards were preserved.
- ESLint, TypeScript, Drizzle metadata check, and diff whitespace check passed.
- Production build passed with `next build --webpack`. Default Turbopack failed
  because this isolated checkout reused a node_modules junction outside its
  filesystem root; no application compile error was reported by that attempt.
- Read-only confirmation on shared QA main: the runtime role does not exist
  there. No hosted environment variables, shared QA credentials, production
  data, or production secrets were changed.

Integration must preserve migration ordering if another branch also adds 0018.
Renumber its journal entry and SQL filename together before merging, then repeat
the migration check and isolated upgrade proof for the combined release.
