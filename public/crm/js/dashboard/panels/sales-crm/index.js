// ═══════════════════════════════════════════════════════════════════════════════
// SALES CRM — 7 tabs (no prospect/active split)
// Active Sellers | Active Buyers | Landlord Sellers | Listings | Marketing | Activity | Automation
// Rich CRM design: KPI strips, avatars, color-coded badges, score bars, inline actions
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, Router, Store, UI, Utils, FilterBar, ActivityTable, MallanAPI, ClientNormalizer */

var SalesCRM = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  var TABS = [
    { id: 'sellers',           route: '/sales/sellers',          label: 'Active Sellers',    icon: 'fa-home' },
    { id: 'buyers',            route: '/sales/buyers',           label: 'Active Buyers',     icon: 'fa-user-tag' },
    { id: 'landlord-sellers',  route: '/sales/landlord-sellers', label: 'Landlord Sellers',  icon: 'fa-exchange-alt' },
    { id: 'listings',          route: '/sales/listings',         label: 'Listings',          icon: 'fa-building' },
    { id: 'marketing',         route: '/sales/marketing',        label: 'Marketing',         icon: 'fa-bullhorn' },
    { id: 'activity',          route: '/sales/activity',         label: 'Activity',          icon: 'fa-stream' },
    { id: 'automation',        route: '/sales/automation',       label: 'Automation',        icon: 'fa-robot' },
  ];

  var _state = {
    sellers:   { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '', filter: {} },
    buyers:    { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '', filter: {} },
    landlordSellers: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    listings:  { data: [], sort: { key: 'address', dir: 'asc' }, page: 1, search: '' },
    marketing: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    activity:  { data: [], page: 1, filter: 'all' },
    automation: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
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

  // ─── Score Bar (fallback if UI.scoreBar not yet available) ─────────
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

  // ─── Toggle Switch (fallback if UI.toggleSwitch not yet available) ─
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
      '.activity-card{display:flex;align-items:flex-start;gap:12px;padding:12px;background:#fff;border:1px solid #F3F4F6;border-radius:10px;transition:border-color .15s;}' +
      '.activity-card:hover{border-color:#B8860B30;}' +
      '@media(max-width:768px){.kpi-strip{flex-direction:column;}.kpi-card{min-width:auto;}}';
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
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

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
          { value: 'No Listing', label: 'No Listing' }
        ]},
        { key: 'source', label: 'Source', options: [
          { value: 'referral', label: 'Referral' }, { value: 'website', label: 'Website' },
          { value: 'manual', label: 'Manual' }, { value: 'streetEasy', label: 'StreetEasy' }
        ]},
      ],
      onFilter: 'SalesCRM._filterSellers',
      quickActions: [
        { label: 'New Seller', icon: 'fa-plus', onclick: 'CRM.quickNewClient({ role: "seller" })' },
      ],
    });

    html += ActivityTable.render({
      id: 'sellers_table',
      columns: [
        { key: 'avatar', label: '', width: '44px', render: function (r) {
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
          var s = r.listing_status || 'No Listing';
          var colors = {
            'Active': 'bg-blue-100 text-blue-700',
            'Coming Soon': 'bg-yellow-100 text-yellow-700',
            'Under Contract': 'bg-purple-100 text-purple-700',
            'Closed': 'bg-green-100 text-green-700',
            'No Listing': 'bg-gray-100 text-gray-500'
          };
          return '<span class="text-[10px] px-2 py-0.5 rounded-md font-bold ' + (colors[s] || 'bg-gray-100 text-gray-600') + '">' + E(s) + '</span>';
        }},
        { key: 'list_price', label: 'Price', render: function (r) {
          return r.list_price ? '<span class="font-semibold text-gray-900">' + $(Number(r.list_price)) + '</span>' : '<span class="text-gray-400">-</span>';
        }},
        { key: 'dom', label: 'DOM', render: function (r) {
          return _domBadge(r.dom || r.days_on_market || 0);
        }},
        { key: 'showings_count', label: 'Showings', render: function (r) {
          var count = Number(r.showings_count) || 0;
          return count > 0
            ? '<span class="font-semibold text-gray-900">' + count + '</span>'
            : '<span class="text-gray-400">0</span>';
        }},
        { key: 'actions', label: '', width: '44px', render: function (r) {
          return _rowActions([
            { icon: 'fa-calculator', title: 'Net Proceeds', onclick: 'SalesCRM._netProceeds(\'' + E(r.id || '') + '\')' }
          ]);
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'SalesCRM._sortSellers',
      onRowClick: 'SalesCRM._openClient',
      page: st.page,
      pageSize: 25,
      onPage: 'SalesCRM._pageSellers',
      emptyIcon: 'fa-home',
      emptyText: 'No sellers yet — add one to start',
    });

    c.innerHTML = html;
  }

  function _searchSellers(q) { _state.sellers.search = q; _state.sellers.page = 1; _renderSellers(CRM.getContent()); }
  function _filterSellers() { _renderSellers(CRM.getContent()); }
  function _sortSellers(key) {
    var st = _state.sellers;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderSellers(CRM.getContent());
  }
  function _pageSellers(p) { _state.sellers.page = p; _renderSellers(CRM.getContent()); }
  function _netProceeds(id) {
    Router.navigate('/workspace/client/' + id + '/net-proceeds');
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
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _subnav('buyers');
    html += _buyerKPIs(st.data);

    html += FilterBar.render({
      id: 'buyers',
      placeholder: 'Search buyers & investors...',
      onSearch: 'SalesCRM._searchBuyers',
      filters: [
        { key: 'type', label: 'Type', options: [
          { value: 'buyer', label: 'Buyers Only' }, { value: 'investor', label: 'Investors Only' }
        ]},
        { key: 'pre_approved', label: 'Pre-Approved', options: [
          { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }
        ]},
        { key: 'stage', label: 'Stage', options: [
          { value: 'showing', label: 'Showing' }, { value: 'offer', label: 'Offer' }, { value: 'deal', label: 'Deal' }
        ]},
      ],
      onFilter: 'SalesCRM._filterBuyers',
      quickActions: [
        { label: 'New Buyer', icon: 'fa-plus', onclick: 'CRM.quickNewClient({ role: "buyer" })' },
      ],
    });

    html += ActivityTable.render({
      id: 'buyers_table',
      columns: [
        { key: 'avatar', label: '', width: '44px', render: function (r) {
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
        { key: 'actions', label: '', width: '72px', render: function (r) {
          return _rowActions([
            { icon: 'fa-paper-plane', title: 'Send Listings', onclick: 'SalesCRM._sendListings(\'' + E(r.id || '') + '\')' },
            { icon: 'fa-calendar', title: 'Schedule Showing', onclick: 'SalesCRM._scheduleShowing(\'' + E(r.id || '') + '\')' }
          ]);
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'SalesCRM._sortBuyers',
      onRowClick: 'SalesCRM._openClient',
      page: st.page,
      pageSize: 25,
      onPage: 'SalesCRM._pageBuyers',
      emptyIcon: 'fa-user-tag',
      emptyText: 'No buyers yet — add one to start',
      rowClass: function (r) { return r.is_investor ? 'investor-row' : ''; },
    });

    c.innerHTML = html;
  }

  function _searchBuyers(q) { _state.buyers.search = q; _state.buyers.page = 1; _renderBuyers(CRM.getContent()); }
  function _filterBuyers() { _renderBuyers(CRM.getContent()); }
  function _sortBuyers(key) {
    var st = _state.buyers;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderBuyers(CRM.getContent());
  }
  function _pageBuyers(p) { _state.buyers.page = p; _renderBuyers(CRM.getContent()); }
  function _sendListings(id) { Router.navigate('/workspace/client/' + id + '/listings'); }
  function _scheduleShowing(id) { Router.navigate('/workspace/client/' + id + '/showings'); }

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
    var low = data.filter(function (r) { return (r.seller_potential || '').toLowerCase() === 'low'; }).length;

    return _kpi([
      { icon: 'fa-users', label: 'Total', value: total, color: '#3B82F6' },
      { icon: 'fa-fire', label: 'High Potential', value: high, color: '#DC2626' },
      { icon: 'fa-exclamation-triangle', label: 'Medium', value: medium, color: '#D97706' },
      { icon: 'fa-shield-alt', label: 'Low', value: low, color: '#9CA3AF' },
    ]);
  }

  function _renderLandlordSellers(c) {
    var st = _state.landlordSellers;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _subnav('landlord-sellers');
    html += _landlordSellerKPIs(st.data);

    html += FilterBar.render({
      id: 'landlord_sellers',
      placeholder: 'Search landlord sellers...',
      onSearch: 'SalesCRM._searchLandlordSellers',
      filters: [
        { key: 'seller_potential', label: 'Seller Potential', options: [
          { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }
        ]},
      ],
      onFilter: 'SalesCRM._filterLandlordSellers',
    });

    html += ActivityTable.render({
      id: 'landlord_sellers_table',
      columns: [
        { key: 'avatar', label: '', width: '44px', render: function (r) {
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
        { key: 'seller_potential', label: 'Seller Potential', render: function (r) {
          var p = (r.seller_potential || 'none').toLowerCase();
          var colors = { high: 'background:#FEE2E2;color:#DC2626;', medium: 'background:#FEF3C7;color:#D97706;', low: 'background:#F3F4F6;color:#6B7280;' };
          var style = colors[p] || 'background:#F3F4F6;color:#6B7280;';
          return '<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:10px;font-weight:700;' + style + '">' + E((p || 'none').toUpperCase()) + '</span>';
        }},
        { key: 'seller_potential_reason', label: 'Reason', render: function (r) {
          var reasons = r.seller_potential_reason || [];
          if (!Array.isArray(reasons)) reasons = [];
          if (reasons.length === 0) return '<span class="text-gray-400">-</span>';
          var html = '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
          reasons.forEach(function (reason) {
            html += '<span style="display:inline-block;padding:1px 6px;font-size:10px;font-weight:600;border-radius:4px;background:#EFF6FF;color:#3B82F6;">' + E(reason) + '</span>';
          });
          html += '</div>';
          return html;
        }},
        { key: 'vacancy_risk', label: 'Vacancy Risk', render: function (r) {
          var v = (r.vacancy_risk || '').toLowerCase();
          if (v === 'high') return '<span style="color:#DC2626;font-size:16px;" title="High Risk"><i class="fas fa-fire"></i></span>';
          if (v === 'medium') return '<span style="color:#D97706;font-size:16px;" title="Medium Risk"><i class="fas fa-exclamation-triangle"></i></span>';
          if (v === 'low') return '<span style="color:#059669;font-size:16px;" title="Low Risk"><i class="fas fa-shield-alt"></i></span>';
          return '<span class="text-gray-400">-</span>';
        }},
        { key: 'actions', label: '', width: '80px', render: function (r) {
          return '<button class="btn-promote" onclick="event.stopPropagation();SalesCRM._promoteLandlord(\'' + E(r.id || '') + '\')">Promote</button>';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'SalesCRM._sortLandlordSellers',
      onRowClick: 'SalesCRM._openClient',
      page: st.page,
      pageSize: 25,
      onPage: 'SalesCRM._pageLandlordSellers',
      emptyIcon: 'fa-exchange-alt',
      emptyText: 'No landlords with seller potential yet',
    });

    c.innerHTML = html;
  }

  function _searchLandlordSellers(q) { _state.landlordSellers.search = q; _state.landlordSellers.page = 1; _renderLandlordSellers(CRM.getContent()); }
  function _filterLandlordSellers() { _renderLandlordSellers(CRM.getContent()); }
  function _sortLandlordSellers(key) {
    var st = _state.landlordSellers;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderLandlordSellers(CRM.getContent());
  }
  function _pageLandlordSellers(p) { _state.landlordSellers.page = p; _renderLandlordSellers(CRM.getContent()); }
  function _promoteLandlord(id) {
    CRM.toast('Promoting landlord to seller pipeline...', 'info');
    MallanAPI._fetch('/api/crm/convert', {
      method: 'POST',
      body: JSON.stringify({ client_id: id, action: 'landlord_to_seller' })
    }).then(function () {
      CRM.toast('Landlord promoted to seller!', 'success');
      landlordSellers();
    }).catch(function () {
      CRM.toast('Unable to promote landlord', 'error');
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
    var active = data.filter(function (r) { return (r.status || '').toLowerCase() === 'active'; });
    var activeCount = active.length;
    var totalValue = data.reduce(function (sum, r) { return sum + (Number(r.list_price) || 0); }, 0);
    var doms = data.map(function (r) { return Number(r.dom || r.days_on_market || 0); }).filter(function (d) { return d > 0; });
    var avgDom = doms.length > 0 ? Math.round(doms.reduce(function (a, b) { return a + b; }, 0) / doms.length) : 0;
    var rlsCount = data.filter(function (r) { return r.rls_eligible !== false; }).length;
    var rlsPct = data.length > 0 ? Math.round((rlsCount / data.length) * 100) : 0;

    return _kpi([
      { icon: 'fa-building', label: 'Active Listings', value: activeCount, color: '#3B82F6' },
      { icon: 'fa-dollar-sign', label: 'Total Value', value: $(totalValue), color: '#B8860B' },
      { icon: 'fa-clock', label: 'Avg DOM', value: avgDom, color: avgDom < 30 ? '#059669' : avgDom < 90 ? '#D97706' : '#DC2626' },
      { icon: 'fa-check-double', label: 'RLS Compliant', value: rlsPct + '%', color: '#059669' },
    ]);
  }

  function _renderListings(c) {
    var st = _state.listings;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _subnav('listings');
    html += _listingKPIs(st.data);

    html += FilterBar.render({
      id: 'slistings',
      placeholder: 'Search listings...',
      onSearch: 'SalesCRM._searchListings',
      filters: [
        { key: 'status', label: 'Status', options: [
          { value: 'Active', label: 'Active' }, { value: 'Coming Soon', label: 'Coming Soon' },
          { value: 'Pending', label: 'Pending' }, { value: 'Closed', label: 'Closed' }
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
          var s = r.status || 'Active';
          var colors = {
            'Active': 'bg-blue-100 text-blue-700',
            'Pending': 'bg-orange-100 text-orange-700',
            'Closed': 'bg-green-100 text-green-700',
            'Coming Soon': 'bg-yellow-100 text-yellow-700'
          };
          return '<span class="text-[10px] px-2 py-0.5 rounded-md font-bold ' + (colors[s] || 'bg-gray-100 text-gray-600') + '">' + E(s) + '</span>';
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
        { key: 'inquiries_count', label: 'Inquiries', render: function (r) {
          var count = Number(r.inquiries_count) || 0;
          return count > 0 ? '<span class="font-semibold text-gray-900">' + count + '</span>' : '<span class="text-gray-400">0</span>';
        }},
        { key: 'rls_eligible', label: 'RLS', render: function (r) {
          var ok = r.rls_eligible !== false;
          return ok
            ? '<span class="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-md font-bold">RLS</span>'
            : '<span class="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-md font-bold">Site Only</span>';
        }},
        { key: 'actions', label: '', width: '44px', render: function (r) {
          return _rowActions([
            { icon: 'fa-external-link-alt', title: 'View Listing', onclick: 'SalesCRM._openListing(\'' + E(r.id || '') + '\')' }
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
  function _filterListings() { _renderListings(CRM.getContent()); }
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
      return r.sent_count > 0 ? Math.round((r.open_count / r.sent_count) * 100) : 0;
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
          var colors = {
            draft: 'bg-gray-100 text-gray-600',
            scheduled: 'bg-blue-100 text-blue-700',
            sent: 'bg-green-100 text-green-700',
            recurring: 'bg-purple-100 text-purple-700'
          };
          return '<span class="text-[10px] px-2 py-0.5 rounded-md font-bold ' + (colors[r.status] || 'bg-gray-100 text-gray-600') + '">' + E(r.status || 'draft') + '</span>';
        }},
        { key: 'sent_count', label: 'Sent', render: function (r) {
          var count = Number(r.sent_count) || 0;
          return count > 0 ? '<span class="font-semibold text-gray-900">' + count + '</span>' : '<span class="text-gray-400">0</span>';
        }},
        { key: 'open_rate', label: 'Open %', render: function (r) {
          var rate = r.sent_count > 0 ? Math.round((r.open_count / r.sent_count) * 100) : 0;
          var color = rate >= 25 ? '#059669' : rate >= 15 ? '#D97706' : '#DC2626';
          return '<div class="progress-bar-mini">' +
            '<div class="progress-bar-mini-track">' +
              '<div class="progress-bar-mini-fill" style="width:' + Math.min(rate, 100) + '%;background:' + color + ';"></div>' +
            '</div>' +
            '<span style="font-size:11px;font-weight:700;color:' + color + ';">' + rate + '%</span>' +
          '</div>';
        }},
        { key: 'last_run_at', label: 'Last Run', render: function (r) {
          return r.last_run_at
            ? '<span class="text-sm text-gray-600">' + Utils.formatTimeAgo(r.last_run_at) + '</span>'
            : '<span class="text-gray-400">-</span>';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'SalesCRM._sortMarketing',
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
  function _newCampaign() { CRM.toast('Campaign creation coming soon', 'info'); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 6: SALES ACTIVITY FEED (with date group headers + avatars)
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

  function _renderActivity(c) {
    var events = _state.activity.data;
    var filter = _state.activity.filter;
    if (filter !== 'all') {
      events = events.filter(function (e) { return e.client_type === filter; });
    }

    var html = _subnav('activity');

    // Filter buttons
    html += '<div class="flex gap-1 mb-4">';
    ['all', 'sellers', 'buyers', 'listings'].forEach(function (f) {
      var active = filter === f;
      var label = f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1);
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

        html += '<div class="activity-group-header">' + E(groupName) + '</div>';

        groupEvents.forEach(function (ev) {
          var icon = _activityIcon(ev.activity_type);
          var clientName = ev.client_name || ev.name || '';

          html += '<div class="activity-card">' +
            // Client avatar
            UI.avatar(clientName, 32) +
            // Icon
            '<div style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:' + icon.bg + '">' +
              '<i class="fas ' + icon.icon + '" style="font-size:12px;color:' + icon.color + '"></i>' +
            '</div>' +
            // Content
            '<div style="flex:1;min-width:0;">' +
              '<p style="font-size:13px;font-weight:600;color:#111827;margin:0;">' + E(ev.title || '') + '</p>' +
              (ev.detail ? '<p style="font-size:12px;color:#6B7280;margin:2px 0 0;">' + E(ev.detail) + '</p>' : '') +
              (clientName ? '<p style="font-size:11px;color:#9CA3AF;margin:2px 0 0;">' + E(clientName) + '</p>' : '') +
            '</div>' +
            // Timestamp
            '<span style="font-size:10px;color:#9CA3AF;flex-shrink:0;white-space:nowrap;">' + Utils.formatTimeAgo(ev.created_at) + '</span>' +
          '</div>';
        });
      });
      html += '</div>';
    }

    c.innerHTML = html;
  }

  function _filterActivity(f) { _state.activity.filter = f; _renderActivity(CRM.getContent()); }

  function _activityIcon(type) {
    var map = {
      portal_login: { icon: 'fa-sign-in-alt', color: '#3B82F6', bg: '#EFF6FF' },
      listing_view: { icon: 'fa-eye', color: '#8B5CF6', bg: '#F5F3FF' },
      showing: { icon: 'fa-calendar', color: '#F59E0B', bg: '#FFFBEB' },
      offer: { icon: 'fa-handshake', color: '#059669', bg: '#ECFDF5' },
      comment: { icon: 'fa-comment', color: '#6366F1', bg: '#EEF2FF' },
      email: { icon: 'fa-envelope', color: '#EC4899', bg: '#FDF2F8' },
      status_change: { icon: 'fa-exchange-alt', color: '#B8860B', bg: '#FFFBF0' },
      conversion: { icon: 'fa-check-circle', color: '#059669', bg: '#ECFDF5' },
      cma: { icon: 'fa-chart-bar', color: '#6366F1', bg: '#EEF2FF' },
    };
    return map[type] || { icon: 'fa-circle', color: '#9CA3AF', bg: '#F9FAFB' };
  }

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
          { value: 'quarterly', label: 'Quarterly' }, { value: 'paused', label: 'Paused' }
        ]},
      ],
      onFilter: 'SalesCRM._filterAutomation',
    });

    html += ActivityTable.render({
      id: 'sautomation_table',
      columns: [
        { key: 'avatar', label: '', width: '44px', render: function (r) {
          return UI.avatar(r.name, 32);
        }},
        { key: 'name', label: 'Contact', render: function (r) {
          return '<span class="font-semibold text-gray-900">' + E(r.name || '') + '</span>';
        }},
        { key: 'type', label: 'Type', render: function (r) {
          var t = r.type || 'unknown';
          var colors = { seller: 'bg-blue-100 text-blue-700', buyer: 'bg-green-100 text-green-700' };
          return '<span class="text-[10px] px-2 py-0.5 rounded-md font-bold ' + (colors[t] || 'bg-gray-100 text-gray-600') + '">' + E(t) + '</span>';
        }},
        { key: 'sales_drip_on', label: 'Drip', width: '80px', render: function (r) {
          return _toggleSwitch(!!r.sales_drip_on, 'SalesCRM._toggleDrip(\'' + E(r.id || '') + '\',' + !r.sales_drip_on + ')');
        }},
        { key: 'sales_drip_status', label: 'Tier', render: function (r) {
          var s = r.sales_drip_status || 'paused';
          var colors = {
            active: 'bg-green-100 text-green-700',
            monthly: 'bg-blue-100 text-blue-700',
            quarterly: 'bg-yellow-100 text-yellow-700',
            biannual: 'bg-gray-100 text-gray-600',
            paused: 'bg-red-100 text-red-600'
          };
          return '<span class="text-[10px] px-2 py-0.5 rounded-md font-bold ' + (colors[s] || 'bg-gray-100 text-gray-600') + '">' + E(s) + '</span>';
        }},
        { key: 'last_sales_email_opened', label: 'Last Opened', render: function (r) {
          return r.last_sales_email_opened
            ? '<span class="text-sm text-gray-600">' + Utils.formatTimeAgo(r.last_sales_email_opened) + '</span>'
            : '<span class="text-gray-400">-</span>';
        }},
        { key: 'last_response_at', label: 'Last Response', render: function (r) {
          return r.last_response_at
            ? '<span class="text-sm text-gray-600">' + Utils.formatTimeAgo(r.last_response_at) + '</span>'
            : '<span class="text-gray-400">-</span>';
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
  function _filterAutomation() { _renderAutomation(CRM.getContent()); }
  function _sortAutomation(key) {
    var st = _state.automation;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderAutomation(CRM.getContent());
  }
  function _pageAutomation(p) { _state.automation.page = p; _renderAutomation(CRM.getContent()); }
  function _toggleDrip(id, newState) {
    MallanAPI._fetch('/api/crm/automation/toggle', {
      method: 'POST',
      body: JSON.stringify({ client_id: id, sales_drip_on: newState })
    }).then(function () {
      // Update local state optimistically
      _state.automation.data.forEach(function (r) {
        if (r.id === id) r.sales_drip_on = newState;
      });
      _renderAutomation(CRM.getContent());
      CRM.toast('Drip ' + (newState ? 'activated' : 'paused'), 'success');
    }).catch(function () {
      CRM.toast('Unable to toggle drip', 'error');
    });
  }

  // ─── Shared ──────────────────────────────────────────────────────────
  function _openClient(id) { Router.navigate('/workspace/client/' + id + '/overview'); }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════
  return {
    activeSellers: activeSellers,
    activeBuyers: activeBuyers,
    landlordSellers: landlordSellers,
    salesListings: salesListings,
    salesMarketing: salesMarketing,
    salesActivity: salesActivity,
    salesAutomation: salesAutomation,

    _openClient: _openClient,
    _searchSellers: _searchSellers,
    _filterSellers: _filterSellers,
    _sortSellers: _sortSellers,
    _pageSellers: _pageSellers,
    _netProceeds: _netProceeds,
    _searchBuyers: _searchBuyers,
    _filterBuyers: _filterBuyers,
    _sortBuyers: _sortBuyers,
    _pageBuyers: _pageBuyers,
    _sendListings: _sendListings,
    _scheduleShowing: _scheduleShowing,
    _searchLandlordSellers: _searchLandlordSellers,
    _filterLandlordSellers: _filterLandlordSellers,
    _sortLandlordSellers: _sortLandlordSellers,
    _pageLandlordSellers: _pageLandlordSellers,
    _promoteLandlord: _promoteLandlord,
    _searchListings: _searchListings,
    _filterListings: _filterListings,
    _sortListings: _sortListings,
    _pageListings: _pageListings,
    _openListing: _openListing,
    _searchMarketing: _searchMarketing,
    _sortMarketing: _sortMarketing,
    _pageMarketing: _pageMarketing,
    _newCampaign: _newCampaign,
    _filterActivity: _filterActivity,
    _searchAutomation: _searchAutomation,
    _filterAutomation: _filterAutomation,
    _sortAutomation: _sortAutomation,
    _pageAutomation: _pageAutomation,
    _toggleDrip: _toggleDrip,
  };
})();
