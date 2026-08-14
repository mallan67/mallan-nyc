# Cotality / Trestle live `$metadata` evidence — 2026-08-13

Raw, unedited tool output preserved so every Class-B claim in PR #608 is
directly auditable rather than existing only as prose in a commit message.

**Source:** `trestle-fields` MCP server, which fetches live from the Trestle
`$metadata` endpoint (`https://api.cotality.com/trestle`) and reports its own
cache age. Every capture below reported **"Cached 0m ago"**.

**Reproduce:** re-run the same three lookups. The server refreshes from live
`$metadata` every 10 minutes, so a divergent result means the feed changed, not
that this record was wrong.

> **Scope of what this proves.** These are `$metadata` (schema) captures: they
> prove which fields and enum values the feed DECLARES. They do **not** prove
> which values are populated on any listing — that claim is made separately from
> the production `listing_media` census in §3, which is a Neon read, not a
> Cotality read.

---

## 1. `Media.MediaCategory` — 18 live values

Query: `trestle_get_picklist(field_name="MediaCategory", resource="Media")`

```
# Picklist: MediaCategory
**Enum type:** MediaCategory
**Resource:** Media
**Total values:** 18

| Value | Integer |
|-------|---------|
| `Addendum` | 0 |
| `AerialView` | 1 |
| `AgentPhoto` | 2 |
| `BrandedVirtualTour` | 3 |
| `Disclosure` | 4 |
| `Document` | 5 |
| `FloorPlan` | 6 |
| `Map` | 7 |
| `OfficeLogo` | 8 |
| `OfficePhoto` | 9 |
| `Other` | 10 |
| `Photo` | 11 |
| `RentalDocuments` | 12 |
| `Restriction` | 13 |
| `Survey` | 14 |
| `Topography` | 15 |
| `UnbrandedVirtualTour` | 16 |
| `Video` | 17 |

---
*Cached 0m ago — refreshes every 10m from live Trestle $metadata*
```

### 1.1 Divergence from the in-repo registry

`data/RLS-FIELD-REGISTRY.md:147` states:

> **MediaCategory enum values:** FloorPlan, Photo, Video, AgentPhoto, OfficePhoto, GroundPhoto

Comparing that list against the live capture above:

| | |
|---|---|
| In the registry, NOT live | `GroundPhoto` |
| Live, NOT in the registry (13) | `Addendum`, `AerialView`, `BrandedVirtualTour`, `Disclosure`, `Document`, `Map`, `OfficeLogo`, `Other`, `RentalDocuments`, `Restriction`, `Survey`, `Topography`, `UnbrandedVirtualTour` |

**The in-repo registry is stale.** It is documentation, not a code path, so
nothing depends on it at runtime — but it should not be cited as field authority
until refreshed (`npm run trestle:refresh-csv` / `trestle:diff`).

### 1.2 Consequence for `classifyTrestleMediaCategory` — LATENT, not live

`lib/media/media-sync-service.ts:142-167` matches `floorplan` / `virtualtour` /
`video` substrings and returns `"Photo"` for everything else, including its
`!category` guard.

Applying it to each live value:

| live MediaCategory | classifier result | correct? |
|---|---|---|
| `Photo` | Photo | yes |
| `FloorPlan` | FloorPlan | yes |
| `Video` | Video | yes |
| `BrandedVirtualTour` | VirtualTour | yes (contains `virtualtour`) |
| `UnbrandedVirtualTour` | VirtualTour | yes (contains `virtualtour`) |
| `AerialView` | Photo | defensible — it is a photo |
| `AgentPhoto` | Photo | **no** — agent headshot, not listing media |
| `OfficePhoto` | Photo | **no** — office building, not the listing |
| `OfficeLogo` | Photo | **no** — a logo |
| `Addendum` | Photo | **no** — document |
| `Disclosure` | Photo | **no** — document |
| `Document` | Photo | **no** — document |
| `Map` | Photo | **no** |
| `RentalDocuments` | Photo | **no** — document |
| `Restriction` | Photo | **no** — document |
| `Survey` | Photo | **no** — document |
| `Topography` | Photo | **no** |
| `Other` | Photo | **no** — unknown |

