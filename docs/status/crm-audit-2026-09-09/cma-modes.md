> **STATUS HEADER (added 2026-09-10) — findings preserved; the fix plan below has already been executed.** This is the dated read-only audit of 2026-09-09. Its §2 FIX PLAN and §3 FAILING TEST DESIGN were carried out on 2026-09-09/10: all three Comparables modes were rebuilt on `serializeCompCriteria` (`public/crm/js/search/search-engine.js:2456`), empty `<option value="">` defaults removed the `minBeds=NaN` 400, the result table now dates closings by `closedDate` and prices them from `closePrice`, and `tests/runtime/crm-comps-modes-execute.test.ts` is green (25/25, re-run 2026-09-10). What actually changed, and what was left open, is in `docs/status/crm-audit-2026-09-09/repair/search-cma-nav.md`. **Do not re-execute the plan from this file — read that repair report first.** Architecture note: the surfaces audited here (`public/crm/index.html` → generated `index-built.html`, `js/search/**`) belong to the **Backend Agent Search / Listings** application, served at **`/crm/search`** — not to the Brokerage CRM (`public/crm/dashboard.html` + `js/dashboard/**`, served at `/crm`). See `CLAUDE.md` §A.0 and Master Plan §5.1. The directory name `crm-audit-` predates that correction (commit `928f31c4`).

## 1. DEFECTS

All findings below are **executed**, not grepped. Evidence: I loaded `public/crm/html/search-form-and-results.html` into jsdom, evaluated the real `public/crm/js/core/api-client.js`, brace‑lifted the shipped `function showCompResults(page)` from `public/crm/js/search/search-engine.js`, stubbed `window.fetch`, drove the DOM, and captured the actual request URLs; then fed those exact query strings to the real server-side `criteriaFromParams` via `tsx`.

**Captured requests (real, from the shipped code):**

| Mode | User action | URL actually sent | Server verdict (real `criteriaFromParams`) |
|---|---|---|---|
| Subject Property | typed `45 East 89th Street` | `/api/idx/search?type=sale&status=Closed&limit=100` | `OK` — **100 closed sales from the entire city** |
| Subject Buildings | typed `The Beekman`, controls untouched | `/api/idx/search?type=sale&minBeds=NaN&maxBeds=NaN&status=Closed&limit=100` | **REFUSED 400** `INVALID_CRITERION` (`beds`, `maxBeds`) |
| Subject Buildings | + MinSqft=1000, beds 2–3 | `/api/idx/search?type=sale&minBeds=2&maxBeds=3&status=Closed&limit=100` | `OK` — **sqft silently gone, building gone** |
| General Criteria | controls untouched | `/api/idx/search?type=sale&minBeds=NaN&status=Closed&limit=100` | **REFUSED 400** `INVALID_CRITERION` (`beds`) |
| (hypothetical) | if the client did forward them | `…&address=…&buildingName=…&minSqft=1000` | **REFUSED 400** `UNSUPPORTED_CRITERION: ["address","buildingName","minSqft"]` |

---

### D1 — `params.status = 'Closed'` is hardcoded; the 27 visible status checkboxes per panel are inert
`public/crm/js/search/search-engine.js:2336-2337`
```js
// Comps = Closed/Sold/Rented listings
params.status = 'Closed';
```
`#compBuildingStatusSection` (`search-form-and-results.html:5721`) and `#compGeneralStatusSection` (`:6132`) each render 27 checkboxes (`:5727-5773`, `:6138-6184`). **Not one has an `id`, a `data-field`, a `data-value`, a `name`, or an event listener.** Nothing in `public/crm/js/**` selects them (grep for `compBuildingStatusSection` / `compGeneralStatusSection` returns only the markup). They are decoration.

Worse, they advertise a vocabulary the executor cannot execute. `Offer Out`, `Offer Thru Us`, `Contract Out`, `Contract Signed`, `All Contract Signed`, `Board Approved`, `All Sold`, `Sold`, `Sold Thru Us`, `All Not Active`, `Future`, `Back On Market` are Mallan **workflow** words from `lib/crm/status-mapping.ts` (`SALE_WORKFLOW_STATUSES`), not `StandardStatus` members. `criteriaFromParams` refuses each by name — this is exactly the class of control that `tests/runtime/crm-search-status-modes.test.ts` and the comment at `search-engine.js:2274-2278` say was deliberately deleted from the four Search panels:
> *"The former sub-status boxes (Offer Out, Contract Signed, Lease Signed, Sold Thru Us …) are gone — those are Mallan WORKFLOW words, the executor has no workflow criterion, and a control that can never execute is a lie to the agent."*

