# Gate 6 — accelerated archive-drain EXECUTE runbook

**Status: TOOLING ONLY. The PR that adds this runbook + the operator script executes NOTHING.** No drain, no cron re-arm, no env/Vercel change, no production DB writes. Every `--execute` run is a SEPARATE, explicitly-approved, attended step.

**Plan:** `docs/superpowers/plans/2026-06-29-gate6-accelerated-archive-drain-plan.md` · **Board:** GitHub issue #415 · **Predecessor:** Gate 5 3-night 500/run trial (clean; `listings_archive`=2,033; flag OFF).

**Tooling:**
- `scripts/drain-archive-backlog.ts` — the bounded operator drain (dry-run default).
- `lib/retention/archive-terminals.ts` — the shared archive core (SAME logic as the nightly cron `app/api/cron/data-retention/route.ts`; the cron stays capped at **500/run** and is unchanged).
- `lib/retention/drain-core.ts` — guards + orchestration (`MAX_RUN_CEILING=25000`, host guard, dry-run, fail-closed).

---

## 0. What this tool does / does NOT do

- **Does:** archive eligible **terminal, >180d, not-yet-archived** rows in bounded, attended runs off the stable `terminal_since` clock — the SAME strip the Gate-5-validated cron performs (summary → `listings_archive`; live row `sync_status='archived'`, `raw_data`=JSON null, `media`=[], `compliance`={}).
- **Does NOT:** read or change `ARCHIVE_T180_BACKLOG_ENABLED`; depend on the Vercel cron; raise the cron cap; reclaim storage; downgrade Neon; change the archive predicate; touch active-listing media/search.
- **One-way:** the strip is destructive per row. There is **no per-row un-archive**. The touched-id log is **audit-only** (ids, never payloads). The ONLY rollback is the **pre-run Neon rollback branch** (§2).

---

## 1. Preflight — read-only measurement (REQUIRED before every run)

Pull production env (host-guarded) and measure, writing nothing:
1. **Canonical host:** confirm `DATABASE_URL_UNPOOLED` → `ep-cold-waterfall-adno3ao2` (the script refuses anything else, and refuses stale `ep-royal-dawn-ad6eh8t2`).
2. **Eligible backlog (flag-ON predicate):** `terminal ∧ not archived ∧ terminal_since < now−180d` — confirms run size + expected remainder. (`ops:health` flag-ON + direct SQL should agree.)
3. **Avg/percentile payload bytes** of `raw_data`+`media`+`compliance` on eligible rows (logical-strip estimate).
4. **Neon logical size + dead-tuple %** (`ops:health` STORAGE).
5. **Branch / PITR state** — confirm the daily branch-prune did not remove a needed rollback branch.
6. **Public/search/CRM baseline** — `/api/health` 200, home 200, a known active listing renders, CRM scalar resolve works.
7. **No active incidents** — Vercel runtime errors clean; no `sync_errors` spike.

> The **dry-run** itself (§3) is also a preflight: it reports the eligible backlog and what it *would* archive, with zero writes.

---

## 2. Pre-run Neon rollback branch (MANDATORY for any `--execute`)

The strip is one-way. Before ANY `--execute`, create a fresh Neon branch off canonical `main` (point-in-time snapshot), exactly as Gate 5 did (`pre-gate5-archive-flag-flip-…`):

- Branch off `br-crimson-frog-adr7g9gt` (canonical main), project `hidden-mountain-87248164`. Record name/branch-id/endpoint/timestamp on #415. Do NOT record the connection URI.
- If a prior run's branch is older than ~a day, take a fresh one immediately before the next run.
- The operator script REFUSES `--execute` unless `--ack-rollback-branch` is passed — pass it only after the branch exists.

Catastrophic rollback = restore that branch / Neon PITR (7-day window). This reverts unrelated writes too — last resort.

---

## 3. Pilot — 5,000 rows

### 3a. Dry-run (safe; run anytime)
```bash
npx tsx scripts/drain-archive-backlog.ts --max-rows=5000
```
Confirms host guard, prints the eligible backlog, and reports it *would* archive up to 5,000 rows — **zero writes**.

### 3b. Execute (⛔ DO NOT RUN without explicit Maya approval + a fresh §2 rollback branch)
```bash
# ⛔ HELD — requires explicit per-run approval AND a fresh pre-run Neon rollback branch.
npx tsx scripts/drain-archive-backlog.ts --execute --ack-rollback-branch --max-rows=5000
```
- Writes the durable **pre-commit intent log** (ids only, fsynced before each strip) to `artifacts/gate6-archive-touched-<stamp>.jsonl` (gitignored). It is a SUPERSET of archived ids (also includes skipped/errored ids) — reconcile per §4, never equate its line count with the archive delta.
- Sets `statement_timeout=30s` + `lock_timeout=5s` on a single connection; per-row transactions; 300 ms inter-chunk pause.
- Expected wall-clock: a few minutes (no Vercel 60s ceiling).

