// ═══════════════════════════════════════════════════════════════════════════════
// OUTREACH CADENCE — renders inside SellerProspects workspace
// Task 11 will implement full cadence management; this is the scaffold.
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, MallanAPI, Utils */

var OutreachCadence = (function () {
  'use strict';

  var E = Utils.esc;
  var D = Utils.formatDate;
  var _ago = typeof Utils.formatTimeAgo === 'function' ? Utils.formatTimeAgo : function (d) { return D(d); };

  /**
   * Render outreach cadence tab content into the given element.
   * @param {HTMLElement} el - container element
   * @param {Object} prospect - current prospect with cadence_steps
   */
  function render(el, prospect) {
    var p = prospect;
    var steps = p.cadence_steps || [];

    var h = '<div class="space-y-4">';

    h += '<div class="flex items-center justify-between">';
    h += '<h3 class="text-sm font-bold text-gray-900"><i class="fas fa-paper-plane text-gold mr-2"></i>Outreach Cadence (' + steps.length + ' steps)</h3>';
    h += '<button class="btn btn-sm btn-gold" onclick="OutreachCadence._addStep(\'' + E(String(p.id)) + '\')"><i class="fas fa-plus mr-1"></i>Add Step</button>';
    h += '</div>';

    if (steps.length === 0) {
      h += '<div class="text-center py-12 bg-gray-50 rounded-xl">';
      h += '<i class="fas fa-paper-plane text-3xl text-gray-300 mb-3"></i>';
      h += '<p class="text-sm text-gray-500">No cadence steps configured. Click "Add Step" to create one.</p>';
      h += '</div>';
    } else {
      h += '<div class="space-y-2">';
      steps.forEach(function (step, idx) {
        var icon = step.channel === 'email' ? 'fa-envelope' : step.channel === 'sms' ? 'fa-comment' : step.channel === 'call' ? 'fa-phone' : step.channel === 'mail' ? 'fa-mail-bulk' : 'fa-tasks';
        var statusColors = {
          pending: { bg: '#FFFBEB', color: '#F59E0B', label: 'Pending' },
          sent: { bg: '#EFF6FF', color: '#3B82F6', label: 'Sent' },
          completed: { bg: '#ECFDF5', color: '#059669', label: 'Completed' },
          skipped: { bg: '#F3F4F6', color: '#6B7280', label: 'Skipped' },
          failed: { bg: '#FEF2F2', color: '#EF4444', label: 'Failed' },
        };
        var sc = statusColors[step.status] || statusColors.pending;

        h += '<div class="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">';

        // Step number
        h += '<div style="width:28px;height:28px;border-radius:50%;background:#B8860B15;color:#B8860B;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">' + (idx + 1) + '</div>';

        // Channel icon
        h += '<div style="width:28px;height:28px;border-radius:8px;background:#F3F4F6;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas ' + icon + ' text-xs text-gray-600"></i></div>';

        // Details
        h += '<div class="flex-1 min-w-0">';
        h += '<div class="text-xs font-bold text-gray-900">' + E(step.type || step.channel || '-') + '</div>';
        if (step.subject) h += '<div class="text-[10px] text-gray-500 truncate">' + E(step.subject) + '</div>';
        h += '<div class="text-[10px] text-gray-400">Day ' + (step.day_offset || 0) + ' \u2022 ' + E(step.channel || '-') + '</div>';
        h += '</div>';

        // Status badge
        h += '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:' + sc.bg + ';color:' + sc.color + ';">' + E(sc.label) + '</span>';

        // Scheduled / executed date
        if (step.executed_at) {
          h += '<span class="text-[10px] text-gray-400">' + _ago(step.executed_at) + '</span>';
        } else if (step.scheduled_at) {
          h += '<span class="text-[10px] text-gray-500">' + D(step.scheduled_at) + '</span>';
        }

        h += '</div>';
      });
      h += '</div>';
    }

    h += '<div class="text-center py-6 bg-gray-50 rounded-xl mt-4">';
    h += '<p class="text-xs text-gray-400">Full cadence management (drag-reorder, auto-send, templates) coming in next update.</p>';
    h += '</div>';

    h += '</div>';
    el.innerHTML = h;
  }

  function _addStep(prospectId) {
    var body =
      '<form id="addStepForm" class="space-y-3">' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Channel</label>' +
            '<select class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" name="channel">' +
              '<option value="email">Email</option><option value="call">Call</option><option value="sms">SMS</option><option value="mail">Mail</option>' +
            '</select></div>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Day Offset</label>' +
            '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" type="number" name="day_offset" value="1" min="0"></div>' +
        '</div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Step Type</label>' +
          '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" name="type" placeholder="e.g. follow_up, intro_cma"></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Subject</label>' +
          '<input class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" name="subject" placeholder="Email subject line or call topic"></div>' +
        '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Notes</label>' +
          '<textarea class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold/30 focus:outline-none" name="notes" rows="2" placeholder="Optional notes"></textarea></div>' +
      '</form>';

    CRM.openModal('Add Cadence Step', body, {
      footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
        '<button class="btn btn-gold" onclick="OutreachCadence._submitStep(\'' + E(prospectId) + '\')"><i class="fas fa-plus mr-1"></i>Add</button>',
    });
  }

  function _submitStep(prospectId) {
    var form = document.getElementById('addStepForm');
    if (!form) return;
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });
    if (data.day_offset) data.day_offset = Number(data.day_offset) || 0;

    MallanAPI._fetch('/api/crm/sales/prospects/' + prospectId + '/outreach', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(function () {
      CRM.toast('Cadence step added', 'success');
      CRM.closeModal();
      // Refresh workspace to show new step
      if (typeof SellerProspects !== 'undefined') {
        SellerProspects.openWorkspace(prospectId);
      }
    }).catch(function (err) { CRM.toast('Failed: ' + (err.message || ''), 'error'); });
  }

  return {
    render: render,
    _addStep: _addStep,
    _submitStep: _submitStep,
  };
})();
