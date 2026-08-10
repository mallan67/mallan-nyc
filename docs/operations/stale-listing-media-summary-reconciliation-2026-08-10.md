# Historical `Listing` media-summary reconciliation — design

**Status:** DESIGN CLOSED · **PRODUCTION BACKFILL HELD** (requires explicit Maya authorization)
**Measured:** 2026-08-10, read-only, `hidden-mountain-87248164` / branch `main`
**Production application SHA at measurement:** `2d121daa` (PR #598 merge, `PROD_PROVEN`)

---

## 1. Is new drift still being created? — NO

This is the question that decides whether reconciliation is cleanup or a band-aid over a live
defect. It is answered against the #597 Production deploy boundary (`2026-08-10 01:35Z`), which
shipped `propagateMirroredHeroSummaries`.

| measurement | value |
|---|---|
| Heroes whose media row was touched since the #597 deploy | 56 |
| — of those, mirrored (gained `r2_key`) | 54 |
| — of those, `Listing` summary **correct** | **54 / 54** |
| Media rows mirrored in the same window (denominator, proves non-vacuity) | 418 |
| Stale listings whose hero was touched since the #597 deploy | **0** |
| Newest hero touch among stale listings | `2026-08-09 22:20Z` — before the deploy |

**NEW STALE-SUMMARY DRIFT = STOPPED.** Every stale row predates the propagation fix. The
remaining population is purely historical, so reconciliation is genuine cleanup and not a way of
deferring a continuing writer defect.

## 2. Exact population and classes

Truth is recomputed per listing from `listing_media` using the production hero rule
(`selectHeroPhoto`: CRM `preferred_photo_yn` first, then feed `preferred_photo_yn`, then `order`
ascending, then first-encountered) over `status='active' AND media_type='Photo'`.

| class | listings |
|---|---|
| **Total stale** | **4,911** |
| `primary_photo_r2_key` only | 4,869 |
| `photo_count` only | 12 |
| `primary_photo_url` only | 0 |
| More than one field | 30 |
| — of the total, Mallan-owned (`SL-`/`RL-`/`rls_eligible=false`) | 4 |
| — of the total, on a live listing (Active/AUC/ComingSoon/Pending) | 2,573 |

Directionality: every `primary_photo_r2_key` case is *hero has an `r2_key`, summary has NULL*
(4,896 rows). The reverse — summary claims a key the hero does not have — is **0**, which matters
because that direction would serve a stale or missing object.

## 3. Impact — why this is not urgent

A NULL `primary_photo_r2_key` makes the card/hero fall back to `media_url_original` through
`/api/media/proxy`. The image is **correct**; it is served from Cotality instead of R2. So the cost
is proxy egress and latency on up to 2,573 live listings, not wrong or missing content. There is no
compliance surface: no display gate, attribution, disclosure or price field is involved.

This is the reason the backfill can safely stay held rather than being forced through.

## 4. Selector

```sql
WITH hero AS (
  SELECT DISTINCT ON (lm.listing_id)
         lm.listing_id, lm.media_url_original, lm.r2_key
  FROM listing_media lm
  WHERE lm.status = 'active' AND lm.media_type = 'Photo'
  ORDER BY lm.listing_id,
           (lm.preferred_photo_yn AND lm.media_key LIKE 'crm:%') DESC,
           lm.preferred_photo_yn DESC, lm."order" ASC, lm.id ASC),
cnt AS (
  SELECT listing_id, count(*)::int AS n
  FROM listing_media WHERE status = 'active' AND media_type = 'Photo'
  GROUP BY listing_id)
SELECT l.listing_id
FROM hero h
JOIN cnt c      ON c.listing_id = h.listing_id
JOIN listings l ON l.listing_id = h.listing_id
WHERE l.primary_photo_r2_key IS DISTINCT FROM h.r2_key
   OR l.primary_photo_url    IS DISTINCT FROM h.media_url_original
   OR l.photo_count          IS DISTINCT FROM c.n
ORDER BY l.listing_id
LIMIT :batch;
```

`IS DISTINCT FROM` is required — `<>` is NULL-blind and would miss the entire dominant class.

## 5. Intended write

Per listing, exactly the fields `computeListingMediaSummary` already owns:
`primary_photo_url`, `primary_photo_r2_key`, `photo_count`, `photos_change_timestamp`.

**The reconciler must not reimplement the summary.** It calls the production
`updateListingMediaSummary(listingId)` — the same function the sync uses — so the backfill cannot
compute a different answer than the live writer. That also means it inherits the writer's existing
suppress-unchanged behaviour.

### Exclusions

- Listings with **no** active Photo rows (no hero to derive; leave the summary alone).
- Anything outside the selector — do not "tidy" adjacent fields.
- No `modification_timestamp` write. That column is the Trestle sync cursor
  (`getLastSyncTimestamp` = `MAX(modification_timestamp) WHERE last_synced_from_trestle IS NOT NULL`);
  writing it would poison the cursor and skip real feed changes. This is the single most dangerous
  mistake available here.

## 6. Safety properties

| property | how it is met |
|---|---|
| **Idempotent** | Re-running recomputes the same value from the same rows; a converged listing leaves the selector. |
| **Bounded** | `LIMIT :batch`, default 200, one batch per invocation. |
| **Resumable** | State lives in the data. Kill at any point; the selector simply returns what is still stale. |
| **Pausable** | Stop invoking it. No lock, no cursor, no partial-run state to unwind. |
| **Write volume** | ≤ 1 `UPDATE` per listing, 4,911 total, one-time. ~0.02% of the ~27.5k timestamp writes/day the feed already performs. |
| **Neon impact** | Runs only while the compute is already awake (piggyback on One Cycle, or a manual window). It must never be the reason Neon wakes. |
| **R2 impact** | None. No object is read, written or deleted. |
| **Cache** | Reuse the writer's existing revalidation path. Fresh URLs for pages that already render correctly, so a missed tag degrades to the current state, never worse. |
| **Audit** | One `audit_events` row per batch: selected, updated, suppressed-unchanged, failed, batch bounds. |
| **Failure recovery** | Per-listing try/catch; a failure leaves that listing stale and it is re-selected next batch. |
| **Rollback** | Not meaningful and not needed — the write moves the summary *toward* the recomputable truth. The pre-state is reconstructible from `listing_media` at any time, and the reverse-direction class (summary asserting a key the hero lacks) is currently 0. |

## 7. Dry run

The tool must support `--dry-run` printing, without writing: total selected, per-class counts,
per-listing before/after, and the count that would be suppressed as already-correct. A dry run over
the full population is a read-only query and is **not** held.

## 8. Post-run verification

Re-run the §4 selector. Required: **0 rows**. Then re-assert the §1 drift check so the run cannot be
confused with a regression in the live writer.

## 9. Why not fold this into the sweep pattern used for R2 policy re-admission

The Phase-4a R2 sweep (PR #599) is the right shape and could be mirrored here — but applying it
would mean issuing ~4,900 Production `UPDATE`s automatically, which is precisely the backfill that
is held. The mechanism is uncontroversial; the *authorization to mutate historical Production rows*
is what is outstanding. Design closed; execution held.

## 10. Status

- **RECONCILIATION DESIGN = CLOSED**
- **PRODUCTION BACKFILL = HELD** — needs explicit Maya authorization. Nothing in this document has
  been executed; every number above comes from read-only `SELECT`s.
