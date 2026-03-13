// ═══════════════════════════════════════════════════════════════════════
// REBNY TEST SUITE v1.2 — Wiring, Behavior, Compliance Extended
// STRICT NO-SUBSTITUTE / NO-BYPASS: Binary PASS/FAIL only. Zero tolerance.
// ═══════════════════════════════════════════════════════════════════════
var TEST_SUITE_VERSION = '1.2.0';

// ─── WIRING MODE (7 tests) ─ Data Integrity & Feed Conformance ──────
function REBNYWiringTest(options) {
    options = options || {};
    var results = [];
    var passed = 0, failed = 0, warnings = 0;
    function addResult(id, name, status, detail) {
        results.push({ test: id, name: name, status: status, detail: detail });
        if (status === 'PASS') passed++;
        else if (status === 'FAIL') failed++;
        else if (status === 'SKIP') { /* skip */ }
        else warnings++;
    }

    // ── W1: Field Parity Test ──────────────────────────────────────────
    (function() {
        var ALLOWED = ['SourceSystemKey','ListPrice','MlsStatus','PropertyType','PropertySubType','BedroomsTotal','BathroomsTotalInteger','LivingArea','YearBuilt','UnparsedAddress','City','StateOrProvince','PostalCode','Latitude','Longitude','ListAgentFullName','ListOfficeName','ListingAgreement','InternetEntireListingDisplayYN','InternetAddressDisplayYN','OwnerOptOut','ParticipantOnly','IDXEntireListingDisplayYN','SyndicateTo','ComingSoonTimestamp','ActivationDate','PublicRemarks','PrivateRemarks','ShowingInstructions','ListAgentEmail','ListAgentDirectPhone','MaintenanceFee','TaxAnnualAmount','CommonCharges','neighborhood','borough','photoCount','daysOnMarket','pricePerSqft','updatedDate','listedDate','buildingName','lotSize','stories','units','parkingFeatures','garageSpaces','listingCategory','CommonInterest','Ownership','PetsAllowed','LaundryFeatures','Amenities','CoolingYN','HeatingYN','FireplacesTotal','WaterfrontYN','ViewYN','TaxBlock','TaxLot','Zoning','FloorNumber','UnitNumber','Concessions','FinancialDataSource','AssociationFee','RentIncludes','NumberOfUnitsTotal','StoriesTotal','LotSizeArea','GarageYN','AssociationFee+TaxAnnualAmount','RoomsTotal','BathroomsFull','PhotosCount','DaysOnMarket','CumulativeDaysOnMarket','OnMarketDate','SourceSystemModificationTimestamp','OriginalListPrice','PreviousListPrice','PriceChangeTimestamp','VirtualTourURLBranded','CrossStreet','Exposures','View','WalkScore','EntryLevel','Flooring','Cooling','Heating','ParkingFeatures','ParkingTotal','PetsAllowedYN','AssociationAmenities','InteriorFeatures','SecurityFeatures','PropertyCondition','ClosePrice','CloseDate','BuildingName','SubdivisionName','ListingId','BuildingAreaTotal','BathroomsHalf'];
        var resoEls = document.querySelectorAll('[data-reso-field]');
        var unknown = [], seen = {};
        resoEls.forEach(function(el) {
            var f = el.getAttribute('data-reso-field');
            seen[f] = true;
            if (ALLOWED.indexOf(f) === -1 && unknown.indexOf(f) === -1) unknown.push(f);
        });
        var LEAKS = ['ListAgentMlsId','ListOfficeMlsId','OriginatingSystemName','OriginatingSystemKey','BuyerAgentMlsId','CoListAgentMlsId'];
        var bodyText = document.body.innerText || '';
        var leaked = LEAKS.filter(function(n) { return bodyText.indexOf(n) !== -1; });
        if (unknown.length === 0 && leaked.length === 0) {
            addResult('W1', 'Field Parity', 'PASS', Object.keys(seen).length + ' RESO fields, all in allowlist');
        } else {
            var d = [];
            if (unknown.length) d.push('Unknown: ' + unknown.join(', '));
            if (leaked.length) d.push('Leaked: ' + leaked.join(', '));
            addResult('W1', 'Field Parity', 'FAIL', d.join('; '));
        }
    })();

    // ── W2: Enum Integrity Test ────────────────────────────────────────
    (function() {
        var issues = [];
        var VS = ['Active','Pending','Closed','ComingSoon','Coming Soon','COMING_SOON','COMINGSOON','Withdrawn','Expired','Canceled','Hold','Incomplete','ActiveUnderContract','ACTIVE','PENDING','CLOSED','WITHDRAWN','EXPIRED','CANCELED','HOLD','INCOMPLETE','ACTIVE_UNDER_CONTRACT'];
        document.querySelectorAll('[data-reso-field="MlsStatus"][data-reso-value]').forEach(function(el) {
            var val = el.getAttribute('data-reso-value');
            if (!val) return;
            val.split(',').forEach(function(v) { v = v.trim(); if (v && VS.indexOf(v) === -1) issues.push('Status:"' + v + '"'); });
        });
        var VB = ['Manhattan','Brooklyn','Queens','Bronx','Staten Island','The Bronx'];
        document.querySelectorAll('[data-reso-field="borough"][data-reso-value]').forEach(function(el) {
            var v = el.getAttribute('data-reso-value'); if (v && VB.indexOf(v) === -1) issues.push('Borough:"' + v + '"');
        });
        if (typeof listings !== 'undefined') {
            listings.forEach(function(l) {
                if (l.listingCategory && ['sale','rental'].indexOf(l.listingCategory) === -1) issues.push('Category:"' + l.listingCategory + '"');
            });
        }
        addResult('W2', 'Enum Integrity', issues.length === 0 ? 'PASS' : 'FAIL', issues.length === 0 ? 'All status/borough/category enums valid' : issues.length + ' mismatches: ' + issues.slice(0,5).join(', '));
    })();

    // ── W3: Null Handling Test ─────────────────────────────────────────
    (function() {
        var problems = [];
        document.querySelectorAll('td, [data-listing-id], [data-reso-value]').forEach(function(el) {
            if (el.offsetParent === null) return;
            var t = el.textContent.trim();
            if (t === 'undefined' || t === 'null' || t === 'NaN' || t === '$NaN' || t === '$undefined') problems.push('"' + t + '" in <' + el.tagName.toLowerCase() + '>');
        });
        if (typeof listings !== 'undefined') {
            listings.forEach(function(l) {
                if (l.price == null) problems.push('Null price L-' + l.id);
                if (l.status == null) problems.push('Null status L-' + l.id);
            });
        }
        addResult('W3', 'Null Handling', problems.length === 0 ? 'PASS' : 'FAIL', problems.length === 0 ? 'No undefined/null/NaN in display or data' : problems.slice(0,4).join(', '));
    })();

    // ── W4: Timestamp Consistency ──────────────────────────────────────
    (function() {
        var issues = [];
        var el = document.getElementById('rebnyDataTimestamp');
        if (!el) { issues.push('No #rebnyDataTimestamp'); }
        else {
            var text = el.textContent.trim();
            if (!text || text.length < 8) issues.push('Timestamp empty');
            else { var d = new Date(text); if (isNaN(d.getTime())) issues.push('Unparseable'); else if ((Date.now() - d.getTime()) / 3600000 > 24) issues.push('Stale: ' + Math.round((Date.now() - d.getTime()) / 3600000) + 'h'); }
        }
        addResult('W4', 'Timestamp Consistency', issues.length === 0 ? 'PASS' : 'FAIL', issues.length === 0 ? 'Dynamic, within 24h' : issues.join('; '));
    })();

    // ── W5: Sorting Stability ──────────────────────────────────────────
    (function() {
        if (typeof getFilteredListings !== 'function' || typeof searchResultsState === 'undefined') { addResult('W5', 'Sorting Stability', 'FAIL', 'Required globals missing: getFilteredListings or searchResultsState undefined'); return; }
        var oF = searchResultsState.sortField, oO = searchResultsState.sortOrder;
        searchResultsState.sortField = 'price'; searchResultsState.sortOrder = 'asc';
        var a = getFilteredListings(true).map(function(l) { return l.id; });
        searchResultsState.sortOrder = 'desc'; getFilteredListings(true);
        searchResultsState.sortOrder = 'asc';
        var c = getFilteredListings(true).map(function(l) { return l.id; });
        searchResultsState.sortField = oF; searchResultsState.sortOrder = oO;
        var stable = a.length === c.length && a.every(function(id, i) { return id === c[i]; });
        addResult('W5', 'Sorting Stability', stable ? 'PASS' : 'FAIL', stable ? 'Stable across asc→desc→asc (' + a.length + ' listings)' : 'Order changed across cycle');
    })();

    // ── W6: Regression Snapshot ────────────────────────────────────────
    (function() {
        if (typeof listings === 'undefined') { addResult('W6', 'Regression Snapshot', 'FAIL', 'listings undefined — required test data missing'); return; }
        var snap = { count: listings.length, ids: listings.map(function(l){return l.id;}).sort(function(a,b){return a-b;}).join(',') };
        var key = 'rebny_regression_snapshot', prev = null;
        try { prev = JSON.parse(localStorage.getItem(key)); } catch(e) {}
        localStorage.setItem(key, JSON.stringify(snap));
        if (!prev) { addResult('W6', 'Regression Snapshot', 'PASS', 'Baseline: ' + snap.count + ' listings captured'); }
        else if (prev.count === snap.count && prev.ids === snap.ids) { addResult('W6', 'Regression Snapshot', 'PASS', 'No regression: ' + snap.count + ' listings match'); }
        else { addResult('W6', 'Regression Snapshot', 'FAIL', 'REGRESSION DETECTED: count ' + prev.count + '→' + snap.count + ', IDs changed'); }
    })();

    // ── W7: Cross-Surface Consistency ────────────────────────────────────
    (function() {
        var issues = [], checks = [];

        // 1. Email includes status + updated date per listing
        if (typeof emailListingSheet === 'function') {
            var eSrc = emailListingSheet.toString();
            if (eSrc.indexOf('Status:') !== -1 || eSrc.indexOf('status') !== -1) checks.push('email:status');
            else issues.push('Email missing status per listing');
            if (eSrc.indexOf('Updated:') !== -1 || eSrc.indexOf('updatedDate') !== -1) checks.push('email:date');
            else issues.push('Email missing updated date');
            if (eSrc.indexOf('formatCurrency') !== -1) checks.push('email:formatCurrency');
            else issues.push('Email uses raw price format');
            if (eSrc.indexOf('REBNY') !== -1) checks.push('email:attribution');
            else issues.push('Email missing REBNY attribution');
        } else { issues.push('emailListingSheet not found'); }

        // 2. Print sheet uses formatCurrency + has required elements
        if (typeof generateSingleListingSheet === 'function') {
            var pSrc = generateSingleListingSheet.toString();
            if (pSrc.indexOf('formatCurrency') !== -1) checks.push('print:formatCurrency');
            else issues.push('Print uses raw price format');
            if (pSrc.indexOf('listing.status') !== -1) checks.push('print:status');
            else issues.push('Print missing status');
            if (pSrc.indexOf('updatedDate') !== -1 || pSrc.indexOf('Last Updated') !== -1) checks.push('print:date');
            else issues.push('Print missing updated date');
        }
        if (typeof generateListingSheet === 'function') {
            var gSrc = generateListingSheet.toString();
            if (gSrc.indexOf('REBNY') !== -1) checks.push('print:attribution');
            else issues.push('Print missing REBNY attribution');
            if (gSrc.indexOf('Equal Housing') !== -1) checks.push('print:fairHousing');
            else issues.push('Print missing Fair Housing notice');
        }

        // 3. All search views use dynamic status colors (not hardcoded green)
        var viewFns = ['renderGalleryView','renderShortSummaryView','renderSummaryView','renderMasterDetailView'];
        var hardcoded = [];
        viewFns.forEach(function(fn) {
            if (typeof window[fn] === 'function') {
                var src = window[fn].toString();
                if (src.indexOf('bg-green-100 text-green-700') !== -1 && src.indexOf('getStatusBadgeClasses') === -1) {
                    hardcoded.push(fn.replace('render','').replace('View',''));
                }
            }
        });
        if (hardcoded.length === 0) checks.push('views:dynamicStatus');
        else issues.push('Hardcoded green badges: ' + hardcoded.join(', '));

        // 4. All search views have data-source attribute
        if (typeof renderMasterDetailView === 'function') {
            var mdSrc = renderMasterDetailView.toString();
            if (mdSrc.indexOf('data-source') !== -1) checks.push('masterDetail:source');
            else issues.push('MasterDetail missing data-source');
        }

        // 5. formatCurrency is null-safe
        if (typeof formatCurrency === 'function') {
            var nullResult = formatCurrency(null);
            var undefResult = formatCurrency(undefined);
            if (nullResult !== '$null' && nullResult !== '$NaN' && nullResult !== '$undefined' &&
                undefResult !== '$null' && undefResult !== '$NaN' && undefResult !== '$undefined') {
                checks.push('formatCurrency:nullSafe');
            } else { issues.push('formatCurrency not null-safe: null→"' + nullResult + '"'); }
        }

        // 6. getStatusBadgeClasses helper exists
        if (typeof getStatusBadgeClasses === 'function') {
            checks.push('statusHelper:exists');
            var active = getStatusBadgeClasses('ACTIVE');
            var pending = getStatusBadgeClasses('PENDING');
            if (active !== pending) checks.push('statusHelper:dynamic');
            else issues.push('Status helper returns same for ACTIVE/PENDING');
        } else { issues.push('getStatusBadgeClasses helper missing'); }

        addResult('W7', 'Cross-Surface Consistency', issues.length === 0 ? 'PASS' : 'FAIL',
            issues.length === 0 ? checks.length + ' cross-surface checks pass' : issues.length + ' issue(s): ' + issues.join('; '));
    })();

    return { mode: 'wiring', results: results, summary: { passed: passed, failed: failed, warnings: warnings, total: results.length } };
}
