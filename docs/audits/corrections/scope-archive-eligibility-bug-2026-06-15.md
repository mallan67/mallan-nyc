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
- Broaden eligibility so NULL-dated terminal rows qualify once genuinely old, comparing
  **`COALESCE(status_changed_at, modification_timestamp) < now-180d`** — a query change, no data
  write. **Fall back to `modification_timestamp`, NOT `updated_at` (Codex #404):**
  - `modification_timestamp` is **NOT NULL** (`prisma/schema.prisma:550`) and is the documented
    **Trestle source-of-truth clock** for these rows (`lib/idx/sync.ts:284-285` + the Phase-1
    backfill / idx-sync keyset cursor). So the COALESCE is never NULL and ages on a real signal.
  - **Do NOT use `updated_at`** — it is `@updatedAt` (`schema.prisma:99`), bumped by *every*
    unrelated Listing rewrite/upsert (idx-sync, the media drain), so terminal rows would look
    perpetually "recent" → the archive backlog stays stuck forever (the exact failure mode being
    fixed). **Do NOT use `created_at`** as the primary fallback — it is ingestion time, far older
    than the terminal transition → would archive on the wrong (too-early) age.
  - **Caveat to verify first (audit R2/Q10a):** confirm `modification_timestamp` is honest for the
    ~87,525 `gated:Closed…` legacy rows before expecting throughput; if any are implausibly old/new,
    decide whether a one-time read-only-proven `status_changed_at` backfill is the safer route.
  - Alternative (more invasive): a one-time backfill of `status_changed_at` for terminal rows —
    only if the COALESCE proves insufficient; prefer the pure query change.
- **ROLLOUT GUARD — REQUIRED (Codex #404). The cron is NOT a separate gate; it auto-runs.**
  `/api/cron/data-retention` runs **nightly (`vercel.json`: `0 3 * * *`)**, archiving up to 500
  eligible rows/run. So **merging a broadened predicate would start draining the ~91K backlog on
  the very next 03:00 UTC run — with no Maya gate.** The fix therefore MUST ship the broadened
  predicate **behind a default-OFF flag** (e.g. env `ARCHIVE_T180_BACKLOG_ENABLED`): unset/off →
  the route keeps the CURRENT narrow `status_changed_at < cutoff` behavior (zero change in prod on
  merge); on → the `COALESCE(status_changed_at, modification_timestamp)` predicate takes effect and
  the capped drain begins. **Maya flipping that flag (a held env-var change) IS the explicit
  execution gate.** Merging the PR is then truly inert.
- **Preserve the existing batch cap** (`T180_BATCH_CAP = 500`) and the per-run/`maxDuration=60`
  budget — the fix changes WHICH rows qualify (when enabled), not HOW MANY per run; the drain stays
  bounded and nightly.
- **Non-destructive behavior unchanged:** the archive UPDATE-strip + `listings_archive` upsert is
  as today; rows are NOT deleted (FK integrity). No new deletion path.

## RED test (required in the future PR)
- **Flag-OFF (default) test:** with `ARCHIVE_T180_BACKLOG_ENABLED` unset, a `status_changed_at=NULL`
  terminal row stays **EXCLUDED** — proving merge changes nothing in prod until Maya enables it.
- **Flag-ON test (the fix):** a terminal row with `status_changed_at = NULL` **and old
  `modification_timestamp` (>180d)** is **selected** when the flag is on, and **skipped** by the
  current/`main` predicate (RED on `main`, GREEN after fix). The age must come from
  `modification_timestamp`.
- **Anti-`updated_at` guard (Codex #404):** a terminal row with `status_changed_at = NULL`, old
  `modification_timestamp` (>180d), but a **recent `updated_at`** (simulating an unrelated rewrite)
  MUST still be **selected** — proving the predicate ages on `modification_timestamp`, not
  `updated_at` (so the backlog can't be stuck by routine rewrites).
- Plus: a NULL-dated row with **recent `modification_timestamp`** stays excluded; a non-NULL recent
  `status_changed_at` row stays excluded; the batch cap still bounds the result set; an
  already-`archived` row is still skipped (idempotent).

## Hard bounds for the future PR
- Edits ONLY `app/api/cron/data-retention/route.ts` + a new test.
- **Merge is execution-INERT ONLY because of the default-OFF rollout guard above (Codex #404).**
  Without that flag the nightly cron would auto-drain on merge — so the guard is mandatory, not
  optional. The PR fixes the query (behind the flag) + proves it with a test; the actual drain
  begins ONLY when Maya sets `ARCHIVE_T180_BACKLOG_ENABLED` (a held env-var change = the gate),
  capped at 500/run.
- The RED test must cover BOTH flag states: **flag OFF** → NULL-dated terminal row still EXCLUDED
  (current behavior preserved on merge); **flag ON** → the same row with old
  `modification_timestamp` is SELECTED (the fix), plus the anti-`updated_at` case.
- Env-var addition (`ARCHIVE_T180_BACKLOG_ENABLED`) is itself a held surface — flag default OFF in
  code; the env var is set later, by Maya, as the separate execution approval.
- No schema change, no Neon downgrade, no column drops, no R2.
- Gates: gate:micro/macro · the §G chain · tristle (touches a §D retention/§2.05 surface —
  terminal rows are already non-displayable, so this is a storage-hygiene improvement, but confirm).

## Sequencing
Independent of the Free/JSON-drop program; can land anytime once Maya approves. It is the
"fix the archive bug" item in the Step-4 plan's recommended sequence (§D.1) — momentum without
risking the site.
