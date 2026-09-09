# COMPARABLES BUTTONS + REPORT/PDF WORKFLOW — read-only audit

Nothing was edited. All paths absolute-relative to `C:/Users/MayaAllan/Desktop/mallan-nyc`.

---

## 0. WIRING MODEL (needed to read the rest)

`public/crm/build.js:70-82` inlines each `js/**.js` verbatim into a plain `<script>` block. `public/crm/js/search/search-engine.js` has no IIFE wrapper, so its top-level `function` declarations become globals. That is why the comparables navigation works via inline `onclick`.

**`public/crm/js/compliance/compliance-gates-and-output.js:1798` does NOT wire anything.** It is compliance test **B6 "CMA/Comps Integrity"** (lines 1793-1804) and only asserts `typeof window[fn] === 'function'` for `openCompPage`/`showCompResults`/`toggleCompSaleRent`/`backToCompSelection`. The real definitions are `public/crm/js/search/search-engine.js:2209, 2223, 2233, 2311`. B6 reports PASS while the four report buttons are dead — **the audit measures the wrong thing.**

I checked every click delegation in `public/crm/js/**` for a listener that could adopt these buttons: `dashboard/app.js:573`, `dashboard/panels/lease-tracker.js:468`, `init/init-ui.js:173`, `listing/toolbar-functions.js:164`, `output/reports.js:301` (matches only `.report-tile` inside `[data-step]`), `render/render-dispatcher.js:70`, `search/date-range-picker.js:310`, `search/neighborhood-autocomplete.js:185`, `search/pagination.js:1362`, `search/search-engine.js:679`, `search/transit-search.js:29`. **None matches.** The seven buttons below are genuinely unwired, not wired-by-delegation.

---

## 1. DEFECTS

### Complete Comparables button inventory (`public/crm/html/search-form-and-results.html`, section `#comparablesSection` = lines 5297-6307)

| Line | Button | State |
|---|---|---|
| 5303 / 5304 | Sales / Rentals (landing) | WIRED `toggleCompSaleRent()` → `search-engine.js:2233` |
| **5307** | **Load Comp Criteria** | **UNWIRED** |
| **5310** | **Save Comp Criteria** | **UNWIRED** |
| **5313** | **Generate Report** | **UNWIRED** |
| **5316** | **Clear Criteria** | **UNWIRED** |
| 5324 / 5341 / 5358 | Search Comparables — property / building / general | WIRED `openCompPage()` → `search-engine.js:2209` |
| 5448 / 5499 / 5853 | back arrows | WIRED `backToCompSelection()` → `search-engine.js:2223` |
| 5457 / 5458 / 5508 / 5509 / 5862 / 5863 | per-page Sales / Rentals | WIRED `toggleCompSaleRent()` |
| 5470 / 5821 / 6280 | Search Comparables (execute) | WIRED `showCompResults()` → `search-engine.js:2311` — **but broken, see D4-D7** |
| **5473** | **Generate Report** (Subject Property) | **UNWIRED** |
| **5824** | **Generate Report** (Subject Buildings) | **UNWIRED** |
| 5874 | Neighborhood map | WIRED `openNeighborhoodMapForSearch()` |
| **6283** | **Generate Report** (General Criteria) | **UNWIRED** |
| 6312/6316/6321/6322 | sticky Last Search / Save / Clear / **Search** | WIRED, but see D8 |

---

**D1 — Four "Generate Report" buttons are dead controls.**
`public/crm/html/search-form-and-results.html:5313-5315`, `5473-5475`, `5824-5826`, `6283-6285`. Exact markup (all four identical but for the wrapper class):
```html
<button class="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
    <i class="fas fa-print mr-2"></i> Generate Report
</button>
```
No `onclick`, no `id`, no `data-*` hook, no class a listener keys on. Clicking produces nothing — no toast, no console line, no modal. A working `openReportsModal(ids, output)` exists at `public/crm/js/output/reports.js:168` and is reachable from the general-search toolbar, so the capability exists and is simply not connected here.

