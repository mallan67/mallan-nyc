# CRM Search Redesign Spec
**Date:** 2026-03-20
**File:** `public/crm/index-built.html`
**Status:** v2 — Updated after spec review + new output requirements

---

## Problem Summary

The current CRM search has multiple critical issues:

1. **Advanced search is completely broken** — all price/beds/baths/rooms/sqft inputs in the advanced form have no `id` attributes and are never read by `collectSearchCriteria()`. Every filter the agent sets in Advanced mode is silently ignored.
2. **3 navigation levels** to start a search (General/Comparables tabs → Sale/Rental/Building tabs → Basic/Advanced toggle)
3. **Search form disappears** after running a search — agent loses context and cannot adjust filters
4. **Two stacked sticky dark nav bars** waste vertical space
5. **Results map covers the grid** when toggled — no split panel
6. **No active filter summary** when viewing results
7. **Transit buttons non-functional** — no onclick handlers, never read by `collectSearchCriteria()`
8. **Custom price/beds inputs** show nothing when selected, silently skipped
9. **Comparable Reports** has hardcoded date values and no `collectComparableCriteria()` function
10. **"My Saved Searches" section** is hardcoded static content
11. **No output panel** — printing, emailing, and comps delivery are scattered and incomplete

---

## Design: Persistent Split Layout

