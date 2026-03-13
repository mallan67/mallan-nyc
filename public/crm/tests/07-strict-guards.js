//
// STRICT NO-SUBSTITUTE / NO-BYPASS ENFORCEMENT (v1.1)
// ALL tests are binary PASS/FAIL only. No WARN status. No thresholds.
// No fallbacks, no defaults, no percentage tolerances, no "good enough".
// Missing required infrastructure = FAIL. Any single violation = FAIL.
// ═══════════════════════════════════════════════════════════════════════════════
var EXTENDED_SUITE_VERSION = '1.1.0';
var PROHIBITED_LEAK_FIELDS = ['PrivateRemarks','ShowingInstructions','BuyerAgentCompensation','BuyerBrokerageCompensation','BuyerBrokerageCompensationType','OwnerName','OwnerPhone','LockBoxSerialNumber','KeyLocation','ListAgentMlsId','ListOfficeMlsId','OriginatingSystemName','OriginatingSystemKey','TransactionBrokerCompensation','CompensationType'];

// ═══════════════════════════════════════════════════════════════════════════════
// STRICT INTEGRITY & ANTI-BYPASS GUARDS v2.0
// Fallback tripwire, console interception, DOM mutation tracking,
// object freeze, dataset checksums, fixer-function scan, skip-to-pass scan.
// ═══════════════════════════════════════════════════════════════════════════════
var _strictGuards = {
    fallbackUsedCount: 0,
    fallbackLog: [],
    consoleWarnings: [],
    consoleErrors: [],
    domMutations: [],
    originalConsoleWarn: null,
    originalConsoleError: null,
    mutationObserver: null,
    datasetHashBefore: null,
    datasetHashAfter: null,
    frozenObjects: [],
    freezeOK: false
};

// GUARD-01: Any function that performs a fallback/default MUST call this.
// If fallbackUsedCount > 0 → entire suite FAILS.
function markFallbackUsed(functionName, details) {
    _strictGuards.fallbackUsedCount++;
    _strictGuards.fallbackLog.push({ fn: functionName, reason: details.reason, value: details.valueUsed, time: Date.now() });
}

// Stable hash of listing IDs + compliance fields
function computeDatasetHash() {
    if (typeof listings === 'undefined') return 'NO_DATA';
    var parts = [];
    listings.forEach(function(l) {
        parts.push([l.id, l.status, l.updatedDate || '',
            l.addressDisplayYN === undefined ? 'UNDEF' : String(l.addressDisplayYN),
            l.idxDisplayYN === undefined ? 'UNDEF' : String(l.idxDisplayYN),
            l.internetDisplayYN === undefined ? 'UNDEF' : String(l.internetDisplayYN),
            l.price, l.address].join('|'));
    });
    var str = parts.join(';;');
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return 'H' + Math.abs(hash).toString(36) + '_L' + listings.length;
}

function setupStrictGuards() {
    // Reset
    _strictGuards.fallbackUsedCount = 0;
    _strictGuards.fallbackLog = [];
    _strictGuards.consoleWarnings = [];
    _strictGuards.consoleErrors = [];
    _strictGuards.domMutations = [];
    _strictGuards.frozenObjects = [];
    _strictGuards.freezeOK = false;

    // GUARD-02: Intercept console.warn and console.error
    _strictGuards.originalConsoleWarn = console.warn;
    _strictGuards.originalConsoleError = console.error;
    console.warn = function() {
        _strictGuards.consoleWarnings.push(Array.prototype.slice.call(arguments).join(' '));
        _strictGuards.originalConsoleWarn.apply(console, arguments);
    };
    console.error = function() {
        _strictGuards.consoleErrors.push(Array.prototype.slice.call(arguments).join(' '));
        _strictGuards.originalConsoleError.apply(console, arguments);
    };

    // INT-03: MutationObserver for unexpected DOM mutations
    if (typeof MutationObserver !== 'undefined') {
        _strictGuards.mutationObserver = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                var targetId = m.target.id || m.target.tagName || 'anon';
                // Skip test modal/badge mutations (expected)
                if (targetId === 'complianceDoctorModal' || targetId === 'complianceDoctorBadge') return;
                if (m.target.closest && m.target.closest('#complianceDoctorModal')) return;
                _strictGuards.domMutations.push({
                    type: m.type,
                    target: targetId,
                    added: m.addedNodes ? m.addedNodes.length : 0,
                    removed: m.removedNodes ? m.removedNodes.length : 0
                });
            });
        });
        _strictGuards.mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
    }

    // INT-04: Freeze critical objects
    try {
        var toFreeze = [];
        if (typeof PROHIBITED_DISPLAY_FIELDS !== 'undefined') { Object.freeze(PROHIBITED_DISPLAY_FIELDS); toFreeze.push('PROHIBITED_DISPLAY_FIELDS'); }
        if (typeof PROHIBITED_LEAK_FIELDS !== 'undefined') { Object.freeze(PROHIBITED_LEAK_FIELDS); toFreeze.push('PROHIBITED_LEAK_FIELDS'); }
        if (typeof COMPLIANCE_DOCTOR_VERSION !== 'undefined') toFreeze.push('COMPLIANCE_DOCTOR_VERSION(string)');
        _strictGuards.frozenObjects = toFreeze;
        _strictGuards.freezeOK = true;
    } catch(e) {
        _strictGuards.freezeOK = false;
    }

    // INT-05: Dataset hash before
    _strictGuards.datasetHashBefore = computeDatasetHash();
}

function teardownStrictGuards() {
    // Restore console
    if (_strictGuards.originalConsoleWarn) {
        console.warn = _strictGuards.originalConsoleWarn;
        _strictGuards.originalConsoleWarn = null;
    }
    if (_strictGuards.originalConsoleError) {
        console.error = _strictGuards.originalConsoleError;
        _strictGuards.originalConsoleError = null;
    }
    // Stop mutation observer
    if (_strictGuards.mutationObserver) {
        _strictGuards.mutationObserver.disconnect();
        _strictGuards.mutationObserver = null;
    }
    // Dataset hash after
    _strictGuards.datasetHashAfter = computeDatasetHash();
}

// Safe suite caller: exceptions → FAIL (Rule 3: exceptions never produce PASS)
function safeSuiteCall(fn, opts, mode) {
    try {
        return fn(opts);
    } catch(e) {
        return {
            mode: mode,
            results: [{ test: 'CRASH', name: mode + ' (uncaught exception)', status: 'FAIL', detail: 'Exception: ' + e.message + ' at ' + (e.stack ? e.stack.split('\n')[1] : 'unknown') }],
            summary: { passed: 0, failed: 1, warnings: 0, total: 1 }
        };
    }
}

