// ═══════════════════════════════════════════════════════════════════════════════
// ROI (RETURN ON INVESTMENT) CALCULATOR
// Calculates total and annualized ROI for real estate investments
// ═══════════════════════════════════════════════════════════════════════════════
/* global Utils, CRM */

var ROICalc = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;

  var _formId = 'roi-calc-' + Date.now();

  function _val(id) {
    var el = document.getElementById(id);
    return el ? parseFloat(el.value) || 0 : 0;
  }

  function _colorClass(pct) {
    if (pct >= 20) return 'text-green-600';
    if (pct >= 10) return 'text-yellow-600';
    return 'text-red-600';
  }

  function _colorBg(pct) {
    if (pct >= 20) return 'bg-green-50 border-green-200';
    if (pct >= 10) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  }

  function _colorLabel(pct) {
    if (pct >= 20) return 'Strong ROI';
    if (pct >= 10) return 'Moderate ROI';
    return 'Below Target';
  }

  function calculate() {
    var purchasePrice = _val(_formId + '-purchase-price');
    var currentValue = _val(_formId + '-current-value');
    var totalRentalIncome = _val(_formId + '-total-rental');
    var totalExpenses = _val(_formId + '-total-expenses');
    var remainingMortgage = _val(_formId + '-remaining-mortgage');
    var downPayment = _val(_formId + '-down-payment');
    var closingCosts = _val(_formId + '-closing-costs');
    var holdingPeriod = _val(_formId + '-holding-period');

    var totalCashInvested = downPayment + closingCosts;
    var appreciation = currentValue - purchasePrice;
    var netRentalIncome = totalRentalIncome - totalExpenses;
    var totalProfit = appreciation + netRentalIncome;
    var equity = currentValue - remainingMortgage;
    var totalROI = totalCashInvested > 0 ? (totalProfit / totalCashInvested) * 100 : 0;

    // Annualized ROI using CAGR formula: ((1 + ROI)^(1/years) - 1) * 100
    var annualizedROI = 0;
    if (holdingPeriod > 0 && totalCashInvested > 0) {
      var endValue = totalCashInvested + totalProfit;
      if (endValue > 0) {
        annualizedROI = (Math.pow(endValue / totalCashInvested, 1 / holdingPeriod) - 1) * 100;
      }
    }

    var resultsEl = document.getElementById(_formId + '-results');
    if (!resultsEl) return;

    var colorCls = _colorClass(totalROI);
    var colorBgCls = _colorBg(totalROI);
    var label = _colorLabel(totalROI);

    // Timeline visualization
    var timelineHtml = '';
    if (holdingPeriod > 0) {
      var years = Math.min(Math.ceil(holdingPeriod), 30);
      var annualAppreciation = appreciation / holdingPeriod;
      var annualNetIncome = netRentalIncome / holdingPeriod;
      var timelineRows = '';
      for (var y = 1; y <= years; y++) {
        var cumAppreciation = annualAppreciation * y;
        var cumIncome = annualNetIncome * y;
        var cumProfit = cumAppreciation + cumIncome;
        var cumROI = totalCashInvested > 0 ? (cumProfit / totalCashInvested) * 100 : 0;
        var barWidth = Math.min(Math.abs(cumROI) / Math.max(Math.abs(totalROI), 1) * 100, 100);
        var barColor = cumROI >= 0 ? 'bg-green-400' : 'bg-red-400';
        timelineRows +=
          '<tr class="border-b">' +
            '<td class="py-1 text-xs text-gray-600">Year ' + y + '</td>' +
            '<td class="py-1 text-xs text-right font-medium">' + $(cumProfit) + '</td>' +
            '<td class="py-1 text-xs text-right font-medium ' + _colorClass(cumROI) + '">' + cumROI.toFixed(1) + '%</td>' +
            '<td class="py-1 pl-2 w-24"><div class="bg-gray-200 rounded-full h-2"><div class="' + barColor + ' rounded-full h-2" style="width:' + barWidth + '%"></div></div></td>' +
          '</tr>';
      }
      timelineHtml =
        '<div class="bg-white rounded p-3 border mb-3">' +
          '<div class="text-xs font-semibold text-gray-700 mb-2">ROI Timeline (' + holdingPeriod + ' year' + (holdingPeriod !== 1 ? 's' : '') + ')</div>' +
          '<div class="max-h-48 overflow-y-auto">' +
          '<table class="w-full">' +
            '<tr class="border-b"><th class="py-1 text-xs text-gray-500 text-left">Period</th><th class="py-1 text-xs text-gray-500 text-right">Cum. Profit</th><th class="py-1 text-xs text-gray-500 text-right">ROI</th><th class="py-1 text-xs text-gray-500 text-left pl-2">Progress</th></tr>' +
            timelineRows +
          '</table>' +
          '</div>' +
        '</div>';
    }

    resultsEl.innerHTML =
      '<div class="border rounded-lg p-4 ' + colorBgCls + '">' +
        '<div class="text-center mb-4">' +
          '<div class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Return on Investment</div>' +
          '<div class="text-4xl font-bold ' + colorCls + '">' + totalROI.toFixed(2) + '%</div>' +
          '<div class="text-sm font-medium ' + colorCls + '">' + E(label) + '</div>' +
          (holdingPeriod > 0 ? '<div class="text-sm text-gray-500 mt-1">Annualized: <span class="font-bold ' + _colorClass(annualizedROI) + '">' + annualizedROI.toFixed(2) + '%</span> over ' + holdingPeriod + ' year' + (holdingPeriod !== 1 ? 's' : '') + '</div>' : '') +
        '</div>' +
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">' +
          '<div class="bg-white rounded p-3 text-center border">' +
            '<div class="text-xs text-gray-500">Total Profit</div>' +
            '<div class="text-lg font-bold ' + (totalProfit >= 0 ? 'text-green-700' : 'text-red-700') + '">' + $(totalProfit) + '</div>' +
          '</div>' +
          '<div class="bg-white rounded p-3 text-center border">' +
            '<div class="text-xs text-gray-500">Equity Built</div>' +
            '<div class="text-lg font-bold text-blue-700">' + $(equity) + '</div>' +
          '</div>' +
          '<div class="bg-white rounded p-3 text-center border">' +
            '<div class="text-xs text-gray-500">Appreciation</div>' +
            '<div class="text-lg font-bold ' + (appreciation >= 0 ? 'text-green-700' : 'text-red-700') + '">' + $(appreciation) + '</div>' +
          '</div>' +
          '<div class="bg-white rounded p-3 text-center border">' +
            '<div class="text-xs text-gray-500">Net Rental Income</div>' +
            '<div class="text-lg font-bold ' + (netRentalIncome >= 0 ? 'text-green-700' : 'text-red-700') + '">' + $(netRentalIncome) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="bg-white rounded p-3 border mb-3">' +
          '<div class="text-xs font-semibold text-gray-700 mb-2">ROI Breakdown</div>' +
          '<table class="w-full text-sm">' +
            '<tr class="border-b"><td class="py-1 text-gray-600">Purchase Price</td><td class="py-1 text-right font-medium">' + $(purchasePrice) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600">Current / Estimated Value</td><td class="py-1 text-right font-medium">' + $(currentValue) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600">Appreciation</td><td class="py-1 text-right font-medium ' + (appreciation >= 0 ? 'text-green-700' : 'text-red-700') + '">' + (appreciation >= 0 ? '+' : '') + $(appreciation) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600">Total Rental Income Received</td><td class="py-1 text-right font-medium text-green-700">+' + $(totalRentalIncome) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600">Total Expenses Paid</td><td class="py-1 text-right font-medium text-red-700">-' + $(totalExpenses) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600">Total Cash Invested</td><td class="py-1 text-right font-medium">' + $(totalCashInvested) + '</td></tr>' +
            '<tr class="border-b"><td class="py-1 text-gray-600">Remaining Mortgage</td><td class="py-1 text-right font-medium text-gray-500">' + $(remainingMortgage) + '</td></tr>' +
            '<tr><td class="py-1 font-semibold text-gray-800">Total Profit</td><td class="py-1 text-right font-bold ' + (totalProfit >= 0 ? 'text-green-700' : 'text-red-700') + '">' + $(totalProfit) + '</td></tr>' +
          '</table>' +
        '</div>' +
        timelineHtml +
        '<div class="p-2 bg-gray-50 rounded text-xs text-gray-500 border">' +
          '<strong>Formula:</strong> (Current Value - Purchase Price + Total Rental Income - Total Expenses) / Total Cash Invested &times; 100<br>' +
          '(' + $(currentValue) + ' - ' + $(purchasePrice) + ' + ' + $(totalRentalIncome) + ' - ' + $(totalExpenses) + ') / ' + $(totalCashInvested) + ' = <strong>' + totalROI.toFixed(2) + '%</strong>' +
          (holdingPeriod > 0 ? '<br><strong>Annualized (CAGR):</strong> ((Final Value / Initial Investment)^(1/' + holdingPeriod + ') - 1) &times; 100 = <strong>' + annualizedROI.toFixed(2) + '%</strong>' : '') +
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
      '<html><head><title>ROI Analysis</title>' +
      '<style>body{font-family:system-ui,sans-serif;padding:2rem;color:#333}' +
      'table{width:100%;border-collapse:collapse}td,th{padding:4px 8px}' +
      '.text-green-700,.text-green-600{color:#15803d}.text-red-700,.text-red-600{color:#b91c1c}' +
      '.text-yellow-600{color:#ca8a04}.text-blue-700{color:#1d4ed8}.text-gray-500,.text-gray-600{color:#6b7280}' +
      '.font-bold{font-weight:700}.font-semibold{font-weight:600}.font-medium{font-weight:500}' +
      '.text-4xl{font-size:2.25rem}.text-center{text-align:center}.text-right{text-align:right}' +
      '.text-left{text-align:left}.text-xs{font-size:0.75rem}.text-sm{font-size:0.875rem}.text-lg{font-size:1.125rem}' +
      '.border-b{border-bottom:1px solid #e5e7eb}.py-1{padding-top:4px;padding-bottom:4px}' +
      '.mb-4{margin-bottom:1rem}.mb-3{margin-bottom:0.75rem}.mb-2{margin-bottom:0.5rem}.mt-1{margin-top:0.25rem}' +
      '.p-3{padding:0.75rem}.p-4{padding:1rem}.p-2{padding:0.5rem}.pl-2{padding-left:0.5rem}' +
      '.rounded{border-radius:0.25rem}.rounded-lg{border-radius:0.5rem}.rounded-full{border-radius:9999px}' +
      '.border{border:1px solid #e5e7eb}.grid{display:grid}.grid-cols-2{grid-template-columns:repeat(2,1fr)}.grid-cols-4{grid-template-columns:repeat(4,1fr)}.gap-3{gap:0.75rem}' +
      '.bg-white{background:#fff}.bg-green-50{background:#f0fdf4}.bg-yellow-50{background:#fefce8}.bg-red-50{background:#fef2f2}' +
      '.bg-gray-50{background:#f9fafb}.bg-gray-200{background:#e5e7eb}.bg-green-400{background:#4ade80}.bg-red-400{background:#f87171}' +
      '.border-green-200{border-color:#bbf7d0}.border-yellow-200{border-color:#fef08a}.border-red-200{border-color:#fecaca}' +
      '.uppercase{text-transform:uppercase}.tracking-wide{letter-spacing:0.05em}' +
      '.w-24{width:6rem}.h-2{height:0.5rem}.max-h-48{max-height:12rem}.overflow-y-auto{overflow-y:auto}' +
      '@media print{body{padding:0.5rem}.max-h-48{max-height:none}}</style></head><body>' +
      '<h2 style="margin-bottom:0.5rem">Return on Investment Analysis</h2>' +
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
          '<h3 class="text-base font-bold text-gray-800"><i class="fas fa-chart-line mr-2 text-amber-600"></i>Return on Investment</h3>' +
          '<div class="flex gap-2">' +
            '<button onclick="ROICalc.calculate()" class="px-3 py-1 bg-amber-600 text-white text-xs font-semibold rounded hover:bg-amber-700">Calculate</button>' +
            '<button onclick="ROICalc.print()" class="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs" title="Print"><i class="fas fa-print"></i></button>' +
            '<button onclick="ROICalc.copy()" class="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs" title="Copy"><i class="fas fa-copy"></i></button>' +
          '</div>' +
        '</div>' +

        '<div class="bg-white border rounded-lg p-4">' +
          '<div class="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">Investment Details</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Purchase Price</label>' +
              '<input id="' + _formId + '-purchase-price" type="number" value="' + E(opts.purchase_price || '') + '" placeholder="750000" oninput="ROICalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Down Payment</label>' +
              '<input id="' + _formId + '-down-payment" type="number" value="' + E(opts.down_payment || '') + '" placeholder="150000" oninput="ROICalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Closing Costs</label>' +
              '<input id="' + _formId + '-closing-costs" type="number" value="' + E(opts.closing_costs || '') + '" placeholder="15000" oninput="ROICalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="bg-white border rounded-lg p-4">' +
          '<div class="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">Current Status</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Current / Estimated Value</label>' +
              '<input id="' + _formId + '-current-value" type="number" value="' + E(opts.current_value || '') + '" placeholder="850000" oninput="ROICalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Remaining Mortgage</label>' +
              '<input id="' + _formId + '-remaining-mortgage" type="number" value="' + E(opts.remaining_mortgage || '') + '" placeholder="500000" oninput="ROICalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Holding Period (years)</label>' +
              '<input id="' + _formId + '-holding-period" type="number" value="' + E(opts.holding_period || '') + '" placeholder="5" step="0.5" min="0" oninput="ROICalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="bg-white border rounded-lg p-4">' +
          '<div class="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">Cumulative Rental Performance</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Total Rental Income Received</label>' +
              '<input id="' + _formId + '-total-rental" type="number" value="' + E(opts.total_rental_income_received || '') + '" placeholder="180000" oninput="ROICalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Total Expenses Paid</label>' +
              '<input id="' + _formId + '-total-expenses" type="number" value="' + E(opts.total_expenses_paid || '') + '" placeholder="90000" oninput="ROICalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
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
