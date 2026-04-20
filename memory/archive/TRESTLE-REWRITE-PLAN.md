# TRESTLE REWRITE PLAN — All CRM Tools Must Use Live Data

## Problem
Every CRM tool under Market Intelligence, Listing Analytics, and Buyer & Seller Intel
shows "No data" because they all query the local Prisma DB which has zero listings.
The tools were built against `prisma.marketSnapshot`, `prisma.demandIndex`, etc. —
tables that are empty because the crons that populate them have no source data.

**The only working data source is Trestle RLS via `fetchFromTrestle()`.**
The Market Report Builder was rewritten to use it and works. Everything else needs the same treatment.

## Architecture Decision
**ALL market/listing tools MUST query Trestle directly for live data.**
Local DB tables (`MarketSnapshot`, `DemandIndex`, `DemandSignal`) can be used as CACHE
but never as the PRIMARY source. If cache is empty, tool must fall back to Trestle.

## Working Trestle Connection
```
File: lib/idx/fetch.ts
Function: fetchFromTrestle(options)
Auth: lib/idx/auth.ts → getAccessToken() (OAuth2, auto-refresh)
API: https://api.cotality.com/trestle/odata/Property
```

### Example query that WORKS (from Market Report Builder):
```typescript
const result = await fetchFromTrestle({
  filter: "StandardStatus eq 'Active' and PropertyType eq 'Residential' and CountyOrParish eq 'New York'",
  top: 200,
  count: true,
  expandMedia: false,
  select: ["ListingId", "ListPrice", "BedroomsTotal", "BathroomsFull",
           "LivingArea", "DaysOnMarket", "StreetNumber", "StreetName",
           "MLSAreaMajor", "PropertySubType", "AssociationFee", "ListOfficeName"],
  orderby: "ListPrice desc",
});
```

## Tools That Need Rewriting

### 1. Market Pulse (`public/crm/js/crm/market-pulse.js`)
**Current:** Calls `/api/crm/market-pulse` → queries `prisma.marketSnapshot` → EMPTY
**Fix:** Create new backend that queries Trestle for each neighborhood:
- Active listings count, median price, avg $/sqft, avg DOM per neighborhood
- Group by `MLSAreaMajor` (Trestle neighborhood field)
- Filter: `StandardStatus eq 'Active' and CountyOrParish eq '{county}'`
- Compute stats in-memory from Trestle results
- Cache results in `MarketSnapshot` table for performance (1-hour TTL)

### 2. Liquidity Index (`public/crm/js/crm/market-liquidity.js`)
**Current:** Calls `/api/crm/market-liquidity` → `lib/market-liquidity/indexer.ts` → queries `prisma.marketSnapshot` + `prisma.demandIndex` → EMPTY
**Fix:** `indexer.ts` should call `fetchFromTrestle()` directly when no cached data:
- Fetch active listings grouped by neighborhood
- Compute absorption speed from avg DOM
- Compute inventory from count
- Compute supply trend from listings added in last 30d vs total
- Demand: use page view behavioral events if available, else use inventory inverse

### 3. Neighborhood Sentiment (`public/crm/js/crm/neighborhood-sentiment.js`)
**Current:** Calls `/api/crm/demand` + `/api/crm/market-pulse` → both return empty
**Fix:** Replace with a single Trestle query per borough:
- Fetch all active listings for borough
- Group by `MLSAreaMajor`
- Compute per neighborhood: count, avg price, avg DOM, new (30d)
- Sentiment = (inventory tightness * 0.4) + (DOM speed * 0.3) + (new supply * 0.3)
- No dependency on cron-computed data

### 4. Market Alerts (`public/crm/js/crm/market-alerts.js`)
**Current:** Calls `/api/crm/demand` → empty DemandIndex
**Fix:** Compare current Trestle snapshot to cached previous snapshot:
- If no previous snapshot, generate baseline and store
- Next run compares: inventory change > 15%, DOM change > 20%, price change > 10%
- Alert types: inventory_drop, inventory_surge, price_shift, absorption_change

### 5. Demand Heatmap (`public/crm/js/crm/demand-heatmap.js`)
**Current:** Calls `/api/crm/demand/heatmap` → empty DemandIndex
**Fix:** Compute from Trestle active listings:
- Count listings per neighborhood = supply
- Avg DOM per neighborhood = absorption speed (lower = more demand)
- New listings rate = supply velocity
- Score = (1/inventory * 0.3) + (1/DOM * 0.4) + (newRate * 0.3) normalized 0-100

### 6. Transaction Probability (`public/crm/js/crm/transaction-probability.js`)
**Current:** Auto-loads agent portfolio from DB → 0 listings
**Fix:** Also needs Trestle fallback. When no DB listings:
- Fetch agent's listings from Trestle by ListOfficeName or ListAgentMlsId
- Or show "No exclusive listings. Use Property Search to analyze any listing."

