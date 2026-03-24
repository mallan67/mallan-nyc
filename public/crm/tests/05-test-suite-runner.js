// ─── MASTER TEST SUITE RUNNER ───────────────────────────────────────
var _tsRunning = false;
function REBNYTestSuite(options) {
    if (_tsRunning) return window._lastTestSuiteReport;
    _tsRunning = true;
    options = options || {};
    var verbose = options.verbose || false;
    var runActive = options.runActive || false;
    var context = options.context || 'render';

    // ── STRICT INTEGRITY v2.0: Setup guards BEFORE any tests ──
    setupStrictGuards();

    // All suites wrapped in safeSuiteCall: exceptions → FAIL (Rule 3)
    var doctor = safeSuiteCall(REBNYComplianceDoctor, { verbose: false, context: context }, 'compliance_core');
    var wiring = safeSuiteCall(REBNYWiringTest, { context: context }, 'wiring');
    var behavior = safeSuiteCall(REBNYBehaviorTest, { runActive: runActive, context: context }, 'behavior');
    var extended = safeSuiteCall(REBNYComplianceExtended, { runActive: runActive, context: context }, 'compliance_extended');
    var noVow = safeSuiteCall(NoVOWDriftTests, { runActive: runActive, context: context }, 'no_vow');
    var allowlist = safeSuiteCall(AllowlistLeakTests, { runActive: runActive, context: context }, 'allowlist');
    var searchCorr = safeSuiteCall(SearchCorrectnessTests, { runActive: runActive, context: context }, 'search_correctness');
    var secV2 = safeSuiteCall(SecurityHardeningV2Tests, { runActive: runActive, context: context }, 'security_v2');
    var arp = safeSuiteCall(AccessibilityRESOPerfTests, { runActive: runActive, context: context }, 'a11y_reso_perf');
    var regression = safeSuiteCall(MutationRegressionTests, { runActive: runActive, context: context }, 'regression');

    // ── STRICT INTEGRITY v2.0: Teardown guards, then run integrity checks ──
    teardownStrictGuards();
    var integrity = safeSuiteCall(StrictIntegrityTests, { context: context }, 'strict_integrity');
    var source = safeSuiteCall(SourceIntegrityTests, { context: context }, 'source_integrity');

    var allSuites = [wiring, behavior, doctor, extended, noVow, allowlist, searchCorr, secV2, arp, regression, integrity, source];
    var tP = 0, tF = 0, tW = 0, tT = 0, skipped = 0;
    allSuites.forEach(function(s) {
        tP += s.summary.passed; tF += s.summary.failed; tW += (s.summary.warnings || 0); tT += s.summary.total;
        s.results.forEach(function(t) { if (t.status === 'SKIP') skipped++; });
    });

    var report = {
        version: TEST_SUITE_VERSION + '+ext' + EXTENDED_SUITE_VERSION,
        timestamp: new Date().toISOString(),
        context: context,
        agent: typeof LOGGED_IN_AGENT !== 'undefined' ? LOGGED_IN_AGENT.name : 'unknown',
        suites: { wiring: wiring, behavior: behavior, compliance_core: doctor, compliance_extended: extended,
                  no_vow: noVow, allowlist: allowlist, search_correctness: searchCorr,
                  security_v2: secV2, a11y_reso_perf: arp, regression: regression,
                  strict_integrity: integrity, source_integrity: source },
        summary: { passed: tP, failed: tF, warnings: tW, skipped: skipped, total: tT }
    };

    // Save to localStorage for broker admin dashboard
    saveTestSuiteHistory(report);

    _tsRunning = false;
    window._lastTestSuiteReport = report;
    updateTestSuiteBadge(report);
    if (verbose) showTestSuiteModal(report);
    return report;
}

// ─── SAVE TEST RESULTS TO BROKER ADMIN ──────────────────────────────
function saveTestSuiteHistory(report) {
    var key = 'rebny_test_suite_history';
    var history = [];
    try { history = JSON.parse(localStorage.getItem(key)) || []; } catch(e) {}
    history.push({
        timestamp: report.timestamp,
        context: report.context,
        agent: report.agent,
        summary: report.summary,
        suites: {
            wiring: report.suites.wiring.summary,
            behavior: report.suites.behavior.summary,
            compliance_core: report.suites.compliance_core.summary,
            compliance_extended: report.suites.compliance_extended.summary
        }
    });
    if (history.length > 100) history = history.slice(-100);
    localStorage.setItem(key, JSON.stringify(history));
}

// ─── TEST SUITE BADGE ───────────────────────────────────────────────
function updateTestSuiteBadge(report) {
    var badge = document.getElementById('complianceDoctorBadge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'complianceDoctorBadge';
        badge.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:9999;padding:4px 10px;border-radius:8px;font-size:10px;font-weight:600;font-family:system-ui,sans-serif;cursor:pointer;box-shadow:0 1px 6px rgba(0,0,0,0.12);transition:all 0.3s;line-height:1.3;opacity:0.85;';
        badge.title = 'Click for REBNY Test Suite report';
        badge.addEventListener('click', function() { var r = window._lastTestSuiteReport; if (r) showTestSuiteModal(r); });
        document.body.appendChild(badge);
    }
    var s = report.summary, ac = s.total - s.skipped;
    if (s.failed > 0) {
        badge.style.background = '#fef2f2'; badge.style.color = '#dc2626'; badge.style.border = '1.5px solid #fca5a5';
        badge.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right:4px"></i>REBNY Test Suite<br><span style="font-size:10px;opacity:0.85">' + s.passed + '/' + ac + ' pass, ' + s.failed + ' fail</span>';
    } else if (s.warnings > 0) {
        badge.style.background = '#fffbeb'; badge.style.color = '#d97706'; badge.style.border = '1.5px solid #fcd34d';
        badge.innerHTML = '<i class="fas fa-shield-alt" style="margin-right:4px"></i>REBNY Test Suite<br><span style="font-size:10px;opacity:0.85">' + s.passed + '/' + ac + ' pass, ' + s.warnings + ' warn</span>';
    } else {
        badge.style.background = '#f0fdf4'; badge.style.color = '#16a34a'; badge.style.border = '1.5px solid #86efac';
        badge.innerHTML = '<i class="fas fa-shield-alt" style="margin-right:4px"></i>REBNY Test Suite<br><span style="font-size:10px;opacity:0.85">' + ac + '/' + ac + ' pass</span>';
    }
}

// ─── RUN ACTIVE TESTS (preserves current tab) ──────────────────────
var _tsActiveTab = 'wiring';
function runActiveTests() {
    var r = REBNYTestSuite({ verbose: false, runActive: true, context: 'manual' });
    showTestSuiteModal(r, _tsActiveTab);
}

