# CRM Search Redesign — Plan 1: Foundation
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the CRM search into a persistent split layout (filter panel left, results right) and fix the critical bug where all Advanced Search filters are silently ignored.

**Architecture:** All changes go to source files in `public/crm/` — never edit `index-built.html` directly. Run `npm run crm:build` after each task to rebuild. The layout adds a 380px fixed filter panel on the left using CSS flex on `<body>` or a new wrapper div, with results filling the remaining width. `collectSearchCriteria()` is updated to read `adv-*` IDs when in advanced mode.

**Tech Stack:** Vanilla HTML/CSS/JS, Tailwind CSS (browser CDN), `npm run crm:build` to compile, `npm run crm:test` to test.

**Spec:** `docs/superpowers/specs/2026-03-20-crm-search-redesign.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `public/crm/html/nav.html` | Single header bar + client selector |
| Modify | `public/crm/html/search-form-and-results.html` | Split layout wrapper, filter panel, results panel |
| Modify | `public/crm/html/my-searches.html` | Remove (replaced by filter panel dropdown) |
| Modify | `public/crm/html/last-search.html` | Remove (replaced by filter panel) |
| Modify | `public/crm/css/search-form.css` | Filter panel fixed width, scroll, collapse styles |
| Modify | `public/crm/css/results.css` | Results panel flex, active filter pills |
| Modify | `public/crm/css/responsive.css` | Mobile drawer breakpoint (<768px) |
| Modify | `public/crm/js/search/search-engine.js` | `collectSearchCriteria()` reads `adv-*` IDs; add `filterTabSwitch()`, `toggleFilterPanel()` as globals here (same closure as `toggleSearchTab`) |
| Modify | `public/crm/js/render/results-map.js` | Fix `toggleResultsMap()` to use flex layout instead of `width:100%` override |
| Modify | `public/crm/js/crm/client-database.js` | Header client dropdown — expose `currentWorkspaceClientId` and `renderSearchResults` as globals first |
| Modify | `public/crm/index.html` | Update `@include` references, add `filter-pills.js` after last render script |

**Scoping note:** `toggleSearchTab()`, `toggleSearchMode()`, `renderSearchResults()`, and `currentWorkspaceClientId` are defined inside closures in `search-engine.js`. Any new functions that call these must either: (a) be placed inside the same file so they share scope, or (b) use window-level bridges. This plan uses approach (a) for `filterTabSwitch` and `toggleFilterPanel`, and approach (b) for `client-database.js` (expose needed globals at end of `search-engine.js`).

---

## Task 1: Single Header Bar + Client Selector

**Files:**
- Modify: `public/crm/html/nav.html`

The current nav has two separate header sections (`generalNavBar` for search, a second bar for search results). Replace with one unified header that is always visible.

- [ ] **Step 1: Read the current nav.html**

```bash
cat public/crm/html/nav.html
```

- [ ] **Step 2: Replace nav.html with unified single bar**

New header structure: MALLAN logo | ← CRM | `[Client: ▼]` dropdown | agent badge | ⚙ settings

```html
<header id="searchHeader" class="luxury-header sticky top-0 z-50 shadow-sm">
  <div class="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">

    <!-- Left: brand + back -->
    <div class="flex items-center gap-3 flex-shrink-0">
      <div class="text-lg sm:text-xl font-bold tracking-wider" style="color:#C4A052;">MALLAN</div>
      <a href="/crm/dashboard" class="px-2.5 py-1.5 text-[11px] font-semibold rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all flex items-center gap-1.5">
        <i class="fas fa-arrow-left text-[10px]"></i>
        <span class="hidden sm:inline">CRM</span>
      </a>
    </div>

    <!-- Center: client selector -->
    <div class="flex-1 max-w-xs">
      <div class="relative" id="headerClientSelectorWrap">
        <button onclick="toggleHeaderClientDropdown()" id="headerClientBtn"
          class="w-full flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm font-medium text-blue-800 hover:bg-blue-100 transition-all">
          <i class="fas fa-user-circle text-blue-500 text-xs"></i>
          <span id="headerClientLabel" class="truncate flex-1 text-left">Select Client</span>
          <i class="fas fa-chevron-down text-[10px] text-blue-400"></i>
        </button>
        <div id="headerClientDropdown" class="hidden absolute left-0 top-full mt-1 w-72 bg-white rounded-xl shadow-2xl border z-50">
          <div class="p-2.5 border-b">
            <input type="text" id="headerClientSearch" placeholder="Search clients..."
              class="w-full border rounded-lg px-3 py-2 text-sm" oninput="filterHeaderClients(event)">
          </div>
          <div id="headerClientList" class="overflow-y-auto max-h-60 py-1"></div>
          <div class="p-2 border-t text-center">
            <a href="/crm/dashboard.html#clients" class="text-xs text-blue-600 hover:underline">Manage Clients →</a>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: agent badge + settings -->
    <div id="agentBadge" class="hidden sm:flex items-center gap-2 text-xs flex-shrink-0">
      <div class="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-600 text-[10px] font-bold" id="agentBadgeInitials">--</div>
      <div class="text-gray-600"><span id="agentBadgeName" class="font-medium">--</span></div>
      <button onclick="openEmailSettings()" class="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-amber-600 transition-all" title="Email Settings">
        <i class="fas fa-cog text-xs"></i>
      </button>
    </div>

  </div>
</header>
```

- [ ] **Step 3: Build and verify no JS errors**

```bash
npm run crm:build && node -e "
const fs = require('fs');
const html = fs.readFileSync('public/crm/index-built.html','utf8');
const count = (html.match(/id=\"searchHeader\"/g)||[]).length;
console.log('searchHeader occurrences:', count, count===1 ? 'PASS' : 'FAIL');
const oldBar = (html.match(/id=\"generalNavBar\"/g)||[]).length;
console.log('generalNavBar removed:', oldBar===0 ? 'PASS' : 'FAIL - still present');
"
```
Expected: `searchHeader occurrences: 1 PASS`, `generalNavBar removed: PASS`

- [ ] **Step 4: Commit**

```bash
git add public/crm/html/nav.html public/crm/index-built.html
git commit -m "feat(crm-search): unified single header bar with client selector"
```

---

## Task 2: Split Layout CSS

**Files:**
- Modify: `public/crm/css/search-form.css`
- Modify: `public/crm/css/results.css`
- Modify: `public/crm/css/responsive.css`

- [ ] **Step 1: Read current search-form.css and results.css**

```bash
wc -l public/crm/css/search-form.css public/crm/css/results.css
```

- [ ] **Step 2: Add split layout CSS to search-form.css**

Add at the top of `public/crm/css/search-form.css`:

```css
/* ── SPLIT LAYOUT ─────────────────────────────────────────────────── */
#searchPageLayout {
    display: flex;
    align-items: stretch;
    min-height: calc(100vh - 57px); /* 57px = header height */
}

/* Filter Panel */
#filterPanel {
    width: 380px;
    min-width: 380px;
    flex-shrink: 0;
    background: #ffffff;
    border-right: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    position: sticky;
    top: 57px;
    height: calc(100vh - 57px);
    overflow: hidden;
    transition: width 0.2s ease, min-width 0.2s ease;
    z-index: 20;
}

#filterPanel.collapsed {
    width: 48px;
    min-width: 48px;
}

#filterPanelScroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0 0 80px 0; /* 80px for pinned search button */
}

#filterPanelScroll::-webkit-scrollbar { width: 4px; }
#filterPanelScroll::-webkit-scrollbar-track { background: transparent; }
#filterPanelScroll::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }

/* Search + Clear pinned to bottom of filter panel */
#filterPanelActions {
    position: sticky;
    bottom: 0;
    background: #ffffff;
    border-top: 1px solid #e5e7eb;
    padding: 12px 16px;
    display: flex;
    gap: 8px;
    z-index: 5;
}

