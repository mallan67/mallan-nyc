# P2 archive-drain plan — report + go/no-go (READ-ONLY)

> **REPORT-ONLY. Flag NOT enabled.** No SQL writes, no migration, no reclaim, no downgrade, no env change, no new branch. Read-only DB measurement (cold-waterfall) + source read. Date 2026-06-24 · #415.

## GO/NO-GO: 🔴 **NO-GO — enabling `ARCHIVE_T180_BACKLOG_ENABLED` now reclaims ≈0 MB.**
The 383 MB of terminal JSON is real, but the archive predicate **cannot reach it**: idx-sync continuously re-stamps terminal listings' `modification_timestamp`/`status_changed_at` to recent values, so ~99.96% of terminals never age past the 180-day threshold. The flag is **defeated by the eligibility clock**. A separate fix (a non-bumped "terminal-since"/CloseDate clock) is required before the drain can do anything — and even then the strip only creates dead tuples, so a **reclaim step is still needed to shrink disk.**

---

## The 14 required answers

**1. Where it lives.** `app/api/cron/data-retention/route.ts` step **3c** (T+180d archive, lines 157–295); eligibility flag at line 177–185; archive table `listings_archive` (`prisma/schema.prisma` model `ListingsArchive`); the broadened predicate doc/helper `scripts/archive-backlog-predicate.js`.

**2. What the flag does.** `ARCHIVE_T180_BACKLOG_ENABLED==='true'` broadens archive eligibility from `status_changed_at < (now-180d)` → `... OR (status_changed_at IS NULL AND modification_timestamp < (now-180d))`. Default OFF. It only changes **which rows qualify**; the archive action is unchanged.

**3. Records touched.** Terminal listings (`Closed/Sold/Leased/Rented/Withdrawn/Expired/Cancelled`), `sync_status != 'archived'`, older than 180d by the eligibility clock. Batch cap **500/run**.

**4. What it does to a row (not a delete).** Per row, in a transaction: (a) **UPSERT a SUMMARY** into `listings_archive` (typed fields: ids, status, prices, beds/baths, address_line, agent name/office, DOM, close price/date — **NOT** the full `raw_data`); (b) **UPDATE the live `listings` row**: `sync_status='archived'`, `raw_data=JsonNull`, `media=[]`, `compliance={}`. The row is **kept** (FK integrity for PriceHistory/Showing/etc.). So it **archives a summary + strips heavy JSON + marks** — it does not delete, move, or compress.

**5. Storage impact — ≈0 MB now. [DB-measured]**
- Terminal listings: **92,782**; unarchived terminal **raw_data 216 MB / strippable (raw_data+compliance+media) 383 MB** — the JSON IS there.
- **Eligible to archive today: ~35 rows** (`modts_older_180d=35`, `schg_older_180d=34`). **Backlog under the flag = 0** (broadened predicate also matched 0). Already archived: 34.
- Root cause: `newest modification_timestamp`/`status_changed_at` for terminals = **today**; idx-sync re-stamps terminal rows on every re-emit, so they never satisfy ">180d old." → **the flag drains nothing.**
- Even when rows ARE stripped, `UPDATE … = null` produces **dead tuples** — disk is NOT reclaimed until a separate VACUUM/rewrite (pg_repack/dump). **Drain ≠ shrink.** (Listings already carries 15,345 dead tuples.)

**6. Surface impact.** Terminal-only. Public `/search`, Featured, listing detail, agent pages, open-houses, saved-search/alerts all **exclude terminal statuses** (active-status gate) → **no impact**. CRM lookup of an archived terminal would see `raw_data/compliance` null (typed columns + archive summary remain) → minor, terminals aren't edited. Seller/landlord workflows are active-listing → no impact. ⚠️ **Closed-comps / sold-price** (`db-to-public-dto.ts` reads `raw_data.ClosePrice`; `scripts/comps/by-property.ts` reads `raw_data`) DO use terminal `raw_data` — but only for recently-closed; the 180-day window is the safeguard (only >180d terminals get stripped). Confirm comps never need >180d-closed `raw_data` before any real drain.

