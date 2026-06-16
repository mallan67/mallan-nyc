# Correction SCOPE — data-retention T+180 archive eligibility bug (NULL `status_changed_at`)

> **SCOPE DOC ONLY — NO CODE, NO CLEANUP, NO EXECUTION in this document.** This scopes a future
> STANDALONE correction PR (code + RED test). The fix itself, and any archive *run*, stay
> separately Maya-gated. Author: Claude (Fable 5), 2026-06-15.

## Defect (Class A, code-proven)
`app/api/cron/data-retention/route.ts:162-168` — the T+180 terminal archive selects:
```ts
where: {
  status: { in: TERMINAL_STATUSES },
  status_changed_at: { lt: oneEightyDayCutoff },   // ← NULL fails this silently
  sync_status: { not: "archived" },
}
```
In SQL/Prisma, `NULL < ts` evaluates to NULL (not true). **Terminal rows whose
`status_changed_at` was never populated are therefore invisible to the archive FOREVER** — they
can never age into eligibility. Result: only **34 of ~91,536** terminal rows have ever archived
(audit `neon-storage-cost-audit-2026-06-12.md`), and their heavy JSON (`raw_data`/`compliance`)
accumulates unbounded. This is a **latent storage leak**, independent of the $0/Free goal.

## Why standalone (not bundled with the Free/JSON-drop program)
- It is a **correctness fix** worth doing on its own merits (the leak grows regardless of any
  downgrade decision).
- It is **small and self-contained** (one query predicate + a RED test), unlike the JSON-drop
  refactor (PR 5B + Step 5 + normalization).
- It must NOT reach Free by itself (archive-only is insufficient — see the Step-4 plan §5.4); so
  scoping it separately keeps the storage-reduction decision cleanly gated.

## Proposed fix (for the future PR — NOT applied here)
- Broaden eligibility so NULL-dated terminal rows qualify once genuinely old, e.g. compare
  `COALESCE(status_changed_at, updated_at, created_at) < now-180d`, OR a one-time read-only-proven
  backfill of `status_changed_at` for terminal rows. Prefer the COALESCE predicate (no data write,
  purely a query change) pending the dependency check on whatever else reads `status_changed_at`.
- **Preserve the existing batch cap** (`T180_BATCH_CAP = 500`) and the per-run/`maxDuration=60`
  budget — the fix changes WHICH rows qualify, not HOW MANY per run; draining the now-eligible
  backlog stays bounded and nightly.
- **Preserve dry-run / non-destructive behavior:** the archive UPDATE-strip + `listings_archive`
  upsert is unchanged; rows are NOT deleted (FK integrity, as today). No new deletion path.

## RED test (required in the future PR)
- A row-level test proving a terminal row with `status_changed_at = NULL` (and old
  `created_at`/`updated_at`) is **selected** by the fixed predicate and **skipped** by the current
  one (RED on `main`, GREEN after fix).
- Plus: a non-NULL recent terminal row stays excluded; the batch cap still bounds the result set;
  an already-`archived` row is still skipped (idempotent).

## Hard bounds for the future PR
- Edits ONLY `app/api/cron/data-retention/route.ts` + a new test.
- **NO archive run, NO cleanup, NO backfill execution** in that PR — it fixes the query + proves
  it with a test; the actual drain is a separate Maya-gated operation (nightly cron, bounded by
  the cap).
- No schema change, no Neon downgrade, no column drops, no R2.
- Gates: gate:micro/macro · the §G chain · tristle (touches a §D retention/§2.05 surface —
  terminal rows are already non-displayable, so this is a storage-hygiene improvement, but confirm).

## Sequencing
Independent of the Free/JSON-drop program; can land anytime once Maya approves. It is the
"fix the archive bug" item in the Step-4 plan's recommended sequence (§D.1) — momentum without
risking the site.
