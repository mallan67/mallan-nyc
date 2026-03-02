// ═══════════════════════════════════════════════════════════════════════════════

var COMPLIANCE_DOCTOR_VERSION = '1.0.0';

/**
 * PROHIBITED_FIELDS — fields that must NEVER appear in IDX/client-facing output.
 * These may exist in RLS data for agent use, but cannot be displayed publicly
 * or in client deliverables (print/email/preview).
 */
var PROHIBITED_DISPLAY_FIELDS = [
    'BuyerAgentCompensation', 'BuyerBrokerageCompensation', 'BuyerBrokerageCompensationType',
    'PrivateRemarks', 'ShowingInstructions', 'LockBoxSerialNumber',
    'KeyLocation', 'OwnerName', 'OwnerPhone'
];

/**
 * REBNYComplianceDoctor() — runs all 10 compliance checks
 * @param {Object} options — { verbose: bool, context: 'render'|'print'|'email'|'pageload' }
 * @returns {Object} — { passed: number, failed: number, warnings: number, results: [] }
 */
function REBNYComplianceDoctor(options) {
    options = options || {};
    var verbose = options.verbose || false;
    var context = options.context || 'render';
    var results = [];
    var passed = 0, failed = 0, warnings = 0;

    function addResult(testNum, name, status, detail) {
        results.push({ test: testNum, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++;
        else if (status === 'FAIL') failed++;
        else warnings++;
    }

    // ─── Test 1: Attribution Display ───────────────────────────────────────
    (function test1_Attribution() {
        var rebnyText = false;
        var allDivs = document.querySelectorAll('div');
        for (var i = 0; i < allDivs.length; i++) {
            var text = allDivs[i].textContent || '';
            if (text.indexOf('REBNY RLS') !== -1 && text.indexOf('Trestle') !== -1) {
                rebnyText = true;
                break;
            }
        }
        var licenseFound = document.body.innerHTML.indexOf('10991205323') !== -1;

        if (rebnyText && licenseFound) {
            addResult(1, 'Attribution Display', 'PASS', 'REBNY RLS attribution bar and brokerage license found');
        } else if (rebnyText) {
            addResult(1, 'Attribution Display', 'FAIL', 'REBNY attribution found but brokerage license number 10991205323 missing');
        } else {
            addResult(1, 'Attribution Display', 'FAIL', 'REBNY RLS attribution bar not found on page');
        }
    })();

    // ─── Test 2: Opt-Out Filtering ─────────────────────────────────────────
    (function test2_OptOut() {
        if (typeof checkListingCompliance !== 'function') {
            addResult(2, 'Opt-Out Filtering', 'FAIL', 'checkListingCompliance() function not found');
            return;
        }
        var fnSource = checkListingCompliance.toString();
        var checksIdx = fnSource.indexOf('idxDisplayYN') !== -1;
        var checksAddress = fnSource.indexOf('addressDisplayYN') !== -1;

        if (checksIdx && checksAddress) {
            addResult(2, 'Opt-Out Filtering', 'PASS', 'checkListingCompliance() gates IDX opt-out and address suppression');
        } else if (checksIdx) {
            addResult(2, 'Opt-Out Filtering', 'FAIL', 'IDX opt-out checked but addressDisplayYN suppression missing');
        } else {
            addResult(2, 'Opt-Out Filtering', 'FAIL', 'checkListingCompliance() does not check idxDisplayYN');
        }
    })();

    // ─── Test 3: Status Accuracy ───────────────────────────────────────────
    (function test3_Status() {
        // RESO StandardStatus values — both underscore and camelCase forms accepted
        var validStatuses = [
            'ACTIVE', 'PENDING', 'CLOSED', 'COMING_SOON', 'COMINGSOON',
            'WITHDRAWN', 'EXPIRED', 'CANCELED', 'HOLD', 'INCOMPLETE'
        ];
        var statusElements = document.querySelectorAll('[data-reso-field="MlsStatus"]');
        var invalidCount = 0;
        var totalChecked = 0;
        var invalidValues = [];

        statusElements.forEach(function(el) {
            var val = el.getAttribute('data-reso-value');
            if (!val) return; // Skip elements without data-reso-value (column headers, labels)
            totalChecked++;
            val = val.trim().toUpperCase();
            if (validStatuses.indexOf(val) === -1) { invalidCount++; invalidValues.push(val); }
        });
        var statusCheckboxes = document.querySelectorAll('input[data-field="MlsStatus"]');
        statusCheckboxes.forEach(function(cb) {
            var rawVal = (cb.getAttribute('data-value') || '');
            var vals = rawVal.split(',');
            vals.forEach(function(v) {
                v = v.trim().toUpperCase();
                if (!v) return;
                totalChecked++;
                if (validStatuses.indexOf(v) === -1) { invalidCount++; invalidValues.push(v); }
            });
        });

        if (invalidCount === 0 && totalChecked > 0) {
            addResult(3, 'Status Accuracy', 'PASS', totalChecked + ' status values checked, all valid RESO StandardStatus');
        } else if (invalidCount === 0) {
            addResult(3, 'Status Accuracy', 'FAIL', 'No status elements found in current view to validate — required infrastructure missing');
        } else {
            addResult(3, 'Status Accuracy', 'FAIL', invalidCount + ' of ' + totalChecked + ' non-standard: ' + invalidValues.join(', '));
        }
    })();

    // ─── Test 4: Prohibited Field Display (NEW) ───────────────────────────
    (function test4_ProhibitedFields() {
        var violations = [];
        PROHIBITED_DISPLAY_FIELDS.forEach(function(field) {
            var found = document.querySelectorAll(
                '[data-reso-field="' + field + '"], [data-field="' + field + '"]'
            );
            found.forEach(function(el) {
                var parent = el.closest('[data-access-level]');
                if (parent && parent.getAttribute('data-access-level') === 'agent-only') return;
                if (el.closest('#reportFieldSelector') || el.type === 'checkbox') return;
                violations.push(field + ' displayed in DOM');
            });
        });

        var resultContainers = document.querySelectorAll(
            '#gridViewContainer, #galleryViewContainer, #shortSummaryViewContainer, ' +
            '#summaryViewContainer, #masterDetailViewContainer'
        );
        resultContainers.forEach(function(container) {
            if (container.style.display === 'none') return;
            var html = container.innerHTML || '';
            if (/buyer\s*(agent\s*)?comp(ensation)?/i.test(html) && html.indexOf('checkbox') === -1) {
                violations.push('Buyer compensation text found in visible results');
            }
        });

        if (violations.length === 0) {
            addResult(4, 'Prohibited Field Display', 'PASS', 'No prohibited fields found in display output');
        } else {
            addResult(4, 'Prohibited Field Display', 'FAIL', violations.length + ' violation(s): ' + violations.join('; '));
        }
    })();

    // ─── Test 5: Fair Housing Language ─────────────────────────────────────
    (function test5_FairHousing() {
        var scannerPresent = typeof checkFairHousing === 'function' ||
                             typeof FAIR_HOUSING_VIOLATIONS !== 'undefined';

        var fhPatterns = [
            /\b(exclusive|prestigious)\s+(neighborhood|area|community)\b/i,
            /\b(family[\s-]friendly|bachelor\s+pad|singles?\s+only|couples?\s+only)\b/i,
            /\b(church|synagogue|mosque|temple)\s+(nearby|close|walking)\b/i,
            /\b(no\s+children|adults?\s+only|senior\s+only|55\s*\+)\b/i,
            /\b(perfect\s+for\s+(young|retired|single|married))\b/i
        ];
        var fhViolations = [];
        var descriptionAreas = document.querySelectorAll(
            '#publicDescription, [data-reso-field="PublicRemarks"], .listing-description'
        );
        descriptionAreas.forEach(function(el) {
            var text = el.textContent || el.value || '';
            fhPatterns.forEach(function(pat) {
                var match = text.match(pat);
                if (match) fhViolations.push(match[0]);
            });
        });

        if (scannerPresent && fhViolations.length === 0) {
            addResult(5, 'Fair Housing Language', 'PASS', 'Fair Housing scanner active, no violations in visible descriptions');
        } else if (fhViolations.length > 0) {
            addResult(5, 'Fair Housing Language', 'FAIL', 'Fair Housing violations found: ' + fhViolations.join(', '));
        } else {
            addResult(5, 'Fair Housing Language', 'FAIL', 'Fair Housing scanner function not detected — checkFairHousing() or FAIR_HOUSING_VIOLATIONS required');
        }
    })();

    // ─── Test 6: Required Field Display ────────────────────────────────────
    (function test6_RequiredFields() {
        var requiredResoFields = [
            'UnparsedAddress', 'ListPrice', 'BedroomsTotal', 'BathroomsTotalInteger',
            'MlsStatus', 'PropertyType', 'ListAgentFullName', 'ListOfficeName',
            'ListingId', 'OnMarketDate'
        ];
        var missingFields = [];

        if (typeof gridColumnDefs !== 'undefined') {
            var definedReso = [];
            Object.keys(gridColumnDefs).forEach(function(key) {
                if (gridColumnDefs[key].reso) definedReso.push(gridColumnDefs[key].reso);
            });
            requiredResoFields.forEach(function(field) {
                var found = definedReso.some(function(d) {
                    return d === field || d.indexOf(field) !== -1 || field.indexOf(d) !== -1;
                });
                if (!found) missingFields.push(field);
            });
        }

        if (missingFields.length === 0) {
            addResult(6, 'Required Field Display', 'PASS', 'All ' + requiredResoFields.length + ' required RESO fields defined in grid columns');
        } else {
            addResult(6, 'Required Field Display', 'FAIL', missingFields.length + ' required RESO field(s) missing from grid columns: ' + missingFields.join(', '));
        }
    })();

    // ─── Test 7: Data Freshness ────────────────────────────────────────────
    (function test7_Freshness() {
        var timestampEls = document.querySelectorAll('.data-timestamp');
        var stale = false;
        var freshestDate = null;
        var now = new Date();

        timestampEls.forEach(function(el) {
            var text = el.textContent.trim();
            if (!text) return;
            var d = new Date(text);
            if (!isNaN(d.getTime())) {
                if (!freshestDate || d > freshestDate) freshestDate = d;
                if ((now - d) / (1000 * 60 * 60) > 24) stale = true;
            }
        });

        if (freshestDate && !stale) {
            addResult(7, 'Data Freshness', 'PASS', 'Data timestamp within 24 hours: ' + freshestDate.toLocaleString());
        } else if (freshestDate && stale) {
            var hoursOld = Math.round((now - freshestDate) / (1000 * 60 * 60));
            addResult(7, 'Data Freshness', 'FAIL', 'Stale data: ' + hoursOld + 'h old (max 24h). Last update: ' + freshestDate.toLocaleString());
        } else {
            addResult(7, 'Data Freshness', 'FAIL', 'No .data-timestamp elements found — freshness tracking infrastructure missing');
        }
    })();

    // ─── Test 8: Commingling Prevention (NEW) ──────────────────────────────
    (function test8_Commingling() {
        var resultCards = document.querySelectorAll('[data-listing-id]');
        var totalListings = resultCards.length;
        var sourceLabeledCards = document.querySelectorAll('[data-source="REBNY-RLS"]');

        if (totalListings === 0) {
            addResult(8, 'Commingling Prevention', 'PASS', 'No listings displayed — no commingling risk');
        } else if (sourceLabeledCards.length >= totalListings) {
            addResult(8, 'Commingling Prevention', 'PASS', 'All ' + totalListings + ' listings have data-source labels');
        } else {
            addResult(8, 'Commingling Prevention', 'FAIL',
                (totalListings - sourceLabeledCards.length) + '/' + totalListings + ' listings lack data-source="REBNY-RLS" attribute — commingling risk');
        }
    })();

    // ─── Test 9: Print/Email Compliance ────────────────────────────────────
    (function test9_PrintEmail() {
        var checks = [];
        if (typeof printListingSheet === 'function') {
            var src = printListingSheet.toString();
            if (src.indexOf('checkListingCompliance') !== -1) checks.push('print:gate');
            if (src.indexOf('logAuditEntry') !== -1) checks.push('print:audit');
        }
        if (typeof emailListingSheet === 'function') {
            var src = emailListingSheet.toString();
            if (src.indexOf('checkListingCompliance') !== -1) checks.push('email:gate');
            if (src.indexOf('logAuditEntry') !== -1) checks.push('email:audit');
        }
        if (typeof previewListingSheet === 'function') {
            var src = previewListingSheet.toString();
            if (src.indexOf('checkListingCompliance') !== -1) checks.push('preview:gate');
        }
        if (typeof generateSingleListingSheet === 'function') {
            var src = generateSingleListingSheet.toString();
            if (src.indexOf('suppressAddress') !== -1 || src.indexOf('Address Available') !== -1) checks.push('sheet:addressSuppress');
        }
        // Check branding/attribution in parent generateListingSheet (which wraps single cards)
        var sheetSrc = '';
        if (typeof generateListingSheet === 'function') sheetSrc = generateListingSheet.toString();
        if (typeof generateSingleListingSheet === 'function') sheetSrc += generateSingleListingSheet.toString();
        if (sheetSrc.indexOf('MALLAN REAL ESTATE') !== -1 || sheetSrc.indexOf('Mallan Real Estate') !== -1 || sheetSrc.indexOf('10991205323') !== -1) checks.push('sheet:branding');
        if (sheetSrc.indexOf('REBNY') !== -1 || sheetSrc.indexOf('Equal Housing') !== -1) checks.push('sheet:attribution');

        var expected = ['print:gate', 'print:audit', 'email:gate', 'email:audit', 'preview:gate', 'sheet:addressSuppress', 'sheet:branding', 'sheet:attribution'];
        var missing = expected.filter(function(e) { return checks.indexOf(e) === -1; });

        if (missing.length === 0) {
            addResult(9, 'Print/Email Compliance', 'PASS', 'All 8 output checks pass');
        } else {
            addResult(9, 'Print/Email Compliance', 'FAIL', missing.length + '/8 checks missing: ' + missing.join(', '));
        }
    })();

    // ─── Test 10: Bulk Export Restriction (NEW) ────────────────────────────
    (function test10_BulkExport() {
        var BULK_LIMIT = 25;
        if (typeof selectAllResults !== 'function') {
            addResult(10, 'Bulk Export Restriction', 'FAIL', 'selectAllResults() not found — required bulk selection function missing');
            return;
        }
        var allCheckboxes = document.querySelectorAll('.listing-checkbox');
        if (allCheckboxes.length <= BULK_LIMIT) {
            addResult(10, 'Bulk Export Restriction', 'PASS', allCheckboxes.length + ' listings (within ' + BULK_LIMIT + ' limit)');
        } else {
            addResult(10, 'Bulk Export Restriction', 'FAIL',
                allCheckboxes.length + ' listings exceed ' + BULK_LIMIT + ' bulk export limit');
        }
    })();

    // ─── Compile & Log Report ──────────────────────────────────────────────
    var report = {
        version: COMPLIANCE_DOCTOR_VERSION,
        timestamp: new Date().toISOString(),
        context: context,
        agent: typeof LOGGED_IN_AGENT !== 'undefined' ? LOGGED_IN_AGENT.name : 'unknown',
        summary: { passed: passed, failed: failed, warnings: warnings, total: results.length },
        results: results
    };

    if (typeof logAuditEntry === 'function') {
        logAuditEntry('compliance_doctor', { version: report.version, context: context, passed: passed, failed: failed, warnings: warnings });
    }

    var icon = failed > 0 ? 'FAIL' : 'PASS';
    console.log('[REBNY Compliance Doctor v' + COMPLIANCE_DOCTOR_VERSION + '] ' + icon +
        ' — ' + passed + ' pass, ' + failed + ' fail (' + context + ')');
    if (verbose) {
        results.forEach(function(r) {
            console.log('  ' + r.status + ' Test ' + r.test + ': ' + r.name + ' — ' + r.detail);
        });
    }

    updateComplianceBadge(report);
    return report;
}

/**
 * Floating compliance status badge — bottom-right corner.
 * Green = all pass, Yellow = warnings, Red = failures. Click for full report.
 */
function updateComplianceBadge(report) {
    var badge = document.getElementById('complianceDoctorBadge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'complianceDoctorBadge';
        badge.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:9999;padding:6px 12px;' +
            'border-radius:8px;font-size:11px;font-weight:600;font-family:system-ui,sans-serif;' +
            'cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.15);transition:opacity 0.3s;';
        badge.title = 'Click for REBNY Compliance Doctor report';
        badge.addEventListener('click', function() {
            var r = window._lastComplianceReport;
            if (!r) return;
            showComplianceDoctorModal(r);
        });
        document.body.appendChild(badge);
    }
    window._lastComplianceReport = report;

    var s = report.summary;
    if (s.failed > 0) {
        badge.style.background = '#fef2f2'; badge.style.color = '#dc2626'; badge.style.border = '1px solid #fca5a5';
        badge.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right:4px"></i>' + s.failed + ' compliance issue' + (s.failed > 1 ? 's' : '');
    } else if (s.warnings > 0) {
        badge.style.background = '#fffbeb'; badge.style.color = '#d97706'; badge.style.border = '1px solid #fcd34d';
        badge.innerHTML = '<i class="fas fa-info-circle" style="margin-right:4px"></i>' + s.passed + '/' + s.total + ' pass, ' + s.warnings + ' warn';
    } else {
        badge.style.background = '#f0fdf4'; badge.style.color = '#16a34a'; badge.style.border = '1px solid #86efac';
        badge.innerHTML = '<i class="fas fa-check-circle" style="margin-right:4px"></i>' + s.total + '/' + s.total + ' pass';
    }
}

/**
 * Show Compliance Doctor results in a scrollable modal
 */
function showComplianceDoctorModal(r) {
    var existing = document.getElementById('complianceDoctorModal');
    if (existing) existing.remove();

    var statusColors = { PASS: '#16a34a', FAIL: '#dc2626', WARN: '#d97706' };
    var statusBg = { PASS: '#f0fdf4', FAIL: '#fef2f2', WARN: '#fffbeb' };
    var statusIcons = { PASS: 'fa-check-circle', FAIL: 'fa-times-circle', WARN: 'fa-exclamation-triangle' };

    var rows = '';
    r.results.forEach(function(t) {
        rows += '<div style="padding:10px 14px;border-bottom:1px solid #f3f4f6;display:flex;gap:10px;align-items:flex-start;background:' + (statusBg[t.status] || '#fff') + '">' +
            '<div style="flex-shrink:0;width:20px;text-align:center;padding-top:1px;">' +
                '<i class="fas ' + (statusIcons[t.status] || 'fa-circle') + '" style="color:' + (statusColors[t.status] || '#6b7280') + ';font-size:14px;"></i>' +
            '</div>' +
            '<div style="flex:1;min-width:0;">' +
                '<div style="font-weight:700;font-size:13px;color:#1f2937;">Test ' + t.test + ': ' + t.name +
                    '<span style="margin-left:8px;font-size:10px;font-weight:600;color:' + (statusColors[t.status] || '#6b7280') + ';text-transform:uppercase;">' + t.status + '</span>' +
                '</div>' +
                '<div style="font-size:12px;color:#6b7280;margin-top:2px;word-break:break-word;">' + t.detail + '</div>' +
            '</div>' +
        '</div>';
    });

    var s = r.summary;
    var scoreColor = s.failed > 0 ? '#dc2626' : (s.warnings > 0 ? '#d97706' : '#16a34a');
    var scoreBg = s.failed > 0 ? '#fef2f2' : (s.warnings > 0 ? '#fffbeb' : '#f0fdf4');

    var modal = document.createElement('div');
    modal.id = 'complianceDoctorModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);';
    modal.innerHTML =
        '<div style="background:white;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:520px;max-width:90vw;max-height:85vh;display:flex;flex-direction:column;font-family:system-ui,-apple-system,sans-serif;">' +
            '<div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">' +
                '<div>' +
                    '<div style="font-weight:700;font-size:15px;color:#1f2937;"><i class="fas fa-shield-alt" style="color:#3b82f6;margin-right:6px;"></i>REBNY Compliance Doctor</div>' +
                    '<div style="font-size:11px;color:#9ca3af;margin-top:2px;">v' + r.version + ' &middot; ' + new Date(r.timestamp).toLocaleString() + ' &middot; ' + r.context + '</div>' +
                '</div>' +
                '<button onclick="document.getElementById(\'complianceDoctorModal\').remove()" style="background:none;border:none;font-size:22px;color:#9ca3af;cursor:pointer;padding:0 4px;line-height:1;">&times;</button>' +
            '</div>' +
            '<div style="overflow-y:auto;flex:1;">' + rows + '</div>' +
            '<div style="padding:12px 20px;border-top:1px solid #e5e7eb;background:' + scoreBg + ';border-radius:0 0 12px 12px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;">' +
                '<div style="font-size:13px;font-weight:700;color:' + scoreColor + ';">' +
                    '<i class="fas ' + (s.failed > 0 ? 'fa-times-circle' : (s.warnings > 0 ? 'fa-exclamation-triangle' : 'fa-check-circle')) + '" style="margin-right:6px;"></i>' +
                    s.passed + '/' + s.total + ' passed' + (s.warnings > 0 ? ', ' + s.warnings + ' warning' + (s.warnings > 1 ? 's' : '') : '') + (s.failed > 0 ? ', ' + s.failed + ' failed' : '') +
                '</div>' +
                '<button onclick="document.getElementById(\'complianceDoctorModal\').remove()" style="padding:6px 16px;background:#1f2937;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Close</button>' +
            '</div>' +
        '</div>';

    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}
