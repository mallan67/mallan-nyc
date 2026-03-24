// ─── TEST SUITE TABBED MODAL ────────────────────────────────────────
function showTestSuiteModal(report, initialTab) {
    var existing = document.getElementById('complianceDoctorModal');
    if (existing) existing.remove();

    var SC = { PASS: '#16a34a', FAIL: '#dc2626', WARN: '#d97706', SKIP: '#9ca3af' };
    var SB = { PASS: '#f0fdf4', FAIL: '#fef2f2', WARN: '#fffbeb', SKIP: '#f9fafb' };
    var SI = { PASS: 'fa-check-circle', FAIL: 'fa-times-circle', WARN: 'fa-exclamation-triangle', SKIP: 'fa-forward' };

    function rows(arr) {
        var h = '';
        arr.forEach(function(t) {
            h += '<div style="padding:8px 14px;border-bottom:1px solid #f3f4f6;display:flex;gap:10px;align-items:flex-start;background:' + (SB[t.status]||'#fff') + '">' +
                '<div style="flex-shrink:0;width:20px;text-align:center;padding-top:1px;"><i class="fas ' + (SI[t.status]||'fa-circle') + '" style="color:' + (SC[t.status]||'#6b7280') + ';font-size:13px;"></i></div>' +
                '<div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:12px;color:#1f2937;">' + t.test + ': ' + t.name +
                    '<span style="margin-left:8px;font-size:9px;font-weight:600;color:' + (SC[t.status]||'#6b7280') + ';text-transform:uppercase;letter-spacing:0.5px;">' + t.status + '</span></div>' +
                    '<div style="font-size:11px;color:#6b7280;margin-top:1px;word-break:break-word;">' + t.detail + '</div></div></div>';
        });
        return h;
    }

    var tabs = [
        { id: 'wiring', label: 'Wiring', icon: 'fa-plug', results: report.suites.wiring.results, summary: report.suites.wiring.summary },
        { id: 'behavior', label: 'Behavior', icon: 'fa-mouse-pointer', results: report.suites.behavior.results, summary: report.suites.behavior.summary },
        { id: 'compliance', label: 'Compliance', icon: 'fa-shield-alt',
            results: report.suites.compliance_core.results.concat(report.suites.compliance_extended.results),
            summary: { passed: report.suites.compliance_core.summary.passed + report.suites.compliance_extended.summary.passed, failed: report.suites.compliance_core.summary.failed + report.suites.compliance_extended.summary.failed, warnings: report.suites.compliance_core.summary.warnings + report.suites.compliance_extended.summary.warnings, total: report.suites.compliance_core.summary.total + report.suites.compliance_extended.summary.total } },
        { id: 'novow', label: 'No-VOW', icon: 'fa-lock', results: report.suites.no_vow.results, summary: report.suites.no_vow.summary },
        { id: 'allowlist', label: 'Allowlist', icon: 'fa-filter', results: report.suites.allowlist.results, summary: report.suites.allowlist.summary },
        { id: 'search', label: 'Search+', icon: 'fa-search', results: report.suites.search_correctness.results, summary: report.suites.search_correctness.summary },
        { id: 'hardening', label: 'Hardening', icon: 'fa-lock',
            results: report.suites.security_v2.results.concat(report.suites.a11y_reso_perf.results).concat(report.suites.regression.results),
            summary: { passed: report.suites.security_v2.summary.passed + report.suites.a11y_reso_perf.summary.passed + report.suites.regression.summary.passed, failed: report.suites.security_v2.summary.failed + report.suites.a11y_reso_perf.summary.failed + report.suites.regression.summary.failed, warnings: (report.suites.security_v2.summary.warnings||0) + (report.suites.a11y_reso_perf.summary.warnings||0) + (report.suites.regression.summary.warnings||0), total: report.suites.security_v2.summary.total + report.suites.a11y_reso_perf.summary.total + report.suites.regression.summary.total } },
        { id: 'integrity', label: 'Integrity', icon: 'fa-fingerprint',
            results: report.suites.strict_integrity.results.concat(report.suites.source_integrity.results),
            summary: { passed: report.suites.strict_integrity.summary.passed + report.suites.source_integrity.summary.passed, failed: report.suites.strict_integrity.summary.failed + report.suites.source_integrity.summary.failed, warnings: 0, total: report.suites.strict_integrity.summary.total + report.suites.source_integrity.summary.total } }
    ];

    var tBtns = '', tPanels = '';
    tabs.forEach(function(tab, idx) {
        var c = tab.summary.failed > 0 ? '#dc2626' : (tab.summary.warnings > 0 ? '#d97706' : '#16a34a');
        var active = initialTab ? (tab.id === initialTab) : (idx === 0);
        tBtns += '<button class="tsTab" data-tab="' + tab.id + '" style="padding:8px 14px;font-size:11px;font-weight:600;border:none;cursor:pointer;border-bottom:2px solid ' + (active?'#3b82f6':'transparent') + ';background:' + (active?'#eff6ff':'transparent') + ';color:' + (active?'#1d4ed8':'#6b7280') + ';border-radius:6px 6px 0 0;transition:all 0.15s;"><i class="fas ' + tab.icon + '" style="margin-right:4px"></i>' + tab.label + '<span style="margin-left:6px;color:' + c + ';font-size:10px;">' + tab.summary.passed + '/' + tab.summary.total + '</span></button>';
        tPanels += '<div class="tsPanel" data-tab="' + tab.id + '" style="display:' + (active?'block':'none') + ';">' + rows(tab.results) + '</div>';
    });

    var s = report.summary, ac = s.total - s.skipped;
    var sC = s.failed > 0 ? '#dc2626' : (s.warnings > 0 ? '#d97706' : '#16a34a');
    var sBg = s.failed > 0 ? '#fef2f2' : (s.warnings > 0 ? '#fffbeb' : '#f0fdf4');
    var sI = s.failed > 0 ? 'fa-times-circle' : (s.warnings > 0 ? 'fa-exclamation-triangle' : 'fa-check-circle');

    var modal = document.createElement('div');
    modal.id = 'complianceDoctorModal';
    modal.style.cssText = 'position:fixed;top:0;right:0;bottom:0;z-index:99999;display:flex;align-items:stretch;justify-content:flex-end;background:rgba(0,0,0,0.2);width:100%;pointer-events:auto;';
    modal.innerHTML =
        '<div style="background:white;border-radius:14px 0 0 14px;box-shadow:-8px 0 30px rgba(0,0,0,0.15);width:420px;max-width:92vw;height:100%;display:flex;flex-direction:column;font-family:system-ui,-apple-system,sans-serif;pointer-events:auto;">' +
            '<div style="padding:14px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">' +
                '<div><div style="font-weight:700;font-size:15px;color:#1f2937;"><i class="fas fa-shield-alt" style="color:#3b82f6;margin-right:6px;"></i>REBNY Test Suite</div>' +
                '<div style="font-size:10px;color:#9ca3af;margin-top:2px;">v' + report.version + ' &middot; ' + new Date(report.timestamp).toLocaleString() + ' &middot; ' + report.context + '</div></div>' +
                '<button onclick="document.getElementById(\'complianceDoctorModal\').remove()" style="background:none;border:none;font-size:22px;color:#9ca3af;cursor:pointer;padding:0 4px;line-height:1;">&times;</button>' +
            '</div>' +
            '<div style="padding:0 12px;border-bottom:1px solid #e5e7eb;display:flex;gap:2px;flex-shrink:0;background:#fafafa;overflow-x:auto;-webkit-overflow-scrolling:touch;">' + tBtns + '</div>' +
            '<div id="tsPanelContainer" style="overflow-y:auto;flex:1;">' + tPanels + '</div>' +
            '<div style="padding:10px 20px;border-top:1px solid #e5e7eb;background:' + sBg + ';border-radius:0 0 14px 14px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">' +
                '<div style="font-size:12px;font-weight:700;color:' + sC + ';"><i class="fas ' + sI + '" style="margin-right:5px;"></i>' + ac + ' tested: ' + s.passed + ' pass' + (s.warnings > 0 ? ', ' + s.warnings + ' warn' : '') + (s.failed > 0 ? ', ' + s.failed + ' fail' : '') + (s.skipped > 0 ? ' <span style="color:#9ca3af;font-weight:500;">(' + s.skipped + ' skipped)</span>' : '') + '</div>' +
                '<div style="display:flex;gap:6px;">' +
                    '<button onclick="runActiveTests()" style="padding:5px 12px;background:#f59e0b;color:white;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;" title="Runs Zero-Result, High Volume, Rapid Toggle, Violation Injection"><i class="fas fa-play" style="margin-right:3px"></i>Run Active</button>' +
                    '<button onclick="document.getElementById(\'complianceDoctorModal\').remove()" style="padding:5px 12px;background:#1f2937;color:white;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">Close</button>' +
                '</div>' +
            '</div>' +
        '</div>';

    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);

    modal.querySelectorAll('.tsTab').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var tid = this.getAttribute('data-tab');
            _tsActiveTab = tid;
            modal.querySelectorAll('.tsTab').forEach(function(b) { b.style.borderBottom = '2px solid transparent'; b.style.background = 'transparent'; b.style.color = '#6b7280'; });
            this.style.borderBottom = '2px solid #3b82f6'; this.style.background = '#eff6ff'; this.style.color = '#1d4ed8';
            modal.querySelectorAll('.tsPanel').forEach(function(p) { p.style.display = p.getAttribute('data-tab') === tid ? 'block' : 'none'; });
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENDED REBNY TEST SUITE v1.1 — 27 New Tests
// No-VOW Drift (NV1-5) | Allowlist Leak (AL1-5) | Search Correctness (S1-4)
// Security Hardening (X1-3) | A11Y + RESO + Perf (7) | Mutation/Regression (R1-3)
