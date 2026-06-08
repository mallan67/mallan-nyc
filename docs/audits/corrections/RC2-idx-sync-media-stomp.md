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
  - `lib/idx/sync.ts` — add a pure `mediaUpdatePatch(media, mediaWasFetched)` helper; wire it into
    the **UPDATE** branch of both `syncListings` and `syncAgentHistory` (omit `media` when not fetched).
  - `tests/runtime/idx-sync-media-stomp.test.ts` — behavioral tests for the helper.
- **Transitive reach / consumers:** the per-record listing UPDATE media write only. The CREATE branch,
  the batch-media block (`:412` `updateMany`), `listing_media`, R2, and `listingSearchProjection` are
  **unchanged**.
- **Compliance surfaces:** media display (preserves media; no gate/display/Media-API-query change).
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

## 5. Step log (fills during execution)
| # | Step | Command / file | Artifact | Result |
|---|------|----------------|----------|--------|
| 1 | extract helper preserving current behavior + wire sites | `lib/idx/sync.ts` | diff | ▢ |
| 2 | failing test (not-fetched must omit media) | `tests/runtime/idx-sync-media-stomp.test.ts` | RED output | ▢ |
| 3 | fix helper → conditional on mediaWasFetched | `lib/idx/sync.ts` | diff | ▢ |
| 4 | tests GREEN | `jest idx-sync-media-stomp` | output | ▢ |
| 5 | full harness | B0 chain | counts | ▢ |
| 6 | gate:micro / gate:macro | runners | output | ▢ |
| 7 | rebny-search-compliance / tristle (idx domain) | review | verdict | ▢ |
| 8 | actual-diff vs §2 radius | `git diff --name-only` | list | ▢ |
| 9 | commit / PR | SHA, PR# | links | ▢ |

## 6. Gate results — ▢
## 7. Sign-offs — gate:micro/macro · idx-domain review · Maya merge — ▢
## 8. Trace-back — `git checkout main` → helper omits-on-not-fetched test RED ; fix → GREEN — ▢
## 9. Permanent regression guard — `tests/runtime/idx-sync-media-stomp.test.ts` (not-fetched ⇒ no media write) — ▢
