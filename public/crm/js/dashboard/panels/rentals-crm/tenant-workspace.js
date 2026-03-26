// =============================================================================
// TENANT WORKSPACE — Type-specific sections for tenant/renter clients
// Renders inside workspace.js overview tab (line 809)
// Shows: comm strip, lease info, engagement, nurture status, convert actions
// =============================================================================
/* global Utils, MallanAPI, CRM */

var TenantWorkspace = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;
  var _ago = typeof Utils.formatTimeAgo === 'function' ? Utils.formatTimeAgo : function (d) { return D(d); };

  /**
   * renderRenterSections(cl) — returns HTML string for workspace overview.
   * Called from workspace.js:809 when clientType === 'renter'.
   */
  function renderRenterSections(cl) {
    var h = '';

    // ── Communication Strip ──
    h += _renderCommStrip(cl);

    // ── Lease Info ──
    h += _renderLeaseInfo(cl);

    // ── Engagement Summary (placeholder — async) ──
    h += '<div id="tenant-engagement-summary" style="margin-bottom:12px;">';
    h += '<div style="display:flex;align-items:center;justify-content:center;padding:16px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;">';
    h += '<i class="fas fa-spinner fa-spin" style="color:#B8860B;margin-right:8px;"></i><span style="font-size:12px;color:#6B7280;">Loading engagement...</span>';
    h += '</div></div>';

    // ── Nurture Status ──
    h += _renderNurtureStatus(cl);

    // ── Convert Actions ──
    h += _renderConvertActions(cl);

    // Async load engagement data
    setTimeout(function () { _loadEngagement(cl); }, 50);

    return h;
  }

  // ── Communication Strip ─────────────────────────────────────────────
  function _renderCommStrip(cl) {
    var h = '<div style="display:flex;gap:12px;flex-wrap:wrap;padding:12px 16px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;margin-bottom:12px;align-items:center;">';

    if (cl.preferred_channel) {
      var icons = { portal: 'fa-globe', email: 'fa-envelope', text: 'fa-sms', phone: 'fa-phone' };
      h += '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;background:#EFF6FF;color:#3B82F6;"><i class="fas ' + (icons[cl.preferred_channel] || '') + '" style="margin-right:4px;"></i>' + E(cl.preferred_channel) + '</span>';
    }
    if (cl.preferred_device) {
      var devIcon = cl.preferred_device === 'mobile' ? 'fa-mobile-alt' : 'fa-desktop';
      h += '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;background:#F3F4F6;color:#6B7280;"><i class="fas ' + devIcon + '" style="margin-right:4px;"></i>' + E(cl.preferred_device) + '</span>';
    }
    if (cl.last_contacted_at) {
      h += '<span style="font-size:11px;color:#6B7280;"><i class="fas fa-paper-plane" style="margin-right:4px;color:#9CA3AF;"></i>You: ' + _ago(cl.last_contacted_at) + '</span>';
    }
    if (cl.last_click_at) {
      h += '<span style="font-size:11px;color:#6B7280;"><i class="fas fa-mouse-pointer" style="margin-right:4px;color:#9CA3AF;"></i>Them: ' + _ago(cl.last_click_at) + '</span>';
    }
    if (!cl.preferred_channel && !cl.last_contacted_at && !cl.last_click_at) {
      h += '<span style="font-size:11px;color:#9CA3AF;">No engagement data yet</span>';
    }

    h += '</div>';
    return h;
  }

  // ── Lease Info ──────────────────────────────────────────────────────
  function _renderLeaseInfo(cl) {
    if (!cl.lease_start_date && !cl.lease_end_date && !cl.rent_per_month && !cl.property_address) return '';

    var h = '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:14px 16px;margin-bottom:12px;">';
    h += '<div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Current Lease</div>';

    h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;font-size:12px;">';

    if (cl.property_address) {
      h += '<div style="grid-column:1/-1;"><span style="color:#6B7280;">Property</span><div style="font-weight:700;">' + E(cl.property_address) + (cl.unit_number ? ' #' + E(cl.unit_number) : '') + '</div></div>';
    }
    if (cl.lease_start_date) {
      h += '<div><span style="color:#6B7280;">Start</span><div style="font-weight:700;">' + D(cl.lease_start_date) + '</div></div>';
    }
    if (cl.lease_end_date) {
      var daysLeft = Math.ceil((new Date(cl.lease_end_date) - Date.now()) / 86400000);
      var urgColor = daysLeft <= 30 ? '#DC2626' : daysLeft <= 90 ? '#F59E0B' : '#6B7280';
      h += '<div><span style="color:#6B7280;">End</span><div style="font-weight:700;color:' + urgColor + ';">' + D(cl.lease_end_date) + '</div>';
      if (daysLeft <= 180 && daysLeft > 0) h += '<div style="font-size:10px;font-weight:700;color:' + urgColor + ';">' + daysLeft + ' days left</div>';
      h += '</div>';
    }
    if (cl.rent_per_month) {
      h += '<div><span style="color:#6B7280;">Rent</span><div style="font-weight:700;">' + $(Number(cl.rent_per_month)) + '/mo</div></div>';
    }
    if (cl.renewal_status) {
      var renewColors = { renewing: '#059669', not_renewing: '#DC2626', pending_decision: '#F59E0B', unknown: '#6B7280' };
      h += '<div><span style="color:#6B7280;">Renewal</span><div style="font-weight:700;color:' + (renewColors[cl.renewal_status] || '#6B7280') + ';">' + E(cl.renewal_status.replace(/_/g, ' ')) + '</div></div>';
    }

    h += '</div></div>';
    return h;
  }

  // ── Async Engagement Loading ────────────────────────────────────────
  function _loadEngagement(cl) {
    var clientId = cl.id || cl._id;
    if (!clientId) return;

    MallanAPI._fetch('/api/crm/listing-views?lead_id=' + clientId)
      .catch(function () { return { listings: [], total_views: 0 }; })
      .then(function (views) {
        var el = document.getElementById('tenant-engagement-summary');
        if (!el) return;

        var totalViews = views.total_views || 0;
        var listings = views.listings || [];

        if (totalViews === 0 && listings.length === 0) {
          el.innerHTML = '<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:16px;text-align:center;">' +
            '<span style="font-size:12px;color:#9CA3AF;">No listing views tracked yet</span></div>';
          return;
        }

        var h = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;">';
        h += _statCard('fa-eye', '#3B82F6', totalViews, 'Views');
        h += _statCard('fa-paper-plane', '#6366F1', listings.length, 'Listings Tracked');
        h += _statCard('fa-sign-in-alt', '#059669', cl.login_count || 0, 'Portal Logins');
        h += '</div>';
        el.innerHTML = h;
      });
  }

  function _statCard(icon, color, value, label) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:#fff;border:1px solid #E5E7EB;border-radius:10px;">' +
      '<div style="width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:' + color + '15;color:' + color + ';font-size:12px;"><i class="fas ' + icon + '"></i></div>' +
      '<div><div style="font-size:16px;font-weight:800;color:#111;">' + value + '</div>' +
      '<div style="font-size:9px;font-weight:600;color:#6B7280;text-transform:uppercase;">' + E(label) + '</div></div></div>';
  }

  // ── Nurture Status ──────────────────────────────────────────────────
  function _renderNurtureStatus(cl) {
    var isActive = cl.sales_drip_on || cl.rental_drip_on;
    if (!isActive && !cl.reengage_anchor_date) return '';

    var h = '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:14px 16px;margin-bottom:12px;">';
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">';
    h += '<div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;">Nurture Cadence</div>';

    if (isActive) {
      var paused = cl.nurture_paused;
      h += '<button style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:6px;background:' + (paused ? '#FEF2F2' : '#ECFDF5') + ';color:' + (paused ? '#DC2626' : '#059669') + ';border:none;cursor:pointer;" ' +
        'onclick="TenantWorkspace._togglePause(\'' + E(String(cl.id)) + '\',' + !paused + ')">' +
        (paused ? '<i class="fas fa-play" style="margin-right:4px;"></i>Resume' : '<i class="fas fa-pause" style="margin-right:4px;"></i>Pause') + '</button>';
    }
    h += '</div>';

    if (!isActive) {
      h += '<div style="font-size:12px;color:#9CA3AF;">Not active. Anchor: ' + (cl.reengage_anchor_date ? D(cl.reengage_anchor_date) : 'Not set') + '</div>';
    } else {
      var stage = cl.sales_drip_status || cl.rental_drip_status || 'unknown';
      var stageLabels = { '6mo': '6-month (sales)', '90d': '90-day (mixed)', '60d': '60-day (mixed)', '30d': '30-day (rentals)', completed: 'Completed' };
      h += '<div style="font-size:12px;color:#374151;">Stage: <strong>' + E(stageLabels[stage] || stage) + '</strong></div>';

      // Outreach dots
      h += '<div style="display:flex;align-items:center;gap:4px;margin-top:8px;">';
      var milestones = [
        { key: '6mo', active: stage === '6mo' },
        { key: '90d', active: stage === '90d' },
        { key: '60d', active: stage === '60d' },
        { key: '30d', active: stage === '30d' },
      ];
      for (var i = 0; i < milestones.length; i++) {
        var m = milestones[i];
        var past = ['6mo', '90d', '60d', '30d'].indexOf(stage) > i;
        var color = m.active ? '#B8860B' : past ? '#059669' : '#D1D5DB';
        h += '<div style="display:flex;align-items:center;gap:2px;">';
        h += '<div style="width:10px;height:10px;border-radius:50%;background:' + (m.active || past ? color : 'transparent') + ';border:2px solid ' + color + ';"></div>';
        h += '<span style="font-size:9px;color:' + color + ';font-weight:600;">' + m.key + '</span>';
        h += '</div>';
        if (i < milestones.length - 1) h += '<div style="width:12px;height:1px;background:#E5E7EB;"></div>';
      }
      h += '</div>';

      if (cl.nurture_paused) {
        h += '<div style="font-size:11px;color:#DC2626;margin-top:6px;font-weight:600;"><i class="fas fa-pause-circle" style="margin-right:4px;"></i>Paused</div>';
      }
    }

    h += '</div>';
    return h;
  }

  // ── Convert Actions ─────────────────────────────────────────────────
  function _renderConvertActions(cl) {
    var h = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">';

    h += '<button style="font-size:11px;font-weight:700;padding:6px 14px;border-radius:8px;background:#3B82F615;color:#3B82F6;border:1px solid #3B82F6;cursor:pointer;" ' +
      'onclick="TenantWorkspace._promoteToBuyer(\'' + E(String(cl.id)) + '\')"><i class="fas fa-shopping-cart" style="margin-right:4px;"></i>Promote to Buyer</button>';

    if (cl.pipeline_stage !== 'current_tenant') {
      h += '<button style="font-size:11px;font-weight:700;padding:6px 14px;border-radius:8px;background:#059669;color:#fff;border:none;cursor:pointer;" ' +
        'onclick="TenantWorkspace._activateRenter(\'' + E(String(cl.id)) + '\')"><i class="fas fa-key" style="margin-right:4px;"></i>Activate Renter</button>';
    }

    h += '<button style="font-size:11px;font-weight:700;padding:6px 14px;border-radius:8px;background:#F59E0B15;color:#B45309;border:1px solid #F59E0B;cursor:pointer;" ' +
      'onclick="TenantWorkspace._convert(\'' + E(String(cl.id)) + '\',\'seller\')"><i class="fas fa-home" style="margin-right:4px;"></i>Convert to Seller</button>';

    h += '</div>';
    return h;
  }

  // ── Action handlers ─────────────────────────────────────────────────
  function _promoteToBuyer(clientId) {
    if (!confirm('Promote this tenant to buyer?\n\nThis adds the buyer role and enables the buyer workspace.')) return;
    MallanAPI._fetch('/api/crm/convert', {
      method: 'POST',
      body: JSON.stringify({ personId: clientId, action: 'promote_to_buyer' }),
    }).then(function () {
      CRM.toast('Promoted to buyer', 'success');
      location.reload();
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _activateRenter(clientId) {
    if (!confirm('Activate this renter?')) return;
    MallanAPI._fetch('/api/crm/convert', {
      method: 'POST',
      body: JSON.stringify({ personId: clientId, action: 'activate_renter' }),
    }).then(function () {
      CRM.toast('Renter activated', 'success');
      location.reload();
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _convert(clientId, targetRole) {
    if (!confirm('Add ' + targetRole + ' role?')) return;
    MallanAPI._fetch('/api/crm/convert', {
      method: 'POST',
      body: JSON.stringify({ personId: clientId, action: 'role_transition', targetRole: targetRole }),
    }).then(function () {
      CRM.toast(targetRole.charAt(0).toUpperCase() + targetRole.slice(1) + ' role added', 'success');
      location.reload();
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _togglePause(clientId, pause) {
    MallanAPI._fetch('/api/crm/clients/' + clientId, {
      method: 'PATCH',
      body: JSON.stringify({ nurture_paused: pause }),
    }).then(function () {
      CRM.toast(pause ? 'Nurture paused' : 'Nurture resumed', 'success');
      location.reload();
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  return {
    renderRenterSections: renderRenterSections,
    _promoteToBuyer: _promoteToBuyer,
    _activateRenter: _activateRenter,
    _convert: _convert,
    _togglePause: _togglePause,
  };
})();
