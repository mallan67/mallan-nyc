// ═══════════════════════════════════════════════════════════════════════════════
// SHARED — Filter Bar + Search + Quick Actions
// Reusable top row: [Search] [Filter chips] [Quick Action buttons]
// ═══════════════════════════════════════════════════════════════════════════════
/* global Utils, UI */

var FilterBar = (function () {
  'use strict';

  var E = Utils.esc;

  /**
   * Render a filter bar with search, filter chips, and quick actions.
   * @param {Object} opts
   * @param {string} opts.id - unique ID prefix
   * @param {string} opts.placeholder - search placeholder
   * @param {Array} opts.filters - [{ key, label, options: [{value,label}], active }]
   * @param {Array} opts.quickActions - [{ label, icon, onclick, cls }]
   * @param {string} opts.onSearch - global function name called with (query)
   * @param {string} opts.onFilter - global function name called with (key, value)
   */
  function render(opts) {
    opts = opts || {};
    var id = opts.id || 'fb';

    var html = '<div class="flex flex-col sm:flex-row gap-3 mb-4">';

    // Search
    html += '<div class="relative flex-1">' +
      '<i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>' +
      '<input id="' + id + '_search" type="text" placeholder="' + E(opts.placeholder || 'Search...') + '" ' +
        'class="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"' +
        (opts.onSearch ? ' oninput="' + opts.onSearch + '(this.value)"' : '') + '>' +
    '</div>';

    // Filter chips
    if (opts.filters && opts.filters.length > 0) {
      html += '<div class="flex items-center gap-2 flex-wrap">';
      opts.filters.forEach(function (f) {
        if (f.options && f.options.length > 0) {
          html += '<select id="' + id + '_filter_' + f.key + '" ' +
            'class="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-gold/30 focus:outline-none"' +
            (opts.onFilter ? ' onchange="' + opts.onFilter + '(\'' + E(f.key) + '\', this.value)"' : '') + '>';
          html += '<option value="">' + E(f.label) + '</option>';
          f.options.forEach(function (o) {
            var sel = f.active === o.value ? ' selected' : '';
            html += '<option value="' + E(o.value) + '"' + sel + '>' + E(o.label) + '</option>';
          });
          html += '</select>';
        }
      });
      html += '</div>';
    }

    // Quick actions
    if (opts.quickActions && opts.quickActions.length > 0) {
      html += '<div class="flex items-center gap-2">';
      opts.quickActions.forEach(function (a) {
        html += '<button class="' + (a.cls || 'btn btn-sm btn-gold') + '" onclick="' + E(a.onclick || '') + '">' +
          (a.icon ? '<i class="fas ' + a.icon + ' mr-1"></i>' : '') + E(a.label) +
        '</button>';
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  /**
   * Get current search query from a filter bar.
   */
  function getSearch(id) {
    var el = document.getElementById((id || 'fb') + '_search');
    return el ? el.value.trim().toLowerCase() : '';
  }

  /**
   * Get current filter value.
   */
  function getFilter(id, key) {
    var el = document.getElementById((id || 'fb') + '_filter_' + key);
    return el ? el.value : '';
  }

  return {
    render: render,
    getSearch: getSearch,
    getFilter: getFilter,
  };
})();