/* Collapse icon rail */
#filterPanelIconRail {
    display: none;
    flex-direction: column;
    align-items: center;
    padding: 12px 0;
    gap: 16px;
}

#filterPanel.collapsed #filterPanelIconRail { display: flex; }
#filterPanel.collapsed #filterPanelScroll,
#filterPanel.collapsed #filterPanelActions,
#filterPanel.collapsed #filterPanelHeader { display: none; }

/* Results Panel */
#resultsPanel {
    flex: 1;
    min-width: 0;
    background: #f3f4f6;
    overflow-y: auto;
    padding: 16px;
}

/* Map flex sibling within results panel content */
#resultsPanelContent {
    display: flex;
    gap: 16px;
    align-items: flex-start;
}

#resultsGridContainer {
    flex: 1;
    min-width: 0;
}

#resultsMapWrapper {
    width: 45%;
    min-width: 320px;
    flex-shrink: 0;
    position: sticky;
    top: 0;
    max-height: calc(100vh - 57px - 32px);
    display: none; /* shown by toggleResultsMap() */
}

#resultsMapWrapper.map-open {
    display: block;
}

/* Collapse toggle button */
#filterCollapseBtn {
    position: absolute;
    right: -14px;
    top: 50%;
    transform: translateY(-50%);
    width: 28px;
    height: 28px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 30;
    box-shadow: 0 1px 4px rgba(0,0,0,0.1);
    transition: background 0.15s;
}

#filterCollapseBtn:hover { background: #f9fafb; }
```

- [ ] **Step 3: Add active filter pills CSS to results.css**

Add to `public/crm/css/results.css`:

```css
/* ── ACTIVE FILTER PILLS ──────────────────────────────────────────── */
#activeFilterPills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 0;
    min-height: 36px;
}

#activeFilterPills:empty { display: none; }

.filter-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px 3px 10px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 600;
    color: #1d4ed8;
    white-space: nowrap;
    max-width: 200px;
}

.filter-pill span { overflow: hidden; text-overflow: ellipsis; }

.filter-pill-remove {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #bfdbfe;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    color: #1d4ed8;
    flex-shrink: 0;
    transition: background 0.1s;
}

.filter-pill-remove:hover { background: #93c5fd; }

/* ── RESULTS PLACEHOLDER (before first search) ────────────────────── */
#resultsPlaceholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 20px;
    text-align: center;
    color: #9ca3af;
}
```

- [ ] **Step 4: Add mobile CSS to responsive.css**

Add to `public/crm/css/responsive.css`:

```css
/* ── SPLIT LAYOUT MOBILE (<768px) ────────────────────────────────── */
@media (max-width: 767px) {
    #filterPanel {
        position: fixed;
        top: 0;
        left: -100%;
        width: 100% !important;
        min-width: unset !important;
        height: 100vh;
        z-index: 100;
        transition: left 0.25s ease;
    }

    #filterPanel.mobile-open {
        left: 0;
    }

    #filterPanel.collapsed {
        left: -100%;
        width: 100% !important;
    }

    #filterCollapseBtn { display: none; }

    #mobileFilterToggle { display: flex !important; }

    #resultsPanel { padding: 8px; }
}
```

- [ ] **Step 5: Build and spot-check CSS compiled**

```bash
npm run crm:build && node -e "
const fs = require('fs');
const html = fs.readFileSync('public/crm/index-built.html','utf8');
['#filterPanel','#resultsPanel','#activeFilterPills','filter-pill'].forEach(sel => {
    const found = html.includes(sel);
    console.log(sel + ':', found ? 'PASS' : 'FAIL - not found in output');
});
"
```

- [ ] **Step 6: Commit**

```bash
git add public/crm/css/search-form.css public/crm/css/results.css public/crm/css/responsive.css public/crm/index-built.html
git commit -m "feat(crm-search): add split layout CSS — filter panel + results panel + pills"
```

---

## Task 3: Split Layout HTML Structure

**Files:**
- Modify: `public/crm/html/search-form-and-results.html`
- Modify: `public/crm/index.html`

This is the largest change. The page body gains a `#searchPageLayout` wrapper containing `#filterPanel` (left) and `#resultsPanel` (right). All existing search form content moves inside `#filterPanelScroll`. Results stay inside `#resultsPanel`.

- [ ] **Step 1: Read the current top of search-form-and-results.html**

```bash
head -60 public/crm/html/search-form-and-results.html
```

- [ ] **Step 2: Wrap the entire page in split layout**

In `search-form-and-results.html`, wrap all content in:

