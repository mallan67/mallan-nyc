// ═══════════════════════════════════════════════════════════════════════════════
// SELLER BREAK-EVEN PRICE CALCULATOR
// Minimum sale price to cover mortgage payoff + closing costs + moving
// ═══════════════════════════════════════════════════════════════════════════════
/* global Utils */

var BreakevenCalc = (function () {
  'use strict';

  var $ = Utils.formatMoney;

  function _val(id) {
    var el = document.getElementById(id);
    return el ? parseFloat(el.value.replace(/[,$]/g, '')) || 0 : 0;
  }

  function _getNYCTransferTax(price) {
    return price < 500000 ? price * 0.01 : price * 0.01425;
  }

  function _getNYSTransferTax(price) {
    return price < 3000000 ? price * 0.004 : price * 0.0065;
  }

  function render(opts) {
    opts = opts || {};
    var inp = 'class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none text-right" oninput="BreakevenCalc.compute()"';
    var lbl = 'class="text-xs font-semibold text-gray-700 block mb-1"';

    var h = '';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-4"><i class="fas fa-bullseye text-red-500 mr-2"></i>Break-Even Price Calculator</h3>';
    h += '<p class="text-xs text-gray-500 mb-4">Minimum sale price to walk away with $0 (cover all costs). Useful for sellers who need to know their floor.</p>';

    h += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">';
    h += '<div><label ' + lbl + '>Mortgage Balance ($)</label><input id="be-mortgage" type="text" ' + inp + ' value="' + (opts.mortgage || '') + '"></div>';
    h += '<div><label ' + lbl + '>Commission Rate (%)</label><input id="be-commission" type="text" ' + inp + ' value="' + (opts.commission || '5') + '"></div>';
    h += '<div><label ' + lbl + '>Attorney Fee ($)</label><input id="be-attorney" type="text" ' + inp + ' value="' + (opts.attorney || '3000') + '"></div>';
    h += '<div><label ' + lbl + '>Flip Tax / Transfer Fee ($)</label><input id="be-flip-tax" type="text" ' + inp + ' value="' + (opts.flip_tax || '0') + '"></div>';
    h += '<div><label ' + lbl + '>Moving / Staging ($)</label><input id="be-moving" type="text" ' + inp + ' value="' + (opts.moving || '5000') + '"></div>';
    h += '<div><label ' + lbl + '>Repairs / Prep ($)</label><input id="be-repairs" type="text" ' + inp + ' value="0"></div>';
    h += '</div>';

    h += '<div id="be-results" class="bg-gray-50 border border-gray-200 rounded-xl p-4">';
    h += '<div class="text-xs text-gray-400 italic">Enter mortgage balance to calculate break-even.</div>';
    h += '</div>';

    return h;
  }

  function compute() {
    var mortgage = _val('be-mortgage');
    var commissionPct = _val('be-commission') / 100;
    var attorney = _val('be-attorney');
    var flipTax = _val('be-flip-tax');
    var moving = _val('be-moving');
    var repairs = _val('be-repairs');

    // Break-even formula:
    // Price = Mortgage + FixedCosts + Commission + TransferTaxes
    // Price = M + F + P*C + P*TransferRate
    // P - P*C - P*T = M + F
    // P * (1 - C - T) = M + F
    // P = (M + F) / (1 - C - T)

    // NYC transfer tax rate: ~1.425% for >500k, NYS: 0.4%
    var transferRate = 0.01425 + 0.004; // ~1.825% total transfer taxes

    var fixedCosts = attorney + flipTax + moving + repairs;
    var denominator = 1 - commissionPct - transferRate;

    if (denominator <= 0) {
      var el = document.getElementById('be-results');
      if (el) el.innerHTML = '<div class="text-red-500 text-xs">Commission + transfer tax rates exceed 100%.</div>';
      return;
    }

    var breakeven = (mortgage + fixedCosts) / denominator;
    breakeven = Math.ceil(breakeven / 1000) * 1000; // Round up to nearest $1K

    var commission = breakeven * commissionPct;
    var nycTransfer = _getNYCTransferTax(breakeven);
    var nysTransfer = _getNYSTransferTax(breakeven);
    var totalCosts = commission + nycTransfer + nysTransfer + attorney + flipTax + moving + repairs;
    var netProceeds = breakeven - totalCosts - mortgage;

    var el = document.getElementById('be-results');
    if (!el) return;

    var h = '<div class="text-center mb-4">';
    h += '<div class="text-[10px] text-gray-500 uppercase tracking-wider">Minimum Sale Price (Break-Even)</div>';
    h += '<div class="text-2xl font-bold text-red-600">' + $(breakeven) + '</div>';
    h += '<div class="text-xs text-gray-400">Rounded up to nearest $1,000</div>';
    h += '</div>';

    h += '<div class="border-t border-gray-200 pt-3">';
    h += '<div class="text-xs font-bold text-gray-700 mb-2">Cost Breakdown at Break-Even Price</div>';
    h += '<table class="w-full text-xs">';
    h += '<tr><td class="py-1 text-gray-600">Mortgage Payoff</td><td class="py-1 text-right font-semibold">' + $(mortgage) + '</td></tr>';
    h += '<tr><td class="py-1 text-gray-600">Commission (' + (commissionPct * 100).toFixed(1) + '%)</td><td class="py-1 text-right font-semibold">' + $(Math.round(commission)) + '</td></tr>';
    h += '<tr><td class="py-1 text-gray-600">NYC Transfer Tax (RPTT)</td><td class="py-1 text-right font-semibold">' + $(Math.round(nycTransfer)) + '</td></tr>';
    h += '<tr><td class="py-1 text-gray-600">NYS Transfer Tax</td><td class="py-1 text-right font-semibold">' + $(Math.round(nysTransfer)) + '</td></tr>';
    h += '<tr><td class="py-1 text-gray-600">Attorney</td><td class="py-1 text-right font-semibold">' + $(attorney) + '</td></tr>';
    if (flipTax > 0) h += '<tr><td class="py-1 text-gray-600">Flip Tax / Transfer Fee</td><td class="py-1 text-right font-semibold">' + $(flipTax) + '</td></tr>';
    if (moving > 0) h += '<tr><td class="py-1 text-gray-600">Moving / Staging</td><td class="py-1 text-right font-semibold">' + $(moving) + '</td></tr>';
    if (repairs > 0) h += '<tr><td class="py-1 text-gray-600">Repairs / Prep</td><td class="py-1 text-right font-semibold">' + $(repairs) + '</td></tr>';
    h += '<tr class="border-t border-gray-300"><td class="py-1 font-bold text-gray-900">Net to Seller</td><td class="py-1 text-right font-bold text-gray-900">' + $(Math.round(netProceeds)) + '</td></tr>';
    h += '</table></div>';

    el.innerHTML = h;
  }

  return { render: render, compute: compute };
})();
