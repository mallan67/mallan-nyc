# 🗄️ NEON.md — READ THIS BEFORE ANY DB, PRISMA, OR MIGRATION WORK

> **This file is the single source of truth for everything Neon / Prisma / DB-migration related on mallan-nyc. If you are about to touch `prisma/schema.prisma`, write a migration, add a column, drop an index, change `DATABASE_URL`, or modify `vercel.json`'s build command — stop and read this file first.**

**Last updated:** 2026-04-20 · **Review:** whenever tier changes, a migration ships, or ops-health surfaces a new warning.

---

## Table of Contents

1. [Current tier + caps (the numbers you actually need)](#1-current-tier--caps)
2. [Known traps (how prior deploys have silently failed)](#2-known-traps)
3. [Migration discipline (the pattern you MUST follow)](#3-migration-discipline)
4. [Before you push a migration — the pre-flight checklist](#4-pre-flight-checklist)
5. [Tools (scripts that already exist)](#5-tools)
6. [Recovery playbooks](#6-recovery-playbooks)
7. [Deferred workstreams (Phase 3 + Phase 5)](#7-deferred-workstreams)
8. [Observability (/api/health + ops:health)](#8-observability)
9. [Change log](#9-change-log)

---

## 1. Current tier + caps

| Dimension | Free tier cap | Current usage (as of 2026-04-20) | Source |
|---|---|---|---|
| Storage | **500 MB** | ~215–220 MB after Phase 1 cleanup | `scripts/ops-health.js:25`, `scripts/phase1-ROLLBACK.md` |
| Compute time | **191.9 hours / month** on primary branch | **Quota hit on 2026-04-19 deploy** | `scripts/neon-full-audit.js:336`, `scripts/ops-health.js:28` |
| PITR retention | 7 days | (Launch tier: 30 days) | `scripts/phase1-cleanup.sql:37` |
| Compute auto-suspend | After 5 min inactivity | Prevented by `db-keepalive` cron every 3 min | `app/api/cron/db-keepalive/route.ts`, `vercel.json` |

**Upgrade triggers** (per `scripts/ops-health.js`):
- Storage ≥ 80% → warning
- Storage ≥ 85% sustained → upgrade recommended
- Compute ≥ 160 hrs/month → warning
- Sync watermark ≥ 2 hrs stale → warning

**If you are about to add a schema change, run `npm run ops:health` FIRST. Do not push a migration when storage is >80% or compute is >80% of cap — you will hit the quota mid-migration and Neon will reject the SQL.**

---

## 2. Known traps

### Trap #1 — The `|| echo` migration swallow (FIXED 2026-04-20)

**Old behavior (Mar 16 – Apr 20):** `vercel.json` build command wrapped `prisma migrate deploy` in `|| echo 'Migration skipped — DB cold'`. This was added in commit `db8ec5c4` to survive cold-start timeouts. It caught **every** error mode identically — cold start, quota, SQL syntax, auth — all "skipped" the same way.

**What went wrong on 2026-04-19:** a `leads.email_opt_out NOT NULL DEFAULT false` migration hit Neon's compute quota. The build continued without applying the schema. Code that depended on the column would 500 on every call.

**Current fix (2026-04-20):** Build command now uses `scripts/vercel-migrate-deploy.js`. This script **classifies** the error and decides:

| Error class | Build decision | Why |
|---|---|---|
| Success | exit 0 + sentinel `applied` | normal path |
| Cold-start timeout / ECONN* | exit 0 + sentinel `skipped_cold_start` | retries next deploy — preserves original intent |
| Compute quota exceeded | **exit 1 (blocks build)** | schema would drift silently — unacceptable |
| SQL / FK error | **exit 1** | migration is broken — fix it |
| Auth / DNS / env error | **exit 1** | config is wrong |
| Unknown | **exit 1 (fail closed)** | assume worst case |

The script writes `.next/prisma-migration-state.json`. `/api/health` reads it and surfaces `migration.state` in its checks array.

**DO NOT revert to `|| echo` without also solving the silent-drift problem a different way.**

### Trap #2 — `prisma db push` bypasses migration history

The project has used `prisma db push` in some past commits (see `12261631 fix(prisma): baseline reconciliation + db push guard`). That writes schema changes to the DB without creating a migration file. The drift between `prisma/schema.prisma` and `prisma/migrations/*/migration.sql` is a **real gap**.

Some columns in prod (`Lead.last_unsubscribe_at`, added in commit `5bffbc7f` Two-CRM rollout) have no migration file. They exist in schema + DB because of `db push`. When you write a new migration, check `prisma migrate diff` to see if baselining is needed.

### Trap #3 — Neon free tier auto-suspends after 5 min idle

Before the `db-keepalive` cron existed, the site had a 24-hour outage (Mar 26) because Neon suspended overnight and all DB routes 500'd. The cron at `*/3 * * * *` prevents this but **consumes compute hours** (adds ~720 hrs/month of low-activity compute, counted separately from active query time).

If you disable or remove `db-keepalive`, expect suspensions within an hour of low traffic.

### Trap #4 — Free-tier PITR retention is only 7 days

Neon storage reclaim (after VACUUM FULL) takes up to 7 days to reflect in billing because of PITR branch retention. Don't panic if the Neon console still shows old size for a week after Phase 1 cleanup.

---

## 3. Migration discipline

**The documented pattern** (from `CLAUDE.md` deferred-workstream block, follow-up review 2026-05-01):

> Per-PR pattern: (1) add **nullable** column, (2) dual-write in `lib/idx/sync.ts` (JSON + column), (3) wait one sync cycle for backfill via cron, (4) migrate ONE reader from JSON → column, (5) verify `npm run ops:health`, repeat.

### Required for every new column / table

- [ ] **Nullable** — `Boolean?` / `String?` / `DateTime?`. Not `NOT NULL DEFAULT …` even though PG ≥11 treats it as metadata-only. Nullable preserves rollback without a data migration.
- [ ] **One change per PR** — one column, or one table, per commit. Two columns together means two rollback paths.
- [ ] **Dual-write period** — add the column AND start writing to it from `lib/idx/sync.ts` in the same PR. Do NOT migrate readers in the same PR.
- [ ] **Wait at least one full sync cycle** (12 min for idx-sync) before moving readers.
- [ ] **Migrate ONE reader** at a time, verify `/api/health` stays green.
- [ ] **`npm run ops:health` before and after** — capture the storage + compute delta.

### Forbidden without explicit approval

- `DROP COLUMN` on a column with readers (break users mid-session)
- `ALTER COLUMN … TYPE` on large tables (rewrite = compute spike = quota risk)
- `CREATE INDEX` without `CONCURRENTLY` on tables >10K rows
- Any migration that modifies `listings`, `leads`, or `audit_events` during business hours (3–5 AM ET only)
- Shipping a migration without running it locally against prod `DATABASE_URL` first

### Required SQL patterns

```sql
-- GOOD: nullable, reversible
ALTER TABLE "leads" ADD COLUMN "email_opt_out_at" TIMESTAMP(3);

-- BAD: NOT NULL on a populated table — blocks if any row has NULL during the window
ALTER TABLE "leads" ADD COLUMN "email_opt_out" BOOLEAN NOT NULL DEFAULT false;

-- GOOD: safe on a new empty table
CREATE TABLE "new_thing" ( ... );

-- BAD: FK to an existing large table without ON DELETE behavior
ALTER TABLE "leads" ADD CONSTRAINT "fk_x" FOREIGN KEY ("agent_id") REFERENCES "agents"("id");
```

---

## 4. Pre-flight checklist

**Before pushing any commit that modifies `prisma/schema.prisma`:**

```bash
# 1. Confirm Neon has headroom
npm run ops:health
# Read "pct_of_free" for storage (<80%) and compute hours used (<160)

# 2. Run the migration locally against PROD to confirm it actually applies
#    (copy prod DATABASE_URL into .env.local.prod)
DATABASE_URL="postgres://...@neon..." npx prisma migrate deploy

# 3. Confirm Prisma schema validates
npx prisma validate

# 4. Confirm TypeScript is clean against the new schema
npm run type-check

# 5. Confirm compliance + IDX validators still pass
npm run compliance-check
npm run ucba:audit
npm run rls:validate

# 6. Only THEN git commit + push
```

If step 2 fails with `compute quota exceeded`, **do not push the commit**. Wait for quota reset or upgrade the plan first.

---

## 5. Tools

### `scripts/ops-health.js` — run anytime

```bash
npm run ops:health               # human output
npm run ops:health -- --json     # machine output (for cron / CI)
```

Returns exit code 0 / 1 / 2 (healthy / warning / critical). Reports:
- Storage: DB size, top 5 tables, % of free cap
- Sync: last run status, watermark age, rows upserted, error rate
- Retention: archive queue size, compliance gap
- Upgrade triggers: storage ≥85%, compute ≥160 hrs, sync stale >2h

### `scripts/vercel-migrate-deploy.js` — the build-command runner

Not invoked manually in normal work. Wired into `vercel.json:buildCommand`. See Trap #1.

### `scripts/neon-full-audit.js` — deep tier decision

```bash
node --env-file=.env.local scripts/neon-full-audit.js
```

Detailed breakdown for Phase 6 upgrade decisions. Measures JSON column fat, index bloat, write volumes, projected growth. Run this before any "upgrade tier or optimize" conversation.

### `scripts/neon-storage-audit.js` / `scripts/neon-listings-deep.js`

Storage-focused audits. Use when `ops:health` reports storage >80% to identify what to trim.

### `scripts/phase1-run.js` — the cleanup playbook pattern

Demonstrates the `--verify-only` / `--dry-run` / `--execute` idempotent pattern every DB-changing script MUST follow. Read `scripts/phase1-ROLLBACK.md` for the full operational playbook.

### `lib/prisma-http.ts` — cold-start-free HTTP driver

For public read-heavy routes after Phase 5 adoption. Use instead of `lib/prisma.ts` for public reads. See §7 for the adoption plan.

---

## 6. Recovery playbooks

### Playbook A — "Neon compute quota exceeded, build is blocked"

1. Run `npm run ops:health` — confirm compute hours are maxed
2. Log into Neon console (console.neon.tech) → Project → Usage
3. Check reset date (free tier resets on billing anniversary, monthly)
4. **Options:**
   - **Upgrade to Launch ($19/mo, 300 compute hrs, 10 GB storage)** — immediate fix, instant restore
   - **Wait for reset** — if within 24–48 hrs
   - **Reduce compute burn temporarily** — disable non-critical crons (`idx-sync` frequency, `db-keepalive` cadence) to stretch the last hours
5. Once unblocked, run any missed migration manually:
   ```bash
   DATABASE_URL=prod npx prisma migrate deploy
   ```
6. Redeploy Vercel to refresh the migration sentinel
7. Verify `/api/health` shows all checks green

### Playbook B — "Schema is drifted — prod has columns that don't match prisma/schema.prisma"

1. Compare: `npx prisma db pull --print` → diff against your `prisma/schema.prisma`
2. If the drift is due to `db push` (see Trap #2), create a baseline migration:
   ```bash
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<timestamp>_baseline/migration.sql
   npx prisma migrate resolve --applied <timestamp>_baseline
   ```
3. If the drift is due to a failed migration, `npx prisma migrate status` will show which migration is pending
4. If a migration is marked failed: `npx prisma migrate resolve --rolled-back <migration_name>` then fix the SQL + retry

### Playbook C — "All routes 500ing with connection timeout"

1. Check `https://mallan.nyc/api/health` — `db` check should fail
2. Neon likely auto-suspended or has a connectivity issue
3. Confirm `db-keepalive` cron is enabled in `vercel.json` (`*/3 * * * *`)
4. Log into Neon console → restart compute manually
5. Verify `/api/health` returns 200 within 1 minute

### Playbook D — "I pushed a migration and prod broke"

1. **DO NOT panic-revert the Prisma schema.** If the migration APPLIED, reverting the schema without a down-migration leaves prod ahead of source.
2. Check `npx prisma migrate status` — did it actually apply?
3. If YES: write a **forward** migration that reverses the change. Don't delete the migration file.
4. If NO: delete the migration dir, revert `prisma/schema.prisma` to match prod, push the revert. (This is what the 2026-04-20 revert did.)
5. See `scripts/phase1-ROLLBACK.md` for the pattern.

---

## 7. Deferred workstreams

Documented in `CLAUDE.md` top follow-up block. Review date **2026-05-01** (after ≥2 weeks of stability following the 2026-04-17 Phase 0–5 shipment).

### Deferred A — Phase 3: migrate 8 most-read fields out of JSON into columns

**Target columns, in order of priority (ONE PER PR):**

1. `primary_photo_url` + `photo_count` — fast card render without Media join
2. `list_agent_full_name` + `list_office_name` — REBNY attribution without JSON parse
3. `public_remarks` — readable description without JSON traversal
4. `close_price` + `close_date` — past-sales display
5. `latitude` + `longitude` — geo queries (prep for Phase 6 PostGIS)

**Per-PR pattern** (see §3):
1. Add nullable column
2. Dual-write in `lib/idx/sync.ts` (JSON + column)
3. Wait one sync cycle
4. Migrate ONE reader
5. Verify `ops:health`
6. Repeat

### Deferred B — Phase 5 HTTP adapter per-route adoption

`lib/prisma-http.ts` is built and validated (45–56ms query latency vs 1–3s cold-start TCP). Adoption plan, one route at a time:

1. `app/api/idx/search/route.ts` (967 lines — highest traffic)
2. `app/api/listings/similar/route.ts`
3. `app/api/agents/[slug]/listings/route.ts`
4. `app/api/buildings/route.ts`
5. `app/api/open-houses/route.ts`

**Per-route pattern:**
1. Change `import prisma from "@/lib/prisma"` → `import prismaHttp from "@/lib/prisma-http"`
2. `npm run type-check`
3. `npm run ops:http-smoke`
4. Deploy, measure cold-start latency in Vercel logs
5. Only then do the next route

### Completion criterion

Close the CLAUDE.md follow-up when all 5 columns are migrated AND all 5 routes use `prismaHttp`. Archive this block with a dated note in `memory/NEON-PRODUCTION-HARDENING-2026-04.md`.

---

## 8. Observability

### `GET /api/health`

Returns `{ ok: boolean, failures: string[], checks: [...] }`. Each check has a name and detail string. **Bookmark this URL.** Point any free uptime monitor at it (UptimeRobot, Better Uptime, Freshping, Cronitor) — 503 on fail means automatic alert without touching Vercel.

Current checks:
- `db` — Postgres reachable via `SELECT 1`
- `migration.state` — reads `.next/prisma-migration-state.json` (written by `scripts/vercel-migrate-deploy.js`)
- `idx.sync_freshness` — `SyncState.last_run_at` < 2h old

Add new checks when adding new schema-dependent code paths. Remove them when rolling back.

### `npm run ops:health`

Full operational report. Use before every migration. Use weekly as a scheduled task. Use after any deploy to verify nothing drifted.

### Vercel email notifications

One-time: Vercel dashboard → your profile → Settings → Notifications → enable "Deployment Failed" + "Deployment Error". Maya's account email will receive deploy-fail emails. Zero ongoing work.

---

## 9. Change log

| Date | Event | Commit |
|---|---|---|
| 2026-03-16 | Original `\|\| echo 'Migration skipped'` pattern introduced for cold-start survival | `db8ec5c4` |
| 2026-03-26 | `db-keepalive` cron added after 24h+ auto-suspend outage | `93fb0cd9` |
| 2026-04-17 | Phase 0–5 production hardening (data-retention deletes, VACUUM FULL, SyncState + Archive, Phase 5 HTTP adapter) | multiple commits |
| 2026-04-19 | First observed compute-quota silent-drift incident (email_opt_out migration rejected, build succeeded, code would 500) | `94b4808f` through `9032ab61` |
| 2026-04-20 | Schema-dependent code reverted; `scripts/vercel-migrate-deploy.js` replaces `\|\| echo`; this NEON.md file created | `3e73af9c`, (current PR) |