The classifier's own comment claims it "accepts every MediaCategory variant
Trestle has emitted (verified live 2026-05-01)". Against the current enum that
verification is **stale**.

**This is LATENT, not a live display violation** — see §3. Logged as hardening;
deliberately NOT remediated in PR #608, which does not change the classifier.

---

## 2. `Media` resource field list + `Property.PhotosChangeTimestamp`

Query: `trestle_list_fields(resource="Media", type_filter="all")` — 56 fields.
The six the legacy projection reads are all present and all in
`defaultFetchMedia`'s `$select` (`lib/idx/media-sync.ts:3350-3353`):

| field | live type |
|---|---|
| `MediaURL` | String [8000] |
| `MediaKey` | String [20] |
| `MediaCategory` | Enum -> MediaCategory |
| `MediaStatus` | Enum -> MediaStatus |
| `Order` | Int32 |
| `PreferredPhotoYN` | Boolean |

`MediaClassification` is a SEPARATE enum from `MediaCategory` — 6 values, and
note the case-duplicated members:

```
# Picklist: MediaClassification
**Enum type:** MediaClassification
**Resource:** Media
**Total values:** 6

| Value | Integer |
|-------|---------|
| `Document` | 0 |
| `Photo` | 1 |
| `Video` | 2 |
| `PHOTO` | 3 |
| `DOCUMENT` | 4 |
| `VIDEO` | 5 |

---
*Cached 0m ago — refreshes every 10m from live Trestle $metadata*
```

Query: `trestle_lookup_field(field_name="PhotosChangeTimestamp", resource="Property")`

```
# PhotosChangeTimestamp

## Resource: Property
- **Type:** DateTime
- **Precision/Scale:** 27/0
- **Nullable:** true

---
*Data from Trestle $metadata — cached 0m ago, refreshes every 10m*
```

**`Nullable: true` is load-bearing.** The media lane resumes with a comparison
predicate on `PhotosChangeTimestamp` in all three branches
(`lib/idx/media-sync.ts:3272-3278`). In OData a comparison against `null`
evaluates to unknown and the row is excluded, so a listing with a NULL
`PhotosChangeTimestamp` can never match ANY media-cursor filter. This is now a
verified schema property, not an inference.

---

## 3. Which categories actually appear in production (Neon read, NOT Cotality)

Read-only query against `hidden-mountain-87248164` (canonical production),
2026-08-13:

```sql
SELECT media_category, media_type, COUNT(*) AS rows,
       COUNT(*) FILTER (WHERE status='active') AS active_rows
FROM listing_media
GROUP BY media_category, media_type
ORDER BY rows DESC;
```

| media_category | media_type | rows | active_rows |
|---|---|---:|---:|
| `Photo` | Photo | 323,697 | 290,029 |
| `FloorPlan` | FloorPlan | 21,722 | 20,324 |
| `BrandedVirtualTour` | VirtualTour | 2 | 0 |
| `Video` | Video | 1 | 0 |

Four categories, full stop. **None of the document-class categories from §1.2
appear in production data**, which is why the classifier gap is latent rather
than a live Fair-Housing/display exposure. It also confirms the
`BrandedVirtualTour -> VirtualTour` mapping is working on real rows.

This is the evidence that canonical `listing_media.media_type` can serve
`has_floorplan` / `has_video` / `has_virtual_tour` without reading the legacy
JSON.

---

## 4. What was NOT verified

- **No live Cotality DATA query was run** — no `$filter`/`$orderby` request
  against `/odata/Property` or `/odata/Media` returning listing rows. This
  environment has no `IDX_CLIENT_ID` / `IDX_CLIENT_SECRET`, so only the
  `$metadata`-backed MCP lookups above were available.
- Consequently the claim "live Cotality accepts
  `$orderby=ModificationTimestamp asc,ListingKey asc` and the paired keyset
  filter" is carried forward from an EARLIER session's probe and is **NOT
  re-verified here**. PR #608 does not depend on that claim being re-proved: the
  bootstrap boundary is deliberately replay-safe (`ge`, not `gt`) precisely so
  correctness does not rest on an unverified completeness assumption.
- No claim is made here about which ListingKeys exist at any given
  ModificationTimestamp at source.