### Overall Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ HEADER: MALLAN │ ← CRM │ Client: [Name ▼] │ Agent Badge │ ⚙    │
├─────────────────────────┬───────────────────────────────────────┤
│  FILTER PANEL (380px)   │  RESULTS PANEL (flex, fills rest)     │
│  scrolls independently  │                                        │
│                         │  toolbar: count │ sort │ view │ tools │
│  [SALES│RENT│BLDG│COMP] │  pills: $1M–3M · 2+BR · Active · UES │
│  [Basic │ Advanced]     │  ──────────────────────────────────── │
│                         │  [card]  [card]  [card]               │
│  All filter sections    │  [card]  [card]  [card]               │
│  scroll continuously    │  [card]  [card]  [card]               │
│                         │                                        │
│                         │  Map slides in from right,            │
│                         │  shrinks grid — never covers it       │
│  [SEARCH]  [CLEAR]      │                                        │
│  (pinned to bottom)     │                                        │
└─────────────────────────┴───────────────────────────────────────┘
```

### Filter Panel (380px, left, always visible)

- Fixed width 380px, independently scrollable
- **Client selector** at top — agent picks client before or after search; both flows supported
- **Four search type tabs**: `SALES | RENTALS | BUILDINGS | COMPARABLES`
- **Basic / Advanced toggle** below tabs — Basic shows key fields only; Advanced reveals all sections in the same continuous scroll with no tab switching between sections
- **Search + Clear buttons** pinned to bottom of panel — always reachable without scrolling up
- **Collapse button** (`«`) folds panel to a 48px icon rail showing: client avatar, tab icons (Sale/Rent/Bldg/Comp), and Search icon. Clicking any icon expands the panel back. At <768px (mobile/tablet) the panel becomes a full-screen left drawer triggered by a filter button in the header.

### Results Panel (flex, fills remaining width)

- Always visible after first search — results never hidden when agent adjusts filters
- **Single results toolbar** (count, sort, view mode, tools)
- **Active filter pills** below toolbar — each pill shows one active filter with `×` to remove it. Removing a pill clears that value from `activeSearchCriteria` and re-runs search automatically.
- **Map toggle** — map slides in from the right as a flex sibling, shrinking the results grid. Does not overlay or cover results.
- **Results placeholder** before first search — brief message prompting agent to run a search

### Header (single bar, replaces both current bars)

- MALLAN branding + CRM back link
- Client selector (prominent)
- Agent badge + email settings gear
- No secondary results nav bar — one bar only
- Legacy `section-my` and `section-last` sections are removed; saved searches live in the filter panel dropdown

---

## Four Search Tabs

### SALES Tab

**Basic mode:**
- Quick Search: RLS ID / Web ID / Zip / Address autocomplete
- Neighborhood autocomplete + map button + transit picker (functional)
- Status checkboxes (Active checked by default)
- Price Min/Max, Beds Min/Max, Baths Min/Max, Rooms Min/Max, SqFt Min/Max
- Listing Activity type + date range pickers
- Open House date presets

**Advanced mode (same continuous scroll, all sections below basic):**
Every single existing collapsible section is preserved exactly as-is — no sections removed, no fields removed. All 20 sections are carried into the new layout. Every input gets a unique `id` using the convention `adv-[fieldname]` (single shared set — the same IDs serve both sale and rental tabs since the advanced form is one shared DOM element; `collectSearchCriteria()` reads these IDs regardless of which tab is active and interprets them correctly based on `currentSearchTab`).

**Complete section inventory — all 20 must be present:**

| # | Section | Contents | Sale/Rent/Both |
|---|---------|----------|----------------|
| 1 | Listing ID / Zip / Address | RLS ID, Web ID, Zip, Neighborhood autocomplete + map + transit, Address + Unit, Add Row button | Both |
| 2 | Location | Borough checkboxes, neighborhood tree (collapsible by borough), map polygon selector | Both |
| 3 | Essentials | Keyword search, Price & Financials (sale price OR rent price row), Expenses, Net Rent, Mortgage calculator, Est. Monthly Payment, Property Size (Beds/Baths/Rooms/SqFt/Ceiling Height), Property Condition, Kitchen & Bath Condition | Both |
| 4 | Status | Sale: Active/BOM/ComingSoon/Future/Offer(+sub)/Contract(+sub)/BoardApproved/Sold(+sub)/NotActive(+sub)/ListedForRent. Rental: All Active/Active/BOM/ApplicationIn/AppAccepted/LeaseOut/LeaseOutThruUs/AppAcceptedThruUs/AppInThruUs/AllLeaseSigned/LeaseSigned/LeaseSignedThruUs/BoardApproved/AllRented/Rented/RentedThruUs/AllNotActive/Withdrawn/Hold/Expired/Future/AlsoForSale | Sale shows saleStatusOptions, Rental shows rentalStatusOptions |
| 5 | Listing Type & Building | Listing Type (Exclusive/In-House/ExclusiveAgency/CoExclusive/RLSPrivate/ParticipantOnly), Attended Lobby (Doorman full/part, Concierge, Video Doorman, None), Building Features quick (Elevator/Laundry/Gym/Pool/Garage/Storage/Bike Room) | Both |
| 6 | Residential Properties | Property Type (Condo/Co-op/Condop/Townhouse/Multi-family/Land), Ownership type checkboxes, Financing allowed | Both |
| 7 | Commercial & Professional | Commercial sub-types, commercial ownership types | Both |
| 8 | Listing History, Activity & DOM | Listed Date range, Last Updated range, Contract Signed range (sale), Lease Signed range (rental), Sold/Closed Date range (sale), Rented Date range (rental), DOM min/max, CDOM, Price Change filters | Sale/Rental specific date fields toggle |
| 9 | Financial Details (sale) | Common Charges min/max, RE Taxes min/max, Total Monthly min/max, Price/SqFt min/max, Cap Rate, NOI, Financing percentage, Purchasing options (All Cash/Financing/Pied-a-Terre/Parents Buying/Trust/LLC) | Sale only |
| 10 | Unit & Interior Features | Unit Features (Dining Room/EIK/Maids Room/Loft/Dishwasher), Appliances (W/D in unit/Central AC), Architecture (High Ceilings/Hardwood/Fireplace), Ceiling Height min/max, Property Condition (Excellent/Good/Fair/Poor), Kitchen & Bath Condition | Both |
| 11 | Building Amenities | Lobby & Services (Doorman/24hr/Concierge/Live-in Super/Virtual/Attended/Maid), Common Areas (Gym/Pool/Spa/Sauna/Steam/Roof Deck/Common Garden/Storage/Bike Room), Building Features (Playroom/Laundry/Parking/Elevator/Business Center/Residents Lounge), Luxury Building Services | Both |
| 12 | Building Details | Year Built range, Year Renovated, Building Size (Floors/Units min/max), Architectural Style (Prewar/Postwar/Art Deco/Beaux Arts/Brownstone/Contemporary) | Both |
| 13 | Townhouse Amenities | Width range, Units range, Private Residence (Pool/Wine Cellar/Theater/Chef Kitchen), Staff & Security (Staff Quarters/Safe Room/Private Garage/Private Elevator), Wellness (Spa/Gym/Smart Home/Art Gallery), Outdoor Spaces (Rooftop/Terrace/Garden/Outdoor Kitchen), Trophy Features (Full Floor/Penthouse/Landmark) | Both |
| 14 | Pet Policy | Building Pet Policy (Pets Allowed/Dogs OK/Cats OK/Case by Case/No Pets), Pet Deposit max | Both |
| 15 | Floor Preferences | Floor Range min/max, Floor Type (Ground/Top/Penthouse/Duplex) | Both |
| 16 | Furnished Options | Furnishing Status (Furnished Only/Unfurnished Only/Either) | Rental only |
| 17 | Listing Details | Outdoor Space types, Views, Exposure directions, Unit position | Both |
| 18 | Additional Filters | New Development, Reduced Price, Open House this week, Virtual Tour available | Both |
| 19 | Open Houses | Date presets (Today/Weekend/7 Days/30 Days), specific date range, Broker Only toggle | Both |
| 20 | Brokerage / Broker / Agent / Team / Management / Landlord | Listing Office name/ID, Listing Agent name/ID, Co-listing Agent, Team name, Management Company (rental), Landlord name (rental) | Both |

**Rental-specific sections** (shown only when Rentals tab is active):
- `#rentalStatusOptions` replaces `#saleStatusOptions`
- `#furnishedOptionsSection` — Furnished Options
- `#leaseDetailsSection` — Lease term, lease start date
- `#listingTypeSection` — Rental listing type (Exclusive/Open)
- `#concessionsSection` — Owner pays broker/tenant pays broker/no fee
- `#leaseAvailabilitySection` — Available from date, flexible dates
- `#managementCompaniesSection` — Management company search
- `#rentalLeaseSignedDate` / `#rentalRentedDate` in section 8
- `#rentPriceExpenseRow` / `#rentVsBuyCalc` in section 3

