// ═══════════════════════════════════════════════════════════════════════════════
// RENTALS CRM — Full build
// Landlords · Rental Listings · Viewed/Did Not Rent · Current Tenants
// Marketing · Activity · Automation
// ═══════════════════════════════════════════════════════════════════════════════
var RentalsCRM = (function () {
  'use strict';
  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;
  var _ago = typeof Utils.formatTimeAgo === 'function' ? Utils.formatTimeAgo : D;

  var _s = {
    landlords:  { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '', filter: {} },
    tenants:    { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '', filter: {} },
    leases:     { data: [], sort: { key: 'lease_end_date', dir: 'asc' }, page: 1, search: '', filter: {} },
    ws:         { client: null, tab: 'research', activity: [], leases: [] },
  };

  // TABS removed — Rentals CRM consolidated into CLIENTS sidebar (Lease Tracker).
  // Legacy routes redirect. Landlords/Tenants/Leases now in Lease Tracker.

  var LANDLORD_STAGES = {
    prospect:         { label: 'Prospect',          color: '#6366F1', bg: '#EEF2FF' },
    pitching:         { label: 'Pitching',           color: '#F59E0B', bg: '#FFFBEB' },
    exclusive_signed: { label: 'Exclusive Signed',   color: '#3B82F6', bg: '#EFF6FF' },
    listed:           { label: 'Listed',             color: '#059669', bg: '#ECFDF5' },
    showing:          { label: 'Showing',            color: '#8B5CF6', bg: '#F5F3FF' },
    application:      { label: 'Application In',     color: '#D97706', bg: '#FFFBEB' },
    lease_out:        { label: 'Lease Out',          color: '#7C3AED', bg: '#F5F3FF' },
    lease_signed:     { label: 'Lease Signed',       color: '#059669', bg: '#ECFDF5' },
    rented:           { label: 'Rented',             color: '#6B7280', bg: '#F9FAFB' },
  };

  var TENANT_STAGES = {
    prospect:     { label: 'Prospect',      color: '#6366F1', bg: '#EEF2FF' },
    searching:    { label: 'Searching',     color: '#3B82F6', bg: '#EFF6FF' },
    showing:      { label: 'Showing',       color: '#8B5CF6', bg: '#F5F3FF' },
    applied:      { label: 'Applied',       color: '#D97706', bg: '#FFFBEB' },
    approved:     { label: 'Approved',      color: '#059669', bg: '#ECFDF5' },
    lease_signed: { label: 'Lease Signed',  color: '#7C3AED', bg: '#F5F3FF' },
    moved_in:     { label: 'Moved In',      color: '#059669', bg: '#ECFDF5' },
    active_tenant:{ label: 'Active Tenant', color: '#6B7280', bg: '#F9FAFB' },
  };

  // Subnav removed — all routes consolidated into Lease Tracker sidebar item.
  function _subnav() { return ''; }

  function _kpi(cards) {
    var h = '<div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">';
    cards.forEach(function (c) {
      h += '<div style="display:flex;align-items:center;gap:12px;padding:14px 18px;background:#fff;border:1px solid #E5E7EB;border-radius:12px;flex:1;min-width:150px;">' +
        '<div style="width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:' + (c.bg || '#B8860B15') + ';color:' + (c.fg || '#B8860B') + ';font-size:15px;"><i class="fas ' + c.icon + '"></i></div>' +
        '<div><div style="font-size:20px;font-weight:800;color:#111;">' + c.value + '</div><div style="font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.3px;">' + E(c.label) + '</div></div></div>';
    });
    return h + '</div>';
  }

  function _stageBadge(stage, map) {
    var s = (map || LANDLORD_STAGES)[stage] || { label: stage, color: '#6B7280', bg: '#F9FAFB' };
    return '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:' + s.bg + ';color:' + s.color + ';">' + E(s.label) + '</span>';
  }

  function _urgencyBadge(days) {
    if (days == null) return '';
    var color = days <= 30 ? '#DC2626' : days <= 60 ? '#D97706' : days <= 90 ? '#6366F1' : '#6B7280';
    var bg = days <= 30 ? '#FEF2F2' : days <= 60 ? '#FFFBEB' : days <= 90 ? '#EEF2FF' : '#F9FAFB';
    var label = days <= 0 ? 'Expired' : days + 'd';
    return '<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;background:' + bg + ';color:' + color + ';">' + label + '</span>';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 1: LANDLORDS
  // ═══════════════════════════════════════════════════════════════════════
  function landlords() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _subnav('landlords') + '<div class="flex items-center justify-center h-40"><i class="fas fa-spinner fa-spin text-2xl text-gold"></i></div>';

    MallanAPI._fetch('/api/crm/rentals/landlords').then(function (data) {
      _s.landlords.data = (data.landlords || data.clients || []).map(function (r) {
        r.name = r.name || ((r.first_name || '') + ' ' + (r.last_name || '')).trim();
        r.stage = r.pipeline_stage || 'prospect';
        return r;
      });
      _renderLandlords(c);
    }).catch(function (err) {
      c.innerHTML = _subnav('landlords') + '<div class="text-center py-12"><i class="fas fa-exclamation-triangle text-3xl text-red-400 mb-3"></i><p class="text-sm text-gray-500">' + E(err.message || 'Failed to load') + '</p></div>';
    });
  }

  function _renderLandlords(c) {
    var st = _s.landlords;
    var rows = st.data.slice();
    if (st.search) { var q = st.search.toLowerCase(); rows = rows.filter(function (r) { return (r.name + ' ' + (r.property_address || '') + ' ' + (r.email || '')).toLowerCase().indexOf(q) !== -1; }); }
    if (st.filter.stage) rows = rows.filter(function (r) { return r.stage === st.filter.stage; });
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var total = st.data.length;
    var prospects = st.data.filter(function (r) { return r.stage === 'prospect' || r.stage === 'pitching'; }).length;
    var active = st.data.filter(function (r) { return r.stage === 'listed' || r.stage === 'showing' || r.stage === 'application'; }).length;
    var rented = st.data.filter(function (r) { return r.stage === 'rented' || r.stage === 'lease_signed'; }).length;

    var h = _subnav('landlords');
    h += _kpi([
      { icon: 'fa-key', label: 'Total Landlords', value: total, fg: '#3B82F6', bg: '#EFF6FF' },
      { icon: 'fa-bullseye', label: 'Prospects', value: prospects, fg: '#6366F1', bg: '#EEF2FF' },
      { icon: 'fa-building', label: 'Active Listings', value: active, fg: '#059669', bg: '#ECFDF5' },
      { icon: 'fa-handshake', label: 'Rented', value: rented, fg: '#B8860B', bg: '#FFFBF0' },
    ]);

    h += FilterBar.render({
      id: 'landlords', placeholder: 'Search by name, address, email...', onSearch: 'RentalsCRM._searchLandlords',
      filters: [
        { key: 'stage', label: 'Stage', options: Object.keys(LANDLORD_STAGES).map(function (k) { return { value: k, label: LANDLORD_STAGES[k].label }; }) },
      ],
      onFilter: 'RentalsCRM._filterLandlords',
      quickActions: [{ label: 'New Landlord', icon: 'fa-plus', onclick: 'RentalsCRM._newLandlord()' }],
    });

    h += ActivityTable.render({
      id: 'landlords_tbl',
      columns: [
        { key: 'name', label: 'Landlord', render: function (r) {
          var init = (r.name || '??').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
          var entity = r.entity_name ? '<div class="text-[10px] text-purple-600 font-bold mt-0.5">' + E(r.entity_type || 'Entity') + ': ' + E(r.entity_name) + '</div>' : '';
          return '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div style="width:32px;height:32px;border-radius:50%;background:#059669/10;background-color:#dcfce7;color:#059669;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">' + E(init) + '</div>' +
            '<div><div class="font-semibold text-gray-900">' + E(r.name) + '</div>' + entity + '</div></div>';
        }},
        { key: 'property_address', label: 'Property', render: function (r) {
          var unit = r.unit_number ? ' #' + r.unit_number : '';
          return '<span class="text-sm">' + E((r.property_address || '-') + unit) + '</span>';
        }},
        { key: 'stage', label: 'Stage', render: function (r) { return _stageBadge(r.stage, LANDLORD_STAGES); } },
        { key: 'listing_status', label: 'Listing', render: function (r) {
          var s = r.listing_status || 'No Listing';
          var clr = { Active: '#3B82F6', 'Rented': '#059669', 'Lease Signed': '#7C3AED' }[s] || '#9CA3AF';
          return '<span style="font-size:10px;font-weight:700;color:' + clr + ';">' + E(s) + '</span>';
        }},
        { key: 'last_login_at', label: 'Last Login', render: function (r) { return r.last_login_at ? '<span class="text-xs text-gray-600">' + _ago(r.last_login_at) + '</span>' : '<span class="text-xs text-gray-400">Never</span>'; } },
        { key: 'showings_count', label: 'Showings', render: function (r) { var n = Number(r.showings_count || 0); return n > 0 ? '<span class="font-bold">' + n + '</span>' : '<span class="text-gray-400">0</span>'; } },
        { key: 'rent_per_month', label: 'Rent', render: function (r) { return r.rent_per_month ? '<span class="font-semibold">' + $(Number(r.rent_per_month)) + '/mo</span>' : '<span class="text-gray-400">-</span>'; } },
        { key: '_next', label: 'Next Action', render: function (r) {
          if (r.stage === 'prospect') return '<span class="text-xs text-indigo-600 font-bold"><i class="fas fa-phone mr-1"></i>Reach Out</span>';
          if (r.stage === 'pitching') return '<span class="text-xs text-amber-600 font-bold"><i class="fas fa-file-alt mr-1"></i>Send Comps</span>';
          if (r.stage === 'exclusive_signed') return '<span class="text-xs text-blue-600 font-bold"><i class="fas fa-camera mr-1"></i>Start Marketing</span>';
          if (r.stage === 'showing') return '<span class="text-xs text-purple-600 font-bold"><i class="fas fa-calendar mr-1"></i>Schedule OH</span>';
          return '<span class="text-xs text-gray-500"><i class="fas fa-check mr-1"></i>Monitor</span>';
        }},
      ],
      rows: rows, sort: st.sort, onSort: 'RentalsCRM._sortLandlords', onRowClick: 'RentalsCRM._openLandlord',
      page: st.page, pageSize: 25, onPage: 'RentalsCRM._pageLandlords',
      emptyIcon: 'fa-key', emptyText: 'No landlords yet — click New Landlord to start prospecting',
    });

    c.innerHTML = h;
  }

  function _searchLandlords(q) { _s.landlords.search = q; _s.landlords.page = 1; _renderLandlords(CRM.getContent()); }
  function _filterLandlords(k, v) { _s.landlords.filter[k] = v; _s.landlords.page = 1; _renderLandlords(CRM.getContent()); }
  function _sortLandlords(k) { var st = _s.landlords; st.sort = { key: k, dir: st.sort.key === k && st.sort.dir === 'asc' ? 'desc' : 'asc' }; _renderLandlords(CRM.getContent()); }
  function _pageLandlords(p) { _s.landlords.page = p; _renderLandlords(CRM.getContent()); }

  // ═══════════════════════════════════════════════════════════════════════
  // LANDLORD WORKSPACE
  // ═══════════════════════════════════════════════════════════════════════
  function _openLandlord(id) {
    var c = CRM.getContent();
    c.innerHTML = '<div class="flex items-center justify-center h-40"><i class="fas fa-spinner fa-spin text-2xl text-gold"></i></div>';

    Promise.all([
      MallanAPI._fetch('/api/crm/clients/' + id),
      MallanAPI._fetch('/api/crm/activity?client_id=' + id + '&limit=50').catch(function () { return { events: [] }; }),
      MallanAPI._fetch('/api/crm/active-leases?landlord_id=' + id).catch(function () { return { leases: [] }; }),
    ]).then(function (res) {
      var cl = res[0].client || res[0];
      cl.name = cl.name || ((cl.first_name || '') + ' ' + (cl.last_name || '')).trim();
      cl.stage = cl.pipeline_stage || 'prospect';
      _s.ws.client = cl;
      _s.ws.activity = res[1].events || res[1].activity || [];
      _s.ws.leases = res[2].leases || [];
      _renderLandlordWorkspace(c);
    }).catch(function (err) {
      c.innerHTML = '<div class="p-8 text-center text-red-500">Failed to load: ' + E(err.message || '') + '</div>';
    });
  }

  function _renderLandlordWorkspace(c) {
    var cl = _s.ws.client;
    var tab = _s.ws.tab;
    var stage = cl.stage || 'prospect';
    var isProspect = stage === 'prospect' || stage === 'pitching';
    var isActive = ['exclusive_signed', 'listed', 'showing', 'application', 'lease_out'].indexOf(stage) !== -1;
    var isRented = stage === 'lease_signed' || stage === 'rented';

    var h = '<div class="mb-4">';
    h += '<button class="text-sm text-gray-500 hover:text-gray-700 mb-3" onclick="Router.navigate(\'/rentals/landlords\')"><i class="fas fa-arrow-left mr-1"></i>Back to Landlords</button>';
    h += '<div class="flex items-start justify-between flex-wrap gap-4">';
    h += '<div class="flex items-center gap-4">';
    var init = (cl.name || '??').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
    h += '<div style="width:48px;height:48px;border-radius:50%;background:#dcfce7;color:#059669;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;">' + E(init) + '</div>';
    h += '<div>';
    h += '<h2 class="text-xl font-bold text-gray-900">' + E(cl.name) + '</h2>';
    h += '<div class="flex items-center gap-2 mt-1">' + _stageBadge(stage, LANDLORD_STAGES);
    if (cl.entity_name) h += '<span class="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-bold">' + E(cl.entity_type || 'Entity') + ': ' + E(cl.entity_name) + '</span>';
    h += '</div>';
    h += '<div class="flex gap-3 mt-1 text-xs text-gray-500">';
    if (cl.email) h += '<span><i class="fas fa-envelope mr-1"></i>' + E(cl.email) + '</span>';
    if (cl.phone) h += '<span><i class="fas fa-phone mr-1"></i>' + E(cl.phone) + '</span>';
    if (cl.property_address) h += '<span><i class="fas fa-map-marker-alt mr-1"></i>' + E(cl.property_address) + (cl.unit_number ? ' #' + cl.unit_number : '') + '</span>';
    h += '</div></div></div>';

    // Action buttons
    h += '<div class="flex gap-2 flex-wrap">';
    if (isProspect) {
      h += '<button class="btn btn-sm btn-gold" onclick="RentalsCRM._wsAction(\'send_comps\')"><i class="fas fa-chart-bar mr-1"></i>Send Comps</button>';
      h += '<button class="btn btn-sm btn-outline" onclick="RentalsCRM._wsAction(\'send_market_report\')"><i class="fas fa-chart-area mr-1"></i>Market Report</button>';
      h += '<button class="btn btn-sm btn-outline" onclick="RentalsCRM._wsAction(\'advance_stage\')"><i class="fas fa-arrow-right mr-1"></i>Advance Stage</button>';
    }
    if (isActive) {
      h += '<button class="btn btn-sm btn-gold" onclick="RentalsCRM._wsAction(\'schedule_open_house\')"><i class="fas fa-calendar mr-1"></i>Open House</button>';
      h += '<button class="btn btn-sm btn-outline" onclick="RentalsCRM._wsAction(\'send_weekly_report\')"><i class="fas fa-file-alt mr-1"></i>Weekly Report</button>';
    }
    if (isRented) {
      h += '<button class="btn btn-sm btn-gold" onclick="RentalsCRM._wsAction(\'send_seller_comps\')"><i class="fas fa-home mr-1"></i>Send Sale Comps</button>';
      h += '<button class="btn btn-sm btn-outline" onclick="RentalsCRM._wsAction(\'promote_seller\')"><i class="fas fa-arrow-up mr-1"></i>Convert to Seller</button>';
    }
    h += '<button class="btn btn-sm btn-outline" onclick="RentalsCRM._editClient(\'' + E(cl.id) + '\')"><i class="fas fa-edit"></i></button>';
    h += '</div></div></div>';

    // Workspace tabs
    var wsTabs = [
      { id: 'research', label: 'Research', icon: 'fa-search' },
      { id: 'pitch', label: 'Pitch Packet', icon: 'fa-file-powerpoint' },
      { id: 'outreach', label: 'Outreach', icon: 'fa-paper-plane' },
      { id: 'intake', label: 'Intake', icon: 'fa-clipboard-list' },
    ];
    if (isActive || isRented) {
      wsTabs.push({ id: 'listing', label: 'Listing', icon: 'fa-building' });
      wsTabs.push({ id: 'showings', label: 'Showings', icon: 'fa-calendar' });
      wsTabs.push({ id: 'applications', label: 'Applications', icon: 'fa-file-alt' });
      if (cl.building_type === 'coop' || cl.building_type === 'condo' || cl.building_type === 'condop') {
        wsTabs.push({ id: 'board', label: 'Board', icon: 'fa-users' });
      }
      wsTabs.push({ id: 'move-in', label: 'Move-In', icon: 'fa-door-open' });
    }
    wsTabs.push({ id: 'leases', label: 'All Leases', icon: 'fa-file-contract' });
    wsTabs.push({ id: 'parties', label: 'Parties', icon: 'fa-users' });
    wsTabs.push({ id: 'documents', label: 'Documents', icon: 'fa-folder' });
    wsTabs.push({ id: 'tools', label: 'Tools', icon: 'fa-calculator' });
    wsTabs.push({ id: 'activity', label: 'Activity', icon: 'fa-stream' });

    h += '<div class="flex gap-1 overflow-x-auto border-b border-gray-200 mb-4">';
    wsTabs.forEach(function (t) {
      h += '<button class="px-3 py-2 text-xs font-semibold whitespace-nowrap ' +
        (t.id === tab ? 'text-gold border-b-2 border-gold' : 'text-gray-400 hover:text-gray-700') +
        '" onclick="RentalsCRM._wsTab(\'' + t.id + '\')">' +
        '<i class="fas ' + t.icon + ' mr-1"></i>' + E(t.label) + '</button>';
    });
    h += '</div>';
    h += '<div id="rws-body"></div>';
    c.innerHTML = h;

    var body = document.getElementById('rws-body');
    if (!body) return;
    _renderLandlordWsTab(body, tab, cl);
  }

  function _wsTab(id) { _s.ws.tab = id; _renderLandlordWorkspace(CRM.getContent()); }

  function _renderLandlordWsTab(el, tab, cl) {
    if (tab === 'research')       _lwsResearch(el, cl);
    else if (tab === 'pitch')     _lwsPitch(el, cl);
    else if (tab === 'outreach')  _lwsOutreach(el, cl);
    else if (tab === 'intake')    _lwsIntake(el, cl);
    else if (tab === 'listing')   _lwsListing(el, cl);
    else if (tab === 'showings')  _lwsShowings(el, cl);
    else if (tab === 'applications') _lwsApplications(el, cl);
    else if (tab === 'board')     _lwsBoard(el, cl);
    else if (tab === 'move-in')   _lwsMoveIn(el, cl);
    else if (tab === 'leases')    _lwsLeases(el, cl);
    else if (tab === 'parties')   _lwsParties(el, cl);
    else if (tab === 'documents') _lwsDocs(el, cl);
    else if (tab === 'tools')     _lwsTools(el, cl);
    else if (tab === 'activity')  _lwsActivity(el, cl);
    else el.innerHTML = '<p class="text-gray-400 p-4">Tab: ' + E(tab) + '</p>';
  }

  // ── RESEARCH ──────────────────────────────────────────────────────────
  function _lwsResearch(el, cl) {
    var h = '<div class="space-y-5">';

    // Live NYC data panel
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5" id="rws-live-data">';
    h += '<div class="flex items-center justify-between mb-3">';
    h += '<h3 class="text-sm font-bold text-gray-900"><i class="fas fa-database text-blue-500 mr-2"></i>NYC Public Records (Live)</h3>';
    h += '<button class="btn btn-xs btn-outline" onclick="RentalsCRM._loadPropertyResearch()"><i class="fas fa-sync-alt mr-1"></i>Load Data</button>';
    h += '</div>';
    h += '<div id="rws-live-content"><p class="text-xs text-gray-400 italic">Enter the property address in Intake, then click Load Data to pull ACRIS, DOB, and DOF records.</p></div>';
    h += '</div>';

    // Owner identity
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-3"><i class="fas fa-user-shield text-gold mr-2"></i>Owner Identity</h3>';
    h += '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">';
    h += _f('Owner Name', cl.name);
    h += _f('Entity Type', (cl.entity_type || 'Individual').toUpperCase(), 'entity_type');
    h += _f('Entity Name', cl.entity_name || '-', 'entity_name');
    h += _f('EIN / Tax ID', cl.entity_ein || '-', 'entity_ein');
    h += _f('State of Formation', cl.entity_state || '-', 'entity_state');
    h += _f('Managing Member / Trustee', cl.entity_managing_member || '-', 'entity_managing_member');
    h += '</div>';

    h += '<div class="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">';
    h += '<div class="text-xs font-bold text-blue-700 mb-2">Verification Links</div>';
    h += '<div class="flex flex-wrap gap-2">';
    h += '<a href="https://a836-acris.nyc.gov/DS/DocumentSearch/Index" target="_blank" class="text-xs text-blue-600 underline hover:text-blue-800"><i class="fas fa-landmark mr-1"></i>ACRIS</a>';
    h += '<a href="https://a836-pts-access.nyc.gov/care/search/commonsearch.aspx?mode=persprop" target="_blank" class="text-xs text-blue-600 underline hover:text-blue-800"><i class="fas fa-file-invoice-dollar mr-1"></i>DOF Tax</a>';
    h += '<a href="https://hpdonline.nyc.gov/hpdonline/#!/home" target="_blank" class="text-xs text-blue-600 underline hover:text-blue-800"><i class="fas fa-building mr-1"></i>HPD Violations</a>';
    h += '</div></div></div>';

    // Property details
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-3"><i class="fas fa-building text-gold mr-2"></i>Property Details</h3>';
    h += '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">';
    h += _f('Address', cl.property_address || '-', 'property_address');
    h += _f('Unit', cl.unit_number || '-', 'unit_number');
    h += _f('Building Type', cl.building_type || '-', 'building_type');
    h += _f('Borough', cl.borough || '-');
    h += '</div></div>';

    // Custom fields
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5"><div id="rws-custom-fields"></div></div>';
    h += '</div>';
    el.innerHTML = h;

    var cfEl = document.getElementById('rws-custom-fields');
    if (cfEl && typeof CustomFields !== 'undefined') {
      CustomFields.render(cfEl, cl.id, cl.custom_fields || {}, '/api/crm/clients/' + cl.id);
    }
  }

  // ── PITCH PACKET ──────────────────────────────────────────────────────
  function _lwsPitch(el, cl) {
    // Render the full Rental Pitch Packet with auto-CMA
    if (typeof RentalPitchPacket !== 'undefined') {
      RentalPitchPacket.render(el, cl);
      return;
    }
    // Fallback if script not loaded
    var h = '<div class="space-y-4">';
    h += '<div class="bg-white border rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-1"><i class="fas fa-file-powerpoint text-gold mr-2"></i>Pitch Packet for ' + E(cl.name) + '</h3>';
    h += '<p class="text-xs text-gray-500 mb-4">Build materials to win this exclusive rental listing.</p>';

    var items = [
      { icon: 'fa-chart-bar', color: 'text-blue-500', title: 'Rental Comps', desc: 'Similar units rented in this building + neighborhood + area', btn: 'Find Comps', action: 'RentalsCRM._findRentalComps()' },
      { icon: 'fa-dollar-sign', color: 'text-green-500', title: 'Pricing Strategy', desc: 'Target rent, days on market benchmarks, vacancy risk', btn: 'Edit', action: 'RentalsCRM._editRentalPricing()' },
      { icon: 'fa-clock', color: 'text-amber-500', title: 'Vacancy Cost Calculator', desc: 'What it costs them per day if the unit sits empty', btn: 'Calculate', action: 'RentalsCRM._wsTab(\'tools\')' },
      { icon: 'fa-bullhorn', color: 'text-purple-500', title: 'Marketing Strategy', desc: 'StreetEasy, photos, RLS, showing plan, fee structure', btn: 'Edit', action: 'RentalsCRM._editMarketing()' },
      { icon: 'fa-calendar-check', color: 'text-teal-500', title: 'Urgency / Timeline', desc: 'How fast does it need to be rented? Target move-in date', btn: 'Set Timeline', action: 'RentalsCRM._editTimeline()' },
    ];

    items.forEach(function (item) {
      h += '<div class="border border-gray-100 rounded-lg p-4 mb-2 hover:border-gold/30 flex items-center justify-between">';
      h += '<div><h4 class="text-sm font-bold text-gray-900"><i class="fas ' + item.icon + ' ' + item.color + ' mr-2"></i>' + E(item.title) + '</h4>';
      h += '<p class="text-xs text-gray-500 mt-0.5">' + E(item.desc) + '</p></div>';
      h += '<button class="btn btn-sm btn-outline ml-4 flex-shrink-0" onclick="' + item.action + '">' + E(item.btn) + '</button>';
      h += '</div>';
    });
    h += '</div></div>';
    el.innerHTML = h;
  }

  // ── OUTREACH ──────────────────────────────────────────────────────────
  function _lwsOutreach(el, cl) {
    var events = (_s.ws.activity || []).filter(function (e) {
      var t = (e.type || e.action || '').toLowerCase();
      return t.indexOf('email') !== -1 || t.indexOf('call') !== -1 || t.indexOf('outreach') !== -1;
    });
    var h = '<div class="space-y-4">';
    h += '<div class="flex items-center justify-between">';
    h += '<h3 class="text-sm font-bold text-gray-900"><i class="fas fa-paper-plane text-gold mr-2"></i>Outreach History</h3>';
    h += '<button class="btn btn-sm btn-gold" onclick="RentalsCRM._logOutreach()"><i class="fas fa-plus mr-1"></i>Log Outreach</button>';
    h += '</div>';
    if (events.length === 0) {
      h += '<div class="text-center py-8 bg-gray-50 rounded-xl"><i class="fas fa-inbox text-3xl text-gray-300 mb-3"></i><p class="text-sm text-gray-500">No outreach logged yet</p></div>';
    } else {
      events.forEach(function (ev) {
        h += '<div class="flex gap-3 p-3 border rounded-lg">';
        h += '<div style="width:8px;height:8px;border-radius:50%;background:#059669;margin-top:6px;flex-shrink:0;"></div>';
        h += '<div><div class="text-sm font-semibold text-gray-900">' + E(ev.title || ev.type || 'Outreach') + '</div>';
        if (ev.description) h += '<p class="text-xs text-gray-600">' + E(ev.description) + '</p>';
        h += '<span class="text-[10px] text-gray-400">' + (ev.created_at ? _ago(ev.created_at) : '') + '</span>';
        h += '</div></div>';
      });
    }
    h += '</div>';
    el.innerHTML = h;
  }

  // ── INTAKE ────────────────────────────────────────────────────────────
  function _lwsIntake(el, cl) {
    var lt = cl.lease_terms || {};
    var fs = cl.fee_structure || 'owner_pay';
    var pd = cl.property_disclosures || {};

    var h = '<div class="space-y-5">';

    // Unit details
    h += '<div class="bg-white border rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-3"><i class="fas fa-door-open text-gold mr-2"></i>Unit Details</h3>';
    h += '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">';
    h += _f('Address', cl.property_address || '-', 'property_address');
    h += _f('Unit', cl.unit_number || '-', 'unit_number');
    h += _f('Building Type', cl.building_type || '-', 'building_type');
    h += _f('Target Rent ($/mo)', cl.rent_per_month ? $(Number(cl.rent_per_month)) : '-', 'rent_per_month');
    h += _f('Target Move-In Date', cl.relist_reminder_date ? D(cl.relist_reminder_date) : '-', 'relist_reminder_date');
    h += _f('Is Unit Currently Occupied?', cl.vacancy_risk === 'occupied' ? 'Yes' : 'No', 'vacancy_risk');
    h += '</div>';

    // Lease expiry if occupied
    if (cl.lease_end_date) {
      h += '<div class="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs">';
      h += '<i class="fas fa-clock text-amber-500 mr-1"></i>';
      h += '<strong>Current Lease Expires:</strong> ' + D(cl.lease_end_date) + ' — ' + _daysUntil(cl.lease_end_date) + ' days';
      h += '</div>';
    }
    h += '</div>';

    // Unit condition
    h += '<div class="bg-white border rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-3"><i class="fas fa-paint-roller text-gold mr-2"></i>Unit Condition &amp; Readiness</h3>';
    h += '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">';
    h += _f('Condition', lt.unit_condition || '-', 'unit_condition_note');
    h += _f('Furnished', cl.fee_structure === 'furnished' ? 'Yes' : 'Unfurnished');
    h += '</div>';
    h += '<div class="mt-3"><textarea id="unit_condition_notes" placeholder="Describe unit condition, what needs to be done before listing..." rows="2" class="w-full border rounded-lg px-3 py-2 text-sm">' + E(lt.unit_condition_notes || '') + '</textarea></div>';
    h += '</div>';

    // Landlord terms
    h += '<div class="bg-white border rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-3"><i class="fas fa-file-signature text-gold mr-2"></i>Landlord Terms</h3>';
    h += '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">';

    // Fee structure
    h += '<div class="p-3 bg-gray-50 rounded-lg">';
    h += '<div class="text-[10px] font-bold text-gray-500 uppercase mb-2">Broker Fee</div>';
    var feeOpts = [
      { v: 'owner_pay', l: 'Owner Pays (OP)' },
      { v: 'tenant_pay', l: 'Tenant Pays (TP)' },
      { v: 'no_fee', l: 'No Fee' },
      { v: 'split', l: 'Split' },
    ];
    feeOpts.forEach(function (opt) {
      h += '<label class="flex items-center gap-2 text-xs cursor-pointer mb-1">' +
        '<input type="radio" name="fee_structure_' + cl.id + '" value="' + opt.v + '" ' + (fs === opt.v ? 'checked' : '') + ' class="w-3 h-3">' +
        '<span>' + opt.l + '</span></label>';
    });
    h += '</div>';

    h += _f('Lease Length', lt.lease_length || '12 months');
    h += _f('Pets Policy', lt.pets_policy || '-');
    h += _f('Guarantor Requirements', lt.guarantor_requirements || 'Standard (40x income)');
    h += _f('Income Requirement', lt.income_requirement || '40x monthly rent');
    h += _f('Credit Score Required', lt.credit_score_required || '-');
    h += _f('Board Approval Required', lt.board_required ? 'Yes' : 'No');
    h += '</div>';

    // Disclosures
    h += '<div class="mt-4">';
    h += '<div class="text-xs font-bold text-gray-700 mb-2">Required Disclosures (NY State)</div>';
    var disclosures = [
      ['lead_paint', 'Lead Paint Disclosure'],
      ['bed_bugs', 'Bed Bug Disclosure'],
      ['flooding', 'Flooding History'],
      ['violations', 'Building Violations Disclosed'],
      ['mold', 'Mold History'],
    ];
    h += '<div class="grid grid-cols-2 gap-2">';
    disclosures.forEach(function (d) {
      var checked = pd[d[0]];
      h += '<label class="flex items-center gap-2 text-xs cursor-pointer p-2 rounded-lg ' + (checked ? 'bg-green-50' : 'bg-gray-50') + '">' +
        '<input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="RentalsCRM._toggleDisclosure(\'' + d[0] + '\',this.checked)" class="w-3.5 h-3.5 rounded">' +
        '<span class="' + (checked ? 'text-green-700 font-semibold' : 'text-gray-600') + '">' + E(d[1]) + '</span></label>';
    });
    h += '</div></div></div>';

    // Management company
    h += '<div class="bg-white border rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-3"><i class="fas fa-building text-gold mr-2"></i>Management Company</h3>';
    var bm = cl.building_mgmt_requirements || {};
    h += '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">';
    h += _f('Management Company', bm.management_company || '-', 'management_company_note');
    h += _f('Board Approval Process', bm.board_approval || '-');
    h += _f('Move-In Requirements', bm.move_in_rules || '-');
    h += _f('Move-In Fee', bm.move_in_fee || '-');
    h += '</div></div>';

    // Private owner vs management company note
    h += '<div class="bg-yellow-50 border border-yellow-200 rounded-xl p-4">';
    h += '<div class="text-xs font-bold text-yellow-800 mb-1"><i class="fas fa-user mr-1"></i>Private Owner vs. Management Company</div>';
    h += '<p class="text-xs text-yellow-700">If managed by a company, confirm: who signs the lease? Who holds the security deposit? Who is the point of contact for the tenant?</p>';
    h += '</div>';

    h += '</div>';
    el.innerHTML = h;
  }

  // ── LISTING (Active) ──────────────────────────────────────────────────
  function _lwsListing(el, cl) {
    var h = '<div class="space-y-4">';
    h += '<div class="bg-white border rounded-xl p-5">';
    h += '<div class="flex items-center justify-between mb-4">';
    h += '<h3 class="text-sm font-bold text-gray-900"><i class="fas fa-building text-gold mr-2"></i>Active Rental Listing</h3>';
    h += '<button class="btn btn-sm btn-gold" onclick="RentalsCRM._viewListing()"><i class="fas fa-external-link-alt mr-1"></i>View Listing</button>';
    h += '</div>';
    if (cl.active_rental_listing_id) {
      h += '<div class="grid grid-cols-2 gap-3">';
      h += _f('Listing ID', cl.active_rental_listing_id);
      h += _f('Status', cl.listing_status || 'No Listing');
      h += _f('Listed Rent', cl.rent_per_month ? $(Number(cl.rent_per_month)) + '/mo' : '-');
      h += _f('Days on Market', cl.dom || '0');
      h += '</div>';
      h += '<div class="mt-3 grid grid-cols-3 gap-3 text-center">';
      h += '<div class="p-3 bg-blue-50 rounded-lg"><div class="text-xl font-bold text-blue-700">' + (cl.showings_count || 0) + '</div><div class="text-[10px] text-gray-500">Showings</div></div>';
      h += '<div class="p-3 bg-green-50 rounded-lg"><div class="text-xl font-bold text-green-700">' + (cl.open_house_count || 0) + '</div><div class="text-[10px] text-gray-500">Open Houses</div></div>';
      h += '<div class="p-3 bg-purple-50 rounded-lg"><div class="text-xl font-bold text-purple-700">' + (cl.inquiry_count || 0) + '</div><div class="text-[10px] text-gray-500">Inquiries</div></div>';
      h += '</div>';
    } else {
      h += '<div class="text-center py-8 bg-gray-50 rounded-xl">';
      h += '<i class="fas fa-building text-3xl text-gray-300 mb-3"></i>';
      h += '<p class="text-sm text-gray-500">No active listing yet</p>';
      h += '<button class="btn btn-sm btn-gold mt-3" onclick="RentalsCRM._createListing()"><i class="fas fa-plus mr-1"></i>Create Rental Listing</button>';
      h += '</div>';
    }
    h += '</div></div>';
    el.innerHTML = h;
  }

  // ── SHOWINGS ──────────────────────────────────────────────────────────
  function _lwsShowings(el, cl) {
    el.innerHTML = '<div class="flex items-center justify-center py-8"><i class="fas fa-spinner fa-spin text-gold text-xl"></i></div>';
    MallanAPI._fetch('/api/crm/showings?client_id=' + cl.id).catch(function () { return { showings: [] }; }).then(function (data) {
      var showings = data.showings || [];
      var h = '<div class="space-y-4">';
      h += '<div class="flex items-center justify-between">';
      h += '<h3 class="text-sm font-bold text-gray-900"><i class="fas fa-calendar text-gold mr-2"></i>Showings &amp; Feedback (' + showings.length + ')</h3>';
      h += '<button class="btn btn-sm btn-gold" onclick="RentalsCRM._scheduleShowing()"><i class="fas fa-plus mr-1"></i>Schedule</button>';
      h += '</div>';
      if (showings.length === 0) {
        h += '<div class="text-center py-8 bg-gray-50 rounded-xl"><i class="fas fa-calendar text-3xl text-gray-300 mb-3"></i><p class="text-sm text-gray-500">No showings yet</p></div>';
      } else {
        showings.forEach(function (s) {
          var feedbackColor = s.feedback ? { 1:'red',2:'orange',3:'yellow',4:'blue',5:'green' }[s.feedback.rating] || 'gray' : 'gray';
          h += '<div class="bg-white border border-gray-200 rounded-xl p-4">';
          h += '<div class="flex items-start justify-between">';
          h += '<div><div class="font-semibold text-sm text-gray-900">' + E(s.date ? D(s.date) : '--') + (s.time ? ' at ' + s.time : '') + '</div>';
          h += '<div class="text-xs text-gray-500 mt-0.5">' + E(s.type || 'Private') + ' · ' + E(s.status || 'Scheduled') + '</div></div>';
          if (s.feedback && s.feedback.rating) {
            h += '<div class="flex items-center gap-1">';
            for (var i = 1; i <= 5; i++) {
              h += '<i class="fas fa-star text-' + (i <= s.feedback.rating ? feedbackColor + '-400' : 'gray-200') + ' text-xs"></i>';
            }
            h += '</div>';
          }
          h += '</div>';
          if (s.feedback && s.feedback.notes) {
            h += '<div class="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">' + E(s.feedback.notes) + '</div>';
          }
          h += '</div>';
        });
      }
      h += '</div>';
      el.innerHTML = h;
    });
  }

  // ── APPLICATIONS ──────────────────────────────────────────────────────
  function _lwsApplications(el, cl) {
    el.innerHTML = '<div class="flex items-center justify-center py-8"><i class="fas fa-spinner fa-spin text-gold text-xl"></i></div>';
    MallanAPI._fetch('/api/crm/rentals/applications?landlord_id=' + cl.id).catch(function () { return { applications: [] }; }).then(function (data) {
      var apps = data.applications || [];
      var h = '<div class="space-y-4">';
      h += '<div class="flex items-center justify-between">';
      h += '<h3 class="text-sm font-bold text-gray-900"><i class="fas fa-file-alt text-gold mr-2"></i>Tenant Applications (' + apps.length + ')</h3>';
      h += '<button class="btn btn-sm btn-gold" onclick="RentalsCRM._addApplication()"><i class="fas fa-plus mr-1"></i>Add Application</button>';
      h += '</div>';
      if (apps.length === 0) {
        h += '<div class="p-4 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl text-center">';
        h += '<p class="text-sm text-gray-500">No applications yet</p>';
        h += '<p class="text-xs text-gray-400 mt-1">Click "Add Application" to log a new tenant application.</p>';
        h += '</div>';
      } else {
        apps.forEach(function (a) {
          var statusColors = { submitted: '#2563EB', under_review: '#D97706', approved: '#059669', rejected: '#DC2626' };
          var statusColor = statusColors[a.status] || '#6B7280';
          h += '<div class="bg-white border border-gray-200 rounded-xl p-4">';
          h += '<div class="flex items-start justify-between">';
          h += '<div><div class="font-semibold text-sm text-gray-900">' + E(a.address || a.property_address || 'No address') + '</div>';
          h += '<div class="text-xs text-gray-500 mt-0.5">' + (a.created_at ? D(a.created_at) : '') + '</div></div>';
          h += '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:#F9FAFB;color:' + statusColor + '">' + E((a.status || '').replace(/_/g, ' ')) + '</span>';
          h += '</div>';
          if (a.notes) h += '<div class="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">' + E(a.notes) + '</div>';
          h += '</div>';
        });
      }
      h += '<div class="bg-blue-50 border border-blue-200 rounded-xl p-4">';
      h += '<div class="text-xs font-bold text-blue-700 mb-2">Document Checklist per Applicant</div>';
      var docs = ['Financial Statement', 'Pay Stubs (3 months)', 'Tax Returns (2 years)', 'W-2 / 1099', 'Bank Statements (3 months)', 'Employment Letter', 'Landlord Reference Letter', 'Photo ID'];
      h += '<div class="grid grid-cols-2 gap-1">';
      docs.forEach(function (d) {
        h += '<div class="text-xs text-blue-600"><i class="fas fa-circle text-[6px] mr-1"></i>' + E(d) + '</div>';
      });
      h += '</div></div></div>';
      el.innerHTML = h;
    });
  }

  // ── BOARD (condo/coop/condop) ─────────────────────────────────────────
  function _lwsBoard(el, cl) {
    var bm = cl.building_mgmt_requirements || {};
    var boardStatus = cl.board_app_status || 'not_started';
    var stages = [
      { k: 'not_started',      l: 'Not Started' },
      { k: 'in_progress',      l: 'Package In Progress' },
      { k: 'submitted',        l: 'Submitted to Board' },
      { k: 'interview_scheduled', l: 'Interview Scheduled' },
      { k: 'approved',         l: 'Approved' },
      { k: 'rejected',         l: 'Rejected' },
    ];

    var h = '<div class="space-y-4">';
    h += '<div class="bg-white border rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-4"><i class="fas fa-users text-gold mr-2"></i>Board Application — ' + E(cl.building_type || 'Building') + '</h3>';

    // Status stepper
    h += '<div class="flex items-center gap-2 mb-4 overflow-x-auto pb-2">';
    stages.forEach(function (s, i) {
      var isActive = s.k === boardStatus;
      var isPast = stages.findIndex(function (x) { return x.k === boardStatus; }) > i;
      var color = isActive ? '#059669' : isPast ? '#6B7280' : '#D1D5DB';
      h += '<div class="flex items-center gap-1 flex-shrink-0">';
      h += '<div style="width:28px;height:28px;border-radius:50%;background:' + (isActive ? '#ECFDF5' : isPast ? '#F9FAFB' : '#F9FAFB') + ';border:2px solid ' + color + ';display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:' + color + ';">' + (isPast ? '✓' : i+1) + '</div>';
      h += '<div class="text-[10px] text-gray-600 max-w-[70px] text-center leading-tight ' + (isActive ? 'font-bold text-green-700' : '') + '">' + E(s.l) + '</div>';
      if (i < stages.length - 1) h += '<div style="width:20px;height:2px;background:' + (isPast ? '#6B7280' : '#E5E7EB') + ';flex-shrink:0;"></div>';
      h += '</div>';
    });
    h += '</div>';

    h += '<div class="flex gap-2 flex-wrap mb-4">';
    stages.forEach(function (s) {
      if (s.k !== boardStatus) {
        h += '<button class="btn btn-xs btn-outline" onclick="RentalsCRM._setBoardStatus(\'' + s.k + '\')">' + E(s.l) + '</button>';
      }
    });
    h += '</div>';

    // Board package checklist
    h += '<div class="text-xs font-bold text-gray-700 mb-2">Board Package Checklist</div>';
    var bpItems = [
      ['signed_lease', 'Signed Lease (all pages)'],
      ['proof_of_funds', 'Proof of Funds / Mortgage Commitment'],
      ['tax_returns_2yr', 'Tax Returns (2 years — all parties)'],
      ['financial_statements', 'Financial Statements (2 years)'],
      ['bank_statements', 'Bank Statements (3 months)'],
      ['employment_letter', 'Employment Letter'],
      ['reference_personal_1', 'Personal Reference Letter 1'],
      ['reference_personal_2', 'Personal Reference Letter 2'],
      ['reference_professional', 'Professional Reference Letter'],
      ['landlord_reference', 'Landlord Reference Letter'],
      ['board_application', 'Board Application Form (building-specific)'],
      ['photo_id', 'Photo ID (all parties)'],
    ];
    var docs = cl.documents_collected || {};
    h += '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">';
    bpItems.forEach(function (item) {
      var done = docs[item[0]];
      h += '<label class="flex items-center gap-2 text-xs cursor-pointer p-2 rounded-lg ' + (done ? 'bg-green-50' : 'bg-gray-50') + '">' +
        '<input type="checkbox" ' + (done ? 'checked' : '') + ' onchange="RentalsCRM._toggleDoc(\'' + item[0] + '\',this.checked)" class="w-3.5 h-3.5 rounded">' +
        '<span class="' + (done ? 'text-green-700 font-semibold' : 'text-gray-600') + '">' + E(item[1]) + '</span>' +
        (done ? '<i class="fas fa-check text-green-500 ml-auto text-[10px]"></i>' : '') +
        '</label>';
    });
    h += '</div>';

    // Co-op interview prep
    if (cl.building_type === 'coop') {
      h += '<div class="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">';
      h += '<div class="text-sm font-bold text-amber-800 mb-2"><i class="fas fa-comments mr-1"></i>Co-op Board Interview Prep</div>';
      var questions = [
        'Why do you want to live in this building?',
        'What do you do for work? Tell us about your employer.',
        'What is your typical schedule / lifestyle?',
        'Do you have any pets? If so, describe.',
        'Do you plan to sublet at any point?',
        'How do you handle conflicts with neighbors?',
        'Do you have any guests staying for extended periods?',
      ];
      h += '<div class="space-y-1.5">';
      questions.forEach(function (q) {
        h += '<div class="text-xs text-amber-700"><i class="fas fa-question-circle mr-1 text-amber-400"></i>' + E(q) + '</div>';
      });
      h += '</div>';
      h += '<div class="mt-3 text-xs font-bold text-amber-700">What NOT to say:</div>';
      h += '<div class="text-xs text-amber-600 mt-1">• Do not discuss politics, religion, or personal beliefs<br>• Do not mention subletting plans<br>• Do not make financial commitments not in the package<br>• Do not appear rushed or impatient</div>';
      h += '</div>';
    }
    h += '</div></div>';
    el.innerHTML = h;
  }

  // ── MOVE-IN ───────────────────────────────────────────────────────────
  function _lwsMoveIn(el, cl) {
    var h = '<div class="space-y-4">';
    h += '<div class="bg-white border rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-4"><i class="fas fa-door-open text-gold mr-2"></i>Move-In Coordination</h3>';

    var checklist = [
      ['walkthrough_done', 'Walkthrough completed by tenant'],
      ['keys_given', 'Keys given to tenant'],
      ['deposit_collected', 'Security deposit received (1 month)'],
      ['first_month_collected', 'First month rent received'],
      ['commission_paid', 'Commission paid'],
      ['landlord_introduction', 'Formal introduction — landlord ↔ tenant'],
      ['management_instructions', 'Management company move-in instructions provided'],
      ['lease_start_recorded', 'Lease start date recorded in system'],
      ['lease_end_recorded', 'Lease end date recorded — outreach scheduled'],
    ];

    var docs = cl.documents_collected || {};
    h += '<div class="space-y-2">';
    checklist.forEach(function (item) {
      var done = docs[item[0]];
      h += '<label class="flex items-center gap-3 p-3 rounded-xl cursor-pointer border ' + (done ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200') + '">' +
        '<input type="checkbox" ' + (done ? 'checked' : '') + ' onchange="RentalsCRM._toggleDoc(\'' + item[0] + '\',this.checked)" class="w-4 h-4 rounded">' +
        '<span class="text-sm ' + (done ? 'text-green-700 font-semibold line-through decoration-green-400' : 'text-gray-700') + '">' + E(item[1]) + '</span>' +
        (done ? '<i class="fas fa-check-circle text-green-500 ml-auto"></i>' : '') +
        '</label>';
    });
    h += '</div>';

    // Lease dates
    h += '<div class="mt-4 grid grid-cols-2 gap-3">';
    h += '<div><label class="block text-xs font-semibold text-gray-700 mb-1">Lease Start Date</label>';
    h += '<input type="date" id="lease_start" value="' + (cl.lease_start_date ? cl.lease_start_date.split('T')[0] : '') + '" class="w-full border rounded-lg px-3 py-2 text-sm" onchange="RentalsCRM._saveLeaseDate(\'start\',this.value)"></div>';
    h += '<div><label class="block text-xs font-semibold text-gray-700 mb-1">Lease End Date</label>';
    h += '<input type="date" id="lease_end" value="' + (cl.lease_end_date ? cl.lease_end_date.split('T')[0] : '') + '" class="w-full border rounded-lg px-3 py-2 text-sm" onchange="RentalsCRM._saveLeaseDate(\'end\',this.value)"></div>';
    h += '</div>';
    h += '</div></div>';
    el.innerHTML = h;
  }

  // ── ALL LEASES (portfolio view) ───────────────────────────────────────
  function _lwsLeases(el, cl) {
    var leases = _s.ws.leases || [];
    var h = '<div class="space-y-4">';
    h += '<div class="flex items-center justify-between">';
    h += '<h3 class="text-sm font-bold text-gray-900"><i class="fas fa-file-contract text-gold mr-2"></i>All Leases — Portfolio (' + leases.length + ')</h3>';
    h += '<button class="btn btn-sm btn-gold" onclick="RentalsCRM._addLease()"><i class="fas fa-plus mr-1"></i>Add Lease</button>';
    h += '</div>';

    if (leases.length === 0) {
      h += '<div class="text-center py-8 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">';
      h += '<i class="fas fa-file-contract text-3xl text-gray-300 mb-3"></i>';
      h += '<p class="text-sm text-gray-500">No leases recorded yet</p>';
      h += '<p class="text-xs text-gray-400 mt-1">Add active or historical leases to track this landlord\'s portfolio and schedule outreach</p>';
      h += '</div>';
    } else {
      leases.forEach(function (l) {
        var urgencyColor = { critical: '#DC2626', high: '#D97706', medium: '#6366F1', low: '#6B7280' }[l.urgency] || '#6B7280';
        h += '<div class="bg-white border border-gray-200 rounded-xl p-4">';
        h += '<div class="flex items-start justify-between gap-3">';
        h += '<div class="min-w-0 flex-1">';
        h += '<div class="font-semibold text-sm text-gray-900">' + E(l.address + (l.unit ? ' #' + l.unit : '')) + '</div>';
        h += '<div class="flex items-center gap-3 mt-1 text-xs text-gray-500">';
        h += '<span>' + $(Number(l.monthly_rent)) + '/mo</span>';
        h += '<span>' + (l.lease_start_date ? new Date(l.lease_start_date).toLocaleDateString() : '--') + ' → ' + (l.lease_end_date ? new Date(l.lease_end_date).toLocaleDateString() : '--') + '</span>';
        h += '<span class="font-semibold" style="color:' + urgencyColor + '">' + (l.days_to_expiry != null ? (l.days_to_expiry <= 0 ? 'Expired' : l.days_to_expiry + ' days left') : '') + '</span>';
        h += '</div>';
        if (l.tenant_name || (l.tenant && l.tenant.first_name)) {
          h += '<div class="text-xs text-gray-500 mt-1"><i class="fas fa-user mr-1 text-gray-300"></i>Tenant: ' + E(l.tenant_name || (l.tenant.first_name + ' ' + l.tenant.last_name)) + '</div>';
        }
        h += '</div>';
        var renewalColor = { renewing: '#059669', not_renewing: '#DC2626', pending_decision: '#D97706' }[l.renewal_status] || '#6B7280';
        h += '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:#F9FAFB;color:' + renewalColor + ';">' + E(l.renewal_status || 'Unknown') + '</span>';
        h += '</div></div>';
      });
    }
    h += '</div>';
    el.innerHTML = h;
  }

  // ── PARTIES ───────────────────────────────────────────────────────────
  function _lwsParties(el, cl) {
    el.innerHTML = '<div id="rws-parties-content"></div>';
    var panel = document.getElementById('rws-parties-content');
    if (panel && typeof PartiesPanel !== 'undefined') {
      PartiesPanel.render(panel, cl.id, { roleLabel: 'Landlord' });
    }
  }

  // ── DOCUMENTS ─────────────────────────────────────────────────────────
  function _lwsDocs(el, cl) {
    el.innerHTML = '<div class="flex items-center justify-center py-8"><i class="fas fa-spinner fa-spin text-gold text-xl"></i></div>';
    Documents.list('client', cl.id).then(function (docs) {
      docs = docs || [];
      var h = '<div class="space-y-4">';
      h += '<div class="flex items-center justify-between mb-2">';
      h += '<h3 class="text-sm font-bold text-gray-900"><i class="fas fa-folder text-gold mr-2"></i>Documents (' + docs.length + ')</h3>';
      h += '<button class="btn btn-sm btn-gold" onclick="RentalsCRM._uploadDoc()"><i class="fas fa-upload mr-1"></i>Upload</button>';
      h += '</div>';
      if (docs.length === 0) {
        h += '<div class="text-center py-8 bg-gray-50 rounded-xl"><i class="fas fa-folder-open text-3xl text-gray-300 mb-3"></i><p class="text-sm text-gray-500">No documents yet</p></div>';
      } else {
        docs.forEach(function (d) {
          var statusColors = { uploaded: '#6B7280', pending: '#D97706', approved: '#059669', signed: '#2563EB', rejected: '#DC2626' };
          var statusColor = statusColors[d.status] || '#6B7280';
          h += '<div class="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">';
          h += '<div class="flex items-center gap-3 min-w-0">';
          h += '<i class="fas fa-file text-gray-400"></i>';
          h += '<div class="min-w-0"><div class="text-sm font-medium text-gray-900 truncate">' + E(d.title || d.name || d.doc_type || 'Untitled') + '</div>';
          h += '<div class="text-xs text-gray-500">' + E(d.doc_type || '') + (d.created_at ? ' · ' + D(d.created_at) : '') + '</div></div>';
          h += '</div>';
          h += '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:#F9FAFB;color:' + statusColor + '">' + E(d.status || 'uploaded') + '</span>';
          h += '</div>';
        });
      }
      h += '</div>';
      el.innerHTML = h;
    }).catch(function () {
      el.innerHTML = '<div class="space-y-4"><div class="flex items-center justify-between mb-2"><h3 class="text-sm font-bold text-gray-900"><i class="fas fa-folder text-gold mr-2"></i>Documents</h3><button class="btn btn-sm btn-gold" onclick="RentalsCRM._uploadDoc()"><i class="fas fa-upload mr-1"></i>Upload</button></div><div class="text-center py-8 bg-gray-50 rounded-xl"><p class="text-sm text-gray-500">Could not load documents</p></div></div>';
    });
  }

  // ── TOOLS ─────────────────────────────────────────────────────────────
  function _lwsTools(el, cl) {
    var h = '<div class="space-y-4">';
    h += '<div class="flex flex-wrap gap-2 mb-4">';
    var calcs = [
      { id: 'vacancy', label: 'Vacancy Cost', icon: 'fa-door-open' },
      { id: 'rental-yield', label: 'Rental Yield', icon: 'fa-percentage' },
      { id: 'cap-rate', label: 'Cap Rate', icon: 'fa-chart-line' },
    ];
    calcs.forEach(function (c, i) {
      h += '<button onclick="RentalsCRM._showCalc(\'' + c.id + '\')" id="rcalc-btn-' + c.id + '" ' +
        'class="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-semibold ' +
        (i === 0 ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400') + '">' +
        '<i class="fas ' + c.icon + '"></i> ' + E(c.label) + '</button>';
    });
    h += '</div>';
    h += '<div id="rcalc-area">';
    h += '<div id="rcalc-vacancy" class="bg-white border rounded-xl p-5">' + (typeof VacancyCostCalc !== 'undefined' ? VacancyCostCalc.render({ monthly_rent: Number(cl.rent_per_month || 0) }) : '') + '</div>';
    h += '<div id="rcalc-rental-yield" class="bg-white border rounded-xl p-5" style="display:none;">' + (typeof RentalYieldCalc !== 'undefined' ? RentalYieldCalc.render() : '') + '</div>';
    h += '<div id="rcalc-cap-rate" class="bg-white border rounded-xl p-5" style="display:none;">' + (typeof CapRateCalc !== 'undefined' ? CapRateCalc.render() : '') + '</div>';
    h += '</div></div>';
    el.innerHTML = h;
  }

  function _showCalc(id) {
    document.querySelectorAll('[id^="rcalc-"]:not([id^="rcalc-btn"]):not([id="rcalc-area"])').forEach(function (el) { el.style.display = 'none'; });
    var t = document.getElementById('rcalc-' + id);
    if (t) t.style.display = 'block';
    document.querySelectorAll('[id^="rcalc-btn-"]').forEach(function (b) {
      b.classList.remove('bg-gray-900', 'text-white', 'border-gray-900');
      b.classList.add('bg-white', 'text-gray-600', 'border-gray-200');
    });
    var ab = document.getElementById('rcalc-btn-' + id);
    if (ab) { ab.classList.add('bg-gray-900', 'text-white', 'border-gray-900'); ab.classList.remove('bg-white', 'text-gray-600', 'border-gray-200'); }
  }

  // ── ACTIVITY ──────────────────────────────────────────────────────────
  function _lwsActivity(el, cl) {
    var events = _s.ws.activity || [];
    var h = '<div class="space-y-3"><h3 class="text-sm font-bold text-gray-900"><i class="fas fa-stream text-gold mr-2"></i>Activity Timeline (' + events.length + ')</h3>';
    if (events.length === 0) {
      h += '<div class="text-center py-8 bg-gray-50 rounded-xl"><p class="text-sm text-gray-500">No activity yet</p></div>';
    } else {
      events.forEach(function (ev) {
        h += '<div class="flex gap-3 p-3 border rounded-lg">';
        h += '<div style="width:8px;height:8px;border-radius:50%;background:#059669;margin-top:6px;flex-shrink:0;"></div>';
        h += '<div><div class="text-sm font-semibold text-gray-900">' + E(ev.title || ev.type || ev.action || 'Event') + '</div>';
        if (ev.description) h += '<p class="text-xs text-gray-600">' + E(ev.description) + '</p>';
        h += '<span class="text-[10px] text-gray-400">' + (ev.created_at ? _ago(ev.created_at) : '') + '</span>';
        h += '</div></div>';
      });
    }
    h += '</div>';
    el.innerHTML = h;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 2: ACTIVE LEASES (already-rented portfolio)
  // ═══════════════════════════════════════════════════════════════════════
  function activeLeases() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _subnav('active-leases') + '<div class="flex items-center justify-center h-40"><i class="fas fa-spinner fa-spin text-2xl text-gold"></i></div>';

    MallanAPI._fetch('/api/crm/active-leases').then(function (data) {
      _s.leases.data = data.leases || [];
      _renderActiveLeases(c);
    }).catch(function (err) {
      c.innerHTML = _subnav('active-leases') + '<div class="text-center py-12 text-red-500">' + E(err.message || 'Failed to load') + '</div>';
    });
  }

  function _renderActiveLeases(c) {
    var leases = _s.leases.data;
    var expiring90 = leases.filter(function (l) { return l.days_to_expiry != null && l.days_to_expiry <= 90 && l.days_to_expiry > 0; }).length;
    var critical = leases.filter(function (l) { return l.days_to_expiry != null && l.days_to_expiry <= 30; }).length;
    var renewing = leases.filter(function (l) { return l.renewal_status === 'renewing'; }).length;

    var h = _subnav('active-leases');
    h += _kpi([
      { icon: 'fa-file-contract', label: 'Total Leases', value: leases.length, fg: '#3B82F6', bg: '#EFF6FF' },
      { icon: 'fa-exclamation-triangle', label: 'Expiring 90d', value: expiring90, fg: '#D97706', bg: '#FFFBEB' },
      { icon: 'fa-fire', label: 'Critical (30d)', value: critical, fg: '#DC2626', bg: '#FEF2F2' },
      { icon: 'fa-handshake', label: 'Renewing', value: renewing, fg: '#059669', bg: '#ECFDF5' },
    ]);

    h += '<div class="flex items-center justify-between mb-3">';
    h += '<input type="text" placeholder="Search address, tenant..." class="border rounded-lg px-3 py-2 text-sm w-64" oninput="RentalsCRM._searchLeases(event)">';
    h += '<button class="btn btn-sm btn-gold" onclick="RentalsCRM._addNewLease()"><i class="fas fa-plus mr-1"></i>Add Lease</button>';
    h += '</div>';

    if (leases.length === 0) {
      h += '<div class="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">';
      h += '<i class="fas fa-file-contract text-4xl text-gray-300 mb-4"></i>';
      h += '<p class="text-lg font-semibold text-gray-400">No active leases recorded</p>';
      h += '<p class="text-sm text-gray-400 mt-1">Add existing leases to track renewals and schedule outreach</p>';
      h += '<button class="btn btn-sm btn-gold mt-4" onclick="RentalsCRM._addNewLease()"><i class="fas fa-plus mr-1"></i>Add First Lease</button>';
      h += '</div>';
    } else {
      h += '<div class="space-y-3">';
      leases.forEach(function (l) {
        var urgColor = { critical: '#DC2626', high: '#D97706', medium: '#6366F1', low: '#6B7280' }[l.urgency] || '#6B7280';
        var urgBg = { critical: '#FEF2F2', high: '#FFFBEB', medium: '#EEF2FF', low: '#F9FAFB' }[l.urgency] || '#F9FAFB';
        h += '<div class="bg-white border border-gray-200 rounded-xl p-4 hover:border-gold/30 cursor-pointer transition-colors" onclick="RentalsCRM._openLease(\'' + E(l.id) + '\')">';
        h += '<div class="flex items-start justify-between gap-3">';
        h += '<div class="min-w-0 flex-1">';
        h += '<div class="font-semibold text-sm text-gray-900">' + E(l.address + (l.unit ? ' #' + l.unit : '')) + '</div>';
        h += '<div class="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500">';
        h += '<span class="font-semibold text-gray-800">' + $(Number(l.monthly_rent)) + '/mo</span>';
        var endDate = l.lease_end_date ? new Date(l.lease_end_date).toLocaleDateString() : '--';
        h += '<span>Ends: ' + endDate + '</span>';
        if (l.tenant_name || (l.tenant && l.tenant.first_name)) {
          h += '<span><i class="fas fa-user mr-1 text-gray-300"></i>' + E(l.tenant_name || (l.tenant.first_name + ' ' + (l.tenant.last_name || ''))) + '</span>';
        }
        if (l.landlord && l.landlord.first_name) {
          h += '<span><i class="fas fa-key mr-1 text-gray-300"></i>' + E(l.landlord.first_name + ' ' + (l.landlord.last_name || '')) + '</span>';
        }
        h += '</div></div>';
        h += '<div class="flex flex-col items-end gap-1.5 flex-shrink-0">';
        if (l.days_to_expiry != null) {
          h += '<span style="font-size:11px;font-weight:700;padding:2px 9px;border-radius:6px;background:' + urgBg + ';color:' + urgColor + ';">' + (l.days_to_expiry <= 0 ? 'Expired' : l.days_to_expiry + 'd left') + '</span>';
        }
        var rColor = { renewing: '#059669', not_renewing: '#DC2626', pending_decision: '#D97706' }[l.renewal_status] || '#9CA3AF';
        h += '<span style="font-size:10px;color:' + rColor + ';font-weight:600;">' + E(l.renewal_status || 'Unknown') + '</span>';
        h += '</div></div></div>';
      });
      h += '</div>';
    }

    c.innerHTML = h;
  }

  function _searchLeases(ev) {
    var q = ev.target.value.toLowerCase();
    _s.leases.data.forEach(function (l) {
      // filtering handled client-side
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 5: CURRENT TENANTS
  // ═══════════════════════════════════════════════════════════════════════
  function currentTenants() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _subnav('tenants') + '<div class="flex items-center justify-center h-40"><i class="fas fa-spinner fa-spin text-2xl text-gold"></i></div>';

    MallanAPI._fetch('/api/crm/rentals/tenants').then(function (data) {
      _s.tenants.data = (data.tenants || data.clients || []).map(function (r) {
        r.name = r.name || ((r.first_name || '') + ' ' + (r.last_name || '')).trim();
        r.stage = r.pipeline_stage || 'active_tenant';
        return r;
      });
      _renderTenants(c);
    }).catch(function (err) {
      c.innerHTML = _subnav('tenants') + '<div class="text-center py-12 text-red-500">' + E(err.message || 'Failed to load') + '</div>';
    });
  }

  function _renderTenants(c) {
    var st = _s.tenants;
    var rows = st.data.slice();
    if (st.search) { var q = st.search.toLowerCase(); rows = rows.filter(function (r) { return (r.name + ' ' + (r.email || '')).toLowerCase().indexOf(q) !== -1; }); }

    var hnw = st.data.filter(function (r) { return r.is_high_net_worth; }).length;
    var expiring90 = st.data.filter(function (r) { return r.lease_end_date && _daysUntil(r.lease_end_date) <= 90; }).length;

    var h = _subnav('tenants');
    h += _kpi([
      { icon: 'fa-user-check', label: 'Current Tenants', value: st.data.length, fg: '#8B5CF6', bg: '#F5F3FF' },
      { icon: 'fa-gem', label: 'High Net Worth', value: hnw, fg: '#B8860B', bg: '#FFFBF0' },
      { icon: 'fa-clock', label: 'Lease Expiring 90d', value: expiring90, fg: '#D97706', bg: '#FFFBEB' },
    ]);

    h += FilterBar.render({
      id: 'tenants', placeholder: 'Search by name or email...', onSearch: 'RentalsCRM._searchTenants',
      filters: [],
      onFilter: 'RentalsCRM._filterTenants',
      quickActions: [{ label: 'Add Tenant', icon: 'fa-plus', onclick: 'RentalsCRM._newTenant()' }],
    });

    h += ActivityTable.render({
      id: 'tenants_tbl',
      columns: [
        { key: 'name', label: 'Tenant', render: function (r) {
          var init = (r.name || '??').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
          var hnwBadge = r.is_high_net_worth ? '<span class="ml-1 text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">HNW</span>' : '';
          return '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div style="width:32px;height:32px;border-radius:50%;background:#f3e8ff;color:#7c3aed;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">' + E(init) + '</div>' +
            '<div><div class="font-semibold text-gray-900">' + E(r.name) + hnwBadge + '</div>' +
            '<div class="text-[10px] text-gray-400">' + E(r.email || '') + '</div></div></div>';
        }},
        { key: 'property_address', label: 'Renting At', render: function (r) { return '<span class="text-sm">' + E((r.property_address || '-') + (r.unit_number ? ' #' + r.unit_number : '')) + '</span>'; }},
        { key: 'rent_per_month', label: 'Rent', render: function (r) { return r.rent_per_month ? $(Number(r.rent_per_month)) + '/mo' : '-'; }},
        { key: 'lease_end_date', label: 'Lease Ends', render: function (r) {
          if (!r.lease_end_date) return '<span class="text-gray-400">—</span>';
          var days = _daysUntil(r.lease_end_date);
          return _urgencyBadge(days) + ' <span class="text-xs text-gray-500">' + new Date(r.lease_end_date).toLocaleDateString() + '</span>';
        }},
        { key: 'renewal_status', label: 'Renewal', render: function (r) {
          var s = r.renewal_status || 'unknown';
          var color = { renewing: '#059669', not_renewing: '#DC2626', pending_decision: '#D97706' }[s] || '#9CA3AF';
          return '<span style="font-size:10px;font-weight:700;color:' + color + ';">' + E(s) + '</span>';
        }},
        { key: 'tenant_origin', label: 'Origin', render: function (r) {
          var labels = { local: 'Local', out_of_state: 'Out of State', international: '🌍 Intl', relocation: '🏢 Reloc' };
          return '<span class="text-xs text-gray-600">' + E(labels[r.tenant_origin] || '-') + '</span>';
        }},
        { key: 'net_worth_estimate', label: 'Est. Net Worth', render: function (r) {
          if (!r.net_worth_estimate) return '<span class="text-gray-400">—</span>';
          return '<span class="text-xs font-semibold text-amber-700">' + $(Number(r.net_worth_estimate)) + '</span>';
        }},
        { key: '_action', label: 'Next Action', render: function (r) {
          var days = r.lease_end_date ? _daysUntil(r.lease_end_date) : null;
          if (days !== null && days <= 30) return '<span class="text-xs text-red-600 font-bold"><i class="fas fa-fire mr-1"></i>30d — Get Exclusive</span>';
          if (days !== null && days <= 60) return '<span class="text-xs text-amber-600 font-bold"><i class="fas fa-home mr-1"></i>Send Rental Listings</span>';
          if (days !== null && days <= 90) return '<span class="text-xs text-indigo-600 font-bold"><i class="fas fa-envelope mr-1"></i>Send Comps</span>';
          if (r.is_high_net_worth) return '<span class="text-xs text-gold font-bold"><i class="fas fa-gem mr-1"></i>Send Sales Listings</span>';
          return '<span class="text-xs text-gray-500"><i class="fas fa-check mr-1"></i>Monitor</span>';
        }},
      ],
      rows: rows, sort: st.sort, onSort: 'RentalsCRM._sortTenants', onRowClick: 'RentalsCRM._openTenant',
      page: st.page, pageSize: 25, onPage: 'RentalsCRM._pageTenants',
      emptyIcon: 'fa-user-check', emptyText: 'No current tenants — they will appear here once leases are signed',
    });

    c.innerHTML = h;
  }

  function _searchTenants(q) { _s.tenants.search = q; _s.tenants.page = 1; _renderTenants(CRM.getContent()); }
  function _filterTenants(k, v) { _s.tenants.filter[k] = v; _renderTenants(CRM.getContent()); }
  function _sortTenants(k) { var st = _s.tenants; st.sort = { key: k, dir: st.sort.key === k && st.sort.dir === 'asc' ? 'desc' : 'asc' }; _renderTenants(CRM.getContent()); }
  function _pageTenants(p) { _s.tenants.page = p; _renderTenants(CRM.getContent()); }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 3+4: RENTAL LISTINGS / VIEWED NOT RENTED / MARKETING / AUTOMATION
  // ═══════════════════════════════════════════════════════════════════════
  function rentalListings() { Router.navigate('/broker/listings/company'); }

  function viewedDidNotRent() { Router.navigate('/sales/prospects'); }

  function rentalsMarketing() { Router.navigate('/sales/prospects'); }

  function rentalsActivity() { Router.navigate('/lease-tracker'); }

  function rentalsAutomation() {
    CRM.setPanelTitle('Rentals CRM');
    var c = CRM.getContent();
    c.innerHTML = _subnav('automation') + _buildAutomationView();
  }

  function _buildAutomationView() {
    var h = '<div class="space-y-5">';
    h += '<div class="bg-white border rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-1"><i class="fas fa-robot text-gold mr-2"></i>Rental Outreach Automation</h3>';
    h += '<p class="text-xs text-gray-500 mb-4">Automated outreach based on lease expiration dates. Agent receives alert for manual send.</p>';

    var rules = [
      { trigger: '6 months after move-in', audience: 'Tenants → Landlord', action: 'Send: Sales comps for landlord\'s property + "Have you considered selling?" + Buy vs Rent calculator', color: 'amber' },
      { trigger: '90 days before lease expiry', audience: 'Tenants', action: 'Send: 3-5 sale listings (if HNW or opened 6mo email) + rental listings nearby', color: 'indigo' },
      { trigger: '60 days before lease expiry', audience: 'Tenants', action: 'Send: Rental listings only — updated inventory', color: 'blue' },
      { trigger: '30 days before lease expiry', audience: 'Tenants + Landlord', action: 'Tenant: Last chance rentals. Landlord: Request another exclusive if not renewing', color: 'red' },
      { trigger: 'Lease renewed', audience: 'Tenants + Landlord', action: 'Restart cycle — mark renewal, update lease dates, schedule next outreach', color: 'green' },
      { trigger: 'Tenant moves out', audience: 'Former Tenant', action: '6mo + 90/60/30 rental outreach at new address. If HNW: continue sales outreach', color: 'purple' },
    ];

    rules.forEach(function (r) {
      var colorMap = { amber: ['#FFFBEB','#D97706'], indigo: ['#EEF2FF','#4F46E5'], blue: ['#EFF6FF','#2563EB'], red: ['#FEF2F2','#DC2626'], green: ['#ECFDF5','#059669'], purple: ['#F5F3FF','#7C3AED'] };
      var col = colorMap[r.color] || ['#F9FAFB','#6B7280'];
      h += '<div class="border rounded-xl p-4 mb-3" style="border-color:' + col[1] + '20;background:' + col[0] + '">';
      h += '<div class="flex items-start gap-3">';
      h += '<div style="width:10px;height:10px;border-radius:50%;background:' + col[1] + ';margin-top:4px;flex-shrink:0;"></div>';
      h += '<div>';
      h += '<div class="text-xs font-bold" style="color:' + col[1] + '">' + E(r.trigger) + '</div>';
      h += '<div class="text-xs text-gray-600 mt-0.5"><strong>Audience:</strong> ' + E(r.audience) + '</div>';
      h += '<div class="text-xs text-gray-600 mt-0.5">' + E(r.action) + '</div>';
      h += '</div></div></div>';
    });

    h += '<div class="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">';
    h += '<strong>Conversion logic:</strong> If tenant opens 6-month email → continue sending sale listings. ';
    h += 'If tenant calls or responds → flag as buyer prospect, promote to Active Buyers in Sales CRM. ';
    h += 'If HNW tenant → always include sale listings regardless of engagement. ';
    h += 'If tenant renews → reset all dates, same cycle next year.';
    h += '</div></div></div>';
    return h;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPER FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════
  function _f(label, value, fieldKey) {
    var editable = fieldKey ? ' onclick="RentalsCRM._editField(\'' + fieldKey + '\',\'' + E(value === '-' ? '' : value) + '\')" style="cursor:pointer;" title="Click to edit"' : '';
    return '<div class="p-2 bg-gray-50 rounded-lg"' + editable + '>' +
      '<div class="text-[10px] font-bold text-gray-500 uppercase">' + E(label) + '</div>' +
      '<div class="text-sm font-medium text-gray-900 mt-0.5">' + E(String(value)) + (fieldKey ? ' <i class="fas fa-pen text-[8px] text-gray-300"></i>' : '') + '</div>' +
    '</div>';
  }

  function _daysUntil(dateStr) {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  function _editField(key, currentVal) {
    var cl = _s.ws.client;
    if (!cl) return;
    var newVal = prompt(key.replace(/_/g, ' ') + ':', currentVal);
    if (newVal === null) return;
    var data = {};
    data[key] = newVal;
    MallanAPI._fetch('/api/crm/clients/' + cl.id, { method: 'PATCH', body: JSON.stringify(data) })
      .then(function () { CRM.toast('Updated', 'success'); cl[key] = newVal; _renderLandlordWorkspace(CRM.getContent()); })
      .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  function _toggleDoc(key, val) {
    var cl = _s.ws.client;
    if (!cl) return;
    var docs = cl.documents_collected || {};
    docs[key] = val;
    MallanAPI._fetch('/api/crm/clients/' + cl.id, { method: 'PATCH', body: JSON.stringify({ documents_collected: docs }) })
      .then(function () { cl.documents_collected = docs; CRM.toast(val ? 'Marked done' : 'Cleared', 'success'); _renderLandlordWorkspace(CRM.getContent()); })
      .catch(function (err) { CRM.toast('Failed', 'error'); });
  }

  function _toggleDisclosure(key, val) { _toggleDoc(key, val); }

  function _setBoardStatus(status) {
    var cl = _s.ws.client;
    if (!cl) return;
    MallanAPI._fetch('/api/crm/clients/' + cl.id, { method: 'PATCH', body: JSON.stringify({ board_app_status: status }) })
      .then(function () { cl.board_app_status = status; CRM.toast('Board status updated: ' + status, 'success'); _renderLandlordWorkspace(CRM.getContent()); })
      .catch(function () { CRM.toast('Failed', 'error'); });
  }

  function _saveLeaseDate(type, val) {
    var cl = _s.ws.client;
    if (!cl) return;
    var data = type === 'start' ? { lease_start_date: val } : { lease_end_date: val };
    MallanAPI._fetch('/api/crm/clients/' + cl.id, { method: 'PATCH', body: JSON.stringify(data) })
      .then(function () { CRM.toast('Lease date saved', 'success'); if (type === 'start') cl.lease_start_date = val; else cl.lease_end_date = val; })
      .catch(function () { CRM.toast('Failed', 'error'); });
  }

  function _loadPropertyResearch() {
    var container = document.getElementById('rws-live-content');
    if (!container) return;
    container.innerHTML = '<p class="text-xs text-gray-400">Property research not yet available.</p>';
  }

  function _wsAction(action) {
    var cl = _s.ws.client;
    if (!cl) return;
    if (action === 'advance_stage') {
      var order = ['prospect','pitching','exclusive_signed','listed','showing','application','lease_out','lease_signed','rented'];
      var idx = order.indexOf(cl.stage || 'prospect');
      var next = order[Math.min(idx + 1, order.length - 1)];
      MallanAPI._fetch('/api/crm/clients/' + cl.id, { method: 'PATCH', body: JSON.stringify({ pipeline_stage: next }) })
        .then(function () { cl.stage = next; cl.pipeline_stage = next; CRM.toast('Advanced to ' + next, 'success'); _renderLandlordWorkspace(CRM.getContent()); })
        .catch(function () { CRM.toast('Failed', 'error'); });
    } else if (action === 'promote_seller') {
      if (!confirm('Promote this landlord to Active Seller in Sales CRM?')) return;
      MallanAPI._fetch('/api/crm/clients/' + cl.id, { method: 'PATCH', body: JSON.stringify({ roles: (cl.roles || []).concat(['seller']), promoted_to_seller_at: new Date().toISOString() }) })
        .then(function () { CRM.toast('Promoted to Seller!', 'success'); Router.navigate('/sales/sellers'); })
        .catch(function () { CRM.toast('Failed', 'error'); });
    } else if (action === 'send_weekly_report') {
      CRM.toast('Sending weekly report...', 'info');
      var rptSubject = 'Weekly Rental Update — ' + (cl.name || 'Your Properties');
      var rptBody = 'Hi ' + (cl.first_name || cl.name || '') + ',\n\nHere is your weekly rental listing update from Mallan Real Estate.\n\nPlease reach out if you have any questions.\n\nBest regards,\nMallan Real Estate Inc.';
      MallanAPI._fetch('/api/crm/email', { method: 'POST', body: JSON.stringify({ type: 'weekly_report', client_ids: [String(cl.id)], subject: rptSubject, body: rptBody }) })
        .then(function () { CRM.toast('Weekly report sent!', 'success'); })
        .catch(function () { CRM.toast('Send failed', 'error'); });
    } else if (action === 'send_comps') {
      _wsTab('pitch');
    } else if (action === 'send_market_report') {
      CRM.toast('Generating market report...', 'info');
      MallanAPI._fetch('/api/crm/market-report', { method: 'POST', body: JSON.stringify({ borough: cl.borough, neighborhoods: cl.neighborhood ? [cl.neighborhood] : [] }) })
        .then(function () { CRM.toast('Market report generated!', 'success'); })
        .catch(function () { CRM.toast('Report generation failed', 'error'); });
    } else if (action === 'schedule_open_house') {
      _scheduleShowing();
    } else if (action === 'send_seller_comps') {
      CRM.toast('Sending sale comps...', 'info');
      MallanAPI._fetch('/api/crm/email', { method: 'POST', body: JSON.stringify({ type: 'sale_comps', client_ids: [String(cl.id)], subject: 'Sale Comps for Your Property — ' + (cl.property_address || ''), body: 'Hi ' + (cl.first_name || cl.name || '') + ',\n\nHere are recent comparable sales in your building and area from Mallan Real Estate.\n\nBest regards,\nMallan Real Estate Inc.' }) })
        .then(function () { CRM.toast('Sale comps sent!', 'success'); })
        .catch(function () { CRM.toast('Send failed', 'error'); });
    }
  }

  function _editClient(clientId) {
    if (clientId) {
      Router.navigate('/workspace/client/' + clientId + '/overview');
    }
  }
  function _newLandlord() {
    if (typeof CRM.quickNewClient === 'function') {
      CRM.quickNewClient('landlord');
    } else {
      CRM.toast('Use Client Address Book to add a new landlord', 'info');
      Router.navigate('/broker/people/clients');
    }
  }
  function _newTenant() {
    if (typeof CRM.quickNewClient === 'function') {
      CRM.quickNewClient('tenant');
    } else {
      CRM.toast('Use Client Address Book to add a new tenant', 'info');
      Router.navigate('/broker/people/clients');
    }
  }
  function _openTenant(id) { _s.ws.tab = 'research'; _openLandlord(id); }
  function _openLease(leaseId) { Router.navigate('/lease-tracker'); }
  function _addLease() { _showAddLeaseModal(); }
  function _addNewLease() { _showAddLeaseModal(); }

  function _showAddLeaseModal() {
    var body = '<form id="addLeaseForm">' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Address *</label>' +
          '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" name="address" required placeholder="123 Main St"></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Unit</label>' +
          '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" name="unit" placeholder="4A"></div>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-3 mt-3">' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Lease Start *</label>' +
          '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" type="date" name="lease_start_date" required></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Lease End *</label>' +
          '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" type="date" name="lease_end_date" required></div>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-3 mt-3">' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Monthly Rent *</label>' +
          '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" type="number" name="monthly_rent" required placeholder="3500"></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Borough</label>' +
          '<select class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" name="borough">' +
            '<option value="">Select...</option><option value="Manhattan">Manhattan</option><option value="Brooklyn">Brooklyn</option><option value="Queens">Queens</option><option value="Bronx">Bronx</option><option value="Staten Island">Staten Island</option>' +
          '</select></div>' +
      '</div>' +
    '</form>';
    CRM.openModal('Add Lease', body, {
      footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
        '<button class="btn btn-gold" onclick="RentalsCRM._submitLease()"><i class="fas fa-plus mr-1"></i>Add</button>',
    });
  }

  function _submitLease() {
    var form = document.getElementById('addLeaseForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = {};
    new FormData(form).forEach(function(v, k) { if (v) data[k] = v; });
    if (data.monthly_rent) data.monthly_rent = Number(data.monthly_rent);
    if (_s.ws.client) data.landlord_lead_id = String(_s.ws.client.id);
    MallanAPI._fetch('/api/crm/active-leases', { method: 'POST', body: JSON.stringify(data) })
      .then(function() { CRM.toast('Lease added', 'success'); CRM.closeModal(); Router.navigate('/lease-tracker'); })
      .catch(function(err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  function _findRentalComps() {
    // Open the Rental Pitch Packet (includes comp search + auto-CMA)
    if (typeof RentalPitchPacket !== 'undefined' && _s.ws.client) {
      var el = document.getElementById('ws-pitch-container') || CRM.getContent();
      RentalPitchPacket.render(el, _s.ws.client);
    } else {
      CRM.toast('Rental pitch packet not available', 'error');
    }
  }
  function _editRentalPricing() { _findRentalComps(); } // Same panel handles pricing
  function _editMarketing() { CRM.toast('Marketing strategy — use Pitch tab for comp-based outreach', 'info'); }
  function _editTimeline() { CRM.toast('Timeline — track lease dates in Leases tab', 'info'); }

  function _logOutreach(clientId) {
    var body = '<form id="logOutreachForm">' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Channel</label>' +
          '<select class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" name="channel">' +
            '<option value="email">Email</option><option value="call">Call</option><option value="sms">SMS</option><option value="in_person">In Person</option>' +
          '</select></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Outcome</label>' +
          '<select class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" name="outcome">' +
            '<option value="reached">Reached</option><option value="voicemail">Voicemail</option><option value="no_answer">No Answer</option><option value="email_sent">Email Sent</option>' +
          '</select></div>' +
      '</div>' +
      '<div class="mt-3"><label class="text-xs font-semibold text-gray-700 block mb-1">Notes</label>' +
        '<textarea class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" name="notes" rows="3" placeholder="What was discussed..."></textarea></div>' +
    '</form>';
    CRM.openModal('Log Outreach', body, {
      footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
        '<button class="btn btn-gold" onclick="RentalsCRM._submitOutreach()">Save</button>',
    });
  }

  function _scheduleShowing(clientId) {
    var body = '<form id="scheduleShowingForm">' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Date</label>' +
          '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" type="date" name="date" required></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Time</label>' +
          '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" type="time" name="time" required></div>' +
      '</div>' +
      '<div class="mt-3"><label class="text-xs font-semibold text-gray-700 block mb-1">Property / Notes</label>' +
        '<textarea class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" name="notes" rows="2" placeholder="Address, unit, details..."></textarea></div>' +
    '</form>';
    CRM.openModal('Schedule Showing', body, {
      footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
        '<button class="btn btn-gold" onclick="RentalsCRM._submitShowing()">Schedule</button>',
    });
  }

  function _addApplication(clientId) {
    var body = '<form id="addAppForm">' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Property Address</label>' +
          '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" name="address" placeholder="123 Main St #4A"></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Application Status</label>' +
          '<select class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" name="status">' +
            '<option value="submitted">Submitted</option><option value="under_review">Under Review</option><option value="approved">Approved</option><option value="rejected">Rejected</option>' +
          '</select></div>' +
      '</div>' +
      '<div class="mt-3"><label class="text-xs font-semibold text-gray-700 block mb-1">Notes</label>' +
        '<textarea class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" name="notes" rows="2" placeholder="Board package status, missing docs..."></textarea></div>' +
    '</form>';
    CRM.openModal('Add Application', body, {
      footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
        '<button class="btn btn-gold" onclick="RentalsCRM._submitApplication()">Add</button>',
    });
  }

  function _createListing() { window.open('/crm/RENTAL-FORM-REDESIGN.html', '_blank'); }
  function _viewListing() { var cl = _s.ws.client; if (cl && cl.active_rental_listing_id) window.open('/crm/RENTAL-FORM-WITH-TOOLS.html?id=' + cl.active_rental_listing_id, '_blank'); }

  function _uploadDoc(clientId) {
    var body = '<div class="space-y-3">' +
      '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Document Type</label>' +
        '<select class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" id="docType">' +
          '<option value="lease">Lease Agreement</option><option value="application">Board Application</option><option value="financial">Financial Docs</option><option value="disclosure">Disclosure</option><option value="other">Other</option>' +
        '</select></div>' +
      '<div><label class="text-xs font-semibold text-gray-700 block mb-1">File</label>' +
        '<input type="file" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" id="docFile"></div>' +
      '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Notes</label>' +
        '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" id="docNotes" placeholder="Document description..."></div>' +
    '</div>';
    CRM.openModal('Upload Document', body, {
      footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
        '<button class="btn btn-gold" onclick="RentalsCRM._submitUpload()">Upload</button>',
    });
  }

  function _submitOutreach() {
    var cl = _s.ws.client;
    if (!cl) return;
    var form = document.getElementById('logOutreachForm');
    if (!form) return;
    var data = {};
    new FormData(form).forEach(function(v, k) { if (v) data[k] = v; });
    MallanAPI._fetch('/api/crm/activity', { method: 'POST', body: JSON.stringify({ client_id: cl.id, type: 'outreach_' + (data.channel || 'email'), title: (data.channel || 'Email') + ' — ' + (data.outcome || 'reached'), description: data.notes || '' }) })
      .then(function () { CRM.toast('Outreach logged', 'success'); CRM.closeModal(); _openLandlord(cl.id); })
      .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  function _submitShowing() {
    var cl = _s.ws.client;
    if (!cl) return;
    var form = document.getElementById('scheduleShowingForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = {};
    new FormData(form).forEach(function(v, k) { if (v) data[k] = v; });
    var listingId = (cl.active_rental_listing_id || '');
    MallanAPI._fetch('/api/crm/showings', { method: 'POST', body: JSON.stringify({ listing_id: String(listingId), lead_id: String(cl.id), date: data.date || '', time: data.time || '', notes: data.notes || '' }) })
      .then(function () { CRM.toast('Showing scheduled', 'success'); CRM.closeModal(); _openLandlord(cl.id); })
      .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  function _submitApplication() {
    var cl = _s.ws.client;
    if (!cl) return;
    var form = document.getElementById('addAppForm');
    if (!form) return;
    var data = {};
    new FormData(form).forEach(function(v, k) { if (v) data[k] = v; });
    MallanAPI._fetch('/api/crm/rentals/applications', { method: 'POST', body: JSON.stringify({ lead_id: String(cl.id), address: data.address || '', showing_date: new Date().toISOString().slice(0, 10), notes: (data.status || '') + ' — ' + (data.notes || '') }) })
      .then(function () { CRM.toast('Application added', 'success'); CRM.closeModal(); _openLandlord(cl.id); })
      .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  function _submitUpload() {
    var cl = _s.ws.client;
    if (!cl) return;
    var fileInput = document.getElementById('docFile');
    var docType = (document.getElementById('docType') || {}).value || 'other';
    var docNotes = (document.getElementById('docNotes') || {}).value || '';
    if (!fileInput || !fileInput.files || !fileInput.files[0]) { CRM.toast('Please select a file', 'error'); return; }
    var fd = new FormData();
    fd.append('file', fileInput.files[0]);
    fd.append('scope', 'client');
    fd.append('entity_type', 'lead');
    fd.append('entity_id', String(cl.id));
    fd.append('doc_type', docType);
    fd.append('notes', docNotes);
    fetch('/api/crm/documents/upload', { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('Upload failed'); return r.json(); })
      .then(function () { CRM.toast('Document uploaded', 'success'); CRM.closeModal(); _openLandlord(cl.id); })
      .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  return {
    landlords: landlords,
    activeLeases: activeLeases,
    rentalListings: rentalListings,
    viewedDidNotRent: viewedDidNotRent,
    currentTenants: currentTenants,
    rentalsMarketing: rentalsMarketing,
    rentalsActivity: rentalsActivity,
    rentalsAutomation: rentalsAutomation,
    _searchLandlords: _searchLandlords, _filterLandlords: _filterLandlords,
    _sortLandlords: _sortLandlords, _pageLandlords: _pageLandlords,
    _searchTenants: _searchTenants, _filterTenants: _filterTenants,
    _sortTenants: _sortTenants, _pageTenants: _pageTenants,
    _openLandlord: _openLandlord, _openTenant: _openTenant,
    _newLandlord: _newLandlord, _newTenant: _newTenant,
    _wsTab: _wsTab, _wsAction: _wsAction,
    _editField: _editField, _toggleDoc: _toggleDoc,
    _toggleDisclosure: _toggleDisclosure, _setBoardStatus: _setBoardStatus,
    _saveLeaseDate: _saveLeaseDate, _showCalc: _showCalc,
    _loadPropertyResearch: _loadPropertyResearch,
    _addLease: _addLease, _addNewLease: _addNewLease, _openLease: _openLease,
    _showAddLeaseModal: _showAddLeaseModal, _submitLease: _submitLease,
    _findRentalComps: _findRentalComps, _editRentalPricing: _editRentalPricing,
    _editMarketing: _editMarketing, _editTimeline: _editTimeline,
    _logOutreach: _logOutreach, _scheduleShowing: _scheduleShowing,
    _addApplication: _addApplication, _createListing: _createListing,
    _viewListing: _viewListing, _uploadDoc: _uploadDoc,
    _submitOutreach: _submitOutreach, _submitShowing: _submitShowing,
    _submitApplication: _submitApplication, _submitUpload: _submitUpload,
    _editClient: _editClient,
  };
})();
