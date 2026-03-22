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

  // ─── Subnav (mirrors SalesCRM tab bar) ──────────────────────────────
  var TABS = [
    { id: 'prospects', route: '/sales/prospects', label: 'Seller Prospects', icon: 'fa-crosshairs' },
    { id: 'sellers', route: '/sales/sellers', label: 'Active Sellers', icon: 'fa-home' },
    { id: 'buyers', route: '/sales/buyers', label: 'Active Buyers', icon: 'fa-user-tag' },
    { id: 'landlord-sellers', route: '/sales/landlord-sellers', label: 'Landlord Sellers', icon: 'fa-exchange-alt' },
    { id: 'listings', route: '/sales/listings', label: 'Listings', icon: 'fa-building' },
    { id: 'marketing', route: '/sales/marketing', label: 'Marketing', icon: 'fa-bullhorn' },
    { id: 'activity', route: '/sales/activity', label: 'Activity', icon: 'fa-stream' },
    { id: 'automation', route: '/sales/automation', label: 'Automation', icon: 'fa-robot' },
  ];

  function _subnav(activeId) {
    var h = '<div class="flex gap-1 overflow-x-auto border-b border-gray-200 mb-4 pb-px">';
    TABS.forEach(function (t) {
      h += '<button class="px-3 py-2 text-xs font-semibold whitespace-nowrap rounded-t-lg ' +
        (t.id === activeId ? 'text-gold border-b-2 border-gold bg-gold/5' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50') +
        '" onclick="Router.navigate(\'' + t.route + '\')">' +
        '<i class="fas ' + t.icon + ' mr-1"></i>' + E(t.label) + '</button>';
    });
    return h + '</div>';
  }

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
    CRM.setPanelTitle('Sales CRM');
    var c = CRM.getContent();
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

    return MallanAPI._fetch('/api/crm/sales/prospects' + qs).then(function (data) {
      _s.data = data.prospects || [];
      _s.total = data.total || _s.data.length;
    });
  }

  function _renderTable(c) {
    var rows = _s.data.slice();
    rows = ActivityTable.sortRows(rows, _s.sort.key, _s.sort.dir);

    var total = _s.total;
    var hot = _s.data.filter(function (r) { return r.readiness_grade === 'A' || r.readiness_grade === 'B'; }).length;
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

    var h = _subnav('prospects');
    h += _kpi([
      { icon: 'fa-crosshairs', label: 'Total Prospects', value: total, fg: '#3B82F6', bg: '#EFF6FF' },
      { icon: 'fa-fire', label: 'Hot Prospects', value: hot, fg: '#EF4444', bg: '#FEF2F2' },
      { icon: 'fa-clock', label: 'Follow-Up Due', value: followUpDue, fg: '#F59E0B', bg: '#FFFBEB' },
      { icon: 'fa-check-circle', label: 'Converted (Month)', value: convertedMonth, fg: '#059669', bg: '#ECFDF5' },
    ]);

    h += FilterBar.render({
      id: 'prospects',
      placeholder: 'Search by address, owner name, email...',
      onSearch: 'SellerProspects._search',
      filters: [
        { key: 'status', label: 'Status', options: Object.keys(STATUSES).map(function (k) { return { value: k, label: STATUSES[k].label }; }), active: _s.filter.status },
        { key: 'source', label: 'Source', options: SOURCES, active: _s.filter.source },
      ],
      onFilter: 'SellerProspects._filter',
      quickActions: [
        { label: 'Add Prospect', icon: 'fa-plus', onclick: 'SellerProspects._newProspect()' },
        { label: 'Import', icon: 'fa-file-import', onclick: 'SellerProspects._importModal()', cls: 'btn btn-sm btn-outline' },
      ],
    });

    h += ActivityTable.render({
      id: 'prospects_tbl',
      columns: [
        { key: 'address', label: 'Address', render: function (r) {
          var addr = E(r.address || '-');
          var unit = r.unit ? ' <span class="text-xs text-gray-400">#' + E(r.unit) + '</span>' : '';
          return '<div class="font-semibold text-gray-900">' + addr + unit + '</div>';
        }},
        { key: 'owner_name', label: 'Owner', render: function (r) {
          var name = E(r.owner_name || '-');
          var entity = r.entity_name ? '<div class="text-[10px] text-purple-600 font-bold mt-0.5">' + E(r.entity_type || 'Entity') + ': ' + E(r.entity_name) + '</div>' : '';
          return '<div>' + name + entity + '</div>';
        }},
        { key: 'status', label: 'Status', render: function (r) { return _statusBadge(r.status); } },
        { key: 'readiness_score', label: 'Score', render: function (r) { return _gradeBadge(r.readiness_grade, r.readiness_score); } },
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
  // ─── Ownership type options ───────────────────────────────────────────
  var ENTITY_TYPES = [
    { value: '', label: 'Individual (Person)' },
    { value: 'couple', label: 'Couple / Partners' },
    { value: 'family', label: 'Family Members' },
    { value: 'llc', label: 'LLC' },
    { value: 'trust', label: 'Trust' },
    { value: 'inc', label: 'Inc / Corporation' },
    { value: 'corp', label: 'Corp' },
    { value: 'llp', label: 'LLP / Partnership' },
    { value: 'lp', label: 'LP (Limited Partnership)' },
    { value: 'estate', label: 'Estate' },
  ];

  var _newParties = []; // additional parties beyond primary owner

  function _newProspect() {
    _newParties = [];
    var boroughOpts = '<option value="">Select Borough</option>';
    BOROUGHS.forEach(function (b) { boroughOpts += '<option value="' + E(b.value) + '">' + E(b.label) + '</option>'; });
    var sourceOpts = '<option value="manual">Manual</option>';
    SOURCES.forEach(function (s) { if (s.value !== 'manual') sourceOpts += '<option value="' + E(s.value) + '">' + E(s.label) + '</option>'; });
    var entityOpts = '';
    ENTITY_TYPES.forEach(function (t) { entityOpts += '<option value="' + E(t.value) + '">' + E(t.label) + '</option>'; });

    var inp = 'style="width:100%;font-size:13px;padding:8px 12px;border:1px solid #D1D5DB;border-radius:6px;"';
    var lbl = 'style="display:block;font-size:11px;font-weight:600;color:#374151;margin-bottom:3px;"';

    var body =
      '<form id="newProspectForm">' +
        // ── PROPERTY ──
        '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #E5E7EB;">Property</div>' +
        '<div style="margin-bottom:10px;"><label ' + lbl + '>Address *</label>' +
          '<input ' + inp + ' name="address" required placeholder="400 East 90th Street"></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">' +
          '<div><label ' + lbl + '>Unit / Apt</label><input ' + inp + ' name="unit" placeholder="17C"></div>' +
          '<div><label ' + lbl + '>Borough</label><select ' + inp + ' name="borough">' + boroughOpts + '</select></div>' +
        '</div>' +

        // ── OWNERSHIP ──
        '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px;padding-bottom:4px;border-bottom:1px solid #E5E7EB;">Ownership</div>' +
        '<div style="margin-bottom:10px;"><label ' + lbl + '>Ownership Type</label>' +
          '<select ' + inp + ' name="entity_type" onchange="SellerProspects._toggleEntity(this.value)">' + entityOpts + '</select></div>' +
        '<div id="entityFields" style="display:none;margin-bottom:10px;">' +
          '<label ' + lbl + '>Entity Name (LLC, Trust, Corp name)</label>' +
          '<input ' + inp + ' name="entity_name" placeholder="Smith Family Trust LLC">' +
        '</div>' +

        // ── PRIMARY CONTACT ──
        '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px;padding-bottom:4px;border-bottom:1px solid #E5E7EB;">Primary Contact</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">' +
          '<div><label ' + lbl + '>Name</label><input ' + inp + ' name="owner_name" placeholder="John Smith"></div>' +
          '<div><label ' + lbl + '>Phone</label><input ' + inp + ' name="owner_phone" type="tel" placeholder="212-555-1234"></div>' +
        '</div>' +
        '<div style="margin-bottom:10px;"><label ' + lbl + '>Email</label>' +
          '<input ' + inp + ' name="owner_email" type="email" placeholder="john@example.com"></div>' +

        // ── SECONDARY / PARTNER ──
        '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px;padding-bottom:4px;border-bottom:1px solid #E5E7EB;">' +
          'Second Person (Spouse, Partner, Co-Owner)' +
          '<span style="font-weight:400;color:#9CA3AF;font-size:10px;margin-left:8px;">Optional</span></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">' +
          '<div><label ' + lbl + '>Name</label><input ' + inp + ' name="secondary_name" placeholder="Jane Smith"></div>' +
          '<div><label ' + lbl + '>Relationship</label>' +
            '<select ' + inp + ' name="secondary_relationship">' +
              '<option value="">—</option><option value="spouse">Spouse</option><option value="partner">Partner</option>' +
              '<option value="co-owner">Co-Owner</option><option value="parent">Parent</option><option value="child">Adult Child</option>' +
              '<option value="sibling">Sibling</option><option value="trustee">Trustee</option><option value="executor">Executor</option>' +
              '<option value="managing_member">Managing Member</option><option value="officer">Officer / Director</option>' +
            '</select></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">' +
          '<div><label ' + lbl + '>Email</label><input ' + inp + ' name="secondary_email" type="email"></div>' +
          '<div><label ' + lbl + '>Phone</label><input ' + inp + ' name="secondary_phone" type="tel"></div>' +
        '</div>' +

        // ── SIGNATORIES (for entities) ──
        '<div id="signatorySection" style="display:none;">' +
          '<div style="font-size:11px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:1px;margin:16px 0 8px;padding-bottom:4px;border-bottom:1px solid #E5E7EB;">' +
            'Authorized Signatories' +
            '<button type="button" style="float:right;font-size:11px;color:#B8860B;background:none;border:none;cursor:pointer;" onclick="SellerProspects._addSignatory()">+ Add Signatory</button>' +
          '</div>' +
          '<div id="signatoryList"></div>' +
        '</div>' +

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
  }

  function _toggleEntity(val) {
    var ef = document.getElementById('entityFields');
    var sf = document.getElementById('signatorySection');
    var isEntity = val && val !== '' && val !== 'couple' && val !== 'family';
    if (ef) ef.style.display = isEntity ? 'block' : 'none';
    if (sf) sf.style.display = isEntity ? 'block' : 'none';
  }

  function _addSignatory() {
    var list = document.getElementById('signatoryList');
    if (!list) return;
    var idx = list.children.length;
    var inp = 'style="width:100%;font-size:12px;padding:6px 8px;border:1px solid #D1D5DB;border-radius:4px;"';
    list.insertAdjacentHTML('beforeend',
      '<div style="display:grid;grid-template-columns:2fr 2fr 1fr auto;gap:6px;margin-bottom:6px;align-items:end;" data-sig="' + idx + '">' +
        '<div><label style="font-size:10px;color:#6B7280;">Name</label><input ' + inp + ' name="sig_name_' + idx + '" placeholder="Name"></div>' +
        '<div><label style="font-size:10px;color:#6B7280;">Title</label><input ' + inp + ' name="sig_title_' + idx + '" placeholder="Managing Member, Trustee..."></div>' +
        '<div><label style="font-size:10px;color:#6B7280;">Phone</label><input ' + inp + ' name="sig_phone_' + idx + '" type="tel"></div>' +
        '<button type="button" style="font-size:14px;color:#EF4444;background:none;border:none;cursor:pointer;padding:6px;" onclick="this.parentNode.remove()">&times;</button>' +
      '</div>'
    );
  }

  function _submitNew() {
    var form = document.getElementById('newProspectForm');
    if (!form) return;
    if (!form.checkValidity()) { form.reportValidity(); return; }

    var data = {};
    new FormData(form).forEach(function (v, k) {
      if (v && !k.startsWith('sig_')) data[k] = v;
    });

    // Collect signatories
    var sigs = [];
    var sigList = document.getElementById('signatoryList');
    if (sigList) {
      var sigDivs = sigList.querySelectorAll('[data-sig]');
      sigDivs.forEach(function (div) {
        var idx = div.getAttribute('data-sig');
        var name = form.querySelector('[name="sig_name_' + idx + '"]');
        var title = form.querySelector('[name="sig_title_' + idx + '"]');
        var phone = form.querySelector('[name="sig_phone_' + idx + '"]');
        if (name && name.value.trim()) {
          sigs.push({
            name: name.value.trim(),
            title: title ? title.value.trim() : '',
            phone: phone ? phone.value.trim() : '',
          });
        }
      });
    }
    if (sigs.length > 0) data.authorized_signatories = sigs;

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
    var c = CRM.getContent();
    CRM.setPanelTitle('Sales CRM');
    c.innerHTML = '<div class="flex items-center justify-center h-40"><i class="fas fa-spinner fa-spin text-2xl text-gold"></i></div>';

    MallanAPI._fetch('/api/crm/sales/prospects/' + id)
      .then(function (data) {
        _s.current = data.prospect || data;
        _renderWorkspace(c);
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

    // ── Header ──
    var h = '<div class="mb-4">';
    h += '<button class="text-sm text-gray-500 hover:text-gray-700 mb-3" onclick="Router.navigate(\'/sales/prospects\')"><i class="fas fa-arrow-left mr-1"></i>Back to Seller Prospects</button>';
    h += '<div class="flex items-start justify-between flex-wrap gap-4">';

    // Left: prospect info
    h += '<div class="flex items-center gap-4">';
    h += '<div style="width:48px;height:48px;border-radius:50%;background:#B8860B20;color:#B8860B;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;"><i class="fas fa-crosshairs"></i></div>';
    h += '<div>';
    h += '<h2 class="text-xl font-bold text-gray-900">' + E(p.address || 'Unknown Address') + (p.unit ? ' <span class="text-base font-normal text-gray-500">#' + E(p.unit) + '</span>' : '') + '</h2>';
    h += '<div class="flex items-center gap-2 mt-1">' + _statusBadge(p.status) + ' ' + _gradeBadge(p.readiness_grade, p.readiness_score);
    if (p.entity_name) h += '<span class="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-bold">' + E(p.entity_type || 'Entity') + ': ' + E(p.entity_name) + '</span>';
    h += '</div>';
    h += '<div class="flex gap-3 mt-1 text-xs text-gray-500">';
    if (p.owner_name) h += '<span><i class="fas fa-user mr-1"></i>' + E(p.owner_name) + '</span>';
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
    h += '</div></div>';

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

    // Readiness display
    h += '<div class="flex items-center gap-3 mb-3">';
    h += '<div style="width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;' + _gradeStyle(p.readiness_grade) + '">' + E(p.readiness_grade || '-') + '</div>';
    h += '<div><div class="text-sm font-bold">Readiness Score</div><div class="text-2xl font-extrabold text-gray-900">' + (typeof p.readiness_score === 'number' ? p.readiness_score : '-') + '<span class="text-xs text-gray-400 font-normal"> / 100</span></div></div>';
    h += '</div>';

    // Signal breakdown
    if (p.signals && p.signals.length > 0) {
      h += '<div class="border-t border-gray-100 pt-3 mt-3">';
      h += '<span class="text-xs font-semibold text-gray-700">Signal Breakdown</span>';
      h += '<div class="mt-2 space-y-1">';
      p.signals.slice(0, 8).forEach(function (sig) {
        var pct = typeof sig.score === 'number' ? Math.min(100, Math.max(0, sig.score)) : 0;
        h += '<div class="flex items-center gap-2">';
        h += '<span class="text-[10px] text-gray-500 w-24 truncate">' + E(sig.signal_type || '-') + '</span>';
        h += '<div style="flex:1;height:6px;background:#F3F4F6;border-radius:3px;overflow:hidden;"><div style="width:' + pct + '%;height:100%;background:#B8860B;border-radius:3px;"></div></div>';
        h += '<span class="text-[10px] font-bold text-gray-700 w-8 text-right">' + pct + '</span>';
        h += '</div>';
      });
      h += '</div></div>';
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
    var h = '<div class="space-y-4">';

    // Action bar
    h += '<div class="flex items-center justify-between">';
    h += '<h3 class="text-sm font-bold text-gray-900"><i class="fas fa-database text-blue-500 mr-2"></i>Research Data</h3>';
    h += '<button class="btn btn-sm btn-gold" onclick="SellerProspects._runResearch()"><i class="fas fa-sync-alt mr-1"></i>Run Research</button>';
    h += '</div>';

    var signals = p.signals || [];
    if (signals.length === 0) {
      h += '<div class="text-center py-12 bg-gray-50 rounded-xl">';
      h += '<i class="fas fa-database text-3xl text-gray-300 mb-3"></i>';
      h += '<p class="text-sm text-gray-500">No research data yet. Click "Run Research" to pull ACRIS, DOB, DOF, and PLUTO records.</p>';
      h += '</div>';
    } else {
      // Group signals by type
      var groups = {};
      signals.forEach(function (sig) {
        var cat = _signalCategory(sig.signal_type);
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(sig);
      });

      var catIcons = {
        'ACRIS': 'fa-file-contract',
        'DOF': 'fa-dollar-sign',
        'DOB': 'fa-hard-hat',
        'Building': 'fa-building',
        'Market': 'fa-chart-area',
        'Other': 'fa-info-circle',
      };

      Object.keys(groups).forEach(function (cat) {
        h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
        h += '<h4 class="text-xs font-bold text-gray-900 mb-3"><i class="fas ' + (catIcons[cat] || 'fa-info-circle') + ' mr-2 text-blue-500"></i>' + E(cat) + '</h4>';
        h += '<div class="space-y-2">';
        groups[cat].forEach(function (sig) {
          var val = sig.data_value;
          if (typeof val === 'object' && val !== null) {
            // Render key-value pairs from JSON
            h += '<div class="text-xs"><span class="font-semibold text-gray-700">' + E(sig.signal_type) + '</span>';
            h += '<div class="ml-3 mt-1 space-y-0.5">';
            Object.keys(val).forEach(function (k) {
              h += '<div class="flex justify-between"><span class="text-gray-500">' + E(k) + '</span><span class="text-gray-900 font-medium">' + E(String(val[k] || '-')) + '</span></div>';
            });
            h += '</div></div>';
          } else {
            h += '<div class="flex justify-between items-baseline">';
            h += '<span class="text-xs font-semibold text-gray-500">' + E(sig.signal_type) + '</span>';
            h += '<span class="text-xs text-gray-900 font-medium">' + E(String(val || sig.score || '-')) + '</span>';
            h += '</div>';
          }
        });
        h += '</div></div>';
      });
    }

    h += '</div>';
    el.innerHTML = h;
  }

  function _signalCategory(type) {
    if (!type) return 'Other';
    var t = type.toLowerCase();
    if (t.indexOf('acris') !== -1 || t.indexOf('ownership') !== -1 || t.indexOf('mortgage') !== -1 || t.indexOf('equity') !== -1 || t.indexOf('purchase') !== -1) return 'ACRIS';
    if (t.indexOf('dof') !== -1 || t.indexOf('tax') !== -1 || t.indexOf('assessed') !== -1 || t.indexOf('market_value') !== -1) return 'DOF';
    if (t.indexOf('dob') !== -1 || t.indexOf('permit') !== -1 || t.indexOf('violation') !== -1 || t.indexOf('building_risk') !== -1) return 'DOB';
    if (t.indexOf('building') !== -1 || t.indexOf('pluto') !== -1) return 'Building';
    if (t.indexOf('market') !== -1 || t.indexOf('comp') !== -1 || t.indexOf('price') !== -1) return 'Market';
    return 'Other';
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
  // TAB 3: PITCH PACKET (placeholder for Task 10)
  // ═══════════════════════════════════════════════════════════════════════
  function _wsPitch(el, p) {
    if (typeof PitchPacket !== 'undefined' && PitchPacket.render) {
      PitchPacket.render(el, p);
    } else {
      el.innerHTML = '<div class="text-center py-12 bg-gray-50 rounded-xl">' +
        '<i class="fas fa-file-powerpoint text-3xl text-gray-300 mb-3"></i>' +
        '<p class="text-sm font-semibold text-gray-700">Pitch Packet Builder</p>' +
        '<p class="text-xs text-gray-500 mt-1">Coming in next update</p>' +
      '</div>';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB 4: OUTREACH (placeholder for Task 11)
  // ═══════════════════════════════════════════════════════════════════════
  function _wsOutreach(el, p) {
    if (typeof OutreachCadence !== 'undefined' && OutreachCadence.render) {
      OutreachCadence.render(el, p);
    } else {
      el.innerHTML = '<div class="text-center py-12 bg-gray-50 rounded-xl">' +
        '<i class="fas fa-paper-plane text-3xl text-gray-300 mb-3"></i>' +
        '<p class="text-sm font-semibold text-gray-700">Outreach Cadence</p>' +
        '<p class="text-xs text-gray-500 mt-1">Coming in next update</p>' +
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
            '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" name="property_type" value="' + E(p.property_type || '') + '"></div>' +
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
    _sort: _sort,
    _page: _page,
    _newProspect: _newProspect,
    _submitNew: _submitNew,
    _toggleEntity: _toggleEntity,
    _addSignatory: _addSignatory,
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