**Sale-specific sections** (shown only when Sales tab is active):
- `#saleStatusOptions`
- `#saleFinancialDetailsSection` (section 9)
- `#salePurchasingOptions`
- `#saleContractSignedDateFilter` / `#saleSoldClosedDate` in section 8
- `#saleCapRateSection` / `#saleNOISection` in section 9
- `#salePriceExpenseRow` / `#saleInvestmentCalc` / `#mortgageCalculator`

**Key IDs to add (currently missing, causing the critical bug):**
- `adv-min-price`, `adv-max-price`
- `adv-min-rent`, `adv-max-rent`
- `adv-min-beds`, `adv-max-beds`
- `adv-min-baths`, `adv-max-baths`
- `adv-min-rooms`, `adv-max-rooms`
- `adv-min-sqft`, `adv-max-sqft`
- `adv-min-expenses`, `adv-max-expenses`
- `adv-min-net-rent`, `adv-max-net-rent`
- `adv-keyword`
- `adv-year-built-from`, `adv-year-built-to`
- `adv-floors-min`, `adv-floors-max`
- `adv-units-min`, `adv-units-max`
- `adv-floor-min`, `adv-floor-max`
- `adv-ceiling-min`, `adv-ceiling-max`
- `adv-dom-min`, `adv-dom-max`
- `adv-cc-min`, `adv-cc-max`
- `adv-tax-min`, `adv-tax-max`
- `adv-monthly-min`, `adv-monthly-max`
- `adv-pet-deposit-max`
- `adv-th-width-min`, `adv-th-width-max`
- `adv-th-units-min`, `adv-th-units-max`
- All date inputs: `adv-listed-from`, `adv-listed-to`, `adv-updated-from`, `adv-updated-to`, `adv-contract-from`, `adv-contract-to`, `adv-sold-from`, `adv-sold-to`, `adv-lease-signed-from`, `adv-lease-signed-to`, `adv-rented-from`, `adv-rented-to`

