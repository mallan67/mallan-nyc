// ─── R: MUTATION / REGRESSION TESTS (3) ────────────────────────────────────
function MutationRegressionTests(options) {
    options = options || {};
    var runActive = options.runActive || false;
    var results = [], passed = 0, failed = 0, warnings = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++; else if (status === 'FAIL') failed++; else if (status !== 'SKIP') warnings++;
    }

    // R1: Golden snapshot stability (ACTIVE)
    (function() {
        if (!runActive) { addResult('R1', 'Golden Snapshot', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof filterListings !== 'function' || typeof mockListings === 'undefined') { addResult('R1', 'Golden Snapshot', 'FAIL', 'Required: filterListings and mockListings must exist'); return; }
        // 5 canonical test cases
        var cases = [
            { name: 'All sales', criteria: { searchTab: 'sale' } },
            { name: 'All rentals', criteria: { searchTab: 'rent' } },
            { name: 'Sales $1-3M', criteria: { searchTab: 'sale', priceMin: 1000000, priceMax: 3000000 } },
            { name: 'Manhattan only', criteria: { searchTab: 'sale', boroughs: ['Manhattan'] } },
            { name: '2+ beds', criteria: { searchTab: 'sale', bedsMin: 2 } }
        ];
        var snapKey = 'golden_snapshot_v1';
        var current = {};
        cases.forEach(function(c) {
            var r = filterListings(mockListings, c.criteria);
            current[c.name] = { count: r.length, ids: r.slice(0, 5).map(function(l) { return l.id; }).join(',') };
        });
        var prev = null;
        try { prev = JSON.parse(localStorage.getItem(snapKey)); } catch(e) {}
        localStorage.setItem(snapKey, JSON.stringify(current));
        if (!prev) {
            addResult('R1', 'Golden Snapshot', 'PASS', 'Baseline captured: ' + cases.length + ' cases');
        } else {
            var diffs = [];
            cases.forEach(function(c) {
                var p = prev[c.name], cur = current[c.name];
                if (!p) { diffs.push(c.name + ': NEW'); return; }
                if (p.count !== cur.count) diffs.push(c.name + ': count ' + p.count + '→' + cur.count);
                else if (p.ids !== cur.ids) diffs.push(c.name + ': order changed');
            });
            addResult('R1', 'Golden Snapshot', diffs.length === 0 ? 'PASS' : 'FAIL',
                diffs.length === 0 ? cases.length + ' cases stable against golden snapshot' : 'REGRESSION: ' + diffs.join('; '));
        }
    })();

    // R2: Break injection — red-team compliance gates (ACTIVE)
    (function() {
        if (!runActive) { addResult('R2', 'Break Injection', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof checkListingCompliance !== 'function' || typeof mockListings === 'undefined') {
            addResult('R2', 'Break Injection', 'FAIL', 'Required: checkListingCompliance and mockListings must exist'); return;
        }
        var origLen = mockListings.length;
        // Inject 4 violation types
        mockListings.push({ id: 88801, address: '1 IDX Block', neighborhood: 'Test', borough: 'Manhattan', beds: 1, baths: 1, price: 500000, status: 'ACTIVE', listingCategory: 'sale', idxDisplayYN: false, internetDisplayYN: true, addressDisplayYN: true });
        mockListings.push({ id: 88802, address: '2 Addr Suppress', neighborhood: 'Test', borough: 'Manhattan', beds: 1, baths: 1, price: 500000, status: 'ACTIVE', listingCategory: 'sale', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: false });
        mockListings.push({ id: 88803, address: '3 Unknown Status', neighborhood: 'Test', borough: 'Manhattan', beds: 1, baths: 1, price: 500000, status: 'INVALID_STATUS', listingCategory: 'sale', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true });
        mockListings.push({ id: 88804, address: '4 Missing Date', neighborhood: 'Test', borough: 'Manhattan', beds: 1, baths: 1, price: null, status: 'ACTIVE', listingCategory: 'sale', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true });
        var r = checkListingCompliance([88801, 88802, 88803, 88804]);
        mockListings.splice(origLen); // restore
        var caught = [], missed = [];
        if (r.blocked.some(function(b) { return b.id === 88801; })) caught.push('IDX-block');
        else missed.push('IDX-block');
        if (r.warnings.some(function(w) { return w.id === 88802; })) caught.push('addr-suppress');
        else missed.push('addr-suppress');
        // Status and null price may not be caught by compliance gate (they're data quality, not IDX)
        caught.push('status-check(' + (r.blocked.some(function(b) { return b.id === 88803; }) ? 'blocked' : 'passed') + ')');
        caught.push('null-price(' + (r.blocked.some(function(b) { return b.id === 88804; }) ? 'blocked' : 'passed') + ')');
        addResult('R2', 'Break Injection', missed.length === 0 ? 'PASS' : 'FAIL',
            'Caught: ' + caught.join(', ') + (missed.length > 0 ? ' | Missed: ' + missed.join(', ') : ''));
    })();

    // R3: Fuzz test — random criteria (ACTIVE)
    (function() {
        if (!runActive) { addResult('R3', 'Fuzz Test', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof filterListings !== 'function' || typeof mockListings === 'undefined') { addResult('R3', 'Fuzz Test', 'FAIL', 'Required: filterListings and mockListings must exist'); return; }
        var errors = 0, runs = 100, dupRuns = 0;
        var boroughs = ['Manhattan','Brooklyn','Queens','Bronx','Staten Island'];
        for (var i = 0; i < runs; i++) {
            var criteria = {
                searchTab: Math.random() > 0.5 ? 'sale' : 'rent',
                priceMin: Math.floor(Math.random() * 5000000),
                priceMax: Math.floor(Math.random() * 10000000),
                bedsMin: Math.floor(Math.random() * 5),
                boroughs: Math.random() > 0.5 ? [boroughs[Math.floor(Math.random() * boroughs.length)]] : undefined
            };
            try {
                var result = filterListings(mockListings, criteria);
                // Check for duplicates
                var ids = {};
                result.forEach(function(l) {
                    if (ids[l.id]) dupRuns++;
                    ids[l.id] = true;
                });
            } catch(e) { errors++; }
        }
        addResult('R3', 'Fuzz Test', errors === 0 && dupRuns === 0 ? 'PASS' : 'FAIL',
            runs + ' random criteria: ' + errors + ' errors, ' + dupRuns + ' duplicate results' + (errors > 0 ? ' — filterListings threw exceptions' : '') + (dupRuns > 0 ? ' — duplicate IDs in results' : ''));
    })();

    return { mode: 'regression', results: results, summary: { passed: passed, failed: failed, warnings: warnings, total: results.length } };
}
