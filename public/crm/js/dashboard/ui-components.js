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
  // Title accepts HTML (typically a Font Awesome icon + label) — callers in
  // panels.js pass strings like
  //   '<i class="fas fa-user-circle text-gold mr-2"></i>Public Profile'
  // and expect the icon to render. Earlier this called `E(title)` which
  // escaped the markup and surfaced the raw HTML on the page. All 10 call
  // sites across the dashboard (surveyed 2026-05-01) pass developer-authored
  // constant strings — no user input — so allowing HTML here is safe.
  function card(title, body, actions) {
    return '<div class="card">' +
      '<div class="card-header"><h3>' + title + '</h3>' +
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

  // A LISTING WITH NO MARKET STATUS IS NOT ACTIVE.
  //
  // This fell back to 'active' for any absent status. That was invisible while
  // listings.status was NOT NULL DEFAULT 'Active'; now that the column is
  // nullable, EVERY Mallan-authored listing that is not on the market yet
  // arrives here with no status - and every one of them was being badged green
  // "active" to the broker who just created it.
  //
  // 'Draft' is the same word legacy rows still store for this state, so a NULL
  // row and a legacy 'Draft' row render identically. No backfill is authorized,
  // and this is what makes that safe.
  function statusBadge(status) {
    var s = status || 'Draft';
    return '<span class="badge badge-' + s + '">' + E(s) + '</span>';
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

  // ─── Score Indicator (circular arc for conviction/buyer potential) ────
  function scoreIndicator(value, max, color) {
    max = max || 100;
    var pct = Math.min(100, Math.round((value / max) * 100));
    color = color || (pct >= 70 ? '#059669' : pct >= 40 ? '#F59E0B' : '#9CA3AF');
    var r = 16, cx = 18, cy = 18, stroke = 4;
    var circ = 2 * Math.PI * r;
    var offset = circ - (pct / 100) * circ;
    return '<div class="score-indicator" style="width:36px;height:36px;position:relative;display:inline-flex;align-items:center;justify-content:center;">' +
      '<svg width="36" height="36" style="transform:rotate(-90deg)">' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#f3f4f6" stroke-width="' + stroke + '"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + stroke + '" stroke-dasharray="' + circ + '" stroke-dashoffset="' + offset + '" stroke-linecap="round"/>' +
      '</svg>' +
      '<span style="position:absolute;font-size:10px;font-weight:800;color:' + color + '">' + value + '</span>' +
    '</div>';
  }

  // ─── Toggle Switch ───────────────────────────────────────────────────
  function toggleSwitch(on, onclick) {
    var bg = on ? '#059669' : '#d1d5db';
    var dot = on ? 'translateX(16px)' : 'translateX(0)';
    return '<button class="toggle-switch" onclick="' + (onclick || '') + '" style="width:36px;height:20px;border-radius:10px;background:' + bg + ';border:none;cursor:pointer;position:relative;transition:background 0.2s;padding:0;">' +
      '<span style="display:block;width:16px;height:16px;border-radius:50%;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.2);position:absolute;top:2px;left:2px;transition:transform 0.2s;transform:' + dot + '"></span>' +
    '</button>';
  }

  // ─── Progress Dots (outreach 30/60/90 tracking) ──────────────────────
  function progressDots(items) {
    // items: [{ done: true, overdue: false, label: '30d' }, ...]
    var html = '<div style="display:flex;gap:6px;align-items:center;">';
    items.forEach(function(item) {
      var color = item.done ? '#059669' : item.overdue ? '#DC2626' : '#d1d5db';
      var icon = item.done ? 'fa-check' : item.overdue ? 'fa-clock' : 'fa-circle';
      html += '<div title="' + E(item.label || '') + '" style="width:20px;height:20px;border-radius:50%;background:' + color + '20;display:flex;align-items:center;justify-content:center;">' +
        '<i class="fas ' + icon + '" style="font-size:8px;color:' + color + '"></i></div>';
    });
    html += '</div>';
    return html;
  }

  // ─── Date Badge (color-coded urgency) ────────────────────────────────
  function dateBadge(dateStr, opts) {
    if (!dateStr) return '<span class="text-gray-400">-</span>';
    opts = opts || {};
    var d = new Date(dateStr);
    var now = new Date();
    var diff = Math.floor((d.getTime() - now.getTime()) / 86400000);
    var color = '#6b7280';
    if (opts.urgency === 'lease') {
      color = diff <= 30 ? '#DC2626' : diff <= 90 ? '#F59E0B' : '#059669';
    } else if (opts.urgency === 'overdue') {
      color = diff < 0 ? '#DC2626' : diff <= 7 ? '#F59E0B' : '#059669';
    }
    var pulse = (opts.urgency === 'lease' && diff <= 30) ? 'animation:pulse 2s infinite;' : '';
    return '<span style="font-size:12px;font-weight:700;color:' + color + ';' + pulse + '">' + D(dateStr) + '</span>';
  }

  // ─── Conviction/Score Bar ────────────────────────────────────────────
  function scoreBar(value, max, label) {
    max = max || 100;
    var pct = Math.min(100, Math.round((value / max) * 100));
    var color = pct >= 70 ? '#059669' : pct >= 40 ? '#F59E0B' : '#DC2626';
    return '<div style="display:flex;align-items:center;gap:8px;">' +
      '<div style="flex:1;height:6px;background:#f3f4f6;border-radius:3px;overflow:hidden;">' +
        '<div style="width:' + pct + '%;height:100%;background:' + color + ';border-radius:3px;transition:width 0.3s;"></div>' +
      '</div>' +
      '<span style="font-size:11px;font-weight:800;color:' + color + ';min-width:28px;text-align:right;">' + value + '</span>' +
    '</div>';
  }

  // ─── Row Action Buttons ──────────────────────────────────────────────
  function rowActions(actions) {
    var html = '<div class="row-actions" style="display:flex;gap:4px;justify-content:flex-end;" onclick="event.stopPropagation()">';
    actions.forEach(function(a) {
      html += '<button class="row-action-btn" title="' + E(a.title || '') + '" onclick="' + (a.onclick || '') + '" style="width:28px;height:28px;border-radius:6px;border:1px solid #e5e7eb;background:white;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;color:#6b7280;">' +
        '<i class="fas ' + a.icon + '" style="font-size:11px;"></i></button>';
    });
    html += '</div>';
    return html;
  }

  // ─── Calculator Card ─────────────────────────────────────────────────
  function calculatorCard(opts) {
    // opts: { id, title, icon, color, inputs: [{id,label,type,placeholder,prefix,suffix}], computeFn, outputs: [{id,label}] }
    var color = opts.color || '#B8860B';
    var html = '<div class="card" id="calc_' + E(opts.id) + '">' +
      '<div class="card-header" style="background:' + color + '08;border-bottom-color:' + color + '20;">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<div style="width:36px;height:36px;border-radius:8px;background:' + color + '15;display:flex;align-items:center;justify-content:center;">' +
            '<i class="fas ' + (opts.icon || 'fa-calculator') + '" style="color:' + color + ';font-size:14px;"></i></div>' +
          '<h3 style="margin:0;font-size:14px;font-weight:700;color:#111827;">' + E(opts.title) + '</h3>' +
        '</div>' +
      '</div>' +
      '<div class="card-body">' +
        '<div class="grid grid-cols-2 gap-3 mb-4">';

    (opts.inputs || []).forEach(function(inp) {
      html += '<div>' +
        '<label class="text-xs font-semibold text-gray-700 mb-1 block">' + E(inp.label) + '</label>' +
        '<div style="position:relative;">' +
          (inp.prefix ? '<span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:12px;color:#9ca3af;">' + E(inp.prefix) + '</span>' : '') +
          '<input type="' + (inp.type || 'number') + '" id="calc_' + E(opts.id) + '_' + E(inp.id) + '" placeholder="' + E(inp.placeholder || '') + '" ' +
            'class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" ' +
            'style="' + (inp.prefix ? 'padding-left:24px;' : '') + (inp.suffix ? 'padding-right:28px;' : '') + '" ' +
            'oninput="' + (opts.computeFn || '') + '()">' +
          (inp.suffix ? '<span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:12px;color:#9ca3af;">' + E(inp.suffix) + '</span>' : '') +
        '</div></div>';
    });

    html += '</div>' +
      '<div class="calc-results" id="calc_' + E(opts.id) + '_results" style="background:#f9fafb;border-radius:8px;padding:12px;">';

    (opts.outputs || []).forEach(function(out) {
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;' + (out.primary ? 'border-top:2px solid #e5e7eb;margin-top:8px;padding-top:12px;' : '') + '">' +
        '<span class="text-xs font-semibold text-gray-600">' + E(out.label) + '</span>' +
        '<span id="calc_' + E(opts.id) + '_' + E(out.id) + '" class="text-sm font-bold ' + (out.primary ? 'text-lg text-green-700' : 'text-gray-900') + '">—</span>' +
      '</div>';
    });

    html += '</div></div></div>';
    return html;
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
    scoreIndicator: scoreIndicator,
    toggleSwitch: toggleSwitch,
    progressDots: progressDots,
    dateBadge: dateBadge,
    scoreBar: scoreBar,
    rowActions: rowActions,
    calculatorCard: calculatorCard,
  };
})();
