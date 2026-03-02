// ═══════════════════════════════════════════════════════════════════════════════
// API CLIENT — Bridge between CRM mockup and Next.js backend
// Must be loaded BEFORE agent-context.js so session data is available.
//
// Sprint 9: Bearer token auth for cross-origin (GitHub Pages → mallan.nyc).
// All methods call real endpoints. No mock fallback in production.
// ═══════════════════════════════════════════════════════════════════════════════

var MallanAPI = (function () {
  'use strict';

  // ─── Configuration ───────────────────────────────────────────────────────
  var _baseUrl = ''; // Same origin when served from Next.js; set via MallanAPI.configure()
  var _token = null; // In-memory only (NEVER persisted to localStorage — XSS safe)
  var _user = null;  // Populated by init()
  var _context = null; // Full /api/auth/me response (principalType, role, portalRole, user)
  var _ready = false;
  var _readyCallbacks = [];

  // ─── Token handling (memory-only) ──────────────────────────────────────
  // Auth uses HttpOnly session_token cookie (set by server, sent via credentials: 'include').
  // _token is kept in memory ONLY for the current page session — never written to storage.
  // On page refresh, auth is re-established via the HttpOnly cookie → /api/auth/me.

  function _saveToken(token) {
    if (token) { _token = token; }
  }

  function _clearToken() {
    _token = null;
    // Clean up any legacy localStorage token from previous versions
    try { localStorage.removeItem('mallan_session_token'); } catch (e) { /* ok */ }
  }

  // Clean up any legacy localStorage token on load
  try { localStorage.removeItem('mallan_session_token'); } catch (e) { /* ok */ }

  // ─── Internal helpers ────────────────────────────────────────────────────

  /**
   * Core fetch wrapper. Sends Bearer token + credentials (cookies).
   * Handles 401 → dispatch unauthorized event.
   */
  function _fetch(path, options) {
    options = options || {};
    var url = _baseUrl + path;

    var headers = Object.assign({}, options.headers || {});
    if (options.body && typeof options.body === 'string') {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
    // Attach Bearer token if available
    if (_token) {
      headers['Authorization'] = 'Bearer ' + _token;
    }

    return fetch(url, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body || undefined,
      credentials: 'include',  // Send session_token cookie (same-origin)
    }).then(function (res) {
      if (res.status === 401) {
        console.warn('[MallanAPI] 401 Unauthorized — redirecting to login');
        _clearToken();
        window.dispatchEvent(new CustomEvent('mallan:auth:unauthorized'));
        return Promise.reject(new Error('Unauthorized'));
      }
      if (res.status === 403) {
        console.warn('[MallanAPI] 403 Forbidden');
        return Promise.reject(new Error('Access denied'));
      }
      if (!res.ok) {
        return res.json().then(function (data) {
          return Promise.reject(new Error(data.error || 'Request failed: ' + res.status));
        }).catch(function () {
          return Promise.reject(new Error('Request failed: ' + res.status));
        });
      }
      return res.json();
    });
  }

  // ─── Auth methods ────────────────────────────────────────────────────────

  var auth = {
    /**
     * Login with email + password.
     * Stores Bearer token from response for cross-origin auth.
     */
    login: function (email, password, portalType) {
      return _fetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email,
          password: password,
          portalType: portalType || 'agent',
        }),
      }).then(function (data) {
        if (data.token) {
          _saveToken(data.token);
        }
        _user = data.user || null;
        _ready = true;
        return data;
      });
    },

    /**
     * Logout — destroy session, clear token.
     */
    logout: function () {
      return _fetch('/api/auth/logout', { method: 'POST' }).then(function () {
        _clearToken();
        _user = null;
        _context = null;
        _ready = false;
      }).catch(function () {
        // Clear local state even if API call fails
        _clearToken();
        _user = null;
        _context = null;
        _ready = false;
      });
    },

    /**
     * Get current authenticated user from session token.
     * @returns {Promise<{authenticated: boolean, user: object|null}>}
     */
    me: function () {
      return _fetch('/api/auth/me');
    },

    /**
     * Change password (authenticated).
     */
    changePassword: function (currentPassword, newPassword) {
      return _fetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: currentPassword,
          newPassword: newPassword,
        }),
      });
    },
  };

  // ─── Listings ────────────────────────────────────────────────────────────

  var listings = {
    list: function (params) {
      params = params || {};
      var qs = [];
      if (params.type) qs.push('type=' + encodeURIComponent(params.type));
      if (params.status) qs.push('status=' + encodeURIComponent(params.status));
      if (params.limit) qs.push('limit=' + params.limit);
      if (params.offset) qs.push('offset=' + params.offset);
      var query = qs.length ? '?' + qs.join('&') : '';
      return _fetch('/api/crm/listings' + query);
    },

    get: function (id) {
      return _fetch('/api/crm/listings/' + encodeURIComponent(id));
    },

    create: function (data) {
      return _fetch('/api/crm/listings', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    update: function (id, data) {
      return _fetch('/api/crm/listings/' + encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    updateStatus: function (id, newStatus) {
      return _fetch('/api/crm/listings/' + encodeURIComponent(id) + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
    },

    validate: function (id, data) {
      return _fetch('/api/crm/listings/' + encodeURIComponent(id) + '/validate', {
        method: 'POST',
        body: data ? JSON.stringify(data) : '{}',
      });
    },

    addPhotos: function (id, photos) {
      return _fetch('/api/crm/listings/' + encodeURIComponent(id) + '/photos', {
        method: 'POST',
        body: JSON.stringify({ photos: photos }),
      });
    },

    remove: function (id) {
      return _fetch('/api/crm/listings/' + encodeURIComponent(id), {
        method: 'DELETE',
      });
    },
  };

  // ─── Clients ────────────────────────────────────────────────────────────

  var clients = {
    list: function (params) {
      params = params || {};
      var qs = [];
      if (params.status) qs.push('status=' + encodeURIComponent(params.status));
      if (params.limit) qs.push('limit=' + params.limit);
      if (params.offset) qs.push('offset=' + params.offset);
      var query = qs.length ? '?' + qs.join('&') : '';
      return _fetch('/api/crm/clients' + query);
    },

    get: function (id) {
      return _fetch('/api/crm/clients/' + encodeURIComponent(id));
    },

    create: function (data) {
      return _fetch('/api/crm/clients', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    update: function (id, data) {
      return _fetch('/api/crm/clients/' + encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    invite: function (id, data) {
      return _fetch('/api/crm/clients/' + encodeURIComponent(id) + '/invite', {
        method: 'POST',
        body: JSON.stringify(data || {}),
      });
    },

    savePreferences: function (id, prefs) {
      return _fetch('/api/crm/clients/' + encodeURIComponent(id) + '/preferences', {
        method: 'PUT',
        body: JSON.stringify(prefs),
      });
    },

    recordAction: function (id, data) {
      return _fetch('/api/crm/clients/' + encodeURIComponent(id) + '/actions', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
  };

  // ─── Agents (broker-only) ────────────────────────────────────────────────

  var agents = {
    list: function () {
      return _fetch('/api/crm/agents');
    },

    create: function (data) {
      return _fetch('/api/crm/agents', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    update: function (id, data) {
      return _fetch('/api/crm/agents/' + encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    deactivate: function (id) {
      return _fetch('/api/crm/agents/' + encodeURIComponent(id), {
        method: 'DELETE',
      });
    },
  };

  // ─── Deals ──────────────────────────────────────────────────────────────

  var deals = {
    list: function (params) {
      params = params || {};
      var qs = [];
      if (params.status) qs.push('status=' + encodeURIComponent(params.status));
      if (params.limit) qs.push('limit=' + params.limit);
      if (params.offset) qs.push('offset=' + params.offset);
      var query = qs.length ? '?' + qs.join('&') : '';
      return _fetch('/api/crm/deals' + query);
    },

    get: function (id) {
      return _fetch('/api/crm/deals/' + encodeURIComponent(id));
    },

    create: function (data) {
      return _fetch('/api/crm/deals', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    update: function (id, data) {
      return _fetch('/api/crm/deals/' + encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    updateStatus: function (id, newStatus) {
      return _fetch('/api/crm/deals/' + encodeURIComponent(id) + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
    },
  };

  // ─── Portal (client-facing) ─────────────────────────────────────────────

  var portal = {
    me: function () {
      return _fetch('/api/portal/me');
    },

    listings: function () {
      return _fetch('/api/portal/listings');
    },

    react: function (listingId, action, comment) {
      return _fetch('/api/portal/listings/' + encodeURIComponent(listingId) + '/react', {
        method: 'POST',
        body: JSON.stringify({ action: action, comment: comment || null }),
      });
    },

    showings: function () {
      return _fetch('/api/portal/showings');
    },

    requestShowing: function (data) {
      return _fetch('/api/portal/showings', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    offers: function () {
      return _fetch('/api/portal/offers');
    },
  };

  // ─── Showings (CRM-side) ──────────────────────────────────────────────

  var showings = {
    list: function (params) {
      params = params || {};
      var qs = [];
      if (params.status) qs.push('status=' + encodeURIComponent(params.status));
      if (params.date_from) qs.push('date_from=' + encodeURIComponent(params.date_from));
      if (params.date_to) qs.push('date_to=' + encodeURIComponent(params.date_to));
      if (params.limit) qs.push('limit=' + params.limit);
      if (params.offset) qs.push('offset=' + params.offset);
      var query = qs.length ? '?' + qs.join('&') : '';
      return _fetch('/api/crm/showings' + query);
    },

    update: function (id, data) {
      return _fetch('/api/crm/showings/' + encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
  };

  // ─── Saved Searches ─────────────────────────────────────────────────────

  var savedSearches = {
    list: function () {
      return _fetch('/api/crm/saved-searches');
    },

    create: function (data) {
      return _fetch('/api/crm/saved-searches', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    get: function (id) {
      return _fetch('/api/crm/saved-searches/' + encodeURIComponent(id));
    },

    update: function (id, data) {
      return _fetch('/api/crm/saved-searches/' + encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    delete: function (id) {
      return _fetch('/api/crm/saved-searches/' + encodeURIComponent(id), {
        method: 'DELETE',
      });
    },

    execute: function (id, opts) {
      return _fetch('/api/crm/saved-searches/' + encodeURIComponent(id) + '/execute', {
        method: 'POST',
        body: JSON.stringify(opts || {}),
      });
    },
  };

  // ─── Email ────────────────────────────────────────────────────────────────

  var email = {
    send: function (data) {
      return _fetch('/api/crm/email', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    sendBulk: function (data) {
      return _fetch('/api/crm/email/bulk', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
  };

  // ─── Public API ──────────────────────────────────────────────────────────

  return {
    /**
     * Configure the API base URL and validate connection.
     * Call once before any API use.
     * @param {object} opts - { baseUrl: string }
     */
    configure: function (opts) {
      if (opts && opts.baseUrl) {
        _baseUrl = opts.baseUrl.replace(/\/$/, '');
      }
    },

    /**
     * Initialize — fetch current user from session token.
     * Populates MallanAPI.user and resolves with user data.
     * If not authenticated, resolves with { authenticated: false, user: null }.
     * @returns {Promise<{authenticated: boolean, user: object|null}>}
     */
    init: function () {
      return auth.me().then(function (data) {
        _user = data.user || null;
        _context = data;
        _ready = data.authenticated === true;
        _readyCallbacks.forEach(function (cb) { cb(_user); });
        _readyCallbacks = [];
        return data;
      }).catch(function (err) {
        console.warn('[MallanAPI] init failed:', err.message);
        _user = null;
        _context = { authenticated: false, principalType: null, role: null, portalRole: null, user: null };
        _ready = false;
        return _context;
      });
    },

    /**
     * Register a callback to fire when init completes.
     * If already initialized, fires immediately.
     */
    onReady: function (cb) {
      if (_ready) {
        cb(_user);
      } else {
        _readyCallbacks.push(cb);
      }
    },

    /** @returns {object|null} Current user (after init) */
    get user() { return _user; },

    /** @returns {boolean} Whether init has completed successfully */
    get isReady() { return _ready; },

    /** @returns {boolean} Whether a session exists (in-memory token or cookie) */
    get hasToken() { return !!_token || document.cookie.indexOf('session_token=') !== -1; },

    /**
     * Returns the full canonical context from /api/auth/me.
     * Shape: { authenticated, principalType, role, portalRole, user }
     * This is the ONLY source of truth for identity in the frontend.
     * @returns {object}
     */
    getContext: function () {
      return _context || {
        authenticated: false,
        principalType: null,
        role: null,
        portalRole: null,
        user: null,
      };
    },

    // Sub-modules
    auth: auth,
    listings: listings,
    clients: clients,
    agents: agents,
    deals: deals,
    portal: portal,
    showings: showings,
    savedSearches: savedSearches,
    email: email,

  };
})();
