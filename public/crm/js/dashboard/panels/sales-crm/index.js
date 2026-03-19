// ═══════════════════════════════════════════════════════════════════════════════
// SALES CRM — Subnav controller (Seller / Buyer)
// 7 tabs: Active Sellers, Active Buyers, Landlord Sellers, Listings, Marketing,
//         Activity, Automation
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, Router, Store, UI, Utils, FilterBar, ActivityTable, MallanAPI, ClientNormalizer */

var SalesCRM = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  var TABS = [
    { id: 'sellers',          route: '/sales/sellers',          label: 'Active Sellers',    icon: 'fa-home' },
    { id: 'buyers',           route: '/sales/buyers',           label: 'Active Buyers',     icon: 'fa-user-tag' },
    { id: 'landlord-sellers', route: '/sales/landlord-sellers', label: 'Landlord Sellers',  icon: 'fa-exchange-alt' },
    { id: 'listings',         route: '/sales/listings',         label: 'Listings',          icon: 'fa-building' },
    { id: 'marketing',        route: '/sales/marketing',        label: 'Marketing',         icon: 'fa-bullhorn' },
    { id: 'activity',         route: '/sales/activity',         label: 'Activity',          icon: 'fa-stream' },
    { id: 'automation',       route: '/sales/automation',       label: 'Automation',        icon: 'fa-robot' },
  ];

  // State
  var _state = {
    sellers: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    buyers: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    landlordSellers: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    listings: { data: [], sort: { key: 'address', dir: 'asc' }, page: 1, search: '' },
    marketing: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    activity: { data: [], page: 1, filter: 'all' },
    automation: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1 },
  };

  // ─── Subnav renderer ──────────────────────────────────────────────────
  function _renderSubnav(activeTab) {
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
    c.innerHTML = _renderSubnav('sellers') + UI.loading();

    MallanAPI._fetch('/api/crm/sales/sellers').then(function (data) {
      _state.sellers.data = (data.sellers || []).map(function (s) { return ClientNormalizer.normalize(s); });
      _renderSellersTable(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('sellers') + UI.emptyState('fa-home', 'Unable to load sellers');
    });
  }

  function _renderSellersTable(c) {
    var st = _state.sellers;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _renderSubnav('sellers');

    html += FilterBar.render({
      id: 'sellers',
      placeholder: 'Search sellers...',
      onSearch: 'SalesCRM._searchSellers',
      filters: [
        { key: 'status', label: 'Status', options: [
          { value: 'active', label: 'Active' }, { value: 'coming_soon', label: 'Coming Soon' },
          { value: 'under_contract', label: 'Under Contract' }, { value: 'closed', label: 'Closed' }
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
        { key: 'name', label: 'Seller', render: function (r) {
          var badge = '';
          if (r.entity_name) badge = ' <span class="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-bold">' + E(r.entity_type || 'Entity') + '</span>';
          return '<span class="font-medium text-gray-900">' + E(r.name || '') + '</span>' + badge;
        }},
        { key: 'property_address', label: 'Property', render: function (r) {
          return E(r.property_address || r.address || '-');
        }},
        { key: 'listing_status', label: 'Listing Status', render: function (r) {
          var s = r.listing_status || 'No Listing';
          var colors = { 'Active': 'bg-blue-100 text-blue-700', 'Coming Soon': 'bg-yellow-100 text-yellow-700', 'Under Contract': 'bg-purple-100 text-purple-700', 'Closed': 'bg-green-100 text-green-700' };
          var cls = colors[s] || 'bg-gray-100 text-gray-600';
          return '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + cls + '">' + E(s) + '</span>';
        }},
        { key: 'showings_count', label: 'Showings', render: function (r) { return String(r.showings_count || 0); } },
        { key: 'last_login_at', label: 'Last Login', render: function (r) {
          return r.last_login_at ? Utils.formatTimeAgo(r.last_login_at) : '<span class="text-gray-400">Never</span>';
        }},
        { key: 'updated_at', label: 'Last Action', render: function (r) {
          return r.updated_at ? Utils.formatTimeAgo(r.updated_at) : '-';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'SalesCRM._sortSellers',
      onRowClick: 'SalesCRM._openSeller',
      page: st.page,
      pageSize: 25,
      onPage: 'SalesCRM._pageSellers',
      emptyIcon: 'fa-home',
      emptyText: 'No active sellers',
    });

    c.innerHTML = html;
  }

  function _searchSellers(q) { _state.sellers.search = q; _state.sellers.page = 1; _renderSellersTable(CRM.getContent()); }
  function _filterSellers(key, val) { /* TODO: apply filter */ _renderSellersTable(CRM.getContent()); }
  function _sortSellers(key) {
    var st = _state.sellers;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderSellersTable(CRM.getContent());
  }
  function _pageSellers(p) { _state.sellers.page = p; _renderSellersTable(CRM.getContent()); }
  function _openSeller(id) { Router.navigate('/workspace/client/' + id + '/overview'); }
  function _newSeller() { CRM.quickNewClient({ role: 'seller' }); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 2: ACTIVE BUYERS (+ INVESTORS)
  // ═══════════════════════════════════════════════════════════════════════
  function activeBuyers() {
    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('buyers') + UI.loading();

    MallanAPI._fetch('/api/crm/sales/buyers').then(function (data) {
      _state.buyers.data = (data.buyers || []).map(function (b) { return ClientNormalizer.normalize(b); });
      _renderBuyersTable(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('buyers') + UI.emptyState('fa-user-tag', 'Unable to load buyers');
    });
  }

  function _renderBuyersTable(c) {
    var st = _state.buyers;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _renderSubnav('buyers');

    html += FilterBar.render({
      id: 'buyers',
      placeholder: 'Search buyers & investors...',
      onSearch: 'SalesCRM._searchBuyers',
      filters: [
        { key: 'type', label: 'Type', options: [
          { value: 'buyer', label: 'Buyers' }, { value: 'investor', label: 'Investors' }
        ]},
        { key: 'stage', label: 'Stage', options: [
          { value: 'active', label: 'Active' }, { value: 'showing', label: 'Showing' },
          { value: 'offer', label: 'Offer' }, { value: 'nurturing', label: 'Nurturing' }
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
        { key: 'name', label: 'Buyer', render: function (r) {
          var badges = '';
          if (r.is_investor) badges += ' <span class="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-bold">Investor</span>';
          if (r.entity_name) badges += ' <span class="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-bold">' + E(r.entity_type || 'Entity') + '</span>';
          return '<span class="font-medium text-gray-900">' + E(r.name || '') + '</span>' + badges;
        }},
        { key: 'budget', label: 'Budget', render: function (r) {
          if (r.pre_approved_amount) return Utils.formatMoney(r.pre_approved_amount);
          if (r.available_funds) return Utils.formatMoney(r.available_funds);
          return '-';
        }},
        { key: 'pipeline_stage', label: 'Stage', render: function (r) {
          return UI.stageBadge(r.pipeline_stage || 'new');
        }},
        { key: 'last_viewed_listing_at', label: 'Last Viewed', render: function (r) {
          return r.last_viewed_listing_at ? Utils.formatTimeAgo(r.last_viewed_listing_at) : '<span class="text-gray-400">-</span>';
        }},
        { key: 'login_count', label: 'Logins', render: function (r) { return String(r.login_count || 0); } },
        { key: 'conviction_score', label: 'Conviction', render: function (r) {
          var score = r.conviction_score || 0;
          var color = score >= 70 ? 'text-green-600' : score >= 40 ? 'text-yellow-600' : 'text-gray-400';
          return '<span class="font-bold ' + color + '">' + score + '</span>';
        }},
        { key: 'updated_at', label: 'Last Action', render: function (r) {
          return r.updated_at ? Utils.formatTimeAgo(r.updated_at) : '-';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'SalesCRM._sortBuyers',
      onRowClick: 'SalesCRM._openBuyer',
      page: st.page,
      pageSize: 25,
      onPage: 'SalesCRM._pageBuyers',
      emptyIcon: 'fa-user-tag',
      emptyText: 'No active buyers',
    });

    c.innerHTML = html;
  }

  function _searchBuyers(q) { _state.buyers.search = q; _state.buyers.page = 1; _renderBuyersTable(CRM.getContent()); }
  function _filterBuyers(key, val) { _renderBuyersTable(CRM.getContent()); }
  function _sortBuyers(key) {
    var st = _state.buyers;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderBuyersTable(CRM.getContent());
  }
  function _pageBuyers(p) { _state.buyers.page = p; _renderBuyersTable(CRM.getContent()); }
  function _openBuyer(id) { Router.navigate('/workspace/client/' + id + '/overview'); }
  function _newBuyer() { CRM.quickNewClient({ role: 'buyer' }); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 3: LANDLORD SELLERS (bridge)
  // ═══════════════════════════════════════════════════════════════════════
  function landlordSellers() {
    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('landlord-sellers') + UI.loading();

    MallanAPI._fetch('/api/crm/sales/landlord-sellers').then(function (data) {
      _state.landlordSellers.data = (data.landlordSellers || []).map(function (s) { return ClientNormalizer.normalize(s); });
      _renderLandlordSellersTable(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('landlord-sellers') + UI.emptyState('fa-exchange-alt', 'No landlords with seller potential');
    });
  }

  function _renderLandlordSellersTable(c) {
    var st = _state.landlordSellers;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _renderSubnav('landlord-sellers');

    html += FilterBar.render({
      id: 'lsellers',
      placeholder: 'Search landlord-sellers...',
      onSearch: 'SalesCRM._searchLandlordSellers',
      filters: [
        { key: 'potential', label: 'Seller Potential', options: [
          { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }
        ]},
      ],
      onFilter: 'SalesCRM._filterLandlordSellers',
    });

    html += ActivityTable.render({
      id: 'lsellers_table',
      columns: [
        { key: 'name', label: 'Landlord', render: function (r) {
          return '<span class="font-medium text-gray-900">' + E(r.name || '') + '</span>';
        }},
        { key: 'property_address', label: 'Property', render: function (r) { return E(r.property_address || '-'); }},
        { key: 'seller_potential', label: 'Seller Potential', render: function (r) {
          var p = r.seller_potential || 'low';
          var colors = { high: 'bg-red-100 text-red-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-gray-100 text-gray-600' };
          return '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + (colors[p] || colors.low) + '">' + E(p.toUpperCase()) + '</span>';
        }},
        { key: 'vacancy_risk', label: 'Vacancy Risk', render: function (r) {
          var v = r.vacancy_risk || '-';
          return E(v);
        }},
        { key: 'lease_end_date', label: 'Lease End', render: function (r) {
          return r.lease_end_date ? D(r.lease_end_date) : '-';
        }},
        { key: 'updated_at', label: 'Last Contact', render: function (r) {
          return r.last_contacted_at ? Utils.formatTimeAgo(r.last_contacted_at) : '-';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'SalesCRM._sortLandlordSellers',
      onRowClick: 'SalesCRM._openLandlordSeller',
      page: st.page,
      pageSize: 25,
      onPage: 'SalesCRM._pageLandlordSellers',
      emptyIcon: 'fa-exchange-alt',
      emptyText: 'No landlords with seller potential',
    });

    c.innerHTML = html;
  }

  function _searchLandlordSellers(q) { _state.landlordSellers.search = q; _state.landlordSellers.page = 1; _renderLandlordSellersTable(CRM.getContent()); }
  function _filterLandlordSellers() { _renderLandlordSellersTable(CRM.getContent()); }
  function _sortLandlordSellers(key) {
    var st = _state.landlordSellers;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderLandlordSellersTable(CRM.getContent());
  }
  function _pageLandlordSellers(p) { _state.landlordSellers.page = p; _renderLandlordSellersTable(CRM.getContent()); }
  function _openLandlordSeller(id) { Router.navigate('/workspace/client/' + id + '/overview'); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 4: SALE LISTINGS
  // ═══════════════════════════════════════════════════════════════════════
  function salesListings() {
    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('listings') + UI.loading();

    MallanAPI._fetch('/api/crm/sales/listings').then(function (data) {
      _state.listings.data = data.listings || [];
      _renderSalesListingsTable(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('listings') + UI.emptyState('fa-building', 'Unable to load sale listings');
    });
  }

  function _renderSalesListingsTable(c) {
    var st = _state.listings;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _renderSubnav('listings');

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
          return '<span class="font-medium text-gray-900">' + E(addr || '') + '</span>';
        }},
        { key: 'seller_name', label: 'Seller', render: function (r) { return E(r.seller_name || '-'); } },
        { key: 'status', label: 'Status', render: function (r) {
          var s = r.status || 'Active';
          var colors = { 'Active': 'bg-blue-100 text-blue-700', 'Pending': 'bg-orange-100 text-orange-700', 'Closed': 'bg-green-100 text-green-700', 'Coming Soon': 'bg-yellow-100 text-yellow-700' };
          return '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + (colors[s] || 'bg-gray-100 text-gray-600') + '">' + E(s) + '</span>';
        }},
        { key: 'list_price', label: 'Price', render: function (r) { return Utils.formatMoney(r.list_price || 0); } },
        { key: 'dom', label: 'DOM', render: function (r) { return String(r.dom || 0); } },
        { key: 'showings_count', label: 'Showings', render: function (r) { return String(r.showings_count || 0); } },
        { key: 'inquiries_count', label: 'Inquiries', render: function (r) { return String(r.inquiries_count || 0); } },
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

  function _searchListings(q) { _state.listings.search = q; _state.listings.page = 1; _renderSalesListingsTable(CRM.getContent()); }
  function _filterListings() { _renderSalesListingsTable(CRM.getContent()); }
  function _sortListings(key) {
    var st = _state.listings;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderSalesListingsTable(CRM.getContent());
  }
  function _pageListings(p) { _state.listings.page = p; _renderSalesListingsTable(CRM.getContent()); }
  function _openListing(id) { Router.navigate('/workspace/listing/' + id + '/overview'); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 5: SALES MARKETING
  // ═══════════════════════════════════════════════════════════════════════
  function salesMarketing() {
    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('marketing') + UI.loading();

    MallanAPI._fetch('/api/crm/campaigns?crm_type=sales').then(function (data) {
      _state.marketing.data = data.campaigns || [];
      _renderSalesMarketing(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('marketing') + UI.emptyState('fa-bullhorn', 'Unable to load campaigns');
    });
  }

  function _renderSalesMarketing(c) {
    var st = _state.marketing;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _renderSubnav('marketing');

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
        { key: 'name', label: 'Campaign', render: function (r) { return '<span class="font-medium">' + E(r.name || '') + '</span>'; } },
        { key: 'audience_type', label: 'Audience', render: function (r) { return E(r.audience_type || '-'); } },
        { key: 'campaign_type', label: 'Type', render: function (r) { return E((r.campaign_type || '').replace(/_/g, ' ')); } },
        { key: 'status', label: 'Status', render: function (r) {
          var colors = { draft: 'bg-gray-100 text-gray-600', scheduled: 'bg-blue-100 text-blue-700', sent: 'bg-green-100 text-green-700', recurring: 'bg-purple-100 text-purple-700' };
          return '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + (colors[r.status] || 'bg-gray-100 text-gray-600') + '">' + E(r.status || 'draft') + '</span>';
        }},
        { key: 'sent_count', label: 'Sent', render: function (r) { return String(r.sent_count || 0); } },
        { key: 'open_rate', label: 'Open %', render: function (r) {
          var rate = r.sent_count > 0 ? Math.round((r.open_count / r.sent_count) * 100) : 0;
          return rate + '%';
        }},
        { key: 'last_run_at', label: 'Last Run', render: function (r) { return r.last_run_at ? Utils.formatTimeAgo(r.last_run_at) : '-'; } },
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

  function _searchMarketing(q) { _state.marketing.search = q; _state.marketing.page = 1; _renderSalesMarketing(CRM.getContent()); }
  function _sortMarketing(key) {
    var st = _state.marketing;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderSalesMarketing(CRM.getContent());
  }
  function _pageMarketing(p) { _state.marketing.page = p; _renderSalesMarketing(CRM.getContent()); }
  function _newCampaign() { CRM.toast('Campaign creation — coming next sprint', 'info'); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 6: SALES ACTIVITY FEED
  // ═══════════════════════════════════════════════════════════════════════
  function salesActivity() {
    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('activity') + UI.loading();

    MallanAPI._fetch('/api/crm/sales/activity').then(function (data) {
      _state.activity.data = data.events || [];
      _renderSalesActivity(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('activity') + UI.emptyState('fa-stream', 'Unable to load activity');
    });
  }

  function _renderSalesActivity(c) {
    var events = _state.activity.data;
    var filter = _state.activity.filter;
    if (filter !== 'all') {
      events = events.filter(function (e) { return e.client_type === filter; });
    }

    var html = _renderSubnav('activity');

    // Filter tabs
    html += '<div class="flex gap-1 mb-4">';
    ['all', 'sellers', 'buyers', 'investors', 'landlord-sellers'].forEach(function (f) {
      var active = filter === f;
      var label = f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1).replace('-', ' ');
      html += '<button class="px-3 py-1.5 text-xs font-bold rounded-lg transition-all ' +
        (active ? 'bg-gold text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gold') +
        '" onclick="SalesCRM._filterActivity(\'' + f + '\')">' + label + '</button>';
    });
    html += '</div>';

    // Timeline
    if (events.length === 0) {
      html += UI.emptyState('fa-stream', 'No activity yet');
    } else {
      html += '<div class="space-y-2">';
      events.forEach(function (ev) {
        var icon = _activityIcon(ev.activity_type);
        html += '<div class="card p-3 flex items-start gap-3">' +
          '<div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style="background:' + icon.bg + '">' +
            '<i class="fas ' + icon.icon + ' text-xs" style="color:' + icon.color + '"></i></div>' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm text-gray-900">' + E(ev.title || '') + '</p>' +
            (ev.detail ? '<p class="text-xs text-gray-500 mt-0.5">' + E(ev.detail) + '</p>' : '') +
          '</div>' +
          '<span class="text-[10px] text-gray-400 flex-shrink-0">' + Utils.formatTimeAgo(ev.created_at) + '</span>' +
        '</div>';
      });
      html += '</div>';
    }

    c.innerHTML = html;
  }

  function _filterActivity(f) { _state.activity.filter = f; _renderSalesActivity(CRM.getContent()); }

  function _activityIcon(type) {
    var map = {
      portal_login: { icon: 'fa-sign-in-alt', color: '#3B82F6', bg: '#EFF6FF' },
      listing_view: { icon: 'fa-eye', color: '#8B5CF6', bg: '#F5F3FF' },
      showing: { icon: 'fa-calendar', color: '#F59E0B', bg: '#FFFBEB' },
      offer: { icon: 'fa-handshake', color: '#059669', bg: '#ECFDF5' },
      comment: { icon: 'fa-comment', color: '#6366F1', bg: '#EEF2FF' },
      email: { icon: 'fa-envelope', color: '#EC4899', bg: '#FDF2F8' },
      status_change: { icon: 'fa-exchange-alt', color: '#B8860B', bg: '#FFFBF0' },
    };
    return map[type] || { icon: 'fa-circle', color: '#9CA3AF', bg: '#F9FAFB' };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 7: SALES AUTOMATION
  // ═══════════════════════════════════════════════════════════════════════
  function salesAutomation() {
    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('automation') + UI.loading();

    MallanAPI._fetch('/api/crm/automation/status?crm_type=sales').then(function (data) {
      _state.automation.data = data.contacts || [];
      _renderSalesAutomation(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('automation') + UI.emptyState('fa-robot', 'Unable to load automation status');
    });
  }

  function _renderSalesAutomation(c) {
    var st = _state.automation;
    var rows = ActivityTable.sortRows(st.data, st.sort.key, st.sort.dir);

    var html = _renderSubnav('automation');

    html += ActivityTable.render({
      id: 'sautomation_table',
      columns: [
        { key: 'name', label: 'Contact', render: function (r) { return '<span class="font-medium">' + E(r.name || '') + '</span>'; } },
        { key: 'type', label: 'Type', render: function (r) { return E(r.type || '-'); } },
        { key: 'sales_drip_on', label: 'Drip', render: function (r) {
          return r.sales_drip_on
            ? '<span class="text-green-600 font-bold text-xs">ON</span>'
            : '<span class="text-gray-400 text-xs">OFF</span>';
        }},
        { key: 'sales_drip_status', label: 'Tier', render: function (r) {
          var tier = r.sales_drip_status || 'paused';
          var colors = { active: 'bg-green-100 text-green-700', monthly: 'bg-blue-100 text-blue-700', quarterly: 'bg-yellow-100 text-yellow-700', biannual: 'bg-gray-100 text-gray-600', paused: 'bg-red-100 text-red-700' };
          return '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + (colors[tier] || colors.paused) + '">' + E(tier) + '</span>';
        }},
        { key: 'last_sales_email_opened', label: 'Last Opened', render: function (r) {
          return r.last_sales_email_opened ? Utils.formatTimeAgo(r.last_sales_email_opened) : '-';
        }},
        { key: 'last_response_at', label: 'Last Response', render: function (r) {
          return r.last_response_at ? Utils.formatTimeAgo(r.last_response_at) : '-';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'SalesCRM._sortAutomation',
      onRowClick: 'SalesCRM._openAutomationContact',
      page: st.page,
      pageSize: 25,
      onPage: 'SalesCRM._pageAutomation',
      emptyIcon: 'fa-robot',
      emptyText: 'No automation contacts',
    });

    c.innerHTML = html;
  }

  function _sortAutomation(key) {
    var st = _state.automation;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderSalesAutomation(CRM.getContent());
  }
  function _pageAutomation(p) { _state.automation.page = p; _renderSalesAutomation(CRM.getContent()); }
  function _openAutomationContact(id) { Router.navigate('/workspace/client/' + id + '/overview'); }

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

    // Internal handlers exposed for inline onclick
    _searchSellers: _searchSellers,
    _filterSellers: _filterSellers,
    _sortSellers: _sortSellers,
    _pageSellers: _pageSellers,
    _openSeller: _openSeller,
    _newSeller: _newSeller,
    _searchBuyers: _searchBuyers,
    _filterBuyers: _filterBuyers,
    _sortBuyers: _sortBuyers,
    _pageBuyers: _pageBuyers,
    _openBuyer: _openBuyer,
    _newBuyer: _newBuyer,
    _searchLandlordSellers: _searchLandlordSellers,
    _filterLandlordSellers: _filterLandlordSellers,
    _sortLandlordSellers: _sortLandlordSellers,
    _pageLandlordSellers: _pageLandlordSellers,
    _openLandlordSeller: _openLandlordSeller,
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
    _sortAutomation: _sortAutomation,
    _pageAutomation: _pageAutomation,
    _openAutomationContact: _openAutomationContact,
  };
})();
