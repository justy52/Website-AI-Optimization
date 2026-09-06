# Environment & Secrets Checklist - OPTIQ

Set these up as you go. **Nothing here belongs in Git.** Keep real values in `.env.local` (local) and in Vercel project environment variables (QA / Production). Use separate credentials per environment - never point QA or preview at the production database.

Copy `.env.example` to `.env.local` and fill it in. `.env.example` holds variable names only, and it is safe to commit.

## Accounts you'll need

| Service | Purpose | When |
|---|---|---|
| **Vercel** | Hosting, Cron, Blob storage, Workflows, AI Gateway | Phase 0 |
| **Neon** | Postgres database (create separate Local/QA/Prod projects or branches) | Phase 0 |
| **OpenAI** | AI drafting/classification via AI Gateway; web-grounded AI-visibility (Phase 4) | Later phases only |
| **Google Cloud** | Search Console + GA4 OAuth (read integrations) | Phase 4 |
| **Perplexity** | Sonar API - first AI-visibility surface | Phase 4 |
| **Google AI (Gemini)** | Gemini API + Search grounding - third AI-visibility surface | Phase 4 |

You do **not** need every key on day one. Phase 0 and Phase 1 need application, authentication, database, and encryption variables only. AI provider keys stay blank until a later implementation phase requires them.

## Core variables

```
# --- Database (Neon) ---
# Pooled connection string.
DATABASE_URL=
# Direct connection string for migrations.
DATABASE_URL_UNPOOLED=

# --- Auth (self-hosted Better Auth) ---
# Generate with openssl rand -base64 32.
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=

# --- Encryption for stored integration secrets (docs/25 section 7) ---
# 32-byte key, authenticated encryption, rotate-able.
CREDENTIAL_ENCRYPTION_KEY=
CREDENTIAL_KEY_VERSION=

# --- AI (via Vercel AI Gateway) ---
AI_GATEWAY_API_KEY=
OPENAI_API_KEY=

# --- Object storage (Vercel Blob, private) ---
BLOB_READ_WRITE_TOKEN=

# --- App ---
NODE_ENV=
APP_ENV=
```

## Added in later phases (leave blank until then)

```
# Phase 4 - read integrations
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=

# Phase 4 - observed AI visibility surfaces (roll out in this order)
PERPLEXITY_API_KEY=
GEMINI_API_KEY=
```

## Rules (from docs/22 and docs/25)

- Secrets are server-side only. Never expose them to the browser or put them in `NEXT_PUBLIC_*`.
- Never log access tokens, refresh tokens, API keys, or full authorization headers.
- Store per-client integration tokens encrypted at rest (key version + nonce + ciphertext); the master key lives in environment/secret management, separate from the database.
- Feature-flag every external EXECUTE action; deny-by-default in production.
