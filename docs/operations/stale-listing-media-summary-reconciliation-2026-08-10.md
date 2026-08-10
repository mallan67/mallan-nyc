# Historical `Listing` media-summary reconciliation — design

**Status:** DESIGN CLOSED · **PRODUCTION BACKFILL HELD** (requires explicit Maya authorization)
**Registry ID:** **OPS-026** (`docs/PLATFORM-ISSUE-REGISTRY.md`) — canonical row, blast radius and
Evidence Score live there; this document is the remediation plan, not a second definition.
**Measured:** 2026-08-10, read-only, `hidden-mountain-87248164` / branch `main`
**Production application SHA at measurement:** `2d121daa` (PR #598 merge, `PROD_PROVEN`)

> **Revision (2026-08-10, same day).** The first version of this document derived "canonical hero
> truth" from `status='active' AND media_type='Photo'`. That is **not** the production rule:
> `filterActivePhotoRows` delegates to `classifyMediaItem`, which weighs MediaCategory,
> MediaClassification and the Trestle `DOCUMENT-*` URL shape before falling back to `media_type`.
> Every population below has been recomputed with a verified equivalent of the real classifier, the
> omitted `photos_change_timestamp` class has been added, the URL comparison now also reports the
> production provider-scoped identity rule, and the write-volume arithmetic in §6 was wrong by three
> orders of magnitude and is corrected.

---

## 1. Is new drift still being created? — NO

This decides whether reconciliation is cleanup or a band-aid over a live defect. Answered against
the #597 Production deploy boundary (`2026-08-10 01:35Z`), which shipped
`propagateMirroredHeroSummaries`. Recomputed with the canonical classifier:

| measurement | value |
|---|---|
| Heroes whose media row was touched since the #597 deploy | 78 |
| — of those, mirrored (gained `r2_key`) | 62 |
| — of those, `Listing` summary **correct** | **62 / 62** |
| Media rows mirrored in the same window (denominator — proves non-vacuity) | 490 |
| Stale listings whose hero was touched since the #597 deploy | **0** |

**NEW STALE-SUMMARY DRIFT = STOPPED.** Every stale row predates the propagation fix, so this is
genuine cleanup, not a way of deferring a continuing writer defect.

## 2. Population and classes (canonical classifier)

Truth is recomputed per listing from `listing_media` using the production owners: the hero rule
(`selectHeroPhoto` — CRM `preferred_photo_yn` first, then feed `preferred_photo_yn`, then `order`
ascending, then first-encountered) over rows the **canonical classifier** calls photos, and the
summary fields `computeListingMediaSummary` owns.

| class | listings |
|---|---|
| Photo-bearing listings examined | 20,649 |
| **Total stale — exact selector** | **4,894** |
| `primary_photo_r2_key` | 4,879 |
| `photo_count` | 42 |
| `photos_change_timestamp` (class omitted from the first measurement) | 13 |
| `primary_photo_url` — byte-exact | 12 |
| `primary_photo_url` — production provider-scoped `mediaUrlIdentity` (origin + pathname) | **12 — identical**, so signed-URL rotation is *not* inflating the count |
| — of the total, Mallan-owned (`SL-`/`RL-`/`rls_eligible=false`) | 4 |
| — of the total, on a live listing (Active/AUC/ComingSoon/Pending) | 2,573 |

**Directionality.** Every `primary_photo_r2_key` case is *hero has an `r2_key`, summary has NULL*.
The reverse — a summary asserting a key the hero does not have, which would serve a wrong or missing
object — is **0**. That is why this is a cost defect and not a correctness defect.

### Classifier equivalence

The classifier used in SQL was verified against the production one on the live table before any
population was quoted: canonical active photos **286,457**, naive `media_type='Photo'` active
**286,457**, rows typed Photo but not canonically photos **0**, rows canonically photos typed
otherwise **0**. On today's data the two agree exactly — so the first version's numbers were not
wrong *because of* the classifier, but they were derived by a rule that is not the production rule
and could diverge the moment a floor plan arrives with no MediaCategory. The canonical rule is now
what this document uses.

Two bounded, stated divergences: the classifier's `ShortDescription`/caption branch is inert at this
call site (the caller passes only category, classification, type and URL), and `unwrapProxyUrl` is a
no-op on stored Trestle locators, which are never proxied at rest.

## 3. Impact — why this is not urgent

A NULL `primary_photo_r2_key` makes the card/hero fall back to `media_url_original` through
`/api/media/proxy`. The image is **correct**; it is served from Cotality instead of R2. The cost is
proxy egress and latency on up to 2,573 live listings, not wrong or missing content. No display
gate, attribution, disclosure or price field is involved, so there is no compliance surface.

## 4. Selector

Two forms, deliberately distinguished:

**(a) Broad prefilter** — index-friendly, may over-select; safe to run cheaply and often:

```sql
SELECT l.listing_id
FROM listings l
WHERE l.photo_count IS NOT NULL OR l.primary_photo_url IS NOT NULL;
```

**(b) EXACT selector** — the authoritative membership test. It applies the canonical classifier and
all four summary fields. This is the one whose result must reach 0 after a run:

```sql
WITH cls AS (
  SELECT lm.*,
    CASE
      WHEN lower(coalesce(lm.media_category, lm.media_type,'')) IN ('floorplan','floor plan')
        OR lower(coalesce(lm.media_category, lm.media_type,'')) LIKE '%floor plan%'
        OR lower(coalesce(lm.media_category, lm.media_type,'')) LIKE '%floor_plan%'
        OR lower(coalesce(lm.media_classification,'')) = 'document'
        OR lower(coalesce(lm.media_url_original,'')) ~ '/floorplans?/'
        OR lower(coalesce(lm.media_url_original,'')) ~ 'floor[[:space:]_-]?plans?'
        OR lower(coalesce(lm.media_url_original,'')) ~ '\.pdf(\?|$)'
        OR lower(coalesce(lm.media_url_original,'')) ~ '(^|[/_-])(site[[:space:]_-]?plans?|diagrams?)([/_.-]|$)'
        OR lower(coalesce(lm.media_url_original,'')) ~* '/media/property/document-(gif|jpeg|png|pdf)/'
        THEN false
      WHEN lower(coalesce(lm.media_category, lm.media_type,'')) = 'video'
        OR lower(coalesce(lm.media_category, lm.media_type,'')) LIKE '%video%'
        OR lower(coalesce(lm.media_url_original,'')) ~ '\.(mp4|mov|webm)(\?|$)' THEN false
      WHEN lower(coalesce(lm.media_category, lm.media_type,'')) IN ('virtualtour','virtual tour')
        THEN false
      WHEN lower(coalesce(lm.media_category, lm.media_type,'')) IN ('photo','image','') THEN true
      ELSE false END AS is_photo
  FROM listing_media lm),
hero AS (
  SELECT DISTINCT ON (listing_id) listing_id, media_url_original, r2_key
  FROM cls WHERE status='active' AND is_photo
  ORDER BY listing_id, (preferred_photo_yn AND media_key LIKE 'crm:%') DESC,
           preferred_photo_yn DESC, "order" ASC, id ASC),
cnt AS (SELECT listing_id, count(*)::int AS n FROM cls
        WHERE status='active' AND is_photo GROUP BY listing_id),
pct AS (SELECT listing_id,
               max(greatest(coalesce(media_modification_ts,'-infinity'::timestamp),
                            coalesce(modification_ts,'-infinity'::timestamp))) AS ts
        FROM cls WHERE status='active' GROUP BY listing_id)
SELECT l.listing_id
FROM hero h
JOIN cnt c      ON c.listing_id = h.listing_id
JOIN pct p      ON p.listing_id = h.listing_id
JOIN listings l ON l.listing_id = h.listing_id
WHERE l.primary_photo_r2_key IS DISTINCT FROM h.r2_key
   OR split_part(coalesce(l.primary_photo_url,''),'?',1)
        IS DISTINCT FROM split_part(coalesce(h.media_url_original,''),'?',1)
   OR l.photo_count IS DISTINCT FROM c.n
   OR l.photos_change_timestamp IS DISTINCT FROM nullif(p.ts,'-infinity'::timestamp)
ORDER BY l.listing_id
LIMIT :batch;
```

`IS DISTINCT FROM` is required — `<>` is NULL-blind and would miss the entire dominant class. The
URL comparison strips the query string, which is the SQL expression of the production
`mediaUrlIdentity` rule (origin + pathname); on this population it selects the same 12 rows as a
byte-exact compare, so the choice is about correctness under rotation, not about the count.

## 5. Intended write

Per listing, exactly the fields `computeListingMediaSummary` already owns: `primary_photo_url`,
`primary_photo_r2_key`, `photo_count`, `photos_change_timestamp`.

**The reconciler must not reimplement the summary.** It calls the production
`updateListingMediaSummary(listingId)` — the same function the sync uses — so the backfill cannot
compute a different answer than the live writer, and it inherits the writer's suppress-unchanged
behaviour.

### Exclusions

- Listings with **no** canonically-classified active photo (no hero to derive; leave it alone).
- Anything outside the selector — do not "tidy" adjacent fields.
- **No `modification_timestamp` write.** That column is the Trestle sync cursor
  (`getLastSyncTimestamp` = `MAX(modification_timestamp) WHERE last_synced_from_trestle IS NOT NULL`);
  writing it would poison the cursor and skip real feed changes. This is the single most dangerous
  mistake available here.

## 6. Safety properties

| property | how it is met |
|---|---|
| **Idempotent** | Re-running recomputes the same value from the same rows; a converged listing leaves the selector. |
| **Bounded** | `LIMIT :batch`, default 200, one batch per invocation. |
| **Resumable** | State lives in the data. Kill at any point; the selector returns what is still stale. |
| **Pausable** | Stop invoking it. No lock, no cursor, no partial-run state to unwind. |
| **Write volume** | ≤ 1 `UPDATE` per listing, **4,894 total, one-time**. Measured daily baseline is **~28,351 DB row writes/day**, so the whole backfill is about **17.3% of one day's writes** — spread over batches it is a small addition, but it is NOT negligible. *(The first version said "~0.02% of the ~27.5k timestamp writes/day": both the ratio and the denominator were wrong.)* |
| **Neon impact** | Runs only while the compute is already awake (piggyback on One Cycle, or a manual window). It must never be the reason Neon wakes. |
| **R2 impact** | None. No object is read, written or deleted. |
| **Cache** | Reuse the writer's existing revalidation path. Fresh URLs for pages that already render correctly, so a missed tag degrades to the current state, never worse. At ~1.6 revalidations per changed listing (measured), a full backfill implies roughly 7.8k additional revalidations, one-time. |
| **Audit** | One `audit_events` row per batch: selected, updated, suppressed-unchanged, failed, batch bounds. |
| **Failure recovery** | Per-listing try/catch; a failure leaves that listing stale and it is re-selected next batch. |
| **Rollback** | Not meaningful and not needed — the write moves the summary *toward* the recomputable truth. The pre-state is reconstructible from `listing_media` at any time, and the wrong-object direction is currently 0. |

## 7. Dry run

The tool must support `--dry-run` printing, without writing: total selected, per-class counts,
per-listing before/after, and the count that would be suppressed as already-correct. A dry run over
the full population is a read-only query and is **not** held.

## 8. Post-run verification

Re-run the §4(b) EXACT selector. Required: **0 rows**. Then re-assert the §1 drift check so the run
cannot be confused with a regression in the live writer.

## 9. Why not fold this into the sweep pattern used for R2 policy re-admission

The Phase-4a R2 sweep (PR #599) is the right shape and could be mirrored here — but applying it
would mean issuing ~4,894 Production `UPDATE`s automatically, which is precisely the backfill that
is held. The mechanism is uncontroversial; the *authorization to mutate historical Production rows*
is what is outstanding.

## 10. Status

- **RECONCILIATION DESIGN = CLOSED** (recomputed against the production owners; classes complete)
- **PRODUCTION BACKFILL = HELD** — needs explicit Maya authorization. Nothing here has been
  executed; every number comes from read-only `SELECT`s.
