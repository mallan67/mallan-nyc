# 🗄️ NEON.md — READ THIS BEFORE ANY DB, PRISMA, OR MIGRATION WORK

> **This file is the single source of truth for everything Neon / Prisma / DB-migration related on mallan-nyc. If you are about to touch `prisma/schema.prisma`, write a migration, add a column, drop an index, change `DATABASE_URL`, or modify `vercel.json` — stop and read this file first. Then read `docs/DEPLOYMENT.md` which is the authoritative architecture doc.**

**Last updated:** 2026-07-05 · **Review:** whenever tier changes, a migration ships, or `ops:health` surfaces a new warning.

**Plan:** **Launch** (`launch_v3`, since 2026-05-17; live-verified 2026-07-05 via `neonctl projects get`). Storage cap 10 GB, compute fixed 0.25 CU, branch cap 5000 per project. See §2 for full table + the machine-checked canonical-facts block, §10 change log for tier-history.

> **PITR / history retention is 6 hours (21600 s), live-verified 2026-07-05 — NOT 7 days.** Earlier revisions of this file claimed "7 days" sourced from Neon's plan documentation, never from the live setting; that was drift (OPS-016). 7-day PITR *is* available on the Launch plan but is not the current setting — see §2.1 for the verified value and the exact (Maya-gated) command to raise it.

> ## 🛑 AGENT STOP — Neon/Vercel database authority
>
> - **Repository work is GitHub-only.** Do not use Desktop worktrees/mirrors as current state.
> - **Canonical Production:** Vercel Marketplace resource `neon-green-school` /
>   `store_K9l79ICRUTMsiRh2` → Neon project `hidden-mountain-87248164` → branch `main`
>   (`br-crimson-frog-adr7g9gt`) → endpoint `ep-cold-waterfall-adno3ao2`.
> - **Stale / DO-NOT-SERVE:** `morning-bread-68708332` / `ep-royal-dawn-ad6eh8t2`. Keep its
>   refusal identity in safety code; never target it for Mallan runtime.
> - **Do not state `round-recipe-12208101` ownership/connectivity as fact.** It is not visible in the
>   currently accessible Neon orgs, so its current state is UNVERIFIED.
> - **Branch-history correction (2026-09-20):** a 2026-09-18 current/deleted enumeration returned only
>   `main`, but that bounded response does **not** establish lifetime branch history. Repository evidence
>   records 8 branches on 2026-05-17 and approximately 40 on 2026-06-01. Re-read current topology through
>   the Vercel-managed resource before any branch decision.
> - **Direct Neon control is quarantined.** The former PR-close cleanup, scheduled prune route/operator
>   prune CLI, and credential-rotation workflow may not call Neon directly. Provider lifecycle mutation
>   must be redesigned through the Vercel-managed resource contract and separately authorized.
> - **Vercel is the entry path for the managed Neon resource.** Use
>   `vercel integration open neon neon-green-school` for SSO into the bound Neon project. Reconcile
>   direct Neon reads to this exact Vercel binding before treating them as Mallan truth.
> - **Do not create a normal child branch from Production for Development.** Any approved Development
>   branch must use the explicitly approved schema-only/root mechanism so Production rows/auth material
>   are not cloned.
> - **Do not mutate env, Neon settings, branch protection, pruning, rotation, or resource bindings without
>   Maya's explicit authorization.**
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

