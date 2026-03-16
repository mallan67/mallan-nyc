// ═══════════════════════════════════════════════════════════════════════════════
// CRM APP — Main controller
// Auth, sidebar (Broker Console + Operations + Settings + Workspaces),
// top bar (global search, quick actions, notifications, impersonation),
// modals, toasts, route registration
// ═══════════════════════════════════════════════════════════════════════════════
/* global MallanAPI, Store, Router, Permissions, Events, Alerts, Documents, Panels, Workspace, Portals, Utils, UI */

var CRM = (function () {
  'use strict';

  var E = Utils.esc;

  // ─── Init ────────────────────────────────────────────────────────────
  function init() {
    var origin = window.location.origin;
    if (origin.indexOf('mallan.nyc') === -1) {
      MallanAPI.configure({ baseUrl: 'https://mallan.nyc' });
    }

    window.addEventListener('mallan:auth:unauthorized', function () {
      window.location.href = '/crm/login.html';
    });

    MallanAPI.init().then(function (data) {
      if (!data.authenticated) {
        window.location.href = '/crm/login.html';
        return;
      }

      // Set session in store
      Store.setSession(data);

      // Client portal?
      if (Store.isClient()) {
        var role = data.portalRole || 'buyer';
        Portals.init(role);
        _hideLoading();
        return;
      }

      // Agent/Broker CRM
      _registerRoutes();
      Router.init();
      renderSidebar();
      renderTopBar();
      renderUserInfo();

      // Load alerts
      Alerts.load().then(function () { refreshAlerts(); });

      // Start router
      Router.start();
      _hideLoading();

    }).catch(function () {
      window.location.href = '/crm/login.html';
    });
  }

  function _hideLoading() {
    var ls = document.getElementById('loadingState');
    if (ls) ls.remove();
  }

  // ─── Route Registration ──────────────────────────────────────────────
  function _registerRoutes() {
    // A1. Broker Console
    Router.register('/broker/dashboard',           function () { Panels.brokerDashboard(); });
    Router.register('/broker/people/agents',       function () { Panels.agentRoster(); });
    Router.register('/broker/people/clients',      function () { Panels.clientAddressBook(); });
    Router.register('/broker/leads/distribution',  function () { Panels.leadDistribution(); });
    Router.register('/broker/leads/referrals',     function () { Panels.referralTracking(); });
    Router.register('/broker/finance/payouts',     function () { Panels.commissionPayouts(); });
    Router.register('/broker/finance/revenue',     function () { Panels.revenueOverview(); });
    Router.register('/broker/finance/1099',        function () { Panels.yearEnd1099(); });
    Router.register('/broker/listings/company',    function () { Panels.companyListings(); });
    Router.register('/broker/listings/compliance', function () { Panels.complianceDashboard(); });
    Router.register('/broker/listings/featured',   function () { Panels.featuredProperties(); });
    Router.register('/broker/documents',           function () { Panels.brokerDocuments(); });
    Router.register('/broker/system/audit',        function () { Panels.auditLog(); });
    Router.register('/broker/system/idx-activity', function () { Panels.idxActivity(); });
    Router.register('/broker/system/licensing',    function () { Panels.licensingTracker(); });
    Router.register('/broker/system/settings',     function () { Panels.systemSettings(); });

    // A2. Operations
    Router.register('/ops/dashboard',        function () { Panels.opsDashboard(); });
    Router.register('/ops/search',           function () { Panels.propertySearch(); });
    Router.register('/ops/listings',         function () { Panels.myListings(); });
    Router.register('/ops/clients',          function () { Panels.myClients(); });
    Router.register('/ops/pipeline',         function () { Panels.pipeline(); });
    Router.register('/ops/tasks',            function () { Panels.tasks(); });
    Router.register('/ops/communications',   function () { Panels.communications(); });
    Router.register('/ops/deals',            function () { Panels.dealsCommissions(); });
    Router.register('/ops/revenue',          function () { Panels.personalRevenue(); });
    Router.register('/ops/market',           function () { Panels.marketActivity(); });

    // A3. Settings
    Router.register('/settings/profile',       function () { Panels.profile(); });
    Router.register('/settings/notifications', function () { Panels.notificationSettings(); });
    Router.register('/settings/integrations',  function () { Panels.integrations(); });

    // A4. Client Workspace
    Router.register('/workspace/client/:id/overview',   function (p) { Workspace.openClient(p.id, 'overview'); });
    Router.register('/workspace/client/:id/listings',   function (p) { Workspace.openClient(p.id, 'listings'); });
    Router.register('/workspace/client/:id/activity',   function (p) { Workspace.openClient(p.id, 'activity'); });
    Router.register('/workspace/client/:id/pipeline',   function (p) { Workspace.openClient(p.id, 'pipeline'); });
    Router.register('/workspace/client/:id/market',     function (p) { Workspace.openClient(p.id, 'market'); });
    Router.register('/workspace/client/:id/financial',  function (p) { Workspace.openClient(p.id, 'financial'); });
    Router.register('/workspace/client/:id/showings',   function (p) { Workspace.openClient(p.id, 'showings'); });
    Router.register('/workspace/client/:id/documents',  function (p) { Workspace.openClient(p.id, 'documents'); });
    Router.register('/workspace/client/:id/agreements', function (p) { Workspace.openClient(p.id, 'agreements'); });
    Router.register('/workspace/client/:id/readiness',  function (p) { Workspace.openClient(p.id, 'readiness'); });

    // A5. Listing Workspace
    Router.register('/workspace/listing/:id/overview',   function (p) { Workspace.openListing(p.id, 'overview'); });
    Router.register('/workspace/listing/:id/media',      function (p) { Workspace.openListing(p.id, 'media'); });
    Router.register('/workspace/listing/:id/compliance', function (p) { Workspace.openListing(p.id, 'compliance'); });
    Router.register('/workspace/listing/:id/sent',       function (p) { Workspace.openListing(p.id, 'sent'); });
    Router.register('/workspace/listing/:id/inquiries',  function (p) { Workspace.openListing(p.id, 'inquiries'); });
    Router.register('/workspace/listing/:id/showings',   function (p) { Workspace.openListing(p.id, 'showings'); });
    Router.register('/workspace/listing/:id/history',    function (p) { Workspace.openListing(p.id, 'history'); });
    Router.register('/workspace/listing/:id/documents',  function (p) { Workspace.openListing(p.id, 'documents'); });
    Router.register('/workspace/listing/:id/health',     function (p) { Workspace.openListing(p.id, 'health'); });
    Router.register('/workspace/listing/:id/portal',     function (p) { Workspace.openListing(p.id, 'portal'); });
  }

  // ─── Sidebar ─────────────────────────────────────────────────────────
  function renderSidebar() {
    var nav = document.getElementById('sidebarNav');
    if (!nav) return;
    var html = '';

    // BROKER CONSOLE (Maya-only, hidden when impersonating)
    if (Permissions.canSeeBrokerConsole()) {
      html += _sidebarGroup('BROKER CONSOLE', 'broker', [
        { route: '/broker/dashboard', icon: 'fa-chart-line', label: 'Dashboard' },
        { heading: 'People' },
        { route: '/broker/people/agents', icon: 'fa-user-tie', label: 'Agent Roster' },
        { route: '/broker/people/clients', icon: 'fa-address-book', label: 'Client Address Book' },
        { heading: 'Leads & Referrals' },
        { route: '/broker/leads/distribution', icon: 'fa-random', label: 'Lead Distribution' },
        { route: '/broker/leads/referrals', icon: 'fa-exchange-alt', label: 'Referral Tracking' },
        { heading: 'Finance' },
        { route: '/broker/finance/payouts', icon: 'fa-dollar-sign', label: 'Commission Payouts' },
        { route: '/broker/finance/revenue', icon: 'fa-chart-bar', label: 'Revenue Overview' },
        { route: '/broker/finance/1099', icon: 'fa-file-invoice-dollar', label: '1099 Year-End' },
        { heading: 'Listings & Compliance' },
        { route: '/broker/listings/company', icon: 'fa-building', label: 'Company Listings' },
        { route: '/broker/listings/compliance', icon: 'fa-shield-alt', label: 'Compliance Dashboard' },
        { route: '/broker/listings/featured', icon: 'fa-star', label: 'Featured Properties' },
        { heading: 'Documents' },
        { route: '/broker/documents', icon: 'fa-folder', label: 'Company Vault' },
        { heading: 'System' },
        { route: '/broker/system/audit', icon: 'fa-clipboard-list', label: 'Audit Log' },
        { route: '/broker/system/idx-activity', icon: 'fa-database', label: 'IDX/RLS Activity' },
        { route: '/broker/system/licensing', icon: 'fa-id-card', label: 'License/CE/E&O' },
        { route: '/broker/system/settings', icon: 'fa-cog', label: 'System Settings' },
      ]);
    }

    // OPERATIONS (agent view; broker sees expanded/all)
    html += _sidebarGroup('OPERATIONS', 'ops', [
      { route: '/ops/dashboard', icon: 'fa-tachometer-alt', label: 'Dashboard' },
      { route: '/ops/search', icon: 'fa-search', label: 'Property Search' },
      { route: '/ops/listings', icon: 'fa-building', label: 'My Listings' },
      { route: '/ops/clients', icon: 'fa-users', label: 'My Clients' },
      { route: '/ops/pipeline', icon: 'fa-stream', label: 'Pipeline' },
      { route: '/ops/tasks', icon: 'fa-tasks', label: 'Tasks & Follow-ups' },
      { route: '/ops/communications', icon: 'fa-envelope', label: 'Communications' },
      { route: '/ops/deals', icon: 'fa-handshake', label: 'Deals & Commissions' },
      { route: '/ops/revenue', icon: 'fa-chart-pie', label: 'Revenue' },
      { route: '/ops/market', icon: 'fa-chart-area', label: 'Market Activity' },
    ]);

    // SETTINGS
    html += _sidebarGroup('SETTINGS', 'settings', [
      { route: '/settings/profile', icon: 'fa-user', label: 'My Profile' },
      { route: '/settings/notifications', icon: 'fa-bell', label: 'Notifications' },
      { route: '/settings/integrations', icon: 'fa-plug', label: 'Integrations' },
    ]);

    nav.innerHTML = html;

    // Restore expanded state
    Object.keys(Store.ui.sidebarExpandedGroups).forEach(function (group) {
      var body = document.getElementById('sidebarGroup_' + group);
      if (body) body.style.display = Store.ui.sidebarExpandedGroups[group] ? 'block' : 'none';
    });
  }

  function _sidebarGroup(title, group, items) {
    var expanded = Store.ui.sidebarExpandedGroups[group] !== false;
    var html = '<div class="sidebar-section">' +
      '<button class="sidebar-label w-full flex items-center justify-between cursor-pointer hover:text-gray-400" onclick="CRM.toggleGroup(\'' + group + '\')">' +
        '<span>' + E(title) + '</span>' +
        '<i class="fas fa-chevron-down text-[8px] transition-transform' + (expanded ? '' : ' -rotate-90') + '" id="sidebarChevron_' + group + '"></i>' +
      '</button>' +
      '<div id="sidebarGroup_' + group + '" style="display:' + (expanded ? 'block' : 'none') + '">';

    items.forEach(function (item) {
      if (item.heading) {
        html += '<div class="px-3 pt-3 pb-1 text-[9px] font-bold text-gray-600 uppercase tracking-wider">' + E(item.heading) + '</div>';
      } else {
        var isActive = Router.isActive(item.route);
        html += '<button class="sidebar-item' + (isActive ? ' active' : '') + '" data-route="' + item.route + '" onclick="Router.navigate(\'' + item.route + '\')">' +
          '<i class="fas ' + item.icon + ' w-5 text-center text-xs"></i>' +
          '<span>' + E(item.label) + '</span>' +
        '</button>';
      }
    });

    html += '</div></div>';
    return html;
  }

  function toggleGroup(group) {
    Store.toggleSidebarGroup(group);
    var body = document.getElementById('sidebarGroup_' + group);
    var chevron = document.getElementById('sidebarChevron_' + group);
    if (body) body.style.display = Store.ui.sidebarExpandedGroups[group] ? 'block' : 'none';
    if (chevron) chevron.classList.toggle('-rotate-90', !Store.ui.sidebarExpandedGroups[group]);
  }

  function updateSidebarActive() {
    document.querySelectorAll('.sidebar-item[data-route]').forEach(function (el) {
      el.classList.toggle('active', Router.isActive(el.getAttribute('data-route')));
    });
  }

  // Listen for route changes to update sidebar
  Store.on('route:changed', function () { updateSidebarActive(); });

  // ─── Top Bar ─────────────────────────────────────────────────────────
  function renderTopBar() {
    var topbar = document.getElementById('topbar');
    if (!topbar) return;

    topbar.innerHTML =
      '<div class="flex items-center gap-3">' +
        '<button id="menuBtn" class="lg:hidden p-2 -ml-2 text-gray-500 hover:text-gray-700" onclick="CRM.toggleSidebar()">' +
          '<i class="fas fa-bars text-lg"></i>' +
        '</button>' +
        '<h1 id="panelTitle" class="text-lg font-bold text-gray-900 tracking-tight"></h1>' +
        '<span id="panelBadge" class="hidden px-2 py-0.5 bg-gold-bg text-gold-dark text-xs font-bold rounded-full"></span>' +
      '</div>' +
      '<div class="flex items-center gap-2">' +
        // Global search
        '<div class="relative hidden sm:block">' +
          '<i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>' +
          '<input id="globalSearch" type="text" placeholder="Search clients, listings..." ' +
            'class="pl-9 pr-4 py-2 w-56 text-sm bg-gray-100 border-0 rounded-lg focus:bg-white focus:ring-2 focus:ring-gold/30 focus:outline-none transition-all">' +
        '</div>' +
        // Quick actions
        '<div class="relative">' +
          '<button onclick="CRM.toggleQuickActions()" class="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100" title="Quick Actions">' +
            '<i class="fas fa-bolt"></i>' +
          '</button>' +
          '<div id="quickActionsMenu" class="hidden absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-xl border border-gray-200 py-1 z-50">' +
            '<button class="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3" onclick="CRM.quickNewClient()">' +
              '<i class="fas fa-user-plus text-xs text-gray-400 w-4"></i> New Client</button>' +
            '<button class="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3" onclick="CRM.quickNewListing()">' +
              '<i class="fas fa-home text-xs text-gray-400 w-4"></i> New Listing</button>' +
            '<button class="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3" onclick="CRM.quickSendListing()">' +
              '<i class="fas fa-paper-plane text-xs text-gray-400 w-4"></i> Quick Send Listing</button>' +
            '<button class="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3" onclick="CRM.quickTask()">' +
              '<i class="fas fa-tasks text-xs text-gray-400 w-4"></i> Quick Task</button>' +
            '<button class="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3" onclick="CRM.quickNote()">' +
              '<i class="fas fa-sticky-note text-xs text-gray-400 w-4"></i> Quick Note</button>' +
          '</div>' +
        '</div>' +
        // Notifications bell
        '<button onclick="CRM.showNotifications()" class="relative p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">' +
          '<i class="fas fa-bell"></i>' +
          '<span id="notifBadge" class="hidden absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center"></span>' +
        '</button>' +
        // Impersonation (broker only)
        (Permissions.isBroker() ?
          '<div id="impersonateWidget" class="flex items-center gap-2">' +
            '<button onclick="CRM.showImpersonationPicker()" class="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100" title="Impersonate Agent">' +
              '<i class="fas fa-user-secret"></i>' +
            '</button>' +
          '</div>' : '') +
      '</div>';

    // Global search handler
    var searchInput = document.getElementById('globalSearch');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce(function () {
        var q = searchInput.value.trim();
        if (q.length >= 2) {
          _globalSearch(q);
        }
      }, 300));

      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { searchInput.value = ''; _closeSearchResults(); }
      });
    }

    // Close quick actions on outside click
    document.addEventListener('click', function (e) {
      var menu = document.getElementById('quickActionsMenu');
      if (menu && !menu.parentElement.contains(e.target)) menu.classList.add('hidden');
    });
  }

  function toggleQuickActions() {
    var menu = document.getElementById('quickActionsMenu');
    if (menu) menu.classList.toggle('hidden');
  }

  function _globalSearch(q) {
    // Navigate to clients panel with search
    Router.navigate('/ops/clients');
    setTimeout(function () {
      Store.emit('global:search', q);
    }, 100);
  }

  function _closeSearchResults() {
    // Close any search dropdown
  }

  // ─── User Info ───────────────────────────────────────────────────────
  function renderUserInfo() {
    var container = document.getElementById('sidebarUser');
    if (!container) return;

    var user = Store.session.currentUser;
    if (!user) return;

    var name = user.name || user.first_name || user.email || 'User';
    var initials = Utils.initials(name);
    var role = Store.isBroker() ? 'Principal Broker' : 'Agent';

    var impersonating = Store.isImpersonating();
    if (impersonating) {
      var imp = Store.session.impersonatedAgent;
      name = imp ? (imp.name || imp.email) : 'Agent';
      initials = Utils.initials(name);
      role = 'Impersonating';
    }

    container.innerHTML =
      '<div class="sidebar-user-avatar' + (impersonating ? '" style="background:#7C3AED;color:white"' : '"') + '>' + E(initials) + '</div>' +
      '<div class="sidebar-user-info">' +
        '<div class="sidebar-user-name">' + E(name) + '</div>' +
        '<div class="sidebar-user-role">' + E(role) + '</div>' +
      '</div>';
  }

  // ─── Impersonation ───────────────────────────────────────────────────
  function showImpersonationPicker() {
    if (Store.isImpersonating()) {
      // Stop impersonation
      Events.log('impersonation_ended', 'agent', Store.session.impersonatedAgentId);
      Store.stopImpersonation();
      renderSidebar();
      renderUserInfo();
      _updateImpersonationBar();
      Router.navigate('/broker/dashboard');
      toast('Impersonation ended', 'info');
      return;
    }

    openModal('Impersonate Agent',
      '<div id="impAgentList">' + UI.loading() + '</div>'
    );

    MallanAPI.agents.list().then(function (data) {
      var agents = data.agents || [];
      var body = document.getElementById('impAgentList');
      if (!body) return;

      if (agents.length === 0) {
        body.innerHTML = UI.emptyState('fa-users', 'No agents found');
        return;
      }

      var html = '<div class="space-y-2">';
      agents.forEach(function (a) {
        html += '<button class="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-gold hover:bg-gold-bg transition-all flex items-center gap-3" ' +
          'onclick="CRM.doImpersonate(\'' + E(a.id) + '\')">' +
          UI.avatar(a.name || a.email, 36) +
          '<div><p class="text-sm font-semibold">' + E(a.name || a.email) + '</p>' +
            '<p class="text-xs text-gray-500">' + E(a.email || '') + '</p></div>' +
        '</button>';
      });
      html += '</div>';
      body.innerHTML = html;
    }).catch(function () {
      var body = document.getElementById('impAgentList');
      if (body) body.innerHTML = UI.emptyState('fa-exclamation-circle', 'Could not load agents');
    });
  }

  function doImpersonate(agentId) {
    closeModal();
    MallanAPI.agents.list().then(function (data) {
      var agent = (data.agents || []).find(function (a) { return a.id === agentId; });
      if (!agent) { toast('Agent not found', 'error'); return; }

      Store.startImpersonation(agent);
      Events.log('impersonation_started', 'agent', agentId, { agentName: agent.name });
      renderSidebar();
      renderUserInfo();
      _updateImpersonationBar();
      Router.navigate('/ops/dashboard');
      toast('Now viewing as ' + (agent.name || agent.email), 'info');
    });
  }

  function _updateImpersonationBar() {
    var existing = document.getElementById('impersonationBar');
    if (existing) existing.remove();

    if (!Store.isImpersonating()) return;

    var bar = document.createElement('div');
    bar.id = 'impersonationBar';
    bar.className = 'flex items-center justify-between px-4 py-2 text-sm font-medium text-white';
    bar.style.cssText = 'background:#7C3AED;flex-shrink:0;';
    var imp = Store.session.impersonatedAgent;
    bar.innerHTML = '<span><i class="fas fa-user-secret mr-2"></i>Viewing as: ' + E(imp ? imp.name : 'Agent') + '</span>' +
      '<button class="px-3 py-1 bg-white/20 rounded-lg hover:bg-white/30 text-xs font-bold" onclick="CRM.showImpersonationPicker()">Exit</button>';

    var main = document.getElementById('main');
    if (main) main.insertBefore(bar, main.firstChild);
  }

  // ─── Panel Title ─────────────────────────────────────────────────────
  function setPanelTitle(title, badge) {
    var el = document.getElementById('panelTitle');
    if (el) el.textContent = title;
    var badgeEl = document.getElementById('panelBadge');
    if (badgeEl) {
      if (badge) {
        badgeEl.textContent = badge;
        badgeEl.classList.remove('hidden');
      } else {
        badgeEl.classList.add('hidden');
      }
    }
  }

  function getContent() {
    return document.getElementById('content');
  }

  // ─── Toast ───────────────────────────────────────────────────────────
  function toast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toasts');
    if (!container) return;

    var icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
    var colors = { success: '#059669', error: '#DC2626', info: '#2563EB', warning: '#F59E0B' };

    var el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.innerHTML = '<i class="fas ' + (icons[type] || icons.info) + '" style="color:' + (colors[type] || colors.info) + ';font-size:15px;"></i>' +
      '<span>' + E(message) + '</span>';

    container.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      el.style.transition = 'all 0.3s';
      setTimeout(function () { el.remove(); }, 300);
    }, 4000);
  }

  // ─── Modal ───────────────────────────────────────────────────────────
  function openModal(title, bodyHtml, opts) {
    opts = opts || {};
    var overlay = document.getElementById('modalOverlay');
    var container = document.getElementById('modalContainer');
    var titleEl = document.getElementById('modalTitle');
    var bodyEl = document.getElementById('modalBody');
    var footerEl = document.getElementById('modalFooter');

    if (!overlay || !container) return;

    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHtml;
    container.className = 'modal-container' + (opts.size === 'lg' ? ' modal-lg' : '') + (opts.size === 'xl' ? ' modal-xl' : '');

    if (opts.footer) {
      footerEl.innerHTML = opts.footer;
      footerEl.classList.remove('hidden');
    } else {
      footerEl.classList.add('hidden');
    }

    overlay.classList.remove('hidden');
  }

  function closeModal(event) {
    if (event && event.target !== event.currentTarget) return;
    var overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  // ─── Notifications ───────────────────────────────────────────────────
  function showNotifications() {
    var active = Alerts.getActive();
    if (active.length === 0) {
      openModal('Notifications', UI.emptyState('fa-bell', 'No new notifications'));
      return;
    }

    var html = '<div class="space-y-3">';
    active.forEach(function (a) { html += UI.alertItem(a); });
    html += '</div>';
    openModal('Notifications (' + active.length + ')', html);
  }

  function refreshAlerts() {
    var badge = document.getElementById('notifBadge');
    if (!badge) return;
    var count = Alerts.getUnreadCount();
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // ─── Quick Actions ───────────────────────────────────────────────────
  function quickNewClient() {
    toggleQuickActions();
    openModal('New Client',
      '<form id="quickClientForm" class="space-y-4">' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">First Name *</label><input class="form-input" name="first_name" required></div>' +
          '<div class="form-group"><label class="form-label">Last Name *</label><input class="form-input" name="last_name" required></div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Email</label><input class="form-input" type="email" name="email"></div>' +
          '<div class="form-group"><label class="form-label">Phone</label><input class="form-input" type="tel" name="phone"></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Client Type *</label>' +
          '<select class="form-input form-select" name="type" required>' +
            '<option value="buyer">Buyer</option><option value="seller">Seller</option>' +
            '<option value="renter">Renter</option><option value="landlord">Landlord</option>' +
          '</select></div>' +
        '<div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" name="notes" rows="2"></textarea></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="CRM.submitQuickClient()"><i class="fas fa-save"></i> Create</button>',
      }
    );
  }

  function submitQuickClient() {
    var form = document.getElementById('quickClientForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });
    data.name = (data.first_name || '') + ' ' + (data.last_name || '');

    MallanAPI.clients.create(data).then(function (result) {
      closeModal();
      Events.log('client_created', 'client', result.client ? result.client.id : null, { name: data.name, type: data.type });
      toast('Client created', 'success');
      Router.navigate('/ops/clients');
    }).catch(function (err) {
      toast('Error: ' + (err.message || 'Could not create client'), 'error');
    });
  }

  function quickNewListing() {
    toggleQuickActions();
    openModal('New Listing',
      '<div class="space-y-4">' +
        '<p class="text-sm text-gray-600">Choose listing type:</p>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
          '<button class="p-4 border rounded-xl text-left hover:border-gold hover:bg-gold-bg transition-all" onclick="window.open(\'/crm/sale-listing\',\'_blank\');CRM.closeModal()">' +
            '<div class="text-lg mb-1"><i class="fas fa-home text-gold"></i></div>' +
            '<p class="text-sm font-bold">Sale Listing</p>' +
            '<p class="text-xs text-gray-500">Create exclusive sale for RLS</p>' +
          '</button>' +
          '<button class="p-4 border rounded-xl text-left hover:border-gold hover:bg-gold-bg transition-all" onclick="window.open(\'/crm/rental-listing\',\'_blank\');CRM.closeModal()">' +
            '<div class="text-lg mb-1"><i class="fas fa-key text-gold"></i></div>' +
            '<p class="text-sm font-bold">Rental Listing</p>' +
            '<p class="text-xs text-gray-500">Create exclusive rental for RLS</p>' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function quickSendListing() {
    toggleQuickActions();
    openModal('Quick Send Listing',
      '<div class="space-y-4">' +
        '<div class="form-group"><label class="form-label">Search Listing</label>' +
          '<input class="form-input" id="qsSendSearch" placeholder="Address or MLS ID..." oninput="CRM._searchListingsForSend(this.value)"></div>' +
        '<div id="qsSendResults"></div>' +
        '<div class="form-group"><label class="form-label">Select Client(s)</label>' +
          '<div id="qsSendClients">' + UI.loading() + '</div>' +
        '</div>' +
      '</form>',
      { size: 'lg' }
    );

    // Load clients
    MallanAPI.clients.list({ limit: 100 }).then(function (data) {
      var clients = data.clients || [];
      var el = document.getElementById('qsSendClients');
      if (!el) return;
      var html = '<div class="max-h-40 overflow-y-auto space-y-1">';
      clients.forEach(function (c) {
        html += '<label class="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer">' +
          '<input type="checkbox" name="client" value="' + E(c.id) + '" class="qs-client-cb">' +
          '<span class="text-sm">' + E(c.name || c.email) + '</span>' +
          UI.roleBadge(c.type || c.client_type) +
        '</label>';
      });
      html += '</div>';
      el.innerHTML = html;
    }).catch(function () {
      var el = document.getElementById('qsSendClients');
      if (el) el.innerHTML = '<p class="text-sm text-gray-500">Could not load clients</p>';
    });
  }

  var _selectedSendListing = null;
  function _searchListingsForSend(q) {
    if (q.length < 2) return;
    var el = document.getElementById('qsSendResults');
    if (!el) return;

    MallanAPI.listings.list({ limit: 10 }).then(function (data) {
      var listings = (data.listings || []).filter(function (l) {
        var addr = (l.address || l.UnparsedAddress || '').toLowerCase();
        return addr.indexOf(q.toLowerCase()) !== -1;
      });
      var html = '<div class="space-y-1 max-h-40 overflow-y-auto">';
      listings.forEach(function (l) {
        var addr = l.address || l.UnparsedAddress || 'No address';
        html += '<button class="w-full text-left p-2 rounded hover:bg-gold-bg text-sm flex justify-between" onclick="CRM._selectSendListing(\'' + E(l.id || l.listing_id) + '\',\'' + E(addr) + '\')">' +
          '<span>' + E(addr) + '</span><span class="text-gray-400">' + Utils.formatMoney(l.ListPrice || l.price) + '</span></button>';
      });
      html += '</div>';
      el.innerHTML = listings.length ? html : '<p class="text-xs text-gray-400">No matches</p>';
    });
  }

  function _selectSendListing(id, addr) {
    _selectedSendListing = id;
    var el = document.getElementById('qsSendResults');
    if (el) el.innerHTML = '<div class="p-2 bg-gold-bg rounded-lg text-sm font-medium"><i class="fas fa-check text-gold mr-2"></i>' + E(addr) + '</div>';

    // Add send button to modal footer
    var footer = document.getElementById('modalFooter');
    if (footer) {
      footer.innerHTML = '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
        '<button class="btn btn-gold" onclick="CRM._doQuickSend()"><i class="fas fa-paper-plane"></i> Send</button>';
      footer.classList.remove('hidden');
    }
  }

  function _doQuickSend() {
    if (!_selectedSendListing) { toast('Select a listing first', 'warning'); return; }
    var checkboxes = document.querySelectorAll('.qs-client-cb:checked');
    if (checkboxes.length === 0) { toast('Select at least one client', 'warning'); return; }

    var clientIds = [];
    checkboxes.forEach(function (cb) { clientIds.push(cb.value); });

    Events.log('quick_send_executed', 'listing', _selectedSendListing, { clientIds: clientIds });
    clientIds.forEach(function (cid) {
      Events.log('listing_sent', 'client', cid, { listingId: _selectedSendListing, sentVia: 'quick_send' });
    });

    closeModal();
    toast('Listing sent to ' + clientIds.length + ' client' + (clientIds.length > 1 ? 's' : ''), 'success');
    _selectedSendListing = null;
  }

  function quickTask() {
    toggleQuickActions();
    openModal('Quick Task',
      '<form id="quickTaskForm" class="space-y-4">' +
        '<div class="form-group"><label class="form-label">Title *</label><input class="form-input" name="title" required></div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          '<div class="form-group"><label class="form-label">Due Date</label><input class="form-input" type="date" name="due_date"></div>' +
          '<div class="form-group"><label class="form-label">Priority</label>' +
            '<select class="form-input form-select" name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" name="notes" rows="2"></textarea></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="CRM.submitQuickTask()"><i class="fas fa-plus"></i> Create Task</button>',
      }
    );
  }

  function submitQuickTask() {
    var form = document.getElementById('quickTaskForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var data = {};
    new FormData(form).forEach(function (v, k) { if (v) data[k] = v; });

    MallanAPI._fetch('/api/crm/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(function () {
      closeModal();
      toast('Task created', 'success');
    }).catch(function () {
      closeModal();
      toast('Task created locally', 'info');
    });
  }

  function quickNote() {
    toggleQuickActions();
    openModal('Quick Note',
      '<form id="quickNoteForm" class="space-y-4">' +
        '<div class="form-group"><label class="form-label">Client (optional)</label>' +
          '<input class="form-input" id="qnClientSearch" placeholder="Search client name...">' +
          '<input type="hidden" name="client_id" id="qnClientId">' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Note *</label>' +
          '<textarea class="form-input" name="content" rows="4" required placeholder="Enter note..."></textarea></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="CRM.submitQuickNote()"><i class="fas fa-save"></i> Save Note</button>',
      }
    );
  }

  function submitQuickNote() {
    var form = document.getElementById('quickNoteForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var clientId = document.getElementById('qnClientId') ? document.getElementById('qnClientId').value : null;
    var content = form.querySelector('[name="content"]').value;

    if (clientId) {
      Events.log('note_added', 'client', clientId, { content: content });
    } else {
      Events.log('note_added', 'general', null, { content: content });
    }

    closeModal();
    toast('Note saved', 'success');
  }

  // ─── Sidebar Toggle (Mobile) ────────────────────────────────────────
  function toggleSidebar() {
    var sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('open');
  }

  function closeSidebar() {
    var sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('open');
  }

  // ─── Logout ──────────────────────────────────────────────────────────
  function logout() {
    MallanAPI.auth.logout().finally(function () {
      window.location.href = '/crm/login.html';
    });
  }

  // ─── Public API ──────────────────────────────────────────────────────
  return {
    init: init,
    toggleSidebar: toggleSidebar,
    closeSidebar: closeSidebar,
    toggleGroup: toggleGroup,
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    showNotifications: showNotifications,
    refreshAlerts: refreshAlerts,
    logout: logout,
    setPanelTitle: setPanelTitle,
    getContent: getContent,

    // Quick actions
    toggleQuickActions: toggleQuickActions,
    quickNewClient: quickNewClient,
    submitQuickClient: submitQuickClient,
    quickNewListing: quickNewListing,
    quickSendListing: quickSendListing,
    _searchListingsForSend: _searchListingsForSend,
    _selectSendListing: _selectSendListing,
    _doQuickSend: _doQuickSend,
    quickTask: quickTask,
    submitQuickTask: submitQuickTask,
    quickNote: quickNote,
    submitQuickNote: submitQuickNote,

    // Impersonation
    showImpersonationPicker: showImpersonationPicker,
    doImpersonate: doImpersonate,

    // Legacy compat
    esc: Utils.esc,
    formatMoney: Utils.formatMoney,
    formatDate: Utils.formatDate,
    formatTimeAgo: Utils.formatTimeAgo,
    photoUrl: Utils.photoUrl,
    roleBadge: function (r) { return UI.roleBadge(r); },
    statusBadge: function (s) { return UI.statusBadge(s); },
    stageBadge: function (s) { return UI.stageBadge(s); },

    // State getters
    get ctx() { return MallanAPI.getContext(); },
    get isBroker() { return Store.isBroker(); },
    get isAgent() { return Store.isAgent(); },
    get isClient() { return Store.isClient(); },
    get user() { return Store.session.currentUser; },
  };
})();

// ── Boot ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', CRM.init);