```html
<!-- SPLIT LAYOUT WRAPPER -->
<div id="searchPageLayout">

  <!-- ═══════════════════════════════════════════ -->
  <!-- FILTER PANEL (left, always visible)         -->
  <!-- ═══════════════════════════════════════════ -->
  <div id="filterPanel">

    <!-- Collapse toggle button -->
    <button id="filterCollapseBtn" onclick="toggleFilterPanel()" title="Collapse filters">
      <i id="filterCollapseBtnIcon" class="fas fa-chevron-left text-xs text-gray-400"></i>
    </button>

    <!-- Icon rail (shown when collapsed) — all calls use filterTabSwitch() which is the global bridge -->
    <div id="filterPanelIconRail">
      <button onclick="toggleFilterPanel()" title="Expand filters" class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-600">
        <i class="fas fa-sliders-h"></i>
      </button>
      <button onclick="toggleFilterPanel(); filterTabSwitch('sale')" title="Sales" class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-600">
        <i class="fas fa-home"></i>
      </button>
      <button onclick="toggleFilterPanel(); filterTabSwitch('rent')" title="Rentals" class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-green-600">
        <i class="fas fa-building"></i>
      </button>
      <button onclick="toggleFilterPanel(); filterTabSwitch('building')" title="Buildings" class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-purple-600">
        <i class="fas fa-city"></i>
      </button>
      <button onclick="toggleFilterPanel(); filterTabSwitch('comparables')" title="Comparables" class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-amber-600">
        <i class="fas fa-chart-bar"></i>
      </button>
    </div>

    <!-- Panel header: tabs + mode toggle -->
    <div id="filterPanelHeader" class="border-b bg-white px-3 pt-3 pb-0">

      <!-- Mobile close button -->
      <button id="mobileFilterClose" onclick="toggleFilterPanel()" class="hidden absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 z-10">
        <i class="fas fa-times"></i>
      </button>

      <!-- Search type tabs: SALES | RENTALS | BUILDINGS | COMPS -->
      <div class="flex gap-0 mb-0 -mx-3 px-3 overflow-x-auto">
        <button id="filterTabSale" onclick="filterTabSwitch('sale')"
          class="px-3 py-2.5 text-[11px] font-bold tracking-wide border-b-2 border-blue-600 text-blue-700 bg-white flex-shrink-0">
          <i class="fas fa-home mr-1 text-[10px]"></i>SALES
        </button>
        <button id="filterTabRent" onclick="filterTabSwitch('rent')"
          class="px-3 py-2.5 text-[11px] font-bold tracking-wide border-b-2 border-transparent text-gray-500 hover:text-gray-700 bg-white flex-shrink-0">
          <i class="fas fa-building mr-1 text-[10px]"></i>RENTALS
        </button>
        <button id="filterTabBuilding" onclick="filterTabSwitch('building')"
          class="px-3 py-2.5 text-[11px] font-bold tracking-wide border-b-2 border-transparent text-gray-500 hover:text-gray-700 bg-white flex-shrink-0">
          <i class="fas fa-city mr-1 text-[10px]"></i>BUILDINGS
        </button>
        <button id="filterTabComps" onclick="filterTabSwitch('comparables')"
          class="px-3 py-2.5 text-[11px] font-bold tracking-wide border-b-2 border-transparent text-gray-500 hover:text-gray-700 bg-white flex-shrink-0">
          <i class="fas fa-chart-bar mr-1 text-[10px]"></i>COMPS
        </button>
      </div>

      <!-- Basic / Advanced toggle (hidden on Comps tab) -->
      <div id="filterModeToggle" class="flex items-center gap-3 py-2">
        <div class="flex bg-gray-100 rounded-lg p-0.5">
          <button id="btnSearchBasic" class="px-3 py-1 bg-gray-900 text-white rounded-md text-xs font-bold" onclick="toggleSearchMode('basic')">Basic</button>
          <button id="btnSearchAdvanced" class="px-3 py-1 text-gray-500 rounded-md text-xs font-bold hover:text-gray-700" onclick="toggleSearchMode('advanced')">Advanced</button>
        </div>
        <!-- Expand/Collapse All (Advanced only) -->
        <div id="expandCollapseControls" class="hidden flex items-center gap-1 text-xs">
          <button onclick="expandAllSections()" class="text-blue-600 hover:bg-blue-50 px-1.5 py-0.5 rounded text-[10px] font-medium">Expand All</button>
          <button onclick="collapseAllSections()" class="text-gray-500 hover:bg-gray-100 px-1.5 py-0.5 rounded text-[10px] font-medium">Collapse All</button>
        </div>
      </div>
    </div>

    <!-- Scrollable filter content -->
    <div id="filterPanelScroll">

      <!-- RLS live tracker (compact) -->
      <div id="rlsListingTracker" class="mx-3 mt-3 mb-2 bg-gray-900 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1.5">
            <div class="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
            <span class="text-gray-400 font-bold uppercase tracking-wider text-[9px]">RLS Live</span>
          </div>
          <span class="text-white font-bold" id="trackerSaleCount">--</span><span class="text-gray-500 text-[10px]">S</span>
          <span class="text-white font-bold" id="trackerRentalCount">--</span><span class="text-gray-500 text-[10px]">R</span>
        </div>
        <span id="trackerMatchEstimate" class="hidden text-blue-300 text-[10px] font-semibold">~<span id="trackerMatchCount">0</span> match</span>
      </div>

      <!-- ─── SEARCH FORM PANELS (existing content, moved here) ─── -->
      <!-- [All existing searchBasicMode, searchBasicModeRental,
           searchBasicModeBuilding, searchAdvancedMode, comparablesPanel
           divs go here — unchanged except their @include wrapper] -->

      <div id="section-main" class="px-3 pb-4">
        <!-- existing search forms content goes here unchanged -->
      </div>

    </div><!-- end filterPanelScroll -->

    <!-- Pinned search actions -->
    <div id="filterPanelActions">
      <button onclick="recallLastSearch()" class="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 flex-shrink-0">
        <i class="fas fa-history text-[10px]"></i>Last
      </button>
      <button onclick="openSaveSearchModal()" class="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 flex-shrink-0">
        <i class="far fa-bookmark text-[10px]"></i>Save
      </button>
      <div class="flex-1"></div>
      <button onclick="clearSearchForm()" class="px-3 py-2 text-sm text-gray-500 hover:text-red-500 font-medium border rounded-lg">Clear</button>
      <button onclick="performSearch()" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm">
        <i class="fas fa-search mr-1.5 text-xs"></i>Search
      </button>
    </div>

  </div><!-- end filterPanel -->

  <!-- ═══════════════════════════════════════════ -->
  <!-- RESULTS PANEL (right, fills remaining)      -->
  <!-- ═══════════════════════════════════════════ -->
  <div id="resultsPanel">

    <!-- Mobile filter toggle (hidden on desktop) -->
    <button id="mobileFilterToggle" onclick="toggleFilterPanel()"
      class="hidden mb-3 px-3 py-2 bg-white border rounded-lg text-sm font-medium text-gray-700 flex items-center gap-2 shadow-sm">
      <i class="fas fa-sliders-h text-gray-500"></i> Filters
    </button>

    <!-- Results placeholder (shown before first search) -->
    <div id="resultsPlaceholder">
      <i class="fas fa-search text-5xl mb-4 text-gray-300"></i>
      <p class="text-lg font-semibold text-gray-400">Set your criteria and search</p>
      <p class="text-sm text-gray-400 mt-1">Results will appear here</p>
    </div>

    <!-- Results content (hidden until first search) -->
    <div id="searchResultsSection" style="display:none;">

      <!-- REBNY attribution bar -->
      <div class="mb-3 p-2.5 bg-white border rounded-lg text-xs text-gray-500 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="fas fa-database text-gray-400"></i>
          <span>Data provided by REBNY RLS via Trestle. Mallan Real Estate Inc. #10991205323. Information deemed reliable but not guaranteed.</span>
        </div>
        <span>Last updated: <span class="data-timestamp" id="rebnyDataTimestamp">Loading...</span></span>
      </div>

      <!-- Commission negotiability disclosure -->
      <div class="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg text-[10px] text-blue-700 flex items-center gap-2" data-compliance="commission-negotiability">
        <i class="fas fa-info-circle text-blue-400 flex-shrink-0"></i>
        <span>Commission rates are not set by law and are fully negotiable. Compensation offered to cooperating brokers is determined by the listing broker and is subject to change.</span>
      </div>

      <!-- Working with client banner -->
      <div id="workingWithClientBanner" class="hidden bg-blue-50 border border-blue-200 rounded-xl mb-4 px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <i class="fas fa-user-check text-blue-600"></i>
          <span class="text-sm font-medium text-blue-800">Working with: <span id="workingClientLabel" class="font-bold"></span></span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-blue-600" id="workingClientInfo"></span>
          <button onclick="clearWorkingClient()" class="px-2 py-1 text-xs border border-blue-300 rounded hover:bg-blue-100 text-blue-700">
            <i class="fas fa-times mr-1"></i>Clear
          </button>
        </div>
      </div>

      <!-- Results toolbar (existing — moved here unchanged) -->
      <!-- [existing toolbar HTML goes here] -->

      <!-- Active filter pills -->
      <div id="activeFilterPills" class="mb-3"></div>

      <!-- Results content: grid + optional map -->
      <div id="resultsPanelContent">
        <div id="resultsGridContainer">
          <!-- [existing resultsGrid, pagination, etc. go here] -->
        </div>
        <!-- map wrapper is now a flex sibling -->
        <div id="resultsMapWrapper">
          <div id="resultsMapContainer" style="position:absolute;inset:0;"></div>
        </div>
      </div>

    </div><!-- end searchResultsSection -->

  </div><!-- end resultsPanel -->

</div><!-- end searchPageLayout -->
```

- [ ] **Step 3: Update `performSearch()` to stop hiding/showing the form**

In `public/crm/js/search/search-engine.js`, find `performSearch()`. Remove any lines that hide `#searchFormContainer` or show/hide `#searchResultsSection` by toggling the whole form. Replace with:

```javascript
// Show results panel, hide placeholder
var placeholder = document.getElementById('resultsPlaceholder');
var resultsSection = document.getElementById('searchResultsSection');
if (placeholder) placeholder.style.display = 'none';
if (resultsSection) {
    resultsSection.style.display = 'block';
    resultsSection.classList.remove('hidden');
}
// Filter panel stays visible — no form hide/show
```

- [ ] **Step 4: Build and verify**

