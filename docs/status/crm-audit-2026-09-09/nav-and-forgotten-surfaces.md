> **STATUS HEADER (added 2026-09-10) — findings preserved; the fix plan below has already been executed.** This is the dated read-only audit of 2026-09-09. Its §2 and §3 were carried out on 2026-09-09/10: `stickyNavBuilding` / `stickyNavComps` ids were added, `updateStickyNavActive()` was extended to all six destinations and is now called from both `_serverSearch` render blocks, and `tests/runtime/crm-sticky-nav-destinations.test.ts` is green (25/25, re-run 2026-09-10). What actually changed is recorded in `docs/status/crm-audit-2026-09-09/repair/search-cma-nav.md` §7.
>
> **One caveat about that repair report, verified 2026-09-10:** its "NEEDS ANOTHER OWNER" item 4 says the `mallan:data:ready` restore path in `public/crm/js/init/init-hash-routing.js` still does not call `updateStickyNavActive()`. **That item has since been closed** — the call is present (now `public/crm/js/init/init-hash-routing.js:442`, added in commit `dc057054`, with a comment citing parity with the two sibling restore paths). Re-verify the repair report’s other open items against current HEAD before acting on them, rather than trusting either document’s status line.
>
> **Do not re-execute the plan from this file — read that repair report first.** Architecture note: the surfaces audited here belong to the **Backend Agent Search / Listings** application (`public/crm/index.html` → generated `index-built.html`, entry `/crm/search`), not to the Brokerage CRM (`public/crm/dashboard.html` + `js/dashboard/**`, served at `/crm`). See `CLAUDE.md` §A.0 and Master Plan §5.1.

## 1. DEFECTS

### A. The six sticky-nav destinations

**Nav markup:** `public/crm/html/search-form-and-results.html:6334-6373` (`#stickySearchNav`, inside `#searchResultsSection`). Handlers: `jumpToSearch()` `public/crm/js/search/search-engine.js:1768`, `jumpToComparables()` `:1794`, highlighter `updateStickyNavActive()` `:1726`.

| # | Destination | Markup | Handler | Wired? |
|---|---|---|---|---|
| 1 | Sale Basic | `:6342` `id="stickyNavSaleBasic"` | `jumpToSearch('sale','basic')` | highlight ✓ |
| 2 | Sale Advanced | `:6345` `id="stickyNavSaleAdv"` | `jumpToSearch('sale','advanced')` | highlight ✓ |
| 3 | Rental Basic | `:6349` `id="stickyNavRentBasic"` | `jumpToSearch('rent','basic')` | highlight ✓ |
| 4 | Rental Advanced | `:6352` `id="stickyNavRentAdv"` | `jumpToSearch('rent','advanced')` | highlight ✓ |
| 5 | Buildings | `:6356` **no `id`** | `jumpToSearch('building','basic')` | **highlight impossible; search always refused** |
| 6 | Comparables | `:6360` **no `id`** | `jumpToComparables()` | **highlight impossible; leaves form desynced** |

**D1 — Buildings and Comparables can never be highlighted.**
`search-engine.js:1740`
```js
var ids = ['stickyNavSaleBasic','stickyNavSaleAdv','stickyNavRentBasic','stickyNavRentAdv'];
```
`:1751-1752` sets `activeId` only for `sale`/`rent`; `currentSearchTab === 'building'` leaves `activeId = null`, and the Comps button has no tab at all. The two buttons at `:6356`/`:6360` also carry no `id`, so even an extended list could not reach them.
**Proven (jsdom probe, real click):** after clicking Buildings → `currentSearchTab = "building"`, label `"Buildings · Basic"`, **highlighted buttons `[]`**.

**D2 — Buildings is a dead destination.** `search-engine.js:324` `if (criteria.searchTab === 'building') refuse('Building search');` → `performSearch()` `:181-184` aborts.
**Proven:** clicking Buildings then Search → `warning: "Not executable in this Search: Building search."`, **0 executor requests**. The nav advertises a destination that can never run, with no disabled state (contrast `js/init/init-disable-dead-controls.js`, which exists precisely to forbid this).

**D3 — `jumpToSearch()` never resets the search *type*.** `search-engine.js:1768-1791` calls `toggleSearchTab` + `toggleSearchMode` but never `toggleSearchType('general')`. `#generalSearchSection` (`:54` of the partial) and `#comparablesSection` are siblings toggled only by `toggleSearchType` (`search-engine.js:2183`).
**Proven:** after `toggleSearchType('comparables')` then clicking sticky "Sales" → `generalSearchSection.display = "none"`, `comparablesSection.display = "block"`, while `#btnSale` is styled active. The agent lands on the Comparables form believing they are on Sales.

