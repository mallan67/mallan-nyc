# Search UX Flatten — Design Spec

**Date:** 2026-03-25
**Sub-Project:** 1 of 3 (Search UX Flatten → CMA Engine → Pricing Suggestions)
**Scope:** CRM search (`public/crm/index-built.html`) — navigation restructure, form deduplication, rental field wiring, sticky search bar
**Prerequisite for:** CMA Engine (Sub-Project 2) — CMA reuses the same filter components

---

## Problem Statement

The CRM search has 5 navigation layers before reaching search criteria (Header → Search Type → Property Type → Mode → Sections). This feels fractured. Additionally, 40+ rental-specific fields are stubbed (HTML exists, JS unwired), 3 nearly-identical basic mode forms duplicate ~2,000 lines, and the search button requires scrolling to the bottom of the form.

## Goals

1. Flatten navigation from 5 layers to 2
2. Wire all rental stub fields
3. Deduplicate 3 basic forms into 1 shared form
4. Add sticky search bar (always visible)
5. Prepare nav structure for CMA tab (Sub-Project 2)
6. Preserve all existing working functionality (including saved searches)

## Non-Goals

- CMA search/results (Sub-Project 2)
- Pricing suggestion engine (Sub-Project 3)
- Public frontend search (app/search/page.tsx)
- Redesigning the results display (5 view modes stay as-is)

---

## Architecture

### A. Navigation Restructure

**Current (5 layers):**
```
Header: [Search] [Manage]
  → [General Search] [Comparable Reports]
    → [Sales] [Rentals] [Buildings]
      → [Basic] [Advanced]
        → 20+ collapsible sections
```

**New (2 layers):**
```
Header: [Sales] [Rentals] [Buildings] [CMA]  ···  [Manage] [Agent Badge]
  → [Basic ●] [Advanced]  [Expand All] [Collapse All]
    → Search form sections
  → STICKY BOTTOM: [N filters] [Clear] [Search]
```

**Changes:**

| Element | Current | New |
|---|---|---|
| `#generalNavBar` | Search \| Manage (2 buttons) | Sales \| Rentals \| Buildings \| CMA \| ··· \| Manage \| Agent (full nav) |
| `#searchTypeTabs` | General Search \| Comparable Reports | **Removed** — CMA is a header nav item |
| `#btnSale`, `#btnRent`, `#btnBuilding` | Nested inside search card | **Moved to header** as primary nav |
| Basic/Advanced toggle | Nested inside search card, below type tabs | **Moved up** directly below header, always visible |
| Search button | Bottom of form (requires scrolling) | **Sticky bottom bar** — always visible |
| `toggleSearchType()` | Switches General/Comparable panels | **Removed** — replaced by header nav routing |

**Header HTML structure:**
```html
<header class="bg-[#1a1a1a] text-white sticky top-0 z-50">
  <div class="px-4 py-3 flex items-center justify-between">
    <!-- Left: Brand -->
    <div class="flex items-center gap-3">
      <span class="text-xl font-bold" style="color:#C4A052">MALLAN</span>
      <a href="/crm/dashboard" class="...">CRM</a>
    </div>
    <!-- Center: Primary nav tabs -->
    <nav class="flex gap-1.5">
      <button id="navSales" onclick="toggleSearchTab('sale')" class="nav-tab active">Sales</button>
      <button id="navRentals" onclick="toggleSearchTab('rent')" class="nav-tab">Rentals</button>
      <button id="navBuildings" onclick="toggleSearchTab('building')" class="nav-tab">Buildings</button>
      <button id="navCMA" onclick="toggleSearchTab('cma')" class="nav-tab">CMA</button>
    </nav>
    <!-- Right: Secondary nav -->
    <div class="flex items-center gap-2">
      <button id="navManage" onclick="showSearchSection('manage')" class="nav-secondary">Manage</button>
      <div id="agentBadge">...</div>
    </div>
  </div>
</header>
```

**Key:** Uses the existing `toggleSearchTab()` function name (not a new `switchSearchTab`). All existing onclick handlers stay compatible.

