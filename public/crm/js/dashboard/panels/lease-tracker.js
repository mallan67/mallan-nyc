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
  // _ago removed — was unused

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

  // _predColor removed — replaced by qualification + signals

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

    // 2 — Filter tabs + Add Lease button
    h += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:16px;flex-wrap:wrap;">';
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
    h += _renderFilterButtons(s);
    h += '</div>';
    h += '<button style="font-size:11px;font-weight:700;padding:8px 16px;border-radius:8px;background:#B8860B;color:#fff;border:none;cursor:pointer;white-space:nowrap;" ' +
      'onclick="LeaseTracker._openAddLeaseModal()">' +
      '<i class="fas fa-plus" style="margin-right:5px;"></i>Add Lease</button>';
    h += '</div>';

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
    // Legacy wrapper — kept for compatibility but dashboard now uses _renderFilterButtons
    return '<div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;">' + _renderFilterButtons(s) + '</div>';
  }

  function _renderFilterButtons(s) {
    var tabs = [
      { key: 'all',         label: 'All',          count: s.total_properties || 0 },
      { key: 'expiring',    label: 'Expiring',      count: (s.expiring_90d || 0) },
      { key: 'vacant',      label: 'Vacant',        count: s.vacant || 0 },
      { key: 'dual_listed', label: 'Dual Listed',   count: s.dual_listed || 0 },
      { key: 'opportunities', label: 'High Priority', count: s.high_priority || 0 },
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

    // Edit button
    h += '<button style="width:30px;height:30px;border-radius:8px;background:#F3F4F6;color:#6B7280;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;" ' +
      'title="Edit lease" ' +
      'onmouseover="this.style.background=\'#B8860B\';this.style.color=\'#fff\';" ' +
      'onmouseout="this.style.background=\'#F3F4F6\';this.style.color=\'#6B7280\';" ' +
      'onclick="LeaseTracker._openEditModal(' + idx + ')">' +
      '<i class="fas fa-pen" style="font-size:11px;"></i></button>';

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

    // --- Tenant Qualification (real financial math) --------------------------
    var qual = prop.qualification || null;
    if (qual && qual.has_data) {
      h += _renderQualification(qual, ten);
    } else if (ten) {
      h += '<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:12px 14px;margin-bottom:14px;">';
      h += '<div style="font-size:11px;color:#92400E;font-weight:600;">';
      h += '<i class="fas fa-info-circle" style="margin-right:6px;"></i>';
      h += 'Add tenant income & financial data via Edit to see purchase qualification';
      if (qual && qual.missing_fields && qual.missing_fields.length) {
        h += ' <span style="color:#B45309;font-weight:400;">(missing: ' + E(qual.missing_fields.join(', ')) + ')</span>';
      }
      h += '</div></div>';
    }

    // --- Landlord Sell Signals + Lease Renewal --------------------------------
    if (preds && (preds.landlord_sell || preds.lease_renewal)) {
      h += _renderSignals(preds);
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

    // Mark as Seller button (only if landlord exists)
    if (ll.id) {
      h += '<button style="font-size:11px;font-weight:700;padding:6px 14px;border-radius:8px;background:#F59E0B15;color:#B45309;border:1px solid #F59E0B;cursor:pointer;" ' +
        'onmouseover="this.style.background=\'#F59E0B\';this.style.color=\'#fff\';" ' +
        'onmouseout="this.style.background=\'#F59E0B15\';this.style.color=\'#B45309\';" ' +
        'onclick="LeaseTracker._convertToSeller(' + idx + ')">' +
        '<i class="fas fa-exchange-alt" style="margin-right:4px;"></i>Add Seller Role</button>';
    }

    h += '</div>'; // action buttons
    h += '</div>'; // card wrapper
    return h;
  }

  // =========================================================================
  // TENANT QUALIFICATION (real NYC underwriting math)
  // =========================================================================
  function _renderQualification(qual, tenant) {
    var h = '<div style="background:#FAFAFA;border:1px solid #E5E7EB;border-radius:10px;padding:14px;margin-bottom:14px;">';
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">';
    h += '<div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;">Tenant Qualification</div>';
    h += '<div style="font-size:10px;color:#6B7280;">Income: ' + $(qual.effective_income) + (qual.monthly_debt > 0 ? ' \u2022 Debt: ' + $(qual.monthly_debt * 12) + '/yr' : '') + '</div>';
    h += '</div>';

    // Co-op and Condo side by side
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px;">';
    h += _renderQualCol(qual.coop, 'Co-op');
    h += _renderQualCol(qual.condo, 'Condo');
    h += '</div>';

    // Rental qualification
    var r = qual.rental || {};
    if (r.max_monthly_rent > 0) {
      h += '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff;border:1px solid #E5E7EB;border-radius:8px;">';
      h += '<i class="fas fa-key" style="color:#6B7280;font-size:11px;"></i>';
      h += '<div style="font-size:11px;color:#374151;flex:1;">';
      h += '<span style="font-weight:700;">Rental:</span> Can afford up to <span style="font-weight:800;color:#111;">' + $(r.max_monthly_rent) + '/mo</span>';
      h += ' <span style="color:#9CA3AF;">(40\u00D7 rule)</span>';
      if (r.current_rent && r.qualifies_current !== null) {
        h += ' \u2022 Current: ' + $(r.current_rent) + '/mo ';
        h += r.qualifies_current
          ? '<span style="color:#059669;font-weight:600;">\u2713</span>'
          : '<span style="color:#DC2626;font-weight:600;">\u2717</span>';
      }
      h += '</div></div>';
    }

    h += '</div>';
    return h;
  }

  function _renderQualCol(q, label) {
    if (!q) {
      return '<div style="padding:12px;background:#fff;border:1px solid #E5E7EB;border-radius:10px;">' +
        '<div style="font-size:12px;font-weight:800;color:#374151;margin-bottom:8px;">' + E(label) + '</div>' +
        '<div style="font-size:11px;color:#9CA3AF;font-style:italic;">Cannot qualify</div></div>';
    }

    var qualified = q.qualified;
    var cashVerified = q.cash_available > 0;
    var borderColor = !q.meets_dti ? '#DC2626' : (qualified && cashVerified ? '#059669' : '#F59E0B');

    var h = '<div style="padding:12px;background:#fff;border:1px solid ' + borderColor + ';border-radius:10px;">';

    // Header: type + qualified badge
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">';
    h += '<div style="font-size:12px;font-weight:800;color:#374151;">' + E(label) + '</div>';
    if (!q.meets_dti) {
      h += '<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;background:#FEF2F2;color:#DC2626;">' + E(q.limiting_factor || 'Does not qualify') + '</span>';
    } else if (qualified && cashVerified) {
      h += '<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;background:#ECFDF5;color:#059669;">QUALIFIES</span>';
    } else if (qualified && !cashVerified) {
      h += '<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;background:#FFFBEB;color:#B45309;">DTI OK \u2014 cash not verified</span>';
    } else {
      h += '<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;background:#FEF2F2;color:#DC2626;">' + E(q.limiting_factor || 'Does not qualify') + '</span>';
    }
    h += '</div>';

    // Max purchase price
    h += '<div style="font-size:18px;font-weight:800;color:#111;margin-bottom:8px;">' + $(q.max_purchase_price) + '</div>';

    // Details grid
    h += '<div style="font-size:10px;color:#6B7280;line-height:1.8;">';

    // Down payment
    h += '<div style="display:flex;justify-content:space-between;">';
    h += '<span>Down (' + Math.round(q.down_payment_pct * 100) + '%)</span>';
    h += '<span style="font-weight:700;color:#374151;">' + $(q.down_payment_amount) + '</span>';
    h += '</div>';

    // Monthly payment
    h += '<div style="display:flex;justify-content:space-between;">';
    h += '<span>Mortgage/mo</span>';
    h += '<span style="font-weight:700;color:#374151;">' + $(q.monthly_mortgage) + '</span>';
    h += '</div>';

    // Carrying costs
    h += '<div style="display:flex;justify-content:space-between;">';
    h += '<span>' + (q.type === 'coop' ? 'Maintenance/mo' : 'CC + Tax/mo') + '</span>';
    h += '<span style="font-weight:700;color:#374151;">' + $(q.monthly_carrying) + '</span>';
    h += '</div>';

    // Total monthly
    h += '<div style="display:flex;justify-content:space-between;padding-top:4px;border-top:1px solid #E5E7EB;margin-top:4px;">';
    h += '<span style="font-weight:700;">Total/mo</span>';
    h += '<span style="font-weight:800;color:#111;">' + $(q.monthly_total_housing) + '</span>';
    h += '</div>';

    // DTI
    var dtiColor = q.meets_dti ? '#059669' : '#DC2626';
    h += '<div style="display:flex;justify-content:space-between;margin-top:4px;">';
    h += '<span>DTI (\u2264' + q.dti_limit + '%)</span>';
    h += '<span style="font-weight:700;color:' + dtiColor + ';">' + q.dti_ratio + '% ' + (q.meets_dti ? '\u2713' : '\u2717') + '</span>';
    h += '</div>';

    // Closing costs
    h += '<div style="display:flex;justify-content:space-between;">';
    h += '<span>Closing costs</span>';
    h += '<span style="font-weight:700;color:#374151;">~' + $(q.closing_costs) + '</span>';
    h += '</div>';

    // Mansion tax (if applicable)
    if (q.mansion_tax > 0) {
      h += '<div style="display:flex;justify-content:space-between;">';
      h += '<span style="padding-left:8px;font-style:italic;">incl. mansion tax</span>';
      h += '<span style="color:#9CA3AF;">' + $(q.mansion_tax) + '</span>';
      h += '</div>';
    }

    // Reserves
    var resColor = q.meets_reserves ? '#059669' : '#DC2626';
    h += '<div style="display:flex;justify-content:space-between;">';
    h += '<span>Reserves (' + q.reserve_months + 'mo)</span>';
    h += '<span style="font-weight:700;color:' + resColor + ';">' + $(q.reserves_required) + ' ' + (q.meets_reserves ? '\u2713' : '\u2717') + '</span>';
    h += '</div>';

    // Total cash needed
    h += '<div style="display:flex;justify-content:space-between;padding-top:4px;border-top:1px solid #E5E7EB;margin-top:4px;">';
    h += '<span style="font-weight:700;">Total cash needed</span>';
    var cashColor = q.has_funds ? '#059669' : '#DC2626';
    h += '<span style="font-weight:800;color:' + cashColor + ';">' + $(q.total_cash_needed) + '</span>';
    h += '</div>';

    // Cash available (if known)
    if (q.cash_available > 0) {
      h += '<div style="display:flex;justify-content:space-between;">';
      h += '<span>Cash available</span>';
      h += '<span style="font-weight:700;color:#374151;">' + $(q.cash_available) + '</span>';
      h += '</div>';
    }

    h += '</div>'; // details grid
    h += '</div>'; // card
    return h;
  }

  // =========================================================================
  // LANDLORD SIGNALS (replaces fake percentages with real data points)
  // =========================================================================
  function _renderSignals(preds) {
    var sell = preds.landlord_sell || {};
    var renew = preds.lease_renewal || {};
    var signals = [];

    // Collect sell signals
    if (sell.signals) {
      for (var i = 0; i < sell.signals.length; i++) {
        signals.push({ text: sell.signals[i], type: 'sell' });
      }
    }

    // Collect renewal signals
    if (renew.signals) {
      for (var j = 0; j < renew.signals.length; j++) {
        signals.push({ text: renew.signals[j], type: 'renew' });
      }
    }

    if (signals.length === 0) return '';

    // Sell signal strength
    var sellStrength = sell.score >= 60 ? 'Strong' : sell.score >= 35 ? 'Some' : 'Low';
    var sellColor = sell.score >= 60 ? '#B8860B' : sell.score >= 35 ? '#6B7280' : '#D1D5DB';

    // Renewal signal
    var renewLabel = '';
    if (renew.label) {
      var renewColor = renew.score >= 60 ? '#059669' : renew.score >= 40 ? '#F59E0B' : '#DC2626';
      renewLabel = '<span style="font-size:10px;font-weight:700;color:' + renewColor + ';margin-left:8px;">Renewal: ' + E(renew.label) + '</span>';
    }

    var h = '<div style="background:#FAFAFA;border:1px solid #E5E7EB;border-radius:10px;padding:12px 14px;margin-bottom:14px;">';
    h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
    h += '<div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;">Landlord Signals</div>';
    h += '<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;background:' + sellColor + '15;color:' + sellColor + ';">' + sellStrength + ' sell signal</span>';
    h += renewLabel;
    h += '</div>';

    h += '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
    for (var k = 0; k < signals.length; k++) {
      var s = signals[k];
      var pillBg = s.type === 'sell' ? '#FEF3C7' : '#ECFDF5';
      var pillColor = s.type === 'sell' ? '#92400E' : '#065F46';
      h += '<span style="font-size:9px;font-weight:600;padding:2px 8px;border-radius:4px;background:' + pillBg + ';color:' + pillColor + ';">' + E(s.text) + '</span>';
    }
    h += '</div>';

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

      h += '</div>'; // close milestone group
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
    if (!_data || !_data.properties[propIdx]) return;
    var prop = _data.properties[propIdx];
    var leaseId = prop.id;
    if (!prop.landlord || !prop.landlord.email) {
      CRM.toast('No landlord email on file', 'error');
      return;
    }
    CRM.toast('Sending ' + type.replace(/_/g, ' ') + ' email to landlord...', 'info');
    MallanAPI._fetch('/api/crm/lease-tracker/' + leaseId + '/outreach', {
      method: 'POST',
      body: JSON.stringify({ target: 'landlord', type: type }),
    }).then(function () {
      CRM.toast('Email sent to ' + E(prop.landlord.name || prop.landlord.email), 'success');
      render(); // Refresh to update outreach timeline
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _emailTenant(propIdx, type) {
    if (!_data || !_data.properties[propIdx]) return;
    var prop = _data.properties[propIdx];
    var leaseId = prop.id;
    var tenantEmail = prop.tenant && prop.tenant.email;
    if (!tenantEmail) {
      CRM.toast('No tenant email on file', 'error');
      return;
    }
    CRM.toast('Sending ' + type.replace(/_/g, ' ') + ' email to tenant...', 'info');
    MallanAPI._fetch('/api/crm/lease-tracker/' + leaseId + '/outreach', {
      method: 'POST',
      body: JSON.stringify({ target: 'tenant', type: type }),
    }).then(function () {
      CRM.toast('Email sent to ' + E(prop.tenant.name || tenantEmail), 'success');
      render(); // Refresh to update outreach timeline
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _openClient(clientId) {
    if (!clientId) return;
    Router.navigate('/workspace/client/' + clientId + '/overview');
  }

  // =========================================================================
  // CONVERT TO SELLER
  // =========================================================================
  function _convertToSeller(propIdx) {
    if (!_data || !_data.properties[propIdx]) return;
    var prop = _data.properties[propIdx];
    var llId = prop.landlord && prop.landlord.id;
    if (!llId) { CRM.toast('No landlord linked', 'error'); return; }

    if (!confirm('Add seller role to ' + (prop.landlord.name || 'this landlord') + '?\n\nThis will add them to your Sales CRM as a seller prospect.')) return;

    MallanAPI._fetch('/api/crm/convert', {
      method: 'POST',
      body: JSON.stringify({ leadId: String(llId), action: 'role_transition', targetRole: 'seller' }),
    }).then(function () {
      CRM.toast('Seller role added to ' + E(prop.landlord.name || 'landlord'), 'success');
      render();
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  // =========================================================================
  // EDIT LEASE MODAL
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

    // Header
    h += '<div style="padding:20px 24px 0;display:flex;align-items:center;justify-content:space-between;">';
    h += '<div>';
    h += '<div style="font-size:16px;font-weight:800;color:#111;">Edit Lease</div>';
    h += '<div style="font-size:12px;color:#6B7280;">' + E(prop.address || '') + (prop.unit ? ' #' + E(prop.unit) : '') + '</div>';
    h += '</div>';
    h += '<button style="width:32px;height:32px;border-radius:8px;background:#F3F4F6;border:none;cursor:pointer;font-size:14px;color:#6B7280;display:flex;align-items:center;justify-content:center;" onclick="LeaseTracker._closeModal()">&times;</button>';
    h += '</div>';

    h += '<div style="padding:20px 24px;">';
    h += '<input type="hidden" id="lt-edit-idx" value="' + propIdx + '">';

    // -- Lease Details section --
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

    // -- Tenant section --
    h += '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 10px;padding-bottom:6px;border-bottom:1px solid #E5E7EB;">Tenant</div>';

    if (ten && ten.id) {
      // Tenant is a linked Lead — edit financials via client API
      h += '<input type="hidden" id="lt-edit-tenant-id" value="' + E(String(ten.id)) + '">';
      h += '<div style="font-size:12px;color:#374151;margin-bottom:8px;"><strong>' + E(ten.name || '') + '</strong></div>';
      h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px;">';
      h += _inputRow('Annual Income ($)', 'lt-edit-income', ten.annual_income || '', 'number', 'step="1" min="0"');
      h += _inputRow('Bonuses ($)', 'lt-edit-bonuses', ten.bonuses || '', 'number', 'step="1" min="0"');
      h += _inputRow('Monthly Debt ($)', 'lt-edit-debt', ten.monthly_debt || '', 'number', 'step="1" min="0" placeholder="Car, student loans, etc."');
      h += _selectRow('Credit Score', 'lt-edit-credit', ten.credit_score_range || '', [
        { value: '', label: '-- Select --' },
        { value: 'excellent', label: 'Excellent (740+)' },
        { value: 'good', label: 'Good (670-739)' },
        { value: 'fair', label: 'Fair (580-669)' },
        { value: 'poor', label: 'Poor (below 580)' },
      ]);
      h += _inputRow('Available Funds ($)', 'lt-edit-funds', ten.available_funds || '', 'number', 'step="1" min="0" placeholder="Total liquid assets"');
      h += _inputRow('Down Payment ($)', 'lt-edit-down', ten.down_payment || '', 'number', 'step="1" min="0" placeholder="Amount set aside"');
      h += '</div>';
      h += '<div style="font-size:9px;color:#9CA3AF;margin-top:2px;font-style:italic;">These fields drive co-op/condo qualification. Bonuses counted at 50%.</div>';
    } else {
      // Inline tenant (not a Lead record)
      h += '<input type="hidden" id="lt-edit-tenant-id" value="">';
      h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px;">';
      h += _inputRow('Tenant Name', 'lt-edit-tname', ten.name || '', 'text');
      h += _inputRow('Tenant Email', 'lt-edit-temail', ten.email || '', 'email');
      h += _inputRow('Tenant Phone', 'lt-edit-tphone', ten.phone || '', 'tel');
      h += '<div></div>'; // spacer
      h += '</div>';
    }

    // -- Landlord section (seller potential) --
    h += '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 10px;padding-bottom:6px;border-bottom:1px solid #E5E7EB;">Landlord — Seller Potential</div>';
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

    // -- Buttons --
    h += '<div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end;">';
    h += '<button style="padding:10px 20px;font-size:12px;font-weight:700;border-radius:8px;background:#fff;color:#6B7280;border:1px solid #E5E7EB;cursor:pointer;" onclick="LeaseTracker._closeModal()">Cancel</button>';
    h += '<button style="padding:10px 24px;font-size:12px;font-weight:700;border-radius:8px;background:#B8860B;color:#fff;border:none;cursor:pointer;" onclick="LeaseTracker._saveEdit()">Save Changes</button>';
    h += '</div>';

    h += '</div>'; // padding wrapper
    h += '</div>'; // modal card
    h += '</div>'; // overlay

    document.body.insertAdjacentHTML('beforeend', h);
  }

  function _saveEdit() {
    var idx = parseInt(document.getElementById('lt-edit-idx').value, 10);
    if (!_data || !_data.properties[idx]) return;
    var prop = _data.properties[idx];
    var leaseId = prop.id;

    var saving = [];

    // 1 — Update lease fields
    var leaseUpdate = {};
    var rent = document.getElementById('lt-edit-rent').value;
    if (rent) leaseUpdate.monthly_rent = parseFloat(rent);
    var start = document.getElementById('lt-edit-start').value;
    if (start) leaseUpdate.lease_start_date = start;
    var end = document.getElementById('lt-edit-end').value;
    if (end) leaseUpdate.lease_end_date = end;
    leaseUpdate.lease_type = document.getElementById('lt-edit-type').value;
    leaseUpdate.renewal_status = document.getElementById('lt-edit-renewal').value;

    // Inline tenant fields (no Lead record)
    var tenantId = document.getElementById('lt-edit-tenant-id').value;
    if (!tenantId) {
      var tn = document.getElementById('lt-edit-tname');
      if (tn) leaseUpdate.tenant_name = tn.value || null;
      var te = document.getElementById('lt-edit-temail');
      if (te) leaseUpdate.tenant_email = te.value || null;
      var tp = document.getElementById('lt-edit-tphone');
      if (tp) leaseUpdate.tenant_phone = tp.value || null;
    }

    saving.push(
      MallanAPI._fetch('/api/crm/lease-tracker/' + leaseId, {
        method: 'PATCH',
        body: JSON.stringify(leaseUpdate),
      })
    );

    // 2 — Update tenant financials (if linked Lead)
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

      saving.push(
        MallanAPI._fetch('/api/crm/clients/' + tenantId, {
          method: 'PATCH',
          body: JSON.stringify(tenantUpdate),
        })
      );
    }

    // 3 — Update landlord seller potential
    var llId = document.getElementById('lt-edit-ll-id');
    if (llId && llId.value) {
      var sellerPot = document.getElementById('lt-edit-seller-pot').value;
      saving.push(
        MallanAPI._fetch('/api/crm/clients/' + llId.value, {
          method: 'PATCH',
          body: JSON.stringify({ seller_potential: sellerPot }),
        })
      );
    }

    // Disable save button while saving
    var saveBtn = document.querySelector('#lt-modal-overlay button:last-child');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

    Promise.all(saving).then(function () {
      CRM.toast('Lease updated successfully', 'success');
      _closeModal();
      render();
    }).catch(function (err) {
      CRM.toast('Save failed: ' + (err.message || 'Unknown error'), 'error');
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

    // Header
    h += '<div style="padding:20px 24px 0;display:flex;align-items:center;justify-content:space-between;">';
    h += '<div style="font-size:16px;font-weight:800;color:#111;">Add New Lease</div>';
    h += '<button style="width:32px;height:32px;border-radius:8px;background:#F3F4F6;border:none;cursor:pointer;font-size:14px;color:#6B7280;display:flex;align-items:center;justify-content:center;" onclick="LeaseTracker._closeModal()">&times;</button>';
    h += '</div>';

    h += '<div style="padding:20px 24px;">';

    // Property
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

    // Landlord
    h += '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 10px;padding-bottom:6px;border-bottom:1px solid #E5E7EB;">Landlord (Client ID)</div>';
    h += _inputRow('Landlord Client ID *', 'lt-add-ll-id', '', 'text', 'placeholder="Enter landlord client ID"');

    // Tenant (optional)
    h += '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 10px;padding-bottom:6px;border-bottom:1px solid #E5E7EB;">Tenant (optional)</div>';
    h += _inputRow('Tenant Client ID', 'lt-add-ten-id', '', 'text', 'placeholder="Leave blank if no tenant lead"');
    h += '<div style="font-size:10px;color:#9CA3AF;margin:-8px 0 8px;font-style:italic;">Or enter tenant info directly:</div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px;">';
    h += _inputRow('Tenant Name', 'lt-add-tname', '', 'text');
    h += _inputRow('Tenant Email', 'lt-add-temail', '', 'email');
    h += '</div>';

    // Lease terms
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

    // Buttons
    h += '<div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end;">';
    h += '<button style="padding:10px 20px;font-size:12px;font-weight:700;border-radius:8px;background:#fff;color:#6B7280;border:1px solid #E5E7EB;cursor:pointer;" onclick="LeaseTracker._closeModal()">Cancel</button>';
    h += '<button id="lt-add-save-btn" style="padding:10px 24px;font-size:12px;font-weight:700;border-radius:8px;background:#B8860B;color:#fff;border:none;cursor:pointer;" onclick="LeaseTracker._saveNewLease()">Create Lease</button>';
    h += '</div>';

    h += '</div>'; // padding wrapper
    h += '</div>'; // modal card
    h += '</div>'; // overlay

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
      CRM.toast('Lease created successfully', 'success');
      _closeModal();
      render();
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || 'Unknown error'), 'error');
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
