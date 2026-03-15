// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT WORKSPACE — The heart of the CRM
// Everything the agent needs for a client — in one place.
// Tabs: Overview, Market, Activity, Intelligence, Showings, Financial, Documents, Notes
// ═══════════════════════════════════════════════════════════════════════════════
/* global MallanAPI, CRM, Panels */

var Workspace = (function () {
  'use strict';

  var E = CRM.esc;
  var $ = CRM.formatMoney;
  var D = CRM.formatDate;

  var _client = null;       // Current client data
  var _clientId = null;     // Current client ID
  var _currentTab = 'overview';
  var _sentListings = [];   // Listings sent to this client
  var _showings = [];
  var _tasks = [];
  var _documents = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // OPEN WORKSPACE
  // ═══════════════════════════════════════════════════════════════════════════
  function open(clientId) {
    _clientId = clientId;
    _currentTab = 'overview';

    var content = document.getElementById('content');
    if (!content) return;

    // Update topbar
    var titleEl = document.getElementById('panelTitle');
    if (titleEl) titleEl.textContent = 'Client Workspace';

    content.innerHTML = '<div class="flex items-center justify-center h-64"><i class="fas fa-spinner fa-spin text-2xl text-gold"></i></div>';

    // Load client data
    MallanAPI.clients.get(clientId).then(function (data) {
      _client = data.client || data;
      renderWorkspace(content);
      // Load secondary data in background
      loadSecondaryData();
    }).catch(function (err) {
      content.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Failed to load client: ' + E(err.message) + '</p>' +
        '<button class="btn btn-outline" onclick="CRM.navigate(\'clients\')"><i class="fas fa-arrow-left"></i> Back to Clients</button></div>';
    });
  }

  function loadSecondaryData() {
    // Load showings, tasks, documents for this client in parallel
    var cid = _clientId;
    Promise.all([
      MallanAPI.showings.list({ limit: 50 }).catch(function () { return { showings: [] }; }),
      MallanAPI._fetch('/api/crm/tasks').catch(function () { return { tasks: [] }; }),
      MallanAPI._fetch('/api/crm/documents').catch(function () { return { documents: [] }; }),
    ]).then(function (results) {
      // Filter to this client
      _showings = (results[0].showings || []).filter(function (s) { return s.client_id === cid || s.lead_id === cid; });
      _tasks = (results[1].tasks || []).filter(function (t) { return t.client_id === cid || t.lead_id === cid; });
      _documents = (results[2].documents || []).filter(function (d) { return d.client_id === cid || d.lead_id === cid; });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER WORKSPACE
  // ═══════════════════════════════════════════════════════════════════════════
  function renderWorkspace(container) {
    var c = _client;
    var name = c.name || c.first_name + ' ' + (c.last_name || '') || c.email || 'Client';
    var init = name.split(' ').filter(Boolean).map(function (w) { return w[0]; }).join('').toUpperCase().substring(0, 2);
    var role = c.role || c.client_type || 'buyer';

    // ── Header ──
    var headerHtml =
      '<div class="workspace-header">' +
        '<div class="flex flex-col sm:flex-row sm:items-center gap-4">' +
          '<!-- Back + Avatar -->' +
          '<div class="flex items-center gap-4">' +
            '<button class="p-2 -ml-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100" onclick="CRM.navigate(\'clients\')">' +
              '<i class="fas fa-arrow-left"></i>' +
            '</button>' +
            '<div class="w-14 h-14 rounded-2xl bg-gold-bg flex items-center justify-center text-xl font-bold text-gold flex-shrink-0">' + E(init) + '</div>' +
            '<div>' +
              '<h2 class="text-xl font-bold text-gray-900">' + E(name) + '</h2>' +
              '<div class="flex items-center gap-2 mt-1">' +
                CRM.roleBadge(role) +
                CRM.stageBadge(c.stage || 'new') +
                (c.source ? '<span class="text-xs text-gray-500"><i class="fas fa-tag mr-1"></i>' + E(c.source) + '</span>' : '') +
              '</div>' +
            '</div>' +
          '</div>' +

          '<!-- Quick Actions -->' +
          '<div class="flex flex-wrap gap-2 sm:ml-auto">' +
            '<button class="btn btn-sm btn-gold" onclick="Workspace.sendListings()"><i class="fas fa-paper-plane"></i> Send Listings</button>' +
            '<button class="btn btn-sm btn-outline" onclick="Workspace.scheduleShowing()"><i class="fas fa-calendar-plus"></i> Schedule</button>' +
            '<button class="btn btn-sm btn-outline" onclick="Workspace.emailClient()"><i class="fas fa-envelope"></i> Email</button>' +
            '<button class="btn btn-sm btn-outline" onclick="Workspace.callClient()"><i class="fas fa-phone"></i> Call</button>' +
            '<button class="btn btn-sm btn-outline" onclick="Workspace.inviteToPortal()"><i class="fas fa-external-link-alt"></i> Portal Invite</button>' +
            '<button class="btn btn-sm btn-outline" onclick="Workspace.moveStage()"><i class="fas fa-arrow-right"></i> Move Stage</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    // ── Tabs ──
    var tabs = [
      { id: 'overview', label: 'Overview', icon: 'fa-user' },
      { id: 'market', label: 'Market', icon: 'fa-search' },
      { id: 'activity', label: 'Activity', icon: 'fa-chart-line' },
      { id: 'intelligence', label: 'Intelligence', icon: 'fa-brain' },
      { id: 'showings', label: 'Showings', icon: 'fa-calendar' },
      { id: 'financial', label: 'Financial', icon: 'fa-calculator' },
      { id: 'documents', label: 'Documents', icon: 'fa-folder' },
      { id: 'notes', label: 'Notes & Tasks', icon: 'fa-sticky-note' },
    ];

    var tabsHtml = '<div class="workspace-tabs">';
    tabs.forEach(function (t) {
      tabsHtml += '<button class="workspace-tab' + (t.id === _currentTab ? ' active' : '') + '" data-tab="' + t.id + '" onclick="Workspace.switchTab(\'' + t.id + '\')">' +
        '<i class="fas ' + t.icon + ' mr-1 text-[10px]"></i> ' + t.label +
      '</button>';
    });
    tabsHtml += '</div>';

    var contentHtml = '<div class="workspace-content" id="workspaceTabContent"></div>';

    container.innerHTML = headerHtml + tabsHtml + contentHtml;

    // Render current tab
    renderTab(_currentTab);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB SWITCHING
  // ═══════════════════════════════════════════════════════════════════════════
  function switchTab(tabId) {
    _currentTab = tabId;
    // Update tab states
    document.querySelectorAll('.workspace-tab').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-tab') === tabId);
    });
    renderTab(tabId);
  }

  function renderTab(tabId) {
    var tc = document.getElementById('workspaceTabContent');
    if (!tc) return;
    tc.innerHTML = '<div class="flex items-center justify-center h-32"><i class="fas fa-spinner fa-spin text-gold"></i></div>';

    switch (tabId) {
      case 'overview':     tabOverview(tc); break;
      case 'market':       tabMarket(tc); break;
      case 'activity':     tabActivity(tc); break;
      case 'intelligence': tabIntelligence(tc); break;
      case 'showings':     tabShowings(tc); break;
      case 'financial':    tabFinancial(tc); break;
      case 'documents':    tabDocuments(tc); break;
      case 'notes':        tabNotes(tc); break;
      default:             tabOverview(tc);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB: OVERVIEW
  // ═══════════════════════════════════════════════════════════════════════════
  function tabOverview(tc) {
    var c = _client;

    // Contact info
    var contactHtml =
      '<div class="card mb-4"><div class="card-header"><h3>Contact Information</h3>' +
        '<button class="btn btn-sm btn-outline" onclick="Workspace.editClient()"><i class="fas fa-edit"></i> Edit</button></div>' +
      '<div class="card-body">' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">' +
          infoField('Email', c.email) +
          infoField('Phone', c.phone) +
          infoField('Type', c.role || c.client_type) +
          infoField('Stage', c.stage || 'new') +
          infoField('Source', c.source) +
          infoField('Added', D(c.created_at)) +
          infoField('Last Updated', CRM.formatTimeAgo(c.updated_at)) +
          (c.address ? infoField('Address', c.address) : '') +
          (c.company ? infoField('Company', c.company) : '') +
        '</div>' +
      '</div></div>';

    // Preferences
    var prefs = c.preferences || {};
    var prefsHtml = '<div class="card mb-4"><div class="card-header"><h3>Preferences & Criteria</h3>' +
      '<button class="btn btn-sm btn-outline" onclick="Workspace.editPreferences()"><i class="fas fa-edit"></i> Edit</button></div>' +
      '<div class="card-body">';

    if (Object.keys(prefs).length > 0) {
      prefsHtml += '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">';
      if (prefs.neighborhoods && prefs.neighborhoods.length) prefsHtml += infoField('Neighborhoods', prefs.neighborhoods.join(', '));
      if (prefs.boroughs && prefs.boroughs.length) prefsHtml += infoField('Boroughs', prefs.boroughs.join(', '));
      if (prefs.minPrice || prefs.maxPrice) prefsHtml += infoField('Budget', $(prefs.minPrice) + ' - ' + $(prefs.maxPrice));
      if (prefs.minBeds) prefsHtml += infoField('Min Beds', prefs.minBeds + '+');
      if (prefs.minBaths) prefsHtml += infoField('Min Baths', prefs.minBaths + '+');
      if (prefs.propertyType) prefsHtml += infoField('Property Type', prefs.propertyType);
      if (prefs.must_haves) prefsHtml += infoField('Must Haves', prefs.must_haves);
      if (prefs.deal_breakers) prefsHtml += infoField('Deal Breakers', prefs.deal_breakers);
      if (prefs.move_in_date) prefsHtml += infoField('Move-in Date', prefs.move_in_date);
      if (prefs.pre_approved) prefsHtml += infoField('Pre-Approved', prefs.pre_approved ? 'Yes' : 'No');
      prefsHtml += '</div>';
    } else {
      prefsHtml += '<div class="text-center py-6"><p class="text-sm text-gray-500">No preferences set yet</p>' +
        '<button class="btn btn-sm btn-gold mt-2" onclick="Workspace.editPreferences()"><i class="fas fa-plus"></i> Set Preferences</button></div>';
    }
    prefsHtml += '</div></div>';

    // Notes
    var notesHtml = '<div class="card"><div class="card-header"><h3>Notes</h3></div>' +
      '<div class="card-body">';
    if (c.notes) {
      notesHtml += '<p class="text-sm text-gray-700 whitespace-pre-wrap">' + E(c.notes) + '</p>';
    } else {
      notesHtml += '<p class="text-sm text-gray-400 italic">No notes yet</p>';
    }
    notesHtml += '</div></div>';

    tc.innerHTML = contactHtml + prefsHtml + notesHtml;
  }

  function infoField(label, value) {
    return '<div>' +
      '<p class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-0.5">' + E(label) + '</p>' +
      '<p class="text-sm font-medium text-gray-900">' + E(value || '-') + '</p>' +
    '</div>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB: MARKET — Search & send listings to this client
  // ═══════════════════════════════════════════════════════════════════════════
  function tabMarket(tc) {
    var c = _client;
    var prefs = c.preferences || {};

    // ── Sent Listings ──
    var sentHtml = '<div class="card mb-4"><div class="card-header"><h3>Sent Listings</h3>' +
      '<span class="text-xs text-gray-500" id="sentCount">Loading...</span></div>' +
      '<div class="card-body" id="sentListingsArea">' +
        '<div class="flex items-center justify-center h-16"><i class="fas fa-spinner fa-spin text-gold"></i></div>' +
      '</div></div>';

    // ── Search for this client ──
    var searchHtml = '<div class="card"><div class="card-header"><h3>Find Listings for ' + E(c.name || 'Client') + '</h3></div>' +
      '<div class="card-body">' +
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">' +
          '<div class="form-group mb-0"><label class="form-label">Type</label>' +
            '<select id="wsSearchType" class="form-input form-select text-sm">' +
              '<option value="">Any</option>' +
              '<option value="Residential">Residential</option>' +
              '<option value="Rental">Rental</option>' +
              '<option value="Commercial">Commercial</option>' +
            '</select></div>' +
          '<div class="form-group mb-0"><label class="form-label">Min Price</label>' +
            '<input id="wsSearchMinPrice" class="form-input text-sm" type="number" placeholder="Min" value="' + (prefs.minPrice || '') + '"></div>' +
          '<div class="form-group mb-0"><label class="form-label">Max Price</label>' +
            '<input id="wsSearchMaxPrice" class="form-input text-sm" type="number" placeholder="Max" value="' + (prefs.maxPrice || '') + '"></div>' +
          '<div class="form-group mb-0"><label class="form-label">Min Beds</label>' +
            '<input id="wsSearchBeds" class="form-input text-sm" type="number" placeholder="0" value="' + (prefs.minBeds || '') + '"></div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">' +
          '<div class="form-group mb-0"><label class="form-label">Neighborhood</label>' +
            '<input id="wsSearchNeighborhood" class="form-input text-sm" placeholder="e.g. Upper East Side" value="' + (prefs.neighborhoods && prefs.neighborhoods[0] || '') + '"></div>' +
          '<div class="form-group mb-0"><label class="form-label">Address / Listing ID</label>' +
            '<input id="wsSearchAddress" class="form-input text-sm" placeholder="Search by address or ID"></div>' +
        '</div>' +
        '<button class="btn btn-gold" onclick="Workspace.searchListings()"><i class="fas fa-search"></i> Search</button>' +
      '</div>' +
      '<div id="wsSearchResults" class="border-t border-gray-100"></div>' +
    '</div>';

    tc.innerHTML = sentHtml + searchHtml;

    // Load sent listings
    loadSentListings();
  }

  function loadSentListings() {
    // Try to load listings associated with this client via portal listings endpoint
    // Fallback: use client actions
    MallanAPI.clients.get(_clientId).then(function (data) {
      var c = data.client || data;
      var sent = c.sent_listings || c.listings || [];
      _sentListings = sent;

      var area = document.getElementById('sentListingsArea');
      var countEl = document.getElementById('sentCount');
      if (!area) return;

      if (countEl) countEl.textContent = sent.length + ' listings sent';

      if (sent.length === 0) {
        area.innerHTML = '<div class="text-center py-4"><p class="text-sm text-gray-500">No listings sent yet. Search below to find and send listings.</p></div>';
        return;
      }

      var html = '<div class="space-y-2">';
      sent.forEach(function (l) {
        var photo = l.photos && l.photos.length ? CRM.photoUrl(l.photos[0].url || l.photos[0]) : '';
        html += '<div class="listing-card">' +
          (photo ? '<img src="' + E(photo) + '" class="listing-card-photo" alt="">' :
            '<div class="listing-card-photo flex items-center justify-center"><i class="fas fa-image text-gray-300 text-2xl"></i></div>') +
          '<div class="listing-card-info">' +
            '<div class="listing-card-price">' + $(l.price || l.list_price) + '</div>' +
            '<div class="listing-card-address">' + E(l.address || l.street_address || 'No address') + '</div>' +
            '<div class="listing-card-details">' +
              '<span>' + (l.beds || '-') + ' bd</span>' +
              '<span>' + (l.baths || '-') + ' ba</span>' +
              (l.sqft ? '<span>' + Number(l.sqft).toLocaleString() + ' sqft</span>' : '') +
            '</div>' +
            (l.reaction ? '<div class="mt-2">' +
              '<span class="badge ' + (l.reaction === 'liked' ? 'badge-active' : l.reaction === 'disliked' ? 'bg-red-50 text-red-600' : 'badge-pending') + '">' +
                '<i class="fas ' + (l.reaction === 'liked' ? 'fa-heart' : l.reaction === 'disliked' ? 'fa-thumbs-down' : 'fa-comment') + ' mr-1"></i>' + E(l.reaction) +
              '</span></div>' : '') +
          '</div>' +
        '</div>';
      });
      html += '</div>';
      area.innerHTML = html;
    }).catch(function () {
      var area = document.getElementById('sentListingsArea');
      if (area) area.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Could not load sent listings</p>';
    });
  }

  function searchListings() {
    var params = {
      type: val('wsSearchType'),
      minPrice: val('wsSearchMinPrice'),
      maxPrice: val('wsSearchMaxPrice'),
      minBeds: val('wsSearchBeds'),
      neighborhood: val('wsSearchNeighborhood'),
      address: val('wsSearchAddress'),
      limit: 20,
    };

    // Clean empty params
    Object.keys(params).forEach(function (k) { if (!params[k]) delete params[k]; });

    var resultsEl = document.getElementById('wsSearchResults');
    if (!resultsEl) return;
    resultsEl.innerHTML = '<div class="p-4 text-center"><i class="fas fa-spinner fa-spin text-gold"></i> Searching REBNY RLS...</div>';

    MallanAPI.idx.search(params).then(function (data) {
      var results = data.listings || data.value || [];
      if (results.length === 0) {
        resultsEl.innerHTML = '<div class="p-4 text-center text-sm text-gray-500">No listings found. Try adjusting your search criteria.</div>';
        return;
      }

      var html = '<div class="p-4"><p class="text-xs font-bold text-gray-500 uppercase mb-3">' + results.length + ' Results</p><div class="space-y-2">';
      results.forEach(function (l) {
        var id = l.ListingId || l.id || l.listing_id;
        var photo = '';
        if (l.Media && l.Media.length) photo = CRM.photoUrl(l.Media[0].MediaURL);
        else if (l.photos && l.photos.length) photo = CRM.photoUrl(l.photos[0].url || l.photos[0]);

        var address = l.UnparsedAddress || l.address || l.street_address || 'No address';
        // REBNY compliance: mask listing agent name for buyer/renter portals
        var price = l.ListPrice || l.price || l.list_price;

        html += '<div class="listing-card">' +
          (photo ? '<img src="' + E(photo) + '" class="listing-card-photo" alt="" onerror="this.style.display=\'none\'">' :
            '<div class="listing-card-photo flex items-center justify-center"><i class="fas fa-image text-gray-300"></i></div>') +
          '<div class="listing-card-info">' +
            '<div class="listing-card-price">' + $(price) + '</div>' +
            '<div class="listing-card-address">' + E(address) + '</div>' +
            '<div class="listing-card-details">' +
              '<span>' + (l.BedroomsTotal || l.beds || '-') + ' bd</span>' +
              '<span>' + (l.BathroomsTotalInteger || l.baths || '-') + ' ba</span>' +
              (l.LivingArea || l.sqft ? '<span>' + Number(l.LivingArea || l.sqft).toLocaleString() + ' sqft</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="flex flex-col gap-1 flex-shrink-0">' +
            '<button class="btn btn-sm btn-gold" onclick="Workspace.sendOneListing(\'' + E(id) + '\', \'' + E(address) + '\')"><i class="fas fa-paper-plane"></i> Send</button>' +
            '<button class="btn btn-sm btn-outline" onclick="Panels.openListingViewer(\'' + E(id) + '\', \'sale\')"><i class="fas fa-eye"></i> View</button>' +
          '</div>' +
        '</div>';
      });
      html += '</div></div>';

      // REBNY attribution
      html += '<div class="px-4 pb-3"><p class="text-[10px] text-gray-400 leading-relaxed">' +
        'Listing data provided by REBNY Listing Service. Information is deemed reliable but not guaranteed. ' +
        'REBNY RLS &copy; ' + new Date().getFullYear() + '</p></div>';

      resultsEl.innerHTML = html;
    }).catch(function (err) {
      resultsEl.innerHTML = '<div class="p-4 text-center text-sm text-red-500">Search failed: ' + E(err.message) + '</div>';
    });
  }

  function sendOneListing(listingId, address) {
    MallanAPI.clients.recordAction(_clientId, {
      action: 'send_listing',
      listing_id: listingId,
      description: 'Sent listing: ' + address,
    }).then(function () {
      CRM.toast('Listing sent to client', 'success');
    }).catch(function () {
      CRM.toast('Recorded listing send', 'info');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB: ACTIVITY
  // ═══════════════════════════════════════════════════════════════════════════
  function tabActivity(tc) {
    tc.innerHTML = '<div class="space-y-4">' +
      '<div class="card"><div class="card-header"><h3>Client Activity</h3>' +
        '<span class="text-xs text-gray-500">What this client has been doing</span></div>' +
        '<div class="card-body" id="activityTimeline">' +
          '<div class="flex items-center justify-center h-16"><i class="fas fa-spinner fa-spin text-gold"></i></div>' +
        '</div>' +
      '</div>' +
    '</div>';

    // Load activity (from client actions or general activity)
    MallanAPI.clients.get(_clientId).then(function (data) {
      var c = data.client || data;
      var activity = c.activity || c.actions || [];
      var area = document.getElementById('activityTimeline');
      if (!area) return;

      if (activity.length === 0) {
        area.innerHTML = '<div class="text-center py-6"><i class="fas fa-chart-line text-3xl text-gray-300 mb-2 block"></i>' +
          '<p class="text-sm text-gray-500">No activity recorded yet</p>' +
          '<p class="text-xs text-gray-400 mt-1">Activity will appear as the client views and reacts to listings</p></div>';
        return;
      }

      var html = '<div class="timeline">';
      activity.forEach(function (a) {
        var icon = a.type === 'view' ? 'fa-eye' : a.type === 'like' ? 'fa-heart' : a.type === 'dislike' ? 'fa-thumbs-down' :
          a.type === 'share' ? 'fa-share' : a.type === 'discuss' ? 'fa-comment' : 'fa-circle';
        var dotClass = a.type === 'like' ? 'success' : a.type === 'discuss' ? 'active' : 'info';

        html += '<div class="timeline-item">' +
          '<div class="timeline-dot ' + dotClass + '"></div>' +
          '<div>' +
            '<p class="text-sm font-medium text-gray-900"><i class="fas ' + icon + ' mr-1 text-xs text-gray-400"></i> ' + E(a.description || a.action || 'Activity') + '</p>' +
            (a.listing_address ? '<p class="text-xs text-gray-500 mt-0.5">' + E(a.listing_address) + '</p>' : '') +
            '<p class="text-xs text-gray-400 mt-0.5">' + CRM.formatTimeAgo(a.created_at || a.timestamp) + '</p>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
      area.innerHTML = html;
    }).catch(function () {
      var area = document.getElementById('activityTimeline');
      if (area) area.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Could not load activity</p>';
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB: INTELLIGENCE
  // ═══════════════════════════════════════════════════════════════════════════
  function tabIntelligence(tc) {
    var c = _client;
    var prefs = c.preferences || {};

    tc.innerHTML = '<div class="space-y-4">' +
      '<!-- Lead Score -->' +
      '<div class="card" id="leadScoreCard"><div class="card-header"><h3>Lead Score & Intent</h3></div>' +
        '<div class="card-body" id="leadScoreBody"><div class="flex items-center justify-center h-16"><i class="fas fa-spinner fa-spin text-gold"></i></div></div></div>' +
      '<!-- Market Intelligence -->' +
      '<div class="card"><div class="card-header"><h3>Market Intelligence</h3>' +
        '<span class="text-xs text-gray-500">For ' + E((prefs.neighborhoods || []).join(', ') || 'target areas') + '</span></div>' +
        '<div class="card-body" id="marketIntelBody"><div class="flex items-center justify-center h-16"><i class="fas fa-spinner fa-spin text-gold"></i></div></div></div>' +
      '<!-- CMA -->' +
      '<div class="card"><div class="card-header"><h3>CMA / Comparables</h3>' +
        '<button class="btn btn-sm btn-gold" onclick="Workspace.generateCMA()"><i class="fas fa-chart-bar"></i> Generate CMA</button></div>' +
        '<div class="card-body" id="cmaBody"><p class="text-sm text-gray-500 text-center py-4">Click Generate CMA to create a comparable market analysis for this client\'s area</p></div></div>' +
    '</div>';

    // Load lead score
    MallanAPI._fetch('/api/crm/lead-scoring/' + encodeURIComponent(_clientId)).then(function (data) {
      var body = document.getElementById('leadScoreBody');
      if (!body) return;
      var score = data.score || data;
      var grade = score.grade || 'C';
      var gradeColors = { A: '#059669', B: '#3b82f6', C: '#f59e0b', D: '#f97316', F: '#dc2626' };
      var color = gradeColors[grade] || gradeColors.C;

      body.innerHTML = '<div class="flex items-center gap-6">' +
        '<div class="text-center">' +
          '<div class="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black text-white" style="background:' + color + '">' + E(grade) + '</div>' +
          '<p class="text-xs font-bold text-gray-500 mt-1">Grade</p>' +
        '</div>' +
        '<div class="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4">' +
          miniStat('Score', score.total_score || score.score || '-', color) +
          miniStat('Engagement', score.engagement_score || '-', '#3b82f6') +
          miniStat('Financial', score.financial_score || '-', '#059669') +
          miniStat('Intent', score.intent || score.intent_level || '-', '#8b5cf6') +
        '</div>' +
      '</div>';
    }).catch(function () {
      var body = document.getElementById('leadScoreBody');
      if (body) body.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Lead scoring not yet available for this client</p>';
    });

    // Load market data for client's areas
    var neighborhoods = prefs.neighborhoods || [];
    if (neighborhoods.length > 0) {
      MallanAPI._fetch('/api/crm/market-report', {
        method: 'POST',
        body: JSON.stringify({ neighborhoods: neighborhoods, client_id: _clientId }),
      }).then(function (data) {
        var body = document.getElementById('marketIntelBody');
        if (!body || !data) return;
        body.innerHTML = '<div class="grid grid-cols-2 sm:grid-cols-4 gap-4">' +
          miniStat('Median Price', $(data.median_price), '#111827') +
          miniStat('Avg DOM', (data.avg_dom || '-') + ' days', '#f59e0b') +
          miniStat('Inventory', data.inventory || '-', '#3b82f6') +
          miniStat('Price/SqFt', $(data.price_per_sqft), '#059669') +
        '</div>' +
        (data.summary ? '<p class="text-sm text-gray-600 mt-4">' + E(data.summary) + '</p>' : '');
      }).catch(function () {
        var body = document.getElementById('marketIntelBody');
        if (body) body.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Market data will be generated when the client has target neighborhoods set</p>';
      });
    } else {
      var body = document.getElementById('marketIntelBody');
      if (body) body.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Set client neighborhoods in Preferences to see market intelligence</p>';
    }
  }

  function miniStat(label, value, color) {
    return '<div class="text-center p-3 rounded-lg bg-gray-50">' +
      '<p class="text-lg font-bold" style="color:' + (color || '#111827') + '">' + value + '</p>' +
      '<p class="text-[10px] font-semibold text-gray-500 uppercase">' + label + '</p>' +
    '</div>';
  }

  function generateCMA() {
    var body = document.getElementById('cmaBody');
    if (!body) return;
    body.innerHTML = '<div class="flex items-center justify-center h-16"><i class="fas fa-spinner fa-spin text-gold mr-2"></i> Generating CMA...</div>';

    MallanAPI._fetch('/api/crm/cma', {
      method: 'POST',
      body: JSON.stringify({ client_id: _clientId }),
    }).then(function (data) {
      var cma = data.report || data;
      body.innerHTML = '<div class="space-y-3">' +
        (cma.subject_address ? '<p class="text-sm font-semibold">' + E(cma.subject_address) + '</p>' : '') +
        '<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">' +
          miniStat('Estimated Value', $(cma.estimated_value || cma.value), '#059669') +
          miniStat('Comps Used', cma.comp_count || '-', '#3b82f6') +
          miniStat('Confidence', (cma.confidence || '-') + '%', '#8b5cf6') +
        '</div>' +
        '<p class="text-xs text-gray-400">CMA generated ' + D(new Date().toISOString()) + ' &middot; REBNY RLS data</p>' +
      '</div>';
      CRM.toast('CMA generated', 'success');
    }).catch(function (err) {
      body.innerHTML = '<p class="text-sm text-red-500 text-center py-4">CMA generation failed: ' + E(err.message) + '</p>';
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB: SHOWINGS
  // ═══════════════════════════════════════════════════════════════════════════
  function tabShowings(tc) {
    tc.innerHTML = '<div class="space-y-4">' +
      '<div class="flex items-center justify-between">' +
        '<h3 class="text-sm font-bold text-gray-900">Showings</h3>' +
        '<button class="btn btn-sm btn-gold" onclick="Workspace.scheduleShowing()"><i class="fas fa-calendar-plus"></i> Schedule Showing</button>' +
      '</div>' +
      '<div id="showingsList"><div class="flex items-center justify-center h-32"><i class="fas fa-spinner fa-spin text-gold"></i></div></div>' +
    '</div>';

    // Load showings
    MallanAPI.showings.list({ limit: 50 }).then(function (data) {
      var all = data.showings || [];
      var clientShowings = all.filter(function (s) { return s.client_id === _clientId || s.lead_id === _clientId; });
      var area = document.getElementById('showingsList');
      if (!area) return;

      if (clientShowings.length === 0) {
        area.innerHTML = '<div class="empty-state"><i class="fas fa-calendar"></i><p>No showings scheduled</p></div>';
        return;
      }

      var html = '<div class="space-y-3">';
      clientShowings.forEach(function (s) {
        var isPast = new Date(s.date) < new Date();
        html += '<div class="card p-4">' +
          '<div class="flex items-center gap-4">' +
            '<div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ' +
              (isPast ? 'bg-gray-100' : 'bg-blue-50') + '">' +
              '<i class="fas fa-calendar ' + (isPast ? 'text-gray-400' : 'text-blue-500') + '"></i></div>' +
            '<div class="flex-1 min-w-0">' +
              '<p class="text-sm font-semibold text-gray-900">' + E(s.address || s.listing_address || 'Showing') + '</p>' +
              '<p class="text-xs text-gray-500">' + D(s.date) + (s.time ? ' at ' + E(s.time) : '') + '</p>' +
            '</div>' +
            '<span class="badge badge-' + (s.status || 'pending') + '">' + E(s.status || 'scheduled') + '</span>' +
          '</div>' +
          (s.feedback ? '<div class="mt-3 pt-3 border-t border-gray-100"><p class="text-xs text-gray-500"><i class="fas fa-comment mr-1"></i> ' + E(s.feedback) + '</p></div>' : '') +
        '</div>';
      });
      html += '</div>';
      area.innerHTML = html;
    }).catch(function () {
      var area = document.getElementById('showingsList');
      if (area) area.innerHTML = '<div class="empty-state"><i class="fas fa-calendar"></i><p>Could not load showings</p></div>';
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB: FINANCIAL
  // ═══════════════════════════════════════════════════════════════════════════
  function tabFinancial(tc) {
    var c = _client;
    var prefs = c.preferences || {};
    var price = prefs.maxPrice || 1000000;
    var downPct = 20;
    var rate = 6.5;
    var term = 30;

    tc.innerHTML = '<div class="space-y-4">' +
      '<!-- Mortgage Calculator -->' +
      '<div class="card"><div class="card-header"><h3>Mortgage Calculator</h3></div>' +
        '<div class="card-body">' +
          '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">' +
            '<div class="form-group mb-0"><label class="form-label">Price</label>' +
              '<input id="calcPrice" class="form-input text-sm" type="number" value="' + price + '"></div>' +
            '<div class="form-group mb-0"><label class="form-label">Down %</label>' +
              '<input id="calcDown" class="form-input text-sm" type="number" value="' + downPct + '" min="0" max="100"></div>' +
            '<div class="form-group mb-0"><label class="form-label">Rate %</label>' +
              '<input id="calcRate" class="form-input text-sm" type="number" value="' + rate + '" step="0.1"></div>' +
            '<div class="form-group mb-0"><label class="form-label">Term (yr)</label>' +
              '<input id="calcTerm" class="form-input text-sm" type="number" value="' + term + '"></div>' +
          '</div>' +
          '<button class="btn btn-gold btn-sm mb-4" onclick="Workspace.calcMortgage()"><i class="fas fa-calculator"></i> Calculate</button>' +
          '<div id="mortgageResult"></div>' +
        '</div>' +
      '</div>' +

      '<!-- Closing Costs Estimate -->' +
      '<div class="card"><div class="card-header"><h3>Closing Costs Estimate</h3></div>' +
        '<div class="card-body" id="closingCosts">' +
          '<button class="btn btn-outline btn-sm" onclick="Workspace.calcClosingCosts()"><i class="fas fa-calculator"></i> Estimate Closing Costs</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    // Auto-calculate
    calcMortgage();
  }

  function calcMortgage() {
    var p = Number(val('calcPrice')) || 1000000;
    var d = Number(val('calcDown')) || 20;
    var r = Number(val('calcRate')) || 6.5;
    var t = Number(val('calcTerm')) || 30;

    var loan = p * (1 - d / 100);
    var monthlyRate = r / 100 / 12;
    var payments = t * 12;
    var monthly = monthlyRate > 0
      ? loan * (monthlyRate * Math.pow(1 + monthlyRate, payments)) / (Math.pow(1 + monthlyRate, payments) - 1)
      : loan / payments;
    var totalPaid = monthly * payments;
    var totalInterest = totalPaid - loan;

    var el = document.getElementById('mortgageResult');
    if (!el) return;

    el.innerHTML = '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">' +
      miniStat('Monthly Payment', $(Math.round(monthly)), '#111827') +
      miniStat('Loan Amount', $(Math.round(loan)), '#3b82f6') +
      miniStat('Down Payment', $(Math.round(p * d / 100)), '#059669') +
      miniStat('Total Interest', $(Math.round(totalInterest)), '#f59e0b') +
    '</div>';
  }

  function calcClosingCosts() {
    var p = Number(val('calcPrice')) || 1000000;
    var el = document.getElementById('closingCosts');
    if (!el) return;

    // NYC closing cost estimates
    var titleInsurance = Math.round(p * 0.005);
    var attorneyFee = 3500;
    var mansionTax = p >= 1000000 ? Math.round(p * 0.01) : 0;
    var transferTax = Math.round(p * (p >= 500000 ? 0.01425 : 0.01));
    var recordingFee = 500;
    var total = titleInsurance + attorneyFee + mansionTax + transferTax + recordingFee;

    el.innerHTML = '<div class="space-y-2">' +
      costRow('Title Insurance', titleInsurance) +
      costRow('Attorney Fee', attorneyFee) +
      (mansionTax ? costRow('Mansion Tax (1%)', mansionTax) : '') +
      costRow('Transfer Tax', transferTax) +
      costRow('Recording & Misc', recordingFee) +
      '<div class="flex justify-between pt-2 border-t border-gray-200">' +
        '<span class="text-sm font-bold text-gray-900">Estimated Total</span>' +
        '<span class="text-sm font-bold text-gray-900">' + $(total) + '</span>' +
      '</div>' +
      '<p class="text-[10px] text-gray-400 mt-2">NYC estimate only. Actual costs may vary. Co-op vs condo differences apply.</p>' +
    '</div>';
  }

  function costRow(label, amount) {
    return '<div class="flex justify-between">' +
      '<span class="text-sm text-gray-600">' + label + '</span>' +
      '<span class="text-sm font-medium text-gray-900">' + $(amount) + '</span>' +
    '</div>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB: DOCUMENTS
  // ═══════════════════════════════════════════════════════════════════════════
  function tabDocuments(tc) {
    tc.innerHTML = '<div class="space-y-4">' +
      '<div class="flex items-center justify-between">' +
        '<h3 class="text-sm font-bold text-gray-900">Documents for this Client</h3>' +
        '<button class="btn btn-sm btn-gold" onclick="Panels.showUploadDocModal()"><i class="fas fa-upload"></i> Upload</button>' +
      '</div>' +
      '<div id="clientDocsArea"><div class="flex items-center justify-center h-32"><i class="fas fa-spinner fa-spin text-gold"></i></div></div>' +
    '</div>';

    // Load docs for this client
    MallanAPI._fetch('/api/crm/documents').then(function (data) {
      var docs = (data.documents || []).filter(function (d) { return d.client_id === _clientId; });
      var area = document.getElementById('clientDocsArea');
      if (!area) return;

      if (docs.length === 0) {
        area.innerHTML = '<div class="empty-state"><i class="fas fa-folder"></i><p>No documents for this client yet</p></div>';
        return;
      }

      var html = '<div class="space-y-2">';
      docs.forEach(function (d) {
        html += '<div class="card p-4 hover:border-gold cursor-pointer">' +
          '<div class="flex items-center gap-3">' +
            '<div class="w-10 h-10 rounded-lg bg-gold-bg flex items-center justify-center flex-shrink-0"><i class="fas fa-file-alt text-gold"></i></div>' +
            '<div class="flex-1 min-w-0">' +
              '<p class="text-sm font-semibold truncate">' + E(d.title || d.name) + '</p>' +
              '<p class="text-xs text-gray-500">' + E(d.type || 'document') + ' &middot; ' + D(d.created_at) + '</p>' +
            '</div>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
      area.innerHTML = html;
    }).catch(function () {
      var area = document.getElementById('clientDocsArea');
      if (area) area.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Could not load documents</p>';
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB: NOTES & TASKS
  // ═══════════════════════════════════════════════════════════════════════════
  function tabNotes(tc) {
    tc.innerHTML = '<div class="space-y-4">' +
      '<!-- Notes -->' +
      '<div class="card"><div class="card-header"><h3>Notes</h3>' +
        '<button class="btn btn-sm btn-outline" onclick="Workspace.addNote()"><i class="fas fa-plus"></i> Add Note</button></div>' +
        '<div class="card-body">' +
          '<textarea id="clientNotes" class="form-input" rows="4" placeholder="Add notes about this client...">' + E(_client.notes || '') + '</textarea>' +
          '<button class="btn btn-sm btn-gold mt-2" onclick="Workspace.saveNotes()"><i class="fas fa-save"></i> Save Notes</button>' +
        '</div>' +
      '</div>' +

      '<!-- Tasks -->' +
      '<div class="card"><div class="card-header"><h3>Tasks for this Client</h3>' +
        '<button class="btn btn-sm btn-gold" onclick="Workspace.addClientTask()"><i class="fas fa-plus"></i> Add Task</button></div>' +
        '<div class="card-body" id="clientTasks">' +
          '<div class="flex items-center justify-center h-16"><i class="fas fa-spinner fa-spin text-gold"></i></div>' +
        '</div>' +
      '</div>' +
    '</div>';

    // Load tasks
    MallanAPI._fetch('/api/crm/tasks').then(function (data) {
      var tasks = (data.tasks || []).filter(function (t) { return t.client_id === _clientId; });
      var area = document.getElementById('clientTasks');
      if (!area) return;

      if (tasks.length === 0) {
        area.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">No tasks for this client</p>';
        return;
      }

      var html = '<div class="space-y-2">';
      tasks.forEach(function (t) {
        var done = t.status === 'completed';
        html += '<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">' +
          '<button class="w-4 h-4 rounded border-2 ' + (done ? 'border-green-500 bg-green-500' : 'border-gray-300') + ' flex-shrink-0" ' +
            'onclick="Panels.toggleTask(\'' + E(t.id) + '\', ' + !done + ')"></button>' +
          '<p class="text-sm ' + (done ? 'text-gray-400 line-through' : 'text-gray-900') + ' truncate flex-1">' + E(t.title || t.description) + '</p>' +
          (t.due_date ? '<span class="text-xs text-gray-500">' + D(t.due_date) + '</span>' : '') +
        '</div>';
      });
      html += '</div>';
      area.innerHTML = html;
    }).catch(function () {
      var area = document.getElementById('clientTasks');
      if (area) area.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Could not load tasks</p>';
    });
  }

  function saveNotes() {
    var el = document.getElementById('clientNotes');
    if (!el) return;
    MallanAPI.clients.update(_clientId, { notes: el.value }).then(function () {
      CRM.toast('Notes saved', 'success');
      _client.notes = el.value;
    }).catch(function (err) { CRM.toast('Failed: ' + err.message, 'error'); });
  }

  function addNote() {
    var el = document.getElementById('clientNotes');
    if (el) el.focus();
  }

  function addClientTask() {
    CRM.openModal('Add Task for ' + E(_client.name || 'Client'),
      '<form id="addClientTaskForm" class="space-y-4">' +
        '<div class="form-group"><label class="form-label">Title *</label><input class="form-input" name="title" required></div>' +
        '<div class="form-group"><label class="form-label">Due Date</label><input class="form-input" type="date" name="due_date"></div>' +
        '<div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" name="description" rows="2"></textarea></div>' +
      '</form>',
      {
        footer:
          '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Workspace.submitClientTask()"><i class="fas fa-plus"></i> Add</button>'
      }
    );
  }

  function submitClientTask() {
    var form = document.getElementById('addClientTaskForm');
    if (!form || !form.checkValidity()) { form.reportValidity(); return; }
    var data = { client_id: _clientId };
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    MallanAPI._fetch('/api/crm/tasks', { method: 'POST', body: JSON.stringify(data) }).then(function () {
      CRM.closeModal();
      CRM.toast('Task added', 'success');
      switchTab('notes'); // Refresh
    }).catch(function (err) { CRM.toast('Failed: ' + err.message, 'error'); });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WORKSPACE ACTIONS (header buttons)
  // ═══════════════════════════════════════════════════════════════════════════

  function sendListings() {
    switchTab('market');
  }

  function scheduleShowing() {
    CRM.openModal('Schedule Showing',
      '<form id="scheduleShowingForm" class="space-y-4">' +
        '<div class="form-group"><label class="form-label">Listing Address *</label><input class="form-input" name="address" required placeholder="e.g. 400 E 90th St, Apt 17C"></div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Date *</label><input class="form-input" type="date" name="date" required></div>' +
          '<div class="form-group"><label class="form-label">Time *</label><input class="form-input" type="time" name="time" required></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Type</label>' +
          '<select class="form-input form-select" name="type">' +
            '<option value="private">Private Showing</option>' +
            '<option value="open_house">Open House</option>' +
            '<option value="virtual">Virtual Tour</option>' +
          '</select></div>' +
        '<div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" name="notes" rows="2"></textarea></div>' +
      '</form>',
      {
        footer:
          '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Workspace.submitShowing()"><i class="fas fa-calendar-plus"></i> Schedule</button>'
      }
    );
  }

  function submitShowing() {
    var form = document.getElementById('scheduleShowingForm');
    if (!form || !form.checkValidity()) { form.reportValidity(); return; }
    var data = { client_id: _clientId };
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    MallanAPI.showings.create(data).then(function () {
      CRM.closeModal();
      CRM.toast('Showing scheduled', 'success');
      if (_currentTab === 'showings') switchTab('showings');
    }).catch(function (err) { CRM.toast('Failed: ' + err.message, 'error'); });
  }

  function emailClient() {
    if (_client.email) {
      window.open('mailto:' + encodeURIComponent(_client.email), '_blank');
    } else {
      CRM.toast('No email address on file', 'warning');
    }
  }

  function callClient() {
    if (_client.phone) {
      window.open('tel:' + encodeURIComponent(_client.phone), '_blank');
    } else {
      CRM.toast('No phone number on file', 'warning');
    }
  }

  function inviteToPortal() {
    var role = _client.role || _client.client_type || 'buyer';
    CRM.openModal('Invite to Client Portal',
      '<p class="text-sm text-gray-600 mb-4">Send ' + E(_client.name || 'this client') + ' an invitation to their <strong>' + E(role) + ' portal</strong> where they can view listings, react, and engage.</p>' +
      '<div class="form-group"><label class="form-label">Email</label><input id="inviteEmail" class="form-input" value="' + E(_client.email || '') + '"></div>',
      {
        footer:
          '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Workspace.submitPortalInvite()"><i class="fas fa-paper-plane"></i> Send Invite</button>'
      }
    );
  }

  function submitPortalInvite() {
    var email = val('inviteEmail');
    if (!email) { CRM.toast('Email required', 'warning'); return; }

    MallanAPI.clients.invite(_clientId, { email: email }).then(function () {
      CRM.closeModal();
      CRM.toast('Portal invitation sent', 'success');
    }).catch(function (err) { CRM.toast('Failed: ' + err.message, 'error'); });
  }

  function moveStage() {
    var options = [
      'new', 'contacted', 'nurturing', 'active', 'showing', 'offer', 'deal', 'closed'
    ].map(function (s) {
      return '<option value="' + s + '" ' + (s === (_client.stage || 'new') ? 'selected' : '') + '>' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
    }).join('');

    CRM.openModal('Move Stage',
      '<div class="form-group"><label class="form-label">New Stage</label>' +
        '<select id="wsNewStage" class="form-input form-select">' + options + '</select></div>',
      {
        footer:
          '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Workspace.submitMoveStage()">Move</button>'
      }
    );
  }

  function submitMoveStage() {
    var stage = val('wsNewStage');
    MallanAPI.clients.update(_clientId, { stage: stage }).then(function () {
      CRM.closeModal();
      CRM.toast('Stage updated to ' + stage, 'success');
      _client.stage = stage;
      // Re-render header
      var content = document.getElementById('content');
      if (content) renderWorkspace(content);
    }).catch(function (err) { CRM.toast('Failed: ' + err.message, 'error'); });
  }

  function editClient() {
    var c = _client;
    CRM.openModal('Edit Client',
      '<form id="editClientForm" class="space-y-4">' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Name</label><input class="form-input" name="name" value="' + E(c.name || '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Email</label><input class="form-input" type="email" name="email" value="' + E(c.email || '') + '"></div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Phone</label><input class="form-input" name="phone" value="' + E(c.phone || '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Source</label><input class="form-input" name="source" value="' + E(c.source || '') + '"></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Address</label><input class="form-input" name="address" value="' + E(c.address || '') + '"></div>' +
      '</form>',
      {
        footer:
          '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Workspace.submitEditClient()">Save</button>'
      }
    );
  }

  function submitEditClient() {
    var form = document.getElementById('editClientForm');
    if (!form) return;
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    MallanAPI.clients.update(_clientId, data).then(function () {
      CRM.closeModal();
      CRM.toast('Client updated', 'success');
      Object.assign(_client, data);
      var content = document.getElementById('content');
      if (content) renderWorkspace(content);
    }).catch(function (err) { CRM.toast('Failed: ' + err.message, 'error'); });
  }

  function editPreferences() {
    var prefs = _client.preferences || {};
    CRM.openModal('Edit Preferences',
      '<form id="editPrefsForm" class="space-y-4">' +
        '<div class="form-group"><label class="form-label">Neighborhoods (comma-separated)</label>' +
          '<input class="form-input" name="neighborhoods" value="' + E((prefs.neighborhoods || []).join(', ')) + '" placeholder="e.g. Upper East Side, Midtown East"></div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Min Budget</label><input class="form-input" type="number" name="minPrice" value="' + (prefs.minPrice || '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Max Budget</label><input class="form-input" type="number" name="maxPrice" value="' + (prefs.maxPrice || '') + '"></div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Min Beds</label><input class="form-input" type="number" name="minBeds" value="' + (prefs.minBeds || '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Min Baths</label><input class="form-input" type="number" name="minBaths" value="' + (prefs.minBaths || '') + '"></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Property Type</label>' +
          '<select class="form-input form-select" name="propertyType">' +
            '<option value="">Any</option>' +
            '<option value="Condo" ' + (prefs.propertyType === 'Condo' ? 'selected' : '') + '>Condo</option>' +
            '<option value="Co-op" ' + (prefs.propertyType === 'Co-op' ? 'selected' : '') + '>Co-op</option>' +
            '<option value="Condop" ' + (prefs.propertyType === 'Condop' ? 'selected' : '') + '>Condop</option>' +
            '<option value="Townhouse" ' + (prefs.propertyType === 'Townhouse' ? 'selected' : '') + '>Townhouse</option>' +
            '<option value="Multi-Family" ' + (prefs.propertyType === 'Multi-Family' ? 'selected' : '') + '>Multi-Family</option>' +
          '</select></div>' +
        '<div class="form-group"><label class="form-label">Must Haves</label><textarea class="form-input" name="must_haves" rows="2" placeholder="e.g. doorman, laundry in unit, balcony">' + E(prefs.must_haves || '') + '</textarea></div>' +
        '<div class="form-group"><label class="form-label">Deal Breakers</label><textarea class="form-input" name="deal_breakers" rows="2" placeholder="e.g. no walk-up, no basement">' + E(prefs.deal_breakers || '') + '</textarea></div>' +
      '</form>',
      {
        footer:
          '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Workspace.submitPreferences()">Save</button>'
      }
    );
  }

  function submitPreferences() {
    var form = document.getElementById('editPrefsForm');
    if (!form) return;
    var raw = {};
    new FormData(form).forEach(function (v, k) { if (v) raw[k] = v; });

    var prefs = {};
    if (raw.neighborhoods) prefs.neighborhoods = raw.neighborhoods.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (raw.minPrice) prefs.minPrice = Number(raw.minPrice);
    if (raw.maxPrice) prefs.maxPrice = Number(raw.maxPrice);
    if (raw.minBeds) prefs.minBeds = Number(raw.minBeds);
    if (raw.minBaths) prefs.minBaths = Number(raw.minBaths);
    if (raw.propertyType) prefs.propertyType = raw.propertyType;
    if (raw.must_haves) prefs.must_haves = raw.must_haves;
    if (raw.deal_breakers) prefs.deal_breakers = raw.deal_breakers;

    MallanAPI.clients.savePreferences(_clientId, prefs).then(function () {
      CRM.closeModal();
      CRM.toast('Preferences saved', 'success');
      _client.preferences = Object.assign(_client.preferences || {}, prefs);
      if (_currentTab === 'overview') switchTab('overview');
    }).catch(function (err) { CRM.toast('Failed: ' + err.message, 'error'); });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    open: open,
    switchTab: switchTab,
    sendListings: sendListings,
    searchListings: searchListings,
    sendOneListing: sendOneListing,
    scheduleShowing: scheduleShowing,
    submitShowing: submitShowing,
    emailClient: emailClient,
    callClient: callClient,
    inviteToPortal: inviteToPortal,
    submitPortalInvite: submitPortalInvite,
    moveStage: moveStage,
    submitMoveStage: submitMoveStage,
    editClient: editClient,
    submitEditClient: submitEditClient,
    editPreferences: editPreferences,
    submitPreferences: submitPreferences,
    generateCMA: generateCMA,
    calcMortgage: calcMortgage,
    calcClosingCosts: calcClosingCosts,
    saveNotes: saveNotes,
    addNote: addNote,
    addClientTask: addClientTask,
    submitClientTask: submitClientTask,
  };
})();
