# Controlled archive-flag runbook & measurement packet

**Flag:** `ARCHIVE_T180_BACKLOG_ENABLED` · **Archiver:** `app/api/cron/data-retention/route.ts` (T+180) · **Monitor:** `scripts/ops-health.js` + `scripts/archive-backlog-predicate.js` (PR #407) · **Authored:** 2026-06-17

---

> # ⛔ TOP WARNING — this flag is a STOP / KILL-SWITCH, not an UNDO
> **Already-archived rows are NOT restored by turning the flag off.** Each archived row has had
> `raw_data`, `media`, and `compliance` emptied and `sync_status` set to `"archived"` (only a
> summary survives in `listings_archive`). Turning `ARCHIVE_T180_BACKLOG_ENABLED` off stops the
> archiver from selecting *new* rows; it does **not** reverse rows already archived.

---

## Do not execute from this doc

**This document is a measurement runbook only.** It exists so the counts, the drain estimate, and the
one-way semantics are recorded *before* any decision. Reading or following the measurement commands
below does **not** authorize enabling the flag or running the archive. Specifically, until Maya
approves after seeing the measured numbers:

- **Do NOT** set `ARCHIVE_T180_BACKLOG_ENABLED=true` in Vercel Production.
- **Do NOT** trigger the data-retention cron manually.
- **Do NOT** change the 500/run cap (`T180_BATCH_CAP`), cron schedules, Neon, Vercel, or R2.

The only actions this doc sanctions are the **two read-only `count()` measurements** in §2. Enabling
the flag is a separate, explicit, Maya-gated decision taken **after** reviewing the measured counts.

---

## 0. Pre-check — operator-only Vercel env confirmation (do this BEFORE measuring)

> **Confirm Production Vercel env does NOT have `ARCHIVE_T180_BACKLOG_ENABLED=true` before measuring.**

Vercel → project `mallan-nyc` → Settings → Environment Variables → confirm `ARCHIVE_T180_BACKLOG_ENABLED`
is **absent** or **≠ `true`** in the **Production** environment. (It is not a GitHub Actions
variable/secret; the archiver code is default-OFF and treats anything other than the literal string
`"true"` as OFF.) This guarantees the production cron is on the narrow predicate while you measure.

## 1. What the archiver does per row (one-way)

For each eligible terminal row, in a single atomic `$transaction` (`route.ts:237-277`):

1. `listingsArchive.upsert(...)` — writes the **summary** (close price/date, original list price,
   address line, agent/office, beds/baths, etc.) to `listings_archive` **first** (`update:{}` =
   idempotent on re-run).
2. `listing.update(...)` — sets on the live row:
   - `sync_status: "archived"`
   - `raw_data: Prisma.JsonNull`
   - `media: []`
   - `compliance: {}`

`media` and `compliance` blobs are **not** copied to the archive table — they are gone from the live
row after the strip. `raw_data`'s close terms survive only as the extracted summary columns. This is
the intended storage reclaim, and it is **forward-only per row**.

## 2. The two read-only counts

`scripts/ops-health.js` performs a read-only `prisma.listing.count()` — it never archives, never
enables the flag, never writes env/Neon/Vercel/R2.

```bash
# A) NARROW count — flag OFF (the set the production cron drains today)
node scripts/ops-health.js --json > ops-health-narrow.json
#    record: retention.archive_backlog   (predicate must read "narrow ...")

# B) SIMULATED WIDENED count — local shell env ONLY (does NOT touch Vercel/cron/production)
ARCHIVE_T180_BACKLOG_ENABLED=true node scripts/ops-health.js --json > ops-health-widened.json
#    record: retention.archive_backlog   (predicate must read "widened ...")
```

PowerShell variant for (B) — set, run, immediately unset:

```powershell
$env:ARCHIVE_T180_BACKLOG_ENABLED='true'; node scripts/ops-health.js --json > ops-health-widened.json; Remove-Item Env:\ARCHIVE_T180_BACKLOG_ENABLED
```

> The inline/local env var changes only that one read-only process's count predicate. It does **not**
> enable the production cron and archives nothing. Never set this variable in Vercel to "measure."

### Fields to record (from each JSON `retention` object)
- `archive_backlog` — the count
- `archive_backlog_predicate` — must read **"narrow…"** for run A, **"widened…"** for run B (proves which ran)
- `listings_missing_status_changed` — the NULL-dated population the widening newly reaches
- `listings_archived_total` — already archived (baseline)
- Stamp each run: UTC **and** Eastern time.

Let **`N_off`** = narrow count (run A), **`N_on`** = widened count (run B).

## 3. Formulas

```
widened_delta   = N_on - N_off          # NULL-status_changed_at terminal rows the flag newly unlocks
nights_to_drain = ceil(N_on / 500)      # full widened backlog at the 500/run cap, one run per night
```

(For just the newly-unlocked rows: `ceil(widened_delta / 500)`.)

**Illustrative only — measure first.** Per the #405 trace (34 of ~91,536 terminal rows ever
archived), if `N_on ≈ 91,500` then `nights_to_drain ≈ 183` (~6 months). A months-long tail is likely;
that is a cadence decision. Raising the 500 cap is a **separate, gated** change — not part of this
runbook.

## 4. Verify-after-each-run checklist (because it is one-way)

After each nightly run while the flag is ON:

1. `archive_backlog` dropped by up to ~500 (the run made progress).
2. `listings_archived_total` rose by the same amount (rows landed in `listings_archive`).
3. No new `syncError` rows with resource `listings_archive_move` (no archive failures).
4. `/api/health` → 200; public listings still render; archived terminal rows correctly **not** displayed.
5. `rebny_sec_2_05_violations` not worse (no displayable row wrongly archived).
6. Spot-check sample archived `listing_key`s: present in `listings_archive` with close terms; the live
   row has `sync_status='archived'` and is not publicly served.
7. Storage trend moving down as expected (ops-health storage section).

**Any failed check → STOP (flag OFF) before the next night.**

## 5. Rollback / stop procedure

- **STOP (kill-switch):** set `ARCHIVE_T180_BACKLOG_ENABLED=false` (or remove it) in Vercel
  Production. The next nightly run reverts to the narrow predicate; no new NULL-dated rows are selected.
- **Rollback means stop future selection, not undo prior archive-strip actions.** Rows already
  archived are not restored by the flag — each has `raw_data/media/compliance` emptied and
  `sync_status='archived'`; only the summary survives in `listings_archive`. Reversing a specific row
  would require a manual un-archive **plus** a Trestle re-fetch (not guaranteed for terminal listings;
  out of scope for this runbook).
- **Therefore:** treat each night as a committed checkpoint. The flag protects **future** rows, not
  past ones.

## 6. ⛔ Gate

**Do not enable `ARCHIVE_T180_BACKLOG_ENABLED` until Maya approves, after reviewing the measured
`N_off`, `N_on`, `widened_delta`, and `nights_to_drain`.**

---

*Documentation only. No code, no env, no archive run, no Neon/Vercel/R2 change, no cap change, no cron
schedule change. No execution is authorized by this document.*
