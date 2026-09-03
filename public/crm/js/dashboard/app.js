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
    // Use same origin on localhost so session cookies work
    // On production (mallan.nyc), baseUrl stays empty (same origin)

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
        // Normalize: backend may return 'tenant', data model uses 'renter'
        if (role === 'tenant') role = 'renter';
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

      // Register service worker for push notifications
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/crm/sw.js').catch(function() { /* SW optional */ });
      }

      // Process offline queue on reconnect
      window.addEventListener('online', function() {
        Utils.processOfflineQueue().then(function(result) {
          if (result && result.processed > 0) {
            CRM.toast(result.processed + ' offline actions synced', 'success');
          }
        });
      });

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
    Router.register('/broker/approvals',           function () { Panels.brokerApprovalQueue(); });
    Router.register('/broker/people/agents',       function () { Panels.agentRoster(); });
    Router.register('/broker/people/clients',      function () { Panels.clientAddressBook(); });
    Router.register('/broker/leads/distribution',  function () { Panels.clientAddressBook('unassigned'); }); // redirect → Clients "To Be Assigned"
    Router.register('/broker/leads/referrals',     function () { Panels.referralTracking(); });
    Router.register('/broker/finance',             function () { Panels.financeDashboard(); }); // combined: Payouts | Revenue | 1099
    Router.register('/broker/finance/payouts',     function () { Panels.financeDashboard('payouts'); });
    Router.register('/broker/finance/revenue',     function () { Panels.financeDashboard('revenue'); });
    Router.register('/broker/finance/1099',        function () { Panels.financeDashboard('1099'); });
    Router.register('/broker/listings/company',    function () { Panels.companyListings(); });
    Router.register('/broker/listings/compliance', function () { Panels.complianceDashboard(); });
    Router.register('/broker/listings/featured',   function () { Panels.featuredProperties(); });
    Router.register('/broker/documents',           function () { Panels.brokerDocuments(); });
    Router.register('/broker/system/audit',        function () { Panels.licensingTracker(); });
    Router.register('/broker/system/idx-activity', function () { Panels.complianceDashboard(); });
    Router.register('/broker/system/licensing',    function () { Panels.licensingTracker(); });
    Router.register('/broker/system/settings',     function () { Panels.systemSettings(); });
    Router.register('/broker/system/health',       function () { Panels.complianceDashboard(); }); // System Health embedded in Compliance & IDX
    Router.register('/broker/people/ethics',       function () { AdminEthics.render(); }); // UCBA Art. III §6 ethics training (C4c)

    // A2. Clients CRM — direct routes to real grids
    Router.register('/sales/prospects',         function () { SellerProspects.render(); });
    Router.register('/sales/scanner',           function () { OffMarketScanner.render(document.getElementById('mainContent') || document.body); });
    Router.register('/sales/sellers',           function () { SalesCRM.activeSellers(); });
    Router.register('/sales/buyers',            function () { SalesCRM.activeBuyers(); });
    Router.register('/rentals/landlords',       function () { RentalsCRM.landlords(); });
    Router.register('/rentals/tenants',         function () { RentalsCRM.currentTenants(); });
    Router.register('/lease-tracker',           function () { LeaseTracker.render(); });

    // Secondary routes
    Router.register('/sales/landlord-sellers',  function () { Router.navigate('/lease-tracker'); });
    Router.register('/sales/listings',          function () { Router.navigate('/broker/listings/company'); });
    Router.register('/sales/marketing',         function () { Router.navigate('/sales/prospects'); });
    Router.register('/sales/activity',          function () { Router.navigate('/sales/prospects'); });
    Router.register('/sales/automation',        function () { Router.navigate('/sales/prospects'); });
    Router.register('/rentals/active-leases',   function () { LeaseTracker.render(); });
    Router.register('/rentals/listings',        function () { Router.navigate('/broker/listings/company'); });
    Router.register('/rentals/viewed',          function () { Router.navigate('/sales/prospects'); });
    Router.register('/rentals/marketing',       function () { Router.navigate('/sales/prospects'); });
    Router.register('/rentals/activity',        function () { Router.navigate('/sales/prospects'); });
    Router.register('/rentals/automation',      function () { Router.navigate('/sales/prospects'); });

    // A3b. Broker-only: Lead Distribution
    Router.register('/broker/leads',         function () { _renderBrokerLeadDistribution(); });

    // A4. Operations
    Router.register('/ops/dashboard',        function () { if (typeof HomeScreen !== 'undefined') { HomeScreen.render(); } else { Panels.opsDashboard(); } });
    Router.register('/ops/search',           function () { Panels.propertySearch(); });
    Router.register('/ops/listings',         function () { Panels.myListings(); });
    Router.register('/ops/tasks',            function () { Panels.tasks(); });
    Router.register('/ops/deals',            function () { Panels.dealsCommissions(); });
    Router.register('/ops/revenue',          function () { Panels.personalRevenue(); });
    Router.register('/ops/market',           function () { Panels.marketActivity(); });
    Router.register('/ops/import',          function () { Panels.importFromEmail(); });
    Router.register('/ops/outlook',         function () { Panels.outlookScanner(); });

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
    // Data tracked for future cmd+K search — not rendered in sidebar
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
    // Favorites/pins removed — added clutter without clear value
    var container = document.getElementById('sidebarFavorites');
    if (container) container.innerHTML = '';
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

    // BROKERAGE (Maya-only, hidden when impersonating) — flat list, no sub-headings
    if (Permissions.canSeeBrokerConsole()) {
      html += _sidebarGroup('BROKERAGE', 'broker', [
        { route: '/broker/dashboard', icon: 'fa-chart-line', label: 'Dashboard' },
        { route: '/broker/people/agents', icon: 'fa-user-tie', label: 'Agent Roster' },
        { route: '/broker/system/licensing', icon: 'fa-id-card', label: 'Licensing & CE/E&O' },
        { route: '/broker/people/ethics', icon: 'fa-graduation-cap', label: 'Ethics Training' },
        { route: '/broker/people/clients', icon: 'fa-address-book', label: 'Clients' },
        { route: '/broker/leads/referrals', icon: 'fa-exchange-alt', label: 'Referrals' },
        { route: '/broker/finance', icon: 'fa-dollar-sign', label: 'Finance' },
        { route: '/broker/listings/company', icon: 'fa-building', label: 'Company Listings' },
        { route: '/broker/listings/compliance', icon: 'fa-shield-alt', label: 'Compliance & IDX' },
        { route: '/broker/listings/featured', icon: 'fa-star', label: 'Featured Properties' },
        { route: '/broker/documents', icon: 'fa-folder', label: 'Documents' },
        { route: '/broker/system/settings', icon: 'fa-cog', label: 'Settings' },
      ]);
    }

    // CLIENTS — direct access to each client type
    html += _sidebarGroup('CLIENTS', 'clients', [
      { route: '/sales/prospects', icon: 'fa-crosshairs', label: 'Prospects' },
      { route: '/sales/sellers', icon: 'fa-home', label: 'Sellers' },
      { route: '/sales/buyers', icon: 'fa-shopping-cart', label: 'Buyers' },
      { route: '/rentals/landlords', icon: 'fa-building', label: 'Landlords' },
      { route: '/rentals/tenants', icon: 'fa-key', label: 'Tenants' },
      { route: '/lease-tracker', icon: 'fa-calendar-alt', label: 'Lease Tracker' },
    ]);

    // BROKER ADMIN removed — unassigned leads now in Clients "To Be Assigned" tab

    // OPERATIONS (agent view; broker sees expanded/all)
    html += _sidebarGroup('OPERATIONS', 'ops', [
      { route: '/ops/dashboard', icon: 'fa-tachometer-alt', label: 'Dashboard' },
      { route: '/ops/search', icon: 'fa-search', label: 'Property Search' },
      { route: '/ops/listings', icon: 'fa-building', label: 'My Listings' },
      { route: '/ops/tasks', icon: 'fa-tasks', label: 'Tasks & Follow-ups' },
      { route: '/ops/deals', icon: 'fa-handshake', label: 'Deals & Commissions' },
      { route: '/ops/revenue', icon: 'fa-chart-pie', label: 'Revenue' },
      { route: '/ops/market', icon: 'fa-chart-area', label: 'Market Activity' },
      { route: '/ops/import', icon: 'fa-file-import', label: 'Import Contacts' },
      { route: '/ops/outlook', icon: 'fa-envelope', label: 'Outlook Scanner' },
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

    // Load badge counts asynchronously (non-blocking)
    setTimeout(function () { _loadSidebarBadges(); }, 0);

    // Pin icons removed — added clutter
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
        html += '<div class="px-3 pt-4 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wide">' + E(item.heading) + '</div>';
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
    var currentRoute = Store.ui.activeRoute || '';
    document.querySelectorAll('.sidebar-item[data-route]').forEach(function (el) {
      var route = el.getAttribute('data-route');
      var isActive = Router.isActive(route);
      el.classList.toggle('active', isActive);
    });
  }

  // Listen for route changes to update sidebar + mobile nav
  Store.on('route:changed', function () {
    updateSidebarActive();
    // Update mobile nav active state
    document.querySelectorAll('.mobile-nav-btn[data-route]').forEach(function(btn) {
      btn.classList.toggle('active', Router.isActive(btn.getAttribute('data-route')));
    });
  });

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
      MallanAPI.clients.list({ limit: 20 }).catch(function () { return { clients: [] }; }),
      MallanAPI.listings.list({ limit: 20 }).catch(function () { return { listings: [] }; }),
      MallanAPI.deals.list({ limit: 20 }).catch(function () { return { deals: [] }; }),
      MallanAPI._fetch('/api/crm/tasks').catch(function () { return { tasks: [] }; }),
      Documents.listAll ? Documents.listAll().catch(function () { return []; }) : Promise.resolve([]),
    ];
    // Agents section only for broker
    if (Permissions.isBroker()) {
      fetches.push(MallanAPI.agents.list().catch(function () { return { agents: [] }; }));
    }

    Promise.all(fetches).then(function (r) {
      var qLower = q.toLowerCase();
      var clients = (r[0].clients || []).map(function (c) {
        // Normalize name + type for display
        if (!c.name && (c.first_name || c.last_name)) c.name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim();
        if (!c.type) c.type = c.portal_role || (c.roles && c.roles[0]) || 'buyer';
        // Build searchable text including secondary person
        c._searchText = ((c.name || '') + ' ' + (c.email || '') + ' ' + (c.phone || '') +
          (c.secondary_first_name ? ' ' + c.secondary_first_name + ' ' + (c.secondary_last_name || '') : '') +
          (c.secondary_email ? ' ' + c.secondary_email : '')).toLowerCase();
        return c;
      }).filter(function (c) {
        return c._searchText.indexOf(qLower) !== -1;
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
      var tasks = (r[3].tasks || []).filter(function (t) {
        return (t.title || t.description || '').toLowerCase().indexOf(qLower) !== -1;
      });
      var docs = (Array.isArray(r[4]) ? r[4] : []).filter(function (d) {
        return (d.title || d.name || d.type || '').toLowerCase().indexOf(qLower) !== -1;
      });
      var agents = r[5] ? (r[5].agents || []).filter(function (a) {
        return (a.full_name || a.name || a.email || '').toLowerCase().indexOf(qLower) !== -1;
      }) : [];

      if (clients.length === 0 && listings.length === 0 && deals.length === 0 && agents.length === 0 && tasks.length === 0 && docs.length === 0) {
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
          var cDisplayName = c.name || c.email;
          if (c.secondary_first_name) {
            var secN = ((c.secondary_first_name || '') + ' ' + (c.secondary_last_name || '')).trim();
            if (c.last_name && c.secondary_last_name === c.last_name) {
              cDisplayName = (c.first_name || '') + ' & ' + (c.secondary_first_name || '') + ' ' + c.last_name;
            } else { cDisplayName = cDisplayName + ' & ' + secN; }
          }
          html += '<button class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3" ' +
            'onclick="Router.navigate(\'/workspace/client/' + E(c.id) + '/overview\');CRM._closeSearchResults()">' +
            UI.avatar(cDisplayName, 24) +
            '<div class="min-w-0 flex-1"><span class="font-medium truncate block">' + E(cDisplayName) + '</span></div>' +
            UI.roleBadge(c.type) +
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
            '<span class="shrink-0 text-xs text-gray-400">' + Utils.formatMoney(l.ListPrice ?? l.price) + '</span></button>';
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
      if (tasks.length > 0) {
        html += '<div class="px-4 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider' + (sectionIdx > 0 ? ' border-t mt-1 pt-1.5' : '') + '">Tasks</div>';
        tasks.slice(0, 5).forEach(function (t) {
          var overdue = t.due_date && t.status !== 'completed' && new Date(t.due_date) < new Date();
          var clientRoute = t.client_id || t.clientId ? '/workspace/client/' + E(t.client_id || t.clientId) + '/pipeline' : '/ops/tasks';
          html += '<button class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3" ' +
            'onclick="Router.navigate(\'' + clientRoute + '\');CRM._closeSearchResults()">' +
            '<i class="fas fa-tasks text-xs ' + (overdue ? 'text-red-500' : 'text-gray-400') + ' w-5 text-center"></i>' +
            '<div class="min-w-0 flex-1"><span class="font-medium truncate block ' + (overdue ? 'text-red-600' : '') + '">' + E(t.title || 'Task') + '</span></div>' +
            (t.due_date ? '<span class="shrink-0 text-xs ' + (overdue ? 'text-red-500' : 'text-gray-400') + '">' + Utils.formatDate(t.due_date) + '</span>' : '') +
          '</button>';
        });
        sectionIdx++;
      }
      if (docs.length > 0) {
        html += '<div class="px-4 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider' + (sectionIdx > 0 ? ' border-t mt-1 pt-1.5' : '') + '">Documents</div>';
        docs.slice(0, 5).forEach(function (d) {
          html += '<button class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3" ' +
            'onclick="Router.navigate(\'/broker/documents\');CRM._closeSearchResults()">' +
            '<i class="fas ' + (Documents.typeIcon ? Documents.typeIcon(d.type) : 'fa-file-alt') + ' text-xs text-gold w-5 text-center"></i>' +
            '<div class="min-w-0 flex-1"><span class="font-medium truncate block">' + E(d.title || d.name || 'Document') + '</span></div>' +
            '<span class="shrink-0 text-xs text-gray-400">' + E(d.scope || '') + '</span></button>';
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
      // PR-CRM.6 (2026-05-24, post-Codex-P1) — Stop impersonation
      // server-side FIRST so the AuditEvent is written and the
      // delegated session cookie is destroyed. Routed through the
      // MallanAPI.auth.stopImpersonation() wrapper (NOT raw fetch)
      // so the call honors MallanAPI._baseUrl (the CRM may be served
      // from a non-mallan.nyc origin while pointing at https://
      // mallan.nyc via agent-context.js) AND inherits the shared
      // 401-unauthorized handler. Per the backend route's own doc,
      // "Broker must re-login with their own credentials" — the
      // original broker session cannot be restored because
      // impersonation overwrote the cookie when it started. We
      // redirect to /crm/login.html?redirect=/crm after stop.
      var stoppedAgentId = Store.session.impersonatedAgentId;
      MallanAPI.auth.stopImpersonation().then(function (data) {
        if (!data || !data.success) {
          // Don't fake success on a backend failure. Surface the
          // error honestly — local state stays as-is so the user is
          // not confused into thinking impersonation ended when it
          // didn't.
          toast('Failed to end impersonation. Please refresh and try again.', 'error');
          return;
        }
        Events.log('impersonation_ended', 'agent', stoppedAgentId);
        Store.stopImpersonation();
        renderSidebar();
        renderUserInfo();
        _updateImpersonationBar();
        toast('Impersonation ended — please log in again.', 'info');
        // Backend cleared the session cookie; navigate to login so the
        // next request lands on a fresh authenticated session.
        window.location.href = '/crm/login.html?redirect=/crm';
      }).catch(function (err) {
        // _fetch rejects on non-2xx (with a parsed error message when
        // available) and on network failure. Either way, surface
        // honest error UI without clearing local state.
        var msg = (err && err.message) ? err.message : 'Could not reach the server to end impersonation.';
        toast(msg + ' Please refresh.', 'error');
      });
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
    // PR-CRM.6 (2026-05-24, post-Codex-P1) — Pre-fix, this function set
    // client-only impersonation state via Store.startImpersonation
    // without ever calling the backend. Consequence (per the
    // 2026-05-16 CRM workflow audit BA1–BA10): no AuditEvent for the
    // impersonation start, no server-side delegated session, server-
    // side ownership checks still saw BROKER, and broker-as-agent
    // could still approve own deals (leaky).
    //
    // We now POST via MallanAPI.agents.impersonate(agentId), which
    // routes through _fetch and therefore:
    //   - honors MallanAPI._baseUrl (the CRM may be served from a
    //     non-mallan.nyc origin while agent-context.js points the
    //     API base at https://mallan.nyc — raw fetch would hit the
    //     wrong host)
    //   - inherits the shared 401-unauthorized handler (raw fetch
    //     would silently fail without redirecting to login)
    //
    // Backend (app/api/crm/agents/[id]/impersonate/route.ts) requires
    // broker auth, writes AuditEvent "impersonate_start", creates a
    // 2h delegated agent session, and sets the SESSION_COOKIE to the
    // new token. ONLY on backend success (data.success && data
    // .impersonating present) do we call Store.startImpersonation,
    // so local UI never claims success when the server didn't actually
    // authorize.
    MallanAPI.agents.impersonate(agentId).then(function (data) {
      if (!data || !data.success || !data.impersonating) {
        toast('Impersonation refused by server.', 'error');
        return;
      }
      // Build the agent object Store expects from the backend's
      // authoritative response (not from the client-side agent list,
      // which could be stale or filtered).
      var agent = {
        id: data.impersonating.id,
        name: data.impersonating.name,
        email: data.impersonating.email,
        role: data.impersonating.role,
      };
      Store.startImpersonation(agent);
      Events.log('impersonation_started', 'agent', agent.id, { agentName: agent.name });
      renderSidebar();
      renderUserInfo();
      _updateImpersonationBar();
      Router.navigate('/ops/dashboard');
      toast('Now viewing as ' + (agent.name || agent.email), 'info');
    }).catch(function (err) {
      // _fetch rejects on non-2xx with a parsed error message and on
      // network failure. Surface the message honestly — Store stays
      // unmutated so the UI is consistent with the server.
      var msg = (err && err.message) ? err.message : 'Could not reach the server to start impersonation.';
      toast(msg, 'error');
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

  // ─── Modal (WCAG 2.1 AA: focus trap, ESC close, focus restore) ─────
  var _modalPreviousFocus = null;
  var _modalKeyHandler = null;

  function openModal(title, bodyHtml, opts) {
    opts = opts || {};
    var overlay = document.getElementById('modalOverlay');
    var container = document.getElementById('modalContainer');
    var titleEl = document.getElementById('modalTitle');
    var bodyEl = document.getElementById('modalBody');
    var footerEl = document.getElementById('modalFooter');

    if (!overlay || !container) return;

    // Save focus for restoration on close
    _modalPreviousFocus = document.activeElement;

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

    // Focus first focusable element inside modal
    setTimeout(function () {
      var first = container.querySelector('input:not([type="hidden"]), select, textarea, button, [tabindex]:not([tabindex="-1"])');
      if (first) first.focus();
      else container.focus();
    }, 50);

    // ESC key + focus trap
    if (_modalKeyHandler) document.removeEventListener('keydown', _modalKeyHandler);
    _modalKeyHandler = function (e) {
      if (e.key === 'Escape') { closeModal(); return; }
      if (e.key !== 'Tab') return;
      var focusable = container.querySelectorAll('input:not([type="hidden"]), select, textarea, button:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href]');
      if (focusable.length === 0) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', _modalKeyHandler);
  }

  function closeModal(event) {
    if (event && event.target !== event.currentTarget) return;
    var overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.add('hidden');

    // Remove key handler
    if (_modalKeyHandler) {
      document.removeEventListener('keydown', _modalKeyHandler);
      _modalKeyHandler = null;
    }

    // Restore focus
    if (_modalPreviousFocus && _modalPreviousFocus.focus) {
      _modalPreviousFocus.focus();
      _modalPreviousFocus = null;
    }
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
        '<div class="form-group"><label class="form-label">Source</label>' +
          '<select class="form-input form-select" name="source">' +
            '<option value="manual">Manual Entry</option><option value="streeteasy">StreetEasy</option>' +
            '<option value="referral">Referral</option><option value="website">Website</option>' +
            '<option value="walk-in">Walk-In</option><option value="open-house">Open House</option>' +
            '<option value="social">Social Media</option><option value="other">Other</option>' +
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
    // Capture display values before mutating data for API
    var clientDisplayName = data.name || ((data.first_name || '') + ' ' + (data.last_name || '')).trim() || 'Unknown';
    var clientType = data.type || 'client';

    // Map type → roles/portal_role (Zod schema expects roles[], not type)
    if (data.type) {
      data.roles = [data.type];
      data.portal_role = data.type;
      delete data.type;
    }
    delete data.name; // not a schema field

    MallanAPI.clients.create(data).then(function (result) {
      closeModal();
      Events.log('client_created', 'client', result.client ? result.client.id : null, { name: clientDisplayName, type: clientType });
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

  // ─── Quick Send to specific client from client list ──────────────────
  function quickSendToClient(clientId, clientName) {
    openModal('Send Listing to ' + clientName,
      '<div class="space-y-4">' +
        '<div class="form-group"><label class="form-label">Search Listing</label>' +
          '<input class="form-input" id="qsSendSearch" placeholder="Address or MLS ID..." oninput="CRM._searchListingsForSend(this.value)"></div>' +
        '<div id="qsSendResults"></div>' +
        '<input type="hidden" id="qsSendClientIds" value="' + clientId + '">' +
        '<p class="text-xs text-gray-500">Sending to: <strong>' + clientName + '</strong></p>' +
      '</div>',
      {
        footer: '<button class="btn btn-outline" onclick="CRM.closeModal()">Cancel</button>' +
          '<button class="btn btn-gold" onclick="CRM._doQuickSend()"><i class="fas fa-paper-plane mr-1"></i> Send</button>',
      }
    );
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
        var cName = c.name || ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || c.email;
        if (c.secondary_first_name) {
          var secName = ((c.secondary_first_name || '') + ' ' + (c.secondary_last_name || '')).trim();
          if (c.last_name && c.secondary_last_name === c.last_name) {
            cName = (c.first_name || '') + ' & ' + (c.secondary_first_name || '') + ' ' + c.last_name;
          } else { cName = cName + ' & ' + secName; }
        }
        var cRole = c.portal_role || (c.roles && c.roles[0]) || c.type || c.client_type || 'buyer';
        html += '<label class="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer">' +
          '<input type="checkbox" name="client" value="' + E(c.id) + '" class="qs-client-cb">' +
          '<span class="text-sm">' + E(cName) + '</span>' +
          UI.roleBadge(cRole) +
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
          '<span>' + E(addr) + '</span><span class="text-gray-400">' + Utils.formatMoney(l.ListPrice ?? l.price) + '</span></button>';
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

    var sendBtn = document.querySelector('[onclick*="_doQuickSend"]');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...'; }

    MallanAPI._fetch('/api/crm/listing-sends', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'idem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) },
      body: JSON.stringify({
        listing_id: _selectedSendListing,
        client_ids: clientIds,
        sent_via: 'quick_send',
        context: { source: 'top_bar' }
      })
    }).then(function (res) {
      // Log derived timeline events after persistence succeeds
      Events.log('quick_send_executed', 'listing', _selectedSendListing, { clientIds: clientIds });
      clientIds.forEach(function (cid) {
        Events.log('listing_sent', 'client', cid, { listingId: _selectedSendListing, sentVia: 'quick_send' });
      });
      closeModal();
      // Handle partial failures
      var failed = (res && res.failed) ? res.failed.length : 0;
      if (failed > 0) {
        toast('Sent to ' + (clientIds.length - failed) + ' of ' + clientIds.length + ' clients', 'warning');
      } else {
        toast('Send recorded — listing sent to ' + clientIds.length + ' client' + (clientIds.length > 1 ? 's' : ''), 'success');
      }
      _selectedSendListing = null;
    }).catch(function (err) {
      if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send'; }
      toast('Failed to save send record: ' + (err.message || 'Please try again'), 'error');
      // Do not close modal — let user retry
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

    var createBtn = document.querySelector('[onclick*="submitQuickTask"]');
    if (createBtn) { createBtn.disabled = true; createBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...'; }

    MallanAPI._fetch('/api/crm/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(function () {
      closeModal();
      toast('Task created', 'success');
    }).catch(function (err) {
      if (createBtn) { createBtn.disabled = false; createBtn.innerHTML = '<i class="fas fa-plus"></i> Create Task'; }
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

    var saveBtn = document.querySelector('[onclick*="submitQuickNote"]');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

    // Step 1: Create canonical note record FIRST
    var notePayload = { content: content, created_by: Store.getEffectiveAgentId() };
    if (clientId) notePayload.client_id = clientId;

    MallanAPI._fetch('/api/crm/notes', {
      method: 'POST',
      body: JSON.stringify(notePayload)
    }).then(function () {
      // Step 2: Only log timeline event AFTER persistence succeeds
      if (clientId) {
        Events.log('note_added', 'client', clientId, { content: content });
      } else {
        Events.log('note_added', 'general', null, { content: content });
      }
      closeModal();
      toast('Note saved', 'success');
    }).catch(function (err) {
      // Step 3: Show real failure — do NOT mask as success
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Note'; }
      toast('Failed to save note: ' + (err.message || 'Please try again'), 'error');
      // Do not close modal — let user retry
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
      routes.push({ route: '/broker/people/ethics', label: 'Ethics Training (UCBA Art. III §6)', group: 'Broker Console' });
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
    quickSendToClient: quickSendToClient,
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

// ── Listen for postMessage from listing forms (auto-refresh on save) ──
window.addEventListener('message', function (event) {
  // Security: only accept messages from our own origin
  if (event.origin !== window.location.origin) return;
  if (!event.data || typeof event.data !== 'object') return;
  if (event.data.type === 'listing_saved') {
    CRM.toast('Listing ' + (event.data.mode === 'create' ? 'created' : 'updated'), 'success');
    // Refresh the current panel if it's a listings view
    var current = Router.current ? Router.current() : '';
    if (current.indexOf('listing') !== -1 || current.indexOf('dashboard') !== -1) {
      Router.navigate(current); // Re-render current route
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════
// BROKER LEAD DISTRIBUTION PANEL
// Full panel for reviewing and distributing unassigned self-signup leads
// ═══════════════════════════════════════════════════════════════════════
function _renderBrokerLeadDistribution() {
  CRM.setPanelTitle('Lead Distribution');
  var c = CRM.getContent();
  c.innerHTML = '<div class="flex items-center justify-center h-40"><i class="fas fa-spinner fa-spin text-2xl text-gold"></i></div>';

  MallanAPI._fetch('/api/crm/unassigned-leads').then(function (data) {
    var leads = data.leads || [];
    var agents = data.agents || [];
    var E = Utils.esc;
    var $ = Utils.formatMoney;

    var h = '<div class="space-y-6">';

    // Header
    h += '<div class="flex items-center justify-between">';
    h += '<div><h2 class="text-xl font-bold text-gray-900">Unassigned Leads</h2>';
    h += '<p class="text-sm text-gray-500">Self-registered on mallan.nyc — assign to an agent to activate their portal</p></div>';
    h += '<span class="text-3xl font-black text-red-600">' + leads.length + '</span>';
    h += '</div>';

    if (leads.length === 0) {
      h += '<div class="text-center py-16 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">';
      h += '<i class="fas fa-check-circle text-5xl text-green-400 mb-4"></i>';
      h += '<p class="text-lg font-semibold text-gray-600">All caught up — no unassigned leads</p>';
      h += '</div>';
    } else {
      // Role filter tabs
      var roleGroups = {};
      leads.forEach(function (l) { var r = l.portal_role || 'unknown'; if (!roleGroups[r]) roleGroups[r] = []; roleGroups[r].push(l); });
      h += '<div class="flex gap-2 flex-wrap">';
      h += '<button onclick="_filterUnassigned(\'all\')" id="ufl-all" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-900 text-white">All (' + leads.length + ')</button>';
      Object.keys(roleGroups).forEach(function (role) {
        var label = role === 'tenant' ? 'Renters' : (role.charAt(0).toUpperCase() + role.slice(1) + 's');
        h += '<button onclick="_filterUnassigned(\'' + role + '\')" id="ufl-' + role + '" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-200 text-gray-600 hover:border-gray-400">' + E(label) + ' (' + roleGroups[role].length + ')</button>';
      });
      h += '</div>';

      h += '<div id="ufl-list" class="space-y-3">';
      leads.forEach(function (lead) {
        var roleColor = { buyer: 'blue', tenant: 'purple', seller: 'green', landlord: 'teal' }[lead.portal_role] || 'gray';
        var roleLabel = lead.portal_role === 'tenant' ? 'Renter' : lead.portal_role ? (lead.portal_role.charAt(0).toUpperCase() + lead.portal_role.slice(1)) : '?';
        var urgencyClass = lead.hours_since_signup <= 1 ? 'border-red-300 bg-red-50'
          : lead.hours_since_signup <= 24 ? 'border-amber-200 bg-amber-50'
          : 'border-gray-200 bg-white';

        h += '<div class="border-2 rounded-2xl p-5 ' + urgencyClass + '" data-role="' + E(lead.portal_role || '') + '" id="lead-row-' + E(lead.id) + '">';
        h += '<div class="flex items-start gap-4">';

        // Avatar
        var init = ((lead.first_name || '?')[0] + (lead.last_name || '?')[0]).toUpperCase();
        h += '<div style="width:44px;height:44px;border-radius:50%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#374151;flex-shrink:0;">' + E(init) + '</div>';

        h += '<div class="flex-1 min-w-0">';
        // Name + role + timing
        h += '<div class="flex items-center gap-2 flex-wrap">';
        h += '<span class="font-bold text-gray-900">' + E(lead.first_name + ' ' + lead.last_name) + '</span>';
        h += '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-' + roleColor + '-100 text-' + roleColor + '-700">' + E(roleLabel) + '</span>';
        var timeLabel = lead.hours_since_signup <= 1 ? '<span class="text-[10px] text-red-600 font-bold">🔴 Just now</span>'
          : lead.hours_since_signup <= 24 ? '<span class="text-[10px] text-amber-600 font-bold">🟡 ' + lead.hours_since_signup + 'h ago</span>'
          : '<span class="text-[10px] text-gray-400">⚪ ' + Math.floor(lead.hours_since_signup / 24) + 'd ago</span>';
        h += timeLabel;
        h += '</div>';

        // Contact
        h += '<div class="text-xs text-gray-500 mt-1">';
        h += '<i class="fas fa-envelope mr-1 text-gray-300"></i>' + E(lead.email);
        h += ' · <i class="fas fa-phone mr-1 text-gray-300"></i>' + E(lead.phone);
        if (lead.tenant_origin) h += ' · <i class="fas fa-globe mr-1 text-gray-300"></i>' + E(lead.tenant_origin);
        h += '</div>';

        // Sign-up message / notes
        if (lead.notes) {
          var msg = lead.notes.replace('[Sign-up message]: ', '').split('\n')[0];
          h += '<div class="mt-1.5 text-xs text-gray-600 bg-white/70 rounded-lg px-2 py-1.5 border border-gray-100 italic">' + E(msg) + '</div>';
        }

        var inheritedBits = [];
        if (lead.portal_activity_count) inheritedBits.push(lead.portal_activity_count + ' portal events');
        if (lead.external_listing_count) inheritedBits.push(lead.external_listing_count + ' outside listings');
        if (lead.saved_search_count) inheritedBits.push(lead.saved_search_count + ' saved searches');
        if (lead.listing_action_count) inheritedBits.push(lead.listing_action_count + ' listing actions');
        if (lead.activity_count) inheritedBits.push(lead.activity_count + ' CRM notes');
        if (inheritedBits.length) {
          h += '<div class="mt-2 text-[11px] text-gray-500 bg-white/80 rounded-lg px-2 py-1 border border-gray-100"><i class="fas fa-share-alt mr-1 text-gray-400"></i>Agent inherits: ' + E(inheritedBits.join(', ')) + '</div>';
        }

        // Assignment row
        h += '<div class="flex items-center gap-2 mt-3 flex-wrap">';
        h += '<select id="assign-agent-full-' + E(lead.id) + '" class="border rounded-lg px-2 py-1.5 text-xs text-gray-700 bg-white flex-1 min-w-[180px]">';
        h += '<option value="">— Select Agent —</option>';
        agents.forEach(function (agent) {
          var load = agent.active_lead_count;
          var loadColor = load > 20 ? ' 🔴' : load > 10 ? ' 🟡' : ' 🟢';
          h += '<option value="' + E(agent.id) + '">' + E(agent.name) + ' · ' + load + ' leads' + loadColor + '</option>';
        });
        h += '</select>';
        h += '<input type="text" id="assign-note-full-' + E(lead.id) + '" placeholder="Note to agent..." class="border rounded-lg px-2 py-1.5 text-xs flex-1 min-w-[160px]">';
        h += '<button onclick="_assignLeadFromPanel(\'' + E(lead.id) + '\')" class="px-4 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg hover:bg-gray-800 flex-shrink-0"><i class="fas fa-paper-plane mr-1"></i>Assign</button>';
        h += '</div>';
        h += '</div></div></div>';
      });
      h += '</div>';
    }
    h += '</div>';
    c.innerHTML = h;
  }).catch(function (err) {
    c.innerHTML = '<div class="text-center py-12 text-red-500">' + Utils.esc(err.message || 'Failed to load') + '</div>';
  });
}

function _filterUnassigned(role) {
  var rows = document.querySelectorAll('#ufl-list > div');
  rows.forEach(function (row) {
    row.style.display = (role === 'all' || row.dataset.role === role) ? '' : 'none';
  });
  document.querySelectorAll('[id^="ufl-"]').forEach(function (btn) {
    btn.classList.remove('bg-gray-900', 'text-white');
    btn.classList.add('bg-white', 'text-gray-600', 'border-gray-200');
  });
  var activeBtn = document.getElementById('ufl-' + role);
  if (activeBtn) {
    activeBtn.classList.add('bg-gray-900', 'text-white');
    activeBtn.classList.remove('bg-white', 'text-gray-600', 'border-gray-200');
  }
}

function _assignLeadFromPanel(leadId) {
  var sel = document.getElementById('assign-agent-full-' + leadId);
  var noteEl = document.getElementById('assign-note-full-' + leadId);
  if (!sel || !sel.value) { CRM.toast('Select an agent first', 'warning'); return; }

  var body = { assigned_agent_id: sel.value };
  var note = noteEl ? noteEl.value.trim() : '';
  if (note) body.broker_note = note;

  MallanAPI._fetch('/api/crm/leads/' + leadId, { method: 'PATCH', body: JSON.stringify(body) })
    .then(function () {
      CRM.toast('Assigned — agent notified', 'success');
      var row = document.getElementById('lead-row-' + leadId);
      if (row) {
        row.style.transition = 'opacity 0.3s, max-height 0.3s';
        row.style.opacity = '0';
        setTimeout(function () { row.remove(); }, 300);
      }
    })
    .catch(function (err) { CRM.toast('Failed: ' + Utils.esc(err.message || ''), 'error'); });
}

// ── Boot ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', CRM.init);
