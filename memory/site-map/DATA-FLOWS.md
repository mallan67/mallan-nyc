# DATA-FLOWS.md — UI Input → URL → API → Response → Render

> **Maintained by:** Mallan Search Cartographer.
> Trace from human action all the way to pixel for each search surface.

## Flow 1 — User types a neighborhood ("Tribeca") on `/search`

```
User keystroke "Tribeca"
  → SearchAutocomplete.handleChange("Tribeca")
    → onChange("Tribeca")              [setSearchQuery state]
    → showDictionaryResults("Tribeca")  [synchronous]
      → getDictionarySuggestions(query, 4) from nyc-dictionary.ts
      → setSuggestions([{type:'neighborhood', label:'Tribeca', sublabel:'Manhattan'}])
      → setIsOpen(true)
    → setTimeout(fetchApiSuggestions, 150ms)
      → GET /api/listings/suggest?q=Tribeca
      → merges API results with dictionary (dedupe by type:value)
  → User clicks "Tribeca" in dropdown
  → handleAutocompleteSelect({type:'neighborhood', value:'Tribeca', sublabel:'Manhattan'})
    → params.delete('borough')
    → params.set('neighborhood', 'Tribeca')
    → router.push('/search?tab=<current>&neighborhood=Tribeca')
  → /search re-renders with new URL
    → useListings({type:..., neighborhood:'Tribeca', ...})
      → GET /api/listings?neighborhood=Tribeca&type=<sale|rent>&...
      → buildPublicListingDbSearch(searchParams) → Prisma where clause
      → returns listings
    → cards render in current view (split/grid/list/map)
```

**Compliance touches:** `_compliance.attribution`, `_compliance.disclaimer`, address suppression in DTO.

---

## Flow 2 — User types "425" on `/search`

```
User keystroke "425"
  → SearchAutocomplete.handleChange("425")
    → showDictionaryResults("425")
      → getDictionarySuggestions returns [] (no NYC dictionary entry for "425")
      → setSuggestions([])
      → setIsOpen(false)
    → setTimeout(fetchApiSuggestions, 150ms)
      → GET /api/listings/suggest?q=425
        → isListingId regex matches /^\d{3,}$/      ← BUG E.1
        → isZip regex matches /^\d{3,5}$/           ← BUG E.2
        → ZIP-prefix branch: startswith(PostalCode, '425') — no NYC zip starts with 425
        → returns 0 suggestions
      → no API hits to merge with empty dictionary
      → setSuggestions([]) + setIsOpen(false)
  → Dropdown stays closed
```

**Defect:** see `KNOWN-REGRESSIONS.md` R-425. Suggested fix in `FRONTEND-UX-RISKS.md`.

---

## Flow 3 — User submits "425 park" search (no autocomplete click)

```
User types "425 park" in /search input
  → setSearchQuery("425 park")            [no URL update on typing]
  → User hits Enter / presses Search ────► (no Enter handler on /search input!)
  → User instead clicks a Filter or waits
    → URL still: /search?tab=buy-residential (no q, no address)
    → useListings runs the original query → returns full default sale set

Result: User typed an address but the API returned the whole default set.
The address never makes it to a URL param. See FRONTEND-UX-RISKS.md.
```

**Workaround:** user must click an autocomplete suggestion (which writes the URL param) — but autocomplete returns 0 for "425 park" per Flow 2.

**Defect compound effect:** Flow 2 + Flow 3 combine to make numeric/address search effectively non-functional via the /search input. Top-tier conversion bug.

---

## Flow 4 — User clicks Header → Buy → Residential

```
User clicks Header dropdown link "Residential" under Buy
  → <Link href="/search?tab=buy-residential">
  → Next.js client-side navigation
  → /search already mounted? If yes:
      → useSearchParams() returns new params (tab=buy-residential)
      → BUT activeTab state stays at its previous value (no useEffect re-sync) ← BUG F
      → UI tab indicator stays on previous tab
      → useListings reads stale tabConfig.apiType
      → API call type = stale value, returns stale-inventory listings
      → URL says "Buy Residential" but UI shows stale tab, results match stale tab

  → /search not mounted? Then:
      → Page mounts fresh
      → useState(resolveTab(typeParam)) initializes correctly
      → Everything in sync — no defect
```

**Defect:** see `KNOWN-REGRESSIONS.md` R-TAB-DRIFT.

---

## Flow 5 — User clicks listing card → detail page

```
User clicks GridCard / ListCard / SplitCard for listing RLS20005759
  → <Link href="/listing/RLS20005759">
  → /listing/[id] page mounts
  → prisma.listing.findUnique({ where: { listing_id: 'RLS20005759' } })
    → returns listing row from DB (with media JSONB + listing_media relation)
  → DTO conversion via dbListingToPublicDTO
    → media resolution: listing_media table → media JSON fallback
    → if both empty: live Trestle fetch via fetchListingMedia (post-PR #120)
  → page renders with photos, address, attribution, disclaimer
```

**Compliance touches:** address suppression, agent PII masking, RLS attribution, FARE Act disclosure (rentals).

---

## Flow 6 — User applies a price filter

```
User opens SearchFilterPanel, sets price slider 1M-5M
  → setFilters({...prev, minPrice: 1000000, maxPrice: 5000000})
  → router.replace('/search?tab=<>&minPrice=1000000&maxPrice=5000000&...')
  → useListings reads new params
  → /api/listings?minPrice=1000000&maxPrice=5000000&...
    → buildPublicListingDbSearch translates to Prisma `where.list_price = { gte, lte }`
  → listings re-render
```

**No state-URL drift** on this flow because `setFilters` and `router.replace` both fire from the same handler. Tab-state drift is the SearchTab-specific bug.

---

## Flow 7 — User clears all filters

```
User clicks "Clear All"
  → clearFilters() in app/search/page.tsx:506-509
    → setSearchQuery('')
    → setFilters({sort: 'price-desc'})
    → setSelectedNeighborhoods([])
    → router.replace(`/search?tab=${activeTab}`, { scroll: false })
  → activeTab is preserved, all other URL params dropped
  → useListings refetches with just tab filter
```

**Edge case:** if `activeTab` is stale (per Flow 4), the clear preserves the STALE tab in the URL. Compounded defect.

---

## Flow 8 — User goes back via browser back button

```
User on /search?tab=rent-residential&q=425+
User clicks browser back
  → URL reverts to previous: /search?tab=buy-residential
  → /search already mounted
  → useSearchParams() returns new params
  → activeTab state stays at 'rent-residential' (no re-sync useEffect) ← BUG F again
  → UI shows Rent tab, URL shows Buy. State-URL drift compounded by history navigation.
```

**Fix:** add `useEffect(() => setActiveTab(resolveTab(typeParam)), [typeParam])` once and Flows 4 + 8 are both resolved.

## Cross-links

- Source-code refs: `COMPONENT-MAP.md`
- API contracts: `API-MAP.md`
- Compliance: `COMPLIANCE-SURFACES.md`
