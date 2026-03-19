// ═══════════════════════════════════════════════════════════════════════════════
// CRM UI COMPONENTS — Reusable HTML generators
// Stat cards, data tables, kanban, timelines, forms, badges, listing cards
// ═══════════════════════════════════════════════════════════════════════════════
/* global Utils */

var UI = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  // ─── Stat Card ───────────────────────────────────────────────────────
  function statCard(value, label, icon, color) {
    color = color || '#B8860B';
    return '<div class="stat-card">' +
      '<div class="stat-card-icon" style="background:' + color + '15;color:' + color + '"><i class="fas ' + icon + '"></i></div>' +
      '<div class="stat-card-value">' + E(String(value)) + '</div>' +
      '<div class="stat-card-label">' + E(label) + '</div>' +
    '</div>';
  }

  function statGrid(cards) {
    return '<div class="stat-grid">' + cards.join('') + '</div>';
  }

  // ─── Card ────────────────────────────────────────────────────────────
  function card(title, body, actions) {
    return '<div class="card">' +
      '<div class="card-header"><h3>' + E(title) + '</h3>' +
        (actions ? '<div class="flex gap-2">' + actions + '</div>' : '') +
      '</div>' +
      '<div class="card-body">' + body + '</div>' +
    '</div>';
  }

  function simpleCard(content, cls) {
    return '<div class="card ' + (cls || '') + '">' + content + '</div>';
  }

  // ─── Data Table ──────────────────────────────────────────────────────
  function dataTable(columns, rows, opts) {
    opts = opts || {};
    var html = '<div class="data-table">';

    // Header with optional actions
    if (opts.title || opts.actions) {
      html += '<div class="card-header">';
      html += '<h3>' + E(opts.title || '') + '</h3>';
      if (opts.actions) html += '<div class="flex gap-2">' + opts.actions + '</div>';
      html += '</div>';
    }

    html += '<div style="overflow-x:auto;"><table><thead><tr>';
    columns.forEach(function (col) {
      html += '<th' + (col.width ? ' style="width:' + col.width + '"' : '') + '>' + E(col.label || col.key) + '</th>';
    });
    html += '</tr></thead><tbody>';

    if (!rows || rows.length === 0) {
      html += '<tr><td colspan="' + columns.length + '" class="text-center py-8 text-gray-400 text-sm">No data</td></tr>';
    } else {
      rows.forEach(function (row, idx) {
        var clickAttr = opts.onRowClick ? ' class="clickable" onclick="' + opts.onRowClick + '(\'' + E(row.id || idx) + '\')"' : '';
        html += '<tr' + clickAttr + '>';
        columns.forEach(function (col) {
          var val = col.render ? col.render(row) : E(row[col.key]);
          html += '<td>' + val + '</td>';
        });
        html += '</tr>';
      });
    }

    html += '</tbody></table></div>';

    // Pagination
    if (opts.total && opts.total > (opts.limit || 25)) {
      var page = opts.page || 1;
      var totalPages = Math.ceil(opts.total / (opts.limit || 25));
      html += '<div class="flex items-center justify-between px-4 py-3 border-t border-gray-100">' +
        '<span class="text-xs text-gray-500">' + opts.total + ' total</span>' +
        '<div class="flex gap-1">' +
          '<button class="btn btn-sm btn-outline" ' + (page <= 1 ? 'disabled' : '') + ' onclick="' + (opts.onPage || 'void') + '(' + (page - 1) + ')">Prev</button>' +
          '<span class="text-xs text-gray-500 px-2 py-1">' + page + ' / ' + totalPages + '</span>' +
          '<button class="btn btn-sm btn-outline" ' + (page >= totalPages ? 'disabled' : '') + ' onclick="' + (opts.onPage || 'void') + '(' + (page + 1) + ')">Next</button>' +
        '</div>' +
      '</div>';
    }

    html += '</div>';
    return html;
  }

  // ─── Kanban Board ────────────────────────────────────────────────────
  function kanbanBoard(columns) {
    var html = '<div class="kanban-board">';
    columns.forEach(function (col) {
      var count = col.items ? col.items.length : 0;
      html += '<div class="kanban-col">' +
        '<div class="kanban-col-header" style="border-color:' + (col.color || '#6b7280') + '">' +
          '<span class="kanban-col-title" style="color:' + (col.color || '#6b7280') + '">' + E(col.title) + '</span>' +
          '<span class="kanban-col-count" style="background:' + (col.color || '#6b7280') + '">' + count + '</span>' +
        '</div>' +
        '<div class="kanban-col-body">';
      if (col.items && col.items.length > 0) {
        col.items.forEach(function (item) {
          html += item; // Pre-rendered card HTML
        });
      } else {
        html += '<div class="text-center text-xs text-gray-400 py-6">No items</div>';
      }
      html += '</div></div>';
    });
    html += '</div>';
    return html;
  }

  function kanbanCard(name, subtitle, badge, onclick) {
    return '<div class="kanban-card" onclick="' + (onclick || '') + '">' +
      '<div class="flex items-center justify-between mb-1">' +
        '<span class="text-sm font-semibold text-gray-900 truncate">' + E(name) + '</span>' +
        (badge || '') +
      '</div>' +
      (subtitle ? '<p class="text-xs text-gray-500">' + E(subtitle) + '</p>' : '') +
    '</div>';
  }

  // ─── Timeline ────────────────────────────────────────────────────────
  function timeline(items) {
    if (!items || items.length === 0) {
      return '<div class="empty-state"><i class="fas fa-stream"></i><p>No activity yet</p></div>';
    }
    var html = '<div class="timeline">';
    items.forEach(function (item) {
      html += '<div class="timeline-item">' +
        '<div class="timeline-dot ' + (item.dotClass || '') + '"></div>' +
        '<div>' +
          '<p class="text-sm font-medium text-gray-900">' + E(item.title || '') + '</p>' +
          (item.description ? '<p class="text-xs text-gray-500 mt-0.5">' + E(item.description) + '</p>' : '') +
          '<p class="text-xs text-gray-400 mt-1">' + E(item.time || '') + '</p>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';
    return html;
  }

  // ─── Badges ──────────────────────────────────────────────────────────
  function badge(text, type) {
    type = type || 'default';
    return '<span class="badge badge-' + type + '">' + E(text) + '</span>';
  }

  function roleBadge(role) {
    return '<span class="badge badge-' + (role || 'buyer') + '">' + E(role || 'buyer') + '</span>';
  }

  function statusBadge(status) {
    return '<span class="badge badge-' + (status || 'active') + '">' + E(status || 'active') + '</span>';
  }

  function stageBadge(stage) {
    var colors = {
      new: '#6b7280', contacted: '#3b82f6', nurturing: '#8b5cf6',
      prospect: '#6b7280',
      active: '#059669', active_seller: '#059669', active_buyer: '#059669',
      active_landlord: '#059669', active_renter: '#059669',
      showing: '#f59e0b', offer: '#f97316',
      deal: '#10b981', closed: '#059669', past: '#9ca3af',
      viewed_not_rent: '#f97316', current_tenant: '#3b82f6',
    };
    var c = colors[stage] || '#6b7280';
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;font-size:10px;font-weight:700;border-radius:6px;background:' + c + '15;color:' + c + ';text-transform:uppercase;">' + E(stage || 'new') + '</span>';
  }

  function severityBadge(severity) {
    var colors = { urgent: '#DC2626', warning: '#F59E0B', info: '#3B82F6' };
    var c = colors[severity] || '#6b7280';
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;font-size:10px;font-weight:700;border-radius:6px;background:' + c + '15;color:' + c + ';text-transform:uppercase;">' + E(severity || 'info') + '</span>';
  }

  // ─── Listing Card ────────────────────────────────────────────────────
  function listingCard(listing, onclick) {
    var photo = '';
    if (listing.photos && listing.photos.length) photo = Utils.photoUrl(listing.photos[0].url || listing.photos[0]);
    if (listing.Media && listing.Media.length) photo = Utils.photoUrl(listing.Media[0].MediaURL);
    var address = listing.InternetAddressDisplayYN === false ? 'Address Upon Request' : (listing.address || listing.UnparsedAddress || 'No address');
    var price = listing.ListPrice || listing.price || listing.list_price;

    return '<div class="listing-card" onclick="' + (onclick || '') + '">' +
      (photo ? '<img src="' + E(photo) + '" class="listing-card-photo" alt="Property" onerror="this.style.display=\'none\'">' :
        '<div class="listing-card-photo flex items-center justify-center"><i class="fas fa-image text-xl text-gray-300"></i></div>') +
      '<div class="listing-card-info">' +
        '<div class="listing-card-price">' + $(price) + '</div>' +
        '<div class="listing-card-address">' + E(address) + '</div>' +
        '<div class="listing-card-details">' +
          '<span>' + (listing.BedroomsTotal || listing.beds || '-') + ' bd</span>' +
          '<span>' + (listing.BathroomsTotalInteger || listing.baths || '-') + ' ba</span>' +
          (listing.LivingArea || listing.sqft ? '<span>' + Number(listing.LivingArea || listing.sqft).toLocaleString() + ' sqft</span>' : '') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ─── Empty State ─────────────────────────────────────────────────────
  function emptyState(icon, message, action) {
    return '<div class="empty-state">' +
      '<i class="fas ' + icon + '"></i>' +
      '<p>' + E(message) + '</p>' +
      (action || '') +
    '</div>';
  }

  // ─── Loading ─────────────────────────────────────────────────────────
  function loading() {
    return '<div class="flex items-center justify-center h-32"><i class="fas fa-spinner fa-spin text-xl text-gold"></i></div>';
  }

  // ─── Section Header ──────────────────────────────────────────────────
  function sectionHeader(title, subtitle, actions) {
    return '<div class="flex items-center justify-between mb-4">' +
      '<div>' +
        '<h2 class="text-lg font-bold text-gray-900">' + E(title) + '</h2>' +
        (subtitle ? '<p class="text-sm text-gray-500">' + E(subtitle) + '</p>' : '') +
      '</div>' +
      (actions ? '<div class="flex gap-2">' + actions + '</div>' : '') +
    '</div>';
  }

  // ─── Tabs ────────────────────────────────────────────────────────────
  function tabs(items, activeId, onclick) {
    var html = '<div class="workspace-tabs">';
    items.forEach(function (item) {
      html += '<button class="workspace-tab' + (item.id === activeId ? ' active' : '') + '" onclick="' + onclick + '(\'' + item.id + '\')">' +
        (item.icon ? '<i class="fas ' + item.icon + ' mr-1.5 text-[10px]"></i>' : '') +
        E(item.label) +
      '</button>';
    });
    html += '</div>';
    return html;
  }

  // ─── Avatar ──────────────────────────────────────────────────────────
  function avatar(name, size) {
    size = size || 32;
    var init = Utils.initials(name);
    return '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:8px;background:#374151;display:flex;align-items:center;justify-content:center;color:#B8860B;font-weight:700;font-size:' + (size * 0.38) + 'px;flex-shrink:0;">' + E(init) + '</div>';
  }

  // ─── Button helpers ──────────────────────────────────────────────────
  function btn(label, opts) {
    opts = opts || {};
    var cls = 'btn ' + (opts.cls || 'btn-outline');
    var icon = opts.icon ? '<i class="fas ' + opts.icon + '"></i> ' : '';
    var onclick = opts.onclick ? ' onclick="' + opts.onclick + '"' : '';
    return '<button class="' + cls + '"' + onclick + '>' + icon + E(label) + '</button>';
  }

  function btnSm(label, opts) {
    opts = opts || {};
    opts.cls = (opts.cls || 'btn-outline') + ' btn-sm';
    return btn(label, opts);
  }

  // ─── Alert item ──────────────────────────────────────────────────────
  function alertItem(alert) {
    var colors = { urgent: '#DC2626', warning: '#F59E0B', info: '#3B82F6' };
    var icons = { urgent: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    var c = colors[alert.severity] || '#3B82F6';
    var icon = icons[alert.severity] || 'fa-info-circle';

    return '<div class="flex gap-3 p-3 rounded-lg border" style="border-color:' + c + '30;background:' + c + '08">' +
      '<div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style="background:' + c + '15">' +
        '<i class="fas ' + icon + ' text-xs" style="color:' + c + '"></i>' +
      '</div>' +
      '<div class="flex-1 min-w-0">' +
        '<p class="text-sm font-medium text-gray-900">' + E(alert.title) + '</p>' +
        (alert.description ? '<p class="text-xs text-gray-500 mt-0.5">' + E(alert.description) + '</p>' : '') +
        '<p class="text-xs text-gray-400 mt-1">' + Utils.formatTimeAgo(alert.createdAt) + '</p>' +
      '</div>' +
      '<div class="flex gap-1 flex-shrink-0">' +
        (alert.actionUrl ? '<button class="btn btn-sm btn-outline" onclick="Router.navigate(\'' + E(alert.actionUrl) + '\')">View</button>' : '') +
        '<button class="btn btn-sm btn-outline" onclick="Alerts.resolve(\'' + E(alert.id) + '\');CRM.refreshAlerts()"><i class="fas fa-check"></i></button>' +
      '</div>' +
    '</div>';
  }

  return {
    statCard: statCard,
    statGrid: statGrid,
    card: card,
    simpleCard: simpleCard,
    dataTable: dataTable,
    kanbanBoard: kanbanBoard,
    kanbanCard: kanbanCard,
    timeline: timeline,
    badge: badge,
    roleBadge: roleBadge,
    statusBadge: statusBadge,
    stageBadge: stageBadge,
    severityBadge: severityBadge,
    listingCard: listingCard,
    emptyState: emptyState,
    loading: loading,
    sectionHeader: sectionHeader,
    tabs: tabs,
    avatar: avatar,
    btn: btn,
    btnSm: btnSm,
    alertItem: alertItem,
  };
})();