**D2 — Load / Save / Clear Comp Criteria are dead controls.**
`search-form-and-results.html:5307-5309` (Load), `5310-5312` (Save), `5316` (`<button class="px-4 py-2 border rounded text-sm hover:bg-gray-50">Clear Criteria</button>`). Same defect class. Note the general search has real equivalents — `recallLastSearch()` / `openSaveSearchModal()` / `clearSearchForm()` at `search-form-and-results.html:6312, 6316, 6321` — so agents reasonably expect these to behave the same way.

**D3 — D1+D2 violate the project's own written policy and evade its enforcer.**
`public/crm/js/init/init-disable-dead-controls.js:13-17` records the owner directive verbatim: *"Do not allow visible controls that silently do nothing."* Its `DEAD_SELECTORS` (lines 37-111) are all `input[...]` selectors, so the seven `<button>` elements are outside its reach and ship visibly enabled.

**D4 — `showCompResults()` sends comp criteria the API client silently discards; the Subject Property search is unconstrained.**
`public/crm/js/search/search-engine.js:2343` `params.address = addrEl.value.trim();`, `:2352` `params.buildingName = ...`, `:2372-2373` and `:2398-2399` `params.minSqft/maxSqft`.
`public/crm/js/core/api-client.js:720-745` (`MallanAPI.idx.search`) has **no branch for `address`, `buildingName`, `minSqft` or `maxSqft`** — they are never serialized. `lib/search/engine/criteria.ts:119-125` (`EXECUTED_PARAMS`) does not contain them either, so they are not executable server-side even if forwarded (`app/api/idx/search/route.ts:43-53` would 400 `UNSUPPORTED_CRITERION`).
Consequence: `search-engine.js:2344-2346` **requires** an address (`showToast('Please enter an address or building name.')` and `return`), then discards it. The request actually issued is `/api/idx/search?type=sale&status=Closed&limit=100` — every closed listing on the feed — rendered under the heading "Comps for Sale" (`search-engine.js:2426`). Also `api-client.js:718` JSDoc falsely advertises `buildingName` as supported.

**D5 — The Comparables tab bypasses the canonical comps authority.**
`search-engine.js:2337` `params.status = 'Closed';` is a hand-rolled comp query. The canonical authority is `lib/comps/fetch-comps.ts` (`compsStatusWindowFilter`, `applyCompEligibility`), `lib/comps/status-criteria.ts`, `lib/search/canonical/comp-eligibility.ts`, exposed at `app/api/crm/sales/comps/route.ts` — which windows closed comps by `CloseDate`, enforces sale/rental transaction agreement (`app/api/crm/sales/comps/route.ts:54-70`) and segments by ownership. `tests/runtime/comps-close-date-window.test.ts:21-46` pins that behavior. The CRM comps page applies **none** of it: no `CloseDate` window, no transaction agreement, no eligibility filter.

**D6 — The "Comparables Within" date windows are decorative.**
`search-form-and-results.html:5382-5399` (`#compSaleDates`), `5406-5427` (`#compRentalDates`), `5781-5799` (`#compBuildingSaleDates`), `6240-6258` (`#compGeneralSaleDates`). Every field is `readonly`, has **no `id`**, and carries a frozen literal, e.g.:
```html
<input type="text" value="Last 90 Days (11/03/2025 - 02/01/2026)"
       class="w-full border rounded-lg px-4 py-2 pr-10 text-sm" readonly>
```
`showCompResults()` never reads them. The dates are also stale by ~7 months against today (2026-09-09), and the Sold row shows a *60*-day window while the label pattern elsewhere is 90.

**D7 — The comps result table renders a non-transaction-aware, hardcoded status.**
`public/crm/js/search/search-engine.js:2446`:
```js
html += '<td class="px-3 py-2"><span class="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">' + (l.status || 'CLOSED') + '</span></td>';
```
Per `lib/crm/status-mapping.ts` and the contract's `statusChoices`, a sale `Closed` must read **Sold** and a rental `Closed` must read **Rented**. This cell prints the raw token, or literally `CLOSED` when absent — a label that exists in no vocabulary. The header at `:2426` is transaction-aware ("Comps for Sale"/"Comps for Rental"); the per-row badge is not.

