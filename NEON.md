# 🗄️ NEON.md — READ THIS BEFORE ANY DB, PRISMA, OR MIGRATION WORK

> **This file is the single source of truth for everything Neon / Prisma / DB-migration related on mallan-nyc. If you are about to touch `prisma/schema.prisma`, write a migration, add a column, drop an index, change `DATABASE_URL`, or modify `vercel.json` — stop and read this file first. Then read `docs/DEPLOYMENT.md` which is the authoritative architecture doc.**

**Last updated:** 2026-04-20 · **Review:** whenever tier changes, a migration ships, or `ops:health` surfaces a new warning.

---

## 1. The single most important rule

**Vercel builds DO NOT run migrations.** Per `docs/DEPLOYMENT.md` lines 33–42, 53, 101–103:

> *Vercel (Production) — Purpose: Static build for deployment (no database at build time)*
>
> *Schema changes: Apply via `prisma db push` or `prisma migrate` in CI or manually, **never during Vercel build**.*

The `vercel.json` `buildCommand` must not contain `prisma migrate deploy` or `prisma db push`. Builds do `prisma generate` only (that reads the schema file, never the DB). Migrations are applied to prod **manually** by a developer — nothing in the pipeline does it for you.

**Why this matters:** putting migrations in the build pipeline means every Vercel deploy — even changes that don't touch schema — attempts an ALTER/CREATE against Neon. On a free tier with a finite compute-hour budget, that burns quota for no reason. It also creates silent-failure traps: either the build fails on a transient Neon issue, or it swallows the error and ships with schema drift. Both are bad. The architecture sidesteps both by not putting migrations in the build at all.

### If you break this rule

1. Builds start failing on Neon cold starts (original problem that led to `db8ec5c4`)
2. Someone adds `|| echo` to swallow the error (original "fix")
3. A real error (quota, bad SQL, auth) gets swallowed identically
4. Code that depends on the migration deploys anyway → 500s in prod
5. **This is exactly what happened 2026-04-19.**

---

## 2. Current tier + caps

| Dimension | Free tier cap | Current usage | Source |
|---|---|---|---|
| Storage | **500 MB** | ~215–220 MB after Phase 1 cleanup | `scripts/ops-health.js:25`, `scripts/phase1-ROLLBACK.md` |
| Compute time | **191.9 hours / month** on primary branch | Recently hit quota on 2026-04-19 (build-time migrations + mass redeploys) | `scripts/neon-full-audit.js:336`, `scripts/ops-health.js:28` |
| PITR retention | 7 days | — | `scripts/phase1-cleanup.sql:37` |
| Compute auto-suspend | 5 min idle | Prevented by `db-keepalive` cron every 3 min | `app/api/cron/db-keepalive/route.ts`, `vercel.json` |

### The compute budget is the tight one, not storage

- Neon free tier: 191.9 compute-hours/month ≈ 25% of a calendar month (720h)
- The architecture is designed assuming the DB spends 75% of its time **idle/suspended**
- The `db-keepalive` cron trades a bit of compute for reliability — it prevents the 24h+ cold-start outages that happened before (commit `93fb0cd9`) — but it does **not** hold compute always-on; it's a lightweight periodic ping
- Every additional query path (especially synthetic ones like health probes or repeated migrations) cuts into the 191.9h budget

### Upgrade triggers (from `scripts/ops-health.js`)

- Storage ≥ 80% → warning
- Storage ≥ 85% sustained → **consider upgrade**
- Compute ≥ 160 hrs/month → warning (at 83% of cap)
- Sync watermark > 2 hrs stale → warning

**An upgrade is not the first resort. Reduce compute-burn first.** Every DB query path added or removed matters.

---

## 3. Known traps

### Trap #1 — Putting migrations in the Vercel build command

History:
- Before `d3f6f9d2`: buildCommand was `next build` only. Migrations were run manually. This is the documented design.
- `d3f6f9d2`: added `npx prisma migrate deploy` to buildCommand. Deviation from design.
- `db8ec5c4` (2026-03-16): added `|| echo 'Migration skipped — DB cold'` to avoid blocking builds when Neon is cold.
- **2026-04-19:** a compute-quota rejection was swallowed identically to cold-start timeout → schema drift → `/api/unsubscribe` + sendEmail queries would have 500'd if the build had completed (separately blocked by a missing component file).
- **2026-04-20:** smart-runner attempt that classified errors. Still violated the documented design. Reverted.
- **2026-04-20:** restored the documented design. `buildCommand` no longer touches migrations.

**Do not re-add migrations to the buildCommand.** If you find a reason to, add it to this file first and explain why `docs/DEPLOYMENT.md` should change.

### Trap #2 — `prisma db push` bypasses migration history

Commit `12261631 fix(prisma): baseline reconciliation + db push guard` documents that the project has historically used `prisma db push` for some schema changes. That writes to the DB without creating a migration file. Result: some prod columns (e.g., `Lead.last_unsubscribe_at` from commit `5bffbc7f`) have no corresponding migration file.

