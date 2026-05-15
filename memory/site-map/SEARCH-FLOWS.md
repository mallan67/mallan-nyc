# SEARCH-FLOWS.md — Search-Surface Handoff Map

> **Maintained by:** Mallan Search Cartographer.
> **Search invariant (every surface must hold this):**
> `visible tab === URL tab === API type === filter state === result type`

## The 16 search surfaces

### 1. Homepage Hero Search (`HeroSearch.tsx`)
**Inputs:** free-text query, `[buy] / [rent]` toggle (local state).
**Suggestions source:** local 5-neighborhood default list + dictionary (`nyc-dictionary.ts`) + `/api/listings/suggest`.
**On submit:** `router.push('/search?tab=buy-residential|rent-residential&q=...')`. Trims the query.
**On suggestion click:** routes per suggestion `type` (neighborhood→`?neighborhood=`, address→`?q=`, agent→`/agents/[slug]`, listing→`/listing/[id]`, zip→`?zip=`).
**Hands off to:** `/search` page.
**Carries:** `tab`, `q` (or filter-equivalents from NL parser), `neighborhood` / `zip` (suggestion-driven).

### 2. Header → Buy dropdown (`Header.tsx`, `buyItems`)
**Items:** Residential `?tab=buy-residential` · Townhouses `?tab=buy-residential&propertyType=Townhouse` · Commercial `?tab=buy-commercial`.
**On click:** Next.js client-side `<Link>` to `/search?tab=...`.
**Hands off to:** `/search` page (no query / no filters).

### 3. Header → Rent dropdown (`Header.tsx`, `rentItems`)
**Items:** Residential `?tab=rent-residential` · Commercial `?tab=rent-commercial`.
**Same handoff** as Buy dropdown.

### 4. Search results page (`app/search/page.tsx`)
**State source:** URL `searchParams` (initial only via `useState(resolveTab(typeParam))` — see `KNOWN-REGRESSIONS.md` R-TAB-DRIFT).
**Data fetch:** `useListings()` hook → `/api/listings` with `type = tabConfig.apiType === 'sale' ? 'buy' : 'rent'` + other filter params.
**Sub-surfaces:** SearchAutocomplete, NeighborhoodSelector, SearchFilterPanel, SearchListingCard (Grid / List / Split), SearchMap, SaveSearchButton, SearchChips.

### 5–8. Tabs (`buy-residential`, `rent-residential`, `buy-commercial`, `rent-commercial`)
**Mapping:** `lib/search/types.ts` `TAB_CONFIG`. Each tab maps to `{apiType: 'sale'|'rent', commercial: boolean, label, defaultSort, ...}`.
**Tab click:** `handleTabChange(tab)` → `setActiveTab(tab)` + `setFilters(prev => ({sort: prev.sort}))` (resets non-sort filters) + `router.push('/search?tab=...')`.
**Invariant requirement:** the visible highlighted tab in the UI must always match the URL `tab` param.

### 9. Autocomplete / typeahead (`SearchAutocomplete.tsx`)
**Inputs:** the toolbar search field on `/search`.
**Behavior:** identical pipeline to HeroSearch's inline dropdown — dictionary (instant) + `/api/listings/suggest` (debounced 150ms).
**On select:** `handleAutocompleteSelect` in `app/search/page.tsx` writes URL params per suggestion type.
**Categories displayed:** SEARCH BY LOCATION, LOCATIONS (neighborhood + borough), FILTERS, AGENTS, LISTINGS, BUILDINGS (= address), ZIP CODES.

### 10. Filter bar (`SearchFilterPanel.tsx`)
**Inputs:** price, beds, baths, sqft, property sub-types, amenities, year built, furnished, open house, pets, ownership.
**On apply:** `setFilters(...)` + `router.replace('/search?...')`.
**Cross-link:** `applyPublicListingPostFilters` in `lib/search/public-listing-db.ts` evaluates amenity / keyword filters server-side.