The comps panels were never included in that cleanup. `Withdrawn`, `Hold`, `Expired` **are** live tokens and would be executable — they are dead only because nothing reads them.

### D2 — Subject Property's address never leaves the browser; the CMA is built from the whole city
`search-engine.js:2341-2348` sets `params.address`. `public/crm/js/core/api-client.js:720-743` — the complete forwarding list — is `type, minPrice, maxPrice, minBeds, maxBeds, minBaths, maxBaths, neighborhood, borough, status, listingId, zip, ownership, StructureType, sort, limit, skip`. **`address` is not in it.** It is dropped without a warning (`api-client.js:733-735` comment claims silence is deliberate).

Result: an agent enters *45 East 89th Street*, and the panel renders 100 unrelated closed sales under the heading "Comps for Sale". This is precisely what the server-side CMA refuses to do — `lib/cma/engine.ts:106`:
```ts
throw new CmaSubjectError('CMA requires the subject neighborhood or borough - a comp search is never widened to the whole city');
```

### D3 — Subject Buildings' `buildingName` is dropped
`search-engine.js:2350-2353` sets `params.buildingName`. `api-client.js:717` *documents* `buildingName` in the JSDoc but the body never forwards it. Even if it did, `EXECUTED_PARAMS` (`lib/search/engine/criteria.ts:119-126`) has no `buildingName` → 400 `UNSUPPORTED_CRITERION` (proven above).

### D4 — `minSqft` / `maxSqft` dropped in both modes
`search-engine.js:2372-2373` (building) and `:2398-2399` (general). Not forwarded by `api-client.js`; not in `EXECUTED_PARAMS`. Note the general Search *does* refuse sqft loudly — `search-engine.js:304` `['sqftMin','Min SqFt'], ['sqftMax','Max SqFt']` in `_NOT_EXECUTABLE`. Comps uses different key names (`minSqft`) and no refusal path at all.

### D5 — Every comp select's default option has no `value`, so `minBeds=NaN` is sent and both modes 400 out of the box
`search-form-and-results.html:5601` `<option>Any Min</option>`, `:5614` `<option>Any Max</option>`, and the same at `:5532, :5565, :5634, :5648, :5669, :5691, :5941, :5974, :6029, :6045, :6066, :6088`. With no `value` attribute, `el.value === "Any Min"`.

`search-engine.js:2354-2357`:
```js
var _readSelect = function(id) {
    var el = document.getElementById(id);
    return (el && el.value && el.value !== '' && el.value !== 'custom') ? el.value : null;
};
```
returns `"Any Min"` → `search-engine.js:2364-2365` `if (bbMin != null) params.minBeds = parseInt(bbMin)` → `NaN`. `api-client.js:725` `if (params.minBeds != null)` — `NaN != null` is **true** → `minBeds=NaN` on the wire. Confirmed live: `{"invalid":[{"param":"beds","value":"","reason":"must be a non-negative number"}]}`.

**Subject Buildings and General Criteria are 100% broken in their default state.** (Price and baths escape because `parseInt("Any Min")` is falsy and those use `if (x)`; beds uses `!= null`.)

### D6 — General Criteria reads three element ids that do not exist
`search-engine.js:2376` `compGeneralAddress`, `:2390` `compGeneralMaxBeds`, `:2394` `compGeneralMaxBaths`. Verified: `getElementById('compGeneralAddress')` returns **null** in the rendered DOM; grep count of each id in the partial is **0**. Dead branches.

### D7 — The result table dates a closing by `ModificationTimestamp`
`search-engine.js:2438`:
```js
var dateStr = l.updatedDate || l.listedDate || '--';
```
rendered under the header `Sold Date` / `Rented Date` (`:2432`). `updatedDate` is `ModificationTimestamp` and `listedDate` is `ListingContractDate` (`lib/search/crm-idx-mapper.ts:301-306`). **Executed proof:** a comp with `closedDate: '2026-03-11'` rendered `6/12/2026` in the Sold Date column.

