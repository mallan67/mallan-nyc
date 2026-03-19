// ═══════════════════════════════════════════════════════════════════════════════
// LISTING WORKSPACE EXTENSIONS — Enhanced views for sale listings
// Behavioral tracking per recipient, marketing status, enhanced health
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, Router, Store, UI, Utils, MallanAPI, Workspace, Events */

var ListingWorkspaceExt = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  // ═══════════════════════════════════════════════════════════════════════
  // OVERVIEW ENHANCEMENT — Marketing Status + Behavioral Summary
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Render additional overview sections for the listing workspace.
   * Called from listing overview after the standard stats.
   * @param {Object} l - listing data
   * @param {string} listingId
   * @returns {string} HTML
   */
  function renderListingOverviewExtra(l, listingId) {
    var html = '';

    // Marketing Status
    html += _marketingStatusCard(l);

    // Behavioral Summary (aggregated from sent-to events)
    html += _behavioralSummaryCard(l, listingId);

    // Seller Connection
    html += _sellerConnectionCard(l);

    return html;
  }

  // ─── Card helper ──────────────────────────────────────────────────────
  function _card(icon, title, bodyHtml, borderColor) {
    var borderCls = borderColor ? ' border-l-4' : '';
    var borderStyle = borderColor ? ' style="border-left-color:' + borderColor + '"' : '';
    return '<div class="border rounded-xl bg-white shadow-sm overflow-hidden' + borderCls + '"' + borderStyle + '>' +
      '<div class="px-4 py-3 border-b bg-gray-50">' +
        '<h3 class="text-sm font-bold text-gray-700"><i class="fas fa-' + icon + ' mr-2 text-gray-400"></i>' + title + '</h3>' +
      '</div>' +
      '<div class="px-4 py-3">' + bodyHtml + '</div>' +
    '</div>';
  }

  // ─── Marketing Status ─────────────────────────────────────────────────
  function _marketingStatusCard(l) {
    // Distribution gates
    var gates = [
      { key: 'idx_display_yn', label: 'IDX Display', icon: 'fa-globe' },
      { key: 'internet_entire_listing_display_yn', label: 'Internet Display', icon: 'fa-wifi' },
      { key: 'internet_address_display_yn', label: 'Address Visible', icon: 'fa-map-marker-alt' },
    ];

    var body = '<div class="space-y-3">';

    // Distribution gates
    body += '<div><p class="text-xs font-bold text-gray-500 uppercase mb-2">Distribution Gates</p>' +
      '<div class="grid grid-cols-3 gap-2">';
    gates.forEach(function (g) {
      var val = l[g.key];
      if (val === undefined || val === null) val = true;
      body += '<div class="flex items-center gap-2 p-2 rounded ' + (val ? 'bg-green-50' : 'bg-red-50') + '">' +
        '<i class="fas ' + (val ? 'fa-check-circle text-green-500' : 'fa-times-circle text-red-500') + ' text-sm"></i>' +
        '<span class="text-xs ' + (val ? 'text-green-700' : 'text-red-700') + '">' + E(g.label) + '</span>' +
      '</div>';
    });
    body += '</div></div>';

    // Special flags
    var flags = [];
    if (l.participant_only) flags.push({ label: 'Participant Only', color: 'bg-yellow-100 text-yellow-700' });
    if (l.owner_opt_out) flags.push({ label: 'Owner Opt-Out', color: 'bg-red-100 text-red-700' });
    if (l.rls_eligible === false) flags.push({ label: 'Website Only', color: 'bg-purple-100 text-purple-700' });

    if (flags.length > 0) {
      body += '<div class="flex flex-wrap gap-1">';
      flags.forEach(function (f) {
        body += '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + f.color + '">' + E(f.label) + '</span>';
      });
      body += '</div>';
    }

    // Syndication portals (based on distribution gate state)
    var syndicationPortals = [
      { name: 'StreetEasy', method: 'Direct Upload', auto: false },
      { name: 'Realtor.com', method: 'REBNY License', auto: true },
      { name: 'Redfin', method: 'REBNY License', auto: true },
      { name: 'Zillow/Trulia', method: 'Via StreetEasy', auto: false },
    ];

    body += '<div class="mt-3"><p class="text-xs font-bold text-gray-500 uppercase mb-2">Syndication</p>' +
      '<div class="space-y-1">';
    syndicationPortals.forEach(function (p) {
      var active = l.idx_display_yn !== false && l.rls_eligible !== false;
      body += '<div class="flex items-center justify-between py-1 text-sm">' +
        '<span class="text-gray-700">' + E(p.name) + '</span>' +
        '<div class="flex items-center gap-2">' +
          '<span class="text-[10px] text-gray-400">' + E(p.method) + '</span>' +
          '<span class="w-2 h-2 rounded-full ' + (active || p.auto ? 'bg-green-500' : 'bg-gray-300') + '"></span>' +
        '</div>' +
      '</div>';
    });
    body += '</div></div>';

    body += '</div>';
    return _card('bullhorn', 'Marketing & Distribution', body, '#3B82F6');
  }

  // ─── Behavioral Summary ───────────────────────────────────────────────
  function _behavioralSummaryCard(l, listingId) {
    var sentEvents = Events.getByEntity('listing', listingId).filter(function (e) {
      return e.type === 'listing_sent' || e.type === 'quick_send_executed';
    });
    var viewEvents = Events.getByEntity('listing', listingId).filter(function (e) {
      return e.type === 'listing_view' || e.type === 'portal_listing_view';
    });
    var reactionEvents = Events.getByEntity('listing', listingId).filter(function (e) {
      return e.type === 'client_liked' || e.type === 'client_disliked' || e.type === 'client_discuss';
    });
    var calcEvents = Events.getByEntity('listing', listingId).filter(function (e) {
      return e.type === 'calculator_used';
    });
    var showingRequests = Events.getByEntity('listing', listingId).filter(function (e) {
      return e.type === 'showing_request';
    });

    var sentCount = sentEvents.length;
    var viewCount = viewEvents.length;
    var reactionCount = reactionEvents.length;
    var calcCount = calcEvents.length;
    var showingReqCount = showingRequests.length;
    var conversionRate = sentCount > 0 ? Math.round((showingReqCount / sentCount) * 100) : 0;

    var body = '<div class="grid grid-cols-5 gap-2 text-center">' +
      '<div class="p-2 bg-blue-50 rounded-lg">' +
        '<p class="text-lg font-bold text-blue-700">' + sentCount + '</p>' +
        '<p class="text-[10px] text-gray-500">Sent</p></div>' +
      '<div class="p-2 bg-purple-50 rounded-lg">' +
        '<p class="text-lg font-bold text-purple-700">' + viewCount + '</p>' +
        '<p class="text-[10px] text-gray-500">Views</p></div>' +
      '<div class="p-2 bg-pink-50 rounded-lg">' +
        '<p class="text-lg font-bold text-pink-700">' + reactionCount + '</p>' +
        '<p class="text-[10px] text-gray-500">Reactions</p></div>' +
      '<div class="p-2 bg-amber-50 rounded-lg">' +
        '<p class="text-lg font-bold text-amber-700">' + calcCount + '</p>' +
        '<p class="text-[10px] text-gray-500">Calc Used</p></div>' +
      '<div class="p-2 bg-green-50 rounded-lg">' +
        '<p class="text-lg font-bold text-green-700">' + showingReqCount + '</p>' +
        '<p class="text-[10px] text-gray-500">Showings</p></div>' +
    '</div>';

    // Conversion funnel
    if (sentCount > 0) {
      var viewRate = Math.round((viewCount / sentCount) * 100);
      var reactRate = Math.round((reactionCount / sentCount) * 100);

      body += '<div class="mt-3">' +
        '<p class="text-xs font-bold text-gray-500 uppercase mb-2">Engagement Funnel</p>' +
        '<div class="space-y-1">';

      var funnelSteps = [
        { label: 'Sent', count: sentCount, pct: 100, color: '#3B82F6' },
        { label: 'Viewed', count: viewCount, pct: viewRate, color: '#8B5CF6' },
        { label: 'Reacted', count: reactionCount, pct: reactRate, color: '#EC4899' },
        { label: 'Showing', count: showingReqCount, pct: conversionRate, color: '#059669' },
      ];

      funnelSteps.forEach(function (step) {
        body += '<div class="flex items-center gap-2">' +
          '<span class="text-xs text-gray-500 w-16">' + step.label + '</span>' +
          '<div class="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">' +
            '<div class="h-full rounded-full" style="width:' + Math.max(2, step.pct) + '%;background:' + step.color + '"></div>' +
          '</div>' +
          '<span class="text-xs font-bold w-16 text-right">' + step.count + ' (' + step.pct + '%)</span>' +
        '</div>';
      });
      body += '</div></div>';
    }

    // Recommended actions
    var actions = [];
    if (sentCount === 0) actions.push('Send this listing to matching buyers');
    if (sentCount > 5 && viewCount === 0) actions.push('Low view rate — check if listing displays correctly');
    if (viewCount > 5 && reactionCount === 0) actions.push('Views but no reactions — listing may need better description or photos');
    if (reactionCount > 3 && showingReqCount === 0) actions.push('Interest but no showings — consider proactive outreach');

    if (actions.length > 0) {
      body += '<div class="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">' +
        '<p class="font-bold mb-1"><i class="fas fa-lightbulb mr-1"></i> Recommended</p>';
      actions.forEach(function (a) {
        body += '<p class="ml-4">&bull; ' + E(a) + '</p>';
      });
      body += '</div>';
    }

    return _card('chart-pie', 'Behavioral Engagement', body, '#8B5CF6');
  }

  // ─── Seller Connection ────────────────────────────────────────────────
  function _sellerConnectionCard(l) {
    var agentId = l.assignedAgentId || l.assigned_agent_id || l.agent_id;
    var sellerId = l.seller_lead_id || l.seller_id;

    var body = '<div class="space-y-2 text-sm">';

    if (agentId) {
      body += '<div class="flex items-center justify-between">' +
        '<span class="text-gray-500">Listing Agent</span>' +
        '<span class="font-medium">' + E(l.agent_name || agentId) + '</span>' +
      '</div>';
    }

    body += '<div class="flex items-center justify-between">' +
      '<span class="text-gray-500">Listing Type</span>' +
      '<span class="font-medium">' + E(l.listing_type || l.PropertyType || '-') + '</span>' +
    '</div>';

    body += '<div class="flex items-center justify-between">' +
      '<span class="text-gray-500">Source</span>' +
      '<span class="font-medium">' + E(l.source || 'Manual') + '</span>' +
    '</div>';

    var syncedAt = l.syncedAt || l.synced_at || l.updated_at;
    if (syncedAt) {
      body += '<div class="flex items-center justify-between">' +
        '<span class="text-gray-500">Last Sync</span>' +
        '<span class="font-medium">' + Utils.formatTimeAgo(syncedAt) + '</span>' +
      '</div>';
    }

    body += '</div>';
    return _card('link', 'Listing Details', body);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ENHANCED SENT-TO TAB — Behavioral per recipient
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Render behavioral tracking details for a specific client-listing pair.
   * @param {string} clientId
   * @param {string} listingId
   * @returns {string} HTML badges showing behavioral signals
   */
  function renderClientBehavior(clientId, listingId) {
    var events = Events.getByEntity('listing', listingId);
    var clientEvents = events.filter(function (e) {
      var eid = e.payload ? (e.payload.clientId || e.payload.client_id) : null;
      return eid === clientId;
    });

    var viewed = clientEvents.some(function (e) { return e.type === 'listing_view' || e.type === 'portal_listing_view'; });
    var usedCalc = clientEvents.some(function (e) { return e.type === 'calculator_used'; });
    var savedFav = clientEvents.some(function (e) { return e.type === 'saved_favorite'; });
    var requestedShowing = clientEvents.some(function (e) { return e.type === 'showing_request'; });
    var returnVisits = clientEvents.filter(function (e) { return e.type === 'listing_view' || e.type === 'portal_listing_view'; }).length;

    var badges = '';
    if (viewed) badges += '<span class="text-[9px] px-1 py-0.5 bg-purple-100 text-purple-600 rounded">Viewed</span>';
    if (returnVisits > 1) badges += '<span class="text-[9px] px-1 py-0.5 bg-blue-100 text-blue-600 rounded">' + returnVisits + 'x</span>';
    if (usedCalc) badges += '<span class="text-[9px] px-1 py-0.5 bg-amber-100 text-amber-600 rounded">Calc</span>';
    if (savedFav) badges += '<span class="text-[9px] px-1 py-0.5 bg-pink-100 text-pink-600 rounded">Saved</span>';
    if (requestedShowing) badges += '<span class="text-[9px] px-1 py-0.5 bg-green-100 text-green-600 rounded">Showing</span>';

    return badges;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════
  return {
    renderListingOverviewExtra: renderListingOverviewExtra,
    renderClientBehavior: renderClientBehavior,
  };
})();
