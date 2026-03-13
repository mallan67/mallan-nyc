// ─── COMPLIANCE EXTENDED (7 tests) ─ Security & REBNY Hardening ─────
function REBNYComplianceExtended(options) {
    options = options || {};
    var runActive = options.runActive || false;
    var results = [];
    var passed = 0, failed = 0, warnings = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++; else if (status === 'FAIL') failed++; else if (status !== 'SKIP') warnings++;
    }

    // ── C1: Source Separation ──────────────────────────────────────────
    (function() {
        var rls = document.querySelectorAll('[data-source="REBNY-RLS"]');
        var allSrc = document.querySelectorAll('[data-source]');
        var allCards = document.querySelectorAll('[data-listing-id]');
        var issues = [];
        if (allCards.length > 0 && allSrc.length < allCards.length) issues.push((allCards.length - allSrc.length) + ' unlabeled');
        if (rls.length > 0 && document.body.innerHTML.indexOf('REBNY') === -1) issues.push('RLS without attribution');
        addResult('C1', 'Source Separation', issues.length === 0 ? 'PASS' : 'FAIL', issues.length === 0 ? allSrc.length + ' labeled (RLS:' + rls.length + ')' : issues.join('; '));
    })();

    // ── C2: Print CSS Test ─────────────────────────────────────────────
    (function() {
        var checks = [], issues = [], html = document.documentElement.innerHTML;
        if (html.indexOf('@media print') !== -1) checks.push('print-rules'); else issues.push('No @media print');
        if (html.indexOf('page-break-inside') !== -1) checks.push('page-breaks'); else issues.push('No page-breaks');
        if (html.indexOf('.no-print') !== -1) checks.push('no-print-class');
        if (typeof generateListingSheet === 'function') {
            var src = generateListingSheet.toString();
            if (src.indexOf('Equal Housing') !== -1 || src.indexOf('REBNY') !== -1) checks.push('legal-footer');
            if (src.indexOf('MALLAN') !== -1 || src.indexOf('10991205323') !== -1) checks.push('branding');
        }
        addResult('C2', 'Print CSS', issues.length === 0 ? 'PASS' : 'FAIL', issues.length === 0 ? 'All checks pass: ' + checks.join(', ') : issues.join(', '));
    })();

    // ── C3: Copy/Paste Scrape Test ─────────────────────────────────────
    (function() {
        var issues = [];
        var SENSITIVE = ['PrivateRemarks','ShowingInstructions','OwnerName','OwnerPhone','ListAgentMlsId','CompensationType','BuyerAgencyCompensation'];
        document.querySelectorAll('[style*="display:none"], [style*="display: none"], .hidden, [hidden]').forEach(function(el) {
            if (el.id === 'complianceDoctorModal' || el.id === 'searchListingTypeInfoModal') return;
            var text = el.textContent || '';
            if (text.length > 50000) return;
            SENSITIVE.forEach(function(term) {
                if (text.indexOf(term) !== -1) issues.push('"' + term + '" in #' + (el.id || el.tagName));
            });
        });
        addResult('C3', 'Copy/Paste Scrape', issues.length === 0 ? 'PASS' : 'FAIL', issues.length === 0 ? 'No hidden sensitive data found' : 'Sensitive data in hidden elements: ' + issues.slice(0,5).join(', '));
    })();

    // ── C4: Security Exposure Test ─────────────────────────────────────
    (function() {
        var exp = [];
        ['listings','allListings','rawData','apiKey','API_KEY','TRESTLE_TOKEN','MLS_PASSWORD','REBNY_TOKEN','accessToken','secretKey'].forEach(function(g) {
            if (typeof window[g] !== 'undefined' && window[g] !== null) exp.push('window.' + g);
        });
        if (typeof window.listings !== 'undefined') {
            for (var i = 0; i < Math.min(window.listings.length, 5); i++) {
                var l = window.listings[i];
                if (l.PrivateRemarks || l.ShowingInstructions || l.ownerPhone) { exp.push('listings has private fields'); break; }
            }
        }
        var html = document.documentElement.outerHTML.substring(0, 100000);
        if (/sk-[a-zA-Z0-9]{20,}/.test(html)) exp.push('API key (sk-*)');
        if (/Bearer\s+[a-zA-Z0-9]{20,}/.test(html)) exp.push('Bearer token');
        addResult('C4', 'Security Exposure', exp.length === 0 ? 'PASS' : 'FAIL', exp.length === 0 ? 'No globals, keys, or private data exposed' : exp.join('; '));
    })();

    // ── C5: Violation Injection Test (ACTIVE) ──────────────────────────
    (function() {
        if (!runActive) { addResult('C5', 'Violation Injection', 'SKIP', 'Active test — click "Run Active Tests"'); return; }
        if (typeof checkListingCompliance !== 'function' || typeof listings === 'undefined') {
            addResult('C5', 'Violation Injection', 'FAIL', 'checkListingCompliance or listings not found'); return;
        }
        var origLen = listings.length;
        // Inject 2 test listings: one IDX-blocked, one address-suppressed
        listings.push({ id: 99901, address: '1 Test IDX Block', unit: '', neighborhood: 'Test', borough: 'Manhattan', beds: 1, baths: 1, price: 1000000, status: 'ACTIVE', listingCategory: 'sale', idxDisplayYN: false, internetDisplayYN: true, addressDisplayYN: true });
        listings.push({ id: 99902, address: '2 Test Addr Suppress', unit: '', neighborhood: 'Test', borough: 'Manhattan', beds: 1, baths: 1, price: 1000000, status: 'ACTIVE', listingCategory: 'sale', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: false });
        var r = checkListingCompliance([99901, 99902]);
        listings.splice(origLen);
        var idxBlocked = r.blocked.some(function(b) { return b.id === 99901; });
        var addrWarned = r.warnings.some(function(w) { return w.id === 99902; });
        var caught = [];
        if (idxBlocked) caught.push('IDX-block');
        if (addrWarned) caught.push('addr-suppress');
        var missed = [];
        if (!idxBlocked) missed.push('IDX-block');
        if (!addrWarned) missed.push('addr-suppress');
        addResult('C5', 'Violation Injection', missed.length === 0 ? 'PASS' : 'FAIL', missed.length === 0 ? caught.length + ' injected violations caught by compliance gate' : 'Missed: ' + missed.join(', '));
    })();

    // ── C6: Full Surface Scan ──────────────────────────────────────────
    (function() {
        var PROHIBITED = ['Compensation','Private Remarks','Owner Name','ShowingInstructions','BuyerAgencyCompensation','ListAgentMlsId','OriginatingSystemKey','TransactionBrokerCompensation'];
        var vis = document.body.innerText || '';
        var leaks = PROHIBITED.filter(function(t) { return vis.indexOf(t) !== -1; });
        addResult('C6', 'Full Surface Scan', leaks.length === 0 ? 'PASS' : 'FAIL', leaks.length === 0 ? PROHIBITED.length + ' terms scanned, none found' : 'Found: ' + leaks.join(', '));
    })();

    // ── C7: Social Share Scan ──────────────────────────────────────────
    (function() {
        var checks = [], issues = [];
        if (typeof shareSocialPost === 'function') {
            checks.push('shareSocialPost');
            var src = shareSocialPost.toString();
            if (src.indexOf('broker') !== -1 || src.indexOf('attribution') !== -1 || src.indexOf('REBNY') !== -1 || src.indexOf('Equal Housing') !== -1) checks.push('compliance-text');
            else issues.push('Missing attribution in share');
        } else { issues.push('shareSocialPost not found'); }
        addResult('C7', 'Social Share Scan', issues.length === 0 ? 'PASS' : 'FAIL', issues.length === 0 ? checks.join(', ') : issues.join('; '));
    })();

    return { mode: 'compliance_extended', results: results, summary: { passed: passed, failed: failed, warnings: warnings, total: results.length } };
}
