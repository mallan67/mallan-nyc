// ─── NV: NO-VOW DRIFT TESTS (5) ────────────────────────────────────────────
function NoVOWDriftTests(options) {
    options = options || {};
    var results = [], passed = 0, failed = 0, warnings = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++; else if (status === 'FAIL') failed++; else if (status !== 'SKIP') warnings++;
    }

    // NV1: Client UI must not contain search controls
    (function() {
        var clientSections = document.querySelectorAll('[data-access-level="client"], [data-view="client"], [data-portal="client"], [data-portal="buyer"], [data-portal="renter"]');
        var searchControlIds = ['searchBasicMode','searchAdvancedMode','searchCriteriaForm','advancedFiltersPanel','savedSearchesSection'];
        if (clientSections.length === 0) {
            var html = document.documentElement.innerHTML;
            var hasRoleGuards = /role\s*[!=]==?\s*['"](?:client|buyer|renter|seller|landlord)['"]/g.test(html);
            var hasCollectionGate = html.indexOf('collectionId') !== -1 || html.indexOf('clientCollections') !== -1;
            addResult('NV1', 'Client UI — No Search Controls', (hasRoleGuards || hasCollectionGate) ? 'PASS' : 'FAIL',
                hasRoleGuards ? 'Role guards present; collection-gate: ' + hasCollectionGate : 'No client sections AND no role guards detected — VOW drift risk');
        } else {
            var violations = [];
            clientSections.forEach(function(section) {
                searchControlIds.forEach(function(id) { if (section.querySelector('#' + id)) violations.push('#' + id); });
                ['input[type="range"]', 'select[data-field]', '.filter-group'].forEach(function(sel) {
                    var f = section.querySelectorAll(sel);
                    if (f.length > 0) violations.push(sel + '(' + f.length + ')');
                });
            });
            addResult('NV1', 'Client UI — No Search Controls', violations.length === 0 ? 'PASS' : 'FAIL',
                violations.length === 0 ? 'No search controls in ' + clientSections.length + ' client sections' : 'Found: ' + violations.join(', '));
        }
    })();

    // NV2: Client view only renders from Collections
    (function() {
        var checks = [], issues = [];
        var html = document.documentElement.innerHTML;
        if (html.indexOf('getClientCollections') !== -1) checks.push('getClientCollections');
        if (html.indexOf('collectionId') !== -1) checks.push('collectionId');
        if (html.indexOf('clientCollections') !== -1) checks.push('clientCollections');
        ['renderClientView','renderBuyerView','renderRenterView','renderSellerView','renderLandlordView'].forEach(function(fn) {
            if (typeof window[fn] === 'function') {
                var src = window[fn].toString();
                if (src.indexOf('filterListings') !== -1 && src.indexOf('collectionId') === -1) issues.push(fn + ' calls filterListings without collection gate');
                if (src.indexOf('collectSearchCriteria') !== -1) issues.push(fn + ' calls collectSearchCriteria');
                checks.push(fn);
            }
        });
        addResult('NV2', 'Client Renders Collections Only', issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length > 0 ? issues.join('; ') : (checks.length > 0 ? checks.join(', ') : 'No client render functions in scope'));
    })();

    // NV3: Auto-alerts are agent-reviewed only
    (function() {
        var issues = [], checks = [];
        var html = document.documentElement.innerHTML;
        if (/setInterval[^;]{0,200}(?:sendEmail|sendAlert|sendNotification|emailClient)/i.test(html)) issues.push('Auto-scheduled send in global scope');
        ['sendEmailDirect','emailListingSheet','sendAlert','sendNotification'].forEach(function(fn) {
            if (typeof window[fn] === 'function') {
                checks.push(fn);
                var src = window[fn].toString();
                if (/setInterval\s*\(/.test(src) && /send|email|alert/i.test(src)) issues.push(fn + ' has auto-send timer');
            }
        });
        addResult('NV3', 'Alerts Agent-Reviewed Only', issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length === 0 ? checks.length + ' send functions require manual trigger' : issues.join('; '));
    })();

    // NV4: Share link treated as public
    (function() {
        var checks = [], issues = [];
        if (typeof generateShareableLink === 'function') {
            var src = generateShareableLink.toString();
            checks.push('share-fn');
            if (src.indexOf('sanitize') !== -1 || src.indexOf('customer') !== -1 || src.indexOf('allowlist') !== -1) checks.push('sanitized');
            PROHIBITED_LEAK_FIELDS.forEach(function(f) {
                if (src.indexOf(f) !== -1 && src.indexOf('exclude') === -1 && src.indexOf('filter') === -1) issues.push(f + ' in share');
            });
        }
        var html = document.documentElement.innerHTML;
        if (html.indexOf('noindex') !== -1) checks.push('noindex');
        addResult('NV4', 'Share Link = Public', issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length > 0 ? 'Prohibited fields in share link: ' + issues.join('; ') : 'OK: ' + (checks.length > 0 ? checks.join(', ') : 'none'));
    })();

    // NV5: No URL params trigger search in client context
    (function() {
        var html = document.documentElement.innerHTML;
        var urlParseBlocks = (html.match(/URLSearchParams|location\.search|getUrlParam/g) || []).length;
        var roleChecksNearParse = (html.match(/URLSearchParams[\s\S]{0,500}role|role[\s\S]{0,500}URLSearchParams/g) || []).length;
        if (roleChecksNearParse > 0) {
            addResult('NV5', 'URL Params Gated by Role', 'PASS', roleChecksNearParse + ' role checks near URL parsing');
        } else if (urlParseBlocks > 0) {
            addResult('NV5', 'URL Params Gated by Role', 'FAIL', urlParseBlocks + ' URL parse blocks found without role guards — ungated search params');
        } else {
            addResult('NV5', 'URL Params Gated by Role', 'PASS', 'No URL search param parsing detected');
        }
    })();

    return { mode: 'no_vow_drift', results: results, summary: { passed: passed, failed: failed, warnings: warnings, total: results.length } };
}
