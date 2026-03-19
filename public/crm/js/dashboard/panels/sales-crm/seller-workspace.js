// ═══════════════════════════════════════════════════════════════════════════════
// SELLER WORKSPACE EXTENSIONS — Type-specific sections for seller overview
// Intake, disclosures, documents tracker, home prep, marketing, net proceeds
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, Router, Store, UI, Utils, MallanAPI, Workspace */

var SellerWorkspace = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  // ═══════════════════════════════════════════════════════════════════════
  // SELLER OVERVIEW SECTIONS (rendered into the overview tab)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Render seller-specific sections for the overview tab.
   * Called from workspace _clientOverview when client is a seller.
   * @param {Object} cl - normalized client
   * @returns {string} HTML
   */
  function renderSellerSections(cl) {
    var html = '';

    // ── Entity Ownership Card ──
    if (cl.entity_name || cl.entity_type) {
      html += _entityCard(cl);
    }

    // ── Attorney Card ──
    html += _attorneyCard(cl);

    // ── Seller Intake Summary ──
    html += _intakeSummaryCard(cl);

    // ── Home Prep Checklist ──
    html += _homePrepCard(cl);

    // ── Disclosures Checklist ──
    html += _disclosuresCard(cl);

    // ── Documents Collection Tracker ──
    html += _documentsTrackerCard(cl);

    // ── Marketing Strategy ──
    html += _marketingStrategyCard(cl);

    // ── Net Proceeds Calculator ──
    html += _netProceedsCard(cl);

    return html;
  }

  // ─── Card helper ──────────────────────────────────────────────────────
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

    var doneCount = items.filter(function (item) { return disclosures[item.key] === 'completed'; }).length;

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
      var statusLabels = { not_started: 'Not Started', scheduled: 'Scheduled', in_progress: 'In Progress', done: 'Done' };
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
    var body = '<div id="sellerNetProceeds">' +
      '<div class="grid grid-cols-2 gap-3 text-sm">' +
        '<div><label class="text-xs text-gray-500 block mb-1">Sale Price</label>' +
          '<input type="number" id="np_sale_price" class="w-full border rounded px-2 py-1.5 text-sm" placeholder="0" oninput="SellerWorkspace._calcNetProceeds()"></div>' +
        '<div><label class="text-xs text-gray-500 block mb-1">Mortgage Balance</label>' +
          '<input type="number" id="np_mortgage" class="w-full border rounded px-2 py-1.5 text-sm" placeholder="0" oninput="SellerWorkspace._calcNetProceeds()"></div>' +
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
    // Get current client ID from workspace
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    if (!clientId) return;

    // Get current value
    var current = Workspace._getClient ? Workspace._getClient() : null;
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
      // Refresh the workspace
      Workspace.openClient(clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed to update: ' + (err.message || ''), 'error');
    });
  }

  // ─── Edit modals ──────────────────────────────────────────────────────
  function _editEntity() {
    var cl = Workspace._getClient ? Workspace._getClient() : {};
    var signatories = [];
    try { signatories = cl.authorized_signatories ? (typeof cl.authorized_signatories === 'string' ? JSON.parse(cl.authorized_signatories) : cl.authorized_signatories) : []; } catch (e) { /* */ }

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
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
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
    var cl = Workspace._getClient ? Workspace._getClient() : {};
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
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
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
    renderSellerSections: renderSellerSections,

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