**D4 — the sticky nav's count and highlight are computed before the executor answers and never refreshed.**
`updateStickyNavActive()` is called only from `_showSearchResults()` `search-engine.js:220` — which runs *before* `_serverSearch()` `:193`. The success block `:453-456` calls `initializeSearchResults()` + `updateResultsCount()` + `refreshResultsMap()` but **not** `updateStickyNavActive()`. Same omission in `js/init/init-hash-routing.js:356-358` (the `mallan:data:ready` restore path, where `:346` and `:391` do call it).
**Proven:** on a 4,821-result search the toolbar reads `"4,821 Results"` and the sticky nav reads `"0 results"` on the same screen.

**D5 — the count itself is the wrong quantity.** `search-engine.js:1762` `var total = getFilteredListings(true).length;` — that is the **current page** (`render-dispatcher.js:82-150`, "no local sort, no local slice"), capped at `perPage`. `updateResultsCount()` `:1404-1406` correctly uses `searchResultsState.serverTotal`. Two contradictory totals from two different sources.

**D6 — `toggleSearchTab` decides form visibility from stale session state.** `search-engine.js:1911-1913` reads `sessionStorage.getItem('searchMode')` to pick basic vs advanced, then `jumpToSearch` `:1785` calls `toggleSearchMode(mode)` which sets it again. The tab's per-section show/hide (`:1979-2065`) is applied against the *old* mode. Harmless today only because `toggleSearchMode` runs second.

**D7 — the "Back" button re-derives mode from a CSS class.** `:6337` `document.getElementById('btnSearchBasic').classList.contains('bg-gray-900') ? 'basic' : 'advanced'` — a second, class-based copy of state that `sessionStorage['searchMode']` already holds (`search-engine.js:2083`). Any restyle of the mode toggle silently flips the Back destination.

---

### B. The "easily forgotten" surfaces

**D8 — Refine Results is 100% dead.** `search-engine.js:1638-1643` writes legacy tokens:
```js
statuses.push('ACTIVE'); ... push('COMING_SOON'); ... push('PENDING');
... { statuses.push('CONTRACT'); statuses.push('UNDER_CONTRACT'); } ... push('CLOSED');
```
`serializeSearchCriteria` `:337-346` validates every entry against the live contract's `StandardStatus` members (`Active`, `Pending`, `Closed`, `ComingSoon`, …) and refuses anything else by name; `applyRefinedSearch` `:1683` → `_serverSearch` `:393-396` returns without searching. `#refineStatusActive` is `checked` by default (`partial:6719`), so `statuses` is *never* empty — every Apply, every pill removal (`:1603-1610`), and `clearRefinePanel()` `:1722` abort.
**Proven:** `applyRefinedSearch()` → `warning: 'Not executable in this Search: Status "ACTIVE"'`, **0 executor requests**.
Also: `CONTRACT` / `UNDER_CONTRACT` (`:1641`, `:1523`) are not live members at all (live is `ActiveUnderContract`); the labels at `partial:6728/6736` ("Offer/Pending", "Closed") are transaction-blind — a rental Closed must read "Rented", a sale Pending "In Contract".

**D9 — every search-result renderer prints the raw internal token, never the transaction-aware label.** The executor DTO carries `status` as a CRM token (`lib/search/crm-idx-mapper.ts:180-216` maps `Pending`→`PENDING`, `Closed`→`CLOSED`, `Canceled`→**`CANCELLED`**) and supplies **no `status_label`** (grep: `status_label` is produced by `lib/compliance/dto.ts`, `lib/comps/fetch-comps.ts`, `lib/cma/engine.ts` — never by `crm-idx-mapper.ts`).
- `public/crm/js/render/grid-column-defs.js:13` — `reso: 'MlsStatus'` **and** `label = l.status` raw.
- `public/crm/js/render/render-gallery.js:6,45` and `:10` (`data-reso-field="MlsStatus"`).
- `public/crm/js/render/render-summary.js:6,50`; `render-short-summary.js:6,28`; `render-master-detail.js:26,84,153`.
- `public/crm/js/core/reso-field-map.js:174-183` — `getStatusBadgeClasses` has no case for `ACTIVEUNDERCONTRACT`, `CANCELLED`, `EXPIRED`, `HOLD`, `UNKNOWN`.