This is the exact fault the server-side comps authority was written to prevent — `lib/comps/fetch-comps.ts:33-38`:
> *"Closed comps are windowed by `CloseDate ge …` — never by ModificationTimestamp, which admitted any old closing that was merely touched and dropped 24% of the last year's closings."*

### D8 — The status badge shows a raw CRM token, never the transaction label
`search-engine.js:2446`: `(l.status || 'CLOSED')`. `l.status` is the CRM token from `crm-idx-mapper.ts:216` (`Closed → "CLOSED"`). **Executed proof:** both a sale comp and a rental comp rendered the badge `CLOSED`. Required: `Sold` on a sale, `Rented` on a rental — `SALE_STATUS_MAPPING.canonicalLabels.Closed === 'Sold'` (`lib/crm/status-mapping.ts:166`), `RENTAL_STATUS_MAPPING.canonicalLabels.Closed === 'Rented'` (`:323`). The label must be per **row** (`l.listingCategory === 'rental'`), not per panel toggle — the executor can and does return rows of the other transaction, and `lib/comps/fetch-comps.ts:175-183` drops those.

### D9 — The Price column shows the ASKING price of a closed comp
`search-engine.js:2436` `l.price`, which is `ListPrice` only (`crm-idx-mapper.ts:61`, `:258`). The CRM DTO carries `closedDate` (`:328`) but **no `closePrice`** — even though `ClosePrice` *is* selected by the engine (`lib/search/engine/select.ts:18`). A CMA that prices a closing at its ask is a valuation defect; `lib/cma/engine.ts:297-300` values *only* from `close_price > 0`, and `lib/comps/fetch-comps.ts:120-133` reads close facts through `lifecycleFromProviderRow` so a stale `ClosePrice` on an Active row can never be used.

### D10 — An empty address reveals a fabricated result count
`search-engine.js:2329` sets `resultsDiv.style.display = 'block'` **before** the guard at `:2345-2346` returns. **Executed proof:** with the address blank, the toast fires *and* `#compPropertyResults` becomes visible showing `Comps for Sale — 12 Results Found — Comparable properties will be displayed here`. Hardcoded fake counts live at `search-form-and-results.html:5485` (`12 Results Found`), `:5839` (`18`), `:6298` (`24`). A fabricated result count on an agent-facing comparables surface is a §D advertising/CMA-integrity exposure.

### D11 — 18 hardcoded read-only date windows the executor never receives
`search-form-and-results.html:5383, 5391, 5399, 5410, 5418, 5426` (selection page), `:5784, 5789, 5794, 5802, 5807, 5812` (Subject Buildings), `:6243, 6248, 6253, 6261, 6266, 6271` (General Criteria) — all `readonly` inputs reading `Last 90 Days (11/03/2025 - 02/01/2026)` / `Last 60 Days (12/03/2025 - 02/01/2026)`. Today is 2026‑09‑09; these windows closed seven months ago. `showCompResults` reads none of them and sends no date criterion. The server comps path has a real `months_back` (`lib/comps/types.ts:27`, default 12 at `lib/comps/defaults.ts:39`) that is windowed on `CloseDate` — the panels show a number that is neither true nor used.

### D12 — Zero test coverage
No file under `tests/` or `scripts/` references `showCompResults`, `compPropertyAddress`, or `compBuildingAddress`. The only guard is `public/crm/js/compliance/compliance-gates-and-output.js:1798`, which asserts `typeof window.showCompResults === 'function'` — it proves the symbol exists, nothing about behavior.

### D13 — The served artifact carries all of the above
`public/crm/index-built.html` (generated by `public/crm/build.js`) contains the same panels and the same frozen date strings (`index-built.html:8657, 8665, 8684 …`). Any fix requires `npm run crm:build`.

---

## Every visible criterion control, by mode

**Legend:** ✅ reaches the executor · ⚠️ silently dropped in the browser · ❌ sent but refused by the server · 💀 dead (no `id`, no reader, or the id does not exist)