| Dimension | Launch plan baseline | Current usage | Source |
|---|---|---|---|
| Storage | **10 GB** (10,240 MB) — usage-billed past baseline | Neon synthetic (billed) storage **~1.51 GB / ~14% of cap** (incl. 6 h history/WAL); branch logical size ~1.40 GB — live `neonctl projects get` 2026-07-05. The older "~215 MB / 2%" figure was the `pg_database_size` LOGICAL measure and understated billed storage. | live `neonctl` + `scripts/ops-health.js` |
| Compute time | **300 CU-hours / month** baseline, overage at ~$0.16/CU-hr | fixed **0.25 CU** (autoscale min=max=0.25); well under baseline | live `neonctl` + `scripts/ops-health.js` |
| Branches per project | **5000** (vs. 10 on Free) | **1 (main only)** on `neon-green-school` — live 2026-07-05 (the Gate-6 rollback branch was auto-pruned; see OPS-022) | live `neonctl branches list` |
| Instant-restore window (PITR / history retention) | **6 hours on THIS project** — verified directly from Neon configuration (`history_retention_seconds=21600`, project API via neonctl, 2026-07-02; NOT inferred from runtime). Why not 7 days: Neon defaults are Free = 6h, paid plans = 1 day; Launch allows **up to** 7 days as a project-level setting (Console → Settings → Instant restore). This project kept its Free-era 6h setting through the 2026-05-17 Launch upgrade — the earlier "7 days (Launch baseline)" here conflated the Launch MAXIMUM with the configured value. Consequences: point-in-time restore reaches back only ~6h (named branches pin their LSN independently and are the durable restore mechanism — e.g. the Gate-6 rollback branch); the ~6h window governs how fast HISTORY ages out after branch deletion — it does NOT mean billed storage drops: the S1 check (OPS-018, measured 2026-07-02) confirmed freed TOAST space is **reusable-not-returned** (physical size did not fall after branches were deleted + retention elapsed + autovacuum). Do not treat a missing same-day drop as an anomaly and do not escalate to compaction — disposition is no compaction now, no pg_repack until after the Gate-6 drain if at all, VACUUM FULL forbidden. Re-verified live 2026-07-05 (`history_retention_seconds=21600`, unchanged) and now machine-checked every run by `npm run neon:verify` against the §2.1 canonical-facts block. Registry: OPS-016 (RESOLVED 2026-07-05) + OPS-018 | 21,600 s | Neon config API (neonctl) 2026-07-05 + Neon docs + OPS-018 measurement |
| Compute auto-suspend | 5 min idle (configurable; default unchanged from Free) | `db-keepalive` cron at `*/15` **mitigates, does not prevent** — see §3 Trap #3. The 15-min interval lets routine 5-min suspends happen between pings; the cron's job is preventing multi-hour idles, not 5-min suspends. | `app/api/cron/db-keepalive/route.ts`, `vercel.json` |

### 2.1 Canonical facts — machine-checked (OPS-016)

These are the **live-verified** canonical identity + configuration facts for the production Neon project (read-only `neonctl`, 2026-07-05). They are the single source of truth: **`npm run neon:verify` parses this exact block and fails if any value drifts from live Neon** (exit 1 = drift, exit 2 = could-not-reach-Neon/unverified). Do not hand-edit a value here to silence a drift — fix the live setting or record the real new value.

<!-- NEON:FACTS:START -->
project_id=hidden-mountain-87248164
org_id=org-wild-king-99967357
plan=launch_v3
region_id=aws-us-east-1
pg_version=17
default_branch_id=br-crimson-frog-adr7g9gt
endpoint_id=ep-cold-waterfall-adno3ao2
endpoint_host=ep-cold-waterfall-adno3ao2.c-2.us-east-1.aws.neon.tech
compute_min_cu=0.25
compute_max_cu=0.25
history_retention_seconds=21600
branches_limit=5000
<!-- NEON:FACTS:END -->

**Retention is settled at 6 h — this is the current standard, not a pending item.** Raising it to 7 days is an *optional* Launch-plan lever, not a fix owed. `neonctl` (2.22.0) cannot set retention; it is a Maya-gated Neon Console/API change and **has not been applied**. The exact change, prepared for approval:

- **Console:** console.neon.tech → project `hidden-mountain-87248164` → **Settings → Storage / Instant restore** → set history retention to **7 days** → Save.
- **API (equivalent):**
  ```bash
  curl -s -X PATCH https://console.neon.tech/api/v2/projects/hidden-mountain-87248164 \
    -H "Authorization: Bearer $NEON_API_KEY" -H "Content-Type: application/json" \
    -d '{"project":{"history_retention_seconds":604800}}'
  ```
  If applied, update `history_retention_seconds=604800` in the block above in the same change so `neon:verify` stays green. Trade-off: a longer window increases retained history/WAL storage (billed) — weigh against the ~1.5 GB current synthetic size.

### Plan-pressure ordering, not a hard ceiling

Unlike the Free tier (where 500 MB / 191.9 CU-hr were *hard* caps), Launch baselines are *soft* — overage is billed, not blocked. The thresholds in `scripts/ops-health.js` are configured to surface plan pressure long before overage billing becomes material.

### Upgrade triggers (from `scripts/ops-health.js`)

