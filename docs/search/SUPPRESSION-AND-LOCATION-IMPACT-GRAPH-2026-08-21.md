# Suppression & location — consumer impact graph

**One complete trace before any reader is patched.** Produced by reading the committed
code, not by patching surfaces as they were discovered. Production Neon was NOT queried —
the acceptance window is open — so every row marked UNVERIFIED stays unverified.

Two invariants under test:

1. **Suppression** — a verified Mallan-office Cotality representation must never produce a
   second listing identity or a second consumer result, anywhere.
2. **Location** — coordinates are map-rendering support, never a canonical listing fact,
   and must never be fabricated for a listing whose address may not be shown.

---

## A. THE HEADLINE DEFECT — suppression stops at the projection boundary

`lib/search/listing-access-decision.ts` exports two gates. Only one suppresses:

| gate | suppression | feeds |
|---|---|---|
| `buildSearchDisplayWhere` | **`AND: [excludeMallanRlsReturnCopies()]`** | the `Listing`-backed public read path |
| `buildProjectionSearchWhere` | **NONE** — returns `PROJECTION_DISPLAY_GATE` + status only | `criteriaToProjectionWhere` → `runProjectionListingSearch` → Saved Search count/execute → search-alerts cron |

So every consumer on the **projection** path can independently surface a Mallan-office
Cotality representation as its own listing. That is the concrete form of the concern that
suppression was built as *public* suppression: the authenticated and automated surfaces
inherited none of it.

This is a **contract defect, not a data defect**. Whether any of the two live
search-eligible representations currently appears in a Saved Search result is UNVERIFIED
and requires production Neon.

---

## B. CONSUMER MATRIX

`suppressed?` = does this consumer consult the suppression authority at all.
`local preferred?` = does it resolve to the canonical local twin when one exists.

| consumer | source | suppressed? | affects count/total? | local preferred? | unresolved-representation behaviour | duplicate risk | correction required |
|---|---|---|---|---|---|---|---|
| public listing detail `app/listing/[...slug]` | Listing | **yes** — `resolveReturnCopyCanonicalTarget` | n/a | yes → redirects to twin | fail-closed 404 | none | none |
| public suggest `/api/listings/suggest` | Listing | **yes** | yes | n/a | excluded | none | none |
| similar `/api/listings/similar` | Listing | **yes** | yes | n/a | excluded | none | none |
| agent listings `/api/agents/[slug]/listings` | Listing | **yes** | yes | n/a | excluded | none | none |
| sitemap `app/sitemap.ts` | Listing | **yes** | n/a | n/a | excluded | none | none |
| building data `lib/buildings/public-building-data.ts` | Listing | **yes** | yes | n/a | excluded | none | none |
| public `/api/listings` DB path | Listing via `buildSearchDisplayWhere` | **yes** | yes — before skip/take | n/a | excluded | none | none — public is zero-delta |
| **projection search** `lib/search/core.ts` | Projection | **NO** | **yes** | **no** | **surfaces independently** | **HIGH** | apply suppression at the projection gate |
| **Saved Search count** `/api/crm/saved-searches` | Projection | **NO** | **yes** | **no** | **counted** | **HIGH** | same one gate |
| **Saved Search execute** `/api/crm/saved-searches/[id]/execute` | Projection | **NO** | **yes** | **no** | **returned** | **HIGH** | same one gate |
| **alert replay** `/api/cron/search-alerts` | Projection | **NO** | **yes** | **no** | **emailed to a client** | **HIGH** | same one gate |
| CRM listings `/api/crm/listings` | Listing + participation scope | **no** | yes | no | appears in the agent's own list | **needs decision** | see §C |
| CMA engine `lib/cma/engine.ts` | own `prisma.listing.findMany` | **no** | yes | no | enters the comparable pool | **HIGH** | route through the canonical engine |
| Open Houses `lib/open-houses/upcoming-open-houses.ts` | Listing | **no** | yes | no | UNVERIFIED | needs trace | trace before deciding |
| Media / hero / gallery | `listing_media` by provider key | **no** | n/a | **no** | UNVERIFIED | **HIGH** — parallel media authority | identity must resolve first |
| results map (authenticated) | client, consumes result set | inherits caller | inherits | inherits | inherits | inherits | fixed by fixing its source |
| public search map | client, consumes DTO | inherits (suppressed upstream) | inherits | n/a | n/a | none | none |

