// ═══════════════════════════════════════════════════════════════
// FORM RENDERER — Generates the full search form from registry
// Sections, widgets, tabs — all driven by search-registry.json
// ═══════════════════════════════════════════════════════════════
var SearchForm = (function() {
  'use strict';

  var _currentTab = 'sale';
  var _container = null;
  var _onSearch = null;
  var _onClear = null;

  var TABS = [
    { key: 'sale', label: 'Sales' },
    { key: 'rent', label: 'Rentals' },
    { key: 'building', label: 'Buildings' }
  ];

  function E(s) { return WidgetRenderers.escapeHtml(s); }

  // ── Tab bar ───────────────────────────────────────────────────
  function _renderTabs(activeTab) {
    var h = '<div class="sv2-tabs">';
    TABS.forEach(function(t) {
      var cls = 'sv2-tab' + (t.key === activeTab ? ' sv2-active' : '');
      h += '<button type="button" class="' + cls + '" data-sv2-tab="' + E(t.key) + '">' + E(t.label) + '</button>';
    });
    h += '</div>';
    return h;
  }

  // ── Section wrapper ───────────────────────────────────────────
  function _renderSection(section, fields) {
    var openCls = section.collapsed === false ? ' sv2-open' : '';
    // Count fields with active values (for badge — set after render)
    var h = '<div class="sv2-section' + openCls + '" data-sv2-section="' + E(section.key) + '">';
    h += '<div class="sv2-section-header">';
    h += '<span>';
    if (section.icon) h += '<i class="fas ' + E(section.icon) + ' sv2-section-icon"></i>';
    h += E(section.label);
    h += '<span class="sv2-section-badge" style="display:none" data-sv2-badge="' + E(section.key) + '"></span>';
    h += '</span>';
    h += '<i class="fas fa-chevron-down sv2-section-chevron"></i>';
    h += '</div>';
    h += '<div class="sv2-section-body">';
    fields.forEach(function(field) {
      h += WidgetRenderers.render(field);
    });
    h += '</div></div>';
    return h;
  }

  // ── Wire section toggle ───────────────────────────────────────
  function _wireSectionToggles(container) {
    var headers = container.querySelectorAll('.sv2-section-header');
    headers.forEach(function(header) {
      header.addEventListener('click', function() {
        var section = header.closest('.sv2-section');
        if (section) section.classList.toggle('sv2-open');
      });
    });
  }

  // ── Wire tab clicks ───────────────────────────────────────────
  function _wireTabClicks(container) {
    var tabs = container.querySelectorAll('[data-sv2-tab]');
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        var newTab = tab.getAttribute('data-sv2-tab');
        if (newTab && newTab !== _currentTab) {
          _currentTab = newTab;
          render({ tab: _currentTab, container: _container, onSearch: _onSearch, onClear: _onClear });
        }
      });
    });
  }

  // ── Wire custom range-select show/hide ────────────────────────
  function _wireCustomRows(container) {
    var selects = container.querySelectorAll('.sv2-select');
    selects.forEach(function(sel) {
      sel.addEventListener('change', function() {
        var id = sel.id || '';
        // Check if this is a min/max range select with custom option
        var baseKey = id.replace(/-min$/, '').replace(/-max$/, '');
        var customRow = container.querySelector('#' + baseKey + '-custom-row');
        if (!customRow) return;
        var minSel = container.querySelector('#' + baseKey + '-min');
        var maxSel = container.querySelector('#' + baseKey + '-max');
        var showCustom = (minSel && minSel.value === 'custom') || (maxSel && maxSel.value === 'custom');
        customRow.classList.toggle('sv2-visible', showCustom);
      });
    });
  }

  // ── Wire date presets ─────────────────────────────────────────
  function _wireDatePresets(container) {
    var presetBtns = container.querySelectorAll('.sv2-preset-btn');
    presetBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var drpKey = btn.getAttribute('data-drp');
        if (!drpKey) return;
        // Toggle active state
        var siblings = container.querySelectorAll('[data-drp="' + drpKey + '"]');
        siblings.forEach(function(s) { s.classList.remove('sv2-active'); });
        btn.classList.add('sv2-active');
        // Calculate date from preset
        var preset = btn.getAttribute('data-preset');
        var fromEl = container.querySelector('#' + drpKey + '-from');
        var toEl = container.querySelector('#' + drpKey + '-to');
        if (!fromEl || !toEl || !preset) return;
        var now = new Date();
        var from = new Date();
        toEl.value = now.toISOString().split('T')[0];
        switch (preset) {
          case '7d': from.setDate(now.getDate() - 7); break;
          case '30d': from.setDate(now.getDate() - 30); break;
          case '90d': from.setDate(now.getDate() - 90); break;
          case '6m': from.setMonth(now.getMonth() - 6); break;
          case '1y': from.setFullYear(now.getFullYear() - 1); break;
          default: return;
        }
        fromEl.value = from.toISOString().split('T')[0];
      });
    });
  }

  // ── Render full form ──────────────────────────────────────────
  function render(options) {
    options = options || {};
    var tab = options.tab || _currentTab;
    var containerSel = options.container || _container;
    var onSearch = options.onSearch || _onSearch;
    var onClear = options.onClear || _onClear;

    _currentTab = tab;
    _container = containerSel;
    _onSearch = onSearch;
    _onClear = onClear;

    var el = typeof containerSel === 'string' ? document.querySelector(containerSel) : containerSel;
    if (!el) { console.error('[SearchForm] Container not found:', containerSel); return; }

    var sections = SearchRegistry.getSectionsForTab(tab);
    var h = '';

    // Tab bar
    h += _renderTabs(tab);

    // Sections
    sections.forEach(function(sec) {
      var fields = SearchRegistry.getFieldsForSection(sec.key).filter(function(f) {
        var tabs = f.tabs || ['sale', 'rent', 'building'];
        return tabs.indexOf(tab) !== -1;
      });
      if (fields.length > 0) {
        h += _renderSection(sec, fields);
      }
    });

    // Action buttons
    h += '<div class="sv2-form-actions" style="display:flex;gap:8px;padding:12px 0;">';
    h += '<button type="button" class="sv2-btn-search" style="flex:1;padding:10px 20px;background:#111827;color:white;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;">';
    h += '<i class="fas fa-search" style="margin-right:6px;"></i>Search</button>';
    h += '<button type="button" class="sv2-btn-clear" style="padding:10px 16px;background:#F3F4F6;color:#374151;border:1px solid #D1D5DB;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;">';
    h += '<i class="fas fa-times" style="margin-right:4px;"></i>Clear</button>';
    h += '</div>';

    el.innerHTML = h;

    // Wire interactions
    _wireSectionToggles(el);
    _wireTabClicks(el);
    _wireCustomRows(el);
    _wireDatePresets(el);

    // Wire search button
    var searchBtn = el.querySelector('.sv2-btn-search');
    if (searchBtn && onSearch) {
      searchBtn.addEventListener('click', function() { onSearch(_currentTab); });
    }

    // Wire clear button
    var clearBtn = el.querySelector('.sv2-btn-clear');
    if (clearBtn && onClear) {
      clearBtn.addEventListener('click', function() { onClear(); });
    }

    return el;
  }

  // ── Populate form from criteria ────────────────────────────────
  function populateFromCriteria(criteria, containerSel) {
    var container = typeof containerSel === 'string' ? document.querySelector(containerSel) : (containerSel || document);
    if (!container || !criteria) return;

    Object.keys(criteria).forEach(function(ck) {
      if (ck === '_tab') return;
      var val = criteria[ck];
      if (val === null || val === undefined) return;

      var isMin = ck.endsWith('_min');
      var isMax = ck.endsWith('_max');
      var baseKey = isMin ? ck.slice(0, -4) : isMax ? ck.slice(0, -4) : ck;
      var field = SearchRegistry.getField(baseKey);
      if (!field) return;

      switch (field.widget) {
        case 'range-select':
          var suffix = isMin ? '-min' : isMax ? '-max' : null;
          if (suffix) {
            var selEl = container.querySelector('#' + baseKey + suffix);
            if (selEl) {
              // Try to match an option value
              var matched = false;
              for (var i = 0; i < selEl.options.length; i++) {
                if (selEl.options[i].value === String(val)) { selEl.value = String(val); matched = true; break; }
              }
              // If no match, check for custom option
              if (!matched) {
                for (var j = 0; j < selEl.options.length; j++) {
                  if (selEl.options[j].value === 'custom') { selEl.value = 'custom'; break; }
                }
                var customEl = container.querySelector('#' + baseKey + '-custom' + suffix);
                if (customEl) customEl.value = val;
                var customRow = container.querySelector('#' + baseKey + '-custom-row');
                if (customRow) customRow.classList.add('sv2-visible');
              }
            }
          }
          break;

        case 'number-range':
          var nSuffix = isMin ? '-min' : isMax ? '-max' : null;
          if (nSuffix) {
            var nEl = container.querySelector('#' + baseKey + nSuffix);
            if (nEl) nEl.value = val;
          }
          break;

        case 'date-range':
          if (isMin) {
            var fromEl = container.querySelector('#' + baseKey + '-from');
            if (fromEl) fromEl.value = val;
          } else if (isMax) {
            var toEl = container.querySelector('#' + baseKey + '-to');
            if (toEl) toEl.value = val;
          }
          break;

        case 'checkbox-group':
          if (Array.isArray(val)) {
            val.forEach(function(v) {
              var cb = container.querySelector('[data-field="' + baseKey + '"][data-value="' + v + '"]');
              if (cb) cb.checked = true;
            });
          }
          break;

        case 'boolean':
          var boolEl = container.querySelector('#' + baseKey);
          if (boolEl && val) boolEl.checked = true;
          break;

        case 'text':
          var txtEl = container.querySelector('#' + baseKey);
          if (txtEl) txtEl.value = val;
          break;

        case 'select':
          var sEl = container.querySelector('#' + baseKey);
          if (sEl) sEl.value = String(val);
          break;

        case 'radio-group':
          var rEl = container.querySelector('[data-field="' + baseKey + '"][value="' + val + '"]');
          if (rEl) rEl.checked = true;
          break;
      }
    });
  }

  // ── Clear form ─────────────────────────────────────────────────
  function clear(containerSel) {
    var container = typeof containerSel === 'string' ? document.querySelector(containerSel) : (containerSel || document);
    if (!container) return;

    // Clear all inputs
    var inputs = container.querySelectorAll('.sv2-input');
    inputs.forEach(function(el) { el.value = ''; });

    // Reset all selects
    var selects = container.querySelectorAll('.sv2-select');
    selects.forEach(function(el) { el.selectedIndex = 0; });

    // Uncheck all checkboxes (except defaults)
    var checkboxes = container.querySelectorAll('.sv2-cb');
    checkboxes.forEach(function(el) { el.checked = false; });

    // Re-check defaults
    var fields = SearchRegistry.getSearchableFields(_currentTab);
    fields.forEach(function(field) {
      if (field.widget === 'checkbox-group' && field.options) {
        field.options.forEach(function(o) {
          if (o.checked_default) {
            var cb = container.querySelector('[data-field="' + field.key + '"][data-value="' + o.value + '"]');
            if (cb) cb.checked = true;
          }
        });
      }
    });

    // Hide custom rows
    var customRows = container.querySelectorAll('.sv2-custom-row');
    customRows.forEach(function(el) { el.classList.remove('sv2-visible'); });

    // Deactivate date presets
    var presets = container.querySelectorAll('.sv2-preset-btn');
    presets.forEach(function(el) { el.classList.remove('sv2-active'); });

    // Clear radios
    var radios = container.querySelectorAll('.sv2-radio-group input[type="radio"]');
    radios.forEach(function(el) { el.checked = false; });
  }

  // ── Get current tab ────────────────────────────────────────────
  function getCurrentTab() { return _currentTab; }

  return {
    render: render,
    populateFromCriteria: populateFromCriteria,
    clear: clear,
    getCurrentTab: getCurrentTab
  };
})();
