// ═══════════════════════════════════════════════════════════════════════════════
// SELLER PROSPECTS — Prospecting engine frontend
// Table view (search, filter, paginate) + full workspace (5 tabs)
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, Router, MallanAPI, Utils, FilterBar, ActivityTable, SalesCRM, PitchPacket, OutreachCadence */

var SellerProspects = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;
  var _ago = typeof Utils.formatTimeAgo === 'function' ? Utils.formatTimeAgo : function (d) { return D(d); };

  // ─── State ──────────────────────────────────────────────────────────
  var _s = {
    data: [],
    total: 0,
    sort: { key: 'updated_at', dir: 'desc' },
    page: 1,
    search: '',
    filter: { status: '', source: '' },
    current: null,
    tab: 'overview',
  };

  // ─── Status badge config ────────────────────────────────────────────
  var STATUSES = {
    new:       { label: 'New',       color: '#6B7280', bg: '#F3F4F6' },
    contacted: { label: 'Contacted', color: '#3B82F6', bg: '#EFF6FF' },
    replied:   { label: 'Replied',   color: '#059669', bg: '#ECFDF5' },
    meeting:   { label: 'Meeting',   color: '#F59E0B', bg: '#FFFBEB' },
    pitched:   { label: 'Pitched',   color: '#8B5CF6', bg: '#F5F3FF' },
    signed:    { label: 'Signed',    color: '#B8860B', bg: '#FEF9E7' },
    converted: { label: 'Converted', color: '#059669', bg: '#ECFDF5' },
    declined:  { label: 'Declined',  color: '#EF4444', bg: '#FEF2F2' },
    cold:      { label: 'Cold',      color: '#9CA3AF', bg: '#F9FAFB' },
  };

  var SOURCES = [
    { value: 'manual', label: 'Manual' },
    { value: 'acris', label: 'ACRIS' },
    { value: 'dob_permits', label: 'DOB Permits' },
    { value: 'tax_lien', label: 'Tax Lien' },
    { value: 'estate', label: 'Estate/Probate' },
    { value: 'referral', label: 'Referral' },
    { value: 'import', label: 'Import' },
    { value: 'neighborhood_farm', label: 'Neighborhood Farm' },
    { value: 'expired', label: 'Expired Listing' },
  ];

  var BOROUGHS = [
    { value: '1', label: 'Manhattan' },
    { value: '2', label: 'Bronx' },
    { value: '3', label: 'Brooklyn' },
    { value: '4', label: 'Queens' },
    { value: '5', label: 'Staten Island' },
  ];

  function _statusBadge(status) {
    var s = STATUSES[status] || STATUSES['new'];
    return '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:' + s.bg + ';color:' + s.color + ';">' + E(s.label) + '</span>';
  }

  function _gradeBadge(grade, score) {
    var colors = {
      A: { color: '#059669', bg: '#ECFDF5' },
      B: { color: '#3B82F6', bg: '#EFF6FF' },
      C: { color: '#F59E0B', bg: '#FFFBEB' },
      D: { color: '#EF4444', bg: '#FEF2F2' },
      F: { color: '#6B7280', bg: '#F3F4F6' },
    };
    var c = colors[grade] || colors.F;
    var scoreStr = typeof score === 'number' ? ' (' + score + ')' : '';
    return '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:' + c.bg + ';color:' + c.color + ';">' + E(grade || '-') + scoreStr + '</span>';
  }

  // Subnav removed — Seller Prospects is now a standalone page under CLIENTS sidebar.
  // The old 8-tab Sales CRM subnav is no longer needed.
  function _subnav() { return ''; }

  // ─── KPI cards ──────────────────────────────────────────────────────
  function _kpi(cards) {
    var h = '<div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">';
    cards.forEach(function (c) {
      h += '<div style="display:flex;align-items:center;gap:12px;padding:14px 18px;background:#fff;border:1px solid #E5E7EB;border-radius:12px;flex:1;min-width:150px;">' +
        '<div style="width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:' + (c.bg || '#B8860B15') + ';color:' + (c.fg || '#B8860B') + ';font-size:15px;"><i class="fas ' + c.icon + '"></i></div>' +
        '<div><div style="font-size:20px;font-weight:800;color:#111;">' + c.value + '</div><div style="font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.3px;">' + E(c.label) + '</div></div></div>';
    });
    return h + '</div>';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TABLE VIEW — render()
  // ═══════════════════════════════════════════════════════════════════════
  function render() {
    _s.current = null;
    _s.tab = 'overview';
    CRM.setPanelTitle('Prospects');
    var c = CRM.getContent();
    if (!c) return;
    c.innerHTML = _subnav('prospects') + '<div class="flex items-center justify-center h-40"><i class="fas fa-spinner fa-spin text-2xl text-gold"></i></div>';

    _fetchProspects().then(function () {
      _renderTable(c);
    }).catch(function (err) {
      c.innerHTML = _subnav('prospects') + '<div class="text-center py-12"><i class="fas fa-exclamation-triangle text-3xl text-red-400 mb-3"></i><p class="text-sm text-gray-500">Failed to load: ' + E(err.message || '') + '</p></div>';
    });
  }

  function _fetchProspects() {
    var qs = '?page=' + _s.page;
    if (_s.search) qs += '&search=' + encodeURIComponent(_s.search);
    if (_s.filter.status) qs += '&status=' + encodeURIComponent(_s.filter.status);
    if (_s.filter.source) qs += '&source=' + encodeURIComponent(_s.filter.source);
    qs += '&limit=50';

    // Fetch seller prospects + buyer/tenant/investor clients (assigned to this agent)
    var typeFilter = _s.filter.type || 'all';
    var sellerPromise = (typeFilter === 'all' || typeFilter === 'seller')
      ? MallanAPI._fetch('/api/crm/sales/prospects' + qs) : Promise.resolve({ prospects: [], total: 0 });
    var clientPromise = (typeFilter === 'all' || typeFilter !== 'seller')
      ? MallanAPI._fetch('/api/crm/clients?limit=200&status=active,new,contacted,nurturing' +
          (typeFilter !== 'all' ? '&role=' + typeFilter : '') +
          (_s.search ? '&search=' + encodeURIComponent(_s.search) : ''))
      : Promise.resolve({ clients: [] });

    return Promise.all([sellerPromise, clientPromise]).then(function (results) {
      var sellers = (results[0].prospects || []).map(function (p) {
        p._prospect_type = 'seller';
        p._display_name = p.owner_name || p.address || '-';
        p._display_address = p.address || '';
        return p;
      });

      // Normalize client leads to match prospect table shape
      var clients = (results[1].clients || []).filter(function (cl) {
        // Only show non-seller roles (sellers are in SellerLead)
        var roles = cl.roles || [];
        if (typeFilter !== 'all') return roles.indexOf(typeFilter) >= 0;
        return roles.indexOf('buyer') >= 0 || roles.indexOf('renter') >= 0 ||
               roles.indexOf('tenant') >= 0 || roles.indexOf('investor') >= 0;
      }).map(function (cl) {
        var roles = cl.roles || [];
        var type = roles.indexOf('buyer') >= 0 ? 'buyer' :
                   roles.indexOf('investor') >= 0 ? 'investor' :
                   roles.indexOf('renter') >= 0 || roles.indexOf('tenant') >= 0 ? 'tenant' : 'client';
        return {
          id: cl.id,
          _prospect_type: type,
          _display_name: ((cl.first_name || '') + ' ' + (cl.last_name || '')).trim() || cl.name || cl.email || '-',
          _display_address: cl.property_address || '',
          _is_client_lead: true,
          owner_name: ((cl.first_name || '') + ' ' + (cl.last_name || '')).trim() || cl.name,
          owner_email: cl.email,
          owner_phone: cl.phone,
          address: cl.property_address || '',
          unit: cl.unit_number || '',
          borough: cl.borough || '',
          status: cl.pipeline_stage || cl.status || 'new',
          source: cl.source || '',
          last_contacted_at: cl.last_contacted_at,
          next_follow_up: cl.next_follow_up,
          score_grade: null,
          readiness_score: cl.buyer_potential || cl.lead_score?.score || 0,
          entity_name: cl.entity_name,
          entity_type: cl.entity_type,
          created_at: cl.created_at,
          updated_at: cl.updated_at,
        };
      });

      // Merge: if filtering to seller only, show sellers; otherwise combine
      if (typeFilter === 'seller') {
        _s.data = sellers;
      } else if (typeFilter !== 'all') {
        _s.data = clients;
      } else {
        _s.data = sellers.concat(clients);
      }
      _s.total = _s.data.length;

      // Count by type for filter tabs
      _s.typeCounts = { all: _s.data.length, seller: sellers.length, buyer: 0, tenant: 0, investor: 0 };
      clients.forEach(function (cl) { if (_s.typeCounts[cl._prospect_type] != null) _s.typeCounts[cl._prospect_type]++; });
    });
  }

  function _renderTable(c) {
    var rows = _s.data.slice();
    rows = ActivityTable.sortRows(rows, _s.sort.key, _s.sort.dir);

    var total = _s.total;
    var hot = _s.data.filter(function (r) { var g = r.score_grade || r.readiness_grade; return g === 'A' || g === 'B'; }).length;
    var followUpDue = _s.data.filter(function (r) {
      if (!r.next_follow_up) return false;
      return new Date(r.next_follow_up) <= new Date();
    }).length;
    var convertedMonth = _s.data.filter(function (r) {
      if (!r.converted_at) return false;
      var d = new Date(r.converted_at);
      var now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    var h = '';
    h += _kpi([
      { icon: 'fa-crosshairs', label: 'Total Prospects', value: total, fg: '#3B82F6', bg: '#EFF6FF' },
      { icon: 'fa-fire', label: 'Hot Prospects', value: hot, fg: '#EF4444', bg: '#FEF2F2' },
      { icon: 'fa-clock', label: 'Follow-Up Due', value: followUpDue, fg: '#F59E0B', bg: '#FFFBEB' },
      { icon: 'fa-check-circle', label: 'Converted (Month)', value: convertedMonth, fg: '#059669', bg: '#ECFDF5' },
    ]);

    // Type filter tabs
    var tc = _s.typeCounts || { all: total, seller: total, buyer: 0, tenant: 0, investor: 0 };
    var currentType = _s.filter.type || 'all';
    var typeTabData = [
      { key: 'all', label: 'All', count: tc.all },
      { key: 'seller', label: 'Sellers', count: tc.seller },
      { key: 'buyer', label: 'Buyers', count: tc.buyer },
      { key: 'tenant', label: 'Tenants', count: tc.tenant },
      { key: 'investor', label: 'Investors', count: tc.investor },
    ];
    h += '<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">';
    typeTabData.forEach(function (t) {
      var isActive = currentType === t.key;
      h += '<button style="padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid ' +
        (isActive ? '#B8860B' : '#D1D5DB') + ';background:' + (isActive ? '#B8860B' : '#fff') + ';color:' + (isActive ? '#fff' : '#6B7280') +
        ';" onclick="SellerProspects._filterType(\'' + t.key + '\')">' + E(t.label) +
        (t.count > 0 ? ' <span style="opacity:0.7;">(' + t.count + ')</span>' : '') + '</button>';
    });
    h += '</div>';

    h += FilterBar.render({
      id: 'prospects',
      placeholder: 'Search by address, owner name, email...',
      onSearch: 'SellerProspects._search',
      filters: [
        { key: 'status', label: 'Status', options: Object.keys(STATUSES).map(function (k) { return { value: k, label: STATUSES[k].label }; }), active: _s.filter.status },
        { key: 'source', label: 'Source', options: SOURCES, active: _s.filter.source },
      ],
      onFilter: 'SellerProspects._filter',
    });

    // Quick action buttons (rendered directly to avoid FilterBar escaping onclick)
    h += '<div style="display:flex;gap:8px;margin-bottom:12px;">';
    h += '<button style="padding:6px 14px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;background:#B8860B;color:#fff;" onclick="SellerProspects._newProspect()"><i class="fas fa-plus" style="margin-right:4px;"></i>Add Prospect</button>';
    h += '<button style="padding:6px 14px;border:1px solid #D1D5DB;border-radius:6px;font-size:12px;cursor:pointer;background:#fff;color:#374151;" onclick="SellerProspects._importModal()"><i class="fas fa-file-import" style="margin-right:4px;"></i>Import</button>';
    h += '</div>';

    h += ActivityTable.render({
      id: 'prospects_tbl',
      columns: [
        { key: 'owner_name', label: 'Name', render: function (r) {
          var name = E(r._display_name || r.owner_name || '-');
          var addr = E(r._display_address || r.address || '');
          var unit = r.unit ? ' #' + E(r.unit) : '';
          var entity = r.entity_name ? '<div class="text-[10px] text-purple-600 font-bold mt-0.5">' + E(r.entity_type || 'Entity') + ': ' + E(r.entity_name) + '</div>' : '';
          return '<div><div class="font-semibold text-gray-900">' + name + '</div>' +
            (addr ? '<div class="text-[11px] text-gray-500 mt-0.5">' + addr + unit + '</div>' : '') + entity + '</div>';
        }},
        { key: '_prospect_type', label: 'Type', render: function (r) {
          var typeColors = { seller: '#B8860B', buyer: '#3B82F6', tenant: '#8B5CF6', investor: '#059669', client: '#6B7280' };
          var typeLabels = { seller: 'Seller', buyer: 'Buyer', tenant: 'Tenant', investor: 'Investor', client: 'Client' };
          var t = r._prospect_type || 'seller';
          return '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:' + (typeColors[t] || '#6B7280') + '15;color:' + (typeColors[t] || '#6B7280') + ';">' + E(typeLabels[t] || t) + '</span>';
        }},
        { key: 'status', label: 'Status', render: function (r) { return _statusBadge(r.status); } },
        { key: 'borough', label: 'Borough', render: function (r) {
          return '<span class="text-xs text-gray-600">' + E(_boroughLabel(r.borough) || '-') + '</span>';
        }},
        { key: 'source', label: 'Source', render: function (r) {
          return '<span class="text-xs text-gray-600">' + E(r.source || '-') + '</span>';
        }},
        { key: 'last_contacted_at', label: 'Last Contact', render: function (r) {
          return r.last_contacted_at ? '<span class="text-xs text-gray-600">' + _ago(r.last_contacted_at) + '</span>' : '<span class="text-xs text-gray-400">Never</span>';
        }},
        { key: 'next_follow_up', label: 'Follow-Up', render: function (r) {
          if (!r.next_follow_up) return '<span class="text-xs text-gray-400">-</span>';
          var d = new Date(r.next_follow_up);
          var overdue = d <= new Date();
          return '<span class="text-xs font-semibold" style="color:' + (overdue ? '#EF4444' : '#6B7280') + ';">' + D(r.next_follow_up) + (overdue ? ' <i class="fas fa-exclamation-circle"></i>' : '') + '</span>';
        }},
        { key: '_next_step', label: 'Next Step', sortable: false, render: function (r) {
          var step = r.cadence_steps && r.cadence_steps[0];
          if (!step) return '<span class="text-xs text-gray-400">-</span>';
          var icon = step.channel === 'email' ? 'fa-envelope' : step.channel === 'sms' ? 'fa-comment' : step.channel === 'call' ? 'fa-phone' : 'fa-tasks';
          return '<span class="text-xs text-indigo-600 font-bold"><i class="fas ' + icon + ' mr-1"></i>' + E(step.type || step.channel || '-') + '</span>';
        }},
        { key: '_actions', label: '', sortable: false, width: '80px', render: function (r) {
          return '<div class="flex gap-1">' +
            '<button class="text-blue-500 hover:text-blue-700 p-1" title="Research" onclick="event.stopPropagation();SellerProspects._triggerResearch(\'' + E(String(r.id)) + '\')"><i class="fas fa-database text-xs"></i></button>' +
            '<button class="text-gold hover:text-gold-dark p-1" title="Send Packet" onclick="event.stopPropagation();SellerProspects._quickSend(\'' + E(String(r.id)) + '\')"><i class="fas fa-paper-plane text-xs"></i></button>' +
            '<button class="text-green-500 hover:text-green-700 p-1" title="Convert" onclick="event.stopPropagation();SellerProspects._quickConvert(\'' + E(String(r.id)) + '\')"><i class="fas fa-arrow-right text-xs"></i></button>' +
          '</div>';
        }},
      ],
      rows: rows,
      sort: _s.sort,
      onSort: 'SellerProspects._sort',
      onRowClick: 'SellerProspects.openWorkspace',
      page: _s.page,
      pageSize: 50,
      onPage: 'SellerProspects._page',
      emptyIcon: 'fa-crosshairs',
      emptyText: 'No prospects yet \u2014 click Add Prospect to start',
    });

    c.innerHTML = h;
  }

  // ─── Table handlers ─────────────────────────────────────────────────
  function _search(q) { _s.search = q; _s.page = 1; render(); }
  function _filter(k, v) { _s.filter[k] = v; _s.page = 1; render(); }
  function _filterType(type) { _s.filter.type = type === 'all' ? '' : type; _s.page = 1; render(); }
  function _sort(k) { _s.sort = { key: k, dir: _s.sort.key === k && _s.sort.dir === 'asc' ? 'desc' : 'asc' }; _renderTable(CRM.getContent()); }
  function _page(p) { _s.page = p; render(); }

  // ─── Quick actions from table rows ──────────────────────────────────
  function _triggerResearch(id) {
    CRM.toast('Running research...', 'info');
    MallanAPI._fetch('/api/crm/sales/prospects/' + id + '/research', { method: 'POST' })
      .then(function () { CRM.toast('Research complete', 'success'); render(); })
      .catch(function (err) { CRM.toast('Research failed: ' + (err.message || ''), 'error'); });
  }

  function _quickSend(id) {
    if (!confirm('Send pitch packet to this prospect via email?')) return;
    MallanAPI._fetch('/api/crm/sales/prospects/' + id + '/send-packet', { method: 'POST' })
      .then(function () { CRM.toast('Pitch packet sent', 'success'); render(); })
      .catch(function (err) { CRM.toast('Send failed: ' + (err.message || ''), 'error'); });
  }

  function _quickConvert(id) {
    if (!confirm('Convert this prospect to an Active Seller? This will create a client record.')) return;
    MallanAPI._fetch('/api/crm/sales/prospects/' + id + '/convert', { method: 'POST' })
      .then(function (data) {
        CRM.toast('Converted to Active Seller', 'success');
        var clientId = data.client_id || (data.client && data.client.id);
        if (clientId) Router.navigate('/sales/sellers');
        else render();
      })
      .catch(function (err) { CRM.toast('Convert failed: ' + (err.message || ''), 'error'); });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ADD PROSPECT MODAL
  // ═══════════════════════════════════════════════════════════════════════
  var OWNERSHIP_TYPES = [
    { value: 'individual', label: 'Individual' },
    { value: 'couple', label: 'Married Couple' },
    { value: 'family', label: 'Family (multiple members)' },
    { value: 'llc', label: 'LLC' },
    { value: 'trust', label: 'Trust' },
    { value: 'llp', label: 'LLP (Limited Liability Partnership)' },
    { value: 'lp', label: 'LP (Limited Partnership)' },
    { value: 'inc', label: 'Inc / Corporation' },
    { value: 'corp', label: 'Corp' },
    { value: 'estate', label: 'Estate' },
  ];

  var ROLE_OPTIONS = [
    { value: 'owner', label: 'Owner' },
    { value: 'spouse', label: 'Spouse' },
    { value: 'co-owner', label: 'Co-Owner' },
    { value: 'trustee', label: 'Trustee' },
    { value: 'executor', label: 'Executor / Executrix' },
    { value: 'managing_member', label: 'Managing Member' },
    { value: 'officer', label: 'Officer / Director' },
    { value: 'partner', label: 'Partner' },
    { value: 'authorized_signer', label: 'Authorized Signer' },
    { value: 'power_of_attorney', label: 'Power of Attorney' },
    { value: 'guardian', label: 'Guardian' },
    { value: 'parent', label: 'Parent' },
    { value: 'child', label: 'Adult Child' },
    { value: 'sibling', label: 'Sibling' },
    { value: 'beneficiary', label: 'Beneficiary' },
  ];

  function _newProspect() {
    var boroughOpts = '<option value="">Select Borough</option>';
    BOROUGHS.forEach(function (b) { boroughOpts += '<option value="' + E(b.value) + '">' + E(b.label) + '</option>'; });
    var sourceOpts = '<option value="manual">Manual</option>';
    SOURCES.forEach(function (s) { if (s.value !== 'manual') sourceOpts += '<option value="' + E(s.value) + '">' + E(s.label) + '</option>'; });
    var ownerOpts = '';
    OWNERSHIP_TYPES.forEach(function (t) { ownerOpts += '<option value="' + E(t.value) + '">' + E(t.label) + '</option>'; });
    var roleOpts = '';
    ROLE_OPTIONS.forEach(function (r) { roleOpts += '<option value="' + E(r.value) + '">' + E(r.label) + '</option>'; });

    var inp = 'style="width:100%;font-size:13px;padding:8px 12px;border:1px solid #D1D5DB;border-radius:6px;"';
    var lbl = 'style="display:block;font-size:11px;font-weight:600;color:#374151;margin-bottom:3px;"';

    var body =
      '<form id="newProspectForm">' +
        // ── PROPERTY ──
        '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #E5E7EB;">Property</div>' +
        '<div style="margin-bottom:10px;"><label ' + lbl + '>Address *</label>' +
          '<input ' + inp + ' name="address" required placeholder="400 East 90th Street" onblur="SellerProspects._autoLookup()"></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;">' +
          '<div><label ' + lbl + '>Unit / Apt</label><input ' + inp + ' name="unit" placeholder="17C"></div>' +
          '<div><label ' + lbl + '>Borough *</label><select ' + inp + ' name="borough" required onchange="SellerProspects._autoLookup()">' + boroughOpts + '</select></div>' +
          '<div><label ' + lbl + '>Zip</label><input ' + inp + ' name="postal_code" placeholder="10128" maxlength="5"></div>' +
        '</div>' +
        '<div id="autoLookupResult" style="display:none;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:10px;margin-bottom:12px;font-size:11px;color:#1E40AF;"></div>' +

        // ── OWNERSHIP TYPE ──
        '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px;padding-bottom:4px;border-bottom:1px solid #E5E7EB;">Ownership</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">' +
          '<div><label ' + lbl + '>Ownership Type</label>' +
            '<select ' + inp + ' name="entity_type" onchange="SellerProspects._toggleOwnership(this.value)">' + ownerOpts + '</select></div>' +
          '<div id="entityNameWrap" style="display:none;"><label ' + lbl + '>Entity Name</label>' +
            '<input ' + inp + ' name="entity_name" placeholder="Smith Family Trust LLC"></div>' +
        '</div>' +

        // ── PARTIES / SIGNERS (dynamic — add as many as needed) ──
        '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px;padding-bottom:4px;border-bottom:1px solid #E5E7EB;">' +
          '<span id="partiesLabel">Owner / Contact</span>' +
          '<button type="button" style="float:right;font-size:11px;color:#B8860B;background:none;border:none;cursor:pointer;font-weight:600;" onclick="SellerProspects._addParty()">+ Add Person</button>' +
        '</div>' +
        '<div id="partyList"></div>' +

        // ── SOURCE ──
        '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px;padding-bottom:4px;border-bottom:1px solid #E5E7EB;">Source</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">' +
          '<div><label ' + lbl + '>How did you find this prospect?</label><select ' + inp + ' name="source">' + sourceOpts + '</select></div>' +
          '<div><label ' + lbl + '>Detail / Notes</label><input ' + inp + ' name="source_detail" placeholder="Referral from..."></div>' +
        '</div>' +
      '</form>';

    CRM.openModal('Add Seller Prospect', body, {
      size: 'lg',
      footer: '<button style="padding:8px 16px;border:1px solid #D1D5DB;border-radius:6px;font-size:13px;cursor:pointer;background:#fff;" onclick="CRM.closeModal()">Cancel</button>' +
        '<button style="padding:8px 20px;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;background:#B8860B;color:#fff;" onclick="SellerProspects._submitNew()"><i class="fas fa-plus" style="margin-right:4px;"></i>Add Prospect</button>',
    });

    // Add the first party row automatically
    setTimeout(function () { _addParty(); }, 50);
  }

  function _toggleOwnership(val) {
    var entityWrap = document.getElementById('entityNameWrap');
    var label = document.getElementById('partiesLabel');
    var isEntity = val && val !== 'individual' && val !== 'couple' && val !== 'family';
    if (entityWrap) entityWrap.style.display = isEntity ? 'block' : 'none';
    // Update label based on type
    if (label) {
      if (val === 'couple') label.textContent = 'Spouses / Partners';
      else if (val === 'family') label.textContent = 'Family Members';
      else if (isEntity) label.textContent = 'Authorized Signers';
      else label.textContent = 'Owner / Contact';
    }
  }

  // Alias for backward compat
  function _toggleEntity(val) { _toggleOwnership(val); }

  function _addParty() {
    var list = document.getElementById('partyList');
    if (!list) return;
    var idx = list.children.length;
    var inp = 'style="width:100%;font-size:12px;padding:6px 10px;border:1px solid #D1D5DB;border-radius:6px;"';
    var slbl = 'style="font-size:10px;font-weight:600;color:#6B7280;display:block;margin-bottom:2px;"';

    var roleOpts = '<option value="">Role...</option>';
    ROLE_OPTIONS.forEach(function (r) { roleOpts += '<option value="' + E(r.value) + '">' + E(r.label) + '</option>'; });

    var html =
      '<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:10px;margin-bottom:8px;" data-party="' + idx + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '<span style="font-size:11px;font-weight:700;color:#374151;">Person ' + (idx + 1) + '</span>' +
          (idx > 0 ? '<button type="button" style="font-size:12px;color:#EF4444;background:none;border:none;cursor:pointer;" onclick="this.closest(\'[data-party]\').remove()">Remove</button>' : '') +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:6px;">' +
          '<div><label ' + slbl + '>Full Name *</label><input ' + inp + ' name="party_name_' + idx + '" placeholder="John Smith" required></div>' +
          '<div><label ' + slbl + '>Role / Title</label><select ' + inp + ' name="party_role_' + idx + '">' + roleOpts + '</select></div>' +
          '<div><label ' + slbl + '>Signing Capacity</label><input ' + inp + ' name="party_capacity_' + idx + '" placeholder="As Managing Member of..."></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
          '<div><label ' + slbl + '>Email</label><input ' + inp + ' name="party_email_' + idx + '" type="email" placeholder="john@example.com"></div>' +
          '<div><label ' + slbl + '>Phone</label><input ' + inp + ' name="party_phone_' + idx + '" type="tel" placeholder="212-555-1234"></div>' +
        '</div>' +
      '</div>';
    list.insertAdjacentHTML('beforeend', html);
  }

  // Keep old name for exported API
  function _addSignatory() { _addParty(); }

  // ── Auto-lookup: when address + borough entered, pull PLUTO data ──
  var _lookupTimer = null;
  function _autoLookup() {
    if (_lookupTimer) clearTimeout(_lookupTimer);
    _lookupTimer = setTimeout(function () { _doAutoLookup(); }, 500);
  }

  function _doAutoLookup() {
    var form = document.getElementById('newProspectForm');
    if (!form) return;
    var address = (form.querySelector('[name="address"]') || {}).value || '';
    var borough = (form.querySelector('[name="borough"]') || {}).value || '';
    if (!address.trim() || !borough) return;

    var resultDiv = document.getElementById('autoLookupResult');
    if (resultDiv) {
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:4px;"></i>Looking up property...';
    }

    // Normalize address for PLUTO: uppercase, strip unit/apt, strip ordinals
    var addrNorm = address.trim().toUpperCase()
      .replace(/,?\s*(APT|UNIT|SUITE|#)\s*\S*$/i, '')
      .replace(/(\d+)\s*(ST|ND|RD|TH)\b/g, '$1')
      .replace(/'/g, "''");

    var boroMap = { manhattan: '1', bronx: '2', brooklyn: '3', queens: '4', 'staten island': '5' };
    var boroCode = boroMap[borough.toLowerCase()] || borough;

    // Try PLUTO lookup via NYC Open Data
    var plutoUrl = 'https://data.cityofnewyork.us/resource/64uk-42ks.json?' +
      '$where=' + encodeURIComponent("address='" + addrNorm + "' AND borocode='" + boroCode + "'") +
      '&$limit=1';

    fetch(plutoUrl)
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        if (!rows || !rows.length) {
          // Try abbreviated direction
          var abbr = addrNorm.replace(/\bEAST\b/g, 'E').replace(/\bWEST\b/g, 'W').replace(/\bNORTH\b/g, 'N').replace(/\bSOUTH\b/g, 'S');
          if (abbr !== addrNorm) {
            var url2 = 'https://data.cityofnewyork.us/resource/64uk-42ks.json?' +
              '$where=' + encodeURIComponent("address='" + abbr + "' AND borocode='" + boroCode + "'") +
              '&$limit=1';
            return fetch(url2).then(function (r2) { return r2.json(); });
          }
          return [];
        }
        return rows;
      })
      .then(function (rows) {
        if (!rows || !rows.length) {
          if (resultDiv) {
            resultDiv.innerHTML = '<i class="fas fa-info-circle" style="margin-right:4px;"></i>No PLUTO record found. Data will be pulled when you run Research.';
          }
          return;
        }

        var p = rows[0];
        var info = [];
        if (p.ownername) info.push('<b>Owner:</b> ' + E(p.ownername));
        if (p.yearbuilt) info.push('<b>Year Built:</b> ' + E(p.yearbuilt));
        if (p.numfloors) info.push('<b>Floors:</b> ' + E(Math.round(parseFloat(p.numfloors))));
        if (p.unitstotal) info.push('<b>Units:</b> ' + E(p.unitstotal));
        if (p.bldgclass) info.push('<b>Class:</b> ' + E(p.bldgclass));
        if (p.bldgarea) info.push('<b>Bldg Area:</b> ' + E(parseInt(p.bldgarea).toLocaleString()) + ' sqft');
        if (p.bbl) info.push('<b>BBL:</b> ' + E(p.bbl.split('.')[0]));

        if (resultDiv) {
          resultDiv.innerHTML = '<i class="fas fa-check-circle" style="margin-right:4px;color:#059669;"></i><b>Property Found</b><br>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;margin-top:4px;">' +
            info.map(function (i) { return '<span>' + i + '</span>'; }).join('') +
            '</div>';
        }

        // Start with PLUTO owner as fallback, then try ACRIS for deed owner
        _fillOwnerFields(form, p.ownername);

        // ── Chain ACRIS Parties lookup for the authoritative deed owner ──
        if (p.bbl) {
          _lookupAcrisOwner(form, p.bbl.split('.')[0], resultDiv, info);
        }
      })
      .catch(function () {
        if (resultDiv) {
          resultDiv.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right:4px;color:#F59E0B;"></i>Lookup failed. Data will be pulled when you run Research.';
        }
      });
  }

  /** Fill owner/entity fields from a name string (PLUTO or ACRIS) */
  function _fillOwnerFields(form, ownerName) {
    if (!ownerName || !form) return;
    var ownerUpper = ownerName.toUpperCase().trim();

    // Detect entity type from owner name keywords
    var detectedType = 'individual';
    if (/\bLLC\b|\bL\.L\.C\b/.test(ownerUpper)) detectedType = 'llc';
    else if (/\bTRUST\b|\bTRSTEE?\b/.test(ownerUpper)) detectedType = 'trust';
    else if (/\bCORP\b|\bINC\b|\bCO\b(?!-?OP)/.test(ownerUpper)) detectedType = 'corp';
    else if (/\bLP\b|\bL\.P\b|\bPARTNERSHIP\b/.test(ownerUpper)) detectedType = 'partnership';
    else if (/\bESTATE\b|\bDECEASED\b/.test(ownerUpper)) detectedType = 'estate';

    var typeSelect = form.querySelector('[name="entity_type"]');
    var entityInput = form.querySelector('[name="entity_name"]');

    if (detectedType !== 'individual') {
      if (typeSelect) {
        typeSelect.value = detectedType;
        _toggleOwnership(detectedType);
      }
      if (entityInput) {
        entityInput.value = ownerName.replace(/\w\S*/g, function (t) {
          return t.charAt(0).toUpperCase() + t.substr(1).toLowerCase();
        });
      }
    }

    // Auto-fill first party name
    var firstPartyName = form.querySelector('[name="party_name_0"]');
    if (firstPartyName && !firstPartyName.value) {
      firstPartyName.value = ownerName;
    }
  }

  /**
   * ACRIS Parties lookup — 3 chained SODA calls (all public NYC Open Data):
   * 1. Real Property Legals → get document_ids for the BBL
   * 2. Master → find the most recent deed
   * 3. Parties → get the grantee (buyer = current owner) name
   */
  function _lookupAcrisOwner(form, bbl, resultDiv, info) {
    if (!bbl || bbl.length < 10) return;
    var borough = bbl[0];
    var block = bbl.substring(1, 6);
    var lot = bbl.substring(6, 10);

    var LEGALS = '8h5j-fqxa';   // ACRIS Real Property Legals
    var MASTER = 'bnx9-e6tj';   // ACRIS Real Property Master
    var PARTIES = '636b-3b5g';  // ACRIS Real Property Parties
    var BASE = 'https://data.cityofnewyork.us/resource/';

    // Step 1: Find document IDs for this BBL
    var legalsUrl = BASE + LEGALS + '.json?' +
      '$where=' + encodeURIComponent("borough='" + borough + "' AND block='" + block + "' AND lot='" + lot + "'") +
      '&$select=document_id&$order=document_id%20DESC&$limit=50';

    fetch(legalsUrl)
      .then(function (r) { return r.json(); })
      .then(function (ids) {
        if (!ids || !ids.length) return null;
        var docIds = [];
        var seen = {};
        ids.forEach(function (r) {
          if (r.document_id && !seen[r.document_id]) {
            seen[r.document_id] = true;
            docIds.push(r.document_id);
          }
        });
        if (!docIds.length) return null;

        // Step 2: Find the most recent deed
        var masterUrl = BASE + MASTER + '.json?' +
          '$where=' + encodeURIComponent("document_id in ('" + docIds.join("','") + "')") +
          '&$order=recorded_datetime%20DESC&$limit=' + docIds.length;

        return fetch(masterUrl).then(function (r) { return r.json(); });
      })
      .then(function (docs) {
        if (!docs || !docs.length) return null;
        var deedTypes = ['DEED', 'DEEDO'];
        var deed = null;
        for (var i = 0; i < docs.length; i++) {
          var type = (docs[i].doc_type || '').toUpperCase();
          if (deedTypes.some(function (dt) { return type.indexOf(dt) >= 0; })) {
            deed = docs[i];
            break;
          }
        }
        if (!deed) return null;

        // Step 3: Get grantee (party_type=2 = buyer = current owner)
        var partiesUrl = BASE + PARTIES + '.json?' +
          '$where=' + encodeURIComponent("document_id='" + deed.document_id + "' AND party_type='2'") +
          '&$limit=5';

        return fetch(partiesUrl).then(function (r) { return r.json(); });
      })
      .then(function (parties) {
        if (!parties || !parties.length) return;
        var names = parties.map(function (p) { return p.name; }).filter(Boolean);
        if (!names.length) return;
        var deedOwner = names.join(', ');

        // Update display
        if (resultDiv && info) {
          // Replace PLUTO owner with ACRIS deed owner in the info display
          info = info.filter(function (i) { return i.indexOf('Owner:') < 0; });
          info.unshift('<b>Owner (deed):</b> ' + E(deedOwner));
          resultDiv.innerHTML = '<i class="fas fa-check-circle" style="margin-right:4px;color:#059669;"></i><b>Property Found</b><br>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;margin-top:4px;">' +
            info.map(function (i) { return '<span>' + i + '</span>'; }).join('') +
            '</div>';
        }

        // Override form fields with the authoritative ACRIS deed owner
        _fillOwnerFields(form, deedOwner);
      })
      .catch(function () {
        // ACRIS lookup is best-effort — PLUTO name already filled as fallback
      });
  }

  function _submitNew() {
    var form = document.getElementById('newProspectForm');
    if (!form) return;
    if (!form.checkValidity()) { form.reportValidity(); return; }

    var data = {};
    new FormData(form).forEach(function (v, k) {
      if (v && !k.startsWith('party_')) data[k] = v;
    });

    // Collect all parties
    var parties = [];
    var partyDivs = document.querySelectorAll('[data-party]');
    partyDivs.forEach(function (div) {
      var idx = div.getAttribute('data-party');
      var name = form.querySelector('[name="party_name_' + idx + '"]');
      var role = form.querySelector('[name="party_role_' + idx + '"]');
      var capacity = form.querySelector('[name="party_capacity_' + idx + '"]');
      var email = form.querySelector('[name="party_email_' + idx + '"]');
      var phone = form.querySelector('[name="party_phone_' + idx + '"]');
      if (name && name.value.trim()) {
        parties.push({
          name: name.value.trim(),
          role: role ? role.value : '',
          signing_capacity: capacity ? capacity.value.trim() : '',
          email: email ? email.value.trim() : '',
          phone: phone ? phone.value.trim() : '',
        });
      }
    });

    // First party becomes the primary contact
    if (parties.length > 0) {
      var primary = parties[0];
      data.owner_name = primary.name;
      if (primary.email) data.owner_email = primary.email;
      if (primary.phone) data.owner_phone = primary.phone;

      // Second party becomes secondary contact
      if (parties.length > 1) {
        var secondary = parties[1];
        data.secondary_name = secondary.name;
        data.secondary_relationship = secondary.role || 'co-owner';
        if (secondary.email) data.secondary_email = secondary.email;
        if (secondary.phone) data.secondary_phone = secondary.phone;
      }

      // All parties stored as authorized_signatories (includes all people)
      if (parties.length > 0) {
        data.authorized_signatories = parties.map(function (p) {
          return { name: p.name, title: p.role, signing_capacity: p.signing_capacity, email: p.email, phone: p.phone };
        });
      }
    }

    MallanAPI._fetch('/api/crm/sales/prospects', { method: 'POST', body: JSON.stringify(data) })
      .then(function (res) {
        CRM.toast('Prospect added', 'success');
        CRM.closeModal();
        var id = (res.prospect || res).id;
        if (id) openWorkspace(String(id));
        else render();
      })
      .catch(function (err) {
        var msg = (err && err.message) || 'Unknown error';
        if (msg.indexOf('already exists') !== -1) {
          CRM.toast('A prospect with this address already exists', 'warning');
        } else {
          CRM.toast('Failed: ' + msg, 'error');
        }
      });
  }

  // ─── Import modal ────────────────────────────────────────────────────
  var _importState = { preview: null, file: null, source: '' };

  function _importModal() {
    _importState = { preview: null, file: null, source: '' };
    var h = '<div style="padding:16px;">' +
      '<div style="margin-bottom:16px;">' +
        '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;">Upload CSV or Excel File</label>' +
        '<input type="file" id="import-file" accept=".csv,.xlsx,.xls" style="font-size:13px;padding:8px;border:1px solid #D1D5DB;border-radius:6px;width:100%;">' +
      '</div>' +
      '<div style="margin-bottom:16px;">' +
        '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;">Source Label</label>' +
        '<input type="text" id="import-source" placeholder="e.g. UN List, Doctors List, LinkedIn Export" style="font-size:13px;padding:8px 12px;border:1px solid #D1D5DB;border-radius:6px;width:100%;">' +
      '</div>' +
      '<div id="import-preview" style="display:none;margin-bottom:16px;"></div>' +
      '<div id="import-result" style="display:none;margin-bottom:16px;"></div>' +
    '</div>';

    CRM.openModal('Import Seller Prospects', h, {
      width: 640,
      footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
        '<button class="btn btn-gold" id="import-preview-btn" onclick="SellerProspects._importPreview()">Preview</button>' +
        '<button class="btn btn-gold" id="import-confirm-btn" style="display:none;" onclick="SellerProspects._importConfirm()">Import Now</button>',
    });
  }

  function _importPreview() {
    var fileInput = document.getElementById('import-file');
    var sourceInput = document.getElementById('import-source');
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      CRM.toast('Please select a file', 'warning'); return;
    }
    _importState.file = fileInput.files[0];
    _importState.source = (sourceInput && sourceInput.value) || 'imported';

    var fd = new FormData();
    fd.append('file', _importState.file);
    fd.append('source', _importState.source);

    var previewDiv = document.getElementById('import-preview');
    if (previewDiv) {
      previewDiv.style.display = 'block';
      previewDiv.innerHTML = '<div style="text-align:center;padding:12px;"><i class="fas fa-spinner fa-spin"></i> Analyzing file...</div>';
    }

    fetch('/api/crm/sales/prospects/import?preview=true', { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { CRM.toast(data.error, 'danger'); return; }
        _importState.preview = data;
        var h = '<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:12px;">' +
          '<div style="font-size:13px;font-weight:700;color:#111;margin-bottom:8px;">' +
            '<i class="fas fa-check-circle text-green-500 mr-1"></i> ' + data.total_rows + ' rows detected</div>' +
          '<div style="font-size:11px;color:#6B7280;margin-bottom:8px;">Columns detected:</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">';
        var cols = data.columns_detected || {};
        Object.keys(cols).forEach(function (k) {
          var v = cols[k];
          h += '<span style="font-size:10px;padding:2px 8px;border-radius:4px;background:' +
            (v ? '#ECFDF5;color:#059669' : '#FEF2F2;color:#EF4444') + ';">' +
            E(k) + ': ' + (v ? E(v) : 'not found') + '</span>';
        });
        h += '</div>';
        // Show sample rows
        if (data.sample_rows && data.sample_rows.length > 0) {
          h += '<div style="font-size:11px;color:#6B7280;margin-bottom:4px;">Sample (first 5 rows):</div>' +
            '<div style="overflow-x:auto;max-height:200px;"><table style="width:100%;font-size:11px;border-collapse:collapse;">';
          var headers = Object.keys(data.sample_rows[0]);
          h += '<tr>';
          headers.forEach(function (hd) { h += '<th style="padding:4px 8px;background:#F3F4F6;border:1px solid #E5E7EB;text-align:left;">' + E(hd) + '</th>'; });
          h += '</tr>';
          data.sample_rows.slice(0, 5).forEach(function (row) {
            h += '<tr>';
            headers.forEach(function (hd) { h += '<td style="padding:4px 8px;border:1px solid #E5E7EB;">' + E(String(row[hd] || '')) + '</td>'; });
            h += '</tr>';
          });
          h += '</table></div>';
        }
        h += '</div>';
        if (previewDiv) previewDiv.innerHTML = h;
        // Show confirm button, hide preview button
        var previewBtn = document.getElementById('import-preview-btn');
        var confirmBtn = document.getElementById('import-confirm-btn');
        if (previewBtn) previewBtn.style.display = 'none';
        if (confirmBtn) confirmBtn.style.display = 'inline-flex';
      })
      .catch(function () { CRM.toast('Failed to preview file', 'danger'); });
  }

  function _importConfirm() {
    if (!_importState.file) { CRM.toast('No file selected', 'warning'); return; }
    var resultDiv = document.getElementById('import-result');
    var confirmBtn = document.getElementById('import-confirm-btn');
    if (confirmBtn) confirmBtn.disabled = true;
    if (resultDiv) {
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = '<div style="text-align:center;padding:12px;"><i class="fas fa-spinner fa-spin"></i> Importing...</div>';
    }

    var fd = new FormData();
    fd.append('file', _importState.file);
    fd.append('source', _importState.source);

    fetch('/api/crm/sales/prospects/import', { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { CRM.toast(data.error, 'danger'); return; }
        var h = '<div style="background:#ECFDF5;border:1px solid #059669;border-radius:8px;padding:16px;text-align:center;">' +
          '<div style="font-size:24px;font-weight:800;color:#059669;margin-bottom:4px;">' + data.imported + '</div>' +
          '<div style="font-size:12px;color:#374151;">contacts imported</div>' +
          (data.skipped ? '<div style="font-size:11px;color:#6B7280;margin-top:4px;">' + data.skipped + ' duplicates skipped</div>' : '') +
          (data.errors ? '<div style="font-size:11px;color:#EF4444;margin-top:4px;">' + data.errors + ' errors</div>' : '') +
        '</div>';
        if (resultDiv) resultDiv.innerHTML = h;
        if (confirmBtn) { confirmBtn.textContent = 'Done'; confirmBtn.disabled = false; confirmBtn.onclick = function () { CRM.closeModal(); render(); }; }
      })
      .catch(function () { CRM.toast('Import failed', 'danger'); if (confirmBtn) confirmBtn.disabled = false; });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WORKSPACE — openWorkspace(id)
  // ═══════════════════════════════════════════════════════════════════════
  function openWorkspace(id) {
    // Check if this is a client lead (buyer/tenant/investor) vs a seller prospect
    var row = _s.data.find(function (r) { return String(r.id) === String(id); });
    if (row && row._is_client_lead) {
      // Open the client workspace instead
      Router.navigate('/workspace/client/' + id + '/overview');
      return;
    }

    var c = CRM.getContent();
    CRM.setPanelTitle('Prospects');
    c.innerHTML = '<div class="flex items-center justify-center h-40"><i class="fas fa-spinner fa-spin text-2xl text-gold"></i></div>';

    MallanAPI._fetch('/api/crm/sales/prospects/' + id)
      .then(function (data) {
        _s.current = data.prospect || data;
        _renderWorkspace(c);
        // Auto-run research on first open (non-blocking)
        var p = _s.current;
        if (!p.last_researched_at && p.address && p.borough) {
          setTimeout(function () {
            CRM.toast('Auto-running research for new prospect...', 'info');
            MallanAPI._fetch('/api/crm/sales/prospects/' + p.id + '/research', { method: 'POST' })
              .then(function () {
                CRM.toast('Research complete \u2014 refreshing...', 'success');
                openWorkspace(String(p.id));
              })
              .catch(function (err) {
                // Non-blocking \u2014 workspace still works without research
                CRM.toast('Auto-research skipped: ' + (err.message || ''), 'info');
              });
          }, 500); // Small delay so UI renders first
        }
      })
      .catch(function (err) {
        c.innerHTML = '<div class="p-8 text-center text-red-500"><i class="fas fa-exclamation-triangle text-3xl mb-3"></i><p>Failed to load prospect: ' + E(err.message || '') + '</p>' +
          '<button class="btn btn-outline mt-4" onclick="Router.navigate(\'/sales/prospects\')"><i class="fas fa-arrow-left mr-1"></i>Back</button></div>';
      });
  }

  function _renderWorkspace(c) {
    var p = _s.current;
    if (!p) return;
    var tab = _s.tab;

    // ── Subnav + Header ──
    var h = _subnav('prospects');
    h += '<div class="mb-4">';
    h += '<button class="text-sm text-gray-500 hover:text-gray-700 mb-3" onclick="SellerProspects.render()"><i class="fas fa-arrow-left mr-1"></i>Back to Seller Prospects</button>';
    h += '<div class="flex items-start justify-between flex-wrap gap-4">';

    // Left: prospect info
    h += '<div class="flex items-center gap-4">';
    var init = (p.owner_name || '??').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
    h += '<div style="width:48px;height:48px;border-radius:50%;background:#B8860B20;color:#B8860B;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;">' + E(init) + '</div>';
    h += '<div>';
    h += '<h2 class="text-xl font-bold text-gray-900">' + E(p.owner_name || 'Unknown Owner') + '</h2>';
    h += '<div class="text-sm text-gray-600 mt-0.5"><i class="fas fa-map-marker-alt mr-1 text-gray-400"></i>' + E(p.address || '-') + (p.unit ? ' #' + E(p.unit) : '') + '</div>';
    h += '<div class="flex items-center gap-2 mt-1">' + _statusBadge(p.status) + ' ' + _gradeBadge(p.score_grade || p.readiness_grade, p.readiness_score);
    if (p.entity_name) h += '<span class="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-bold">' + E(p.entity_type || 'Entity') + ': ' + E(p.entity_name) + '</span>';
    h += '</div>';
    h += '<div class="flex gap-3 mt-1 text-xs text-gray-500">';
    if (p.owner_email) h += '<span><i class="fas fa-envelope mr-1"></i>' + E(p.owner_email) + '</span>';
    if (p.owner_phone) h += '<span><i class="fas fa-phone mr-1"></i>' + E(p.owner_phone) + '</span>';
    h += '</div></div></div>';

    // Right: action buttons
    h += '<div class="flex gap-2 flex-wrap">';
    h += '<button class="btn btn-sm btn-gold" onclick="SellerProspects._convert()"><i class="fas fa-arrow-right mr-1"></i>Convert to Active Seller</button>';
    h += '<button class="btn btn-sm btn-outline" onclick="SellerProspects._editProspect()"><i class="fas fa-edit"></i></button>';
    h += '<button class="btn btn-sm btn-outline text-red-500" onclick="SellerProspects._deleteProspect()"><i class="fas fa-trash-alt"></i></button>';
    h += '</div></div></div>';

    // ── Workspace tabs ──
    var wsTabs = [
      { id: 'overview', label: 'Overview', icon: 'fa-th-large' },
      { id: 'research', label: 'Research', icon: 'fa-database' },
      { id: 'pitch', label: 'Pitch Packet', icon: 'fa-file-powerpoint' },
      { id: 'outreach', label: 'Outreach', icon: 'fa-paper-plane' },
      { id: 'notes', label: 'Notes & Activity', icon: 'fa-sticky-note' },
    ];

    h += '<div class="flex gap-1 overflow-x-auto border-b border-gray-200 mb-4">';
    wsTabs.forEach(function (t) {
      h += '<button class="px-3 py-2 text-xs font-semibold whitespace-nowrap ' +
        (t.id === tab ? 'text-gold border-b-2 border-gold' : 'text-gray-400 hover:text-gray-700') +
        '" onclick="SellerProspects._wsTab(\'' + t.id + '\')">' +
        '<i class="fas ' + t.icon + ' mr-1"></i>' + E(t.label) + '</button>';
    });
    h += '</div>';

    h += '<div id="sp-ws-body"></div>';
    c.innerHTML = h;

    // Render active tab
    var body = document.getElementById('sp-ws-body');
    if (body) _renderWsTab(body, tab, p);
  }

  function _wsTab(id) { _s.tab = id; _renderWorkspace(CRM.getContent()); }

  function _renderWsTab(el, tab, p) {
    if (tab === 'overview') _wsOverview(el, p);
    else if (tab === 'research') _wsResearch(el, p);
    else if (tab === 'pitch') _wsPitch(el, p);
    else if (tab === 'outreach') _wsOutreach(el, p);
    else if (tab === 'notes') _wsNotes(el, p);
    else el.innerHTML = '<p class="text-gray-400 p-4">Tab: ' + E(tab) + '</p>';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 1: OVERVIEW
  // ═══════════════════════════════════════════════════════════════════════
  function _wsOverview(el, p) {
    var h = '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">';

    // ── Property Details ──
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-3"><i class="fas fa-building text-gold mr-2"></i>Property Details</h3>';
    h += '<div class="space-y-2">';
    h += _fieldRow('Address', p.address);
    h += _fieldRow('Unit', p.unit);
    h += _fieldRow('Borough', _boroughLabel(p.borough));
    h += _fieldRow('Property Type', p.property_type);
    h += _fieldRow('Beds', p.beds);
    h += _fieldRow('Baths', p.baths);
    h += _fieldRow('Sq Ft', p.sqft ? Number(p.sqft).toLocaleString() : null);
    h += _fieldRow('Building', p.building_name);
    h += _fieldRow('Management Co.', p.management_company);
    h += '</div>';
    if (!p.beds && !p.baths && !p.sqft) {
      h += '<div style="padding:8px 12px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;margin-top:8px;">';
      h += '<span style="font-size:11px;color:#C2410C;"><i class="fas fa-info-circle" style="margin-right:4px;"></i>Property details not set. <a href="#" onclick="SellerProspects._editProspect();return false;" style="color:#B8860B;font-weight:600;">Edit to add beds, baths, sqft</a></span>';
      h += '</div>';
    }
    h += '</div>';

    // ── Ownership ──
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-3"><i class="fas fa-user-shield text-gold mr-2"></i>Ownership</h3>';
    h += '<div class="space-y-2">';
    h += _fieldRow('Owner', p.owner_name);
    h += _fieldRow('Email', p.owner_email);
    h += _fieldRow('Phone', p.owner_phone);
    if (p.entity_type || p.entity_name) {
      h += '<div class="border-t border-gray-100 pt-2 mt-2"></div>';
      h += _fieldRow('Entity Type', p.entity_type);
      h += _fieldRow('Entity Name', p.entity_name);
      if (p.authorized_signatories) {
        var sigs = p.authorized_signatories;
        if (typeof sigs === 'string') { try { sigs = JSON.parse(sigs); } catch (e) { sigs = []; } }
        if (Array.isArray(sigs) && sigs.length > 0) {
          h += '<div class="mt-2"><span class="text-xs font-semibold text-gray-700">Signatories:</span>';
          sigs.forEach(function (s) {
            h += '<div class="text-xs text-gray-600 ml-2">' + E(s.name || s) + (s.title ? ' (' + E(s.title) + ')' : '') + '</div>';
          });
          h += '</div>';
        }
      }
    }
    h += '</div></div>';

    // ── Secondary Contact ──
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-3"><i class="fas fa-users text-gold mr-2"></i>Secondary Contact</h3>';
    h += '<div class="space-y-2">';
    h += _fieldRow('Name', p.secondary_name);
    h += _fieldRow('Phone', p.secondary_phone);
    h += _fieldRow('Email', p.secondary_email);
    h += _fieldRow('Relationship', p.secondary_relationship);
    h += '</div>';
    h += '<div class="border-t border-gray-100 pt-3 mt-3">';
    h += '<span class="text-xs font-semibold text-gray-700">Attorney</span>';
    h += _fieldRow('Name', p.attorney_name);
    h += _fieldRow('Email', p.attorney_email);
    h += _fieldRow('Phone', p.attorney_phone);
    h += '</div></div>';

    // ── Status & Score ──
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-3"><i class="fas fa-chart-line text-gold mr-2"></i>Status & Score</h3>';

    // Status selector
    h += '<div class="mb-4">';
    h += '<label class="text-xs font-semibold text-gray-700 block mb-1">Status</label>';
    h += '<select class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" onchange="SellerProspects._updateStatus(this.value)">';
    Object.keys(STATUSES).forEach(function (k) {
      h += '<option value="' + E(k) + '"' + (p.status === k ? ' selected' : '') + '>' + E(STATUSES[k].label) + '</option>';
    });
    h += '</select></div>';

    // Key property data (real only)
    if (p.last_purchase_price || p.mortgage_amount || p.year_built) {
      h += '<div class="border-t border-gray-100 pt-3 mt-3 space-y-1">';
      if (p.last_purchase_price) h += _fieldRow('Purchase Price', $(Number(p.last_purchase_price)));
      if (p.last_purchase_date) h += _fieldRow('Purchased', D(p.last_purchase_date) + (p.ownership_years ? ' (' + p.ownership_years + ' yrs)' : ''));
      if (p.mortgage_amount) h += _fieldRow('Mortgage', $(Number(p.mortgage_amount)));
      var _pt = (p.property_type || '').toLowerCase();
      var _maint = _pt === 'co-op' || _pt === 'coop' || _pt === 'condop';
      if (!_maint && p.market_value) h += _fieldRow('DOF Market Value', $(Number(p.market_value)));
      if (!_maint && p.annual_tax) h += _fieldRow('Annual Tax', $(Number(p.annual_tax)));
      if (_maint) h += _fieldRow('Tax', 'Maintenance only');
      if (p.year_built) h += _fieldRow('Year Built', p.year_built);
      h += '</div>';
    } else if (!p.last_purchase_price && !p.mortgage_amount) {
      h += '<div style="padding:8px 12px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;margin-top:8px;">';
      h += '<span style="font-size:11px;color:#1D4ED8;"><i class="fas fa-search" style="margin-right:4px;"></i>Financial data loads from ACRIS when Research runs.</span>';
      h += '</div>';
    }

    // Metadata
    h += '<div class="border-t border-gray-100 pt-3 mt-3 space-y-1">';
    h += _fieldRow('Source', p.source);
    h += _fieldRow('Source Detail', p.source_detail);
    h += _fieldRow('Next Follow-Up', p.next_follow_up ? D(p.next_follow_up) : null);
    h += _fieldRow('Last Contacted', p.last_contacted_at ? _ago(p.last_contacted_at) : null);
    h += _fieldRow('Created', p.created_at ? D(p.created_at) : null);
    h += _fieldRow('Updated', p.updated_at ? _ago(p.updated_at) : null);
    h += '</div></div>';

    h += '</div>';
    el.innerHTML = h;
  }

  function _fieldRow(label, value) {
    return '<div class="flex justify-between items-baseline"><span class="text-xs font-semibold text-gray-500">' + E(label) + '</span>' +
      '<span class="text-xs text-gray-900 font-medium">' + (value ? E(String(value)) : '<span class="text-gray-400">-</span>') + '</span></div>';
  }

  function _boroughLabel(val) {
    if (!val) return null;
    var map = { '1': 'Manhattan', '2': 'Bronx', '3': 'Brooklyn', '4': 'Queens', '5': 'Staten Island' };
    return map[String(val)] || val;
  }

  function _gradeStyle(grade) {
    var m = {
      A: 'background:#ECFDF5;color:#059669;',
      B: 'background:#EFF6FF;color:#3B82F6;',
      C: 'background:#FFFBEB;color:#F59E0B;',
      D: 'background:#FEF2F2;color:#EF4444;',
      F: 'background:#F3F4F6;color:#6B7280;',
    };
    return m[grade] || m.F;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 2: RESEARCH
  // ═══════════════════════════════════════════════════════════════════════
  function _wsResearch(el, p) {
    var h = '';
    var hasResearch = p.last_researched_at || (p.signals && p.signals.length > 0);

    // ── Action bar ──
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">';
    h += '<div><span style="font-size:14px;font-weight:700;color:#111;">Property Research</span>';
    if (p.last_researched_at) h += '<span style="font-size:10px;color:#9CA3AF;margin-left:8px;">Last updated: ' + D(p.last_researched_at) + '</span>';
    h += '</div>';
    h += '<button style="padding:6px 14px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;background:#B8860B;color:#fff;" onclick="SellerProspects._runResearch()"><i class="fas fa-sync-alt" style="margin-right:4px;"></i>' + (hasResearch ? 'Re-Run Research' : 'Run Research') + '</button>';
    h += '</div>';

    if (!hasResearch) {
      h += '<div style="text-align:center;padding:32px;background:#FAF9F6;border:2px dashed #D1D5DB;border-radius:12px;margin-bottom:16px;">';
      h += '<i class="fas fa-microscope" style="font-size:32px;color:#B8860B;margin-bottom:8px;display:block;"></i>';
      h += '<p style="font-size:14px;font-weight:700;color:#374151;margin-bottom:4px;">Research Not Yet Run</p>';
      h += '<p style="font-size:12px;color:#6B7280;margin-bottom:12px;">Click below to pull ACRIS ownership, DOF tax, and DOB building data.</p>';
      h += '<button class="btn btn-gold" onclick="SellerProspects._runResearch()"><i class="fas fa-play mr-1"></i>Run Research Now</button>';
      h += '</div>';
      el.innerHTML = h;
      return;
    }

    // ── Helper ──
    function row(label, value, color) {
      if (value === null || value === undefined || value === '') return '';
      return '<div style="display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;border-bottom:1px solid #F3F4F6;">' +
        '<span style="font-size:12px;color:#6B7280;">' + E(label) + '</span>' +
        '<span style="font-size:12px;font-weight:600;color:' + (color || '#111') + ';">' + E(String(value)) + '</span></div>';
    }
    function section(icon, title, color) {
      return '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin-bottom:12px;">' +
        '<div style="font-size:11px;font-weight:700;color:' + (color || '#B8860B') + ';text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">' +
        '<i class="fas ' + icon + '" style="margin-right:6px;"></i>' + E(title) + '</div>';
    }

    // ══════════════════════════════════════════════════════════════════
    // SECTION 1: ACRIS — Ownership & Financial Position
    // ══════════════════════════════════════════════════════════════════
    h += section('fa-file-contract', 'ACRIS — Ownership & Financial Position', '#3B82F6');

    h += row('Owner (deed)', p.owner_name);
    h += row('Owned Since', p.last_purchase_date ? D(p.last_purchase_date) + (p.ownership_years ? ' (' + p.ownership_years + ' years)' : '') : null);
    h += row('Original Purchase Price', p.last_purchase_price ? $(Number(p.last_purchase_price)) : null);
    h += row('Mortgage on Record', p.mortgage_amount ? $(Number(p.mortgage_amount)) : 'None recorded (cash purchase or paid off)');
    h += row('Mortgage Date', p.mortgage_date ? D(p.mortgage_date) : null);

    // Calculated: what they likely still owe vs what they paid
    if (p.last_purchase_price && p.mortgage_amount) {
      var purchase = Number(p.last_purchase_price);
      var mortgage = Number(p.mortgage_amount);
      var downPmt = purchase - mortgage;
      h += row('Down Payment (at purchase)', downPmt > 0 ? $(downPmt) + ' (' + Math.round(downPmt / purchase * 100) + '% down)' : null);
      // Rough equity estimate based on LTV
      if (p.equity_ratio != null) {
        var ltv = Number(p.equity_ratio);
        var estOwed = Math.round(purchase * ltv);
        var estEquity = purchase - estOwed;
        h += row('Est. Still Owed (LTV ' + Math.round(ltv * 100) + '%)', $(estOwed));
        h += row('Est. Equity in Property', $(estEquity));
      }
    } else if (p.last_purchase_price && !p.mortgage_amount) {
      h += row('Est. Equity in Property', $(Number(p.last_purchase_price)) + ' (no mortgage)');
    }

    // Full ACRIS transaction history (every deed, mortgage, refinance, satisfaction)
    var signals = p.signals || [];
    var txnSignal = signals.filter(function (s) { return s.signal_type === 'acris_transactions'; });
    var transactions = [];
    if (txnSignal.length > 0 && txnSignal[0].metadata && txnSignal[0].metadata.transactions) {
      transactions = txnSignal[0].metadata.transactions;
    }

    if (transactions.length > 0) {
      h += '<div style="margin-top:12px;font-size:11px;font-weight:700;color:#374151;margin-bottom:6px;">All Recorded Transactions (' + transactions.length + ')</div>';
      h += '<table style="width:100%;font-size:11px;border-collapse:collapse;">';
      h += '<tr style="background:#F9FAFB;"><th style="text-align:left;padding:5px 8px;border-bottom:1px solid #E5E7EB;">Type</th><th style="text-align:right;padding:5px 8px;border-bottom:1px solid #E5E7EB;">Amount</th><th style="text-align:right;padding:5px 8px;border-bottom:1px solid #E5E7EB;">Date</th></tr>';
      transactions.forEach(function (txn) {
        var typeLabel = txn.doc_type || '';
        if (typeLabel.indexOf('DEED') !== -1) typeLabel = 'Deed (Purchase/Transfer)';
        else if (typeLabel.indexOf('MTGE') !== -1 || typeLabel.indexOf('MORTGAGE') !== -1) typeLabel = 'Mortgage';
        else if (typeLabel === 'AGMT') typeLabel = 'Agreement';
        else if (typeLabel === 'ASST') typeLabel = 'Assignment';
        else if (typeLabel === 'SAT' || typeLabel === 'SATI') typeLabel = 'Satisfaction (mortgage paid off)';
        else if (typeLabel === 'RPTT' || typeLabel.indexOf('RPTT') !== -1) typeLabel = 'Transfer Tax (RPTT)';
        h += '<tr><td style="padding:4px 8px;border-bottom:1px solid #F3F4F6;">' + E(typeLabel) + '</td>' +
          '<td style="text-align:right;padding:4px 8px;border-bottom:1px solid #F3F4F6;font-weight:600;">' + (txn.amount ? $(Number(txn.amount)) : '-') + '</td>' +
          '<td style="text-align:right;padding:4px 8px;border-bottom:1px solid #F3F4F6;">' + (txn.date ? D(txn.date) : '-') + '</td></tr>';
      });
      h += '</table>';
    }

    if (p.bbl) {
      h += '<div style="margin-top:8px;"><a href="https://a836-acris.nyc.gov/DS/DocumentSearch/BBLResult?borough=' + p.bbl.charAt(0) + '&block=' + p.bbl.substring(1, 6) + '&lot=' + p.bbl.substring(6) + '" target="_blank" style="font-size:11px;color:#3B82F6;text-decoration:none;">Full ACRIS document history <i class="fas fa-external-link-alt" style="font-size:9px;"></i></a></div>';
    }
    h += '</div>';

    // ══════════════════════════════════════════════════════════════════
    // SECTION 2: DOF — Tax & Valuation
    // ══════════════════════════════════════════════════════════════════
    h += section('fa-dollar-sign', 'DOF — Property Tax & Valuation', '#059669');
    var pType = (p.property_type || '').toLowerCase();
    var isMaintOnly = pType === 'co-op' || pType === 'coop' || pType === 'condop';
    if (isMaintOnly) {
      h += '<div style="padding:10px;background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;margin-bottom:8px;">' +
        '<div style="font-size:12px;font-weight:600;color:#92400E;"><i class="fas fa-info-circle" style="margin-right:4px;"></i>Maintenance Only</div>' +
        '<div style="font-size:11px;color:#78350F;margin-top:2px;">' + E(p.property_type || 'Co-op') + 's pay maintenance (taxes bundled in). No individual property tax bill.</div>' +
      '</div>';
    } else {
      h += row('Tax Class', p.tax_class);
      h += row('Annual Property Tax', p.annual_tax ? $(Number(p.annual_tax)) + ' / year' : null);
      h += row('DOF Market Value', p.market_value ? $(Number(p.market_value)) : null);
      h += row('Assessed Value', p.assessed_value ? $(Number(p.assessed_value)) : null);
    }

    // Tax Lien History
    var lienSignal = signals.filter(function (s) { return s.signal_type === 'tax_lien_history'; });
    if (lienSignal.length > 0) {
      var lienData = lienSignal[0].metadata;
      var liens = (lienData && lienData.liens) || [];
      h += '<div style="margin-top:10px;padding:10px;background:#FFF7ED;border:1px solid #E5E7EB;border-radius:8px;">';
      h += '<div style="font-size:11px;font-weight:700;color:#111;margin-bottom:6px;">Tax Lien Sale Records: ' + liens.length + '</div>';
      liens.forEach(function (l) {
        h += '<div style="font-size:11px;color:#374151;margin-bottom:2px;">' +
          'Year: ' + E(String(l.year || '')) +
          (l.lien_type ? ' | Type: ' + E(String(l.lien_type)) : '') +
          (l.amount && l.amount !== 'Unknown' ? ' | Amount: ' + E(String(l.amount)) : '') +
          '</div>';
      });
      h += '</div>';
    } else if (p.last_researched_at) {
      h += row('Tax Lien Sale History', 'None found');
    }

    if (p.bbl) {
      h += '<div style="margin-top:8px;display:flex;gap:12px;">';
      h += '<a href="https://a836-pts-access.nyc.gov/care/search/commonsearch.aspx?mode=persprop" target="_blank" style="font-size:11px;color:#3B82F6;text-decoration:none;">Check current balance owed <i class="fas fa-external-link-alt" style="font-size:9px;"></i></a>';
      h += '</div>';
    }
    h += '</div>';

    // Links
    if (p.bbl) {
      h += '<div style="margin-top:8px;display:flex;gap:12px;">';
      h += '<a href="https://a836-pts-access.nyc.gov/care/search/commonsearch.aspx?mode=persprop" target="_blank" style="font-size:11px;color:#3B82F6;text-decoration:none;">Check current tax balance <i class="fas fa-external-link-alt" style="font-size:9px;"></i></a>';
      h += '<a href="https://www1.nyc.gov/site/finance/taxes/property-lien-sales.page" target="_blank" style="font-size:11px;color:#3B82F6;text-decoration:none;">DOF Lien Sale info <i class="fas fa-external-link-alt" style="font-size:9px;"></i></a>';
      h += '</div>';
    }
    h += '</div>';

    // ══════════════════════════════════════════════════════════════════
    // SECTION 3: DOB — Permits & Violations
    // ══════════════════════════════════════════════════════════════════
    h += section('fa-hard-hat', 'DOB — Permits & Violations', '#F59E0B');
    h += row('Open Violations', p.open_violations != null ? String(p.open_violations) : null);
    h += row('Recent Permits (3yr)', p.recent_permits != null ? String(p.recent_permits) : null);

    if (p.bbl) {
      var bin = p.bin || '';
      h += '<div style="margin-top:8px;"><a href="https://a810-bisweb.nyc.gov/bisweb/PropertyProfileOverviewServlet?boro=' + p.bbl.charAt(0) + '&block=' + p.bbl.substring(1, 6) + '&lot=' + p.bbl.substring(6) + '" target="_blank" style="font-size:11px;color:#3B82F6;text-decoration:none;">View DOB building profile <i class="fas fa-external-link-alt" style="font-size:9px;"></i></a></div>';
    }
    h += '</div>';

    // ══════════════════════════════════════════════════════════════════
    // SECTION 4: PLUTO — Building Data
    // ══════════════════════════════════════════════════════════════════
    h += section('fa-building', 'PLUTO — Building Details', '#8B5CF6');
    h += row('BBL', p.bbl);
    h += row('Year Built', p.year_built);
    h += row('Floors', p.floors);
    h += row('Total Units', p.units_total);
    h += row('Building Area', p.sqft ? p.sqft.toLocaleString() + ' sqft' : null);
    h += row('Lot Area', p.lot_area ? p.lot_area.toLocaleString() + ' sqft' : null);
    h += '</div>';

    // Readiness Score section removed — only real factual data shown

    el.innerHTML = h;
  }

  function _gradeColor(grade) {
    if (grade === 'A') return '#059669';
    if (grade === 'B') return '#3B82F6';
    if (grade === 'C') return '#F59E0B';
    if (grade === 'D') return '#F97316';
    return '#EF4444';
  }

  function _runResearch() {
    var p = _s.current;
    if (!p) return;
    CRM.toast('Running research...', 'info');
    MallanAPI._fetch('/api/crm/sales/prospects/' + p.id + '/research', { method: 'POST' })
      .then(function (data) {
        CRM.toast('Research complete', 'success');
        // Refresh the workspace
        openWorkspace(String(p.id));
      })
      .catch(function (err) { CRM.toast('Research failed: ' + (err.message || ''), 'error'); });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 3: PITCH PACKET
  // ═══════════════════════════════════════════════════════════════════════
  function _wsPitch(el, p) {
    if (typeof PitchPacket !== 'undefined' && PitchPacket.render) {
      PitchPacket.render(el, p);
    } else {
      el.innerHTML = '<div class="text-center py-12 bg-red-50 rounded-xl border border-red-200">' +
        '<i class="fas fa-exclamation-triangle text-3xl text-red-400 mb-3"></i>' +
        '<p class="text-sm font-semibold text-red-700">Pitch Packet module failed to load</p>' +
        '<p class="text-xs text-red-500 mt-1">Try refreshing the page. If the issue persists, contact support.</p>' +
      '</div>';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 4: OUTREACH
  // ═══════════════════════════════════════════════════════════════════════
  function _wsOutreach(el, p) {
    if (typeof OutreachCadence !== 'undefined' && OutreachCadence.render) {
      OutreachCadence.render(el, p);
    } else {
      el.innerHTML = '<div class="text-center py-12 bg-red-50 rounded-xl border border-red-200">' +
        '<i class="fas fa-exclamation-triangle text-3xl text-red-400 mb-3"></i>' +
        '<p class="text-sm font-semibold text-red-700">Outreach module failed to load</p>' +
        '<p class="text-xs text-red-500 mt-1">Try refreshing the page. If the issue persists, contact support.</p>' +
      '</div>';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 5: NOTES & ACTIVITY
  // ═══════════════════════════════════════════════════════════════════════
  function _wsNotes(el, p) {
    var h = '<div class="space-y-4">';

    // ── Add Note ──
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-3"><i class="fas fa-sticky-note text-gold mr-2"></i>Add Note</h3>';
    h += '<textarea id="sp-new-note" class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" rows="3" placeholder="Add a note about this prospect..."></textarea>';
    h += '<div class="flex justify-end mt-2"><button class="btn btn-sm btn-gold" onclick="SellerProspects._saveNote()"><i class="fas fa-save mr-1"></i>Save Note</button></div>';
    h += '</div>';

    // ── Existing Notes ──
    if (p.notes) {
      h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
      h += '<h3 class="text-sm font-bold text-gray-900 mb-3"><i class="fas fa-book text-gray-500 mr-2"></i>Notes</h3>';
      h += '<div class="text-sm text-gray-700 whitespace-pre-wrap">' + E(p.notes) + '</div>';
      h += '</div>';
    }

    // ── Outreach Events Timeline ──
    var events = p.outreach_events || [];
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-3"><i class="fas fa-stream text-gray-500 mr-2"></i>Activity Timeline (' + events.length + ')</h3>';
    if (events.length === 0) {
      h += '<p class="text-xs text-gray-400 italic">No activity recorded yet.</p>';
    } else {
      h += '<div class="space-y-3">';
      events.forEach(function (ev) {
        var icon = ev.channel === 'email' ? 'fa-envelope' : ev.channel === 'sms' ? 'fa-comment' : ev.channel === 'call' ? 'fa-phone' : ev.channel === 'mail' ? 'fa-mail-bulk' : 'fa-dot-circle';
        var color = ev.channel === 'email' ? '#3B82F6' : ev.channel === 'sms' ? '#059669' : ev.channel === 'call' ? '#F59E0B' : '#6B7280';
        h += '<div class="flex gap-3">';
        h += '<div style="width:28px;height:28px;border-radius:50%;background:' + color + '15;color:' + color + ';display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;"><i class="fas ' + icon + '"></i></div>';
        h += '<div class="flex-1 min-w-0">';
        h += '<div class="flex items-center gap-2">';
        h += '<span class="text-xs font-bold text-gray-900">' + E(ev.event_type || ev.type || '-') + '</span>';
        h += '<span class="text-[10px] text-gray-400">' + (ev.created_at ? _ago(ev.created_at) : '') + '</span>';
        h += '</div>';
        if (ev.subject) h += '<div class="text-xs text-gray-600">' + E(ev.subject) + '</div>';
        if (ev.notes) h += '<div class="text-xs text-gray-500 mt-0.5">' + E(ev.notes) + '</div>';
        if (ev.outcome) h += '<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-600">' + E(ev.outcome) + '</span>';
        h += '</div></div>';
      });
      h += '</div>';
    }
    h += '</div>';

    h += '</div>';
    el.innerHTML = h;
  }

  function _saveNote() {
    var p = _s.current;
    if (!p) return;
    var textarea = document.getElementById('sp-new-note');
    if (!textarea || !textarea.value.trim()) { CRM.toast('Please enter a note', 'info'); return; }

    var newNote = textarea.value.trim();
    var existing = p.notes || '';
    var combined = existing ? (existing + '\n\n---\n' + new Date().toLocaleDateString() + ':\n' + newNote) : newNote;

    MallanAPI._fetch('/api/crm/sales/prospects/' + p.id, {
      method: 'PUT',
      body: JSON.stringify({ notes: combined }),
    }).then(function () {
      CRM.toast('Note saved', 'success');
      p.notes = combined;
      _s.tab = 'notes';
      openWorkspace(String(p.id));
    }).catch(function (err) { CRM.toast('Failed to save: ' + (err.message || ''), 'error'); });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WORKSPACE ACTIONS
  // ═══════════════════════════════════════════════════════════════════════
  function _updateStatus(newStatus) {
    var p = _s.current;
    if (!p) return;
    MallanAPI._fetch('/api/crm/sales/prospects/' + p.id, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus }),
    }).then(function () {
      CRM.toast('Status updated', 'success');
      p.status = newStatus;
    }).catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  function _convert() {
    var p = _s.current;
    if (!p) return;
    if (!confirm('Convert "' + (p.address || '') + '" to an Active Seller? This will create a client record and mark this prospect as converted.')) return;

    MallanAPI._fetch('/api/crm/sales/prospects/' + p.id + '/convert', { method: 'POST' })
      .then(function (data) {
        CRM.toast('Converted to Active Seller', 'success');
        Router.navigate('/sales/sellers');
      })
      .catch(function (err) { CRM.toast('Convert failed: ' + (err.message || ''), 'error'); });
  }

  function _editProspect() {
    var p = _s.current;
    if (!p) return;

    var boroughOpts = '<option value="">Select Borough</option>';
    BOROUGHS.forEach(function (b) { boroughOpts += '<option value="' + E(b.value) + '"' + (String(p.borough) === b.value ? ' selected' : '') + '>' + E(b.label) + '</option>'; });

    var body =
      '<form id="editProspectForm" class="space-y-3">' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Address</label>' +
          '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" name="address" value="' + E(p.address || '') + '"></div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Unit</label>' +
            '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" name="unit" value="' + E(p.unit || '') + '"></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Borough</label>' +
            '<select class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" name="borough">' + boroughOpts + '</select></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Owner Name</label>' +
            '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" name="owner_name" value="' + E(p.owner_name || '') + '"></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Owner Email</label>' +
            '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" type="email" name="owner_email" value="' + E(p.owner_email || '') + '"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Owner Phone</label>' +
            '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" type="tel" name="owner_phone" value="' + E(p.owner_phone || '') + '"></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Property Type</label>' +
            '<select class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" name="property_type">' +
              '<option value="">—</option>' +
              '<option value="Condo"' + (p.property_type === 'Condo' ? ' selected' : '') + '>Condo</option>' +
              '<option value="Co-op"' + (p.property_type === 'Co-op' ? ' selected' : '') + '>Co-op</option>' +
              '<option value="Condop"' + (p.property_type === 'Condop' ? ' selected' : '') + '>Condop</option>' +
              '<option value="Townhouse"' + (p.property_type === 'Townhouse' ? ' selected' : '') + '>Townhouse</option>' +
              '<option value="Single Family"' + (p.property_type === 'Single Family' ? ' selected' : '') + '>Single Family</option>' +
              '<option value="Multi Family"' + (p.property_type === 'Multi Family' ? ' selected' : '') + '>Multi Family</option>' +
              '<option value="Commercial Condo"' + (p.property_type === 'Commercial Condo' ? ' selected' : '') + '>Commercial Condo</option>' +
              '<option value="Mixed Use"' + (p.property_type === 'Mixed Use' ? ' selected' : '') + '>Mixed Use</option>' +
            '</select></div>' +
        '</div>' +
        '<div class="grid grid-cols-3 gap-3">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Beds</label>' +
            '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" type="number" name="beds" value="' + E(p.beds || '') + '"></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Baths</label>' +
            '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" type="number" step="0.5" name="baths" value="' + E(p.baths || '') + '"></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Sq Ft</label>' +
            '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" type="number" name="sqft" value="' + E(p.sqft || '') + '"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Entity Type</label>' +
            '<select class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" name="entity_type">' +
              '<option value="">None</option>' +
              '<option value="LLC"' + (p.entity_type === 'LLC' ? ' selected' : '') + '>LLC</option>' +
              '<option value="Trust"' + (p.entity_type === 'Trust' ? ' selected' : '') + '>Trust</option>' +
              '<option value="Corp"' + (p.entity_type === 'Corp' ? ' selected' : '') + '>Corporation</option>' +
              '<option value="Partnership"' + (p.entity_type === 'Partnership' ? ' selected' : '') + '>Partnership</option>' +
              '<option value="Estate"' + (p.entity_type === 'Estate' ? ' selected' : '') + '>Estate</option>' +
            '</select></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Entity Name</label>' +
            '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" name="entity_name" value="' + E(p.entity_name || '') + '"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Building Name</label>' +
            '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" name="building_name" value="' + E(p.building_name || '') + '"></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Management Company</label>' +
            '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" name="management_company" value="' + E(p.management_company || '') + '"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Secondary Name</label>' +
            '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" name="secondary_name" value="' + E(p.secondary_name || '') + '"></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Secondary Phone</label>' +
            '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" type="tel" name="secondary_phone" value="' + E(p.secondary_phone || '') + '"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Secondary Email</label>' +
            '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" type="email" name="secondary_email" value="' + E(p.secondary_email || '') + '"></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Relationship</label>' +
            '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" name="secondary_relationship" value="' + E(p.secondary_relationship || '') + '"></div>' +
        '</div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Next Follow-Up</label>' +
          '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" type="date" name="next_follow_up" value="' + E(_dateInputVal(p.next_follow_up)) + '"></div>' +
      '</form>';

    CRM.openModal('Edit Prospect', body, {
      size: 'lg',
      footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
        '<button class="btn btn-gold" onclick="SellerProspects._submitEdit()"><i class="fas fa-save mr-1"></i>Save</button>',
    });
  }

  function _dateInputVal(d) {
    if (!d) return '';
    try {
      var dt = new Date(d);
      return dt.toISOString().split('T')[0];
    } catch (e) { return ''; }
  }

  function _submitEdit() {
    var p = _s.current;
    if (!p) return;
    var form = document.getElementById('editProspectForm');
    if (!form) return;
    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = v; });

    // Convert numeric fields
    ['beds', 'baths', 'sqft'].forEach(function (k) {
      if (data[k]) data[k] = Number(data[k]) || undefined;
      else delete data[k];
    });

    MallanAPI._fetch('/api/crm/sales/prospects/' + p.id, {
      method: 'PUT',
      body: JSON.stringify(data),
    }).then(function () {
      CRM.toast('Prospect updated', 'success');
      CRM.closeModal();
      openWorkspace(String(p.id));
    }).catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  function _deleteProspect() {
    var p = _s.current;
    if (!p) return;
    if (!confirm('Delete this prospect? This cannot be undone.')) return;
    MallanAPI._fetch('/api/crm/sales/prospects/' + p.id, { method: 'DELETE' })
      .then(function () { CRM.toast('Prospect deleted', 'success'); Router.navigate('/sales/prospects'); })
      .catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════
  return {
    render: render,
    openWorkspace: openWorkspace,
    _search: _search,
    _filter: _filter,
    _filterType: _filterType,
    _sort: _sort,
    _page: _page,
    _newProspect: _newProspect,
    _submitNew: _submitNew,
    _toggleEntity: _toggleEntity,
    _toggleOwnership: _toggleOwnership,
    _addSignatory: _addSignatory,
    _addParty: _addParty,
    _autoLookup: _autoLookup,
    _importModal: _importModal,
    _importPreview: _importPreview,
    _importConfirm: _importConfirm,
    _triggerResearch: _triggerResearch,
    _quickSend: _quickSend,
    _quickConvert: _quickConvert,
    _wsTab: _wsTab,
    _updateStatus: _updateStatus,
    _convert: _convert,
    _editProspect: _editProspect,
    _submitEdit: _submitEdit,
    _deleteProspect: _deleteProspect,
    _saveNote: _saveNote,
    _runResearch: _runResearch,
  };
})();
