// ═══════════════════════════════════════════════════════════════
// SEARCH ORCHESTRATOR — Main controller for search v2
// Coordinates: registry, form, router, filter bar, drawer
// Feeds results into the existing CRM result renderers
// ═══════════════════════════════════════════════════════════════
var SearchV2 = (function() {
  'use strict';

  var _state = {
    initialized: false,
    tab: 'sale',
    criteria: {},
    results: [],
    loading: false,
    containerSel: null,
    formContainerSel: null,
    filterBarSel: null,
    resultsContainerSel: null
  };

  // Container IDs — use existing CRM DOM where possible
  var FORM_CONTAINER = 'sv2-form-container';
  var FILTER_BAR_CONTAINER = 'sv2-filter-bar-container';

  // ── Show loading shimmer ──────────────────────────────────────
  function _showLoading() {
    _state.loading = true;
    var skeleton = document.getElementById('resultsLoadingSkeleton');
    if (skeleton) skeleton.style.display = 'block';
    // Also show shimmer placeholders in results area
    var resultsArea = document.getElementById('searchResultsContainer') ||
                      document.getElementById('gridViewContainer');
    if (resultsArea && !resultsArea.querySelector('.sv2-shimmer')) {
      var shimmerHtml = '';
      for (var i = 0; i < 6; i++) {
        shimmerHtml += '<div class="sv2-shimmer" style="height:120px;margin-bottom:8px;"></div>';
      }
      // Don't overwrite existing results — prepend shimmer overlay
      var overlay = document.createElement('div');
      overlay.className = 'sv2-loading-overlay';
      overlay.style.cssText = 'position:absolute;inset:0;background:rgba(255,255,255,0.8);z-index:10;padding:16px;';
      overlay.innerHTML = shimmerHtml;
      resultsArea.style.position = 'relative';
      resultsArea.appendChild(overlay);
    }
  }

  // ── Hide loading ──────────────────────────────────────────────
  function _hideLoading() {
    _state.loading = false;
    var skeleton = document.getElementById('resultsLoadingSkeleton');
    if (skeleton) skeleton.style.display = 'none';
    // Remove shimmer overlays
    var overlays = document.querySelectorAll('.sv2-loading-overlay');
    overlays.forEach(function(el) { el.remove(); });
  }

  // ── Feed results into existing CRM renderers ──────────────────
  function _renderResults(results) {
    // Set results into global searchResultsState (existing CRM)
    if (typeof searchResultsState !== 'undefined') {
      searchResultsState.filteredListings = results;
      searchResultsState.totalListings = results.length;
    }

    // Call existing render functions
    if (typeof renderSearchResults === 'function') {
      renderSearchResults();
    }
    if (typeof updateResultsCount === 'function') {
      updateResultsCount();
    }

    // Update filter bar count
    var filterBarEl = document.getElementById(FILTER_BAR_CONTAINER);
    if (filterBarEl) {
      FilterBar.updateCount(filterBarEl, results.length);
    }
  }

  // ── Show form view (hide results) ─────────────────────────────
  function _showFormView() {
    var formEl = document.getElementById(FORM_CONTAINER);
    if (formEl) formEl.style.display = 'block';
    var filterEl = document.getElementById(FILTER_BAR_CONTAINER);
    if (filterEl) filterEl.style.display = 'none';
  }

  // ── Show results view (hide form) ─────────────────────────────
  function _showResultsView() {
    var formEl = document.getElementById(FORM_CONTAINER);
    if (formEl) formEl.style.display = 'none';
    var filterEl = document.getElementById(FILTER_BAR_CONTAINER);
    if (filterEl) filterEl.style.display = 'block';
  }

  // ── Perform search ────────────────────────────────────────────
  function performSearch() {
    var criteria = CriteriaCollector.collect({
      tab: _state.tab,
      container: '#' + FORM_CONTAINER
    });
    _state.criteria = criteria;

    _showLoading();
    _showResultsView();

    SearchRouter.search(criteria).then(function(results) {
      _state.results = results;
      _hideLoading();
      _renderResults(results);

      // Render filter bar
      FilterBar.render(criteria, '#' + FILTER_BAR_CONTAINER, results.length);

      console.log('[SearchV2] Search complete:', results.length, 'results');
    }).catch(function(err) {
      _hideLoading();
      console.error('[SearchV2] Search failed:', err);
      _state.results = [];
      _renderResults([]);
      FilterBar.render(criteria, '#' + FILTER_BAR_CONTAINER, 0);
    });
  }

  // ── Update search (from filter bar/drawer, no form re-render) ──
  function updateSearch(criteria) {
    _state.criteria = criteria;
    _showLoading();

    SearchRouter.search(criteria).then(function(results) {
      _state.results = results;
      _hideLoading();
      _renderResults(results);
      FilterBar.render(criteria, '#' + FILTER_BAR_CONTAINER, results.length);
      console.log('[SearchV2] Update complete:', results.length, 'results');
    }).catch(function(err) {
      _hideLoading();
      console.error('[SearchV2] Update failed:', err);
    });
  }

  // ── Clear search ──────────────────────────────────────────────
  function clearSearch() {
    SearchForm.clear('#' + FORM_CONTAINER);
    _state.criteria = { _tab: _state.tab };
    _state.results = [];
    _showFormView();
  }

  // ── Switch tab ────────────────────────────────────────────────
  function switchTab(tab) {
    _state.tab = tab;
    _state.criteria = { _tab: tab };
    _state.results = [];
    SearchForm.render({
      tab: tab,
      container: '#' + FORM_CONTAINER,
      onSearch: function() { performSearch(); },
      onClear: function() { clearSearch(); }
    });
    _showFormView();
  }

  // ── Initialize ────────────────────────────────────────────────
  function init(containerSelector) {
    if (_state.initialized) {
      console.warn('[SearchV2] Already initialized');
      return Promise.resolve();
    }

    var container = document.querySelector(containerSelector);
    if (!container) {
      console.error('[SearchV2] Container not found:', containerSelector);
      return Promise.reject(new Error('Container not found'));
    }

    _state.containerSel = containerSelector;

    // Ensure sub-containers exist
    if (!document.getElementById(FORM_CONTAINER)) {
      var formDiv = document.createElement('div');
      formDiv.id = FORM_CONTAINER;
      container.insertBefore(formDiv, container.firstChild);
    }
    if (!document.getElementById(FILTER_BAR_CONTAINER)) {
      var filterDiv = document.createElement('div');
      filterDiv.id = FILTER_BAR_CONTAINER;
      filterDiv.style.display = 'none';
      container.insertBefore(filterDiv, document.getElementById(FORM_CONTAINER).nextSibling);
    }

    // Fetch and load registry
    return fetch('/crm/data/search-registry.json')
      .then(function(res) {
        if (!res.ok) throw new Error('Failed to load search registry: ' + res.status);
        return res.json();
      })
      .then(function(data) {
        SearchRegistry.load(data);
        var validation = SearchRegistry.validate();
        if (!validation.valid) {
          console.warn('[SearchV2] Registry validation issues:', validation.errors);
        }
        console.log('[SearchV2] Registry loaded:', SearchRegistry.getFieldCount(), 'fields');

        // Render initial form
        SearchForm.render({
          tab: _state.tab,
          container: '#' + FORM_CONTAINER,
          onSearch: function() { performSearch(); },
          onClear: function() { clearSearch(); }
        });

        // Wire filter bar callbacks
        FilterBar.onPillRemove(function(key) {
          var criteria = CriteriaCollector.removeCriterion(_state.criteria, key);
          if (CriteriaCollector.hasFilters(criteria)) {
            updateSearch(criteria);
          } else {
            // No filters left — go back to form
            clearSearch();
          }
        });

        FilterBar.onMoreFilters(function() {
          FilterDrawer.open(_state.criteria, _state.tab);
        });

        FilterBar.onQuickAdd(function(key) {
          // Open drawer scrolled to the relevant section
          FilterDrawer.open(_state.criteria, _state.tab);
        });

        // Wire drawer update
        FilterDrawer.onUpdate(function(newCriteria) {
          updateSearch(newCriteria);
        });

        _state.initialized = true;
        console.log('[SearchV2] Initialized');
      })
      .catch(function(err) {
        console.error('[SearchV2] Init failed:', err);
        throw err;
      });
  }

  return {
    init: init,
    performSearch: performSearch,
    updateSearch: updateSearch,
    clearSearch: clearSearch,
    switchTab: switchTab,
    getState: function() { return Object.assign({}, _state); },
    isInitialized: function() { return _state.initialized; }
  };
})();

/* USAGE — wire into CRM page:
   <link rel="stylesheet" href="/crm/css/search-v2.css">
   <script src="/crm/js/search-v2/registry-loader.js"></script>
   <script src="/crm/js/search-v2/widget-renderers.js"></script>
   <script src="/crm/js/search-v2/criteria-collector.js"></script>
   <script src="/crm/js/adapters/trestle-adapter.js"></script>
   <script src="/crm/js/adapters/result-normalizer.js"></script>
   <script src="/crm/js/search-v2/form-renderer.js"></script>
   <script src="/crm/js/adapters/search-router.js"></script>
   <script src="/crm/js/search-v2/filter-bar.js"></script>
   <script src="/crm/js/search-v2/filter-drawer.js"></script>
   <script src="/crm/js/search-v2/search-orchestrator.js"></script>
   <script>
     SearchV2.init('#searchV2Container');
   </script>
*/
