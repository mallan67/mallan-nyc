// =============================================================================
// ADMIN ETHICS — Broker-only panel for UCBA Art. III §6 ethics-training dates
//
// Lists every active agent (broker included) with their
// ethics_training_completed_at + ethics_training_expires_at dates and lets
// the broker set/update both with a single Save click. Status column flags
// EXPIRED, Expiring (<30d), Valid, or Never recorded.
//
// Backed by:
//   GET   /api/crm/agents                       (broker-only)
//   PATCH /api/crm/agents/:id/ethics-training   (broker-only)
//
// Pattern mirrors `lease-tracker.js`: IIFE → public render() that fetches,
// builds HTML, and wires button handlers in-place. No bundler.
// =============================================================================
/* global CRM, MallanAPI, Utils */

var AdminEthics = (function () {
  'use strict';

  var E = Utils.esc;

  // --- helpers --------------------------------------------------------------
  function _fmtDate(iso) {
    if (!iso) return '';
    return String(iso).slice(0, 10);
  }

  function _statusOf(expiresIso) {
    if (!expiresIso) return { label: 'Never recorded', color: '#DC2626', bg: '#FEF2F2' };
    var ms = new Date(expiresIso).getTime();
    if (isNaN(ms)) return { label: 'Invalid date', color: '#DC2626', bg: '#FEF2F2' };
    var now = Date.now();
    if (ms < now) return { label: 'EXPIRED', color: '#DC2626', bg: '#FEF2F2' };
    var days = Math.floor((ms - now) / 86400000);
    if (days < 30) return { label: 'Expires in ' + days + 'd', color: '#B45309', bg: '#FFFBEB' };
    return { label: 'Valid', color: '#059669', bg: '#ECFDF5' };
  }

  function _toIsoOrNull(yyyy_mm_dd) {
    if (!yyyy_mm_dd) return null;
    var d = new Date(yyyy_mm_dd + 'T00:00:00Z');
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  // --- API calls ------------------------------------------------------------
  function _loadAgents() {
    return MallanAPI._fetch('/api/crm/agents').then(function (data) {
      return (data && data.agents) || [];
    });
  }

  function _saveOne(agentId, completedDate, expiresDate) {
    var body = {
      completed_at: _toIsoOrNull(completedDate),
      expires_at: _toIsoOrNull(expiresDate),
    };
    return MallanAPI._fetch(
      '/api/crm/agents/' + encodeURIComponent(agentId) + '/ethics-training',
      { method: 'PATCH', body: JSON.stringify(body) }
    );
  }

  // --- render ---------------------------------------------------------------
  function render() {
    CRM.setPanelTitle('Ethics Training');
    var c = CRM.getContent();
    c.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:160px;">' +
      '<i class="fas fa-spinner fa-spin" style="font-size:24px;color:#B8860B;"></i></div>';

    _loadAgents()
      .then(function (agents) { _renderTable(c, agents); })
      .catch(function (err) {
        c.innerHTML =
          '<div class="text-center py-12">' +
          '<i class="fas fa-exclamation-triangle" style="font-size:28px;color:#F87171;margin-bottom:12px;display:block;"></i>' +
          '<p class="text-sm text-gray-500">Failed to load agents: ' + E(err.message || 'Unknown error') + '</p>' +
          '<button class="mt-4 px-4 py-2 text-xs font-bold rounded-lg" style="background:#B8860B;color:#fff;border:none;cursor:pointer;" onclick="AdminEthics.render()">Retry</button>' +
          '</div>';
      });
  }

  function _renderTable(c, agents) {
    var html =
      '<div style="max-width:1100px;margin:0 auto;">' +
      '<header style="margin-bottom:20px;">' +
      '<h2 style="font-size:18px;font-weight:800;color:#111;">Ethics Training (UCBA Art. III §6)</h2>' +
      '<p style="font-size:12px;color:#6B7280;margin-top:6px;">' +
      'REBNY 2026 requires ethics training before issuing or renewing RLS access. ' +
      'Set both dates per agent. Expiry must be on or after Completed, and within 5 years of completion.' +
      '</p>' +
      '</header>';

    if (!agents.length) {
      html +=
        '<div class="text-center" style="padding:48px 0;">' +
        '<p style="font-size:14px;color:#6B7280;">No active agents.</p>' +
        '</div>' +
        '</div>';
      c.innerHTML = html;
      return;
    }

    html +=
      '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<thead><tr style="background:#F9FAFB;border-bottom:1px solid #E5E7EB;">' +
      '<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.4px;">Agent</th>' +
      '<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.4px;">Role</th>' +
      '<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.4px;">Completed</th>' +
      '<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.4px;">Expires</th>' +
      '<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.4px;">Status</th>' +
      '<th style="padding:10px 12px;"></th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < agents.length; i++) {
      html += _buildRow(agents[i]);
    }

    html += '</tbody></table></div></div>';
    c.innerHTML = html;

    _wireRows(c);
  }

  function _buildRow(a) {
    var name = a.full_name || ((a.first_name || '') + ' ' + (a.last_name || '')).trim() || a.email || '(unnamed)';
    var s = _statusOf(a.ethics_training_expires_at);
    return '' +
      '<tr data-agent-id="' + E(String(a.id)) + '" style="border-bottom:1px solid #F3F4F6;">' +
        '<td style="padding:10px 12px;font-weight:600;color:#111;">' + E(name) + '</td>' +
        '<td style="padding:10px 12px;color:#6B7280;">' + E(a.role || '') + '</td>' +
        '<td style="padding:10px 12px;">' +
          '<input type="date" class="ae-completed" value="' + E(_fmtDate(a.ethics_training_completed_at)) + '" ' +
            'style="font-size:12px;padding:6px 8px;border:1px solid #D1D5DB;border-radius:6px;outline:none;">' +
        '</td>' +
        '<td style="padding:10px 12px;">' +
          '<input type="date" class="ae-expires" value="' + E(_fmtDate(a.ethics_training_expires_at)) + '" ' +
            'style="font-size:12px;padding:6px 8px;border:1px solid #D1D5DB;border-radius:6px;outline:none;">' +
        '</td>' +
        '<td style="padding:10px 12px;">' +
          '<span style="font-size:10px;font-weight:800;padding:3px 8px;border-radius:6px;background:' + s.bg + ';color:' + s.color + ';white-space:nowrap;">' + E(s.label) + '</span>' +
        '</td>' +
        '<td style="padding:10px 12px;text-align:right;">' +
          '<button class="ae-save" style="font-size:11px;font-weight:700;padding:6px 14px;border-radius:6px;background:#B8860B;color:#fff;border:none;cursor:pointer;">Save</button>' +
        '</td>' +
      '</tr>';
  }

  function _wireRows(container) {
    var rows = container.querySelectorAll('tr[data-agent-id]');
    for (var i = 0; i < rows.length; i++) {
      (function (row) {
        var btn = row.querySelector('.ae-save');
        if (!btn) return;
        btn.addEventListener('click', function () {
          var agentId = row.getAttribute('data-agent-id');
          var completed = (row.querySelector('.ae-completed') || {}).value || '';
          var expires = (row.querySelector('.ae-expires') || {}).value || '';
          btn.disabled = true;
          btn.textContent = 'Saving…';
          _saveOne(agentId, completed, expires)
            .then(function () {
              if (typeof CRM.toast === 'function') {
                CRM.toast('Ethics training updated', 'success');
              }
              // Reload to refresh status badges and pick up server-side
              // values (in case ISO normalization changed display).
              setTimeout(render, 400);
            })
            .catch(function (err) {
              btn.disabled = false;
              btn.textContent = 'Save';
              var msg = (err && err.message) || 'Save failed';
              if (typeof CRM.toast === 'function') {
                CRM.toast('Save failed: ' + msg, 'error');
              } else {
                alert('Save failed: ' + msg);
              }
            });
        });
      })(rows[i]);
    }
  }

  return {
    render: render,
  };
})();
