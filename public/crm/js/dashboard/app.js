// ═══════════════════════════════════════════════════════════════════════════════
// CRM APP — Main Controller
// Auth, routing, sidebar, toasts, modals, utilities
// ═══════════════════════════════════════════════════════════════════════════════
/* global MallanAPI, Panels, Workspace, Portals */

var CRM = (function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────
  var _ctx = null;           // Auth context from /api/auth/me
  var _currentPanel = null;  // Current active panel ID
  var _isBroker = false;     // Is principal broker (Maya)
  var _isAgent = false;      // Is agent
  var _isClient = false;     // Is client (buyer/seller/renter/landlord)
  var _portalRole = null;    // 'buyer' | 'seller' | 'renter' | 'landlord' | null

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    // Configure API for non-production
    var origin = window.location.origin;
    if (origin.indexOf('mallan.nyc') === -1) {
      MallanAPI.configure({ baseUrl: 'https://mallan.nyc' });
    }

    // Handle 401 — redirect to login
    window.addEventListener('mallan:auth:unauthorized', function () {
      window.location.href = '/crm/login.html';
    });

    // Check authentication
    MallanAPI.init().then(function (data) {
      if (!data.authenticated) {
        window.location.href = '/crm/login.html';
        return;
      }

      _ctx = data;
      _isBroker = data.role === 'broker' || data.role === 'admin';
      _isAgent = data.principalType === 'agent' || _isBroker;
      _isClient = data.principalType === 'client';
      _portalRole = data.portalRole || null;

      // Build UI
      renderSidebar();
      renderUserInfo();

      // Route based on role
      if (_isClient) {
        // Client portal view
        var hash = window.location.hash.replace('#', '');
        var role = _portalRole || hash || 'buyer';
        Portals.init(role);
      } else {
        // Agent/Broker CRM
        var panel = window.location.hash.replace('#', '') || 'dashboard';
        navigate(panel);
      }

      // Hide loading
      var ls = document.getElementById('loadingState');
      if (ls) ls.remove();

    }).catch(function () {
      window.location.href = '/crm/login.html';
    });

    // Global search
    var searchInput = document.getElementById('globalSearch');
    if (searchInput) {
      var debounce = null;
      searchInput.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () {
          var q = searchInput.value.trim();
          if (q.length >= 2) {
            navigate('clients', { search: q });
          }
        }, 300);
      });
    }
  }

  // ─── Navigation ───────────────────────────────────────────────────────────
  function navigate(panel, opts) {
    if (_isClient) return; // Clients don't navigate CRM panels

    _currentPanel = panel;
    window.location.hash = panel;

    // Update sidebar active state
    document.querySelectorAll('.sidebar-item[data-panel]').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-panel') === panel);
    });

    // Update title
    var titles = {
      dashboard: 'Dashboard',
      clients: 'Clients',
      pipeline: 'Pipeline',
      tasks: 'Tasks',
      listings: 'Listings',
      deals: 'Deals & Commissions',
      documents: 'Documents',
      agents: 'Agent Management'
    };
    var titleEl = document.getElementById('panelTitle');
    if (titleEl) titleEl.textContent = titles[panel] || panel;

    // Close mobile sidebar
    closeSidebar();

    // Render panel
    var content = document.getElementById('content');
    if (!content) return;
    content.innerHTML = '<div class="flex items-center justify-center h-32"><i class="fas fa-spinner fa-spin text-xl text-gold"></i></div>';

    switch (panel) {
      case 'dashboard': Panels.dashboard(content); break;
      case 'clients':   Panels.clients(content, opts); break;
      case 'pipeline':  Panels.pipeline(content); break;
      case 'tasks':     Panels.tasks(content); break;
      case 'listings':  Panels.listings(content); break;
      case 'deals':     Panels.deals(content); break;
      case 'documents': Panels.documents(content); break;
      case 'agents':    Panels.agents(content); break;
      default:          Panels.dashboard(content);
    }
  }

  // ─── Sidebar ──────────────────────────────────────────────────────────────
  function renderSidebar() {
    var nav = document.getElementById('sidebarNav');
    if (!nav) return;

    var items = [];

    if (_isAgent || _isBroker) {
      items.push({ section: 'Main' });
      items.push({ id: 'dashboard', icon: 'fa-chart-bar', label: 'Dashboard' });
      items.push({ id: 'clients', icon: 'fa-users', label: 'Clients' });
      items.push({ id: 'pipeline', icon: 'fa-stream', label: 'Pipeline' });
      items.push({ id: 'tasks', icon: 'fa-tasks', label: 'Tasks' });

      items.push({ section: 'Business' });
      items.push({ id: 'listings', icon: 'fa-building', label: 'Listings' });
      items.push({ id: 'deals', icon: 'fa-handshake', label: 'Deals & Commissions' });
      items.push({ id: 'documents', icon: 'fa-folder', label: 'Documents' });

      if (_isBroker) {
        items.push({ section: 'Admin' });
        items.push({ id: 'agents', icon: 'fa-user-tie', label: 'Agents' });
      }
    }

    var html = '';
    items.forEach(function (item) {
      if (item.section) {
        html += '<div class="sidebar-label">' + esc(item.section) + '</div>';
      } else {
        html += '<div class="sidebar-section">' +
          '<button class="sidebar-item" data-panel="' + item.id + '" onclick="CRM.navigate(\'' + item.id + '\')">' +
            '<i class="fas ' + item.icon + ' w-5 text-center text-xs"></i>' +
            '<span>' + esc(item.label) + '</span>' +
          '</button>' +
        '</div>';
      }
    });

    nav.innerHTML = html;
  }

  function renderUserInfo() {
    var container = document.getElementById('sidebarUser');
    if (!container || !_ctx || !_ctx.user) return;

    var user = _ctx.user;
    var name = user.name || user.first_name || user.email || 'User';
    var initials = name.split(' ').map(function (w) { return w[0]; }).join('').toUpperCase().substring(0, 2);
    var role = _isBroker ? 'Principal Broker' : _isAgent ? 'Agent' : (_portalRole || 'Client');

    container.innerHTML =
      '<div class="sidebar-user-avatar">' + esc(initials) + '</div>' +
      '<div class="sidebar-user-info">' +
        '<div class="sidebar-user-name">' + esc(name) + '</div>' +
        '<div class="sidebar-user-role">' + esc(role) + '</div>' +
      '</div>';
  }

  // ─── Sidebar Toggle (Mobile) ──────────────────────────────────────────────
  function toggleSidebar() {
    var sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('open');
  }

  function closeSidebar() {
    var sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('open');
  }

  // ─── Toast ────────────────────────────────────────────────────────────────
  function toast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toasts');
    if (!container) return;

    var icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
    var colors = { success: '#059669', error: '#DC2626', info: '#2563EB', warning: '#F59E0B' };

    var el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.innerHTML = '<i class="fas ' + (icons[type] || icons.info) + '" style="color:' + (colors[type] || colors.info) + ';font-size:15px;"></i>' +
      '<span>' + esc(message) + '</span>';

    container.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      el.style.transition = 'all 0.3s';
      setTimeout(function () { el.remove(); }, 300);
    }, 4000);
  }

  // ─── Modal ────────────────────────────────────────────────────────────────
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

  // ─── Notifications ────────────────────────────────────────────────────────
  function showNotifications() {
    openModal('Notifications',
      '<div class="empty-state"><i class="fas fa-bell"></i><p>No new notifications</p></div>'
    );

    // Try to load real notifications
    MallanAPI._fetch('/api/crm/notifications').then(function (data) {
      var body = document.getElementById('modalBody');
      if (!body || !data.notifications || data.notifications.length === 0) return;

      var html = '<div class="space-y-3">';
      data.notifications.forEach(function (n) {
        html += '<div class="flex gap-3 p-3 rounded-lg ' + (n.read ? 'bg-white' : 'bg-blue-50') + ' border border-gray-100">' +
          '<div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">' +
            '<i class="fas fa-bell text-xs text-gray-500"></i>' +
          '</div>' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm font-medium text-gray-900">' + esc(n.title || 'Notification') + '</p>' +
            '<p class="text-xs text-gray-500 mt-0.5">' + esc(n.message || '') + '</p>' +
            '<p class="text-xs text-gray-400 mt-1">' + formatTimeAgo(n.created_at) + '</p>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
      body.innerHTML = html;
    }).catch(function () { /* keep empty state */ });
  }

  // ─── Logout ───────────────────────────────────────────────────────────────
  function logout() {
    MallanAPI.auth.logout().finally(function () {
      window.location.href = '/crm/login.html';
    });
  }

  // ─── Utilities ────────────────────────────────────────────────────────────
  function esc(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function formatMoney(amount) {
    if (amount == null || isNaN(amount)) return '$0';
    return '$' + Number(amount).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    var now = Date.now();
    var then = new Date(dateStr).getTime();
    var diff = Math.floor((now - then) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return formatDate(dateStr);
  }

  function roleBadge(role) {
    var cls = 'badge badge-' + (role || 'buyer');
    return '<span class="' + cls + '">' + esc(role || 'buyer') + '</span>';
  }

  function statusBadge(status) {
    var cls = 'badge badge-' + (status || 'active');
    return '<span class="' + cls + '">' + esc(status || 'active') + '</span>';
  }

  function stageBadge(stage) {
    var colors = {
      new: '#6b7280', contacted: '#3b82f6', nurturing: '#8b5cf6',
      active: '#059669', showing: '#f59e0b', offer: '#f97316',
      deal: '#10b981', closed: '#059669', past: '#9ca3af'
    };
    var color = colors[stage] || '#6b7280';
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;font-size:10px;font-weight:700;border-radius:6px;background:' + color + '15;color:' + color + ';text-transform:uppercase;">' + esc(stage || 'new') + '</span>';
  }

  // Photo URL helper — use proxy for Trestle photos
  function photoUrl(url) {
    if (!url) return '';
    if (url.indexOf('trestle') !== -1 || url.indexOf('corelogic') !== -1 || url.indexOf('cotality') !== -1) {
      return '/api/media/proxy?url=' + encodeURIComponent(url);
    }
    return url;
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    init: init,
    navigate: navigate,
    toggleSidebar: toggleSidebar,
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    showNotifications: showNotifications,
    logout: logout,

    // Utilities
    esc: esc,
    formatMoney: formatMoney,
    formatDate: formatDate,
    formatTimeAgo: formatTimeAgo,
    roleBadge: roleBadge,
    statusBadge: statusBadge,
    stageBadge: stageBadge,
    photoUrl: photoUrl,

    // State getters
    get ctx() { return _ctx; },
    get isBroker() { return _isBroker; },
    get isAgent() { return _isAgent; },
    get isClient() { return _isClient; },
    get currentPanel() { return _currentPanel; },
    get user() { return _ctx ? _ctx.user : null; },
  };
})();

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', CRM.init);
