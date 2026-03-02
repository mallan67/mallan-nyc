// ─── S: SEARCH CORRECTNESS TESTS (4) ──────────────────────────────────────
function SearchCorrectnessTests(options) {
    options = options || {};
    var runActive = options.runActive || false;
    var results = [], passed = 0, failed = 0, warnings = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++; else if (status === 'FAIL') failed++; else if (status !== 'SKIP') warnings++;
    }

    // S1: Type coercion test (ACTIVE)
    (function() {
        if (!runActive) { addResult('S1', 'Type Coercion', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof filterListings !== 'function' || typeof mockListings === 'undefined') { addResult('S1', 'Type Coercion', 'FAIL', 'Required: filterListings and mockListings must exist'); return; }
        var numResult = filterListings(mockListings, { priceMin: 1000000, priceMax: 3000000, searchTab: 'sale' });
        var strResult = filterListings(mockListings, { priceMin: '1000000', priceMax: '3000000', searchTab: 'sale' });
        var numIds = numResult.map(function(l) { return l.id; }).sort();
        var strIds = strResult.map(function(l) { return l.id; }).sort();
        var match = numIds.length === strIds.length && numIds.every(function(id, i) { return id === strIds[i]; });
        addResult('S1', 'Type Coercion', match ? 'PASS' : 'FAIL',
            match ? 'String vs number criteria → same ' + numIds.length + ' results' : 'Mismatch: number=' + numIds.length + ' vs string=' + strIds.length);
    })();

    // S2: Range normalization (ACTIVE)
    (function() {
        if (!runActive) { addResult('S2', 'Range Normalization', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof filterListings !== 'function' || typeof mockListings === 'undefined') { addResult('S2', 'Range Normalization', 'FAIL', 'Required: filterListings and mockListings must exist'); return; }
        var noErr = true, result = [];
        try { result = filterListings(mockListings, { priceMin: 5000000, priceMax: 100000, searchTab: 'sale' }); } catch(e) { noErr = false; }
        addResult('S2', 'Range Normalization', noErr ? 'PASS' : 'FAIL',
            noErr ? 'Min>Max handled gracefully → ' + result.length + ' results (no crash)' : 'Exception thrown on inverted range');
    })();

    // S3: Multi-select AND/OR semantics (ACTIVE)
    (function() {
        if (!runActive) { addResult('S3', 'Multi-Select Semantics', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof filterListings !== 'function' || typeof mockListings === 'undefined') { addResult('S3', 'Multi-Select Semantics', 'FAIL', 'Required: filterListings and mockListings must exist'); return; }
        var saleOnly = filterListings(mockListings, { searchTab: 'sale' });
        var checks = [], issues = [];
        // Property type multi-select should be OR (broader results)
        if (saleOnly.length > 0) {
            var types = {};
            saleOnly.forEach(function(l) { if (l.propertyType) types[l.propertyType] = true; });
            var typeKeys = Object.keys(types);
            if (typeKeys.length >= 2) {
                var single = filterListings(mockListings, { searchTab: 'sale', propertyTypes: [typeKeys[0]] });
                var multi = filterListings(mockListings, { searchTab: 'sale', propertyTypes: [typeKeys[0], typeKeys[1]] });
                if (multi.length >= single.length) checks.push('type-OR(' + single.length + '→' + multi.length + ')');
                else issues.push('Multi-type returned fewer results (AND instead of OR?)');
            } else { checks.push('single-type-only'); }
        }
        addResult('S3', 'Multi-Select Semantics', issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length > 0 ? issues.join('; ') : checks.join(', '));
    })();

    // S4: Duplicate suppression test (ACTIVE)
    (function() {
        if (!runActive) { addResult('S4', 'Duplicate Suppression', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof getFilteredListings !== 'function') { addResult('S4', 'Duplicate Suppression', 'FAIL', 'getFilteredListings function missing — required for duplicate check'); return; }
        var all = getFilteredListings(true);
        var ids = all.map(function(l) { return l.id; });
        var unique = {};
        var dupes = [];
        ids.forEach(function(id) {
            if (unique[id]) dupes.push(id);
            unique[id] = true;
        });
        addResult('S4', 'Duplicate Suppression', dupes.length === 0 ? 'PASS' : 'FAIL',
            dupes.length === 0 ? ids.length + ' listings, 0 duplicates' : dupes.length + ' duplicate IDs: ' + dupes.slice(0, 5).join(','));
    })();

    return { mode: 'search_correctness', results: results, summary: { passed: passed, failed: failed, warnings: warnings, total: results.length } };
}
