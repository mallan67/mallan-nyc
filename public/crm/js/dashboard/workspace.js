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
    var html = '';

    // Quick actions
    html += '<div class="card p-3"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Quick Actions</h4>' +
      '<div class="space-y-1">' +
        '<button class="w-full text-left text-sm p-2 rounded hover:bg-gray-50" onclick="CRM.quickSendListing()"><i class="fas fa-paper-plane text-xs text-gray-400 mr-2"></i>Send Listing</button>' +
        '<button class="w-full text-left text-sm p-2 rounded hover:bg-gray-50" onclick="CRM.quickTask()"><i class="fas fa-tasks text-xs text-gray-400 mr-2"></i>Add Task</button>' +
        '<button class="w-full text-left text-sm p-2 rounded hover:bg-gray-50" onclick="CRM.quickNote()"><i class="fas fa-sticky-note text-xs text-gray-400 mr-2"></i>Add Note</button>' +
      '</div></div>';

    // Lead Score / Health
    html += '<div class="card p-3"><h4 class="text-xs font-bold text-gray-500 uppercase mb-2">Client Health</h4>' +
      '<div class="space-y-2">' +
        '<div class="flex justify-between text-xs"><span>Health Score</span><span class="font-bold">' + (cl.healthScore || cl.health_score || '—') + '</span></div>' +
        '<div class="flex justify-between text-xs"><span>Readiness</span><span class="font-bold">' + (cl.readinessScore || cl.readiness_score || '—') + '</span></div>' +
        (cl.conversionProbability ? '<div class="flex justify-between text-xs"><span>Conversion</span><span class="font-bold">' + cl.conversionProbability + '%</span></div>' : '') +
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

    return html;
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
    el.innerHTML = '<div class="space-y-4">' +
      // Contact + preferences
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
        '<div class="space-y-3">' +
          '<h3 class="text-sm font-bold text-gray-700">Contact Information</h3>' +
          _infoRow('Email', cl.email) +
          _infoRow('Phone', cl.phone) +
          _infoRow('Source', cl.source) +
          _infoRow('Created', D(cl.created_at || cl.createdAt)) +
        '</div>' +
        '<div class="space-y-3">' +
          '<h3 class="text-sm font-bold text-gray-700">Preferences</h3>' +
          _infoRow('Type', cl.type || cl.client_type) +
          _infoRow('Stage', cl.stage || cl.status) +
          (cl.preferences ? _infoRow('Budget', cl.preferences.budget ? $(cl.preferences.budget) : '-') : '') +
          (cl.preferences ? _infoRow('Neighborhoods', (cl.preferences.neighborhoods || []).join(', ') || '-') : '') +
          (cl.leaseEndDate || cl.lease_end_date ? _infoRow('Lease End', D(cl.leaseEndDate || cl.lease_end_date)) : '') +
        '</div>' +
      '</div>' +

      // Notes
      '<div>' +
        '<h3 class="text-sm font-bold text-gray-700 mb-2">Notes</h3>' +
        '<p class="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">' + E(cl.notes || 'No notes yet. Click "Add Note" to get started.') + '</p>' +
      '</div>' +

      // Recent activity
      '<div>' +
        '<h3 class="text-sm font-bold text-gray-700 mb-2">Recent Activity</h3>' +
        _miniTimeline() +
      '</div>' +
    '</div>';
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
    el.innerHTML = '<div class="space-y-4">' +
      '<div class="flex items-center justify-between">' +
        '<h3 class="text-sm font-bold text-gray-700">Listings for ' + E(_client.name || 'Client') + '</h3>' +
        '<button class="btn btn-sm btn-gold" onclick="CRM.quickSendListing()"><i class="fas fa-paper-plane"></i> Send Listing</button>' +
      '</div>' +

      // Auto-alert controls
      '<div class="card p-3">' +
        '<div class="flex items-center justify-between mb-2">' +
          '<h4 class="text-xs font-bold text-gray-500 uppercase">Auto-Alert Settings</h4>' +
        '</div>' +
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">' +
          '<label class="flex items-center gap-2"><input type="checkbox" checked> New matches</label>' +
          '<label class="flex items-center gap-2"><input type="checkbox" checked> Price changes</label>' +
          '<label class="flex items-center gap-2"><input type="checkbox" checked> Status changes</label>' +
          '<label class="flex items-center gap-2"><input type="checkbox"> Urgency flags</label>' +
        '</div>' +
      '</div>' +

      // Smart Match section
      '<div class="card"><div class="card-header"><h3>Best Matches</h3></div>' +
        '<div class="card-body" id="wsClientMatches">' + UI.loading() + '</div></div>' +

      // Sent listings
      '<div class="card"><div class="card-header"><h3>Sent Listings</h3></div>' +
        '<div class="card-body" id="wsClientSent">' + UI.loading() + '</div></div>' +
    '</div>';

    // Load listings
    MallanAPI.listings.list({ limit: 20 }).then(function (data) {
      var listings = data.listings || [];
      var matches = document.getElementById('wsClientMatches');
      if (matches) {
        if (listings.length === 0) {
          matches.innerHTML = '<p class="text-sm text-gray-500">No matching listings found</p>';
        } else {
          var html = '<div class="space-y-2">';
          listings.slice(0, 5).forEach(function (l) {
            html += UI.listingCard(l, "Router.navigate('/workspace/listing/" + E(l.id || l.listing_id) + "/overview')");
          });
          html += '</div>';
          matches.innerHTML = html;
        }
      }
    });

    // Sent listings from events
    var sentEvents = Events.getByEntity('client', _clientId).filter(function (e) { return e.type === 'listing_sent'; });
    var sentEl = document.getElementById('wsClientSent');
    if (sentEl) {
      if (sentEvents.length === 0) {
        sentEl.innerHTML = '<p class="text-sm text-gray-500">No listings sent yet</p>';
      } else {
        sentEl.innerHTML = UI.timeline(sentEvents.map(function (e) {
          return { title: 'Listing sent', description: e.payload.listingId || '', time: Utils.formatTimeAgo(e.createdAt), dotClass: 'info' };
        }));
      }
    }
  }

  // ─── Tab: Activity ───────────────────────────────────────────────────
  function _clientActivity(el) {
    var events = Events.getByEntity('client', _clientId);
    el.innerHTML = '<div class="space-y-4">' +
      '<h3 class="text-sm font-bold text-gray-700">Activity Timeline</h3>' +
      UI.timeline(events.map(function (e) {
        return {
          title: Events.label(e.type),
          description: e.payload ? Utils.truncate(JSON.stringify(e.payload), 100) : '',
          time: Utils.formatTimeAgo(e.createdAt),
          dotClass: e.category === 'audit' ? 'active' : 'info',
        };
      })) +
    '</div>';
  }

  // ─── Tab: Pipeline & Tasks ───────────────────────────────────────────
  function _clientPipeline(el) {
    var cl = _client;
    var isRenter = (cl.type || cl.client_type) === 'renter';

    // Load persisted nurture settings
    var nurture = _loadNurtureSettings(_clientId);

    var html = '<div class="space-y-4">';

    // Stage visualization
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

    // Per-client tasks
    html += '<div class="mt-4"><h4 class="text-sm font-bold text-gray-700 mb-2">Tasks</h4>';
    var tasks = (_clientData.tasks || []).filter(function (t) { return t.client_id === _clientId || t.clientId === _clientId; });
    if (tasks.length > 0) {
      tasks.forEach(function (t) {
        var overdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed';
        html += '<div class="flex items-center gap-3 p-2 rounded-lg ' + (overdue ? 'bg-red-50' : 'hover:bg-gray-50') + ' mb-1">' +
          '<input type="checkbox" ' + (t.status === 'completed' ? 'checked' : '') + '>' +
          '<span class="text-sm ' + (t.status === 'completed' ? 'line-through text-gray-400' : '') + '">' + E(t.title) + '</span>' +
          (t.due_date ? '<span class="text-xs text-gray-400 ml-auto">' + D(t.due_date) + '</span>' : '') +
        '</div>';
      });
    } else {
      html += '<p class="text-xs text-gray-400">No tasks for this client</p>';
    }
    html += '</div>';

    html += '</div>';
    el.innerHTML = html;
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
    el.innerHTML = '<div class="space-y-4">' +
      '<h3 class="text-sm font-bold text-gray-700">Market & Intelligence</h3>' +
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
        '<div class="card p-4"><h4 class="text-sm font-bold mb-2">Neighborhood Pulse</h4>' +
          '<p class="text-xs text-gray-500">Market trends for preferred neighborhoods</p>' +
          UI.emptyState('fa-chart-area', 'Market data loading...') + '</div>' +
        '<div class="card p-4"><h4 class="text-sm font-bold mb-2">Price Trends</h4>' +
          '<p class="text-xs text-gray-500">Median prices in target areas</p>' +
          UI.emptyState('fa-chart-line', 'Price trend data coming soon') + '</div>' +
      '</div>' +
      // Tools palette
      '<div class="card p-4"><h4 class="text-sm font-bold mb-2">Tools</h4>' +
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">' +
          '<button class="p-3 bg-gray-50 rounded-lg text-center hover:bg-gold-bg transition-all" onclick="window.open(\'/crm/search\',\'_blank\')">' +
            '<i class="fas fa-search text-gold mb-1"></i><p class="text-xs font-medium">IDX Search</p></button>' +
          '<button class="p-3 bg-gray-50 rounded-lg text-center hover:bg-gold-bg transition-all">' +
            '<i class="fas fa-chart-bar text-blue-500 mb-1"></i><p class="text-xs font-medium">CMA</p></button>' +
          '<button class="p-3 bg-gray-50 rounded-lg text-center hover:bg-gold-bg transition-all">' +
            '<i class="fas fa-calculator text-green-500 mb-1"></i><p class="text-xs font-medium">Calculator</p></button>' +
          '<button class="p-3 bg-gray-50 rounded-lg text-center hover:bg-gold-bg transition-all">' +
            '<i class="fas fa-subway text-purple-500 mb-1"></i><p class="text-xs font-medium">Transit</p></button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ─── Tab: Financial ──────────────────────────────────────────────────
  function _clientFinancial(el) {
    var type = (_client.type || _client.client_type || 'buyer').toLowerCase();
    var isBuyer = type === 'buyer';
    var isRenter = type === 'renter';

    el.innerHTML = '<div class="space-y-4">' +
      '<h3 class="text-sm font-bold text-gray-700">Financial Tools</h3>' +
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
        (isBuyer ? _calcCard('Mortgage Calculator', 'fa-home', 'Calculate monthly payments', 'mortgage') : '') +
        (isBuyer ? _calcCard('Affordability', 'fa-dollar-sign', 'How much can they afford?', 'affordability') : '') +
        (isRenter ? _calcCard('Rent vs. Buy', 'fa-balance-scale', 'Compare renting vs. buying', 'rent-vs-buy') : '') +
        _calcCard('Closing Costs', 'fa-file-invoice-dollar', 'Estimated closing costs', 'closing') +
        _calcCard('Investment Analysis', 'fa-chart-pie', 'ROI & cap rate analysis', 'investment') +
        _calcCard('Renovation Budget', 'fa-tools', 'Renovation cost estimator', 'renovation') +
      '</div>' +
    '</div>';
  }

  function _calcCard(title, icon, desc, type) {
    return '<div class="card p-4 hover:border-gold transition-all cursor-pointer">' +
      '<div class="flex items-center gap-3 mb-2">' +
        '<div class="w-10 h-10 rounded-lg bg-gold-bg flex items-center justify-center"><i class="fas ' + icon + ' text-gold"></i></div>' +
        '<div><p class="text-sm font-bold">' + E(title) + '</p><p class="text-xs text-gray-500">' + E(desc) + '</p></div>' +
      '</div>' +
    '</div>';
  }

  // ─── Tab: Showings ───────────────────────────────────────────────────
  function _clientShowings(el) {
    var showings = _clientData.showings || [];
    el.innerHTML = '<div class="space-y-4">' +
      '<div class="flex items-center justify-between">' +
        '<h3 class="text-sm font-bold text-gray-700">Showings</h3>' +
        '<button class="btn btn-sm btn-gold" onclick="Workspace._scheduleShowing()"><i class="fas fa-plus"></i> Schedule</button>' +
      '</div>' +
      (showings.length > 0 ?
        '<div class="space-y-2">' + showings.map(function (s) {
          var isPast = new Date(s.date || s.showing_date) < new Date();
          return '<div class="flex items-center gap-3 p-3 rounded-lg ' + (isPast ? 'bg-gray-50' : 'bg-blue-50') + '">' +
            '<div class="w-10 h-10 rounded-lg flex items-center justify-center ' + (isPast ? 'bg-gray-200' : 'bg-blue-100') + '">' +
              '<i class="fas fa-calendar ' + (isPast ? 'text-gray-400' : 'text-blue-500') + '"></i></div>' +
            '<div class="flex-1"><p class="text-sm font-medium">' + E(s.address || s.listing_address || 'Showing') + '</p>' +
              '<p class="text-xs text-gray-500">' + D(s.date || s.showing_date) + '</p></div>' +
            UI.statusBadge(s.status || 'scheduled') +
          '</div>';
        }).join('') + '</div>'
        : UI.emptyState('fa-calendar', 'No showings scheduled')) +
    '</div>';
  }

  function _scheduleShowing() {
    CRM.openModal('Schedule Showing',
      '<form id="schedShowingForm" class="space-y-4">' +
        '<div class="grid grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Date *</label><input class="form-input" type="date" name="date" required></div>' +
          '<div class="form-group"><label class="form-label">Time</label>' +
            '<select class="form-input form-select" name="time"><option>Morning</option><option selected>Afternoon</option><option>Evening</option></select></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Address</label><input class="form-input" name="address"></div>' +
        '<div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" name="notes" rows="2"></textarea></div>' +
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
      Events.log('showing_scheduled', 'client', _clientId, { date: data.date });
      CRM.closeModal(); CRM.toast('Showing scheduled', 'success');
    }).catch(function () { CRM.closeModal(); CRM.toast('Showing saved', 'info'); });
  }

  // ─── Tab: Documents ──────────────────────────────────────────────────
  function _clientDocuments(el) {
    var docs = _clientData.documents || [];
    el.innerHTML = '<div class="space-y-4">' +
      '<div class="flex items-center justify-between">' +
        '<h3 class="text-sm font-bold text-gray-700">Documents</h3>' +
        '<button class="btn btn-sm btn-gold" onclick="Panels._uploadDoc(\'client\',\'' + E(_clientId) + '\')"><i class="fas fa-upload"></i> Upload</button>' +
      '</div>' +
      (docs.length > 0 ?
        '<div class="space-y-2">' + docs.map(function (d) {
          return '<div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gold-bg transition-all cursor-pointer">' +
            '<i class="fas ' + Documents.typeIcon(d.type) + ' text-gold"></i>' +
            '<div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">' + E(d.title || d.name || 'Document') + '</p>' +
              '<p class="text-xs text-gray-500">' + Documents.typeLabel(d.type) + ' · ' + D(d.created_at || d.createdAt) + '</p></div>' +
            Documents.statusBadge(d.status) +
          '</div>';
        }).join('') + '</div>'
        : UI.emptyState('fa-folder-open', 'No documents for this client')) +
    '</div>';
  }

  // ─── Tab: Agreements & Disclosures ───────────────────────────────────
  function _clientAgreements(el) {
    var type = (_client.type || _client.client_type || 'buyer').toLowerCase();
    var agreements = [];

    if (type === 'buyer') {
      agreements = [
        { name: 'Buyer Agency Agreement', required: true, status: 'pending' },
        { name: 'Commission Negotiability Disclosure', required: true, status: 'pending' },
        { name: 'Fair Housing Notice', required: true, status: 'signed' },
        { name: 'Agency Disclosure', required: true, status: 'signed' },
      ];
    } else if (type === 'seller') {
      agreements = [
        { name: 'Exclusive Right to Sell Agreement', required: true, status: 'pending' },
        { name: 'Property Condition Disclosure', required: true, status: 'pending' },
        { name: 'Lead Paint Disclosure', required: true, status: 'pending' },
        { name: 'Fair Housing Notice', required: true, status: 'signed' },
        { name: 'Agency Disclosure', required: true, status: 'signed' },
      ];
    } else if (type === 'renter') {
      agreements = [
        { name: 'Tenant Representation Agreement', required: false, status: 'pending' },
        { name: 'Fair Housing Notice', required: true, status: 'signed' },
      ];
    } else {
      agreements = [
        { name: 'Exclusive Rental Listing Agreement', required: true, status: 'pending' },
        { name: 'Fair Housing Notice', required: true, status: 'signed' },
      ];
    }

    el.innerHTML = '<div class="space-y-4">' +
      '<h3 class="text-sm font-bold text-gray-700">Agreements & Disclosures</h3>' +
      '<div class="space-y-2">' +
      agreements.map(function (a) {
        var color = a.status === 'signed' ? '#059669' : '#F59E0B';
        var icon = a.status === 'signed' ? 'fa-check-circle' : 'fa-clock';
        return '<div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50">' +
          '<i class="fas ' + icon + '" style="color:' + color + '"></i>' +
          '<div class="flex-1"><p class="text-sm font-medium">' + E(a.name) + '</p>' +
            '<p class="text-xs text-gray-500">' + (a.required ? 'Required' : 'Optional') + '</p></div>' +
          '<span style="font-size:10px;font-weight:700;color:' + color + ';text-transform:uppercase">' + E(a.status) + '</span>' +
        '</div>';
      }).join('') +
      '</div>' +
    '</div>';
  }

  // ─── Tab: Readiness Checklist ────────────────────────────────────────
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
    } else {
      items = [
        { label: 'Income documentation ready', key: 'income' },
        { label: 'References prepared', key: 'references' },
        { label: 'Guarantor identified (if needed)', key: 'guarantor' },
        { label: 'Move-in date confirmed', key: 'move_in' },
      ];
    }

    el.innerHTML = '<div class="space-y-4">' +
      '<h3 class="text-sm font-bold text-gray-700">Readiness Checklist</h3>' +
      '<div class="space-y-2">' +
      items.map(function (item) {
        return '<label class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gold-bg cursor-pointer transition-all">' +
          '<input type="checkbox" class="w-4 h-4 rounded border-gray-300">' +
          '<span class="text-sm font-medium">' + E(item.label) + '</span>' +
        '</label>';
      }).join('') +
      '</div>' +
      '<div class="mt-4"><button class="btn btn-gold btn-sm"><i class="fas fa-save"></i> Save Checklist</button></div>' +
    '</div>';
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

    // Listing Workspace
    openListing: openListing,
    switchListingTab: switchListingTab,
    _runComplianceCheck: _runComplianceCheck,
  };
})();
