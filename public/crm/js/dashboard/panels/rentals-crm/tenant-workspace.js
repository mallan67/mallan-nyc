// ═══════════════════════════════════════════════════════════════════════════════
// TENANT + PROSPECT WORKSPACE EXTENSIONS
// Current Tenants: lease timeline, renewal, buyer conversion, outreach
// Viewed/Did Not Rent: showing history, 6/90/60/30 automation, dual drip
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, Router, Store, UI, Utils, MallanAPI, Workspace, ActivityTable */

var TenantWorkspace = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  // ═══════════════════════════════════════════════════════════════════════
  // RENTER OVERVIEW SECTIONS (tenants + prospects)
  // ═══════════════════════════════════════════════════════════════════════

  function renderRenterSections(cl) {
    var html = '';
    var hasActiveLease = cl.lease_end_date && new Date(cl.lease_end_date) > new Date();

    if (hasActiveLease) {
      // Current Tenant sections
      html += _renewalStatusCard(cl);
      html += _buyerConversionCard(cl);
    }

    // Outreach Schedule (both tenants and prospects)
    html += _outreachScheduleCard(cl);

    // Showing History (especially for prospects)
    html += _showingHistoryCard(cl);

    // Renter Docs Readiness
    html += _docsReadinessCard(cl);

    // Dual Drip Status
    html += _dripStatusCard(cl);

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

  // ─── Renewal Status (Current Tenants) ─────────────────────────────────
  function _renewalStatusCard(cl) {
    var status = cl.renewal_status || 'pending';
    var leaseEnd = cl.lease_end_date;
    var daysLeft = leaseEnd ? Math.floor((new Date(leaseEnd).getTime() - Date.now()) / 86400000) : 0;

    var statusColors = {
      pending: { bg: 'bg-yellow-50', border: '#F59E0B', text: 'text-yellow-700', label: 'Pending Decision' },
      renewing: { bg: 'bg-green-50', border: '#059669', text: 'text-green-700', label: 'Renewing' },
      not_renewing: { bg: 'bg-red-50', border: '#DC2626', text: 'text-red-700', label: 'Not Renewing' },
      month_to_month: { bg: 'bg-blue-50', border: '#3B82F6', text: 'text-blue-700', label: 'Month-to-Month' },
    };
    var info = statusColors[status] || statusColors.pending;

    var body = '<div class="flex items-center justify-between mb-3">' +
      '<div class="p-3 rounded-lg ' + info.bg + ' flex-1 mr-3">' +
        '<p class="text-xs text-gray-500">Renewal Status</p>' +
        '<p class="text-lg font-bold ' + info.text + '">' + E(info.label) + '</p>' +
      '</div>' +
      '<div class="text-center">' +
        '<p class="text-xs text-gray-500">Days Left</p>' +
        '<p class="text-2xl font-bold ' + (daysLeft <= 30 ? 'text-red-600' : daysLeft <= 90 ? 'text-yellow-600' : 'text-green-600') + '">' + daysLeft + '</p>' +
      '</div>' +
    '</div>';

    // Status buttons
    body += '<div class="flex gap-2">';
    ['renewing', 'not_renewing', 'month_to_month', 'pending'].forEach(function (s) {
      var sInfo = statusColors[s];
      var active = status === s;
      body += '<button class="flex-1 py-2 text-[10px] font-bold rounded-lg border transition-all ' +
        (active ? sInfo.bg + ' ' + sInfo.text + ' border-current' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400') +
        '" onclick="TenantWorkspace._setRenewalStatus(\'' + s + '\')">' + E(sInfo.label) + '</button>';
    });
    body += '</div>';

    // If not renewing, show outreach dates auto-computation
    if (status === 'not_renewing') {
      body += '<div class="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">' +
        '<i class="fas fa-exclamation-triangle mr-1"></i> Not renewing — outreach dates will auto-populate based on lease end. ' +
        'This tenant enters the Viewed/Did Not Rent flow for re-engagement.' +
      '</div>';
    }

    return _card('redo', 'Renewal Status', '', body, info.border);
  }

  // ─── Buyer Conversion Assessment ──────────────────────────────────────
  function _buyerConversionCard(cl) {
    var bp = cl.buyer_potential || 0;
    var bpColor = bp >= 70 ? '#059669' : bp >= 40 ? '#F59E0B' : '#9CA3AF';
    var bpLabel = bp >= 70 ? 'High Potential' : bp >= 40 ? 'Moderate' : 'Low';

    var body = '<div class="flex items-center gap-4 mb-3">' +
      '<div class="relative w-16 h-16 flex-shrink-0">' +
        '<svg class="w-16 h-16 -rotate-90" viewBox="0 0 64 64">' +
          '<circle cx="32" cy="32" r="26" fill="none" stroke="#E5E7EB" stroke-width="5"/>' +
          '<circle cx="32" cy="32" r="26" fill="none" stroke="' + bpColor + '" stroke-width="5" stroke-dasharray="' + (2 * Math.PI * 26) + '" stroke-dashoffset="' + (2 * Math.PI * 26 * (1 - bp / 100)) + '" stroke-linecap="round"/>' +
        '</svg>' +
        '<div class="absolute inset-0 flex items-center justify-center">' +
          '<span class="text-lg font-bold" style="color:' + bpColor + '">' + bp + '</span>' +
        '</div>' +
      '</div>' +
      '<div>' +
        '<p class="text-sm font-bold" style="color:' + bpColor + '">' + E(bpLabel) + '</p>' +
        '<p class="text-xs text-gray-500">Based on income, credit, engagement</p>' +
      '</div>' +
      '<button class="btn btn-xs btn-outline ml-auto" onclick="TenantWorkspace._editBuyerPotential()">Adjust</button>' +
    '</div>';

    // Quick qualification check
    var income = Number(cl.annual_income) || 0;
    if (income > 0) {
      var monthlyIncome = income / 12;
      var maxMonthly = monthlyIncome * 0.28;
      var rate = 0.065 / 12;
      var maxLoan = maxMonthly > 0 ? Math.round(maxMonthly * ((Math.pow(1 + rate, 360) - 1) / (rate * Math.pow(1 + rate, 360)))) : 0;
      var downPayment = Number(cl.down_payment || cl.available_funds) || 0;
      var maxPrice = maxLoan + downPayment;

      body += '<div class="grid grid-cols-3 gap-2 text-center">' +
        '<div class="p-2 bg-gray-50 rounded"><p class="text-[10px] text-gray-500">Income</p><p class="text-sm font-bold">' + $(income) + '/yr</p></div>' +
        '<div class="p-2 bg-gray-50 rounded"><p class="text-[10px] text-gray-500">Est. Max Price</p><p class="text-sm font-bold">' + $(maxPrice) + '</p></div>' +
        '<div class="p-2 bg-gray-50 rounded"><p class="text-[10px] text-gray-500">Savings</p><p class="text-sm font-bold">' + $(downPayment) + '</p></div>' +
      '</div>';
    }

    // Promote to buyer button
    if (bp >= 40) {
      body += '<button class="btn btn-sm btn-gold w-full mt-3" onclick="TenantWorkspace._promoteToBuyer()">' +
        '<i class="fas fa-arrow-up mr-1"></i> Promote to Active Buyer</button>';
    }

    return _card('exchange-alt', 'Buyer Conversion Potential', '', body, '#8B5CF6');
  }

  // ─── Outreach Schedule (6mo/90d/60d/30d) ──────────────────────────────
  function _outreachScheduleCard(cl) {
    var dates = [
      { key: 'outreach_6mo_date', label: '6 Month', desc: 'Sales listings if buyer potential' },
      { key: 'outreach_90d_date', label: '90 Day', desc: 'Rental + sales listings' },
      { key: 'outreach_60d_date', label: '60 Day', desc: 'Rental listings' },
      { key: 'outreach_30d_date', label: '30 Day', desc: 'Urgent rental listings' },
    ];

    var body = '<div class="space-y-2">';
    dates.forEach(function (d) {
      var date = cl[d.key];
      var isPast = date && new Date(date) < new Date();
      var isSoon = date && !isPast && (new Date(date).getTime() - Date.now()) < 14 * 86400000;

      body += '<div class="flex items-center gap-3 py-2 px-3 rounded ' +
        (isPast ? 'bg-green-50' : isSoon ? 'bg-yellow-50' : 'bg-gray-50') + '">' +
        '<div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ' +
          (isPast ? 'bg-green-100' : isSoon ? 'bg-yellow-100' : 'bg-gray-200') + '">' +
          '<i class="fas ' + (isPast ? 'fa-check text-green-500' : isSoon ? 'fa-clock text-yellow-500' : 'fa-calendar text-gray-400') + ' text-xs"></i>' +
        '</div>' +
        '<div class="flex-1">' +
          '<p class="text-sm font-medium ' + (isPast ? 'text-green-700 line-through' : '') + '">' + E(d.label) + '</p>' +
          '<p class="text-[10px] text-gray-500">' + E(d.desc) + '</p>' +
        '</div>' +
        '<span class="text-xs font-bold ' + (isPast ? 'text-green-600' : isSoon ? 'text-yellow-600' : 'text-gray-500') + '">' +
          (date ? D(date) : 'Not set') +
        '</span>' +
      '</div>';
    });
    body += '</div>';

    // Auto-populate button
    if (!cl.outreach_30d_date && !cl.outreach_60d_date) {
      body += '<button class="btn btn-xs btn-outline w-full mt-2" onclick="TenantWorkspace._autoPopulateOutreach()">' +
        '<i class="fas fa-magic mr-1"></i> Auto-Populate Dates</button>';
    }

    return _card('calendar-check', 'Outreach Schedule', 'TenantWorkspace._editOutreach()', body, '#F59E0B');
  }

  // ─── Showing History ──────────────────────────────────────────────────
  function _showingHistoryCard(cl) {
    var body = '<div id="tenantShowingHistory">' + UI.loading() + '</div>';

    // Fetch async
    setTimeout(function () { _fetchShowingHistory(); }, 0);

    return _card('eye', 'Showing History', '', body + '<button class="btn btn-xs btn-gold w-full mt-2" onclick="TenantWorkspace._addShowing()"><i class="fas fa-plus mr-1"></i> Add Showing Record</button>');
  }

  function _fetchShowingHistory() {
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    if (!clientId) return;

    MallanAPI._fetch('/api/crm/showing-history?lead_id=' + clientId).then(function (data) {
      var el = document.getElementById('tenantShowingHistory');
      if (!el) return;

      var showings = data.showings || [];
      if (showings.length === 0) {
        el.innerHTML = '<p class="text-xs text-gray-400 text-center py-3">No showing records yet</p>';
        return;
      }

      var html = '<div class="space-y-2">';
      showings.forEach(function (s) {
        var reactionIcons = {
          interested: '<i class="fas fa-heart text-green-500"></i>',
          neutral: '<i class="fas fa-meh text-yellow-500"></i>',
          not_interested: '<i class="fas fa-thumbs-down text-red-500"></i>',
        };
        var whyLabels = {
          fee_objection: 'Fee objection', price: 'Price too high', location: 'Location',
          building: 'Building issue', timing: 'Bad timing', other: 'Other',
        };

        html += '<div class="p-3 bg-gray-50 rounded-lg">' +
          '<div class="flex items-center justify-between mb-1">' +
            '<span class="text-sm font-medium text-gray-900">' + E(s.address || '') + (s.unit ? ' #' + E(s.unit) : '') + '</span>' +
            '<span class="text-xs text-gray-400">' + D(s.showing_date) + '</span>' +
          '</div>' +
          '<div class="flex items-center gap-2 text-xs">' +
            (s.price_at_time ? '<span class="text-gray-500">' + $(Number(s.price_at_time)) + '</span>' : '') +
            (s.reaction ? '<span>' + (reactionIcons[s.reaction] || '') + '</span>' : '') +
            (s.why_not_rented ? '<span class="px-1.5 py-0.5 bg-red-100 text-red-600 rounded">' + E(whyLabels[s.why_not_rented] || s.why_not_rented) + '</span>' : '') +
            (s.rented ? '<span class="px-1.5 py-0.5 bg-green-100 text-green-600 rounded font-bold">Rented</span>' : '') +
          '</div>' +
          (s.notes ? '<p class="text-xs text-gray-500 mt-1">' + E(s.notes) + '</p>' : '') +
        '</div>';
      });
      html += '</div>';
      el.innerHTML = html;
    }).catch(function () {
      var el = document.getElementById('tenantShowingHistory');
      if (el) el.innerHTML = '<p class="text-xs text-gray-400 text-center">Unable to load</p>';
    });
  }

  // ─── Docs Readiness (renters) ─────────────────────────────────────────
  function _docsReadinessCard(cl) {
    var docs = {};
    try { docs = cl.docs_readiness ? (typeof cl.docs_readiness === 'string' ? JSON.parse(cl.docs_readiness) : cl.docs_readiness) : {}; } catch (e) { /* */ }

    var items = [
      { key: 'pay_stubs', label: 'Pay Stubs (2 months)' },
      { key: 'tax_returns', label: 'Tax Returns (2 years)' },
      { key: 'bank_statements', label: 'Bank Statements (3 months)' },
      { key: 'employment_letter', label: 'Employment Verification Letter' },
      { key: 'reference_letters', label: 'Reference Letters (2-3)' },
      { key: 'photo_id', label: 'Photo ID' },
    ];

    var ready = items.filter(function (i) { return docs[i.key] === true; }).length;

    var body = '<div class="flex items-center gap-3 mb-3">' +
      '<div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">' +
        '<div class="h-full bg-green-500 rounded-full" style="width:' + Math.round((ready / items.length) * 100) + '%"></div>' +
      '</div>' +
      '<span class="text-xs font-bold text-gray-600">' + ready + '/' + items.length + '</span>' +
    '</div>' +
    '<div class="grid grid-cols-2 gap-1">';

    items.forEach(function (item) {
      var has = docs[item.key] === true;
      body += '<div class="flex items-center gap-2 py-1 px-2 rounded text-sm ' + (has ? 'bg-green-50' : 'bg-red-50') + ' cursor-pointer" ' +
        'onclick="TenantWorkspace._toggleDocReady(\'' + item.key + '\',' + !has + ')">' +
        '<i class="fas ' + (has ? 'fa-check-circle text-green-500' : 'fa-times-circle text-red-400') + ' text-xs"></i>' +
        '<span class="' + (has ? 'text-green-700' : 'text-red-700') + ' text-xs">' + E(item.label) + '</span>' +
      '</div>';
    });

    body += '</div>';

    if (ready < items.length) {
      body += '<div class="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">' +
        '<i class="fas fa-folder-open mr-1"></i> ' + (items.length - ready) + ' document(s) still needed for co-op/condo applications' +
      '</div>';
    }

    return _card('folder-open', 'Application Docs Readiness', '', body, '#3B82F6');
  }

  // ─── Dual Drip Status ─────────────────────────────────────────────────
  function _dripStatusCard(cl) {
    var body = '<div class="grid grid-cols-3 gap-3">';

    var drips = [
      { key: 'rental_drip_on', statusKey: 'rental_drip_status', label: 'Rental Drip', color: '#3B82F6' },
      { key: 'sales_drip_on', statusKey: 'sales_drip_status', label: 'Sales Drip', color: '#059669' },
      { key: 'renewal_drip_on', statusKey: null, label: 'Renewal Drip', color: '#F59E0B' },
    ];

    drips.forEach(function (d) {
      var on = cl[d.key] || false;
      var tier = d.statusKey ? (cl[d.statusKey] || 'paused') : (on ? 'active' : 'paused');
      body += '<div class="p-3 rounded-lg border text-center ' + (on ? 'bg-white border-current' : 'bg-gray-50 border-gray-200') + '" style="' + (on ? 'border-color:' + d.color : '') + '">' +
        '<p class="text-xs text-gray-500 mb-1">' + E(d.label) + '</p>' +
        '<p class="text-sm font-bold ' + (on ? '' : 'text-gray-400') + '" style="' + (on ? 'color:' + d.color : '') + '">' + (on ? 'ON' : 'OFF') + '</p>' +
        (d.statusKey ? '<p class="text-[10px] text-gray-400 mt-0.5">' + E(tier) + '</p>' : '') +
        '<button class="text-[10px] mt-1 ' + (on ? 'text-red-500' : 'text-blue-500') + ' hover:underline" ' +
          'onclick="TenantWorkspace._toggleDrip(\'' + d.key + '\',' + !on + ')">' + (on ? 'Turn Off' : 'Turn On') + '</button>' +
      '</div>';
    });

    body += '</div>';
    return _card('robot', 'Automation Drip Status', '', body);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════════════

  function _setRenewalStatus(status) {
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    var cl = Workspace._getClient ? Workspace._getClient() : {};
    if (!clientId) return;

    var updates = { renewal_status: status };

    // If not renewing, auto-compute outreach dates from lease end
    if (status === 'not_renewing' && cl.lease_end_date) {
      var end = new Date(cl.lease_end_date);
      updates.non_renewal_date = new Date().toISOString();
      updates.reengage_anchor_date = end.toISOString();
      // Set outreach dates: 30d, 60d, 90d before lease end; 6mo after
      var d30 = new Date(end.getTime() - 30 * 86400000);
      var d60 = new Date(end.getTime() - 60 * 86400000);
      var d90 = new Date(end.getTime() - 90 * 86400000);
      var d6mo = new Date(end.getTime() + 180 * 86400000);
      updates.outreach_30d_date = d30.toISOString();
      updates.outreach_60d_date = d60.toISOString();
      updates.outreach_90d_date = d90.toISOString();
      updates.outreach_6mo_date = d6mo.toISOString();
    }

    MallanAPI.clients.update(clientId, updates).then(function () {
      CRM.toast('Renewal status updated', 'success');
      Workspace.openClient(clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _autoPopulateOutreach() {
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    var cl = Workspace._getClient ? Workspace._getClient() : {};
    if (!clientId) return;

    // Anchor from lease end date or today
    var anchor = cl.lease_end_date ? new Date(cl.lease_end_date) : new Date();
    var d30 = new Date(anchor.getTime() - 30 * 86400000);
    var d60 = new Date(anchor.getTime() - 60 * 86400000);
    var d90 = new Date(anchor.getTime() - 90 * 86400000);
    var d6mo = new Date(anchor.getTime() + 180 * 86400000);

    MallanAPI.clients.update(clientId, {
      outreach_30d_date: d30.toISOString(),
      outreach_60d_date: d60.toISOString(),
      outreach_90d_date: d90.toISOString(),
      outreach_6mo_date: d6mo.toISOString(),
    }).then(function () {
      CRM.toast('Outreach dates populated', 'success');
      Workspace.openClient(clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _editOutreach() {
    CRM.toast('Edit outreach dates in the overview section above', 'info');
  }

  function _promoteToBuyer() {
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    if (!clientId) return;

    if (!confirm('Promote this renter to an Active Buyer in the Sales CRM?')) return;

    MallanAPI._fetch('/api/crm/sales/promote', {
      method: 'POST',
      body: JSON.stringify({ lead_id: clientId, promotion_type: 'renter_to_buyer' }),
    }).then(function () {
      CRM.toast('Promoted to Active Buyer', 'success');
      Workspace.openClient(clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _editBuyerPotential() {
    var cl = Workspace._getClient ? Workspace._getClient() : {};
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    CRM.openModal('Set Buyer Potential', '<div class="space-y-3">' +
      '<div><label class="text-xs font-bold text-gray-500">Buyer Potential (0-100)</label>' +
        '<input id="bpScore" type="number" min="0" max="100" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + (cl.buyer_potential || 0) + '"></div>' +
      '<p class="text-xs text-gray-400">0 = no potential, 40 = moderate, 70+ = high (show promote button)</p>' +
      '<button class="btn btn-gold w-full" onclick="TenantWorkspace._saveBuyerPotential()">Save</button>' +
    '</div>');
  }

  function _saveBuyerPotential() {
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    if (!clientId) return;
    var val = parseInt(document.getElementById('bpScore').value) || 0;
    MallanAPI.clients.update(clientId, { buyer_potential: Math.max(0, Math.min(100, val)) }).then(function () {
      CRM.closeModal();
      CRM.toast('Buyer potential updated', 'success');
      Workspace.openClient(clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _toggleDocReady(key, value) {
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    var cl = Workspace._getClient ? Workspace._getClient() : {};
    if (!clientId) return;

    var docs = {};
    try { docs = cl.docs_readiness ? (typeof cl.docs_readiness === 'string' ? JSON.parse(cl.docs_readiness) : cl.docs_readiness) : {}; } catch (e) { /* */ }
    docs[key] = value;

    MallanAPI.clients.update(clientId, { docs_readiness: docs }).then(function () {
      CRM.toast('Updated', 'success');
      Workspace.openClient(clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _toggleDrip(key, value) {
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    if (!clientId) return;
    var data = {};
    data[key] = value;
    MallanAPI.clients.update(clientId, data).then(function () {
      CRM.toast('Drip ' + (value ? 'enabled' : 'disabled'), 'success');
      Workspace.openClient(clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _addShowing() {
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    CRM.openModal('Add Showing Record', '<div class="space-y-3">' +
      '<div><label class="text-xs font-bold text-gray-500">Address</label>' +
        '<input id="sh_address" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="123 Main St"></div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Unit</label>' +
          '<input id="sh_unit" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="4A"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Date</label>' +
          '<input id="sh_date" type="date" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + new Date().toISOString().split('T')[0] + '"></div>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Price at Time</label>' +
          '<input id="sh_price" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Reaction</label>' +
          '<select id="sh_reaction" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
            '<option value="">Select...</option>' +
            '<option value="interested">Interested</option>' +
            '<option value="neutral">Neutral</option>' +
            '<option value="not_interested">Not Interested</option>' +
          '</select></div>' +
      '</div>' +
      '<div><label class="text-xs font-bold text-gray-500">Why Didn\'t Rent</label>' +
        '<select id="sh_why" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
          '<option value="">N/A or didn\'t decide yet</option>' +
          '<option value="fee_objection">Fee Objection</option>' +
          '<option value="price">Price Too High</option>' +
          '<option value="location">Wrong Location</option>' +
          '<option value="building">Building Issue</option>' +
          '<option value="timing">Bad Timing</option>' +
          '<option value="other">Other</option>' +
        '</select></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Notes</label>' +
        '<textarea id="sh_notes" class="w-full border rounded px-3 py-2 text-sm mt-1" rows="2" placeholder="What caught their attention, comments..."></textarea></div>' +
      '<button class="btn btn-gold w-full" onclick="TenantWorkspace._submitShowing()">Save Showing</button>' +
    '</div>');
  }

  function _submitShowing() {
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    var address = document.getElementById('sh_address').value.trim();
    var date = document.getElementById('sh_date').value;
    if (!address || !date) { CRM.toast('Address and date required', 'error'); return; }

    MallanAPI._fetch('/api/crm/showing-history', {
      method: 'POST',
      body: JSON.stringify({
        lead_id: clientId,
        address: address,
        unit: document.getElementById('sh_unit').value.trim(),
        showing_date: date,
        price_at_time: document.getElementById('sh_price').value || null,
        reaction: document.getElementById('sh_reaction').value || null,
        why_not_rented: document.getElementById('sh_why').value || null,
        notes: document.getElementById('sh_notes').value.trim() || null,
      }),
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Showing record added', 'success');
      Workspace.openClient(clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════
  return {
    renderRenterSections: renderRenterSections,

    _setRenewalStatus: _setRenewalStatus,
    _autoPopulateOutreach: _autoPopulateOutreach,
    _editOutreach: _editOutreach,
    _promoteToBuyer: _promoteToBuyer,
    _editBuyerPotential: _editBuyerPotential,
    _saveBuyerPotential: _saveBuyerPotential,
    _toggleDocReady: _toggleDocReady,
    _toggleDrip: _toggleDrip,
    _addShowing: _addShowing,
    _submitShowing: _submitShowing,
  };
})();
