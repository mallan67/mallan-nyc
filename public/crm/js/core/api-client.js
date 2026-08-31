// ═══════════════════════════════════════════════════════════════════════════════
// API CLIENT — Bridge between the CRM frontend and the Next.js backend.
// Must be loaded BEFORE agent-context.js so session data is available.
//
// Auth: HttpOnly session_token cookie (same-origin). No Bearer tokens.
// All methods call real endpoints. No fixture fallback in production.
// ═══════════════════════════════════════════════════════════════════════════════

var MallanAPI = (function () {
  'use strict';

  // ─── Configuration ───────────────────────────────────────────────────────
  var _baseUrl = ''; // Same origin when served from Next.js; set via MallanAPI.configure()
  var _user = null;  // Populated by init()
  var _context = null; // Full /api/auth/me response (principalType, role, portalRole, user)
  var _ready = false;
  var _readyCallbacks = [];

  // Clean up any legacy localStorage token from previous versions
  try { localStorage.removeItem('mallan_session_token'); } catch (e) { /* ok */ }

  // ─── Internal helpers ────────────────────────────────────────────────────

  /**
   * Core fetch wrapper. Sends credentials (cookies) for auth.
   * Handles 401 → dispatch unauthorized event.
   */
  function _fetch(path, options) {
    options = options || {};
    var url = _baseUrl + path;

    var headers = Object.assign({}, options.headers || {});
    if (options.body && typeof options.body === 'string') {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    return fetch(url, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body || undefined,
      credentials: 'include',  // Send session_token cookie (same-origin)
    }).then(function (res) {
      if (res.status === 401) {
        console.warn('[MallanAPI] 401 Unauthorized — redirecting to login');
        window.dispatchEvent(new CustomEvent('mallan:auth:unauthorized'));
        return Promise.reject(new Error('Unauthorized'));
      }
      if (res.status === 403) {
        console.warn('[MallanAPI] 403 Forbidden');
        return Promise.reject(new Error('Access denied'));
      }
      if (!res.ok) {
        // TWO FAILURES USED TO COLLAPSE INTO ONE.
        //
        // This was `res.json().then(reject(...)).catch(reject(generic))`. The
        // trailing .catch was meant for "the body is not JSON" — but a .catch
        // after a .then also catches whatever that .then REJECTS WITH, and the
        // .then rejected on purpose. So the deliberate rejection was captured
        // and overwritten by the generic one, and NO endpoint in the CRM has
        // ever shown a server error message. Everything read
        // "Request failed: 400".
        //
        // Parsing the body and building the rejection are now separate steps,
        // so a parse failure and an error response cannot be mistaken for each
        // other.
        return res
          .json()
          .then(function (data) { return data; }, function () { return null; })
          .then(function (data) {
            var err = new Error((data && data.error) || 'Request failed: ' + res.status);
            // Attached, not substituted: every caller reading err.message is
            // unaffected, and callers that can ACT on the detail can now reach
            // it. UNSUPPORTED_CRITERION carries the criterion name and the
            // offending values — the only two facts that tell a broker what to
            // change. Dropping them turned a precise refusal into "try again",
            // which for a refused criterion is advice that cannot ever work.
            err.status = res.status;
            if (data) {
              if (data.code) err.code = data.code;
              if (data.criterion) err.criterion = data.criterion;
              if (data.unsupportedValues) err.unsupportedValues = data.unsupportedValues;
              err.body = data;
            }
            return Promise.reject(err);
          });
      }
      return res.json();
    });
  }

  // ─── Auth methods ────────────────────────────────────────────────────────

  var auth = {
    /**
     * Login with email + password.
     * Server sets HttpOnly session_token cookie on success.
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
        if (data.mfa_required) return data; // Don't set user yet — MFA step pending
        _user = data.user || null;
        _ready = true;
        return data;
      });
    },

    /**
     * Verify MFA code after login returns mfa_required.
     */
    verifyMfa: function (mfaSession, code) {
      return _fetch('/api/auth/mfa/verify', {
        method: 'POST',
        body: JSON.stringify({
          mfa_session: mfaSession,
          code: code,
        }),
      }).then(function (data) {
        _user = data.user || null;
        _ready = true;
        return data;
      });
    },

    /**
     * Logout — destroy session on server, clear local state.
     *
     * PR-CRM.1b (2026-05-24) — also clears the deal-form session-scoped
     * upsert records (buyerDealRecord / tenantDealRecord) so that when
     * another agent logs in on the same browser tab, a subsequent deal
     * submission cannot PATCH the prior agent's deal via a stale dbId.
     * Pairs with the context-scoped PATCH check in BUYER-DEAL-FORM.html
     * and TENANT-DEAL-FORM.html that addresses the same Codex P1 finding
     * on the originally-merged PR #146 (commit f90b9e47).
     */
    logout: function () {
      function clearDealRecords() {
        try { sessionStorage.removeItem('buyerDealRecord'); } catch (e) { /* sessionStorage may be unavailable */ }
        try { sessionStorage.removeItem('tenantDealRecord'); } catch (e) { /* sessionStorage may be unavailable */ }
      }
      return _fetch('/api/auth/logout', { method: 'POST' }).then(function () {
        _user = null;
        _context = null;
        _ready = false;
        clearDealRecords();
      }).catch(function () {
        // Clear local state even if API call fails
        _user = null;
        _context = null;
        _ready = false;
        clearDealRecords();
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
     * PR-CRM.6 (2026-05-24) — stop an active impersonation session.
     * Backend (app/api/auth/impersonation/stop) writes an AuditEvent
     * ("impersonate_stop"), destroys the delegated session, and
     * clears the SESSION_COOKIE. Per the route's own doc:
     * "Broker must re-login with their own credentials" — the
     * original broker session cannot be restored because impersonation
     * overwrote the cookie at start.
     *
     * MUST go through _fetch so the call honors MallanAPI._baseUrl
     * + 401-unauthorized handling (same reason as agents.impersonate
     * above — Codex P1 on the original PR-CRM.6 commit).
     *
     * Response shape: { success: true, message: "..." }
     */
    stopImpersonation: function () {
      return _fetch('/api/auth/impersonation/stop', {
        method: 'POST',
      });
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

    /**
     * Upload a photo file for a listing.
     * @param {string} id - Listing ID
     * @param {File} file - Image file (JPEG, PNG, WebP, HEIC)
     * @param {string} [caption] - Optional caption
     * @param {number} [order] - Optional sort order
     * @returns {Promise} Upload result with URLs
     */
    uploadPhoto: function (id, file, caption, order) {
      var formData = new FormData();
      formData.append('file', file);
      if (caption) formData.append('caption', caption);
      if (order != null) formData.append('order', String(order));
      // Use raw fetch (not _fetch) to send multipart/form-data without JSON Content-Type
      return fetch('/api/crm/listings/' + encodeURIComponent(id) + '/media/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      }).then(function(res) {
        if (!res.ok) return res.json().then(function(err) { return Promise.reject(err); });
        return res.json();
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

    /**
     * PR-CRM.6 (2026-05-24) — start a server-side delegated impersonation
     * session for the given agent. Broker-only on the backend
     * (requireBroker); the server writes an AuditEvent ("impersonate_start"),
     * creates a 2-hour delegated agent session, and sets the SESSION_COOKIE
     * to the new token.
     *
     * MUST go through _fetch so the request honors MallanAPI._baseUrl
     * (the CRM may be served from a non-mallan.nyc origin while pointing
     * at https://mallan.nyc via agent-context.js) AND inherits the shared
     * 401-unauthorized handler. The pre-fix raw fetch('/api/crm/agents/.../
     * impersonate') bypassed both — flagged as P1 by Codex on the original
     * PR-CRM.6 commit.
     *
     * Response shape: { success: true, impersonating: { id, name, email, role } }
     */
    impersonate: function (agentId) {
      return _fetch('/api/crm/agents/' + encodeURIComponent(agentId) + '/impersonate', {
        method: 'POST',
      });
    },

    // Agent self-edit endpoints
    me: function () {
      return _fetch('/api/crm/agents/me');
    },

    updateMe: function (data) {
      return _fetch('/api/crm/agents/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
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
      // PR-CRM.3 — the backend now requires body.consent === true (422
      // otherwise). This wrapper is the canonical portal-action client
      // path: any call through `MallanAPI.portal.react()` is by
      // definition a user-initiated portal-UI button click (like /
      // dislike / discuss / schedule), which is the TCPA/CAN-SPAM
      // consent moment. Senders SHOULD only call this wrapper from a
      // user-action handler. If a future caller needs to react without
      // a fresh user action (e.g. a background scheduled retry), it
      // must NOT use this wrapper.
      return _fetch('/api/portal/listings/' + encodeURIComponent(listingId) + '/react', {
        method: 'POST',
        body: JSON.stringify({ action: action, comment: comment || null, consent: true }),
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
      if (params.type) qs.push('type=' + encodeURIComponent(params.type));
      if (params.limit) qs.push('limit=' + params.limit);
      if (params.offset) qs.push('offset=' + params.offset);
      var query = qs.length ? '?' + qs.join('&') : '';
      return _fetch('/api/crm/showings' + query);
    },

    create: function (data) {
      return _fetch('/api/crm/showings', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    update: function (id, data) {
      return _fetch('/api/crm/showings/' + encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
  };

  // ─── Past Deals ─────────────────────────────────────────────────────────

  var pastDeals = {
    list: function (params) {
      params = params || {};
      var qs = [];
      if (params.agent_id) qs.push('agent_id=' + encodeURIComponent(params.agent_id));
      if (params.deal_type) qs.push('deal_type=' + encodeURIComponent(params.deal_type));
      var query = qs.length ? '?' + qs.join('&') : '';
      return _fetch('/api/crm/past-deals' + query);
    },

    create: function (data) {
      return _fetch('/api/crm/past-deals', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    update: function (id, data) {
      return _fetch('/api/crm/past-deals/' + encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    remove: function (id) {
      return _fetch('/api/crm/past-deals/' + encodeURIComponent(id), {
        method: 'DELETE',
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

  // ─── CMA (Comparative Market Analysis) ──────────────────────────────────

  var cma = {
    list: function (params) {
      params = params || {};
      var qs = [];
      if (params.status) qs.push('status=' + encodeURIComponent(params.status));
      if (params.limit) qs.push('limit=' + params.limit);
      if (params.offset) qs.push('offset=' + params.offset);
      var query = qs.length ? '?' + qs.join('&') : '';
      return _fetch('/api/crm/cma' + query);
    },

    get: function (id) {
      return _fetch('/api/crm/cma/' + encodeURIComponent(id));
    },

    create: function (data) {
      return _fetch('/api/crm/cma', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
  };

  // ─── Listing Sends (send to client portal) ────────────────────────────

  var listingSends = {
    send: function (data) {
      return _fetch('/api/crm/listing-sends', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
  };

  // ─── IDX / Trestle RLS (read-only) ───────────────────────────────────────

  var idx = {
    /**
     * Search listings via Trestle/REBNY RLS.
     * Returns listings in CRM flat shape (same as listings).
     * @param {object} params - { type, minPrice, maxPrice, minBeds, minBaths, neighborhood, borough, status, limit, skip, minYear, maxYear, minFloors, maxFloors, minUnits, maxUnits, buildingName }
     */
    search: function (params) {
      params = params || {};
      var qs = [];
      if (params.type) qs.push('type=' + encodeURIComponent(params.type));
      if (params.minPrice) qs.push('minPrice=' + params.minPrice);
      if (params.maxPrice) qs.push('maxPrice=' + params.maxPrice);
      if (params.minBeds != null) qs.push('minBeds=' + params.minBeds);
      if (params.maxBeds != null) qs.push('maxBeds=' + params.maxBeds);
      if (params.minBaths) qs.push('minBaths=' + params.minBaths);
      if (params.maxBaths) qs.push('maxBaths=' + params.maxBaths);
      if (params.neighborhood) qs.push('neighborhood=' + encodeURIComponent(params.neighborhood));
      if (params.borough) qs.push('borough=' + encodeURIComponent(params.borough));
      if (params.status) qs.push('status=' + encodeURIComponent(params.status));
      if (params.propertySubType) qs.push('propertySubType=' + encodeURIComponent(params.propertySubType));
      if (params.address) qs.push('address=' + encodeURIComponent(params.address));
      if (params.listingId) qs.push('listingId=' + encodeURIComponent(params.listingId));
      if (params.zip) qs.push('zip=' + encodeURIComponent(params.zip));
      if (params.minRooms) qs.push('minRooms=' + params.minRooms);
      if (params.maxRooms) qs.push('maxRooms=' + params.maxRooms);
      if (params.minSqft) qs.push('minSqft=' + params.minSqft);
      if (params.maxSqft) qs.push('maxSqft=' + params.maxSqft);
      if (params.dateFrom) qs.push('dateFrom=' + encodeURIComponent(params.dateFrom));
      if (params.dateTo) qs.push('dateTo=' + encodeURIComponent(params.dateTo));
      if (params.dateType) qs.push('dateType=' + encodeURIComponent(params.dateType));
      if (params.closeDateFrom) qs.push('closeDateFrom=' + encodeURIComponent(params.closeDateFrom));
      if (params.closeDateTo) qs.push('closeDateTo=' + encodeURIComponent(params.closeDateTo));
      if (params.ownership) qs.push('ownership=' + encodeURIComponent(params.ownership));
      if (params.sponsorUnit) qs.push('sponsorUnit=' + encodeURIComponent(params.sponsorUnit));
      // Building-specific filters (OData: YearBuilt, StoriesTotal, NumberOfUnitsTotal)
      if (params.minYear) qs.push('minYear=' + params.minYear);
      if (params.maxYear) qs.push('maxYear=' + params.maxYear);
      if (params.minFloors) qs.push('minFloors=' + params.minFloors);
      if (params.maxFloors) qs.push('maxFloors=' + params.maxFloors);
      if (params.minUnits) qs.push('minUnits=' + params.minUnits);
      if (params.maxUnits) qs.push('maxUnits=' + params.maxUnits);
      if (params.buildingName) qs.push('buildingName=' + encodeURIComponent(params.buildingName));
      // KEYWORD AND UNIT: forwarded so they stop DISAPPEARING silently.
      //
      // Both were assigned by buildIdxSearchParams and forwarded by nothing, so
      // an agent typed a narrowing criterion, the browser dropped it, and the
      // search ran WIDER than asked with an HTTP 200 and nothing to say so.
      // That is the same defect financing had below, and it is fixed the same
      // way: transport the value and let the server give a truthful answer.
      //
      // The two answers differ, which is the point. `unit` now EXECUTES — it
      // maps to toupper(UnitNumber) eq, proven live 2026-08-31 and returning the
      // exact union of case variants. `keyword` is REFUSED by name, because
      // contains(PublicRemarks,...) never returns: five probes, every shape,
      // each aborting with no HTTP status. Forwarding it makes that refusal
      // reachable as a typed UNSUPPORTED_CRITERION instead of a criterion that
      // quietly evaporates between the form and the request.
      if (params.unit) qs.push('unit=' + encodeURIComponent(params.unit));
      if (params.keyword) qs.push('keyword=' + encodeURIComponent(params.keyword));
      // Maximum financing. BOTH bounds, and `!= null` rather than truthiness so a
      // legitimate 0 bound is not dropped as though it were absent.
      //
      // The canonical serializer emitted these and NOTHING forwarded them, so the
      // criterion died here — one hop after being built. The server refuses it by
      // name until Mallan-side execution exists; forwarding is what makes that
      // refusal reachable instead of the filter silently disappearing and the
      // broker receiving a wider result set with an HTTP 200.
      if (params.financingMin != null && params.financingMin !== '') qs.push('financingMin=' + params.financingMin);
      if (params.financingMax != null && params.financingMax !== '') qs.push('financingMax=' + params.financingMax);
      // checkboxFilters carries the amenity/feature/condition criteria. It was
      // ASSIGNED by buildIdxSearchParams and never forwarded, so every one of
      // those controls was silently inert. The server validates each field and
      // value against a closed live-verified registry, so transporting it does
      // NOT hand the browser an open field=value passthrough.
      if (params.checkboxFilters) qs.push('checkboxFilters=' + encodeURIComponent(params.checkboxFilters));
      if (params.sort) qs.push('sort=' + encodeURIComponent(params.sort));
      if (params.limit) qs.push('limit=' + params.limit);
      if (params.skip) qs.push('skip=' + params.skip);
      // 1-based page over the FINAL universe. Distinct from `skip`, which is a
      // PROVIDER offset and cannot express a broker page once gated and deduped
      // rows mean provider offset 50 is not the 51st result.
      if (params.page) qs.push('page=' + params.page);
      if (params.exactCount) qs.push('exactCount=true');
      // Opaque resume position. A caller must not construct one — it is only
      // ever echoed back from a previous response.
      if (params.continuation) qs.push('continuation=' + encodeURIComponent(params.continuation));
      var query = qs.length ? '?' + qs.join('&') : '';
      return _fetch('/api/idx/search' + query);
    },

    /**
     * Check IDX/Trestle status (broker-only).
     */
    status: function () {
      return _fetch('/api/idx/status');
    },

    /**
     * Ensure an IDX listing exists in the local DB.
     * If not found, creates a minimal record from the provided listing data.
     * Call this before showings.create() or listingSends.send() for IDX listings.
     * @param {object} listing - CRM flat listing object from search results
     * @returns {Promise<{ok: boolean, listing_id: string, db_id: string, created: boolean}>}
     */
    ensureListing: function (listing) {
      return _fetch('/api/idx/ensure-listing', {
        method: 'POST',
        body: JSON.stringify({
          listing_id: listing.lid || listing.id,
          address: listing.address,
          unit: listing.unit,
          price: listing.price,
          beds: listing.beds,
          baths: listing.baths,
          full_baths: listing.fullBaths,
          half_baths: listing.halfBaths,
          int_sqft: listing.intSqft,
          rooms: listing.rooms,
          year_built: listing.yearBuilt,
          neighborhood: listing.neighborhood,
          borough: listing.borough,
          zip: listing.zip,
          property_type: listing.propertyType,
          property_sub_type: listing.propertySubType,
          ownership: listing.ownership,
          status: listing.status,
          listing_category: listing.listingCategory,
          listing_type: listing.listingCategory === 'rental' ? 'rent' : 'sale',
          description: listing.description,
          agent_name: listing.agentName,
          agent_email: listing.agentEmail,
          agent_phone: listing.agentPhone,
          company: listing.company,
          latitude: listing.latitude,
          longitude: listing.longitude,
          cross_street: listing.crossStreet,
          images: listing.images,
          internet_display_yn: listing.internetDisplayYN,
          address_display_yn: listing.addressDisplayYN,
        }),
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

    /** @returns {boolean} Whether a session cookie exists */
    get hasToken() { return document.cookie.indexOf('session_token=') !== -1; },

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

    // Internal fetch — exposed for CRM modules (featured-config, analytics, etc.)
    _fetch: _fetch,

    // Sub-modules
    auth: auth,
    listings: listings,
    clients: clients,
    agents: agents,
    deals: deals,
    portal: portal,
    showings: showings,
    pastDeals: pastDeals,
    savedSearches: savedSearches,
    email: email,
    idx: idx,
    cma: cma,
    listingSends: listingSends,

  };
})();
