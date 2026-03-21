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
    var h = '<div class="space-y-4">';

    h += '<div class="flex items-center justify-between">';
    h += '<h3 class="text-sm font-bold text-gray-900"><i class="fas fa-file-powerpoint text-gold mr-2"></i>Pitch Packet</h3>';
    h += '<div class="flex gap-2">';
    h += '<button class="btn btn-sm btn-outline" onclick="PitchPacket._preview(\'' + E(String(p.id)) + '\')"><i class="fas fa-eye mr-1"></i>Preview</button>';
    h += '<button class="btn btn-sm btn-outline" onclick="PitchPacket._download(\'' + E(String(p.id)) + '\')"><i class="fas fa-download mr-1"></i>PDF</button>';
    h += '<button class="btn btn-sm btn-gold" onclick="PitchPacket._send(\'' + E(String(p.id)) + '\')"><i class="fas fa-paper-plane mr-1"></i>Send</button>';
    h += '</div></div>';

    h += '<div class="text-center py-12 bg-gray-50 rounded-xl">';
    h += '<i class="fas fa-file-powerpoint text-4xl text-gray-300 mb-3"></i>';
    h += '<p class="text-sm font-semibold text-gray-700">Pitch Packet Builder</p>';
    h += '<p class="text-xs text-gray-500 mt-1">Full builder with CMA, comparables, and market data coming in next update.</p>';
    h += '<p class="text-xs text-gray-400 mt-3">You can still preview, download, or send the auto-generated packet using the buttons above.</p>';
    h += '</div>';

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
    MallanAPI._fetch('/api/crm/sales/prospects/' + id + '/send-packet', { method: 'POST' })
      .then(function () { CRM.toast('Pitch packet sent', 'success'); })
      .catch(function (err) { CRM.toast('Send failed: ' + (err.message || ''), 'error'); });
  }

  return {
    render: render,
    _preview: _preview,
    _download: _download,
    _send: _send,
  };
})();