**D8 — The sticky Search button runs the general search while the Comparables tab is showing.**
`search-form-and-results.html:6322` `<button onclick="performSearch()">`. It sits in the sticky bar at `6310-6326`, inside `#searchFormContainer` (closed at `6327`), so it stays visible when `toggleSearchType('comparables')` (`search-engine.js:2183`) reveals `#comparablesSection`. `performSearch()` (`search-engine.js:161-198`) never branches on search type — it collects the hidden general form and runs a normal search.

---

### Report workflow — where each output lives and what it actually produces

Entry: `public/crm/html/modals/reports.html:617` `<button onclick="generateReport()">Generate & Send</button>` → `public/crm/js/output/reports.js:2962-3050`, five cases, matching the five tiles at `reports.html:174-195` (`data-step="output"`, `data-value` = `email|print|share|csv|excel`; selected by the delegation at `reports.js:301-307`).

| Output | Code | Actually produces |
|---|---|---|
| Email | `reports.js:3012-3048` → `wrapReportForEmail:1974` → `sendEmailDirect:1871` → `sendViaEmailJS` (`js/core/email-service.js`) | Client-side EmailJS send. **If `isEmailConfigured()` is false, `reports.js:1965-1969` fakes it** and the overlay says *"Email sent (simulated)"* (`:1939`) — after `closeReportsModal()` already ran at `:3038`. |
| Print | `reports.js:3004-3010` → `buildFullReportHTML:2736` → `printReportViaIframe:2878` → `openPrintableWindow` (`js/output/print-helper.js:9`) | A Blob-URL tab with print CSS (`reports.js:2894-2909`) and a `window.print()` toolbar button (`:2915`). **A browser print dialog. No file.** |
| Shareable Link | `reports.js:2372-2391` | base64 config appended to **`https://mallan.nyc/reports/view?config=`** (`:2384`), copied to clipboard. **`app/reports/` does not exist** — the link 404s. Hardcoded prod origin. |
| CSV | `reports.js:2299-2330` | Real CSV Blob, `mallan-report-YYYY-MM-DD.csv`, fields from `getSelectedReportFields():382`, customer version narrowed by `csvExcelAllowlistCustomer` (`:2307`). Correct. |
| Excel | `reports.js:2333-2369` | **Not Excel.** An HTML `<table>` string (`:2344-2358`) saved as `.xls` with `application/vnd.ms-excel`. `exceljs ^4.4.0` is already a dependency and is unused here. |

Compliance filtering for all five: `getReportListings():2406-2452`, notably `:2447` drops `idxDisplayYN === false || internetDisplayYN === false`, `:2451` caps at 250. Disclosures live in `reports.js:685` (`listingAttribution`), `:690` (`statisticalDisclaimer`), `:719` (`commissionDisclosure`), `:771` (`brokerFooter`) — **browser-side only.**

**D9 — There is no PDF output in the connected workflow, and one control is mislabeled.**
`reports.html:174-195` offers exactly five tiles; `generateReport()` has exactly five cases. The only PDF affordance anywhere in the live path is `public/crm/html/modals/report-preview.html:25`:
```html
<button onclick="printReportFromPreview()" class="..."><i class="fas fa-print"></i> Print/PDF</button>
```
→ `reports.js:2245-2254` → `printReportViaIframe` → print dialog. It is labelled "Print/PDF" but generates no PDF; the user must know to pick "Save as PDF" in the OS dialog.

**D10 — Orphan PDF controls: `#pdfDeliveryOptions` is markup with nothing behind it, in a modal that is not even built.**
`public/crm/html/modals/client-delivery.html:103-131` — "PDF Format" radios `name="pdfFormat"` values `summary` (`:109`) / `detailed` (`:114`), plus "Include cover page" / "Include agent contact" / "Include floor plans" (`:120-130`).
Proof of no implementation:
- Zero references to `pdfDeliveryOptions`, `pdfFormat`, `emailDeliveryOptions`, `portalDeliveryOptions`, `luxuryDeliveryOptions` or `.delivery-options` anywhere in `public/crm/js/**`.
- The file is **not `@include`d** — `public/crm/index.html:65-78` lists seven partials and seven modals; `client-delivery.html` is not among them. `grep -c clientDeliveryModal public/crm/index-built.html` = **0**. It cannot render.
- `openDeliveryModal()` (`public/crm/js/search/search-actions.js:54-56`) now forwards to `openReportsModal(ids, 'email')`; the panel is unreachable by design.
- Its footer buttons `previewListingSheet()` / `emailListingSheet()` (`client-delivery.html:188, 191`) do exist (`compliance-gates-and-output.js:268, 311`) but are only reachable from markup that never ships.
- **Bonus bug:** `closeDeliveryModal()` (`search-actions.js:58-61`) sets `#reportsModal.style.display='none'`, while the modal is toggled by the `hidden` class (`reports.js:207`, `:211`). It is invoked on every Escape (`search-actions.js:99-107`), so one Escape press permanently poisons the modal — `openReportsModal()` removes `hidden` but the inline `display:none` survives.

