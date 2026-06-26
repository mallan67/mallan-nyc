# Gate 5 — archive flag-flip / drain EXECUTE runbook

**Status:** RUNBOOK PREPARED. **Flag NOT flipped. No drain run. No Vercel/env change.** Requires a separate explicit Maya approval to execute.
**Canonical doc for mechanics:** `docs/operations/archive-flag-runbook-2026-06-17.md` (kill-switch warning, §0 pre-check, §0.5 clock, §0.6 merge-safety, §4 verify, §5 rollback, §6 gate). This Gate-5 runbook is the *execution wrapper* with the post-Gate-3 numbers.
**Predecessors (all merged + executed):** #446 clock · #448 predicate repoint (default-OFF flag → `terminal_since < cutoff`) · #451/#452 backfill tooling · **Gate 3 backfill executed 2026-06-26** (89,688 rows clocked).

---

## 1. Pre-Gate-5 rollback branch (CREATED 2026-06-26)

| field | value |
|---|---|
| name | `pre-gate5-archive-flag-flip-2026-06-26` |
| branch id | `br-square-silence-adok1l3y` |
| endpoint id | `ep-holy-water-adtbnxoj` |
| parent | `br-crimson-frog-adr7g9gt` (canonical main) |
| project | `hidden-mountain-87248164` |
| created (UTC) | `2026-06-26T02:16:29Z` |

(Connection URI/password intentionally not recorded.) This is a point-in-time snapshot taken **before** any flip — the catastrophic-case fallback (the archive strip is one-way per row). If the flip is deferred more than a few days, refresh this branch immediately before flipping.

## 2. Current archive state (read-only, 2026-06-26, canonical prod `ep-cold-waterfall-adno3ao2`)

