// ═══════════════════════════════════════════════════════════════════════════════
// LANDLORD WORKSPACE — Full workspace renderer for Landlord Prospects + Active Landlords
// Prospect mode: outreach, vacancy cost, comps, convert-to-listing flow
// Active mode: rental listing backend with tabbed subviews
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, Router, Store, UI, Utils, MallanAPI, Workspace, ClientNormalizer, Documents, Events */

var LandlordWorkspace = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  // ─── Internal state ─────────────────────────────────────────────────
  var _client = null;
  var _clientId = null;
  var _activeTab = 'overview';

  // ─── Card helper ────────────────────────────────────────────────────
  function _card(icon, title, editFn, bodyHtml, borderColor) {
    var borderCls = borderColor ? ' border-l-4' : '';
    var borderStyle = borderColor ? ' style="border-left-color:' + borderColor + '"' : '';
    return '<div class="border rounded-xl bg-white shadow-sm overflow-hidden' + borderCls + '"' + borderStyle + '>' +
      '<div class="flex items-center justify-between px-4 py-3 border-b bg-gray-50">' +
        '<h3 class="text-sm font-bold text-gray-700"><i class="fas fa-' + icon + ' mr-2 text-gray-400"></i>' + title + '</h3>' +
        (editFn ? '<button class="text-xs text-gray-500 hover:text-gray-800 font-medium" onclick="' + editFn + '"><i class="fas fa-pen mr-1"></i>Edit</button>' : '') +
      '</div>' +
      '<div class="px-4 py-3">' + bodyHtml + '</div>' +
    '</div>';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PROSPECT MODE — Full workspace for landlord prospects
  // ═══════════════════════════════════════════════════════════════════════

  function renderProspect(client, container, clientId) {
    _client = client;
    _clientId = clientId;
    var cl = ClientNormalizer.normalize(client);
    var name = cl.name || cl.email || 'Landlord Prospect';
    var displayName = cl._displayName || ClientNormalizer.displayName(cl);
    var hasSecondary = cl.secondary_first_name || cl.secondary_last_name;
    var secondaryName = hasSecondary ? ((cl.secondary_first_name || '') + ' ' + (cl.secondary_last_name || '')).trim() : '';

    var html = '<div class="space-y-0">';

    // ── Back nav ──
    html += '<div class="flex items-center gap-2 mb-2">' +
      '<button class="text-sm text-gray-500 hover:text-gray-700" onclick="Router.navigate(\'/rentals/landlord-prospects\')"><i class="fas fa-arrow-left mr-1"></i> Landlord Prospects</button>' +
    '</div>';

    // ── Header ──
    html += '<div class="workspace-header">' +
      '<div class="flex items-center justify-between">' +
        '<div class="flex items-center gap-4">' +
          UI.avatar(name, 48) +
          '<div>' +
            '<h2 class="text-xl font-bold text-gray-900">' + E(displayName) + '</h2>' +
            '<div class="flex items-center gap-2 mt-1">' +
              '<span class="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-bold">Landlord Prospect</span>' +
              (cl.entity_name ? '<span class="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-bold">' + E(cl.entity_type || 'Entity') + '</span>' : '') +
              (hasSecondary ? '<span class="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">' + E(cl.secondary_relationship || 'partner') + '</span>' : '') +
            '</div>' +
          '</div>' +
          (hasSecondary ? UI.avatar(secondaryName, 40) : '') +
        '</div>' +
        '<div class="flex gap-2">' +
          '<button class="btn btn-sm btn-outline" onclick="Workspace.editClient()"><i class="fas fa-edit"></i> Edit</button>' +
        '</div>' +
      '</div>' +
      '<div class="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">' +
        (cl.email ? '<span><i class="fas fa-envelope mr-1"></i>' + E(cl.email) + '</span>' : '') +
        (cl.phone ? '<span><i class="fas fa-phone mr-1"></i>' + E(cl.phone) + '</span>' : '') +
        (hasSecondary && cl.secondary_email ? '<span class="text-gray-400">|</span><span><i class="fas fa-envelope mr-1"></i>' + E(cl.secondary_email) + '</span>' : '') +
        (hasSecondary && cl.secondary_phone ? '<span><i class="fas fa-phone mr-1"></i>' + E(cl.secondary_phone) + '</span>' : '') +
        (cl.source ? '<span><i class="fas fa-tag mr-1"></i>Source: ' + E(cl.source) + '</span>' : '') +
      '</div>' +
    '</div>';

    // ── Action bar ──
    html += '<div class="workspace-action-bar">' +
      '<div class="action-group">' +
        '<button class="btn btn-sm btn-gold" onclick="LandlordWorkspace._openConvertModal()"><i class="fas fa-file-contract"></i> <span class="hidden sm:inline">Convert to Listing</span></button>' +
        '<button class="btn btn-sm btn-outline" onclick="LandlordWorkspace._openRentalComps()"><i class="fas fa-chart-bar"></i> <span class="hidden sm:inline">Rental Comps</span></button>' +
        '<button class="btn btn-sm btn-outline" onclick="Workspace._quickAddNote()"><i class="fas fa-sticky-note"></i> <span class="hidden sm:inline">Add Note</span></button>' +
      '</div>' +
      '<div class="action-group">' +
        (cl.email ? '<a href="mailto:' + E(cl.email) + '" class="btn btn-sm btn-outline"><i class="fas fa-envelope"></i></a>' : '') +
        (cl.phone ? '<a href="tel:' + E(cl.phone) + '" class="btn btn-sm btn-outline"><i class="fas fa-phone"></i></a>' : '') +
      '</div>' +
    '</div>';

    // ── Main (70%) + Right Rail (30%) ──
    html += '<div class="flex gap-4">';

    // Main content
    html += '<div class="flex-1 min-w-0"><div class="workspace-content space-y-4">';
    html += _propertyInfoCard(cl);
    html += _vacancyCostCard(cl);
    html += _currentTenantStatusCard(cl);
    html += _outreachHistoryCard(cl);
    if (cl.entity_name || cl.entity_type) {
      html += _entityCard(cl);
    }
    html += _sellerPotentialCard(cl);
    html += _propertyDisclosuresCard(cl);

    // Bottom convert CTA
    html += '<div class="text-center py-4">' +
      '<button class="btn btn-gold px-8 py-3 text-base font-bold" onclick="LandlordWorkspace._openConvertModal()">' +
        '<i class="fas fa-file-contract mr-2"></i> Listing Agreement Signed - Convert to Active Listing' +
      '</button>' +
      '<p class="text-xs text-gray-400 mt-2">This creates a rental listing draft and moves the landlord to Active Landlords.</p>' +
    '</div>';

    html += '</div></div>';

    // Right Rail
    html += '<div class="hidden lg:block w-72 flex-shrink-0"><div class="space-y-3">';
    html += _prospectRightRail(cl);
    html += '</div></div>';

    html += '</div>'; // flex
    html += '</div>'; // space-y

    container.innerHTML = html;
  }

  // ── Prospect: Property Info Card ────────────────────────────────────
  function _propertyInfoCard(cl) {
    var addr = cl.property_address || '-';
    if (cl.unit_number) addr += ' #' + cl.unit_number;

    var body = '<div class="space-y-2 text-sm">' +
      '<div class="flex justify-between"><span class="text-gray-500">Address</span><span class="font-medium text-gray-900">' + E(addr) + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Unit(s)</span><span class="font-medium text-gray-900">' + E(cl.unit_number || '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Building Type</span><span class="font-medium text-gray-900">' + E((cl.building_type_pref && cl.building_type_pref.length > 0) ? cl.building_type_pref.join(', ') : '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Current Tenant</span><span class="font-medium text-gray-900">' + (cl.lease_end_date ? 'Yes — lease ends ' + D(cl.lease_end_date) : 'Vacant / Unknown') + '</span></div>' +
    '</div>';

    return _card('building', 'Property Info', 'Workspace.editClient()', body, '#3B82F6');
  }

  // ── Prospect: Current Tenant Status Card ────────────────────────────
  function _currentTenantStatusCard(cl) {
    var leaseEnd = cl.lease_end_date;

    if (!leaseEnd) {
      var body = '<div class="text-center py-3">' +
        '<i class="fas fa-user-slash text-2xl text-gray-300 mb-2"></i>' +
        '<p class="text-xs text-gray-400 mb-2">No current tenant info on file</p>' +
        '<button class="btn btn-xs btn-outline" onclick="Workspace.editClient()"><i class="fas fa-plus mr-1"></i> Add Tenant Info</button>' +
      '</div>';
      return _card('user-check', 'Current Tenant Status', '', body);
    }

    var daysUntilEnd = Math.floor((new Date(leaseEnd).getTime() - Date.now()) / 86400000);
    var renewalStatus = cl.renewal_status || 'unknown';
    var riskColor = daysUntilEnd <= 30 ? 'text-red-600' : daysUntilEnd <= 60 ? 'text-yellow-600' : daysUntilEnd <= 90 ? 'text-blue-600' : 'text-green-600';
    var riskLabel = daysUntilEnd <= 30 ? 'High' : daysUntilEnd <= 60 ? 'Medium' : 'Low';
    var riskBg = daysUntilEnd <= 30 ? 'bg-red-50' : daysUntilEnd <= 60 ? 'bg-yellow-50' : 'bg-green-50';

    var body = '<div class="grid grid-cols-3 gap-3 mb-3">' +
      '<div class="p-3 bg-gray-50 rounded-lg text-center">' +
        '<p class="text-[10px] text-gray-500">Lease Ends</p>' +
        '<p class="text-sm font-bold">' + D(leaseEnd) + '</p>' +
      '</div>' +
      '<div class="p-3 bg-gray-50 rounded-lg text-center">' +
        '<p class="text-[10px] text-gray-500">Days Left</p>' +
        '<p class="text-lg font-bold ' + riskColor + '">' + daysUntilEnd + '</p>' +
      '</div>' +
      '<div class="p-3 ' + riskBg + ' rounded-lg text-center">' +
        '<p class="text-[10px] text-gray-500">Vacancy Risk</p>' +
        '<p class="text-sm font-bold ' + riskColor + '">' + E(riskLabel) + '</p>' +
      '</div>' +
    '</div>';

    // Renewal status
    var renewalColors = { renewing: 'bg-green-100 text-green-700', not_renewing: 'bg-red-100 text-red-700', unknown: 'bg-gray-100 text-gray-600' };
    body += '<div class="flex items-center justify-between text-sm">' +
      '<span class="text-gray-500">Renewal Status</span>' +
      '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + (renewalColors[renewalStatus] || renewalColors.unknown) + '">' + E(renewalStatus.replace(/_/g, ' ')) + '</span>' +
    '</div>';

    return _card('user-check', 'Current Tenant Status', '', body, '#F59E0B');
  }

  // ── Prospect: Outreach History Card ─────────────────────────────────
  function _outreachHistoryCard(cl) {
    var body = '<div id="landlordOutreachTimeline">' + UI.loading() + '</div>';
    setTimeout(function () { _fetchOutreachHistory(); }, 0);
    return _card('history', 'Outreach History', '', body);
  }

  function _fetchOutreachHistory() {
    if (!_clientId) return;
    MallanAPI._fetch('/api/crm/notes?lead_id=' + _clientId + '&limit=20').then(function (data) {
      var el = document.getElementById('landlordOutreachTimeline');
      if (!el) return;
      var notes = data.notes || [];
      if (notes.length === 0) {
        el.innerHTML = '<p class="text-xs text-gray-400 text-center py-3">No outreach records yet. Add a note to start tracking.</p>';
        return;
      }
      var html = '<div class="space-y-2">';
      notes.forEach(function (n) {
        var typeIcon = n.type === 'call' ? 'fa-phone text-green-500' :
                       n.type === 'email' ? 'fa-envelope text-blue-500' :
                       n.type === 'meeting' ? 'fa-handshake text-purple-500' :
                       'fa-sticky-note text-yellow-500';
        html += '<div class="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">' +
          '<div class="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">' +
            '<i class="fas ' + typeIcon + ' text-xs"></i></div>' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm text-gray-900">' + E(n.content || n.text || '') + '</p>' +
            '<p class="text-[10px] text-gray-400 mt-0.5">' + (n.created_at ? Utils.formatTimeAgo(n.created_at) : '') +
              (n.author ? ' by ' + E(n.author) : '') + '</p>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
      el.innerHTML = html;
    }).catch(function () {
      var el = document.getElementById('landlordOutreachTimeline');
      if (el) el.innerHTML = '<p class="text-xs text-gray-400 text-center">Unable to load</p>';
    });
  }

  // ── Prospect: Entity Ownership Card ─────────────────────────────────
  function _entityCard(cl) {
    var signatories = [];
    try { signatories = cl.authorized_signatories ? (typeof cl.authorized_signatories === 'string' ? JSON.parse(cl.authorized_signatories) : cl.authorized_signatories) : []; } catch (e) { /* */ }

    var body = '<div class="space-y-2 text-sm">' +
      '<div class="flex justify-between"><span class="text-gray-500">Entity Name</span><span class="font-medium text-gray-900">' + E(cl.entity_name || '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Entity Type</span><span class="font-medium text-gray-900 uppercase">' + E(cl.entity_type || 'individual') + '</span></div>' +
    '</div>';

    if (signatories.length > 0) {
      body += '<div class="mt-3 pt-3 border-t"><p class="text-xs font-bold text-gray-500 uppercase mb-2">Authorized Signatories</p>';
      signatories.forEach(function (s) {
        body += '<div class="flex items-center gap-2 py-1.5 text-sm">' +
          '<i class="fas fa-user-tie text-xs text-gray-400"></i>' +
          '<span class="font-medium">' + E(s.name || '') + '</span>' +
          (s.title ? '<span class="text-xs text-gray-500">(' + E(s.title) + ')</span>' : '') +
        '</div>';
      });
      body += '</div>';
    }

    return _card('landmark', 'Entity Ownership', 'LandlordWorkspace._editEntity()', body, '#7C3AED');
  }

  // ── Prospect: Seller Potential Card ─────────────────────────────────
  function _sellerPotentialCard(cl) {
    var potential = cl.seller_potential || 'none';
    if (potential === 'none') {
      var body = '<div class="flex items-center justify-between">' +
        '<p class="text-sm text-gray-600">Has this landlord considered selling?</p>' +
        '<div class="flex gap-1">' +
          '<button class="text-xs px-2 py-1 rounded bg-red-100 text-red-700 font-bold hover:bg-red-200" onclick="LandlordWorkspace._setSellerPotential(\'high\')">High</button>' +
          '<button class="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-700 font-bold hover:bg-yellow-200" onclick="LandlordWorkspace._setSellerPotential(\'medium\')">Medium</button>' +
          '<button class="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 font-bold hover:bg-gray-200" onclick="LandlordWorkspace._setSellerPotential(\'low\')">Low</button>' +
        '</div>' +
      '</div>';
      return _card('chart-line', 'Seller Potential', '', body);
    }

    var potColors = { high: { bg: 'bg-red-50', text: 'text-red-700', border: '#DC2626' }, medium: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: '#F59E0B' }, low: { bg: 'bg-gray-50', text: 'text-gray-600', border: '#9CA3AF' } };
    var info = potColors[potential] || potColors.low;

    var body = '<div class="flex items-center justify-between mb-3">' +
      '<div class="p-3 rounded-lg ' + info.bg + '">' +
        '<p class="text-xs text-gray-500">Seller Potential</p>' +
        '<p class="text-lg font-bold ' + info.text + '">' + E(potential.toUpperCase()) + '</p>' +
      '</div>' +
      '<div class="flex gap-1">' +
        '<button class="text-xs px-2 py-1 rounded ' + (potential === 'high' ? 'bg-red-200 text-red-800' : 'bg-gray-100 text-gray-500 hover:bg-gray-200') + ' font-bold" onclick="LandlordWorkspace._setSellerPotential(\'high\')">High</button>' +
        '<button class="text-xs px-2 py-1 rounded ' + (potential === 'medium' ? 'bg-yellow-200 text-yellow-800' : 'bg-gray-100 text-gray-500 hover:bg-gray-200') + ' font-bold" onclick="LandlordWorkspace._setSellerPotential(\'medium\')">Med</button>' +
        '<button class="text-xs px-2 py-1 rounded ' + (potential === 'low' ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200') + ' font-bold" onclick="LandlordWorkspace._setSellerPotential(\'low\')">Low</button>' +
      '</div>' +
    '</div>';

    body += '<p class="text-xs text-gray-500 mb-2"><i class="fas fa-info-circle mr-1"></i> This landlord appears in the Sales CRM Landlord Sellers tab.</p>';

    if (potential === 'high' || potential === 'medium') {
      body += '<button class="btn btn-sm btn-gold w-full" onclick="LandlordWorkspace._promoteToSeller()">' +
        '<i class="fas fa-arrow-up mr-1"></i> Promote to Active Seller</button>';
    }

    return _card('chart-line', 'Seller Potential', '', body, info.border);
  }

  // ── Prospect: Property Disclosures Card ─────────────────────────────
  function _propertyDisclosuresCard(cl) {
    var disclosures = {};
    try { disclosures = cl.property_disclosures ? (typeof cl.property_disclosures === 'string' ? JSON.parse(cl.property_disclosures) : cl.property_disclosures) : {}; } catch (e) { /* */ }

    var items = [
      { key: 'lead_paint', label: 'Lead Paint (pre-1978)', required: true },
      { key: 'bed_bugs', label: 'Bed Bug History', required: true },
      { key: 'flooding', label: 'Flooding / Water Damage', required: false },
      { key: 'violations', label: 'Building Violations (HPD/DOB)', required: false },
      { key: 'mold', label: 'Mold / Environmental', required: false },
      { key: 'asbestos', label: 'Asbestos', required: false },
      { key: 'smoke_co', label: 'Smoke/CO Detectors', required: true },
      { key: 'window_guards', label: 'Window Guards', required: true },
    ];

    var body = '<div class="space-y-1">';
    items.forEach(function (item) {
      var status = disclosures[item.key] || 'pending';
      var statusColors = {
        disclosed: 'text-yellow-500 fa-exclamation-circle',
        clear: 'text-green-500 fa-check-circle',
        pending: 'text-gray-300 fa-circle',
      };
      var iconCls = statusColors[status] || statusColors.pending;
      body += '<div class="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50">' +
        '<i class="fas ' + iconCls + ' text-sm"></i>' +
        '<span class="text-sm text-gray-700 flex-1">' + E(item.label) + '</span>' +
        (item.required ? '<span class="text-[9px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-bold">REQ</span>' : '') +
        '<select class="text-xs border rounded px-1 py-0.5" onchange="LandlordWorkspace._updatePropertyDisclosure(\'' + item.key + '\', this.value)">' +
          '<option value="pending"' + (status === 'pending' ? ' selected' : '') + '>Pending</option>' +
          '<option value="clear"' + (status === 'clear' ? ' selected' : '') + '>Clear</option>' +
          '<option value="disclosed"' + (status === 'disclosed' ? ' selected' : '') + '>Issue Disclosed</option>' +
        '</select>' +
      '</div>';
    });
    body += '</div>';

    var required = items.filter(function (i) { return i.required; });
    var reqDone = required.filter(function (i) { return disclosures[i.key] === 'disclosed' || disclosures[i.key] === 'clear'; }).length;
    if (reqDone < required.length) {
      body += '<div class="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">' +
        '<i class="fas fa-exclamation-triangle mr-1"></i> ' + (required.length - reqDone) + ' required disclosure(s) need attention' +
      '</div>';
    }

    return _card('shield-alt', 'Property Disclosures', '', body, '#DC2626');
  }

  // ── Prospect: Right Rail ────────────────────────────────────────────
  function _prospectRightRail(cl) {
    var html = '';

    // Quick Actions
    html += '<div class="border rounded-xl bg-white shadow-sm overflow-hidden">' +
      '<div class="px-4 py-3 border-b bg-gray-50"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-bolt mr-2 text-gray-400"></i>Quick Actions</h3></div>' +
      '<div class="p-3 space-y-2">' +
        '<button class="btn btn-sm btn-gold w-full" onclick="LandlordWorkspace._openConvertModal()"><i class="fas fa-file-contract mr-1"></i> Convert to Listing</button>' +
        '<button class="btn btn-sm btn-outline w-full" onclick="LandlordWorkspace._openRentalComps()"><i class="fas fa-chart-bar mr-1"></i> Rental Comps</button>' +
        '<button class="btn btn-sm btn-outline w-full" onclick="Workspace._quickAddNote()"><i class="fas fa-sticky-note mr-1"></i> Add Note</button>' +
      '</div>' +
    '</div>';

    // Lead Score
    html += '<div class="border rounded-xl bg-white shadow-sm overflow-hidden">' +
      '<div class="px-4 py-3 border-b bg-gray-50"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-star mr-2 text-gray-400"></i>Lead Score</h3></div>' +
      '<div class="p-3 text-center">' +
        '<div id="landlordProspectScore">' +
          '<p class="text-3xl font-bold text-gray-300">-</p>' +
          '<p class="text-xs text-gray-400">Loading...</p>' +
        '</div>' +
      '</div>' +
    '</div>';
    setTimeout(function () { _fetchProspectLeadScore(); }, 0);

    // Vacancy Risk
    var leaseEnd = cl.lease_end_date;
    var riskLevel = 'Unknown';
    var riskColor = 'text-gray-400';
    var riskBg = 'bg-gray-50';
    if (leaseEnd) {
      var daysLeft = Math.floor((new Date(leaseEnd).getTime() - Date.now()) / 86400000);
      riskLevel = daysLeft <= 30 ? 'High' : daysLeft <= 60 ? 'Medium' : 'Low';
      riskColor = daysLeft <= 30 ? 'text-red-600' : daysLeft <= 60 ? 'text-yellow-600' : 'text-green-600';
      riskBg = daysLeft <= 30 ? 'bg-red-50' : daysLeft <= 60 ? 'bg-yellow-50' : 'bg-green-50';
    }
    html += '<div class="border rounded-xl bg-white shadow-sm overflow-hidden">' +
      '<div class="px-4 py-3 border-b bg-gray-50"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-exclamation-triangle mr-2 text-gray-400"></i>Vacancy Risk</h3></div>' +
      '<div class="p-3 text-center">' +
        '<div class="p-3 rounded-lg ' + riskBg + '">' +
          '<p class="text-lg font-bold ' + riskColor + '">' + E(riskLevel) + '</p>' +
          (leaseEnd ? '<p class="text-[10px] text-gray-500 mt-1">Lease ends ' + D(leaseEnd) + '</p>' : '<p class="text-[10px] text-gray-500 mt-1">No lease date on file</p>') +
        '</div>' +
      '</div>' +
    '</div>';

    // Seller Potential (mini)
    var potential = cl.seller_potential || 'none';
    var spColors = { high: 'text-red-600 bg-red-50', medium: 'text-yellow-600 bg-yellow-50', low: 'text-gray-500 bg-gray-50', none: 'text-gray-400 bg-gray-50' };
    var spInfo = spColors[potential] || spColors.none;
    html += '<div class="border rounded-xl bg-white shadow-sm overflow-hidden">' +
      '<div class="px-4 py-3 border-b bg-gray-50"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-chart-line mr-2 text-gray-400"></i>Seller Potential</h3></div>' +
      '<div class="p-3 text-center">' +
        '<div class="p-3 rounded-lg ' + spInfo + '">' +
          '<p class="text-lg font-bold">' + E(potential === 'none' ? 'Not Assessed' : potential.toUpperCase()) + '</p>' +
        '</div>' +
      '</div>' +
    '</div>';

    // Next Best Action
    var nba = _computeNextBestAction(cl);
    html += '<div class="border rounded-xl bg-white shadow-sm overflow-hidden">' +
      '<div class="px-4 py-3 border-b bg-gray-50"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-lightbulb mr-2 text-gray-400"></i>Next Best Action</h3></div>' +
      '<div class="p-3">' +
        '<div class="p-3 bg-amber-50 border border-amber-200 rounded-lg">' +
          '<p class="text-sm font-medium text-amber-800">' + E(nba.action) + '</p>' +
          '<p class="text-[10px] text-amber-600 mt-1">' + E(nba.reason) + '</p>' +
        '</div>' +
      '</div>' +
    '</div>';

    return html;
  }

  function _computeNextBestAction(cl) {
    var leaseEnd = cl.lease_end_date;
    var potential = cl.seller_potential || 'none';
    var lastContact = cl.last_contacted_at;

    if (!lastContact) {
      return { action: 'Make initial contact', reason: 'No outreach on record yet' };
    }
    var daysSinceContact = Math.floor((Date.now() - new Date(lastContact).getTime()) / 86400000);
    if (daysSinceContact > 30) {
      return { action: 'Follow up — ' + daysSinceContact + ' days since last contact', reason: 'Keep the relationship warm' };
    }
    if (leaseEnd) {
      var daysLeft = Math.floor((new Date(leaseEnd).getTime() - Date.now()) / 86400000);
      if (daysLeft <= 30) {
        return { action: 'List on market immediately', reason: 'Lease ends in ' + daysLeft + ' days' };
      }
      if (daysLeft <= 60) {
        return { action: 'Schedule photos and pricing', reason: 'Lease ends in ' + daysLeft + ' days — prep time' };
      }
      if (daysLeft <= 90) {
        return { action: 'Decide: renew or relist', reason: 'Lease ends in ' + daysLeft + ' days' };
      }
    }
    if (potential === 'high') {
      return { action: 'Discuss selling opportunity', reason: 'High seller potential — explore dual strategy' };
    }
    return { action: 'Send market update', reason: 'Keep landlord engaged with local rental data' };
  }

  function _fetchProspectLeadScore() {
    if (!_clientId) return;
    MallanAPI._fetch('/api/crm/lead-scoring/' + _clientId).then(function (data) {
      var el = document.getElementById('landlordProspectScore');
      if (!el) return;
      var score = data.score || 0;
      var color = score >= 70 ? '#059669' : score >= 40 ? '#F59E0B' : '#9CA3AF';
      el.innerHTML = '<p class="text-3xl font-bold" style="color:' + color + '">' + score + '</p>' +
        '<p class="text-xs text-gray-400">' + (data.label || (score >= 70 ? 'Hot Lead' : score >= 40 ? 'Warm Lead' : 'Cold Lead')) + '</p>';
    }).catch(function () {
      var el = document.getElementById('landlordProspectScore');
      if (el) el.innerHTML = '<p class="text-xs text-gray-400">No score data</p>';
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ACTIVE MODE — Rental Listing Backend
  // ═══════════════════════════════════════════════════════════════════════

  function renderActive(client, container, clientId) {
    _client = client;
    _clientId = clientId;
    _activeTab = 'overview';
    var cl = ClientNormalizer.normalize(client);
    var displayName = cl._displayName || ClientNormalizer.displayName(cl);
    var addr = cl.property_address || '';
    if (cl.unit_number) addr += ' #' + cl.unit_number;
    var listingStatus = cl.listing_status || 'Active';
    var rent = cl.list_price || cl.rent_per_month || 0;
    var dom = cl.dom || cl.days_on_market || 0;

    var html = '<div class="space-y-0">';

    // ── Back nav ──
    html += '<div class="flex items-center gap-2 mb-2">' +
      '<button class="text-sm text-gray-500 hover:text-gray-700" onclick="Router.navigate(\'/rentals/landlords\')"><i class="fas fa-arrow-left mr-1"></i> Active Landlords</button>' +
    '</div>';

    // ── Header — landlord + property ──
    var statusColors = { 'Active': 'bg-blue-100 text-blue-700', 'Rented': 'bg-green-100 text-green-700', 'Vacant': 'bg-red-100 text-red-700', 'Coming Soon': 'bg-yellow-100 text-yellow-700', 'Off Market': 'bg-gray-100 text-gray-600' };
    html += '<div class="workspace-header">' +
      '<div class="flex items-center justify-between">' +
        '<div class="flex items-center gap-4">' +
          UI.avatar(displayName, 48) +
          '<div>' +
            '<h2 class="text-xl font-bold text-gray-900">' + E(displayName) + '</h2>' +
            '<p class="text-sm text-gray-600 mt-0.5">' + E(addr || 'No property address') + '</p>' +
            '<div class="flex items-center gap-2 mt-1">' +
              '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + (statusColors[listingStatus] || 'bg-gray-100 text-gray-600') + '">' + E(listingStatus) + '</span>' +
              (rent ? '<span class="text-sm font-bold text-gray-900">' + $(Number(rent)) + '/mo</span>' : '') +
              '<span class="text-xs text-gray-500">' + dom + ' DOM</span>' +
              (cl.entity_name ? '<span class="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-bold">' + E(cl.entity_type || 'Entity') + '</span>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="flex gap-2">' +
          '<button class="btn btn-sm btn-outline" onclick="Workspace.editClient()"><i class="fas fa-edit"></i> Edit</button>' +
          '<button class="btn btn-sm btn-gold" onclick="LandlordWorkspace._openListingForm()"><i class="fas fa-external-link-alt"></i> Listing Form</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    // ── Tabbed subviews ──
    var TABS = [
      { id: 'overview',     label: 'Overview',     icon: 'fa-th-large' },
      { id: 'showings',     label: 'Showings',     icon: 'fa-calendar' },
      { id: 'applications', label: 'Applications', icon: 'fa-file-alt' },
      { id: 'documents',    label: 'Documents',    icon: 'fa-folder' },
      { id: 'lease-terms',  label: 'Lease Terms',  icon: 'fa-file-contract' },
      { id: 'fee-relist',   label: 'Fee & Relist', icon: 'fa-tag' },
      { id: 'activity',     label: 'Activity',     icon: 'fa-stream' },
    ];
    html += UI.tabs(TABS, _activeTab, 'LandlordWorkspace._switchTab');

    // ── Tab content ──
    html += '<div id="landlordActiveContent" class="workspace-content">' + UI.loading() + '</div>';

    html += '</div>';
    container.innerHTML = html;

    // Render default tab
    _renderActiveTab();
  }

  function _switchTab(tabId) {
    _activeTab = tabId;
    _renderActiveTab();
  }

  function _renderActiveTab() {
    var el = document.getElementById('landlordActiveContent');
    if (!el) return;
    var cl = ClientNormalizer.normalize(_client);

    switch (_activeTab) {
      case 'overview':     el.innerHTML = _activeOverviewTab(cl); _fetchActiveStats(); break;
      case 'showings':     el.innerHTML = _activeShowingsTab(cl); _fetchShowings(); break;
      case 'applications': el.innerHTML = _activeApplicationsTab(cl); _fetchApplications(); break;
      case 'documents':    el.innerHTML = _activeDocumentsTab(cl); break;
      case 'lease-terms':  el.innerHTML = _activeLeaseTermsTab(cl); break;
      case 'fee-relist':   el.innerHTML = _activeFeeRelistTab(cl); break;
      case 'activity':     el.innerHTML = _activeActivityTab(cl); _fetchActivity(); break;
      default:             el.innerHTML = _activeOverviewTab(cl); break;
    }

    // Update tab highlight
    var tabs = document.querySelectorAll('[data-tab-id]');
    tabs.forEach(function (t) {
      var isActive = t.getAttribute('data-tab-id') === _activeTab;
      t.className = t.className.replace(/text-gold border-gold bg-gold\/5/g, '').replace(/text-gray-500 hover:text-gray-700/g, '');
      t.className += isActive ? ' text-gold border-b-2 border-gold bg-gold/5' : ' text-gray-500 hover:text-gray-700';
    });
  }

  // ── Active: Overview Tab ────────────────────────────────────────────
  function _activeOverviewTab(cl) {
    var listingStatus = cl.listing_status || 'Active';
    var rent = cl.list_price || cl.rent_per_month || 0;
    var dom = cl.dom || cl.days_on_market || 0;

    var html = '<div class="space-y-4">';

    // Quick stats
    html += '<div class="grid grid-cols-4 gap-3">' +
      '<div class="p-4 bg-blue-50 rounded-xl text-center">' +
        '<p class="text-2xl font-bold text-blue-700" id="llActiveShowings">-</p>' +
        '<p class="text-xs text-gray-500">Showings</p></div>' +
      '<div class="p-4 bg-purple-50 rounded-xl text-center">' +
        '<p class="text-2xl font-bold text-purple-700" id="llActiveApps">-</p>' +
        '<p class="text-xs text-gray-500">Applications</p></div>' +
      '<div class="p-4 bg-green-50 rounded-xl text-center">' +
        '<p class="text-2xl font-bold text-green-700" id="llActiveViews">-</p>' +
        '<p class="text-xs text-gray-500">Portal Views</p></div>' +
      '<div class="p-4 bg-amber-50 rounded-xl text-center">' +
        '<p class="text-2xl font-bold text-amber-700">' + dom + '</p>' +
        '<p class="text-xs text-gray-500">Days on Market</p></div>' +
    '</div>';

    // Listing header card
    var statusColors = { 'Active': '#3B82F6', 'Rented': '#059669', 'Vacant': '#DC2626', 'Coming Soon': '#F59E0B' };
    var sColor = statusColors[listingStatus] || '#9CA3AF';
    html += '<div class="border rounded-xl bg-white shadow-sm p-4">' +
      '<div class="flex items-center justify-between">' +
        '<div>' +
          '<p class="text-xs text-gray-500">Current Listing</p>' +
          '<p class="text-lg font-bold text-gray-900">' + E(cl.property_address || 'No address') + (cl.unit_number ? ' #' + E(cl.unit_number) : '') + '</p>' +
        '</div>' +
        '<div class="text-right">' +
          '<p class="text-xs text-gray-500">Monthly Rent</p>' +
          '<p class="text-lg font-bold" style="color:' + sColor + '">' + (rent ? $(Number(rent)) : '-') + '</p>' +
        '</div>' +
      '</div>' +
    '</div>';

    // Syndication Status
    html += _syndicationStatusCard(cl);

    // Recent Activity (mini)
    html += '<div class="border rounded-xl bg-white shadow-sm overflow-hidden">' +
      '<div class="px-4 py-3 border-b bg-gray-50"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-stream mr-2 text-gray-400"></i>Recent Activity</h3></div>' +
      '<div class="px-4 py-3" id="llActiveRecentActivity">' + UI.loading() + '</div>' +
    '</div>';

    html += '</div>';
    return html;
  }

  function _syndicationStatusCard(cl) {
    var idxOn = cl.idx_display_yn !== false;
    var portals = [
      { name: 'REBNY RLS', status: idxOn, method: 'IDX Feed' },
      { name: 'StreetEasy', status: false, method: 'Direct Upload (manual)' },
      { name: 'Realtor.com', status: idxOn, method: 'REBNY License' },
      { name: 'Redfin', status: idxOn, method: 'REBNY License' },
    ];

    var body = '<div class="space-y-1">';
    portals.forEach(function (p) {
      body += '<div class="flex items-center justify-between py-1.5 text-sm">' +
        '<div class="flex items-center gap-2">' +
          '<span class="w-2 h-2 rounded-full ' + (p.status ? 'bg-green-500' : 'bg-gray-300') + '"></span>' +
          '<span class="text-gray-700">' + E(p.name) + '</span>' +
        '</div>' +
        '<span class="text-[10px] text-gray-400">' + E(p.method) + '</span>' +
      '</div>';
    });
    body += '</div>';

    return _card('bullhorn', 'Syndication Status', '', body, '#3B82F6');
  }

  function _fetchActiveStats() {
    if (!_clientId) return;
    MallanAPI._fetch('/api/crm/rentals/landlord-stats?lead_id=' + _clientId).then(function (data) {
      var el;
      el = document.getElementById('llActiveShowings');
      if (el) el.textContent = String(data.showings_count || 0);
      el = document.getElementById('llActiveApps');
      if (el) el.textContent = String(data.applications_count || 0);
      el = document.getElementById('llActiveViews');
      if (el) el.textContent = String(data.portal_views || 0);

      // Recent activity
      var actEl = document.getElementById('llActiveRecentActivity');
      if (actEl) {
        var events = data.recent_activity || [];
        if (events.length === 0) {
          actEl.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">No recent activity</p>';
        } else {
          var h = '<div class="space-y-2">';
          events.slice(0, 5).forEach(function (ev) {
            h += '<div class="flex items-center gap-2 text-sm">' +
              '<i class="fas fa-circle text-[6px] text-gray-300"></i>' +
              '<span class="text-gray-700 flex-1">' + E(ev.title || ev.description || '') + '</span>' +
              '<span class="text-[10px] text-gray-400">' + (ev.created_at ? Utils.formatTimeAgo(ev.created_at) : '') + '</span>' +
            '</div>';
          });
          h += '</div>';
          actEl.innerHTML = h;
        }
      }
    }).catch(function () {
      var ids = ['llActiveShowings', 'llActiveApps', 'llActiveViews'];
      ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.textContent = '0';
      });
      var actEl = document.getElementById('llActiveRecentActivity');
      if (actEl) actEl.innerHTML = '<p class="text-xs text-gray-400 text-center">Unable to load</p>';
    });
  }

  // ── Active: Showings Tab ────────────────────────────────────────────
  function _activeShowingsTab() {
    var html = '<div class="space-y-4">';
    html += '<div class="flex items-center justify-between">' +
      '<h3 class="text-sm font-bold text-gray-700">Showings</h3>' +
      '<button class="btn btn-sm btn-gold" onclick="LandlordWorkspace._addShowing()"><i class="fas fa-plus mr-1"></i> Add Showing</button>' +
    '</div>';
    html += '<div id="landlordShowingsTable">' + UI.loading() + '</div>';
    html += '</div>';
    return html;
  }

  function _fetchShowings() {
    if (!_clientId) return;
    MallanAPI._fetch('/api/crm/showing-history?landlord_id=' + _clientId).then(function (data) {
      var el = document.getElementById('landlordShowingsTable');
      if (!el) return;
      var showings = data.showings || [];
      if (showings.length === 0) {
        el.innerHTML = '<p class="text-xs text-gray-400 text-center py-6">No showings recorded yet</p>';
        return;
      }
      var h = '<div class="border rounded-xl overflow-hidden"><table class="w-full text-sm"><thead>' +
        '<tr class="bg-gray-50 text-xs text-gray-500"><th class="px-4 py-2 text-left">Renter</th><th class="px-4 py-2 text-left">Date</th>' +
        '<th class="px-4 py-2 text-left">Feedback</th><th class="px-4 py-2 text-left">Status</th></tr></thead><tbody>';
      showings.forEach(function (s) {
        var feedbackIcons = { positive: 'fa-thumbs-up text-green-500', neutral: 'fa-meh text-yellow-500', negative: 'fa-thumbs-down text-red-500' };
        var fbIcon = feedbackIcons[s.feedback || s.reaction] || 'fa-minus text-gray-300';
        h += '<tr class="border-t hover:bg-gray-50">' +
          '<td class="px-4 py-3 font-medium text-gray-900">' + E(s.renter_name || s.client_name || '-') + '</td>' +
          '<td class="px-4 py-3 text-gray-600">' + (s.showing_date ? D(s.showing_date) : '-') + '</td>' +
          '<td class="px-4 py-3"><i class="fas ' + fbIcon + '"></i> ' + E(s.feedback_notes || s.notes || '') + '</td>' +
          '<td class="px-4 py-3">';
        if (s.rented) {
          h += '<span class="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded font-bold">Rented</span>';
        } else {
          h += '<span class="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-bold">Viewed / Did Not Rent</span>';
        }
        h += '</td></tr>';
      });
      h += '</tbody></table></div>';
      el.innerHTML = h;
    }).catch(function () {
      var el = document.getElementById('landlordShowingsTable');
      if (el) el.innerHTML = '<p class="text-xs text-gray-400 text-center">Unable to load showings</p>';
    });
  }

  // ── Active: Applications Tab ────────────────────────────────────────
  function _activeApplicationsTab() {
    var html = '<div class="space-y-4">';
    html += '<div class="flex items-center justify-between">' +
      '<h3 class="text-sm font-bold text-gray-700">Rental Applications</h3>' +
    '</div>';
    html += '<div id="landlordAppsTable">' + UI.loading() + '</div>';
    html += '</div>';
    return html;
  }

  function _fetchApplications() {
    if (!_clientId) return;
    MallanAPI._fetch('/api/crm/rentals/applications?landlord_id=' + _clientId).then(function (data) {
      var el = document.getElementById('landlordAppsTable');
      if (!el) return;
      var apps = data.applications || [];
      if (apps.length === 0) {
        el.innerHTML = '<p class="text-xs text-gray-400 text-center py-6">No applications submitted yet</p>';
        return;
      }
      var h = '<div class="border rounded-xl overflow-hidden"><table class="w-full text-sm"><thead>' +
        '<tr class="bg-gray-50 text-xs text-gray-500"><th class="px-4 py-2 text-left">Applicant</th><th class="px-4 py-2 text-left">Income</th>' +
        '<th class="px-4 py-2 text-left">Credit</th><th class="px-4 py-2 text-left">Date</th><th class="px-4 py-2 text-left">Status</th><th class="px-4 py-2 text-right">Actions</th></tr></thead><tbody>';
      apps.forEach(function (a) {
        var statusColors = { pending: 'bg-yellow-100 text-yellow-700', approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700' };
        var status = a.status || 'pending';
        h += '<tr class="border-t hover:bg-gray-50">' +
          '<td class="px-4 py-3 font-medium text-gray-900">' + E(a.applicant_name || '-') + '</td>' +
          '<td class="px-4 py-3 text-gray-600">' + (a.income ? $(Number(a.income)) + '/yr' : '-') + '</td>' +
          '<td class="px-4 py-3 text-gray-600">' + E(a.credit_score || a.credit || '-') + '</td>' +
          '<td class="px-4 py-3 text-gray-600">' + (a.submitted_at ? D(a.submitted_at) : '-') + '</td>' +
          '<td class="px-4 py-3"><span class="text-[10px] px-2 py-0.5 rounded font-bold ' + (statusColors[status] || statusColors.pending) + '">' + E(status) + '</span></td>' +
          '<td class="px-4 py-3 text-right">';
        if (status === 'pending') {
          h += '<button class="text-xs text-green-600 hover:underline mr-2" onclick="LandlordWorkspace._approveApp(\'' + E(a.id) + '\')">Approve</button>' +
            '<button class="text-xs text-red-600 hover:underline" onclick="LandlordWorkspace._rejectApp(\'' + E(a.id) + '\')">Reject</button>';
        }
        h += '</td></tr>';
      });
      h += '</tbody></table></div>';
      el.innerHTML = h;
    }).catch(function () {
      var el = document.getElementById('landlordAppsTable');
      if (el) el.innerHTML = '<p class="text-xs text-gray-400 text-center">Unable to load applications</p>';
    });
  }

  // ── Active: Documents Tab ───────────────────────────────────────────
  function _activeDocumentsTab(cl) {
    var docs = {};
    try { docs = cl.documents_collected ? (typeof cl.documents_collected === 'string' ? JSON.parse(cl.documents_collected) : cl.documents_collected) : {}; } catch (e) { /* */ }

    var items = [
      { key: 'listing_agreement', label: 'Listing Agreement' },
      { key: 'lease_template', label: 'Lease Template' },
      { key: 'lead_paint_disclosure', label: 'Lead Paint Disclosure' },
      { key: 'bed_bug_disclosure', label: 'Bed Bug Disclosure' },
      { key: 'smoke_co_affidavit', label: 'Smoke/CO Detector Affidavit' },
      { key: 'window_guard_notice', label: 'Window Guard Notice' },
      { key: 'sprinkler_disclosure', label: 'Sprinkler Disclosure' },
      { key: 'owner_id', label: 'Owner ID' },
    ];

    var collected = items.filter(function (item) { return docs[item.key] === true; }).length;

    var html = '<div class="space-y-4">';
    html += '<div class="flex items-center justify-between">' +
      '<h3 class="text-sm font-bold text-gray-700">Documents</h3>' +
      '<button class="btn btn-sm btn-outline" onclick="LandlordWorkspace._requestDocument()"><i class="fas fa-upload mr-1"></i> Upload / Request</button>' +
    '</div>';

    html += '<div class="flex items-center gap-3 mb-3">' +
      '<div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">' +
        '<div class="h-full bg-blue-500 rounded-full" style="width:' + Math.round((collected / items.length) * 100) + '%"></div>' +
      '</div>' +
      '<span class="text-xs font-bold text-gray-600">' + collected + '/' + items.length + ' collected</span>' +
    '</div>';

    html += '<div class="grid grid-cols-2 gap-2">';
    items.forEach(function (item) {
      var has = docs[item.key] === true;
      html += '<div class="flex items-center gap-2 py-2 px-3 rounded-lg text-sm ' + (has ? 'bg-green-50' : 'bg-red-50') + ' cursor-pointer" ' +
        'onclick="LandlordWorkspace._toggleDocument(\'' + item.key + '\',' + !has + ')">' +
        '<i class="fas ' + (has ? 'fa-check-circle text-green-500' : 'fa-times-circle text-red-400') + ' text-sm"></i>' +
        '<span class="' + (has ? 'text-green-700' : 'text-red-700') + '">' + E(item.label) + '</span>' +
      '</div>';
    });
    html += '</div>';

    if (collected < items.length) {
      html += '<div class="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">' +
        '<i class="fas fa-folder-open mr-1"></i> ' + (items.length - collected) + ' document(s) still needed' +
      '</div>';
    }

    html += '</div>';
    return html;
  }

  // ── Active: Lease Terms Tab ─────────────────────────────────────────
  function _activeLeaseTermsTab(cl) {
    var terms = {};
    try { terms = cl.lease_terms ? (typeof cl.lease_terms === 'string' ? JSON.parse(cl.lease_terms) : cl.lease_terms) : {}; } catch (e) { /* */ }

    var html = '<div class="space-y-4">';
    html += '<div class="flex items-center justify-between">' +
      '<h3 class="text-sm font-bold text-gray-700">Lease Terms</h3>' +
      '<button class="btn btn-sm btn-outline" onclick="LandlordWorkspace._editLeaseTerms()"><i class="fas fa-pen mr-1"></i> Edit</button>' +
    '</div>';

    html += '<div class="border rounded-xl bg-white shadow-sm p-4">' +
      '<div class="grid grid-cols-2 gap-6 text-sm">' +
        '<div class="space-y-3">' +
          '<div class="flex justify-between"><span class="text-gray-500">Standard Length</span><span class="font-medium">' + E(terms.standard_length || '1 year') + '</span></div>' +
          '<div class="flex justify-between"><span class="text-gray-500">Pet Policy</span><span class="font-medium">' + E(terms.pet_policy || '-') + '</span></div>' +
          '<div class="flex justify-between"><span class="text-gray-500">Subletting</span><span class="font-medium">' + E(terms.sublet_rules || '-') + '</span></div>' +
        '</div>' +
        '<div class="space-y-3">' +
          '<div class="flex justify-between"><span class="text-gray-500">Utilities Included</span><span class="font-medium">' + E(terms.utilities || '-') + '</span></div>' +
          '<div class="flex justify-between"><span class="text-gray-500">Move-In Fee</span><span class="font-medium">' + (terms.move_in_fee ? $(Number(terms.move_in_fee)) : '-') + '</span></div>' +
          '<div class="flex justify-between"><span class="text-gray-500">Security Deposit</span><span class="font-medium">' + (terms.security_deposit ? $(Number(terms.security_deposit)) : '1 month') + '</span></div>' +
          '<div class="flex justify-between"><span class="text-gray-500">Broker Fee</span><span class="font-medium">' + E((cl.fee_structure || 'owner_pay').replace(/_/g, ' ')) + '</span></div>' +
        '</div>' +
      '</div>' +
    '</div>';

    html += '</div>';
    return html;
  }

  // ── Active: Fee & Relist Tab ────────────────────────────────────────
  function _activeFeeRelistTab(cl) {
    var html = '<div class="space-y-4">';

    // Fee Structure
    html += _feeStructureCard(cl);

    // Relist Timing Advisor
    html += _relistTimingCard(cl);

    // Seller Potential
    html += _sellerPotentialCard(cl);

    // Vacancy Cost Calculator
    html += _vacancyCostCard(cl);

    html += '</div>';
    return html;
  }

  // ── Active: Activity Tab ────────────────────────────────────────────
  function _activeActivityTab() {
    var html = '<div class="space-y-4">';
    html += '<h3 class="text-sm font-bold text-gray-700">Full Timeline</h3>';
    html += '<div id="landlordActivityTimeline">' + UI.loading() + '</div>';
    html += '</div>';
    return html;
  }

  function _fetchActivity() {
    if (!_clientId) return;
    MallanAPI._fetch('/api/crm/notes?lead_id=' + _clientId + '&limit=50').then(function (data) {
      var el = document.getElementById('landlordActivityTimeline');
      if (!el) return;
      var notes = data.notes || [];
      if (notes.length === 0) {
        el.innerHTML = '<p class="text-xs text-gray-400 text-center py-6">No activity recorded yet</p>';
        return;
      }
      var h = '<div class="space-y-3">';
      notes.forEach(function (n) {
        var typeIcon = n.type === 'call' ? 'fa-phone text-green-500' :
                       n.type === 'email' ? 'fa-envelope text-blue-500' :
                       n.type === 'meeting' ? 'fa-handshake text-purple-500' :
                       n.type === 'showing' ? 'fa-calendar text-amber-500' :
                       n.type === 'application' ? 'fa-file-alt text-indigo-500' :
                       n.type === 'system' ? 'fa-cog text-gray-400' :
                       'fa-sticky-note text-yellow-500';
        h += '<div class="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">' +
          '<div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">' +
            '<i class="fas ' + typeIcon + ' text-xs"></i></div>' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm text-gray-900">' + E(n.content || n.text || '') + '</p>' +
            '<p class="text-[10px] text-gray-400 mt-1">' + (n.created_at ? Utils.formatTimeAgo(n.created_at) : '') +
              (n.author ? ' by ' + E(n.author) : '') + '</p>' +
          '</div>' +
        '</div>';
      });
      h += '</div>';
      el.innerHTML = h;
    }).catch(function () {
      var el = document.getElementById('landlordActivityTimeline');
      if (el) el.innerHTML = '<p class="text-xs text-gray-400 text-center">Unable to load activity</p>';
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SHARED CARDS (used in both prospect and active modes)
  // ═══════════════════════════════════════════════════════════════════════

  // ── Vacancy Cost Calculator ─────────────────────────────────────────
  function _vacancyCostCard(cl) {
    var body = '<div id="landlordVacancyCalc">' +
      '<div class="grid grid-cols-2 gap-3 text-sm">' +
        '<div><label class="text-xs text-gray-500 block mb-1">Monthly Rent</label>' +
          '<input type="number" id="vc_rent" class="w-full border rounded px-2 py-1.5 text-sm" placeholder="$0" oninput="LandlordWorkspace._calcVacancy()"></div>' +
        '<div><label class="text-xs text-gray-500 block mb-1">Monthly Expenses</label>' +
          '<input type="number" id="vc_expenses" class="w-full border rounded px-2 py-1.5 text-sm" placeholder="Mortgage + maint" oninput="LandlordWorkspace._calcVacancy()"></div>' +
        '<div><label class="text-xs text-gray-500 block mb-1">Vacancy Duration (months)</label>' +
          '<input type="number" id="vc_months" class="w-full border rounded px-2 py-1.5 text-sm" placeholder="1" value="1" oninput="LandlordWorkspace._calcVacancy()"></div>' +
        '<div><label class="text-xs text-gray-500 block mb-1">Turnover Cost (cleaning, repairs)</label>' +
          '<input type="number" id="vc_turnover" class="w-full border rounded px-2 py-1.5 text-sm" placeholder="$2000" value="2000" oninput="LandlordWorkspace._calcVacancy()"></div>' +
      '</div>' +
      '<div id="vc_result" class="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-center hidden">' +
        '<p class="text-xs text-gray-500">Total Vacancy Cost</p>' +
        '<p class="text-2xl font-bold text-red-700" id="vc_total">$0</p>' +
        '<div id="vc_breakdown" class="mt-2 text-xs text-gray-500"></div>' +
      '</div>' +
    '</div>';

    return _card('building', 'Vacancy Cost Calculator', '', body, '#DC2626');
  }

  // ── Fee Structure Card ──────────────────────────────────────────────
  function _feeStructureCard(cl) {
    var fee = cl.fee_structure || 'owner_pay';
    var feeLabels = {
      owner_pay: { label: 'Owner-Pay', desc: 'Landlord pays broker fee', color: 'bg-green-50 text-green-700 border-green-200' },
      tenant_pay: { label: 'Tenant-Pay', desc: 'Tenant pays broker fee', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
      no_fee: { label: 'No-Fee', desc: 'No broker fee (built into rent)', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    };
    var feeInfo = feeLabels[fee] || feeLabels.owner_pay;

    var body = '<div class="p-3 rounded-lg border text-center ' + feeInfo.color + '">' +
      '<p class="text-lg font-bold">' + E(feeInfo.label) + '</p>' +
      '<p class="text-xs mt-1">' + E(feeInfo.desc) + '</p>' +
    '</div>' +
    '<div class="mt-3 flex gap-2">';

    ['owner_pay', 'tenant_pay', 'no_fee'].forEach(function (f) {
      var info = feeLabels[f];
      var active = fee === f;
      body += '<button class="flex-1 py-2 text-xs font-bold rounded-lg border transition-all ' +
        (active ? info.color + ' border-current' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400') +
        '" onclick="LandlordWorkspace._setFeeStructure(\'' + f + '\')">' + E(info.label) + '</button>';
    });

    body += '</div>';
    return _card('tag', 'Fee Structure', '', body, '#F59E0B');
  }

  // ── Relist Timing Advisor ───────────────────────────────────────────
  function _relistTimingCard(cl) {
    var leaseEnd = cl.lease_end_date;
    var relistDate = cl.relist_reminder_date;

    var body = '';

    if (leaseEnd) {
      var daysUntilEnd = Math.floor((new Date(leaseEnd).getTime() - Date.now()) / 86400000);
      var urgencyColor = daysUntilEnd <= 30 ? 'text-red-600' : daysUntilEnd <= 60 ? 'text-yellow-600' : daysUntilEnd <= 90 ? 'text-blue-600' : 'text-green-600';

      body += '<div class="flex items-center justify-between mb-3">' +
        '<div><p class="text-xs text-gray-500">Current Lease Ends</p>' +
          '<p class="text-lg font-bold">' + D(leaseEnd) + '</p></div>' +
        '<div class="text-right"><p class="text-xs text-gray-500">Days Until</p>' +
          '<p class="text-2xl font-bold ' + urgencyColor + '">' + daysUntilEnd + '</p></div>' +
      '</div>';

      var milestones = [
        { days: 120, label: 'Start renewal conversation', icon: 'fa-comment' },
        { days: 90, label: 'Decision: renew or relist', icon: 'fa-question-circle' },
        { days: 60, label: 'If relisting: photos + pricing', icon: 'fa-camera' },
        { days: 30, label: 'List on market', icon: 'fa-bullhorn' },
      ];

      body += '<div class="space-y-2">';
      milestones.forEach(function (m) {
        var isPast = daysUntilEnd < m.days;
        var isCurrent = daysUntilEnd >= m.days - 15 && daysUntilEnd <= m.days + 15;
        body += '<div class="flex items-center gap-3 py-1.5 px-2 rounded ' + (isCurrent ? 'bg-gold/10 border border-gold/30' : isPast ? 'opacity-50' : '') + '">' +
          '<div class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ' + (isPast ? 'bg-green-100' : isCurrent ? 'bg-gold/20' : 'bg-gray-100') + '">' +
            '<i class="fas ' + (isPast ? 'fa-check text-green-500' : m.icon + (isCurrent ? ' text-gold' : ' text-gray-400')) + ' text-[10px]"></i>' +
          '</div>' +
          '<div class="flex-1">' +
            '<p class="text-sm ' + (isCurrent ? 'font-bold text-gray-900' : 'text-gray-600') + '">' + E(m.label) + '</p>' +
            '<p class="text-[10px] text-gray-400">' + m.days + ' days before lease end</p>' +
          '</div>' +
        '</div>';
      });
      body += '</div>';
    } else {
      body += '<div class="text-center py-3">' +
        '<i class="fas fa-calendar-alt text-2xl text-gray-300 mb-2"></i>' +
        '<p class="text-xs text-gray-400 mb-2">No lease end date set</p>' +
        '<button class="btn btn-xs btn-outline" onclick="Workspace.editClient()"><i class="fas fa-plus mr-1"></i> Set Lease Dates</button>' +
      '</div>';
    }

    if (relistDate) {
      body += '<div class="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">' +
        '<i class="fas fa-bell mr-1"></i> Relist reminder set for ' + D(relistDate) +
      '</div>';
    }

    return _card('clock', 'Relist Timing', '', body, '#3B82F6');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ACTIONS — All onclick handlers
  // ═══════════════════════════════════════════════════════════════════════

  function _calcVacancy() {
    var rent = Number(document.getElementById('vc_rent').value) || 0;
    var expenses = Number(document.getElementById('vc_expenses').value) || 0;
    var months = Number(document.getElementById('vc_months').value) || 1;
    var turnover = Number(document.getElementById('vc_turnover').value) || 0;

    if (rent <= 0 && expenses <= 0) {
      document.getElementById('vc_result').classList.add('hidden');
      return;
    }

    var lostRent = rent * months;
    var ongoingExpenses = expenses * months;
    var total = lostRent + ongoingExpenses + turnover;

    var resultEl = document.getElementById('vc_result');
    resultEl.classList.remove('hidden');
    document.getElementById('vc_total').textContent = '$' + total.toLocaleString('en-US', { maximumFractionDigits: 0 });
    document.getElementById('vc_breakdown').innerHTML =
      'Lost Rent: ' + $(lostRent) + ' | Ongoing Expenses: ' + $(ongoingExpenses) + ' | Turnover: ' + $(turnover);
  }

  function _setSellerPotential(level) {
    if (!_clientId) return;
    MallanAPI.clients.update(_clientId, { seller_potential: level }).then(function () {
      CRM.toast('Seller potential set to ' + level, 'success');
      Workspace.openClient(_clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _promoteToSeller() {
    if (!_clientId) return;
    if (!confirm('Promote this landlord to an Active Seller in the Sales CRM? The landlord record stays in the Rentals CRM.')) return;

    MallanAPI._fetch('/api/crm/sales/promote', {
      method: 'POST',
      body: JSON.stringify({ lead_id: _clientId, promotion_type: 'landlord_to_seller' }),
    }).then(function () {
      CRM.toast('Promoted to Active Seller — now visible in Sales CRM', 'success');
      Workspace.openClient(_clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _updatePropertyDisclosure(key, value) {
    _updateJsonField('property_disclosures', function (obj) {
      if (!obj || typeof obj !== 'object') obj = {};
      obj[key] = value;
      return obj;
    });
  }

  function _setFeeStructure(fee) {
    if (!_clientId) return;
    MallanAPI.clients.update(_clientId, { fee_structure: fee }).then(function () {
      CRM.toast('Fee structure updated', 'success');
      Workspace.openClient(_clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _editLeaseTerms() {
    var cl = _client ? ClientNormalizer.normalize(_client) : {};
    var terms = {};
    try { terms = cl.lease_terms ? (typeof cl.lease_terms === 'string' ? JSON.parse(cl.lease_terms) : cl.lease_terms) : {}; } catch (e) { /* */ }

    CRM.openModal('Edit Lease Terms', '<div class="space-y-3">' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Standard Length</label>' +
          '<select id="lt_length" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
            '<option value="1 year"' + (terms.standard_length === '1 year' ? ' selected' : '') + '>1 Year</option>' +
            '<option value="2 years"' + (terms.standard_length === '2 years' ? ' selected' : '') + '>2 Years</option>' +
            '<option value="month-to-month"' + (terms.standard_length === 'month-to-month' ? ' selected' : '') + '>Month-to-Month</option>' +
            '<option value="flexible"' + (terms.standard_length === 'flexible' ? ' selected' : '') + '>Flexible</option>' +
          '</select></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Pet Policy</label>' +
          '<select id="lt_pets" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
            '<option value="">Select...</option>' +
            '<option value="No pets"' + (terms.pet_policy === 'No pets' ? ' selected' : '') + '>No Pets</option>' +
            '<option value="Cats only"' + (terms.pet_policy === 'Cats only' ? ' selected' : '') + '>Cats Only</option>' +
            '<option value="Small dogs OK"' + (terms.pet_policy === 'Small dogs OK' ? ' selected' : '') + '>Small Dogs OK</option>' +
            '<option value="All pets OK"' + (terms.pet_policy === 'All pets OK' ? ' selected' : '') + '>All Pets OK</option>' +
            '<option value="Case by case"' + (terms.pet_policy === 'Case by case' ? ' selected' : '') + '>Case by Case</option>' +
          '</select></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Subletting</label>' +
          '<select id="lt_sublet" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
            '<option value="">Select...</option>' +
            '<option value="Not allowed"' + (terms.sublet_rules === 'Not allowed' ? ' selected' : '') + '>Not Allowed</option>' +
            '<option value="With approval"' + (terms.sublet_rules === 'With approval' ? ' selected' : '') + '>With Approval</option>' +
            '<option value="Allowed"' + (terms.sublet_rules === 'Allowed' ? ' selected' : '') + '>Allowed</option>' +
          '</select></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Utilities Included</label>' +
          '<input id="lt_utilities" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(terms.utilities || '') + '" placeholder="e.g., Heat, Water"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Move-In Fee</label>' +
          '<input id="lt_movein" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(terms.move_in_fee || '') + '" placeholder="$0"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Security Deposit</label>' +
          '<input id="lt_security" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(terms.security_deposit || '') + '" placeholder="1 month rent"></div>' +
      '</div>' +
      '<button class="btn btn-gold w-full" onclick="LandlordWorkspace._saveLeaseTerms()">Save</button>' +
    '</div>');
  }

  function _saveLeaseTerms() {
    if (!_clientId) return;

    var newTerms = {
      standard_length: document.getElementById('lt_length').value,
      pet_policy: document.getElementById('lt_pets').value,
      sublet_rules: document.getElementById('lt_sublet').value,
      utilities: document.getElementById('lt_utilities').value.trim(),
      move_in_fee: document.getElementById('lt_movein').value || null,
      security_deposit: document.getElementById('lt_security').value || null,
    };

    MallanAPI.clients.update(_clientId, { lease_terms: newTerms }).then(function () {
      CRM.closeModal();
      CRM.toast('Lease terms updated', 'success');
      Workspace.openClient(_clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _editEntity() {
    var cl = _client ? ClientNormalizer.normalize(_client) : {};
    CRM.openModal('Edit Entity Ownership', '<div class="space-y-3">' +
      '<div><label class="text-xs font-bold text-gray-500">Entity Name</label>' +
        '<input id="lentName" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.entity_name || '') + '" placeholder="e.g., 123 Main St LLC"></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Entity Type</label>' +
        '<select id="lentType" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
          '<option value="individual"' + (cl.entity_type === 'individual' ? ' selected' : '') + '>Individual</option>' +
          '<option value="llc"' + (cl.entity_type === 'llc' ? ' selected' : '') + '>LLC</option>' +
          '<option value="trust"' + (cl.entity_type === 'trust' ? ' selected' : '') + '>Trust</option>' +
          '<option value="corp"' + (cl.entity_type === 'corp' ? ' selected' : '') + '>Corporation</option>' +
        '</select></div>' +
      '<button class="btn btn-gold w-full" onclick="LandlordWorkspace._saveEntity()">Save</button>' +
    '</div>');
  }

  function _saveEntity() {
    if (!_clientId) return;
    MallanAPI.clients.update(_clientId, {
      entity_name: document.getElementById('lentName').value.trim(),
      entity_type: document.getElementById('lentType').value,
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Entity updated', 'success');
      Workspace.openClient(_clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _toggleDocument(key, value) {
    _updateJsonField('documents_collected', function (obj) {
      if (!obj || typeof obj !== 'object') obj = {};
      obj[key] = value;
      return obj;
    });
  }

  function _requestDocument() {
    CRM.toast('Document upload / request — coming soon', 'info');
  }

  function _openListingForm() {
    if (typeof CRM.openListingForm === 'function') {
      CRM.openListingForm('rental');
    } else {
      window.open('/crm/RENTAL-FORM-REDESIGN.html', '_blank', 'noopener');
    }
  }

  function _openRentalComps() {
    var cl = _client ? ClientNormalizer.normalize(_client) : {};
    var addr = cl.property_address || '';
    CRM.toast('Opening rental comps for ' + (addr || 'this property') + '...', 'info');
    if (typeof Workspace._generateCMA === 'function') {
      Workspace._generateCMA();
    }
  }

  function _addShowing() {
    CRM.openModal('Add Showing Record', '<div class="space-y-3">' +
      '<div><label class="text-xs font-bold text-gray-500">Renter Name</label>' +
        '<input id="lsh_name" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="John Smith"></div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Date</label>' +
          '<input id="lsh_date" type="date" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + new Date().toISOString().split('T')[0] + '"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Feedback</label>' +
          '<select id="lsh_feedback" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
            '<option value="">Select...</option>' +
            '<option value="positive">Positive</option>' +
            '<option value="neutral">Neutral</option>' +
            '<option value="negative">Negative</option>' +
          '</select></div>' +
      '</div>' +
      '<div><label class="text-xs font-bold text-gray-500">Notes</label>' +
        '<textarea id="lsh_notes" class="w-full border rounded px-3 py-2 text-sm mt-1" rows="2" placeholder="Showing feedback, comments..."></textarea></div>' +
      '<button class="btn btn-gold w-full" onclick="LandlordWorkspace._submitShowing()">Save Showing</button>' +
    '</div>');
  }

  function _submitShowing() {
    var name = document.getElementById('lsh_name').value.trim();
    var date = document.getElementById('lsh_date').value;
    if (!date) { CRM.toast('Date is required', 'error'); return; }

    var cl = _client ? ClientNormalizer.normalize(_client) : {};
    MallanAPI._fetch('/api/crm/showing-history', {
      method: 'POST',
      body: JSON.stringify({
        landlord_id: _clientId,
        lead_id: _clientId,
        address: cl.property_address || '',
        unit: cl.unit_number || '',
        renter_name: name,
        showing_date: date,
        feedback: document.getElementById('lsh_feedback').value || null,
        notes: document.getElementById('lsh_notes').value.trim() || null,
      }),
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Showing record added', 'success');
      Workspace.openClient(_clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _approveApp(appId) {
    if (!confirm('Approve this application?')) return;
    MallanAPI._fetch('/api/crm/rentals/applications/' + appId, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    }).then(function () {
      CRM.toast('Application approved', 'success');
      Workspace.openClient(_clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _rejectApp(appId) {
    if (!confirm('Reject this application?')) return;
    MallanAPI._fetch('/api/crm/rentals/applications/' + appId, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' }),
    }).then(function () {
      CRM.toast('Application rejected', 'success');
      Workspace.openClient(_clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  // ── Convert Modal (Prospect → Active Listing) ──────────────────────
  function _openConvertModal() {
    var cl = _client ? ClientNormalizer.normalize(_client) : {};
    var addr = cl.property_address || '';
    if (cl.unit_number) addr += ' #' + cl.unit_number;

    CRM.openModal('Convert to Active Rental Listing', '<div class="space-y-4">' +
      '<p class="text-sm text-gray-600">Confirm the listing details below. This will create a rental listing draft and move the landlord to Active Landlords.</p>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Property Address</label>' +
          '<input id="cv_address" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.property_address || '') + '"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Unit</label>' +
          '<input id="cv_unit" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.unit_number || '') + '"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Monthly Rent</label>' +
          '<input id="cv_rent" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" value="' + E(cl.list_price || cl.rent_per_month || '') + '"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Lease Term</label>' +
          '<select id="cv_term" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
            '<option value="1 year">1 Year</option>' +
            '<option value="2 years">2 Years</option>' +
            '<option value="month-to-month">Month-to-Month</option>' +
            '<option value="flexible">Flexible</option>' +
          '</select></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Fee Structure</label>' +
          '<select id="cv_fee" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
            '<option value="owner_pay"' + (cl.fee_structure === 'owner_pay' ? ' selected' : '') + '>Owner-Pay</option>' +
            '<option value="tenant_pay"' + (cl.fee_structure === 'tenant_pay' ? ' selected' : '') + '>Tenant-Pay</option>' +
            '<option value="no_fee"' + (cl.fee_structure === 'no_fee' ? ' selected' : '') + '>No-Fee</option>' +
          '</select></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Exclusive Start Date</label>' +
          '<input id="cv_start" type="date" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + new Date().toISOString().split('T')[0] + '"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Exclusive End Date</label>' +
          '<input id="cv_end" type="date" class="w-full border rounded px-3 py-2 text-sm mt-1"></div>' +
      '</div>' +
      '<button class="btn btn-gold w-full py-3 text-base font-bold" onclick="LandlordWorkspace._submitConvert()">' +
        '<i class="fas fa-file-contract mr-2"></i> Create Listing Draft</button>' +
    '</div>');
  }

  function _submitConvert() {
    var address = document.getElementById('cv_address').value.trim();
    if (!address) { CRM.toast('Property address is required', 'error'); return; }

    var payload = {
      personId: _clientId,
      action: 'promote_to_listing',
      listingDraft: {
        listing_type: 'rent',
        property_address: address,
        unit_number: document.getElementById('cv_unit').value.trim() || null,
        list_price: document.getElementById('cv_rent').value ? Number(document.getElementById('cv_rent').value) : null,
        lease_term: document.getElementById('cv_term').value,
        fee_structure: document.getElementById('cv_fee').value,
        exclusive_start_date: document.getElementById('cv_start').value || null,
        exclusive_end_date: document.getElementById('cv_end').value || null,
      },
    };

    MallanAPI._fetch('/api/crm/convert', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Listing draft created — landlord moved to Active Landlords', 'success');
      Router.navigate('/rentals/landlords');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  // ── Generic JSON field updater ──────────────────────────────────────
  function _updateJsonField(field, mutator) {
    if (!_clientId) return;
    var current = _client ? ClientNormalizer.normalize(_client) : {};
    var currentVal = current[field];
    try { if (typeof currentVal === 'string') currentVal = JSON.parse(currentVal); } catch (e) { currentVal = null; }

    var newVal = mutator(currentVal || {});
    var data = {};
    data[field] = newVal;

    MallanAPI.clients.update(_clientId, data).then(function () {
      CRM.toast('Updated', 'success');
      Workspace.openClient(_clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════
  return {
    // Full workspace renderers
    renderProspect: renderProspect,
    renderActive: renderActive,

    // Tab switching (active mode)
    _switchTab: _switchTab,

    // Shared actions
    _calcVacancy: _calcVacancy,
    _setSellerPotential: _setSellerPotential,
    _promoteToSeller: _promoteToSeller,
    _updatePropertyDisclosure: _updatePropertyDisclosure,
    _setFeeStructure: _setFeeStructure,
    _editLeaseTerms: _editLeaseTerms,
    _saveLeaseTerms: _saveLeaseTerms,
    _editEntity: _editEntity,
    _saveEntity: _saveEntity,
    _toggleDocument: _toggleDocument,
    _requestDocument: _requestDocument,
    _openListingForm: _openListingForm,
    _openRentalComps: _openRentalComps,

    // Showings
    _addShowing: _addShowing,
    _submitShowing: _submitShowing,

    // Applications
    _approveApp: _approveApp,
    _rejectApp: _rejectApp,

    // Convert modal
    _openConvertModal: _openConvertModal,
    _submitConvert: _submitConvert,
  };
})();
