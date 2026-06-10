# Correction Trace Record — `RC5` ghost-listing cursor freeze

> **Status: IN-PR.** Maya GO ("Proceed with the RC1 cursor-freeze fix as P0 after #381 proof/merge"
> + detailed scope, 2026-06-10). Media-program correction #4 (after RC3 #379 SETTLED). **Code fix
> only — NO schema, NO DB writes at fix time, NO R2 cleanup/deletes, NO backfill, NO manual cron,
> NO tombstoning of valid media.** Fixes the production P0 found by the 2026-06-10 media-pipeline
> diagnosis (`docs/audits/media-pipeline-error-diagnosis-2026-06-10.md`).

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
advances too). Residual (documented, accepted): if a ghost is later imported WITHOUT a PCT bump,
its media waits for the next full/backfill pass — the import-side fix is Phase-1 plan item 6
(feed-reconcile `$expand=Media` verification).

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
| B2 proof (§F) | behavioral RED→GREEN + post-deploy cursor-movement proof (pending) |
| C1 gate:micro | pending |
| C2 gate:macro | pending |
| tristle | pending |

## 7. Sign-offs
- pending (PR open → Codex; tristle on diff; Maya merge).

## 8. Trace-back / reproduce
`git checkout main` → run `media-sync-rc5.test.ts` → RED (watermark null with ghost at head);
apply fix → 5/5 GREEN; `media-sync-watermark` + `media-sync-orchestration` suites stay green.

## 9. Permanent regression guard
`media-sync-rc5.test.ts`: ghost at head → watermark advances to the last valid listing; ghost ids
recorded; probe-failure → fail-closed halt (ok:false) preserved; ghost gets zero writes.

## 10. Post-deploy verification plan (Maya's verbatim proof bar)
1. production deploy READY;
2. `MediaSyncState.last_photos_change`/`last_listing_key` move within 2-3 cron firings (read-only);
3. `listing_media` row count increases vs the 2026-06-10 baseline (90/day frozen rate);
4. EMPTY/new-listing starvation begins decreasing (ops:health `empty (no image)` trend, baseline
   10,674) — full drain ETA ~2.5-3 days at the measured healthy rate (~4,500 listings/day).