**Proven:** with a sale Pending, a sale Closed, a rental Closed and a Canceled row, the gallery renders `PENDING`, `CLOSED`, `CANCELLED` and contains **no** "In Contract", "Sold" or "Rented"; the grid emits `data-reso-field="MlsStatus"` and cells `>PENDING<`, `>CANCELLED<`. `MlsStatus` is not filterable on this feed and must never appear.

**D10 — sorting: 40 clickable headers, 3 executable sorts, and a silent side effect.** `render-grid.js:23` wires `onclick="toggleColumnSort(colId)"` onto **every** column with a sort arrow (`:17-22`). `pagination.js:12-20` mutates `sortField`/`sortOrder` then calls `renderSearchResults()` — a local re-render over a set the executor already ordered. `_serverSortKey()` `search-engine.js:382-387` can express only `newest | price_asc | price_desc`; anything else falls through to `price_desc`.
**Proven:** `toggleColumnSort('beds')` → order unchanged (`1,2,3,4` → `1,2,3,4`), `sortField` now `'beds'`. The next page turn (`goToServerPage` `:491`) then silently re-asks the executor in **price_desc**.

**D11 — listing detail drawer dies silently on a null carrying cost.** `pagination.js:117-120`
```js
+ '$' + listing.price.toLocaleString() ... listing.maintCC.toLocaleString() ... listing.totalMonthly.toLocaleString()
```
All three are nullable in the executor DTO (`crm-idx-mapper.ts:61` `price`, `:75` `maintCC = … : null`, `:261` `totalMonthly = … : null`). The blanket `catch(e){ console.error(...) }` at `pagination.js:1088` swallows the TypeError.
**Proven:** `showListingDetail()` on a row with `maintCC: null` → no exception, `#detailHeaderRight.textContent === ""`, no content rendered, no user-visible error.
Also `pagination.js:97` — `statusLabel` is the raw token (D9 again).

**D12 — Comparables bypasses the executor contract *and* the canonical comps engine.** `search-engine.js:2311-2457`:
- `:2415` calls `MallanAPI.idx.search(params)` directly — never `serializeSearchCriteria`, the browser's only contract gate.
- `:2343 params.address`, `:2352 params.buildingName`, `:2372-2373 params.minSqft/maxSqft` are **silently dropped**: `js/core/api-client.js:720-744` forwards only `type,minPrice,maxPrice,minBeds,maxBeds,minBaths,maxBaths,neighborhood,borough,status,listingId,zip,ownership,StructureType,sort,limit,skip`. On the *Subject Property* page the address is the only criterion, so the request degrades to `type=sale&status=Closed&limit=100` — every closed sale in the feed, presented as comparables for that address.
- `:2337 params.status = 'Closed'` with **no CloseDate window**, unlike the canonical `compsStatusWindowFilter` (`lib/comps/fetch-comps.ts`, pinned by `tests/runtime/comps-close-date-window.test.ts`).
- `:2432` header reads "Sold Date"/"Rented Date" but `:2438` renders `l.updatedDate || l.listedDate` — a **modification timestamp under a Sold Date column**.
- `:2446` `(l.status || 'CLOSED')` — raw token, and fabricates `CLOSED` when unknown.

**D13 — "Last Search" recall does not restore the transaction or the search type.** `js/search/search-actions.js:121-156`: `activeSearchCriteria = parsed.criteria` `:137` but `currentSearchTab` is never set from `parsed.criteria.searchTab`, and `toggleSearchType('general')` is never called. `_showSearchResults()` `:147` → `updateStickyNavActive()` then labels the recalled rental search "Sales · Basic" (`search-engine.js:1730-1736` reads `currentSearchTab`), and `populateRefinePanel` `:1497` inherits the same wrong tab.

