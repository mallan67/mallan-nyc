// ═══════════════════════════════════════════════════════════════
// FILTER BAR — Active criteria pills + quick-add + more filters
// Renders above search results in the results view
// ═══════════════════════════════════════════════════════════════
var FilterBar = (function() {
  'use strict';

  var _pillRemoveCallbacks = [];
  var _moreFiltersCallbacks = [];
  var _quickAddCallbacks = [];

  function E(s) { return WidgetRenderers.escapeHtml(s); }

  // ── Common filters for quick-add dropdown ─────────────────────
  var QUICK_ADD_FILTERS = [
    { key: 'price', label: 'Price' },
    { key: 'beds', label: 'Beds' },
    { key: 'baths', label: 'Baths' },
    { key: 'neighborhood', label: 'Neighborhood' },
    { key: 'sqft', label: 'Sq Ft' },
    { key: 'year-built', label: 'Year Built' },
    { key: 'status', label: 'Status' },
    { key: 'property-sub-type', label: 'Property Type' },
    { key: 'ownership', label: 'Ownership' }
  ];

  // ── Render pill for a single criterion ────────────────────────
  function _renderPill(key, value, criteria) {
    // Derive base key (strip _min/_max)
    var isMin = key.endsWith('_min');
    var isMax = key.endsWith('_max');
    var baseKey = isMin ? key.slice(0, -4) : isMax ? key.slice(0, -4) : key;

    // Skip if we already rendered a pill for this base key (range pairs)
    var field = SearchRegistry.getField(baseKey);

    // For range fields, combine min + max into one pill
    if ((isMin || isMax) && field) {
      // Only render on _min pass (or _max if no _min exists)
      if (isMax && criteria[baseKey + '_min'] !== undefined) return '';
      var rangeVal = {
        min: criteria[baseKey + '_min'] !== undefined ? criteria[baseKey + '_min'] : null,
        max: criteria[baseKey + '_max'] !== undefined ? criteria[baseKey + '_max'] : null
      };
      var text = CriteriaCollector.formatForPill(field, rangeVal);
      return '<span class="sv2-pill sv2-pill-active" data-sv2-pill="' + E(baseKey) + '">' +
        E(text) +
        '<span class="sv2-pill-remove" data-sv2-pill-remove="' + E(baseKey) + '">&times;</span>' +
        '</span>';
    }

    var text = CriteriaCollector.formatForPill(field, value);
    return '<span class="sv2-pill sv2-pill-active" data-sv2-pill="' + E(baseKey) + '">' +
      E(text) +
      '<span class="sv2-pill-remove" data-sv2-pill-remove="' + E(baseKey) + '">&times;</span>' +
      '</span>';
  }

  // ── Render quick-add dropdown ─────────────────────────────────
  function _renderQuickAdd(criteria) {
    // Show filters NOT currently active
    var activeKeys = {};
    Object.keys(criteria).forEach(function(k) {
      if (k === '_tab') return;
      var isMin = k.endsWith('_min');
      var isMax = k.endsWith('_max');
      var base = isMin ? k.slice(0, -4) : isMax ? k.slice(0, -4) : k;
      activeKeys[base] = true;
    });

    var available = QUICK_ADD_FILTERS.filter(function(f) { return !activeKeys[f.key]; });
    if (available.length === 0) return '';

    var h = '<div class="sv2-quick-add-wrap" style="position:relative;display:inline-block;">';
    h += '<button type="button" class="sv2-quick-add" data-sv2-quick-toggle>';
    h += '<i class="fas fa-plus" style="margin-right:3px;font-size:9px;"></i> Add Filter</button>';
    h += '<div class="sv2-quick-add-menu" style="display:none;position:absolute;top:100%;left:0;background:#fff;border:1px solid #E5E7EB;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);min-width:160px;z-index:30;margin-top:4px;">';
    available.forEach(function(f) {
      h += '<div class="sv2-quick-add-item" data-sv2-quick-key="' + E(f.key) + '" style="padding:6px 12px;font-size:12px;cursor:pointer;color:#374151;">' + E(f.label) + '</div>';
    });
    h += '</div></div>';
    return h;
  }

  // ── Sort dropdown ─────────────────────────────────────────────
  function _renderSortDropdown() {
    return '<select class="sv2-select sv2-sort-select" data-sv2-sort style="width:auto;min-width:140px;font-size:12px;padding:4px 24px 4px 8px;">' +
      '<option value="ModificationTimestamp desc">Newest</option>' +
      '<option value="ListPrice desc">Price (High)</option>' +
      '<option value="ListPrice asc">Price (Low)</option>' +
      '<option value="BedroomsTotal desc">Beds (Most)</option>' +
      '<option value="DaysOnMarket asc">DOM (Fewest)</option>' +
      '</select>';
  }

  // ── Main render ───────────────────────────────────────────────
  function render(criteria, containerSel, resultCount) {
    var el = typeof containerSel === 'string' ? document.querySelector(containerSel) : containerSel;
    if (!el) return;

    var h = '<div class="sv2-filter-bar">';

    // Pills row
    h += '<div class="sv2-filter-bar-row">';
    var pillCount = 0;
    var rendered = {};
    Object.keys(criteria).forEach(function(key) {
      if (key === '_tab') return;
      var isMin = key.endsWith('_min');
      var isMax = key.endsWith('_max');
      var baseKey = isMin ? key.slice(0, -4) : isMax ? key.slice(0, -4) : key;
      if (rendered[baseKey]) return;
      rendered[baseKey] = true;

      var pillHtml = _renderPill(key, criteria[key], criteria);
      if (pillHtml) { h += pillHtml; pillCount++; }
    });

    // Quick-add button
    h += _renderQuickAdd(criteria);
    h += '</div>';

    // Actions row: more filters + count + sort
    h += '<div class="sv2-filter-bar-actions">';
    h += '<button type="button" class="sv2-more-filters" data-sv2-more-filters>';
    h += '<i class="fas fa-sliders-h"></i> All Filters</button>';
    if (resultCount !== undefined) {
      h += '<span class="sv2-result-count">' + resultCount.toLocaleString() + ' result' + (resultCount !== 1 ? 's' : '') + '</span>';
    }
    h += _renderSortDropdown();
    h += '</div>';

    h += '</div>';
    el.innerHTML = h;

    // Wire pill remove buttons
    var removeBtns = el.querySelectorAll('[data-sv2-pill-remove]');
    removeBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var key = btn.getAttribute('data-sv2-pill-remove');
        _pillRemoveCallbacks.forEach(function(cb) { cb(key); });
      });
    });

    // Wire quick-add toggle
    var quickToggle = el.querySelector('[data-sv2-quick-toggle]');
    var quickMenu = el.querySelector('.sv2-quick-add-menu');
    if (quickToggle && quickMenu) {
      quickToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        var isOpen = quickMenu.style.display !== 'none';
        quickMenu.style.display = isOpen ? 'none' : 'block';
      });
      // Close on outside click
      document.addEventListener('click', function() {
        if (quickMenu) quickMenu.style.display = 'none';
      });
      // Wire quick-add items
      var qaItems = el.querySelectorAll('[data-sv2-quick-key]');
      qaItems.forEach(function(item) {
        item.addEventListener('mouseenter', function() { item.style.background = '#F3F4F6'; });
        item.addEventListener('mouseleave', function() { item.style.background = ''; });
        item.addEventListener('click', function(e) {
          e.stopPropagation();
          var key = item.getAttribute('data-sv2-quick-key');
          quickMenu.style.display = 'none';
          _quickAddCallbacks.forEach(function(cb) { cb(key); });
        });
      });
    }

    // Wire more filters button
    var moreBtn = el.querySelector('[data-sv2-more-filters]');
    if (moreBtn) {
      moreBtn.addEventListener('click', function() {
        _moreFiltersCallbacks.forEach(function(cb) { cb(); });
      });
    }
  }

  // ── Update result count only (no full re-render) ──────────────
  function updateCount(containerSel, count) {
    var el = typeof containerSel === 'string' ? document.querySelector(containerSel) : containerSel;
    if (!el) return;
    var countEl = el.querySelector('.sv2-result-count');
    if (countEl) {
      countEl.textContent = count.toLocaleString() + ' result' + (count !== 1 ? 's' : '');
    }
  }

  return {
    render: render,
    updateCount: updateCount,
    onPillRemove: function(callback) { _pillRemoveCallbacks.push(callback); },
    onMoreFilters: function(callback) { _moreFiltersCallbacks.push(callback); },
    onQuickAdd: function(callback) { _quickAddCallbacks.push(callback); }
  };
})();
