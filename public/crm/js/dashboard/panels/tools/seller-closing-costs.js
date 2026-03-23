// ═══════════════════════════════════════════════════════════════════════════════
// SELLER CLOSING COSTS CALCULATOR
// NYC-specific: RPTT, NYS Transfer Tax, Mansion Tax (if negotiated),
// Commission, Attorney, Flip Tax, Payoffs, Misc
// ═══════════════════════════════════════════════════════════════════════════════
/* global Utils */

var SellerClosingCalc = (function () {
  'use strict';

  var $ = Utils.formatMoney;

  function _val(id) {
    var el = document.getElementById(id);
    return el ? parseFloat(el.value.replace(/[,$]/g, '')) || 0 : 0;
  }
  function _checked(id) {
    var el = document.getElementById(id);
    return el ? el.checked : false;
  }

  // NYC RPTT (Real Property Transfer Tax) — SELLER pays
  function _rptt(price) {
    if (price <= 0) return 0;
    return price < 500000 ? price * 0.01 : price * 0.01425;
  }

  // NYS Transfer Tax — SELLER pays ($2 per $500 = 0.4%, or 0.65% for $3M+)
  function _nysTransfer(price) {
    return price < 3000000 ? price * 0.004 : price * 0.0065;
  }

  // NYC Mansion Tax — BUYER typically pays, but can be negotiated to seller
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

  function render(opts) {
    opts = opts || {};
    var inp = 'class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none text-right" oninput="SellerClosingCalc.compute()"';
    var lbl = 'class="text-xs font-semibold text-gray-700 block mb-1"';

    var h = '';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-4"><i class="fas fa-receipt text-purple-600 mr-2"></i>Seller Closing Costs</h3>';
    h += '<p class="text-xs text-gray-500 mb-4">Full breakdown of seller-side closing costs for NYC transactions.</p>';

    h += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">';
    h += '<div><label ' + lbl + '>Sale Price ($)</label><input id="scc-price" type="text" ' + inp + ' value="' + (opts.sale_price || '') + '"></div>';
    h += '<div><label ' + lbl + '>Commission Rate (%)</label><input id="scc-commission" type="text" ' + inp + ' value="' + (opts.commission || '5') + '"></div>';
    h += '<div><label ' + lbl + '>Attorney Fee ($)</label><input id="scc-attorney" type="text" ' + inp + ' value="' + (opts.attorney || '3000') + '"></div>';
    h += '<div><label ' + lbl + '>Flip Tax / Transfer Fee ($)</label><input id="scc-flip" type="text" ' + inp + ' value="' + (opts.flip_tax || '0') + '"></div>';
    h += '<div><label ' + lbl + '>Title / Recording Fees ($)</label><input id="scc-title" type="text" ' + inp + ' value="' + (opts.title || '1500') + '"></div>';
    h += '<div><label ' + lbl + '>Managing Agent Fee ($)</label><input id="scc-mgmt" type="text" ' + inp + ' value="' + (opts.mgmt || '0') + '"></div>';
    h += '<div><label ' + lbl + '>Move-out Deposit ($)</label><input id="scc-moveout" type="text" ' + inp + ' value="0"></div>';
    h += '<div><label ' + lbl + '>Payoff Fees (bank) ($)</label><input id="scc-payoff" type="text" ' + inp + ' value="' + (opts.payoff || '500') + '"></div>';
    h += '</div>';

    // Mansion tax toggle (usually buyer pays, but negotiable)
    h += '<div class="flex items-center gap-2 mb-4">';
    h += '<input type="checkbox" id="scc-mansion" onchange="SellerClosingCalc.compute()">';
    h += '<label class="text-xs text-gray-700">Seller pays Mansion Tax (usually buyer\'s responsibility — check negotiation)</label>';
    h += '</div>';

    // Property type toggle for co-op vs condo differences
    h += '<div class="flex items-center gap-3 mb-4">';
    h += '<label class="text-xs font-semibold text-gray-700">Property Type:</label>';
    h += '<select id="scc-proptype" class="text-xs px-2 py-1.5 border border-gray-200 rounded-lg" onchange="SellerClosingCalc.compute()">';
    h += '<option value="condo">Condo / Townhouse</option>';
    h += '<option value="coop">Co-op / Condop</option>';
    h += '</select>';
    h += '</div>';

    h += '<div id="scc-results" class="bg-gray-50 border border-gray-200 rounded-xl p-4">';
    h += '<div class="text-xs text-gray-400 italic">Enter sale price to see closing cost breakdown.</div>';
    h += '</div>';

    return h;
  }

  function compute() {
    var price = _val('scc-price');
    var commPct = _val('scc-commission') / 100;
    var attorney = _val('scc-attorney');
    var flip = _val('scc-flip');
    var title = _val('scc-title');
    var mgmt = _val('scc-mgmt');
    var moveout = _val('scc-moveout');
    var payoff = _val('scc-payoff');
    var paysMansion = _checked('scc-mansion');
    var propType = (document.getElementById('scc-proptype') || {}).value || 'condo';

    if (price <= 0) return;

    var commission = price * commPct;
    var rptt = _rptt(price);
    var nysTransfer = _nysTransfer(price);
    var mansion = paysMansion ? _mansionTax(price) : 0;

    // Co-ops: flip tax common (1-3% of sale price), no title insurance on co-op shares
    // Condos: title insurance, recording fees
    var titleActual = propType === 'coop' ? 0 : title;
    var flipActual = flip;

    var items = [
      { label: 'Broker Commission (' + (commPct * 100).toFixed(1) + '%)', val: commission, clr: '#B8860B' },
      { label: 'NYC Transfer Tax (RPTT)', val: rptt, clr: '#3B82F6' },
      { label: 'NYS Transfer Tax', val: nysTransfer, clr: '#6366F1' },
    ];
    if (mansion > 0) items.push({ label: 'Mansion Tax (seller-paid)', val: mansion, clr: '#EF4444' });
    items.push({ label: 'Attorney Fee', val: attorney, clr: '#059669' });
    if (flipActual > 0) items.push({ label: propType === 'coop' ? 'Flip Tax (co-op)' : 'Transfer Fee', val: flipActual, clr: '#F59E0B' });
    if (titleActual > 0) items.push({ label: 'Title / Recording', val: titleActual, clr: '#8B5CF6' });
    if (mgmt > 0) items.push({ label: 'Managing Agent Fee', val: mgmt, clr: '#EC4899' });
    if (moveout > 0) items.push({ label: 'Move-out Deposit', val: moveout, clr: '#9CA3AF' });
    if (payoff > 0) items.push({ label: 'Payoff / Bank Fees', val: payoff, clr: '#78716C' });

    var total = items.reduce(function (sum, i) { return sum + i.val; }, 0);
    var pctOfPrice = price > 0 ? (total / price) * 100 : 0;

    var el = document.getElementById('scc-results');
    if (!el) return;

    var h = '<div class="grid grid-cols-2 gap-4 mb-4">';
    h += '<div class="text-center"><div class="text-[10px] text-gray-500 uppercase tracking-wider">Total Closing Costs</div>' +
      '<div class="text-xl font-bold text-purple-700">' + $(Math.round(total)) + '</div></div>';
    h += '<div class="text-center"><div class="text-[10px] text-gray-500 uppercase tracking-wider">% of Sale Price</div>' +
      '<div class="text-xl font-bold text-gray-900">' + pctOfPrice.toFixed(2) + '%</div></div>';
    h += '</div>';

    h += '<table class="w-full text-xs border-t border-gray-200">';
    items.forEach(function (item) {
      var pct = price > 0 ? ((item.val / price) * 100).toFixed(2) : '0';
      h += '<tr class="border-b border-gray-50">';
      h += '<td class="py-1.5 text-gray-600"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + item.clr + ';margin-right:5px;"></span>' + item.label + '</td>';
      h += '<td class="py-1.5 text-right font-semibold">' + $(Math.round(item.val)) + '</td>';
      h += '<td class="py-1.5 text-right text-gray-400 pl-2">' + pct + '%</td>';
      h += '</tr>';
    });
    h += '<tr class="border-t-2 border-gray-300"><td class="py-2 font-bold text-gray-900">Total Seller Closing Costs</td>';
    h += '<td class="py-2 text-right font-bold text-purple-700">' + $(Math.round(total)) + '</td>';
    h += '<td class="py-2 text-right font-bold text-gray-700">' + pctOfPrice.toFixed(2) + '%</td></tr>';
    h += '</table>';

    // Net after closing costs (not including mortgage payoff)
    var netBeforeMortgage = price - total;
    h += '<div class="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">';
    h += '<b>Net before mortgage payoff:</b> ' + $(Math.round(netBeforeMortgage));
    h += '<div class="text-[10px] text-blue-600 mt-1">For full net proceeds including mortgage payoff, use the Net Proceeds calculator.</div>';
    h += '</div>';

    el.innerHTML = h;
  }

  return { render: render, compute: compute };
})();