`collectSearchCriteria()` updated to: when in advanced mode (`sessionStorage.searchMode === 'advanced'`), read from `adv-*` IDs; when in basic mode, read from existing `sale-*` / `rental-*` IDs.

### RENTALS Tab

Same structure as Sales. Switching to Rentals tab:
- Shows `#rentalStatusOptions`, hides `#saleStatusOptions` (existing behavior preserved)
- Shows rental-specific sections: Lease Details, Furnished, Concessions, Lease Availability, Management Companies
- Shows `#rentPriceExpenseRow`, hides `#salePriceExpenseRow`
- Same `adv-*` IDs read by `collectSearchCriteria()` with `currentSearchTab === 'rent'` interpretation

### BUILDINGS Tab

- Address / Building Name autocomplete
- Neighborhood + map button
- Year Built range, Floors range, Units range
- Building amenities checkboxes

### COMPARABLES Tab

Replaces the existing three-page Comparables flow (`subjectPropertyPage`, `subjectBuildingsPage`, `comparablesSelectionPage`) entirely. Single scrollable panel:

**Subject Property:**
- Address input with autocomplete, Unit, Beds, Baths, SqFt

**Search Scope (any combination, agent checks what applies):**
- ☑ Building (same building as subject address)
- ☑ Neighborhood (autocomplete selector)
- ☑ Zip Code (text input)
- ☑ Radius (0.25mi / 0.5mi / 1mi / Custom dropdown)
- ☑ Borough (dropdown)

**Property Type:**
- Condo, Co-op, Condop, Townhouse, Multi-family, Land

**Status to Include:**
- Active, In Contract, Sold, Perm Off Market, Temp Off Market, Coming Soon, Expired

**Time Range:**
- Date from / Date to pickers
- Presets: 3mo / 6mo / 12mo / 24mo

`collectComparableCriteria()` — new function, reads all Comparables panel inputs and builds the API query. Calls `MallanAPI.idx.search()` with the constructed parameters. Results render in the results panel with status badges on each card.

---

## Output & Delivery System

All output actions are accessible from two places:
1. **Selection action bar** (when listings are checked in results) — bulk actions
2. **Listing detail view** — single listing actions

### Send Listings to Client

- Select listings → "Send to Client" button → pick client from dropdown → sends to client portal
- Creates follow-up task automatically
- REBNY distribution gates enforced before send

### Send Comps to Client

- From Comparables results: "Send Comps" button → pick client → generates a Comps Report (status-grouped, date-stamped) → sends via email
- Format: PDF-style HTML email with subject property at top, comps organized by status below

### Email Listing Agent

- From listing detail view: "Email Agent" button → opens compose modal
- Pre-fills: listing agent email (from listing data), subject line ("Re: [address]")
- Agent types message, sends
- **Automatically CC'd to the logged-in agent's email** (pulled from `AGENT_PROFILE.email`)
- Sent via `sendEmailDirect()` with `cc: AGENT_PROFILE.email`
- Logged in audit trail

### Print Show Sheet — Showings

- From listing detail or selection action bar
- Generates a branded one-page showing sheet: photo, address, key details, agent notes field, showing time/date
- Opens print dialog via iframe
- **CC rule does not apply** (print only)

### Print Show Sheet — Open Houses

- From listing detail: "Open House Sheet" button (existing `generateOpenHouseSheet()`)
- Generates open house specific sheet: listing details + open house date/time + sign-in fields
- Opens print dialog via iframe

### Print Comps

- From Comparables results: "Print Comps" button
- Generates a branded comps report: subject property summary + comps table organized by status
- Includes date range, neighborhood/scope used, price/sqft analysis
- Opens print dialog via iframe

### Email Comps

- From Comparables results: "Email Comps" button → enter/select recipient email → sends
- **Automatically CC'd to logged-in agent's email**
- Logged in audit trail

### Email Listings (batch)

- Select listings → "Email" button → reports modal (existing, no new work needed) → pick client → sends
- `sendEmailDirect()` already exists in `public/crm/js/output/reports.js` — this function is NOT created, only modified to add the CC field
- **Automatically CC'd to logged-in agent's email**
- Logged in audit trail