### Comparables selection page (`:5300-5443`)
| Control | id | Fate |
|---|---|---|
| Sales / Rentals toggle | `btnCompSale` / `btnCompRent` | ✅ → `params.type` (read via `btnComp<Page>Sale` class state, `:2313-2323`) |
| Load / Save Comp Criteria, Generate Report, Clear Criteria | none (`:5307, 5310, 5313, 5316`) | 💀 no `onclick`, no handler |
| On Market / In Contract / Sold Listings From (×3) | none (`:5383, 5391, 5399`) | 💀 `readonly`, frozen 2025 text, never read |
| Leased / Rented Listings From (×3) | none (`:5410, 5418, 5426`) | 💀 same |

### Subject Property (`:5445-5494`)
| Control | id | Fate |
|---|---|---|
| Location (Address or Building Name) | `compPropertyAddress` (`:5465`) | ⚠️ → `params.address` (`:2343`), dropped by `api-client.js`; would be ❌ if forwarded |
| Sales / Rentals | `btnCompPropertySale` / `…Rent` | ✅ |
| Search Comparables | none (`:5470`) | ✅ calls `showCompResults('property')` |
| Generate Report | none (`:5473`) | 💀 no handler |
| **(implicit)** status | — | ❌/hardcoded `Closed` (`:2337`) |

### Subject Buildings (`:5496-5848`)
| Control | id | Fate |
|---|---|---|
| Address or Building Name | `compBuildingAddress` (`:5517`) | ⚠️ → `params.buildingName` (`:2352`), dropped; ❌ if forwarded |
| Min / Max Price | `compBuildingMinPrice` `:5531` / `MaxPrice` `:5564` | ✅ when a real option is chosen; default `"Any Min"` → falsy → omitted |
| Min / Max Beds | `compBuildingMinBeds` `:5600` / `MaxBeds` `:5613` | ❌ **default sends `minBeds=NaN` → 400** |
| Min / Max Baths | `compBuildingMinBaths` `:5633` / `MaxBaths` `:5647` | ✅ when chosen; default omitted |
| Min / Max SqFt | `compBuildingMinSqft` `:5668` / `MaxSqft` `:5690` | ⚠️ → `params.minSqft`/`maxSqft` (`:2372-2373`), dropped; ❌ if forwarded |
| Include listings with no SqFt | none (`:5716`) | 💀 |
| Status — 27 boxes | none (`:5727-5773`) | 💀 (12 of the labels are workflow words the executor refuses outright) |
| Sale date windows ×3 | none (`:5784, 5789, 5794`) | 💀 frozen 2025 text |
| Rental date windows ×3 | none (`:5802, 5807, 5812`) | 💀 |
| Search Comparables | none (`:5821`) | ✅ |
| second button | none (`:5824`) | 💀 |

### General Criteria (`:5850-6304`)
| Control | id | Fate |
|---|---|---|
| Open Neighborhood Map | none (`:5874`) | ⚠️ calls `openNeighborhoodMapForSearch()` — writes to the **general Search** neighborhood tags, which `showCompResults` never reads |
| Borough checkboxes (Bronx…Staten Island) | none (`:5884-5896`) | 💀 — yet `borough`/`neighborhood` **are** executable (`EXECUTED_PARAMS`), so this is a dead control over a live criterion |
| Transit line pills | none (`:5908-5927`, `<span>`s) | 💀 not inputs at all |
| Min / Max Price | `compGeneralMinPrice` `:5940` / `MaxPrice` `:5973` | ✅ when chosen |
| Ownership (Rental/Coop/Condo/Townhouse) | none (`:6010-6019`) | 💀 — `ownership` → `CommonInterest` is executable |
| Bedrooms (min only) | `compGeneralMinBeds` `:6028` | ❌ **default sends `minBeds=NaN` → 400** |
| Bathrooms (min only) | `compGeneralMinBaths` `:6044` | ✅ when chosen |
| *(max beds / max baths)* | `compGeneralMaxBeds`, `compGeneralMaxBaths` read at `:2390, :2394` | 💀 **elements do not exist** |
| *(address)* | `compGeneralAddress` read at `:2376` | 💀 **element does not exist** |
| Min / Max SqFt | `compGeneralMinSqft` `:6065` / `MaxSqft` `:6087` | ⚠️ dropped |
| Apartment Type (Residential…Investment) | none (`:6117-6126`) | 💀 |
| Status — 27 boxes | none (`:6138-6184`) | 💀 |
| Private Outdoor Space And/Or + 11 boxes | none (`:6194-6232`) | 💀 (no executable criterion exists for these) |
| Date windows ×6 | none (`:6243-6271`) | 💀 frozen 2025 text |
| Search Comparables | none (`:6280`) | ✅ |