```bash
npm run crm:build && node -e "
const fs = require('fs');
const html = fs.readFileSync('public/crm/index-built.html','utf8');
const checks = [
    ['searchPageLayout', 'Split layout wrapper'],
    ['filterPanel', 'Filter panel'],
    ['resultsPanel', 'Results panel'],
    ['filterPanelScroll', 'Scrollable filter area'],
    ['filterPanelActions', 'Pinned search buttons'],
    ['resultsPlaceholder', 'Results placeholder'],
    ['activeFilterPills', 'Filter pills container'],
    ['resultsPanelContent', 'Results + map flex container'],
];
checks.forEach(([id, label]) => {
    const found = html.includes('id=\"'+id+'\"');
    console.log(label+':', found ? 'PASS' : 'FAIL');
});
"
```

- [ ] **Step 5: Run test suite**

```bash
npm run crm:test
```
Expected: test suite runs, no new failures vs baseline.

- [ ] **Step 6: Commit**

```bash
git add public/crm/html/search-form-and-results.html public/crm/js/search/search-engine.js public/crm/index-built.html
git commit -m "feat(crm-search): persistent split layout — filter panel always visible"
```

---

## Task 4: Add filterTabSwitch() and toggleFilterPanel() to search-engine.js

**Files:**
- Modify: `public/crm/js/search/search-engine.js`

**Scoping:** `toggleSearchTab()` and `toggleSearchMode()` are defined inside the `search-engine.js` closure. `filterTabSwitch()` and `toggleFilterPanel()` must be added to the same file so they can call those functions directly. They are then exposed as `window.filterTabSwitch` and `window.toggleFilterPanel` so HTML `onclick` attributes can reach them.

- [ ] **Step 1: Add `filterTabSwitch()` and `toggleFilterPanel()` to search-engine.js**

Add these at the **end** of `search-engine.js`, after all existing function definitions, so they share the closure scope and can call `toggleSearchTab()` directly. Then expose as globals for HTML `onclick` use.

```javascript
/**
 * filterTabSwitch(tab) — Called by filter panel tab buttons.
 * Must live in search-engine.js to access toggleSearchTab() in same closure.
 * tab: 'sale' | 'rent' | 'building' | 'comparables'
 */
function filterTabSwitch(tab) {
    var tabs = ['sale','rent','building','comparables'];
    var ids  = ['filterTabSale','filterTabRent','filterTabBuilding','filterTabComps'];

    // Update tab button active styles
    tabs.forEach(function(t, i) {
        var btn = document.getElementById(ids[i]);
        if (!btn) return;
        var isActive = t === tab;
        btn.classList.toggle('border-blue-600', isActive);
        btn.classList.toggle('text-blue-700', isActive);
        btn.classList.toggle('border-transparent', !isActive);
        btn.classList.toggle('text-gray-500', !isActive);
    });

    // Show/hide Basic/Advanced toggle (hidden on Comps tab)
    var modeToggle = document.getElementById('filterModeToggle');
    if (modeToggle) modeToggle.style.display = tab === 'comparables' ? 'none' : '';

    // Show/hide Comparables panel vs search forms
    var comparablesPanel = document.getElementById('comparablesPanel');
    var sectionMain = document.getElementById('section-main');
    if (tab === 'comparables') {
        if (comparablesPanel) comparablesPanel.style.display = 'block';
        if (sectionMain) sectionMain.style.display = 'none';
    } else {
        if (comparablesPanel) comparablesPanel.style.display = 'none';
        if (sectionMain) sectionMain.style.display = 'block';
        toggleSearchTab(tab);  // existing function handles form switching
    }
}
```

- [ ] **Step 2: Add `toggleFilterPanel()` and expose both as globals in search-engine.js**

```javascript
var _filterPanelCollapsed = false;

function toggleFilterPanel() {
    var panel = document.getElementById('filterPanel');
    if (!panel) return;
    _filterPanelCollapsed = !_filterPanelCollapsed;
    panel.classList.toggle('collapsed', _filterPanelCollapsed);
    // Mobile: toggle mobile-open class instead
    if (window.innerWidth < 768) {
        panel.classList.toggle('mobile-open', !_filterPanelCollapsed);
        panel.classList.remove('collapsed');
    }
    // Update collapse button icon direction
    var icon = document.getElementById('filterCollapseBtnIcon');
    if (icon) {
        icon.classList.toggle('fa-chevron-left', !_filterPanelCollapsed);
        icon.classList.toggle('fa-chevron-right', _filterPanelCollapsed);
    }
}
```

After `toggleFilterPanel`, add global exposure at end of search-engine.js:

```javascript
// Expose for HTML onclick attributes
window.filterTabSwitch = filterTabSwitch;
window.toggleFilterPanel = toggleFilterPanel;
```

Also expose `renderSearchResults` and `currentWorkspaceClientId` here so `client-database.js` can access them:

```javascript
window._crmRenderSearchResults = function() {
    if (typeof renderSearchResults === 'function') renderSearchResults();
};
window._getCWCId = function() { return currentWorkspaceClientId; };
window._setCWCId = function(id) { currentWorkspaceClientId = id; };
```

- [ ] **Step 3: Build and verify**

```bash
npm run crm:build && node -e "
const fs = require('fs');
const html = fs.readFileSync('public/crm/index-built.html','utf8');
['filterTabSwitch','toggleFilterPanel','window.filterTabSwitch','window.toggleFilterPanel','_crmRenderSearchResults','_setCWCId'].forEach(fn => {
    console.log(fn+':', html.includes(fn) ? 'PASS' : 'FAIL');
});
"
```

- [ ] **Step 4: Commit**

```bash
git add public/crm/js/search/search-engine.js public/crm/index-built.html
git commit -m "feat(crm-search): filterTabSwitch, toggleFilterPanel, global bridges for closure-scoped functions"
```

---

## ~~Task 5: listing-type-info.html~~ — SKIP

The modal already exists at `public/crm/html/modals/listing-type-info.html` and is already compiled into `index-built.html`. The `@include` is already in `index.html` line 77. No action needed.

---

## Task 6: Fix Advanced Form IDs — Critical Bug

**Files:**
- Modify: `public/crm/html/search-form-and-results.html` (add IDs to all advanced inputs)
- Modify: `public/crm/js/search/search-engine.js` (update collectSearchCriteria)

This is the most critical fix. Every select/input in `#searchAdvancedMode` that lacks an `id` needs one assigned.

- [ ] **Step 1: Write a test that detects the missing IDs bug**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('public/crm/index-built.html','utf8');

// Check that advanced form IDs exist
const requiredAdvIDs = [
    'adv-min-price','adv-max-price',
    'adv-min-beds','adv-max-beds',
    'adv-min-baths','adv-max-baths',
    'adv-min-rooms','adv-max-rooms',
    'adv-min-sqft','adv-max-sqft',
    'adv-keyword',
    'adv-listed-from','adv-listed-to',
    'adv-updated-from','adv-updated-to',
    'adv-dom-min','adv-dom-max',
    'adv-year-built-from','adv-year-built-to',
    'adv-floor-min','adv-floor-max',
    'adv-cc-min','adv-cc-max',
    'adv-pet-deposit-max',
];
var missing = requiredAdvIDs.filter(id => !html.includes('id=\"'+id+'\"'));
console.log('Missing IDs:', missing.length, missing.length > 0 ? '(EXPECTED - not fixed yet)' : 'PASS');
" 2>&1
```
Expected output: lists missing IDs (confirms bug is real).

- [ ] **Step 2: Add IDs to all advanced form price/size inputs**

In `public/crm/html/search-form-and-results.html`, in `#searchAdvancedMode` section "Essentials":

The sale price fields (inside `#salePriceFields`):
```html
<!-- Before: <select class="border ..."> -->
<!-- After: -->
<select id="adv-min-price" class="border border-gray-300 rounded px-1 py-1.5 text-xs" style="flex:1;min-width:0;max-width:100%;">
  ... (options unchanged)
</select>
<select id="adv-max-price" class="border border-gray-300 rounded px-1 py-1.5 text-xs" style="flex:1;min-width:0;max-width:100%;">
  ... (options unchanged)
</select>
```

