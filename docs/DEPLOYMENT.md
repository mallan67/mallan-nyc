# Deployment Architecture

## Overview

This document describes the deployment pipeline for `mallan-nyc`, a production Next.js + Prisma + Vercel system for a New York–licensed real estate brokerage.

**Hard constraints:**
- Cotality standards compliance
- REBNY RLS display rules
- NY State real estate advertising law
- Fair Housing Act compliance
- WCAG 2.1 AA accessibility

---

## Build Environments

### CI (GitHub Actions)

**Purpose:** Full integration testing with live database

**What it does:**
1. Spins up PostgreSQL 15 container
2. Runs `npm ci` (triggers `postinstall` → `prisma generate`)
3. Runs `npx prisma db push --accept-data-loss` (schema sync)
4. Applies SQL views/constraints (non-blocking)
5. Seeds database (non-blocking)
6. Runs type-check (`tsc --noEmit`)
7. Runs build (`next build`)

**When it runs:** Pull requests to any branch

### Vercel (Production)

**Purpose:** Static build for deployment (no database at build time)

**What it does:**
1. Runs `npm ci` (triggers `postinstall` → `prisma generate`)
2. Runs `next build` (compiles, type-checks, generates static pages)
3. Deploys to edge network

**When it runs:** Push to `main` (production), push to PR branches (preview)

---

## Intentional Differences: CI vs Vercel

| Operation | CI | Vercel | Why |
|-----------|----|---------|----|
| PostgreSQL | ✅ Runs container | ❌ Not available | CI tests DB operations; Vercel builds static assets |
| `prisma db push` | ✅ Applies schema | ❌ Skipped | DB schema is applied via CI or migrations, not at deploy time |
| SQL views | ✅ Applied (non-blocking) | ❌ N/A | Views require live DB |
| Seeding | ✅ Runs (non-blocking) | ❌ N/A | Seeds require live DB |
| `prisma generate` | ✅ Via postinstall | ✅ Via postinstall | Client generation needs only schema file, no DB |
| Type-check | ✅ Explicit step | ✅ During `next build` | Both verify types |
| Build | ✅ `next build` | ✅ `next build` | Same build command |

**Key insight:** CI success with a green build reliably predicts Vercel success because:
- Both run `prisma generate` (needs only `prisma/schema.prisma`)
- Both run `next build` (needs generated Prisma client)
- Neither requires `DATABASE_URL` at build time

---

## Environment Variables

### Required for Vercel

| Variable | Purpose | Required at Build? |
|----------|---------|-------------------|
| `DATABASE_URL` | PostgreSQL connection string | No (runtime only) |
| `SENDGRID_API_KEY` | Email functionality | No (runtime only) |
| `SENDGRID_FROM_EMAIL` | Sender email address | No (runtime only) |
| `ANTHROPIC_API_KEY` | AI compliance validation | No (runtime only) |

### Required for CI

All of the above, plus:
- PostgreSQL 15 service container (auto-configured in workflow)
- `DATABASE_URL` pointing to CI postgres

---

## Prisma Best Practices (Vercel)

1. **Client generation in postinstall:**
   ```json
   "postinstall": "prisma generate"
   ```
   This ensures `@prisma/client` is generated on `npm ci` before build.

2. **No DATABASE_URL at build time:**
   `prisma generate` only reads `prisma/schema.prisma`. It does NOT connect to the database.

3. **Runtime-only database access:**
   API routes that use `PrismaClient` only execute at runtime, where `DATABASE_URL` is available from Vercel environment variables.

4. **Schema changes:**
   Apply via `prisma db push` or `prisma migrate` in CI or manually, never during Vercel build.

---

## Compliance Guardrails

These MUST NOT be removed or weakened:

### Fair Housing
- `/fair-housing` page with full policy
- Footer: Equal Housing Opportunity logo + statement
- Footer: Fair Housing Notice text
- Compliance module validates listings for prohibited terms

### REBNY RLS
- Footer: REBNY RLS attribution (required by REBNY)
- Footer: IDX compliance statement
- `lib/compliance/rebny-validator.ts` validates listing data
- `lib/compliance/rls-rules.json` contains field rules

### NY State Advertising
- License number displayed in footer
- Company registration information
- Brokerage disclosures on listing pages

### Accessibility (WCAG 2.1 AA)
- Semantic HTML throughout
- Alt text on all images
- Sufficient color contrast
- Keyboard navigation support

### Consent-Based Lead Capture
- Forms require explicit opt-in
- TCPA/CTIA compliance for SMS
- CAN-SPAM compliance for email

---

## Verification Checklist

### Local
```bash
npm ci                    # Must succeed
npm run type-check        # Must pass
npm run build             # Must succeed
npm run lint              # Must pass
```

### CI
- PR check workflow must pass all steps
- Type-check step must pass
- Build step must succeed
- SQL views / seed steps may warn but won't fail build

### Vercel
- Preview deployment must show READY state
- Production deployment (main) must show READY state
- All pages must load without 500 errors

---

## Troubleshooting

### "Module not found: @prisma/client"
- Ensure `postinstall: "prisma generate"` is in package.json
- Run `npm ci` (not `npm install`) to trigger postinstall

### "Cannot find module 'prisma'"
- Ensure `prisma` is in `dependencies` (not devDependencies)
- Prisma CLI is needed at runtime for generate

### Vercel build fails but CI passes
- Check for dependencies only used in CI (psql client, etc.)
- Verify no code imports from test-only files
- Check Vercel build logs for specific error

### Type errors on Vercel but not locally
- Ensure you pushed `package-lock.json`
- Run `npm ci` locally to match CI/Vercel behavior
- Check for any `// @ts-ignore` that hides issues
