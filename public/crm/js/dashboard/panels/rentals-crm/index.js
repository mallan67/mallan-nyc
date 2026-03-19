// ═══════════════════════════════════════════════════════════════════════════════
// RENTALS CRM — v2 Redesign
// Subnav: Landlord Prospects | Active Landlords | Renter Prospects | Active Renters |
//         Viewed/Did Not Rent | Current Tenants | Marketing | Activity
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, Router, Store, UI, Utils, FilterBar, ActivityTable, MallanAPI, ClientNormalizer */

var RentalsCRM = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  var TABS = [
    { id: 'landlord-prospects', route: '/rentals/landlord-prospects', label: 'Landlord Prospects', icon: 'fa-user-clock' },
    { id: 'landlords',          route: '/rentals/landlords',          label: 'Active Landlords',   icon: 'fa-key' },
    { id: 'renter-prospects',   route: '/rentals/renter-prospects',   label: 'Renter Prospects',   icon: 'fa-user-clock' },
    { id: 'renters',            route: '/rentals/renters',            label: 'Active Renters',     icon: 'fa-search' },
    { id: 'viewed',             route: '/rentals/viewed',             label: 'Viewed / Did Not Rent', icon: 'fa-eye-slash' },
    { id: 'tenants',            route: '/rentals/tenants',            label: 'Current Tenants',    icon: 'fa-user-check' },
    { id: 'marketing',          route: '/rentals/marketing',          label: 'Marketing',          icon: 'fa-bullhorn' },
    { id: 'activity',           route: '/rentals/activity',           label: 'Activity',           icon: 'fa-stream' },
  ];

  var _state = {
    landlordProspects: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    landlords: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    renterProspects: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    renters: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    viewed: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    tenants: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    listings: { data: [], sort: { key: 'address', dir: 'asc' }, page: 1, search: '' },
    marketing: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    activity: { data: [], page: 1, filter: 'all' },
  };

  // ─── Subnav ──────────────────────────────────────────────────────────
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
  // TAB 1: LANDLORD PROSPECTS
  // ═══════════════════════════════════════════════════════════════════════
  function landlordProspects() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('landlord-prospects') + UI.loading();

    MallanAPI._fetch('/api/crm/rentals/landlords?phase=prospect').then(function (data) {
      _state.landlordProspects.data = (data.landlords || data.clients || []).map(function (l) { return ClientNormalizer.normalize(l); });
      _renderLandlordProspectsTable(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('landlord-prospects') + UI.emptyState('fa-user-clock', 'Unable to load landlord prospects');
    });
  }

  function _renderLandlordProspectsTable(c) {
    var st = _state.landlordProspects;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _renderSubnav('landlord-prospects');

    html += FilterBar.render({
      id: 'landlord_prospects',
      placeholder: 'Search landlord prospects...',
      onSearch: 'RentalsCRM._searchLandlordProspects',
      filters: [
        { key: 'source', label: 'Source', options: [
          { value: 'referral', label: 'Referral' }, { value: 'website', label: 'Website' },
          { value: 'manual', label: 'Manual' }, { value: 'streetEasy', label: 'StreetEasy' }
        ]},
      ],
      onFilter: 'RentalsCRM._filterLandlordProspects',
      quickActions: [
        { label: 'New Landlord', icon: 'fa-plus', onclick: 'CRM.quickNewClient({ role: "landlord" })' },
      ],
    });

    html += ActivityTable.render({
      id: 'landlord_prospects_table',
      columns: [
        { key: 'name', label: 'Name', render: function (r) {
          var badge = '';
          if (r.entity_name) badge = ' <span class="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-bold">' + E(r.entity_type || 'Entity') + '</span>';
          return '<span class="font-medium text-gray-900">' + E(r.name || '') + '</span>' + badge;
        }},
        { key: 'property_address', label: 'Property', render: function (r) {
          var addr = E(r.property_address || '-');
          if (r.unit_number) addr += ' #' + E(r.unit_number);
          return addr;
        }},
        { key: 'source', label: 'Source', render: function (r) {
          return '<span class="text-xs text-gray-500">' + E(r.source || '-') + '</span>';
        }},
        { key: 'vacancy_risk', label: 'Vacancy Risk', render: function (r) {
          var v = r.vacancy_risk || '-';
          var colors = { high: 'text-red-600', medium: 'text-yellow-600', low: 'text-green-600' };
          return '<span class="font-bold text-xs ' + (colors[v] || '') + '">' + E(v) + '</span>';
        }},
        { key: 'last_contacted_at', label: 'Last Contact', render: function (r) {
          return r.last_contacted_at ? Utils.formatTimeAgo(r.last_contacted_at) : '<span class="text-gray-400">Never</span>';
        }},
        { key: 'updated_at', label: 'Last Activity', render: function (r) {
          return r.updated_at ? Utils.formatTimeAgo(r.updated_at) : '-';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'RentalsCRM._sortLandlordProspects',
      onRowClick: 'RentalsCRM._openClient',
      page: st.page,
      pageSize: 25,
      onPage: 'RentalsCRM._pageLandlordProspects',
      emptyIcon: 'fa-user-clock',
      emptyText: 'No landlord prospects',
    });

    c.innerHTML = html;
  }

  function _searchLandlordProspects(q) { _state.landlordProspects.search = q; _state.landlordProspects.page = 1; _renderLandlordProspectsTable(CRM.getContent()); }
  function _filterLandlordProspects() { _renderLandlordProspectsTable(CRM.getContent()); }
  function _sortLandlordProspects(key) {
    var st = _state.landlordProspects;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderLandlordProspectsTable(CRM.getContent());
  }
  function _pageLandlordProspects(p) { _state.landlordProspects.page = p; _renderLandlordProspectsTable(CRM.getContent()); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 2: ACTIVE LANDLORDS — linked to rental listings
  // ═══════════════════════════════════════════════════════════════════════
  function activeLandlords() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('landlords') + UI.loading();

    MallanAPI._fetch('/api/crm/rentals/landlords?phase=active').then(function (data) {
      _state.landlords.data = (data.landlords || data.clients || []).map(function (l) { return ClientNormalizer.normalize(l); });
      _renderLandlordsTable(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('landlords') + UI.emptyState('fa-key', 'Unable to load active landlords');
    });
  }

  function _renderLandlordsTable(c) {
    var st = _state.landlords;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _renderSubnav('landlords');

    html += FilterBar.render({
      id: 'landlords',
      placeholder: 'Search active landlords...',
      onSearch: 'RentalsCRM._searchLandlords',
      filters: [
        { key: 'status', label: 'Listing Status', options: [
          { value: 'Active', label: 'Active' }, { value: 'Rented', label: 'Rented' },
          { value: 'Vacant', label: 'Vacant' }, { value: 'Coming Soon', label: 'Coming Soon' }
        ]},
      ],
      onFilter: 'RentalsCRM._filterLandlords',
    });

    html += ActivityTable.render({
      id: 'landlords_table',
      columns: [
        { key: 'name', label: 'Landlord', render: function (r) {
          var badge = '';
          if (r.entity_name) badge = ' <span class="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-bold">' + E(r.entity_type || 'Entity') + '</span>';
          return '<span class="font-medium text-gray-900">' + E(r.name || '') + '</span>' + badge;
        }},
        { key: 'property_address', label: 'Property / Unit', render: function (r) {
          var addr = E(r.property_address || '-');
          if (r.unit_number) addr += ' #' + E(r.unit_number);
          return addr;
        }},
        { key: 'listing_status', label: 'Listing Status', render: function (r) {
          var s = r.listing_status || 'No Listing';
          var colors = { 'Active': 'bg-blue-100 text-blue-700', 'Rented': 'bg-green-100 text-green-700', 'Vacant': 'bg-red-100 text-red-700', 'Coming Soon': 'bg-yellow-100 text-yellow-700' };
          return '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + (colors[s] || 'bg-gray-100 text-gray-600') + '">' + E(s) + '</span>';
        }},
        { key: 'list_price', label: 'Rent', render: function (r) {
          return r.list_price ? $(Number(r.list_price)) + '/mo' : '-';
        }},
        { key: 'showings_count', label: 'Showings', render: function (r) { return String(r.showings_count || 0); } },
        { key: 'fee_structure', label: 'Fee', render: function (r) {
          var f = r.fee_structure || '-';
          return E(f.replace(/_/g, ' '));
        }},
        { key: 'seller_potential', label: 'Seller Potential', render: function (r) {
          var p = r.seller_potential || 'none';
          var colors = { high: 'bg-red-100 text-red-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-gray-100 text-gray-600', none: 'bg-gray-50 text-gray-400' };
          return '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + (colors[p] || colors.none) + '">' + E(p.toUpperCase()) + '</span>';
        }},
        { key: 'updated_at', label: 'Last Action', render: function (r) {
          return r.updated_at ? Utils.formatTimeAgo(r.updated_at) : '-';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'RentalsCRM._sortLandlords',
      onRowClick: 'RentalsCRM._openClient',
      page: st.page,
      pageSize: 25,
      onPage: 'RentalsCRM._pageLandlords',
      emptyIcon: 'fa-key',
      emptyText: 'No active landlords — convert a prospect to get started',
    });

    c.innerHTML = html;
  }

  function _searchLandlords(q) { _state.landlords.search = q; _state.landlords.page = 1; _renderLandlordsTable(CRM.getContent()); }
  function _filterLandlords() { _renderLandlordsTable(CRM.getContent()); }
  function _sortLandlords(key) {
    var st = _state.landlords;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderLandlordsTable(CRM.getContent());
  }
  function _pageLandlords(p) { _state.landlords.page = p; _renderLandlordsTable(CRM.getContent()); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 3: RENTER PROSPECTS
  // ═══════════════════════════════════════════════════════════════════════
  function renterProspects() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('renter-prospects') + UI.loading();

    MallanAPI._fetch('/api/crm/rentals/renters?phase=prospect').then(function (data) {
      _state.renterProspects.data = (data.renters || data.clients || []).map(function (r) { return ClientNormalizer.normalize(r); });
      _renderRenterProspectsTable(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('renter-prospects') + UI.emptyState('fa-user-clock', 'Unable to load renter prospects');
    });
  }

  function _renderRenterProspectsTable(c) {
    var st = _state.renterProspects;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _renderSubnav('renter-prospects');

    html += FilterBar.render({
      id: 'renter_prospects',
      placeholder: 'Search renter prospects...',
      onSearch: 'RentalsCRM._searchRenterProspects',
      filters: [
        { key: 'no_fee_only', label: 'Fee Pref', options: [
          { value: 'true', label: 'No-Fee Only' }, { value: 'false', label: 'Any' }
        ]},
      ],
      onFilter: 'RentalsCRM._filterRenterProspects',
      quickActions: [
        { label: 'New Renter', icon: 'fa-plus', onclick: 'CRM.quickNewClient({ role: "renter" })' },
      ],
    });

    html += ActivityTable.render({
      id: 'renter_prospects_table',
      columns: [
        { key: 'name', label: 'Name', render: function (r) {
          return '<span class="font-medium text-gray-900">' + E(r.name || '') + '</span>';
        }},
        { key: 'budget', label: 'Budget', render: function (r) {
          return r.rent_per_month ? $(Number(r.rent_per_month)) + '/mo' : '<span class="text-gray-400">-</span>';
        }},
        { key: 'no_fee_only', label: 'No-Fee', render: function (r) {
          return r.no_fee_only ? '<span class="text-red-600 font-bold text-xs">Yes</span>' : '<span class="text-gray-400 text-xs">No</span>';
        }},
        { key: 'docs_ready', label: 'Docs Ready', render: function (r) {
          var docs = r.docs_readiness || {};
          var total = 0, ready = 0;
          for (var k in docs) { total++; if (docs[k]) ready++; }
          if (total === 0) return '<span class="text-gray-400">-</span>';
          var pct = Math.round((ready / total) * 100);
          var color = pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600';
          return '<span class="font-bold text-xs ' + color + '">' + pct + '%</span>';
        }},
        { key: 'source', label: 'Source', render: function (r) {
          return '<span class="text-xs text-gray-500">' + E(r.source || '-') + '</span>';
        }},
        { key: 'last_contacted_at', label: 'Last Contact', render: function (r) {
          return r.last_contacted_at ? Utils.formatTimeAgo(r.last_contacted_at) : '<span class="text-gray-400">Never</span>';
        }},
        { key: 'updated_at', label: 'Last Activity', render: function (r) {
          return r.updated_at ? Utils.formatTimeAgo(r.updated_at) : '-';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'RentalsCRM._sortRenterProspects',
      onRowClick: 'RentalsCRM._openClient',
      page: st.page,
      pageSize: 25,
      onPage: 'RentalsCRM._pageRenterProspects',
      emptyIcon: 'fa-user-clock',
      emptyText: 'No renter prospects',
    });

    c.innerHTML = html;
  }

  function _searchRenterProspects(q) { _state.renterProspects.search = q; _state.renterProspects.page = 1; _renderRenterProspectsTable(CRM.getContent()); }
  function _filterRenterProspects() { _renderRenterProspectsTable(CRM.getContent()); }
  function _sortRenterProspects(key) {
    var st = _state.renterProspects;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderRenterProspectsTable(CRM.getContent());
  }
  function _pageRenterProspects(p) { _state.renterProspects.page = p; _renderRenterProspectsTable(CRM.getContent()); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 4: ACTIVE RENTERS — searching & showing
  // ═══════════════════════════════════════════════════════════════════════
  function activeRenters() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('renters') + UI.loading();

    MallanAPI._fetch('/api/crm/rentals/renters?phase=active').then(function (data) {
      _state.renters.data = (data.renters || data.clients || []).map(function (r) { return ClientNormalizer.normalize(r); });
      _renderRentersTable(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('renters') + UI.emptyState('fa-search', 'Unable to load active renters');
    });
  }

  function _renderRentersTable(c) {
    var st = _state.renters;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _renderSubnav('renters');

    html += FilterBar.render({
      id: 'renters',
      placeholder: 'Search active renters...',
      onSearch: 'RentalsCRM._searchRenters',
      filters: [
        { key: 'stage', label: 'Stage', options: [
          { value: 'showing', label: 'Showing' }, { value: 'application', label: 'Application' }
        ]},
      ],
      onFilter: 'RentalsCRM._filterRenters',
    });

    html += ActivityTable.render({
      id: 'renters_table',
      columns: [
        { key: 'name', label: 'Renter', render: function (r) {
          return '<span class="font-medium text-gray-900">' + E(r.name || '') + '</span>';
        }},
        { key: 'budget', label: 'Budget', render: function (r) {
          return r.rent_per_month ? $(Number(r.rent_per_month)) + '/mo' : '-';
        }},
        { key: 'pipeline_stage', label: 'Stage', render: function (r) {
          return UI.stageBadge(r.pipeline_stage || 'active');
        }},
        { key: 'listings_sent_count', label: 'Listings Sent', render: function (r) { return String(r.listings_sent_count || 0); } },
        { key: 'showings_count', label: 'Showings', render: function (r) { return String(r.showings_count || 0); } },
        { key: 'last_viewed_listing_at', label: 'Last Viewed', render: function (r) {
          return r.last_viewed_listing_at ? Utils.formatTimeAgo(r.last_viewed_listing_at) : '<span class="text-gray-400">-</span>';
        }},
        { key: 'updated_at', label: 'Last Action', render: function (r) {
          return r.updated_at ? Utils.formatTimeAgo(r.updated_at) : '-';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'RentalsCRM._sortRenters',
      onRowClick: 'RentalsCRM._openClient',
      page: st.page,
      pageSize: 25,
      onPage: 'RentalsCRM._pageRenters',
      emptyIcon: 'fa-search',
      emptyText: 'No active renters',
    });

    c.innerHTML = html;
  }

  function _searchRenters(q) { _state.renters.search = q; _state.renters.page = 1; _renderRentersTable(CRM.getContent()); }
  function _filterRenters() { _renderRentersTable(CRM.getContent()); }
  function _sortRenters(key) {
    var st = _state.renters;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderRentersTable(CRM.getContent());
  }
  function _pageRenters(p) { _state.renters.page = p; _renderRentersTable(CRM.getContent()); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 5: VIEWED / DID NOT RENT
  // ═══════════════════════════════════════════════════════════════════════
  function viewedDidNotRent() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('viewed') + UI.loading();

    MallanAPI._fetch('/api/crm/rentals/prospects').then(function (data) {
      _state.viewed.data = (data.prospects || data.clients || []).map(function (p) { return ClientNormalizer.normalize(p); });
      _renderViewedTable(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('viewed') + UI.emptyState('fa-eye-slash', 'Unable to load viewed/did-not-rent');
    });
  }

  function _renderViewedTable(c) {
    var st = _state.viewed;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _renderSubnav('viewed');

    html += FilterBar.render({
      id: 'viewed',
      placeholder: 'Search viewed/did-not-rent...',
      onSearch: 'RentalsCRM._searchViewed',
      filters: [
        { key: 'buyer_potential', label: 'Buyer Potential', options: [
          { value: 'high', label: 'High (70+)' }, { value: 'medium', label: 'Medium (40-69)' }, { value: 'low', label: 'Low (0-39)' }
        ]},
      ],
      onFilter: 'RentalsCRM._filterViewed',
    });

    html += ActivityTable.render({
      id: 'viewed_table',
      columns: [
        { key: 'name', label: 'Name', render: function (r) {
          return '<span class="font-medium text-gray-900">' + E(r.name || '') + '</span>';
        }},
        { key: 'email', label: 'Contact', render: function (r) { return E(r.email || r.phone || '-'); } },
        { key: 'last_viewed_address', label: 'Last Viewed', render: function (r) {
          return E(r.last_viewed_address || '-');
        }},
        { key: 'buyer_potential', label: 'Buyer Potential', render: function (r) {
          var bp = r.buyer_potential || 0;
          var color = bp >= 70 ? 'text-green-600' : bp >= 40 ? 'text-yellow-600' : 'text-gray-400';
          return '<span class="font-bold ' + color + '">' + bp + '</span>';
        }},
        { key: 'outreach_30d_date', label: '30d', render: function (r) { return r.outreach_30d_date ? D(r.outreach_30d_date) : '-'; } },
        { key: 'outreach_60d_date', label: '60d', render: function (r) { return r.outreach_60d_date ? D(r.outreach_60d_date) : '-'; } },
        { key: 'outreach_90d_date', label: '90d', render: function (r) { return r.outreach_90d_date ? D(r.outreach_90d_date) : '-'; } },
        { key: 'last_response_at', label: 'Last Response', render: function (r) {
          return r.last_response_at ? Utils.formatTimeAgo(r.last_response_at) : '-';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'RentalsCRM._sortViewed',
      onRowClick: 'RentalsCRM._openClient',
      page: st.page,
      pageSize: 25,
      onPage: 'RentalsCRM._pageViewed',
      emptyIcon: 'fa-eye-slash',
      emptyText: 'No viewed/did-not-rent records yet',
    });

    c.innerHTML = html;
  }

  function _searchViewed(q) { _state.viewed.search = q; _state.viewed.page = 1; _renderViewedTable(CRM.getContent()); }
  function _filterViewed() { _renderViewedTable(CRM.getContent()); }
  function _sortViewed(key) {
    var st = _state.viewed;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderViewedTable(CRM.getContent());
  }
  function _pageViewed(p) { _state.viewed.page = p; _renderViewedTable(CRM.getContent()); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 6: CURRENT TENANTS
  // ═══════════════════════════════════════════════════════════════════════
  function currentTenants() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('tenants') + UI.loading();

    MallanAPI._fetch('/api/crm/rentals/tenants').then(function (data) {
      _state.tenants.data = (data.tenants || data.clients || []).map(function (t) { return ClientNormalizer.normalize(t); });
      _renderTenantsTable(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('tenants') + UI.emptyState('fa-user-check', 'Unable to load tenants');
    });
  }

  function _renderTenantsTable(c) {
    var st = _state.tenants;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _renderSubnav('tenants');

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
        { key: 'name', label: 'Tenant', render: function (r) {
          return '<span class="font-medium text-gray-900">' + E(r.name || '') + '</span>';
        }},
        { key: 'property_address', label: 'Unit', render: function (r) {
          var addr = E(r.property_address || '-');
          if (r.unit_number) addr += ' #' + E(r.unit_number);
          return addr;
        }},
        { key: 'lease_start_date', label: 'Lease Start', render: function (r) { return r.lease_start_date ? D(r.lease_start_date) : '-'; } },
        { key: 'lease_end_date', label: 'Lease End', render: function (r) { return r.lease_end_date ? D(r.lease_end_date) : '-'; } },
        { key: 'days_left', label: 'Days Left', render: function (r) {
          if (!r.lease_end_date) return '-';
          var diff = Math.floor((new Date(r.lease_end_date).getTime() - Date.now()) / 86400000);
          var urgency = diff <= 30 ? 'text-red-600 font-bold' : diff <= 90 ? 'text-amber-600 font-bold' : 'text-green-600';
          return '<span class="' + urgency + '">' + diff + '</span>';
        }},
        { key: 'renewal_status', label: 'Renewal', render: function (r) {
          var s = r.renewal_status || 'pending';
          var colors = { renewing: 'bg-green-100 text-green-700', not_renewing: 'bg-red-100 text-red-700', pending: 'bg-yellow-100 text-yellow-700', month_to_month: 'bg-blue-100 text-blue-700' };
          return '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + (colors[s] || 'bg-gray-100 text-gray-600') + '">' + E(s.replace(/_/g, ' ')) + '</span>';
        }},
        { key: 'buyer_potential', label: 'Buyer Potential', render: function (r) {
          var bp = r.buyer_potential || 0;
          var color = bp >= 70 ? 'text-green-600' : bp >= 40 ? 'text-yellow-600' : 'text-gray-400';
          return '<span class="font-bold ' + color + '">' + bp + '</span>';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'RentalsCRM._sortTenants',
      onRowClick: 'RentalsCRM._openClient',
      page: st.page,
      pageSize: 25,
      onPage: 'RentalsCRM._pageTenants',
      emptyIcon: 'fa-user-check',
      emptyText: 'No current tenants with active leases',
    });

    c.innerHTML = html;
  }

  function _searchTenants(q) { _state.tenants.search = q; _state.tenants.page = 1; _renderTenantsTable(CRM.getContent()); }
  function _filterTenants() { _renderTenantsTable(CRM.getContent()); }
  function _sortTenants(key) {
    var st = _state.tenants;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderTenantsTable(CRM.getContent());
  }
  function _pageTenants(p) { _state.tenants.page = p; _renderTenantsTable(CRM.getContent()); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 7: RENTAL LISTINGS (legacy — accessible via direct route)
  // ═══════════════════════════════════════════════════════════════════════
  function rentalListings() {
    // Redirect to active landlords — rental listings are shown as the landlord's listing backend
    activeLandlords();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 8: RENTALS MARKETING
  // ═══════════════════════════════════════════════════════════════════════
  function rentalsMarketing() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('marketing') + UI.loading();

    MallanAPI._fetch('/api/crm/campaigns?crm_type=rentals').then(function (data) {
      _state.marketing.data = data.campaigns || [];
      _renderRentalsMarketing(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('marketing') + UI.emptyState('fa-bullhorn', 'Unable to load campaigns');
    });
  }

  function _renderRentalsMarketing(c) {
    var st = _state.marketing;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _renderSubnav('marketing');

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
      onSort: 'RentalsCRM._sortMarketing',
      page: st.page,
      pageSize: 25,
      onPage: 'RentalsCRM._pageMarketing',
      emptyIcon: 'fa-bullhorn',
      emptyText: 'No campaigns yet',
    });

    c.innerHTML = html;
  }

  function _searchMarketing(q) { _state.marketing.search = q; _state.marketing.page = 1; _renderRentalsMarketing(CRM.getContent()); }
  function _sortMarketing(key) {
    var st = _state.marketing;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderRentalsMarketing(CRM.getContent());
  }
  function _pageMarketing(p) { _state.marketing.page = p; _renderRentalsMarketing(CRM.getContent()); }
  function _newCampaign() { CRM.toast('Campaign creation — coming next sprint', 'info'); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 9: RENTALS ACTIVITY FEED
  // ═══════════════════════════════════════════════════════════════════════
  function rentalsActivity() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('activity') + UI.loading();

    MallanAPI._fetch('/api/crm/rentals/activity').then(function (data) {
      _state.activity.data = data.events || [];
      _renderRentalsActivity(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('activity') + UI.emptyState('fa-stream', 'Unable to load activity');
    });
  }

  function _renderRentalsActivity(c) {
    var events = _state.activity.data;
    var filter = _state.activity.filter;
    if (filter !== 'all') {
      events = events.filter(function (e) { return e.client_type === filter; });
    }

    var html = _renderSubnav('activity');

    html += '<div class="flex gap-1 mb-4">';
    ['all', 'landlords', 'renters', 'viewed', 'tenants'].forEach(function (f) {
      var active = filter === f;
      var label = f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1);
      html += '<button class="px-3 py-1.5 text-xs font-bold rounded-lg transition-all ' +
        (active ? 'bg-gold text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gold') +
        '" onclick="RentalsCRM._filterActivity(\'' + f + '\')">' + label + '</button>';
    });
    html += '</div>';

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

  function _filterActivity(f) { _state.activity.filter = f; _renderRentalsActivity(CRM.getContent()); }

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
      conversion: { icon: 'fa-check-circle', color: '#059669', bg: '#ECFDF5' },
      promote: { icon: 'fa-arrow-up', color: '#B8860B', bg: '#FFFBF0' },
    };
    return map[type] || { icon: 'fa-circle', color: '#9CA3AF', bg: '#F9FAFB' };
  }

  // ─── Shared ──────────────────────────────────────────────────────────
  function _openClient(id) { Router.navigate('/workspace/client/' + id + '/overview'); }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════
  return {
    landlordProspects: landlordProspects,
    activeLandlords: activeLandlords,
    renterProspects: renterProspects,
    activeRenters: activeRenters,
    viewedDidNotRent: viewedDidNotRent,
    currentTenants: currentTenants,
    rentalListings: rentalListings,
    rentalsMarketing: rentalsMarketing,
    rentalsActivity: rentalsActivity,

    // Legacy aliases
    landlords: activeLandlords,
    prospects: viewedDidNotRent,

    // Internal handlers
    _openClient: _openClient,
    _searchLandlordProspects: _searchLandlordProspects,
    _filterLandlordProspects: _filterLandlordProspects,
    _sortLandlordProspects: _sortLandlordProspects,
    _pageLandlordProspects: _pageLandlordProspects,
    _searchLandlords: _searchLandlords,
    _filterLandlords: _filterLandlords,
    _sortLandlords: _sortLandlords,
    _pageLandlords: _pageLandlords,
    _searchRenterProspects: _searchRenterProspects,
    _filterRenterProspects: _filterRenterProspects,
    _sortRenterProspects: _sortRenterProspects,
    _pageRenterProspects: _pageRenterProspects,
    _searchRenters: _searchRenters,
    _filterRenters: _filterRenters,
    _sortRenters: _sortRenters,
    _pageRenters: _pageRenters,
    _searchViewed: _searchViewed,
    _filterViewed: _filterViewed,
    _sortViewed: _sortViewed,
    _pageViewed: _pageViewed,
    _searchTenants: _searchTenants,
    _filterTenants: _filterTenants,
    _sortTenants: _sortTenants,
    _pageTenants: _pageTenants,
    _searchMarketing: _searchMarketing,
    _sortMarketing: _sortMarketing,
    _pageMarketing: _pageMarketing,
    _newCampaign: _newCampaign,
    _filterActivity: _filterActivity,
  };
})();
