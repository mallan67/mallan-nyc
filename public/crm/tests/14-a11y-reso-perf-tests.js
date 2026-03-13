
// ─── COMBINED: A11Y + RESO + PERF (7) ─────────────────────────────────────
function AccessibilityRESOPerfTests(options) {
    options = options || {};
    var runActive = options.runActive || false;
    var results = [], passed = 0, failed = 0, warnings = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++; else if (status === 'FAIL') failed++; else if (status !== 'SKIP') warnings++;
    }

    // A11Y1: Keyboard navigation in modals
    (function() {
        var checks = [], issues = [];
        // Check modals for keyboard support
        var modals = document.querySelectorAll('[role="dialog"], .modal, [id*="Modal"]');
        var totalModals = modals.length;
        modals.forEach(function(m) {
            var hasClose = m.querySelector('button[aria-label="Close"], button[title="Close"], .close-btn');
            if (hasClose) checks.push('close-btn');
        });
        // Check for ESC key handler
        var html = document.documentElement.innerHTML;
        if (html.indexOf('Escape') !== -1 || html.indexOf('keyCode === 27') !== -1 || html.indexOf("key === 'Escape'") !== -1) checks.push('esc-handler');
        else issues.push('No ESC key handler');
        // Check for focus trap
        if (html.indexOf('tabindex') !== -1) checks.push('tabindex');
        if (html.indexOf('focus()') !== -1) checks.push('focus-mgmt');
        addResult('A11Y1', 'Keyboard Navigation', issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length > 0 ? totalModals + ' modals — ' + issues.join(', ') : totalModals + ' modals, all checks pass: ' + checks.join(', '));
    })();

    // A11Y2: Labels and ARIA
    (function() {
        var inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea');
        var unlabeled = 0, total = 0;
        inputs.forEach(function(input) {
            if (input.offsetParent === null) return; // skip hidden
            if (input.closest('#complianceDoctorModal')) return;
            if (input.closest('[style*="display:none"], [style*="display: none"]')) return;
            total++;
            var hasLabel = input.id && document.querySelector('label[for="' + input.id + '"]');
            var hasAria = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
            var hasPlaceholder = input.getAttribute('placeholder');
            var hasTitle = input.getAttribute('title');
            // For <select>, check if first <option> serves as label (e.g., "Min Price", "Max Beds")
            var hasOptionLabel = false;
            if (input.tagName === 'SELECT' && input.options && input.options.length > 0) {
                var firstOpt = input.options[0].textContent.trim();
                if (firstOpt && firstOpt !== '' && firstOpt !== '--') hasOptionLabel = true;
            }
            // Check if parent/sibling has a descriptive heading or label text
            var hasNearbyLabel = false;
            var parent = input.parentElement;
            if (parent) {
                var prev = input.previousElementSibling;
                if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN' || prev.tagName === 'DIV') && prev.textContent.trim().length > 0) hasNearbyLabel = true;
                var heading = parent.querySelector('h3, h4, h5, .font-semibold, .font-bold');
                if (heading && heading.textContent.trim().length > 0) hasNearbyLabel = true;
            }
            if (!hasLabel && !hasAria && !hasPlaceholder && !hasTitle && !hasOptionLabel && !hasNearbyLabel) unlabeled++;
        });
        addResult('A11Y2', 'Input Labels', unlabeled === 0 ? 'PASS' : 'FAIL',
            unlabeled === 0 ? total + ' inputs, all labeled' : total + ' inputs, ' + unlabeled + ' UNLABELED — every input must have label/aria-label/placeholder/title');
    })();

    // RESO1: Field type coercion (numeric fields are numbers)
    (function() {
        if (typeof listings === 'undefined' || listings.length === 0) { addResult('RESO1', 'Field Type Coercion', 'FAIL', 'listings undefined or empty — required test data missing'); return; }
        var issues = [];
        var numericFields = ['price','beds','baths','sqft','daysOnMarket','pricePerSqft','lotSize','stories','units','garageSpaces'];
        listings.forEach(function(l, idx) {
            numericFields.forEach(function(f) {
                var val = l[f];
                if (val !== undefined && val !== null && val !== '' && typeof val !== 'number' && isNaN(Number(val))) {
                    issues.push('L-' + l.id + '.' + f + '="' + val + '" (not numeric)');
                }
            });
        });
        addResult('RESO1', 'Field Type Coercion', issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length === 0 ? 'All numeric fields valid across all ' + listings.length + ' listings' : issues.slice(0, 10).join('; '));
    })();

    // RESO2: Required fields completeness
    (function() {
        if (typeof listings === 'undefined' || listings.length === 0) { addResult('RESO2', 'Required Fields', 'FAIL', 'listings undefined or empty — required test data missing'); return; }
        var coreRequired = ['id','address','price','status','beds','baths','neighborhood'];
        var extended = ['borough','listingCategory'];
        var coreViolations = [];
        var extViolations = [];
        listings.forEach(function(l) {
            coreRequired.forEach(function(f) {
                if (l[f] === undefined || l[f] === null || l[f] === '') coreViolations.push('L-' + l.id + '.' + f);
            });
            extended.forEach(function(f) {
                if (l[f] === undefined || l[f] === null || l[f] === '') extViolations.push('L-' + l.id + '.' + f);
            });
        });
        addResult('RESO2', 'Required Fields', coreViolations.length === 0 ? 'PASS' : 'FAIL',
            coreViolations.length === 0 ? listings.length + ' listings, all ' + coreRequired.length + ' core fields present' + (extViolations.length > 0 ? ' (' + extViolations.length + ' extended missing)' : '') : coreViolations.length + ' core field violations: ' + coreViolations.slice(0, 10).join(', '));
    })();

    // RESO3: Enumeration enforcement
    (function() {
        if (typeof listings === 'undefined') { addResult('RESO3', 'Enum Enforcement', 'FAIL', 'listings undefined — required test data missing'); return; }
        var validStatuses = ['Active','Pending','Closed','ComingSoon','Coming Soon','Withdrawn','Expired','Canceled','Hold','Incomplete','ActiveUnderContract',
            'ACTIVE','PENDING','CLOSED','COMING_SOON','COMINGSOON','WITHDRAWN','EXPIRED','CANCELED','HOLD','INCOMPLETE','ACTIVE_UNDER_CONTRACT'];
        var validBoroughs = ['Manhattan','Brooklyn','Queens','Bronx','Staten Island','The Bronx'];
        var validCategories = ['sale','rental','Sale','Rental'];
        var issues = [];
        listings.forEach(function(l) {
            if (l.status && validStatuses.indexOf(l.status) === -1) issues.push('Status:"' + l.status + '" L-' + l.id);
            if (l.borough && validBoroughs.indexOf(l.borough) === -1) issues.push('Borough:"' + l.borough + '" L-' + l.id);
            if (l.listingCategory && validCategories.indexOf(l.listingCategory) === -1) issues.push('Category:"' + l.listingCategory + '" L-' + l.id);
        });
        addResult('RESO3', 'Enum Enforcement', issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length === 0 ? 'All status/borough/category enums valid across ' + listings.length + ' listings' : issues.slice(0, 5).join('; '));
    })();

    // PERF1: Render time threshold (ACTIVE)
    (function() {
        if (!runActive) { addResult('PERF1', 'Render Time', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof renderSearchResults !== 'function') { addResult('PERF1', 'Render Time', 'FAIL', 'renderSearchResults function missing — required for rendering'); return; }
        var t0 = performance.now();
        try { renderSearchResults(); } catch(e) { addResult('PERF1', 'Render Time', 'FAIL', 'Error: ' + e.message); return; }
        var ms = Math.round(performance.now() - t0);
        addResult('PERF1', 'Render Time', ms < 2000 ? 'PASS' : 'FAIL',
            'renderSearchResults() completed in ' + ms + 'ms (hard limit: 2000ms)');
    })();

    // PERF2: Filter+sort performance (ACTIVE)
    (function() {
        if (!runActive) { addResult('PERF2', 'Filter+Sort Perf', 'SKIP', 'Active — click Run Active'); return; }
        if (typeof getFilteredListings !== 'function') { addResult('PERF2', 'Filter+Sort Perf', 'FAIL', 'getFilteredListings function missing — required for filtering'); return; }
        var t0 = performance.now();
        for (var i = 0; i < 50; i++) { getFilteredListings(true); }
        var ms = Math.round(performance.now() - t0);
        var avg = Math.round(ms / 50);
        addResult('PERF2', 'Filter+Sort Perf', avg < 50 ? 'PASS' : 'FAIL',
            '50 filter+sort cycles in ' + ms + 'ms (avg ' + avg + 'ms, hard limit: 50ms/cycle)');
    })();

    return { mode: 'a11y_reso_perf', results: results, summary: { passed: passed, failed: failed, warnings: warnings, total: results.length } };
}
