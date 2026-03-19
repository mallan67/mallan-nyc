// ═══════════════════════════════════════════════════════════════════════════════
// RENTALS CRM — 7 tabs (no prospect/active split)
// Landlords | Rental Listings | Viewed/Did Not Rent | Current Tenants | Marketing | Activity | Automation
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, Router, Store, UI, Utils, FilterBar, ActivityTable, MallanAPI, ClientNormalizer */

var RentalsCRM = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  // ─── KPI Strip Helper ──────────────────────────────────────────────
  function _kpi(cards) {
    var html = '<div class="kpi-strip">';
    cards.forEach(function(c) {
      html += '<div class="kpi-card">' +
        '<div class="kpi-card-icon" style="background:' + (c.color || '#B8860B') + '15;color:' + (c.color || '#B8860B') + '"><i class="fas ' + c.icon + '"></i></div>' +
        '<div><div class="kpi-card-value">' + c.value + '</div><div class="kpi-card-label">' + E(c.label) + '</div></div>' +
      '</div>';
    });
    html += '</div>';
    return html;
  }

  var TABS = [
    { id: 'landlords',  route: '/rentals/landlords',  label: 'Landlords',             icon: 'fa-key' },
    { id: 'listings',   route: '/rentals/listings',    label: 'Rental Listings',       icon: 'fa-building' },
    { id: 'viewed',     route: '/rentals/viewed',      label: 'Viewed / Did Not Rent', icon: 'fa-eye-slash' },
    { id: 'tenants',    route: '/rentals/tenants',     label: 'Current Tenants',       icon: 'fa-user-check' },
    { id: 'marketing',  route: '/rentals/marketing',   label: 'Marketing',             icon: 'fa-bullhorn' },
    { id: 'activity',   route: '/rentals/activity',    label: 'Activity',              icon: 'fa-stream' },
    { id: 'automation', route: '/rentals/automation',   label: 'Automation',            icon: 'fa-robot' },
  ];

  var _state = {
    landlords:  { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    listings:   { data: [], sort: { key: 'address', dir: 'asc' }, page: 1, search: '' },
    viewed:     { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    tenants:    { data: [], sort: { key: 'lease_end_date', dir: 'asc' }, page: 1, search: '' },
    marketing:  { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
    activity:   { data: [], page: 1, filter: 'all' },
    automation: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '' },
  };

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

  // ─── Fee Pill Helper ───────────────────────────────────────────────
  function _feePill(feeStructure) {
    var f = (feeStructure || '').toLowerCase().replace(/[\s-]/g, '_');
    if (f === 'owner_pay') return '<span class="fee-pill-owner">Owner Pay</span>';
    if (f === 'tenant_pay') return '<span class="fee-pill-tenant">Tenant Pay</span>';
    if (f === 'no_fee') return '<span class="fee-pill-nofee">No Fee</span>';
    return '<span class="text-xs text-gray-400">' + E(feeStructure || '-') + '</span>';
  }

  // ─── Vacancy Risk Icon Helper ──────────────────────────────────────
  function _vacancyIcon(risk) {
    var v = (risk || '').toLowerCase();
    if (v === 'high') return '<span class="risk-high" title="High vacancy risk"><i class="fas fa-fire"></i> High</span>';
    if (v === 'medium') return '<span class="risk-medium" title="Medium vacancy risk"><i class="fas fa-exclamation-triangle"></i> Med</span>';
    if (v === 'low') return '<span class="risk-low" title="Low vacancy risk"><i class="fas fa-shield-alt"></i> Low</span>';
    return '<span class="text-xs text-gray-400">-</span>';
  }

  // ─── Seller Potential Pill ─────────────────────────────────────────
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

  // ─── Listing Status Badge ─────────────────────────────────────────
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

  // ─── Days Left Helper ─────────────────────────────────────────────
  function _daysLeft(leaseEnd) {
    if (!leaseEnd) return { days: null, html: '<span class="text-gray-400">-</span>' };
    var diff = Math.floor((new Date(leaseEnd).getTime() - Date.now()) / 86400000);
    if (diff <= 30) {
      return { days: diff, html: UI.dateBadge(leaseEnd, { urgency: 'lease' }) + ' <span class="text-[10px] text-red-600 font-bold">(' + diff + 'd)</span>' };
    } else if (diff <= 90) {
      return { days: diff, html: '<span class="text-sm font-bold text-amber-600">' + diff + 'd</span>' };
    } else {
      return { days: diff, html: '<span class="text-sm font-bold text-green-600">' + diff + 'd</span>' };
    }
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
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    // KPI computations
    var totalLandlords = st.data.length;
    var activeListings = st.data.filter(function(r) { return r.listing_status === 'Active'; }).length;
    var vacantCount = st.data.filter(function(r) { return (r.vacancy_risk || '').toLowerCase() === 'high'; }).length;
    var sellerPotentialCount = st.data.filter(function(r) { return r.seller_potential && r.seller_potential.toLowerCase() !== 'none'; }).length;
    var rents = st.data.filter(function(r) { return r.list_price && Number(r.list_price) > 0; });
    var avgRent = rents.length > 0 ? Math.round(rents.reduce(function(s, r) { return s + Number(r.list_price); }, 0) / rents.length) : 0;

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
        { key: '_actions', label: '', width: '44px', render: function (r) {
          return UI.rowActions([
            { icon: 'fa-calculator', title: 'Vacancy Cost Calculator', onclick: 'RentalsCRM._vacancyCost(\'' + E(r.id) + '\')' },
          ]);
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
      emptyText: 'No landlords yet — add one to start',
    });

    c.innerHTML = html;
  }

  function _searchLandlords(q) { _state.landlords.search = q; _state.landlords.page = 1; _renderLandlords(CRM.getContent()); }
  function _filterLandlords() { _renderLandlords(CRM.getContent()); }
  function _sortLandlords(key) {
    var st = _state.landlords;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderLandlords(CRM.getContent());
  }
  function _pageLandlords(p) { _state.landlords.page = p; _renderLandlords(CRM.getContent()); }
  function _vacancyCost(id) {
    var r = _state.landlords.data.find(function(l) { return String(l.id) === String(id); });
    var rent = r && r.list_price ? Number(r.list_price) : 0;
    var monthly = rent > 0 ? $(rent) + '/mo lost' : 'No rent data';
    CRM.toast('Vacancy cost: ' + monthly + ' — full calculator coming soon', 'info');
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
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    // KPI computations
    var activeCount = st.data.filter(function(r) { return (r.status || 'Active') === 'Active'; }).length;
    var totalRevenue = st.data.reduce(function(s, r) {
      return s + ((r.status || 'Active') === 'Active' ? Number(r.list_price || 0) : 0);
    }, 0);
    var activePrices = st.data.filter(function(r) { return Number(r.list_price || 0) > 0; });
    var avgRent = activePrices.length > 0 ? Math.round(activePrices.reduce(function(s, r) { return s + Number(r.list_price); }, 0) / activePrices.length) : 0;
    var pendingApps = st.data.reduce(function(s, r) { return s + Number(r.applications_count || 0); }, 0);
    var rlsCount = st.data.filter(function(r) { return r.rls_eligible !== false; }).length;
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
          var count = Number(r.showings_count || 0);
          return '<span class="text-sm font-medium text-gray-700">' + count + '</span>';
        }},
        { key: 'rls_eligible', label: 'RLS', render: function (r) {
          var ok = r.rls_eligible !== false;
          return ok
            ? '<span class="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-bold">RLS</span>'
            : '<span class="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-bold">Site Only</span>';
        }},
        { key: '_actions', label: '', width: '44px', render: function (r) {
          return UI.rowActions([
            { icon: 'fa-external-link-alt', title: 'Open Listing', onclick: 'RentalsCRM._openListing(\'' + E(r.id) + '\')' },
          ]);
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
  function _filterListings() { _renderListings(CRM.getContent()); }
  function _sortListings(key) {
    var st = _state.listings;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderListings(CRM.getContent());
  }
  function _pageListings(p) { _state.listings.page = p; _renderListings(CRM.getContent()); }
  function _openListing(id) { Router.navigate('/workspace/listing/' + id + '/overview'); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 3: VIEWED / DID NOT RENT
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
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    // KPI computations
    var totalProspects = st.data.length;
    var highBuyerPotential = st.data.filter(function(r) { return Number(r.buyer_potential || 0) > 70; }).length;
    var now = Date.now();
    var needingOutreach = st.data.filter(function(r) {
      var has30 = r.outreach_30d_date && new Date(r.outreach_30d_date).getTime() < now;
      var has60 = r.outreach_60d_date && new Date(r.outreach_60d_date).getTime() < now;
      var has90 = r.outreach_90d_date && new Date(r.outreach_90d_date).getTime() < now;
      var overdue = (has30 || has60 || has90) && !r.last_response_at;
      return overdue;
    }).length;

    var html = _subnav('viewed');

    html += _kpi([
      { icon: 'fa-eye-slash', value: totalProspects, label: 'Total Prospects', color: '#6366F1' },
      { icon: 'fa-arrow-up', value: highBuyerPotential, label: 'High Buyer Potential', color: '#059669' },
      { icon: 'fa-phone-slash', value: needingOutreach, label: 'Needing Outreach', color: '#DC2626' },
    ]);

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
        { key: '_avatar', label: '', width: '44px', render: function (r) {
          return UI.avatar(r.name, 32);
        }},
        { key: 'name', label: 'Name', render: function (r) {
          return '<span class="font-semibold text-gray-900">' + E(r.name || '') + '</span>';
        }},
        { key: 'email', label: 'Contact', render: function (r) {
          var contact = r.email || r.phone || '-';
          return '<span class="text-sm text-gray-600">' + E(contact) + '</span>';
        }},
        { key: 'last_viewed_address', label: 'Last Viewed', render: function (r) {
          return r.last_viewed_address
            ? '<span class="text-sm text-gray-700">' + E(r.last_viewed_address) + '</span>'
            : '<span class="text-gray-400">-</span>';
        }},
        { key: 'buyer_potential', label: 'Buyer Potential', render: function (r) {
          return UI.scoreBar(Number(r.buyer_potential || 0), 100);
        }},
        { key: '_outreach', label: 'Outreach', render: function (r) {
          var n = Date.now();
          var lr = r.last_response_at ? new Date(r.last_response_at).getTime() : 0;
          return UI.progressDots([
            {
              label: '30d',
              done: !!r.outreach_30d_date,
              overdue: !r.outreach_30d_date && false || (r.outreach_30d_date && new Date(r.outreach_30d_date).getTime() < n && !lr)
            },
            {
              label: '60d',
              done: !!r.outreach_60d_date,
              overdue: !r.outreach_60d_date && false || (r.outreach_60d_date && new Date(r.outreach_60d_date).getTime() < n && !lr)
            },
            {
              label: '90d',
              done: !!r.outreach_90d_date,
              overdue: !r.outreach_90d_date && false || (r.outreach_90d_date && new Date(r.outreach_90d_date).getTime() < n && !lr)
            },
          ]);
        }},
        { key: 'last_response_at', label: 'Last Response', render: function (r) {
          return r.last_response_at
            ? '<span class="text-sm text-gray-600">' + Utils.formatTimeAgo(r.last_response_at) + '</span>'
            : '<span class="text-gray-400">-</span>';
        }},
        { key: '_actions', label: '', width: '44px', render: function (r) {
          return UI.rowActions([
            { icon: 'fa-exchange-alt', title: 'Promote to Buyer', onclick: 'RentalsCRM._promoteToBuyer(\'' + E(r.id) + '\')' },
          ]);
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

  function _searchViewed(q) { _state.viewed.search = q; _state.viewed.page = 1; _renderViewed(CRM.getContent()); }
  function _filterViewed() { _renderViewed(CRM.getContent()); }
  function _sortViewed(key) {
    var st = _state.viewed;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderViewed(CRM.getContent());
  }
  function _pageViewed(p) { _state.viewed.page = p; _renderViewed(CRM.getContent()); }
  function _promoteToBuyer(id) {
    CRM.toast('Promoting to buyer pipeline...', 'info');
    MallanAPI._fetch('/api/crm/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: id, action: 'renter_to_buyer' })
    }).then(function () {
      CRM.toast('Client promoted to buyer', 'success');
      viewedDidNotRent();
    }).catch(function () {
      CRM.toast('Failed to promote — try again', 'error');
    });
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
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    // KPI computations
    var totalTenants = st.data.length;
    var expiring30 = 0, expiring90 = 0, renewing = 0, notRenewing = 0;
    st.data.forEach(function(r) {
      if (r.lease_end_date) {
        var diff = Math.floor((new Date(r.lease_end_date).getTime() - Date.now()) / 86400000);
        if (diff <= 30) expiring30++;
        else if (diff <= 90) expiring90++;
      }
      var rs = (r.renewal_status || '').toLowerCase();
      if (rs === 'renewing') renewing++;
      if (rs === 'not_renewing') notRenewing++;
    });

    var html = _subnav('tenants');

    html += _kpi([
      { icon: 'fa-user-check', value: totalTenants, label: 'Total Tenants', color: '#6366F1' },
      { icon: 'fa-exclamation-circle', value: expiring30, label: 'Expiring <30d', color: '#DC2626' },
      { icon: 'fa-clock', value: expiring90, label: 'Expiring 30-90d', color: '#F59E0B' },
      { icon: 'fa-redo', value: renewing, label: 'Renewing', color: '#059669' },
      { icon: 'fa-times-circle', value: notRenewing, label: 'Not Renewing', color: '#EF4444' },
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
        { key: 'property_address', label: 'Unit', render: function (r) {
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
        { key: 'days_left', label: 'Days Left', render: function (r) {
          return _daysLeft(r.lease_end_date).html;
        }},
        { key: 'renewal_status', label: 'Renewal', render: function (r) {
          var s = (r.renewal_status || 'pending').toLowerCase();
          var colors = {
            renewing: 'bg-green-100 text-green-700',
            not_renewing: 'bg-red-100 text-red-700',
            pending: 'bg-yellow-100 text-yellow-700',
            month_to_month: 'bg-blue-100 text-blue-700'
          };
          return '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold ' + (colors[s] || 'bg-gray-100 text-gray-600') + '">' + E(s.replace(/_/g, ' ')) + '</span>';
        }},
        { key: 'buyer_potential', label: 'Buyer Potential', render: function (r) {
          return UI.scoreBar(Number(r.buyer_potential || 0), 100);
        }},
        { key: '_actions', label: '', width: '80px', render: function (r) {
          return UI.rowActions([
            { icon: 'fa-redo', title: 'Initiate Renewal', onclick: 'RentalsCRM._initiateRenewal(\'' + E(r.id) + '\')' },
            { icon: 'fa-exchange-alt', title: 'Promote to Buyer', onclick: 'RentalsCRM._promoteToBuyer(\'' + E(r.id) + '\')' },
          ]);
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

  function _searchTenants(q) { _state.tenants.search = q; _state.tenants.page = 1; _renderTenants(CRM.getContent()); }
  function _filterTenants() { _renderTenants(CRM.getContent()); }
  function _sortTenants(key) {
    var st = _state.tenants;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderTenants(CRM.getContent());
  }
  function _pageTenants(p) { _state.tenants.page = p; _renderTenants(CRM.getContent()); }
  function _initiateRenewal(id) {
    CRM.toast('Renewal workflow started', 'info');
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

    // KPI computations
    var totalCampaigns = st.data.length;
    var activeCampaigns = st.data.filter(function(r) { return r.status === 'sent' || r.status === 'recurring' || r.status === 'scheduled'; }).length;
    var draftCampaigns = st.data.filter(function(r) { return r.status === 'draft'; }).length;
    var openRates = st.data.filter(function(r) { return r.sent_count > 0; });
    var avgOpenRate = openRates.length > 0
      ? Math.round(openRates.reduce(function(s, r) { return s + ((r.open_count || 0) / r.sent_count) * 100; }, 0) / openRates.length)
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
  function _newCampaign() { CRM.toast('Campaign creation coming soon', 'info'); }

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
    html += '<div class="flex gap-1 mb-4">';
    ['all', 'landlords', 'listings', 'tenants', 'viewed'].forEach(function (f) {
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
      // Group events by date
      var groups = _groupByDate(events);
      var groupOrder = ['Today', 'Yesterday', 'This Week', 'Earlier'];

      groupOrder.forEach(function(groupLabel) {
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
          html += '<div class="card p-3 flex items-start gap-3 hover:shadow-sm transition-shadow">' +
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

  function _groupByDate(events) {
    var groups = { 'Today': [], 'Yesterday': [], 'This Week': [], 'Earlier': [] };
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var yesterday = today - 86400000;
    var weekAgo = today - 7 * 86400000;

    events.forEach(function(ev) {
      var evTime = ev.created_at ? new Date(ev.created_at).getTime() : 0;
      if (evTime >= today) {
        groups['Today'].push(ev);
      } else if (evTime >= yesterday) {
        groups['Yesterday'].push(ev);
      } else if (evTime >= weekAgo) {
        groups['This Week'].push(ev);
      } else {
        groups['Earlier'].push(ev);
      }
    });

    return groups;
  }

  function _filterActivity(f) { _state.activity.filter = f; _renderActivity(CRM.getContent()); }

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
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    // KPI computations
    var totalContacts = st.data.length;
    var rentalDripsActive = st.data.filter(function(r) { return r.rental_drip_on; }).length;
    var renewalDripsActive = st.data.filter(function(r) { return r.renewal_drip_on; }).length;
    var pausedCount = st.data.filter(function(r) {
      return (r.rental_drip_status || '').toLowerCase() === 'paused' || (!r.rental_drip_on && !r.renewal_drip_on);
    }).length;

    var html = _subnav('automation');

    html += _kpi([
      { icon: 'fa-users', value: totalContacts, label: 'Total Contacts', color: '#6366F1' },
      { icon: 'fa-paper-plane', value: rentalDripsActive, label: 'Rental Drips Active', color: '#059669' },
      { icon: 'fa-redo', value: renewalDripsActive, label: 'Renewal Drips Active', color: '#3B82F6' },
      { icon: 'fa-pause-circle', value: pausedCount, label: 'Paused', color: '#9CA3AF' },
    ]);

    html += FilterBar.render({
      id: 'rautomation',
      placeholder: 'Search contacts...',
      onSearch: 'RentalsCRM._searchAutomation',
      filters: [
        { key: 'drip', label: 'Drip Status', options: [
          { value: 'active', label: 'Active' }, { value: 'monthly', label: 'Monthly' },
          { value: 'quarterly', label: 'Quarterly' }, { value: 'paused', label: 'Paused' }
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
            tenant: 'bg-emerald-100 text-emerald-700'
          };
          return '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold ' + (colors[t] || 'bg-gray-100 text-gray-600') + '">' + E(t) + '</span>';
        }},
        { key: 'rental_drip_on', label: 'Rental Drip', render: function (r) {
          return UI.toggleSwitch(!!r.rental_drip_on, 'RentalsCRM._toggleDrip(\'' + E(r.id) + '\',\'rental\')');
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
          return '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold ' + (colors[s] || 'bg-gray-100 text-gray-600') + '">' + E(s) + '</span>';
        }},
        { key: 'renewal_drip_on', label: 'Renewal Drip', render: function (r) {
          return UI.toggleSwitch(!!r.renewal_drip_on, 'RentalsCRM._toggleDrip(\'' + E(r.id) + '\',\'renewal\')');
        }},
        { key: 'last_rental_email_opened', label: 'Last Opened', render: function (r) {
          return r.last_rental_email_opened
            ? '<span class="text-sm text-gray-600">' + Utils.formatTimeAgo(r.last_rental_email_opened) + '</span>'
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
  function _filterAutomation() { _renderAutomation(CRM.getContent()); }
  function _sortAutomation(key) {
    var st = _state.automation;
    st.sort = { key: key, dir: st.sort.key === key && st.sort.dir === 'asc' ? 'desc' : 'asc' };
    _renderAutomation(CRM.getContent());
  }
  function _pageAutomation(p) { _state.automation.page = p; _renderAutomation(CRM.getContent()); }
  function _toggleDrip(id, type) {
    CRM.toast('Drip toggle for ' + type + ' — automation settings coming soon', 'info');
  }

  // ─── Shared ──────────────────────────────────────────────────────────
  function _openClient(id) { Router.navigate('/workspace/client/' + id + '/overview'); }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════
  return {
    landlords: landlords,
    rentalListings: rentalListings,
    viewedDidNotRent: viewedDidNotRent,
    currentTenants: currentTenants,
    rentalsMarketing: rentalsMarketing,
    rentalsActivity: rentalsActivity,
    rentalsAutomation: rentalsAutomation,

    _openClient: _openClient,
    _searchLandlords: _searchLandlords,
    _filterLandlords: _filterLandlords,
    _sortLandlords: _sortLandlords,
    _pageLandlords: _pageLandlords,
    _vacancyCost: _vacancyCost,
    _searchListings: _searchListings,
    _filterListings: _filterListings,
    _sortListings: _sortListings,
    _pageListings: _pageListings,
    _openListing: _openListing,
    _searchViewed: _searchViewed,
    _filterViewed: _filterViewed,
    _sortViewed: _sortViewed,
    _pageViewed: _pageViewed,
    _promoteToBuyer: _promoteToBuyer,
    _searchTenants: _searchTenants,
    _filterTenants: _filterTenants,
    _sortTenants: _sortTenants,
    _pageTenants: _pageTenants,
    _initiateRenewal: _initiateRenewal,
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
