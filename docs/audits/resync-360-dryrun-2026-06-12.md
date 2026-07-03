# Targeted media re-sync (~360 keys) — DRY-RUN derivation + mechanism plan — 2026-06-12

> ## 📌 MAYA DIRECTIVE 2026-06-12: this plan is now cleanup step 3 — AND likely the vehicle for step 1
> Revised post-C6 cleanup order: **1) resurrect/re-sync the 142 wrong tombstones** (from
> `docs/audits/strike-121-dryrun-2026-06-12.md` — likely executed THROUGH this re-sync mechanism,
> since a complete per-listing re-fetch re-activates rows whose MediaKeys are live at source) →
> **2) strike the 10 genuinely deleted-at-source items → 3) complete this 366-key re-sync →
> 4) re-evaluate M4 → 5) R2 orphan cleanup last.** At execution, the key derivation must be
> re-run fresh AND unioned with the 142-tombstone listing set. Canonical copy of the order:
> `docs/superpowers/plans/2026-06-10-phase1-media-loop-closures-plan.md` (Amendment 2026-06-12).

> ## 🛑 EXECUTION BLOCKED UNTIL C6 SETTLES
> **Every action in this document is BLOCKED until C6 settlement** (per
> `docs/audits/corrections/P1C6-feed-reconcile-eligible-orphans.md` §9/§9b: settlement is HELD —
> C6 settles only when the nightly runtime counters show the 3 ghosts imported with
> `gated_skipped` violations = 0 and the stranding check clean). Additionally, manual
> cron/backfill/reconciliation runs are HELD per CLAUDE.md §C and require explicit Maya approval.
> **This dry-run performed NO writes, NO backfill, NO R2 changes, NO cron triggers** — read-only
> SELECT against canonical prod (`ep-cold-waterfall-adno3ao2`, host fail-closed guard, session
> `default_transaction_read_only=on`). DO NOT COMMIT this file (Maya's instruction).
>
> **Probe scripts (untracked `scripts/__` pattern, DO NOT COMMIT):**
> `scripts/__resync-dryrun-2026-06-12.mjs` (+ `….out`) · `scripts/__resync-dryrun-2026-06-12-keys.json`
> (full per-key records) · `scripts/__resync-dryrun-2026-06-12-table.md` (per-key table source).
> Probe run 2026-06-12T20:28:40Z. Predecessor set: `docs/audits/media-system-deep-review-data-2026-06-10.md` §1.3/§1.4/§6.

---

## 0. Executive summary (FRESH derivation, 2026-06-12 — membership HAS shifted since 06-10)

| Metric | 2026-06-10 deep review | **2026-06-12 fresh** | Why it moved |
|---|---|---|---|
| Total re-sync set (deduped) | ~360 (203 ∪ 205) | **366** | see below |
| Truncation members (exactly-30 active rows, stored `PhotosCount` > 30) | 152 | **87** | the unfrozen drain + RC1 burst repaired 65 of them |
| Truncation members (active rows < source, source > 30, not exactly 30) | +10 (162 total) | **+16 (103 total)** | drift both ways |
| True hero-divergent (token-rotation-normalized, production-hero comparison) | 205 (201 + 4) | **268 (264 not-in-table + 4 order-shift)** | both-layer set grew 3,265 → 3,995 (drain added table layers to formerly JSON-only listings; the new members carry the legacy `-1.jpg` JSON heroes) |
| Overlap (both reasons) | n/a | **5** | — |
| **Set by reason** | — | **truncation-only 98 · hero-only 263 · both 5 = 366** | — |
| **MED risk (visible public-card hero change possible)** | — | **268** (= every hero-divergent key) | — |
| **LOW risk (additive gallery fill)** | — | **98** | — |
| Drain will fix anyway (PCT ahead of cursor) | — | **54** (31 trunc · 23 hero · 0 both) | cursor has drained to 2026-06-08T17:11:52Z |
| Drain will NEVER fix (PCT behind cursor) | — | **312** (67 trunc · 240 hero · 5 both) | targeted re-sync is the only repair path |
| P1C6b orphan catch-up overlap | — | **0 (structural)** | see §2.2 |
| Estimated net-new `listing_media` rows from full-set re-sync | ~7K (06-10 est.) | **≈1,542** (estimate) | drain already filled much of the gap |

Status mix of the 366: Active 203 · Pending 163 — all inside the drain's status filter, all IDX-displayable.

---

## 1. Fresh derivation method (read-only, rotating-token-aware)

- **Base pull:** all `idx_display_yn = true` listings with ≥1 `status='active'` `listing_media`
  row (10,052 listings — up from ~5.7K on 06-10; the drain has been adding table layers), with
  full active-row aggregates, `listings.media` JSON, `raw_data->>'PhotosCount'`,
  `raw_data->>'PhotosChangeTimestamp'`, and ListingKey
  (`raw_data->>'ListingKey'` with fallback to `listing_media.resource_record_key` — 0 of 366 missing).
- **Truncation:** stored `PhotosCount` > 30 AND (active rows = 30 [Maya's verbatim definition, 87 keys]
  OR active rows < `PhotosCount` [16 additional keys, included since the same legacy-cap drain-gap
  applies — flagged separately in the table via reason naming in the keys JSON]).
  `PhotosCount` here is the **stored** value kept fresh by idx-sync — live-Trestle `PhotosCount`
  verification is an **operator-verifiable** step (§5) per CLAUDE.md §J.4 (no live Cotality call
  was made in this dry-run).
- **Hero divergence:** production-hero comparison exactly per the 06-10 deep review §1.4(b) —
  first photo-classified JSON item (proxy-unwrapped) vs table preferred/first active `Photo` row,
  identity = `/Media/Property/{KIND}/{mediaId}/{seq}` for Cotality URLs (**rotating-token-aware**;
  2,296 token-rotated heroes correctly counted as MATCHES, not divergence), R2 pathname otherwise.
  Divergent = JSON hero identity absent from ALL active table rows (264) or present at a different
  position (4). Dominant pattern unchanged: 252/268 JSON heroes are R2-shaped, 184 of those the
  legacy idx-sync `photos/{id}/-1.jpg` preferred-photo key.
- **Cursor (drain-overlap boundary):** `media_sync_state` read with naive-UTC text cast (node-pg's
  local-tz parse of the naive timestamp columns shifts them +4h otherwise — corrected):
  `last_photos_change = 2026-06-08T17:11:52.213Z`, `last_listing_key = '1159770365'`,
  `last_run_at = 2026-06-12T20:15:55Z`, `last_run_status = ok` — the drain is live and ~4 days
  behind realtime at probe time.

**Freshness caveat:** the drain advances every 15 minutes — membership (especially the 54
drain-reachable keys) keeps shifting. **Re-run `scripts/__resync-dryrun-2026-06-12.mjs` immediately
before any approved execution and use THAT key list, not this snapshot.**

---

## 2. Overlap check (avoid double-work)

### 2.1 Regular drain (media-sync cron, RC1 keyset cursor)
The drain only revisits a listing when `(PhotosChangeTimestamp, ListingKey)` sorts AFTER the
cursor (`buildPropertyQuery`, `lib/idx/media-sync.ts:1385-1416`) and the listing's status is in
{Active, ActiveUnderContract, ComingSoon, Pending} (all 366 qualify on status).

| Bucket | Keys | Detail |
|---|---|---|
| **Drain WILL fix (PCT > cursor)** — skip in targeted run if still true at execution | **54** | 31 truncation · 23 hero-divergent · 0 both |
| **Drain will NEVER fix (PCT behind cursor)** — the targeted set proper | **312** | 67 truncation · 240 hero-divergent · 5 both (245 MED · 67 LOW) |

- Hero divergence IS fixed by any complete re-fetch (drain or targeted): the RC1 path re-fetches
  the complete set including the `PreferredPhotoYN` item and `updateListingMediaSummary` recomputes
  `primary_photo_url` — so the 23 drain-reachable hero keys need nothing manual.
- Truncated listings with PCT behind the cursor are **proven unreachable by the drain** — their
  photos haven't changed at source since before the cursor watermark, so no future incremental
  pass selects them. The 06-10 finding stands; the fresh count is 67 (+5 both, +240 hero) = 312.
- Note the drain repaired 65 of the original 152 exactly-30 listings in 2 days — those entered the
  window because their PCT bumped at source, not because the drain sweeps backward. Do not
  extrapolate further self-healing for the PCT-behind 312.

### 2.2 P1C6b orphan catch-up
**Overlap = 0, structurally.** The C6b chunked catch-up (`lib/idx/orphan-chunk.ts`,
`app/api/cron/feed-reconcile/route.ts`) imports Trestle-eligible listings that have **NO local
`listings` row** (the 1,361 Pending orphans). Every key in this set, by construction, HAS a local
row AND active `listing_media` rows (the base pull requires both). No key can be in both
populations; C6b will not touch any of the 366, and this re-sync will not touch any orphan.

---

## 3. Risk classes

| Class | Keys | Definition / what the operator should expect |
|---|---|---|
| **LOW** | **98** | Truncation-only: additive gallery fill (detail page gains up to ~81 photos). Hero expected stable (current hero is preferred/min-order and remains so). Caveat: `tombstoneVanished:true` may also remove rows that vanished at source — correct, compliance-positive behavior, but means "additive" is the expectation, not a guarantee. |
| **MED** | **268** | Any hero-divergent key (263 hero-only + 5 both): the complete re-fetch + summary recompute may change `primary_photo_url` → **visible hero change on the public card**. Expected and desired (card/detail unification), but it is a user-visible production change — count and verify a sample post-run. 245 of the 268 are in the PCT-behind bucket. |

No HIGH class exists in this set: no compliance gates are bypassed (the mechanism re-checks gates
per listing, §4), no deletions beyond source-proven tombstones, no R2 objects deleted.

---

## 4. MECHANISM plan — NOT RUN, BLOCKED until C6 settlement + explicit Maya approval

### 4.1 Why the RC1-hardened per-listing path is safe here

The exact production path, consumed as-is from `lib/idx/media-sync.ts` (no modification needed):

1. **`defaultFetchMedia(resourceRecordKey)`** (`lib/idx/media-sync.ts:1495-1514`) — OData
   `Media?$filter=ResourceRecordKey eq '<ListingKey>'`, `$orderby=Order asc`,
   `$top=DEFAULT_MEDIA_PAGE_SIZE=200` (line 1330 — a PAGE size, not a cap), assembled via
   **`paginateMedia`** (lines 1451-1472) which follows `@odata.nextLink` to exhaustion and returns
   `complete:false` on any failed page or >50 pages. `defaultFetchMedia` **THROWS**
   (`"Media pagination incomplete for ResourceRecordKey=…"`, lines 1510-1512) on incomplete —
   so a successful return **guarantees the COMPLETE current media set**.
2. **`upsertListingMedia(listingId, rows, { photosChangeTsSnapshot, tombstoneVanished: true })`**
   (lines 479-628) — `tombstoneVanished:true` is **SAFE here precisely because of the throw in
   step 1**: the option's contract (lines 416-425) requires the caller to "guarantee `mediaRows`
   represents the COMPLETE current Trestle media set", and the throw makes it impossible to reach
   the tombstone branch (lines 596-625) with a partial set. This is the same pairing
   `runMediaSync` uses (lines 1718-1729). CRM-owned `crm:` rows are excluded from vanish-tombstoning
   by both branches (P1C2, lines 606-619).
3. **`updateListingMediaSummary(listingId)`** (lines 758-788) — recomputes
   `primary_photo_url` / `primary_photo_r2_key` / `photo_count` / `photos_change_timestamp`
   from the now-complete table → this is what lands the hero fix on the public card.
4. **R2 mirroring: NOT performed by this script.** New rows land with `r2_key=NULL`, which puts
   them in the regular cron's Phase-3 backlog (`buildR2BacklogWhere`, lines 862-891) — mirroring
   happens automatically inside the existing budget. Zero manual R2 operations (R2 changes are
   blocked anyway). Until mirrored, new rows serve via `media_url_original` proxy fallback.

### 4.2 Operator-triggered script skeleton (untracked `scripts/__resync-360-execute-2026-06-12.mjs` — to be written ONLY after approval; NOT a cron change)

```text
INPUT  : scripts/__resync-dryrun-2026-06-12-keys.json — RE-DERIVED FRESH at execution time
GUARDS : (a) host fail-closed: DATABASE_URL must contain ep-cold-waterfall-adno3ao2
         (b) refuses to run without --approved-by-maya flag AND a C6-SETTLED acknowledgment flag
         (c) cursor untouched: NEVER calls advanceMediaSyncCursor / touches media_sync_state
             (targeted re-sync is cursor-independent — no watermark interference possible)
         (d) skip-if-drain-fixed: re-check (PCT, ListingKey) vs live cursor per key; skip
             keys the drain has already passed AND whose lm state now matches source count
         (e) per-listing compliance gate re-check BEFORE any write (mirror runMediaSync
             lines 1670-1677 / isPropertyComplianceBlocked): re-fetch the Property row's
             gate fields; gate-blocked or terminal-status listings are SKIPPED + counted
             (same fail-closed posture as the C6 tristle correction)

LOOP   : bounded batches (BATCH_SIZE=10 listings, ≥2s pause between batches — Media-page
         metadata fetches only; binary downloads stay in cron Phase 3, so the Trestle
         480/min media-URL ceiling [lines 1341-1350] is not approached)
  per key:
    1. rows = defaultFetchMedia(listing_key)            // throws ⇒ record failure, NO write, continue
    2. res  = upsertListingMedia(listing_id, rows, { photosChangeTsSnapshot: src_pct,
                                                     tombstoneVanished: true })
    3. heroBefore = primary_photo_url; updateListingMediaSummary(listing_id); heroAfter = …
    4. append per-key audit JSON line: { listing_id, listing_key, reason, risk,
         fetched, inserted, updated, tombstoned, skipped, photo_count_before/after,
         hero_changed: heroBefore!==heroAfter, expected_vs_actual_drift, error? }
COUNTERS (printed + persisted): keys_total / processed / skipped_drain_fixed /
         skipped_gate_blocked / fetch_failed / rows_inserted / rows_updated /
         rows_tombstoned / hero_changed_count (reconcile vs the 268 MED estimate) /
         drift_keys (actual≠expected ⇒ operator eyeballs)
RESUME : idempotent (upsert by media_key) + per-key audit makes the run resumable/re-runnable
ABORT  : hard stop if fetch_failed > 10% of processed, or any write error class repeats 3×
```

Estimated work: 366 keys ≈ 366 Media page fetches (max stored source count in the fresh set is 99
< the 200-row page size ⇒ every key is single-page) · ≈1,542 net-new rows (estimate) ·
≈268 hero recomputes. Runtime minutes, not hours.

### 4.3 Expected rows after re-sync (per key — see §6 table)
`expected_total_rows_after = stored PhotosCount + current non-photo active rows` — an **ESTIMATE**
(stored `PhotosCount` counts photos only; the true set size is only proven by the complete fetch
itself). Per-key drift between expected and actual is a flagged counter, not a failure.

---

## 5. Operator-verifiable items (before execution)

1. **Live `PhotosCount` spot-check (Class B, §J.4):** stored `raw_data->>'PhotosCount'` is a
   proxy. Operator runs a read-only Trestle probe on a sample (e.g. 10 truncation keys, incl.
   RLS20018278-class high counts) to confirm live counts before writes:
   `Property?$filter=ListingId eq '…'&$select=ListingId,PhotosCount,PhotosChangeTimestamp`.
2. **C6 settlement evidence:** nightly feed-reconcile counters per P1C6 §9 (3 ghosts imported,
   `gated_skipped` violations = 0, stranding check clean) — the unlock condition.
3. **Fresh re-derivation:** re-run `scripts/__resync-dryrun-2026-06-12.mjs` at T-0; the 54
   drain-reachable keys (and possibly more by then) drop out.
4. **Post-run verification (proof-first, CLAUDE.md §F):** sample of MED keys checked on production
   card + detail (live URL probe), counter totals vs this dry-run, `npm run ops:health` drift=0.

---

## 6. Per-key inventory — 366 keys (fresh, 2026-06-12T20:28Z)

Legend: **reason** truncation = legacy-30-cap gap (incl. 16 below-source-not-exactly-30 keys —
distinguishable in the keys JSON via `truncation_below_source`) · hero-divergence = normalized
JSON-hero identity absent/shifted in table · both = both. **lm** = active rows / active Photo
rows. **JSON** = `listings.media` array length. **src** = stored Trestle PhotosCount.
**exp** = expected total active rows after re-sync (estimate, §4.3). **drain?** = current drain
will reach it anyway (skip at execution if still true). Full detail (heroes, PCTs, ListingKeys,
per-key drain reason): `scripts/__resync-dryrun-2026-06-12-keys.json`.

| listing_id | ListingKey | reason | lm | JSON | src | exp | drain? | risk |
|---|---|---|---|---|---|---|---|---|
| RLS10933821 | 1092341911 | truncation | 30/29 | 69 | 69 | 70 | no | LOW |
| RLS10939232 | 1091340087 | hero-divergence | 24/24 | 24 | 24 | 24 | no | MED |
| RLS10941610 | 1092335141 | hero-divergence | 16/15 | 16 | 16 | 17 | no | MED |
| RLS10944852 | 1092342978 | hero-divergence | 24/23 | 24 | 24 | 25 | YES | MED |
| RLS10952944 | 1091335419 | hero-divergence | 31/30 | 31 | 31 | 32 | no | MED |
| RLS10953783 | 1091340652 | hero-divergence | 38/37 | 38 | 38 | 39 | no | MED |
| RLS10956475 | 1092341024 | truncation | 30/29 | 34 | 34 | 35 | YES | LOW |
| RLS10958652 | 1092318806 | hero-divergence | 18/17 | 18 | 18 | 19 | no | MED |
| RLS10963979 | 1092340744 | truncation | 30/29 | 58 | 58 | 59 | no | LOW |
| RLS10965727 | 1092302389 | truncation | 44/42 | 0 | 54 | 56 | no | LOW |
| RLS10967068 | 1092341774 | truncation | 38/34 | 0 | 39 | 43 | no | LOW |
| RLS10967996 | 1092342724 | truncation | 30/29 | 41 | 41 | 42 | no | LOW |
| RLS10979757 | 1091331768 | truncation | 30/27 | 33 | 32 | 35 | no | LOW |
| RLS10987906 | 1091331715 | both | 30/29 | 35 | 35 | 36 | no | MED |
| RLS10991147 | 1092318863 | hero-divergence | 13/13 | 13 | 13 | 13 | no | MED |
| RLS11001357 | 1092337601 | truncation | 30/27 | 69 | 69 | 72 | no | LOW |
| RLS11013982 | 1092345997 | truncation | 30/27 | 54 | 54 | 57 | no | LOW |
| RLS11015411 | 1092350117 | truncation | 94/92 | 0 | 99 | 101 | no | LOW |
| RLS11019713 | 1093663945 | hero-divergence | 21/20 | 21 | 21 | 22 | no | MED |
| RLS11020698 | 1093939664 | truncation | 29/28 | 0 | 36 | 37 | YES | LOW |
| RLS11023557 | 1097186588 | hero-divergence | 29/27 | 29 | 29 | 31 | YES | MED |
| RLS11025259 | 1100176694 | truncation | 30/28 | 34 | 34 | 36 | no | LOW |
| RLS11026230 | 1100664734 | hero-divergence | 7/1 | 7 | 7 | 13 | YES | MED |
| RLS11026697 | 1100922780 | hero-divergence | 7/6 | 7 | 7 | 8 | YES | MED |
| RLS11027709 | 1101488873 | truncation | 16/14 | 39 | 39 | 41 | no | LOW |
| RLS11027834 | 1102511703 | hero-divergence | 8/7 | 8 | 8 | 9 | YES | MED |
| RLS11029617 | 1102975137 | hero-divergence | 12/10 | 12 | 12 | 14 | YES | MED |
| RLS11031134 | 1103420662 | truncation | 30/30 | 31 | 31 | 31 | no | LOW |
| RLS11032580 | 1104297383 | hero-divergence | 6/5 | 6 | 6 | 7 | YES | MED |
| RLS20002677 | 1106999477 | hero-divergence | 12/11 | 12 | 12 | 13 | no | MED |
| RLS20003912 | 1107285786 | hero-divergence | 18/17 | 18 | 18 | 19 | no | MED |
| RLS20004669 | 1107626040 | hero-divergence | 18/17 | 18 | 18 | 19 | no | MED |
| RLS20004978 | 1107710285 | truncation | 30/29 | 0 | 33 | 34 | YES | LOW |
| RLS20005200 | 1107752824 | hero-divergence | 14/13 | 25 | 25 | 26 | no | MED |
| RLS20005202 | 1107752919 | truncation | 15/14 | 31 | 31 | 32 | no | LOW |
| RLS20006303 | 1108189811 | truncation | 30/28 | 34 | 33 | 35 | no | LOW |
| RLS20008124 | 1108477395 | hero-divergence | 10/9 | 10 | 10 | 11 | no | MED |
| RLS20008682 | 1108550101 | truncation | 35/34 | 39 | 39 | 40 | no | LOW |
| RLS20009580 | 1108722945 | hero-divergence | 14/13 | 3 | 14 | 15 | no | MED |
| RLS20013646 | 1110245822 | truncation | 30/24 | 34 | 34 | 40 | YES | LOW |
| RLS20014198 | 1111229854 | hero-divergence | 13/12 | 13 | 13 | 14 | no | MED |
| RLS20015849 | 1111628431 | hero-divergence | 21/20 | 21 | 21 | 22 | no | MED |
| RLS20016126 | 1111688134 | hero-divergence | 15/14 | 15 | 15 | 16 | no | MED |
| RLS20018188 | 1112042392 | truncation | 30/28 | 46 | 44 | 46 | no | LOW |
| RLS20019533 | 1112261443 | truncation | 30/23 | 0 | 31 | 38 | no | LOW |
| RLS20022178 | 1112920088 | truncation | 27/26 | 35 | 35 | 36 | no | LOW |
| RLS20022664 | 1113012892 | truncation | 30/29 | 51 | 51 | 52 | YES | LOW |
| RLS20022893 | 1113080314 | truncation | 30/29 | 33 | 33 | 34 | no | LOW |
| RLS20023296 | 1114776333 | truncation | 32/31 | 42 | 42 | 43 | no | LOW |
| RLS20024172 | 1114151468 | truncation | 24/22 | 24 | 33 | 35 | no | LOW |
| RLS20024948 | 1114275320 | hero-divergence | 27/26 | 27 | 27 | 28 | no | MED |
| RLS20025453 | 1114350714 | hero-divergence | 23/22 | 23 | 23 | 24 | no | MED |
| RLS20026243 | 1114548284 | hero-divergence | 10/9 | 10 | 10 | 11 | no | MED |
| RLS20028335 | 1114834165 | truncation | 30/28 | 36 | 34 | 36 | no | LOW |
| RLS20029246 | 1114994950 | truncation | 62/59 | 63 | 63 | 66 | no | LOW |
| RLS20029316 | 1115006035 | both | 30/29 | 34 | 34 | 35 | no | MED |
| RLS20030639 | 1117049980 | hero-divergence | 13/12 | 13 | 13 | 14 | no | MED |
| RLS20030895 | 1117343561 | hero-divergence | 19/17 | 19 | 19 | 21 | no | MED |
| RLS20031859 | 1117688559 | truncation | 30/28 | 0 | 48 | 50 | YES | LOW |
| RLS20032616 | 1118327144 | hero-divergence | 2/2 | 2 | 2 | 2 | no | MED |
| RLS20036897 | 1119201214 | truncation | 28/27 | 37 | 37 | 38 | no | LOW |
| RLS20038472 | 1119756950 | truncation | 30/30 | 62 | 62 | 62 | no | LOW |
| RLS20039011 | 1119871795 | hero-divergence | 19/18 | 19 | 19 | 20 | no | MED |
| RLS20039372 | 1119981513 | hero-divergence | 10/9 | 10 | 10 | 11 | YES | MED |
| RLS20039564 | 1120014642 | truncation | 30/28 | 52 | 50 | 52 | YES | LOW |
| RLS20042937 | 1127110923 | truncation | 33/32 | 46 | 46 | 47 | no | LOW |
| RLS20043479 | 1127605467 | hero-divergence | 14/13 | 14 | 14 | 15 | no | MED |
| RLS20045299 | 1131255154 | truncation | 30/29 | 33 | 33 | 34 | YES | LOW |
| RLS20046136 | 1132114747 | hero-divergence | 14/13 | 14 | 14 | 15 | no | MED |
| RLS20046336 | 1132265988 | hero-divergence | 15/14 | 15 | 15 | 16 | no | MED |
| RLS20046464 | 1132348812 | truncation | 30/29 | 38 | 38 | 39 | no | LOW |
| RLS20047081 | 1133139224 | hero-divergence | 3/3 | 3 | 3 | 3 | no | MED |
| RLS20047165 | 1133160842 | hero-divergence | 2/2 | 2 | 2 | 2 | no | MED |
| RLS20047625 | 1133449891 | hero-divergence | 21/20 | 21 | 21 | 22 | no | MED |
| RLS20048023 | 1133670626 | truncation | 30/30 | 32 | 32 | 32 | no | LOW |
| RLS20048055 | 1133677965 | truncation | 30/24 | 0 | 36 | 42 | YES | LOW |
| RLS20048299 | 1133895324 | hero-divergence | 16/15 | 16 | 16 | 17 | no | MED |
| RLS20048454 | 1134253213 | hero-divergence | 21/19 | 21 | 21 | 23 | no | MED |
| RLS20048539 | 1134522643 | truncation | 30/29 | 34 | 34 | 35 | no | LOW |
| RLS20048740 | 1134551754 | hero-divergence | 26/24 | 26 | 26 | 28 | no | MED |
| RLS20048781 | 1134556895 | hero-divergence | 24/23 | 24 | 24 | 25 | no | MED |
| RLS20048864 | 1134689582 | hero-divergence | 10/10 | 10 | 10 | 10 | no | MED |
| RLS20049028 | 1134725508 | hero-divergence | 15/14 | 15 | 15 | 16 | no | MED |
| RLS20049465 | 1135671823 | truncation | 30/29 | 32 | 32 | 33 | no | LOW |
| RLS20049611 | 1135710002 | hero-divergence | 22/21 | 22 | 22 | 23 | no | MED |
| RLS20050510 | 1136784276 | hero-divergence | 10/9 | 10 | 10 | 11 | no | MED |
| RLS20050567 | 1136803571 | hero-divergence | 11/10 | 11 | 11 | 12 | no | MED |
| RLS20050621 | 1136819092 | hero-divergence | 4/4 | 4 | 4 | 4 | no | MED |
| RLS20050625 | 1136820859 | hero-divergence | 3/2 | 3 | 2 | 3 | no | MED |
| RLS20050735 | 1136855191 | hero-divergence | 14/13 | 14 | 14 | 15 | no | MED |
| RLS20051328 | 1137031773 | hero-divergence | 16/15 | 16 | 16 | 17 | no | MED |
| RLS20052896 | 1138398327 | truncation | 30/29 | 56 | 56 | 57 | no | LOW |
| RLS20053304 | 1138484999 | hero-divergence | 14/13 | 14 | 14 | 15 | no | MED |
| RLS20053503 | 1138861500 | truncation | 30/30 | 32 | 32 | 32 | no | LOW |
| RLS20053515 | 1138864193 | hero-divergence | 6/5 | 6 | 6 | 7 | no | MED |
| RLS20053705 | 1144220152 | hero-divergence | 6/6 | 6 | 6 | 6 | no | MED |
| RLS20053755 | 1139311691 | hero-divergence | 14/13 | 14 | 14 | 15 | no | MED |
| RLS20053885 | 1139539117 | hero-divergence | 22/21 | 22 | 22 | 23 | no | MED |
| RLS20053908 | 1139545074 | hero-divergence | 2/1 | 2 | 2 | 3 | no | MED |
| RLS20053911 | 1139546608 | hero-divergence | 2/1 | 2 | 2 | 3 | no | MED |
| RLS20054775 | 1140148717 | hero-divergence | 22/21 | 22 | 22 | 23 | no | MED |
| RLS20054809 | 1140155679 | hero-divergence | 9/8 | 9 | 9 | 10 | no | MED |
| RLS20054902 | 1140221061 | hero-divergence | 15/14 | 15 | 15 | 16 | YES | MED |
| RLS20055263 | 1140579459 | truncation | 30/29 | 32 | 32 | 33 | no | LOW |
| RLS20055279 | 1140645895 | hero-divergence | 10/9 | 10 | 10 | 11 | no | MED |
| RLS20055636 | 1144179033 | truncation | 30/29 | 35 | 35 | 36 | no | LOW |
| RLS20055740 | 1144202887 | hero-divergence | 10/9 | 10 | 10 | 11 | no | MED |
| RLS20056749 | 1144762292 | hero-divergence | 7/6 | 7 | 7 | 8 | no | MED |
| RLS20056764 | 1157918367 | truncation | 30/29 | 0 | 31 | 32 | YES | LOW |
| RLS20056954 | 1144811501 | hero-divergence | 19/18 | 19 | 19 | 20 | no | MED |
| RLS20057022 | 1152365596 | hero-divergence | 3/2 | 3 | 3 | 4 | no | MED |
| RLS20057181 | 1144916219 | hero-divergence | 19/18 | 19 | 19 | 20 | no | MED |
| RLS20057482 | 1145268291 | truncation | 30/28 | 40 | 40 | 42 | no | LOW |
| RLS20057840 | 1145631041 | hero-divergence | 18/17 | 18 | 18 | 19 | no | MED |
| RLS20057852 | 1145633478 | hero-divergence | 24/20 | 24 | 24 | 28 | no | MED |
| RLS20057856 | 1145633915 | truncation | 30/30 | 32 | 32 | 32 | no | LOW |
| RLS20057922 | 1145647348 | hero-divergence | 25/24 | 25 | 25 | 26 | no | MED |
| RLS20058146 | 1145709399 | hero-divergence | 22/21 | 22 | 22 | 23 | no | MED |
| RLS20058292 | 1146193746 | hero-divergence | 40/39 | 40 | 40 | 41 | no | MED |
| RLS20058383 | 1145765335 | truncation | 30/29 | 33 | 33 | 34 | no | LOW |
| RLS20059088 | 1146011469 | truncation | 30/28 | 36 | 36 | 38 | YES | LOW |
| RLS20059684 | 1146234876 | hero-divergence | 8/7 | 8 | 8 | 9 | no | MED |
| RLS20059921 | 1146330212 | hero-divergence | 11/10 | 11 | 11 | 12 | no | MED |
| RLS20060249 | 1146418996 | truncation | 30/29 | 43 | 43 | 44 | YES | LOW |
| RLS20060827 | 1146554176 | truncation | 29/28 | 29 | 33 | 34 | YES | LOW |
| RLS20060891 | 1146564460 | hero-divergence | 14/13 | 14 | 14 | 15 | no | MED |
| RLS20061992 | 1147320774 | hero-divergence | 14/13 | 14 | 14 | 15 | no | MED |
| RLS20062429 | 1147455734 | hero-divergence | 16/15 | 16 | 16 | 17 | no | MED |
| RLS20063832 | 1151140426 | hero-divergence | 7/6 | 7 | 7 | 8 | no | MED |
| RLS20064026 | 1149584896 | truncation | 30/30 | 78 | 78 | 78 | no | LOW |
| RLS20065331 | 1150431669 | hero-divergence | 10/9 | 10 | 9 | 10 | no | MED |
| RLS20065454 | 1150860760 | hero-divergence | 11/10 | 11 | 11 | 12 | no | MED |
| RLS20065542 | 1150475847 | hero-divergence | 14/13 | 14 | 14 | 15 | no | MED |
| RLS20065669 | 1150495319 | hero-divergence | 17/16 | 17 | 17 | 18 | no | MED |
| RLS20065697 | 1150500805 | hero-divergence | 34/31 | 34 | 34 | 37 | no | MED |
| RLS20065698 | 1150500850 | truncation | 30/29 | 0 | 36 | 37 | YES | LOW |
| RLS20065751 | 1150518177 | hero-divergence | 15/13 | 15 | 15 | 17 | no | MED |
| RLS20065872 | 1150568873 | hero-divergence | 21/20 | 21 | 21 | 22 | no | MED |
| RLS20066680 | 1150855072 | hero-divergence | 2/1 | 2 | 2 | 3 | no | MED |
| RLS20066735 | 1150872266 | hero-divergence | 19/18 | 19 | 19 | 20 | no | MED |
| RLS20067059 | 1151039037 | hero-divergence | 18/17 | 18 | 18 | 19 | no | MED |
| RLS20067221 | 1151084297 | truncation | 30/29 | 0 | 45 | 46 | YES | LOW |
| RLS20067223 | 1151084864 | truncation | 30/29 | 33 | 33 | 34 | no | LOW |
| RLS20067681 | 1151312787 | hero-divergence | 12/11 | 12 | 12 | 13 | no | MED |
| RLS20067735 | 1151319835 | truncation | 30/26 | 45 | 45 | 49 | no | LOW |
| RLS20067865 | 1151346794 | hero-divergence | 9/8 | 9 | 9 | 10 | no | MED |
| RLS20068263 | 1151452792 | hero-divergence | 10/10 | 10 | 10 | 10 | no | MED |
| RLS20068267 | 1151459566 | hero-divergence | 15/15 | 15 | 15 | 15 | no | MED |
| RLS20068887 | 1151698730 | hero-divergence | 7/6 | 7 | 7 | 8 | no | MED |
| RLS20069133 | 1151775241 | hero-divergence | 9/8 | 9 | 9 | 10 | no | MED |
| RLS20069235 | 1151810578 | hero-divergence | 26/25 | 26 | 26 | 27 | no | MED |
| RLS20069245 | 1151813955 | hero-divergence | 2/1 | 2 | 2 | 3 | YES | MED |
| RLS20069309 | 1151831338 | hero-divergence | 12/11 | 12 | 12 | 13 | no | MED |
| RLS20069480 | 1151897828 | hero-divergence | 17/16 | 17 | 17 | 18 | no | MED |
| RLS20069562 | 1151925237 | hero-divergence | 10/9 | 10 | 10 | 11 | YES | MED |
| RLS20069586 | 1151929701 | truncation | 30/29 | 35 | 35 | 36 | no | LOW |
| RLS20069929 | 1152152131 | truncation | 30/29 | 34 | 34 | 35 | YES | LOW |
| RLS20069961 | 1152204583 | hero-divergence | 8/7 | 8 | 8 | 9 | no | MED |
| RLS20069974 | 1152233765 | truncation | 30/28 | 35 | 34 | 36 | no | LOW |
| RLS20070065 | 1152255870 | truncation | 30/30 | 0 | 65 | 65 | no | LOW |
| RLS20070481 | 1152413158 | hero-divergence | 19/18 | 19 | 19 | 20 | no | MED |
| RLS20070656 | 1152469603 | hero-divergence | 10/9 | 10 | 10 | 11 | YES | MED |
| RLS20070867 | 1152527343 | truncation | 30/28 | 0 | 49 | 51 | YES | LOW |
| RLS20070955 | 1152572631 | truncation | 30/29 | 43 | 43 | 44 | no | LOW |
| RLS20071385 | 1152803302 | hero-divergence | 15/14 | 15 | 15 | 16 | no | MED |
| RLS20071581 | 1152853977 | truncation | 30/28 | 35 | 35 | 37 | no | LOW |
| RLS20071753 | 1152908041 | hero-divergence | 21/20 | 21 | 21 | 22 | no | MED |
| RLS20071757 | 1152908429 | hero-divergence | 16/15 | 16 | 16 | 17 | YES | MED |
| RLS20071775 | 1152911971 | truncation | 30/29 | 0 | 58 | 59 | YES | LOW |
| RLS20071780 | 1152981308 | hero-divergence | 25/24 | 24 | 23 | 24 | no | MED |
| RLS20071803 | 1152919606 | hero-divergence | 12/11 | 12 | 11 | 12 | no | MED |
| RLS20071954 | 1152980505 | truncation | 30/29 | 43 | 43 | 44 | no | LOW |
| RLS20072020 | 1152995085 | hero-divergence | 25/24 | 25 | 24 | 25 | no | MED |
| RLS20072162 | 1153062908 | hero-divergence | 26/24 | 26 | 26 | 28 | no | MED |
| RLS20072261 | 1153100720 | hero-divergence | 14/13 | 14 | 14 | 15 | YES | MED |
| RLS20072303 | 1153106362 | truncation | 33/33 | 0 | 37 | 37 | YES | LOW |
| RLS20072379 | 1153118419 | hero-divergence | 21/20 | 21 | 21 | 22 | no | MED |
| RLS20072431 | 1153128125 | hero-divergence | 12/10 | 12 | 12 | 14 | no | MED |
| RLS20072449 | 1153131908 | hero-divergence | 16/15 | 16 | 16 | 17 | no | MED |
| RLS20072450 | 1153132215 | hero-divergence | 14/13 | 14 | 14 | 15 | no | MED |
| RLS20072483 | 1154313615 | hero-divergence | 13/12 | 13 | 13 | 14 | no | MED |
| RLS20072585 | 1153168252 | hero-divergence | 9/8 | 9 | 9 | 10 | no | MED |
| RLS20072740 | 1153290604 | hero-divergence | 15/14 | 15 | 15 | 16 | no | MED |
| RLS20072787 | 1153224872 | hero-divergence | 17/16 | 17 | 17 | 18 | no | MED |
| RLS20073000 | 1153283639 | hero-divergence | 19/18 | 19 | 19 | 20 | no | MED |
| RLS20073110 | 1153314778 | hero-divergence | 15/14 | 15 | 15 | 16 | no | MED |
| RLS20073286 | 1153391575 | hero-divergence | 32/30 | 32 | 32 | 34 | no | MED |
| RLS20073306 | 1153399116 | hero-divergence | 20/20 | 20 | 20 | 20 | no | MED |
| RLS20073431 | 1153430905 | hero-divergence | 2/1 | 2 | 2 | 3 | no | MED |
| RLS20073524 | 1153451561 | truncation | 30/29 | 55 | 55 | 56 | YES | LOW |
| RLS20073685 | 1155333551 | hero-divergence | 12/11 | 12 | 12 | 13 | no | MED |
| RLS20073946 | 1154513743 | hero-divergence | 13/12 | 13 | 13 | 14 | no | MED |
| RLS20074178 | 1154262265 | hero-divergence | 21/20 | 21 | 21 | 22 | no | MED |
| RLS20074309 | 1154170584 | truncation | 30/29 | 31 | 31 | 32 | no | LOW |
| RLS20074407 | 1154196281 | truncation | 30/29 | 0 | 55 | 56 | YES | LOW |
| RLS20074477 | 1154210390 | hero-divergence | 18/17 | 18 | 18 | 19 | no | MED |
| RLS20074635 | 1154255242 | hero-divergence | 10/8 | 10 | 10 | 12 | no | MED |
| RLS20074703 | 1154266848 | hero-divergence | 16/15 | 16 | 16 | 17 | no | MED |
| RLS20075036 | 1154335823 | hero-divergence | 12/11 | 12 | 12 | 13 | no | MED |
| RLS20075038 | 1154336097 | hero-divergence | 7/6 | 7 | 7 | 8 | no | MED |
| RLS20075150 | 1154376021 | hero-divergence | 33/32 | 33 | 33 | 34 | no | MED |
| RLS20075569 | 1154528575 | truncation | 30/29 | 39 | 39 | 40 | no | LOW |
| RLS20075623 | 1154596420 | hero-divergence | 12/11 | 12 | 12 | 13 | no | MED |
| RLS20075779 | 1154792776 | hero-divergence | 11/10 | 11 | 11 | 12 | no | MED |
| RLS20075816 | 1154822322 | hero-divergence | 15/14 | 15 | 14 | 15 | no | MED |
| RLS20075826 | 1154824345 | both | 30/27 | 38 | 38 | 41 | no | MED |
| RLS20075925 | 1155096769 | truncation | 30/29 | 0 | 32 | 33 | YES | LOW |
| RLS20076239 | 1154931536 | hero-divergence | 15/14 | 15 | 15 | 16 | no | MED |
| RLS20076371 | 1154979859 | truncation | 30/29 | 0 | 34 | 35 | YES | LOW |
| RLS20076400 | 1154987022 | hero-divergence | 15/14 | 15 | 15 | 16 | YES | MED |
| RLS20076422 | 1154993430 | hero-divergence | 21/20 | 21 | 21 | 22 | no | MED |
| RLS20076448 | 1155349287 | truncation | 30/29 | 31 | 31 | 32 | no | LOW |
| RLS20076850 | 1155107469 | hero-divergence | 22/21 | 22 | 22 | 23 | no | MED |
| RLS20076995 | 1155167624 | truncation | 30/29 | 41 | 41 | 42 | no | LOW |
| RLS20077291 | 1155310717 | truncation | 30/30 | 55 | 55 | 55 | no | LOW |
| RLS20077508 | 1155338277 | hero-divergence | 14/13 | 14 | 14 | 15 | no | MED |
| RLS20077549 | 1155346514 | hero-divergence | 11/10 | 11 | 11 | 12 | no | MED |
| RLS20077565 | 1155356739 | truncation | 30/29 | 32 | 32 | 33 | no | LOW |
| RLS20077718 | 1155388212 | hero-divergence | 16/14 | 16 | 16 | 18 | no | MED |
| RLS20077720 | 1155388456 | truncation | 30/29 | 35 | 35 | 36 | no | LOW |
| RLS20077761 | 1155397290 | truncation | 30/27 | 78 | 78 | 81 | no | LOW |
| RLS20078012 | 1155457920 | hero-divergence | 18/16 | 18 | 18 | 20 | no | MED |
| RLS20078046 | 1155460285 | hero-divergence | 19/18 | 19 | 19 | 20 | no | MED |
| RLS20078158 | 1156750642 | hero-divergence | 23/22 | 23 | 23 | 24 | no | MED |
| RLS20078166 | 1155495807 | hero-divergence | 9/8 | 9 | 8 | 9 | no | MED |
| RLS20078291 | 1155520125 | truncation | 30/30 | 0 | 46 | 46 | YES | LOW |
| RLS20078323 | 1155529540 | hero-divergence | 16/15 | 16 | 16 | 17 | no | MED |
| RLS20078343 | 1155538843 | hero-divergence | 6/5 | 6 | 6 | 7 | no | MED |
| RLS20078499 | 1155585775 | truncation | 30/28 | 0 | 34 | 36 | YES | LOW |
| RLS20078767 | 1155701370 | hero-divergence | 11/10 | 11 | 11 | 12 | no | MED |
| RLS20078803 | 1155710251 | truncation | 30/28 | 33 | 33 | 35 | no | LOW |
| RLS20078831 | 1155716651 | hero-divergence | 24/22 | 24 | 24 | 26 | no | MED |
| RLS20078848 | 1155719973 | hero-divergence | 11/10 | 11 | 11 | 12 | no | MED |
| RLS20079286 | 1155838587 | hero-divergence | 27/27 | 27 | 27 | 27 | no | MED |
| RLS20079319 | 1155851250 | truncation | 30/25 | 93 | 93 | 98 | no | LOW |
| RLS20079640 | 1155927831 | hero-divergence | 10/9 | 10 | 10 | 11 | no | MED |
| RLS20079722 | 1156019619 | hero-divergence | 7/6 | 7 | 7 | 8 | no | MED |
| RLS20079850 | 1156063752 | hero-divergence | 14/13 | 14 | 14 | 15 | no | MED |
| RLS20079943 | 1156082804 | hero-divergence | 19/18 | 19 | 19 | 20 | no | MED |
| RLS20080117 | 1156252849 | truncation | 29/28 | 29 | 32 | 33 | YES | LOW |
| RLS20080338 | 1156315669 | hero-divergence | 16/15 | 16 | 16 | 17 | YES | MED |
| RLS20080414 | 1156376542 | hero-divergence | 15/13 | 15 | 15 | 17 | no | MED |
| RLS20080467 | 1156390692 | hero-divergence | 6/5 | 6 | 6 | 7 | no | MED |
| RLS20080503 | 1156400988 | hero-divergence | 7/6 | 7 | 7 | 8 | no | MED |
| RLS20080507 | 1159286016 | truncation | 30/29 | 61 | 61 | 62 | no | LOW |
| RLS20080718 | 1156454439 | hero-divergence | 8/8 | 8 | 8 | 8 | no | MED |
| RLS20080802 | 1157027028 | hero-divergence | 17/16 | 17 | 17 | 18 | no | MED |
| RLS20080877 | 1156515583 | hero-divergence | 10/9 | 10 | 10 | 11 | no | MED |
| RLS20081038 | 1156618439 | hero-divergence | 18/17 | 18 | 18 | 19 | no | MED |
| RLS20081065 | 1156635810 | hero-divergence | 16/15 | 16 | 16 | 17 | no | MED |
| RLS20081253 | 1156768645 | hero-divergence | 7/7 | 7 | 7 | 7 | no | MED |
| RLS20081265 | 1156770358 | hero-divergence | 11/10 | 11 | 11 | 12 | no | MED |
| RLS20081464 | 1156827000 | hero-divergence | 18/17 | 18 | 18 | 19 | no | MED |
| RLS20081601 | 1156847041 | hero-divergence | 13/12 | 13 | 13 | 14 | no | MED |
| RLS20081699 | 1156862338 | hero-divergence | 9/8 | 9 | 9 | 10 | no | MED |
| RLS20081710 | 1156863624 | hero-divergence | 2/1 | 2 | 2 | 3 | no | MED |
| RLS20081736 | 1156867515 | hero-divergence | 17/16 | 17 | 17 | 18 | no | MED |
| RLS20081830 | 1156888770 | truncation | 30/29 | 37 | 37 | 38 | no | LOW |
| RLS20081892 | 1156902411 | hero-divergence | 22/21 | 22 | 22 | 23 | no | MED |
| RLS20081974 | 1156916613 | truncation | 30/30 | 36 | 36 | 36 | no | LOW |
| RLS20081988 | 1156919372 | hero-divergence | 20/19 | 20 | 20 | 21 | no | MED |
| RLS20081995 | 1156920352 | hero-divergence | 10/9 | 10 | 9 | 10 | no | MED |
| RLS20082102 | 1156938875 | both | 30/29 | 32 | 32 | 33 | no | MED |
| RLS20082116 | 1156946421 | truncation | 30/29 | 0 | 34 | 35 | no | LOW |
| RLS20082316 | 1157006957 | hero-divergence | 35/34 | 35 | 35 | 36 | no | MED |
| RLS20082336 | 1157009514 | truncation | 30/29 | 33 | 33 | 34 | no | LOW |
| RLS20082473 | 1157032694 | hero-divergence | 10/9 | 10 | 10 | 11 | no | MED |
| RLS20082556 | 1157055936 | truncation | 30/29 | 0 | 35 | 36 | YES | LOW |
| RLS20082593 | 1159017252 | hero-divergence | 8/7 | 8 | 8 | 9 | no | MED |
| RLS20082617 | 1157185190 | truncation | 30/29 | 0 | 40 | 41 | YES | LOW |
| RLS20082626 | 1157073341 | hero-divergence | 8/7 | 8 | 8 | 9 | no | MED |
| RLS20082678 | 1157080912 | hero-divergence | 10/9 | 10 | 10 | 11 | no | MED |
| RLS20082846 | 1157170225 | truncation | 30/26 | 33 | 33 | 37 | YES | LOW |
| RLS20082893 | 1157187548 | truncation | 30/28 | 33 | 33 | 35 | YES | LOW |
| RLS20082958 | 1157201083 | hero-divergence | 20/20 | 20 | 20 | 20 | no | MED |
| RLS20083053 | 1157258340 | hero-divergence | 19/18 | 19 | 19 | 20 | no | MED |
| RLS20083074 | 1157276243 | hero-divergence | 35/34 | 35 | 35 | 36 | no | MED |
| RLS20083264 | 1157481360 | hero-divergence | 9/8 | 9 | 9 | 10 | no | MED |
| RLS20083285 | 1157484852 | truncation | 30/28 | 38 | 38 | 40 | no | LOW |
| RLS20083350 | 1157493227 | hero-divergence | 25/24 | 25 | 25 | 26 | no | MED |
| RLS20083535 | 1157547650 | hero-divergence | 13/13 | 13 | 13 | 13 | no | MED |
| RLS20083566 | 1157554080 | hero-divergence | 13/12 | 13 | 13 | 14 | no | MED |
| RLS20083580 | 1157557456 | hero-divergence | 11/10 | 11 | 11 | 12 | no | MED |
| RLS20083625 | 1157564278 | hero-divergence | 15/14 | 15 | 15 | 16 | YES | MED |
| RLS20083774 | 1157586019 | hero-divergence | 14/13 | 14 | 14 | 15 | no | MED |
| RLS20083860 | 1157609136 | truncation | 30/29 | 32 | 32 | 33 | no | LOW |
| RLS20083862 | 1157609566 | hero-divergence | 15/14 | 15 | 15 | 16 | no | MED |
| RLS20083954 | 1157624193 | hero-divergence | 7/6 | 7 | 7 | 8 | no | MED |
| RLS20084518 | 1157639942 | hero-divergence | 7/6 | 7 | 7 | 8 | no | MED |
| RLS20084559 | 1157645347 | hero-divergence | 13/12 | 13 | 13 | 14 | no | MED |
| RLS20084563 | 1157645864 | hero-divergence | 8/7 | 8 | 7 | 8 | no | MED |
| RLS20084745 | 1157687489 | hero-divergence | 11/10 | 11 | 11 | 12 | no | MED |
| RLS20084760 | 1157691666 | truncation | 30/29 | 31 | 31 | 32 | no | LOW |
| RLS20084847 | 1157709306 | hero-divergence | 13/12 | 13 | 12 | 13 | no | MED |
| RLS20084891 | 1157716767 | hero-divergence | 13/12 | 3 | 13 | 14 | no | MED |
| RLS20085006 | 1157749035 | hero-divergence | 25/25 | 25 | 25 | 25 | no | MED |
| RLS20085045 | 1157767908 | truncation | 30/29 | 47 | 47 | 48 | no | LOW |
| RLS20085209 | 1157809744 | hero-divergence | 16/14 | 16 | 16 | 18 | no | MED |
| RLS20085271 | 1157827454 | hero-divergence | 4/3 | 4 | 4 | 5 | no | MED |
| RLS20085360 | 1158323951 | hero-divergence | 11/10 | 11 | 11 | 12 | no | MED |
| RLS20085440 | 1157915241 | truncation | 30/29 | 58 | 58 | 59 | YES | LOW |
| RLS20085689 | 1158198284 | hero-divergence | 23/21 | 23 | 23 | 25 | no | MED |
| RLS20085701 | 1158199228 | hero-divergence | 21/20 | 21 | 21 | 22 | no | MED |
| RLS20085759 | 1158209655 | hero-divergence | 13/12 | 13 | 13 | 14 | no | MED |
| RLS20085774 | 1158211557 | hero-divergence | 9/8 | 9 | 9 | 10 | no | MED |
| RLS20085832 | 1158219192 | hero-divergence | 8/8 | 8 | 8 | 8 | no | MED |
| RLS20085865 | 1158226586 | hero-divergence | 11/10 | 11 | 11 | 12 | no | MED |
| RLS20085885 | 1158230824 | hero-divergence | 7/6 | 7 | 7 | 8 | no | MED |
| RLS20086006 | 1158259199 | hero-divergence | 6/5 | 6 | 6 | 7 | YES | MED |
| RLS20086025 | 1158260958 | hero-divergence | 25/24 | 25 | 25 | 26 | no | MED |
| RLS20086074 | 1158269399 | hero-divergence | 2/1 | 2 | 2 | 3 | no | MED |
| RLS20086114 | 1158279105 | hero-divergence | 15/14 | 15 | 15 | 16 | no | MED |
| RLS20086135 | 1158283135 | hero-divergence | 6/5 | 6 | 6 | 7 | no | MED |
| RLS20086160 | 1158286745 | hero-divergence | 11/10 | 11 | 11 | 12 | YES | MED |
| RLS20086268 | 1158319135 | hero-divergence | 12/11 | 12 | 12 | 13 | no | MED |
| RLS20086330 | 1158340030 | hero-divergence | 11/10 | 11 | 11 | 12 | no | MED |
| RLS20086372 | 1158348328 | hero-divergence | 8/7 | 8 | 7 | 8 | no | MED |
| RLS20086409 | 1158355866 | hero-divergence | 28/27 | 28 | 28 | 29 | no | MED |
| RLS20086571 | 1158408086 | hero-divergence | 8/7 | 8 | 8 | 9 | no | MED |
| RLS20086628 | 1158427584 | hero-divergence | 16/15 | 16 | 15 | 16 | no | MED |
| RLS20086665 | 1158441104 | hero-divergence | 6/5 | 6 | 6 | 7 | no | MED |
| RLS20086895 | 1158567311 | hero-divergence | 11/10 | 11 | 11 | 12 | YES | MED |
| RLS20087019 | 1158583191 | hero-divergence | 11/10 | 11 | 10 | 11 | no | MED |
| RLS20087102 | 1158599106 | hero-divergence | 7/6 | 7 | 6 | 7 | no | MED |
| RLS20087155 | 1158618037 | hero-divergence | 28/27 | 28 | 28 | 29 | no | MED |
| RLS20087174 | 1158622848 | hero-divergence | 22/21 | 22 | 22 | 23 | no | MED |
| RLS20087227 | 1158630468 | hero-divergence | 30/28 | 30 | 30 | 32 | no | MED |
| RLS20087313 | 1158641075 | hero-divergence | 8/7 | 8 | 7 | 8 | no | MED |
| RLS20087529 | 1158683611 | hero-divergence | 15/14 | 15 | 15 | 16 | no | MED |
| RLS20087603 | 1158695347 | hero-divergence | 15/14 | 15 | 15 | 16 | no | MED |
| RLS20087704 | 1158716044 | hero-divergence | 18/17 | 18 | 18 | 19 | YES | MED |
| RLS20087813 | 1158753616 | hero-divergence | 19/18 | 19 | 19 | 20 | no | MED |
| RLS20087862 | 1158765999 | hero-divergence | 16/15 | 16 | 16 | 17 | no | MED |
| RLS20087875 | 1158768468 | hero-divergence | 9/9 | 9 | 9 | 9 | no | MED |
| RLS20087957 | 1158782785 | hero-divergence | 9/8 | 9 | 9 | 10 | no | MED |
| RLS20088029 | 1158799015 | truncation | 30/29 | 39 | 39 | 40 | no | LOW |
| RLS20088030 | 1158799156 | truncation | 30/29 | 39 | 39 | 40 | no | LOW |
| RLS20088232 | 1159176027 | hero-divergence | 24/23 | 24 | 23 | 24 | no | MED |
| RLS20088245 | 1159178984 | hero-divergence | 10/9 | 10 | 10 | 11 | no | MED |
| RLS20088271 | 1159184931 | hero-divergence | 11/10 | 11 | 11 | 12 | no | MED |
| RLS20088462 | 1159253112 | hero-divergence | 18/17 | 18 | 18 | 19 | no | MED |
| RLS20088682 | 1159306352 | both | 30/30 | 41 | 41 | 41 | no | MED |
| RLS20088689 | 1159308343 | hero-divergence | 22/21 | 22 | 22 | 23 | no | MED |
| RLS20088701 | 1159319404 | hero-divergence | 18/17 | 18 | 18 | 19 | no | MED |
| RLS20088713 | 1159351802 | hero-divergence | 18/17 | 18 | 18 | 19 | no | MED |
| RLS20088716 | 1159368943 | hero-divergence | 15/14 | 15 | 15 | 16 | no | MED |
| RLS20088720 | 1159399877 | hero-divergence | 27/26 | 27 | 27 | 28 | no | MED |
| RLS20088722 | 1159423489 | hero-divergence | 7/6 | 7 | 6 | 7 | no | MED |
| RLS20088728 | 1159435146 | hero-divergence | 17/16 | 17 | 17 | 18 | no | MED |
| RLS20088794 | 1159461047 | hero-divergence | 14/13 | 14 | 14 | 15 | no | MED |
| RLS20088848 | 1159470169 | hero-divergence | 7/7 | 7 | 7 | 7 | no | MED |
| RLS20088865 | 1159473939 | hero-divergence | 20/20 | 20 | 20 | 20 | no | MED |
| RLS20088897 | 1159482188 | hero-divergence | 10/9 | 10 | 10 | 11 | YES | MED |
| RLS20088937 | 1159492143 | hero-divergence | 12/10 | 12 | 10 | 12 | no | MED |
| RLS20089252 | 1159534606 | hero-divergence | 5/4 | 5 | 4 | 5 | no | MED |
| RLS20089297 | 1159542214 | hero-divergence | 12/11 | 12 | 12 | 13 | no | MED |
| RLS20089408 | 1159562622 | hero-divergence | 7/6 | 7 | 7 | 8 | YES | MED |
| RLS20089670 | 1159624869 | hero-divergence | 10/10 | 10 | 10 | 10 | no | MED |
| RLS20090198 | 1159822942 | hero-divergence | 10/9 | 10 | 10 | 11 | no | MED |
| RLS20090403 | 1159854557 | hero-divergence | 38/37 | 38 | 38 | 39 | no | MED |
| RLS20090873 | 1159973439 | hero-divergence | 24/23 | 24 | 24 | 25 | no | MED |
| RLS20091914 | 1168358488 | hero-divergence | 14/12 | 14 | 14 | 16 | no | MED |
| RLS20091941 | 1168390150 | hero-divergence | 9/8 | 9 | 9 | 10 | no | MED |
| RLS20092479 | 1169036886 | hero-divergence | 14/13 | 14 | 14 | 15 | no | MED |
| RLS20092480 | 1169037581 | hero-divergence | 13/12 | 13 | 13 | 14 | no | MED |
| RLS20092483 | 1169037806 | hero-divergence | 13/12 | 13 | 13 | 14 | no | MED |
---

## 7. Probe-run record

- Executed read-only against `ep-cold-waterfall-adno3ao2` (hidden-mountain / production),
  2026-06-12T20:28:40Z, `statement_timeout=300s`, `default_transaction_read_only=on`, host
  fail-closed guard passed. NEON.md read before DB access. No memory/ files touched.
- Raw output: `scripts/__resync-dryrun-2026-06-12.out` · full per-key records:
  `scripts/__resync-dryrun-2026-06-12-keys.json` · table source: `…-table.md`. All untracked.
- Cursor at probe time: `last_photos_change=2026-06-08T17:11:52.213Z`,
  `last_listing_key='1159770365'`, `last_run_at=2026-06-12T20:15:55Z`, status ok (naive-UTC
  columns read via text cast — node-pg local-tz parse would otherwise shift them +4h; first
  probe iteration had this skew, corrected before the final numbers).
- Estimates labeled inline: stored-`PhotosCount`-as-source proxy (live check = §5.1) ·
  expected-rows-after (§4.3) · net-new row total (≈1,542).
- Per CLAUDE.md §J: no live Cotality call was made; nothing here asserts live field truth.

> ## 🛑 REMINDER — EVERYTHING ABOVE IS BLOCKED UNTIL C6 SETTLEMENT
> No backfill, no writes, no R2 changes, no cron config changes were performed or may be
> performed on the basis of this document alone. Execution additionally requires explicit Maya
> approval (CLAUDE.md §C: manual cron triggers / reconciliation runs are HELD) and a fresh
> re-derivation at T-0.

*Read-only dry-run by Claude (Fable 5), 2026-06-12. DO NOT COMMIT.*
