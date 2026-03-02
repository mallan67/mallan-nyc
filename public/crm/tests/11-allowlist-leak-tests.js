// ─── AL: ALLOWLIST LEAK TESTS (5) ──────────────────────────────────────────
function AllowlistLeakTests(options) {
    options = options || {};
    var runActive = options.runActive || false;
    var results = [], passed = 0, failed = 0, warnings = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++; else if (status === 'FAIL') failed++; else if (status !== 'SKIP') warnings++;
    }

    // AL1: Snapshot allowlist enforcement (ACTIVE)
    (function() {
        if (!runActive) { addResult('AL1', 'Snapshot Allowlist', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof sanitizeListingSnapshot === 'function') {
            var poison = { id: 99999, address: '123 Test St', price: 1000000, status: 'ACTIVE', beds: 2, baths: 1, neighborhood: 'Test', borough: 'Manhattan' };
            PROHIBITED_LEAK_FIELDS.forEach(function(f) { poison[f] = 'LEAKED_' + f; });
            var sanitized = sanitizeListingSnapshot(poison);
            var leaked = [];
            PROHIBITED_LEAK_FIELDS.forEach(function(f) { if (sanitized && sanitized[f] !== undefined) leaked.push(f); });
            var json = JSON.stringify(sanitized || {});
            PROHIBITED_LEAK_FIELDS.forEach(function(f) { if (json.indexOf('LEAKED_' + f) !== -1 && leaked.indexOf(f) === -1) leaked.push(f + '-value'); });
            addResult('AL1', 'Snapshot Allowlist', leaked.length === 0 ? 'PASS' : 'FAIL',
                leaked.length === 0 ? PROHIBITED_LEAK_FIELDS.length + ' prohibited fields stripped' : 'Leaked: ' + leaked.join(', '));
        } else {
            var exportFns = ['exportReportCSV','exportReportExcel','generateShareableLink','buildBrandedEmailHTML'];
            var checked = 0, leaked = [];
            exportFns.forEach(function(fn) {
                if (typeof window[fn] === 'function') {
                    checked++;
                    var src = window[fn].toString();
                    PROHIBITED_LEAK_FIELDS.forEach(function(f) {
                        if (src.indexOf('listing.' + f) !== -1 || src.indexOf("['" + f + "']") !== -1) leaked.push(fn + ':' + f);
                    });
                }
            });
            addResult('AL1', 'Snapshot Allowlist', (leaked.length === 0 && checked > 0) ? 'PASS' : 'FAIL',
                leaked.length > 0 ? 'LEAKED prohibited fields: ' + leaked.slice(0, 5).join(', ') : (checked > 0 ? checked + ' export functions scanned, no direct prohibited field access' : 'No sanitizer AND no export functions found — allowlist infrastructure missing'));
        }
    })();

    // AL2: Export allowlist enforcement (CSV/Excel) (ACTIVE)
    (function() {
        if (!runActive) { addResult('AL2', 'Export Allowlist', 'SKIP', 'Active — click Run Active'); return; }
        var checks = [], issues = [];
        if (typeof csvExcelAllowlistCustomer !== 'undefined' && Array.isArray(csvExcelAllowlistCustomer)) {
            checks.push('allowlist(' + csvExcelAllowlistCustomer.length + ')');
            PROHIBITED_LEAK_FIELDS.forEach(function(f) {
                if (csvExcelAllowlistCustomer.indexOf(f) !== -1) issues.push(f + ' in customer allowlist!');
            });
        } else { issues.push('csvExcelAllowlistCustomer not defined'); }
        if (typeof exportReportCSV === 'function') {
            var src = exportReportCSV.toString();
            if (src.indexOf('allowlist') !== -1 || src.indexOf('Allowlist') !== -1) checks.push('csv-allowlist');
            if (src.indexOf('customer') !== -1 || src.indexOf('version') !== -1) checks.push('csv-version');
        }
        if (typeof exportReportExcel === 'function') {
            var src = exportReportExcel.toString();
            if (src.indexOf('allowlist') !== -1 || src.indexOf('Allowlist') !== -1) checks.push('excel-allowlist');
        }
        addResult('AL2', 'Export Allowlist', (issues.length === 0 && checks.length > 0) ? 'PASS' : 'FAIL',
            issues.length > 0 ? issues.join('; ') : (checks.length > 0 ? checks.join(', ') : 'No export allowlist infrastructure found'));
    })();

    // AL3: DOM leakage scan
    (function() {
        var leakPatterns = [/PrivateRemarks/i, /ShowingInstructions/i, /BuyerAgent(?:Comp|Brokerage)/i,
            /OwnerName/i, /OwnerPhone/i, /LockBox(?:Serial)?/i, /KeyLocation/i, /CompensationType/i];
        var violations = [];
        var containers = document.querySelectorAll(
            '#gridViewContainer, #galleryViewContainer, #shortSummaryViewContainer, ' +
            '#summaryViewContainer, #masterDetailViewContainer, #mapViewContainer, #reportPreviewContent');
        containers.forEach(function(c) {
            if (c.style.display === 'none' || !c.offsetParent) return;
            var html = c.innerHTML || '';
            leakPatterns.forEach(function(pat) {
                var match = html.match(pat);
                if (match && html.indexOf('type="checkbox"') === -1 && !c.closest('#complianceDoctorModal')) {
                    violations.push(match[0] + ' in #' + (c.id || 'unknown'));
                }
            });
        });
        var dataLeaks = document.querySelectorAll('[data-private-remarks], [data-showing-instructions], [data-compensation], [data-owner-name]');
        dataLeaks.forEach(function(el) {
            if (!el.closest('#complianceDoctorModal')) violations.push('data-* leak on <' + el.tagName.toLowerCase() + '>');
        });
        addResult('AL3', 'DOM Leakage Scan', violations.length === 0 ? 'PASS' : 'FAIL',
            violations.length === 0 ? leakPatterns.length + ' patterns across ' + containers.length + ' containers, 0 leaks' : violations.slice(0, 5).join('; '));
    })();

    // AL4: Customization tab writeback guard (ACTIVE)
    (function() {
        if (!runActive) { addResult('AL4', 'Writeback Guard', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof mockListings === 'undefined' || mockListings.length === 0) { addResult('AL4', 'Writeback Guard', 'FAIL', 'mockListings undefined or empty — cannot test writeback guard'); return; }
        var before = JSON.stringify(mockListings[0]);
        try {
            if (typeof getOptionalContentConfig === 'function') getOptionalContentConfig();
            if (typeof getSelectedReportFields === 'function') getSelectedReportFields();
            if (typeof getSortedListings === 'function') getSortedListings();
        } catch(e) { /* ignore */ }
        var after = JSON.stringify(mockListings[0]);
        addResult('AL4', 'Writeback Guard', before === after ? 'PASS' : 'FAIL',
            before === after ? 'Listing object not mutated by report config reads' : 'Listing MUTATED — side effect in report generators');
    })();

    // AL5: Message/comment sanitization
    (function() {
        var checks = [], issues = [];
        ['sendEmailDirect','buildBrandedEmailHTML','addClientNote','sendMessage'].forEach(function(fn) {
            if (typeof window[fn] === 'function') {
                var src = window[fn].toString();
                if (src.indexOf('sanitize') !== -1 || src.indexOf('escape') !== -1 || src.indexOf('textContent') !== -1) checks.push(fn + ':safe');
                else if (src.indexOf('innerHTML') !== -1 && src.indexOf('DOMPurify') === -1) issues.push(fn + ':innerHTML');
            }
        });
        addResult('AL5', 'Message Sanitization', (issues.length === 0 && checks.length > 0) ? 'PASS' : 'FAIL',
            issues.length > 0 ? 'Unsafe innerHTML usage: ' + issues.join(', ') : (checks.length > 0 ? checks.join(', ') : 'No message/email functions found — sanitization infrastructure missing'));
    })();

    return { mode: 'allowlist_leak', results: results, summary: { passed: passed, failed: failed, warnings: warnings, total: results.length } };
}