**Mobile header:** Tabs scroll horizontally (`overflow-x-auto`). Manage collapses to icon. Agent badge hidden.

### B. Form Deduplication

**Current:** 3 separate basic mode forms
- `#searchBasicMode` (Sales) — Lines 3365–4231 (~866 lines)
- `#searchBasicModeRental` (Rentals) — Lines 4233–5065 (~832 lines)
- `#searchBasicModeBuilding` (Buildings) — Lines 5066–5483 (~417 lines)

**New:** 1 shared form `#searchBasicMode` (keeps the existing primary ID)

#### Element ID Strategy

The unified form uses **tab-neutral IDs** for shared fields. A compatibility layer maps old tab-prefixed IDs to the new unified IDs so saved searches continue to restore.

**ID mapping table (shared fields):**

| Old Sale ID | Old Rental ID | New Unified ID | Notes |
|---|---|---|---|
| `saleMinPrice` | `rentalMinRent` | `searchMinPrice` | Label changes dynamically ("Price" / "Rent") |
| `saleMaxPrice` | `rentalMaxRent` | `searchMaxPrice` | |
| `saleMinBeds` | `rentalMinBeds` | `searchMinBeds` | Same field, was duplicated |
| `saleMaxBeds` | `rentalMaxBeds` | `searchMaxBeds` | |
| `saleMinBaths` | `rentalMinBaths` | `searchMinBaths` | |
| `saleMaxBaths` | `rentalMaxBaths` | `searchMaxBaths` | |
| `saleMinRooms` | `rentalMinRooms` | `searchMinRooms` | |
| `saleMaxRooms` | `rentalMaxRooms` | `searchMaxRooms` | |
| `saleMinSqft` | `rentalMinSqft` | `searchMinSqft` | |
| `saleMaxSqft` | `rentalMaxSqft` | `searchMaxSqft` | |
| `saleQuickRls` | `rentalQuickRls` | `searchQuickRls` | |
| `saleQuickZip` | `rentalQuickZip` | `searchQuickZip` | |
| `saleQuickUnit` | `rentalQuickUnit` | `searchQuickUnit` | |
| `saleSearchAddress` | `rentalSearchAddress` | `searchAddress` | |
| `saleNeighborhoodInput` | `rentalNeighborhoodInput` | `searchNeighborhoodInput` | |
| `saleKeywordSearch` | `rentalKeywordSearch` | `searchKeyword` | |
| `saleManagementCompany` | `rentalManagementCompany` | `searchManagementCompany` | |

**Advanced mode IDs** (already unified — no change needed):
`advSaleMinPrice`, `advRentalMinRent`, etc. stay as-is. The advanced form (`#searchAdvancedMode`) already handles its own tab-based visibility via `toggleSearchTab()`. The `data-show-on` system applies to **both** basic and advanced sections.

#### Saved Search Compatibility Layer

Add an ID alias map in `_criteriaToFormFields()` (line 22871):

```javascript
// Legacy ID aliases — maps old tab-prefixed IDs to new unified IDs
var _legacyIdMap = {
  'saleMinPrice': 'searchMinPrice', 'rentalMinRent': 'searchMinPrice',
  'saleMaxPrice': 'searchMaxPrice', 'rentalMaxRent': 'searchMaxPrice',
  'saleMinBeds': 'searchMinBeds',   'rentalMinBeds': 'searchMinBeds',
  'saleMaxBeds': 'searchMaxBeds',   'rentalMaxBeds': 'searchMaxBeds',
  // ... (all mapped fields)
};

function getFormEl(id) {
  return document.getElementById(id) || document.getElementById(_legacyIdMap[id] || '');
}
```

All form field access in `_criteriaToFormFields()` and `collectSearchCriteria()` goes through `getFormEl()` instead of direct `getElementById`. This means old saved searches with `saleMinPrice` still resolve to the new `searchMinPrice` element.

#### `data-show-on` for Both Basic and Advanced

The `data-show-on` attribute system applies to all sections in both modes:

