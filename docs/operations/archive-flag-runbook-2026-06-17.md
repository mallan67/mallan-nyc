# Controlled archive-flag runbook & measurement packet

**Flag:** `ARCHIVE_T180_BACKLOG_ENABLED` · **Archiver:** `app/api/cron/data-retention/route.ts` (T+180) · **Monitor:** `scripts/ops-health.js` + `scripts/archive-backlog-predicate.js` · **Authored:** 2026-06-17 · **Updated 2026-06-25 (Archive Clock PR-2, #415):** the flag-ON predicate now ages off the stable `terminal_since` clock — see the §0.5 clock-change notice.

---

> # ⛔ TOP WARNING — this flag is a STOP / KILL-SWITCH, not an UNDO
> **Already-archived rows are NOT restored by turning the flag off.** Each archived row has had
> `raw_data`, `media`, and `compliance` emptied and `sync_status` set to `"archived"` (only a
> summary survives in `listings_archive`). Turning `ARCHIVE_T180_BACKLOG_ENABLED` off stops the
> archiver from selecting *new* rows; it does **not** reverse rows already archived.

---

## 0.5 ⚠️ CLOCK CHANGE — `ARCHIVE_T180_BACKLOG_ENABLED=true` now means `terminal_since < cutoff`

**As of Archive Clock PR-2 (#415), the flag-ON archive predicate changed.** This supersedes the old
"widened" `COALESCE(status_changed_at, modification_timestamp)` behavior described in earlier
versions of this runbook.

| flag state | T+180 archive eligibility predicate |
|---|---|
| **OFF (default)** | `status IN (TERMINAL) AND sync_status != 'archived' AND status_changed_at < cutoff` — UNCHANGED legacy narrow predicate. |
| **ON** | `status IN (TERMINAL) AND sync_status != 'archived' AND `**`terminal_since < cutoff`** — the stable clock (set once on the non-terminal→terminal transition, never re-stamped by idx-sync). |

Why: `status_changed_at` and `modification_timestamp` are both re-stamped by idx-sync on every
re-emit (price/photo/modification tick), so a terminal row looked perpetually "recent" and never
aged. `terminal_since` (Archive Clock PR-1, #446) is the correct, stable archive clock.

**Two consequences operators MUST internalize:**
1. **NULL `terminal_since` fails safe.** A row whose `terminal_since IS NULL` (no derivable stable
   date, or the Gate-3 backfill has not run) fails `terminal_since < cutoff` (NULL `< ts` is NULL)
   and is **NEVER auto-archived**. We do **not** invent terminal dates for NULL-clock rows.
2. **Flipping the flag before the backfill drains NOTHING.** Until the Gate-3 backfill populates
   `terminal_since`, the flag-ON predicate matches **0 rows** — verified pre-backfill state:
   `terminal_since` set on 0/110,114 rows. Do not interpret a 0 drain as "nothing to archive" — it
   means the clock is not populated yet.

> The old `widened_delta = N_on − N_off` formula no longer applies. Under PR-2 the flag-ON population
> is `terminal_since < cutoff` directly, not a widened delta over the narrow set. See §3.

---

## Do not execute from this doc

**This document is a measurement runbook only.** It exists so the counts, the drain estimate, and the
one-way semantics are recorded *before* any decision. Reading or following the measurement commands
below does **not** authorize enabling the flag, running the backfill, or running the archive.
Specifically, until Maya approves each gate (see §1.5) after seeing the measured numbers:

- **Do NOT** set `ARCHIVE_T180_BACKLOG_ENABLED=true` in Vercel Production.
- **Do NOT** run the `terminal_since` backfill with `--execute` (Gate 3 — separately approved).
- **Do NOT** trigger the data-retention cron manually.
- **Do NOT** change the 500/run cap (`T180_BATCH_CAP`), cron schedules, Neon, Vercel, or R2.

The only actions this doc sanctions are the **read-only `count()` measurements** in §2. Enabling
the flag and running the backfill are separate, explicit, Maya-gated decisions taken **after**
reviewing the measured counts.

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
rather than assume. (The read-only counts in §2 do not depend on Vercel at all — they run locally —
so they are safe to run regardless; this active-deployment check is about the production cron's
behavior, not the measurement.)

## 1. What the archiver does per row (one-way)

For each eligible terminal row, in a single atomic `$transaction`:

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

## 1.5 Staged gate sequence (each step separately Maya-approved)

The `terminal_since` archive rollout is a multi-gate sequence. **Do not skip or reorder.**

| Gate | Action | Drains rows? | Approval |
|---|---|---|---|
| **1** | **PR-2 predicate repoint** behind the default-OFF flag (this change). Flag-OFF stays legacy; flag-ON = `terminal_since < cutoff`. | No — merging drains nothing | merged |
| **2** | **Dry-run proof** — read-only counts (§2) showing flag-ON eligible = 0 pre-backfill + the NULL-clock backlog size. | No | measurement only |
| **3** | **Backfill `terminal_since`** on the existing terminal backlog (`scripts/backfill-terminal-since.ts --execute`). Populates the clock column ONLY — **archives nothing**. | No (clock only) | **separate explicit approval** |
| **4** | **Archive dry-run proof** — re-measure flag-ON `terminal_since < cutoff` count *after* backfill = the true drain population; compute `nights_to_drain`. | No | measurement only |
| **5** | **Flag flip / archive drain** — set `ARCHIVE_T180_BACKLOG_ENABLED=true` + redeploy; nightly cron drains in 500/run batches. | **YES — the actual archive** | **separate explicit approval, monitored** |

> **No operator may flip the flag (Gate 5) before the backfill (Gate 3) and the dry-run proofs
> (Gates 2 & 4) are complete and approved.** Flipping early drains nothing (NULL clock) but
> misrepresents readiness.

## 2. The read-only counts

`scripts/ops-health.js` performs a read-only `prisma.listing.count()` — it never archives, never
enables the flag, never writes env/Neon/Vercel/R2. Use the repo-supported `ops:health:json` entry
point so `.env.local` / `.env` are loaded automatically for `DATABASE_URL`. **Keep the `--silent`
flag on every redirected capture** — it suppresses npm's lifecycle banner, which would otherwise
prepend non-JSON lines to the output file and make it unparseable (Codex #408). The explicit Node
form below has no banner and is equally clean for capture.

```bash
# A) flag-OFF count — legacy narrow predicate (status_changed_at < cutoff) = today's nightly set.
#    Leading ARCHIVE_T180_BACKLOG_ENABLED=false FORCES OFF regardless of any ambient/env-file value.
ARCHIVE_T180_BACKLOG_ENABLED=false npm run --silent ops:health:json > ops-health-flagoff.json
#    record: retention.archive_backlog   (predicate must read "narrow ...")

# B) flag-ON count — stable-clock predicate (terminal_since < cutoff). Local shell env ONLY;
#    does NOT touch Vercel/cron/production. PRE-backfill this is expected to be 0 (NULL clock).
ARCHIVE_T180_BACKLOG_ENABLED=true npm run --silent ops:health:json > ops-health-stableclock.json
#    record: retention.archive_backlog   (predicate must read "stable-clock ...")
```

Equivalent explicit Node form (`--env-file-if-exists` requires **Node ≥ 20.19.0**; see the version
note for a fallback on older 20.x):

```bash
# A) flag-OFF (legacy narrow); flag FORCED off
ARCHIVE_T180_BACKLOG_ENABLED=false node --env-file-if-exists=.env.local --env-file-if-exists=.env scripts/ops-health.js --json > ops-health-flagoff.json

# B) flag-ON (stable-clock); flag FORCED on (local only)
ARCHIVE_T180_BACKLOG_ENABLED=true node --env-file-if-exists=.env.local --env-file-if-exists=.env scripts/ops-health.js --json > ops-health-stableclock.json
```

PowerShell — force the flag explicitly in **both** runs, and clean up after:

```powershell
# A) flag-OFF (legacy narrow) — force false so ambient $env: state can't change run A
$env:ARCHIVE_T180_BACKLOG_ENABLED='false'; npm run --silent ops:health:json > ops-health-flagoff.json
# B) flag-ON (stable-clock) — force true (local only), then unset
$env:ARCHIVE_T180_BACKLOG_ENABLED='true';  npm run --silent ops:health:json > ops-health-stableclock.json
Remove-Item Env:\ARCHIVE_T180_BACKLOG_ENABLED
```

> **Every command forces its flag state** (`=false` for the legacy narrow set, `=true` for the
> stable-clock set) so neither run depends on what is already exported in your shell or env file. The
> `archive_backlog_predicate` field in each JSON is the ground-truth check — confirm it reads
> "narrow…" for A and "stable-clock…" for B. The inline/local env var changes only that one
> read-only process's count predicate; it does **not** enable the production cron and archives
> nothing. Never set this variable in Vercel to "measure."

> **Node ≥ 20.19.0 required for both forms above.** `--env-file-if-exists` was *Added in Node
> v20.19.0*. On Node 20.0–20.18 — still valid under `engines: { node: "20.x" }` — use this
> version-agnostic fallback (export the vars into the shell, then run the script directly):
>
> ```bash
> # flag-OFF (legacy narrow) — export DATABASE_URL from your .env.local first
> export DATABASE_URL='postgresql://…cold-waterfall…'   # the canonical production URL
> ARCHIVE_T180_BACKLOG_ENABLED=false node scripts/ops-health.js --json > ops-health-flagoff.json
>
> # flag-ON (stable-clock)
> ARCHIVE_T180_BACKLOG_ENABLED=true node scripts/ops-health.js --json > ops-health-stableclock.json
> ```
>
> (ops-health reads `process.env.DATABASE_URL` directly, so once it is exported no env-file loading is
> needed — this works on any Node 20.x.)

### Fields to record (from each JSON `retention` object)
- `archive_backlog` — the count.
- `archive_backlog_predicate` — must read **"narrow…"** for run A, **"stable-clock…"** for run B
  (proves which predicate ran).
- `listings_terminal_missing_terminal_since` — **the NULL-clock backlog**: terminal, not archived,
  `terminal_since IS NULL`. This is the population the Gate-3 backfill must populate before any drain;
  while the flag is OFF it is informational only (ops-health does **not** warn on it until the flag is
  ON — Codex #448-A). PRE-backfill this is large (≈ the whole terminal backlog) and run B's
  `archive_backlog` is ≈ 0; POST-backfill this shrinks and run B's `archive_backlog` becomes the real
  drain population.
- `listings_missing_status_changed` — legacy broad diagnostic (NULL `status_changed_at`, any status),
  retained one release for comparison. **NOT** the archive population under PR-2.
- `listings_archived_total` — already archived (baseline).
- Stamp each run: UTC **and** Eastern time.

Let **`N_off`** = flag-OFF count (run A, legacy narrow), **`N_on`** = flag-ON count (run B,
`terminal_since < cutoff`).

## 3. Formulas

```
# Under PR-2 the flag-ON population IS the stable-clock set directly (no widened delta).
archive_population = N_on                 # terminal_since < cutoff (0 until the Gate-3 backfill runs)
nights_to_drain    = ceil(N_on / 500)     # full backlog at the 500/run cap, one run per night
```

**Pre-backfill (Gate 2):** expect `N_on ≈ 0` (NULL clock fails safe). The real `N_on` is only
meaningful **after** the Gate-3 backfill, measured again at Gate 4.

**Illustrative only — measure first.** If after backfill `N_on ≈ 90,000`, then
`nights_to_drain ≈ 180` (~6 months). A months-long tail is likely; that is a cadence decision.
Raising the 500 cap is a **separate, gated** change — not part of this runbook.

## 4. Verify-after-each-run checklist (because it is one-way)

After each nightly run while the flag is ON, run the same **stable-clock** read-only ops-health
command from §2 (run B) and confirm `retention.archive_backlog_predicate` contains **"stable-clock"**
before comparing movement. A local ops-health run defaults to the local shell environment; if the
operator forgets the local `ARCHIVE_T180_BACKLOG_ENABLED=true`, it reports the narrow backlog even
while production is draining stable-clock rows.

1. `archive_backlog` from the stable-clock check dropped by up to ~500 (the run made progress).
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
  deployments — the currently-running `/api/cron/data-retention` function keeps its deploy-time env
  snapshot, so editing Settings alone does **not** stop the next nightly batch; the cron would
  archive another 500-row batch on the old (true) value. **Verify the now-active Production deployment
  post-dates the env change (state READY)** before trusting the stop. Only after that redeploy is the
  narrow predicate guaranteed for the next run.
- **Rollback means stop future selection, not undo prior archive-strip actions.** Rows already
  archived are not restored by the flag — each has `raw_data/media/compliance` emptied and
  `sync_status='archived'`; only the summary survives in `listings_archive`. Reversing a specific row
  would require a manual un-archive **plus** a Trestle re-fetch (not guaranteed for terminal listings;
  out of scope for this runbook).
- **Therefore:** treat each night as a committed checkpoint. The flag protects **future** rows, not
  past ones.

## 6. ⛔ Gate

**Do not enable `ARCHIVE_T180_BACKLOG_ENABLED` (Gate 5) until Maya approves, after:**
1. the Gate-3 `terminal_since` backfill has run and is verified, AND
2. the Gate-4 archive dry-run proof (`N_on` measured **post-backfill**, plus `nights_to_drain`) has
   been reviewed.

Enabling before the backfill drains nothing (NULL clock fails safe) and misrepresents readiness.

When enabling is eventually approved, the same Vercel rule applies in reverse: setting the var to
`true` in Production Settings takes effect **only after a Production redeploy** — verify the active
deployment post-dates the change before counting on the stable-clock drain. (Enabling, like
disabling, is env-change **plus** redeploy.)

---

*Documentation only. No code, no env, no backfill `--execute`, no archive run, no Neon/Vercel/R2
change, no cap change, no cron schedule change. No execution is authorized by this document.*
