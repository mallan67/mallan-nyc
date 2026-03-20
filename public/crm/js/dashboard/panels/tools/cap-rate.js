// ═══════════════════════════════════════════════════════════════════════════════
// CAP RATE CALCULATOR
// Calculates capitalization rate for investment properties
// ═══════════════════════════════════════════════════════════════════════════════
/* global Utils, CRM */

var CapRateCalc = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;

  var _formId = 'cap-calc-' + Date.now();

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
    if (pct >= 6) return 'Strong Cap Rate';
    if (pct >= 4) return 'Moderate Cap Rate';
    return 'Below Target';
  }

  function calculate() {
    var purchasePrice = _val(_formId + '-purchase-price');
    var grossRent = _val(_formId + '-gross-rent');
    var vacancyRate = _val(_formId + '-vacancy-rate') / 100;
    var opExpenses = _val(_formId + '-op-expenses');

    var effectiveGross = grossRent * (1 - vacancyRate);
    var noi = effectiveGross - opExpenses;
    var capRate = purchasePrice > 0 ? (noi / purchasePrice) * 100 : 0;

    var resultsEl = document.getElementById(_formId + '-results');
    if (!resultsEl) return;

    var colorCls = _colorClass(capRate);
    var colorBgCls = _colorBg(capRate);
    var label = _colorLabel(capRate);

    // Scenario table: different purchase prices
    var scenarios = [0.9, 0.95, 1.0, 1.05, 1.1];
    var scenarioRows = '';
    for (var i = 0; i < scenarios.length; i++) {
      var sp = Math.round(purchasePrice * scenarios[i]);
      var sr = sp > 0 ? (noi / sp) * 100 : 0;
      var active = scenarios[i] === 1.0 ? ' font-bold bg-amber-50' : '';
      var sColorCls = _colorClass(sr);
      scenarioRows +=
        '<tr class="border-b' + active + '">' +
          '<td class="py-1 text-gray-600 text-sm">' + $(sp) + (scenarios[i] === 1.0 ? ' (current)' : '') + '</td>' +
          '<td class="py-1 text-right text-sm ' + sColorCls + ' font-medium">' + sr.toFixed(2) + '%</td>' +
        '</tr>';
    }

    resultsEl.innerHTML =
      '<div class="border rounded-lg p-4 ' + colorBgCls + '">' +
        '<div class="text-center mb-4">' +
          '<div class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Capitalization Rate</div>' +
          '<div class="text-4xl font-bold ' + colorCls + '">' + capRate.toFixed(2) + '%</div>' +
          '<div class="text-sm font-medium ' + colorCls + '">' + E(label) + '</div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3 mb-4">' +
          '<div class="bg-white rounded p-3 text-center border">' +
            '<div class="text-xs text-gray-500">Net Operating Income</div>' +
            '<div class="text-lg font-bold ' + (noi >= 0 ? 'text-green-700' : 'text-red-700') + '">' + $(noi) + '</div>' +
          '</div>' +
          '<div class="bg-white rounded p-3 text-center border">' +
            '<div class="text-xs text-gray-500">Effective Gross Income</div>' +
            '<div class="text-lg font-bold text-blue-700">' + $(effectiveGross) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="bg-white rounded p-3 border mb-3">' +
          '<div class="text-xs font-semibold text-gray-700 mb-2">Income Breakdown</div>' +
          '<table class="w-full text-sm">' +
            '<tr class="border-b"><td class="py-1 text-gray-600">Gross Rental Income</td><td class="py-1 text-right font-medium text-green-700">+' + $(grossRent) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600">Vacancy Loss (' + (vacancyRate * 100).toFixed(1) + '%)</td><td class="py-1 text-right font-medium text-red-700">-' + $(grossRent * vacancyRate) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600">Effective Gross Income</td><td class="py-1 text-right font-medium">' + $(effectiveGross) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600">Operating Expenses</td><td class="py-1 text-right font-medium text-red-700">-' + $(opExpenses) + '</td></tr>' +
            '<tr><td class="py-1 font-semibold text-gray-800">Net Operating Income</td><td class="py-1 text-right font-bold ' + (noi >= 0 ? 'text-green-700' : 'text-red-700') + '">' + $(noi) + '</td></tr>' +
          '</table>' +
        '</div>' +
        '<div class="bg-white rounded p-3 border mb-3">' +
          '<div class="text-xs font-semibold text-gray-700 mb-2">Cap Rate at Different Prices</div>' +
          '<table class="w-full">' +
            '<tr class="border-b"><th class="py-1 text-xs text-gray-500 text-left">Purchase Price</th><th class="py-1 text-xs text-gray-500 text-right">Cap Rate</th></tr>' +
            scenarioRows +
          '</table>' +
        '</div>' +
        '<div class="p-2 bg-gray-50 rounded text-xs text-gray-500 border">' +
          '<strong>Formula:</strong> (Gross Income &times; (1 - Vacancy%) - Operating Expenses) / Purchase Price &times; 100<br>' +
          '(' + $(grossRent) + ' &times; ' + (1 - vacancyRate).toFixed(3) + ' - ' + $(opExpenses) + ') / ' + $(purchasePrice) + ' = <strong>' + capRate.toFixed(2) + '%</strong>' +
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
      '<html><head><title>Cap Rate Analysis</title>' +
      '<style>body{font-family:system-ui,sans-serif;padding:2rem;color:#333}' +
      'table{width:100%;border-collapse:collapse}td,th{padding:4px 8px}' +
      '.text-green-700,.text-green-600{color:#15803d}.text-red-700,.text-red-600{color:#b91c1c}' +
      '.text-yellow-600{color:#ca8a04}.text-blue-700{color:#1d4ed8}.text-gray-500,.text-gray-600{color:#6b7280}' +
      '.font-bold{font-weight:700}.font-semibold{font-weight:600}.font-medium{font-weight:500}' +
      '.text-4xl{font-size:2.25rem}.text-center{text-align:center}.text-right{text-align:right}' +
      '.text-left{text-align:left}.text-xs{font-size:0.75rem}.text-sm{font-size:0.875rem}.text-lg{font-size:1.125rem}' +
      '.border-b{border-bottom:1px solid #e5e7eb}.py-1{padding-top:4px;padding-bottom:4px}' +
      '.mb-4{margin-bottom:1rem}.mb-3{margin-bottom:0.75rem}.mb-2{margin-bottom:0.5rem}' +
      '.p-3{padding:0.75rem}.p-4{padding:1rem}.p-2{padding:0.5rem}' +
      '.rounded{border-radius:0.25rem}.rounded-lg{border-radius:0.5rem}' +
      '.border{border:1px solid #e5e7eb}.grid{display:grid}.grid-cols-2{grid-template-columns:repeat(2,1fr)}.gap-3{gap:0.75rem}' +
      '.bg-white{background:#fff}.bg-green-50{background:#f0fdf4}.bg-yellow-50{background:#fefce8}.bg-red-50{background:#fef2f2}' +
      '.bg-gray-50{background:#f9fafb}.bg-amber-50{background:#fffbeb}' +
      '.border-green-200{border-color:#bbf7d0}.border-yellow-200{border-color:#fef08a}.border-red-200{border-color:#fecaca}' +
      '.uppercase{text-transform:uppercase}.tracking-wide{letter-spacing:0.05em}' +
      '@media print{body{padding:0.5rem}}</style></head><body>' +
      '<h2 style="margin-bottom:0.5rem">Cap Rate Analysis</h2>' +
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
    var gr = opts.gross_rental_income || '';
    var vr = opts.vacancy_rate || '5';
    var oe = opts.operating_expenses || '';

    return (
      '<div class="space-y-4" id="' + _formId + '">' +
        '<div class="flex items-center justify-between mb-2">' +
          '<h3 class="text-base font-bold text-gray-800"><i class="fas fa-chart-pie mr-2 text-amber-600"></i>Cap Rate Calculator</h3>' +
          '<div class="flex gap-2">' +
            '<button onclick="CapRateCalc.calculate()" class="px-3 py-1 bg-amber-600 text-white text-xs font-semibold rounded hover:bg-amber-700">Calculate</button>' +
            '<button onclick="CapRateCalc.print()" class="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs" title="Print"><i class="fas fa-print"></i></button>' +
            '<button onclick="CapRateCalc.copy()" class="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs" title="Copy"><i class="fas fa-copy"></i></button>' +
          '</div>' +
        '</div>' +

        '<div class="bg-white border rounded-lg p-4">' +
          '<div class="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">Property &amp; Income</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Purchase Price</label>' +
              '<input id="' + _formId + '-purchase-price" type="number" value="' + E(pp) + '" placeholder="750000" oninput="CapRateCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Gross Annual Rental Income</label>' +
              '<input id="' + _formId + '-gross-rent" type="number" value="' + E(gr) + '" placeholder="60000" oninput="CapRateCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Vacancy Rate (%)</label>' +
              '<input id="' + _formId + '-vacancy-rate" type="number" value="' + E(vr) + '" placeholder="5" step="0.5" min="0" max="100" oninput="CapRateCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Annual Operating Expenses</label>' +
              '<input id="' + _formId + '-op-expenses" type="number" value="' + E(oe) + '" placeholder="18000" oninput="CapRateCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
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