| metric | value |
|---|---:|
| `ARCHIVE_T180_BACKLOG_ENABLED` | **OFF** (env absent) |
| `listings_archive` | 34 |
| `sync_status='archived'` | 34 |
| flag-OFF eligible (`status_changed_at<cutoff`) | 0 |
| **flag-ON eligible (`terminal_since<cutoff`, exact archive predicate)** | **82,677** |
| by age | 180–365d 463 · 1–2y 5,839 · 2y+ 76,375 |
| noncanonical terminal (canonical IN would miss) | 0 (#449 non-blocking) |

## 3. What Gate 5 does (DESTRUCTIVE, one-way per row)

For each eligible terminal row, the nightly `data-retention` cron T+180 stage runs (in one atomic `$transaction`):
1. `listingsArchive.upsert(...)` — copies the **summary** (close price/date, original list price, address line, agent/office, beds/baths, DOM, etc.) into `listings_archive`.
2. `listing.update(...)` — on the live row sets `sync_status='archived'`, `raw_data=JsonNull`, `media=[]`, `compliance={}`.

`media`/`compliance` blobs are **gone** from the live row after the strip; `raw_data` close terms survive only as the extracted summary columns. **Forward-only per row** — turning the flag back off stops *future* selection but does not restore already-archived rows.

## 4. Gate 5 execution steps (DO NOT RUN until separately approved)

1. **Pre-flip re-verify (read-only):** flag still OFF; `listings_archive`=34; `sync_status='archived'`=34; flag-ON eligible ≈82,677; noncanonical=0; pre-Gate-5 rollback branch present (refresh if stale).
2. **Set the env var:**
   - **Exact var:** `ARCHIVE_T180_BACKLOG_ENABLED` = `true` (literal string; code treats anything ≠ `"true"` as OFF).
   - **Exact target:** Vercel → project **`mallan-nyc`** → Settings → Environment Variables → **Production** environment only.
3. **REDEPLOY (mandatory):** Vercel snapshots env per deployment; the running cron keeps its deploy-time env. Trigger a **fresh Production deployment** (not a promote of an older build) and confirm it is **READY** before the next cron tick — otherwise the flip has no effect.
4. **Cron/drain behavior:** the existing `data-retention` cron fires **`0 3 * * *`** (daily 03:00 UTC), `maxDuration=60s`. With the flag ON it archives up to **`T180_BATCH_CAP = 500` rows/run** (`status IN (canonical terminal) AND sync_status != 'archived' AND terminal_since < now−180d`). **One run/night.**
   - **First run:** ~**500** rows.
   - **nights_to_drain @ 500/run ≈ 166** (~5.5 months) for the 82,677 backlog. Raising the cap is a **separate gated change** (not in this runbook).
5. **Per-run verification (§5 below) after each nightly run** while the flag is ON.
6. **Stop conditions / rollback (§5/§6).**

## 5. Per-run verification checklist (after each nightly drain)

Run read-only (force `ARCHIVE_T180_BACKLOG_ENABLED=true` **locally only** for ops-health stable-clock counts — never re-set it in Vercel to "measure"):
1. **rows archived this run** ≈ up to 500 (cron response / audit `data_retention_run.t180d_listings_archived`).
2. **`listings_archive` delta** = +rows archived (rose by the run amount).
3. **`sync_status='archived'` delta** = +rows archived (matches).
4. **flag-ON eligible delta** = −rows archived (backlog shrank by the run amount).
5. **no active/live rows archived:** `count(*) WHERE sync_status='archived' AND status NOT IN (terminal)` = 0; `rebny_sec_2_05_violations` not worse.
6. **sample archived rows:** spot-check ~10 `listing_key`s present in `listings_archive` with close terms; live row `sync_status='archived'`, `raw_data`/`media`/`compliance` emptied, not publicly served.
7. **public render/search smoke:** `/api/health` 200; public listings render; archived terminals correctly **not** displayed (they were already excluded — terminal + not public — so no visible change expected).
8. **CRM smoke (if affected):** archived listings still resolve in CRM history/detail via `listings_archive` summary; no broken FK (PriceHistory/Showing/etc. preserved — row kept).
9. **ops:health:** `ARCHIVE_T180_BACKLOG_ENABLED=true npm run ops:health` (force the flag **locally only** so the script reports the stable-clock backlog — bare `npm run ops:health` would report the legacy `status_changed_at` backlog, which is 0, and hide the drain). Confirm `archive_backlog_predicate` reads **"stable-clock"**, then check: archive_backlog dropping; `listings_archived_total` rising; sync errors 0; storage trend.
10. **error logs:** no new `syncError` rows with resource `listings_archive_move`; Vercel runtime logs clean for `/api/cron/data-retention`.

**Any failed check → STOP: set the flag OFF + redeploy before the next nightly run.**

## 6. Archive vs reclaim vs downgrade (DISTINCT — do not conflate)
- **Archive / drain (Gate 5, this runbook):** destructive **row-level** strip + `sync_status='archived'` + summary into `listings_archive`. **Does NOT reclaim physical storage** — the stripped bytes become **dead tuples**; logical DB size does not drop immediately.
- **Reclaim (later, separate gate):** physical storage recovery — only after the PITR/branch-retention window elapses + autovacuum (or `pg_repack` if needed; **never** `VACUUM FULL`). A separate explicit decision, like the S1 reclaim gate.
- **Downgrade (later, separate decision):** any Neon tier/plan change — only after reclaim measurements. Not part of Gate 5.

**Proof Gate 5 does not reclaim immediately:** the archive UPDATE only rewrites rows (sets columns to null/empty/archived); Postgres MVCC leaves the old tuples as dead until vacuum, and Neon billed size is governed by the PITR window. So `listings_archive` grows and live blobs empty, but **physical/billed size does not shrink during Gate 5**.

## 7. Rollback options & limits
- **Stop future selection (kill-switch):** `ARCHIVE_T180_BACKLOG_ENABLED`=false (or remove) in Vercel Production **+ redeploy** (env is per-deployment). Verify the active deployment post-dates the change. Stops the next nightly batch; does **not** restore already-archived rows.
- **Catastrophic-case point-in-time:** the §1 pre-Gate-5 Neon branch (`br-square-silence-adok1l3y`) or Neon PITR (7-day window) — whole-branch restore, reverts unrelated writes too; last resort only.
- **No per-row un-archive** is provided here (would require manual restore from `listings_archive` summary + a Trestle re-fetch, not guaranteed for terminal listings).

## 8. Abort conditions (stop the drain)
- any per-run verification failure (§5);
- `rebny_sec_2_05_violations` increases or a non-terminal/live row is archived;
- `syncError` `listings_archive_move` rows appear;
- `/api/health` non-200 or public render breakage;
- archived count jumps far beyond ~500/run (cap not honored);
- connection/host mismatch.

## 9. Hard stops (this runbook executes none)
No flag flip until separate explicit approval · no manual drain until separate explicit approval · no cap increase unless separately approved · no reclaim · no downgrade · no S1 rollback-branch deletion · no #449 alias-normalization change · no archive-predicate change · never `prisma migrate deploy` on prod.

## 10. Recommendation
The backlog is well-formed (92% are 2y+ closed listings — clearly archive-appropriate; noncanonical=0; flag-OFF eligible=0 so the legacy path drains nothing). **Recommend proceeding to Gate 5 as controlled nightly 500/run batches with per-run verification (§5)**, after: (a) your decision on cadence (accept ~166 nights at the 500 cap, or separately approve a cap increase for a faster drain); (b) a refreshed pre-flip rollback branch if execution is deferred; (c) the flip done as env+redeploy (§4). Reclaim and downgrade remain later separate gates.
