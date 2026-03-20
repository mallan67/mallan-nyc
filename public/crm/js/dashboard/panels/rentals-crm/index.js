// =================================================================================
// RENTALS CRM -- Complete 7-Tab Module with Full Workspaces
// Landlords | Rental Listings | Viewed/Did Not Rent | Current Tenants |
// Marketing | Activity | Automation
// Full CRUD, multi-agent, workspaces, tools, showing history, automation
// =================================================================================
/* global CRM, Router, Store, UI, Utils, FilterBar, ActivityTable, MallanAPI,
   ClientNormalizer, WorkspaceShell, EntityFields, LandlordIntake, RenterIntake,
   RentalYieldCalc, VacancyCostCalc */

var RentalsCRM = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  // ─── Tabs ───────────────────────────────────────────────────────────
  var TABS = [
    { id: 'landlords',  route: '/rentals/landlords',  label: 'Landlords',             icon: 'fa-key' },
    { id: 'listings',   route: '/rentals/listings',   label: 'Rental Listings',       icon: 'fa-building' },
    { id: 'viewed',     route: '/rentals/viewed',     label: 'Viewed / Did Not Rent', icon: 'fa-eye-slash' },
    { id: 'tenants',    route: '/rentals/tenants',    label: 'Current Tenants',       icon: 'fa-user-check' },
    { id: 'marketing',  route: '/rentals/marketing',  label: 'Marketing',             icon: 'fa-bullhorn' },
    { id: 'activity',   route: '/rentals/activity',   label: 'Activity',              icon: 'fa-stream' },
    { id: 'automation', route: '/rentals/automation',  label: 'Automation',            icon: 'fa-robot' },
  ];

  // ─── State ──────────────────────────────────────────────────────────
  var _state = {
    landlords:  { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '', filter: {} },
    listings:   { data: [], sort: { key: 'address', dir: 'asc' }, page: 1, search: '', filter: {} },
    viewed:     { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '', filter: {} },
    tenants:    { data: [], sort: { key: 'lease_end_date', dir: 'asc' }, page: 1, search: '', filter: {} },
    marketing:  { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '', filter: {} },
    activity:   { data: [], page: 1, filter: 'all' },
    automation: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '', filter: {} },
    // workspace state
    ws: { client: null, tab: 'overview', showingHistory: [], familyMembers: [] },
  };

  // ─── Inject Styles ──────────────────────────────────────────────────
  (function _injectStyles() {
    if (document.getElementById('rentals-crm-styles')) return;
    var style = document.createElement('style');
    style.id = 'rentals-crm-styles';
    style.textContent =
      /* KPI strip */
      '.kpi-strip{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;}' +
      '.kpi-card{display:flex;align-items:center;gap:12px;padding:14px 18px;background:#fff;border:1px solid #E5E7EB;border-radius:12px;flex:1;min-width:180px;box-shadow:0 1px 3px rgba(0,0,0,.04);}' +
      '.kpi-card-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;}' +
      '.kpi-card-value{font-size:20px;font-weight:800;color:#111827;line-height:1.2;}' +
      '.kpi-card-label{font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.3px;}' +
      /* Fee pills */
      '.fee-pill-owner{display:inline-block;padding:2px 8px;font-size:10px;font-weight:700;border-radius:12px;background:#DBEAFE;color:#2563EB;}' +
      '.fee-pill-tenant{display:inline-block;padding:2px 8px;font-size:10px;font-weight:700;border-radius:12px;background:#FEF3C7;color:#D97706;}' +
      '.fee-pill-nofee{display:inline-block;padding:2px 8px;font-size:10px;font-weight:700;border-radius:12px;background:#D1FAE5;color:#059669;}' +
      /* Vacancy risk */
      '.risk-high{color:#DC2626;font-size:12px;font-weight:700;}' +
      '.risk-medium{color:#D97706;font-size:12px;font-weight:700;}' +
      '.risk-low{color:#059669;font-size:12px;font-weight:700;}' +
      /* Outreach date badges */
      '.outreach-badge{display:inline-flex;align-items:center;gap:3px;padding:1px 6px;font-size:9px;font-weight:700;border-radius:4px;}' +
      '.outreach-done{background:#D1FAE5;color:#059669;}' +
      '.outreach-pending{background:#F3F4F6;color:#9CA3AF;}' +
      '.outreach-overdue{background:#FEE2E2;color:#DC2626;}' +
      /* Lease timeline bar */
      '.lease-timeline{position:relative;height:32px;background:#F3F4F6;border-radius:8px;overflow:visible;margin:8px 0;}' +
      '.lease-timeline-fill{height:100%;border-radius:8px;transition:width .4s ease;}' +
      '.lease-timeline-marker{position:absolute;top:-4px;width:2px;height:40px;background:#B8860B;}' +
      '.lease-timeline-label{position:absolute;top:36px;font-size:9px;font-weight:700;color:#6B7280;white-space:nowrap;}' +
      /* Showing history timeline */
      '.sh-timeline{position:relative;padding-left:24px;border-left:2px solid #E5E7EB;margin-left:8px;}' +
      '.sh-timeline-dot{position:absolute;left:-7px;width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 2px #B8860B;}' +
      '.sh-timeline-card{margin-bottom:16px;position:relative;padding:12px 16px;background:#fff;border:1px solid #E5E7EB;border-radius:10px;transition:border-color .15s;}' +
      '.sh-timeline-card:hover{border-color:#B8860B40;}' +
      /* Activity */
      '.activity-group-header{font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;padding:12px 0 6px;border-bottom:1px solid #F3F4F6;margin-bottom:8px;}' +
      '.activity-card{display:flex;align-items:flex-start;gap:12px;padding:12px;background:#fff;border:1px solid #F3F4F6;border-radius:10px;transition:border-color .15s;}' +
      '.activity-card:hover{border-color:#B8860B30;}' +
      /* Toggle switch */
      '.rcm-toggle{display:inline-flex;align-items:center;gap:6px;cursor:pointer;}' +
      '.rcm-toggle-track{position:relative;width:36px;height:20px;border-radius:10px;transition:background .2s;}' +
      '.rcm-toggle-thumb{position:absolute;top:2px;left:2px;width:16px;height:16px;background:#fff;border-radius:50%;box-shadow:0 1px 2px rgba(0,0,0,.15);transition:transform .2s;}' +
      /* No-fee badge */
      '.nofee-badge{display:inline-block;padding:1px 6px;font-size:9px;font-weight:700;border-radius:4px;background:#D1FAE5;color:#059669;}' +
      '.nofee-badge-no{display:inline-block;padding:1px 6px;font-size:9px;font-weight:700;border-radius:4px;background:#F3F4F6;color:#9CA3AF;}' +
      /* Workspace section card */
      '.ws-section{background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin-bottom:16px;}' +
      '.ws-section-title{font-size:13px;font-weight:700;color:#374151;margin-bottom:12px;display:flex;align-items:center;gap:8px;}' +
      /* Responsive */
      '@media(max-width:768px){.kpi-strip{flex-direction:column;}.kpi-card{min-width:auto;}}';
    document.head.appendChild(style);
  })();

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  function _kpi(cards) {
    var html = '<div class="kpi-strip">';
    cards.forEach(function (c) {
      html += '<div class="kpi-card">' +
        '<div class="kpi-card-icon" style="background:' + (c.color || '#B8860B') + '15;color:' + (c.color || '#B8860B') + '"><i class="fas ' + c.icon + '"></i></div>' +
        '<div><div class="kpi-card-value">' + c.value + '</div><div class="kpi-card-label">' + E(c.label) + '</div></div>' +
      '</div>';
    });
    html += '</div>';
    return html;
  }

  function _subnav(activeTab) {
    var html = '<div class="flex gap-1 overflow-x-auto border-b border-gray-200 mb-4 pb-px -mx-1">';
    TABS.forEach(function (tab) {
      var active = tab.id === activeTab;
      html += '<button class="px-3 py-2 text-xs font-semibold whitespace-nowrap rounded-t-lg transition-all ' +
        (active ? 'text-gold border-b-2 border-gold bg-gold/5' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50') +
        '" onclick="Router.navigate(\'' + tab.route + '\')">' +
        '<i class="fas ' + tab.icon + ' mr-1.5"></i>' + E(tab.label) +
      '</button>';
    });
    html += '</div>';
    return html;
  }

  function _feePill(feeStructure) {
    var f = (feeStructure || '').toLowerCase().replace(/[\s-]/g, '_');
    if (f === 'owner_pay') return '<span class="fee-pill-owner">Owner Pay</span>';
    if (f === 'tenant_pay') return '<span class="fee-pill-tenant">Tenant Pay</span>';
    if (f === 'no_fee') return '<span class="fee-pill-nofee">No Fee</span>';
    return '<span class="text-xs text-gray-400">' + E(feeStructure || '-') + '</span>';
  }

  function _vacancyIcon(risk) {
    var v = (risk || '').toLowerCase();
    if (v === 'high') return '<span class="risk-high" title="High vacancy risk"><i class="fas fa-fire"></i> High</span>';
    if (v === 'medium') return '<span class="risk-medium" title="Medium vacancy risk"><i class="fas fa-exclamation-triangle"></i> Med</span>';
    if (v === 'low') return '<span class="risk-low" title="Low vacancy risk"><i class="fas fa-shield-alt"></i> Low</span>';
    return '<span class="text-xs text-gray-400">-</span>';
  }

  function _sellerPill(potential) {
    var p = (potential || 'none').toLowerCase();
    var colors = {
      high: 'bg-red-100 text-red-700',
      medium: 'bg-yellow-100 text-yellow-700',
      low: 'bg-blue-100 text-blue-600',
      none: 'bg-gray-50 text-gray-400'
    };
    return '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold ' + (colors[p] || colors.none) + '">' + E(p.toUpperCase()) + '</span>';
  }

  function _listingBadge(status) {
    var s = status || 'No Listing';
    var colors = {
      'Active': 'bg-blue-100 text-blue-700',
      'Rented': 'bg-green-100 text-green-700',
      'Vacant': 'bg-red-100 text-red-700',
      'Coming Soon': 'bg-yellow-100 text-yellow-700',
      'Pending': 'bg-orange-100 text-orange-700',
      'No Listing': 'bg-gray-100 text-gray-500'
    };
    return '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold ' + (colors[s] || 'bg-gray-100 text-gray-600') + '">' + E(s) + '</span>';
  }

  function _renewalBadge(status) {
    var s = (status || 'pending').toLowerCase();
    var colors = {
      renewing: 'bg-green-100 text-green-700',
      not_renewing: 'bg-red-100 text-red-700',
      pending: 'bg-yellow-100 text-yellow-700',
      month_to_month: 'bg-blue-100 text-blue-700'
    };
    return '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold ' + (colors[s] || 'bg-gray-100 text-gray-600') + '">' + E(s.replace(/_/g, ' ')) + '</span>';
  }

  function _scoreBar(score) {
    if (typeof UI.scoreBar === 'function') return UI.scoreBar(Number(score) || 0, 100);
    var s = Number(score) || 0;
    var color = s >= 70 ? '#059669' : s >= 40 ? '#F59E0B' : '#9CA3AF';
    return '<div style="display:flex;align-items:center;gap:6px;">' +
      '<div style="flex:1;height:6px;background:#F3F4F6;border-radius:3px;min-width:48px;max-width:72px;">' +
        '<div style="height:100%;width:' + Math.min(s, 100) + '%;background:' + color + ';border-radius:3px;transition:width .3s;"></div>' +
      '</div>' +
      '<span style="font-size:11px;font-weight:700;color:' + color + ';">' + s + '</span>' +
    '</div>';
  }

  function _toggleSwitch(isOn, onclick) {
    if (typeof UI.toggleSwitch === 'function') return UI.toggleSwitch(isOn, onclick);
    var bg = isOn ? '#059669' : '#D1D5DB';
    var transform = isOn ? 'translateX(16px)' : 'translateX(0)';
    var label = isOn ? 'ON' : 'OFF';
    var onclickAttr = onclick ? ' onclick="' + onclick + '"' : '';
    return '<div class="rcm-toggle"' + onclickAttr + '>' +
      '<div class="rcm-toggle-track" style="background:' + bg + '">' +
        '<div class="rcm-toggle-thumb" style="transform:' + transform + '"></div>' +
      '</div>' +
      '<span style="font-size:10px;font-weight:700;color:' + (isOn ? '#059669' : '#9CA3AF') + ';">' + label + '</span>' +
    '</div>';
  }

  function _daysLeft(leaseEnd) {
    if (!leaseEnd) return { days: null, html: '<span class="text-gray-400">-</span>' };
    var diff = Math.floor((new Date(leaseEnd).getTime() - Date.now()) / 86400000);
    if (diff <= 30) {
      return { days: diff, html: '<span class="text-sm font-bold text-red-600">' + diff + 'd</span>' };
    } else if (diff <= 90) {
      return { days: diff, html: '<span class="text-sm font-bold text-amber-600">' + diff + 'd</span>' };
    } else {
      return { days: diff, html: '<span class="text-sm font-bold text-green-600">' + diff + 'd</span>' };
    }
  }

  function _outreachBadge(dateStr, label) {
    if (!dateStr) return '<span class="outreach-badge outreach-pending">' + E(label) + '</span>';
    var d = new Date(dateStr).getTime();
    var now = Date.now();
    if (d <= now) return '<span class="outreach-badge outreach-done"><i class="fas fa-check" style="font-size:8px"></i> ' + E(label) + '</span>';
    return '<span class="outreach-badge outreach-pending">' + E(label) + '</span>';
  }

  function _outreachDatesBadges(r) {
    return '<div style="display:flex;gap:3px;flex-wrap:wrap;">' +
      _outreachBadge(r.outreach_6mo_date, '6mo') +
      _outreachBadge(r.outreach_90d_date, '90d') +
      _outreachBadge(r.outreach_60d_date, '60d') +
      _outreachBadge(r.outreach_30d_date, '30d') +
    '</div>';
  }

  function _groupByDate(events) {
    var groups = { 'Today': [], 'Yesterday': [], 'This Week': [], 'Earlier': [] };
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var yesterday = today - 86400000;
    var weekAgo = today - 7 * 86400000;
    events.forEach(function (ev) {
      var evTime = ev.created_at ? new Date(ev.created_at).getTime() : 0;
      if (evTime >= today) groups['Today'].push(ev);
      else if (evTime >= yesterday) groups['Yesterday'].push(ev);
      else if (evTime >= weekAgo) groups['This Week'].push(ev);
      else groups['Earlier'].push(ev);
    });
    return groups;
  }

  function _activityIcon(type) {
    var map = {
      portal_login: { icon: 'fa-sign-in-alt', color: '#3B82F6', bg: '#EFF6FF' },
      listing_view: { icon: 'fa-eye', color: '#8B5CF6', bg: '#F5F3FF' },
      showing: { icon: 'fa-calendar', color: '#F59E0B', bg: '#FFFBEB' },
      application: { icon: 'fa-file-alt', color: '#059669', bg: '#ECFDF5' },
      lease_signed: { icon: 'fa-signature', color: '#059669', bg: '#ECFDF5' },
      renewal: { icon: 'fa-redo', color: '#6366F1', bg: '#EEF2FF' },
      comment: { icon: 'fa-comment', color: '#6366F1', bg: '#EEF2FF' },
      email: { icon: 'fa-envelope', color: '#EC4899', bg: '#FDF2F8' },
      email_opened: { icon: 'fa-envelope-open', color: '#EC4899', bg: '#FDF2F8' },
      conversion: { icon: 'fa-check-circle', color: '#059669', bg: '#ECFDF5' },
      promote: { icon: 'fa-arrow-up', color: '#B8860B', bg: '#FFFBF0' },
      relist: { icon: 'fa-redo-alt', color: '#D97706', bg: '#FFFBEB' },
      showing_feedback: { icon: 'fa-comment-dots', color: '#F59E0B', bg: '#FFFBEB' },
      not_renewing: { icon: 'fa-times-circle', color: '#DC2626', bg: '#FEF2F2' },
    };
    return map[type] || { icon: 'fa-circle', color: '#9CA3AF', bg: '#F9FAFB' };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 1: LANDLORDS
  // ═══════════════════════════════════════════════════════════════════════

  function landlords() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _subnav('landlords') + UI.loading();

    MallanAPI._fetch('/api/crm/rentals/landlords').then(function (data) {
      _state.landlords.data = (data.landlords || data.clients || []).map(function (l) { return ClientNormalizer.normalize(l); });
      _renderLandlords(c);
    }).catch(function () {
      c.innerHTML = _subnav('landlords') + UI.emptyState('fa-key', 'Unable to load landlords');
    });
  }

  function _renderLandlords(c) {
    var st = _state.landlords;
    var rows = ActivityTable.filterRows(st.data, st.search);
    // Apply filters
    if (st.filter.status) {
      rows = rows.filter(function (r) { return r.listing_status === st.filter.status; });
    }
    if (st.filter.fee_structure) {
      rows = rows.filter(function (r) {
        return (r.fee_structure || '').toLowerCase().replace(/[\s-]/g, '_') === st.filter.fee_structure;
      });
    }
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    // KPIs
    var totalLandlords = st.data.length;
    var activeListings = st.data.filter(function (r) { return r.listing_status === 'Active'; }).length;
    var vacantCount = st.data.filter(function (r) { return (r.vacancy_risk || '').toLowerCase() === 'high'; }).length;
    var sellerPotentialCount = st.data.filter(function (r) { return r.seller_potential && r.seller_potential.toLowerCase() !== 'none'; }).length;
    var rents = st.data.filter(function (r) { return r.list_price && Number(r.list_price) > 0; });
    var avgRent = rents.length > 0 ? Math.round(rents.reduce(function (s, r) { return s + Number(r.list_price); }, 0) / rents.length) : 0;

    var html = _subnav('landlords');

    html += _kpi([
      { icon: 'fa-key', value: totalLandlords, label: 'Total Landlords', color: '#6366F1' },
      { icon: 'fa-building', value: activeListings, label: 'Active Listings', color: '#3B82F6' },
      { icon: 'fa-fire', value: vacantCount, label: 'Vacant (High Risk)', color: '#DC2626' },
      { icon: 'fa-chart-line', value: sellerPotentialCount, label: 'Seller Potential', color: '#F59E0B' },
      { icon: 'fa-dollar-sign', value: avgRent > 0 ? $(avgRent) : '-', label: 'Avg Rent', color: '#059669' },
    ]);

    html += FilterBar.render({
      id: 'landlords',
      placeholder: 'Search landlords...',
      onSearch: 'RentalsCRM._searchLandlords',
      filters: [
        { key: 'status', label: 'Listing Status', options: [
          { value: 'Active', label: 'Active' }, { value: 'Rented', label: 'Rented' },
          { value: 'Vacant', label: 'Vacant' }, { value: 'Coming Soon', label: 'Coming Soon' }
        ]},
        { key: 'fee_structure', label: 'Fee', options: [
          { value: 'owner_pay', label: 'Owner Pay' }, { value: 'tenant_pay', label: 'Tenant Pay' }, { value: 'no_fee', label: 'No Fee' }
        ]},
      ],
      onFilter: 'RentalsCRM._filterLandlords',
      quickActions: [
        { label: 'New Landlord', icon: 'fa-plus', onclick: 'CRM.quickNewClient({ role: "landlord" })' },
      ],
    });

    html += ActivityTable.render({
      id: 'landlords_table',
      columns: [
        { key: '_avatar', label: '', width: '44px', render: function (r) {
          return UI.avatar(r.name, 32);
        }},
        { key: 'name', label: 'Landlord', render: function (r) {
          var badge = '';
          if (r.entity_name) badge = ' <span class="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full font-bold">' + E(r.entity_type || 'Entity') + '</span>';
          return '<span class="font-semibold text-gray-900">' + E(r.name || '') + '</span>' + badge;
        }},
        { key: 'property_address', label: 'Property / Unit', render: function (r) {
          var addr = E(r.property_address || '-');
          if (r.unit_number) addr += ' <span class="text-gray-400">#' + E(r.unit_number) + '</span>';
          return '<span class="text-sm">' + addr + '</span>';
        }},
        { key: 'listing_status', label: 'Status', render: function (r) {
          return _listingBadge(r.listing_status);
        }},
        { key: 'list_price', label: 'Rent/mo', render: function (r) {
          return r.list_price ? '<span class="font-bold text-gray-900">' + $(Number(r.list_price)) + '</span><span class="text-[10px] text-gray-400">/mo</span>' : '<span class="text-gray-400">-</span>';
        }},
        { key: 'fee_structure', label: 'Fee', render: function (r) {
          return _feePill(r.fee_structure);
        }},
        { key: 'vacancy_risk', label: 'Vacancy', render: function (r) {
          return _vacancyIcon(r.vacancy_risk);
        }},
        { key: 'seller_potential', label: 'Seller Potential', render: function (r) {
          return _sellerPill(r.seller_potential);
        }},
        { key: '_actions', label: '', width: '80px', render: function (r) {
          return '<div style="display:flex;gap:4px;">' +
            '<button class="btn-icon-sm" title="Vacancy Cost" onclick="event.stopPropagation();RentalsCRM._vacancyCost(\'' + E(r.id) + '\')" ' +
              'style="width:28px;height:28px;border-radius:6px;border:1px solid #E5E7EB;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#6B7280;font-size:12px;" ' +
              'onmouseover="this.style.borderColor=\'#B8860B\';this.style.color=\'#B8860B\'" onmouseout="this.style.borderColor=\'#E5E7EB\';this.style.color=\'#6B7280\'">' +
              '<i class="fas fa-calculator"></i></button>' +
            '<button class="btn-icon-sm" title="Delete" onclick="event.stopPropagation();RentalsCRM._deleteLandlord(\'' + E(r.id) + '\')" ' +
              'style="width:28px;height:28px;border-radius:6px;border:1px solid #E5E7EB;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#6B7280;font-size:12px;" ' +
              'onmouseover="this.style.borderColor=\'#DC2626\';this.style.color=\'#DC2626\'" onmouseout="this.style.borderColor=\'#E5E7EB\';this.style.color=\'#6B7280\'">' +
              '<i class="fas fa-trash-alt"></i></button>' +
          '</div>';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'RentalsCRM._sortLandlords',
      onRowClick: 'RentalsCRM._openLandlordWorkspace',
      page: st.page,
      pageSize: 25,
      onPage: 'RentalsCRM._pageLandlords',
      emptyIcon: 'fa-key',
      emptyText: 'No landlords yet -- add one to start',
    });

    c.innerHTML = html;
  }

  function _searchLandlords(q) { _state.landlords.search = q; _state.landlords.page = 1; _renderLandlords(CRM.getContent()); }
  function _filterLandlords(key, val) {
    if (key) _state.landlords.filter[key] = val;
    _state.landlords.page = 1;
    _renderLandlords(CRM.getContent());
  }
  function _sortLandlords(key) {
    var st = _state.landlords;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderLandlords(CRM.getContent());
  }
  function _pageLandlords(p) { _state.landlords.page = p; _renderLandlords(CRM.getContent()); }

  function _deleteLandlord(id) {
    if (!confirm('Delete this landlord? This cannot be undone.')) return;
    MallanAPI._fetch('/api/crm/clients/' + id, { method: 'DELETE' }).then(function () {
      CRM.toast('Landlord deleted', 'success');
      _state.landlords.data = _state.landlords.data.filter(function (r) { return String(r.id) !== String(id); });
      _renderLandlords(CRM.getContent());
    }).catch(function () { CRM.toast('Delete failed', 'error'); });
  }

  function _vacancyCost(id) {
    var r = _state.landlords.data.find(function (l) { return String(l.id) === String(id); });
    var rent = r && r.list_price ? Number(r.list_price) : 0;
    CRM.openModal('Vacancy Cost Calculator', VacancyCostCalc.render({ monthlyRent: rent }), null);
  }

  // ─── Landlord Workspace ────────────────────────────────────────────
  function _openLandlordWorkspace(id) {
    _state.ws.tab = 'overview';
    _loadLandlordWorkspace(id);
  }

  function _loadLandlordWorkspace(id) {
    var c = CRM.getContent();
    c.innerHTML = UI.loading();

    Promise.all([
      MallanAPI._fetch('/api/crm/clients/' + id),
      MallanAPI._fetch('/api/crm/clients/' + id + '/family').catch(function () { return { members: [] }; }),
    ]).then(function (results) {
      var cl = results[0].client || results[0];
      var members = results[1].members || [];
      _state.ws.client = cl;
      _state.ws.familyMembers = members;
      _renderLandlordWorkspace(c, cl, members);
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-key', 'Unable to load landlord');
    });
  }

  function _renderLandlordWorkspace(c, cl, members) {
    var activeTab = _state.ws.tab;
    var tabs = [
      { id: 'overview', label: 'Overview', icon: 'fa-th-large' },
      { id: 'intake', label: 'Intake', icon: 'fa-clipboard-list' },
      { id: 'listings', label: 'Listings', icon: 'fa-building' },
      { id: 'marketing', label: 'Marketing', icon: 'fa-bullhorn' },
      { id: 'activity', label: 'Activity', icon: 'fa-stream' },
      { id: 'tools', label: 'Tools', icon: 'fa-tools' },
      { id: 'applications', label: 'Applications', icon: 'fa-file-alt' },
      { id: 'automation', label: 'Automation', icon: 'fa-robot' },
    ];

    var shell = WorkspaceShell.render({
      backRoute: '/rentals/landlords',
      backLabel: 'Landlords',
      client: cl,
      avatarName: cl.name || ((cl.first_name || '') + ' ' + (cl.last_name || '')).trim(),
      displayName: cl.name || ((cl.first_name || '') + ' ' + (cl.last_name || '')).trim(),
      role: 'landlord',
      stage: cl.listing_status || cl.pipeline_stage || 'active',
      entityBadge: cl.entity_type || '',
      tabs: tabs,
      activeTab: activeTab,
      onTab: 'RentalsCRM._landlordTab',
      actions: [
        { label: 'Edit', icon: 'fa-edit', onclick: 'RentalsCRM._editClient(\'' + E(cl.id) + '\')' },
        { label: 'Delete', icon: 'fa-trash-alt', onclick: 'RentalsCRM._deleteClient(\'' + E(cl.id) + '\',\'/rentals/landlords\')', cls: 'btn btn-sm btn-outline text-red-500' },
      ],
    });

    c.innerHTML = shell;

    // Render active tab content
    var content = document.getElementById('workspace-content');
    if (!content) return;

    if (activeTab === 'overview') {
      content.innerHTML =
        WorkspaceShell.renderContactCard(cl) +
        WorkspaceShell.renderEntitySection(cl) +
        WorkspaceShell.renderMultiPerson(cl, members) +
        _landlordPropertyCard(cl);
    } else if (activeTab === 'intake') {
      content.innerHTML = LandlordIntake.render(cl);
    } else if (activeTab === 'listings') {
      _loadLandlordListings(content, cl.id);
    } else if (activeTab === 'marketing') {
      _loadLandlordMarketing(content, cl.id);
    } else if (activeTab === 'activity') {
      _loadClientActivity(content, cl.id);
    } else if (activeTab === 'tools') {
      content.innerHTML =
        '<div class="ws-section"><div class="ws-section-title"><i class="fas fa-chart-line text-gold"></i>Rental Yield Calculator</div>' + RentalYieldCalc.render({ monthlyRent: cl.list_price }) + '</div>' +
        '<div class="ws-section"><div class="ws-section-title"><i class="fas fa-calculator text-gold"></i>Vacancy Cost Calculator</div>' + VacancyCostCalc.render({ monthlyRent: cl.list_price }) + '</div>' +
        _relistTimingAdvisor(cl) +
        _tenantScreeningChecklist(cl);
    } else if (activeTab === 'applications') {
      _loadLandlordApplications(content, cl.id);
    } else if (activeTab === 'automation') {
      _loadLandlordAutomation(content, cl);
    }
  }

  function _landlordTab(tabId) {
    _state.ws.tab = tabId;
    if (_state.ws.client) {
      _renderLandlordWorkspace(CRM.getContent(), _state.ws.client, _state.ws.familyMembers);
    }
  }

  function _landlordPropertyCard(cl) {
    var html = '<div class="ws-section">';
    html += '<div class="ws-section-title"><i class="fas fa-home text-gold"></i>Property Details</div>';
    html += '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">';
    html += _wsField('Property Address', cl.property_address);
    html += _wsField('Unit Number', cl.unit_number);
    html += _wsField('Listing Status', cl.listing_status);
    html += _wsField('Rent/mo', cl.list_price ? $(Number(cl.list_price)) : null);
    html += _wsField('Fee Structure', cl.fee_structure);
    html += _wsField('Vacancy Risk', cl.vacancy_risk);
    html += _wsField('Seller Potential', cl.seller_potential);
    html += _wsField('Total Units', cl.total_units);
    html += _wsField('Building Type', cl.building_type);
    html += '</div>';
    html += '</div>';
    return html;
  }

  function _wsField(label, value) {
    return '<div>' +
      '<span class="text-xs font-semibold text-gray-700">' + E(label) + '</span>' +
      '<p class="text-sm text-gray-900 mt-0.5">' + (value ? E(String(value)) : '<span class="text-gray-400">--</span>') + '</p>' +
    '</div>';
  }

  function _relistTimingAdvisor(cl) {
    var html = '<div class="ws-section">';
    html += '<div class="ws-section-title"><i class="fas fa-clock text-gold"></i>Relist Timing Advisor</div>';
    html += '<div class="space-y-3">';

    var status = (cl.listing_status || '').toLowerCase();
    if (status === 'rented') {
      var leaseEnd = cl.lease_end_date;
      if (leaseEnd) {
        var daysUntil = Math.floor((new Date(leaseEnd).getTime() - Date.now()) / 86400000);
        var urgency = daysUntil <= 60 ? 'text-red-600' : daysUntil <= 120 ? 'text-amber-600' : 'text-green-600';
        html += '<p class="text-sm"><span class="font-bold ' + urgency + '">' + daysUntil + ' days</span> until lease ends (' + D(leaseEnd) + ')</p>';
        if (daysUntil <= 90) {
          html += '<div class="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700"><i class="fas fa-exclamation-triangle mr-1"></i>Recommend starting relist preparation now. 60-90 day lead time for photos, pricing, and marketing.</div>';
        }
      } else {
        html += '<p class="text-sm text-gray-500">No lease end date on file. Add to enable relist timing.</p>';
      }
    } else if (status === 'vacant') {
      html += '<div class="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"><i class="fas fa-fire mr-1"></i>Unit is vacant. Every day costs the landlord money. Prioritize listing immediately.</div>';
    } else {
      html += '<p class="text-sm text-gray-500">Unit is currently ' + E(cl.listing_status || 'active') + '. Relist advisor activates when lease is ending or unit becomes vacant.</p>';
    }

    html += '</div></div>';
    return html;
  }

  function _tenantScreeningChecklist(cl) {
    var items = [
      { key: 'credit_check', label: 'Credit Check Report' },
      { key: 'background_check', label: 'Background Check' },
      { key: 'income_verification', label: 'Income Verification (40x rent)' },
      { key: 'employment_verification', label: 'Employment Verification' },
      { key: 'landlord_reference', label: 'Previous Landlord Reference' },
      { key: 'photo_id', label: 'Photo ID' },
      { key: 'bank_statements', label: 'Bank Statements (3 months)' },
      { key: 'guarantor_docs', label: 'Guarantor Documents (if needed)' },
    ];

    var screening = cl.tenant_screening || {};

    var html = '<div class="ws-section">';
    html += '<div class="ws-section-title"><i class="fas fa-clipboard-check text-gold"></i>Tenant Screening Checklist</div>';
    html += '<div class="space-y-1">';
    items.forEach(function (item) {
      var done = !!screening[item.key];
      var iconCls = done ? 'fa-check-circle text-green-500' : 'fa-times-circle text-gray-300';
      var bgCls = done ? 'bg-green-50' : 'bg-gray-50';
      html += '<div class="flex items-center justify-between px-3 py-2 rounded-lg ' + bgCls + '">' +
        '<div class="flex items-center gap-2">' +
          '<i class="fas ' + iconCls + '"></i>' +
          '<span class="text-sm font-medium text-gray-900">' + E(item.label) + '</span>' +
        '</div>' +
        '<button class="text-xs text-gold font-bold hover:underline" onclick="RentalsCRM._toggleScreening(\'' + E(cl.id) + '\',\'' + E(item.key) + '\',' + !done + ')">' +
          (done ? 'Mark Incomplete' : 'Mark Complete') +
        '</button>' +
      '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function _toggleScreening(clientId, key, value) {
    MallanAPI._fetch('/api/crm/clients/' + clientId).then(function (data) {
      var cl = data.client || data;
      var screening = cl.tenant_screening || {};
      screening[key] = value;
      return MallanAPI._fetch('/api/crm/clients/' + clientId, {
        method: 'PATCH',
        body: JSON.stringify({ tenant_screening: screening }),
      });
    }).then(function () {
      CRM.toast(value ? 'Marked complete' : 'Marked incomplete', 'success');
      _loadLandlordWorkspace(clientId);
    }).catch(function () { CRM.toast('Update failed', 'error'); });
  }

  function _loadLandlordListings(content, clientId) {
    content.innerHTML = UI.loading();
    MallanAPI._fetch('/api/crm/rentals/listings?owner_id=' + clientId).then(function (data) {
      var listings = data.listings || [];
      if (listings.length === 0) {
        content.innerHTML = UI.emptyState('fa-building', 'No rental listings for this landlord') +
          '<div class="text-center mt-4"><button class="btn btn-sm btn-gold" onclick="CRM.openListingForm && CRM.openListingForm(\'rental\',\'' + E(clientId) + '\')"><i class="fas fa-plus mr-1"></i>Create Listing</button></div>';
        return;
      }
      var html = '';
      listings.forEach(function (l) {
        var addr = typeof l.address === 'object' ? (l.address.UnparsedAddress || l.address.full || '') : (l.address || '');
        html += '<div class="ws-section cursor-pointer hover:border-gold" onclick="Router.navigate(\'/workspace/listing/' + E(l.id) + '/overview\')">' +
          '<div class="flex items-center justify-between">' +
            '<div>' +
              '<h4 class="text-sm font-bold text-gray-900">' + E(addr) + '</h4>' +
              '<div class="flex items-center gap-2 mt-1">' +
                _listingBadge(l.status) +
                '<span class="text-sm font-bold text-gray-700">' + $(Number(l.list_price || 0)) + '/mo</span>' +
                _feePill(l.fee_structure) +
              '</div>' +
            '</div>' +
            '<div class="text-right text-xs text-gray-500">' +
              '<div>' + String(l.showings_count || 0) + ' showings</div>' +
              '<div>' + String(l.applications_count || 0) + ' applications</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      });
      content.innerHTML = html;
    }).catch(function () {
      content.innerHTML = UI.emptyState('fa-building', 'Unable to load listings');
    });
  }

  function _loadLandlordMarketing(content, clientId) {
    content.innerHTML = UI.loading();
    MallanAPI._fetch('/api/crm/campaigns?client_id=' + clientId + '&crm_type=rentals').then(function (data) {
      var campaigns = data.campaigns || [];
      if (campaigns.length === 0) {
        content.innerHTML = UI.emptyState('fa-bullhorn', 'No campaigns for this landlord');
        return;
      }
      var html = '<div class="space-y-3">';
      campaigns.forEach(function (cmp) {
        var openRate = cmp.sent_count > 0 ? Math.round((cmp.open_count / cmp.sent_count) * 100) : 0;
        html += '<div class="ws-section">' +
          '<div class="flex items-center justify-between">' +
            '<div>' +
              '<h4 class="text-sm font-bold text-gray-900">' + E(cmp.name || '') + '</h4>' +
              '<span class="text-xs text-gray-500">' + E(cmp.campaign_type || '') + '</span>' +
            '</div>' +
            '<div class="flex items-center gap-3 text-xs">' +
              '<span class="text-gray-500">Sent: ' + String(cmp.sent_count || 0) + '</span>' +
              '<span class="font-bold" style="color:' + (openRate >= 25 ? '#059669' : '#D97706') + '">' + openRate + '% open</span>' +
            '</div>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
      content.innerHTML = html;
    }).catch(function () {
      content.innerHTML = UI.emptyState('fa-bullhorn', 'Unable to load marketing');
    });
  }

  function _loadLandlordApplications(content, clientId) {
    content.innerHTML = UI.loading();
    MallanAPI._fetch('/api/crm/rentals/applications?owner_id=' + clientId).then(function (data) {
      var apps = data.applications || [];
      if (apps.length === 0) {
        content.innerHTML = UI.emptyState('fa-file-alt', 'No applications received');
        return;
      }
      var html = '<div class="space-y-3">';
      apps.forEach(function (app) {
        var statusColors = {
          pending: 'bg-yellow-100 text-yellow-700',
          approved: 'bg-green-100 text-green-700',
          denied: 'bg-red-100 text-red-700',
          withdrawn: 'bg-gray-100 text-gray-600',
        };
        var statusCls = statusColors[(app.status || '').toLowerCase()] || 'bg-gray-100 text-gray-600';
        html += '<div class="ws-section">' +
          '<div class="flex items-center justify-between">' +
            '<div>' +
              '<h4 class="text-sm font-bold text-gray-900">' + E(app.applicant_name || 'Applicant') + '</h4>' +
              '<span class="text-xs text-gray-500">' + E(app.unit_address || '') + ' -- Applied ' + D(app.created_at) + '</span>' +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold ' + statusCls + '">' + E(app.status || 'pending') + '</span>' +
              '<button class="btn btn-sm btn-outline" onclick="RentalsCRM._updateAppStatus(\'' + E(app.id) + '\',\'approved\')"><i class="fas fa-check mr-1"></i>Approve</button>' +
              '<button class="btn btn-sm btn-outline text-red-500" onclick="RentalsCRM._updateAppStatus(\'' + E(app.id) + '\',\'denied\')"><i class="fas fa-times mr-1"></i>Deny</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
      content.innerHTML = html;
    }).catch(function () {
      content.innerHTML = UI.emptyState('fa-file-alt', 'Unable to load applications');
    });
  }

  function _updateAppStatus(appId, status) {
    MallanAPI._fetch('/api/crm/rentals/applications/' + appId, {
      method: 'PATCH',
      body: JSON.stringify({ status: status }),
    }).then(function () {
      CRM.toast('Application ' + status, 'success');
      if (_state.ws.client) _loadLandlordWorkspace(_state.ws.client.id);
    }).catch(function () { CRM.toast('Update failed', 'error'); });
  }

  function _loadLandlordAutomation(content, cl) {
    var html = '<div class="ws-section">';
    html += '<div class="ws-section-title"><i class="fas fa-robot text-gold"></i>Automation Schedule</div>';
    html += '<div class="space-y-3">';

    var automations = [
      { key: 'immediate_showing_feedback', label: 'Immediate Showing Feedback', desc: 'Send landlord showing results within 1 hour of each showing', icon: 'fa-comment-dots' },
      { key: 'weekly_summary', label: 'Weekly Activity Summary', desc: 'Every Monday: showings, applications, market activity for their listing', icon: 'fa-calendar-week' },
      { key: 'biannual_market_data', label: 'Bi-Annual Rental Market Report', desc: 'Comprehensive market data for their neighborhood every 6 months', icon: 'fa-chart-bar' },
    ];

    automations.forEach(function (auto) {
      var isOn = cl.automation_settings && cl.automation_settings[auto.key];
      html += '<div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center"><i class="fas ' + auto.icon + ' text-gold text-sm"></i></div>' +
          '<div>' +
            '<p class="text-sm font-bold text-gray-900">' + E(auto.label) + '</p>' +
            '<p class="text-xs text-gray-500">' + E(auto.desc) + '</p>' +
          '</div>' +
        '</div>' +
        _toggleSwitch(!!isOn, 'RentalsCRM._toggleLandlordAutomation(\\\'' + E(cl.id) + '\\\',\\\'' + E(auto.key) + '\\\',' + !isOn + ')') +
      '</div>';
    });

    html += '</div></div>';
    content.innerHTML = html;
  }

  function _toggleLandlordAutomation(clientId, key, value) {
    MallanAPI._fetch('/api/crm/clients/' + clientId).then(function (data) {
      var cl = data.client || data;
      var settings = cl.automation_settings || {};
      settings[key] = value;
      return MallanAPI._fetch('/api/crm/clients/' + clientId, {
        method: 'PATCH',
        body: JSON.stringify({ automation_settings: settings }),
      });
    }).then(function () {
      CRM.toast(value ? 'Automation enabled' : 'Automation disabled', 'success');
      _loadLandlordWorkspace(clientId);
    }).catch(function () { CRM.toast('Update failed', 'error'); });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 2: RENTAL LISTINGS
  // ═══════════════════════════════════════════════════════════════════════

  function rentalListings() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _subnav('listings') + UI.loading();

    MallanAPI._fetch('/api/crm/rentals/listings').then(function (data) {
      _state.listings.data = data.listings || [];
      _renderListings(c);
    }).catch(function () {
      c.innerHTML = _subnav('listings') + UI.emptyState('fa-building', 'Unable to load rental listings');
    });
  }

  function _renderListings(c) {
    var st = _state.listings;
    var rows = ActivityTable.filterRows(st.data, st.search);
    if (st.filter.status) rows = rows.filter(function (r) { return (r.status || 'Active') === st.filter.status; });
    if (st.filter.fee_structure) {
      rows = rows.filter(function (r) {
        return (r.fee_structure || '').toLowerCase().replace(/[\s-]/g, '_') === st.filter.fee_structure;
      });
    }
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    // KPIs
    var activeCount = st.data.filter(function (r) { return (r.status || 'Active') === 'Active'; }).length;
    var totalRevenue = st.data.reduce(function (s, r) {
      return s + ((r.status || 'Active') === 'Active' ? Number(r.list_price || 0) : 0);
    }, 0);
    var activePrices = st.data.filter(function (r) { return Number(r.list_price || 0) > 0; });
    var avgRent = activePrices.length > 0 ? Math.round(activePrices.reduce(function (s, r) { return s + Number(r.list_price); }, 0) / activePrices.length) : 0;
    var pendingApps = st.data.reduce(function (s, r) { return s + Number(r.applications_count || 0); }, 0);
    var rlsCount = st.data.filter(function (r) { return r.rls_eligible !== false; }).length;
    var rlsPct = st.data.length > 0 ? Math.round((rlsCount / st.data.length) * 100) : 0;

    var html = _subnav('listings');

    html += _kpi([
      { icon: 'fa-building', value: activeCount, label: 'Active Listings', color: '#3B82F6' },
      { icon: 'fa-coins', value: $(totalRevenue), label: 'Total Monthly Revenue', color: '#059669' },
      { icon: 'fa-chart-bar', value: avgRent > 0 ? $(avgRent) : '-', label: 'Avg Rent', color: '#8B5CF6' },
      { icon: 'fa-file-alt', value: pendingApps, label: 'Applications Pending', color: '#F59E0B' },
      { icon: 'fa-check-circle', value: rlsPct + '%', label: 'RLS Listed', color: '#059669' },
    ]);

    html += FilterBar.render({
      id: 'rlistings',
      placeholder: 'Search rental listings...',
      onSearch: 'RentalsCRM._searchListings',
      filters: [
        { key: 'status', label: 'Status', options: [
          { value: 'Active', label: 'Active' }, { value: 'Coming Soon', label: 'Coming Soon' },
          { value: 'Rented', label: 'Rented' }, { value: 'Pending', label: 'Pending' }
        ]},
        { key: 'fee_structure', label: 'Fee', options: [
          { value: 'owner_pay', label: 'Owner Pay' }, { value: 'tenant_pay', label: 'Tenant Pay' }, { value: 'no_fee', label: 'No Fee' }
        ]},
      ],
      onFilter: 'RentalsCRM._filterListings',
      quickActions: [
        { label: 'New Rental', icon: 'fa-plus', onclick: 'CRM.openListingForm && CRM.openListingForm("rental")' },
      ],
    });

    html += ActivityTable.render({
      id: 'rlistings_table',
      columns: [
        { key: 'address', label: 'Address', render: function (r) {
          var addr = r.address;
          if (typeof addr === 'object') addr = addr.UnparsedAddress || addr.full || '';
          return '<span class="font-bold text-gray-900">' + E(addr || '') + '</span>';
        }},
        { key: 'unit_number', label: 'Unit', render: function (r) {
          return r.unit_number ? '<span class="text-sm text-gray-600">#' + E(r.unit_number) + '</span>' : '<span class="text-gray-400">-</span>';
        }},
        { key: 'landlord_name', label: 'Landlord', render: function (r) {
          return '<span class="text-sm text-gray-600">' + E(r.landlord_name || r.owner_name || '-') + '</span>';
        }},
        { key: 'status', label: 'Status', render: function (r) {
          return _listingBadge(r.status);
        }},
        { key: 'list_price', label: 'Rent/mo', render: function (r) {
          return '<span class="font-bold text-gray-900">' + $(Number(r.list_price || 0)) + '</span><span class="text-[10px] text-gray-400">/mo</span>';
        }},
        { key: 'fee_structure', label: 'Fee', render: function (r) {
          return _feePill(r.fee_structure);
        }},
        { key: 'applications_count', label: 'Apps', render: function (r) {
          var count = Number(r.applications_count || 0);
          if (count === 0) return '<span class="text-gray-400">0</span>';
          return '<span class="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">' + count + '</span>';
        }},
        { key: 'showings_count', label: 'Showings', render: function (r) {
          return '<span class="text-sm font-medium text-gray-700">' + String(r.showings_count || 0) + '</span>';
        }},
        { key: 'rls_eligible', label: 'RLS', render: function (r) {
          var ok = r.rls_eligible !== false;
          return ok
            ? '<span class="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-bold">RLS</span>'
            : '<span class="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-bold">Site Only</span>';
        }},
        { key: '_actions', label: '', width: '44px', render: function (r) {
          return '<button style="width:28px;height:28px;border-radius:6px;border:1px solid #E5E7EB;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#6B7280;font-size:12px;" title="Open" ' +
            'onclick="event.stopPropagation();RentalsCRM._openListing(\'' + E(r.id) + '\')" ' +
            'onmouseover="this.style.borderColor=\'#B8860B\';this.style.color=\'#B8860B\'" onmouseout="this.style.borderColor=\'#E5E7EB\';this.style.color=\'#6B7280\'">' +
            '<i class="fas fa-external-link-alt"></i></button>';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'RentalsCRM._sortListings',
      onRowClick: 'RentalsCRM._openListing',
      page: st.page,
      pageSize: 25,
      onPage: 'RentalsCRM._pageListings',
      emptyIcon: 'fa-building',
      emptyText: 'No rental listings',
    });

    c.innerHTML = html;
  }

  function _searchListings(q) { _state.listings.search = q; _state.listings.page = 1; _renderListings(CRM.getContent()); }
  function _filterListings(key, val) {
    if (key) _state.listings.filter[key] = val;
    _state.listings.page = 1;
    _renderListings(CRM.getContent());
  }
  function _sortListings(key) {
    var st = _state.listings;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderListings(CRM.getContent());
  }
  function _pageListings(p) { _state.listings.page = p; _renderListings(CRM.getContent()); }
  function _openListing(id) { Router.navigate('/workspace/listing/' + id + '/overview'); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 3: VIEWED / DID NOT RENT (THE MOST IMPORTANT TAB)
  // ═══════════════════════════════════════════════════════════════════════

  function viewedDidNotRent() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _subnav('viewed') + UI.loading();

    MallanAPI._fetch('/api/crm/rentals/prospects').then(function (data) {
      _state.viewed.data = (data.prospects || data.clients || []).map(function (p) { return ClientNormalizer.normalize(p); });
      _renderViewed(c);
    }).catch(function () {
      c.innerHTML = _subnav('viewed') + UI.emptyState('fa-eye-slash', 'Unable to load viewed/did-not-rent');
    });
  }

  function _renderViewed(c) {
    var st = _state.viewed;
    var rows = ActivityTable.filterRows(st.data, st.search);
    // Apply filters
    if (st.filter.buyer_potential) {
      var bp = st.filter.buyer_potential;
      rows = rows.filter(function (r) {
        var s = Number(r.buyer_potential || 0);
        if (bp === 'high') return s >= 70;
        if (bp === 'medium') return s >= 40 && s < 70;
        if (bp === 'low') return s < 40;
        return true;
      });
    }
    if (st.filter.no_fee === 'yes') {
      rows = rows.filter(function (r) { return r.no_fee_only; });
    }
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    // KPIs
    var totalProspects = st.data.length;
    var highBuyerPotential = st.data.filter(function (r) { return Number(r.buyer_potential || 0) >= 70; }).length;
    var now = Date.now();
    var needingOutreach = st.data.filter(function (r) {
      var overdue = false;
      ['outreach_30d_date', 'outreach_60d_date', 'outreach_90d_date'].forEach(function (key) {
        if (r[key] && new Date(r[key]).getTime() < now && !r.last_response_at) overdue = true;
      });
      return overdue;
    }).length;
    var noFeeCount = st.data.filter(function (r) { return r.no_fee_only; }).length;

    var html = _subnav('viewed');

    html += _kpi([
      { icon: 'fa-eye-slash', value: totalProspects, label: 'Total Prospects', color: '#6366F1' },
      { icon: 'fa-arrow-up', value: highBuyerPotential, label: 'High Buyer Potential', color: '#059669' },
      { icon: 'fa-phone-slash', value: needingOutreach, label: 'Needing Outreach', color: '#DC2626' },
      { icon: 'fa-tag', value: noFeeCount, label: 'No-Fee Only', color: '#8B5CF6' },
    ]);

    html += FilterBar.render({
      id: 'viewed',
      placeholder: 'Search viewed/did-not-rent...',
      onSearch: 'RentalsCRM._searchViewed',
      filters: [
        { key: 'buyer_potential', label: 'Buyer Potential', options: [
          { value: 'high', label: 'High (70+)' }, { value: 'medium', label: 'Medium (40-69)' }, { value: 'low', label: 'Low (0-39)' }
        ]},
        { key: 'no_fee', label: 'No-Fee Only', options: [
          { value: 'yes', label: 'Yes' }
        ]},
      ],
      onFilter: 'RentalsCRM._filterViewed',
      quickActions: [
        { label: 'New Prospect', icon: 'fa-plus', onclick: 'CRM.quickNewClient({ role: "renter" })' },
      ],
    });

    html += ActivityTable.render({
      id: 'viewed_table',
      columns: [
        { key: '_avatar', label: '', width: '44px', render: function (r) {
          return UI.avatar(r.name, 32);
        }},
        { key: 'name', label: 'Name', render: function (r) {
          return '<span class="font-semibold text-gray-900">' + E(r.name || '') + '</span>';
        }},
        { key: 'email', label: 'Email / Phone', render: function (r) {
          var parts = [];
          if (r.email) parts.push(E(r.email));
          if (r.phone) parts.push(E(r.phone));
          return '<span class="text-sm text-gray-600">' + (parts.join('<br>') || '-') + '</span>';
        }},
        { key: 'last_viewed_address', label: 'Last Unit Viewed', render: function (r) {
          return r.last_viewed_address
            ? '<span class="text-sm text-gray-700">' + E(r.last_viewed_address) + '</span>'
            : '<span class="text-gray-400">-</span>';
        }},
        { key: 'last_viewed_date', label: 'Date Viewed', render: function (r) {
          return r.last_viewed_date
            ? '<span class="text-sm text-gray-600">' + D(r.last_viewed_date) + '</span>'
            : '<span class="text-gray-400">-</span>';
        }},
        { key: 'comments', label: 'Comments', render: function (r) {
          var c = r.comments || r.notes || '';
          if (!c) return '<span class="text-gray-400">-</span>';
          return '<span class="text-xs text-gray-600" title="' + E(c) + '">' + E(c.length > 30 ? c.substring(0, 30) + '...' : c) + '</span>';
        }},
        { key: 'no_fee_only', label: 'No-Fee', render: function (r) {
          return r.no_fee_only
            ? '<span class="nofee-badge">No-Fee Only</span>'
            : '<span class="nofee-badge-no">Any</span>';
        }},
        { key: 'buyer_potential', label: 'Buyer Potential', render: function (r) {
          return _scoreBar(r.buyer_potential);
        }},
        { key: '_outreach', label: 'Outreach', render: function (r) {
          return _outreachDatesBadges(r);
        }},
        { key: 'last_email_opened_at', label: 'Last Email', render: function (r) {
          return r.last_email_opened_at
            ? '<span class="text-xs text-gray-600">' + Utils.formatTimeAgo(r.last_email_opened_at) + '</span>'
            : '<span class="text-gray-400">-</span>';
        }},
        { key: 'last_response_at', label: 'Last Response', render: function (r) {
          return r.last_response_at
            ? '<span class="text-xs text-gray-600">' + Utils.formatTimeAgo(r.last_response_at) + '</span>'
            : '<span class="text-gray-400">-</span>';
        }},
        { key: '_actions', label: '', width: '80px', render: function (r) {
          return '<div style="display:flex;gap:4px;">' +
            '<button style="width:28px;height:28px;border-radius:6px;border:1px solid #E5E7EB;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#6B7280;font-size:12px;" title="Promote to Buyer" ' +
              'onclick="event.stopPropagation();RentalsCRM._promoteToBuyer(\'' + E(r.id) + '\')" ' +
              'onmouseover="this.style.borderColor=\'#059669\';this.style.color=\'#059669\'" onmouseout="this.style.borderColor=\'#E5E7EB\';this.style.color=\'#6B7280\'">' +
              '<i class="fas fa-exchange-alt"></i></button>' +
            '<button style="width:28px;height:28px;border-radius:6px;border:1px solid #E5E7EB;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#6B7280;font-size:12px;" title="Delete" ' +
              'onclick="event.stopPropagation();RentalsCRM._deleteProspect(\'' + E(r.id) + '\')" ' +
              'onmouseover="this.style.borderColor=\'#DC2626\';this.style.color=\'#DC2626\'" onmouseout="this.style.borderColor=\'#E5E7EB\';this.style.color=\'#6B7280\'">' +
              '<i class="fas fa-trash-alt"></i></button>' +
          '</div>';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'RentalsCRM._sortViewed',
      onRowClick: 'RentalsCRM._openProspectWorkspace',
      page: st.page,
      pageSize: 25,
      onPage: 'RentalsCRM._pageViewed',
      emptyIcon: 'fa-eye-slash',
      emptyText: 'No viewed/did-not-rent records yet',
    });

    c.innerHTML = html;
  }

  function _searchViewed(q) { _state.viewed.search = q; _state.viewed.page = 1; _renderViewed(CRM.getContent()); }
  function _filterViewed(key, val) {
    if (key) _state.viewed.filter[key] = val;
    _state.viewed.page = 1;
    _renderViewed(CRM.getContent());
  }
  function _sortViewed(key) {
    var st = _state.viewed;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderViewed(CRM.getContent());
  }
  function _pageViewed(p) { _state.viewed.page = p; _renderViewed(CRM.getContent()); }

  function _promoteToBuyer(id) {
    if (!confirm('Promote this prospect to the Active Buyer pipeline in Sales CRM?')) return;
    CRM.toast('Promoting to buyer pipeline...', 'info');
    MallanAPI._fetch('/api/crm/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: id, action: 'renter_to_buyer' }),
    }).then(function () {
      CRM.toast('Client promoted to buyer!', 'success');
      viewedDidNotRent();
    }).catch(function () {
      CRM.toast('Failed to promote -- try again', 'error');
    });
  }

  function _deleteProspect(id) {
    if (!confirm('Delete this prospect? This cannot be undone.')) return;
    MallanAPI._fetch('/api/crm/clients/' + id, { method: 'DELETE' }).then(function () {
      CRM.toast('Prospect deleted', 'success');
      _state.viewed.data = _state.viewed.data.filter(function (r) { return String(r.id) !== String(id); });
      _renderViewed(CRM.getContent());
    }).catch(function () { CRM.toast('Delete failed', 'error'); });
  }

  // ─── Prospect Workspace (Viewed / Did Not Rent) ─────────────────────
  function _openProspectWorkspace(id) {
    _state.ws.tab = 'overview';
    _loadProspectWorkspace(id);
  }

  function _loadProspectWorkspace(id) {
    var c = CRM.getContent();
    c.innerHTML = UI.loading();

    Promise.all([
      MallanAPI._fetch('/api/crm/clients/' + id),
      MallanAPI._fetch('/api/crm/showing-history?lead_id=' + id).catch(function () { return { showings: [] }; }),
      MallanAPI._fetch('/api/crm/clients/' + id + '/family').catch(function () { return { members: [] }; }),
    ]).then(function (results) {
      var cl = results[0].client || results[0];
      var showings = results[1].showings || [];
      var members = results[2].members || [];
      _state.ws.client = cl;
      _state.ws.showingHistory = showings;
      _state.ws.familyMembers = members;
      _renderProspectWorkspace(c, cl, showings, members);
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-eye-slash', 'Unable to load prospect');
    });
  }

  function _renderProspectWorkspace(c, cl, showings, members) {
    var activeTab = _state.ws.tab;
    var tabs = [
      { id: 'overview', label: 'Overview', icon: 'fa-th-large' },
      { id: 'showings', label: 'Showing History', icon: 'fa-calendar-alt' },
      { id: 'criteria', label: 'Criteria', icon: 'fa-sliders-h' },
      { id: 'outreach', label: 'Re-Engagement', icon: 'fa-paper-plane' },
      { id: 'buyer', label: 'Buyer Assessment', icon: 'fa-chart-line' },
      { id: 'drips', label: 'Drip Status', icon: 'fa-tint' },
      { id: 'activity', label: 'Activity', icon: 'fa-stream' },
    ];

    var buyerScore = Number(cl.buyer_potential || 0);
    var headerExtra = buyerScore >= 50
      ? '<button class="btn btn-sm btn-gold" onclick="RentalsCRM._promoteToBuyer(\'' + E(cl.id) + '\')"><i class="fas fa-arrow-up mr-1"></i>Promote to Active Buyer</button>'
      : '';

    var shell = WorkspaceShell.render({
      backRoute: '/rentals/viewed',
      backLabel: 'Viewed / Did Not Rent',
      client: cl,
      avatarName: cl.name || ((cl.first_name || '') + ' ' + (cl.last_name || '')).trim(),
      displayName: cl.name || ((cl.first_name || '') + ' ' + (cl.last_name || '')).trim(),
      role: 'renter',
      stage: cl.pipeline_stage || 'viewed',
      tabs: tabs,
      activeTab: activeTab,
      onTab: 'RentalsCRM._prospectTab',
      actions: [
        { label: 'Edit', icon: 'fa-edit', onclick: 'RentalsCRM._editClient(\'' + E(cl.id) + '\')' },
        { label: 'Delete', icon: 'fa-trash-alt', onclick: 'RentalsCRM._deleteClient(\'' + E(cl.id) + '\',\'/rentals/viewed\')', cls: 'btn btn-sm btn-outline text-red-500' },
      ],
      headerExtra: headerExtra,
    });

    c.innerHTML = shell;
    var content = document.getElementById('workspace-content');
    if (!content) return;

    if (activeTab === 'overview') {
      content.innerHTML =
        WorkspaceShell.renderContactCard(cl) +
        WorkspaceShell.renderMultiPerson(cl, members) +
        _prospectQuickStats(cl, showings);
    } else if (activeTab === 'showings') {
      _renderShowingHistory(content, cl, showings);
    } else if (activeTab === 'criteria') {
      _renderCriteria(content, cl);
    } else if (activeTab === 'outreach') {
      _renderOutreach(content, cl);
    } else if (activeTab === 'buyer') {
      _renderBuyerAssessment(content, cl);
    } else if (activeTab === 'drips') {
      _renderDripStatus(content, cl);
    } else if (activeTab === 'activity') {
      _loadClientActivity(content, cl.id);
    }
  }

  function _prospectTab(tabId) {
    _state.ws.tab = tabId;
    if (_state.ws.client) {
      _renderProspectWorkspace(CRM.getContent(), _state.ws.client, _state.ws.showingHistory, _state.ws.familyMembers);
    }
  }

  function _prospectQuickStats(cl, showings) {
    var html = '<div class="ws-section">';
    html += '<div class="ws-section-title"><i class="fas fa-chart-pie text-gold"></i>Quick Stats</div>';
    html += '<div class="grid grid-cols-2 sm:grid-cols-4 gap-4">';
    html += '<div class="text-center p-3 bg-gray-50 rounded-lg"><div class="text-2xl font-bold text-gray-900">' + showings.length + '</div><div class="text-[10px] font-semibold text-gray-500 uppercase">Units Viewed</div></div>';
    html += '<div class="text-center p-3 bg-gray-50 rounded-lg"><div class="text-2xl font-bold ' + (Number(cl.buyer_potential || 0) >= 70 ? 'text-green-600' : 'text-gray-900') + '">' + (cl.buyer_potential || 0) + '</div><div class="text-[10px] font-semibold text-gray-500 uppercase">Buyer Score</div></div>';
    html += '<div class="text-center p-3 bg-gray-50 rounded-lg"><div class="text-2xl font-bold text-gray-900">' + (cl.no_fee_only ? 'Yes' : 'No') + '</div><div class="text-[10px] font-semibold text-gray-500 uppercase">No-Fee Only</div></div>';
    html += '<div class="text-center p-3 bg-gray-50 rounded-lg"><div class="text-2xl font-bold text-gray-900">' + (cl.last_response_at ? Utils.formatTimeAgo(cl.last_response_at) : 'Never') + '</div><div class="text-[10px] font-semibold text-gray-500 uppercase">Last Response</div></div>';
    html += '</div></div>';
    return html;
  }

  // ─── Showing History (COMPREHENSIVE) ────────────────────────────────
  function _renderShowingHistory(content, cl, showings) {
    var html = '<div class="ws-section">';
    html += '<div class="flex items-center justify-between mb-4">';
    html += '<div class="ws-section-title" style="margin-bottom:0"><i class="fas fa-calendar-alt text-gold"></i>Full Showing History (' + showings.length + ')</div>';
    html += '<button class="btn btn-sm btn-gold" onclick="RentalsCRM._addShowing(\'' + E(cl.id) + '\')"><i class="fas fa-plus mr-1"></i>Add Showing</button>';
    html += '</div>';

    if (showings.length === 0) {
      html += '<div class="text-center py-8"><i class="fas fa-calendar-times text-4xl text-gray-300 mb-3"></i><p class="text-sm text-gray-500">No showings recorded yet</p></div>';
    } else {
      // Visual timeline
      html += '<div class="mb-6">';
      html += '<div class="ws-section-title"><i class="fas fa-project-diagram text-gray-400"></i>Timeline</div>';
      html += '<div style="position:relative;height:60px;background:#F9FAFB;border-radius:8px;overflow:hidden;padding:0 16px;">';

      // Calculate date range
      var dates = showings.map(function (s) { return new Date(s.showing_date || s.date || s.created_at).getTime(); });
      var minDate = Math.min.apply(null, dates);
      var maxDate = Math.max.apply(null, dates);
      var range = maxDate - minDate || 86400000; // at least 1 day

      showings.forEach(function (s, i) {
        var d = new Date(s.showing_date || s.date || s.created_at).getTime();
        var pct = ((d - minDate) / range) * 100;
        var reaction = (s.reaction || '').toLowerCase();
        var dotColor = reaction === 'liked' ? '#059669' : reaction === 'disliked' ? '#DC2626' : '#F59E0B';
        html += '<div style="position:absolute;left:' + Math.max(2, Math.min(pct, 96)) + '%;top:50%;transform:translate(-50%,-50%);z-index:' + (i + 1) + ';" title="' + E((s.address || '') + ' - ' + D(s.showing_date || s.date)) + '">' +
          '<div style="width:14px;height:14px;border-radius:50%;background:' + dotColor + ';border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:pointer;" onclick="RentalsCRM._scrollToShowing(' + i + ')"></div>' +
        '</div>';
      });

      // Date labels
      html += '<div style="position:absolute;bottom:4px;left:16px;font-size:9px;color:#9CA3AF;">' + D(new Date(minDate)) + '</div>';
      html += '<div style="position:absolute;bottom:4px;right:16px;font-size:9px;color:#9CA3AF;">' + D(new Date(maxDate)) + '</div>';
      html += '</div>';
      html += '<div class="flex gap-3 mt-2 text-[10px] text-gray-500">' +
        '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#059669;margin-right:3px;"></span>Liked</span>' +
        '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#DC2626;margin-right:3px;"></span>Disliked</span>' +
        '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#F59E0B;margin-right:3px;"></span>Neutral</span>' +
      '</div>';
      html += '</div>';

      // Detail cards
      html += '<div class="sh-timeline">';
      showings.forEach(function (s, i) {
        var reaction = (s.reaction || '').toLowerCase();
        var dotColor = reaction === 'liked' ? '#059669' : reaction === 'disliked' ? '#DC2626' : '#F59E0B';
        var reasonColor = {
          fee: '#8B5CF6', price: '#DC2626', location: '#3B82F6', building: '#D97706', timing: '#6366F1'
        };
        var reason = (s.reason_not_rented || s.why_not || '').toLowerCase();

        html += '<div class="sh-timeline-card" id="showing-' + i + '">';
        html += '<div class="sh-timeline-dot" style="background:' + dotColor + '"></div>';
        html += '<div class="flex items-start justify-between">';
        html += '<div>';
        html += '<h4 class="text-sm font-bold text-gray-900">' + E(s.address || 'Unknown Address') + '</h4>';
        if (s.unit_number) html += '<span class="text-xs text-gray-500">Unit #' + E(s.unit_number) + '</span>';
        html += '<div class="flex items-center gap-2 mt-1 flex-wrap">';
        html += '<span class="text-xs text-gray-500"><i class="fas fa-calendar mr-1"></i>' + D(s.showing_date || s.date || s.created_at) + '</span>';
        if (s.price_at_time) html += '<span class="text-xs font-bold text-gray-700">' + $(Number(s.price_at_time)) + '/mo</span>';
        if (reaction) {
          var reactionIcon = reaction === 'liked' ? 'fa-thumbs-up' : reaction === 'disliked' ? 'fa-thumbs-down' : 'fa-meh';
          html += '<span style="color:' + dotColor + ';font-size:11px;font-weight:700;"><i class="fas ' + reactionIcon + ' mr-1"></i>' + E(reaction) + '</span>';
        }
        html += '</div>';
        if (s.caught_attention) {
          html += '<p class="text-xs text-gray-600 mt-1"><span class="font-semibold text-gray-700">Caught attention:</span> ' + E(s.caught_attention) + '</p>';
        }
        if (reason) {
          var rc = reasonColor[reason] || '#6B7280';
          html += '<p class="text-xs mt-1"><span class="font-semibold" style="color:' + rc + '">Why not rented:</span> <span class="text-gray-600">' + E(s.reason_not_rented || s.why_not || '') + '</span></p>';
        }
        if (s.comments || s.notes) {
          html += '<p class="text-xs text-gray-500 mt-1 italic">' + E(s.comments || s.notes) + '</p>';
        }
        html += '</div>';
        html += '<div class="flex gap-1 flex-shrink-0">';
        html += '<button class="btn btn-sm btn-outline text-xs" onclick="RentalsCRM._editShowing(\'' + E(cl.id) + '\',\'' + E(s.id) + '\')"><i class="fas fa-edit"></i></button>';
        html += '<button class="btn btn-sm btn-outline text-xs text-red-500" onclick="RentalsCRM._deleteShowing(\'' + E(cl.id) + '\',\'' + E(s.id) + '\')"><i class="fas fa-trash-alt"></i></button>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    content.innerHTML = html;
  }

  function _scrollToShowing(index) {
    var el = document.getElementById('showing-' + index);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function _addShowing(clientId) {
    var formHtml = '<div class="space-y-3 p-4">' +
      '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Address</label>' +
        '<input id="sh_address" type="text" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" placeholder="123 Main St"></div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Unit #</label><input id="sh_unit" type="text" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Date</label><input id="sh_date" type="date" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Rent at Time</label><input id="sh_price" type="number" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" placeholder="3500"></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Reaction</label>' +
          '<select id="sh_reaction" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
            '<option value="">Select...</option><option value="liked">Liked</option><option value="neutral">Neutral</option><option value="disliked">Disliked</option>' +
          '</select></div>' +
      '</div>' +
      '<div><label class="text-xs font-semibold text-gray-700 block mb-1">What Caught Attention</label><input id="sh_attention" type="text" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
      '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Why Not Rented</label>' +
        '<select id="sh_why" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
          '<option value="">Select...</option><option value="fee">Fee</option><option value="price">Price</option><option value="location">Location</option><option value="building">Building</option><option value="timing">Timing</option><option value="other">Other</option>' +
        '</select></div>' +
      '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Comments</label><textarea id="sh_comments" rows="2" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></textarea></div>' +
    '</div>';

    CRM.openModal('Record New Showing', formHtml, function () {
      var payload = {
        lead_id: clientId,
        address: _val('sh_address'),
        unit_number: _val('sh_unit'),
        showing_date: _val('sh_date'),
        price_at_time: _val('sh_price'),
        reaction: _val('sh_reaction'),
        caught_attention: _val('sh_attention'),
        reason_not_rented: _val('sh_why'),
        comments: _val('sh_comments'),
      };
      if (!payload.address) { CRM.toast('Address is required', 'error'); return; }
      MallanAPI._fetch('/api/crm/showing-history', {
        method: 'POST',
        body: JSON.stringify(payload),
      }).then(function () {
        CRM.toast('Showing recorded', 'success');
        CRM.closeModal();
        _loadProspectWorkspace(clientId);
      }).catch(function () { CRM.toast('Failed to save showing', 'error'); });
    });
  }

  function _editShowing(clientId, showingId) {
    var showing = _state.ws.showingHistory.find(function (s) { return String(s.id) === String(showingId); });
    if (!showing) { CRM.toast('Showing not found', 'error'); return; }

    var formHtml = '<div class="space-y-3 p-4">' +
      '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Address</label>' +
        '<input id="sh_address" type="text" value="' + E(showing.address || '') + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Unit #</label><input id="sh_unit" type="text" value="' + E(showing.unit_number || '') + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Date</label><input id="sh_date" type="date" value="' + E((showing.showing_date || showing.date || '').substring(0, 10)) + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Rent at Time</label><input id="sh_price" type="number" value="' + E(String(showing.price_at_time || '')) + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Reaction</label>' +
          '<select id="sh_reaction" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
            '<option value="">Select...</option>' +
            '<option value="liked"' + (showing.reaction === 'liked' ? ' selected' : '') + '>Liked</option>' +
            '<option value="neutral"' + (showing.reaction === 'neutral' ? ' selected' : '') + '>Neutral</option>' +
            '<option value="disliked"' + (showing.reaction === 'disliked' ? ' selected' : '') + '>Disliked</option>' +
          '</select></div>' +
      '</div>' +
      '<div><label class="text-xs font-semibold text-gray-700 block mb-1">What Caught Attention</label><input id="sh_attention" type="text" value="' + E(showing.caught_attention || '') + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
      '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Why Not Rented</label>' +
        '<select id="sh_why" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
          '<option value="">Select...</option>' +
          '<option value="fee"' + ((showing.reason_not_rented || '') === 'fee' ? ' selected' : '') + '>Fee</option>' +
          '<option value="price"' + ((showing.reason_not_rented || '') === 'price' ? ' selected' : '') + '>Price</option>' +
          '<option value="location"' + ((showing.reason_not_rented || '') === 'location' ? ' selected' : '') + '>Location</option>' +
          '<option value="building"' + ((showing.reason_not_rented || '') === 'building' ? ' selected' : '') + '>Building</option>' +
          '<option value="timing"' + ((showing.reason_not_rented || '') === 'timing' ? ' selected' : '') + '>Timing</option>' +
          '<option value="other"' + ((showing.reason_not_rented || '') === 'other' ? ' selected' : '') + '>Other</option>' +
        '</select></div>' +
      '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Comments</label><textarea id="sh_comments" rows="2" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' + E(showing.comments || showing.notes || '') + '</textarea></div>' +
    '</div>';

    CRM.openModal('Edit Showing', formHtml, function () {
      var payload = {
        address: _val('sh_address'),
        unit_number: _val('sh_unit'),
        showing_date: _val('sh_date'),
        price_at_time: _val('sh_price'),
        reaction: _val('sh_reaction'),
        caught_attention: _val('sh_attention'),
        reason_not_rented: _val('sh_why'),
        comments: _val('sh_comments'),
      };
      MallanAPI._fetch('/api/crm/showing-history/' + showingId, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }).then(function () {
        CRM.toast('Showing updated', 'success');
        CRM.closeModal();
        _loadProspectWorkspace(clientId);
      }).catch(function () { CRM.toast('Failed to update showing', 'error'); });
    });
  }

  function _deleteShowing(clientId, showingId) {
    if (!confirm('Delete this showing record?')) return;
    MallanAPI._fetch('/api/crm/showing-history/' + showingId, { method: 'DELETE' }).then(function () {
      CRM.toast('Showing deleted', 'success');
      _loadProspectWorkspace(clientId);
    }).catch(function () { CRM.toast('Delete failed', 'error'); });
  }

  function _val(id) {
    var el = document.getElementById(id);
    return el ? (el.value || '').trim() : '';
  }

  // ─── Criteria Tab ──────────────────────────────────────────────────
  function _renderCriteria(content, cl) {
    var criteria = cl.search_criteria || {};
    var html = '<div class="ws-section">';
    html += '<div class="flex items-center justify-between mb-4">';
    html += '<div class="ws-section-title" style="margin-bottom:0"><i class="fas fa-sliders-h text-gold"></i>Search Criteria</div>';
    html += '<button class="btn btn-sm btn-outline" onclick="RentalsCRM._editCriteria(\'' + E(cl.id) + '\')"><i class="fas fa-edit mr-1"></i>Edit</button>';
    html += '</div>';
    html += '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">';
    html += _wsField('Max Rent', criteria.max_rent ? $(Number(criteria.max_rent)) : null);
    html += _wsField('Min Beds', criteria.min_beds);
    html += _wsField('Min Baths', criteria.min_baths);
    html += _wsField('Neighborhoods', Array.isArray(criteria.neighborhoods) ? criteria.neighborhoods.join(', ') : criteria.neighborhoods);
    html += _wsField('No-Fee Only', cl.no_fee_only ? 'Yes' : 'No');
    html += _wsField('Pet Friendly', criteria.pet_friendly ? 'Yes' : null);
    html += _wsField('Laundry', criteria.laundry);
    html += _wsField('Outdoor Space', criteria.outdoor_space ? 'Yes' : null);
    html += _wsField('Move-in Date', criteria.move_in_date);
    html += '</div>';

    // Criteria drift detection
    if (_state.ws.showingHistory.length >= 3) {
      html += '<div class="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">';
      html += '<p class="text-sm font-bold text-amber-700"><i class="fas fa-chart-line mr-1"></i>Criteria Drift Analysis</p>';
      var prices = _state.ws.showingHistory.map(function (s) { return Number(s.price_at_time || 0); }).filter(function (p) { return p > 0; });
      if (prices.length >= 2) {
        var avgPrice = Math.round(prices.reduce(function (a, b) { return a + b; }, 0) / prices.length);
        var maxCriteria = Number(criteria.max_rent || 0);
        if (maxCriteria > 0 && avgPrice > maxCriteria * 1.1) {
          html += '<p class="text-xs text-amber-600 mt-1">Viewing units averaging ' + $(avgPrice) + '/mo which is above stated max of ' + $(maxCriteria) + '/mo. Consider adjusting criteria.</p>';
        } else if (maxCriteria > 0) {
          html += '<p class="text-xs text-green-600 mt-1">Viewing units within stated budget range. Criteria appear consistent.</p>';
        }
      }
      var locations = _state.ws.showingHistory.map(function (s) { return s.neighborhood || ''; }).filter(function (n) { return n; });
      if (locations.length > 0) {
        var unique = [];
        locations.forEach(function (l) { if (unique.indexOf(l) === -1) unique.push(l); });
        html += '<p class="text-xs text-gray-600 mt-1">Neighborhoods viewed: ' + unique.join(', ') + '</p>';
      }
      html += '</div>';
    }

    html += '</div>';
    content.innerHTML = html;
  }

  function _editCriteria(clientId) {
    MallanAPI._fetch('/api/crm/clients/' + clientId).then(function (data) {
      var cl = data.client || data;
      var cr = cl.search_criteria || {};
      var formHtml = '<div class="space-y-3 p-4">' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Max Rent</label><input id="cr_max_rent" type="number" value="' + E(String(cr.max_rent || '')) + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Min Beds</label><input id="cr_min_beds" type="number" value="' + E(String(cr.min_beds || '')) + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Min Baths</label><input id="cr_min_baths" type="number" value="' + E(String(cr.min_baths || '')) + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Move-in Date</label><input id="cr_move_in" type="date" value="' + E(String(cr.move_in_date || '').substring(0, 10)) + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
        '</div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Neighborhoods (comma-separated)</label><input id="cr_neighborhoods" type="text" value="' + E(Array.isArray(cr.neighborhoods) ? cr.neighborhoods.join(', ') : (cr.neighborhoods || '')) + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
        '<div class="flex items-center gap-4">' +
          '<label class="flex items-center gap-2 text-sm"><input type="checkbox" id="cr_no_fee"' + (cl.no_fee_only ? ' checked' : '') + '> No-Fee Only</label>' +
          '<label class="flex items-center gap-2 text-sm"><input type="checkbox" id="cr_pet"' + (cr.pet_friendly ? ' checked' : '') + '> Pet Friendly</label>' +
          '<label class="flex items-center gap-2 text-sm"><input type="checkbox" id="cr_outdoor"' + (cr.outdoor_space ? ' checked' : '') + '> Outdoor Space</label>' +
        '</div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Laundry Preference</label>' +
          '<select id="cr_laundry" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
            '<option value="">Any</option>' +
            '<option value="in_unit"' + (cr.laundry === 'in_unit' ? ' selected' : '') + '>In-Unit</option>' +
            '<option value="in_building"' + (cr.laundry === 'in_building' ? ' selected' : '') + '>In-Building</option>' +
          '</select></div>' +
      '</div>';

      CRM.openModal('Edit Search Criteria', formHtml, function () {
        var nbh = _val('cr_neighborhoods');
        var payload = {
          no_fee_only: document.getElementById('cr_no_fee') ? document.getElementById('cr_no_fee').checked : false,
          search_criteria: {
            max_rent: _val('cr_max_rent') ? Number(_val('cr_max_rent')) : null,
            min_beds: _val('cr_min_beds') ? Number(_val('cr_min_beds')) : null,
            min_baths: _val('cr_min_baths') ? Number(_val('cr_min_baths')) : null,
            move_in_date: _val('cr_move_in') || null,
            neighborhoods: nbh ? nbh.split(',').map(function (n) { return n.trim(); }) : [],
            pet_friendly: document.getElementById('cr_pet') ? document.getElementById('cr_pet').checked : false,
            outdoor_space: document.getElementById('cr_outdoor') ? document.getElementById('cr_outdoor').checked : false,
            laundry: _val('cr_laundry') || null,
          },
        };
        MallanAPI._fetch('/api/crm/clients/' + clientId, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }).then(function () {
          CRM.toast('Criteria saved', 'success');
          CRM.closeModal();
          _loadProspectWorkspace(clientId);
        }).catch(function () { CRM.toast('Save failed', 'error'); });
      });
    });
  }

  // ─── Outreach / Re-Engagement Tab ──────────────────────────────────
  function _renderOutreach(content, cl) {
    var html = '<div class="ws-section">';
    html += '<div class="ws-section-title"><i class="fas fa-paper-plane text-gold"></i>Re-Engagement Automation</div>';

    var dates = [
      { key: 'outreach_6mo_date', label: '6 Month Check-In', icon: 'fa-calendar' },
      { key: 'outreach_90d_date', label: '90 Day Outreach', icon: 'fa-clock' },
      { key: 'outreach_60d_date', label: '60 Day Outreach', icon: 'fa-clock' },
      { key: 'outreach_30d_date', label: '30 Day Outreach', icon: 'fa-bell' },
    ];

    html += '<div class="space-y-3">';
    dates.forEach(function (d) {
      var dateVal = cl[d.key];
      var isPast = dateVal && new Date(dateVal).getTime() < Date.now();
      var statusCls = !dateVal ? 'bg-gray-50 border-gray-200' : isPast ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200';
      var statusText = !dateVal ? 'Not Scheduled' : isPast ? 'Completed' : 'Scheduled for ' + D(dateVal);
      var statusIcon = !dateVal ? 'fa-minus-circle text-gray-400' : isPast ? 'fa-check-circle text-green-500' : 'fa-clock text-blue-500';

      html += '<div class="flex items-center justify-between p-3 border rounded-lg ' + statusCls + '">' +
        '<div class="flex items-center gap-3">' +
          '<i class="fas ' + d.icon + ' text-gray-400"></i>' +
          '<div>' +
            '<p class="text-sm font-bold text-gray-900">' + E(d.label) + '</p>' +
            '<p class="text-xs text-gray-500"><i class="fas ' + statusIcon + ' mr-1"></i>' + statusText + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="flex gap-2">' +
          '<button class="btn btn-sm btn-outline text-xs" onclick="RentalsCRM._setOutreachDate(\'' + E(cl.id) + '\',\'' + E(d.key) + '\')">' + (dateVal ? 'Reschedule' : 'Schedule') + '</button>' +
          (isPast ? '<button class="btn btn-sm btn-gold text-xs" onclick="RentalsCRM._sendOutreach(\'' + E(cl.id) + '\',\'' + E(d.key) + '\')"><i class="fas fa-paper-plane mr-1"></i>Send Now</button>' : '') +
        '</div>' +
      '</div>';
    });
    html += '</div>';

    // Last contact info
    html += '<div class="mt-4 p-3 bg-gray-50 rounded-lg">';
    html += '<div class="grid grid-cols-2 gap-4 text-sm">';
    html += '<div><span class="text-xs font-semibold text-gray-500">Last Email Opened</span><p class="font-medium text-gray-900">' + (cl.last_email_opened_at ? Utils.formatTimeAgo(cl.last_email_opened_at) : 'Never') + '</p></div>';
    html += '<div><span class="text-xs font-semibold text-gray-500">Last Response</span><p class="font-medium text-gray-900">' + (cl.last_response_at ? Utils.formatTimeAgo(cl.last_response_at) : 'Never') + '</p></div>';
    html += '</div></div>';

    html += '</div>';
    content.innerHTML = html;
  }

  function _setOutreachDate(clientId, key) {
    var formHtml = '<div class="p-4"><label class="text-xs font-semibold text-gray-700 block mb-1">Schedule Date</label>' +
      '<input id="outreach_date_input" type="date" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>';
    CRM.openModal('Set Outreach Date', formHtml, function () {
      var dateVal = _val('outreach_date_input');
      if (!dateVal) { CRM.toast('Date is required', 'error'); return; }
      var payload = {};
      payload[key] = dateVal;
      MallanAPI._fetch('/api/crm/clients/' + clientId, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }).then(function () {
        CRM.toast('Outreach date set', 'success');
        CRM.closeModal();
        _loadProspectWorkspace(clientId);
      }).catch(function () { CRM.toast('Failed to set date', 'error'); });
    });
  }

  function _sendOutreach(clientId, key) {
    CRM.toast('Sending outreach email...', 'info');
    MallanAPI._fetch('/api/crm/rentals/send-outreach', {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId, outreach_type: key }),
    }).then(function () {
      CRM.toast('Outreach email sent!', 'success');
    }).catch(function () { CRM.toast('Send failed -- try again', 'error'); });
  }

  // ─── Buyer Conversion Assessment ───────────────────────────────────
  function _renderBuyerAssessment(content, cl) {
    var score = Number(cl.buyer_potential || 0);
    var html = '<div class="ws-section">';
    html += '<div class="ws-section-title"><i class="fas fa-chart-line text-gold"></i>Buyer Conversion Assessment</div>';

    // Score display
    var scoreColor = score >= 70 ? '#059669' : score >= 40 ? '#F59E0B' : '#9CA3AF';
    var scoreLabel = score >= 70 ? 'HIGH -- Recommend promotion to Sales CRM' : score >= 40 ? 'MEDIUM -- Continue monitoring' : 'LOW -- Keep in rental pipeline';
    html += '<div class="flex items-center gap-4 mb-4 p-4 rounded-lg" style="background:' + scoreColor + '10;border:1px solid ' + scoreColor + '30">';
    html += '<div class="text-center" style="min-width:64px;"><div class="text-3xl font-bold" style="color:' + scoreColor + '">' + score + '</div><div class="text-[10px] font-bold text-gray-500">SCORE</div></div>';
    html += '<div style="flex:1"><div style="height:8px;background:#F3F4F6;border-radius:4px;"><div style="height:100%;width:' + Math.min(score, 100) + '%;background:' + scoreColor + ';border-radius:4px;transition:width .4s;"></div></div><p class="text-xs font-bold mt-1" style="color:' + scoreColor + '">' + scoreLabel + '</p></div>';
    html += '</div>';

    // Assessment factors
    html += '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">';

    var factors = [
      { label: 'Household Income', value: cl.household_income ? $(Number(cl.household_income)) : null, icon: 'fa-money-bill-wave' },
      { label: 'Credit Score Range', value: cl.credit_score_range, icon: 'fa-credit-card' },
      { label: 'Pre-Approved Amount', value: cl.pre_approved_amount ? $(Number(cl.pre_approved_amount)) : null, icon: 'fa-check-circle' },
      { label: 'Savings/Down Payment', value: cl.available_funds ? $(Number(cl.available_funds)) : null, icon: 'fa-piggy-bank' },
      { label: 'Time in NYC', value: cl.time_in_nyc, icon: 'fa-city' },
      { label: 'Engaged with Sales Content', value: cl.sales_content_engagement ? 'Yes' : 'No', icon: 'fa-chart-bar' },
    ];

    factors.forEach(function (f) {
      html += '<div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">' +
        '<i class="fas ' + f.icon + ' text-gray-400"></i>' +
        '<div>' +
          '<p class="text-xs font-semibold text-gray-700">' + E(f.label) + '</p>' +
          '<p class="text-sm font-medium text-gray-900">' + (f.value ? E(String(f.value)) : '<span class="text-gray-400">--</span>') + '</p>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';

    // Edit score + promote button
    html += '<div class="flex gap-2">';
    html += '<button class="btn btn-sm btn-outline" onclick="RentalsCRM._editBuyerScore(\'' + E(cl.id) + '\')"><i class="fas fa-edit mr-1"></i>Edit Score & Factors</button>';
    if (score >= 50) {
      html += '<button class="btn btn-sm btn-gold" onclick="RentalsCRM._promoteToBuyer(\'' + E(cl.id) + '\')"><i class="fas fa-arrow-up mr-1"></i>Promote to Active Buyer</button>';
    }
    html += '</div>';

    html += '</div>';
    content.innerHTML = html;
  }

  function _editBuyerScore(clientId) {
    MallanAPI._fetch('/api/crm/clients/' + clientId).then(function (data) {
      var cl = data.client || data;
      var formHtml = '<div class="space-y-3 p-4">' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Buyer Potential Score (0-100)</label><input id="bs_score" type="number" min="0" max="100" value="' + E(String(cl.buyer_potential || 0)) + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Household Income</label><input id="bs_income" type="number" value="' + E(String(cl.household_income || '')) + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Credit Score Range</label>' +
          '<select id="bs_credit" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
            '<option value="">Select...</option>' +
            '<option value="750+"' + (cl.credit_score_range === '750+' ? ' selected' : '') + '>750+</option>' +
            '<option value="700-749"' + (cl.credit_score_range === '700-749' ? ' selected' : '') + '>700-749</option>' +
            '<option value="650-699"' + (cl.credit_score_range === '650-699' ? ' selected' : '') + '>650-699</option>' +
            '<option value="<650"' + (cl.credit_score_range === '<650' ? ' selected' : '') + '>&lt;650</option>' +
          '</select></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Savings / Down Payment</label><input id="bs_funds" type="number" value="' + E(String(cl.available_funds || '')) + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
      '</div>';

      CRM.openModal('Edit Buyer Assessment', formHtml, function () {
        var payload = {
          buyer_potential: Number(_val('bs_score')) || 0,
          household_income: _val('bs_income') ? Number(_val('bs_income')) : null,
          credit_score_range: _val('bs_credit') || null,
          available_funds: _val('bs_funds') ? Number(_val('bs_funds')) : null,
        };
        MallanAPI._fetch('/api/crm/clients/' + clientId, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }).then(function () {
          CRM.toast('Assessment updated', 'success');
          CRM.closeModal();
          _loadProspectWorkspace(clientId);
        }).catch(function () { CRM.toast('Save failed', 'error'); });
      });
    });
  }

  // ─── Dual Drip Status Tab ──────────────────────────────────────────
  function _renderDripStatus(content, cl) {
    var html = '<div class="ws-section">';
    html += '<div class="ws-section-title"><i class="fas fa-tint text-gold"></i>Dual Drip Status</div>';

    // Rental drip
    html += '<div class="p-4 border border-gray-200 rounded-lg mb-3">';
    html += '<div class="flex items-center justify-between mb-2">';
    html += '<div class="flex items-center gap-2"><i class="fas fa-home text-blue-500"></i><span class="text-sm font-bold text-gray-900">Rental Listing Drip</span></div>';
    html += _toggleSwitch(!!cl.rental_drip_on, 'RentalsCRM._toggleClientDrip(\'' + E(cl.id) + '\',\'rental_drip_on\',' + !cl.rental_drip_on + ')');
    html += '</div>';
    html += '<div class="grid grid-cols-3 gap-3 text-xs">';
    html += '<div><span class="text-gray-500">Tier</span><p class="font-bold">' + E(cl.rental_drip_status || 'paused') + '</p></div>';
    html += '<div><span class="text-gray-500">Last Sent</span><p class="font-bold">' + (cl.last_rental_send ? Utils.formatTimeAgo(cl.last_rental_send) : 'Never') + '</p></div>';
    html += '<div><span class="text-gray-500">Listings Sent</span><p class="font-bold">' + String(cl.rental_listings_sent || 0) + '</p></div>';
    html += '</div></div>';

    // Sales drip (only if buyer potential > 0)
    var buyerScore = Number(cl.buyer_potential || 0);
    html += '<div class="p-4 border border-gray-200 rounded-lg mb-3' + (buyerScore === 0 ? ' opacity-50' : '') + '">';
    html += '<div class="flex items-center justify-between mb-2">';
    html += '<div class="flex items-center gap-2"><i class="fas fa-chart-line text-green-500"></i><span class="text-sm font-bold text-gray-900">Sales Content Drip</span>';
    if (buyerScore === 0) html += ' <span class="text-[10px] text-gray-400">(buyer score = 0)</span>';
    html += '</div>';
    html += _toggleSwitch(!!cl.sales_drip_on, buyerScore > 0 ? 'RentalsCRM._toggleClientDrip(\'' + E(cl.id) + '\',\'sales_drip_on\',' + !cl.sales_drip_on + ')' : '');
    html += '</div>';
    html += '<div class="grid grid-cols-3 gap-3 text-xs">';
    html += '<div><span class="text-gray-500">Tier</span><p class="font-bold">' + E(cl.sales_drip_status || 'paused') + '</p></div>';
    html += '<div><span class="text-gray-500">Last Sent</span><p class="font-bold">' + (cl.last_sales_send ? Utils.formatTimeAgo(cl.last_sales_send) : 'Never') + '</p></div>';
    html += '<div><span class="text-gray-500">Buyer Score</span><p class="font-bold">' + buyerScore + '</p></div>';
    html += '</div></div>';

    html += '</div>';
    content.innerHTML = html;
  }

  function _toggleClientDrip(clientId, field, value) {
    var payload = {};
    payload[field] = value;
    MallanAPI._fetch('/api/crm/clients/' + clientId, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }).then(function () {
      CRM.toast(value ? 'Drip activated' : 'Drip paused', 'success');
      _loadProspectWorkspace(clientId);
    }).catch(function () { CRM.toast('Toggle failed', 'error'); });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 4: CURRENT TENANTS
  // ═══════════════════════════════════════════════════════════════════════

  function currentTenants() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _subnav('tenants') + UI.loading();

    MallanAPI._fetch('/api/crm/rentals/tenants').then(function (data) {
      _state.tenants.data = (data.tenants || data.clients || []).map(function (t) { return ClientNormalizer.normalize(t); });
      _renderTenants(c);
    }).catch(function () {
      c.innerHTML = _subnav('tenants') + UI.emptyState('fa-user-check', 'Unable to load tenants');
    });
  }

  function _renderTenants(c) {
    var st = _state.tenants;
    var rows = ActivityTable.filterRows(st.data, st.search);
    if (st.filter.renewal) {
      rows = rows.filter(function (r) { return (r.renewal_status || 'pending').toLowerCase() === st.filter.renewal; });
    }
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    // KPIs
    var totalTenants = st.data.length;
    var renewalsPending = 0, notRenewing = 0, buyerPotentialCount = 0, leases90 = 0;
    st.data.forEach(function (r) {
      var rs = (r.renewal_status || 'pending').toLowerCase();
      if (rs === 'pending') renewalsPending++;
      if (rs === 'not_renewing') notRenewing++;
      if (Number(r.buyer_potential || 0) >= 50) buyerPotentialCount++;
      if (r.lease_end_date) {
        var diff = Math.floor((new Date(r.lease_end_date).getTime() - Date.now()) / 86400000);
        if (diff > 0 && diff <= 90) leases90++;
      }
    });

    var html = _subnav('tenants');

    html += _kpi([
      { icon: 'fa-user-check', value: totalTenants, label: 'Total Tenants', color: '#6366F1' },
      { icon: 'fa-clock', value: renewalsPending, label: 'Renewals Pending', color: '#F59E0B' },
      { icon: 'fa-times-circle', value: notRenewing, label: 'Not Renewing', color: '#DC2626' },
      { icon: 'fa-arrow-up', value: buyerPotentialCount, label: 'Buyer Potential', color: '#059669' },
      { icon: 'fa-calendar-times', value: leases90, label: 'Ending <90d', color: '#D97706' },
    ]);

    html += FilterBar.render({
      id: 'tenants',
      placeholder: 'Search tenants...',
      onSearch: 'RentalsCRM._searchTenants',
      filters: [
        { key: 'renewal', label: 'Renewal Status', options: [
          { value: 'renewing', label: 'Renewing' }, { value: 'not_renewing', label: 'Not Renewing' },
          { value: 'pending', label: 'Pending' }, { value: 'month_to_month', label: 'Month-to-Month' }
        ]},
      ],
      onFilter: 'RentalsCRM._filterTenants',
    });

    html += ActivityTable.render({
      id: 'tenants_table',
      columns: [
        { key: '_avatar', label: '', width: '44px', render: function (r) {
          return UI.avatar(r.name, 32);
        }},
        { key: 'name', label: 'Tenant', render: function (r) {
          return '<span class="font-semibold text-gray-900">' + E(r.name || '') + '</span>';
        }},
        { key: 'property_address', label: 'Unit / Address', render: function (r) {
          var addr = E(r.property_address || '-');
          if (r.unit_number) addr += ' <span class="text-gray-400">#' + E(r.unit_number) + '</span>';
          return '<span class="text-sm">' + addr + '</span>';
        }},
        { key: 'lease_start_date', label: 'Lease Start', render: function (r) {
          return r.lease_start_date ? '<span class="text-sm text-gray-600">' + D(r.lease_start_date) + '</span>' : '<span class="text-gray-400">-</span>';
        }},
        { key: 'lease_end_date', label: 'Lease End', render: function (r) {
          return r.lease_end_date ? '<span class="text-sm text-gray-600">' + D(r.lease_end_date) + '</span>' : '<span class="text-gray-400">-</span>';
        }},
        { key: 'renewal_status', label: 'Renewal', render: function (r) {
          return _renewalBadge(r.renewal_status);
        }},
        { key: 'buyer_potential', label: 'Buyer Potential', render: function (r) {
          return _scoreBar(r.buyer_potential);
        }},
        { key: '_outreach', label: '90/60/30', render: function (r) {
          return _outreachDatesBadges(r);
        }},
        { key: 'last_email_opened_at', label: 'Last Email', render: function (r) {
          return r.last_email_opened_at
            ? '<span class="text-xs text-gray-600">' + Utils.formatTimeAgo(r.last_email_opened_at) + '</span>'
            : '<span class="text-gray-400">-</span>';
        }},
        { key: 'last_response_at', label: 'Last Response', render: function (r) {
          return r.last_response_at
            ? '<span class="text-xs text-gray-600">' + Utils.formatTimeAgo(r.last_response_at) + '</span>'
            : '<span class="text-gray-400">-</span>';
        }},
        { key: '_actions', label: '', width: '110px', render: function (r) {
          return '<div style="display:flex;gap:4px;">' +
            '<button style="width:28px;height:28px;border-radius:6px;border:1px solid #E5E7EB;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#6B7280;font-size:12px;" title="Mark Not Renewing" ' +
              'onclick="event.stopPropagation();RentalsCRM._markNotRenewing(\'' + E(r.id) + '\')" ' +
              'onmouseover="this.style.borderColor=\'#DC2626\';this.style.color=\'#DC2626\'" onmouseout="this.style.borderColor=\'#E5E7EB\';this.style.color=\'#6B7280\'">' +
              '<i class="fas fa-times"></i></button>' +
            '<button style="width:28px;height:28px;border-radius:6px;border:1px solid #E5E7EB;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#6B7280;font-size:12px;" title="Initiate Renewal" ' +
              'onclick="event.stopPropagation();RentalsCRM._initiateRenewal(\'' + E(r.id) + '\')" ' +
              'onmouseover="this.style.borderColor=\'#059669\';this.style.color=\'#059669\'" onmouseout="this.style.borderColor=\'#E5E7EB\';this.style.color=\'#6B7280\'">' +
              '<i class="fas fa-redo"></i></button>' +
            (Number(r.buyer_potential || 0) >= 50
              ? '<button style="width:28px;height:28px;border-radius:6px;border:1px solid #E5E7EB;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#6B7280;font-size:12px;" title="Promote to Buyer" ' +
                  'onclick="event.stopPropagation();RentalsCRM._promoteToBuyer(\'' + E(r.id) + '\')" ' +
                  'onmouseover="this.style.borderColor=\'#B8860B\';this.style.color=\'#B8860B\'" onmouseout="this.style.borderColor=\'#E5E7EB\';this.style.color=\'#6B7280\'">' +
                  '<i class="fas fa-exchange-alt"></i></button>'
              : '') +
          '</div>';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'RentalsCRM._sortTenants',
      onRowClick: 'RentalsCRM._openTenantWorkspace',
      page: st.page,
      pageSize: 25,
      onPage: 'RentalsCRM._pageTenants',
      emptyIcon: 'fa-user-check',
      emptyText: 'No current tenants with active leases',
    });

    c.innerHTML = html;
  }

  function _searchTenants(q) { _state.tenants.search = q; _state.tenants.page = 1; _renderTenants(CRM.getContent()); }
  function _filterTenants(key, val) {
    if (key) _state.tenants.filter[key] = val;
    _state.tenants.page = 1;
    _renderTenants(CRM.getContent());
  }
  function _sortTenants(key) {
    var st = _state.tenants;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderTenants(CRM.getContent());
  }
  function _pageTenants(p) { _state.tenants.page = p; _renderTenants(CRM.getContent()); }

  function _markNotRenewing(id) {
    if (!confirm('Mark this tenant as NOT renewing? This will calculate outreach dates.')) return;
    var now = new Date();
    var d30 = new Date(now.getTime() + 30 * 86400000).toISOString().substring(0, 10);
    var d60 = new Date(now.getTime() + 60 * 86400000).toISOString().substring(0, 10);
    var d90 = new Date(now.getTime() + 90 * 86400000).toISOString().substring(0, 10);
    var d6mo = new Date(now.getTime() + 180 * 86400000).toISOString().substring(0, 10);

    MallanAPI._fetch('/api/crm/clients/' + id, {
      method: 'PATCH',
      body: JSON.stringify({
        renewal_status: 'not_renewing',
        non_renewal_date: now.toISOString(),
        outreach_30d_date: d30,
        outreach_60d_date: d60,
        outreach_90d_date: d90,
        outreach_6mo_date: d6mo,
      }),
    }).then(function () {
      CRM.toast('Marked as not renewing. Outreach dates calculated.', 'success');
      currentTenants();
    }).catch(function () { CRM.toast('Update failed', 'error'); });
  }

  function _initiateRenewal(id) {
    MallanAPI._fetch('/api/crm/clients/' + id, {
      method: 'PATCH',
      body: JSON.stringify({ renewal_status: 'renewing' }),
    }).then(function () {
      CRM.toast('Renewal initiated', 'success');
      currentTenants();
    }).catch(function () { CRM.toast('Update failed', 'error'); });
  }

  // ─── Tenant Workspace ─────────────────────────────────────────────
  function _openTenantWorkspace(id) {
    _state.ws.tab = 'overview';
    _loadTenantWorkspace(id);
  }

  function _loadTenantWorkspace(id) {
    var c = CRM.getContent();
    c.innerHTML = UI.loading();

    Promise.all([
      MallanAPI._fetch('/api/crm/clients/' + id),
      MallanAPI._fetch('/api/crm/showing-history?lead_id=' + id).catch(function () { return { showings: [] }; }),
    ]).then(function (results) {
      var cl = results[0].client || results[0];
      var showings = results[1].showings || [];
      _state.ws.client = cl;
      _state.ws.showingHistory = showings;
      _renderTenantWorkspace(c, cl, showings);
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-user-check', 'Unable to load tenant');
    });
  }

  function _renderTenantWorkspace(c, cl, showings) {
    var activeTab = _state.ws.tab;
    var tabs = [
      { id: 'overview', label: 'Overview', icon: 'fa-th-large' },
      { id: 'lease', label: 'Lease', icon: 'fa-file-contract' },
      { id: 'showings', label: 'Showing History', icon: 'fa-calendar-alt' },
      { id: 'outreach', label: 'Outreach', icon: 'fa-paper-plane' },
      { id: 'activity', label: 'Activity', icon: 'fa-stream' },
    ];

    var buyerScore = Number(cl.buyer_potential || 0);
    var notRenewing = (cl.renewal_status || '').toLowerCase() === 'not_renewing';
    var headerExtra = '';
    if (notRenewing) {
      headerExtra += '<span class="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full font-bold mr-2"><i class="fas fa-exclamation-circle mr-1"></i>Not Renewing</span>';
    }
    if (buyerScore >= 50) {
      headerExtra += '<button class="btn btn-sm btn-gold" onclick="RentalsCRM._promoteToBuyer(\'' + E(cl.id) + '\')"><i class="fas fa-arrow-up mr-1"></i>Promote to Buyer</button>';
    }

    var shell = WorkspaceShell.render({
      backRoute: '/rentals/tenants',
      backLabel: 'Current Tenants',
      client: cl,
      avatarName: cl.name || ((cl.first_name || '') + ' ' + (cl.last_name || '')).trim(),
      displayName: cl.name || ((cl.first_name || '') + ' ' + (cl.last_name || '')).trim(),
      role: 'tenant',
      stage: cl.renewal_status || 'active',
      tabs: tabs,
      activeTab: activeTab,
      onTab: 'RentalsCRM._tenantTab',
      actions: [
        { label: 'Mark Not Renewing', icon: 'fa-times', onclick: 'RentalsCRM._markNotRenewing(\'' + E(cl.id) + '\')', cls: 'btn btn-sm btn-outline text-red-500' },
        { label: 'Edit', icon: 'fa-edit', onclick: 'RentalsCRM._editClient(\'' + E(cl.id) + '\')' },
        { label: 'Delete', icon: 'fa-trash-alt', onclick: 'RentalsCRM._deleteClient(\'' + E(cl.id) + '\',\'/rentals/tenants\')', cls: 'btn btn-sm btn-outline text-red-500' },
      ],
      headerExtra: headerExtra,
    });

    c.innerHTML = shell;
    var content = document.getElementById('workspace-content');
    if (!content) return;

    if (activeTab === 'overview') {
      content.innerHTML =
        WorkspaceShell.renderContactCard(cl) +
        _tenantPropertyInfo(cl) +
        _tenantRenewalCard(cl);
    } else if (activeTab === 'lease') {
      _renderLeaseTimeline(content, cl);
    } else if (activeTab === 'showings') {
      _renderShowingHistory(content, cl, showings);
    } else if (activeTab === 'outreach') {
      _renderOutreach(content, cl);
    } else if (activeTab === 'activity') {
      _loadClientActivity(content, cl.id);
    }
  }

  function _tenantTab(tabId) {
    _state.ws.tab = tabId;
    if (_state.ws.client) {
      _renderTenantWorkspace(CRM.getContent(), _state.ws.client, _state.ws.showingHistory);
    }
  }

  function _tenantPropertyInfo(cl) {
    var html = '<div class="ws-section">';
    html += '<div class="ws-section-title"><i class="fas fa-home text-gold"></i>Unit Details</div>';
    html += '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">';
    html += _wsField('Property Address', cl.property_address);
    html += _wsField('Unit Number', cl.unit_number);
    html += _wsField('Landlord', cl.landlord_name || cl.owner_name);
    html += _wsField('Rent/mo', cl.list_price ? $(Number(cl.list_price)) : null);
    html += _wsField('Lease Start', cl.lease_start_date ? D(cl.lease_start_date) : null);
    html += _wsField('Lease End', cl.lease_end_date ? D(cl.lease_end_date) : null);
    html += '</div></div>';
    return html;
  }

  function _tenantRenewalCard(cl) {
    var html = '<div class="ws-section">';
    html += '<div class="flex items-center justify-between mb-3">';
    html += '<div class="ws-section-title" style="margin-bottom:0"><i class="fas fa-redo text-gold"></i>Renewal Status</div>';
    html += '<select class="text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" onchange="RentalsCRM._updateRenewalStatus(\'' + E(cl.id) + '\',this.value)">' +
      '<option value="pending"' + ((cl.renewal_status || 'pending') === 'pending' ? ' selected' : '') + '>Pending</option>' +
      '<option value="renewing"' + (cl.renewal_status === 'renewing' ? ' selected' : '') + '>Renewing</option>' +
      '<option value="not_renewing"' + (cl.renewal_status === 'not_renewing' ? ' selected' : '') + '>Not Renewing</option>' +
      '<option value="month_to_month"' + (cl.renewal_status === 'month_to_month' ? ' selected' : '') + '>Month-to-Month</option>' +
    '</select>';
    html += '</div>';

    if ((cl.renewal_status || '').toLowerCase() === 'not_renewing') {
      html += '<div class="p-3 bg-amber-50 border border-amber-200 rounded-lg">';
      html += '<p class="text-sm font-bold text-amber-700"><i class="fas fa-info-circle mr-1"></i>Entering Viewed/Did-Not-Rent Flow</p>';
      html += '<p class="text-xs text-amber-600 mt-1">Outreach dates have been calculated from non-renewal date. This tenant will appear in the Viewed/Did-Not-Rent tab for continued engagement.</p>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function _updateRenewalStatus(clientId, status) {
    var payload = { renewal_status: status };
    if (status === 'not_renewing') {
      var now = new Date();
      payload.non_renewal_date = now.toISOString();
      payload.outreach_30d_date = new Date(now.getTime() + 30 * 86400000).toISOString().substring(0, 10);
      payload.outreach_60d_date = new Date(now.getTime() + 60 * 86400000).toISOString().substring(0, 10);
      payload.outreach_90d_date = new Date(now.getTime() + 90 * 86400000).toISOString().substring(0, 10);
      payload.outreach_6mo_date = new Date(now.getTime() + 180 * 86400000).toISOString().substring(0, 10);
    }
    MallanAPI._fetch('/api/crm/clients/' + clientId, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }).then(function () {
      CRM.toast('Renewal status updated', 'success');
      _loadTenantWorkspace(clientId);
    }).catch(function () { CRM.toast('Update failed', 'error'); });
  }

  function _renderLeaseTimeline(content, cl) {
    var html = '<div class="ws-section">';
    html += '<div class="ws-section-title"><i class="fas fa-file-contract text-gold"></i>Lease Timeline</div>';

    var start = cl.lease_start_date ? new Date(cl.lease_start_date).getTime() : null;
    var end = cl.lease_end_date ? new Date(cl.lease_end_date).getTime() : null;
    var now = Date.now();

    if (start && end && end > start) {
      var totalDuration = end - start;
      var elapsed = Math.max(0, Math.min(now - start, totalDuration));
      var pct = Math.round((elapsed / totalDuration) * 100);
      var daysLeft = Math.max(0, Math.floor((end - now) / 86400000));
      var totalDays = Math.floor(totalDuration / 86400000);
      var elapsedDays = Math.floor(elapsed / 86400000);

      // Color based on remaining time
      var barColor = daysLeft <= 30 ? '#DC2626' : daysLeft <= 90 ? '#F59E0B' : '#059669';

      html += '<div class="lease-timeline">';
      html += '<div class="lease-timeline-fill" style="width:' + pct + '%;background:' + barColor + ';"></div>';
      // Now marker
      if (pct > 0 && pct < 100) {
        html += '<div class="lease-timeline-marker" style="left:' + pct + '%;"></div>';
        html += '<div class="lease-timeline-label" style="left:' + pct + '%;transform:translateX(-50%);">Today</div>';
      }
      html += '</div>';

      html += '<div class="flex justify-between text-xs text-gray-500 mt-8">';
      html += '<span>Start: ' + D(cl.lease_start_date) + '</span>';
      html += '<span class="font-bold" style="color:' + barColor + '">' + daysLeft + ' days left</span>';
      html += '<span>End: ' + D(cl.lease_end_date) + '</span>';
      html += '</div>';

      html += '<div class="grid grid-cols-3 gap-4 mt-4">';
      html += '<div class="text-center p-3 bg-gray-50 rounded-lg"><div class="text-xl font-bold text-gray-900">' + totalDays + '</div><div class="text-[10px] text-gray-500 font-bold uppercase">Total Days</div></div>';
      html += '<div class="text-center p-3 bg-gray-50 rounded-lg"><div class="text-xl font-bold text-gray-900">' + elapsedDays + '</div><div class="text-[10px] text-gray-500 font-bold uppercase">Elapsed</div></div>';
      html += '<div class="text-center p-3 rounded-lg" style="background:' + barColor + '10"><div class="text-xl font-bold" style="color:' + barColor + '">' + daysLeft + '</div><div class="text-[10px] font-bold uppercase" style="color:' + barColor + '">Remaining</div></div>';
      html += '</div>';

      // Renewal date marker
      if (cl.renewal_date) {
        var renewalTime = new Date(cl.renewal_date).getTime();
        var renewalDays = Math.floor((renewalTime - now) / 86400000);
        html += '<div class="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm"><i class="fas fa-calendar-check text-blue-500 mr-1"></i>Renewal decision due: ' + D(cl.renewal_date) + ' (' + renewalDays + ' days)</div>';
      }
    } else {
      html += '<p class="text-sm text-gray-500 text-center py-8">No lease dates on file. Edit the tenant record to add lease start and end dates.</p>';
    }

    html += '</div>';

    // Comments from original search
    if (cl.comments || cl.notes || cl.search_notes) {
      html += '<div class="ws-section">';
      html += '<div class="ws-section-title"><i class="fas fa-comment text-gold"></i>Comments from Original Search</div>';
      html += '<p class="text-sm text-gray-700">' + E(cl.comments || cl.notes || cl.search_notes || '') + '</p>';
      html += '</div>';
    }

    content.innerHTML = html;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 5: RENTALS MARKETING
  // ═══════════════════════════════════════════════════════════════════════

  function rentalsMarketing() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _subnav('marketing') + UI.loading();

    MallanAPI._fetch('/api/crm/campaigns?crm_type=rentals').then(function (data) {
      _state.marketing.data = data.campaigns || [];
      _renderMarketing(c);
    }).catch(function () {
      c.innerHTML = _subnav('marketing') + UI.emptyState('fa-bullhorn', 'Unable to load campaigns');
    });
  }

  function _renderMarketing(c) {
    var st = _state.marketing;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    // KPIs
    var totalCampaigns = st.data.length;
    var activeCampaigns = st.data.filter(function (r) { return r.status === 'sent' || r.status === 'recurring' || r.status === 'scheduled'; }).length;
    var draftCampaigns = st.data.filter(function (r) { return r.status === 'draft'; }).length;
    var openRates = st.data.filter(function (r) { return r.sent_count > 0; });
    var avgOpenRate = openRates.length > 0
      ? Math.round(openRates.reduce(function (s, r) { return s + ((r.open_count || 0) / r.sent_count) * 100; }, 0) / openRates.length)
      : 0;

    var html = _subnav('marketing');

    html += _kpi([
      { icon: 'fa-bullhorn', value: totalCampaigns, label: 'Total Campaigns', color: '#6366F1' },
      { icon: 'fa-play-circle', value: activeCampaigns, label: 'Active', color: '#059669' },
      { icon: 'fa-pencil-alt', value: draftCampaigns, label: 'Draft', color: '#9CA3AF' },
      { icon: 'fa-envelope-open', value: avgOpenRate + '%', label: 'Avg Open Rate', color: '#F59E0B' },
    ]);

    html += FilterBar.render({
      id: 'rmarketing',
      placeholder: 'Search campaigns...',
      onSearch: 'RentalsCRM._searchMarketing',
      quickActions: [
        { label: 'New Campaign', icon: 'fa-plus', onclick: 'RentalsCRM._newCampaign()' },
      ],
    });

    html += ActivityTable.render({
      id: 'rmarketing_table',
      columns: [
        { key: 'name', label: 'Campaign', render: function (r) {
          return '<span class="font-semibold text-gray-900">' + E(r.name || '') + '</span>';
        }},
        { key: 'audience_type', label: 'Audience', render: function (r) {
          return '<span class="text-sm text-gray-600">' + E(r.audience_type || '-') + '</span>';
        }},
        { key: 'campaign_type', label: 'Type', render: function (r) {
          return '<span class="text-sm text-gray-600">' + E((r.campaign_type || '').replace(/_/g, ' ')) + '</span>';
        }},
        { key: 'status', label: 'Status', render: function (r) {
          var colors = {
            draft: 'bg-gray-100 text-gray-600',
            scheduled: 'bg-blue-100 text-blue-700',
            sent: 'bg-green-100 text-green-700',
            recurring: 'bg-purple-100 text-purple-700'
          };
          return '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold ' + (colors[r.status] || 'bg-gray-100 text-gray-600') + '">' + E(r.status || 'draft') + '</span>';
        }},
        { key: 'sent_count', label: 'Sent', render: function (r) {
          return '<span class="text-sm font-medium text-gray-700">' + String(r.sent_count || 0) + '</span>';
        }},
        { key: 'open_rate', label: 'Open %', render: function (r) {
          var rate = r.sent_count > 0 ? Math.round((r.open_count / r.sent_count) * 100) : 0;
          var color = rate >= 30 ? '#059669' : rate >= 15 ? '#F59E0B' : '#DC2626';
          return '<div style="display:flex;align-items:center;gap:6px;">' +
            '<div style="flex:1;max-width:60px;height:4px;background:#f3f4f6;border-radius:2px;overflow:hidden;">' +
              '<div style="width:' + rate + '%;height:100%;background:' + color + ';border-radius:2px;"></div>' +
            '</div>' +
            '<span style="font-size:11px;font-weight:700;color:' + color + '">' + rate + '%</span>' +
          '</div>';
        }},
        { key: 'last_run_at', label: 'Last Run', render: function (r) {
          return r.last_run_at
            ? '<span class="text-sm text-gray-600">' + Utils.formatTimeAgo(r.last_run_at) + '</span>'
            : '<span class="text-gray-400">-</span>';
        }},
        { key: '_actions', label: '', width: '80px', render: function (r) {
          return '<div style="display:flex;gap:4px;">' +
            '<button style="width:28px;height:28px;border-radius:6px;border:1px solid #E5E7EB;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#6B7280;font-size:12px;" title="Edit" ' +
              'onclick="event.stopPropagation();RentalsCRM._editCampaign(\'' + E(r.id) + '\')" ' +
              'onmouseover="this.style.borderColor=\'#B8860B\';this.style.color=\'#B8860B\'" onmouseout="this.style.borderColor=\'#E5E7EB\';this.style.color=\'#6B7280\'">' +
              '<i class="fas fa-edit"></i></button>' +
            '<button style="width:28px;height:28px;border-radius:6px;border:1px solid #E5E7EB;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#6B7280;font-size:12px;" title="Delete" ' +
              'onclick="event.stopPropagation();RentalsCRM._deleteCampaign(\'' + E(r.id) + '\')" ' +
              'onmouseover="this.style.borderColor=\'#DC2626\';this.style.color=\'#DC2626\'" onmouseout="this.style.borderColor=\'#E5E7EB\';this.style.color=\'#6B7280\'">' +
              '<i class="fas fa-trash-alt"></i></button>' +
          '</div>';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'RentalsCRM._sortMarketing',
      page: st.page,
      pageSize: 25,
      onPage: 'RentalsCRM._pageMarketing',
      emptyIcon: 'fa-bullhorn',
      emptyText: 'No campaigns yet',
    });

    c.innerHTML = html;
  }

  function _searchMarketing(q) { _state.marketing.search = q; _state.marketing.page = 1; _renderMarketing(CRM.getContent()); }
  function _sortMarketing(key) {
    var st = _state.marketing;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderMarketing(CRM.getContent());
  }
  function _pageMarketing(p) { _state.marketing.page = p; _renderMarketing(CRM.getContent()); }

  function _newCampaign() {
    var types = [
      'rental_listing_alerts', 'renewal_reminders', 'relist_reminders',
      'viewed_reactivation', 'tenant_to_buyer', 'landlord_value_reports'
    ];
    var formHtml = '<div class="space-y-3 p-4">' +
      '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Campaign Name</label><input id="cmp_name" type="text" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" placeholder="Campaign name..."></div>' +
      '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Type</label>' +
        '<select id="cmp_type" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
          '<option value="">Select type...</option>';
    types.forEach(function (t) {
      formHtml += '<option value="' + E(t) + '">' + E(t.replace(/_/g, ' ')) + '</option>';
    });
    formHtml += '</select></div>' +
      '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Audience</label>' +
        '<select id="cmp_audience" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
          '<option value="">Select...</option><option value="landlords">Landlords</option><option value="prospects">Prospects (Viewed/Did Not Rent)</option><option value="tenants">Current Tenants</option><option value="all_rentals">All Rentals</option>' +
        '</select></div>' +
      '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Subject Line</label><input id="cmp_subject" type="text" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
    '</div>';

    CRM.openModal('New Rental Campaign', formHtml, function () {
      var name = _val('cmp_name');
      if (!name) { CRM.toast('Campaign name is required', 'error'); return; }
      MallanAPI._fetch('/api/crm/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: name,
          campaign_type: _val('cmp_type'),
          audience_type: _val('cmp_audience'),
          subject: _val('cmp_subject'),
          crm_type: 'rentals',
          status: 'draft',
        }),
      }).then(function () {
        CRM.toast('Campaign created', 'success');
        CRM.closeModal();
        rentalsMarketing();
      }).catch(function () { CRM.toast('Failed to create campaign', 'error'); });
    });
  }

  function _editCampaign(id) {
    var cmp = _state.marketing.data.find(function (r) { return String(r.id) === String(id); });
    if (!cmp) { CRM.toast('Campaign not found', 'error'); return; }

    var formHtml = '<div class="space-y-3 p-4">' +
      '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Campaign Name</label><input id="cmp_name" type="text" value="' + E(cmp.name || '') + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
      '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Status</label>' +
        '<select id="cmp_status" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
          '<option value="draft"' + (cmp.status === 'draft' ? ' selected' : '') + '>Draft</option>' +
          '<option value="scheduled"' + (cmp.status === 'scheduled' ? ' selected' : '') + '>Scheduled</option>' +
          '<option value="sent"' + (cmp.status === 'sent' ? ' selected' : '') + '>Sent</option>' +
          '<option value="recurring"' + (cmp.status === 'recurring' ? ' selected' : '') + '>Recurring</option>' +
        '</select></div>' +
      '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Subject Line</label><input id="cmp_subject" type="text" value="' + E(cmp.subject || '') + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
    '</div>';

    CRM.openModal('Edit Campaign', formHtml, function () {
      MallanAPI._fetch('/api/crm/campaigns/' + id, {
        method: 'PATCH',
        body: JSON.stringify({
          name: _val('cmp_name'),
          status: _val('cmp_status'),
          subject: _val('cmp_subject'),
        }),
      }).then(function () {
        CRM.toast('Campaign updated', 'success');
        CRM.closeModal();
        rentalsMarketing();
      }).catch(function () { CRM.toast('Update failed', 'error'); });
    });
  }

  function _deleteCampaign(id) {
    if (!confirm('Delete this campaign?')) return;
    MallanAPI._fetch('/api/crm/campaigns/' + id, { method: 'DELETE' }).then(function () {
      CRM.toast('Campaign deleted', 'success');
      _state.marketing.data = _state.marketing.data.filter(function (r) { return String(r.id) !== String(id); });
      _renderMarketing(CRM.getContent());
    }).catch(function () { CRM.toast('Delete failed', 'error'); });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 6: RENTALS ACTIVITY FEED
  // ═══════════════════════════════════════════════════════════════════════

  function rentalsActivity() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _subnav('activity') + UI.loading();

    MallanAPI._fetch('/api/crm/rentals/activity').then(function (data) {
      _state.activity.data = data.events || [];
      _renderActivity(c);
    }).catch(function () {
      c.innerHTML = _subnav('activity') + UI.emptyState('fa-stream', 'Unable to load activity');
    });
  }

  function _renderActivity(c) {
    var events = _state.activity.data;
    var filter = _state.activity.filter;
    if (filter !== 'all') {
      events = events.filter(function (e) { return e.client_type === filter; });
    }

    var html = _subnav('activity');

    // Filter pills
    html += '<div class="flex gap-1 mb-4 flex-wrap">';
    [
      { key: 'all', label: 'All' },
      { key: 'landlords', label: 'Landlords' },
      { key: 'viewed', label: 'Prospects' },
      { key: 'tenants', label: 'Current Tenants' },
      { key: 'listings', label: 'Listings' },
    ].forEach(function (f) {
      var active = filter === f.key;
      html += '<button class="px-3 py-1.5 text-xs font-bold rounded-lg transition-all ' +
        (active ? 'bg-gold text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gold') +
        '" onclick="RentalsCRM._filterActivity(\'' + f.key + '\')">' + f.label + '</button>';
    });
    html += '</div>';

    if (events.length === 0) {
      html += UI.emptyState('fa-stream', 'No activity yet');
    } else {
      var groups = _groupByDate(events);
      var groupOrder = ['Today', 'Yesterday', 'This Week', 'Earlier'];

      groupOrder.forEach(function (groupLabel) {
        var groupEvents = groups[groupLabel];
        if (!groupEvents || groupEvents.length === 0) return;

        html += '<div class="mb-6">';
        html += '<div class="flex items-center gap-2 mb-3">' +
          '<span class="text-xs font-bold text-gray-400 uppercase tracking-wider">' + groupLabel + '</span>' +
          '<div class="flex-1 h-px bg-gray-100"></div>' +
          '<span class="text-[10px] text-gray-400">' + groupEvents.length + ' events</span>' +
        '</div>';

        html += '<div class="space-y-2">';
        groupEvents.forEach(function (ev) {
          var icon = _activityIcon(ev.activity_type);
          html += '<div class="activity-card">' +
            UI.avatar(ev.client_name || ev.title || '', 32) +
            '<div class="flex-1 min-w-0">' +
              '<p class="text-sm font-medium text-gray-900">' + E(ev.title || '') + '</p>' +
              (ev.detail ? '<p class="text-xs text-gray-500 mt-0.5">' + E(ev.detail) + '</p>' : '') +
              (ev.client_name ? '<p class="text-[10px] text-gray-400 mt-1"><i class="fas fa-user mr-1"></i>' + E(ev.client_name) + '</p>' : '') +
            '</div>' +
            '<div class="flex flex-col items-end gap-1 flex-shrink-0">' +
              '<span class="text-[10px] text-gray-400">' + Utils.formatTimeAgo(ev.created_at) + '</span>' +
              '<div class="w-6 h-6 rounded-full flex items-center justify-center" style="background:' + icon.bg + '">' +
                '<i class="fas ' + icon.icon + '" style="font-size:9px;color:' + icon.color + '"></i>' +
              '</div>' +
            '</div>' +
          '</div>';
        });
        html += '</div></div>';
      });
    }

    c.innerHTML = html;
  }

  function _filterActivity(f) { _state.activity.filter = f; _renderActivity(CRM.getContent()); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 7: RENTALS AUTOMATION
  // ═══════════════════════════════════════════════════════════════════════

  function rentalsAutomation() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _subnav('automation') + UI.loading();

    MallanAPI._fetch('/api/crm/automation/status?crm_type=rentals').then(function (data) {
      _state.automation.data = data.contacts || [];
      _renderAutomation(c);
    }).catch(function () {
      c.innerHTML = _subnav('automation') + UI.emptyState('fa-robot', 'Unable to load automation status');
    });
  }

  function _renderAutomation(c) {
    var st = _state.automation;
    var rows = ActivityTable.filterRows(st.data, st.search);
    if (st.filter.drip) {
      rows = rows.filter(function (r) {
        return (r.rental_drip_status || 'paused').toLowerCase() === st.filter.drip;
      });
    }
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    // KPIs
    var totalContacts = st.data.length;
    var rentalDripsActive = st.data.filter(function (r) { return r.rental_drip_on; }).length;
    var salesDripsActive = st.data.filter(function (r) { return r.sales_drip_on; }).length;
    var renewalDripsActive = st.data.filter(function (r) { return r.renewal_drip_on; }).length;

    var html = _subnav('automation');

    html += _kpi([
      { icon: 'fa-users', value: totalContacts, label: 'Total Contacts', color: '#6366F1' },
      { icon: 'fa-paper-plane', value: rentalDripsActive, label: 'Rental Drips', color: '#059669' },
      { icon: 'fa-chart-line', value: salesDripsActive, label: 'Sales Drips', color: '#B8860B' },
      { icon: 'fa-redo', value: renewalDripsActive, label: 'Renewal Drips', color: '#3B82F6' },
    ]);

    html += FilterBar.render({
      id: 'rautomation',
      placeholder: 'Search contacts...',
      onSearch: 'RentalsCRM._searchAutomation',
      filters: [
        { key: 'drip', label: 'Tier', options: [
          { value: 'active', label: 'Active' }, { value: 'monthly', label: 'Monthly' },
          { value: 'quarterly', label: 'Quarterly' }, { value: 'biannual', label: 'Bi-Annual' }, { value: 'paused', label: 'Paused' }
        ]},
      ],
      onFilter: 'RentalsCRM._filterAutomation',
    });

    html += ActivityTable.render({
      id: 'rautomation_table',
      columns: [
        { key: '_avatar', label: '', width: '44px', render: function (r) {
          return UI.avatar(r.name, 32);
        }},
        { key: 'name', label: 'Contact', render: function (r) {
          return '<span class="font-semibold text-gray-900">' + E(r.name || '') + '</span>';
        }},
        { key: 'type', label: 'Type', render: function (r) {
          var t = (r.type || 'unknown').toLowerCase();
          var colors = {
            landlord: 'bg-indigo-100 text-indigo-700',
            renter: 'bg-emerald-100 text-emerald-700',
            tenant: 'bg-emerald-100 text-emerald-700',
            prospect: 'bg-violet-100 text-violet-700'
          };
          return '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold ' + (colors[t] || 'bg-gray-100 text-gray-600') + '">' + E(t) + '</span>';
        }},
        { key: 'rental_drip_on', label: 'Rental Drip', render: function (r) {
          return _toggleSwitch(!!r.rental_drip_on, 'RentalsCRM._toggleDrip(\'' + E(r.id) + '\',\'rental_drip_on\',' + !r.rental_drip_on + ')');
        }},
        { key: 'sales_drip_on', label: 'Sales Drip', render: function (r) {
          return _toggleSwitch(!!r.sales_drip_on, 'RentalsCRM._toggleDrip(\'' + E(r.id) + '\',\'sales_drip_on\',' + !r.sales_drip_on + ')');
        }},
        { key: 'renewal_drip_on', label: 'Renewal Drip', render: function (r) {
          return _toggleSwitch(!!r.renewal_drip_on, 'RentalsCRM._toggleDrip(\'' + E(r.id) + '\',\'renewal_drip_on\',' + !r.renewal_drip_on + ')');
        }},
        { key: 'last_sent_at', label: 'Last Sent', render: function (r) {
          return r.last_sent_at
            ? '<span class="text-xs text-gray-600">' + Utils.formatTimeAgo(r.last_sent_at) + '</span>'
            : '<span class="text-gray-400">-</span>';
        }},
        { key: 'last_listing_viewed_at', label: 'Last Viewed', render: function (r) {
          return r.last_listing_viewed_at
            ? '<span class="text-xs text-gray-600">' + Utils.formatTimeAgo(r.last_listing_viewed_at) + '</span>'
            : '<span class="text-gray-400">-</span>';
        }},
        { key: 'last_response_at', label: 'Last Response', render: function (r) {
          return r.last_response_at
            ? '<span class="text-xs text-gray-600">' + Utils.formatTimeAgo(r.last_response_at) + '</span>'
            : '<span class="text-gray-400">-</span>';
        }},
        { key: 'next_send_at', label: 'Next Send', render: function (r) {
          return r.next_send_at
            ? '<span class="text-xs text-gray-600">' + D(r.next_send_at) + '</span>'
            : '<span class="text-gray-400">-</span>';
        }},
        { key: 'rental_drip_status', label: 'Tier', render: function (r) {
          var s = (r.rental_drip_status || 'paused').toLowerCase();
          var colors = {
            active: 'bg-green-100 text-green-700',
            monthly: 'bg-blue-100 text-blue-700',
            quarterly: 'bg-yellow-100 text-yellow-700',
            biannual: 'bg-gray-100 text-gray-600',
            paused: 'bg-red-100 text-red-600'
          };
          html = '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold ' + (colors[s] || 'bg-gray-100 text-gray-600') + '">' + E(s) + '</span>';
          return html;
        }},
        { key: '_actions', label: '', width: '44px', render: function (r) {
          return '<button style="width:28px;height:28px;border-radius:6px;border:1px solid #E5E7EB;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#6B7280;font-size:12px;" title="Override Tier" ' +
            'onclick="event.stopPropagation();RentalsCRM._overrideTier(\'' + E(r.id) + '\')" ' +
            'onmouseover="this.style.borderColor=\'#B8860B\';this.style.color=\'#B8860B\'" onmouseout="this.style.borderColor=\'#E5E7EB\';this.style.color=\'#6B7280\'">' +
            '<i class="fas fa-sliders-h"></i></button>';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'RentalsCRM._sortAutomation',
      onRowClick: 'RentalsCRM._openClient',
      page: st.page,
      pageSize: 25,
      onPage: 'RentalsCRM._pageAutomation',
      emptyIcon: 'fa-robot',
      emptyText: 'No contacts with automation data',
    });

    c.innerHTML = html;
  }

  function _searchAutomation(q) { _state.automation.search = q; _state.automation.page = 1; _renderAutomation(CRM.getContent()); }
  function _filterAutomation(key, val) {
    if (key) _state.automation.filter[key] = val;
    _state.automation.page = 1;
    _renderAutomation(CRM.getContent());
  }
  function _sortAutomation(key) {
    var st = _state.automation;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderAutomation(CRM.getContent());
  }
  function _pageAutomation(p) { _state.automation.page = p; _renderAutomation(CRM.getContent()); }

  function _toggleDrip(id, field, value) {
    var payload = {};
    payload[field] = value;
    MallanAPI._fetch('/api/crm/automation/toggle', {
      method: 'POST',
      body: JSON.stringify({ client_id: id, field: field, value: value }),
    }).then(function () {
      // Update local state optimistically
      _state.automation.data.forEach(function (r) {
        if (String(r.id) === String(id)) r[field] = value;
      });
      _renderAutomation(CRM.getContent());
      CRM.toast('Drip ' + (value ? 'activated' : 'paused'), 'success');
    }).catch(function () {
      CRM.toast('Unable to toggle drip', 'error');
    });
  }

  function _overrideTier(id) {
    var formHtml = '<div class="p-4">' +
      '<label class="text-xs font-semibold text-gray-700 block mb-1">Override Tier</label>' +
      '<select id="tier_override" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' +
        '<option value="active">Active (weekly)</option>' +
        '<option value="monthly">Monthly</option>' +
        '<option value="quarterly">Quarterly</option>' +
        '<option value="biannual">Bi-Annual</option>' +
        '<option value="paused">Paused</option>' +
      '</select></div>';

    CRM.openModal('Override Drip Tier', formHtml, function () {
      var tier = _val('tier_override');
      MallanAPI._fetch('/api/crm/automation/override-tier', {
        method: 'POST',
        body: JSON.stringify({ client_id: id, tier: tier }),
      }).then(function () {
        _state.automation.data.forEach(function (r) {
          if (String(r.id) === String(id)) r.rental_drip_status = tier;
        });
        _renderAutomation(CRM.getContent());
        CRM.toast('Tier set to ' + tier, 'success');
        CRM.closeModal();
      }).catch(function () { CRM.toast('Override failed', 'error'); });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SHARED WORKSPACE HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  function _openClient(id) { Router.navigate('/workspace/client/' + id + '/overview'); }

  function _editClient(id) {
    MallanAPI._fetch('/api/crm/clients/' + id).then(function (data) {
      var cl = data.client || data;
      var formHtml = '<div class="space-y-3 p-4">' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">First Name</label><input id="ec_fn" type="text" value="' + E(cl.first_name || '') + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Last Name</label><input id="ec_ln" type="text" value="' + E(cl.last_name || '') + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Email</label><input id="ec_email" type="email" value="' + E(cl.email || '') + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Phone</label><input id="ec_phone" type="tel" value="' + E(cl.phone || '') + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
        '</div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Property Address</label><input id="ec_addr" type="text" value="' + E(cl.property_address || '') + '" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none"></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Notes</label><textarea id="ec_notes" rows="2" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none">' + E(cl.notes || '') + '</textarea></div>' +
      '</div>';

      CRM.openModal('Edit Client', formHtml, function () {
        MallanAPI._fetch('/api/crm/clients/' + id, {
          method: 'PATCH',
          body: JSON.stringify({
            first_name: _val('ec_fn'),
            last_name: _val('ec_ln'),
            email: _val('ec_email'),
            phone: _val('ec_phone'),
            property_address: _val('ec_addr'),
            notes: _val('ec_notes'),
          }),
        }).then(function () {
          CRM.toast('Client updated', 'success');
          CRM.closeModal();
          // Reload current workspace if applicable
          if (_state.ws.client && String(_state.ws.client.id) === String(id)) {
            var role = (_state.ws.client.client_type || _state.ws.client.type || '').toLowerCase();
            if (role === 'landlord') _loadLandlordWorkspace(id);
            else if (role === 'tenant') _loadTenantWorkspace(id);
            else _loadProspectWorkspace(id);
          }
        }).catch(function () { CRM.toast('Update failed', 'error'); });
      });
    });
  }

  function _deleteClient(id, redirectRoute) {
    if (!confirm('Delete this client? This cannot be undone.')) return;
    MallanAPI._fetch('/api/crm/clients/' + id, { method: 'DELETE' }).then(function () {
      CRM.toast('Client deleted', 'success');
      Router.navigate(redirectRoute || '/rentals/landlords');
    }).catch(function () { CRM.toast('Delete failed', 'error'); });
  }

  function _loadClientActivity(content, clientId) {
    content.innerHTML = UI.loading();
    MallanAPI._fetch('/api/crm/activity?client_id=' + clientId).then(function (data) {
      var events = data.events || [];
      if (events.length === 0) {
        content.innerHTML = UI.emptyState('fa-stream', 'No activity recorded');
        return;
      }
      var groups = _groupByDate(events);
      var groupOrder = ['Today', 'Yesterday', 'This Week', 'Earlier'];
      var html = '';

      groupOrder.forEach(function (groupLabel) {
        var ge = groups[groupLabel];
        if (!ge || ge.length === 0) return;
        html += '<div class="mb-4">';
        html += '<div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">' + groupLabel + '</div>';
        ge.forEach(function (ev) {
          var icon = _activityIcon(ev.activity_type);
          html += '<div class="activity-card mb-2">' +
            '<div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style="background:' + icon.bg + '">' +
              '<i class="fas ' + icon.icon + '" style="font-size:11px;color:' + icon.color + '"></i>' +
            '</div>' +
            '<div class="flex-1 min-w-0">' +
              '<p class="text-sm font-medium text-gray-900">' + E(ev.title || '') + '</p>' +
              (ev.detail ? '<p class="text-xs text-gray-500">' + E(ev.detail) + '</p>' : '') +
            '</div>' +
            '<span class="text-[10px] text-gray-400 flex-shrink-0">' + Utils.formatTimeAgo(ev.created_at) + '</span>' +
          '</div>';
        });
        html += '</div>';
      });

      content.innerHTML = html;
    }).catch(function () {
      content.innerHTML = UI.emptyState('fa-stream', 'Unable to load activity');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════
  return {
    // 7 Tab entry points
    landlords: landlords,
    rentalListings: rentalListings,
    viewedDidNotRent: viewedDidNotRent,
    currentTenants: currentTenants,
    rentalsMarketing: rentalsMarketing,
    rentalsActivity: rentalsActivity,
    rentalsAutomation: rentalsAutomation,

    // Landlords tab
    _searchLandlords: _searchLandlords,
    _filterLandlords: _filterLandlords,
    _sortLandlords: _sortLandlords,
    _pageLandlords: _pageLandlords,
    _vacancyCost: _vacancyCost,
    _deleteLandlord: _deleteLandlord,
    _openLandlordWorkspace: _openLandlordWorkspace,
    _landlordTab: _landlordTab,
    _toggleScreening: _toggleScreening,
    _toggleLandlordAutomation: _toggleLandlordAutomation,
    _updateAppStatus: _updateAppStatus,

    // Listings tab
    _searchListings: _searchListings,
    _filterListings: _filterListings,
    _sortListings: _sortListings,
    _pageListings: _pageListings,
    _openListing: _openListing,

    // Viewed / Did Not Rent tab
    _searchViewed: _searchViewed,
    _filterViewed: _filterViewed,
    _sortViewed: _sortViewed,
    _pageViewed: _pageViewed,
    _promoteToBuyer: _promoteToBuyer,
    _deleteProspect: _deleteProspect,
    _openProspectWorkspace: _openProspectWorkspace,
    _prospectTab: _prospectTab,
    _addShowing: _addShowing,
    _editShowing: _editShowing,
    _deleteShowing: _deleteShowing,
    _scrollToShowing: _scrollToShowing,
    _editCriteria: _editCriteria,
    _setOutreachDate: _setOutreachDate,
    _sendOutreach: _sendOutreach,
    _editBuyerScore: _editBuyerScore,
    _toggleClientDrip: _toggleClientDrip,

    // Current Tenants tab
    _searchTenants: _searchTenants,
    _filterTenants: _filterTenants,
    _sortTenants: _sortTenants,
    _pageTenants: _pageTenants,
    _markNotRenewing: _markNotRenewing,
    _initiateRenewal: _initiateRenewal,
    _openTenantWorkspace: _openTenantWorkspace,
    _tenantTab: _tenantTab,
    _updateRenewalStatus: _updateRenewalStatus,

    // Marketing tab
    _searchMarketing: _searchMarketing,
    _sortMarketing: _sortMarketing,
    _pageMarketing: _pageMarketing,
    _newCampaign: _newCampaign,
    _editCampaign: _editCampaign,
    _deleteCampaign: _deleteCampaign,

    // Activity tab
    _filterActivity: _filterActivity,

    // Automation tab
    _searchAutomation: _searchAutomation,
    _filterAutomation: _filterAutomation,
    _sortAutomation: _sortAutomation,
    _pageAutomation: _pageAutomation,
    _toggleDrip: _toggleDrip,
    _overrideTier: _overrideTier,

    // Shared
    _openClient: _openClient,
    _editClient: _editClient,
    _deleteClient: _deleteClient,
  };
})();
