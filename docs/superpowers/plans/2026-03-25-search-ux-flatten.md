# Search UX Flatten — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flatten the CRM search from 5 navigation layers to 2, fix 8 critical data-mapping bugs, wire 40+ rental stub fields, deduplicate 3 forms into 1, add sticky search bar, and fix accessibility gaps.

**Architecture:** One shared search form controlled by `data-show-on` attributes for tab-based visibility. A `getFormEl()` alias layer preserves saved search compatibility with old element IDs. The generic checkbox scanner is extended to handle `<select>` and radio groups. All changes target the monolithic `index-built.html` and its modular source files.

**Tech Stack:** Vanilla JS (no framework), Tailwind CSS (browser CDN), Trestle OData API, existing search-engine.js architecture.

**Spec:** `docs/superpowers/specs/2026-03-25-search-ux-flatten-design.txt`

---

## File Map

| File | Role | Action |
|---|---|---|
| `public/crm/js/search/search-engine.js` | Search criteria collection, filtering, tab/mode switching | HEAVY MODIFY — rewrite `collectSearchCriteria()`, `clearSearchForm()`, extend scanner |
| `public/crm/html/search-form-and-results.html` | Search form HTML (source for index-built) | HEAVY MODIFY — deduplicate forms, add `data-show-on`, add IDs, sticky bar |
| `public/crm/html/nav.html` | Header navigation | MODIFY — restructure to flat nav |
| `public/crm/index-built.html` | Built monolith (36K lines) | REBUILD from source modules after all changes |
| `lib/idx/trestle-mapper.ts` | Central Trestle→CRM field mapper | MODIFY — fix C2/C3 mappings |
| `data/SEARCH_CONTROL_MAP.json` | Search field→Trestle mapping registry | MODIFY — fix C4-C7 enum values |
| `public/crm/js/search/saved-searches.js` | Saved search save/load | MODIFY — add `getFormEl()` alias, `checkboxFilters` serialization |
| `scripts/smoke-test-crm.js` | CRM smoke test | MODIFY — extend with search assertions |

---

## Reviewer Findings Applied

- C1 (PropertySubType cb.value) and C8 (FUTURE/INCOMPLETE status) are **ALREADY FIXED** in current code — Tasks 1 and 4 changed to VERIFY ONLY
- Building-prefixed IDs (`buildingQuickRls`, etc.) added to legacy ID map (7 entries)
- Advanced-mode price resolution fixed to use `currentSearchTab` branching
- Task 6 split into 3 sub-tasks (6a: data-show-on + alias, 6b: HTML dedup, 6c: function rewrites)
- `_setSelectValue()` in saved-searches.js must also use `getFormEl()`
- `clearSearchForm()` rewrite preserves full custom-select-restore logic
- `updateFilterCount()` checks visible container, not first-found
- Nav-tab active state uses direct map, not string concatenation
- Task 8 dependency on Task 6 noted
- Spec Section J (advanced wiring items 1,3,4,5) and Section L (partial fixes) noted as OUT OF SCOPE for this plan — future work

---

## Phase 1: Critical Bug Fixes (C1–C8)

### Task 1: VERIFY PropertySubType checkbox values (C1) — ALREADY FIXED

**Files:**
- Modify: `public/crm/js/search/search-engine.js` — generic checkbox scanner (~line 870)
- Modify: `public/crm/index-built.html` — same function (inline copy)

- [ ] **Step 1: Verify the scanner already uses data-value**

The generic scanner at `search-engine.js` ~line 1064 already uses `cb.getAttribute('data-value') || cb.value`. Verify this is present:
```bash
grep -n "data-value.*cb.value\|getAttribute.*data-value" public/crm/js/search/search-engine.js
```

- [ ] **Step 2: Verify PropertySubType checkboxes have data-value attributes**

```bash
grep -n "data-field=\"PropertySubType\"" public/crm/html/search-form-and-results.html | head -10
```

Confirm all have `data-value` set to canonical Trestle values.

- [ ] **Step 3: Verify in browser**

Select Townhouse + Co-op → Network tab → confirm payload has canonical values (not "on"). If passing, no changes needed.

### Task 2: Fix CloseDate and ContractDate mapping (C2/C3)

**Files:**
- Modify: `lib/idx/trestle-mapper.ts` — central mapper
- Modify: `public/crm/js/search/search-engine.js` — filterListings() field access

- [ ] **Step 1: Check current CloseDate mapping in trestle-mapper.ts**

```bash
grep -n "CloseDate\|closeDate\|close_date\|closedDate" lib/idx/trestle-mapper.ts
```

The mapper already references `CloseDate` at lines 80, 460, 761. Verify it outputs to the CRM flat shape that search-engine.js expects.

- [ ] **Step 2: Check what field name search-engine.js uses for close date**

```bash
grep -n "closedDate\|closeDate\|close_date" public/crm/js/search/search-engine.js
```

- [ ] **Step 3: Ensure the CRM flat shape includes both fields**

