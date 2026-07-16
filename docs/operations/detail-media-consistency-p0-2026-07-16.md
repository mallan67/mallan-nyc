# Detail/Card Media-Consistency P0 — 2026-07-16

**Branch:** `agent/fix-detail-media-consistency-p0` (from `origin/main` @ `19f0721b`, the PR #511 merge)
**Status:** DRAFT PR — code + tests landed; **Phase 1 audit and Phase 3 backfill are PREPARED, NOT EXECUTED** (await Maya authorization).
**Do NOT** treat any SQL/backfill here as run. No production writes, backfill, deploy, Neon/Vercel settings, cron, or campaign changes were made. **PR #511 is untouched.**

---

## 1. Symptom & reproduction

- Featured / search **cards show photos**, but the **listing detail page shows the gray placeholder** for the same listing.
- Repro: `RLS20103891` → `/listing/372-5th-avenue-apt-7m-new-york-city-ny-10018/rls20103891`.

## 2. Root cause

### 2a. Code-level (the render mismatch) — CONFIRMED by source + tests

Both surfaces ran the **same** ternary but fed it **different row sets**:

```
rows.length > 0 ? resolveListingMediaFromRows(rows) : resolveListingMedia(legacyJson)
```

| Surface | `listing_media` query | All-deleted listing → | Result |
|---|---|---|---|
| Card list API (`app/api/listings/route.ts`) | `where: { status: 'active' }` | `rows = []` → `length>0` false → legacy JSON branch | **photos** |
| Detail page (`app/listing/[...slug]/page.tsx`, `LISTING_MEDIA_INCLUDE`) | **all statuses** (needed for CRM deletion authority) | `rows.length>0` true → `resolveListingMediaFromRows` filters to active → `[]`, **no fallback** | **placeholder** |

`resolveListingMediaFromRows` filters to `status='active'` and returns `[]` when none are active. Because the detail page keyed the fallback on **raw `rows.length`** (all statuses), a listing whose only rows are `deleted`/`replaced` committed to the relational path and never reached the legacy fallback. The detail page fetching *all* statuses (correct, for CRM deletion authority) is exactly what silently disabled the fallback.

### 2b. Sync-level (why relational rows are all inactive) — from `lib/idx/media-sync.ts` + schema

Two soft-delete mechanisms leave a listing with **inactive-only** relational rows while the legacy JSON survives:

1. **`tombstoneVanished`** (`media-sync.ts:668–697`): active Trestle rows whose `media_key` is `notIn` the current Media set are set `status='deleted'`. The **empty-input case** (`seenKeys.size===0`) tombstones **every** active non-`crm:` row for the listing — so a transient empty/partial Cotality Media fetch can blank the whole relational set.
2. **R2 3-strike 404 tombstone** (Cp4 mirror path; `r2_attempts`): after 3 confirmed HTTP 404s on a stale Cotality source URL, the row is soft-deleted to stop the retry loop (`schema.prisma` `ListingMedia.r2_attempts` note).

Neither path re-imports at the relational level, and the legacy `listings.media` JSON is written by a different sync path that is **not** tombstoned — hence the card/detail divergence.

> Alignment note: the live feed is the **Cotality API** (`https://api.cotality.com/trestle`). Legacy `corelogic.com` hosts remain allowlisted in the media proxy only through the 2026‑03‑31 transition.

## 3. The fix (DB-only, ISR-safe, PR #511 intact)

New shared policy in `lib/media/listing-media-resolver.ts`:

- **`isMallanOwnedListing(ctx)`** — provenance authority mirroring the repo's canonical `classifyDbListing`: `rls_eligible === false` → website-only; `agent_id` **or** `owner_client_id` non-null → Mallan exclusive; `SL-`/`RL-` id namespace → reinforcing. **`mls_id` is NOT a signal** — a caller (e.g. `/api/listings`) may not even select it, so a missing `mls_id` must never classify a row as Mallan-owned.
- **`shouldFallbackToLegacyMedia(hadRelationalRows, ctx)`** — two-tier authority:
  - *`hadRelationalRows === false`* (never imported) → fall back for everyone (nothing was deleted).
  - *rows existed but none active* → **Mallan-owned** listing is authoritative-empty (deleted photos never resurrect); **third-party Cotality/IDX/RLS** falls back to the legacy Cotality-sourced JSON.
- **`resolveDbListingMedia(rows, legacyMedia, ctx, {hadRelationalRows, legacyMapUrl})`** — resolve relational active media first (**always wins**); only on **zero usable** media consult the authority gate. **Never keys on raw `rows.length`.** `hadRelationalRows` is a caller-supplied all-status existence signal (not derived from the passed rows), so active-only callers stay correct. Touches only the two synchronized Neon sources — **no live Cotality call**.

Wired into:
- `app/listing/[...slug]/page.tsx` (`fetchFromDB`) — the P0 render path. Fetches ALL statuses, so `hadRelationalRows = listingMediaRows.length > 0`.
- `lib/idx/db-to-public-dto.ts` (card/search DTO) — same policy; prefers `_count.listing_media` for `hadRelationalRows` when present.
- `app/api/listings/route.ts` (card list route, Phase-2 DB fallback) — **closes the card-side deletion-authority gap**: it selects only ACTIVE rows, so it now also selects **`_count: { select: { listing_media: true } }`** in the SAME batched `findMany` (a Prisma aggregate subquery — **no N+1, zero extra per-listing queries**) to supply the all-status existence signal, plus `rls_eligible`/`agent_id`/`owner_client_id` for provenance. Result: an all-deleted **Mallan** exclusive no longer resurrects its legacy JSON on the card, while a third-party Cotality listing falls back to its Cotality JSON — matching the detail page exactly.

Preserved: `revalidate=300`, `dynamicParams`, `generateStaticParams`, DB-only render, address suppression, attribution, distribution gates, photo-first ordering. The orphaned live-fetch gate `shouldFetchTrestleMediaFallback` and its tests are left untouched (no broad legacy renames in this P0).

**Not changed (deliberate):** `app/api/listings/[id]/route.ts` queries `status='active'` and has its own (live-allowed) API fallback — not the DB-only render path, not the reported bug.

### Tests (`tests/runtime/detail-media-consistency-p0.test.ts`)
`isMallanOwnedListing` provenance (incl. **missing `mls_id` → still third-party**, and `agent_id`/`owner_client_id` → Mallan); third-party deleted-rows+JSON → photos; active relational always wins; no rows+JSON → photos; Mallan-owned (agent_id / SL- / website-only) deleted → `[]`; `_count`-based `hadRelationalRows` for active-only callers (card gap); card-DTO parity via `dbListingToPublicDTO`; detail-page source-lock (provenance not `mls_id`, no `rows.length>0` ternary, no live-feed import/call, ISR intact); **`/api/listings` source-lock: selects `_count.listing_media`, active-only rows, one batched `prisma` call — zero N+1**. The `lib/search` detail-gallery source-lock was updated to the shared getters (`getPhotoGallery`/`getFloorplans`).

## 4. Verification — full CI chain (all `pr-check.yml` gates)

| Check | Result |
|---|---|
| `type-check` | exit 0 |
| **`jest --ci` (ALL 285 suites)** | **4825 passed, 0 failed** |
| `rls:validate` | 0 errors, exit 0 |
| `ucba:audit` | 46/46 PASS, **0 REGRESSIONS**, exit 0 |
| `crm:test` | 39/39, exit 0 |
| `validate:form-rls` | exit 0 |
| `ci-compliance-check` | 93 pass, 0 BLOCKER+STRICT, exit 0 |
| `audit:display-compliance` | 11/11 gated, exit 0 |
| `build` | exit 0 |

> `idx:validate` is **not** part of `pr-check.yml`, so its 1 **pre-existing** critical (`db-keepalive → NOT SCHEDULED`; trend "unchanged (1)"; the documented `rotate-db-keys`/`db-keepalive` Neon hold) does not gate CI. The prior CI red (run #1079) was a Jest failure — a brittle source-lock in `lib/search/__tests__/media-display-p0.test.ts` asserting the detail page string-contains `"resolveListingMedia"`; the call-site rename to `resolveDbListingMedia` broke the literal match. Fixed by asserting the shared getters the gallery actually uses.

---

## 5. Phase 1 — READ-ONLY population audit (PREPARED, NOT RUN)

> Run **read-only** against canonical production **only after Maya authorizes**:
> `hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2` / branch `main`. No writes.

```sql
-- Q0a. RLS20103891 — relational status breakdown + URL availability
SELECT status,
       count(*)                                               AS rows,
       count(*) FILTER (WHERE media_type = 'Photo')           AS photo_rows,
       count(*) FILTER (WHERE media_url_cached  IS NOT NULL)  AS with_cached,
       count(*) FILTER (WHERE media_url_original IS NOT NULL) AS with_original,
       count(*) FILTER (WHERE media_key LIKE 'crm:%')         AS crm_rows
FROM listing_media
WHERE listing_id = 'RLS20103891'
GROUP BY status ORDER BY status;

-- Q0b. RLS20103891 — legacy JSON count + listing-type signals
SELECT listing_id, mls_id, rls_eligible, status AS listing_status, idx_display_yn,
       jsonb_array_length(COALESCE(media, '[]'::jsonb)) AS legacy_media_count
FROM listings WHERE listing_id = 'RLS20103891';

-- Q0c. RLS20103891 — legacy JSON URLs (confirm the ~7 photos; R2-cached vs raw Cotality)
SELECT ord, item ->> 'url' AS url, item ->> 'mediaType' AS media_type
FROM listings,
     LATERAL jsonb_array_elements(COALESCE(media,'[]'::jsonb)) WITH ORDINALITY AS t(item, ord)
WHERE listing_id = 'RLS20103891' ORDER BY ord;

-- Q1. Sitewide buckets across publicly-displayable listings, split by listing kind.
WITH disp AS (
  SELECT l.listing_id, l.mls_id, l.rls_eligible,
         jsonb_array_length(COALESCE(l.media,'[]'::jsonb)) AS legacy_count,
         CASE
           WHEN l.rls_eligible = false                                   THEN 'website_only'
           WHEN l.listing_id LIKE 'SL-%' OR l.listing_id LIKE 'RL-%'
                OR l.mls_id IS NULL                                       THEN 'crm_exclusive'
           ELSE 'third_party_idx'
         END AS listing_kind
  FROM listings l
  WHERE l.idx_display_yn = true
),
mediastats AS (
  SELECT lm.listing_id,
         count(*)                                    AS total_rows,
         count(*) FILTER (WHERE lm.status='active')  AS active_rows,
         count(*) FILTER (WHERE lm.status='active' AND lm.media_type='Photo'
                    AND COALESCE(lm.media_url_cached, lm.media_url_original) IS NOT NULL) AS active_photos,
         count(*) FILTER (WHERE lm.status IN ('deleted','replaced')) AS inactive_rows
  FROM listing_media lm GROUP BY lm.listing_id
)
SELECT d.listing_kind, count(*) AS listings,
  count(*) FILTER (WHERE COALESCE(m.active_photos,0) > 0)                                      AS a_active_photos,
  count(*) FILTER (WHERE COALESCE(m.total_rows,0) > 0 AND COALESCE(m.active_photos,0) = 0)     AS b_rows_but_no_active,
  count(*) FILTER (WHERE COALESCE(m.active_photos,0) = 0 AND d.legacy_count > 0)               AS c_legacy_has_photos,
  count(*) FILTER (WHERE COALESCE(m.active_photos,0) = 0 AND d.legacy_count = 0)               AS d_both_empty,
  count(*) FILTER (WHERE COALESCE(m.total_rows,0) > 0 AND COALESCE(m.active_rows,0) = 0)       AS f_all_inactive,
  count(*) FILTER (WHERE d.listing_kind='third_party_idx' AND COALESCE(m.total_rows,0) > 0
             AND COALESCE(m.active_photos,0) = 0 AND d.legacy_count > 0)                       AS e_card_detail_divergent
FROM disp d LEFT JOIN mediastats m ON m.listing_id = d.listing_id
GROUP BY d.listing_kind ORDER BY d.listing_kind;

-- Q2. Affected third-party listings (card/detail divergence) — IDs for spot-check + backfill scope.
WITH disp AS (
  SELECT l.listing_id, l.mls_id, jsonb_array_length(COALESCE(l.media,'[]'::jsonb)) AS legacy_count
  FROM listings l
  WHERE l.idx_display_yn = true AND l.rls_eligible IS DISTINCT FROM false
    AND l.mls_id IS NOT NULL
    AND l.listing_id NOT LIKE 'SL-%' AND l.listing_id NOT LIKE 'RL-%'
),
mediastats AS (
  SELECT listing_id,
         count(*) AS total_rows,
         count(*) FILTER (WHERE status='active' AND media_type='Photo'
                    AND COALESCE(media_url_cached, media_url_original) IS NOT NULL) AS active_photos
  FROM listing_media GROUP BY listing_id
)
SELECT d.listing_id, d.mls_id, m.total_rows, d.legacy_count
FROM disp d JOIN mediastats m ON m.listing_id = d.listing_id
WHERE m.total_rows > 0 AND m.active_photos = 0 AND d.legacy_count > 0
ORDER BY d.legacy_count DESC
LIMIT 500;

-- Q3. Soft-delete cause attribution across inactive Trestle rows (404-exhausted vs vanished/other).
SELECT count(*)                                            AS inactive_trestle_rows,
       count(*) FILTER (WHERE r2_attempts >= 3)            AS r2_404_exhausted,
       count(*) FILTER (WHERE COALESCE(r2_attempts,0) < 3) AS vanished_or_other
FROM listing_media
WHERE status IN ('deleted','replaced') AND media_key NOT LIKE 'crm:%';
```

**Bucket key:** A=active photos OK · B=rows exist, 0 active usable · C=0 active but legacy JSON has photos (the fixable set) · D=both empty (needs re-sync/backfill) · E=third-party card/detail divergence (the reported class; fixed at render by this PR) · F=rows all inactive (CRM-authority set).

## 6. Phase 3 — sync repair + backfill plan (PREPARED, NOT EXECUTED)

**Render fix vs data fix:** this PR makes the detail page render the legacy JSON for buckets C/E, so 372 Fifth Ave and its class stop showing placeholders **without any DB write**. Buckets **B (no active + no legacy) and D (both empty)** are a *data* gap this render fix cannot cover — they need the backfill below.

**Root causes to remediate (see §2b):** (1) `tombstoneVanished` mass-tombstone on empty/partial Cotality Media fetches; (2) R2 3-strike 404 tombstone on stale source URLs; (3) no relational re-import when a still-listed property's Media set transiently empties.

**Proposed backfill (pending authorization — do NOT run):**
1. Scope from **Q2** (affected third-party IDs). Estimated write volume = `Σ legacy_count` over the affected set (≈ rows to re-materialize). Report the exact count from the audit before proposing execution.
2. For each affected third-party listing, re-fetch the current Cotality Media set (operational tool / sync job — **never** the public render path) and re-`upsert` active `listing_media` rows, re-mirroring to R2. Idempotent on `media_key`; reuse the existing importer's restore-on-soft-deleted path.
3. Guardrail candidates (separate PRs): don't tombstone-vanish on an **empty** Media fetch unless corroborated by a Property-level `PhotosCount=0`/`PhotosChangeTimestamp`; treat R2 404-exhaustion as "needs re-fetch of source URL," not permanent death.

> Card-path parity — **now fixed in this PR** (was a follow-up): `/api/listings` selects only active rows, so an all-deleted **Mallan** exclusive previously would have fallen to its legacy JSON on the card. Closed via `_count.listing_media` (all-status existence signal, no N+1) + provenance through the shared `resolveDbListingMedia`.

All Phase-3 items require explicit Maya authorization and a separate reviewed change before any production write.