**D11 — `public/crm/js/output/report-package.js` (1050 lines) is never loaded.**
`public/crm/index.html:139-144` loads only `output/print-helper.js`, `output/reports.js`, `output/report-customize.js`, `output/calculators.js`. Confirmed against the build: `public/crm/index-built.html` contains exactly four `═══ js/output/…` markers (lines 24322, 24359, 27413, 27584). `buildSearchReportPackage` (`report-package.js:15`) plus its nine section renderers (`_gridSection:299` … `_imagesSection:957`) have **zero callers**. `public/crm/js/output/client-feedback.js` (138 lines) is likewise never loaded.

**D12 — The one route named `/pdf` returns HTML, and the real PDF renderer is orphaned.**
`app/api/crm/sales/prospects/[id]/pdf/route.ts:4-7` header states *"Generate a professional PDF pitch packet… Uses @react-pdf/renderer… Returns: application/pdf with Content-Disposition header."* The handler at `:477-483` returns:
```ts
return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
```
`public/crm/js/dashboard/panels/sales-crm/pitch-packet.js:366` labels the button *"Download PDF"* and `:556` does `window.open('/api/crm/sales/prospects/' + id + '/pdf', '_blank')` — the user gets an HTML tab. `lib/pdf/pitch-packet-simple.ts:48` `renderSimplePitchPdf()` is a working `pdf-lib` renderer with **zero importers**.

**D13 — Excel export is an HTML table with a `.xls` extension** (`reports.js:2344-2363`). Excel raises "file format doesn't match extension" on open. `exceljs ^4.4.0` is installed.

**D14 — Shareable Link targets a nonexistent route** (`reports.js:2384`); `generateReport()` still closes the modal and logs `report_shareable_link` success (`:2997-3002`).

**D15 — Email silently simulates** (`reports.js:1965-1969`, success text at `:1939`), after the modal has closed.

---

## 2. FIX PLAN