In `trestle-mapper.ts`, find the `normalizeToFlat()` or equivalent function. Verify:
```typescript
closedDate: normalized.CloseDate || null,     // for Gate 6
contractDate: normalized.ListingContractDate || null,  // for contract date filter
```

If missing, add these mappings.

- [ ] **Step 4: Ensure filterListings() uses the correct field names**

In `search-engine.js`, find the contract date filter and close date filter. Ensure they reference the same field names output by the mapper.

- [ ] **Step 5: Test**

- Contract date filter: set date range → verify results filtered to listings with contract dates in range
- Gate 6: verify closed listing >24h does not appear in portal/search results

- [ ] **Step 6: Commit**

```bash
git add lib/idx/trestle-mapper.ts public/crm/js/search/search-engine.js
git commit -m "fix(search): C2/C3 — map CloseDate and ListingContractDate to CRM flat shape"
```

### Task 3: Fix enum mismatches in SEARCH_CONTROL_MAP (C4–C7)

**Files:**
- Modify: `data/SEARCH_CONTROL_MAP.json`
- Modify: `public/crm/html/search-form-and-results.html` — checkbox data-value attributes

- [ ] **Step 1: Cross-reference Concessions enum values (C4)**

```bash
grep -n "Concessions" data/SEARCH_CONTROL_MAP.json
grep -n "data-field=\"Concessions\"" public/crm/html/search-form-and-results.html
```

Check against `artifacts/metadata.xml` for canonical Trestle enum values. Replace `OwnerPays`/`FreeRent` with correct values.

- [ ] **Step 2: Fix CrossListing field (C5)**

`CrossListing` does not exist on Trestle. Options:
- Replace with `AlsoListedForRent` / `AlsoListedForSale` if Trestle has them
- Or implement as derived filter: check if same address exists in both sale and rental listings

```bash
grep -n "CrossListing\|AlsoFor" artifacts/metadata.xml | head -10
```

Update `data-field` attributes in the HTML and `SEARCH_CONTROL_MAP.json`.

- [ ] **Step 3: Fix Townhouse subtype (C6)**

```bash
grep -n "Townhouse\|SingleFamilyTownhouse\|MultiFamilyTownhouse" data/SEARCH_CONTROL_MAP.json
```

Normalize to the canonical Trestle value. Update `data-value` attributes on checkboxes.

- [ ] **Step 4: Fix Conversion → TwilightConversion (C7)**

```bash
grep -n "Conversion\|TwilightConversion" data/SEARCH_CONTROL_MAP.json
grep -n "data-value=\"Conversion\"" public/crm/html/search-form-and-results.html
```

Replace with canonical Trestle name.

- [ ] **Step 5: Apply all HTML changes to index-built.html too**

After fixing the source HTML, sync to `index-built.html`.

- [ ] **Step 6: Test each fix**

For each enum fix: select the filter → check Network tab → verify OData query uses correct enum value → results match.

- [ ] **Step 7: Commit**

```bash
git add data/SEARCH_CONTROL_MAP.json public/crm/html/search-form-and-results.html public/crm/index-built.html
git commit -m "fix(search): C4-C7 — fix enum mismatches against Trestle canonical values"
```

### Task 4: VERIFY FUTURE/INCOMPLETE status mapping (C8) — ALREADY FIXED

**Files:**
- Verify: `public/crm/js/search/search-engine.js` — statusMap (~line 283)

- [ ] **Step 1: Verify FUTURE and INCOMPLETE already in statusMap**

```bash
grep -n "FUTURE\|INCOMPLETE\|Incomplete" public/crm/js/search/search-engine.js | head -5
```

Should find `'FUTURE': 'Incomplete', 'INCOMPLETE': 'Incomplete'` at ~line 283. If present, no changes needed.

- [ ] **Step 2: Verify in browser**

Pick FUTURE status → search → confirm results returned.

---

## Phase 2: Navigation Restructure

### Task 5: Restructure header navigation

**Files:**
- Modify: `public/crm/html/nav.html`
- Modify: `public/crm/index-built.html` — nav section (~lines 3243–3272)

- [ ] **Step 1: Replace the 2-button header with flat nav**

In `nav.html` and `index-built.html` (~line 3243), replace the current header:

```html
<!-- OLD: Search | Manage -->
<nav class="flex gap-1.5 sm:gap-2 mx-3">
    <button onclick="showSearchSection('main')" id="searchNav-main" ...>Search</button>
    <button onclick="showSearchSection('manage')" id="searchNav-manage" ...>Manage</button>
</nav>
```

With:

