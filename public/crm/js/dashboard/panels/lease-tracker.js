// =============================================================================
// LEASE TRACKER — Compact responsive table with outreach dots
// Entry point: shows all landlord properties at a glance.
// Detail work happens in workspace (landlord/tenant workspace modules).
// =============================================================================
/* global CRM, Router, MallanAPI, Utils, ActivityTable, FilterBar */

var LeaseTracker = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;
  var _ago = typeof Utils.formatTimeAgo === 'function' ? Utils.formatTimeAgo : function (d) { return D(d); };

  // --- State ----------------------------------------------------------------
  var _data = null;
  var _view = 'all';

  // --- Status badge config --------------------------------------------------
  var STATUS_MAP = {
    rented:      { label: 'RENTED',      color: '#059669', bg: '#ECFDF5' },
    vacant:      { label: 'VACANT',      color: '#DC2626', bg: '#FEF2F2' },
    listed_rent: { label: 'LISTED RENT', color: '#3B82F6', bg: '#EFF6FF' },
    listed_sale: { label: 'LISTED SALE', color: '#F59E0B', bg: '#FFFBEB' },
    dual_listed: { label: 'DUAL LISTED', color: '#8B5CF6', bg: '#F5F3FF' },
  };

  // =========================================================================
  // RENDER — entry point
  // =========================================================================
  function render() {
    CRM.setPanelTitle('Lease Tracker');
    var c = CRM.getContent();
    c.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:160px;">' +
      '<i class="fas fa-spinner fa-spin" style="font-size:24px;color:#B8860B;"></i></div>';

    MallanAPI._fetch('/api/crm/lease-tracker?view=' + encodeURIComponent(_view))
      .then(function (data) {
        _data = data;
        _renderDashboard(c);
      })
      .catch(function (err) {
        c.innerHTML = '<div class="text-center py-12">' +
          '<i class="fas fa-exclamation-triangle" style="font-size:28px;color:#F87171;margin-bottom:12px;display:block;"></i>' +
          '<p class="text-sm text-gray-500">Failed to load: ' + E(err.message || 'Unknown error') + '</p>' +
          '<button class="mt-4 px-4 py-2 text-xs font-bold rounded-lg" style="background:#B8860B;color:#fff;" onclick="LeaseTracker.render()">Retry</button>' +
          '</div>';
      });
  }

  // =========================================================================
  // DASHBOARD — KPIs + filters + table
  // =========================================================================
  function _renderDashboard(c) {
    var s = (_data && _data.summary) || {};
    var props = (_data && _data.properties) || [];

    var h = '<div style="max-width:1200px;margin:0 auto;">';

    // 1 — KPI summary bar
    h += _renderKPI(s);

    // 2 — Filter tabs + Add Lease button
    h += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:16px;flex-wrap:wrap;">';
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
    h += _renderFilterButtons(s);
    h += '</div>';
    h += '<button style="font-size:11px;font-weight:700;padding:8px 16px;border-radius:8px;background:#B8860B;color:#fff;border:none;cursor:pointer;white-space:nowrap;" ' +
      'onclick="LeaseTracker._openAddLeaseModal()">' +
      '<i class="fas fa-plus" style="margin-right:5px;"></i>Add Lease</button>';
    h += '</div>';

    // 3 — Table or empty state
    if (props.length === 0) {
      h += '<div class="text-center" style="padding:64px 0;">' +
        '<i class="fas fa-calendar-alt" style="font-size:36px;color:#D1D5DB;display:block;margin-bottom:16px;"></i>' +
        '<p style="font-size:18px;font-weight:700;color:#374151;margin-bottom:4px;">No Active Leases</p>' +
        '<p style="font-size:14px;color:#6B7280;">Add landlords and create leases to start tracking.</p>' +
        '</div>';
    } else {
      h += _renderTable(props);
    }

    h += '</div>';
    c.innerHTML = h;
  }

  // =========================================================================
  // KPI SUMMARY BAR
  // =========================================================================
  function _renderKPI(s) {
    var cards = [
      { icon: 'fa-building',    color: '#3B82F6', value: s.total_properties || 0, label: 'Total Properties' },
      { icon: 'fa-key',         color: '#059669', value: s.rented || 0,           label: 'Rented' },
      { icon: 'fa-door-open',   color: '#DC2626', value: s.vacant || 0,           label: 'Vacant' },
      { icon: 'fa-clock',       color: '#F59E0B', value: s.expiring_90d || 0,     label: 'Expiring \u226490d' },
      { icon: 'fa-layer-group', color: '#8B5CF6', value: s.dual_listed || 0,      label: 'Dual Listed' },
    ];

    var h = '<div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;">';
    for (var i = 0; i < cards.length; i++) {
      var k = cards[i];
      h += '<div style="display:flex;align-items:center;gap:12px;padding:14px 18px;background:#fff;border:1px solid #E5E7EB;border-radius:12px;flex:1;min-width:120px;">' +
        '<div style="width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:' + k.color + '15;color:' + k.color + ';font-size:14px;">' +
          '<i class="fas ' + k.icon + '"></i>' +
        '</div>' +
        '<div>' +
          '<div style="font-size:18px;font-weight:800;color:#111;">' + k.value + '</div>' +
          '<div style="font-size:9px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.3px;">' + E(k.label) + '</div>' +
        '</div>' +
      '</div>';
    }
    h += '</div>';
    return h;
  }

  // =========================================================================
  // FILTER TABS
  // =========================================================================
  function _renderFilterButtons(s) {
    var tabs = [
      { key: 'all',         label: 'All',         count: s.total_properties || 0 },
      { key: 'expiring',    label: 'Expiring',     count: (s.expiring_90d || 0) },
      { key: 'vacant',      label: 'Vacant',       count: s.vacant || 0 },
      { key: 'dual_listed', label: 'Dual Listed',  count: s.dual_listed || 0 },
    ];

    var h = '';
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      var isActive = (_view === t.key);
      if (isActive) {
        h += '<button class="px-4 py-2 text-xs font-bold rounded-full" style="background:#B8860B;color:#fff;border:none;cursor:pointer;">' +
          E(t.label) + ' (' + t.count + ')</button>';
      } else {
        h += '<button class="px-4 py-2 text-xs font-bold rounded-full" style="background:#fff;color:#6B7280;border:1px solid #E5E7EB;cursor:pointer;" ' +
          'onmouseover="this.style.borderColor=\'#B8860B\';this.style.color=\'#B8860B\';" ' +
          'onmouseout="this.style.borderColor=\'#E5E7EB\';this.style.color=\'#6B7280\';" ' +
          'onclick="LeaseTracker._filterView(\'' + E(t.key) + '\')">' +
          E(t.label) + ' (' + t.count + ')</button>';
      }
    }
    return h;
  }

  // =========================================================================
  // COMPACT TABLE
  // =========================================================================
  function _renderTable(props) {
    // Desktop: full table. Mobile: compact cards.
    var isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) return _renderMobileCards(props);

    var h = '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">';
    h += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';

    // Header
    h += '<thead><tr style="background:#F9FAFB;border-bottom:1px solid #E5E7EB;">';
    var cols = ['Address', 'Status', 'Landlord', 'Tenant', 'Rent', 'Lease Ends', 'Outreach', ''];
    for (var ci = 0; ci < cols.length; ci++) {
      h += '<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;">' + cols[ci] + '</th>';
    }
    h += '</tr></thead>';

    // Body
    h += '<tbody>';
    for (var i = 0; i < props.length; i++) {
      h += _renderRow(props[i], i);
    }
    h += '</tbody></table></div>';
    return h;
  }

  function _renderRow(prop, idx) {
    var lease = prop.lease || {};
    var ll = prop.landlord || {};
    var ten = prop.tenant || null;
    var out = prop.outreach || {};
    var sts = STATUS_MAP[prop.status] || STATUS_MAP.rented;

    var h = '<tr style="border-bottom:1px solid #F3F4F6;cursor:pointer;" ' +
      'onmouseover="this.style.background=\'#FAFAFA\'" onmouseout="this.style.background=\'#fff\'">';

    // Address
    h += '<td style="padding:10px 12px;">';
    h += '<div style="font-weight:700;color:#111;">' + E(prop.address || '') + (prop.unit ? ' #' + E(prop.unit) : '') + '</div>';
    if (prop.borough) h += '<div style="font-size:11px;color:#9CA3AF;">' + E(prop.borough) + '</div>';
    h += '</td>';

    // Status badge
    h += '<td style="padding:10px 12px;">';
    h += '<span style="font-size:9px;font-weight:800;padding:3px 8px;border-radius:6px;background:' + sts.bg + ';color:' + sts.color + ';letter-spacing:.3px;white-space:nowrap;">' + E(sts.label) + '</span>';
    h += '</td>';

    // Landlord (clickable)
    h += '<td style="padding:10px 12px;">';
    var llName = ll.entity_name || ll.name || '-';
    if (ll.id) {
      h += '<a href="javascript:void(0)" onclick="event.stopPropagation();LeaseTracker._openClient(\'' + E(String(ll.id)) + '\')" ' +
        'style="font-weight:600;color:#374151;text-decoration:none;" ' +
        'onmouseover="this.style.color=\'#B8860B\'" onmouseout="this.style.color=\'#374151\'">' + E(llName) + '</a>';
    } else {
      h += '<span style="color:#9CA3AF;">' + E(llName) + '</span>';
    }
    h += '</td>';

    // Tenant (clickable or "Vacant")
    h += '<td style="padding:10px 12px;">';
    if (ten) {
      var tenName = ten.name || '-';
      if (ten.id) {
        h += '<a href="javascript:void(0)" onclick="event.stopPropagation();LeaseTracker._openClient(\'' + E(String(ten.id)) + '\')" ' +
          'style="font-weight:600;color:#374151;text-decoration:none;" ' +
          'onmouseover="this.style.color=\'#B8860B\'" onmouseout="this.style.color=\'#374151\'">' + E(tenName) + '</a>';
      } else {
        h += '<span style="color:#374151;">' + E(tenName) + '</span>';
      }
    } else {
      h += '<span style="color:#DC2626;font-weight:600;font-size:11px;">Vacant</span>';
    }
    h += '</td>';

    // Rent
    h += '<td style="padding:10px 12px;font-weight:700;white-space:nowrap;">';
    h += lease.monthly_rent ? $(Number(lease.monthly_rent)) + '<span style="font-weight:400;color:#9CA3AF;font-size:11px;">/mo</span>' : '<span style="color:#D1D5DB;">-</span>';
    h += '</td>';

    // Lease Ends (with urgency color)
    h += '<td style="padding:10px 12px;white-space:nowrap;">';
    if (lease.end_date) {
      var days = lease.days_until_expiry;
      var urgColor = '#6B7280';
      if (typeof days === 'number') {
        if (days <= 30) urgColor = '#DC2626';
        else if (days <= 90) urgColor = '#F59E0B';
      }
      h += '<span style="font-weight:600;color:' + urgColor + ';">' + D(lease.end_date) + '</span>';
      if (typeof days === 'number' && days <= 180) {
        h += '<div style="font-size:10px;color:' + urgColor + ';font-weight:700;">' + days + 'd left</div>';
      }
    } else {
      h += '<span style="color:#D1D5DB;">-</span>';
    }
    h += '</td>';

    // Outreach dots (6mo / 90d / 60d / 30d)
    h += '<td style="padding:10px 12px;">';
    h += _renderOutreachDots(out, lease);
    h += '</td>';

    // Actions
    h += '<td style="padding:10px 12px;white-space:nowrap;">';
    h += '<div style="display:flex;gap:4px;">';
    // Edit
    h += '<button style="width:28px;height:28px;border-radius:6px;background:#F3F4F6;color:#6B7280;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;" ' +
      'title="Edit lease" onclick="event.stopPropagation();LeaseTracker._openEditModal(' + idx + ')" ' +
      'onmouseover="this.style.background=\'#B8860B\';this.style.color=\'#fff\'" onmouseout="this.style.background=\'#F3F4F6\';this.style.color=\'#6B7280\'">' +
      '<i class="fas fa-pen" style="font-size:10px;"></i></button>';
    // Email landlord
    if (ll.email) {
      h += '<div style="position:relative;display:inline-block;">';
      h += '<button style="width:28px;height:28px;border-radius:6px;background:#F3F4F6;color:#6B7280;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;" ' +
        'title="Email landlord" onclick="event.stopPropagation();LeaseTracker._toggleDropdown(event,\'ll-dd-' + idx + '\')" ' +
        'onmouseover="this.style.background=\'#B8860B\';this.style.color=\'#fff\'" onmouseout="this.style.background=\'#F3F4F6\';this.style.color=\'#6B7280\'">' +
        '<i class="fas fa-envelope" style="font-size:10px;"></i></button>';
      h += _renderEmailDropdown('ll-dd-' + idx, idx, 'landlord');
      h += '</div>';
    }
    // Email tenant
    if (ten && (ten.email || (ten.id))) {
      h += '<div style="position:relative;display:inline-block;">';
      h += '<button style="width:28px;height:28px;border-radius:6px;background:#F3F4F6;color:#374151;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;" ' +
        'title="Email tenant" onclick="event.stopPropagation();LeaseTracker._toggleDropdown(event,\'tn-dd-' + idx + '\')" ' +
        'onmouseover="this.style.background=\'#374151\';this.style.color=\'#fff\'" onmouseout="this.style.background=\'#F3F4F6\';this.style.color=\'#374151\'">' +
        '<i class="fas fa-user" style="font-size:10px;"></i></button>';
      h += _renderEmailDropdown('tn-dd-' + idx, idx, 'tenant');
      h += '</div>';
    }
    // Convert to seller
    if (ll.id) {
      h += '<button style="width:28px;height:28px;border-radius:6px;background:#F59E0B15;color:#B45309;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;" ' +
        'title="Add seller role" onclick="event.stopPropagation();LeaseTracker._convertToSeller(' + idx + ')" ' +
        'onmouseover="this.style.background=\'#F59E0B\';this.style.color=\'#fff\'" onmouseout="this.style.background=\'#F59E0B15\';this.style.color=\'#B45309\'">' +
        '<i class="fas fa-exchange-alt" style="font-size:10px;"></i></button>';
    }
    h += '</div></td>';

    h += '</tr>';
    return h;
  }

  // ── Outreach dots (inline) ─────────────────────────────────────────────
  function _renderOutreachDots(out, lease) {
    var daysLeft = (lease && typeof lease.days_until_expiry === 'number') ? lease.days_until_expiry : null;
    var milestones = [
      { key: '6mo', sent: !!out.landlord_6mo_sent, targetDays: 180 },
      { key: '90d', sent: !!out.landlord_90d_sent, targetDays: 90 },
      { key: '60d', sent: !!out.landlord_60d_sent, targetDays: 60 },
      { key: '30d', sent: !!out.landlord_30d_sent, targetDays: 30 },
    ];

    var h = '<div style="display:flex;align-items:center;gap:3px;" title="Outreach: 6mo / 90d / 60d / 30d">';
    for (var i = 0; i < milestones.length; i++) {
      var m = milestones[i];
      var dotColor, dotBg;
      if (m.sent) {
        dotColor = '#059669'; dotBg = '#059669';
      } else if (daysLeft !== null && daysLeft < m.targetDays) {
        dotColor = '#DC2626'; dotBg = '#DC2626'; // overdue
      } else {
        dotColor = '#D1D5DB'; dotBg = 'transparent'; // future
      }
      h += '<div style="width:10px;height:10px;border-radius:50%;background:' + dotBg + ';border:2px solid ' + dotColor + ';" title="' + m.key + (m.sent ? ' \u2713 Sent' : daysLeft !== null && daysLeft < m.targetDays ? ' Overdue' : '') + '"></div>';
      if (i < milestones.length - 1) {
        h += '<div style="width:6px;height:1px;background:#E5E7EB;"></div>';
      }
    }
    h += '</div>';
    return h;
  }

  // ── Email dropdown ─────────────────────────────────────────────────────
  function _renderEmailDropdown(ddId, idx, target) {
    var templates = target === 'landlord'
      ? [
          { key: 'sell_inquiry', label: 'Sell inquiry' },
          { key: 'market_update', label: 'Market update' },
          { key: '90d_checkin', label: '90d check-in' },
        ]
      : [
          { key: 'buy_opportunity', label: 'Buy opportunity' },
          { key: 'renewal_reminder', label: 'Renewal reminder' },
          { key: 'new_listings', label: 'New listings' },
        ];

    var fnName = target === 'landlord' ? '_emailLandlord' : '_emailTenant';
    var h = '<div id="' + ddId + '" style="display:none;position:absolute;right:0;top:100%;margin-top:4px;background:#fff;border:1px solid #E5E7EB;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:50;min-width:150px;">';
    h += '<div style="padding:4px;">';
    for (var i = 0; i < templates.length; i++) {
      var t = templates[i];
      h += '<button style="display:block;width:100%;text-align:left;font-size:11px;padding:6px 10px;border:none;background:none;cursor:pointer;border-radius:4px;color:#374151;" ' +
        'onmouseover="this.style.background=\'#F3F4F6\'" onmouseout="this.style.background=\'none\'" ' +
        'onclick="event.stopPropagation();LeaseTracker.' + fnName + '(' + idx + ',\'' + t.key + '\')">' + E(t.label) + '</button>';
    }
    h += '</div></div>';
    return h;
  }

  // =========================================================================
  // MOBILE CARDS (responsive fallback)
  // =========================================================================
  function _renderMobileCards(props) {
    var h = '<div style="display:flex;flex-direction:column;gap:10px;">';
    for (var i = 0; i < props.length; i++) {
      var prop = props[i];
      var lease = prop.lease || {};
      var ll = prop.landlord || {};
      var ten = prop.tenant || null;
      var sts = STATUS_MAP[prop.status] || STATUS_MAP.rented;

      h += '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:14px;">';

      // Address + status
      h += '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">';
      h += '<div>';
      h += '<div style="font-size:14px;font-weight:700;color:#111;">' + E(prop.address || '') + (prop.unit ? ' #' + E(prop.unit) : '') + '</div>';
      if (prop.borough) h += '<div style="font-size:11px;color:#9CA3AF;">' + E(prop.borough) + '</div>';
      h += '</div>';
      h += '<span style="font-size:9px;font-weight:800;padding:3px 8px;border-radius:6px;background:' + sts.bg + ';color:' + sts.color + ';white-space:nowrap;">' + E(sts.label) + '</span>';
      h += '</div>';

      // Landlord / Tenant row
      h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;font-size:12px;">';
      h += '<div><span style="color:#9CA3AF;font-size:10px;font-weight:600;">LANDLORD</span><br>';
      if (ll.id) {
        h += '<a href="javascript:void(0)" onclick="LeaseTracker._openClient(\'' + E(String(ll.id)) + '\')" style="font-weight:600;color:#374151;text-decoration:none;">' + E(ll.name || '-') + '</a>';
      } else {
        h += E(ll.name || '-');
      }
      // Additional landlords (multi-party leases)
      if (prop.additional_landlords && prop.additional_landlords.length > 0) {
        for (var ali = 0; ali < prop.additional_landlords.length; ali++) {
          var addLL = prop.additional_landlords[ali];
          h += '<br>';
          if (addLL.id) {
            h += '<a href="javascript:void(0)" onclick="LeaseTracker._openClient(\'' + E(String(addLL.id)) + '\')" style="font-weight:600;color:#374151;text-decoration:none;font-size:11px;">' + E(addLL.name || '-') + '</a>';
          } else {
            h += '<span style="font-size:11px;">' + E(addLL.name || '-') + '</span>';
          }
        }
      }
      h += '</div>';
      h += '<div><span style="color:#9CA3AF;font-size:10px;font-weight:600;">TENANT</span><br>';
      if (ten && ten.id) {
        h += '<a href="javascript:void(0)" onclick="LeaseTracker._openClient(\'' + E(String(ten.id)) + '\')" style="font-weight:600;color:#374151;text-decoration:none;">' + E(ten.name || '-') + '</a>';
      } else if (ten) {
        h += E(ten.name || '-');
      } else {
        h += '<span style="color:#DC2626;font-weight:600;">Vacant</span>';
      }
      // Additional tenants (multi-party leases)
      if (prop.additional_tenants && prop.additional_tenants.length > 0) {
        for (var ati = 0; ati < prop.additional_tenants.length; ati++) {
          var addTen = prop.additional_tenants[ati];
          h += '<br>';
          if (addTen.id) {
            h += '<a href="javascript:void(0)" onclick="LeaseTracker._openClient(\'' + E(String(addTen.id)) + '\')" style="font-weight:600;color:#374151;text-decoration:none;font-size:11px;">' + E(addTen.name || '-') + '</a>';
          } else {
            h += '<span style="font-size:11px;">' + E(addTen.name || '-') + '</span>';
          }
        }
      }
      h += '</div></div>';

      // Rent + Lease end
      h += '<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;">';
      h += '<span style="font-weight:700;">' + (lease.monthly_rent ? $(Number(lease.monthly_rent)) + '/mo' : '-') + '</span>';
      if (lease.end_date) {
        var days = lease.days_until_expiry;
        var urgColor = '#6B7280';
        if (typeof days === 'number') {
          if (days <= 30) urgColor = '#DC2626';
          else if (days <= 90) urgColor = '#F59E0B';
        }
        h += '<span style="color:' + urgColor + ';font-weight:600;">Ends: ' + D(lease.end_date) + (typeof days === 'number' && days <= 180 ? ' (' + days + 'd)' : '') + '</span>';
      }
      h += '</div>';

      // Action buttons
      h += '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">';
      h += '<button style="font-size:10px;font-weight:700;padding:5px 10px;border-radius:6px;background:#F3F4F6;color:#374151;border:none;cursor:pointer;" ' +
        'onclick="LeaseTracker._openEditModal(' + i + ')"><i class="fas fa-pen" style="margin-right:3px;"></i>Edit</button>';
      if (ll.email) {
        h += '<button style="font-size:10px;font-weight:700;padding:5px 10px;border-radius:6px;background:#B8860B;color:#fff;border:none;cursor:pointer;" ' +
          'onclick="LeaseTracker._emailLandlord(' + i + ',\'sell_inquiry\')"><i class="fas fa-envelope" style="margin-right:3px;"></i>Landlord</button>';
      }
      if (ten && ten.email) {
        h += '<button style="font-size:10px;font-weight:700;padding:5px 10px;border-radius:6px;background:#374151;color:#fff;border:none;cursor:pointer;" ' +
          'onclick="LeaseTracker._emailTenant(' + i + ',\'buy_opportunity\')"><i class="fas fa-envelope" style="margin-right:3px;"></i>Tenant</button>';
      }
      h += '</div>';

      h += '</div>'; // card
    }
    h += '</div>';
    return h;
  }

  // =========================================================================
  // ACTIONS (preserved from v1 — all working)
  // =========================================================================
  function _filterView(view) {
    _view = view;
    render();
  }

  function _toggleDropdown(evt, id) {
    evt.stopPropagation();
    var el = document.getElementById(id);
    if (!el) return;
    var isOpen = el.style.display !== 'none';
    var allDDs = document.querySelectorAll('[id^="ll-dd-"],[id^="tn-dd-"]');
    for (var i = 0; i < allDDs.length; i++) { allDDs[i].style.display = 'none'; }
    if (!isOpen) {
      el.style.display = 'block';
      var closer = function () { el.style.display = 'none'; document.removeEventListener('click', closer); };
      setTimeout(function () { document.addEventListener('click', closer); }, 0);
    }
  }

  function _emailLandlord(propIdx, type) {
    if (!_data || !_data.properties[propIdx]) return;
    var prop = _data.properties[propIdx];
    if (!prop.landlord || !prop.landlord.email) { CRM.toast('No landlord email on file', 'error'); return; }
    CRM.toast('Sending ' + type.replace(/_/g, ' ') + ' email...', 'info');
    MallanAPI._fetch('/api/crm/lease-tracker/' + prop.id + '/outreach', {
      method: 'POST',
      body: JSON.stringify({ target: 'landlord', type: type }),
    }).then(function () {
      CRM.toast('Email sent to ' + E(prop.landlord.name || prop.landlord.email), 'success');
      render();
    }).catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  function _emailTenant(propIdx, type) {
    if (!_data || !_data.properties[propIdx]) return;
    var prop = _data.properties[propIdx];
    if (!prop.tenant || !prop.tenant.email) { CRM.toast('No tenant email on file', 'error'); return; }
    CRM.toast('Sending ' + type.replace(/_/g, ' ') + ' email...', 'info');
    MallanAPI._fetch('/api/crm/lease-tracker/' + prop.id + '/outreach', {
      method: 'POST',
      body: JSON.stringify({ target: 'tenant', type: type }),
    }).then(function () {
      CRM.toast('Email sent to ' + E(prop.tenant.name || prop.tenant.email), 'success');
      render();
    }).catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  function _openClient(clientId) {
    if (!clientId) return;
    Router.navigate('/workspace/client/' + clientId + '/overview');
  }

  function _convertToSeller(propIdx) {
    if (!_data || !_data.properties[propIdx]) return;
    var prop = _data.properties[propIdx];
    var llId = prop.landlord && prop.landlord.id;
    if (!llId) { CRM.toast('No landlord linked', 'error'); return; }
    if (!confirm('Add seller role to ' + (prop.landlord.name || 'this landlord') + '?\n\nThis adds them to your Sales CRM.')) return;
    MallanAPI._fetch('/api/crm/convert', {
      method: 'POST',
      body: JSON.stringify({ personId: String(llId), action: 'role_transition', targetRole: 'seller' }),
    }).then(function () {
      CRM.toast('Seller role added', 'success');
      render();
    }).catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  // =========================================================================
  // MODALS (preserved from v1 — all working)
  // =========================================================================
  function _closeModal() {
    var overlay = document.getElementById('lt-modal-overlay');
    if (overlay) overlay.remove();
  }

  function _inputRow(label, id, value, type, opts) {
    var t = type || 'text';
    var extra = opts || '';
    return '<div style="margin-bottom:12px;">' +
      '<label style="display:block;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;" for="' + id + '">' + E(label) + '</label>' +
      '<input id="' + id + '" type="' + t + '" value="' + E(value || '') + '" ' + extra + ' ' +
      'style="width:100%;padding:8px 10px;font-size:13px;border:1px solid #D1D5DB;border-radius:8px;outline:none;box-sizing:border-box;" ' +
      'onfocus="this.style.borderColor=\'#B8860B\'" onblur="this.style.borderColor=\'#D1D5DB\'">' +
      '</div>';
  }

  function _selectRow(label, id, value, options) {
    var h = '<div style="margin-bottom:12px;">' +
      '<label style="display:block;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;" for="' + id + '">' + E(label) + '</label>' +
      '<select id="' + id + '" style="width:100%;padding:8px 10px;font-size:13px;border:1px solid #D1D5DB;border-radius:8px;outline:none;background:#fff;box-sizing:border-box;" ' +
      'onfocus="this.style.borderColor=\'#B8860B\'" onblur="this.style.borderColor=\'#D1D5DB\'">';
    for (var i = 0; i < options.length; i++) {
      var o = options[i];
      h += '<option value="' + E(o.value) + '"' + (o.value === value ? ' selected' : '') + '>' + E(o.label) + '</option>';
    }
    h += '</select></div>';
    return h;
  }

  function _formatDateISO(d) {
    if (!d) return '';
    var dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toISOString().split('T')[0];
  }

  function _openEditModal(propIdx) {
    if (!_data || !_data.properties[propIdx]) return;
    var prop = _data.properties[propIdx];
    var lease = prop.lease || {};
    var ten = prop.tenant || {};
    var ll = prop.landlord || {};

    _closeModal();

    var h = '<div id="lt-modal-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;" onclick="if(event.target===this)LeaseTracker._closeModal()">';
    h += '<div style="background:#fff;border-radius:14px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2);" onclick="event.stopPropagation()">';

    h += '<div style="padding:20px 24px 0;display:flex;align-items:center;justify-content:space-between;">';
    h += '<div>';
    h += '<div style="font-size:16px;font-weight:800;color:#111;">Edit Lease</div>';
    h += '<div style="font-size:12px;color:#6B7280;">' + E(prop.address || '') + (prop.unit ? ' #' + E(prop.unit) : '') + '</div>';
    h += '</div>';
    h += '<button style="width:32px;height:32px;border-radius:8px;background:#F3F4F6;border:none;cursor:pointer;font-size:14px;color:#6B7280;display:flex;align-items:center;justify-content:center;" onclick="LeaseTracker._closeModal()">&times;</button>';
    h += '</div>';

    h += '<div style="padding:20px 24px;">';
    h += '<input type="hidden" id="lt-edit-idx" value="' + propIdx + '">';

    h += '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #E5E7EB;">Lease Details</div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px;">';
    h += _inputRow('Monthly Rent ($)', 'lt-edit-rent', lease.monthly_rent || '', 'number', 'step="0.01" min="0"');
    h += _selectRow('Lease Type', 'lt-edit-type', lease.lease_type || 'standard_1yr', [
      { value: 'standard_1yr', label: 'Standard 1 Year' },
      { value: 'standard_2yr', label: 'Standard 2 Year' },
      { value: 'month_to_month', label: 'Month to Month' },
      { value: 'stabilized', label: 'Rent Stabilized' },
      { value: 'commercial', label: 'Commercial' },
    ]);
    h += _inputRow('Lease Start', 'lt-edit-start', _formatDateISO(lease.start_date), 'date');
    h += _inputRow('Lease End', 'lt-edit-end', _formatDateISO(lease.end_date), 'date');
    h += '</div>';

    h += _selectRow('Renewal Status', 'lt-edit-renewal', lease.renewal_status || 'unknown', [
      { value: 'unknown', label: 'Unknown' },
      { value: 'renewing', label: 'Renewing' },
      { value: 'not_renewing', label: 'Not Renewing' },
      { value: 'pending_decision', label: 'Pending Decision' },
    ]);

    // Tenant section
    h += '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 10px;padding-bottom:6px;border-bottom:1px solid #E5E7EB;">Tenant</div>';
    if (ten && ten.id) {
      h += '<input type="hidden" id="lt-edit-tenant-id" value="' + E(String(ten.id)) + '">';
      h += '<div style="font-size:12px;color:#374151;margin-bottom:8px;"><strong>' + E(ten.name || '') + '</strong></div>';
      h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px;">';
      h += _inputRow('Annual Income ($)', 'lt-edit-income', ten.annual_income || '', 'number', 'step="1" min="0"');
      h += _inputRow('Bonuses ($)', 'lt-edit-bonuses', ten.bonuses || '', 'number', 'step="1" min="0"');
      h += _inputRow('Monthly Debt ($)', 'lt-edit-debt', ten.monthly_debt || '', 'number', 'step="1" min="0"');
      h += _selectRow('Credit Score', 'lt-edit-credit', ten.credit_score_range || '', [
        { value: '', label: '-- Select --' },
        { value: 'excellent', label: 'Excellent (740+)' },
        { value: 'good', label: 'Good (670-739)' },
        { value: 'fair', label: 'Fair (580-669)' },
        { value: 'poor', label: 'Poor (below 580)' },
      ]);
      h += _inputRow('Available Funds ($)', 'lt-edit-funds', ten.available_funds || '', 'number', 'step="1" min="0"');
      h += _inputRow('Down Payment ($)', 'lt-edit-down', ten.down_payment || '', 'number', 'step="1" min="0"');
      h += '</div>';
    } else {
      h += '<input type="hidden" id="lt-edit-tenant-id" value="">';
      h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px;">';
      h += _inputRow('Tenant Name', 'lt-edit-tname', (ten && ten.name) || '', 'text');
      h += _inputRow('Tenant Email', 'lt-edit-temail', (ten && ten.email) || '', 'email');
      h += _inputRow('Tenant Phone', 'lt-edit-tphone', (ten && ten.phone) || '', 'tel');
      h += '<div></div>';
      h += '</div>';
    }

    // Landlord seller potential
    h += '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 10px;padding-bottom:6px;border-bottom:1px solid #E5E7EB;">Landlord</div>';
    if (ll.id) {
      h += '<input type="hidden" id="lt-edit-ll-id" value="' + E(String(ll.id)) + '">';
      h += _selectRow('Seller Potential', 'lt-edit-seller-pot', ll.seller_potential || 'none', [
        { value: 'none', label: 'None' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ]);
    } else {
      h += '<div style="font-size:12px;color:#9CA3AF;font-style:italic;">No landlord linked</div>';
    }

    h += '<div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end;">';
    h += '<button style="padding:10px 20px;font-size:12px;font-weight:700;border-radius:8px;background:#fff;color:#6B7280;border:1px solid #E5E7EB;cursor:pointer;" onclick="LeaseTracker._closeModal()">Cancel</button>';
    h += '<button style="padding:10px 24px;font-size:12px;font-weight:700;border-radius:8px;background:#B8860B;color:#fff;border:none;cursor:pointer;" onclick="LeaseTracker._saveEdit()">Save Changes</button>';
    h += '</div>';

    h += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', h);
  }

  function _saveEdit() {
    var idx = parseInt(document.getElementById('lt-edit-idx').value, 10);
    if (!_data || !_data.properties[idx]) return;
    var prop = _data.properties[idx];
    var saving = [];

    var leaseUpdate = {};
    var rent = document.getElementById('lt-edit-rent').value;
    if (rent) leaseUpdate.monthly_rent = parseFloat(rent);
    var start = document.getElementById('lt-edit-start').value;
    if (start) leaseUpdate.lease_start_date = start;
    var end = document.getElementById('lt-edit-end').value;
    if (end) leaseUpdate.lease_end_date = end;
    leaseUpdate.lease_type = document.getElementById('lt-edit-type').value;
    leaseUpdate.renewal_status = document.getElementById('lt-edit-renewal').value;

    var tenantId = document.getElementById('lt-edit-tenant-id').value;
    if (!tenantId) {
      var tn = document.getElementById('lt-edit-tname');
      if (tn) leaseUpdate.tenant_name = tn.value || null;
      var te = document.getElementById('lt-edit-temail');
      if (te) leaseUpdate.tenant_email = te.value || null;
      var tp = document.getElementById('lt-edit-tphone');
      if (tp) leaseUpdate.tenant_phone = tp.value || null;
    }

    saving.push(MallanAPI._fetch('/api/crm/lease-tracker/' + prop.id, { method: 'PATCH', body: JSON.stringify(leaseUpdate) }));

    if (tenantId) {
      var tenantUpdate = {};
      var income = document.getElementById('lt-edit-income').value;
      tenantUpdate.annual_income = income ? parseFloat(income) : null;
      var bonusesEl = document.getElementById('lt-edit-bonuses');
      if (bonusesEl) tenantUpdate.bonuses = bonusesEl.value ? parseFloat(bonusesEl.value) : null;
      var debtEl = document.getElementById('lt-edit-debt');
      if (debtEl) tenantUpdate.monthly_debt = debtEl.value ? parseFloat(debtEl.value) : null;
      var credit = document.getElementById('lt-edit-credit').value;
      tenantUpdate.credit_score_range = credit || null;
      var fundsEl = document.getElementById('lt-edit-funds');
      if (fundsEl) tenantUpdate.available_funds = fundsEl.value ? parseFloat(fundsEl.value) : null;
      var downEl = document.getElementById('lt-edit-down');
      if (downEl) tenantUpdate.down_payment = downEl.value ? parseFloat(downEl.value) : null;
      saving.push(MallanAPI._fetch('/api/crm/clients/' + tenantId, { method: 'PATCH', body: JSON.stringify(tenantUpdate) }));
    }

    var llId = document.getElementById('lt-edit-ll-id');
    if (llId && llId.value) {
      var sellerPot = document.getElementById('lt-edit-seller-pot').value;
      saving.push(MallanAPI._fetch('/api/crm/clients/' + llId.value, { method: 'PATCH', body: JSON.stringify({ seller_potential: sellerPot }) }));
    }

    var saveBtn = document.querySelector('#lt-modal-overlay button:last-child');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

    Promise.all(saving).then(function () {
      CRM.toast('Lease updated', 'success');
      _closeModal();
      render();
    }).catch(function (err) {
      CRM.toast('Save failed: ' + (err.message || ''), 'error');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
    });
  }

  // =========================================================================
  // ADD LEASE MODAL
  // =========================================================================
  function _openAddLeaseModal() {
    _closeModal();

    var h = '<div id="lt-modal-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;" onclick="if(event.target===this)LeaseTracker._closeModal()">';
    h += '<div style="background:#fff;border-radius:14px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2);" onclick="event.stopPropagation()">';

    h += '<div style="padding:20px 24px 0;display:flex;align-items:center;justify-content:space-between;">';
    h += '<div style="font-size:16px;font-weight:800;color:#111;">Add New Lease</div>';
    h += '<button style="width:32px;height:32px;border-radius:8px;background:#F3F4F6;border:none;cursor:pointer;font-size:14px;color:#6B7280;display:flex;align-items:center;justify-content:center;" onclick="LeaseTracker._closeModal()">&times;</button>';
    h += '</div>';

    h += '<div style="padding:20px 24px;">';
    h += '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #E5E7EB;">Property</div>';
    h += _inputRow('Address *', 'lt-add-address', '', 'text', 'placeholder="425 Park Avenue South"');
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px;">';
    h += _inputRow('Unit', 'lt-add-unit', '', 'text', 'placeholder="4D"');
    h += _selectRow('Borough', 'lt-add-borough', '', [
      { value: '', label: '-- Select --' },
      { value: 'Manhattan', label: 'Manhattan' },
      { value: 'Brooklyn', label: 'Brooklyn' },
      { value: 'Queens', label: 'Queens' },
      { value: 'Bronx', label: 'Bronx' },
      { value: 'Staten Island', label: 'Staten Island' },
    ]);
    h += '</div>';

    h += '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 10px;padding-bottom:6px;border-bottom:1px solid #E5E7EB;">Landlord (Client ID)</div>';
    h += _inputRow('Landlord Client ID *', 'lt-add-ll-id', '', 'text', 'placeholder="Enter landlord client ID"');

    h += '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 10px;padding-bottom:6px;border-bottom:1px solid #E5E7EB;">Tenant (optional)</div>';
    h += _inputRow('Tenant Client ID', 'lt-add-ten-id', '', 'text', 'placeholder="Leave blank if no tenant lead"');
    h += '<div style="font-size:10px;color:#9CA3AF;margin:-8px 0 8px;font-style:italic;">Or enter tenant info directly:</div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px;">';
    h += _inputRow('Tenant Name', 'lt-add-tname', '', 'text');
    h += _inputRow('Tenant Email', 'lt-add-temail', '', 'email');
    h += '</div>';

    h += '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 10px;padding-bottom:6px;border-bottom:1px solid #E5E7EB;">Lease Terms</div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px;">';
    h += _inputRow('Monthly Rent ($) *', 'lt-add-rent', '', 'number', 'step="0.01" min="0"');
    h += _selectRow('Lease Type', 'lt-add-type', 'standard_1yr', [
      { value: 'standard_1yr', label: 'Standard 1 Year' },
      { value: 'standard_2yr', label: 'Standard 2 Year' },
      { value: 'month_to_month', label: 'Month to Month' },
      { value: 'stabilized', label: 'Rent Stabilized' },
      { value: 'commercial', label: 'Commercial' },
    ]);
    h += _inputRow('Lease Start *', 'lt-add-start', '', 'date');
    h += _inputRow('Lease End *', 'lt-add-end', '', 'date');
    h += '</div>';

    h += '<div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end;">';
    h += '<button style="padding:10px 20px;font-size:12px;font-weight:700;border-radius:8px;background:#fff;color:#6B7280;border:1px solid #E5E7EB;cursor:pointer;" onclick="LeaseTracker._closeModal()">Cancel</button>';
    h += '<button id="lt-add-save-btn" style="padding:10px 24px;font-size:12px;font-weight:700;border-radius:8px;background:#B8860B;color:#fff;border:none;cursor:pointer;" onclick="LeaseTracker._saveNewLease()">Create Lease</button>';
    h += '</div>';

    h += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', h);
  }

  function _saveNewLease() {
    var address = document.getElementById('lt-add-address').value.trim();
    var rent = document.getElementById('lt-add-rent').value;
    var startDate = document.getElementById('lt-add-start').value;
    var endDate = document.getElementById('lt-add-end').value;
    var llId = document.getElementById('lt-add-ll-id').value.trim();

    if (!address) { CRM.toast('Address is required', 'error'); return; }
    if (!rent || parseFloat(rent) <= 0) { CRM.toast('Monthly rent is required', 'error'); return; }
    if (!startDate) { CRM.toast('Lease start date is required', 'error'); return; }
    if (!endDate) { CRM.toast('Lease end date is required', 'error'); return; }
    if (!llId) { CRM.toast('Landlord client ID is required', 'error'); return; }

    var payload = {
      address: address,
      unit: document.getElementById('lt-add-unit').value.trim() || undefined,
      borough: document.getElementById('lt-add-borough').value || undefined,
      monthly_rent: parseFloat(rent),
      lease_start_date: startDate,
      lease_end_date: endDate,
      lease_type: document.getElementById('lt-add-type').value,
      landlord_lead_id: llId,
    };

    var tenId = document.getElementById('lt-add-ten-id').value.trim();
    if (tenId) {
      payload.tenant_lead_id = tenId;
    } else {
      var tname = document.getElementById('lt-add-tname').value.trim();
      var temail = document.getElementById('lt-add-temail').value.trim();
      if (tname) payload.tenant_name = tname;
      if (temail) payload.tenant_email = temail;
    }

    var btn = document.getElementById('lt-add-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

    MallanAPI._fetch('/api/crm/rentals/leases', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(function () {
      CRM.toast('Lease created', 'success');
      _closeModal();
      render();
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Create Lease'; }
    });
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================
  return {
    render: render,
    _filterView: _filterView,
    _toggleDropdown: _toggleDropdown,
    _emailLandlord: _emailLandlord,
    _emailTenant: _emailTenant,
    _openClient: _openClient,
    _convertToSeller: _convertToSeller,
    _closeModal: _closeModal,
    _openEditModal: _openEditModal,
    _saveEdit: _saveEdit,
    _openAddLeaseModal: _openAddLeaseModal,
    _saveNewLease: _saveNewLease,
  };
})();
