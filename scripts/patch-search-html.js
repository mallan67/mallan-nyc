// Patch script: Apply split layout HTML structure to search-form-and-results.html
const fs = require('fs');
const path = 'C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/html/search-form-and-results.html';
let html = fs.readFileSync(path, 'utf8');

// ── EDIT 1: Replace opening section-main wrapper ─────────────────────────────
const oldOpen = '<div id="section-main" class="p-6">\r\n                <div id="searchFormContainer">';
const newOpen = `<div id="searchPageLayout">

  <!-- ═══ FILTER PANEL (left, always visible) ═══ -->
  <div id="filterPanel">

    <!-- Collapse toggle -->
    <button id="filterCollapseBtn" onclick="toggleFilterPanel()" title="Collapse filters">
      <i id="filterCollapseBtnIcon" class="fas fa-chevron-left text-xs text-gray-400"></i>
    </button>

    <!-- Icon rail (collapsed state) -->
    <div id="filterPanelIconRail">
      <button onclick="toggleFilterPanel()" title="Expand" class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-600">
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

      <!-- Search type tabs -->
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

      <!-- Basic / Advanced toggle -->
      <div id="filterModeToggle" class="flex items-center gap-3 py-2">
        <div class="flex bg-gray-100 rounded-lg p-0.5">
          <button id="btnSearchBasic" class="px-3 py-1 bg-gray-900 text-white rounded-md text-xs font-bold" onclick="toggleSearchMode('basic')">Basic</button>
          <button id="btnSearchAdvanced" class="px-3 py-1 text-gray-500 rounded-md text-xs font-bold hover:text-gray-700" onclick="toggleSearchMode('advanced')">Advanced</button>
        </div>
        <div id="expandCollapseControls" class="hidden flex items-center gap-1 text-xs">
          <button onclick="expandAllSections()" class="text-blue-600 hover:bg-blue-50 px-1.5 py-0.5 rounded text-[10px] font-medium">Expand All</button>
          <button onclick="collapseAllSections()" class="text-gray-500 hover:bg-gray-100 px-1.5 py-0.5 rounded text-[10px] font-medium">Collapse All</button>
        </div>
      </div>
    </div>

    <!-- Scrollable filter content -->
    <div id="filterPanelScroll">
                <div id="searchFormContainer">`;

if (!html.includes(oldOpen)) {
  console.error('EDIT 1 MARKER NOT FOUND — aborting');
  process.exit(1);
}
html = html.replace(oldOpen, newOpen);
console.log('Edit 1 applied: opening split layout wrapper');

// ── EDIT 2: Close filterPanelScroll + filterPanel, open resultsPanel ─────────
const CRLF = '\r\n';
const oldClose = `                </div><!-- End searchFormContainer -->${CRLF}${CRLF}                <!-- ═══════════════════════════════════════════════════════════════════════════════ -->${CRLF}                <!-- SEARCH RESULTS SECTION - REBNY-Style Client Delivery System -->${CRLF}                <!-- ═══════════════════════════════════════════════════════════════════════════════ -->${CRLF}                <div id="searchResultsSection" class="mt-6" style="display: none;">${CRLF}                    <!-- Sticky Search Navigation Bar — Dark Banner -->`;

const newClose = `                </div><!-- End searchFormContainer -->
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

  <!-- ═══ RESULTS PANEL (right) ═══ -->
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

                <!-- ═══════════════════════════════════════════════════════════════════════════════ -->
                <!-- SEARCH RESULTS SECTION - REBNY-Style Client Delivery System -->
                <!-- ═══════════════════════════════════════════════════════════════════════════════ -->
                <div id="searchResultsSection" class="mt-6" style="display: none;">
                    <!-- Sticky Search Navigation Bar — Dark Banner -->`;

if (!html.includes(oldClose)) {
  console.error('EDIT 2 MARKER NOT FOUND — aborting');
  process.exit(1);
}
html = html.replace(oldClose, newClose);
console.log('Edit 2 applied: filterPanel close + resultsPanel open');

// ── EDIT 3: Close resultsPanel + searchPageLayout (replace old section-main close) ──
// The final </div> in the file closes section-main (comes just before the MODALS REMOVED comment)
const oldEnd = `  </div>${CRLF}${CRLF}            <!-- [MODALS REMOVED — see html/modals/ for: client-delivery, grid-layouts, reports, add-edit-client, save-search, report-preview, client-feedback, client-report-view, filter] -->`;
const newEnd = `  </div>

  </div><!-- end resultsPanel -->

</div><!-- end searchPageLayout -->

            <!-- [MODALS REMOVED — see html/modals/ for: client-delivery, grid-layouts, reports, add-edit-client, save-search, report-preview, client-feedback, client-report-view, filter] -->`;

if (!html.includes(oldEnd)) {
  console.error('EDIT 3 MARKER NOT FOUND — aborting');
  process.exit(1);
}
html = html.replace(oldEnd, newEnd);
console.log('Edit 3 applied: close resultsPanel + searchPageLayout');

fs.writeFileSync(path, html, 'utf8');
console.log('File written successfully. Total length:', html.length, 'chars');
