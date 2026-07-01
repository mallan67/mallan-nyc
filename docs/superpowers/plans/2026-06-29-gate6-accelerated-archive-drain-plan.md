# Gate 6 — Accelerated archive-drain plan (RESEARCH / PLANNING ONLY)

> **Status: RESEARCH + PLAN. No drain executed. No cron re-armed. No env/Vercel/Neon/schema/DB change. No code written yet.**
> Canonical board: **GitHub issue #415**. Predecessor: Gate 5 3-night 500/run trial — verified clean (Night 1 +500, Night 2 +500, Night 3 +499), `listings_archive` now **2,033**, flag **OFF/removed** from Production. Date: 2026-06-29.
>
> This document evaluates a faster-but-safe path to clear the remaining **≈80,707** archive-eligible terminal backlog in **days, not months**, via a **controlled operator script** rather than a higher scheduled-cron cap.

---

## 0. Goal & non-goals

- **Goal:** drain ≈80,707 eligible terminal rows in roughly **1–3 days / ~5 controlled runs**, with the same correctness Gate 5 proved, and with **zero** "surprise Night 4/5" automatic runs and **zero** unlimited-drain risk.
- **Non-goals (this doc):** no execution, no reclaim, no downgrade, no predicate change, no media/search work, no PR-5B. Reclaim and downgrade remain **separate later gates**.

---

## 1. Current code audit — where the cap and archive logic live

**The archive cap is defined in exactly one place** and referenced/asserted elsewhere:

| Location | Role | Exact reference |
|---|---|---|
| `app/api/cron/data-retention/route.ts:21` | **Authoritative cap** `const T180_BATCH_CAP = 500` | applied at `:215` `take: T180_BATCH_CAP` |
| `app/api/cron/data-retention/route.ts:17` | `export const maxDuration = 60` — **Vercel function ceiling** (the hard limit that makes the cron route unsuitable for big batches) | — |
| `app/api/cron/data-retention/route.ts:157-293` | **Archive core** (step 3c): eligibility `findMany` (`:185-216`) + per-row `$transaction([listingsArchive.upsert, listing.update])` strip (`:238-278`) + `sync_errors` on failure (`:282-290`) | flag read at `:180` |
| `app/api/cron/data-retention/route.ts:20` | `const T30_BATCH_CAP = 1000` (T+30 media-null stage — separate, not the archive cap) | `:146` |
| `scripts/archive-backlog-predicate.js` | **Monitoring mirror** of the eligibility predicate (`buildArchiveBacklogWhere`, terminal set, 180d cutoff) — read-only, used by ops:health | `ARCHIVE_TERMINAL_STATUSES`, `ARCHIVE_CUTOFF_DAYS=180` |
| `tests/runtime/data-retention-archive-eligibility.test.ts:19,35` | Asserts the archive query is the one with `take === 500 (T180_BATCH_CAP)` | hard-codes 500 |
| `tests/runtime/ops-health-archive-backlog.test.ts` | Reconciles `archive-backlog-predicate.js` terminal set against the route (drift guard) | — |
| `tests/runtime/archive-terminal-since-clock.test.ts` | Flag-ON ages off `terminal_since`; NULL fails safe | — |
| `scripts/ops-health.js` | Reports `T+180d archive backlog` + `Archived total` using the predicate module | — |
| `docs/operations/gate5-archive-drain-execute-runbook-2026-06-26.md:49` | "up to `T180_BATCH_CAP = 500` rows/run … one run/night" | doc |
| `docs/operations/archive-flag-runbook-2026-06-17.md:67` | "**Do NOT** change the 500/run cap (`T180_BATCH_CAP`)…" | doc |
| `docs/audits/corrections/{scope-archive-eligibility-bug-2026-06-15, archive-eligibility-fix-2026-06-16}.md` | "Preserve the existing batch cap (`T180_BATCH_CAP = 500`)" | doc |
| `docs/superpowers/plans/2026-06-25-archive-clock-pr2-repoint-plan.md:43`, `…2026-06-24-archive-eligibility-clock-fix-PR-plan.md:106` | "Keep `T180_BATCH_CAP = 500`" | doc |