```html
<!-- Basic mode shared section -->
<div data-show-on="sale,rent,building" class="search-section">
  <!-- Location: address, neighborhood, zip, transit, grid -->
</div>

<!-- Basic mode sale+rental -->
<div data-show-on="sale,rent" class="search-section">
  <!-- Price/Rent, Beds, Baths, Rooms, Sqft -->
</div>

<!-- Advanced mode rental-only section -->
<div data-show-on="rent" class="search-section collapsible-section">
  <!-- Furnished, Lease Details, Concessions, Availability -->
</div>
```

This **replaces** the imperative `style.display` toggling in the current `toggleSearchTab()` (lines 18313–18439). One system, one mechanism.

### C. Function Rewrites

Three functions need **rewriting** (not just enhancement):

#### 1. `collectSearchCriteria()` — Lines 16791–17258

**Current:** 4 branches per field (advanced sale, advanced rental, basic sale, basic rental), each referencing different element IDs.

**New:** Single-path collection using unified IDs + mode detection:

```javascript
function collectSearchCriteria() {
  var c = {};
  var isAdvanced = (currentSearchMode === 'advanced');
  c.searchTab = currentSearchTab;

  // Price — one path, unified IDs
  var prefix = isAdvanced ? 'adv' : 'search';
  c.priceMin = parseFloat(getFormEl(prefix + 'MinPrice').value) || null;
  c.priceMax = parseFloat(getFormEl(prefix + 'MaxPrice').value) || null;

  // Beds, Baths, Rooms, Sqft — same pattern
  c.bedsMin = parseInt(getFormEl(prefix + 'MinBeds').value) || null;
  // ... (same for all numeric fields)

  // Address, RLS ID, Zip, Unit — unified IDs
  c.address = (getFormEl('searchAddress') || {}).value || '';
  c.rlsId = (getFormEl('searchQuickRls') || {}).value || '';
  // ...

  // Generic checkbox scanner (unchanged — already global)
  c.checkboxFilters = {};
  document.querySelectorAll('[data-field]:checked').forEach(function(cb) {
    // ... existing scanner logic
  });

  return c;
}
```

The advanced mode IDs (`advSaleMinPrice`, `advRentalMinRent`) get the same `getFormEl()` alias treatment, OR we unify them too with `advMinPrice` + alias map.

#### 2. `clearSearchForm()` — Line 17260

**Current:** Iterates `['searchBasicMode', 'searchBasicModeRental', 'searchBasicModeBuilding']`.

**New:** Iterates `['searchBasicMode', 'searchAdvancedMode']` (the two surviving containers). Clears all inputs within, re-checks "Active" status checkbox.

```javascript
function clearSearchForm() {
  ['searchBasicMode', 'searchAdvancedMode'].forEach(function(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('input[type="text"], input[type="number"], input[type="date"]').forEach(function(el) { el.value = ''; });
    container.querySelectorAll('input[type="checkbox"]').forEach(function(el) { el.checked = false; });
    container.querySelectorAll('select').forEach(function(el) { el.selectedIndex = 0; });
  });
  // Re-check Active status
  document.querySelectorAll('[data-field="MlsStatus"][data-value="Active"]').forEach(function(el) { el.checked = true; });
  updateFilterCount();
}
```

#### 3. `_criteriaToFormFields()` — Line 22871

**Current:** Constructs element IDs per tab prefix.

**New:** Uses `getFormEl()` alias layer. Saved search payloads use API-format keys (`min_price`, `min_beds`), not element IDs — so the API layer is safe. The alias layer handles the element ID resolution.

### D. Rental Field Wiring — Complete Table

**Fully unwired fields (no `data-field` attribute):**

