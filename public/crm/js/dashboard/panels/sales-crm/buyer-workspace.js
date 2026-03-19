// ═══════════════════════════════════════════════════════════════════════════════
// BUYER WORKSPACE — Full workspace renderer (Prospect + Active modes)
// Prospect: qualifier, preferences, story, attorney, send listing, investor
// Active: listings sent w/ behavioral tracking, reactions, showings, offers, docs
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, Router, Store, UI, Utils, MallanAPI, Workspace, ClientNormalizer, Documents, Events */

var BuyerWorkspace = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  // ═══════════════════════════════════════════════════════════════════════
  // SHARED HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  function _card(icon, title, editFn, bodyHtml, borderColor) {
    var borderCls = borderColor ? ' border-l-4' : '';
    var borderStyle = borderColor ? ' style="border-left-color:' + borderColor + '"' : '';
    return '<div class="border rounded-xl bg-white shadow-sm overflow-hidden' + borderCls + '"' + borderStyle + '>' +
      '<div class="flex items-center justify-between px-4 py-3 border-b bg-gray-50">' +
        '<h3 class="text-sm font-bold text-gray-700"><i class="fas fa-' + icon + ' mr-2 text-gray-400"></i>' + title + '</h3>' +
        (editFn ? '<button class="text-xs text-gray-500 hover:text-gray-800 font-medium" onclick="' + editFn + '"><i class="fas fa-pen mr-1"></i>Edit</button>' : '') +
      '</div>' +
      '<div class="px-4 py-3">' + bodyHtml + '</div>' +
    '</div>';
  }

  function _displayName(cl) {
    return cl._displayName || ClientNormalizer.displayName(cl) || cl.name || cl.email || 'Client';
  }

  function _parseJson(val, fallback) {
    if (!val) return fallback;
    if (typeof val !== 'string') return val;
    try { return JSON.parse(val); } catch (e) { return fallback; }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PROSPECT MODE
  // ═══════════════════════════════════════════════════════════════════════

  function renderProspect(client, container, clientId) {
    var cl = ClientNormalizer.normalize(client);
    var name = _displayName(cl);
    var prefs = cl.preferences || {};
    var hasSecondary = cl.secondary_first_name || cl.secondary_last_name;
    var secondaryName = hasSecondary ? ((cl.secondary_first_name || '') + ' ' + (cl.secondary_last_name || '')).trim() : '';

    var html = '<div class="space-y-4">';

    // ── Back nav ──
    html += '<div class="flex items-center gap-2">' +
      '<button class="text-sm text-gray-500 hover:text-gray-700" onclick="Router.navigate(\'/sales/buyer-prospects\')"><i class="fas fa-arrow-left mr-1"></i> Buyer Prospects</button>' +
    '</div>';

    // ── Header ──
    html += '<div class="workspace-header">' +
      '<div class="flex items-center justify-between">' +
        '<div class="flex items-center gap-4">' +
          UI.avatar(name, 48) +
          '<div>' +
            '<h2 class="text-xl font-bold text-gray-900">' + E(name) + '</h2>' +
            '<div class="flex items-center gap-2 mt-1">' +
              UI.roleBadge('buyer') +
              UI.stageBadge('prospect') +
              (cl.is_investor ? '<span class="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-bold">Investor</span>' : '') +
            '</div>' +
          '</div>' +
          (hasSecondary ? UI.avatar(secondaryName, 40) : '') +
        '</div>' +
        '<div class="flex gap-2">' +
          '<button class="btn btn-sm btn-outline" onclick="Workspace.editClient()"><i class="fas fa-edit"></i> Edit</button>' +
        '</div>' +
      '</div>' +
      '<div class="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">' +
        (cl.email ? '<span><i class="fas fa-envelope mr-1"></i>' + E(cl.email) + '</span>' : '') +
        (cl.phone ? '<span><i class="fas fa-phone mr-1"></i>' + E(cl.phone) + '</span>' : '') +
        (hasSecondary && cl.secondary_email ? '<span class="text-gray-400">|</span><span><i class="fas fa-envelope mr-1"></i>' + E(cl.secondary_email) + '</span>' : '') +
        (hasSecondary && cl.secondary_phone ? '<span><i class="fas fa-phone mr-1"></i>' + E(cl.secondary_phone) + '</span>' : '') +
        (cl.source ? '<span><i class="fas fa-tag mr-1"></i>Source: ' + E(cl.source) + '</span>' : '') +
      '</div>' +
    '</div>';

    // ── Action Bar ──
    html += '<div class="workspace-action-bar">' +
      '<div class="action-group">' +
        '<button class="btn btn-sm btn-gold" onclick="BuyerWorkspace._convertToActive(\'' + E(clientId) + '\')"><i class="fas fa-file-signature mr-1"></i> Buyer Rep Signed</button>' +
        '<button class="btn btn-sm btn-outline" onclick="CRM.quickSendListing()"><i class="fas fa-paper-plane"></i> <span class="hidden sm:inline">Send Listing</span></button>' +
        '<button class="btn btn-sm btn-outline" onclick="Workspace._quickAddNote()"><i class="fas fa-sticky-note"></i> <span class="hidden sm:inline">Add Note</span></button>' +
        '<button class="btn btn-sm btn-outline" onclick="Workspace._scheduleShowing()"><i class="fas fa-calendar"></i> <span class="hidden sm:inline">Schedule Showing</span></button>' +
      '</div>' +
      '<div class="action-group">' +
        (cl.email ? '<a href="mailto:' + E(cl.email) + '" class="btn btn-sm btn-outline"><i class="fas fa-envelope"></i></a>' : '') +
        (cl.phone ? '<a href="tel:' + E(cl.phone) + '" class="btn btn-sm btn-outline"><i class="fas fa-phone"></i></a>' : '') +
      '</div>' +
    '</div>';

    // ── Main + Right Rail ──
    html += '<div class="flex gap-4">';

    // Main content (70%)
    html += '<div class="flex-1 min-w-0"><div class="space-y-4">';

    // Qualifier Panel
    html += _qualifierCard(cl);

    // What They're Looking For
    html += _preferencesCard(cl, prefs);

    // Their Story
    html += _storyCard(cl);

    // Attorney Info
    html += _attorneyCard(cl);

    // Send Listing tool
    html += _sendListingCard(clientId);

    // Investor sections
    if (cl.is_investor) {
      html += _investorIntakeCard(cl);
      html += _exchange1031Card(cl);
      html += _investorToolsCard();
    }

    html += '</div></div>'; // close main

    // Right rail (30%)
    html += '<div class="hidden lg:block w-72 flex-shrink-0"><div class="space-y-3">';
    html += _prospectRightRail(cl, clientId);
    html += '</div></div>';

    html += '</div>'; // close flex
    html += '</div>'; // close space-y

    container.innerHTML = html;

    // Async fetches
    setTimeout(function () { _fetchConviction(clientId); }, 0);
    setTimeout(function () { _fetchLeadScore(clientId); }, 0);
    setTimeout(function () { _fetchNextBestAction(clientId); }, 0);
  }

  // ─── Qualifier Panel ────────────────────────────────────────────────
  function _qualifierCard(cl) {
    var income = Number(cl.annual_income) || 0;
    var monthlyDebt = Number(cl.monthly_debt) || 0;
    var funds = Number(cl.available_funds || cl.down_payment) || 0;
    var preApproved = cl.pre_approved || cl.pre_approval_status === 'approved';
    var preApprovalAmt = Number(cl.pre_approved_amount || cl.pre_approval_amount) || 0;

    // DTI calculations
    var monthlyIncome = income / 12;
    var dti = monthlyIncome > 0 ? ((monthlyDebt / monthlyIncome) * 100).toFixed(1) : 0;
    var frontEnd28 = Math.round(monthlyIncome * 0.28);
    var backEnd36 = Math.round(monthlyIncome * 0.36);
    var availableForHousing = Math.max(0, backEnd36 - monthlyDebt);

    // Estimate max purchase price (30yr fixed ~6.5%)
    var rate = 0.065 / 12;
    var maxLoan = availableForHousing > 0 ? Math.round(availableForHousing * ((Math.pow(1 + rate, 360) - 1) / (rate * Math.pow(1 + rate, 360)))) : 0;
    var maxPurchase = maxLoan + funds;

    var dtiColor = dti <= 28 ? 'text-green-600' : dti <= 36 ? 'text-yellow-600' : 'text-red-600';
    var dtiLabel = dti <= 28 ? 'Healthy' : dti <= 36 ? 'Moderate' : 'High';

    var body = '<div class="grid grid-cols-2 gap-4 text-sm">' +
      '<div class="space-y-2">' +
        '<p class="text-xs font-bold text-gray-500 uppercase mb-1">Income & Debt</p>' +
        '<div class="flex justify-between"><span class="text-gray-500">Annual Income</span><span class="font-medium text-gray-900">' + (income ? '$' + income.toLocaleString() : '-') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">Monthly Debt</span><span class="font-medium text-gray-900">' + (monthlyDebt ? '$' + monthlyDebt.toLocaleString() : '-') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">DTI Ratio</span><span class="font-medium ' + dtiColor + '">' + dti + '% (' + E(dtiLabel) + ')</span></div>' +
      '</div>' +
      '<div class="space-y-2">' +
        '<p class="text-xs font-bold text-gray-500 uppercase mb-1">Funds & Approval</p>' +
        '<div class="flex justify-between"><span class="text-gray-500">Available Funds</span><span class="font-medium text-gray-900">' + (funds ? '$' + funds.toLocaleString() : '-') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">Pre-Approval</span><span class="font-medium ' + (preApproved ? 'text-green-600' : 'text-gray-400') + '">' + (preApproved ? 'Approved' : 'Not Yet') + '</span></div>' +
        (preApproved && preApprovalAmt ? '<div class="flex justify-between"><span class="text-gray-500">Amount</span><span class="font-medium text-green-600">$' + preApprovalAmt.toLocaleString() + '</span></div>' : '') +
      '</div>' +
    '</div>';

    // Max purchase estimate
    if (income > 0) {
      body += '<div class="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">' +
        '<div class="flex items-center justify-between">' +
          '<div>' +
            '<p class="text-xs text-gray-500">Estimated Max Purchase Price</p>' +
            '<p class="text-lg font-bold text-blue-700">$' + maxPurchase.toLocaleString() + '</p>' +
          '</div>' +
          '<div class="text-right text-xs text-gray-500">' +
            '<p>28% front-end: $' + frontEnd28.toLocaleString() + '/mo</p>' +
            '<p>36% back-end: $' + backEnd36.toLocaleString() + '/mo</p>' +
          '</div>' +
        '</div>' +
        '<p class="text-[10px] text-gray-400 mt-1">Based on 30yr fixed @ 6.5%, 20% down, 28/36 DTI rule</p>' +
      '</div>';
    }

    return _card('calculator', 'Qualifier Panel', 'Workspace._editFinancials()', body, '#3B82F6');
  }

  // ─── Preferences Card ──────────────────────────────────────────────
  function _preferencesCard(cl, prefs) {
    var body = '<div class="space-y-2 text-sm">' +
      '<div class="flex justify-between"><span class="text-gray-500">Neighborhoods</span><span class="font-medium text-gray-900 text-right truncate ml-2">' + E((prefs.neighborhoods || []).join(', ') || '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Building Type</span><span class="font-medium text-gray-900">' + E(prefs.propertyType || '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Budget</span><span class="font-medium text-gray-900">' + (prefs.minPrice || prefs.maxPrice ? (prefs.minPrice ? $(prefs.minPrice) : '$0') + ' - ' + (prefs.maxPrice ? $(prefs.maxPrice) : 'No max') : '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Beds / Baths</span><span class="font-medium text-gray-900">' + (prefs.minBeds || '-') + ' bd / ' + (prefs.minBaths || '-') + ' ba</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Must-Haves</span><span class="font-medium text-gray-900 text-right truncate ml-2">' + E(prefs.mustHaves || '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Deal-Breakers</span><span class="font-medium text-red-600 text-right truncate ml-2">' + E(prefs.dealBreakers || '-') + '</span></div>' +
    '</div>';

    return _card('sliders-h', 'What They\'re Looking For', 'Workspace._editPreferences()', body);
  }

  // ─── Their Story Card ──────────────────────────────────────────────
  function _storyCard(cl) {
    var body = '<div class="space-y-2 text-sm">' +
      '<div class="flex justify-between"><span class="text-gray-500">Notes</span><span class="font-medium text-gray-900 text-right truncate ml-2">' + E(cl.notes || '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Next Follow-up</span><span class="font-medium text-gray-900">' + (cl.next_follow_up ? D(cl.next_follow_up) : '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Last Contacted</span><span class="font-medium text-gray-900">' + (cl.last_contacted_at ? D(cl.last_contacted_at) : '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Employer</span><span class="font-medium text-gray-900 text-right truncate ml-2">' + E(cl.employer || '-') + '</span></div>' +
    '</div>';

    return _card('book-open', 'Their Story', 'BuyerWorkspace._editStory()', body);
  }

  // ─── Attorney Card ─────────────────────────────────────────────────
  function _attorneyCard(cl) {
    var hasAttorney = cl.attorney_name || cl.attorney_email || cl.attorney_phone;
    var body = '';
    if (hasAttorney) {
      body = '<div class="space-y-2 text-sm">' +
        '<div class="flex justify-between"><span class="text-gray-500">Name</span><span class="font-medium text-gray-900">' + E(cl.attorney_name || '-') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">Firm</span><span class="font-medium text-gray-900">' + E(cl.attorney_firm || '-') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">Email</span><span class="font-medium text-gray-900">' + E(cl.attorney_email || '-') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">Phone</span><span class="font-medium text-gray-900">' + E(cl.attorney_phone || '-') + '</span></div>' +
      '</div>';
    } else {
      body = '<div class="text-center py-3">' +
        '<i class="fas fa-gavel text-2xl text-gray-300 mb-2"></i>' +
        '<p class="text-xs text-gray-400 mb-2">No attorney on file</p>' +
        '<button class="btn btn-xs btn-outline" onclick="BuyerWorkspace._editAttorney()"><i class="fas fa-plus mr-1"></i> Add Attorney</button>' +
      '</div>';
    }
    return _card('gavel', 'Attorney Info', hasAttorney ? 'BuyerWorkspace._editAttorney()' : '', body);
  }

  // ─── Send Listing Tool Card ────────────────────────────────────────
  function _sendListingCard(clientId) {
    var body = '<div class="space-y-3">' +
      '<div class="flex gap-2">' +
        '<input id="bwSearchInput" class="flex-1 border rounded px-3 py-2 text-sm" placeholder="Search by address, MLS#, or neighborhood...">' +
        '<button class="btn btn-sm btn-gold" onclick="BuyerWorkspace._searchAndSend(\'' + E(clientId) + '\')"><i class="fas fa-search mr-1"></i> Find</button>' +
      '</div>' +
      '<div id="bwSearchResults"></div>' +
      '<p class="text-[10px] text-gray-400"><i class="fas fa-info-circle mr-1"></i>Sent listings are tracked: views, dwell time, calculator usage, saves, and showing requests are recorded for behavioral analysis.</p>' +
    '</div>';

    return _card('paper-plane', 'Send Listing', '', body, '#B8860B');
  }

  // ─── Prospect Right Rail ───────────────────────────────────────────
  function _prospectRightRail(cl, clientId) {
    var html = '';

    // Quick Actions
    html += '<div class="card p-3"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Quick Actions</h4>' +
      '<div class="space-y-1">' +
        '<button class="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-gray-50" onclick="Workspace._quickAddNote()"><i class="fas fa-sticky-note text-xs text-gray-400 mr-2 w-4"></i>Add Note</button>' +
        '<button class="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-gray-50" onclick="Workspace._quickAddTask()"><i class="fas fa-tasks text-xs text-gray-400 mr-2 w-4"></i>Add Task</button>' +
        '<button class="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-gray-50" onclick="Workspace._scheduleShowing()"><i class="fas fa-calendar text-xs text-gray-400 mr-2 w-4"></i>Schedule Showing</button>' +
        '<button class="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-gray-50" onclick="Workspace._generateCMA()"><i class="fas fa-chart-bar text-xs text-gray-400 mr-2 w-4"></i>Run CMA</button>' +
        '<button class="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-gray-50 text-red-600" onclick="Workspace._deleteClient()"><i class="fas fa-trash text-xs mr-2 w-4"></i>Delete Client</button>' +
      '</div>' +
    '</div>';

    // Lead Score placeholder
    html += '<div class="card p-3" id="bwLeadScoreRail">' +
      '<h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Lead Score</h4>' +
      UI.loading() +
    '</div>';

    // Conviction Score placeholder
    html += '<div class="card p-3" id="bwConvictionRail">' +
      '<h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Conviction Score</h4>' +
      '<div id="buyerConvictionDisplay">' +
        '<div class="flex items-center justify-center py-4">' +
          '<div class="w-20 h-20 rounded-full border-4 border-gray-200 flex items-center justify-center">' +
            '<span class="text-2xl font-bold text-gray-300">-</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

    // Next Best Action placeholder
    html += '<div class="card p-3" id="bwNextActionRail">' +
      '<h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Next Best Action</h4>' +
      '<p class="text-xs text-gray-400 text-center py-2">Loading...</p>' +
    '</div>';

    return html;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ACTIVE MODE
  // ═══════════════════════════════════════════════════════════════════════

  var _activeTab = 'listings_sent';
  var _activeClientId = null;
  var _activeClient = null;

  var ACTIVE_TABS = [
    { id: 'listings_sent', label: 'Listings Sent', icon: 'fa-paper-plane' },
    { id: 'reactions',     label: 'Reactions',     icon: 'fa-heart' },
    { id: 'showings',      label: 'Showings',      icon: 'fa-calendar' },
    { id: 'offers',        label: 'Offers',        icon: 'fa-file-invoice-dollar' },
    { id: 'documents',     label: 'Documents',     icon: 'fa-folder' },
    { id: 'communication', label: 'Communication', icon: 'fa-comments' },
    { id: 'activity',      label: 'Activity',      icon: 'fa-stream' },
  ];

  function renderActive(client, container, clientId) {
    var cl = ClientNormalizer.normalize(client);
    _activeClient = cl;
    _activeClientId = clientId;
    _activeTab = 'listings_sent';

    var name = _displayName(cl);
    var prefs = cl.preferences || {};
    var budget = prefs.minPrice || prefs.maxPrice
      ? (prefs.minPrice ? $(prefs.minPrice) : '$0') + ' - ' + (prefs.maxPrice ? $(prefs.maxPrice) : 'No max')
      : '';

    var html = '<div class="space-y-4">';

    // ── Back nav ──
    html += '<div class="flex items-center gap-2">' +
      '<button class="text-sm text-gray-500 hover:text-gray-700" onclick="Router.navigate(\'/sales/buyers\')"><i class="fas fa-arrow-left mr-1"></i> Active Buyers</button>' +
    '</div>';

    // ── Header ──
    html += '<div class="workspace-header">' +
      '<div class="flex items-center justify-between">' +
        '<div class="flex items-center gap-4">' +
          UI.avatar(name, 48) +
          '<div>' +
            '<h2 class="text-xl font-bold text-gray-900">' + E(name) + '</h2>' +
            '<div class="flex items-center gap-2 mt-1">' +
              UI.roleBadge('buyer') +
              UI.stageBadge(cl.pipeline_stage || cl.stage || 'active_buyer') +
              (cl.is_investor ? '<span class="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-bold">Investor</span>' : '') +
              (budget ? '<span class="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">' + E(budget) + '</span>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-3">' +
          '<div id="bwActiveConviction" class="text-center"></div>' +
          '<button class="btn btn-sm btn-outline" onclick="Workspace.editClient()"><i class="fas fa-edit"></i> Edit</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    // ── Tabs ──
    html += UI.tabs(ACTIVE_TABS, _activeTab, 'BuyerWorkspace.switchActiveTab');

    // ── Investor profile card (if investor, shown above tabs content) ──
    if (cl.is_investor) {
      html += '<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">';
      html += '<div>' + _investorIntakeCard(cl) + '</div>';
      html += '<div>' + _exchange1031Card(cl) + '</div>';
      html += '<div>' + _investorToolsCard() + '</div>';
      html += '</div>';
    }

    // ── Tab Content ──
    html += '<div id="bwActiveContent">' + UI.loading() + '</div>';

    html += '</div>';

    container.innerHTML = html;

    // Render default tab
    _renderActiveTab();

    // Async conviction fetch for header
    setTimeout(function () { _fetchActiveConviction(clientId); }, 0);
  }

  function switchActiveTab(tab) {
    _activeTab = tab;
    // Update tab visuals
    document.querySelectorAll('.workspace-tab').forEach(function (el, i) {
      if (ACTIVE_TABS[i]) {
        el.classList.toggle('active', ACTIVE_TABS[i].id === tab);
      }
    });
    _renderActiveTab();
  }

  function _renderActiveTab() {
    var el = document.getElementById('bwActiveContent');
    if (!el) return;
    el.innerHTML = UI.loading();

    switch (_activeTab) {
      case 'listings_sent':   _tabListingsSent(el); break;
      case 'reactions':       _tabReactions(el); break;
      case 'showings':        _tabShowings(el); break;
      case 'offers':          _tabOffers(el); break;
      case 'documents':       _tabDocuments(el); break;
      case 'communication':   _tabCommunication(el); break;
      case 'activity':        _tabActivity(el); break;
      default:                _tabListingsSent(el);
    }
  }

  // ─── Tab: Listings Sent ────────────────────────────────────────────
  function _tabListingsSent(el) {
    var allEvents = Events.getByEntity('client', _activeClientId);
    var sentEvents = allEvents.filter(function (e) {
      return e.type === 'listing_sent' || e.type === 'quick_send_executed';
    });

    var html = '<div class="space-y-4">';

    // Send New Listing button
    html += '<div class="flex justify-end">' +
      '<button class="btn btn-sm btn-gold" onclick="CRM.quickSendListing()"><i class="fas fa-paper-plane mr-1"></i> Send New Listing</button>' +
    '</div>';

    if (sentEvents.length === 0) {
      html += UI.emptyState('fa-paper-plane', 'No listings sent yet',
        '<button class="btn btn-sm btn-gold" onclick="CRM.quickSendListing()">Send First Listing</button>');
    } else {
      html += '<div class="space-y-3">';
      sentEvents.forEach(function (evt) {
        var payload = evt.payload || {};
        var listingId = payload.listingId || payload.listing_id || '';
        var address = payload.address || payload.listing_address || 'Unknown Address';
        var price = payload.price || payload.list_price;
        var photo = payload.photo || payload.thumbnail || '';
        var sentDate = evt.createdAt || evt.created_at;

        // Behavioral tracking data
        var behaviorEvents = Events.getByEntity('listing', listingId);
        var clientBehavior = behaviorEvents.filter(function (be) {
          var eid = be.payload ? (be.payload.clientId || be.payload.client_id) : null;
          return eid === _activeClientId;
        });

        var viewed = clientBehavior.some(function (be) { return be.type === 'listing_view' || be.type === 'portal_listing_view'; });
        var viewCount = clientBehavior.filter(function (be) { return be.type === 'listing_view' || be.type === 'portal_listing_view'; }).length;
        var usedCalc = clientBehavior.some(function (be) { return be.type === 'calculator_used'; });
        var saved = clientBehavior.some(function (be) { return be.type === 'saved_favorite'; });
        var showingReq = clientBehavior.some(function (be) { return be.type === 'showing_request'; });
        var dwellEvents = clientBehavior.filter(function (be) { return be.type === 'dwell_time'; });
        var totalDwell = 0;
        dwellEvents.forEach(function (de) { totalDwell += Number((de.payload || {}).seconds || 0); });

        html += '<div class="border rounded-xl bg-white shadow-sm overflow-hidden">' +
          '<div class="flex">';

        // Thumbnail
        if (photo) {
          html += '<div class="w-32 h-24 flex-shrink-0 bg-gray-100">' +
            '<img src="' + E(photo) + '" class="w-full h-full object-cover" alt="Listing" onerror="this.parentElement.innerHTML=\'<div class=\\\'flex items-center justify-center h-full\\\'><i class=\\\'fas fa-image text-gray-300\\\'></i></div>\'">' +
          '</div>';
        } else {
          html += '<div class="w-32 h-24 flex-shrink-0 bg-gray-100 flex items-center justify-center">' +
            '<i class="fas fa-image text-xl text-gray-300"></i>' +
          '</div>';
        }

        // Info
        html += '<div class="flex-1 p-3">' +
          '<div class="flex items-start justify-between">' +
            '<div>' +
              '<p class="text-sm font-bold text-gray-900">' + E(address) + '</p>' +
              (price ? '<p class="text-sm font-bold text-green-700">' + $(price) + '</p>' : '') +
            '</div>' +
            '<span class="text-[10px] text-gray-400">' + (sentDate ? D(sentDate) : '') + '</span>' +
          '</div>' +
          '<div class="flex flex-wrap gap-1 mt-2">' +
            (viewed ? '<span class="text-[9px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded font-bold"><i class="fas fa-eye mr-0.5"></i>Viewed' + (viewCount > 1 ? ' (' + viewCount + 'x)' : '') + '</span>' : '<span class="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded font-bold">Not Viewed</span>') +
            (totalDwell > 0 ? '<span class="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded font-bold"><i class="fas fa-clock mr-0.5"></i>' + Math.round(totalDwell / 60) + ' min</span>' : '') +
            (usedCalc ? '<span class="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-600 rounded font-bold"><i class="fas fa-calculator mr-0.5"></i>Calculator</span>' : '') +
            (saved ? '<span class="text-[9px] px-1.5 py-0.5 bg-pink-100 text-pink-600 rounded font-bold"><i class="fas fa-heart mr-0.5"></i>Saved</span>' : '') +
            (showingReq ? '<span class="text-[9px] px-1.5 py-0.5 bg-green-100 text-green-600 rounded font-bold"><i class="fas fa-calendar-check mr-0.5"></i>Showing Req</span>' : '') +
          '</div>' +
        '</div>';

        html += '</div></div>';
      });
      html += '</div>';
    }

    html += '</div>';
    el.innerHTML = html;
  }

  // ─── Tab: Reactions ────────────────────────────────────────────────
  function _tabReactions(el) {
    var allEvents = Events.getByEntity('client', _activeClientId);
    var reactions = allEvents.filter(function (e) {
      return e.type === 'client_liked' || e.type === 'client_disliked' || e.type === 'client_discuss';
    });

    var html = '<div class="space-y-4">';
    html += '<p class="text-xs text-gray-500">What they said vs. what they did. Reactions are paired with behavioral data to surface intent signals.</p>';

    if (reactions.length === 0) {
      html += UI.emptyState('fa-heart', 'No reactions yet', '<p class="text-xs text-gray-400">Reactions appear when the buyer interacts with sent listings in their portal.</p>');
    } else {
      html += '<div class="space-y-2">';
      reactions.forEach(function (evt) {
        var payload = evt.payload || {};
        var address = payload.address || payload.listing_address || 'Unknown Listing';
        var reactionType = evt.type.replace('client_', '');
        var reactionColors = { liked: 'bg-green-50 border-green-200 text-green-700', disliked: 'bg-red-50 border-red-200 text-red-700', discuss: 'bg-blue-50 border-blue-200 text-blue-700' };
        var reactionIcons = { liked: 'fa-thumbs-up', disliked: 'fa-thumbs-down', discuss: 'fa-comments' };
        var reactionLabels = { liked: 'Liked', disliked: 'Disliked', discuss: 'Let\'s Discuss' };
        var colorCls = reactionColors[reactionType] || reactionColors.discuss;
        var icon = reactionIcons[reactionType] || 'fa-comment';
        var label = reactionLabels[reactionType] || reactionType;

        // Check behavioral data for this listing
        var listingId = payload.listingId || payload.listing_id || '';
        var behaviorEvents = listingId ? Events.getByEntity('listing', listingId) : [];
        var clientBehavior = behaviorEvents.filter(function (be) {
          var eid = be.payload ? (be.payload.clientId || be.payload.client_id) : null;
          return eid === _activeClientId;
        });
        var viewCount = clientBehavior.filter(function (be) { return be.type === 'listing_view' || be.type === 'portal_listing_view'; }).length;
        var usedCalc = clientBehavior.some(function (be) { return be.type === 'calculator_used'; });

        html += '<div class="flex items-center gap-3 p-3 border rounded-lg ' + colorCls + '">' +
          '<i class="fas ' + icon + ' text-lg"></i>' +
          '<div class="flex-1">' +
            '<p class="text-sm font-bold">' + E(address) + '</p>' +
            '<p class="text-xs">' + E(label) + ' &middot; ' + (evt.createdAt ? Utils.formatTimeAgo(evt.createdAt) : '') + '</p>' +
          '</div>' +
          '<div class="flex gap-1">' +
            (viewCount > 1 ? '<span class="text-[9px] px-1 py-0.5 bg-white bg-opacity-60 rounded">' + viewCount + 'x viewed</span>' : '') +
            (usedCalc ? '<span class="text-[9px] px-1 py-0.5 bg-white bg-opacity-60 rounded">Used calc</span>' : '') +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    el.innerHTML = html;
  }

  // ─── Tab: Showings ─────────────────────────────────────────────────
  function _tabShowings(el) {
    el.innerHTML = UI.loading();

    MallanAPI._fetch('/api/crm/showings?client_id=' + _activeClientId').then(function (data) {
      var showings = data.showings || data || [];
      var html = '<div class="space-y-4">';

      html += '<div class="flex justify-end">' +
        '<button class="btn btn-sm btn-gold" onclick="Workspace._scheduleShowing()"><i class="fas fa-calendar-plus mr-1"></i> Schedule Showing</button>' +
      '</div>';

      if (!Array.isArray(showings) || showings.length === 0) {
        html += UI.emptyState('fa-calendar', 'No showings yet',
          '<button class="btn btn-sm btn-outline" onclick="Workspace._scheduleShowing()">Schedule First Showing</button>');
      } else {
        // Separate scheduled vs completed
        var scheduled = showings.filter(function (s) { return s.status === 'scheduled' || s.status === 'confirmed'; });
        var completed = showings.filter(function (s) { return s.status === 'completed' || s.status === 'done'; });

        if (scheduled.length > 0) {
          html += '<div><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Upcoming</h4><div class="space-y-2">';
          scheduled.forEach(function (s) {
            html += _showingRow(s, 'bg-blue-50');
          });
          html += '</div></div>';
        }

        if (completed.length > 0) {
          html += '<div><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Completed</h4><div class="space-y-2">';
          completed.forEach(function (s) {
            html += _showingRow(s, 'bg-gray-50');
          });
          html += '</div></div>';
        }
      }

      html += '</div>';
      el.innerHTML = html;
    }).catch(function () {
      el.innerHTML = _showingsFromEvents();
    });
  }

  function _showingRow(s, bgClass) {
    return '<div class="flex items-center gap-3 p-3 border rounded-lg ' + (bgClass || '') + '">' +
      '<div class="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0">' +
        '<i class="fas fa-calendar text-gray-400"></i>' +
      '</div>' +
      '<div class="flex-1">' +
        '<p class="text-sm font-bold text-gray-900">' + E(s.address || s.listing_address || s.property || 'Property') + '</p>' +
        '<p class="text-xs text-gray-500">' + (s.date ? D(s.date) : s.showing_date ? D(s.showing_date) : 'No date') +
          (s.time ? ' at ' + E(s.time) : '') + '</p>' +
      '</div>' +
      '<div class="text-right">' +
        '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' +
          (s.status === 'scheduled' || s.status === 'confirmed' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700') +
          '">' + E(s.status || 'scheduled') + '</span>' +
        (s.feedback ? '<p class="text-xs text-gray-500 mt-1">' + E(s.feedback) + '</p>' : '') +
      '</div>' +
    '</div>';
  }

  function _showingsFromEvents() {
    var allEvents = Events.getByEntity('client', _activeClientId);
    var showingEvents = allEvents.filter(function (e) {
      return e.type === 'showing_scheduled' || e.type === 'showing_completed' || e.type === 'showing_request';
    });

    var html = '<div class="space-y-4">';
    html += '<div class="flex justify-end">' +
      '<button class="btn btn-sm btn-gold" onclick="Workspace._scheduleShowing()"><i class="fas fa-calendar-plus mr-1"></i> Schedule Showing</button>' +
    '</div>';

    if (showingEvents.length === 0) {
      html += UI.emptyState('fa-calendar', 'No showings yet',
        '<button class="btn btn-sm btn-outline" onclick="Workspace._scheduleShowing()">Schedule First Showing</button>');
    } else {
      html += '<div class="space-y-2">';
      showingEvents.forEach(function (evt) {
        var p = evt.payload || {};
        html += '<div class="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">' +
          '<i class="fas fa-calendar text-gray-400"></i>' +
          '<div class="flex-1">' +
            '<p class="text-sm font-bold text-gray-900">' + E(p.address || p.listing_address || 'Property') + '</p>' +
            '<p class="text-xs text-gray-500">' + (evt.createdAt ? D(evt.createdAt) : '') + '</p>' +
          '</div>' +
          '<span class="text-[10px] px-2 py-0.5 rounded font-bold bg-gray-100 text-gray-600">' + E(evt.type.replace(/_/g, ' ')) + '</span>' +
        '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  // ─── Tab: Offers ───────────────────────────────────────────────────
  function _tabOffers(el) {
    var allEvents = Events.getByEntity('client', _activeClientId);
    var offerEvents = allEvents.filter(function (e) {
      return e.type === 'offer_submitted' || e.type === 'offer_accepted' || e.type === 'offer_rejected' || e.type === 'counter_offer';
    });

    var html = '<div class="space-y-4">';

    if (offerEvents.length === 0) {
      html += UI.emptyState('fa-file-invoice-dollar', 'No offers submitted yet',
        '<p class="text-xs text-gray-400">Offers will appear here when the buyer submits through their portal or when you record them.</p>');
    } else {
      html += '<div class="space-y-2">';
      offerEvents.forEach(function (evt) {
        var p = evt.payload || {};
        var statusColors = {
          offer_submitted: 'bg-blue-100 text-blue-700',
          offer_accepted: 'bg-green-100 text-green-700',
          offer_rejected: 'bg-red-100 text-red-700',
          counter_offer: 'bg-yellow-100 text-yellow-700',
        };
        var statusLabels = {
          offer_submitted: 'Submitted',
          offer_accepted: 'Accepted',
          offer_rejected: 'Rejected',
          counter_offer: 'Counter',
        };

        html += '<div class="flex items-center gap-3 p-3 border rounded-lg bg-white">' +
          '<div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">' +
            '<i class="fas fa-file-invoice-dollar text-gray-400"></i>' +
          '</div>' +
          '<div class="flex-1">' +
            '<p class="text-sm font-bold text-gray-900">' + E(p.address || p.property || 'Property') + '</p>' +
            '<p class="text-sm font-bold text-green-700">' + (p.amount ? $(p.amount) : p.offer_price ? $(p.offer_price) : '-') + '</p>' +
            '<p class="text-xs text-gray-500">' + (evt.createdAt ? D(evt.createdAt) : '') + '</p>' +
          '</div>' +
          '<div class="text-right">' +
            '<span class="text-[10px] px-2 py-0.5 rounded font-bold ' + (statusColors[evt.type] || 'bg-gray-100 text-gray-600') + '">' +
              E(statusLabels[evt.type] || evt.type) +
            '</span>' +
            (p.counter_amount ? '<p class="text-xs text-yellow-600 mt-1">Counter: ' + $(p.counter_amount) + '</p>' : '') +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    el.innerHTML = html;
  }

  // ─── Tab: Documents ────────────────────────────────────────────────
  function _tabDocuments(el) {
    var docTypes = [
      { key: 'pre_approval', label: 'Pre-Approval Letter', icon: 'fa-file-alt', required: true },
      { key: 'proof_of_funds', label: 'Proof of Funds', icon: 'fa-money-check-alt', required: true },
      { key: 'buyer_rep_agreement', label: 'Buyer Rep Agreement', icon: 'fa-file-signature', required: true },
      { key: 'coop_board_package', label: 'Co-op Board Package', icon: 'fa-building', required: false },
      { key: 'financial_statement', label: 'Financial Statement', icon: 'fa-chart-pie', required: false },
      { key: 'tax_returns', label: 'Tax Returns', icon: 'fa-file-invoice', required: false },
      { key: 'employment_letter', label: 'Employment Letter', icon: 'fa-briefcase', required: false },
      { key: 'bank_statements', label: 'Bank Statements', icon: 'fa-university', required: false },
    ];

    var html = '<div class="space-y-4">';

    html += '<div class="flex justify-end">' +
      '<button class="btn btn-sm btn-gold" onclick="BuyerWorkspace._uploadDocument()"><i class="fas fa-upload mr-1"></i> Upload Document</button>' +
    '</div>';

    // Fetch documents from API
    html += '<div id="bwDocList">' + UI.loading() + '</div>';
    html += '</div>';
    el.innerHTML = html;

    MallanAPI._fetch('/api/crm/documents?scope=client&scope_id=' + _activeClientId').then(function (data) {
      var docs = data.documents || data || [];
      var docMap = {};
      if (Array.isArray(docs)) {
        docs.forEach(function (d) {
          var key = (d.type || d.document_type || '').toLowerCase().replace(/\s+/g, '_');
          docMap[key] = d;
        });
      }

      var listHtml = '<div class="space-y-2">';
      docTypes.forEach(function (dt) {
        var doc = docMap[dt.key];
        var hasDoc = !!doc;
        listHtml += '<div class="flex items-center gap-3 p-3 border rounded-lg ' + (hasDoc ? 'bg-green-50' : 'bg-gray-50') + '">' +
          '<div class="w-8 h-8 rounded flex items-center justify-center ' + (hasDoc ? 'bg-green-100' : 'bg-gray-200') + '">' +
            '<i class="fas ' + dt.icon + ' text-sm ' + (hasDoc ? 'text-green-600' : 'text-gray-400') + '"></i>' +
          '</div>' +
          '<div class="flex-1">' +
            '<p class="text-sm font-medium ' + (hasDoc ? 'text-green-700' : 'text-gray-700') + '">' + E(dt.label) + '</p>' +
            (hasDoc && doc.uploaded_at ? '<p class="text-[10px] text-gray-400">Uploaded ' + D(doc.uploaded_at) + '</p>' : '') +
          '</div>' +
          (dt.required ? '<span class="text-[9px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-bold">REQ</span>' : '') +
          (!hasDoc ? '<button class="btn btn-xs btn-outline" onclick="BuyerWorkspace._requestDocument(\'' + dt.key + '\')"><i class="fas fa-bell mr-1"></i>Request</button>' : '') +
        '</div>';
      });
      listHtml += '</div>';

      var docEl = document.getElementById('bwDocList');
      if (docEl) docEl.innerHTML = listHtml;
    }).catch(function () {
      var docEl = document.getElementById('bwDocList');
      if (docEl) docEl.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Could not load documents</p>';
    });
  }

  // ─── Tab: Communication ────────────────────────────────────────────
  function _tabCommunication(el) {
    el.innerHTML = UI.loading();

    MallanAPI._fetch('/api/crm/communications?client_id=' + _activeClientId + '&limit=50').then(function (data) {
      var messages = data.communications || data.messages || data || [];
      var html = '<div class="space-y-4">';

      if (!Array.isArray(messages) || messages.length === 0) {
        html += UI.emptyState('fa-comments', 'No communications yet',
          '<p class="text-xs text-gray-400">Messages and emails between you and this buyer will appear here.</p>');
      } else {
        html += '<div class="space-y-2">';
        messages.forEach(function (msg) {
          var isInbound = msg.direction === 'inbound' || msg.from_client;
          html += '<div class="flex ' + (isInbound ? '' : 'justify-end') + '">' +
            '<div class="max-w-[70%] p-3 rounded-lg ' + (isInbound ? 'bg-gray-100' : 'bg-blue-50') + '">' +
              '<p class="text-sm text-gray-800">' + E(msg.content || msg.body || msg.subject || '') + '</p>' +
              '<p class="text-[10px] text-gray-400 mt-1">' +
                E(msg.channel || msg.type || 'message') + ' &middot; ' +
                (msg.created_at || msg.createdAt ? Utils.formatTimeAgo(msg.created_at || msg.createdAt) : '') +
              '</p>' +
            '</div>' +
          '</div>';
        });
        html += '</div>';
      }

      html += '</div>';
      el.innerHTML = html;
    }).catch(function () {
      // Fallback to events
      var allEvents = Events.getByEntity('client', _activeClientId);
      var commEvents = allEvents.filter(function (e) {
        return e.type === 'email_sent' || e.type === 'email_received' || e.type === 'message_sent' || e.type === 'sms_sent';
      });

      var html = '<div class="space-y-4">';
      if (commEvents.length === 0) {
        html += UI.emptyState('fa-comments', 'No communications yet');
      } else {
        html += '<div class="space-y-2">';
        commEvents.forEach(function (evt) {
          var p = evt.payload || {};
          html += '<div class="p-3 border rounded-lg bg-gray-50">' +
            '<p class="text-sm text-gray-700">' + E(p.subject || p.content || evt.type) + '</p>' +
            '<p class="text-[10px] text-gray-400 mt-1">' + E(evt.type.replace(/_/g, ' ')) + ' &middot; ' +
              (evt.createdAt ? Utils.formatTimeAgo(evt.createdAt) : '') + '</p>' +
          '</div>';
        });
        html += '</div>';
      }
      html += '</div>';
      el.innerHTML = html;
    });
  }

  // ─── Tab: Activity ─────────────────────────────────────────────────
  function _tabActivity(el) {
    var allEvents = Events.getByEntity('client', _activeClientId);
    if (allEvents.length === 0) {
      el.innerHTML = UI.emptyState('fa-stream', 'No activity yet');
      return;
    }

    // Sort newest first
    allEvents.sort(function (a, b) {
      return new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0);
    });

    var items = allEvents.slice(0, 50).map(function (evt) {
      var p = evt.payload || {};
      var typeIcons = {
        listing_sent: 'fa-paper-plane', note_added: 'fa-sticky-note', showing_scheduled: 'fa-calendar',
        offer_submitted: 'fa-file-invoice-dollar', client_liked: 'fa-thumbs-up', client_disliked: 'fa-thumbs-down',
        client_discuss: 'fa-comments', listing_view: 'fa-eye', calculator_used: 'fa-calculator',
        task_created: 'fa-tasks', email_sent: 'fa-envelope', showing_completed: 'fa-check-circle',
      };
      return {
        icon: typeIcons[evt.type] || 'fa-circle',
        title: (evt.type || '').replace(/_/g, ' '),
        description: p.content || p.address || p.subject || p.title || '',
        time: evt.createdAt ? Utils.formatTimeAgo(evt.createdAt) : '',
      };
    });

    el.innerHTML = UI.timeline(items);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CONVICTION SCORE (shared)
  // ═══════════════════════════════════════════════════════════════════════

  function _fetchConviction(clientId) {
    MallanAPI._fetch('/api/crm/conviction/' + clientId).then(function (data) {
      var el = document.getElementById('buyerConvictionDisplay');
      if (!el) return;

      var score = data.score || 0;
      var stage = data.stage || 'browsing';
      var stageColors = { browsing: '#9CA3AF', considering: '#F59E0B', convinced: '#3B82F6', ready: '#059669' };
      var color = stageColors[stage] || '#9CA3AF';
      var ghostStatus = data.ghost_status || data.ghostStatus || 'active';

      var milestones = data.milestone_flags || data.milestoneFlags || {};
      var milestoneItems = [
        { key: 'repeated_views', label: 'Repeated Views', icon: 'fa-redo' },
        { key: 'shared', label: 'Shared Listing', icon: 'fa-share' },
        { key: 'used_calculator', label: 'Used Calculator', icon: 'fa-calculator' },
        { key: 'compared', label: 'Compared Properties', icon: 'fa-columns' },
        { key: 'checked_transit', label: 'Checked Transit', icon: 'fa-subway' },
        { key: 'requested_showing', label: 'Requested Showing', icon: 'fa-calendar-check' },
      ];

      var html = '<div class="flex items-center gap-4">' +
        '<div class="relative w-20 h-20 flex-shrink-0">' +
          '<svg class="w-20 h-20 -rotate-90" viewBox="0 0 80 80">' +
            '<circle cx="40" cy="40" r="34" fill="none" stroke="#E5E7EB" stroke-width="6"/>' +
            '<circle cx="40" cy="40" r="34" fill="none" stroke="' + color + '" stroke-width="6" stroke-dasharray="' + (2 * Math.PI * 34) + '" stroke-dashoffset="' + (2 * Math.PI * 34 * (1 - score / 100)) + '" stroke-linecap="round"/>' +
          '</svg>' +
          '<div class="absolute inset-0 flex items-center justify-center">' +
            '<span class="text-xl font-bold" style="color:' + color + '">' + score + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="flex-1">' +
          '<div class="flex items-center gap-2 mb-1">' +
            '<span class="text-sm font-bold" style="color:' + color + '">' + E(stage.charAt(0).toUpperCase() + stage.slice(1)) + '</span>' +
            (ghostStatus !== 'active' ? '<span class="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-bold">' + E(ghostStatus) + '</span>' : '') +
          '</div>' +
          '<div class="flex flex-wrap gap-1">';

      milestoneItems.forEach(function (m) {
        var hit = milestones[m.key];
        html += '<span class="text-[10px] px-1.5 py-0.5 rounded ' + (hit ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400') + '">' +
          '<i class="fas ' + m.icon + ' mr-0.5"></i>' + E(m.label) + '</span>';
      });

      html += '</div></div></div>';

      if (data.silence_days > 3) {
        html += '<div class="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">' +
          '<i class="fas fa-ghost mr-1"></i> Silent for ' + data.silence_days + ' days' +
        '</div>';
      }

      el.innerHTML = html;
    }).catch(function () {
      var el = document.getElementById('buyerConvictionDisplay');
      if (el) el.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">No conviction data yet</p>';
    });
  }

  function _fetchActiveConviction(clientId) {
    MallanAPI._fetch('/api/crm/conviction/' + clientId).then(function (data) {
      var el = document.getElementById('bwActiveConviction');
      if (!el) return;
      var score = data.score || 0;
      var stage = data.stage || 'browsing';
      var stageColors = { browsing: '#9CA3AF', considering: '#F59E0B', convinced: '#3B82F6', ready: '#059669' };
      var color = stageColors[stage] || '#9CA3AF';

      el.innerHTML = '<div class="flex items-center gap-2">' +
        '<div class="relative w-10 h-10">' +
          '<svg class="w-10 h-10 -rotate-90" viewBox="0 0 40 40">' +
            '<circle cx="20" cy="20" r="16" fill="none" stroke="#E5E7EB" stroke-width="3"/>' +
            '<circle cx="20" cy="20" r="16" fill="none" stroke="' + color + '" stroke-width="3" stroke-dasharray="' + (2 * Math.PI * 16) + '" stroke-dashoffset="' + (2 * Math.PI * 16 * (1 - score / 100)) + '" stroke-linecap="round"/>' +
          '</svg>' +
          '<div class="absolute inset-0 flex items-center justify-center">' +
            '<span class="text-xs font-bold" style="color:' + color + '">' + score + '</span>' +
          '</div>' +
        '</div>' +
        '<span class="text-[10px] font-bold" style="color:' + color + '">' + E(stage.charAt(0).toUpperCase() + stage.slice(1)) + '</span>' +
      '</div>';
    }).catch(function () {
      var el = document.getElementById('bwActiveConviction');
      if (el) el.innerHTML = '';
    });
  }

  function _fetchLeadScore(clientId) {
    MallanAPI._fetch('/api/crm/lead-scoring/' + clientId).then(function (data) {
      var el = document.getElementById('bwLeadScoreRail');
      if (!el) return;
      var s = data.score || data;
      var grade = s.grade || 'F';
      var total = s.total || s.score || 0;
      var gradeColors = { A: '#059669', B: '#2563EB', C: '#F59E0B', D: '#F97316', F: '#EF4444' };
      var color = gradeColors[grade] || gradeColors.F;

      el.innerHTML = '<h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Lead Score</h4>' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-12 h-12 rounded-full flex items-center justify-center" style="background:' + color + '15">' +
            '<span class="text-lg font-bold" style="color:' + color + '">' + E(grade) + '</span>' +
          '</div>' +
          '<div>' +
            '<p class="text-sm font-bold text-gray-900">' + total + ' / 100</p>' +
            '<p class="text-xs text-gray-500">Lead quality</p>' +
          '</div>' +
        '</div>';
    }).catch(function () {
      var el = document.getElementById('bwLeadScoreRail');
      if (el) el.innerHTML = '<h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Lead Score</h4>' +
        '<p class="text-xs text-gray-400 text-center py-2">No score data</p>';
    });
  }

  function _fetchNextBestAction(clientId) {
    MallanAPI._fetch('/api/crm/conviction/' + clientId).then(function (data) {
      var el = document.getElementById('bwNextActionRail');
      if (!el) return;

      var nba = data.next_best_action || data.nextBestAction || '';
      var actions = data.recommended_actions || [];

      var html = '<h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Next Best Action</h4>';

      if (nba) {
        html += '<div class="p-2 bg-gold/10 border border-gold/20 rounded-lg">' +
          '<p class="text-sm font-medium text-gray-800"><i class="fas fa-lightbulb text-gold mr-1"></i>' + E(nba) + '</p>' +
        '</div>';
      }

      if (actions.length > 0) {
        html += '<div class="mt-2 space-y-1">';
        actions.forEach(function (a) {
          html += '<p class="text-xs text-gray-600">&bull; ' + E(typeof a === 'string' ? a : a.action || a.description || '') + '</p>';
        });
        html += '</div>';
      }

      if (!nba && actions.length === 0) {
        html += '<p class="text-xs text-gray-400 text-center py-2">Send a listing to generate engagement signals</p>';
      }

      el.innerHTML = html;
    }).catch(function () {
      var el = document.getElementById('bwNextActionRail');
      if (el) el.innerHTML = '<h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Next Best Action</h4>' +
        '<p class="text-xs text-gray-400 text-center py-2">Send a listing to generate engagement signals</p>';
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // INVESTOR SECTIONS (shared between prospect + active)
  // ═══════════════════════════════════════════════════════════════════════

  function _investorIntakeCard(cl) {
    var strategies = { cash_flow: 'Cash Flow', appreciation: 'Appreciation', value_add: 'Value-Add', '1031_exchange': '1031 Exchange' };
    var portfolio = _parseJson(cl.current_portfolio, []);

    var body = '<div class="grid grid-cols-2 gap-4 text-sm">' +
      '<div>' +
        '<p class="text-xs font-bold text-gray-500 uppercase mb-2">Strategy</p>' +
        '<div class="space-y-1.5">' +
          '<div class="flex justify-between"><span class="text-gray-500">Strategy</span><span class="font-medium text-amber-700">' + E(strategies[cl.investment_strategy] || cl.investment_strategy || '-') + '</span></div>' +
          '<div class="flex justify-between"><span class="text-gray-500">Holding Period</span><span class="font-medium">' + (cl.holding_period_years ? cl.holding_period_years + ' years' : '-') + '</span></div>' +
        '</div>' +
      '</div>' +
      '<div>' +
        '<p class="text-xs font-bold text-gray-500 uppercase mb-2">Targets</p>' +
        '<div class="space-y-1.5">' +
          '<div class="flex justify-between"><span class="text-gray-500">Cap Rate</span><span class="font-medium">' + (cl.cap_rate_target ? cl.cap_rate_target + '%' : '-') + '</span></div>' +
          '<div class="flex justify-between"><span class="text-gray-500">Cash-on-Cash</span><span class="font-medium">' + (cl.cash_on_cash_target ? cl.cash_on_cash_target + '%' : '-') + '</span></div>' +
        '</div>' +
      '</div>' +
    '</div>';

    if (Array.isArray(portfolio) && portfolio.length > 0) {
      body += '<div class="mt-3 pt-3 border-t"><p class="text-xs font-bold text-gray-500 uppercase mb-2">Current Portfolio</p>' +
        '<div class="space-y-1">';
      portfolio.forEach(function (p) {
        body += '<div class="flex items-center gap-2 text-sm p-1.5 bg-gray-50 rounded">' +
          '<i class="fas fa-building text-xs text-gray-400"></i>' +
          '<span class="font-medium">' + E(p.address || p.name || 'Property') + '</span>' +
          (p.type ? '<span class="text-xs text-gray-400">' + E(p.type) + '</span>' : '') +
        '</div>';
      });
      body += '</div></div>';
    }

    return _card('chart-line', 'Investment Profile', 'BuyerWorkspace._editInvestorIntake()', body, '#F59E0B');
  }

  function _exchange1031Card(cl) {
    var status = cl.exchange_1031_status || 'none';
    if (status === 'none') {
      return _card('exchange-alt', '1031 Exchange', 'BuyerWorkspace._editInvestorIntake()',
        '<p class="text-xs text-gray-400 text-center py-2">Not in a 1031 exchange</p>');
    }

    var deadline = cl.exchange_1031_deadline;
    var daysLeft = deadline ? Math.floor((new Date(deadline).getTime() - Date.now()) / 86400000) : null;
    var urgencyColor = daysLeft !== null ? (daysLeft <= 14 ? 'text-red-600' : daysLeft <= 45 ? 'text-yellow-600' : 'text-green-600') : 'text-gray-500';

    var statusLabels = { identifying: 'Identifying (45 days)', exchanging: 'Exchanging (180 days)', completed: 'Completed' };
    var body = '<div class="space-y-3">' +
      '<div class="flex items-center justify-between">' +
        '<span class="text-sm font-bold text-amber-700">' + E(statusLabels[status] || status) + '</span>' +
        (daysLeft !== null ? '<span class="text-lg font-bold ' + urgencyColor + '">' + daysLeft + ' days left</span>' : '') +
      '</div>';

    if (daysLeft !== null && daysLeft > 0) {
      var pct = Math.max(0, Math.min(100, 100 - (daysLeft / 180 * 100)));
      body += '<div class="h-2 bg-gray-200 rounded-full overflow-hidden">' +
        '<div class="h-full rounded-full" style="width:' + pct + '%;background:' + (daysLeft <= 14 ? '#EF4444' : daysLeft <= 45 ? '#F59E0B' : '#059669') + '"></div>' +
      '</div>';
    }

    if (deadline) {
      body += '<div class="text-xs text-gray-500">Deadline: ' + D(deadline) + '</div>';
    }

    if (daysLeft !== null && daysLeft <= 30) {
      body += '<div class="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">' +
        '<i class="fas fa-exclamation-triangle mr-1"></i> Approaching deadline — prioritize property identification' +
      '</div>';
    }

    body += '</div>';
    return _card('exchange-alt', '1031 Exchange Tracker', 'BuyerWorkspace._editInvestorIntake()', body, '#DC2626');
  }

  function _investorToolsCard() {
    var body = '<div class="grid grid-cols-2 gap-2">' +
      '<button class="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 text-center transition-all" onclick="BuyerWorkspace._openCapRateCalc()">' +
        '<i class="fas fa-percentage text-lg text-amber-600 mb-1"></i>' +
        '<p class="text-xs font-bold text-gray-700">Cap Rate</p>' +
      '</button>' +
      '<button class="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 text-center transition-all" onclick="BuyerWorkspace._openCashOnCashCalc()">' +
        '<i class="fas fa-coins text-lg text-green-600 mb-1"></i>' +
        '<p class="text-xs font-bold text-gray-700">Cash-on-Cash</p>' +
      '</button>' +
      '<button class="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 text-center transition-all" onclick="BuyerWorkspace._openROICalc()">' +
        '<i class="fas fa-chart-line text-lg text-blue-600 mb-1"></i>' +
        '<p class="text-xs font-bold text-gray-700">ROI</p>' +
      '</button>' +
      '<button class="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 text-center transition-all" onclick="BuyerWorkspace._openRentalYieldCalc()">' +
        '<i class="fas fa-home text-lg text-purple-600 mb-1"></i>' +
        '<p class="text-xs font-bold text-gray-700">Rental Yield</p>' +
      '</button>' +
    '</div>';

    return _card('tools', 'Investment Calculators', '', body, '#059669');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ACTIONS — Convert, Edit, Search, etc.
  // ═══════════════════════════════════════════════════════════════════════

  function _convertToActive(clientId) {
    CRM.openModal('Confirm Buyer Rep Agreement',
      '<div class="space-y-4">' +
        '<div class="p-3 bg-gold/10 border border-gold/20 rounded-lg">' +
          '<p class="text-sm font-medium text-gray-800"><i class="fas fa-file-signature text-gold mr-2"></i>This will mark the Buyer Representation Agreement as signed.</p>' +
          '<p class="text-xs text-gray-500 mt-1">Per UCBA E7, this is required before submitting offers on behalf of this buyer.</p>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="text-xs font-bold text-gray-500">Agreement Date</label>' +
            '<input id="bwRepDate" type="date" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + new Date().toISOString().split('T')[0] + '"></div>' +
          '<div><label class="text-xs font-bold text-gray-500">Expiration Date</label>' +
            '<input id="bwRepExpiry" type="date" class="w-full border rounded px-3 py-2 text-sm mt-1"></div>' +
        '</div>' +
        '<button class="btn btn-gold w-full" onclick="BuyerWorkspace._submitConvert(\'' + E(clientId) + '\')"><i class="fas fa-check mr-1"></i> Confirm — Move to Active Buyer</button>' +
      '</div>');
  }

  function _submitConvert(clientId) {
    var repDate = document.getElementById('bwRepDate').value;
    MallanAPI.clients.update(clientId, {
      buyer_rep_agreement: true,
      buyer_rep_agreement_date: repDate || new Date().toISOString(),
      pipeline_stage: 'active_buyer',
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Buyer moved to Active — Buyer Rep Agreement recorded', 'success');
      Workspace.openClient(clientId);
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _toggleBuyerRep() {
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    var cl = Workspace._getClient ? Workspace._getClient() : {};
    if (!clientId) return;

    var newVal = !cl.buyer_rep_agreement;
    MallanAPI.clients.update(clientId, {
      buyer_rep_agreement: newVal,
      buyer_rep_agreement_date: newVal ? new Date().toISOString() : null,
    }).then(function () {
      CRM.toast(newVal ? 'Buyer rep marked as signed' : 'Buyer rep unmarked', 'success');
      Workspace.openClient(clientId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  // ─── Edit Story ────────────────────────────────────────────────────
  function _editStory() {
    var cl = Workspace._getClient ? Workspace._getClient() : {};

    CRM.openModal('Edit Buyer Notes', '<div class="space-y-3">' +
      '<div><label class="text-xs font-bold text-gray-500">Notes (why buying, timeline, situation, motivation)</label>' +
        '<textarea id="bs_notes" class="w-full border rounded px-3 py-2 text-sm mt-1" rows="6" placeholder="First home, relocating in 3 months, currently renting...">' + E(cl.notes || '') + '</textarea></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Employer</label>' +
        '<input id="bs_employer" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.employer || '') + '" placeholder="Company name"></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Job Title</label>' +
        '<input id="bs_title" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.work_title || '') + '" placeholder="Job title"></div>' +
      '<button class="btn btn-gold w-full" onclick="BuyerWorkspace._saveStory()">Save</button>' +
    '</div>');
  }

  function _saveStory() {
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    if (!clientId) return;

    MallanAPI.clients.update(clientId, {
      notes: document.getElementById('bs_notes').value.trim(),
      employer: document.getElementById('bs_employer').value.trim(),
      work_title: document.getElementById('bs_title').value.trim(),
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Buyer story updated', 'success');
      Workspace.openClient(clientId);
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  // ─── Edit Attorney ─────────────────────────────────────────────────
  function _editAttorney() {
    var cl = Workspace._getClient ? Workspace._getClient() : {};
    CRM.openModal('Edit Attorney', '<div class="space-y-3">' +
      '<div><label class="text-xs font-bold text-gray-500">Attorney Name</label>' +
        '<input id="bwAttName" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.attorney_name || '') + '"></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Firm</label>' +
        '<input id="bwAttFirm" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.attorney_firm || '') + '"></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Email</label>' +
        '<input id="bwAttEmail" type="email" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.attorney_email || '') + '"></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Phone</label>' +
        '<input id="bwAttPhone" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.attorney_phone || '') + '"></div>' +
      '<button class="btn btn-gold w-full" onclick="BuyerWorkspace._saveAttorney()">Save</button>' +
    '</div>');
  }

  function _saveAttorney() {
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    if (!clientId) return;

    MallanAPI.clients.update(clientId, {
      attorney_name: document.getElementById('bwAttName').value.trim(),
      attorney_firm: document.getElementById('bwAttFirm').value.trim(),
      attorney_email: document.getElementById('bwAttEmail').value.trim(),
      attorney_phone: document.getElementById('bwAttPhone').value.trim(),
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Attorney updated', 'success');
      Workspace.openClient(clientId);
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  // ─── Search and Send ───────────────────────────────────────────────
  function _searchAndSend(clientId) {
    var input = document.getElementById('bwSearchInput');
    var query = input ? input.value.trim() : '';
    if (!query) { CRM.toast('Enter a search term', 'error'); return; }

    var resultsEl = document.getElementById('bwSearchResults');
    if (resultsEl) resultsEl.innerHTML = UI.loading();

    MallanAPI._fetch('/api/listings?q=' + encodeURIComponent(query) + '&limit=5').then(function (data) {
      var listings = data.listings || data.results || data || [];
      if (!resultsEl) return;

      if (!Array.isArray(listings) || listings.length === 0) {
        resultsEl.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">No listings found for "' + E(query) + '"</p>';
        return;
      }

      var html = '<div class="space-y-2 mt-2">';
      listings.forEach(function (l) {
        var addr = l.address || l.UnparsedAddress || 'Address';
        var price = l.ListPrice || l.price || l.list_price || 0;
        var lid = l.id || l.listingId || l.listing_id || '';
        html += '<div class="flex items-center gap-3 p-2 border rounded-lg hover:bg-gray-50">' +
          '<div class="flex-1">' +
            '<p class="text-sm font-medium text-gray-900">' + E(addr) + '</p>' +
            '<p class="text-xs text-green-600 font-bold">' + $(price) + '</p>' +
          '</div>' +
          '<button class="btn btn-xs btn-gold" onclick="BuyerWorkspace._sendToClient(\'' + E(clientId) + '\',\'' + E(lid) + '\',\'' + E(addr) + '\',' + price + ')"><i class="fas fa-paper-plane mr-1"></i>Send</button>' +
        '</div>';
      });
      html += '</div>';
      resultsEl.innerHTML = html;
    }).catch(function (err) {
      if (resultsEl) resultsEl.innerHTML = '<p class="text-xs text-red-500 text-center py-2">Search failed: ' + E(err.message || '') + '</p>';
    });
  }

  function _sendToClient(clientId, listingId, address, price) {
    MallanAPI._fetch('/api/crm/listing-sends', {
      method: 'POST',
      body: JSON.stringify({ listing_id: listingId }),
    }).then(function () {
      Events.log('listing_sent', 'client', clientId, { listingId: listingId, address: address, price: price });
      CRM.toast('Listing sent to buyer', 'success');
      var resultsEl = document.getElementById('bwSearchResults');
      if (resultsEl) resultsEl.innerHTML = '<p class="text-xs text-green-600 text-center py-2"><i class="fas fa-check mr-1"></i>Sent!</p>';
    }).catch(function (err) {
      CRM.toast('Failed to send: ' + (err.message || ''), 'error');
    });
  }

  // ─── Document Actions ──────────────────────────────────────────────
  function _uploadDocument() {
    CRM.openModal('Upload Document', '<div class="space-y-3">' +
      '<div><label class="text-xs font-bold text-gray-500">Document Type</label>' +
        '<select id="bwDocType" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
          '<option value="pre_approval">Pre-Approval Letter</option>' +
          '<option value="proof_of_funds">Proof of Funds</option>' +
          '<option value="buyer_rep_agreement">Buyer Rep Agreement</option>' +
          '<option value="coop_board_package">Co-op Board Package</option>' +
          '<option value="financial_statement">Financial Statement</option>' +
          '<option value="tax_returns">Tax Returns</option>' +
          '<option value="employment_letter">Employment Letter</option>' +
          '<option value="bank_statements">Bank Statements</option>' +
          '<option value="other">Other</option>' +
        '</select></div>' +
      '<div><label class="text-xs font-bold text-gray-500">File</label>' +
        '<input id="bwDocFile" type="file" class="w-full border rounded px-3 py-2 text-sm mt-1"></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Notes</label>' +
        '<input id="bwDocNotes" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="Optional notes"></div>' +
      '<button class="btn btn-gold w-full" onclick="BuyerWorkspace._submitDocument()"><i class="fas fa-upload mr-1"></i> Upload</button>' +
    '</div>');
  }

  function _submitDocument() {
    var fileInput = document.getElementById('bwDocFile');
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      CRM.toast('Select a file', 'error');
      return;
    }

    var formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('type', document.getElementById('bwDocType').value);
    formData.append('notes', document.getElementById('bwDocNotes').value.trim());
    formData.append('client_id', _activeClientId);

    MallanAPI._fetch('/api/crm/documents/upload', {
      method: 'POST',
      body: formData,
      rawBody: true,
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Document uploaded', 'success');
      _renderActiveTab();
    }).catch(function (err) {
      CRM.toast('Upload failed: ' + (err.message || ''), 'error');
    });
  }

  function _requestDocument(docType) {
    var label = docType.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    CRM.toast('Document request for "' + label + '" will be sent to buyer', 'info');
    Events.log('document_requested', 'client', _activeClientId, { document_type: docType });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // INVESTOR EDIT + CALCULATOR MODALS
  // ═══════════════════════════════════════════════════════════════════════

  function _editInvestorIntake() {
    var cl = Workspace._getClient ? Workspace._getClient() : {};
    CRM.openModal('Edit Investment Profile', '<div class="space-y-4">' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Investment Strategy</label>' +
          '<select id="inv_strategy" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
            '<option value="">Select...</option>' +
            '<option value="cash_flow"' + (cl.investment_strategy === 'cash_flow' ? ' selected' : '') + '>Cash Flow</option>' +
            '<option value="appreciation"' + (cl.investment_strategy === 'appreciation' ? ' selected' : '') + '>Appreciation</option>' +
            '<option value="value_add"' + (cl.investment_strategy === 'value_add' ? ' selected' : '') + '>Value-Add</option>' +
            '<option value="1031_exchange"' + (cl.investment_strategy === '1031_exchange' ? ' selected' : '') + '>1031 Exchange</option>' +
          '</select></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Holding Period (Years)</label>' +
          '<input id="inv_hold" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.holding_period_years || '') + '" placeholder="5"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Cap Rate Target %</label>' +
          '<input id="inv_cap" type="number" step="0.1" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.cap_rate_target || '') + '" placeholder="6.0"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Cash-on-Cash Target %</label>' +
          '<input id="inv_coc" type="number" step="0.1" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.cash_on_cash_target || '') + '" placeholder="8.0"></div>' +
      '</div>' +
      '<div class="border-t pt-3">' +
        '<p class="text-xs font-bold text-gray-500 mb-2">1031 Exchange</p>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="text-xs text-gray-500">Status</label>' +
            '<select id="inv_1031" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
              '<option value="none"' + (cl.exchange_1031_status === 'none' || !cl.exchange_1031_status ? ' selected' : '') + '>Not in exchange</option>' +
              '<option value="identifying"' + (cl.exchange_1031_status === 'identifying' ? ' selected' : '') + '>Identifying (45-day)</option>' +
              '<option value="exchanging"' + (cl.exchange_1031_status === 'exchanging' ? ' selected' : '') + '>Exchanging (180-day)</option>' +
              '<option value="completed"' + (cl.exchange_1031_status === 'completed' ? ' selected' : '') + '>Completed</option>' +
            '</select></div>' +
          '<div><label class="text-xs text-gray-500">Deadline</label>' +
            '<input id="inv_1031_deadline" type="date" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + (cl.exchange_1031_deadline ? new Date(cl.exchange_1031_deadline).toISOString().split('T')[0] : '') + '"></div>' +
        '</div>' +
      '</div>' +
      '<button class="btn btn-gold w-full" onclick="BuyerWorkspace._saveInvestorIntake()">Save</button>' +
    '</div>');
  }

  function _saveInvestorIntake() {
    var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
    if (!clientId) return;

    MallanAPI.clients.update(clientId, {
      investment_strategy: document.getElementById('inv_strategy').value || null,
      holding_period_years: document.getElementById('inv_hold').value ? parseInt(document.getElementById('inv_hold').value) : null,
      cap_rate_target: document.getElementById('inv_cap').value ? parseFloat(document.getElementById('inv_cap').value) : null,
      cash_on_cash_target: document.getElementById('inv_coc').value ? parseFloat(document.getElementById('inv_coc').value) : null,
      exchange_1031_status: document.getElementById('inv_1031').value || 'none',
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Investment profile updated', 'success');
      Workspace.openClient(clientId);
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  // ─── Calculator Modals ─────────────────────────────────────────────

  function _openCapRateCalc() {
    CRM.openModal('Cap Rate Calculator', '<div class="space-y-4">' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Net Operating Income (Annual)</label>' +
          '<input id="cr_noi" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" oninput="BuyerWorkspace._calcCapRate()"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Property Value / Price</label>' +
          '<input id="cr_price" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" oninput="BuyerWorkspace._calcCapRate()"></div>' +
      '</div>' +
      '<div id="cr_result" class="p-4 bg-gray-50 rounded-lg text-center hidden">' +
        '<p class="text-xs text-gray-500">Cap Rate</p>' +
        '<p class="text-3xl font-bold text-amber-700" id="cr_value">0%</p>' +
        '<p class="text-xs text-gray-400 mt-1" id="cr_verdict"></p>' +
      '</div>' +
      '<p class="text-[10px] text-gray-400">Cap Rate = NOI / Property Value. Higher = better cash flow but potentially higher risk.</p>' +
    '</div>');
  }

  function _calcCapRate() {
    var noi = Number(document.getElementById('cr_noi').value) || 0;
    var price = Number(document.getElementById('cr_price').value) || 0;
    var result = document.getElementById('cr_result');
    if (price <= 0 || noi <= 0) { result.classList.add('hidden'); return; }
    var rate = (noi / price * 100).toFixed(2);
    result.classList.remove('hidden');
    document.getElementById('cr_value').textContent = rate + '%';
    var verdict = rate >= 8 ? 'Strong cash flow investment' : rate >= 5 ? 'Moderate — typical NYC range' : 'Low cap rate — appreciation play';
    document.getElementById('cr_verdict').textContent = verdict;
  }

  function _openCashOnCashCalc() {
    CRM.openModal('Cash-on-Cash Return Calculator', '<div class="space-y-4">' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Annual Cash Flow (After Debt Service)</label>' +
          '<input id="coc_cashflow" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" oninput="BuyerWorkspace._calcCashOnCash()"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Total Cash Invested</label>' +
          '<input id="coc_invested" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="Down payment + closing costs" oninput="BuyerWorkspace._calcCashOnCash()"></div>' +
      '</div>' +
      '<div id="coc_result" class="p-4 bg-gray-50 rounded-lg text-center hidden">' +
        '<p class="text-xs text-gray-500">Cash-on-Cash Return</p>' +
        '<p class="text-3xl font-bold text-green-700" id="coc_value">0%</p>' +
        '<p class="text-xs text-gray-400 mt-1" id="coc_verdict"></p>' +
      '</div>' +
      '<p class="text-[10px] text-gray-400">Cash-on-Cash = Annual Cash Flow / Total Cash Invested. Measures return on actual dollars invested.</p>' +
    '</div>');
  }

  function _calcCashOnCash() {
    var cf = Number(document.getElementById('coc_cashflow').value) || 0;
    var inv = Number(document.getElementById('coc_invested').value) || 0;
    var result = document.getElementById('coc_result');
    if (inv <= 0) { result.classList.add('hidden'); return; }
    var rate = (cf / inv * 100).toFixed(2);
    result.classList.remove('hidden');
    document.getElementById('coc_value').textContent = rate + '%';
    var color = rate >= 8 ? 'text-green-700' : rate >= 4 ? 'text-yellow-700' : 'text-red-700';
    document.getElementById('coc_value').className = 'text-3xl font-bold ' + color;
    var verdict = rate >= 10 ? 'Excellent return' : rate >= 6 ? 'Good — above market average' : rate >= 3 ? 'Below average — consider alternatives' : 'Poor cash-on-cash';
    document.getElementById('coc_verdict').textContent = verdict;
  }

  function _openROICalc() {
    CRM.openModal('ROI Calculator', '<div class="space-y-4">' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Purchase Price</label>' +
          '<input id="roi_price" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" oninput="BuyerWorkspace._calcROI()"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Current / Expected Value</label>' +
          '<input id="roi_value" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" oninput="BuyerWorkspace._calcROI()"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Total Rental Income (Over Hold)</label>' +
          '<input id="roi_income" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" oninput="BuyerWorkspace._calcROI()"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Total Expenses (Over Hold)</label>' +
          '<input id="roi_expenses" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" oninput="BuyerWorkspace._calcROI()"></div>' +
      '</div>' +
      '<div id="roi_result" class="p-4 bg-gray-50 rounded-lg text-center hidden">' +
        '<p class="text-xs text-gray-500">Total ROI</p>' +
        '<p class="text-3xl font-bold text-blue-700" id="roi_val">0%</p>' +
        '<div class="grid grid-cols-2 gap-2 mt-2 text-xs text-gray-500">' +
          '<div>Appreciation: <span class="font-bold" id="roi_appr">$0</span></div>' +
          '<div>Net Cash Flow: <span class="font-bold" id="roi_cf">$0</span></div>' +
        '</div>' +
      '</div>' +
    '</div>');
  }

  function _calcROI() {
    var price = Number(document.getElementById('roi_price').value) || 0;
    var value = Number(document.getElementById('roi_value').value) || 0;
    var income = Number(document.getElementById('roi_income').value) || 0;
    var expenses = Number(document.getElementById('roi_expenses').value) || 0;
    var result = document.getElementById('roi_result');
    if (price <= 0) { result.classList.add('hidden'); return; }
    var appreciation = value - price;
    var netCashFlow = income - expenses;
    var totalGain = appreciation + netCashFlow;
    var roi = (totalGain / price * 100).toFixed(2);
    result.classList.remove('hidden');
    document.getElementById('roi_val').textContent = roi + '%';
    document.getElementById('roi_appr').textContent = $(appreciation);
    document.getElementById('roi_cf').textContent = $(netCashFlow);
  }

  function _openRentalYieldCalc() {
    CRM.openModal('Rental Yield Calculator', '<div class="space-y-4">' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Monthly Rent</label>' +
          '<input id="ry_rent" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" oninput="BuyerWorkspace._calcRentalYield()"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Property Price</label>' +
          '<input id="ry_price" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" oninput="BuyerWorkspace._calcRentalYield()"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Annual Expenses (Maint, Tax, Insurance)</label>' +
          '<input id="ry_expenses" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0" oninput="BuyerWorkspace._calcRentalYield()"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Vacancy Rate %</label>' +
          '<input id="ry_vacancy" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="5" value="5" oninput="BuyerWorkspace._calcRentalYield()"></div>' +
      '</div>' +
      '<div id="ry_result" class="p-4 bg-gray-50 rounded-lg hidden">' +
        '<div class="grid grid-cols-2 gap-3 text-center">' +
          '<div><p class="text-xs text-gray-500">Gross Yield</p><p class="text-2xl font-bold text-purple-700" id="ry_gross">0%</p></div>' +
          '<div><p class="text-xs text-gray-500">Net Yield</p><p class="text-2xl font-bold text-green-700" id="ry_net">0%</p></div>' +
        '</div>' +
        '<div class="mt-2 text-xs text-gray-500 text-center" id="ry_detail"></div>' +
      '</div>' +
    '</div>');
  }

  function _calcRentalYield() {
    var rent = Number(document.getElementById('ry_rent').value) || 0;
    var price = Number(document.getElementById('ry_price').value) || 0;
    var expenses = Number(document.getElementById('ry_expenses').value) || 0;
    var vacancy = Number(document.getElementById('ry_vacancy').value) || 0;
    var result = document.getElementById('ry_result');
    if (price <= 0 || rent <= 0) { result.classList.add('hidden'); return; }
    var annualRent = rent * 12;
    var effectiveRent = annualRent * (1 - vacancy / 100);
    var grossYield = (annualRent / price * 100).toFixed(2);
    var netYield = ((effectiveRent - expenses) / price * 100).toFixed(2);
    result.classList.remove('hidden');
    document.getElementById('ry_gross').textContent = grossYield + '%';
    document.getElementById('ry_net').textContent = netYield + '%';
    document.getElementById('ry_detail').textContent = 'Annual Rent: ' + $(annualRent) + ' | Effective: ' + $(effectiveRent) + ' | NOI: ' + $(effectiveRent - expenses);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LEGACY COMPAT — renderBuyerSections (used by old workspace fallback)
  // ═══════════════════════════════════════════════════════════════════════

  function renderBuyerSections(cl) {
    var html = '';
    html += _convictionCardLegacy(cl);
    html += _buyerRepCard(cl);
    if (cl.is_investor) {
      html += _investorIntakeCard(cl);
      html += _exchange1031Card(cl);
      html += _investorToolsCard();
    }
    return html;
  }

  function _convictionCardLegacy(cl) {
    var body = '<div id="buyerConvictionDisplay">' +
      '<div class="flex items-center justify-center py-4">' +
        '<div class="w-20 h-20 rounded-full border-4 border-gray-200 flex items-center justify-center">' +
          '<span class="text-2xl font-bold text-gray-300">-</span>' +
        '</div>' +
      '</div>' +
    '</div>';
    setTimeout(function () {
      var clientId = Workspace._getClientId ? Workspace._getClientId() : null;
      if (clientId) _fetchConviction(clientId);
    }, 0);
    return _card('brain', 'Conviction Score', '', body, '#8B5CF6');
  }

  function _buyerRepCard(cl) {
    var signed = cl.buyer_rep_agreement || false;
    var date = cl.buyer_rep_agreement_date;
    var body = '<div class="flex items-center gap-3">' +
      '<div class="w-10 h-10 rounded-full flex items-center justify-center ' + (signed ? 'bg-green-100' : 'bg-red-100') + '">' +
        '<i class="fas ' + (signed ? 'fa-check-circle text-green-600' : 'fa-times-circle text-red-500') + ' text-lg"></i>' +
      '</div>' +
      '<div>' +
        '<p class="text-sm font-bold ' + (signed ? 'text-green-700' : 'text-red-700') + '">' + (signed ? 'Signed' : 'Not Signed') + '</p>' +
        (date ? '<p class="text-xs text-gray-500">Date: ' + D(date) + '</p>' : '') +
        '<p class="text-[10px] text-gray-400 mt-0.5">UCBA E7 — Required before submitting offers</p>' +
      '</div>' +
      '<button class="btn btn-xs btn-outline ml-auto" onclick="BuyerWorkspace._toggleBuyerRep()">' + (signed ? 'Unmark' : 'Mark Signed') + '</button>' +
    '</div>';
    return _card('file-signature', 'Buyer Rep Agreement', '', body);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════
  return {
    // Full workspace renderers (v2)
    renderProspect: renderProspect,
    renderActive: renderActive,
    switchActiveTab: switchActiveTab,

    // Legacy compat
    renderBuyerSections: renderBuyerSections,

    // Convert flow
    _convertToActive: _convertToActive,
    _submitConvert: _submitConvert,
    _toggleBuyerRep: _toggleBuyerRep,

    // Edit modals
    _editStory: _editStory,
    _saveStory: _saveStory,
    _editAttorney: _editAttorney,
    _saveAttorney: _saveAttorney,
    _editInvestorIntake: _editInvestorIntake,
    _saveInvestorIntake: _saveInvestorIntake,

    // Search + send
    _searchAndSend: _searchAndSend,
    _sendToClient: _sendToClient,

    // Documents
    _uploadDocument: _uploadDocument,
    _submitDocument: _submitDocument,
    _requestDocument: _requestDocument,

    // Calculator modal openers
    _openCapRateCalc: _openCapRateCalc,
    _openCashOnCashCalc: _openCashOnCashCalc,
    _openROICalc: _openROICalc,
    _openRentalYieldCalc: _openRentalYieldCalc,

    // Calculator computation
    _calcCapRate: _calcCapRate,
    _calcCashOnCash: _calcCashOnCash,
    _calcROI: _calcROI,
    _calcRentalYield: _calcRentalYield,
  };
})();
