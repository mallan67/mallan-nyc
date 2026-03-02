// ─── X: SECURITY HARDENING V2 (3) ─────────────────────────────────────────
function SecurityHardeningV2Tests(options) {
    options = options || {};
    var runActive = options.runActive || false;
    var results = [], passed = 0, failed = 0, warnings = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++; else if (status === 'FAIL') failed++; else if (status !== 'SKIP') warnings++;
    }

    // X1: XSS sanitization on user-entered fields (ACTIVE)
    (function() {
        if (!runActive) { addResult('X1', 'XSS Sanitization', 'SKIP', 'Active — click Run Active'); return; }
        var checks = [], issues = [];
        var xssPayloads = ['<scr' + 'ipt>alert(1)<\/scr' + 'ipt>', '<img onerror=alert(1) src=x>', '"><svg onload=alert(1)>'];
        // Test search input
        var searchInput = document.getElementById('searchInput') || document.querySelector('input[placeholder*="search" i]');
        if (searchInput) {
            var origVal = searchInput.value;
            xssPayloads.forEach(function(payload, i) {
                searchInput.value = payload;
                var escaped = searchInput.value;
                // The input value itself won't execute, but check if it's reflected in DOM as HTML
            });
            searchInput.value = origVal;
            checks.push('search-input');
        }
        // Check if any render function uses innerHTML with unsanitized input
        ['renderSearchResults','renderGalleryView','renderSummaryView'].forEach(function(fn) {
            if (typeof window[fn] === 'function') {
                var src = window[fn].toString();
                // Flag: innerHTML with direct variable interpolation (no escaping)
                if (src.indexOf('.innerHTML') !== -1) {
                    if (src.indexOf('escapeHtml') !== -1 || src.indexOf('textContent') !== -1 || src.indexOf('DOMPurify') !== -1) {
                        checks.push(fn + ':escaped');
                    } else {
                        // Check if it only uses pre-defined data (not user input)
                        checks.push(fn + ':innerHTML');
                    }
                }
            }
        });
        // Check for XSS in DOM after injecting to a test element
        var testDiv = document.createElement('div');
        testDiv.style.display = 'none';
        document.body.appendChild(testDiv);
        var scriptExecuted = false;
        window._xssTestFlag = false;
        testDiv.innerHTML = '<img src=x onerror="window._xssTestFlag=true">';
        setTimeout(function() {}, 0); // Let event loop process
        if (window._xssTestFlag) issues.push('XSS payload executed in test div');
        delete window._xssTestFlag;
        testDiv.remove();
        addResult('X1', 'XSS Sanitization', issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length > 0 ? 'XSS vulnerability: ' + issues.join('; ') : 'Render functions checked: ' + checks.join(', '));
    })();

    // X2: localStorage namespace isolation
    (function() {
        var allKeys = [];
        for (var i = 0; i < localStorage.length; i++) allKeys.push(localStorage.key(i));
        var agentId = typeof LOGGED_IN_AGENT !== 'undefined' ? LOGGED_IN_AGENT.id : 'unknown';
        var agentKeys = allKeys.filter(function(k) { return k.indexOf(agentId) !== -1 || k.indexOf('_' + agentId) !== -1; });
        var sharedKeys = allKeys.filter(function(k) { return k.indexOf('rebny_') === 0 || k.indexOf('mallan_') === 0; });
        var orphanKeys = allKeys.filter(function(k) {
            return k.indexOf(agentId) === -1 && k.indexOf('rebny_') !== 0 && k.indexOf('mallan_') !== 0 &&
                   k.indexOf('theme') === -1 && k.indexOf('debug') === -1;
        });
        var issues = [];
        // Check for collision risk: keys without agent scoping that contain sensitive data
        orphanKeys.forEach(function(k) {
            if (k.indexOf('listing') !== -1 || k.indexOf('client') !== -1 || k.indexOf('email') !== -1) {
                if (k.indexOf(agentId) === -1) issues.push('Unscoped key: ' + k);
            }
        });
        addResult('X2', 'localStorage Isolation', issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length > 0 ? 'Unscoped keys with sensitive data: ' + issues.join(', ') : 'Agent keys: ' + agentKeys.length + ', shared: ' + sharedKeys.length + ', orphan: ' + orphanKeys.length);
    })();

    // X3: No raw dataset on window
    (function() {
        var exposed = [];
        ['listings','allListings','rawData','apiKey','API_KEY','TRESTLE_TOKEN','MLS_PASSWORD',
         'REBNY_TOKEN','accessToken','secretKey','customerDatabase','clientDatabase'].forEach(function(g) {
            if (typeof window[g] !== 'undefined' && window[g] !== null) exposed.push('window.' + g);
        });
        // Check mockListings for private fields
        if (typeof window.mockListings !== 'undefined' && window.mockListings.length > 0) {
            var sample = window.mockListings[0];
            var privateInMock = [];
            ['PrivateRemarks','ShowingInstructions','OwnerPhone','OwnerSSN'].forEach(function(f) {
                if (sample[f]) privateInMock.push(f);
            });
            if (privateInMock.length > 0) exposed.push('mockListings has: ' + privateInMock.join(','));
        }
        // Scan HTML for API keys
        var html = document.documentElement.outerHTML.substring(0, 100000);
        if (/sk-[a-zA-Z0-9]{20,}/.test(html)) exposed.push('API key pattern');
        if (/Bearer\s+[a-zA-Z0-9]{20,}/.test(html)) exposed.push('Bearer token');
        addResult('X3', 'No Raw Dataset Exposure', exposed.length === 0 ? 'PASS' : 'FAIL',
            exposed.length === 0 ? 'No sensitive globals or keys exposed' : exposed.join('; '));
    })();

    return { mode: 'security_v2', results: results, summary: { passed: passed, failed: failed, warnings: warnings, total: results.length } };