| Section | Checkboxes | Correct Trestle Field | Filter Type |
|---|---|---|---|
| Furnished Options | Unfurnished, Furnished, Flex, etc. (4) | `Furnished` | Trestle OData + local |
| Lease Type | Non Stabilized, Stabilized, Condo Lease, Coop Sublease, Comm/Prof (5) | `AvailableLeaseType` (NOT `LeaseAmountFrequency`) | Local filter only — Trestle field is text |
| Lease Terms | Short Term, Summer, Month To Month, 1 Year, 2+ Years (5) | `LeaseTerm` | Local filter only |
| Guarantors | Allowed, Not Allowed, Institutional, Personal, etc. (6) | **No Trestle field** — local filter only on custom property data | Local filter only |
| Concessions | Owner Pays, Free Rent, Owner Pays AND Free Rent (3) | `Concessions` (text field — match contains) | Local `indexOf` filter |
| Lease Availability | ASAP, Flexible, Specific Date (2 selects + 1 input) | `AvailabilityDate` | Date comparison in `filterListings()` |
| Board Requirements | Various (4+) | **No Trestle field** — local filter only | Local filter only |
| Listing Type | Exclusive, Co-Exclusive, Dare Alone, etc. (5) | **No standard Trestle field** (HTML comment confirms: "IDX MAPPING: NONE") | Local filter only |
| Management Checkboxes | Specific company names (10+) | Local filter on `managementCompany` string match | Local filter only |

**Already wired (verify only — no changes needed):**

| Field | `data-field` | Status |
|---|---|---|
| Private Outdoor Space | `PatioAndPorchFeatures` | Verify present |
| Apartment Type | `PropertySubType` | Verify present |
| Views | `View` | Verify present |
| Pets | `PetsAllowed` | Verify present |

**Action for fields with no Trestle equivalent:** These filter against cached listing data in `filterListings()` only (not sent to OData API). The generic checkbox scanner collects them into `criteria.checkboxFilters`, and `filterListings()` matches against listing properties.

### E. Sticky Search Bar

Fixed to bottom of viewport. Always visible when search form is shown.

```html
<div id="stickySearchBar" class="fixed bottom-0 left-0 right-0 z-40 bg-white border-t shadow-lg px-4 py-3 flex items-center justify-between">
  <div class="flex items-center gap-2">
    <span id="activeFilterCount" class="text-sm text-gray-500">No filters</span>
    <button onclick="clearSearchForm(); updateFilterCount();" class="text-xs text-red-500 hover:text-red-700">Clear</button>
  </div>
  <div class="hidden sm:flex items-center gap-2">
    <button onclick="openSaveSearchModal()" class="text-xs text-gray-400 hover:text-blue-600">
      <i class="fas fa-bookmark mr-1"></i>Save Search
    </button>
  </div>
  <button onclick="executeSearch()" class="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700">
    <i class="fas fa-search mr-1.5"></i>Search
  </button>
</div>
```

**Remove existing per-form search buttons** (bottom of each basic form) to avoid double search buttons.

**Active filter definition:** A filter is "active" when its value differs from the form's default state. Defaults: all text/number inputs empty, all selects at index 0, only "Active" status checked. `updateFilterCount()` counts divergences from this baseline.

### F. Mobile Experience

- **Basic mode only** on mobile (< 768px)
- Advanced toggle: `hidden md:inline-flex`
- Sticky search bar simplified: [Clear] [Search] only
- Header tabs: horizontal scroll with snap (`overflow-x-auto scroll-snap-x`)
- **Resize handler:** `matchMedia('(max-width: 767px)')` listener forces basic mode when viewport shrinks below 768px. Prevents advanced form staying visible after resize.

### G. CMA Nav Placeholder

The CMA header button routes to a placeholder panel:

```javascript
// In toggleSearchTab():
if (tab === 'cma') {
  document.getElementById('searchFormContainer').style.display = 'none';
  document.getElementById('cmaSection').style.display = '';
  sessionStorage.setItem('searchTab', tab); // Persist CMA tab state
  return;
}
// For all other tabs, show search form, hide CMA
document.getElementById('searchFormContainer').style.display = '';
document.getElementById('cmaSection').style.display = 'none';
```

The CMA placeholder panel shows: "CMA — Coming Soon" with brief description. Sub-Project 2 replaces this with the full CMA search + results.

### H. Removal of `toggleSearchType()`

The `toggleSearchType('general'|'comparables')` function (line 18574) and the `#searchTypeTabs` UI element (lines 3316–3327) are **removed**. Their routing responsibility is absorbed by `toggleSearchTab()` which now handles `'cma'` as a tab value alongside `'sale'`, `'rent'`, `'building'`.

