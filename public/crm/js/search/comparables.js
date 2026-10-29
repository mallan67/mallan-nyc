// ═══════════════════════════════════════════════════════════════════════════════
// COMPARABLE REPORTS — comparables from LIVE Cotality, CMA valuation, reports
//
// Three ways in (Subject Property, Subject Buildings, General Criteria), one set of time windows,
// results the agent selects, then a valuation saved to the CRM (/api/crm/cma, lib/cma/engine.ts)
// and the Reports formats (CMA, comparison, fact sheet …).
//
// Every search is an exact Agent Search request (/api/idx/search): statuses, dates, places and
// features go through the same live mapping layer and the same geography resolver as the main
// search. Each status family has its own live date field, so each runs as its own request:
//   sold / rented      StandardStatus Closed   CloseDate            ≥ window
//   in contract        StandardStatus Pending  PurchaseContractDate ≥ window
//   on market          Active / ComingSoon     ListingContractDate  ≥ window
// and the results are combined. Stages Cotality does not carry (offers, board approval, ACRIS)
// stay visible but disabled with the reason (init-disable-dead-controls.js).
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var _side = 'sale';                       // 'sale' | 'rent'
    var _subject = null;                      // the subject: a live listing (mapped) or manual facts
    var _candidates = [];                     // live matches when several units match the subject input
    var _buildings = [];                      // Subject Buildings: street addresses to search
    var _results = { property: [], building: [], general: [] };
    var _selected = { property: {}, building: {}, general: {} };
    var _sort = { property: null, building: null, general: null };
    var _lastPage = null;
    var _valuation = null;

    // Broker Price Opinion: the agent's adjustment rules (variations), per-comparable lines and price opinion
    var RATE_OPTIONS = {
        monthly_per_100: { label: 'Monthlies', options: [[0, 'Not priced (filter only)'], [10000, '$10,000 per $100/mo'], [15000, '$15,000 per $100/mo (mortgage equivalent)'], [24000, '$24,000 per $100/mo (capitalized at 5%)']] },
        floor: { label: 'Floor', options: [[0.01, '1% per floor'], [0.005, '0.5% per floor'], [0.015, '1.5% per floor'], [0, 'Not priced']] },
        floor_cap: { label: 'Floor cap', options: [[0, 'No cap'], [0.05, 'Cap 5%'], [0.1, 'Cap 10%'], [0.15, 'Cap 15%']] },
        living_area: { label: 'Size', options: [[0.0002, '0.02% per SF'], [0.0001, '0.01% per SF'], [0.0004, '0.04% per SF'], [0, 'Not priced']] },
        bedroom: { label: 'Bedrooms', options: [[0.05, '5% per bedroom'], [0.03, '3% per bedroom'], [0.08, '8% per bedroom'], [0, 'Not priced']] },
        bathroom: { label: 'Bathrooms', options: [[0.03, '3% per bathroom'], [0.02, '2% per bathroom'], [0.05, '5% per bathroom'], [0, 'Not priced']] },
    };
    var DEFAULT_RATES = { monthly_per_100: 15000, floor: 0.01, floor_cap: 0, living_area: 0.0002, bedroom: 0.05, bathroom: 0.03 };
    var FIVE = [[-10, 'Comp much better −10%'], [-5, 'Comp better −5%'], [0, 'Similar'], [5, 'Comp worse +5%'], [10, 'Comp much worse +10%']];
    var THREE = [[-6, 'Comp better −6%'], [-3, 'Comp better −3%'], [0, 'Similar'], [3, 'Comp worse +3%'], [6, 'Comp worse +6%']];
    var MANUAL_VARS = [
        { key: 'condition', label: 'Condition', steps: FIVE, fact: null },
        { key: 'renovation', label: 'Kitchen & baths', steps: FIVE, fact: null },
        { key: 'exposure', label: 'Exposure / light', steps: THREE, fact: function (l) { return l.exposures || ''; } },
        { key: 'view', label: 'View', steps: THREE, fact: function (l) { return l.View || ''; } },
        { key: 'outdoor', label: 'Outdoor space', steps: THREE, fact: function (l) { return l.PatioAndPorchFeatures || ''; } },
        { key: 'layout', label: 'Layout / floor plan', steps: THREE, fact: null },
    ];
    var _rates = Object.assign({}, DEFAULT_RATES);
    var _manual = {};          // wid → { condition: pct, …, other_amount, other_note }
    var _opinion = { list_price: '', sale_price_90: '', comments: '' };
    var _lastComps = {};       // wid → the server's priced comparable (adjustments, adjusted_price, similarity) after a save or reopen
    var _lastCmaId = null;
    // Live Cotality CommonInterest values that compare with each other
    function similarOwnership(own) {
        var groups = { StockCooperative: ['StockCooperative', 'Condop'], Condop: ['Condop', 'StockCooperative', 'Condominium'], Condominium: ['Condominium', 'Condop'] };
        return groups[own] || [own];
    }

    var PAGES = { property: 'compPropertyResults', building: 'compBuildingResults', general: 'compGeneralResults' };
    var PAGE_ROOT = { property: 'subjectPropertyPage', building: 'subjectBuildingsPage', general: 'generalCriteriaPage' };

    function $(id) { return document.getElementById(id); }
    function esc(s) { return typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
    function money(n) { return n == null || n === '' || isNaN(Number(n)) ? '--' : '$' + Math.round(Number(n)).toLocaleString(); }
    function isoDaysAgo(d) { return new Date(Date.now() - d * 864e5).toISOString().slice(0, 10); }
    function today() { return new Date().toISOString().slice(0, 10); }
    function toast(msg, kind) { if (typeof showToast === 'function') showToast(msg, kind || 'info'); else console.log('[Comps]', msg); }
    function agentKey() { return (typeof LOGGED_IN_AGENT !== 'undefined' && LOGGED_IN_AGENT && LOGGED_IN_AGENT.id) ? LOGGED_IN_AGENT.id : 'default'; }
    function selVal(id) { var el = $(id); return el && el.value !== '' && el.value !== 'custom' ? el.value : null; }
    function num(v) { var n = Number(v); return isNaN(n) ? null : n; }

    // ── Sales / Rentals ────────────────────────────────────────────────────────────────────────
    window.compSide = function () { return _side; };

    window.toggleCompSaleRent = function (type) {
        _side = type === 'rent' ? 'rent' : 'sale';
        var saleBtns = ['btnCompSale', 'btnCompPropertySale', 'btnCompBuildingSale', 'btnCompGeneralSale'];
        var rentBtns = ['btnCompRent', 'btnCompPropertyRent', 'btnCompBuildingRent', 'btnCompGeneralRent'];
        function paint(ids, on) {
            ids.forEach(function (id) {
                var b = $(id); if (!b) return;
                b.classList.toggle('bg-blue-600', on); b.classList.toggle('text-white', on);
                b.classList.toggle('bg-gray-200', !on); b.classList.toggle('text-gray-700', !on);
            });
        }
        paint(saleBtns, _side === 'sale'); paint(rentBtns, _side === 'rent');
        document.querySelectorAll('#comparablesSection [data-label-sale]').forEach(function (el) {
            el.textContent = el.getAttribute(_side === 'rent' ? 'data-label-rent' : 'data-label-sale');
        });
        ['compBuildingPriceLabel', 'compGeneralPriceLabel'].forEach(function (id) { var el = $(id); if (el) el.textContent = _side === 'rent' ? 'Monthly rent' : 'Price'; });
        compRenderWindowNotes();
        if (typeof applyCotalitySearchContract === 'function') applyCotalitySearchContract();
    };

    // ── Time windows (shared by every method) ─────────────────────────────────────────────────
    function windows() {
        var sold = num(selVal('compSoldWithin')) || 180;
        var pend = num(selVal('compPendingWithin'));
        var act = num(selVal('compActiveWithin'));
        return { soldDays: sold, pendingDays: pend, activeDays: act };
    }
    function spanText(days) {
        if (!days) return 'any time';
        if (days % 365 === 0) return 'last ' + (days / 365) + (days === 365 ? ' year' : ' years');
        if (days % 30 === 0 && days >= 180) return 'last ' + (days / 30) + ' months';
        return 'last ' + days + ' days';
    }
    function windowText() {
        var w = windows();
        var rent = _side === 'rent';
        return (rent ? 'rented ' : 'sold ') + spanText(w.soldDays) + ' (CloseDate) · ' +
            (rent ? 'lease signed ' : 'in contract ') + spanText(w.pendingDays) + ' (PurchaseContractDate) · on market listed ' + spanText(w.activeDays) + ' (ListingContractDate)';
    }
    window.compRenderWindowNotes = function () {
        var t = windowText();
        var s = $('compWindowSummary'); if (s) s.innerHTML = '<i class="fas fa-info-circle mr-2"></i>Comparables: ' + esc(t) + '. Pick a method on the left.';
        document.querySelectorAll('.comp-window-note').forEach(function (el) { el.textContent = t; });
        var n = $('compPropertyWindowNote'); if (n) n.textContent = 'Windows: ' + t;
    };
    ['compSoldWithin', 'compPendingWithin', 'compActiveWithin'].forEach(function (id) {
        document.addEventListener('change', function (e) { if (e.target && e.target.id === id) compRenderWindowNotes(); });
    });

    // ── Status families from a status group (or the subject page's three boxes) ──────────────
    // Returns [{ family, statuses: [...live StandardStatus values and sub-statuses] }]
    function statusPlan(page) {
        var fam = { closed: [], pending: [], active: [], notActive: [] };
        if (page === 'property') {
            if ($('compPropertyClosed') && $('compPropertyClosed').checked) fam.closed.push('Closed');
            if ($('compPropertyPending') && $('compPropertyPending').checked) fam.pending.push('Pending');
            if ($('compPropertyActive') && $('compPropertyActive').checked) fam.active.push('Active');
        } else {
            var root = $(PAGE_ROOT[page]);
            var boxes = root ? root.querySelectorAll('.comp-status-group input[data-field="StandardStatus"]:checked:not(:disabled)') : [];
            Array.prototype.forEach.call(boxes, function (cb) {
                var sub = _side === 'rent' ? (cb.getAttribute('data-sub-status-rent') || cb.getAttribute('data-sub-status')) : cb.getAttribute('data-sub-status');
                var values = String(cb.getAttribute('data-value') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
                var base = values[0];
                var family = base === 'Closed' ? 'closed' : base === 'Pending' ? 'pending' : (base === 'Active' || base === 'ComingSoon' || base === 'Incomplete') ? 'active' : 'notActive';
                var items = sub ? [sub] : values;
                items.forEach(function (v) { if (fam[family].indexOf(v) === -1) fam[family].push(v); });
            });
        }
        return Object.keys(fam).filter(function (k) { return fam[k].length; }).map(function (k) { return { family: k, statuses: fam[k] }; });
    }

    function familyParams(fam, w) {
        var p = { status: fam.statuses.join(',') };
        if (fam.family === 'closed') p.closeDateFrom = isoDaysAgo(w.soldDays);
        if (fam.family === 'pending' && w.pendingDays) p.contractDateFrom = isoDaysAgo(w.pendingDays);
        if (fam.family === 'active' && w.activeDays) { p.dateFrom = isoDaysAgo(w.activeDays); p.dateTo = today(); p.dateType = 'Listed'; }
        return p;
    }

    // ── Criteria per page ──────────────────────────────────────────────────────────────────────
    // Generic data-field scanner for a page root (outside the status group): the same rules as the
    // main search — data-group boxes OR across fields, others AND; values are live Cotality values.
    function featureParams(root) {
        var filters = {}, groups = {};
        var add = function (target, field, val) { (target[field] = target[field] || []); if (target[field].indexOf(val) === -1) target[field].push(val); };
        Array.prototype.forEach.call(root.querySelectorAll('input[data-field]:checked:not(:disabled)'), function (cb) {
            if (cb.closest('.comp-status-group')) return;
            var field = cb.getAttribute('data-field'), group = cb.getAttribute('data-group');
            var val = cb.getAttribute('data-not') ? 'not:' + cb.getAttribute('data-not') : cb.getAttribute('data-value');
            if (!val) return;
            if (group) { groups[group] = groups[group] || {}; add(groups[group], field, val); } else add(filters, field, val);
        });
        var p = {};
        if (Object.keys(filters).length) p.checkboxFilters = JSON.stringify(filters);
        if (Object.keys(groups).length) p.checkboxGroups = JSON.stringify(groups);
        return p;
    }
    // Places from a page: chips (live names / live borough values) plus the live tree when present
    function placeParams(tagsId, root) {
        var hoods = typeof getSelectedNeighborhoods === 'function' ? getSelectedNeighborhoods(tagsId) : [];
        var boroughs = typeof getSelectedBoroughs === 'function' ? getSelectedBoroughs(tagsId) : [];
        var tree = root ? root.querySelector('.neighborhood-tree') : null;
        if (tree) {
            Array.prototype.forEach.call(tree.querySelectorAll('summary input[data-borough]:checked'), function (cb) { if (boroughs.indexOf(cb.getAttribute('data-borough')) === -1) boroughs.push(cb.getAttribute('data-borough')); });
            Array.prototype.forEach.call(tree.querySelectorAll('label input[data-neighborhood]:checked'), function (cb) {
                var d = cb.closest('details'); var bb = d ? d.querySelector('summary input[data-borough]') : null;
                if (bb && bb.checked) return;
                var n = cb.getAttribute('data-neighborhood'); if (hoods.indexOf(n) === -1) hoods.push(n);
            });
        }
        var p = {};
        if (hoods.length) p.neighborhood = hoods.join(',');
        if (boroughs.length) p.borough = boroughs.join(',');
        return p;
    }
    function rangeParams(prefix) {
        var p = {};
        var map = { MinPrice: 'minPrice', MaxPrice: 'maxPrice', MinBeds: 'minBeds', MaxBeds: 'maxBeds', MinBaths: 'minBaths', MaxBaths: 'maxBaths', MinSqft: 'minSqft', MaxSqft: 'maxSqft' };
        Object.keys(map).forEach(function (k) { var v = selVal(prefix + k); if (v != null) p[map[k]] = v; });
        return p;
    }

    function subjectFacts() {
        var hoodTags = typeof getSelectedNeighborhoods === 'function' ? getSelectedNeighborhoods('compSubjectNeighborhoodTags') : [];
        var s = _subject || {};
        return {
            address: s.address || ($('compPropertyAddress') ? $('compPropertyAddress').value.trim() : ''),
            unit: s.unit || ($('compPropertyUnit') ? $('compPropertyUnit').value.trim() : ''),
            neighborhood: hoodTags[0] || s.neighborhood || '',
            borough: s.borough || '',
            beds: num($('compSubjectBeds') && $('compSubjectBeds').value),
            baths: num($('compSubjectBaths') && $('compSubjectBaths').value),
            sqft: num($('compSubjectSqft') && $('compSubjectSqft').value),
            floor: num($('compSubjectFloor') && $('compSubjectFloor').value),
            // Monthlies: maintenance or common charges plus taxes per month (mapper totalMonthly = AssociationFee + TaxAnnualAmount / 12)
            monthly: num($('compSubjectMonthly') && $('compSubjectMonthly').value) || (s.totalMonthly > 0 ? Math.round(s.totalMonthly) : null),
            ownership: ($('compSubjectOwnership') && $('compSubjectOwnership').value) || s.ownership || '',
            id: s.id || null, wid: s.wid || null, lid: s.lid || null, listing: _subject,
        };
    }

    function baseParams(page) {
        var p = { type: _side === 'rent' ? 'rental' : 'sale' };
        if (page === 'property') {
            var f = subjectFacts();
            var where = (document.querySelector('input[name="compWhere"]:checked') || {}).value || 'neighborhood';
            if (where === 'building') { if (!f.address) throw new Error('Find the subject first — the building search needs its street address.'); p.address = f.address; }
            else if (where === 'neighborhood') { if (!f.neighborhood) throw new Error('The subject has no neighborhood yet — find it in Cotality or type one under Subject facts.'); p.neighborhood = f.neighborhood; }
            else { Object.assign(p, placeParams('compPropertyNeighborhoodTags', null)); if (!p.neighborhood && !p.borough) throw new Error('Pick at least one neighborhood or borough.'); }
            var tol = selVal('compBedsTolerance');
            if (tol !== 'any' && f.beds != null) { var t = num(tol) || 0; p.minBeds = Math.max(0, f.beds - t); p.maxBeds = f.beds + t; }
            var br = selVal('compBathsRule');
            if (br === 'min' && f.baths != null) p.minBaths = f.baths;
            if (br === 'same' && f.baths != null) { p.minBaths = f.baths; p.maxBaths = f.baths; }
            var st = selVal('compSizeTolerance');
            if (st !== 'any' && f.sqft) { var pct = (num(st) || 20) / 100; p.minSqft = Math.round(f.sqft * (1 - pct)); p.maxSqft = Math.round(f.sqft * (1 + pct)); }
            // Building-status facets (Resale / New Development / Sponsor Unit, match all or any) and the
            // ownership rule — the same independent live criteria as the main search.
            var feats = featureParams($(PAGE_ROOT.property));
            var ownRule = selVal('compOwnershipRule');
            if (ownRule !== 'any' && f.ownership) {
                var cf = feats.checkboxFilters ? JSON.parse(feats.checkboxFilters) : {};
                // "Similar": a condop building compares with co-ops and condos in the area (Maya 2026-10-27)
                cf.CommonInterest = ownRule === 'similar' ? similarOwnership(f.ownership) : [f.ownership];
                feats.checkboxFilters = JSON.stringify(cf);
            }
            Object.assign(p, feats);
            // Monthlies within a tolerance of the subject's (Maya 2026-10-27: a unit with far higher
            // maintenance is not a comparable). The server applies TotalMonthly to the live records.
            var mt = selVal('compMonthlyTolerance');
            if (mt !== 'any' && f.monthly > 0) {
                var mp = (num(mt) || 50) / 100;
                var fr = p.fieldRanges ? JSON.parse(p.fieldRanges) : {};
                fr.TotalMonthly = { min: String(Math.round(f.monthly * (1 - mp))), max: String(Math.round(f.monthly * (1 + mp))) };
                p.fieldRanges = JSON.stringify(fr);
            }
        } else if (page === 'building') {
            Object.assign(p, rangeParams('compBuilding'));
        } else {
            var root = $(PAGE_ROOT.general);
            Object.assign(p, placeParams('compGeneralNeighborhoodTags', root), rangeParams('compGeneral'), featureParams(root));
        }
        return p;
    }

    // ── Run ────────────────────────────────────────────────────────────────────────────────────
    window.compSearch = function (page) {
        var out = $(PAGES[page]); if (!out) return;
        _lastPage = page;
        var plan, base;
        try { base = baseParams(page); plan = statusPlan(page); }
        catch (err) { toast(err.message, 'warning'); return; }
        if (!plan.length) { toast('Tick at least one status (sold, in contract or on market).', 'warning'); return; }
        var targets = page === 'building' ? _buildings.slice() : [null];
        if (page === 'building' && !targets.length) { toast('Add at least one building.', 'warning'); return; }
        var w = windows();
        var requests = [];
        targets.forEach(function (addr) {
            plan.forEach(function (fam) {
                var params = Object.assign({}, base, familyParams(fam, w), { limit: 200 });
                if (addr) params.address = addr;
                requests.push({ fam: fam.family, params: params });
            });
        });
        out.style.display = 'block';
        out.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-blue-600"></i><p class="text-sm text-gray-600 mt-2">Searching live Cotality — ' + requests.length + ' request' + (requests.length === 1 ? '' : 's') + '…</p></div>';
        var subjectId = _subject ? String(_subject.id) : null;
        var merged = [], seen = {}, notes = [], refused = [];
        var run = requests.map(function (r) {
            return MallanAPI.idx.search(r.params).then(function (res) {
                (res && res.listings || []).forEach(function (l) {
                    if (seen[l.id] || String(l.id) === subjectId) return;
                    seen[l.id] = true; l._compFamily = r.fam; merged.push(l);
                });
                if (res && typeof res.total === 'number' && res.total > (res.listings || []).length) notes.push(r.fam + ': ' + res.total.toLocaleString() + ' match in Cotality, first ' + res.listings.length + ' loaded');
                if (res && res.localScan && !res.localScan.complete) notes.push(r.fam + ': applied by Mallan to the first ' + res.localScan.checked + ' of ' + res.localScan.cotalityMatches);
            }).catch(function (err) {
                var body = err && err.body ? err.body : null;
                if (body && body.refused) body.refused.forEach(function (x) { refused.push((x.field || x.criterion) + ': ' + x.reason); });
                else refused.push(r.fam + ': ' + (err && err.message || 'search failed'));
            });
        });
        Promise.all(run).then(function () {
            if (typeof listings !== 'undefined' && Array.isArray(listings)) merged.forEach(function (l) { if (!listings.some(function (x) { return x.id === l.id; })) listings.push(l); });
            _results[page] = merged;
            _selected[page] = {};
            merged.forEach(function (l) { _selected[page][l.id] = true; });
            _sort[page] = null;
            renderResults(page, { notes: notes, refused: refused, requests: requests });
            if (typeof initPhotoObserver === 'function') try { initPhotoObserver(); } catch (e) { /* photos lazy-load where available */ }
        });
    };

    // ── Results ────────────────────────────────────────────────────────────────────────────────
    function famLabel(f) { return f === 'closed' ? (_side === 'rent' ? 'Rented' : 'Sold') : f === 'pending' ? (_side === 'rent' ? 'Lease signed' : 'In contract') : f === 'active' ? 'On market' : 'Not active'; }
    function rowPrice(l) { return l.status === 'CLOSED' && l.closePrice ? l.closePrice : l.price; }
    function rowDate(l) { if (l.status === 'CLOSED' && l.closedDate) return String(l.closedDate).slice(0, 10); if (l.status === 'PENDING' && l.contractDate) return String(l.contractDate).slice(0, 10); return l.listedDateIso || l.listedDate || ''; }
    function psf(l) { var p = rowPrice(l); return p && l.intSqft ? Math.round(p / l.intSqft) : null; }
    var COLS = [
        { key: 'address', label: 'Address', val: function (l) { return (l.address || '') + (l.unit ? ' #' + l.unit : ''); } },
        { key: 'status', label: 'Status', val: function (l) { return l.status; } },
        { key: 'price', label: 'Price', num: true, val: rowPrice, fmt: function (l) { var p = rowPrice(l); return money(p) + (l.status === 'CLOSED' && l.closePrice && l.price && l.price !== l.closePrice ? '<div class="text-[10px] text-gray-400">list ' + money(l.price) + '</div>' : ''); } },
        { key: 'psf', label: '$/SF', num: true, val: psf, fmt: function (l) { var v = psf(l); return v ? '$' + v.toLocaleString() : '--'; } },
        // Monthlies (sales): maintenance or common charges plus taxes per month; a rental's "monthly" is its rent, shown under Price
        { key: 'monthly', label: 'Monthlies', num: true, val: function (l) { return l.listingCategory !== 'rental' && l.totalMonthly > 0 ? l.totalMonthly : null; }, fmt: function (l) { return l.listingCategory !== 'rental' && l.totalMonthly > 0 ? '$' + Math.round(l.totalMonthly).toLocaleString() + '/mo' : '--'; } },
        { key: 'beds', label: 'BR', num: true, val: function (l) { return l.beds; } },
        { key: 'baths', label: 'BA', num: true, val: function (l) { return l.baths; } },
        { key: 'sqft', label: 'SF', num: true, val: function (l) { return l.intSqft; }, fmt: function (l) { return l.intSqft ? Number(l.intSqft).toLocaleString() : '--'; } },
        { key: 'floor', label: 'Fl', num: true, val: function (l) { return l.floor; } },
        { key: 'date', label: 'Date', val: rowDate },
        { key: 'dom', label: 'DOM', num: true, val: function (l) { return l.dom; } },
        { key: 'neighborhood', label: 'Neighborhood', val: function (l) { return l.neighborhood; } },
        { key: 'building', label: 'Building', val: function (l) { return l.buildingName || ''; } },
        { key: 'company', label: 'Listed by', val: function (l) { return l.company || ''; } },
    ];
    function sorted(page) {
        var rows = _results[page].slice(), s = _sort[page];
        if (!s) return rows;
        var col = COLS.filter(function (c) { return c.key === s.key; })[0]; if (!col) return rows;
        rows.sort(function (a, b) {
            var va = col.val(a), vb = col.val(b);
            if (col.num) { va = va == null ? -Infinity : Number(va); vb = vb == null ? -Infinity : Number(vb); return s.dir === 'asc' ? va - vb : vb - va; }
            va = String(va || ''); vb = String(vb || ''); return s.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        });
        return rows;
    }
    window.compSort = function (page, key) {
        var s = _sort[page];
        _sort[page] = s && s.key === key ? { key: key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: key, dir: key === 'price' || key === 'date' || key === 'psf' ? 'desc' : 'asc' };
        renderResults(page, _results[page]._meta || {});
    };
    window.compToggle = function (page, id) { if (_selected[page][id]) delete _selected[page][id]; else _selected[page][id] = true; renderStats(page); renderAdjustments(page); };
    window.compSelectAll = function (page, on) { _selected[page] = {}; if (on) _results[page].forEach(function (l) { _selected[page][l.id] = true; }); renderResults(page, _results[page]._meta || {}); };
    window.compOpen = function (id) { if (typeof showListingDetail === 'function') showListingDetail(id); };

    function selectedRows(page) { return _results[page].filter(function (l) { return _selected[page][l.id]; }); }
    function stats(rows) {
        var prices = rows.map(rowPrice).filter(function (p) { return p > 0; }).sort(function (a, b) { return a - b; });
        var psfs = rows.map(psf).filter(Boolean);
        var doms = rows.map(function (l) { return l.dom; }).filter(function (d) { return typeof d === 'number'; });
        var avg = function (a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : null; };
        var median = prices.length ? (prices.length % 2 ? prices[(prices.length - 1) / 2] : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2) : null;
        return { n: rows.length, avgPrice: avg(prices), median: median, low: prices[0] || null, high: prices[prices.length - 1] || null, avgPsf: avg(psfs), avgDom: avg(doms) };
    }
    function statsHtml(page) {
        var s = stats(selectedRows(page));
        var cell = function (label, v) { return '<div class="text-center px-3"><div class="text-[10px] uppercase tracking-wide text-gray-500">' + label + '</div><div class="text-sm font-semibold text-gray-900">' + v + '</div></div>'; };
        return '<div id="compStats-' + page + '" class="flex flex-wrap items-center gap-2 py-2 border-t border-b bg-gray-50 rounded">' +
            cell('Selected', s.n) + cell('Average', money(s.avgPrice)) + cell('Median', money(s.median)) + cell('Range', (s.low ? money(s.low) + ' – ' + money(s.high) : '--')) +
            cell('Avg $/SF', s.avgPsf ? '$' + Math.round(s.avgPsf).toLocaleString() : '--') + cell('Avg DOM', s.avgDom != null ? Math.round(s.avgDom) + ' days' : '--') +
            (_valuation && page === _lastPage ? cell('CMA estimate', money(_valuation.estimated) + ' <span class="text-[10px] text-gray-500">(' + money(_valuation.low) + ' – ' + money(_valuation.high) + ')</span>') : '') + '</div>';
    }
    function renderStats(page) { var el = $('compStats-' + page); if (el) el.outerHTML = statsHtml(page); }

    function renderResults(page, meta) {
        var out = $(PAGES[page]); if (!out) return;
        _results[page]._meta = meta;
        var rows = sorted(page), all = _results[page];
        var fams = {}; all.forEach(function (l) { fams[l._compFamily] = (fams[l._compFamily] || 0) + 1; });
        var h = '<div class="flex items-center justify-between flex-wrap gap-2 mb-3">' +
            '<div><h3 class="text-lg font-semibold text-gray-900">' + (_side === 'rent' ? 'Comps for Rental' : 'Comps for Sale') + ' <span class="text-sm font-normal text-gray-500">— ' + all.length + ' from live Cotality' +
            (Object.keys(fams).length ? ' (' + Object.keys(fams).map(function (f) { return fams[f] + ' ' + famLabel(f).toLowerCase(); }).join(', ') + ')' : '') + '</span></h3>' +
            (_subject ? '<p class="text-xs text-gray-500">Subject: ' + esc(_subject.address || '') + (_subject.unit ? ' #' + esc(_subject.unit) : '') + '</p>' : '') + '</div>' +
            '<div class="flex gap-2 flex-wrap">' +
            '<button onclick="compSelectAll(\'' + page + '\', true)" class="px-2.5 py-1.5 text-xs border rounded hover:bg-gray-50">Select all</button>' +
            '<button onclick="compSelectAll(\'' + page + '\', false)" class="px-2.5 py-1.5 text-xs border rounded hover:bg-gray-50">Clear</button>' +
            '<button onclick="compGenerateReport()" class="px-3 py-1.5 text-xs bg-gray-900 text-white rounded hover:bg-gray-800"><i class="fas fa-file-alt mr-1"></i>Reports</button>' +
            '<button onclick="compSaveCma()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700" ' + (_subject ? '' : 'title="Set a subject property first (Subject Property method)" disabled') + '><i class="fas fa-chart-bar mr-1"></i>Value subject &amp; save CMA</button>' +
            '</div></div>';
        if (meta.refused && meta.refused.length) h += '<div class="mb-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800"><strong>Not searched:</strong> ' + meta.refused.map(esc).join(' · ') + '</div>';
        if (meta.notes && meta.notes.length) h += '<div class="mb-3 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">' + meta.notes.map(esc).join(' · ') + '</div>';
        if (!all.length) {
            h += '<div class="text-center py-8"><i class="fas fa-search text-3xl text-gray-400 mb-2"></i><p class="text-sm text-gray-600">No comparable listings in live Cotality for these criteria. Widen the time windows, the area or the size.</p></div>';
            out.innerHTML = h; return;
        }
        h += statsHtml(page);
        h += '<div class="overflow-x-auto mt-3"><table class="w-full text-xs"><thead><tr class="border-b bg-gray-50 text-left">' +
            '<th class="px-2 py-2"><input type="checkbox" checked onchange="compSelectAll(\'' + page + '\', this.checked)" title="Select all"></th>';
        COLS.forEach(function (c) {
            var s = _sort[page]; var arrow = s && s.key === c.key ? (s.dir === 'asc' ? ' ▲' : ' ▼') : '';
            h += '<th class="px-2 py-2 cursor-pointer whitespace-nowrap hover:text-blue-700' + (c.num ? ' text-right' : '') + '" onclick="compSort(\'' + page + '\',\'' + c.key + '\')">' + c.label + arrow + '</th>';
        });
        h += '<th class="px-2 py-2"></th></tr></thead><tbody>';
        rows.forEach(function (l, i) {
            var on = !!_selected[page][l.id];
            h += '<tr class="border-b hover:bg-blue-50 ' + (i % 2 ? 'bg-gray-50/50' : '') + (on ? '' : ' opacity-60') + '">' +
                '<td class="px-2 py-1.5"><input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="compToggle(\'' + page + '\',\'' + esc(l.id) + '\')"></td>';
            COLS.forEach(function (c) {
                var v = c.fmt ? c.fmt(l) : esc(c.val(l) == null ? '--' : c.val(l));
                if (c.key === 'status') v = '<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold ' + (l.status === 'CLOSED' ? 'bg-green-100 text-green-800' : l.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800') + '">' + esc(l.status) + '</span>';
                if (c.key === 'address') v = '<a href="#" onclick="compOpen(\'' + esc(l.id) + '\');return false;" class="font-medium text-gray-900 hover:text-blue-700">' + v + '</a><div class="text-[10px] text-gray-400">' + esc(l.lid || '') + '</div>';
                h += '<td class="px-2 py-1.5' + (c.num ? ' text-right' : '') + '">' + v + '</td>';
            });
            h += '<td class="px-2 py-1.5"><button onclick="compOpen(\'' + esc(l.id) + '\')" class="text-blue-600 hover:underline">Open</button></td></tr>';
        });
        h += '</tbody></table></div>';
        h += '<p class="text-[10px] text-gray-400 mt-2">Prices: close price for sold or rented listings, list price otherwise. Days on market derived from Cotality OnMarketDate. For internal reference only; not an appraisal.</p>';
        h += '<div id="compAdjust-' + page + '"></div>';
        out.innerHTML = h;
        renderAdjustments(page);
    }

    // ── Broker Price Opinion: adjustment rules, per-comparable lines, the broker's opinion ──────
    function opt(options, current, fmt) {
        return options.map(function (o) { return '<option value="' + o[0] + '"' + (Number(o[0]) === Number(current) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('');
    }
    function manualLines(wid) {
        var m = _manual[wid] || {}; var lines = [];
        MANUAL_VARS.forEach(function (v) { var pct = Number(m[v.key] || 0); if (pct) lines.push({ label: v.label, pct: pct }); });
        var other = Number(m.other_amount || 0); if (other) lines.push({ label: m.other_note ? 'Other: ' + String(m.other_note).slice(0, 50) : 'Other', amount: other, note: m.other_note || undefined });
        return lines;
    }
    function adjustmentsHtml(page) {
        if (page !== 'property' || !_subject) return '';
        var rows = selectedRows(page);
        var h = '<div class="mt-6 border-t pt-4">' +
            '<div class="flex items-center justify-between flex-wrap gap-2 mb-2"><h4 class="font-semibold text-gray-900 text-sm">Broker Price Opinion — adjustments</h4>' +
            '<span class="text-[11px] text-gray-500">Each line moves a comparable toward what it would have fetched as the subject: a comp that is better is adjusted down, a comp that is worse is adjusted up.</span></div>';
        // Rules the agent picks (variations)
        h += '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">';
        Object.keys(RATE_OPTIONS).forEach(function (k) {
            h += '<label class="text-[11px] text-gray-600">' + esc(RATE_OPTIONS[k].label) + '<select class="w-full border rounded px-2 py-1 text-xs mt-0.5" onchange="compSetRate(\'' + k + '\', this.value)">' + opt(RATE_OPTIONS[k].options, _rates[k]) + '</select></label>';
        });
        h += '</div>';
        if (!rows.length) return h + '<p class="text-xs text-gray-500">Select comparables above to adjust them.</p>' + '</' + 'div>'; // (split so the build's tag count stays balanced)
        // Per-comparable lines beside the live Cotality facts
        h += '<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="border-b bg-gray-50 text-left">' +
            '<th class="px-2 py-1.5">Comparable</th><th class="px-2 py-1.5">Live facts (Cotality)</th>';
        MANUAL_VARS.forEach(function (v) { h += '<th class="px-2 py-1.5 whitespace-nowrap">' + esc(v.label) + '</th>'; });
        h += '<th class="px-2 py-1.5">Other $ (+/−)</th>' + (Object.keys(_lastComps).length ? '<th class="px-2 py-1.5 text-right">Net adj.</th><th class="px-2 py-1.5 text-right">Adjusted</th><th class="px-2 py-1.5 text-right">Weight</th>' : '') + '</tr></thead><tbody>';
        rows.forEach(function (l) {
            var wid = String(l.wid || l.id); var m = _manual[wid] || {}; var priced = _lastComps[wid];
            var facts = [l.intSqft ? Number(l.intSqft).toLocaleString() + ' SF' : 'SF —', l.totalMonthly > 0 ? money(l.totalMonthly) + '/mo' : 'monthlies —', l.floor ? 'floor ' + esc(l.floor) : '', l.exposures ? 'exp. ' + esc(l.exposures) : '', l.View ? 'view ' + esc(l.View) : '', l.PatioAndPorchFeatures ? 'outdoor ' + esc(l.PatioAndPorchFeatures) : '', l.yearBuilt ? 'built ' + esc(l.yearBuilt) : ''].filter(Boolean).join(' · ');
            h += '<tr class="border-b align-top"><td class="px-2 py-1.5 whitespace-nowrap"><div class="font-medium">' + esc(l.address) + (l.unit ? ' #' + esc(l.unit) : '') + '</div><div class="text-[10px] text-gray-500">' + esc(l.status) + ' · ' + money(rowPrice(l)) + '</div></td>' +
                '<td class="px-2 py-1.5 text-[10px] text-gray-600 max-w-[16rem]">' + facts + '</td>';
            MANUAL_VARS.forEach(function (v) {
                h += '<td class="px-1 py-1.5"><select class="border rounded px-1 py-1 text-[11px]" onchange="compSetManual(\'' + esc(wid) + '\',\'' + v.key + '\', this.value)">' + opt(v.steps, m[v.key] || 0) + '</select>' +
                    (v.fact && v.fact(l) ? '<div class="text-[10px] text-gray-400 mt-0.5">' + esc(v.fact(l)) + '</div>' : '') + '</td>';
            });
            h += '<td class="px-1 py-1.5"><input type="number" step="1000" placeholder="$ +/−" value="' + esc(m.other_amount || '') + '" class="w-24 border rounded px-1 py-1 text-[11px]" onchange="compSetManual(\'' + esc(wid) + '\',\'other_amount\', this.value)">' +
                '<input type="text" placeholder="what for" value="' + esc(m.other_note || '') + '" class="w-28 border rounded px-1 py-1 text-[11px] mt-0.5 block" onchange="compSetManual(\'' + esc(wid) + '\',\'other_note\', this.value)"></td>';
            if (Object.keys(_lastComps).length) {
                var net = priced ? priced.adjustments.reduce(function (s, a) { return s + (a.adjustment_usd || 0); }, 0) : null;
                h += '<td class="px-2 py-1.5 text-right whitespace-nowrap">' + (priced ? (net >= 0 ? '+' : '−') + money(Math.abs(net)) : '—') + '</td>' +
                    '<td class="px-2 py-1.5 text-right font-semibold whitespace-nowrap">' + (priced ? money(priced.adjusted_price) : '—') + '</td>' +
                    '<td class="px-2 py-1.5 text-right">' + (priced ? priced.similarity_score : '—') + '</td>';
            }
            h += '</tr>';
        });
        h += '</tbody></table></div>';
        // The broker's own opinion (prints on the CMA report)
        h += '<div class="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">' +
            '<label class="text-[11px] text-gray-600">Suggested list price<input type="number" step="1000" value="' + esc(_opinion.list_price) + '" class="w-full border rounded px-2 py-1 text-xs mt-0.5" onchange="compSetOpinion(\'list_price\', this.value)"></label>' +
            '<label class="text-[11px] text-gray-600">Expected sale price (90 days)<input type="number" step="1000" value="' + esc(_opinion.sale_price_90) + '" class="w-full border rounded px-2 py-1 text-xs mt-0.5" onchange="compSetOpinion(\'sale_price_90\', this.value)"></label>' +
            '<label class="text-[11px] text-gray-600">Comments for the report<input type="text" value="' + esc(_opinion.comments) + '" class="w-full border rounded px-2 py-1 text-xs mt-0.5" onchange="compSetOpinion(\'comments\', this.value)"></label></div>' +
            '<p class="text-[10px] text-gray-400 mt-2">Rules and lines are saved with the CMA ("Value subject &amp; save CMA") and printed in the report\'s comparison grid. Condition is not served by Cotality (PropertyCondition is suppressed); exposure, view and outdoor space are the live values.</p></div>';
        return h;
    }
    function renderAdjustments(page) { var el = $('compAdjust-' + page); if (el) el.innerHTML = adjustmentsHtml(page); }
    window.compSetRate = function (key, value) { _rates[key] = Number(value) || 0; if (Object.keys(_lastComps).length) { _lastComps = {}; renderAdjustments(_lastPage || 'property'); toast('Rule changed — value the subject again to re-price the comparables.', 'info'); } };
    window.compSetManual = function (wid, key, value) {
        if (!_manual[wid]) _manual[wid] = {};
        _manual[wid][key] = key === 'other_note' ? String(value || '') : (Number(value) || 0);
        if (Object.keys(_lastComps).length) { _lastComps = {}; renderAdjustments(_lastPage || 'property'); }
    };
    window.compSetOpinion = function (key, value) { _opinion[key] = key === 'comments' ? String(value || '') : (value === '' ? '' : Number(value) || ''); };
    function pricedSet(comps) {
        _lastComps = {};
        (comps || []).forEach(function (c) { _lastComps[String(c.listing_key)] = c; });
        if (typeof reportState !== 'undefined') { reportState.cmaComps = comps || []; reportState.cmaRates = Object.assign({}, _rates); reportState.cmaOpinion = Object.assign({}, _opinion); reportState.cmaSubjectFacts = _subject ? subjectFacts() : null; }
    }

    // ── Subject ────────────────────────────────────────────────────────────────────────────────
    window.compFindSubject = function () {
        var q = ($('compPropertyAddress') ? $('compPropertyAddress').value : '').trim();
        var unit = ($('compPropertyUnit') ? $('compPropertyUnit').value : '').trim();
        var card = $('compSubjectCard');
        if (!q) { toast('Enter an address, building name or RLS ID.', 'warning'); return; }
        var params = /^RLS\d+$/i.test(q) ? { listingId: q.toUpperCase(), status: '*', limit: 10 } : { address: q, status: '*', limit: 25 };
        if (unit && !params.listingId) params.unit = unit;
        card.classList.remove('hidden');
        card.innerHTML = '<div class="text-xs text-gray-500"><i class="fas fa-spinner fa-spin mr-1"></i>Looking up in live Cotality…</div>';
        MallanAPI.idx.search(params).then(function (res) {
            var rows = (res && res.listings) || [];
            if (!rows.length) {
                card.innerHTML = '<div class="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">Not found in live Cotality. Enter the subject facts below and search comparables by neighborhood.</div>';
                _subject = null; return;
            }
            if (typeof listings !== 'undefined' && Array.isArray(listings)) rows.forEach(function (l) { if (!listings.some(function (x) { return x.id === l.id; })) listings.push(l); });
            _candidates = rows;
            if (rows.length === 1) { compUseSubject(rows[0].id); return; }
            card.innerHTML = '<p class="text-xs text-gray-600 mb-1">' + rows.length + ' listings match — pick the subject:</p><div class="border rounded divide-y max-h-56 overflow-y-auto">' + rows.map(function (l) {
                return '<div class="flex items-center justify-between gap-2 px-2 py-1.5 text-xs"><div><span class="font-medium">' + esc(l.address) + (l.unit ? ' #' + esc(l.unit) : '') + '</span> <span class="text-gray-500">' + esc(l.status) + ' · ' + money(l.status === 'CLOSED' && l.closePrice ? l.closePrice : l.price) + ' · ' + esc(l.listingCategory) + ' · ' + esc(l.lid) + '</span></div>' +
                    '<button onclick="compUseSubject(\'' + esc(l.id) + '\')" class="px-2 py-1 bg-gray-900 text-white rounded text-[10px]">Use</button></div>';
            }).join('') + '</div>';
        }).catch(function (err) { card.innerHTML = '<div class="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800">Lookup failed: ' + esc(err && err.message) + '</div>'; });
    };

    window.compUseSubject = function (id) {
        var l = _candidates.filter(function (x) { return String(x.id) === String(id); })[0] || (typeof listings !== 'undefined' ? listings.filter(function (x) { return String(x.id) === String(id); })[0] : null);
        if (!l) return;
        _subject = l; _valuation = null;
        if (l.listingCategory === 'rental' && _side !== 'rent') toggleCompSaleRent('rent');
        if (l.listingCategory === 'sale' && _side !== 'sale') toggleCompSaleRent('sale');
        if ($('compPropertyAddress')) {
            $('compPropertyAddress').value = l.address || '';
            // The building behind the subject, inside the address field (field-box.js): live Cotality facts
            if (typeof fieldBoxNote === 'function') fieldBoxNote($('compPropertyAddress'), [l.buildingName, [l.neighborhood, l.borough].filter(Boolean).join(', '), typeof ownershipLabel === 'function' ? ownershipLabel(l.ownership) : l.ownership].filter(Boolean).join(' · '));
        }
        if ($('compPropertyUnit')) $('compPropertyUnit').value = l.unit || '';
        var set = function (id, v) { var el = $(id); if (el) el.value = v == null || v === '' ? '' : v; };
        set('compSubjectBeds', l.beds); set('compSubjectBaths', l.baths); set('compSubjectSqft', l.intSqft); set('compSubjectFloor', l.floor);
        set('compSubjectMonthly', l.totalMonthly > 0 ? Math.round(l.totalMonthly) : (l.maintCC > 0 ? Math.round(l.maintCC) : ''));
        var own = $('compSubjectOwnership'); if (own) own.value = Array.prototype.some.call(own.options, function (o) { return o.value === l.ownership; }) ? l.ownership : '';
        if (typeof clearAllNeighborhoods === 'function' && typeof selectNeighborhood === 'function' && l.neighborhood) {
            var tags = $('compSubjectNeighborhoodTags'); if (tags) tags.innerHTML = '';
            removeAllTags('compSubjectNeighborhoodTags');
            selectNeighborhood(l.neighborhood, l.borough || '', false, '', 'compSubjectNeighborhoodTags');
        }
        var card = $('compSubjectCard'); card.classList.remove('hidden');
        card.innerHTML = '<div class="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs">' +
            '<div class="flex items-center justify-between"><span class="font-semibold text-gray-900">' + esc(l.address) + (l.unit ? ' #' + esc(l.unit) : '') + '</span><span class="text-gray-500">' + esc(l.lid) + '</span></div>' +
            '<div class="text-gray-700 mt-1">' + esc(l.status) + ' · ' + money(l.status === 'CLOSED' && l.closePrice ? l.closePrice : l.price) + ' · ' + (l.beds || 0) + ' BR / ' + (l.baths || 0) + ' BA' + (l.intSqft ? ' · ' + Number(l.intSqft).toLocaleString() + ' SF' : '') + (l.floor ? ' · floor ' + esc(l.floor) : '') +
            (l.listingCategory !== 'rental' && l.totalMonthly > 0 ? ' · ' + money(l.totalMonthly) + '/mo' : '') + '</div>' +
            '<div class="text-gray-500 mt-1">' + esc(l.neighborhood || '') + (l.borough ? ', ' + esc(l.borough) : '') + (l.ownership ? ' · ' + esc(l.ownership) : '') + (l.buildingName ? ' · ' + esc(l.buildingName) : '') + '</div>' +
            '<div class="mt-2 flex gap-2"><button onclick="compOpen(\'' + esc(l.id) + '\')" class="text-blue-600 hover:underline">Open listing</button></div></div>';
    };
    function removeAllTags(tagsId) {
        if (typeof getSelectedNeighborhoods !== 'function' || typeof removeNeighborhoodTag !== 'function') return;
        getSelectedNeighborhoods(tagsId).concat(typeof getSelectedBoroughs === 'function' ? getSelectedBoroughs(tagsId) : []).forEach(function (n) { removeNeighborhoodTag(n, tagsId); });
    }

    // From a listing page or a result card: comparables for this listing
    window.openCompsForListing = function (listing) {
        if (!listing) return;
        var detail = $('listingDetailPage'); if (detail) detail.classList.add('hidden');
        if (typeof jumpToComparables === 'function') jumpToComparables(); else if (typeof toggleSearchType === 'function') toggleSearchType('comparables');
        if (typeof openCompPage === 'function') openCompPage('property');
        _candidates = [listing];
        compUseSubject(listing.id);
        compSearch('property');
        try { history.replaceState(null, '', '#main'); } catch (e) { /* hash routing optional */ }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // ── Subject Buildings list ─────────────────────────────────────────────────────────────────
    window.compAddBuilding = function () {
        var el = $('compBuildingAddress'); var v = el ? el.value.trim() : '';
        if (!v) { toast('Type an address or building name first.', 'warning'); return; }
        if (_buildings.indexOf(v) === -1) _buildings.push(v);
        el.value = ''; renderBuildings();
    };
    window.compRemoveBuilding = function (i) { _buildings.splice(i, 1); renderBuildings(); };
    function renderBuildings() {
        // The chips live inside the address field (field-box.js); an empty list shows the field's placeholder
        var el = $('compBuildingList'); if (!el) return;
        el.innerHTML = _buildings.map(function (b, i) {
            return '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-800 border border-purple-200"><i class="fas fa-building text-[10px]"></i>' + esc(b) +
                '<button type="button" onclick="compRemoveBuilding(' + i + ')" class="ml-0.5 text-purple-400 hover:text-purple-700">&times;</button></span>';
        }).join('');
        var count = $('compBuildingCount'); if (count) count.textContent = _buildings.length ? _buildings.length + (_buildings.length === 1 ? ' building' : ' buildings') : 'No buildings yet.';
    }
    document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.id === 'compBuildingAddress') { var dd = $('compBuildingAddrResults'); if (dd && !dd.classList.contains('hidden')) return; e.preventDefault(); compAddBuilding(); } });

    // ── Outdoor space And / Or ─────────────────────────────────────────────────────────────────
    window.compOutdoorMode = function () {
        var mode = (document.querySelector('input[name="compOutdoorMode"]:checked') || {}).value || 'or';
        document.querySelectorAll('#compOutdoorBoxes input[data-field]').forEach(function (cb) {
            if (cb.getAttribute('data-value') === 'None') return;
            if (mode === 'or') cb.setAttribute('data-group', 'outdoor'); else cb.removeAttribute('data-group');
        });
    };

    // ── Reports and CMA ────────────────────────────────────────────────────────────────────────
    window.compGenerateReport = function () {
        var page = _lastPage;
        if (!page || !_results[page].length) { toast('Run a comparable search first.', 'warning'); return; }
        var comps = selectedRows(page);
        if (!comps.length) { toast('Select at least one comparable.', 'warning'); return; }
        var list = (_subject ? [_subject] : []).concat(comps).slice(0, 250);
        if (typeof reportState !== 'undefined') {
            reportState.cmaSubjectId = _subject ? _subject.id : null; reportState.cmaValuation = _valuation;
            // The priced comparables (adjustment lines) for the report's comparison grid, when the CMA was valued
            reportState.cmaComps = Object.keys(_lastComps).length ? comps.map(function (l) { return _lastComps[String(l.wid || l.id)]; }).filter(Boolean) : [];
            reportState.cmaRates = Object.assign({}, _rates); reportState.cmaOpinion = Object.assign({}, _opinion); reportState.cmaSubjectFacts = _subject ? subjectFacts() : null;
        }
        window._reportSourceListings = list;
        if (typeof openReportsModal === 'function') openReportsModal(list.map(function (l) { return l.id; }));
        if (_subject && typeof reportState !== 'undefined') {
            var cmaTile = document.querySelector('#reportsModal .report-tile[data-value="cma"]');
            if (cmaTile && typeof cmaTile.click === 'function') cmaTile.click();
        }
    };

    window.compSaveCma = function () {
        if (!_subject) { toast('Set a subject property first.', 'warning'); return; }
        var page = _lastPage || 'property';
        var comps = selectedRows(page);
        if (!comps.length) { toast('Select at least one comparable.', 'warning'); return; }
        var f = subjectFacts(); var w = windows();
        var body = {
            property_address: f.address, unit: f.unit || undefined, borough: f.borough || undefined, neighborhood: f.neighborhood || undefined,
            listing_type: _side === 'rent' ? 'rental' : 'sale', property_type: f.ownership || undefined,
            bedrooms: f.beds != null ? f.beds : undefined, bathrooms: f.baths != null ? f.baths : undefined, living_area: f.sqft || undefined, floor: f.floor != null ? f.floor : undefined,
            monthly_cost: f.monthly || undefined,
            subject_listing_key: f.wid || undefined, comp_listing_keys: comps.map(function (l) { return l.wid; }).filter(Boolean),
            months: Math.max(1, Math.round(w.soldDays / 30)), include_active: comps.some(function (l) { return l.status !== 'CLOSED'; }),
            // Broker Price Opinion: the agent's rules, per-comparable lines and price opinion travel with the record
            rates: Object.assign({}, _rates),
            manual: (function () { var m = {}; comps.forEach(function (l) { var wid = String(l.wid || l.id); var lines = manualLines(wid); if (lines.length) m[wid] = lines; }); return m; })(),
            opinion: { list_price: _opinion.list_price || undefined, sale_price_90: _opinion.sale_price_90 || undefined, comments: _opinion.comments || undefined },
        };
        // One save at a time: the server values the comps on live Cotality (up to 30 s) and every
        // click created another record meanwhile (three CMAs from one subject, 2026-10-27 walkthrough).
        if (_saving) { toast('The CMA is still being saved — one moment.', 'info'); return; }
        _saving = true;
        var saveBtns = Array.prototype.slice.call(document.querySelectorAll('#comparablesSection button[onclick="compSaveCma()"]'));
        saveBtns.forEach(function (b) { b.disabled = true; b.classList.add('opacity-60'); b.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Valuing on live Cotality…'; });
        var done = function () {
            _saving = false;
            saveBtns.forEach(function (b) { b.disabled = false; b.classList.remove('opacity-60'); b.innerHTML = '<i class="fas fa-chart-bar mr-1"></i>Value subject &amp; save CMA'; });
        };
        toast('Valuing the subject on live Cotality…', 'info');
        MallanAPI.cma.create(body).then(function (res) {
            _valuation = res && res.valuation ? res.valuation : null;
            _lastCmaId = res && res.item ? res.item.id : null;
            if (typeof reportState !== 'undefined') reportState.cmaValuation = _valuation;
            pricedSet(res && res.comps);
            done();
            renderStats(page);
            renderAdjustments(page);
            toast(_valuation ? 'CMA saved (#' + (res.item && res.item.id) + '): estimate ' + money(_valuation.estimated) + ' (' + money(_valuation.low) + ' – ' + money(_valuation.high) + ')' : 'CMA saved', 'success');
        }).catch(function (err) {
            done();
            var body = err && err.body;
            toast('CMA not saved: ' + ((body && body.error) || (err && err.message) || 'request failed'), 'error');
        });
    };
    var _saving = false;

    // ── Saved CMAs: reopen a CMA record from the CRM ───────────────────────────────────────────
    // A saved CMA is a record (subject facts, the comps as they were, the valuation): reopening shows
    // exactly what was saved, not a fresh search. Until 2026-10-27 nothing in the CRM reopened one
    // (acceptance walkthrough D5): the agent could save a CMA but never see it again.
    window.compOpenSavedCmas = function () {
        var panel = $('compSavedCmaPanel'); if (!panel) return;
        if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
        panel.classList.remove('hidden');
        panel.innerHTML = '<div class="text-xs text-gray-500"><i class="fas fa-spinner fa-spin mr-1"></i>Loading saved CMAs…</div>';
        MallanAPI.cma.list({ limit: 50 }).then(function (res) {
            var items = (res && res.items) || [];
            var h = '<div class="flex items-center justify-between mb-2"><h3 class="font-semibold text-gray-900 text-sm">Saved CMAs <span class="font-normal text-gray-500">— ' + items.length + (res && res.total > items.length ? ' of ' + res.total : '') + '</span></h3>' +
                '<button onclick="compOpenSavedCmas()" class="text-xs text-gray-500 hover:text-gray-800">Close</button></div>';
            if (!items.length) { panel.innerHTML = h + '<p class="text-xs text-gray-500">No saved CMAs yet. Search comparables for a subject property, then "Value subject &amp; save CMA".</p>'; return; }
            h += '<div class="border rounded divide-y max-h-72 overflow-y-auto">' + items.map(function (it) {
                var sd = it.subject_details || {};
                var when = it.created_at ? String(it.created_at).slice(0, 10) : '';
                var est = it.estimated_value != null ? money(it.estimated_value) : '--';
                return '<div class="flex items-center justify-between gap-3 px-3 py-2 text-xs">' +
                    '<div><span class="font-medium text-gray-900">' + esc(it.property_address || '') + (sd.unit ? ' #' + esc(sd.unit) : '') + '</span>' +
                    ' <span class="text-gray-500">' + esc([it.neighborhood, sd.listing_type === 'rental' ? 'Rental' : 'Sale', sd.property_type].filter(Boolean).join(' · ')) + '</span>' +
                    '<div class="text-gray-500">CMA #' + esc(it.id) + ' · saved ' + esc(when) + ' · ' + ((it.comps || []).length) + ' comps · estimate ' + est +
                    (it.price_range_low != null ? ' (' + money(it.price_range_low) + ' – ' + money(it.price_range_high) + ')' : '') + ' · ' + esc(it.status || '') + '</div></div>' +
                    '<button onclick="compLoadCma(\'' + esc(it.id) + '\')" class="px-2.5 py-1 bg-gray-900 text-white rounded text-[10px] whitespace-nowrap">Open</button></div>';
            }).join('') + '</div>';
            panel.innerHTML = h;
        }).catch(function (err) { panel.innerHTML = '<div class="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800">Saved CMAs could not be read: ' + esc(err && err.message) + '</div>'; });
    };

    // A stored comp in the row shape the results table and the reports use
    function rowFromSavedComp(c) {
        var status = String(c.status || '').toUpperCase();
        return {
            id: c.listing_id || ('KEY-' + c.listing_key), lid: c.listing_id || '', wid: c.listing_key || null,
            address: c.address || '', unit: c.unit || '', status: status, listingCategory: _side === 'rent' ? 'rental' : 'sale',
            price: c.list_price != null ? c.list_price : c.close_price, closePrice: c.close_price != null ? c.close_price : null, closedDate: c.close_date || null,
            beds: c.bedrooms, baths: c.bathrooms, intSqft: c.living_area, floor: c.floor, dom: c.days_on_market, totalMonthly: c.monthly_cost || null,
            exposures: c.exposures || null, View: c.view || null, PatioAndPorchFeatures: c.outdoor || null, yearBuilt: c.year_built || null,
            neighborhood: c.neighborhood || '', borough: c.borough || '', buildingName: '', company: '',
            _compFamily: status === 'CLOSED' ? 'closed' : status === 'PENDING' ? 'pending' : 'active',
            _saved: { adjusted_price: c.adjusted_price, similarity_score: c.similarity_score, adjustments: c.adjustments || [] },
        };
    }

    window.compLoadCma = function (id) {
        toast('Opening CMA #' + id + '…', 'info');
        MallanAPI.cma.get(id).then(function (res) {
            var it = res && res.item; if (!it) { toast('CMA #' + id + ' not found.', 'error'); return; }
            var sd = it.subject_details || {};
            var panel = $('compSavedCmaPanel'); if (panel) panel.classList.add('hidden');
            toggleCompSaleRent(sd.listing_type === 'rental' ? 'rent' : 'sale');
            if (typeof openCompPage === 'function') openCompPage('property');
            // The subject as saved; its live record is fetched for the card and "Open listing" when Cotality still has it
            var subject = {
                id: 'CMA-' + it.id, lid: '', wid: sd.subject_listing_key || null, address: it.property_address || '', unit: sd.unit || '',
                neighborhood: it.neighborhood || '', borough: it.borough || '', beds: sd.bedrooms, baths: sd.bathrooms, intSqft: sd.living_area, floor: sd.floor,
                ownership: sd.property_type || '', status: '', price: null, listingCategory: sd.listing_type === 'rental' ? 'rental' : 'sale', buildingName: '',
            };
            var comps = (it.comps || []).map(rowFromSavedComp);
            var showSaved = function () {
                _candidates = [subject]; compUseSubject(subject.id);
                if (sd.monthly_cost > 0 && $('compSubjectMonthly') && !$('compSubjectMonthly').value) $('compSubjectMonthly').value = sd.monthly_cost;
                _results.property = comps; _selected.property = {}; comps.forEach(function (l) { _selected.property[l.id] = true; });
                _sort.property = null; _lastPage = 'property'; _lastCmaId = it.id;
                _valuation = it.estimated_value != null ? { estimated: Number(it.estimated_value), low: Number(it.price_range_low), high: Number(it.price_range_high) } : null;
                // The rules, lines and opinion as saved (older records carry none → the defaults)
                _rates = Object.assign({}, DEFAULT_RATES, sd.rates && typeof sd.rates === 'object' ? sd.rates : {});
                _manual = {};
                Object.keys(sd.manual && typeof sd.manual === 'object' ? sd.manual : {}).forEach(function (wid) {
                    var m = {}; (sd.manual[wid] || []).forEach(function (line) {
                        var v = MANUAL_VARS.filter(function (x) { return x.label === line.label; })[0];
                        if (v && line.pct != null) m[v.key] = line.pct;
                        else if (line.amount != null) { m.other_amount = line.amount; m.other_note = line.note || ''; }
                    });
                    _manual[wid] = m;
                });
                _opinion = Object.assign({ list_price: '', sale_price_90: '', comments: '' }, sd.opinion && typeof sd.opinion === 'object' ? sd.opinion : {});
                if (typeof reportState !== 'undefined') { reportState.cmaSubjectId = subject.id; reportState.cmaValuation = _valuation; }
                pricedSet(it.comps || []);
                if (typeof listings !== 'undefined' && Array.isArray(listings)) comps.forEach(function (l) { if (!listings.some(function (x) { return x.id === l.id; })) listings.push(l); });
                var out = $(PAGES.property); if (out) out.style.display = 'block';
                renderResults('property', { notes: ['Saved CMA #' + it.id + ' from ' + String(it.created_at || '').slice(0, 10) + ': the comparables and the valuation exactly as saved (not a new search).'] });
                if (out) out.scrollIntoView({ behavior: 'smooth', block: 'start' });
                toast('CMA #' + it.id + ' opened: ' + comps.length + ' comps, estimate ' + (_valuation ? money(_valuation.estimated) : '--'), 'success');
            };
            if (subject.wid && subject.address) {
                MallanAPI.idx.search({ address: subject.address, unit: subject.unit || undefined, status: '*', limit: 25 }).then(function (r) {
                    var live = ((r && r.listings) || []).filter(function (l) { return String(l.wid) === String(subject.wid); })[0];
                    if (live) subject = live;
                }).catch(function () { /* the saved facts are shown */ }).then(showSaved);
            } else showSaved();
        }).catch(function (err) { toast('CMA #' + id + ' could not be opened: ' + (err && err.message), 'error'); });
    };

    // ── Save / load / clear criteria (per agent, this browser) ────────────────────────────────
    function criteriaState() {
        var state = { side: _side, values: {}, boxes: [], buildings: _buildings.slice() };
        document.querySelectorAll('#comparablesSection select[id], #comparablesSection input[type="number"][id], #comparablesSection input[type="text"][id]').forEach(function (el) { state.values[el.id] = el.value; });
        document.querySelectorAll('#comparablesSection input[type="checkbox"][data-field]:checked, #comparablesSection input[type="checkbox"][id]:checked').forEach(function (cb) {
            state.boxes.push(cb.id || [cb.closest('.comparables-page') && cb.closest('.comparables-page').id, cb.getAttribute('data-field'), cb.getAttribute('data-value'), cb.getAttribute('data-sub-status')].join('|'));
        });
        var radios = {}; document.querySelectorAll('#comparablesSection input[type="radio"]:checked').forEach(function (r) { radios[r.name] = r.value; }); state.radios = radios;
        return state;
    }
    function applyCriteria(state) {
        if (!state) return;
        toggleCompSaleRent(state.side === 'rent' ? 'rent' : 'sale');
        Object.keys(state.values || {}).forEach(function (id) { var el = $(id); if (el) el.value = state.values[id]; });
        document.querySelectorAll('#comparablesSection input[type="checkbox"]').forEach(function (cb) {
            var key = cb.id || [cb.closest('.comparables-page') && cb.closest('.comparables-page').id, cb.getAttribute('data-field'), cb.getAttribute('data-value'), cb.getAttribute('data-sub-status')].join('|');
            if (!cb.disabled) cb.checked = (state.boxes || []).indexOf(key) !== -1;
        });
        Object.keys(state.radios || {}).forEach(function (name) { var r = document.querySelector('#comparablesSection input[type="radio"][name="' + name + '"][value="' + state.radios[name] + '"]'); if (r) r.checked = true; });
        _buildings = (state.buildings || []).slice(); renderBuildings(); compOutdoorMode(); compRenderWindowNotes();
    }
    window.compSaveCriteria = function () {
        var name = window.prompt ? window.prompt('Name for this comp criteria set:') : null;
        if (!name) return;
        var all = loadSets(); all[name] = criteriaState();
        try { localStorage.setItem('compCriteria_' + agentKey(), JSON.stringify(all)); toast('Comp criteria "' + name + '" saved.', 'success'); } catch (e) { toast('Could not save (storage unavailable).', 'error'); }
    };
    function loadSets() { try { return JSON.parse(localStorage.getItem('compCriteria_' + agentKey()) || '{}'); } catch (e) { return {}; } }
    window.compLoadCriteria = function () {
        var all = loadSets(); var names = Object.keys(all);
        if (!names.length) { toast('No saved comp criteria yet.', 'info'); return; }
        var pick = window.prompt ? window.prompt('Load which comp criteria?\n' + names.join('\n'), names[0]) : names[0];
        if (!pick || !all[pick]) return;
        applyCriteria(all[pick]); toast('Comp criteria "' + pick + '" loaded.', 'success');
    };
    window.compClearCriteria = function () {
        document.querySelectorAll('#comparablesSection select').forEach(function (s) { s.selectedIndex = 0; });
        ['compSoldWithin', 'compPendingWithin', 'compActiveWithin'].forEach(function (id) { var s = $(id); if (s) { var def = s.querySelector('option[selected]'); if (def) s.value = def.value; } });
        document.querySelectorAll('#comparablesSection input[type="text"], #comparablesSection input[type="number"]').forEach(function (i) { i.value = ''; });
        document.querySelectorAll('#comparablesSection input[type="checkbox"]').forEach(function (cb) { if (!cb.disabled) cb.checked = cb.hasAttribute('checked'); });
        ['compPropertyClosed', 'compPropertyPending', 'compPropertyActive'].forEach(function (id) { var c = $(id); if (c) c.checked = true; });
        document.querySelectorAll('#comparablesSection input[type="radio"]').forEach(function (r) { r.checked = r.hasAttribute('checked'); });
        document.querySelectorAll('#comparablesSection [data-facet-group]').forEach(function (box) { if (typeof setFacetMatch === 'function') setFacetMatch(box, 'all'); });
        ['compSubjectNeighborhoodTags', 'compPropertyNeighborhoodTags', 'compGeneralNeighborhoodTags'].forEach(removeAllTags);
        document.querySelectorAll('#comparablesSection .neighborhood-tree input[type="checkbox"]').forEach(function (cb) { cb.checked = false; cb.indeterminate = false; });
        _subject = null; _candidates = []; _buildings = []; _valuation = null; renderBuildings();
        _rates = Object.assign({}, DEFAULT_RATES); _manual = {}; _opinion = { list_price: '', sale_price_90: '', comments: '' }; _lastComps = {}; _lastCmaId = null;
        var card = $('compSubjectCard'); if (card) { card.classList.add('hidden'); card.innerHTML = ''; }
        Object.keys(PAGES).forEach(function (p) { var out = $(PAGES[p]); if (out) { out.style.display = 'none'; out.innerHTML = ''; } _results[p] = []; _selected[p] = {}; });
        compOutdoorMode(); compRenderWindowNotes();
        toast('Comp criteria cleared.', 'info');
    };

    // ── Page open hook (called by openCompPage in search-engine.js) ───────────────────────────
    window.compOnOpenPage = function (method) {
        compRenderWindowNotes();
        if (method === 'building') renderBuildings();
        if (method === 'property' && $('compPropertyAddress') && !_subject) $('compPropertyAddress').focus();
    };

    // A new address typed for the subject must not carry the previous subject into the lookup or the
    // search: the unit (a stale unit from "Run CMA" on another listing made "333 E 46" come back
    // "Not found"), and the subject itself with its card and facts — subjectFacts() prefers the found
    // subject over the typed text, so a changed or cleared address kept searching the old property
    // (acceptance walkthrough 2026-10-27, point 6: what is shown and what is searched move together).
    document.addEventListener('input', function (e) {
        if (!e.target || e.target.id !== 'compPropertyAddress') return;
        var typed = e.target.value.trim().toUpperCase();
        var current = _subject && _subject.address ? String(_subject.address).toUpperCase() : '';
        if (current && typed.indexOf(current) === 0) return;
        if ($('compPropertyUnit')) $('compPropertyUnit').value = '';
        _candidates = [];
        if (_subject) dropSubject();
    });
    function dropSubject() {
        _subject = null; _valuation = null; _lastComps = {}; _lastCmaId = null;
        var card = $('compSubjectCard'); if (card) { card.classList.add('hidden'); card.innerHTML = ''; }
        ['compSubjectBeds', 'compSubjectBaths', 'compSubjectSqft', 'compSubjectFloor', 'compSubjectMonthly', 'compSubjectOwnership'].forEach(function (id) { var el = $(id); if (el) el.value = ''; });
        removeAllTags('compSubjectNeighborhoodTags');
    }
    // A building picked from the address suggestions goes straight onto the Subject Buildings list
    // (the chips sit inside the same field; field-box.js, search-engine.js selectSearchAddress)
    document.addEventListener('mallan:address-picked', function (e) {
        if (e.target && e.target.id === 'compBuildingAddress') compAddBuilding();
    });
    document.addEventListener('DOMContentLoaded', function () { compOutdoorMode(); compRenderWindowNotes(); renderBuildings(); });
})();
