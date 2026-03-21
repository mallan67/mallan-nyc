// ═══════════════════════════════════════════════════════════════════════════════
// BUYER CLOSING COSTS CALCULATOR — NYC-specific
//
// Covers: Mansion Tax, Mortgage Recording Tax, Title Insurance,
// Attorney Fee, Board App Fee, Move-In Fee, Buyer Agent Fee (negotiable)
// Pre-fill from property research data (BBL/ACRIS/DOF)
//
// NAR Settlement compliance: buyer agent fee is ALWAYS shown as negotiable,
// never pre-populated, must match what's in the buyer rep agreement.
// ═══════════════════════════════════════════════════════════════════════════════
/* global Utils, CRM */

var BuyerClosingCalc = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var _formId = 'bcc-' + Date.now();

  function _val(id) {
    var el = document.getElementById(id);
    return el ? parseFloat(el.value) || 0 : 0;
  }
  function _checked(id) {
    var el = document.getElementById(id);
    return el ? el.checked : false;
  }

  // ── NYC Mansion Tax (buyer pays) ──────────────────────────────────────────
  // Tiered: 1% @ $1M, up to 3.9% @ $25M+
  function _mansionTax(price) {
    if (price < 1000000) return 0;
    if (price < 2000000) return price * 0.01;
    if (price < 3000000) return price * 0.0125;
    if (price < 5000000) return price * 0.015;
    if (price < 10000000) return price * 0.0225;
    if (price < 15000000) return price * 0.0325;
    if (price < 20000000) return price * 0.035;
    if (price < 25000000) return price * 0.0375;
    return price * 0.039;
  }

  function _mansionTaxTier(price) {
    if (price < 1000000) return 'N/A (under $1M)';
    if (price < 2000000) return '1.00%';
    if (price < 3000000) return '1.25%';
    if (price < 5000000) return '1.50%';
    if (price < 10000000) return '2.25%';
    if (price < 15000000) return '3.25%';
    if (price < 20000000) return '3.50%';
    if (price < 25000000) return '3.75%';
    return '3.90%';
  }

  // ── NYC Mortgage Recording Tax (if financing) ─────────────────────────────
  // NYC: 1.8% of loan amount for loans < $500K; 1.925% for $500K+
  // NYS: 0.5% included in the above
  function _mortgageRecordingTax(loanAmount) {
    if (loanAmount <= 0) return 0;
    if (loanAmount < 500000) return loanAmount * 0.018;
    return loanAmount * 0.01925;
  }

  // ── Estimated monthly payment ─────────────────────────────────────────────
  function _monthlyPayment(loanAmount, ratePct, termYears) {
    if (loanAmount <= 0 || ratePct <= 0) return 0;
    var r = (ratePct / 100) / 12;
    var n = termYears * 12;
    return loanAmount * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  function calculate() {
    var price = _val(_formId + '-price');
    var downPct = _val(_formId + '-down-pct');
    var isFinancing = _checked(_formId + '-financing');
    var ratePct = _val(_formId + '-rate');
    var termYears = _val(_formId + '-term') || 30;

    var loanAmount = isFinancing ? price * (1 - downPct / 100) : 0;
    var downPayment = isFinancing ? price * (downPct / 100) : price; // all cash = full price as "down"

    // Taxes + government fees
    var mansionTax = _mansionTax(price);
    var mortgageRecTax = isFinancing ? _mortgageRecordingTax(loanAmount) : 0;

    // Service fees
    var titleInsurance = _val(_formId + '-title');
    var attorneyFee = _val(_formId + '-attorney');
    var buyerAgentFee = price * (_val(_formId + '-agent-fee-pct') / 100);
    var boardAppFee = _val(_formId + '-board-app');
    var moveInFee = _val(_formId + '-move-in');
    var misc = _val(_formId + '-misc');

    // Monthly costs
    var monthlyMortgage = isFinancing ? _monthlyPayment(loanAmount, ratePct, termYears) : 0;
    var monthlyMaint = _val(_formId + '-monthly-maint');
    var monthlyTax = _val(_formId + '-monthly-tax');
    var totalMonthly = monthlyMortgage + monthlyMaint + monthlyTax;

    var totalClosingCosts = mansionTax + mortgageRecTax + titleInsurance + attorneyFee +
      buyerAgentFee + boardAppFee + moveInFee + misc;
    var totalCashNeeded = downPayment + totalClosingCosts;

    var res = document.getElementById(_formId + '-results');
    if (!res) return;

    var h = '';

    // ── Summary card ──
    h += '<div class="border rounded-xl p-4 bg-gradient-to-br from-blue-50 to-indigo-50 mb-4">';
    h += '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">';
    h += _summaryCard('Total Cash Needed', $(totalCashNeeded), 'text-blue-700');
    h += _summaryCard('Closing Costs', $(totalClosingCosts), 'text-purple-700');
    h += _summaryCard(isFinancing ? 'Monthly Payment (est)' : 'All-Cash Purchase', isFinancing ? $(Math.round(totalMonthly)) + '/mo' : 'No mortgage', 'text-green-700');
    h += '</div>';

    // ── Breakdown table ──
    h += '<div class="bg-white rounded-lg border p-3">';
    h += '<div class="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Closing Costs Breakdown</div>';
    h += '<table class="w-full text-sm">';

    h += _tableSection('Down Payment & Loan');
    if (isFinancing) {
      h += _tableRow('Down Payment (' + downPct + '%)', $(Math.round(downPayment)));
      h += _tableRow('Loan Amount', $(Math.round(loanAmount)));
    } else {
      h += _tableRow('Purchase Price (All Cash)', $(price));
    }

    h += _tableSection('Government Taxes');
    h += _tableRow('NYC Mansion Tax (' + _mansionTaxTier(price) + ')', $(Math.round(mansionTax)), price < 1000000 ? 'N/A' : null);
    if (isFinancing) {
      h += _tableRow('NYC/NYS Mortgage Recording Tax (' + (loanAmount < 500000 ? '1.800%' : '1.925%') + ')', $(Math.round(mortgageRecTax)));
    }

    h += _tableSection('Service Fees');
    h += _tableRow('Title Insurance', $(titleInsurance));
    h += _tableRow('Attorney Fee', $(attorneyFee));
    if (buyerAgentFee > 0) {
      h += _tableRow('Buyer Agent Fee (negotiable — per buyer rep agreement)', $(Math.round(buyerAgentFee)));
    }
    if (boardAppFee > 0) h += _tableRow('Board Application Fee', $(boardAppFee));
    if (moveInFee > 0) h += _tableRow('Building Move-In Fee', $(moveInFee));
    if (misc > 0) h += _tableRow('Miscellaneous', $(misc));

    h += '<tr class="border-t-2 border-gray-200"><td class="py-2 font-bold text-gray-800">Total Closing Costs</td><td class="py-2 text-right font-bold text-purple-700">' + $(Math.round(totalClosingCosts)) + '</td></tr>';
    h += '<tr class="border-t border-blue-200 bg-blue-50"><td class="py-2 font-bold text-blue-800">Total Cash Needed at Closing</td><td class="py-2 text-right font-bold text-blue-800 text-lg">' + $(Math.round(totalCashNeeded)) + '</td></tr>';
    h += '</table></div>';

    if (isFinancing && monthlyMortgage > 0) {
      h += '<div class="mt-3 bg-white rounded-lg border p-3">';
      h += '<div class="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Monthly Costs</div>';
      h += '<table class="w-full text-sm">';
      h += _tableRow('Mortgage (P&I)', '$' + Math.round(monthlyMortgage).toLocaleString());
      if (monthlyMaint > 0) h += _tableRow('Maintenance / HOA', '$' + Math.round(monthlyMaint).toLocaleString() + '/mo');
      if (monthlyTax > 0) h += _tableRow('Property Tax', '$' + Math.round(monthlyTax).toLocaleString() + '/mo');
      h += '<tr class="border-t border-gray-200"><td class="py-2 font-bold text-gray-800">Estimated Total Monthly</td><td class="py-2 text-right font-bold text-green-700 text-lg">$' + Math.round(totalMonthly).toLocaleString() + '/mo</td></tr>';
      h += '</table></div>';
    }

    h += '<div class="mt-3 p-2 bg-gray-50 rounded text-[10px] text-gray-400 border">';
    h += '<strong>Note:</strong> Buyer agent fee is fully negotiable and not set by law (NAR Settlement Aug 2025). ';
    h += 'Amount must be agreed upon in a signed buyer representation agreement. ';
    h += 'Mansion Tax paid by buyer at closing. Mortgage Recording Tax paid by buyer if financing. ';
    h += 'All figures are estimates — consult your attorney for exact amounts.';
    h += '</div>';

    h += '</div>';
    res.innerHTML = h;
  }

  function _summaryCard(label, value, colorClass) {
    return '<div class="bg-white rounded-lg border p-3 text-center">' +
      '<div class="text-xs text-gray-500">' + E(label) + '</div>' +
      '<div class="text-xl font-bold ' + colorClass + '">' + value + '</div>' +
    '</div>';
  }
  function _tableSection(title) {
    return '<tr><td colspan="2" class="py-1.5 text-[10px] font-bold text-gray-500 uppercase bg-gray-50 px-1">' + E(title) + '</td></tr>';
  }
  function _tableRow(label, value, override) {
    return '<tr class="border-b border-gray-100"><td class="py-1.5 text-gray-600 pl-2">' + E(label) + '</td>' +
      '<td class="py-1.5 text-right font-medium">' + E(override !== null && override !== undefined ? override : value) + '</td></tr>';
  }

  function _print() {
    var res = document.getElementById(_formId + '-results');
    if (!res || !res.innerHTML.trim()) { CRM.toast('Calculate first', 'warning'); return; }
    var w = window.open('', '_blank', 'width=700,height=900');
    w.document.write('<html><head><title>Buyer Closing Costs</title>' +
      '<style>body{font-family:system-ui,sans-serif;padding:2rem;color:#333}' +
      'table{width:100%;border-collapse:collapse}td{padding:5px 8px}' +
      '.font-bold{font-weight:700}.text-right{text-align:right}' +
      '.border-b{border-bottom:1px solid #e5e7eb}.bg-gray-50{background:#f9fafb}' +
      '@media print{body{padding:0.5rem}}</style></head><body>' +
      '<h2>Buyer Closing Costs Estimate</h2>' +
      '<div style="font-size:0.75rem;color:#888;margin-bottom:1rem">Mallan Real Estate Inc. &mdash; ' + new Date().toLocaleDateString() + '</div>' +
      res.innerHTML + '</body></html>');
    w.document.close();
    w.print();
  }

  function render(opts) {
    opts = opts || {};
    var fp = _formId;

    return '<div class="space-y-4" id="' + fp + '">' +

      '<div class="flex items-center justify-between mb-2">' +
        '<h3 class="text-base font-bold text-gray-800"><i class="fas fa-hand-holding-usd mr-2 text-blue-600"></i>Buyer Closing Costs</h3>' +
        '<div class="flex gap-2">' +
          '<button onclick="BuyerClosingCalc.calculate()" class="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700">Calculate</button>' +
          '<button onclick="BuyerClosingCalc.print()" class="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs" title="Print"><i class="fas fa-print"></i></button>' +
        '</div>' +
      '</div>' +

      // Purchase details
      '<div class="bg-white border rounded-lg p-4">' +
        '<div class="text-xs font-bold text-gray-700 mb-3 uppercase">Purchase Details</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
          '<div>' +
            '<label class="block text-xs font-semibold text-gray-700 mb-1">Purchase Price</label>' +
            '<input id="' + fp + '-price" type="number" value="' + E(opts.price || '') + '" placeholder="1500000" ' +
            'oninput="BuyerClosingCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-200">' +
          '</div>' +
          '<div>' +
            '<label class="flex items-center gap-2 text-xs font-semibold text-gray-700 mb-2">' +
              '<input id="' + fp + '-financing" type="checkbox" ' + (opts.financing !== false ? 'checked' : '') + ' onchange="BuyerClosingCalc.calculate()" class="rounded">' +
              'Financing (mortgage)' +
            '</label>' +
            '<label class="block text-xs font-semibold text-gray-700 mb-1">Down Payment %</label>' +
            '<input id="' + fp + '-down-pct" type="number" value="' + E(opts.down_pct || '20') + '" placeholder="20" step="5" min="0" max="100" ' +
            'oninput="BuyerClosingCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-200">' +
          '</div>' +
          '<div>' +
            '<label class="block text-xs font-semibold text-gray-700 mb-1">Mortgage Rate %</label>' +
            '<input id="' + fp + '-rate" type="number" value="' + E(opts.rate || '') + '" placeholder="e.g. 6.75" step="0.125" ' +
            'oninput="BuyerClosingCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-200">' +
          '</div>' +
          '<div>' +
            '<label class="block text-xs font-semibold text-gray-700 mb-1">Term</label>' +
            '<select id="' + fp + '-term" onchange="BuyerClosingCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm">' +
              '<option value="30" ' + (opts.term === 30 || !opts.term ? 'selected' : '') + '>30 Year</option>' +
              '<option value="20" ' + (opts.term === 20 ? 'selected' : '') + '>20 Year</option>' +
              '<option value="15" ' + (opts.term === 15 ? 'selected' : '') + '>15 Year</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Service fees
      '<div class="bg-white border rounded-lg p-4">' +
        '<div class="text-xs font-bold text-gray-700 mb-3 uppercase">Fees &amp; Service Costs</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">' +
          '<div>' +
            '<label class="block text-xs font-semibold text-gray-700 mb-1">Title Insurance</label>' +
            '<input id="' + fp + '-title" type="number" value="' + E(opts.title || '') + '" placeholder="~2,500" ' +
            'oninput="BuyerClosingCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm">' +
          '</div>' +
          '<div>' +
            '<label class="block text-xs font-semibold text-gray-700 mb-1">Attorney Fee</label>' +
            '<input id="' + fp + '-attorney" type="number" value="' + E(opts.attorney || '') + '" placeholder="~3,000" ' +
            'oninput="BuyerClosingCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm">' +
          '</div>' +
          '<div>' +
            '<label class="block text-xs font-semibold text-gray-700 mb-1">Buyer Agent Fee % <span class="text-gray-400 font-normal">(negotiable)</span></label>' +
            '<input id="' + fp + '-agent-fee-pct" type="number" value="' + E(opts.agent_fee_pct || '') + '" placeholder="Enter agreed %" step="0.1" ' +
            'oninput="BuyerClosingCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm">' +
            '<div class="text-[10px] text-gray-400 mt-1">Per buyer rep agreement — fully negotiable</div>' +
          '</div>' +
          '<div>' +
            '<label class="block text-xs font-semibold text-gray-700 mb-1">Board Application Fee</label>' +
            '<input id="' + fp + '-board-app" type="number" value="' + E(opts.board_app || '') + '" placeholder="Co-op/condo only" ' +
            'oninput="BuyerClosingCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm">' +
          '</div>' +
          '<div>' +
            '<label class="block text-xs font-semibold text-gray-700 mb-1">Move-In Fee</label>' +
            '<input id="' + fp + '-move-in" type="number" value="' + E(opts.move_in || '') + '" placeholder="Building fee" ' +
            'oninput="BuyerClosingCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm">' +
          '</div>' +
          '<div>' +
            '<label class="block text-xs font-semibold text-gray-700 mb-1">Miscellaneous</label>' +
            '<input id="' + fp + '-misc" type="number" value="" placeholder="Other costs" ' +
            'oninput="BuyerClosingCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm">' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Monthly carrying costs
      '<div class="bg-white border rounded-lg p-4">' +
        '<div class="text-xs font-bold text-gray-700 mb-3 uppercase">Monthly Carrying Costs</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div>' +
            '<label class="block text-xs font-semibold text-gray-700 mb-1">Maintenance / HOA / CC</label>' +
            '<input id="' + fp + '-monthly-maint" type="number" value="' + E(opts.monthly_maint || '') + '" placeholder="From listing" ' +
            'oninput="BuyerClosingCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm">' +
          '</div>' +
          '<div>' +
            '<label class="block text-xs font-semibold text-gray-700 mb-1">Property Tax / mo</label>' +
            '<input id="' + fp + '-monthly-tax" type="number" value="' + E(opts.monthly_tax || '') + '" placeholder="From DOF data" ' +
            'oninput="BuyerClosingCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm">' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">' +
        '<i class="fas fa-info-circle mr-1"></i>' +
        '<strong>NYC auto-calculated:</strong> Mansion Tax (1%–3.9% buyer pays on $1M+) and ' +
        'Mortgage Recording Tax (1.8% &lt;$500K / 1.925% $500K+ of loan amount) are calculated automatically.' +
      '</div>' +

      '<div id="' + fp + '-results"></div>' +
    '</div>';
  }

  return { render: render, calculate: calculate, print: _print };

})();