- Storage ≥ 70% of Launch cap (7 GB) → warning
- Storage ≥ 85% sustained → **discuss Scale-plan upgrade**
- Compute ≥ 240 hrs/month → warning (at 80% of 300)
- Branch count ≥ 25 → warning (anomalous-growth signal; baseline ~8)
- Branch count ≥ 4000 → critical (approaching 5000 plan cap)
- Sync watermark > 2 hrs stale → warning

**An upgrade is not the first resort. Reduce compute-burn / branch-count first.** Every DB query path added or removed matters; every preview-branch creation rate change matters.

### History — Free → Launch transition

Until 2026-05-17, mallan-nyc was on Neon's Free plan (500 MB storage / 191.9 CU-hr compute / 10 branches). Operational discipline + the `neon-branch-prune` cron (PR #80) kept the project within those caps. On 2026-05-17 the plan was upgraded to Launch after the Vercel-Neon integration began reporting stale "Branch limit exceeded" on every preview deploy. The cron + retention window remain enabled as hygiene + cost-control discipline. See `docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md` for the canonical false-check status + threshold/stale-state evidence.

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

### Trap #3 — Neon auto-suspends after 5 min idle (Launch plan inherits this default)

Before `93fb0cd9` (2026-03-26): a 24-hour outage was caused by Neon suspending overnight, then morning requests timing out on the cold start. The `db-keepalive` cron was added to prevent this.

This auto-suspend behavior is **not specific to the Free tier**. The Launch plan inherits the same 5-min idle suspend default; it is a per-compute-endpoint setting that can be raised via Neon Console but defaults to 5 min for cost reasons.

**Trade-off explicitly accepted:** we burn a small continuous amount of compute to avoid large intermittent outages. On the Launch plan this costs marginal pennies/month rather than threatening a hard quota, but the discipline remains.

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

> This checklist is **enforced by a git pre-commit + commit-msg hook**
> (`.githooks/pre-commit` + `.githooks/commit-msg`, installed via
> `npm run hooks:install`). Commits touching `prisma/schema.prisma`,
> `prisma/migrations/`, `vercel.json`, `lib/prisma*`, or `lib/idx/sync.ts`
> are **blocked** unless:
> 1. The commit message contains the acknowledgment token `[neon-preflight: OK]`
> 2. `npm run ops:health` was run within the last 60 minutes (`.ops-health-last` sentinel)
>
> Emergency bypass: `NEON_GUARD_BYPASS=1 git commit …` (document why in message).

