// ─── SRC: SOURCE INTEGRITY TESTS (3) ────────────────────────────────────────
function SourceIntegrityTests(options) {
    var results = [], passed = 0, failed = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++; else if (status === 'FAIL') failed++;
    }

    // SRC-01: Required fields present in raw data (pre-render)
    (function() {
        if (typeof mockListings === 'undefined' || mockListings.length === 0) {
            addResult('SRC-01', 'Required Fields in Raw Data', 'FAIL', 'mockListings undefined or empty');
            return;
        }
        var required = ['id','address','price','status','beds','baths','neighborhood'];
        var violations = [];
        mockListings.forEach(function(l) {
            required.forEach(function(f) {
                if (l[f] === undefined || l[f] === null || l[f] === '') violations.push('L-' + l.id + '.' + f);
            });
        });
        addResult('SRC-01', 'Required Fields in Raw Data',
            violations.length === 0 ? 'PASS' : 'FAIL',
            violations.length === 0 ? mockListings.length + ' listings, all ' + required.length + ' required fields present' :
            violations.length + ' missing: ' + violations.slice(0, 10).join(', '));
    })();

    // SRC-02: Unknown / invalid enum tokens → FAIL
    (function() {
        if (typeof mockListings === 'undefined') { addResult('SRC-02', 'Enum Token Validity', 'FAIL', 'mockListings undefined'); return; }
        var VS = ['Active','Pending','Closed','ComingSoon','Coming Soon','Withdrawn','Expired','Canceled','Hold','Incomplete','ActiveUnderContract','ACTIVE','PENDING','CLOSED','COMING_SOON','COMINGSOON','WITHDRAWN','EXPIRED','CANCELED','HOLD','INCOMPLETE','ACTIVE_UNDER_CONTRACT'];
        var VB = ['Manhattan','Brooklyn','Queens','Bronx','Staten Island','The Bronx'];
        var VC = ['sale','rental','Sale','Rental'];
        var violations = [];
        mockListings.forEach(function(l) {
            if (l.status && VS.indexOf(l.status) === -1) violations.push('L-' + l.id + '.status="' + l.status + '"');
            if (l.borough && VB.indexOf(l.borough) === -1) violations.push('L-' + l.id + '.borough="' + l.borough + '"');
            if (l.listingCategory && VC.indexOf(l.listingCategory) === -1) violations.push('L-' + l.id + '.category="' + l.listingCategory + '"');
        });
        addResult('SRC-02', 'Enum Token Validity',
            violations.length === 0 ? 'PASS' : 'FAIL',
            violations.length === 0 ? mockListings.length + ' listings, all enum values valid' :
            violations.length + ' invalid: ' + violations.slice(0, 5).join(', '));
    })();

    // SRC-03: Compliance flags fail-closed (missing = FAIL, not default-to-true)
    (function() {
        if (typeof mockListings === 'undefined') { addResult('SRC-03', 'Compliance Flags Fail-Closed', 'FAIL', 'mockListings undefined'); return; }
        var complianceFlags = ['idxDisplayYN','addressDisplayYN'];
        var violations = [];
        mockListings.forEach(function(l) {
            complianceFlags.forEach(function(flag) {
                if (l[flag] === undefined) violations.push('L-' + l.id + '.' + flag + '=undefined');
            });
        });
        addResult('SRC-03', 'Compliance Flags Fail-Closed',
            violations.length === 0 ? 'PASS' : 'FAIL',
            violations.length === 0 ? mockListings.length + ' listings, all compliance flags explicitly set' :
            violations.length + ' missing (treated as restricted): ' + violations.slice(0, 10).join(', '));
    })();

    return { mode: 'source_integrity', results: results, summary: { passed: passed, failed: failed, warnings: 0, total: results.length } };
}
