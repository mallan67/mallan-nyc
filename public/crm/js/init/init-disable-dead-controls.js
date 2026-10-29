        // ═══════════════════════════════════════════════════════════════════
        // CRM search controls — checked against the LIVE Cotality contract
        //
        // window.COTALITY_SEARCH_CONTRACT is inlined by build.js from
        // data/cotality-enums.live.json (regenerated live by `npm run
        // cotality:pull`). For each Cotality field it says how many SALE
        // (PropertyType Residential) and RENTAL (ResidentialLease) records
        // carry it and whether Cotality filters on it. The server mapping
        // layer (lib/search/crm-idx-filter.ts) reads the same file.
        //
        // 1. Every data-field control is enabled only when the current search
        //    — Sale, Rent, or Building (both) — can execute it; otherwise it is
        //    disabled with the reason as its tooltip. Re-applied whenever the
        //    agent switches Sale / Rent / Building or Basic / Advanced, because
        //    the sale and rental mappings differ. No control is silently
        //    ignored (Master §5.5).
        // 2. Advanced search lists every other Cotality field that carries
        //    data for the current side ("All Cotality fields"), generated here
        //    from the contract, so the professional search covers the feed.
        // 3. Panels Cotality cannot serve (map grid / transit need coordinates,
        //    which Cotality suppresses; open-house search is not wired) are
        //    neutralized with a visible notice.
        // ═══════════════════════════════════════════════════════════════════

        (function () {
            'use strict';

            var C = window.COTALITY_SEARCH_CONTRACT || null;
            var SIDE_LABEL = { s: 'sale', r: 'rental' };
            // Mallan-derived criteria executed by the server mapping layer (documented LOCAL semantics).
            var DERIVED = { PriceChangeDirection: 1, DOM: 1, PriceBelowOriginalPct: 1, PriceChangedWithinDays: 1,
                PricePerSqft: 1, TotalMonthly: 1, TopFloor: 1, Penthouse: 1 };
            // Fields the basic / advanced forms already search through dedicated inputs.
            var FIXED_FIELDS = ['PropertyType', 'StandardStatus', 'ListPrice', 'BedroomsTotal', 'BathroomsTotalInteger',
                'RoomsTotal', 'LivingArea', 'YearBuilt', 'StoriesTotal', 'NumberOfUnitsTotal', 'CloseDate',
                'PurchaseContractDate', 'ListingContractDate', 'ModificationTimestamp', 'SubdivisionName', 'CityRegion',
                'PostalCode', 'UnitNumber', 'PublicRemarks', 'BuildingName', 'ListOfficeName', 'ListingId',
                'StreetNumber', 'StreetName', 'StreetDirPrefix', 'PropertySubType', 'CommonInterest', 'AvailabilityDate'];
            // System / identity columns that are not search criteria. Listing-history timestamps (pending,
            // status change, on / off market, photos changed …) and the agents' / offices' associations are criteria.
            var SYSTEM_FIELD = /(Key$|KeyNumeric$|^ModificationTimestamp$|^Originating|^SourceSystem|RecordSignature|^HumanModified|^Nucleus|^Copyright|^Disclaimer)/;

            function sidesNow() {
                // Comparable Reports has its own Sales / Rentals toggle
                var comps = document.getElementById('comparablesSection');
                if (comps && comps.style.display !== 'none' && typeof compSide === 'function') return compSide() === 'rent' ? ['r'] : ['s'];
                var t = (typeof currentSearchTab !== 'undefined' && currentSearchTab) || 'sale';
                return t === 'rent' ? ['r'] : t === 'sale' ? ['s'] : ['s', 'r'];
            }
            function sideLabel(sides) { return sides.length === 1 ? SIDE_LABEL[sides[0]] : 'sale or rental'; }
            function carried(row, sides) { return !!row && sides.some(function (x) { return row[x] > 0; }); }
            function humanize(field) { return field.replace(/YN$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2'); }
            function labelFor(lookup, value) { return (C.labels[lookup] && C.labels[lookup][value]) || humanize(value); }

            // The live LookupValues a control sends (operators, presence / recency values and "not:" prefixes stripped).
            function valueTokens(raw) {
                return String(raw || '').split(',').map(function (v) { return v.trim(); }).filter(function (v) {
                    return v && !/^(any|notnull|isnull|null)$/i.test(v) && !/^(gte?|lte?|gt|lt|eq|ne|within):/i.test(v);
                }).map(function (v) { return v.replace(/^not:/i, ''); });
            }

            // CRM status checkbox values → live StandardStatus values (in contract is 'Pending' live).
            var STATUS_VALUES = { Active: ['Active'], ComingSoon: ['ComingSoon'], Pending: ['Pending', 'ActiveUnderContract'],
                Closed: ['Closed'], Withdrawn: ['Withdrawn'], Canceled: ['Canceled'], Expired: ['Expired'], Hold: ['Hold'],
                Incomplete: ['Incomplete'], Future: ['Incomplete'] };
            function statusReason(tokens, sides) {
                if (!C.statusCounts) return null;
                var live = [];
                tokens.forEach(function (t) { (STATUS_VALUES[t] || [t]).forEach(function (v) { live.push(v); }); });
                var records = 0;
                sides.forEach(function (x) {
                    var counts = C.statusCounts[x === 's' ? 'sale' : 'rental'] || {};
                    live.forEach(function (v) { records += Number(counts[v]) || 0; });
                });
                return records > 0 ? null : 'Cotality delivers no ' + tokens.join(' / ') + ' ' + sideLabel(sides) + ' listings to this licence';
            }

            // Old MlsStatus sub-statuses (MlsStatus is suppressed): the ones live Property fields express,
            // mirroring lib/search/crm-idx-filter.ts SUB_STATUSES, and why the others cannot be searched.
            var SUB_STATUS_LIVE = { BackOnMarket: { s: 'Active', f: 'BackOnMarketTimestamp' }, Sold: { s: 'Closed' }, Rented: { s: 'Closed' },
                SoldThruUs: { s: 'Closed', f: 'BuyerOfficeMlsId' }, RentedThruUs: { s: 'Closed', f: 'BuyerOfficeMlsId' },
                NoFinancing: { s: 'Closed', f: 'BuyerFinancing' }, Financed: { s: 'Closed', f: 'BuyerFinancing' }, Future: { s: 'Incomplete' } };
            function subStatusReason(sub, sides) {
                var live = SUB_STATUS_LIVE[sub];
                if (!live) {
                    if (/ACRIS|NominalSales/.test(sub)) return 'ACRIS (NYC Department of Finance) records are not in Cotality';
                    if (/ThruUs$/.test(sub)) return "Cotality carries the buyer's office only once a listing closes, and suppresses MlsStatus (the contract stage)";
                    return 'Cotality suppresses MlsStatus; in-contract listings are delivered as Pending without this stage';
                }
                if (/ThruUs$/.test(sub) && !C.mallanOffice) return "Mallan's office is not in the live contract";
                return statusReason([live.s], sides) || (live.f ? reasonFor(live.f, [], sides) : null);
            }

            // Why a control cannot be executed for this side, or null when it can.
            function reasonFor(field, tokens, sides) {
                if (field === 'StandardStatus') return tokens.length ? statusReason(tokens, sides) : null;
                var linked = /^([A-Za-z]+)\/([A-Za-z0-9_]+)$/.exec(field);
                if (linked) {
                    var rf = (C.resources && C.resources[linked[1]] || {})[linked[2]];
                    if (!rf) return linked[2] + ' is not a searchable Cotality ' + linked[1] + ' field';
                    if (!carried(rf, sides)) return 'No ' + sideLabel(sides) + ' ' + linked[1] + ' records in Cotality carry ' + linked[2];
                    var bad = rf.l ? tokens.filter(function (v) { return (C.enums[rf.l] || []).indexOf(v) === -1; }) : [];
                    return bad.length ? "'" + bad.join(', ') + "' is not a Cotality value for " + linked[2] : null;
                }
                if (DERIVED[field]) return null; // validated by the server mapping
                var p = C.property[field], c = C.custom[field];
                if (!p && !c) return field + ' is not a Cotality field';
                var label = sideLabel(sides);
                if (p) {
                    if (p.f === 'SUPPRESSED') return 'Cotality suppresses ' + field;
                    if (!carried(p, sides)) return 'No ' + label + ' records in Cotality carry ' + field;
                    if (p.f !== 'SUPPORTED') return 'Cotality neither filters nor returns ' + field;
                    if (p.k === 'enum' || p.k === 'multi') {
                        var members = C.enums[p.l] || [];
                        var bad = tokens.filter(function (v) { return members.indexOf(v) === -1 && !(field === 'ListOfficeMlsId'); });
                        if (bad.length) return "'" + bad.join(', ') + "' is not a Cotality value for " + field;
                    }
                    if (field === 'ListOfficeMlsId' && tokens.indexOf('OwnOffice') !== -1 && !C.mallanOffice) return "Mallan's office is not in the live contract";
                    return null;
                }
                if (!carried(c, sides)) return 'No ' + label + ' records in Cotality carry the REBNY field ' + field;
                return null;
            }

            function setState(el, reason) {
                var label = el.closest && el.closest('label');
                if (reason) {
                    el.disabled = true;
                    el.title = reason;
                    el.setAttribute('data-contract-reason', reason);
                    if (label) { label.classList.add('opacity-50', 'cursor-not-allowed'); label.title = reason; }
                } else if (el.hasAttribute('data-contract-reason')) {
                    el.disabled = false;
                    el.title = '';
                    el.removeAttribute('data-contract-reason');
                    if (label) { label.classList.remove('opacity-50', 'cursor-not-allowed'); label.title = ''; }
                }
            }

            function applyToControls(sides) {
                var disabled = 0;
                document.querySelectorAll('#searchBasicMode, #searchBasicModeRental, #searchBasicModeBuilding, #searchAdvancedMode, #comparablesSection').forEach(function (root) {
                    root.querySelectorAll('input[data-field], select[data-field], input[data-unavailable]').forEach(function (el) {
                        if (el.closest('[data-generated-cotality]')) return; // generated rows manage their own state
                        var sub = el.getAttribute('data-sub-status');
                        var reason = el.getAttribute('data-unavailable') || (sub ? subStatusReason(sub, sides) : null);
                        var field = sub ? null : el.getAttribute('data-field');
                        if (!reason && field) {
                            if (el.tagName === 'SELECT') {
                                // Each option is a value; disable only the options Cotality does not have.
                                var fieldReason = reasonFor(field, [], sides);
                                Array.prototype.forEach.call(el.options, function (opt) {
                                    if (!opt.value) return;
                                    var r = fieldReason || reasonFor(field, valueTokens(opt.value), sides);
                                    opt.disabled = !!r;
                                    opt.title = r || '';
                                });
                                reason = fieldReason;
                            } else {
                                reason = reasonFor(field, valueTokens(el.getAttribute('data-not') || el.getAttribute('data-value')), sides);
                            }
                        }
                        setState(el, reason);
                        if (reason) disabled++;
                    });
                    // Mallan-only flags that are never Cotality criteria
                    root.querySelectorAll('input[data-local-field]').forEach(function (el) {
                        setState(el, 'Mallan-only flag — not a Cotality search criterion');
                    });
                });
                return disabled;
            }

            // ── Generated "All Cotality fields" for advanced search ──────────────
            function coveredFields() {
                var covered = {};
                FIXED_FIELDS.forEach(function (f) { covered[f] = 1; });
                document.querySelectorAll('#searchBasicMode [data-field], #searchBasicModeRental [data-field], #searchBasicModeBuilding [data-field], #searchAdvancedMode [data-field]').forEach(function (el) {
                    if (!el.closest('[data-generated-cotality]')) covered[el.getAttribute('data-field')] = 1;
                });
                return covered;
            }

            function esc(s) { return String(s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }

            function controlHtml(field, kind, row, isCustom) {
                var f = esc(field);
                if (kind === 'enum' || kind === 'multi' || kind === 'list') {
                    var observed = {};
                    ['s', 'r'].forEach(function (x) { Object.keys((row.o && row.o[x]) || {}).forEach(function (v) { observed[v] = (observed[v] || 0) + row.o[x][v]; }); });
                    var values = isCustom ? Object.keys(observed) : (C.enums[row.l] || []);
                    var seen = values.filter(function (v) { return observed[v]; }).sort(function (a, b) { return observed[b] - observed[a]; });
                    var rest = values.filter(function (v) { return !observed[v]; });
                    var restTitle = seen.length ? rest.length + ' more Cotality values (not seen on recent records)' : rest.length + ' Cotality values';
                    var box = function (v) {
                        return '<label class="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" class="w-3 h-3" data-field="' + f + '" data-value="' + esc(v) + '"> ' +
                            esc(isCustom ? humanize(v) : labelFor(row.l, v)) + '</label>';
                    };
                    return '<div class="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">' + seen.map(box).join('') + '</div>' +
                        (rest.length ? '<details class="mt-1"><summary class="text-[11px] text-gray-500 cursor-pointer">' + restTitle + '</summary>' +
                            '<div class="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 mt-1">' + rest.map(box).join('') + '</div></details>' : '');
                }
                if (kind === 'boolean' || kind === 'boolean01') {
                    return '<select class="border border-gray-300 rounded px-2 py-1 text-xs" data-field="' + f + '"><option value="">Any</option><option value="true">Yes</option><option value="false">No</option></select>';
                }
                if (kind === 'date' || kind === 'timestamp') {
                    // A date range, and a recency / presence choice (server: 'within:N', 'notnull', 'isnull').
                    return '<div class="flex items-center gap-2"><input type="date" class="w-full border border-gray-300 rounded px-2 py-1 text-xs" aria-label="From" data-field="' + f + '" data-range="min">' +
                        '<span class="text-gray-400 text-xs">to</span><input type="date" class="w-full border border-gray-300 rounded px-2 py-1 text-xs" aria-label="To" data-field="' + f + '" data-range="max"></div>' +
                        '<select class="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-xs" data-field="' + f + '"><option value="">Any time</option>' +
                        (/^OpenHouse\//.test(field)
                            ? '<option value="next:7">Next 7 days</option><option value="next:30">Next 30 days</option><option value="within:7">Last 7 days</option>'
                            : '<option value="within:7">Last 7 days</option><option value="within:30">Last 30 days</option><option value="within:90">Last 90 days</option>' +
                              '<option value="within:365">Last 12 months</option><option value="notnull">Has a date</option><option value="isnull">No date</option>') + '</select>';
                }
                if (kind === 'number') {
                    var type = 'number';
                    return '<div class="flex items-center gap-2"><input type="' + type + '" class="w-full border border-gray-300 rounded px-2 py-1 text-xs" placeholder="Min" data-field="' + f + '" data-range="min">' +
                        '<span class="text-gray-400 text-xs">to</span><input type="' + type + '" class="w-full border border-gray-300 rounded px-2 py-1 text-xs" placeholder="Max" data-field="' + f + '" data-range="max"></div>';
                }
                return '<input type="text" class="w-full border border-gray-300 rounded px-2 py-1 text-xs" placeholder="Contains…" data-field="' + f + '" data-text="1">';
            }

            var GROUPS = [
                { id: 'pick', title: 'Features & picklists', test: function (k) { return k === 'enum' || k === 'multi' || k === 'list'; } },
                { id: 'yn', title: 'Yes / No', test: function (k) { return k === 'boolean' || k === 'boolean01'; } },
                { id: 'num', title: 'Numbers', test: function (k) { return k === 'number'; } },
                { id: 'date', title: 'Dates', test: function (k) { return k === 'date' || k === 'timestamp'; } },
                { id: 'text', title: 'Text', test: function (k) { return k === 'string'; } },
                { id: 'res-OpenHouse', res: 'OpenHouse', title: 'Open houses (Cotality OpenHouse)' },
                { id: 'res-Member', res: 'Member', title: 'Listing or co-listing agent (Cotality Member)' },
                { id: 'res-Office', res: 'Office', title: 'Listing or co-listing office (Cotality Office)' },
                { id: 'res-CustomProperty', res: 'CustomProperty', title: 'Fees, restrictions & floor plans (Cotality CustomProperty)' },
                { id: 'res-PropertyRooms', res: 'PropertyRooms', title: 'Rooms (Cotality PropertyRooms)' },
            ];
            // Criteria on one resource must hold on the same open house / agent / office / room row.
            var RESOURCE_NOTE = { OpenHouse: 'same open house', Member: 'any listing agent', Office: 'any listing office',
                CustomProperty: 'listing extras', PropertyRooms: 'same room' };

            function renderAllFields() {
                var host = document.getElementById('advAllCotalityFields');
                if (!host || host.getAttribute('data-rendered') === '1') return;
                var covered = coveredFields();
                var rows = [];
                Object.keys(C.property).forEach(function (field) {
                    var p = C.property[field];
                    if (covered[field] || SYSTEM_FIELD.test(field) || p.f !== 'SUPPORTED' || !(p.s > 0 || p.r > 0) || p.k === 'unknown') return;
                    rows.push({ field: field, kind: p.k, row: p, custom: false });
                });
                Object.keys(C.custom).forEach(function (key) {
                    var c = C.custom[key];
                    if (covered[key] || !(c.s > 0 || c.r > 0)) return;
                    rows.push({ field: key, kind: c.k, row: c, custom: true });
                });
                Object.keys(C.resources || {}).forEach(function (res) {
                    Object.keys(C.resources[res]).forEach(function (field) {
                        var key = res + '/' + field;
                        if (covered[key]) return;
                        rows.push({ field: key, label: field, kind: C.resources[res][field].k, row: C.resources[res][field], custom: false, resource: res });
                    });
                });
                rows.sort(function (a, b) { return a.field < b.field ? -1 : 1; });
                var html = '<div class="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">' +
                    '<input type="search" id="advAllCotalityFind" class="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Find a Cotality field…" aria-label="Find a Cotality field">' +
                    '<span id="advAllCotalityCount" class="text-xs text-gray-500"></span></div>';
                GROUPS.forEach(function (g) {
                    var members = rows.filter(function (r) { return g.res ? r.resource === g.res : !r.resource && g.test(r.kind); });
                    if (!members.length) return;
                    html += '<details class="mb-2 border rounded-lg" data-group-id="' + g.id + '"><summary class="px-3 py-2 text-xs font-semibold text-gray-700 cursor-pointer">' + g.title +
                        ' <span class="font-normal text-gray-400" data-group-count></span></summary><div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-3">';
                    members.forEach(function (r) {
                        html += '<div class="bg-white p-2 rounded border border-gray-100" data-cotality-row data-field-name="' + esc(r.field) + '" data-s="' + (r.row.s || 0) + '" data-r="' + (r.row.r || 0) + '">' +
                            '<p class="text-xs font-semibold text-gray-700 mb-1">' + esc(humanize(r.label || r.field)) + (r.custom ? ' <span class="text-[10px] font-normal text-blue-600">REBNY · applied by Mallan</span>' : '') +
                            (r.resource ? ' <span class="text-[10px] font-normal text-blue-600">' + esc(RESOURCE_NOTE[r.resource] || r.resource) + '</span>' : '') +
                            ' <span class="text-[10px] font-normal text-gray-400" data-row-count></span></p>' + controlHtml(r.field, r.kind, r.row, r.custom) + '</div>';
                    });
                    html += '</div></details>';
                });
                host.innerHTML = html;
                host.setAttribute('data-rendered', '1');
                var find = document.getElementById('advAllCotalityFind');
                if (find) find.addEventListener('input', function () { filterAllFields(sidesNow()); });
            }

            // Show only the generated fields this side carries; hidden rows are disabled so they are never sent.
            function filterAllFields(sides) {
                var host = document.getElementById('advAllCotalityFields');
                if (!host) return;
                var q = ((document.getElementById('advAllCotalityFind') || {}).value || '').toLowerCase().replace(/\s+/g, '');
                var shown = 0;
                host.querySelectorAll('[data-cotality-row]').forEach(function (row) {
                    var counts = { s: Number(row.getAttribute('data-s')), r: Number(row.getAttribute('data-r')) };
                    var onSide = sides.some(function (x) { return counts[x] > 0; });
                    var match = !q || row.getAttribute('data-field-name').toLowerCase().indexOf(q) !== -1;
                    row.style.display = onSide && match ? '' : 'none';
                    row.querySelectorAll('input, select').forEach(function (el) { el.disabled = !onSide; });
                    var n = sides.reduce(function (sum, x) { return sum + counts[x]; }, 0);
                    var cnt = row.querySelector('[data-row-count]');
                    if (cnt) cnt.textContent = n ? '(' + n.toLocaleString() + (sides.length === 1 ? ' ' + SIDE_LABEL[sides[0]] : '') + ' records)' : '';
                    if (onSide && match) shown++;
                });
                host.querySelectorAll('details[data-group-id]').forEach(function (d) {
                    var visible = d.querySelectorAll('[data-cotality-row]:not([style*="display: none"])').length;
                    d.style.display = visible ? '' : 'none';
                    var gc = d.querySelector('[data-group-count]');
                    if (gc) gc.textContent = '(' + visible + ')';
                });
                var countEl = document.getElementById('advAllCotalityCount');
                if (countEl) countEl.textContent = shown + ' more Cotality fields with ' + sideLabel(sides) + ' data · live ' + String(C.pulledAt || '').slice(0, 10);
            }

            // ── Panels Cotality cannot serve ───────────────────────────────────
            var DEAD_CONTAINERS = [
                { selector: '#saleTransitExpand', reason: 'Transit search needs listing coordinates — Cotality suppresses Latitude/Longitude. Use the neighborhood map.' },
                { selector: '#rentalTransitExpand', reason: 'Transit search needs listing coordinates — Cotality suppresses Latitude/Longitude. Use the neighborhood map.' },
                { selector: '#buildingTransitExpand', reason: 'Transit search needs listing coordinates — Cotality suppresses Latitude/Longitude. Use the neighborhood map.' },
                { selector: '#advancedTransitExpand', reason: 'Transit search needs listing coordinates — Cotality suppresses Latitude/Longitude. Use the neighborhood map.' },
                // panel: the whole grid panel (heading, Clear button, every select) — not only the anchor's row,
                // which left the "Clear" button live and pointing at a script the page does not load.
                { idAnchor: 'adv-grid-north', panel: '.mb-4', reason: 'Manhattan grid search needs listing coordinates — Cotality suppresses Latitude/Longitude. Use the neighborhood map.' },
                { idAnchor: 'bldg-grid-north', panel: '.border', reason: 'Manhattan grid search needs listing coordinates — Cotality suppresses Latitude/Longitude. Use the neighborhood map.' },
                { selector: '#compGeneralTransit', reason: 'Transit search needs listing coordinates — Cotality suppresses Latitude/Longitude. Use neighborhoods.' },
                // "Some Customers" / "All Customers" only showed a toast describing themselves (mockup
                // placeholders, found 2026-10-27): customer-based selection needs client portfolios on
                // the server, which are not stored yet.
                { selector: '#selectionDropdown', reason: 'Customer-based selection is not available yet: client portfolios are not stored on the server.' },
                // Agent Search controls with no Cotality filter behind them (the working ones are the agent/office pickers above) — 2026-10-15.
                { selector: '#agentSearchUnsupported', reason: 'Not connected to a Cotality filter. Use the agent and office filters above.' },
                { selector: '#agentQuickFiltersUnsupported', reason: 'Not connected to a Cotality filter yet.' },
            ];

            function neutralizeContainers() {
                DEAD_CONTAINERS.forEach(function (entry) {
                    var nodes;
                    if (entry.selector) nodes = document.querySelectorAll(entry.selector);
                    else {
                        var anchor = document.getElementById(entry.idAnchor);
                        var panel = anchor && anchor.parentElement ? ((entry.panel && anchor.parentElement.closest(entry.panel)) || anchor.parentElement) : null;
                        nodes = panel ? [panel] : [];
                    }
                    for (var j = 0; j < nodes.length; j++) {
                        var container = nodes[j];
                        if (container.dataset && container.dataset.deadContainerMarked === 'true') continue;
                        container.setAttribute('aria-disabled', 'true');
                        container.setAttribute('data-dead-container', 'true');
                        container.title = entry.reason;
                        container.style.pointerEvents = 'none';
                        container.style.opacity = '0.6';
                        container.style.cursor = 'not-allowed';
                        var children = container.querySelectorAll('input, select, button, textarea, [tabindex]');
                        for (var k = 0; k < children.length; k++) {
                            try { children[k].disabled = true; children[k].setAttribute('aria-disabled', 'true'); children[k].setAttribute('tabindex', '-1'); } catch (e) { /* read-only */ }
                        }
                        if (!container.querySelector('[data-dead-container-notice]')) {
                            var notice = document.createElement('div');
                            notice.setAttribute('data-dead-container-notice', 'true');
                            notice.style.cssText = 'pointer-events:auto;font-size:11px;color:#92400e;background:#fef3c7;border:1px solid #fcd34d;border-radius:4px;padding:4px 8px;margin-bottom:6px;';
                            notice.textContent = entry.reason;
                            container.insertBefore(notice, container.firstChild);
                        }
                        if (container.dataset) container.dataset.deadContainerMarked = 'true';
                    }
                });
            }

            function apply() {
                neutralizeContainers();
                if (!C) {
                    console.error('[CRM Search] COTALITY_SEARCH_CONTRACT missing — rebuild index-built.html (node public/crm/build.js).');
                    return;
                }
                var sides = sidesNow();
                renderAllFields();
                var disabled = applyToControls(sides);
                filterAllFields(sides);
                console.log('[CRM Search] ' + sideLabel(sides) + ' mapping applied from the live Cotality contract (' +
                    String(C.pulledAt || '').slice(0, 10) + '): ' + disabled + ' control(s) unavailable for this search.');
            }

            // Re-apply when the agent switches Sale / Rent / Building, Basic / Advanced, or Comparable Reports' Sales / Rentals.
            ['toggleSearchTab', 'toggleSearchMode', 'toggleSearchType'].forEach(function (name) {
                var original = window[name];
                if (typeof original !== 'function') return;
                window[name] = function () {
                    var result = original.apply(this, arguments);
                    try { apply(); } catch (e) { console.error('[CRM Search] contract apply failed:', e); }
                    return result;
                };
            });

            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
            else apply();
            window.addEventListener('mallan:data:ready', apply);
            window.applyCotalitySearchContract = apply;
        })();