Before writing a new migration, run `npx prisma migrate diff` to see if the schema is drifted. If yes, baseline first.

### Trap #3 — Neon free tier auto-suspends after 5 min idle

Before `93fb0cd9` (2026-03-26): a 24-hour outage was caused by Neon suspending overnight, then morning requests timing out on the cold start. The `db-keepalive` cron was added to prevent this.

**Trade-off explicitly accepted:** we burn a small continuous amount of compute to avoid large intermittent outages. This is part of why the compute budget is tight — it's not "free"; it's "paying for uptime in compute hours."

### Trap #4 — Deploying schema-change PRs without running the migration first

My own mistake on 2026-04-19. I wrote a migration file, pushed the code that depended on it, and let Vercel's build-command migration attempt apply it. Vercel's attempt hit compute-quota, silently skipped, and would have shipped broken code.

**The discipline** (from CLAUDE.md + this file §5):
1. Write migration against a nullable column
2. Run `DATABASE_URL=prod npx prisma migrate deploy` manually
3. Confirm the migration applied (`npx prisma migrate status`)
4. THEN push the code PR that depends on the column

---

## 4. Migration discipline

### Per-PR pattern (from `CLAUDE.md` deferred-workstream block)

1. **Add nullable column** — `Boolean?` / `String?` / `DateTime?`. Never `NOT NULL DEFAULT …` even though PG ≥11 makes it metadata-only.
2. **Dual-write in `lib/idx/sync.ts`** (JSON + column) — ensures new rows populate the column during the transition.
3. **Wait ≥ one sync cycle** (idx-sync is `*/12 * * * *`).
4. **Migrate ONE reader** from JSON → column.
5. **Verify `npm run ops:health`.**
6. Repeat for the next reader.

### One change per PR

One column, or one table, per commit. Two changes together = two rollback paths.

### Forbidden without explicit approval

- `DROP COLUMN` on a column with live readers
- `ALTER COLUMN … TYPE` on large tables (table rewrite = compute spike = quota risk)
- `CREATE INDEX` without `CONCURRENTLY` on tables > 10K rows
- Any migration on `listings`, `leads`, or `audit_events` during business hours (3–5 AM ET only)
- Pushing a schema-dependent code PR **without** first running the migration against prod

### Forbidden SQL patterns

```sql
-- BAD: NOT NULL on a populated table — blocks if any row has NULL during the window
ALTER TABLE "leads" ADD COLUMN "email_opt_out" BOOLEAN NOT NULL DEFAULT false;

-- BAD: FK to a large existing table without ON DELETE behavior specified
ALTER TABLE "leads" ADD CONSTRAINT "fk_x" FOREIGN KEY ("agent_id") REFERENCES "agents"("id");

-- BAD: unique index on a large table without CONCURRENTLY
CREATE UNIQUE INDEX "leads_external_id_key" ON "leads"("external_id");
```

### Good SQL patterns

```sql
-- GOOD: nullable, reversible
ALTER TABLE "leads" ADD COLUMN "email_opt_out_at" TIMESTAMP(3);

-- GOOD: CONCURRENTLY index on a large table
CREATE INDEX CONCURRENTLY "leads_external_id_idx" ON "leads"("external_id");

-- GOOD: new empty table — no contention
CREATE TABLE "company_settings" (...);
```

---

## 5. Pre-flight checklist — BEFORE pushing a schema-dependent PR

```bash
# 1. Confirm Neon has headroom
npm run ops:health
# Read "pct_of_free" for storage (<80%) and compute hours used (<160)

# 2. Apply the migration to PROD manually, from your machine
#    (use the prod DATABASE_URL — NOT the local dev one)
DATABASE_URL="postgres://...@neon..." npx prisma migrate deploy

# 3. Confirm it actually applied
DATABASE_URL="postgres://...@neon..." npx prisma migrate status

# 4. Run validators
npx prisma validate
npm run type-check
npm run compliance-check
npm run ucba:audit
npm run rls:validate

# 5. Only THEN git commit + push the code PR
```

If step 2 fails with `compute quota exceeded`, **do not push the code PR.** Wait for quota reset or reduce compute burn elsewhere. Do not add the migration to Vercel's build command as a workaround.

---

## 6. Tools

### `scripts/ops-health.js`

```bash
npm run ops:health               # human output
npm run ops:health -- --json     # machine output
```

Reports storage %, top tables, sync freshness, retention archive queue, upgrade triggers. Exit 0/1/2 (healthy/warning/critical). Run before every migration.

### `scripts/neon-full-audit.js`

Deep tier-decision audit. Measures JSON bloat, index bloat, write volumes, growth projection. Run before any "upgrade vs optimize" discussion.

### `scripts/neon-storage-audit.js` / `scripts/neon-listings-deep.js`

Storage-focused audits for when `ops:health` reports storage >80%.

### `scripts/phase1-run.js` + `scripts/phase1-ROLLBACK.md`

The cleanup-playbook pattern every DB-change script must follow: `--verify-only` / `--dry-run` / `--execute`, idempotent, with pre-state capture.

