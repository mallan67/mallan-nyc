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
`"true"` as OFF.) Vercel env vars are snapshotted per deployment, so the cron's *actual* behavior is
governed by the **active Production deployment's** env, **not** the Settings value. **Do not assume —
verify the active deployment:** confirm the current Production deployment was created while the flag
was not `true` (its build post-dates any change back to false/absent). **If the flag was ever set
`true` and you cannot confirm a later redeploy-to-OFF, trigger a fresh Production redeploy and confirm
it is READY before measuring or trusting the narrow predicate** — otherwise the active deployment may
still be archiving on a stale `true` (the exact case §5 guards). On first-time use, before the flag
was ever enabled in this project, the active deployment is OFF by construction — but still confirm
rather than assume. (The two read-only counts in §2 do not depend on Vercel at all — they run
locally — so they are safe to run regardless; this active-deployment check is about the production
cron's behavior, not the measurement.)

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
enables the flag, never writes env/Neon/Vercel/R2. Use the repo-supported `ops:health:json` entry
point so `.env.local` / `.env` are loaded automatically for `DATABASE_URL`. **Keep the `--silent`
flag on every redirected capture** — it suppresses npm's lifecycle banner (`> mallan-nyc@… ops:health:json`),
which would otherwise prepend non-JSON lines to the output file and make it unparseable (Codex #408).
The explicit Node form below has no banner and is equally clean for capture.

```bash
# A) NARROW count — flag OFF (the set the production cron drains today)
npm run --silent ops:health:json > ops-health-narrow.json
#    record: retention.archive_backlog   (predicate must read "narrow ...")

# B) SIMULATED WIDENED count — local shell env ONLY (does NOT touch Vercel/cron/production)
ARCHIVE_T180_BACKLOG_ENABLED=true npm run --silent ops:health:json > ops-health-widened.json
#    record: retention.archive_backlog   (predicate must read "widened ...")
```

Equivalent explicit Node form, if an operator needs to avoid the npm wrapper:

```bash
# A) NARROW count — env files loaded explicitly
node --env-file-if-exists=.env.local --env-file-if-exists=.env scripts/ops-health.js --json > ops-health-narrow.json

# B) SIMULATED WIDENED count — env files loaded explicitly, local shell flag only
ARCHIVE_T180_BACKLOG_ENABLED=true node --env-file-if-exists=.env.local --env-file-if-exists=.env scripts/ops-health.js --json > ops-health-widened.json
```

PowerShell variant for (B) — set, run through the env-loading npm entry point, immediately unset:

```powershell
$env:ARCHIVE_T180_BACKLOG_ENABLED='true'; npm run --silent ops:health:json > ops-health-widened.json; Remove-Item Env:\ARCHIVE_T180_BACKLOG_ENABLED
```

> The inline/local env var changes only that one read-only process's count predicate. It does **not**
> enable the production cron and archives nothing. Never set this variable in Vercel to "measure."

### Fields to record (from each JSON `retention` object)
- `archive_backlog` — the count
- `archive_backlog_predicate` — must read **"narrow…"** for run A, **"widened…"** for run B (proves which ran)
- `listings_missing_status_changed` — **broad diagnostic only, NOT the unlocked population.** ops-health computes this as an *unfiltered* `count({ where: { status_changed_at: null } })` (`ops-health.js:211-214`) — every listing with a NULL `status_changed_at`, regardless of status, `sync_status`, or age. It **overstates** what the flag newly archives, because the widened predicate also requires terminal status, `sync_status != 'archived'`, and `modification_timestamp < cutoff`. For the true newly-unlocked archive population, use **`widened_delta = N_on − N_off`** (§3), not this field.
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

After each nightly run while the flag is ON, run the same **simulated widened** read-only ops-health
command from §2 and confirm `retention.archive_backlog_predicate` contains **"widened"** before
comparing movement. A local ops-health run defaults to the local shell environment; if the operator
forgets the local `ARCHIVE_T180_BACKLOG_ENABLED=true`, it will report the narrow backlog even while
production is draining widened rows.

1. `archive_backlog` from the widened check dropped by up to ~500 (the run made progress).
2. `listings_archived_total` rose by the same amount (rows landed in `listings_archive`).
3. No new `syncError` rows with resource `listings_archive_move` (no archive failures).
4. `/api/health` → 200; public listings still render; archived terminal rows correctly **not** displayed.
5. `rebny_sec_2_05_violations` not worse (no displayable row wrongly archived).
6. Spot-check sample archived `listing_key`s: present in `listings_archive` with close terms; the live
   row has `sync_status='archived'` and is not publicly served.
7. Storage trend moving down as expected (ops-health storage section).

**Any failed check → STOP (flag OFF) before the next night.**

## 5. Rollback / stop procedure

- **STOP (kill-switch) — env change ALONE is not enough; you must REDEPLOY:** set
  `ARCHIVE_T180_BACKLOG_ENABLED=false` (or remove it) in Vercel Production **and then trigger a fresh
  Production redeploy** (a *new* deployment that picks up the changed env — do NOT just promote an
  older deployment, which keeps its own env snapshot). Vercel applies env-var changes only to *new*
  deployments — the
  currently-running `/api/cron/data-retention` function keeps its deploy-time env snapshot, so
  editing Settings alone does **not** stop the next nightly batch; the cron would archive another
  500-row batch on the old (true) value. **Verify the now-active Production deployment post-dates the
  env change (state READY)** before trusting the stop. Only after that redeploy is the narrow
  predicate guaranteed for the next run.
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

When enabling is eventually approved, the same Vercel rule applies in reverse: setting the var to
`true` in Production Settings takes effect **only after a Production redeploy** — verify the active
deployment post-dates the change before counting on the widened drain. (Enabling, like disabling,
is env-change **plus** redeploy.)

---

*Documentation only. No code, no env, no archive run, no Neon/Vercel/R2 change, no cap change, no cron
schedule change. No execution is authorized by this document.*