// =============================================================================
// PITCH PACKET v2 — Comp Manager, Editable Financials, Two-Step Outreach
// =============================================================================
// Sections: A) Comp Manager  B) Pricing & Financials  C) Actions
// Dependencies: CRM (modal/toast), MallanAPI._fetch(), Utils (esc, formatMoney, formatDate)
// =============================================================================
/* global CRM, MallanAPI, Utils, SellerProspects */

var PitchPacket = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  // ── State ──────────────────────────────────────────────────────────────
  var _comps = [];          // selected comps
  var _overrides = {};      // { estimated_value, commission_rate, attorney_fees }
  var _prospect = null;     // current prospect
  var _searchResults = [];  // last comp search results
  var _loaded = false;      // whether comps have been loaded from server
  var _searchOpen = false;  // whether search bar is visible
  var _el = null;           // container element reference

  // ── Main entry point ───────────────────────────────────────────────────
  function render(el, prospect) {
    _prospect = prospect;
    _el = el;

    if (!_loaded) {
      _loadComps(prospect.id, el);
      return;
    }
    _renderFull(el);
  }

  // ── Load saved comps from API ──────────────────────────────────────────
  function _loadComps(id, el) {
    el.innerHTML = '<div class="flex items-center justify-center py-8">' +
      '<i class="fas fa-spinner fa-spin text-gold text-xl"></i>' +
      '<span class="text-sm text-gray-500 ml-2">Loading comps...</span></div>';

    MallanAPI._fetch('/api/crm/sales/prospects/' + id + '/comps')
      .then(function (data) {
        _comps = data.comps || [];
        _overrides = data.overrides || {};
        _loaded = true;
        _renderFull(el);
      })
      .catch(function () {
        _comps = [];
        _overrides = {};
        _loaded = true;
        _renderFull(el);
      });
  }

  // ── Full render ────────────────────────────────────────────────────────
  function _renderFull(el) {
    var p = _prospect;
    if (!p) return;

    var h = '<div class="space-y-5">';

    // ── Opt-out notice ──
    if (p.consent_opt_out_at) {
      h += '<div class="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">' +
        '<i class="fas fa-ban text-red-500"></i>' +
        '<span class="text-xs font-semibold text-red-700">This prospect has unsubscribed from emails (' +
        E(new Date(p.consent_opt_out_at).toLocaleDateString()) + '). Do not send.</span></div>';
    }

    // ── Section A: Comp Manager ──
    h += _renderCompManager();

    // ── Section B: Pricing & Financials (only if comps exist) ──
    if (_comps.length > 0) {
      h += _renderFinancials();
    }

    // ── Section C: Actions ──
    h += _renderActions();

    h += '</div>';
    el.innerHTML = h;
  }

  // =====================================================================
  // SECTION A: COMP MANAGER
  // =====================================================================
  function _renderCompManager() {
    var pid = E(String(_prospect.id));
    var h = '<div class="bg-white border border-gray-200 rounded-xl p-5">';

    // Header row
    h += '<div class="flex items-center justify-between flex-wrap gap-3 mb-4">';
    h += '<h4 class="text-sm font-bold text-gray-900">' +
      '<i class="fas fa-balance-scale text-gold mr-2"></i>Your Comps (' + _comps.length + ' selected)</h4>';
    h += '<div class="flex gap-2">';
    h += '<button class="btn btn-sm btn-outline" onclick="PitchPacket._toggleSearch()">' +
      '<i class="fas fa-search mr-1"></i>' + (_searchOpen ? 'Close Search' : 'Search & Add') + '</button>';
    if (_comps.length > 0) {
      h += '<button class="btn btn-sm btn-gold" onclick="PitchPacket._saveComps()">' +
        '<i class="fas fa-save mr-1"></i>Save Comps</button>';
    }
    h += '</div></div>';

    // Search bar (toggle)
    if (_searchOpen) {
      h += _renderSearchBar();
    }

    // Comp table or empty state
    if (_comps.length > 0) {
      h += _renderCompTable();
    } else {
      h += '<div class="text-center py-10 bg-gray-50 rounded-lg">' +
        '<i class="fas fa-search text-3xl text-gray-300 mb-3"></i>' +
        '<p class="text-sm text-gray-600 font-semibold">No comps selected</p>' +
        '<p class="text-xs text-gray-400 mt-1">Run Research to auto-populate, or search to add manually.</p></div>';
    }

    h += '</div>';
    return h;
  }

  function _renderSearchBar() {
    var h = '<div class="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">';
    h += '<div class="flex gap-2">';
    h += '<input id="pp-comp-search" type="text" class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" ' +
      'placeholder="Search by address or MLS ID..." ' +
      'onkeydown="if(event.key===\'Enter\'){PitchPacket._search();}">';
    h += '<button class="btn btn-sm btn-gold" onclick="PitchPacket._search()">' +
      '<i class="fas fa-search mr-1"></i>Search</button>';
    h += '</div>';

    // Search results
    if (_searchResults.length > 0) {
      h += '<div class="mt-3 space-y-2">';
      h += '<div class="text-xs font-semibold text-gray-500 uppercase tracking-wide">' +
        _searchResults.length + ' results</div>';
      _searchResults.forEach(function (r, i) {
        var alreadyAdded = _comps.some(function (c) { return c.mls_id === r.mls_id; });
        h += '<div class="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">';
        h += '<div class="flex-1 min-w-0">';
        h += '<div class="text-sm font-semibold text-gray-900 truncate">' +
          E(r.address || '-') + (r.unit ? ' #' + E(r.unit) : '') + '</div>';
        h += '<div class="flex gap-3 text-xs text-gray-500 mt-1">';
        h += '<span>' + (r.close_price ? $(r.close_price) : '-') + '</span>';
        h += '<span>' + (r.beds || '-') + 'bd/' + (r.baths || '-') + 'ba</span>';
        h += '<span>' + (r.sqft ? Number(r.sqft).toLocaleString() + ' sqft' : '-') + '</span>';
        h += '<span>' + (r.close_date ? D(r.close_date) : '-') + '</span>';
        if (r.mls_id) h += '<span class="text-gray-400">' + E(r.mls_id) + '</span>';
        h += '</div></div>';
        if (alreadyAdded) {
          h += '<span class="text-xs text-green-600 font-semibold ml-3"><i class="fas fa-check mr-1"></i>Added</span>';
        } else {
          h += '<button class="btn btn-sm btn-outline ml-3" onclick="PitchPacket._addComp(' + i + ')">' +
            '<i class="fas fa-plus mr-1"></i>Add</button>';
        }
        h += '</div>';
      });
      h += '</div>';
    }

    h += '</div>';
    return h;
  }

  function _renderCompTable() {
    var h = '<div class="overflow-x-auto">';
    h += '<table class="w-full text-xs">';
    h += '<thead><tr class="bg-gray-50 text-gray-500 text-[10px] uppercase">';
    h += '<th class="px-3 py-2 text-left">Address</th>';
    h += '<th class="px-3 py-2 text-right">Price</th>';
    h += '<th class="px-3 py-2 text-center">Beds/Baths</th>';
    h += '<th class="px-3 py-2 text-right">Sqft</th>';
    h += '<th class="px-3 py-2 text-left">Close Date</th>';
    h += '<th class="px-3 py-2 text-left">Note</th>';
    h += '<th class="px-3 py-2 text-center" style="width:40px;"></th>';
    h += '</tr></thead><tbody>';

    _comps.forEach(function (c, i) {
      h += '<tr class="border-b border-gray-100 hover:bg-gray-50">';
      h += '<td class="px-3 py-2 font-medium">' + E(c.address || '-') +
        (c.unit ? ' #' + E(c.unit) : '') +
        (c.mls_id ? '<br><span class="text-[10px] text-gray-400">' + E(c.mls_id) + '</span>' : '') + '</td>';
      h += '<td class="px-3 py-2 text-right font-semibold text-green-700">' +
        (c.close_price ? $(c.close_price) : '-') + '</td>';
      h += '<td class="px-3 py-2 text-center">' + (c.beds || '-') + '/' + (c.baths || '-') + '</td>';
      h += '<td class="px-3 py-2 text-right">' + (c.sqft ? Number(c.sqft).toLocaleString() : '-') + '</td>';
      h += '<td class="px-3 py-2">' + (c.close_date ? D(c.close_date) : '-') + '</td>';
      h += '<td class="px-3 py-2">' +
        '<input type="text" class="border border-gray-200 rounded px-2 py-1 text-xs w-full" ' +
        'value="' + E(c.note || '') + '" ' +
        'placeholder="Add note..." ' +
        'onchange="PitchPacket._updateNote(' + i + ', this.value)"></td>';
      h += '<td class="px-3 py-2 text-center">' +
        '<button class="text-red-400 hover:text-red-600" title="Remove comp" ' +
        'onclick="PitchPacket._removeComp(' + i + ')">' +
        '<i class="fas fa-trash-alt"></i></button></td>';
      h += '</tr>';
    });

    h += '</tbody></table></div>';

    // Median $/sqft summary
    var medianPsf = _calcMedianPsf();
    if (medianPsf > 0) {
      var prospectSqft = Number(_prospect.sqft) || 0;
      var estimatedVal = prospectSqft > 0 ? Math.round(medianPsf * prospectSqft) : 0;
      h += '<div class="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between flex-wrap gap-2">';
      h += '<div class="text-xs text-amber-800">' +
        '<strong>Median $/sqft from comps:</strong> ' + $(Math.round(medianPsf)) + '/sqft';
      if (prospectSqft > 0) {
        h += ' &times; ' + Number(prospectSqft).toLocaleString() + ' sqft = <strong>' + $(estimatedVal) + '</strong>';
      }
      h += '</div></div>';
    }

    return h;
  }

  // =====================================================================
  // SECTION B: PRICING & FINANCIALS
  // =====================================================================
  function _renderFinancials() {
    var medianPsf = _calcMedianPsf();
    var prospectSqft = Number(_prospect.sqft) || 0;
    var calcValue = (medianPsf > 0 && prospectSqft > 0)
      ? Math.round(medianPsf * prospectSqft) : 0;

    // Use override if set, else calculated
    var estValue = Number(_overrides.estimated_value) || calcValue;
    var commRate = _overrides.commission_rate != null ? Number(_overrides.commission_rate) : 0.06;
    var attFees  = _overrides.attorney_fees != null ? Number(_overrides.attorney_fees) : 3000;

    // Calculate transfer tax (NYC rules)
    var transferTaxRate = estValue >= 500000 ? 0.01425 : 0.01;
    var commission = Math.round(estValue * commRate);
    var transferTax = Math.round(estValue * transferTaxRate);
    var mortgagePayoff = Number(_prospect.mortgage_amount) || 0;
    var netProceeds = estValue - commission - transferTax - attFees - mortgagePayoff;
    var lastPurchase = Number(_prospect.last_purchase_price) || 0;
    var equityGain = lastPurchase > 0 ? (estValue - lastPurchase) : 0;

    var h = '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h4 class="text-sm font-bold text-gray-900 mb-4">' +
      '<i class="fas fa-calculator text-gold mr-2"></i>Pricing & Financials</h4>';

    // Editable fields row
    h += '<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">';

    // Override value
    h += '<div>';
    h += '<label class="text-xs font-semibold text-gray-700 block mb-1">Estimated Value</label>';
    h += '<div class="relative">';
    h += '<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>';
    h += '<input id="pp-override-value" type="number" class="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm font-semibold" ' +
      'value="' + (estValue || '') + '" ' +
      'onchange="PitchPacket._updateOverride(\'estimated_value\', this.value)" ' +
      'placeholder="' + (calcValue > 0 ? calcValue : 'Enter value') + '">';
    h += '</div>';
    if (calcValue > 0 && estValue !== calcValue) {
      h += '<div class="text-[10px] text-gray-400 mt-1">Calculated from comps: ' + $(calcValue) + '</div>';
    }
    h += '</div>';

    // Commission rate
    h += '<div>';
    h += '<label class="text-xs font-semibold text-gray-700 block mb-1">Commission Rate</label>';
    h += '<div class="relative">';
    h += '<input id="pp-comm-rate" type="number" step="0.01" min="0" max="15" ' +
      'class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" ' +
      'value="' + (commRate * 100).toFixed(2) + '" ' +
      'onchange="PitchPacket._updateOverride(\'commission_rate\', this.value / 100)">';
    h += '<span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>';
    h += '</div></div>';

    // Attorney fees
    h += '<div>';
    h += '<label class="text-xs font-semibold text-gray-700 block mb-1">Attorney Fees</label>';
    h += '<div class="relative">';
    h += '<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>';
    h += '<input id="pp-att-fees" type="number" class="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm" ' +
      'value="' + attFees + '" ' +
      'onchange="PitchPacket._updateOverride(\'attorney_fees\', this.value)">';
    h += '</div></div>';

    h += '</div>';

    // Net proceeds breakdown
    h += '<div class="bg-gray-50 rounded-lg p-4">';
    h += '<div class="space-y-2">';
    h += _lineItem('Sale Price (Estimated)', $(estValue), 'text-gray-900 font-bold');
    h += _lineItem('Commission (' + (commRate * 100).toFixed(1) + '%)',
      '- ' + $(commission), 'text-red-600');
    h += _lineItem('Transfer Tax (' + (transferTaxRate * 100).toFixed(2) + '%)',
      '- ' + $(transferTax), 'text-red-600');
    h += _lineItem('Attorney Fees', '- ' + $(attFees), 'text-red-600');
    if (mortgagePayoff > 0) {
      h += _lineItem('Mortgage Payoff', '- ' + $(mortgagePayoff), 'text-red-600');
    }
    h += '<div class="border-t border-gray-300 pt-2 mt-2">';
    h += _lineItem('Estimated Net Proceeds', $(netProceeds),
      netProceeds >= 0
        ? 'text-green-700 font-bold text-base'
        : 'text-red-700 font-bold text-base');
    h += '</div>';

    if (equityGain !== 0) {
      h += '<div class="border-t border-gray-200 pt-2 mt-2">';
      h += _lineItem('Last Purchase Price', $(lastPurchase), 'text-gray-500');
      h += _lineItem('Equity Gain / (Loss)', $(equityGain),
        equityGain >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold');
      h += '</div>';
    }

    h += '</div></div>';

    h += '<p class="text-[10px] text-gray-400 mt-3">Estimates only. Transfer tax is NYC residential rate ' +
      '(1% under $500K, 1.425% at $500K+). Actual costs may vary. Does not include NY State transfer tax, ' +
      'flip tax, or other closing costs.</p>';

    h += '</div>';
    return h;
  }

  // =====================================================================
  // SECTION C: ACTIONS
  // =====================================================================
  function _renderActions() {
    var p = _prospect;
    var pid = E(String(p.id));
    var hasEmail = !!p.owner_email;
    var pitchData = p.pitch_data || {};

    var h = '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h4 class="text-sm font-bold text-gray-900 mb-4">' +
      '<i class="fas fa-paper-plane text-gold mr-2"></i>Outreach Actions</h4>';

    // Button row
    h += '<div class="flex flex-wrap gap-3 mb-4">';

    // Hook email
    h += '<button class="btn btn-sm btn-outline' + (!hasEmail ? ' opacity-50 cursor-not-allowed' : '') + '" ' +
      (hasEmail
        ? 'onclick="PitchPacket._sendHook(\'' + pid + '\')"'
        : 'disabled title="No email on file"') +
      ' style="border-color:#B8860B;color:#B8860B;">' +
      '<i class="fas fa-bolt mr-1"></i>Send Hook Email</button>';

    // Full pitch
    h += '<button class="btn btn-sm btn-gold' + (!hasEmail ? ' opacity-50 cursor-not-allowed' : '') + '" ' +
      (hasEmail
        ? 'onclick="PitchPacket._sendPitch(\'' + pid + '\')"'
        : 'disabled title="No email on file"') + '>' +
      '<i class="fas fa-file-powerpoint mr-1"></i>Send Full Pitch</button>';

    // Download PDF
    h += '<button class="btn btn-sm btn-outline" onclick="PitchPacket._download(\'' + pid + '\')">' +
      '<i class="fas fa-download mr-1"></i>Download PDF</button>';

    // Generate / Refresh (backward compat)
    h += '<button class="btn btn-sm btn-outline" onclick="PitchPacket._generate(\'' + pid + '\')">' +
      '<i class="fas fa-sync-alt mr-1"></i>Refresh Data</button>';

    h += '</div>';

    // Status indicators
    var statusParts = [];
    if (pitchData.hook_email_sent_at) {
      statusParts.push('<span class="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">' +
        '<i class="fas fa-bolt"></i> Hook sent: ' + E(D(pitchData.hook_email_sent_at)) + '</span>');
    }
    if (p.pitch_sent_at) {
      statusParts.push('<span class="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">' +
        '<i class="fas fa-paper-plane"></i> Pitch sent: ' + E(D(p.pitch_sent_at)) + '</span>');
    }
    if (statusParts.length > 0) {
      h += '<div class="flex flex-wrap gap-2 mb-3">' + statusParts.join('') + '</div>';
    }
    if (!hasEmail) {
      h += '<div class="text-xs text-gray-400 italic"><i class="fas fa-info-circle mr-1"></i>' +
        'Add an email address on the Overview tab to enable email outreach.</div>';
    }

    // Attribution
    h += '<div class="text-[10px] text-gray-400 mt-4 pt-3 border-t border-gray-100">' +
      'Based on information from the REBNY Listing Service. Data believed reliable but not guaranteed. ' +
      'Licensed to Mallan Real Estate Inc. | Brokerage #10991205323</div>';

    h += '</div>';
    return h;
  }

  // =====================================================================
  // HELPERS
  // =====================================================================
  function _lineItem(label, value, valueClass) {
    return '<div class="flex justify-between items-baseline py-1">' +
      '<span class="text-xs text-gray-600">' + E(label) + '</span>' +
      '<span class="text-xs ' + (valueClass || '') + '">' + E(value || '\u2014') + '</span></div>';
  }

  function _calcMedianPsf() {
    var psfValues = [];
    _comps.forEach(function (c) {
      if (c.close_price && c.sqft && Number(c.sqft) > 0) {
        psfValues.push(Number(c.close_price) / Number(c.sqft));
      }
    });
    if (psfValues.length === 0) return 0;
    psfValues.sort(function (a, b) { return a - b; });
    var mid = Math.floor(psfValues.length / 2);
    return psfValues.length % 2 !== 0
      ? psfValues[mid]
      : (psfValues[mid - 1] + psfValues[mid]) / 2;
  }

  // =====================================================================
  // ACTIONS
  // =====================================================================

  function _toggleSearch() {
    _searchOpen = !_searchOpen;
    if (!_searchOpen) _searchResults = [];
    _renderFull(_el);
  }

  function _search() {
    var input = document.getElementById('pp-comp-search');
    var q = input ? input.value.trim() : '';
    if (!q) return;

    var id = _prospect.id;
    CRM.toast('Searching comps...', 'info');

    MallanAPI._fetch('/api/crm/sales/prospects/' + id + '/comps?q=' + encodeURIComponent(q))
      .then(function (data) {
        _searchResults = data.results || [];
        if (_searchResults.length === 0) {
          CRM.toast('No results found for "' + q + '"', 'info');
        }
        _renderFull(_el);
        // Restore search query in input after re-render
        var newInput = document.getElementById('pp-comp-search');
        if (newInput) newInput.value = q;
      })
      .catch(function (err) {
        CRM.toast('Search failed: ' + (err.message || ''), 'error');
      });
  }

  function _addComp(idx) {
    var comp = _searchResults[idx];
    if (!comp) return;

    // Prevent duplicates
    var exists = _comps.some(function (c) { return c.mls_id === comp.mls_id; });
    if (exists) {
      CRM.toast('Comp already added', 'info');
      return;
    }

    comp.added_at = new Date().toISOString();
    _comps.push(comp);
    CRM.toast('Added: ' + (comp.address || comp.mls_id), 'success');
    _renderFull(_el);
  }

  function _removeComp(idx) {
    if (idx < 0 || idx >= _comps.length) return;
    var removed = _comps.splice(idx, 1)[0];
    CRM.toast('Removed: ' + (removed.address || removed.mls_id), 'info');
    _renderFull(_el);
  }

  function _updateNote(idx, value) {
    if (idx >= 0 && idx < _comps.length) {
      _comps[idx].note = value;
    }
  }

  function _updateOverride(key, value) {
    _overrides[key] = Number(value) || 0;
    // Re-render financials section without losing scroll position
    _renderFull(_el);
  }

  function _saveComps() {
    var id = _prospect.id;
    CRM.toast('Saving comps...', 'info');

    MallanAPI._fetch('/api/crm/sales/prospects/' + id + '/comps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comps: _comps, overrides: _overrides })
    })
      .then(function () {
        CRM.toast('Comps saved', 'success');
      })
      .catch(function (err) {
        CRM.toast('Save failed: ' + (err.message || ''), 'error');
      });
  }

  function _sendHook(id) {
    if (!confirm('Send a hook email to this prospect? This is a brief introductory message with your value proposition.')) return;
    CRM.toast('Sending hook email...', 'info');

    MallanAPI._fetch('/api/crm/sales/prospects/' + id + '/hook-email', { method: 'POST' })
      .then(function (data) {
        CRM.toast('Hook email sent to ' + (data.sent_to || 'prospect'), 'success');
        // Update local prospect data
        if (!_prospect.pitch_data) _prospect.pitch_data = {};
        _prospect.pitch_data.hook_email_sent_at = new Date().toISOString();
        _renderFull(_el);
      })
      .catch(function (err) {
        CRM.toast('Hook email failed: ' + (err.message || ''), 'error');
      });
  }

  function _sendPitch(id) {
    if (!confirm('Send the full pitch packet to this prospect via email?')) return;
    CRM.toast('Sending pitch packet...', 'info');

    MallanAPI._fetch('/api/crm/sales/prospects/' + id + '/send-packet', { method: 'POST' })
      .then(function (data) {
        CRM.toast('Pitch packet sent to ' + (data.sent_to || 'prospect'), 'success');
        _prospect.pitch_sent_at = new Date().toISOString();
        _renderFull(_el);
        // Refresh workspace if available
        if (typeof SellerProspects !== 'undefined' && SellerProspects.openWorkspace) {
          SellerProspects.openWorkspace(id);
        }
      })
      .catch(function (err) {
        CRM.toast('Send failed: ' + (err.message || ''), 'error');
      });
  }

  function _download(id) {
    window.open('/api/crm/sales/prospects/' + id + '/pdf', '_blank');
  }

  function _generate(id) {
    CRM.toast('Refreshing pitch data from Trestle...', 'info');

    MallanAPI._fetch('/api/crm/sales/prospects/' + id + '/pitch-packet')
      .then(function (data) {
        // If the pitch packet returns comps, merge them in
        if (data.property_intel && data.property_intel.recent_sales) {
          var newComps = data.property_intel.recent_sales;
          newComps.forEach(function (nc) {
            var exists = _comps.some(function (c) { return c.mls_id === nc.mls_id; });
            if (!exists) {
              nc.added_at = new Date().toISOString();
              _comps.push(nc);
            }
          });
        }
        CRM.toast('Pitch data refreshed', 'success');
        _renderFull(_el);
      })
      .catch(function (err) {
        CRM.toast('Refresh failed: ' + (err.message || ''), 'error');
      });
  }

  // =====================================================================
  // PUBLIC API
  // =====================================================================
  return {
    render: render,
    _search: _search,
    _addComp: _addComp,
    _removeComp: _removeComp,
    _updateNote: _updateNote,
    _updateOverride: _updateOverride,
    _saveComps: _saveComps,
    _sendHook: _sendHook,
    _sendPitch: _sendPitch,
    _download: _download,
    _toggleSearch: _toggleSearch,
    _generate: _generate,
  };
})();
