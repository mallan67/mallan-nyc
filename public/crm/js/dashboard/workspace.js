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
    // Normalize name and type from API fields
    if (!cl.name && (cl.first_name || cl.last_name)) {
      cl.name = ((cl.first_name || '') + ' ' + (cl.last_name || '')).trim();
    }
    if (!cl.type && !cl.client_type) {
      cl.type = cl.portal_role || (cl.roles && cl.roles[0]) || 'buyer';
      cl.client_type = cl.type;
    }
    var name = cl.name || cl.email || 'Client';
    var type = cl.type || cl.client_type || 'buyer';
    var hasSecondary = cl.secondary_first_name || cl.secondary_last_name;
    var secondaryName = hasSecondary ? ((cl.secondary_first_name || '') + ' ' + (cl.secondary_last_name || '')).trim() : '';
    var displayName = _clientDisplayName(cl);

    var html = '<div class="space-y-0">';

    // Back navigation
    html += '<div class="flex items-center gap-2 mb-2">' +
      '<button class="text-sm text-gray-500 hover:text-gray-700" onclick="Router.navigate(\'/ops/clients\')"><i class="fas fa-arrow-left mr-1"></i> All Clients</button>' +
    '</div>';

    // Header — shows both people side by side if couple
    html += '<div class="workspace-header">' +
      '<div class="flex items-center justify-between">' +
        '<div class="flex items-center gap-4">' +
          UI.avatar(name, 48) +
          '<div>' +
            '<h2 class="text-xl font-bold text-gray-900">' + E(displayName) + '</h2>' +
            '<div class="flex items-center gap-2 mt-1">' +
              UI.roleBadge(type) +
              UI.stageBadge(cl.stage || cl.status || 'active') +
              (hasSecondary ? '<span class="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">' + E(cl.secondary_relationship || 'partner') + '</span>' : '') +
            '</div>' +
          '</div>' +
          (hasSecondary ? UI.avatar(secondaryName, 40) : '') +
        '</div>' +
        '<div class="flex gap-2">' +
          (!hasSecondary ? '<button class="btn btn-sm btn-outline" onclick="Workspace._addSecondaryPerson()"><i class="fas fa-user-plus"></i> Add Person</button>' : '') +
          '<button class="btn btn-sm btn-outline" onclick="Workspace.editClient()"><i class="fas fa-edit"></i> Edit</button>' +
          '<button class="btn btn-sm btn-gold" onclick="CRM.quickSendListing()"><i class="fas fa-paper-plane"></i> Send Listing</button>' +
        '</div>' +
      '</div>' +
      // Contact info — both people
      '<div class="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">' +
        (cl.email ? '<span><i class="fas fa-envelope mr-1"></i>' + E(cl.email) + '</span>' : '') +
        (cl.phone ? '<span><i class="fas fa-phone mr-1"></i>' + E(cl.phone) + '</span>' : '') +
        (hasSecondary && cl.secondary_email ? '<span class="text-gray-400">|</span><span><i class="fas fa-envelope mr-1"></i>' + E(cl.secondary_email) + '</span>' : '') +
        (hasSecondary && cl.secondary_phone ? '<span><i class="fas fa-phone mr-1"></i>' + E(cl.secondary_phone) + '</span>' : '') +
        (cl.source ? '<span><i class="fas fa-tag mr-1"></i>Source: ' + E(cl.source) + '</span>' : '') +
      '</div>' +
    '</div>';

    // Tabs
    html += UI.tabs(CLIENT_TABS, _clientTab, 'Workspace.switchClientTab');

    // Sticky action bar
    html += '<div class="workspace-action-bar">' +
      '<div class="action-group">' +
        '<button class="btn btn-sm btn-gold" onclick="CRM.quickSendListing()"><i class="fas fa-paper-plane"></i> <span class="hidden sm:inline">Send Listing</span></button>' +
        '<button class="btn btn-sm btn-outline" onclick="Workspace._quickAddNote()"><i class="fas fa-sticky-note"></i> <span class="hidden sm:inline">Note</span></button>' +
        '<button class="btn btn-sm btn-outline" onclick="Workspace._quickAddTask()"><i class="fas fa-tasks"></i> <span class="hidden sm:inline">Task</span></button>' +
        '<button class="btn btn-sm btn-outline" onclick="Workspace._scheduleShowing()"><i class="fas fa-calendar"></i> <span class="hidden sm:inline">Showing</span></button>' +
      '</div>' +
      '<div class="action-group">' +
        (cl.email ? '<a href="mailto:' + E(cl.email) + '" class="btn btn-sm btn-outline"><i class="fas fa-envelope"></i></a>' : '') +
        (cl.phone ? '<a href="tel:' + E(cl.phone) + '" class="btn btn-sm btn-outline"><i class="fas fa-phone"></i></a>' : '') +
      '</div>' +
    '</div>';

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

  function _fetchHeaderPartner() {
    var el = document.getElementById('wsHeaderPartner');
    if (!el) return;
    MallanAPI._fetch('/api/crm/clients/' + _clientId + '/family').then(function (data) {
      var members = data.members || [];
      if (members.length === 0) {
        el.classList.add('hidden');
        return;
      }
      var m = members[0].member;
      var rel = members[0].relationship || 'partner';
      var pName = ((m.first_name || '') + ' ' + (m.last_name || '')).trim();
      el.classList.remove('hidden');
      el.innerHTML = '<div class="flex items-center gap-3 pl-3 border-l-2 border-gold cursor-pointer" onclick="Router.navigate(\'/workspace/client/' + m.id + '/overview\')">' +
        UI.avatar(pName, 40) +
        '<div>' +
          '<p class="text-base font-bold text-gray-900">' + E(pName) + '</p>' +
          '<p class="text-xs text-gray-500">' + E(rel.charAt(0).toUpperCase() + rel.slice(1)) +
            (m.phone ? ' · ' + E(m.phone) : '') + '</p>' +
        '</div>' +
      '</div>';
    }).catch(function () { el.classList.add('hidden'); });
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
        (Permissions.can('delete_client') ? '<button class="w-full text-left text-sm p-2 rounded hover:bg-red-50 text-red-600 mt-2 border-t" onclick="Workspace._deleteClient()"><i class="fas fa-trash-alt text-xs mr-2"></i>Delete Client</button>' : '') +
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

    // Nurture Status
    var nurture = (cl.preferences && cl.preferences.nurture) || {};
    var nurtureOn = nurture.autoSend === true;
    var nurtureFreq = nurture.frequency || 'manual';
    var nurtureUpdated = nurture.updatedAt || null;
    var nurtureNextSend = '';
    if (nurtureOn && nurtureUpdated) {
      var freqDays = { weekly: 7, monthly: 30, quarterly: 90 };
      var interval = freqDays[nurtureFreq] || 30;
      var nextDate = new Date(new Date(nurtureUpdated).getTime() + interval * 86400000);
      if (nextDate.getTime() < Date.now()) nextDate = new Date(Date.now() + interval * 86400000);
      nurtureNextSend = '~' + (nextDate.getMonth() + 1) + '/' + nextDate.getDate();
    }
    var nurtureLabel = nurtureOn ? 'ON' : 'OFF';
    var nurtureColor = nurtureOn ? 'text-green-600' : 'text-gray-500';
    html += '<div class="card p-3"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2"><i class="fas fa-paper-plane mr-1"></i>Auto-Nurture</h4>' +
      '<div class="space-y-2">' +
        '<div class="flex justify-between text-xs"><span>Nurture</span><span class="font-bold ' + nurtureColor + '">' + nurtureLabel + (nurtureOn ? ' (' + nurtureFreq.charAt(0).toUpperCase() + nurtureFreq.slice(1) + ')' : '') + '</span></div>' +
        (nurtureOn && nurtureNextSend ? '<div class="flex justify-between text-xs"><span>Next send</span><span class="font-bold">' + nurtureNextSend + '</span></div>' : '') +
        (nurtureUpdated ? '<div class="flex justify-between text-xs"><span>Last saved</span><span class="text-gray-500">' + Utils.formatDate(nurtureUpdated) + '</span></div>' : '') +
      '</div>' +
      '<button class="w-full text-center text-[10px] text-blue-600 hover:underline mt-2" onclick="Workspace.switchClientTab(\'readiness\')">Edit nurture settings</button>' +
    '</div>';

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

    // Connected listings
    var sentEvents = Events.getByEntity('client', _clientId).filter(function(e) { return e.type === 'listing_sent'; });
    if (sentEvents.length > 0) {
      html += '<div class="flex flex-wrap gap-2 mb-3">';
      var seenListings = {};
      var chipCount = 0;
      sentEvents.forEach(function(e) {
        var lid = e.payload && (e.payload.listingId || e.payload.listing_id);
        if (lid && !seenListings[lid] && chipCount < 5) {
          seenListings[lid] = true;
          chipCount++;
          html += '<span class="ws-connection listing" onclick="CRM.navigateToConnected(\'listing\',\'' + E(lid) + '\')"><i class="fas fa-building mr-1"></i>Listing ' + E(lid.substring(0, 8)) + '</span>';
        }
      });
      html += '</div>';
    }

    // Parse notes for property data (address/unit/legal owner still in notes)
    var notes = cl.notes || '';
    var _extractNoteText = function (label) {
      var rx = new RegExp(label + '\\s*[:.]\\s*(.+)', 'i');
      var m = notes.match(rx);
      return m ? m[1].trim() : '';
    };

    var clientType = (cl.portal_role || cl.type || cl.client_type || (cl.roles && cl.roles[0]) || '').toLowerCase();
    var propertyAddr = _extractNoteText('Property') || _extractNoteText('Rental Address') || '';
    var propertyUnit = _extractNoteText('Unit') || '';
    var legalOwner = _extractNoteText('Legal Owner') || '';
    var _fmtDate = function (v) { if (!v) return ''; var d = new Date(v); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }); };
    var leaseStart = _fmtDate(cl.lease_start_date);
    var leaseEnd = _fmtDate(cl.lease_end_date);

    // ── Card helper ──
    function _card(icon, title, editFn, bodyHtml) {
      return '<div class="border rounded-xl bg-white shadow-sm overflow-hidden">' +
        '<div class="flex items-center justify-between px-4 py-3 border-b bg-gray-50">' +
          '<h3 class="text-sm font-bold text-gray-700"><i class="fas fa-' + icon + ' mr-2 text-gray-400"></i>' + title + '</h3>' +
          (editFn ? '<button class="text-xs text-gray-500 hover:text-gray-800 font-medium" onclick="' + editFn + '"><i class="fas fa-pen mr-1"></i>Edit</button>' : '') +
        '</div>' +
        '<div class="px-4 py-3">' + bodyHtml + '</div>' +
      '</div>';
    }

    // ── Property Card (address + unit + legal owner) ──
    var showProperty = clientType === 'landlord' || clientType === 'renter' || clientType === 'seller' || propertyAddr;
    if (showProperty) {
      var propBody = '<div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">' +
        '<div class="col-span-2"><span class="text-xs text-gray-400 block">Address</span><span class="font-medium text-gray-900">' + E(propertyAddr || '-') + '</span></div>' +
        '<div><span class="text-xs text-gray-400 block">Unit</span><span class="font-medium text-gray-900">' + E(propertyUnit || '-') + '</span></div>' +
        (clientType === 'landlord' || clientType === 'seller' ?
          '<div><span class="text-xs text-gray-400 block">Legal Owner</span><span class="font-medium text-gray-900">' + E(legalOwner || '-') + '</span></div>' : '') +
      '</div>';
      html += _card('map-marker-alt', 'Property', 'Workspace._editProperty()', propBody);
    }

    // ── Lease Card (start + end dates + monthly rent) ──
    var showLease = clientType === 'renter' || clientType === 'landlord' || leaseStart || leaseEnd;
    if (showLease) {
      var daysLeft = '';
      if (leaseEnd) {
        var diff = Math.floor((new Date(cl.lease_end_date).getTime() - Date.now()) / 86400000);
        var urgencyClass = diff <= 30 ? 'text-red-600' : diff <= 90 ? 'text-amber-600' : 'text-green-600';
        daysLeft = '<div class="text-center"><span class="text-xs text-gray-400 block">Days Left</span><span class="text-lg font-bold ' + urgencyClass + '">' + diff + '</span></div>';
      }
      var leaseBody = '<div class="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">' +
        '<div><span class="text-xs text-gray-400 block">Lease Start</span><span class="font-medium text-gray-900">' + E(leaseStart || '-') + '</span></div>' +
        '<div><span class="text-xs text-gray-400 block">Lease End</span><span class="font-medium text-gray-900">' + E(leaseEnd || '-') + '</span></div>' +
        daysLeft +
      '</div>';
      if (cl.rent_per_month) {
        leaseBody += '<div class="mt-2 pt-2 border-t text-sm"><span class="text-xs text-gray-400">Monthly Rent</span><span class="font-medium text-gray-900 ml-2">$' + Number(cl.rent_per_month).toLocaleString() + '</span></div>';
      }
      html += _card('calendar-alt', 'Lease', 'Workspace._editProperty()', leaseBody);
    }

    // ── 3-column card row: Contact, Financial, Preferences ──
    html += '<div class="grid grid-cols-1 md:grid-cols-3 gap-4">';

    // Contact Card
    var contactBody = '<div class="space-y-2 text-sm">' +
      '<div class="flex justify-between"><span class="text-gray-500">Email</span><span class="font-medium text-gray-900 text-right truncate ml-2">' + E(cl.email || '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Phone</span><span class="font-medium text-gray-900">' + E(cl.phone || '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Source</span><span class="font-medium text-gray-900">' + E(cl.source || '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Created</span><span class="font-medium text-gray-900">' + E(D(cl.created_at || cl.createdAt) || '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Updated</span><span class="font-medium text-gray-900">' + E(D(cl.updated_at || cl.updatedAt) || '-') + '</span></div>' +
    '</div>';
    html += _card('address-card', 'Contact Information', '', contactBody);

    // Family / Partner (loaded async)
    html += '<div id="wsFamilySection"></div>';

    // Financial Card
    var finBody = '<div class="space-y-2 text-sm">' +
      '<div class="flex justify-between"><span class="text-gray-500">Annual Income</span><span class="font-medium text-gray-900">' + (cl.annual_income ? '$' + Number(cl.annual_income).toLocaleString() : '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Bonuses</span><span class="font-medium text-gray-900">' + (cl.bonuses ? '$' + Number(cl.bonuses).toLocaleString() : '-') + '</span></div>';
    if (clientType === 'renter') {
      finBody += '<div class="flex justify-between"><span class="text-gray-500">Rent / Month</span><span class="font-medium text-gray-900">' + (cl.rent_per_month ? '$' + Number(cl.rent_per_month).toLocaleString() : '-') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">Rental Deposit</span><span class="font-medium text-gray-900">' + (cl.rental_deposit ? '$' + Number(cl.rental_deposit).toLocaleString() : '-') + '</span></div>';
    }
    if (clientType === 'buyer') {
      finBody += '<div class="flex justify-between"><span class="text-gray-500">Down Payment</span><span class="font-medium text-gray-900">' + (cl.down_payment ? '$' + Number(cl.down_payment).toLocaleString() : '-') + '</span></div>' +
        '<div class="flex justify-between"><span class="text-gray-500">Total Expense</span><span class="font-medium text-gray-900">' + (cl.total_monthly_expense ? '$' + Number(cl.total_monthly_expense).toLocaleString() : '-') + '</span></div>';
    }
    if (clientType !== 'buyer' && clientType !== 'renter') {
      finBody += '<div class="flex justify-between"><span class="text-gray-500">Down Payment</span><span class="font-medium text-gray-900">' + (cl.down_payment ? '$' + Number(cl.down_payment).toLocaleString() : '-') + '</span></div>';
    }
    finBody += '<div class="flex justify-between"><span class="text-gray-500">Deposit / Liquid</span><span class="font-medium text-gray-900">' + (cl.available_funds ? '$' + Number(cl.available_funds).toLocaleString() : '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Monthly Debt</span><span class="font-medium text-gray-900">' + (cl.monthly_debt ? '$' + Number(cl.monthly_debt).toLocaleString() : '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Employer</span><span class="font-medium text-gray-900">' + E(cl.employer || '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Work Title</span><span class="font-medium text-gray-900">' + E(cl.work_title || '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Credit Score</span><span class="font-medium text-gray-900">' + E(cl.credit_score_range || '-') + '</span></div>';
    if (cl.pre_approved) {
      finBody += '<div class="flex justify-between"><span class="text-gray-500">Pre-Approved</span><span class="font-medium text-green-700">$' + Number(cl.pre_approved_amount || 0).toLocaleString() + '</span></div>';
    }
    finBody += '</div>' +
      '<button class="btn btn-xs btn-outline mt-3 w-full" onclick="Panels._uploadDoc(\'client\',\'' + E(_clientId) + '\')"><i class="fas fa-file-upload mr-1"></i> Upload Statement</button>';
    html += _card('dollar-sign', 'Financial Profile', 'Workspace._editFinancials()', finBody);

    // Preferences Card
    var prefBody = '<div class="space-y-2 text-sm">' +
      '<div class="flex justify-between"><span class="text-gray-500">Neighborhoods</span><span class="font-medium text-gray-900 text-right truncate ml-2">' + E((prefs.neighborhoods || []).join(', ') || '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Budget</span><span class="font-medium text-gray-900">' + (prefs.minPrice || prefs.maxPrice ? (prefs.minPrice ? $(prefs.minPrice) : '$0') + ' - ' + (prefs.maxPrice ? $(prefs.maxPrice) : 'No max') : '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Beds / Baths</span><span class="font-medium text-gray-900">' + (prefs.minBeds || '-') + ' bd / ' + (prefs.minBaths || '-') + ' ba</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Property Type</span><span class="font-medium text-gray-900">' + E(prefs.propertyType || '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Must-Haves</span><span class="font-medium text-gray-900 text-right truncate ml-2">' + E(prefs.mustHaves || '-') + '</span></div>' +
      '<div class="flex justify-between"><span class="text-gray-500">Deal-Breakers</span><span class="font-medium text-gray-900 text-right truncate ml-2">' + E(prefs.dealBreakers || '-') + '</span></div>' +
    '</div>';
    html += _card('sliders-h', 'Preferences', 'Workspace._editPreferences()', prefBody);

    html += '</div>'; // close 3-col grid

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
      noteEvents.forEach(function (e, idx) {
        var content = (e.payload && e.payload.content) || '';
        var isPinned = content === pinnedNote;
        var safeContent = E(content.replace(/'/g, "\\'").replace(/\n/g, "\\n"));
        html += '<div class="p-3 rounded-lg bg-gray-50 group">' +
          '<div class="flex items-start gap-2">' +
            '<div class="flex-1 min-w-0">' +
              '<p class="text-sm text-gray-700" id="noteText_' + idx + '">' + E(content) + '</p>' +
              '<p class="text-xs text-gray-400 mt-1">' + Utils.formatTimeAgo(e.createdAt) + '</p>' +
            '</div>' +
            '<div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0">' +
              '<button class="text-xs text-gray-400 hover:text-blue-500 p-1" onclick="Workspace._editNote(' + idx + ',\'' + safeContent + '\')" title="Edit"><i class="fas fa-pen"></i></button>' +
              '<button class="text-xs text-gray-400 hover:text-red-500 p-1" onclick="Workspace._deleteNote(' + idx + ',\'' + safeContent + '\')" title="Delete"><i class="fas fa-trash"></i></button>' +
              (!isPinned && content ? '<button class="text-xs text-gray-400 hover:text-gold p-1" onclick="Workspace._pinNote(\'' + safeContent + '\')" title="Pin"><i class="fas fa-thumbtack"></i></button>' : '') +
            '</div>' +
          '</div>' +
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
          var desc = '';
          if (e.payload) {
            if (e.payload.content) desc = e.payload.content;
            else if (e.payload.name) desc = e.payload.name;
            else if (e.payload.field) desc = e.payload.field + ' updated';
            else { var keys = Object.keys(e.payload).filter(function(k) { return k !== 'source'; }); desc = keys.map(function(k) { return k + ': ' + e.payload[k]; }).join(', '); }
          }
          return {
            title: Events.label(e.type),
            description: desc.substring(0, 100),
            time: Utils.formatTimeAgo(e.createdAt),
            dotClass: e.severity === 'urgent' ? 'active' : 'info',
          };
        }));
      }
    }

    // Fetch family members
    var famEl = document.getElementById('wsFamilySection');
    if (famEl) {
      MallanAPI._fetch('/api/crm/clients/' + _clientId + '/family').then(function (data) {
        var members = data.members || [];
        var fhtml = '<div class="card p-4">' +
          '<div class="flex items-center justify-between mb-3">' +
            '<h4 class="text-xs font-bold text-gray-500 uppercase"><i class="fas fa-users mr-1"></i>Family / Partner</h4>' +
            '<button class="text-xs text-gold hover:underline" onclick="Workspace._linkPartner()"><i class="fas fa-plus mr-1"></i>Link</button>' +
          '</div>';
        if (members.length > 0) {
          fhtml += '<div class="space-y-2">';
          members.forEach(function (m) {
            var mem = m.member;
            var name = ((mem.first_name || '') + ' ' + (mem.last_name || '')).trim() || 'Unknown';
            var rel = m.relationship ? m.relationship.charAt(0).toUpperCase() + m.relationship.slice(1) : '';
            fhtml += '<div class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 cursor-pointer" onclick="Router.navigate(\'/workspace/client/' + mem.id + '/overview\')">' +
              '<div class="flex items-center gap-3">' +
                '<div class="w-8 h-8 rounded-full bg-gold-bg text-gold flex items-center justify-center text-xs font-bold">' +
                  E((mem.first_name || '?')[0] + (mem.last_name || '?')[0]) +
                '</div>' +
                '<div>' +
                  '<p class="text-sm font-semibold text-gray-900">' + E(name) + '</p>' +
                  '<p class="text-xs text-gray-500">' + E(rel) + (mem.email ? ' · ' + E(mem.email) : '') + '</p>' +
                '</div>' +
              '</div>' +
              '<i class="fas fa-chevron-right text-xs text-gray-300"></i>' +
            '</div>';
          });
          fhtml += '</div>';
        } else {
          fhtml += '<p class="text-xs text-gray-400">No linked partner or family member</p>';
        }
        fhtml += '</div>';
        famEl.innerHTML = fhtml;
      }).catch(function () {
        famEl.innerHTML = '';
      });
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

  function _createNote(clientId, content, source) {
    if (!content || !content.trim()) { CRM.toast('Note content required', 'warning'); return; }

    return MallanAPI._fetch('/api/crm/notes', {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId, content: content.trim(), source: source || 'workspace' })
    }).then(function () {
      Events.log('note_added', 'client', clientId, { content: content, source: source });
      return true;
    });
    // Caller handles .catch()
  }

  function _saveClientNoteAsEvent() {
    var ta = document.getElementById('wsClientNotes');
    if (!ta || !ta.value.trim()) { CRM.toast('Enter a note first', 'warning'); return; }
    var content = ta.value.trim();
    _createNote(_clientId, content, 'inline').then(function () {
      CRM.toast('Note added', 'success');
      _renderClientTab();
    }).catch(function (err) {
      CRM.toast('Failed to save note: ' + (err.message || 'Please try again'), 'error');
    });
  }

  function _editFinancials() {
    var cl = _client || {};
    var clientType = (cl.portal_role || cl.type || cl.client_type || (cl.roles && cl.roles[0]) || '').toLowerCase();
    var creditVal = cl.credit_score_range || '';

    // Type-specific fields
    var rentalFields = '';
    if (clientType === 'renter') {
      rentalFields = '<div class="grid grid-cols-2 gap-4">' +
        '<div class="form-group"><label class="form-label">Rent / Month</label><input class="form-input" name="rent_per_month" type="number" value="' + E(cl.rent_per_month || '') + '" placeholder="$0"></div>' +
        '<div class="form-group"><label class="form-label">Rental Deposit</label><input class="form-input" name="rental_deposit" type="number" value="' + E(cl.rental_deposit || '') + '" placeholder="$0"></div>' +
      '</div>';
    }
    var buyerFields = '';
    if (clientType === 'buyer') {
      buyerFields = '<div class="grid grid-cols-2 gap-4">' +
        '<div class="form-group"><label class="form-label">Down Payment</label><input class="form-input" name="down_payment" type="number" value="' + E(cl.down_payment || '') + '" placeholder="$0"></div>' +
        '<div class="form-group"><label class="form-label">Total Monthly Expense</label><input class="form-input" name="total_monthly_expense" type="number" value="' + E(cl.total_monthly_expense || '') + '" placeholder="Mortgage + maint + tax"></div>' +
      '</div>';
    }
    var otherDownPayment = '';
    if (clientType !== 'buyer' && clientType !== 'renter') {
      otherDownPayment = '<div class="form-group"><label class="form-label">Down Payment</label><input class="form-input" name="down_payment" type="number" value="' + E(cl.down_payment || '') + '" placeholder="$0"></div>';
    }

    CRM.openModal('Edit Financial Profile',
      '<form id="editFinancialsForm" class="space-y-4">' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Annual Income</label><input class="form-input" name="annual_income" type="number" value="' + E(cl.annual_income || '') + '" placeholder="$0"></div>' +
          '<div class="form-group"><label class="form-label">Bonuses (Annual)</label><input class="form-input" name="bonuses" type="number" value="' + E(cl.bonuses || '') + '" placeholder="$0"></div>' +
        '</div>' +
        rentalFields +
        buyerFields +
        otherDownPayment +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Deposit / Available Funds</label><input class="form-input" name="available_funds" type="number" value="' + E(cl.available_funds || '') + '" placeholder="$0"></div>' +
          '<div class="form-group"><label class="form-label">Monthly Debt Payments</label><input class="form-input" name="monthly_debt" type="number" value="' + E(cl.monthly_debt || '') + '" placeholder="$0"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Employer</label><input class="form-input" name="employer" value="' + E(cl.employer || '') + '" placeholder="Company name"></div>' +
          '<div class="form-group"><label class="form-label">Work Title</label><input class="form-input" name="work_title" value="' + E(cl.work_title || '') + '" placeholder="Job title"></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Credit Score</label>' +
            '<select class="form-input form-select" name="credit_score_range">' +
              '<option value="">Unknown</option>' +
              '<option' + (creditVal.indexOf('xcellent') !== -1 ? ' selected' : '') + ' value="Excellent (740+)">Excellent (740+)</option>' +
              '<option' + (creditVal.indexOf('ood') !== -1 ? ' selected' : '') + ' value="Good (670-739)">Good (670-739)</option>' +
              '<option' + (creditVal.indexOf('air') !== -1 ? ' selected' : '') + ' value="Fair (580-669)">Fair (580-669)</option>' +
              '<option' + (creditVal.indexOf('oor') !== -1 ? ' selected' : '') + ' value="Poor (below 580)">Poor (below 580)</option>' +
            '</select></div>' +
          '<div class="form-group"><label class="form-label">Pre-Approved Amount</label><input class="form-input" name="pre_approved_amount" type="number" value="' + E(cl.pre_approved_amount || '') + '" placeholder="$0"></div>' +
        '</div>' +
        '<p class="text-xs text-gray-400"><i class="fas fa-lock mr-1"></i> Financial data is private — never shared with the client.</p>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Workspace._saveFinancials()"><i class="fas fa-save mr-1"></i> Save</button>',
      }
    );
  }

  function _saveFinancials() {
    var form = document.getElementById('editFinancialsForm');
    if (!form) return;
    var fd = new FormData(form);

    // Build update payload from real DB fields
    var data = {};
    var numFields = ['annual_income', 'bonuses', 'down_payment', 'available_funds', 'monthly_debt', 'rent_per_month', 'rental_deposit', 'total_monthly_expense', 'pre_approved_amount'];
    numFields.forEach(function (f) {
      var v = fd.get(f);
      if (v !== null) data[f] = v ? Number(v) : null;
    });
    var strFields = ['employer', 'work_title', 'credit_score_range'];
    strFields.forEach(function (f) {
      var v = fd.get(f);
      if (v !== null) data[f] = v || null;
    });
    // Pre-approved flag: true if amount > 0
    if (data.pre_approved_amount) data.pre_approved = true;

    MallanAPI.clients.update(_clientId, data).then(function () {
      // Update local client object
      Object.keys(data).forEach(function (k) { _client[k] = data[k]; });
      CRM.closeModal();
      CRM.toast('Financial profile saved', 'success');
      _renderClientTab();
    }).catch(function (err) {
      CRM.toast('Error: ' + (err.message || 'Could not save'), 'error');
    });
  }

  function _editProperty() {
    var cl = _client || {};
    var notes = cl.notes || '';
    var _extT = function (label) {
      var rx = new RegExp(label + '\\s*[:.]\\s*(.+)', 'i');
      var m = notes.match(rx);
      return m ? m[1].trim() : '';
    };
    var clientType = (cl.portal_role || cl.type || cl.client_type || (cl.roles && cl.roles[0]) || '').toLowerCase();
    var propertyAddr = _extT('Property') || _extT('Rental Address') || '';
    var propertyUnit = _extT('Unit') || '';
    var legalOwner = _extT('Legal Owner') || '';
    var leaseStartVal = cl.lease_start_date ? cl.lease_start_date.substring(0, 10) : '';
    var leaseEndVal = cl.lease_end_date ? cl.lease_end_date.substring(0, 10) : '';

    var ownerField = '';
    if (clientType === 'landlord' || clientType === 'seller') {
      ownerField = '<div class="form-group"><label class="form-label">Legal Owner</label><input class="form-input" name="legal_owner" value="' + E(legalOwner) + '" placeholder="Full legal owner name"></div>';
    }
    var leaseFields = '';
    if (clientType === 'renter' || clientType === 'landlord') {
      leaseFields = '<div class="grid grid-cols-2 gap-4">' +
        '<div class="form-group"><label class="form-label">Lease Start</label><input class="form-input" name="lease_start_date" type="date" value="' + E(leaseStartVal) + '"></div>' +
        '<div class="form-group"><label class="form-label">Lease End</label><input class="form-input" name="lease_end_date" type="date" value="' + E(leaseEndVal) + '"></div>' +
      '</div>';
    }

    CRM.openModal('Edit Property',
      '<form id="editPropertyForm" class="space-y-4">' +
        '<div class="form-group"><label class="form-label">Property Address</label><input class="form-input" name="property_address" value="' + E(propertyAddr) + '" placeholder="123 Main St, New York, NY 10001"></div>' +
        '<div class="form-group"><label class="form-label">Unit / Apt</label><input class="form-input" name="property_unit" value="' + E(propertyUnit) + '" placeholder="Apt 4B"></div>' +
        ownerField +
        leaseFields +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Workspace._saveProperty()"><i class="fas fa-save mr-1"></i> Save</button>',
      }
    );
  }

  function _saveProperty() {
    var form = document.getElementById('editPropertyForm');
    if (!form) return;
    var fd = new FormData(form);

    // Property address, unit, legal owner go into notes (no dedicated DB columns yet)
    var notes = (_client.notes || '').split('\n');
    var propLabels = ['Property', 'Rental Address', 'Unit', 'Legal Owner'];
    var nonPropLines = notes.filter(function (line) {
      return !propLabels.some(function (label) { return line.indexOf(label + ':') !== -1 || line.indexOf(label + '.') !== -1; });
    });
    var newLines = [];
    if (fd.get('property_address')) newLines.push('Property: ' + fd.get('property_address'));
    if (fd.get('property_unit')) newLines.push('Unit: ' + fd.get('property_unit'));
    if (fd.get('legal_owner')) newLines.push('Legal Owner: ' + fd.get('legal_owner'));
    var newNotes = nonPropLines.concat(newLines).filter(Boolean).join('\n');

    // Lease dates go to real DB fields
    var data = { notes: newNotes };
    if (fd.get('lease_start_date') !== null) data.lease_start_date = fd.get('lease_start_date') || null;
    if (fd.get('lease_end_date') !== null) data.lease_end_date = fd.get('lease_end_date') || null;

    MallanAPI.clients.update(_clientId, data).then(function () {
      _client.notes = newNotes;
      if (data.lease_start_date !== undefined) _client.lease_start_date = data.lease_start_date;
      if (data.lease_end_date !== undefined) _client.lease_end_date = data.lease_end_date;
      CRM.closeModal();
      CRM.toast('Property saved', 'success');
      _renderClientTab();
    }).catch(function (err) {
      CRM.toast('Error: ' + (err.message || 'Could not save'), 'error');
    });
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
            '<option' + (prefs.propertyType === 'Condop' ? ' selected' : '') + '>Condop</option>' +
            '<option' + (prefs.propertyType === 'Co-op' ? ' selected' : '') + '>Co-op</option>' +
            '<option' + (prefs.propertyType === 'Townhouse' ? ' selected' : '') + '>Townhouse</option>' +
            '<option' + (prefs.propertyType === 'Single Family' ? ' selected' : '') + '>Single Family</option>' +
            '<option' + (prefs.propertyType === 'Multi Family' ? ' selected' : '') + '>Multi Family</option>' +
            '<option' + (prefs.propertyType === 'New Development' ? ' selected' : '') + '>New Development</option>' +
            '<option' + (prefs.propertyType === 'Loft' ? ' selected' : '') + '>Loft</option>' +
            '<option' + (prefs.propertyType === 'Mixed Use' ? ' selected' : '') + '>Mixed Use</option>' +
            '<option' + (prefs.propertyType === 'Commercial' ? ' selected' : '') + '>Commercial</option>' +
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

    // Use the dedicated preferences endpoint with correct field names
    var apiPrefs = {
      neighborhoods: (fd.get('neighborhoods') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      min_price: fd.get('minPrice') ? Number(fd.get('minPrice')) : null,
      max_price: fd.get('maxPrice') ? Number(fd.get('maxPrice')) : null,
      min_beds: fd.get('minBeds') ? Number(fd.get('minBeds')) : null,
      min_baths: fd.get('minBaths') ? Number(fd.get('minBaths')) : null,
      property_types: fd.get('propertyType') ? [fd.get('propertyType')] : [],
      must_haves: (fd.get('mustHaves') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      deal_breakers: (fd.get('dealBreakers') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
    };

    MallanAPI._fetch('/api/crm/clients/' + encodeURIComponent(_clientId) + '/preferences', {
      method: 'PUT',
      body: JSON.stringify(apiPrefs),
    }).then(function () {
      _client.preferences = {
        neighborhoods: apiPrefs.neighborhoods,
        minPrice: apiPrefs.min_price,
        maxPrice: apiPrefs.max_price,
        minBeds: apiPrefs.min_beds,
        minBaths: apiPrefs.min_baths,
        propertyType: (apiPrefs.property_types || [])[0] || null,
        mustHaves: (apiPrefs.must_haves || []).join(', '),
        dealBreakers: (apiPrefs.deal_breakers || []).join(', '),
      };
      CRM.closeModal();
      CRM.toast('Preferences saved', 'success');
      _renderClientTab();
    }).catch(function (err) {
      CRM.toast('Error: ' + (err.message || 'Could not save preferences'), 'error');
    });
  }

  function _editNote(idx, oldContent) {
    oldContent = oldContent.replace(/\\n/g, '\n').replace(/\\'/g, "'");
    var newContent = prompt('Edit note:', oldContent);
    if (newContent === null || newContent.trim() === oldContent) return;
    newContent = newContent.trim();
    if (!newContent) { _deleteNote(idx, oldContent); return; }

    // Update in the notes text field
    var notes = (_client.notes || '').split('\n');
    var updated = false;
    for (var i = 0; i < notes.length; i++) {
      if (notes[i].indexOf(oldContent) !== -1) {
        notes[i] = notes[i].replace(oldContent, newContent);
        updated = true;
        break;
      }
    }
    if (!updated) { CRM.toast('Could not find note to edit', 'warning'); return; }
    var newNotes = notes.join('\n');
    MallanAPI.clients.update(_clientId, { notes: newNotes }).then(function () {
      _client.notes = newNotes;
      CRM.toast('Note updated', 'success');
      _renderClientTab();
    }).catch(function (err) {
      CRM.toast('Error: ' + (err.message || 'Failed'), 'error');
    });
  }

  function _deleteNote(idx, content) {
    content = content.replace(/\\n/g, '\n').replace(/\\'/g, "'");
    if (!confirm('Delete this note?')) return;

    // Remove from notes text field
    var notes = (_client.notes || '').split('\n');
    var filtered = notes.filter(function (line) {
      return line.indexOf(content) === -1;
    });
    var newNotes = filtered.join('\n').trim();
    MallanAPI.clients.update(_clientId, { notes: newNotes }).then(function () {
      _client.notes = newNotes;
      CRM.toast('Note deleted', 'success');
      _renderClientTab();
    }).catch(function (err) {
      CRM.toast('Error: ' + (err.message || 'Failed'), 'error');
    });
  }

  function _clientDisplayName(cl) {
    var primary = cl.name || ((cl.first_name || '') + ' ' + (cl.last_name || '')).trim() || cl.email;
    if (!cl.secondary_first_name) return primary;
    var secondary = ((cl.secondary_first_name || '') + ' ' + (cl.secondary_last_name || '')).trim();
    // Same last name? "John & Jane Smith". Different? "John Smith & Jane Doe"
    if (cl.last_name && cl.secondary_last_name === cl.last_name) {
      return (cl.first_name || '') + ' & ' + (cl.secondary_first_name || '') + ' ' + cl.last_name;
    }
    return primary + ' & ' + secondary;
  }

  function _addSecondaryPerson() {
    if (!_clientId) return;
    var html = '<div class="space-y-4">' +
      '<p class="text-xs text-gray-500">Add a spouse, partner, co-buyer, co-owner, or roommate to this client.</p>' +
      '<div class="grid grid-cols-2 gap-4">' +
        '<div class="form-group"><label class="form-label">First Name</label><input class="form-input" name="secondary_first_name" placeholder="First"></div>' +
        '<div class="form-group"><label class="form-label">Last Name</label><input class="form-input" name="secondary_last_name" placeholder="Last"></div>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-4">' +
        '<div class="form-group"><label class="form-label">Email</label><input class="form-input" name="secondary_email" type="email" placeholder="email@example.com"></div>' +
        '<div class="form-group"><label class="form-label">Phone</label><input class="form-input" name="secondary_phone" type="tel" placeholder="646-555-1234"></div>' +
      '</div>' +
      '<div class="form-group"><label class="form-label">Relationship</label>' +
        '<select class="form-input" name="secondary_relationship">' +
          '<option value="spouse">Spouse</option>' +
          '<option value="partner">Partner</option>' +
          '<option value="co-buyer">Co-Buyer</option>' +
          '<option value="co-owner">Co-Owner</option>' +
          '<option value="roommate">Roommate</option>' +
          '<option value="parent">Parent</option>' +
          '<option value="sibling">Sibling</option>' +
          '<option value="other">Other</option>' +
        '</select></div>' +
    '</div>';

    CRM.openModal('Add Person', html, [
      { label: 'Save', style: 'primary', onclick: function () {
        var data = {};
        ['secondary_first_name','secondary_last_name','secondary_email','secondary_phone','secondary_relationship'].forEach(function (f) {
          var el = document.querySelector('[name="' + f + '"]');
          if (el && el.value.trim()) data[f] = el.value.trim();
        });
        if (!data.secondary_first_name) { CRM.toast('First name is required', 'warning'); return; }
        MallanAPI.clients.update(_clientId, data).then(function () {
          Object.assign(_client, data);
          CRM.toast('Person added', 'success');
          CRM.closeModal();
          _renderClientWorkspace(_container());
        }).catch(function (err) {
          CRM.toast('Error: ' + (err.message || 'Failed'), 'error');
        });
      }},
    ]);
  }

  function _linkPartner() {
    if (!_clientId) return;

    // Fetch all clients to show as options
    MallanAPI.clients.list({ limit: 200 }).then(function (res) {
      var clients = (res.clients || []).filter(function (c) { return String(c.id) !== String(_clientId); });
      if (clients.length === 0) { CRM.toast('No other clients to link', 'warning'); return; }

      var html = '<div class="space-y-4">' +
        '<div><label class="form-label">Select Partner / Family Member</label>' +
          '<select id="linkPartnerSelect" class="form-input">' +
            '<option value="">-- Choose --</option>';
      clients.forEach(function (c) {
        var name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || c.email;
        html += '<option value="' + c.id + '">' + E(name) + ' (' + E(c.email || '') + ')</option>';
      });
      html += '</select></div>' +
        '<div><label class="form-label">Relationship</label>' +
          '<select id="linkPartnerRelationship" class="form-input">' +
            '<option value="spouse">Spouse</option>' +
            '<option value="partner">Partner</option>' +
            '<option value="co-owner">Co-Owner</option>' +
            '<option value="co-applicant">Co-Applicant</option>' +
            '<option value="parent">Parent</option>' +
            '<option value="sibling">Sibling</option>' +
            '<option value="other">Other</option>' +
          '</select></div>' +
        '</div>';

      CRM.openModal('Link Partner / Family', html, [
        { label: 'Link', style: 'primary', onclick: function () {
          var partnerId = document.getElementById('linkPartnerSelect').value;
          var rel = document.getElementById('linkPartnerRelationship').value;
          if (!partnerId) { CRM.toast('Select a person', 'warning'); return; }

          MallanAPI._fetch('/api/crm/clients/' + _clientId + '/family', {
            method: 'POST',
            body: JSON.stringify({ member_lead_id: partnerId, relationship: rel }),
          }).then(function () {
            CRM.toast('Linked successfully', 'success');
            CRM.closeModal();
            _renderClientTab();
          }).catch(function (err) {
            CRM.toast('Error: ' + (err.message || 'Failed'), 'error');
          });
        }},
      ]);
    });
  }

  function _deleteClient() {
    if (!_clientId) return;
    var name = _client ? ((_client.first_name || '') + ' ' + (_client.last_name || '')).trim() : 'this client';
    if (!confirm('Delete ' + name + '? This cannot be undone.')) return;

    MallanAPI._fetch('/api/crm/clients/' + _clientId, { method: 'DELETE' }).then(function () {
      CRM.toast(name + ' deleted', 'success');
      Router.navigate('/ops/clients');
    }).catch(function (err) {
      CRM.toast('Delete failed: ' + (err.message || 'Unknown error'), 'error');
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

    // ── Load Sent Listings (API-first, fallback to Events) ──
    var sentEl = document.getElementById('wsClientSent');
    if (sentEl) {
      sentEl.innerHTML = UI.loading();
      _loadEngagementData(_clientId).then(function (eng) {
        var sends = eng.records.filter(function (r) { return r.type === 'listing_sent' || r.type === 'quick_send_executed'; });
        var reactions = eng.records.filter(function (r) { return r.type === 'listing_reaction_recorded'; });

        // Build reaction map
        var reactionMap = {};
        reactions.forEach(function (r) { if (r.listingId) reactionMap[r.listingId] = r.reaction; });

        if (sends.length === 0) {
          sentEl.innerHTML = '<p class="text-sm text-gray-500">No listings sent yet</p>';
        } else {
          // Get unique listing IDs
          var uniqueIds = sends.map(function (s) { return s.listingId; }).filter(Boolean);
          uniqueIds = uniqueIds.filter(function (v, i, a) { return a.indexOf(v) === i; });

          var sentDateMap = {};
          sends.forEach(function (s) { if (s.listingId) sentDateMap[s.listingId] = s.createdAt; });

          Promise.all(uniqueIds.slice(0, 20).map(function (id) {
            return MallanAPI.listings.get(id).then(function (d) { return d.listing || d; }).catch(function () { return null; });
          })).then(function (listings) {
            var validListings = listings.filter(Boolean);
            if (validListings.length === 0) {
              sentEl.innerHTML = '<p class="text-sm text-gray-500">Sent listing data unavailable</p>';
              return;
            }
            var html = '<div class="space-y-2">';
            html += '<div class="flex items-center gap-3 mb-2 text-xs text-gray-500"><span>Engagement rate: <strong>' + (eng.summary.engagementRate || 0) + '%</strong></span>' +
              '<span>Sends: ' + eng.summary.totalSends + '</span><span>Reactions: ' + eng.summary.totalReactions + '</span></div>';
            validListings.forEach(function (l) {
              var lid = l.id || l.listing_id || l.listingId;
              var reaction = reactionMap[lid];
              var reactionBadge = reaction ? '<span class="text-xs px-2 py-0.5 rounded-full ' +
                (reaction === 'liked' || reaction === 'like' ? 'bg-green-100 text-green-700' : reaction === 'disliked' || reaction === 'dislike' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700') +
                '">' + E(reaction) + '</span>' : '<span class="text-xs text-gray-400">No response</span>';
              html += '<div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gold-bg transition-all cursor-pointer" ' +
                'onclick="Router.navigate(\'/workspace/listing/' + E(lid) + '/overview\')">' +
                '<div class="flex-1 min-w-0">' +
                  '<p class="text-sm font-medium truncate">' + E(l.address || l.UnparsedAddress || 'Listing') + '</p>' +
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

        // Also render reactions in the reactions section
        var reactionEl = document.getElementById('wsClientReactions');
        if (reactionEl) {
          if (reactions.length === 0) {
            reactionEl.innerHTML = '<p class="text-sm text-gray-500">No reactions yet</p>';
          } else {
            _renderReactionCards(reactionEl, reactions);
          }
        }
      });

    }

    // ── Find & Send — auto-load smart matches, search refines ──
    var findEl = document.getElementById('wsFindAndSendResults');
    if (findEl) {
      var searchParams = {};
      if (prefs.neighborhoods && prefs.neighborhoods.length > 0) searchParams.neighborhood = prefs.neighborhoods[0];
      if (prefs.minPrice) searchParams.minPrice = prefs.minPrice;
      if (prefs.maxPrice) searchParams.maxPrice = prefs.maxPrice;
      if (prefs.minBeds) searchParams.minBeds = prefs.minBeds;

      // For renters: compute max budget from financial data in notes
      var isRenter = (cl.type || cl.client_type || cl.portal_role || '').toLowerCase() === 'renter';
      if (isRenter && !searchParams.maxPrice) {
        var notes = cl.notes || '';
        var incomeMatch = notes.match(/Annual Income:\s*\$?([\d,]+)/i);
        var debtMatch = notes.match(/Monthly Debt:\s*\$?([\d,]+)/i);
        var rentMatch = notes.match(/Monthly Rent:\s*\$?([\d,]+)/i);
        var addressMatch = notes.match(/Rental Address:\s*(.+)/i);

        if (incomeMatch) {
          var annualIncome = Number(incomeMatch[1].replace(/,/g, ''));
          var monthlyDebt = debtMatch ? Number(debtMatch[1].replace(/,/g, '')) : 0;
          var monthlyRent = rentMatch ? Number(rentMatch[1].replace(/,/g, '')) : 0;
          var maxMonthly = (annualIncome / 12) * 0.28 - monthlyDebt;
          if (maxMonthly > 0) {
            var r = 0.065 / 12;
            var n = 360;
            var maxPrice = Math.round(maxMonthly * ((Math.pow(1 + r, n) - 1) / (r * Math.pow(1 + r, n))));
            searchParams.maxPrice = maxPrice;
            if (!searchParams.minPrice) searchParams.minPrice = Math.round(maxPrice * 0.6);
          }
          // Try to get neighborhood from rental address
          if (addressMatch && !searchParams.neighborhood) {
            var addr = addressMatch[1].trim();
            // Extract neighborhood hint from address (e.g. "East 51st" → search nearby)
            searchParams.address = addr.split(',')[0];
          }
        }

        // Show buyer conversion banner
        if (searchParams.maxPrice) {
          findEl.innerHTML = '<div class="p-3 mb-3 bg-green-50 border border-green-200 rounded-lg">' +
            '<p class="text-sm font-semibold text-green-800"><i class="fas fa-exchange-alt mr-1"></i> Renter → Buyer: Showing listings this client could afford</p>' +
            '<p class="text-xs text-green-700 mt-1">Budget range: ' + $(searchParams.minPrice) + ' – ' + $(searchParams.maxPrice) +
            (monthlyRent ? ' · Current rent: ' + $(monthlyRent) + '/mo' : '') + '</p>' +
          '</div>' + UI.loading();
        }
      }

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

  // ─── Engagement data loader (API-first, Events fallback) ────────────
  function _loadEngagementData(clientId) {
    return MallanAPI._fetch('/api/crm/listing-engagement?client_id=' + encodeURIComponent(clientId))
      .then(function (data) {
        return data; // { records: [...], summary: {...} }
      })
      .catch(function () {
        // Fallback: build from Events
        var sentEvents = Events.getByEntity('client', clientId).filter(function (e) { return e.type === 'listing_sent' || e.type === 'quick_send_executed'; });
        var reactionEvents = Events.getByEntity('client', clientId).filter(function (e) { return e.type === 'listing_reaction_recorded'; });
        var records = [];
        sentEvents.forEach(function (e) {
          records.push({
            id: e.id, type: e.type,
            listingId: e.payload && (e.payload.listingId || e.payload.listing_id) || null,
            clientId: clientId, reaction: null,
            sentVia: e.payload && (e.payload.sentVia || e.payload.method) || 'manual',
            createdAt: e.createdAt, metadata: e.payload || {},
          });
        });
        reactionEvents.forEach(function (e) {
          records.push({
            id: e.id, type: e.type,
            listingId: e.payload && (e.payload.listingId || e.payload.listing_id) || null,
            clientId: clientId, reaction: e.payload && (e.payload.reaction || e.payload.type) || null,
            sentVia: null, createdAt: e.createdAt, metadata: e.payload || {},
          });
        });
        return {
          records: records,
          summary: {
            totalSends: sentEvents.length,
            totalReactions: reactionEvents.length,
            liked: reactionEvents.filter(function (e) { var r = e.payload && e.payload.reaction; return r === 'liked' || r === 'like'; }).length,
            disliked: reactionEvents.filter(function (e) { var r = e.payload && e.payload.reaction; return r === 'disliked' || r === 'dislike'; }).length,
            discussed: reactionEvents.filter(function (e) { var r = e.payload && e.payload.reaction; return r === 'discuss'; }).length,
            showings: 0,
            engagementRate: sentEvents.length > 0 ? Math.round((reactionEvents.length / sentEvents.length) * 100) : 0,
          },
        };
      });
  }

  function _renderReactionCards(container, reactions) {
    var sentimentConfig = {
      liked:    { icon: 'fa-thumbs-up',   bg: 'bg-green-50 border-green-200', iconColor: 'text-green-500', label: 'Liked' },
      like:     { icon: 'fa-thumbs-up',   bg: 'bg-green-50 border-green-200', iconColor: 'text-green-500', label: 'Liked' },
      disliked: { icon: 'fa-thumbs-down',  bg: 'bg-red-50 border-red-200',     iconColor: 'text-red-500',   label: 'Disliked' },
      dislike:  { icon: 'fa-thumbs-down',  bg: 'bg-red-50 border-red-200',     iconColor: 'text-red-500',   label: 'Disliked' },
      discuss:  { icon: 'fa-comment-dots', bg: 'bg-blue-50 border-blue-200',   iconColor: 'text-blue-500',  label: 'Discuss' },
    };
    var html = '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">';
    reactions.forEach(function (r) {
      var reaction = r.reaction || 'unknown';
      var cfg = sentimentConfig[reaction] || { icon: 'fa-circle', bg: 'bg-gray-50 border-gray-200', iconColor: 'text-gray-400', label: reaction };
      var lid = r.listingId || '';
      html += '<div class="p-3 rounded-lg border ' + cfg.bg + ' cursor-pointer" onclick="' + (lid ? "Router.navigate('/workspace/listing/" + E(lid) + "/overview')" : '') + '">' +
        '<div class="flex items-center gap-2 mb-1">' +
          '<i class="fas ' + cfg.icon + ' text-lg ' + cfg.iconColor + '"></i>' +
          '<span class="text-xs font-bold">' + E(cfg.label) + '</span>' +
        '</div>' +
        '<p class="text-xs text-gray-600 truncate">' + E(r.metadata && r.metadata.address || lid || 'Listing') + '</p>' +
        '<p class="text-[10px] text-gray-400">' + Utils.formatTimeAgo(r.createdAt) + '</p>' +
      '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
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
    MallanAPI._fetch('/api/crm/listing-sends', {
      method: 'POST',
      body: JSON.stringify({
        listing_id: listingId,
        client_ids: [_clientId],
        sent_via: 'workspace',
        context: { source: 'client_workspace', address: address }
      })
    }).then(function () {
      Events.log('listing_sent', 'client', _clientId, { listingId: listingId, address: address, sentAt: new Date().toISOString() });
      CRM.toast('Send recorded — listing sent to ' + (_client.name || 'client'), 'success');
    }).catch(function (err) {
      CRM.toast('Failed to save send: ' + (err.message || 'Please try again'), 'error');
    });
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
    var saveBtn = document.querySelector('[onclick*="_submitActivityNote"]');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

    _createNote(_clientId, content, 'activity').then(function () {
      CRM.closeModal();
      CRM.toast('Note added', 'success');
      _renderClientTab();
    }).catch(function (err) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Note'; }
      CRM.toast('Failed to save note: ' + (err.message || 'Please try again'), 'error');
    });
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
    var oldStage = _client.stage || _client.status || 'new';
    // Disable stage buttons while saving
    document.querySelectorAll('[onclick*="_moveStage"]').forEach(function (b) { b.disabled = true; });

    MallanAPI.clients.update(_clientId, { stage: newStage }).then(function () {
      Events.log('client_stage_moved', 'client', _clientId, { from: oldStage, to: newStage });
      _client.stage = newStage;
      CRM.toast('Stage updated to ' + newStage, 'success');
      _renderClientTab();
    }).catch(function (err) {
      // ROLLBACK — do NOT update stage
      CRM.toast('Failed to move stage: ' + (err.message || 'Please try again'), 'error');
      _renderClientTab(); // rerender with old stage
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

  var _scenariosCache = {};

  function _loadSavedScenarios(clientId) {
    // Return cached if available
    if (_scenariosCache[clientId]) return _scenariosCache[clientId];
    return [];
  }

  function _fetchScenarios(clientId) {
    // Fetch from API, fallback to localStorage migration
    return MallanAPI._fetch('/api/crm/financial-scenarios?client_id=' + encodeURIComponent(clientId))
      .then(function (data) {
        _scenariosCache[clientId] = data.scenarios || [];
        return _scenariosCache[clientId];
      })
      .catch(function () {
        // Fallback: migrate from localStorage if exists
        var key = 'mallan_crm_scenarios_' + clientId;
        try {
          var raw = localStorage.getItem(key);
          if (raw) {
            var local = JSON.parse(raw);
            _scenariosCache[clientId] = local;
            // Try to migrate to server
            local.forEach(function (s) {
              MallanAPI._fetch('/api/crm/financial-scenarios', {
                method: 'POST',
                body: JSON.stringify({ client_id: clientId, type: s.type, label: s.label, values: s.values }),
              }).catch(function () { /* migration best-effort */ });
            });
            localStorage.removeItem(key); // clean up after migration
            return local;
          }
        } catch (e) { /* ignore */ }
        _scenariosCache[clientId] = [];
        return [];
      });
  }

  function _saveScenario(type, label, values) {
    if (!_clientId) return;
    var scenario = {
      client_id: _clientId,
      type: type,
      label: label || type,
      values: values,
    };

    MallanAPI._fetch('/api/crm/financial-scenarios', {
      method: 'POST',
      body: JSON.stringify(scenario),
    }).then(function (res) {
      // Add to cache with server ID
      var saved = res.scenario || { id: Date.now().toString(36), type: type, label: label || type, values: values, date: new Date().toISOString() };
      if (!_scenariosCache[_clientId]) _scenariosCache[_clientId] = [];
      _scenariosCache[_clientId].push(saved);
      Events.log('scenario_saved', 'client', _clientId, { type: type, label: label });
      CRM.toast('Scenario saved', 'success');
      _renderSavedScenarios();
    }).catch(function (err) {
      // Do NOT add to cache or show success on failure
      CRM.toast('Failed to save scenario: ' + (err.message || 'Please try again'), 'error');
    });
  }

  function _deleteScenario(scenarioId) {
    if (!_clientId) return;
    MallanAPI._fetch('/api/crm/financial-scenarios/' + encodeURIComponent(scenarioId), { method: 'DELETE' })
      .catch(function () { /* best effort */ });
    _scenariosCache[_clientId] = (_scenariosCache[_clientId] || []).filter(function (s) { return s.id !== scenarioId; });
    CRM.toast('Scenario deleted', 'info');
    _renderSavedScenarios();
  }

  function _renderSavedScenarios() {
    var container = document.getElementById('wsSavedScenarios');
    if (!container) return;

    // Fetch from API if cache is empty
    if (!_scenariosCache[_clientId]) {
      container.innerHTML = UI.loading();
      _fetchScenarios(_clientId).then(function () { _renderSavedScenarios(); });
      return;
    }

    var scenarios = _scenariosCache[_clientId] || [];
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

    var saveBtn = document.querySelector('[onclick*="_submitShowingFeedback"]');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

    MallanAPI._fetch('/api/crm/showings/' + showingId, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }).then(function () {
      Events.log('showing_feedback_added', 'client', _clientId, { showingId: showingId, rating: body.rating, nextStep: nextStep });
      CRM.closeModal();
      CRM.toast('Feedback saved', 'success');
      _renderClientTab();
    }).catch(function (err) {
      // Do NOT log event or close modal on failure
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Save'; }
      CRM.toast('Failed to save feedback: ' + (err.message || 'Please try again'), 'error');
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

    // Include listing_id if available from listing workspace context
    if (_listingId) data.listing_id = _listingId;

    MallanAPI.showings.create(data).then(function () {
      Events.log('showing_scheduled', 'client', _clientId, { date: data.date, address: data.address, type: data.type, listing_id: data.listing_id });
      CRM.closeModal();
      CRM.toast('Showing scheduled', 'success');
      _renderClientTab();
    }).catch(function (err) {
      CRM.toast('Failed to schedule showing: ' + (err.message || 'Unknown error'), 'error');
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
    var docType = fd.get('docType');
    var notes = fd.get('notes');
    var sendBtn = document.querySelector('[onclick*="_submitDocRequest"]');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...'; }

    MallanAPI._fetch('/api/crm/document-requests', {
      method: 'POST',
      body: JSON.stringify({
        scope: 'client',
        scope_id: _clientId,
        doc_type: docType,
        title: docType,
        notes: notes
      })
    }).then(function () {
      Events.log('document_request_sent', 'client', _clientId, { doc_type: docType });
      CRM.closeSlideOver();
      CRM.toast('Document request submitted', 'success');
    }).catch(function (err) {
      if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Request'; }
      CRM.toast('Request failed: ' + (err.message || 'Try again'), 'error');
    });
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
      Events.log('agreement_template_generated', 'client', _clientId, { docType: docType, name: docName });
      CRM.toast('Draft agreement generated from template', 'success');
      _renderClientTab();
    }).catch(function (err) {
      CRM.toast('Failed to generate agreement: ' + (err.message || 'Please try again'), 'error');
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
    var raw = {};
    new FormData(form).forEach(function (v, k) { if (v) raw[k] = v; });

    // Map frontend field names to API field names
    var data = {};
    if (raw.name) {
      var parts = raw.name.split(/\s+/);
      data.first_name = parts[0] || '';
      data.last_name = parts.slice(1).join(' ') || '';
    }
    if (raw.email) data.email = raw.email;
    if (raw.phone) data.phone = raw.phone;
    if (raw.notes) data.notes = raw.notes;
    if (raw.source) data.source = raw.source;
    if (raw.type) {
      data.portal_role = raw.type;
      data.roles = [raw.type];
    }

    MallanAPI.clients.update(_clientId, data).then(function () {
      CRM.closeModal();
      CRM.toast('Client updated', 'success');
      openClient(_clientId, _clientTab);
    }).catch(function (err) { CRM.toast('Error: ' + (err.message || 'Could not save'), 'error'); });
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

    // Sticky action bar
    var isRental = /rent/i.test(l.PropertyType || l.property_type || l.PropertySubType || '');
    html += '<div class="workspace-action-bar">' +
      '<div class="action-group">' +
        '<button class="btn btn-sm btn-gold" onclick="CRM.quickSendListing()"><i class="fas fa-paper-plane"></i> <span class="hidden sm:inline">Send</span></button>' +
        (Permissions.canEditListing(l) ? '<button class="btn btn-sm btn-outline" onclick="window.open(\'/crm/' + (isRental ? 'rental' : 'sale') + '-listing?id=' + E(_listingId) + '\',\'_blank\')"><i class="fas fa-edit"></i> <span class="hidden sm:inline">Edit</span></button>' : '') +
        '<button class="btn btn-sm btn-outline" onclick="window.open(\'/crm/' + (isRental ? 'rental' : 'sale') + '-view?id=' + E(_listingId) + '\',\'_blank\')"><i class="fas fa-eye"></i> <span class="hidden sm:inline">View</span></button>' +
      '</div>' +
      '<div class="action-group">' +
        '<button class="btn btn-sm btn-outline" onclick="Panels._launchSearch(\'?compareContext=' + E(_listingId) + '\')"><i class="fas fa-search"></i> <span class="hidden sm:inline">Compare</span></button>' +
      '</div>' +
    '</div>';

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
        '<button class="w-full text-left text-sm p-2 rounded hover:bg-gray-50" onclick="Workspace.switchListingTab(\'media\')"><i class="fas fa-camera text-xs text-gray-400 mr-2"></i>Manage Photos</button>' +
        '<button class="w-full text-left text-sm p-2 rounded hover:bg-gray-50" onclick="Workspace.switchListingTab(\'compliance\')"><i class="fas fa-shield-alt text-xs text-gray-400 mr-2"></i>Run Audit</button>' +
      '</div></div>';

    // Listing Health Summary (computed from real data)
    var comp = Panels._computeListingCompliance(l);
    var photos = l.photos || l.Media || [];
    var dom = Number(l.cumulative_dom || l.days_on_market || 0);
    var healthIssues = 0;
    if (comp.issues.length > 0) healthIssues += comp.issues.length;
    if (photos.length === 0) healthIssues++;
    if (dom > 60) healthIssues++;
    var healthLabel = healthIssues === 0 ? 'Healthy' : healthIssues <= 2 ? 'Needs Attention' : 'At Risk';
    var healthColor = healthIssues === 0 ? '#059669' : healthIssues <= 2 ? '#F59E0B' : '#DC2626';
    var healthBg = healthIssues === 0 ? 'bg-green-50' : healthIssues <= 2 ? 'bg-yellow-50' : 'bg-red-50';

    html += '<div class="card p-3 ' + healthBg + '"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Listing Health</h4>' +
      '<div class="flex items-center gap-2 mb-2">' +
        '<span class="text-lg font-bold" style="color:' + healthColor + '">' + healthLabel + '</span>' +
      '</div>' +
      '<div class="space-y-1 text-xs">' +
        '<div class="flex justify-between"><span>Compliance</span><span class="font-bold" style="color:' + (comp.issues.length > 0 ? '#DC2626' : '#059669') + '">' + (comp.issues.length > 0 ? comp.issues.length + ' issues' : 'Clean') + '</span></div>' +
        '<div class="flex justify-between"><span>Photos</span><span class="font-bold" style="color:' + (photos.length === 0 ? '#DC2626' : photos.length < 3 ? '#F59E0B' : '#059669') + '">' + photos.length + ' uploaded</span></div>' +
        '<div class="flex justify-between"><span>DOM</span><span class="font-bold" style="color:' + (dom > 90 ? '#DC2626' : dom > 60 ? '#F59E0B' : '#059669') + '">' + dom + ' days</span></div>' +
      '</div>' +
      '<button class="btn btn-sm btn-outline w-full mt-2" onclick="Workspace.switchListingTab(\'health\')">View Details</button>' +
    '</div>';

    // Mini timeline (last 5 events)
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
      MallanAPI.agents.list().catch(function () { return { agents: [] }; }),
    ]).then(function (r) {
      _listingData.events = r[0] || [];
      _listingData.documents = r[1] || [];
      // Build agent lookup
      var agents = (r[2] && r[2].agents) ? r[2].agents : [];
      _listingData.agentMap = {};
      agents.forEach(function (a) {
        var id = a.id || a.agent_id;
        var name = a.name || ((a.first_name || '') + ' ' + (a.last_name || '')).trim() || a.email || id;
        if (id) _listingData.agentMap[id] = name;
      });
    }).catch(function () {});
  }

  // ─── Listing helpers ─────────────────────────────────────────────────

  function _severityBadge(severity) {
    var colors = { critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-gray-100 text-gray-600' };
    return '<span class="text-xs font-bold px-2 py-0.5 rounded-full ' + (colors[severity] || colors.medium) + '">' + E((severity || 'medium').toUpperCase()) + '</span>';
  }

  function _syncFreshnessBadge(syncedAt) {
    if (!syncedAt) return '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Unknown</span>';
    var diffMs = Date.now() - new Date(syncedAt).getTime();
    var diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours < 24) return '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Fresh</span>';
    var diffDays = diffHours / 24;
    if (diffDays < 7) return '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Stale (' + Math.floor(diffDays) + 'd ago)</span>';
    return '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Outdated (' + Math.floor(diffDays) + 'd ago)</span>';
  }

  function _sourceBadge(listing) {
    var isRLS = listing.rls_eligible !== false;
    var isManual = listing.source === 'manual' || listing.source === 'crm';
    var isWebOnly = listing.rls_eligible === false;
    if (isWebOnly) return '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Website-only</span>';
    if (isManual) return '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Manual</span>';
    if (listing.source === 'idx' || listing.source === 'IDX') return '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">IDX</span>';
    if (isRLS) return '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">RLS</span>';
    return '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">' + E(listing.source || 'Unknown') + '</span>';
  }

  function _resolveAgentName(agentId) {
    if (!agentId) return '-';
    if (_listingData.agentMap && _listingData.agentMap[agentId]) return _listingData.agentMap[agentId];
    return agentId;
  }

  function _computeHealthScore(l) {
    var photos = l.photos || l.Media || [];
    var dom = Number(l.cumulative_dom || l.days_on_market || 0);
    var comp = Panels._computeListingCompliance(l);
    var sentEvents = Events.getByEntity('listing', _listingId).filter(function (e) { return e.type === 'listing_sent' || e.type === 'quick_send_executed'; });
    var score = 100;
    var indicators = [];

    // 1. Stale DOM
    var domSeverity = dom > 90 ? 'critical' : dom > 60 ? 'warning' : 'good';
    if (dom > 90) score -= 25;
    else if (dom > 60) score -= 10;
    indicators.push({
      label: 'Days on Market',
      severity: domSeverity,
      value: dom + ' days',
      detail: dom > 90 ? 'Active for ' + dom + ' days — strongly consider a price adjustment or new marketing strategy' :
              dom > 60 ? 'Approaching stale territory — monitor closely and prepare contingency plan' :
              'Within normal range',
      action: dom > 60 ? '<button class="btn btn-xs btn-outline mt-1" onclick="window.open(\'/crm/sale-listing?id=' + E(_listingId) + '\',\'_blank\')">Adjust Price</button>' : '',
    });

    // 2. No Inquiries
    var inquiryEvents = Events.getByEntity('listing', _listingId).filter(function (e) { return e.type === 'inquiry_received'; });
    var recentInquiries = inquiryEvents.filter(function (e) { return (Date.now() - new Date(e.createdAt).getTime()) < 30 * 86400000; });
    var inqSeverity = recentInquiries.length === 0 && dom > 14 ? 'warning' : recentInquiries.length === 0 && dom > 30 ? 'critical' : 'good';
    if (recentInquiries.length === 0 && dom > 30) score -= 20;
    else if (recentInquiries.length === 0 && dom > 14) score -= 10;
    indicators.push({
      label: 'Inquiry Activity',
      severity: inqSeverity,
      value: recentInquiries.length + ' in last 30 days',
      detail: recentInquiries.length === 0 && dom > 14 ? 'No inquiries received — listing may need better marketing, new photos, or price adjustment' :
              recentInquiries.length > 0 ? recentInquiries.length + ' recent inquiries show active interest' :
              'New listing — allow time for market exposure',
      action: recentInquiries.length === 0 && dom > 14 ? '<button class="btn btn-xs btn-outline mt-1" onclick="CRM.quickSendListing()">Push to Clients</button>' : '',
    });

    // 3. Low Engagement
    var sendCount = sentEvents.length;
    var reactionEvents = Events.getByEntity('listing', _listingId).filter(function (e) {
      return e.type === 'client_liked' || e.type === 'client_disliked' || e.type === 'client_discuss';
    });
    var reactionRate = sendCount > 0 ? Math.round((reactionEvents.length / sendCount) * 100) : 0;
    var engSeverity = sendCount > 3 && reactionRate < 20 ? 'warning' : sendCount > 5 && reactionRate < 10 ? 'critical' : 'good';
    if (sendCount > 5 && reactionRate < 10) score -= 15;
    else if (sendCount > 3 && reactionRate < 20) score -= 8;
    indicators.push({
      label: 'Client Engagement',
      severity: engSeverity,
      value: sendCount + ' sends, ' + reactionEvents.length + ' reactions (' + reactionRate + '%)',
      detail: sendCount === 0 ? 'Not yet sent to any clients' :
              reactionRate < 20 && sendCount > 3 ? 'Low reaction rate — listing may not match client criteria well' :
              'Engagement is within normal range',
      action: sendCount === 0 ? '<button class="btn btn-xs btn-gold mt-1" onclick="CRM.quickSendListing()">Send Now</button>' : '',
    });

    // 4. Pricing Risk (placeholder — needs market data, will be filled async)
    indicators.push({
      label: 'Pricing Risk',
      severity: 'good',
      value: 'Checking...',
      detail: 'Comparing to neighborhood median',
      action: '',
      id: 'healthPricingRisk',
    });

    // 5. Compliance Risk
    var compIssues = comp.issues.length;
    var compSeverity = comp.status === 'violation' ? 'critical' : compIssues > 0 ? 'warning' : 'good';
    if (comp.status === 'violation') score -= 30;
    else if (compIssues > 0) score -= 10;
    indicators.push({
      label: 'Compliance Risk',
      severity: compSeverity,
      value: compIssues === 0 ? 'No issues' : compIssues + ' issue(s) found',
      detail: compIssues > 0 ? comp.issues.map(function (i) { return i.description; }).join('; ') : 'All compliance checks pass',
      action: compIssues > 0 ? '<button class="btn btn-xs btn-outline mt-1" onclick="Workspace.switchListingTab(\'compliance\')">View Issues</button>' : '',
    });

    // 6. Media Quality
    var photoCount = photos.length;
    var mediaSeverity = photoCount === 0 ? 'critical' : photoCount < 3 ? 'warning' : 'good';
    if (photoCount === 0) score -= 25;
    else if (photoCount < 3) score -= 10;
    // Check primary photo staleness
    var primaryStale = false;
    if (photos.length > 0) {
      var firstPhoto = photos[0];
      var photoDate = firstPhoto.modificationTimestamp || firstPhoto.modification_timestamp || firstPhoto.created_at;
      if (photoDate && (Date.now() - new Date(photoDate).getTime()) > 90 * 86400000) {
        primaryStale = true;
        if (mediaSeverity === 'good') mediaSeverity = 'warning';
        score -= 5;
      }
    }
    indicators.push({
      label: 'Media Quality',
      severity: mediaSeverity,
      value: photoCount + ' photo(s)' + (primaryStale ? ' (primary may be stale)' : ''),
      detail: photoCount === 0 ? 'No photos uploaded — this critically impacts listing performance' :
              photoCount < 3 ? 'Only ' + photoCount + ' photo(s) — recommend at least 3 for best results' :
              primaryStale ? 'Primary photo is over 90 days old — consider refreshing' :
              photoCount + ' photos uploaded',
      action: photoCount < 3 ? '<button class="btn btn-xs btn-outline mt-1" onclick="Workspace.switchListingTab(\'media\')">Add Photos</button>' : '',
    });

    score = Math.max(0, Math.min(100, score));
    return { score: score, indicators: indicators };
  }

  // ─── Listing Tab: Overview ───────────────────────────────────────────
  function _listingOverview(el) {
    var l = _listing;
    var agentId = l.assignedAgentId || l.assigned_agent_id || l.agent_id;
    var agentName = _resolveAgentName(agentId) || l.agent_name || '-';
    var syncedAt = l.syncedAt || l.synced_at || l.updated_at || l.updatedAt;

    var html = '<div class="space-y-4">';

    // Key stats row
    html += '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">' +
      '<div><p class="text-xs font-bold text-gray-500 uppercase">Beds</p><p class="text-lg font-bold">' + (l.BedroomsTotal || l.beds || '-') + '</p></div>' +
      '<div><p class="text-xs font-bold text-gray-500 uppercase">Baths</p><p class="text-lg font-bold">' + (l.BathroomsTotalInteger || l.baths || '-') + '</p></div>' +
      '<div><p class="text-xs font-bold text-gray-500 uppercase">SqFt</p><p class="text-lg font-bold">' + (l.LivingArea || l.sqft ? Number(l.LivingArea || l.sqft).toLocaleString() : '-') + '</p></div>' +
      '<div><p class="text-xs font-bold text-gray-500 uppercase">Type</p><p class="text-lg font-bold">' + E(l.PropertySubType || l.property_type || '-') + '</p></div>' +
    '</div>';

    // Connected clients (sent to)
    var sentEvents = Events.getByEntity('listing', _listingId).filter(function(e) { return e.type === 'listing_sent'; });
    if (sentEvents.length > 0) {
      html += '<div class="flex flex-wrap gap-2 mb-3">';
      var seenClients = {};
      var chipCount = 0;
      sentEvents.forEach(function(e) {
        var cid = e.payload && (e.payload.clientId || e.payload.client_id);
        var cname = e.payload && (e.payload.clientName || e.payload.client_name);
        if (cid && !seenClients[cid] && chipCount < 5) {
          seenClients[cid] = true;
          chipCount++;
          html += '<span class="ws-connection client" onclick="CRM.navigateToConnected(\'client\',\'' + E(cid) + '\')"><i class="fas fa-user mr-1"></i>' + E(cname || cid.substring(0, 8)) + '</span>';
        }
      });
      html += '</div>';
    }

    // Details + Financials
    html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
      '<div class="space-y-2">' +
        '<h3 class="text-sm font-bold text-gray-700">Details</h3>' +
        _infoRow('MLS ID', l.mlsId || l.ListingId || l.listing_id) +
        _infoRow('Status', l.status || l.StandardStatus) +
        _infoRow('List Date', D(l.ListDate || l.list_date || l.created_at)) +
        _infoRow('DOM', l.cumulative_dom || l.days_on_market || '0') +
        '<div class="flex justify-between"><span class="text-xs text-gray-500">Owner Agent</span><span class="text-sm font-medium">' + E(agentName) + '</span></div>' +
        '<div class="flex justify-between items-center"><span class="text-xs text-gray-500">Source</span>' + _sourceBadge(l) + '</div>' +
        '<div class="flex justify-between items-center"><span class="text-xs text-gray-500">Synced</span><span>' + _syncFreshnessBadge(syncedAt) + (syncedAt ? ' <span class="text-xs text-gray-400 ml-1">' + D(syncedAt) + '</span>' : '') + '</span></div>' +
      '</div>' +
      '<div class="space-y-2">' +
        '<h3 class="text-sm font-bold text-gray-700">Financials</h3>' +
        _infoRow('List Price', $(l.ListPrice || l.price)) +
        _infoRow('Common Charges', l.CommonCharges ? $(l.CommonCharges) + '/mo' : '-') +
        _infoRow('RE Taxes', l.TaxAnnualAmount ? $(l.TaxAnnualAmount) + '/yr' : '-') +
        _infoRow('Maintenance', l.MaintenanceFee ? $(l.MaintenanceFee) + '/mo' : '-') +
      '</div>' +
    '</div>';

    // Quick Market Comparison card
    html += '<div id="overviewMarketComp" class="card p-4 border-l-4 border-gray-200">' +
      '<h3 class="text-sm font-bold text-gray-700 mb-2">Quick Market Comparison</h3>' +
      '<p class="text-xs text-gray-400">Loading neighborhood data...</p>' +
    '</div>';

    // Description
    if (l.PublicRemarks || l.description) {
      html += '<div><h3 class="text-sm font-bold text-gray-700 mb-2">Description</h3>' +
        '<p class="text-sm text-gray-600">' + E(l.PublicRemarks || l.description) + '</p></div>';
    }

    html += '</div>';
    el.innerHTML = html;

    // Fetch market comparison async
    var neighborhood = l.neighborhood || l.City || l.area || '';
    var listPrice = Number(l.ListPrice || l.price || 0);
    if (neighborhood && listPrice > 0) {
      MallanAPI._fetch('/api/crm/market-report', {
        method: 'POST',
        body: JSON.stringify({ neighborhood: neighborhood, property_type: l.PropertySubType || l.property_type || '' }),
      }).then(function (data) {
        var median = data.median_price || data.medianPrice || 0;
        var compEl = document.getElementById('overviewMarketComp');
        if (!compEl || !median) return;
        var diff = listPrice - median;
        var pct = Math.round((diff / median) * 100);
        var isAbove = diff > 0;
        var color = isAbove ? (pct > 15 ? '#DC2626' : '#F59E0B') : (pct < -15 ? '#059669' : '#059669');
        var label = isAbove ? 'Above market' : 'Below market';
        compEl.style.borderLeftColor = color;
        compEl.innerHTML = '<h3 class="text-sm font-bold text-gray-700 mb-2">Quick Market Comparison</h3>' +
          '<div class="flex items-center justify-between">' +
            '<div>' +
              '<p class="text-xs text-gray-500">Neighborhood median: ' + $(median) + '</p>' +
              '<p class="text-sm font-bold mt-1" style="color:' + color + '">' + label + ' by ' + Math.abs(pct) + '%</p>' +
            '</div>' +
            '<div class="text-right">' +
              '<p class="text-xs text-gray-500">This listing</p>' +
              '<p class="text-lg font-bold text-gold">' + $(listPrice) + '</p>' +
            '</div>' +
          '</div>';
      }).catch(function () {
        var compEl = document.getElementById('overviewMarketComp');
        if (compEl) compEl.innerHTML = '<h3 class="text-sm font-bold text-gray-700 mb-2">Quick Market Comparison</h3>' +
          '<p class="text-xs text-gray-400">Market data not available for this area</p>';
      });
    } else {
      var compEl = document.getElementById('overviewMarketComp');
      if (compEl) compEl.innerHTML = '<h3 class="text-sm font-bold text-gray-700 mb-2">Quick Market Comparison</h3>' +
        '<p class="text-xs text-gray-400">Insufficient data for market comparison</p>';
    }
  }

  // ─── Listing Tab: Media ──────────────────────────────────────────────
  function _listingMedia(el) {
    var l = _listing;
    var photos = l.photos || l.Media || [];
    var html = '<div class="space-y-4">';

    // Header with count + upload button
    html += '<div class="flex items-center justify-between">' +
      '<h3 class="text-sm font-bold text-gray-700">Photos & Media (' + photos.length + ')</h3>' +
      '<button class="btn btn-sm btn-gold" onclick="Panels._uploadDoc(\'listing\',\'' + E(_listingId) + '\')"><i class="fas fa-upload"></i> Upload Photos</button>' +
    '</div>';

    // Warnings
    if (photos.length === 0) {
      html += '<div class="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-3">' +
        '<i class="fas fa-exclamation-triangle text-red-600"></i>' +
        '<div><p class="text-sm font-bold text-red-700">No photos uploaded</p>' +
          '<p class="text-xs text-red-600">This listing needs media to perform well on IDX and syndication platforms</p></div>' +
      '</div>';
    } else {
      // Check primary photo staleness
      var firstPhoto = photos[0];
      var photoDate = firstPhoto.modificationTimestamp || firstPhoto.modification_timestamp || firstPhoto.created_at;
      if (photoDate && (Date.now() - new Date(photoDate).getTime()) > 90 * 86400000) {
        html += '<div class="p-3 rounded-lg bg-yellow-50 border border-yellow-200 flex items-center gap-3">' +
          '<i class="fas fa-exclamation-triangle text-yellow-600"></i>' +
          '<div><p class="text-sm font-bold text-yellow-700">Primary photo may be stale</p>' +
            '<p class="text-xs text-yellow-600">The lead photo is over 90 days old — consider replacing it with a fresh image</p></div>' +
        '</div>';
      }
    }

    // Photo grid with drag handles
    if (photos.length > 0) {
      html += '<div id="lMediaGrid" class="grid grid-cols-2 sm:grid-cols-3 gap-3">';
      photos.forEach(function (p, idx) {
        var url = Utils.photoUrl(p.url || p.MediaURL || p);
        html += '<div class="relative aspect-[4/3] rounded-lg overflow-hidden bg-gray-100 group" draggable="true" data-photo-idx="' + idx + '" ' +
          'ondragstart="Workspace._onPhotoDragStart(event,' + idx + ')" ondragover="event.preventDefault()" ondrop="Workspace._onPhotoDrop(event,' + idx + ')">' +
          '<img src="' + E(url) + '" class="w-full h-full object-cover" alt="Photo ' + (idx + 1) + '" onerror="this.style.display=\'none\'">' +
          '<div class="absolute top-1 left-1 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded cursor-grab opacity-0 group-hover:opacity-100 transition-opacity">' +
            '<i class="fas fa-grip-vertical"></i> ' + (idx + 1) +
          '</div>' +
          (idx === 0 ? '<div class="absolute bottom-1 left-1 bg-gold text-white text-xs px-1.5 py-0.5 rounded font-bold">Primary</div>' : '') +
        '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    el.innerHTML = html;
  }

  var _dragPhotoIdx = null;
  function _onPhotoDragStart(event, idx) {
    _dragPhotoIdx = idx;
    event.dataTransfer.effectAllowed = 'move';
  }
  function _onPhotoDrop(event, targetIdx) {
    event.preventDefault();
    if (_dragPhotoIdx === null || _dragPhotoIdx === targetIdx) return;
    var photos = _listing.photos || _listing.Media || [];
    if (_dragPhotoIdx >= photos.length || targetIdx >= photos.length) return;
    var fromIdx = _dragPhotoIdx;
    // Reorder in local data (optimistic)
    var moved = photos.splice(_dragPhotoIdx, 1)[0];
    photos.splice(targetIdx, 0, moved);
    _dragPhotoIdx = null;
    // Re-render
    var el = document.getElementById('wsListingContent');
    if (el) _listingMedia(el);
    // Build ordered IDs for API
    var newOrder = photos.map(function (p) { return p.id || p.MediaKey || p.media_id || p.url || ''; });
    // Persist to API
    MallanAPI._fetch('/api/crm/listings/' + encodeURIComponent(_listingId) + '/media-order', {
      method: 'PATCH',
      body: JSON.stringify({ ordered_media_ids: newOrder })
    }).then(function () {
      Events.log('photo_reorder', 'listing', _listingId, { from: fromIdx, to: targetIdx });
      CRM.toast('Photo order updated', 'success');
    }).catch(function (err) {
      CRM.toast('Photo order not saved: ' + (err.message || 'retry'), 'error');
      // Rollback: rerender media tab
      _renderListingTab();
    });
  }

  // ─── Listing Tab: Compliance ─────────────────────────────────────────
  function _listingCompliance(el) {
    var l = _listing;
    var comp = Panels._computeListingCompliance(l);
    var issues = comp.issues;

    // Group issues by type
    var groups = {};
    var groupOrder = ['Fair Housing', 'Feed/Display Problems', 'Media Issues', 'Protected Periods', 'Stale Listings'];
    issues.forEach(function (issue) {
      var group = issue.type || 'Other';
      if (!groups[group]) groups[group] = [];
      groups[group].push(issue);
    });

    // Compute score
    var criticalCount = issues.filter(function (i) { return i.severity === 'critical'; }).length;
    var highCount = issues.filter(function (i) { return i.severity === 'high'; }).length;
    var mediumCount = issues.filter(function (i) { return i.severity === 'medium'; }).length;
    var totalScore = Math.max(0, 100 - (criticalCount * 30) - (highCount * 15) - (mediumCount * 5));
    var scoreColor = totalScore >= 80 ? '#059669' : totalScore >= 50 ? '#F59E0B' : '#DC2626';
    var scoreLabel = totalScore >= 80 ? 'Compliant' : totalScore >= 50 ? 'Needs Attention' : 'Non-Compliant';

    var html = '<div class="space-y-4">';

    // Score header
    html += '<div class="flex items-center justify-between">' +
      '<h3 class="text-sm font-bold text-gray-700">Compliance Audit</h3>' +
      '<button class="btn btn-sm btn-outline" onclick="Workspace._runComplianceCheck()"><i class="fas fa-sync"></i> Run Full Audit</button>' +
    '</div>' +
    '<div class="card p-4 flex items-center gap-4">' +
      '<div class="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white" style="background:' + scoreColor + '">' + totalScore + '</div>' +
      '<div>' +
        '<p class="text-lg font-bold" style="color:' + scoreColor + '">' + scoreLabel + '</p>' +
        '<p class="text-xs text-gray-500">' + issues.length + ' issue(s) found — ' + criticalCount + ' critical, ' + highCount + ' high, ' + mediumCount + ' medium</p>' +
      '</div>' +
    '</div>';

    if (issues.length === 0) {
      html += '<div class="p-4 rounded-lg bg-green-50 text-center">' +
        '<i class="fas fa-check-circle text-green-600 text-2xl mb-2"></i>' +
        '<p class="text-sm font-bold text-green-700">All compliance checks pass</p>' +
        '<p class="text-xs text-green-600 mt-1">No Fair Housing, distribution, or data quality issues detected</p>' +
      '</div>';
    } else {
      // Render grouped issues
      groupOrder.forEach(function (groupName) {
        var groupIssues = groups[groupName];
        if (!groupIssues || groupIssues.length === 0) return;
        html += '<div class="space-y-2">' +
          '<h4 class="text-xs font-bold text-gray-500 uppercase">' + E(groupName) + ' (' + groupIssues.length + ')</h4>';
        groupIssues.forEach(function (issue) {
          var fixAction = _complianceFixAction(issue, l);
          html += '<div class="p-3 rounded-lg bg-gray-50 border-l-4" style="border-left-color:' + (issue.severity === 'critical' ? '#DC2626' : issue.severity === 'high' ? '#F59E0B' : '#6B7280') + '">' +
            '<div class="flex items-start justify-between gap-2">' +
              '<div class="flex-1">' +
                '<div class="flex items-center gap-2 mb-1">' + _severityBadge(issue.severity) + '</div>' +
                '<p class="text-sm font-medium">' + E(issue.description) + '</p>' +
                '<p class="text-xs text-gray-500 mt-1">' + E(fixAction.hint) + '</p>' +
              '</div>' +
              (fixAction.button || '') +
            '</div>' +
          '</div>';
        });
        html += '</div>';
      });
      // Render any ungrouped
      Object.keys(groups).forEach(function (g) {
        if (groupOrder.indexOf(g) >= 0) return;
        var groupIssues = groups[g];
        html += '<div class="space-y-2"><h4 class="text-xs font-bold text-gray-500 uppercase">' + E(g) + '</h4>';
        groupIssues.forEach(function (issue) {
          html += '<div class="p-3 rounded-lg bg-gray-50">' + _severityBadge(issue.severity) +
            '<p class="text-sm font-medium mt-1">' + E(issue.description) + '</p></div>';
        });
        html += '</div>';
      });
    }

    html += '</div>';
    el.innerHTML = html;
  }

  function _complianceFixAction(issue, listing) {
    var type = issue.type || '';
    var desc = (issue.description || '').toLowerCase();
    if (type === 'Fair Housing Risk') {
      return { hint: 'Review and edit the listing description to remove flagged language',
        button: '<button class="btn btn-xs btn-outline flex-shrink-0" onclick="window.open(\'/crm/sale-listing?id=' + E(_listingId) + '\',\'_blank\')">Fix Now</button>' };
    }
    if (desc.indexOf('no photos') >= 0 || desc.indexOf('photo') >= 0) {
      return { hint: 'Upload property photos to meet media requirements',
        button: '<button class="btn btn-xs btn-outline flex-shrink-0" onclick="Workspace.switchListingTab(\'media\')">Add Photos</button>' };
    }
    if (desc.indexOf('idx display') >= 0) {
      return { hint: 'Enable IDX display in the listing form Distribution tab',
        button: '<button class="btn btn-xs btn-outline flex-shrink-0" onclick="window.open(\'/crm/sale-listing?id=' + E(_listingId) + '\',\'_blank\')">Fix Now</button>' };
    }
    if (desc.indexOf('price') >= 0 && desc.indexOf('missing') >= 0) {
      return { hint: 'Add a list price to the listing',
        button: '<button class="btn btn-xs btn-outline flex-shrink-0" onclick="window.open(\'/crm/sale-listing?id=' + E(_listingId) + '\',\'_blank\')">Fix Now</button>' };
    }
    if (desc.indexOf('address') >= 0 && desc.indexOf('missing') >= 0) {
      return { hint: 'Add a valid address to the listing',
        button: '<button class="btn btn-xs btn-outline flex-shrink-0" onclick="window.open(\'/crm/sale-listing?id=' + E(_listingId) + '\',\'_blank\')">Fix Now</button>' };
    }
    if (desc.indexOf('owner opt-out') >= 0) {
      return { hint: 'This listing has Owner Opt-Out enabled — it must not be displayed publicly per REBNY rules', button: '' };
    }
    if (desc.indexOf('hold') >= 0 || desc.indexOf('coming soon') >= 0) {
      return { hint: 'Review protected period status and update status if applicable',
        button: '<button class="btn btn-xs btn-outline flex-shrink-0" onclick="window.open(\'/crm/sale-listing?id=' + E(_listingId) + '\',\'_blank\')">Review</button>' };
    }
    if (desc.indexOf('stale') >= 0 || desc.indexOf('active for') >= 0) {
      return { hint: 'Consider a price adjustment or new marketing strategy',
        button: '<button class="btn btn-xs btn-outline flex-shrink-0" onclick="window.open(\'/crm/sale-listing?id=' + E(_listingId) + '\',\'_blank\')">Adjust</button>' };
    }
    return { hint: 'Review and address this issue in the listing form', button: '' };
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
      // Re-render compliance tab with fresh data
      var el = document.getElementById('wsListingContent');
      if (el && _listingTab === 'compliance') _listingCompliance(el);
    }).catch(function () { CRM.toast('Audit complete', 'info'); });
  }

  // ─── Listing Tab: Sent To Clients ────────────────────────────────────
  function _listingSent(el) {
    var sentEvents = Events.getByEntity('listing', _listingId).filter(function (e) {
      return e.type === 'listing_sent' || e.type === 'quick_send_executed';
    });

    var html = '<div class="space-y-4">';
    html += '<div class="flex items-center justify-between">' +
      '<h3 class="text-sm font-bold text-gray-700">Sent To Clients (' + sentEvents.length + ')</h3>' +
      '<button class="btn btn-sm btn-gold" onclick="CRM.quickSendListing()"><i class="fas fa-paper-plane"></i> Send Now</button>' +
    '</div>';

    if (sentEvents.length === 0) {
      html += UI.emptyState('fa-paper-plane', 'Not sent to any clients yet',
        '<button class="btn btn-sm btn-gold" onclick="CRM.quickSendListing()"><i class="fas fa-paper-plane"></i> Send Now</button>');
      html += '</div>';
      el.innerHTML = html;
      return;
    }

    // Resolve client names + reactions
    var allReactions = Events.getByEntity('listing', _listingId).filter(function (e) {
      return e.type === 'client_liked' || e.type === 'client_disliked' || e.type === 'client_discuss';
    });
    var reactionByClient = {};
    allReactions.forEach(function (r) {
      var cid = r.payload ? (r.payload.clientId || r.payload.client_id) : null;
      if (cid) reactionByClient[cid] = r.type;
    });

    html += '<div class="space-y-2">';
    sentEvents.forEach(function (e) {
      var payload = e.payload || {};
      var clientIds = payload.clientIds || payload.client_ids || [];
      var sendType = payload.sendType || payload.send_type || 'Manual';
      var sendTypeLabels = { manual: 'Manual', quick_send: 'Quick Send', auto_alert: 'Auto-Alert', eblast: 'eBlast' };
      var sendLabel = sendTypeLabels[sendType.toLowerCase()] || sendType;
      var sentDate = e.createdAt || e.created_at;
      var daysSinceSent = sentDate ? Math.floor((Date.now() - new Date(sentDate).getTime()) / 86400000) : 0;

      if (clientIds.length === 0 && payload.clientName) {
        // Single client send
        var reaction = reactionByClient[payload.clientId || payload.client_id];
        var reactionIcon = reaction === 'client_liked' ? '<i class="fas fa-heart text-red-500 ml-1" title="Liked"></i>' :
                           reaction === 'client_disliked' ? '<i class="fas fa-thumbs-down text-gray-400 ml-1" title="Disliked"></i>' :
                           reaction === 'client_discuss' ? '<i class="fas fa-comment text-blue-500 ml-1" title="Let\'s Discuss"></i>' :
                           (daysSinceSent > 7 ? '<span class="text-xs text-gray-400 ml-1">No response</span>' :
                            '<span class="text-xs text-gray-400 ml-1">Pending</span>');
        html += '<div class="card p-3 flex items-center justify-between">' +
          '<div class="flex items-center gap-3">' +
            UI.avatar(payload.clientName, 28) +
            '<div>' +
              '<p class="text-sm font-medium">' + E(payload.clientName) + ' ' + (reactionIcon || '') + '</p>' +
              '<p class="text-xs text-gray-500">' + Utils.formatTimeAgo(sentDate) + '</p>' +
            '</div>' +
          '</div>' +
          '<span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">' + E(sendLabel) + '</span>' +
        '</div>';
      } else {
        // Batch send
        html += '<div class="card p-3">' +
          '<div class="flex items-center justify-between mb-2">' +
            '<p class="text-sm font-medium">Sent to ' + (clientIds.length || 'multiple') + ' client(s)</p>' +
            '<span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">' + E(sendLabel) + '</span>' +
          '</div>' +
          '<p class="text-xs text-gray-500">' + Utils.formatTimeAgo(sentDate) + '</p>';
        if (clientIds.length > 0) {
          html += '<div class="flex flex-wrap gap-1 mt-2">';
          clientIds.forEach(function (cid) {
            var clientName = (Store.getClient && Store.getClient(cid)) ? (Store.getClient(cid).name || cid) : cid;
            var reaction = reactionByClient[cid];
            var icon = reaction === 'client_liked' ? ' <i class="fas fa-heart text-red-500"></i>' :
                       reaction === 'client_disliked' ? ' <i class="fas fa-thumbs-down text-gray-400"></i>' :
                       reaction === 'client_discuss' ? ' <i class="fas fa-comment text-blue-500"></i>' : '';
            html += '<span class="text-xs px-2 py-1 rounded bg-gray-50 cursor-pointer hover:bg-gray-100" onclick="Workspace.openClient(\'' + E(cid) + '\')">' + E(clientName) + icon + '</span>';
          });
          html += '</div>';
        }
        html += '</div>';
      }
    });
    html += '</div></div>';
    el.innerHTML = html;
  }

  // ─── Listing Tab: Inquiries ──────────────────────────────────────────
  function _listingInquiries(el) {
    MallanAPI._fetch('/api/crm/inquiries?listing_id=' + _listingId + '&limit=50')
      .then(function (data) {
        var inquiries = data.inquiries || [];
        var html = '<div class="space-y-4">';
        html += '<div class="flex items-center justify-between">' +
          '<h3 class="text-sm font-bold text-gray-700">Inquiries (' + inquiries.length + ')</h3>' +
        '</div>';

        if (inquiries.length === 0) {
          html += UI.emptyState('fa-inbox', 'No inquiries for this listing',
            '<p class="text-xs text-gray-400 mt-2">Inquiries from mallan.nyc, StreetEasy, and other platforms will appear here</p>');
          html += '</div>';
          el.innerHTML = html;
          return;
        }

        html += '<div class="space-y-3">';
        inquiries.forEach(function (inq, idx) {
          var inqId = inq.id || inq.inquiry_id || idx;
          var name = inq.name || ((inq.first_name || '') + ' ' + (inq.last_name || '')).trim() || 'Unknown';
          var email = inq.email || '';
          var phone = inq.phone || '';
          var source = inq.source || 'Website';
          var sourceColors = { Website: 'bg-blue-100 text-blue-700', StreetEasy: 'bg-purple-100 text-purple-700', Zillow: 'bg-teal-100 text-teal-700', 'Realtor.com': 'bg-red-100 text-red-700' };
          var sourceBadge = '<span class="text-xs font-bold px-2 py-0.5 rounded-full ' + (sourceColors[source] || 'bg-gray-100 text-gray-600') + '">' + E(source) + '</span>';

          html += '<div class="card p-4">' +
            '<div class="flex items-start justify-between">' +
              '<div class="flex items-center gap-3">' +
                UI.avatar(name, 32) +
                '<div>' +
                  '<p class="text-sm font-bold">' + E(name) + '</p>' +
                  '<div class="flex items-center gap-2 mt-0.5">' +
                    (email ? '<span class="text-xs text-gray-500"><i class="fas fa-envelope text-gray-400 mr-1"></i>' + E(email) + '</span>' : '') +
                    (phone ? '<span class="text-xs text-gray-500"><i class="fas fa-phone text-gray-400 mr-1"></i>' + E(phone) + '</span>' : '') +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div class="flex items-center gap-2">' +
                sourceBadge +
                '<span class="text-xs text-gray-400">' + Utils.formatTimeAgo(inq.created_at || inq.createdAt) + '</span>' +
              '</div>' +
            '</div>';

          if (inq.message) {
            html += '<p class="text-sm text-gray-600 mt-2 pl-11">' + E(inq.message) + '</p>';
          }

          // Action buttons
          html += '<div class="flex gap-2 mt-3 pl-11">' +
            '<button class="btn btn-xs btn-gold" onclick="Workspace._convertInquiryToLead(\'' + E(inqId) + '\',\'' + E(name) + '\',\'' + E(email) + '\',\'' + E(phone) + '\',\'' + E(source) + '\')"><i class="fas fa-user-plus"></i> Convert to Lead</button>' +
            '<button class="btn btn-xs btn-outline" onclick="Workspace._createClientFromInquiry(\'' + E(name) + '\',\'' + E(email) + '\',\'' + E(phone) + '\')"><i class="fas fa-address-card"></i> Create Client</button>' +
            (email ? '<a class="btn btn-xs btn-outline" href="mailto:' + E(email) + '?subject=' + encodeURIComponent('RE: ' + (_listing.address || _listing.UnparsedAddress || 'Your Inquiry')) + '"><i class="fas fa-reply"></i> Respond</a>' : '') +
          '</div>' +
          '</div>';
        });
        html += '</div></div>';
        el.innerHTML = html;
      })
      .catch(function () {
        el.innerHTML = '<div class="space-y-4"><h3 class="text-sm font-bold text-gray-700">Inquiries</h3>' +
          UI.emptyState('fa-inbox', 'Could not load inquiries') + '</div>';
      });
  }

  function _convertInquiryToLead(inqId, name, email, phone, source) {
    MallanAPI._fetch('/api/crm/leads', {
      method: 'POST',
      body: JSON.stringify({
        name: name, email: email, phone: phone, source: source || 'inquiry',
        listing_id: _listingId, notes: 'Converted from inquiry #' + inqId,
      }),
    }).then(function () {
      Events.log({ type: 'inquiry_converted', entityType: 'listing', entityId: _listingId, payload: { inquiryId: inqId, name: name } });
      CRM.toast('Lead created for ' + name, 'success');
    }).catch(function (err) {
      CRM.toast('Could not create lead: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  function _createClientFromInquiry(name, email, phone) {
    CRM.quickNewClient();
    // Pre-fill form fields after modal opens
    setTimeout(function () {
      var form = document.getElementById('quickClientForm');
      if (!form) return;
      var parts = (name || '').split(' ');
      var firstName = parts[0] || '';
      var lastName = parts.slice(1).join(' ') || '';
      var fnInput = form.querySelector('[name="first_name"]');
      var lnInput = form.querySelector('[name="last_name"]');
      var emInput = form.querySelector('[name="email"]');
      var phInput = form.querySelector('[name="phone"]');
      if (fnInput) fnInput.value = firstName;
      if (lnInput) lnInput.value = lastName;
      if (emInput) emInput.value = email || '';
      if (phInput) phInput.value = phone || '';
    }, 150);
  }

  // ─── Listing Tab: Showings ───────────────────────────────────────────
  function _listingShowings(el) {
    el.innerHTML = UI.loading();

    MallanAPI.showings.list({ limit: 100 }).then(function (data) {
      var allShowings = data.showings || [];
      // Filter to this listing
      var showings = allShowings.filter(function (s) {
        return s.listing_id === _listingId || s.listingId === _listingId ||
               (s.address && _listing.address && s.address === _listing.address);
      });

      var now = new Date();
      var html = '<div class="space-y-4">';
      html += '<div class="flex items-center justify-between">' +
        '<h3 class="text-sm font-bold text-gray-700">Showings (' + showings.length + ')</h3>' +
        '<button class="btn btn-sm btn-gold" onclick="Workspace._scheduleShowing()"><i class="fas fa-plus"></i> Schedule</button>' +
      '</div>';

      if (showings.length === 0) {
        html += UI.emptyState('fa-calendar', 'No showings for this listing',
          '<button class="btn btn-sm btn-gold mt-2" onclick="Workspace._scheduleShowing()"><i class="fas fa-plus"></i> Schedule First Showing</button>');
        html += '</div>';
        el.innerHTML = html;
        return;
      }

      // Buyer Interest Trend — count showings per week for last 4 weeks
      html += '<div class="card p-4">' +
        '<h4 class="text-xs font-bold text-gray-500 uppercase mb-3">Buyer Interest Trend (Last 4 Weeks)</h4>' +
        '<div class="flex items-end gap-2 h-20">';
      var weekCounts = [0, 0, 0, 0];
      showings.forEach(function (s) {
        var showDate = new Date(s.date || s.showing_date || s.created_at);
        var weeksAgo = Math.floor((now - showDate) / (7 * 86400000));
        if (weeksAgo >= 0 && weeksAgo < 4) weekCounts[3 - weeksAgo]++;
      });
      var maxCount = Math.max.apply(null, weekCounts) || 1;
      var weekLabels = ['4w ago', '3w ago', '2w ago', 'This wk'];
      weekCounts.forEach(function (count, i) {
        var height = Math.max(4, Math.round((count / maxCount) * 64));
        var color = count > 0 ? '#B8860B' : '#E5E7EB';
        html += '<div class="flex-1 flex flex-col items-center">' +
          '<span class="text-xs font-bold mb-1">' + count + '</span>' +
          '<div style="height:' + height + 'px;background:' + color + '" class="w-full rounded-t"></div>' +
          '<span class="text-xs text-gray-400 mt-1">' + weekLabels[i] + '</span>' +
        '</div>';
      });
      html += '</div></div>';

      // Feedback summary
      var feedbackCounts = { loved: 0, liked: 0, neutral: 0, not_interested: 0 };
      showings.forEach(function (s) {
        var fb = (s.feedback_rating || s.feedbackRating || '').toLowerCase();
        if (fb === 'loved' || fb === 'love') feedbackCounts.loved++;
        else if (fb === 'liked' || fb === 'like') feedbackCounts.liked++;
        else if (fb === 'neutral') feedbackCounts.neutral++;
        else if (fb === 'not_interested' || fb === 'not interested' || fb === 'dislike') feedbackCounts.not_interested++;
      });
      var hasFeedback = feedbackCounts.loved + feedbackCounts.liked + feedbackCounts.neutral + feedbackCounts.not_interested > 0;
      if (hasFeedback) {
        html += '<div class="grid grid-cols-4 gap-2">' +
          '<div class="card p-2 text-center"><p class="text-lg font-bold text-green-600">' + feedbackCounts.loved + '</p><p class="text-xs text-gray-500">Loved</p></div>' +
          '<div class="card p-2 text-center"><p class="text-lg font-bold text-blue-600">' + feedbackCounts.liked + '</p><p class="text-xs text-gray-500">Liked</p></div>' +
          '<div class="card p-2 text-center"><p class="text-lg font-bold text-gray-600">' + feedbackCounts.neutral + '</p><p class="text-xs text-gray-500">Neutral</p></div>' +
          '<div class="card p-2 text-center"><p class="text-lg font-bold text-red-600">' + feedbackCounts.not_interested + '</p><p class="text-xs text-gray-500">Not Interested</p></div>' +
        '</div>';
      }

      // Upcoming + past showings
      var upcoming = showings.filter(function (s) { return new Date(s.date || s.showing_date) >= now; });
      var past = showings.filter(function (s) { return new Date(s.date || s.showing_date) < now; });

      if (upcoming.length > 0) {
        html += '<h4 class="text-xs font-bold text-gray-500 uppercase">Upcoming (' + upcoming.length + ')</h4><div class="space-y-2">';
        upcoming.forEach(function (s) {
          html += '<div class="card p-3 border-l-4 border-gold">' +
            '<div class="flex items-center justify-between">' +
              '<div><p class="text-sm font-medium">' + D(s.date || s.showing_date) + '</p>' +
                '<p class="text-xs text-gray-500">' + E(s.client_name || s.clientName || 'Client') + ' &middot; ' + E(s.type || 'Private') + '</p></div>' +
              UI.statusBadge(s.status || 'scheduled') +
            '</div></div>';
        });
        html += '</div>';
      }

      if (past.length > 0) {
        html += '<h4 class="text-xs font-bold text-gray-500 uppercase">Past (' + past.length + ')</h4><div class="space-y-2">';
        past.slice(0, 10).forEach(function (s) {
          var fb = s.feedback_rating || s.feedbackRating || '';
          html += '<div class="card p-3">' +
            '<div class="flex items-center justify-between">' +
              '<div><p class="text-sm font-medium">' + D(s.date || s.showing_date) + '</p>' +
                '<p class="text-xs text-gray-500">' + E(s.client_name || s.clientName || 'Client') + '</p></div>' +
              (fb ? '<span class="text-xs px-2 py-0.5 rounded-full bg-gray-100">' + E(fb) + '</span>' : '<span class="text-xs text-gray-400">No feedback</span>') +
            '</div></div>';
        });
        html += '</div>';
      }

      html += '</div>';
      el.innerHTML = html;
    }).catch(function () {
      el.innerHTML = '<div class="space-y-4">' +
        '<h3 class="text-sm font-bold text-gray-700">Showings</h3>' +
        UI.emptyState('fa-calendar', 'Could not load showings') +
      '</div>';
    });
  }

  // ─── Listing Tab: History ─────────────────────────────────────────
  function _listingHistory(el) {
    var events = Events.getByEntity('listing', _listingId);

    var html = '<div class="space-y-4">';
    html += '<h3 class="text-sm font-bold text-gray-700">Price & Market History</h3>';

    // Current price card
    html += '<div class="card p-4">' +
      '<div class="flex items-center justify-between">' +
        '<span class="text-sm font-medium">Current Price</span>' +
        '<span class="text-lg font-bold text-gold">' + $(_listing.ListPrice || _listing.price) + '</span>' +
      '</div>' +
    '</div>';

    if (events.length === 0) {
      html += '<p class="text-xs text-gray-400 mt-2">No history events recorded</p></div>';
      el.innerHTML = html;
      return;
    }

    // Categorize events
    var priceChanges = [];
    var statusChanges = [];
    var syndicationEvents = [];
    var sendEvents = [];
    var otherEvents = [];

    events.forEach(function (e) {
      var type = e.type || '';
      var payload = e.payload || {};
      if (type === 'price_change' || type === 'listing_price_changed') {
        priceChanges.push(e);
      } else if (type === 'status_change' || type === 'listing_status_changed') {
        statusChanges.push(e);
      } else if (type === 'idx_sync' || type === 'syndication_update' || type === 'streeteasy_upload' || type.indexOf('syndic') >= 0) {
        syndicationEvents.push(e);
      } else if (type === 'listing_sent' || type === 'quick_send_executed') {
        sendEvents.push(e);
      } else {
        otherEvents.push(e);
      }
    });

    // Price Changes
    if (priceChanges.length > 0) {
      html += '<div class="space-y-2"><h4 class="text-xs font-bold text-gray-500 uppercase">Price Changes</h4>';
      priceChanges.forEach(function (e) {
        var p = e.payload || {};
        var oldPrice = p.oldPrice || p.old_price || p.previousPrice;
        var newPrice = p.newPrice || p.new_price || p.currentPrice;
        var isIncrease = Number(newPrice) > Number(oldPrice);
        html += '<div class="card p-3 flex items-center justify-between">' +
          '<div class="flex items-center gap-3">' +
            '<i class="fas ' + (isIncrease ? 'fa-arrow-up text-red-500' : 'fa-arrow-down text-green-500') + '"></i>' +
            '<div>' +
              (oldPrice ? '<span class="text-sm text-gray-400 line-through">' + $(oldPrice) + '</span> ' : '') +
              '<span class="text-sm font-bold">' + (newPrice ? $(newPrice) : 'Updated') + '</span>' +
            '</div>' +
          '</div>' +
          '<span class="text-xs text-gray-400">' + Utils.formatTimeAgo(e.createdAt) + '</span>' +
        '</div>';
      });
      html += '</div>';
    }

    // Status Changes
    if (statusChanges.length > 0) {
      html += '<div class="space-y-2"><h4 class="text-xs font-bold text-gray-500 uppercase">Status Changes</h4>';
      statusChanges.forEach(function (e) {
        var p = e.payload || {};
        var oldStatus = p.oldStatus || p.old_status || p.previousStatus || '';
        var newStatus = p.newStatus || p.new_status || p.currentStatus || '';
        html += '<div class="card p-3 flex items-center justify-between">' +
          '<div class="flex items-center gap-2">' +
            (oldStatus ? '<span class="text-xs px-2 py-0.5 rounded-full bg-gray-100">' + E(oldStatus) + '</span>' : '') +
            (oldStatus ? '<i class="fas fa-arrow-right text-gray-400 text-xs"></i>' : '') +
            '<span class="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">' + E(newStatus || 'Updated') + '</span>' +
          '</div>' +
          '<span class="text-xs text-gray-400">' + Utils.formatTimeAgo(e.createdAt) + '</span>' +
        '</div>';
      });
      html += '</div>';
    }

    // Syndication Events
    if (syndicationEvents.length > 0) {
      html += '<div class="space-y-2"><h4 class="text-xs font-bold text-gray-500 uppercase">Syndication Activity</h4>';
      syndicationEvents.forEach(function (e) {
        html += '<div class="card p-3 flex items-center justify-between">' +
          '<div class="flex items-center gap-2">' +
            '<i class="fas fa-globe text-gray-400"></i>' +
            '<span class="text-sm">' + E(Events.label(e.type)) + '</span>' +
          '</div>' +
          '<span class="text-xs text-gray-400">' + Utils.formatTimeAgo(e.createdAt) + '</span>' +
        '</div>';
      });
      html += '</div>';
    }

    // Send History
    if (sendEvents.length > 0) {
      html += '<div class="space-y-2"><h4 class="text-xs font-bold text-gray-500 uppercase">Send History</h4>';
      sendEvents.forEach(function (e) {
        var p = e.payload || {};
        var clientIds = p.clientIds || p.client_ids || [];
        var clientName = p.clientName || (clientIds.length > 0 ? clientIds.length + ' client(s)' : 'Client');
        html += '<div class="card p-3 flex items-center justify-between">' +
          '<div class="flex items-center gap-2">' +
            '<i class="fas fa-paper-plane text-gray-400"></i>' +
            '<span class="text-sm">Sent to ' + E(clientName) + '</span>' +
          '</div>' +
          '<span class="text-xs text-gray-400">' + Utils.formatTimeAgo(e.createdAt) + '</span>' +
        '</div>';
      });
      html += '</div>';
    }

    // Other events
    if (otherEvents.length > 0) {
      html += '<div class="space-y-2"><h4 class="text-xs font-bold text-gray-500 uppercase">Other Activity</h4>';
      otherEvents.slice(0, 10).forEach(function (e) {
        html += '<div class="card p-3 flex items-center justify-between">' +
          '<div class="flex items-center gap-2">' +
            '<i class="fas ' + Events.icon(e.type) + ' text-gray-400"></i>' +
            '<span class="text-sm">' + E(Events.label(e.type)) + '</span>' +
          '</div>' +
          '<span class="text-xs text-gray-400">' + Utils.formatTimeAgo(e.createdAt) + '</span>' +
        '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    el.innerHTML = html;
  }

  // ─── Listing Tab: Documents ──────────────────────────────────────────
  function _listingDocuments(el) {
    // Reload docs fresh
    Documents.list('listing', _listingId).then(function (result) {
      _listingData.documents = result || [];
      _renderListingDocuments(el);
    }).catch(function () {
      _renderListingDocuments(el);
    });
  }

  function _renderListingDocuments(el) {
    var docs = _listingData.documents || [];

    // Categorize documents
    var complianceDocs = [];
    var marketingDocs = [];
    var transactionDocs = [];

    var complianceTypes = ['disclosure', 'fair_housing', 'lead_paint', 'agency_disclosure', 'property_condition', 'compliance'];
    var marketingTypes = ['listing_sheet', 'flyer', 'open_house_flyer', 'social_media', 'brochure', 'marketing', 'photo'];
    var transactionTypes = ['contract', 'rider', 'amendment', 'closing', 'deed', 'title', 'mortgage', 'transaction'];

    docs.forEach(function (d) {
      var docType = (d.type || d.category || '').toLowerCase();
      var docTitle = (d.title || '').toLowerCase();
      if (complianceTypes.some(function (t) { return docType.indexOf(t) >= 0 || docTitle.indexOf(t) >= 0; })) {
        complianceDocs.push(d);
      } else if (marketingTypes.some(function (t) { return docType.indexOf(t) >= 0 || docTitle.indexOf(t) >= 0; })) {
        marketingDocs.push(d);
      } else if (transactionTypes.some(function (t) { return docType.indexOf(t) >= 0 || docTitle.indexOf(t) >= 0; })) {
        transactionDocs.push(d);
      } else {
        // Default to transaction
        transactionDocs.push(d);
      }
    });

    var html = '<div class="space-y-4">';
    html += '<div class="flex items-center justify-between">' +
      '<h3 class="text-sm font-bold text-gray-700">Listing Documents (' + docs.length + ')</h3>' +
      '<button class="btn btn-sm btn-gold" onclick="Panels._uploadDoc(\'listing\',\'' + E(_listingId) + '\')"><i class="fas fa-upload"></i> Upload</button>' +
    '</div>';

    // Compliance Docs section
    html += '<div class="space-y-2">' +
      '<h4 class="text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><i class="fas fa-shield-alt text-gray-400"></i> Compliance Documents (' + complianceDocs.length + ')</h4>';
    if (complianceDocs.length > 0) {
      complianceDocs.forEach(function (d) { html += _docRow(d); });
    } else {
      html += '<p class="text-xs text-gray-400 pl-2">No compliance documents uploaded</p>';
    }
    // Suggest missing compliance docs
    var hasDisclosure = complianceDocs.some(function (d) { return (d.title || '').toLowerCase().indexOf('disclosure') >= 0; });
    var hasFairHousing = complianceDocs.some(function (d) { return (d.title || '').toLowerCase().indexOf('fair housing') >= 0; });
    var hasLeadPaint = complianceDocs.some(function (d) { return (d.title || '').toLowerCase().indexOf('lead paint') >= 0; });
    var hasAgencyDisclosure = complianceDocs.some(function (d) { return (d.title || '').toLowerCase().indexOf('agency') >= 0; });
    var missingCompliance = [];
    if (!hasDisclosure) missingCompliance.push('Property Condition Disclosure');
    if (!hasFairHousing) missingCompliance.push('Fair Housing Notice');
    if (!hasLeadPaint) missingCompliance.push('Lead Paint Disclosure');
    if (!hasAgencyDisclosure) missingCompliance.push('Agency Disclosure');
    if (missingCompliance.length > 0) {
      html += '<div class="mt-2 space-y-1">';
      missingCompliance.forEach(function (name) {
        html += '<div class="flex items-center justify-between p-2 rounded bg-yellow-50 border border-yellow-200">' +
          '<span class="text-xs text-yellow-700"><i class="fas fa-exclamation-triangle text-yellow-500 mr-1"></i>' + E(name) + ' — not found</span>' +
          '<button class="btn btn-xs btn-outline" onclick="Panels._uploadDoc(\'listing\',\'' + E(_listingId) + '\')">Upload</button>' +
        '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    // Marketing Docs section
    html += '<div class="space-y-2">' +
      '<h4 class="text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><i class="fas fa-bullhorn text-gray-400"></i> Marketing Documents (' + marketingDocs.length + ')</h4>';
    if (marketingDocs.length > 0) {
      marketingDocs.forEach(function (d) { html += _docRow(d); });
    } else {
      html += '<p class="text-xs text-gray-400 pl-2">No marketing documents</p>';
    }
    html += '</div>';

    // Transaction Docs section
    html += '<div class="space-y-2">' +
      '<h4 class="text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><i class="fas fa-file-contract text-gray-400"></i> Transaction Documents (' + transactionDocs.length + ')</h4>';
    if (transactionDocs.length > 0) {
      transactionDocs.forEach(function (d) { html += _docRow(d); });
    } else {
      html += '<p class="text-xs text-gray-400 pl-2">No transaction documents</p>';
    }
    html += '</div>';

    html += '</div>';
    el.innerHTML = html;
  }

  function _docRow(d) {
    return '<div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50">' +
      '<i class="fas ' + Documents.typeIcon(d.type) + ' text-gold"></i>' +
      '<div class="flex-1"><p class="text-sm font-medium">' + E(d.title || 'Document') + '</p>' +
        '<p class="text-xs text-gray-500">' + D(d.created_at || d.createdAt) + (d.type ? ' &middot; ' + E(d.type) : '') + '</p></div>' +
      Documents.statusBadge(d.status) +
    '</div>';
  }

  // ─── Listing Tab: Health ─────────────────────────────────────────────
  function _listingHealth(el) {
    var l = _listing;
    var health = _computeHealthScore(l);
    var score = health.score;
    var indicators = health.indicators;

    var scoreColor = score >= 80 ? '#059669' : score >= 50 ? '#F59E0B' : '#DC2626';
    var scoreLabel = score >= 80 ? 'Healthy' : score >= 50 ? 'Needs Attention' : 'At Risk';

    var html = '<div class="space-y-4">';

    // Overall score
    html += '<div class="flex items-center justify-between">' +
      '<h3 class="text-sm font-bold text-gray-700">Listing Health</h3>' +
    '</div>';
    html += '<div class="card p-4 flex items-center gap-4">' +
      '<div class="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white" style="background:' + scoreColor + '">' + score + '</div>' +
      '<div>' +
        '<p class="text-xl font-bold" style="color:' + scoreColor + '">' + scoreLabel + '</p>' +
        '<p class="text-xs text-gray-500 mt-1">' + indicators.filter(function (i) { return i.severity !== 'good'; }).length + ' of ' + indicators.length + ' indicators need attention</p>' +
      '</div>' +
    '</div>';

    // Individual indicators
    html += '<div class="space-y-3">';
    indicators.forEach(function (ind) {
      var color = ind.severity === 'good' ? '#059669' : ind.severity === 'warning' ? '#F59E0B' : '#DC2626';
      var icon = ind.severity === 'good' ? 'fa-check-circle' : ind.severity === 'warning' ? 'fa-exclamation-triangle' : 'fa-times-circle';
      var bg = ind.severity === 'good' ? 'bg-green-50' : ind.severity === 'warning' ? 'bg-yellow-50' : 'bg-red-50';
      var sevLabel = ind.severity === 'good' ? 'Good' : ind.severity === 'warning' ? 'Warning' : 'Critical';

      html += '<div class="p-4 rounded-lg ' + bg + '" ' + (ind.id ? 'id="' + ind.id + '"' : '') + '>' +
        '<div class="flex items-start justify-between">' +
          '<div class="flex items-start gap-3">' +
            '<i class="fas ' + icon + ' mt-0.5" style="color:' + color + '"></i>' +
            '<div>' +
              '<div class="flex items-center gap-2">' +
                '<p class="text-sm font-bold">' + E(ind.label) + '</p>' +
                '<span class="text-xs font-bold px-1.5 py-0.5 rounded-full" style="background:' + color + '20;color:' + color + '">' + sevLabel + '</span>' +
              '</div>' +
              '<p class="text-sm font-bold mt-1">' + E(ind.value) + '</p>' +
              '<p class="text-xs text-gray-500 mt-1">' + E(ind.detail) + '</p>' +
              (ind.action || '') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    });
    html += '</div></div>';
    el.innerHTML = html;

    // Async: fetch pricing risk data
    var neighborhood = l.neighborhood || l.City || l.area || '';
    var listPrice = Number(l.ListPrice || l.price || 0);
    if (neighborhood && listPrice > 0) {
      MallanAPI._fetch('/api/crm/market-report', {
        method: 'POST',
        body: JSON.stringify({ neighborhood: neighborhood, property_type: l.PropertySubType || l.property_type || '' }),
      }).then(function (data) {
        var median = data.median_price || data.medianPrice || 0;
        if (!median) return;
        var pricingEl = document.getElementById('healthPricingRisk');
        if (!pricingEl) return;
        var diff = listPrice - median;
        var pct = Math.round(Math.abs(diff / median) * 100);
        var isOver = diff > 0;
        var severity = pct > 15 ? (isOver ? 'warning' : 'good') : 'good';
        var color = severity === 'good' ? '#059669' : '#F59E0B';
        var icon = severity === 'good' ? 'fa-check-circle' : 'fa-exclamation-triangle';
        var bg = severity === 'good' ? 'bg-green-50' : 'bg-yellow-50';
        var label = isOver ? pct + '% above neighborhood median (' + $(median) + ')' : pct + '% below neighborhood median (' + $(median) + ')';
        var detail = isOver && pct > 15 ? 'Listing may be overpriced relative to comparable properties in this area' :
                     !isOver && pct > 15 ? 'Listing may be underpriced — verify pricing strategy is intentional' :
                     'Price is within normal range for this neighborhood';
        pricingEl.className = 'p-4 rounded-lg ' + bg;
        pricingEl.innerHTML = '<div class="flex items-start gap-3">' +
          '<i class="fas ' + icon + ' mt-0.5" style="color:' + color + '"></i>' +
          '<div>' +
            '<div class="flex items-center gap-2">' +
              '<p class="text-sm font-bold">Pricing Risk</p>' +
              '<span class="text-xs font-bold px-1.5 py-0.5 rounded-full" style="background:' + color + '20;color:' + color + '">' + (severity === 'good' ? 'Good' : 'Warning') + '</span>' +
            '</div>' +
            '<p class="text-sm font-bold mt-1">' + E(label) + '</p>' +
            '<p class="text-xs text-gray-500 mt-1">' + E(detail) + '</p>' +
            (pct > 15 ? '<button class="btn btn-xs btn-outline mt-1" onclick="window.open(\'/crm/sale-listing?id=' + E(_listingId) + '\',\'_blank\')">Review Pricing</button>' : '') +
          '</div>' +
        '</div>';
      }).catch(function () {
        var pricingEl = document.getElementById('healthPricingRisk');
        if (pricingEl) {
          pricingEl.querySelector('.text-sm.font-bold.mt-1').textContent = 'Market data unavailable';
        }
      });
    }
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

  // ─── Listing Tab: Portal & Syndication ─────────────────────────────
  function _listingPortal(el) {
    var l = _listing;
    var isRLS = l.rls_eligible !== false;
    var isFeatured = !!(l.featuredFlag || l.featured);
    var idxDisplay = l.IDXEntireListingDisplayYN !== false && l.idx_display_yn !== false;
    var vowDisplay = l.VOWEntireListingDisplayYN !== false && l.vow_display_yn !== false;
    var internetAddress = l.InternetAddressDisplayYN !== false && l.internet_address_display_yn !== false;
    var syncedAt = l.syncedAt || l.synced_at || l.updated_at || l.updatedAt;
    var lastPublished = l.publishedAt || l.published_at || syncedAt;

    var html = '<div class="space-y-4">';
    html += '<h3 class="text-sm font-bold text-gray-700">Portal & Syndication</h3>';

    // Featured flag
    html += '<div class="card p-4">' +
      '<div class="flex items-center justify-between">' +
        '<div>' +
          '<h4 class="text-sm font-bold mb-1">Featured Status</h4>' +
          '<p class="text-xs text-gray-500">' + (isFeatured ? 'This listing is featured on mallan.nyc homepage' : 'Not currently featured') + '</p>' +
        '</div>' +
        '<div class="flex items-center gap-2">' +
          '<span class="text-xs font-bold px-2 py-1 rounded-full ' + (isFeatured ? 'bg-gold/20 text-gold' : 'bg-gray-100 text-gray-500') + '">' +
            (isFeatured ? 'Featured' : 'Standard') + '</span>' +
          (Permissions.can('change_featured') ?
            '<button class="btn btn-sm btn-outline" onclick="Panels._toggleFeatured(\'' + E(_listingId) + '\',' + !isFeatured + ')">' +
              (isFeatured ? 'Remove' : 'Feature') + '</button>' : '') +
        '</div>' +
      '</div>' +
    '</div>';

    // Syndication Health
    html += '<div class="card p-4"><h4 class="text-sm font-bold mb-3">Syndication Health</h4>' +
      '<div class="space-y-2">';

    // Helper for platform row
    function platformRow(name, status, detail, icon) {
      var statusColor = status === 'active' ? '#059669' : status === 'manual' ? '#6B7280' : status === 'auto' ? '#3B82F6' : status === 'inactive' ? '#DC2626' : '#9CA3AF';
      var statusLabel = status === 'active' ? 'Active' : status === 'manual' ? 'Manual Upload' : status === 'auto' ? 'Auto (via feed)' : status === 'inactive' ? 'Inactive' : 'N/A';
      return '<div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">' +
        '<div class="flex items-center gap-2"><i class="fas ' + (icon || 'fa-globe') + ' text-gray-400 text-xs"></i><span class="text-sm">' + E(name) + '</span></div>' +
        '<div class="text-right">' +
          '<span class="text-xs font-bold" style="color:' + statusColor + '">' + statusLabel + '</span>' +
          (detail ? '<p class="text-xs text-gray-400">' + E(detail) + '</p>' : '') +
        '</div>' +
      '</div>';
    }

    if (isRLS) {
      html += platformRow('REBNY RLS', 'active', syncedAt ? 'Last sync: ' + D(syncedAt) : '', 'fa-database');
      html += platformRow('mallan.nyc', 'active', '', 'fa-globe');
      html += platformRow('StreetEasy', 'manual', 'Direct upload required (not via RLS)', 'fa-building');
      html += platformRow('Zillow / Trulia', 'auto', 'Auto from StreetEasy', 'fa-search');
      html += platformRow('Realtor.com', 'auto', 'REBNY data license (automatic)', 'fa-home');
      html += platformRow('Redfin', 'auto', 'REBNY data license (automatic)', 'fa-map-marker-alt');
      html += platformRow('Homes.com', 'auto', 'REBNY data license (automatic)', 'fa-home');
      html += platformRow('RentHop', 'auto', 'REBNY data license (automatic)', 'fa-key');
      html += platformRow('openigloo', idxDisplay ? 'active' : 'inactive', 'Trestle IDX opt-in', 'fa-plug');
      html += platformRow('Samaki.com', idxDisplay ? 'active' : 'inactive', 'Trestle IDX opt-in', 'fa-plug');
      html += platformRow('TBI Listings', idxDisplay ? 'active' : 'inactive', 'Trestle IDX opt-in', 'fa-plug');
    } else {
      html += platformRow('mallan.nyc', 'active', 'Website-only listing', 'fa-globe');
      html += '<p class="text-xs text-gray-400 py-2">This is a website-only listing (rls_eligible: false). Not distributed to REBNY RLS or IDX feeds.</p>';
    }

    html += '</div></div>';

    // Visibility Status
    html += '<div class="card p-4"><h4 class="text-sm font-bold mb-3">Visibility Settings</h4>' +
      '<div class="space-y-2">';

    function visibilityRow(label, isOn) {
      return '<div class="flex items-center justify-between py-1.5">' +
        '<span class="text-sm">' + E(label) + '</span>' +
        '<span class="text-xs font-bold px-2 py-0.5 rounded-full ' + (isOn ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700') + '">' +
          (isOn ? 'ON' : 'OFF') + '</span>' +
      '</div>';
    }

    html += visibilityRow('IDX Display', idxDisplay);
    html += visibilityRow('VOW Display', vowDisplay);
    html += visibilityRow('Internet Address Display', internetAddress);
    html += '</div></div>';

    // Last Published + Refresh
    html += '<div class="card p-4 flex items-center justify-between">' +
      '<div>' +
        '<h4 class="text-sm font-bold">Last Published</h4>' +
        '<p class="text-xs text-gray-500">' + (lastPublished ? D(lastPublished) + ' (' + Utils.formatTimeAgo(lastPublished) + ')' : 'Unknown') + '</p>' +
      '</div>' +
      '<button class="btn btn-sm btn-outline" onclick="Workspace._refreshSyndication()"><i class="fas fa-sync"></i> Refresh Syndication</button>' +
    '</div>';

    html += '</div>';
    el.innerHTML = html;
  }

  function _refreshSyndication() {
    MallanAPI._fetch('/api/crm/syndication/refresh', {
      method: 'POST',
      body: JSON.stringify({ listing_id: _listingId })
    }).then(function () {
      Events.log('syndication_refresh_requested', 'listing', _listingId);
      CRM.toast('Syndication refresh queued', 'info');
    }).catch(function (err) {
      CRM.toast('Refresh failed: ' + (err.message || 'Try again'), 'error');
    });
  }

  // ─── Quick Note slide-over ──────────────────────────────────────────
  function _quickAddNote() {
    var name = _client ? E(_client.name || 'Client') : 'Client';
    CRM.openSlideOver('Add Note — ' + name,
      '<textarea id="slideNoteText" class="form-input w-full" rows="6" placeholder="Write a note..." autofocus></textarea>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeSlideOver()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Workspace._submitSlideNote()"><i class="fas fa-save"></i> Save</button>'
      }
    );
  }

  function _submitSlideNote() {
    var text = (document.getElementById('slideNoteText') || {}).value;
    if (!text) return;
    var saveBtn = document.querySelector('[onclick*="_submitSlideNote"]');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

    _createNote(_clientId, text, 'slide').then(function () {
      CRM.closeSlideOver();
      CRM.toast('Note saved', 'success');
      if (_clientTab === 'activity' || _clientTab === 'overview') _renderClientTab();
    }).catch(function (err) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Save'; }
      CRM.toast('Failed to save note: ' + (err.message || 'Please try again'), 'error');
    });
  }

  // ─── Quick Task slide-over ────────────────────────────────────────
  function _quickAddTask() {
    var name = _client ? E(_client.name || 'Client') : 'Client';
    CRM.openSlideOver('Quick Task — ' + name,
      '<form id="slideTaskForm" class="space-y-4">' +
        '<input type="hidden" name="client_id" value="' + E(_clientId) + '">' +
        '<div class="form-group"><label class="form-label">Title *</label><input class="form-input" name="title" required autofocus></div>' +
        '<div class="form-group"><label class="form-label">Due Date</label><input class="form-input" type="date" name="due_date"></div>' +
        '<div class="form-group"><label class="form-label">Priority</label>' +
          '<select class="form-input" name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeSlideOver()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Workspace._submitSlideTask()">Create</button>'
      }
    );
  }

  function _submitSlideTask() {
    var form = document.getElementById('slideTaskForm');
    if (!form) return;
    var title = (form.querySelector('[name="title"]') || {}).value;
    if (!title) { CRM.toast('Title is required', 'error'); return; }
    var dueDate = (form.querySelector('[name="due_date"]') || {}).value;
    var priority = (form.querySelector('[name="priority"]') || {}).value || 'normal';

    MallanAPI._fetch('/api/crm/tasks', {
      method: 'POST',
      body: JSON.stringify({
        client_id: _clientId,
        title: title,
        due_date: dueDate || null,
        priority: priority,
        status: 'pending'
      })
    }).then(function () {
      Events.log('task_created', 'client', _clientId, { title: title, priority: priority });
      CRM.closeSlideOver();
      CRM.toast('Task created', 'success');
      if (_clientTab === 'pipeline' || _clientTab === 'overview') _renderClientTab();
    }).catch(function (err) {
      CRM.toast('Failed to create task: ' + (err.message || 'Unknown error'), 'error');
    });
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
    _editFinancials: _editFinancials,
    _saveFinancials: _saveFinancials,
    _editProperty: _editProperty,
    _saveProperty: _saveProperty,
    _submitPreferences: _submitPreferences,
    _saveClientNotes: _saveClientNotes,
    _deleteClient: _deleteClient,
    _linkPartner: _linkPartner,
    _addSecondaryPerson: _addSecondaryPerson,
    _editNote: _editNote,
    _deleteNote: _deleteNote,
    _saveAlertSettings: _saveAlertSettings,
    _searchAndSend: _searchAndSend,
    _sendListingToClient: _sendListingToClient,
    _addActivityNote: _addActivityNote,
    _submitActivityNote: _submitActivityNote,
    _toggleTask: _toggleTask,
    _addPipelineTask: _addPipelineTask,
    _submitPipelineTask: _submitPipelineTask,
    _generateCMA: _generateCMA,

    // Quick slide-overs (action bar)
    _quickAddNote: _quickAddNote,
    _submitSlideNote: _submitSlideNote,
    _quickAddTask: _quickAddTask,
    _submitSlideTask: _submitSlideTask,

    // Overview — pinned notes
    _pinNote: _pinNote,
    _unpinNote: _unpinNote,
    _saveClientNoteAsEvent: _saveClientNoteAsEvent,
    _createNote: _createNote,

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
    _onPhotoDragStart: _onPhotoDragStart,
    _onPhotoDrop: _onPhotoDrop,
    _convertInquiryToLead: _convertInquiryToLead,
    _createClientFromInquiry: _createClientFromInquiry,
    _refreshSyndication: _refreshSyndication,
  };
})();