```html
<!-- NEW: Sales | Rentals | Buildings | CMA | ... | Manage -->
<nav class="flex gap-1 overflow-x-auto scroll-snap-x mx-3 flex-1 justify-center">
    <button onclick="toggleSearchTab('sale')" id="navSales"
        class="nav-tab px-3 sm:px-4 py-2 text-sm font-semibold rounded-lg bg-white/15 text-white flex-shrink-0">
        <i class="fas fa-home text-xs mr-1 hidden sm:inline"></i>Sales
    </button>
    <button onclick="toggleSearchTab('rent')" id="navRentals"
        class="nav-tab px-3 sm:px-4 py-2 text-sm font-semibold rounded-lg text-gray-300 hover:text-white hover:bg-white/10 flex-shrink-0">
        <i class="fas fa-building text-xs mr-1 hidden sm:inline"></i>Rentals
    </button>
    <button onclick="toggleSearchTab('building')" id="navBuildings"
        class="nav-tab px-3 sm:px-4 py-2 text-sm font-semibold rounded-lg text-gray-300 hover:text-white hover:bg-white/10 flex-shrink-0">
        <i class="fas fa-city text-xs mr-1 hidden sm:inline"></i>Buildings
    </button>
    <button onclick="toggleSearchTab('cma')" id="navCMA"
        class="nav-tab px-3 sm:px-4 py-2 text-sm font-semibold rounded-lg text-gray-300 hover:text-white hover:bg-white/10 flex-shrink-0">
        <i class="fas fa-chart-bar text-xs mr-1 hidden sm:inline"></i>CMA
    </button>
</nav>
<div class="flex items-center gap-2 flex-shrink-0">
    <button onclick="showSearchSection('manage')" id="navManage"
        class="px-3 py-2 text-sm font-semibold rounded-lg text-gray-300 hover:text-white hover:bg-white/10">
        <i class="fas fa-briefcase text-xs mr-1"></i><span class="hidden sm:inline">Manage</span>
    </button>
    <div id="agentBadge" class="hidden sm:flex items-center gap-2 text-xs">...</div>
</div>
```

- [ ] **Step 2: Remove the General Search / Comparable Reports tab row**

Delete or hide `#searchTypeTabs` (lines 3316–3327 in index-built.html). CMA is now in the header.

- [ ] **Step 3: Remove the nested Sales/Rentals/Buildings buttons**

Delete the old `#btnSale`, `#btnRent`, `#btnBuilding` buttons inside the search card (lines 3334–3337). These are now in the header.

- [ ] **Step 4: Move Basic/Advanced toggle up**

Move the mode toggle from inside the nested card to directly below the header or at the top of the search form container. Keep the `#btnSearchBasic` / `#btnSearchAdvanced` IDs.

- [ ] **Step 5: Add nav-tab active state CSS**

Add to inline styles:
```css
.nav-tab.active { background: rgba(255,255,255,0.15); color: #fff; }
.nav-tab:not(.active) { color: #9ca3af; }
.nav-tab:not(.active):hover { color: #fff; background: rgba(255,255,255,0.1); }
```

- [ ] **Step 6: Update toggleSearchTab() to manage header nav active states**

In `search-engine.js` line 2079, add (uses direct map — no fragile string concat):
```javascript
// Update header nav active states
var _tabToNavId = { sale: 'navSales', rent: 'navRentals', building: 'navBuildings', cma: 'navCMA' };
document.querySelectorAll('.nav-tab').forEach(function(btn) {
    btn.classList.toggle('active', btn.id === _tabToNavId[tab]);
});
```

- [ ] **Step 7: Add CMA placeholder routing**

In `toggleSearchTab()`, add before the existing tab logic:
```javascript
if (tab === 'cma') {
    document.getElementById('searchFormContainer').style.display = 'none';
    document.getElementById('searchResultsSection').style.display = 'none';
    var cmaEl = document.getElementById('cmaSection');
    if (cmaEl) cmaEl.style.display = '';
    sessionStorage.setItem('searchTab', tab);
    // Update nav
    document.querySelectorAll('.nav-tab').forEach(function(b) { b.classList.remove('active'); });
    document.getElementById('navCMA').classList.add('active');
    return;
}
// For non-CMA tabs, show search form, hide CMA
document.getElementById('searchFormContainer').style.display = '';
var cmaEl = document.getElementById('cmaSection');
if (cmaEl) cmaEl.style.display = 'none';
```

- [ ] **Step 8: Add CMA placeholder HTML**

After the search form container, add:
```html
<div id="cmaSection" style="display:none" class="p-6">
    <div class="bg-white rounded-xl shadow-sm border p-12 text-center">
        <i class="fas fa-chart-bar text-5xl text-gray-300 mb-4"></i>
        <h2 class="text-xl font-bold text-gray-700 mb-2">Comparative Market Analysis</h2>
        <p class="text-gray-500 text-sm">CMA search and report generation — coming soon.</p>
        <p class="text-gray-400 text-xs mt-2">This will include comp search by area/building, summary cards, segment analysis, and appraisal-grade reports.</p>
    </div>
</div>
```

- [ ] **Step 9: Remove toggleSearchType() function**

In `search-engine.js` (line 2393), comment out or remove `toggleSearchType()`. All references in HTML should already be gone since we removed `#searchTypeTabs`.

- [ ] **Step 10: Test navigation**

