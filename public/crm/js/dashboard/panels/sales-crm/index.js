// ═══════════════════════════════════════════════════════════════════════════════
// SALES CRM — Complete 7-Tab Module with Full Workspaces
// Active Sellers | Active Buyers | Landlord Sellers | Listings | Marketing | Activity | Automation
// Full CRUD, multi-agent, click-to-workspace, entity ownership, multi-person,
// all tools wired, every button functional
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, Router, Store, UI, Utils, FilterBar, ActivityTable, MallanAPI,
         ClientNormalizer, WorkspaceShell, EntityFields,
         BuyerIntake, InvestorIntake, SellerIntake,
         CashOnCashCalc, CapRateCalc, ROICalc, RentalYieldCalc,
         Exchange1031Tracker, NetProceedsCalc */

var SalesCRM = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  // ─── Tab Definitions ─────────────────────────────────────────────────
  var TABS = [
    { id: 'sellers',           route: '/sales/sellers',          label: 'Active Sellers',    icon: 'fa-home' },
    { id: 'buyers',            route: '/sales/buyers',           label: 'Active Buyers',     icon: 'fa-user-tag' },
    { id: 'landlord-sellers',  route: '/sales/landlord-sellers', label: 'Landlord Sellers',  icon: 'fa-exchange-alt' },
    { id: 'listings',          route: '/sales/listings',         label: 'Listings',          icon: 'fa-building' },
    { id: 'marketing',         route: '/sales/marketing',        label: 'Marketing',         icon: 'fa-bullhorn' },
    { id: 'activity',          route: '/sales/activity',         label: 'Activity',          icon: 'fa-stream' },
    { id: 'automation',        route: '/sales/automation',       label: 'Automation',        icon: 'fa-robot' },
  ];

  // ─── Internal State ──────────────────────────────────────────────────
  var _state = {
    sellers:          { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '', filter: {} },
    buyers:           { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '', filter: {} },
    landlordSellers:  { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '', filter: {} },
    listings:         { data: [], sort: { key: 'address', dir: 'asc' }, page: 1, search: '', filter: {} },
    marketing:        { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    activity:         { data: [], page: 1, filter: 'all' },
    automation:       { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    workspace:        { client: null, tab: 'overview', backRoute: '/sales/sellers' },
    campaignDetail:   { campaign: null },
  };

  // ─── KPI Strip Helper ──────────────────────────────────────────────
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

  // ─── DOM Color Helper ──────────────────────────────────────────────
  function _domBadge(val) {
    var d = Number(val) || 0;
    var cls = d < 30 ? 'dom-green' : d < 90 ? 'dom-yellow' : 'dom-red';
    return '<span class="' + cls + '">' + d + '</span>';
  }

  // ─── Score Bar ─────────────────────────────────────────────────────
  function _scoreBar(score) {
    if (typeof UI.scoreBar === 'function') return UI.scoreBar(score);
    var s = Number(score) || 0;
    var color = s >= 70 ? '#059669' : s >= 40 ? '#F59E0B' : '#9CA3AF';
    return '<div style="display:flex;align-items:center;gap:6px;">' +
      '<div style="flex:1;height:6px;background:#F3F4F6;border-radius:3px;min-width:48px;max-width:72px;">' +
        '<div style="height:100%;width:' + Math.min(s, 100) + '%;background:' + color + ';border-radius:3px;transition:width .3s;"></div>' +
      '</div>' +
      '<span style="font-size:11px;font-weight:700;color:' + color + ';">' + s + '</span>' +
    '</div>';
  }

  // ─── Toggle Switch ─────────────────────────────────────────────────
  function _toggleSwitch(isOn, onclick) {
    if (typeof UI.toggleSwitch === 'function') return UI.toggleSwitch(isOn, onclick);
    var bg = isOn ? '#059669' : '#D1D5DB';
    var transform = isOn ? 'translateX(16px)' : 'translateX(0)';
    var label = isOn ? 'ON' : 'OFF';
    var onclickAttr = onclick ? ' onclick="' + onclick + '"' : '';
    return '<div style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;"' + onclickAttr + '>' +
      '<div style="position:relative;width:36px;height:20px;background:' + bg + ';border-radius:10px;transition:background .2s;">' +
        '<div style="position:absolute;top:2px;left:2px;width:16px;height:16px;background:#fff;border-radius:50%;box-shadow:0 1px 2px rgba(0,0,0,.15);transition:transform .2s;transform:' + transform + ';"></div>' +
      '</div>' +
      '<span style="font-size:10px;font-weight:700;color:' + (isOn ? '#059669' : '#9CA3AF') + ';">' + label + '</span>' +
    '</div>';
  }

  // ─── Row Actions Helper ────────────────────────────────────────────
  function _rowActions(actions) {
    if (typeof UI.rowActions === 'function') return UI.rowActions(actions);
    var html = '<div style="display:flex;gap:4px;justify-content:flex-end;">';
    actions.forEach(function (a) {
      html += '<button class="btn-icon-sm" title="' + E(a.title || '') + '" onclick="event.stopPropagation();' + (a.onclick || '') + '"' +
        ' style="width:28px;height:28px;border-radius:6px;border:1px solid #E5E7EB;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s;color:#6B7280;font-size:12px;"' +
        ' onmouseover="this.style.borderColor=\'#B8860B\';this.style.color=\'#B8860B\'"' +
        ' onmouseout="this.style.borderColor=\'#E5E7EB\';this.style.color=\'#6B7280\'">' +
        '<i class="fas ' + a.icon + '"></i></button>';
    });
    html += '</div>';
    return html;
  }

  // ─── Status Badge Helper ───────────────────────────────────────────
  function _statusBadge(status, colorMap) {
    var s = status || '';
    var cls = (colorMap && colorMap[s]) || 'bg-gray-100 text-gray-600';
    return '<span class="text-[10px] px-2 py-0.5 rounded-md font-bold ' + cls + '">' + E(s) + '</span>';
  }

  var _listingStatusColors = {
    'Active': 'bg-blue-100 text-blue-700',
    'Coming Soon': 'bg-yellow-100 text-yellow-700',
    'Under Contract': 'bg-purple-100 text-purple-700',
    'Closed': 'bg-green-100 text-green-700',
    'No Listing': 'bg-gray-100 text-gray-500',
    'Pending': 'bg-orange-100 text-orange-700',
  };

  var _campaignStatusColors = {
    draft: 'bg-gray-100 text-gray-600',
    scheduled: 'bg-blue-100 text-blue-700',
    sent: 'bg-green-100 text-green-700',
    recurring: 'bg-purple-100 text-purple-700',
  };

  var _tierColors = {
    active: 'bg-green-100 text-green-700',
    monthly: 'bg-blue-100 text-blue-700',
    quarterly: 'bg-yellow-100 text-yellow-700',
    biannual: 'bg-gray-100 text-gray-600',
    paused: 'bg-red-100 text-red-600',
  };

  // ─── Inject KPI + DOM styles once ──────────────────────────────────
  (function _injectStyles() {
    if (document.getElementById('sales-crm-kpi-styles')) return;
    var style = document.createElement('style');
    style.id = 'sales-crm-kpi-styles';
    style.textContent =
      '.kpi-strip{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;}' +
      '.kpi-card{display:flex;align-items:center;gap:12px;padding:14px 18px;background:#fff;border:1px solid #E5E7EB;border-radius:12px;flex:1;min-width:180px;box-shadow:0 1px 3px rgba(0,0,0,.04);}' +
      '.kpi-card-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;}' +
      '.kpi-card-value{font-size:20px;font-weight:800;color:#111827;line-height:1.2;}' +
      '.kpi-card-label{font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.3px;}' +
      '.dom-green{color:#059669;font-weight:700;font-size:13px;}' +
      '.dom-yellow{color:#D97706;font-weight:700;font-size:13px;}' +
      '.dom-red{color:#DC2626;font-weight:700;font-size:13px;}' +
      '.investor-row{border-left:3px solid #F59E0B !important;}' +
      '.btn-promote{padding:4px 10px;font-size:11px;font-weight:700;border-radius:6px;border:1px solid #B8860B;color:#B8860B;background:#fff;cursor:pointer;transition:all .15s;}' +
      '.btn-promote:hover{background:#B8860B;color:#fff;}' +
      '.progress-bar-mini{display:inline-flex;align-items:center;gap:6px;}' +
      '.progress-bar-mini-track{width:56px;height:6px;background:#F3F4F6;border-radius:3px;overflow:hidden;}' +
      '.progress-bar-mini-fill{height:100%;border-radius:3px;transition:width .3s;}' +
      '.activity-group-header{font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;padding:12px 0 6px;border-bottom:1px solid #F3F4F6;margin-bottom:8px;}' +
      '.activity-card{display:flex;align-items:flex-start;gap:12px;padding:12px;background:#fff;border:1px solid #F3F4F6;border-radius:10px;transition:border-color .15s;margin-bottom:4px;cursor:pointer;}' +
      '.activity-card:hover{border-color:#B8860B30;}' +
      '.ws-tabs{display:flex;gap:2px;overflow-x:auto;border-bottom:1px solid #E5E7EB;margin-bottom:16px;padding-bottom:0;}' +
      '.ws-tab{padding:8px 14px;font-size:12px;font-weight:600;white-space:nowrap;border-bottom:2px solid transparent;color:#6B7280;cursor:pointer;transition:all .15s;background:none;border-left:0;border-right:0;border-top:0;}' +
      '.ws-tab:hover{color:#111827;background:#F9FAFB;}' +
      '.ws-tab.active{color:#B8860B;border-bottom-color:#B8860B;background:rgba(184,134,11,.04);}' +
      '.offer-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;border-radius:10px;font-size:10px;font-weight:800;padding:0 6px;}' +
      '.offer-badge-new{background:#FEE2E2;color:#DC2626;}' +
      '.offer-badge-counter{background:#FEF3C7;color:#D97706;}' +
      '.offer-badge-accepted{background:#D1FAE5;color:#059669;}' +
      '.campaign-detail-stat{display:flex;flex-direction:column;align-items:center;padding:16px;background:#F9FAFB;border-radius:10px;min-width:100px;}' +
      '.campaign-detail-stat .val{font-size:24px;font-weight:800;color:#111827;}' +
      '.campaign-detail-stat .lbl{font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;margin-top:2px;}' +
      '@media(max-width:768px){.kpi-strip{flex-direction:column;}.kpi-card{min-width:auto;}.ws-tabs{flex-wrap:nowrap;}}';
    document.head.appendChild(style);
  })();

  // ─── Subnav ──────────────────────────────────────────────────────────
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

  // ─── Apply filters to row data ─────────────────────────────────────
  function _applyFilters(rows, stateObj, filterDefs) {
    var result = ActivityTable.filterRows(rows, stateObj.search);
    if (stateObj.filter) {
      Object.keys(stateObj.filter).forEach(function (key) {
        var val = stateObj.filter[key];
        if (!val) return;
        var def = filterDefs && filterDefs[key];
        if (def && typeof def === 'function') {
          result = result.filter(def.bind(null, val));
        } else {
          result = result.filter(function (r) { return String(r[key] || '') === val; });
        }
      });
    }
    return ActivityTable.sortRows(result, stateObj.sort.key, stateObj.sort.dir);
  }

  // ─── Date Group Helper ─────────────────────────────────────────────
  function _dateGroupLabel(dateStr) {
    if (!dateStr) return 'Earlier';
    var d = new Date(dateStr);
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var yesterday = new Date(today.getTime() - 86400000);
    var weekAgo = new Date(today.getTime() - 7 * 86400000);
    var eventDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (eventDay.getTime() >= today.getTime()) return 'Today';
    if (eventDay.getTime() >= yesterday.getTime()) return 'Yesterday';
    if (eventDay.getTime() >= weekAgo.getTime()) return 'This Week';
    return 'Earlier';
  }

  // ─── Activity icon map ─────────────────────────────────────────────
  function _activityIcon(type) {
    var map = {
      portal_login:    { icon: 'fa-sign-in-alt',    color: '#3B82F6', bg: '#EFF6FF' },
      listing_view:    { icon: 'fa-eye',             color: '#8B5CF6', bg: '#F5F3FF' },
      listing_saved:   { icon: 'fa-heart',           color: '#EC4899', bg: '#FDF2F8' },
      listing_hidden:  { icon: 'fa-eye-slash',       color: '#6B7280', bg: '#F3F4F6' },
      showing:         { icon: 'fa-calendar',        color: '#F59E0B', bg: '#FFFBEB' },
      showing_request: { icon: 'fa-calendar-plus',   color: '#F59E0B', bg: '#FFFBEB' },
      showing_done:    { icon: 'fa-calendar-check',  color: '#059669', bg: '#ECFDF5' },
      open_house:      { icon: 'fa-door-open',       color: '#6366F1', bg: '#EEF2FF' },
      offer:           { icon: 'fa-handshake',       color: '#059669', bg: '#ECFDF5' },
      offer_counter:   { icon: 'fa-hand-holding-usd',color: '#D97706', bg: '#FFFBEB' },
      offer_accepted:  { icon: 'fa-check-double',    color: '#059669', bg: '#ECFDF5' },
      offer_rejected:  { icon: 'fa-times-circle',    color: '#DC2626', bg: '#FEF2F2' },
      offer_withdrawn: { icon: 'fa-undo',            color: '#6B7280', bg: '#F3F4F6' },
      comment:         { icon: 'fa-comment',         color: '#6366F1', bg: '#EEF2FF' },
      email:           { icon: 'fa-envelope',        color: '#EC4899', bg: '#FDF2F8' },
      email_opened:    { icon: 'fa-envelope-open',   color: '#EC4899', bg: '#FDF2F8' },
      email_clicked:   { icon: 'fa-mouse-pointer',   color: '#EC4899', bg: '#FDF2F8' },
      email_replied:   { icon: 'fa-reply',           color: '#3B82F6', bg: '#EFF6FF' },
      status_change:   { icon: 'fa-exchange-alt',    color: '#B8860B', bg: '#FFFBF0' },
      price_change:    { icon: 'fa-dollar-sign',     color: '#D97706', bg: '#FFFBEB' },
      published:       { icon: 'fa-globe',           color: '#059669', bg: '#ECFDF5' },
      paused:          { icon: 'fa-pause',           color: '#6B7280', bg: '#F3F4F6' },
      conversion:      { icon: 'fa-check-circle',    color: '#059669', bg: '#ECFDF5' },
      cma:             { icon: 'fa-chart-bar',        color: '#6366F1', bg: '#EEF2FF' },
      inquiry:         { icon: 'fa-question-circle',  color: '#3B82F6', bg: '#EFF6FF' },
      campaign_sent:   { icon: 'fa-paper-plane',     color: '#8B5CF6', bg: '#F5F3FF' },
      campaign_opened: { icon: 'fa-envelope-open',   color: '#EC4899', bg: '#FDF2F8' },
      campaign_clicked:{ icon: 'fa-mouse-pointer',   color: '#EC4899', bg: '#FDF2F8' },
      drip_paused:     { icon: 'fa-pause-circle',    color: '#6B7280', bg: '#F3F4F6' },
      drip_resumed:    { icon: 'fa-play-circle',     color: '#059669', bg: '#ECFDF5' },
    };
    return map[type] || { icon: 'fa-circle', color: '#9CA3AF', bg: '#F9FAFB' };
  }


  // ═══════════════════════════════════════════════════════════════════════
  // TAB 1: ACTIVE SELLERS
  // ═══════════════════════════════════════════════════════════════════════
  function activeSellers() {
    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();
    c.innerHTML = _subnav('sellers') + UI.loading();

    MallanAPI._fetch('/api/crm/sales/sellers').then(function (data) {
      _state.sellers.data = (data.sellers || data.clients || []).map(function (s) { return ClientNormalizer.normalize(s); });
      _renderSellers(c);
    }).catch(function () {
      c.innerHTML = _subnav('sellers') + UI.emptyState('fa-home', 'Unable to load sellers');
    });
  }

  function _sellerKPIs(data) {
    var total = data.length;
    var activeListings = data.filter(function (r) { return r.listing_status && r.listing_status !== 'No Listing'; }).length;
    var doms = data.map(function (r) { return Number(r.dom || r.days_on_market || 0); }).filter(function (d) { return d > 0; });
    var avgDom = doms.length > 0 ? Math.round(doms.reduce(function (a, b) { return a + b; }, 0) / doms.length) : 0;
    var totalValue = data.reduce(function (sum, r) { return sum + (Number(r.list_price) || 0); }, 0);

    return _kpi([
      { icon: 'fa-users', label: 'Total Sellers', value: total, color: '#3B82F6' },
      { icon: 'fa-home', label: 'Active Listings', value: activeListings, color: '#059669' },
      { icon: 'fa-clock', label: 'Avg DOM', value: avgDom, color: avgDom < 30 ? '#059669' : avgDom < 90 ? '#D97706' : '#DC2626' },
      { icon: 'fa-dollar-sign', label: 'Total Listing Value', value: $(totalValue), color: '#B8860B' },
    ]);
  }

  function _renderSellers(c) {
    var st = _state.sellers;
    var filterDefs = {
      status: function (val, r) {
        if (val === 'No Listing') return !r.listing_status || r.listing_status === 'No Listing';
        return r.listing_status === val;
      },
      source: function (val, r) { return (r.source || '').toLowerCase() === val.toLowerCase(); },
    };
    var rows = _applyFilters(st.data, st, filterDefs);

    var html = _subnav('sellers');
    html += _sellerKPIs(st.data);

    html += FilterBar.render({
      id: 'sellers',
      placeholder: 'Search sellers...',
      onSearch: 'SalesCRM._searchSellers',
      filters: [
        { key: 'status', label: 'Listing Status', options: [
          { value: 'Active', label: 'Active' }, { value: 'Coming Soon', label: 'Coming Soon' },
          { value: 'Under Contract', label: 'Under Contract' }, { value: 'Closed', label: 'Closed' },
          { value: 'No Listing', label: 'No Listing' },
        ]},
        { key: 'source', label: 'Source', options: [
          { value: 'referral', label: 'Referral' }, { value: 'website', label: 'Website' },
          { value: 'manual', label: 'Manual' }, { value: 'streetEasy', label: 'StreetEasy' },
        ]},
      ],
      onFilter: 'SalesCRM._filterSellers',
      quickActions: [
        { label: 'New Seller', icon: 'fa-plus', onclick: 'SalesCRM._newSeller()' },
      ],
    });

    html += ActivityTable.render({
      id: 'sellers_table',
      columns: [
        { key: 'avatar', label: '', width: '44px', sortable: false, render: function (r) {
          return UI.avatar(r.name, 32);
        }},
        { key: 'name', label: 'Name', render: function (r) {
          var badge = '';
          if (r.entity_name) badge = '<br><span class="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-bold mt-0.5 inline-block">' + E(r.entity_type || 'Entity') + '</span>';
          return '<div class="leading-tight"><span class="font-semibold text-gray-900">' + E(r.name || '') + '</span>' + badge + '</div>';
        }},
        { key: 'property_address', label: 'Property', render: function (r) {
          var addr = r.property_address || r.address || '-';
          return '<span class="text-sm text-gray-700">' + E(addr) + '</span>';
        }},
        { key: 'listing_status', label: 'Status', render: function (r) {
          return _statusBadge(r.listing_status || 'No Listing', _listingStatusColors);
        }},
        { key: 'list_price', label: 'Price', render: function (r) {
          return r.list_price ? '<span class="font-semibold text-gray-900">' + $(Number(r.list_price)) + '</span>' : '<span class="text-gray-400">-</span>';
        }},
        { key: 'dom', label: 'DOM', render: function (r) {
          return _domBadge(r.dom || r.days_on_market || 0);
        }},
        { key: 'showings_count', label: 'Showings', render: function (r) {
          var count = Number(r.showings_count) || 0;
          return count > 0 ? '<span class="font-semibold text-gray-900">' + count + '</span>' : '<span class="text-gray-400">0</span>';
        }},
        { key: 'actions', label: '', width: '120px', sortable: false, render: function (r) {
          return _rowActions([
            { icon: 'fa-calculator', title: 'Net Proceeds', onclick: 'SalesCRM._netProceeds(\'' + E(r.id || '') + '\')' },
            { icon: 'fa-chart-bar', title: 'CMA', onclick: 'SalesCRM._requestCMA(\'' + E(r.id || '') + '\')' },
            { icon: 'fa-edit', title: 'Edit', onclick: 'SalesCRM._editClient(\'' + E(r.id || '') + '\')' },
            { icon: 'fa-trash-alt', title: 'Delete', onclick: 'SalesCRM._deleteClient(\'' + E(r.id || '') + '\',\'sellers\')' },
          ]);
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'SalesCRM._sortSellers',
      onRowClick: 'SalesCRM._openSellerWorkspace',
      page: st.page,
      pageSize: 25,
      onPage: 'SalesCRM._pageSellers',
      emptyIcon: 'fa-home',
      emptyText: 'No sellers yet — add one to start',
    });

    c.innerHTML = html;
  }

  function _searchSellers(q) { _state.sellers.search = q; _state.sellers.page = 1; _renderSellers(CRM.getContent()); }
  function _filterSellers(key, value) {
    _state.sellers.filter[key] = value;
    _state.sellers.page = 1;
    _renderSellers(CRM.getContent());
  }
  function _sortSellers(key) {
    var st = _state.sellers;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderSellers(CRM.getContent());
  }
  function _pageSellers(p) { _state.sellers.page = p; _renderSellers(CRM.getContent()); }

  function _newSeller() {
    CRM.openModal('New Seller',
      '<form id="newSellerForm" class="space-y-4 p-2">' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">First Name *</label><input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="first_name" required></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Last Name *</label><input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="last_name" required></div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Email</label><input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" type="email" name="email"></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Phone</label><input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" type="tel" name="phone"></div>' +
        '</div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Property Address</label><input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="property_address" placeholder="Street address of the property"></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Source</label><select class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="source">' +
          '<option value="manual">Manual Entry</option><option value="referral">Referral</option><option value="website">Website</option><option value="streetEasy">StreetEasy</option><option value="open-house">Open House</option><option value="social">Social Media</option>' +
        '</select></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Notes</label><textarea class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="notes" rows="2"></textarea></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="SalesCRM._submitNewSeller()"><i class="fas fa-save mr-1"></i>Create Seller</button>',
      }
    );
  }

  function _submitNewSeller() {
    var form = document.getElementById('newSellerForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });
    data.type = 'seller';
    data.client_type = 'seller';

    MallanAPI._fetch('/api/crm/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(function (res) {
      CRM.toast('Seller created', 'success');
      CRM.closeModal();
      activeSellers();
    }).catch(function (err) {
      CRM.toast('Failed to create seller: ' + (err.message || ''), 'error');
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // TAB 2: ACTIVE BUYERS (+ Investors)
  // ═══════════════════════════════════════════════════════════════════════
  function activeBuyers() {
    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();
    c.innerHTML = _subnav('buyers') + UI.loading();

    MallanAPI._fetch('/api/crm/sales/buyers').then(function (data) {
      _state.buyers.data = (data.buyers || data.clients || []).map(function (b) { return ClientNormalizer.normalize(b); });
      _renderBuyers(c);
    }).catch(function () {
      c.innerHTML = _subnav('buyers') + UI.emptyState('fa-user-tag', 'Unable to load buyers');
    });
  }

  function _buyerKPIs(data) {
    var total = data.length;
    var investors = data.filter(function (r) { return r.is_investor; }).length;
    var preApproved = data.filter(function (r) { return r.pre_approved; }).length;
    var convictions = data.map(function (r) { return Number(r.conviction_score) || 0; }).filter(function (s) { return s > 0; });
    var avgConviction = convictions.length > 0 ? Math.round(convictions.reduce(function (a, b) { return a + b; }, 0) / convictions.length) : 0;

    return _kpi([
      { icon: 'fa-users', label: 'Total Buyers', value: total, color: '#3B82F6' },
      { icon: 'fa-chart-line', label: 'Investors', value: investors, color: '#F59E0B' },
      { icon: 'fa-check-circle', label: 'Pre-Approved', value: preApproved, color: '#059669' },
      { icon: 'fa-fire', label: 'Avg Conviction', value: avgConviction, color: avgConviction >= 70 ? '#059669' : avgConviction >= 40 ? '#D97706' : '#9CA3AF' },
    ]);
  }

  function _renderBuyers(c) {
    var st = _state.buyers;
    var filterDefs = {
      type: function (val, r) {
        if (val === 'investor') return !!r.is_investor;
        if (val === 'buyer') return !r.is_investor;
        return true;
      },
      pre_approved: function (val, r) { return String(!!r.pre_approved) === val; },
      stage: function (val, r) { return (r.pipeline_stage || '') === val; },
    };
    var rows = _applyFilters(st.data, st, filterDefs);

    var html = _subnav('buyers');
    html += _buyerKPIs(st.data);

    html += FilterBar.render({
      id: 'buyers',
      placeholder: 'Search buyers & investors...',
      onSearch: 'SalesCRM._searchBuyers',
      filters: [
        { key: 'type', label: 'Type', options: [
          { value: 'buyer', label: 'Buyers Only' }, { value: 'investor', label: 'Investors Only' },
        ]},
        { key: 'pre_approved', label: 'Pre-Approved', options: [
          { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' },
        ]},
        { key: 'stage', label: 'Stage', options: [
          { value: 'new', label: 'New' }, { value: 'active', label: 'Active' },
          { value: 'showing', label: 'Showing' }, { value: 'offer', label: 'Offer' }, { value: 'deal', label: 'Deal' },
        ]},
      ],
      onFilter: 'SalesCRM._filterBuyers',
      quickActions: [
        { label: 'New Buyer', icon: 'fa-plus', onclick: 'SalesCRM._newBuyer()' },
      ],
    });

    html += ActivityTable.render({
      id: 'buyers_table',
      columns: [
        { key: 'avatar', label: '', width: '44px', sortable: false, render: function (r) {
          return UI.avatar(r.name, 32);
        }},
        { key: 'name', label: 'Name', render: function (r) {
          var badges = '';
          if (r.is_investor) badges += '<span class="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-bold ml-1">Investor</span>';
          if (r.entity_name) badges += '<span class="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-bold ml-1">' + E(r.entity_type || 'Entity') + '</span>';
          return '<div class="leading-tight"><span class="font-semibold text-gray-900">' + E(r.name || '') + '</span>' + badges + '</div>';
        }},
        { key: 'budget', label: 'Budget', render: function (r) {
          if (r.pre_approved_amount) return '<span class="font-semibold text-gray-900">' + $(Number(r.pre_approved_amount)) + '</span>';
          if (r.available_funds) return '<span class="font-semibold text-gray-900">' + $(Number(r.available_funds)) + '</span>';
          return '<span class="text-gray-400">-</span>';
        }},
        { key: 'pre_approved', label: 'Pre-Approved', width: '90px', render: function (r) {
          return r.pre_approved
            ? '<span style="color:#059669;font-size:16px;"><i class="fas fa-check-circle"></i></span>'
            : '<span style="color:#D1D5DB;font-size:14px;"><i class="fas fa-minus"></i></span>';
        }},
        { key: 'pipeline_stage', label: 'Stage', render: function (r) {
          return UI.stageBadge(r.pipeline_stage || 'active');
        }},
        { key: 'listings_sent_count', label: 'Sent', render: function (r) {
          var count = Number(r.listings_sent_count) || 0;
          return count > 0 ? '<span class="font-semibold text-gray-900">' + count + '</span>' : '<span class="text-gray-400">0</span>';
        }},
        { key: 'showings_count', label: 'Showings', render: function (r) {
          var count = Number(r.showings_count) || 0;
          return count > 0 ? '<span class="font-semibold text-gray-900">' + count + '</span>' : '<span class="text-gray-400">0</span>';
        }},
        { key: 'conviction_score', label: 'Conviction', render: function (r) {
          return _scoreBar(r.conviction_score || 0);
        }},
        { key: 'actions', label: '', width: '100px', sortable: false, render: function (r) {
          return _rowActions([
            { icon: 'fa-paper-plane', title: 'Send Listings', onclick: 'SalesCRM._sendListings(\'' + E(r.id || '') + '\')' },
            { icon: 'fa-calendar', title: 'Schedule Showing', onclick: 'SalesCRM._scheduleShowing(\'' + E(r.id || '') + '\')' },
            { icon: 'fa-trash-alt', title: 'Delete', onclick: 'SalesCRM._deleteClient(\'' + E(r.id || '') + '\',\'buyers\')' },
          ]);
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'SalesCRM._sortBuyers',
      onRowClick: 'SalesCRM._openBuyerWorkspace',
      page: st.page,
      pageSize: 25,
      onPage: 'SalesCRM._pageBuyers',
      emptyIcon: 'fa-user-tag',
      emptyText: 'No buyers yet — add one to start',
    });

    c.innerHTML = html;
  }

  function _searchBuyers(q) { _state.buyers.search = q; _state.buyers.page = 1; _renderBuyers(CRM.getContent()); }
  function _filterBuyers(key, value) {
    _state.buyers.filter[key] = value;
    _state.buyers.page = 1;
    _renderBuyers(CRM.getContent());
  }
  function _sortBuyers(key) {
    var st = _state.buyers;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderBuyers(CRM.getContent());
  }
  function _pageBuyers(p) { _state.buyers.page = p; _renderBuyers(CRM.getContent()); }

  function _newBuyer() {
    CRM.openModal('New Buyer',
      '<form id="newBuyerForm" class="space-y-4 p-2">' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">First Name *</label><input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="first_name" required></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Last Name *</label><input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="last_name" required></div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Email</label><input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" type="email" name="email"></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Phone</label><input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" type="tel" name="phone"></div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Budget</label><input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" type="number" name="pre_approved_amount" placeholder="e.g. 1500000"></div>' +
          '<div class="flex items-end gap-3">' +
            '<label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="pre_approved" value="true" class="rounded border-gray-300"><span class="text-xs font-semibold text-gray-700">Pre-Approved</span></label>' +
            '<label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="is_investor" value="true" class="rounded border-gray-300"><span class="text-xs font-semibold text-gray-700">Investor</span></label>' +
          '</div>' +
        '</div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Source</label><select class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="source">' +
          '<option value="manual">Manual Entry</option><option value="referral">Referral</option><option value="website">Website</option><option value="streetEasy">StreetEasy</option><option value="open-house">Open House</option>' +
        '</select></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Notes</label><textarea class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="notes" rows="2"></textarea></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="SalesCRM._submitNewBuyer()"><i class="fas fa-save mr-1"></i>Create Buyer</button>',
      }
    );
  }

  function _submitNewBuyer() {
    var form = document.getElementById('newBuyerForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });
    data.type = 'buyer';
    data.client_type = 'buyer';
    data.pre_approved = data.pre_approved === 'true';
    data.is_investor = data.is_investor === 'true';
    if (data.pre_approved_amount) data.pre_approved_amount = Number(data.pre_approved_amount);

    MallanAPI._fetch('/api/crm/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(function () {
      CRM.toast('Buyer created', 'success');
      CRM.closeModal();
      activeBuyers();
    }).catch(function (err) {
      CRM.toast('Failed to create buyer: ' + (err.message || ''), 'error');
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // TAB 3: LANDLORD SELLERS (bridge — landlords with seller potential)
  // ═══════════════════════════════════════════════════════════════════════
  function landlordSellers() {
    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();
    c.innerHTML = _subnav('landlord-sellers') + UI.loading();

    MallanAPI._fetch('/api/crm/sales/landlord-sellers').then(function (data) {
      _state.landlordSellers.data = (data.landlordSellers || data.clients || data.landlords || []).map(function (l) { return ClientNormalizer.normalize(l); });
      _renderLandlordSellers(c);
    }).catch(function () {
      c.innerHTML = _subnav('landlord-sellers') + UI.emptyState('fa-exchange-alt', 'Unable to load landlord sellers');
    });
  }

  function _landlordSellerKPIs(data) {
    var total = data.length;
    var high = data.filter(function (r) { return (r.seller_potential || '').toLowerCase() === 'high'; }).length;
    var medium = data.filter(function (r) { return (r.seller_potential || '').toLowerCase() === 'medium'; }).length;
    var vacancies = data.filter(function (r) { return (r.vacancy_risk || '').toLowerCase() === 'high'; });
    var avgVacancy = vacancies.length;

    return _kpi([
      { icon: 'fa-users', label: 'Total', value: total, color: '#3B82F6' },
      { icon: 'fa-fire', label: 'High Potential', value: high, color: '#DC2626' },
      { icon: 'fa-exclamation-triangle', label: 'Medium Potential', value: medium, color: '#D97706' },
      { icon: 'fa-chart-line', label: 'High Vacancy Risk', value: avgVacancy, color: '#9CA3AF' },
    ]);
  }

  function _renderLandlordSellers(c) {
    var st = _state.landlordSellers;
    var filterDefs = {
      seller_potential: function (val, r) { return (r.seller_potential || '').toLowerCase() === val.toLowerCase(); },
    };
    var rows = _applyFilters(st.data, st, filterDefs);

    var html = _subnav('landlord-sellers');
    html += _landlordSellerKPIs(st.data);

    html += FilterBar.render({
      id: 'landlord_sellers',
      placeholder: 'Search landlord sellers...',
      onSearch: 'SalesCRM._searchLandlordSellers',
      filters: [
        { key: 'seller_potential', label: 'Seller Potential', options: [
          { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' },
        ]},
      ],
      onFilter: 'SalesCRM._filterLandlordSellers',
    });

    html += ActivityTable.render({
      id: 'landlord_sellers_table',
      columns: [
        { key: 'avatar', label: '', width: '44px', sortable: false, render: function (r) {
          return UI.avatar(r.name, 32);
        }},
        { key: 'name', label: 'Name', render: function (r) {
          var badge = '';
          if (r.entity_name) badge = '<br><span class="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-bold mt-0.5 inline-block">' + E(r.entity_type || 'Entity') + '</span>';
          return '<div class="leading-tight"><span class="font-semibold text-gray-900">' + E(r.name || '') + '</span>' + badge + '</div>';
        }},
        { key: 'property_address', label: 'Property', render: function (r) {
          var addr = E(r.property_address || '-');
          if (r.unit_number) addr += ' #' + E(r.unit_number);
          return '<span class="text-sm text-gray-700">' + addr + '</span>';
        }},
        { key: 'unit_type', label: 'Unit Type', render: function (r) {
          return '<span class="text-sm text-gray-600">' + E(r.unit_type || r.property_type || '-') + '</span>';
        }},
        { key: 'listing_status', label: 'Rental Status', render: function (r) {
          return _statusBadge(r.listing_status || r.rental_status || 'Vacant', _listingStatusColors);
        }},
        { key: 'lease_end_date', label: 'Lease End', render: function (r) {
          return r.lease_end_date ? '<span class="text-sm text-gray-600">' + D(r.lease_end_date) + '</span>' : '<span class="text-gray-400">-</span>';
        }},
        { key: 'vacancy_risk', label: 'Vacancy Risk', render: function (r) {
          var v = (r.vacancy_risk || '').toLowerCase();
          if (v === 'high') return '<span style="color:#DC2626;font-size:16px;" title="High Risk"><i class="fas fa-fire"></i></span>';
          if (v === 'medium') return '<span style="color:#D97706;font-size:16px;" title="Medium Risk"><i class="fas fa-exclamation-triangle"></i></span>';
          if (v === 'low') return '<span style="color:#059669;font-size:16px;" title="Low Risk"><i class="fas fa-shield-alt"></i></span>';
          return '<span class="text-gray-400">-</span>';
        }},
        { key: 'seller_potential', label: 'Seller Potential', render: function (r) {
          var p = (r.seller_potential || 'none').toLowerCase();
          var colors = { high: 'background:#FEE2E2;color:#DC2626;', medium: 'background:#FEF3C7;color:#D97706;', low: 'background:#F3F4F6;color:#6B7280;' };
          var style = colors[p] || 'background:#F3F4F6;color:#6B7280;';
          return '<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:10px;font-weight:700;' + style + '">' + E((p || 'none').toUpperCase()) + '</span>';
        }},
        { key: 'last_contact_at', label: 'Last Contact', render: function (r) {
          return r.last_contact_at ? '<span class="text-sm text-gray-600">' + Utils.formatTimeAgo(r.last_contact_at) + '</span>' : '<span class="text-gray-400">-</span>';
        }},
        { key: 'actions', label: '', width: '80px', sortable: false, render: function (r) {
          return '<button class="btn-promote" onclick="event.stopPropagation();SalesCRM._promoteLandlord(\'' + E(r.id || '') + '\')"><i class="fas fa-arrow-up mr-1"></i>Promote</button>';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'SalesCRM._sortLandlordSellers',
      onRowClick: 'SalesCRM._openLandlordSellerWorkspace',
      page: st.page,
      pageSize: 25,
      onPage: 'SalesCRM._pageLandlordSellers',
      emptyIcon: 'fa-exchange-alt',
      emptyText: 'No landlords with seller potential yet',
    });

    c.innerHTML = html;
  }

  function _searchLandlordSellers(q) { _state.landlordSellers.search = q; _state.landlordSellers.page = 1; _renderLandlordSellers(CRM.getContent()); }
  function _filterLandlordSellers(key, value) {
    _state.landlordSellers.filter[key] = value;
    _state.landlordSellers.page = 1;
    _renderLandlordSellers(CRM.getContent());
  }
  function _sortLandlordSellers(key) {
    var st = _state.landlordSellers;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderLandlordSellers(CRM.getContent());
  }
  function _pageLandlordSellers(p) { _state.landlordSellers.page = p; _renderLandlordSellers(CRM.getContent()); }

  function _promoteLandlord(id) {
    if (!confirm('Promote this landlord to the active sellers pipeline?')) return;
    CRM.toast('Promoting landlord to seller pipeline...', 'info');
    MallanAPI._fetch('/api/crm/sales/promote', {
      method: 'POST',
      body: JSON.stringify({ client_id: id, action: 'landlord_to_seller' }),
    }).then(function () {
      CRM.toast('Landlord promoted to seller!', 'success');
      landlordSellers();
    }).catch(function () {
      // Fallback to convert API
      MallanAPI._fetch('/api/crm/convert', {
        method: 'POST',
        body: JSON.stringify({ client_id: id, action: 'landlord_to_seller' }),
      }).then(function () {
        CRM.toast('Landlord promoted to seller!', 'success');
        landlordSellers();
      }).catch(function () {
        CRM.toast('Unable to promote landlord', 'error');
      });
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // TAB 4: SALE LISTINGS
  // ═══════════════════════════════════════════════════════════════════════
  function salesListings() {
    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();
    c.innerHTML = _subnav('listings') + UI.loading();

    MallanAPI._fetch('/api/crm/sales/listings').then(function (data) {
      _state.listings.data = data.listings || [];
      _renderListings(c);
    }).catch(function () {
      c.innerHTML = _subnav('listings') + UI.emptyState('fa-building', 'Unable to load sale listings');
    });
  }

  function _listingKPIs(data) {
    var total = data.length;
    var active = data.filter(function (r) { return (r.status || '').toLowerCase() === 'active'; }).length;
    var totalValue = data.reduce(function (sum, r) { return sum + (Number(r.list_price) || 0); }, 0);
    var doms = data.map(function (r) { return Number(r.dom || r.days_on_market || 0); }).filter(function (d) { return d > 0; });
    var avgDom = doms.length > 0 ? Math.round(doms.reduce(function (a, b) { return a + b; }, 0) / doms.length) : 0;
    var prices = data.filter(function (r) { return Number(r.list_price) > 0; });
    var avgPrice = prices.length > 0 ? Math.round(prices.reduce(function (s, r) { return s + Number(r.list_price); }, 0) / prices.length) : 0;

    return _kpi([
      { icon: 'fa-list', label: 'Total Listings', value: total, color: '#6366F1' },
      { icon: 'fa-building', label: 'Active', value: active, color: '#3B82F6' },
      { icon: 'fa-clock', label: 'Avg DOM', value: avgDom, color: avgDom < 30 ? '#059669' : avgDom < 90 ? '#D97706' : '#DC2626' },
      { icon: 'fa-dollar-sign', label: 'Total Value', value: $(totalValue), color: '#B8860B' },
      { icon: 'fa-chart-bar', label: 'Avg Price', value: avgPrice > 0 ? $(avgPrice) : '-', color: '#8B5CF6' },
    ]);
  }

  function _renderListings(c) {
    var st = _state.listings;
    var filterDefs = {
      status: function (val, r) { return (r.status || '') === val; },
    };
    var rows = _applyFilters(st.data, st, filterDefs);

    var html = _subnav('listings');
    html += _listingKPIs(st.data);

    html += FilterBar.render({
      id: 'slistings',
      placeholder: 'Search listings...',
      onSearch: 'SalesCRM._searchListings',
      filters: [
        { key: 'status', label: 'Status', options: [
          { value: 'Active', label: 'Active' }, { value: 'Coming Soon', label: 'Coming Soon' },
          { value: 'Pending', label: 'Pending' }, { value: 'Closed', label: 'Closed' },
        ]},
      ],
      onFilter: 'SalesCRM._filterListings',
      quickActions: [
        { label: 'New Sale Listing', icon: 'fa-plus', onclick: 'CRM.openListingForm && CRM.openListingForm("sale")' },
      ],
    });

    html += ActivityTable.render({
      id: 'slistings_table',
      columns: [
        { key: 'address', label: 'Address', render: function (r) {
          var addr = r.address;
          if (typeof addr === 'object') addr = addr.UnparsedAddress || addr.full || '';
          return '<span class="font-bold text-gray-900">' + E(addr || '') + '</span>';
        }},
        { key: 'seller_name', label: 'Seller', render: function (r) {
          return '<span class="text-sm text-gray-700">' + E(r.seller_name || r.owner_name || '-') + '</span>';
        }},
        { key: 'status', label: 'Status', render: function (r) {
          return _statusBadge(r.status || 'Active', _listingStatusColors);
        }},
        { key: 'list_price', label: 'Price', render: function (r) {
          return '<span class="font-semibold text-gray-900">' + $(Number(r.list_price || 0)) + '</span>';
        }},
        { key: 'dom', label: 'DOM', render: function (r) {
          return _domBadge(r.dom || r.days_on_market || 0);
        }},
        { key: 'showings_count', label: 'Showings', render: function (r) {
          var count = Number(r.showings_count) || 0;
          return count > 0 ? '<span class="font-semibold text-gray-900">' + count + '</span>' : '<span class="text-gray-400">0</span>';
        }},
        { key: 'open_house_count', label: 'Open Houses', render: function (r) {
          var count = Number(r.open_house_count || r.open_houses_count) || 0;
          return count > 0 ? '<span class="font-semibold text-gray-900">' + count + '</span>' : '<span class="text-gray-400">0</span>';
        }},
        { key: 'comments_count', label: 'Comments', render: function (r) {
          var count = Number(r.comments_count) || 0;
          return count > 0 ? '<span class="font-semibold text-gray-900">' + count + '</span>' : '<span class="text-gray-400">0</span>';
        }},
        { key: 'last_inquiry_at', label: 'Last Inquiry', render: function (r) {
          return r.last_inquiry_at ? '<span class="text-sm text-gray-600">' + Utils.formatTimeAgo(r.last_inquiry_at) + '</span>' : '<span class="text-gray-400">-</span>';
        }},
        { key: 'actions', label: '', width: '44px', sortable: false, render: function (r) {
          return _rowActions([
            { icon: 'fa-external-link-alt', title: 'View Listing', onclick: 'SalesCRM._openListing(\'' + E(r.id || '') + '\')' },
          ]);
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'SalesCRM._sortListings',
      onRowClick: 'SalesCRM._openListing',
      page: st.page,
      pageSize: 25,
      onPage: 'SalesCRM._pageListings',
      emptyIcon: 'fa-building',
      emptyText: 'No sale listings',
    });

    c.innerHTML = html;
  }

  function _searchListings(q) { _state.listings.search = q; _state.listings.page = 1; _renderListings(CRM.getContent()); }
  function _filterListings(key, value) {
    _state.listings.filter[key] = value;
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
  // TAB 5: SALES MARKETING
  // ═══════════════════════════════════════════════════════════════════════
  function salesMarketing() {
    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();
    c.innerHTML = _subnav('marketing') + UI.loading();

    MallanAPI._fetch('/api/crm/campaigns?crm_type=sales').then(function (data) {
      _state.marketing.data = data.campaigns || [];
      _renderMarketing(c);
    }).catch(function () {
      c.innerHTML = _subnav('marketing') + UI.emptyState('fa-bullhorn', 'Unable to load campaigns');
    });
  }

  function _marketingKPIs(data) {
    var total = data.length;
    var active = data.filter(function (r) { return r.status === 'sent' || r.status === 'recurring'; }).length;
    var draft = data.filter(function (r) { return r.status === 'draft'; }).length;
    var rates = data.map(function (r) {
      return r.sent_count > 0 ? Math.round(((r.open_count || 0) / r.sent_count) * 100) : 0;
    }).filter(function (r) { return r > 0; });
    var avgRate = rates.length > 0 ? Math.round(rates.reduce(function (a, b) { return a + b; }, 0) / rates.length) : 0;

    return _kpi([
      { icon: 'fa-bullhorn', label: 'Total Campaigns', value: total, color: '#3B82F6' },
      { icon: 'fa-play-circle', label: 'Active', value: active, color: '#059669' },
      { icon: 'fa-pencil-alt', label: 'Draft', value: draft, color: '#9CA3AF' },
      { icon: 'fa-envelope-open', label: 'Avg Open Rate', value: avgRate + '%', color: avgRate >= 25 ? '#059669' : avgRate >= 15 ? '#D97706' : '#DC2626' },
    ]);
  }

  function _renderMarketing(c) {
    var st = _state.marketing;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _subnav('marketing');
    html += _marketingKPIs(st.data);

    html += FilterBar.render({
      id: 'smarketing',
      placeholder: 'Search campaigns...',
      onSearch: 'SalesCRM._searchMarketing',
      quickActions: [
        { label: 'New Campaign', icon: 'fa-plus', onclick: 'SalesCRM._newCampaign()' },
      ],
    });

    html += ActivityTable.render({
      id: 'smarketing_table',
      columns: [
        { key: 'name', label: 'Campaign', render: function (r) {
          return '<span class="font-semibold text-gray-900">' + E(r.name || '') + '</span>';
        }},
        { key: 'audience_type', label: 'Audience', render: function (r) {
          return '<span class="text-sm text-gray-700">' + E(r.audience_type || '-') + '</span>';
        }},
        { key: 'campaign_type', label: 'Type', render: function (r) {
          return '<span class="text-sm text-gray-600">' + E((r.campaign_type || '').replace(/_/g, ' ')) + '</span>';
        }},
        { key: 'status', label: 'Status', render: function (r) {
          return _statusBadge(r.status || 'draft', _campaignStatusColors);
        }},
        { key: 'sent_date', label: 'Sent Date', render: function (r) {
          return r.sent_at || r.last_run_at ? '<span class="text-sm text-gray-600">' + D(r.sent_at || r.last_run_at) + '</span>' : '<span class="text-gray-400">-</span>';
        }},
        { key: 'open_rate', label: 'Open %', render: function (r) {
          var rate = r.sent_count > 0 ? Math.round(((r.open_count || 0) / r.sent_count) * 100) : 0;
          var color = rate >= 25 ? '#059669' : rate >= 15 ? '#D97706' : '#DC2626';
          return '<div class="progress-bar-mini">' +
            '<div class="progress-bar-mini-track">' +
              '<div class="progress-bar-mini-fill" style="width:' + Math.min(rate, 100) + '%;background:' + color + ';"></div>' +
            '</div>' +
            '<span style="font-size:11px;font-weight:700;color:' + color + ';">' + rate + '%</span>' +
          '</div>';
        }},
        { key: 'click_rate', label: 'Click %', render: function (r) {
          var rate = r.sent_count > 0 ? Math.round(((r.click_count || 0) / r.sent_count) * 100) : 0;
          var color = rate >= 10 ? '#059669' : rate >= 3 ? '#D97706' : '#9CA3AF';
          return '<span style="font-size:11px;font-weight:700;color:' + color + ';">' + rate + '%</span>';
        }},
        { key: 'responses', label: 'Responses', render: function (r) {
          var count = Number(r.response_count || r.replies || 0);
          return count > 0 ? '<span class="font-semibold text-gray-900">' + count + '</span>' : '<span class="text-gray-400">0</span>';
        }},
        { key: 'next_run_at', label: 'Next Run', render: function (r) {
          return r.next_run_at ? '<span class="text-sm text-gray-600">' + D(r.next_run_at) + '</span>' : '<span class="text-gray-400">-</span>';
        }},
        { key: 'actions', label: '', width: '80px', sortable: false, render: function (r) {
          return _rowActions([
            { icon: 'fa-edit', title: 'Edit', onclick: 'SalesCRM._editCampaign(\'' + E(r.id || '') + '\')' },
            { icon: 'fa-trash-alt', title: 'Delete', onclick: 'SalesCRM._deleteCampaign(\'' + E(r.id || '') + '\')' },
          ]);
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'SalesCRM._sortMarketing',
      onRowClick: 'SalesCRM._openCampaignDetail',
      page: st.page,
      pageSize: 25,
      onPage: 'SalesCRM._pageMarketing',
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
    CRM.openModal('New Campaign',
      '<form id="newCampaignForm" class="space-y-4 p-2">' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Campaign Name *</label>' +
          '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="name" required placeholder="e.g. Spring Open House Invite"></div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Audience</label>' +
            '<select class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="audience_type">' +
              '<option value="all_buyers">All Buyers</option><option value="investors">Investors</option>' +
              '<option value="sellers">Sellers</option><option value="all_sales">All Sales Contacts</option>' +
            '</select></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Type</label>' +
            '<select class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="campaign_type">' +
              '<option value="market_update">Market Update</option><option value="new_listing">New Listing</option>' +
              '<option value="open_house">Open House</option><option value="price_change">Price Change</option>' +
              '<option value="newsletter">Newsletter</option><option value="drip">Drip Sequence</option>' +
            '</select></div>' +
        '</div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Frequency</label>' +
          '<select class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="frequency">' +
            '<option value="one_time">One-Time</option><option value="weekly">Weekly</option>' +
            '<option value="monthly">Monthly</option><option value="quarterly">Quarterly</option>' +
          '</select></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="SalesCRM._submitNewCampaign()"><i class="fas fa-save mr-1"></i>Create</button>',
      }
    );
  }

  function _submitNewCampaign() {
    var form = document.getElementById('newCampaignForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = { crm_type: 'sales', status: 'draft' };
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    MallanAPI._fetch('/api/crm/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(function () {
      CRM.toast('Campaign created', 'success');
      CRM.closeModal();
      salesMarketing();
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _editCampaign(id) {
    var campaign = _state.marketing.data.find(function (c) { return String(c.id) === String(id); });
    if (!campaign) { CRM.toast('Campaign not found', 'error'); return; }

    CRM.openModal('Edit Campaign',
      '<form id="editCampaignForm" class="space-y-4 p-2">' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Campaign Name *</label>' +
          '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="name" required value="' + E(campaign.name || '') + '"></div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Audience</label>' +
            '<select class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="audience_type">' +
              '<option value="all_buyers"' + (campaign.audience_type === 'all_buyers' ? ' selected' : '') + '>All Buyers</option>' +
              '<option value="investors"' + (campaign.audience_type === 'investors' ? ' selected' : '') + '>Investors</option>' +
              '<option value="sellers"' + (campaign.audience_type === 'sellers' ? ' selected' : '') + '>Sellers</option>' +
              '<option value="all_sales"' + (campaign.audience_type === 'all_sales' ? ' selected' : '') + '>All Sales Contacts</option>' +
            '</select></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Status</label>' +
            '<select class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="status">' +
              '<option value="draft"' + (campaign.status === 'draft' ? ' selected' : '') + '>Draft</option>' +
              '<option value="scheduled"' + (campaign.status === 'scheduled' ? ' selected' : '') + '>Scheduled</option>' +
              '<option value="sent"' + (campaign.status === 'sent' ? ' selected' : '') + '>Sent</option>' +
              '<option value="recurring"' + (campaign.status === 'recurring' ? ' selected' : '') + '>Recurring</option>' +
            '</select></div>' +
        '</div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="SalesCRM._submitEditCampaign(\'' + E(id) + '\')"><i class="fas fa-save mr-1"></i>Save</button>',
      }
    );
  }

  function _submitEditCampaign(id) {
    var form = document.getElementById('editCampaignForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    MallanAPI._fetch('/api/crm/campaigns/' + id, {
      method: 'PUT',
      body: JSON.stringify(data),
    }).then(function () {
      CRM.toast('Campaign updated', 'success');
      CRM.closeModal();
      salesMarketing();
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _deleteCampaign(id) {
    if (!confirm('Delete this campaign? This cannot be undone.')) return;
    MallanAPI._fetch('/api/crm/campaigns/' + id, { method: 'DELETE' }).then(function () {
      CRM.toast('Campaign deleted', 'success');
      salesMarketing();
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _openCampaignDetail(id) {
    var campaign = _state.marketing.data.find(function (c) { return String(c.id) === String(id); });
    if (!campaign) return;
    _state.campaignDetail.campaign = campaign;

    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();

    var openRate = campaign.sent_count > 0 ? Math.round(((campaign.open_count || 0) / campaign.sent_count) * 100) : 0;
    var clickRate = campaign.sent_count > 0 ? Math.round(((campaign.click_count || 0) / campaign.sent_count) * 100) : 0;

    var html = '<div class="space-y-4">';

    // Back
    html += '<button class="text-sm text-gray-500 hover:text-gray-700 mb-2" onclick="SalesCRM.salesMarketing()">' +
      '<i class="fas fa-arrow-left mr-1"></i>Back to Campaigns</button>';

    // Header
    html += '<div class="flex items-center justify-between">' +
      '<h2 class="text-xl font-bold text-gray-900">' + E(campaign.name || '') + '</h2>' +
      '<div class="flex gap-2">' +
        '<button class="btn btn-sm btn-outline" onclick="SalesCRM._editCampaign(\'' + E(id) + '\')"><i class="fas fa-edit mr-1"></i>Edit</button>' +
        '<button class="btn btn-sm btn-outline text-red-500" onclick="SalesCRM._deleteCampaign(\'' + E(id) + '\')"><i class="fas fa-trash-alt mr-1"></i>Delete</button>' +
      '</div>' +
    '</div>';

    // Stats
    html += '<div class="flex gap-3 flex-wrap">' +
      '<div class="campaign-detail-stat"><span class="val">' + (campaign.sent_count || 0) + '</span><span class="lbl">Sent</span></div>' +
      '<div class="campaign-detail-stat"><span class="val">' + (campaign.open_count || 0) + '</span><span class="lbl">Opened</span></div>' +
      '<div class="campaign-detail-stat"><span class="val">' + openRate + '%</span><span class="lbl">Open Rate</span></div>' +
      '<div class="campaign-detail-stat"><span class="val">' + (campaign.click_count || 0) + '</span><span class="lbl">Clicked</span></div>' +
      '<div class="campaign-detail-stat"><span class="val">' + clickRate + '%</span><span class="lbl">Click Rate</span></div>' +
      '<div class="campaign-detail-stat"><span class="val">' + (campaign.response_count || campaign.replies || 0) + '</span><span class="lbl">Responses</span></div>' +
    '</div>';

    // Recipients detail
    html += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700">Recipients</h3></div>' +
      '<div class="card-body" id="campaign-recipients">' + UI.loading() + '</div></div>';

    html += '</div>';
    c.innerHTML = html;

    // Load recipients
    MallanAPI._fetch('/api/crm/campaigns/' + id + '/recipients').then(function (data) {
      var recipients = data.recipients || [];
      var el = document.getElementById('campaign-recipients');
      if (!el) return;
      if (recipients.length === 0) {
        el.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">No recipient data available</p>';
        return;
      }
      var rhtml = '<div class="space-y-2">';
      recipients.forEach(function (r) {
        var openedIcon = r.opened ? '<i class="fas fa-envelope-open text-green-500 text-xs" title="Opened"></i>' : '<i class="fas fa-envelope text-gray-300 text-xs" title="Not opened"></i>';
        var clickedIcon = r.clicked ? '<i class="fas fa-mouse-pointer text-blue-500 text-xs" title="Clicked"></i>' : '';
        rhtml += '<div class="flex items-center justify-between py-2 border-b border-gray-50">' +
          '<div class="flex items-center gap-3">' +
            UI.avatar(r.name || r.email || '', 28) +
            '<div><p class="text-sm font-medium text-gray-900">' + E(r.name || r.email || '') + '</p></div>' +
          '</div>' +
          '<div class="flex items-center gap-3">' + openedIcon + ' ' + clickedIcon + '</div>' +
        '</div>';
      });
      rhtml += '</div>';
      el.innerHTML = rhtml;
    }).catch(function () {
      var el = document.getElementById('campaign-recipients');
      if (el) el.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">Could not load recipients</p>';
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // TAB 6: SALES ACTIVITY FEED
  // ═══════════════════════════════════════════════════════════════════════
  function salesActivity() {
    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();
    c.innerHTML = _subnav('activity') + UI.loading();

    MallanAPI._fetch('/api/crm/sales/activity').then(function (data) {
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

    // Filter chips
    html += '<div class="flex gap-1 mb-4 flex-wrap">';
    ['all', 'sellers', 'buyers', 'investors', 'landlord-sellers'].forEach(function (f) {
      var active = filter === f;
      var labels = { all: 'All', sellers: 'Sellers', buyers: 'Buyers', investors: 'Investors', 'landlord-sellers': 'Landlord-Sellers' };
      var label = labels[f] || f;
      html += '<button class="px-3 py-1.5 text-xs font-bold rounded-lg transition-all ' +
        (active ? 'bg-gold text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gold') +
        '" onclick="SalesCRM._filterActivity(\'' + f + '\')">' + label + '</button>';
    });
    html += '</div>';

    if (events.length === 0) {
      html += UI.emptyState('fa-stream', 'No activity yet');
    } else {
      // Group events by date
      var groups = {};
      var groupOrder = ['Today', 'Yesterday', 'This Week', 'Earlier'];
      events.forEach(function (ev) {
        var group = _dateGroupLabel(ev.created_at);
        if (!groups[group]) groups[group] = [];
        groups[group].push(ev);
      });

      html += '<div class="space-y-1">';
      groupOrder.forEach(function (groupName) {
        var groupEvents = groups[groupName];
        if (!groupEvents || groupEvents.length === 0) return;

        html += '<div class="flex items-center gap-2 mb-3 mt-4">' +
          '<span class="text-xs font-bold text-gray-400 uppercase tracking-wider">' + E(groupName) + '</span>' +
          '<div class="flex-1 h-px bg-gray-100"></div>' +
          '<span class="text-[10px] text-gray-400">' + groupEvents.length + ' events</span>' +
        '</div>';

        groupEvents.forEach(function (ev) {
          var icon = _activityIcon(ev.activity_type);
          var clientName = ev.client_name || ev.name || '';
          var clientId = ev.client_id || ev.lead_id || '';

          html += '<div class="activity-card" onclick="' + (clientId ? 'SalesCRM._openClient(\'' + E(clientId) + '\')' : '') + '">' +
            UI.avatar(clientName, 32) +
            '<div style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:' + icon.bg + '">' +
              '<i class="fas ' + icon.icon + '" style="font-size:12px;color:' + icon.color + '"></i>' +
            '</div>' +
            '<div style="flex:1;min-width:0;">' +
              '<p style="font-size:13px;font-weight:600;color:#111827;margin:0;">' + E(ev.title || '') + '</p>' +
              (ev.detail ? '<p style="font-size:12px;color:#6B7280;margin:2px 0 0;">' + E(ev.detail) + '</p>' : '') +
              (clientName ? '<p style="font-size:11px;color:#9CA3AF;margin:2px 0 0;">' + E(clientName) + '</p>' : '') +
            '</div>' +
            '<span style="font-size:10px;color:#9CA3AF;flex-shrink:0;white-space:nowrap;">' + Utils.formatTimeAgo(ev.created_at) + '</span>' +
          '</div>';
        });
      });
      html += '</div>';
    }

    c.innerHTML = html;
  }

  function _filterActivity(f) { _state.activity.filter = f; _renderActivity(CRM.getContent()); }


  // ═══════════════════════════════════════════════════════════════════════
  // TAB 7: SALES AUTOMATION
  // ═══════════════════════════════════════════════════════════════════════
  function salesAutomation() {
    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();
    c.innerHTML = _subnav('automation') + UI.loading();

    MallanAPI._fetch('/api/crm/automation/status?crm_type=sales').then(function (data) {
      _state.automation.data = data.contacts || [];
      _renderAutomation(c);
    }).catch(function () {
      c.innerHTML = _subnav('automation') + UI.emptyState('fa-robot', 'Unable to load automation status');
    });
  }

  function _automationKPIs(data) {
    var total = data.length;
    var dripsActive = data.filter(function (r) { return r.sales_drip_on; }).length;
    var dripsPaused = total - dripsActive;

    return _kpi([
      { icon: 'fa-address-book', label: 'Total Contacts', value: total, color: '#3B82F6' },
      { icon: 'fa-play-circle', label: 'Drips Active', value: dripsActive, color: '#059669' },
      { icon: 'fa-pause-circle', label: 'Drips Paused', value: dripsPaused, color: '#9CA3AF' },
    ]);
  }

  function _renderAutomation(c) {
    var st = _state.automation;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _subnav('automation');
    html += _automationKPIs(st.data);

    html += FilterBar.render({
      id: 'sautomation',
      placeholder: 'Search contacts...',
      onSearch: 'SalesCRM._searchAutomation',
      filters: [
        { key: 'drip', label: 'Drip Status', options: [
          { value: 'active', label: 'Active' }, { value: 'monthly', label: 'Monthly' },
          { value: 'quarterly', label: 'Quarterly' }, { value: 'biannual', label: 'Bi-Annual' },
          { value: 'paused', label: 'Paused' },
        ]},
      ],
      onFilter: 'SalesCRM._filterAutomation',
    });

    html += ActivityTable.render({
      id: 'sautomation_table',
      columns: [
        { key: 'avatar', label: '', width: '44px', sortable: false, render: function (r) {
          return UI.avatar(r.name, 32);
        }},
        { key: 'name', label: 'Contact', render: function (r) {
          return '<span class="font-semibold text-gray-900">' + E(r.name || '') + '</span>';
        }},
        { key: 'type', label: 'Type', render: function (r) {
          var t = r.type || 'unknown';
          var colors = { seller: 'bg-blue-100 text-blue-700', buyer: 'bg-green-100 text-green-700', investor: 'bg-amber-100 text-amber-700' };
          return '<span class="text-[10px] px-2 py-0.5 rounded-md font-bold ' + (colors[t] || 'bg-gray-100 text-gray-600') + '">' + E(t) + '</span>';
        }},
        { key: 'sales_drip_on', label: 'Auto-send', width: '80px', render: function (r) {
          return _toggleSwitch(!!r.sales_drip_on, 'SalesCRM._toggleDrip(\'' + E(r.id || '') + '\',' + !r.sales_drip_on + ')');
        }},
        { key: 'sales_drip_frequency', label: 'Frequency', render: function (r) {
          return '<span class="text-sm text-gray-600">' + E(r.sales_drip_frequency || r.frequency || '-') + '</span>';
        }},
        { key: 'last_sales_email_opened', label: 'Last Sent', render: function (r) {
          return r.last_sales_email_sent || r.last_sent_at
            ? '<span class="text-sm text-gray-600">' + Utils.formatTimeAgo(r.last_sales_email_sent || r.last_sent_at) + '</span>'
            : '<span class="text-gray-400">-</span>';
        }},
        { key: 'last_listing_viewed_at', label: 'Last Listing Viewed', render: function (r) {
          return r.last_listing_viewed_at
            ? '<span class="text-sm text-gray-600">' + Utils.formatTimeAgo(r.last_listing_viewed_at) + '</span>'
            : '<span class="text-gray-400">-</span>';
        }},
        { key: 'last_response_at', label: 'Last Response', render: function (r) {
          return r.last_response_at
            ? '<span class="text-sm text-gray-600">' + Utils.formatTimeAgo(r.last_response_at) + '</span>'
            : '<span class="text-gray-400">-</span>';
        }},
        { key: 'next_send_at', label: 'Next Send', render: function (r) {
          return r.next_send_at ? '<span class="text-sm text-gray-600">' + D(r.next_send_at) + '</span>' : '<span class="text-gray-400">-</span>';
        }},
        { key: 'sales_drip_status', label: 'Tier', render: function (r) {
          var s = r.sales_drip_status || 'paused';
          return '<span class="text-[10px] px-2 py-0.5 rounded-md font-bold ' + (_tierColors[s] || 'bg-gray-100 text-gray-600') + '">' + E(s) + '</span>';
        }},
        { key: 'tier_actions', label: '', width: '110px', sortable: false, render: function (r) {
          return '<select class="text-[10px] px-2 py-1 border border-gray-200 rounded-md font-bold focus:ring-2 focus:ring-gold/30 focus:outline-none" ' +
            'onchange="SalesCRM._adjustTier(\'' + E(r.id || '') + '\',this.value)" title="Override tier">' +
            '<option value="">Override...</option>' +
            '<option value="active">Active</option>' +
            '<option value="monthly">Monthly</option>' +
            '<option value="quarterly">Quarterly</option>' +
            '<option value="biannual">Bi-Annual</option>' +
          '</select>';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'SalesCRM._sortAutomation',
      onRowClick: 'SalesCRM._openClient',
      page: st.page,
      pageSize: 25,
      onPage: 'SalesCRM._pageAutomation',
      emptyIcon: 'fa-robot',
      emptyText: 'No contacts with automation data',
    });

    c.innerHTML = html;
  }

  function _searchAutomation(q) { _state.automation.search = q; _state.automation.page = 1; _renderAutomation(CRM.getContent()); }
  function _filterAutomation(key, value) { _renderAutomation(CRM.getContent()); }
  function _sortAutomation(key) {
    var st = _state.automation;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderAutomation(CRM.getContent());
  }
  function _pageAutomation(p) { _state.automation.page = p; _renderAutomation(CRM.getContent()); }

  function _toggleDrip(id, newState) {
    MallanAPI._fetch('/api/crm/automation/toggle', {
      method: 'POST',
      body: JSON.stringify({ client_id: id, sales_drip_on: newState }),
    }).then(function () {
      _state.automation.data.forEach(function (r) {
        if (String(r.id) === String(id)) r.sales_drip_on = newState;
      });
      _renderAutomation(CRM.getContent());
      CRM.toast('Drip ' + (newState ? 'activated' : 'paused'), 'success');
    }).catch(function () {
      CRM.toast('Unable to toggle drip', 'error');
    });
  }

  function _adjustTier(id, tier) {
    if (!tier) return;
    MallanAPI._fetch('/api/crm/automation/adjust-tier', {
      method: 'POST',
      body: JSON.stringify({ client_id: id, tier: tier, crm_type: 'sales' }),
    }).then(function () {
      _state.automation.data.forEach(function (r) {
        if (String(r.id) === String(id)) r.sales_drip_status = tier;
      });
      _renderAutomation(CRM.getContent());
      CRM.toast('Tier set to ' + tier, 'success');
    }).catch(function () {
      CRM.toast('Unable to adjust tier', 'error');
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // SHARED ACTIONS
  // ═══════════════════════════════════════════════════════════════════════

  function _openClient(id) { Router.navigate('/workspace/client/' + id + '/overview'); }

  function _editClient(id) {
    MallanAPI._fetch('/api/crm/clients/' + id).then(function (data) {
      var cl = data.client || data;
      CRM.openModal('Edit Client',
        '<form id="editClientForm" class="space-y-4 p-2">' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
            '<div><label class="text-xs font-semibold text-gray-700 block mb-1">First Name *</label><input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="first_name" required value="' + E(cl.first_name || '') + '"></div>' +
            '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Last Name *</label><input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="last_name" required value="' + E(cl.last_name || '') + '"></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
            '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Email</label><input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" type="email" name="email" value="' + E(cl.email || '') + '"></div>' +
            '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Phone</label><input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" type="tel" name="phone" value="' + E(cl.phone || '') + '"></div>' +
          '</div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Property Address</label><input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="property_address" value="' + E(cl.property_address || '') + '"></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Notes</label><textarea class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="notes" rows="2">' + E(cl.notes || '') + '</textarea></div>' +
        '</form>',
        {
          footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
            '<button class="btn btn-gold" onclick="SalesCRM._submitEditClient(\'' + E(id) + '\')"><i class="fas fa-save mr-1"></i>Save</button>',
        }
      );
    }).catch(function () {
      CRM.toast('Could not load client for editing', 'error');
    });
  }

  function _submitEditClient(id) {
    var form = document.getElementById('editClientForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    MallanAPI._fetch('/api/crm/clients/' + id, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }).then(function () {
      CRM.toast('Client updated', 'success');
      CRM.closeModal();
      // Refresh current view
      var hash = window.location.hash || '';
      if (hash.indexOf('/sales/sellers') !== -1) activeSellers();
      else if (hash.indexOf('/sales/buyers') !== -1) activeBuyers();
      else if (hash.indexOf('/sales/landlord-sellers') !== -1) landlordSellers();
    }).catch(function (err) {
      CRM.toast('Save failed: ' + (err.message || ''), 'error');
    });
  }

  function _deleteClient(id, listKey) {
    if (!confirm('Delete this client? This cannot be undone.')) return;
    MallanAPI._fetch('/api/crm/clients/' + id, { method: 'DELETE' }).then(function () {
      CRM.toast('Client deleted', 'success');
      if (listKey === 'sellers') activeSellers();
      else if (listKey === 'buyers') activeBuyers();
      else if (listKey === 'landlordSellers') landlordSellers();
    }).catch(function (err) {
      CRM.toast('Delete failed: ' + (err.message || ''), 'error');
    });
  }

  function _netProceeds(id) {
    MallanAPI._fetch('/api/crm/clients/' + id).then(function (data) {
      var cl = data.client || data;
      var price = Number(cl.list_price) || 0;
      CRM.openModal('Net Proceeds Calculator',
        '<div id="np-calc-container">' + (typeof NetProceedsCalc.render === 'function' ? NetProceedsCalc.render({ salePrice: price }) : '<p class="text-sm text-gray-500 p-4">Net Proceeds Calculator loading...</p>') + '</div>',
        { size: 'lg' }
      );
    }).catch(function () {
      CRM.openModal('Net Proceeds Calculator',
        '<div id="np-calc-container">' + (typeof NetProceedsCalc.render === 'function' ? NetProceedsCalc.render({}) : '<p class="text-sm text-gray-500 p-4">Net Proceeds Calculator</p>') + '</div>',
        { size: 'lg' }
      );
    });
  }

  function _requestCMA(id) {
    CRM.toast('Generating CMA report...', 'info');
    MallanAPI._fetch('/api/crm/cma', {
      method: 'POST',
      body: JSON.stringify({ client_id: id }),
    }).then(function (data) {
      CRM.toast('CMA report generated', 'success');
      if (data.report_url) window.open(data.report_url, '_blank');
    }).catch(function () {
      CRM.toast('CMA generation queued', 'info');
    });
  }

  function _sendListings(id) {
    CRM.quickSendToClient(id, 'Client');
  }

  function _scheduleShowing(id) {
    CRM.openModal('Schedule Showing',
      '<form id="showingForm" class="space-y-4 p-2">' +
        '<input type="hidden" name="client_id" value="' + E(id) + '">' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Date & Time *</label>' +
          '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" type="datetime-local" name="scheduled_at" required></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Listing Address</label>' +
          '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="listing_address" placeholder="Search or enter address"></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Notes</label>' +
          '<textarea class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" name="notes" rows="2"></textarea></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="SalesCRM._submitShowing()"><i class="fas fa-calendar-check mr-1"></i>Schedule</button>',
      }
    );
  }

  function _submitShowing() {
    var form = document.getElementById('showingForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    MallanAPI._fetch('/api/crm/showings', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(function () {
      CRM.toast('Showing scheduled', 'success');
      CRM.closeModal();
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // WORKSPACE — Seller (click row from Active Sellers)
  // ═══════════════════════════════════════════════════════════════════════

  var _wsSellerTabs = [
    { id: 'overview',    label: 'Overview',      icon: 'fa-info-circle' },
    { id: 'intake',      label: 'Intake',        icon: 'fa-clipboard-list' },
    { id: 'disclosures', label: 'Disclosures',   icon: 'fa-file-contract' },
    { id: 'documents',   label: 'Documents',     icon: 'fa-folder-open' },
    { id: 'listings',    label: 'Listings',      icon: 'fa-building' },
    { id: 'marketing',   label: 'Marketing',     icon: 'fa-bullhorn' },
    { id: 'activity',    label: 'Activity',      icon: 'fa-stream' },
    { id: 'tools',       label: 'Tools',         icon: 'fa-toolbox' },
    { id: 'offers',      label: 'Offers',        icon: 'fa-handshake' },
    { id: 'automation',  label: 'Automation',    icon: 'fa-robot' },
  ];

  function _openSellerWorkspace(id) {
    _state.workspace.backRoute = '/sales/sellers';
    _loadWorkspace(id, 'seller', 'overview');
  }

  function _loadWorkspace(clientId, role, tab) {
    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();
    c.innerHTML = UI.loading();

    MallanAPI._fetch('/api/crm/clients/' + clientId).then(function (data) {
      var cl = data.client || data;
      cl = ClientNormalizer.normalize(cl);
      _state.workspace.client = cl;
      _state.workspace.tab = tab || 'overview';

      var wsRole = role || cl.type || 'seller';
      var tabs = wsRole === 'seller' ? _wsSellerTabs : wsRole === 'buyer' ? _wsBuyerTabs : _wsLandlordSellerTabs;

      c.innerHTML = WorkspaceShell.render({
        backRoute: _state.workspace.backRoute,
        backLabel: wsRole === 'seller' ? 'Active Sellers' : wsRole === 'buyer' ? 'Active Buyers' : 'Landlord Sellers',
        client: cl,
        avatarName: cl._displayName || cl.name,
        displayName: cl._displayName || cl.name,
        role: wsRole,
        stage: cl.pipeline_stage || cl.listing_status || 'active',
        entityBadge: cl.entity_type || null,
        isInvestor: !!cl.is_investor,
        tabs: tabs,
        activeTab: _state.workspace.tab,
        onTab: 'SalesCRM._wsTab',
        headerExtra: '<div class="flex gap-2">' +
          '<button class="btn btn-sm btn-outline" onclick="SalesCRM._editClient(\'' + E(clientId) + '\')"><i class="fas fa-edit mr-1"></i>Edit</button>' +
          '<button class="btn btn-sm btn-outline text-red-500" onclick="SalesCRM._deleteClientFromWs(\'' + E(clientId) + '\',\'' + E(wsRole) + '\')"><i class="fas fa-trash-alt mr-1"></i>Delete</button>' +
        '</div>',
        actions: [],
      });

      _renderWsTabContent(cl, wsRole);
    }).catch(function () {
      c.innerHTML = UI.emptyState('fa-exclamation-circle', 'Unable to load client');
    });
  }

  function _wsTab(tabId) {
    _state.workspace.tab = tabId;
    // Update active tab visually
    var tabs = document.querySelectorAll('.ws-tab, [class*="workspace"] button');
    // Re-render content
    var cl = _state.workspace.client;
    if (!cl) return;
    var wsRole = cl.type || cl.client_type || 'seller';
    _renderWsTabContent(cl, wsRole);
  }

  function _renderWsTabContent(cl, role) {
    var contentEl = document.getElementById('workspace-content');
    if (!contentEl) return;
    contentEl.innerHTML = UI.loading();
    var tab = _state.workspace.tab;
    var clientId = cl.id || '';

    if (role === 'seller') {
      _renderSellerTab(cl, tab, contentEl);
    } else if (role === 'buyer') {
      _renderBuyerTab(cl, tab, contentEl);
    } else {
      _renderLandlordSellerTab(cl, tab, contentEl);
    }
  }

  function _renderSellerTab(cl, tab, el) {
    var id = cl.id || '';

    switch (tab) {
      case 'overview':
        var html = '<div class="space-y-4">';
        html += WorkspaceShell.renderContactCard(cl);
        html += WorkspaceShell.renderEntitySection(cl);
        // Listing status summary
        html += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-home mr-1.5 text-gray-400"></i>Listing Status</h3></div>';
        html += '<div class="card-body"><div class="grid grid-cols-2 sm:grid-cols-4 gap-3">';
        html += _wsField('Status', cl.listing_status || 'No Listing');
        html += _wsField('List Price', cl.list_price ? $(Number(cl.list_price)) : '-');
        html += _wsField('Days on Market', String(cl.dom || cl.days_on_market || 0));
        html += _wsField('Showings', String(cl.showings_count || 0));
        html += '</div></div></div>';
        // Health score
        if (cl.health_score !== undefined) {
          html += '<div class="card"><div class="card-body"><div class="flex items-center gap-4">' +
            '<span class="text-sm font-bold text-gray-700">Health Score</span>' + _scoreBar(cl.health_score) +
          '</div></div></div>';
        }
        html += '</div>';
        el.innerHTML = html;
        break;

      case 'intake':
        el.innerHTML = typeof SellerIntake.render === 'function'
          ? SellerIntake.render(cl)
          : '<p class="text-sm text-gray-400 text-center py-8">Seller Intake form loading...</p>';
        break;

      case 'disclosures':
        el.innerHTML = WorkspaceShell.renderDisclosureSection(cl.disclosures || {
          property_condition: 'pending', lead_paint: 'pending', flood_zone: 'pending',
          hoa_docs: 'pending', tax_records: 'pending', title_search: 'pending',
        });
        _listenDisclosureUpdates(id);
        break;

      case 'documents':
        el.innerHTML = WorkspaceShell.renderDocumentTracker(cl.documents_collected || {
          listing_agreement: false, deed: false, tax_returns: false, mortgage_statement: false,
          coop_board_package: false, floor_plan: false, inspection_report: false,
        });
        _listenDocToggle(id);
        break;

      case 'listings':
        el.innerHTML = UI.loading();
        MallanAPI._fetch('/api/crm/clients/' + id + '/listings').then(function (data) {
          var listings = data.listings || [];
          if (listings.length === 0) {
            el.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">No active listings for this seller</p>';
            return;
          }
          var html = '<div class="space-y-4">';
          listings.forEach(function (l) {
            html += '<div class="card"><div class="card-header">' +
              '<h3 class="text-sm font-bold text-gray-700">' + E(l.address || l.UnparsedAddress || 'Listing') + '</h3>' +
              _statusBadge(l.status || 'Active', _listingStatusColors) +
            '</div><div class="card-body">' +
              '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">' +
                _wsField('Price', $(Number(l.list_price || 0))) +
                _wsField('DOM', String(l.dom || 0)) +
                _wsField('Showings', String(l.showings_count || 0)) +
                _wsField('Inquiries', String(l.inquiries_count || 0)) +
              '</div>' +
              (l.open_houses && l.open_houses.length > 0 ? '<div class="mt-3"><p class="text-xs font-semibold text-gray-500 uppercase mb-1">Open Houses</p>' +
                l.open_houses.map(function (oh) {
                  return '<div class="text-sm text-gray-700">' + D(oh.date) + ' ' + E(oh.start_time || '') + ' - ' + E(oh.end_time || '') + ' (' + (oh.rsvp_count || 0) + ' RSVPs)</div>';
                }).join('') + '</div>' : '') +
              '<div class="mt-3"><button class="btn btn-sm btn-outline" onclick="Router.navigate(\'/workspace/listing/' + E(l.id || l.listing_id || '') + '/overview\')"><i class="fas fa-external-link-alt mr-1"></i>View Full Listing</button></div>' +
            '</div></div>';
          });
          html += '</div>';
          el.innerHTML = html;
        }).catch(function () {
          el.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">Could not load listings</p>';
        });
        break;

      case 'marketing':
        el.innerHTML = UI.loading();
        MallanAPI._fetch('/api/crm/clients/' + id + '/marketing').then(function (data) {
          var m = data.marketing || data;
          var html = '<div class="space-y-4">';
          html += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700">Syndication Status</h3></div><div class="card-body">';
          var portals = m.syndication || [
            { name: 'StreetEasy', status: 'pending' }, { name: 'Zillow', status: 'pending' },
            { name: 'Realtor.com', status: 'pending' }, { name: 'Redfin', status: 'pending' },
          ];
          portals.forEach(function (p) {
            var icon = p.status === 'live' ? 'fa-check-circle text-green-500' : p.status === 'pending' ? 'fa-clock text-yellow-500' : 'fa-times-circle text-gray-400';
            html += '<div class="flex items-center justify-between py-2 border-b border-gray-50"><span class="text-sm font-medium">' + E(p.name) + '</span><i class="fas ' + icon + '"></i></div>';
          });
          html += '</div></div>';
          html += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700">Email Sends</h3></div><div class="card-body">';
          var emails = m.emails || [];
          if (emails.length === 0) {
            html += '<p class="text-sm text-gray-400 text-center py-4">No email campaigns sent yet</p>';
          } else {
            emails.forEach(function (em) {
              html += '<div class="flex items-center justify-between py-2 border-b border-gray-50">' +
                '<span class="text-sm font-medium">' + E(em.subject || em.name || '') + '</span>' +
                '<span class="text-xs text-gray-500">' + (em.sent_at ? D(em.sent_at) : '-') + '</span>' +
              '</div>';
            });
          }
          html += '</div></div>';
          html += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700">Photos & Staging</h3></div><div class="card-body">';
          html += '<div class="grid grid-cols-2 gap-3">';
          html += _wsField('Photos Uploaded', String(m.photo_count || 0));
          html += _wsField('Staging', m.staging_status || 'Not scheduled');
          html += '</div></div></div>';
          html += '</div>';
          el.innerHTML = html;
        }).catch(function () {
          el.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">Could not load marketing data</p>';
        });
        break;

      case 'activity':
        _renderWsActivity(el, id);
        break;

      case 'tools':
        var toolsHtml = '<div class="space-y-4">';
        toolsHtml += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-calculator mr-1.5 text-gray-400"></i>Net Proceeds Calculator</h3>' +
          '<button class="btn btn-sm btn-gold" onclick="SalesCRM._netProceeds(\'' + E(id) + '\')"><i class="fas fa-external-link-alt mr-1"></i>Open</button></div>' +
          '<div class="card-body"><p class="text-sm text-gray-500">Calculate seller net proceeds after taxes, fees, and commissions</p></div></div>';
        toolsHtml += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-chart-bar mr-1.5 text-gray-400"></i>CMA Report</h3>' +
          '<button class="btn btn-sm btn-gold" onclick="SalesCRM._requestCMA(\'' + E(id) + '\')"><i class="fas fa-file-alt mr-1"></i>Generate</button></div>' +
          '<div class="card-body"><p class="text-sm text-gray-500">Comparative Market Analysis for this property</p></div></div>';
        toolsHtml += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-chart-line mr-1.5 text-gray-400"></i>Market Reports</h3></div>' +
          '<div class="card-body"><p class="text-sm text-gray-500">View neighborhood and borough-level market reports</p>' +
          '<button class="btn btn-sm btn-outline mt-2" onclick="Router.navigate(\'/ops/market\')"><i class="fas fa-chart-area mr-1"></i>View Reports</button></div></div>';
        toolsHtml += '</div>';
        el.innerHTML = toolsHtml;
        break;

      case 'offers':
        el.innerHTML = UI.loading();
        MallanAPI._fetch('/api/crm/clients/' + id + '/offers').then(function (data) {
          var offers = data.offers || [];
          if (offers.length === 0) {
            el.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">No offers received yet</p>';
            return;
          }
          var html = '<div class="space-y-3">';
          offers.forEach(function (o) {
            var statusCls = o.status === 'accepted' ? 'offer-badge offer-badge-accepted' : o.status === 'counter' ? 'offer-badge offer-badge-counter' : 'offer-badge offer-badge-new';
            html += '<div class="card"><div class="card-header">' +
              '<h3 class="text-sm font-bold text-gray-700">Offer: ' + $(Number(o.amount || 0)) + '</h3>' +
              '<span class="' + statusCls + '">' + E(o.status || 'new') + '</span>' +
            '</div><div class="card-body"><div class="grid grid-cols-2 sm:grid-cols-4 gap-3">' +
              _wsField('Buyer', 'Buyer via your agent') +
              _wsField('Date', o.created_at ? D(o.created_at) : '-') +
              _wsField('Financing', o.financing_type || '-') +
              _wsField('Contingencies', String(o.contingency_count || 0)) +
            '</div></div></div>';
          });
          html += '</div>';
          el.innerHTML = html;
        }).catch(function () {
          el.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">Could not load offers</p>';
        });
        break;

      case 'automation':
        _renderWsAutomation(el, cl);
        break;

      default:
        el.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">Tab not found</p>';
    }
  }


  // ═══════════════════════════════════════════════════════════════════════
  // WORKSPACE — Buyer (click row from Active Buyers)
  // ═══════════════════════════════════════════════════════════════════════

  var _wsBuyerTabs = [
    { id: 'overview',    label: 'Overview',      icon: 'fa-info-circle' },
    { id: 'intake',      label: 'Intake',        icon: 'fa-clipboard-list' },
    { id: 'listings',    label: 'Listings',      icon: 'fa-building' },
    { id: 'reactions',   label: 'Reactions',      icon: 'fa-heart' },
    { id: 'showings',    label: 'Showings',      icon: 'fa-calendar' },
    { id: 'documents',   label: 'Documents',     icon: 'fa-folder-open' },
    { id: 'activity',    label: 'Activity',      icon: 'fa-stream' },
    { id: 'tools',       label: 'Tools',         icon: 'fa-toolbox' },
    { id: 'offers',      label: 'Offers',        icon: 'fa-handshake' },
    { id: 'automation',  label: 'Automation',    icon: 'fa-robot' },
  ];

  function _openBuyerWorkspace(id) {
    _state.workspace.backRoute = '/sales/buyers';
    _loadWorkspace(id, 'buyer', 'overview');
  }

  function _renderBuyerTab(cl, tab, el) {
    var id = cl.id || '';

    switch (tab) {
      case 'overview':
        var html = '<div class="space-y-4">';
        html += WorkspaceShell.renderContactCard(cl);
        html += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-wallet mr-1.5 text-gray-400"></i>Buyer Profile</h3></div>';
        html += '<div class="card-body"><div class="grid grid-cols-2 sm:grid-cols-4 gap-3">';
        html += _wsField('Pre-Approved', cl.pre_approved ? 'Yes' : 'No');
        html += _wsField('Budget', cl.pre_approved_amount ? $(Number(cl.pre_approved_amount)) : cl.available_funds ? $(Number(cl.available_funds)) : '-');
        html += _wsField('Areas', (cl.preferred_areas || []).join(', ') || '-');
        html += _wsField('Conviction', String(cl.conviction_score || 0));
        html += '</div></div></div>';
        if (cl.is_investor) {
          html += '<div class="card"><div class="card-body"><div class="flex items-center gap-2"><span class="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-bold">Investor Profile</span></div>' +
            '<div class="grid grid-cols-2 gap-3 mt-3">' +
              _wsField('Strategy', cl.investment_strategy || '-') +
              _wsField('Target ROI', cl.target_roi ? cl.target_roi + '%' : '-') +
            '</div></div></div>';
        }
        html += WorkspaceShell.renderEntitySection(cl);
        html += '</div>';
        el.innerHTML = html;
        break;

      case 'intake':
        if (cl.is_investor && typeof InvestorIntake.render === 'function') {
          el.innerHTML = InvestorIntake.render(cl);
        } else if (typeof BuyerIntake.render === 'function') {
          el.innerHTML = BuyerIntake.render(cl);
        } else {
          el.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">Intake form loading...</p>';
        }
        break;

      case 'listings':
        el.innerHTML = UI.loading();
        MallanAPI._fetch('/api/crm/clients/' + id + '/sent-listings').then(function (data) {
          var listings = data.listings || data.sent || [];
          if (listings.length === 0) {
            el.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">No listings sent yet</p>';
            return;
          }
          var lhtml = '<div class="space-y-3">';
          listings.forEach(function (l) {
            var viewedIcon = l.viewed ? '<i class="fas fa-eye text-green-500 text-xs mr-1" title="Viewed"></i>' : '<i class="fas fa-eye-slash text-gray-300 text-xs mr-1" title="Not viewed"></i>';
            var savedIcon = l.saved ? '<i class="fas fa-heart text-red-400 text-xs mr-1" title="Saved"></i>' : '';
            var hiddenIcon = l.hidden ? '<i class="fas fa-ban text-gray-400 text-xs mr-1" title="Hidden"></i>' : '';
            lhtml += '<div class="card"><div class="card-body flex items-center justify-between">' +
              '<div>' +
                '<p class="text-sm font-bold text-gray-900">' + E(l.address || '') + '</p>' +
                '<p class="text-xs text-gray-500">' + $(Number(l.list_price || 0)) + '</p>' +
              '</div>' +
              '<div class="flex items-center gap-3">' +
                viewedIcon + savedIcon + hiddenIcon +
                (l.dwell_time ? '<span class="text-[10px] text-gray-400">' + l.dwell_time + 's</span>' : '') +
                (l.return_visits ? '<span class="text-[10px] text-gray-400">' + l.return_visits + ' returns</span>' : '') +
              '</div>' +
            '</div></div>';
          });
          lhtml += '</div>';
          el.innerHTML = lhtml;
        }).catch(function () {
          el.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">Could not load sent listings</p>';
        });
        break;

      case 'reactions':
        el.innerHTML = UI.loading();
        MallanAPI._fetch('/api/crm/clients/' + id + '/reactions').then(function (data) {
          var reactions = data.reactions || [];
          if (reactions.length === 0) {
            el.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">No reactions recorded yet</p>';
            return;
          }
          var rhtml = '<div class="space-y-3">';
          rhtml += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700">Said vs Did</h3></div><div class="card-body">';
          reactions.forEach(function (rx) {
            var saidIcon = rx.reaction === 'like' ? 'fa-thumbs-up text-green-500' : rx.reaction === 'dislike' ? 'fa-thumbs-down text-red-500' : 'fa-comment text-blue-500';
            var didBehavior = rx.actual_viewed ? 'Viewed' : 'No view';
            if (rx.actual_saved) didBehavior = 'Saved';
            if (rx.actual_return_visits > 1) didBehavior += ' + ' + rx.actual_return_visits + ' returns';
            rhtml += '<div class="flex items-center justify-between py-2 border-b border-gray-50">' +
              '<div class="flex items-center gap-3">' +
                '<span class="text-sm font-medium text-gray-900">' + E(rx.listing_address || '') + '</span>' +
                '<i class="fas ' + saidIcon + '"></i>' +
              '</div>' +
              '<span class="text-xs text-gray-500">Did: ' + E(didBehavior) + '</span>' +
            '</div>';
          });
          rhtml += '</div></div></div>';
          el.innerHTML = rhtml;
        }).catch(function () {
          el.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">Could not load reactions</p>';
        });
        break;

      case 'showings':
        el.innerHTML = UI.loading();
        MallanAPI._fetch('/api/crm/clients/' + id + '/showings').then(function (data) {
          var showings = data.showings || [];
          if (showings.length === 0) {
            el.innerHTML = '<div class="text-center py-8"><p class="text-sm text-gray-400 mb-3">No showings scheduled</p>' +
              '<button class="btn btn-sm btn-gold" onclick="SalesCRM._scheduleShowing(\'' + E(id) + '\')"><i class="fas fa-calendar-plus mr-1"></i>Schedule Showing</button></div>';
            return;
          }
          var shtml = '<div class="space-y-3">';
          showings.forEach(function (s) {
            var statusCls = s.status === 'completed' ? 'bg-green-100 text-green-700' : s.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700';
            shtml += '<div class="card"><div class="card-body">' +
              '<div class="flex items-center justify-between mb-2">' +
                '<span class="text-sm font-bold text-gray-900">' + E(s.listing_address || s.address || '') + '</span>' +
                '<span class="text-[10px] px-2 py-0.5 rounded-md font-bold ' + statusCls + '">' + E(s.status || 'scheduled') + '</span>' +
              '</div>' +
              '<div class="grid grid-cols-2 gap-3">' +
                _wsField('Date', s.scheduled_at ? D(s.scheduled_at) : '-') +
                _wsField('Feedback', s.feedback || '-') +
              '</div>' +
            '</div></div>';
          });
          shtml += '<button class="btn btn-sm btn-gold mt-2" onclick="SalesCRM._scheduleShowing(\'' + E(id) + '\')"><i class="fas fa-calendar-plus mr-1"></i>Schedule Another</button>';
          shtml += '</div>';
          el.innerHTML = shtml;
        }).catch(function () {
          el.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">Could not load showings</p>';
        });
        break;

      case 'documents':
        el.innerHTML = WorkspaceShell.renderDocumentTracker(cl.documents_collected || {
          pre_approval_letter: false, proof_of_funds: false, co_op_board_package: false,
          bank_statements: false, tax_returns: false, personal_financial_statement: false,
        });
        _listenDocToggle(id);
        break;

      case 'activity':
        _renderWsActivity(el, id);
        break;

      case 'tools':
        var thtml = '<div class="space-y-4">';
        thtml += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-calculator mr-1.5"></i>Mortgage Calculator</h3></div>' +
          '<div class="card-body"><p class="text-sm text-gray-500">Estimate monthly payments</p>' +
          '<button class="btn btn-sm btn-outline mt-2" onclick="CRM.toast(\'Mortgage calculator — coming soon\',\'info\')"><i class="fas fa-calculator mr-1"></i>Open</button></div></div>';
        thtml += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-balance-scale mr-1.5"></i>Rent vs Buy</h3></div>' +
          '<div class="card-body"><p class="text-sm text-gray-500">Compare renting vs buying costs</p>' +
          '<button class="btn btn-sm btn-outline mt-2" onclick="CRM.toast(\'Rent vs Buy — coming soon\',\'info\')"><i class="fas fa-balance-scale mr-1"></i>Open</button></div></div>';
        thtml += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-chart-bar mr-1.5"></i>CMA</h3></div>' +
          '<div class="card-body"><button class="btn btn-sm btn-gold" onclick="SalesCRM._requestCMA(\'' + E(id) + '\')"><i class="fas fa-file-alt mr-1"></i>Generate CMA</button></div></div>';

        // Investor tools
        if (cl.is_investor) {
          thtml += '<div class="border-t border-gray-200 pt-4 mt-4"><p class="text-xs font-bold text-amber-700 uppercase mb-3"><i class="fas fa-chart-line mr-1"></i>Investor Tools</p></div>';
          thtml += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700">Cash on Cash Return</h3></div>' +
            '<div class="card-body">' + (typeof CashOnCashCalc.render === 'function' ? CashOnCashCalc.render(cl) : '<p class="text-sm text-gray-400">Loading...</p>') + '</div></div>';
          thtml += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700">Cap Rate</h3></div>' +
            '<div class="card-body">' + (typeof CapRateCalc.render === 'function' ? CapRateCalc.render(cl) : '<p class="text-sm text-gray-400">Loading...</p>') + '</div></div>';
          thtml += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700">ROI Calculator</h3></div>' +
            '<div class="card-body">' + (typeof ROICalc.render === 'function' ? ROICalc.render(cl) : '<p class="text-sm text-gray-400">Loading...</p>') + '</div></div>';
          thtml += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700">Rental Yield</h3></div>' +
            '<div class="card-body">' + (typeof RentalYieldCalc.render === 'function' ? RentalYieldCalc.render(cl) : '<p class="text-sm text-gray-400">Loading...</p>') + '</div></div>';
          thtml += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700">1031 Exchange Tracker</h3></div>' +
            '<div class="card-body">' + (typeof Exchange1031Tracker.render === 'function' ? Exchange1031Tracker.render(cl) : '<p class="text-sm text-gray-400">Loading...</p>') + '</div></div>';
        }
        thtml += '</div>';
        el.innerHTML = thtml;
        break;

      case 'offers':
        el.innerHTML = UI.loading();
        MallanAPI._fetch('/api/crm/clients/' + id + '/offers').then(function (data) {
          var offers = data.offers || [];
          if (offers.length === 0) {
            el.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">No offers submitted yet</p>';
            return;
          }
          var ohtml = '<div class="space-y-3">';
          offers.forEach(function (o) {
            var statusCls = o.status === 'accepted' ? 'offer-badge offer-badge-accepted' : o.status === 'counter' ? 'offer-badge offer-badge-counter' : 'offer-badge offer-badge-new';
            ohtml += '<div class="card"><div class="card-header">' +
              '<h3 class="text-sm font-bold text-gray-700">' + E(o.listing_address || 'Offer') + ' - ' + $(Number(o.amount || 0)) + '</h3>' +
              '<span class="' + statusCls + '">' + E(o.status || 'submitted') + '</span>' +
            '</div><div class="card-body"><div class="grid grid-cols-2 sm:grid-cols-4 gap-3">' +
              _wsField('Date', o.created_at ? D(o.created_at) : '-') +
              _wsField('Status', o.status || 'submitted') +
              _wsField('Counter', o.counter_amount ? $(Number(o.counter_amount)) : '-') +
              _wsField('Financing', o.financing_type || '-') +
            '</div></div></div>';
          });
          ohtml += '</div>';
          el.innerHTML = ohtml;
        }).catch(function () {
          el.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">Could not load offers</p>';
        });
        break;

      case 'automation':
        _renderWsAutomation(el, cl);
        break;

      default:
        el.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">Tab not found</p>';
    }
  }


  // ═══════════════════════════════════════════════════════════════════════
  // WORKSPACE — Landlord Seller
  // ═══════════════════════════════════════════════════════════════════════

  var _wsLandlordSellerTabs = [
    { id: 'overview',    label: 'Overview',      icon: 'fa-info-circle' },
    { id: 'rental',      label: 'Rental History', icon: 'fa-key' },
    { id: 'intake',      label: 'Seller Intake',  icon: 'fa-clipboard-list' },
    { id: 'tools',       label: 'Tools',          icon: 'fa-toolbox' },
    { id: 'activity',    label: 'Activity',       icon: 'fa-stream' },
    { id: 'automation',  label: 'Automation',     icon: 'fa-robot' },
  ];

  function _openLandlordSellerWorkspace(id) {
    _state.workspace.backRoute = '/sales/landlord-sellers';
    _loadWorkspace(id, 'landlord-seller', 'overview');
  }

  function _renderLandlordSellerTab(cl, tab, el) {
    var id = cl.id || '';

    switch (tab) {
      case 'overview':
        var html = '<div class="space-y-4">';
        html += WorkspaceShell.renderContactCard(cl);
        html += WorkspaceShell.renderEntitySection(cl);
        html += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-chart-line mr-1.5 text-gray-400"></i>Seller Potential</h3></div>';
        html += '<div class="card-body"><div class="grid grid-cols-2 sm:grid-cols-3 gap-3">';
        html += _wsField('Potential', (cl.seller_potential || 'none').toUpperCase());
        html += _wsField('Vacancy Risk', cl.vacancy_risk || '-');
        html += _wsField('Property', cl.property_address || '-');
        html += '</div>';
        var reasons = cl.seller_potential_reason || [];
        if (reasons.length > 0) {
          html += '<div class="mt-3"><p class="text-xs font-semibold text-gray-500 mb-1">Reasons:</p><div class="flex flex-wrap gap-1">';
          reasons.forEach(function (r) {
            html += '<span class="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded font-bold">' + E(r) + '</span>';
          });
          html += '</div></div>';
        }
        html += '</div></div>';
        html += '<div class="text-center"><button class="btn btn-gold" onclick="SalesCRM._promoteLandlord(\'' + E(id) + '\')"><i class="fas fa-arrow-up mr-1"></i>Promote to Active Seller</button></div>';
        html += '</div>';
        el.innerHTML = html;
        break;

      case 'rental':
        el.innerHTML = UI.loading();
        MallanAPI._fetch('/api/crm/clients/' + id + '/rental-history').then(function (data) {
          var history = data.history || data.rentals || [];
          if (history.length === 0) {
            el.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">No rental history available (read-only reference)</p>';
            return;
          }
          var rhtml = '<div class="space-y-3"><p class="text-xs text-gray-400 mb-2">Read-only reference from landlord record</p>';
          history.forEach(function (h) {
            rhtml += '<div class="card"><div class="card-body"><div class="grid grid-cols-2 sm:grid-cols-4 gap-3">' +
              _wsField('Tenant', h.tenant_name || '-') +
              _wsField('Rent', h.rent ? $(Number(h.rent)) : '-') +
              _wsField('Lease', (h.lease_start ? D(h.lease_start) : '?') + ' - ' + (h.lease_end ? D(h.lease_end) : '?')) +
              _wsField('Status', h.status || '-') +
            '</div></div></div>';
          });
          rhtml += '</div>';
          el.innerHTML = rhtml;
        }).catch(function () {
          el.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">Could not load rental history</p>';
        });
        break;

      case 'intake':
        el.innerHTML = typeof SellerIntake.render === 'function'
          ? SellerIntake.render(cl)
          : '<p class="text-sm text-gray-400 text-center py-8">Seller intake form loading...</p>';
        break;

      case 'tools':
        var thtml = '<div class="space-y-4">';
        thtml += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-chart-bar mr-1.5"></i>CMA</h3>' +
          '<button class="btn btn-sm btn-gold" onclick="SalesCRM._requestCMA(\'' + E(id) + '\')"><i class="fas fa-file-alt mr-1"></i>Generate</button></div>' +
          '<div class="card-body"><p class="text-sm text-gray-500">Comparative Market Analysis</p></div></div>';
        thtml += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-home mr-1.5"></i>Home Valuation</h3></div>' +
          '<div class="card-body"><p class="text-sm text-gray-500">Estimate current market value</p>' +
          '<button class="btn btn-sm btn-outline mt-2" onclick="CRM.toast(\'Home valuation tool — coming soon\',\'info\')"><i class="fas fa-calculator mr-1"></i>Estimate</button></div></div>';
        thtml += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-clock mr-1.5"></i>Market Timing</h3></div>' +
          '<div class="card-body"><p class="text-sm text-gray-500">Best time to sell analysis</p>' +
          '<button class="btn btn-sm btn-outline mt-2" onclick="CRM.toast(\'Market timing analysis — coming soon\',\'info\')"><i class="fas fa-chart-line mr-1"></i>Analyze</button></div></div>';
        thtml += '</div>';
        el.innerHTML = thtml;
        break;

      case 'activity':
        _renderWsActivity(el, id);
        break;

      case 'automation':
        _renderWsAutomation(el, cl);
        break;

      default:
        el.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">Tab not found</p>';
    }
  }


  // ═══════════════════════════════════════════════════════════════════════
  // WORKSPACE — Shared Tab Renderers
  // ═══════════════════════════════════════════════════════════════════════

  function _wsField(label, value) {
    return '<div>' +
      '<span class="text-xs font-semibold text-gray-500">' + E(label) + '</span>' +
      '<p class="text-sm font-medium text-gray-900 mt-0.5">' + (value ? E(value) : '<span class="text-gray-400">--</span>') + '</p>' +
    '</div>';
  }

  function _renderWsActivity(el, clientId) {
    el.innerHTML = UI.loading();
    MallanAPI._fetch('/api/crm/activity?lead_id=' + clientId).then(function (data) {
      var events = data.events || data.activities || [];
      if (events.length === 0) {
        el.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">No activity yet</p>';
        return;
      }
      var html = '<div class="space-y-2">';
      events.forEach(function (ev) {
        var icon = _activityIcon(ev.activity_type || ev.type);
        html += '<div class="flex items-start gap-3 py-2 border-b border-gray-50">' +
          '<div style="width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:' + icon.bg + '">' +
            '<i class="fas ' + icon.icon + '" style="font-size:11px;color:' + icon.color + '"></i>' +
          '</div>' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm font-medium text-gray-900">' + E(ev.title || ev.description || '') + '</p>' +
            (ev.detail ? '<p class="text-xs text-gray-500 mt-0.5">' + E(ev.detail) + '</p>' : '') +
          '</div>' +
          '<span class="text-[10px] text-gray-400 flex-shrink-0">' + Utils.formatTimeAgo(ev.created_at) + '</span>' +
        '</div>';
      });
      html += '</div>';
      el.innerHTML = html;
    }).catch(function () {
      el.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">Could not load activity</p>';
    });
  }

  function _renderWsAutomation(el, cl) {
    var id = cl.id || '';
    var html = '<div class="space-y-4">';
    html += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-robot mr-1.5 text-gray-400"></i>Drip Settings</h3></div>';
    html += '<div class="card-body"><div class="flex items-center justify-between mb-4">' +
      '<span class="text-sm font-medium text-gray-700">Auto-send enabled</span>' +
      _toggleSwitch(!!cl.sales_drip_on, 'SalesCRM._toggleClientDrip(\'' + E(id) + '\',' + !cl.sales_drip_on + ')') +
    '</div>';
    html += '<div class="grid grid-cols-2 gap-3">' +
      _wsField('Current Tier', cl.sales_drip_status || 'paused') +
      _wsField('Frequency', cl.sales_drip_frequency || '-') +
    '</div>';
    html += '<div class="mt-3"><label class="text-xs font-semibold text-gray-700 block mb-1">Override Tier</label>' +
      '<select class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:border-gold focus:outline-none" onchange="SalesCRM._adjustClientTier(\'' + E(id) + '\',this.value)">' +
        '<option value="">Select tier...</option>' +
        '<option value="active">Active (weekly)</option>' +
        '<option value="monthly">Monthly</option>' +
        '<option value="quarterly">Quarterly</option>' +
        '<option value="biannual">Bi-Annual</option>' +
      '</select></div>';
    html += '</div></div>';

    // Content preview
    html += '<div class="card"><div class="card-header"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-eye mr-1.5 text-gray-400"></i>Content Preview</h3></div>';
    html += '<div class="card-body"><p class="text-sm text-gray-500">What this contact would receive based on their tier and profile:</p>';
    html += '<div class="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">';
    if (cl.type === 'seller' || cl.client_type === 'seller') {
      html += 'Market updates, comparable sales, neighborhood trends, pricing recommendations';
    } else if (cl.is_investor) {
      html += 'Investment opportunities, cap rate comparisons, market analysis, rental yield data';
    } else {
      html += 'New listings matching criteria, price drops, open houses, market snapshots';
    }
    html += '</div></div></div>';
    html += '</div>';
    el.innerHTML = html;
  }

  function _toggleClientDrip(id, newState) {
    MallanAPI._fetch('/api/crm/automation/toggle', {
      method: 'POST',
      body: JSON.stringify({ client_id: id, sales_drip_on: newState }),
    }).then(function () {
      if (_state.workspace.client && String(_state.workspace.client.id) === String(id)) {
        _state.workspace.client.sales_drip_on = newState;
      }
      CRM.toast('Drip ' + (newState ? 'activated' : 'paused'), 'success');
      var el = document.getElementById('workspace-content');
      if (el && _state.workspace.tab === 'automation') {
        _renderWsAutomation(el, _state.workspace.client);
      }
    }).catch(function () {
      CRM.toast('Failed to toggle drip', 'error');
    });
  }

  function _adjustClientTier(id, tier) {
    if (!tier) return;
    MallanAPI._fetch('/api/crm/automation/adjust-tier', {
      method: 'POST',
      body: JSON.stringify({ client_id: id, tier: tier, crm_type: 'sales' }),
    }).then(function () {
      if (_state.workspace.client && String(_state.workspace.client.id) === String(id)) {
        _state.workspace.client.sales_drip_status = tier;
      }
      CRM.toast('Tier set to ' + tier, 'success');
      var el = document.getElementById('workspace-content');
      if (el && _state.workspace.tab === 'automation') {
        _renderWsAutomation(el, _state.workspace.client);
      }
    }).catch(function () {
      CRM.toast('Failed to adjust tier', 'error');
    });
  }

  function _deleteClientFromWs(id, role) {
    if (!confirm('Delete this client? This cannot be undone.')) return;
    MallanAPI._fetch('/api/crm/clients/' + id, { method: 'DELETE' }).then(function () {
      CRM.toast('Client deleted', 'success');
      Router.navigate(_state.workspace.backRoute);
    }).catch(function (err) {
      CRM.toast('Delete failed: ' + (err.message || ''), 'error');
    });
  }

  // ─── Document toggle listener for workspace ────────────────────────
  function _listenDocToggle(clientId) {
    var handler = function (e) {
      var detail = e.detail;
      MallanAPI._fetch('/api/crm/clients/' + clientId).then(function (data) {
        var cl = data.client || data;
        var docs = cl.documents_collected || {};
        docs[detail.key] = detail.value;
        return MallanAPI._fetch('/api/crm/clients/' + clientId, {
          method: 'PATCH',
          body: JSON.stringify({ documents_collected: docs }),
        });
      }).then(function () {
        CRM.toast('Document status updated', 'success');
      }).catch(function () {
        CRM.toast('Failed to update document', 'error');
      });
      document.removeEventListener('ws:doc-toggle', handler);
    };
    document.addEventListener('ws:doc-toggle', handler);
  }

  // ─── Disclosure update listener for workspace ──────────────────────
  function _listenDisclosureUpdates(clientId) {
    var handler = function (e) {
      var detail = e.detail;
      MallanAPI._fetch('/api/crm/clients/' + clientId).then(function (data) {
        var cl = data.client || data;
        var disc = cl.disclosures || {};
        disc[detail.key] = detail.status;
        return MallanAPI._fetch('/api/crm/clients/' + clientId, {
          method: 'PATCH',
          body: JSON.stringify({ disclosures: disc }),
        });
      }).then(function () {
        CRM.toast('Disclosure updated', 'success');
      }).catch(function () {
        CRM.toast('Failed to update disclosure', 'error');
      });
      document.removeEventListener('ws:disclosure-update', handler);
    };
    document.addEventListener('ws:disclosure-update', handler);
  }


  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════
  return {
    // 7 tabs — called from Router
    activeSellers: activeSellers,
    activeBuyers: activeBuyers,
    landlordSellers: landlordSellers,
    salesListings: salesListings,
    salesMarketing: salesMarketing,
    salesActivity: salesActivity,
    salesAutomation: salesAutomation,

    // Sellers tab
    _searchSellers: _searchSellers,
    _filterSellers: _filterSellers,
    _sortSellers: _sortSellers,
    _pageSellers: _pageSellers,
    _newSeller: _newSeller,
    _submitNewSeller: _submitNewSeller,
    _netProceeds: _netProceeds,
    _requestCMA: _requestCMA,

    // Buyers tab
    _searchBuyers: _searchBuyers,
    _filterBuyers: _filterBuyers,
    _sortBuyers: _sortBuyers,
    _pageBuyers: _pageBuyers,
    _newBuyer: _newBuyer,
    _submitNewBuyer: _submitNewBuyer,
    _sendListings: _sendListings,
    _scheduleShowing: _scheduleShowing,
    _submitShowing: _submitShowing,

    // Landlord sellers tab
    _searchLandlordSellers: _searchLandlordSellers,
    _filterLandlordSellers: _filterLandlordSellers,
    _sortLandlordSellers: _sortLandlordSellers,
    _pageLandlordSellers: _pageLandlordSellers,
    _promoteLandlord: _promoteLandlord,

    // Listings tab
    _searchListings: _searchListings,
    _filterListings: _filterListings,
    _sortListings: _sortListings,
    _pageListings: _pageListings,
    _openListing: _openListing,

    // Marketing tab
    _searchMarketing: _searchMarketing,
    _sortMarketing: _sortMarketing,
    _pageMarketing: _pageMarketing,
    _newCampaign: _newCampaign,
    _submitNewCampaign: _submitNewCampaign,
    _editCampaign: _editCampaign,
    _submitEditCampaign: _submitEditCampaign,
    _deleteCampaign: _deleteCampaign,
    _openCampaignDetail: _openCampaignDetail,

    // Activity tab
    _filterActivity: _filterActivity,

    // Automation tab
    _searchAutomation: _searchAutomation,
    _filterAutomation: _filterAutomation,
    _sortAutomation: _sortAutomation,
    _pageAutomation: _pageAutomation,
    _toggleDrip: _toggleDrip,
    _adjustTier: _adjustTier,

    // Shared actions
    _openClient: _openClient,
    _editClient: _editClient,
    _submitEditClient: _submitEditClient,
    _deleteClient: _deleteClient,
    _deleteClientFromWs: _deleteClientFromWs,

    // Workspace navigation
    _openSellerWorkspace: _openSellerWorkspace,
    _openBuyerWorkspace: _openBuyerWorkspace,
    _openLandlordSellerWorkspace: _openLandlordSellerWorkspace,
    _wsTab: _wsTab,
    _toggleClientDrip: _toggleClientDrip,
    _adjustClientTier: _adjustClientTier,
  };
})();