The rent price fields (inside `#rentPriceFields`):
```html
<select id="adv-min-rent" ...>...</select>
<select id="adv-max-rent" ...>...</select>
```

Expenses fields (inside `#monthlyExpensesFields`):
```html
<select id="adv-min-expenses" ...>...</select>
<select id="adv-max-expenses" ...>...</select>
```

Net Rent fields (inside `#netMonthlyRentFields`):
```html
<select id="adv-min-net-rent" ...>...</select>
<select id="adv-max-net-rent" ...>...</select>
```

Property Size card — Bedrooms:
```html
<select id="adv-min-beds" ...>...</select>
<select id="adv-max-beds" ...>...</select>
```

Bathrooms:
```html
<select id="adv-min-baths" ...>...</select>
<select id="adv-max-baths" ...>...</select>
```

Rooms:
```html
<select id="adv-min-rooms" ...>...</select>
<select id="adv-max-rooms" ...>...</select>
```

SqFt:
```html
<select id="adv-min-sqft" ...>...</select>
<select id="adv-max-sqft" ...>...</select>
```

Ceiling Height:
```html
<input type="number" id="adv-ceiling-min" placeholder="Min" ...>
<input type="number" id="adv-ceiling-max" placeholder="Max" ...>
```

Keyword Search:
```html
<input type="text" id="adv-keyword" placeholder="Keyword Search" class="border rounded-lg px-3 py-2 text-sm">
```

- [ ] **Step 3: Add IDs to date inputs in "Listing History, Activity & DOM" section**

```html
<!-- Listed Date -->
<input type="date" id="adv-listed-from" class="flex-1 border ...">
<input type="date" id="adv-listed-to" class="flex-1 border ...">
<!-- Last Updated -->
<input type="date" id="adv-updated-from" class="flex-1 border ...">
<input type="date" id="adv-updated-to" class="flex-1 border ...">
<!-- Contract Signed (sale) -->
<input type="date" id="adv-contract-from" class="flex-1 border ...">
<input type="date" id="adv-contract-to" class="flex-1 border ...">
<!-- Sold/Closed Date (sale) -->
<input type="date" id="adv-sold-from" class="flex-1 border ...">
<input type="date" id="adv-sold-to" class="flex-1 border ...">
<!-- Lease Signed (rental) -->
<input type="date" id="adv-lease-signed-from" class="flex-1 border ...">
<input type="date" id="adv-lease-signed-to" class="flex-1 border ...">
<!-- Rented Date (rental) -->
<input type="date" id="adv-rented-from" class="flex-1 border ...">
<input type="date" id="adv-rented-to" class="flex-1 border ...">
<!-- DOM -->
<input type="number" id="adv-dom-min" placeholder="Min DOM" ...>
<input type="number" id="adv-dom-max" placeholder="Max DOM" ...>
```

- [ ] **Step 4: Add IDs to Building Details section**

```html
<!-- Year Built -->
<input type="number" id="adv-year-built-from" placeholder="From" ...>
<input type="number" id="adv-year-built-to" placeholder="To" ...>
<!-- Year Renovated -->
<input type="number" id="adv-year-renovated-after" placeholder="After" ...>
<!-- Building Size - Floors -->
<input type="number" id="adv-floors-min" placeholder="Min" ...>
<input type="number" id="adv-floors-max" placeholder="Max" ...>
<!-- Building Size - Units -->
<input type="number" id="adv-bldg-units-min" placeholder="Min" ...>
<input type="number" id="adv-bldg-units-max" placeholder="Max" ...>
```

- [ ] **Step 5: Add IDs to Financial Details section (sale)**

```html
<!-- Common Charges -->
<input type="number" id="adv-cc-min" placeholder="Min" ...>
<input type="number" id="adv-cc-max" placeholder="Max" ...>
<!-- RE Taxes -->
<input type="number" id="adv-tax-min" placeholder="Min" ...>
<input type="number" id="adv-tax-max" placeholder="Max" ...>
<!-- Total Monthly -->
<input type="number" id="adv-monthly-min" placeholder="Min" ...>
<input type="number" id="adv-monthly-max" placeholder="Max" ...>
```

- [ ] **Step 6: Add IDs to Floor Preferences, Pet Policy, Townhouse sections**

```html
<!-- Floor Range -->
<input type="number" id="adv-floor-min" placeholder="Min" ...>
<input type="number" id="adv-floor-max" placeholder="Max" ...>
<!-- Pet Deposit Max -->
<select id="adv-pet-deposit-max" ...>...</select>
<!-- Townhouse Width -->
<select id="adv-th-width-min" ...>...</select>
<select id="adv-th-width-max" ...>...</select>
<!-- Townhouse Units -->
<select id="adv-th-units-min" ...>...</select>
<select id="adv-th-units-max" ...>...</select>
```

- [ ] **Step 7: Update `collectSearchCriteria()` in search-engine.js**

Find the `collectSearchCriteria()` function. After the existing basic-form reads, add an advanced-mode override block:

```javascript
function collectSearchCriteria() {
    var criteria = {};
    criteria.searchTab = currentSearchTab;

    var isAdvanced = false;
    try { isAdvanced = sessionStorage.getItem('searchMode') === 'advanced'; } catch(e) {}

    if (isAdvanced) {
        // ── ADVANCED FORM READS ──────────────────────────────────
        var getVal = function(id) {
            var el = document.getElementById(id);
            return el ? el.value : '';
        };
        var getNum = function(id) {
            var v = getVal(id);
            if (!v || v === 'custom') return undefined;
            var n = Number(v);
            return isNaN(n) ? undefined : n;
        };
        var getFloat = function(id) {
            var v = getVal(id);
            if (!v || v === 'custom') return undefined;
            var n = parseFloat(v);
            return isNaN(n) ? undefined : n;
        };

        // Price (sale uses adv-min-price, rental uses adv-min-rent)
        if (currentSearchTab === 'rent') {
            criteria.priceMin = getNum('adv-min-rent');
            criteria.priceMax = getNum('adv-max-rent');
        } else {
            criteria.priceMin = getNum('adv-min-price');
            criteria.priceMax = getNum('adv-max-price');
        }

        criteria.bedsMin  = getNum('adv-min-beds');
        criteria.bedsMax  = getNum('adv-max-beds');
        criteria.bathsMin = getFloat('adv-min-baths');
        criteria.bathsMax = getFloat('adv-max-baths');
        criteria.roomsMin = getNum('adv-min-rooms');
        criteria.roomsMax = getNum('adv-max-rooms');
        criteria.sqftMin  = getNum('adv-min-sqft');
        criteria.sqftMax  = getNum('adv-max-sqft');
        criteria.keyword  = getVal('adv-keyword') || undefined;
        criteria.domMin   = getNum('adv-dom-min');
        criteria.domMax   = getNum('adv-dom-max');
        criteria.yearBuiltFrom = getNum('adv-year-built-from');
        criteria.yearBuiltTo   = getNum('adv-year-built-to');
        criteria.floorsMin     = getNum('adv-floors-min');
        criteria.floorsMax     = getNum('adv-floors-max');

        // Date ranges
        criteria.listedFrom   = getVal('adv-listed-from')   || undefined;
        criteria.listedTo     = getVal('adv-listed-to')     || undefined;
        criteria.updatedFrom  = getVal('adv-updated-from')  || undefined;
        criteria.updatedTo    = getVal('adv-updated-to')    || undefined;
        if (currentSearchTab === 'rent') {
            criteria.leaseSignedFrom = getVal('adv-lease-signed-from') || undefined;
            criteria.leaseSignedTo   = getVal('adv-lease-signed-to')   || undefined;
            criteria.rentedFrom      = getVal('adv-rented-from')       || undefined;
            criteria.rentedTo        = getVal('adv-rented-to')         || undefined;
        } else {
            criteria.contractFrom = getVal('adv-contract-from') || undefined;
            criteria.contractTo   = getVal('adv-contract-to')   || undefined;
            criteria.soldFrom     = getVal('adv-sold-from')     || undefined;
            criteria.soldTo       = getVal('adv-sold-to')       || undefined;
        }

        // Status checkboxes — read from advancedMode (existing logic)
        var advMode = document.getElementById('searchAdvancedMode');
        if (advMode) {
            var statusChecks = advMode.querySelectorAll('[data-field="MlsStatus"]:checked');
            if (statusChecks.length > 0) {
                criteria.statuses = Array.from(statusChecks).map(function(cb) {
                    return cb.getAttribute('data-value');
                }).filter(Boolean);
            }
            // Ownership checkboxes
            var ownerChecks = advMode.querySelectorAll('[data-field="CommonInterest"]:checked');
            if (ownerChecks.length > 0) {
                criteria.ownership = Array.from(ownerChecks).map(function(cb) {
                    return cb.getAttribute('data-value') || cb.value;
                });
            }
        }

        // Neighborhood tags from advanced form
        var advTags = document.getElementById('advancedNeighborhoodTags');
        if (advTags) {
            var nbTags = advTags.querySelectorAll('[data-neighborhood]');
            if (nbTags.length > 0) {
                criteria.neighborhoods = Array.from(nbTags).map(function(t) {
                    return t.getAttribute('data-neighborhood');
                });
            }
        }

        // Clean up undefined values
        Object.keys(criteria).forEach(function(k) {
            if (criteria[k] === undefined || criteria[k] === null || criteria[k] === '') {
                delete criteria[k];
            }
        });

        return criteria;
    }

    // ── BASIC FORM READS (existing code unchanged below) ──────────
    // ... rest of existing collectSearchCriteria() function unchanged ...
```