### 7. Property Liquidity (`public/crm/js/crm/property-liquidity.js`)
**Same as #6** — depends on Transaction Probability which depends on DB listings

### 8. Offer Intelligence (`public/crm/js/crm/offer-intelligence.js`)
**Current:** Calls `/api/crm/commissions` → 0 deals
**Fix:** Query Trestle for CLOSED listings:
- Filter: `StandardStatus eq 'Closed'` + last 90 days
- Compare ClosePrice to OriginalListPrice
- Group by MLSAreaMajor
- Shows real close-to-list ratios from actual market data

### 9. Buyer Demand Exchange / Buyer Clusters / Buyer Intent
**These are different** — they depend on behavioral events from mallan.nyc visitors.
The IntentTracker was just wired. Data will populate as the site gets traffic.
No Trestle rewrite needed — these correctly depend on first-party data.

## Implementation Order (Priority)

1. **Market Pulse** — most visible, most useful, agents check this first
2. **Neighborhood Sentiment** — directly computed from same Trestle data
3. **Demand Heatmap** — same data, different view
4. **Liquidity Index** — same data, scored
5. **Market Alerts** — needs snapshot comparison logic
6. **Offer Intelligence** — needs Trestle closed listings query
7. **Transaction Probability + Property Liquidity** — need Trestle agent listing lookup

## Backend Pattern (Reusable)

Create `lib/trestle-market/stats.ts`:
```typescript
import { fetchFromTrestle } from "@/lib/idx/fetch";

interface NeighborhoodStats {
  neighborhood: string;
  borough: string;
  active_count: number;
  median_price: number;
  avg_price_per_sqft: number;
  avg_dom: number;
  new_listings_30d: number;
  avg_maintenance: number;
  price_range: { min: number; max: number };
}

export async function getTrestleMarketStats(
  borough?: string,
  listingType: string = "sale"
): Promise<NeighborhoodStats[]> {
  // Single Trestle query, group results by MLSAreaMajor in-memory
  // Cache results for 1 hour
}
```

All 7 tools call this ONE function. No duplication. One Trestle query per borough
serves Market Pulse, Sentiment, Heatmap, Liquidity, and Alerts.

## CRM Frontend Pattern

Each tool's init function should:
1. Show loading spinner
2. Call its API endpoint
3. API endpoint calls `getTrestleMarketStats()` (cached)
4. Return real data
5. Frontend renders

No "No data. Populates from cron." messages. Ever.
If Trestle is down, show "Market data temporarily unavailable" — not "No data."

## Files to Create/Modify

### New Files:
- `lib/trestle-market/stats.ts` — shared Trestle stats fetcher with cache
- `app/api/crm/market-stats/route.ts` — single API serving all market tools

### Files to Modify:
- `public/crm/js/crm/market-pulse.js` — use new API
- `public/crm/js/crm/market-liquidity.js` — use new API
- `public/crm/js/crm/neighborhood-sentiment.js` — use new API
- `public/crm/js/crm/market-alerts.js` — use new API
- `public/crm/js/crm/demand-heatmap.js` — use new API (or merge into market-pulse)
- `public/crm/js/crm/offer-intelligence.js` — add Trestle closed listings fallback
- `lib/market-liquidity/indexer.ts` — add Trestle fallback
- `app/api/crm/market-liquidity/route.ts` — add Trestle fallback

### Files to Keep As-Is:
- `lib/market-report/generator.ts` — already uses Trestle ✓
- `public/crm/js/crm/building-risk.js` — uses NYC Open Data ✓
- `public/crm/js/crm/renovation-estimator.js` — uses DOB permits ✓
- `public/crm/js/crm/public-records-lookup.js` — uses ACRIS/DOB ✓
- `public/crm/js/crm/investment-analyzer.js` — client-side calculator ✓
- `public/crm/js/crm/lifestyle-match.js` — client-side scoring ✓

## CMA Reports Bug
The CMA Reports sidebar link calls `showTab('cma-engine')` but when clicked,
the Broker Dashboard shows instead. Debug: check if `cma-engine` panel div exists
and if `showTab` is correctly finding it.

## Estimated Effort
- `lib/trestle-market/stats.ts` — 2 hours (core, reusable, cache layer)
- 6 tool rewrites — 30 min each = 3 hours
- Testing — 1 hour
- Total: ~6 hours of focused work

## Notes
- Trestle rate limits: be mindful of query volume. Cache aggressively (1hr minimum).
- `fetchFromTrestle` already handles auth, pagination, retries.
- Borough mapping: Manhattan=New York, Brooklyn=Kings, Queens=Queens, Bronx=Bronx, SI=Richmond
- Neighborhood field in Trestle: `MLSAreaMajor`
- Property types: Condominium, StockCooperative, Condop, SingleFamilyTownhouse
- Status field: `StandardStatus` (Active, Pending, Closed, ComingSoon, etc.)