**Totals:** 3 controls reach the executor correctly, 2 are refused by the server, 6 are silently dropped, **~80 are dead.**

---

## What the correct executable criteria are

**Through `/api/idx/search`** — `EXECUTED_PARAMS`, `lib/search/engine/criteria.ts:119-126`:
`type, status/StandardStatus, backOnMarket, minPrice, maxPrice, beds/minBeds, maxBeds, minBaths, maxBaths, borough/CityRegion, neighborhood/SubdivisionName, ownership/CommonInterest, StructureType, zip/PostalCode, listingId/ListingId, sort, limit, skip/offset` + the rental-only set. **There is no address, no buildingName, no sqft, and no date-window criterion, and adding them would be a change to the Search contract, not a client fix.**

Live `StandardStatus` members (`lib/search/engine/contract.ts:74`, searchable order): `Active, ComingSoon, ActiveUnderContract, Pending, Closed, Hold, Withdrawn, Expired, Canceled` — `Incomplete` and `Delete` excluded. Labels are per transaction: sale `Pending → In Contract`, sale `Closed → Sold`, rental `Closed → Rented`, `Canceled` one L.

**Through the server comps path** — `lib/comps/fetch-comps.ts`, which already does correctly everything the browser modes attempt:
- building identity: `BuildingName eq '…'`, else `StreetNumber eq '…' and StreetName eq '…'` (`:207-215`)
- area identity: `SubdivisionName` → `PostalCode` → `CityRegion` (`:264-272`), with the explicit note that `CityRegion eq '<neighborhood>'` and `CountyOrParish eq '<borough>'` return **0 live rows**
- status + window: `(StandardStatus eq 'Closed' and CloseDate ge <asOf − monthsBack>)` (`:43-55`)
- order: `CloseDate desc` for closed-only sets (`:58-61`)
- sqft: `LivingArea ge … le …` (`:114-117`)
- eligibility: `applyCompEligibility` — closed comps must have a `CloseDate` inside the window and a positive `ClosePrice`, ownership class segmented by live `CommonInterest` (`:63-101`)
- vocabulary: `resolveCompStatusCriteria` refuses anything that is not a live token or *this transaction's* canonical label, carrying the offending value (`lib/comps/status-criteria.ts:52-66, 96-105`)

**Field filterability** — from the committed live contract `data/cotality-contract/contract.compact.json` (regenerated from the feed; `probeHttp: 200`):
`BuildingName filterable:true populated:221,140` · `StreetName true/591,607` · `StreetNumber true/591,607` · `UnparsedAddress true/591,607` · `LivingArea true/417,652` · `CloseDate true/578,417` · `ClosePrice true/508,931` · `SubdivisionName true/591,607`.
Per §J.4 this is committed-contract evidence, not a fresh probe — re-run `npm run cotality:authority -- refresh` (or `npm run cotality:query`) and capture the proof before shipping the OData clauses.

---

## Should these modes call the server comps endpoints instead of re-implementing? — **Yes.**

`/api/idx/search` is a *search* checkpoint. Its refusal set is deliberate; the three CMA modes need `BuildingName`, `StreetNumber+StreetName`, `LivingArea` and a `CloseDate` window, **none of which it will ever carry**. Re-implementing comp semantics in `search-engine.js` is what produced D1–D11.

But the existing endpoint does not cover the surface: `GET /api/crm/sales/comps?listing_id=X` (`app/api/crm/sales/comps/route.ts:21-24`) is keyed to a **stored `Listing` row** and derives the subject's transaction from its stored `property_type` + `listing_type`. Two of the three browser modes (a free-typed building name; a neighborhood-only general query) have no stored subject.

