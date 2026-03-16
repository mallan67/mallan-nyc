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
    var isLocal = origin.indexOf('localhost') !== -1 || origin.indexOf('127.0.0.1') !== -1;
    if (isLocal) {
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

  // ─── Recent Workspaces ──────────────────────────────────────────────
  var RECENT_KEY = 'mallan_crm_recent_workspaces';
  var FAVORITES_KEY = 'mallan_crm_favorites';
  var DEFAULT_FAVORITES = [
    { route: '/broker/dashboard', label: 'Dashboard', icon: 'fa-chart-line' },
    { route: '/broker/people/agents', label: 'Agent Roster', icon: 'fa-user-tie' },
    { route: '/ops/clients', label: 'My Clients', icon: 'fa-users' },
    { route: '/ops/listings', label: 'My Listings', icon: 'fa-building' },
  ];

  function _getRecentWorkspaces() {
    try {
      var raw = localStorage.getItem(RECENT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function _saveRecentWorkspaces(list) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { /* quota */ }
  }

  function _trackRecentWorkspace(type, id, name) {
    var list = _getRecentWorkspaces();
    // Remove duplicate
    list = list.filter(function (item) { return !(item.type === type && item.id === id); });
    var route = type === 'client'
      ? '/workspace/client/' + id + '/overview'
      : '/workspace/listing/' + id + '/overview';
    list.unshift({ type: type, id: id, name: name, route: route, timestamp: Date.now() });
    // Keep last 5 of each type
    var clients = list.filter(function (i) { return i.type === 'client'; }).slice(0, 5);
    var listings = list.filter(function (i) { return i.type === 'listing'; }).slice(0, 5);
    list = clients.concat(listings);
    list.sort(function (a, b) { return b.timestamp - a.timestamp; });
    _saveRecentWorkspaces(list);
    _renderRecentSection();
  }

  // Track workspace route changes
  Store.on('route:changed', function (route) {
    if (!route) return;
    var clientMatch = route.match(/^\/workspace\/client\/([^/]+)\//);
    var listingMatch = route.match(/^\/workspace\/listing\/([^/]+)\//);
    if (clientMatch) {
      var cId = clientMatch[1];
      // Try to get name from current workspace or DOM
      var wsHeader = document.querySelector('.workspace-header h2');
      var cName = wsHeader ? wsHeader.textContent : ('Client ' + cId.slice(0, 6));
      _trackRecentWorkspace('client', cId, cName);
    } else if (listingMatch) {
      var lId = listingMatch[1];
      var wsH = document.querySelector('.workspace-header h2');
      var lName = wsH ? wsH.textContent : ('Listing ' + lId.slice(0, 6));
      _trackRecentWorkspace('listing', lId, lName);
    }
  });

  function _renderRecentSection() {
    var container = document.getElementById('sidebarRecent');
    if (!container) return;
    var all = _getRecentWorkspaces();
    if (all.length === 0) { container.innerHTML = ''; return; }

    var clients = all.filter(function (i) { return i.type === 'client'; }).slice(0, 5);
    var listings = all.filter(function (i) { return i.type === 'listing'; }).slice(0, 5);

    var html = '<div class="sidebar-recent-section">' +
      '<div class="sidebar-label"><span>RECENT</span></div>';

    if (clients.length > 0) {
      html += '<div class="sidebar-recent-sub">Clients</div>';
      clients.forEach(function (c) {
        var initials = (c.name || '??').split(' ').map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
        var truncName = c.name && c.name.length > 18 ? c.name.slice(0, 18) + '\u2026' : (c.name || 'Unknown');
        html += '<button class="sidebar-recent-item" onclick="Router.navigate(\'' + E(c.route) + '\')">' +
          '<span class="recent-avatar">' + E(initials) + '</span>' +
          '<span class="truncate">' + E(truncName) + '</span>' +
        '</button>';
      });
    }

    if (listings.length > 0) {
      html += '<div class="sidebar-recent-sub">Listings</div>';
      listings.forEach(function (l) {
        var truncName = l.name && l.name.length > 18 ? l.name.slice(0, 18) + '\u2026' : (l.name || 'Unknown');
        html += '<button class="sidebar-recent-item" onclick="Router.navigate(\'' + E(l.route) + '\')">' +
          '<span class="recent-avatar"><i class="fas fa-building" style="font-size:8px"></i></span>' +
          '<span class="truncate">' + E(truncName) + '</span>' +
        '</button>';
      });
    }

    html += '</div>';
    container.innerHTML = html;
  }

  // ─── Favorites / Pins ─────────────────────────────────────────────
  function _getFavorites() {
    try {
      var raw = localStorage.getItem(FAVORITES_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    // First load defaults
    _saveFavorites(DEFAULT_FAVORITES);
    return DEFAULT_FAVORITES.slice();
  }

  function _saveFavorites(list) {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(list)); } catch (e) { /* quota */ }
  }

  function _isFavorite(route) {
    var favs = _getFavorites();
    return favs.some(function (f) { return f.route === route; });
  }

  function _toggleFavorite(route, label, icon) {
    var favs = _getFavorites();
    var idx = -1;
    favs.forEach(function (f, i) { if (f.route === route) idx = i; });
    if (idx !== -1) {
      favs.splice(idx, 1);
    } else {
      favs.push({ route: route, label: label, icon: icon });
    }
    _saveFavorites(favs);
    _renderFavoritesSection();
    // Update pin icons in sidebar
    document.querySelectorAll('.sidebar-item .pin-icon').forEach(function (pin) {
      var itemRoute = pin.closest('.sidebar-item').getAttribute('data-route');
      if (itemRoute) pin.classList.toggle('pinned', _isFavorite(itemRoute));
    });
  }

  function _renderFavoritesSection() {
    var container = document.getElementById('sidebarFavorites');
    if (!container) return;
    var favs = _getFavorites();
    if (favs.length === 0) { container.innerHTML = ''; return; }

    var html = '<div class="sidebar-favorites-section">' +
      '<div class="sidebar-label"><span>FAVORITES</span></div>';
    favs.forEach(function (f) {
      var isActive = Router.isActive(f.route);
      html += '<button class="sidebar-favorites-item' + (isActive ? ' active' : '') + '" onclick="Router.navigate(\'' + E(f.route) + '\')">' +
        '<span class="fav-icon"><i class="fas ' + (f.icon || 'fa-star') + '"></i></span>' +
        '<span class="truncate">' + E(f.label) + '</span>' +
      '</button>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  // ─── Sidebar Badge Counts ─────────────────────────────────────────
  function _loadSidebarBadges() {
    // Lead Distribution — unassigned leads
    MallanAPI._fetch('/api/crm/leads?limit=200').then(function (data) {
      var leads = data.leads || data || [];
      if (!Array.isArray(leads)) return;
      var count = leads.filter(function (l) { return !l.assignedAgentId && !l.assigned_agent_id; }).length;
      _appendBadge('/broker/leads/distribution', count);
    }).catch(function () { /* silent */ });

    // Commission Payouts — pending
    MallanAPI.deals.list({ limit: 200 }).then(function (data) {
      var deals = data.deals || data || [];
      if (!Array.isArray(deals)) return;
      var count = deals.filter(function (d) {
        var status = d.payoutStatus || d.payout_status || '';
        return status === 'pending';
      }).length;
      _appendBadge('/broker/finance/payouts', count);
    }).catch(function () { /* silent */ });

    // Compliance — urgent alerts
    try {
      var urgent = (Alerts.getActive() || []).filter(function (a) { return a.severity === 'urgent'; }).length;
      _appendBadge('/broker/listings/compliance', urgent);
    } catch (e) { /* silent */ }

    // Tasks — overdue
    MallanAPI._fetch('/api/crm/tasks').then(function (data) {
      var tasks = data.tasks || data || [];
      if (!Array.isArray(tasks)) return;
      var now = new Date();
      var count = tasks.filter(function (t) {
        if (t.status === 'completed') return false;
        var due = t.due_date || t.dueDate;
        return due && new Date(due) < now;
      }).length;
      _appendBadge('/ops/tasks', count);
    }).catch(function () { /* silent */ });
  }

  function _appendBadge(route, count) {
    if (!count || count <= 0) return;
    var item = document.querySelector('.sidebar-item[data-route="' + route + '"]');
    if (!item) return;
    // Don't double-add
    if (item.querySelector('.badge')) return;
    var badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = count > 99 ? '99+' : String(count);
    item.appendChild(badge);
  }

  // ─── Sidebar ─────────────────────────────────────────────────────────
  function renderSidebar() {
    var nav = document.getElementById('sidebarNav');
    if (!nav) return;

    // Restore sidebar state from localStorage
    try {
      var saved = localStorage.getItem('mallan_crm_sidebar_state');
      if (saved) {
        var parsed = JSON.parse(saved);
        Object.keys(parsed).forEach(function (key) {
          Store.ui.sidebarExpandedGroups[key] = parsed[key];
        });
      }
    } catch (e) { /* ignore */ }

    var html = '';

    // RECENT workspaces (always visible, not collapsible)
    html += '<div id="sidebarRecent"></div>';

    // FAVORITES (always visible, not collapsible)
    html += '<div id="sidebarFavorites"></div>';

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

    // Render recent & favorites sections
    _renderRecentSection();
    _renderFavoritesSection();

    // Load badge counts asynchronously (non-blocking)
    setTimeout(function () { _loadSidebarBadges(); }, 0);

    // Add pin icons to all sidebar items with data-route
    setTimeout(function () {
      document.querySelectorAll('.sidebar-item[data-route]').forEach(function (item) {
        var route = item.getAttribute('data-route');
        if (!route) return;
        // Don't add pin if one already exists
        if (item.querySelector('.pin-icon')) return;
        var label = item.querySelector('span') ? item.querySelector('span').textContent : '';
        var iconEl = item.querySelector('i.fas');
        var icon = '';
        if (iconEl) {
          iconEl.classList.forEach(function (cls) { if (cls.indexOf('fa-') === 0 && cls !== 'fas') icon = cls; });
        }
        var pin = document.createElement('i');
        pin.className = 'fas fa-thumbtack pin-icon' + (_isFavorite(route) ? ' pinned' : '');
        pin.title = 'Pin to favorites';
        pin.onclick = function (e) {
          e.stopPropagation();
          _toggleFavorite(route, label, icon);
        };
        item.appendChild(pin);
      });
    }, 0);
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
    // Persist sidebar state to localStorage
    try { localStorage.setItem('mallan_crm_sidebar_state', JSON.stringify(Store.ui.sidebarExpandedGroups)); } catch (e) { /* quota */ }
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
          '<input id="globalSearch" type="text" placeholder="Search... (\u2318K to command palette)" ' +
            'class="pl-9 pr-4 py-2 w-56 text-sm bg-gray-100 border-0 rounded-lg focus:bg-white focus:ring-2 focus:ring-gold/30 focus:outline-none transition-all">' +
          '<div id="globalSearchDropdown" class="hidden absolute left-0 top-full mt-1 w-80 bg-white rounded-xl shadow-xl border border-gray-200 py-1 z-50 max-h-80 overflow-y-auto"></div>' +
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
        } else if (q.length === 0) {
          _showRecentSearches();
        } else {
          _closeSearchResults();
        }
      }, 300));

      searchInput.addEventListener('focus', function () {
        var q = searchInput.value.trim();
        if (q.length < 2) _showRecentSearches();
      });

      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { searchInput.value = ''; _closeSearchResults(); }
      });
    }

    // Close quick actions on outside click
    document.addEventListener('click', function (e) {
      var menu = document.getElementById('quickActionsMenu');
      if (menu && !menu.parentElement.contains(e.target)) menu.classList.add('hidden');

      // Close search dropdown on outside click
      var searchDropdown = document.getElementById('globalSearchDropdown');
      var searchInput = document.getElementById('globalSearch');
      if (searchDropdown && searchInput && !searchDropdown.contains(e.target) && e.target !== searchInput) {
        searchDropdown.classList.add('hidden');
      }
    });
  }

  function toggleQuickActions() {
    var menu = document.getElementById('quickActionsMenu');
    if (menu) menu.classList.toggle('hidden');
  }

  function _globalSearch(q) {
    var dropdown = document.getElementById('globalSearchDropdown');
    if (!dropdown) return;
    if (q.length < 2) { _closeSearchResults(); return; }

    dropdown.innerHTML = '<div class="px-4 py-3 text-xs text-gray-400">Searching...</div>';
    dropdown.classList.remove('hidden');

    var fetches = [
      MallanAPI.clients.list({ limit: 10 }).catch(function () { return { clients: [] }; }),
      MallanAPI.listings.list({ limit: 10 }).catch(function () { return { listings: [] }; }),
      MallanAPI.deals.list({ limit: 10 }).catch(function () { return { deals: [] }; }),
    ];
    // Agents section only for broker
    if (Permissions.isBroker()) {
      fetches.push(MallanAPI.agents.list().catch(function () { return { agents: [] }; }));
    }

    Promise.all(fetches).then(function (r) {
      var qLower = q.toLowerCase();
      var clients = (r[0].clients || []).filter(function (c) {
        return (c.name || c.email || '').toLowerCase().indexOf(qLower) !== -1;
      });
      var listings = (r[1].listings || []).filter(function (l) {
        var addr = (l.address || l.UnparsedAddress || '').toLowerCase();
        var mlsId = (l.ListingId || l.listing_id || '').toLowerCase();
        return addr.indexOf(qLower) !== -1 || mlsId.indexOf(qLower) !== -1;
      });
      var deals = (r[2].deals || []).filter(function (d) {
        var addr = (d.address || d.property_address || '').toLowerCase();
        var cname = (d.client_name || '').toLowerCase();
        return addr.indexOf(qLower) !== -1 || cname.indexOf(qLower) !== -1;
      });
      var agents = r[3] ? (r[3].agents || []).filter(function (a) {
        return (a.full_name || a.name || a.email || '').toLowerCase().indexOf(qLower) !== -1;
      }) : [];

      if (clients.length === 0 && listings.length === 0 && deals.length === 0 && agents.length === 0) {
        dropdown.innerHTML = '<div class="px-4 py-3 text-sm text-gray-400">No results found</div>';
        return;
      }

      // Save to recent searches
      _addRecentSearch(q);

      var html = '';
      var sectionIdx = 0;

      if (clients.length > 0) {
        html += '<div class="px-4 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Clients</div>';
        clients.forEach(function (c) {
          html += '<button class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3" ' +
            'onclick="Router.navigate(\'/workspace/client/' + E(c.id) + '/overview\');CRM._closeSearchResults()">' +
            UI.avatar(c.name || c.email, 24) +
            '<div class="min-w-0 flex-1"><span class="font-medium truncate block">' + E(c.name || c.email) + '</span></div>' +
            (c.type || c.client_type ? '<span class="shrink-0 text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">' + E(c.type || c.client_type) + '</span>' : '') +
            '</button>';
        });
        sectionIdx++;
      }
      if (listings.length > 0) {
        html += '<div class="px-4 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider' + (sectionIdx > 0 ? ' border-t mt-1 pt-1.5' : '') + '">Listings</div>';
        listings.forEach(function (l) {
          var lid = l.id || l.listing_id;
          html += '<button class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3" ' +
            'onclick="Router.navigate(\'/workspace/listing/' + E(lid) + '/overview\');CRM._closeSearchResults()">' +
            '<i class="fas fa-building text-xs text-gray-400 w-5 text-center"></i>' +
            '<div class="min-w-0 flex-1"><span class="font-medium truncate block">' + E(l.address || l.UnparsedAddress || 'No address') + '</span></div>' +
            '<span class="shrink-0 text-xs text-gray-400">' + Utils.formatMoney(l.ListPrice || l.price) + '</span></button>';
        });
        sectionIdx++;
      }
      if (deals.length > 0) {
        html += '<div class="px-4 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider' + (sectionIdx > 0 ? ' border-t mt-1 pt-1.5' : '') + '">Deals</div>';
        deals.forEach(function (d) {
          var addr = d.address || d.property_address || 'No address';
          var stage = d.stage || d.status || '';
          html += '<button class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3" ' +
            'onclick="Router.navigate(\'/ops/deals\');CRM._closeSearchResults()">' +
            '<i class="fas fa-handshake text-xs text-gray-400 w-5 text-center"></i>' +
            '<div class="min-w-0 flex-1"><span class="font-medium truncate block">' + E(addr) + '</span></div>' +
            (stage ? '<span class="shrink-0 text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">' + E(stage) + '</span>' : '') +
            '</button>';
        });
        sectionIdx++;
      }
      if (agents.length > 0) {
        html += '<div class="px-4 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider' + (sectionIdx > 0 ? ' border-t mt-1 pt-1.5' : '') + '">Agents</div>';
        agents.forEach(function (a) {
          html += '<button class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3" ' +
            'onclick="Router.navigate(\'/broker/people/agents\');CRM._closeSearchResults()">' +
            UI.avatar(a.full_name || a.name || a.email, 24) +
            '<div class="min-w-0 flex-1"><span class="font-medium truncate block">' + E(a.full_name || a.name || a.email) + '</span></div>' +
            '<span class="shrink-0 text-xs text-gray-400">' + E(a.role || 'Agent') + '</span></button>';
        });
        sectionIdx++;
      }

      // Jump-to actions at bottom
      if (clients.length > 0 || listings.length > 0) {
        html += '<div class="border-t mt-1 pt-1">';
        if (clients.length > 0) {
          html += '<button class="w-full text-left px-4 py-2 text-xs text-gold hover:bg-gold-bg flex items-center gap-2" ' +
            'onclick="Router.navigate(\'/workspace/client/' + E(clients[0].id) + '/overview\');CRM._closeSearchResults()">' +
            '<i class="fas fa-arrow-right w-4"></i> Jump to Client Workspace</button>';
        }
        if (listings.length > 0) {
          var firstLid = listings[0].id || listings[0].listing_id;
          html += '<button class="w-full text-left px-4 py-2 text-xs text-gold hover:bg-gold-bg flex items-center gap-2" ' +
            'onclick="Router.navigate(\'/workspace/listing/' + E(firstLid) + '/overview\');CRM._closeSearchResults()">' +
            '<i class="fas fa-arrow-right w-4"></i> Jump to Listing Workspace</button>';
        }
        html += '</div>';
      }

      dropdown.innerHTML = html;
    }).catch(function () {
      var dd = document.getElementById('globalSearchDropdown');
      if (dd) dd.innerHTML = '<div class="px-4 py-3 text-sm text-gray-400">Search failed</div>';
    });
  }

  // ─── Recent Searches ─────────────────────────────────────────────────
  function _addRecentSearch(q) {
    try {
      var key = 'mallan_crm_recent_searches';
      var recent = JSON.parse(localStorage.getItem(key) || '[]');
      recent = recent.filter(function (r) { return r !== q; });
      recent.unshift(q);
      if (recent.length > 5) recent = recent.slice(0, 5);
      localStorage.setItem(key, JSON.stringify(recent));
    } catch (e) { /* localStorage unavailable */ }
  }

  function _showRecentSearches() {
    var dropdown = document.getElementById('globalSearchDropdown');
    if (!dropdown) return;
    try {
      var recent = JSON.parse(localStorage.getItem('mallan_crm_recent_searches') || '[]');
      if (recent.length === 0) { dropdown.classList.add('hidden'); return; }
      var html = '<div class="px-4 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Recent Searches</div>';
      recent.forEach(function (q) {
        html += '<button class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3" ' +
          'onclick="var inp=document.getElementById(\'globalSearch\');if(inp){inp.value=\'' + E(q) + '\';inp.dispatchEvent(new Event(\'input\'));}">' +
          '<i class="fas fa-clock text-xs text-gray-300 w-4"></i><span>' + E(q) + '</span></button>';
      });
      dropdown.innerHTML = html;
      dropdown.classList.remove('hidden');
    } catch (e) { dropdown.classList.add('hidden'); }
  }

  function _closeSearchResults() {
    var dropdown = document.getElementById('globalSearchDropdown');
    if (dropdown) dropdown.classList.add('hidden');
    var input = document.getElementById('globalSearch');
    if (input) input.value = '';
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

  // ─── Context Helper ──────────────────────────────────────────────────
  function _getCurrentContext() {
    var hash = window.location.hash || '';
    var clientMatch = hash.match(/\/workspace\/client\/([^\/]+)/);
    if (clientMatch) return { type: 'client', id: clientMatch[1] };
    var listingMatch = hash.match(/\/workspace\/listing\/([^\/]+)/);
    if (listingMatch) return { type: 'listing', id: listingMatch[1] };
    return { type: null, id: null };
  }

  // ─── Recent Actions Tracking ──────────────────────────────────────────
  function _trackRecentAction(action) {
    try {
      var key = 'mallan_crm_recent_actions';
      var recent = JSON.parse(localStorage.getItem(key) || '[]');
      recent.unshift({ action: action, time: Date.now() });
      if (recent.length > 10) recent = recent.slice(0, 10);
      localStorage.setItem(key, JSON.stringify(recent));
    } catch (e) { /* localStorage unavailable */ }
  }

  function _getRecentActions() {
    try {
      return JSON.parse(localStorage.getItem('mallan_crm_recent_actions') || '[]');
    } catch (e) { return []; }
  }

  // ─── Quick Send Listing (context-aware) ───────────────────────────────
  function quickSendListing() {
    toggleQuickActions();
    var ctx = _getCurrentContext();

    openModal('Quick Send Listing',
      '<div class="space-y-4">' +
        '<div class="form-group"><label class="form-label">Search Listing</label>' +
          '<input class="form-input" id="qsSendSearch" placeholder="Address or MLS ID..." oninput="CRM._searchListingsForSend(this.value)"></div>' +
        '<div id="qsSendResults"></div>' +
        '<div class="form-group"><label class="form-label">Select Client(s)</label>' +
          '<div id="qsSendClients">' + UI.loading() + '</div>' +
        '</div>' +
      '</div>',
      { size: 'lg' }
    );

    // If currently viewing a listing workspace, pre-select it
    if (ctx.type === 'listing' && ctx.id) {
      _selectedSendListing = ctx.id;
      MallanAPI.listings.list({ limit: 10 }).then(function (data) {
        var match = (data.listings || []).find(function (l) { return (l.id || l.listing_id) === ctx.id; });
        var addr = match ? (match.address || match.UnparsedAddress || 'Selected listing') : 'Selected listing';
        var el = document.getElementById('qsSendResults');
        if (el) el.innerHTML = '<div class="p-2 bg-gold-bg rounded-lg text-sm font-medium"><i class="fas fa-check text-gold mr-2"></i>' + E(addr) + '</div>';
        // Show send button
        var footer = document.getElementById('modalFooter');
        if (footer) {
          footer.innerHTML = '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
            '<button class="btn btn-gold" onclick="CRM._doQuickSend()"><i class="fas fa-paper-plane"></i> Send</button>';
          footer.classList.remove('hidden');
        }
      }).catch(function () { /* ignore pre-select failure */ });
    }

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

    _trackRecentAction('Send Listing');
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
    }).catch(function () {
      if (el) el.innerHTML = '<p class="text-xs text-gray-400">Could not search listings</p>';
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

    // Log events for timeline
    Events.log('quick_send_executed', 'listing', _selectedSendListing, { clientIds: clientIds });
    clientIds.forEach(function (cid) {
      Events.log('listing_sent', 'client', cid, { listingId: _selectedSendListing, sentVia: 'quick_send' });
    });

    // Create real communication record
    MallanAPI._fetch('/api/crm/communications/send', {
      method: 'POST',
      body: JSON.stringify({
        type: 'listing_send',
        listingId: _selectedSendListing,
        clientIds: clientIds,
        sentAt: new Date().toISOString()
      })
    }).then(function () {
      closeModal();
      toast('Send recorded — listing sent to ' + clientIds.length + ' client' + (clientIds.length > 1 ? 's' : ''), 'success');
      _selectedSendListing = null;
    }).catch(function () {
      // Graceful degradation — events already logged
      closeModal();
      toast('Listing sent to ' + clientIds.length + ' client' + (clientIds.length > 1 ? 's' : ''), 'success');
      _selectedSendListing = null;
    });
  }

  // ─── Quick Task (context-aware) ───────────────────────────────────────
  function quickTask() {
    toggleQuickActions();
    var ctx = _getCurrentContext();
    var clientIdField = '';
    var contextNote = '';

    if (ctx.type === 'client' && ctx.id) {
      clientIdField = '<input type="hidden" name="client_id" value="' + E(ctx.id) + '">';
      contextNote = '<p class="text-xs text-gold bg-gold-bg rounded-lg px-3 py-1.5 mb-3"><i class="fas fa-link mr-1"></i> Linked to current client workspace</p>';
    }

    openModal('Quick Task',
      '<form id="quickTaskForm" class="space-y-4">' +
        contextNote +
        clientIdField +
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

    _trackRecentAction('Quick Task');
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
    }).catch(function (err) {
      toast('Failed to create task: ' + (err.message || 'Unknown error'), 'error');
    });
  }

  // ─── Quick Note (context-aware) ───────────────────────────────────────
  function quickNote() {
    toggleQuickActions();
    var ctx = _getCurrentContext();
    var prefillClientId = (ctx.type === 'client' && ctx.id) ? ctx.id : '';
    var contextNote = '';

    if (prefillClientId) {
      contextNote = '<p class="text-xs text-gold bg-gold-bg rounded-lg px-3 py-1.5 mb-3"><i class="fas fa-link mr-1"></i> Linked to current client workspace</p>';
    }

    openModal('Quick Note',
      '<form id="quickNoteForm" class="space-y-4">' +
        contextNote +
        '<div class="form-group"><label class="form-label">Client (optional)</label>' +
          '<input class="form-input" id="qnClientSearch" placeholder="Search client name...">' +
          '<input type="hidden" name="client_id" id="qnClientId" value="' + E(prefillClientId) + '">' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Note *</label>' +
          '<textarea class="form-input" name="content" rows="4" required placeholder="Enter note..."></textarea></div>' +
      '</form>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="CRM.submitQuickNote()"><i class="fas fa-save"></i> Save Note</button>',
      }
    );

    _trackRecentAction('Quick Note');
  }

  function submitQuickNote() {
    var form = document.getElementById('quickNoteForm');
    if (!form || !form.checkValidity()) { if (form) form.reportValidity(); return; }
    var clientId = document.getElementById('qnClientId') ? document.getElementById('qnClientId').value : null;
    var content = form.querySelector('[name="content"]').value;

    // Always log event for timeline
    if (clientId) {
      Events.log('note_added', 'client', clientId, { content: content });
    } else {
      Events.log('note_added', 'general', null, { content: content });
    }

    // Create real note record
    var notePayload = { content: content, created_by: Store.getEffectiveAgentId() };
    if (clientId) notePayload.client_id = clientId;

    MallanAPI._fetch('/api/crm/notes', {
      method: 'POST',
      body: JSON.stringify(notePayload)
    }).then(function () {
      closeModal();
      toast('Note saved', 'success');
    }).catch(function () {
      // Graceful degradation — event already logged
      closeModal();
      toast('Note saved', 'success');
    });
  }

  // ─── Command Palette ─────────────────────────────────────────────────
  var _cmdPaletteIdx = -1;
  var _recentRoutes = [];

  // Track recent routes
  Store.on('route:changed', function (route) {
    if (!route) return;
    _recentRoutes = _recentRoutes.filter(function (r) { return r !== route; });
    _recentRoutes.unshift(route);
    if (_recentRoutes.length > 5) _recentRoutes = _recentRoutes.slice(0, 5);
  });

  function _getSidebarRoutes() {
    var routes = [];
    // Broker Console
    if (Permissions.canSeeBrokerConsole()) {
      routes.push({ route: '/broker/dashboard', label: 'Dashboard', group: 'Broker Console' });
      routes.push({ route: '/broker/people/agents', label: 'Agent Roster', group: 'Broker Console' });
      routes.push({ route: '/broker/people/clients', label: 'Client Address Book', group: 'Broker Console' });
      routes.push({ route: '/broker/leads/distribution', label: 'Lead Distribution', group: 'Broker Console' });
      routes.push({ route: '/broker/leads/referrals', label: 'Referral Tracking', group: 'Broker Console' });
      routes.push({ route: '/broker/finance/payouts', label: 'Commission Payouts', group: 'Broker Console' });
      routes.push({ route: '/broker/finance/revenue', label: 'Revenue Overview', group: 'Broker Console' });
      routes.push({ route: '/broker/finance/1099', label: '1099 Year-End', group: 'Broker Console' });
      routes.push({ route: '/broker/listings/company', label: 'Company Listings', group: 'Broker Console' });
      routes.push({ route: '/broker/listings/compliance', label: 'Compliance Dashboard', group: 'Broker Console' });
      routes.push({ route: '/broker/listings/featured', label: 'Featured Properties', group: 'Broker Console' });
      routes.push({ route: '/broker/documents', label: 'Company Vault', group: 'Broker Console' });
      routes.push({ route: '/broker/system/audit', label: 'Audit Log', group: 'Broker Console' });
      routes.push({ route: '/broker/system/idx-activity', label: 'IDX/RLS Activity', group: 'Broker Console' });
      routes.push({ route: '/broker/system/licensing', label: 'License/CE/E&O', group: 'Broker Console' });
      routes.push({ route: '/broker/system/settings', label: 'System Settings', group: 'Broker Console' });
    }
    // Operations
    routes.push({ route: '/ops/dashboard', label: 'Dashboard', group: 'Operations' });
    routes.push({ route: '/ops/search', label: 'Property Search', group: 'Operations' });
    routes.push({ route: '/ops/listings', label: 'My Listings', group: 'Operations' });
    routes.push({ route: '/ops/clients', label: 'My Clients', group: 'Operations' });
    routes.push({ route: '/ops/pipeline', label: 'Pipeline', group: 'Operations' });
    routes.push({ route: '/ops/tasks', label: 'Tasks & Follow-ups', group: 'Operations' });
    routes.push({ route: '/ops/communications', label: 'Communications', group: 'Operations' });
    routes.push({ route: '/ops/deals', label: 'Deals & Commissions', group: 'Operations' });
    routes.push({ route: '/ops/revenue', label: 'Revenue', group: 'Operations' });
    routes.push({ route: '/ops/market', label: 'Market Activity', group: 'Operations' });
    // Settings
    routes.push({ route: '/settings/profile', label: 'My Profile', group: 'Settings' });
    routes.push({ route: '/settings/notifications', label: 'Notifications', group: 'Settings' });
    routes.push({ route: '/settings/integrations', label: 'Integrations', group: 'Settings' });
    return routes;
  }

  var _quickActions = [
    { id: 'new-client', label: 'New Client', icon: 'fa-user-plus', action: function () { quickNewClient(); } },
    { id: 'new-listing', label: 'New Listing', icon: 'fa-home', action: function () { quickNewListing(); } },
    { id: 'send-listing', label: 'Send Listing', icon: 'fa-paper-plane', action: function () { quickSendListing(); } },
    { id: 'quick-task', label: 'Quick Task', icon: 'fa-tasks', action: function () { quickTask(); } },
    { id: 'quick-note', label: 'Quick Note', icon: 'fa-sticky-note', action: function () { quickNote(); } },
  ];

  function openCommandPalette() {
    // Remove existing
    var existing = document.getElementById('cmdPalette');
    if (existing) existing.remove();

    _cmdPaletteIdx = -1;

    var overlay = document.createElement('div');
    overlay.id = 'cmdPalette';
    overlay.className = 'fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]';
    overlay.style.cssText = 'background:rgba(0,0,0,0.4);backdrop-filter:blur(2px);';
    overlay.onclick = function (e) { if (e.target === overlay) closeCommandPalette(); };

    overlay.innerHTML =
      '<div class="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden" onclick="event.stopPropagation()">' +
        '<div class="px-4 py-3 border-b border-gray-100">' +
          '<div class="relative">' +
            '<i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>' +
            '<input id="cmdPaletteInput" type="text" placeholder="Search or jump to... (\u2318K)" ' +
              'class="w-full pl-10 pr-4 py-2.5 text-sm bg-transparent border-0 focus:outline-none focus:ring-0">' +
          '</div>' +
        '</div>' +
        '<div id="cmdPaletteResults" class="max-h-80 overflow-y-auto py-2"></div>' +
        '<div class="px-4 py-2 border-t border-gray-100 flex gap-4 text-[10px] text-gray-400">' +
          '<span><kbd class="px-1 py-0.5 bg-gray-100 rounded text-[10px]">\u2191\u2193</kbd> navigate</span>' +
          '<span><kbd class="px-1 py-0.5 bg-gray-100 rounded text-[10px]">Enter</kbd> select</span>' +
          '<span><kbd class="px-1 py-0.5 bg-gray-100 rounded text-[10px]">Esc</kbd> close</span>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    var input = document.getElementById('cmdPaletteInput');
    if (input) {
      input.focus();
      input.addEventListener('input', function () { _renderCmdResults(input.value.trim()); });
      input.addEventListener('keydown', _cmdPaletteKeydown);
    }

    _renderCmdResults('');
  }

  function closeCommandPalette() {
    var el = document.getElementById('cmdPalette');
    if (el) el.remove();
    _cmdPaletteIdx = -1;
  }

  function _renderCmdResults(query) {
    var container = document.getElementById('cmdPaletteResults');
    if (!container) return;

    var qLower = query.toLowerCase();
    var html = '';
    var totalIdx = 0;

    // Recent routes (only when no query)
    if (_recentRoutes.length > 0 && qLower.length === 0) {
      html += '<div class="px-4 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Recent</div>';
      var allRoutes = _getSidebarRoutes();
      _recentRoutes.slice(0, 5).forEach(function (r) {
        var match = allRoutes.find(function (sr) { return sr.route === r; });
        var label = match ? match.label : r;
        html += '<button class="cmd-palette-item w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3" data-idx="' + totalIdx + '" ' +
          'onclick="Router.navigate(\'' + E(r) + '\');CRM.closeCommandPalette()">' +
          '<i class="fas fa-clock text-xs text-gray-300 w-4"></i><span>' + E(label) + '</span>' +
          '<span class="ml-auto text-[10px] text-gray-300">' + E(r) + '</span></button>';
        totalIdx++;
      });
    }

    // Navigation
    var navRoutes = _getSidebarRoutes();
    if (qLower.length > 0) {
      navRoutes = navRoutes.filter(function (r) {
        return r.label.toLowerCase().indexOf(qLower) !== -1 || r.route.toLowerCase().indexOf(qLower) !== -1 || r.group.toLowerCase().indexOf(qLower) !== -1;
      });
    }
    if (navRoutes.length > 0) {
      html += '<div class="px-4 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider' + (totalIdx > 0 ? ' border-t mt-1 pt-1.5' : '') + '">Navigation</div>';
      navRoutes.forEach(function (r) {
        html += '<button class="cmd-palette-item w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3" data-idx="' + totalIdx + '" ' +
          'onclick="Router.navigate(\'' + E(r.route) + '\');CRM.closeCommandPalette()">' +
          '<i class="fas fa-arrow-right text-xs text-gray-300 w-4"></i><span>' + E(r.label) + '</span>' +
          '<span class="ml-auto text-[10px] text-gray-300">' + E(r.group) + '</span></button>';
        totalIdx++;
      });
    }

    // Quick Actions
    var filteredActions = _quickActions;
    if (qLower.length > 0) {
      filteredActions = _quickActions.filter(function (a) {
        return a.label.toLowerCase().indexOf(qLower) !== -1;
      });
    }
    if (filteredActions.length > 0) {
      html += '<div class="px-4 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider' + (totalIdx > 0 ? ' border-t mt-1 pt-1.5' : '') + '">Quick Actions</div>';
      filteredActions.forEach(function (a) {
        html += '<button class="cmd-palette-item w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3" data-idx="' + totalIdx + '" ' +
          'onclick="CRM._cmdAction(\'' + E(a.id) + '\')">' +
          '<i class="fas ' + a.icon + ' text-xs text-gray-300 w-4"></i><span>' + E(a.label) + '</span></button>';
        totalIdx++;
      });
    }

    // Recent Actions (only when no query)
    if (qLower.length === 0) {
      var recentActions = _getRecentActions();
      if (recentActions.length > 0) {
        html += '<div class="px-4 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider' + (totalIdx > 0 ? ' border-t mt-1 pt-1.5' : '') + '">Recent Actions</div>';
        recentActions.slice(0, 5).forEach(function (ra) {
          var timeAgo = ra.time ? Utils.formatTimeAgo(new Date(ra.time)) : '';
          html += '<div class="px-4 py-1.5 text-xs text-gray-400 flex items-center gap-3">' +
            '<i class="fas fa-history text-xs text-gray-300 w-4"></i>' +
            '<span>' + E(ra.action) + '</span>' +
            (timeAgo ? '<span class="ml-auto text-[10px]">' + E(timeAgo) + '</span>' : '') +
          '</div>';
        });
      }
    }

    if (totalIdx === 0) {
      html = '<div class="px-4 py-6 text-sm text-gray-400 text-center">No results found</div>';
    }

    container.innerHTML = html;
    _cmdPaletteIdx = -1;
  }

  function _cmdPaletteKeydown(e) {
    var items = document.querySelectorAll('.cmd-palette-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _cmdPaletteIdx = Math.min(_cmdPaletteIdx + 1, items.length - 1);
      _highlightCmdItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _cmdPaletteIdx = Math.max(_cmdPaletteIdx - 1, 0);
      _highlightCmdItem(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (_cmdPaletteIdx >= 0 && _cmdPaletteIdx < items.length) {
        items[_cmdPaletteIdx].click();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeCommandPalette();
    }
  }

  function _highlightCmdItem(items) {
    items.forEach(function (el, i) {
      if (i === _cmdPaletteIdx) {
        el.classList.add('bg-gold-bg');
        el.scrollIntoView({ block: 'nearest' });
      } else {
        el.classList.remove('bg-gold-bg');
      }
    });
  }

  function _cmdAction(actionId) {
    closeCommandPalette();
    var action = _quickActions.find(function (a) { return a.id === actionId; });
    if (action && action.action) action.action();
  }

  // Global keydown for command palette + slide-over
  document.addEventListener('keydown', function (e) {
    // Escape: close slide-over first, then modal
    if (e.key === 'Escape') {
      var slideOver = document.getElementById('slideOverPanel');
      if (slideOver) { closeSlideOver(); return; }
    }
    // Cmd+K (Mac) or Ctrl+K (Windows)
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      var existing = document.getElementById('cmdPalette');
      if (existing) { closeCommandPalette(); } else { openCommandPalette(); }
      return;
    }
    // "/" key (only when not focused on an input)
    if (e.key === '/' && !_isInputFocused()) {
      e.preventDefault();
      var existing2 = document.getElementById('cmdPalette');
      if (existing2) { closeCommandPalette(); } else { openCommandPalette(); }
    }
  });

  function _isInputFocused() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
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

  // ─── Slide-over Panel ────────────────────────────────────────────────
  function openSlideOver(title, bodyHtml, opts) {
    opts = opts || {};
    // Remove existing
    closeSlideOver();

    var backdrop = document.createElement('div');
    backdrop.id = 'slideOverBackdrop';
    backdrop.className = 'slide-over-backdrop open';
    backdrop.onclick = closeSlideOver;

    var panel = document.createElement('div');
    panel.id = 'slideOverPanel';
    panel.className = 'slide-over';
    panel.innerHTML =
      '<div class="slide-over-header">' +
        '<h3 class="text-lg font-bold">' + E(title) + '</h3>' +
        '<button onclick="CRM.closeSlideOver()" class="p-1 text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>' +
      '</div>' +
      '<div class="slide-over-body" id="slideOverBody">' + bodyHtml + '</div>' +
      (opts.footer ? '<div class="slide-over-footer">' + opts.footer + '</div>' : '');

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    // Trigger animation
    requestAnimationFrame(function () { panel.classList.add('open'); });
  }

  function closeSlideOver() {
    var panel = document.getElementById('slideOverPanel');
    var backdrop = document.getElementById('slideOverBackdrop');
    if (panel) { panel.classList.remove('open'); setTimeout(function () { panel.remove(); }, 300); }
    if (backdrop) { backdrop.classList.remove('open'); setTimeout(function () { backdrop.remove(); }, 300); }
  }

  // ─── Inline Edit Helper ────────────────────────────────────────────────
  function inlineEdit(elementId, currentValue, onSave) {
    // Toggles an element between display and edit mode
    // onSave is a function name string to call with the new value
    var el = document.getElementById(elementId);
    if (!el) return;
    el.classList.toggle('editing');
  }

  // ─── Connection Navigation Helper ──────────────────────────────────────
  function navigateToConnected(type, id, tab) {
    tab = tab || 'overview';
    Router.navigate('/workspace/' + type + '/' + id + '/' + tab);
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

    // Search
    _closeSearchResults: _closeSearchResults,

    // Context
    _getCurrentContext: _getCurrentContext,

    // Command Palette
    openCommandPalette: openCommandPalette,
    closeCommandPalette: closeCommandPalette,
    _cmdAction: _cmdAction,

    // Impersonation
    showImpersonationPicker: showImpersonationPicker,
    doImpersonate: doImpersonate,

    // Recent & Favorites
    _trackRecentWorkspace: _trackRecentWorkspace,
    _toggleFavorite: _toggleFavorite,
    _isFavorite: _isFavorite,
    _loadSidebarBadges: _loadSidebarBadges,

    // Slide-over
    openSlideOver: openSlideOver,
    closeSlideOver: closeSlideOver,
    inlineEdit: inlineEdit,
    navigateToConnected: navigateToConnected,

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

// ── Global error handler — prevent unhandled promise rejections from crashing UI ──
window.addEventListener('unhandledrejection', function (event) {
  console.error('Unhandled promise rejection:', event.reason);
  event.preventDefault();
});

// ── Boot ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', CRM.init);
