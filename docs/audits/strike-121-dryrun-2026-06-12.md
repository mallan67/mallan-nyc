# Strike-121 DRY-RUN — deleted-at-source photos in legacy `listings.media` JSON — 2026-06-12

> ## 🛑 MAYA DIRECTIVE 2026-06-12: THE ORIGINAL 121-PHOTO STRIKE IS CANCELLED AS SCOPED — DO NOT EXECUTE IT
> Per this dry-run's own live-source evidence (§0): **142 of 160 items are wrong tombstones →
> resurrection/re-sync (likely via the 366-key plan), NOT deletion. Only the 10 genuinely
> deleted-at-source items (2 listings) remain strike-eligible.** 8 SL-0004 Mallan-exclusive items
> are excluded from Trestle cleanup. The 3 potential card-blanking listings move to resurrection.
> Post-C6 cleanup order (each step still separately Maya-gated): **1) resurrect/re-sync the 142
> wrong tombstones → 2) strike the 10 → 3) complete the 366-key re-sync → 4) re-evaluate M4 →
> 5) R2 orphan cleanup last.** Canonical copy of this order:
> `docs/superpowers/plans/2026-06-10-phase1-media-loop-closures-plan.md` (Amendment 2026-06-12).

> ## ⛔ BLOCKED until C6 settlement unlocks cleanup
> **Status: DRY-RUN / EVIDENCE PACKAGE ONLY. NO DB writes performed. NO R2 changes. NO deletions.**
> Every artifact referenced in this document is marked **BLOCKED until C6 settlement unlocks cleanup**.
> **DO NOT COMMIT this file** (Maya directive — stays untracked alongside the probe scripts).
>
> **DB:** canonical prod only — Neon `hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2` / branch `main`. Both probes host-fail-closed-guarded; sessions forced `default_transaction_read_only = on`; SELECT-only.
> **Probe scripts (untracked, `scripts/__` throwaway pattern, DO NOT COMMIT):**
> - `scripts/__strike-dryrun-2026-06-12.mjs` (+ `….out`) — fresh DB-side detection + cross-dependency proofs
> - `scripts/__strike-dryrun-2026-06-12-live.mjs` (+ `…-live.out`) — live Cotality Media cross-check (read-only GETs)
> - `scripts/__strike-dryrun-2026-06-12-evidence.json` — machine-readable per-item / per-listing package
> - `scripts/__strike-dryrun-2026-06-12-live-evidence.json` — per-item live-source verdicts
> **Baseline:** `docs/audits/media-system-deep-review-data-2026-06-10.md` §2.2 (26 listings / 121 items / 20 IDX-displayable).
> Detection identity logic is byte-identical to the 06-10 probe (`mediaIdentity` = `/Media/Property/{KIND}/{mediaId}/{seq}`, token-rotation-proof), so counts are directly comparable.

---

## 0. Executive summary — the strike premise is now ~94% INVALIDATED by live-source proof

| Question | Answer |
|---|---|
| Fresh leak count (JSON item matches a tombstoned `listing_media` row with no active row) | **30 listings / 160 items (26 IDX-displayable / 139 items)** — UP from 26/121/20. The drain (RC1/RC3, running since 06-09) grew total tombstoned rows from 225 → **7,210**, adding new identity matches. |
| Live Cotality verdict on those 160 items | **142 items are STILL LIVE at source** (matched by `MediaKey` — Trestle's PK — in the listing's complete paginated Media set). **10 items CONFIRMED deleted-at-source.** **8 items are SL-0004 (Mallan exclusive, non-Trestle — REBNY removal authority does not apply).** 0 incomplete. |
| What that means | **The 142 are NOT compliance leaks — they are wrong tombstones** (legacy Cp4 3×-404 soft-deletes on token-rotated URLs; 149/160 evidence rows carry the `r2_attempts ≥ 3` signature). Striking them would delete photos REBNY still serves. Correct remedy = row resurrection via targeted re-sync, not JSON surgery. |
| Actual strike-eligible set | **10 items / 2 listings**: `RLS11030439` (Active, IDX-displayable, 3 items — the only live compliance exposure) + `RLS20082431` (Withdrawn, gated off IDX, 7 of its 8 items). |
| Cross-dependency proof | **0** of 147,595 active rows on displayable listings share a leaked identity/URL. **3** `primary_photo_url` hits — all resolve safely (see §4.2). |
| Only-photo flags | The three original flags (`RLS20003771`, `RLS20052270`, `RLS20077743`) are all **STILL-LIVE-at-source** cases → no longer strike candidates, no card-blanking decision needed. **Zero only-photo conflicts remain in the eligible set.** |

