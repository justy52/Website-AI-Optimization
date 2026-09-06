# OPTIQ

Multi-tenant SaaS for running website + AI-search optimization as a service, using governed AI agents. Humans keep strategy, client relationships, and approval of consequential actions; agents do the repeatable analysis and drafting.

## Status

Phase 0 scaffold active. The complete, audited specification lives in [`docs/`](./docs) and is the source of truth. The visual/UX target is [`design/matrix-console.jsx`](./design/matrix-console.jsx).

Current implementation includes the Next.js application shell, environment validation, Better Auth route wiring, Drizzle schema/migrations, workspace-scoped tenant helpers, versioned scoring/priority/service-plan definitions, and initial unit tests. Phase 0 does not implement audit execution, lead management, reports, billing, third-party workflows, or agents.

## Stack

Next.js (App Router) - TypeScript - Tailwind + shadcn/ui - Neon Postgres + Drizzle - Better Auth - Vercel-ready infrastructure - Vitest now, Playwright for later critical browser flows - pnpm.

## Getting started

```bash
corepack pnpm install
cp .env.example .env.local        # then fill in values - see ENVIRONMENT-SETUP.md
corepack pnpm db:migrate          # apply Drizzle migrations after DATABASE_URL is set
corepack pnpm dev                 # http://localhost:3000
```

Useful checks:

```bash
corepack pnpm verify              # lint, typecheck, unit tests, migration check
corepack pnpm build               # production build
```

## Documentation

- `docs/19`-`29` - software/product implementation (authoritative; 25-29 override generic descriptions in 19-23)
- `docs/01`-`18` - service-business operations, templates, and policy
- `docs/24` - public pricing reference
- `ENVIRONMENT-SETUP.md` - accounts, environment variables, and secret-handling rules

## Core principles (non-negotiable)

- **Tenant isolation is defense-in-depth** (workspace_id + server-derived context + Postgres RLS) and is deployment-blocking.
- **Agent permissions:** OBSERVE / PREPARE / EXECUTE. External EXECUTE is deny-by-default, feature-flagged, and verified.
- **External content is untrusted data** and can never change system policy, permissions, or scope.
- **Verification is separate from execution** - a successful write API call is not "done."
- **Deterministic scoring and prioritization** come from versioned rules in `docs/26`-`27`, never invented by a model.

## Build order

Phase 0 stops at foundation. The future revenue slice starts after this baseline is reviewed: **Lead -> Client -> Website -> Audit -> Report**, then agents, monitoring, and EXECUTE actions per the phase plan.
