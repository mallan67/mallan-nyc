# Correction Trace Record — `RC2` idx-sync media-stomp fix

> **Status: IN-PR.** Approved next correction (Maya: "Approved next correction: Media RC2 — idx-sync
> media-stomp fix"). Code fix only — no DB writes, no migration, no env/cron, no R2, no backfill, no
> denorm, no canonicalization. First correction of the media root-cause program (RC2 → RC1 cursor →
> coverage re-pull → denorm → detail tabs → search canon). Ledger row stays its status until merge.

## 0. Header
- **ID / Ledger row:** RC2 (media root-cause program, correction #1; relates to ledger M2)
- **Severity / Compliance tie:** P1 · media display (REBNY media rules) — non-destructive (preserves media)
- **Owning phase:** media program · **Maya GO:** given
- **Status:** IN-PR

## 1. Defect — the BEFORE proof
- The incremental idx-sync fetches Property **without** expanded Media (`lib/idx/sync.ts:176`
  `useExpandMedia = false`; same in `syncAgentHistory` `:1062`), so `mapped.media` is `[]`.
- The per-record `prisma.listing.upsert` **UPDATE** branch writes `media: mapped.media`
  unconditionally (`:310` in `syncListings`, `:1141` in `syncAgentHistory`) → it **overwrites
  existing `listings.media` with `[]`** on every incremental run. (A separate batch-media block at
  `:412` re-fills media, but the per-record write is destructive and the refill is conditional.)
- Reframing (Maya): media is **never permanently lost** — Cotality is the source and can be re-pulled.
  The real defect is the app **continuously writing empty local state** so public pages render garbage.
- **RED proof:** a behavioral unit test on the extracted media-write decision: when media was NOT
  fetched, the update patch must omit `media` (preserve existing) — the pre-fix behavior writes it
  → test fails. (Captured in §5.) §F-compliant (behavioral, not grep).

## 2. Pre-registered blast radius (the "no dark work" contract)
- **WILL touch (direct):**
  - `lib/idx/sync.ts` — (a) `mediaUpdatePatch(media, mediaWasFetched)` helper wired into the **UPDATE**
    branch of both `syncListings` and `syncAgentHistory` (omit `media` when not fetched); (b) **Codex
    #375:** `resolveBatchMediaWrites(queriedKeys, mediaByKey, keyToIdMap)` helper wired into both
    **batch-media write loops** so a key the batch SUCCESSFULLY queried but that returned no media is
    cleared to `[]` (deleted-at-source photos), distinguishing "batch fetched and empty" (clear) from
    "not fetched" (preserve). The Media **query** path (`ResourceRecordKey`/`/odata/Media`/filters) is
    unchanged — only the write loop.
  - `tests/runtime/idx-sync-media-stomp.test.ts` — behavioral tests for both helpers.
- **Transitive reach / consumers:** the per-record listing UPDATE media write + the batch-media write
  loops. `listing_media`, R2, `listingSearchProjection`, and the CREATE branch are **unchanged**.
- **Compliance surfaces:** media display — preserves media on not-fetched, clears confirmed-deleted;
  no gate/display/Media-API-query change.
- **Coupled ledger rows:** RC1 (cursor), M3 (classifier), M4 (backfill) — RC2 stops future loss; it
  does NOT restore already-empty rows (that is the HELD backfill) — sequenced after.
- **MUST NOT touch:** prisma schema/migrations · env/deploy/cron · R2 · the batch-media block ·
  `listing_media` · denorm columns · the CREATE branch · search/dedup · PR-Foundation.

## 3. Compliance pre-read (§D)
- Read `COMPLIANCE-CANONICAL-INDEX.md` §8 (Media/Trestle Media API rules) + §IDX. The fix is
  **non-destructive** (preserves existing media), changes no display gate, no `ResourceRecordKey`
  query, no `$expand`/`$select`. Fail-closed (§E): no rule ambiguity here.

## 4. Fix approach
Gate the per-record UPDATE media write on "media was actually fetched" (`useExpandMedia`). When
false, **omit** `media` from the update so existing `listings.media` is preserved; the batch-media
path continues to own media refills. CREATE unchanged (a new listing has no media to preserve).

## 5. Step log
| # | Step | Command / file | Artifact | Result |
|---|------|----------------|----------|--------|
| 1 | helper + wire both UPDATE sites (`...mediaUpdatePatch(mapped.media, useExpandMedia)`) | `lib/idx/sync.ts:34-42, :332, :1163` | diff | ✅ |
| 2 | failing test (not-fetched must OMIT media) | `tests/runtime/idx-sync-media-stomp.test.ts` | RED: 2 cases `'media' in patch` Expected false / Received **true** | ✅ RED |
| 3 | fix helper → conditional on `mediaWasFetched` | `lib/idx/sync.ts:34-42` | diff | ✅ |
| 4 | tests GREEN | `jest idx-sync-media-stomp` | **7/7 pass** | ✅ GREEN |
| 5 | full harness | B0 chain | type-check 0 · idx-sync existing **79/79** · test:runtime **2099/2099** · ucba 0 regr · rls 0 err · idx 1 known critical (unchanged) · compliance-check 92/0 · build exit 0 | ✅ |
| 6 | gate:micro / gate:macro | runners | micro OK (test-first) · macro OK (idx domain → tristle; declared radius reconciled) | ✅ |
| 7 | tristle-rebny-compliance (idx/§D gate) | review | **VERDICT: PASS** — non-destructive; gates + §2.05 + Media-API path + CREATE + batch-media all unchanged | ✅ |
| 8 | actual-diff vs §2 radius | `git diff --name-status main...HEAD` | `lib/idx/sync.ts` + `idx-sync-media-stomp.test.ts` + this record — **within declared radius** | ✅ |
| 9 | commit / PR | branch `fix/rc2-idx-sync-media-stomp` | PR opened (link below); **awaiting merge** | ⏳ |

## 6. Gate results
| Gate | Result |
|---|---|
| B0 harness | green (counts above) |
| B1 compliance chain | ucba 0 regr · rls 0 err · idx 1 known critical (unchanged) · compliance-check 92/0 |
| B2 proof (§F) | behavioral RED→GREEN on `mediaUpdatePatch` (no grep RED) |
| C1 gate:micro | PASS (test-first) |
| C2 gate:macro | PASS (idx domain mapped; blast-radius reconciled) |
| tristle-rebny-compliance | **PASS** |

## 7. Sign-offs
- gate:micro / gate:macro: **PASS** · **tristle-rebny-compliance: PASS** (RC2) · **tristle re-PASS**
  (Codex #375 batch-clear increment — query path unchanged, clears `[]` only on confirmed-deleted
  behind the `res.ok` gate) · Maya merge: pending.

## 8. Trace-back / reproduce
`git checkout main` → run the not-fetched helper test → RED (pre-fix unconditional `media: mapped.media`); apply the fix commit → `jest idx-sync-media-stomp` 7/7 GREEN + `test:runtime` 2099/2099.

## 9. Permanent regression guard
`tests/runtime/idx-sync-media-stomp.test.ts` — not-fetched ⇒ `media` omitted from the update patch.

## 10. Coupled follow-ups (flagged by tristle, out of RC2 scope — media program)
- **Projection dual-write:** `lib/idx/sync.ts:380, :1206` still passes `[]` media to the search
  projection on incremental runs (pre-existing on `main`, NOT in this diff; the projection reader
  swap PR-5B is HELD so it is not a live read path today). Fold into the projection-media follow-up.
- Program sequence after RC2: **RC1 cursor → coverage re-pull → denorm → detail tabs → search canon.**
