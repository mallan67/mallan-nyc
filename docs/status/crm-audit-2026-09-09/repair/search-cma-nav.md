All gates are green. Final report:

---

# SEARCH ENGINE + SEARCH MARKUP — done

## Test counts (rule 2 — every test was written and run RED first)

| File | Before the fix | After |
|---|---|---|
| `tests/runtime/crm-building-search-executes.test.ts` | **14 failed / 6 passed** (20) | **22 passed / 22** (+2 added later) |
| `tests/runtime/crm-refine-panel-status-contract.test.ts` | **15 failed / 15** | **15 passed / 15** |
| `tests/runtime/crm-comps-modes-execute.test.ts` | **25 failed / 25** | **25 passed / 25** |
| `tests/runtime/crm-sticky-nav-destinations.test.ts` | **13 failed / 6 passed** (19) | **25 passed / 25** (+6 added later) |
| **Total** | **67 failed / 79** | **87 passed / 87** |

The six tests added after the first RED run (sorting, detail drawer, dead-control interaction) were proven red by running their exact assertions against `git show HEAD:` copies of `pagination.js` / `render-grid.js` / `render-dispatcher.js` / `search-engine.js` in the same JSDOM harness. Captured "before" output:

```
BEFORE clickable sort headers: ["address","baths","beds","listedDate","price","status","unit"]  (7, only 2 are executable)
BEFORE toggleColumnSort("price") requests: 0        → local re-render only
BEFORE toggleColumnSort("beds"): requests 0, sortField price -> beds   → silent side effect
BEFORE drawer header text: "\n   \n  "   → empty; content 79 chars (skeleton only), TypeError swallowed
BEFORE row.status after grid render: "ACTIVE"       → fabricated onto the shared row
BEFORE unknown view mode "list": visible containers = []   → blank results page
BEFORE 24h Closed gate keeps: ["k1","k2"]           → the 48-hour-old Closed row survived (dead gate)
```

Every assertion drives the shipped function in a real DOM built from the shipped partial and asserts on the returned object, the captured request, or rendered DOM. No assertion is a source grep.

## Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors** |
| `npm run compliance-check` | 95 passed, 0 failed (BLOCKER+STRICT) |
| `npm run ucba:audit` | 46 PASS, **0 REGRESSIONS** |
| `npm run idx:validate` | 1207 pass, **0 critical** |
| `npm run crm:test` | **37/37** |
| `npm run rls:validate` | 6 errors — **all six are `RENTAL-FORM-REDESIGN.html`** (another agent's in-flight surface: `ElevatorsTotal`, `NewDevelopmentYN`, `MinLeaseMonths`, `LeaseType`, furnished pricing, `PetsAllowedComments`). Zero relate to my files. |
| full `npx jest --config tests/runtime/jest.config.js` | 5608 passed / 23 failed in 6 suites — **none mine**: `crm-build-drift` (expected; you rebuild), `crm-form-dom-roundtrip` + `rls-validator-canonical-reporter` (RENTAL-FORM-REDESIGN), `provider-authority-census` (`lib/crm/listing-form-mapping.ts`), and two form suites that pass on re-run (they failed mid-run while another agent was writing the four forms). |

**What each gate proves / does not prove:** `compliance-check`, `ucba:audit` and `idx:validate` green prove the static rule sets pass; they prove nothing about whether a field is live on Cotality. My Class-B claims below rest on the committed live pull (`data/cotality-contract/**`, `data/cotality-enums.live.json`, `acquired_at 2026-09-08`), which CLAUDE.md §H names as the only field/enum authority — **I ran no live `cotality:query` / `trestle:probe` this session.**

## The critical finding — verified independently

Confirmed against the committed live pull, and the four provider facts are now asserted in `crm-building-search-executes.test.ts` so they cannot silently change:

- `Building` entity set: `state:"rejected", http:403`; both navigations `PROVIDER_REJECTED`.
- `data/cotality-enums.live.json` publishes vocabularies for **Property / Media / OpenHouse only** — no `Building`.
- `BuildingKeyNumeric`, `Latitude`, `Longitude`: all three `filterable:false, populated:null`.
- 9 absent fields confirmed (`BuildingRules`, `AttendanceType`, `BuildingLaundryFeatures`, `BuildingPetsAllowed`, `MaximumFinancingPercent`, `RentingAllowedYN`, `BuildingPoolFeatures`, `BuildingSecurityFeatures`, `CRM`) and 5 non-member tokens confirmed (`StructureType/Loft`, `StructureType/WalkUp`, `ArchitecturalStyle/Brownstone`, `ExteriorFeatures/RoofDeck`, `AccessibilityFeatures/WheelchairAccessible`). Live `StructureType` publishes `LowRise` and `MidRise`, which the old panel faked.

## Files changed (all owned)

`C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/html/search-form-and-results.html` · `js/search/search-engine.js` · `js/search/pagination.js` · `js/search/search-actions.js` · `js/search/saved-searches.js` · `js/render/render-grid.js` · `js/render/render-dispatcher.js` — plus the four new tests. `js/init/init-ui.js` needed no change (its four container ids are still correct).

## What was fixed

**1. The BUILDINGS tab now shows its own panel and genuinely executes.**
`toggleSearchTab` toggled only `#searchBasicMode`; it now owns all three basic panels. **This also fixed the RENTALS tab, which had the identical defect** — `#searchBasicModeRental` was dead DOM too, so a rental search collected from the sale form. `collectSearchCriteria` now reads `_basicPanelIdFor(currentSearchTab)` instead of the hard-coded sale panel, and reads `buildingQuickRls` / `buildingQuickZip` (previously never read). `refuse('Building search')` is gone. The panel was cut from ~60 controls to the ones that execute: `CommonInterest` ×4, `PropertySubType=Townhouse`, six live `StructureType` members, neighborhood tags, zip, RLS id, and a new `data-status-mount="basic-building"`. Removed: the whole lat/lng Manhattan Grid, Building Allows/Does-Not-Allow (19 controls over absent fields), Attended Lobby, the `data-not` negations, the `lte:`/`gte:` operator values, Keyword, Management, and the free-text address (`buildingName` is still refused by name as a fail-closed guard for legacy saved searches).

**2. Building results are grouped in Mallan code.** New `renderBuildingResults()` in `render-dispatcher.js` groups the returned page by `BuildingName`, else the street address — never `BuildingKeyNumeric` — and states the count honestly: *"2 buildings · grouped from 3 listings on this page of results"*.

**3. The silently-dropped criterion.** `financingMin`/`financingMax` are now in `_NOT_EXECUTABLE` (refused as "Building Financing %"), and the four `*BuildingFinancing*` inputs are deleted from the sale and rental panels — because making it refuse would otherwise have blocked those searches. A generalized test asserts **every** key `collectSearchCriteria` can produce is either a parameter or a named refusal.

**4. Refine Results rebuilt on the per-transaction contract.** The five hardcoded checkboxes (`ACTIVE`/`COMING_SOON`/`PENDING`/`CONTRACT`/`UNDER_CONTRACT`/`CLOSED` — not one a live member) are gone; `refine-sale` / `refine-rental` mounts render from `statusChoices`, only the active transaction's is shown, and the rental panel has no Coming Soon and no sale-contract wording. New `window.refineCriteriaFromPanel()`. `syncRefineToMainForm` now syncs **status** into the main mount. `removeRefineFilter` also clears the panel control (it used to delete the key and let the still-selected dropdown put it straight back).

**5. All three Comparables modes.** New `serializeCompCriteria(page) → {params, refused, transaction}` — the comps twin of `serializeSearchCriteria`. Every `<option>` now carries `value=""`, so `minBeds=NaN` cannot be built (both modes 400'd out of the box). Subject Property is now driven by a **subject listing ID** — resolved on the feed, then comps drawn from the subject's own neighborhood with the `lib/comps/defaults.ts` area bands (beds ±1, baths ±1, price ×0.75–1.25); with no subject, or an unresolvable one, it refuses by name and issues no sweep. Results render **`closedDate` under "Sold/Rented Date"** (never `ModificationTimestamp`), a separate **"Sold Price" column from `closePrice`** alongside "List Price", `MallanStatus.label(row)` per row, and a **closed comp with no close date is dropped with a visible note** rather than dated by something else. Removed: 18 frozen date inputs, the fabricated 12/18/24 counts, placeholders, 54 workflow checkboxes, transit pills, apartment-type and private-outdoor blocks. Added executable Borough/Ownership/Structure/Zip controls (previously dead controls over live criteria).

**6. All seven dead Comparables buttons wired.** `loadCompCriteria` / `saveCompCriteria` (localStorage round-trip) / `clearCompCriteria` / `openCompReport(page)`. Generate Report refuses before a search and otherwise puts the **actual returned comp set** into `searchResultsState.filteredListings` — which is what `getReportListings()` reads — before opening the modal.

**7. Sticky nav.** `stickyNavBuilding` / `stickyNavComps` ids added and the highlighter extended to six destinations incl. a Comparables state. `jumpToSearch` now calls `toggleSearchType('general')` first. New `currentSearchMode()` is the one reader of the mode; the Back button uses `backToSearchForm()` instead of sniffing a CSS class. New `_resultsCountLabel()` is shared by the toolbar and the nav, and `updateStickyNavActive()` is called in both `_serverSearch` render blocks — the nav read "0 results" beside "4,821 Results". The sticky action bar is hidden over the Comparables form (its Search button silently ran the general search). Last-Search recall and `_paramsToFormFields` restore transaction **and** search type, and a saved rental search restores ownership into the rental panel.

**8. Status-authority sites in my files** (per the helper agent's handoff): `render-grid.js:41`'s `if (!listing.status) listing.status = 'ACTIVE'` **mutation deleted** — this was their highest-risk item; sort headers now render only on executable columns; `render-dispatcher` gained a `default:` view-mode fallback and its 24-hour Closed gate now compares the live `Closed` token (it was comparing the retired `'CLOSED'` and had gone dead); `pagination.js` detail drawer is null-safe (`price`/`maintCC`/`totalMonthly` are all nullable and the TypeError was swallowed by a blanket catch) and uses `MallanStatus.label` in the drawer, print sheet, mini-cards, timeline and the **agent-to-agent inquiry body and payload**, which fabricated `ACTIVE` and labelled a rental Pending "In Contract" in a message to another brokerage. Dead `toggleResultsView` deleted.

---

# NEEDS ANOTHER OWNER

### 1. `public/crm/js/core/api-client.js` + `lib/search/engine/criteria.ts` + `provider-query.ts` — the ceiling on this surface
`address`, `buildingName`, `minSqft`/`maxSqft` and any close-date window **cannot be made executable from my files**. `EXECUTED_PARAMS` does not contain them and `MallanAPI.idx.search` does not forward them. I therefore refuse them by name and replaced the controls with executable equivalents. To restore name-based building search and sqft comps:
- `criteria.ts` `EXECUTED_PARAMS` + `SearchCriteria`: add `buildingName`, `minSqft`, `maxSqft`.
- `provider-query.ts`: `tolower(BuildingName) eq '<v>'` (live, `filterable:true`, `populated:221,140`) and `LivingArea ge/le` (live, 417,652).
- `api-client.js:718` JSDoc still advertises `minYear/maxYear/minFloors/maxFloors/minUnits/maxUnits/buildingName` that `search()` does not forward, and drops `backOnMarket` which `serializeSearchCriteria` sets — **the `backOnMarket` drop is a live bug**: the refine panel and the Search panels both offer it, my test asserts it reaches `MallanAPI.idx.search`, but the real client never puts it on the wire.
- `lib/search/engine/universe.ts` `mallanRowsFor` must mirror any new criterion or Mallan rows silently widen.

### 2. `lib/search/crm-idx-mapper.ts` — `closePrice` is selected but dropped
`lib/search/engine/select.ts:18` already selects `ClosePrice`, and the DTO carries `closedDate` — but no `closePrice`. My comps table has a **"Sold Price" column that reads `l.closePrice ?? l.close_price` and renders `—`** until the mapper emits it. One line next to `closedDate` at `:340` lights it up, and a CMA stops being priced at the ask. (`lib/cma/engine.ts:297` values only from `close_price > 0`.)

### 3. `public/crm/js/init/init-disable-dead-controls.js` — two now-dead entries
`:150` `#buildingTransitExpand` and `:157` `idAnchor:'bldg-grid-north'` match nothing any more (both removed from the Building panel). Harmless no-ops; delete when convenient. I added a test that the dead-control pass disables **nothing** in the Buildings panel or the Comparables criteria — it passes today.

### 4. `public/crm/js/init/init-hash-routing.js:356-358`
The `mallan:data:ready` restore path still does not call `updateStickyNavActive()` (`:346` and `:391` do). A refresh at `#results` lands with no nav highlight and no count.

### 5. `app/api/crm/comps/search/route.ts` (new) — the real fix for Comparables
The canonical comps authority (`lib/comps/fetch-comps.ts`: `compsStatusWindowFilter`, `applyCompEligibility`, `resolveCompStatusCriteria`, `mapToCompListing`) is only reachable through `GET /api/crm/sales/comps?listing_id=`, which needs a stored `Listing` row. Two of the three modes have no stored subject. A subject-free `POST /api/crm/comps/search` returning `CompListing[]` would give the browser `close_price`, `close_date`, `status_label`, `price_per_sqft` and a real `CloseDate` window — the four things my rebuild can only approximate through `/api/idx/search`. **This surface is on the CLAUDE.md §C hold list (`public/crm/**`) and a new route needs Maya's approval.**

### 6. Not done by me, by instruction
`public/crm/index-built.html` is stale — `tests/runtime/crm-build-drift.test.ts` fails until your final `npm run crm:build`. No new script entry is needed: everything I added lives in files `index.html` already loads.