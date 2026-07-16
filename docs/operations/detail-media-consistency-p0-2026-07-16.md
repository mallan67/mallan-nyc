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

- **`shouldFallbackToLegacyMedia(rows, ctx)`** — two-tier authority:
  - *No relational rows at all* (never imported) → fall back for everyone (nothing was deleted).
  - *Rows exist but none active* → **CRM exclusive** (`SL-`/`RL-` id, or no `mls_id`, or `rls_eligible===false`) is authoritative-empty (deleted Mallan photos never resurrect); **third-party IDX/RLS** falls back to the legacy Cotality-sourced JSON.
- **`resolveDbListingMedia(rows, legacyMedia, ctx, {legacyMapUrl})`** — resolve relational active media first; only on **zero usable** media consult the authority gate. **Never keys on raw `rows.length`.** Touches only the two synchronized Neon sources — **no live Cotality call**.

Wired into:
- `app/listing/[...slug]/page.tsx` (`fetchFromDB`) — the P0 render path.
- `lib/idx/db-to-public-dto.ts` (card/search DTO) — same policy → card/detail **parity**.

Preserved: `revalidate=300`, `dynamicParams`, `generateStaticParams`, DB-only render, address suppression, attribution, distribution gates, photo-first ordering. The orphaned live-fetch gate `shouldFetchTrestleMediaFallback` and its tests are left untouched (not on any render path post-#511).

**Not changed (deliberate):** `app/api/listings/[id]/route.ts` and the `/api/listings` list route query `status='active'` and have their own (live-allowed) fallbacks — their `length` already reflects the active count, so they are not the reported bug. See §6 for the one latent CRM-resurrection follow-up in the card list route.

### Tests (`tests/runtime/detail-media-consistency-p0.test.ts`)
Third-party deleted-rows+JSON → photos; third-party active relational → relational/R2 wins; no rows+JSON → photos; CRM exclusive deleted → `[]`; website-only deleted → `[]`; `rows.length` not the key; card-DTO parity via `dbListingToPublicDTO`; detail-page source-lock (uses `resolveDbListingMedia`, no `rows.length>0` key, no live-feed import/call, `revalidate=300`/`generateStaticParams` intact). **RED→GREEN:** the parity test returns `[]` under the old ternary and the legacy photo under the fix.

## 4. Verification

| Check | Result |
|---|---|
| `type-check` | exit 0 |
| new + `media-display-p0` jest | 87 passed |
| `rls:validate` | 0 errors, exit 0 |
| `compliance-check` | 93 pass, 0 BLOCKER+STRICT, exit 0 |
| `ucba:audit` | 46/46 PASS, **0 REGRESSIONS** |
| `idx:validate` | exit 1 — **pre-existing** critical `db-keepalive → NOT SCHEDULED` (validator trend: "Critical issues unchanged (1)"; tied to the `rotate-db-keys`/`db-keepalive` Neon hold, **not** this change) |

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
4. Card-path parity follow-up: the `/api/listings` list route queries `status='active'`, so an all-deleted **CRM exclusive** would fall to its legacy JSON on the card (latent resurrection). Low incidence; fix by having that route honor the same `resolveDbListingMedia` authority (needs all-status fetch — weigh against the #511 compute budget).

All Phase-3 items require explicit Maya authorization and a separate reviewed change before any production write.