**Recommendation:** one new authenticated route, `POST /api/crm/comps/search`, that accepts a subject-free query (`transaction`, `buildingName` | `streetNumber`+`streetName` | `neighborhoods`/`borough`/`zip`, beds/baths/price/sqft ranges, `statuses`, `months_back`) and delegates to `lib/comps/fetch-comps.ts` — reusing `compsStatusWindowFilter`, `compsOrderBy`, `mapToCompListing`, `applyCompEligibility` and `resolveCompStatusCriteria` verbatim. All three panels then call `MallanAPI.comps.search(...)` and render `CompListing`, which already carries `status`, `status_label`, `transaction`, `close_price`, `close_date`, `price_per_sqft` — every field D7/D8/D9 are missing. Subject Property, when the subject *is* a Mallan listing, should route to the existing `/api/crm/sales/comps?listing_id=`.

If instead the modes stay on `/api/idx/search`, then General Criteria must be rewired to `neighborhood`/`borough`/`zip`/`ownership` (all executable, all currently dead), the sqft and building controls must be **removed** rather than left dropping, and `closePrice` must be added to `lib/search/crm-idx-mapper.ts` — and the `CloseDate` window still cannot be expressed.

---

## 2. FIX PLAN

| # | Change | Owning file |
|---|---|---|
| F1 | New route `POST /api/crm/comps/search`: `requireAgentOrBroker`; body → `resolveCompStatusCriteria(statuses, 'statuses', transaction)` (400 + `.value` on refusal); delegate to a new subject-free export in `lib/comps`; return `CompListing[]` + the resolved criteria and window | `app/api/crm/comps/search/route.ts` (new) |
| F2 | Export `fetchSubjectComps(query, criteria, transaction)` that reuses `fetchBuildingComps` / `fetchAreaComps` internals but takes a free-form subject instead of `ListingContext.listing_id`; keep `compsStatusWindowFilter`, `compsOrderBy`, `applyCompEligibility` untouched | `lib/comps/fetch-comps.ts`, `lib/comps/types.ts`, `lib/comps/index.ts` |
| F3 | Add `comps: { search }` to `MallanAPI`; do **not** widen `idx.search` | `public/crm/js/core/api-client.js` |
| F4 | Rewrite `showCompResults` (`:2311-2456`) to build a comps query and call `MallanAPI.comps.search`; delete `params.status = 'Closed'` (`:2337`), the dropped `address`/`buildingName`/`minSqft`/`maxSqft` assignments (`:2343, 2352, 2372-2373, 2378, 2398-2399`), and the dead `compGeneralAddress`/`MaxBeds`/`MaxBaths` reads (`:2376, 2390, 2394`) | `public/crm/js/search/search-engine.js` |
| F5 | Move `resultsDiv.style.display = 'block'` (`:2329`) **after** every validation guard | same |
| F6 | Result table: date cell = `c.close_date` (formatted), never `updatedDate`/`listedDate` (`:2438`); price cell = `c.close_price` for a closed comp, `c.list_price` otherwise (`:2436`); status badge = `c.status_label` (`:2446`), which `compStatusLabel` already computed per row transaction; drop a closed comp with no `close_date` or non‑positive `close_price` rather than dating it by something else | same |
| F7 | Render both comps status panels from `searchContract().statusChoices[transaction]` using the existing `renderStatusPanels` (`:2279-2296`): replace the 54 hand-written checkboxes with `data-status-mount="comps-building"` / `"comps-general"` + `data-transaction`; delete every workflow word (`Offer Out`, `Contract Signed`, `Sold Thru Us`, `All Sold`, `Future`, …) | `public/crm/html/search-form-and-results.html:5721-5779`, `:6132-6186` |
| F8 | Replace the 18 frozen `readonly` date inputs with one real "Sold/Rented listings from" control per mode bound to `months_back`, defaulting to `buildDefaultCriteria`'s `12` and sent to the endpoint | `search-form-and-results.html:5383-5432, 5781-5815, 6240-6274` + `search-engine.js` |
| F9 | Give every comp `<option>Any Min</option>` / `Any Max` an explicit `value=""` so `_readSelect` returns `null`; and harden `api-client.js:725-726` to `if (params.minBeds != null && !Number.isNaN(params.minBeds))` so a `NaN` can never reach the wire again | `search-form-and-results.html` (14 selects) + `public/crm/js/core/api-client.js` |
| F10 | Delete the fabricated `12/18/24 Results Found` spans and the "Comparable properties will be displayed here" placeholders | `search-form-and-results.html:5485, 5489, 5839, 5843, 6298, 6302` |
| F11 | Either wire General Criteria's borough / ownership / neighborhood-map controls into the query, or remove them — no dead control over a live criterion | `search-form-and-results.html:5874-5896, 6008-6021` + `search-engine.js` |
| F12 | `npm run crm:build` to regenerate the served artifact | `public/crm/index-built.html` (**generated — never hand-edit**) |

