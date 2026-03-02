function StrictIntegrityTests(options) {
    var results = [], passed = 0, failed = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++; else if (status === 'FAIL') failed++;
    }

    // GUARD-01: Fallback tripwire — if ANY fallback was used during suite, FAIL
    (function() {
        addResult('GUARD-01', 'Fallback Tripwire',
            _strictGuards.fallbackUsedCount === 0 ? 'PASS' : 'FAIL',
            _strictGuards.fallbackUsedCount === 0 ? 'Zero fallbacks triggered during suite execution' :
            _strictGuards.fallbackUsedCount + ' fallback(s) used: ' + _strictGuards.fallbackLog.map(function(f) { return f.fn + '(' + f.reason + ')'; }).join(', '));
    })();

    // GUARD-02: Console warnings/errors — zero tolerance
    (function() {
        var warnCount = _strictGuards.consoleWarnings.length;
        var errCount = _strictGuards.consoleErrors.length;
        var total = warnCount + errCount;
        addResult('GUARD-02', 'Zero Console Warnings/Errors',
            total === 0 ? 'PASS' : 'FAIL',
            total === 0 ? 'No console.warn or console.error fired during suite' :
            warnCount + ' warn(s), ' + errCount + ' error(s): ' + _strictGuards.consoleWarnings.concat(_strictGuards.consoleErrors).slice(0, 5).join(' | '));
    })();

    // INT-01: No fixer/repair/fallback functions referenced by any test
    (function() {
        var FORBIDDEN = ['autoFix','repair\\(','fallback\\(','normalize\\(','coerce\\(','defaultValue','fixStatus','patchData','correctField','healData','maskError','hideError','gracefulDeg','tolerateErr','softPass','softFail'];
        var FORBIDDEN_RX = new RegExp('\\b(' + FORBIDDEN.join('|') + ')', 'i');
        var TEST_FNS = ['NoVOWDriftTests','AllowlistLeakTests','SearchCorrectnessTests','SecurityHardeningV2Tests','AccessibilityRESOPerfTests','MutationRegressionTests','REBNYComplianceDoctor','REBNYWiringTest','REBNYBehaviorTest','REBNYComplianceExtended'];
        var violations = [];
        TEST_FNS.forEach(function(fn) {
            if (typeof window[fn] === 'function') {
                var src = window[fn].toString();
                var match = src.match(FORBIDDEN_RX);
                if (match) violations.push(fn + ' references "' + match[1] + '"');
            }
        });
        addResult('INT-01', 'No Fixer Functions in Tests',
            violations.length === 0 ? 'PASS' : 'FAIL',
            violations.length === 0 ? TEST_FNS.length + ' test functions scanned, 0 forbidden references' :
            violations.join('; '));
    })();

    // INT-03: No unexpected DOM mutations during suite
    (function() {
        // Filter to result containers only (not expected modal/badge)
        var containerIds = ['gridViewContainer','galleryViewContainer','shortSummaryViewContainer','summaryViewContainer','masterDetailViewContainer'];
        var unexpected = _strictGuards.domMutations.filter(function(m) {
            return containerIds.indexOf(m.target) !== -1;
        });
        addResult('INT-03', 'No Unexpected DOM Mutations',
            unexpected.length === 0 ? 'PASS' : 'FAIL',
            unexpected.length === 0 ?
            _strictGuards.domMutations.length + ' total mutations (all expected: test modal/badge/infrastructure)' :
            unexpected.length + ' result-container mutations: ' + unexpected.slice(0, 5).map(function(m) { return m.target + '(' + m.type + ')'; }).join(', '));
    })();

    // INT-04: Core mapping objects frozen
    (function() {
        var issues = [];
        if (!_strictGuards.freezeOK) issues.push('Object.freeze operation failed');
        // Verify frozen arrays can't be mutated
        if (typeof PROHIBITED_DISPLAY_FIELDS !== 'undefined') {
            var origLen = PROHIBITED_DISPLAY_FIELDS.length;
            try { PROHIBITED_DISPLAY_FIELDS.push('__TEST__'); } catch(e) { /* strict mode throw — good */ }
            if (PROHIBITED_DISPLAY_FIELDS.length !== origLen) {
                issues.push('PROHIBITED_DISPLAY_FIELDS is mutable (push succeeded)');
                PROHIBITED_DISPLAY_FIELDS.pop();
            }
        }
        if (typeof PROHIBITED_LEAK_FIELDS !== 'undefined') {
            var origLen2 = PROHIBITED_LEAK_FIELDS.length;
            try { PROHIBITED_LEAK_FIELDS.push('__TEST__'); } catch(e) { /* good */ }
            if (PROHIBITED_LEAK_FIELDS.length !== origLen2) {
                issues.push('PROHIBITED_LEAK_FIELDS is mutable (push succeeded)');
                PROHIBITED_LEAK_FIELDS.pop();
            }
        }
        addResult('INT-04', 'Core Mappings Immutable',
            issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length === 0 ? 'Frozen: ' + _strictGuards.frozenObjects.join(', ') : issues.join('; '));
    })();

    // INT-05: Dataset unchanged by test run
    (function() {
        addResult('INT-05', 'Dataset Unchanged by Tests',
            _strictGuards.datasetHashBefore === _strictGuards.datasetHashAfter ? 'PASS' : 'FAIL',
            _strictGuards.datasetHashBefore === _strictGuards.datasetHashAfter ?
            'Hash stable: ' + _strictGuards.datasetHashBefore :
            'DATASET MUTATED: before=' + _strictGuards.datasetHashBefore + ' after=' + _strictGuards.datasetHashAfter);
    })();

    // INT-06: No conditional skip-to-pass logic in test source
    (function() {
        var TEST_FNS = ['NoVOWDriftTests','AllowlistLeakTests','SearchCorrectnessTests','SecurityHardeningV2Tests','AccessibilityRESOPerfTests','MutationRegressionTests','REBNYComplianceDoctor','REBNYWiringTest','REBNYBehaviorTest','REBNYComplianceExtended'];
        var violations = [];
        // Forbidden: if (!x) { ... 'PASS' ... return; }  or  if (!x) return 'PASS'
        var skipPassRx = /if\s*\(\s*![\w.]+\s*\)\s*\{[^}]*'PASS'[^}]*return/;
        TEST_FNS.forEach(function(fn) {
            if (typeof window[fn] === 'function') {
                var src = window[fn].toString();
                if (skipPassRx.test(src)) violations.push(fn + ': skip-to-pass pattern detected');
            }
        });
        addResult('INT-06', 'No Skip-to-Pass Logic',
            violations.length === 0 ? 'PASS' : 'FAIL',
            violations.length === 0 ? TEST_FNS.length + ' functions scanned, 0 skip-to-pass patterns' :
            violations.join('; '));
    })();

    return { mode: 'strict_integrity', results: results, summary: { passed: passed, failed: failed, warnings: 0, total: results.length } };
}