### CC Rule — All Outbound Communications

Every email sent from the system (listings to client, comps to client, email to listing agent, email comps) automatically includes:
```
CC: AGENT_PROFILE.email
```
This is applied in `sendEmailDirect()` — a `cc` field added to the EmailJS template params and to the audit log entry. The agent always receives a copy of everything sent from their account.

---

## Transit Buttons — Fix

Each subway button gets:
- `data-line="1"` (the line number/letter)
- `onclick="toggleTransitLine(this)"`

New function `toggleTransitLine(btn)`:
```
- Toggle `aria-checked` on btn (true/false)
- Toggle visual selected state (ring, opacity)
- Does not trigger search automatically
```

`collectSearchCriteria()` addition:
```
criteria.transitLines = Array.from(
  document.querySelectorAll('[data-line][aria-checked="true"]')
).map(btn => btn.dataset.line);
```

Applied in both basic and advanced mode. Sent to API as filter parameter.

---

## Custom Price/Beds Inputs — Fix

When any price/beds/baths dropdown has `value === 'custom'` selected, an `<input type="number">` appears inline immediately below it. `collectSearchCriteria()` reads the text input value when the select is set to 'custom'. Applied across all forms (basic sale, basic rental, advanced).

---

## Loading State — Fix

`performSearch()` updated:
1. Immediately shows a skeleton loader in the results panel (3 rows of ghost cards)
2. Hides skeleton and renders results on API response
3. Shows error state if API call fails — never leaves results panel blank

The form show/hide logic inside `performSearch()` is changed: the filter panel remains visible at all times. Only the results panel content changes (skeleton → results).

---

## Map Layout — Fix

Results panel uses `display: flex; gap: 16px`. Map wrapper is a flex child with `width: 45%; min-width: 320px; flex-shrink: 0`. Results grid container is `flex: 1; min-width: 0`. Neither covers the other. Map toggle adds/removes the map wrapper from the flex row.

---

## My Saved Searches — Fix

`section-my` static content replaced. On load, calls `MallanAPI.savedSearches.list()` and renders real saved searches with: name, client assignment badge, alert frequency badge, last run date, match count, Run button. Matches the existing live dropdown pattern from `populateSavedSearchList()`.

---

## What Does NOT Change

- All REBNY RLS compliance gates (distribution gates, IDX opt-out blocking)
- REBNY attribution bar and commission negotiability disclosure
- Report/email system internals (`buildSearchReportPackage`, `generateReport`, reports modal format options)
- `performSearch()` API call logic (only the show/hide DOM behavior changes)
- Pagination, sort, view modes (gallery, grid, list, summary, master detail)
- Selection action bar (Work With client, Print, Email, Remove)
- Listing detail view content and tabs
- All compliance audit logging (`logAuditEntry`)
- Saved searches API integration (`MallanAPI.savedSearches`)
- Client portal send flow (`_submitPortalSend`)
- `filterListings()`, `getFilteredListings()`, all search engine logic

---

## Implementation Order

**Step 1 (merged): Layout restructure + Advanced form IDs**
These must be done together — moving the advanced form into the new layout and assigning IDs is one atomic operation. Update `collectSearchCriteria()` in the same step.

**Step 2:** Wire all four tabs into the filter panel. Build Comparables panel. Write `collectComparableCriteria()`. When agent switches from Comparables tab back to Sales/Rentals/Buildings, the Comparables results panel is cleared and replaced with the standard results placeholder; Comparables results are not persisted across tab switches.

**Step 3:** Output & Delivery system — CC rule in `sendEmailDirect()`, show sheets (showings + open house), print comps, email comps, send comps to client.

**Step 4:** Active filter pills bar.

**Step 5:** Fix map to split layout.

**Step 6:** Transit buttons — `toggleTransitLine()`, update `collectSearchCriteria()`.

**Step 7:** Custom price/beds inline inputs.

**Step 8:** Loading state (skeleton loader).

**Step 9:** My Saved Searches live data.

**Step 10:** Filter panel collapse toggle + mobile drawer behavior.
