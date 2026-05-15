# API-MAP.md — Search-Related API Endpoints

> **Maintained by:** Mallan Search Cartographer.

## `/api/listings` (GET) — primary list endpoint

**Path strategy:** DB-first (Prisma) → live Trestle fallback. Hard 60s `maxDuration`.

**Request params (read by `app/api/listings/route.ts`):**

| Param | Type | Read at | Notes |
|-------|------|---------|-------|
| `type` | `sale | rent | buy` | line 186 | `buy` is treated as `sale`. **Anything else is silently ignored** (currently a documented defect — see KNOWN-REGRESSIONS R-TYPE-FALLTHROUGH). |
| `address` | string | inside `buildPublicListingDbSearch` | The PRIMARY text-search param. Numbered-address heuristic at route.ts:230. |
| `q` | string | **NOT read by `/api/listings`** | `q=` is written by some surfaces but the list endpoint ignores it. Defect — see R-Q-IGNORED. |
| `neighborhood` | string (comma-list) | inside helper | Maps to `Listing.neighborhood` + ZIP-set widening |
| `borough` | string | line 188 | Manhattan / Brooklyn / Queens / Bronx / Staten Island |
| `zip` | string | inside helper | Postal code |
| `minPrice` / `maxPrice` | int | line 189-190 | Decimal range |
| `beds` | int | line 191 | `beds=0` = studio exact, else min |
| `minBaths` | int | searchParams.get | |
| `propertySubTypes` / `subTypes` | csv | helper | Both accepted as aliases |
| `propertyType` | string | helper | Condo, Co-op, etc. |
| `status` | string | helper | Filters StandardStatus |
| `amenities` | csv | helper | Pet-friendly works on both DB + Trestle path; others DB-only |
| `furnished` | bool | helper | |
| `yearBuilt` | string | helper | |
| `openHouse` | bool | line 198 | Triggers OpenHouse resource lookup |
| `openHouseDate` | string | line 199 | `weekend` or ISO date |
| `bounds` | csv `S,W,N,E` | line 573 | Post-filter (no Trestle geo filter) |
| `sort` | enum | line 192 | price-asc/desc, sqft-desc, beds-desc, newest, neighborhood, new-development, exclusives |
| `skip` / `limit` | int | line 193-194 | Pagination, limit capped at 200 |
| `featured` | bool | helper | Featured-only filter |
| `exclusive` | string | line 207 | Only `mallan` activates the Mallan-authored filter; everything else ignored |
| `near` | csv `lat,lng` | helper | Geolocation |
| `pets` | bool | helper | Mapped through amenities |

**Response envelope:**

```json
{
  "success": true,
  "count": <n in this page>,
  "total": <total matching>,
  "skip": <int>,
  "limit": <int>,
  "hasMore": <bool>,
  "listings": [PublicListingDTO, ...],
  "_compliance": {
    "source": "db+idx" | "db+exclusive" | "db+mixed" | "idx+exclusive" | ...,
    "idxEnabled": true,
    "attribution": "Listing courtesy of ...",
    "disclaimer": "Listing data provided by the Real Estate Board ..."
  }
}
```

**Compliance enforcement:**
- `filterDisplayableDbListings` → 6 distribution gates
- `dbListingToPublicDTO` → strips agent PII, applies address suppression, classifies `_source`
- `_compliance.attribution` + `_compliance.disclaimer` always present

---

## `/api/listings/[id]` (GET) — detail endpoint

**Path strategy:** DB-first by `listing_id` → live Trestle fallback via `fetchSingleListing`. Media via `fetchListingMedia` (proxied through `/api/media/proxy` when Trestle/Cotality host).

**Response shape:** identical DTO to the list endpoint, with extra fields (full media array, open-house schedule, etc.).

**Compliance:** same — RLS attribution, disclaimer, address suppression, agent PII strip.

---

## `/api/listings/suggest` (GET) — autocomplete

**Request:** `q=<string>` (`q.length >= 2` required).

**Response:**
```json
{ "success": true, "suggestions": [{type, label, sublabel, value}, ...] }
```

**Source mix:**
1. Boroughs (local — 5 hard-coded strings)
2. Neighborhoods (local — `data/[borough]-neighborhoods.json`)
3. Agents (DB — Mallan brokerage only)
4. Listing IDs (Trestle, when `/^(RLS|rls)?\d{3,}$/` matches — **OVER-EAGER** per R-425)
5. Address / ZIP (Trestle, when not listing-ID and not ZIP-numeric)

**Known defects:**
- R-425 — `/^\d{3,}$/` regex catches 3+ digit numerics → routes to ZIP branch → 0 results.
- R-AFFIRM — fail-closed `affirmPermission(InternetAddressDisplayYN)` strips most results per the 2026-04-30 IDX-Plus pre-filter learning.

---

## `/api/listings/similar` (GET) — comparable listings

**Used by:** listing detail page.
**Compliance:** same gate set as `/api/listings`.

---

## `/api/listings/building` (GET) — building profile

**Used by:** building landing pages.
**Compliance:** same.

---

## `/api/media/proxy` (GET) — Bearer-auth Trestle media proxy

**Hosts in allowlist:** `api.cotality.com`, `api-trestle.corelogic.com`, `api-prod.corelogic.com`.
**Auth:** server-side Bearer token from `getAccessToken()`.
**Concurrency:** semaphore at 30 concurrent.
**Cache:** 7-day CDN.
**Edge case:** older Trestle URL patterns (e.g., `/Media/Property/PHOTO-Jpeg/{numeric}/.../`) return 404 on Trestle; the proxy passes through. Newer base64-encoded paths work.

---

## `/api/media/batch` (GET) — batch media fetch

**Used by:** CRM listing manager, search inline backfill (the 90% pre-PR-#120 path).
**Auth:** server-side. **Compliance:** uses `ResourceRecordKey` per the 2026-04-07 Trestle vendor guidance.

---

## Tab → API contract (the invariant)

| Tab | `apiType` | `commercial` | API `type` param | Expected response `listingType` |
|-----|-----------|--------------|------------------|--------------------------------|
| `buy-residential` | `sale` | `false` | `buy` (interpreted as sale) | `sale` |
| `rent-residential` | `rent` | `false` | `rent` | `rent` |
| `buy-commercial` | `sale` | `true` | `buy` + commercial filter | `sale` (commercial sub-types only) |
| `rent-commercial` | `rent` | `true` | `rent` + commercial filter | `rent` (commercial sub-types only) |

**Audit requirement:** every Cartographer run must call all 4 tab variants and assert `every(l => l.listingType === expected)`. Any mismatch = REGRESSION.

## Cross-links

- Routes: `ROUTES.md`
- Flows: `SEARCH-FLOWS.md`
- Components: `COMPONENT-MAP.md`
- Compliance: `COMPLIANCE-SURFACES.md`
- Defects: `KNOWN-REGRESSIONS.md`