### 11. Neighborhood selector (`NeighborhoodSelector.tsx`)
**Inputs:** 5-borough tabbed panel, multi-select chips for neighborhoods.
**On select:** writes `?neighborhood=name1,name2` AND/OR `?borough=borough`.
**ZIP-widening logic:** `lib/geo/neighborhood-zips.ts` provides neighborhood-name → ZIP-set lookup but is NOT currently wired into the public `address=` branch (see `KNOWN-REGRESSIONS.md` R-NEIGH-NARROW).

### 12. Map / list / grid views
**Map:** `SearchMap.tsx` (Leaflet-style markers, fed `publicListings`).
**Cards:** `SearchListingCard.tsx` exports `GridCard`, `ListCard`, `SplitCard`.
**View toggles:** `viewMode` state with values `split | all-listings | all-map | grid | list` written to `?view=`.

### 13. Listing card clickthrough
**Target:** `/listing/[id]` (the listing's `mlsId` / `id`).
**Compliance:** card surfaces REBNY attribution (`Listing courtesy of [Brokerage]`); FARE Act disclosure wired on `SearchListingCard.tsx`, `app/search/page.tsx`, and `app/listing/[id]/page.tsx`.

### 14. Listing detail page (`app/listing/[id]/page.tsx`)
**Data fetch:** DB-first via `prisma.listing.findUnique` → Trestle live fallback via `fetchSingleListing` + `fetchListingMedia`.
**Media path:** live-fetched via `/api/media/proxy` for Trestle URLs, R2 for cached.

### 15. Save search (`SaveSearchButton.tsx`)
**Behavior:** captures current `{type, filters, q}` and POSTs to `/api/search-alerts` with `consent_captured_at` (TCPA/CAN-SPAM).

### 16. No-results state (`app/search/page.tsx` empty render)
**Display:** "No listings match your search" + filter-pill removal CTAs.
**Defect:** does NOT distinguish "no data" from "bad/stale filter applied" — see `FRONTEND-UX-RISKS.md`.

## Handoff diagram

```
                     ┌───────────────────────────────────┐
                     │  Homepage Hero (1)                 │
                     │  ──────────────                    │
                     │  [buy] [rent]                      │
                     │  text input + suggest dropdown     │
                     │  default 5 neighborhood chips      │
                     └────────────┬──────────────────────┘
                                  │ router.push
                                  ▼
        Header Buy/Rent ───────► /search?tab=...&...     ◄─── /buy /rent rewrites
        dropdowns (2, 3)         │                         (next.config.js)
                                  │ mounts SearchClient
                                  ▼
                     ┌───────────────────────────────────┐
                     │  /search Search Results (4)        │
                     │                                    │
                     │  Tabs (5–8) ──── Autocomplete (9)  │
                     │  Filter bar (10)                   │
                     │  Neighborhood selector (11)        │
                     │  Map / list / grid (12)            │
                     │  Save search (15)                  │
                     │                                    │
                     │  Card click (13) ──► /listing/[id] │
                     │                                  ──┼──► Listing Detail (14)
                     │  Empty state (16)                  │
                     └───────────────────────────────────┘
```

## Invariant audit (every search session must hold)

For each search interaction, verify:

| # | Layer | Check |
|---|-------|-------|
| 1 | Visible tab indicator | UI shows the right Buy/Rent/Commercial label |
| 2 | URL `?tab=` | matches the visible tab |
| 3 | API `type=` | `tabConfig.apiType === 'sale' ? 'buy' : 'rent'` matches |
| 4 | API `commercial` | matches `tabConfig.commercial` |
| 5 | Result type | every `listing.listingType` in the response = "sale" or "rent" per the request |

Any drift = REGRESSION. Log in `KNOWN-REGRESSIONS.md`.

## Cross-links

- Component owners: `COMPONENT-MAP.md`
- Param + endpoint contracts: `API-MAP.md`
- Compliance check points: `COMPLIANCE-SURFACES.md`
- Active defects: `KNOWN-REGRESSIONS.md`
- Conversion ranking: `FRONTEND-UX-RISKS.md`