- [ ] **Step 8: Build and run the ID verification test**

```bash
npm run crm:build && node -e "
const fs = require('fs');
const html = fs.readFileSync('public/crm/index-built.html','utf8');
const requiredAdvIDs = [
    'adv-min-price','adv-max-price',
    'adv-min-beds','adv-max-beds',
    'adv-min-baths','adv-max-baths',
    'adv-min-rooms','adv-max-rooms',
    'adv-min-sqft','adv-max-sqft',
    'adv-keyword',
    'adv-listed-from','adv-listed-to',
    'adv-dom-min','adv-dom-max',
    'adv-year-built-from','adv-year-built-to',
];
var missing = requiredAdvIDs.filter(id => !html.includes('id=\"'+id+'\"'));
console.log('Missing advanced IDs:', missing.length === 0 ? 'NONE - PASS' : missing.join(', '));
console.log('collectSearchCriteria reads adv-min-price:', html.includes(\"adv-min-price'\") ? 'PASS' : 'FAIL');
"
```

- [ ] **Step 9: Run test suite**

```bash
npm run crm:test
```

- [ ] **Step 10: Commit**

```bash
git add public/crm/html/search-form-and-results.html public/crm/js/search/search-engine.js public/crm/index-built.html
git commit -m "fix(crm-search): CRITICAL — add IDs to all advanced form inputs, collectSearchCriteria reads advanced mode correctly"
```

---

## Task 7: Header Client Selector JS

**Files:**
- Modify: `public/crm/js/crm/client-database.js`

Wire the header client dropdown to real data. Uses the global bridges exposed by Task 4 (`window._setCWCId`, `window._crmRenderSearchResults`) to avoid scoping issues with functions defined inside the `search-engine.js` closure.

- [ ] **Step 1: Add header client dropdown functions to client-database.js**

```javascript
// ── HEADER CLIENT SELECTOR ──────────────────────────────────────────
function toggleHeaderClientDropdown() {
    var dd = document.getElementById('headerClientDropdown');
    if (!dd) return;
    var isHidden = dd.classList.contains('hidden');
    dd.classList.toggle('hidden');
    if (isHidden) populateHeaderClientList();
}

function populateHeaderClientList(filter) {
    var container = document.getElementById('headerClientList');
    if (!container) return;
    var clients = Object.values(getMyClients());
    if (filter) {
        var f = filter.toLowerCase();
        clients = clients.filter(function(c) {
            return (c.name||'').toLowerCase().includes(f) || (c.email||'').toLowerCase().includes(f);
        });
    }
    if (clients.length === 0) {
        container.innerHTML = '<div class="px-4 py-3 text-sm text-gray-400 text-center">No clients found</div>';
        return;
    }
    var E = typeof escapeHtml === 'function' ? escapeHtml : function(s){ return String(s||''); };
    container.innerHTML = clients.map(function(c) {
        var typeColor = c.type === 'Buyer' ? 'blue' : c.type === 'Renter' ? 'green' : 'gray';
        return '<button onclick="selectHeaderClient(\''+E(c.id||c._id)+'\')" '
            + 'class="w-full text-left px-3 py-2.5 hover:bg-blue-50 text-sm flex items-center gap-3">'
            + '<div class="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">'+(c.name||'?').charAt(0)+'</div>'
            + '<div class="flex-1 min-w-0"><div class="font-medium text-gray-900 truncate">'+E(c.name)+'</div>'
            + '<div class="text-xs text-gray-400 truncate">'+E(c.email||'')+'</div></div>'
            + '<span class="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-'+typeColor+'-100 text-'+typeColor+'-700">'+E(c.type||'')+'</span>'
            + '</button>';
    }).join('');
}

function filterHeaderClients(event) {
    populateHeaderClientList(event.target.value);
}

function selectHeaderClient(clientId) {
    var client = (typeof customerDB !== 'undefined') ? customerDB[clientId] : null;
    if (!client) return;
    // Use global bridge to set currentWorkspaceClientId inside search-engine.js closure
    if (typeof window._setCWCId === 'function') window._setCWCId(clientId);
    // Update header button label
    var label = document.getElementById('headerClientLabel');
    if (label) label.textContent = client.name || 'Client';
    // Update the existing workingWithClientBanner
    var banner = document.getElementById('workingWithClientBanner');
    var bannerLabel = document.getElementById('workingClientLabel');
    if (banner) { banner.classList.remove('hidden'); banner.style.display = ''; }
    if (bannerLabel) bannerLabel.textContent = client.name || '';
    // Close dropdown
    var dd = document.getElementById('headerClientDropdown');
    if (dd) dd.classList.add('hidden');
    // Re-render via global bridge (renderSearchResults is inside search-engine.js closure)
    if (typeof window._crmRenderSearchResults === 'function') window._crmRenderSearchResults();
}

// Close header dropdown when clicking outside
document.addEventListener('click', function(e) {
    var wrap = document.getElementById('headerClientSelectorWrap');
    if (wrap && !wrap.contains(e.target)) {
        var dd = document.getElementById('headerClientDropdown');
        if (dd) dd.classList.add('hidden');
    }
});
```

- [ ] **Step 2: Build and verify**

```bash
npm run crm:build && node -e "
const fs = require('fs');
const html = fs.readFileSync('public/crm/index-built.html','utf8');
['toggleHeaderClientDropdown','selectHeaderClient','filterHeaderClients'].forEach(fn => {
    console.log(fn+':', html.includes(fn) ? 'PASS' : 'FAIL');
});
"
```

- [ ] **Step 3: Run full test suite**

```bash
npm run crm:test
```

- [ ] **Step 4: Commit**

```bash
git add public/crm/js/crm/client-database.js public/crm/index-built.html
git commit -m "feat(crm-search): header client selector — search, select, wires to workingClientBanner"
```

---

## Task 8: Active Filter Pills

