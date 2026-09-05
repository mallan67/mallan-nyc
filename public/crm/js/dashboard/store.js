// ═══════════════════════════════════════════════════════════════════════════════
// CRM STORE — Centralized state management
// 4 areas: session, UI, entities, views/filters
// ═══════════════════════════════════════════════════════════════════════════════

var Store = (function () {
  'use strict';

  // F1. Session State
  var session = {
    currentUser: null,
    currentRole: null,           // 'broker' | 'agent' | 'client'
    impersonatedAgentId: null,
    impersonatedAgent: null,     // full agent object when impersonating
    delegationActor: null,       // the REAL broker behind a delegated session
    delegationExpiresAt: null,   // ISO; the delegation's fixed 2h ceiling
    permissions: null,           // computed permissions object
    authStatus: 'pending',      // 'pending' | 'authenticated' | 'unauthenticated'
    portalRole: null,            // 'buyer' | 'seller' | 'renter' | 'landlord' | null
    principalType: null,        // 'agent' | 'client'
  };

  // F2. UI State
  var ui = {
    activeRoute: null,
    sidebarExpandedGroups: { broker: true, sales: true, rentals: true, ops: true, settings: false },
    sidebarOpen: false,          // mobile
    openModals: [],
    commandPaletteOpen: false,
    notificationPanelOpen: false,
    workspaceRightRailOpen: true,
    mobileBottomSheetState: 'collapsed', // 'collapsed' | 'expanded'
    loading: {},                 // { panelName: true/false }
  };

  // F3. Entities (cached data)
  var entities = {
    agents: [],
    leads: [],
    clients: [],
    listings: [],
    deals: [],
    referrals: [],
    tasks: [],
    documents: [],
    alerts: [],
    events: [],
    savedViews: [],
  };

  // F3b. Entity cache (typed cache with timestamps)
  var _entityCache = {
    agents: null,
    leads: null,
    clients: null,
    listings: null,
    deals: null,
    tasks: null,
  };
  var _cacheTimes = {};

  // F4. Views / Filters
  var views = {
    activeFiltersBySection: {},
    activeSavedViewBySection: {},
    tableColumnsBySection: {},
    sortBySection: {},
    groupBySection: {},
  };

  // F4b. Section filters (clients/listings/deals/pipeline)
  var filters = {
    clients: {},
    listings: {},
    deals: {},
    pipeline: {},
  };

  // F5. Saved Views subsystem
  var SAVED_VIEWS_KEY = 'mallan_crm_saved_views';

  function _loadSavedViewsFromStorage() {
    try {
      var raw = localStorage.getItem(SAVED_VIEWS_KEY);
      if (raw) {
        entities.savedViews = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[Store] Failed to load saved views from localStorage:', e);
      entities.savedViews = [];
    }
  }

  function _persistSavedViews() {
    try {
      localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(entities.savedViews));
    } catch (e) {
      console.warn('[Store] Failed to persist saved views:', e);
    }
  }

  function saveView(view) {
    if (!view || !view.id) return;
    var now = new Date().toISOString();
    var existing = null;
    for (var i = 0; i < entities.savedViews.length; i++) {
      if (entities.savedViews[i].id === view.id) {
        existing = i;
        break;
      }
    }
    var record = {
      id: view.id,
      ownerId: view.ownerId || getEffectiveAgentId(),
      entityType: view.entityType || 'clients',
      name: view.name || 'Untitled View',
      filters: view.filters || {},
      columns: view.columns || [],
      sort: view.sort || {},
      groupBy: view.groupBy || null,
      createdAt: existing !== null ? entities.savedViews[existing].createdAt : now,
      updatedAt: now,
    };
    if (existing !== null) {
      entities.savedViews[existing] = record;
    } else {
      entities.savedViews.push(record);
    }
    _persistSavedViews();
    emit('savedViews:changed', entities.savedViews);
    return record;
  }

  function deleteView(id) {
    entities.savedViews = entities.savedViews.filter(function (v) { return v.id !== id; });
    _persistSavedViews();
    emit('savedViews:changed', entities.savedViews);
  }

  function getViewsForSection(entityType) {
    var ownerId = getEffectiveAgentId();
    return entities.savedViews.filter(function (v) {
      return v.entityType === entityType && v.ownerId === ownerId;
    });
  }

  function applyView(viewId) {
    var view = null;
    for (var i = 0; i < entities.savedViews.length; i++) {
      if (entities.savedViews[i].id === viewId) { view = entities.savedViews[i]; break; }
    }
    if (!view) return null;
    var section = view.entityType;
    views.activeSavedViewBySection[section] = viewId;
    views.activeFiltersBySection[section] = view.filters || {};
    views.sortBySection[section] = view.sort || {};
    views.groupBySection[section] = view.groupBy || null;
    if (view.columns && view.columns.length) {
      views.tableColumnsBySection[section] = view.columns;
    }
    emit('filters:changed', { section: section, filters: view.filters });
    emit('view:applied', { section: section, viewId: viewId });
    return view;
  }

  function getActiveFilters(section) {
    return views.activeFiltersBySection[section] || filters[section] || {};
  }

  // ─── Entity caching helpers ─────────────────────────────────────────
  function cacheEntities(type, data) {
    if (!_entityCache.hasOwnProperty(type)) return;
    _entityCache[type] = data || [];
    _cacheTimes[type] = Date.now();
    emit('cache:' + type, _entityCache[type]);
  }

  function getCached(type) {
    return _entityCache[type] || null;
  }

  function clearCache(type) {
    if (type) {
      _entityCache[type] = null;
      delete _cacheTimes[type];
    } else {
      Object.keys(_entityCache).forEach(function (k) { _entityCache[k] = null; });
      _cacheTimes = {};
    }
    emit('cache:cleared', type || 'all');
  }

  // ─── Subscribers ─────────────────────────────────────────────────────────
  var _listeners = {};

  function on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
    return function off() {
      _listeners[event] = _listeners[event].filter(function (f) { return f !== fn; });
    };
  }

  function emit(event, data) {
    (_listeners[event] || []).forEach(function (fn) {
      try { fn(data); } catch (e) { console.error('[Store] listener error:', e); }
    });
  }

  // ─── Session helpers ─────────────────────────────────────────────────────
  function setSession(data) {
    session.currentUser = data.user || null;
    session.currentRole = data.role || null;
    session.principalType = data.principalType || null;
    session.portalRole = data.portalRole || null;
    session.authStatus = data.authenticated ? 'authenticated' : 'unauthenticated';
    hydrateDelegation(data.delegation);
    emit('session:changed', session);
  }

  // SERVER-SOURCED delegation state, from /api/auth/me.
  //
  // The old indicator was in-memory only: a page reload wiped it, leaving the
  // broker still delegated server-side with nothing on screen saying so. The
  // server is now the authority and this rehydrates from it on every boot, so
  // the "Viewing as ..." bar survives reloads, new tabs and deep links.
  //
  // Note what `currentUser` / `currentRole` hold during delegation: the AGENT.
  // That is deliberate — isBroker() is false, so the broker console hides and
  // every client-side gate evaluates with the agent's permissions, matching
  // what the server will enforce.
  function hydrateDelegation(delegation) {
    if (delegation && delegation.active && delegation.actingAs) {
      session.impersonatedAgentId = delegation.actingAs.id;
      session.impersonatedAgent = {
        id: delegation.actingAs.id,
        name: delegation.actingAs.name,
        role: delegation.actingAs.role
      };
      session.delegationActor = delegation.actor || null;
      session.delegationExpiresAt = delegation.expiresAt || null;
    } else {
      session.impersonatedAgentId = null;
      session.impersonatedAgent = null;
      session.delegationActor = null;
      session.delegationExpiresAt = null;
    }
  }

  function isBroker() {
    var r = (session.currentRole || '').toUpperCase();
    if (r === 'BROKER' || r === 'ADMIN') return true;
    return false;
  }

  function isAgent() {
    return session.principalType === 'agent' || isBroker();
  }

  function isClient() {
    return session.principalType === 'client';
  }

  // ─── Feature Flags ─────────────────────────────────────────────────────
  var _featureFlags = {};
  (function _loadFlags() {
    try {
      var raw = localStorage.getItem('mallan_crm_feature_flags');
      if (raw) _featureFlags = JSON.parse(raw);
    } catch (e) { /* ignore */ }
  })();

  function featureFlag(name) {
    return _featureFlags[name] === true;
  }

  function setFeatureFlag(name, value) {
    _featureFlags[name] = value;
    try { localStorage.setItem('mallan_crm_feature_flags', JSON.stringify(_featureFlags)); } catch (e) { /* quota */ }
    emit('featureflag:changed', { name: name, value: value });
  }

  function isImpersonating() {
    return session.impersonatedAgentId !== null;
  }

  function getEffectiveAgentId() {
    if (session.impersonatedAgentId) return session.impersonatedAgentId;
    return session.currentUser ? session.currentUser.id : null;
  }

  function startImpersonation(agent) {
    session.impersonatedAgentId = agent.id;
    session.impersonatedAgent = agent;
    emit('impersonation:started', agent);
    emit('session:changed', session);
  }

  function stopImpersonation() {
    var prev = session.impersonatedAgent;
    session.impersonatedAgentId = null;
    session.impersonatedAgent = null;
    emit('impersonation:ended', prev);
    emit('session:changed', session);
  }

  // ─── Entity cache helpers ────────────────────────────────────────────────
  function setEntities(type, data) {
    entities[type] = data || [];
    emit('entities:' + type, entities[type]);
  }

  function getEntities(type) {
    return entities[type] || [];
  }

  function addEntity(type, item) {
    entities[type] = entities[type] || [];
    entities[type].push(item);
    emit('entities:' + type, entities[type]);
  }

  function updateEntity(type, id, updates) {
    entities[type] = (entities[type] || []).map(function (item) {
      if (item.id === id) return Object.assign({}, item, updates);
      return item;
    });
    emit('entities:' + type, entities[type]);
  }

  function removeEntity(type, id) {
    entities[type] = (entities[type] || []).filter(function (item) { return item.id !== id; });
    emit('entities:' + type, entities[type]);
  }

  // ─── UI helpers ──────────────────────────────────────────────────────────
  function setRoute(route) {
    ui.activeRoute = route;
    emit('route:changed', route);
  }

  function setLoading(key, val) {
    ui.loading[key] = val;
    emit('loading:changed', { key: key, loading: val });
  }

  function toggleSidebarGroup(group) {
    ui.sidebarExpandedGroups[group] = !ui.sidebarExpandedGroups[group];
    emit('sidebar:changed', ui.sidebarExpandedGroups);
  }

  // ─── View/filter helpers ─────────────────────────────────────────────────
  function setFilters(section, filters) {
    views.activeFiltersBySection[section] = filters;
    emit('filters:changed', { section: section, filters: filters });
  }

  function getFilters(section) {
    return views.activeFiltersBySection[section] || {};
  }

  function setSort(section, sort) {
    views.sortBySection[section] = sort;
  }

  function getSort(section) {
    return views.sortBySection[section] || {};
  }

  // Init: load saved views from localStorage
  _loadSavedViewsFromStorage();

  return {
    session: session,
    ui: ui,
    entities: entities,
    views: views,
    filters: filters,

    on: on,
    emit: emit,

    setSession: setSession,
    isBroker: isBroker,
    isAgent: isAgent,
    isClient: isClient,
    isImpersonating: isImpersonating,
    getEffectiveAgentId: getEffectiveAgentId,
    startImpersonation: startImpersonation,
    stopImpersonation: stopImpersonation,
    hydrateDelegation: hydrateDelegation,

    setEntities: setEntities,
    getEntities: getEntities,
    addEntity: addEntity,
    updateEntity: updateEntity,
    removeEntity: removeEntity,

    // Entity caching
    cacheEntities: cacheEntities,
    getCached: getCached,
    clearCache: clearCache,

    setRoute: setRoute,
    setLoading: setLoading,
    toggleSidebarGroup: toggleSidebarGroup,

    setFilters: setFilters,
    getFilters: getFilters,
    getActiveFilters: getActiveFilters,
    setSort: setSort,
    getSort: getSort,

    // Feature flags
    featureFlag: featureFlag,
    setFeatureFlag: setFeatureFlag,

    // Saved views
    savedViews: entities.savedViews,
    saveView: saveView,
    deleteView: deleteView,
    getViewsForSection: getViewsForSection,
    applyView: applyView,
  };
})();
