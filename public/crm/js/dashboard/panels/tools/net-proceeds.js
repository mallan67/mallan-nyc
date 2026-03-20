// ═══════════════════════════════════════════════════════════════════════════════
// SELLER NET PROCEEDS CALCULATOR
// NYC-specific: RPTT, NYS Transfer Tax, Mansion Tax tiers, flip tax
// ═══════════════════════════════════════════════════════════════════════════════
/* global Utils, CRM */

var NetProceedsCalc = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;

  var _formId = 'np-calc-' + Date.now();

  function _val(id) {
    var el = document.getElementById(id);
    return el ? parseFloat(el.value) || 0 : 0;
  }

  // NYC RPTT (Real Property Transfer Tax)
  function _calcRPTT(salePrice) {
    if (salePrice <= 0) return 0;
    if (salePrice < 500000) return salePrice * 0.01;
    return salePrice * 0.01425;
  }

  // NYS Transfer Tax: $2 per $500 = 0.4%
  function _calcNYSTransfer(salePrice) {
    return salePrice * 0.004;
  }

  // NYC Mansion Tax tiers (buyer typically pays, but included for seller awareness)
  // Seller pays transfer taxes; mansion tax is buyer's but some negotiations shift it
  function _calcMansionTax(salePrice) {
    if (salePrice < 1000000) return 0;
    if (salePrice < 2000000) return salePrice * 0.01;
    if (salePrice < 3000000) return salePrice * 0.0125;
    if (salePrice < 5000000) return salePrice * 0.015;
    if (salePrice < 10000000) return salePrice * 0.0225;
    if (salePrice < 15000000) return salePrice * 0.0325;
    if (salePrice < 20000000) return salePrice * 0.035;
    if (salePrice < 25000000) return salePrice * 0.0375;
    return salePrice * 0.0390;
  }

  function _mansionTaxTier(salePrice) {
    if (salePrice < 1000000) return 'N/A (under $1M)';
    if (salePrice < 2000000) return '1.00% ($1M-$2M)';
    if (salePrice < 3000000) return '1.25% ($2M-$3M)';
    if (salePrice < 5000000) return '1.50% ($3M-$5M)';
    if (salePrice < 10000000) return '2.25% ($5M-$10M)';
    if (salePrice < 15000000) return '3.25% ($10M-$15M)';
    if (salePrice < 20000000) return '3.50% ($15M-$20M)';
    if (salePrice < 25000000) return '3.75% ($20M-$25M)';
    return '3.90% ($25M+)';
  }

  function calculate() {
    var salePrice = _val(_formId + '-sale-price');
    var mortgageBalance = _val(_formId + '-mortgage');
    var commissionRate = _val(_formId + '-commission-rate') / 100;
    var attorneyFees = _val(_formId + '-attorney');
    var flipTax = _val(_formId + '-flip-tax');
    var miscCosts = _val(_formId + '-misc');
    var includeMansion = document.getElementById(_formId + '-include-mansion');
    var mansionIncluded = includeMansion ? includeMansion.checked : false;

    var commission = salePrice * commissionRate;
    var rptt = _calcRPTT(salePrice);
    var nysTransfer = _calcNYSTransfer(salePrice);
    var mansionTax = mansionIncluded ? _calcMansionTax(salePrice) : 0;
    var totalTransferTax = rptt + nysTransfer;
    var totalDeductions = mortgageBalance + commission + totalTransferTax + mansionTax + attorneyFees + flipTax + miscCosts;
    var netProceeds = salePrice - totalDeductions;
    var retainedPct = salePrice > 0 ? (netProceeds / salePrice) * 100 : 0;

    var resultsEl = document.getElementById(_formId + '-results');
    if (!resultsEl) return;

    var isUnderwater = netProceeds < 0;
    var mainBg = isUnderwater ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200';
    var mainColor = isUnderwater ? 'text-red-600' : 'text-green-600';

    resultsEl.innerHTML =
      (isUnderwater ?
        '<div class="border border-red-300 rounded-lg p-3 bg-red-50 mb-3">' +
          '<div class="flex items-center gap-2">' +
            '<i class="fas fa-exclamation-triangle text-red-600"></i>' +
            '<div>' +
              '<div class="text-sm font-bold text-red-700">Warning: Negative Net Proceeds</div>' +
              '<div class="text-xs text-red-600">The seller would need to bring ' + $(Math.abs(netProceeds)) + ' to closing at this sale price.</div>' +
            '</div>' +
          '</div>' +
        '</div>' : '') +

      '<div class="border rounded-lg p-4 ' + mainBg + '">' +
        '<div class="text-center mb-4">' +
          '<div class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Estimated Net Proceeds</div>' +
          '<div class="text-4xl font-bold ' + mainColor + '">' + $(netProceeds) + '</div>' +
          '<div class="text-sm font-medium text-gray-500">' + retainedPct.toFixed(1) + '% of sale price retained</div>' +
        '</div>' +

        '<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">' +
          '<div class="bg-white rounded p-3 text-center border">' +
            '<div class="text-xs text-gray-500">Sale Price</div>' +
            '<div class="text-lg font-bold text-gray-800">' + $(salePrice) + '</div>' +
          '</div>' +
          '<div class="bg-white rounded p-3 text-center border">' +
            '<div class="text-xs text-gray-500">Total Deductions</div>' +
            '<div class="text-lg font-bold text-red-700">' + $(totalDeductions) + '</div>' +
          '</div>' +
          '<div class="bg-white rounded p-3 text-center border">' +
            '<div class="text-xs text-gray-500">Net to Seller</div>' +
            '<div class="text-lg font-bold ' + mainColor + '">' + $(netProceeds) + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="bg-white rounded p-3 border mb-3">' +
          '<div class="text-xs font-semibold text-gray-700 mb-2">Deductions Breakdown</div>' +
          '<table class="w-full text-sm">' +
            '<tr class="border-b"><td class="py-1.5 text-gray-600">Sale Price</td><td class="py-1.5 text-right font-medium">' + $(salePrice) + '</td><td class="py-1.5 text-right text-xs text-gray-400 w-16">100%</td></tr>' +
            '<tr class="border-b bg-gray-50"><td colspan="3" class="py-1 text-xs font-bold text-gray-500 uppercase">Deductions</td></tr>' +
            '<tr class="border-b"><td class="py-1.5 text-gray-600 pl-3">Mortgage Payoff</td><td class="py-1.5 text-right font-medium text-red-700">-' + $(mortgageBalance) + '</td><td class="py-1.5 text-right text-xs text-gray-400">' + (salePrice > 0 ? (mortgageBalance / salePrice * 100).toFixed(1) : 0) + '%</td></tr>' +
            '<tr class="border-b"><td class="py-1.5 text-gray-600 pl-3">Broker Commission (' + (commissionRate * 100).toFixed(1) + '%)</td><td class="py-1.5 text-right font-medium text-red-700">-' + $(commission) + '</td><td class="py-1.5 text-right text-xs text-gray-400">' + (commissionRate * 100).toFixed(1) + '%</td></tr>' +
            '<tr class="border-b"><td class="py-1.5 text-gray-600 pl-3">NYC RPTT (' + (salePrice < 500000 ? '1.0%' : '1.425%') + ')</td><td class="py-1.5 text-right font-medium text-red-700">-' + $(rptt) + '</td><td class="py-1.5 text-right text-xs text-gray-400">' + (salePrice > 0 ? (rptt / salePrice * 100).toFixed(2) : 0) + '%</td></tr>' +
            '<tr class="border-b"><td class="py-1.5 text-gray-600 pl-3">NYS Transfer Tax (0.4%)</td><td class="py-1.5 text-right font-medium text-red-700">-' + $(nysTransfer) + '</td><td class="py-1.5 text-right text-xs text-gray-400">0.40%</td></tr>' +
            (mansionIncluded ?
              '<tr class="border-b"><td class="py-1.5 text-gray-600 pl-3">Mansion Tax (' + _mansionTaxTier(salePrice) + ')</td><td class="py-1.5 text-right font-medium text-red-700">-' + $(mansionTax) + '</td><td class="py-1.5 text-right text-xs text-gray-400">' + (salePrice > 0 ? (mansionTax / salePrice * 100).toFixed(2) : 0) + '%</td></tr>' : '') +
            '<tr class="border-b"><td class="py-1.5 text-gray-600 pl-3">Attorney Fees</td><td class="py-1.5 text-right font-medium text-red-700">-' + $(attorneyFees) + '</td><td class="py-1.5 text-right text-xs text-gray-400">' + (salePrice > 0 ? (attorneyFees / salePrice * 100).toFixed(2) : 0) + '%</td></tr>' +
            (flipTax > 0 ?
              '<tr class="border-b"><td class="py-1.5 text-gray-600 pl-3">Flip Tax (Co-op)</td><td class="py-1.5 text-right font-medium text-red-700">-' + $(flipTax) + '</td><td class="py-1.5 text-right text-xs text-gray-400">' + (salePrice > 0 ? (flipTax / salePrice * 100).toFixed(2) : 0) + '%</td></tr>' : '') +
            (miscCosts > 0 ?
              '<tr class="border-b"><td class="py-1.5 text-gray-600 pl-3">Miscellaneous</td><td class="py-1.5 text-right font-medium text-red-700">-' + $(miscCosts) + '</td><td class="py-1.5 text-right text-xs text-gray-400">' + (salePrice > 0 ? (miscCosts / salePrice * 100).toFixed(2) : 0) + '%</td></tr>' : '') +
            '<tr class="border-b bg-gray-50"><td class="py-1.5 font-semibold text-gray-700 pl-3">Total Deductions</td><td class="py-1.5 text-right font-bold text-red-700">-' + $(totalDeductions) + '</td><td class="py-1.5 text-right text-xs font-bold text-gray-500">' + (salePrice > 0 ? (totalDeductions / salePrice * 100).toFixed(1) : 0) + '%</td></tr>' +
            '<tr><td class="py-2 font-bold text-gray-800">Net Proceeds</td><td class="py-2 text-right font-bold text-lg ' + mainColor + '">' + $(netProceeds) + '</td><td class="py-2 text-right text-xs font-bold ' + mainColor + '">' + retainedPct.toFixed(1) + '%</td></tr>' +
          '</table>' +
        '</div>' +

        '<!-- Visual bar -->' +
        '<div class="bg-white rounded p-3 border mb-3">' +
          '<div class="text-xs font-semibold text-gray-700 mb-2">Proceeds Distribution</div>' +
          '<div class="flex h-6 rounded-full overflow-hidden bg-gray-200">' +
            (salePrice > 0 ? (
              (mortgageBalance > 0 ? '<div class="bg-blue-500 h-full" style="width:' + (mortgageBalance / salePrice * 100) + '%" title="Mortgage"></div>' : '') +
              (commission > 0 ? '<div class="bg-orange-400 h-full" style="width:' + (commission / salePrice * 100) + '%" title="Commission"></div>' : '') +
              (totalTransferTax + mansionTax > 0 ? '<div class="bg-purple-400 h-full" style="width:' + ((totalTransferTax + mansionTax) / salePrice * 100) + '%" title="Taxes"></div>' : '') +
              (attorneyFees + flipTax + miscCosts > 0 ? '<div class="bg-gray-400 h-full" style="width:' + ((attorneyFees + flipTax + miscCosts) / salePrice * 100) + '%" title="Other"></div>' : '') +
              (netProceeds > 0 ? '<div class="bg-green-500 h-full" style="width:' + (netProceeds / salePrice * 100) + '%" title="Net Proceeds"></div>' : '')
            ) : '') +
          '</div>' +
          '<div class="flex flex-wrap gap-3 mt-2 text-xs">' +
            '<span><span class="inline-block w-3 h-3 rounded bg-blue-500 mr-1 align-middle"></span>Mortgage</span>' +
            '<span><span class="inline-block w-3 h-3 rounded bg-orange-400 mr-1 align-middle"></span>Commission</span>' +
            '<span><span class="inline-block w-3 h-3 rounded bg-purple-400 mr-1 align-middle"></span>Taxes</span>' +
            '<span><span class="inline-block w-3 h-3 rounded bg-gray-400 mr-1 align-middle"></span>Other</span>' +
            '<span><span class="inline-block w-3 h-3 rounded bg-green-500 mr-1 align-middle"></span>Net</span>' +
          '</div>' +
        '</div>' +

        '<div class="p-2 bg-gray-50 rounded text-xs text-gray-500 border">' +
          '<strong>Formula:</strong> Sale Price - Mortgage - Commission - NYC RPTT - NYS Transfer Tax' + (mansionIncluded ? ' - Mansion Tax' : '') + ' - Attorney - Flip Tax - Misc<br>' +
          $(salePrice) + ' - ' + $(totalDeductions) + ' = <strong>' + $(netProceeds) + '</strong><br>' +
          '<em>Note: NYC RPTT is 1% for sales under $500K, 1.425% for $500K+. NYS Transfer Tax is 0.4%. Mansion Tax (buyer) included only if negotiated to seller.</em>' +
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
      '<html><head><title>Seller Net Proceeds</title>' +
      '<style>body{font-family:system-ui,sans-serif;padding:2rem;color:#333}' +
      'table{width:100%;border-collapse:collapse}td{padding:5px 8px}' +
      '.text-green-600{color:#16a34a}.text-red-600,.text-red-700{color:#b91c1c}' +
      '.text-gray-500,.text-gray-600,.text-gray-700,.text-gray-800,.text-gray-400{color:#6b7280}' +
      '.font-bold{font-weight:700}.font-semibold{font-weight:600}.font-medium{font-weight:500}' +
      '.text-4xl{font-size:2.25rem}.text-lg{font-size:1.125rem}.text-center{text-align:center}.text-right{text-align:right}' +
      '.text-xs{font-size:0.75rem}.text-sm{font-size:0.875rem}' +
      '.border-b{border-bottom:1px solid #e5e7eb}' +
      '.mb-4{margin-bottom:1rem}.mb-3{margin-bottom:0.75rem}.mb-2{margin-bottom:0.5rem}' +
      '.p-2{padding:0.5rem}.p-3{padding:0.75rem}.p-4{padding:1rem}.pl-3{padding-left:0.75rem}' +
      '.py-1\\.5{padding-top:6px;padding-bottom:6px}.py-2{padding-top:0.5rem;padding-bottom:0.5rem}' +
      '.rounded{border-radius:0.25rem}.rounded-lg{border-radius:0.5rem}.rounded-full{border-radius:9999px}' +
      '.border{border:1px solid #e5e7eb}.grid{display:grid}.grid-cols-2{grid-template-columns:repeat(2,1fr)}.grid-cols-3{grid-template-columns:repeat(3,1fr)}.gap-3{gap:0.75rem}' +
      '.bg-white{background:#fff}.bg-green-50{background:#f0fdf4}.bg-red-50{background:#fef2f2}' +
      '.bg-gray-50{background:#f9fafb}' +
      '.border-green-200{border-color:#bbf7d0}.border-red-200{border-color:#fecaca}.border-red-300{border-color:#fca5a5}' +
      '.w-16{width:4rem}.uppercase{text-transform:uppercase}.tracking-wide{letter-spacing:0.05em}' +
      '.flex{display:flex}.items-center{align-items:center}.gap-2{gap:0.5rem}.gap-3{gap:0.75rem}' +
      '.flex-wrap{flex-wrap:wrap}.h-6{height:1.5rem}.h-3{height:0.75rem}.w-3{width:0.75rem}' +
      '.inline-block{display:inline-block}.align-middle{vertical-align:middle}.mr-1{margin-right:0.25rem}.mt-2{margin-top:0.5rem}' +
      '.overflow-hidden{overflow:hidden}' +
      '.bg-blue-500{background:#3b82f6}.bg-orange-400{background:#fb923c}.bg-purple-400{background:#c084fc}.bg-gray-400{background:#9ca3af}.bg-green-500{background:#22c55e}.bg-gray-200{background:#e5e7eb}' +
      '@media print{body{padding:0.5rem}}</style></head><body>' +
      '<h2 style="margin-bottom:0.5rem">Seller Net Proceeds Estimate</h2>' +
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
          '<h3 class="text-base font-bold text-gray-800"><i class="fas fa-file-invoice-dollar mr-2 text-amber-600"></i>Seller Net Proceeds</h3>' +
          '<div class="flex gap-2">' +
            '<button onclick="NetProceedsCalc.calculate()" class="px-3 py-1 bg-amber-600 text-white text-xs font-semibold rounded hover:bg-amber-700">Calculate</button>' +
            '<button onclick="NetProceedsCalc.print()" class="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs" title="Print"><i class="fas fa-print"></i></button>' +
            '<button onclick="NetProceedsCalc.copy()" class="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs" title="Copy"><i class="fas fa-copy"></i></button>' +
          '</div>' +
        '</div>' +

        '<div class="bg-white border rounded-lg p-4">' +
          '<div class="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">Sale Details</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Sale Price</label>' +
              '<input id="' + _formId + '-sale-price" type="number" value="' + E(opts.sale_price || '') + '" placeholder="1500000" oninput="NetProceedsCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Mortgage Balance</label>' +
              '<input id="' + _formId + '-mortgage" type="number" value="' + E(opts.mortgage_balance || '') + '" placeholder="600000" oninput="NetProceedsCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="bg-white border rounded-lg p-4">' +
          '<div class="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">Costs &amp; Fees</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Commission Rate (%)</label>' +
              '<input id="' + _formId + '-commission-rate" type="number" value="' + E(opts.broker_commission_rate || '6') + '" placeholder="6" step="0.1" min="0" max="10" oninput="NetProceedsCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Attorney Fees</label>' +
              '<input id="' + _formId + '-attorney" type="number" value="' + E(opts.attorney_fees || '') + '" placeholder="3000" oninput="NetProceedsCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Flip Tax (Co-op)</label>' +
              '<input id="' + _formId + '-flip-tax" type="number" value="' + E(opts.flip_tax || '') + '" placeholder="0" oninput="NetProceedsCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
              '<div class="text-xs text-gray-400 mt-1">Typically 1-3% of sale price for co-ops</div>' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Miscellaneous Costs</label>' +
              '<input id="' + _formId + '-misc" type="number" value="' + E(opts.miscellaneous_costs || '') + '" placeholder="0" oninput="NetProceedsCalc.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div class="flex items-center">' +
              '<label class="flex items-center gap-2 cursor-pointer">' +
                '<input id="' + _formId + '-include-mansion" type="checkbox" onchange="NetProceedsCalc.calculate()" class="rounded border-gray-300">' +
                '<span class="text-xs font-semibold text-gray-700">Include Mansion Tax (buyer cost, sometimes negotiated to seller)</span>' +
              '</label>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="bg-blue-50 border border-blue-200 rounded-lg p-3">' +
          '<div class="text-xs text-blue-700"><i class="fas fa-info-circle mr-1"></i><strong>NYC Transfer Taxes (auto-calculated):</strong> ' +
            'RPTT: 1% under $500K, 1.425% over $500K. NYS Transfer Tax: 0.4%. ' +
            'Mansion Tax (if included): tiered 1% - 3.9% for $1M+ sales.</div>' +
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
