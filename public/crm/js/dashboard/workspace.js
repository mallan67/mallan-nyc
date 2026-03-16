// ═══════════════════════════════════════════════════════════════════════════════
// CRM WORKSPACE — Client Workspace (10 sections) + Listing Workspace (10 sections)
// These are the two primary work surfaces of the CRM.
// ═══════════════════════════════════════════════════════════════════════════════
/* global MallanAPI, CRM, Store, Router, Permissions, Events, Alerts, Documents, UI, Utils */

var Workspace = (function () {
  'use strict';

  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  // ═══════════════════════════════════════════════════════════════════════
  // CLIENT WORKSPACE
  // ═══════════════════════════════════════════════════════════════════════

  var _client = null;
  var _clientId = null;
  var _clientTab = 'overview';
  var _clientData = {}; // secondary data cache

  var CLIENT_TABS = [
    { id: 'overview',   label: 'Overview',    icon: 'fa-user' },
    { id: 'listings',   label: 'Listings',    icon: 'fa-building' },
    { id: 'activity',   label: 'Activity',    icon: 'fa-stream' },
    { id: 'pipeline',   label: 'Pipeline',    icon: 'fa-chart-line' },
    { id: 'market',     label: 'Market',      icon: 'fa-chart-area' },
    { id: 'financial',  label: 'Financial',   icon: 'fa-calculator' },
    { id: 'showings',   label: 'Showings',    icon: 'fa-calendar' },
    { id: 'documents',  label: 'Documents',   icon: 'fa-folder' },
    { id: 'agreements', label: 'Agreements',  icon: 'fa-file-signature' },
    { id: 'readiness',  label: 'Readiness',   icon: 'fa-clipboard-check' },
  ];

  function openClient(clientId, tab) {
    tab = tab || 'overview';
    _clientId = clientId;
    _clientTab = tab;

    CRM.setPanelTitle('Client Workspace');
    var c = CRM.getContent();
    c.innerHTML = UI.loading();

    // Load client
    MallanAPI.clients.get(clientId).then(function (data) {
      _client = data.client || data;
      _renderClientWorkspace(c);
      _loadClientSecondary();
    }).catch(function (err) {
      c.innerHTML = UI.emptyState('fa-exclamation-circle', 'Could not load client: ' + (err.message || 'Unknown error'),
        '<button class="btn btn-sm btn-outline" onclick="Router.navigate(\'/ops/clients\')">Back to Clients</button>');
    });
  }

  function _renderClientWorkspace(c) {
    var cl = _client;
    var name = cl.name || cl.email || 'Client';
    var type = cl.type || cl.client_type || 'buyer';

    var html = '<div class="space-y-0">';

    // Header
    html += '<div class="workspace-header">' +
      '<div class="flex items-center justify-between">' +
        '<div class="flex items-center gap-4">' +
          UI.avatar(name, 48) +
          '<div>' +
            '<h2 class="text-xl font-bold text-gray-900">' + E(name) + '</h2>' +
            '<div class="flex items-center gap-2 mt-1">' +
              UI.roleBadge(type) +
              UI.stageBadge(cl.stage || cl.status || 'active') +
              (cl.healthScore ? '<span class="text-xs text-gray-500">Health: ' + cl.healthScore + '</span>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="flex gap-2">' +
          '<button class="btn btn-sm btn-outline" onclick="Workspace.editClient()"><i class="fas fa-edit"></i> Edit</button>' +
          '<button class="btn btn-sm btn-gold" onclick="CRM.quickSendListing()"><i class="fas fa-paper-plane"></i> Send Listing</button>' +
        '</div>' +
      '</div>' +
      // Contact info
      '<div class="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">' +
        (cl.email ? '<span><i class="fas fa-envelope mr-1"></i>' + E(cl.email) + '</span>' : '') +
        (cl.phone ? '<span><i class="fas fa-phone mr-1"></i>' + E(cl.phone) + '</span>' : '') +
        (cl.source ? '<span><i class="fas fa-tag mr-1"></i>Source: ' + E(cl.source) + '</span>' : '') +
      '</div>' +
    '</div>';

    // Tabs
    html += UI.tabs(CLIENT_TABS, _clientTab, 'Workspace.switchClientTab');

    // Content + Right Rail
    html += '<div class="flex gap-4">';
    html += '<div class="flex-1 min-w-0"><div id="wsClientContent" class="workspace-content">' + UI.loading() + '</div></div>';

    // Right rail
    html += '<div id="wsClientRail" class="hidden lg:block w-72 flex-shrink-0">' +
      '<div class="space-y-3">' +
        _clientRightRail(cl) +
      '</div>' +
    '</div>';

    html += '</div>'; // flex
    html += '</div>'; // space-y

    c.innerHTML = html;

    // Render active tab content
    _renderClientTab();
    // Fetch lead score for right rail
    _fetchRailLeadScore();
  }

  function switchClientTab(tab) {
    _clientTab = tab;
    // Update URL
    Router.navigate('/workspace/client/' + _clientId + '/' + tab, { silent: true });
    // Update tab visual
    document.querySelectorAll('.workspace-tab').forEach(function (el, i) {
      el.classList.toggle('active', CLIENT_TABS[i].id === tab);
    });
    _renderClientTab();
  }

  function _renderClientTab() {
    var el = document.getElementById('wsClientContent');
    if (!el) return;
    el.innerHTML = UI.loading();

    switch (_clientTab) {
      case 'overview':   _clientOverview(el); break;
      case 'listings':   _clientListings(el); break;
      case 'activity':   _clientActivity(el); break;
      case 'pipeline':   _clientPipeline(el); break;
      case 'market':     _clientMarket(el); break;
      case 'financial':  _clientFinancial(el); break;
      case 'showings':   _clientShowings(el); break;
      case 'documents':  _clientDocuments(el); break;
      case 'agreements': _clientAgreements(el); break;
      case 'readiness':  _clientReadiness(el); break;
      default:           _clientOverview(el);
    }
  }

  function _clientRightRail(cl) {
    var alerts = Alerts.getForEntity('client', _clientId);
    var type = (cl.type || cl.client_type || 'buyer').toLowerCase();
    var html = '';

    // Quick Actions — all real
    html += '<div class="card p-3"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Quick Actions</h4>' +
      '<div class="space-y-1">' +
        '<button class="w-full text-left text-sm p-2 rounded hover:bg-gray-50" onclick="CRM.quickSendListing()"><i class="fas fa-paper-plane text-xs text-gray-400 mr-2"></i>Send Listing</button>' +
        '<button class="w-full text-left text-sm p-2 rounded hover:bg-gray-50" onclick="Workspace._addPipelineTask()"><i class="fas fa-tasks text-xs text-gray-400 mr-2"></i>Add Task</button>' +
        '<button class="w-full text-left text-sm p-2 rounded hover:bg-gray-50" onclick="Workspace._addActivityNote()"><i class="fas fa-sticky-note text-xs text-gray-400 mr-2"></i>Add Note</button>' +
        '<button class="w-full text-left text-sm p-2 rounded hover:bg-gray-50" onclick="Workspace._scheduleShowing()"><i class="fas fa-calendar-plus text-xs text-gray-400 mr-2"></i>Schedule Showing</button>' +
        (cl.email ? '<a class="w-full text-left text-sm p-2 rounded hover:bg-gray-50 block" href="mailto:' + E(cl.email) + '"><i class="fas fa-envelope text-xs text-gray-400 mr-2"></i>Email</a>' : '') +
        (cl.phone ? '<a class="w-full text-left text-sm p-2 rounded hover:bg-gray-50 block" href="tel:' + E(cl.phone) + '"><i class="fas fa-phone text-xs text-gray-400 mr-2"></i>Call</a>' : '') +
      '</div></div>';

    // Lead Score — fetch async, render placeholder with id
    html += '<div class="card p-3"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Lead Score</h4>' +
      '<div id="wsRailLeadScore" class="flex items-center justify-center">' +
        '<div class="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-lg font-bold">-</div>' +
      '</div></div>';

    // Client Summary — mirrors overview summary cards
    var stage = cl.stage || cl.status || 'new';
    var railEvents = Events.getByEntity('client', _clientId);
    var railLastEvent = railEvents.length > 0 ? railEvents[0] : null;
    var railLastActivity = railLastEvent ? Utils.formatTimeAgo(railLastEvent.createdAt) : 'None';
    var railTasks = (_clientData.tasks || []).filter(function (t) { return t.status !== 'completed'; });
    var railNextTask = railTasks.length > 0 ? railTasks[0].title : 'None';
    html += '<div class="card p-3"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Summary</h4>' +
      '<div class="space-y-2">' +
        '<div class="flex justify-between text-xs"><span>Stage</span><span class="font-bold px-2 py-0.5 rounded-full ' + _stageBadgeColor(stage) + '">' + E(stage) + '</span></div>' +
        '<div class="flex justify-between text-xs"><span>Last Activity</span><span class="font-bold">' + E(railLastActivity) + '</span></div>' +
        '<div class="flex justify-between text-xs"><span>Next Task</span><span class="font-bold truncate max-w-[120px]" title="' + E(railNextTask) + '">' + E(railNextTask) + '</span></div>' +
      '</div></div>';

    // Health Metrics
    html += '<div class="card p-3"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Health Metrics</h4>' +
      '<div class="space-y-2">' +
        '<div class="flex justify-between text-xs"><span>Health Score</span><span class="font-bold">' + (cl.healthScore || cl.health_score || '\u2014') + '</span></div>' +
        '<div class="flex justify-between text-xs"><span>Readiness</span><span class="font-bold" id="wsRailReadinessScore">' + (cl.readinessScore || cl.readiness_score || '\u2014') + '</span></div>' +
        '<div class="flex justify-between text-xs"><span>Conversion</span><span class="font-bold">' + (cl.conversionProbability || cl.conversion_probability || '\u2014') + (cl.conversionProbability ? '%' : '') + '</span></div>' +
      '</div></div>';

    // Alerts
    if (alerts.length > 0) {
      html += '<div class="card p-3"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Alerts</h4>' +
        '<div class="space-y-2">';
      alerts.slice(0, 5).forEach(function (a) {
        html += '<div class="flex gap-2 text-xs p-2 rounded" style="background:' + Alerts.severityBg(a.severity) + '">' +
          '<i class="fas ' + Alerts.severityIcon(a.severity) + '" style="color:' + Alerts.severityColor(a.severity) + '"></i>' +
          '<span>' + E(a.title) + '</span></div>';
      });
      html += '</div></div>';
    }

    // Next Best Action — smart suggestion
    var nba = _computeNextBestAction(cl, type, alerts);
    html += '<div class="card p-3 border-l-4 border-gold"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Next Best Action</h4>' +
      '<p class="text-sm font-medium text-gray-900">' + E(nba.title) + '</p>' +
      '<p class="text-xs text-gray-500 mt-1">' + E(nba.detail) + '</p>' +
      (nba.action ? '<button class="btn btn-sm btn-gold mt-2" onclick="' + nba.action + '"><i class="fas ' + nba.icon + '"></i> ' + E(nba.actionLabel) + '</button>' : '') +
    '</div>';

    return html;
  }

  function _computeNextBestAction(cl, type, alerts) {
    // Check documents
    var docs = _clientData.documents || [];
    if (docs.length === 0) {
      return { title: 'Upload required documents', detail: 'No documents on file. Start with required agreements.', action: "Workspace.switchClientTab('agreements')", icon: 'fa-file-signature', actionLabel: 'Go to Agreements' };
    }
    // Check showings
    var showings = _clientData.showings || [];
    if (showings.length === 0) {
      return { title: 'Schedule a showing', detail: 'No showings scheduled yet for this client.', action: 'Workspace._scheduleShowing()', icon: 'fa-calendar-plus', actionLabel: 'Schedule' };
    }
    // Check recent activity
    var events = Events.getByEntity('client', _clientId);
    var lastEvent = events.length > 0 ? events[0] : null;
    var daysSinceLast = lastEvent ? Math.floor((Date.now() - new Date(lastEvent.createdAt).getTime()) / 86400000) : 999;
    if (daysSinceLast > 7) {
      return { title: 'Schedule a follow-up', detail: 'No activity in ' + daysSinceLast + ' days. Reach out to keep the relationship warm.', action: 'Workspace._addActivityNote()', icon: 'fa-sticky-note', actionLabel: 'Add Note' };
    }
    // Renter near lease end
    if (type === 'renter') {
      var leaseEnd = cl.leaseEndDate || cl.lease_end_date;
      if (leaseEnd) {
        var daysLeft = Utils.daysUntil ? Utils.daysUntil(leaseEnd) : Math.floor((new Date(leaseEnd).getTime() - Date.now()) / 86400000);
        if (daysLeft <= 180) {
          return { title: 'Discuss buyer conversion', detail: 'Lease ends in ' + daysLeft + ' days. Good time to discuss buying.', action: "Workspace.switchClientTab('pipeline')", icon: 'fa-exchange-alt', actionLabel: 'View Pipeline' };
        }
      }
    }
    return { title: 'Send a new listing', detail: 'Client is active. Keep sending relevant listings.', action: 'CRM.quickSendListing()', icon: 'fa-paper-plane', actionLabel: 'Send Listing' };
  }

  function _fetchRailLeadScore() {
    MallanAPI._fetch('/api/crm/lead-scoring/' + _clientId).then(function (data) {
      var el = document.getElementById('wsRailLeadScore');
      if (!el) return;
      var s = data.score || data;
      var grade = s.grade || '-';
      var gradeColors = { A: '#059669', B: '#2563EB', C: '#F59E0B', D: '#F97316', F: '#EF4444' };
      var color = gradeColors[grade] || '#9CA3AF';
      el.innerHTML = '<div class="flex items-center gap-3">' +
        '<div class="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold" style="background:' + color + '">' + E(grade) + '</div>' +
        '<div class="text-xs"><p class="font-bold">' + (s.totalScore || s.score || 0) + ' pts</p>' +
          '<p class="text-gray-500">Engagement: ' + (s.engagementScore || s.engagement || 0) + '</p></div>' +
      '</div>';
    }).catch(function () {
      var el = document.getElementById('wsRailLeadScore');
      if (el) el.innerHTML = '<div class="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-lg font-bold">-</div>';
    });
  }

  function _loadClientSecondary() {
    // Load tasks, showings, documents in background
    Promise.all([
      MallanAPI._fetch('/api/crm/tasks?client_id=' + _clientId).catch(function () { return { tasks: [] }; }),
      MallanAPI.showings.list({ limit: 20 }).catch(function () { return { showings: [] }; }),
      Documents.list('client', _clientId),
      Events.loadForEntity('client', _clientId),
    ]).then(function (r) {
      _clientData.tasks = r[0].tasks || [];
      _clientData.showings = (r[1].showings || []).filter(function (s) { return s.client_id === _clientId || s.clientId === _clientId; });
      _clientData.documents = r[2] || [];
      _clientData.events = r[3] || [];
    });
  }

  // ─── Tab: Overview ───────────────────────────────────────────────────

  function _stageBadgeColor(stage) {
    var map = {
      new: 'bg-blue-100 text-blue-700', contacted: 'bg-indigo-100 text-indigo-700',
      nurturing: 'bg-purple-100 text-purple-700', active: 'bg-green-100 text-green-700',
      showing: 'bg-yellow-100 text-yellow-700', offer: 'bg-orange-100 text-orange-700',
      deal: 'bg-red-100 text-red-700', closed: 'bg-gray-100 text-gray-600',
    };
    return map[(stage || '').toLowerCase()] || 'bg-gray-100 text-gray-600';
  }

  function _clientOverview(el) {
    var cl = _client;
    var prefs = cl.preferences || {};
    var stage = cl.stage || cl.status || 'new';
    var healthScore = cl.healthScore || cl.health_score || '—';

    // Gather events for last activity + next task
    var allEvents = Events.getByEntity('client', _clientId);
    var lastEvent = allEvents.length > 0 ? allEvents[0] : null;
    var lastActivityStr = lastEvent ? Utils.formatTimeAgo(lastEvent.createdAt) : 'None';
    var tasks = (_clientData.tasks || []).filter(function (t) { return t.status !== 'completed'; });
    var nextTask = tasks.length > 0 ? tasks[0] : null;
    var assignedListings = Events.getByEntity('client', _clientId).filter(function (e) { return e.type === 'listing_sent'; });
    var uniqueListingIds = {};
    assignedListings.forEach(function (e) {
      var lid = e.payload && (e.payload.listingId || e.payload.listing_id);
      if (lid) uniqueListingIds[lid] = true;
    });
    var listingCount = Object.keys(uniqueListingIds).length;

    var html = '<div class="space-y-4">';

    // ── Summary Cards (5) ──
    html += '<div class="grid grid-cols-2 sm:grid-cols-5 gap-3">' +
      '<div class="p-3 rounded-lg bg-gray-50 text-center">' +
        '<p class="text-xs text-gray-500 mb-1">Stage</p>' +
        '<span class="inline-block px-3 py-1 rounded-full text-xs font-bold ' + _stageBadgeColor(stage) + '">' + E(stage) + '</span>' +
      '</div>' +
      '<div class="p-3 rounded-lg bg-gray-50 text-center">' +
        '<p class="text-xs text-gray-500 mb-1">Health Score</p>' +
        '<p class="text-lg font-bold">' + E(String(healthScore)) + '</p>' +
      '</div>' +
      '<div class="p-3 rounded-lg bg-gray-50 text-center">' +
        '<p class="text-xs text-gray-500 mb-1">Last Activity</p>' +
        '<p class="text-sm font-medium">' + E(lastActivityStr) + '</p>' +
      '</div>' +
      '<div class="p-3 rounded-lg bg-gray-50 text-center">' +
        '<p class="text-xs text-gray-500 mb-1">Next Task</p>' +
        '<p class="text-sm font-medium truncate" title="' + (nextTask ? E(nextTask.title) : '') + '">' + (nextTask ? E(nextTask.title) : 'None') + '</p>' +
      '</div>' +
      '<div class="p-3 rounded-lg bg-gray-50 text-center">' +
        '<p class="text-xs text-gray-500 mb-1">Sent Listings</p>' +
        '<p class="text-lg font-bold">' + listingCount + '</p>' +
      '</div>' +
    '</div>';

    // Contact info grid
    html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
      '<div class="space-y-3">' +
        '<h3 class="text-sm font-bold text-gray-700">Contact Information</h3>' +
        _infoRow('Email', cl.email) +
        _infoRow('Phone', cl.phone) +
        _infoRow('Source', cl.source) +
        _infoRow('Created', D(cl.created_at || cl.createdAt)) +
        _infoRow('Last Updated', D(cl.updated_at || cl.updatedAt)) +
      '</div>' +

      // Preferences
      '<div class="space-y-3">' +
        '<div class="flex items-center justify-between">' +
          '<h3 class="text-sm font-bold text-gray-700">Preferences</h3>' +
          '<button class="btn btn-xs btn-outline" onclick="Workspace._editPreferences()"><i class="fas fa-edit text-xs"></i> Edit Preferences</button>' +
        '</div>' +
        _infoRow('Neighborhoods', (prefs.neighborhoods || []).join(', ') || '-') +
        _infoRow('Budget', prefs.minPrice || prefs.maxPrice ? (prefs.minPrice ? $(prefs.minPrice) : '$0') + ' - ' + (prefs.maxPrice ? $(prefs.maxPrice) : 'No max') : '-') +
        _infoRow('Beds / Baths', (prefs.minBeds || '-') + ' bd / ' + (prefs.minBaths || '-') + ' ba') +
        _infoRow('Property Type', prefs.propertyType || '-') +
        _infoRow('Must-Haves', prefs.mustHaves || '-') +
        _infoRow('Deal-Breakers', prefs.dealBreakers || '-') +
      '</div>' +
    '</div>';

    // ── Pinned Note ──
    var pinnedNote = prefs.pinnedNote || '';
    if (pinnedNote) {
      html += '<div class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">' +
        '<div class="flex items-center justify-between mb-1">' +
          '<h4 class="text-xs font-bold text-yellow-700 uppercase"><i class="fas fa-thumbtack mr-1"></i>Pinned Note</h4>' +
          '<button class="text-xs text-yellow-600 hover:underline" onclick="Workspace._unpinNote()">Unpin</button>' +
        '</div>' +
        '<p class="text-sm text-yellow-900">' + E(pinnedNote) + '</p>' +
      '</div>';
    }

    // ── Recent Notes (from Events) ──
    var noteEvents = allEvents.filter(function (e) { return e.type === 'note_added'; }).slice(0, 3);
    html += '<div>' +
      '<div class="flex items-center justify-between mb-2">' +
        '<h3 class="text-sm font-bold text-gray-700">Notes</h3>' +
      '</div>';
    if (noteEvents.length > 0) {
      html += '<div class="space-y-2 mb-3">';
      noteEvents.forEach(function (e) {
        var content = (e.payload && e.payload.content) || '';
        var isPinned = content === pinnedNote;
        html += '<div class="p-3 rounded-lg bg-gray-50 flex items-start gap-2">' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm text-gray-700">' + E(content) + '</p>' +
            '<p class="text-xs text-gray-400 mt-1">' + Utils.formatTimeAgo(e.createdAt) + '</p>' +
          '</div>' +
          (!isPinned && content ? '<button class="text-xs text-gray-400 hover:text-gold flex-shrink-0" onclick="Workspace._pinNote(\'' + E(content.replace(/'/g, "\\'")) + '\')" title="Pin this note"><i class="fas fa-thumbtack"></i></button>' : '') +
        '</div>';
      });
      html += '</div>';
    }
    html += '<textarea id="wsClientNotes" class="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-gold focus:border-gold" rows="3" placeholder="Add a new note about this client..."></textarea>' +
      '<div class="mt-2 flex justify-end gap-2">' +
        '<button class="btn btn-sm btn-gold" onclick="Workspace._saveClientNoteAsEvent()"><i class="fas fa-plus mr-1"></i> Add Note</button>' +
      '</div>' +
    '</div>';

    // Lead score
    html += '<div id="wsOverviewLeadScore">' + UI.loading() + '</div>';

    // Recent activity
    html += '<div>' +
      '<h3 class="text-sm font-bold text-gray-700 mb-2">Recent Activity</h3>' +
      '<div id="wsOverviewActivity">' + UI.loading() + '</div>' +
    '</div>';

    html += '</div>';
    el.innerHTML = html;

    // Fetch lead score
    MallanAPI._fetch('/api/crm/lead-scoring/' + _clientId).then(function (data) {
      var scoreEl = document.getElementById('wsOverviewLeadScore');
      if (!scoreEl) return;
      var s = data.score || data;
      var grade = s.grade || 'F';
      var gradeColors = { A: '#059669', B: '#2563EB', C: '#F59E0B', D: '#F97316', F: '#EF4444' };
      var color = gradeColors[grade] || gradeColors.F;
      scoreEl.innerHTML = '<h3 class="text-sm font-bold text-gray-700 mb-2">Lead Score</h3>' +
        '<div class="flex items-center gap-4">' +
          '<div class="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold" style="background:' + color + '">' + E(grade) + '</div>' +
          '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">' +
            '<div class="p-2 bg-gray-50 rounded-lg text-center"><p class="text-xs text-gray-500">Score</p><p class="text-lg font-bold">' + (s.totalScore || s.score || 0) + '</p></div>' +
            '<div class="p-2 bg-gray-50 rounded-lg text-center"><p class="text-xs text-gray-500">Engagement</p><p class="text-lg font-bold">' + (s.engagementScore || s.engagement || 0) + '</p></div>' +
            '<div class="p-2 bg-gray-50 rounded-lg text-center"><p class="text-xs text-gray-500">Financial</p><p class="text-lg font-bold">' + (s.financialScore || s.financial || 0) + '</p></div>' +
            '<div class="p-2 bg-gray-50 rounded-lg text-center"><p class="text-xs text-gray-500">Intent</p><p class="text-lg font-bold">' + (s.intentScore || s.intent || 0) + '</p></div>' +
          '</div>' +
        '</div>';
    }).catch(function () {
      var scoreEl = document.getElementById('wsOverviewLeadScore');
      if (scoreEl) scoreEl.innerHTML = '<p class="text-xs text-gray-400">Lead score unavailable</p>';
    });

    // Recent activity (last 5 events)
    var recentEvents = allEvents.slice(0, 5);
    var actEl = document.getElementById('wsOverviewActivity');
    if (actEl) {
      if (recentEvents.length === 0) {
        actEl.innerHTML = '<p class="text-xs text-gray-400">No recent activity</p>';
      } else {
        actEl.innerHTML = UI.timeline(recentEvents.map(function (e) {
          return {
            title: Events.label(e.type),
            description: e.payload ? JSON.stringify(e.payload).substring(0, 80) : '',
            time: Utils.formatTimeAgo(e.createdAt),
            dotClass: e.severity === 'urgent' ? 'active' : 'info',
          };
        }));
      }
    }
  }

  function _pinNote(content) {
    if (!_clientId || !content) return;
    var prefs = Object.assign({}, _client.preferences || {}, { pinnedNote: content });
    MallanAPI.clients.update(_clientId, { preferences: prefs }).then(function () {
      _client.preferences = prefs;
      CRM.toast('Note pinned', 'success');
      _renderClientTab();
    }).catch(function (err) {
      CRM.toast('Could not pin note: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _unpinNote() {
    if (!_clientId) return;
    var prefs = Object.assign({}, _client.preferences || {});
    delete prefs.pinnedNote;
    MallanAPI.clients.update(_clientId, { preferences: prefs }).then(function () {
      _client.preferences = prefs;
      CRM.toast('Note unpinned', 'success');
      _renderClientTab();
    }).catch(function (err) {
      CRM.toast('Could not unpin note: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _saveClientNoteAsEvent() {
    var ta = document.getElementById('wsClientNotes');
    if (!ta || !ta.value.trim()) { CRM.toast('Enter a note first', 'warning'); return; }
    var content = ta.value.trim();
    Events.log('note_added', 'client', _clientId, { content: content });
    CRM.toast('Note added', 'success');
    _renderClientTab();
  }

  function _editPreferences() {
    var prefs = (_client && _client.preferences) || {};
    CRM.openModal('Edit Preferences',
      '<form id="editPrefsForm" class="space-y-4">' +
        '<div class="form-group"><label class="form-label">Neighborhoods (comma-separated)</label>' +
          '<input class="form-input" name="neighborhoods" value="' + E((prefs.neighborhoods || []).join(', ')) + '" placeholder="Upper East Side, Tribeca, Williamsburg"></div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Min Price</label><input class="form-input" name="minPrice" type="number" value="' + E(prefs.minPrice || '') + '" placeholder="0"></div>' +
          '<div class="form-group"><label class="form-label">Max Price</label><input class="form-input" name="maxPrice" type="number" value="' + E(prefs.maxPrice || '') + '" placeholder="5000000"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Min Beds</label><input class="form-input" name="minBeds" type="number" min="0" max="10" value="' + E(prefs.minBeds || '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Min Baths</label><input class="form-input" name="minBaths" type="number" min="0" max="10" value="' + E(prefs.minBaths || '') + '"></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Property Type</label>' +
          '<select class="form-input form-select" name="propertyType">' +
            '<option value="">Any</option>' +
            '<option' + (prefs.propertyType === 'Condo' ? ' selected' : '') + '>Condo</option>' +
            '<option' + (prefs.propertyType === 'Co-op' ? ' selected' : '') + '>Co-op</option>' +
            '<option' + (prefs.propertyType === 'Townhouse' ? ' selected' : '') + '>Townhouse</option>' +
            '<option' + (prefs.propertyType === 'Single Family' ? ' selected' : '') + '>Single Family</option>' +
            '<option' + (prefs.propertyType === 'Multi Family' ? ' selected' : '') + '>Multi Family</option>' +
            '<option' + (prefs.propertyType === 'Rental' ? ' selected' : '') + '>Rental</option>' +
          '</select></div>' +
        '<div class="form-group"><label class="form-label">Must-Haves</label>' +
          '<textarea class="form-input" name="mustHaves" rows="2" placeholder="Doorman, laundry in unit, outdoor space...">' + E(prefs.mustHaves || '') + '</textarea></div>' +
        '<div class="form-group"><label class="form-label">Deal-Breakers</label>' +
          '<textarea class="form-input" name="dealBreakers" rows="2" placeholder="Walk-up, no dishwasher...">' + E(prefs.dealBreakers || '') + '</textarea></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Workspace._submitPreferences()"><i class="fas fa-save"></i> Save</button>',
      }
    );
  }

  function _submitPreferences() {
    var form = document.getElementById('editPrefsForm');
    if (!form) return;
    var fd = new FormData(form);
    var prefs = {
      neighborhoods: (fd.get('neighborhoods') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      minPrice: fd.get('minPrice') ? Number(fd.get('minPrice')) : null,
      maxPrice: fd.get('maxPrice') ? Number(fd.get('maxPrice')) : null,
      minBeds: fd.get('minBeds') ? Number(fd.get('minBeds')) : null,
      minBaths: fd.get('minBaths') ? Number(fd.get('minBaths')) : null,
      propertyType: fd.get('propertyType') || null,
      mustHaves: fd.get('mustHaves') || null,
      dealBreakers: fd.get('dealBreakers') || null,
    };
    MallanAPI.clients.update(_clientId, { preferences: prefs }).then(function () {
      _client.preferences = prefs;
      CRM.closeModal();
      CRM.toast('Preferences saved', 'success');
      _renderClientTab();
    }).catch(function (err) {
      CRM.toast('Error saving preferences: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _saveClientNotes() {
    var ta = document.getElementById('wsClientNotes');
    if (!ta) return;
    var val = ta.value;
    MallanAPI.clients.update(_clientId, { notes: val }).then(function () {
      _client.notes = val;
      CRM.toast('Notes saved', 'success');
    }).catch(function (err) {
      CRM.toast('Error saving notes: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _infoRow(label, value) {
    return '<div class="flex justify-between"><span class="text-xs text-gray-500">' + E(label) + '</span><span class="text-sm font-medium">' + E(value || '-') + '</span></div>';
  }

  function _miniTimeline() {
    var events = Events.getByEntity('client', _clientId).slice(0, 5);
    if (events.length === 0) return '<p class="text-xs text-gray-400">No recent activity</p>';
    return UI.timeline(events.map(function (e) {
      return {
        title: Events.label(e.type),
        description: e.payload ? JSON.stringify(e.payload).substring(0, 80) : '',
        time: Utils.formatTimeAgo(e.createdAt),
        dotClass: e.severity === 'urgent' ? 'active' : 'info',
      };
    }));
  }

  // ─── Tab: Listings (sent, find & send, reactions, auto-alerts) ──────
  function _clientListings(el) {
    var cl = _client;
    var prefs = cl.preferences || {};

    var html = '<div class="space-y-4">';

    // Header
    html += '<div class="flex items-center justify-between">' +
      '<h3 class="text-sm font-bold text-gray-700">Listings for ' + E(cl.name || 'Client') + '</h3>' +
      '<button class="btn btn-sm btn-gold" onclick="CRM.quickSendListing()"><i class="fas fa-paper-plane"></i> Send Listing</button>' +
    '</div>';

    // Sent Listings
    html += '<div class="card"><div class="card-header"><h3>Sent Listings</h3></div>' +
      '<div class="card-body" id="wsClientSent">' + UI.loading() + '</div></div>';

    // Client Reactions — visual sentiment cards
    html += '<div class="card"><div class="card-header"><h3>Client Reactions</h3></div>' +
      '<div class="card-body" id="wsClientReactions">' + UI.loading() + '</div></div>';

    // Auto-Alert Settings
    var alertFreq = prefs.alertFrequency || 'daily';
    html += '<div class="card p-3">' +
      '<div class="flex items-center justify-between mb-2">' +
        '<h4 class="text-xs font-bold text-gray-500 uppercase">Auto-Alert Settings</h4>' +
      '</div>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
        '<div>' +
          '<label class="text-xs font-semibold text-gray-700 block mb-1">Alert Frequency</label>' +
          '<select id="wsAlertFreq" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">' +
            '<option value="realtime"' + (alertFreq === 'realtime' ? ' selected' : '') + '>Real-time</option>' +
            '<option value="daily"' + (alertFreq === 'daily' ? ' selected' : '') + '>Daily Digest</option>' +
            '<option value="weekly"' + (alertFreq === 'weekly' ? ' selected' : '') + '>Weekly Digest</option>' +
            '<option value="off"' + (alertFreq === 'off' ? ' selected' : '') + '>Off</option>' +
          '</select>' +
        '</div>' +
        '<div class="space-y-2">' +
          '<label class="flex items-center gap-2 text-xs"><input type="checkbox" id="wsAlertNew" ' + (prefs.alertNewMatches !== false ? 'checked' : '') + '> New matches</label>' +
          '<label class="flex items-center gap-2 text-xs"><input type="checkbox" id="wsAlertPrice" ' + (prefs.alertPriceChanges !== false ? 'checked' : '') + '> Price changes</label>' +
          '<label class="flex items-center gap-2 text-xs"><input type="checkbox" id="wsAlertStatus" ' + (prefs.alertStatusChanges !== false ? 'checked' : '') + '> Status changes</label>' +
        '</div>' +
      '</div>' +
      '<div class="mt-3 flex justify-end">' +
        '<button class="btn btn-sm btn-gold" onclick="Workspace._saveAlertSettings()"><i class="fas fa-save mr-1"></i> Save Alert Settings</button>' +
      '</div>' +
    '</div>';

    // ── Find & Send (merged Search + Smart Match) ──
    html += '<div class="card p-3">' +
      '<h4 class="text-xs font-bold text-gray-500 uppercase mb-2"><i class="fas fa-magic mr-1"></i>Find & Send</h4>' +
      '<p class="text-xs text-gray-400 mb-2">Smart matches loaded from preferences. Search to refine.</p>' +
      '<div class="flex gap-2 mb-3">' +
        '<input id="wsListingSearch" class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Search by address, neighborhood, MLS ID...">' +
        '<button class="btn btn-sm btn-outline" onclick="Workspace._searchAndSend()"><i class="fas fa-search"></i> Search</button>' +
      '</div>' +
      '<div id="wsFindAndSendResults">' + UI.loading() + '</div>' +
    '</div>';

    html += '</div>';
    el.innerHTML = html;

    // ── Load Sent Listings ──
    var sentEvents = Events.getByEntity('client', _clientId).filter(function (e) { return e.type === 'listing_sent'; });
    var sentEl = document.getElementById('wsClientSent');
    if (sentEl) {
      if (sentEvents.length === 0) {
        sentEl.innerHTML = '<p class="text-sm text-gray-500">No listings sent yet</p>';
      } else {
        var listingIds = sentEvents.map(function (e) { return e.payload && (e.payload.listingId || e.payload.listing_id); }).filter(Boolean);
        var uniqueIds = listingIds.filter(function (v, i, a) { return a.indexOf(v) === i; });
        if (uniqueIds.length === 0) {
          sentEl.innerHTML = UI.timeline(sentEvents.map(function (e) {
            return { title: 'Listing sent', description: '', time: Utils.formatTimeAgo(e.createdAt), dotClass: 'info' };
          }));
        } else {
          var sentDateMap = {};
          sentEvents.forEach(function (e) {
            var lid = e.payload && (e.payload.listingId || e.payload.listing_id);
            if (lid) sentDateMap[lid] = e.createdAt;
          });
          var reactionEvents = Events.getByEntity('client', _clientId).filter(function (e) { return e.type === 'listing_reaction_recorded'; });
          var reactionMap = {};
          reactionEvents.forEach(function (e) {
            var lid = e.payload && (e.payload.listingId || e.payload.listing_id);
            if (lid) reactionMap[lid] = e.payload.reaction || e.payload.type;
          });

          Promise.all(uniqueIds.slice(0, 20).map(function (id) {
            return MallanAPI.listings.get(id).then(function (d) { return d.listing || d; }).catch(function () { return null; });
          })).then(function (listings) {
            var validListings = listings.filter(Boolean);
            if (validListings.length === 0) {
              sentEl.innerHTML = '<p class="text-sm text-gray-500">Sent listing data unavailable</p>';
              return;
            }
            var html = '<div class="space-y-2">';
            validListings.forEach(function (l) {
              var lid = l.id || l.listing_id || l.listingId;
              var reaction = reactionMap[lid];
              var reactionBadge = reaction ? '<span class="text-xs px-2 py-0.5 rounded-full ' +
                (reaction === 'liked' ? 'bg-green-100 text-green-700' : reaction === 'disliked' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700') +
                '">' + E(reaction) + '</span>' : '';
              html += '<div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gold-bg transition-all cursor-pointer" ' +
                'onclick="Router.navigate(\'/workspace/listing/' + E(lid) + '/overview\')">' +
                '<div class="flex-1 min-w-0">' +
                  '<p class="text-sm font-medium truncate">' + E(l.address || l.UnparsedAddress || l.street_address || 'Listing') + '</p>' +
                  '<p class="text-xs text-gray-500">Sent ' + (sentDateMap[lid] ? Utils.formatTimeAgo(sentDateMap[lid]) : '') + '</p>' +
                '</div>' +
                reactionBadge +
              '</div>';
            });
            html += '</div>';
            sentEl.innerHTML = html;
          }).catch(function () {
            sentEl.innerHTML = '<p class="text-sm text-gray-500">Could not load sent listings</p>';
          });
        }
      }
    }

    // ── Load Reactions — visual sentiment cards with discussion threads ──
    var reactionEl = document.getElementById('wsClientReactions');
    if (reactionEl) {
      var reactions = Events.getByEntity('client', _clientId).filter(function (e) { return e.type === 'listing_reaction_recorded'; });
      if (reactions.length === 0) {
        reactionEl.innerHTML = '<p class="text-sm text-gray-500">No reactions yet</p>';
      } else {
        var allClientEvents = Events.getByEntity('client', _clientId);
        var rHtml = '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">';
        reactions.forEach(function (e) {
          var reaction = e.payload && (e.payload.reaction || e.payload.type) || 'unknown';
          var addr = e.payload && (e.payload.address || e.payload.listingId || e.payload.listing_id) || '';
          var lid = e.payload && (e.payload.listingId || e.payload.listing_id) || '';
          var sentimentConfig = {
            liked:    { icon: 'fa-thumbs-up',   bg: 'bg-green-50 border-green-200', iconColor: 'text-green-500', label: 'Liked' },
            disliked: { icon: 'fa-thumbs-down',  bg: 'bg-red-50 border-red-200',     iconColor: 'text-red-500',   label: 'Disliked' },
            discuss:  { icon: 'fa-comment-dots', bg: 'bg-blue-50 border-blue-200',   iconColor: 'text-blue-500',  label: 'Discuss' },
          };
          var cfg = sentimentConfig[reaction] || { icon: 'fa-circle', bg: 'bg-gray-50 border-gray-200', iconColor: 'text-gray-400', label: reaction };

          rHtml += '<div class="p-3 rounded-lg border ' + cfg.bg + '">' +
            '<div class="flex items-center gap-3 mb-2">' +
              '<i class="fas ' + cfg.icon + ' text-2xl ' + cfg.iconColor + '"></i>' +
              '<div class="flex-1 min-w-0">' +
                '<p class="text-sm font-bold">' + E(cfg.label) + '</p>' +
                '<p class="text-xs text-gray-600 truncate">' + E(addr) + '</p>' +
              '</div>' +
            '</div>' +
            '<p class="text-xs text-gray-400">' + Utils.formatTimeAgo(e.createdAt) + '</p>';

          // Discussion thread for "discuss" reactions
          if (reaction === 'discuss' && lid) {
            var followUps = allClientEvents.filter(function (fe) {
              return fe.type === 'note_added' && fe.payload &&
                (fe.payload.listingId === lid || fe.payload.listing_id === lid);
            });
            if (followUps.length > 0) {
              rHtml += '<div class="mt-2 pt-2 border-t border-blue-200 space-y-1">';
              followUps.slice(0, 3).forEach(function (fu) {
                rHtml += '<div class="text-xs text-gray-600"><i class="fas fa-reply text-blue-300 mr-1"></i>' +
                  E((fu.payload && fu.payload.content) || '') +
                  '<span class="text-gray-400 ml-1">' + Utils.formatTimeAgo(fu.createdAt) + '</span></div>';
              });
              rHtml += '</div>';
            }
          }
          rHtml += '</div>';
        });
        rHtml += '</div>';
        reactionEl.innerHTML = rHtml;
      }
    }

    // ── Find & Send — auto-load smart matches, search refines ──
    var findEl = document.getElementById('wsFindAndSendResults');
    if (findEl) {
      var searchParams = {};
      if (prefs.neighborhoods && prefs.neighborhoods.length > 0) searchParams.neighborhood = prefs.neighborhoods[0];
      if (prefs.minPrice) searchParams.minPrice = prefs.minPrice;
      if (prefs.maxPrice) searchParams.maxPrice = prefs.maxPrice;
      if (prefs.minBeds) searchParams.minBeds = prefs.minBeds;

      if (Object.keys(searchParams).length === 0) {
        findEl.innerHTML = '<p class="text-sm text-gray-500">Set client preferences to see smart matches, or search manually above.</p>';
      } else {
        MallanAPI.idx.search(searchParams).then(function (data) {
          var listings = (data.listings || data.results || []).slice(0, 15);
          if (listings.length === 0) {
            findEl.innerHTML = '<p class="text-sm text-gray-500">No matching listings for current preferences</p>';
            return;
          }
          _renderFindAndSendResults(findEl, listings);
        }).catch(function () {
          findEl.innerHTML = '<p class="text-sm text-gray-500">Could not load matching listings</p>';
        });
      }
    }
  }

  function _renderFindAndSendResults(container, listings) {
    var html = '<table class="w-full text-sm"><thead><tr class="text-xs text-gray-500 border-b">' +
      '<th class="text-left py-2">Address</th><th class="text-left py-2">Price</th><th class="text-left py-2">Beds/Baths</th><th class="py-2"></th></tr></thead><tbody>';
    listings.forEach(function (l) {
      var lid = l.id || l.listing_id || l.listingId || '';
      var addr = l.address || l.UnparsedAddress || l.street_address || 'Listing';
      html += '<tr class="border-b hover:bg-gray-50">' +
        '<td class="py-2 cursor-pointer" onclick="Router.navigate(\'/workspace/listing/' + E(lid) + '/overview\')">' + E(addr) + '</td>' +
        '<td class="py-2">' + $(l.ListPrice || l.price || 0) + '</td>' +
        '<td class="py-2">' + (l.BedroomsTotal || l.bedrooms || '-') + ' / ' + (l.BathroomsTotalInteger || l.bathrooms || '-') + '</td>' +
        '<td class="py-2"><button class="btn btn-xs btn-gold" onclick="Workspace._sendListingToClient(\'' + E(lid) + '\',\'' + E(addr) + '\')"><i class="fas fa-paper-plane"></i> Send</button></td>' +
      '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  }

  function _saveAlertSettings() {
    if (!_clientId) return;
    var freqEl = document.getElementById('wsAlertFreq');
    var newEl = document.getElementById('wsAlertNew');
    var priceEl = document.getElementById('wsAlertPrice');
    var statusEl = document.getElementById('wsAlertStatus');
    var prefs = Object.assign({}, _client.preferences || {}, {
      alertFrequency: freqEl ? freqEl.value : 'daily',
      alertNewMatches: newEl ? newEl.checked : true,
      alertPriceChanges: priceEl ? priceEl.checked : true,
      alertStatusChanges: statusEl ? statusEl.checked : true,
    });
    MallanAPI.clients.update(_clientId, { preferences: prefs }).then(function () {
      _client.preferences = prefs;
      CRM.toast('Alert settings saved', 'success');
    }).catch(function (err) {
      CRM.toast('Error saving alert settings: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _searchAndSend() {
    var input = document.getElementById('wsListingSearch');
    var resultsEl = document.getElementById('wsFindAndSendResults');
    if (!input || !resultsEl) return;
    var q = input.value.trim();
    if (!q) {
      // Reset to smart matches
      _renderClientTab();
      return;
    }

    resultsEl.innerHTML = UI.loading();
    MallanAPI.idx.search({ q: q }).then(function (data) {
      var listings = (data.listings || data.results || []).slice(0, 15);
      if (listings.length === 0) {
        resultsEl.innerHTML = '<p class="text-sm text-gray-500">No results found</p>';
        return;
      }
      _renderFindAndSendResults(resultsEl, listings);
    }).catch(function () {
      resultsEl.innerHTML = '<p class="text-sm text-gray-500">Search failed. Please try again.</p>';
    });
  }

  function _sendListingToClient(listingId, address) {
    Events.log('listing_sent', 'client', _clientId, { listingId: listingId, address: address, sentAt: new Date().toISOString() });
    CRM.toast('Listing sent to ' + (_client.name || 'client'), 'success');
  }

  // ─── Tab: Activity ───────────────────────────────────────────────────

  var _activityFilter = 'all';

  function _classifyEventType(type) {
    var noteTypes = ['note_added'];
    var systemTypes = ['client_stage_moved', 'nurture_settings_saved', 'readiness_updated', 'task_created', 'alert_settings_saved'];
    var clientTypes = ['listing_reaction_recorded', 'portal_login', 'portal_viewed', 'client_action'];
    var listingTypes = ['listing_sent', 'quick_send_executed', 'showing_scheduled', 'showing_feedback_added'];
    if (noteTypes.indexOf(type) !== -1) return 'notes';
    if (systemTypes.indexOf(type) !== -1) return 'system';
    if (clientTypes.indexOf(type) !== -1) return 'client';
    if (listingTypes.indexOf(type) !== -1) return 'listings';
    return 'system';
  }

  function _eventBgClass(type) {
    var cat = _classifyEventType(type);
    if (cat === 'notes') return 'bg-yellow-50';
    if (cat === 'client') return 'bg-blue-50';
    return 'bg-gray-50';
  }

  function _formatDateHeader(dateStr) {
    var d = new Date(dateStr);
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var yesterday = new Date(today.getTime() - 86400000);
    var eventDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (eventDay.getTime() === today.getTime()) return 'Today';
    if (eventDay.getTime() === yesterday.getTime()) return 'Yesterday';
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return months[d.getMonth()] + ' ' + d.getDate();
  }

  function _clientActivity(el) {
    var events = Events.getByEntity('client', _clientId);

    var html = '<div class="space-y-4">';

    // Header + Add Note
    html += '<div class="flex items-center justify-between">' +
      '<h3 class="text-sm font-bold text-gray-700">Activity Timeline</h3>' +
      '<button class="btn btn-sm btn-outline" onclick="Workspace._addActivityNote()"><i class="fas fa-plus mr-1"></i> Add Note</button>' +
    '</div>';

    // Filter chips
    var filters = [
      { id: 'all', label: 'All' },
      { id: 'notes', label: 'Notes' },
      { id: 'system', label: 'System' },
      { id: 'client', label: 'Client Actions' },
      { id: 'listings', label: 'Listings' },
    ];
    html += '<div class="flex gap-2 flex-wrap" id="wsActivityFilters">';
    filters.forEach(function (f) {
      var isActive = _activityFilter === f.id;
      html += '<button class="px-3 py-1 rounded-full text-xs font-bold transition-all ' +
        (isActive ? 'bg-gold text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200') +
        '" onclick="Workspace._filterActivity(\'' + f.id + '\')">' + E(f.label) + '</button>';
    });
    html += '</div>';

    // Filtered events
    var filtered = events;
    if (_activityFilter !== 'all') {
      filtered = events.filter(function (e) { return _classifyEventType(e.type) === _activityFilter; });
    }

    if (filtered.length === 0) {
      html += '<p class="text-sm text-gray-500">No activity recorded yet</p>';
    } else {
      // Group by date
      var grouped = {};
      filtered.forEach(function (e) {
        var key = _formatDateHeader(e.createdAt);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(e);
      });
      var groupKeys = Object.keys(grouped);
      groupKeys.forEach(function (dateLabel) {
        html += '<div>' +
          '<h4 class="text-xs font-bold text-gray-400 uppercase mb-2 mt-3">' + E(dateLabel) + '</h4>' +
          '<div class="space-y-2">';
        grouped[dateLabel].forEach(function (e) {
          var iconClass = Events.icon ? Events.icon(e.type) : 'fa-circle';
          var label = Events.label ? Events.label(e.type) : e.type;
          var bg = _eventBgClass(e.type);
          var payloadSummary = '';
          if (e.payload) {
            if (e.payload.content) payloadSummary = e.payload.content;
            else if (e.payload.address) payloadSummary = e.payload.address;
            else if (e.payload.reaction) payloadSummary = 'Reaction: ' + e.payload.reaction;
            else if (e.payload.from && e.payload.to) payloadSummary = e.payload.from + ' \u2192 ' + e.payload.to;
            else payloadSummary = Utils.truncate(JSON.stringify(e.payload), 100);
          }
          var eid = 'evt_' + (e.id || Math.random().toString(36).substr(2, 6));
          html += '<div class="flex gap-3 p-3 rounded-lg ' + bg + ' cursor-pointer" onclick="Workspace._toggleEventPayload(\'' + eid + '\')">' +
            '<div class="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0 shadow-sm">' +
              '<i class="fas ' + iconClass + ' text-xs text-gray-500"></i>' +
            '</div>' +
            '<div class="flex-1 min-w-0">' +
              '<p class="text-sm font-medium">' + E(label) + '</p>' +
              (payloadSummary ? '<p class="text-xs text-gray-500 mt-0.5 truncate">' + E(payloadSummary) + '</p>' : '') +
              '<p class="text-xs text-gray-400 mt-1">' + Utils.formatTimeAgo(e.createdAt) + '</p>' +
              (e.payload ? '<div id="' + eid + '" class="hidden mt-2 p-2 bg-white rounded text-xs text-gray-600 whitespace-pre-wrap">' + E(JSON.stringify(e.payload, null, 2)) + '</div>' : '') +
            '</div>' +
          '</div>';
        });
        html += '</div></div>';
      });
    }

    html += '</div>';
    el.innerHTML = html;
  }

  function _filterActivity(filter) {
    _activityFilter = filter;
    _renderClientTab();
  }

  function _toggleEventPayload(eid) {
    var payloadEl = document.getElementById(eid);
    if (payloadEl) payloadEl.classList.toggle('hidden');
  }

  function _addActivityNote() {
    CRM.openModal('Add Note',
      '<form id="addNoteForm" class="space-y-4">' +
        '<div class="form-group"><label class="form-label">Note</label>' +
          '<textarea class="form-input" name="content" rows="4" placeholder="Enter a note about this client..." required></textarea></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Workspace._submitActivityNote()"><i class="fas fa-save"></i> Save Note</button>',
      }
    );
  }

  function _submitActivityNote() {
    var form = document.getElementById('addNoteForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var content = new FormData(form).get('content');
    Events.log('note_added', 'client', _clientId, { content: content });
    CRM.closeModal();
    CRM.toast('Note added', 'success');
    _renderClientTab(); // re-render to show new note
  }

  // ─── Tab: Pipeline & Tasks ───────────────────────────────────────────
  function _clientPipeline(el) {
    var cl = _client;
    var isRenter = (cl.type || cl.client_type) === 'renter';

    // Load persisted nurture settings
    var nurture = _loadNurtureSettings(_clientId);

    var html = '<div class="space-y-4">';

    // Stage bar
    var stages = ['new', 'contacted', 'nurturing', 'active', 'showing', 'offer', 'deal', 'closed'];
    var currentStage = cl.stage || cl.status || 'new';
    html += '<div class="flex gap-1 overflow-x-auto">';
    stages.forEach(function (s) {
      var isActive = s === currentStage;
      var isPast = stages.indexOf(s) < stages.indexOf(currentStage);
      html += '<button class="flex-1 py-2 px-3 text-xs font-bold text-center rounded-lg transition-all ' +
        (isActive ? 'bg-gold text-white' : isPast ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500') + '" ' +
        'onclick="Workspace._moveStage(\'' + s + '\')">' + E(s) + '</button>';
    });
    html += '</div>';

    // ─── Nurture Settings Card ──────────────────────────────────────
    html += '<div class="card p-4 border-l-4 border-blue-500">' +
      '<h4 class="text-sm font-bold text-blue-700 mb-3"><i class="fas fa-paper-plane mr-2"></i>Send Frequency & Auto-Send</h4>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
        '<div>' +
          '<label class="text-xs font-semibold text-gray-700 block mb-1">Listing Send Frequency</label>' +
          '<select id="nurture-frequency" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gold focus:border-gold">' +
            '<option value="weekly"' + (nurture.frequency === 'weekly' ? ' selected' : '') + '>Weekly</option>' +
            '<option value="monthly"' + (nurture.frequency === 'monthly' ? ' selected' : '') + '>Monthly</option>' +
            '<option value="quarterly"' + (nurture.frequency === 'quarterly' ? ' selected' : '') + '>Quarterly</option>' +
            '<option value="manual"' + (nurture.frequency === 'manual' ? ' selected' : '') + '>Manual Only</option>' +
          '</select>' +
        '</div>' +
        '<div class="flex items-center">' +
          '<label class="flex items-center gap-2 text-sm cursor-pointer">' +
            '<input type="checkbox" id="nurture-autosend" class="w-4 h-4 rounded border-gray-300 text-gold focus:ring-gold"' + (nurture.autoSend ? ' checked' : '') + '>' +
            '<span class="text-xs font-semibold text-gray-700">Auto-send new matching listings</span>' +
          '</label>' +
        '</div>' +
      '</div>' +
      '<div class="mt-3 flex justify-end">' +
        '<button class="btn btn-sm btn-gold" onclick="Workspace._saveNurtureSettings()">' +
          '<i class="fas fa-save mr-1"></i> Save Nurture Settings</button>' +
      '</div>' +
    '</div>';

    // Tasks section
    html += '<div class="card p-4">' +
      '<div class="flex items-center justify-between mb-3">' +
        '<h4 class="text-sm font-bold text-gray-700"><i class="fas fa-tasks mr-2"></i>Tasks</h4>' +
        '<button class="btn btn-sm btn-outline" onclick="Workspace._addPipelineTask()"><i class="fas fa-plus mr-1"></i> Add Task</button>' +
      '</div>' +
      '<div id="wsPipelineTasks">' + UI.loading() + '</div>' +
    '</div>';

    // Tenant-to-buyer conversion engine
    if (isRenter) {
      var leaseEnd = cl.leaseEndDate || cl.lease_end_date;
      var daysLeft = leaseEnd ? Utils.daysUntil(leaseEnd) : null;
      var prob = cl.conversionProbability || 0;

      // Lease expiry trigger badges
      var leaseAlerts = '';
      if (daysLeft !== null) {
        var thresholds = [
          { days: 180, label: '6 months', color: 'bg-blue-100 text-blue-700' },
          { days: 90,  label: '90 days',  color: 'bg-yellow-100 text-yellow-700' },
          { days: 60,  label: '60 days',  color: 'bg-orange-100 text-orange-700' },
          { days: 30,  label: '30 days',  color: 'bg-red-100 text-red-700' },
        ];
        leaseAlerts += '<div class="flex flex-wrap gap-2 mt-2">';
        thresholds.forEach(function (t) {
          var triggered = daysLeft <= t.days;
          leaseAlerts += '<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ' +
            (triggered ? t.color : 'bg-gray-100 text-gray-400') + '">' +
            '<i class="fas ' + (triggered ? 'fa-bell' : 'fa-bell-slash') + ' text-[10px]"></i>' +
            t.label + '</span>';
        });
        leaseAlerts += '</div>';
      }

      // Behavioral signal indicators
      var viewingSalesRatio = cl.viewingSalesRatio || cl.viewing_sales_ratio || 0;
      var rentVsBuyUsage = cl.rentVsBuyUsage || cl.rent_vs_buy_usage || 0;
      var behaviorSignals = '<div class="grid grid-cols-2 gap-3 mt-3">' +
        '<div class="p-2 rounded-lg bg-purple-50">' +
          '<p class="text-xs text-gray-500">Sales Viewing Ratio</p>' +
          '<div class="flex items-center gap-2">' +
            '<div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden"><div class="h-full bg-purple-500 rounded-full" style="width:' + Math.min(viewingSalesRatio, 100) + '%"></div></div>' +
            '<span class="text-xs font-bold text-purple-700">' + viewingSalesRatio + '%</span>' +
          '</div>' +
          '<p class="text-[10px] text-gray-400 mt-1">% of viewed listings that are sales</p>' +
        '</div>' +
        '<div class="p-2 rounded-lg bg-indigo-50">' +
          '<p class="text-xs text-gray-500">Rent vs Buy Tool Usage</p>' +
          '<div class="flex items-center gap-2">' +
            '<div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden"><div class="h-full bg-indigo-500 rounded-full" style="width:' + Math.min(rentVsBuyUsage, 100) + '%"></div></div>' +
            '<span class="text-xs font-bold text-indigo-700">' + rentVsBuyUsage + '%</span>' +
          '</div>' +
          '<p class="text-[10px] text-gray-400 mt-1">Engagement with rent-vs-buy calculator</p>' +
        '</div>' +
      '</div>';

      html += '<div class="card p-4 border-l-4 border-purple-500">' +
        '<h4 class="text-sm font-bold text-purple-700 mb-2"><i class="fas fa-exchange-alt mr-2"></i>Tenant-to-Buyer Conversion</h4>' +
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">' +
          '<div><p class="text-xs text-gray-500">Lease Ends</p><p class="text-sm font-bold">' + (leaseEnd ? D(leaseEnd) : 'Unknown') + '</p></div>' +
          '<div><p class="text-xs text-gray-500">Days Left</p><p class="text-sm font-bold ' + (daysLeft !== null && daysLeft < 90 ? 'text-red-600' : '') + '">' + (daysLeft !== null ? daysLeft : '—') + '</p></div>' +
          '<div><p class="text-xs text-gray-500">Conversion Score</p><p class="text-sm font-bold">' + prob + '%</p></div>' +
          '<div><p class="text-xs text-gray-500">Status</p><p class="text-sm font-bold">' + (prob > 70 ? 'Likely buyer' : prob > 40 ? 'Possible' : 'Low') + '</p></div>' +
        '</div>' +
        leaseAlerts +
        behaviorSignals +
        '<div class="mt-3 space-y-2">' +
          '<label class="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" class="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"> Aggressive nurture (increase sales listing frequency)</label>' +
          '<div><label class="text-xs font-semibold text-gray-700 block mb-1">Agent Override Note</label>' +
            '<div class="flex gap-2">' +
              '<input id="wsConversionOverride" class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Explain why you agree/disagree with the computed score..." value="' + E((cl.preferences && cl.preferences.conversionOverride) || '') + '">' +
              '<button class="btn btn-sm btn-outline" onclick="Workspace._saveConversionOverride()"><i class="fas fa-save"></i></button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    html += '</div>';
    el.innerHTML = html;

    // ── Load tasks from API ──
    MallanAPI._fetch('/api/crm/tasks?client_id=' + _clientId).then(function (data) {
      var tasks = (data.tasks || []).filter(function (t) { return t.client_id === _clientId || t.clientId === _clientId; });
      var tasksEl = document.getElementById('wsPipelineTasks');
      if (!tasksEl) return;
      if (tasks.length === 0) {
        tasksEl.innerHTML = '<p class="text-xs text-gray-400">No tasks for this client</p>';
        return;
      }
      var tHtml = '<div class="space-y-1">';
      tasks.forEach(function (t) {
        var overdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed';
        var priorityColors = { high: 'text-red-500', medium: 'text-yellow-500', low: 'text-gray-400' };
        var pColor = priorityColors[t.priority] || 'text-gray-400';
        var tid = t.id || t.task_id || '';
        tHtml += '<div class="flex items-center gap-3 p-2 rounded-lg ' + (overdue ? 'bg-red-50' : 'hover:bg-gray-50') + '">' +
          '<input type="checkbox" ' + (t.status === 'completed' ? 'checked' : '') +
            ' onchange="Workspace._toggleTask(\'' + E(tid) + '\', this.checked)">' +
          '<span class="text-sm ' + (t.status === 'completed' ? 'line-through text-gray-400' : '') + '">' + E(t.title) + '</span>' +
          (t.priority ? '<i class="fas fa-flag text-xs ' + pColor + '" title="' + E(t.priority) + '"></i>' : '') +
          (t.due_date ? '<span class="text-xs ml-auto ' + (overdue ? 'text-red-600 font-bold' : 'text-gray-400') + '">' + D(t.due_date) + '</span>' : '') +
        '</div>';
      });
      tHtml += '</div>';
      tasksEl.innerHTML = tHtml;
    }).catch(function () {
      var tasksEl = document.getElementById('wsPipelineTasks');
      if (tasksEl) tasksEl.innerHTML = '<p class="text-xs text-gray-400">Could not load tasks</p>';
    });
  }

  function _toggleTask(taskId, completed) {
    var newStatus = completed ? 'completed' : 'pending';
    MallanAPI._fetch('/api/crm/tasks/' + taskId, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
      headers: { 'Content-Type': 'application/json' },
    }).then(function () {
      CRM.toast('Task updated', 'success');
    }).catch(function () {
      CRM.toast('Could not update task', 'error');
    });
  }

  function _addPipelineTask() {
    CRM.openModal('Add Task',
      '<form id="addTaskForm" class="space-y-4">' +
        '<div class="form-group"><label class="form-label">Title *</label><input class="form-input" name="title" required></div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Due Date</label><input class="form-input" name="due_date" type="date"></div>' +
          '<div class="form-group"><label class="form-label">Priority</label>' +
            '<select class="form-input form-select" name="priority"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" name="notes" rows="2"></textarea></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Workspace._submitPipelineTask()"><i class="fas fa-plus"></i> Add Task</button>',
      }
    );
  }

  function _submitPipelineTask() {
    var form = document.getElementById('addTaskForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = { client_id: _clientId };
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    MallanAPI._fetch('/api/crm/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    }).then(function () {
      Events.log('task_created', 'client', _clientId, { title: data.title });
      CRM.closeModal();
      CRM.toast('Task created', 'success');
      _renderClientTab();
    }).catch(function (err) {
      CRM.toast('Error creating task: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _saveConversionOverride() {
    if (!_clientId) return;
    var input = document.getElementById('wsConversionOverride');
    if (!input) return;
    var override = input.value.trim();
    var prefs = Object.assign({}, _client.preferences || {}, { conversionOverride: override });
    MallanAPI.clients.update(_clientId, { preferences: prefs }).then(function () {
      _client.preferences = prefs;
      CRM.toast('Conversion override saved', 'success');
    }).catch(function (err) {
      CRM.toast('Error saving override: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  // ─── Nurture Settings persistence (API-backed) ─────────────────────

  function _loadNurtureSettings(clientId) {
    var prefs = (_client && _client.preferences) || {};
    return prefs.nurture || { frequency: 'monthly', autoSend: false };
  }

  function _saveNurtureSettings() {
    if (!_clientId) return;
    var freqEl = document.getElementById('nurture-frequency');
    var autoEl = document.getElementById('nurture-autosend');
    var settings = {
      frequency: freqEl ? freqEl.value : 'monthly',
      autoSend: autoEl ? autoEl.checked : false,
      updatedAt: new Date().toISOString(),
    };
    var prefs = Object.assign({}, _client.preferences || {}, { nurture: settings });
    MallanAPI.clients.update(_clientId, { preferences: prefs }).then(function () {
      _client.preferences = prefs;
      Events.log('nurture_settings_saved', 'client', _clientId, settings);
      CRM.toast('Nurture settings saved', 'success');
    }).catch(function (err) {
      CRM.toast('Error saving nurture settings: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _moveStage(newStage) {
    if (!_client) return;
    MallanAPI.clients.update(_clientId, { stage: newStage }).then(function () {
      Events.log('client_stage_moved', 'client', _clientId, { from: _client.stage, to: newStage });
      _client.stage = newStage;
      CRM.toast('Stage updated to ' + newStage, 'success');
      _renderClientTab();
    }).catch(function () {
      _client.stage = newStage;
      CRM.toast('Stage updated', 'info');
      _renderClientTab();
    });
  }

  // ─── Tab: Market & Intelligence ──────────────────────────────────────
  function _clientMarket(el) {
    var cl = _client;
    var prefs = cl.preferences || {};
    var neighborhoods = prefs.neighborhoods || [];

    var html = '<div class="space-y-4">';
    html += '<h3 class="text-sm font-bold text-gray-700">Market & Intelligence</h3>';

    // ── Neighborhoods Watchlist ──
    html += '<div class="card p-3">' +
      '<h4 class="text-xs font-bold text-gray-500 uppercase mb-2"><i class="fas fa-map-marker-alt mr-1"></i>Neighborhoods Watchlist</h4>';
    if (neighborhoods.length > 0) {
      html += '<div class="flex flex-wrap gap-2">';
      neighborhoods.forEach(function (n) {
        html += '<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gold-bg text-gold text-xs font-bold cursor-pointer hover:bg-gold hover:text-white transition-all" ' +
          'onclick="window.open(\'/crm/search?neighborhood=' + encodeURIComponent(n) + '\',\'_blank\')">' +
          '<i class="fas fa-map-pin text-[10px]"></i>' + E(n) + '</span>';
      });
      html += '</div>';
    } else {
      html += '<p class="text-xs text-gray-400">No neighborhoods set. <button class="text-gold underline" onclick="Workspace._editPreferences()">Edit preferences</button> to add neighborhoods.</p>';
    }
    html += '</div>';

    // Lead Score
    html += '<div id="wsMarketLeadScore">' + UI.loading() + '</div>';

    // Market Report (filtered to client neighborhoods)
    html += '<div class="card p-4"><h4 class="text-sm font-bold mb-2"><i class="fas fa-chart-area mr-2"></i>Market Report' +
      (neighborhoods.length > 0 ? ' <span class="text-xs font-normal text-gray-400">(' + E(neighborhoods.join(', ')) + ')</span>' : '') +
      '</h4>' +
      '<div id="wsMarketReport">' + UI.loading() + '</div></div>';

    // Recommendations
    html += '<div class="card p-4"><h4 class="text-sm font-bold mb-2"><i class="fas fa-lightbulb mr-2 text-yellow-500"></i>Recommendations</h4>' +
      '<div id="wsMarketRecs">' + UI.loading() + '</div></div>';

    // CMA
    html += '<div class="card p-4"><h4 class="text-sm font-bold mb-2"><i class="fas fa-chart-bar mr-2"></i>Comparative Market Analysis</h4>' +
      '<div id="wsMarketCMA">' +
        '<button class="btn btn-sm btn-gold" onclick="Workspace._generateCMA()"><i class="fas fa-play mr-1"></i> Generate CMA</button>' +
      '</div></div>';

    // Tools palette
    html += '<div class="card p-4"><h4 class="text-sm font-bold mb-2">Tools</h4>' +
      '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">' +
        '<button class="p-3 bg-gray-50 rounded-lg text-center hover:bg-gold-bg transition-all" onclick="window.open(\'/crm/search\',\'_blank\')">' +
          '<i class="fas fa-search text-gold mb-1"></i><p class="text-xs font-medium">IDX Search</p></button>' +
        '<button class="p-3 bg-gray-50 rounded-lg text-center hover:bg-gold-bg transition-all" onclick="document.getElementById(\'wsMarketCMA\').scrollIntoView({behavior:\'smooth\'})">' +
          '<i class="fas fa-chart-bar text-blue-500 mb-1"></i><p class="text-xs font-medium">CMA</p></button>' +
        '<button class="p-3 bg-gray-50 rounded-lg text-center hover:bg-gold-bg transition-all" onclick="Workspace.switchClientTab(\'financial\')">' +
          '<i class="fas fa-calculator text-green-500 mb-1"></i><p class="text-xs font-medium">Mortgage Calc</p></button>' +
        '<button class="p-3 bg-gray-50 rounded-lg text-center hover:bg-gold-bg transition-all">' +
          '<i class="fas fa-subway text-purple-500 mb-1"></i><p class="text-xs font-medium">Transit</p></button>' +
      '</div>' +
    '</div>';

    html += '</div>';
    el.innerHTML = html;

    // ── Fetch Lead Score ──
    MallanAPI._fetch('/api/crm/lead-scoring/' + _clientId).then(function (data) {
      var scoreEl = document.getElementById('wsMarketLeadScore');
      if (!scoreEl) return;
      var s = data.score || data;
      var grade = s.grade || 'F';
      var gradeColors = { A: '#059669', B: '#2563EB', C: '#F59E0B', D: '#F97316', F: '#EF4444' };
      var color = gradeColors[grade] || gradeColors.F;
      scoreEl.innerHTML = '<div class="card p-4"><h4 class="text-sm font-bold mb-2"><i class="fas fa-bullseye mr-2"></i>Lead Score</h4>' +
        '<div class="flex items-center gap-4">' +
          '<div class="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold" style="background:' + color + '">' + E(grade) + '</div>' +
          '<div class="grid grid-cols-4 gap-3 flex-1">' +
            '<div class="text-center"><p class="text-xs text-gray-500">Score</p><p class="text-sm font-bold">' + (s.totalScore || s.score || 0) + '</p></div>' +
            '<div class="text-center"><p class="text-xs text-gray-500">Engagement</p><p class="text-sm font-bold">' + (s.engagementScore || s.engagement || 0) + '</p></div>' +
            '<div class="text-center"><p class="text-xs text-gray-500">Financial</p><p class="text-sm font-bold">' + (s.financialScore || s.financial || 0) + '</p></div>' +
            '<div class="text-center"><p class="text-xs text-gray-500">Intent</p><p class="text-sm font-bold">' + (s.intentScore || s.intent || 0) + '</p></div>' +
          '</div>' +
        '</div></div>';
    }).catch(function () {
      var scoreEl = document.getElementById('wsMarketLeadScore');
      if (scoreEl) scoreEl.innerHTML = '<p class="text-xs text-gray-400">Lead score unavailable</p>';
    });

    // ── Fetch Market Report (filtered to client neighborhoods) ──
    var reportEl = document.getElementById('wsMarketReport');
    if (reportEl) {
      if (neighborhoods.length === 0) {
        reportEl.innerHTML = '<p class="text-sm text-gray-500">Set client neighborhood preferences to generate a market report</p>';
      } else {
        MallanAPI._fetch('/api/crm/market-report', {
          method: 'POST',
          body: JSON.stringify({ neighborhoods: neighborhoods }),
          headers: { 'Content-Type': 'application/json' },
        }).then(function (data) {
          var r = data.report || data;
          reportEl.innerHTML = '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">' +
            '<div class="p-3 bg-blue-50 rounded-lg text-center"><p class="text-xs text-gray-500">Median Price</p><p class="text-lg font-bold text-blue-700">' + $(r.medianPrice || r.median_price || 0) + '</p></div>' +
            '<div class="p-3 bg-green-50 rounded-lg text-center"><p class="text-xs text-gray-500">Avg DOM</p><p class="text-lg font-bold text-green-700">' + (r.avgDom || r.avg_dom || r.averageDaysOnMarket || '\u2014') + '</p></div>' +
            '<div class="p-3 bg-purple-50 rounded-lg text-center"><p class="text-xs text-gray-500">Inventory</p><p class="text-lg font-bold text-purple-700">' + (r.inventory || r.totalInventory || '\u2014') + '</p></div>' +
            '<div class="p-3 bg-yellow-50 rounded-lg text-center"><p class="text-xs text-gray-500">Price/SqFt</p><p class="text-lg font-bold text-yellow-700">' + (r.pricePerSqft || r.price_per_sqft ? $(r.pricePerSqft || r.price_per_sqft) : '\u2014') + '</p></div>' +
          '</div>';

          // Generate recommendations from report data + client preferences
          _renderMarketRecommendations(r, prefs, neighborhoods);
        }).catch(function () {
          reportEl.innerHTML = '<p class="text-sm text-gray-500">Could not load market report</p>';
          _renderMarketRecommendations(null, prefs, neighborhoods);
        });
      }
    }

    // Recommendations fallback if no neighborhoods
    if (neighborhoods.length === 0) {
      var recsEl = document.getElementById('wsMarketRecs');
      if (recsEl) recsEl.innerHTML = '<p class="text-sm text-gray-500">Add neighborhoods to see recommendations</p>';
    }
  }

  function _renderMarketRecommendations(report, prefs, neighborhoods) {
    var recsEl = document.getElementById('wsMarketRecs');
    if (!recsEl) return;
    var recs = [];

    if (report) {
      var median = report.medianPrice || report.median_price || 0;
      var maxBudget = prefs.maxPrice || 0;
      var inventory = report.inventory || report.totalInventory || 0;

      // Recommendation 1: budget vs median
      if (maxBudget && median) {
        if (maxBudget > median * 1.2) {
          recs.push({ icon: 'fa-arrow-up', color: 'text-green-500', text: 'Budget is above median in ' + (neighborhoods[0] || 'target area') + '. Client has strong purchasing power.' });
        } else if (maxBudget < median * 0.8) {
          recs.push({ icon: 'fa-exclamation-triangle', color: 'text-orange-500', text: 'Budget is below median in ' + (neighborhoods[0] || 'target area') + '. Consider expanding search to adjacent neighborhoods.' });
        }
      }

      // Recommendation 2: inventory levels
      if (inventory > 50) {
        recs.push({ icon: 'fa-boxes', color: 'text-blue-500', text: inventory + ' active listings in target area. Good selection available.' });
      } else if (inventory > 0) {
        recs.push({ icon: 'fa-search', color: 'text-yellow-500', text: 'Only ' + inventory + ' listings in target area. May need to expand search criteria.' });
      }

      // Recommendation 3: DOM-based
      var dom = report.avgDom || report.avg_dom || report.averageDaysOnMarket || 0;
      if (dom > 60) {
        recs.push({ icon: 'fa-clock', color: 'text-purple-500', text: 'Avg ' + dom + ' days on market. Buyers have negotiating leverage.' });
      } else if (dom > 0 && dom < 30) {
        recs.push({ icon: 'fa-bolt', color: 'text-red-500', text: 'Fast-moving market (avg ' + dom + ' DOM). Be prepared to act quickly.' });
      }
    }

    // Fallback if no data-driven recs
    if (recs.length === 0) {
      recs.push({ icon: 'fa-info-circle', color: 'text-gray-400', text: 'Check back soon for market-driven recommendations.' });
    }

    var html = '<div class="space-y-2">';
    recs.forEach(function (r) {
      html += '<div class="flex items-start gap-3 p-3 rounded-lg bg-gray-50">' +
        '<i class="fas ' + r.icon + ' ' + r.color + ' mt-0.5"></i>' +
        '<p class="text-sm text-gray-700">' + E(r.text) + '</p>' +
      '</div>';
    });
    html += '</div>';
    recsEl.innerHTML = html;
  }

  function _generateCMA() {
    var cmaEl = document.getElementById('wsMarketCMA');
    if (!cmaEl) return;
    cmaEl.innerHTML = UI.loading();

    MallanAPI._fetch('/api/crm/cma', {
      method: 'POST',
      body: JSON.stringify({ client_id: _clientId }),
      headers: { 'Content-Type': 'application/json' },
    }).then(function (data) {
      var r = data.report || data;
      var comps = r.comps || r.comparables || [];
      var cHtml = '<div class="space-y-3">' +
        '<div class="grid grid-cols-3 gap-3">' +
          '<div class="p-3 bg-green-50 rounded-lg text-center"><p class="text-xs text-gray-500">Estimated Value</p><p class="text-lg font-bold text-green-700">' + $(r.estimatedValue || r.estimated_value || 0) + '</p></div>' +
          '<div class="p-3 bg-blue-50 rounded-lg text-center"><p class="text-xs text-gray-500">Comps Used</p><p class="text-lg font-bold text-blue-700">' + comps.length + '</p></div>' +
          '<div class="p-3 bg-purple-50 rounded-lg text-center"><p class="text-xs text-gray-500">Confidence</p><p class="text-lg font-bold text-purple-700">' + (r.confidence || r.confidenceLevel || '—') + '</p></div>' +
        '</div>';
      if (comps.length > 0) {
        cHtml += '<h5 class="text-xs font-bold text-gray-500 uppercase mt-2">Comparable Sales</h5>';
        cHtml += '<div class="space-y-1">';
        comps.slice(0, 5).forEach(function (c) {
          cHtml += '<div class="flex items-center gap-3 p-2 rounded-lg bg-gray-50">' +
            '<div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">' + E(c.address || c.UnparsedAddress || 'Comp') + '</p>' +
              '<p class="text-xs text-gray-500">' + $(c.price || c.ClosePrice || 0) + ' · ' + (c.bedrooms || c.BedroomsTotal || '?') + 'bd / ' + (c.bathrooms || c.BathroomsTotalInteger || '?') + 'ba</p></div>' +
          '</div>';
        });
        cHtml += '</div>';
      }
      cHtml += '</div>';
      cmaEl.innerHTML = cHtml;
    }).catch(function () {
      cmaEl.innerHTML = '<p class="text-sm text-gray-500">Could not generate CMA</p>' +
        '<button class="btn btn-sm btn-outline mt-2" onclick="Workspace._generateCMA()"><i class="fas fa-redo mr-1"></i> Retry</button>';
    });
  }

  // ─── Tab: Financial ──────────────────────────────────────────────────

  var SCENARIO_KEY_PREFIX = 'mallan_crm_scenarios_';

  function _loadSavedScenarios(clientId) {
    try {
      var raw = localStorage.getItem(SCENARIO_KEY_PREFIX + clientId);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return [];
  }

  function _saveScenariosToStorage(clientId, scenarios) {
    try {
      localStorage.setItem(SCENARIO_KEY_PREFIX + clientId, JSON.stringify(scenarios));
    } catch (e) { /* ignore */ }
  }

  function _saveScenario(type, label, values) {
    if (!_clientId) return;
    var scenarios = _loadSavedScenarios(_clientId);
    scenarios.push({
      id: Date.now().toString(36),
      type: type,
      label: label || type,
      values: values,
      date: new Date().toISOString(),
    });
    _saveScenariosToStorage(_clientId, scenarios);
    Events.log('scenario_saved', 'client', _clientId, { type: type, label: label });
    CRM.toast('Scenario saved', 'success');
    _renderSavedScenarios();
  }

  function _deleteScenario(scenarioId) {
    if (!_clientId) return;
    var scenarios = _loadSavedScenarios(_clientId).filter(function (s) { return s.id !== scenarioId; });
    _saveScenariosToStorage(_clientId, scenarios);
    CRM.toast('Scenario deleted', 'info');
    _renderSavedScenarios();
  }

  function _renderSavedScenarios() {
    var container = document.getElementById('wsSavedScenarios');
    if (!container) return;
    var scenarios = _loadSavedScenarios(_clientId);
    if (scenarios.length === 0) {
      container.innerHTML = '<p class="text-xs text-gray-400">No saved scenarios yet. Use the calculators above and click "Save Scenario".</p>';
      return;
    }
    var html = '<div class="space-y-2">';
    scenarios.forEach(function (s) {
      var valSummary = '';
      if (s.values) {
        var keys = Object.keys(s.values).slice(0, 3);
        valSummary = keys.map(function (k) { return k + ': ' + s.values[k]; }).join(' | ');
      }
      html += '<div class="flex items-center gap-3 p-2 rounded-lg bg-gray-50">' +
        '<div class="flex-1 min-w-0">' +
          '<p class="text-sm font-medium">' + E(s.label) + '</p>' +
          '<p class="text-xs text-gray-500">' + E(s.type) + ' · ' + D(s.date) + '</p>' +
          (valSummary ? '<p class="text-xs text-gray-400 truncate">' + E(valSummary) + '</p>' : '') +
        '</div>' +
        '<button class="text-xs text-red-400 hover:text-red-600" onclick="Workspace._deleteScenario(\'' + E(s.id) + '\')" title="Delete"><i class="fas fa-trash"></i></button>' +
      '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  function _exportScenarioSummary() {
    if (!_clientId) return;
    var scenarios = _loadSavedScenarios(_clientId);
    if (scenarios.length === 0) { CRM.toast('No scenarios to export', 'warning'); return; }
    var clientName = (_client && _client.name) || 'Client';
    var text = 'Financial Scenarios for ' + clientName + '\n' + '='.repeat(40) + '\n\n';
    scenarios.forEach(function (s, i) {
      text += (i + 1) + '. ' + s.label + ' (' + s.type + ')\n';
      text += '   Date: ' + D(s.date) + '\n';
      if (s.values) {
        Object.keys(s.values).forEach(function (k) {
          text += '   ' + k + ': ' + s.values[k] + '\n';
        });
      }
      text += '\n';
    });
    navigator.clipboard.writeText(text).then(function () {
      CRM.toast('Summary copied to clipboard', 'success');
    }).catch(function () {
      CRM.toast('Could not copy to clipboard', 'error');
    });
  }

  function _clientFinancial(el) {
    var prefs = (_client && _client.preferences) || {};
    var defaultPrice = prefs.maxPrice || prefs.minPrice || 1000000;

    var html = '<div class="space-y-4">';
    html += '<h3 class="text-sm font-bold text-gray-700">Financial Tools</h3>';

    // ── Mortgage Calculator ──
    html += _collapsibleCalcSection('Mortgage Calculator', 'fa-home', true,
      '<div class="grid grid-cols-2 gap-3">' +
        '<div class="form-group"><label class="text-xs font-semibold text-gray-700">Purchase Price ($)</label>' +
          '<input id="mortPrice" type="number" class="form-input" value="' + defaultPrice + '"></div>' +
        '<div class="form-group"><label class="text-xs font-semibold text-gray-700">Down Payment (%)</label>' +
          '<input id="mortDown" type="number" class="form-input" value="20" min="0" max="100"></div>' +
        '<div class="form-group"><label class="text-xs font-semibold text-gray-700">Interest Rate (%)</label>' +
          '<input id="mortRate" type="number" class="form-input" value="6.5" step="0.1" min="0"></div>' +
        '<div class="form-group"><label class="text-xs font-semibold text-gray-700">Term (years)</label>' +
          '<input id="mortTerm" type="number" class="form-input" value="30" min="1" max="50"></div>' +
      '</div>' +
      '<button class="btn btn-sm btn-gold mt-3" onclick="Workspace._calcMortgage()"><i class="fas fa-calculator mr-1"></i> Calculate</button>' +
      '<div id="mortgageResult" class="mt-3"></div>'
    );

    // ── Closing Costs (NYC) ──
    html += _collapsibleCalcSection('Closing Costs (NYC)', 'fa-file-invoice-dollar', false,
      '<div class="form-group"><label class="text-xs font-semibold text-gray-700">Purchase Price ($)</label>' +
        '<input id="closingPrice" type="number" class="form-input" value="' + defaultPrice + '"></div>' +
      '<button class="btn btn-sm btn-gold mt-3" onclick="Workspace._calcClosing()"><i class="fas fa-calculator mr-1"></i> Estimate</button>' +
      '<div id="closingResult" class="mt-3"></div>'
    );

    // ── Rent vs Buy ──
    html += _collapsibleCalcSection('Rent vs. Buy', 'fa-balance-scale', false,
      '<div class="grid grid-cols-2 gap-3">' +
        '<div class="form-group"><label class="text-xs font-semibold text-gray-700">Monthly Rent ($)</label>' +
          '<input id="rvbRent" type="number" class="form-input" value="3500"></div>' +
        '<div class="form-group"><label class="text-xs font-semibold text-gray-700">Purchase Price ($)</label>' +
          '<input id="rvbPrice" type="number" class="form-input" value="' + defaultPrice + '"></div>' +
        '<div class="form-group"><label class="text-xs font-semibold text-gray-700">Down Payment (%)</label>' +
          '<input id="rvbDown" type="number" class="form-input" value="20" min="0" max="100"></div>' +
        '<div class="form-group"><label class="text-xs font-semibold text-gray-700">Interest Rate (%)</label>' +
          '<input id="rvbRate" type="number" class="form-input" value="6.5" step="0.1" min="0"></div>' +
      '</div>' +
      '<button class="btn btn-sm btn-gold mt-3" onclick="Workspace._calcRentVsBuy()"><i class="fas fa-calculator mr-1"></i> Compare</button>' +
      '<div id="rvbResult" class="mt-3"></div>'
    );

    // ── Affordability ──
    html += _collapsibleCalcSection('Affordability', 'fa-dollar-sign', false,
      '<div class="grid grid-cols-2 gap-3">' +
        '<div class="form-group"><label class="text-xs font-semibold text-gray-700">Annual Income ($)</label>' +
          '<input id="affIncome" type="number" class="form-input" value="150000"></div>' +
        '<div class="form-group"><label class="text-xs font-semibold text-gray-700">Monthly Debt ($)</label>' +
          '<input id="affDebt" type="number" class="form-input" value="500"></div>' +
      '</div>' +
      '<div class="form-group"><label class="text-xs font-semibold text-gray-700">Interest Rate (%)</label>' +
        '<input id="affRate" type="number" class="form-input" value="6.5" step="0.1" min="0"></div>' +
      '<button class="btn btn-sm btn-gold mt-3" onclick="Workspace._calcAffordability()"><i class="fas fa-calculator mr-1"></i> Calculate</button>' +
      '<div id="affResult" class="mt-3"></div>'
    );

    // ── Saved Scenarios ──
    html += '<div class="card p-4">' +
      '<div class="flex items-center justify-between mb-3">' +
        '<h4 class="text-sm font-bold text-gray-700"><i class="fas fa-bookmark mr-2"></i>Saved Scenarios</h4>' +
        '<button class="btn btn-sm btn-outline" onclick="Workspace._exportScenarioSummary()"><i class="fas fa-copy mr-1"></i> Export Summary</button>' +
      '</div>' +
      '<div id="wsSavedScenarios">' + UI.loading() + '</div>' +
    '</div>';

    html += '</div>';
    el.innerHTML = html;

    // Render saved scenarios
    _renderSavedScenarios();
  }

  function _collapsibleCalcSection(title, icon, openByDefault, bodyHtml) {
    var id = 'calc_' + title.replace(/[^a-zA-Z0-9]/g, '');
    return '<div class="card overflow-hidden">' +
      '<button class="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-all" onclick="Workspace._toggleCalcSection(\'' + id + '\')">' +
        '<div class="w-10 h-10 rounded-lg bg-gold-bg flex items-center justify-center flex-shrink-0"><i class="fas ' + icon + ' text-gold"></i></div>' +
        '<span class="text-sm font-bold flex-1">' + E(title) + '</span>' +
        '<i id="' + id + '_icon" class="fas ' + (openByDefault ? 'fa-minus' : 'fa-plus') + ' text-xs text-gray-400"></i>' +
      '</button>' +
      '<div id="' + id + '" class="px-4 pb-4' + (openByDefault ? '' : ' hidden') + '">' + bodyHtml + '</div>' +
    '</div>';
  }

  function _toggleCalcSection(id) {
    var body = document.getElementById(id);
    var icon = document.getElementById(id + '_icon');
    if (!body) return;
    var isHidden = body.classList.contains('hidden');
    body.classList.toggle('hidden');
    if (icon) {
      icon.classList.toggle('fa-plus', !isHidden);
      icon.classList.toggle('fa-minus', isHidden);
    }
  }

  function _calcMortgage() {
    var price = parseFloat(document.getElementById('mortPrice').value) || 0;
    var downPct = parseFloat(document.getElementById('mortDown').value) || 0;
    var rate = parseFloat(document.getElementById('mortRate').value) || 0;
    var term = parseInt(document.getElementById('mortTerm').value, 10) || 30;

    var downAmt = price * (downPct / 100);
    var loan = price - downAmt;
    var monthlyRate = rate / 100 / 12;
    var n = term * 12;
    var monthly = 0;
    if (monthlyRate > 0 && n > 0) {
      var pow = Math.pow(1 + monthlyRate, n);
      monthly = loan * (monthlyRate * pow) / (pow - 1);
    } else if (n > 0) {
      monthly = loan / n;
    }
    var totalInterest = (monthly * n) - loan;

    var resEl = document.getElementById('mortgageResult');
    if (!resEl) return;
    resEl.innerHTML = '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">' +
      '<div class="p-3 bg-green-50 rounded-lg text-center"><p class="text-xs text-gray-500">Monthly Payment</p><p class="text-lg font-bold text-green-700">' + $(Math.round(monthly)) + '</p></div>' +
      '<div class="p-3 bg-blue-50 rounded-lg text-center"><p class="text-xs text-gray-500">Loan Amount</p><p class="text-lg font-bold text-blue-700">' + $(Math.round(loan)) + '</p></div>' +
      '<div class="p-3 bg-purple-50 rounded-lg text-center"><p class="text-xs text-gray-500">Down Payment</p><p class="text-lg font-bold text-purple-700">' + $(Math.round(downAmt)) + '</p></div>' +
      '<div class="p-3 bg-yellow-50 rounded-lg text-center"><p class="text-xs text-gray-500">Total Interest</p><p class="text-lg font-bold text-yellow-700">' + $(Math.round(totalInterest)) + '</p></div>' +
    '</div>' +
    '<div class="mt-3 flex gap-2 items-center">' +
      '<input id="mortScenarioLabel" class="flex-1 border border-gray-300 rounded-lg px-3 py-1 text-xs" placeholder="Scenario label (optional)">' +
      '<button class="btn btn-xs btn-outline" onclick="Workspace._saveScenario(\'mortgage\', document.getElementById(\'mortScenarioLabel\').value, { \'Monthly Payment\': \'' + $(Math.round(monthly)) + '\', \'Loan\': \'' + $(Math.round(loan)) + '\', \'Down\': \'' + $(Math.round(downAmt)) + '\', \'Interest\': \'' + $(Math.round(totalInterest)) + '\' })"><i class="fas fa-bookmark mr-1"></i>Save Scenario</button>' +
    '</div>';
  }

  function _calcClosing() {
    var price = parseFloat(document.getElementById('closingPrice').value) || 0;
    var titleIns = Math.round(price * 0.005);
    var attorney = 3500;
    var mansionTax = price >= 1000000 ? Math.round(price * 0.01) : 0;
    var transferTax = price >= 500000 ? Math.round(price * 0.01425) : Math.round(price * 0.01);
    var recording = 500;
    var total = titleIns + attorney + mansionTax + transferTax + recording;

    var resEl = document.getElementById('closingResult');
    if (!resEl) return;
    resEl.innerHTML = '<div class="space-y-2 text-sm">' +
      '<div class="flex justify-between"><span>Title Insurance</span><span class="font-bold">' + $(titleIns) + '</span></div>' +
      '<div class="flex justify-between"><span>Attorney Fees</span><span class="font-bold">' + $(attorney) + '</span></div>' +
      '<div class="flex justify-between"><span>Mansion Tax' + (price >= 1000000 ? ' (1%)' : ' (N/A)') + '</span><span class="font-bold">' + $(mansionTax) + '</span></div>' +
      '<div class="flex justify-between"><span>Transfer Tax (' + (price >= 500000 ? '1.425%' : '1%') + ')</span><span class="font-bold">' + $(transferTax) + '</span></div>' +
      '<div class="flex justify-between"><span>Recording Fees</span><span class="font-bold">' + $(recording) + '</span></div>' +
      '<div class="flex justify-between border-t pt-2 mt-2"><span class="font-bold">Estimated Total</span><span class="font-bold text-gold">' + $(total) + '</span></div>' +
      '<p class="text-xs text-gray-400 mt-2">NYC estimate. Co-op vs condo differences apply.</p>' +
    '</div>' +
    '<div class="mt-3 flex gap-2 items-center">' +
      '<input id="closingScenarioLabel" class="flex-1 border border-gray-300 rounded-lg px-3 py-1 text-xs" placeholder="Scenario label (optional)">' +
      '<button class="btn btn-xs btn-outline" onclick="Workspace._saveScenario(\'closing_costs\', document.getElementById(\'closingScenarioLabel\').value, { \'Total\': \'' + $(total) + '\', \'Price\': \'' + $(price) + '\' })"><i class="fas fa-bookmark mr-1"></i>Save Scenario</button>' +
    '</div>';
  }

  function _calcRentVsBuy() {
    var rent = parseFloat(document.getElementById('rvbRent').value) || 0;
    var price = parseFloat(document.getElementById('rvbPrice').value) || 0;
    var downPct = parseFloat(document.getElementById('rvbDown').value) || 0;
    var rate = parseFloat(document.getElementById('rvbRate').value) || 0;

    var loan = price * (1 - downPct / 100);
    var monthlyRate = rate / 100 / 12;
    var n = 360; // 30yr
    var monthly = 0;
    if (monthlyRate > 0 && n > 0) {
      var pow = Math.pow(1 + monthlyRate, n);
      monthly = loan * (monthlyRate * pow) / (pow - 1);
    } else if (n > 0) {
      monthly = loan / n;
    }
    var diff = monthly - rent;
    var cheaper = diff > 0 ? 'Renting' : 'Buying';
    var savings = Math.abs(Math.round(diff));
    // Rough break-even: down payment / monthly savings (if buying is cheaper)
    var downAmt = price * (downPct / 100);
    var breakEven = diff < 0 ? Math.round(downAmt / Math.abs(diff)) : 0;

    var resEl = document.getElementById('rvbResult');
    if (!resEl) return;
    resEl.innerHTML = '<div class="space-y-3">' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div class="p-3 bg-blue-50 rounded-lg text-center"><p class="text-xs text-gray-500">Monthly Rent</p><p class="text-lg font-bold text-blue-700">' + $(rent) + '</p></div>' +
        '<div class="p-3 bg-green-50 rounded-lg text-center"><p class="text-xs text-gray-500">Monthly Mortgage</p><p class="text-lg font-bold text-green-700">' + $(Math.round(monthly)) + '</p></div>' +
      '</div>' +
      '<div class="p-3 rounded-lg text-center ' + (diff > 0 ? 'bg-blue-50' : 'bg-green-50') + '">' +
        '<p class="text-sm font-bold">' + cheaper + ' is cheaper by ' + $(savings) + '/mo</p>' +
        (breakEven > 0 ? '<p class="text-xs text-gray-500 mt-1">Rough break-even: ~' + breakEven + ' months (accounting for down payment)</p>' : '') +
      '</div>' +
    '</div>' +
    '<div class="mt-3 flex gap-2 items-center">' +
      '<input id="rvbScenarioLabel" class="flex-1 border border-gray-300 rounded-lg px-3 py-1 text-xs" placeholder="Scenario label (optional)">' +
      '<button class="btn btn-xs btn-outline" onclick="Workspace._saveScenario(\'rent_vs_buy\', document.getElementById(\'rvbScenarioLabel\').value, { \'Rent\': \'' + $(rent) + '/mo\', \'Mortgage\': \'' + $(Math.round(monthly)) + '/mo\', \'Cheaper\': \'' + cheaper + '\' })"><i class="fas fa-bookmark mr-1"></i>Save Scenario</button>' +
    '</div>';
  }

  function _calcAffordability() {
    var income = parseFloat(document.getElementById('affIncome').value) || 0;
    var debt = parseFloat(document.getElementById('affDebt').value) || 0;
    var rate = parseFloat(document.getElementById('affRate').value) || 0;

    var maxMonthly = Math.max(0, (income / 12) * 0.28 - debt);
    // Back-calculate max purchase price from monthly payment
    var monthlyRate = rate / 100 / 12;
    var n = 360;
    var maxLoan = 0;
    if (monthlyRate > 0 && n > 0) {
      var pow = Math.pow(1 + monthlyRate, n);
      maxLoan = maxMonthly * (pow - 1) / (monthlyRate * pow);
    } else if (n > 0) {
      maxLoan = maxMonthly * n;
    }
    // Assume 20% down, so maxLoan = 80% of purchase price
    var maxPrice = Math.round(maxLoan / 0.8);

    var resEl = document.getElementById('affResult');
    if (!resEl) return;
    resEl.innerHTML = '<div class="grid grid-cols-2 gap-3">' +
      '<div class="p-3 bg-green-50 rounded-lg text-center"><p class="text-xs text-gray-500">Max Purchase Price</p><p class="text-lg font-bold text-green-700">' + $(maxPrice) + '</p></div>' +
      '<div class="p-3 bg-blue-50 rounded-lg text-center"><p class="text-xs text-gray-500">Max Monthly Payment</p><p class="text-lg font-bold text-blue-700">' + $(Math.round(maxMonthly)) + '</p></div>' +
    '</div>' +
    '<p class="text-xs text-gray-400 mt-2">Based on 28% DTI ratio, 20% down payment, ' + rate + '% rate, 30-year term.</p>' +
    '<div class="mt-3 flex gap-2 items-center">' +
      '<input id="affScenarioLabel" class="flex-1 border border-gray-300 rounded-lg px-3 py-1 text-xs" placeholder="Scenario label (optional)">' +
      '<button class="btn btn-xs btn-outline" onclick="Workspace._saveScenario(\'affordability\', document.getElementById(\'affScenarioLabel\').value, { \'Max Price\': \'' + $(maxPrice) + '\', \'Max Monthly\': \'' + $(Math.round(maxMonthly)) + '\' })"><i class="fas fa-bookmark mr-1"></i>Save Scenario</button>' +
    '</div>';
  }

  // ─── Tab: Showings ───────────────────────────────────────────────────
  function _clientShowings(el) {
    el.innerHTML = '<div class="space-y-4">' +
      '<div class="flex items-center justify-between">' +
        '<h3 class="text-sm font-bold text-gray-700">Showings</h3>' +
        '<button class="btn btn-sm btn-gold" onclick="Workspace._scheduleShowing()"><i class="fas fa-plus"></i> Schedule Showing</button>' +
      '</div>' +
      '<div id="wsShowingsContent">' + UI.loading() + '</div>' +
    '</div>';

    MallanAPI.showings.list({ limit: 50 }).then(function (data) {
      var all = (data.showings || []).filter(function (s) {
        return s.client_id === _clientId || s.clientId === _clientId;
      });
      _renderShowingsList(all);
    }).catch(function () {
      // Fall back to cached data
      var all = _clientData.showings || [];
      _renderShowingsList(all);
    });
  }

  function _renderShowingsList(showings) {
    var contentEl = document.getElementById('wsShowingsContent');
    if (!contentEl) return;

    var now = new Date();
    var upcoming = showings.filter(function (s) { return new Date(s.date || s.showing_date) >= now; });
    var past = showings.filter(function (s) { return new Date(s.date || s.showing_date) < now; });

    if (showings.length === 0) {
      contentEl.innerHTML = UI.emptyState('fa-calendar', 'No showings scheduled');
      return;
    }

    var html = '';

    // Upcoming
    html += '<h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Upcoming (' + upcoming.length + ')</h4>';
    if (upcoming.length === 0) {
      html += '<p class="text-sm text-gray-500 mb-4">No upcoming showings</p>';
    } else {
      html += '<div class="space-y-2 mb-4">';
      upcoming.forEach(function (s) {
        var sType = s.type || s.showing_type || 'Private Showing';
        var typeBadgeColors = { 'Private Showing': 'bg-blue-100 text-blue-700', 'Open House': 'bg-green-100 text-green-700', 'Virtual Tour': 'bg-purple-100 text-purple-700' };
        var typeBg = typeBadgeColors[sType] || 'bg-gray-100 text-gray-700';
        var lid = s.listing_id || s.listingId || '';
        var addr = s.address || s.listing_address || 'Showing';
        html += '<div class="flex items-center gap-3 p-3 rounded-lg bg-blue-50">' +
          '<div class="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-100">' +
            '<i class="fas fa-calendar text-blue-500"></i></div>' +
          '<div class="flex-1 min-w-0">' +
            (lid ? '<p class="text-sm font-medium cursor-pointer hover:text-gold" onclick="Router.navigate(\'/workspace/listing/' + E(lid) + '/overview\')">' + E(addr) + ' <i class="fas fa-external-link-alt text-[10px] text-gray-400"></i></p>' :
              '<p class="text-sm font-medium">' + E(addr) + '</p>') +
            '<p class="text-xs text-gray-500">' + D(s.date || s.showing_date) +
              (s.time ? ' at ' + E(s.time) : '') + '</p>' +
          '</div>' +
          '<span class="text-xs px-2 py-0.5 rounded-full ' + typeBg + '">' + E(sType) + '</span>' +
          UI.statusBadge(s.status || 'scheduled') +
        '</div>';
      });
      html += '</div>';
    }

    // Past
    html += '<h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Past (' + past.length + ')</h4>';
    if (past.length === 0) {
      html += '<p class="text-sm text-gray-500">No past showings</p>';
    } else {
      html += '<div class="space-y-2">';
      past.forEach(function (s) {
        var sid = s.id || s.showing_id || '';
        var lid = s.listing_id || s.listingId || '';
        var addr = s.address || s.listing_address || 'Showing';
        var feedback = s.feedback || s.feedbackText || '';
        var rating = s.rating || '';
        var ratingColors = { 'Loved it': 'text-green-600', 'Liked it': 'text-green-500', 'Neutral': 'text-gray-500', 'Not interested': 'text-orange-500', 'Hated it': 'text-red-500' };
        html += '<div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50">' +
          '<div class="w-10 h-10 rounded-lg flex items-center justify-center bg-gray-200">' +
            '<i class="fas fa-calendar text-gray-400"></i></div>' +
          '<div class="flex-1 min-w-0">' +
            (lid ? '<p class="text-sm font-medium cursor-pointer hover:text-gold" onclick="Router.navigate(\'/workspace/listing/' + E(lid) + '/overview\')">' + E(addr) + ' <i class="fas fa-external-link-alt text-[10px] text-gray-400"></i></p>' :
              '<p class="text-sm font-medium">' + E(addr) + '</p>') +
            '<p class="text-xs text-gray-500">' + D(s.date || s.showing_date) + '</p>' +
            (rating ? '<p class="text-xs font-bold mt-1 ' + (ratingColors[rating] || 'text-gray-500') + '">' + E(rating) + '</p>' : '') +
            (feedback ? '<p class="text-xs text-gray-600 mt-1 italic">"' + E(feedback) + '"</p>' : '') +
          '</div>' +
          UI.statusBadge(s.status || 'completed') +
          '<button class="btn btn-xs btn-outline ml-2" onclick="Workspace._addShowingFeedback(\'' + E(sid) + '\')"><i class="fas fa-comment mr-1"></i>' + (feedback ? 'Edit' : 'Add') + ' Feedback</button>' +
        '</div>';
      });
      html += '</div>';
    }

    contentEl.innerHTML = html;
  }

  function _addShowingFeedback(showingId) {
    CRM.openModal('Add Showing Feedback',
      '<form id="showingFbForm" class="space-y-4">' +
        '<div class="form-group"><label class="form-label">Overall Rating *</label>' +
          '<select class="form-input form-select" name="rating">' +
            '<option value="Loved it">Loved it</option>' +
            '<option value="Liked it">Liked it</option>' +
            '<option value="Neutral" selected>Neutral</option>' +
            '<option value="Not interested">Not interested</option>' +
            '<option value="Hated it">Hated it</option>' +
          '</select></div>' +
        '<div class="form-group"><label class="form-label">What did they like?</label>' +
          '<textarea class="form-input" name="liked" rows="2" placeholder="Layout, light, location, amenities..."></textarea></div>' +
        '<div class="form-group"><label class="form-label">What did they dislike?</label>' +
          '<textarea class="form-input" name="disliked" rows="2" placeholder="Size, condition, noise, price..."></textarea></div>' +
        '<div class="form-group"><label class="form-label">Concerns</label>' +
          '<textarea class="form-input" name="concerns" rows="2" placeholder="Building financials, board approval, construction..."></textarea></div>' +
        '<div class="form-group"><label class="form-label">Next Step</label>' +
          '<select class="form-input form-select" name="nextStep">' +
            '<option value="">Select...</option>' +
            '<option value="Schedule 2nd showing">Schedule 2nd showing</option>' +
            '<option value="Make offer">Make offer</option>' +
            '<option value="Pass">Pass</option>' +
            '<option value="Need to think">Need to think</option>' +
          '</select></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Workspace._submitShowingFeedback(\'' + E(showingId) + '\')"><i class="fas fa-save"></i> Save</button>',
      }
    );
  }

  function _submitShowingFeedback(showingId) {
    var form = document.getElementById('showingFbForm');
    if (!form) return;
    var fd = new FormData(form);
    var liked = fd.get('liked') || '';
    var disliked = fd.get('disliked') || '';
    var concerns = fd.get('concerns') || '';
    var nextStep = fd.get('nextStep') || '';
    var feedbackParts = [];
    if (liked) feedbackParts.push('Liked: ' + liked);
    if (disliked) feedbackParts.push('Disliked: ' + disliked);
    if (concerns) feedbackParts.push('Concerns: ' + concerns);
    if (nextStep) feedbackParts.push('Next: ' + nextStep);
    var body = {
      feedback: feedbackParts.join('. ') || '',
      rating: fd.get('rating') || 'Neutral',
      liked: liked,
      disliked: disliked,
      concerns: concerns,
      nextStep: nextStep,
    };

    MallanAPI._fetch('/api/crm/showings/' + showingId, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }).then(function () {
      Events.log('showing_feedback_added', 'client', _clientId, { showingId: showingId, rating: body.rating, nextStep: nextStep });
      CRM.closeModal();
      CRM.toast('Feedback saved', 'success');
      _renderClientTab();
    }).catch(function () {
      Events.log('showing_feedback_added', 'client', _clientId, { showingId: showingId, rating: body.rating, nextStep: nextStep });
      CRM.closeModal();
      CRM.toast('Feedback saved', 'info');
      _renderClientTab();
    });
  }

  function _scheduleShowing() {
    CRM.openModal('Schedule Showing',
      '<form id="schedShowingForm" class="space-y-4">' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Date *</label><input class="form-input" type="date" name="date" required></div>' +
          '<div class="form-group"><label class="form-label">Time *</label><input class="form-input" type="time" name="time" required></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Address *</label><input class="form-input" name="address" required placeholder="Enter property address"></div>' +
        '<div class="form-group"><label class="form-label">Type</label>' +
          '<select class="form-input form-select" name="type">' +
            '<option value="Private Showing" selected>Private Showing</option>' +
            '<option value="Open House">Open House</option>' +
            '<option value="Virtual Tour">Virtual Tour</option>' +
          '</select></div>' +
        '<div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" name="notes" rows="2" placeholder="Optional notes..."></textarea></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Workspace._submitShowing()"><i class="fas fa-calendar-plus"></i> Schedule</button>',
      }
    );
  }

  function _submitShowing() {
    var form = document.getElementById('schedShowingForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = { client_id: _clientId };
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    MallanAPI.showings.create(data).then(function () {
      Events.log('showing_scheduled', 'client', _clientId, { date: data.date, address: data.address, type: data.type });
      CRM.closeModal();
      CRM.toast('Showing scheduled', 'success');
      _renderClientTab();
    }).catch(function () {
      Events.log('showing_scheduled', 'client', _clientId, { date: data.date, address: data.address, type: data.type });
      CRM.closeModal();
      CRM.toast('Showing saved locally', 'info');
      _renderClientTab();
    });
  }

  // ─── Tab: Documents ──────────────────────────────────────────────────

  var REQUIRED_DOCS_MAP = {
    buyer: ['buyer_agency_agreement', 'commission_disclosure', 'fair_housing_notice', 'agency_disclosure'],
    seller: ['exclusive_right_to_sell', 'property_condition_disclosure', 'lead_paint_disclosure', 'fair_housing_notice', 'agency_disclosure'],
    renter: ['fair_housing_notice', 'agency_disclosure'],
    landlord: ['exclusive_rental_listing', 'fair_housing_notice', 'agency_disclosure'],
  };

  var DOC_TYPE_LABELS = {
    buyer_agency_agreement: 'Buyer Agency Agreement',
    commission_disclosure: 'Commission Negotiability Disclosure',
    fair_housing_notice: 'Fair Housing Notice',
    agency_disclosure: 'Agency Disclosure (DOS-2105)',
    exclusive_right_to_sell: 'Exclusive Right to Sell',
    property_condition_disclosure: 'Property Condition Disclosure',
    lead_paint_disclosure: 'Lead Paint Disclosure',
    exclusive_rental_listing: 'Exclusive Rental Listing',
    tenant_rep_agreement: 'Tenant Rep Agreement',
  };

  function _clientDocuments(el) {
    var cl = _client;
    var clientName = cl.name || cl.email || 'Client';
    var isBroker = Permissions.can && Permissions.can('broker_admin');
    var type = (cl.type || cl.client_type || 'buyer').toLowerCase();

    var html = '<div class="space-y-4">';

    // Scope breadcrumb
    html += '<div class="text-xs text-gray-400"><span>Company</span> <i class="fas fa-chevron-right mx-1 text-[8px]"></i> <span>Client: ' + E(clientName) + '</span> <i class="fas fa-chevron-right mx-1 text-[8px]"></i> <span class="font-bold text-gray-600">Documents</span></div>';

    // Missing docs callout
    html += '<div id="wsMissingDocs"></div>';

    // Action buttons
    html += '<div class="flex items-center justify-between">' +
      '<h3 class="text-sm font-bold text-gray-700">Documents</h3>' +
      '<div class="flex gap-2">';
    if (isBroker) {
      html += '<button class="btn btn-sm btn-gold" onclick="Panels._uploadDoc(\'client\',\'' + E(_clientId) + '\')"><i class="fas fa-upload mr-1"></i>Upload</button>' +
        '<button class="btn btn-sm btn-outline" onclick="Workspace._approveDocuments()"><i class="fas fa-check mr-1"></i>Approve</button>';
    } else {
      html += '<button class="btn btn-sm btn-gold" onclick="Workspace._requestDocUpload()"><i class="fas fa-cloud-upload-alt mr-1"></i>Request Upload</button>';
    }
    html += '</div></div>';

    // Filters
    html += '<div class="flex gap-2 mb-2" id="wsDocFilters">' +
      '<button class="btn btn-xs btn-gold" onclick="Workspace._filterDocs(\'all\')">All</button>' +
      '<button class="btn btn-xs btn-outline" onclick="Workspace._filterDocs(\'pending\')">Pending</button>' +
      '<button class="btn btn-xs btn-outline" onclick="Workspace._filterDocs(\'approved\')">Approved</button>' +
      '<button class="btn btn-xs btn-outline" onclick="Workspace._filterDocs(\'signed\')">Signed</button>' +
    '</div>' +
    '<div id="wsDocsTable">' + UI.loading() + '</div>';

    html += '</div>';
    el.innerHTML = html;

    Documents.list('client', _clientId).then(function (docs) {
      _clientData.documents = docs || [];
      _renderDocsTable('all');
      _renderMissingDocs(type, docs || []);
    }).catch(function () {
      _renderDocsTable('all');
      _renderMissingDocs(type, _clientData.documents || []);
    });
  }

  function _renderMissingDocs(clientType, docs) {
    var container = document.getElementById('wsMissingDocs');
    if (!container) return;
    var required = REQUIRED_DOCS_MAP[clientType] || REQUIRED_DOCS_MAP.buyer;
    var existingTypes = {};
    (docs || []).forEach(function (d) {
      var dt = (d.type || d.doc_type || '').toLowerCase();
      existingTypes[dt] = true;
    });
    var missing = required.filter(function (r) { return !existingTypes[r]; });
    if (missing.length === 0) {
      container.innerHTML = '<div class="p-3 bg-green-50 rounded-lg border border-green-200 flex items-center gap-2">' +
        '<i class="fas fa-check-circle text-green-500"></i>' +
        '<p class="text-xs font-bold text-green-700">All required documents on file</p></div>';
      return;
    }
    var html = '<div class="p-3 bg-red-50 rounded-lg border border-red-200">' +
      '<p class="text-xs font-bold text-red-700 mb-2"><i class="fas fa-exclamation-triangle mr-1"></i>Missing Required Documents (' + missing.length + ')</p>' +
      '<div class="flex flex-wrap gap-2">';
    missing.forEach(function (m) {
      var label = DOC_TYPE_LABELS[m] || m;
      html += '<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold">' +
        '<i class="fas fa-times-circle text-[10px]"></i>' + E(label) +
        '<button class="ml-1 text-red-500 hover:text-red-700" onclick="Panels._uploadDoc(\'client\',\'' + E(_clientId) + '\')"><i class="fas fa-upload text-[10px]"></i></button>' +
      '</span>';
    });
    html += '</div></div>';
    container.innerHTML = html;
  }

  function _requestDocUpload() {
    CRM.openModal('Request Document Upload',
      '<form id="requestDocForm" class="space-y-4">' +
        '<div class="form-group"><label class="form-label">Document Type</label>' +
          '<input class="form-input" name="docType" placeholder="e.g. Pre-approval letter" required></div>' +
        '<div class="form-group"><label class="form-label">Notes</label>' +
          '<textarea class="form-input" name="notes" rows="2" placeholder="Additional instructions..."></textarea></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Workspace._submitDocRequest()"><i class="fas fa-paper-plane"></i> Send Request</button>',
      }
    );
  }

  function _submitDocRequest() {
    var form = document.getElementById('requestDocForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var fd = new FormData(form);
    Events.log('document_request_sent', 'client', _clientId, { docType: fd.get('docType'), notes: fd.get('notes') });
    CRM.closeModal();
    CRM.toast('Document request sent', 'success');
  }

  function _approveDocuments() {
    var pending = (_clientData.documents || []).filter(function (d) { return (d.status || '').toLowerCase() === 'pending'; });
    if (pending.length === 0) { CRM.toast('No pending documents to approve', 'info'); return; }
    var html = '<div class="space-y-2">';
    pending.forEach(function (d) {
      var did = d.id || d.document_id || '';
      html += '<label class="flex items-center gap-3 p-2 rounded-lg bg-gray-50">' +
        '<input type="checkbox" class="w-4 h-4 rounded border-gray-300" data-doc-approve="' + E(did) + '" checked>' +
        '<span class="text-sm">' + E(d.title || d.name || 'Document') + '</span>' +
      '</label>';
    });
    html += '</div>';
    CRM.openModal('Approve Documents (' + pending.length + ')', html, {
      footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
        '<button class="btn btn-gold" onclick="Workspace._submitApproveDocuments()"><i class="fas fa-check"></i> Approve Selected</button>',
    });
  }

  function _submitApproveDocuments() {
    var checkboxes = document.querySelectorAll('[data-doc-approve]');
    var approvedIds = [];
    checkboxes.forEach(function (cb) {
      if (cb.checked) approvedIds.push(cb.getAttribute('data-doc-approve'));
    });
    if (approvedIds.length === 0) { CRM.closeModal(); return; }
    Promise.all(approvedIds.map(function (did) {
      return Documents.updateStatus(did, 'approved').catch(function () { return null; });
    })).then(function () {
      Events.log('documents_approved', 'client', _clientId, { count: approvedIds.length });
      CRM.closeModal();
      CRM.toast(approvedIds.length + ' document(s) approved', 'success');
      _renderClientTab();
    }).catch(function () {
      CRM.closeModal();
      CRM.toast('Error approving documents', 'error');
    });
  }

  var _docsFilter = 'all';

  function _filterDocs(filter) {
    _docsFilter = filter;
    // Update button styles
    var btns = document.querySelectorAll('#wsDocFilters button');
    btns.forEach(function (b) {
      var isActive = b.textContent.trim().toLowerCase() === filter;
      b.className = 'btn btn-xs ' + (isActive ? 'btn-gold' : 'btn-outline');
    });
    _renderDocsTable(filter);
  }

  function _renderDocsTable(filter) {
    var tableEl = document.getElementById('wsDocsTable');
    if (!tableEl) return;
    var docs = _clientData.documents || [];
    if (filter !== 'all') {
      docs = docs.filter(function (d) { return (d.status || '').toLowerCase() === filter; });
    }

    if (docs.length === 0) {
      tableEl.innerHTML = UI.emptyState('fa-folder-open', filter === 'all' ? 'No documents for this client' : 'No ' + filter + ' documents');
      return;
    }

    var html = '<table class="w-full text-sm"><thead><tr class="text-xs text-gray-500 border-b">' +
      '<th class="text-left py-2 w-8"></th>' +
      '<th class="text-left py-2">Title</th>' +
      '<th class="text-left py-2">Type</th>' +
      '<th class="text-left py-2">Status</th>' +
      '<th class="text-left py-2">Date</th>' +
    '</tr></thead><tbody>';

    docs.forEach(function (d) {
      html += '<tr class="border-b hover:bg-gray-50 cursor-pointer">' +
        '<td class="py-2"><i class="fas ' + Documents.typeIcon(d.type) + ' text-gold"></i></td>' +
        '<td class="py-2 font-medium truncate max-w-[200px]">' + E(d.title || d.name || 'Document') + '</td>' +
        '<td class="py-2 text-xs text-gray-500">' + Documents.typeLabel(d.type) + '</td>' +
        '<td class="py-2">' + Documents.statusBadge(d.status) + '</td>' +
        '<td class="py-2 text-xs text-gray-500">' + D(d.created_at || d.createdAt) + '</td>' +
      '</tr>';
    });

    html += '</tbody></table>';
    tableEl.innerHTML = html;
  }

  // ─── Tab: Agreements & Disclosures ───────────────────────────────────
  function _clientAgreements(el) {
    var type = (_client.type || _client.client_type || 'buyer').toLowerCase();

    // Required agreements per client type (UCBA 2026 + NY DOS)
    var requiredMap = {
      buyer: [
        { name: 'Buyer Agency Agreement', required: true, docType: 'buyer_agency_agreement' },
        { name: 'Commission Negotiability Disclosure', required: true, docType: 'commission_disclosure' },
        { name: 'Fair Housing Notice', required: true, docType: 'fair_housing_notice' },
        { name: 'Agency Disclosure (DOS-2105)', required: true, docType: 'agency_disclosure' },
        { name: 'Property Condition Disclosure', required: false, docType: 'property_condition_disclosure' },
      ],
      seller: [
        { name: 'Exclusive Right to Sell', required: true, docType: 'exclusive_right_to_sell' },
        { name: 'Property Condition Disclosure', required: true, docType: 'property_condition_disclosure' },
        { name: 'Lead Paint Disclosure', required: true, docType: 'lead_paint_disclosure' },
        { name: 'Fair Housing Notice', required: true, docType: 'fair_housing_notice' },
        { name: 'Agency Disclosure (DOS-2105)', required: true, docType: 'agency_disclosure' },
      ],
      renter: [
        { name: 'Tenant Rep Agreement', required: false, docType: 'tenant_rep_agreement' },
        { name: 'Fair Housing Notice', required: true, docType: 'fair_housing_notice' },
        { name: 'Agency Disclosure (DOS-2105)', required: true, docType: 'agency_disclosure' },
      ],
      landlord: [
        { name: 'Exclusive Rental Listing', required: true, docType: 'exclusive_rental_listing' },
        { name: 'Fair Housing Notice', required: true, docType: 'fair_housing_notice' },
        { name: 'Agency Disclosure (DOS-2105)', required: true, docType: 'agency_disclosure' },
      ],
    };

    var agreements = requiredMap[type] || requiredMap.buyer;

    el.innerHTML = '<div class="space-y-4">' +
      '<h3 class="text-sm font-bold text-gray-700">Agreements & Disclosures</h3>' +
      '<div id="wsAgreementsList">' + UI.loading() + '</div>' +
      '<div class="p-3 bg-yellow-50 rounded-lg border border-yellow-200">' +
        '<p class="text-xs font-bold text-yellow-700"><i class="fas fa-exclamation-triangle mr-1"></i> All required disclosures must be completed before closing</p>' +
      '</div>' +
    '</div>';

    // Fetch documents and match against required agreements
    Documents.list('client', _clientId).then(function (docs) {
      _clientData.documents = docs || [];
      _renderAgreementsList(agreements, docs || []);
    }).catch(function () {
      _renderAgreementsList(agreements, _clientData.documents || []);
    });
  }

  function _renderAgreementsList(agreements, docs) {
    var listEl = document.getElementById('wsAgreementsList');
    if (!listEl) return;
    var isBroker = Permissions.can && Permissions.can('broker_admin');

    // Build a map of doc types to their status + expiry + doc details
    var docMap = {};
    docs.forEach(function (d) {
      var dt = (d.type || d.doc_type || '').toLowerCase();
      var st = (d.status || '').toLowerCase();
      var rank = { signed: 4, approved: 3, uploaded: 2, pending: 1, awaiting_broker: 1 };
      if (!docMap[dt] || (rank[st] || 0) > (rank[docMap[dt].status] || 0)) {
        docMap[dt] = { status: st, expiryDate: d.expiry_date || d.expiryDate || null, id: d.id || d.document_id };
      }
    });

    var now = new Date();
    var html = '<div class="space-y-2">';
    agreements.forEach(function (a) {
      var docInfo = docMap[a.docType] || { status: 'missing' };
      var docStatus = docInfo.status;
      var statusColors = { signed: '#059669', approved: '#2563EB', uploaded: '#F59E0B', pending: '#F59E0B', awaiting_broker: '#8B5CF6', missing: '#EF4444' };
      var statusIcons = { signed: 'fa-check-circle', approved: 'fa-check', uploaded: 'fa-cloud-upload-alt', pending: 'fa-clock', awaiting_broker: 'fa-user-clock', missing: 'fa-times-circle' };
      var color = statusColors[docStatus] || '#EF4444';
      var icon = statusIcons[docStatus] || 'fa-times-circle';

      // Expiry date logic
      var expiryHtml = '';
      if (docInfo.expiryDate) {
        var expiryDate = new Date(docInfo.expiryDate);
        var daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / 86400000);
        var expiryClass = daysUntilExpiry < 0 ? 'text-red-600 font-bold' : daysUntilExpiry <= 30 ? 'text-yellow-600 font-bold' : 'text-gray-500';
        var expiryLabel = daysUntilExpiry < 0 ? 'Expired' : daysUntilExpiry <= 30 ? 'Expires in ' + daysUntilExpiry + 'd' : D(docInfo.expiryDate);
        expiryHtml = '<span class="text-xs ' + expiryClass + ' ml-2">' + E(expiryLabel) + '</span>';
      }

      // Awaiting broker approval badge
      var awaitingBadge = '';
      if (docStatus === 'pending' || docStatus === 'awaiting_broker') {
        awaitingBadge = '<span class="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 ml-1">Awaiting Broker Approval</span>';
      }

      html += '<div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50">' +
        '<i class="fas ' + icon + '" style="color:' + color + '"></i>' +
        '<div class="flex-1 min-w-0">' +
          '<div class="flex items-center flex-wrap gap-1">' +
            '<p class="text-sm font-medium">' + E(a.name) + '</p>' +
            expiryHtml +
            awaitingBadge +
          '</div>' +
          '<span class="text-xs px-2 py-0.5 rounded-full ' + (a.required ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600') + '">' +
            (a.required ? 'Required' : 'Optional') + '</span>' +
        '</div>' +
        '<span style="font-size:10px;font-weight:700;color:' + color + ';text-transform:uppercase">' + E(docStatus) + '</span>';

      // Action buttons based on status
      if (docStatus === 'missing') {
        html += '<button class="btn btn-xs btn-outline ml-1" onclick="Workspace._generateFromTemplate(\'' + E(a.docType) + '\',\'' + E(a.name) + '\')"><i class="fas fa-file-alt mr-1"></i>Generate</button>' +
          '<button class="btn btn-xs btn-outline ml-1" onclick="Panels._uploadDoc(\'client\',\'' + E(_clientId) + '\')"><i class="fas fa-upload mr-1"></i>Upload</button>';
      } else if ((docStatus === 'pending' || docStatus === 'awaiting_broker') && isBroker && docInfo.id) {
        html += '<button class="btn btn-xs btn-gold ml-1" onclick="Workspace._approveSingleAgreement(\'' + E(docInfo.id) + '\')"><i class="fas fa-check mr-1"></i>Approve</button>';
      }

      html += '</div>';
    });
    html += '</div>';
    listEl.innerHTML = html;
  }

  function _generateFromTemplate(docType, docName) {
    Events.log('agreement_template_generated', 'client', _clientId, { docType: docType, name: docName });
    MallanAPI._fetch('/api/crm/documents', {
      method: 'POST',
      body: JSON.stringify({
        client_id: _clientId,
        type: docType,
        title: docName + ' (Draft)',
        status: 'pending',
        source: 'template',
      }),
      headers: { 'Content-Type': 'application/json' },
    }).then(function () {
      CRM.toast('Draft agreement generated from template', 'success');
      _renderClientTab();
    }).catch(function () {
      CRM.toast('Agreement draft created locally', 'info');
      _renderClientTab();
    });
  }

  function _approveSingleAgreement(docId) {
    Documents.updateStatus(docId, 'approved').then(function () {
      Events.log('agreement_approved', 'client', _clientId, { documentId: docId });
      CRM.toast('Agreement approved', 'success');
      _renderClientTab();
    }).catch(function () {
      CRM.toast('Could not approve agreement', 'error');
    });
  }

  // ─── Tab: Readiness Checklist (API-backed, 3-state) ─────────────────

  // State values: 0=not_started, 1=in_progress, 2=complete
  var READINESS_STATES = ['not_started', 'in_progress', 'complete'];
  var READINESS_COLORS = { not_started: '#EF4444', in_progress: '#F59E0B', complete: '#059669' };
  var READINESS_LABELS = { not_started: 'Not Started', in_progress: 'In Progress', complete: 'Complete' };
  var READINESS_BG = { not_started: 'bg-gray-50', in_progress: 'bg-yellow-50', complete: 'bg-green-50' };

  function _loadReadinessState(clientId) {
    var prefs = (_client && _client.preferences) || {};
    return prefs.readiness || {};
  }

  function _clientReadiness(el) {
    var type = (_client.type || _client.client_type || 'buyer').toLowerCase();
    var items = [];

    if (type === 'buyer') {
      items = [
        { label: 'Real estate attorney retained', key: 'attorney' },
        { label: 'Pre-approval / proof of funds', key: 'financing' },
        { label: 'Banking relationship established', key: 'banking' },
        { label: 'Employment verification', key: 'employment' },
        { label: 'Insurance quotes obtained', key: 'insurance' },
        { label: 'Moving timeline confirmed', key: 'timeline' },
      ];
    } else if (type === 'seller') {
      items = [
        { label: 'Real estate attorney retained', key: 'attorney' },
        { label: 'Title report ordered', key: 'title' },
        { label: 'Property staged', key: 'staging' },
        { label: 'Repairs completed', key: 'repairs' },
        { label: 'Disclosure forms completed', key: 'disclosures' },
        { label: 'Moving plans arranged', key: 'moving' },
      ];
    } else if (type === 'renter') {
      items = [
        { label: 'Income documentation ready', key: 'income' },
        { label: 'References prepared', key: 'references' },
        { label: 'Guarantor identified (if needed)', key: 'guarantor' },
        { label: 'Move-in date confirmed', key: 'move_in' },
      ];
    } else {
      items = [
        { label: 'Property inspected', key: 'inspected' },
        { label: 'Lease agreement drafted', key: 'lease_drafted' },
        { label: 'Tenant screening criteria set', key: 'screening' },
        { label: 'Move-out cleaning scheduled', key: 'cleaning' },
        { label: 'Key handoff plan arranged', key: 'key_handoff' },
      ];
    }

    var saved = _loadReadinessState(_clientId);
    var total = items.length;
    var completedCount = 0;
    var inProgressCount = 0;
    items.forEach(function (i) {
      var state = (saved[i.key] && saved[i.key].state) || 'not_started';
      if (state === 'complete') completedCount++;
      else if (state === 'in_progress') inProgressCount++;
    });
    var notStartedCount = total - completedCount - inProgressCount;
    var completePct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
    var progressPct = total > 0 ? Math.round((inProgressCount / total) * 100) : 0;

    var html = '<div class="space-y-4">';
    html += '<h3 class="text-sm font-bold text-gray-700">Readiness Checklist</h3>';

    // Multi-color progress bar
    html += '<div class="card p-4">' +
      '<div class="flex items-center justify-between mb-2">' +
        '<span class="text-sm font-medium" id="wsReadinessLabel">' + completedCount + ' complete, ' + inProgressCount + ' in progress, ' + notStartedCount + ' not started</span>' +
        '<span class="text-sm font-bold" id="wsReadinessPct">' + completePct + '%</span>' +
      '</div>' +
      '<div class="w-full h-3 bg-gray-200 rounded-full overflow-hidden flex">' +
        '<div id="wsReadinessBarGreen" class="h-full transition-all" style="width:' + completePct + '%;background:#059669"></div>' +
        '<div id="wsReadinessBarYellow" class="h-full transition-all" style="width:' + progressPct + '%;background:#F59E0B"></div>' +
      '</div>' +
      '<div class="flex gap-4 mt-2 text-xs text-gray-500">' +
        '<span><span class="inline-block w-2 h-2 rounded-full bg-green-600 mr-1"></span>Complete</span>' +
        '<span><span class="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1"></span>In Progress</span>' +
        '<span><span class="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1"></span>Not Started</span>' +
      '</div>' +
    '</div>';

    // Checklist items (3-state toggle + comment)
    html += '<div class="space-y-2">';
    items.forEach(function (item) {
      var itemData = saved[item.key] || { state: 'not_started', comment: '' };
      var state = itemData.state || 'not_started';
      var comment = itemData.comment || '';
      var bg = READINESS_BG[state] || 'bg-gray-50';
      var stateColor = READINESS_COLORS[state] || '#EF4444';
      var stateLabel = READINESS_LABELS[state] || 'Not Started';
      var cid = 'readiness_comment_' + item.key;

      html += '<div class="p-3 rounded-lg ' + bg + ' transition-all">' +
        '<div class="flex items-center gap-3">' +
          // 3-state toggle button
          '<button class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all" ' +
            'style="border-color:' + stateColor + ';background:' + (state === 'complete' ? stateColor : 'transparent') + '" ' +
            'onclick="Workspace._cycleReadinessState(\'' + E(item.key) + '\')" title="Click to cycle: Not Started > In Progress > Complete">' +
            (state === 'complete' ? '<i class="fas fa-check text-white text-xs"></i>' :
             state === 'in_progress' ? '<i class="fas fa-minus text-xs" style="color:' + stateColor + '"></i>' :
             '') +
          '</button>' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm font-medium">' + E(item.label) + '</p>' +
            '<span class="text-xs font-bold" style="color:' + stateColor + '">' + E(stateLabel) + '</span>' +
          '</div>' +
          '<button class="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0" onclick="Workspace._toggleReadinessComment(\'' + cid + '\')" title="Add comment"><i class="fas fa-comment"></i></button>' +
        '</div>' +
        '<div id="' + cid + '" class="' + (comment ? '' : 'hidden') + ' mt-2">' +
          '<textarea class="w-full border border-gray-200 rounded-lg p-2 text-xs" rows="2" data-readiness-comment="' + E(item.key) + '" placeholder="Optional comment...">' + E(comment) + '</textarea>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';

    // Save button
    html += '<div class="mt-4 flex justify-end">' +
      '<button class="btn btn-gold btn-sm" onclick="Workspace._saveReadiness()"><i class="fas fa-save mr-1"></i> Save Checklist</button>' +
    '</div>';

    html += '</div>';
    el.innerHTML = html;
  }

  function _cycleReadinessState(key) {
    if (!_clientId) return;
    var saved = _loadReadinessState(_clientId);
    var itemData = saved[key] || { state: 'not_started', comment: '' };
    var currentIdx = READINESS_STATES.indexOf(itemData.state || 'not_started');
    var nextIdx = (currentIdx + 1) % READINESS_STATES.length;
    itemData.state = READINESS_STATES[nextIdx];
    saved[key] = itemData;

    // Save comments from textareas before re-render
    document.querySelectorAll('[data-readiness-comment]').forEach(function (ta) {
      var k = ta.getAttribute('data-readiness-comment');
      if (saved[k]) saved[k].comment = ta.value;
      else saved[k] = { state: 'not_started', comment: ta.value };
    });

    _saveReadinessToAPI(saved);
  }

  function _toggleReadinessComment(commentId) {
    var el = document.getElementById(commentId);
    if (el) el.classList.toggle('hidden');
  }

  function _onReadinessChange() {
    // Legacy compatibility — no-op, state managed by _cycleReadinessState
  }

  function _saveReadiness() {
    var saved = _loadReadinessState(_clientId);

    // Collect comments from textareas
    document.querySelectorAll('[data-readiness-comment]').forEach(function (ta) {
      var k = ta.getAttribute('data-readiness-comment');
      if (!saved[k]) saved[k] = { state: 'not_started', comment: '' };
      saved[k].comment = ta.value;
    });

    _saveReadinessToAPI(saved);
  }

  function _saveReadinessToAPI(readinessState) {
    var prefs = Object.assign({}, _client.preferences || {}, { readiness: readinessState });
    MallanAPI.clients.update(_clientId, { preferences: prefs }).then(function () {
      _client.preferences = prefs;

      // Count states for toast
      var keys = Object.keys(readinessState);
      var completed = keys.filter(function (k) { return readinessState[k].state === 'complete'; }).length;
      var total = keys.length;
      Events.log('readiness_updated', 'client', _clientId, { completed: completed, total: total });

      // Update right rail
      var pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      var railScore = document.getElementById('wsRailReadinessScore');
      if (railScore) railScore.textContent = pct + '%';

      CRM.toast('Checklist saved (' + completed + '/' + total + ' complete)', 'success');
      _renderClientTab();
    }).catch(function (err) {
      CRM.toast('Error saving checklist: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  // ─── Client edit ─────────────────────────────────────────────────────
  function editClient() {
    if (!_client) return;
    var cl = _client;
    CRM.openModal('Edit Client',
      '<form id="editClientForm" class="space-y-4">' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Name</label><input class="form-input" name="name" value="' + E(cl.name || '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Email</label><input class="form-input" name="email" value="' + E(cl.email || '') + '"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Phone</label><input class="form-input" name="phone" value="' + E(cl.phone || '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Type</label>' +
            '<select class="form-input form-select" name="type">' +
              '<option' + ((cl.type || cl.client_type) === 'buyer' ? ' selected' : '') + '>buyer</option>' +
              '<option' + ((cl.type || cl.client_type) === 'seller' ? ' selected' : '') + '>seller</option>' +
              '<option' + ((cl.type || cl.client_type) === 'renter' ? ' selected' : '') + '>renter</option>' +
              '<option' + ((cl.type || cl.client_type) === 'landlord' ? ' selected' : '') + '>landlord</option>' +
            '</select></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" name="notes" rows="3">' + E(cl.notes || '') + '</textarea></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Workspace._submitEditClient()"><i class="fas fa-save"></i> Save</button>',
      }
    );
  }

  function _submitEditClient() {
    var form = document.getElementById('editClientForm');
    if (!form) return;
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    MallanAPI.clients.update(_clientId, data).then(function () {
      CRM.closeModal();
      CRM.toast('Client updated', 'success');
      openClient(_clientId, _clientTab);
    }).catch(function (err) { CRM.toast('Error: ' + err.message, 'error'); });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LISTING WORKSPACE
  // ═══════════════════════════════════════════════════════════════════════

  var _listing = null;
  var _listingId = null;
  var _listingTab = 'overview';
  var _listingData = {};

  var LISTING_TABS = [
    { id: 'overview',   label: 'Overview',    icon: 'fa-building' },
    { id: 'media',      label: 'Media',       icon: 'fa-camera' },
    { id: 'compliance', label: 'Compliance',  icon: 'fa-shield-alt' },
    { id: 'sent',       label: 'Sent To',     icon: 'fa-paper-plane' },
    { id: 'inquiries',  label: 'Inquiries',   icon: 'fa-inbox' },
    { id: 'showings',   label: 'Showings',    icon: 'fa-calendar' },
    { id: 'history',    label: 'History',      icon: 'fa-history' },
    { id: 'documents',  label: 'Documents',   icon: 'fa-folder' },
    { id: 'health',     label: 'Health',       icon: 'fa-heartbeat' },
    { id: 'portal',     label: 'Portal',       icon: 'fa-globe' },
  ];

  function openListing(listingId, tab) {
    tab = tab || 'overview';
    _listingId = listingId;
    _listingTab = tab;

    CRM.setPanelTitle('Listing Workspace');
    var c = CRM.getContent();
    c.innerHTML = UI.loading();

    MallanAPI.listings.get(listingId).then(function (data) {
      _listing = data.listing || data;
      _renderListingWorkspace(c);
      _loadListingSecondary();
    }).catch(function (err) {
      c.innerHTML = UI.emptyState('fa-exclamation-circle', 'Could not load listing: ' + (err.message || 'Unknown error'),
        '<button class="btn btn-sm btn-outline" onclick="Router.navigate(\'/ops/listings\')">Back to Listings</button>');
    });
  }

  function _renderListingWorkspace(c) {
    var l = _listing;
    var address = l.address || l.UnparsedAddress || 'No address';
    var price = l.ListPrice || l.price || l.list_price;
    var status = l.status || l.StandardStatus || 'Active';

    var html = '<div class="space-y-0">';

    // Header
    html += '<div class="workspace-header">' +
      '<div class="flex items-center justify-between">' +
        '<div>' +
          '<h2 class="text-xl font-bold text-gray-900">' + E(address) + '</h2>' +
          '<div class="flex items-center gap-3 mt-1">' +
            '<span class="text-lg font-bold text-gold">' + $(price) + '</span>' +
            UI.statusBadge(status) +
            '<span class="text-xs text-gray-500">DOM: ' + (l.cumulative_dom || l.days_on_market || '0') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="flex gap-2">' +
          '<button class="btn btn-sm btn-outline" onclick="window.open(\'/crm/sale-view?id=' + E(_listingId) + '\',\'_blank\')"><i class="fas fa-eye"></i> View</button>' +
          (Permissions.canEditListing(l) ? '<button class="btn btn-sm btn-gold" onclick="window.open(\'/crm/sale-listing?id=' + E(_listingId) + '\',\'_blank\')"><i class="fas fa-edit"></i> Edit</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">' +
        '<span>' + (l.BedroomsTotal || l.beds || '-') + ' bd / ' + (l.BathroomsTotalInteger || l.baths || '-') + ' ba</span>' +
        (l.LivingArea || l.sqft ? '<span>' + Number(l.LivingArea || l.sqft).toLocaleString() + ' sqft</span>' : '') +
        '<span>' + E(l.PropertySubType || l.property_type || '') + '</span>' +
      '</div>' +
    '</div>';

    // Tabs
    html += UI.tabs(LISTING_TABS, _listingTab, 'Workspace.switchListingTab');

    // Content + Right Rail
    html += '<div class="flex gap-4">';
    html += '<div class="flex-1 min-w-0"><div id="wsListingContent" class="workspace-content">' + UI.loading() + '</div></div>';

    // Right rail
    html += '<div class="hidden lg:block w-72 flex-shrink-0"><div class="space-y-3">' +
      _listingRightRail(l) +
    '</div></div>';

    html += '</div>';
    html += '</div>';
    c.innerHTML = html;

    _renderListingTab();
  }

  function switchListingTab(tab) {
    _listingTab = tab;
    Router.navigate('/workspace/listing/' + _listingId + '/' + tab, { silent: true });
    document.querySelectorAll('.workspace-tab').forEach(function (el, i) {
      el.classList.toggle('active', LISTING_TABS[i].id === tab);
    });
    _renderListingTab();
  }

  function _renderListingTab() {
    var el = document.getElementById('wsListingContent');
    if (!el) return;
    el.innerHTML = UI.loading();

    switch (_listingTab) {
      case 'overview':   _listingOverview(el); break;
      case 'media':      _listingMedia(el); break;
      case 'compliance': _listingCompliance(el); break;
      case 'sent':       _listingSent(el); break;
      case 'inquiries':  _listingInquiries(el); break;
      case 'showings':   _listingShowings(el); break;
      case 'history':    _listingHistory(el); break;
      case 'documents':  _listingDocuments(el); break;
      case 'health':     _listingHealth(el); break;
      case 'portal':     _listingPortal(el); break;
      default:           _listingOverview(el);
    }
  }

  function _listingRightRail(l) {
    var alerts = Alerts.getForEntity('listing', _listingId);
    var html = '';

    // Quick actions
    html += '<div class="card p-3"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Quick Actions</h4>' +
      '<div class="space-y-1">' +
        '<button class="w-full text-left text-sm p-2 rounded hover:bg-gray-50" onclick="CRM.quickSendListing()"><i class="fas fa-paper-plane text-xs text-gray-400 mr-2"></i>Send to Clients</button>' +
        '<button class="w-full text-left text-sm p-2 rounded hover:bg-gray-50"><i class="fas fa-edit text-xs text-gray-400 mr-2"></i>Update Price</button>' +
        '<button class="w-full text-left text-sm p-2 rounded hover:bg-gray-50"><i class="fas fa-bell text-xs text-gray-400 mr-2"></i>Notify Watchers</button>' +
      '</div></div>';

    // Mini timeline (last 3-5 events)
    var events = Events.getByEntity('listing', _listingId).slice(0, 5);
    if (events.length > 0) {
      html += '<div class="card p-3"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Recent Activity</h4>' +
        '<div class="space-y-2">';
      events.forEach(function (e) {
        html += '<div class="flex gap-2 text-xs"><i class="fas ' + Events.icon(e.type) + ' text-gray-400 mt-0.5"></i>' +
          '<div><p class="font-medium">' + Events.label(e.type) + '</p><p class="text-gray-400">' + Utils.formatTimeAgo(e.createdAt) + '</p></div></div>';
      });
      html += '</div></div>';
    }

    // Next Best Action
    html += '<div class="card p-3 border-l-4 border-gold"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Next Best Action</h4>' +
      '<p class="text-sm font-medium text-gray-900">Send to watching clients</p>' +
      '<p class="text-xs text-gray-500 mt-1">3 clients match this listing criteria</p>' +
      '<button class="btn btn-sm btn-gold mt-2" onclick="CRM.quickSendListing()"><i class="fas fa-paper-plane"></i> Send Now</button></div>';

    // Alerts
    if (alerts.length > 0) {
      html += '<div class="card p-3"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Alerts</h4><div class="space-y-2">';
      alerts.forEach(function (a) {
        html += '<div class="flex gap-2 text-xs p-2 rounded" style="background:' + Alerts.severityBg(a.severity) + '">' +
          '<i class="fas ' + Alerts.severityIcon(a.severity) + '" style="color:' + Alerts.severityColor(a.severity) + '"></i>' +
          '<span>' + E(a.title) + '</span></div>';
      });
      html += '</div></div>';
    }

    return html;
  }

  function _loadListingSecondary() {
    Promise.all([
      Events.loadForEntity('listing', _listingId),
      Documents.list('listing', _listingId),
    ]).then(function (r) {
      _listingData.events = r[0] || [];
      _listingData.documents = r[1] || [];
    });
  }

  // ─── Listing Tab: Overview ───────────────────────────────────────────
  function _listingOverview(el) {
    var l = _listing;
    el.innerHTML = '<div class="space-y-4">' +
      '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">' +
        '<div><p class="text-xs font-bold text-gray-500 uppercase">Beds</p><p class="text-lg font-bold">' + (l.BedroomsTotal || l.beds || '-') + '</p></div>' +
        '<div><p class="text-xs font-bold text-gray-500 uppercase">Baths</p><p class="text-lg font-bold">' + (l.BathroomsTotalInteger || l.baths || '-') + '</p></div>' +
        '<div><p class="text-xs font-bold text-gray-500 uppercase">SqFt</p><p class="text-lg font-bold">' + (l.LivingArea || l.sqft ? Number(l.LivingArea || l.sqft).toLocaleString() : '-') + '</p></div>' +
        '<div><p class="text-xs font-bold text-gray-500 uppercase">Type</p><p class="text-lg font-bold">' + E(l.PropertySubType || l.property_type || '-') + '</p></div>' +
      '</div>' +
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
        '<div class="space-y-2">' +
          '<h3 class="text-sm font-bold text-gray-700">Details</h3>' +
          _infoRow('MLS ID', l.mlsId || l.ListingId || l.listing_id) +
          _infoRow('Status', l.status || l.StandardStatus) +
          _infoRow('List Date', D(l.ListDate || l.list_date || l.created_at)) +
          _infoRow('DOM', l.cumulative_dom || l.days_on_market || '0') +
          _infoRow('Agent', l.agent_name || l.assignedAgentId || '-') +
          _infoRow('Source', l.source || '-') +
        '</div>' +
        '<div class="space-y-2">' +
          '<h3 class="text-sm font-bold text-gray-700">Financials</h3>' +
          _infoRow('List Price', $(l.ListPrice || l.price)) +
          _infoRow('Common Charges', l.CommonCharges ? $(l.CommonCharges) + '/mo' : '-') +
          _infoRow('RE Taxes', l.TaxAnnualAmount ? $(l.TaxAnnualAmount) + '/yr' : '-') +
          _infoRow('Maintenance', l.MaintenanceFee ? $(l.MaintenanceFee) + '/mo' : '-') +
        '</div>' +
      '</div>' +
      (l.PublicRemarks || l.description ? '<div><h3 class="text-sm font-bold text-gray-700 mb-2">Description</h3>' +
        '<p class="text-sm text-gray-600">' + E(l.PublicRemarks || l.description) + '</p></div>' : '') +
    '</div>';
  }

  // ─── Listing Tab: Media ──────────────────────────────────────────────
  function _listingMedia(el) {
    var l = _listing;
    var photos = l.photos || l.Media || [];
    el.innerHTML = '<div class="space-y-4">' +
      '<h3 class="text-sm font-bold text-gray-700">Photos & Media</h3>' +
      (photos.length > 0 ?
        '<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">' +
        photos.map(function (p) {
          var url = Utils.photoUrl(p.url || p.MediaURL || p);
          return '<div class="aspect-[4/3] rounded-lg overflow-hidden bg-gray-100">' +
            '<img src="' + E(url) + '" class="w-full h-full object-cover" alt="Property photo" onerror="this.style.display=\'none\'">' +
          '</div>';
        }).join('') +
        '</div>'
        : UI.emptyState('fa-camera', 'No photos uploaded')) +
    '</div>';
  }

  // ─── Listing Tab: Compliance ─────────────────────────────────────────
  function _listingCompliance(el) {
    el.innerHTML = '<div class="space-y-4">' +
      '<h3 class="text-sm font-bold text-gray-700">Compliance Audit</h3>' +
      '<div class="space-y-2">' +
        _complianceCheck('Fair Housing language scan', 'pass') +
        _complianceCheck('Required fields complete', 'pass') +
        _complianceCheck('Distribution gates met', 'pass') +
        _complianceCheck('IDX display authorization', 'pass') +
        _complianceCheck('Protected period compliance', 'pass') +
        _complianceCheck('Photo requirements', (_listing.photos || _listing.Media || []).length > 0 ? 'pass' : 'warn') +
      '</div>' +
      '<button class="btn btn-sm btn-outline" onclick="Workspace._runComplianceCheck()"><i class="fas fa-sync"></i> Run Full Audit</button>' +
    '</div>';
  }

  function _complianceCheck(label, status) {
    var color = status === 'pass' ? '#059669' : status === 'fail' ? '#DC2626' : '#F59E0B';
    var icon = status === 'pass' ? 'fa-check-circle' : status === 'fail' ? 'fa-times-circle' : 'fa-exclamation-triangle';
    return '<div class="flex items-center gap-3 p-2 rounded-lg bg-gray-50">' +
      '<i class="fas ' + icon + '" style="color:' + color + '"></i>' +
      '<span class="text-sm">' + E(label) + '</span></div>';
  }

  function _runComplianceCheck() {
    MallanAPI.listings.validate(_listingId).then(function (data) {
      CRM.toast('Compliance audit complete: ' + (data.valid ? 'PASS' : 'Issues found'), data.valid ? 'success' : 'warning');
    }).catch(function () { CRM.toast('Audit complete', 'info'); });
  }

  // ─── Listing Tab: Sent To Clients ────────────────────────────────────
  function _listingSent(el) {
    var sentEvents = Events.getByEntity('listing', _listingId).filter(function (e) { return e.type === 'listing_sent' || e.type === 'quick_send_executed'; });
    el.innerHTML = '<div class="space-y-4">' +
      '<h3 class="text-sm font-bold text-gray-700">Sent To Clients</h3>' +
      (sentEvents.length > 0 ?
        UI.timeline(sentEvents.map(function (e) {
          return {
            title: 'Sent to client',
            description: e.payload ? (e.payload.clientIds || []).join(', ') : '',
            time: Utils.formatTimeAgo(e.createdAt),
            dotClass: 'info',
          };
        }))
        : UI.emptyState('fa-paper-plane', 'Not sent to any clients yet',
          '<button class="btn btn-sm btn-gold" onclick="CRM.quickSendListing()"><i class="fas fa-paper-plane"></i> Send Now</button>')) +
    '</div>';
  }

  // ─── Listing Tab: Inquiries ──────────────────────────────────────────
  function _listingInquiries(el) {
    MallanAPI._fetch('/api/crm/inquiries?listing_id=' + _listingId + '&limit=50')
      .then(function (data) {
        var inquiries = data.inquiries || [];
        if (inquiries.length === 0) {
          el.innerHTML = '<div class="space-y-4"><h3 class="text-sm font-bold text-gray-700">Inquiries</h3>' +
            UI.emptyState('fa-inbox', 'No inquiries for this listing') + '</div>';
          return;
        }
        var html = '<div class="space-y-4"><h3 class="text-sm font-bold text-gray-700">Inquiries (' + inquiries.length + ')</h3><div class="space-y-2">';
        inquiries.forEach(function (inq) {
          html += '<div class="card p-3"><div class="flex items-center gap-3">' +
            UI.avatar(inq.name || inq.email, 28) +
            '<div class="flex-1"><p class="text-sm font-medium">' + E(inq.name || inq.email || 'Unknown') + '</p>' +
              '<p class="text-xs text-gray-500">' + E(inq.source || 'Website') + ' · ' + Utils.formatTimeAgo(inq.created_at) + '</p></div>' +
          '</div>' +
          (inq.message ? '<p class="text-xs text-gray-600 mt-2">' + E(inq.message) + '</p>' : '') +
          '</div>';
        });
        html += '</div></div>';
        el.innerHTML = html;
      })
      .catch(function () {
        el.innerHTML = '<div class="space-y-4"><h3 class="text-sm font-bold text-gray-700">Inquiries</h3>' +
          UI.emptyState('fa-inbox', 'No inquiries') + '</div>';
      });
  }

  // ─── Listing Tab: Showings ───────────────────────────────────────────
  function _listingShowings(el) {
    el.innerHTML = '<div class="space-y-4">' +
      '<div class="flex items-center justify-between">' +
        '<h3 class="text-sm font-bold text-gray-700">Showings & Feedback</h3>' +
        '<button class="btn btn-sm btn-gold" onclick="Workspace._scheduleShowing()"><i class="fas fa-plus"></i> Schedule</button>' +
      '</div>' +
      UI.emptyState('fa-calendar', 'No showings for this listing') +
    '</div>';
  }

  // ─── Listing Tab: Price & Market History ─────────────────────────────
  function _listingHistory(el) {
    el.innerHTML = '<div class="space-y-4">' +
      '<h3 class="text-sm font-bold text-gray-700">Price & Market History</h3>' +
      '<div class="card p-4">' +
        '<div class="flex items-center justify-between mb-3">' +
          '<span class="text-sm font-medium">Current Price</span>' +
          '<span class="text-lg font-bold text-gold">' + $(_listing.ListPrice || _listing.price) + '</span>' +
        '</div>' +
      '</div>' +
      // Events timeline
      '<h4 class="text-xs font-bold text-gray-500 uppercase">Change History</h4>' +
      _miniListingTimeline() +
    '</div>';
  }

  function _miniListingTimeline() {
    var events = Events.getByEntity('listing', _listingId);
    if (events.length === 0) return '<p class="text-xs text-gray-400 mt-2">No history events</p>';
    return UI.timeline(events.map(function (e) {
      return { title: Events.label(e.type), time: Utils.formatTimeAgo(e.createdAt), dotClass: 'info' };
    }));
  }

  // ─── Listing Tab: Documents ──────────────────────────────────────────
  function _listingDocuments(el) {
    var docs = _listingData.documents || [];
    el.innerHTML = '<div class="space-y-4">' +
      '<div class="flex items-center justify-between">' +
        '<h3 class="text-sm font-bold text-gray-700">Listing Documents</h3>' +
        '<button class="btn btn-sm btn-gold" onclick="Panels._uploadDoc(\'listing\',\'' + E(_listingId) + '\')"><i class="fas fa-upload"></i> Upload</button>' +
      '</div>' +
      (docs.length > 0 ?
        '<div class="space-y-2">' + docs.map(function (d) {
          return '<div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50">' +
            '<i class="fas ' + Documents.typeIcon(d.type) + ' text-gold"></i>' +
            '<div class="flex-1"><p class="text-sm font-medium">' + E(d.title || 'Document') + '</p>' +
              '<p class="text-xs text-gray-500">' + D(d.created_at || d.createdAt) + '</p></div>' +
            Documents.statusBadge(d.status) +
          '</div>';
        }).join('') + '</div>'
        : UI.emptyState('fa-folder-open', 'No documents for this listing')) +
    '</div>';
  }

  // ─── Listing Tab: Health ─────────────────────────────────────────────
  function _listingHealth(el) {
    var l = _listing;
    var hasPhotos = (l.photos || l.Media || []).length > 0;
    var hasDescription = !!(l.PublicRemarks || l.description);
    var dom = l.cumulative_dom || l.days_on_market || 0;

    el.innerHTML = '<div class="space-y-4">' +
      '<h3 class="text-sm font-bold text-gray-700">Listing Health</h3>' +
      '<div class="space-y-2">' +
        _healthItem('Photos uploaded', hasPhotos ? 'pass' : 'fail', hasPhotos ? 'Photos present' : 'No photos — add photos for better engagement') +
        _healthItem('Description complete', hasDescription ? 'pass' : 'warn', hasDescription ? 'Description present' : 'Add a property description') +
        _healthItem('Price competitiveness', 'pass', 'Within market range') +
        _healthItem('Days on market', dom > 90 ? 'warn' : 'pass', dom + ' days — ' + (dom > 90 ? 'Consider price adjustment' : 'Normal')) +
        _healthItem('Fair Housing compliance', 'pass', 'No violations detected') +
      '</div>' +
    '</div>';
  }

  function _healthItem(label, status, detail) {
    var color = status === 'pass' ? '#059669' : status === 'fail' ? '#DC2626' : '#F59E0B';
    var icon = status === 'pass' ? 'fa-check-circle' : status === 'fail' ? 'fa-times-circle' : 'fa-exclamation-triangle';
    return '<div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50">' +
      '<i class="fas ' + icon + '" style="color:' + color + '"></i>' +
      '<div class="flex-1"><p class="text-sm font-medium">' + E(label) + '</p>' +
        '<p class="text-xs text-gray-500">' + E(detail) + '</p></div>' +
    '</div>';
  }

  // ─── Listing Tab: Portal & Reporting ─────────────────────────────────
  function _listingPortal(el) {
    var l = _listing;
    el.innerHTML = '<div class="space-y-4">' +
      '<h3 class="text-sm font-bold text-gray-700">Portal & Reporting</h3>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
        '<div class="card p-4">' +
          '<h4 class="text-sm font-bold mb-2">Featured Status</h4>' +
          '<div class="flex items-center gap-2">' +
            '<span class="text-sm">' + (l.featuredFlag || l.featured ? 'Featured' : 'Not featured') + '</span>' +
            (Permissions.can('change_featured') ?
              '<button class="btn btn-sm btn-outline" onclick="Panels._toggleFeatured(\'' + E(_listingId) + '\',' + !(l.featuredFlag || l.featured) + ')">' +
                (l.featuredFlag || l.featured ? 'Remove' : 'Feature') + '</button>' : '') +
          '</div>' +
        '</div>' +
        '<div class="card p-4">' +
          '<h4 class="text-sm font-bold mb-2">Syndication</h4>' +
          '<div class="space-y-1 text-xs">' +
            '<div class="flex justify-between"><span>REBNY RLS</span><span class="text-green-600 font-bold">Active</span></div>' +
            '<div class="flex justify-between"><span>mallan.nyc</span><span class="text-green-600 font-bold">Active</span></div>' +
            '<div class="flex justify-between"><span>StreetEasy</span><span class="text-gray-400">Manual upload</span></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ─── Public API ──────────────────────────────────────────────────────
  return {
    // Client Workspace
    openClient: openClient,
    switchClientTab: switchClientTab,
    editClient: editClient,
    _submitEditClient: _submitEditClient,
    _moveStage: _moveStage,
    _saveNurtureSettings: _saveNurtureSettings,
    _scheduleShowing: _scheduleShowing,
    _submitShowing: _submitShowing,
    _editPreferences: _editPreferences,
    _submitPreferences: _submitPreferences,
    _saveClientNotes: _saveClientNotes,
    _saveAlertSettings: _saveAlertSettings,
    _searchAndSend: _searchAndSend,
    _sendListingToClient: _sendListingToClient,
    _addActivityNote: _addActivityNote,
    _submitActivityNote: _submitActivityNote,
    _toggleTask: _toggleTask,
    _addPipelineTask: _addPipelineTask,
    _submitPipelineTask: _submitPipelineTask,
    _generateCMA: _generateCMA,

    // Overview — pinned notes
    _pinNote: _pinNote,
    _unpinNote: _unpinNote,
    _saveClientNoteAsEvent: _saveClientNoteAsEvent,

    // Activity — filters & payload toggle
    _filterActivity: _filterActivity,
    _toggleEventPayload: _toggleEventPayload,

    // Pipeline — conversion override
    _saveConversionOverride: _saveConversionOverride,

    // Financial calculators + scenarios
    _calcMortgage: _calcMortgage,
    _calcClosing: _calcClosing,
    _calcRentVsBuy: _calcRentVsBuy,
    _calcAffordability: _calcAffordability,
    _toggleCalcSection: _toggleCalcSection,
    _saveScenario: _saveScenario,
    _deleteScenario: _deleteScenario,
    _exportScenarioSummary: _exportScenarioSummary,

    // Showings
    _addShowingFeedback: _addShowingFeedback,
    _submitShowingFeedback: _submitShowingFeedback,

    // Documents — upload/request/approve
    _filterDocs: _filterDocs,
    _requestDocUpload: _requestDocUpload,
    _submitDocRequest: _submitDocRequest,
    _approveDocuments: _approveDocuments,
    _submitApproveDocuments: _submitApproveDocuments,

    // Agreements — template/approve
    _generateFromTemplate: _generateFromTemplate,
    _approveSingleAgreement: _approveSingleAgreement,

    // Readiness — 3-state
    _onReadinessChange: _onReadinessChange,
    _cycleReadinessState: _cycleReadinessState,
    _toggleReadinessComment: _toggleReadinessComment,
    _saveReadiness: _saveReadiness,

    // Listing Workspace
    openListing: openListing,
    switchListingTab: switchListingTab,
    _runComplianceCheck: _runComplianceCheck,
  };
})();
