// =============================================================================
// LEASE TRACKER — Property cards, AI predictions, outreach timeline
// Dashboard panel for tracking leases, vacancies, and cross-sell opportunities
// =============================================================================
/* global CRM, Router, MallanAPI, Utils */

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

  // --- Priority score color -------------------------------------------------
  function _priorityColor(score) {
    if (score >= 80) return '#DC2626';
    if (score >= 60) return '#F59E0B';
    if (score >= 40) return '#3B82F6';
    return '#9CA3AF';
  }

  // --- Prediction bar color -------------------------------------------------
  function _predColor(score) {
    if (score >= 70) return '#B8860B';
    if (score >= 50) return '#3B82F6';
    return '#9CA3AF';
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
          '<p class="text-sm text-gray-500">Failed to load lease tracker: ' + E(err.message || 'Unknown error') + '</p>' +
          '<button class="mt-4 px-4 py-2 text-xs font-bold rounded-lg" style="background:#B8860B;color:#fff;" onclick="LeaseTracker.render()">Retry</button>' +
          '</div>';
      });
  }

  // =========================================================================
  // DASHBOARD ASSEMBLY
  // =========================================================================
  function _renderDashboard(c) {
    var s = (_data && _data.summary) || {};
    var props = (_data && _data.properties) || [];

    var h = '<div style="max-width:1200px;margin:0 auto;">';

    // 1 — KPI summary bar
    h += _renderKPI(s);

    // 2 — Filter tabs
    h += _renderFilters(s);

    // 3 — Property cards or empty state
    if (props.length === 0) {
      h += _renderEmpty();
    } else {
      h += '<div style="display:flex;flex-direction:column;gap:16px;">';
      for (var i = 0; i < props.length; i++) {
        h += _renderPropertyCard(props[i], i);
      }
      h += '</div>';
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
      { icon: 'fa-fire',        color: '#DC2626', value: s.high_priority || 0,    label: 'High Priority' },
    ];

    var h = '<div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;">';
    for (var i = 0; i < cards.length; i++) {
      var k = cards[i];
      h += '<div style="display:flex;align-items:center;gap:12px;padding:14px 18px;background:#fff;border:1px solid #E5E7EB;border-radius:12px;flex:1;min-width:130px;">' +
        '<div style="width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:' + k.color + '15;color:' + k.color + ';font-size:15px;">' +
          '<i class="fas ' + k.icon + '"></i>' +
        '</div>' +
        '<div>' +
          '<div style="font-size:20px;font-weight:800;color:#111;">' + k.value + '</div>' +
          '<div style="font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.3px;">' + E(k.label) + '</div>' +
        '</div>' +
      '</div>';
    }
    h += '</div>';
    return h;
  }

  // =========================================================================
  // FILTER TABS
  // =========================================================================
  function _renderFilters(s) {
    var tabs = [
      { key: 'all',         label: 'All',          count: s.total_properties || 0 },
      { key: 'expiring',    label: 'Expiring',      count: (s.expiring_90d || 0) },
      { key: 'vacant',      label: 'Vacant',        count: s.vacant || 0 },
      { key: 'dual_listed', label: 'Dual Listed',   count: s.dual_listed || 0 },
      { key: 'opportunities', label: 'High Priority', count: s.high_priority || 0 },
    ];

    var h = '<div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;">';
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
    h += '</div>';
    return h;
  }

  // =========================================================================
  // EMPTY STATE
  // =========================================================================
  function _renderEmpty() {
    return '<div class="text-center" style="padding:64px 0;">' +
      '<i class="fas fa-calendar-alt" style="font-size:36px;color:#D1D5DB;display:block;margin-bottom:16px;"></i>' +
      '<p style="font-size:18px;font-weight:700;color:#374151;margin-bottom:4px;">No Active Leases</p>' +
      '<p style="font-size:14px;color:#6B7280;">Add landlords and create leases to start tracking.</p>' +
    '</div>';
  }

  // =========================================================================
  // PROPERTY CARD
  // =========================================================================
  function _renderPropertyCard(prop, idx) {
    var lease  = prop.lease || {};
    var ll     = prop.landlord || {};
    var ten    = prop.tenant || null;
    var preds  = prop.predictions || {};
    var out    = prop.outreach || {};
    var lists  = prop.listings || [];
    var flags  = prop.flags || [];
    var score  = typeof prop.priority_score === 'number' ? prop.priority_score : 0;
    var sts    = STATUS_MAP[prop.status] || STATUS_MAP.rented;

    var h = '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:20px;position:relative;">';

    // --- Header row: priority badge + address + status badge ----------------
    h += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap;">';

    // Priority circle
    var pc = _priorityColor(score);
    h += '<div style="width:36px;height:36px;border-radius:50%;background:' + pc + '15;color:' + pc + ';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0;border:2px solid ' + pc + ';">' + score + '</div>';

    // Address
    h += '<div style="flex:1;min-width:0;">';
    h += '<div style="font-size:15px;font-weight:800;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
      E(prop.address || '') + (prop.unit ? ' #' + E(prop.unit) : '') +
      (prop.borough ? '<span style="font-weight:500;color:#6B7280;font-size:12px;margin-left:6px;">' + E(prop.borough) + '</span>' : '') +
    '</div>';
    // Flag pills
    if (flags.length > 0) {
      h += '<div style="display:flex;gap:4px;margin-top:3px;flex-wrap:wrap;">';
      for (var fi = 0; fi < flags.length; fi++) {
        h += '<span style="font-size:9px;font-weight:600;padding:1px 6px;border-radius:4px;background:#F3F4F6;color:#6B7280;">' + E(flags[fi].replace(/_/g, ' ')) + '</span>';
      }
      h += '</div>';
    }
    h += '</div>';

    // Status badge
    h += '<span style="font-size:10px;font-weight:800;padding:4px 10px;border-radius:8px;background:' + sts.bg + ';color:' + sts.color + ';letter-spacing:.3px;white-space:nowrap;">' + E(sts.label) + '</span>';
    h += '</div>';

    // --- Landlord + Tenant columns ------------------------------------------
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px;">';

    // Landlord
    h += '<div>';
    h += '<div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Landlord</div>';
    h += '<div style="font-size:13px;font-weight:700;color:#111;">' + E(ll.entity_name || ll.name || '-') + '</div>';
    if (ll.entity_name && ll.name) {
      h += '<div style="font-size:11px;color:#6B7280;">' + E(ll.name) + '</div>';
    }
    if (ll.email) h += '<div style="font-size:11px;color:#6B7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + E(ll.email) + '</div>';
    if (ll.phone) h += '<div style="font-size:11px;color:#6B7280;">' + E(ll.phone) + '</div>';
    h += '</div>';

    // Tenant
    h += '<div>';
    h += '<div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Tenant</div>';
    if (ten) {
      h += '<div style="font-size:13px;font-weight:700;color:#111;">' + E(ten.name || '-') + '</div>';
      if (ten.email) h += '<div style="font-size:11px;color:#6B7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + E(ten.email) + '</div>';
      if (ten.phone) h += '<div style="font-size:11px;color:#6B7280;">' + E(ten.phone) + '</div>';
      if (ten.annual_income) {
        var hasHighIncome = flags.indexOf('high_income_tenant') !== -1;
        h += '<div style="font-size:11px;color:' + (hasHighIncome ? '#B8860B' : '#6B7280') + ';font-weight:' + (hasHighIncome ? '700' : '400') + ';">Income: ' + $(ten.annual_income) + (hasHighIncome ? ' \u26A1' : '') + '</div>';
      }
    } else {
      h += '<div style="font-size:12px;color:#D1D5DB;font-style:italic;">Vacant</div>';
    }
    h += '</div>';
    h += '</div>';

    // --- Lease info row -----------------------------------------------------
    h += '<div style="display:flex;gap:16px;align-items:baseline;margin-bottom:14px;flex-wrap:wrap;padding:10px 14px;background:#F9FAFB;border-radius:10px;">';

    h += '<div style="flex:1;min-width:160px;">';
    h += '<span style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;">Lease</span> ';
    h += '<span style="font-size:12px;color:#374151;font-weight:600;">' +
      (lease.start_date ? D(lease.start_date) : '?') + ' \u2192 ' +
      (lease.end_date ? D(lease.end_date) : '?') + '</span>';
    h += '</div>';

    if (lease.monthly_rent) {
      h += '<div style="font-size:12px;color:#374151;font-weight:600;">Rent: <span style="color:#111;font-weight:800;">' + $(lease.monthly_rent) + '/mo</span></div>';
    }
    if (lease.lease_type) {
      h += '<div style="font-size:11px;color:#6B7280;">Type: ' + E(lease.lease_type) + '</div>';
    }
    h += '</div>';

    // Expiry + renewal row
    h += '<div style="display:flex;gap:16px;align-items:center;margin-bottom:14px;flex-wrap:wrap;">';
    if (typeof lease.days_until_expiry === 'number') {
      var urgColor = lease.urgency === '30d' ? '#DC2626' : lease.urgency === '60d' ? '#F59E0B' : lease.urgency === '90d' ? '#F59E0B' : '#6B7280';
      h += '<div style="font-size:12px;font-weight:700;color:' + urgColor + ';">Expires in: ' + lease.days_until_expiry + ' days</div>';
    }
    if (lease.renewal_status) {
      h += '<div style="font-size:11px;color:#6B7280;">Renewal: ' + E(lease.renewal_status) + '</div>';
    }
    h += '</div>';

    // --- Active listings ----------------------------------------------------
    if (lists.length > 0) {
      h += '<div style="margin-bottom:14px;">';
      h += '<div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Listings</div>';
      for (var li = 0; li < lists.length; li++) {
        var lst = lists[li];
        var dotColor = lst.listing_type === 'sale' ? '#F59E0B' : '#3B82F6';
        var priceStr = lst.list_price ? $(lst.list_price) : '-';
        if (lst.listing_type !== 'sale') priceStr += '/mo';
        h += '<div style="font-size:12px;color:#374151;margin-bottom:2px;">' +
          '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + dotColor + ';margin-right:6px;vertical-align:middle;"></span>' +
          '<span style="font-weight:600;text-transform:capitalize;">' + E(lst.listing_type || 'Rental') + ':</span> ' +
          '<span style="font-weight:700;">' + priceStr + '</span>' +
          ' <span style="color:#6B7280;">(' + E(lst.status || '-') + (typeof lst.days_on_market === 'number' ? ', ' + lst.days_on_market + ' DOM' : '') + ')</span>' +
        '</div>';
      }
      h += '</div>';
    }

    // --- AI Predictions section ---------------------------------------------
    if (preds && (preds.landlord_sell || preds.tenant_buy || preds.lease_renewal || preds.outreach_timing)) {
      h += _renderPredictions(preds);
    }

    // --- Outreach timeline --------------------------------------------------
    h += _renderOutreachTimeline(lease, out);

    // --- Action buttons -----------------------------------------------------
    h += '<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">';

    // Email landlord dropdown
    h += '<div style="position:relative;display:inline-block;">';
    h += '<button style="font-size:11px;font-weight:700;padding:6px 14px;border-radius:8px;background:#B8860B;color:#fff;border:none;cursor:pointer;" ' +
      'onclick="LeaseTracker._toggleDropdown(event,\'ll-dd-' + idx + '\')">' +
      '<i class="fas fa-envelope" style="margin-right:4px;"></i>Email Landlord <i class="fas fa-caret-down" style="margin-left:4px;"></i></button>';
    h += '<div id="ll-dd-' + idx + '" style="display:none;position:absolute;left:0;top:100%;margin-top:4px;background:#fff;border:1px solid #E5E7EB;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:50;min-width:170px;">';
    h += '<div style="padding:4px;">';
    h += '<button style="display:block;width:100%;text-align:left;font-size:11px;padding:6px 10px;border:none;background:none;cursor:pointer;border-radius:4px;color:#374151;" onmouseover="this.style.background=\'#F3F4F6\'" onmouseout="this.style.background=\'none\'" onclick="LeaseTracker._emailLandlord(' + idx + ',\'sell_inquiry\')">Sell inquiry</button>';
    h += '<button style="display:block;width:100%;text-align:left;font-size:11px;padding:6px 10px;border:none;background:none;cursor:pointer;border-radius:4px;color:#374151;" onmouseover="this.style.background=\'#F3F4F6\'" onmouseout="this.style.background=\'none\'" onclick="LeaseTracker._emailLandlord(' + idx + ',\'market_update\')">Market update</button>';
    h += '<button style="display:block;width:100%;text-align:left;font-size:11px;padding:6px 10px;border:none;background:none;cursor:pointer;border-radius:4px;color:#374151;" onmouseover="this.style.background=\'#F3F4F6\'" onmouseout="this.style.background=\'none\'" onclick="LeaseTracker._emailLandlord(' + idx + ',\'90d_checkin\')">90d check-in</button>';
    h += '</div></div></div>';

    // Email tenant dropdown
    if (ten) {
      h += '<div style="position:relative;display:inline-block;">';
      h += '<button style="font-size:11px;font-weight:700;padding:6px 14px;border-radius:8px;background:#374151;color:#fff;border:none;cursor:pointer;" ' +
        'onclick="LeaseTracker._toggleDropdown(event,\'tn-dd-' + idx + '\')">' +
        '<i class="fas fa-envelope" style="margin-right:4px;"></i>Email Tenant <i class="fas fa-caret-down" style="margin-left:4px;"></i></button>';
      h += '<div id="tn-dd-' + idx + '" style="display:none;position:absolute;left:0;top:100%;margin-top:4px;background:#fff;border:1px solid #E5E7EB;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:50;min-width:170px;">';
      h += '<div style="padding:4px;">';
      h += '<button style="display:block;width:100%;text-align:left;font-size:11px;padding:6px 10px;border:none;background:none;cursor:pointer;border-radius:4px;color:#374151;" onmouseover="this.style.background=\'#F3F4F6\'" onmouseout="this.style.background=\'none\'" onclick="LeaseTracker._emailTenant(' + idx + ',\'buy_opportunity\')">Buy opportunity</button>';
      h += '<button style="display:block;width:100%;text-align:left;font-size:11px;padding:6px 10px;border:none;background:none;cursor:pointer;border-radius:4px;color:#374151;" onmouseover="this.style.background=\'#F3F4F6\'" onmouseout="this.style.background=\'none\'" onclick="LeaseTracker._emailTenant(' + idx + ',\'renewal_reminder\')">Renewal reminder</button>';
      h += '<button style="display:block;width:100%;text-align:left;font-size:11px;padding:6px 10px;border:none;background:none;cursor:pointer;border-radius:4px;color:#374151;" onmouseover="this.style.background=\'#F3F4F6\'" onmouseout="this.style.background=\'none\'" onclick="LeaseTracker._emailTenant(' + idx + ',\'new_listings\')">New listings</button>';
      h += '</div></div></div>';
    }

    // View landlord button
    if (ll.id) {
      h += '<button style="font-size:11px;font-weight:700;padding:6px 14px;border-radius:8px;background:#fff;color:#374151;border:1px solid #E5E7EB;cursor:pointer;" ' +
        'onmouseover="this.style.borderColor=\'#B8860B\';this.style.color=\'#B8860B\';" ' +
        'onmouseout="this.style.borderColor=\'#E5E7EB\';this.style.color=\'#374151\';" ' +
        'onclick="LeaseTracker._openClient(\'' + E(String(ll.id)) + '\')">' +
        '<i class="fas fa-user" style="margin-right:4px;"></i>View Landlord</button>';
    }

    // View tenant button
    if (ten && ten.id) {
      h += '<button style="font-size:11px;font-weight:700;padding:6px 14px;border-radius:8px;background:#fff;color:#374151;border:1px solid #E5E7EB;cursor:pointer;" ' +
        'onmouseover="this.style.borderColor=\'#B8860B\';this.style.color=\'#B8860B\';" ' +
        'onmouseout="this.style.borderColor=\'#E5E7EB\';this.style.color=\'#374151\';" ' +
        'onclick="LeaseTracker._openClient(\'' + E(String(ten.id)) + '\')">' +
        '<i class="fas fa-user" style="margin-right:4px;"></i>View Tenant</button>';
    }

    h += '</div>'; // action buttons
    h += '</div>'; // card wrapper
    return h;
  }

  // =========================================================================
  // AI PREDICTIONS SECTION
  // =========================================================================
  function _renderPredictions(preds) {
    var sell  = preds.landlord_sell || {};
    var buy   = preds.tenant_buy || {};
    var renew = preds.lease_renewal || {};
    var outT  = preds.outreach_timing || {};

    var h = '<div style="background:#FAFAFA;border:1px solid #E5E7EB;border-radius:10px;padding:14px;margin-bottom:14px;">';
    h += '<div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">AI Predictions</div>';

    // 3-column grid: sell / buy / renew
    h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:10px;">';

    h += _renderPredictionBar(sell.score, sell.label, sell.signals, 'Sell', '#B8860B');
    h += _renderPredictionBar(buy.score, buy.label, buy.signals, 'Buy', '#3B82F6');
    h += _renderPredictionBar(renew.score, renew.label, renew.signals, 'Renew', '#059669');

    h += '</div>';

    // Outreach timing — full-width bar
    if (outT.score != null) {
      var otColor = outT.score >= 70 ? '#B8860B' : outT.score >= 50 ? '#3B82F6' : '#9CA3AF';
      h += '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #E5E7EB;margin-top:4px;">';
      h += '<div style="font-size:11px;color:#6B7280;white-space:nowrap;"><i class="fas fa-clock" style="margin-right:4px;color:' + otColor + ';"></i>Outreach: <span style="font-weight:800;color:' + otColor + ';">' + (outT.score || 0) + '%</span> <span style="font-weight:600;color:' + otColor + ';">' + E(outT.label || '') + '</span></div>';
      h += '<div style="flex:1;height:6px;background:#E5E7EB;border-radius:3px;overflow:hidden;">';
      h += '<div style="height:100%;width:' + Math.min(outT.score || 0, 100) + '%;background:' + otColor + ';border-radius:3px;"></div>';
      h += '</div>';
      h += '</div>';
      if (outT.signals && outT.signals.length > 0) {
        h += '<div style="font-size:10px;color:#9CA3AF;margin-top:2px;font-style:italic;">';
        for (var si = 0; si < outT.signals.length && si < 2; si++) {
          if (si > 0) h += ' \u2022 ';
          h += E(outT.signals[si]);
        }
        h += '</div>';
      }
    }

    h += '</div>';
    return h;
  }

  // =========================================================================
  // SINGLE PREDICTION BAR
  // =========================================================================
  function _renderPredictionBar(score, label, signals, title, color) {
    var s = typeof score === 'number' ? score : 0;
    var c = _predColor(s);

    var h = '<div>';
    h += '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">';
    h += '<span style="font-size:11px;font-weight:700;color:#374151;">' + E(title) + '</span>';
    h += '<span style="font-size:12px;font-weight:800;color:' + c + ';">' + s + '%</span>';
    h += '</div>';

    // Label
    if (label) {
      h += '<div style="font-size:10px;font-weight:600;color:' + c + ';margin-bottom:4px;">' + E(label) + '</div>';
    }

    // Progress bar
    h += '<div style="height:6px;background:#E5E7EB;border-radius:3px;overflow:hidden;margin-bottom:4px;">';
    h += '<div style="height:100%;width:' + Math.min(s, 100) + '%;background:' + (color || c) + ';border-radius:3px;"></div>';
    h += '</div>';

    // Top signal
    if (signals && signals.length > 0) {
      h += '<div style="font-size:10px;color:#9CA3AF;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + E(signals[0]) + '</div>';
    }

    h += '</div>';
    return h;
  }

  // =========================================================================
  // OUTREACH TIMELINE
  // =========================================================================
  function _renderOutreachTimeline(lease, outreach) {
    var o = outreach || {};
    var daysLeft = (lease && typeof lease.days_until_expiry === 'number') ? lease.days_until_expiry : null;
    var endDate = lease && lease.end_date ? new Date(lease.end_date) : null;
    var now = new Date();

    // Timeline milestones: 6mo (180d), 90d, 60d, 30d
    var milestones = [
      { key: '6mo',  label: '6mo',  sent: !!o.landlord_6mo_sent,  date: o.landlord_6mo_date,  targetDays: 180 },
      { key: '90d',  label: '90d',  sent: !!o.landlord_90d_sent,  date: o.landlord_90d_date,  targetDays: 90 },
      { key: '60d',  label: '60d',  sent: !!o.landlord_60d_sent,  date: o.landlord_60d_date,  targetDays: 60 },
      { key: '30d',  label: '30d',  sent: !!o.landlord_30d_sent,  date: o.landlord_30d_date,  targetDays: 30 },
    ];

    var h = '<div style="margin-bottom:0;">';
    h += '<div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Outreach Timeline</div>';

    h += '<div style="display:flex;align-items:center;gap:0;flex-wrap:wrap;">';
    for (var i = 0; i < milestones.length; i++) {
      var m = milestones[i];
      var icon, iconColor, statusLabel;

      if (m.sent) {
        // Sent
        icon = '\u2705';
        iconColor = '#059669';
        statusLabel = m.date ? D(m.date) : 'Sent';
      } else if (daysLeft !== null && daysLeft <= m.targetDays && daysLeft > (m.targetDays - 7)) {
        // Due soon (within 7 days of target)
        icon = '\u23F3';
        iconColor = '#B8860B';
        statusLabel = 'Due soon';
      } else if (daysLeft !== null && daysLeft < m.targetDays) {
        // Overdue (past target and not sent)
        icon = '\uD83D\uDD34';
        iconColor = '#DC2626';
        statusLabel = 'Overdue';
      } else {
        // Future
        icon = '\u25CB';
        iconColor = '#9CA3AF';
        statusLabel = '';
      }

      h += '<div style="display:flex;align-items:center;gap:4px;' + (i < milestones.length - 1 ? 'margin-right:6px;' : '') + '">';
      h += '<div style="text-align:center;min-width:58px;">';
      h += '<div style="font-size:14px;line-height:1;">' + icon + '</div>';
      h += '<div style="font-size:10px;font-weight:700;color:' + iconColor + ';margin-top:2px;">' + E(m.label) + '</div>';
      if (statusLabel) {
        h += '<div style="font-size:9px;color:' + iconColor + ';">' + E(statusLabel) + '</div>';
      }
      h += '</div>';

      // Connector line
      if (i < milestones.length - 1) {
        h += '<div style="width:20px;height:2px;background:#E5E7EB;flex-shrink:0;"></div>';
      }
    }

    // Lease End marker
    h += '<div style="width:20px;height:2px;background:#E5E7EB;flex-shrink:0;"></div>';
    h += '<div style="text-align:center;min-width:50px;">';
    h += '<div style="font-size:11px;color:#DC2626;"><i class="fas fa-flag"></i></div>';
    h += '<div style="font-size:10px;font-weight:700;color:#DC2626;">End</div>';
    if (endDate && !isNaN(endDate.getTime())) {
      h += '<div style="font-size:9px;color:#9CA3AF;">' + D(lease.end_date) + '</div>';
    }
    h += '</div>';

    h += '</div>'; // flex row
    h += '</div>'; // wrapper
    return h;
  }

  // =========================================================================
  // STATUS BADGE
  // =========================================================================
  function _renderStatusBadge(status) {
    var s = STATUS_MAP[status] || STATUS_MAP.rented;
    return '<span style="font-size:10px;font-weight:800;padding:4px 10px;border-radius:8px;background:' + s.bg + ';color:' + s.color + ';letter-spacing:.3px;">' + E(s.label) + '</span>';
  }

  // =========================================================================
  // PRIORITY BADGE
  // =========================================================================
  function _renderPriorityBadge(score) {
    var c = _priorityColor(score);
    return '<div style="width:36px;height:36px;border-radius:50%;background:' + c + '15;color:' + c + ';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;border:2px solid ' + c + ';">' + score + '</div>';
  }

  // =========================================================================
  // ACTIONS
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

    // Close all open dropdowns first
    var allDDs = document.querySelectorAll('[id^="ll-dd-"],[id^="tn-dd-"]');
    for (var i = 0; i < allDDs.length; i++) {
      allDDs[i].style.display = 'none';
    }

    if (!isOpen) {
      el.style.display = 'block';
      // Close on next click anywhere
      var closer = function () {
        el.style.display = 'none';
        document.removeEventListener('click', closer);
      };
      setTimeout(function () {
        document.addEventListener('click', closer);
      }, 0);
    }
  }

  function _emailLandlord(propIdx, type) {
    CRM.toast('Outreach API coming next', 'info');
  }

  function _emailTenant(propIdx, type) {
    CRM.toast('Outreach API coming next', 'info');
  }

  function _openClient(clientId) {
    Router.navigate('/broker/people/clients');
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
  };
})();