| # | Change | Owning file |
|---|---|---|
| **D1** | Give each of the four buttons `onclick="openCompReport('property'\|'building'\|'general'\|'landing')"`. Add `openCompReport(page)` to `search-engine.js` next to `showCompResults`: reads the comp result set cached by `showCompResults`, and if empty shows `showToast('Run a comparables search first.')`; otherwise calls `openReportsModal(ids, 'print')` with `reportState.format='cma'`. **If the comp report is not being built this cycle, instead extend `init-disable-dead-controls.js` `DEAD_CONTAINERS` with `#comparablesSection` toolbars** — but do not leave them enabled. | markup: `public/crm/html/search-form-and-results.html`; handler: `public/crm/js/search/search-engine.js` (or `public/crm/js/init/init-disable-dead-controls.js` for the disable path) |
| **D2** | Wire to the three functions that already exist: Clear → new `clearCompCriteria()` resetting the `compBuilding*`/`compGeneral*`/`compPropertyAddress` controls; Save/Load → `MallanAPI.savedSearches` with a `kind:'comps'` payload, or disable per D1's fallback. | `search-form-and-results.html` + `public/crm/js/search/search-engine.js` |
| **D3** | Add a repo-level rule: no `<button>` inside `#comparablesSection` without `onclick`/`id`/`data-action`. Enforce via the test in §3 T1, not a comment. | `tests/runtime/` |
| **D4** | Stop building a query the wire cannot carry. Two options: **(a)** route the comps page to `GET /api/crm/sales/comps` (already canonical, already auth-gated); **(b)** if `/api/idx/search` must stay, the address/building/sqft controls have no executable path — disable them and drop the "address required" gate. Also fix the false JSDoc at `api-client.js:718`. | `public/crm/js/search/search-engine.js`, `public/crm/js/core/api-client.js` |
| **D5** | Same as D4(a): the comps page must call the authority in `lib/comps/`, not hand-roll `status:'Closed'`. | `public/crm/js/search/search-engine.js` (+ possibly a thin `app/api/crm/comps/search/route.ts` accepting free-form criteria and delegating to `fetchComps`) |
| **D6** | Give the six date inputs ids, wire them to the existing date-range picker (`public/crm/js/search/date-range-picker.js`), and pass the window into the comps request as the `CloseDate` months parameter `compsStatusWindowFilter` already accepts. | `search-form-and-results.html` + `search-engine.js` |
| **D7** | Replace `(l.status \|\| 'CLOSED')` with the transaction-aware label from the contract (`Closed` → `Sold` for sale, `Rented` for rental; `Pending` → `In Contract` for sale, `Pending` for rental; `Canceled` one L). Reuse `window.__searchContract.statusChoices[transaction]` already fetched by `renderStatusPanels`. | `public/crm/js/search/search-engine.js:2446` |
| **D8** | In `toggleSearchType('comparables')`, hide the sticky action bar (`search-form-and-results.html:6310`) or swap `performSearch()` for `showCompResults(activeCompPage)`. | `public/crm/js/search/search-engine.js:2183` + `search-form-and-results.html:6310` |
| **D9** | Rename `report-preview.html:25` to **"Print / Save as PDF"** and `reports.html:181` `Print` → `Print / Save as PDF`. Then either add a real PDF output (see §5) or stop implying one. | `public/crm/html/modals/report-preview.html`, `public/crm/html/modals/reports.html` |
| **D10** | Delete `public/crm/html/modals/client-delivery.html` (unbuilt orphan) — a source-of-truth-charter deletion, so needs Maya. Separately fix `closeDeliveryModal()` to use `classList.add('hidden')` or just delegate to `closeReportsModal()`. | `public/crm/html/modals/client-delivery.html`, `public/crm/js/search/search-actions.js:58-61` |
| **D11** | Either `<script src="js/output/report-package.js">` into `public/crm/index.html` and add a `package` format tile, or delete it. Do not leave 1050 lines of unreachable report code as apparent source of truth. | `public/crm/index.html`, `public/crm/js/output/report-package.js` |
| **D12** | Make the route return a real PDF: `import { renderSimplePitchPdf } from '@/lib/pdf/pitch-packet-simple'`, return `application/pdf` + `Content-Disposition: attachment`. Or rename the route to `/pitch` and the button to "Open Pitch Packet". | `app/api/crm/sales/prospects/[id]/pdf/route.ts` |
| **D13** | Swap the HTML-table hack for `exceljs` behind a `POST /api/crm/reports/xlsx`, or rename the download to `.html`. | `public/crm/js/output/reports.js:2333-2369` |
| **D14** | Ship `app/reports/view/page.tsx` (public, IDX-compliant, disclaimer-bearing) or remove the Shareable Link tile. Use `window.location.origin`, not a hardcoded host. | `public/crm/js/output/reports.js:2372-2391` + new `app/reports/view/` |
| **D15** | When `isEmailConfigured()` is false, refuse: render an error into `renderReportErrors` **before** `closeReportsModal()`, never a green check. | `public/crm/js/output/reports.js:1965-1969`, `:3038` |

Every markup change must be followed by `npm run crm:build`; `tests/runtime/crm-build-drift.test.ts` fails otherwise.

---

## 3. FAILING TEST DESIGN

Harness precedent to copy: `tests/runtime/crm-search-status-modes.test.ts:141-171` (loads a partial into jsdom, lifts the shipped function by brace-matching, `win.eval`s it, then asserts on rendered DOM) and `tests/runtime/crm-form-dom-roundtrip.test.ts:38-90` (prisma/auth mocks + real route handlers). New tests belong in `tests/runtime/` and run under `npm run test:runtime`.

