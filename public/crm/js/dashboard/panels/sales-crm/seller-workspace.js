// =============================================================================
// SELLER WORKSPACE — Type-specific sections for seller clients
// Renders inside workspace.js overview tab (line 794)
// =============================================================================
/* global Utils, MallanAPI, CRM, Router */

var SellerWorkspace = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;
  var _ago = typeof Utils.formatTimeAgo === 'function' ? Utils.formatTimeAgo : function (d) { return D(d); };

  /**
   * renderSellerSections(cl) — returns HTML string injected into workspace overview.
   * Called from workspace.js:794 when clientType === 'seller'.
   */
  function renderSellerSections(cl) {
    var h = '';

    // ── Communication Strip ──
    h += _renderCommStrip(cl);

    // ── Listing Status ──
    h += _renderListingStatus(cl);

    // ── Entity / Attorney ──
    h += _renderEntityAttorney(cl);

    // ── Convert Actions ──
    h += _renderConvertActions(cl);

    return h;
  }

  // ── Communication Strip ─────────────────────────────────────────────
  function _renderCommStrip(cl) {
    var h = '<div style="display:flex;gap:12px;flex-wrap:wrap;padding:12px 16px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;margin-bottom:12px;align-items:center;">';

    // Preferred channel
    if (cl.preferred_channel) {
      var icons = { portal: 'fa-globe', email: 'fa-envelope', text: 'fa-sms', phone: 'fa-phone' };
      h += '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;background:#EFF6FF;color:#3B82F6;"><i class="fas ' + (icons[cl.preferred_channel] || 'fa-question') + '" style="margin-right:4px;"></i>' + E(cl.preferred_channel) + '</span>';
    }

    // Last reached out
    if (cl.last_contacted_at) {
      h += '<span style="font-size:11px;color:#6B7280;"><i class="fas fa-paper-plane" style="margin-right:4px;color:#9CA3AF;"></i>You: ' + _ago(cl.last_contacted_at) + '</span>';
    }

    // Last engaged
    if (cl.last_click_at) {
      h += '<span style="font-size:11px;color:#6B7280;"><i class="fas fa-mouse-pointer" style="margin-right:4px;color:#9CA3AF;"></i>Them: ' + _ago(cl.last_click_at) + '</span>';
    }

    // Gap
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

  // ── Listing Status ──────────────────────────────────────────────────
  function _renderListingStatus(cl) {
    var listingId = cl.active_sale_listing_id;

    var h = '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:14px 16px;margin-bottom:12px;">';
    h += '<div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Active Sale Listing</div>';

    if (listingId) {
      h += '<div style="display:flex;align-items:center;justify-content:space-between;">';
      h += '<div>';
      h += '<span style="font-size:14px;font-weight:700;color:#111;">' + E(listingId) + '</span>';
      if (cl.list_price) h += '<span style="font-size:13px;color:#059669;font-weight:700;margin-left:12px;">' + $(Number(cl.list_price)) + '</span>';
      h += '</div>';
      h += '<button style="font-size:11px;font-weight:700;padding:5px 12px;border-radius:6px;background:#EFF6FF;color:#3B82F6;border:none;cursor:pointer;" ' +
        'onclick="Router.navigate(\'/workspace/listing/' + E(listingId) + '/overview\')"><i class="fas fa-external-link-alt" style="margin-right:4px;"></i>View Listing</button>';
      h += '</div>';
    } else {
      h += '<div style="display:flex;align-items:center;justify-content:space-between;">';
      h += '<span style="font-size:12px;color:#9CA3AF;">No active sale listing</span>';
      h += '<button style="font-size:11px;font-weight:700;padding:5px 12px;border-radius:6px;background:#B8860B;color:#fff;border:none;cursor:pointer;" ' +
        'onclick="SellerWorkspace._createListing(\'' + E(String(cl.id)) + '\')"><i class="fas fa-plus" style="margin-right:4px;"></i>Create Listing</button>';
      h += '</div>';
    }

    h += '</div>';
    return h;
  }

  // ── Entity / Attorney ───────────────────────────────────────────────
  function _renderEntityAttorney(cl) {
    if (!cl.entity_name && !cl.attorney_name) return '';

    var h = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">';

    // Entity
    if (cl.entity_name) {
      h += '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:12px 14px;">';
      h += '<div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Entity</div>';
      h += '<div style="font-size:13px;font-weight:700;color:#111;">' + E(cl.entity_name) + '</div>';
      if (cl.entity_type) h += '<div style="font-size:11px;color:#6B7280;">' + E(cl.entity_type) + '</div>';
      h += '</div>';
    }

    // Attorney
    if (cl.attorney_name) {
      h += '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:12px 14px;">';
      h += '<div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Attorney</div>';
      h += '<div style="font-size:13px;font-weight:700;color:#111;">' + E(cl.attorney_name) + '</div>';
      if (cl.attorney_phone) h += '<div style="font-size:11px;color:#6B7280;"><i class="fas fa-phone" style="margin-right:4px;width:12px;"></i>' + E(cl.attorney_phone) + '</div>';
      if (cl.attorney_email) h += '<div style="font-size:11px;color:#6B7280;"><i class="fas fa-envelope" style="margin-right:4px;width:12px;"></i>' + E(cl.attorney_email) + '</div>';
      h += '</div>';
    }

    h += '</div>';
    return h;
  }

  // ── Convert Actions ─────────────────────────────────────────────────
  function _renderConvertActions(cl) {
    var h = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">';
    h += '<button style="font-size:11px;font-weight:700;padding:6px 14px;border-radius:8px;background:#3B82F615;color:#3B82F6;border:1px solid #3B82F6;cursor:pointer;" ' +
      'onclick="SellerWorkspace._convert(\'' + E(String(cl.id)) + '\',\'buyer\')"><i class="fas fa-shopping-cart" style="margin-right:4px;"></i>Convert to Buyer</button>';
    h += '<button style="font-size:11px;font-weight:700;padding:6px 14px;border-radius:8px;background:#6366F115;color:#6366F1;border:1px solid #6366F1;cursor:pointer;" ' +
      'onclick="SellerWorkspace._convert(\'' + E(String(cl.id)) + '\',\'renter\')"><i class="fas fa-key" style="margin-right:4px;"></i>Convert to Renter</button>';
    h += '<button style="font-size:11px;font-weight:700;padding:6px 14px;border-radius:8px;background:#8B5CF615;color:#8B5CF6;border:1px solid #8B5CF6;cursor:pointer;" ' +
      'onclick="SellerWorkspace._convert(\'' + E(String(cl.id)) + '\',\'landlord\')"><i class="fas fa-building" style="margin-right:4px;"></i>Convert to Landlord</button>';
    h += '</div>';
    return h;
  }

  // ── Action handlers ─────────────────────────────────────────────────
  function _createListing(clientId) {
    if (!confirm('Create a new sale listing for this seller?')) return;
    MallanAPI._fetch('/api/crm/convert', {
      method: 'POST',
      body: JSON.stringify({
        personId: clientId,
        action: 'promote_to_listing',
        listingDraft: { listing_type: 'sale', address: 'TBD' },
      }),
    }).then(function (res) {
      CRM.toast('Listing ' + (res.listingId || '') + ' created', 'success');
      if (res.listingId) Router.navigate('/workspace/listing/' + res.listingId + '/overview');
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
    renderSellerSections: renderSellerSections,
    _createListing: _createListing,
    _convert: _convert,
  };
})();
