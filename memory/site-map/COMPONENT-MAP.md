# COMPONENT-MAP.md — Search-Related React Components

> **Maintained by:** Mallan Search Cartographer.

## Top-level components

| Component | Path | Type | Used by |
|-----------|------|------|---------|
| `HeroSearch` | `app/components/HeroSearch.tsx` | client | `/` (homepage) |
| `Header` | `app/components/Header.tsx` | client | global layout (every page) |
| `SearchClient` (default export of `/search/page.tsx`) | `app/search/page.tsx` | client | `/search` |
| `SearchAutocomplete` | `app/components/SearchAutocomplete.tsx` | client | `app/search/page.tsx` (and only there) |
| `NeighborhoodSelector` | `app/components/NeighborhoodSelector.tsx` | client | `app/search/page.tsx` |
| `SearchFilterPanel` | `app/components/SearchFilterPanel.tsx` | client | `app/search/page.tsx` |
| `SearchListingCard` (`GridCard`, `ListCard`, `SplitCard`) | `app/components/SearchListingCard.tsx` | client | `app/search/page.tsx`; cards consumed by FeaturedListings on homepage |
| `SearchMap` (lazy) | `app/components/SearchMap.tsx` | client | `app/search/page.tsx` (dynamic import, SSR disabled) |
| `SearchChips` | `app/components/SearchChips.tsx` | client | `app/search/page.tsx` |
| `SaveSearchButton` | `app/components/SaveSearchButton.tsx` | client | `app/search/page.tsx` |
| `IDXSearchDisclaimer` | `app/components/IDXDisclaimer.tsx` | client | `app/search/page.tsx` (REBNY attribution) |
| `IDXImage` | `app/components/IDXImage.tsx` | client | listing cards, detail gallery |
| `ListingMediaGallery` | `app/components/ListingMediaGallery.tsx` | client | `app/listing/[id]/page.tsx` |
| `FeaturedListings` | `app/components/FeaturedListings.tsx` | client | homepage |
| `ExclusivesVault` | `app/components/ExclusivesVault.tsx` | client | homepage |

## Hooks shared by search components

| Hook | Path | Owners |
|------|------|--------|
| `useListings` | `lib/hooks/useListings.ts` | `app/search/page.tsx` data fetch |
| `useClientOnly` | `lib/hooks/useClientOnly.ts` | viewport-dependent state (mobile vs desktop) |

## Shared search logic libraries

| File | Purpose |
|------|---------|
| `lib/search/types.ts` | `TAB_CONFIG`, `SearchTab` union, `SearchFilters` type, `AMENITY_FIELD_MAP` |
| `lib/search/natural-language-parser.ts` | `parseNaturalLanguageSearch(query)` — extracts beds/baths/price/amenity/neighborhood/borough from free text |
| `lib/search/nyc-dictionary.ts` | `getSuggestions(query, n)` — local instant dictionary (neighborhoods + boroughs) |
| `lib/search/public-listing-db.ts` | `buildPublicListingDbSearch(params)`, `applyPublicListingPostFilters` — DB query builder |
| `lib/search/public-listing-trestle.ts` | `buildPublicListingTrestleFilter(params)` — Trestle OData filter builder |
| `lib/search/listing-access-decision.ts` | `buildSearchDisplayWhere`, `SEARCH_DISPLAY_GATE` — compliance display gate at query time |
| `lib/search/crm-idx-mapper.ts` | CRM-side mapping (for the per-agent search) |
| `lib/geo/neighborhood-zips.ts` | `lookupNeighborhoodZips(name)` — neighborhood name → ZIP[] (NOT currently wired into public address search) |

## Logic duplication watch

Both `HeroSearch.tsx` (homepage) and `SearchAutocomplete.tsx` (/search) implement the same dictionary + API suggest pipeline. Behaviors should remain identical; any divergence is a regression.

Specifically:
- Dictionary lookup: same `getDictionarySuggestions(query, 4)` call
- API call: same `GET /api/listings/suggest?q=<query>`
- Debounce: 150ms in both
- AbortController for in-flight cancel: both

Divergences (per code as of 2026-05-14):
- HeroSearch shows `DEFAULT_SUGGESTIONS` (5 neighborhoods) on focus when query is empty.
- SearchAutocomplete shows "Search by my current location." as a sticky first option when dropdown opens.
- HeroSearch has a placeholder rotator (8 example queries).
- SearchAutocomplete has a static placeholder.

These are intentional UX differences, not regressions. But the SUGGESTION MERGE behavior must remain identical — both merge dictionary + API and dedupe by type:value.

## State machines

### `app/search/page.tsx` state diagram

```
state on mount:
  activeTab    = resolveTab(URL.tab || URL.type || 'buy')
  searchQuery  = URL.q || URL.neighborhood || ''
  filters      = {} from URL params
  viewMode     = URL.view || 'split' (mobile flips to 'all-listings' post-hydration)

state changes:
  handleTabChange(tab)        → setActiveTab + setFilters({sort}) + router.push
  handleAutocompleteSelect    → router.push with new params per suggestion type
  clearFilters                → setSearchQuery('') + setFilters({sort}) + router.replace
  setFilters(x)               → some flows replace URL; others mutate state only

OUTSTANDING DEFECT (R-TAB-DRIFT):
  No useEffect(() => setActiveTab(resolveTab(typeParam)), [typeParam])
  → URL changes don't re-sync activeTab → state-URL drift.
```

## File-level read order for a Cartographer run

1. `app/search/page.tsx`
2. `app/components/HeroSearch.tsx`
3. `app/components/SearchAutocomplete.tsx`
4. `app/components/Header.tsx` (buyItems / rentItems / sellItems)
5. `lib/search/types.ts` (TAB_CONFIG)
6. `lib/search/public-listing-db.ts` (DB filter logic)
7. `lib/search/public-listing-trestle.ts` (Trestle filter logic)
8. `lib/hooks/useListings.ts`
9. `next.config.js` (rewrites)
10. `vercel.json` (redirects + crons — for context only)

## Cross-links

- Routes: `ROUTES.md`
- Flows: `SEARCH-FLOWS.md`
- API contracts: `API-MAP.md`
- Regressions: `KNOWN-REGRESSIONS.md`
