// ═══════════════════════════════════════════════════════════════════════════════
// OFF-MARKET SCANNER — Read-only ranked queue of corridor seller-intent prospects
//
// Surfaces the output of `npm run scanner:build-prospects`. Reads from
// /api/crm/scanner/prospects. Each row carries score, confidence, signal
// reasons, and an audit-trail source URL per reason.
//
// Compliance: every prospect passes through isSuppressed() before display
// (server-side). Suppressed prospects are hidden by default. Refresh cadence
// is operator-controlled (run scanner:build-prospects after upstream ingests).
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, Router, MallanAPI, Utils */

var OffMarketScanner = (function () {
  'use strict';

  var E = (Utils && Utils.esc) ? Utils.esc : function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };

  var _s = {
    prospects: [],
    total: 0,
    manifest: null,
    confidence: 'all',
    bbl: '',
    loaded: false,
    loading: false,
    error: null,
  };

  var CONFIDENCE_BADGES = {
    high:   { label: 'High',    color: '#059669', bg: '#ECFDF5' },
    medium: { label: 'Medium',  color: '#F59E0B', bg: '#FFFBEB' },
    low:    { label: 'Low',     color: '#6B7280', bg: '#F3F4F6' },
    below_threshold: { label: 'Below', color: '#9CA3AF', bg: '#F9FAFB' },
  };

  var SIGNAL_LABELS = {
    lis_pendens:                { label: 'Lis pendens',           color: '#DC2626', icon: 'fa-gavel' },
    foreclosure:                { label: 'Foreclosure',           color: '#DC2626', icon: 'fa-gavel' },
    tax_lien:                   { label: 'Tax lien',              color: '#EA580C', icon: 'fa-money-bill' },
    estate:                     { label: 'Estate transfer',       color: '#7C3AED', icon: 'fa-scroll' },
    off_market_expired:         { label: 'Listing expired',       color: '#0891B2', icon: 'fa-clock' },
    off_market_relist_boost:    { label: 'Repeat re-list',        color: '#0891B2', icon: 'fa-redo' },
    long_ownership_25y:         { label: '25+ year owner',        color: '#1F2937', icon: 'fa-history' },
    long_ownership_40y:         { label: '40+ year owner',        color: '#1F2937', icon: 'fa-history' },
    recent_purchase_penalty:    { label: 'Recent purchase',       color: '#9CA3AF', icon: 'fa-arrow-down' },
    dissolved_llc:              { label: 'Dissolved LLC',         color: '#DC2626', icon: 'fa-building' },
    absentee_owner:             { label: 'Absentee',              color: '#0891B2', icon: 'fa-plane-departure' },
    dof_tax_lien_sale:          { label: 'DOF lien sale',         color: '#DC2626', icon: 'fa-file-invoice-dollar' },
    convergence_boost:          { label: 'Multi-source',          color: '#B8860B', icon: 'fa-layer-group' },
  };

  function _fetchProspects() {
    _s.loading = true;
    _s.error = null;
    var qs = new URLSearchParams();
    qs.set('limit', '200');
    if (_s.confidence !== 'all') qs.set('confidence', _s.confidence);
    if (_s.bbl) qs.set('bbl', _s.bbl);

    var fetcher = (typeof MallanAPI !== 'undefined' && MallanAPI._fetch)
      ? MallanAPI._fetch('/api/crm/scanner/prospects?' + qs.toString())
      : fetch('/api/crm/scanner/prospects?' + qs.toString(), { credentials: 'include' }).then(function (r) { return r.json(); });

    return fetcher.then(function (data) {
      _s.prospects = (data && data.prospects) || [];
      _s.total = (data && data.total) || 0;
      _s.manifest = (data && data.manifest) || null;
      _s.loaded = true;
      _s.loading = false;
    }).catch(function (err) {
      _s.error = (err && err.message) || String(err);
      _s.loading = false;
    });
  }

  function render(container) {
    var c = (typeof container === 'string') ? document.getElementById(container) : container;
    if (!c) return;
    c.innerHTML = _shell();
    if (!_s.loaded) {
      _fetchProspects().then(function () { render(container); });
    }
    _bindHandlers(c);
  }

  function _shell() {
    var html = '<div class="max-w-6xl mx-auto p-6">';
    html += _header();
    html += '<div id="scannerBody" class="space-y-3">';
    if (_s.loading) html += _loading();
    else if (_s.error) html += _errorPanel();
    else if (_s.prospects.length === 0) html += _emptyState();
    else html += _table();
    html += '</div></div>';
    return html;
  }

  function _header() {
    var manifest = _s.manifest || {};
    var aggregate = manifest.aggregate || {};
    var output = manifest.output || {};
    var generatedAt = manifest.run_finished ? new Date(manifest.run_finished).toLocaleString() : 'never';
    var html = '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4">';
    html += '<div class="flex items-center justify-between mb-4">';
    html += '<div>';
    html += '<h1 class="text-xl font-bold text-gray-900">Off-Market Scanner</h1>';
    html += '<p class="text-xs text-gray-500 mt-1">Manhattan luxury corridor · Last refresh: ' + E(generatedAt) + '</p>';
    html += '</div>';
    html += '<div class="text-xs text-gray-600 text-right">';
    html += '<div><strong>' + Number(_s.total) + '</strong> in queue</div>';
    if (output.suppressed) html += '<div>' + Number(output.suppressed) + ' suppressed</div>';
    html += '</div></div>';

    // Filter row
    html += '<div class="flex gap-2 items-center">';
    html += '<select id="scannerConfFilter" class="form-input form-select text-sm" style="width:auto">';
    ['all', 'high', 'medium', 'low'].forEach(function (k) {
      var sel = (_s.confidence === k) ? ' selected' : '';
      html += '<option value="' + k + '"' + sel + '>' + k + '</option>';
    });
    html += '</select>';
    html += '<input id="scannerBblFilter" type="text" value="' + E(_s.bbl) + '" placeholder="Filter BBL…" class="form-input text-sm" style="width:200px">';
    html += '<button id="scannerRefresh" class="btn btn-sm btn-outline" type="button"><i class="fas fa-sync-alt mr-1"></i> Refresh</button>';
    html += '</div>';

    // Aggregate stats
    if (aggregate.prospects_built) {
      html += '<div class="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">';
      html += _statCard('Built', aggregate.prospects_built);
      html += _statCard('With ACRIS', aggregate.prospects_with_acris);
      html += _statCard('With off-market', aggregate.prospects_with_off_market);
      html += _statCard('Dissolved LLC', aggregate.prospects_dissolved_llc);
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function _statCard(label, value) {
    return '<div class="bg-gray-50 rounded-lg border border-gray-100 p-3">'
      + '<div class="text-[10px] uppercase tracking-wide text-gray-500 font-bold">' + E(label) + '</div>'
      + '<div class="text-lg font-bold text-gray-900">' + Number(value || 0).toLocaleString() + '</div>'
      + '</div>';
  }

  function _table() {
    var html = '<div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">';
    html += '<div class="overflow-x-auto"><table class="min-w-full text-sm">';
    html += '<thead class="bg-gray-50 border-b border-gray-200">';
    html += '<tr>';
    html += '<th class="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide">Rank</th>';
    html += '<th class="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide">Score</th>';
    html += '<th class="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide">BBL · Address · Owner</th>';
    html += '<th class="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide">Signals</th>';
    html += '<th class="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wide">Confidence</th>';
    html += '</tr></thead><tbody>';
    _s.prospects.forEach(function (p, idx) {
      html += _row(p, idx + 1);
    });
    html += '</tbody></table></div></div>';
    return html;
  }

  function _row(p, rank) {
    var bgConf = (CONFIDENCE_BADGES[p.confidence] || CONFIDENCE_BADGES.low);
    var address = '';
    var owner = '';
    if (p.reasons && p.reasons.length) {
      // We don't have address/owner directly on ScoredProspect — but the
      // build-prospects CSV emits them. The JSON endpoint also exposes
      // them via the surrounding aggregate. For v0 we render BBL only;
      // a follow-up will denormalize address/owner into ScoredProspect.
    }
    var rowOnclick = ' onclick="OffMarketScanner._openDetail(\'' + E(p.bbl) + '\')" ';
    var html = '<tr class="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"' + rowOnclick + '>';
    html += '<td class="px-4 py-3 text-gray-500 font-bold">' + rank + '</td>';
    html += '<td class="px-4 py-3"><span class="text-lg font-bold text-gray-900">' + Number(p.score).toFixed(1) + '</span>';
    html += '<span class="text-[10px] text-gray-400 block">/ 100</span></td>';
    html += '<td class="px-4 py-3"><div class="font-mono text-xs text-gray-700">' + E(p.bbl) + '</div>';
    if (address) html += '<div class="text-xs text-gray-600">' + E(address) + '</div>';
    if (owner) html += '<div class="text-[11px] text-gray-500">' + E(owner) + '</div>';
    html += '</td>';
    html += '<td class="px-4 py-3"><div class="flex flex-wrap gap-1">';
    (p.reasons || []).forEach(function (r) {
      var meta = SIGNAL_LABELS[r.signal] || { label: r.signal, color: '#6B7280', icon: 'fa-circle' };
      html += '<span class="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium" '
        + 'style="background:' + meta.color + '15;color:' + meta.color + '" '
        + 'title="' + E(r.detail || '') + '">'
        + '<i class="fas ' + meta.icon + ' mr-1"></i>' + E(meta.label)
        + '</span>';
    });
    html += '</div></td>';
    html += '<td class="px-4 py-3"><span class="inline-block px-2 py-1 rounded-full text-[11px] font-bold" '
      + 'style="background:' + bgConf.bg + ';color:' + bgConf.color + '">'
      + E(bgConf.label) + '</span></td>';
    html += '</tr>';
    return html;
  }

  function _loading() {
    return '<div class="bg-white rounded-2xl border border-gray-200 p-12 text-center">'
      + '<i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i>'
      + '<p class="mt-3 text-sm text-gray-500">Loading scanner queue…</p></div>';
  }

  function _errorPanel() {
    return '<div class="bg-red-50 border border-red-200 rounded-2xl p-6">'
      + '<i class="fas fa-exclamation-triangle text-red-600 mr-2"></i>'
      + '<strong>Scanner error:</strong> ' + E(_s.error) + '</div>';
  }

  function _emptyState() {
    return '<div class="bg-white rounded-2xl border border-gray-200 p-12 text-center">'
      + '<i class="fas fa-radar text-3xl text-gray-300 mb-3"></i>'
      + '<p class="text-sm text-gray-600 font-semibold">No prospects in queue</p>'
      + '<p class="text-xs text-gray-500 mt-2 max-w-md mx-auto">'
      + 'Run <code class="bg-gray-100 px-2 py-1 rounded">npm run scanner:build-prospects</code> '
      + 'after refreshing PLUTO + ACRIS + DOS Corp + DOF tax-lien ingests. '
      + 'Then come back and click Refresh.</p></div>';
  }

  function _bindHandlers(c) {
    var conf = c.querySelector('#scannerConfFilter');
    if (conf) conf.addEventListener('change', function (e) {
      _s.confidence = e.target.value;
      _s.loaded = false;
      render(c);
    });
    var bbl = c.querySelector('#scannerBblFilter');
    if (bbl) bbl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        _s.bbl = e.target.value.trim();
        _s.loaded = false;
        render(c);
      }
    });
    var refresh = c.querySelector('#scannerRefresh');
    if (refresh) refresh.addEventListener('click', function () {
      _s.loaded = false;
      render(c);
    });
  }

  function _openDetail(bbl) {
    var p = _s.prospects.find(function (x) { return x.bbl === bbl; });
    if (!p) return;
    var html = '<div class="space-y-3 text-sm">';
    html += '<div class="text-2xl font-bold">Score ' + Number(p.score).toFixed(1) + ' / 100</div>';
    html += '<div class="text-xs text-gray-500">BBL ' + E(p.bbl) + ' · ' + E(p.confidence) + ' confidence</div>';
    html += '<hr class="my-3">';
    html += '<div class="font-bold text-gray-700 mb-2">Why this score:</div>';
    (p.reasons || []).forEach(function (r) {
      var meta = SIGNAL_LABELS[r.signal] || { label: r.signal, color: '#6B7280' };
      html += '<div class="border border-gray-200 rounded-lg p-3">';
      html += '<div class="flex items-center justify-between">';
      html += '<span class="font-bold" style="color:' + meta.color + '">' + E(meta.label) + '</span>';
      html += '<span class="text-xs text-gray-500">+' + Number(r.contribution).toFixed(1) + 'pt</span>';
      html += '</div>';
      html += '<div class="text-xs text-gray-700 mt-1">' + E(r.detail || '') + '</div>';
      if (r.source_url) html += '<div class="text-[11px] mt-1"><a href="' + E(r.source_url) + '" target="_blank" rel="noopener" class="text-blue-600 hover:underline">Source: ' + E(r.source) + '</a></div>';
      else html += '<div class="text-[11px] text-gray-400 mt-1">Source: ' + E(r.source) + '</div>';
      html += '</div>';
    });
    if (p.suppressed) {
      html += '<div class="bg-red-50 border border-red-200 rounded-lg p-3 mt-3">';
      html += '<div class="font-bold text-red-700">SUPPRESSED — Outreach blocked</div>';
      html += '<div class="text-xs text-red-600 mt-1">' + E((p.suppression_reasons || []).join('; ')) + '</div>';
      html += '</div>';
    }
    html += '</div>';
    if (typeof Utils !== 'undefined' && Utils.openModal) {
      Utils.openModal('Off-Market Scanner — BBL ' + p.bbl, html);
    } else {
      // Fallback — alert is ugly but functional
      window.alert('Score ' + p.score + ' for BBL ' + p.bbl + ': ' + (p.reasons || []).map(function (r) { return r.signal; }).join(', '));
    }
  }

  return {
    render: render,
    refresh: function () { _s.loaded = false; },
    _openDetail: _openDetail,
  };
})();