- Click Sales → search form shows sale fields
- Click Rentals → rental fields appear, sale-only hide
- Click Buildings → building fields show
- Click CMA → placeholder shows, form hides
- Click back to Sales → form returns
- Click Manage → manage panel shows
- Refresh page → tab state restores from sessionStorage

- [ ] **Step 11: Commit**

```bash
git add public/crm/html/nav.html public/crm/js/search/search-engine.js public/crm/index-built.html public/crm/html/search-form-and-results.html
git commit -m "feat(search): flatten nav — Sales/Rentals/Buildings/CMA in header, remove nested tabs"
```

---

### Task 6: Deduplicate 3 basic forms into 1

**Files:**
- Modify: `public/crm/html/search-form-and-results.html` — merge forms
- Modify: `public/crm/index-built.html` — same
- Modify: `public/crm/js/search/search-engine.js` — `collectSearchCriteria()`, `clearSearchForm()`

- [ ] **Step 1: Add `data-show-on` attributes to existing shared sections**

In the sale basic form (`#searchBasicMode`), wrap each section with `data-show-on`:
- Location section: `data-show-on="sale,rent,building"`
- Price/Beds/Baths: `data-show-on="sale,rent"`
- Status: `data-show-on="sale,rent,building"`
- Building details: `data-show-on="sale,rent,building"`
- Keyword: `data-show-on="sale,rent,building"`

- [ ] **Step 2: Merge rental-only sections into the shared form**

Move rental-specific sections from `#searchBasicModeRental` into `#searchBasicMode` with `data-show-on="rent"`:
- Furnished Options
- Lease Details
- Concessions
- Lease Availability

- [ ] **Step 3: Merge building-only sections**

Move building-specific sections from `#searchBasicModeBuilding` into shared form with `data-show-on="building"`.

- [ ] **Step 4: Unify element IDs**

Rename tab-prefixed IDs to unified IDs per the mapping table in the spec:
- `saleMinPrice` / `rentalMinRent` → `searchMinPrice`
- `saleMaxPrice` / `rentalMaxRent` → `searchMaxPrice`
- (all 17 fields per spec table)

- [ ] **Step 5: Add dynamic price label**

```html
<p id="priceSectionLabel" class="text-xs font-semibold text-gray-700 mb-2">Price</p>
```

The label text changes in `toggleSearchTab()`:
```javascript
var priceLabel = document.getElementById('priceSectionLabel');
if (priceLabel) priceLabel.textContent = tab === 'rent' ? 'Monthly Rent' : 'Price';
```

- [ ] **Step 6: Implement data-show-on toggle in toggleSearchTab()**

Replace the old imperative show/hide logic (lines 2079–2260 in search-engine.js) with:
```javascript
// data-show-on visibility
document.querySelectorAll('[data-show-on]').forEach(function(el) {
    var tabs = el.dataset.showOn.split(',');
    el.style.display = tabs.indexOf(tab) > -1 ? '' : 'none';
});
```

- [ ] **Step 7: Delete the old duplicate forms**

Remove `#searchBasicModeRental` and `#searchBasicModeBuilding` HTML blocks entirely.

- [ ] **Step 8: Add getFormEl() alias layer**

At the top of search-engine.js, add. **NOTE:** Includes building-prefixed IDs (7 entries) — not just sale/rental.
```javascript
var _legacyIdMap = {
    // Sale → unified
    'saleMinPrice': 'searchMinPrice', 'saleMaxPrice': 'searchMaxPrice',
    'saleMinBeds': 'searchMinBeds', 'saleMaxBeds': 'searchMaxBeds',
    'saleMinBaths': 'searchMinBaths', 'saleMaxBaths': 'searchMaxBaths',
    'saleMinRooms': 'searchMinRooms', 'saleMaxRooms': 'searchMaxRooms',
    'saleMinSqft': 'searchMinSqft', 'saleMaxSqft': 'searchMaxSqft',
    'saleQuickRls': 'searchQuickRls', 'saleQuickZip': 'searchQuickZip',
    'saleQuickUnit': 'searchQuickUnit', 'saleSearchAddress': 'searchAddress',
    'saleNeighborhoodInput': 'searchNeighborhoodInput',
    'saleKeywordSearch': 'searchKeyword', 'saleManagementCompany': 'searchManagementCompany',
    // Rental → unified
    'rentalMinRent': 'searchMinPrice', 'rentalMaxRent': 'searchMaxPrice',
    'rentalMinBeds': 'searchMinBeds', 'rentalMaxBeds': 'searchMaxBeds',
    'rentalMinBaths': 'searchMinBaths', 'rentalMaxBaths': 'searchMaxBaths',
    'rentalMinRooms': 'searchMinRooms', 'rentalMaxRooms': 'searchMaxRooms',
    'rentalMinSqft': 'searchMinSqft', 'rentalMaxSqft': 'searchMaxSqft',
    'rentalQuickRls': 'searchQuickRls', 'rentalQuickZip': 'searchQuickZip',
    'rentalQuickUnit': 'searchQuickUnit', 'rentalSearchAddress': 'searchAddress',
    'rentalNeighborhoodInput': 'searchNeighborhoodInput',
    'rentalKeywordSearch': 'searchKeyword', 'rentalManagementCompany': 'searchManagementCompany',
    // Building → unified (BLOCKER FIX: was missing)
    'buildingQuickRls': 'searchQuickRls', 'buildingQuickZip': 'searchQuickZip',
    'buildingQuickUnit': 'searchQuickUnit', 'buildingSearchAddress': 'searchAddress',
    'buildingNeighborhoodInput': 'searchNeighborhoodInput',
    'buildingKeywordSearch': 'searchKeyword', 'buildingManagementCompany': 'searchManagementCompany'
};

function getFormEl(id) {
    return document.getElementById(id) || document.getElementById(_legacyIdMap[id] || '');
}
```

