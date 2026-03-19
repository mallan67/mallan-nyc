// ═══════════════════════════════════════════════════════════════════════════════
// SALES CRM — v2 Redesign
// Subnav: Seller Prospects | Active Sellers | Buyer Prospects | Active Buyers |
//         Listings | Marketing | Activity
// Prospect pages are conversion-centric (CMA, outreach, "Convert to Listing" CTA)
// Active pages link into the listing backend / listings management
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, Router, Store, UI, Utils, FilterBar, ActivityTable, MallanAPI, ClientNormalizer */

var SalesCRM = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  var TABS = [
    { id: 'seller-prospects',  route: '/sales/seller-prospects',  label: 'Seller Prospects',  icon: 'fa-user-clock' },
    { id: 'sellers',           route: '/sales/sellers',           label: 'Active Sellers',    icon: 'fa-home' },
    { id: 'buyer-prospects',   route: '/sales/buyer-prospects',   label: 'Buyer Prospects',   icon: 'fa-user-clock' },
    { id: 'buyers',            route: '/sales/buyers',            label: 'Active Buyers',     icon: 'fa-user-tag' },
    { id: 'listings',          route: '/sales/listings',          label: 'Listings',          icon: 'fa-building' },
    { id: 'marketing',         route: '/sales/marketing',         label: 'Marketing',         icon: 'fa-bullhorn' },
    { id: 'activity',          route: '/sales/activity',          label: 'Activity',          icon: 'fa-stream' },
  ];

  // State per tab
  var _state = {
    sellerProspects: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    sellers: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    buyerProspects: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    buyers: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    listings: { data: [], sort: { key: 'address', dir: 'asc' }, page: 1, search: '' },
    marketing: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    activity: { data: [], page: 1, filter: 'all' },
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
  // TAB 1: SELLER PROSPECTS — conversion-centric
  // ═══════════════════════════════════════════════════════════════════════
  function sellerProspects() {
    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('seller-prospects') + UI.loading();

    MallanAPI._fetch('/api/crm/sales/sellers?phase=prospect').then(function (data) {
      _state.sellerProspects.data = (data.sellers || data.clients || []).map(function (s) { return ClientNormalizer.normalize(s); });
      _renderSellerProspectsTable(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('seller-prospects') + UI.emptyState('fa-user-clock', 'Unable to load seller prospects');
    });
  }

  function _renderSellerProspectsTable(c) {
    var st = _state.sellerProspects;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _renderSubnav('seller-prospects');

    html += FilterBar.render({
      id: 'seller_prospects',
      placeholder: 'Search seller prospects...',
      onSearch: 'SalesCRM._searchSellerProspects',
      filters: [
        { key: 'source', label: 'Source', options: [
          { value: 'referral', label: 'Referral' }, { value: 'website', label: 'Website' },
          { value: 'manual', label: 'Manual' }, { value: 'streetEasy', label: 'StreetEasy' }
        ]},
      ],
      onFilter: 'SalesCRM._filterSellerProspects',
      quickActions: [
        { label: 'New Seller Prospect', icon: 'fa-plus', onclick: 'CRM.quickNewClient({ role: "seller" })' },
      ],
    });

    html += ActivityTable.render({
      id: 'seller_prospects_table',
      columns: [
        { key: 'name', label: 'Name', render: function (r) {
          var badge = '';
          if (r.entity_name) badge = ' <span class="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-bold">' + E(r.entity_type || 'Entity') + '</span>';
          return '<span class="font-medium text-gray-900">' + E(r.name || '') + '</span>' + badge;
        }},
        { key: 'property_address', label: 'Property', render: function (r) {
          return E(r.property_address || r.address || '-');
        }},
        { key: 'source', label: 'Source', render: function (r) {
          return '<span class="text-xs text-gray-500">' + E(r.source || '-') + '</span>';
        }},
        { key: 'last_contacted_at', label: 'Last Contact', render: function (r) {
          return r.last_contacted_at ? Utils.formatTimeAgo(r.last_contacted_at) : '<span class="text-gray-400">Never</span>';
        }},
        { key: 'next_follow_up', label: 'Next Follow-up', render: function (r) {
          if (!r.next_follow_up) return '<span class="text-gray-400">-</span>';
          var d = new Date(r.next_follow_up);
          var isPast = d < new Date();
          return '<span class="' + (isPast ? 'text-red-600 font-bold' : '') + '">' + D(r.next_follow_up) + '</span>';
        }},
        { key: 'updated_at', label: 'Last Activity', render: function (r) {
          return r.updated_at ? Utils.formatTimeAgo(r.updated_at) : '-';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'SalesCRM._sortSellerProspects',
      onRowClick: 'SalesCRM._openClient',
      page: st.page,
      pageSize: 25,
      onPage: 'SalesCRM._pageSellerProspects',
      emptyIcon: 'fa-user-clock',
      emptyText: 'No seller prospects — add one to start your pipeline',
    });

    c.innerHTML = html;
  }

  function _searchSellerProspects(q) { _state.sellerProspects.search = q; _state.sellerProspects.page = 1; _renderSellerProspectsTable(CRM.getContent()); }
  function _filterSellerProspects() { _renderSellerProspectsTable(CRM.getContent()); }
  function _sortSellerProspects(key) {
    var st = _state.sellerProspects;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderSellerProspectsTable(CRM.getContent());
  }
  function _pageSellerProspects(p) { _state.sellerProspects.page = p; _renderSellerProspectsTable(CRM.getContent()); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 2: ACTIVE SELLERS — linked to listings
  // ═══════════════════════════════════════════════════════════════════════
  function activeSellers() {
    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('sellers') + UI.loading();

    MallanAPI._fetch('/api/crm/sales/sellers?phase=active').then(function (data) {
      _state.sellers.data = (data.sellers || data.clients || []).map(function (s) { return ClientNormalizer.normalize(s); });
      _renderSellersTable(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('sellers') + UI.emptyState('fa-home', 'Unable to load active sellers');
    });
  }

  function _renderSellersTable(c) {
    var st = _state.sellers;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _renderSubnav('sellers');

    html += FilterBar.render({
      id: 'sellers',
      placeholder: 'Search active sellers...',
      onSearch: 'SalesCRM._searchSellers',
      filters: [
        { key: 'status', label: 'Listing Status', options: [
          { value: 'Active', label: 'Active' }, { value: 'Coming Soon', label: 'Coming Soon' },
          { value: 'Under Contract', label: 'Under Contract' }, { value: 'Closed', label: 'Closed' }
        ]},
      ],
      onFilter: 'SalesCRM._filterSellers',
    });

    html += ActivityTable.render({
      id: 'sellers_table',
      columns: [
        { key: 'name', label: 'Seller', render: function (r) {
          var badge = '';
          if (r.entity_name) badge = ' <span class="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-bold">' + E(r.entity_type || 'Entity') + '</span>';
          return '<span class="font-medium text-gray-900">' + E(r.name || '') + '</span>' + badge;
        }},
        { key: 'property_address', label: 'Listing', render: function (r) {
          return E(r.property_address || r.address || '-');
        }},
        { key: 'listing_status', label: 'Status', render: function (r) {
          var s = r.listing_status || 'Active';
          var colors = { 'Active': 'bg-blue-100 text-blue-700', 'Coming Soon': 'bg-yellow-100 text-yellow-700', 'Under Contract': 'bg-purple-100 text-purple-700', 'Closed': 'bg-green-100 text-green-700' };
          var cls = colors[s] || 'bg-gray-100 text-gray-600';
          return '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + cls + '">' + E(s) + '</span>';
        }},
        { key: 'list_price', label: 'Price', render: function (r) {
          return r.list_price ? $(Number(r.list_price)) : '-';
        }},
        { key: 'showings_count', label: 'Showings', render: function (r) { return String(r.showings_count || 0); } },
        { key: 'dom', label: 'DOM', render: function (r) { return String(r.dom || r.days_on_market || 0); } },
        { key: 'updated_at', label: 'Last Action', render: function (r) {
          return r.updated_at ? Utils.formatTimeAgo(r.updated_at) : '-';
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
      emptyText: 'No active sellers — convert a prospect to get started',
    });

    c.innerHTML = html;
  }

  function _searchSellers(q) { _state.sellers.search = q; _state.sellers.page = 1; _renderSellersTable(CRM.getContent()); }
  function _filterSellers(key, val) { _renderSellersTable(CRM.getContent()); }
  function _sortSellers(key) {
    var st = _state.sellers;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderSellersTable(CRM.getContent());
  }
  function _pageSellers(p) { _state.sellers.page = p; _renderSellersTable(CRM.getContent()); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 3: BUYER PROSPECTS — qualification-centric
  // ═══════════════════════════════════════════════════════════════════════
  function buyerProspects() {
    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('buyer-prospects') + UI.loading();

    MallanAPI._fetch('/api/crm/sales/buyers?phase=prospect').then(function (data) {
      _state.buyerProspects.data = (data.buyers || data.clients || []).map(function (b) { return ClientNormalizer.normalize(b); });
      _renderBuyerProspectsTable(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('buyer-prospects') + UI.emptyState('fa-user-clock', 'Unable to load buyer prospects');
    });
  }

  function _renderBuyerProspectsTable(c) {
    var st = _state.buyerProspects;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _renderSubnav('buyer-prospects');

    html += FilterBar.render({
      id: 'buyer_prospects',
      placeholder: 'Search buyer prospects...',
      onSearch: 'SalesCRM._searchBuyerProspects',
      filters: [
        { key: 'type', label: 'Type', options: [
          { value: 'buyer', label: 'Buyers' }, { value: 'investor', label: 'Investors' }
        ]},
        { key: 'pre_approved', label: 'Pre-Approved', options: [
          { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }
        ]},
      ],
      onFilter: 'SalesCRM._filterBuyerProspects',
      quickActions: [
        { label: 'New Buyer Prospect', icon: 'fa-plus', onclick: 'CRM.quickNewClient({ role: "buyer" })' },
      ],
    });

    html += ActivityTable.render({
      id: 'buyer_prospects_table',
      columns: [
        { key: 'name', label: 'Name', render: function (r) {
          var badges = '';
          if (r.is_investor) badges += ' <span class="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-bold">Investor</span>';
          if (r.entity_name) badges += ' <span class="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-bold">' + E(r.entity_type || 'Entity') + '</span>';
          return '<span class="font-medium text-gray-900">' + E(r.name || '') + '</span>' + badges;
        }},
        { key: 'budget', label: 'Budget', render: function (r) {
          if (r.pre_approved_amount) return $(Number(r.pre_approved_amount));
          if (r.available_funds) return $(Number(r.available_funds));
          return '<span class="text-gray-400">-</span>';
        }},
        { key: 'pre_approved', label: 'Pre-Approved', render: function (r) {
          return r.pre_approved
            ? '<span class="text-green-600 font-bold text-xs">Yes</span>'
            : '<span class="text-gray-400 text-xs">No</span>';
        }},
        { key: 'source', label: 'Source', render: function (r) {
          return '<span class="text-xs text-gray-500">' + E(r.source || '-') + '</span>';
        }},
        { key: 'last_contacted_at', label: 'Last Contact', render: function (r) {
          return r.last_contacted_at ? Utils.formatTimeAgo(r.last_contacted_at) : '<span class="text-gray-400">Never</span>';
        }},
        { key: 'conviction_score', label: 'Conviction', render: function (r) {
          var score = r.conviction_score || 0;
          var color = score >= 70 ? 'text-green-600' : score >= 40 ? 'text-yellow-600' : 'text-gray-400';
          return '<span class="font-bold ' + color + '">' + score + '</span>';
        }},
        { key: 'updated_at', label: 'Last Activity', render: function (r) {
          return r.updated_at ? Utils.formatTimeAgo(r.updated_at) : '-';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'SalesCRM._sortBuyerProspects',
      onRowClick: 'SalesCRM._openClient',
      page: st.page,
      pageSize: 25,
      onPage: 'SalesCRM._pageBuyerProspects',
      emptyIcon: 'fa-user-clock',
      emptyText: 'No buyer prospects — add one to start qualifying',
    });

    c.innerHTML = html;
  }

  function _searchBuyerProspects(q) { _state.buyerProspects.search = q; _state.buyerProspects.page = 1; _renderBuyerProspectsTable(CRM.getContent()); }
  function _filterBuyerProspects() { _renderBuyerProspectsTable(CRM.getContent()); }
  function _sortBuyerProspects(key) {
    var st = _state.buyerProspects;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderBuyerProspectsTable(CRM.getContent());
  }
  function _pageBuyerProspects(p) { _state.buyerProspects.page = p; _renderBuyerProspectsTable(CRM.getContent()); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 4: ACTIVE BUYERS — listings management
  // ═══════════════════════════════════════════════════════════════════════
  function activeBuyers() {
    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('buyers') + UI.loading();

    MallanAPI._fetch('/api/crm/sales/buyers?phase=active').then(function (data) {
      _state.buyers.data = (data.buyers || data.clients || []).map(function (b) { return ClientNormalizer.normalize(b); });
      _renderBuyersTable(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('buyers') + UI.emptyState('fa-user-tag', 'Unable to load active buyers');
    });
  }

  function _renderBuyersTable(c) {
    var st = _state.buyers;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _renderSubnav('buyers');

    html += FilterBar.render({
      id: 'buyers',
      placeholder: 'Search active buyers & investors...',
      onSearch: 'SalesCRM._searchBuyers',
      filters: [
        { key: 'type', label: 'Type', options: [
          { value: 'buyer', label: 'Buyers' }, { value: 'investor', label: 'Investors' }
        ]},
        { key: 'stage', label: 'Stage', options: [
          { value: 'showing', label: 'Showing' },
          { value: 'offer', label: 'Offer' }, { value: 'deal', label: 'Deal' }
        ]},
      ],
      onFilter: 'SalesCRM._filterBuyers',
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
          if (r.pre_approved_amount) return $(Number(r.pre_approved_amount));
          if (r.available_funds) return $(Number(r.available_funds));
          return '-';
        }},
        { key: 'pipeline_stage', label: 'Stage', render: function (r) {
          return UI.stageBadge(r.pipeline_stage || 'active');
        }},
        { key: 'listings_sent_count', label: 'Listings Sent', render: function (r) { return String(r.listings_sent_count || 0); } },
        { key: 'showings_count', label: 'Showings', render: function (r) { return String(r.showings_count || 0); } },
        { key: 'last_viewed_listing_at', label: 'Last Viewed', render: function (r) {
          return r.last_viewed_listing_at ? Utils.formatTimeAgo(r.last_viewed_listing_at) : '<span class="text-gray-400">-</span>';
        }},
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
      onRowClick: 'SalesCRM._openClient',
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

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 5: SALE LISTINGS
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
        { key: 'seller_name', label: 'Seller', render: function (r) { return E(r.seller_name || r.owner_name || '-'); } },
        { key: 'status', label: 'Status', render: function (r) {
          var s = r.status || 'Active';
          var colors = { 'Active': 'bg-blue-100 text-blue-700', 'Pending': 'bg-orange-100 text-orange-700', 'Closed': 'bg-green-100 text-green-700', 'Coming Soon': 'bg-yellow-100 text-yellow-700' };
          return '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + (colors[s] || 'bg-gray-100 text-gray-600') + '">' + E(s) + '</span>';
        }},
        { key: 'list_price', label: 'Price', render: function (r) { return $(Number(r.list_price || 0)); } },
        { key: 'dom', label: 'DOM', render: function (r) { return String(r.dom || r.days_on_market || 0); } },
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
  // TAB 6: SALES MARKETING
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
  // TAB 7: SALES ACTIVITY FEED
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
    ['all', 'seller-prospects', 'sellers', 'buyer-prospects', 'buyers'].forEach(function (f) {
      var active = filter === f;
      var label = f === 'all' ? 'All' : f.split('-').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
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
      conversion: { icon: 'fa-check-circle', color: '#059669', bg: '#ECFDF5' },
      cma: { icon: 'fa-chart-bar', color: '#6366F1', bg: '#EEF2FF' },
    };
    return map[type] || { icon: 'fa-circle', color: '#9CA3AF', bg: '#F9FAFB' };
  }

  // ─── Shared handlers ──────────────────────────────────────────────────
  function _openClient(id) { Router.navigate('/workspace/client/' + id + '/overview'); }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════
  return {
    sellerProspects: sellerProspects,
    activeSellers: activeSellers,
    buyerProspects: buyerProspects,
    activeBuyers: activeBuyers,
    salesListings: salesListings,
    salesMarketing: salesMarketing,
    salesActivity: salesActivity,

    // Internal handlers exposed for inline onclick
    _searchSellerProspects: _searchSellerProspects,
    _filterSellerProspects: _filterSellerProspects,
    _sortSellerProspects: _sortSellerProspects,
    _pageSellerProspects: _pageSellerProspects,
    _searchSellers: _searchSellers,
    _filterSellers: _filterSellers,
    _sortSellers: _sortSellers,
    _pageSellers: _pageSellers,
    _searchBuyerProspects: _searchBuyerProspects,
    _filterBuyerProspects: _filterBuyerProspects,
    _sortBuyerProspects: _sortBuyerProspects,
    _pageBuyerProspects: _pageBuyerProspects,
    _searchBuyers: _searchBuyers,
    _filterBuyers: _filterBuyers,
    _sortBuyers: _sortBuyers,
    _pageBuyers: _pageBuyers,
    _openClient: _openClient,
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
  };
})();
