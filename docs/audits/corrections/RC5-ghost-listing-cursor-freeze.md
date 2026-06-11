# Correction Trace Record — `RC5` ghost-listing cursor freeze

> **Status: IN-PR.** Maya GO ("Proceed with the RC1 cursor-freeze fix as P0 after #381 proof/merge"
> + detailed scope, 2026-06-10). Media-program correction #4 (after RC3 #379 SETTLED). **Code fix
> only — NO schema, NO DB writes at fix time, NO R2 cleanup/deletes, NO backfill, NO manual cron,
> NO tombstoning of valid media.** Fixes the production P0 found by the 2026-06-10 media-pipeline
> diagnosis (`docs/audits/media-pipeline-error-diagnosis-2026-06-10.md`).

## 0-pre. Mandatory media-PR preamble (incident 2026-05-21, §0.5 — Maya directive 2026-06-10)
1. **Incident document read:** `docs/incidents/2026-05-21-chronic-media-sync-root-cause.md`,
   re-read 2026-06-10 before this correction.
2. **Chronic root cause addressed:** a **NEW ghost-listing variant of incident §4 RC1's
   cursor-deadlock CLASS** (livelock on a permanently-unprocessable batch head). Numbering
   collision stated plainly: this correction is series-RC5; it is **unrelated to incident §4 RC5**
   (held architectural migrations). Incident-RC1's original boundary-cluster deadlock was fixed by
   correction-RC1 (#377); this closes the next deadlock species the keyset semantics allowed.
3. **Chronic root causes remaining OPEN after this PR:** all Phase-1 writer-loop closures
   (crm: tombstone/media-order guards, reset-sync RC2 patch, MT-bump, floorplan classifiers,
   table-aware ops-health metric, feed-reconcile $expand verification — the ghost-IMPORT side of
   this very bug) · incident §4 RC5 held migrations (M1/PR-4/5B) · §4 RC6 observability ·
   ALL data cleaning (deleted-photo strike, ~360-key re-sync, M4, R2 orphans). This PR fixes ONE
   freeze; it does not claim the media architecture is fixed.
4. **Why this PR cannot reintroduce the four canonical regressions:**
   - **`Listing.media` stomping (§4 RC2 class):** the diff contains zero `Listing.media` writes;
     `runMediaSync` never touches the JSON column (asserted in the reader/PR-4 boundary note and
     unchanged); tristle verified no display/JSON write paths in the diff.
   - **cursor deadlock (§4 RC1 class):** transient failures still halt fail-closed
     (`catch → ok:false`, test 5 proves probe-failure halts); ONLY a proven-permanent condition
     (no local listings row, re-checked every run) is skipped — and the skip is `ok:true` past a
     listing that cannot render, so no display data is ever skipped-over.
   - **retry purgatory (§4 RC3 class):** no retry loop added; ghosts are NOT retried at all within
     a run and re-surface only on PCT bump; RC3's exhaustion parking is untouched.
   - **JSON/table/R2 mismatch:** ghosts get ZERO writes in any layer — the diff cannot widen
     divergence; for valid listings the existing complete-set semantics (RC1 pagination) are
     byte-identical.
5. **Cleanup gate restated:** NO JSON/R2/data cleanup until the writer loops are closed.

## 0. Header
- **ID / Ledger row:** RC5 (media program, correction #4; the upstream feed-reconcile ghost-import
  question is SEPARATE — Phase-1 loop-closure plan item 6)
- **Severity / Compliance tie:** P0 · media display freshness — the frozen cursor starves ALL media
  catch-up (11,822-listing backlog; ~150 new photoless listings/day)
- **Owning phase:** media program · **Maya GO:** given (resolved-skip approach + ghost logging)
- **Status:** IN-PR (branch `fix/rc5-ghost-listing-cursor-freeze`)

## 1. Defect — the BEFORE (proven in code + production)
- `lib/idx/media-sync.ts` `runMediaSync` Phase 1: a Trestle Property with a valid
  `ListingId`/`ListingKey` but **no local `listings` row** ("ghost" — never imported; the 3 live
  ghosts are RLS20014678/RLS20018843/RLS20030621) flows into the try block, where
  `updateListingMediaSummary()` → `prisma.listing.update` throws **P2025** (and any
  `listing_media` insert would violate the FK) → `catch` → `processed.push({ok:false})` (`:1698`).
- `pickKeysetWatermark` (`:340`) advances only to the last **contiguous** ok:true — an ok:false at
  batch position #1 yields **watermark null → cursor preserved → the SAME batch re-fetches every
  run forever.** Production proof (diagnosis report): cursor pinned at
  `(2026-05-14T20:37:58.703Z, key 1107463938)` since 2026-06-09T06:15Z; 90 rows created 06-10 vs
  13,220 on 06-09.
- The halt-at-malformed semantics (Codex #377) are CORRECT for transient failures; a ghost is not
  transient — it can never succeed until the listing is imported, so halting on it is a livelock.

## 2. Pre-registered blast radius (ACTUAL files)
- **WILL touch (declared):**
  - `lib/idx/media-sync.ts` — Phase-1 loop only: local-existence probe
    (`prisma.listing.findUnique`, select `listing_id`) inside the try BEFORE `fetchMedia`; ghost →
    resolved skip (`ok:true`, `listingsSkipped++`, ghost counters) exactly like the
    compliance-blocked skip at `:1644-1651`; new result fields `ghost_listings_skipped` +
    `ghost_listing_ids` (capped at 20) added to `RunMediaSyncResult` + both return sites.
    `emitFailure`, tombstone classification, `pickKeysetWatermark`, `upsertListingMedia`,
    Phase 2/3/4 — **UNCHANGED**.
  - `lib/idx/__tests__/media-sync-rc5.test.ts` — behavioral RED→GREEN (below).
  - `lib/idx/__tests__/media-sync-orchestration.test.ts` — mock gains `listing.findUnique`
    (default: exists) so existing 181 tests keep exercising the same paths.
  - this Trace Record.
- **Transitive reach:** the cron route's JSON response/log gains the 2 new counters (additive).
  ops:health unchanged (reads MediaSyncState columns, which are unchanged — no schema).
- **MUST NOT touch (held & honored):** prisma schema/migrations · live DB writes · R2 cleanup or
  deletes · backfill · tombstoning valid media · cron config/.github/env · CRM/frontend/search ·
  feed-reconcile (separate Phase-1 plan item).

## 3. Compliance pre-read (§D)
- `COMPLIANCE-CANONICAL-INDEX.md` §8 (Media) read. Non-destructive: ghosts get NO writes at all
  (skip happens BEFORE fetch/upsert → no tombstone path can run for them); display gates
  untouched; the compliance-blocked skip semantics (Gates 1/2/3) are not modified, only mirrored.
- Fail-closed preserved: the existence probe lives INSIDE the try — if the probe itself fails
  (DB hiccup), control falls to catch → ok:false → watermark halts (never advance past unknown).

## 4. Fix approach
Ghost → **resolved skip** (Maya's verbatim scope): `ok:true` so the keyset watermark advances past
it; the ghost re-surfaces only when its `PhotosChangeTimestamp` bumps (same re-surface semantics as
compliance-blocked). Ghost count + ids (cap 20) recorded in the run result → cron JSON → runtime
logs. Valid listings behind the ghost keep processing (loop already continues; now the watermark
advances too).

**Residual + Codex #382 finding (verified, accepted, closure assigned):** Codex flagged that a
ghost later imported by feed-reconcile lands with its PCT already behind the advanced cursor → no
`listing_media` until Trestle bumps PCT. Verified assessment: (a) TODAY the scenario cannot begin —
feed-reconcile orphan-create uses `$expand=Media` which Trestle 400s (`fetch.ts:32-43`; deep-review
L13), so ghosts are never imported at all (that import failure IS the upstream source of this
freeze); (b) verifying the claim exposed that Phase-1 #6 as-specced (drop `$expand`, create without
media) would make Codex's scenario real — imported ex-ghosts photoless in BOTH layers. **Closure
baked into Phase-1 plan item #6 (amended): on orphan-create, the reconcile route must also arrange
media for the created listing** (fetch post-create or anchor for media-sync pickup). Skipped-ghost
ids stay recoverable: result counters → cron JSON → runtime logs, plus the known set (3 ids)
recorded here; ghost ids feed the Phase-3 targeted re-sync inventory. The implicit alternative —
keep halting the cursor on ghosts — preserves the production livelock and is rejected.

## 5. Step log
| # | Step | Artifact | Result |
|---|------|----------|--------|
| 1 | RED test: ghost at batch head freezes watermark; valid listing behind it processes but cursor never advances | `media-sync-rc5.test.ts` | RED: 3 failed (watermark stayed at prior cursor `1100000000`; `ghost_listings_skipped` undefined; ghost still fetched/summarized) | ✅ RED |
| 2 | fix: existence probe + resolved skip + ghost counters | `lib/idx/media-sync.ts` | diff (+~45 LOC, Phase-1 loop + result fields only) | ✅ |
| 3 | GREEN | `jest media-sync-rc5` | **5/5** (advance-past-ghost · valid-behind-ghost processes · counters/ids · zero ghost writes · probe-failure fail-closed halt) | ✅ GREEN |
| 4 | regression: full lib/idx suites (watermark/orchestration/upsert/r2/rc1/rc3/cron/summary) | jest | **23 suites, 298/298** (orchestration mock gained `listing.findUnique` default-exists) | ✅ |
| 5 | harness | B0 chain | type-check 0 · test:runtime **2099/2099** · ucba 46/46 0 regr · rls 0 err 0 unknown · compliance-check 92/0 · idx:validate 1 known critical (CI3, unchanged) | ✅ |
| 6 | gate:micro / gate:macro / tristle / Codex | — | §6/§7 |
| 7 | merge + deploy | — | (post-merge) |
| 8 | runtime verification | cursor moves · listing_media count rises · EMPTY shrinks | (post-deploy, §F) |

## 6. Gate results
| Gate | Result |
|---|---|
| B2 proof (§F) | behavioral RED→GREEN (5/5) + post-deploy cursor-movement proof (pending, §10) |
| C1 gate:micro | PASS (4 files; test-first satisfied) |
| C2 gate:macro | PASS (declared radius matched; search/idx domain → tristle routed) |
| tristle | **PASS, no corrections** — gates 1/2/3 run before ghost probe (verified byte-identical); ghost gets zero writes (FK-reinforced); fail-closed probe-failure halt proven by test 5; advancing past a ghost is REBNY-safe (nothing renders without a listings row); result fields additive (cron route spreads result, zero route changes); search/field-map surface N/A |

## 7. Sign-offs
- **gate:micro PASS · gate:macro PASS** (2026-06-10, committed diff `d68f6a1d`).
- **tristle-rebny-compliance: PASS, no required corrections** (full verdict in §6; two pre-existing
  main-baseline findings noted — idx:validate CI3 critical + crm-smoke 11 — neither caused by nor
  blocking this PR, both already tracked).
- **Codex:** on PR open. · **Maya merge:** pending — **MERGE GATE: quantify the `crm:`-row tombstone
  hazard first** (Phase-1 plan item #2): unfreezing the cursor lets the catch-up drain fire
  `tombstoneVanished` over ~11,822 listings; if ANY active `media_key LIKE 'crm:%'` rows exist on
  RLS-synced listings, the `crm:` tombstone guard must merge BEFORE RC5 deploys. Read-only check
  script ready at `scripts/__rc5-crm-tombstone-hazard-check.mjs` (untracked; operator-run — the
  agent permission layer correctly blocked Claude from reading .env.local).

## 8. Trace-back / reproduce
`git checkout main` → run `media-sync-rc5.test.ts` → RED (watermark null with ghost at head);
apply fix → 5/5 GREEN; `media-sync-watermark` + `media-sync-orchestration` suites stay green.

## 9. Permanent regression guard
`media-sync-rc5.test.ts`: ghost at head → watermark advances to the last valid listing; ghost ids
recorded; probe-failure → fail-closed halt (ok:false) preserved; ghost gets zero writes.

## 10. Post-deploy verification plan (Maya's final proof bar, 2026-06-10 — supersedes the draft)
1. **skipped ghost ids** captured from runtime logs (`ghost_listing_ids` in the media-sync cron
   JSON) — recorded in this Trace Record;
2. **ghost-id fate check:** whether those ghost ids later exist in `listings` (feed-reconcile
   import) — read-only;
3. **stranding check:** whether any skipped ghost later exists locally WITHOUT `listing_media`
   (the Codex scenario) — read-only; any hit feeds the Phase-3 targeted re-sync inventory and
   raises the priority of Phase-1 Correction 6's hard checklist item;
4. **cursor advanced:** `MediaSyncState.last_photos_change`/`last_listing_key` move past the
   ghost cluster within 2-3 cron firings;
5. **`listing_media` row count increased** vs the 2026-06-10 frozen baseline (~90/day) — and
   valid listings behind the ghosts processed media;
6. **no CRM media tombstoned:** active `crm:` rows unchanged (pre-deploy baseline: 10 active rows
   on 1 non-RLS listing — operator hazard check 2026-06-10, Q2=0) — operator re-runs
   `scripts/__rc5-crm-tombstone-hazard-check.mjs` to confirm;
7. **zero R2 deletes and zero backfill:** no delete callers exist in the deployed code path
   (static), media-backfill remains unscheduled, no manual cron fired — confirmed via runtime
   logs + cron config unchanged.

Supplemental trend (not a gate): EMPTY/new-listing starvation begins decreasing (baseline 10,674;
full drain ETA ~2.5-3 days at the measured healthy rate ~4,500 listings/day). Featured/search
photo coverage improvement follows the drain — Featured stays at its 2-card floor until coverage
returns or the operator price-desc config change is applied (separate operator lane).

**Scope statement (Maya's merge condition):** #382 is a **P0 cursor-unfreeze patch ONLY** — not a
complete media fix. The chronic architecture remains open per the §0-pre preamble; Phase-1
Correction 6 carries the hard ghost-import checklist item.
