# ROUTES.md — mallan.nyc Route Inventory

> **Maintained by:** Mallan Search Cartographer (auto-overwritten each run).
> **Source-of-truth lookup:** read this file before reasoning about any URL on mallan.nyc.
> **Last refreshed:** 2026-05-14 (initial seed — to be re-written by Cartographer on next run).

## Public top-level routes

| Path | Type | Component / handler | Auth | Notes |
|------|------|---------------------|------|-------|
| `/` | page | `app/page.tsx` (HeroSearch, FeaturedListings, ExploreNeighborhoods, ExclusivesVault, ValueProposition, SellerCTA) | public | Homepage |
| `/buy` | **rewrite** | `next.config.js` rewrite → `/search?tab=buy-residential` | public | `?type=commercial` falls through to `app/buy/page.tsx` which then redirects to `/search?tab=buy-commercial` |
| `/rent` | **rewrite** | `next.config.js` rewrite → `/search?tab=rent-residential` | public | Same pattern with `?type=commercial` → `rent-commercial` |
| `/buy/townhouses` | page | `app/buy/townhouses/page.tsx` | public | Specific propertyType filter |
| `/sell` | page | `app/sell/page.tsx` | public | Seller landing |
| `/sell/townhouses` | page | `app/sell/townhouses/page.tsx` | public | |
| `/search` | page | `app/search/page.tsx` (SearchClient) | public | Primary search UI. Reads `tab`, `q`, `address`, `neighborhood`, `borough`, `zip`, `near`, `minPrice`, `maxPrice`, `beds`, `baths`, `minSqft`, `maxSqft`, `propertySubTypes`, `subTypes`, `propertyType`, `amenities`, `furnished`, `yearBuilt`, `openHouse`, `openHouseDate`, `bounds`, `sort`, `skip`, `limit`, `featured`, `exclusive`, `view` |
| `/listing/[id]` | page | `app/listing/[id]/page.tsx` | public | Detail page. Loading + error + not-found siblings |
| `/agents/[slug]` | page | `app/agents/[slug]/page.tsx` | public | Agent profile |
| `/neighborhoods` | page | `app/neighborhoods/page.tsx` | public | Neighborhood index |
| `/{manhattan,brooklyn,queens,bronx,staten-island}` | page | `app/[borough]/page.tsx` | public | Per-borough landing |
| `/contact` | page | `app/contact/page.tsx` | public | Lead form (1 of 8 consent-capture endpoints) |
| `/about` | page | `app/about/page.tsx` | public | About brokerage |
| `/exclusives` | redirect | `vercel.json` redirect → `/buy?exclusive=mallan` | public | Mallan-only filter |
| `/sign-in` | page | `app/sign-in/page.tsx` | public | Portal auth |
| `/unsubscribe` | page | `app/unsubscribe/page.tsx` | public | Email unsubscribe (CAN-SPAM) |

## Portal routes (auth-gated)

| Path | Portal | Auth role | Notes |
|------|--------|-----------|-------|
| `/portal/buyer` | Buyer portal | client (buyer) | DTO masks listing agent name (company only) |
| `/portal/seller` | Seller portal | client (seller) | Shows full listing agent for own listing |
| `/portal/tenant` | Tenant portal | client (tenant) | Same masking as buyer |
| `/portal/landlord` | Landlord portal | client (landlord) | Same access as seller |
| `/crm/*` | Backend CRM | broker / agent | 6 portal types; `dashboard.html`, `index-built.html`, sale/rental forms |

## Public API routes (search/listing surface only — see API-MAP.md for full inventory)

| Path | Method | Purpose |
|------|--------|---------|
| `/api/listings` | GET | Primary list endpoint. DB-first → Trestle fallback |
| `/api/listings/[id]` | GET | Detail endpoint. DB-first → Trestle live |
| `/api/listings/suggest` | GET | Autocomplete (dictionary + Trestle BuildingName/StreetName) |
| `/api/listings/similar` | GET | Comparable listings |
| `/api/listings/building` | GET | Building profile (multi-listing aggregation) |
| `/api/media/proxy` | GET | Bearer-auth proxy for Trestle/Cotality media URLs |
| `/api/media/batch` | GET | Batch media fetch (CRM + search inline backfill) |
| `/api/health` | GET | Zero-DB liveness probe |
| `/api/settings/company` | GET | Hero image + tagline |

## Cron routes (server-only — not user-facing)

23 schedules in `vercel.json`. See `CLAUDE.md` Architecture section for the full list. Cartographer does NOT probe these.

## Rewrite + redirect cheat sheet

| Source | Target | Mechanism |
|--------|--------|-----------|
| `/buy` (no `?type=commercial`) | `/search?tab=buy-residential` | `next.config.js` `rewrites()` |
| `/rent` (no `?type=commercial`) | `/search?tab=rent-residential` | `next.config.js` `rewrites()` |
| `/buy?type=commercial` | `app/buy/page.tsx` → server `redirect()` → `/search?tab=buy-commercial` | Page-level redirect |
| `/rent?type=commercial` | `app/rent/page.tsx` → server `redirect()` → `/search?tab=rent-commercial` | Page-level redirect |
| `/exclusives` | `/buy?exclusive=mallan` | `vercel.json` redirects |

## Files Cartographer must read each run

- `next.config.js` (rewrites + redirects)
- `vercel.json` (redirects + crons)
- `app/search/page.tsx` (the search hub)
- `app/buy/page.tsx`, `app/rent/page.tsx` (fallback redirect handlers)
- `app/listing/[id]/page.tsx` (detail)
- `app/components/Header.tsx` (nav dropdowns)
- `app/components/HeroSearch.tsx` (homepage banner)

## Known route-level defects (cross-link)

See `KNOWN-REGRESSIONS.md`.
