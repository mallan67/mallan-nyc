// ═══════════════════════════════════════════════════════════════════════════════
// SALES CRM — FULL LIFECYCLE BUILD
// Prospect → Active Seller → Post-Sale (Buyer/Renter/Referral)
// ═══════════════════════════════════════════════════════════════════════════════
var SalesCRM = (function () {
  'use strict';
  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;
  var _ago = typeof Utils.formatTimeAgo === 'function' ? Utils.formatTimeAgo : function (d) { return D(d); };

  var _s = {
    sellers: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '', filter: {} },
    buyers: { data: [], sort: { key: 'name', dir: 'asc' }, page: 1, search: '', filter: {} },
    ws: { client: null, tab: 'research', showings: [], offers: [], activity: [] },
  };

  // ─── Subnav (7 tabs across top) ──────────────────────────────────────
  var TABS = [
    { id: 'sellers', route: '/sales/sellers', label: 'Active Sellers', icon: 'fa-home' },
    { id: 'buyers', route: '/sales/buyers', label: 'Active Buyers', icon: 'fa-user-tag' },
    { id: 'landlord-sellers', route: '/sales/landlord-sellers', label: 'Landlord Sellers', icon: 'fa-exchange-alt' },
    { id: 'listings', route: '/sales/listings', label: 'Listings', icon: 'fa-building' },
    { id: 'marketing', route: '/sales/marketing', label: 'Marketing', icon: 'fa-bullhorn' },
    { id: 'activity', route: '/sales/activity', label: 'Activity', icon: 'fa-stream' },
    { id: 'automation', route: '/sales/automation', label: 'Automation', icon: 'fa-robot' },
  ];

  function _subnav(id) {
    var h = '<div class="flex gap-1 overflow-x-auto border-b border-gray-200 mb-4 pb-px">';
    TABS.forEach(function (t) {
      h += '<button class="px-3 py-2 text-xs font-semibold whitespace-nowrap rounded-t-lg ' +
        (t.id === id ? 'text-gold border-b-2 border-gold bg-gold/5' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50') +
        '" onclick="Router.navigate(\'' + t.route + '\')">' +
        '<i class="fas ' + t.icon + ' mr-1"></i>' + E(t.label) + '</button>';
    });
    return h + '</div>';
  }

  // ─── KPI ──────────────────────────────────────────────────────────────
  function _kpi(cards) {
    var h = '<div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">';
    cards.forEach(function (c) {
      h += '<div style="display:flex;align-items:center;gap:12px;padding:14px 18px;background:#fff;border:1px solid #E5E7EB;border-radius:12px;flex:1;min-width:150px;">' +
        '<div style="width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:' + (c.bg || '#B8860B15') + ';color:' + (c.fg || '#B8860B') + ';font-size:15px;"><i class="fas ' + c.icon + '"></i></div>' +
        '<div><div style="font-size:20px;font-weight:800;color:#111;">' + c.value + '</div><div style="font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.3px;">' + E(c.label) + '</div></div></div>';
    });
    return h + '</div>';
  }

  // ─── Lifecycle stages ─────────────────────────────────────────────────
  var STAGES = {
    prospect:  { label: 'Prospect',       color: '#6366F1', bg: '#EEF2FF' },
    pitching:  { label: 'Pitching',        color: '#F59E0B', bg: '#FFFBEB' },
    exclusive: { label: 'Exclusive Signed', color: '#3B82F6', bg: '#EFF6FF' },
    listed:    { label: 'Listed',          color: '#059669', bg: '#ECFDF5' },
    showing:   { label: 'Showing',         color: '#8B5CF6', bg: '#F5F3FF' },
    offer:     { label: 'Offer Received',  color: '#D97706', bg: '#FFFBEB' },
    contract:  { label: 'In Contract',     color: '#7C3AED', bg: '#F5F3FF' },
    closed:    { label: 'Closed',          color: '#059669', bg: '#ECFDF5' },
    post_sale: { label: 'Post-Sale',       color: '#6B7280', bg: '#F9FAFB' },
  };

  function _stageBadge(stage) {
    var s = STAGES[stage] || STAGES.prospect;
    return '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:' + s.bg + ';color:' + s.color + ';">' + E(s.label) + '</span>';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 1: ACTIVE SELLERS — the full lifecycle table
  // ═══════════════════════════════════════════════════════════════════════
  function activeSellers() {
    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();
    c.innerHTML = _subnav('sellers') + '<div class="flex items-center justify-center h-40"><i class="fas fa-spinner fa-spin text-2xl text-gold"></i></div>';

    MallanAPI._fetch('/api/crm/sales/sellers').then(function (data) {
      _s.sellers.data = (data.sellers || data.clients || []).map(function (r) {
        if (typeof ClientNormalizer !== 'undefined') r = ClientNormalizer.normalize(r);
        r.name = r.name || ((r.first_name || '') + ' ' + (r.last_name || '')).trim();
        r.stage = r.pipeline_stage || 'prospect';
        return r;
      });
      _renderSellers(c);
    }).catch(function (err) {
      c.innerHTML = _subnav('sellers') + '<div class="text-center py-12"><i class="fas fa-exclamation-triangle text-3xl text-red-400 mb-3"></i><p class="text-sm text-gray-500">Failed to load: ' + E(err.message || '') + '</p></div>';
    });
  }

  function _renderSellers(c) {
    var st = _s.sellers;
    var rows = st.data.slice();
    if (st.search) { var q = st.search.toLowerCase(); rows = rows.filter(function (r) { return (r.name + ' ' + (r.property_address || '') + ' ' + (r.email || '')).toLowerCase().indexOf(q) !== -1; }); }
    if (st.filter.status) rows = rows.filter(function (r) { return r.listing_status === st.filter.status; });
    if (st.filter.stage) rows = rows.filter(function (r) { return r.stage === st.filter.stage; });
    rows = ActivityTable.sortRows(rows, st.sort.key, st.sort.dir);

    var total = st.data.length;
    var prospects = st.data.filter(function (r) { return r.stage === 'prospect' || r.stage === 'pitching'; }).length;
    var active = st.data.filter(function (r) { return r.listing_status && r.listing_status !== 'No Listing'; }).length;
    var totalVal = st.data.reduce(function (s, r) { return s + (Number(r.list_price) || 0); }, 0);

    var h = _subnav('sellers');
    h += _kpi([
      { icon: 'fa-users', label: 'Total Sellers', value: total, fg: '#3B82F6', bg: '#EFF6FF' },
      { icon: 'fa-bullseye', label: 'Prospects', value: prospects, fg: '#6366F1', bg: '#EEF2FF' },
      { icon: 'fa-home', label: 'Active Listings', value: active, fg: '#059669', bg: '#ECFDF5' },
      { icon: 'fa-dollar-sign', label: 'Total Value', value: $(totalVal), fg: '#B8860B', bg: '#FFFBF0' },
    ]);

    h += FilterBar.render({
      id: 'sellers', placeholder: 'Search by name, address, email...', onSearch: 'SalesCRM._searchSellers',
      filters: [
        { key: 'stage', label: 'Stage', options: Object.keys(STAGES).map(function (k) { return { value: k, label: STAGES[k].label }; }) },
        { key: 'status', label: 'Listing Status', options: [
          { value: 'Active', label: 'Active' }, { value: 'Coming Soon', label: 'Coming Soon' },
          { value: 'Under Contract', label: 'Under Contract' }, { value: 'Closed', label: 'Closed' },
        ]},
      ],
      onFilter: 'SalesCRM._filterSellers',
      quickActions: [{ label: 'New Seller', icon: 'fa-plus', onclick: 'SalesCRM._newSeller()' }],
    });

    h += ActivityTable.render({
      id: 'sellers_tbl',
      columns: [
        { key: 'name', label: 'Seller', render: function (r) {
          var init = (r.name || '??').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
          var entity = r.entity_name ? '<div class="text-[10px] text-purple-600 font-bold mt-0.5">' + E(r.entity_type || 'Entity') + ': ' + E(r.entity_name) + '</div>' : '';
          return '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div style="width:32px;height:32px;border-radius:50%;background:#B8860B15;color:#B8860B;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">' + E(init) + '</div>' +
            '<div><div class="font-semibold text-gray-900">' + E(r.name) + '</div>' + entity + '</div></div>';
        }},
        { key: 'property_address', label: 'Property', render: function (r) { return '<span class="text-sm">' + E(r.property_address || '-') + '</span>'; } },
        { key: 'stage', label: 'Stage', render: function (r) { return _stageBadge(r.stage); } },
        { key: 'listing_status', label: 'Listing', render: function (r) {
          var s = r.listing_status || 'No Listing';
          var clr = { Active: '#3B82F6', 'Coming Soon': '#F59E0B', 'Under Contract': '#7C3AED', Closed: '#059669' }[s] || '#9CA3AF';
          return '<span style="font-size:10px;font-weight:700;color:' + clr + ';">' + E(s) + '</span>';
        }},
        { key: 'last_login_at', label: 'Last Login', render: function (r) { return r.last_login_at ? '<span class="text-xs text-gray-600">' + _ago(r.last_login_at) + '</span>' : '<span class="text-xs text-gray-400">Never</span>'; } },
        { key: 'showings_count', label: 'Showings', render: function (r) { var n = Number(r.showings_count || 0); return n > 0 ? '<span class="font-bold">' + n + '</span>' : '<span class="text-gray-400">0</span>'; } },
        { key: 'list_price', label: 'Price', render: function (r) { return r.list_price ? '<span class="font-semibold">' + $(Number(r.list_price)) + '</span>' : '<span class="text-gray-400">-</span>'; } },
        { key: '_next', label: 'Next Action', render: function (r) {
          if (r.stage === 'prospect') return '<span class="text-xs text-indigo-600 font-bold"><i class="fas fa-phone mr-1"></i>Reach Out</span>';
          if (r.stage === 'pitching') return '<span class="text-xs text-amber-600 font-bold"><i class="fas fa-file-alt mr-1"></i>Send Pitch</span>';
          if (!r.listing_status || r.listing_status === 'No Listing') return '<span class="text-xs text-blue-600 font-bold"><i class="fas fa-plus mr-1"></i>Create Listing</span>';
          return '<span class="text-xs text-gray-500"><i class="fas fa-check mr-1"></i>Monitor</span>';
        }},
      ],
      rows: rows, sort: st.sort, onSort: 'SalesCRM._sortSellers', onRowClick: 'SalesCRM._openSeller',
      page: st.page, pageSize: 25, onPage: 'SalesCRM._pageSellers',
      emptyIcon: 'fa-home', emptyText: 'No sellers yet — click New Seller to start prospecting',
    });

    c.innerHTML = h;
  }

  function _searchSellers(q) { _s.sellers.search = q; _s.sellers.page = 1; _renderSellers(CRM.getContent()); }
  function _filterSellers(k, v) { _s.sellers.filter[k] = v; _s.sellers.page = 1; _renderSellers(CRM.getContent()); }
  function _sortSellers(k) { var st = _s.sellers; st.sort = { key: k, dir: st.sort.key === k && st.sort.dir === 'asc' ? 'desc' : 'asc' }; _renderSellers(CRM.getContent()); }
  function _pageSellers(p) { _s.sellers.page = p; _renderSellers(CRM.getContent()); }

  // ═══════════════════════════════════════════════════════════════════════
  // SELLER WORKSPACE — Full Lifecycle
  // ═══════════════════════════════════════════════════════════════════════
  function _openSeller(id) {
    var c = CRM.getContent();
    c.innerHTML = '<div class="flex items-center justify-center h-40"><i class="fas fa-spinner fa-spin text-2xl text-gold"></i></div>';

    Promise.all([
      MallanAPI._fetch('/api/crm/clients/' + id),
      MallanAPI._fetch('/api/crm/activity?client_id=' + id + '&limit=50').catch(function () { return { events: [] }; }),
    ]).then(function (res) {
      var cl = res[0].client || res[0];
      cl.name = cl.name || ((cl.first_name || '') + ' ' + (cl.last_name || '')).trim();
      cl.stage = cl.pipeline_stage || 'prospect';
      _s.ws.client = cl;
      _s.ws.activity = res[1].events || res[1].activity || [];
      _renderSellerWorkspace(c);
    }).catch(function (err) {
      c.innerHTML = '<div class="p-8 text-center text-red-500">Failed to load seller: ' + E(err.message || '') + '</div>';
    });
  }

  function _renderSellerWorkspace(c) {
    var cl = _s.ws.client;
    var tab = _s.ws.tab;
    var stage = cl.stage || 'prospect';
    var isProspect = stage === 'prospect' || stage === 'pitching';
    var isActive = stage === 'exclusive' || stage === 'listed' || stage === 'showing' || stage === 'offer' || stage === 'contract';
    var isClosed = stage === 'closed' || stage === 'post_sale';

    // ── Header ──
    var h = '<div class="mb-4">';
    h += '<button class="text-sm text-gray-500 hover:text-gray-700 mb-3" onclick="Router.navigate(\'/sales/sellers\')"><i class="fas fa-arrow-left mr-1"></i>Back to Active Sellers</button>';
    h += '<div class="flex items-start justify-between flex-wrap gap-4">';
    h += '<div class="flex items-center gap-4">';
    var init = (cl.name || '??').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
    h += '<div style="width:48px;height:48px;border-radius:50%;background:#B8860B20;color:#B8860B;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;">' + E(init) + '</div>';
    h += '<div>';
    h += '<h2 class="text-xl font-bold text-gray-900">' + E(cl.name) + '</h2>';
    h += '<div class="flex items-center gap-2 mt-1">' + _stageBadge(stage);
    if (cl.entity_name) h += '<span class="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-bold">' + E(cl.entity_type || 'Entity') + ': ' + E(cl.entity_name) + '</span>';
    h += '</div>';
    h += '<div class="flex gap-3 mt-1 text-xs text-gray-500">';
    if (cl.email) h += '<span><i class="fas fa-envelope mr-1"></i>' + E(cl.email) + '</span>';
    if (cl.phone) h += '<span><i class="fas fa-phone mr-1"></i>' + E(cl.phone) + '</span>';
    if (cl.property_address) h += '<span><i class="fas fa-map-marker-alt mr-1"></i>' + E(cl.property_address) + '</span>';
    h += '</div></div></div>';

    // Action buttons
    h += '<div class="flex gap-2 flex-wrap">';
    if (isProspect) {
      h += '<button class="btn btn-sm btn-gold" onclick="SalesCRM._wsAction(\'send_cma\')"><i class="fas fa-chart-bar mr-1"></i>Send CMA</button>';
      h += '<button class="btn btn-sm btn-outline" onclick="SalesCRM._wsAction(\'send_market_report\')"><i class="fas fa-chart-area mr-1"></i>Market Report</button>';
      h += '<button class="btn btn-sm btn-outline" onclick="SalesCRM._wsAction(\'advance_stage\')"><i class="fas fa-arrow-right mr-1"></i>Advance Stage</button>';
    }
    if (isActive) {
      h += '<button class="btn btn-sm btn-gold" onclick="SalesCRM._wsAction(\'schedule_open_house\')"><i class="fas fa-calendar mr-1"></i>Open House</button>';
      h += '<button class="btn btn-sm btn-outline" onclick="SalesCRM._wsAction(\'send_weekly_report\')"><i class="fas fa-file-alt mr-1"></i>Weekly Report</button>';
    }
    if (isClosed) {
      h += '<button class="btn btn-sm btn-gold" onclick="SalesCRM._wsAction(\'convert_buyer\')"><i class="fas fa-shopping-cart mr-1"></i>Convert to Buyer</button>';
      h += '<button class="btn btn-sm btn-outline" onclick="SalesCRM._wsAction(\'convert_renter\')"><i class="fas fa-key mr-1"></i>Convert to Renter</button>';
      h += '<button class="btn btn-sm btn-outline" onclick="SalesCRM._wsAction(\'convert_referral\')"><i class="fas fa-globe mr-1"></i>Referral</button>';
    }
    h += '<button class="btn btn-sm btn-outline" onclick="SalesCRM._editClient(\'' + E(cl.id) + '\')"><i class="fas fa-edit"></i></button>';
    h += '<button class="btn btn-sm btn-outline text-red-500" onclick="SalesCRM._deleteClient(\'' + E(cl.id) + '\')"><i class="fas fa-trash-alt"></i></button>';
    h += '</div></div></div>';

    // ── Workspace Tabs ──
    var wsTabs = [];
    // Always show
    wsTabs.push({ id: 'research', label: 'Research', icon: 'fa-search' });
    wsTabs.push({ id: 'pitch', label: 'Pitch Packet', icon: 'fa-file-powerpoint' });
    wsTabs.push({ id: 'outreach', label: 'Outreach', icon: 'fa-paper-plane' });
    wsTabs.push({ id: 'intake', label: 'Seller Intake', icon: 'fa-clipboard-list' });
    if (isActive || isClosed) {
      wsTabs.push({ id: 'listing', label: 'Listing', icon: 'fa-building' });
      wsTabs.push({ id: 'showings', label: 'Showings', icon: 'fa-calendar' });
      wsTabs.push({ id: 'offers', label: 'Offers', icon: 'fa-gavel' });
      wsTabs.push({ id: 'prep', label: 'Preparation', icon: 'fa-tasks' });
    }
    wsTabs.push({ id: 'documents', label: 'Documents', icon: 'fa-folder' });
    wsTabs.push({ id: 'tools', label: 'Tools', icon: 'fa-calculator' });
    wsTabs.push({ id: 'activity', label: 'Activity', icon: 'fa-stream' });

    h += '<div class="flex gap-1 overflow-x-auto border-b border-gray-200 mb-4">';
    wsTabs.forEach(function (t) {
      h += '<button class="px-3 py-2 text-xs font-semibold whitespace-nowrap ' +
        (t.id === tab ? 'text-gold border-b-2 border-gold' : 'text-gray-400 hover:text-gray-700') +
        '" onclick="SalesCRM._wsTab(\'' + t.id + '\')">' +
        '<i class="fas ' + t.icon + ' mr-1"></i>' + E(t.label) + '</button>';
    });
    h += '</div>';

    h += '<div id="ws-body"></div>';
    c.innerHTML = h;

    // Render tab content
    var body = document.getElementById('ws-body');
    if (!body) return;
    _renderWsTab(body, tab, cl);
  }

  function _wsTab(id) { _s.ws.tab = id; _renderSellerWorkspace(CRM.getContent()); }

  // ═══════════════════════════════════════════════════════════════════════
  // WORKSPACE TAB RENDERERS
  // ═══════════════════════════════════════════════════════════════════════
  function _renderWsTab(el, tab, cl) {
    if (tab === 'research') _wsResearch(el, cl);
    else if (tab === 'pitch') _wsPitch(el, cl);
    else if (tab === 'outreach') _wsOutreach(el, cl);
    else if (tab === 'intake') _wsIntake(el, cl);
    else if (tab === 'listing') _wsListing(el, cl);
    else if (tab === 'showings') _wsShowings(el, cl);
    else if (tab === 'offers') _wsOffers(el, cl);
    else if (tab === 'prep') _wsPrep(el, cl);
    else if (tab === 'documents') _wsDocs(el, cl);
    else if (tab === 'tools') _wsTools(el, cl);
    else if (tab === 'activity') _wsActivity(el, cl);
    else el.innerHTML = '<p class="text-gray-400 p-4">Tab: ' + E(tab) + '</p>';
  }

  // ── RESEARCH TAB ──────────────────────────────────────────────────────
  function _wsResearch(el, cl) {
    var h = '<div class="space-y-6">';

    // Ownership verification
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-4"><i class="fas fa-user-shield text-gold mr-2"></i>Ownership Verification</h3>';
    h += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
    h += _field('Owner Name', cl.name, 'first_name');
    h += _field('Entity Type', (cl.entity_type || 'Individual').toUpperCase(), 'entity_type');
    h += _field('Entity Name', cl.entity_name || '-', 'entity_name');
    h += _field('Legal Ownership', cl.legal_ownership_name || '-', 'legal_ownership_name');
    h += '</div>';

    // Authorized signatories
    var sigs = cl.authorized_signatories || [];
    h += '<div class="mt-4"><h4 class="text-xs font-bold text-gray-700 mb-2">Authorized Signatories (who can sign the exclusive)</h4>';
    if (sigs.length === 0) {
      h += '<p class="text-xs text-gray-400">No signatories added yet</p>';
    } else {
      h += '<div class="space-y-2">';
      sigs.forEach(function (sig) {
        h += '<div class="flex items-center gap-3 p-2 bg-gray-50 rounded-lg text-xs">' +
          '<span class="font-bold text-gray-900">' + E(sig.name || '') + '</span>' +
          '<span class="text-gray-500">' + E(sig.title || '') + '</span>' +
          (sig.email ? '<span class="text-gray-400">' + E(sig.email) + '</span>' : '') +
          (sig.phone ? '<span class="text-gray-400">' + E(sig.phone) + '</span>' : '') +
        '</div>';
      });
      h += '</div>';
    }
    h += '<button class="btn btn-sm btn-outline mt-2" onclick="SalesCRM._addSignatory()"><i class="fas fa-plus mr-1"></i>Add Signatory</button>';
    h += '</div>';

    // ACRIS / Tax verification
    h += '<div class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">';
    h += '<h4 class="text-xs font-bold text-blue-700 mb-2"><i class="fas fa-external-link-alt mr-1"></i>Verification Links</h4>';
    h += '<div class="flex flex-wrap gap-2">';
    h += '<a href="https://a836-acris.nyc.gov/DS/DocumentSearch/Index" target="_blank" class="text-xs text-blue-600 underline hover:text-blue-800"><i class="fas fa-landmark mr-1"></i>ACRIS (Deed/Ownership)</a>';
    h += '<a href="https://a836-pts-access.nyc.gov/care/search/commonsearch.aspx?mode=persprop" target="_blank" class="text-xs text-blue-600 underline hover:text-blue-800"><i class="fas fa-file-invoice-dollar mr-1"></i>Property Tax (DOF)</a>';
    h += '<a href="https://hpdonline.nyc.gov/hpdonline/#!/home" target="_blank" class="text-xs text-blue-600 underline hover:text-blue-800"><i class="fas fa-building mr-1"></i>HPD Violations</a>';
    h += '<a href="https://www.dos.ny.gov/licensing/verify.html" target="_blank" class="text-xs text-blue-600 underline hover:text-blue-800"><i class="fas fa-id-card mr-1"></i>DOS License Check</a>';
    h += '</div></div>';
    h += '</div>';

    // Property details
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-4"><i class="fas fa-home text-gold mr-2"></i>Property Details</h3>';
    h += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
    h += _field('Address', cl.property_address || '-', 'property_address');
    h += _field('Unit', cl.unit_number || '-', 'unit_number');
    h += _field('Building Type', cl.building_type || '-', 'building_type');
    h += _field('Ownership Type', cl.ownership_type || '-', 'ownership_type');
    h += '</div></div>';

    // Management company
    var bm = cl.building_mgmt_requirements || {};
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-4"><i class="fas fa-building text-gold mr-2"></i>Building / Management</h3>';
    h += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
    h += _field('Management Company', bm.management_company || '-');
    h += _field('Board Approval Process', bm.board_approval || '-');
    h += _field('Flip Tax', bm.flip_tax || '-');
    h += _field('Move-Out Rules', bm.move_out_rules || '-');
    h += _field('Sublet Policy', bm.sublet_policy || '-');
    h += _field('Required Docs for Sale', bm.required_docs || '-');
    h += '</div>';
    h += '<button class="btn btn-sm btn-outline mt-3" onclick="SalesCRM._editBuildingMgmt()"><i class="fas fa-edit mr-1"></i>Edit Building Info</button>';
    h += '</div>';

    // Attorney
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-4"><i class="fas fa-gavel text-gold mr-2"></i>Attorney</h3>';
    h += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
    h += _field('Name', cl.attorney_name || '-', 'attorney_name');
    h += _field('Firm', cl.attorney_firm || '-', 'attorney_firm');
    h += _field('Email', cl.attorney_email || '-', 'attorney_email');
    h += _field('Phone', cl.attorney_phone || '-', 'attorney_phone');
    h += '</div></div>';

    h += '</div>';
    el.innerHTML = h;
  }

  // ── PITCH PACKET TAB ──────────────────────────────────────────────────
  function _wsPitch(el, cl) {
    var h = '<div class="space-y-6">';

    h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-2"><i class="fas fa-file-powerpoint text-gold mr-2"></i>Pitch Packet for ' + E(cl.name) + '</h3>';
    h += '<p class="text-xs text-gray-500 mb-4">Build the materials you need to win this seller. Each section generates a real document you can send.</p>';

    // CMA
    h += '<div class="border border-gray-100 rounded-lg p-4 mb-3 hover:border-gold/30 transition-colors">';
    h += '<div class="flex items-center justify-between">';
    h += '<div><h4 class="text-sm font-bold text-gray-900"><i class="fas fa-chart-bar text-blue-500 mr-2"></i>Comparative Market Analysis (CMA)</h4>';
    h += '<p class="text-xs text-gray-500 mt-1">Show them what their home is worth based on recent comps in their area</p></div>';
    h += '<button class="btn btn-sm btn-gold" onclick="SalesCRM._generateCMA()"><i class="fas fa-play mr-1"></i>Generate CMA</button>';
    h += '</div></div>';

    // Net Proceeds
    h += '<div class="border border-gray-100 rounded-lg p-4 mb-3 hover:border-gold/30 transition-colors">';
    h += '<div class="flex items-center justify-between">';
    h += '<div><h4 class="text-sm font-bold text-gray-900"><i class="fas fa-calculator text-green-500 mr-2"></i>Net Proceeds Calculator</h4>';
    h += '<p class="text-xs text-gray-500 mt-1">Show them what they walk away with after closing costs, taxes, commission</p></div>';
    h += '<button class="btn btn-sm btn-outline" onclick="SalesCRM._wsTab(\'tools\')"><i class="fas fa-arrow-right mr-1"></i>Open Calculator</button>';
    h += '</div></div>';

    // Market Report
    h += '<div class="border border-gray-100 rounded-lg p-4 mb-3 hover:border-gold/30 transition-colors">';
    h += '<div class="flex items-center justify-between">';
    h += '<div><h4 class="text-sm font-bold text-gray-900"><i class="fas fa-chart-area text-purple-500 mr-2"></i>Market Report</h4>';
    h += '<p class="text-xs text-gray-500 mt-1">Area trends, recent sales, active inventory in their building/neighborhood</p></div>';
    h += '<button class="btn btn-sm btn-outline" onclick="SalesCRM._generateMarketReport()"><i class="fas fa-play mr-1"></i>Generate Report</button>';
    h += '</div></div>';

    // Neighbor Sales
    h += '<div class="border border-gray-100 rounded-lg p-4 mb-3 hover:border-gold/30 transition-colors">';
    h += '<div class="flex items-center justify-between">';
    h += '<div><h4 class="text-sm font-bold text-gray-900"><i class="fas fa-home text-amber-500 mr-2"></i>Neighbor Sales</h4>';
    h += '<p class="text-xs text-gray-500 mt-1">"Your neighbor at Unit 5B just sold for $1.2M" — powerful social proof</p></div>';
    h += '<button class="btn btn-sm btn-outline" onclick="SalesCRM._findNeighborSales()"><i class="fas fa-search mr-1"></i>Find Sales</button>';
    h += '</div></div>';

    // Pricing Strategy
    h += '<div class="border border-gray-100 rounded-lg p-4 mb-3 hover:border-gold/30 transition-colors">';
    h += '<div class="flex items-center justify-between">';
    h += '<div><h4 class="text-sm font-bold text-gray-900"><i class="fas fa-tags text-red-500 mr-2"></i>Pricing Strategy</h4>';
    h += '<p class="text-xs text-gray-500 mt-1">Target price, pricing approach, market positioning</p></div>';
    h += '<button class="btn btn-sm btn-outline" onclick="SalesCRM._editPricingStrategy()"><i class="fas fa-edit mr-1"></i>Edit</button>';
    h += '</div>';
    var ms = cl.marketing_strategy || {};
    if (ms.target_price || ms.pricing_notes) {
      h += '<div class="mt-2 text-xs text-gray-600">';
      if (ms.target_price) h += '<div><strong>Target:</strong> ' + $(Number(ms.target_price)) + '</div>';
      if (ms.pricing_notes) h += '<div class="mt-1">' + E(ms.pricing_notes) + '</div>';
      h += '</div>';
    }
    h += '</div>';

    // Marketing Strategy
    h += '<div class="border border-gray-100 rounded-lg p-4 mb-3 hover:border-gold/30 transition-colors">';
    h += '<div class="flex items-center justify-between">';
    h += '<div><h4 class="text-sm font-bold text-gray-900"><i class="fas fa-bullhorn text-indigo-500 mr-2"></i>Marketing Strategy</h4>';
    h += '<p class="text-xs text-gray-500 mt-1">Photo shoot, staging, syndication plan, description</p></div>';
    h += '<button class="btn btn-sm btn-outline" onclick="SalesCRM._editMarketingStrategy()"><i class="fas fa-edit mr-1"></i>Edit</button>';
    h += '</div></div>';

    // Property Readiness
    h += '<div class="border border-gray-100 rounded-lg p-4 mb-3 hover:border-gold/30 transition-colors">';
    h += '<div class="flex items-center justify-between">';
    h += '<div><h4 class="text-sm font-bold text-gray-900"><i class="fas fa-clipboard-check text-teal-500 mr-2"></i>Property Readiness</h4>';
    h += '<p class="text-xs text-gray-500 mt-1">Repairs, staging, cleaning, decluttering — what needs to happen before listing</p></div>';
    h += '<button class="btn btn-sm btn-outline" onclick="SalesCRM._wsTab(\'intake\')"><i class="fas fa-arrow-right mr-1"></i>Home Prep Checklist</button>';
    h += '</div></div>';

    // Value Proposition
    h += '<div class="border border-gray-100 rounded-lg p-4 bg-gold/5">';
    h += '<h4 class="text-sm font-bold text-gray-900"><i class="fas fa-star text-gold mr-2"></i>Your Value Proposition</h4>';
    h += '<p class="text-xs text-gray-500 mt-1">What you bring to this seller that no one else does</p>';
    h += '<textarea id="ws_value_prop" class="w-full mt-2 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" rows="3" placeholder="Local expertise, marketing reach, negotiation skills, client base...">' + E(cl.notes || '') + '</textarea>';
    h += '<button class="btn btn-sm btn-gold mt-2" onclick="SalesCRM._saveValueProp()"><i class="fas fa-save mr-1"></i>Save</button>';
    h += '</div>';

    h += '</div></div>';
    el.innerHTML = h;
  }

  // ── OUTREACH TAB ──────────────────────────────────────────────────────
  function _wsOutreach(el, cl) {
    var h = '<div class="space-y-4">';
    h += '<div class="flex items-center justify-between">';
    h += '<h3 class="text-sm font-bold text-gray-900"><i class="fas fa-paper-plane text-gold mr-2"></i>Outreach History</h3>';
    h += '<button class="btn btn-sm btn-gold" onclick="SalesCRM._logOutreach()"><i class="fas fa-plus mr-1"></i>Log Outreach</button>';
    h += '</div>';

    // Show activity filtered to outreach events
    var events = (_s.ws.activity || []).filter(function (e) {
      var t = (e.type || e.action || '').toLowerCase();
      return t.indexOf('email') !== -1 || t.indexOf('call') !== -1 || t.indexOf('sms') !== -1 || t.indexOf('outreach') !== -1 || t.indexOf('send') !== -1;
    });

    if (events.length === 0) {
      h += '<div class="text-center py-8 bg-gray-50 rounded-xl"><i class="fas fa-inbox text-3xl text-gray-300 mb-3"></i><p class="text-sm text-gray-500">No outreach logged yet</p><p class="text-xs text-gray-400 mt-1">Click "Log Outreach" to record a call, email, or meeting</p></div>';
    } else {
      events.forEach(function (ev) {
        var icon = 'fa-envelope';
        var t = (ev.type || ev.action || '').toLowerCase();
        if (t.indexOf('call') !== -1) icon = 'fa-phone';
        if (t.indexOf('sms') !== -1) icon = 'fa-comment';
        if (t.indexOf('meeting') !== -1) icon = 'fa-handshake';

        h += '<div class="flex gap-3 p-3 bg-white border border-gray-100 rounded-lg">';
        h += '<div style="width:32px;height:32px;border-radius:50%;background:#B8860B15;color:#B8860B;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;"><i class="fas ' + icon + '"></i></div>';
        h += '<div class="flex-1">';
        h += '<div class="text-sm font-semibold text-gray-900">' + E(ev.title || ev.type || 'Outreach') + '</div>';
        if (ev.description || ev.notes) h += '<p class="text-xs text-gray-600 mt-0.5">' + E(ev.description || ev.notes) + '</p>';
        h += '<span class="text-[10px] text-gray-400">' + (ev.created_at ? _ago(ev.created_at) : '') + '</span>';
        h += '</div></div>';
      });
    }

    // Next follow-up
    h += '<div class="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">';
    h += '<h4 class="text-xs font-bold text-amber-700 mb-2"><i class="fas fa-clock mr-1"></i>Next Follow-Up</h4>';
    h += '<div class="flex items-center gap-3">';
    h += '<input type="date" id="ws_next_followup" class="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" value="' + E(cl.next_follow_up ? cl.next_follow_up.split('T')[0] : '') + '">';
    h += '<button class="btn btn-sm btn-gold" onclick="SalesCRM._saveFollowUp()"><i class="fas fa-save mr-1"></i>Set</button>';
    h += '</div></div>';

    h += '</div>';
    el.innerHTML = h;
  }

  // ── INTAKE TAB ────────────────────────────────────────────────────────
  function _wsIntake(el, cl) {
    if (typeof SellerIntake !== 'undefined' && typeof SellerIntake.render === 'function') {
      el.innerHTML = SellerIntake.render(cl);
    } else {
      el.innerHTML = '<p class="text-gray-500 p-4">Seller Intake form loading...</p>';
    }
  }

  // ── LISTING TAB ───────────────────────────────────────────────────────
  function _wsListing(el, cl) {
    el.innerHTML = '<div class="flex items-center justify-center h-20"><i class="fas fa-spinner fa-spin text-gold"></i></div>';
    var listingId = cl.active_sale_listing_id;
    if (!listingId) {
      el.innerHTML = '<div class="text-center py-8 bg-gray-50 rounded-xl"><i class="fas fa-building text-3xl text-gray-300 mb-3"></i><p class="text-sm text-gray-500">No active listing yet</p><button class="btn btn-sm btn-gold mt-3" onclick="SalesCRM._createListing()"><i class="fas fa-plus mr-1"></i>Create Listing</button></div>';
      return;
    }
    MallanAPI._fetch('/api/crm/listings/' + listingId).then(function (data) {
      var l = data.listing || data;
      var lh = '<div class="bg-white border border-gray-200 rounded-xl p-5 space-y-4">';
      lh += '<div class="flex items-center justify-between"><h3 class="text-sm font-bold text-gray-900">' + E(l.address || listingId) + '</h3>';
      lh += '<button class="btn btn-sm btn-outline" onclick="Router.navigate(\'/workspace/listing/' + E(listingId) + '/overview\')"><i class="fas fa-external-link-alt mr-1"></i>Full Listing</button></div>';
      lh += '<div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">';
      lh += '<div class="p-2 bg-gray-50 rounded-lg"><div class="text-lg font-bold">' + $(Number(l.list_price || 0)) + '</div><div class="text-[10px] text-gray-500">Price</div></div>';
      lh += '<div class="p-2 bg-gray-50 rounded-lg"><div class="text-lg font-bold">' + (l.days_on_market || 0) + '</div><div class="text-[10px] text-gray-500">DOM</div></div>';
      lh += '<div class="p-2 bg-gray-50 rounded-lg"><div class="text-lg font-bold">' + E(l.status || '-') + '</div><div class="text-[10px] text-gray-500">Status</div></div>';
      lh += '<div class="p-2 bg-gray-50 rounded-lg"><div class="text-lg font-bold">' + (l.bedrooms_total || '-') + 'bd/' + (l.bathrooms_full || '-') + 'ba</div><div class="text-[10px] text-gray-500">Beds/Baths</div></div>';
      lh += '</div></div>';
      el.innerHTML = lh;
    }).catch(function () {
      el.innerHTML = '<p class="text-red-500 p-4">Could not load listing</p>';
    });
  }

  // ── SHOWINGS TAB ──────────────────────────────────────────────────────
  function _wsShowings(el, cl) {
    el.innerHTML = '<div class="flex items-center justify-center h-20"><i class="fas fa-spinner fa-spin text-gold"></i></div>';
    MallanAPI._fetch('/api/crm/showings?client_id=' + cl.id).catch(function () { return { showings: [] }; }).then(function (data) {
      var showings = data.showings || [];
      var sh = '<div class="space-y-4">';
      sh += '<div class="flex items-center justify-between"><h3 class="text-sm font-bold text-gray-900"><i class="fas fa-calendar text-gold mr-2"></i>Showings (' + showings.length + ')</h3>';
      sh += '<button class="btn btn-sm btn-gold" onclick="SalesCRM._scheduleShowing()"><i class="fas fa-plus mr-1"></i>Schedule</button></div>';
      if (showings.length === 0) {
        sh += '<div class="text-center py-8 bg-gray-50 rounded-xl"><p class="text-sm text-gray-500">No showings yet</p></div>';
      } else {
        showings.forEach(function (s) {
          sh += '<div class="p-3 bg-white border border-gray-100 rounded-lg">';
          sh += '<div class="flex justify-between"><span class="text-sm font-bold">' + D(s.date || s.showing_date || s.created_at) + '</span><span class="text-xs text-gray-500">' + E(s.status || 'completed') + '</span></div>';
          if (s.feedback) sh += '<p class="text-xs text-gray-600 mt-1">' + E(s.feedback) + '</p>';
          sh += '</div>';
        });
      }
      sh += '</div>';
      el.innerHTML = sh;
    });
  }

  // ── OFFERS TAB ────────────────────────────────────────────────────────
  function _wsOffers(el, cl) {
    el.innerHTML = '<div class="flex items-center justify-center h-20"><i class="fas fa-spinner fa-spin text-gold"></i></div>';
    MallanAPI._fetch('/api/crm/clients/' + cl.id + '/offers').catch(function () { return { offers: [] }; }).then(function (data) {
      var offers = data.offers || [];
      var oh = '<div class="space-y-4">';
      oh += '<h3 class="text-sm font-bold text-gray-900"><i class="fas fa-gavel text-gold mr-2"></i>Offers (' + offers.length + ')</h3>';
      if (offers.length === 0) {
        oh += '<div class="text-center py-8 bg-gray-50 rounded-xl"><p class="text-sm text-gray-500">No offers received yet</p></div>';
      } else {
        offers.forEach(function (o) {
          oh += '<div class="p-4 bg-white border border-gray-200 rounded-lg">';
          oh += '<div class="flex justify-between"><span class="text-lg font-bold text-gray-900">' + $(Number(o.amount || 0)) + '</span>';
          var sc = { accepted: '#059669', rejected: '#DC2626', pending: '#F59E0B', countered: '#3B82F6' }[o.status] || '#6B7280';
          oh += '<span style="color:' + sc + ';font-size:11px;font-weight:700;">' + E((o.status || 'pending').toUpperCase()) + '</span></div>';
          oh += '<div class="text-xs text-gray-500 mt-1">Received: ' + D(o.created_at || o.date) + '</div>';
          if (o.financing) oh += '<div class="text-xs text-gray-600 mt-1">Financing: ' + E(o.financing) + '</div>';
          oh += '</div>';
        });
      }
      oh += '</div>';
      el.innerHTML = oh;
    });
  }

  // ── PREPARATION TAB ───────────────────────────────────────────────────
  function _wsPrep(el, cl) {
    var h = '<div class="space-y-6">';
    h += '<h3 class="text-sm font-bold text-gray-900"><i class="fas fa-tasks text-gold mr-2"></i>Seller Preparation Checklist</h3>';

    var items = [
      { key: 'lawyer', label: 'Attorney Retained', icon: 'fa-gavel' },
      { key: 'offering_plan', label: 'Offering Plan Obtained', icon: 'fa-file-contract' },
      { key: 'property_disclosure', label: 'Property Condition Disclosure', icon: 'fa-clipboard-check' },
      { key: 'lead_paint', label: 'Lead Paint Disclosure', icon: 'fa-paint-roller' },
      { key: 'title_search', label: 'Title Search (via attorney)', icon: 'fa-search' },
      { key: 'mortgage_settlement', label: 'Mortgage Settlement / Payoff', icon: 'fa-dollar-sign' },
      { key: 'tax_clearance', label: 'Tax Clearance', icon: 'fa-receipt' },
      { key: 'board_approval', label: 'Board Approval (if co-op)', icon: 'fa-building' },
      { key: 'certificate_occupancy', label: 'Certificate of Occupancy', icon: 'fa-certificate' },
    ];

    var disc = cl.disclosures || {};
    items.forEach(function (item) {
      var done = disc[item.key] === 'completed' || disc[item.key] === true;
      h += '<div class="flex items-center justify-between p-3 bg-white border rounded-lg ' + (done ? 'border-green-200 bg-green-50' : 'border-gray-200') + '">';
      h += '<div class="flex items-center gap-3">';
      h += '<i class="fas ' + item.icon + ' ' + (done ? 'text-green-500' : 'text-gray-400') + '"></i>';
      h += '<span class="text-sm ' + (done ? 'text-green-700 font-bold' : 'text-gray-700') + '">' + E(item.label) + '</span>';
      h += '</div>';
      h += '<button class="text-xs font-bold px-3 py-1 rounded-lg border cursor-pointer ' +
        (done ? 'border-green-300 text-green-600 bg-green-50' : 'border-gray-300 text-gray-500 bg-white') +
        '" onclick="SalesCRM._togglePrep(\'' + item.key + '\',' + !done + ')">' +
        (done ? '<i class="fas fa-check mr-1"></i>Done' : 'Mark Done') + '</button>';
      h += '</div>';
    });

    h += '</div>';
    el.innerHTML = h;
  }

  // ── DOCUMENTS TAB ─────────────────────────────────────────────────────
  function _wsDocs(el, cl) {
    var docs = cl.documents_collected || {};
    var items = [
      { key: 'deed', label: 'Deed' },
      { key: 'mortgage_payoff', label: 'Mortgage Payoff Letter' },
      { key: 'board_docs', label: 'Board / HOA Documents' },
      { key: 'tax_returns', label: 'Tax Returns (2 years)' },
      { key: 'coop_condo_financials', label: 'Co-op/Condo Financials' },
      { key: 'floor_plan', label: 'Floor Plan' },
      { key: 'offering_plan', label: 'Offering Plan' },
      { key: 'listing_agreement', label: 'Exclusive Listing Agreement' },
    ];

    var collected = items.filter(function (i) { return docs[i.key]; }).length;
    var total = items.length;
    var pct = total > 0 ? Math.round((collected / total) * 100) : 0;

    var h = '<div class="space-y-4">';
    h += '<div class="flex items-center justify-between">';
    h += '<h3 class="text-sm font-bold text-gray-900"><i class="fas fa-folder text-gold mr-2"></i>Document Tracker</h3>';
    h += '<span class="text-xs font-bold ' + (pct === 100 ? 'text-green-600' : 'text-amber-600') + '">' + collected + '/' + total + ' collected (' + pct + '%)</span>';
    h += '</div>';

    // Progress bar
    h += '<div style="height:8px;background:#F3F4F6;border-radius:4px;overflow:hidden;"><div style="height:100%;width:' + pct + '%;background:' + (pct === 100 ? '#059669' : '#B8860B') + ';border-radius:4px;transition:width .3s;"></div></div>';

    items.forEach(function (item) {
      var have = !!docs[item.key];
      h += '<div class="flex items-center justify-between p-3 border rounded-lg ' + (have ? 'border-green-200 bg-green-50' : 'border-red-100 bg-red-50') + '">';
      h += '<div class="flex items-center gap-3">';
      h += '<i class="fas ' + (have ? 'fa-check-circle text-green-500' : 'fa-times-circle text-red-400') + '"></i>';
      h += '<span class="text-sm font-medium ' + (have ? 'text-green-700' : 'text-red-600') + '">' + E(item.label) + '</span>';
      h += '</div>';
      h += '<button class="text-xs font-bold px-3 py-1 rounded-lg border cursor-pointer ' +
        (have ? 'border-green-300 text-green-600' : 'border-red-200 text-red-500') +
        '" onclick="SalesCRM._toggleDoc(\'' + item.key + '\',' + !have + ')">' +
        (have ? 'Collected' : 'Mark Collected') + '</button>';
      h += '</div>';
    });

    h += '</div>';
    el.innerHTML = h;
  }

  // ── TOOLS TAB ─────────────────────────────────────────────────────────
  function _wsTools(el, cl) {
    var h = '<div class="space-y-6">';
    h += '<h3 class="text-sm font-bold text-gray-900"><i class="fas fa-calculator text-gold mr-2"></i>Seller Tools</h3>';

    // Net Proceeds Calculator — REAL
    if (typeof NetProceedsCalc !== 'undefined' && typeof NetProceedsCalc.render === 'function') {
      h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
      h += '<h4 class="text-sm font-bold text-gray-900 mb-3">Net Proceeds Calculator</h4>';
      h += NetProceedsCalc.render({ salePrice: Number(cl.list_price || 0) });
      h += '</div>';
    }

    h += '</div>';
    el.innerHTML = h;
  }

  // ── ACTIVITY TAB ──────────────────────────────────────────────────────
  function _wsActivity(el, cl) {
    var events = _s.ws.activity || [];
    var h = '<div class="space-y-3">';
    h += '<h3 class="text-sm font-bold text-gray-900"><i class="fas fa-stream text-gold mr-2"></i>Activity Timeline (' + events.length + ')</h3>';
    if (events.length === 0) {
      h += '<div class="text-center py-8 bg-gray-50 rounded-xl"><p class="text-sm text-gray-500">No activity yet</p></div>';
    } else {
      events.forEach(function (ev) {
        h += '<div class="flex gap-3 p-3 border border-gray-100 rounded-lg">';
        h += '<div style="width:8px;height:8px;border-radius:50%;background:#B8860B;margin-top:6px;flex-shrink:0;"></div>';
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
  // WORKSPACE ACTIONS — real API calls
  // ═══════════════════════════════════════════════════════════════════════
  function _field(label, value, fieldKey) {
    var editable = fieldKey ? ' onclick="SalesCRM._editField(\'' + fieldKey + '\',\'' + E(value === '-' ? '' : value) + '\')" style="cursor:pointer;" title="Click to edit"' : '';
    return '<div class="p-2 bg-gray-50 rounded-lg"' + editable + '>' +
      '<div class="text-[10px] font-bold text-gray-500 uppercase">' + E(label) + '</div>' +
      '<div class="text-sm font-medium text-gray-900 mt-0.5">' + E(value) + (fieldKey ? ' <i class="fas fa-pen text-[8px] text-gray-300"></i>' : '') + '</div>' +
    '</div>';
  }

  function _editField(key, currentVal) {
    var cl = _s.ws.client;
    if (!cl) return;
    var newVal = prompt(key.replace(/_/g, ' ') + ':', currentVal);
    if (newVal === null) return;
    var data = {};
    data[key] = newVal;
    MallanAPI._fetch('/api/crm/clients/' + cl.id, { method: 'PATCH', body: JSON.stringify(data) })
      .then(function () { CRM.toast('Updated', 'success'); cl[key] = newVal; _renderSellerWorkspace(CRM.getContent()); })
      .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  function _toggleDoc(key, val) {
    var cl = _s.ws.client;
    if (!cl) return;
    var docs = cl.documents_collected || {};
    docs[key] = val;
    MallanAPI._fetch('/api/crm/clients/' + cl.id, { method: 'PATCH', body: JSON.stringify({ documents_collected: docs }) })
      .then(function () { cl.documents_collected = docs; CRM.toast(val ? 'Marked collected' : 'Marked missing', 'success'); _renderSellerWorkspace(CRM.getContent()); })
      .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  function _togglePrep(key, val) {
    var cl = _s.ws.client;
    if (!cl) return;
    var disc = cl.disclosures || {};
    disc[key] = val ? 'completed' : 'pending';
    MallanAPI._fetch('/api/crm/clients/' + cl.id, { method: 'PATCH', body: JSON.stringify({ disclosures: disc }) })
      .then(function () { cl.disclosures = disc; CRM.toast(val ? 'Marked done' : 'Marked pending', 'success'); _renderSellerWorkspace(CRM.getContent()); })
      .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  function _wsAction(action) {
    var cl = _s.ws.client;
    if (!cl) return;
    if (action === 'advance_stage') {
      var order = ['prospect', 'pitching', 'exclusive', 'listed', 'showing', 'offer', 'contract', 'closed', 'post_sale'];
      var idx = order.indexOf(cl.stage || 'prospect');
      var next = order[Math.min(idx + 1, order.length - 1)];
      MallanAPI._fetch('/api/crm/clients/' + cl.id, { method: 'PATCH', body: JSON.stringify({ pipeline_stage: next }) })
        .then(function () { cl.stage = next; cl.pipeline_stage = next; CRM.toast('Advanced to ' + STAGES[next].label, 'success'); _renderSellerWorkspace(CRM.getContent()); })
        .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
    } else if (action === 'send_cma') {
      _generateCMA();
    } else if (action === 'send_market_report') {
      _generateMarketReport();
    } else if (action === 'convert_buyer') {
      if (!confirm('Convert this seller to an Active Buyer?')) return;
      MallanAPI._fetch('/api/crm/clients/' + cl.id, { method: 'PATCH', body: JSON.stringify({ roles: (cl.roles || []).concat(['buyer']), pipeline_stage: 'active_buyer', promoted_to_buyer_at: new Date().toISOString() }) })
        .then(function () { CRM.toast('Converted to buyer!', 'success'); Router.navigate('/sales/buyers'); })
        .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
    } else if (action === 'convert_renter') {
      if (!confirm('Convert this seller to a Renter?')) return;
      MallanAPI._fetch('/api/crm/clients/' + cl.id, { method: 'PATCH', body: JSON.stringify({ roles: (cl.roles || []).concat(['renter']), pipeline_stage: 'active_renter' }) })
        .then(function () { CRM.toast('Converted to renter!', 'success'); Router.navigate('/rentals/landlords'); })
        .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
    } else if (action === 'convert_referral') {
      var loc = prompt('Where are they moving? (city, state, or country)');
      if (!loc) return;
      MallanAPI._fetch('/api/crm/clients/' + cl.id, { method: 'PATCH', body: JSON.stringify({ pipeline_stage: 'referral', notes: (cl.notes || '') + '\nReferral: moving to ' + loc + ' (' + new Date().toLocaleDateString() + ')' }) })
        .then(function () { CRM.toast('Marked as referral', 'success'); _openSeller(cl.id); })
        .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
    } else if (action === 'schedule_open_house') {
      _scheduleShowing();
    } else if (action === 'send_weekly_report') {
      CRM.toast('Sending weekly report...', 'info');
      MallanAPI._fetch('/api/crm/emails/send', { method: 'POST', body: JSON.stringify({ template: 'weekly_report', client_id: cl.id }) })
        .then(function () { CRM.toast('Weekly report sent!', 'success'); })
        .catch(function () { CRM.toast('Send failed', 'error'); });
    }
  }

  function _generateCMA() {
    var cl = _s.ws.client;
    if (!cl) return;
    CRM.toast('Generating CMA for ' + (cl.property_address || cl.name) + '...', 'info');
    MallanAPI._fetch('/api/crm/cma', { method: 'POST', body: JSON.stringify({ client_id: cl.id, address: cl.property_address }) })
      .then(function (data) { CRM.toast('CMA generated!', 'success'); })
      .catch(function () { CRM.toast('CMA generation failed — check property address', 'error'); });
  }

  function _generateMarketReport() {
    CRM.toast('Generating market report...', 'info');
    var cl = _s.ws.client;
    MallanAPI._fetch('/api/crm/market-reports', { method: 'POST', body: JSON.stringify({ client_id: cl.id, address: cl.property_address }) })
      .then(function () { CRM.toast('Market report generated!', 'success'); })
      .catch(function () { CRM.toast('Report generation failed', 'error'); });
  }

  function _findNeighborSales() {
    CRM.toast('Searching for neighbor sales...', 'info');
    // This would query Trestle for recent sales in the same building
    var cl = _s.ws.client;
    MallanAPI._fetch('/api/idx/search?address=' + encodeURIComponent(cl.property_address || '') + '&status=Closed&limit=10')
      .then(function (data) {
        var count = (data.listings || []).length;
        CRM.toast(count + ' recent sales found nearby', 'success');
      })
      .catch(function () { CRM.toast('Search failed', 'error'); });
  }

  function _addSignatory() {
    CRM.openModal('Add Authorized Signatory',
      '<form id="sigForm" class="space-y-3">' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Name *</label><input id="sig_name" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" required></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Title</label><select id="sig_title" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none">' +
          '<option value="Owner">Owner</option><option value="Managing Member">Managing Member</option><option value="Trustee">Trustee</option><option value="President">President</option><option value="Executor">Executor</option><option value="Attorney-in-Fact">Attorney-in-Fact</option>' +
        '</select></div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Email</label><input id="sig_email" type="email" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none"></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Phone</label><input id="sig_phone" type="tel" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none"></div>' +
        '</div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="SalesCRM._saveSignatory()"><i class="fas fa-save mr-1"></i>Save</button>',
      }
    );
  }

  function _saveSignatory() {
    var cl = _s.ws.client;
    var sigs = (cl.authorized_signatories || []).slice();
    var name = (document.getElementById('sig_name') || {}).value;
    if (!name) { CRM.toast('Name required', 'error'); return; }
    sigs.push({
      name: name,
      title: (document.getElementById('sig_title') || {}).value || 'Owner',
      email: (document.getElementById('sig_email') || {}).value || '',
      phone: (document.getElementById('sig_phone') || {}).value || '',
    });
    MallanAPI._fetch('/api/crm/clients/' + cl.id, { method: 'PATCH', body: JSON.stringify({ authorized_signatories: sigs }) })
      .then(function () { cl.authorized_signatories = sigs; CRM.toast('Signatory added', 'success'); CRM.closeModal(); _renderSellerWorkspace(CRM.getContent()); })
      .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  function _logOutreach() {
    CRM.openModal('Log Outreach',
      '<form id="outreachForm" class="space-y-3">' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Type</label><select id="or_type" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none">' +
          '<option value="phone_call">Phone Call</option><option value="email_sent">Email Sent</option><option value="text_sent">Text Sent</option><option value="meeting">In-Person Meeting</option><option value="cma_sent">CMA Sent</option><option value="market_report_sent">Market Report Sent</option>' +
        '</select></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Notes</label><textarea id="or_notes" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" rows="3"></textarea></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="SalesCRM._saveOutreach()"><i class="fas fa-save mr-1"></i>Save</button>',
      }
    );
  }

  function _saveOutreach() {
    var cl = _s.ws.client;
    var type = (document.getElementById('or_type') || {}).value;
    var notes = (document.getElementById('or_notes') || {}).value;
    MallanAPI._fetch('/api/crm/activity', { method: 'POST', body: JSON.stringify({ client_id: cl.id, type: type, title: type.replace(/_/g, ' '), description: notes }) })
      .then(function () { CRM.toast('Outreach logged', 'success'); CRM.closeModal(); _openSeller(cl.id); })
      .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  function _saveFollowUp() {
    var cl = _s.ws.client;
    var date = (document.getElementById('ws_next_followup') || {}).value;
    if (!date) { CRM.toast('Pick a date', 'error'); return; }
    MallanAPI._fetch('/api/crm/clients/' + cl.id, { method: 'PATCH', body: JSON.stringify({ next_follow_up: date }) })
      .then(function () { CRM.toast('Follow-up set', 'success'); })
      .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  function _saveValueProp() {
    var cl = _s.ws.client;
    var val = (document.getElementById('ws_value_prop') || {}).value;
    MallanAPI._fetch('/api/crm/clients/' + cl.id, { method: 'PATCH', body: JSON.stringify({ notes: val }) })
      .then(function () { cl.notes = val; CRM.toast('Saved', 'success'); })
      .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  function _editBuildingMgmt() {
    var cl = _s.ws.client;
    var bm = cl.building_mgmt_requirements || {};
    CRM.openModal('Building / Management Info',
      '<form id="bmForm" class="space-y-3">' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Management Company</label><input id="bm_mgmt" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" value="' + E(bm.management_company || '') + '"></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Board Approval Process</label><input id="bm_board" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" value="' + E(bm.board_approval || '') + '"></div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Flip Tax</label><input id="bm_flip" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" value="' + E(bm.flip_tax || '') + '"></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Sublet Policy</label><input id="bm_sublet" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" value="' + E(bm.sublet_policy || '') + '"></div>' +
        '</div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Move-Out Rules</label><input id="bm_moveout" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" value="' + E(bm.move_out_rules || '') + '"></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Required Docs for Sale</label><textarea id="bm_docs" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" rows="2">' + E(bm.required_docs || '') + '</textarea></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="SalesCRM._saveBuildingMgmt()"><i class="fas fa-save mr-1"></i>Save</button>',
      }
    );
  }

  function _saveBuildingMgmt() {
    var cl = _s.ws.client;
    var bm = {
      management_company: (document.getElementById('bm_mgmt') || {}).value,
      board_approval: (document.getElementById('bm_board') || {}).value,
      flip_tax: (document.getElementById('bm_flip') || {}).value,
      sublet_policy: (document.getElementById('bm_sublet') || {}).value,
      move_out_rules: (document.getElementById('bm_moveout') || {}).value,
      required_docs: (document.getElementById('bm_docs') || {}).value,
    };
    MallanAPI._fetch('/api/crm/clients/' + cl.id, { method: 'PATCH', body: JSON.stringify({ building_mgmt_requirements: bm }) })
      .then(function () { cl.building_mgmt_requirements = bm; CRM.toast('Building info saved', 'success'); CRM.closeModal(); _renderSellerWorkspace(CRM.getContent()); })
      .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  function _scheduleShowing() { CRM.toast('Schedule showing — coming in next build', 'info'); }
  function _createListing() { CRM.toast('Create listing — coming in next build', 'info'); }
  function _editPricingStrategy() { CRM.toast('Pricing strategy editor — coming in next build', 'info'); }
  function _editMarketingStrategy() { CRM.toast('Marketing strategy editor — coming in next build', 'info'); }

  // ─── CRUD ─────────────────────────────────────────────────────────────
  function _newSeller() {
    // Create a blank seller immediately, then open the full intake form
    var data = { roles: ['seller'], pipeline_stage: 'prospect', first_name: 'New', last_name: 'Seller' };
    MallanAPI._fetch('/api/crm/clients', { method: 'POST', body: JSON.stringify(data) })
      .then(function (res) {
        var id = (res.client || res).id;
        if (id) {
          CRM.toast('Seller created — complete the intake form', 'success');
          _openSeller(id);
        } else {
          activeSellers();
        }
      })
      .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  function _submitNewSeller() {
    var form = document.getElementById('newSellerForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = { roles: ['seller'], pipeline_stage: 'prospect' };
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });
    MallanAPI._fetch('/api/crm/clients', { method: 'POST', body: JSON.stringify(data) })
      .then(function (res) {
        CRM.toast('Seller created — opening workspace', 'success');
        CRM.closeModal();
        var id = (res.client || res).id;
        if (id) _openSeller(id); else activeSellers();
      })
      .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  function _editClient(id) {
    MallanAPI._fetch('/api/crm/clients/' + id).then(function (data) {
      var cl = data.client || data;
      CRM.openModal('Edit ' + E((cl.first_name || '') + ' ' + (cl.last_name || '')),
        '<form id="editForm" class="space-y-3">' +
          '<div class="grid grid-cols-2 gap-3">' +
            '<div><label class="text-xs font-semibold text-gray-700 block mb-1">First Name</label><input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" name="first_name" value="' + E(cl.first_name || '') + '"></div>' +
            '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Last Name</label><input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" name="last_name" value="' + E(cl.last_name || '') + '"></div>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-3">' +
            '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Email</label><input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" type="email" name="email" value="' + E(cl.email || '') + '"></div>' +
            '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Phone</label><input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" type="tel" name="phone" value="' + E(cl.phone || '') + '"></div>' +
          '</div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Property Address</label><input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" name="property_address" value="' + E(cl.property_address || '') + '"></div>' +
        '</form>',
        {
          footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
            '<button class="btn btn-gold" onclick="SalesCRM._submitEdit(\'' + E(id) + '\')"><i class="fas fa-save mr-1"></i>Save</button>',
        }
      );
    });
  }

  function _submitEdit(id) {
    var form = document.getElementById('editForm');
    if (!form) return;
    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = v; });
    MallanAPI._fetch('/api/crm/clients/' + id, { method: 'PATCH', body: JSON.stringify(data) })
      .then(function () { CRM.toast('Updated', 'success'); CRM.closeModal(); activeSellers(); })
      .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  function _deleteClient(id) {
    if (!confirm('Delete this client? This cannot be undone.')) return;
    MallanAPI._fetch('/api/crm/clients/' + id, { method: 'DELETE' })
      .then(function () { CRM.toast('Deleted', 'success'); Router.navigate('/sales/sellers'); })
      .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // OTHER TABS — placeholder until seller workspace is verified
  // ═══════════════════════════════════════════════════════════════════════
  function activeBuyers() { CRM.setPanelTitle('Sales CRM'); CRM.getContent().innerHTML = _subnav('buyers') + '<div class="p-8 text-center text-gray-500">Active Buyers — building after Sellers verified</div>'; }
  function landlordSellers() { CRM.setPanelTitle('Sales CRM'); CRM.getContent().innerHTML = _subnav('landlord-sellers') + '<div class="p-8 text-center text-gray-500">Landlord Sellers — building after Sellers verified</div>'; }
  function salesListings() { CRM.setPanelTitle('Sales CRM'); CRM.getContent().innerHTML = _subnav('listings') + '<div class="p-8 text-center text-gray-500">Sale Listings — building after Sellers verified</div>'; }
  function salesMarketing() { CRM.setPanelTitle('Sales CRM'); CRM.getContent().innerHTML = _subnav('marketing') + '<div class="p-8 text-center text-gray-500">Sales Marketing — building after Sellers verified</div>'; }
  function salesActivity() { CRM.setPanelTitle('Sales CRM'); CRM.getContent().innerHTML = _subnav('activity') + '<div class="p-8 text-center text-gray-500">Sales Activity — building after Sellers verified</div>'; }
  function salesAutomation() { CRM.setPanelTitle('Sales CRM'); CRM.getContent().innerHTML = _subnav('automation') + '<div class="p-8 text-center text-gray-500">Sales Automation — building after Sellers verified</div>'; }

  return {
    activeSellers: activeSellers, activeBuyers: activeBuyers, landlordSellers: landlordSellers,
    salesListings: salesListings, salesMarketing: salesMarketing, salesActivity: salesActivity, salesAutomation: salesAutomation,
    _searchSellers: _searchSellers, _filterSellers: _filterSellers, _sortSellers: _sortSellers, _pageSellers: _pageSellers,
    _openSeller: _openSeller, _newSeller: _newSeller, _submitNewSeller: _submitNewSeller,
    _editClient: _editClient, _submitEdit: _submitEdit, _deleteClient: _deleteClient,
    _wsTab: _wsTab, _wsAction: _wsAction, _editField: _editField,
    _toggleDoc: _toggleDoc, _togglePrep: _togglePrep,
    _addSignatory: _addSignatory, _saveSignatory: _saveSignatory,
    _logOutreach: _logOutreach, _saveOutreach: _saveOutreach,
    _saveFollowUp: _saveFollowUp, _saveValueProp: _saveValueProp,
    _editBuildingMgmt: _editBuildingMgmt, _saveBuildingMgmt: _saveBuildingMgmt,
    _generateCMA: _generateCMA, _generateMarketReport: _generateMarketReport, _findNeighborSales: _findNeighborSales,
    _scheduleShowing: _scheduleShowing, _createListing: _createListing,
    _editPricingStrategy: _editPricingStrategy, _editMarketingStrategy: _editMarketingStrategy,
  };
})();
