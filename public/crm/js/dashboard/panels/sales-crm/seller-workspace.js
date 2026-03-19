// ═══════════════════════════════════════════════════════════════════════════════
// SELLER WORKSPACE — Full workspace renderer with Prospect + Active modes
// Prospect: outreach, CMA, convert-to-listing
// Active: listing backend (showings, offers, documents, marketing, financial)
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, Router, Store, UI, Utils, MallanAPI, Workspace, ClientNormalizer, Documents, Events */

var SellerWorkspace = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  // State
  var _activeTab = 'overview';
  var _currentClient = null;
  var _currentClientId = null;
  var _currentListing = null;

  // ═══════════════════════════════════════════════════════════════════════
  // CARD HELPER
  // ═══════════════════════════════════════════════════════════════════════

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
  // PROSPECT MODE
  // ═══════════════════════════════════════════════════════════════════════

  function renderProspect(client, container, clientId) {
    _currentClient = client;
    _currentClientId = clientId;
    _currentListing = null;
    _activeTab = 'overview';

    var cl = ClientNormalizer.normalize(client);
    var displayName = cl._displayName || ClientNormalizer.displayName(cl);
    var hasSecondary = cl.secondary_first_name || cl.secondary_last_name;
    var secondaryName = hasSecondary ? ((cl.secondary_first_name || '') + ' ' + (cl.secondary_last_name || '')).trim() : '';

    var html = '<div class="space-y-0">';

    // ── Back navigation ──
    html += '<div class="flex items-center gap-2 mb-2">' +
      '<button class="text-sm text-gray-500 hover:text-gray-700" onclick="Router.navigate(\'/sales/seller-prospects\')"><i class="fas fa-arrow-left mr-1"></i> Seller Prospects</button>' +
    '</div>';

    // ── Header ──
    html += '<div class="workspace-header">' +
      '<div class="flex items-center justify-between">' +
        '<div class="flex items-center gap-4">' +
          UI.avatar(displayName, 48) +
          '<div>' +
            '<h2 class="text-xl font-bold text-gray-900">' + E(displayName) + '</h2>' +
            '<div class="flex items-center gap-2 mt-1">' +
              '<span class="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-bold uppercase">Seller Prospect</span>' +
              UI.stageBadge(cl.pipeline_stage || cl.stage || cl.status || 'new') +
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

    // ── Action Bar ──
    html += '<div class="workspace-action-bar">' +
      '<div class="action-group">' +
        '<button class="btn btn-sm btn-gold" onclick="SellerWorkspace._openConvertModal()"><i class="fas fa-file-signature"></i> <span class="hidden sm:inline">Convert to Listing</span></button>' +
        '<button class="btn btn-sm btn-outline" onclick="SellerWorkspace._runCMA()"><i class="fas fa-chart-bar"></i> <span class="hidden sm:inline">Run CMA</span></button>' +
        '<button class="btn btn-sm btn-outline" onclick="Workspace._quickAddNote()"><i class="fas fa-sticky-note"></i> <span class="hidden sm:inline">Note</span></button>' +
        '<button class="btn btn-sm btn-outline" onclick="Workspace._quickAddTask()"><i class="fas fa-tasks"></i> <span class="hidden sm:inline">Task</span></button>' +
      '</div>' +
      '<div class="action-group">' +
        (cl.email ? '<a href="mailto:' + E(cl.email) + '" class="btn btn-sm btn-outline"><i class="fas fa-envelope"></i></a>' : '') +
        (cl.phone ? '<a href="tel:' + E(cl.phone) + '" class="btn btn-sm btn-outline"><i class="fas fa-phone"></i></a>' : '') +
      '</div>' +
    '</div>';

    // ── Main Content (70%) + Right Rail (30%) ──
    html += '<div class="flex gap-4">';

    // Main content
    html += '<div class="flex-1 min-w-0"><div class="workspace-content space-y-4">';
    html += _prospectPropertyCard(cl);
    html += '<div id="swCmaInline">' + _prospectCmaCard(cl) + '</div>';
    html += _prospectMarketDataCard(cl);
    html += '<div id="swOutreachHistory">' + _prospectOutreachCard() + '</div>';
    html += _prospectOutreachTemplates(cl);

    // Entity Card
    if (cl.entity_name || cl.entity_type) {
      html += _entityCard(cl);
    }

    // Attorney Card
    html += _attorneyCard(cl);

    // Convert button at bottom
    html += '<div class="py-4 text-center">' +
      '<button class="btn btn-gold px-8 py-3 text-base" onclick="SellerWorkspace._openConvertModal()">' +
        '<i class="fas fa-file-signature mr-2"></i> Listing Agreement Signed — Convert to Active Listing' +
      '</button>' +
    '</div>';

    html += '</div></div>';

    // Right rail
    html += '<div class="hidden lg:block w-72 flex-shrink-0"><div class="space-y-3">';
    html += _prospectRightRail(cl);
    html += '</div></div>';

    html += '</div>'; // flex
    html += '</div>'; // space-y

    container.innerHTML = html;

    // Async fetches
    _fetchOutreachHistory();
    _fetchProspectLeadScore();
  }

  // ── Prospect: Property Info Card ──
  function _prospectPropertyCard(cl) {
    var body = '<div class="grid grid-cols-2 gap-4 text-sm">' +
      '<div class="space-y-2">' +
        '<div class="flex justify-between"><span class="text-gray-500">Address</span><span class="font-medium text-gray-900">' + E(cl.property_address || '-') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">Unit</span><span class="font-medium text-gray-900">' + E(cl.unit_number || '-') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">Legal Owner</span><span class="font-medium text-gray-900">' + E(cl.legal_ownership_name || cl.entity_name || '-') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">Home Address</span><span class="font-medium text-gray-900">' + E(cl.home_address || '-') + '</span></div>' +
      '</div>' +
      '<div class="space-y-2">' +
        '<div class="flex justify-between"><span class="text-gray-500">Monthly Debt</span><span class="font-medium text-gray-900">' + (cl.monthly_debt ? $(Number(cl.monthly_debt)) + '/mo' : '-') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">Next Follow-up</span><span class="font-medium text-gray-900">' + (cl.next_follow_up ? D(cl.next_follow_up) : '-') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">Notes</span><span class="font-medium text-gray-900 truncate max-w-[150px]" title="' + E(cl.notes || '') + '">' + E(cl.notes ? cl.notes.substring(0, 60) : '-') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">Source</span><span class="font-medium text-gray-900">' + E(cl.source || '-') + '</span></div>' +
      '</div>' +
    '</div>';
    return _card('home', 'Property Info', 'Workspace.editClient()', body, '#B8860B');
  }

  // ── Prospect: CMA Inline Card ──
  function _prospectCmaCard() {
    var body = '<div id="swCmaContent">' +
      '<div class="text-center py-6">' +
        '<i class="fas fa-chart-bar text-3xl text-gray-300 mb-3"></i>' +
        '<p class="text-sm text-gray-500 mb-3">Run a Comparative Market Analysis to help set list price</p>' +
        '<button class="btn btn-sm btn-gold" onclick="SellerWorkspace._runCMA()"><i class="fas fa-play mr-1"></i> Run CMA</button>' +
      '</div>' +
    '</div>';
    return _card('chart-bar', 'CMA — Comparative Market Analysis', '', body, '#3B82F6');
  }

  // ── Prospect: Market Data Card ──
  function _prospectMarketDataCard(cl) {
    var neighborhood = cl.neighborhood || cl.preferred_neighborhoods || '';
    var body = '<div id="swMarketData">' +
      '<div class="grid grid-cols-3 gap-3 text-center">' +
        '<div class="p-3 bg-gray-50 rounded-lg">' +
          '<p class="text-xs text-gray-500">Median $/sqft</p>' +
          '<p class="text-lg font-bold text-gray-700" id="swMktPsf">—</p>' +
        '</div>' +
        '<div class="p-3 bg-gray-50 rounded-lg">' +
          '<p class="text-xs text-gray-500">Avg DOM</p>' +
          '<p class="text-lg font-bold text-gray-700" id="swMktDom">—</p>' +
        '</div>' +
        '<div class="p-3 bg-gray-50 rounded-lg">' +
          '<p class="text-xs text-gray-500">Recent Sales</p>' +
          '<p class="text-lg font-bold text-gray-700" id="swMktSales">—</p>' +
        '</div>' +
      '</div>' +
      (neighborhood ? '<p class="text-xs text-gray-400 mt-2 text-center">Neighborhood: ' + E(neighborhood) + '</p>' : '') +
    '</div>';
    return _card('chart-area', 'Market Data', '', body);
  }

  // ── Prospect: Outreach History ──
  function _prospectOutreachCard() {
    var body = '<div id="swOutreachTimeline">' + UI.loading() + '</div>';
    return _card('history', 'Outreach History', '', body);
  }

  function _fetchOutreachHistory() {
    var el = document.getElementById('swOutreachTimeline');
    if (!el) return;

    MallanAPI._fetch('/api/crm/events?entity_id=' + _currentClientId + '&entity_type=client&limit=20').then(function (data) {
      var events = data.events || data.activities || data || [];
      if (!Array.isArray(events) || events.length === 0) {
        el.innerHTML = '<div class="text-center py-4">' +
          '<i class="fas fa-inbox text-2xl text-gray-300 mb-2"></i>' +
          '<p class="text-xs text-gray-400">No outreach history yet</p>' +
        '</div>';
        return;
      }

      var items = events.map(function (ev) {
        return {
          title: ev.title || ev.type || ev.action || 'Activity',
          description: ev.description || ev.details || ev.notes || '',
          time: D(ev.created_at || ev.createdAt || ev.date || ''),
          dotClass: ev.type === 'email' ? 'dot-blue' : ev.type === 'call' ? 'dot-green' : ''
        };
      });
      el.innerHTML = UI.timeline(items);
    }).catch(function () {
      el.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">Could not load outreach history</p>';
    });
  }

  // ── Prospect: Outreach Templates ──
  function _prospectOutreachTemplates(cl) {
    var body = '<div class="grid grid-cols-2 gap-2">' +
      '<button class="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 text-center transition-all" onclick="SellerWorkspace._sendTemplate(\'initial_outreach\')">' +
        '<i class="fas fa-envelope text-lg text-blue-500 mb-1"></i>' +
        '<p class="text-xs font-bold text-gray-700">Initial Outreach</p>' +
      '</button>' +
      '<button class="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 text-center transition-all" onclick="SellerWorkspace._sendTemplate(\'market_update\')">' +
        '<i class="fas fa-chart-line text-lg text-green-500 mb-1"></i>' +
        '<p class="text-xs font-bold text-gray-700">Market Update</p>' +
      '</button>' +
      '<button class="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 text-center transition-all" onclick="SellerWorkspace._sendTemplate(\'cma_followup\')">' +
        '<i class="fas fa-chart-bar text-lg text-amber-500 mb-1"></i>' +
        '<p class="text-xs font-bold text-gray-700">CMA Follow-Up</p>' +
      '</button>' +
      '<button class="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 text-center transition-all" onclick="SellerWorkspace._sendTemplate(\'listing_appointment\')">' +
        '<i class="fas fa-calendar-check text-lg text-purple-500 mb-1"></i>' +
        '<p class="text-xs font-bold text-gray-700">Listing Appointment</p>' +
      '</button>' +
    '</div>';
    return _card('paper-plane', 'Outreach Templates', '', body);
  }

  function _sendTemplate(templateKey) {
    CRM.toast('Opening ' + templateKey.replace(/_/g, ' ') + ' template...', 'info');
    // Future: open email composer with template pre-filled
  }

  // ── Prospect: Right Rail ──
  function _prospectRightRail(cl) {
    var html = '';

    // Quick Actions
    html += '<div class="card p-3"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Quick Actions</h4>' +
      '<div class="space-y-1.5">' +
        '<button class="w-full text-left px-3 py-2 rounded-lg hover:bg-amber-50 text-sm font-medium text-gray-700 flex items-center gap-2" onclick="SellerWorkspace._openConvertModal()">' +
          '<i class="fas fa-file-signature text-amber-600 w-4"></i> Convert to Listing</button>' +
        '<button class="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center gap-2" onclick="SellerWorkspace._runCMA()">' +
          '<i class="fas fa-chart-bar text-blue-500 w-4"></i> Run CMA</button>' +
        '<button class="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center gap-2" onclick="Workspace._quickAddNote()">' +
          '<i class="fas fa-sticky-note text-yellow-500 w-4"></i> Add Note</button>' +
        '<button class="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center gap-2" onclick="Workspace._quickAddTask()">' +
          '<i class="fas fa-tasks text-purple-500 w-4"></i> Add Task</button>' +
      '</div>' +
    '</div>';

    // Lead Score
    html += '<div class="card p-3" id="swProspectLeadScore">' +
      '<h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Lead Score</h4>' +
      '<div class="flex items-center justify-center py-3">' +
        '<div class="w-16 h-16 rounded-full border-4 border-gray-200 flex items-center justify-center">' +
          '<span class="text-xl font-bold text-gray-300">—</span>' +
        '</div>' +
      '</div>' +
    '</div>';

    // Next Best Action
    html += '<div class="card p-3">' +
      '<h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Next Best Action</h4>' +
      '<div id="swNextAction" class="text-sm text-gray-600">' +
        '<div class="flex items-start gap-2 p-2 bg-amber-50 rounded-lg">' +
          '<i class="fas fa-lightbulb text-amber-500 mt-0.5"></i>' +
          '<div>' +
            '<p class="font-medium text-amber-800">Schedule a CMA presentation</p>' +
            '<p class="text-xs text-amber-600 mt-0.5">Show the seller what their property is worth in today\'s market</p>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

    // Alerts
    var alerts = [];
    try { alerts = Alerts.getForEntity('client', _currentClientId) || []; } catch (e) { /* */ }
    if (alerts.length > 0) {
      html += '<div class="card p-3">' +
        '<h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Alerts</h4>' +
        '<div class="space-y-1.5">';
      alerts.forEach(function (a) {
        html += '<div class="flex items-start gap-2 p-2 rounded-lg text-xs border ' +
          (a.severity === 'urgent' ? 'bg-red-50 border-red-200 text-red-700' : a.severity === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : 'bg-blue-50 border-blue-200 text-blue-700') + '">' +
          '<i class="fas fa-' + (a.icon || 'bell') + ' mt-0.5"></i>' +
          '<span>' + E(a.message || a.title || '') + '</span>' +
        '</div>';
      });
      html += '</div></div>';
    }

    return html;
  }

  function _fetchProspectLeadScore() {
    var el = document.getElementById('swProspectLeadScore');
    if (!el) return;

    MallanAPI._fetch('/api/crm/lead-scoring/' + _currentClientId').then(function (data) {
      var score = data.score || data.lead_score || 0;
      var color = score >= 70 ? '#059669' : score >= 40 ? '#F59E0B' : '#9CA3AF';
      el.innerHTML = '<h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Lead Score</h4>' +
        '<div class="flex items-center justify-center py-3">' +
          '<div class="relative w-16 h-16">' +
            '<svg class="w-16 h-16 -rotate-90" viewBox="0 0 64 64">' +
              '<circle cx="32" cy="32" r="27" fill="none" stroke="#E5E7EB" stroke-width="5"/>' +
              '<circle cx="32" cy="32" r="27" fill="none" stroke="' + color + '" stroke-width="5" stroke-dasharray="' + (2 * Math.PI * 27) + '" stroke-dashoffset="' + (2 * Math.PI * 27 * (1 - score / 100)) + '" stroke-linecap="round"/>' +
            '</svg>' +
            '<div class="absolute inset-0 flex items-center justify-center">' +
              '<span class="text-lg font-bold" style="color:' + color + '">' + score + '</span>' +
            '</div>' +
          '</div>' +
        '</div>';
    }).catch(function () {
      // Leave default placeholder
    });
  }

  // ── Prospect: Run CMA ──
  function _runCMA() {
    var el = document.getElementById('swCmaContent');
    if (el) {
      el.innerHTML = '<div class="text-center py-4">' + UI.loading() + '<p class="text-xs text-gray-400 mt-2">Running CMA...</p></div>';
    }

    MallanAPI._fetch('/api/crm/cma/' + _currentClientId).then(function (data) {
      if (!el) return;
      var comps = data.comps || data.comparables || [];
      if (comps.length === 0) {
        el.innerHTML = '<div class="text-center py-4">' +
          '<i class="fas fa-search text-2xl text-gray-300 mb-2"></i>' +
          '<p class="text-sm text-gray-500">No comparable sales found in this area</p>' +
        '</div>';
        return;
      }

      var html = '<div class="space-y-2">';
      if (data.estimated_value) {
        html += '<div class="p-3 bg-green-50 border border-green-200 rounded-lg text-center mb-3">' +
          '<p class="text-xs text-gray-500">Estimated Value</p>' +
          '<p class="text-2xl font-bold text-green-700">' + $(data.estimated_value) + '</p>' +
          (data.price_range ? '<p class="text-xs text-gray-500 mt-1">Range: ' + $(data.price_range.low) + ' - ' + $(data.price_range.high) + '</p>' : '') +
        '</div>';
      }

      html += '<p class="text-xs font-bold text-gray-500 uppercase mb-1">Comparable Sales (' + comps.length + ')</p>';
      comps.forEach(function (comp) {
        html += '<div class="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">' +
          '<div class="flex-1 min-w-0">' +
            '<p class="font-medium text-gray-900 truncate">' + E(comp.address || comp.street_address || '-') + '</p>' +
            '<p class="text-xs text-gray-500">' + (comp.beds || '-') + ' bed / ' + (comp.baths || '-') + ' bath' +
              (comp.sqft ? ' / ' + comp.sqft + ' sqft' : '') + '</p>' +
          '</div>' +
          '<div class="text-right flex-shrink-0 ml-3">' +
            '<p class="font-bold text-gray-900">' + (comp.price ? $(comp.price) : '-') + '</p>' +
            '<p class="text-xs text-gray-500">' + (comp.sold_date ? D(comp.sold_date) : '') + '</p>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
      el.innerHTML = html;
    }).catch(function (err) {
      if (el) {
        el.innerHTML = '<div class="text-center py-4">' +
          '<i class="fas fa-exclamation-circle text-xl text-red-400 mb-2"></i>' +
          '<p class="text-sm text-red-600">CMA failed: ' + E(err.message || 'Unknown error') + '</p>' +
          '<button class="btn btn-sm btn-outline mt-2" onclick="SellerWorkspace._runCMA()">Retry</button>' +
        '</div>';
      }
    });
  }

  // ── Prospect: Convert Modal ──
  function _openConvertModal() {
    var cl = ClientNormalizer.normalize(_currentClient || {});
    var today = new Date().toISOString().split('T')[0];
    var sixMonths = new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0];

    CRM.openModal('Convert to Active Listing', '<div class="space-y-4">' +
      '<div class="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">' +
        '<i class="fas fa-info-circle mr-1"></i> This will create an exclusive sale listing and move this seller to Active status.' +
      '</div>' +
      '<div><label class="text-xs font-bold text-gray-500">Property Address</label>' +
        '<input id="cvAddress" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.property_address || '') + '" placeholder="e.g., 400 East 90th Street, Apt 17C"></div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Exclusive Start Date</label>' +
          '<input id="cvStartDate" type="date" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + today + '"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Exclusive Expire Date</label>' +
          '<input id="cvExpireDate" type="date" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + sixMonths + '"></div>' +
      '</div>' +
      '<div><label class="text-xs font-bold text-gray-500">List Price</label>' +
        '<input id="cvListPrice" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="e.g., 1500000"></div>' +
      '<button class="btn btn-gold w-full py-3 text-base font-bold" onclick="SellerWorkspace._submitConvert()">' +
        '<i class="fas fa-check-circle mr-2"></i> Create Listing' +
      '</button>' +
    '</div>');
  }

  function _submitConvert() {
    var address = document.getElementById('cvAddress').value.trim();
    var startDate = document.getElementById('cvStartDate').value;
    var expireDate = document.getElementById('cvExpireDate').value;
    var listPrice = Number(document.getElementById('cvListPrice').value) || 0;

    if (!address) return CRM.toast('Property address is required', 'error');
    if (!startDate) return CRM.toast('Exclusive start date is required', 'error');
    if (!listPrice) return CRM.toast('List price is required', 'error');

    MallanAPI._fetch('/api/crm/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personId: _currentClientId,
        action: 'promote_to_listing',
        listingDraft: {
          listing_type: 'sale',
          address: address,
          exclusive_start_date: startDate,
          exclusive_expire_date: expireDate,
          list_price: listPrice
        }
      })
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Listing created! Moving to active workspace...', 'success');
      // Navigate to the active workspace (will auto-detect active phase)
      Router.navigate('/workspace/client/' + _currentClientId + '/overview');
      Workspace.openClient(_currentClientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed to convert: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ACTIVE MODE — LISTING BACKEND
  // ═══════════════════════════════════════════════════════════════════════

  var ACTIVE_TABS = [
    { id: 'overview',    label: 'Overview',     icon: 'fa-th-large' },
    { id: 'showings',    label: 'Showings',     icon: 'fa-calendar' },
    { id: 'openhouses',  label: 'Open Houses',  icon: 'fa-door-open' },
    { id: 'offers',      label: 'Offers',       icon: 'fa-hand-holding-usd' },
    { id: 'documents',   label: 'Documents',    icon: 'fa-folder' },
    { id: 'marketing',   label: 'Marketing',    icon: 'fa-bullhorn' },
    { id: 'financial',   label: 'Financial',    icon: 'fa-calculator' },
    { id: 'activity',    label: 'Activity',     icon: 'fa-stream' }
  ];

  function renderActive(client, container, clientId) {
    _currentClient = client;
    _currentClientId = clientId;
    _currentListing = null;
    _activeTab = 'overview';

    var cl = ClientNormalizer.normalize(client);
    var displayName = cl._displayName || ClientNormalizer.displayName(cl);
    var listingId = cl.active_sale_listing_id || cl.activeSaleListingId || '';

    var html = '<div class="space-y-0">';

    // ── Back navigation ──
    html += '<div class="flex items-center gap-2 mb-2">' +
      '<button class="text-sm text-gray-500 hover:text-gray-700" onclick="Router.navigate(\'/sales/sellers\')"><i class="fas fa-arrow-left mr-1"></i> Active Sellers</button>' +
    '</div>';

    // ── Header — seller name + listing address ──
    html += '<div class="workspace-header">' +
      '<div class="flex items-center justify-between">' +
        '<div class="flex items-center gap-4">' +
          UI.avatar(displayName, 48) +
          '<div>' +
            '<h2 class="text-xl font-bold text-gray-900">' + E(displayName) + '</h2>' +
            '<div class="flex items-center gap-2 mt-1">' +
              '<span class="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded font-bold uppercase">Active Seller</span>' +
              '<span id="swListingAddress" class="text-sm text-gray-500">' + E(cl.property_address || 'Loading listing...') + '</span>' +
            '</div>' +
            '<div class="flex items-center gap-3 mt-1" id="swListingMeta">' +
              '<span class="text-xs text-gray-400">Loading listing details...</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="flex gap-2">' +
          '<button class="btn btn-sm btn-outline" onclick="Workspace.editClient()"><i class="fas fa-edit"></i> Edit</button>' +
          (listingId ? '<button class="btn btn-sm btn-outline" onclick="SellerWorkspace._openListingForm()"><i class="fas fa-external-link-alt"></i> Edit Listing</button>' : '') +
        '</div>' +
      '</div>' +
    '</div>';

    // ── Tabs ──
    html += UI.tabs(ACTIVE_TABS, _activeTab, 'SellerWorkspace._switchTab');

    // ── Tab Content ──
    html += '<div id="swTabContent" class="mt-0">' + UI.loading() + '</div>';

    html += '</div>'; // space-y

    container.innerHTML = html;

    // Fetch listing data then render first tab
    if (listingId) {
      MallanAPI._fetch('/api/crm/listings/' + listingId).then(function (data) {
        _currentListing = data.listing || data;
        _updateListingHeader();
        _renderActiveTab();
      }).catch(function () {
        _currentListing = null;
        _renderActiveTab();
      });
    } else {
      _renderActiveTab();
    }
  }

  function _updateListingHeader() {
    if (!_currentListing) return;
    var ls = _currentListing;

    var addrEl = document.getElementById('swListingAddress');
    if (addrEl) {
      addrEl.textContent = ls.address || ls.street_address || ls.UnparsedAddress || '';
    }

    var metaEl = document.getElementById('swListingMeta');
    if (metaEl) {
      var status = ls.status || ls.StandardStatus || ls.MlsStatus || 'Active';
      var price = ls.list_price || ls.ListPrice || ls.price || 0;
      var dom = ls.days_on_market || ls.DaysOnMarket || ls.dom || 0;
      var photoCount = 0;
      if (ls.photos && Array.isArray(ls.photos)) { photoCount = ls.photos.length; }
      else if (ls.PhotosCount != null) { photoCount = ls.PhotosCount; }
      else if (ls.photo_count != null) { photoCount = ls.photo_count; }

      var statusColors = {
        Active: 'bg-blue-100 text-blue-700', 'Active Under Contract': 'bg-purple-100 text-purple-700',
        Pending: 'bg-orange-100 text-orange-700', Closed: 'bg-green-100 text-green-700',
        Withdrawn: 'bg-gray-100 text-gray-600', Expired: 'bg-red-100 text-red-600'
      };
      var statusCls = statusColors[status] || 'bg-gray-100 text-gray-600';

      metaEl.innerHTML =
        '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + statusCls + '">' + E(status) + '</span>' +
        '<span class="text-sm font-bold text-gray-900">' + $(Number(price)) + '</span>' +
        '<span class="text-xs text-gray-500">' + dom + ' DOM</span>' +
        '<span class="text-xs text-gray-500"><i class="fas fa-camera mr-0.5"></i>' + photoCount + ' photos</span>';
    }
  }

  function _switchTab(tab) {
    _activeTab = tab;
    // Update tab visual
    document.querySelectorAll('.workspace-tab').forEach(function (el, i) {
      if (ACTIVE_TABS[i]) {
        el.classList.toggle('active', ACTIVE_TABS[i].id === tab);
      }
    });
    _renderActiveTab();
  }

  function _renderActiveTab() {
    var el = document.getElementById('swTabContent');
    if (!el) return;
    el.innerHTML = UI.loading();

    switch (_activeTab) {
      case 'overview':    _tabOverview(el); break;
      case 'showings':    _tabShowings(el); break;
      case 'openhouses':  _tabOpenHouses(el); break;
      case 'offers':      _tabOffers(el); break;
      case 'documents':   _tabDocuments(el); break;
      case 'marketing':   _tabMarketing(el); break;
      case 'financial':   _tabFinancial(el); break;
      case 'activity':    _tabActivity(el); break;
      default:            _tabOverview(el);
    }
  }

  // ── Active Tab: Overview ──
  function _tabOverview(el) {
    var cl = ClientNormalizer.normalize(_currentClient || {});
    var ls = _currentListing || {};

    var status = ls.status || ls.StandardStatus || 'Active';
    var price = ls.list_price || ls.ListPrice || ls.price || 0;
    var dom = ls.days_on_market || ls.DaysOnMarket || ls.dom || 0;
    var photoCount = 0;
    if (ls.photos && Array.isArray(ls.photos)) { photoCount = ls.photos.length; }
    else if (ls.PhotosCount != null) { photoCount = ls.PhotosCount; }
    else if (ls.photo_count != null) { photoCount = ls.photo_count; }

    var html = '<div class="flex gap-4">';

    // Main content (70%)
    html += '<div class="flex-1 min-w-0 space-y-4">';

    // Listing header card
    var listingBody = '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">' +
      '<div class="p-3 bg-gray-50 rounded-lg text-center">' +
        '<p class="text-xs text-gray-500">Status</p>' +
        '<p class="text-sm font-bold text-gray-800">' + E(status) + '</p>' +
      '</div>' +
      '<div class="p-3 bg-gray-50 rounded-lg text-center">' +
        '<p class="text-xs text-gray-500">List Price</p>' +
        '<p class="text-sm font-bold text-gray-800">' + $(Number(price)) + '</p>' +
      '</div>' +
      '<div class="p-3 bg-gray-50 rounded-lg text-center">' +
        '<p class="text-xs text-gray-500">Days on Market</p>' +
        '<p class="text-sm font-bold text-gray-800">' + dom + '</p>' +
      '</div>' +
      '<div class="p-3 bg-gray-50 rounded-lg text-center">' +
        '<p class="text-xs text-gray-500">Photos</p>' +
        '<p class="text-sm font-bold text-gray-800">' + photoCount + '</p>' +
      '</div>' +
    '</div>';

    // Distribution gates summary
    var syndicationStatus = ls.syndication_status || ls.idx_display_yn || 'unknown';
    var idxDisplay = ls.IDXEntireListingDisplayYN || ls.idx_display_yn;
    var internetDisplay = ls.InternetEntireListingDisplayYN || ls.internet_display_yn;
    listingBody += '<div class="mt-3 grid grid-cols-3 gap-2 text-xs">' +
      '<div class="flex items-center gap-1.5 p-2 rounded ' + (idxDisplay !== false ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700') + '">' +
        '<i class="fas ' + (idxDisplay !== false ? 'fa-check-circle' : 'fa-times-circle') + '"></i> IDX</div>' +
      '<div class="flex items-center gap-1.5 p-2 rounded ' + (internetDisplay !== false ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700') + '">' +
        '<i class="fas ' + (internetDisplay !== false ? 'fa-check-circle' : 'fa-times-circle') + '"></i> Internet</div>' +
      '<div class="flex items-center gap-1.5 p-2 rounded bg-blue-50 text-blue-700">' +
        '<i class="fas fa-share-alt"></i> ' + E(String(syndicationStatus)) + '</div>' +
    '</div>';

    html += _card('building', 'Listing Overview', 'SellerWorkspace._openListingForm()', listingBody, '#3B82F6');

    // Quick stats
    html += '<div id="swOverviewStats" class="grid grid-cols-4 gap-3">' +
      '<div class="p-3 bg-gray-50 rounded-lg text-center"><p class="text-xs text-gray-500">Showings</p><p class="text-lg font-bold" id="swStatShowings">—</p></div>' +
      '<div class="p-3 bg-gray-50 rounded-lg text-center"><p class="text-xs text-gray-500">Inquiries</p><p class="text-lg font-bold" id="swStatInquiries">—</p></div>' +
      '<div class="p-3 bg-gray-50 rounded-lg text-center"><p class="text-xs text-gray-500">Offers</p><p class="text-lg font-bold" id="swStatOffers">—</p></div>' +
      '<div class="p-3 bg-gray-50 rounded-lg text-center"><p class="text-xs text-gray-500">Portal Views</p><p class="text-lg font-bold" id="swStatViews">—</p></div>' +
    '</div>';

    // Seller Portal link
    html += '<div class="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">' +
      '<div><i class="fas fa-link text-amber-600 mr-2"></i><span class="text-sm font-medium text-amber-800">Seller Portal</span>' +
        '<p class="text-xs text-amber-600 mt-0.5">Share this link with the seller to track their listing</p></div>' +
      '<button class="btn btn-sm btn-outline" onclick="SellerWorkspace._copyPortalLink()"><i class="fas fa-copy mr-1"></i> Copy Link</button>' +
    '</div>';

    // Recent activity
    html += '<div id="swOverviewActivity">' + _card('stream', 'Recent Activity', '', UI.loading()) + '</div>';

    // Seller-specific cards (entity, attorney, intake, etc.)
    html += renderSellerSections(cl);

    html += '</div>';

    // Right rail (30%)
    html += '<div class="hidden lg:block w-72 flex-shrink-0"><div class="space-y-3">';
    html += _activeRightRail(cl);
    html += '</div></div>';

    html += '</div>'; // flex

    el.innerHTML = html;

    // Async fetches for stats
    _fetchOverviewStats();
    _fetchOverviewActivity();
  }

  function _activeRightRail(cl) {
    var html = '';

    // Quick Actions
    html += '<div class="card p-3"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Quick Actions</h4>' +
      '<div class="space-y-1.5">' +
        '<button class="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center gap-2" onclick="SellerWorkspace._openListingForm()">' +
          '<i class="fas fa-edit text-blue-500 w-4"></i> Edit Listing</button>' +
        '<button class="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center gap-2" onclick="SellerWorkspace._switchTab(\'showings\')">' +
          '<i class="fas fa-calendar text-green-500 w-4"></i> Add Showing</button>' +
        '<button class="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center gap-2" onclick="Workspace._quickAddNote()">' +
          '<i class="fas fa-sticky-note text-yellow-500 w-4"></i> Add Note</button>' +
        '<button class="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center gap-2" onclick="Workspace._quickAddTask()">' +
          '<i class="fas fa-tasks text-purple-500 w-4"></i> Add Task</button>' +
        '<button class="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center gap-2" onclick="SellerWorkspace._switchTab(\'offers\')">' +
          '<i class="fas fa-hand-holding-usd text-amber-500 w-4"></i> View Offers</button>' +
      '</div>' +
    '</div>';

    // Lead Score
    html += '<div class="card p-3" id="swActiveLeadScore">' +
      '<h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Seller Score</h4>' +
      '<div class="flex items-center justify-center py-3">' +
        '<div class="w-16 h-16 rounded-full border-4 border-gray-200 flex items-center justify-center">' +
          '<span class="text-xl font-bold text-gray-300">-</span>' +
        '</div>' +
      '</div>' +
    '</div>';

    // Alerts
    var alerts = [];
    try { alerts = Alerts.getForEntity('client', _currentClientId) || []; } catch (e) { /* */ }
    if (alerts.length > 0) {
      html += '<div class="card p-3">' +
        '<h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Alerts</h4>' +
        '<div class="space-y-1.5">';
      alerts.forEach(function (a) {
        html += '<div class="flex items-start gap-2 p-2 rounded-lg text-xs border ' +
          (a.severity === 'urgent' ? 'bg-red-50 border-red-200 text-red-700' : a.severity === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : 'bg-blue-50 border-blue-200 text-blue-700') + '">' +
          '<i class="fas fa-' + (a.icon || 'bell') + ' mt-0.5"></i>' +
          '<span>' + E(a.message || a.title || '') + '</span>' +
        '</div>';
      });
      html += '</div></div>';
    }

    return html;
  }

  function _fetchOverviewStats() {
    var listingId = _currentListing ? (_currentListing.id || _currentListing.listing_id || _currentListing.listingId) : null;
    if (!listingId) return;

    // Fetch showings count
    MallanAPI._fetch('/api/crm/showings?listing_id=' + listingId').then(function (data) {
      var count = (data.showings || data || []).length;
      var el = document.getElementById('swStatShowings');
      if (el) el.textContent = count;
    }).catch(function () { /* leave dash */ });

    // Fetch inquiries count
    MallanAPI._fetch('/api/crm/inquiries?listing_id=' + listingId + '&limit=1').then(function (data) {
      var count = data.total || (data.inquiries || []).length || 0;
      var el = document.getElementById('swStatInquiries');
      if (el) el.textContent = count;
    }).catch(function () { /* leave dash */ });

    // Fetch offers count
    MallanAPI._fetch('/api/crm/events?entity_id=' + listingId + '&entity_type=listing&type=offer').then(function (data) {
      var count = (data.offers || data || []).length;
      var el = document.getElementById('swStatOffers');
      if (el) el.textContent = count;
    }).catch(function () { /* leave dash */ });

    // Portal views — use activity events
    MallanAPI._fetch('/api/crm/events?entity_id=' + _currentClientId + '&entity_type=client&type=portal_view&limit=1').then(function (data) {
      var count = data.total || (data.events || []).length || 0;
      var el = document.getElementById('swStatViews');
      if (el) el.textContent = count;
    }).catch(function () { /* leave dash */ });
  }

  function _fetchOverviewActivity() {
    var actEl = document.getElementById('swOverviewActivity');
    if (!actEl) return;

    MallanAPI._fetch('/api/crm/events?entity_id=' + _currentClientId + '&entity_type=client&limit=10').then(function (data) {
      var events = data.events || data.activities || data || [];
      if (!Array.isArray(events) || events.length === 0) {
        actEl.innerHTML = _card('stream', 'Recent Activity', '', '<p class="text-xs text-gray-400 text-center py-3">No recent activity</p>');
        return;
      }
      var items = events.map(function (ev) {
        return {
          title: ev.title || ev.type || ev.action || 'Activity',
          description: ev.description || ev.details || ev.notes || '',
          time: D(ev.created_at || ev.createdAt || ev.date || '')
        };
      });
      actEl.innerHTML = _card('stream', 'Recent Activity', '', UI.timeline(items));
    }).catch(function () {
      actEl.innerHTML = _card('stream', 'Recent Activity', '', '<p class="text-xs text-gray-400 text-center py-2">Could not load activity</p>');
    });
  }

  // ── Active Tab: Showings ──
  function _tabShowings(el) {
    var listingId = _currentListing ? (_currentListing.id || _currentListing.listing_id || _currentListing.listingId) : null;
    if (!listingId) {
      el.innerHTML = UI.emptyState('fa-calendar', 'No listing linked — cannot display showings');
      return;
    }

    MallanAPI._fetch('/api/crm/showings?listing_id=' + listingId').then(function (data) {
      var showings = data.showings || data || [];
      if (!Array.isArray(showings) || showings.length === 0) {
        el.innerHTML = UI.emptyState('fa-calendar', 'No showings scheduled yet',
          '<button class="btn btn-sm btn-gold" onclick="SellerWorkspace._addShowing()"><i class="fas fa-plus mr-1"></i> Add Showing</button>');
        return;
      }

      var columns = [
        { key: 'date', label: 'Date', render: function (r) { return E(D(r.date || r.showing_date || r.scheduled_at || '')); } },
        { key: 'buyer', label: 'Buyer', render: function (r) { return E(r.buyer_name || r.contact_name || r.name || '-'); } },
        { key: 'agent', label: 'Buyer Agent', render: function (r) { return E(r.buyer_agent || r.agent_name || '-'); } },
        { key: 'feedback', label: 'Feedback', render: function (r) { return E(r.feedback || r.notes || '-'); } },
        { key: 'interest', label: 'Interest', render: function (r) {
          var score = r.interest_score || r.interest || 0;
          var color = score >= 7 ? 'text-green-600' : score >= 4 ? 'text-yellow-600' : 'text-gray-400';
          return score ? '<span class="font-bold ' + color + '">' + score + '/10</span>' : '-';
        }}
      ];

      el.innerHTML = UI.dataTable(columns, showings, {
        title: 'Showings (' + showings.length + ')',
        actions: '<button class="btn btn-sm btn-gold" onclick="SellerWorkspace._addShowing()"><i class="fas fa-plus mr-1"></i> Add Showing</button>'
      });
    }).catch(function (err) {
      el.innerHTML = UI.emptyState('fa-exclamation-circle', 'Failed to load showings: ' + E(err.message || ''));
    });
  }

  function _addShowing() {
    CRM.openModal('Add Showing', '<div class="space-y-3">' +
      '<div><label class="text-xs font-bold text-gray-500">Buyer Name</label>' +
        '<input id="shBuyer" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="Buyer name"></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Buyer Agent</label>' +
        '<input id="shAgent" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="Agent name"></div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Date</label>' +
          '<input id="shDate" type="date" class="w-full border rounded px-3 py-2 text-sm mt-1"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Time</label>' +
          '<input id="shTime" type="time" class="w-full border rounded px-3 py-2 text-sm mt-1"></div>' +
      '</div>' +
      '<div><label class="text-xs font-bold text-gray-500">Notes</label>' +
        '<textarea id="shNotes" class="w-full border rounded px-3 py-2 text-sm mt-1" rows="2" placeholder="Optional notes"></textarea></div>' +
      '<button class="btn btn-gold w-full" onclick="SellerWorkspace._submitShowing()">Add Showing</button>' +
    '</div>');
  }

  function _submitShowing() {
    var listingId = _currentListing ? (_currentListing.id || _currentListing.listing_id || _currentListing.listingId) : null;
    if (!listingId) return CRM.toast('No listing linked', 'error');

    var buyer = document.getElementById('shBuyer').value.trim();
    var agent = document.getElementById('shAgent').value.trim();
    var date = document.getElementById('shDate').value;
    var time = document.getElementById('shTime').value;
    var notes = document.getElementById('shNotes').value.trim();

    if (!date) return CRM.toast('Date is required', 'error');

    MallanAPI._fetch('/api/crm/showings?listing_id=' + listingId', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyer_name: buyer,
        buyer_agent: agent,
        showing_date: date + (time ? 'T' + time + ':00' : ''),
        notes: notes
      })
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Showing added', 'success');
      _switchTab('showings');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  // ── Active Tab: Open Houses ──
  function _tabOpenHouses(el) {
    var listingId = _currentListing ? (_currentListing.id || _currentListing.listing_id || _currentListing.listingId) : null;
    if (!listingId) {
      el.innerHTML = UI.emptyState('fa-door-open', 'No listing linked');
      return;
    }

    MallanAPI._fetch('/api/crm/events?entity_id=' + listingId + '&entity_type=listing&type=open_house').then(function (data) {
      var openHouses = data.openHouses || data.open_houses || data || [];
      if (!Array.isArray(openHouses) || openHouses.length === 0) {
        el.innerHTML = UI.emptyState('fa-door-open', 'No open houses scheduled',
          '<button class="btn btn-sm btn-gold" onclick="SellerWorkspace._addOpenHouse()"><i class="fas fa-plus mr-1"></i> Schedule Open House</button>');
        return;
      }

      var columns = [
        { key: 'date', label: 'Date', render: function (r) { return E(D(r.date || r.open_house_date || '')); } },
        { key: 'time', label: 'Time', render: function (r) { return E((r.start_time || '') + (r.end_time ? ' - ' + r.end_time : '')); } },
        { key: 'attendees', label: 'Attendees', render: function (r) { return '<span class="font-bold">' + (r.attendee_count || r.attendees || 0) + '</span>'; } },
        { key: 'leads', label: 'Leads Generated', render: function (r) { return '<span class="font-bold text-green-600">' + (r.leads_generated || r.leads || 0) + '</span>'; } },
        { key: 'status', label: 'Status', render: function (r) {
          var s = r.status || 'scheduled';
          var colors = { scheduled: 'bg-blue-100 text-blue-700', completed: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-700' };
          return '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + (colors[s] || colors.scheduled) + '">' + E(s) + '</span>';
        }}
      ];

      el.innerHTML = UI.dataTable(columns, openHouses, {
        title: 'Open Houses (' + openHouses.length + ')',
        actions: '<button class="btn btn-sm btn-gold" onclick="SellerWorkspace._addOpenHouse()"><i class="fas fa-plus mr-1"></i> Schedule Open House</button>'
      });
    }).catch(function (err) {
      el.innerHTML = UI.emptyState('fa-exclamation-circle', 'Failed to load open houses: ' + E(err.message || ''));
    });
  }

  function _addOpenHouse() {
    CRM.openModal('Schedule Open House', '<div class="space-y-3">' +
      '<div><label class="text-xs font-bold text-gray-500">Date</label>' +
        '<input id="ohDate" type="date" class="w-full border rounded px-3 py-2 text-sm mt-1"></div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Start Time</label>' +
          '<input id="ohStart" type="time" class="w-full border rounded px-3 py-2 text-sm mt-1" value="12:00"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">End Time</label>' +
          '<input id="ohEnd" type="time" class="w-full border rounded px-3 py-2 text-sm mt-1" value="14:00"></div>' +
      '</div>' +
      '<div><label class="text-xs font-bold text-gray-500">Notes</label>' +
        '<textarea id="ohNotes" class="w-full border rounded px-3 py-2 text-sm mt-1" rows="2" placeholder="Optional notes"></textarea></div>' +
      '<button class="btn btn-gold w-full" onclick="SellerWorkspace._submitOpenHouse()">Schedule</button>' +
    '</div>');
  }

  function _submitOpenHouse() {
    var listingId = _currentListing ? (_currentListing.id || _currentListing.listing_id || _currentListing.listingId) : null;
    if (!listingId) return CRM.toast('No listing linked', 'error');

    var date = document.getElementById('ohDate').value;
    var start = document.getElementById('ohStart').value;
    var end = document.getElementById('ohEnd').value;
    var notes = document.getElementById('ohNotes').value.trim();

    if (!date) return CRM.toast('Date is required', 'error');

    MallanAPI._fetch('/api/crm/events?entity_id=' + listingId + '&entity_type=listing&type=open_house', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        open_house_date: date,
        start_time: start,
        end_time: end,
        notes: notes
      })
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Open house scheduled', 'success');
      _switchTab('openhouses');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  // ── Active Tab: Offers ──
  function _tabOffers(el) {
    var listingId = _currentListing ? (_currentListing.id || _currentListing.listing_id || _currentListing.listingId) : null;
    if (!listingId) {
      el.innerHTML = UI.emptyState('fa-hand-holding-usd', 'No listing linked');
      return;
    }

    MallanAPI._fetch('/api/crm/events?entity_id=' + listingId + '&entity_type=listing&type=offer').then(function (data) {
      var offers = data.offers || data || [];
      if (!Array.isArray(offers) || offers.length === 0) {
        el.innerHTML = UI.emptyState('fa-hand-holding-usd', 'No offers received yet',
          '<button class="btn btn-sm btn-gold" onclick="SellerWorkspace._addOffer()"><i class="fas fa-plus mr-1"></i> Record Offer</button>');
        return;
      }

      var columns = [
        { key: 'buyer', label: 'Buyer', render: function (r) { return '<span class="font-medium">' + E(r.buyer_name || r.name || '-') + '</span>'; } },
        { key: 'amount', label: 'Amount', render: function (r) { return '<span class="font-bold">' + $(Number(r.amount || r.offer_amount || r.price || 0)) + '</span>'; } },
        { key: 'status', label: 'Status', render: function (r) {
          var s = (r.status || 'pending').toLowerCase();
          var colors = { pending: 'bg-yellow-100 text-yellow-700', accepted: 'bg-green-100 text-green-700', countered: 'bg-blue-100 text-blue-700', rejected: 'bg-red-100 text-red-700' };
          return '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + (colors[s] || colors.pending) + '">' + E(s) + '</span>';
        }},
        { key: 'date', label: 'Date', render: function (r) { return E(D(r.date || r.created_at || r.offer_date || '')); } },
        { key: 'actions', label: '', render: function (r) {
          var id = r.id || r.offer_id || '';
          var s = (r.status || 'pending').toLowerCase();
          if (s !== 'pending') return '';
          return '<div class="flex gap-1">' +
            '<button class="btn btn-xs bg-green-100 text-green-700 hover:bg-green-200" onclick="SellerWorkspace._updateOfferStatus(\'' + E(id) + '\',\'accepted\')">Accept</button>' +
            '<button class="btn btn-xs bg-blue-100 text-blue-700 hover:bg-blue-200" onclick="SellerWorkspace._updateOfferStatus(\'' + E(id) + '\',\'countered\')">Counter</button>' +
            '<button class="btn btn-xs bg-red-100 text-red-700 hover:bg-red-200" onclick="SellerWorkspace._updateOfferStatus(\'' + E(id) + '\',\'rejected\')">Reject</button>' +
          '</div>';
        }}
      ];

      el.innerHTML = UI.dataTable(columns, offers, {
        title: 'Offers (' + offers.length + ')',
        actions: '<button class="btn btn-sm btn-gold" onclick="SellerWorkspace._addOffer()"><i class="fas fa-plus mr-1"></i> Record Offer</button>'
      });
    }).catch(function (err) {
      el.innerHTML = UI.emptyState('fa-exclamation-circle', 'Failed to load offers: ' + E(err.message || ''));
    });
  }

  function _addOffer() {
    CRM.openModal('Record Offer', '<div class="space-y-3">' +
      '<div><label class="text-xs font-bold text-gray-500">Buyer Name</label>' +
        '<input id="ofBuyer" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="Buyer name"></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Offer Amount</label>' +
        '<input id="ofAmount" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="e.g., 1500000"></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Date</label>' +
        '<input id="ofDate" type="date" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + new Date().toISOString().split('T')[0] + '"></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Notes / Conditions</label>' +
        '<textarea id="ofNotes" class="w-full border rounded px-3 py-2 text-sm mt-1" rows="2" placeholder="Financing terms, contingencies, etc."></textarea></div>' +
      '<button class="btn btn-gold w-full" onclick="SellerWorkspace._submitOffer()">Record Offer</button>' +
    '</div>');
  }

  function _submitOffer() {
    var listingId = _currentListing ? (_currentListing.id || _currentListing.listing_id || _currentListing.listingId) : null;
    if (!listingId) return CRM.toast('No listing linked', 'error');

    var buyer = document.getElementById('ofBuyer').value.trim();
    var amount = Number(document.getElementById('ofAmount').value) || 0;
    var date = document.getElementById('ofDate').value;
    var notes = document.getElementById('ofNotes').value.trim();

    if (!buyer) return CRM.toast('Buyer name is required', 'error');
    if (!amount) return CRM.toast('Offer amount is required', 'error');

    MallanAPI._fetch('/api/crm/events?entity_id=' + listingId + '&entity_type=listing&type=offer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyer_name: buyer,
        amount: amount,
        offer_date: date,
        notes: notes,
        status: 'pending'
      })
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Offer recorded', 'success');
      _switchTab('offers');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _updateOfferStatus(offerId, status) {
    var listingId = _currentListing ? (_currentListing.id || _currentListing.listing_id || _currentListing.listingId) : null;
    if (!listingId || !offerId) return;

    MallanAPI._fetch('/api/crm/events?entity_id=' + listingId + '&entity_type=listing&type=offer/' + offerId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status })
    }).then(function () {
      CRM.toast('Offer ' + status, 'success');
      _switchTab('offers');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  // ── Active Tab: Documents ──
  function _tabDocuments(el) {
    var cl = ClientNormalizer.normalize(_currentClient || {});
    var html = '<div class="space-y-4">';

    // Documents collection tracker
    html += _documentsTrackerCard(cl);

    // Disclosures
    html += _disclosuresCard(cl);

    // Upload / Request section
    html += '<div class="flex gap-2">' +
      '<button class="btn btn-sm btn-gold flex-1" onclick="SellerWorkspace._uploadDocument()"><i class="fas fa-upload mr-1"></i> Upload Document</button>' +
      '<button class="btn btn-sm btn-outline flex-1" onclick="SellerWorkspace._requestDocument()"><i class="fas fa-paper-plane mr-1"></i> Request from Seller</button>' +
    '</div>';

    html += '</div>';
    el.innerHTML = html;
  }

  function _uploadDocument() {
    CRM.toast('Opening document upload...', 'info');
    // Future: open file upload modal
  }

  function _requestDocument() {
    CRM.toast('Opening document request...', 'info');
    // Future: send email to seller requesting specific documents
  }

  // ── Active Tab: Marketing ──
  function _tabMarketing(el) {
    var cl = ClientNormalizer.normalize(_currentClient || {});
    var html = '<div class="space-y-4">';

    // Home prep checklist
    html += _homePrepCard(cl);

    // Marketing strategy
    html += _marketingStrategyCard(cl);

    // Syndication feeds
    var ls = _currentListing || {};
    var syndicationBody = '<div class="space-y-2">';
    var feeds = [
      { name: 'REBNY RLS', status: ls.rls_eligible !== false ? 'active' : 'off', icon: 'fa-building' },
      { name: 'StreetEasy', status: ls.streetease_syndicated ? 'active' : 'pending', icon: 'fa-search' },
      { name: 'Zillow / Trulia', status: ls.zillow_syndicated ? 'active' : 'pending', icon: 'fa-home' },
      { name: 'Realtor.com', status: 'auto', icon: 'fa-globe' },
      { name: 'Redfin', status: 'auto', icon: 'fa-map-marker-alt' },
    ];
    feeds.forEach(function (f) {
      var statusCls = f.status === 'active' ? 'bg-green-100 text-green-700' : f.status === 'auto' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500';
      var statusLabel = f.status === 'active' ? 'Active' : f.status === 'auto' ? 'Auto (REBNY)' : 'Pending';
      syndicationBody += '<div class="flex items-center justify-between py-2 px-3 rounded hover:bg-gray-50">' +
        '<div class="flex items-center gap-2"><i class="fas ' + f.icon + ' text-gray-400 w-4"></i><span class="text-sm font-medium text-gray-700">' + E(f.name) + '</span></div>' +
        '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + statusCls + '">' + statusLabel + '</span>' +
      '</div>';
    });
    syndicationBody += '</div>';
    html += _card('share-alt', 'Syndication Feeds', '', syndicationBody);

    html += '</div>';
    el.innerHTML = html;
  }

  // ── Active Tab: Financial ──
  function _tabFinancial(el) {
    var cl = ClientNormalizer.normalize(_currentClient || {});
    var html = '<div class="space-y-4">';

    // Net proceeds calculator
    html += _netProceedsCard(cl);

    // Attorney card
    html += _attorneyCard(cl);

    // Entity card
    if (cl.entity_name || cl.entity_type) {
      html += _entityCard(cl);
    }

    // Intake summary
    html += _intakeSummaryCard(cl);

    html += '</div>';
    el.innerHTML = html;
  }

  // ── Active Tab: Activity ──
  function _tabActivity(el) {
    MallanAPI._fetch('/api/crm/events?entity_id=' + _currentClientId + '&entity_type=client&limit=50').then(function (data) {
      var events = data.events || data.activities || data || [];
      if (!Array.isArray(events) || events.length === 0) {
        el.innerHTML = UI.emptyState('fa-stream', 'No activity recorded yet');
        return;
      }

      var items = events.map(function (ev) {
        return {
          title: ev.title || ev.type || ev.action || 'Activity',
          description: ev.description || ev.details || ev.notes || '',
          time: D(ev.created_at || ev.createdAt || ev.date || ''),
          dotClass: ev.type === 'email' ? 'dot-blue' : ev.type === 'call' ? 'dot-green' : ev.type === 'showing' ? 'dot-amber' : ''
        };
      });

      el.innerHTML = '<div class="card">' +
        '<div class="card-header"><h3>Activity Timeline</h3></div>' +
        '<div class="card-body">' + UI.timeline(items) + '</div>' +
      '</div>';
    }).catch(function (err) {
      el.innerHTML = UI.emptyState('fa-exclamation-circle', 'Failed to load activity: ' + E(err.message || ''));
    });
  }

  // ── Active: Open listing form ──
  function _openListingForm() {
    var listingId = _currentListing ? (_currentListing.id || _currentListing.listing_id || _currentListing.listingId) : null;
    if (listingId) {
      window.open('SALE-FORM-REDESIGN.html?id=' + encodeURIComponent(listingId), '_blank');
    } else {
      window.open('SALE-FORM-REDESIGN.html', '_blank');
    }
  }

  // ── Active: Copy portal link ──
  function _copyPortalLink() {
    var link = window.location.origin + '/portal/seller/' + _currentClientId;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).then(function () {
        CRM.toast('Portal link copied', 'success');
      }).catch(function () {
        CRM.toast('Could not copy link', 'error');
      });
    } else {
      CRM.toast('Portal link: ' + link, 'info');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EXISTING EXTENSION FUNCTIONS (internal helpers)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Render seller-specific sections for the overview tab.
   * Called from workspace _clientOverview when client is a seller.
   * @param {Object} cl - normalized client
   * @returns {string} HTML
   */
  function renderSellerSections(cl) {
    var html = '';

    // Entity Ownership Card
    if (cl.entity_name || cl.entity_type) {
      html += _entityCard(cl);
    }

    // Attorney Card
    html += _attorneyCard(cl);

    // Seller Intake Summary
    html += _intakeSummaryCard(cl);

    // Home Prep Checklist
    html += _homePrepCard(cl);

    // Disclosures Checklist
    html += _disclosuresCard(cl);

    // Documents Collection Tracker
    html += _documentsTrackerCard(cl);

    // Marketing Strategy
    html += _marketingStrategyCard(cl);

    // Net Proceeds Calculator
    html += _netProceedsCard(cl);

    return html;
  }

  // ─── Entity Ownership ─────────────────────────────────────────────────
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
          (s.email ? '<span class="text-xs text-gray-400 ml-auto">' + E(s.email) + '</span>' : '') +
        '</div>';
      });
      body += '</div>';
    }

    return _card('landmark', 'Entity Ownership', 'SellerWorkspace._editEntity()', body, '#7C3AED');
  }

  // ─── Attorney ─────────────────────────────────────────────────────────
  function _attorneyCard(cl) {
    var hasAttorney = cl.attorney_name || cl.attorney_email || cl.attorney_phone;
    var body = '';
    if (hasAttorney) {
      body = '<div class="space-y-2 text-sm">' +
        '<div class="flex justify-between"><span class="text-gray-500">Name</span><span class="font-medium text-gray-900">' + E(cl.attorney_name || '-') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">Firm</span><span class="font-medium text-gray-900">' + E(cl.attorney_firm || '-') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">Email</span><span class="font-medium text-gray-900">' + E(cl.attorney_email || '-') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">Phone</span><span class="font-medium text-gray-900">' + E(cl.attorney_phone || '-') + '</span></div>' +
      '</div>';
    } else {
      body = '<div class="text-center py-3">' +
        '<i class="fas fa-gavel text-2xl text-gray-300 mb-2"></i>' +
        '<p class="text-xs text-gray-400 mb-2">No attorney on file</p>' +
        '<button class="btn btn-xs btn-outline" onclick="SellerWorkspace._editAttorney()"><i class="fas fa-plus mr-1"></i> Add Attorney</button>' +
      '</div>';
    }
    return _card('gavel', 'Attorney', hasAttorney ? 'SellerWorkspace._editAttorney()' : '', body);
  }

  // ─── Seller Intake Summary ────────────────────────────────────────────
  function _intakeSummaryCard(cl) {
    var buildingMgmt = {};
    try { buildingMgmt = cl.building_mgmt_requirements ? (typeof cl.building_mgmt_requirements === 'string' ? JSON.parse(cl.building_mgmt_requirements) : cl.building_mgmt_requirements) : {}; } catch (e) { /* */ }

    var body = '<div class="grid grid-cols-2 gap-4 text-sm">' +
      '<div>' +
        '<p class="text-xs font-bold text-gray-500 uppercase mb-2">Building Management</p>' +
        '<div class="space-y-1.5">' +
          '<div class="flex justify-between"><span class="text-gray-500">Flip Tax</span><span class="font-medium">' + E(buildingMgmt.flip_tax || '-') + '</span></div>' +
          '<div class="flex justify-between"><span class="text-gray-500">Board Approval</span><span class="font-medium">' + E(buildingMgmt.board_approval || '-') + '</span></div>' +
          '<div class="flex justify-between"><span class="text-gray-500">Move-Out Rules</span><span class="font-medium">' + E(buildingMgmt.move_out_rules || '-') + '</span></div>' +
          '<div class="flex justify-between"><span class="text-gray-500">Required Docs</span><span class="font-medium">' + E(buildingMgmt.required_docs || '-') + '</span></div>' +
        '</div>' +
      '</div>' +
      '<div>' +
        '<p class="text-xs font-bold text-gray-500 uppercase mb-2">Financial</p>' +
        '<div class="space-y-1.5">' +
          '<div class="flex justify-between"><span class="text-gray-500">Mortgage Balance</span><span class="font-medium">' + (cl.monthly_debt ? $(Number(cl.monthly_debt)) : '-') + '</span></div>' +
          '<div class="flex justify-between"><span class="text-gray-500">Liens</span><span class="font-medium">' + E(buildingMgmt.outstanding_liens || 'None') + '</span></div>' +
        '</div>' +
      '</div>' +
    '</div>';

    return _card('clipboard-list', 'Seller Intake', 'SellerWorkspace._editIntake()', body);
  }

  // ─── Home Prep Checklist ──────────────────────────────────────────────
  function _homePrepCard(cl) {
    var checklist = [];
    try { checklist = cl.home_prep_checklist ? (typeof cl.home_prep_checklist === 'string' ? JSON.parse(cl.home_prep_checklist) : cl.home_prep_checklist) : []; } catch (e) { /* */ }

    if (checklist.length === 0) {
      checklist = [
        { item: 'Declutter & deep clean', status: 'pending', notes: '' },
        { item: 'Repairs (paint, fixtures)', status: 'pending', notes: '' },
        { item: 'Professional staging', status: 'pending', notes: '' },
        { item: 'Photo shoot scheduled', status: 'pending', notes: '' },
        { item: 'Floor plan measured', status: 'pending', notes: '' },
      ];
    }

    var doneCount = checklist.filter(function (c) { return c.status === 'done'; }).length;
    var pct = checklist.length > 0 ? Math.round((doneCount / checklist.length) * 100) : 0;

    var body = '<div class="flex items-center gap-3 mb-3">' +
      '<div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">' +
        '<div class="h-full bg-green-500 rounded-full" style="width:' + pct + '%"></div>' +
      '</div>' +
      '<span class="text-xs font-bold text-gray-600">' + doneCount + '/' + checklist.length + '</span>' +
    '</div>';

    body += '<div class="space-y-1">';
    checklist.forEach(function (c, i) {
      var statusIcon = c.status === 'done' ? 'fa-check-circle text-green-500' : c.status === 'in_progress' ? 'fa-clock text-yellow-500' : 'fa-circle text-gray-300';
      var nextStatus = c.status === 'pending' ? 'in_progress' : c.status === 'in_progress' ? 'done' : 'pending';
      body += '<div class="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50 cursor-pointer" onclick="SellerWorkspace._cycleHomePrepStatus(' + i + ',\'' + nextStatus + '\')">' +
        '<i class="fas ' + statusIcon + ' text-sm"></i>' +
        '<span class="text-sm ' + (c.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700') + '">' + E(c.item) + '</span>' +
        (c.notes ? '<span class="text-xs text-gray-400 ml-auto">' + E(c.notes) + '</span>' : '') +
      '</div>';
    });
    body += '</div>';

    body += '<button class="btn btn-xs btn-outline mt-2 w-full" onclick="SellerWorkspace._addHomePrepItem()"><i class="fas fa-plus mr-1"></i> Add Item</button>';

    return _card('tools', 'Home Prep Checklist', 'SellerWorkspace._editHomePrep()', body, '#F59E0B');
  }

  // ─── Disclosures Checklist ────────────────────────────────────────────
  function _disclosuresCard(cl) {
    var disclosures = {};
    try { disclosures = cl.disclosures ? (typeof cl.disclosures === 'string' ? JSON.parse(cl.disclosures) : cl.disclosures) : {}; } catch (e) { /* */ }

    var items = [
      { key: 'property_condition', label: 'Property Condition Disclosure (NY DOS)', required: true },
      { key: 'lead_paint', label: 'Lead Paint Disclosure', required: true },
      { key: 'building_specific', label: 'Building-Specific Disclosures', required: false },
      { key: 'flood_zone', label: 'Flood Zone Notice', required: false },
      { key: 'mold', label: 'Mold Disclosure', required: false },
    ];

    var body = '<div class="space-y-1">';
    items.forEach(function (item) {
      var status = disclosures[item.key] || 'pending';
      var statusColors = { completed: 'text-green-500 fa-check-circle', pending: 'text-gray-300 fa-circle', waived: 'text-blue-500 fa-minus-circle' };
      var iconCls = statusColors[status] || statusColors.pending;
      body += '<div class="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50">' +
        '<i class="fas ' + iconCls + ' text-sm"></i>' +
        '<span class="text-sm text-gray-700 flex-1">' + E(item.label) + '</span>' +
        (item.required ? '<span class="text-[9px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-bold">REQ</span>' : '') +
        '<select class="text-xs border rounded px-1 py-0.5" onchange="SellerWorkspace._updateDisclosure(\'' + item.key + '\', this.value)">' +
          '<option value="pending"' + (status === 'pending' ? ' selected' : '') + '>Pending</option>' +
          '<option value="completed"' + (status === 'completed' ? ' selected' : '') + '>Completed</option>' +
          '<option value="waived"' + (status === 'waived' ? ' selected' : '') + '>Waived</option>' +
        '</select>' +
      '</div>';
    });
    body += '</div>';

    var allRequired = items.filter(function (i) { return i.required; });
    var requiredDone = allRequired.filter(function (i) { return disclosures[i.key] === 'completed'; }).length;
    if (requiredDone < allRequired.length) {
      body += '<div class="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">' +
        '<i class="fas fa-exclamation-triangle mr-1"></i> ' + (allRequired.length - requiredDone) + ' required disclosure(s) incomplete' +
      '</div>';
    }

    return _card('shield-alt', 'Disclosures', '', body, '#DC2626');
  }

  // ─── Documents Collection Tracker ─────────────────────────────────────
  function _documentsTrackerCard(cl) {
    var docs = {};
    try { docs = cl.documents_collected ? (typeof cl.documents_collected === 'string' ? JSON.parse(cl.documents_collected) : cl.documents_collected) : {}; } catch (e) { /* */ }

    var items = [
      { key: 'deed', label: 'Deed' },
      { key: 'mortgage_payoff', label: 'Mortgage Payoff Letter' },
      { key: 'board_docs', label: 'Board / Building Docs' },
      { key: 'tax_returns_yr1', label: 'Tax Returns (Year 1)' },
      { key: 'tax_returns_yr2', label: 'Tax Returns (Year 2)' },
      { key: 'coop_financials', label: 'Co-op/Condo Financials' },
      { key: 'listing_agreement', label: 'Listing Agreement' },
      { key: 'property_condition_disclosure', label: 'Property Condition Disclosure' },
    ];

    var collected = items.filter(function (item) { return docs[item.key] === true; }).length;

    var body = '<div class="flex items-center gap-3 mb-3">' +
      '<div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">' +
        '<div class="h-full bg-blue-500 rounded-full" style="width:' + Math.round((collected / items.length) * 100) + '%"></div>' +
      '</div>' +
      '<span class="text-xs font-bold text-gray-600">' + collected + '/' + items.length + ' collected</span>' +
    '</div>';

    body += '<div class="grid grid-cols-2 gap-1">';
    items.forEach(function (item) {
      var has = docs[item.key] === true;
      body += '<div class="flex items-center gap-2 py-1 px-2 rounded text-sm ' + (has ? 'bg-green-50' : 'bg-red-50') + ' cursor-pointer" ' +
        'onclick="SellerWorkspace._toggleDocument(\'' + item.key + '\',' + !has + ')">' +
        '<i class="fas ' + (has ? 'fa-check-circle text-green-500' : 'fa-times-circle text-red-400') + ' text-xs"></i>' +
        '<span class="' + (has ? 'text-green-700' : 'text-red-700') + '">' + E(item.label) + '</span>' +
      '</div>';
    });
    body += '</div>';

    if (collected < items.length) {
      body += '<div class="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">' +
        '<i class="fas fa-folder-open mr-1"></i> ' + (items.length - collected) + ' document(s) still needed' +
      '</div>';
    }

    return _card('folder-open', 'Documents Collection', '', body, '#3B82F6');
  }

  // ─── Marketing Strategy ───────────────────────────────────────────────
  function _marketingStrategyCard(cl) {
    var strategy = {};
    try { strategy = cl.marketing_strategy ? (typeof cl.marketing_strategy === 'string' ? JSON.parse(cl.marketing_strategy) : cl.marketing_strategy) : {}; } catch (e) { /* */ }

    var items = [
      { key: 'photos', label: 'Photo Shoot' },
      { key: 'staging', label: 'Staging' },
      { key: 'description', label: 'Listing Description' },
      { key: 'floor_plan', label: 'Floor Plan' },
      { key: 'virtual_tour', label: 'Virtual Tour' },
      { key: 'syndication', label: 'Syndication Plan' },
    ];

    var body = '<div class="space-y-1">';
    items.forEach(function (item) {
      var status = strategy[item.key] || 'not_started';
      var statusColors = { not_started: 'bg-gray-100 text-gray-600', scheduled: 'bg-blue-100 text-blue-700', in_progress: 'bg-yellow-100 text-yellow-700', done: 'bg-green-100 text-green-700' };
      body += '<div class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50">' +
        '<span class="text-sm text-gray-700">' + E(item.label) + '</span>' +
        '<select class="text-[10px] px-2 py-0.5 rounded font-bold border-0 ' + (statusColors[status] || statusColors.not_started) + '" ' +
          'onchange="SellerWorkspace._updateMarketing(\'' + item.key + '\', this.value)">' +
          '<option value="not_started"' + (status === 'not_started' ? ' selected' : '') + '>Not Started</option>' +
          '<option value="scheduled"' + (status === 'scheduled' ? ' selected' : '') + '>Scheduled</option>' +
          '<option value="in_progress"' + (status === 'in_progress' ? ' selected' : '') + '>In Progress</option>' +
          '<option value="done"' + (status === 'done' ? ' selected' : '') + '>Done</option>' +
        '</select>' +
      '</div>';
    });
    body += '</div>';

    return _card('bullhorn', 'Marketing Strategy', 'SellerWorkspace._editMarketing()', body);
  }

  // ─── Net Proceeds Calculator ──────────────────────────────────────────
  function _netProceedsCard(cl) {
    var ls = _currentListing || {};
    var defaultPrice = ls.list_price || ls.ListPrice || ls.price || '';
    var defaultMortgage = cl.monthly_debt || '';

    var body = '<div id="sellerNetProceeds">' +
      '<div class="grid grid-cols-2 gap-3 text-sm">' +
        '<div><label class="text-xs text-gray-500 block mb-1">Sale Price</label>' +
          '<input type="number" id="np_sale_price" class="w-full border rounded px-2 py-1.5 text-sm" placeholder="0" value="' + E(String(defaultPrice)) + '" oninput="SellerWorkspace._calcNetProceeds()"></div>' +
        '<div><label class="text-xs text-gray-500 block mb-1">Mortgage Balance</label>' +
          '<input type="number" id="np_mortgage" class="w-full border rounded px-2 py-1.5 text-sm" placeholder="0" value="' + E(String(defaultMortgage)) + '" oninput="SellerWorkspace._calcNetProceeds()"></div>' +
        '<div><label class="text-xs text-gray-500 block mb-1">Commission %</label>' +
          '<input type="number" id="np_commission_pct" class="w-full border rounded px-2 py-1.5 text-sm" placeholder="5" value="5" step="0.1" oninput="SellerWorkspace._calcNetProceeds()"></div>' +
        '<div><label class="text-xs text-gray-500 block mb-1">Transfer Tax %</label>' +
          '<input type="number" id="np_transfer_tax" class="w-full border rounded px-2 py-1.5 text-sm" placeholder="1.825" value="1.825" step="0.001" oninput="SellerWorkspace._calcNetProceeds()"></div>' +
        '<div><label class="text-xs text-gray-500 block mb-1">Flip Tax</label>' +
          '<input type="number" id="np_flip_tax" class="w-full border rounded px-2 py-1.5 text-sm" placeholder="0" oninput="SellerWorkspace._calcNetProceeds()"></div>' +
        '<div><label class="text-xs text-gray-500 block mb-1">Attorney Fees</label>' +
          '<input type="number" id="np_attorney" class="w-full border rounded px-2 py-1.5 text-sm" placeholder="3000" value="3000" oninput="SellerWorkspace._calcNetProceeds()"></div>' +
      '</div>' +
      '<div id="np_result" class="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-center hidden">' +
        '<p class="text-xs text-gray-500">Estimated Net Proceeds</p>' +
        '<p class="text-2xl font-bold text-green-700" id="np_amount">$0</p>' +
        '<div id="np_breakdown" class="mt-2 text-xs text-gray-500"></div>' +
      '</div>' +
    '</div>';

    return _card('calculator', 'Net Proceeds Calculator', '', body, '#059669');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ACTIONS — Save/update seller intake data
  // ═══════════════════════════════════════════════════════════════════════

  function _calcNetProceeds() {
    var price = Number(document.getElementById('np_sale_price').value) || 0;
    var mortgage = Number(document.getElementById('np_mortgage').value) || 0;
    var commPct = Number(document.getElementById('np_commission_pct').value) || 0;
    var transferPct = Number(document.getElementById('np_transfer_tax').value) || 0;
    var flipTax = Number(document.getElementById('np_flip_tax').value) || 0;
    var attorney = Number(document.getElementById('np_attorney').value) || 0;

    if (price <= 0) {
      document.getElementById('np_result').classList.add('hidden');
      return;
    }

    var commission = price * (commPct / 100);
    var transferTax = price * (transferPct / 100);
    var totalCosts = commission + transferTax + flipTax + attorney + mortgage;
    var net = price - totalCosts;

    var resultEl = document.getElementById('np_result');
    var amountEl = document.getElementById('np_amount');
    var breakdownEl = document.getElementById('np_breakdown');

    resultEl.classList.remove('hidden');
    if (net < 0) {
      resultEl.className = 'mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-center';
      amountEl.className = 'text-2xl font-bold text-red-700';
    } else {
      resultEl.className = 'mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-center';
      amountEl.className = 'text-2xl font-bold text-green-700';
    }

    amountEl.textContent = '$' + net.toLocaleString('en-US', { maximumFractionDigits: 0 });
    breakdownEl.innerHTML =
      'Commission: ' + $(commission) + ' | Transfer Tax: ' + $(transferTax) +
      ' | Flip Tax: ' + $(flipTax) + ' | Attorney: ' + $(attorney) +
      ' | Mortgage: ' + $(mortgage);
  }

  // ─── Home Prep Status Cycle ───────────────────────────────────────────
  function _cycleHomePrepStatus(index, newStatus) {
    _updateJsonField('home_prep_checklist', function (list) {
      if (!Array.isArray(list)) return list;
      if (list[index]) list[index].status = newStatus;
      return list;
    });
  }

  function _addHomePrepItem() {
    CRM.openModal('Add Prep Item', '<div class="space-y-3">' +
      '<div><label class="text-xs font-bold text-gray-500">Item</label>' +
        '<input id="hpItem" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="e.g., Replace kitchen faucet"></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Notes</label>' +
        '<input id="hpNotes" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="Optional notes"></div>' +
      '<button class="btn btn-gold w-full" onclick="SellerWorkspace._submitHomePrepItem()">Add Item</button>' +
    '</div>');
  }

  function _submitHomePrepItem() {
    var item = document.getElementById('hpItem').value.trim();
    var notes = document.getElementById('hpNotes').value.trim();
    if (!item) return CRM.toast('Item is required', 'error');

    _updateJsonField('home_prep_checklist', function (list) {
      if (!Array.isArray(list)) list = [];
      list.push({ item: item, status: 'pending', notes: notes });
      return list;
    });
    CRM.closeModal();
  }

  // ─── Disclosure Update ────────────────────────────────────────────────
  function _updateDisclosure(key, value) {
    _updateJsonField('disclosures', function (obj) {
      if (!obj || typeof obj !== 'object') obj = {};
      obj[key] = value;
      return obj;
    });
  }

  // ─── Documents Toggle ─────────────────────────────────────────────────
  function _toggleDocument(key, value) {
    _updateJsonField('documents_collected', function (obj) {
      if (!obj || typeof obj !== 'object') obj = {};
      obj[key] = value;
      return obj;
    });
  }

  // ─── Marketing Update ─────────────────────────────────────────────────
  function _updateMarketing(key, value) {
    _updateJsonField('marketing_strategy', function (obj) {
      if (!obj || typeof obj !== 'object') obj = {};
      obj[key] = value;
      return obj;
    });
  }

  // ─── Generic JSON field updater ───────────────────────────────────────
  function _updateJsonField(field, mutator) {
    var clientId = _currentClientId || (Workspace._getClientId ? Workspace._getClientId() : null);
    if (!clientId) return;

    var current = _currentClient || (Workspace._getClient ? Workspace._getClient() : null);
    if (!current) return;

    var currentVal = current[field];
    try {
      if (typeof currentVal === 'string') currentVal = JSON.parse(currentVal);
    } catch (e) { currentVal = null; }

    var newVal = mutator(currentVal || (Array.isArray(currentVal) ? [] : {}));

    var data = {};
    data[field] = newVal;

    MallanAPI.clients.update(clientId, data).then(function () {
      CRM.toast('Updated', 'success');
      Workspace.openClient(clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed to update: ' + (err.message || ''), 'error');
    });
  }

  // ─── Edit modals ──────────────────────────────────────────────────────
  function _editEntity() {
    var cl = _currentClient ? ClientNormalizer.normalize(_currentClient) : (Workspace._getClient ? Workspace._getClient() : {});

    CRM.openModal('Edit Entity Ownership', '<div class="space-y-3">' +
      '<div><label class="text-xs font-bold text-gray-500">Entity Name</label>' +
        '<input id="entName" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.entity_name || '') + '" placeholder="e.g., Smith Family Trust"></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Entity Type</label>' +
        '<select id="entType" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
          '<option value="individual"' + (cl.entity_type === 'individual' ? ' selected' : '') + '>Individual</option>' +
          '<option value="llc"' + (cl.entity_type === 'llc' ? ' selected' : '') + '>LLC</option>' +
          '<option value="trust"' + (cl.entity_type === 'trust' ? ' selected' : '') + '>Trust</option>' +
          '<option value="corp"' + (cl.entity_type === 'corp' ? ' selected' : '') + '>Corporation</option>' +
          '<option value="inc"' + (cl.entity_type === 'inc' ? ' selected' : '') + '>Inc</option>' +
        '</select></div>' +
      '<button class="btn btn-gold w-full" onclick="SellerWorkspace._saveEntity()">Save</button>' +
    '</div>');
  }

  function _saveEntity() {
    var clientId = _currentClientId || (Workspace._getClientId ? Workspace._getClientId() : null);
    if (!clientId) return;

    MallanAPI.clients.update(clientId, {
      entity_name: document.getElementById('entName').value.trim(),
      entity_type: document.getElementById('entType').value,
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Entity updated', 'success');
      Workspace.openClient(clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _editAttorney() {
    var cl = _currentClient ? ClientNormalizer.normalize(_currentClient) : (Workspace._getClient ? Workspace._getClient() : {});
    CRM.openModal('Edit Attorney', '<div class="space-y-3">' +
      '<div><label class="text-xs font-bold text-gray-500">Attorney Name</label>' +
        '<input id="attName" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.attorney_name || '') + '"></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Firm</label>' +
        '<input id="attFirm" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.attorney_firm || '') + '"></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Email</label>' +
        '<input id="attEmail" type="email" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.attorney_email || '') + '"></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Phone</label>' +
        '<input id="attPhone" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.attorney_phone || '') + '"></div>' +
      '<button class="btn btn-gold w-full" onclick="SellerWorkspace._saveAttorney()">Save</button>' +
    '</div>');
  }

  function _saveAttorney() {
    var clientId = _currentClientId || (Workspace._getClientId ? Workspace._getClientId() : null);
    if (!clientId) return;

    MallanAPI.clients.update(clientId, {
      attorney_name: document.getElementById('attName').value.trim(),
      attorney_firm: document.getElementById('attFirm').value.trim(),
      attorney_email: document.getElementById('attEmail').value.trim(),
      attorney_phone: document.getElementById('attPhone').value.trim(),
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Attorney updated', 'success');
      Workspace.openClient(clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _editIntake() { CRM.toast('Full intake form — opening...', 'info'); /* TODO: full intake modal */ }
  function _editHomePrep() { CRM.toast('Edit home prep checklist', 'info'); /* handled by inline toggles */ }
  function _editMarketing() { CRM.toast('Edit marketing strategy', 'info'); /* handled by inline dropdowns */ }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════
  return {
    // Full workspace renderers
    renderProspect: renderProspect,
    renderActive: renderActive,

    // Legacy extension (backward compat)
    renderSellerSections: renderSellerSections,

    // Tab switching
    _switchTab: _switchTab,

    // Prospect actions
    _openConvertModal: _openConvertModal,
    _submitConvert: _submitConvert,
    _runCMA: _runCMA,
    _sendTemplate: _sendTemplate,

    // Active actions
    _openListingForm: _openListingForm,
    _copyPortalLink: _copyPortalLink,
    _addShowing: _addShowing,
    _submitShowing: _submitShowing,
    _addOpenHouse: _addOpenHouse,
    _submitOpenHouse: _submitOpenHouse,
    _addOffer: _addOffer,
    _submitOffer: _submitOffer,
    _updateOfferStatus: _updateOfferStatus,
    _uploadDocument: _uploadDocument,
    _requestDocument: _requestDocument,

    // Shared actions (existing)
    _calcNetProceeds: _calcNetProceeds,
    _cycleHomePrepStatus: _cycleHomePrepStatus,
    _addHomePrepItem: _addHomePrepItem,
    _submitHomePrepItem: _submitHomePrepItem,
    _updateDisclosure: _updateDisclosure,
    _toggleDocument: _toggleDocument,
    _updateMarketing: _updateMarketing,
    _editEntity: _editEntity,
    _saveEntity: _saveEntity,
    _editAttorney: _editAttorney,
    _saveAttorney: _saveAttorney,
    _editIntake: _editIntake,
    _editHomePrep: _editHomePrep,
    _editMarketing: _editMarketing,
  };
})();
