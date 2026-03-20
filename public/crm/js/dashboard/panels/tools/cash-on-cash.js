// ═══════════════════════════════════════════════════════════════════════════════
// CASH-ON-CASH RETURN CALCULATOR
// Calculates cash-on-cash return for rental investment properties
// ═══════════════════════════════════════════════════════════════════════════════
/* global Utils, CRM */

var CashOnCashCalc = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;

  var _formId = 'coc-calc-' + Date.now();

  function _val(id) {
    var el = document.getElementById(id);
    return el ? parseFloat(el.value) || 0 : 0;
  }

  function _colorClass(pct) {
    if (pct >= 8) return 'text-green-600';
    if (pct >= 5) return 'text-yellow-600';
    return 'text-red-600';
  }

  function _colorBg(pct) {
    if (pct >= 8) return 'bg-green-50 border-green-200';
    if (pct >= 5) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  }

  function _colorLabel(pct) {
    if (pct >= 8) return 'Strong Return';
    if (pct >= 5) return 'Moderate Return';
    return 'Below Target';
  }

  function calculate() {
    var purchasePrice = _val(_formId + '-purchase-price');
    var downPayment = _val(_formId + '-down-payment');
    var closingCosts = _val(_formId + '-closing-costs');
    var annualRent = _val(_formId + '-annual-rent');
    var taxes = _val(_formId + '-taxes');
    var insurance = _val(_formId + '-insurance');
    var maintenance = _val(_formId + '-maintenance');
    var management = _val(_formId + '-management');
    var vacancyAllowance = _val(_formId + '-vacancy');
    var annualMortgage = _val(_formId + '-mortgage');

    var totalExpenses = taxes + insurance + maintenance + management + vacancyAllowance;
    var totalCashInvested = downPayment + closingCosts;
    var annualCashFlow = annualRent - totalExpenses - annualMortgage;
    var monthlyCashFlow = annualCashFlow / 12;
    var cocReturn = totalCashInvested > 0 ? (annualCashFlow / totalCashInvested) * 100 : 0;

    var resultsEl = document.getElementById(_formId + '-results');
    if (!resultsEl) return;

    var colorCls = _colorClass(cocReturn);
    var colorBgCls = _colorBg(cocReturn);
    var label = _colorLabel(cocReturn);

    resultsEl.innerHTML =
      '<div class="border rounded-lg p-4 ' + colorBgCls + '">' +
        '<div class="text-center mb-4">' +
          '<div class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cash-on-Cash Return</div>' +
          '<div class="text-4xl font-bold ' + colorCls + '">' + cocReturn.toFixed(2) + '%</div>' +
          '<div class="text-sm font-medium ' + colorCls + '">' + E(label) + '</div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3 mb-4">' +
          '<div class="bg-white rounded p-3 text-center border">' +
            '<div class="text-xs text-gray-500">Annual Cash Flow</div>' +
            '<div class="text-lg font-bold ' + (annualCashFlow >= 0 ? 'text-green-700' : 'text-red-700') + '">' + $(annualCashFlow) + '</div>' +
          '</div>' +
          '<div class="bg-white rounded p-3 text-center border">' +
            '<div class="text-xs text-gray-500">Monthly Cash Flow</div>' +
            '<div class="text-lg font-bold ' + (monthlyCashFlow >= 0 ? 'text-green-700' : 'text-red-700') + '">' + $(monthlyCashFlow) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="bg-white rounded p-3 border">' +
          '<div class="text-xs font-semibold text-gray-700 mb-2">Breakdown</div>' +
          '<table class="w-full text-sm">' +
            '<tr class="border-b"><td class="py-1 text-gray-600">Total Cash Invested</td><td class="py-1 text-right font-medium">' + $(totalCashInvested) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600 pl-4">Down Payment</td><td class="py-1 text-right text-gray-500">' + $(downPayment) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600 pl-4">Closing Costs</td><td class="py-1 text-right text-gray-500">' + $(closingCosts) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600">Annual Rental Income</td><td class="py-1 text-right font-medium text-green-700">+' + $(annualRent) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600">Total Expenses</td><td class="py-1 text-right font-medium text-red-700">-' + $(totalExpenses) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600 pl-4">Taxes</td><td class="py-1 text-right text-gray-500">-' + $(taxes) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600 pl-4">Insurance</td><td class="py-1 text-right text-gray-500">-' + $(insurance) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600 pl-4">Maintenance</td><td class="py-1 text-right text-gray-500">-' + $(maintenance) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600 pl-4">Management</td><td class="py-1 text-right text-gray-500">-' + $(management) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600 pl-4">Vacancy Allowance</td><td class="py-1 text-right text-gray-500">-' + $(vacancyAllowance) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600">Annual Mortgage</td><td class="py-1 text-right font-medium text-red-700">-' + $(annualMortgage) + '</td></tr>' +
            '<tr><td class="py-1 font-semibold text-gray-800">Net Annual Cash Flow</td><td class="py-1 text-right font-bold ' + (annualCashFlow >= 0 ? 'text-green-700' : 'text-red-700') + '">' + $(annualCashFlow) + '</td></tr>' +
          '</table>' +
        '</div>' +
        '<div class="mt-3 p-2 bg-gray-50 rounded text-xs text-gray-500 border">' +
          '<strong>Formula:</strong> (Annual Rent - Expenses - Mortgage) / (Down Payment + Closing Costs) &times; 100<br>' +
          '(' + $(annualRent) + ' - ' + $(totalExpenses) + ' - ' + $(annualMortgage) + ') / ' + $(totalCashInvested) + ' = <strong>' + cocReturn.toFixed(2) + '%</strong>' +
        '</div>' +
      '</div>';
  }

  function _printResults() {
    var resultsEl = document.getElementById(_formId + '-results');
    if (!resultsEl || !resultsEl.innerHTML.trim()) {
      CRM.toast('Calculate results first', 'warning');
      return;
    }
    var w = window.open('', '_blank', 'width=600,height=800');
    w.document.write(
      '<html><head><title>Cash-on-Cash Return</title>' +
      '<style>body{font-family:system-ui,sans-serif;padding:2rem;color:#333}' +
      'table{width:100%;border-collapse:collapse}td{padding:4px 8px}' +
      '.text-green-700,.text-green-600{color:#15803d}.text-red-700,.text-red-600{color:#b91c1c}' +
      '.text-yellow-600{color:#ca8a04}.text-gray-500,.text-gray-600{color:#6b7280}' +
      '.font-bold{font-weight:700}.font-semibold{font-weight:600}.text-4xl{font-size:2.25rem}' +
      '.text-center{text-align:center}.text-right{text-align:right}.text-xs{font-size:0.75rem}' +
      '.text-sm{font-size:0.875rem}.text-lg{font-size:1.125rem}' +
      '.border-b{border-bottom:1px solid #e5e7eb}.py-1{padding-top:4px;padding-bottom:4px}' +
      '.mb-4{margin-bottom:1rem}.mb-2{margin-bottom:0.5rem}.mt-3{margin-top:0.75rem}' +
      '.pl-4{padding-left:1rem}.p-3{padding:0.75rem}.p-4{padding:1rem}.p-2{padding:0.5rem}' +
      '.rounded{border-radius:0.25rem}.rounded-lg{border-radius:0.5rem}' +
      '.border{border:1px solid #e5e7eb}.grid{display:grid}.grid-cols-2{grid-template-columns:repeat(2,1fr)}.gap-3{gap:0.75rem}' +
      '.bg-white{background:#fff}.bg-green-50{background:#f0fdf4}.bg-yellow-50{background:#fefce8}.bg-red-50{background:#fef2f2}' +
      '.bg-gray-50{background:#f9fafb}.border-green-200{border-color:#bbf7d0}.border-yellow-200{border-color:#fef08a}.border-red-200{border-color:#fecaca}' +
      '.uppercase{text-transform:uppercase}.tracking-wide{letter-spacing:0.05em}' +
      '@media print{body{padding:0.5rem}}</style></head><body>' +
      '<h2 style="margin-bottom:0.5rem">Cash-on-Cash Return Analysis</h2>' +
      '<div style="font-size:0.75rem;color:#888;margin-bottom:1rem">Mallan Real Estate Inc. &mdash; ' + new Date().toLocaleDateString() + '</div>' +
      resultsEl.innerHTML +
      '</body></html>'
    );
    w.document.close();
    w.print();
  }

  function _copyResults() {
    var resultsEl = document.getElementById(_formId + '-results');
    if (!resultsEl || !resultsEl.textContent.trim()) {
      CRM.toast('Calculate results first', 'warning');
      return;
    }
    var text = resultsEl.textContent.replace(/\s+/g, ' ').trim();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        CRM.toast('Results copied to clipboard', 'success');
      });
    }
  }

  function render(opts) {
    opts = opts || {};
    var pp = opts.purchase_price || '';
    var dp = opts.down_payment || '';
    var cc = opts.closing_costs || '';
    var ar = opts.annual_rental_income || '';
    var tx = opts.taxes || '';
    var ins = opts.insurance || '';
    var mnt = opts.maintenance || '';
    var mgmt = opts.management || '';
    var vac = opts.vacancy_allowance || '';
    var mort = opts.annual_mortgage_payment || '';

    return (
      '<div class="space-y-4" id="' + _formId + '">' +
        '<div class="flex items-center justify-between mb-2">' +
          '<h3 class="text-base font-bold text-gray-800"><i class="fas fa-percentage mr-2 text-amber-600"></i>Cash-on-Cash Return</h3>' +
          '<div class="flex gap-2">' +
            '<button onclick="CashOnCashCalc.calculate()" class="px-3 py-1 bg-amber-600 text-white text-xs font-semibold rounded hover:bg-amber-700">Calculate</button>' +
            '<button onclick="CashOnCashCalc.print()" class="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs" title="Print"><i class="fas fa-print"></i></button>' +
            '<button onclick="CashOnCashCalc.copy()" class="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs" title="Copy"><i class="fas fa-copy"></i></button>' +
          '</div>' +
        '</div>' +

        '<!-- Purchase Inputs -->' +
        '<div class="bg-white border rounded-lg p-4">' +
          '<div class="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">Investment Details</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Purchase Price</label>' +
              '<input id="' + _formId + '-purchase-price" type="number" value="' + E(pp) + '" placeholder="750000" oninput="CashOnCashCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Down Payment</label>' +
              '<input id="' + _formId + '-down-payment" type="number" value="' + E(dp) + '" placeholder="150000" oninput="CashOnCashCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Closing Costs</label>' +
              '<input id="' + _formId + '-closing-costs" type="number" value="' + E(cc) + '" placeholder="15000" oninput="CashOnCashCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<!-- Income -->' +
        '<div class="bg-white border rounded-lg p-4">' +
          '<div class="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">Annual Income</div>' +
          '<div>' +
            '<label class="block text-xs font-semibold text-gray-700 mb-1">Annual Rental Income</label>' +
            '<input id="' + _formId + '-annual-rent" type="number" value="' + E(ar) + '" placeholder="36000" oninput="CashOnCashCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
          '</div>' +
        '</div>' +

        '<!-- Expenses -->' +
        '<div class="bg-white border rounded-lg p-4">' +
          '<div class="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">Annual Expenses</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Property Taxes</label>' +
              '<input id="' + _formId + '-taxes" type="number" value="' + E(tx) + '" placeholder="6000" oninput="CashOnCashCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Insurance</label>' +
              '<input id="' + _formId + '-insurance" type="number" value="' + E(ins) + '" placeholder="2400" oninput="CashOnCashCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Maintenance</label>' +
              '<input id="' + _formId + '-maintenance" type="number" value="' + E(mnt) + '" placeholder="3000" oninput="CashOnCashCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Property Management</label>' +
              '<input id="' + _formId + '-management" type="number" value="' + E(mgmt) + '" placeholder="3600" oninput="CashOnCashCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Vacancy Allowance</label>' +
              '<input id="' + _formId + '-vacancy" type="number" value="' + E(vac) + '" placeholder="1800" oninput="CashOnCashCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<!-- Mortgage -->' +
        '<div class="bg-white border rounded-lg p-4">' +
          '<div class="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">Debt Service</div>' +
          '<div>' +
            '<label class="block text-xs font-semibold text-gray-700 mb-1">Annual Mortgage Payment</label>' +
            '<input id="' + _formId + '-mortgage" type="number" value="' + E(mort) + '" placeholder="28800" oninput="CashOnCashCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
          '</div>' +
        '</div>' +

        '<!-- Results -->' +
        '<div id="' + _formId + '-results"></div>' +
      '</div>'
    );
  }

  return {
    render: render,
    calculate: calculate,
    print: _printResults,
    copy: _copyResults
  };
})();