```bash
# 0. Install the guard hooks once per clone
npm run hooks:install

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

### `lib/prisma.ts` — single Prisma client

The HTTP-driver experiment (`lib/prisma-http.ts`, "Phase 5") was prototyped 2026-04-17 and dropped per user decision 2026-04-25. The file is no longer in the repo. All routes use the standard pooled client at `lib/prisma.ts`. If a future cold-start incident makes the HTTP driver worth revisiting, write a fresh proposal — do not resurrect the old plan as-is.

---

## 7. Recovery playbooks

### A — "Neon compute baseline exceeded (Launch plan)"

Launch plan compute is **billed past 300 CU-hr/mo**, not blocked. The playbook below addresses both "approaching the baseline" (cost-discipline) and "way over baseline" (suggests a runaway query path that should be fixed regardless of plan).

1. `npm run ops:health` — confirm compute hours are near/over the Launch baseline (300 CU-hr/mo)
2. Neon console → Project → Usage — check current usage + reset date
3. **Options (in order of preference):**
   - Reduce compute-burn: audit recent changes for new DB query paths, check uptime-monitor frequency, consider slowing down `db-keepalive` or non-critical crons temporarily
   - Accept overage for the current month if a one-off (rare event, batch backfill, etc.) — Launch overage is metered, not catastrophic
   - **If sustained:** evaluate Scale plan upgrade (more baseline + lower per-CU-hr overage rate). Charter conversation required.
4. Once stable, apply any deferred migration manually: `DATABASE_URL=prod npx prisma migrate deploy`

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

## 8. Status of prior workstreams

The two workstreams previously listed here have both resolved:

### A — Phase 3 (migrate 8 most-read fields out of JSON into columns) — DROPPED

Folded into master refactor plan PR 5 (search projection). Master plan complete 2026-04-28. Typed columns `primary_photo_url`, `photo_count`, `list_agent_full_name`, `list_office_name`, `public_remarks_excerpt`, `close_price`, `close_date`, `latitude`, `longitude` now live on `Listing`. See `memory/REFACTOR-2026-04-25.md` for the full status table.

### B — Phase 5 HTTP adapter per-route adoption — DROPPED

Per user decision 2026-04-25. The prototype `lib/prisma-http.ts` was removed. Remaining cold-start mitigation is provided by the `db-keepalive` cron (§3 trap #3). See `memory/REFACTOR-2026-04-25.md` line 9 for the dropped-workstream record.

### Open follow-up — legacy JSON columns on `Listing`

Five JSON columns remain on `Listing` (`address`, `features`, `media`, `compliance`, `agent_info`) plus the slimmed `raw_data`. Master-plan PR 10 only delivered the `raw_data` slim writer + backfill; the other five columns are still written and read in parallel with the typed columns from PR 5. Drop plan: [`memory/PLAN-LEGACY-JSON-DROP-2026-04-28.md`](memory/PLAN-LEGACY-JSON-DROP-2026-04-28.md). Pick this up when prioritized — it is the largest remaining storage lever (~115 MB recoverable on the listings table).

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
| 2026-03-26 | `db-keepalive` cron added after 24-hour auto-suspend outage. Initially `*/3 * * * *` — that interval continuously beat the 5-min idle suspend window so compute stayed warm. Subsequently relaxed to `*/15 * * * *` to fit Vercel Hobby cron limits and reduce compute burn ~5×. **Trade-off:** at `*/15` the 5-min idle suspend WILL trigger between pings, so a user request after a quiet ~10-min gap eats a ~2–5 s cold start. The cron's job at `*/15` is preventing multi-hour idle (the actual cause of the original 2026-03-26 outage), not 5-min suspends. The `*/15` cadence has been the live state since well before this entry was filed. | `93fb0cd9` |
| 2026-04-17 | Phase 0–5 production hardening — Phase 1 storage cleanup (250→215 MB), SyncState + Archive models, `lib/prisma-http.ts` built (adoption deferred) | multiple |
| 2026-04-19 | First observed compute-quota silent-drift incident: `email_opt_out` migration rejected, build proceeded | `94b4808f` / `9032ab61` |
| 2026-04-20 | Schema-dependent code reverted; smart migration runner attempted then reverted; `prisma migrate deploy` removed from buildCommand entirely (aligns with `docs/DEPLOYMENT.md`); `/api/health` returned to zero-DB form; this file created | `3e73af9c`, (current) |
| 2026-04-28 | PR #75 — Neon shed (slim raw_data on Trestle imports); production backfill cut listings table from 270 MB to 173 MB and total DB from 293 MB to 196 MB (39.2% of cap) | `d39906fb` + (#76) |
| 2026-04-28 | PR #80 — daily `neon-branch-prune` cron at 04:00 UTC + `lib/neon/branches.ts`, `scripts/neon-prune-branches.ts`, NEON.md §11 to keep the Neon-Vercel preview-branch integration under the free-tier 10-branch cap (root-cause fix for "Neon branching: Branch limit exceeded" check failures on preview deploys) | `2ebb6dbf` |
| 2026-04-28 | Post-PR-#80 Codex review hardening — `scripts/neon-prune-branches.ts` now validates `--hours` is a positive finite number before passing to `pruneBranches` (prevents `Number("24h") === NaN` from making every branch look prunable on `--execute`); `app/api/cron/neon-branch-prune/route.ts` now returns HTTP 500 when `pruneBranches` reports per-branch DELETE failures, so Vercel Cron flags the run as failed instead of letting stale branches accumulate silently. Plus `memory/SESSION-2026-04-28-allnighter.md` captures the full operational sequence + numbers for future-session reference. | `dc79b5be` (#81) |
| 2026-04-28 | Doc-drift cleanup pass — corrected stale `*/3` `db-keepalive` references to `*/15`, removed three references to deleted `lib/prisma-http.ts`, replaced §8 deferred-workstreams content with current status (A superseded, B dropped, JSON-drop work moved to a dedicated plan), refreshed last-updated header. New planning doc `memory/PLAN-LEGACY-JSON-DROP-2026-04-28.md` captures the remaining JSON-column drops on `Listing` (the largest unrealized storage lever, ~115 MB recoverable). | `86b2deb4` (#84) |
| 2026-04-28 | Codex-review accuracy fix on PR #84 — original wording claimed `*/15` keepalive "beats the 5-min idle suspend window comfortably," which is factually wrong (Neon suspends after 5 min idle, so a 15-min cron lets the DB suspend between pings). §2 and §10 reworded to make the trade-off explicit: `*/15` mitigates multi-hour idles, not 5-min suspends. | (current) |
| 2026-05-17 | **Plan upgrade Free → Launch.** Storage cap 500 MB → 10 GB. Compute baseline 191.9 → 300 CU-hr/mo. Branch cap 10 → 5000. The upgrade was confirmed via Vercel UI inspection (`neon-green-school` connected to `mallan-nyc`, Neon Console shows 8 / 5000 branches on `hidden-mountain-87248164`). The Vercel-Neon integration check "Branch limit exceeded" turned out to be stale Vercel-side state rather than real exhaustion — see `docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md` for the false-check evidence. §2 and §11 of this file rewritten to Launch framing; §3 Trap #3 reframed since 5-min idle auto-suspend is plan-agnostic. The `neon-branch-prune` cron + 24h retention window were historically enabled for hygiene + cost-control; direct Neon pruning is quarantined by the 2026-09-20 convergence correction. Threshold update to `scripts/ops-health.js`: `>=8` → `branch_count_warning=25`, new `branch_count_critical=4000`, storage cap 500 MB → 10240 MB, compute baseline 191.9 → 300. See `docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md` for the canonical status. | (current) |
| 2026-06-01 | **"Branch limit exceeded" confirmed a Vercel-side false check; made non-blocking.** Live verification: Neon API reports `branches_limit=5000` (`launch_v3`) on the bound project `hidden-mountain-87248164`; actual count ~40; a fresh test deploy created Neon branch #40 which reached `ready` — proving no real exhaustion. *Update Project Connection* (metadata re-sync) did **not** clear the red check. Two integration settings changed via the Vercel Storage UI (Maya, manual): (1) **"Create Database Branch For Deployment" → Production unchecked** (Preview still checked); (2) **"Require Active Resource Before Deploy" → OFF** — makes the false check **non-blocking** so deploys reach READY and the alias / custom-domain step completes (was "Skipped" under Require=ON). Test deploy `dpl_AUCCNDFtkDAQier4WcJtPjFWEa2d` reached READY; preview + production `/api/health` 200. Red ❌ still renders and is **only removable by Vercel**. Full record: `docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md`. No env vars / production DB / Neon branches / credentials touched. | (current) |
| 2026-06-01 | **Historical Tier 2 experiment — later model proved unsafe.** The PR-close cleanup workflow was introduced while `hidden-mountain-87248164` was labelled a "preview project." That label is not current authority. The workflow is now `QUARANTINED_DIRECT_NEON_CONTROL` and cannot delete branches. | (historical; quarantined 2026-09-20) |
| 2026-06-03 | Production DB confirmed on **`hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2` / `main` (`br-crimson-frog-adr7g9gt`)**; legacy `morning-bread`/`royal-dawn` is stale/do-not-serve. Stale Neon/Vercel docs removed; canonical facts live in the AGENT STOP box (top of this file) + `docs/architecture/NEON-VERCEL-OWNERSHIP-MAP.md`. `rotate-db-keys` schedule disabled (PR #321). | (current) |
| 2026-07-05 | **OPS-016 permanent resolution.** All Neon facts live-verified read-only (`neonctl projects get` / `branches list` / `connection-string`): plan `launch_v3`, compute fixed 0.25 CU, 1 branch (main only), **history retention `21600 s` = 6 h** (NOT 7 days). Added the machine-checked §2.1 `NEON:FACTS` block + `npm run neon:verify` (`scripts/neon-verify.ts`) which fails on any docs↔live drift; corrected the stale storage (~215 MB → synthetic ~1.51 GB) and branch-count (8 → 1) figures; documented the 7-day raise as an optional Maya-gated Console/API lever (not applied). No live Neon setting, env, cron, migration, or branch changed. | (current) |

---

## 11. Vercel ↔ Neon integration — current measured state

### Bound resource

The Mallan Vercel project has one active Neon Marketplace resource:

- Vercel project: `mallan-nyc`
- resource: `neon-green-school`
- Vercel store id: `store_K9l79ICRUTMsiRh2`
- Neon project: `hidden-mountain-87248164`
- Production branch: `main` / `br-crimson-frog-adr7g9gt`
- Production endpoint identity: `ep-cold-waterfall-adno3ao2`

Administrative/dashboard access to this Vercel-managed resource starts from Vercel SSO:

```bash
vercel integration open neon neon-green-school
```

The Vercel CLI manages the Marketplace binding/environment connection. Objects *inside* the Neon project
(branches, databases, roles) are Neon objects. Do not create a second unmanaged Neon project merely to
work around the binding.

### Branch reality — bounded evidence, not lifetime history

The 2026-09-18 current/deleted enumeration returned only `main` for `hidden-mountain-87248164`.
That response is a current bounded observation, not proof that no historical branches existed.

Historical repository evidence records **8 branches on 2026-05-17** and approximately **40 on
2026-06-01**, including a fresh test deployment that reached branch #40. Those dated records do not prove
the current branch estate either. Current topology must be read through the Vercel-managed resource before
a branch lifecycle decision.

Do not claim lifetime branch uniqueness or a steady-state branch count unless the authorized current
provider surface can actually prove that scope.

### Vercel database variable ownership — measured 2026-09-18

- Prisma/runtime reads the **bare** `DATABASE_URL` / `DATABASE_URL_UNPOOLED`.
- Vercel's Neon Marketplace integration owns the prefixed `database_*` family. Do not manually map or
  copy the prefixed values into the bare Prisma names.
- Production bare DB URLs resolve to canonical `ep-cold-waterfall-adno3ao2`.
- Development bare DB URLs also resolve to Production today; this is a known authority defect being
  corrected under the database-authority program.
- Generic Preview bare DB URLs are absent/fail-closed. Historical Git-branch Preview overrides exist and
  must be separately reconciled/removed; do not treat them as provider-managed branches.
- `database_NEON_PROJECT_ID` identifies `hidden-mountain-87248164`; the bare `NEON_PROJECT_ID`
  must not be inferred from that integration-owned value.

Always re-read Vercel before mutation. Variable **presence in `vercel env ls` is not proof of a usable
value**; empty encrypted values have existed here.

### Prune path — currently inert, fail-closed

`app/api/cron/neon-branch-prune/route.ts` is a fail-closed tombstone after 2026-09-20 convergence; the Vercel cron schedule is removed and it performs no Neon API call.
Measured 2026-09-18, both effective Production values are empty. The route therefore:

1. authenticates the cron request;
2. writes a `neon_branch_prune_cron` audit event with `status: "skipped"` / `reason: "missing_env"`;
3. returns HTTP 503;
4. does **not** call `pruneBranches()`.

Consequences:

- an audit event is not proof a deletion pass ran;
- `ops:health` must not infer successful pruning from the audit action alone;
- the cron is safe from accidental deletion in this state, but it is not maintaining branches;
- do not arm it merely to make health green. Its project model/auth/Preview lifecycle belong to the
  dedicated cron/control-plane hardening packet.

The standalone `scripts/neon-prune-branches.ts` path remains reachable when an operator explicitly
supplies valid authority; Packet 1's fail-closed `isPrunable()` corrections therefore protect a real path.

### Development branch rule

The approved Development topology is **not another Neon project**. If/when Packet 2A creates Development,
it must be one durable **schema-only root branch** inside `hidden-mountain-87248164`, reached through the
existing Vercel-managed resource. A normal `parent-data` child branch is forbidden because it clones
Production rows, including auth/session material.

Before any Development branch is wired into Vercel:

- verify its Neon record reports the schema-only initialization mode;
- prove Production rows/PII/auth tokens were not copied;
- record its endpoint identity in the existing approved-nonproduction authority declaration;
- then repoint only the Development-scoped bare Prisma URLs.

Do not enable generic Preview branching as part of that operation.

### Production branch protection

Production `main` is currently not protected. Protection is a separate, explicitly authorized
control-plane change (Packet 2A.1), not something to bundle into Development creation. Verify workflow
compatibility first, then prove Production endpoint/deployment behavior remains unchanged after any change.