**7. Restore / query.** `listings_archive` holds the **summary** (queryable; indexed by close_date / neighborhood / borough / agent) → good for past-sales display. The **full `raw_data` is NOT preserved** (nulled, only summary fields copied) → not restorable except via a Neon PITR/snapshot. So archived listings are queryable (summary) but the raw Trestle blob is gone.

**8. Compliance / retention.** NY DOS 6-year recordkeeping → the `listings_archive` summary is the retention record (route comment asserts it satisfies NY DOS). REBNY §2.05 (closed removed within 24h) is handled separately by step 3 (`idx_display_yn=false`). The strip targets >180d terminals (past display). **Verify** the archive summary fields meet NY DOS requirements before relying on the strip (compliance index §14 retention). Stripping is the only lossy step; the 180d window + summary are the safeguards.

**9. Stop condition.** Set `ARCHIVE_T180_BACKLOG_ENABLED` ≠ 'true' (revert to narrow predicate — also ~0). Built-in throttle = 500/run, daily. No auto-abort beyond per-row try/catch → `sync_errors`. There is **no "stop at N"**; it's incremental nightly (and at 500/run, draining a real backlog would take ~months).

**10. Before/after measurements (read-only).** archived count (now **34**), `listings_archive` rows (**34**), terminal strippable bytes (**383 MB**), DB size, `listings` TOAST + dead tuples (**15,345**), eligible-backlog count (**0**). Re-measure after each batch.

**11. Smoke after a dry run.** There is no built-in dry-run — the read-only eligibility count IS the dry-run (**= 0 today**). If ever enabled + a batch runs: confirm archived count rose, `listings_archive` rows match, **closed-comps/sold-price still render** for >180d sales, public surfaces unchanged (terminals already excluded), runtime logs clean.

**12. What enabling requires.** A **Vercel env-var change** (`ARCHIVE_T180_BACKLOG_ENABLED='true'`) — a HELD area — + a redeploy for it to take effect; the existing **daily cron** then applies it (no new cron, no migration, no manual SQL). The drain's SQL writes happen inside the cron.

**13. Risks + rollback.**
- 🔴 **~0 reclaim** (the flag is defeated by sync re-stamping terminal clocks) — enabling it is currently a no-op.
- 🟠 **Drain ≠ shrink** — strips create dead tuples; DB-on-disk won't drop until a separate gated reclaim (pg_repack/dump; never VACUUM FULL).
- 🟠 **Lossy/irreversible** `raw_data` strip beyond the summary → a pre-enable Neon snapshot is prudent.
- 🟠 **Comps dependency** on terminal `raw_data` (mitigated by 180d window — verify).
- 🟠 **Env-var change is HELD** (Maya approval).
- **Rollback:** disable the flag (stops further drain); already-stripped rows recover only via Neon PITR/snapshot.

**14. Go/no-go: 🔴 NO-GO.** Do **not** enable the flag — it reclaims ≈0 MB because terminal listings never age past 180d (sync keeps their timestamps fresh). The "~390 MB recoverable via the flag" premise from earlier audits does not hold against the live DB.

## Recommended path instead (separate, future, gated — NOT P2 execution)
1. **Fix the eligibility clock:** base archive eligibility on a clock idx-sync does NOT bump — e.g., `raw_data.CloseDate` / a true `terminal_since` captured only on the actual transition — so genuinely-old closed listings age + qualify. (Investigate WHY sync re-stamps `status_changed_at`/`modification_timestamp` on terminal re-emits.)
2. **Then** the archive drain can reach the 383 MB; pair it with a **reclaim** step (drain alone only makes bytes dead — reclaim shrinks disk).
3. Pre-enable Neon snapshot + before/after measurement + comps verification + the env-var enable, all Maya-gated.

## Hard limits honored
Flag NOT enabled; no SQL writes, no migration, no reclaim, no downgrade, no env change, no new branch, no reader swap, no PR-5B implementation. Read-only only.
