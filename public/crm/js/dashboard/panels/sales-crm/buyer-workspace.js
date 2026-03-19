// ═══════════════════════════════════════════════════════════════════════════════
// BUYER / INVESTOR WORKSPACE EXTENSIONS
// Conviction score, behavioral tracking, investor intake, investment calculators
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, Router, Store, UI, Utils, MallanAPI, Workspace */

var BuyerWorkspace = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  // ═══════════════════════════════════════════════════════════════════════
  // BUYER OVERVIEW SECTIONS
  // ═══════════════════════════════════════════════════════════════════════

  function renderBuyerSections(cl) {
    var html = '';

    // Conviction Score (visual gauge)
    html += _convictionCard(cl);

    // Buyer Rep Agreement status
    html += _buyerRepCard(cl);

    // Investor sections (only if is_investor)
    if (cl.is_investor) {
      html += _investorIntakeCard(cl);
      html += _exchange1031Card(cl);
      html += _investorToolsCard();
    }

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

  // ─── Conviction Score ─────────────────────────────────────────────────
  function _convictionCard(cl) {
    // Fetch async; render placeholder
    var body = '<div id="buyerConvictionDisplay">' +
      '<div class="flex items-center justify-center py-4">' +
        '<div class="w-20 h-20 rounded-full border-4 border-gray-200 flex items-center justify-center">' +
          '<span class="text-2xl font-bold text-gray-300">-</span>' +
        '</div>' +
      '</div>' +
    '</div>';

    // Trigger async fetch
    setTimeout(function () { _fetchConviction(); }, 0);

    return _card('brain', 'Conviction Score', '', body, '#8B5CF6');
  }

  function _fetchConviction() {
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    if (!clientId) return;

    MallanAPI._fetch('/api/crm/conviction/' + clientId).then(function (data) {
      var el = document.getElementById('buyerConvictionDisplay');
      if (!el) return;

      var score = data.score || 0;
      var stage = data.stage || 'browsing';
      var stageColors = { browsing: '#9CA3AF', considering: '#F59E0B', convinced: '#3B82F6', ready: '#059669' };
      var color = stageColors[stage] || '#9CA3AF';
      var ghostStatus = data.ghost_status || data.ghostStatus || 'active';

      var milestones = data.milestone_flags || data.milestoneFlags || {};
      var milestoneItems = [
        { key: 'repeated_views', label: 'Repeated Views', icon: 'fa-redo' },
        { key: 'shared', label: 'Shared Listing', icon: 'fa-share' },
        { key: 'used_calculator', label: 'Used Calculator', icon: 'fa-calculator' },
        { key: 'compared', label: 'Compared Properties', icon: 'fa-columns' },
        { key: 'checked_transit', label: 'Checked Transit', icon: 'fa-subway' },
        { key: 'requested_showing', label: 'Requested Showing', icon: 'fa-calendar-check' },
      ];

      var html = '<div class="flex items-center gap-4">' +
        '<div class="relative w-20 h-20 flex-shrink-0">' +
          '<svg class="w-20 h-20 -rotate-90" viewBox="0 0 80 80">' +
            '<circle cx="40" cy="40" r="34" fill="none" stroke="#E5E7EB" stroke-width="6"/>' +
            '<circle cx="40" cy="40" r="34" fill="none" stroke="' + color + '" stroke-width="6" stroke-dasharray="' + (2 * Math.PI * 34) + '" stroke-dashoffset="' + (2 * Math.PI * 34 * (1 - score / 100)) + '" stroke-linecap="round"/>' +
          '</svg>' +
          '<div class="absolute inset-0 flex items-center justify-center">' +
            '<span class="text-xl font-bold" style="color:' + color + '">' + score + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="flex-1">' +
          '<div class="flex items-center gap-2 mb-1">' +
            '<span class="text-sm font-bold" style="color:' + color + '">' + E(stage.charAt(0).toUpperCase() + stage.slice(1)) + '</span>' +
            (ghostStatus !== 'active' ? '<span class="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-bold">' + E(ghostStatus) + '</span>' : '') +
          '</div>' +
          '<div class="flex flex-wrap gap-1">';

      milestoneItems.forEach(function (m) {
        var hit = milestones[m.key];
        html += '<span class="text-[10px] px-1.5 py-0.5 rounded ' + (hit ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400') + '">' +
          '<i class="fas ' + m.icon + ' mr-0.5"></i>' + E(m.label) + '</span>';
      });

      html += '</div></div></div>';

      if (data.silence_days > 3) {
        html += '<div class="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">' +
          '<i class="fas fa-ghost mr-1"></i> Silent for ' + data.silence_days + ' days' +
        '</div>';
      }

      el.innerHTML = html;
    }).catch(function () {
      var el = document.getElementById('buyerConvictionDisplay');
      if (el) el.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">No conviction data yet</p>';
    });
  }

  // ─── Buyer Rep Agreement ──────────────────────────────────────────────
  function _buyerRepCard(cl) {
    var signed = cl.buyer_rep_agreement || false;
    var date = cl.buyer_rep_agreement_date;

    var body = '<div class="flex items-center gap-3">' +
      '<div class="w-10 h-10 rounded-full flex items-center justify-center ' + (signed ? 'bg-green-100' : 'bg-red-100') + '">' +
        '<i class="fas ' + (signed ? 'fa-check-circle text-green-600' : 'fa-times-circle text-red-500') + ' text-lg"></i>' +
      '</div>' +
      '<div>' +
        '<p class="text-sm font-bold ' + (signed ? 'text-green-700' : 'text-red-700') + '">' + (signed ? 'Signed' : 'Not Signed') + '</p>' +
        (date ? '<p class="text-xs text-gray-500">Date: ' + D(date) + '</p>' : '') +
        '<p class="text-[10px] text-gray-400 mt-0.5">UCBA E7 — Required before submitting offers</p>' +
      '</div>' +
      '<button class="btn btn-xs btn-outline ml-auto" onclick="BuyerWorkspace._toggleBuyerRep()">' + (signed ? 'Unmark' : 'Mark Signed') + '</button>' +
    '</div>';

    return _card('file-signature', 'Buyer Rep Agreement', '', body);
  }

  function _toggleBuyerRep() {
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    var cl = Workspace._getClient ? Workspace._getClient() : {};
    if (!clientId) return;

    var newVal = !cl.buyer_rep_agreement;
    MallanAPI.clients.update(clientId, {
      buyer_rep_agreement: newVal,
      buyer_rep_agreement_date: newVal ? new Date().toISOString() : null,
    }).then(function () {
      CRM.toast(newVal ? 'Buyer rep marked as signed' : 'Buyer rep unmarked', 'success');
      Workspace.openClient(clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // INVESTOR SECTIONS
  // ═══════════════════════════════════════════════════════════════════════

  // ─── Investor Intake ──────────────────────────────────────────────────
  function _investorIntakeCard(cl) {
    var strategies = { cash_flow: 'Cash Flow', appreciation: 'Appreciation', value_add: 'Value-Add', '1031_exchange': '1031 Exchange' };
    var portfolio = [];
    try { portfolio = cl.current_portfolio ? (typeof cl.current_portfolio === 'string' ? JSON.parse(cl.current_portfolio) : cl.current_portfolio) : []; } catch (e) { /* */ }

    var body = '<div class="grid grid-cols-2 gap-4 text-sm">' +
      '<div>' +
        '<p class="text-xs font-bold text-gray-500 uppercase mb-2">Strategy</p>' +
        '<div class="space-y-1.5">' +
          '<div class="flex justify-between"><span class="text-gray-500">Strategy</span><span class="font-medium text-amber-700">' + E(strategies[cl.investment_strategy] || cl.investment_strategy || '-') + '</span></div>' +
          '<div class="flex justify-between"><span class="text-gray-500">Holding Period</span><span class="font-medium">' + (cl.holding_period_years ? cl.holding_period_years + ' years' : '-') + '</span></div>' +
        '</div>' +
      '</div>' +
      '<div>' +
        '<p class="text-xs font-bold text-gray-500 uppercase mb-2">Targets</p>' +
        '<div class="space-y-1.5">' +
          '<div class="flex justify-between"><span class="text-gray-500">Cap Rate</span><span class="font-medium">' + (cl.cap_rate_target ? cl.cap_rate_target + '%' : '-') + '</span></div>' +
          '<div class="flex justify-between"><span class="text-gray-500">Cash-on-Cash</span><span class="font-medium">' + (cl.cash_on_cash_target ? cl.cash_on_cash_target + '%' : '-') + '</span></div>' +
        '</div>' +
      '</div>' +
    '</div>';

    if (Array.isArray(portfolio) && portfolio.length > 0) {
      body += '<div class="mt-3 pt-3 border-t"><p class="text-xs font-bold text-gray-500 uppercase mb-2">Current Portfolio</p>' +
        '<div class="space-y-1">';
      portfolio.forEach(function (p) {
        body += '<div class="flex items-center gap-2 text-sm p-1.5 bg-gray-50 rounded">' +
          '<i class="fas fa-building text-xs text-gray-400"></i>' +
          '<span class="font-medium">' + E(p.address || p.name || 'Property') + '</span>' +
          (p.type ? '<span class="text-xs text-gray-400">' + E(p.type) + '</span>' : '') +
        '</div>';
      });
      body += '</div></div>';
    }

    return _card('chart-line', 'Investment Profile', 'BuyerWorkspace._editInvestorIntake()', body, '#F59E0B');
  }

  // ─── 1031 Exchange Tracker ────────────────────────────────────────────
  function _exchange1031Card(cl) {
    var status = cl.exchange_1031_status || 'none';
    if (status === 'none') {
      return _card('exchange-alt', '1031 Exchange', 'BuyerWorkspace._editInvestorIntake()',
        '<p class="text-xs text-gray-400 text-center py-2">Not in a 1031 exchange</p>');
    }

    var deadline = cl.exchange_1031_deadline;
    var daysLeft = deadline ? Math.floor((new Date(deadline).getTime() - Date.now()) / 86400000) : null;
    var urgencyColor = daysLeft !== null ? (daysLeft <= 14 ? 'text-red-600' : daysLeft <= 45 ? 'text-yellow-600' : 'text-green-600') : 'text-gray-500';

    var statusLabels = { identifying: 'Identifying (45 days)', exchanging: 'Exchanging (180 days)', completed: 'Completed' };
    var body = '<div class="space-y-3">' +
      '<div class="flex items-center justify-between">' +
        '<span class="text-sm font-bold text-amber-700">' + E(statusLabels[status] || status) + '</span>' +
        (daysLeft !== null ? '<span class="text-lg font-bold ' + urgencyColor + '">' + daysLeft + ' days left</span>' : '') +
      '</div>';

    if (daysLeft !== null && daysLeft > 0) {
      var pct = Math.max(0, Math.min(100, 100 - (daysLeft / 180 * 100)));
      body += '<div class="h-2 bg-gray-200 rounded-full overflow-hidden">' +
        '<div class="h-full rounded-full" style="width:' + pct + '%;background:' + (daysLeft <= 14 ? '#EF4444' : daysLeft <= 45 ? '#F59E0B' : '#059669') + '"></div>' +
      '</div>';
    }

    if (deadline) {
      body += '<div class="text-xs text-gray-500">Deadline: ' + D(deadline) + '</div>';
    }

    if (daysLeft !== null && daysLeft <= 30) {
      body += '<div class="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">' +
        '<i class="fas fa-exclamation-triangle mr-1"></i> Approaching deadline — prioritize property identification' +
      '</div>';
    }

    body += '</div>';
    return _card('exchange-alt', '1031 Exchange Tracker', 'BuyerWorkspace._editInvestorIntake()', body, '#DC2626');
  }

  // ─── Investor Calculator Tools ────────────────────────────────────────
  function _investorToolsCard() {
    var body = '<div class="grid grid-cols-2 gap-2">' +
      '<button class="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 text-center transition-all" onclick="BuyerWorkspace._openCapRateCalc()">' +
        '<i class="fas fa-percentage text-lg text-amber-600 mb-1"></i>' +
        '<p class="text-xs font-bold text-gray-700">Cap Rate</p>' +
      '</button>' +
      '<button class="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 text-center transition-all" onclick="BuyerWorkspace._openCashOnCashCalc()">' +
        '<i class="fas fa-coins text-lg text-green-600 mb-1"></i>' +
        '<p class="text-xs font-bold text-gray-700">Cash-on-Cash</p>' +
      '</button>' +
      '<button class="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 text-center transition-all" onclick="BuyerWorkspace._openROICalc()">' +
        '<i class="fas fa-chart-line text-lg text-blue-600 mb-1"></i>' +
        '<p class="text-xs font-bold text-gray-700">ROI</p>' +
      '</button>' +
      '<button class="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 text-center transition-all" onclick="BuyerWorkspace._openRentalYieldCalc()">' +
        '<i class="fas fa-home text-lg text-purple-600 mb-1"></i>' +
        '<p class="text-xs font-bold text-gray-700">Rental Yield</p>' +
      '</button>' +
    '</div>';

    return _card('tools', 'Investment Calculators', '', body, '#059669');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CALCULATOR MODALS
  // ═══════════════════════════════════════════════════════════════════════

  function _openCapRateCalc() {
    CRM.openModal('Cap Rate Calculator', '<div class="space-y-4">' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Net Operating Income (Annual)</label>' +
          '<input id="cr_noi" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" oninput="BuyerWorkspace._calcCapRate()"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Property Value / Price</label>' +
          '<input id="cr_price" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" oninput="BuyerWorkspace._calcCapRate()"></div>' +
      '</div>' +
      '<div id="cr_result" class="p-4 bg-gray-50 rounded-lg text-center hidden">' +
        '<p class="text-xs text-gray-500">Cap Rate</p>' +
        '<p class="text-3xl font-bold text-amber-700" id="cr_value">0%</p>' +
        '<p class="text-xs text-gray-400 mt-1" id="cr_verdict"></p>' +
      '</div>' +
      '<p class="text-[10px] text-gray-400">Cap Rate = NOI / Property Value. Higher = better cash flow but potentially higher risk.</p>' +
    '</div>');
  }

  function _calcCapRate() {
    var noi = Number(document.getElementById('cr_noi').value) || 0;
    var price = Number(document.getElementById('cr_price').value) || 0;
    var result = document.getElementById('cr_result');
    if (price <= 0 || noi <= 0) { result.classList.add('hidden'); return; }
    var rate = (noi / price * 100).toFixed(2);
    result.classList.remove('hidden');
    document.getElementById('cr_value').textContent = rate + '%';
    var verdict = rate >= 8 ? 'Strong cash flow investment' : rate >= 5 ? 'Moderate — typical NYC range' : 'Low cap rate — appreciation play';
    document.getElementById('cr_verdict').textContent = verdict;
  }

  function _openCashOnCashCalc() {
    CRM.openModal('Cash-on-Cash Return Calculator', '<div class="space-y-4">' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Annual Cash Flow (After Debt Service)</label>' +
          '<input id="coc_cashflow" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" oninput="BuyerWorkspace._calcCashOnCash()"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Total Cash Invested</label>' +
          '<input id="coc_invested" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="Down payment + closing costs" oninput="BuyerWorkspace._calcCashOnCash()"></div>' +
      '</div>' +
      '<div id="coc_result" class="p-4 bg-gray-50 rounded-lg text-center hidden">' +
        '<p class="text-xs text-gray-500">Cash-on-Cash Return</p>' +
        '<p class="text-3xl font-bold text-green-700" id="coc_value">0%</p>' +
        '<p class="text-xs text-gray-400 mt-1" id="coc_verdict"></p>' +
      '</div>' +
      '<p class="text-[10px] text-gray-400">Cash-on-Cash = Annual Cash Flow / Total Cash Invested. Measures return on actual dollars invested.</p>' +
    '</div>');
  }

  function _calcCashOnCash() {
    var cf = Number(document.getElementById('coc_cashflow').value) || 0;
    var inv = Number(document.getElementById('coc_invested').value) || 0;
    var result = document.getElementById('coc_result');
    if (inv <= 0) { result.classList.add('hidden'); return; }
    var rate = (cf / inv * 100).toFixed(2);
    result.classList.remove('hidden');
    document.getElementById('coc_value').textContent = rate + '%';
    var color = rate >= 8 ? 'text-green-700' : rate >= 4 ? 'text-yellow-700' : 'text-red-700';
    document.getElementById('coc_value').className = 'text-3xl font-bold ' + color;
    var verdict = rate >= 10 ? 'Excellent return' : rate >= 6 ? 'Good — above market average' : rate >= 3 ? 'Below average — consider alternatives' : 'Poor cash-on-cash';
    document.getElementById('coc_verdict').textContent = verdict;
  }

  function _openROICalc() {
    CRM.openModal('ROI Calculator', '<div class="space-y-4">' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Purchase Price</label>' +
          '<input id="roi_price" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" oninput="BuyerWorkspace._calcROI()"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Current / Expected Value</label>' +
          '<input id="roi_value" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" oninput="BuyerWorkspace._calcROI()"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Total Rental Income (Over Hold)</label>' +
          '<input id="roi_income" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" oninput="BuyerWorkspace._calcROI()"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Total Expenses (Over Hold)</label>' +
          '<input id="roi_expenses" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" oninput="BuyerWorkspace._calcROI()"></div>' +
      '</div>' +
      '<div id="roi_result" class="p-4 bg-gray-50 rounded-lg text-center hidden">' +
        '<p class="text-xs text-gray-500">Total ROI</p>' +
        '<p class="text-3xl font-bold text-blue-700" id="roi_val">0%</p>' +
        '<div class="grid grid-cols-2 gap-2 mt-2 text-xs text-gray-500">' +
          '<div>Appreciation: <span class="font-bold" id="roi_appr">$0</span></div>' +
          '<div>Net Cash Flow: <span class="font-bold" id="roi_cf">$0</span></div>' +
        '</div>' +
      '</div>' +
    '</div>');
  }

  function _calcROI() {
    var price = Number(document.getElementById('roi_price').value) || 0;
    var value = Number(document.getElementById('roi_value').value) || 0;
    var income = Number(document.getElementById('roi_income').value) || 0;
    var expenses = Number(document.getElementById('roi_expenses').value) || 0;
    var result = document.getElementById('roi_result');
    if (price <= 0) { result.classList.add('hidden'); return; }
    var appreciation = value - price;
    var netCashFlow = income - expenses;
    var totalGain = appreciation + netCashFlow;
    var roi = (totalGain / price * 100).toFixed(2);
    result.classList.remove('hidden');
    document.getElementById('roi_val').textContent = roi + '%';
    document.getElementById('roi_appr').textContent = $(appreciation);
    document.getElementById('roi_cf').textContent = $(netCashFlow);
  }

  function _openRentalYieldCalc() {
    CRM.openModal('Rental Yield Calculator', '<div class="space-y-4">' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Monthly Rent</label>' +
          '<input id="ry_rent" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" oninput="BuyerWorkspace._calcRentalYield()"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Property Price</label>' +
          '<input id="ry_price" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" oninput="BuyerWorkspace._calcRentalYield()"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Annual Expenses (Maint, Tax, Insurance)</label>' +
          '<input id="ry_expenses" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" oninput="BuyerWorkspace._calcRentalYield()"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Vacancy Rate %</label>' +
          '<input id="ry_vacancy" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="5" value="5" oninput="BuyerWorkspace._calcRentalYield()"></div>' +
      '</div>' +
      '<div id="ry_result" class="p-4 bg-gray-50 rounded-lg hidden">' +
        '<div class="grid grid-cols-2 gap-3 text-center">' +
          '<div><p class="text-xs text-gray-500">Gross Yield</p><p class="text-2xl font-bold text-purple-700" id="ry_gross">0%</p></div>' +
          '<div><p class="text-xs text-gray-500">Net Yield</p><p class="text-2xl font-bold text-green-700" id="ry_net">0%</p></div>' +
        '</div>' +
        '<div class="mt-2 text-xs text-gray-500 text-center" id="ry_detail"></div>' +
      '</div>' +
    '</div>');
  }

  function _calcRentalYield() {
    var rent = Number(document.getElementById('ry_rent').value) || 0;
    var price = Number(document.getElementById('ry_price').value) || 0;
    var expenses = Number(document.getElementById('ry_expenses').value) || 0;
    var vacancy = Number(document.getElementById('ry_vacancy').value) || 0;
    var result = document.getElementById('ry_result');
    if (price <= 0 || rent <= 0) { result.classList.add('hidden'); return; }
    var annualRent = rent * 12;
    var effectiveRent = annualRent * (1 - vacancy / 100);
    var grossYield = (annualRent / price * 100).toFixed(2);
    var netYield = ((effectiveRent - expenses) / price * 100).toFixed(2);
    result.classList.remove('hidden');
    document.getElementById('ry_gross').textContent = grossYield + '%';
    document.getElementById('ry_net').textContent = netYield + '%';
    document.getElementById('ry_detail').textContent = 'Annual Rent: ' + $(annualRent) + ' | Effective: ' + $(effectiveRent) + ' | NOI: ' + $(effectiveRent - expenses);
  }

  // ─── Edit Investor Intake ─────────────────────────────────────────────
  function _editInvestorIntake() {
    var cl = Workspace._getClient ? Workspace._getClient() : {};
    CRM.openModal('Edit Investment Profile', '<div class="space-y-4">' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Investment Strategy</label>' +
          '<select id="inv_strategy" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
            '<option value="">Select...</option>' +
            '<option value="cash_flow"' + (cl.investment_strategy === 'cash_flow' ? ' selected' : '') + '>Cash Flow</option>' +
            '<option value="appreciation"' + (cl.investment_strategy === 'appreciation' ? ' selected' : '') + '>Appreciation</option>' +
            '<option value="value_add"' + (cl.investment_strategy === 'value_add' ? ' selected' : '') + '>Value-Add</option>' +
            '<option value="1031_exchange"' + (cl.investment_strategy === '1031_exchange' ? ' selected' : '') + '>1031 Exchange</option>' +
          '</select></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Holding Period (Years)</label>' +
          '<input id="inv_hold" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.holding_period_years || '') + '" placeholder="5"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Cap Rate Target %</label>' +
          '<input id="inv_cap" type="number" step="0.1" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.cap_rate_target || '') + '" placeholder="6.0"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Cash-on-Cash Target %</label>' +
          '<input id="inv_coc" type="number" step="0.1" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.cash_on_cash_target || '') + '" placeholder="8.0"></div>' +
      '</div>' +
      '<div class="border-t pt-3">' +
        '<p class="text-xs font-bold text-gray-500 mb-2">1031 Exchange</p>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="text-xs text-gray-500">Status</label>' +
            '<select id="inv_1031" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
              '<option value="none"' + (cl.exchange_1031_status === 'none' || !cl.exchange_1031_status ? ' selected' : '') + '>Not in exchange</option>' +
              '<option value="identifying"' + (cl.exchange_1031_status === 'identifying' ? ' selected' : '') + '>Identifying (45-day)</option>' +
              '<option value="exchanging"' + (cl.exchange_1031_status === 'exchanging' ? ' selected' : '') + '>Exchanging (180-day)</option>' +
              '<option value="completed"' + (cl.exchange_1031_status === 'completed' ? ' selected' : '') + '>Completed</option>' +
            '</select></div>' +
          '<div><label class="text-xs text-gray-500">Deadline</label>' +
            '<input id="inv_1031_deadline" type="date" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + (cl.exchange_1031_deadline ? new Date(cl.exchange_1031_deadline).toISOString().split('T')[0] : '') + '"></div>' +
        '</div>' +
      '</div>' +
      '<button class="btn btn-gold w-full" onclick="BuyerWorkspace._saveInvestorIntake()">Save</button>' +
    '</div>');
  }

  function _saveInvestorIntake() {
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    if (!clientId) return;

    var deadline = document.getElementById('inv_1031_deadline').value;
    MallanAPI.clients.update(clientId, {
      investment_strategy: document.getElementById('inv_strategy').value || null,
      holding_period_years: document.getElementById('inv_hold').value ? parseInt(document.getElementById('inv_hold').value) : null,
      cap_rate_target: document.getElementById('inv_cap').value ? parseFloat(document.getElementById('inv_cap').value) : null,
      cash_on_cash_target: document.getElementById('inv_coc').value ? parseFloat(document.getElementById('inv_coc').value) : null,
      exchange_1031_status: document.getElementById('inv_1031').value || 'none',
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Investment profile updated', 'success');
      Workspace.openClient(clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════
  return {
    renderBuyerSections: renderBuyerSections,

    _toggleBuyerRep: _toggleBuyerRep,
    _editInvestorIntake: _editInvestorIntake,
    _saveInvestorIntake: _saveInvestorIntake,

    // Calculator modal openers
    _openCapRateCalc: _openCapRateCalc,
    _openCashOnCashCalc: _openCashOnCashCalc,
    _openROICalc: _openROICalc,
    _openRentalYieldCalc: _openRentalYieldCalc,

    // Calculator computation
    _calcCapRate: _calcCapRate,
    _calcCashOnCash: _calcCashOnCash,
    _calcROI: _calcROI,
    _calcRentalYield: _calcRentalYield,
  };
})();
