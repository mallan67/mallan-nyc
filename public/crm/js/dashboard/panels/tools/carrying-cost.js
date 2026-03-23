// ═══════════════════════════════════════════════════════════════════════════════
// SELLER CARRYING COST CALCULATOR
// Monthly cost of holding the property while on market
// Mortgage + maintenance/common charges + property tax + insurance
// ═══════════════════════════════════════════════════════════════════════════════
/* global Utils */

var CarryingCostCalc = (function () {
  'use strict';

  var $ = Utils.formatMoney;

  function _val(id) {
    var el = document.getElementById(id);
    return el ? parseFloat(el.value.replace(/[,$]/g, '')) || 0 : 0;
  }

  function render(opts) {
    opts = opts || {};
    var inp = 'class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none text-right" oninput="CarryingCostCalc.compute()"';
    var lbl = 'class="text-xs font-semibold text-gray-700 block mb-1"';

    var h = '';
    h += '<h3 class="text-sm font-bold text-gray-900 mb-4"><i class="fas fa-hourglass-half text-orange-500 mr-2"></i>Carrying Cost Calculator</h3>';
    h += '<p class="text-xs text-gray-500 mb-4">Monthly cost of holding the property while it\'s on market. Helps the seller understand the real cost of waiting vs. accepting an offer.</p>';

    h += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">';
    h += '<div><label ' + lbl + '>Monthly Mortgage Payment ($)</label><input id="cc-mortgage" type="text" ' + inp + ' value="' + (opts.mortgage_payment || '') + '"></div>';
    h += '<div><label ' + lbl + '>Monthly Maintenance / Common Charges ($)</label><input id="cc-maintenance" type="text" ' + inp + ' value="' + (opts.maintenance || '') + '"></div>';
    h += '<div><label ' + lbl + '>Monthly Property Tax ($)</label><input id="cc-tax" type="text" ' + inp + ' value="' + (opts.monthly_tax || '') + '"></div>';
    h += '<div><label ' + lbl + '>Monthly Insurance ($)</label><input id="cc-insurance" type="text" ' + inp + ' value="' + (opts.insurance || '') + '"></div>';
    h += '<div><label ' + lbl + '>Monthly Utilities ($)</label><input id="cc-utilities" type="text" ' + inp + ' value="0"></div>';
    h += '<div><label ' + lbl + '>Monthly Storage / Other ($)</label><input id="cc-other" type="text" ' + inp + ' value="0"></div>';
    h += '</div>';

    h += '<div class="mb-4"><label ' + lbl + '>Estimated Months on Market</label>';
    h += '<input id="cc-months" type="range" min="1" max="24" value="' + (opts.months || 6) + '" class="w-full" oninput="document.getElementById(\'cc-months-val\').textContent=this.value; CarryingCostCalc.compute()">';
    h += '<div class="flex justify-between text-[10px] text-gray-400"><span>1 month</span><span id="cc-months-val">' + (opts.months || 6) + '</span><span>24 months</span></div></div>';

    h += '<div id="cc-results" class="bg-gray-50 border border-gray-200 rounded-xl p-4">';
    h += '<div class="text-xs text-gray-400 italic">Enter values above to see carrying cost breakdown.</div>';
    h += '</div>';

    return h;
  }

  function compute() {
    var mortgage = _val('cc-mortgage');
    var maint = _val('cc-maintenance');
    var tax = _val('cc-tax');
    var insurance = _val('cc-insurance');
    var utilities = _val('cc-utilities');
    var other = _val('cc-other');
    var months = _val('cc-months') || 6;

    var monthly = mortgage + maint + tax + insurance + utilities + other;
    var total = monthly * months;
    var daily = monthly / 30;

    var el = document.getElementById('cc-results');
    if (!el) return;

    var h = '<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">';
    h += '<div class="text-center"><div class="text-[10px] text-gray-500 uppercase tracking-wider">Monthly Total</div>' +
      '<div class="text-lg font-bold text-orange-600">' + $(monthly) + '</div></div>';
    h += '<div class="text-center"><div class="text-[10px] text-gray-500 uppercase tracking-wider">Daily Cost</div>' +
      '<div class="text-lg font-bold text-gray-900">' + $(Math.round(daily)) + '</div></div>';
    h += '<div class="text-center"><div class="text-[10px] text-gray-500 uppercase tracking-wider">' + months + '-Month Total</div>' +
      '<div class="text-lg font-bold text-red-600">' + $(total) + '</div></div>';
    h += '<div class="text-center"><div class="text-[10px] text-gray-500 uppercase tracking-wider">Annual</div>' +
      '<div class="text-lg font-bold text-gray-700">' + $(monthly * 12) + '</div></div>';
    h += '</div>';

    // Breakdown bar
    var parts = [
      { label: 'Mortgage', val: mortgage, clr: '#3B82F6' },
      { label: 'Maintenance', val: maint, clr: '#8B5CF6' },
      { label: 'Tax', val: tax, clr: '#F59E0B' },
      { label: 'Insurance', val: insurance, clr: '#059669' },
      { label: 'Utilities', val: utilities, clr: '#6366F1' },
      { label: 'Other', val: other, clr: '#9CA3AF' },
    ].filter(function (p) { return p.val > 0; });

    if (monthly > 0) {
      h += '<div class="mt-2"><div class="text-[10px] text-gray-500 mb-1">Monthly Breakdown</div>';
      h += '<div class="h-5 rounded-full overflow-hidden flex">';
      parts.forEach(function (p) {
        var pct = (p.val / monthly) * 100;
        h += '<div style="width:' + pct + '%;background:' + p.clr + ';" class="h-full" title="' + p.label + ': ' + $(p.val) + '"></div>';
      });
      h += '</div>';
      h += '<div class="flex flex-wrap gap-3 mt-2">';
      parts.forEach(function (p) {
        h += '<span class="text-[10px] text-gray-600"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + p.clr + ';margin-right:3px;"></span>' + p.label + ': ' + $(p.val) + '</span>';
      });
      h += '</div></div>';
    }

    // Impact message
    if (total > 0) {
      h += '<div class="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">';
      h += '<i class="fas fa-lightbulb mr-1"></i>';
      h += 'Every month on market costs <b>' + $(monthly) + '</b>. ';
      h += 'A price reduction that sells the property even 1 month faster saves the seller <b>' + $(monthly) + '</b> in carrying costs.';
      h += '</div>';
    }

    el.innerHTML = h;
  }

  return { render: render, compute: compute };
})();
