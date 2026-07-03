# S1 post-strip reclaim assessment (REPORT-ONLY)

> **REPORT ONLY — NO VACUUM, NO pg_repack, NO branch deletion, NO reclaim, NO downgrade, no
> Vercel/env change, no S2.** Read-only DB measurement (cold-waterfall, read-only txn, ROLLBACK) +
> neonctl size lookups. Date 2026-06-25 · #415.

## Headline: the strip emptied the DATA (compliance 202 MB → 541 kB) but storage has NOT shrunk yet — and it CAN'T until the two rollback branches are deleted + the PITR window elapses. Autovacuum has already done its part (dead space is reusable). 🔴 NO-GO on reclaim now (intentional: branches must be retained for rollback).

## 1. Current DB size (measured)
| Metric | Value |
|---|---|
| `pg_database_size` | **1,394 MB** (1,461,886,976 B) |
| `listings` total relation | **1,065 MB** |
| `listings` heap only | 307 MB |
| `listings` TOAST | **716 MB** |
| `listings` indexes | 43 MB |
| `n_live_tup` / `n_dead_tup` | 110,165 / **14,715** (**11.8%** dead) |
| last autovacuum / autoanalyze | **2026-06-25 00:48** / 01:07 |
| last manual vacuum / analyze | null / 2026-04-28 |
| autovacuum_count | 128 |
| `compliance` column logical size NOW | **541 kB** (110,062 empty `{}` rows · 7 authored nonempty) |
| Neon `main` logical_size (`br-crimson-frog`) | **1,485,414,400 B (~1,485 MB)** |

## 2. Compare vs pre-S1 baseline
- **compliance data: ~202 MB → 541 kB** ✅ (the strip worked at the data/logical level — ~201.5 MB of redundant Trestle-copy removed from live tuples; terminal ~165 MB + live ~37 MB).
- **Dead-tuple increase was TRANSIENT and already absorbed.** The strip created ~110K dead row-versions; `n_dead_tup` is now back to **14,715 (~11.8%)** — essentially the pre-strip baseline (the 2026-06-12 audit showed ~15,345 dead). Autovacuum + HOT pruning (`n_tup_hot_upd` 488,180) cleaned them for reuse.
- **Billed/physical size did NOT drop — it is ~flat/slightly up.** `main` logical_size **1,485 MB** vs the pre-S1 snapshot `br-mute-flower` **1,481 MB** → `main` is ~4 MB *larger* (new tuple versions + WAL), not 202 MB smaller. **Strip ≠ shrink, confirmed.**

## 3. Has autovacuum run since the strip?
**Yes** — `last_autovacuum = 2026-06-25 00:48` (after the Phase-1 resume) and `last_autoanalyze = 01:07` (after Phase-2 at 01:06). Dead tuples are already reclaimed *for reuse*. **A manual VACUUM/ANALYZE would add nothing** (space is already reusable; stats are current).

## 4. Has size changed at all yet?
**No meaningful reduction.** `pg_database_size` 1,394 MB and `main` logical 1,485 MB are not lower than pre-strip; TOAST is still 716 MB (it still physically holds the now-dead 202 MB of old compliance values, marked reusable but not returned to the file/billed size). The ~202 MB is realized only at the *logical-column* level (541 kB), not yet at *billed storage*.

## 5. What must happen before reclaim (and why it's blocked now)
The ~202 MB cannot leave Neon's billed/synthetic size until **all of**:
1. **Rollback branches deleted.** `br-mute-flower-adurq0o7` (pre-S1) and `br-holy-forest-adxoogq9` (post-Phase-1) **pin the pre-strip pages** (they reference the old data at their LSNs). While they exist, Neon must retain that history → the 202 MB stays billed. **This is the primary blocker — and it's intentional (the branches are our rollback).**
2. **PITR window elapse.** Even after branch deletion, `main`'s own pre-strip page versions are retained for the **Launch 7-day PITR window**; they age out (and GC) only after ~7 days.
3. **Autovacuum** — already done (dead space reusable); not the blocker.
4. **(Only if needed) physical compaction.** Once history GCs, Neon's synthetic size should fall toward the live-data size. If the physical TOAST file remains bloated and billing reflects it, an **online `pg_repack`** compacts it. **NEVER `VACUUM FULL`** on production (it takes an ACCESS EXCLUSIVE lock → blocks all traffic; on Neon especially harmful).