**Files:**
- Create: `public/crm/js/search/filter-pills.js`
- Modify: `public/crm/index.html` (add script include)

- [ ] **Step 1: Create filter-pills.js**

```javascript
// ── ACTIVE FILTER PILLS ──────────────────────────────────────────────
// Renders pills above results showing active filters.
// Each pill has an × that removes that filter and re-runs search.

var PILL_LABELS = {
    priceMin:  function(v){ return 'Min $'+Number(v).toLocaleString(); },
    priceMax:  function(v){ return 'Max $'+Number(v).toLocaleString(); },
    bedsMin:   function(v){ return v === 0 ? 'Studio+' : v+'+ Beds'; },
    bedsMax:   function(v){ return 'Max '+v+' Beds'; },
    bathsMin:  function(v){ return v+'+ Baths'; },
    roomsMin:  function(v){ return v+'+ Rooms'; },
    sqftMin:   function(v){ return Number(v).toLocaleString()+' SF+'; },
    sqftMax:   function(v){ return 'Max '+Number(v).toLocaleString()+' SF'; },
    domMax:    function(v){ return 'DOM ≤'+v; },
    keyword:   function(v){ return '"'+v+'"'; },
    statuses:  function(v){ return Array.isArray(v) ? v.join('/') : v; },
    ownership: function(v){ return Array.isArray(v) ? v.join('/') : v; },
    yearBuiltFrom: function(v){ return 'Built '+v+'+'; },
};

function renderFilterPills() {
    var container = document.getElementById('activeFilterPills');
    if (!container) return;
    var c = (typeof activeSearchCriteria !== 'undefined') ? activeSearchCriteria : null;
    if (!c) { container.innerHTML = ''; return; }

    var pills = [];
    Object.keys(PILL_LABELS).forEach(function(key) {
        var val = c[key];
        if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) return;
        var label = PILL_LABELS[key](val);
        pills.push({ key: key, label: label });
    });

    // Neighborhoods
    if (c.neighborhoods && c.neighborhoods.length > 0) {
        c.neighborhoods.forEach(function(nb) {
            pills.push({ key: 'neighborhood_' + nb, label: nb, removeFn: function() { removeNeighborhoodFromCriteria(nb); } });
        });
    }

    if (pills.length === 0) { container.innerHTML = ''; return; }

    container.innerHTML = pills.map(function(p) {
        return '<span class="filter-pill">'
            + '<span>'+escapeHtml(p.label)+'</span>'
            + '<button class="filter-pill-remove" onclick="removePillFilter(\''+p.key+'\')" title="Remove filter">&times;</button>'
            + '</span>';
    }).join('');
}

function removePillFilter(key) {
    if (typeof activeSearchCriteria === 'undefined' || !activeSearchCriteria) return;
    if (key.startsWith('neighborhood_')) {
        var nb = key.replace('neighborhood_', '');
        if (activeSearchCriteria.neighborhoods) {
            activeSearchCriteria.neighborhoods = activeSearchCriteria.neighborhoods.filter(function(n){ return n !== nb; });
        }
    } else {
        delete activeSearchCriteria[key];
    }
    renderFilterPills();
    if (typeof performSearch === 'function') performSearch();
}

function removeNeighborhoodFromCriteria(nb) { removePillFilter('neighborhood_' + nb); }
```

- [ ] **Step 2: Add to index.html script list**

In `public/crm/index.html`, add **after the last render script** (currently `js/render/grid-layouts.js`, around line 136) — must come after all render scripts since `renderFilterPills` is called from render callbacks:

```html
<script src="js/search/filter-pills.js"></script>
```

- [ ] **Step 3: Call `renderFilterPills()` after every `performSearch()`**

In `public/crm/js/search/search-engine.js`, at the end of the search results render callback, add:

```javascript
if (typeof renderFilterPills === 'function') renderFilterPills();
```

- [ ] **Step 4: Build and verify**

```bash
npm run crm:build && node -e "
const fs = require('fs');
const html = fs.readFileSync('public/crm/index-built.html','utf8');
['renderFilterPills','removePillFilter','filter-pill'].forEach(s => {
    console.log(s+':', html.includes(s) ? 'PASS' : 'FAIL');
});
"
```

- [ ] **Step 5: Run test suite**

```bash
npm run crm:test
```

- [ ] **Step 6: Commit**

```bash
git add public/crm/js/search/filter-pills.js public/crm/js/search/search-engine.js public/crm/index.html public/crm/index-built.html
git commit -m "feat(crm-search): active filter pills — shows applied filters, click × to remove and re-search"
```

---

## Task 9: Fix Map Split Layout

**Files:**
- Modify: `public/crm/js/render/results-map.js` (toggleResultsMap function — NOT search-engine.js)

The map currently overrides to `width:100%` when toggled open, covering results. Fix to use the flex layout instead.

- [ ] **Step 1: Find toggleResultsMap() in results-map.js and fix it**

In `public/crm/js/render/results-map.js`, find `toggleResultsMap()` and replace the wrapper CSS override:

```javascript
function toggleResultsMap() {
    var wrapper = document.getElementById('resultsMapWrapper');
    if (!wrapper) return;
    var isOpen = wrapper.classList.contains('map-open');
    wrapper.classList.toggle('map-open', !isOpen);
    // Do NOT override width inline — CSS handles flex layout
    // Just show/hide the wrapper; resultsPanelContent flex handles proportions
    var btn = document.getElementById('resultsMapToggleBtn');
    if (btn) btn.classList.toggle('text-blue-600', !isOpen);
    if (!isOpen) {
        // Initialize map if not already done
        if (typeof initMap === 'function') initMap();
        if (typeof refreshMapPins === 'function') refreshMapPins();
    }
}
```

- [ ] **Step 2: Build and verify**

```bash
npm run crm:build && node -e "
const fs = require('fs');
const html = fs.readFileSync('public/crm/index-built.html','utf8');
// Verify no width:100% override in toggleResultsMap
const idx = html.indexOf('function toggleResultsMap');
const snippet = html.substring(idx, idx+500);
const hasOverride = snippet.includes(\"width:'100%'\") || snippet.includes('width:\"100%\"');
console.log('No width override in toggleResultsMap:', !hasOverride ? 'PASS' : 'FAIL - still has override');
console.log('map-open class toggle present:', snippet.includes('map-open') ? 'PASS' : 'FAIL');
"
```

- [ ] **Step 3: Commit**

```bash
git add public/crm/js/render/results-map.js public/crm/index-built.html
git commit -m "fix(crm-search): results map uses flex layout — no longer covers results grid"
```

---

## Task 10: Loading Skeleton State

**Files:**
- Modify: `public/crm/js/search/search-engine.js`
- Modify: `public/crm/css/results.css`

- [ ] **Step 1: Add skeleton CSS to results.css**

Note: `@keyframes skeletonPulse` already exists in `css/base.css`. Do NOT add it again — just add the class rules:

```css
/* ── SKELETON LOADER ─────────────────────────────────────────────── */
/* skeletonPulse keyframe already in base.css — do not duplicate */
.skeleton-card {
    background: #ffffff;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    overflow: hidden;
    animation: skeletonPulse 1.5s ease-in-out infinite;
}
.skeleton-img  { height: 180px; background: #f3f4f6; }
.skeleton-line { height: 12px; background: #f3f4f6; border-radius: 6px; margin: 12px 16px; }
.skeleton-line.short { width: 60%; }
.skeleton-line.medium { width: 80%; }
```

- [ ] **Step 2: Add showSearchSkeleton() / hideSearchSkeleton() to search-engine.js**

