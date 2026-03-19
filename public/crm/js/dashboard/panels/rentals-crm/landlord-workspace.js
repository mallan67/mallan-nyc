// ═══════════════════════════════════════════════════════════════════════════════
// LANDLORD WORKSPACE EXTENSIONS — Type-specific sections for landlord overview
// Intake, property disclosures, lease terms, fee structure, vacancy cost calc,
// relist timing, unit inventory
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, Router, Store, UI, Utils, MallanAPI, Workspace */

var LandlordWorkspace = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  // ═══════════════════════════════════════════════════════════════════════
  // LANDLORD OVERVIEW SECTIONS
  // ═══════════════════════════════════════════════════════════════════════

  function renderLandlordSections(cl) {
    var html = '';

    // Seller Potential / Promote Card (for landlord-seller bridge)
    html += _sellerPotentialCard(cl);

    // Entity ownership (reuse from seller workspace if available)
    if ((cl.entity_name || cl.entity_type) && typeof SellerWorkspace !== 'undefined') {
      // Delegate to seller entity card — same UI
    } else if (cl.entity_name || cl.entity_type) {
      html += _entityCard(cl);
    }

    // Property Disclosures
    html += _propertyDisclosuresCard(cl);

    // Lease Terms
    html += _leaseTermsCard(cl);

    // Fee Structure
    html += _feeStructureCard(cl);

    // Vacancy Cost Calculator
    html += _vacancyCostCard(cl);

    // Relist Timing Advisor
    html += _relistTimingCard(cl);

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

  // ─── Seller Potential / Promote ──────────────────────────────────────
  function _sellerPotentialCard(cl) {
    var potential = cl.seller_potential || 'none';
    if (potential === 'none') {
      // Show small prompt to assess
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

    // Show in Landlord Sellers tab notice
    body += '<p class="text-xs text-gray-500 mb-2"><i class="fas fa-info-circle mr-1"></i> This landlord appears in the Sales CRM → Landlord Sellers tab.</p>';

    // Promote button
    if (potential === 'high' || potential === 'medium') {
      body += '<button class="btn btn-sm btn-gold w-full" onclick="LandlordWorkspace._promoteToSeller()">' +
        '<i class="fas fa-arrow-up mr-1"></i> Promote to Active Seller</button>';
    }

    return _card('chart-line', 'Seller Potential', '', body, info.border);
  }

  function _setSellerPotential(level) {
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    if (!clientId) return;
    MallanAPI.clients.update(clientId, { seller_potential: level }).then(function () {
      CRM.toast('Seller potential set to ' + level, 'success');
      Workspace.openClient(clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _promoteToSeller() {
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    if (!clientId) return;
    if (!confirm('Promote this landlord to an Active Seller in the Sales CRM? The landlord record stays in the Rentals CRM.')) return;

    MallanAPI._fetch('/api/crm/sales/promote', {
      method: 'POST',
      body: JSON.stringify({ lead_id: clientId, promotion_type: 'landlord_to_seller' }),
    }).then(function () {
      CRM.toast('Promoted to Active Seller — now visible in Sales CRM', 'success');
      Workspace.openClient(clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  // ─── Entity Card (standalone for landlords without SellerWorkspace) ──
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

  // ─── Property Disclosures ─────────────────────────────────────────────
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

    var doneCount = items.filter(function (i) { return disclosures[i.key] === 'disclosed' || disclosures[i.key] === 'clear'; }).length;

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

  // ─── Lease Terms ──────────────────────────────────────────────────────
  function _leaseTermsCard(cl) {
    var terms = {};
    try { terms = cl.lease_terms ? (typeof cl.lease_terms === 'string' ? JSON.parse(cl.lease_terms) : cl.lease_terms) : {}; } catch (e) { /* */ }

    var body = '<div class="grid grid-cols-2 gap-4 text-sm">' +
      '<div class="space-y-2">' +
        '<div class="flex justify-between"><span class="text-gray-500">Standard Length</span><span class="font-medium">' + E(terms.standard_length || '1 year') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">Pet Policy</span><span class="font-medium">' + E(terms.pet_policy || '-') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">Subletting</span><span class="font-medium">' + E(terms.sublet_rules || '-') + '</span></div>' +
      '</div>' +
      '<div class="space-y-2">' +
        '<div class="flex justify-between"><span class="text-gray-500">Utilities Included</span><span class="font-medium">' + E(terms.utilities || '-') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">Move-In Fee</span><span class="font-medium">' + (terms.move_in_fee ? $(Number(terms.move_in_fee)) : '-') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">Security Deposit</span><span class="font-medium">' + (terms.security_deposit ? $(Number(terms.security_deposit)) : '1 month') + '</span></div>' +
      '</div>' +
    '</div>';

    return _card('file-contract', 'Lease Terms', 'LandlordWorkspace._editLeaseTerms()', body);
  }

  // ─── Fee Structure ────────────────────────────────────────────────────
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

  // ─── Vacancy Cost Calculator ──────────────────────────────────────────
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

  // ─── Relist Timing Advisor ────────────────────────────────────────────
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

      // Timeline milestones
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
        '<button class="btn btn-xs btn-outline" onclick="Workspace._editProperty()"><i class="fas fa-plus mr-1"></i> Set Lease Dates</button>' +
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
  // ACTIONS
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

  function _updatePropertyDisclosure(key, value) {
    _updateJsonField('property_disclosures', function (obj) {
      if (!obj || typeof obj !== 'object') obj = {};
      obj[key] = value;
      return obj;
    });
  }

  function _setFeeStructure(fee) {
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    if (!clientId) return;

    MallanAPI.clients.update(clientId, { fee_structure: fee }).then(function () {
      CRM.toast('Fee structure updated', 'success');
      Workspace.openClient(clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _editLeaseTerms() {
    var cl = Workspace._getClient ? Workspace._getClient() : {};
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
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    if (!clientId) return;

    var newTerms = {
      standard_length: document.getElementById('lt_length').value,
      pet_policy: document.getElementById('lt_pets').value,
      sublet_rules: document.getElementById('lt_sublet').value,
      utilities: document.getElementById('lt_utilities').value.trim(),
      move_in_fee: document.getElementById('lt_movein').value || null,
      security_deposit: document.getElementById('lt_security').value || null,
    };

    MallanAPI.clients.update(clientId, { lease_terms: newTerms }).then(function () {
      CRM.closeModal();
      CRM.toast('Lease terms updated', 'success');
      Workspace.openClient(clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _editEntity() {
    var cl = Workspace._getClient ? Workspace._getClient() : {};
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
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    if (!clientId) return;
    MallanAPI.clients.update(clientId, {
      entity_name: document.getElementById('lentName').value.trim(),
      entity_type: document.getElementById('lentType').value,
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Entity updated', 'success');
      Workspace.openClient(clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  // ─── Generic JSON field updater ───────────────────────────────────────
  function _updateJsonField(field, mutator) {
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    if (!clientId) return;
    var current = Workspace._getClient ? Workspace._getClient() : null;
    if (!current) return;

    var currentVal = current[field];
    try { if (typeof currentVal === 'string') currentVal = JSON.parse(currentVal); } catch (e) { currentVal = null; }

    var newVal = mutator(currentVal || {});
    var data = {};
    data[field] = newVal;

    MallanAPI.clients.update(clientId, data).then(function () {
      CRM.toast('Updated', 'success');
      Workspace.openClient(clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════
  return {
    renderLandlordSections: renderLandlordSections,

    _setSellerPotential: _setSellerPotential,
    _promoteToSeller: _promoteToSeller,
    _updatePropertyDisclosure: _updatePropertyDisclosure,
    _setFeeStructure: _setFeeStructure,
    _editLeaseTerms: _editLeaseTerms,
    _saveLeaseTerms: _saveLeaseTerms,
    _editEntity: _editEntity,
    _saveEntity: _saveEntity,
    _calcVacancy: _calcVacancy,
  };
})();