### `lib/prisma-http.ts` (Phase 5, adoption deferred)

HTTP-driver Prisma client for public read routes. Avoids TCP handshake on cold start. 45–56ms vs 1–3s. Adopt one route at a time per CLAUDE.md follow-up.

---

## 7. Recovery playbooks

### A — "Neon compute quota exceeded"

1. `npm run ops:health` — confirm compute hours are near/over cap
2. Neon console → Project → Usage — check the reset date
3. **Options (in order of preference):**
   - Reduce compute-burn: audit recent changes for new DB query paths, check uptime-monitor frequency, consider slowing down `db-keepalive` or non-critical crons temporarily
   - Wait for monthly reset — acceptable if within 24–48 hrs
   - **Last resort:** upgrade to Launch ($19/mo, 300 compute hrs, 10 GB). Do this only if reducing burn is genuinely not possible
4. Once unblocked, apply any deferred migration manually: `DATABASE_URL=prod npx prisma migrate deploy`

### B — "Schema drift: prod has columns that don't match `prisma/schema.prisma`"

1. `npx prisma db pull --print` → diff against your schema file
2. If drift is from `db push` (Trap #2), baseline:
   ```bash
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<timestamp>_baseline/migration.sql
   npx prisma migrate resolve --applied <timestamp>_baseline
   ```
3. If drift is from a failed migration: `npx prisma migrate status` → `resolve --rolled-back <name>` → fix SQL → retry

### C — "All routes 500ing with connection timeout"

1. Load `https://mallan.nyc/api/health` — 503 means Next.js runtime itself is down; 200 means runtime is up, DB is likely cold
2. Confirm `db-keepalive` cron is enabled in `vercel.json` (`*/3 * * * *`)
3. Neon console → restart compute manually
4. Hit a DB-dependent route (e.g. `/api/listings?q=manhattan`) — first request takes ~2–5s while compute wakes; subsequent requests should be ~50ms

### D — "I pushed a code PR and the migration wasn't applied first"

1. **DO NOT panic-revert the Prisma schema.** Check `npx prisma migrate status` first — did the migration apply?
2. If YES: leave the schema file alone. The code will work now.
3. If NO:
   - Option 1: apply the migration manually (`DATABASE_URL=prod npx prisma migrate deploy`). Verify. Done.
   - Option 2: revert the code PR so prod matches reality. (This was 2026-04-20's path.)
4. Never edit `prisma/schema.prisma` to "match prod" without also handling the `_prisma_migrations` table.

---

## 8. Deferred workstreams

Documented in `CLAUDE.md` top follow-up block. Review date **2026-05-01**.

### A — Phase 3: migrate 8 most-read fields out of JSON into columns

One column per PR, nullable, dual-write, wait one sync cycle, migrate one reader, verify. Target order:
1. `primary_photo_url` + `photo_count`
2. `list_agent_full_name` + `list_office_name`
3. `public_remarks`
4. `close_price` + `close_date`
5. `latitude` + `longitude`

### B — Phase 5 HTTP adapter per-route adoption

`lib/prisma-http.ts` validated 2026-04-17. Adoption plan:
1. `app/api/idx/search/route.ts`
2. `app/api/listings/similar/route.ts`
3. `app/api/agents/[slug]/listings/route.ts`
4. `app/api/buildings/route.ts`
5. `app/api/open-houses/route.ts`

Per-route pattern: swap import, type-check, smoke test, deploy, measure, then next route.

---

## 9. Observability

### `GET /api/health` — intentionally simple

Returns `{ success: true }` on HTTP 200. **Zero DB operations.** Point uptime monitors here to detect a fully-down site. Do **not** add DB probes — they burn compute for no incremental signal, because the real user-facing routes already hit the DB and return their own 500s when things are broken.

### `npm run ops:health`

Full operational report. Use before every migration and after every deploy.

### Vercel deploy-fail emails

Vercel dashboard → profile → Settings → Notifications → enable "Deployment Failed" + "Deployment Error". One-time config.

### Neon console

https://console.neon.tech → Project → Usage shows compute-hours used this month and reset date.

---

## 10. Change log

| Date | Event | Commit |
|---|---|---|
| 2026-03-16 | `\|\| echo 'Migration skipped'` pattern introduced in `vercel.json` buildCommand for cold-start survival | `db8ec5c4` |
| 2026-03-26 | `db-keepalive` cron every 3 min added after 24-hour auto-suspend outage | `93fb0cd9` |
| 2026-04-17 | Phase 0–5 production hardening — Phase 1 storage cleanup (250→215 MB), SyncState + Archive models, `lib/prisma-http.ts` built (adoption deferred) | multiple |
| 2026-04-19 | First observed compute-quota silent-drift incident: `email_opt_out` migration rejected, build proceeded | `94b4808f` / `9032ab61` |
| 2026-04-20 | Schema-dependent code reverted; smart migration runner attempted then reverted; `prisma migrate deploy` removed from buildCommand entirely (aligns with `docs/DEPLOYMENT.md`); `/api/health` returned to zero-DB form; this file created | `3e73af9c`, (current) |