```javascript
function showSearchSkeleton() {
    var placeholder = document.getElementById('resultsPlaceholder');
    var resultsSection = document.getElementById('searchResultsSection');
    var grid = document.getElementById('resultsGrid');
    if (placeholder) placeholder.style.display = 'none';
    if (resultsSection) { resultsSection.style.display = 'block'; resultsSection.classList.remove('hidden'); }
    if (grid) {
        grid.innerHTML = Array(6).fill(0).map(function() {
            return '<div class="skeleton-card">'
                + '<div class="skeleton-img"></div>'
                + '<div class="skeleton-line medium"></div>'
                + '<div class="skeleton-line short"></div>'
                + '<div class="skeleton-line"></div>'
                + '</div>';
        }).join('');
        grid.classList.remove('hidden');
    }
}

function hideSearchSkeleton() {
    // Grid is repopulated by renderSearchResults() — nothing to do here
    // except ensure skeleton cards are replaced
}
```

- [ ] **Step 3: Call showSearchSkeleton() at the START of performSearch()**

At the very beginning of `performSearch()`, before the API call:

```javascript
function performSearch() {
    showSearchSkeleton();  // ← add this line
    // ... rest of existing performSearch() unchanged
```

- [ ] **Step 4: Build and verify**

```bash
npm run crm:build && node -e "
const fs = require('fs');
const html = fs.readFileSync('public/crm/index-built.html','utf8');
['showSearchSkeleton','skeleton-card','skeleton-img'].forEach(s => {
    console.log(s+':', html.includes(s) ? 'PASS' : 'FAIL');
});
"
```

- [ ] **Step 5: Run full test suite**

```bash
npm run crm:test
```

- [ ] **Step 6: Commit**

```bash
git add public/crm/js/search/search-engine.js public/crm/css/results.css public/crm/index-built.html
git commit -m "feat(crm-search): skeleton loading state — no blank page during Trestle fetch"
```

---

## Task 11: Remove Legacy Sections + Live Saved Searches

**Files:**
- Modify: `public/crm/html/my-searches.html`
- Modify: `public/crm/html/last-search.html`

`section-my` and `section-last` are legacy static-data sections. In the new layout they're replaced by the live saved searches dropdown in the filter panel. Remove their hardcoded content.

- [ ] **Step 1: Replace my-searches.html with live data version**

```html
<!-- SAVED SEARCHES SECTION (live data) -->
<div id="section-my" class="p-6" style="display:none">
    <div class="mb-4 flex items-center justify-between">
        <div>
            <h2 class="text-xl font-bold text-gray-900">My Saved Searches</h2>
            <p class="text-gray-500 text-sm">Your saved criteria — click to re-run</p>
        </div>
        <button onclick="openSaveSearchModal()" class="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
            <i class="fas fa-save mr-1.5"></i> Save Current
        </button>
    </div>
    <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div id="savedSearchesSectionList" class="divide-y">
            <div class="p-8 text-center text-gray-400">
                <i class="fas fa-spinner fa-spin text-2xl mb-3 block"></i>
                Loading saved searches...
            </div>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Replace last-search.html with simple placeholder**

```html
<!-- LAST SEARCH (handled by recallLastSearch() function) -->
<div id="section-last" class="p-6" style="display:none">
    <div class="mb-4">
        <h2 class="text-xl font-bold text-gray-900">Last Search</h2>
    </div>
    <div id="lastSearchDisplay" class="bg-white rounded-xl shadow-sm border p-6 text-center text-gray-400">
        <p>No recent search. Run a search first.</p>
    </div>
    <button onclick="recallLastSearch()" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
        <i class="fas fa-history mr-1.5"></i> Recall Last Search
    </button>
</div>
```

- [ ] **Step 3: Populate saved searches section on load**

In `public/crm/js/search/saved-searches.js`, add a function that populates `#savedSearchesSectionList`:

```javascript
function populateSavedSearchesSection() {
    var container = document.getElementById('savedSearchesSectionList');
    if (!container || typeof MallanAPI === 'undefined') return;
    container.innerHTML = '<div class="p-6 text-center text-gray-400"><i class="fas fa-spinner fa-spin mr-2"></i>Loading...</div>';
    MallanAPI.savedSearches.list().then(function(result) {
        var searches = result.savedSearches || [];
        if (searches.length === 0) {
            container.innerHTML = '<div class="p-8 text-center text-gray-400">No saved searches yet. Run a search and click Save.</div>';
            return;
        }
        container.innerHTML = searches.map(function(s) {
            var dateStr = s.updated_at ? new Date(s.updated_at).toLocaleDateString() : '';
            var alertBadge = s.alert_enabled ? '<span class="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-semibold rounded-full ml-1">'+s.alert_frequency+'</span>' : '';
            var clientBadge = s.lead_id ? '<span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-semibold rounded-full ml-1"><i class="fas fa-user text-[8px]"></i></span>' : '';
            return '<div class="flex items-center justify-between px-4 py-3 hover:bg-gray-50">'
                + '<div class="flex-1 min-w-0">'
                + '<div class="font-semibold text-sm text-gray-900 truncate">'+escapeHtml(s.name)+alertBadge+clientBadge+'</div>'
                + '<div class="text-xs text-gray-400">'+dateStr+'</div>'
                + '</div>'
                + '<div class="flex items-center gap-2 ml-3">'
                + '<button onclick="loadSavedSearch(\''+s.id+'\')" class="px-3 py-1 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700">Run</button>'
                + '<button onclick="deleteSavedSearch(\''+s.id+'\')" class="p-1 text-red-400 hover:bg-red-50 rounded" aria-label="Delete"><i class="fas fa-trash text-xs"></i></button>'
                + '</div>'
                + '</div>';
        }).join('');
    }).catch(function() {
        container.innerHTML = '<div class="p-6 text-center text-red-400">Failed to load. Check your connection.</div>';
    });
}
```

- [ ] **Step 4: Build and run full test suite**

```bash
npm run crm:build && npm run crm:test
```

- [ ] **Step 5: Commit**

```bash
git add public/crm/html/my-searches.html public/crm/html/last-search.html public/crm/js/search/saved-searches.js public/crm/index-built.html
git commit -m "feat(crm-search): live saved searches section, remove hardcoded static content"
```

---

## Final Verification

- [ ] **Run full test suite and confirm all pass**

```bash
npm run crm:test
```

- [ ] **Verify build is clean**

```bash
npm run crm:build 2>&1 | tail -5
```
Expected: no errors, stats showing CSS/HTML/JS inlined.

- [ ] **Spot-check compiled output for critical elements**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('public/crm/index-built.html','utf8');
const checks = [
    'searchPageLayout', 'filterPanel', 'resultsPanel',
    'filterPanelActions', 'activeFilterPills', 'resultsPanelContent',
    'searchListingTypeInfoModal', 'adv-min-price', 'adv-min-beds',
    'adv-keyword', 'collectSearchCriteria', 'showSearchSkeleton',
    'renderFilterPills', 'toggleFilterPanel', 'filterTabSwitch',
    'selectHeaderClient', 'headerClientDropdown',
];
var pass = 0, fail = 0;
checks.forEach(s => {
    var found = html.includes(s);
    if (found) pass++; else { console.log('FAIL:', s); fail++; }
});
console.log(pass+'/'+checks.length+' checks passed', fail === 0 ? '✓ ALL PASS' : fail+' FAILED');
"
```

---

## What This Plan Produces

After Plan 1, the CRM search will have:
- ✅ Persistent filter panel — filters never disappear
- ✅ Single header bar with client selector
- ✅ Advanced Search actually works — all filters collected and sent to API
- ✅ Active filter pills show what's applied
- ✅ Map no longer covers results
- ✅ Loading skeleton — no blank page during search
- ✅ Live saved searches section
- ✅ Missing modal crash fixed
- ✅ Four search type tabs in filter panel

**Next: Plan 2** covers Comparables search panel + Output & Delivery (print show sheets, email comps, send to clients, CC rule).