- [ ] **Step 9: Rewrite collectSearchCriteria() to single-path**

Replace the 4-branch-per-field logic with 2-branch (basic vs advanced) using `getFormEl()`.
**CRITICAL:** Advanced mode MUST still branch on `currentSearchTab` for price (sale uses `advSaleMinPrice`, rental uses `advRentalMinRent`). Do NOT use `||` fallback — that would silently use the wrong field.

```javascript
function collectSearchCriteria() {
    var c = {};
    c.searchTab = currentSearchTab;
    var _advMode = document.getElementById('searchAdvancedMode');
    var _isAdvanced = _advMode && _advMode.style.display !== 'none' && !_advMode.classList.contains('hidden');

    // Price — 2 branches (basic unified, advanced tab-aware)
    var priceMinEl, priceMaxEl;
    if (_isAdvanced) {
        // Advanced mode: MUST use tab-specific IDs (sale vs rental have different fields)
        priceMinEl = currentSearchTab === 'rent' ? getFormEl('advRentalMinRent') : getFormEl('advSaleMinPrice');
        priceMaxEl = currentSearchTab === 'rent' ? getFormEl('advRentalMaxRent') : getFormEl('advSaleMaxPrice');
    } else {
        // Basic mode: unified IDs
        priceMinEl = getFormEl('searchMinPrice');
        priceMaxEl = getFormEl('searchMaxPrice');
    }
    // ... (same tab-aware pattern for all fields that differ between sale/rental in advanced mode)
    // For fields with SAME IDs in advanced mode (beds, baths, rooms, sqft), no branching needed:
    // var bedsMinEl = _isAdvanced ? getFormEl('adv-min-beds') : getFormEl('searchMinBeds');
```

Keep the generic checkbox scanner unchanged at the bottom.

- [ ] **Step 10: Rewrite clearSearchForm()**

Replace the 3-form iteration with:
```javascript
function clearSearchForm() {
    ['searchBasicMode', 'searchAdvancedMode'].forEach(function(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        // Restore replaced selects
        container.querySelectorAll('input[data-was-select="true"]').forEach(function(inp) { /* existing restore logic */ });
        container.querySelectorAll('select').forEach(function(sel) { sel.selectedIndex = 0; });
        container.querySelectorAll('input[type="checkbox"]').forEach(function(cb) { cb.checked = false; });
        container.querySelectorAll('input[type="radio"]').forEach(function(r) { r.checked = false; });
        container.querySelectorAll('input[type="text"], input[type="number"], input[type="date"]').forEach(function(inp) { inp.value = ''; });
    });
    // Re-check Active status everywhere
    document.querySelectorAll('[data-field="MlsStatus"][data-value="Active"]').forEach(function(el) { el.checked = true; });
    if (typeof clearAllNeighborhoods === 'function') clearAllNeighborhoods();
    if (typeof updateFilterCount === 'function') updateFilterCount();
}
```

- [ ] **Step 11: Sync changes to index-built.html**

Copy modified functions to the inline JS in index-built.html.

- [ ] **Step 12: Test deduplication**

- Sales tab: price/beds/baths/status all work
- Switch to Rentals: same fields work, rent label shows, rental-only sections appear
- Switch to Buildings: unit fields hide, building fields show
- Old saved search loads correctly (test with a saved search that uses old IDs)
- Clear form: all fields reset, Active re-checked

- [ ] **Step 13: Commit**

```bash
git add public/crm/html/search-form-and-results.html public/crm/js/search/search-engine.js public/crm/index-built.html
git commit -m "feat(search): deduplicate 3 basic forms into 1 shared form with data-show-on"
```

---

### Task 7: Add sticky search bar

**Files:**
- Modify: `public/crm/html/search-form-and-results.html`
- Modify: `public/crm/index-built.html`
- Modify: `public/crm/js/search/search-engine.js` — add `updateFilterCount()`

- [ ] **Step 1: Add sticky bar HTML**

