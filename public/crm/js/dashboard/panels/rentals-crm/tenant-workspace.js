// ═══════════════════════════════════════════════════════════════════════════════
// TENANT WORKSPACE — Full lifecycle workspace for renters/tenants
// 4 phases: Prospect → Active Renter → Viewed/Did Not Rent → Current Tenant
// ═══════════════════════════════════════════════════════════════════════════════
/* global CRM, Router, Store, UI, Utils, MallanAPI, Workspace, ClientNormalizer, Documents, Events, ActivityTable */

var TenantWorkspace = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  // ─── Shared helpers ─────────────────────────────────────────────────

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

  function _norm(client) {
    return ClientNormalizer.normalize(client);
  }

  function _displayName(cl) {
    return cl._displayName || ClientNormalizer.displayName(cl) || cl.name || cl.email || 'Client';
  }

  function _renderHeader(cl, badgeText, badgeColor, backRoute, backLabel) {
    var name = cl.name || cl.email || 'Client';
    var hasSecondary = cl.secondary_first_name || cl.secondary_last_name;
    var secondaryName = hasSecondary ? ((cl.secondary_first_name || '') + ' ' + (cl.secondary_last_name || '')).trim() : '';

    var html = '<div class="flex items-center gap-2 mb-2">' +
      '<button class="text-sm text-gray-500 hover:text-gray-700" onclick="Router.navigate(\'' + backRoute + '\')"><i class="fas fa-arrow-left mr-1"></i> ' + E(backLabel) + '</button>' +
    '</div>';

    html += '<div class="workspace-header">' +
      '<div class="flex items-center justify-between">' +
        '<div class="flex items-center gap-4">' +
          UI.avatar(name, 48) +
          '<div>' +
            '<h2 class="text-xl font-bold text-gray-900">' + E(_displayName(cl)) + '</h2>' +
            '<div class="flex items-center gap-2 mt-1">' +
              UI.roleBadge('renter') +
              '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;font-size:10px;font-weight:700;border-radius:6px;background:' + badgeColor + '20;color:' + badgeColor + ';text-transform:uppercase;">' + E(badgeText) + '</span>' +
              (cl.budget_max ? '<span class="text-xs text-gray-500"><i class="fas fa-dollar-sign mr-0.5"></i>' + $(Number(cl.budget_max)) + '/mo</span>' : '') +
              (hasSecondary ? '<span class="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">' + E(cl.secondary_relationship || 'partner') + '</span>' : '') +
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

    return html;
  }

  function _renderActionBar(buttons) {
    var html = '<div class="flex items-center gap-2 py-3 px-1 border-b bg-white sticky top-0 z-10 flex-wrap">';
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var cls = b.gold ? 'btn btn-sm btn-gold' : 'btn btn-sm btn-outline';
      html += '<button class="' + cls + '" onclick="' + b.onclick + '">';
      if (b.icon) html += '<i class="fas ' + b.icon + ' mr-1"></i>';
      html += '<span class="hidden sm:inline">' + E(b.label) + '</span>';
      html += '</button>';
    }
    html += '</div>';
    return html;
  }

  function _renderRightRail(cards) {
    var html = '<div class="space-y-4">';
    for (var i = 0; i < cards.length; i++) {
      html += cards[i];
    }
    html += '</div>';
    return html;
  }

  function _twoColumn(leftHtml, rightHtml) {
    return '<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">' +
      '<div class="lg:col-span-2 space-y-4">' + leftHtml + '</div>' +
      '<div class="space-y-4">' + rightHtml + '</div>' +
    '</div>';
  }

  // ─── Shared data helpers ────────────────────────────────────────────

  function _parseJson(val) {
    if (!val) return {};
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch (e) { return {}; }
  }

  function _clientId() {
    return Workspace._getClientId ? Workspace._getClientId() : null;
  }

  function _currentClient() {
    return Workspace._getClient ? Workspace._getClient() : {};
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 1. PROSPECT MODE
  // ═══════════════════════════════════════════════════════════════════════

  function renderProspect(client, container, clientId) {
    var cl = _norm(client);

    var html = '<div class="space-y-0">';

    // Header
    html += _renderHeader(cl, 'Renter Prospect', '#6B7280', '/rentals/renter-prospects', 'Renter Prospects');

    // Action bar
    html += _renderActionBar([
      { label: 'Activate', icon: 'fa-bolt', onclick: 'TenantWorkspace._activateRenter()', gold: true },
      { label: 'Send Listing', icon: 'fa-paper-plane', onclick: 'TenantWorkspace._openSendListing()' },
      { label: 'Add Note', icon: 'fa-sticky-note', onclick: 'TenantWorkspace._addNote()' },
      { label: 'Email', icon: 'fa-envelope', onclick: 'TenantWorkspace._emailClient()' },
      { label: 'Call', icon: 'fa-phone', onclick: 'TenantWorkspace._callClient()' },
    ]);

    // Main content: two columns
    var left = '';
    left += _whatTheyNeedCard(cl);
    left += _moveInTimelineCard(cl);
    left += _sendListingToolCard();

    var right = '';
    right += _docsReadinessCard(cl);
    right += _prospectNotesCard(cl);

    // Convert button at bottom of left
    left += '<div class="pt-2">' +
      '<button class="btn btn-gold w-full py-3" onclick="TenantWorkspace._activateRenter()">' +
        '<i class="fas fa-arrow-right mr-2"></i> Committed to Searching — Activate as Renter' +
      '</button>' +
    '</div>';

    html += _twoColumn(left, right);
    html += '</div>';

    container.innerHTML = html;
  }

  function _whatTheyNeedCard(cl) {
    var prefs = _parseJson(cl.preferences || cl.search_preferences);
    var areas = cl.preferred_areas || prefs.areas || '';
    if (Array.isArray(areas)) areas = areas.join(', ');
    var budgetMin = cl.budget_min || prefs.budget_min || '';
    var budgetMax = cl.budget_max || prefs.budget_max || '';
    var beds = cl.beds_min || prefs.beds || '';
    var baths = cl.baths_min || prefs.baths || '';
    var noFee = cl.no_fee_preference || prefs.no_fee || false;
    var pets = cl.has_pets || prefs.pets || '';
    var buildingType = cl.building_type_pref || prefs.building_type || '';

    var budgetStr = '';
    if (budgetMin && budgetMax) budgetStr = $(Number(budgetMin)) + ' - ' + $(Number(budgetMax));
    else if (budgetMax) budgetStr = 'Up to ' + $(Number(budgetMax));
    else if (budgetMin) budgetStr = $(Number(budgetMin)) + '+';
    else budgetStr = 'Not set';

    var body = '<div class="grid grid-cols-2 gap-3 text-sm">' +
      '<div class="space-y-2">' +
        '<div><p class="text-xs text-gray-500">Neighborhoods</p><p class="font-medium text-gray-900">' + E(areas || 'Not set') + '</p></div>' +
        '<div><p class="text-xs text-gray-500">Monthly Budget</p><p class="font-medium text-gray-900">' + E(budgetStr) + '</p></div>' +
        '<div><p class="text-xs text-gray-500">Bedrooms</p><p class="font-medium text-gray-900">' + E(beds || 'Any') + (baths ? ' bd / ' + E(baths) + ' ba' : ' bd') + '</p></div>' +
      '</div>' +
      '<div class="space-y-2">' +
        '<div><p class="text-xs text-gray-500">No-Fee Preference</p><p class="font-medium ' + (noFee ? 'text-green-700' : 'text-gray-900') + '">' + (noFee ? 'No-Fee Only' : 'Open to Fee') + '</p></div>' +
        '<div><p class="text-xs text-gray-500">Pets</p><p class="font-medium text-gray-900">' + E(pets || 'None') + '</p></div>' +
        '<div><p class="text-xs text-gray-500">Building Type</p><p class="font-medium text-gray-900">' + E(buildingType || 'Any') + '</p></div>' +
      '</div>' +
    '</div>';

    return _card('search', 'What They Need', 'TenantWorkspace._editPreferences()', body, '#3B82F6');
  }

  function _moveInTimelineCard(cl) {
    var targetDate = cl.target_move_date || cl.move_date || '';
    var currentSituation = cl.current_situation || '';
    var urgency = cl.urgency_level || 'normal';

    var urgencyColors = {
      urgent: { bg: 'bg-red-50', text: 'text-red-700', label: 'Urgent', border: '#DC2626' },
      high: { bg: 'bg-orange-50', text: 'text-orange-700', label: 'High', border: '#F97316' },
      normal: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Normal', border: '#3B82F6' },
      flexible: { bg: 'bg-green-50', text: 'text-green-700', label: 'Flexible', border: '#059669' },
    };
    var uInfo = urgencyColors[urgency] || urgencyColors.normal;

    var daysUntil = '';
    if (targetDate) {
      var diff = Math.floor((new Date(targetDate).getTime() - Date.now()) / 86400000);
      daysUntil = diff > 0 ? diff + ' days away' : (diff === 0 ? 'Today' : Math.abs(diff) + ' days ago');
    }

    var body = '<div class="space-y-3">' +
      '<div class="flex items-center gap-4">' +
        '<div class="flex-1">' +
          '<p class="text-xs text-gray-500">Target Move-In</p>' +
          '<p class="text-lg font-bold text-gray-900">' + (targetDate ? E(D(targetDate)) : 'Not set') + '</p>' +
          (daysUntil ? '<p class="text-xs text-gray-500">' + E(daysUntil) + '</p>' : '') +
        '</div>' +
        '<div class="p-3 rounded-lg ' + uInfo.bg + ' text-center">' +
          '<p class="text-[10px] text-gray-500">Urgency</p>' +
          '<p class="text-sm font-bold ' + uInfo.text + '">' + E(uInfo.label) + '</p>' +
        '</div>' +
      '</div>' +
      '<div>' +
        '<p class="text-xs text-gray-500">Current Situation</p>' +
        '<p class="text-sm font-medium text-gray-900">' + E(currentSituation || 'Not specified') + '</p>' +
        '<p class="text-[10px] text-gray-400 mt-0.5">e.g., breaking lease, month-to-month, new to NYC</p>' +
      '</div>' +
    '</div>';

    return _card('clock', 'Move-in Timeline', 'TenantWorkspace._editTimeline()', body, uInfo.border);
  }

  function _sendListingToolCard() {
    var body = '<div class="space-y-3">' +
      '<div class="relative">' +
        '<input id="tw_sendListingSearch" class="w-full border rounded-lg px-3 py-2 text-sm pl-9" placeholder="Search by address, neighborhood, or MLS#...">' +
        '<i class="fas fa-search absolute left-3 top-2.5 text-gray-400 text-sm"></i>' +
      '</div>' +
      '<div id="tw_sendListingResults" class="max-h-48 overflow-y-auto"></div>' +
      '<p class="text-[10px] text-gray-400">Search for a listing to send to this prospect. Results from your IDX feed.</p>' +
    '</div>';

    return _card('paper-plane', 'Send Listing', '', body);
  }

  function _prospectNotesCard(cl) {
    var body = '<div id="tw_prospectNotes">' + UI.loading() + '</div>';
    setTimeout(function () { _fetchNotes(); }, 0);
    return _card('sticky-note', 'Notes', '', body);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. ACTIVE MODE
  // ═══════════════════════════════════════════════════════════════════════

  function renderActive(client, container, clientId) {
    var cl = _norm(client);

    var html = '<div class="space-y-0">';

    // Header
    html += _renderHeader(cl, 'Active Renter', '#3B82F6', '/rentals/renters', 'Active Renters');

    // Action bar
    html += _renderActionBar([
      { label: 'Sign Lease', icon: 'fa-file-signature', onclick: 'TenantWorkspace._signLease()', gold: true },
      { label: 'Did Not Rent', icon: 'fa-times-circle', onclick: 'TenantWorkspace._didNotRent()' },
      { label: 'Send Listing', icon: 'fa-paper-plane', onclick: 'TenantWorkspace._openSendListing()' },
      { label: 'Add Note', icon: 'fa-sticky-note', onclick: 'TenantWorkspace._addNote()' },
      { label: 'Email', icon: 'fa-envelope', onclick: 'TenantWorkspace._emailClient()' },
      { label: 'Call', icon: 'fa-phone', onclick: 'TenantWorkspace._callClient()' },
    ]);

    // Tabbed content
    var activeTab = Store.get('tw_activeTab') || 'listings_sent';
    var tabs = [
      { id: 'listings_sent', label: 'Listings Sent', icon: 'fa-paper-plane' },
      { id: 'showings', label: 'Showings', icon: 'fa-calendar' },
      { id: 'applications', label: 'Applications', icon: 'fa-file-alt' },
      { id: 'communication', label: 'Communication', icon: 'fa-comments' },
      { id: 'activity', label: 'Activity', icon: 'fa-stream' },
    ];

    html += '<div class="flex border-b mt-3 overflow-x-auto">';
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      var isActive = activeTab === t.id;
      html += '<button class="px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all ' +
        (isActive ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700') +
        '" onclick="TenantWorkspace._switchActiveTab(\'' + t.id + '\')">' +
        '<i class="fas ' + t.icon + ' mr-1"></i>' + E(t.label) +
      '</button>';
    }
    html += '</div>';

    // Tab content area
    html += '<div id="tw_activeTabContent" class="mt-4">' + UI.loading() + '</div>';

    html += '</div>';
    container.innerHTML = html;

    // Render the active tab
    _renderActiveTabContent(activeTab, cl, clientId);
  }

  function _switchActiveTab(tabId) {
    Store.set('tw_activeTab', tabId);
    var cl = _norm(_currentClient());
    var cId = _clientId();
    _renderActiveTabContent(tabId, cl, cId);

    // Update tab highlight
    var btns = document.querySelectorAll('.border-b button');
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      if (btn.textContent && btn.onclick) {
        var isThis = btn.getAttribute('onclick').indexOf(tabId) !== -1;
        btn.className = 'px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all ' +
          (isThis ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700');
      }
    }
  }

  function _renderActiveTabContent(tabId, cl, clientId) {
    var el = document.getElementById('tw_activeTabContent');
    if (!el) return;

    if (tabId === 'listings_sent') {
      _renderListingsSentTab(el, cl, clientId);
    } else if (tabId === 'showings') {
      _renderShowingsTab(el, cl, clientId);
    } else if (tabId === 'applications') {
      _renderApplicationsTab(el, cl, clientId);
    } else if (tabId === 'communication') {
      _renderCommunicationTab(el, cl, clientId);
    } else if (tabId === 'activity') {
      _renderActivityTab(el, cl, clientId);
    }
  }

  function _renderListingsSentTab(el, cl, clientId) {
    el.innerHTML = UI.loading();
    MallanAPI._fetch('/api/crm/listing-sends?client_id=' + clientId').then(function (data) {
      var listings = data.listings || [];
      if (listings.length === 0) {
        el.innerHTML = UI.emptyState('fa-paper-plane', 'No listings sent yet',
          '<button class="btn btn-sm btn-gold mt-2" onclick="TenantWorkspace._openSendListing()"><i class="fas fa-plus mr-1"></i> Send a Listing</button>');
        return;
      }

      var html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
      listings.forEach(function (l) {
        var reactionIcon = '';
        if (l.reaction === 'liked') reactionIcon = '<i class="fas fa-heart text-green-500"></i>';
        else if (l.reaction === 'disliked') reactionIcon = '<i class="fas fa-thumbs-down text-red-500"></i>';
        else if (l.reaction === 'discuss') reactionIcon = '<i class="fas fa-comment text-blue-500"></i>';

        html += '<div class="border rounded-xl bg-white shadow-sm overflow-hidden">' +
          '<div class="flex">' +
            (l.photo ? '<img src="' + E(l.photo) + '" class="w-24 h-24 object-cover flex-shrink-0" alt="Property" onerror="this.style.display=\'none\'">' :
              '<div class="w-24 h-24 bg-gray-100 flex items-center justify-center flex-shrink-0"><i class="fas fa-image text-gray-300"></i></div>') +
            '<div class="p-3 flex-1 min-w-0">' +
              '<p class="text-sm font-bold text-gray-900 truncate">' + E(l.address || l.UnparsedAddress || 'Property') + '</p>' +
              '<p class="text-xs text-gray-500">' + $(Number(l.price || l.ListPrice || 0)) + '/mo</p>' +
              '<div class="flex items-center gap-2 mt-2">' +
                (reactionIcon ? '<span>' + reactionIcon + '</span>' : '') +
                (l.viewed ? '<span class="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded font-bold">Viewed</span>' : '') +
                (l.saved ? '<span class="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded font-bold">Saved</span>' : '') +
                (l.showing_requested ? '<span class="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-600 rounded font-bold">Showing Req</span>' : '') +
              '</div>' +
              '<p class="text-[10px] text-gray-400 mt-1">Sent ' + D(l.sent_at || l.created_at) + '</p>' +
            '</div>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
      el.innerHTML = html;
    }).catch(function () {
      el.innerHTML = UI.emptyState('fa-paper-plane', 'No listings sent yet',
        '<button class="btn btn-sm btn-gold mt-2" onclick="TenantWorkspace._openSendListing()"><i class="fas fa-plus mr-1"></i> Send a Listing</button>');
    });
  }

  function _renderShowingsTab(el, cl, clientId) {
    el.innerHTML = UI.loading();
    MallanAPI._fetch('/api/crm/showing-history?lead_id=' + clientId).then(function (data) {
      var showings = data.showings || [];
      if (showings.length === 0) {
        el.innerHTML = UI.emptyState('fa-calendar', 'No showings recorded',
          '<button class="btn btn-sm btn-outline mt-2" onclick="TenantWorkspace._addShowing()"><i class="fas fa-plus mr-1"></i> Add Showing</button>');
        return;
      }

      var html = '<div class="overflow-x-auto">' +
        '<table class="w-full text-sm">' +
          '<thead><tr class="border-b text-xs text-gray-500 text-left">' +
            '<th class="py-2 px-3">Address</th>' +
            '<th class="py-2 px-3">Unit</th>' +
            '<th class="py-2 px-3">Date</th>' +
            '<th class="py-2 px-3">Price</th>' +
            '<th class="py-2 px-3">Reaction</th>' +
            '<th class="py-2 px-3">Why Not</th>' +
          '</tr></thead><tbody>';

      showings.forEach(function (s) {
        var reactionLabels = { interested: 'Interested', neutral: 'Neutral', not_interested: 'Not Interested' };
        var reactionColors = { interested: 'text-green-600', neutral: 'text-yellow-600', not_interested: 'text-red-600' };
        var whyLabels = {
          fee_objection: 'Fee', price: 'Price', location: 'Location',
          building: 'Building', timing: 'Timing', other: 'Other',
        };

        html += '<tr class="border-b hover:bg-gray-50">' +
          '<td class="py-2 px-3 font-medium">' + E(s.address || '') + '</td>' +
          '<td class="py-2 px-3">' + E(s.unit || '-') + '</td>' +
          '<td class="py-2 px-3">' + D(s.showing_date) + '</td>' +
          '<td class="py-2 px-3">' + (s.price_at_time ? $(Number(s.price_at_time)) : '-') + '</td>' +
          '<td class="py-2 px-3 ' + (reactionColors[s.reaction] || '') + ' font-medium">' + E(reactionLabels[s.reaction] || s.reaction || '-') + '</td>' +
          '<td class="py-2 px-3">' + (s.why_not_rented ? '<span class="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-bold">' + E(whyLabels[s.why_not_rented] || s.why_not_rented) + '</span>' : '-') + '</td>' +
        '</tr>';
      });

      html += '</tbody></table></div>' +
        '<button class="btn btn-xs btn-outline mt-3" onclick="TenantWorkspace._addShowing()"><i class="fas fa-plus mr-1"></i> Add Showing</button>';
      el.innerHTML = html;
    }).catch(function () {
      el.innerHTML = UI.emptyState('fa-calendar', 'Unable to load showings');
    });
  }

  function _renderApplicationsTab(el, cl, clientId) {
    el.innerHTML = UI.loading();
    MallanAPI._fetch('/api/crm/rentals/applications?renter_id=' + clientId').then(function (data) {
      var apps = data.applications || [];
      if (apps.length === 0) {
        el.innerHTML = UI.emptyState('fa-file-alt', 'No applications submitted',
          '<button class="btn btn-sm btn-outline mt-2" onclick="TenantWorkspace._addApplication()"><i class="fas fa-plus mr-1"></i> Add Application</button>');
        return;
      }

      var html = '<div class="overflow-x-auto">' +
        '<table class="w-full text-sm">' +
          '<thead><tr class="border-b text-xs text-gray-500 text-left">' +
            '<th class="py-2 px-3">Address</th>' +
            '<th class="py-2 px-3">Date</th>' +
            '<th class="py-2 px-3">Status</th>' +
            '<th class="py-2 px-3">Landlord Response</th>' +
          '</tr></thead><tbody>';

      apps.forEach(function (a) {
        var statusColors = {
          submitted: 'bg-blue-100 text-blue-700',
          approved: 'bg-green-100 text-green-700',
          denied: 'bg-red-100 text-red-700',
          pending: 'bg-yellow-100 text-yellow-700',
          withdrawn: 'bg-gray-100 text-gray-600',
        };
        var sCls = statusColors[a.status] || statusColors.pending;

        html += '<tr class="border-b hover:bg-gray-50">' +
          '<td class="py-2 px-3 font-medium">' + E(a.address || '') + '</td>' +
          '<td class="py-2 px-3">' + D(a.submitted_date || a.created_at) + '</td>' +
          '<td class="py-2 px-3"><span class="text-[10px] px-2 py-0.5 rounded font-bold ' + sCls + '">' + E(a.status || 'pending') + '</span></td>' +
          '<td class="py-2 px-3 text-xs text-gray-600">' + E(a.landlord_response || '-') + '</td>' +
        '</tr>';
      });

      html += '</tbody></table></div>' +
        '<button class="btn btn-xs btn-outline mt-3" onclick="TenantWorkspace._addApplication()"><i class="fas fa-plus mr-1"></i> Add Application</button>';
      el.innerHTML = html;
    }).catch(function () {
      el.innerHTML = UI.emptyState('fa-file-alt', 'No applications yet',
        '<button class="btn btn-sm btn-outline mt-2" onclick="TenantWorkspace._addApplication()"><i class="fas fa-plus mr-1"></i> Add Application</button>');
    });
  }

  function _renderCommunicationTab(el, cl, clientId) {
    el.innerHTML = UI.loading();
    MallanAPI._fetch('/api/crm/communications?lead_id=' + clientId + '&limit=50').then(function (data) {
      var msgs = data.communications || data.messages || [];
      if (msgs.length === 0) {
        el.innerHTML = UI.emptyState('fa-comments', 'No messages yet',
          '<button class="btn btn-sm btn-outline mt-2" onclick="TenantWorkspace._emailClient()"><i class="fas fa-envelope mr-1"></i> Send Email</button>');
        return;
      }

      var html = '<div class="space-y-3 max-h-96 overflow-y-auto">';
      msgs.forEach(function (m) {
        var isOutgoing = m.direction === 'outgoing' || m.direction === 'sent';
        html += '<div class="flex ' + (isOutgoing ? 'justify-end' : 'justify-start') + '">' +
          '<div class="max-w-[75%] p-3 rounded-xl text-sm ' +
            (isOutgoing ? 'bg-blue-50 text-blue-900' : 'bg-gray-100 text-gray-900') + '">' +
            '<p class="font-medium text-xs text-gray-500 mb-1">' +
              E(m.from_name || (isOutgoing ? 'You' : cl.name || 'Client')) +
              ' · ' + D(m.created_at || m.sent_at) +
            '</p>' +
            '<p>' + E(m.body || m.message || m.subject || '') + '</p>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
      el.innerHTML = html;
    }).catch(function () {
      el.innerHTML = UI.emptyState('fa-comments', 'Unable to load messages');
    });
  }

  function _renderActivityTab(el, cl, clientId) {
    el.innerHTML = UI.loading();
    if (typeof ActivityTable !== 'undefined' && ActivityTable.render) {
      ActivityTable.render(el, clientId);
    } else {
      MallanAPI._fetch('/api/crm/events?entity_id=' + clientId + '&entity_type=client').then(function (data) {
        var events = data.events || data.activities || [];
        if (events.length === 0) {
          el.innerHTML = UI.emptyState('fa-stream', 'No activity recorded yet');
          return;
        }
        var html = '<div class="space-y-2">';
        events.forEach(function (ev) {
          html += '<div class="flex items-start gap-3 py-2 border-b last:border-0">' +
            '<div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">' +
              '<i class="fas fa-circle text-[6px] text-gray-400"></i>' +
            '</div>' +
            '<div class="flex-1 min-w-0">' +
              '<p class="text-sm text-gray-900">' + E(ev.description || ev.event || ev.type || '') + '</p>' +
              '<p class="text-xs text-gray-400">' + D(ev.created_at || ev.timestamp) + '</p>' +
            '</div>' +
          '</div>';
        });
        html += '</div>';
        el.innerHTML = html;
      }).catch(function () {
        el.innerHTML = UI.emptyState('fa-stream', 'Unable to load activity');
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3. VIEWED / DID NOT RENT MODE
  // ═══════════════════════════════════════════════════════════════════════

  function renderViewedNotRent(client, container, clientId) {
    var cl = _norm(client);

    var html = '<div class="space-y-0">';

    // Header
    html += _renderHeader(cl, 'Viewed / Did Not Rent', '#F97316', '/rentals/viewed', 'Viewed / Did Not Rent');

    // Action bar
    html += _renderActionBar([
      { label: 'Promote to Buyer', icon: 'fa-arrow-up', onclick: 'TenantWorkspace._promoteToBuyer()', gold: true },
      { label: 'Re-engage as Renter', icon: 'fa-redo', onclick: 'TenantWorkspace._reengageAsRenter()' },
      { label: 'Add Note', icon: 'fa-sticky-note', onclick: 'TenantWorkspace._addNote()' },
      { label: 'Email', icon: 'fa-envelope', onclick: 'TenantWorkspace._emailClient()' },
      { label: 'Call', icon: 'fa-phone', onclick: 'TenantWorkspace._callClient()' },
    ]);

    // Two-column layout
    var left = '';
    left += _fullShowingHistoryCard(cl, clientId);
    left += _outreachScheduleCard(cl);

    var right = '';
    right += _buyerConversionCard(cl);
    right += _dripStatusCard(cl);

    html += _twoColumn(left, right);
    html += '</div>';

    container.innerHTML = html;
  }

  function _fullShowingHistoryCard(cl, clientId) {
    var body = '<div id="tw_fullShowingHistory">' + UI.loading() + '</div>' +
      '<button class="btn btn-xs btn-gold w-full mt-2" onclick="TenantWorkspace._addShowing()"><i class="fas fa-plus mr-1"></i> Add Showing Record</button>';

    setTimeout(function () { _fetchShowingHistory('tw_fullShowingHistory', true); }, 0);

    return _card('eye', 'Full Showing History', '', body, '#F97316');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 4. CURRENT TENANT MODE
  // ═══════════════════════════════════════════════════════════════════════

  function renderCurrentTenant(client, container, clientId) {
    var cl = _norm(client);

    var html = '<div class="space-y-0">';

    // Header with property address
    var address = cl.property_address || cl.address || '';
    var unit = cl.unit_number || '';
    var headerExtra = address ? (E(address) + (unit ? ' #' + E(unit) : '')) : '';

    html += _renderHeader(cl, 'Current Tenant', '#059669', '/rentals/tenants', 'Current Tenants');

    // Show property address below header if available
    if (headerExtra) {
      html += '<div class="flex items-center gap-2 px-1 py-1 text-xs text-gray-500">' +
        '<i class="fas fa-building text-gray-400"></i> ' + headerExtra +
      '</div>';
    }

    // Action bar
    html += _renderActionBar([
      { label: 'Promote to Buyer', icon: 'fa-arrow-up', onclick: 'TenantWorkspace._promoteToBuyer()', gold: true },
      { label: 'Set Not Renewing', icon: 'fa-sign-out-alt', onclick: 'TenantWorkspace._setNotRenewing()' },
      { label: 'Add Note', icon: 'fa-sticky-note', onclick: 'TenantWorkspace._addNote()' },
      { label: 'Email', icon: 'fa-envelope', onclick: 'TenantWorkspace._emailClient()' },
      { label: 'Call', icon: 'fa-phone', onclick: 'TenantWorkspace._callClient()' },
    ]);

    // Two-column layout
    var left = '';
    left += _leaseTimelineCard(cl);
    left += _renewalStatusCard(cl);
    left += _communicationCardInline(cl, clientId);

    var right = '';
    right += _buyerConversionCard(cl);
    right += _propertyInfoCard(cl);
    right += _activityCardInline(cl, clientId);

    html += _twoColumn(left, right);
    html += '</div>';

    container.innerHTML = html;
  }

  function _leaseTimelineCard(cl) {
    var leaseStart = cl.lease_start_date || cl.lease_start || '';
    var leaseEnd = cl.lease_end_date || cl.lease_end || '';
    var monthlyRent = cl.rent_per_month || cl.budget_max || 0;
    var daysLeft = 0;
    var totalDays = 1;
    var pct = 0;

    if (leaseStart && leaseEnd) {
      var startMs = new Date(leaseStart).getTime();
      var endMs = new Date(leaseEnd).getTime();
      var nowMs = Date.now();
      totalDays = Math.max(1, Math.floor((endMs - startMs) / 86400000));
      daysLeft = Math.max(0, Math.floor((endMs - nowMs) / 86400000));
      var elapsed = totalDays - daysLeft;
      pct = Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100)));
    }

    var barColor = daysLeft > 90 ? '#059669' : daysLeft > 30 ? '#F59E0B' : '#DC2626';
    var textColor = daysLeft > 90 ? 'text-green-600' : daysLeft > 30 ? 'text-yellow-600' : 'text-red-600';

    var body = '<div class="space-y-3">' +
      '<div class="flex items-center justify-between">' +
        '<div>' +
          '<p class="text-xs text-gray-500">Lease Period</p>' +
          '<p class="text-sm font-medium text-gray-900">' +
            (leaseStart ? D(leaseStart) : '?') + ' — ' + (leaseEnd ? D(leaseEnd) : '?') +
          '</p>' +
        '</div>' +
        '<div class="text-right">' +
          '<p class="text-xs text-gray-500">Days Remaining</p>' +
          '<p class="text-2xl font-bold ' + textColor + '">' + daysLeft + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="h-3 bg-gray-200 rounded-full overflow-hidden">' +
        '<div class="h-full rounded-full transition-all" style="width:' + pct + '%;background:' + barColor + '"></div>' +
      '</div>' +
      '<div class="flex items-center justify-between text-xs text-gray-500">' +
        '<span>Start</span>' +
        '<span>End</span>' +
      '</div>' +
      (monthlyRent ? '<div class="p-2 bg-gray-50 rounded text-center">' +
        '<p class="text-xs text-gray-500">Monthly Rent</p>' +
        '<p class="text-lg font-bold text-gray-900">' + $(Number(monthlyRent)) + '</p>' +
      '</div>' : '') +
    '</div>';

    return _card('calendar-alt', 'Lease Timeline', 'TenantWorkspace._editLease()', body, barColor);
  }

  function _propertyInfoCard(cl) {
    var address = cl.property_address || cl.address || '';
    var unit = cl.unit_number || '';
    var landlordName = cl.landlord_name || '';
    var landlordId = cl.landlord_id || '';

    var body = '<div class="space-y-2 text-sm">' +
      '<div class="flex justify-between"><span class="text-gray-500">Address</span><span class="font-medium text-gray-900">' + E(address || '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Unit</span><span class="font-medium text-gray-900">' + E(unit || '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Landlord</span>' +
        (landlordId ?
          '<a class="font-medium text-blue-600 hover:underline cursor-pointer" onclick="Workspace.openClient(\'' + E(landlordId) + '\')">' + E(landlordName || 'View Landlord') + '</a>' :
          '<span class="font-medium text-gray-900">' + E(landlordName || '-') + '</span>') +
      '</div>' +
    '</div>';

    return _card('building', 'Property Info', '', body);
  }

  function _communicationCardInline(cl, clientId) {
    var body = '<div id="tw_tenantComms">' + UI.loading() + '</div>';
    setTimeout(function () {
      var el = document.getElementById('tw_tenantComms');
      if (el) _renderCommunicationTab(el, cl, clientId);
    }, 0);
    return _card('comments', 'Communication', '', body);
  }

  function _activityCardInline(cl, clientId) {
    var body = '<div id="tw_tenantActivity">' + UI.loading() + '</div>';
    setTimeout(function () {
      var el = document.getElementById('tw_tenantActivity');
      if (el) _renderActivityTab(el, cl, clientId);
    }, 0);
    return _card('stream', 'Activity Timeline', '', body);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SHARED CARDS (used across multiple phases)
  // ═══════════════════════════════════════════════════════════════════════

  // ─── Renewal Status (Current Tenants) ─────────────────────────────────
  function _renewalStatusCard(cl) {
    var status = cl.renewal_status || 'pending';
    var leaseEnd = cl.lease_end_date || cl.lease_end;
    var daysLeft = leaseEnd ? Math.floor((new Date(leaseEnd).getTime() - Date.now()) / 86400000) : 0;

    var statusColors = {
      pending: { bg: 'bg-yellow-50', border: '#F59E0B', text: 'text-yellow-700', label: 'Pending Decision' },
      renewing: { bg: 'bg-green-50', border: '#059669', text: 'text-green-700', label: 'Renewing' },
      not_renewing: { bg: 'bg-red-50', border: '#DC2626', text: 'text-red-700', label: 'Not Renewing' },
      month_to_month: { bg: 'bg-blue-50', border: '#3B82F6', text: 'text-blue-700', label: 'Month-to-Month' },
    };
    var info = statusColors[status] || statusColors.pending;

    var body = '<div class="flex items-center justify-between mb-3">' +
      '<div class="p-3 rounded-lg ' + info.bg + ' flex-1 mr-3">' +
        '<p class="text-xs text-gray-500">Renewal Status</p>' +
        '<p class="text-lg font-bold ' + info.text + '">' + E(info.label) + '</p>' +
      '</div>' +
      '<div class="text-center">' +
        '<p class="text-xs text-gray-500">Days Left</p>' +
        '<p class="text-2xl font-bold ' + (daysLeft <= 30 ? 'text-red-600' : daysLeft <= 90 ? 'text-yellow-600' : 'text-green-600') + '">' + daysLeft + '</p>' +
      '</div>' +
    '</div>';

    // Status buttons
    body += '<div class="flex gap-2">';
    ['renewing', 'not_renewing', 'month_to_month', 'pending'].forEach(function (s) {
      var sInfo = statusColors[s];
      var active = status === s;
      body += '<button class="flex-1 py-2 text-[10px] font-bold rounded-lg border transition-all ' +
        (active ? sInfo.bg + ' ' + sInfo.text + ' border-current' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400') +
        '" onclick="TenantWorkspace._setRenewalStatus(\'' + s + '\')">' + E(sInfo.label) + '</button>';
    });
    body += '</div>';

    // If not renewing, show outreach auto-computation
    if (status === 'not_renewing') {
      body += '<div class="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">' +
        '<i class="fas fa-exclamation-triangle mr-1"></i> Not renewing — outreach dates will auto-populate based on lease end. ' +
        'This tenant enters the Viewed/Did Not Rent flow for re-engagement.' +
      '</div>';
    }

    return _card('redo', 'Renewal Status', '', body, info.border);
  }

  // ─── Buyer Conversion Assessment ──────────────────────────────────────
  function _buyerConversionCard(cl) {
    var bp = cl.buyer_potential || 0;
    var bpColor = bp >= 70 ? '#059669' : bp >= 40 ? '#F59E0B' : '#9CA3AF';
    var bpLabel = bp >= 70 ? 'High Potential' : bp >= 40 ? 'Moderate' : 'Low';

    var body = '<div class="flex items-center gap-4 mb-3">' +
      '<div class="relative w-16 h-16 flex-shrink-0">' +
        '<svg class="w-16 h-16 -rotate-90" viewBox="0 0 64 64">' +
          '<circle cx="32" cy="32" r="26" fill="none" stroke="#E5E7EB" stroke-width="5"/>' +
          '<circle cx="32" cy="32" r="26" fill="none" stroke="' + bpColor + '" stroke-width="5" stroke-dasharray="' + (2 * Math.PI * 26) + '" stroke-dashoffset="' + (2 * Math.PI * 26 * (1 - bp / 100)) + '" stroke-linecap="round"/>' +
        '</svg>' +
        '<div class="absolute inset-0 flex items-center justify-center">' +
          '<span class="text-lg font-bold" style="color:' + bpColor + '">' + bp + '</span>' +
        '</div>' +
      '</div>' +
      '<div>' +
        '<p class="text-sm font-bold" style="color:' + bpColor + '">' + E(bpLabel) + '</p>' +
        '<p class="text-xs text-gray-500">Based on income, credit, engagement</p>' +
      '</div>' +
      '<button class="btn btn-xs btn-outline ml-auto" onclick="TenantWorkspace._editBuyerPotential()">Adjust</button>' +
    '</div>';

    // Quick qualification check
    var income = Number(cl.annual_income) || 0;
    if (income > 0) {
      var monthlyIncome = income / 12;
      var maxMonthly = monthlyIncome * 0.28;
      var rate = 0.065 / 12;
      var maxLoan = maxMonthly > 0 ? Math.round(maxMonthly * ((Math.pow(1 + rate, 360) - 1) / (rate * Math.pow(1 + rate, 360)))) : 0;
      var downPayment = Number(cl.down_payment || cl.available_funds) || 0;
      var maxPrice = maxLoan + downPayment;

      body += '<div class="grid grid-cols-3 gap-2 text-center">' +
        '<div class="p-2 bg-gray-50 rounded"><p class="text-[10px] text-gray-500">Income</p><p class="text-sm font-bold">' + $(income) + '/yr</p></div>' +
        '<div class="p-2 bg-gray-50 rounded"><p class="text-[10px] text-gray-500">Est. Max Price</p><p class="text-sm font-bold">' + $(maxPrice) + '</p></div>' +
        '<div class="p-2 bg-gray-50 rounded"><p class="text-[10px] text-gray-500">Savings</p><p class="text-sm font-bold">' + $(downPayment) + '</p></div>' +
      '</div>';
    }

    // Promote to buyer button
    if (bp >= 40) {
      body += '<button class="btn btn-sm btn-gold w-full mt-3" onclick="TenantWorkspace._promoteToBuyer()">' +
        '<i class="fas fa-arrow-up mr-1"></i> Promote to Active Buyer</button>';
    }

    return _card('exchange-alt', 'Buyer Conversion Potential', '', body, '#8B5CF6');
  }

  // ─── Outreach Schedule (6mo/90d/60d/30d) ──────────────────────────────
  function _outreachScheduleCard(cl) {
    var dates = [
      { key: 'outreach_6mo_date', label: '6 Month', desc: 'Sales listings if buyer potential' },
      { key: 'outreach_90d_date', label: '90 Day', desc: 'Rental + sales listings' },
      { key: 'outreach_60d_date', label: '60 Day', desc: 'Rental listings' },
      { key: 'outreach_30d_date', label: '30 Day', desc: 'Urgent rental listings' },
    ];

    var body = '<div class="space-y-2">';
    dates.forEach(function (d) {
      var date = cl[d.key];
      var isPast = date && new Date(date) < new Date();
      var isSoon = date && !isPast && (new Date(date).getTime() - Date.now()) < 14 * 86400000;

      body += '<div class="flex items-center gap-3 py-2 px-3 rounded ' +
        (isPast ? 'bg-green-50' : isSoon ? 'bg-yellow-50' : 'bg-gray-50') + '">' +
        '<div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ' +
          (isPast ? 'bg-green-100' : isSoon ? 'bg-yellow-100' : 'bg-gray-200') + '">' +
          '<i class="fas ' + (isPast ? 'fa-check text-green-500' : isSoon ? 'fa-clock text-yellow-500' : 'fa-calendar text-gray-400') + ' text-xs"></i>' +
        '</div>' +
        '<div class="flex-1">' +
          '<p class="text-sm font-medium ' + (isPast ? 'text-green-700 line-through' : '') + '">' + E(d.label) + '</p>' +
          '<p class="text-[10px] text-gray-500">' + E(d.desc) + '</p>' +
        '</div>' +
        '<span class="text-xs font-bold ' + (isPast ? 'text-green-600' : isSoon ? 'text-yellow-600' : 'text-gray-500') + '">' +
          (date ? D(date) : 'Not set') +
        '</span>' +
      '</div>';
    });
    body += '</div>';

    // Auto-populate button
    if (!cl.outreach_30d_date && !cl.outreach_60d_date) {
      body += '<button class="btn btn-xs btn-outline w-full mt-2" onclick="TenantWorkspace._autoPopulateOutreach()">' +
        '<i class="fas fa-magic mr-1"></i> Auto-Populate Dates</button>';
    }

    return _card('calendar-check', 'Outreach Schedule', 'TenantWorkspace._editOutreach()', body, '#F59E0B');
  }

  // ─── Docs Readiness (renters) ─────────────────────────────────────────
  function _docsReadinessCard(cl) {
    var docs = {};
    try { docs = cl.docs_readiness ? (typeof cl.docs_readiness === 'string' ? JSON.parse(cl.docs_readiness) : cl.docs_readiness) : {}; } catch (e) { /* */ }

    var items = [
      { key: 'pay_stubs', label: 'Pay Stubs (2 months)' },
      { key: 'tax_returns', label: 'Tax Returns (2 years)' },
      { key: 'bank_statements', label: 'Bank Statements (3 months)' },
      { key: 'employment_letter', label: 'Employment Verification Letter' },
      { key: 'reference_letters', label: 'Reference Letters (2-3)' },
      { key: 'photo_id', label: 'Government ID' },
    ];

    var ready = items.filter(function (i) { return docs[i.key] === true; }).length;

    var body = '<div class="flex items-center gap-3 mb-3">' +
      '<div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">' +
        '<div class="h-full bg-green-500 rounded-full" style="width:' + Math.round((ready / items.length) * 100) + '%"></div>' +
      '</div>' +
      '<span class="text-xs font-bold text-gray-600">' + ready + '/' + items.length + '</span>' +
    '</div>' +
    '<div class="grid grid-cols-1 sm:grid-cols-2 gap-1">';

    items.forEach(function (item) {
      var has = docs[item.key] === true;
      body += '<div class="flex items-center gap-2 py-1 px-2 rounded text-sm ' + (has ? 'bg-green-50' : 'bg-red-50') + ' cursor-pointer" ' +
        'onclick="TenantWorkspace._toggleDocReady(\'' + item.key + '\',' + !has + ')">' +
        '<i class="fas ' + (has ? 'fa-check-circle text-green-500' : 'fa-times-circle text-red-400') + ' text-xs"></i>' +
        '<span class="' + (has ? 'text-green-700' : 'text-red-700') + ' text-xs">' + E(item.label) + '</span>' +
      '</div>';
    });

    body += '</div>';

    if (ready < items.length) {
      body += '<div class="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">' +
        '<i class="fas fa-folder-open mr-1"></i> ' + (items.length - ready) + ' document(s) still needed for co-op/condo applications' +
      '</div>';
    }

    return _card('folder-open', 'Application Docs Readiness', '', body, '#3B82F6');
  }

  // ─── Dual Drip Status ─────────────────────────────────────────────────
  function _dripStatusCard(cl) {
    var body = '<div class="grid grid-cols-2 gap-3">';

    var drips = [
      { key: 'rental_drip_on', statusKey: 'rental_drip_status', label: 'Rental Drip', color: '#3B82F6' },
      { key: 'sales_drip_on', statusKey: 'sales_drip_status', label: 'Sales Drip', color: '#059669' },
    ];

    drips.forEach(function (d) {
      var on = cl[d.key] || false;
      var tier = d.statusKey ? (cl[d.statusKey] || 'paused') : (on ? 'active' : 'paused');
      body += '<div class="p-3 rounded-lg border text-center ' + (on ? 'bg-white border-current' : 'bg-gray-50 border-gray-200') + '" style="' + (on ? 'border-color:' + d.color : '') + '">' +
        '<p class="text-xs text-gray-500 mb-1">' + E(d.label) + '</p>' +
        '<p class="text-sm font-bold ' + (on ? '' : 'text-gray-400') + '" style="' + (on ? 'color:' + d.color : '') + '">' + (on ? 'ON' : 'OFF') + '</p>' +
        (d.statusKey ? '<p class="text-[10px] text-gray-400 mt-0.5">' + E(tier) + '</p>' : '') +
        '<button class="text-[10px] mt-1 ' + (on ? 'text-red-500' : 'text-blue-500') + ' hover:underline" ' +
          'onclick="TenantWorkspace._toggleDrip(\'' + d.key + '\',' + !on + ')">' + (on ? 'Turn Off' : 'Turn On') + '</button>' +
      '</div>';
    });

    body += '</div>';
    return _card('robot', 'Dual Drip Status', '', body);
  }

  // ─── Showing History (async fetch, used by both viewed-not-rent and prospect) ──
  function _fetchShowingHistory(containerId, showFullTable) {
    var cId = _clientId();
    if (!cId) return;

    MallanAPI._fetch('/api/crm/showing-history?lead_id=' + cId).then(function (data) {
      var el = document.getElementById(containerId);
      if (!el) return;

      var showings = data.showings || [];
      if (showings.length === 0) {
        el.innerHTML = '<p class="text-xs text-gray-400 text-center py-3">No showing records yet</p>';
        return;
      }

      if (showFullTable) {
        // Full table mode for viewed/did-not-rent
        var html = '<div class="overflow-x-auto">' +
          '<table class="w-full text-sm">' +
            '<thead><tr class="border-b text-xs text-gray-500 text-left">' +
              '<th class="py-2 px-2">Address</th>' +
              '<th class="py-2 px-2">Unit</th>' +
              '<th class="py-2 px-2">Date</th>' +
              '<th class="py-2 px-2">Price</th>' +
              '<th class="py-2 px-2">Reaction</th>' +
              '<th class="py-2 px-2">Why Not</th>' +
            '</tr></thead><tbody>';

        var reactionLabels = { interested: 'Interested', neutral: 'Neutral', not_interested: 'Not Interested' };
        var reactionColors = { interested: 'text-green-600', neutral: 'text-yellow-600', not_interested: 'text-red-600' };
        var whyLabels = {
          fee_objection: 'Fee', price: 'Price', location: 'Location',
          building: 'Building', timing: 'Timing', other: 'Other',
        };

        showings.forEach(function (s) {
          html += '<tr class="border-b hover:bg-gray-50">' +
            '<td class="py-2 px-2 font-medium">' + E(s.address || '') + '</td>' +
            '<td class="py-2 px-2">' + E(s.unit || '-') + '</td>' +
            '<td class="py-2 px-2">' + D(s.showing_date) + '</td>' +
            '<td class="py-2 px-2">' + (s.price_at_time ? $(Number(s.price_at_time)) : '-') + '</td>' +
            '<td class="py-2 px-2 ' + (reactionColors[s.reaction] || '') + ' font-medium">' + E(reactionLabels[s.reaction] || s.reaction || '-') + '</td>' +
            '<td class="py-2 px-2">' + (s.why_not_rented ? '<span class="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-bold">' + E(whyLabels[s.why_not_rented] || s.why_not_rented) + '</span>' : '-') + '</td>' +
          '</tr>';
        });

        html += '</tbody></table></div>';
        el.innerHTML = html;
      } else {
        // Card mode
        var html2 = '<div class="space-y-2">';
        var reactionIcons = {
          interested: '<i class="fas fa-heart text-green-500"></i>',
          neutral: '<i class="fas fa-meh text-yellow-500"></i>',
          not_interested: '<i class="fas fa-thumbs-down text-red-500"></i>',
        };
        var whyLabels2 = {
          fee_objection: 'Fee objection', price: 'Price too high', location: 'Location',
          building: 'Building issue', timing: 'Bad timing', other: 'Other',
        };

        showings.forEach(function (s) {
          html2 += '<div class="p-3 bg-gray-50 rounded-lg">' +
            '<div class="flex items-center justify-between mb-1">' +
              '<span class="text-sm font-medium text-gray-900">' + E(s.address || '') + (s.unit ? ' #' + E(s.unit) : '') + '</span>' +
              '<span class="text-xs text-gray-400">' + D(s.showing_date) + '</span>' +
            '</div>' +
            '<div class="flex items-center gap-2 text-xs">' +
              (s.price_at_time ? '<span class="text-gray-500">' + $(Number(s.price_at_time)) + '</span>' : '') +
              (s.reaction ? '<span>' + (reactionIcons[s.reaction] || '') + '</span>' : '') +
              (s.why_not_rented ? '<span class="px-1.5 py-0.5 bg-red-100 text-red-600 rounded">' + E(whyLabels2[s.why_not_rented] || s.why_not_rented) + '</span>' : '') +
              (s.rented ? '<span class="px-1.5 py-0.5 bg-green-100 text-green-600 rounded font-bold">Rented</span>' : '') +
            '</div>' +
            (s.notes ? '<p class="text-xs text-gray-500 mt-1">' + E(s.notes) + '</p>' : '') +
          '</div>';
        });
        html2 += '</div>';
        el.innerHTML = html2;
      }
    }).catch(function () {
      var el = document.getElementById(containerId);
      if (el) el.innerHTML = '<p class="text-xs text-gray-400 text-center">Unable to load</p>';
    });
  }

  // ─── Notes fetch (shared) ──────────────────────────────────────────────
  function _fetchNotes() {
    var cId = _clientId();
    if (!cId) return;

    MallanAPI._fetch('/api/crm/notes?lead_id=' + cId + '&limit=10').then(function (data) {
      var el = document.getElementById('tw_prospectNotes');
      if (!el) return;

      var notes = data.notes || [];
      if (notes.length === 0) {
        el.innerHTML = '<p class="text-xs text-gray-400 text-center py-3">No notes yet</p>' +
          '<button class="btn btn-xs btn-outline w-full mt-1" onclick="TenantWorkspace._addNote()"><i class="fas fa-plus mr-1"></i> Add Note</button>';
        return;
      }

      var html = '<div class="space-y-2">';
      notes.forEach(function (n) {
        html += '<div class="p-2 bg-gray-50 rounded text-xs">' +
          '<p class="text-gray-900">' + E(n.content || n.body || '') + '</p>' +
          '<p class="text-gray-400 mt-1">' + D(n.created_at) + '</p>' +
        '</div>';
      });
      html += '</div>';
      el.innerHTML = html;
    }).catch(function () {
      var el = document.getElementById('tw_prospectNotes');
      if (el) el.innerHTML = '<p class="text-xs text-gray-400 text-center">Unable to load notes</p>';
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════════════

  function _activateRenter() {
    var cId = _clientId();
    if (!cId) return;
    if (!confirm('Activate this prospect as an Active Renter?')) return;

    MallanAPI.clients.update(cId, { pipeline_stage: 'active_renter' }).then(function () {
      CRM.toast('Activated as Active Renter', 'success');
      Workspace.openClient(cId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _signLease() {
    var cId = _clientId();
    if (!cId) return;

    CRM.openModal('Sign Lease', '<div class="space-y-3">' +
      '<p class="text-sm text-gray-600">Record that this renter has signed a lease.</p>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Lease Start</label>' +
          '<input id="sl_start" type="date" class="w-full border rounded px-3 py-2 text-sm mt-1"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Lease End</label>' +
          '<input id="sl_end" type="date" class="w-full border rounded px-3 py-2 text-sm mt-1"></div>' +
      '</div>' +
      '<div><label class="text-xs font-bold text-gray-500">Monthly Rent</label>' +
        '<input id="sl_rent" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0"></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Property Address</label>' +
        '<input id="sl_address" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="123 Main St"></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Unit</label>' +
        '<input id="sl_unit" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="4A"></div>' +
      '<button class="btn btn-gold w-full" onclick="TenantWorkspace._submitSignLease()">Confirm Lease Signed</button>' +
    '</div>');
  }

  function _submitSignLease() {
    var cId = _clientId();
    if (!cId) return;

    var startDate = document.getElementById('sl_start').value;
    var endDate = document.getElementById('sl_end').value;
    if (!startDate || !endDate) { CRM.toast('Lease start and end dates required', 'error'); return; }

    var updates = {
      pipeline_stage: 'current_tenant',
      lease_start_date: startDate,
      lease_end_date: endDate,
      monthly_rent: document.getElementById('sl_rent').value || null,
      property_address: document.getElementById('sl_address').value.trim() || null,
      unit_number: document.getElementById('sl_unit').value.trim() || null,
      renewal_status: 'pending',
    };

    MallanAPI.clients.update(cId, updates).then(function () {
      CRM.closeModal();
      CRM.toast('Lease signed — moved to Current Tenant', 'success');
      Workspace.openClient(cId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _didNotRent() {
    var cId = _clientId();
    if (!cId) return;
    if (!confirm('Move this renter to Viewed / Did Not Rent pipeline?')) return;

    MallanAPI.clients.update(cId, { pipeline_stage: 'viewed_not_rent' }).then(function () {
      CRM.toast('Moved to Viewed / Did Not Rent', 'success');
      Workspace.openClient(cId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _reengageAsRenter() {
    var cId = _clientId();
    if (!cId) return;
    if (!confirm('Re-engage this client as an Active Renter?')) return;

    MallanAPI.clients.update(cId, { pipeline_stage: 'active_renter' }).then(function () {
      CRM.toast('Re-engaged as Active Renter', 'success');
      Workspace.openClient(cId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _setNotRenewing() {
    _setRenewalStatus('not_renewing');
  }

  function _setRenewalStatus(status) {
    var cId = _clientId();
    var cl = _currentClient();
    if (!cId) return;

    var updates = { renewal_status: status };

    // If not renewing, auto-compute outreach dates from lease end
    if (status === 'not_renewing' && (cl.lease_end_date || cl.lease_end)) {
      var end = new Date(cl.lease_end_date || cl.lease_end);
      updates.non_renewal_date = new Date().toISOString();
      updates.reengage_anchor_date = end.toISOString();
      // Set outreach dates: 30d, 60d, 90d before lease end; 6mo after
      var d30 = new Date(end.getTime() - 30 * 86400000);
      var d60 = new Date(end.getTime() - 60 * 86400000);
      var d90 = new Date(end.getTime() - 90 * 86400000);
      var d6mo = new Date(end.getTime() + 180 * 86400000);
      updates.outreach_30d_date = d30.toISOString();
      updates.outreach_60d_date = d60.toISOString();
      updates.outreach_90d_date = d90.toISOString();
      updates.outreach_6mo_date = d6mo.toISOString();
    }

    MallanAPI.clients.update(cId, updates).then(function () {
      CRM.toast('Renewal status updated', 'success');
      Workspace.openClient(cId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _autoPopulateOutreach() {
    var cId = _clientId();
    var cl = _currentClient();
    if (!cId) return;

    // Anchor from lease end date or today
    var anchor = (cl.lease_end_date || cl.lease_end) ? new Date(cl.lease_end_date || cl.lease_end) : new Date();
    var d30 = new Date(anchor.getTime() - 30 * 86400000);
    var d60 = new Date(anchor.getTime() - 60 * 86400000);
    var d90 = new Date(anchor.getTime() - 90 * 86400000);
    var d6mo = new Date(anchor.getTime() + 180 * 86400000);

    MallanAPI.clients.update(cId, {
      outreach_30d_date: d30.toISOString(),
      outreach_60d_date: d60.toISOString(),
      outreach_90d_date: d90.toISOString(),
      outreach_6mo_date: d6mo.toISOString(),
    }).then(function () {
      CRM.toast('Outreach dates populated', 'success');
      Workspace.openClient(cId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _editOutreach() {
    CRM.toast('Edit outreach dates — use the timeline controls', 'info');
  }

  function _promoteToBuyer() {
    var cId = _clientId();
    if (!cId) return;

    if (!confirm('Promote this renter to an Active Buyer in the Sales CRM?')) return;

    MallanAPI._fetch('/api/crm/sales/promote', {
      method: 'POST',
      body: JSON.stringify({ lead_id: cId, promotion_type: 'renter_to_buyer' }),
    }).then(function () {
      CRM.toast('Promoted to Active Buyer', 'success');
      Workspace.openClient(cId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _editBuyerPotential() {
    var cl = _currentClient();
    CRM.openModal('Set Buyer Potential', '<div class="space-y-3">' +
      '<div><label class="text-xs font-bold text-gray-500">Buyer Potential (0-100)</label>' +
        '<input id="bpScore" type="number" min="0" max="100" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + (cl.buyer_potential || 0) + '"></div>' +
      '<p class="text-xs text-gray-400">0 = no potential, 40 = moderate, 70+ = high (show promote button)</p>' +
      '<button class="btn btn-gold w-full" onclick="TenantWorkspace._saveBuyerPotential()">Save</button>' +
    '</div>');
  }

  function _saveBuyerPotential() {
    var cId = _clientId();
    if (!cId) return;
    var val = parseInt(document.getElementById('bpScore').value) || 0;
    MallanAPI.clients.update(cId, { buyer_potential: Math.max(0, Math.min(100, val)) }).then(function () {
      CRM.closeModal();
      CRM.toast('Buyer potential updated', 'success');
      Workspace.openClient(cId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _toggleDocReady(key, value) {
    var cId = _clientId();
    var cl = _currentClient();
    if (!cId) return;

    var docs = {};
    try { docs = cl.docs_readiness ? (typeof cl.docs_readiness === 'string' ? JSON.parse(cl.docs_readiness) : cl.docs_readiness) : {}; } catch (e) { /* */ }
    docs[key] = value;

    MallanAPI.clients.update(cId, { docs_readiness: docs }).then(function () {
      CRM.toast('Updated', 'success');
      Workspace.openClient(cId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _toggleDrip(key, value) {
    var cId = _clientId();
    if (!cId) return;
    var data = {};
    data[key] = value;
    MallanAPI.clients.update(cId, data).then(function () {
      CRM.toast('Drip ' + (value ? 'enabled' : 'disabled'), 'success');
      Workspace.openClient(cId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _addShowing() {
    CRM.openModal('Add Showing Record', '<div class="space-y-3">' +
      '<div><label class="text-xs font-bold text-gray-500">Address</label>' +
        '<input id="sh_address" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="123 Main St"></div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Unit</label>' +
          '<input id="sh_unit" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="4A"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Date</label>' +
          '<input id="sh_date" type="date" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + new Date().toISOString().split('T')[0] + '"></div>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Price at Time</label>' +
          '<input id="sh_price" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="$0"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Reaction</label>' +
          '<select id="sh_reaction" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
            '<option value="">Select...</option>' +
            '<option value="interested">Interested</option>' +
            '<option value="neutral">Neutral</option>' +
            '<option value="not_interested">Not Interested</option>' +
          '</select></div>' +
      '</div>' +
      '<div><label class="text-xs font-bold text-gray-500">Why Didn\'t Rent</label>' +
        '<select id="sh_why" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
          '<option value="">N/A or didn\'t decide yet</option>' +
          '<option value="fee_objection">Fee Objection</option>' +
          '<option value="price">Price Too High</option>' +
          '<option value="location">Wrong Location</option>' +
          '<option value="building">Building Issue</option>' +
          '<option value="timing">Bad Timing</option>' +
          '<option value="other">Other</option>' +
        '</select></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Notes</label>' +
        '<textarea id="sh_notes" class="w-full border rounded px-3 py-2 text-sm mt-1" rows="2" placeholder="What caught their attention, comments..."></textarea></div>' +
      '<button class="btn btn-gold w-full" onclick="TenantWorkspace._submitShowing()">Save Showing</button>' +
    '</div>');
  }

  function _submitShowing() {
    var cId = _clientId();
    var address = document.getElementById('sh_address').value.trim();
    var date = document.getElementById('sh_date').value;
    if (!address || !date) { CRM.toast('Address and date required', 'error'); return; }

    MallanAPI._fetch('/api/crm/showing-history', {
      method: 'POST',
      body: JSON.stringify({
        lead_id: cId,
        address: address,
        unit: document.getElementById('sh_unit').value.trim(),
        showing_date: date,
        price_at_time: document.getElementById('sh_price').value || null,
        reaction: document.getElementById('sh_reaction').value || null,
        why_not_rented: document.getElementById('sh_why').value || null,
        notes: document.getElementById('sh_notes').value.trim() || null,
      }),
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Showing record added', 'success');
      Workspace.openClient(cId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _addApplication() {
    CRM.openModal('Add Application', '<div class="space-y-3">' +
      '<div><label class="text-xs font-bold text-gray-500">Property Address</label>' +
        '<input id="app_address" class="w-full border rounded px-3 py-2 text-sm mt-1" placeholder="123 Main St, Apt 4A"></div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Date Submitted</label>' +
          '<input id="app_date" type="date" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + new Date().toISOString().split('T')[0] + '"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Status</label>' +
          '<select id="app_status" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
            '<option value="submitted">Submitted</option>' +
            '<option value="pending">Pending Review</option>' +
            '<option value="approved">Approved</option>' +
            '<option value="denied">Denied</option>' +
          '</select></div>' +
      '</div>' +
      '<div><label class="text-xs font-bold text-gray-500">Landlord Response / Notes</label>' +
        '<textarea id="app_notes" class="w-full border rounded px-3 py-2 text-sm mt-1" rows="2" placeholder="Any response or notes..."></textarea></div>' +
      '<button class="btn btn-gold w-full" onclick="TenantWorkspace._submitApplication()">Save Application</button>' +
    '</div>');
  }

  function _submitApplication() {
    var cId = _clientId();
    var address = document.getElementById('app_address').value.trim();
    if (!address) { CRM.toast('Address is required', 'error'); return; }

    MallanAPI._fetch('/api/crm/rentals/applications', {
      method: 'POST',
      body: JSON.stringify({
        address: address,
        submitted_date: document.getElementById('app_date').value,
        status: document.getElementById('app_status').value,
        landlord_response: document.getElementById('app_notes').value.trim() || null,
      }),
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Application recorded', 'success');
      Workspace.openClient(cId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _addNote() {
    CRM.openModal('Add Note', '<div class="space-y-3">' +
      '<div><label class="text-xs font-bold text-gray-500">Note</label>' +
        '<textarea id="tw_noteContent" class="w-full border rounded px-3 py-2 text-sm mt-1" rows="4" placeholder="Enter note..."></textarea></div>' +
      '<button class="btn btn-gold w-full" onclick="TenantWorkspace._submitNote()">Save Note</button>' +
    '</div>');
  }

  function _submitNote() {
    var cId = _clientId();
    var content = document.getElementById('tw_noteContent').value.trim();
    if (!content) { CRM.toast('Note content is required', 'error'); return; }

    MallanAPI._fetch('/api/crm/notes', {
      method: 'POST',
      body: JSON.stringify({ lead_id: cId, content: content }),
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Note added', 'success');
      Workspace.openClient(cId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _emailClient() {
    var cl = _currentClient();
    var email = cl.email || '';
    if (email) {
      window.open('mailto:' + email, '_blank');
    } else {
      CRM.toast('No email address on file', 'error');
    }
  }

  function _callClient() {
    var cl = _currentClient();
    var phone = cl.phone || '';
    if (phone) {
      window.open('tel:' + phone, '_blank');
    } else {
      CRM.toast('No phone number on file', 'error');
    }
  }

  function _openSendListing() {
    CRM.toast('Use the Send Listing tool in the prospect workspace', 'info');
  }

  function _editPreferences() {
    var cl = _currentClient();
    var cId = _clientId();
    var prefs = _parseJson(cl.preferences || cl.search_preferences);

    CRM.openModal('Edit Renter Preferences', '<div class="space-y-3">' +
      '<div><label class="text-xs font-bold text-gray-500">Preferred Neighborhoods</label>' +
        '<input id="pref_areas" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.preferred_areas || (Array.isArray(prefs.areas) ? prefs.areas.join(', ') : (prefs.areas || ''))) + '" placeholder="UES, UWS, Midtown..."></div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Budget Min (monthly)</label>' +
          '<input id="pref_budgetMin" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.budget_min || prefs.budget_min || '') + '" placeholder="$0"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Budget Max (monthly)</label>' +
          '<input id="pref_budgetMax" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.budget_max || prefs.budget_max || '') + '" placeholder="$5000"></div>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Min Bedrooms</label>' +
          '<input id="pref_beds" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.beds_min || prefs.beds || '') + '" placeholder="1"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Min Bathrooms</label>' +
          '<input id="pref_baths" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.baths_min || prefs.baths || '') + '" placeholder="1"></div>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">No-Fee Only?</label>' +
          '<select id="pref_noFee" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
            '<option value="false"' + (!(cl.no_fee_preference || prefs.no_fee) ? ' selected' : '') + '>Open to Fee</option>' +
            '<option value="true"' + ((cl.no_fee_preference || prefs.no_fee) ? ' selected' : '') + '>No-Fee Only</option>' +
          '</select></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Pets</label>' +
          '<input id="pref_pets" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.has_pets || prefs.pets || '') + '" placeholder="Dog, Cat, None..."></div>' +
      '</div>' +
      '<div><label class="text-xs font-bold text-gray-500">Building Type Preference</label>' +
        '<input id="pref_buildingType" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.building_type_pref || prefs.building_type || '') + '" placeholder="Doorman, Elevator, Walk-up..."></div>' +
      '<button class="btn btn-gold w-full" onclick="TenantWorkspace._savePreferences()">Save Preferences</button>' +
    '</div>');
  }

  function _savePreferences() {
    var cId = _clientId();
    if (!cId) return;

    MallanAPI.clients.update(cId, {
      preferred_areas: document.getElementById('pref_areas').value.trim(),
      budget_min: document.getElementById('pref_budgetMin').value || null,
      budget_max: document.getElementById('pref_budgetMax').value || null,
      beds_min: document.getElementById('pref_beds').value || null,
      baths_min: document.getElementById('pref_baths').value || null,
      no_fee_preference: document.getElementById('pref_noFee').value === 'true',
      has_pets: document.getElementById('pref_pets').value.trim() || null,
      building_type_pref: document.getElementById('pref_buildingType').value.trim() || null,
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Preferences updated', 'success');
      Workspace.openClient(cId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _editTimeline() {
    var cl = _currentClient();
    CRM.openModal('Edit Move-in Timeline', '<div class="space-y-3">' +
      '<div><label class="text-xs font-bold text-gray-500">Target Move-In Date</label>' +
        '<input id="tl_date" type="date" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + (cl.target_move_date || cl.move_date ? new Date(cl.target_move_date || cl.move_date).toISOString().split('T')[0] : '') + '"></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Current Situation</label>' +
        '<select id="tl_situation" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
          '<option value="">Select...</option>' +
          '<option value="Breaking lease"' + (cl.current_situation === 'Breaking lease' ? ' selected' : '') + '>Breaking Lease</option>' +
          '<option value="Month-to-month"' + (cl.current_situation === 'Month-to-month' ? ' selected' : '') + '>Month-to-Month</option>' +
          '<option value="Lease ending"' + (cl.current_situation === 'Lease ending' ? ' selected' : '') + '>Lease Ending</option>' +
          '<option value="New to NYC"' + (cl.current_situation === 'New to NYC' ? ' selected' : '') + '>New to NYC</option>' +
          '<option value="Relocating"' + (cl.current_situation === 'Relocating' ? ' selected' : '') + '>Relocating</option>' +
          '<option value="Other"' + (cl.current_situation === 'Other' ? ' selected' : '') + '>Other</option>' +
        '</select></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Urgency Level</label>' +
        '<select id="tl_urgency" class="w-full border rounded px-3 py-2 text-sm mt-1">' +
          '<option value="flexible"' + (cl.urgency_level === 'flexible' ? ' selected' : '') + '>Flexible</option>' +
          '<option value="normal"' + (cl.urgency_level === 'normal' || !cl.urgency_level ? ' selected' : '') + '>Normal</option>' +
          '<option value="high"' + (cl.urgency_level === 'high' ? ' selected' : '') + '>High</option>' +
          '<option value="urgent"' + (cl.urgency_level === 'urgent' ? ' selected' : '') + '>Urgent</option>' +
        '</select></div>' +
      '<button class="btn btn-gold w-full" onclick="TenantWorkspace._saveTimeline()">Save</button>' +
    '</div>');
  }

  function _saveTimeline() {
    var cId = _clientId();
    if (!cId) return;

    MallanAPI.clients.update(cId, {
      target_move_date: document.getElementById('tl_date').value || null,
      current_situation: document.getElementById('tl_situation').value || null,
      urgency_level: document.getElementById('tl_urgency').value || 'normal',
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Timeline updated', 'success');
      Workspace.openClient(cId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  function _editLease() {
    var cl = _currentClient();
    CRM.openModal('Edit Lease Details', '<div class="space-y-3">' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="text-xs font-bold text-gray-500">Lease Start</label>' +
          '<input id="el_start" type="date" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + (cl.lease_start_date ? new Date(cl.lease_start_date).toISOString().split('T')[0] : '') + '"></div>' +
        '<div><label class="text-xs font-bold text-gray-500">Lease End</label>' +
          '<input id="el_end" type="date" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + (cl.lease_end_date ? new Date(cl.lease_end_date).toISOString().split('T')[0] : '') + '"></div>' +
      '</div>' +
      '<div><label class="text-xs font-bold text-gray-500">Monthly Rent</label>' +
        '<input id="el_rent" type="number" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + (cl.rent_per_month || '') + '" placeholder="$0"></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Property Address</label>' +
        '<input id="el_address" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.property_address || cl.address || '') + '" placeholder="123 Main St"></div>' +
      '<div><label class="text-xs font-bold text-gray-500">Unit</label>' +
        '<input id="el_unit" class="w-full border rounded px-3 py-2 text-sm mt-1" value="' + E(cl.unit_number || '') + '" placeholder="4A"></div>' +
      '<button class="btn btn-gold w-full" onclick="TenantWorkspace._saveLease()">Save</button>' +
    '</div>');
  }

  function _saveLease() {
    var cId = _clientId();
    if (!cId) return;

    MallanAPI.clients.update(cId, {
      lease_start_date: document.getElementById('el_start').value || null,
      lease_end_date: document.getElementById('el_end').value || null,
      monthly_rent: document.getElementById('el_rent').value || null,
      property_address: document.getElementById('el_address').value.trim() || null,
      unit_number: document.getElementById('el_unit').value.trim() || null,
    }).then(function () {
      CRM.closeModal();
      CRM.toast('Lease details updated', 'success');
      Workspace.openClient(cId, 'overview');
    }).catch(function (err) {
      CRM.toast('Failed: ' + (err.message || ''), 'error');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LEGACY API (backwards compatibility)
  // ═══════════════════════════════════════════════════════════════════════

  function renderRenterSections(cl) {
    var html = '';
    var hasActiveLease = cl.lease_end_date && new Date(cl.lease_end_date) > new Date();

    if (hasActiveLease) {
      html += _renewalStatusCard(cl);
      html += _buyerConversionCard(cl);
    }

    html += _outreachScheduleCard(cl);
    html += _docsReadinessCard(cl);
    html += _dripStatusCard(cl);

    return html;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════
  return {
    // Full workspace renderers (4 lifecycle phases)
    renderProspect: renderProspect,
    renderActive: renderActive,
    renderViewedNotRent: renderViewedNotRent,
    renderCurrentTenant: renderCurrentTenant,

    // Legacy extension renderer (backwards compat)
    renderRenterSections: renderRenterSections,

    // Tab switching
    _switchActiveTab: _switchActiveTab,

    // Actions — exposed for onclick handlers
    _activateRenter: _activateRenter,
    _signLease: _signLease,
    _submitSignLease: _submitSignLease,
    _didNotRent: _didNotRent,
    _reengageAsRenter: _reengageAsRenter,
    _setNotRenewing: _setNotRenewing,
    _setRenewalStatus: _setRenewalStatus,
    _autoPopulateOutreach: _autoPopulateOutreach,
    _editOutreach: _editOutreach,
    _promoteToBuyer: _promoteToBuyer,
    _editBuyerPotential: _editBuyerPotential,
    _saveBuyerPotential: _saveBuyerPotential,
    _toggleDocReady: _toggleDocReady,
    _toggleDrip: _toggleDrip,
    _addShowing: _addShowing,
    _submitShowing: _submitShowing,
    _addApplication: _addApplication,
    _submitApplication: _submitApplication,
    _addNote: _addNote,
    _submitNote: _submitNote,
    _emailClient: _emailClient,
    _callClient: _callClient,
    _openSendListing: _openSendListing,
    _editPreferences: _editPreferences,
    _savePreferences: _savePreferences,
    _editTimeline: _editTimeline,
    _saveTimeline: _saveTimeline,
    _editLease: _editLease,
    _saveLease: _saveLease,
  };
})();
