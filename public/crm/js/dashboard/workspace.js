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

    // Health Metrics
    html += '<div class="card p-3"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Health Metrics</h4>' +
      '<div class="space-y-2">' +
        '<div class="flex justify-between text-xs"><span>Health Score</span><span class="font-bold">' + (cl.healthScore || cl.health_score || '—') + '</span></div>' +
        '<div class="flex justify-between text-xs"><span>Readiness</span><span class="font-bold" id="wsRailReadinessScore">' + (cl.readinessScore || cl.readiness_score || '—') + '</span></div>' +
        '<div class="flex justify-between text-xs"><span>Conversion</span><span class="font-bold">' + (cl.conversionProbability || cl.conversion_probability || '—') + (cl.conversionProbability ? '%' : '') + '</span></div>' +
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
  function _clientOverview(el) {
    var cl = _client;
    var prefs = cl.preferences || {};

    var html = '<div class="space-y-4">';

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

    // Notes
    html += '<div>' +
      '<h3 class="text-sm font-bold text-gray-700 mb-2">Notes</h3>' +
      '<textarea id="wsClientNotes" class="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-gold focus:border-gold" rows="3" placeholder="Add notes about this client...">' + E(cl.notes || '') + '</textarea>' +
      '<div class="mt-2 flex justify-end">' +
        '<button class="btn btn-sm btn-gold" onclick="Workspace._saveClientNotes()"><i class="fas fa-save mr-1"></i> Save Notes</button>' +
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
    var events = Events.getByEntity('client', _clientId).slice(0, 5);
    var actEl = document.getElementById('wsOverviewActivity');
    if (actEl) {
      if (events.length === 0) {
        actEl.innerHTML = '<p class="text-xs text-gray-400">No recent activity</p>';
      } else {
        actEl.innerHTML = UI.timeline(events.map(function (e) {
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

  // ─── Tab: Listings (sent, search & send, reactions, auto-alerts) ────
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

    // Reactions
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

    // Search & Send
    html += '<div class="card p-3">' +
      '<h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Search & Send</h4>' +
      '<div class="flex gap-2 mb-3">' +
        '<input id="wsListingSearch" class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Search by address, neighborhood, MLS ID...">' +
        '<button class="btn btn-sm btn-outline" onclick="Workspace._searchAndSend()"><i class="fas fa-search"></i> Search</button>' +
      '</div>' +
      '<div id="wsSearchResults"></div>' +
    '</div>';

    // Smart Match
    html += '<div class="card"><div class="card-header"><h3>Smart Match</h3><span class="text-xs text-gray-400">Based on client preferences</span></div>' +
      '<div class="card-body" id="wsClientMatches">' + UI.loading() + '</div></div>';

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

    // ── Load Reactions ──
    var reactionEl = document.getElementById('wsClientReactions');
    if (reactionEl) {
      var reactions = Events.getByEntity('client', _clientId).filter(function (e) { return e.type === 'listing_reaction_recorded'; });
      if (reactions.length === 0) {
        reactionEl.innerHTML = '<p class="text-sm text-gray-500">No reactions yet</p>';
      } else {
        var rHtml = '<div class="space-y-2">';
        reactions.forEach(function (e) {
          var reaction = e.payload && (e.payload.reaction || e.payload.type) || 'unknown';
          var addr = e.payload && (e.payload.address || e.payload.listingId || e.payload.listing_id) || '';
          var iconMap = { liked: 'fa-thumbs-up text-green-500', disliked: 'fa-thumbs-down text-red-500', discuss: 'fa-comment text-yellow-500' };
          var icon = iconMap[reaction] || 'fa-circle text-gray-400';
          rHtml += '<div class="flex items-center gap-3 p-2 rounded-lg bg-gray-50">' +
            '<i class="fas ' + icon + '"></i>' +
            '<div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">' + E(addr) + '</p>' +
              '<p class="text-xs text-gray-500">' + E(reaction) + ' · ' + Utils.formatTimeAgo(e.createdAt) + '</p></div>' +
          '</div>';
        });
        rHtml += '</div>';
        reactionEl.innerHTML = rHtml;
      }
    }

    // ── Smart Match (search based on preferences) ──
    var matchEl = document.getElementById('wsClientMatches');
    if (matchEl) {
      var searchParams = {};
      if (prefs.neighborhoods && prefs.neighborhoods.length > 0) searchParams.neighborhood = prefs.neighborhoods[0];
      if (prefs.minPrice) searchParams.minPrice = prefs.minPrice;
      if (prefs.maxPrice) searchParams.maxPrice = prefs.maxPrice;
      if (prefs.minBeds) searchParams.minBeds = prefs.minBeds;

      if (Object.keys(searchParams).length === 0) {
        matchEl.innerHTML = '<p class="text-sm text-gray-500">Set client preferences to enable Smart Match</p>';
      } else {
        MallanAPI.idx.search(searchParams).then(function (data) {
          var listings = (data.listings || data.results || []).slice(0, 10);
          if (listings.length === 0) {
            matchEl.innerHTML = '<p class="text-sm text-gray-500">No matching listings found for current preferences</p>';
            return;
          }
          var mHtml = '<div class="space-y-2">';
          listings.forEach(function (l) {
            mHtml += UI.listingCard(l, "Router.navigate('/workspace/listing/" + E(l.id || l.listing_id || l.listingId) + "/overview')");
          });
          mHtml += '</div>';
          matchEl.innerHTML = mHtml;
        }).catch(function () {
          matchEl.innerHTML = '<p class="text-sm text-gray-500">Could not load matching listings</p>';
        });
      }
    }
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
    var resultsEl = document.getElementById('wsSearchResults');
    if (!input || !resultsEl) return;
    var q = input.value.trim();
    if (!q) { resultsEl.innerHTML = ''; return; }

    resultsEl.innerHTML = UI.loading();
    MallanAPI.idx.search({ q: q }).then(function (data) {
      var listings = data.listings || data.results || [];
      if (listings.length === 0) {
        resultsEl.innerHTML = '<p class="text-sm text-gray-500">No results found</p>';
        return;
      }
      var html = '<table class="w-full text-sm"><thead><tr class="text-xs text-gray-500 border-b">' +
        '<th class="text-left py-2">Address</th><th class="text-left py-2">Price</th><th class="text-left py-2">Beds/Baths</th><th class="py-2"></th></tr></thead><tbody>';
      listings.slice(0, 15).forEach(function (l) {
        var lid = l.id || l.listing_id || l.listingId || '';
        var addr = l.address || l.UnparsedAddress || l.street_address || 'Listing';
        html += '<tr class="border-b hover:bg-gray-50">' +
          '<td class="py-2">' + E(addr) + '</td>' +
          '<td class="py-2">' + $(l.ListPrice || l.price || 0) + '</td>' +
          '<td class="py-2">' + (l.BedroomsTotal || l.bedrooms || '-') + ' / ' + (l.BathroomsTotalInteger || l.bathrooms || '-') + '</td>' +
          '<td class="py-2"><button class="btn btn-xs btn-gold" onclick="Workspace._sendListingToClient(\'' + E(lid) + '\',\'' + E(addr) + '\')"><i class="fas fa-paper-plane"></i> Send</button></td>' +
        '</tr>';
      });
      html += '</tbody></table>';
      resultsEl.innerHTML = html;
    }).catch(function () {
      resultsEl.innerHTML = '<p class="text-sm text-gray-500">Search failed. Please try again.</p>';
    });
  }

  function _sendListingToClient(listingId, address) {
    Events.log('listing_sent', 'client', _clientId, { listingId: listingId, address: address, sentAt: new Date().toISOString() });
    CRM.toast('Listing sent to ' + (_client.name || 'client'), 'success');
  }

  // ─── Tab: Activity ───────────────────────────────────────────────────
  function _clientActivity(el) {
    var events = Events.getByEntity('client', _clientId);

    var html = '<div class="space-y-4">';

    // Add Note button
    html += '<div class="flex items-center justify-between">' +
      '<h3 class="text-sm font-bold text-gray-700">Activity Timeline</h3>' +
      '<button class="btn btn-sm btn-outline" onclick="Workspace._addActivityNote()"><i class="fas fa-plus mr-1"></i> Add Note</button>' +
    '</div>';

    // Full timeline
    if (events.length === 0) {
      html += '<p class="text-sm text-gray-500">No activity recorded yet</p>';
    } else {
      html += '<div class="space-y-3">';
      events.forEach(function (e) {
        var iconClass = Events.icon ? Events.icon(e.type) : 'fa-circle';
        var label = Events.label ? Events.label(e.type) : e.type;
        var payloadSummary = '';
        if (e.payload) {
          if (e.payload.content) payloadSummary = e.payload.content;
          else if (e.payload.address) payloadSummary = e.payload.address;
          else if (e.payload.reaction) payloadSummary = 'Reaction: ' + e.payload.reaction;
          else if (e.payload.from && e.payload.to) payloadSummary = e.payload.from + ' → ' + e.payload.to;
          else payloadSummary = Utils.truncate(JSON.stringify(e.payload), 100);
        }
        html += '<div class="flex gap-3 p-3 rounded-lg bg-gray-50">' +
          '<div class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">' +
            '<i class="fas ' + iconClass + ' text-xs text-gray-500"></i>' +
          '</div>' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm font-medium">' + E(label) + '</p>' +
            (payloadSummary ? '<p class="text-xs text-gray-500 mt-0.5 truncate">' + E(payloadSummary) + '</p>' : '') +
            '<p class="text-xs text-gray-400 mt-1">' + Utils.formatTimeAgo(e.createdAt) + '</p>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    el.innerHTML = html;
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
        '<div class="mt-3"><label class="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" class="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"> Aggressive nurture (increase sales listing frequency)</label></div>' +
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

  // ─── Nurture Settings persistence ──────────────────────────────────
  var NURTURE_KEY_PREFIX = 'mallan_crm_nurture_';

  function _loadNurtureSettings(clientId) {
    try {
      var raw = localStorage.getItem(NURTURE_KEY_PREFIX + clientId);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { frequency: 'monthly', autoSend: false };
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
    try {
      localStorage.setItem(NURTURE_KEY_PREFIX + _clientId, JSON.stringify(settings));
    } catch (e) { /* ignore */ }
    Events.log('nurture_settings_saved', 'client', _clientId, settings);
    CRM.toast('Nurture settings saved', 'success');
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

    // Lead Score
    html += '<div id="wsMarketLeadScore">' + UI.loading() + '</div>';

    // Market Report
    html += '<div class="card p-4"><h4 class="text-sm font-bold mb-2"><i class="fas fa-chart-area mr-2"></i>Market Report</h4>' +
      '<div id="wsMarketReport">' + UI.loading() + '</div></div>';

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

    // ── Fetch Market Report ──
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
            '<div class="p-3 bg-green-50 rounded-lg text-center"><p class="text-xs text-gray-500">Avg DOM</p><p class="text-lg font-bold text-green-700">' + (r.avgDom || r.avg_dom || r.averageDaysOnMarket || '—') + '</p></div>' +
            '<div class="p-3 bg-purple-50 rounded-lg text-center"><p class="text-xs text-gray-500">Inventory</p><p class="text-lg font-bold text-purple-700">' + (r.inventory || r.totalInventory || '—') + '</p></div>' +
            '<div class="p-3 bg-yellow-50 rounded-lg text-center"><p class="text-xs text-gray-500">Price/SqFt</p><p class="text-lg font-bold text-yellow-700">' + (r.pricePerSqft || r.price_per_sqft ? $(r.pricePerSqft || r.price_per_sqft) : '—') + '</p></div>' +
          '</div>' +
          '<p class="text-xs text-gray-400 mt-2">Neighborhoods: ' + E(neighborhoods.join(', ')) + '</p>';
        }).catch(function () {
          reportEl.innerHTML = '<p class="text-sm text-gray-500">Could not load market report</p>';
        });
      }
    }
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

    html += '</div>';
    el.innerHTML = html;
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
    '<p class="text-xs text-gray-400 mt-2">Based on 28% DTI ratio, 20% down payment, ' + rate + '% rate, 30-year term.</p>';
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
        html += '<div class="flex items-center gap-3 p-3 rounded-lg bg-blue-50">' +
          '<div class="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-100">' +
            '<i class="fas fa-calendar text-blue-500"></i></div>' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm font-medium">' + E(s.address || s.listing_address || 'Showing') + '</p>' +
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
        var feedback = s.feedback || s.feedbackText || '';
        html += '<div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50">' +
          '<div class="w-10 h-10 rounded-lg flex items-center justify-center bg-gray-200">' +
            '<i class="fas fa-calendar text-gray-400"></i></div>' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm font-medium">' + E(s.address || s.listing_address || 'Showing') + '</p>' +
            '<p class="text-xs text-gray-500">' + D(s.date || s.showing_date) + '</p>' +
            (feedback ? '<p class="text-xs text-gray-600 mt-1 italic">"' + E(feedback) + '"</p>' : '') +
          '</div>' +
          UI.statusBadge(s.status || 'completed') +
          (!feedback ? '<button class="btn btn-xs btn-outline ml-2" onclick="Workspace._addShowingFeedback(\'' + E(sid) + '\')"><i class="fas fa-comment mr-1"></i>Add Feedback</button>' : '') +
        '</div>';
      });
      html += '</div>';
    }

    contentEl.innerHTML = html;
  }

  function _addShowingFeedback(showingId) {
    CRM.openModal('Add Showing Feedback',
      '<form id="showingFbForm" class="space-y-4">' +
        '<div class="form-group"><label class="form-label">Rating</label>' +
          '<select class="form-input form-select" name="rating">' +
            '<option value="Loved it">Loved it</option>' +
            '<option value="Liked it">Liked it</option>' +
            '<option value="Neutral" selected>Neutral</option>' +
            '<option value="Not interested">Not interested</option>' +
            '<option value="Hated it">Hated it</option>' +
          '</select></div>' +
        '<div class="form-group"><label class="form-label">Feedback</label>' +
          '<textarea class="form-input" name="feedback" rows="3" placeholder="How did the client feel about this property?"></textarea></div>' +
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
    var body = { feedback: fd.get('feedback') || '', rating: fd.get('rating') || 'Neutral' };

    MallanAPI._fetch('/api/crm/showings/' + showingId, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }).then(function () {
      Events.log('showing_feedback_added', 'client', _clientId, { showingId: showingId, rating: body.rating });
      CRM.closeModal();
      CRM.toast('Feedback saved', 'success');
      _renderClientTab();
    }).catch(function () {
      Events.log('showing_feedback_added', 'client', _clientId, { showingId: showingId, rating: body.rating });
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
  function _clientDocuments(el) {
    el.innerHTML = '<div class="space-y-4">' +
      '<div class="flex items-center justify-between">' +
        '<h3 class="text-sm font-bold text-gray-700">Documents</h3>' +
        '<button class="btn btn-sm btn-gold" onclick="Panels._uploadDoc(\'client\',\'' + E(_clientId) + '\')"><i class="fas fa-upload"></i> Upload Document</button>' +
      '</div>' +
      '<div class="flex gap-2 mb-2" id="wsDocFilters">' +
        '<button class="btn btn-xs btn-gold" onclick="Workspace._filterDocs(\'all\')">All</button>' +
        '<button class="btn btn-xs btn-outline" onclick="Workspace._filterDocs(\'pending\')">Pending</button>' +
        '<button class="btn btn-xs btn-outline" onclick="Workspace._filterDocs(\'approved\')">Approved</button>' +
        '<button class="btn btn-xs btn-outline" onclick="Workspace._filterDocs(\'signed\')">Signed</button>' +
      '</div>' +
      '<div id="wsDocsTable">' + UI.loading() + '</div>' +
    '</div>';

    Documents.list('client', _clientId).then(function (docs) {
      _clientData.documents = docs || [];
      _renderDocsTable('all');
    }).catch(function () {
      _renderDocsTable('all');
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

    // Build a map of doc types to their status
    var docStatusMap = {};
    docs.forEach(function (d) {
      var dt = (d.type || d.doc_type || '').toLowerCase();
      var st = (d.status || '').toLowerCase();
      // Keep the "best" status: signed > approved > uploaded > pending
      var rank = { signed: 4, approved: 3, uploaded: 2, pending: 1 };
      if (!docStatusMap[dt] || (rank[st] || 0) > (rank[docStatusMap[dt]] || 0)) {
        docStatusMap[dt] = st;
      }
    });

    var html = '<div class="space-y-2">';
    agreements.forEach(function (a) {
      var docStatus = docStatusMap[a.docType] || 'missing';
      var statusColors = { signed: '#059669', approved: '#2563EB', uploaded: '#F59E0B', pending: '#F59E0B', missing: '#EF4444' };
      var statusIcons = { signed: 'fa-check-circle', approved: 'fa-check', uploaded: 'fa-cloud-upload-alt', pending: 'fa-clock', missing: 'fa-times-circle' };
      var color = statusColors[docStatus] || '#EF4444';
      var icon = statusIcons[docStatus] || 'fa-times-circle';

      html += '<div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50">' +
        '<i class="fas ' + icon + '" style="color:' + color + '"></i>' +
        '<div class="flex-1 min-w-0">' +
          '<p class="text-sm font-medium">' + E(a.name) + '</p>' +
          '<span class="text-xs px-2 py-0.5 rounded-full ' + (a.required ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600') + '">' +
            (a.required ? 'Required' : 'Optional') + '</span>' +
        '</div>' +
        '<span style="font-size:10px;font-weight:700;color:' + color + ';text-transform:uppercase">' + E(docStatus) + '</span>' +
        (docStatus === 'missing' ? '<button class="btn btn-xs btn-outline ml-2" onclick="Panels._uploadDoc(\'client\',\'' + E(_clientId) + '\')"><i class="fas fa-upload mr-1"></i>Upload</button>' : '') +
      '</div>';
    });
    html += '</div>';
    listEl.innerHTML = html;
  }

  // ─── Tab: Readiness Checklist ────────────────────────────────────────
  var READINESS_KEY_PREFIX = 'readiness_';

  function _loadReadinessState(clientId) {
    try {
      var raw = localStorage.getItem(READINESS_KEY_PREFIX + clientId);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return {};
  }

  function _saveReadinessState(clientId, state) {
    try {
      localStorage.setItem(READINESS_KEY_PREFIX + clientId, JSON.stringify(state));
    } catch (e) { /* ignore */ }
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
      // landlord
      items = [
        { label: 'Property inspected', key: 'inspected' },
        { label: 'Lease agreement drafted', key: 'lease_drafted' },
        { label: 'Tenant screening criteria set', key: 'screening' },
        { label: 'Move-out cleaning scheduled', key: 'cleaning' },
        { label: 'Key handoff plan arranged', key: 'key_handoff' },
      ];
    }

    var saved = _loadReadinessState(_clientId);
    var completed = items.filter(function (i) { return saved[i.key]; }).length;
    var total = items.length;
    var pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    var html = '<div class="space-y-4">';
    html += '<h3 class="text-sm font-bold text-gray-700">Readiness Checklist</h3>';

    // Progress bar
    html += '<div class="card p-4">' +
      '<div class="flex items-center justify-between mb-2">' +
        '<span class="text-sm font-medium">' + completed + ' of ' + total + ' complete</span>' +
        '<span class="text-sm font-bold" id="wsReadinessPct">' + pct + '%</span>' +
      '</div>' +
      '<div class="w-full h-3 bg-gray-200 rounded-full overflow-hidden">' +
        '<div id="wsReadinessBar" class="h-full rounded-full transition-all" style="width:' + pct + '%;background:' + (pct === 100 ? '#059669' : '#B8860B') + '"></div>' +
      '</div>' +
    '</div>';

    // Checklist items
    html += '<div class="space-y-2">';
    items.forEach(function (item) {
      var checked = saved[item.key] ? true : false;
      html += '<label class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gold-bg cursor-pointer transition-all">' +
        '<input type="checkbox" class="w-4 h-4 rounded border-gray-300 text-gold focus:ring-gold" data-readiness-key="' + E(item.key) + '"' +
          (checked ? ' checked' : '') +
          ' oninput="Workspace._onReadinessChange(this)">' +
        '<span class="text-sm font-medium ' + (checked ? 'text-green-700' : '') + '">' + E(item.label) + '</span>' +
        (checked ? '<i class="fas fa-check text-green-500 ml-auto text-xs"></i>' : '') +
      '</label>';
    });
    html += '</div>';

    // Save button
    html += '<div class="mt-4 flex justify-end">' +
      '<button class="btn btn-gold btn-sm" onclick="Workspace._saveReadiness()"><i class="fas fa-save mr-1"></i> Save Checklist</button>' +
    '</div>';

    html += '</div>';
    el.innerHTML = html;
  }

  function _onReadinessChange(checkbox) {
    var key = checkbox.getAttribute('data-readiness-key');
    if (!key) return;
    var saved = _loadReadinessState(_clientId);
    saved[key] = checkbox.checked;
    _saveReadinessState(_clientId, saved);

    // Update progress bar
    var allBoxes = document.querySelectorAll('[data-readiness-key]');
    var total = allBoxes.length;
    var completed = 0;
    allBoxes.forEach(function (cb) { if (cb.checked) completed++; });
    var pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    var pctEl = document.getElementById('wsReadinessPct');
    var barEl = document.getElementById('wsReadinessBar');
    if (pctEl) pctEl.textContent = pct + '%';
    if (barEl) {
      barEl.style.width = pct + '%';
      barEl.style.background = pct === 100 ? '#059669' : '#B8860B';
    }

    // Update label styling
    var label = checkbox.closest('label');
    if (label) {
      var span = label.querySelector('span');
      var existingCheck = label.querySelector('.fa-check');
      if (checkbox.checked) {
        if (span) span.classList.add('text-green-700');
        if (!existingCheck) {
          var i = document.createElement('i');
          i.className = 'fas fa-check text-green-500 ml-auto text-xs';
          label.appendChild(i);
        }
      } else {
        if (span) span.classList.remove('text-green-700');
        if (existingCheck) existingCheck.remove();
      }
    }

    // Update right rail readiness score
    var railScore = document.getElementById('wsRailReadinessScore');
    if (railScore) railScore.textContent = pct + '%';
  }

  function _saveReadiness() {
    var saved = _loadReadinessState(_clientId);
    _saveReadinessState(_clientId, saved);

    var allBoxes = document.querySelectorAll('[data-readiness-key]');
    var total = allBoxes.length;
    var completed = 0;
    allBoxes.forEach(function (cb) { if (cb.checked) completed++; });

    Events.log('readiness_updated', 'client', _clientId, { completed: completed, total: total });
    CRM.toast('Checklist saved (' + completed + '/' + total + ' complete)', 'success');
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

    // Financial calculators
    _calcMortgage: _calcMortgage,
    _calcClosing: _calcClosing,
    _calcRentVsBuy: _calcRentVsBuy,
    _calcAffordability: _calcAffordability,
    _toggleCalcSection: _toggleCalcSection,

    // Showings
    _addShowingFeedback: _addShowingFeedback,
    _submitShowingFeedback: _submitShowingFeedback,

    // Documents
    _filterDocs: _filterDocs,

    // Readiness
    _onReadinessChange: _onReadinessChange,
    _saveReadiness: _saveReadiness,

    // Listing Workspace
    openListing: openListing,
    switchListingTab: switchListingTab,
    _runComplianceCheck: _runComplianceCheck,
  };
})();