Before the closing `</div>` of `#section-main`, add:
```html
<div id="stickySearchBar" class="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t shadow-lg px-4 py-3 flex items-center justify-between">
    <div class="flex items-center gap-3">
        <span id="activeFilterCount" class="text-sm text-gray-500">No filters</span>
        <button onclick="clearSearchForm()" class="text-xs text-red-500 hover:text-red-700 font-medium">
            <i class="fas fa-times mr-1"></i>Clear
        </button>
    </div>
    <div class="hidden sm:flex items-center gap-3">
        <button onclick="openSaveSearchModal()" class="text-xs text-gray-400 hover:text-blue-600 font-medium">
            <i class="fas fa-bookmark mr-1"></i>Save Search
        </button>
    </div>
    <button onclick="executeSearch()" class="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 shadow-md">
        <i class="fas fa-search mr-1.5"></i>Search
    </button>
</div>
```

- [ ] **Step 2: Remove old per-form search buttons**

Delete the Search buttons at the bottom of each form section (they're now redundant with the sticky bar).

- [ ] **Step 3: Add padding-bottom to form container**

Add `pb-20` (80px) to the search form container so the sticky bar doesn't overlap the last field.

- [ ] **Step 4: Write updateFilterCount() function**

```javascript
function updateFilterCount() {
    var count = 0;
    // Check the VISIBLE container — advanced first (if visible), else basic
    var advForm = document.getElementById('searchAdvancedMode');
    var form = (advForm && advForm.style.display !== 'none' && !advForm.classList.contains('hidden'))
        ? advForm : document.getElementById('searchBasicMode');
    if (!form) return;
    // Count non-default inputs
    form.querySelectorAll('select').forEach(function(s) { if (s.selectedIndex > 0) count++; });
    form.querySelectorAll('input[type="text"], input[type="number"]').forEach(function(i) { if (i.value.trim()) count++; });
    form.querySelectorAll('input[type="checkbox"]:checked').forEach(function(cb) {
        // Don't count default "Active" status
        if (cb.getAttribute('data-field') === 'MlsStatus' && cb.getAttribute('data-value') === 'Active') return;
        count++;
    });
    var el = document.getElementById('activeFilterCount');
    if (el) el.textContent = count === 0 ? 'No filters' : count + ' filter' + (count > 1 ? 's' : '') + ' applied';
}
```

- [ ] **Step 5: Wire updateFilterCount to form changes**

Add event listeners:
```javascript
document.addEventListener('change', function(e) {
    if (e.target.closest('#searchBasicMode, #searchAdvancedMode')) updateFilterCount();
});
document.addEventListener('input', function(e) {
    if (e.target.closest('#searchBasicMode, #searchAdvancedMode') && (e.target.type === 'text' || e.target.type === 'number')) {
        clearTimeout(window._filterCountDebounce);
        window._filterCountDebounce = setTimeout(updateFilterCount, 300);
    }
});
```

- [ ] **Step 6: Hide sticky bar when results are shown and form is not visible**

Show/hide logic: sticky bar visible when `#section-main` is visible, hidden when `#section-manage` is shown.

- [ ] **Step 7: Test**

- Filter count updates as you select filters
- Clear resets everything and count goes to "No filters"
- Search button triggers search
- Save Search button opens modal
- Bar stays visible on scroll
- No duplicate search buttons visible

- [ ] **Step 8: Commit**

```bash
git add public/crm/html/search-form-and-results.html public/crm/js/search/search-engine.js public/crm/index-built.html
git commit -m "feat(search): add sticky search bar with filter count"
```

---

## Phase 2b: Wire Rental Fields + Scanner Extension

### Task 8: Wire rental stub fields with data-field attributes

**DEPENDENCY:** Task 6 must be completed first — rental sections will have moved from `#searchBasicModeRental` into unified `#searchBasicMode`.

**Files:**
- Modify: `public/crm/html/search-form-and-results.html`
- Modify: `public/crm/index-built.html`

- [ ] **Step 1: Add data-field to Furnished Options checkboxes**

Find `#furnishedOptionsSection` and add `data-field="Furnished"` + appropriate `data-value` to each checkbox.

- [ ] **Step 2: Add data-field to Lease Type checkboxes**

Find lease type checkboxes and add `data-field="AvailableLeaseType"` with correct data-values.

- [ ] **Step 3: Add data-field to Lease Terms checkboxes**

Add `data-field="LeaseTerm"` with values: `ShortTerm`, `Summer`, `MonthToMonth`, `OneYear`, `TwoPlusYears`.

- [ ] **Step 4: Add data-field to Guarantor checkboxes**

Add `data-field="GuarantorRequired"` (local filter only — no Trestle field).

- [ ] **Step 5: Add data-field to Concessions checkboxes**

Add `data-field="Concessions"` with data-values matching Trestle canonical enum.

- [ ] **Step 6: Add data-field to Board Requirements checkboxes**

Add `data-field="BoardApprovalRequired"` (local filter only).

- [ ] **Step 7: Add data-field to Listing Type checkboxes**

Add `data-field="ListingAgreement"` where applicable. Note HTML comment says "IDX MAPPING: NONE" — these are local filters.

- [ ] **Step 8: Add IDs to Lease Availability selects**

Add `id="leaseAvailabilityType"` and `id="leaseAvailabilityDate"` to the select and date input.

- [ ] **Step 9: Sync to index-built.html**

- [ ] **Step 10: Test**

For each newly wired field: check checkbox → search → verify filter narrows results.

- [ ] **Step 11: Commit**

```bash
git add public/crm/html/search-form-and-results.html public/crm/index-built.html
git commit -m "feat(search): wire 40+ rental stub fields with data-field attributes"
```

### Task 9: Extend scanner for select and radio groups

**Files:**
- Modify: `public/crm/js/search/search-engine.js` — generic scanner
- Modify: `public/crm/index-built.html` — inline copy

- [ ] **Step 1: Extend the generic scanner to handle `<select>` elements**

After the checkbox scanner block, add:
```javascript
// Scan <select> elements with data-field
document.querySelectorAll('#searchBasicMode select[data-field], #searchAdvancedMode select[data-field]').forEach(function(sel) {
    if (sel.selectedIndex <= 0) return; // Skip default "Any" option
    var field = sel.getAttribute('data-field');
    var val = sel.value;
    if (field && val) {
        if (!c.checkboxFilters[field]) c.checkboxFilters[field] = [];
        c.checkboxFilters[field].push(val);
    }
});
```

- [ ] **Step 2: Extend the scanner to handle radio groups**

```javascript
// Scan radio groups with data-field
document.querySelectorAll('#searchBasicMode input[type="radio"][data-field]:checked, #searchAdvancedMode input[type="radio"][data-field]:checked').forEach(function(radio) {
    var field = radio.getAttribute('data-field');
    var val = radio.getAttribute('data-value') || radio.value;
    if (field && val) {
        if (!c.checkboxFilters[field]) c.checkboxFilters[field] = [];
        c.checkboxFilters[field].push(val);
    }
});
```

- [ ] **Step 3: Sync to index-built.html**

- [ ] **Step 4: Test**

Select a dropdown with `data-field` → verify it appears in collected criteria.

- [ ] **Step 5: Commit**

```bash
git add public/crm/js/search/search-engine.js public/crm/index-built.html
git commit -m "feat(search): extend scanner for select and radio group data-field elements"
```

---

## Phase 2c: Mobile + Saved Search Fixes

### Task 10: Mobile basic-only enforcement

**Files:**
- Modify: `public/crm/js/search/search-engine.js`
- Modify: `public/crm/index-built.html`

- [ ] **Step 1: Hide Advanced toggle on mobile**

Change `#btnSearchAdvanced` to: `class="... hidden md:inline-flex"`

- [ ] **Step 2: Add matchMedia resize handler**

```javascript
if (window.matchMedia) {
    var mobileQuery = window.matchMedia('(max-width: 767px)');
    function handleMobileChange(e) {
        if (e.matches && currentSearchMode === 'advanced') {
            toggleSearchMode('basic');
        }
    }
    mobileQuery.addEventListener('change', handleMobileChange);
}
```

- [ ] **Step 3: Simplify sticky bar on mobile**

Hide Save Search on mobile (already has `hidden sm:flex`). Ensure Clear and Search buttons are touch-friendly (min 44px height).

- [ ] **Step 4: Test on mobile viewport**

Resize to <768px → Advanced toggle hidden → form shows basic mode only → sticky bar works.

- [ ] **Step 5: Commit**

```bash
git add public/crm/js/search/search-engine.js public/crm/index-built.html
git commit -m "feat(search): enforce basic mode on mobile, hide Advanced toggle"
```

### Task 11: Update saved search serialization

**Files:**
- Modify: `public/crm/js/search/saved-searches.js`
- Modify: `public/crm/index-built.html` — inline copy

- [ ] **Step 1: Add checkboxFilters to saved search payload**

Find `_criteriaToApiFormat()` and add:
```javascript
if (criteria.checkboxFilters && Object.keys(criteria.checkboxFilters).length > 0) {
    payload.checkbox_filters = criteria.checkboxFilters;
}
```

- [ ] **Step 2: Add checkboxFilters restore in _criteriaToFormFields()**

When loading a saved search, restore checkbox states:
```javascript
if (saved.checkbox_filters) {
    Object.keys(saved.checkbox_filters).forEach(function(field) {
        var values = saved.checkbox_filters[field];
        values.forEach(function(val) {
            var cb = document.querySelector('[data-field="' + field + '"][data-value="' + val + '"]');
            if (cb) cb.checked = true;
        });
    });
}
```

- [ ] **Step 3: Use getFormEl() in _criteriaToFormFields() AND _setSelectValue()**

Replace all `document.getElementById()` calls with `getFormEl()` in BOTH functions.
**CRITICAL:** `_setSelectValue()` (saved-searches.js ~line 158) is a helper used by `_criteriaToFormFields()` that also calls `document.getElementById()` directly. It must also be updated or the alias layer won't work for saved search restores.

- [ ] **Step 4: Test**

Save a search with rental filters → reload → load saved search → verify rental checkboxes restored.

- [ ] **Step 5: Commit**

```bash
git add public/crm/js/search/saved-searches.js public/crm/index-built.html
git commit -m "feat(search): persist checkboxFilters in saved searches, add getFormEl alias"
```

---

## Phase 3: Accessibility + Testing

### Task 12: Add label associations and keyboard shortcuts

**Files:**
- Modify: `public/crm/html/search-form-and-results.html`
- Modify: `public/crm/index-built.html`

- [ ] **Step 1: Add `for` attributes to all labels missing them**

Scan for inputs without associated labels:
```bash
grep -c "type=\"text\"\|type=\"number\"\|type=\"date\"" public/crm/html/search-form-and-results.html
grep -c "<label for=" public/crm/html/search-form-and-results.html
```

Add `for="elementId"` to each label, or wrap the input inside the label.

- [ ] **Step 2: Add Enter-to-search shortcut**

```javascript
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.target.closest('textarea') && document.getElementById('section-main').style.display !== 'none') {
        e.preventDefault();
        executeSearch();
    }
});
```

- [ ] **Step 3: Sync to index-built.html**

- [ ] **Step 4: Commit**

```bash
git add public/crm/html/search-form-and-results.html public/crm/index-built.html public/crm/js/search/search-engine.js
git commit -m "fix(a11y): add label associations and Enter-to-search shortcut"
```

### Task 13: Extend smoke test

**Files:**
- Modify: `scripts/smoke-test-crm.js`

- [ ] **Step 1: Add assertion that every advanced field has id or data-field**

```javascript
// Section: Search field wiring
var advFields = dom.querySelectorAll('#searchAdvancedMode input, #searchAdvancedMode select');
var unwired = [];
advFields.forEach(function(f) {
    if (!f.id && !f.getAttribute('data-field') && f.type !== 'hidden') {
        unwired.push(f.outerHTML.substring(0, 80));
    }
});
if (unwired.length > 0) {
    results.push({ section: 'search-wiring', status: 'warning', message: unwired.length + ' advanced fields without id or data-field' });
}
```

- [ ] **Step 2: Add assertion for unified form IDs**

Verify that `searchMinPrice`, `searchMinBeds`, etc. exist in the DOM.

- [ ] **Step 3: Add assertion for sticky search bar**

Verify `#stickySearchBar` exists and has a Search button.

- [ ] **Step 4: Run smoke test**

```bash
npm run crm:test
```

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-test-crm.js
git commit -m "test(search): extend smoke test with form wiring and sticky bar assertions"
```

---

## Final: Rebuild index-built.html

### Task 14: Rebuild the monolith from source modules

Since `index-built.html` is a concatenation of the modular source files, after all changes are made to the source modules, rebuild the monolith.

- [ ] **Step 1: Verify all source module changes are complete**

```bash
git diff --stat HEAD
```

- [ ] **Step 2: Rebuild index-built.html**

If there's a build script, run it. Otherwise, manually copy the changed sections from the source modules into the monolith (the inline JS and HTML sections are marked with `// ═══ filename ═══` comments).

- [ ] **Step 3: Run full smoke test**

```bash
npm run crm:test
```

- [ ] **Step 4: Run IDX validator**

```bash
npm run idx:validate
```

- [ ] **Step 5: Manual test all 8 tab×mode combinations**

| Tab | Mode | Expected |
|---|---|---|
| Sales | Basic | Shared form, sale sections visible |
| Sales | Advanced | All sale + shared sections |
| Rentals | Basic | Shared form, rental sections visible |
| Rentals | Advanced | All rental + shared sections |
| Buildings | Basic | Building sections only |
| Buildings | Advanced | Building + shared sections |
| CMA | - | Placeholder panel |
| Manage | - | Manage panel |

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(search): complete UX flatten — nav restructure, form dedup, rental wiring, sticky bar, a11y"
```

---

## OUT OF SCOPE — Future Work

These items from the spec are consciously deferred to future plans:

**Spec Section J (Advanced Mode Wiring Gaps):**
- J.1: Add IDs/data-field to all remaining advanced inputs (partially covered by Task 8)
- J.3: Transit/Manhattan Grid — replace decorative spans with real form controls
- J.4: Keyword/Date inputs missing IDs — add IDs and DRP wrappers
- J.5: Comparables toolbar handlers — save/load comp criteria

**Spec Section L (Partial Fixes):**
- L.1: Pending status separation from ActiveUnderContract
- L.2: Open house date handling (setHours for inclusivity)
- L.3: Saved search server enhancements (store max_* and building fields)
- L.4: Dedupe criteriaToPrismaWhere() into one module
- L.5: Detail media photo cap UI fix

**Spec Section M (Cosmetic):**
- Remove console.trace() noise
- Fix photo badge overlap CSS
- Remove debug strip in production

These will be addressed in subsequent plans or as standalone fixes.