**Hard-coded assumptions that the cap is 500:** the two runtime tests (`data-retention-archive-eligibility.test.ts`) and the runbook/audit/plan prose above. Any change to the cap that those tests read must update those tests in the same PR, and the runbooks/predicate-reconciliation must stay consistent. **The eligibility predicate itself (terminal set, `sync_status != 'archived'`, `terminal_since < now−180d`) is NOT changing** — only throughput.

**Eligibility predicate (unchanged, mirrored in 3 places):** `status IN (Closed, Sold, Leased, Rented, Withdrawn, Expired, Cancelled)` ∧ `sync_status != 'archived'` ∧ (flag ON) `terminal_since < now()−180d`. `terminal_since` is set once on the terminal transition and never re-stamped by idx-sync (the Gate 1–3 fix), so the population is stable and ages predictably.

**Per-row strip (unchanged):** upsert a typed **summary** into `listings_archive` (close price/date, list/original price, beds/baths, address_line, agent/office, DOM) + update the live row to `sync_status='archived'`, `raw_data=JsonNull` (JSON `null`, not SQL NULL — confirmed Night 3), `media=[]`, `compliance={}`. Row is **kept** for FK integrity. Idempotent: `upsert({ update: {} })` + `sync_status != 'archived'` filter make re-runs safe (this is why Night 3 showed cron-reported 500 vs materialized +499 — a pre-existing `listing_key` no-ops, benign, safe direction).

---

## 2. Execution model comparison + recommendation

| Model | Throughput ceiling | Surprise-run risk | Unlimited-drain risk | Dry-run / touched-id log | Env/Vercel change | Verdict |
|---|---|---|---|---|---|---|
| **A. Scheduled cron, higher cap** | Capped by `maxDuration=60s` (~500–1,000/run realistically); 1 run/night | **HIGH** — auto Night 4/5 surprise runs until disarmed | **HIGH** — a too-high cap left armed drains nightly unattended | none | requires env cap + redeploy | ❌ **Reject** (you explicitly ruled this out) |
| **B. Manual cron trigger, higher cap** | Still capped by `maxDuration=60s` per invocation → can't do 5k–20k in one call reliably | Low (manual) but cron stays armed if env cap raised | Medium — relies on flag being OFF between triggers | none (public route) | requires env cap + redeploy + flag flip | ❌ **Reject** (60s ceiling defeats the goal; needs env changes) |
| **C. Controlled operator script reusing the archive core** | **No 60s ceiling** — runs locally/CI with long `statement_timeout`; chunked; bounded by an explicit `--max-rows` + hard safety ceiling | **None** — runs only when an operator invokes it; no schedule | **Low** — dry-run default, `--execute` required, hard ceiling caps a typo | **yes** (mirror `backfill-terminal-since.ts`) | **none** — no env/Vercel/cron change | ✅ **RECOMMEND** |
| **D. Queue / workflow (durable jobs)** | High | None | Low | custom | new infra | ❌ **Reject for now** — over-engineered for a one-time ~80k backlog; adds infra + failure surface |

### Recommendation: **C — controlled operator script.**
Rationale: it's the only model that simultaneously (a) escapes the 60s Vercel function ceiling that caps A/B, (b) requires **no Vercel/env change** (the flag stays OFF/removed, cron stays disarmed), (c) defaults to dry-run with an explicit `--execute`, (d) carries an explicit `--max-rows` plus a **hard ceiling** so an operator typo cannot trigger an unbounded drain, (e) writes an exact touched-id log, and (f) reuses the **same proven safety pattern** as `scripts/backfill-terminal-since.ts`. It also leaves the nightly cron permanently unchanged — no Night-4 surprise is even possible.

**Crucial design rule:** the operator script must call the **same extracted archive core** the cron uses (see §9), so the drain is byte-for-byte the logic Gate 5 validated — not a re-implementation that could drift.

---

## 3. Safe batch design

Model the script on `scripts/backfill-terminal-since.ts`, adapted to the archive strip:

| Parameter | Recommendation | Why |
|---|---|---|
| **Chunk size (select page)** | **500 rows/page** (keyset by `id > lastId ORDER BY id LIMIT 500`) | matches the cron's proven per-run size; keeps each page's work bounded |
| **Transaction boundary** | **Per-row `$transaction([upsert, update])`** (exactly as the route) — NOT one big transaction | tiny transactions = short locks, bounded WAL per commit, per-row error isolation → one bad row becomes a `sync_errors` row, not a whole-chunk abort |
| **`--max-rows` per run** | Operator-supplied; **dry-run default**; pilot 5,000 | explicit bound per invocation |
| **Hard safety ceiling** | **`MAX_RUN_CEILING = 25,000`** — script refuses `--max-rows` above it | a typo (`--max-rows 200000`) cannot trigger an unbounded drain |
| **Max runtime per run** | soft: log elapsed; `statement_timeout` per txn (e.g. 30s); abort run if wall-clock exceeds e.g. 45 min | keeps a run inside an attended window |
| **Sleep between chunks** | **250–500 ms** between pages | lets autovacuum/WAL flush breathe; avoids sustained write saturation on the single Launch compute |
| **Stop conditions** | (a) `--max-rows` reached; (b) eligible page returns 0; (c) any non-terminal/live row would be touched (assert pre-write); (d) a `sync_errors` rate threshold (e.g. >1% of a chunk) → abort; (e) host guard fail | bounded, fail-closed |
| **Idempotency** | inherent — `sync_status != 'archived'` filter + `upsert({update:{}})`; safe to re-run/resume | resume after interruption without double-archiving |
| **Host guard** | refuse unless `DATABASE_URL(_UNPOOLED)` contains `ep-cold-waterfall-adno3ao2` | mirror `backfill-terminal-since.ts:38-43` |
| **Stale-DB refusal** | explicit refuse if host contains `ep-royal-dawn-ad6eh8t2` (or any non-canonical) | never write the stale/do-not-serve DB |
| **Dry-run default** | no `--execute` ⇒ count + sample only, **zero writes** | proof before action |
| **`--execute` required** | writes only with the explicit flag (+ in-script confirmation echo of target host + max-rows) | gated |
| **Touched-id logging** | durable **pre-commit intent** log: append `{ id, listing_key, status }` (ids only) + fsync **before** each strip, to `artifacts/gate6-archive-touched-<stamp>.jsonl` | a SUPERSET of archived ids (`intent_lines = archived + skipped + errors`) — never under-reports a stripped row; reconcile per §6, do NOT equate with the archive delta |
| **Rollback branch** | **REQUIRED pre-`--execute`**: a fresh Neon branch off canonical `main` (like the Gate-5 `br-square-silence-…`) taken immediately before the run | the archive strip is **one-way per row** (see §3.1) |

### 3.1 Rollback reality — value-guarded rollback is NOT feasible for the strip
Unlike the `terminal_since` backfill (which sets one nullable column and can be value-guard-reverted), the archive strip **destroys data**: `raw_data`/`media`/`compliance` are overwritten with null/empty. The touched-id log records *which* rows were archived, but it **cannot restore their stripped JSON** (only a Trestle re-fetch or a point-in-time DB copy can). Therefore:
- **Per-row un-archive is NOT provided.** Rollback = **whole-branch restore** from the pre-run Neon branch / PITR (reverts unrelated writes too — last resort).
- This makes the **pre-run rollback branch mandatory**, and argues for **bounded runs** (5k pilot, ≤20k thereafter) so the blast radius of any mistake is one run, not the whole backlog.
- The intent log's role is **audit + verification** (enumerate the ids to spot-check; reconcile as `intent_lines = archived + skipped + errors`; prove no non-terminal row stripped), not per-row reversal.

### 3.2 Write-load / WAL / dead-tuple notes
- Each archived row = 1 small insert (`listings_archive`) + 1 **full-row UPDATE** of `listings` that nulls large TOASTed JSON. That UPDATE writes a new tuple and **dead-tuples the old one + its TOAST**. Draining 80k rows will add ~80k dead tuples to `listings` (already ~13.7k dead / 11%).
- **WAL spike:** ~80k JSON-nulling updates generate substantial WAL in a short window. On Launch with a **7-day PITR window**, that WAL/history is retained ~7 days → **PITR/branch storage temporarily inflates**, and physical/billed size **will not drop** during or right after the drain (see §7). This is expected, not a fault.
- Per-row transactions + inter-chunk sleep keep instantaneous write pressure modest and avoid long locks.

