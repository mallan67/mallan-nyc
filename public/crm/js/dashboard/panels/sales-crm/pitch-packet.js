// ═══════════════════════════════════════════════════════════════════════════════
// PITCH PACKET BUILDER — renders inside SellerProspects workspace
// Task 10 will implement full builder; this is the scaffold.
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, MallanAPI, Utils */

var PitchPacket = (function () {
  'use strict';

  var E = Utils.esc;

  /**
   * Render pitch packet tab content into the given element.
   * @param {HTMLElement} el - container element
   * @param {Object} prospect - current prospect record
   */
  function render(el, prospect) {
    var p = prospect;
    var hasConsent = p.consent_captured_at || p.consent_given;
    var hasEmail = !!p.owner_email;
    var h = '<div class="space-y-4">';

    h += '<div class="flex items-center justify-between">';
    h += '<h3 class="text-sm font-bold text-gray-900"><i class="fas fa-file-powerpoint text-gold mr-2"></i>Pitch Packet for ' + E(p.owner_name || p.address || '-') + '</h3>';
    h += '<div class="flex gap-2">';
    h += '<button class="btn btn-sm btn-outline" onclick="PitchPacket._preview(\'' + E(String(p.id)) + '\')"><i class="fas fa-eye mr-1"></i>Preview</button>';
    h += '<button class="btn btn-sm btn-outline" onclick="PitchPacket._download(\'' + E(String(p.id)) + '\')"><i class="fas fa-download mr-1"></i>PDF</button>';
    if (hasConsent && hasEmail) {
      h += '<button class="btn btn-sm btn-gold" onclick="PitchPacket._send(\'' + E(String(p.id)) + '\')"><i class="fas fa-paper-plane mr-1"></i>Send to ' + E(p.owner_email) + '</button>';
    } else {
      h += '<button class="btn btn-sm btn-gold opacity-50 cursor-not-allowed" disabled title="' + (!hasEmail ? 'No email address' : 'TCPA consent required') + '"><i class="fas fa-paper-plane mr-1"></i>Send</button>';
    }
    h += '</div></div>';

    // TCPA consent banner
    if (!hasConsent) {
      h += '<div class="p-4 bg-amber-50 border border-amber-200 rounded-xl">';
      h += '<div class="flex items-start gap-3">';
      h += '<i class="fas fa-exclamation-triangle text-amber-500 mt-0.5"></i>';
      h += '<div class="flex-1">';
      h += '<div class="text-sm font-bold text-amber-800">TCPA Consent Required</div>';
      h += '<p class="text-xs text-amber-700 mt-1">Before emailing a pitch packet, you must confirm the prospect has given consent to receive marketing communications. This is required by the Telephone Consumer Protection Act.</p>';
      h += '<div class="flex gap-2 mt-3">';
      h += '<button class="btn btn-sm btn-gold" onclick="PitchPacket._grantConsent(\'' + E(String(p.id)) + '\',\'verbal\')"><i class="fas fa-phone mr-1"></i>Verbal Consent Given</button>';
      h += '<button class="btn btn-sm btn-outline" onclick="PitchPacket._grantConsent(\'' + E(String(p.id)) + '\',\'written\')"><i class="fas fa-file-signature mr-1"></i>Written Consent</button>';
      h += '<button class="btn btn-sm btn-outline" onclick="PitchPacket._grantConsent(\'' + E(String(p.id)) + '\',\'referral\')"><i class="fas fa-user-friends mr-1"></i>Referral Consent</button>';
      h += '</div>';
      h += '</div></div></div>';
    } else {
      h += '<div class="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">';
      h += '<i class="fas fa-check-circle text-green-500"></i>';
      h += '<span class="text-xs font-semibold text-green-700">TCPA consent recorded</span>';
      h += '</div>';
    }

    // Pitch packet content summary
    h += '<div class="bg-white border border-gray-200 rounded-xl p-5">';
    h += '<h4 class="text-sm font-bold text-gray-900 mb-3">What the pitch packet includes:</h4>';
    h += '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">';
    var items = [
      { icon: 'fa-chart-bar', label: 'Market Value Estimate', desc: 'Conservative, recommended, and aspirational price points' },
      { icon: 'fa-users', label: 'Active Buyer Count', desc: 'How many buyers are currently searching in their area' },
      { icon: 'fa-calculator', label: 'Net Proceeds Estimate', desc: 'What they walk away with after commission, taxes, and costs' },
      { icon: 'fa-home', label: 'Competing Listings', desc: 'How many similar properties are currently on the market' },
    ];
    items.forEach(function (item) {
      h += '<div class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">';
      h += '<i class="fas ' + item.icon + ' text-gold mt-0.5"></i>';
      h += '<div><div class="text-xs font-bold text-gray-900">' + E(item.label) + '</div>';
      h += '<div class="text-[11px] text-gray-500 mt-0.5">' + E(item.desc) + '</div></div>';
      h += '</div>';
    });
    h += '</div></div>';

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

  function _preview(id) {
    CRM.toast('Loading pitch packet preview...', 'info');
    MallanAPI._fetch('/api/crm/sales/prospects/' + id + '/pitch-packet')
      .then(function (data) {
        var packet = data.packet || data;
        var body = '<div class="space-y-3 max-h-96 overflow-y-auto">';
        body += '<pre class="text-xs bg-gray-50 p-4 rounded-lg overflow-x-auto" style="white-space:pre-wrap;">' + E(JSON.stringify(packet, null, 2)) + '</pre>';
        body += '</div>';
        CRM.openModal('Pitch Packet Preview', body, {
          size: 'lg',
          footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Close</button>',
        });
      })
      .catch(function (err) { CRM.toast('Failed to load: ' + (err.message || ''), 'error'); });
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
        // Refresh the workspace to show sent status
        if (typeof SellerProspects !== 'undefined') SellerProspects.openWorkspace(id);
      })
      .catch(function (err) { CRM.toast('Send failed: ' + (err.message || ''), 'error'); });
  }

  function _grantConsent(id, method) {
    if (!confirm('Confirm that ' + method + ' consent has been obtained from this prospect?')) return;
    MallanAPI._fetch('/api/crm/sales/prospects/' + id, {
      method: 'PUT',
      body: JSON.stringify({ consent_captured_at: new Date().toISOString(), notes: (method === 'verbal' ? 'Verbal' : method === 'written' ? 'Written' : 'Referral') + ' consent recorded ' + new Date().toLocaleDateString() }),
    }).then(function () {
      CRM.toast('TCPA consent recorded (' + method + ')', 'success');
      // Refresh workspace to enable send button
      if (typeof SellerProspects !== 'undefined') SellerProspects.openWorkspace(id);
    }).catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  return {
    render: render,
    _preview: _preview,
    _download: _download,
    _send: _send,
    _grantConsent: _grantConsent,
  };
})();
