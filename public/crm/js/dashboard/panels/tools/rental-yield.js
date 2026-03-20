// ═══════════════════════════════════════════════════════════════════════════════
// RENTAL YIELD CALCULATOR
// Calculates gross and net rental yield with scenario comparison
// ═══════════════════════════════════════════════════════════════════════════════
/* global Utils, CRM */

var RentalYieldCalc = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;

  var _formId = 'ry-calc-' + Date.now();

  function _val(id) {
    var el = document.getElementById(id);
    return el ? parseFloat(el.value) || 0 : 0;
  }

  function _colorClass(pct) {
    if (pct >= 6) return 'text-green-600';
    if (pct >= 4) return 'text-yellow-600';
    return 'text-red-600';
  }

  function _colorBg(pct) {
    if (pct >= 6) return 'bg-green-50 border-green-200';
    if (pct >= 4) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  }

  function _colorLabel(pct) {
    if (pct >= 6) return 'Strong Yield';
    if (pct >= 4) return 'Moderate Yield';
    return 'Below Target';
  }

  function calculate() {
    var propertyValue = _val(_formId + '-property-value');
    var monthlyRent = _val(_formId + '-monthly-rent');
    var annualExpenses = _val(_formId + '-annual-expenses');

    var annualGross = monthlyRent * 12;
    var annualNet = annualGross - annualExpenses;
    var grossYield = propertyValue > 0 ? (annualGross / propertyValue) * 100 : 0;
    var netYield = propertyValue > 0 ? (annualNet / propertyValue) * 100 : 0;
    var expenseRatio = annualGross > 0 ? (annualExpenses / annualGross) * 100 : 0;

    var resultsEl = document.getElementById(_formId + '-results');
    if (!resultsEl) return;

    var colorCls = _colorClass(netYield);
    var colorBgCls = _colorBg(netYield);
    var label = _colorLabel(netYield);

    // Scenario comparison: rent variations
    var scenarios = [
      { label: '-10%', factor: 0.90 },
      { label: '-5%',  factor: 0.95 },
      { label: 'Current', factor: 1.00 },
      { label: '+5%',  factor: 1.05 },
      { label: '+10%', factor: 1.10 }
    ];

    var scenarioRows = '';
    for (var i = 0; i < scenarios.length; i++) {
      var s = scenarios[i];
      var sRent = Math.round(monthlyRent * s.factor);
      var sAnnual = sRent * 12;
      var sGross = propertyValue > 0 ? (sAnnual / propertyValue) * 100 : 0;
      var sNet = propertyValue > 0 ? ((sAnnual - annualExpenses) / propertyValue) * 100 : 0;
      var active = s.factor === 1.0 ? ' font-bold bg-amber-50' : '';
      scenarioRows +=
        '<tr class="border-b' + active + '">' +
          '<td class="py-1.5 text-sm text-gray-600">' + E(s.label) + '</td>' +
          '<td class="py-1.5 text-sm text-right font-medium">' + $(sRent) + '/mo</td>' +
          '<td class="py-1.5 text-sm text-right font-medium">' + $(sAnnual) + '</td>' +
          '<td class="py-1.5 text-sm text-right font-medium ' + _colorClass(sGross) + '">' + sGross.toFixed(2) + '%</td>' +
          '<td class="py-1.5 text-sm text-right font-medium ' + _colorClass(sNet) + '">' + sNet.toFixed(2) + '%</td>' +
        '</tr>';
    }

    resultsEl.innerHTML =
      '<div class="border rounded-lg p-4 ' + colorBgCls + '">' +
        '<div class="text-center mb-4">' +
          '<div class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Net Rental Yield</div>' +
          '<div class="text-4xl font-bold ' + colorCls + '">' + netYield.toFixed(2) + '%</div>' +
          '<div class="text-sm font-medium ' + colorCls + '">' + E(label) + '</div>' +
          '<div class="text-sm text-gray-500 mt-1">Gross Yield: <span class="font-bold">' + grossYield.toFixed(2) + '%</span></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">' +
          '<div class="bg-white rounded p-3 text-center border">' +
            '<div class="text-xs text-gray-500">Annual Gross</div>' +
            '<div class="text-lg font-bold text-green-700">' + $(annualGross) + '</div>' +
          '</div>' +
          '<div class="bg-white rounded p-3 text-center border">' +
            '<div class="text-xs text-gray-500">Annual Net</div>' +
            '<div class="text-lg font-bold ' + (annualNet >= 0 ? 'text-green-700' : 'text-red-700') + '">' + $(annualNet) + '</div>' +
          '</div>' +
          '<div class="bg-white rounded p-3 text-center border">' +
            '<div class="text-xs text-gray-500">Monthly Net</div>' +
            '<div class="text-lg font-bold ' + (annualNet >= 0 ? 'text-green-700' : 'text-red-700') + '">' + $(annualNet / 12) + '</div>' +
          '</div>' +
          '<div class="bg-white rounded p-3 text-center border">' +
            '<div class="text-xs text-gray-500">Expense Ratio</div>' +
            '<div class="text-lg font-bold text-gray-700">' + expenseRatio.toFixed(1) + '%</div>' +
          '</div>' +
        '</div>' +
        '<div class="bg-white rounded p-3 border mb-3">' +
          '<div class="text-xs font-semibold text-gray-700 mb-2">Income Breakdown</div>' +
          '<table class="w-full text-sm">' +
            '<tr class="border-b"><td class="py-1 text-gray-600">Monthly Rent</td><td class="py-1 text-right font-medium">' + $(monthlyRent) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600">Annual Gross Income (x12)</td><td class="py-1 text-right font-medium text-green-700">+' + $(annualGross) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600">Annual Expenses</td><td class="py-1 text-right font-medium text-red-700">-' + $(annualExpenses) + '</td></tr>' +
            '<tr><td class="py-1 font-semibold text-gray-800">Annual Net Income</td><td class="py-1 text-right font-bold ' + (annualNet >= 0 ? 'text-green-700' : 'text-red-700') + '">' + $(annualNet) + '</td></tr>' +
          '</table>' +
        '</div>' +

        '<!-- Scenario Comparison -->' +
        '<div class="bg-white rounded p-3 border mb-3">' +
          '<div class="text-xs font-semibold text-gray-700 mb-2">Rent Scenario Comparison</div>' +
          '<div class="overflow-x-auto">' +
          '<table class="w-full">' +
            '<tr class="border-b">' +
              '<th class="py-1 text-xs text-gray-500 text-left">Scenario</th>' +
              '<th class="py-1 text-xs text-gray-500 text-right">Rent</th>' +
              '<th class="py-1 text-xs text-gray-500 text-right">Annual</th>' +
              '<th class="py-1 text-xs text-gray-500 text-right">Gross Yield</th>' +
              '<th class="py-1 text-xs text-gray-500 text-right">Net Yield</th>' +
            '</tr>' +
            scenarioRows +
          '</table>' +
          '</div>' +
        '</div>' +

        '<div class="p-2 bg-gray-50 rounded text-xs text-gray-500 border">' +
          '<strong>Gross Yield:</strong> (Monthly Rent &times; 12) / Property Value &times; 100 = (' + $(monthlyRent) + ' &times; 12) / ' + $(propertyValue) + ' = <strong>' + grossYield.toFixed(2) + '%</strong><br>' +
          '<strong>Net Yield:</strong> ((Monthly Rent &times; 12) - Expenses) / Property Value &times; 100 = (' + $(annualGross) + ' - ' + $(annualExpenses) + ') / ' + $(propertyValue) + ' = <strong>' + netYield.toFixed(2) + '%</strong>' +
        '</div>' +
      '</div>';
  }

  function _printResults() {
    var resultsEl = document.getElementById(_formId + '-results');
    if (!resultsEl || !resultsEl.innerHTML.trim()) {
      CRM.toast('Calculate results first', 'warning');
      return;
    }
    var w = window.open('', '_blank', 'width=700,height=900');
    w.document.write(
      '<html><head><title>Rental Yield Analysis</title>' +
      '<style>body{font-family:system-ui,sans-serif;padding:2rem;color:#333}' +
      'table{width:100%;border-collapse:collapse}td,th{padding:4px 8px}' +
      '.text-green-700,.text-green-600{color:#15803d}.text-red-700,.text-red-600{color:#b91c1c}' +
      '.text-yellow-600{color:#ca8a04}.text-gray-500,.text-gray-600,.text-gray-700{color:#6b7280}' +
      '.font-bold{font-weight:700}.font-semibold{font-weight:600}.font-medium{font-weight:500}' +
      '.text-4xl{font-size:2.25rem}.text-center{text-align:center}.text-right{text-align:right}' +
      '.text-left{text-align:left}.text-xs{font-size:0.75rem}.text-sm{font-size:0.875rem}.text-lg{font-size:1.125rem}' +
      '.border-b{border-bottom:1px solid #e5e7eb}.py-1{padding-top:4px;padding-bottom:4px}' +
      '.mb-4{margin-bottom:1rem}.mb-3{margin-bottom:0.75rem}.mb-2{margin-bottom:0.5rem}.mt-1{margin-top:0.25rem}' +
      '.p-3{padding:0.75rem}.p-4{padding:1rem}.p-2{padding:0.5rem}' +
      '.rounded{border-radius:0.25rem}.rounded-lg{border-radius:0.5rem}' +
      '.border{border:1px solid #e5e7eb}.grid{display:grid}.grid-cols-2{grid-template-columns:repeat(2,1fr)}.grid-cols-4{grid-template-columns:repeat(4,1fr)}.gap-3{gap:0.75rem}' +
      '.bg-white{background:#fff}.bg-green-50{background:#f0fdf4}.bg-yellow-50{background:#fefce8}.bg-red-50{background:#fef2f2}' +
      '.bg-gray-50{background:#f9fafb}.bg-amber-50{background:#fffbeb}' +
      '.border-green-200{border-color:#bbf7d0}.border-yellow-200{border-color:#fef08a}.border-red-200{border-color:#fecaca}' +
      '.uppercase{text-transform:uppercase}.tracking-wide{letter-spacing:0.05em}' +
      '@media print{body{padding:0.5rem}}</style></head><body>' +
      '<h2 style="margin-bottom:0.5rem">Rental Yield Analysis</h2>' +
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

    return (
      '<div class="space-y-4" id="' + _formId + '">' +
        '<div class="flex items-center justify-between mb-2">' +
          '<h3 class="text-base font-bold text-gray-800"><i class="fas fa-hand-holding-usd mr-2 text-amber-600"></i>Rental Yield Calculator</h3>' +
          '<div class="flex gap-2">' +
            '<button onclick="RentalYieldCalc.calculate()" class="px-3 py-1 bg-amber-600 text-white text-xs font-semibold rounded hover:bg-amber-700">Calculate</button>' +
            '<button onclick="RentalYieldCalc.print()" class="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs" title="Print"><i class="fas fa-print"></i></button>' +
            '<button onclick="RentalYieldCalc.copy()" class="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs" title="Copy"><i class="fas fa-copy"></i></button>' +
          '</div>' +
        '</div>' +

        '<div class="bg-white border rounded-lg p-4">' +
          '<div class="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">Property &amp; Rental Details</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Property Value</label>' +
              '<input id="' + _formId + '-property-value" type="number" value="' + E(opts.property_value || '') + '" placeholder="750000" oninput="RentalYieldCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Monthly Rent</label>' +
              '<input id="' + _formId + '-monthly-rent" type="number" value="' + E(opts.monthly_rent || '') + '" placeholder="3500" oninput="RentalYieldCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Annual Expenses</label>' +
              '<input id="' + _formId + '-annual-expenses" type="number" value="' + E(opts.annual_expenses || '') + '" placeholder="12000" oninput="RentalYieldCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
              '<div class="text-xs text-gray-400 mt-1">Taxes, insurance, maintenance, management, etc.</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

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