---

## 4. Post-run verification (after every `--execute`; read-only) — mirror Gate 5 §5

> **Counts to use:** the script prints `archived N / scanned M (skipped S, errors E)`. The deltas below reconcile against the script's **`archived`** count — **NOT** the intent-log line count. The pre-commit intent log is a deliberate **SUPERSET**: `intent_lines = archived + skipped + errors` (ids are logged *before* the strip, so eligibility-drift skips and archive errors also appear). Use the intent log to enumerate exactly which ids to spot-check, then reconcile it as `archived + skipped + errors`.

1. **`listings_archive` delta == the script's reported `archived` count** (not the intent-log line count). Reconcile any benign idempotent-upsert gap (0 dup-key/orphan/missing; safe direction). Confirm `intent_lines − archived == skipped + errors`.
2. **`sync_status='archived'` delta == the script's `archived` count** (and == the `listings_archive` delta).
3. **No non-terminal/live archived** = 0; archived rows terminal-only.
4. **Strip proof (JSON-null semantics):** `raw_data` content = 0 (all JSON `null`), `media=[]`, `compliance={}` on the run's rows.
5. **Backlog trends down** from the pre-run count (allow aged-in rows; the exact invariants are the two deltas).
6. **Public/API smoke** — `/api/health` 200, home 200; terminals still excluded from public surfaces.
7. **CRM scalar smoke** — archived rows still resolve from `prisma.listing` (price/address/status/beds-baths + FK links).
8. **Closed-comps spot-check** — >180d sold-price still renders from the archive summary (`close_price/close_date`). *(The one non-public read path to watch.)*
9. **ops:health** — archive backlog ↓, archived total ↑, §2.05 = 0, sync errors = 0, dead-tuple % noted.
10. **Vercel/prod health unaffected** — runtime logs clean; no `listings_archive_move` `sync_errors`.

**Hard-stop (any → stop; do not start the next run):** the `listings_archive` delta exceeds the script's `archived` count (unsafe direction) or the run/ceiling; the two deltas disagree with `archived`; `intent_lines − archived ≠ skipped + errors`; any non-terminal/live row archived; §2.05 regression; `listings_archive_move` errors; public/health break; or a closed-comps render regression. *(A high `skipped` count is eligibility drift, not a strip failure — investigate, but it is not itself a strip safety breach.)*

---

## 5. #415 proof requirement

After **every** `--execute` run, post to #415 with verification-type tags (production-SQL / live-probe / ops:health): run size, the script's `archived`/`skipped`/`errors` totals, the `listings_archive` + `sync_status='archived'` deltas (reconciled against `archived`), strip proof, backlog trend, §2.05, smoke results, and the **intent-log path + line count** (noting `intent_lines = archived + skipped + errors`). No "green checks" claim stands without the measured evidence.

---

## 6. Escalation to 20,000 (only after a clean pilot)
- Escalate ONLY after the 5,000 pilot verifies clean (§4) and the proof is on #415.
- Larger runs (one explicit approval per run, fresh §2 rollback branch each time):
  ```bash
  # ⛔ HELD — per-run approval + fresh rollback branch each time.
  npx tsx scripts/drain-archive-backlog.ts --execute --ack-rollback-branch --max-rows=20000 --chunk-size=500
  ```
- **20,000 is the recommended max per run.** **Do NOT use 40,000 as the first large run.** (Empirically the DB can take more — payload ~2.5 KB/row, no trigger/FK amplification — but irreversibility + verification granularity + `idx_sync` overlap argue for bounded runs; `MAX_RUN_CEILING=25000` is the typo backstop, not the normal size.)
- Run during a low-traffic window to minimize `idx_sync`/`media_sync` lock overlap.
- Clearing ≈80,707 ≈ pilot + ~4×20,000 ≈ **~5 attended runs over 1–3 days**.

---

## 7. Storage / reclaim / downgrade — SEPARATE gates
- The drain strips logical payloads but **does NOT reclaim physical storage** (dead tuples; Neon billed size governed by the 7-day PITR window). Expect a temporary PITR/WAL storage bump, then settle.
- **Reclaim** (later, separate gate): `pg_repack` or dump→fresh-branch after the PITR window. **NEVER `VACUUM FULL` on Neon.**
- **Downgrade** (Launch→Free) is a separate final decision, **not** unlocked by this drain alone.

---

## 8. Hard stops (this runbook + its PR execute none)
No drain in the PR · no cron re-arm · no cron-cap change (stays 500) · no env/Vercel change · no archive-predicate change · no reclaim · no `VACUUM FULL` · no downgrade · no S1/Gate-5 rollback-branch deletion · no projection backfill · no PR-5B reader swap · no PageSpeed/media work · every `--execute` is separately Maya-approved + attended + #415-proofed.
