// ═══════════════════════════════════════════════════════════════════════════════
// CRM ROUTER — Hash-based routing for dashboard.html
// Routes: #/broker/*, #/ops/*, #/settings/*, #/workspace/client/:id/*, #/workspace/listing/:id/*
// ═══════════════════════════════════════════════════════════════════════════════
/* global Store, Permissions */

var Router = (function () {
  'use strict';

  var _routes = {};    // pattern → handler
  var _current = null; // current parsed route
  var _beforeHooks = [];

  // ─── Route Registration ──────────────────────────────────────────────
  function register(pattern, handler) {
    _routes[pattern] = handler;
  }

  // ─── Route matching ──────────────────────────────────────────────────
  function _match(hash) {
    // Clean hash
    var path = (hash || '').replace(/^#\/?/, '/');
    if (!path || path === '/') path = '/ops/dashboard';

    // Try exact match first
    if (_routes[path]) {
      return { handler: _routes[path], params: {}, path: path };
    }

    // Try parameterized routes
    var patterns = Object.keys(_routes);
    for (var i = 0; i < patterns.length; i++) {
      var pattern = patterns[i];
      if (pattern.indexOf(':') === -1) continue;

      var parts = pattern.split('/');
      var hashParts = path.split('/');
      if (parts.length !== hashParts.length) continue;

      var params = {};
      var match = true;
      for (var j = 0; j < parts.length; j++) {
        if (parts[j].charAt(0) === ':') {
          params[parts[j].substring(1)] = decodeURIComponent(hashParts[j]);
        } else if (parts[j] !== hashParts[j]) {
          match = false;
          break;
        }
      }

      if (match) {
        return { handler: _routes[pattern], params: params, path: path };
      }
    }

    return null;
  }

  // ─── Content-pane ownership ────────────────────────────────────
  // A panel that paints AFTER an await must not reach the screen once the operator has moved on.
  //
  // Production defect, 2026-09-09: the Property Search tab rendered the Ops Dashboard body. Property
  // Search was not broken - it had been painted over. HomeScreen.render() captures the pane, issues
  // eight API calls, and writes _renderCards(c, ...) when they resolve ~2s later, without re-checking
  // the route. Any panel that paints synchronously loses that race, every time.
  //
  // The fix belongs here rather than in each of the ~40 panels: navigating RETIRES the pane and installs
  // a fresh node carrying the same id and layout classes. A renderer still holding the previous node
  // writes into a detached element, so a late reply can no longer overwrite the panel that replaced it.
  // The retired node keeps `data-retired-route` so a stale write is identifiable when debugging.
  function _retirePane(outgoingPath) {
    var old = document.getElementById('content');
    if (!old || !old.parentNode) return;
    var fresh = old.cloneNode(false); // same tag and attributes, no children
    old.removeAttribute('id');        // a stale getElementById('content') must never find the old pane
    old.setAttribute('data-retired-route', outgoingPath || '');
    old.parentNode.replaceChild(fresh, old);
  }

  // ─── Navigation ──────────────────────────────────────────────────────
  function navigate(path, opts) {
    opts = opts || {};

    // Normalize
    if (path.charAt(0) !== '/') path = '/' + path;

    // Set hash (triggers hashchange)
    if (!opts.silent) {
      window.location.hash = '#' + path;
    } else {
      _handleRoute('#' + path);
    }
  }

  function _handleRoute(hash) {
    var result = _match(hash);

    if (!result) {
      // Fallback to ops dashboard
      console.warn('[Router] No match for', hash, '— falling back to /ops/dashboard');
      navigate('/ops/dashboard');
      return;
    }

    // Check permissions — broker routes require broker
    if (result.path.indexOf('/broker/') === 0 && !Permissions.canSeeBrokerConsole()) {
      console.warn('[Router] Access denied to broker route');
      navigate('/ops/dashboard');
      return;
    }

    // Run before hooks
    for (var i = 0; i < _beforeHooks.length; i++) {
      if (_beforeHooks[i](result) === false) return;
    }

    // Retire the outgoing panel's content pane BEFORE the new handler paints (see _retirePane).
    _retirePane(_current ? _current.path : null);

    _current = result;
    Store.setRoute(result.path);

    // Execute handler
    try {
      result.handler(result.params);
    } catch (err) {
      console.error('[Router] Handler error:', err);
    }
  }

  // ─── Init ────────────────────────────────────────────────────────────
  function init() {
    window.addEventListener('hashchange', function () {
      _handleRoute(window.location.hash);
    });
  }

  function start() {
    var hash = window.location.hash;
    if (!hash || hash === '#' || hash === '#/') {
      // Default route based on role
      if (Store.isBroker() && !Store.isImpersonating()) {
        navigate('/broker/dashboard');
      } else {
        navigate('/ops/dashboard');
      }
    } else {
      _handleRoute(hash);
    }
  }

  function beforeEach(fn) {
    _beforeHooks.push(fn);
  }

  function current() { return _current; }

  function currentPath() { return _current ? _current.path : null; }

  function currentParams() { return _current ? _current.params : {}; }

  // ─── Utility: check if a sidebar item is active ──────────────────────
  function isActive(path) {
    if (!_current) return false;
    return _current.path === path || _current.path.indexOf(path + '/') === 0;
  }

  return {
    register: register,
    navigate: navigate,
    init: init,
    start: start,
    beforeEach: beforeEach,
    current: current,
    currentPath: currentPath,
    currentParams: currentParams,
    isActive: isActive,
  };
})();
