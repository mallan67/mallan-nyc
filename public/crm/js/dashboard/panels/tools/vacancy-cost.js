// ═══════════════════════════════════════════════════════════════════════════════
// VACANCY COST CALCULATOR
// Calculates total cost of vacancy for landlords with scenario comparison
// ═══════════════════════════════════════════════════════════════════════════════
/* global Utils, CRM */

var VacancyCostCalc = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;

  var _formId = 'vc-calc-' + Date.now();

  function _val(id) {
    var el = document.getElementById(id);
    return el ? parseFloat(el.value) || 0 : 0;
  }

  function calculate() {
    var monthlyRent = _val(_formId + '-monthly-rent');
    var vacancyMonths = _val(_formId + '-vacancy-months');
    var mortgagePerMonth = _val(_formId + '-mortgage');
    var taxesPerMonth = _val(_formId + '-taxes');
    var insurancePerMonth = _val(_formId + '-insurance');
    var maintenancePerMonth = _val(_formId + '-maintenance');
    var marketingCosts = _val(_formId + '-marketing');
    var cleaningCosts = _val(_formId + '-cleaning');
    var paintingCosts = _val(_formId + '-painting');
    var repairCosts = _val(_formId + '-repairs');

    // Use date range if provided
    var startDate = document.getElementById(_formId + '-start-date');
    var endDate = document.getElementById(_formId + '-end-date');
    if (startDate && endDate && startDate.value && endDate.value) {
      var s = new Date(startDate.value + 'T00:00:00');
      var e = new Date(endDate.value + 'T00:00:00');
      if (e > s) {
        var diffMs = e.getTime() - s.getTime();
        vacancyMonths = diffMs / (30.44 * 86400000); // Average days per month
        vacancyMonths = Math.round(vacancyMonths * 10) / 10;
        var vmEl = document.getElementById(_formId + '-vacancy-months');
        if (vmEl) vmEl.value = vacancyMonths;
      }
    }

    var carryingPerMonth = mortgagePerMonth + taxesPerMonth + insurancePerMonth + maintenancePerMonth;
    var lostRent = monthlyRent * vacancyMonths;
    var totalCarrying = carryingPerMonth * vacancyMonths;
    var turnoverCosts = cleaningCosts + paintingCosts + repairCosts;
    var totalVacancyCost = lostRent + totalCarrying + marketingCosts + turnoverCosts;

    // Break-even rent reduction: how much could they reduce rent to avoid vacancy?
    // If they reduce rent by X/month and lease immediately, they save the vacancy cost
    // Break-even: X * 12 = totalVacancyCost (annualized)
    // X = totalVacancyCost / 12
    var breakEvenReduction = vacancyMonths > 0 ? totalVacancyCost / 12 : 0;
    var breakEvenRent = monthlyRent - breakEvenReduction;
    var breakEvenPct = monthlyRent > 0 ? (breakEvenReduction / monthlyRent) * 100 : 0;

    var resultsEl = document.getElementById(_formId + '-results');
    if (!resultsEl) return;

    // Scenario comparison
    var scenarioMonths = [1, 2, 3];
    var scenarioRows = '';
    for (var i = 0; i < scenarioMonths.length; i++) {
      var m = scenarioMonths[i];
      var sLostRent = monthlyRent * m;
      var sCarrying = carryingPerMonth * m;
      var sTotal = sLostRent + sCarrying + marketingCosts + turnoverCosts;
      var sBreakEven = sTotal / 12;
      var active = m === Math.round(vacancyMonths) ? ' font-bold bg-amber-50' : '';
      scenarioRows +=
        '<tr class="border-b' + active + '">' +
          '<td class="py-1.5 text-sm text-gray-600">' + m + ' month' + (m !== 1 ? 's' : '') + (m === Math.round(vacancyMonths) ? ' (current)' : '') + '</td>' +
          '<td class="py-1.5 text-sm text-right font-medium text-red-700">' + $(sLostRent) + '</td>' +
          '<td class="py-1.5 text-sm text-right font-medium text-red-700">' + $(sCarrying) + '</td>' +
          '<td class="py-1.5 text-sm text-right font-bold text-red-700">' + $(sTotal) + '</td>' +
          '<td class="py-1.5 text-sm text-right font-medium text-gray-600">' + $(sBreakEven) + '/mo</td>' +
        '</tr>';
    }

    resultsEl.innerHTML =
      '<div class="border rounded-lg p-4 bg-red-50 border-red-200">' +
        '<div class="text-center mb-4">' +
          '<div class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Vacancy Cost</div>' +
          '<div class="text-4xl font-bold text-red-600">' + $(totalVacancyCost) + '</div>' +
          '<div class="text-sm font-medium text-red-500">' + vacancyMonths + ' month' + (vacancyMonths !== 1 ? 's' : '') + ' of vacancy</div>' +
        '</div>' +

        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">' +
          '<div class="bg-white rounded p-3 text-center border">' +
            '<div class="text-xs text-gray-500">Lost Rent</div>' +
            '<div class="text-lg font-bold text-red-700">' + $(lostRent) + '</div>' +
          '</div>' +
          '<div class="bg-white rounded p-3 text-center border">' +
            '<div class="text-xs text-gray-500">Carrying Costs</div>' +
            '<div class="text-lg font-bold text-red-700">' + $(totalCarrying) + '</div>' +
          '</div>' +
          '<div class="bg-white rounded p-3 text-center border">' +
            '<div class="text-xs text-gray-500">Marketing</div>' +
            '<div class="text-lg font-bold text-orange-600">' + $(marketingCosts) + '</div>' +
          '</div>' +
          '<div class="bg-white rounded p-3 text-center border">' +
            '<div class="text-xs text-gray-500">Turnover</div>' +
            '<div class="text-lg font-bold text-orange-600">' + $(turnoverCosts) + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="bg-white rounded p-3 border mb-3">' +
          '<div class="text-xs font-semibold text-gray-700 mb-2">Cost Breakdown</div>' +
          '<table class="w-full text-sm">' +
            '<tr class="border-b bg-gray-50"><td colspan="2" class="py-1 text-xs font-bold text-gray-500 uppercase">Lost Rental Income</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600 pl-3">' + $(monthlyRent) + '/mo &times; ' + vacancyMonths + ' months</td><td class="py-1 text-right font-medium text-red-700">' + $(lostRent) + '</td></tr>' +
            '<tr class="border-b bg-gray-50"><td colspan="2" class="py-1 text-xs font-bold text-gray-500 uppercase">Carrying Costs (' + $(carryingPerMonth) + '/mo)</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600 pl-3">Mortgage</td><td class="py-1 text-right font-medium text-red-700">' + $(mortgagePerMonth * vacancyMonths) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600 pl-3">Property Taxes</td><td class="py-1 text-right font-medium text-red-700">' + $(taxesPerMonth * vacancyMonths) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600 pl-3">Insurance</td><td class="py-1 text-right font-medium text-red-700">' + $(insurancePerMonth * vacancyMonths) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600 pl-3">Maintenance</td><td class="py-1 text-right font-medium text-red-700">' + $(maintenancePerMonth * vacancyMonths) + '</td></tr>' +
            '<tr class="border-b bg-gray-50"><td colspan="2" class="py-1 text-xs font-bold text-gray-500 uppercase">One-Time Costs</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600 pl-3">Marketing / Listing</td><td class="py-1 text-right font-medium text-orange-600">' + $(marketingCosts) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600 pl-3">Cleaning</td><td class="py-1 text-right font-medium text-orange-600">' + $(cleaningCosts) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600 pl-3">Painting</td><td class="py-1 text-right font-medium text-orange-600">' + $(paintingCosts) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600 pl-3">Repairs</td><td class="py-1 text-right font-medium text-orange-600">' + $(repairCosts) + '</td></tr>' +
            '<tr><td class="py-2 font-bold text-gray-800">Total Vacancy Cost</td><td class="py-2 text-right font-bold text-lg text-red-700">' + $(totalVacancyCost) + '</td></tr>' +
          '</table>' +
        '</div>' +

        '<!-- Break-even Analysis -->' +
        '<div class="bg-white rounded p-3 border mb-3 border-amber-200 bg-amber-50">' +
          '<div class="text-xs font-semibold text-amber-800 mb-2"><i class="fas fa-lightbulb mr-1"></i>Break-Even Rent Reduction</div>' +
          '<div class="text-sm text-amber-700">Instead of ' + vacancyMonths + ' month' + (vacancyMonths !== 1 ? 's' : '') + ' vacant, reducing rent by <strong>' + $(breakEvenReduction) + '/mo</strong> (' + breakEvenPct.toFixed(1) + '%) and leasing immediately would cost the same over 12 months.</div>' +
          '<div class="text-sm text-amber-700 mt-1">Break-even rent: <strong>' + $(breakEvenRent) + '/mo</strong> vs. current <strong>' + $(monthlyRent) + '/mo</strong></div>' +
        '</div>' +

        '<!-- Scenario Comparison -->' +
        '<div class="bg-white rounded p-3 border mb-3">' +
          '<div class="text-xs font-semibold text-gray-700 mb-2">Vacancy Duration Comparison</div>' +
          '<div class="overflow-x-auto">' +
          '<table class="w-full">' +
            '<tr class="border-b">' +
              '<th class="py-1 text-xs text-gray-500 text-left">Duration</th>' +
              '<th class="py-1 text-xs text-gray-500 text-right">Lost Rent</th>' +
              '<th class="py-1 text-xs text-gray-500 text-right">Carrying</th>' +
              '<th class="py-1 text-xs text-gray-500 text-right">Total Cost</th>' +
              '<th class="py-1 text-xs text-gray-500 text-right">Break-Even</th>' +
            '</tr>' +
            scenarioRows +
          '</table>' +
          '</div>' +
        '</div>' +

        '<div class="p-2 bg-gray-50 rounded text-xs text-gray-500 border">' +
          '<strong>Formula:</strong> (Rent &times; Months) + (Carrying Costs &times; Months) + Marketing + Turnover<br>' +
          '(' + $(monthlyRent) + ' &times; ' + vacancyMonths + ') + (' + $(carryingPerMonth) + ' &times; ' + vacancyMonths + ') + ' + $(marketingCosts) + ' + ' + $(turnoverCosts) + ' = <strong>' + $(totalVacancyCost) + '</strong><br>' +
          '<strong>Break-even reduction:</strong> Total Cost / 12 = ' + $(totalVacancyCost) + ' / 12 = <strong>' + $(breakEvenReduction) + '/mo</strong>' +
        '</div>' +
      '</div>';
  }

  function _printResults() {
    var resultsEl = document.getElementById(_formId + '-results');
    if (!resultsEl || !resultsEl.innerHTML.trim()) {
      CRM.toast('Calculate results first', 'warning');
      return;
    }
    var w = window.open('', '_blank', 'width=700,height=1000');
    w.document.write(
      '<html><head><title>Vacancy Cost Analysis</title>' +
      '<style>body{font-family:system-ui,sans-serif;padding:2rem;color:#333}' +
      'table{width:100%;border-collapse:collapse}td,th{padding:4px 8px}' +
      '.text-green-700{color:#15803d}.text-red-600,.text-red-700{color:#b91c1c}' +
      '.text-red-500{color:#ef4444}.text-orange-600{color:#ea580c}' +
      '.text-amber-700,.text-amber-800{color:#92400e}.text-gray-500,.text-gray-600,.text-gray-700,.text-gray-800{color:#6b7280}' +
      '.font-bold{font-weight:700}.font-semibold{font-weight:600}.font-medium{font-weight:500}' +
      '.text-4xl{font-size:2.25rem}.text-lg{font-size:1.125rem}.text-center{text-align:center}.text-right{text-align:right}' +
      '.text-left{text-align:left}.text-xs{font-size:0.75rem}.text-sm{font-size:0.875rem}' +
      '.border-b{border-bottom:1px solid #e5e7eb}' +
      '.mb-4{margin-bottom:1rem}.mb-3{margin-bottom:0.75rem}.mb-2{margin-bottom:0.5rem}.mt-1{margin-top:0.25rem}.mr-1{margin-right:0.25rem}' +
      '.p-2{padding:0.5rem}.p-3{padding:0.75rem}.p-4{padding:1rem}.pl-3{padding-left:0.75rem}' +
      '.py-1{padding-top:4px;padding-bottom:4px}.py-1\\.5{padding-top:6px;padding-bottom:6px}.py-2{padding-top:0.5rem;padding-bottom:0.5rem}' +
      '.rounded{border-radius:0.25rem}.rounded-lg{border-radius:0.5rem}' +
      '.border{border:1px solid #e5e7eb}.grid{display:grid}.grid-cols-2{grid-template-columns:repeat(2,1fr)}.grid-cols-4{grid-template-columns:repeat(4,1fr)}.gap-3{gap:0.75rem}' +
      '.bg-white{background:#fff}.bg-red-50{background:#fef2f2}.bg-amber-50{background:#fffbeb}' +
      '.bg-gray-50{background:#f9fafb}' +
      '.border-red-200{border-color:#fecaca}.border-amber-200{border-color:#fde68a}' +
      '.uppercase{text-transform:uppercase}.tracking-wide{letter-spacing:0.05em}' +
      '.overflow-x-auto{overflow-x:auto}' +
      '@media print{body{padding:0.5rem}}</style></head><body>' +
      '<h2 style="margin-bottom:0.5rem">Vacancy Cost Analysis</h2>' +
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
          '<h3 class="text-base font-bold text-gray-800"><i class="fas fa-calendar-times mr-2 text-amber-600"></i>Vacancy Cost Calculator</h3>' +
          '<div class="flex gap-2">' +
            '<button onclick="VacancyCostCalc.calculate()" class="px-3 py-1 bg-amber-600 text-white text-xs font-semibold rounded hover:bg-amber-700">Calculate</button>' +
            '<button onclick="VacancyCostCalc.print()" class="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs" title="Print"><i class="fas fa-print"></i></button>' +
            '<button onclick="VacancyCostCalc.copy()" class="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs" title="Copy"><i class="fas fa-copy"></i></button>' +
          '</div>' +
        '</div>' +

        '<div class="bg-white border rounded-lg p-4">' +
          '<div class="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">Rental &amp; Vacancy Period</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Monthly Rent</label>' +
              '<input id="' + _formId + '-monthly-rent" type="number" value="' + E(opts.monthly_rent || '') + '" placeholder="3500" oninput="VacancyCostCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Vacancy (months)</label>' +
              '<input id="' + _formId + '-vacancy-months" type="number" value="' + E(opts.vacancy_months || '2') + '" placeholder="2" step="0.5" min="0" oninput="VacancyCostCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div class="text-xs text-gray-500 self-end pb-2">or use dates below</div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Vacancy Start Date (optional)</label>' +
              '<input id="' + _formId + '-start-date" type="date" value="' + E(opts.start_date || '') + '" onchange="VacancyCostCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Vacancy End Date (optional)</label>' +
              '<input id="' + _formId + '-end-date" type="date" value="' + E(opts.end_date || '') + '" onchange="VacancyCostCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="bg-white border rounded-lg p-4">' +
          '<div class="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">Monthly Carrying Costs</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Mortgage/mo</label>' +
              '<input id="' + _formId + '-mortgage" type="number" value="' + E(opts.mortgage || '') + '" placeholder="2800" oninput="VacancyCostCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Taxes/mo</label>' +
              '<input id="' + _formId + '-taxes" type="number" value="' + E(opts.taxes || '') + '" placeholder="500" oninput="VacancyCostCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Insurance/mo</label>' +
              '<input id="' + _formId + '-insurance" type="number" value="' + E(opts.insurance || '') + '" placeholder="200" oninput="VacancyCostCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Maintenance/mo</label>' +
              '<input id="' + _formId + '-maintenance" type="number" value="' + E(opts.maintenance || '') + '" placeholder="150" oninput="VacancyCostCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="bg-white border rounded-lg p-4">' +
          '<div class="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">Turnover &amp; Marketing</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Marketing / Listing</label>' +
              '<input id="' + _formId + '-marketing" type="number" value="' + E(opts.marketing_costs || '') + '" placeholder="500" oninput="VacancyCostCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Cleaning</label>' +
              '<input id="' + _formId + '-cleaning" type="number" value="' + E(opts.cleaning || '') + '" placeholder="300" oninput="VacancyCostCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Painting</label>' +
              '<input id="' + _formId + '-painting" type="number" value="' + E(opts.painting || '') + '" placeholder="800" oninput="VacancyCostCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Repairs</label>' +
              '<input id="' + _formId + '-repairs" type="number" value="' + E(opts.repairs || '') + '" placeholder="500" oninput="VacancyCostCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
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