**Gate:** `public/crm/**` is on the CLAUDE.md §C hold list (explicit Maya approval required before starting). This surface is §D (CMA, listing display, status transitions, advertising) — read `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` first. F1/F2 need `npm run type-check`, `rls:validate`, `compliance-check`, `ucba:audit`, `idx:validate`; F4–F12 need `npm run crm:test`.

---

## 3. FAILING TEST DESIGN

Every test below **executes** the shipped function or the real handler. Where I name a grep, I flag it as insufficient on its own.

### T1 — `tests/runtime/crm-comps-modes-execute.test.ts` (new) · drives the real DOM + the real server criteria parser
Harness: the pattern already proven in `tests/runtime/crm-search-status-modes.test.ts:141-170` — JSDOM over `public/crm/html/search-form-and-results.html`, `win.eval` of `public/crm/js/core/api-client.js`, brace-matched lift of `function showCompResults(page)` from `public/crm/js/search/search-engine.js`, `window.fetch` stubbed to record the URL. **Run the identical block a second time over `public/crm/index-built.html`** so the served artifact is proven, not only the source.

- **Drives:** `document.getElementById('compPropertyAddress').value = '45 East 89th Street'; win.showCompResults('property')`.
  **Asserts on the captured request:** the query string carries a subject identity — `buildingName`, or `streetNumber`+`streetName`, or `neighborhood`. *Fails today:* captured URL is `/api/idx/search?type=sale&status=Closed&limit=100`.
- **Drives:** `#compBuildingAddress = 'The Beekman'; showCompResults('building')` with every other control untouched.
  **Asserts:** `criteriaFromParams(new URL(captured,'http://x').searchParams).ok === true`, and the request carries the building name. *Fails today:* `ok === false`, `invalid: [{param:'beds'},{param:'maxBeds'}]`.
- **Drives:** `showCompResults('general')` untouched. **Asserts:** `.ok === true`. *Fails today:* `invalid: [{param:'beds'}]`.
- **Drives:** `#compBuildingMinSqft = '1000'; showCompResults('building')`. **Asserts:** the request carries a square-footage bound. *Fails today:* absent.
- **Drives:** check the `Withdrawn` box in `#compBuildingStatusSection`, then `showCompResults('building')`. **Asserts:** the request's status set contains `Withdrawn`. *Fails today:* status is the hardcoded `Closed` (`:2337`).
- **Asserts (no dead control):** every `input[type=checkbox]` inside `#compBuildingStatusSection` and `#compGeneralStatusSection` carries `data-field="StandardStatus"` and a `data-value` present in `searchContract().statusChoices[transaction]`. *Fails today:* 27 boxes per panel, zero attributes, and `criteriaFromParams('status=SoldThruUs')` is refused (verified).

### T2 — result-table rendering (same file, second `describe`) · asserts on rendered DOM text
- **Drives:** stub the comps response with a sale comp `{close_date:'2026-03-11', close_price:2375000, list_price:2450000, status:'Closed', transaction:'sale'}` and a rental comp `{close_date:'2026-06-30', status:'Closed', transaction:'rental'}`; call `showCompResults('property')`; read `#compPropertyResults tbody tr td`.
- **Asserts:** the Sold-Date cell renders the **CloseDate** (`3/11/2026`). *Fails today:* renders `6/12/2026` (`ModificationTimestamp`) — captured live.
- **Asserts:** the sale badge text `=== SALE_STATUS_MAPPING.canonicalLabels.Closed` (`'Sold'`) and the rental badge `=== RENTAL_STATUS_MAPPING.canonicalLabels.Closed` (`'Rented'`), imported from `lib/crm/status-mapping.ts` — never string literals. *Fails today:* both render `CLOSED` — captured live.
- **Asserts:** the price cell of a closed comp is `$2,375,000`. *Fails today:* `$2,450,000`.
- **Asserts:** a closed comp with `close_date: null` or `close_price: 0` is not rendered as a dated closing — mirroring `lib/cma/engine.ts:181-186`.

