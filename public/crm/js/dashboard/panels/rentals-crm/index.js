// ═══════════════════════════════════════════════════════════════════════════════
// RENTALS CRM — Subnav controller (Landlord / Tenant)
// 7 tabs: Landlords, Rental Listings, Viewed/Did Not Rent, Current Tenants,
//         Marketing, Activity, Automation
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, Router, Store, UI, Utils, FilterBar, ActivityTable, MallanAPI, ClientNormalizer */

var RentalsCRM = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  var TABS = [
    { id: 'landlords',    route: '/rentals/landlords',    label: 'Landlords',          icon: 'fa-key' },
    { id: 'listings',     route: '/rentals/listings',     label: 'Rental Listings',    icon: 'fa-building' },
    { id: 'prospects',    route: '/rentals/prospects',    label: 'Viewed / Did Not Rent', icon: 'fa-eye-slash' },
    { id: 'tenants',      route: '/rentals/tenants',      label: 'Current Tenants',    icon: 'fa-user-check' },
    { id: 'marketing',    route: '/rentals/marketing',    label: 'Marketing',          icon: 'fa-bullhorn' },
    { id: 'activity',     route: '/rentals/activity',     label: 'Activity',           icon: 'fa-stream' },
    { id: 'automation',   route: '/rentals/automation',   label: 'Automation',         icon: 'fa-robot' },
  ];

  // State
  var _state = {
    landlords: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    listings: { data: [], sort: { key: 'address', dir: 'asc' }, page: 1, search: '' },
    prospects: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    tenants: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
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
  // TAB 1: LANDLORDS
  // ═══════════════════════════════════════════════════════════════════════
  function landlords() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('landlords') + UI.loading();

    MallanAPI._fetch('/api/crm/rentals/landlords').then(function (data) {
      _state.landlords.data = (data.landlords || []).map(function (l) { return ClientNormalizer.normalize(l); });
      _renderLandlordsTable(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('landlords') + UI.emptyState('fa-key', 'Unable to load landlords');
    });
  }

  function _renderLandlordsTable(c) {
    var st = _state.landlords;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _renderSubnav('landlords');

    html += FilterBar.render({
      id: 'landlords',
      placeholder: 'Search landlords...',
      onSearch: 'RentalsCRM._searchLandlords',
      filters: [
        { key: 'status', label: 'Status', options: [
          { value: 'rented', label: 'Rented' }, { value: 'vacant', label: 'Vacant' },
          { value: 'relisting', label: 'Relisting' }
        ]},
      ],
      onFilter: 'RentalsCRM._filterLandlords',
      quickActions: [
        { label: 'New Landlord', icon: 'fa-plus', onclick: 'RentalsCRM._newLandlord()' },
      ],
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
          var colors = { 'Active': 'bg-blue-100 text-blue-700', 'Rented': 'bg-green-100 text-green-700', 'Vacant': 'bg-red-100 text-red-700' };
          return '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + (colors[s] || 'bg-gray-100 text-gray-600') + '">' + E(s) + '</span>';
        }},
        { key: 'showings_count', label: 'Showings', render: function (r) { return String(r.showings_count || 0); } },
        { key: 'fee_structure', label: 'Fee', render: function (r) {
          var f = r.fee_structure || '-';
          return E(f.replace(/_/g, ' '));
        }},
        { key: 'relist_reminder_date', label: 'Relist Date', render: function (r) {
          return r.relist_reminder_date ? D(r.relist_reminder_date) : '-';
        }},
        { key: 'updated_at', label: 'Last Action', render: function (r) {
          return r.updated_at ? Utils.formatTimeAgo(r.updated_at) : '-';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'RentalsCRM._sortLandlords',
      onRowClick: 'RentalsCRM._openLandlord',
      page: st.page,
      pageSize: 25,
      onPage: 'RentalsCRM._pageLandlords',
      emptyIcon: 'fa-key',
      emptyText: 'No landlords',
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
  function _openLandlord(id) { Router.navigate('/workspace/client/' + id + '/overview'); }
  function _newLandlord() { CRM.quickNewClient({ role: 'landlord' }); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 2: RENTAL LISTINGS
  // ═══════════════════════════════════════════════════════════════════════
  function rentalListings() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('listings') + UI.loading();

    MallanAPI._fetch('/api/crm/rentals/listings').then(function (data) {
      _state.listings.data = data.listings || [];
      _renderRentalListingsTable(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('listings') + UI.emptyState('fa-building', 'Unable to load rental listings');
    });
  }

  function _renderRentalListingsTable(c) {
    var st = _state.listings;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _renderSubnav('listings');

    html += FilterBar.render({
      id: 'rlistings',
      placeholder: 'Search rental listings...',
      onSearch: 'RentalsCRM._searchListings',
      filters: [
        { key: 'status', label: 'Status', options: [
          { value: 'Active', label: 'Active' }, { value: 'Rented', label: 'Rented' },
          { value: 'Coming Soon', label: 'Coming Soon' }
        ]},
      ],
      onFilter: 'RentalsCRM._filterListings',
      quickActions: [
        { label: 'New Rental Listing', icon: 'fa-plus', onclick: 'CRM.openListingForm && CRM.openListingForm("rental")' },
      ],
    });

    html += ActivityTable.render({
      id: 'rlistings_table',
      columns: [
        { key: 'address', label: 'Address', render: function (r) {
          var addr = r.address;
          if (typeof addr === 'object') addr = addr.UnparsedAddress || addr.full || '';
          var unit = r.unit_number ? ' #' + E(r.unit_number) : '';
          return '<span class="font-medium text-gray-900">' + E(addr || '') + unit + '</span>';
        }},
        { key: 'landlord_name', label: 'Landlord', render: function (r) { return E(r.landlord_name || '-'); } },
        { key: 'status', label: 'Status', render: function (r) {
          var s = r.status || 'Active';
          var colors = { 'Active': 'bg-blue-100 text-blue-700', 'Rented': 'bg-green-100 text-green-700', 'Coming Soon': 'bg-yellow-100 text-yellow-700' };
          return '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + (colors[s] || 'bg-gray-100 text-gray-600') + '">' + E(s) + '</span>';
        }},
        { key: 'list_price', label: 'Rent', render: function (r) { return Utils.formatMoney(r.list_price || 0) + '/mo'; } },
        { key: 'showings_count', label: 'Showings', render: function (r) { return String(r.showings_count || 0); } },
        { key: 'applications_count', label: 'Applications', render: function (r) { return String(r.applications_count || 0); } },
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

  function _searchListings(q) { _state.listings.search = q; _state.listings.page = 1; _renderRentalListingsTable(CRM.getContent()); }
  function _filterListings() { _renderRentalListingsTable(CRM.getContent()); }
  function _sortListings(key) {
    var st = _state.listings;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderRentalListingsTable(CRM.getContent());
  }
  function _pageListings(p) { _state.listings.page = p; _renderRentalListingsTable(CRM.getContent()); }
  function _openListing(id) { Router.navigate('/workspace/listing/' + id + '/overview'); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 3: VIEWED / DID NOT RENT (prospects)
  // ═══════════════════════════════════════════════════════════════════════
  function prospects() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('prospects') + UI.loading();

    MallanAPI._fetch('/api/crm/rentals/prospects').then(function (data) {
      _state.prospects.data = (data.prospects || []).map(function (p) { return ClientNormalizer.normalize(p); });
      _renderProspectsTable(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('prospects') + UI.emptyState('fa-eye-slash', 'Unable to load prospects');
    });
  }

  function _renderProspectsTable(c) {
    var st = _state.prospects;
    var rows = ActivityTable.filterRows(st.data, st.search);
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var html = _renderSubnav('prospects');

    html += FilterBar.render({
      id: 'prospects',
      placeholder: 'Search prospects...',
      onSearch: 'RentalsCRM._searchProspects',
      filters: [
        { key: 'buyer_potential', label: 'Buyer Potential', options: [
          { value: 'high', label: 'High (70+)' }, { value: 'medium', label: 'Medium (40-69)' }, { value: 'low', label: 'Low (0-39)' }
        ]},
        { key: 'no_fee_only', label: 'Fee Preference', options: [
          { value: 'true', label: 'No-Fee Only' }, { value: 'false', label: 'Any' }
        ]},
      ],
      onFilter: 'RentalsCRM._filterProspects',
    });

    html += ActivityTable.render({
      id: 'prospects_table',
      columns: [
        { key: 'name', label: 'Name', render: function (r) {
          return '<span class="font-medium text-gray-900">' + E(r.name || '') + '</span>';
        }},
        { key: 'email', label: 'Contact', render: function (r) { return E(r.email || r.phone || '-'); } },
        { key: 'last_viewed_address', label: 'Last Viewed', render: function (r) {
          return E(r.last_viewed_address || '-');
        }},
        { key: 'no_fee_only', label: 'No-Fee Only', render: function (r) {
          return r.no_fee_only ? '<span class="text-red-600 font-bold text-xs">Yes</span>' : '<span class="text-gray-400 text-xs">No</span>';
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
      onSort: 'RentalsCRM._sortProspects',
      onRowClick: 'RentalsCRM._openProspect',
      page: st.page,
      pageSize: 25,
      onPage: 'RentalsCRM._pageProspects',
      emptyIcon: 'fa-eye-slash',
      emptyText: 'No prospects — viewed/did-not-rent records will appear here',
    });

    c.innerHTML = html;
  }

  function _searchProspects(q) { _state.prospects.search = q; _state.prospects.page = 1; _renderProspectsTable(CRM.getContent()); }
  function _filterProspects() { _renderProspectsTable(CRM.getContent()); }
  function _sortProspects(key) {
    var st = _state.prospects;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderProspectsTable(CRM.getContent());
  }
  function _pageProspects(p) { _state.prospects.page = p; _renderProspectsTable(CRM.getContent()); }
  function _openProspect(id) { Router.navigate('/workspace/client/' + id + '/overview'); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 4: CURRENT TENANTS
  // ═══════════════════════════════════════════════════════════════════════
  function currentTenants() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('tenants') + UI.loading();

    MallanAPI._fetch('/api/crm/rentals/tenants').then(function (data) {
      _state.tenants.data = (data.tenants || []).map(function (t) { return ClientNormalizer.normalize(t); });
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
        { key: 'outreach_90d_date', label: '90d Date', render: function (r) { return r.outreach_90d_date ? D(r.outreach_90d_date) : '-'; } },
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'RentalsCRM._sortTenants',
      onRowClick: 'RentalsCRM._openTenant',
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
  function _openTenant(id) { Router.navigate('/workspace/client/' + id + '/overview'); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 5: RENTALS MARKETING
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
  // TAB 6: RENTALS ACTIVITY FEED
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
    ['all', 'landlords', 'prospects', 'tenants'].forEach(function (f) {
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
    };
    return map[type] || { icon: 'fa-circle', color: '#9CA3AF', bg: '#F9FAFB' };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 7: RENTALS AUTOMATION
  // ═══════════════════════════════════════════════════════════════════════
  function rentalsAutomation() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _renderSubnav('automation') + UI.loading();

    MallanAPI._fetch('/api/crm/automation/status?crm_type=rentals').then(function (data) {
      _state.automation.data = data.contacts || [];
      _renderRentalsAutomation(c);
    }).catch(function () {
      c.innerHTML = _renderSubnav('automation') + UI.emptyState('fa-robot', 'Unable to load automation status');
    });
  }

  function _renderRentalsAutomation(c) {
    var st = _state.automation;
    var rows = ActivityTable.sortRows(st.data, st.sort.key, st.sort.dir);

    var html = _renderSubnav('automation');

    html += ActivityTable.render({
      id: 'rautomation_table',
      columns: [
        { key: 'name', label: 'Contact', render: function (r) { return '<span class="font-medium">' + E(r.name || '') + '</span>'; } },
        { key: 'type', label: 'Type', render: function (r) { return E(r.type || '-'); } },
        { key: 'rental_drip_on', label: 'Rental Drip', render: function (r) {
          return r.rental_drip_on
            ? '<span class="text-green-600 font-bold text-xs">ON</span>'
            : '<span class="text-gray-400 text-xs">OFF</span>';
        }},
        { key: 'sales_drip_on', label: 'Sales Drip', render: function (r) {
          return r.sales_drip_on
            ? '<span class="text-green-600 font-bold text-xs">ON</span>'
            : '<span class="text-gray-400 text-xs">OFF</span>';
        }},
        { key: 'renewal_drip_on', label: 'Renewal', render: function (r) {
          return r.renewal_drip_on
            ? '<span class="text-green-600 font-bold text-xs">ON</span>'
            : '<span class="text-gray-400 text-xs">OFF</span>';
        }},
        { key: 'rental_drip_status', label: 'Tier', render: function (r) {
          var tier = r.rental_drip_status || 'paused';
          var colors = { active: 'bg-green-100 text-green-700', monthly: 'bg-blue-100 text-blue-700', quarterly: 'bg-yellow-100 text-yellow-700', biannual: 'bg-gray-100 text-gray-600', paused: 'bg-red-100 text-red-700' };
          return '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + (colors[tier] || colors.paused) + '">' + E(tier) + '</span>';
        }},
        { key: 'last_rental_email_opened', label: 'Last Opened', render: function (r) {
          return r.last_rental_email_opened ? Utils.formatTimeAgo(r.last_rental_email_opened) : '-';
        }},
      ],
      rows: rows,
      sort: st.sort,
      onSort: 'RentalsCRM._sortAutomation',
      onRowClick: 'RentalsCRM._openAutomationContact',
      page: st.page,
      pageSize: 25,
      onPage: 'RentalsCRM._pageAutomation',
      emptyIcon: 'fa-robot',
      emptyText: 'No automation contacts',
    });

    c.innerHTML = html;
  }

  function _sortAutomation(key) {
    var st = _state.automation;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderRentalsAutomation(CRM.getContent());
  }
  function _pageAutomation(p) { _state.automation.page = p; _renderRentalsAutomation(CRM.getContent()); }
  function _openAutomationContact(id) { Router.navigate('/workspace/client/' + id + '/overview'); }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════
  return {
    landlords: landlords,
    rentalListings: rentalListings,
    prospects: prospects,
    currentTenants: currentTenants,
    rentalsMarketing: rentalsMarketing,
    rentalsActivity: rentalsActivity,
    rentalsAutomation: rentalsAutomation,

    // Internal handlers
    _searchLandlords: _searchLandlords,
    _filterLandlords: _filterLandlords,
    _sortLandlords: _sortLandlords,
    _pageLandlords: _pageLandlords,
    _openLandlord: _openLandlord,
    _newLandlord: _newLandlord,
    _searchListings: _searchListings,
    _filterListings: _filterListings,
    _sortListings: _sortListings,
    _pageListings: _pageListings,
    _openListing: _openListing,
    _searchProspects: _searchProspects,
    _filterProspects: _filterProspects,
    _sortProspects: _sortProspects,
    _pageProspects: _pageProspects,
    _openProspect: _openProspect,
    _searchTenants: _searchTenants,
    _filterTenants: _filterTenants,
    _sortTenants: _sortTenants,
    _pageTenants: _pageTenants,
    _openTenant: _openTenant,
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
