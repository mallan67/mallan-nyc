// ═══════════════════════════════════════════════════════════════════════════════
// SHARED — Sortable/Filterable Activity Table
// Reusable table with sort, filter, search, click-to-open, and pagination.
// ═══════════════════════════════════════════════════════════════════════════════
/* global Utils, UI */

var ActivityTable = (function () {
  'use strict';

  var E = Utils.esc;
  var D = Utils.formatDate;

  /**
   * Render a sortable, filterable table.
   * @param {Object} opts
   * @param {string} opts.id - unique table ID
   * @param {Array} opts.columns - [{ key, label, width?, render?, sortable? }]
   * @param {Array} opts.rows - data array
   * @param {string} opts.onRowClick - global function name, called with row id
   * @param {string} opts.emptyIcon - FA icon for empty state
   * @param {string} opts.emptyText - text for empty state
   * @param {Object} opts.sort - { key, dir } current sort
   * @param {string} opts.onSort - global function name, called with (key)
   * @param {number} opts.page - current page (1-based)
   * @param {number} opts.pageSize - rows per page (default 25)
   * @param {string} opts.onPage - global function name, called with (page)
   */
  function render(opts) {
    opts = opts || {};
    var id = opts.id || 'at';
    var columns = opts.columns || [];
    var rows = opts.rows || [];
    var sort = opts.sort || {};
    var page = opts.page || 1;
    var pageSize = opts.pageSize || 25;

    // Pagination
    var totalRows = rows.length;
    var totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    if (page > totalPages) page = totalPages;
    var start = (page - 1) * pageSize;
    var pageRows = rows.slice(start, start + pageSize);

    var html = '<div class="data-table" id="' + id + '">';
    html += '<div style="overflow-x:auto;"><table><thead><tr>';

    // Headers
    columns.forEach(function (col) {
      var sortable = col.sortable !== false;
      var isSorted = sort.key === col.key;
      var sortIcon = '';
      if (sortable) {
        sortIcon = isSorted
          ? (sort.dir === 'asc' ? ' <i class="fas fa-sort-up text-gold"></i>' : ' <i class="fas fa-sort-down text-gold"></i>')
          : ' <i class="fas fa-sort text-gray-300"></i>';
      }
      var clickAttr = sortable && opts.onSort
        ? ' style="cursor:pointer" onclick="' + opts.onSort + '(\'' + E(col.key) + '\')"'
        : '';
      html += '<th' + (col.width ? ' style="width:' + col.width + '"' : '') + clickAttr + '>' +
        E(col.label || col.key) + sortIcon + '</th>';
    });
    html += '</tr></thead><tbody>';

    if (pageRows.length === 0) {
      html += '<tr><td colspan="' + columns.length + '" class="text-center py-12">' +
        '<div class="text-gray-400">' +
          '<i class="fas ' + (opts.emptyIcon || 'fa-inbox') + ' text-3xl mb-3"></i>' +
          '<p class="text-sm">' + E(opts.emptyText || 'No records found') + '</p>' +
        '</div>' +
      '</td></tr>';
    } else {
      pageRows.forEach(function (row) {
        var rowId = row.id || row._id || '';
        var clickAttr = opts.onRowClick
          ? ' class="clickable" onclick="' + opts.onRowClick + '(\'' + E(String(rowId)) + '\')"'
          : '';
        html += '<tr' + clickAttr + '>';
        columns.forEach(function (col) {
          var val = col.render ? col.render(row) : E(String(row[col.key] || ''));
          html += '<td>' + val + '</td>';
        });
        html += '</tr>';
      });
    }

    html += '</tbody></table></div>';

    // Pagination footer
    if (totalRows > pageSize) {
      html += '<div class="flex items-center justify-between px-4 py-3 border-t border-gray-100">' +
        '<span class="text-xs text-gray-500">' + totalRows + ' total</span>' +
        '<div class="flex items-center gap-1">' +
          '<button class="btn btn-sm btn-outline" ' + (page <= 1 ? 'disabled' : '') +
            (opts.onPage ? ' onclick="' + opts.onPage + '(' + (page - 1) + ')"' : '') + '>Prev</button>' +
          '<span class="text-xs text-gray-500 px-2">' + page + ' / ' + totalPages + '</span>' +
          '<button class="btn btn-sm btn-outline" ' + (page >= totalPages ? 'disabled' : '') +
            (opts.onPage ? ' onclick="' + opts.onPage + '(' + (page + 1) + ')"' : '') + '>Next</button>' +
        '</div>' +
      '</div>';
    }

    html += '</div>';
    return html;
  }

  /**
   * Sort an array of objects by key + direction.
   */
  function sortRows(rows, key, dir) {
    if (!key) return rows;
    var d = dir === 'asc' ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (av == null) return d;
      if (bv == null) return -d;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * d;
      return String(av).localeCompare(String(bv)) * d;
    });
  }

  /**
   * Filter rows by search query across all string fields.
   */
  function filterRows(rows, query) {
    if (!query) return rows;
    var q = query.toLowerCase();
    return rows.filter(function (row) {
      return Object.keys(row).some(function (k) {
        var v = row[k];
        return typeof v === 'string' && v.toLowerCase().indexOf(q) !== -1;
      });
    });
  }

  return {
    render: render,
    sortRows: sortRows,
    filterRows: filterRows,
  };
})();
