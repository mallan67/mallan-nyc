# Correction Trace Record — `P1C2` crm: media guards (tombstoneVanished + media-order)

> **Status: IN-PR.** Phase-1 media loop-closure Correction 2 (plan:
> `docs/superpowers/plans/2026-06-10-phase1-media-loop-closures-plan.md`). Maya queue position 3
> ("crm: guards … right after #382"). **Code fix only — NO schema, NO DB writes at fix time, NO
> R2 ops, NO backfill, NO cron/env/.github, NO public/crm frontend.** PR merges only AFTER the
> RC5 (#382) post-deploy proof completes (one write/merge lane).

## 0-pre. Mandatory media-PR preamble (incident 2026-05-21 §0.5)
1. **Incident document read:** re-read 2026-06-10/11 before this correction.
2. **Chronic root cause addressed:** the multi-writer namespace-boundary defect class (deep-review
   loops **L6 + L7**) — two writers crossing the `crm:` / Trestle key namespace boundary that
   `lib/media/crm-media.ts:2-7` promises never collides. Not one of the original §4 RC numbers; a
   Phase-1 loop closure. (Correction-series naming: P1C2; no incident-§4 collision.)
3. **Remaining OPEN after this PR:** Phase-1 Corrections 1 (reset-sync), 3 (floorplan classifiers),
   4 (MT bump — NOTE: the media-order route's `modification_timestamp` bump at `route.ts:70-73` is
   Correction 4's scope, intentionally NOT touched here), 5 (table-aware ops-health), 6
   (feed-reconcile + HARD ghost-import checklist item) · §4 RC5 held migrations · §4 RC6
   observability · ALL data cleaning.
4. **Cannot reintroduce the four canonical regressions:**
   - **`Listing.media` stomping:** zero JSON writes in the diff (table where-clauses + route
     partition only).
   - **cursor deadlock:** no cursor/watermark code touched; `pickKeysetWatermark`/Phase-1 loop
     byte-identical.
   - **retry purgatory:** no retry logic touched; RC3 parking untouched.
   - **JSON/table/R2 mismatch:** the guards make the table STRICTER about namespace ownership —
     Trestle tombstones can no longer delete CRM rows, CRM reorder can no longer renumber Trestle
     rows; neither layer's truth crosses into the other's. No JSON/R2 writes.
5. **Cleanup gate:** NO JSON/R2/data cleanup until the writer loops are closed.

## 1. Defect — the BEFORE (proven in code; production hazard currently 0 by luck of timing)
- **L6:** `upsertListingMedia` `tombstoneVanished` (`lib/idx/media-sync.ts:595-614`) tombstones
  "every active row not in the complete Trestle set" — with NO `crm:` exclusion in EITHER branch
  (the empty-input branch tombstones literally everything). A CRM supplemental photo on any
  Trestle-synced listing is absent from every Trestle media set BY DESIGN → first complete sync of
  that listing deletes it. Contradicts the `crm-media.ts:2-7` namespace contract. Operator hazard
  check 2026-06-10: Q2=0 active `crm:` rows on RLS listings TODAY (10 active rows live on 1
  exclusive) — zero by timing, not by code.
- **L7:** the media-order route (`app/api/crm/listings/[id]/media-order/route.ts:61-67`) renumbers
  ANY `media_key` on the listing, including Trestle feed rows — whose `order` media-sync rewrites
  from the feed on the next complete set → order ping-pong, agent edits silently reverted (and
  agent edits fighting feed truth).
- The explicit-delete branch (`:583-593`) is inherently safe: `media_key IN (Trestle keys)` cannot
  match `crm:`-prefixed keys (Trestle never emits them) — left unchanged, regression-guarded.

## 2. Pre-registered blast radius
- **WILL touch:** `lib/idx/media-sync.ts` (tombstoneVanished where-branches only — add
  `NOT: { media_key: { startsWith: CRM_MEDIA_KEY_PREFIX } }` to both; import the constant) ·
  `app/api/crm/listings/[id]/media-order/route.ts` (partition `ordered_media_ids` via
  `isCrmMediaKey`; only `crm:` keys get order writes; Trestle keys skipped + reported in the
  response + audit payload) · new tests `lib/idx/__tests__/media-sync-crm-guard.test.ts` +
  `tests/runtime/crm-media-order-guard.test.ts` · this Trace Record.
- **MUST NOT touch:** explicit-delete branch semantics · cursor/watermark · RC3 parking ·
  `modification_timestamp` bump (Correction 4) · schema · JSON column · R2 · public/crm/** ·
  cron/env/.github.

## 3. Compliance pre-read (§D)
- COMPLIANCE-CANONICAL-INDEX §8 (Media): CRM-owned media is Mallan-exclusive content, not RLS feed
  data — protecting it from feed tombstones has no display-gate implication. Trestle rows keep
  full tombstone semantics (deleted-at-source still disappears — REBNY rule preserved). Reorder
  guard does not change what displays, only which writer owns `order` per namespace.

## 4. Fix approach
Namespace ownership, enforced at the write site: Trestle's tombstone authority stops at the `crm:`
prefix boundary; CRM's reorder authority starts at it. Both guards are pure where-clause /
partition changes — no new state, no schema.

## 5. Step log
| # | Step | Artifact | Result |
|---|---|---|---|
| 1 | RED: tombstoneVanished where-shapes lack crm: exclusion (both branches); route renumbers Trestle keys | `media-sync-crm-guard.test.ts` + `crm-media-order-guard.test.ts` | RED: 5 failed / 1 passed (the pass = explicit-delete regression guard, by design) | ✅ RED |
| 2 | fix: NOT-startsWith crm: in both tombstoneVanished branches · isCrmMediaKey partition + skipped-keys reporting in media-order | 2 files | diff | ✅ |
| 3 | GREEN + regression | jest | guard tests 6/6 · lib/idx **24 suites 304/304** (3 upsert where-shape assertions updated to the new contract) | ✅ GREEN |
| 4 | harness | B0 chain | type-check 0 · test:runtime **2102/2102** · ucba 0 regr · rls 0 err · compliance-check 92/0 · idx 1 known critical (CI3, unchanged) | ✅ |
| 5 | gate:micro/macro · tristle · Codex | — | §6/§7 |
| 6 | merge (AFTER RC5 proof) + post-deploy spot-check | — | (pending) |

## 6. Gate results
(pending)

## 7. Sign-offs
(pending — PR opened, merge HELD behind RC5 post-deploy proof per the single write/merge lane)
