// ═══════════════════════════════════════════════════════════════════════════════
// PITCH PACKET — loads real data from API, displays pricing/comps/financials
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, MallanAPI, Utils, SellerProspects */

var PitchPacket = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var _data = null; // cached pitch packet data

  function render(el, prospect) {
    var p = prospect;
    var hasEmail = !!p.owner_email;
    var h = '<div class="space-y-4">';

    // Header + action buttons
    h += '<div class="flex items-center justify-between flex-wrap gap-3">';
    h += '<h3 class="text-sm font-bold text-gray-900"><i class="fas fa-file-powerpoint text-gold mr-2"></i>Pitch Packet for ' + E(p.owner_name || p.address || '-') + '</h3>';
    h += '<div class="flex gap-2">';
    h += '<button class="btn btn-sm btn-gold" onclick="PitchPacket._generate(\'' + E(String(p.id)) + '\')"><i class="fas fa-sync-alt mr-1"></i>Generate / Refresh</button>';
    h += '<button class="btn btn-sm btn-outline" onclick="PitchPacket._download(\'' + E(String(p.id)) + '\')"><i class="fas fa-download mr-1"></i>PDF</button>';
    if (hasEmail) {
      h += '<button class="btn btn-sm btn-outline" onclick="PitchPacket._send(\'' + E(String(p.id)) + '\')"><i class="fas fa-paper-plane mr-1"></i>Send to ' + E(p.owner_email) + '</button>';
    }
    h += '</div></div>';

    // Opt-out notice
    if (p.consent_opt_out_at) {
      h += '<div class="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">';
      h += '<i class="fas fa-ban text-red-500"></i>';
      h += '<span class="text-xs font-semibold text-red-700">This prospect has unsubscribed from emails (' + E(new Date(p.consent_opt_out_at).toLocaleDateString()) + '). Do not send.</span>';
      h += '</div>';
    }

    // Data area — show cached data or prompt to generate
    h += '<div id="pitch-data-area">';
    if (_data && _data.prospect_id === String(p.id)) {
      h += _renderData(_data);
    } else if (p.pitch_generated_at) {
      // Previously generated — auto-load
      h += '<div class="flex items-center justify-center py-8"><i class="fas fa-spinner fa-spin text-gold text-xl"></i></div>';
      setTimeout(function () { PitchPacket._generate(String(p.id)); }, 100);
    } else {
      h += '<div class="text-center py-12 bg-gray-50 rounded-xl">';
      h += '<i class="fas fa-chart-bar text-3xl text-gray-300 mb-3"></i>';
      h += '<p class="text-sm text-gray-600 font-semibold">Click "Generate / Refresh" to build the pitch packet</p>';
      h += '<p class="text-xs text-gray-400 mt-1">Pulls comps from Trestle, calculates pricing, counts active buyers</p>';
      h += '</div>';
    }
    h += '</div>';

    // Sent status
    if (p.pitch_sent_at) {
      h += '<div class="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">';
      h += '<i class="fas fa-paper-plane text-blue-500"></i>';
      h += '<span class="text-xs font-semibold text-blue-700">Last sent: ' + E(new Date(p.pitch_sent_at).toLocaleDateString()) + '</span>';
      h += '</div>';
    }

    h += '</div>';
    el.innerHTML = h;
  }

  function _renderData(d) {
    var ps = d.pricing_strategy || {};
    var pp = ps.price_points || {};
    var fi = d.financial_picture || {};
    var ex = d.exposure_plan || {};
    var pi = d.property_intel || {};
    var sales = pi.recent_sales || [];
    var competition = pi.active_competition || [];

    var h = '';

    // ── Pricing Strategy ──
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h4 class="text-sm font-bold text-gray-900 mb-4"><i class="fas fa-tags text-gold mr-2"></i>Pricing Strategy</h4>';

    if (pp.recommended) {
      h += '<div class="grid grid-cols-3 gap-3 mb-4">';
      h += _priceCard('Conservative', pp.conservative_label || $(pp.conservative), '#6B7280');
      h += _priceCard('Recommended', pp.recommended_label || $(pp.recommended), '#B8860B', true);
      h += _priceCard('Aspirational', pp.aspirational_label || $(pp.aspirational), '#3B82F6');
      h += '</div>';
    } else {
      h += '<p class="text-xs text-gray-400 italic">No pricing data — run Research first to populate ACRIS/DOF values, or comps were not found.</p>';
    }

    h += '<div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">';
    h += _statBox(ps.closed_12mo_count || 0, 'Closed (12mo)', '#059669');
    h += _statBox(ps.competition ? ps.competition.active_count : 0, 'Active Competition', '#F59E0B');
    h += _statBox(ps.comps_used || 0, 'Comps Used', '#3B82F6');
    h += _statBox(ps.absorption_rate || '—', 'Months Inventory', '#8B5CF6');
    h += '</div>';

    if (ps.competition && ps.competition.price_range_label) {
      h += '<div class="text-xs text-gray-500 mt-2"><i class="fas fa-chart-line mr-1"></i>Competition price range: <strong>' + E(ps.competition.price_range_label) + '</strong></div>';
    }
    h += '</div>';

    // ── Financial Picture (Net Proceeds) ──
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h4 class="text-sm font-bold text-gray-900 mb-4"><i class="fas fa-calculator text-gold mr-2"></i>Net Proceeds Estimate</h4>';

    if (fi.gross_price) {
      h += '<div class="space-y-2">';
      h += _lineItem('Sale Price', fi.gross_label, 'text-gray-900 font-bold');
      h += _lineItem('Commission (' + Math.round(fi.commission_rate * 100) + '%)', '- ' + fi.commission_label, 'text-red-600');
      h += _lineItem('Transfer Tax (' + (fi.transfer_tax_rate * 100).toFixed(2) + '%)', '- ' + fi.transfer_tax_label, 'text-red-600');
      h += _lineItem('Attorney Fees', '- ' + fi.attorney_fees_label, 'text-red-600');
      if (fi.mortgage_payoff > 0) {
        h += _lineItem('Mortgage Payoff', '- ' + fi.mortgage_payoff_label, 'text-red-600');
      }
      h += '<div class="border-t border-gray-200 pt-2 mt-2">';
      h += _lineItem('Estimated Net Proceeds', fi.net_proceeds_label, fi.net_proceeds >= 0 ? 'text-green-700 font-bold text-lg' : 'text-red-700 font-bold text-lg');
      h += '</div></div>';
      h += '<p class="text-[10px] text-gray-400 mt-3">' + E(fi.disclaimer || '') + '</p>';
    } else {
      h += '<p class="text-xs text-gray-400 italic">No pricing data available yet.</p>';
    }
    h += '</div>';

    // ── Recent Sales (Comps) ──
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h4 class="text-sm font-bold text-gray-900 mb-3"><i class="fas fa-chart-bar text-gold mr-2"></i>Recent Sales in Building (' + sales.length + ')</h4>';
    if (sales.length > 0) {
      h += '<div class="overflow-x-auto"><table class="w-full text-xs">';
      h += '<thead><tr class="bg-gray-50 text-gray-500 text-[10px] uppercase">';
      h += '<th class="px-3 py-2 text-left">Address</th><th class="px-3 py-2 text-right">Price</th><th class="px-3 py-2 text-right">Beds</th><th class="px-3 py-2 text-right">Baths</th><th class="px-3 py-2 text-right">Sqft</th><th class="px-3 py-2 text-left">Close Date</th>';
      h += '</tr></thead><tbody>';
      sales.forEach(function (s) {
        h += '<tr class="border-b border-gray-50">';
        h += '<td class="px-3 py-2 font-medium">' + E(s.address || '-') + (s.unit ? ' #' + E(s.unit) : '') + '</td>';
        h += '<td class="px-3 py-2 text-right font-semibold text-green-700">' + (s.close_price ? $(s.close_price) : '-') + '</td>';
        h += '<td class="px-3 py-2 text-right">' + (s.beds || '-') + '</td>';
        h += '<td class="px-3 py-2 text-right">' + (s.baths || '-') + '</td>';
        h += '<td class="px-3 py-2 text-right">' + (s.sqft ? Number(s.sqft).toLocaleString() : '-') + '</td>';
        h += '<td class="px-3 py-2">' + (s.close_date ? new Date(s.close_date).toLocaleDateString() : '-') + '</td>';
        h += '</tr>';
      });
      h += '</tbody></table></div>';
    } else {
      h += '<p class="text-xs text-gray-400">No recent sales found in building. Try running comps from the search page for a wider area.</p>';
    }
    h += '</div>';

    // ── Active Competition ──
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h4 class="text-sm font-bold text-gray-900 mb-3"><i class="fas fa-home text-gold mr-2"></i>Active Competition (' + competition.length + ')</h4>';
    if (competition.length > 0) {
      h += '<div class="overflow-x-auto"><table class="w-full text-xs">';
      h += '<thead><tr class="bg-gray-50 text-gray-500 text-[10px] uppercase">';
      h += '<th class="px-3 py-2 text-left">Address</th><th class="px-3 py-2 text-right">List Price</th><th class="px-3 py-2 text-right">Beds</th><th class="px-3 py-2 text-right">Baths</th><th class="px-3 py-2 text-right">Sqft</th><th class="px-3 py-2 text-left">Type</th>';
      h += '</tr></thead><tbody>';
      competition.forEach(function (c) {
        h += '<tr class="border-b border-gray-50">';
        h += '<td class="px-3 py-2 font-medium">' + E(c.address || '-') + (c.unit ? ' #' + E(c.unit) : '') + '</td>';
        h += '<td class="px-3 py-2 text-right font-semibold">' + (c.list_price ? $(c.list_price) : '-') + '</td>';
        h += '<td class="px-3 py-2 text-right">' + (c.beds || '-') + '</td>';
        h += '<td class="px-3 py-2 text-right">' + (c.baths || '-') + '</td>';
        h += '<td class="px-3 py-2 text-right">' + (c.sqft ? Number(c.sqft).toLocaleString() : '-') + '</td>';
        h += '<td class="px-3 py-2">' + E(c.property_type || '-') + '</td>';
        h += '</tr>';
      });
      h += '</tbody></table></div>';
    } else {
      h += '<p class="text-xs text-gray-400">No active competition found in the area.</p>';
    }
    h += '</div>';

    // ── Exposure Plan ──
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h4 class="text-sm font-bold text-gray-900 mb-3"><i class="fas fa-bullhorn text-gold mr-2"></i>Exposure Plan</h4>';
    h += '<div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">';
    h += _statBox(ex.buyer_database || 0, 'Buyers in CRM', '#059669');
    h += _statBox((ex.agent_network || 0).toLocaleString(), 'REBNY Agents', '#3B82F6');
    h += _statBox(ex.firms || 0, 'Brokerage Firms', '#8B5CF6');
    h += _statBox((ex.syndication_portals || []).length, 'Portals', '#F59E0B');
    h += '</div>';
    if (ex.syndication_portals && ex.syndication_portals.length > 0) {
      h += '<div class="text-xs text-gray-500 mt-2"><i class="fas fa-globe mr-1"></i>' + ex.syndication_portals.join(', ') + '</div>';
    }
    h += '</div>';

    // ── Attribution ──
    if (d.attribution) {
      h += '<div class="text-[10px] text-gray-400 p-3 bg-gray-50 rounded-lg">' + E(d.attribution) + '</div>';
    }

    return h;
  }

  function _priceCard(label, value, color, highlight) {
    var bg = highlight ? color : '#F9FAFB';
    var textColor = highlight ? '#fff' : '#111';
    var labelColor = highlight ? 'rgba(255,255,255,0.8)' : '#6B7280';
    return '<div style="padding:16px;border-radius:12px;text-align:center;background:' + bg + ';' + (highlight ? '' : 'border:1px solid #E5E7EB;') + '">' +
      '<div style="font-size:10px;font-weight:600;color:' + labelColor + ';text-transform:uppercase;letter-spacing:0.5px;">' + E(label) + '</div>' +
      '<div style="font-size:20px;font-weight:800;color:' + textColor + ';margin-top:4px;">' + E(value || '—') + '</div></div>';
  }

  function _statBox(value, label, color) {
    return '<div class="p-3 bg-gray-50 rounded-lg">' +
      '<div style="font-size:18px;font-weight:800;color:' + color + ';">' + value + '</div>' +
      '<div class="text-[10px] text-gray-500 mt-1">' + E(label) + '</div></div>';
  }

  function _lineItem(label, value, valueClass) {
    return '<div class="flex justify-between items-baseline py-1">' +
      '<span class="text-xs text-gray-600">' + E(label) + '</span>' +
      '<span class="text-xs ' + (valueClass || '') + '">' + E(value || '—') + '</span></div>';
  }

  function _generate(id) {
    var area = document.getElementById('pitch-data-area');
    if (area) area.innerHTML = '<div class="flex items-center justify-center py-8 gap-2"><i class="fas fa-spinner fa-spin text-gold text-xl"></i><span class="text-sm text-gray-500">Generating pitch packet (querying Trestle for comps)...</span></div>';

    MallanAPI._fetch('/api/crm/sales/prospects/' + id + '/pitch-packet')
      .then(function (data) {
        _data = data;
        _data.prospect_id = _data.prospect_id || id;
        if (area) area.innerHTML = _renderData(data);
        CRM.toast('Pitch packet generated', 'success');
      })
      .catch(function (err) {
        if (area) area.innerHTML = '<div class="text-center py-8"><i class="fas fa-exclamation-triangle text-2xl text-red-400 mb-2"></i><p class="text-sm text-red-500">Failed to generate: ' + E(err.message || 'Trestle timeout or credentials issue') + '</p><p class="text-xs text-gray-400 mt-1">Check that TRESTLE_TOKEN is set and valid in .env.local</p></div>';
      });
  }

  function _download(id) {
    window.open('/api/crm/sales/prospects/' + id + '/pdf', '_blank');
  }

  function _send(id) {
    if (!confirm('Send pitch packet to this prospect via email?')) return;
    CRM.toast('Sending pitch packet...', 'info');
    MallanAPI._fetch('/api/crm/sales/prospects/' + id + '/send-packet', { method: 'POST' })
      .then(function (data) {
        CRM.toast('Pitch packet sent to ' + (data.sent_to || 'prospect'), 'success');
        if (typeof SellerProspects !== 'undefined') SellerProspects.openWorkspace(id);
      })
      .catch(function (err) { CRM.toast('Send failed: ' + (err.message || ''), 'error'); });
  }

  return {
    render: render,
    _generate: _generate,
    _download: _download,
    _send: _send,
  };
})();
