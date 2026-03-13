// ─── BEHAVIOR MODE (6 tests) ─ Edge Cases & UI ─────────────────────
function REBNYBehaviorTest(options) {
    options = options || {};
    var runActive = options.runActive || false;
    var results = [];
    var passed = 0, failed = 0, warnings = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++; else if (status === 'FAIL') failed++; else if (status !== 'SKIP') warnings++;
    }

    // ── B1: Zero-Result Test (ACTIVE) ──────────────────────────────────
    (function() {
        if (!runActive) { addResult('B1', 'Zero-Result', 'SKIP', 'Active test — click "Run Active Tests"'); return; }
        if (typeof filterListings !== 'function' || typeof listings === 'undefined') { addResult('B1', 'Zero-Result', 'FAIL', 'Required: filterListings function and listings array both must exist'); return; }
        var r = filterListings(listings, { priceMin: 999999999, priceMax: 1, searchTab: 'sale' });
        var noErr = true;
        try { r.slice().sort(function(a,b){return a.price-b.price;}); } catch(e) { noErr = false; }
        addResult('B1', 'Zero-Result', (r.length === 0 && noErr) ? 'PASS' : 'FAIL', r.length === 0 ? 'Impossible criteria → 0 results, no error' : 'Got ' + r.length + ' results');
    })();

    // ── B2: High Volume Test (ACTIVE) ──────────────────────────────────
    (function() {
        if (!runActive) { addResult('B2', 'High Volume', 'SKIP', 'Active test — click "Run Active Tests"'); return; }
        if (typeof listings === 'undefined' || typeof getFilteredListings !== 'function') { addResult('B2', 'High Volume', 'FAIL', 'Required globals missing: listings and getFilteredListings must exist'); return; }
        var origLen = listings.length, tpl = listings[0];
        for (var i = 0; i < 200; i++) { var f = {}; for (var k in tpl) { if (tpl.hasOwnProperty(k)) f[k] = tpl[k]; } f.id = 90000+i; f.lid = 'FAKE-'+i; f.price = Math.floor(Math.random()*5e6)+5e5; listings.push(f); }
        var t0 = performance.now();
        var pg = getFilteredListings(false);
        var all = getFilteredListings(true);
        var ms = Math.round(performance.now() - t0);
        listings.splice(origLen);
        var pgOK = pg.length <= (searchResultsState.perPage || 50);
        addResult('B2', 'High Volume', (pgOK && ms < 500) ? 'PASS' : 'FAIL', '200+ listings: ' + pg.length + '/' + all.length + ' paginated, ' + ms + 'ms (limit: 500ms, page size: ' + (searchResultsState.perPage || 50) + ')');
    })();

    // ── B3: Rapid Toggle Test (ACTIVE) ─────────────────────────────────
    (function() {
        if (!runActive) { addResult('B3', 'Rapid Toggle', 'SKIP', 'Active test — click "Run Active Tests"'); return; }
        if (typeof toggleSearchTab !== 'function') { addResult('B3', 'Rapid Toggle', 'FAIL', 'toggleSearchTab function missing — required for tab switching'); return; }
        var orig = currentSearchTab, err = null;
        try { toggleSearchTab('sale'); toggleSearchTab('rent'); toggleSearchTab('sale'); toggleSearchTab('rent'); toggleSearchTab('building'); toggleSearchTab('sale'); } catch(e) { err = e.message; }
        var after = currentSearchTab;
        addResult('B3', 'Rapid Toggle', (!err && after === 'sale') ? 'PASS' : 'FAIL', err ? 'Error: ' + err : '6 rapid switches, final tab="' + after + '" (expected "sale")');
        if (orig !== 'sale') { try { toggleSearchTab(orig); } catch(e) {} }
    })();

    // ── B4: Authorization & Role Test ──────────────────────────────────
    (function() {
        if (typeof LOGGED_IN_AGENT === 'undefined') { addResult('B4', 'Authorization & Role', 'FAIL', 'LOGGED_IN_AGENT missing'); return; }
        var role = LOGGED_IN_AGENT.role, issues = [];
        if (role === 'agent') {
            ['complianceDashboard','agentManagement','brokerCommissionSplits','allListingsSection'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el && el.offsetParent !== null && el.style.display !== 'none') issues.push('Agent sees #' + id);
            });
        }
        if (!role || (role !== 'broker' && role !== 'agent')) issues.push('Invalid role: "' + role + '"');
        addResult('B4', 'Authorization & Role', issues.length === 0 ? 'PASS' : 'FAIL', issues.length === 0 ? 'Role "' + role + '" verified' : issues.join('; '));
    })();

    // ── B5: Layout Breakpoint Test ─────────────────────────────────────
    (function() {
        var checks = [], issues = [], html = document.documentElement.innerHTML;
        if (html.indexOf('@media print') !== -1) checks.push('print-css');
        if (html.indexOf('sm:') !== -1 && html.indexOf('md:') !== -1 && html.indexOf('lg:') !== -1) checks.push('responsive');
        else issues.push('Missing responsive classes');
        if (document.body.innerHTML.indexOf('REBNY Listing Service') !== -1 || document.body.innerHTML.indexOf('REBNY RLS') !== -1) checks.push('attribution');
        else issues.push('Attribution not found');
        if (document.getElementById('searchBasicMode') || document.getElementById('searchAdvancedMode')) checks.push('filters');
        if (html.indexOf('page-break-inside') !== -1) checks.push('page-breaks');
        addResult('B5', 'Layout Breakpoint', issues.length === 0 ? 'PASS' : 'FAIL', issues.length === 0 ? 'All checks pass: ' + checks.join(', ') : issues.join('; '));
    })();

    // ── B6: CMA/Comps Integrity ────────────────────────────────────────
    (function() {
        var checks = [], issues = [];
        ['openCompPage','showCompResults','toggleCompSaleRent','backToCompSelection'].forEach(function(fn) {
            if (typeof window[fn] === 'function') checks.push(fn); else issues.push(fn + ' missing');
        });
        if (document.getElementById('comparablesSelectionPage')) checks.push('comp-UI');
        if (document.querySelectorAll('[id*="btnCompSale"]').length > 0) checks.push('sale/rent-toggle');
        addResult('B6', 'CMA/Comps Integrity', issues.length === 0 ? 'PASS' : 'FAIL', issues.length === 0 ? checks.length + ' comp checks pass' : issues.length + ' missing: ' + issues.join(', '));
    })();

    return { mode: 'behavior', results: results, summary: { passed: passed, failed: failed, warnings: warnings, total: results.length } };
}