**Counts are volatile** (121 → 160 in 2 days while the drain runs; the drain itself is also *curing* leaks by re-creating active rows). The executor MUST re-run both probes immediately before any approved strike and act only on the fresh intersection.

---

## 1. Fresh detection (S1–S3, `scripts/__strike-dryrun-2026-06-12.out`)

Method identical to the 06-10 L1/L2 probe: per listing with tombstoned rows, every JSON media item whose normalized identity ∈ deleted-row identities AND ∉ active-row identities is a leak. Per-item evidence rows (full URL, identity, tombstone row `id`/`media_key`/`status='deleted'`/`tombstoned_at`/`r2_attempts`/`r2_key`, provenance class, compliance reason) are in `scripts/__strike-dryrun-2026-06-12-evidence.json → per_item`.

```text
listings_with_tombstoned_rows = 633   (was 41 on 06-10 — drain effect; deleted rows 225 → 7,210)
leak_listings                 = 30    (was 26)
leak_items                    = 160   (was 121)
leak_idx_displayable          = 26 listings / 139 items   (was 20)
```

Tombstone provenance split (per-row evidence):
- **149/160** rows: `r2_attempts ≥ 3` → legacy Cp4 404-strike soft-delete signature (pre-RC3; RC3 #379 now parks instead of deleting). These were tombstoned because the *stored rotated URL* 404'd — not because REBNY removed the photo.
- 7/160: `r2_attempts ∈ {0}`, 4/160 `null` — mixed; includes the genuine 06-09 drain tombstones.
- Tombstone dates: ~85 items May-era (404-strike era), ~75 items 06-09→06-12 (RC1 complete-pagination drain era).

## 2. Live-source verification (requirement 2) — the decisive proof leg

`scripts/__strike-dryrun-2026-06-12-live.mjs`: for each of the 30 listings, fetched the **complete** current Trestle Media set (`$filter=ResourceRecordKey eq '<ListingKey>'`, full `@odata.nextLink` pagination — same completeness contract as RC1), then tested each leaked item's tombstone `media_key` and URL identity for membership. Read-only GETs; no cursor touched; no DB writes.

**Method incident (kept for the record, CLAUDE.md §E fail-closed):** the first run filtered Media on the RLS ListingId and returned 0 rows for every listing — which would have *faked* "confirmed deleted" for all 160 items. The `PhotosCount>0 vs 0 source rows` sanity check caught it. Per the Trestle key discipline (`prisma/schema.prisma` ListingMedia header): `Media.ResourceRecordKey = Property.ListingKey` (numeric), NOT ListingId. The rerun resolves ListingKey from the DB per listing (logged in `…-live.out`) and fails closed (`INCOMPLETE`) on unresolved keys or failed pagination.

```text
listings checked = 30 · pagination complete = 29/29 Trestle listings (1 transient HTTP 500 resolved on rerun)
items STILL LIVE at source (by MediaKey)   = 142   ← tombstone WRONG · EXCLUDE from strike · resurrection candidates
items CONFIRMED deleted-at-source          = 10
items non-Trestle (SL-0004) excluded       = 8
items incomplete / unverifiable            = 0
```

Per-item verdicts: `scripts/__strike-dryrun-2026-06-12-live-evidence.json`. If this package ages before C6 settles, the live check re-runs in minutes (operator command in §7).

## 3. The strike-eligible set — 10 items / 2 listings (full evidence)

### 3.1 `RLS11030439` — Active · `idx_display_yn=true` · **the only live compliance exposure**

Drain-era tombstones (2026-06-09T10:15:41Z, `r2_attempts=null` → genuine `tombstoneVanished` complete-pagination proof), live-confirmed absent from source. Source reason: deleted-at-source per complete-pagination tombstone. Compliance reason: REBNY removal authority — photo removed at source (RLS via Cotality IDX Plus); continued IDX display via the JSON fallback is non-compliant.

| JSON idx | identity | tombstone row (`listing_media`) | media_key | tombstoned_at | live verdict |
|---|---|---|---|---|---|
| 16 | `photo-jpeg:1103219484:16` | id=4435, status='deleted', r2_key=`photos/RLS11030439/16.jpg` | 2004228625769 | 2026-06-09T10:15:41Z | CONFIRMED_DELETED_AT_SOURCE |
| 17 | `photo-jpeg:1103219484:17` | id=4436, status='deleted', r2_key=`photos/RLS11030439/17.jpg` | 2004228625768 | 2026-06-09T10:15:41Z | CONFIRMED_DELETED_AT_SOURCE |
| 18 | `photo-jpeg:1103219484:18` | id=4437, status='deleted', r2_key=`photos/RLS11030439/18.jpg` | 2004228625767 | 2026-06-09T10:15:41Z | CONFIRMED_DELETED_AT_SOURCE |

Surgery: JSON 19 items → **16**. Remaining renderables: 15 JSON photo items + 15 active table Photo rows; `primary_photo_url` = seq-1 image, NOT leaked. No only-photo risk. Note: the 3 tombstone rows hold `r2_key`s — **R2 objects are NOT deleted in this strike** (R2 ops separately HELD; they become cleaning-inventory #8 fodder).

### 3.2 `RLS20082431` — Withdrawn · `idx_display_yn=false` · 7 of 8 items

May-era 404-strike tombstones (2026-05-10, `r2_attempts=3`) that the live check now **independently confirms** truly deleted at source (source serves exactly 1 Media row: seq 1). Items: JSON idx 1–7, identities `photo-jpeg:1157026184:2…8`, tombstone rows id 1808–1814, media_keys 2005035213411–16 + 2005035213405 (full rows in evidence JSON). The 8th JSON item (idx 0, seq 1) is **STILL LIVE** at source → EXCLUDED from strike; its tombstone row (and `primary_photo_url`, which points at this same seq-1 image) are resurrection-workstream items. Surgery: JSON 8 → **1**. Not publicly displayable (gated off IDX), so exposure is JSON-fallback-only; still worth striking while we're in there.

### 3.3 Explicitly OUT of strike scope

- **142 STILL-LIVE items across 27 listings** — wrong tombstones. Do NOT strike. Remediation = resurrect/re-sync (§5.4). Includes all 26 IDX-displayable leak listings except `RLS11030439`, and includes `RLS20077743` (the 06-10 audit's "verify first" hunch — confirmed: its tombstone is wrong, the photo is live).
- **SL-0004, 8 items** (`/listings/sl-0004/…-card.webp` upload-route card variants matching deleted rows) — Mallan exclusive, non-Trestle; REBNY removal authority does not apply. Separate Maya decision on exclusive-media hygiene.

## 4. No-active-dependency proofs (requirement 3)

### 4.1 Global active-row scan (S4)
All 147,595 active `listing_media` rows on IDX-displayable listings scanned (both `media_url_original` and `media_url_cached`, exact-URL AND normalized identity): **0 hits** against the 160 leaked identities. No displayable listing's table layer depends on any leaked image.

### 4.2 `primary_photo_url` scan (S5)
All 10,948 non-null `primary_photo_url` values scanned: **3 hits**, all self-referential (the leak listing's own column), none belonging to the eligible-strike identities:
- `RLS20005200` (Active, idx) and `RLS20052270` (Active, idx) → both point at STILL-LIVE images → those listings are excluded from the strike entirely; columns stay valid.
- `RLS20082431` (Withdrawn) → points at its seq-1 image, which is the one item we do NOT strike. Untouched by the surgery.

### 4.3 Only-renderable-photo check
Computed per leak listing (remaining JSON photo items + active table Photo rows + non-leaked `primary_photo_url`): flags fired only for `RLS20003771`, `RLS20052270`, `RLS20077743` — **all three are STILL-LIVE cases and out of strike scope**. Within the eligible set: `RLS11030439` keeps 15+15 renderables; `RLS20082431` keeps 1 JSON item and is not displayable. **No card-blanking decision is forced.**

## 5. ACTION PLAN (not the action) — ⛔ all steps BLOCKED until C6 settlement

### 5.1 Pre-flight (mandatory, same session as the strike)
1. Re-run `node scripts/__strike-dryrun-2026-06-12.mjs` AND `…-live.mjs`; strike set = fresh intersection of (DB leak) ∩ (live CONFIRMED_DELETED_AT_SOURCE). Counts in this doc are 2026-06-12T20:30Z snapshots and WILL drift while the drain runs.
2. Verify Maya approval recorded + C6 settled. Compliance baseline per CLAUDE.md §B before/after.

### 5.2 JSON surgery — per-listing, identity-keyed, md5-guarded
One transaction per listing; executor skeleton (`scripts/__strike-execute-2026-06-12.mjs`, to be written at execution time — parameterized, identity-based so index drift cannot misfire):

```sql
BEGIN;
-- 1. Lock + capture pre-image
SELECT media, md5(media::text) AS pre_md5 FROM listings WHERE listing_id=$1 FOR UPDATE;
-- 2. (JS) recompute offending ordinals from IDENTITIES against the locked JSON;
--    if any identity is absent or new identities appeared → ROLLBACK, re-detect.
--    Append {listing_id, pre_media, pre_md5} to scripts/__strike-preimages-<runts>.json (rollback anchor).
-- 3. Remove ONLY the offending ordinals
UPDATE listings SET media = (
  SELECT COALESCE(jsonb_agg(e.value ORDER BY e.ord), '[]'::jsonb)
  FROM jsonb_array_elements(media) WITH ORDINALITY AS e(value, ord)
  WHERE (e.ord - 1) <> ALL($2::int[])
) WHERE listing_id = $1 AND md5(media::text) = $3;   -- optimistic guard vs concurrent idx-sync write
-- rowcount must be 1, else ROLLBACK (JSON changed underneath → re-detect)
-- 4. Audit event (canonical AuditEvent contract, compliance-index §15)
INSERT INTO audit_events (action, entity_type, entity_id, user_type, changes)
VALUES ('update','listing',$1,'system', jsonb_build_object(
  'field','media','operation','rebny_deleted_at_source_media_strike',
  'reason','C6-settled compliance strike: deleted-at-source media removed from legacy listings.media JSON',
  'removed_identities',$4,'removed_media_keys',$5,'tombstone_lm_ids',$6,
  'json_len_before',$7,'json_len_after',$8,'pre_image_md5',$3,
  'evidence','docs/audits/strike-121-dryrun-2026-06-12.md'));
COMMIT;
```

Planned per-listing before/after (snapshot — recompute at execution): `RLS11030439` 19→16 (remove ordinals 16,17,18; pre-image md5 `4e612c130b113771ec06c15146a71e75`) · `RLS20082431` 8→1 (remove ordinals 1–7; pre-image md5 `a3574c331930cfbe7da3bffbf4112863`).
Deliberately untouched: `listings.updated_at` (raw SQL, no Prisma `@updatedAt`; keeps recency heuristics honest), `photo_count`, `primary_photo_url` (proven non-dependent §4.2), all `listing_media` rows, all R2 objects.

### 5.3 Rollback strategy
- Pre-image file `scripts/__strike-preimages-<runts>.json` (untracked) written BEFORE each UPDATE, inside the lock.
- Rollback = `UPDATE listings SET media=$pre WHERE listing_id=$1 AND md5(media::text)=$post_md5` (guard: only roll back the strike's own write) + a second `audit_events` row (`operation:'rebny_media_strike_rollback'`).
- Post-strike re-sync of these listings is self-healing: Trestle's current set excludes the struck items (live-proven), so an idx-sync JSON rewrite cannot re-introduce them.

### 5.4 Companion workstreams surfaced by this dry-run (separate approvals, NOT part of the strike)
1. **Wrong-tombstone resurrection — 142 items / 27 listings:** tombstoned rows whose media is live at source (Cp4 404-strike artifacts). Remedy = targeted RC1 re-sync of those listing keys (re-creates active rows with fresh tokens; the JSON items then stop being "leaks" by definition). Merges naturally into cleaning-inventory #2/#3 targeted backfill (06-10 audit §6). Backfill/cron = HELD, Maya approval.
2. **SL-0004 exclusive-media hygiene** — 8 stale card-variant JSON items vs deleted upload rows; non-REBNY; Maya decision.
3. **RLS20082431 seq-1 row + primary_photo_url** — still live at source while its row is tombstoned; resurrection candidate (Withdrawn, so low priority).

### 5.5 Verification after strike (proof-first, CLAUDE.md §F)
Re-run detection probe → eligible-set leak count must be 0; live probe → no CONFIRMED item remains in any JSON; spot-probe `RLS11030439` listing page on production (gallery renders 16, none of seq 16–18); `npm run ops:health` + compliance baseline green.

## 6. Maya decision items
1. Approve the **reduced strike**: 10 items / 2 listings (not 121/26 — premise materially changed by live proof).
2. Approve **resurrection re-sync** for the 142 wrong-tombstone items (or fold into the already-proposed #2/#3 targeted backfill).
3. SL-0004: strike its 8 stale JSON items as Mallan-exclusive hygiene, or leave for the M1 reconciliation?
4. Confirm `audit_events` `user_type='system'` (vs an operator-attributed row) for the strike writes.

## 7. Operator commands (read-only; re-runnable anytime)
```bash
node scripts/__strike-dryrun-2026-06-12.mjs        # fresh DB-side detection + dependency proofs (read-only)
node scripts/__strike-dryrun-2026-06-12-live.mjs   # live Cotality cross-check (read-only GETs; needs .env.local creds)
```
Both fail closed on any non-cold-waterfall `DATABASE_URL`. Neither writes to DB or R2.

---
*Dry-run by Claude (Fable 5), 2026-06-12 (~20:0x–20:3xZ). Read-only throughout: host-guarded read-only Neon sessions + read-only Cotality GETs. No production state modified. All artifacts ⛔ BLOCKED until C6 settlement unlocks cleanup. DO NOT COMMIT.*
