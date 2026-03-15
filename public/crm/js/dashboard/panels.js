// ═══════════════════════════════════════════════════════════════════════════════
// CRM PANELS — All main panel renderers
// Dashboard, Clients, Pipeline, Tasks, Listings, Deals, Documents, Agents
// ═══════════════════════════════════════════════════════════════════════════════
/* global MallanAPI, CRM, Workspace */

var Panels = (function () {
  'use strict';

  var E = CRM.esc;
  var $ = CRM.formatMoney;
  var D = CRM.formatDate;

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════
  function dashboard(container) {
    container.innerHTML = '<div class="space-y-6" id="dashPanel"></div>';
    var panel = document.getElementById('dashPanel');

    // Load all data concurrently
    Promise.all([
      MallanAPI.clients.list({ limit: 100 }).catch(function () { return { clients: [] }; }),
      MallanAPI.listings.list({ limit: 50 }).catch(function () { return { listings: [] }; }),
      MallanAPI.deals.list({ limit: 50 }).catch(function () { return { deals: [] }; }),
      MallanAPI._fetch('/api/crm/tasks').catch(function () { return { tasks: [] }; }),
      MallanAPI.showings.list({ limit: 20 }).catch(function () { return { showings: [] }; })
    ]).then(function (results) {
      var clients = results[0].clients || [];
      var listings = results[1].listings || [];
      var deals = results[2].deals || [];
      var tasks = results[3].tasks || [];
      var showings = results[4].showings || [];

      var activeClients = clients.filter(function (c) { return c.status !== 'closed' && c.status !== 'inactive'; });
      var activeListings = listings.filter(function (l) { return l.status === 'Active' || l.status === 'active'; });
      var pendingTasks = tasks.filter(function (t) { return t.status !== 'completed' && t.status !== 'cancelled'; });
      var upcomingShowings = showings.filter(function (s) { return new Date(s.date) >= new Date(); });

      // ── Stats Row ──
      var statsHtml = '<div class="stat-grid">' +
        statCard('fa-users', '#3b82f6', '#EFF6FF', activeClients.length, 'Active Clients') +
        statCard('fa-building', '#059669', '#ECFDF5', activeListings.length, 'Active Listings') +
        statCard('fa-handshake', '#f59e0b', '#FFFBEB', deals.length, 'Deals') +
        statCard('fa-tasks', '#8b5cf6', '#F5F3FF', pendingTasks.length, 'Open Tasks') +
      '</div>';

      // ── Quick Actions ──
      var actionsHtml = '<div class="card"><div class="card-header"><h3>Quick Actions</h3></div>' +
        '<div class="card-body"><div class="flex flex-wrap gap-2">' +
          '<button class="btn btn-gold" onclick="CRM.navigate(\'clients\'); setTimeout(function(){Panels.showAddClientModal()},100)"><i class="fas fa-user-plus"></i> Add Client</button>' +
          '<button class="btn btn-primary" onclick="Panels.openListingForm(\'sale\')"><i class="fas fa-plus"></i> New Sale Listing</button>' +
          '<button class="btn btn-primary" onclick="Panels.openListingForm(\'rental\')"><i class="fas fa-plus"></i> New Rental Listing</button>' +
          '<button class="btn btn-outline" onclick="CRM.navigate(\'tasks\')"><i class="fas fa-plus"></i> Add Task</button>' +
        '</div></div></div>';

      // ── Upcoming Showings ──
      var showingsHtml = '';
      if (upcomingShowings.length > 0) {
        showingsHtml = '<div class="card"><div class="card-header"><h3>Upcoming Showings</h3><span class="text-xs text-gray-500">' + upcomingShowings.length + ' scheduled</span></div>' +
          '<div class="card-body"><div class="space-y-2">';
        upcomingShowings.slice(0, 5).forEach(function (s) {
          showingsHtml += '<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">' +
            '<div class="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0"><i class="fas fa-calendar text-blue-500 text-xs"></i></div>' +
            '<div class="flex-1 min-w-0">' +
              '<p class="text-sm font-semibold text-gray-900 truncate">' + E(s.address || s.listing_address || 'Showing') + '</p>' +
              '<p class="text-xs text-gray-500">' + D(s.date) + (s.time ? ' at ' + E(s.time) : '') + '</p>' +
            '</div>' +
            '<span class="badge badge-' + (s.status || 'pending') + '">' + E(s.status || 'scheduled') + '</span>' +
          '</div>';
        });
        showingsHtml += '</div></div></div>';
      }

      // ── Recent Clients ──
      var recentClients = clients.slice(0, 8);
      var clientsHtml = '<div class="card"><div class="card-header"><h3>Recent Clients</h3>' +
        '<button class="btn btn-sm btn-outline" onclick="CRM.navigate(\'clients\')">View All</button></div>';

      if (recentClients.length > 0) {
        clientsHtml += '<div class="data-table"><table><thead><tr>' +
          '<th>Client</th><th>Type</th><th>Stage</th><th>Added</th>' +
        '</tr></thead><tbody>';
        recentClients.forEach(function (c) {
          clientsHtml += '<tr class="clickable" onclick="Workspace.open(\'' + E(c.id) + '\')">' +
            '<td><div class="flex items-center gap-2">' +
              '<div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">' + initials(c.name || c.email) + '</div>' +
              '<div><p class="text-sm font-semibold">' + E(c.name || c.email || 'Unknown') + '</p>' +
                '<p class="text-xs text-gray-500">' + E(c.email || '') + '</p></div>' +
            '</div></td>' +
            '<td>' + CRM.roleBadge(c.role || c.client_type) + '</td>' +
            '<td>' + CRM.stageBadge(c.stage) + '</td>' +
            '<td class="text-xs text-gray-500">' + D(c.created_at) + '</td>' +
          '</tr>';
        });
        clientsHtml += '</tbody></table></div>';
      } else {
        clientsHtml += '<div class="empty-state"><i class="fas fa-users"></i><p>No clients yet</p>' +
          '<button class="btn btn-gold btn-sm" onclick="Panels.showAddClientModal()"><i class="fas fa-user-plus"></i> Add First Client</button></div>';
      }
      clientsHtml += '</div>';

      // ── Pending Tasks ──
      var tasksHtml = '';
      if (pendingTasks.length > 0) {
        tasksHtml = '<div class="card"><div class="card-header"><h3>Open Tasks</h3>' +
          '<button class="btn btn-sm btn-outline" onclick="CRM.navigate(\'tasks\')">View All</button></div>' +
          '<div class="card-body"><div class="space-y-2">';
        pendingTasks.slice(0, 5).forEach(function (t) {
          var overdue = t.due_date && new Date(t.due_date) < new Date();
          tasksHtml += '<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">' +
            '<button class="w-5 h-5 rounded border-2 ' + (overdue ? 'border-red-400' : 'border-gray-300') + ' flex-shrink-0 hover:border-gold" onclick="Panels.completeTask(\'' + E(t.id) + '\')"></button>' +
            '<div class="flex-1 min-w-0">' +
              '<p class="text-sm ' + (overdue ? 'text-red-600 font-semibold' : 'text-gray-900') + ' truncate">' + E(t.title || t.description) + '</p>' +
              (t.due_date ? '<p class="text-xs ' + (overdue ? 'text-red-500' : 'text-gray-500') + '">' + (overdue ? 'Overdue: ' : 'Due: ') + D(t.due_date) + '</p>' : '') +
            '</div>' +
          '</div>';
        });
        tasksHtml += '</div></div></div>';
      }

      panel.innerHTML = statsHtml + actionsHtml +
        '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">' +
          clientsHtml + (showingsHtml || tasksHtml) +
        '</div>' +
        (showingsHtml && tasksHtml ? tasksHtml : '');
    });
  }

  function statCard(icon, color, bg, value, label) {
    return '<div class="stat-card">' +
      '<div class="stat-card-icon" style="background:' + bg + ';color:' + color + '"><i class="fas ' + icon + '"></i></div>' +
      '<div class="stat-card-value">' + value + '</div>' +
      '<div class="stat-card-label">' + label + '</div>' +
    '</div>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENTS
  // ═══════════════════════════════════════════════════════════════════════════
  var _clientsCache = [];

  function clients(container, opts) {
    opts = opts || {};

    container.innerHTML =
      '<div class="space-y-4">' +
        '<!-- Toolbar -->' +
        '<div class="flex flex-wrap items-center gap-3">' +
          '<div class="flex-1 min-w-[200px] relative">' +
            '<i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>' +
            '<input id="clientSearch" type="text" placeholder="Search by name, email, phone..." ' +
              'class="form-input pl-9" value="' + E(opts.search || '') + '">' +
          '</div>' +
          '<select id="clientRoleFilter" class="form-input form-select" style="width:auto;min-width:130px;">' +
            '<option value="">All Types</option>' +
            '<option value="buyer">Buyers</option>' +
            '<option value="seller">Sellers</option>' +
            '<option value="renter">Renters</option>' +
            '<option value="landlord">Landlords</option>' +
          '</select>' +
          '<select id="clientStageFilter" class="form-input form-select" style="width:auto;min-width:130px;">' +
            '<option value="">All Stages</option>' +
            '<option value="new">New</option>' +
            '<option value="contacted">Contacted</option>' +
            '<option value="nurturing">Nurturing</option>' +
            '<option value="active">Active</option>' +
            '<option value="showing">Showing</option>' +
            '<option value="offer">Offer</option>' +
            '<option value="deal">Deal</option>' +
            '<option value="closed">Closed</option>' +
          '</select>' +
          '<button class="btn btn-gold" onclick="Panels.showAddClientModal()"><i class="fas fa-user-plus"></i> Add Client</button>' +
        '</div>' +
        '<!-- Client List -->' +
        '<div id="clientListContainer"><div class="flex items-center justify-center h-32"><i class="fas fa-spinner fa-spin text-xl text-gold"></i></div></div>' +
      '</div>';

    // Load clients
    loadClients(opts.search);

    // Filters
    var searchEl = document.getElementById('clientSearch');
    var roleEl = document.getElementById('clientRoleFilter');
    var stageEl = document.getElementById('clientStageFilter');
    var debounce = null;

    function applyFilters() {
      clearTimeout(debounce);
      debounce = setTimeout(function () { filterClients(); }, 200);
    }

    if (searchEl) searchEl.addEventListener('input', applyFilters);
    if (roleEl) roleEl.addEventListener('change', applyFilters);
    if (stageEl) stageEl.addEventListener('change', applyFilters);
  }

  function loadClients(searchQuery) {
    MallanAPI.clients.list({ limit: 200 }).then(function (data) {
      _clientsCache = data.clients || [];
      filterClients(searchQuery);
    }).catch(function () {
      var c = document.getElementById('clientListContainer');
      if (c) c.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Failed to load clients</p></div>';
    });
  }

  function filterClients(initialSearch) {
    var searchEl = document.getElementById('clientSearch');
    var roleEl = document.getElementById('clientRoleFilter');
    var stageEl = document.getElementById('clientStageFilter');
    var c = document.getElementById('clientListContainer');
    if (!c) return;

    var search = (initialSearch || (searchEl ? searchEl.value : '')).toLowerCase().trim();
    var roleFilter = roleEl ? roleEl.value : '';
    var stageFilter = stageEl ? stageEl.value : '';

    var filtered = _clientsCache.filter(function (cl) {
      if (search) {
        var haystack = ((cl.name || '') + ' ' + (cl.email || '') + ' ' + (cl.phone || '')).toLowerCase();
        if (haystack.indexOf(search) === -1) return false;
      }
      if (roleFilter && (cl.role || cl.client_type) !== roleFilter) return false;
      if (stageFilter && cl.stage !== stageFilter) return false;
      return true;
    });

    if (filtered.length === 0) {
      c.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>' +
        (search || roleFilter || stageFilter ? 'No clients match your filters' : 'No clients yet') +
        '</p><button class="btn btn-gold btn-sm" onclick="Panels.showAddClientModal()"><i class="fas fa-user-plus"></i> Add Client</button></div>';
      return;
    }

    var html = '<div class="data-table"><table><thead><tr>' +
      '<th>Client</th><th>Type</th><th>Stage</th><th>Phone</th><th>Last Activity</th><th></th>' +
    '</tr></thead><tbody>';

    filtered.forEach(function (cl) {
      html += '<tr class="clickable" onclick="Workspace.open(\'' + E(cl.id) + '\')">' +
        '<td><div class="flex items-center gap-3">' +
          '<div class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">' + initials(cl.name || cl.email) + '</div>' +
          '<div><p class="text-sm font-semibold text-gray-900">' + E(cl.name || 'Unknown') + '</p>' +
            '<p class="text-xs text-gray-500">' + E(cl.email || '') + '</p></div>' +
        '</div></td>' +
        '<td>' + CRM.roleBadge(cl.role || cl.client_type) + '</td>' +
        '<td>' + CRM.stageBadge(cl.stage) + '</td>' +
        '<td class="text-sm text-gray-600">' + E(cl.phone || '-') + '</td>' +
        '<td class="text-xs text-gray-500">' + CRM.formatTimeAgo(cl.updated_at || cl.created_at) + '</td>' +
        '<td>' +
          '<button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); Workspace.open(\'' + E(cl.id) + '\')" title="Open workspace">' +
            '<i class="fas fa-arrow-right"></i>' +
          '</button>' +
        '</td>' +
      '</tr>';
    });

    html += '</tbody></table></div>';
    c.innerHTML = html;
  }

  // ── Add Client Modal ──
  function showAddClientModal() {
    var formHtml =
      '<form id="addClientForm" class="space-y-4">' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">First Name *</label><input class="form-input" name="first_name" required></div>' +
          '<div class="form-group"><label class="form-label">Last Name *</label><input class="form-input" name="last_name" required></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Email *</label><input class="form-input" type="email" name="email" required></div>' +
        '<div class="form-group"><label class="form-label">Phone</label><input class="form-input" type="tel" name="phone"></div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Client Type *</label>' +
            '<select class="form-input form-select" name="role" required>' +
              '<option value="">Select type...</option>' +
              '<option value="buyer">Buyer</option>' +
              '<option value="seller">Seller</option>' +
              '<option value="renter">Renter</option>' +
              '<option value="landlord">Landlord</option>' +
            '</select></div>' +
          '<div class="form-group"><label class="form-label">Source</label>' +
            '<select class="form-input form-select" name="source">' +
              '<option value="">Select source...</option>' +
              '<option value="website">Website</option>' +
              '<option value="referral">Referral</option>' +
              '<option value="streeteasy">StreetEasy</option>' +
              '<option value="zillow">Zillow</option>' +
              '<option value="walk-in">Walk-in</option>' +
              '<option value="social">Social Media</option>' +
              '<option value="other">Other</option>' +
            '</select></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" name="notes" rows="3" placeholder="Initial notes about this client..."></textarea></div>' +
      '</form>';

    CRM.openModal('Add New Client', formHtml, {
      footer:
        '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
        '<button class="btn btn-gold" onclick="Panels.submitAddClient()"><i class="fas fa-user-plus"></i> Add Client</button>'
    });
  }

  function submitAddClient() {
    var form = document.getElementById('addClientForm');
    if (!form || !form.checkValidity()) {
      form.reportValidity();
      return;
    }

    var data = {};
    new FormData(form).forEach(function (val, key) { if (val) data[key] = val; });
    data.name = (data.first_name || '') + ' ' + (data.last_name || '');

    MallanAPI.clients.create(data).then(function (res) {
      CRM.closeModal();
      CRM.toast('Client added successfully', 'success');
      if (CRM.currentPanel === 'clients') {
        loadClients();
      } else if (CRM.currentPanel === 'dashboard') {
        CRM.navigate('dashboard');
      }
      // Open their workspace
      if (res.client && res.client.id) {
        Workspace.open(res.client.id);
      }
    }).catch(function (err) {
      CRM.toast('Failed to add client: ' + err.message, 'error');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PIPELINE
  // ═══════════════════════════════════════════════════════════════════════════
  var STAGES = [
    { id: 'new', label: 'New', color: '#6b7280', icon: 'fa-star' },
    { id: 'contacted', label: 'Contacted', color: '#3b82f6', icon: 'fa-phone' },
    { id: 'nurturing', label: 'Nurturing', color: '#8b5cf6', icon: 'fa-seedling' },
    { id: 'active', label: 'Active', color: '#059669', icon: 'fa-bolt' },
    { id: 'showing', label: 'Showing', color: '#f59e0b', icon: 'fa-calendar' },
    { id: 'offer', label: 'Offer', color: '#f97316', icon: 'fa-gavel' },
    { id: 'deal', label: 'Deal', color: '#10b981', icon: 'fa-handshake' },
    { id: 'closed', label: 'Closed', color: '#059669', icon: 'fa-check-circle' },
  ];

  function pipeline(container) {
    container.innerHTML = '<div id="pipelineBoard"><div class="flex items-center justify-center h-64"><i class="fas fa-spinner fa-spin text-xl text-gold"></i></div></div>';

    // Load pipeline data
    MallanAPI._fetch('/api/crm/pipeline').then(function (data) {
      renderKanban(data.pipeline || []);
    }).catch(function () {
      // Fallback: build from client list
      MallanAPI.clients.list({ limit: 200 }).then(function (data) {
        var clients = data.clients || [];
        var pipelineData = STAGES.map(function (s) {
          var stageClients = clients.filter(function (c) { return (c.stage || 'new') === s.id; });
          return { stage: s.id, count: stageClients.length, leads: stageClients };
        });
        renderKanban(pipelineData);
      }).catch(function () {
        document.getElementById('pipelineBoard').innerHTML =
          '<div class="empty-state"><i class="fas fa-stream"></i><p>Failed to load pipeline</p></div>';
      });
    });
  }

  function renderKanban(pipelineData) {
    var board = document.getElementById('pipelineBoard');
    if (!board) return;

    // Summary bar
    var summaryHtml = '<div class="flex gap-1 mb-4 p-3 bg-white rounded-xl border border-gray-200">';
    STAGES.forEach(function (s, i) {
      var data = pipelineData.find(function (p) { return p.stage === s.id; });
      var count = data ? data.count : 0;
      summaryHtml += '<div class="flex-1 text-center">' +
        '<div class="w-8 h-8 rounded-full mx-auto mb-1 flex items-center justify-center text-white text-xs font-bold" style="background:' + s.color + '">' + count + '</div>' +
        '<p class="text-[9px] font-semibold text-gray-500 uppercase tracking-wide">' + s.label + '</p>' +
      '</div>';
      if (i < STAGES.length - 1) summaryHtml += '<div class="text-gray-300 flex items-center pt-0" style="margin-top:-8px;"><i class="fas fa-chevron-right text-[8px]"></i></div>';
    });
    summaryHtml += '</div>';

    // Kanban columns
    var kanbanHtml = '<div class="kanban-board">';
    STAGES.forEach(function (s) {
      var data = pipelineData.find(function (p) { return p.stage === s.id; });
      var leads = data ? (data.leads || []) : [];

      kanbanHtml += '<div class="kanban-col">' +
        '<div class="kanban-col-header" style="border-color:' + s.color + '">' +
          '<span class="kanban-col-title" style="color:' + s.color + '"><i class="fas ' + s.icon + ' mr-1"></i> ' + s.label + '</span>' +
          '<span class="kanban-col-count" style="background:' + s.color + '">' + leads.length + '</span>' +
        '</div>' +
        '<div class="kanban-col-body">';

      if (leads.length === 0) {
        kanbanHtml += '<div class="text-center py-6 text-xs text-gray-400"><i class="fas fa-inbox block text-lg mb-1"></i>No clients</div>';
      } else {
        leads.forEach(function (l) {
          kanbanHtml += '<div class="kanban-card" onclick="Workspace.open(\'' + E(l.id) + '\')">' +
            '<div class="flex items-center justify-between mb-1">' +
              '<p class="text-sm font-semibold text-gray-900 truncate">' + E(l.name || l.email || 'Unknown') + '</p>' +
              CRM.roleBadge(l.role || l.client_type) +
            '</div>' +
            (l.email ? '<p class="text-xs text-gray-500 truncate">' + E(l.email) + '</p>' : '') +
            (l.phone ? '<p class="text-xs text-gray-500">' + E(l.phone) + '</p>' : '') +
            '<div class="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">' +
              '<span class="text-[10px] text-gray-400">' + CRM.formatTimeAgo(l.updated_at || l.created_at) + '</span>' +
              '<button class="text-xs text-gold hover:text-gold-dark font-semibold" onclick="event.stopPropagation(); Panels.moveStage(\'' + E(l.id) + '\', \'' + E(s.id) + '\')">Move <i class="fas fa-arrows-alt text-[9px]"></i></button>' +
            '</div>' +
          '</div>';
        });
      }

      kanbanHtml += '</div></div>';
    });
    kanbanHtml += '</div>';

    board.innerHTML = summaryHtml + kanbanHtml;
  }

  function moveStage(clientId, currentStage) {
    var options = STAGES.map(function (s) {
      return '<option value="' + s.id + '" ' + (s.id === currentStage ? 'selected' : '') + '>' + s.label + '</option>';
    }).join('');

    CRM.openModal('Move Client Stage',
      '<div class="form-group"><label class="form-label">New Stage</label>' +
        '<select id="newStageSelect" class="form-input form-select">' + options + '</select>' +
      '</div>',
      {
        footer:
          '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Panels.confirmMoveStage(\'' + E(clientId) + '\')">Move</button>'
      }
    );
  }

  function confirmMoveStage(clientId) {
    var sel = document.getElementById('newStageSelect');
    if (!sel) return;
    var newStage = sel.value;

    MallanAPI.clients.update(clientId, { stage: newStage }).then(function () {
      CRM.closeModal();
      CRM.toast('Client moved to ' + newStage, 'success');
      CRM.navigate('pipeline');
    }).catch(function (err) {
      CRM.toast('Failed: ' + err.message, 'error');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASKS
  // ═══════════════════════════════════════════════════════════════════════════
  function tasks(container) {
    container.innerHTML =
      '<div class="space-y-4">' +
        '<div class="flex items-center justify-between">' +
          '<div class="flex gap-2">' +
            '<button class="btn btn-sm btn-outline task-filter active" data-filter="pending" onclick="Panels.filterTasks(\'pending\',this)">Open</button>' +
            '<button class="btn btn-sm btn-outline task-filter" data-filter="completed" onclick="Panels.filterTasks(\'completed\',this)">Completed</button>' +
            '<button class="btn btn-sm btn-outline task-filter" data-filter="all" onclick="Panels.filterTasks(\'all\',this)">All</button>' +
          '</div>' +
          '<button class="btn btn-gold btn-sm" onclick="Panels.showAddTaskModal()"><i class="fas fa-plus"></i> Add Task</button>' +
        '</div>' +
        '<div id="taskList"><div class="flex items-center justify-center h-32"><i class="fas fa-spinner fa-spin text-xl text-gold"></i></div></div>' +
      '</div>';

    loadTasks('pending');
  }

  var _tasksCache = [];

  function loadTasks(filter) {
    MallanAPI._fetch('/api/crm/tasks').then(function (data) {
      _tasksCache = data.tasks || [];
      renderTasks(filter || 'pending');
    }).catch(function () {
      document.getElementById('taskList').innerHTML =
        '<div class="empty-state"><i class="fas fa-tasks"></i><p>Failed to load tasks</p></div>';
    });
  }

  function filterTasks(filter, btn) {
    // Update button states
    document.querySelectorAll('.task-filter').forEach(function (b) { b.classList.remove('active'); b.style.background = ''; b.style.color = ''; });
    if (btn) { btn.style.background = '#111827'; btn.style.color = 'white'; }
    renderTasks(filter);
  }

  function renderTasks(filter) {
    var c = document.getElementById('taskList');
    if (!c) return;

    var filtered = _tasksCache;
    if (filter === 'pending') filtered = _tasksCache.filter(function (t) { return t.status !== 'completed' && t.status !== 'cancelled'; });
    if (filter === 'completed') filtered = _tasksCache.filter(function (t) { return t.status === 'completed'; });

    if (filtered.length === 0) {
      c.innerHTML = '<div class="empty-state"><i class="fas fa-tasks"></i><p>No tasks</p></div>';
      return;
    }

    var html = '<div class="space-y-2">';
    filtered.forEach(function (t) {
      var done = t.status === 'completed';
      var overdue = !done && t.due_date && new Date(t.due_date) < new Date();
      html += '<div class="card" style="border-left:3px solid ' + (done ? '#059669' : overdue ? '#DC2626' : '#e5e7eb') + '">' +
        '<div class="flex items-center gap-3 p-4">' +
          '<button class="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ' +
            (done ? 'border-green-500 bg-green-500' : overdue ? 'border-red-400' : 'border-gray-300') + ' hover:border-gold" ' +
            'onclick="Panels.toggleTask(\'' + E(t.id) + '\', ' + !done + ')">' +
            (done ? '<i class="fas fa-check text-white text-[9px]"></i>' : '') +
          '</button>' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm font-semibold ' + (done ? 'text-gray-400 line-through' : 'text-gray-900') + ' truncate">' + E(t.title || t.description) + '</p>' +
            '<div class="flex items-center gap-3 mt-1">' +
              (t.due_date ? '<span class="text-xs ' + (overdue ? 'text-red-500 font-semibold' : 'text-gray-500') + '"><i class="fas fa-clock mr-1"></i>' + D(t.due_date) + '</span>' : '') +
              (t.client_name ? '<span class="text-xs text-gray-500"><i class="fas fa-user mr-1"></i>' + E(t.client_name) + '</span>' : '') +
              (t.priority ? '<span class="text-xs text-gray-500"><i class="fas fa-flag mr-1"></i>' + E(t.priority) + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<button class="text-gray-400 hover:text-red-500 text-xs" onclick="Panels.deleteTask(\'' + E(t.id) + '\')" title="Delete"><i class="fas fa-trash"></i></button>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';
    c.innerHTML = html;
  }

  function toggleTask(taskId, complete) {
    MallanAPI._fetch('/api/crm/tasks/' + encodeURIComponent(taskId), {
      method: 'PATCH',
      body: JSON.stringify({ status: complete ? 'completed' : 'pending' }),
    }).then(function () {
      CRM.toast(complete ? 'Task completed' : 'Task reopened', 'success');
      loadTasks();
    }).catch(function (err) { CRM.toast('Failed: ' + err.message, 'error'); });
  }

  function deleteTask(taskId) {
    if (!confirm('Delete this task?')) return;
    MallanAPI._fetch('/api/crm/tasks/' + encodeURIComponent(taskId), { method: 'DELETE' }).then(function () {
      CRM.toast('Task deleted', 'success');
      loadTasks();
    }).catch(function (err) { CRM.toast('Failed: ' + err.message, 'error'); });
  }

  function completeTask(taskId) {
    toggleTask(taskId, true);
  }

  function showAddTaskModal() {
    CRM.openModal('Add Task',
      '<form id="addTaskForm" class="space-y-4">' +
        '<div class="form-group"><label class="form-label">Title *</label><input class="form-input" name="title" required placeholder="What needs to be done?"></div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Due Date</label><input class="form-input" type="date" name="due_date"></div>' +
          '<div class="form-group"><label class="form-label">Priority</label>' +
            '<select class="form-input form-select" name="priority">' +
              '<option value="normal">Normal</option>' +
              '<option value="high">High</option>' +
              '<option value="urgent">Urgent</option>' +
            '</select></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" name="description" rows="2"></textarea></div>' +
      '</form>',
      {
        footer:
          '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Panels.submitAddTask()"><i class="fas fa-plus"></i> Add</button>'
      }
    );
  }

  function submitAddTask() {
    var form = document.getElementById('addTaskForm');
    if (!form || !form.checkValidity()) { form.reportValidity(); return; }
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    MallanAPI._fetch('/api/crm/tasks', { method: 'POST', body: JSON.stringify(data) }).then(function () {
      CRM.closeModal();
      CRM.toast('Task added', 'success');
      loadTasks();
    }).catch(function (err) { CRM.toast('Failed: ' + err.message, 'error'); });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LISTINGS
  // ═══════════════════════════════════════════════════════════════════════════
  function listings(container) {
    container.innerHTML =
      '<div class="space-y-4">' +
        '<div class="flex flex-wrap items-center gap-3">' +
          '<div class="flex gap-2">' +
            '<button class="btn btn-sm btn-outline listing-type-filter active" style="background:#111827;color:white" onclick="Panels.filterListingType(\'all\',this)">All</button>' +
            '<button class="btn btn-sm btn-outline listing-type-filter" onclick="Panels.filterListingType(\'sale\',this)">Sales</button>' +
            '<button class="btn btn-sm btn-outline listing-type-filter" onclick="Panels.filterListingType(\'rental\',this)">Rentals</button>' +
          '</div>' +
          '<div class="flex-1"></div>' +
          '<button class="btn btn-gold btn-sm" onclick="Panels.openListingForm(\'sale\')"><i class="fas fa-plus"></i> New Sale</button>' +
          '<button class="btn btn-primary btn-sm" onclick="Panels.openListingForm(\'rental\')"><i class="fas fa-plus"></i> New Rental</button>' +
        '</div>' +
        '<div id="listingsContainer"><div class="flex items-center justify-center h-32"><i class="fas fa-spinner fa-spin text-xl text-gold"></i></div></div>' +
      '</div>';

    loadListings('all');
  }

  var _listingsCache = [];

  function loadListings(typeFilter) {
    MallanAPI.listings.list({ limit: 100 }).then(function (data) {
      _listingsCache = data.listings || [];
      renderListings(typeFilter || 'all');
    }).catch(function () {
      document.getElementById('listingsContainer').innerHTML =
        '<div class="empty-state"><i class="fas fa-building"></i><p>Failed to load listings</p></div>';
    });
  }

  function filterListingType(type, btn) {
    document.querySelectorAll('.listing-type-filter').forEach(function (b) { b.classList.remove('active'); b.style.background = ''; b.style.color = ''; });
    if (btn) { btn.style.background = '#111827'; btn.style.color = 'white'; }
    renderListings(type);
  }

  function renderListings(typeFilter) {
    var c = document.getElementById('listingsContainer');
    if (!c) return;

    var filtered = _listingsCache;
    if (typeFilter === 'sale') filtered = _listingsCache.filter(function (l) { return (l.property_type || l.listing_type || '').toLowerCase().indexOf('rent') === -1; });
    if (typeFilter === 'rental') filtered = _listingsCache.filter(function (l) { return (l.property_type || l.listing_type || '').toLowerCase().indexOf('rent') !== -1; });

    if (filtered.length === 0) {
      c.innerHTML = '<div class="empty-state"><i class="fas fa-building"></i><p>No listings found</p>' +
        '<div class="flex gap-2 justify-center mt-2">' +
          '<button class="btn btn-gold btn-sm" onclick="Panels.openListingForm(\'sale\')"><i class="fas fa-plus"></i> New Sale</button>' +
          '<button class="btn btn-primary btn-sm" onclick="Panels.openListingForm(\'rental\')"><i class="fas fa-plus"></i> New Rental</button>' +
        '</div></div>';
      return;
    }

    var html = '<div class="data-table"><table><thead><tr>' +
      '<th>Listing</th><th>Price</th><th>Type</th><th>Status</th><th>DOM</th><th>Actions</th>' +
    '</tr></thead><tbody>';

    filtered.forEach(function (l) {
      var photo = l.photos && l.photos.length ? CRM.photoUrl(l.photos[0].url || l.photos[0]) : '';
      var address = l.address || l.street_address || l.UnparsedAddress || 'No address';
      var statusClass = (l.status || 'active').toLowerCase().replace(/\s+/g, '-');
      var dom = l.cumulative_dom || l.days_on_market || '-';
      var listingType = (l.listing_type || l.property_type || 'sale').toLowerCase().indexOf('rent') !== -1 ? 'Rental' : 'Sale';

      html += '<tr>' +
        '<td><div class="flex items-center gap-3">' +
          (photo ? '<img src="' + E(photo) + '" class="w-16 h-12 rounded-lg object-cover flex-shrink-0" alt="">' :
            '<div class="w-16 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0"><i class="fas fa-image text-gray-300"></i></div>') +
          '<div class="min-w-0"><p class="text-sm font-semibold text-gray-900 truncate">' + E(address) + '</p>' +
            '<p class="text-xs text-gray-500">' + (l.beds || '-') + ' bd / ' + (l.baths || '-') + ' ba' + (l.sqft ? ' / ' + Number(l.sqft).toLocaleString() + ' sqft' : '') + '</p></div>' +
        '</div></td>' +
        '<td class="font-bold text-gray-900">' + $(l.price || l.list_price) + '</td>' +
        '<td><span class="badge badge-' + (listingType === 'Rental' ? 'renter' : 'buyer') + '">' + listingType + '</span></td>' +
        '<td>' + CRM.statusBadge(l.status || 'Active') + '</td>' +
        '<td class="text-sm text-gray-600">' + dom + '</td>' +
        '<td><div class="flex gap-1">' +
          '<button class="btn btn-sm btn-outline" onclick="Panels.openListingViewer(\'' + E(l.id || l.listing_id) + '\', \'' + listingType.toLowerCase() + '\')" title="View"><i class="fas fa-eye"></i></button>' +
          '<button class="btn btn-sm btn-outline" onclick="Panels.editListing(\'' + E(l.id || l.listing_id) + '\', \'' + listingType.toLowerCase() + '\')" title="Edit"><i class="fas fa-edit"></i></button>' +
        '</div></td>' +
      '</tr>';
    });

    html += '</tbody></table></div>';
    c.innerHTML = html;
  }

  function openListingForm(type) {
    var url = type === 'rental' ? '/crm/RENTAL-FORM-REDESIGN.html' : '/crm/SALE-FORM-REDESIGN.html';
    window.open(url, '_blank');
  }

  function editListing(id, type) {
    var url = (type === 'rental' ? '/crm/RENTAL-FORM-REDESIGN.html' : '/crm/SALE-FORM-REDESIGN.html') + '?id=' + encodeURIComponent(id);
    window.open(url, '_blank');
  }

  function openListingViewer(id, type) {
    var url = (type === 'rental' ? '/crm/RENTAL-FORM-WITH-TOOLS.html' : '/crm/SALE-FORM-WITH-TOOLS.html') + '?id=' + encodeURIComponent(id);
    window.open(url, '_blank');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEALS & COMMISSIONS
  // ═══════════════════════════════════════════════════════════════════════════
  function deals(container) {
    container.innerHTML =
      '<div class="space-y-4">' +
        '<div class="flex flex-wrap items-center gap-3">' +
          '<div class="flex gap-2">' +
            '<button class="btn btn-sm btn-outline deal-filter active" style="background:#111827;color:white" data-filter="all" onclick="Panels.filterDeals(\'all\',this)">All</button>' +
            '<button class="btn btn-sm btn-outline deal-filter" data-filter="active" onclick="Panels.filterDeals(\'active\',this)">Active</button>' +
            '<button class="btn btn-sm btn-outline deal-filter" data-filter="closed" onclick="Panels.filterDeals(\'closed\',this)">Closed</button>' +
          '</div>' +
          '<div class="flex-1"></div>' +
          '<button class="btn btn-gold btn-sm" onclick="Panels.openDealForm(\'buyer\')"><i class="fas fa-plus"></i> Buyer Deal</button>' +
          '<button class="btn btn-primary btn-sm" onclick="Panels.openDealForm(\'tenant\')"><i class="fas fa-plus"></i> Tenant Deal</button>' +
        '</div>' +
        '<!-- Stats -->' +
        '<div id="dealStats"></div>' +
        '<!-- Deals List -->' +
        '<div id="dealsContainer"><div class="flex items-center justify-center h-32"><i class="fas fa-spinner fa-spin text-xl text-gold"></i></div></div>' +
      '</div>';

    loadDeals();
  }

  var _dealsCache = [];

  function loadDeals() {
    Promise.all([
      MallanAPI.deals.list({ limit: 100 }),
      MallanAPI._fetch('/api/crm/commissions/stats').catch(function () { return {}; })
    ]).then(function (results) {
      _dealsCache = results[0].deals || [];
      var stats = results[1] || {};

      // Render stats
      var statsEl = document.getElementById('dealStats');
      if (statsEl) {
        statsEl.innerHTML = '<div class="stat-grid">' +
          statCard('fa-handshake', '#3b82f6', '#EFF6FF', _dealsCache.length, 'Total Deals') +
          statCard('fa-dollar-sign', '#059669', '#ECFDF5', $(stats.total_revenue || 0), 'Total Revenue') +
          statCard('fa-percentage', '#f59e0b', '#FFFBEB', $(stats.total_commission || 0), 'Total Commission') +
          statCard('fa-clock', '#8b5cf6', '#F5F3FF', stats.pending_deals || 0, 'Pending') +
        '</div>';
      }

      renderDeals('all');
    }).catch(function () {
      document.getElementById('dealsContainer').innerHTML =
        '<div class="empty-state"><i class="fas fa-handshake"></i><p>Failed to load deals</p></div>';
    });
  }

  function filterDeals(filter, btn) {
    document.querySelectorAll('.deal-filter').forEach(function (b) { b.style.background = ''; b.style.color = ''; });
    if (btn) { btn.style.background = '#111827'; btn.style.color = 'white'; }
    renderDeals(filter);
  }

  function renderDeals(filter) {
    var c = document.getElementById('dealsContainer');
    if (!c) return;

    var filtered = _dealsCache;
    if (filter === 'active') filtered = _dealsCache.filter(function (d) { return d.status !== 'closed' && d.status !== 'cancelled'; });
    if (filter === 'closed') filtered = _dealsCache.filter(function (d) { return d.status === 'closed'; });

    if (filtered.length === 0) {
      c.innerHTML = '<div class="empty-state"><i class="fas fa-handshake"></i><p>No deals found</p></div>';
      return;
    }

    var html = '<div class="data-table"><table><thead><tr>' +
      '<th>Deal</th><th>Client</th><th>Amount</th><th>Commission</th><th>Status</th><th>Date</th>' +
    '</tr></thead><tbody>';

    filtered.forEach(function (d) {
      html += '<tr>' +
        '<td><p class="text-sm font-semibold">' + E(d.address || d.title || 'Deal #' + (d.id || '').substring(0, 8)) + '</p>' +
          '<p class="text-xs text-gray-500">' + E(d.deal_type || 'sale') + '</p></td>' +
        '<td class="text-sm">' + E(d.client_name || '-') + '</td>' +
        '<td class="font-bold">' + $(d.amount || d.price) + '</td>' +
        '<td class="text-sm text-green-600 font-semibold">' + $(d.commission) + '</td>' +
        '<td>' + CRM.statusBadge(d.status || 'active') + '</td>' +
        '<td class="text-xs text-gray-500">' + D(d.close_date || d.created_at) + '</td>' +
      '</tr>';
    });

    html += '</tbody></table></div>';
    c.innerHTML = html;
  }

  function openDealForm(type) {
    var url = type === 'tenant' ? '/crm/TENANT-DEAL-FORM.html' : '/crm/BUYER-DEAL-FORM.html';
    window.open(url, '_blank');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCUMENTS
  // ═══════════════════════════════════════════════════════════════════════════
  function documents(container) {
    container.innerHTML =
      '<div class="space-y-4">' +
        '<div class="flex items-center justify-between">' +
          '<div class="flex gap-2">' +
            '<button class="btn btn-sm btn-outline doc-filter active" style="background:#111827;color:white" onclick="Panels.filterDocs(\'all\',this)">All</button>' +
            '<button class="btn btn-sm btn-outline doc-filter" onclick="Panels.filterDocs(\'contract\',this)">Contracts</button>' +
            '<button class="btn btn-sm btn-outline doc-filter" onclick="Panels.filterDocs(\'disclosure\',this)">Disclosures</button>' +
            '<button class="btn btn-sm btn-outline doc-filter" onclick="Panels.filterDocs(\'agreement\',this)">Agreements</button>' +
          '</div>' +
          '<button class="btn btn-gold btn-sm" onclick="Panels.showUploadDocModal()"><i class="fas fa-upload"></i> Upload</button>' +
        '</div>' +
        '<div id="docsContainer"><div class="flex items-center justify-center h-32"><i class="fas fa-spinner fa-spin text-xl text-gold"></i></div></div>' +
      '</div>';

    MallanAPI._fetch('/api/crm/documents').then(function (data) {
      var docs = data.documents || [];
      renderDocs(docs, 'all');
    }).catch(function () {
      document.getElementById('docsContainer').innerHTML =
        '<div class="empty-state"><i class="fas fa-folder"></i><p>No documents yet</p></div>';
    });
  }

  function filterDocs(type, btn) {
    document.querySelectorAll('.doc-filter').forEach(function (b) { b.style.background = ''; b.style.color = ''; });
    if (btn) { btn.style.background = '#111827'; btn.style.color = 'white'; }
    // Re-render with filter
    // Simplified — just reload
    CRM.navigate('documents');
  }

  function showUploadDocModal() {
    CRM.openModal('Upload Document',
      '<form id="uploadDocForm" class="space-y-4">' +
        '<div class="form-group"><label class="form-label">Document Type</label>' +
          '<select class="form-input form-select" name="type">' +
            '<option value="contract">Contract</option>' +
            '<option value="disclosure">Disclosure</option>' +
            '<option value="agreement">Agreement</option>' +
            '<option value="other">Other</option>' +
          '</select></div>' +
        '<div class="form-group"><label class="form-label">Title</label><input class="form-input" name="title" required></div>' +
        '<div class="form-group"><label class="form-label">File</label>' +
          '<input type="file" name="file" class="form-input" accept=".pdf,.doc,.docx,.jpg,.png"></div>' +
        '<div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" name="notes" rows="2"></textarea></div>' +
      '</form>',
      {
        footer:
          '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="CRM.toast(\'Upload feature coming soon\', \'info\'); CRM.closeModal()"><i class="fas fa-upload"></i> Upload</button>'
      }
    );
  }

  function renderDocs(docs, filter) {
    var c = document.getElementById('docsContainer');
    if (!c) return;

    if (docs.length === 0) {
      c.innerHTML = '<div class="empty-state"><i class="fas fa-folder"></i><p>No documents yet</p></div>';
      return;
    }

    var html = '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">';
    docs.forEach(function (d) {
      var icon = d.type === 'contract' ? 'fa-file-contract' : d.type === 'disclosure' ? 'fa-file-shield' : 'fa-file-alt';
      html += '<div class="card p-4 hover:border-gold cursor-pointer">' +
        '<div class="flex items-start gap-3">' +
          '<div class="w-10 h-10 rounded-lg bg-gold-bg flex items-center justify-center flex-shrink-0"><i class="fas ' + icon + ' text-gold"></i></div>' +
          '<div class="min-w-0">' +
            '<p class="text-sm font-semibold text-gray-900 truncate">' + E(d.title || d.name) + '</p>' +
            '<p class="text-xs text-gray-500">' + E(d.type || 'document') + ' &middot; ' + D(d.created_at) + '</p>' +
          '</div>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';
    c.innerHTML = html;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENTS (Broker Only)
  // ═══════════════════════════════════════════════════════════════════════════
  function agents(container) {
    if (!CRM.isBroker) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-lock"></i><p>Access restricted to broker</p></div>';
      return;
    }

    container.innerHTML =
      '<div class="space-y-4">' +
        '<div class="flex items-center justify-between">' +
          '<p class="text-sm text-gray-500">Manage your agents, commission splits, and performance</p>' +
          '<button class="btn btn-gold" onclick="Panels.showAddAgentModal()"><i class="fas fa-user-plus"></i> Add Agent</button>' +
        '</div>' +
        '<div id="agentsContainer"><div class="flex items-center justify-center h-32"><i class="fas fa-spinner fa-spin text-xl text-gold"></i></div></div>' +
      '</div>';

    MallanAPI.agents.list().then(function (data) {
      var agentsList = data.agents || [];
      renderAgentsList(agentsList);
    }).catch(function () {
      document.getElementById('agentsContainer').innerHTML =
        '<div class="empty-state"><i class="fas fa-user-tie"></i><p>Failed to load agents</p></div>';
    });
  }

  function renderAgentsList(agentsList) {
    var c = document.getElementById('agentsContainer');
    if (!c) return;

    if (agentsList.length === 0) {
      c.innerHTML = '<div class="empty-state"><i class="fas fa-user-tie"></i><p>No agents yet</p></div>';
      return;
    }

    var html = '<div class="data-table"><table><thead><tr>' +
      '<th>Agent</th><th>License</th><th>Sale Split</th><th>Rental Split</th><th>Status</th><th>Actions</th>' +
    '</tr></thead><tbody>';

    agentsList.forEach(function (a) {
      html += '<tr>' +
        '<td><div class="flex items-center gap-3">' +
          '<div class="w-9 h-9 rounded-full bg-gold-bg flex items-center justify-center text-xs font-bold text-gold">' + initials(a.name) + '</div>' +
          '<div><p class="text-sm font-semibold">' + E(a.name) + '</p>' +
            '<p class="text-xs text-gray-500">' + E(a.email || '') + '</p></div>' +
        '</div></td>' +
        '<td class="text-sm text-gray-600">' + E(a.license_number || '-') + '</td>' +
        '<td class="text-sm font-semibold">' + ((a.sale_split || 0) * 100).toFixed(0) + '%</td>' +
        '<td class="text-sm font-semibold">' + ((a.rental_split || 0) * 100).toFixed(0) + '%</td>' +
        '<td>' + CRM.statusBadge(a.status || 'active') + '</td>' +
        '<td><div class="flex gap-1">' +
          '<button class="btn btn-sm btn-outline" onclick="Panels.editAgent(\'' + E(a.id) + '\')" title="Edit"><i class="fas fa-edit"></i></button>' +
          '<button class="btn btn-sm btn-danger" onclick="Panels.deactivateAgent(\'' + E(a.id) + '\', \'' + E(a.name) + '\')" title="Deactivate"><i class="fas fa-ban"></i></button>' +
        '</div></td>' +
      '</tr>';
    });

    html += '</tbody></table></div>';
    c.innerHTML = html;
  }

  function showAddAgentModal() {
    CRM.openModal('Add Agent',
      '<form id="addAgentForm" class="space-y-4">' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Full Name *</label><input class="form-input" name="name" required></div>' +
          '<div class="form-group"><label class="form-label">Email *</label><input class="form-input" type="email" name="email" required></div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Phone</label><input class="form-input" type="tel" name="phone"></div>' +
          '<div class="form-group"><label class="form-label">License Number *</label><input class="form-input" name="license_number" required></div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Sale Split (%)</label><input class="form-input" type="number" name="sale_split" min="0" max="100" value="60"></div>' +
          '<div class="form-group"><label class="form-label">Rental Split (%)</label><input class="form-input" type="number" name="rental_split" min="0" max="100" value="60"></div>' +
        '</div>' +
      '</form>',
      {
        footer:
          '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="Panels.submitAddAgent()"><i class="fas fa-user-plus"></i> Add Agent</button>'
      }
    );
  }

  function submitAddAgent() {
    var form = document.getElementById('addAgentForm');
    if (!form || !form.checkValidity()) { form.reportValidity(); return; }
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });
    // Convert splits from percentage to decimal
    if (data.sale_split) data.sale_split = Number(data.sale_split) / 100;
    if (data.rental_split) data.rental_split = Number(data.rental_split) / 100;

    MallanAPI.agents.create(data).then(function () {
      CRM.closeModal();
      CRM.toast('Agent added successfully', 'success');
      CRM.navigate('agents');
    }).catch(function (err) { CRM.toast('Failed: ' + err.message, 'error'); });
  }

  function editAgent(id) {
    CRM.toast('Loading agent...', 'info');
    MallanAPI._fetch('/api/crm/agents/' + encodeURIComponent(id)).then(function (data) {
      var a = data.agent || data;
      CRM.openModal('Edit Agent',
        '<form id="editAgentForm" class="space-y-4">' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
            '<div class="form-group"><label class="form-label">Name</label><input class="form-input" name="name" value="' + E(a.name || '') + '"></div>' +
            '<div class="form-group"><label class="form-label">Email</label><input class="form-input" name="email" value="' + E(a.email || '') + '"></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
            '<div class="form-group"><label class="form-label">Phone</label><input class="form-input" name="phone" value="' + E(a.phone || '') + '"></div>' +
            '<div class="form-group"><label class="form-label">License</label><input class="form-input" name="license_number" value="' + E(a.license_number || '') + '"></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
            '<div class="form-group"><label class="form-label">Sale Split (%)</label><input class="form-input" type="number" name="sale_split" min="0" max="100" value="' + ((a.sale_split || 0) * 100).toFixed(0) + '"></div>' +
            '<div class="form-group"><label class="form-label">Rental Split (%)</label><input class="form-input" type="number" name="rental_split" min="0" max="100" value="' + ((a.rental_split || 0) * 100).toFixed(0) + '"></div>' +
          '</div>' +
        '</form>',
        {
          footer:
            '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
            '<button class="btn btn-gold" onclick="Panels.submitEditAgent(\'' + E(id) + '\')">Save</button>'
        }
      );
    }).catch(function () { CRM.toast('Failed to load agent', 'error'); });
  }

  function submitEditAgent(id) {
    var form = document.getElementById('editAgentForm');
    if (!form) return;
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });
    if (data.sale_split) data.sale_split = Number(data.sale_split) / 100;
    if (data.rental_split) data.rental_split = Number(data.rental_split) / 100;

    MallanAPI.agents.update(id, data).then(function () {
      CRM.closeModal();
      CRM.toast('Agent updated', 'success');
      CRM.navigate('agents');
    }).catch(function (err) { CRM.toast('Failed: ' + err.message, 'error'); });
  }

  function deactivateAgent(id, name) {
    if (!confirm('Deactivate agent "' + name + '"? Their clients will need to be reassigned.')) return;
    MallanAPI.agents.deactivate(id).then(function () {
      CRM.toast('Agent deactivated', 'success');
      CRM.navigate('agents');
    }).catch(function (err) { CRM.toast('Failed: ' + err.message, 'error'); });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function initials(name) {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).map(function (w) { return w[0]; }).join('').toUpperCase().substring(0, 2);
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    dashboard: dashboard,
    clients: clients,
    pipeline: pipeline,
    tasks: tasks,
    listings: listings,
    deals: deals,
    documents: documents,
    agents: agents,

    // Actions exposed for onclick handlers
    showAddClientModal: showAddClientModal,
    submitAddClient: submitAddClient,
    filterTasks: filterTasks,
    showAddTaskModal: showAddTaskModal,
    submitAddTask: submitAddTask,
    toggleTask: toggleTask,
    deleteTask: deleteTask,
    completeTask: completeTask,
    moveStage: moveStage,
    confirmMoveStage: confirmMoveStage,
    filterListingType: filterListingType,
    openListingForm: openListingForm,
    editListing: editListing,
    openListingViewer: openListingViewer,
    filterDeals: filterDeals,
    openDealForm: openDealForm,
    filterDocs: filterDocs,
    showUploadDocModal: showUploadDocModal,
    showAddAgentModal: showAddAgentModal,
    submitAddAgent: submitAddAgent,
    editAgent: editAgent,
    submitEditAgent: submitEditAgent,
    deactivateAgent: deactivateAgent,
    loadTasks: loadTasks,
  };
})();