**T1 — `comparables-buttons-are-connected.test.ts` (D1, D2, D3)**
*Drives:* real DOM clicks. Load `public/crm/html/search-form-and-results.html` into jsdom (`runScripts:'dangerously'`), `win.eval` the comp block of `search-engine.js` and the `openReportsModal` block of `reports.js`, plus `public/crm/html/modals/reports.html` appended to the body.
*Interaction:* for **every** `#comparablesSection button`, `el.click()` (a real bubbling `MouseEvent`).
*Asserts on the result:* each click must produce an observable state change — the "Generate Report" clicks must leave `#reportsModal` without the `hidden` class and `reportState.selectedListingIds.length > 0`; "Clear Criteria" must leave every `#comparablesSection select` at `''` after seeding them; "Save Comp Criteria" must have written a `comps` payload the test reads back; "Load Comp Criteria" must repopulate `#compGeneralMinPrice` from that payload. A button that yields no change and is not `disabled === true` fails by line number.
*Fails today:* seven buttons produce no change and are enabled. Passes after D1/D2 (or after the disable fallback, which the assertion also accepts).
*Not sufficient alone:* pair with T2 — a wired button that queries the wrong thing still passes T1.

**T2 — `comps-query-is-executable.test.ts` (D4, D5)**
*Drives:* the shipped `showCompResults()` **and** the shipped `MallanAPI.idx.search()` serializer, together. `win.eval` the `idx` object out of `public/crm/js/core/api-client.js` and stub only `window.fetch`, capturing the URL.
*Interaction:* set `#compPropertyAddress.value = '432 Park Avenue'`, click the Sales toggle, call `showCompResults('property')`.
*Asserts on the request params:* the captured URL must constrain the query to that subject — `expect(url).toMatch(/432\+?Park/)` — and, critically, the captured query string is then fed to the **real** `criteriaFromParams` from `@/lib/search/engine/criteria` with `expect(result.ok).toBe(true)`, proving the browser sends nothing the executor refuses. A second case asserts the closed-comp clause carries a `CloseDate` window by comparing against the real `compsStatusWindowFilter(['Closed'], 12, asOf)` from `@/lib/comps/fetch-comps`.
*Fails today:* the URL is `/api/idx/search?type=sale&status=Closed&limit=100` — no address, no `CloseDate`.

**T3 — `comps-result-status-label.test.ts` (D7)**
*Drives:* `showCompResults('property')` with `MallanAPI.idx.search` stubbed to resolve `{ listings: [{ id:'1', address:'X', status:'Closed', price:100 }] }`.
*Asserts on rendered text:* in sale mode `document.querySelector('#compPropertyResults table tbody tr td:nth-child(7)').textContent.trim() === 'Sold'`; in rental mode `=== 'Rented'`; and in both, `expect(html).not.toContain('CLOSED')`.
*Fails today:* renders `Closed`, and `CLOSED` when the field is absent.

**T4 — `report-output-pdf.test.ts` (D9)**
*Drives:* the shipped tile delegation (`reports.js:301`) and the shipped `generateReport()`.
*Interaction:* load `public/crm/html/modals/reports.html`, `win.eval` `reports.js`, seed `searchResultsState.filteredListings`, then `document.querySelector('[data-step="output"] .report-tile[data-value="pdf"]').click()` followed by `document.querySelector('button[onclick="generateReport()"]').click()`.
*Asserts on the result:* the captured `fetch` call went to the PDF route with `{ listingIds, format, version }`, and the response the code turns into a download has `type === 'application/pdf'`.
*Fails today:* the `[data-value="pdf"]` tile does not exist — `querySelector` returns `null` and the click throws.

**T5 — `crm-no-orphan-partials.test.ts` (D10, D11)** — **structural, and explicitly insufficient on its own.**
Parses `public/crm/index.html` for `@include` and `<script src=>`, then asserts every file under `public/crm/html/modals/` and `public/crm/js/output/` is either included or listed in an explicit `KNOWN_UNBUILT` allow-list with a reason. This is a build-graph test, **not a behavior test** — it proves nothing renders, only that nothing is silently unreachable. It must be paired with T1/T4, which execute the handlers.
*Fails today:* `client-delivery.html`, `client-report-view.html`, `add-edit-client.html`, `report-package.js`, `client-feedback.js` are unreferenced.

