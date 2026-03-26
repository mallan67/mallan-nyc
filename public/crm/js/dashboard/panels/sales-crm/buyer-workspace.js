// =============================================================================
// BUYER WORKSPACE — Engagement dashboard for buyer clients
// Renders inside workspace.js overview tab (line 799)
// Shows: communication strip, engagement summary, action timeline,
//        listings sent table, observable facts, convert actions
// =============================================================================
/* global Utils, MallanAPI, CRM, Router, Workspace */

var BuyerWorkspace = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;
  var _ago = typeof Utils.formatTimeAgo === 'function' ? Utils.formatTimeAgo : function (d) { return D(d); };

  // Cache for async-loaded engagement data
  var _viewsCache = {};
  var _engagementCache = {};

  /**
   * renderBuyerSections(cl) — returns HTML string injected into workspace overview.
   * Called from workspace.js:799 when clientType === 'buyer'.
   * Async data (views, engagement) loaded after initial render into placeholder divs.
   */
  function renderBuyerSections(cl) {
    var h = '';

    // ── Communication Strip ──
    h += _renderCommStrip(cl);

    // ── Engagement Summary (placeholder — filled async) ──
    h += '<div id="buyer-engagement-summary" style="margin-bottom:12px;">' +
      '<div style="display:flex;align-items:center;justify-content:center;padding:20px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;">' +
      '<i class="fas fa-spinner fa-spin" style="color:#B8860B;margin-right:8px;"></i><span style="font-size:12px;color:#6B7280;">Loading engagement data...</span>' +
      '</div></div>';

    // ── Listings Sent Table (placeholder — filled async) ──
    h += '<div id="buyer-listings-sent" style="margin-bottom:12px;"></div>';

    // ── Facts (placeholder — filled async) ──
    h += '<div id="buyer-facts" style="margin-bottom:12px;"></div>';

    // ── Convert Actions ──
    h += _renderConvertActions(cl);

    // Kick off async data loads
    setTimeout(function () { _loadEngagementData(cl); }, 50);

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
    if (cl.last_contacted_at && cl.last_click_at) {
      var gap = Math.floor((new Date(cl.last_contacted_at) - new Date(cl.last_click_at)) / 86400000);
      var gapColor = Math.abs(gap) > 7 ? '#EF4444' : Math.abs(gap) > 3 ? '#F59E0B' : '#059669';
      h += '<span style="font-size:11px;font-weight:700;color:' + gapColor + ';">Gap: ' + Math.abs(gap) + 'd</span>';
    }
    if (!cl.preferred_channel && !cl.last_contacted_at && !cl.last_click_at) {
      h += '<span style="font-size:11px;color:#9CA3AF;">No engagement data yet</span>';
    }

    h += '</div>';
    return h;
  }

  // ── Async Data Loading ──────────────────────────────────────────────
  function _loadEngagementData(cl) {
    var clientId = cl.id || cl._id;
    if (!clientId) return;

    Promise.all([
      MallanAPI._fetch('/api/crm/listing-views?lead_id=' + clientId).catch(function () { return { listings: [], total_views: 0 }; }),
      MallanAPI._fetch('/api/crm/listing-engagement?client_id=' + clientId).catch(function () { return { events: [] }; }),
    ]).then(function (res) {
      var views = res[0];
      var engagement = res[1];
      _viewsCache[clientId] = views;
      _engagementCache[clientId] = engagement;

      _renderEngagementSummary(cl, views);
      _renderListingsSent(views);
      _renderFacts(cl, views);
    });
  }

  // ── Engagement Summary ──────────────────────────────────────────────
  function _renderEngagementSummary(cl, views) {
    var el = document.getElementById('buyer-engagement-summary');
    if (!el) return;

    var totalViews = views.total_views || 0;
    var listings = views.listings || [];
    var multiViewer = listings.filter(function (l) { return l.unique_viewers > 1; }).length;

    var h = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">';

    h += _statCard('fa-eye', '#3B82F6', totalViews, 'Total Views');
    h += _statCard('fa-paper-plane', '#6366F1', listings.length, 'Listings Tracked');
    h += _statCard('fa-users', '#8B5CF6', multiViewer, 'Shared (2+ viewers)');
    h += _statCard('fa-sign-in-alt', '#059669', cl.login_count || 0, 'Portal Logins');

    h += '</div>';
    el.innerHTML = h;
  }

  function _statCard(icon, color, value, label) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:#fff;border:1px solid #E5E7EB;border-radius:10px;">' +
      '<div style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:' + color + '15;color:' + color + ';font-size:13px;"><i class="fas ' + icon + '"></i></div>' +
      '<div><div style="font-size:18px;font-weight:800;color:#111;">' + value + '</div>' +
      '<div style="font-size:9px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.3px;">' + E(label) + '</div></div></div>';
  }

  // ── Listings Sent Table ─────────────────────────────────────────────
  function _renderListingsSent(views) {
    var el = document.getElementById('buyer-listings-sent');
    if (!el) return;

    var listings = views.listings || [];
    if (listings.length === 0) {
      el.innerHTML = '<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:20px;text-align:center;">' +
        '<i class="fas fa-paper-plane" style="font-size:24px;color:#D1D5DB;margin-bottom:8px;display:block;"></i>' +
        '<p style="font-size:12px;color:#9CA3AF;">No tracked listing views yet</p></div>';
      return;
    }

    var h = '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;">';
    h += '<div style="padding:12px 14px;border-bottom:1px solid #E5E7EB;">';
    h += '<span style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;">Listings Sent — View Tracking</span>';
    h += '</div>';

    h += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    h += '<thead><tr style="background:#FAFAFA;">';
    h += '<th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;color:#6B7280;">Listing</th>';
    h += '<th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;color:#6B7280;">Views</th>';
    h += '<th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;color:#6B7280;">Unique</th>';
    h += '<th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;color:#6B7280;">Last Viewed</th>';
    h += '<th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;color:#6B7280;">Device</th>';
    h += '</tr></thead><tbody>';

    for (var i = 0; i < listings.length; i++) {
      var l = listings[i];
      h += '<tr style="border-bottom:1px solid #F3F4F6;">';
      h += '<td style="padding:8px 12px;font-weight:600;">' + E(l.listing_id) + '</td>';
      h += '<td style="padding:8px 12px;text-align:right;">' + (l.total_views > 0 ? '<span style="font-weight:700;color:#3B82F6;">' + l.total_views + '</span>' : '<span style="color:#D1D5DB;">0</span>') + '</td>';
      h += '<td style="padding:8px 12px;text-align:right;">' + (l.unique_viewers > 1 ? '<span style="font-weight:700;color:#8B5CF6;">' + l.unique_viewers + '</span>' : (l.unique_viewers || 0)) + '</td>';
      h += '<td style="padding:8px 12px;text-align:right;font-size:11px;color:#6B7280;">' + (l.last_viewed ? _ago(l.last_viewed) : 'Never') + '</td>';

      var devIcons = Object.keys(l.devices || {}).map(function (d) {
        var icon = d === 'mobile' ? 'fa-mobile-alt' : d === 'tablet' ? 'fa-tablet-alt' : 'fa-desktop';
        return '<i class="fas ' + icon + '" style="color:#6B7280;" title="' + E(d) + ': ' + l.devices[d] + '"></i>';
      }).join(' ');
      h += '<td style="padding:8px 12px;text-align:center;">' + (devIcons || '<span style="color:#D1D5DB;">\u2014</span>') + '</td>';
      h += '</tr>';
    }

    h += '</tbody></table></div>';
    el.innerHTML = h;
  }

  // ── Facts (observable data, no scores) ──────────────────────────────
  function _renderFacts(cl, views) {
    var el = document.getElementById('buyer-facts');
    if (!el) return;

    var h = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';

    // Engagement timing
    h += '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:14px;">';
    h += '<div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Engagement Timing</div>';
    h += '<div style="font-size:12px;color:#374151;line-height:2;">';
    h += '<div style="display:flex;justify-content:space-between;"><span>Days since engagement</span><span style="font-weight:700;">' +
      (cl.last_click_at ? Math.max(0, Math.floor((Date.now() - new Date(cl.last_click_at)) / 86400000)) + 'd' : '\u2014') + '</span></div>';
    h += '<div style="display:flex;justify-content:space-between;"><span>Days since outreach</span><span style="font-weight:700;">' +
      (cl.last_contacted_at ? Math.max(0, Math.floor((Date.now() - new Date(cl.last_contacted_at)) / 86400000)) + 'd' : '\u2014') + '</span></div>';
    h += '<div style="display:flex;justify-content:space-between;"><span>Portal logins</span><span style="font-weight:700;">' + (cl.login_count || 0) + '</span></div>';
    h += '<div style="display:flex;justify-content:space-between;"><span>Last portal login</span><span style="font-weight:700;">' + (cl.last_login_at ? _ago(cl.last_login_at) : 'Never') + '</span></div>';
    h += '</div></div>';

    // View stats
    h += '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:14px;">';
    h += '<div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">View Stats</div>';
    h += '<div style="font-size:12px;color:#374151;line-height:2;">';
    var listings = views.listings || [];
    var totalViews = views.total_views || 0;
    var multiViewer = listings.filter(function (l) { return l.unique_viewers > 1; });
    h += '<div style="display:flex;justify-content:space-between;"><span>Total views</span><span style="font-weight:700;color:#3B82F6;">' + totalViews + '</span></div>';
    h += '<div style="display:flex;justify-content:space-between;"><span>Listings with sharing</span><span style="font-weight:700;">' + multiViewer.length + '</span></div>';

    // Budget vs behavior
    if (cl.pre_approved_amount) {
      h += '<div style="display:flex;justify-content:space-between;"><span>Budget</span><span style="font-weight:700;">' + $(Number(cl.pre_approved_amount)) + '</span></div>';
    }
    h += '</div></div>';

    h += '</div>';
    el.innerHTML = h;
  }

  // ── Convert Actions ─────────────────────────────────────────────────
  function _renderConvertActions(cl) {
    var h = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">';

    if (!cl.buyer_rep_agreement) {
      h += '<button style="font-size:11px;font-weight:700;padding:6px 14px;border-radius:8px;background:#B8860B;color:#fff;border:none;cursor:pointer;" ' +
        'onclick="BuyerWorkspace._buyerRepSigned(\'' + E(String(cl.id)) + '\')"><i class="fas fa-file-signature" style="margin-right:4px;"></i>Buyer Rep Signed</button>';
    } else {
      h += '<span style="font-size:10px;font-weight:700;padding:4px 10px;border-radius:6px;background:#ECFDF5;color:#059669;">\u2713 Buyer Rep Agreement</span>';
    }

    h += '<button style="font-size:11px;font-weight:700;padding:6px 14px;border-radius:8px;background:#F59E0B15;color:#B45309;border:1px solid #F59E0B;cursor:pointer;" ' +
      'onclick="BuyerWorkspace._convert(\'' + E(String(cl.id)) + '\',\'seller\')"><i class="fas fa-home" style="margin-right:4px;"></i>Convert to Seller</button>';
    h += '<button style="font-size:11px;font-weight:700;padding:6px 14px;border-radius:8px;background:#6366F115;color:#6366F1;border:1px solid #6366F1;cursor:pointer;" ' +
      'onclick="BuyerWorkspace._convert(\'' + E(String(cl.id)) + '\',\'renter\')"><i class="fas fa-key" style="margin-right:4px;"></i>Convert to Renter</button>';

    h += '</div>';
    return h;
  }

  // ── Action handlers ─────────────────────────────────────────────────
  function _buyerRepSigned(clientId) {
    if (!confirm('Mark buyer representative agreement as signed?')) return;
    MallanAPI._fetch('/api/crm/convert', {
      method: 'POST',
      body: JSON.stringify({ personId: clientId, action: 'buyer_rep_signed' }),
    }).then(function () {
      CRM.toast('Buyer rep agreement recorded', 'success');
      location.reload();
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _convert(clientId, targetRole) {
    if (!confirm('Add ' + targetRole + ' role to this client?')) return;
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

  return {
    renderBuyerSections: renderBuyerSections,
    _buyerRepSigned: _buyerRepSigned,
    _convert: _convert,
  };
})();
