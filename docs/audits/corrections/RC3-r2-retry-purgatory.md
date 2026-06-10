# Correction Trace Record — `RC3` R2 retry purgatory

> **Status: SETTLED.** Merged `#379 → main 0fe39174` (full: `0fe391740e63121a6de526a36ccb94160fc533ca`,
> merged 2026-06-10T03:00:08Z, documented waiver as on RC1). Media-program correction #3 (after RC1 #377
> SETTLED). **Code fix only — NO schema, NO DB writes, NO R2 cleanup, NO backfill, NO manual cron, NO
> frontend/CRM/search** (held & honored). Fixes incident 2026-05-21 §4 RC3.
>
> **Runtime-verified (2026-06-10):** Vercel production deployment `dpl_Goch7TkRqHDeLYLrN2JmrwNsP736`
> for commit `0fe39174` is **READY** (target=production, created 2026-06-10T03:00:13Z). Post-deploy
> SQL split (operator-run by Maya, read-only): **`r2_retry_eligible = 44` · `r2_retry_parked = 40` ·
> `r2_cached_active = 81,751`**. Interpretation: the 40 retry-exhausted rows (`r2_attempts >= 8`) are
> **parked** — excluded from the Phase-3 retry budget while remaining `status='active'`/displayable via
> the `media_url_original` proxy; 44 rows remain actionable backlog; R2 mirror is broadly healthy
> (81,751 cached active rows).
>
> **Known caveat (deferred, §10):** `scripts/ops-health.js` still counts parked rows as
> `r2_retry_backlog` — a follow-up is needed to split actionable (`r2_attempts < 8`) vs
> parked/exhausted (`r2_attempts >= 8`) so the metric stops over-reporting.
>
> **Out-of-scope note — Featured 4-vs-6:** NOT an RC3 failure. The remaining Featured shortfall is
> newest-sort/media-coverage starvation while the RC1 catch-up continues to drain the boundary
> cluster. Any Featured config change is a separate operator decision, not part of this settlement.

