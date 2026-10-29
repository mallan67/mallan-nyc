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
  // Lease dates are calendar days stored at UTC midnight ("2026-09-13T00:00:00.000Z"). Formatting
  // them in local time showed the day before (Sep 12) — the stored day is what the agent typed.
  var _DAY_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function _day(v) {
    if (!v) return '';
    var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return D(v);
    return _DAY_MONTHS[parseInt(m[2], 10) - 1] + ' ' + parseInt(m[3], 10) + ', ' + m[1];
  }
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

  // --- Outreach menus: the keys ARE the types POST /api/crm/lease-tracker/[id]/outreach accepts.
  // (Until 2026-10-27 the tenant menu sent buy_opportunity / renewal_reminder / new_listings,
  // which the route rejects with 400 — no tenant email could ever be sent from here.)
  var OUTREACH_MENU = {
    landlord: [
      { key: 'sell_inquiry',  label: 'Property value / sell inquiry' },
      { key: 'market_update', label: 'Market update' },
      { key: '90d_checkin',   label: '90-day check-in' },
      { key: '60d_checkin',   label: '60-day check-in' },
      { key: '30d_checkin',   label: '30-day check-in' },
    ],
    tenant: [
      { key: 'buy_inquiry',   label: 'Rent vs buy (buy inquiry)' },
      { key: 'renewal',       label: 'Renewal discussion' },
      { key: '90d_checkin',   label: '90-day check-in' },
      { key: '60d_checkin',   label: '60-day check-in' },
      { key: '30d_checkin',   label: '30-day check-in' },
    ],
  };

  // Server refusal → what the agent reads (the gate code travels in err.data.gate)
  var GATE_LABELS = {
    missing_recipient: 'No email address on file',
    unsubscribed: 'Client has unsubscribed',
    declined_outreach: 'Client declined buying / selling outreach',
    lease_ended: 'Term on file ended — record the renewal first',
    lease_historical: 'This is a prior term',
    unsupported_type: 'Unsupported email type',
    confirmation_required: 'Confirmation required',
    preview_mismatch: 'Preview is stale — preview again',
    send_failed: 'Email could not be sent',
  };

  function _gateMessage(err) {
    var d = (err && err.data) || {};
    var label = d.gate ? (GATE_LABELS[d.gate] || d.gate) : '';
    var msg = (d.error || (err && err.message) || 'Request failed');
    return label ? label + ': ' + msg : msg;
  }

  function _partyFlags(party) {
    if (!party) return '';
    var h = '';
    if (party.unsubscribed) h += ' <span title="Unsubscribed from email" style="font-size:9px;font-weight:800;padding:1px 5px;border-radius:4px;background:#FEF2F2;color:#DC2626;">UNSUB</span>';
    if (party.declined_outreach) h += ' <span title="Declined further buying / selling outreach" style="font-size:9px;font-weight:800;padding:1px 5px;border-radius:4px;background:#FFF7ED;color:#C2410C;">DECLINED</span>';
    return h;
  }

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
    h += '<div style="display:flex;gap:8px;">';
    h += '<button style="font-size:11px;font-weight:700;padding:8px 14px;border-radius:8px;background:#fff;color:#374151;border:1px solid #D1D5DB;cursor:pointer;white-space:nowrap;" ' +
      'title="The leases Mallan signed as the landlord\'s representative, read live from REBNY RLS" ' +
      'onclick="LeaseTracker._openRebnyLeasesModal()">' +
      '<i class="fas fa-file-signature" style="margin-right:5px;"></i>Signed leases (REBNY)</button>';
    h += '<button style="font-size:11px;font-weight:700;padding:8px 16px;border-radius:8px;background:#B8860B;color:#fff;border:none;cursor:pointer;white-space:nowrap;" ' +
      'onclick="LeaseTracker._openAddLeaseModal()">' +
      '<i class="fas fa-plus" style="margin-right:5px;"></i>Add Lease</button>';
    h += '</div>';
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
    var cols = ['Address', 'Status', 'Landlord', 'Tenant', 'Rent', 'Lease Ends', 'Signals', 'Outreach', ''];
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

    // Status badge (+ TERM ENDED when the term on file has passed and no renewal is recorded —
    // the tenants may well still be there: the record needs the current term, not a verdict)
    h += '<td style="padding:10px 12px;">';
    h += '<span style="font-size:9px;font-weight:800;padding:3px 8px;border-radius:6px;background:' + sts.bg + ';color:' + sts.color + ';letter-spacing:.3px;white-space:nowrap;">' + E(sts.label) + '</span>';
    if (lease.ended_but_open) {
      h += '<div style="margin-top:4px;"><span title="The term on file ended and the renewal is not recorded. If the tenants are still there, record the renewal (new term) or correct the dates; otherwise mark the tenancy ended." style="font-size:9px;font-weight:800;padding:3px 8px;border-radius:6px;background:#FEF3C7;color:#92400E;border:1px solid #FCD34D;letter-spacing:.3px;white-space:nowrap;">TERM ENDED</span></div>';
    }
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
    h += _partyFlags(ll);
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
      h += _partyFlags(ten);
    } else {
      h += '<span style="color:#DC2626;font-weight:600;font-size:11px;">Vacant</span>';
    }
    h += '</td>';

    // Rent
    h += '<td style="padding:10px 12px;font-weight:700;white-space:nowrap;">';
    h += lease.monthly_rent ? $(Number(lease.monthly_rent)) + '<span style="font-weight:400;color:#9CA3AF;font-size:11px;">/mo</span>' : '<span style="color:#D1D5DB;">-</span>';
    h += '</td>';

    // Lease Ends (with urgency color; negative = ended)
    h += '<td style="padding:10px 12px;white-space:nowrap;">';
    if (lease.end_date) {
      var days = lease.days_until_expiry;
      var urgColor = '#6B7280';
      if (typeof days === 'number') {
        if (days <= 30) urgColor = '#DC2626';
        else if (days <= 90) urgColor = '#F59E0B';
      }
      h += '<span style="font-weight:600;color:' + urgColor + ';">' + _day(lease.end_date) + '</span>';
      if (typeof days === 'number' && days < 0) {
        h += '<div style="font-size:10px;color:#92400E;font-weight:700;">term on file ended ' + Math.abs(days) + 'd ago · renewal not recorded</div>';
      } else if (typeof days === 'number' && days <= 180) {
        h += '<div style="font-size:10px;color:' + urgColor + ';font-weight:700;">' + days + 'd left</div>';
      }
    } else {
      h += '<span style="color:#D1D5DB;">-</span>';
    }
    h += '</td>';

    // Signals — the role-transition intelligence the API already computes (Master §22.7: tenant → buyer,
    // landlord → seller), carried here from the retired second lease panel so nothing useful is lost.
    h += '<td style="padding:10px 12px;">' + _renderSignals(prop) + '</td>';

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

  // ── Signals (tenant → buyer, landlord → seller; flags) ────────────────
  function _renderSignals(prop) {
    var pr = prop.predictions || {};
    var flags = prop.flags || [];
    var chip = function (label, color, bg, title) {
      return '<span title="' + E(title || '') + '" style="display:inline-block;margin:1px 2px 1px 0;font-size:9px;font-weight:800;padding:2px 6px;border-radius:5px;background:' + bg + ';color:' + color + ';white-space:nowrap;">' + E(label) + '</span>';
    };
    var h = '<div style="display:flex;flex-wrap:wrap;max-width:190px;">';
    if (pr.tenant_buy && pr.tenant_buy.score > 0) {
      var tb = pr.tenant_buy;
      h += chip('Buy: ' + tb.label + ' ' + tb.score, tb.score >= 60 ? '#5B21B6' : '#6B7280', tb.score >= 60 ? '#F5F3FF' : '#F3F4F6', 'Tenant → buyer signals: ' + (tb.signals || []).join('; '));
    }
    if (pr.landlord_sell && pr.landlord_sell.score > 0) {
      var ls = pr.landlord_sell;
      h += chip('Sell: ' + ls.label + ' ' + ls.score, ls.score >= 60 ? '#B45309' : '#6B7280', ls.score >= 60 ? '#FFFBEB' : '#F3F4F6', 'Landlord → seller signals: ' + (ls.signals || []).join('; '));
    }
    if (flags.indexOf('high_income_tenant') !== -1) h += chip('HIGH INCOME', '#047857', '#ECFDF5', 'Tenant income above $150K');
    if (prop.qualification && prop.qualification.summary) h += chip(String(prop.qualification.summary).slice(0, 28), '#1D4ED8', '#EFF6FF', 'Financial qualification');
    h += '</div>';
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

  // ── Email dropdown (every item opens the preview; nothing is sent from the menu) ──
  function _renderEmailDropdown(ddId, idx, target) {
    var templates = OUTREACH_MENU[target] || [];
    var fnName = target === 'landlord' ? '_emailLandlord' : '_emailTenant';
    var h = '<div id="' + ddId + '" style="display:none;position:absolute;right:0;top:100%;margin-top:4px;background:#fff;border:1px solid #E5E7EB;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:50;min-width:190px;">';
    h += '<div style="padding:4px;">';
    h += '<div style="font-size:9px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.4px;padding:4px 10px 2px;">Preview &amp; send to ' + E(target) + '</div>';
    for (var i = 0; i < templates.length; i++) {
      var t = templates[i];
      h += '<button data-outreach-type="' + E(t.key) + '" style="display:block;width:100%;text-align:left;font-size:11px;padding:6px 10px;border:none;background:none;cursor:pointer;border-radius:4px;color:#374151;" ' +
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
        h += '<span style="color:' + urgColor + ';font-weight:600;">Ends: ' + _day(lease.end_date) + (typeof days === 'number' && days <= 180 ? ' (' + days + 'd)' : '') + '</span>';
      }
      h += '</div>';

      // Action buttons
      h += '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">';
      h += '<button style="font-size:10px;font-weight:700;padding:5px 10px;border-radius:6px;background:#F3F4F6;color:#374151;border:none;cursor:pointer;" ' +
        'onclick="LeaseTracker._openEditModal(' + i + ')"><i class="fas fa-pen" style="margin-right:3px;"></i>Edit</button>';
      if (ll.email) {
        h += '<button style="font-size:10px;font-weight:700;padding:5px 10px;border-radius:6px;background:#B8860B;color:#fff;border:none;cursor:pointer;" ' +
          'onclick="LeaseTracker._emailLandlord(' + i + ',\'sell_inquiry\')"><i class="fas fa-envelope" style="margin-right:3px;"></i>Preview landlord email</button>';
      }
      if (ten && ten.email) {
        h += '<button style="font-size:10px;font-weight:700;padding:5px 10px;border-radius:6px;background:#374151;color:#fff;border:none;cursor:pointer;" ' +
          'onclick="LeaseTracker._emailTenant(' + i + ',\'buy_inquiry\')"><i class="fas fa-envelope" style="margin-right:3px;"></i>Preview tenant email</button>';
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

  // ── Outreach: preview → explicit confirmation → send ──────────────────
  // The menu never sends. _previewOutreach asks the route for the exact email (mode: preview);
  // the modal shows it; only "Send" in the modal posts mode: send with confirm: true and the
  // preview_token the route issued. A server refusal (missing recipient, unsubscribed,
  // declined, ended lease, unsupported type) is shown with its gate code.
  var _preview = null;

  function _emailLandlord(propIdx, type) { _previewOutreach(propIdx, 'landlord', type); }
  function _emailTenant(propIdx, type) { _previewOutreach(propIdx, 'tenant', type); }

  // Entry point for other panels (e.g. Tenants "Buy vs Rent"): load the tracker data, then open the
  // same preview → confirm flow for one tenancy. Nothing is sent here.
  function previewFor(leaseId, target, type) {
    MallanAPI._fetch('/api/crm/lease-tracker?view=all').then(function (data) {
      _data = data;
      var props = (data && data.properties) || [];
      for (var i = 0; i < props.length; i++) {
        if (String(props[i].id) === String(leaseId)) { _previewOutreach(i, target, type); return; }
      }
      CRM.toast('Tenancy not found in the Lease Tracker', 'error');
    }).catch(function (err) { CRM.toast('Could not load the Lease Tracker: ' + (err.message || ''), 'error'); });
  }

  function _previewOutreach(propIdx, target, type) {
    if (!_data || !_data.properties[propIdx]) return;
    var prop = _data.properties[propIdx];
    CRM.toast('Preparing preview…', 'info');
    MallanAPI._fetch('/api/crm/lease-tracker/' + prop.id + '/outreach', {
      method: 'POST',
      body: JSON.stringify({ target: target, type: type, mode: 'preview' }),
    }).then(function (res) {
      _preview = { propIdx: propIdx, leaseId: prop.id, target: target, type: type, res: res };
      _openPreviewModal(prop, res);
    }).catch(function (err) {
      CRM.toast('Cannot send — ' + _gateMessage(err), 'error');
    });
  }

  function _openPreviewModal(prop, res) {
    _closeModal();
    var rcpt = res.recipient || {};
    var typeLabel = (_preview.type || '').replace(/_/g, ' ');
    var h = '<div id="lt-modal-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;" onclick="if(event.target===this)LeaseTracker._closeModal()">';
    h += '<div style="background:#fff;border-radius:14px;width:100%;max-width:720px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.2);" onclick="event.stopPropagation()">';
    h += '<div style="padding:18px 24px 12px;border-bottom:1px solid #E5E7EB;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">';
    h += '<div style="min-width:0;">';
    h += '<div style="font-size:15px;font-weight:800;color:#111;">Preview — ' + E(typeLabel) + ' to ' + E(_preview.target) + '</div>';
    h += '<div style="font-size:12px;color:#6B7280;margin-top:2px;">' + E(prop.address || '') + (prop.unit ? ' #' + E(prop.unit) : '') + '</div>';
    h += '<div style="font-size:12px;color:#374151;margin-top:8px;line-height:1.6;">';
    h += '<div><span style="color:#9CA3AF;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.4px;display:inline-block;width:62px;">To</span> <strong>' + E(rcpt.name || '') + '</strong> &lt;' + E(rcpt.email || '') + '&gt;</div>';
    h += '<div><span style="color:#9CA3AF;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.4px;display:inline-block;width:62px;">From</span> ' + E((res.from && res.from.name) || '') + ' &lt;' + E((res.from && res.from.email) || '') + '&gt;</div>';
    h += '<div><span style="color:#9CA3AF;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.4px;display:inline-block;width:62px;">Subject</span> <span id="lt-preview-subject">' + E(res.subject || '') + '</span></div>';
    h += '</div></div>';
    h += '<button style="width:32px;height:32px;border-radius:8px;background:#F3F4F6;border:none;cursor:pointer;font-size:14px;color:#6B7280;display:flex;align-items:center;justify-content:center;flex:none;" onclick="LeaseTracker._closeModal()">&times;</button>';
    h += '</div>';
    h += '<div style="flex:1;min-height:240px;overflow:hidden;background:#f5f5f0;">';
    h += '<iframe id="lt-preview-frame" title="Email preview" sandbox="" style="width:100%;height:52vh;border:0;background:#f5f5f0;"></iframe>';
    h += '</div>';
    h += '<div style="padding:12px 24px 18px;border-top:1px solid #E5E7EB;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">';
    h += '<div style="font-size:11px;color:#6B7280;">Nothing has been sent. Sending delivers exactly this email to the address above.</div>';
    h += '<div style="display:flex;gap:10px;">';
    h += '<button style="padding:10px 20px;font-size:12px;font-weight:700;border-radius:8px;background:#fff;color:#6B7280;border:1px solid #E5E7EB;cursor:pointer;" onclick="LeaseTracker._closeModal()">Cancel</button>';
    h += '<button id="lt-preview-send" style="padding:10px 24px;font-size:12px;font-weight:700;border-radius:8px;background:#B8860B;color:#fff;border:none;cursor:pointer;" onclick="LeaseTracker._confirmOutreach()"><i class="fas fa-paper-plane" style="margin-right:6px;"></i>Send this email</button>';
    h += '</div></div>';
    h += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', h);
    var frame = document.getElementById('lt-preview-frame');
    if (frame) frame.srcdoc = res.html || '';
  }

  function _confirmOutreach() {
    if (!_preview || !_preview.res) return;
    var btn = document.getElementById('lt-preview-send');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    var p = _preview;
    // dry_run stays an API-only switch for acceptance runs; the agent's Send always delivers.
    MallanAPI._fetch('/api/crm/lease-tracker/' + p.leaseId + '/outreach', {
      method: 'POST',
      body: JSON.stringify({ target: p.target, type: p.type, mode: 'send', confirm: true, dry_run: false, preview_token: p.res.preview_token }),
    }).then(function (out) {
      var who = (p.res.recipient && (p.res.recipient.name || p.res.recipient.email)) || p.target;
      CRM.toast(out.dry_run ? 'Dry run recorded for ' + who + ' — nothing delivered' : 'Email sent to ' + who, 'success');
      _preview = null;
      _closeModal();
      render();
    }).catch(function (err) {
      CRM.toast('Not sent — ' + _gateMessage(err), 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane" style="margin-right:6px;"></i>Send this email'; }
    });
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
    h += '<input type="hidden" id="lt-edit-start-orig" value="' + E(_formatDateISO(lease.start_date)) + '">';
    h += '<input type="hidden" id="lt-edit-end-orig" value="' + E(_formatDateISO(lease.end_date)) + '">';
    // The recorded term is history: a new term is a renewal (own row); only a typo may overwrite the dates.
    h += '<div style="font-size:11px;color:#6B7280;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:8px 10px;margin:-4px 0 12px;line-height:1.5;">';
    h += '<label style="display:flex;align-items:flex-start;gap:6px;cursor:pointer;"><input type="checkbox" id="lt-edit-correction" style="margin-top:2px;"> <span><strong>These dates are a correction</strong> (a typo in the recorded term). A new term is a renewal — use <em>Record renewal</em> below so the prior term stays in history.</span></label>';
    h += '</div>';

    h += _selectRow('Renewal Status', 'lt-edit-renewal', lease.renewal_status || 'unknown', [
      { value: 'unknown', label: 'Unknown' },
      { value: 'renewing', label: 'Renewing' },
      { value: 'not_renewing', label: 'Not Renewing' },
      { value: 'pending_decision', label: 'Pending Decision' },
    ]);

    if (lease.ended_but_open) {
      h += '<div style="font-size:11px;color:#92400E;background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:8px 10px;margin-bottom:12px;line-height:1.5;"><strong>The term on file ended on ' + E(_day(lease.end_date)) + '</strong> and the renewal is not recorded. If the tenants are still there, use <em>Record renewal</em> with the current term (or tick the correction box if the dates were typed wrong); otherwise <em>Mark tenancy ended</em>. Outreach is blocked until then.</div>';
    }

    // Tenant section
    h += '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 10px;padding-bottom:6px;border-bottom:1px solid #E5E7EB;">Tenant</div>';
    if (ten && ten.id) {
      h += '<input type="hidden" id="lt-edit-tenant-id" value="' + E(String(ten.id)) + '">';
      h += '<div style="font-size:12px;color:#374151;margin-bottom:8px;"><strong>' + E(ten.name || '') + '</strong>' + _partyFlags(ten) + '</div>';
      h += '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#374151;margin-bottom:10px;cursor:pointer;"><input type="checkbox" id="lt-edit-tenant-declined"' + (ten.declined_outreach ? ' checked' : '') + '> Declined further buying / selling outreach (renewal and check-ins still allowed)</label>';
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
      h += '<div style="font-size:12px;color:#374151;margin-bottom:8px;"><strong>' + E(ll.entity_name || ll.name || '') + '</strong>' + _partyFlags(ll) + '</div>';
      h += '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#374151;margin-bottom:10px;cursor:pointer;"><input type="checkbox" id="lt-edit-ll-declined"' + (ll.declined_outreach ? ' checked' : '') + '> Declined further buying / selling outreach (renewal and check-ins still allowed)</label>';
      h += _selectRow('Seller Potential', 'lt-edit-seller-pot', ll.seller_potential || 'none', [
        { value: 'none', label: 'None' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ]);
    } else {
      h += '<div style="font-size:12px;color:#9CA3AF;font-style:italic;">No landlord linked</div>';
    }

    h += '<div style="display:flex;gap:10px;margin-top:20px;justify-content:space-between;flex-wrap:wrap;">';
    h += '<div style="display:flex;gap:8px;">';
    h += '<button id="lt-edit-renew-btn" style="padding:10px 14px;font-size:12px;font-weight:700;border-radius:8px;background:#ECFDF5;color:#065F46;border:1px solid #A7F3D0;cursor:pointer;" title="A renewal is a new term: the prior term is kept as history" onclick="LeaseTracker._openRenewModal(' + propIdx + ')"><i class="fas fa-redo" style="margin-right:5px;"></i>Record renewal</button>';
    h += '<button id="lt-edit-end-btn" style="padding:10px 14px;font-size:12px;font-weight:700;border-radius:8px;background:#fff;color:#991B1B;border:1px solid #FECACA;cursor:pointer;" title="Mark this tenancy ended (historical). Nothing is deleted." onclick="LeaseTracker._markEnded(' + propIdx + ')">Mark tenancy ended</button>';
    h += '</div>';
    h += '<div style="display:flex;gap:10px;">';
    h += '<button style="padding:10px 20px;font-size:12px;font-weight:700;border-radius:8px;background:#fff;color:#6B7280;border:1px solid #E5E7EB;cursor:pointer;" onclick="LeaseTracker._closeModal()">Cancel</button>';
    h += '<button id="lt-edit-save-btn" style="padding:10px 24px;font-size:12px;font-weight:700;border-radius:8px;background:#B8860B;color:#fff;border:none;cursor:pointer;" onclick="LeaseTracker._saveEdit()">Save Changes</button>';
    h += '</div></div>';

    h += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', h);
  }

  // ── Renewal = new term (own row); the prior term becomes history ────────
  function _openRenewModal(propIdx) {
    if (!_data || !_data.properties[propIdx]) return;
    var prop = _data.properties[propIdx];
    var lease = prop.lease || {};
    _closeModal();
    var priorEnd = lease.end_date ? new Date(lease.end_date) : null;
    var defStart = '';
    var defEnd = '';
    if (priorEnd && !isNaN(priorEnd.getTime())) {
      var s = new Date(priorEnd.getTime() + 86400000);
      defStart = s.toISOString().split('T')[0];
      var e = new Date(Date.UTC(s.getUTCFullYear() + 1, s.getUTCMonth(), s.getUTCDate() - 1));
      defEnd = e.toISOString().split('T')[0];
    }
    var h = '<div id="lt-modal-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;" onclick="if(event.target===this)LeaseTracker._closeModal()">';
    h += '<div style="background:#fff;border-radius:14px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2);" onclick="event.stopPropagation()">';
    h += '<div style="padding:20px 24px 0;display:flex;align-items:center;justify-content:space-between;">';
    h += '<div><div style="font-size:16px;font-weight:800;color:#111;">Record renewal</div>';
    h += '<div style="font-size:12px;color:#6B7280;">' + E(prop.address || '') + (prop.unit ? ' #' + E(prop.unit) : '') + ' · prior term ends ' + E(_day(lease.end_date)) + '</div></div>';
    h += '<button style="width:32px;height:32px;border-radius:8px;background:#F3F4F6;border:none;cursor:pointer;font-size:14px;color:#6B7280;display:flex;align-items:center;justify-content:center;" onclick="LeaseTracker._closeModal()">&times;</button>';
    h += '</div>';
    h += '<div style="padding:20px 24px;">';
    h += '<input type="hidden" id="lt-renew-idx" value="' + propIdx + '">';
    h += '<div style="font-size:11px;color:#065F46;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:8px 10px;margin-bottom:14px;line-height:1.5;">A renewal is a <strong>new term</strong>. The prior term is kept as history (status: historical, renewal: renewing); the tenant, landlord and unit carry over.</div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px;">';
    h += _inputRow('New term start *', 'lt-renew-start', defStart, 'date');
    h += _inputRow('New term end *', 'lt-renew-end', defEnd, 'date');
    h += _inputRow('New monthly rent ($)', 'lt-renew-rent', lease.monthly_rent || '', 'number', 'step="0.01" min="0"');
    h += _selectRow('Lease Type', 'lt-renew-type', lease.lease_type || 'standard_1yr', [
      { value: 'standard_1yr', label: 'Standard 1 Year' },
      { value: 'standard_2yr', label: 'Standard 2 Year' },
      { value: 'month_to_month', label: 'Month to Month' },
      { value: 'stabilized', label: 'Rent Stabilized' },
      { value: 'commercial', label: 'Commercial' },
    ]);
    h += '</div>';
    h += '<div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">';
    h += '<button style="padding:10px 20px;font-size:12px;font-weight:700;border-radius:8px;background:#fff;color:#6B7280;border:1px solid #E5E7EB;cursor:pointer;" onclick="LeaseTracker._closeModal()">Cancel</button>';
    h += '<button id="lt-renew-save-btn" style="padding:10px 24px;font-size:12px;font-weight:700;border-radius:8px;background:#059669;color:#fff;border:none;cursor:pointer;" onclick="LeaseTracker._saveRenewal()">Record new term</button>';
    h += '</div></div></div></div>';
    document.body.insertAdjacentHTML('beforeend', h);
  }

  function _saveRenewal() {
    var idx = parseInt(document.getElementById('lt-renew-idx').value, 10);
    if (!_data || !_data.properties[idx]) return;
    var prop = _data.properties[idx];
    var start = document.getElementById('lt-renew-start').value;
    var end = document.getElementById('lt-renew-end').value;
    if (!start || !end) { CRM.toast('New term start and end are required', 'error'); return; }
    var rent = document.getElementById('lt-renew-rent').value;
    var payload = { lease_start_date: start, lease_end_date: end, lease_type: document.getElementById('lt-renew-type').value };
    if (rent) payload.monthly_rent = parseFloat(rent);
    var btn = document.getElementById('lt-renew-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Recording…'; }
    MallanAPI._fetch('/api/crm/active-leases/' + prop.id + '/renew', { method: 'POST', body: JSON.stringify(payload) })
      .then(function (out) {
        CRM.toast(out.deduplicated ? 'This renewal was already recorded (term #' + (out.lease && out.lease.id) + ')' : 'New term recorded (#' + (out.lease && out.lease.id) + '); prior term kept as history', 'success');
        _closeModal();
        render();
      })
      .catch(function (err) {
        CRM.toast('Renewal not recorded — ' + _gateMessage(err), 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Record new term'; }
      });
  }

  function _markEnded(propIdx) {
    if (!_data || !_data.properties[propIdx]) return;
    var prop = _data.properties[propIdx];
    if (!confirm('Mark the tenancy at ' + (prop.address || '') + (prop.unit ? ' #' + prop.unit : '') + ' as ended?\n\nThe record is kept as history (status: historical). Nothing is deleted.')) return;
    MallanAPI._fetch('/api/crm/active-leases/' + prop.id, { method: 'PATCH', body: JSON.stringify({ status: 'historical' }) })
      .then(function () { CRM.toast('Tenancy marked ended (kept as history)', 'success'); _closeModal(); render(); })
      .catch(function (err) { CRM.toast('Not updated — ' + _gateMessage(err), 'error'); });
  }

  function _saveEdit() {
    var idx = parseInt(document.getElementById('lt-edit-idx').value, 10);
    if (!_data || !_data.properties[idx]) return;
    var prop = _data.properties[idx];
    var saving = [];

    var leaseUpdate = {};
    var rent = document.getElementById('lt-edit-rent').value;
    if (rent) leaseUpdate.monthly_rent = parseFloat(rent);
    // Dates travel only when changed; a changed date on an open term needs the correction checkbox,
    // otherwise the route refuses (409 lease_term_locked) and the agent is pointed to Record renewal.
    var start = document.getElementById('lt-edit-start').value;
    var startOrig = (document.getElementById('lt-edit-start-orig') || {}).value || '';
    if (start && start !== startOrig) leaseUpdate.lease_start_date = start;
    var end = document.getElementById('lt-edit-end').value;
    var endOrig = (document.getElementById('lt-edit-end-orig') || {}).value || '';
    if (end && end !== endOrig) leaseUpdate.lease_end_date = end;
    var corr = document.getElementById('lt-edit-correction');
    if (corr && corr.checked && (leaseUpdate.lease_start_date || leaseUpdate.lease_end_date)) leaseUpdate.correction = true;
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
      var tDecl = document.getElementById('lt-edit-tenant-declined');
      if (tDecl) tenantUpdate.nurture_paused = !!tDecl.checked;
      saving.push(MallanAPI._fetch('/api/crm/clients/' + tenantId, { method: 'PATCH', body: JSON.stringify(tenantUpdate) }));
    }

    var llId = document.getElementById('lt-edit-ll-id');
    if (llId && llId.value) {
      var sellerPot = document.getElementById('lt-edit-seller-pot').value;
      var llUpdate = { seller_potential: sellerPot };
      var lDecl = document.getElementById('lt-edit-ll-declined');
      if (lDecl) llUpdate.nurture_paused = !!lDecl.checked;
      saving.push(MallanAPI._fetch('/api/crm/clients/' + llId.value, { method: 'PATCH', body: JSON.stringify(llUpdate) }));
    }

    var saveBtn = document.getElementById('lt-edit-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

    Promise.all(saving).then(function () {
      CRM.toast(leaseUpdate.correction ? 'Lease dates corrected (audited)' : 'Lease updated', 'success');
      _closeModal();
      render();
    }).catch(function (err) {
      var d = (err && err.data) || {};
      if (d.code === 'lease_term_locked') {
        CRM.toast('Dates not changed — ' + d.error + ' Tick "These dates are a correction" for a typo, or use Record renewal.', 'error');
      } else {
        CRM.toast('Save failed: ' + _gateMessage(err), 'error');
      }
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
    });
  }

  // =========================================================================
  // ADD LEASE MODAL
  // =========================================================================
  // prefill (optional): { address, unit, monthly_rent, lease_start_date, lease_end_date, landlord_id,
  //   source: { listing_id, listing_key, close_date, term_assumed } } — from the REBNY signed-leases list
  function _openAddLeaseModal(prefill) {
    _closeModal();
    var pf = prefill || {};
    var src = pf.source || null;

    var h = '<div id="lt-modal-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;" onclick="if(event.target===this)LeaseTracker._closeModal()">';
    h += '<div style="background:#fff;border-radius:14px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2);" onclick="event.stopPropagation()">';

    h += '<div style="padding:20px 24px 0;display:flex;align-items:center;justify-content:space-between;">';
    h += '<div style="font-size:16px;font-weight:800;color:#111;">' + (src ? 'Add signed lease to tracker' : 'Add New Lease') + '</div>';
    h += '<button style="width:32px;height:32px;border-radius:8px;background:#F3F4F6;border:none;cursor:pointer;font-size:14px;color:#6B7280;display:flex;align-items:center;justify-content:center;" onclick="LeaseTracker._closeModal()">&times;</button>';
    h += '</div>';

    h += '<div style="padding:20px 24px;">';
    h += '<input type="hidden" id="lt-add-src-id" value="' + E(src ? src.listing_id || '' : '') + '">';
    h += '<input type="hidden" id="lt-add-src-key" value="' + E(src ? src.listing_key || '' : '') + '">';
    h += '<input type="hidden" id="lt-add-src-close" value="' + E(src ? src.close_date || '' : '') + '">';
    h += '<input type="hidden" id="lt-add-src-term-assumed" value="' + (src && src.term_assumed ? '1' : '') + '">';
    if (src) {
      h += '<div style="font-size:11px;color:#1E3A8A;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:8px 10px;margin-bottom:14px;line-height:1.5;">From REBNY RLS listing <strong>' + E(src.listing_id || '') + '</strong>' + (src.close_date ? ', closed ' + E(src.close_date) : '') + '. Rent is the closed price.' + (src.term_assumed ? ' RLS carries no lease term: the end date assumes 12 months — confirm both dates from the signed lease.' : '') + '</div>';
    }
    h += '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #E5E7EB;">Property</div>';
    h += _inputRow('Address *', 'lt-add-address', pf.address || '', 'text', 'placeholder="425 Park Avenue South"');
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px;">';
    h += _inputRow('Unit', 'lt-add-unit', pf.unit || '', 'text', 'placeholder="4D"');
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
    h += _inputRow('Landlord Client ID *', 'lt-add-ll-id', pf.landlord_id ? String(pf.landlord_id) : '', 'text', 'placeholder="Enter landlord client ID"');

    h += '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 10px;padding-bottom:6px;border-bottom:1px solid #E5E7EB;">Tenant (optional)</div>';
    h += _inputRow('Tenant Client ID', 'lt-add-ten-id', '', 'text', 'placeholder="Leave blank if no tenant lead"');
    h += '<div style="font-size:10px;color:#9CA3AF;margin:-8px 0 8px;font-style:italic;">Or enter tenant info directly:</div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px;">';
    h += _inputRow('Tenant Name', 'lt-add-tname', '', 'text');
    h += _inputRow('Tenant Email', 'lt-add-temail', '', 'email');
    h += '</div>';

    h += '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 10px;padding-bottom:6px;border-bottom:1px solid #E5E7EB;">Lease Terms</div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px;">';
    h += _inputRow('Monthly Rent ($) *', 'lt-add-rent', pf.monthly_rent != null ? String(pf.monthly_rent) : '', 'number', 'step="0.01" min="0"');
    h += _selectRow('Lease Type', 'lt-add-type', 'standard_1yr', [
      { value: 'standard_1yr', label: 'Standard 1 Year' },
      { value: 'standard_2yr', label: 'Standard 2 Year' },
      { value: 'month_to_month', label: 'Month to Month' },
      { value: 'stabilized', label: 'Rent Stabilized' },
      { value: 'commercial', label: 'Commercial' },
    ]);
    h += _inputRow('Lease Start *', 'lt-add-start', pf.lease_start_date || '', 'date');
    h += _inputRow('Lease End *', 'lt-add-end', pf.lease_end_date || '', 'date');
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

    // A signed lease pulled from REBNY carries its RLS provenance on the tenancy (custom_fields);
    // /api/crm/active-leases accepts those fields. Both creation routes dedupe on the same key.
    var srcId = (document.getElementById('lt-add-src-id') || {}).value || '';
    var route = '/api/crm/rentals/leases';
    if (srcId) {
      route = '/api/crm/active-leases';
      payload.custom_fields = {
        rls_listing_id: srcId,
        rls_listing_key: (document.getElementById('lt-add-src-key') || {}).value || null,
        rls_close_date: (document.getElementById('lt-add-src-close') || {}).value || null,
        term_assumed: !!((document.getElementById('lt-add-src-term-assumed') || {}).value),
        source: 'cotality_rls',
      };
      payload.notes = 'Signed lease per REBNY RLS listing ' + srcId + ((document.getElementById('lt-add-src-close') || {}).value ? ' (closed ' + (document.getElementById('lt-add-src-close') || {}).value + ')' : '') + '.';
    }

    MallanAPI._fetch(route, {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(function (out) {
      // The route resolves the tenancy's natural key first: the same landlord, unit and term is one
      // tenancy, however many times it is submitted (deduplicated: true, nothing inserted).
      if (out && out.deduplicated) {
        CRM.toast('This tenancy already exists (#' + (out.lease && out.lease.id) + ') — nothing was duplicated', 'info');
      } else {
        CRM.toast('Lease created (#' + (out && out.lease && out.lease.id) + ')', 'success');
      }
      _closeModal();
      render();
    }).catch(function (err) {
      CRM.toast('Failed: ' + _gateMessage(err), 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Create Lease'; }
    });
  }

  // =========================================================================
  // SIGNED LEASES FROM REBNY (live RLS; Mallan as the landlord's representative)
  // =========================================================================
  var _rebny = null;

  function _openRebnyLeasesModal() {
    _closeModal();
    var h = '<div id="lt-modal-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;" onclick="if(event.target===this)LeaseTracker._closeModal()">';
    h += '<div style="background:#fff;border-radius:14px;width:100%;max-width:980px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.2);" onclick="event.stopPropagation()">';
    h += '<div style="padding:18px 24px 12px;border-bottom:1px solid #E5E7EB;display:flex;align-items:center;justify-content:space-between;gap:12px;">';
    h += '<div><div style="font-size:15px;font-weight:800;color:#111;">Signed leases — Mallan as landlord\'s representative</div>';
    h += '<div id="lt-rebny-sub" style="font-size:12px;color:#6B7280;margin-top:2px;">Reading closed rentals from REBNY RLS (live)…</div></div>';
    h += '<button style="width:32px;height:32px;border-radius:8px;background:#F3F4F6;border:none;cursor:pointer;font-size:14px;color:#6B7280;display:flex;align-items:center;justify-content:center;flex:none;" onclick="LeaseTracker._closeModal()">&times;</button>';
    h += '</div>';
    h += '<div id="lt-rebny-body" style="flex:1;overflow:auto;padding:12px 24px 20px;"><div style="display:flex;align-items:center;justify-content:center;height:120px;"><i class="fas fa-spinner fa-spin" style="font-size:22px;color:#B8860B;"></i></div></div>';
    h += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', h);

    MallanAPI._fetch('/api/crm/lease-tracker/rebny-leases').then(function (res) {
      _rebny = res;
      _renderRebnyLeases(res);
    }).catch(function (err) {
      var body = document.getElementById('lt-rebny-body');
      if (body) body.innerHTML = '<div style="padding:24px;text-align:center;color:#991B1B;font-size:13px;">Could not read REBNY: ' + E(_gateMessage(err)) + '</div>';
    });
  }

  function _renderRebnyLeases(res) {
    var sub = document.getElementById('lt-rebny-sub');
    var body = document.getElementById('lt-rebny-body');
    if (!body) return;
    var rows = res.leases || [];
    if (sub) sub.textContent = rows.length + ' closed rental' + (rows.length === 1 ? '' : 's') + ' listed by Mallan (office ' + (res.office_mls_ids || []).join(', ') + ') · ' + (res.untracked || 0) + ' not yet in the tracker · read ' + D(res.fetched_at);
    if (!rows.length) { body.innerHTML = '<div style="padding:24px;text-align:center;color:#6B7280;font-size:13px;">REBNY returned no closed rentals for Mallan.</div>'; return; }
    var h = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    h += '<thead><tr style="background:#F9FAFB;border-bottom:1px solid #E5E7EB;">';
    ['Address', 'Closed', 'Rent', 'Suggested term', 'Agent', 'Tracker', ''].forEach(function (c) { h += '<th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;">' + c + '</th>'; });
    h += '</tr></thead><tbody>';
    rows.forEach(function (r, i) {
      var t = r.tracking || {};
      var s = r.suggested || {};
      h += '<tr style="border-bottom:1px solid #F3F4F6;">';
      h += '<td style="padding:8px 10px;"><div style="font-weight:700;color:#111;">' + E(r.address || '') + (r.unit ? ' #' + E(r.unit) : '') + '</div><div style="font-size:10px;color:#9CA3AF;">' + E(r.listing_id || '') + '</div></td>';
      h += '<td style="padding:8px 10px;white-space:nowrap;">' + E(r.close_date || '-') + '</td>';
      h += '<td style="padding:8px 10px;white-space:nowrap;font-weight:700;">' + (r.monthly_rent ? $(Number(r.monthly_rent)) + '<span style="font-weight:400;color:#9CA3AF;font-size:10px;">/mo</span>' : '-') + '</td>';
      h += '<td style="padding:8px 10px;white-space:nowrap;font-size:11px;">' + E(s.lease_start_date || '?') + ' → ' + E(s.lease_end_date || '?') + (s.term_assumed ? '<div style="font-size:10px;color:#92400E;">12 months assumed — confirm</div>' : '') + '</td>';
      h += '<td style="padding:8px 10px;white-space:nowrap;font-size:11px;">' + E((r.list_agent && r.list_agent.name) || '') + '</td>';
      h += '<td style="padding:8px 10px;white-space:nowrap;">';
      if (t.status === 'tracked') {
        h += '<span style="font-size:9px;font-weight:800;padding:3px 8px;border-radius:6px;background:#ECFDF5;color:#059669;">TRACKED #' + E(String(t.lease_id)) + '</span><div style="font-size:10px;color:#6B7280;">' + E(t.lease_start_date || '') + ' → ' + E(t.lease_end_date || '') + (t.landlord ? ' · ' + E(t.landlord.name) : '') + '</div>';
      } else if (t.status === 'tracked_other_term') {
        h += '<span style="font-size:9px;font-weight:800;padding:3px 8px;border-radius:6px;background:#FFFBEB;color:#92400E;">OTHER TERM ON FILE #' + E(String(t.lease_id)) + '</span><div style="font-size:10px;color:#6B7280;">' + E(t.lease_start_date || '') + ' → ' + E(t.lease_end_date || '') + (t.landlord ? ' · ' + E(t.landlord.name) : '') + '</div>';
      } else {
        h += '<span style="font-size:9px;font-weight:800;padding:3px 8px;border-radius:6px;background:#FEF2F2;color:#DC2626;">NOT TRACKED</span>';
      }
      h += '</td>';
      h += '<td style="padding:8px 10px;white-space:nowrap;">';
      if (t.status !== 'tracked') {
        h += '<button style="font-size:10px;font-weight:700;padding:5px 10px;border-radius:6px;background:#B8860B;color:#fff;border:none;cursor:pointer;" onclick="LeaseTracker._addFromRebny(' + i + ')"><i class="fas fa-plus" style="margin-right:4px;"></i>Add to tracker</button>';
      }
      h += '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<div style="font-size:10px;color:#9CA3AF;margin-top:10px;line-height:1.5;">Source: live REBNY RLS (Cotality) — closed rentals whose list office is Mallan. RLS serves the closed price and dates; it carries no lease term, tenant or landlord name. Adding a lease opens the form prefilled; the same unit and term is never added twice.</div>';
    body.innerHTML = h;
  }

  function _addFromRebny(i) {
    if (!_rebny || !_rebny.leases || !_rebny.leases[i]) return;
    var r = _rebny.leases[i];
    var s = r.suggested || {};
    _openAddLeaseModal({
      address: s.address || r.address,
      unit: s.unit || r.unit,
      monthly_rent: s.monthly_rent,
      lease_start_date: s.lease_start_date,
      lease_end_date: s.lease_end_date,
      landlord_id: s.landlord ? s.landlord.id : '',
      source: { listing_id: r.listing_id, listing_key: r.listing_key, close_date: r.close_date, term_assumed: !!s.term_assumed },
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
    _previewOutreach: _previewOutreach,
    _confirmOutreach: _confirmOutreach,
    _openRenewModal: _openRenewModal,
    _saveRenewal: _saveRenewal,
    _markEnded: _markEnded,
    _openRebnyLeasesModal: _openRebnyLeasesModal,
    _addFromRebny: _addFromRebny,
    previewFor: previewFor,
    OUTREACH_MENU: OUTREACH_MENU,
  };
})();