**D14 — Saved searches: same missing `toggleSearchType`.** `js/search/saved-searches.js:219` calls `toggleSearchTab(tab)` only. Loading a saved search while the Comparables tab is showing restores fields into a hidden form and then runs `performSearch()` `:314`. (The rest of this module is correct — Packet 2's executed-params contract + `_restoreParity` `:269` are exemplary.)

**D15 — the local-DB fallback speaks a third status vocabulary.** `js/core/data-loader.js:239` `status: (apiListing.status || 'ACTIVE').toUpperCase()`. `'ComingSoon'.toUpperCase()` = `'COMINGSOON'`, which `_isComingSoonToken` (`js/render/shared-badges.js:30-32`, accepts only `ComingSoon | COMING_SOON | Coming Soon`) rejects — so on `_loadFromPrisma()` (`data-loader.js:366`) the **UCBA Art. I §5(C)/§16 Coming Soon badge never renders**. `'ActiveUnderContract'` → `'ACTIVEUNDERCONTRACT'` renders raw. `|| 'ACTIVE'` fabricates Active for a null status — exactly what `manage-listings-status-presentation.test.ts:148` forbids on the Manage surface.

**D16 — report surfaces fabricate Active and miss the double-L cancel.** `js/output/reports.js` has a correctly hardened `statusBadge()` `:652-669` (reads `status_label`, refuses to default) — but it is bypassed by `:1026` `(l.status || 'ACTIVE')`, `:1447` `(l.status || 'Active')`, `:1731` `(ohFirst.status||'ACTIVE')`, `:2100-2101` `(l.status || 'ACTIVE')`, `:2805`. And the RLS off-market photo restriction keys on one-L only — `:673 OFF_MARKET_STATUSES = {'CLOSED':1,…,'CANCELED':1,…}` and `:2515 offMkt = {…'CANCELED':1…}` — while the search mapper emits `CANCELLED`, so a canceled listing keeps its full photo set. Since the search DTO supplies no `status_label`, `statusBadge` always falls back to the raw token anyway.

**D17 — `renderSearchResults` has no `default:` branch.** `js/render/render-dispatcher.js:211-237`. `searchResultsState.viewMode` is seeded from `localStorage` (`data-loader.js:76`); any value outside the five (a stale `'list'`/`'map'` from the legacy `toggleResultsView` at `js/search/search-actions.js:8-42`, which is itself dead — it targets `#viewGrid`/`#viewList`/`#viewMap`, none of which exist) hides all containers and renders nothing.

**Surfaces that are correct — do not touch:**
Manage Listings status changes (`js/manage/manage-listings.js`, proven by `tests/runtime/manage-listings-status-presentation.test.ts`) · Client portals (`app/portal/*/page.tsx`, `lib/compliance/dto.ts:390-398`, `tests/runtime/portal-status-label.test.ts`) · Dashboards (in the ratchet at `manage-listings-status-presentation.test.ts:344-360`) · Pitch packets (`js/dashboard/panels/sales-crm/pitch-packet.js:156`, `panels/rentals-crm/rental-pitch-packet.js:251` — both read `status_label`) · the four contract-driven Search status panels (`search-engine.js:279-296`) · saved-search save/restore parity.

---

## 2. FIX PLAN

| # | Change | Owning file |
|---|---|---|
| D1 | Add `id="stickyNavBuilding"` / `id="stickyNavComps"`; extend the highlight list and derive the active id from `{tab, mode, searchType}` including `building` and `comparables` | `public/crm/html/search-form-and-results.html:6356,6360` + `js/search/search-engine.js:1740-1757` |
| D2 | Either wire Buildings to an executable path or `disabled` + "Not currently supported" per the existing dead-control policy | `js/init/init-disable-dead-controls.js` (add the selector) + `partial:6356` |
| D3 | `jumpToSearch()` calls `toggleSearchType('general')` before `toggleSearchTab`; `jumpToComparables()` clears the tab highlight | `js/search/search-engine.js:1768-1801` |
| D4 | Call `updateStickyNavActive()` in `_serverSearch`'s success **and** error render blocks, and in the `mallan:data:ready` restore path | `js/search/search-engine.js:453-456`, `:470-473`; `js/init/init-hash-routing.js:356-358` |
| D5 | `updateStickyNavActive` reads `serverTotal`/`serverCountMeaning` via one shared helper with `updateResultsCount` | `js/search/search-engine.js:1760-1764` |
| D6/D7 | `toggleSearchTab` takes mode as a parameter; the Back button reads `sessionStorage['searchMode']`, not a CSS class | `js/search/search-engine.js:1900-1913`; `partial:6337` |
| D8 | Rebuild the refine status row as a contract-driven mount (`data-status-mount="refine-sale"` / `"refine-rental"`, rendered by the existing `window.renderStatusPanels`), re-mounted per transaction on `populateRefinePanel` | `partial:6715-6738` + `js/search/search-engine.js:1513-1525, 1636-1643` |
| D9 | Add `status_label` (and `status_token`) to the executor DTO from `statusPresentation`, then render `l.status_label` in all five views; delete `reso:'MlsStatus'` and the `data-reso-field="MlsStatus"` attribute | `lib/search/crm-idx-mapper.ts:180-278`; `js/render/grid-column-defs.js:13`, `render-gallery.js:6,10,45`, `render-summary.js:6,50`, `render-short-summary.js:6,28`, `render-master-detail.js:26,84,153`, `js/core/reso-field-map.js:174` |
| D10 | `toggleColumnSort` maps to an executable key and calls `reissueServerSearch()`; render a sort affordance only on the 3 sortable columns | `js/search/pagination.js:12-20`; `js/render/render-grid.js:17-23` |
| D11 | Null-safe money formatting (one `fmtMoney(v)` helper returning `—`); narrow or remove the swallowing `catch` | `js/search/pagination.js:117-120, 1088` |
| D12 | Route Comparables through `/api/crm/sales/comps` (`lib/comps/fetch-comps.ts`) — CloseDate window, comp eligibility, `status_label`, real `close_date`; or at minimum refuse criteria the client cannot transmit instead of dropping them | `js/search/search-engine.js:2311-2457`; `js/core/api-client.js:720-744` |
| D13 | Store `searchTab` with the recalled criteria and restore tab + type before `_showSearchResults()` | `js/search/search-actions.js:111-149` |
| D14 | `_paramsToFormFields` calls `toggleSearchType('general')` first | `js/search/saved-searches.js:219` |
| D15 | Map through `normalizeStandardStatus`/the same token map as `crm-idx-mapper`; never `|| 'ACTIVE'` | `js/core/data-loader.js:239` |
| D16 | Replace the five raw-token sites with `statusBadge(l.status, l)`; add `CANCELLED` to both off-market maps | `js/output/reports.js:673, 1026, 1447, 1731, 2100-2101, 2515, 2805` |
| D17 | Add `default:` falling back to `'gallery'` and normalize the persisted value on read | `js/render/render-dispatcher.js:211-237`; `js/core/data-loader.js:76` |
| all | `npm run crm:build` after source edits (enforced by `tests/runtime/crm-build-drift.test.ts`) | `public/crm/index-built.html` (generated) |

---

## 3. FAILING TEST DESIGN

One new file, `tests/runtime/crm-search-nav-and-forgotten-surfaces.test.ts`, with a shared `bootSearchPage()` (see §4). **Every case below drives a real DOM event or the real global handler and asserts on the rendered DOM / the request the page actually issued — no source grep.** (Source ratchets are named where they are a *supplement*, and are explicitly called out as insufficient alone.)

**T1 — Buildings and Comps are highlightable.** `btn('Buildings').click()` (a real `click()` on the `#stickySearchNav` button), then read every `#stickySearchNav button` carrying `bg-white/15`. Assert `['Buildings']`. Repeat for Comps. *Fails today:* `[]` (probe-verified).

**T2 — no nav destination is a dead end.** For each of the six: click it, then click the Search button (`partial:6322`) or `showCompResults('property')`, with `window.showToast` captured and `fetch` recorded. Assert either (a) ≥1 request to `/api/idx/search`, or (b) the button is `disabled`. *Fails today* for Buildings: a `warning` toast and 0 requests (probe-verified).

**T3 — a nav jump out of Comparables shows the general form.** `toggleSearchType('comparables')`; `btn('Sales').click()`; assert `getComputedStyle`/`style.display` of `#generalSearchSection` is not `'none'` **and** `#comparablesSection` is `'none'`. *Fails today:* `"none"` / `"block"` (probe-verified).

**T4 — the sticky count equals the toolbar count, after the executor answers.** Stub `/api/idx/search` → `{listings:[4 rows], total:4821}`; call `performSearch()`; await settle. Assert `#stickyNavResultCount.textContent` contains `4,821` and equals the number in `#resultsCount`. *Fails today:* `"0 results"` vs `"4,821 Results"` (probe-verified).

**T5 — Refine Results reaches the executor.** With `activeSearchCriteria = {searchTab:'sale', statuses:['Active']}`, set `#refineMinPrice.value` and dispatch `change`, then `document.querySelector('[onclick="applyRefinedSearch()"]').click()`. Assert exactly one new `/api/idx/search` request whose query string contains `status=Active` and the new `minPrice`, and that `showToast` was **not** called with a `warning`. *Fails today:* 0 requests, `'Not executable in this Search: Status "ACTIVE"'` (probe-verified).

**T6 — refine status labels are per-transaction.** Open the refine panel on a rental search; assert the rendered label set contains `Rented` and not `Sold`/`In Contract`; repeat for sale (contains `Sold`, `In Contract`, not `Rented`) — asserting on `panel.textContent`, mirroring `crm-search-status-modes.test.ts:196-208`.

**T7 — result views print the broker word.** Feed the 4-row fixture (sale `Pending`, sale `Closed`, rental `Closed`, `Canceled`). For each of the five modes, call `setViewMode(m)` and assert on the container's `textContent`: contains `In Contract`, `Sold`, `Rented`, `Canceled`; does **not** contain `PENDING`, `CLOSED`, `CANCELLED`. Additionally assert `gridViewContainer.innerHTML` contains no `MlsStatus`. *Fails today* on all six assertions (probe-verified).

**T8 — a sort header either sorts or is not a control.** `toggleColumnSort('beds')`; assert **either** a new `/api/idx/search` request whose `sort` param changed, **or** that no `<th>` for a non-executable column carries an `onclick`/sort icon. Also assert `_serverSortKey()` is unchanged from before the click when the column is not executable. *Fails today:* order unchanged, `sortField='beds'`, no request (probe-verified).

**T9 — the detail drawer survives a null carrying cost.** `showListingDetail(id)` for a row with `maintCC:null, totalMonthly:null`; assert `#detailHeaderRight.textContent` contains the price and `—` (or "Unavailable"), and that `#listingDetailContent.innerHTML.length > 0`. *Fails today:* header is `""`, content empty, exception swallowed (probe-verified).

**T10 — Comparables transmits what it collected.** Type an address into `#compPropertyAddress` (dispatch `input`), click `showCompResults('property')`; assert the recorded `/api/…` request URL carries that address (or, if unsupported, that a refusal toast named it and **no** request was issued). Assert the rendered `Status` cell reads `Sold` for a sale comp and the `Sold Date` column value equals the fixture's `close_date`, not its `updatedDate`. *Fails today:* URL is `/api/idx/search?type=sale&status=Closed&limit=100`; cell reads `CLOSED`; date is the modification timestamp.

**T11 — Last Search recall restores the transaction.** Run a rental search, click "Last Search" (`partial:6312`); assert `#stickyNavActiveLabel.textContent` starts with `Rentals` and `#refineSearchType.textContent` is `Rentals`. *Fails today:* `Sales · Basic`.

**T12 — refresh at `#results` sets the sticky nav.** Boot the page at `url: '…#results'` with a populated `sessionStorage['_searchState']`; after `mallan:data:ready` settles, assert one nav button is highlighted and the count is non-zero. *Fails today:* `init-hash-routing.js:356-358` never calls `updateStickyNavActive`.

**T13 — the local-DB fallback still fires the Coming Soon badge.** Make `/api/idx/search` reject so `_loadFromPrisma()` runs, with a `/api/crm/listings` row `status:'ComingSoon'`. Assert the rendered gallery contains `[data-compliance="coming-soon-badge"]`. *Fails today:* `'COMINGSOON'` misses `_isComingSoonToken` (`shared-badges.js:30`).

**T14 — an unknown view mode still renders.** Seed `localStorage['searchResultsViewMode'] = 'list'`, boot, search; assert exactly one of the five view containers has `display !== 'none'` and is non-empty.

**Supplementary source ratchets (insufficient alone — state this in the test file):** extend `OWNED_STATUS_SURFACES` (`manage-listings-status-presentation.test.ts:344-360`) with `js/render/grid-column-defs.js`, `render-gallery.js`, `render-summary.js`, `render-short-summary.js`, `render-master-detail.js`, `js/core/reso-field-map.js`, `js/search/pagination.js`, `js/search/search-engine.js`, `js/output/reports.js`, `js/core/data-loader.js` so `MlsStatus`, `'Cancelled':`, and `|| 'ACTIVE'` cannot come back.

---

## 4. THE HARNESS QUESTION

### Existing exemplars

**(1) Best "assert on the result" pattern — `tests/runtime/manage-listings-status-presentation.test.ts:85-103`**
```js
function boot(rows = ROWS) {
  const dom = new jsdom.JSDOM(`<!doctype html><html><body>${MANAGE_HTML}${MODAL_HTML}</body></html>`,
                              { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.MallanAPI = { listings: { list: jest.fn(async () => ({ listings: rows.map(project) })),
                              updateStatus: jest.fn(async () => ({ ok: true })), … },
                  _fetch: jest.fn(async (url) => optionsFor(url)),   // → the REAL route handler
                  showings: { … } };
  w.showToast = jest.fn(); w.confirm = jest.fn(() => true); w.prompt = jest.fn(() => null);
  w.eval(OH_SRC); w.eval(MANAGE_SRC);
  return w;
}
```
DOM from the **real partials**; `MallanAPI` stubbed with `jest.fn`, with `_fetch` routed to the **real** `app/api/crm/status-options/route.ts` (`:75-80`); real handlers invoked (`w.renderManageSection('sales')` `:120`, `w.toggleCardAction(…)` `:219`, `await w.manageApplyWorkflowStatus(…)` `:256`); assertions on rendered DOM (`:161`, `:222`) **and** on the request (`expect(w.MallanAPI.listings.updateStatus).toHaveBeenCalledWith('1','ContractSigned',{PurchaseContractDate:'2026-09-01'})` `:258`). `flush()` `:82` settles promises.

**(2) Best whole-page click-through — `tests/runtime/crm-form-dom-roundtrip.test.ts:112-195, 225**
```js
class LocalOnly extends jsdom.ResourceLoader {           // :112 — serves public/crm/** to <script src>
  fetch(url) { const m = url.match(/^http:\/\/localhost\/crm\/(.+)$/); … }
}
const dom = new jsdom.JSDOM(html, {                      // :164
  url: `http://localhost/crm/${file}`, runScripts: 'dangerously',
  resources: new LocalOnly(), pretendToBeVisual: true, virtualConsole,
  beforeParse(window) {
    window.fetch = async (input, init) => { … await liveApi(url, method, init.body, live) … };  // → REAL Next handlers
    window.scrollTo = () => {}; window.alert = () => {}; window.confirm = () => true;
    window.HTMLElement.prototype.scrollIntoView = function () {};
    window.matchMedia = () => ({ matches: false, addListener(){}, … });
  },
});
await new Promise(done => { … dom.window.addEventListener('load', …) });   // :189
function fire(win, el, ...types) { for (const t of types) el.dispatchEvent(new win.Event(t, {bubbles:true})); }  // :225
```

**(3) Single renderer against the real server contract — `tests/runtime/crm-search-status-modes.test.ts:147-172`** — loads `html/search-form-and-results.html` into JSDOM, lifts `window.renderStatusPanels` out of `search-engine.js` by brace-matching (`:160-169`), `win.eval`s it, calls it with the real `searchContract()`, asserts on the rendered checkboxes (`:175-194`).

**(4) Search-shell renderers in a `vm` sandbox — `tests/runtime/crm-designation-no-fabrication.test.ts:212-265`** — `vm.createContext` over a jsdom `document`, `vm.runInContext` of `reso-field-map.js` → `reports.js` → `pagination.js` **in the real load order**, then calls the real renderers. This is the cheapest way to exercise D9/D11/D16 without booting the whole page.

**Nothing in the repo loads `index-built.html` into a DOM.** All nine tests that mention it (`crm-build-drift.test.ts:33`, `crm-search-status-modes.test.ts:60`, `crm-api-base-url-same-origin.test.ts:53`, `crm-impersonation-server-wire.test.ts:42`, `crm-portal-consent-capture.test.ts:350`, `crm-designation-no-fabrication.test.ts:911`, …) read it as **text**. **No existing test clicks anything on the search page.**

### Feasibility: YES — proven, not estimated

I ran a read-only jsdom probe (no files written) against `public/crm/index-built.html` with jsdom 25.0.1, `runScripts:'dangerously'`, the `LocalOnly` ResourceLoader, and a stubbed `window.fetch` serving `/api/auth/me`, `/api/idx/search/contract` and `/api/idx/search`:

```
parse+load ms 6939
stickySearchNav present: true
sticky nav buttons: [{"id":"(no id)","text":"Back"},{"id":"stickyNavSaleBasic",…},{"id":"stickyNavSaleAdv",…},
                     {"id":"stickyNavRentBasic",…},{"id":"stickyNavRentAdv",…},
                     {"id":"(no id)","text":"Buildings"},{"id":"(no id)","text":"Comps"},{"id":"stickyNavMapToggleBtn",…}]
typeof jumpToSearch function | toggleSearchTab function | toggleSearchType function |
updateStickyNavActive function | applyRefinedSearch function | showListingDetail function
status mounts: basic-sale:4 basic-rental:4 advanced-sale:4 advanced-rental:4
```
All ten behavioural findings above marked "Proven" came from real `.click()` calls on those buttons.

**What must be built (~120 lines, one file):**
1. `bootSearchPage()` — pattern (2) verbatim, pointed at `index-built.html` instead of a form file. Because everything is inlined, `LocalOnly` only needs to return `null` for the three CDN scripts (Tailwind, Font Awesome, EmailJS); no local resource is required.
2. A `fetch` router serving `/api/auth/me` (must answer `authenticated:true` or `agent-context.js:95` navigates to `login.html`), `/api/idx/search/contract` from the **real** `searchContract()` (`@/lib/search/engine/contract`, exactly as `crm-search-status-modes.test.ts:22,145` does), `/api/idx/search` from a fixture, and `/api/crm/*` from empty stubs — with every URL recorded so tests can assert on request params.
3. `const btn = t => [...doc.querySelectorAll('#stickySearchNav button')].find(b => b.textContent.trim().startsWith(t))` plus the `fire()` helper from `crm-form-dom-roundtrip.test.ts:225`.
4. `jest.setTimeout(180_000)` and **one `beforeAll` boot per describe** — the page costs ~7 s to parse and load (`crm-build-drift.test.ts:30` already budgets 180 s for this directory; `crm-search-status-modes.test.ts:142` uses 120 s).
5. Fixtures shaped like the executor DTO (`lib/search/crm-idx-mapper.ts:255-290`), including `maintCC:null`/`totalMonthly:null` rows for T9 and both `Canceled`/`CANCELLED` spellings for T7.

No new dependency, no new config: `tests/runtime/jest.config.js` (`testEnvironment:'node'`, `testMatch:['**/*.test.ts']`) already picks the file up, and jsdom is instantiated per-test exactly as the four exemplars do.

**File ownership for the harness:** new `tests/runtime/crm-search-nav-and-forgotten-surfaces.test.ts` only; extend the ratchet list already in `tests/runtime/manage-listings-status-presentation.test.ts:344-360`.

---

## 4. FILE OWNERSHIP (complete)

**Source (edit, then rebuild):**
- `public/crm/html/search-form-and-results.html` — `:6337`, `:6356`, `:6360`, `:6715-6738`
- `public/crm/js/search/search-engine.js` — `:324`, `:453-456`, `:470-473`, `:1513-1525`, `:1636-1643`, `:1740-1764`, `:1768-1801`, `:1900-1913`, `:2311-2457`
- `public/crm/js/search/pagination.js` — `:12-20`, `:97`, `:117-120`, `:1088`, `:1236-1239`
- `public/crm/js/search/search-actions.js` — `:8-42` (delete dead `toggleResultsView`), `:111-149`
- `public/crm/js/search/saved-searches.js` — `:219`
- `public/crm/js/render/grid-column-defs.js` — `:13`
- `public/crm/js/render/render-grid.js` — `:17-23`
- `public/crm/js/render/render-gallery.js` — `:4-10`, `:45`
- `public/crm/js/render/render-summary.js` — `:6-8`, `:50`
- `public/crm/js/render/render-short-summary.js` — `:6`, `:28`
- `public/crm/js/render/render-master-detail.js` — `:26`, `:84`, `:153`
- `public/crm/js/render/render-dispatcher.js` — `:211-237`
- `public/crm/js/render/shared-badges.js` — `:30-32`, `:159-160`
- `public/crm/js/core/reso-field-map.js` — `:174-183`
- `public/crm/js/core/data-loader.js` — `:76`, `:239`
- `public/crm/js/core/api-client.js` — `:720-744` (only if Comparables stays on `idx.search`)
- `public/crm/js/output/reports.js` — `:673`, `:1026`, `:1447`, `:1731`, `:2100-2101`, `:2515`, `:2805`
- `public/crm/js/init/init-hash-routing.js` — `:356-358`
- `public/crm/js/init/init-disable-dead-controls.js` — `:37+` (D2)

**Server (for D9 / D12):**
- `lib/search/crm-idx-mapper.ts` — `:180-216`, `:255-290` (emit `status_label` + `status_token`)
- `lib/search/engine/hydrate.ts` — `:145` (pass the transaction through)

**Generated (never hand-edit; regenerate with `npm run crm:build`):**
- `public/crm/index-built.html`

**Tests:**
- new `tests/runtime/crm-search-nav-and-forgotten-surfaces.test.ts`
- `tests/runtime/manage-listings-status-presentation.test.ts:344-360` (extend ratchet)

**Untouched:** the four standalone listing pages (`SALE-FORM-REDESIGN.html`, `RENTAL-FORM-REDESIGN.html`, `SALE-FORM-WITH-TOOLS.html`, `RENTAL-FORM-WITH-TOOLS.html`), `lib/crm/status-mapping.ts`, `app/api/crm/status-options/route.ts`, `lib/search/engine/contract.ts`, all portal/dashboard/pitch-packet files.