## 0. Header
- **ID / Ledger row:** RC3 (media program, correction #3; incident §4 RC3 / §7 PR-E)
- **Severity / Compliance tie:** P1 · media display freshness / R2 mirror throughput — non-destructive
- **Owning phase:** media program · **Maya GO:** given (exhausted-exclusion approach; NOT blanket tombstone)
- **Status:** SETTLED (#379 → main `0fe39174`; deploy READY; runtime-verified via post-deploy SQL split)

## 1. Defect — the BEFORE (proven in code)
- `lib/idx/media-sync.ts` `emitFailure` tombstones a `listing_media` row (`status='deleted'`) **only** on
  the 3rd `fetch_failed` with error `HTTP 404|410` (`isPermanent4xx && r2_attempts >= 3`, `:957-974`).
- Every other failure — **429** (rate-limit; the common one at Trestle's 480/min ceiling, concurrency-5),
  5xx, 403/408/425, network/timeout, `r2_head_failed`, `r2_upload_failed`, `token_failed` — only
  increments `r2_attempts` + stamps the 6h cooldown and is **retried forever**.
- Result (ops:health 2026-06-09): **40 rows at ≥3 attempts × ~4 retries/day ≈ 160 failed/24h** — poison
  rows re-attempted indefinitely, wasting Phase-3 budget that should mirror RC1's freshly-filled rows.
- **RED proof:** a behavioral unit test on the extracted backlog `where` — exhausted non-permanent rows
  (`r2_attempts >= N`) must be EXCLUDED from the Phase-3 SELECT. Pre-fix the function did not exist.

## 2. Pre-registered blast radius (the "no dark work" contract — ACTUAL files)
- **WILL touch (declared):**
  - `lib/idx/media-sync.ts` — add `R2_RETRY_EXHAUSTED_THRESHOLD = 8` + pure exported
    `buildR2BacklogWhere(cooldownThreshold, attemptedIds)` (adds the retry-exhausted `OR` to the
    Phase-3 backlog `where`); rewire the Phase-3 `listingMedia.findMany` to use it. `emitFailure`
    (tombstone classification) is **UNCHANGED**.
  - `lib/idx/__tests__/media-sync-rc3.test.ts` — behavioral RED→GREEN for the exclusion + a safety-net
    assertion that a cached-null row still resolves to a usable proxied photo (never disappears).
  - this Trace Record.
- **Transitive reach:** the Phase-3 R2 backlog SELECT only. Tombstone logic, the resolver, the reader,
  the public DTO, cards, and detail are all UNCHANGED.
- **MUST NOT touch (held & honored):** prisma schema/migrations · DB writes · R2 cleanup · backfill ·
  search canon · CRM/frontend/denorm/card/detail · `.github`/env/cron · cursor reset/replay · broad refactor.

## 3. Compliance pre-read (§D)
- Read `COMPLIANCE-CANONICAL-INDEX.md` §8 (Media). Non-destructive: rows stay `status='active'` (still
  publicly served via `media_url_original` proxy); only their R2 *re-mirroring* is parked. No display
  gate / distribution gate / status change. Fail-closed (§E): the safe choice is to PARK, not delete.

## 4. Fix approach
The incident §7 PR-E suggested "tombstone after N failures of any class" — **rejected as unsafe**:
tombstone = `status='deleted'` = the photo disappears, even though the row still serves fine via the
proxy. Instead: **retry-exhausted EXCLUSION** — after `R2_RETRY_EXHAUSTED_THRESHOLD` (8, > the 404/410
tombstone threshold of 3) non-permanent failures, the row is dropped from the Phase-3 backlog SELECT
(`r2_attempts null OR < threshold` eligible) so it stops wasting budget, while `status='active'` is
preserved so the resolver keeps serving its `media_url_original`. Permanent 404/410 still tombstone at 3.

## 5. Step log
| # | Step | Artifact | Result |
|---|------|----------|--------|
| 1 | RED test for `buildR2BacklogWhere` exclusion | `media-sync-rc3.test.ts` | RED: `buildR2BacklogWhere is not a function` (4 cases) | ✅ RED |
| 2 | add `R2_RETRY_EXHAUSTED_THRESHOLD=8` + `buildR2BacklogWhere`; wire Phase-3 findMany | `lib/idx/media-sync.ts` | diff | ✅ |
| 3 | GREEN | `jest media-sync-rc3` | **5/5** | ✅ GREEN |
| 4 | tombstone classification UNCHANGED (regression guards) | `media-sync-r2.test.ts` (existing) | 404/410→tombstone@3; 429/5xx/403/network/upload/head/token→NO tombstone — all green | ✅ |
| 5 | safety net | `media-sync-rc3.test.ts` | cached-null row → proxied `media_url_original` passes `getValidPhotoMedia` (not dropped) | ✅ |
| 6 | harness | B0 chain | type-check 0 · media-sync **181/181** · idx-sync **65/65** · test:runtime **2099/2099** · ucba 0 regr · rls 0 err · compliance-check 92/0 · build 0 | ✅ |
| 7 | gate:micro / gate:macro / tristle / Codex | — | recorded in §6/§7 | ✅ |
| 8 | merge + deploy | #379 → main `0fe39174` | Vercel production deployment READY (2026-06-10T03:00:13Z) | ✅ |
| 9 | runtime verification | post-deploy SQL split (operator-run) | eligible=44 · parked=40 · cached_active=81,751 — exhausted rows out of retry budget, still displayable | ✅ |

## 6. Gate results
| Gate | Result |
|---|---|
| B2 proof (§F) | behavioral RED→GREEN on `buildR2BacklogWhere` (not grep) + post-deploy SQL split (runtime) |
| C1 gate:micro | PASS (committed-diff; declared radius matched) |
| C2 gate:macro | PASS (committed-diff; idx domain → tristle routed) |
| tristle | PASS (see §7) |

## 7. Sign-offs
- **gate:micro PASS · gate:macro PASS** (declared radius matched; idx domain → tristle).
- **tristle-rebny-compliance: PASS** — non-destructive (no `status` write; excluded rows stay active and
  still serve `media_url_original` via proxy); no display/distribution/§2.05/Permission/DTO change;
  tombstone classification unchanged; strictly an R2-backlog budget optimization. rebny-search-auditor:
  N/A (no search filter / field-map / picklist change — this is the R2 re-mirror backlog only).
- **Codex (#379):** CLEAN — "Didn't find any major issues." · **claude-review / pr-check / guardrails /
  scan / release-truth:** all SUCCESS. · **Maya merge:** DONE — #379 squash-merged to main `0fe39174`
  (2026-06-10T03:00:08Z, documented waiver as on RC1).

## 8. Trace-back / reproduce
`git checkout main` → run the `buildR2BacklogWhere` exclusion test → RED (function absent); apply the fix
→ `jest media-sync-rc3` 5/5 GREEN; existing `media-sync-r2` tombstone tests stay green.

## 9. Permanent regression guard
`media-sync-rc3.test.ts` — exhausted (`r2_attempts >= N`) excluded; null/below eligible; cached-null row
still serves a usable proxied photo. Plus the unchanged `media-sync-r2.test.ts` tombstone-classification suite.

## 10. Coupled follow-ups (out of RC3 scope)
- **ops-health observability gap (KNOWN, documented; NOT fixed in this PR — no schema, no scope creep):**
  RC3 parks rows by `r2_attempts >= 8` but, without a new column, does **not** record *why/when* a row was
  parked. `scripts/ops-health.js:568-589` still counts **every** active row with `r2_attempts > 0` as
  `r2_retry_backlog` (warn/critical), and has no knowledge of the `>= 8` exhaustion threshold. So after RC3:
  - retry-exhausted active rows are **parked** by `r2_attempts >= 8` (excluded from the Phase-3 backlog SELECT);
  - they **remain displayable** via `media_url_original` through `/api/media/proxy` (status stays `active`);
  - they should **NOT** be counted as *urgent/actionable* retry backlog — they are intentionally not retried;
  - **a future ops-health follow-up is needed** to split the count: actionable backlog
    (`r2_attempts < 8`) vs **parked/exhausted** (`r2_attempts >= 8`), so the metric stops over-reporting.
    Cleanest version uses a dedicated `r2_exhausted_at` column (schema — Maya-gated) for "why/when";
    a no-schema interim can derive the split from `r2_attempts >= R2_RETRY_EXHAUSTED_THRESHOLD`. **Deferred.**
- **Re-arm (optional):** RC3 parks exhausted rows persistently (hard `r2_attempts` exclusion). A future
  periodic re-arm (e.g., a long-cooldown tier so a multi-day R2 outage doesn't strand recoverable rows)
  would need a new column or an `r2_last_attempt_at`-based long tier — deferred; not needed for the
  current 40-row poison set.
- Program: RC1 catch-up (running) · then reassess coverage → controlled backfill or Featured config.
