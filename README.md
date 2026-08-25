# OPTIQ

Multi-tenant SaaS for running website + AI-search optimization as a service, using governed AI agents. Humans keep strategy, client relationships, and approval of consequential actions; agents do the repeatable analysis and drafting.

## Status

Early build. The complete, audited specification lives in [`docs/`](./docs) and is the source of truth. The visual/UX target is [`design/matrix-console.jsx`](./design/matrix-console.jsx).

## Stack

Next.js (App Router) - TypeScript - Tailwind + shadcn/ui - Neon Postgres + Drizzle - Better Auth - Vercel (Workflows, Cron, Blob, AI Gateway) - Vercel AI SDK - Vitest + Playwright - pnpm.

## Getting started

```bash
pnpm install
cp .env.example .env.local     # then fill in values - see ENVIRONMENT-SETUP.md
pnpm db:migrate                # apply Drizzle migrations
pnpm dev                       # http://localhost:3000
```

(Scripts above are the intended interface; they're created during Phase 0.)

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

Ship the revenue slice first - **Lead -> Client -> Website -> Audit -> Report** - then layer agents, monitoring, and EXECUTE actions per the phase plan in the build prompt.
