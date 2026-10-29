        // ═══════════════════════════════════════════════════════════════════════════════
        // SAVED SEARCH FUNCTIONS — API-backed (MallanAPI.savedSearches)
        // ═══════════════════════════════════════════════════════════════════════════════

        function toggleSavedSearchDropdown() {
            document.getElementById('savedSearchDropdown').classList.toggle('hidden');
        }

        function populateSavedSearchList() {
            var container = document.getElementById('savedSearchList');
            if (!container) return;

            container.innerHTML = '<p class="p-3 text-sm text-gray-400 text-center"><i class="fas fa-spinner fa-spin"></i> Loading...</p>';

            if (typeof MallanAPI === 'undefined') {
                container.innerHTML = '<p class="p-3 text-sm text-gray-500 text-center">API not available</p>';
                return;
            }

            MallanAPI.savedSearches.list().then(function(result) {
                var searches = result.savedSearches || [];
                searchResultsState.savedSearches = searches;

                if (searches.length === 0) {
                    container.innerHTML = '<p class="p-3 text-sm text-gray-500 text-center">No saved searches yet</p>';
                    return;
                }

                container.innerHTML = searches.map(function(search) {
                    var alertBadge = search.alert_enabled && search.alert_frequency
                        ? '<span class="ml-1 px-1.5 py-0.5 bg-green-100 text-green-700 text-[9px] font-semibold rounded-full">' + search.alert_frequency + '</span>'
                        : '';
                    // Name the client the search was saved for (the badge used to be an icon alone)
                    var savedFor = search.lead_id ? ((searchResultsState.clients || []).find(function (c) { return String(c.id) === String(search.lead_id); }) || null) : null;
                    var clientBadge = search.lead_id
                        ? '<span class="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-semibold rounded-full" title="Saved for ' + escapeHtml(savedFor ? savedFor.name : 'client ' + search.lead_id) + '"><i class="fas fa-user text-[7px]"></i> ' + escapeHtml(savedFor ? savedFor.name : 'client') + '</span>'
                        : '';
                    // ── P0-2 count badge honesty ──────────────────────
                    // Engine A (live Trestle) and Engine B (DB projection)
                    // have different criteria vocabularies. The badge here
                    // sources its count from Engine B. When the saved
                    // search contains projection-unsupported criteria,
                    // count_status === 'unsupported_criteria'. In that
                    // case do NOT render search.result_count as if it
                    // were live — it is a stored snapshot from the last
                    // /execute, possibly stale by hours or days.
                    //
                    // Show "n/a" with a tooltip explaining which criteria
                    // are not honored by the alert engine. The agent can
                    // still LOAD the search and re-run it on Engine A;
                    // only the count badge is unavailable.
                    var countBadge = '';
                    var hasLiveCount = typeof search.live_result_count === 'number';
                    var hasStoredCount = typeof search.result_count === 'number';
                    if (hasLiveCount) {
                        var storedTitle = hasStoredCount ? ' title="Stored count: ' + escapeHtml(String(search.result_count)) + '"' : '';
                        countBadge = '<span class="ml-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-semibold rounded-full"' + storedTitle + '>' + search.live_result_count + '</span>';
                    } else if (search.count_status === 'unsupported_criteria' || search.count_status === 'invalid_criteria') {
                        var unsupportedTitle = search.unsupported_criteria && search.unsupported_criteria.length
                            ? 'Live count unavailable — alert engine does not support: ' + search.unsupported_criteria.join(', ') + '. Load the search to see live results.'
                            : search.count_status === 'invalid_criteria'
                                ? 'Live count unavailable because this saved search has invalid legacy criteria. Recreate the search before running it.'
                                : 'Live count unavailable for this search.';
                        countBadge = '<span class="ml-1 px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[9px] font-semibold rounded-full" title="' + escapeHtml(unsupportedTitle) + '">n/a</span>';
                    } else if (hasStoredCount) {
                        countBadge = '<span class="ml-1 px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-semibold rounded-full">' + search.result_count + '</span>';
                    }
                    var dateStr = search.updated_at ? new Date(search.updated_at).toLocaleDateString() : '';
                    return '<div class="flex items-center justify-between px-3 py-2 hover:bg-gray-100">'
                        + '<button onclick="loadSavedSearch(\'' + search.id + '\')" class="text-left flex-1">'
                        + '<div class="font-medium text-sm">' + escapeHtml(search.name) + alertBadge + clientBadge + countBadge + '</div>'
                        + '<div class="text-xs text-gray-500">' + dateStr + '</div>'
                        + '</button>'
                        + '<button onclick="deleteSavedSearch(\'' + search.id + '\')" class="p-1 text-red-500 hover:bg-red-100 rounded" aria-label="Delete">'
                        + '<i class="fas fa-trash text-xs"></i>'
                        + '</button>'
                        + '</div>';
                }).join('');
            }).catch(function(err) {
                console.error('[SavedSearches] Failed to load:', err);
                container.innerHTML = '<p class="p-3 text-sm text-red-500 text-center">Failed to load saved searches</p>';
            });
        }

        function openSaveSearchModal() {
            document.getElementById('savedSearchDropdown').classList.add('hidden');
            document.getElementById('saveSearchModal').classList.remove('hidden');

            // Populate client dropdown
            _populateSaveSearchClientDropdown();

            // Show criteria summary
            _showCriteriaSummary();

            // P0-3: gate the alert frequency dropdown on supported criteria
            _refreshAlertGateUi();
        }

        // ── P0-3 frontend alert gate ────────────────────────────────────
        // Mirror of lib/search/criteria-to-prisma.ts
        // PROJECTION_SUPPORTED_CRITERIA_KEYS. Keep in sync.
        //
        // Reasoning: the alert cron replays through the projection-backed
        // Engine B with this strict subset of criteria. Saved searches
        // whose criteria include any other key cannot have alerts enabled
        // — silent partial-criteria alerts would email listings the agent
        // never intended to surface to a client.
        //
        // The frontend evaluates this BEFORE the backend POST so the
        // agent sees the alert dropdown disabled (with reason) before
        // they tab through the form. The backend POST/PATCH gate at
        // app/api/crm/saved-searches still enforces the same rule.
        var _ALERT_SUPPORTED_KEYS = {
            listing_type: 1, listingType: 1, type: 1, searchTab: 1,
            statuses: 1, status: 1, standardStatus: 1, standard_status: 1,
            property_type: 1, property_types: 1, propertyType: 1, propertyTypes: 1,
            borough: 1, neighborhoods: 1, neighborhood: 1,
            min_price: 1, max_price: 1, minPrice: 1, maxPrice: 1, priceMin: 1, priceMax: 1,
            min_beds: 1, max_beds: 1, minBeds: 1, maxBeds: 1, bedsMin: 1, bedsMax: 1, beds: 1,
            min_baths: 1, max_baths: 1, minBaths: 1, maxBaths: 1, bathsMin: 1, bathsMax: 1, baths: 1,
            min_sqft: 1, max_sqft: 1, minSqft: 1, maxSqft: 1, sqftMin: 1, sqftMax: 1,
            // Reserved view state (skipped, treated as supported) — mirrors PROJECTION_RESERVED_CRITERIA_KEYS
            _search_tab: 1, _search_mode: 1
        };

        function _evaluateAlertGate(apiCriteria) {
            if (!apiCriteria) return { ok: true, unsupported: [] };
            var unsupported = [];
            Object.keys(apiCriteria).forEach(function(key) {
                var val = apiCriteria[key];
                if (val === undefined || val === null || val === '') return;
                if (_ALERT_SUPPORTED_KEYS[key]) return;
                unsupported.push(key);
            });
            unsupported.sort();
            return {
                ok: unsupported.length === 0,
                unsupported: unsupported
            };
        }

        function _refreshAlertGateUi() {
            var sel = document.getElementById('savedSearchAlertFreq');
            var hint = document.getElementById('savedSearchAlertGateHint');
            if (!sel) return;
            var apiCriteria = _criteriaToApiFormat(activeSearchCriteria);
            var gate = _evaluateAlertGate(apiCriteria);
            if (gate.ok) {
                sel.disabled = false;
                sel.title = '';
                if (hint) {
                    hint.textContent = '';
                    hint.classList.add('hidden');
                }
                return;
            }
            // Force "Off" and disable. The alert engine cannot honor this
            // criteria set; refusing here is the safe default.
            sel.value = '';
            sel.disabled = true;
            var msg = 'Alerts unavailable — these criteria are not honored by the alert engine: ' + gate.unsupported.join(', ') + '. The live search still works.';
            sel.title = msg;
            if (hint) {
                hint.textContent = msg;
                hint.classList.remove('hidden');
            }
        }

        function _populateSaveSearchClientDropdown() {
            var select = document.getElementById('savedSearchClientId');
            if (!select || typeof MallanAPI === 'undefined') return;

            // Keep the default option
            select.innerHTML = '<option value="">-- No client (agent only) --</option>';

            MallanAPI.clients.list({ limit: 200 }).then(function(result) {
                var clients = result.clients || result.leads || [];
                clients.forEach(function(c) {
                    var name = (c.first_name || '') + ' ' + (c.last_name || '');
                    if (c.secondary_first_name) {
                        name += ' & ' + c.secondary_first_name;
                        if (c.secondary_last_name && c.secondary_last_name !== c.last_name) {
                            name += ' ' + c.secondary_last_name;
                        }
                    }
                    var opt = document.createElement('option');
                    opt.value = c.id;
                    opt.textContent = name.trim() + (c.email ? ' (' + c.email + ')' : '');
                    select.appendChild(opt);
                });
            }).catch(function() {
                // Non-blocking — client list is optional
            });
        }

        function _showCriteriaSummary() {
            var summary = document.getElementById('savedSearchCriteriaSummary');
            if (!summary || !activeSearchCriteria) return;

            var c = activeSearchCriteria;
            var parts = [];
            if (c.searchTab) parts.push(c.searchTab === 'rent' ? 'Rental' : c.searchTab === 'building' ? 'Building' : 'Sale');
            if (c.searchMode === 'advanced') parts.push('Advanced form');
            // The status being saved is shown here so the agent sees what the record will carry.
            parts.push(c.statuses && c.statuses.length ? 'Status: ' + c.statuses.map(function (s) { return String(s).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, function (ch) { return ch.toUpperCase(); }); }).join(', ') : 'Any status');
            if (c.ownership && c.ownership.length) parts.push(c.ownership.join(', '));
            if (c.zip) parts.push('Zip ' + c.zip);
            if (c.address) parts.push(c.address);
            if (c.checkboxGroups || c.checkboxFilters) {
                var facets = [];
                [c.checkboxGroups, c.checkboxFilters].forEach(function (set) {
                    if (!set) return;
                    Object.keys(set).forEach(function (k) {
                        var v = set[k];
                        if (v && typeof v === 'object' && !Array.isArray(v)) Object.keys(v).forEach(function (f) { facets.push(f + ' ' + [].concat(v[f]).join('/')); });
                        else facets.push(k + ' ' + [].concat(v).join('/'));
                    });
                });
                if (facets.length) parts.push(facets.join(', '));
            }
            if (c.fieldRanges) {
                Object.keys(c.fieldRanges).forEach(function (f) {
                    var b = c.fieldRanges[f] || {};
                    parts.push(f + (b.min != null && b.min !== '' ? ' ≥ ' + b.min : '') + (b.max != null && b.max !== '' ? ' ≤ ' + b.max : ''));
                });
            }
            if (c.fieldText) Object.keys(c.fieldText).forEach(function (f) { parts.push(f + ' "' + c.fieldText[f] + '"'); });
            if (c.financingMin) parts.push('Financing ≥ ' + c.financingMin + '%');
            if (c.openHouseDateFrom) parts.push('Open house ' + c.openHouseDateFrom + (c.openHouseDateTo && c.openHouseDateTo !== c.openHouseDateFrom ? ' - ' + c.openHouseDateTo : ''));
            if (c.priceMin || c.priceMax) {
                var price = '$' + (c.priceMin ? c.priceMin.toLocaleString() : '0') + ' - $' + (c.priceMax ? c.priceMax.toLocaleString() : 'Any');
                parts.push(price);
            }
            if (c.bedsMin != null) parts.push(c.bedsMin + '+ beds');
            if (c.bathsMin) parts.push(c.bathsMin + '+ baths');
            if (c.neighborhoods && c.neighborhoods.length > 0) {
                parts.push(c.neighborhoods.length === 1 ? c.neighborhoods[0] : c.neighborhoods.length + ' neighborhoods');
            }
            if (c.sqftMin) parts.push(c.sqftMin + '+ sqft');
            if (c.agentOffice) parts.push('agent/office filter');

            summary.innerHTML = parts.length > 0
                ? '<p class="text-xs text-blue-700"><i class="fas fa-search mr-1"></i> <strong>Criteria:</strong> ' + escapeHtml(parts.join(' | ')) + '</p>'
                : '<p class="text-xs text-blue-700"><i class="fas fa-info-circle mr-1"></i> Current search criteria will be saved.</p>';
        }

        /** Map activeSearchCriteria → API criteria format
         *
         *  P0-1 round-trip parity: this is the saved-record shape persisted
         *  to SavedSearch.criteria (JSON column). The keys here must
         *  round-trip through _criteriaToFormFields below so a saved
         *  search loaded later reproduces the same form state.
         *
         *  ALERT-GATE NOTE: any key here that is NOT in
         *  PROJECTION_SUPPORTED_CRITERIA_KEYS at
         *  lib/search/criteria-to-prisma.ts will mark the saved search as
         *  "unsupported_criteria" — count badge will show "n/a", and
         *  enabling alerts will be refused with a 422 by the backend
         *  (P0-3). This is by design: live Trestle search supports all of
         *  these fields; the projection alert engine does not.
         */
        function _criteriaToApiFormat(c) {
            if (!c) return { listing_type: 'sale' };
            // Building tab doesn't have its own type — default to 'sale' but the _search_tab
            // preserves the original tab so loadSavedSearch restores it correctly
            var out = {
                listing_type: c.searchTab === 'rent' ? 'rental' : 'sale',
                min_price: c.priceMin || undefined,
                max_price: c.priceMax || undefined,
                min_beds: c.bedsMin != null ? c.bedsMin : undefined,
                max_beds: c.bedsMax != null ? c.bedsMax : undefined,
                min_baths: c.bathsMin || undefined,
                max_baths: c.bathsMax || undefined,
                min_sqft: c.sqftMin || undefined,
                max_sqft: c.sqftMax || undefined,
                min_rooms: c.roomsMin || undefined,
                max_rooms: c.roomsMax || undefined,
                neighborhoods: c.neighborhoods && c.neighborhoods.length > 0 ? c.neighborhoods : undefined,
                borough: c.borough || undefined,
                zip: c.zip || undefined,
                status: c.statuses && c.statuses.length > 0 ? c.statuses : undefined,
                ownership: c.ownership && c.ownership.length > 0 ? c.ownership : undefined,
                address: c.address || undefined,
                listing_id: c.rlsId || undefined,
                // Building-specific
                min_year: c.yearMin || undefined,
                max_year: c.yearMax || undefined,
                min_floors: c.floorsMin || undefined,
                max_floors: c.floorsMax || undefined,
                min_units: c.unitsMin || undefined,
                max_units: c.unitsMax || undefined,
                building_name: c.buildingName || undefined,
                // Date ranges (Listed/Updated)
                date_from: c.dateFrom || undefined,
                date_to: c.dateTo || undefined,
                date_type: c.dateActivityType || undefined,
                close_date_from: c.soldDateFrom || undefined,
                close_date_to: c.soldDateTo || undefined,
                // View state
                _search_tab: c.searchTab || 'sale',
                _search_mode: c.searchMode || undefined, // basic | advanced — an advanced search reloads into the advanced form
                // ── P0-1: Trestle-search inputs that previously dropped on save ──
                keyword: c.keyword || undefined,
                management_company: c.managementCompany || undefined,
                property_sub_type: c.propertySubType || undefined,
                unit: c.unit || undefined,
                // Contract date is independent of `date_from/to`. Previously
                // collapsed onto close_date_from/to which corrupted the meaning.
                contract_date_from: c.contractDateFrom || undefined,
                contract_date_to: c.contractDateTo || undefined,
                // sponsorUnit param round-trip (Bug A11 frontend split)
                sponsor_unit: c.sponsorUnit || undefined,
                // checkboxFilters carries the whitelisted Cooling/Garage/View/
                // BuildingFeatures/etc. set. Stored as a JSON string to
                // preserve the inner shape unchanged across save/load.
                checkbox_filters: c.checkboxFilters ? JSON.stringify(c.checkboxFilters) : undefined,
                // Agent / office pickers: the entries the search used ({id|text, label} per filter); restored with no network call.
                agent_office: c.agentOffice || undefined,
                // "Match any ticked" building-status facets (New Development OR Sponsor Unit): one OR
                // group across fields, stored as the same JSON the search sends.
                checkbox_groups: c.checkboxGroups ? JSON.stringify(c.checkboxGroups) : undefined,
                // Min / max boxes by live field (monthlies, taxes, $/sqft …) and free-text boxes by live field.
                // They were never saved: the Anushree long form reloaded without its monthlies cap (found 2026-10-27).
                field_ranges: c.fieldRanges && Object.keys(c.fieldRanges).length ? JSON.stringify(c.fieldRanges) : undefined,
                field_text: c.fieldText && Object.keys(c.fieldText).length ? JSON.stringify(c.fieldText) : undefined,
                // Building financing minimum and the open-house date range were collected and sent but never
                // saved: a reload ran without them (found 2026-10-27).
                financing_min: c.financingMin || undefined,
                open_house_from: c.openHouseDateFrom || undefined,
                open_house_to: c.openHouseDateTo || undefined,
            };
            return out;
        }

        // Record key → collected-criteria key. The inverse of _criteriaToApiFormat: a saved record is
        // executed from this object (search-engine.js executeSearchCriteria), the form only displays it.
        var _API_TO_CRITERIA_KEY = {
            min_price: 'priceMin', max_price: 'priceMax', min_beds: 'bedsMin', max_beds: 'bedsMax', min_baths: 'bathsMin', max_baths: 'bathsMax',
            min_sqft: 'sqftMin', max_sqft: 'sqftMax', min_rooms: 'roomsMin', max_rooms: 'roomsMax', neighborhoods: 'neighborhoods', borough: 'borough',
            zip: 'zip', status: 'statuses', property_type: 'ownership', ownership: 'ownership', address: 'address', listing_id: 'rlsId', min_year: 'yearMin', max_year: 'yearMax',
            min_floors: 'floorsMin', max_floors: 'floorsMax', min_units: 'unitsMin', max_units: 'unitsMax', building_name: 'buildingName',
            date_from: 'dateFrom', date_to: 'dateTo', date_type: 'dateActivityType', close_date_from: 'soldDateFrom', close_date_to: 'soldDateTo',
            keyword: 'keyword', management_company: 'managementCompany', property_sub_type: 'propertySubType', unit: 'unit',
            contract_date_from: 'contractDateFrom', contract_date_to: 'contractDateTo', checkbox_filters: 'checkboxFilters', checkbox_groups: 'checkboxGroups',
            field_ranges: 'fieldRanges', field_text: 'fieldText', financing_min: 'financingMin', open_house_from: 'openHouseDateFrom', open_house_to: 'openHouseDateTo'
        };
        var _NUMERIC_API_KEYS = { min_price: 1, max_price: 1, min_beds: 1, max_beds: 1, min_baths: 1, max_baths: 1, min_sqft: 1, max_sqft: 1, min_rooms: 1, max_rooms: 1,
            min_year: 1, max_year: 1, min_floors: 1, max_floors: 1, min_units: 1, max_units: 1, financing_min: 1 };
        var _JSON_API_KEYS = { checkbox_filters: 1, checkbox_groups: 1, field_ranges: 1, field_text: 1 };
        var _LIST_API_KEYS = { status: 1, property_type: 1, ownership: 1, neighborhoods: 1 };

        /**
         * Saved record → the criteria object the search runs on, validated and normalised.
         * Returns { criteria, unsupported[] }: every key the record carries that this build cannot
         * execute exactly is named in `unsupported` (never dropped silently).
         */
        function _criteriaFromApiFormat(saved) {
            var unsupported = [], reported = {};
            var c = {};
            if (!saved || typeof saved !== 'object') return { criteria: c, unsupported: ['Saved criteria are unreadable'] };
            c.searchTab = saved._search_tab || (saved.listing_type === 'rental' || saved.listing_type === 'rent' ? 'rent' : 'sale');
            c.searchMode = saved._search_mode === 'advanced' ? 'advanced' : 'basic';
            var report = function (key, text) { reported[key] = 1; unsupported.push(text); };
            Object.keys(saved).forEach(function (key) {
                var v = saved[key];
                if (key === 'listing_type' || key === '_search_tab' || key === '_search_mode') return;
                if (v == null || v === '') return;
                var label = _CRITERIA_LABELS[key] || key;
                if (key === 'sponsor_unit') {
                    // Older records carried the sponsor flag on its own; the search reads it from the facet set.
                    if (v === true || v === 'true') { c.checkboxFilters = c.checkboxFilters || {}; if (!c.checkboxFilters.SponsorUnit) c.checkboxFilters.SponsorUnit = ['true']; }
                    return;
                }
                var target = _API_TO_CRITERIA_KEY[key];
                if (!target) { report(key, label + ' (not a criterion this build can run)'); return; }
                if (_NUMERIC_API_KEYS[key]) {
                    var n = Number(v);
                    if (isNaN(n)) { report(key, label + ' (stored value "' + v + '" is not a number)'); return; }
                    if (key === 'min_beds' || key === 'max_beds') { c[target] = n; return; } // 0 = studio
                    if (n) c[target] = n;
                    return;
                }
                if (_JSON_API_KEYS[key]) {
                    var parsed = v;
                    if (typeof v === 'string') { try { parsed = JSON.parse(v); } catch (e) { report(key, label + ' (stored value unreadable)'); return; } }
                    if (!parsed || typeof parsed !== 'object') { report(key, label + ' (stored value unreadable)'); return; }
                    if (key === 'checkbox_filters' && c.checkboxFilters) parsed = Object.assign({}, parsed, c.checkboxFilters);
                    if (Object.keys(parsed).length) c[target] = parsed;
                    return;
                }
                if (_LIST_API_KEYS[key]) {
                    var list = Array.isArray(v) ? v : String(v).split(',');
                    list = list.map(function (x) { return String(x).trim(); }).filter(Boolean);
                    if (list.length) c[target] = list;
                    return;
                }
                c[target] = typeof v === 'string' ? v.trim() : v;
            });
            // Self-check: writing the executable criteria back must give the record again. A value that does
            // not survive the round trip is reported, not run as something else.
            var back = _criteriaToApiFormat(c);
            var sponsorFolded = saved.sponsor_unit === true || saved.sponsor_unit === 'true';
            Object.keys(saved).forEach(function (key) {
                if (key === 'listing_type' || key === '_search_tab' || key === '_search_mode' || key === 'sponsor_unit') return;
                if (!_API_TO_CRITERIA_KEY[key] || reported[key]) return; // already reported
                var expected = saved[key];
                if (key === 'checkbox_filters' && sponsorFolded && c.checkboxFilters) {
                    // the folded flag is part of the executable set, not of the stored facets
                    var stored = typeof expected === 'string' ? (function () { try { return JSON.parse(expected); } catch (e) { return null; } })() : expected;
                    if (stored && typeof stored === 'object' && !stored.SponsorUnit) expected = Object.assign({ SponsorUnit: ['true'] }, stored);
                }
                var a = _canonCriterion(expected), b = _canonCriterion(back[key]);
                if (a !== b) unsupported.push((_CRITERIA_LABELS[key] || key) + ' (stored value could not be executed exactly: ' + _describeCriterion(saved[key]) + ')');
            });
            if (sponsorFolded && !(c.checkboxFilters && c.checkboxFilters.SponsorUnit)) unsupported.push('Sponsor unit (could not be executed)');
            return { criteria: c, unsupported: unsupported };
        }

        /** Restore API criteria → form fields and re-run search */
        function _criteriaToFormFields(criteria) {
            var unresolved = []; // saved values that found no control in this form — reported, never dropped
            if (!criteria) return unresolved;

            // Set search tab
            var tab = criteria._search_tab || (criteria.listing_type === 'rental' ? 'rent' : 'sale');
            if (typeof toggleSearchTab === 'function') {
                toggleSearchTab(tab);
            } else {
                currentSearchTab = tab;
            }
            // The basic form of this tab (Sales, Rentals and Buildings are separate forms)
            var _basicFormId = typeof activeBasicFormId === 'function' ? activeBasicFormId()
                : (tab === 'rent' ? 'searchBasicModeRental' : tab === 'building' ? 'searchBasicModeBuilding' : 'searchBasicMode');
            var _quickPrefix = tab === 'rent' ? 'rental' : tab === 'building' ? 'building' : 'sale';

            // Determine element ID prefix based on tab
            var prefix = tab === 'rent' ? 'rental' : 'sale';

            // Restore into the form the search was saved from. An advanced search reloaded into the
            // basic form lost its facets, groups and keyword and ran a different query (found 2026-10-26).
            var _wantAdv = criteria._search_mode === 'advanced';
            if (typeof toggleSearchMode === 'function') toggleSearchMode(_wantAdv ? 'advanced' : 'basic');
            var _ids = _wantAdv
                ? { minPrice: prefix === 'rental' ? 'advRentalMinRent' : 'advSaleMinPrice', maxPrice: prefix === 'rental' ? 'advRentalMaxRent' : 'advSaleMaxPrice',
                    minBeds: 'adv-min-beds', maxBeds: 'adv-max-beds', minBaths: 'adv-min-baths', maxBaths: 'adv-max-baths', minRooms: 'adv-min-rooms', maxRooms: 'adv-max-rooms',
                    minSqft: 'adv-min-sqft', maxSqft: 'adv-max-sqft', address: 'advancedSearchAddress', zip: 'adv-zip', rls: 'adv-rls-id' }
                : { minPrice: prefix === 'rental' ? 'rentalMinRent' : 'saleMinPrice', maxPrice: prefix === 'rental' ? 'rentalMaxRent' : 'saleMaxPrice',
                    minBeds: prefix + 'MinBeds', maxBeds: prefix + 'MaxBeds', minBaths: prefix + 'MinBaths', maxBaths: prefix + 'MaxBaths', minRooms: prefix + 'MinRooms', maxRooms: prefix + 'MaxRooms',
                    minSqft: prefix + 'MinSqft', maxSqft: prefix + 'MaxSqft',
                    address: tab === 'rent' ? 'rentalSearchAddress' : tab === 'building' ? 'buildingSearchAddress' : 'saleSearchAddress',
                    zip: tab === 'rent' ? 'rentalQuickZip' : tab === 'building' ? 'buildingQuickZip' : 'saleQuickZip',
                    rls: tab === 'rent' ? 'rentalQuickRls' : tab === 'building' ? 'buildingQuickRls' : 'saleQuickRls' };
            // A select takes the saved (or nearest) option; a text/number input takes the value as typed
            var _setAny = function (id, value) {
                if (value == null || value === '') return;
                var el = document.getElementById(id);
                if (!el) return;
                if (el.tagName === 'SELECT') { _setSelectValue(id, value); return; }
                el.value = value;
            };

            // Price
            _setAny(_ids.minPrice, criteria.min_price);
            _setAny(_ids.maxPrice, criteria.max_price);

            // Beds
            _setAny(_ids.minBeds, criteria.min_beds);
            _setAny(_ids.maxBeds, criteria.max_beds);

            // Baths
            _setAny(_ids.minBaths, criteria.min_baths);
            _setAny(_ids.maxBaths, criteria.max_baths);

            // Rooms
            _setAny(_ids.minRooms, criteria.min_rooms);
            _setAny(_ids.maxRooms, criteria.max_rooms);

            // Sqft
            _setAny(_ids.minSqft, criteria.min_sqft);
            _setAny(_ids.maxSqft, criteria.max_sqft);

            // Address
            var addrEl = document.getElementById(_ids.address);
            if (addrEl && criteria.address) addrEl.value = criteria.address;

            // Zip
            var zipEl = document.getElementById(_ids.zip);
            if (zipEl && criteria.zip) zipEl.value = criteria.zip;

            // RLS ID
            var rlsEl = document.getElementById(_ids.rls);
            if (rlsEl && criteria.listing_id) rlsEl.value = criteria.listing_id;

            // Neighborhoods
            if (criteria.neighborhoods && criteria.neighborhoods.length > 0 && typeof selectNeighborhood === 'function') {
                var tagsId = typeof _resolveActiveNeighborhoodTagsId === 'function' ? _resolveActiveNeighborhoodTagsId() : 'saleNeighborhoodTags';
                criteria.neighborhoods.forEach(function(n) {
                    var borough = typeof _findBoroughForNeighborhood === 'function' ? _findBoroughForNeighborhood(n) : '';
                    selectNeighborhood(n, borough, !borough, '', tagsId);
                });
            }

            // Building-specific fields
            if (tab === 'building' || criteria.min_year || criteria.max_year) {
                _setSelectValue('buildingMinYear', criteria.min_year);
                _setSelectValue('buildingMaxYear', criteria.max_year);
                _setSelectValue('buildingMinUnits', criteria.min_units);
                _setSelectValue('buildingMaxUnits', criteria.max_units);
                _setSelectValue('buildingMinFloors', criteria.min_floors);
                _setSelectValue('buildingMaxFloors', criteria.max_floors);
            }

            // Restore date range pickers
            var drpPrefix = tab === 'rent' ? 'rental' : 'sale';
            if (criteria.date_from || criteria.date_to) {
                var drpName = drpPrefix + 'ListedUpdated';
                _setDrpDates(drpName, criteria.date_from, criteria.date_to);
                // Also set the activity type dropdown (Listed/Updated)
                if (criteria.date_type) {
                    var actEl = document.getElementById(drpPrefix === 'rental' ? 'rentalListingActivityType' : 'saleListingActivityType');
                    if (actEl) actEl.value = criteria.date_type;
                }
            }
            if (criteria.close_date_from || criteria.close_date_to) {
                var soldDrpName = drpPrefix + (drpPrefix === 'rental' ? 'RentedDate' : 'SoldDate');
                _setDrpDates(soldDrpName, criteria.close_date_from, criteria.close_date_to);
            }
            // Open-house date range (sale / rental pickers; the Buildings form has none)
            if (criteria.open_house_from || criteria.open_house_to) {
                var ohWrapper = tab === 'building' ? null : document.querySelector('[data-drp="' + drpPrefix + 'OpenHouse"]');
                if (ohWrapper) _setDrpDates(drpPrefix + 'OpenHouse', criteria.open_house_from, criteria.open_house_to || criteria.open_house_from);
                else unresolved.push('Open house ' + (criteria.open_house_from || '') + (criteria.open_house_to ? ' - ' + criteria.open_house_to : '') + ' (no date picker in this form)');
            }
            // Building financing minimum — the collector reads this box by id on every form (a text box in the
            // basic forms; _setAny handles a select too)
            if (criteria.financing_min) {
                var finId = tab === 'rent' ? 'rentalBuildingFinancingMin' : tab === 'building' ? 'buildingFinancingMin' : 'saleBuildingFinancingMin';
                var finEl = document.getElementById(finId);
                if (!finEl || finEl.disabled) unresolved.push('Min financing % ' + criteria.financing_min + (finEl ? ' (box disabled)' : ' (no box in this form)'));
                else {
                    _setAny(finId, String(criteria.financing_min));
                    if (parseInt(finEl.value, 10) !== Number(criteria.financing_min)) unresolved.push('Min financing % ' + criteria.financing_min + ' (this box cannot take it; it shows ' + finEl.value + ')');
                }
            }

            // Restore status boxes into the container the search reads for this mode: the advanced form
            // reads #saleStatusOptions / #rentalStatusOptions, each basic form reads itself (search-engine.js
            // collectSearchCriteria). Restoring into the basic form while the advanced form ran left an
            // advanced saved search on Clear's default (Active) — found 2026-10-27.
            var statusScope = _wantAdv
                ? document.getElementById(tab === 'rent' ? 'rentalStatusOptions' : 'saleStatusOptions')
                : document.getElementById(_basicFormId);
            var savedStatuses = Array.isArray(criteria.status) ? criteria.status : [];
            // Map saved statuses back to checkbox data-value attributes
            var statusReverseMap = {
                'ACTIVE': 'Active', 'COMING_SOON': 'ComingSoon', 'PENDING': 'Pending', 'ACTIVEUNDERCONTRACT': 'ActiveUnderContract',
                'CLOSED': 'Closed', 'WITHDRAWN': 'Withdrawn', 'CANCELED': 'Canceled',
                'EXPIRED': 'Expired', 'HOLD': 'Hold', 'INCOMPLETE': 'Incomplete', 'FUTURE': 'Future'
            };
            if (statusScope) {
                // Saved without a status = any status: Clear's default Active must not narrow the rerun.
                var statusBoxes = Array.prototype.slice.call(statusScope.querySelectorAll('[data-field="StandardStatus"]'));
                statusBoxes.forEach(function(cb) { cb.checked = false; });
                var csv = function (b) { return String(b.getAttribute('data-value') || '').split(',').map(function (v) { return v.trim(); }); };
                savedStatuses.forEach(function(s) {
                    var resoVal = statusReverseMap[String(s).toUpperCase()] || s;
                    var cb = statusBoxes.find(function (b) { return !b.hasAttribute('data-sub-status') && b.getAttribute('data-value') === resoVal; })   // one box = one status
                          || statusBoxes.find(function (b) { return b.getAttribute('data-sub-status') === resoVal; })                                    // live sub-status (Back On Market …)
                          || statusBoxes.find(function (b) { return !b.hasAttribute('data-sub-status') && csv(b).indexOf(resoVal) !== -1; });            // combined box (Withdrawn,Canceled,…)
                    if (cb && !cb.disabled) cb.checked = true;
                    else unresolved.push('Status ' + s + (cb ? ' (its box is disabled in this form)' : ' (no box in this form)'));
                });
            } else if (savedStatuses.length) {
                unresolved.push('Status ' + savedStatuses.join(', ') + ' (this form has no status controls)');
            }

            // Restore ownership checkboxes. Ownership is its own saved criterion (ownership); a record saved before the cutover
            // carried it as property_type, and those values restore only where a real CommonInterest control matches (a true
            // PropertyType value is never reinterpreted).
            var ownerForm = document.getElementById(_basicFormId);
            var ownershipValues = Array.isArray(criteria.ownership) ? criteria.ownership.slice() : [];
            if (ownershipValues.length === 0 && ownerForm && Array.isArray(criteria.property_type)) {
                ownershipValues = criteria.property_type.filter(function(value) {
                    return !!ownerForm.querySelector('[data-field="CommonInterest"][data-value="' + value + '"], [data-field="CommonInterest"][value="' + value + '"]');
                });
            }
            if (ownershipValues.length > 0) {
                if (ownerForm) {
                    ownerForm.querySelectorAll('[data-field="CommonInterest"]').forEach(function(cb) { cb.checked = false; });
                    ownershipValues.forEach(function(pt) {
                        var cb = ownerForm.querySelector('[data-field="CommonInterest"][data-value="' + pt + '"]');
                        if (!cb) cb = ownerForm.querySelector('[data-field="CommonInterest"][value="' + pt + '"]');
                        if (cb && !cb.disabled) cb.checked = true;
                        else unresolved.push('Ownership ' + pt + (cb ? ' (box disabled)' : ' (no box in this form)'));
                    });
                } else {
                    unresolved.push('Ownership ' + ownershipValues.join(', ') + ' (no ownership controls in this form)');
                }
            }

            // ── P0-1 round-trip parity: restore additional Trestle-search ──
            // inputs that previously dropped on save. Each block locates
            // the active input ID per tab/mode (mirrors search-engine.js
            // collectSearchCriteria input ID resolution exactly).

            // Agent / office filters live in the advanced form: show it so the restored filter is visible and applied.
            if (criteria.agent_office && typeof toggleSearchMode === 'function') toggleSearchMode('advanced');

            // Detect advanced mode for ID prefix selection
            var _isAdv = (function () {
                var advMode = document.getElementById('searchAdvancedMode');
                return advMode && advMode.style.display !== 'none' && !advMode.classList.contains('hidden');
            })();

            // Keyword (PublicRemarks contains) — each basic form has its own box
            if (criteria.keyword) {
                var kwEl = document.getElementById(_isAdv ? 'adv-keyword' : _quickPrefix + 'KeywordSearch');
                if (kwEl) kwEl.value = criteria.keyword;
            }

            // Management Company (ListOfficeName contains)
            if (criteria.management_company) {
                var mgmtEl = document.getElementById(_isAdv ? 'adv-management' : _quickPrefix + 'ManagementCompany');
                if (mgmtEl) mgmtEl.value = criteria.management_company;
            }

            // Agent / office pickers
            if (criteria.agent_office && window.AgentOfficeSearch) window.AgentOfficeSearch.setState(criteria.agent_office);

            // Unit number (mirrors collectSearchCriteria adv vs basic)
            // Unit number (basic forms only; advanced search has no unit box)
            if (criteria.unit) {
                var unitEl = document.getElementById(_quickPrefix + 'QuickUnit');
                if (unitEl) unitEl.value = criteria.unit;
            }

            // Contract date — independent of date_from/to. Stored as
            // ISO YYYY-MM-DD; the date-range-picker stores MM/DD/YYYY.
            if (criteria.contract_date_from) {
                var cdpPrefix = tab === 'rent' ? 'rental' : 'sale';
                var cdpName = cdpPrefix + (cdpPrefix === 'rental' ? 'LeaseSigned' : 'ContractSigned');
                _setDrpDates(cdpName, criteria.contract_date_from, criteria.contract_date_to);
            }

            // PropertySubType — checkboxes (csv string saved). Mirror the
            // collectSearchCriteria pattern: scan basic OR advanced mode
            // depending on which is visible.
            if (criteria.property_sub_type) {
                var pstValues = String(criteria.property_sub_type).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
                var pstScope = _isAdv ? document.getElementById('searchAdvancedMode') : document.getElementById(_basicFormId);
                if (pstScope && pstValues.length > 0) {
                    pstScope.querySelectorAll('input[data-field="PropertySubType"]').forEach(function(cb) { cb.checked = false; });
                    pstValues.forEach(function(v) {
                        var cb = pstScope.querySelector('input[data-field="PropertySubType"][data-value="' + v + '"]');
                        if (cb && !cb.disabled) cb.checked = true;
                        else unresolved.push('Property sub-type ' + v + (cb ? ' (box disabled)' : ' (no box in this form)'));
                    });
                }
            }

            // SponsorUnit — independent param (Bug A11 split). Restored
            // by toggling the SponsorUnit/Yes checkbox if it exists. The
            // control is disabled while the search cannot know the flag
            // (init-disable-dead-controls.js), and a disabled control is
            // never ticked, as for the checkbox filters below.
            if (criteria.sponsor_unit === 'true' || criteria.sponsor_unit === true) {
                var spScope = _isAdv ? document.getElementById('searchAdvancedMode') : document.getElementById(_basicFormId);
                var spCb = spScope ? (spScope.querySelector('input[data-field="SponsorUnit"][data-value="true"]') ||
                                      spScope.querySelector('input[data-field="SponsorUnit"][data-value="Yes"]')) : null;
                if (spCb && !spCb.disabled) spCb.checked = true;
                else unresolved.push('Sponsor unit' + (spCb ? ' (box disabled)' : ' (no box in this form)'));
            }

            // checkboxFilters — the whitelisted Cooling/Garage/View/
            // BuildingFeatures/LaundryFeatures/SecurityFeatures/PoolFeatures/
            // AccessibilityFeatures/ExteriorFeatures/PetsAllowedYN/etc.
            // Stored as JSON string. For each (field, [values]) pair, find
            // and check the matching data-field/data-value checkbox.
            if (criteria.checkbox_filters) {
                try {
                    var cbFilters = typeof criteria.checkbox_filters === 'string'
                        ? JSON.parse(criteria.checkbox_filters)
                        : criteria.checkbox_filters;
                    var cbScope = _isAdv ? document.getElementById('searchAdvancedMode') : document.getElementById(_basicFormId);
                    if (cbScope && cbFilters && typeof cbFilters === 'object') {
                        Object.keys(cbFilters).forEach(function(rawField) {
                            var values = cbFilters[rawField];
                            if (!Array.isArray(values)) return;
                            // searches saved before the exposure boxes moved to Exposures name DirectionFaces
                            var field = rawField === 'DirectionFaces' ? 'Exposures' : rawField;
                            // First clear existing checks for this field
                            cbScope.querySelectorAll('input[data-field="' + field + '"]').forEach(function(cb) { cb.checked = false; });
                            values.forEach(function(v) {
                                var cb = cbScope.querySelector('input[data-field="' + field + '"][data-value="' + String(_legacyCriterionValue(field, v)).replace(/"/g, '\\"') + '"]');
                                if (cb && !cb.disabled) cb.checked = true;
                                else unresolved.push(field + ' ' + v + (cb ? ' (box disabled)' : ' (no box in this form)'));
                            });
                        });
                    } else if (!cbScope) {
                        unresolved.push('Facets (no form to restore them into)');
                    }
                } catch (e) {
                    // Malformed stored JSON: say so instead of dropping the facets.
                    unresolved.push('Facets (stored value unreadable)');
                }
            }

            // checkboxGroups — "match any ticked" facets (New Development OR Sponsor Unit): tick the
            // group's boxes and put the box in "any" mode so the same OR group is sent again.
            if (criteria.checkbox_groups) {
                try {
                    var cbGroups = typeof criteria.checkbox_groups === 'string'
                        ? JSON.parse(criteria.checkbox_groups)
                        : criteria.checkbox_groups;
                    var grScope = _isAdv ? document.getElementById('searchAdvancedMode') : document.getElementById(_basicFormId);
                    if (grScope && cbGroups && typeof cbGroups === 'object') {
                        Object.keys(cbGroups).forEach(function(group) {
                            var members = cbGroups[group];
                            if (!members || typeof members !== 'object') return;
                            var box = grScope.querySelector('[data-facet-group="' + group + '"]');
                            Object.keys(members).forEach(function(field) {
                                [].concat(members[field]).forEach(function(v) {
                                    var cb = (box || grScope).querySelector('input[data-field="' + field + '"][data-value="' + String(v).replace(/"/g, '\\"') + '"]');
                                    if (cb && !cb.disabled) { cb.checked = true; if (!box) cb.setAttribute('data-group', group); }
                                    else unresolved.push(field + ' ' + v + (cb ? ' (box disabled)' : ' (no box in this form)'));
                                });
                            });
                            if (box && typeof setFacetMatch === 'function') setFacetMatch(box, 'any');
                        });
                    } else if (!grScope) {
                        unresolved.push('Facet groups (no form to restore them into)');
                    }
                } catch (e) {
                    unresolved.push('Facet groups (stored value unreadable)');
                }
            }

            // Min / max boxes by live field (monthlies, taxes, $/sqft …) — [data-field][data-range] selects or inputs
            if (criteria.field_ranges) {
                try {
                    var ranges = typeof criteria.field_ranges === 'string' ? JSON.parse(criteria.field_ranges) : criteria.field_ranges;
                    var rgScope = _isAdv ? document.getElementById('searchAdvancedMode') : document.getElementById(_basicFormId);
                    Object.keys(ranges || {}).forEach(function (field) {
                        var bounds = ranges[field] || {};
                        Object.keys(bounds).forEach(function (bound) {
                            var el = rgScope ? rgScope.querySelector('[data-field="' + field + '"][data-range="' + bound + '"]') : null;
                            var label = field + ' ' + bound + ' ' + bounds[bound];
                            if (!el || el.disabled) { unresolved.push(label + (el ? ' (box disabled)' : ' (no box in this form)')); return; }
                            if (el.tagName === 'SELECT') {
                                _pickSelectOption(el, bounds[bound]);
                                if (el._csdSync) el._csdSync();
                                if (String(el.value) !== String(bounds[bound])) unresolved.push(label + ' (not a preset of this box; nearest ' + el.value + ')');
                            } else {
                                el.value = bounds[bound];
                            }
                        });
                    });
                } catch (e) {
                    unresolved.push('Ranges (stored value unreadable)');
                }
            }
            // Free-text boxes by live field — [data-field][data-text] inputs
            if (criteria.field_text) {
                try {
                    var texts = typeof criteria.field_text === 'string' ? JSON.parse(criteria.field_text) : criteria.field_text;
                    var txScope = _isAdv ? document.getElementById('searchAdvancedMode') : document.getElementById(_basicFormId);
                    Object.keys(texts || {}).forEach(function (field) {
                        var el = txScope ? txScope.querySelector('input[data-field="' + field + '"][data-text]') : null;
                        if (!el || el.disabled) { unresolved.push(field + ' "' + texts[field] + '"' + (el ? ' (box disabled)' : ' (no box in this form)')); return; }
                        el.value = texts[field];
                    });
                } catch (e) {
                    unresolved.push('Text criteria (stored value unreadable)');
                }
            }
            return unresolved;
        }

        // ── Saved-search reconciliation ──
        // The form is the one source of a query (form → collectSearchCriteria → request). After a
        // restore, what the form collects must equal the saved record; any difference is reported to
        // the agent and the search is not run — a reload must never be broader or narrower than what
        // was saved (found 2026-10-27: a reload from the results header sent no status at all).
        var _CRITERIA_LABELS = {
            status: 'Status', min_price: 'Min price', max_price: 'Max price', min_beds: 'Min beds', max_beds: 'Max beds',
            min_baths: 'Min baths', max_baths: 'Max baths', min_sqft: 'Min sqft', max_sqft: 'Max sqft', min_rooms: 'Min rooms', max_rooms: 'Max rooms',
            neighborhoods: 'Neighborhoods', borough: 'Borough', zip: 'Zip', property_type: 'Ownership', ownership: 'Ownership', address: 'Address', listing_id: 'Listing ID',
            min_year: 'Min year', max_year: 'Max year', min_floors: 'Min floors', max_floors: 'Max floors', min_units: 'Min units', max_units: 'Max units',
            building_name: 'Building', date_from: 'Date from', date_to: 'Date to', date_type: 'Date type', close_date_from: 'Closed from', close_date_to: 'Closed to',
            keyword: 'Keyword', management_company: 'Management / office', property_sub_type: 'Property sub-type', unit: 'Unit',
            contract_date_from: 'Contract from', contract_date_to: 'Contract to', sponsor_unit: 'Sponsor unit', checkbox_filters: 'Facets', checkbox_groups: 'Facet groups',
            field_ranges: 'Ranges', field_text: 'Text criteria', listing_type: 'Listing type', _search_tab: 'Tab', _search_mode: 'Form',
            financing_min: 'Min financing %', open_house_from: 'Open house from', open_house_to: 'Open house to'
        };
        // Canonical text for a saved or collected value: numbers as numbers, arrays sorted, JSON strings parsed.
        function _canonCriterion(v) {
            if (v == null || v === '') return '';
            if (typeof v === 'string') {
                var t = v.trim();
                if (/^[\[{]/.test(t)) { try { return _canonCriterion(JSON.parse(t)); } catch (e) { /* plain text */ } }
                return t !== '' && !isNaN(Number(t)) ? String(Number(t)) : t.toLowerCase();
            }
            if (typeof v === 'number' || typeof v === 'boolean') return String(v);
            if (Array.isArray(v)) {
                var items = v.map(_canonCriterion).filter(function (x) { return x !== ''; }).sort();
                return items.length ? JSON.stringify(items.filter(function (x, i) { return items.indexOf(x) === i; })) : '';
            }
            var pairs = Object.keys(v).sort().map(function (k) { return [k, _canonCriterion(v[k])]; }).filter(function (p) { return p[1] !== ''; });
            return pairs.length ? JSON.stringify(pairs) : '';
        }
        function _describeCriterion(v) {
            if (v == null || v === '') return 'none';
            if (Array.isArray(v)) return v.join(', ');
            if (typeof v === 'string' && /^[\[{]/.test(v.trim())) { try { return _describeCriterion(JSON.parse(v)); } catch (e) { return v; } }
            if (typeof v === 'object') return Object.keys(v).map(function (k) { return k + ' ' + _describeCriterion(v[k]); }).join('; ');
            return String(v);
        }
        /** Saved record vs what the restored form collects now → readable mismatches ([] = exact). */
        function _reconcileSavedCriteria(saved) {
            var restored = _criteriaToApiFormat(typeof collectSearchCriteria === 'function' ? collectSearchCriteria() : null);
            var diffs = [], keys = {};
            Object.keys(saved || {}).concat(Object.keys(restored)).forEach(function (k) { keys[k] = 1; });
            Object.keys(keys).forEach(function (key) {
                // Tab, form and listing type are set by the restore itself (older records carry no _search_mode)
                if (key === 'listing_type' || key === '_search_tab' || key === '_search_mode') return;
                var a = _canonCriterion(saved ? saved[key] : ''), b = _canonCriterion(restored[key]);
                if (a === b) return; // same value, or nothing on either side
                // A value the record never had (e.g. Clear's default Active) narrows the search as much as a lost one broadens it
                diffs.push((_CRITERIA_LABELS[key] || key) + ': saved ' + _describeCriterion(saved ? saved[key] : null) + ', form now ' + _describeCriterion(restored[key]));
            });
            return diffs;
        }
        // ── /reconciliation ──

        /** Helper: set a <select> value, trying exact match then closest */
        // Saved searches written before the live-Cotality cutover stored values Cotality does not have; map them to the live members.
        var _LEGACY_DIRECTION_FACES = { N: 'North', S: 'South', E: 'East', W: 'West', NE: 'Northeast', NW: 'Northwest', SE: 'Southeast', SW: 'Southwest' };
        function _legacyCriterionValue(field, v) {
            if (field === 'ListingAgreement' && v === 'CoExclusive') return 'CoExclusiveAgency';
            if ((field === 'DirectionFaces' || field === 'Exposures') && _LEGACY_DIRECTION_FACES[v]) return _LEGACY_DIRECTION_FACES[v];
            return v;
        }

        function _setSelectValue(elementId, value) {
            if (value == null) return;
            var el = document.getElementById(elementId);
            if (!el) return;
            _pickSelectOption(el, value);
            if (el._csdSync) el._csdSync(); // the custom dropdown box shows the restored option (init-ui.js)
        }
        function _pickSelectOption(el, value) {
            // Try exact match
            for (var i = 0; i < el.options.length; i++) {
                if (el.options[i].value == value) {
                    el.selectedIndex = i;
                    return;
                }
            }
            // Not a preset: a box with a "Custom" option restores the amount as typed (init-ui.js),
            // instead of rounding a saved $1,234,567 to the nearest preset.
            if (!isNaN(Number(value)) && el._csdSetCustom && el._csdSetCustom(value)) return;
            // Try closest match for numeric selects
            var numVal = Number(value);
            if (!isNaN(numVal)) {
                var best = 0, bestDiff = Infinity;
                for (var j = 0; j < el.options.length; j++) {
                    var optVal = Number(el.options[j].value);
                    if (!isNaN(optVal) && Math.abs(optVal - numVal) < bestDiff) {
                        bestDiff = Math.abs(optVal - numVal);
                        best = j;
                    }
                }
                if (bestDiff < Infinity) el.selectedIndex = best;
            }
        }

        /** Helper: programmatically set a date range picker's dates */
        function _setDrpDates(drpName, fromStr, toStr) {
            var wrapper = document.querySelector('[data-drp="' + drpName + '"]');
            if (!wrapper) return;

            // Convert ISO date (YYYY-MM-DD) or MM/DD/YYYY to MM/DD/YYYY
            function toMDY(str) {
                if (!str) return null;
                // Already MM/DD/YYYY?
                if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
                // ISO YYYY-MM-DD
                var parts = str.split('-');
                if (parts.length === 3) return parts[1] + '/' + parts[2] + '/' + parts[0];
                return null;
            }

            var fromMDY = toMDY(fromStr);
            var toMDY2 = toMDY(toStr);

            if (fromMDY) {
                wrapper.setAttribute('data-from', fromMDY);
                if (toMDY2) wrapper.setAttribute('data-to', toMDY2);

                // Update the visible trigger text
                var trigger = wrapper.querySelector('.drp-trigger');
                if (trigger) {
                    var textEl = trigger.querySelector('.drp-text');
                    var clearBtn = trigger.querySelector('.drp-clear');
                    if (textEl) {
                        textEl.textContent = fromMDY + (toMDY2 ? ' - ' + toMDY2 : '');
                        textEl.classList.add('has-value');
                    }
                    if (clearBtn) clearBtn.style.display = '';
                }
            }
        }

        function closeSaveSearchModal() {
            document.getElementById('saveSearchModal').classList.add('hidden');
        }

        // ESC key to close save-search modal
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                var sm = document.getElementById('saveSearchModal');
                if (sm && !sm.classList.contains('hidden')) { closeSaveSearchModal(); return; }
            }
        });

        function saveCurrentSearch() {
            var name = document.getElementById('savedSearchName').value;
            var notes = document.getElementById('savedSearchNotes').value;
            var clientId = document.getElementById('savedSearchClientId').value;
            var alertFreq = document.getElementById('savedSearchAlertFreq').value;

            if (!name) {
                showToast('Please enter a search name.', 'warning');
                return;
            }

            if (typeof MallanAPI === 'undefined') {
                showToast('API not available. Please refresh.', 'error');
                return;
            }

            var criteria = _criteriaToApiFormat(activeSearchCriteria);

            // P0-3 frontend gate (defense in depth — backend will also
            // refuse). When alertFreq is requested AND the criteria
            // contains projection-unsupported keys, refuse here rather
            // than letting the backend surface the 422.
            if (alertFreq) {
                var gate = _evaluateAlertGate(criteria);
                if (!gate.ok) {
                    showToast(
                        'Cannot enable alerts for this search — alert engine does not support: ' +
                        gate.unsupported.join(', ') +
                        '. Save without alerts, or remove those criteria first.',
                        'error'
                    );
                    return;
                }
            }

            var payload = {
                name: name,
                criteria: criteria,
                lead_id: clientId || null,
                alert_frequency: alertFreq || null,
                alert_enabled: !!alertFreq,
            };

            // Saving under the name of one of the agent's existing searches updates that search instead of
            // creating a duplicate (found 2026-10-26: two identical names, no way to change a saved search).
            var existing = (searchResultsState.savedSearches || []).find(function (s) { return String(s.name || '').trim().toLowerCase() === name.trim().toLowerCase(); });
            var request = existing ? MallanAPI.savedSearches.update(existing.id, payload) : MallanAPI.savedSearches.create(payload);
            request.then(function(result) {
                document.getElementById('savedSearchName').value = '';
                document.getElementById('savedSearchNotes').value = '';
                document.getElementById('savedSearchClientId').selectedIndex = 0;
                document.getElementById('savedSearchAlertFreq').selectedIndex = 0;
                closeSaveSearchModal();
                populateSavedSearchList();

                var msg = existing ? 'Search "' + name + '" updated.' : 'Search "' + name + '" saved!';
                if (clientId) msg += ' Assigned to client.';
                if (alertFreq) msg += ' ' + alertFreq.charAt(0).toUpperCase() + alertFreq.slice(1) + ' alerts enabled.';
                showToast(msg, 'success');
            }).catch(function(err) {
                showToast('Failed to save search: ' + err.message, 'error');
            });
        }

        function loadSavedSearch(searchId) {
            document.getElementById('savedSearchDropdown').classList.add('hidden');

            if (typeof MallanAPI === 'undefined') {
                showToast('API not available', 'error');
                return;
            }

            MallanAPI.savedSearches.get(searchId).then(function(search) {
                if (!search || !search.criteria) {
                    showToast('Saved search has no criteria', 'warning');
                    return;
                }

                // 1. The record is the query: validate and normalise it into the criteria the search runs on.
                var parsed = _criteriaFromApiFormat(search.criteria);

                // 2. Show the same criteria in the form (clear first), so "Full Search" edits start from the record.
                if (typeof clearSearchForm === 'function') clearSearchForm();
                var unresolved = _criteriaToFormFields(search.criteria) || [];

                // 3. The form must display exactly the record: a control that could not take a value, or a
                //    form that now collects something else, is reported by name and the search is not run —
                //    results the agent could not see or edit faithfully are a different search.
                var diffs = parsed.unsupported.concat(unresolved, _reconcileSavedCriteria(search.criteria));
                if (diffs.length) {
                    showToast('"' + search.name + '" was not restored exactly — ' + diffs.join('; ') + '. Review the form, then search.', 'warning');
                    if (typeof backToSearch === 'function') backToSearch();
                    return;
                }
                showToast('Loaded: ' + search.name, 'success');
                // 4. Run the record itself — not a re-read of the (hidden) controls, and no timer.
                if (typeof executeSearchCriteria === 'function') executeSearchCriteria(parsed.criteria);
                else if (typeof performSearch === 'function') performSearch();
            }).catch(function(err) {
                showToast('Failed to load search: ' + err.message, 'error');
            });
        }

        function deleteSavedSearch(searchId) {
            if (!confirm('Delete this saved search?')) return;

            if (typeof MallanAPI === 'undefined') {
                showToast('API not available', 'error');
                return;
            }

            MallanAPI.savedSearches.delete(searchId).then(function() {
                populateSavedSearchList();
                showToast('Search deleted', 'success');
            }).catch(function(err) {
                showToast('Failed to delete: ' + err.message, 'error');
            });
        }

        function reviseSearch() {
            backToSearch();
        }