---

## 4. Cap / run-size evaluation

| Run size | Est. wall-clock* | Dead-tuple / WAL burst | Blast radius if wrong | Verdict |
|---|---|---|---|---|
| **5,000 (PILOT)** | ~5–12 min | small | one bounded run | ✅ **Recommended pilot** — proves the operator script end-to-end at 10× the nightly cap |
| **10,000** | ~12–25 min | moderate | one run | ✅ Safe as a step-up after a clean pilot |
| **20,000** | ~25–50 min | notable (monitor dead-tuple % + WAL) | one run | ✅ **Recommended max per run** — large enough for ~5 runs total, still attended/bounded |
| **40,000** | ~1–1.5 hr | large single burst; half the backlog in one shot | half the backlog | ⚠️ **Too risky** — long unbroken write burst, big dead-tuple/WAL spike, larger blast radius, harder to babysit. **Not recommended.** |

\* Extrapolated from the cron's observed ~500 rows in <60s; operator script has no 60s ceiling. Real timing comes from the §5 pilot, not assumed.

**Recommended ladder:** **5,000 pilot → verify clean → 20,000 × ~4 runs** (≈85k capacity vs ~80,707 backlog) = **~5 controlled runs**, spaceable across **1–3 days**. Each run is separately invoked, separately verified, separately proof-posted — no automation, no surprise runs.

---

## 5. Measurement required BEFORE any execution (read-only)

