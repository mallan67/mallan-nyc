// ═══════════════════════════════════════════════════════════════════════════════
// SELLER EQUITY CALCULATOR
// Current market value minus outstanding mortgage = estimated equity
// ═══════════════════════════════════════════════════════════════════════════════
/* global Utils */

var EquityCalc = (function () {
  'use strict';

  var $ = Utils.formatMoney;

  function _val(id) {
    var el = document.getElementById(id);
    return el ? parseFloat(el.value.replace(/[,$]/g, '')) || 0 : 0;
  }

  function render(opts) {
    opts = opts || {};
    var inp = 'class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none text-right" oninput="EquityCalc.compute()"';
    var lbl = 'class="text-xs font-semibold text-gray-700 block mb-1"';

    var h = '';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-4"><i class="fas fa-chart-pie text-emerald-600 mr-2"></i>Equity Calculator</h3>';
    h += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">';
    h += '<div><label ' + lbl + '>Estimated Market Value ($)</label><input id="eq-market-value" type="text" ' + inp + ' value="' + (opts.market_value || '') + '"></div>';
    h += '<div><label ' + lbl + '>Outstanding Mortgage ($)</label><input id="eq-mortgage" type="text" ' + inp + ' value="' + (opts.mortgage || '') + '"></div>';
    h += '<div><label ' + lbl + '>Other Liens / Judgments ($)</label><input id="eq-liens" type="text" ' + inp + ' value="0"></div>';
    h += '<div><label ' + lbl + '>Original Purchase Price ($)</label><input id="eq-purchase" type="text" ' + inp + ' value="' + (opts.purchase_price || '') + '"></div>';
    h += '</div>';

    // Results
    h += '<div id="eq-results" class="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">';
    h += '<div class="text-xs text-gray-400 italic">Enter values above to see equity breakdown.</div>';
    h += '</div>';

    return h;
  }

  function compute() {
    var market = _val('eq-market-value');
    var mortgage = _val('eq-mortgage');
    var liens = _val('eq-liens');
    var purchase = _val('eq-purchase');

    var equity = market - mortgage - liens;
    var equityPct = market > 0 ? (equity / market) * 100 : 0;
    var appreciation = purchase > 0 ? market - purchase : 0;
    var appreciationPct = purchase > 0 ? ((market - purchase) / purchase) * 100 : 0;
    var ltv = market > 0 ? (mortgage / market) * 100 : 0;

    var el = document.getElementById('eq-results');
    if (!el) return;

    var clr = equity >= 0 ? '#059669' : '#EF4444';
    var h = '<div class="grid grid-cols-2 md:grid-cols-3 gap-4">';
    h += '<div class="text-center"><div class="text-[10px] text-gray-500 uppercase tracking-wider">Estimated Equity</div>' +
      '<div class="text-lg font-bold" style="color:' + clr + ';">' + $(equity) + '</div></div>';
    h += '<div class="text-center"><div class="text-[10px] text-gray-500 uppercase tracking-wider">Equity %</div>' +
      '<div class="text-lg font-bold text-gray-900">' + equityPct.toFixed(1) + '%</div></div>';
    h += '<div class="text-center"><div class="text-[10px] text-gray-500 uppercase tracking-wider">LTV</div>' +
      '<div class="text-lg font-bold text-gray-900">' + ltv.toFixed(1) + '%</div></div>';
    h += '</div>';

    if (purchase > 0) {
      h += '<div class="border-t border-gray-200 pt-3 mt-3 grid grid-cols-2 gap-4">';
      h += '<div class="text-center"><div class="text-[10px] text-gray-500 uppercase tracking-wider">Appreciation ($)</div>' +
        '<div class="text-sm font-bold" style="color:' + (appreciation >= 0 ? '#059669' : '#EF4444') + ';">' + $(appreciation) + '</div></div>';
      h += '<div class="text-center"><div class="text-[10px] text-gray-500 uppercase tracking-wider">Appreciation (%)</div>' +
        '<div class="text-sm font-bold text-gray-900">' + appreciationPct.toFixed(1) + '%</div></div>';
      h += '</div>';
    }

    // Equity bar visualization
    if (market > 0) {
      var eqBar = Math.max(0, Math.min(100, equityPct));
      var mtgBar = Math.max(0, Math.min(100, ltv));
      h += '<div class="mt-3"><div class="text-[10px] text-gray-500 mb-1">Equity vs Debt</div>';
      h += '<div class="h-4 rounded-full overflow-hidden bg-red-100 flex">';
      h += '<div style="width:' + eqBar + '%;background:#059669;" class="h-full"></div>';
      h += '<div style="width:' + mtgBar + '%;background:#EF4444;" class="h-full"></div>';
      h += '</div>';
      h += '<div class="flex justify-between text-[10px] mt-1"><span class="text-emerald-600 font-semibold">Equity ' + eqBar.toFixed(0) + '%</span><span class="text-red-500 font-semibold">Debt ' + mtgBar.toFixed(0) + '%</span></div>';
      h += '</div>';
    }

    el.innerHTML = h;
  }

  return { render: render, compute: compute };
})();
