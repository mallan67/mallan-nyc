// ═══════════════════════════════════════════════════════════════════════════════════════════════
// CRM ROUTING — THE ONE HASHCHANGE OWNER
//
// The CRM has two hash namespaces, and until 2026-09-09 it had two independent routers listening to
// the same address bar:
//
//   search / listing   #main  #results  #detail/<id>  #my  #last  #manage      (NO leading slash)
//                      owned by js/init/init-hash-routing.js
//   brokerage panels   #/broker/*  #/ops/*  #/settings/*  #/workspace/...      (LEADING slash)
//                      owned by js/dashboard/router.js, in the duplicate shell
//
// Loading both listeners into one page is the trap this module exists to avoid. Each router treats
// the other's hashes as unknown AND has a default: init-hash-routing falls back to route 'main', so
// "#/ops/tasks" would also be handled as "show the search form"; Router._handleRoute falls back to
// /ops/dashboard, so "#results" would also navigate to the ops dashboard. Search state restoration,
// listing detail, browser back/forward and Manage Listings all sit on that path. Fixing duplication
// by introducing an interaction bug is the cycle this convergence exists to end.
//
// So: ONE listener, here. It dispatches on the leading slash and hands each hash to exactly one side.
// The parameterised route matcher is the proven one from js/dashboard/router.js, moved rather than
// reimplemented, so migrated panels keep working unchanged.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

var CrmRouting = (function () {
    'use strict';

    var _routes = {};          // '/ops/tasks' or '/workspace/client/:id/overview' -> handler
    var _beforeHooks = [];
    var _installed = false;
    var _current = null;       // { path, params } of the last panel route handled
    var _onSearchRoute = null; // the search side's handler, injected at install()
    var _onUnknownPanel = null;
    var _contentId = 'content';

    // ─── Registration ────────────────────────────────────────────────────────
    function registerPanel(pattern, handler) { _routes[pattern] = handler; }
    function beforeEach(fn) { _beforeHooks.push(fn); }

    /** A hash belongs to the brokerage panels when, and only when, it starts with a slash. */
    function isPanelHash(hash) {
        return String(hash == null ? '' : hash).replace(/^#/, '').charAt(0) === '/';
    }

    // ─── Matching (from js/dashboard/router.js — proven, not rewritten) ──────
    function match(path) {
        if (!path || path === '/') return null;
        if (_routes[path]) return { handler: _routes[path], params: {}, path: path };

        var patterns = Object.keys(_routes);
        for (var i = 0; i < patterns.length; i++) {
            var pattern = patterns[i];
            if (pattern.indexOf(':') === -1) continue;

            var parts = pattern.split('/');
            var hashParts = path.split('/');
            if (parts.length !== hashParts.length) continue;

            var params = {};
            var ok = true;
            for (var j = 0; j < parts.length; j++) {
                if (parts[j].charAt(0) === ':') {
                    params[parts[j].substring(1)] = decodeURIComponent(hashParts[j]);
                } else if (parts[j] !== hashParts[j]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return { handler: _routes[pattern], params: params, path: path };
        }
        return null;
    }

    // ─── Content-pane ownership (from js/dashboard/router.js) ────────────────
    //
    // A panel that paints AFTER an await must not reach the screen once the operator has moved on.
    // Production defect 2026-09-09: the Property Search tab showed the Ops Dashboard body because
    // HomeScreen's eight fetches resolved ~2s after the operator had navigated away and wrote into
    // the pane anyway. Navigating RETIRES the pane and installs a fresh node with the same id and
    // classes, so a stale reference writes into a detached element and nothing paints over the panel
    // that replaced it.
    function _retirePane(outgoingPath) {
        var old = document.getElementById(_contentId);
        if (!old || !old.parentNode) return;
        var fresh = old.cloneNode(false);
        old.removeAttribute('id');
        old.setAttribute('data-retired-route', outgoingPath || '');
        old.parentNode.replaceChild(fresh, old);
    }

    // ─── Dispatch ────────────────────────────────────────────────────────────
    function _handlePanelRoute(path) {
        var result = match(path);
        if (!result) {
            // Never hand an unrecognised brokerage route to the search side: it would render the
            // search form under a brokerage URL and look like Search "randomly" appearing.
            if (typeof _onUnknownPanel === 'function') { _onUnknownPanel(path); return; }
            if (typeof console !== 'undefined' && console.warn) console.warn('[CrmRouting] no panel for', path);
            return;
        }

        // Route permissions, preserved from the dashboard router. Absent Permissions = no gate.
        if (path.indexOf('/broker/') === 0 &&
            typeof Permissions !== 'undefined' && Permissions &&
            typeof Permissions.canSeeBrokerConsole === 'function' &&
            !Permissions.canSeeBrokerConsole()) {
            if (typeof console !== 'undefined' && console.warn) console.warn('[CrmRouting] access denied', path);
            return;
        }

        for (var i = 0; i < _beforeHooks.length; i++) {
            if (_beforeHooks[i](result) === false) return;
        }

        _retirePane(_current ? _current.path : null);
        _current = { path: result.path, params: result.params };
        if (typeof Store !== 'undefined' && Store && typeof Store.setRoute === 'function') Store.setRoute(result.path);

        try {
            result.handler(result.params);
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) console.error('[CrmRouting] handler error:', err);
        }
    }

    function _dispatch() {
        var hash = (typeof window !== 'undefined' && window.location) ? window.location.hash : '';
        var raw = String(hash == null ? '' : hash).replace(/^#/, '');
        if (isPanelHash(hash)) { _handlePanelRoute(raw); return; }
        // Everything without a leading slash is the search/listing side's business - including a hash
        // it does not recognise. It owns its own default; this module must not guess on its behalf.
        if (typeof _onSearchRoute === 'function') _onSearchRoute(raw);
    }

    // ─── Install — idempotent, and the ONLY hashchange registration ──────────
    function install(opts) {
        opts = opts || {};
        if (typeof opts.onSearchRoute === 'function') _onSearchRoute = opts.onSearchRoute;
        if (typeof opts.onUnknownPanelRoute === 'function') _onUnknownPanel = opts.onUnknownPanelRoute;
        if (opts.contentId) _contentId = opts.contentId;

        // Installing twice must not add a second listener - that is the whole point of this module.
        if (_installed) return;
        _installed = true;
        window.addEventListener('hashchange', _dispatch);
    }

    /** Run the handler for whatever is in the bar right now (used at boot, after install). */
    function start() { _dispatch(); }

    function navigate(path, opts) {
        opts = opts || {};
        if (path.charAt(0) !== '/') path = '/' + path;
        if (opts.silent) { _handlePanelRoute(path); return; }
        if (window.location.hash === '#' + path) { _handlePanelRoute(path); return; } // no hashchange fires
        window.location.hash = '#' + path;
    }

    function currentPath() { return _current ? _current.path : null; }
    function currentParams() { return _current ? _current.params : {}; }
    function isActive(path) {
        if (!_current) return false;
        return _current.path === path || _current.path.indexOf(path + '/') === 0;
    }
    function registeredPanels() { return Object.keys(_routes).slice(); }

    return {
        registerPanel: registerPanel,
        beforeEach: beforeEach,
        install: install,
        start: start,
        navigate: navigate,
        match: match,
        isPanelHash: isPanelHash,
        currentPath: currentPath,
        currentParams: currentParams,
        isActive: isActive,
        registeredPanels: registeredPanels,
    };
})();

if (typeof window !== 'undefined') window.CrmRouting = CrmRouting;