**T6 — `prospect-pdf-route-returns-pdf.test.ts` (D12)**
*Drives:* the **real route handler** — `import { GET } from '@/app/api/crm/sales/prospects/[id]/pdf/route'` with prisma/auth mocked exactly as `crm-form-dom-roundtrip.test.ts:38-90`, and `getAccessToken`/`fetch` stubbed so no live Cotality call occurs.
*Asserts on the response:* `res.headers.get('content-type')` starts with `application/pdf`, `content-disposition` contains `attachment`, and `Buffer.from(await res.arrayBuffer()).subarray(0,5).toString() === '%PDF-'`.
*Fails today:* returns `text/html; charset=utf-8` and a `<!DOCTYPE html>` body.

**T7 — `report-excel-is-xlsx.test.ts` (D13)**
*Drives:* the shipped `exportReportExcel()` in jsdom with `URL.createObjectURL` stubbed to capture the Blob and read its bytes.
*Asserts on the bytes:* first four bytes are `50 4B 03 04` (ZIP/OOXML).
*Fails today:* the Blob starts with `<html xmlns:o=`.

**T8 — `report-shareable-link-resolves.test.ts` (D14)**
*Drives:* the shipped `generateShareableLink()` with `navigator.clipboard.writeText` stubbed to capture the URL; the captured `config` is then passed to the default export of `app/reports/view/page.tsx`.
*Asserts on the render:* the page output contains the seeded listing count and the IDX disclaimer; and `new URL(captured).origin === 'http://localhost'` (same-origin, not hardcoded prod).
*Fails today:* `app/reports/view/page.tsx` does not exist — the import throws.

**T9 — `report-email-never-fakes-success.test.ts` (D15)**
*Drives:* the shipped `sendEmailDirect()` with `isEmailConfigured` returning `false`.
*Asserts on rendered text and audit:* `#emailSendingMsg.textContent` must not match `/sent|delivered/i` and must name the unconfigured state; `logAuditEntry` must not have been called with a delivered outcome.
*Fails today:* renders "Email sent (simulated)" in green.

---

## 4. FILE OWNERSHIP

**Source (edit):**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/html/search-form-and-results.html` — D1, D2, D6, D8
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/search/search-engine.js` — D1, D2, D4, D5, D6, D7, D8
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/core/api-client.js` — D4 (serializer + JSDoc:718)
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/output/reports.js` — D9, D13, D14, D15
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/html/modals/reports.html` — D9 (label + any new output tile)
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/html/modals/report-preview.html` — D9 (line 25 label)
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/search/search-actions.js` — D10 (`closeDeliveryModal` lines 58-61)
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/init/init-disable-dead-controls.js` — D3 (only if taking the disable fallback)
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/index.html` — D11 (script list)
- `C:/Users/MayaAllan/Desktop/mallan-nyc/app/api/crm/sales/prospects/[id]/pdf/route.ts` — D12
- `C:/Users/MayaAllan/Desktop/mallan-nyc/lib/pdf/pitch-packet-simple.ts` — D12 (becomes reachable)

**Delete (needs Maya — source-of-truth charter):**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/html/modals/client-delivery.html`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/output/report-package.js` (or wire it)
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/output/client-feedback.js` (or wire it)

**New (if real PDF is approved):**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/app/api/crm/reports/pdf/route.ts`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/lib/pdf/report-renderer.ts`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/app/reports/view/page.tsx` (D14)

**Generated (never hand-edit; regenerate with `npm run crm:build`):**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/index-built.html`

**Tests (new):** `tests/runtime/comparables-buttons-are-connected.test.ts`, `comps-query-is-executable.test.ts`, `comps-result-status-label.test.ts`, `report-output-pdf.test.ts`, `crm-no-orphan-partials.test.ts`, `prospect-pdf-route-returns-pdf.test.ts`, `report-excel-is-xlsx.test.ts`, `report-shareable-link-resolves.test.ts`, `report-email-never-fakes-success.test.ts`

**Touched by policy, not by edit:** `public/crm/js/compliance/compliance-gates-and-output.js:1793-1804` — B6 should also assert the comparables buttons are connected, otherwise it keeps certifying this surface green.

---

## 5. WHAT A REAL PDF WOULD COST — AND THE RECOMMENDATION