Gate each run on a fresh read-only snapshot (no writes):
1. **Refresh exact eligible backlog** — flag-ON predicate count (SQL + `ops:health` agree), to confirm the run size and the expected post-run remainder.
2. **Average payload size** — mean/percentile bytes of `raw_data`+`media`+`compliance` on eligible rows (estimate logical strip).
3. **Estimated logical bytes stripped** — eligible-count × avg payload (informational; physical won't drop — §7).
4. **Current Neon logical size** — `ops:health` STORAGE (DB MB, top tables, dead-tuple %).
5. **Branch / storage / PITR state** — branch count, PITR window, history size; confirm the daily branch-prune didn't remove a needed rollback branch.
6. **Confirm rollback branches present** — the fresh pre-run Gate-6 branch + any retained Gate-5/S1 branches.
7. **Public/search/CRM baseline** — `/api/health` 200, home 200, a known active listing renders, CRM scalar resolve works.
8. **No current production incidents** — Vercel runtime errors clean; no active `sync_errors` spike.

---

## 6. Verification AFTER each controlled run (mirror Gate 5 §5)

> The script prints `archived N / scanned M (skipped S, errors E)`. Reconcile DB deltas against the **`archived`** count — **not** the intent-log line count. The pre-commit intent log is a **SUPERSET**: `intent_lines = archived + skipped + errors` (ids are logged before the strip, so drift-skips and errors appear too). Use it to enumerate ids to spot-check, then reconcile as a superset.

Read-only, then post to #415:
1. **`listings_archive` delta == the script's reported `archived` count** (NOT the intent-log line count); reconcile the benign idempotent-upsert gap if any (0 dup-key/orphan/missing, safe direction — as Night 3). Confirm `intent_lines − archived == skipped + errors`.
2. **`sync_status='archived'` delta == the `archived` count** (and == the `listings_archive` delta).
3. **No non-terminal/live archived** = 0; archived rows terminal-only.
4. **Strip proof (JSON-null semantics):** `raw_data` content = 0 (all JSON `null`), `media=[]`, `compliance={}` across the run's rows.
5. **Backlog trends down** from the pre-run count (allow aged-in rows; the exact invariants are the two deltas).
6. **Public/API smoke** — `/api/health` 200, home 200, terminal rows still excluded from public surfaces.
7. **CRM scalar smoke** — archived rows still resolve from `prisma.listing` (price/address/status/beds-baths + FK links); no `listings_archive` CRM fallback expected.
8. **Closed-comps spot-check** — confirm >180d closed sales still render correctly (comps read `raw_data.ClosePrice`; the archive summary `close_price/close_date` must cover the display). **This is the one non-public read path to watch.**
9. **ops:health** — archive backlog ↓, archived total ↑, §2.05 = 0, sync errors = 0, dead-tuple % noted.
10. **Vercel/prod health unaffected** — runtime logs clean; no `listings_archive_move` `sync_errors`.
11. **Post #415 proof** with verification-type tags (production-SQL / Vercel-log / live-probe / ops:health).

**Hard-stop (any → stop, do not start the next run):** the `listings_archive` delta exceeds the script's `archived` count (unsafe direction); the two deltas disagree with `archived`; `intent_lines − archived ≠ skipped + errors`; any non-terminal/live row archived; §2.05 regression; `sync_errors` for `listings_archive_move`; public/health break; or a closed-comps render regression. *(A high `skipped` count is eligibility drift — investigate, but it is not itself a strip safety breach.)*

---

## 7. Storage / reclaim reality (set expectations)

- A faster drain **strips logical payloads** (raw_data/media/compliance) from up to ~80k rows — that's the point.
- **Physical / billed storage will NOT drop immediately.** The UPDATE-strip leaves **dead tuples**; Postgres MVCC keeps old versions until vacuum, and Neon billed size is governed by the **7-day PITR window** holding the pre-strip data + the drain's WAL.
- Expect a **temporary INCREASE** in PITR/history storage during/after the drain (the WAL burst is retained ~7 days), then a gradual settle as the window rolls forward and autovacuum reclaims dead tuples into reusable space (not necessarily returned to the OS/bill).
- **Reclaim is a separate, later gate** (`pg_repack` or dump→fresh-branch after the PITR window elapses). **Never `VACUUM FULL` on Neon** (table rewrite / compute spike / lock).
- **Downgrade (Launch→Free) is a separate final decision** and is **not** unlocked by this drain alone: DB is ~1,407 MB; even stripping all terminal JSON (~hundreds of MB logical) won't approach the 500 MB Free cap without reclaim **and** the other JSON fronts. Treat Gate 6 as "clear the backlog + stop paying to re-scan it nightly," not "downgrade enabler."

---

## 8. Search / media interaction (keep separate)

- **Archived terminal rows do not need media for public search** — public `/search`, Featured, listing detail, agent pages, open-houses, and saved-search/alerts all already **exclude terminal statuses**. Nulling `media` on archived terminals has **no public-search impact**.
- **Active/current listing media optimization can proceed independently** — it operates on active rows, which the archive drain never touches (`status IN terminal` filter). The two efforts do not collide.
- **R2 cleanup / media optimization must NOT delete active-listing media.** Any R2 work must scope to terminal/archived keys only and be its own gated plan; the archive drain itself does **not** delete R2 objects (it only nulls the `listings.media` JSON pointer — R2 bytes are untouched by Gate 6).
- **Search projection + saved-search work stays separate** from the archive drain. (Note the open, unrelated item: 34 mislabeled `is_exclusive` projection rows — **not** part of Gate 6; no projection backfill here.)
- Net: Gate 6 unblocks media/search work by getting the backlog off the table, but shares no code path with it.

---

## 9. Recommended next PR (smallest safe change — no execution in the PR)

**One PR, code + tests + runbook only. No production run, no env/Vercel/Neon/schema/migration change.**

1. **Extract the archive core** from `app/api/cron/data-retention/route.ts:157-293` into a reusable module, e.g. `lib/retention/archive-terminals.ts`:
   - `selectArchiveEligible(prisma, { now, take })` — the exact `findMany` (terminal set ∪ `sync_status != 'archived'` ∪ `terminal_since < cutoff`, `AGENT_TYPED_SELECT`, etc.).
   - `archiveOneListing(prisma, row)` — the per-row `$transaction([upsert, update])` strip + `sync_errors` on failure.
   - The cron route imports these (behavior identical → existing tests still pass; this is a pure refactor).
2. **Add the operator script** `scripts/drain-archive-backlog.ts` (model: `backfill-terminal-since.ts`):
   - **dry-run default**; `--execute` required; `--max-rows=N` (default dry-run reports only).
   - **`MAX_RUN_CEILING = 25000`** — refuse `--max-rows` above it (typo guard).
   - **host guard** (cold-waterfall) + **stale-DB refusal** (royal-dawn).
   - keyset 500/page, per-row transaction via `archiveOneListing`, 250–500 ms inter-chunk sleep, `statement_timeout` per txn.
   - **durable pre-commit intent log** (ids only, fsync **before** each strip) `artifacts/gate6-archive-touched-<stamp>.jsonl` — a superset reconciled per §6.
   - pre-flight assertion: target host canonical; print target + max-rows + "DRY-RUN/EXECUTE" banner.
   - stop conditions from §3.
3. **Configurable cap with a safety ceiling** — the cron keeps `T180_BATCH_CAP = 500` (unchanged); only the **operator script** takes `--max-rows` bounded by `MAX_RUN_CEILING`. (Do **not** raise the cron cap.)
4. **Tests:**
   - operator script: `--max-rows` above ceiling → refuses (fail-closed); host guard refuses non-cold-waterfall + royal-dawn; dry-run performs **zero** writes; idempotent (already-archived skipped); non-terminal never selected.
   - refactor parity: extracted core selects/archives exactly what the route did (the existing `data-retention-archive-eligibility.test.ts` + `ops-health-archive-backlog.test.ts` must stay green; update only if the `take`/cap assertion moves).
5. **Runbook:** add `docs/operations/gate6-accelerated-archive-drain-runbook.md` — the §3/§5/§6 procedure (pre-flight measure → pre-run Neon branch → dry-run → `--execute --max-rows=5000` pilot → verify → step to 20k → repeat → final #415 summary). Cross-reference this plan.
6. **Explicitly NOT in the PR:** no `--execute` run, no env change, no cron change, no reclaim, no downgrade, no predicate change, no schema/migration, no media/R2/projection/PR-5B.

Validation before merge (standard chain): `type-check`, `rls:validate`, `compliance-check`, `ucba:audit`, `idx:validate`, `test:runtime` (incl. the new tests), `crm:test` if any `public/crm/**` touched (none expected). State each result; CI runs the same chain.

---

## Report — bottom line

- **Recommended execution model:** **C — a controlled operator script** (`scripts/drain-archive-backlog.ts`) reusing the extracted archive core. Not a higher scheduled-cron cap (A) and not a manual cron trigger (B) — both are capped by the route's `maxDuration=60s` and require held env/Vercel changes; the script needs neither and cannot cause a surprise nightly run.
- **Recommended pilot size:** **5,000** (10× the nightly cap, one bounded attended run).
- **Recommended max run size:** **20,000** (40,000 is too risky — single large WAL/dead-tuple burst, big blast radius).
- **Expected runs to clear ≈80,707:** **~5** (5k pilot + ~4 × 20k ≈ 85k capacity), spaceable across **1–3 days**.
- **Code changes needed:** one small PR — extract archive core to `lib/retention/archive-terminals.ts`, add dry-run-default operator script with `--max-rows` + hard `MAX_RUN_CEILING=25000` + host/stale guards + touched-id log, tests for the ceiling/fail-closed/idempotency/host-guard, and a Gate-6 runbook. **No execution in the PR.**
- **Production risks:** (1) strip is **one-way per row** → mandatory pre-run Neon rollback branch + bounded runs; (2) **drain ≠ shrink** → physical/billed size won't drop now, PITR/WAL temporarily inflates for ~7 days; (3) **closed-comps** read terminal `raw_data.ClosePrice` → verify >180d sold-price still renders from the archive summary; (4) dead-tuple spike on `listings` (reclaim is a later gate); (5) operator-error → mitigated by dry-run default, `--execute` gate, and the hard ceiling.
- **Exact approval needed next (pick in order):**
  1. **Approve the PR** (code + tests + runbook, no execution) — or amend its scope.
  2. **After merge:** approve the **read-only pre-flight measurement** (§5).
  3. **Then:** approve the **5,000-row pilot `--execute`** + the pre-run Neon rollback branch.
  4. **Only if the pilot verifies clean:** approve the **20,000-row runs** (one approval per run, or a bounded batch of runs with per-run verification posted to #415).
  Reclaim and Launch→Free downgrade remain **separate later gates**.

**STOP.** No drain, no cron re-arm, no env/Vercel/DB/schema change, no code written — this is the plan only.
