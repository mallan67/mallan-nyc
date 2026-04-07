// =============================================================================
// RENTAL PITCH PACKET — Comp Manager with Auto-CMA, Editable Financials
// =============================================================================
// Mirrors the sales PitchPacket for rental properties.
// When a property address is populated, the CMA runs automatically to find
// comparable rentals. Broker/agent can edit comps and financials before sending.
//
// Sections: A) Comp Manager + Auto-CMA  B) Rental Financials  C) Actions
// Dependencies: CRM (modal/toast), MallanAPI._fetch(), Utils (esc, formatMoney, formatDate)
// =============================================================================
/* global CRM, MallanAPI, Utils, RentalsCRM, Router */

var RentalPitchPacket = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  // ── State ──────────────────────────────────────────────────────────────
  var _comps = [];
  var _overrides = {};
  var _prospect = null;
  var _searchResults = [];
  var _loaded = false;
  var _searchOpen = false;
  var _el = null;
  var _cmaReport = null; // auto-CMA result

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
      '<span class="text-sm text-gray-500 ml-2">Loading rental comps...</span></div>';

    MallanAPI._fetch('/api/crm/sales/prospects/' + id + '/comps')
      .then(function (data) {
        _comps = data.comps || [];
        _overrides = data.overrides || {};
        _loaded = true;
        // Auto-run CMA if address exists and no comps saved yet
        if (_comps.length === 0 && _prospect && _prospect.property_address) {
          _runAutoCMA(el);
        } else {
          _renderFull(el);
        }
      })
      .catch(function () {
        _comps = [];
        _overrides = {};
        _loaded = true;
        // Still try auto-CMA on load
        if (_prospect && _prospect.property_address) {
          _runAutoCMA(el);
        } else {
          _renderFull(el);
        }
      });
  }

  // ── Auto-CMA: triggered when address is populated ─────────────────────
  function _runAutoCMA(el) {
    if (!_prospect || !_prospect.property_address) {
      _renderFull(el || _el);
      return;
    }
    if (el) {
      el.innerHTML = '<div class="flex items-center justify-center py-8">' +
        '<i class="fas fa-search fa-spin text-gold text-xl"></i>' +
        '<span class="text-sm text-gray-500 ml-2">Running rental CMA for ' + E(_prospect.property_address) + '...</span></div>';
    }

    MallanAPI._fetch('/api/crm/cma', {
      method: 'POST',
      body: JSON.stringify({
        property_address: _prospect.property_address,
        borough: _prospect.borough || '',
        neighborhood: _prospect.neighborhood || '',
        listing_type: 'rent',
        property_type: _prospect.property_type || '',
        bedrooms: _prospect.bedrooms != null ? Number(_prospect.bedrooms) : undefined,
        bathrooms: _prospect.bathrooms != null ? Number(_prospect.bathrooms) : undefined,
        living_area: _prospect.sqft ? Number(_prospect.sqft) : undefined,
      })
    })
      .then(function (data) {
        _cmaReport = data;
        // Import comps from CMA if we have none
        if (_comps.length === 0 && data.item && data.item.comps) {
          var cmaComps = data.item.comps;
          if (Array.isArray(cmaComps)) {
            cmaComps.forEach(function (c) {
              _comps.push({
                mls_id: c.listing_id || c.mls_id || '',
                address: c.address || '',
                unit: c.unit || '',
                close_price: c.close_price || c.list_price || 0,
                beds: c.bedrooms || 0,
                baths: c.bathrooms || 0,
                sqft: c.living_area || 0,
                close_date: c.close_date || c.on_market_date || '',
                note: '',
                added_at: new Date().toISOString(),
                source: 'auto-cma',
              });
            });
          }
        }
        CRM.toast('Rental CMA complete — ' + _comps.length + ' comps found', 'success');
        _renderFull(el || _el);
      })
      .catch(function (err) {
        CRM.toast('CMA failed: ' + (err.message || 'Unknown error'), 'error');
        _renderFull(el || _el);
      });
  }

  // ── Full render ────────────────────────────────────────────────────────
  function _renderFull(el) {
    var p = _prospect;
    if (!p) return;

    var h = '<div class="space-y-5">';

    // Opt-out notice
    if (p.consent_opt_out_at) {
      h += '<div class="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">' +
        '<i class="fas fa-ban text-red-500"></i>' +
        '<span class="text-xs font-semibold text-red-700">This prospect has unsubscribed from emails (' +
        E(new Date(p.consent_opt_out_at).toLocaleDateString()) + '). Do not send.</span></div>';
    }

    // CMA status bar
    if (_cmaReport && _cmaReport.valuation) {
      var v = _cmaReport.valuation;
      h += '<div class="p-3 bg-green-50 border border-green-200 rounded-lg">';
      h += '<div class="flex items-center justify-between">';
      h += '<div class="text-xs font-semibold text-green-800"><i class="fas fa-chart-line mr-1"></i>Auto-CMA Result</div>';
      h += '<button class="text-xs text-green-600 hover:text-green-800 underline" onclick="RentalPitchPacket._runCMA()">Re-run CMA</button>';
      h += '</div>';
      h += '<div class="flex gap-4 mt-2 text-sm">';
      h += '<span class="text-green-700">Est. Rent: <strong>' + $(v.estimated || 0) + '/mo</strong></span>';
      if (v.low && v.high) h += '<span class="text-green-600">Range: ' + $(v.low) + ' – ' + $(v.high) + '/mo</span>';
      h += '</div></div>';
    } else if (!_cmaReport && p.property_address) {
      h += '<div class="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">';
      h += '<span class="text-xs text-blue-700"><i class="fas fa-info-circle mr-1"></i>Address detected. Run CMA to find rental comps automatically.</span>';
      h += '<button class="btn btn-sm btn-outline" onclick="RentalPitchPacket._runCMA()">' +
        '<i class="fas fa-search mr-1"></i>Run CMA</button>';
      h += '</div>';
    }

    // Section A: Comp Manager
    h += _renderCompManager();

    // Section B: Rental Financials (only if comps exist)
    if (_comps.length > 0) {
      h += _renderFinancials();
    }

    // Section C: Actions
    h += _renderActions();

    h += '</div>';
    el.innerHTML = h;
  }

  // =====================================================================
  // SECTION A: COMP MANAGER
  // =====================================================================
  function _renderCompManager() {
    var h = '<div class="bg-white border border-gray-200 rounded-xl p-5">';

    h += '<div class="flex items-center justify-between flex-wrap gap-3 mb-4">';
    h += '<h4 class="text-sm font-bold text-gray-900">' +
      '<i class="fas fa-balance-scale text-gold mr-2"></i>Rental Comps (' + _comps.length + ' selected)</h4>';
    h += '<div class="flex gap-2">';
    h += '<button class="btn btn-sm btn-outline" onclick="RentalPitchPacket._toggleSearch()">' +
      '<i class="fas fa-search mr-1"></i>' + (_searchOpen ? 'Close Search' : 'Search & Add') + '</button>';
    if (_comps.length > 0) {
      h += '<button class="btn btn-sm btn-gold" onclick="RentalPitchPacket._saveComps()">' +
        '<i class="fas fa-save mr-1"></i>Save Comps</button>';
    }
    h += '</div></div>';

    if (_searchOpen) {
      h += _renderSearchBar();
    }

    if (_comps.length > 0) {
      h += _renderCompTable();
    } else {
      h += '<div class="text-center py-10 bg-gray-50 rounded-lg">' +
        '<i class="fas fa-search text-3xl text-gray-300 mb-3"></i>' +
        '<p class="text-sm text-gray-600 font-semibold">No rental comps selected</p>' +
        '<p class="text-xs text-gray-400 mt-1">Enter a property address to auto-run CMA, or search manually.</p></div>';
    }

    h += '</div>';
    return h;
  }

  function _renderSearchBar() {
    var h = '<div class="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">';
    h += '<div class="flex gap-2">';
    h += '<input id="rpp-comp-search" type="text" class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" ' +
      'placeholder="Search rentals by address or MLS ID..." ' +
      'onkeydown="if(event.key===\'Enter\'){RentalPitchPacket._search();}">';
    h += '<button class="btn btn-sm btn-gold" onclick="RentalPitchPacket._search()">' +
      '<i class="fas fa-search mr-1"></i>Search</button>';
    h += '</div>';

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
        h += '<span>' + (r.list_price ? $(r.list_price) + '/mo' : '-') + '</span>';
        h += '<span>' + (r.beds || '-') + 'bd/' + (r.baths || '-') + 'ba</span>';
        h += '<span>' + (r.sqft ? Number(r.sqft).toLocaleString() + ' sqft' : '-') + '</span>';
        if (r.mls_id) h += '<span class="text-gray-400">' + E(r.mls_id) + '</span>';
        h += '</div></div>';
        if (alreadyAdded) {
          h += '<span class="text-xs text-green-600 font-semibold ml-3"><i class="fas fa-check mr-1"></i>Added</span>';
        } else {
          h += '<button class="btn btn-sm btn-outline ml-3" onclick="RentalPitchPacket._addComp(' + i + ')">' +
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
    h += '<th class="px-3 py-2 text-right">Rent</th>';
    h += '<th class="px-3 py-2 text-center">Beds/Baths</th>';
    h += '<th class="px-3 py-2 text-right">Sqft</th>';
    h += '<th class="px-3 py-2 text-right">$/Sqft</th>';
    h += '<th class="px-3 py-2 text-left">Note</th>';
    h += '<th class="px-3 py-2 text-center" style="width:40px;"></th>';
    h += '</tr></thead><tbody>';

    _comps.forEach(function (c, i) {
      var rent = c.close_price || c.list_price || 0;
      var psf = (rent && c.sqft && Number(c.sqft) > 0) ? (rent / Number(c.sqft)).toFixed(2) : '-';
      h += '<tr class="border-b border-gray-100 hover:bg-gray-50">';
      h += '<td class="px-3 py-2 font-medium">' + E(c.address || '-') +
        (c.unit ? ' #' + E(c.unit) : '') +
        (c.mls_id ? '<br><span class="text-[10px] text-gray-400">' + E(c.mls_id) + '</span>' : '') + '</td>';
      h += '<td class="px-3 py-2 text-right font-semibold text-green-700">' +
        (rent ? $(rent) + '/mo' : '-') + '</td>';
      h += '<td class="px-3 py-2 text-center">' + (c.beds || '-') + '/' + (c.baths || '-') + '</td>';
      h += '<td class="px-3 py-2 text-right">' + (c.sqft ? Number(c.sqft).toLocaleString() : '-') + '</td>';
      h += '<td class="px-3 py-2 text-right">' + (psf !== '-' ? '$' + psf : '-') + '</td>';
      h += '<td class="px-3 py-2">' +
        '<input type="text" class="border border-gray-200 rounded px-2 py-1 text-xs w-full" ' +
        'value="' + E(c.note || '') + '" placeholder="Add note..." ' +
        'onchange="RentalPitchPacket._updateNote(' + i + ', this.value)"></td>';
      h += '<td class="px-3 py-2 text-center">' +
        '<button class="text-red-400 hover:text-red-600" title="Remove comp" ' +
        'onclick="RentalPitchPacket._removeComp(' + i + ')">' +
        '<i class="fas fa-trash-alt"></i></button></td>';
      h += '</tr>';
    });

    h += '</tbody></table></div>';

    // Median $/sqft summary
    var medianPsf = _calcMedianRentPsf();
    if (medianPsf > 0) {
      var prospectSqft = Number(_prospect.sqft) || 0;
      var estimatedRent = prospectSqft > 0 ? Math.round(medianPsf * prospectSqft) : 0;
      h += '<div class="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">';
      h += '<div class="text-xs text-amber-800">' +
        '<strong>Median rent $/sqft from comps:</strong> $' + medianPsf.toFixed(2) + '/sqft/mo';
      if (prospectSqft > 0) {
        h += ' &times; ' + Number(prospectSqft).toLocaleString() + ' sqft = <strong>' + $(estimatedRent) + '/mo</strong>';
      }
      h += '</div></div>';
    }

    return h;
  }

  // =====================================================================
  // SECTION B: RENTAL FINANCIALS
  // =====================================================================
  function _renderFinancials() {
    var medianPsf = _calcMedianRentPsf();
    var prospectSqft = Number(_prospect.sqft) || 0;
    var calcRent = (medianPsf > 0 && prospectSqft > 0) ? Math.round(medianPsf * prospectSqft) : 0;

    var estRent = Number(_overrides.estimated_rent) || calcRent;
    var brokerFee = _overrides.broker_fee != null ? Number(_overrides.broker_fee) : 15;
    var vacancyRate = _overrides.vacancy_rate != null ? Number(_overrides.vacancy_rate) : 5;

    var annualRent = estRent * 12;
    var vacancyLoss = Math.round(annualRent * (vacancyRate / 100));
    var effectiveGross = annualRent - vacancyLoss;
    var brokerFeeAmt = Math.round(estRent * (brokerFee / 100));

    var h = '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h4 class="text-sm font-bold text-gray-900 mb-4">' +
      '<i class="fas fa-calculator text-gold mr-2"></i>Rental Financials</h4>';

    // Editable fields
    h += '<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">';

    h += '<div>';
    h += '<label class="text-xs font-semibold text-gray-700 block mb-1">Estimated Monthly Rent</label>';
    h += '<div class="relative">';
    h += '<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>';
    h += '<input type="number" class="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm font-semibold" ' +
      'value="' + (estRent || '') + '" ' +
      'onchange="RentalPitchPacket._updateOverride(\'estimated_rent\', this.value)" ' +
      'placeholder="' + (calcRent > 0 ? calcRent : 'Enter amount') + '">';
    h += '</div>';
    if (calcRent > 0 && estRent !== calcRent) {
      h += '<div class="text-[10px] text-gray-400 mt-1">From comps: ' + $(calcRent) + '/mo</div>';
    }
    h += '</div>';

    h += '<div>';
    h += '<label class="text-xs font-semibold text-gray-700 block mb-1">Broker Fee</label>';
    h += '<div class="relative">';
    h += '<input type="number" step="1" min="0" max="100" ' +
      'class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" ' +
      'value="' + brokerFee + '" ' +
      'onchange="RentalPitchPacket._updateOverride(\'broker_fee\', this.value)">';
    h += '<span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>';
    h += '</div></div>';

    h += '<div>';
    h += '<label class="text-xs font-semibold text-gray-700 block mb-1">Vacancy Rate</label>';
    h += '<div class="relative">';
    h += '<input type="number" step="1" min="0" max="50" ' +
      'class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" ' +
      'value="' + vacancyRate + '" ' +
      'onchange="RentalPitchPacket._updateOverride(\'vacancy_rate\', this.value)">';
    h += '<span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>';
    h += '</div></div>';

    h += '</div>';

    // Breakdown
    h += '<div class="bg-gray-50 rounded-lg p-4">';
    h += '<div class="space-y-2">';
    h += _lineItem('Monthly Rent (Estimated)', $(estRent) + '/mo', 'text-gray-900 font-bold');
    h += _lineItem('Annual Gross Rent', $(annualRent), 'text-gray-700');
    h += _lineItem('Vacancy Loss (' + vacancyRate + '%)', '- ' + $(vacancyLoss), 'text-red-600');
    h += '<div class="border-t border-gray-300 pt-2 mt-2">';
    h += _lineItem('Effective Gross Income', $(effectiveGross) + '/yr', 'text-green-700 font-bold');
    h += '</div>';
    h += '<div class="border-t border-gray-200 pt-2 mt-2">';
    h += _lineItem('Broker Fee (' + brokerFee + '% of 1 month)', $(brokerFeeAmt), 'text-amber-700');
    h += '</div>';
    h += '</div></div>';

    h += '<p class="text-[10px] text-gray-400 mt-3">Rental analysis based on comparable leased and listed properties. ' +
      'Broker fee is percentage of one month rent. Actual terms may vary by agreement.</p>';

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

    var h = '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h4 class="text-sm font-bold text-gray-900 mb-4">' +
      '<i class="fas fa-paper-plane text-gold mr-2"></i>Outreach Actions</h4>';

    h += '<div class="flex flex-wrap gap-3 mb-4">';

    h += '<button class="btn btn-sm btn-gold' + (!hasEmail ? ' opacity-50 cursor-not-allowed' : '') + '" ' +
      (hasEmail
        ? 'onclick="RentalPitchPacket._sendPitch(\'' + pid + '\')"'
        : 'disabled title="No email on file"') + '>' +
      '<i class="fas fa-paper-plane mr-1"></i>Send Rental Pitch</button>';

    h += '<button class="btn btn-sm btn-outline" onclick="RentalPitchPacket._runCMA()">' +
      '<i class="fas fa-sync-alt mr-1"></i>Re-run CMA</button>';

    h += '</div>';

    if (p.pitch_sent_at) {
      h += '<div class="mb-3"><span class="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">' +
        '<i class="fas fa-paper-plane"></i> Pitch sent: ' + E(D(p.pitch_sent_at)) + '</span></div>';
    }
    if (!hasEmail) {
      h += '<div class="text-xs text-gray-400 italic"><i class="fas fa-info-circle mr-1"></i>' +
        'Add an email address on the Overview tab to enable email outreach.</div>';
    }

    h += '<div class="text-[10px] text-gray-400 mt-4 pt-3 border-t border-gray-100">' +
      'Based on information from the REBNY Listing Service. Data believed reliable but not guaranteed. ' +
      'Licensed to Mallan Real Estate Inc. | Brokerage #10991205323</div>';

    h += '</div>';
    return h;
  }

  // =====================================================================
  // HELPERS
  // =====================================================================
  function _lineItem(label, value, cls) {
    return '<div class="flex justify-between items-baseline py-1">' +
      '<span class="text-xs text-gray-600">' + E(label) + '</span>' +
      '<span class="text-xs ' + (cls || '') + '">' + E(value || '\u2014') + '</span></div>';
  }

  function _calcMedianRentPsf() {
    var vals = [];
    _comps.forEach(function (c) {
      var rent = c.close_price || c.list_price || 0;
      if (rent && c.sqft && Number(c.sqft) > 0) {
        vals.push(rent / Number(c.sqft));
      }
    });
    if (vals.length === 0) return 0;
    vals.sort(function (a, b) { return a - b; });
    var mid = Math.floor(vals.length / 2);
    return vals.length % 2 !== 0 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
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
    var input = document.getElementById('rpp-comp-search');
    var q = input ? input.value.trim() : '';
    if (!q) return;

    CRM.toast('Searching rental comps...', 'info');
    // Use the listings API to search rentals
    MallanAPI._fetch('/api/listings?type=rent&address=' + encodeURIComponent(q) + '&limit=10')
      .then(function (data) {
        _searchResults = (data.listings || []).map(function (l) {
          return {
            mls_id: l.id || l.mlsId || '',
            address: l.address ? (l.address.streetNumber + ' ' + l.address.streetName) : '',
            unit: l.address ? (l.address.unitNumber || '') : '',
            list_price: l.listPrice || 0,
            beds: l.bedroomsTotal || 0,
            baths: l.bathroomsFull || 0,
            sqft: l.livingArea || 0,
          };
        });
        if (_searchResults.length === 0) {
          CRM.toast('No rental results for "' + q + '"', 'info');
        }
        _renderFull(_el);
        var newInput = document.getElementById('rpp-comp-search');
        if (newInput) newInput.value = q;
      })
      .catch(function (err) {
        CRM.toast('Search failed: ' + (err.message || ''), 'error');
      });
  }

  function _addComp(idx) {
    var comp = _searchResults[idx];
    if (!comp) return;
    var exists = _comps.some(function (c) { return c.mls_id === comp.mls_id; });
    if (exists) { CRM.toast('Comp already added', 'info'); return; }
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
    if (idx >= 0 && idx < _comps.length) _comps[idx].note = value;
  }

  function _updateOverride(key, value) {
    _overrides[key] = Number(value) || 0;
    _renderFull(_el);
  }

  function _saveComps() {
    if (!_prospect) return;
    CRM.toast('Saving rental comps...', 'info');
    MallanAPI._fetch('/api/crm/sales/prospects/' + _prospect.id + '/comps', {
      method: 'POST',
      body: JSON.stringify({ comps: _comps, overrides: _overrides })
    })
      .then(function () { CRM.toast('Comps saved', 'success'); })
      .catch(function (err) { CRM.toast('Save failed: ' + (err.message || ''), 'error'); });
  }

  function _runCMA() {
    _runAutoCMA(_el);
  }

  function _sendPitch(id) {
    if (!confirm('Send the rental pitch packet to this prospect via email?')) return;
    CRM.toast('Sending rental pitch...', 'info');

    MallanAPI._fetch('/api/crm/sales/prospects/' + id + '/send-packet', { method: 'POST' })
      .then(function (data) {
        CRM.toast('Rental pitch sent to ' + (data.sent_to || 'prospect'), 'success');
        if (_prospect) _prospect.pitch_sent_at = new Date().toISOString();
        _renderFull(_el);
      })
      .catch(function (err) {
        CRM.toast('Send failed: ' + (err.message || ''), 'error');
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
    _sendPitch: _sendPitch,
    _toggleSearch: _toggleSearch,
    _runCMA: _runCMA,
  };
})();