## 6. Safe reclaim options (in recommended order)
1. **Wait + observe (recommended first).** Autovacuum has reclaimed for reuse; no action needed now. Hold the rollback branches through a confidence window; future row growth refills the freed space before the DB grows on disk.
2. **Manual VACUUM/ANALYZE — NOT recommended / no benefit.** Autovacuum already ran; a plain VACUUM won't shrink the file, ANALYZE stats are current. (Never VACUUM FULL.)
3. **The real reclaim sequence (gated, multi-day):** confidence window → **delete both rollback branches** (gated) → wait PITR (7 d) + autovacuum → **measure Neon billed/synthetic size** → expect a drop toward live size (~−200 MB).
4. **`pg_repack` (gated, only if step 3 leaves the physical file bloated and billing reflects it):** online heap/TOAST compaction, no long exclusive lock. Requires the extension; verify availability on Neon first.
5. **dump/restore — only if absolutely necessary** (e.g., pg_repack unavailable and synthetic size still won't drop): logical dump → restore into a fresh branch/project, swap. Heavy, last resort.

## 7. Risk table
| Action | Locks | Disk spike | Runtime | Neon constraint | Rollback implication |
|---|---|---|---|---|---|
| Wait + observe | none | none | n/a | none | branches stay → full rollback available |
| Manual VACUUM (non-FULL) | SHARE UPDATE EXCL (light) | none | minutes | no file shrink | none; but pointless (autovacuum done) |
| **VACUUM FULL — FORBIDDEN** | **ACCESS EXCLUSIVE (blocks all)** | rewrites whole table | long | **outage on Neon** | n/a — do not use |
| Delete rollback branches | none | none | seconds | unpins pre-strip pages → enables GC | **REMOVES rollback** — only after confidence |
| PITR elapse (passive) | none | none | ~7 days | history GCs | rollback window narrows then closes |
| pg_repack | brief locks at swap | needs ~table-size free space transiently | 10s of min | extension must be available | none (online) |
| dump/restore | n/a (new target) | full copy | hours | manual cutover | new copy = implicit backup |

## 8. Rollback branches — disposition
| Branch | id | Captures | Keep until |
|---|---|---|---|
| `pre-s1-compliance-terminal-strip-2026-06-24` | `br-mute-flower-adurq0o7` | full pre-S1 (terminal+live compliance intact) | confidence in BOTH phases |
| `pre-s1-compliance-live-strip-2026-06-25` | `br-holy-forest-adxoogq9` | post-Phase-1 (terminal stripped, live intact) | confidence in Phase-2 |
- **Keep BOTH for now** (the hold requires it; they are the rollback).
- **Safe to delete when:** a stable confidence window passes (recommend **≥7 days** of normal production post-strip) with: render/API/CRM/syndication/display-gate all green, no compliance-related runtime errors, and **explicit Maya approval**. (Optionally delete `br-holy-forest` first once Phase-2 confidence is high, keeping `br-mute-flower` as the longer-tail full rollback.)
- **Proof needed before deletion:** repeat the post-strip smoke (detail render, `/api/listings` no leak, gate, authored rows) clean over the window + no incident.
- **Note:** deleting them is the PREREQUISITE for any billed reclaim (they pin the old pages). So reclaim and branch-retention are in direct tension — reclaim waits on rollback confidence.

## 9. Go/no-go
🔴 **NO-GO on running any reclaim now** — report-only, and (correctly) blocked by the retained rollback branches. **No action is needed today**: autovacuum has already made the dead space reusable; nothing will shrink billed size until the branches are deleted + PITR elapses. **Recommended:** hold a confidence window, then (separately gated) delete the rollback branches → let PITR elapse → measure Neon billed size → `pg_repack` only if still bloated → never `VACUUM FULL`. The ~202 MB reduction is real at the data level and will convert to billed savings only through that gated sequence.

## Hard limits honored
Report only. No VACUUM, no pg_repack, no branch deletion, no reclaim, no downgrade, no Vercel/env change, no S2/raw_data.