**One gate fixes four rows.** Projection search, Saved Search count, Saved Search execute
and alert replay all pass through `buildProjectionSearchWhere`. That is the correction to
make — not four patches. It also honours "do not add another suppression implementation":
the authority already exists and simply is not called there.

---

## C. CRM LISTINGS NEEDS A PRODUCT DECISION, NOT A PATCH

`/api/crm/listings` scopes to the caller's proven participation. A Mallan agent's own
Cotality representation legitimately IS their participation, so excluding it blindly could
hide a real record from the person who listed it.

Two defensible behaviours, and this is Maya's call:

1. **Suppress like everywhere else** — the agent sees only the canonical local listing.
2. **Show it as explicitly labelled provider evidence** — visibly not a second listing,
   never editable, never counted as separate inventory.

What is NOT acceptable is the current state: it appears with no indication that it is the
provider's copy of a listing the agent already owns locally.

---

## D. LOCATION FINDINGS

### D.1 Cotality supplies no coordinates

`lib/geo/geocode.ts` states the IDX Plus feed returns null `Latitude`/`Longitude`.
Coordinates come from the **US Census** geocoder via `scripts/batch-geocode.js` into
`geocode_cache` (`source=census`). No Google, Mapbox or other authority is involved, and
none may be introduced.

### D.2 Two independent layers fabricate precise-looking positions

| layer | fallback | error |
|---|---|---|
| `lib/geo/geocode.ts` step 3 | ZIP centroid + deterministic hash jitter | up to ZIP-wide |
| `public/crm/js/render/results-map.js` | neighborhood centroid + spiral offset | several blocks |

Both produce a marker that *looks* like a building position. Required instead: resolved
address → exact pin; neighborhood only → explicitly neighborhood-level; unresolvable → **no
pin**. Never manufacture a nearby point so a marker appears.

Distinct from presentation: the public map's `0.00012°` separation of listings sharing one
coordinate is *stacking*, not location. For authenticated Search, prefer one exact building
position with grouping/stacking unless the design exploration proves otherwise.

### D.3 PUBLIC COMPLIANCE DEFECT — RECORDED, NOT PATCHED (public is zero-delta)

Verified by reading the committed code:

1. `dbListingToPublicDTO` emits `latitude`/`longitude` only when present, and the
   address-display gate suppresses street/unit.
2. **`postalCode` is emitted unconditionally** and survives suppression.
3. `/api/listings` calls `geocodeListings(publicListings)` **after** the DTO is built.
4. `geocodeListings` step 3 reads `addr.postalCode` and assigns
   `addr.latitude`/`addr.longitude` from a ZIP centroid + jitter.

So a listing whose address may not be displayed can **reacquire plottable coordinates after
the compliance gate**, and be mapped.

**Not fixed here** — public consumer Search is out of scope and held at zero-delta. Recorded
so it is not lost.

Required future proof: address display denied → complete `/api/listings` pipeline →
`latitude` absent → `longitude` absent → no map marker.

### D.4 Public Search confirms the architectural boundary

Its chain is `app/search/page.tsx → useListings → /api/listings → PublicListingDTO →
DisplayListing → SearchMap`: coordinates ride on the **display DTO** as map support, never
as Search criteria. The map is **display-driven** (criteria → results → map), not
viewport-driven. `/api/listings` does support geographic bounds, but the main public Search
UI does not send viewport bounds — so "search this map" does not exist today and must not be
assumed.

Used as evidence only. Authenticated Search must not depend on public Search code; both
should eventually consume the same canonical address/neighborhood/map-location contracts
without becoming one product.

---

## E. WHAT THIS GRAPH DOES NOT ESTABLISH

- Whether either live search-eligible representation has a proven local twin — needs
  production Neon.
- Whether Open Houses or Media currently surface a representation — needs a trace and, for
  counts, Neon.
- The neighborhood contract. The live Cotality geography study must map `SubdivisionName` /
  `CityRegion` / `MLSAreaMajor` / `MLSAreaMinor` / `PostalCity` onto **Mallan's existing**
  RLS neighborhood GeoJSON vocabulary, aliases and polygons. One canonical neighborhood for
  Sale, Rental, CMA, Building, Saved Search and the map — never a second taxonomy, and never
  `neighborhood = SubdivisionName` because the field exists.