The `#comparablesSection` HTML (lines 8872–9200+) is **kept** but hidden — it becomes the foundation for the CMA section in Sub-Project 2.

---

## Data Flow

```
HTML form inputs (unified IDs)
  ↓
getFormEl() — resolves unified or legacy IDs
  ↓
collectSearchCriteria() — REWRITTEN: single-path, no per-tab branching
  ↓
criteria object
  ↓
_serverSearch() → Trestle OData API  (primary)
filterListings() → local array filter  (fallback + rental-only fields)
  ↓
searchResultsState.filteredListings
  ↓
renderSearchResults() — 5 view modes (unchanged)
```

**Saved search serialization:** `_criteriaToApiFormat()` (line 22828) updated to include `checkboxFilters` so newly wired rental filters persist in saved searches.

## Files Changed

| File | Changes |
|---|---|
| `public/crm/index-built.html` | Navigation restructure, form dedup, sticky bar, rental field wiring, function rewrites |
| `public/crm/html/nav.html` | New header layout (source for built file) |
| `public/crm/html/search-form-and-results.html` | Shared form with `data-show-on` attributes, remove duplicate forms |
| `public/crm/js/search/search-engine.js` | Rewrite `collectSearchCriteria()`, `clearSearchForm()`, `_criteriaToFormFields()`. Add `getFormEl()` alias layer. Wire rental fields. |
| `public/crm/css/` (inline styles) | Sticky bar styles, nav-tab active state (inline in index-built.html, not separate file) |

## Testing

- [ ] Sales search: all 32 existing fields still work
- [ ] Rentals search: all rental stub fields now wired and filtering
- [ ] Buildings search: building-specific fields work
- [ ] Tab switching: no FOUC, `data-show-on` sections toggle correctly
- [ ] Advanced mode: `data-show-on` replaces old imperative toggle, all sections visible/hidden correctly
- [ ] Sticky search bar: visible on scroll, filter count updates, no duplicate search buttons
- [ ] Saved searches: old saved searches with legacy IDs still restore via `getFormEl()` alias
- [ ] New saved searches: rental `checkboxFilters` persist
- [ ] `clearSearchForm()`: clears all fields in both basic and advanced modes
- [ ] Mobile: Basic mode only, resize handler forces basic on viewport shrink
- [ ] CMA tab: shows placeholder, persists tab state to sessionStorage
- [ ] Results: all 5 view modes render correctly
- [ ] REBNY compliance: gates still enforced on all results
- [ ] Smoke test: `node scripts/smoke-test-crm.js` passes

## Risks

1. **Saved search compatibility** — Old searches use tab-prefixed IDs. **Mitigation:** `getFormEl()` alias layer maps old IDs to new unified IDs. API-format keys (`min_price`) are unaffected.
2. **`collectSearchCriteria()` rewrite scope** — This is a full rewrite of the function's top half (~200 lines of per-tab branching). **Mitigation:** Keep the generic checkbox scanner untouched. Write the new single-path collection alongside the old, test, then swap.
3. **Advanced mode visibility** — Replacing imperative `style.display` with `data-show-on` could miss edge cases in `toggleSearchTab()`. **Mitigation:** Test all 4 tab × 2 mode combinations (8 states).
4. **CMA placeholder** — Agents click CMA and see "Coming Soon." **Mitigation:** Clear messaging with expected timeline.

---

## Relationship to Sub-Projects 2 & 3

This spec creates the foundation:
- **CMA Engine (SP2):** Reuses the shared search filter components. CMA tab replaces placeholder with 3 date pickers + CMA results renderer. `data-show-on="cma"` sections added without touching existing search code.
- **Pricing Suggestions (SP3):** Builds on CMA data. Uses same filter criteria to find comps, then calculates price tiers.
- **CMA Report Output:** Two tiers — Summary CMA (client-friendly: summary cards + tables + charts) and Full CMA (appraisal-grade: summaries first, then full detail per listing with photos, floor plans, financials, building details, grouped by Active → In Contract → Sold).
