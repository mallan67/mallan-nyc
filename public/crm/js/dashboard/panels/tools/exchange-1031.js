// ═══════════════════════════════════════════════════════════════════════════════
// 1031 EXCHANGE TIMELINE TRACKER
// Tracks 45-day identification and 180-day exchange deadlines
// ═══════════════════════════════════════════════════════════════════════════════
/* global Utils, CRM */

var Exchange1031Tracker = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;

  var _formId = 'ex1031-' + Date.now();
  var _identifiedProperties = [];

  function _val(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  function _numVal(id) {
    var el = document.getElementById(id);
    return el ? parseFloat(el.value) || 0 : 0;
  }

  function _daysBetween(d1, d2) {
    var ms = d2.getTime() - d1.getTime();
    return Math.floor(ms / 86400000);
  }

  function _formatDate(d) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function _statusInfo(daysRemaining, deadline) {
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    if (now > deadline) return { label: 'OVERDUE', cls: 'bg-red-100 text-red-700 border-red-300', icon: 'fa-exclamation-triangle', color: '#dc2626' };
    if (daysRemaining <= 7) return { label: 'URGENT', cls: 'bg-red-100 text-red-700 border-red-300', icon: 'fa-exclamation-circle', color: '#dc2626' };
    if (daysRemaining <= 14) return { label: 'APPROACHING', cls: 'bg-yellow-100 text-yellow-700 border-yellow-300', icon: 'fa-clock', color: '#ca8a04' };
    return { label: 'ON TRACK', cls: 'bg-green-100 text-green-700 border-green-300', icon: 'fa-check-circle', color: '#16a34a' };
  }

  function addProperty() {
    if (_identifiedProperties.length >= 3) {
      CRM.toast('Maximum 3 identified properties allowed under the 3-Property Rule', 'warning');
      return;
    }
    var addr = _val(_formId + '-prop-address');
    var val = _numVal(_formId + '-prop-value');
    if (!addr || !addr.trim()) {
      CRM.toast('Enter a property address', 'warning');
      return;
    }
    _identifiedProperties.push({ address: addr.trim(), value: val });

    // Clear inputs
    var addrEl = document.getElementById(_formId + '-prop-address');
    var valEl = document.getElementById(_formId + '-prop-value');
    if (addrEl) addrEl.value = '';
    if (valEl) valEl.value = '';

    calculate();
    CRM.toast('Property added (' + _identifiedProperties.length + '/3)', 'success');
  }

  function removeProperty(idx) {
    _identifiedProperties.splice(idx, 1);
    calculate();
  }

  function calculate() {
    var closeDate = _val(_formId + '-close-date');
    var relinquishedValue = _numVal(_formId + '-relinquished-value');

    var resultsEl = document.getElementById(_formId + '-results');
    if (!resultsEl) return;

    if (!closeDate) {
      resultsEl.innerHTML =
        '<div class="border rounded-lg p-6 bg-gray-50 text-center">' +
          '<i class="fas fa-calendar-alt text-3xl text-gray-300 mb-2"></i>' +
          '<div class="text-sm text-gray-500">Enter a sale close date to begin tracking</div>' +
        '</div>';
      return;
    }

    var saleDate = new Date(closeDate + 'T00:00:00');
    var now = new Date();
    now.setHours(0, 0, 0, 0);

    var identDeadline = new Date(saleDate.getTime() + 45 * 86400000);
    var exchangeDeadline = new Date(saleDate.getTime() + 180 * 86400000);

    var daysSinceSale = _daysBetween(saleDate, now);
    var daysToIdent = _daysBetween(now, identDeadline);
    var daysToExchange = _daysBetween(now, exchangeDeadline);

    var identStatus = _statusInfo(daysToIdent, identDeadline);
    var exchangeStatus = _statusInfo(daysToExchange, exchangeDeadline);

    // Completed checks
    var identCompleted = _identifiedProperties.length > 0 && now <= identDeadline;
    if (identCompleted) {
      identStatus = { label: 'IDENTIFIED', cls: 'bg-blue-100 text-blue-700 border-blue-300', icon: 'fa-check', color: '#2563eb' };
    }

    // Timeline progress bar
    var totalDays = 180;
    var elapsed = Math.min(Math.max(daysSinceSale, 0), totalDays);
    var progressPct = (elapsed / totalDays) * 100;
    var identMarker = (45 / 180) * 100; // 25%

    // Identified properties list
    var propsHtml = '';
    var totalIdentifiedValue = 0;
    for (var i = 0; i < _identifiedProperties.length; i++) {
      var p = _identifiedProperties[i];
      totalIdentifiedValue += p.value;
      propsHtml +=
        '<div class="flex items-center justify-between bg-gray-50 rounded p-2 border mb-1">' +
          '<div class="flex-1">' +
            '<div class="text-sm font-medium text-gray-800">' + E(p.address) + '</div>' +
            '<div class="text-xs text-gray-500">Estimated: ' + $(p.value) + '</div>' +
          '</div>' +
          '<button onclick="Exchange1031Tracker.removeProperty(' + i + ')" class="ml-2 text-red-400 hover:text-red-600 text-xs"><i class="fas fa-trash"></i></button>' +
        '</div>';
    }

    var valueCheck = relinquishedValue > 0 && totalIdentifiedValue > 0;
    var meetsValueRule = totalIdentifiedValue >= relinquishedValue;

    resultsEl.innerHTML =
      '<div class="border rounded-lg p-4 bg-white">' +
        '<!-- Timeline Bar -->' +
        '<div class="mb-4">' +
          '<div class="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Exchange Timeline</div>' +
          '<div class="flex justify-between text-xs text-gray-500 mb-1">' +
            '<span>Sale: ' + _formatDate(saleDate) + '</span>' +
            '<span>Deadline: ' + _formatDate(exchangeDeadline) + '</span>' +
          '</div>' +
          '<div class="relative bg-gray-200 rounded-full h-4 overflow-hidden">' +
            '<div class="absolute h-full rounded-full transition-all" style="width:' + progressPct + '%;background:' + (progressPct > 80 ? '#dc2626' : progressPct > 50 ? '#ca8a04' : '#16a34a') + '"></div>' +
            '<div class="absolute h-full w-0.5 bg-blue-600" style="left:' + identMarker + '%" title="45-day identification deadline"></div>' +
          '</div>' +
          '<div class="flex justify-between text-xs text-gray-400 mt-1">' +
            '<span>Day 0</span>' +
            '<span style="margin-left:' + (identMarker - 10) + '%">Day 45</span>' +
            '<span>Day 180</span>' +
          '</div>' +
          '<div class="text-center text-xs text-gray-500 mt-1">' +
            'Day <strong>' + Math.max(daysSinceSale, 0) + '</strong> of 180' +
          '</div>' +
        '</div>' +

        '<!-- Status Cards -->' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">' +
          '<div class="border rounded-lg p-3 ' + identStatus.cls + '">' +
            '<div class="flex items-center justify-between mb-1">' +
              '<div class="text-xs font-bold uppercase">45-Day Identification</div>' +
              '<span class="text-xs font-bold"><i class="fas ' + identStatus.icon + ' mr-1"></i>' + identStatus.label + '</span>' +
            '</div>' +
            '<div class="text-sm font-medium">Deadline: ' + _formatDate(identDeadline) + '</div>' +
            '<div class="text-xs">' + (daysToIdent > 0 ? daysToIdent + ' days remaining' : Math.abs(daysToIdent) + ' days overdue') + '</div>' +
            '<div class="text-xs mt-1">Properties identified: <strong>' + _identifiedProperties.length + '/3</strong></div>' +
          '</div>' +
          '<div class="border rounded-lg p-3 ' + exchangeStatus.cls + '">' +
            '<div class="flex items-center justify-between mb-1">' +
              '<div class="text-xs font-bold uppercase">180-Day Exchange</div>' +
              '<span class="text-xs font-bold"><i class="fas ' + exchangeStatus.icon + ' mr-1"></i>' + exchangeStatus.label + '</span>' +
            '</div>' +
            '<div class="text-sm font-medium">Deadline: ' + _formatDate(exchangeDeadline) + '</div>' +
            '<div class="text-xs">' + (daysToExchange > 0 ? daysToExchange + ' days remaining' : Math.abs(daysToExchange) + ' days overdue') + '</div>' +
          '</div>' +
        '</div>' +

        '<!-- Identified Properties -->' +
        '<div class="border rounded-lg p-3 mb-4">' +
          '<div class="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Identified Replacement Properties (max 3)</div>' +
          (propsHtml || '<div class="text-xs text-gray-400 italic mb-2">No properties identified yet</div>') +
          (_identifiedProperties.length < 3 ?
            '<div class="flex gap-2 mt-2">' +
              '<input id="' + _formId + '-prop-address" type="text" placeholder="Property address" class="flex-1 px-3 py-1.5 border rounded text-sm focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
              '<input id="' + _formId + '-prop-value" type="number" placeholder="Est. value" class="w-32 px-3 py-1.5 border rounded text-sm focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
              '<button onclick="Exchange1031Tracker.addProperty()" class="px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded hover:bg-amber-700 whitespace-nowrap">+ Add</button>' +
            '</div>' : '') +
          (valueCheck ?
            '<div class="mt-2 p-2 rounded text-xs border ' + (meetsValueRule ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700') + '">' +
              '<i class="fas ' + (meetsValueRule ? 'fa-check-circle' : 'fa-exclamation-triangle') + ' mr-1"></i>' +
              'Total identified value: ' + $(totalIdentifiedValue) + ' vs. relinquished: ' + $(relinquishedValue) + ' &mdash; ' +
              (meetsValueRule ? 'Meets equal-or-greater-value requirement' : 'Below relinquished property value (must be equal or greater)') +
            '</div>' : '') +
        '</div>' +

        '<!-- Rules -->' +
        '<div class="border rounded-lg p-3 bg-blue-50 border-blue-200">' +
          '<div class="text-xs font-bold text-blue-800 mb-2 uppercase tracking-wide"><i class="fas fa-info-circle mr-1"></i>1031 Exchange Rules</div>' +
          '<ul class="text-xs text-blue-700 space-y-1">' +
            '<li><i class="fas fa-check mr-1"></i>Must identify replacement property within <strong>45 days</strong> of sale close</li>' +
            '<li><i class="fas fa-check mr-1"></i>Must close on replacement within <strong>180 days</strong> of sale close</li>' +
            '<li><i class="fas fa-check mr-1"></i>Replacement must be of <strong>equal or greater value</strong></li>' +
            '<li><i class="fas fa-check mr-1"></i>All cash from sale must go to a <strong>Qualified Intermediary (QI)</strong></li>' +
            '<li><i class="fas fa-check mr-1"></i><strong>3-Property Rule:</strong> May identify up to 3 replacement properties regardless of value</li>' +
            '<li><i class="fas fa-check mr-1"></i>Both properties must be held for <strong>investment or business use</strong></li>' +
            '<li><i class="fas fa-exclamation-triangle mr-1 text-amber-600"></i>Cannot receive any <strong>"boot"</strong> (cash or non-like-kind property) without tax consequences</li>' +
          '</ul>' +
        '</div>' +
      '</div>';
  }

  function _printResults() {
    var resultsEl = document.getElementById(_formId + '-results');
    if (!resultsEl || !resultsEl.innerHTML.trim()) {
      CRM.toast('Set a sale close date first', 'warning');
      return;
    }
    var w = window.open('', '_blank', 'width=700,height=900');
    w.document.write(
      '<html><head><title>1031 Exchange Tracker</title>' +
      '<style>body{font-family:system-ui,sans-serif;padding:2rem;color:#333}' +
      'table{width:100%;border-collapse:collapse}td,th{padding:4px 8px}ul{padding-left:1.5rem}li{margin-bottom:4px}' +
      '.text-green-700,.text-green-600{color:#15803d}.text-red-700,.text-red-600{color:#b91c1c}' +
      '.text-yellow-700{color:#a16207}.text-blue-700,.text-blue-800{color:#1d4ed8}.text-amber-600{color:#d97706}' +
      '.text-gray-500,.text-gray-600,.text-gray-700,.text-gray-800,.text-gray-400{color:#6b7280}' +
      '.font-bold{font-weight:700}.font-semibold{font-weight:600}.font-medium{font-weight:500}' +
      '.text-3xl{font-size:1.875rem}.text-center{text-align:center}.text-right{text-align:right}' +
      '.text-left{text-align:left}.text-xs{font-size:0.75rem}.text-sm{font-size:0.875rem}' +
      '.border-b{border-bottom:1px solid #e5e7eb}' +
      '.mb-4{margin-bottom:1rem}.mb-3{margin-bottom:0.75rem}.mb-2{margin-bottom:0.5rem}.mb-1{margin-bottom:0.25rem}' +
      '.mt-1{margin-top:0.25rem}.mt-2{margin-top:0.5rem}.mr-1{margin-right:0.25rem}' +
      '.p-2{padding:0.5rem}.p-3{padding:0.75rem}.p-4{padding:1rem}' +
      '.rounded{border-radius:0.25rem}.rounded-lg{border-radius:0.5rem}.rounded-full{border-radius:9999px}' +
      '.border{border:1px solid #e5e7eb}.grid{display:grid}.grid-cols-2{grid-template-columns:repeat(2,1fr)}.gap-3{gap:0.75rem}' +
      '.bg-white{background:#fff}.bg-green-50{background:#f0fdf4}.bg-green-100{background:#dcfce7}' +
      '.bg-yellow-100{background:#fef9c3}.bg-red-50{background:#fef2f2}.bg-red-100{background:#fee2e2}' +
      '.bg-blue-50{background:#eff6ff}.bg-blue-100{background:#dbeafe}.bg-gray-50{background:#f9fafb}.bg-gray-200{background:#e5e7eb}' +
      '.border-green-200,.border-green-300{border-color:#bbf7d0}.border-yellow-300{border-color:#fde047}' +
      '.border-red-200,.border-red-300{border-color:#fecaca}.border-blue-200{border-color:#bfdbfe}' +
      '.uppercase{text-transform:uppercase}.tracking-wide{letter-spacing:0.05em}' +
      '.space-y-1>*+*{margin-top:0.25rem}.italic{font-style:italic}.whitespace-nowrap{white-space:nowrap}' +
      '.flex{display:flex}.items-center{align-items:center}.justify-between{justify-content:space-between}' +
      '.flex-1{flex:1}.gap-2{gap:0.5rem}.ml-2{margin-left:0.5rem}.w-0\\.5{width:0.125rem}' +
      '.h-4{height:1rem}.h-full{height:100%}.overflow-hidden{overflow:hidden}.relative{position:relative}.absolute{position:absolute}' +
      '@media print{body{padding:0.5rem}button{display:none}}</style></head><body>' +
      '<h2 style="margin-bottom:0.5rem">1031 Exchange Timeline</h2>' +
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
      CRM.toast('Set a sale close date first', 'warning');
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
    _identifiedProperties = [];

    return (
      '<div class="space-y-4" id="' + _formId + '">' +
        '<div class="flex items-center justify-between mb-2">' +
          '<h3 class="text-base font-bold text-gray-800"><i class="fas fa-exchange-alt mr-2 text-amber-600"></i>1031 Exchange Tracker</h3>' +
          '<div class="flex gap-2">' +
            '<button onclick="Exchange1031Tracker.calculate()" class="px-3 py-1 bg-amber-600 text-white text-xs font-semibold rounded hover:bg-amber-700">Update</button>' +
            '<button onclick="Exchange1031Tracker.print()" class="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs" title="Print"><i class="fas fa-print"></i></button>' +
            '<button onclick="Exchange1031Tracker.copy()" class="px-2 py-1 text-gray-500 hover:text-gray-700 text-xs" title="Copy"><i class="fas fa-copy"></i></button>' +
          '</div>' +
        '</div>' +

        '<div class="bg-white border rounded-lg p-4">' +
          '<div class="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">Relinquished Property</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Sale Close Date</label>' +
              '<input id="' + _formId + '-close-date" type="date" value="' + E(opts.sale_close_date || '') + '" onchange="Exchange1031Tracker.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
            '<div>' +
              '<label class="block text-xs font-semibold text-gray-700 mb-1">Relinquished Property Value</label>' +
              '<input id="' + _formId + '-relinquished-value" type="number" value="' + E(opts.relinquished_property_value || '') + '" placeholder="1000000" oninput="Exchange1031Tracker.calculate()" class="w-full px-3 py-2 border rounded text-sm font-medium focus:ring-2 focus:ring-amber-300 focus:border-amber-400">' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div id="' + _formId + '-results">' +
          '<div class="border rounded-lg p-6 bg-gray-50 text-center">' +
            '<i class="fas fa-calendar-alt text-3xl text-gray-300 mb-2"></i>' +
            '<div class="text-sm text-gray-500">Enter a sale close date to begin tracking</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  return {
    render: render,
    calculate: calculate,
    addProperty: addProperty,
    removeProperty: removeProperty,
    print: _printResults,
    copy: _copyResults
  };
})();