**What already exists (no new dependency needed):**
- `pdf-lib ^1.17.1` — installed, with a working precedent at `lib/pdf/pitch-packet-simple.ts:48` (`PDFDocument`, embedded Helvetica, hand-drawn pages).
- `@react-pdf/renderer ^4.3.2` — installed, currently unused.
- `exceljs ^4.4.0` — installed, currently unused.
- **No** puppeteer / playwright-core / @sparticuz/chromium. Only `@playwright/test` as a devDependency, which cannot ship to a Vercel function.

**Constraints that set the price:**
1. Every report body is built **in the browser** as an HTML string — `reports.js:475-1858` (`populateReportPreview`), ~1,400 lines across nine formats (grid, list, summary, detail, comparison, factSheet, cma, openHouse, images), plus the orphaned 1,050-line `report-package.js`. Neither `@react-pdf/renderer` nor `pdf-lib` consumes HTML.
2. Therefore HTML-fidelity PDF requires a headless browser → a **new runtime dependency + serverless infra change**, which is a CLAUDE.md §A.7 hold (env/deps) and adds cold-start and bundle-size cost.
3. A server-rendered PDF is a **new advertising surface** → CLAUDE.md §D applies: broker attribution, IDX disclaimer, Fair Housing scan, agent-vs-customer field gating (`csvExcelAllowlistCustomer`, `agentOnlyFields`) must be re-implemented server-side or the PDF ships without them. Today they exist only in `reports.js:685, 690, 719, 771, 2447`.
4. CSP is not a blocker either way: `lib/middleware/security-headers.ts:52-63` (`CRM_CSP`) already allows `cdnjs.cloudflare.com`/`jsdelivr` scripts, `blob:` images and `worker-src blob:`, so even a client-side jsPDF path would load. (Correct — the artifact allowlist is irrelevant here.)

**Option A — full-fidelity PDF.** Port all nine formats into a server renderer + new route + compliance blocks + tests. Roughly a 1:1 re-implementation of ~1,400 lines, and it permanently forks the report layout into two codebases that will drift. **High cost, high ongoing maintenance.** Not worth it for a workflow whose Print path already yields a good-looking page.

**Option A′ — tabular PDF with zero new dependencies (the pragmatic middle).** A `POST /api/crm/reports/pdf` route that re-resolves listings server-side (never trusts client HTML), reuses the exact `getSelectedReportFields()` allowlist and customer/agent gating the CSV path uses, and draws a branded table with `pdf-lib` — copying the header/footer pattern already proven in `lib/pdf/pitch-packet-simple.ts`. Roughly **one route (~120 lines) + one `lib/pdf/report-renderer.ts` (~250 lines) + one output tile + one `generateReport()` case + an audit event + T4/T6-shaped tests.** Covers grid/list/summary/comparison/cma honestly; photo-heavy formats stay on Print. No new dependency, no infra change, one new API route (still needs Maya's approval under §A.7).

**Option B — rename and delete.** Change `report-preview.html:25` to "Print / Save as PDF" and `reports.html:181` likewise; delete `client-delivery.html`; wire or disable the seven comparables buttons; fix the `/pdf` route's name or its content type. **Cost: ~1 hour plus `npm run crm:build` and the T1/T5 tests.**

**Recommendation: do B now, then A′ as a separate approved PR.**

B is the only option that discharges the standing owner directive quoted in `init-disable-dead-controls.js:13-17` this week — seven visibly enabled dead buttons and a mislabeled "Print/PDF" are the actual user-facing harm, and neither is fixed by adding a PDF. "Print / Save as PDF" is not a euphemism: `printReportViaIframe` already emits `@page{size:letter portrait}` and full print CSS (`reports.js:2894-2909`), so the browser's Save-as-PDF output is genuinely the report.

A′ then earns its keep, because **D4/D5 are the more serious finding on this surface**: the Subject Property comp search demands an address, throws it away, and presents an unfiltered feed-wide `status=Closed` result as "Comps for Sale" — with no `CloseDate` window and a `CLOSED` badge that violates the transaction-aware label rule. A PDF of that output would only make a wrong comp set look more official. **Fix the comp query before adding any new way to export it.**