### T3 — placeholder leak
- **Drives:** `#compPropertyAddress` left empty; `showCompResults('property')`.
- **Asserts:** `#compPropertyResults` is not `display:block` and its `textContent` does not match `/Results Found/`. *Fails today:* `display === 'block'`, text = `Comps for Sale 12 Results Found Comparable properties will be displayed here` — captured live.

### T4 — date-window honesty
- **Drives:** render the panels, read each date input's `value`, and compare against the window the request actually carries (`months_back` from the captured body).
- **Asserts:** every displayed window is derived from the sent criteria and ends on or after `new Date()`. *Fails today:* frozen strings ending `02/01/2026`, and the request carries no window at all.
- *(A grep for `Last 90 Days (11/03/2025` is a regression guard only — **it proves nothing about behavior and must not stand alone.**)*

### T5 — `tests/runtime/comps-subject-search-endpoint.test.ts` (new) · executes the route handler
- **Drives:** import `POST` from `app/api/crm/comps/search/route.ts`; mock `requireAgentOrBroker`; mock `fetchFromTrestle` from `@/lib/idx/fetch` and capture its argument. Call with `{transaction:'sale', buildingName:'The Beekman', statuses:['Closed'], months_back:12, sqft_min:1000, sqft_max:1400}`.
- **Asserts on the captured OData:** `filter` contains `BuildingName eq 'The Beekman'`, `(StandardStatus eq 'Closed' and CloseDate ge <today−12mo>)`, `LivingArea ge 1000 and LivingArea le 1400`; `orderby === 'CloseDate desc'` — i.e. it went through `compsStatusWindowFilter` / `compsOrderBy`, not a second copy.
- **Asserts:** `statuses:['Sold Thru Us']` → HTTP 400 whose body names the offending value (`CompCriteriaError.value`), and `fetchFromTrestle` was **never called**.
- **Asserts:** a rental request returns `status_label: 'Rented'` and a sale request `'Sold'` for the same `Closed` token; a returned row whose `PropertyType` is a lease never appears in a sale result (`fetch-comps.ts:175-183`).

### T6 — build parity (supplementary)
`expect(read('public/crm/index-built.html')).toContain('data-status-mount="comps-building"')` etc. **This is source-text matching and is insufficient by itself** — it only proves the generator ran. The behavioral proof is T1–T3 executed a second time against `index-built.html`.

---

## 4. FILE OWNERSHIP

**Modified**
- `public/crm/js/search/search-engine.js` — `showCompResults` `2311-2456`; `toggleCompSaleRent` `2233-2309`
- `public/crm/js/core/api-client.js` — `idx.search` `720-743` (NaN guard), new `comps` namespace
- `public/crm/html/search-form-and-results.html` — `5297-6304` (the four comps panels)
- `lib/comps/fetch-comps.ts`, `lib/comps/types.ts`, `lib/comps/index.ts` — subject-free entry point

**Created**
- `app/api/crm/comps/search/route.ts`
- `tests/runtime/crm-comps-modes-execute.test.ts`
- `tests/runtime/comps-subject-search-endpoint.test.ts`

**Regenerated, never hand-edited**
- `public/crm/index-built.html` — via `npm run crm:build` (`public/crm/build.js`)

**Read-only authorities the fix must consume, not copy**
- `lib/crm/status-mapping.ts` · `lib/search/engine/contract.ts` · `lib/search/engine/criteria.ts` · `lib/comps/status-criteria.ts` · `lib/comps/defaults.ts` · `lib/search/canonical/comp-eligibility.ts` · `lib/listings/canonical-lifecycle.ts` · `data/cotality-contract/contract.compact.json`

**Explicitly untouched:** `SALE-FORM-REDESIGN.html`, `RENTAL-FORM-REDESIGN.html`, `SALE-FORM-WITH-TOOLS.html`, `RENTAL-FORM-WITH-TOOLS.html`.