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
                    var clientBadge = search.lead_id
                        ? '<span class="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-semibold rounded-full"><i class="fas fa-user text-[7px]"></i></span>'
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
            // Reserved (skipped, treated as supported)
            _search_tab: 1
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
                property_type: c.ownership && c.ownership.length > 0 ? c.ownership : undefined,
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
            };
            return out;
        }

        /** Restore API criteria → form fields and re-run search */
        function _criteriaToFormFields(criteria) {
            if (!criteria) return;

            // Set search tab
            var tab = criteria._search_tab || (criteria.listing_type === 'rental' ? 'rent' : 'sale');
            if (typeof toggleSearchTab === 'function') {
                toggleSearchTab(tab);
            } else {
                currentSearchTab = tab;
            }

            // Determine element ID prefix based on tab
            var prefix = tab === 'rent' ? 'rental' : 'sale';

            // Price
            _setSelectValue(prefix === 'rental' ? 'rentalMinRent' : 'saleMinPrice', criteria.min_price);
            _setSelectValue(prefix === 'rental' ? 'rentalMaxRent' : 'saleMaxPrice', criteria.max_price);

            // Beds
            _setSelectValue(prefix + 'MinBeds', criteria.min_beds);
            _setSelectValue(prefix + 'MaxBeds', criteria.max_beds);

            // Baths
            _setSelectValue(prefix + 'MinBaths', criteria.min_baths);
            _setSelectValue(prefix + 'MaxBaths', criteria.max_baths);

            // Rooms
            _setSelectValue(prefix + 'MinRooms', criteria.min_rooms);
            _setSelectValue(prefix + 'MaxRooms', criteria.max_rooms);

            // Sqft
            _setSelectValue(prefix + 'MinSqft', criteria.min_sqft);
            _setSelectValue(prefix + 'MaxSqft', criteria.max_sqft);

            // Address
            var addrId = tab === 'rent' ? 'rentalSearchAddress' : tab === 'building' ? 'buildingSearchAddress' : 'saleSearchAddress';
            var addrEl = document.getElementById(addrId);
            if (addrEl && criteria.address) addrEl.value = criteria.address;

            // Zip
            var zipId = tab === 'rent' ? 'rentalQuickZip' : tab === 'building' ? 'buildingQuickZip' : 'saleQuickZip';
            var zipEl = document.getElementById(zipId);
            if (zipEl && criteria.zip) zipEl.value = criteria.zip;

            // RLS ID
            var rlsId = tab === 'rent' ? 'rentalQuickRls' : tab === 'building' ? 'buildingQuickRls' : 'saleQuickRls';
            var rlsEl = document.getElementById(rlsId);
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

            // Restore status checkboxes
            if (criteria.status && Array.isArray(criteria.status) && criteria.status.length > 0) {
                // Map saved statuses back to checkbox data-value attributes
                // THE THIRD TRANSLATION TABLE, REMOVED 2026-08-22.
                //
                // Criteria are now persisted as EXACT Cotality StandardStatus
                // members, which is exactly what the checkbox data-value
                // attributes already held - so restoring is a lookup, not a
                // translation. This map existed only because the JS layer had
                // invented an uppercase vocabulary in between.
                //
                // The legacy spellings a saved search written BEFORE that may
                // still contain are migrated here, at the boundary, on the way
                // in. They are never persisted again and never sent to Cotality.
                var legacyStatusAliases = {
                    'ACTIVE': 'Active', 'COMING_SOON': 'ComingSoon', 'PENDING': 'Pending',
                    'UNDER_CONTRACT': 'ActiveUnderContract', 'CONTRACT': 'ActiveUnderContract',
                    'CLOSED': 'Closed', 'WITHDRAWN': 'Withdrawn', 'CANCELED': 'Canceled',
                    'CANCELLED': 'Canceled', 'EXPIRED': 'Expired', 'HOLD': 'Hold'
                };
                // First uncheck all status checkboxes in the active form
                var activeForm = document.getElementById(tab === 'rent' ? 'searchBasicModeRental' : 'searchBasicMode');
                if (activeForm) {
                    activeForm.querySelectorAll('[data-field="MlsStatus"]').forEach(function(cb) { cb.checked = false; });
                }
                // Then check the saved ones
                criteria.status.forEach(function(s) {
                    // An exact member passes straight through; only a legacy spelling is mapped.
                    var resoVal = legacyStatusAliases[s] || s;
                    var cb = activeForm ? activeForm.querySelector('[data-field="MlsStatus"][data-value="' + resoVal + '"]') : null;
                    if (cb) cb.checked = true;
                });
            }

            // Restore ownership checkboxes
            if (criteria.property_type && Array.isArray(criteria.property_type) && criteria.property_type.length > 0) {
                var ownerForm = document.getElementById(tab === 'rent' ? 'searchBasicModeRental' : 'searchBasicMode');
                if (ownerForm) {
                    ownerForm.querySelectorAll('[data-field="CommonInterest"]').forEach(function(cb) { cb.checked = false; });
                    criteria.property_type.forEach(function(pt) {
                        var cb = ownerForm.querySelector('[data-field="CommonInterest"][data-value="' + pt + '"]');
                        if (!cb) cb = ownerForm.querySelector('[data-field="CommonInterest"][value="' + pt + '"]');
                        if (cb) cb.checked = true;
                    });
                }
            }

            // ── P0-1 round-trip parity: restore additional Trestle-search ──
            // inputs that previously dropped on save. Each block locates
            // the active input ID per tab/mode (mirrors search-engine.js
            // collectSearchCriteria input ID resolution exactly).

            // Detect advanced mode for ID prefix selection
            var _isAdv = (function () {
                var advMode = document.getElementById('searchAdvancedMode');
                return advMode && advMode.style.display !== 'none' && !advMode.classList.contains('hidden');
            })();

            // Keyword (PublicRemarks contains)
            if (criteria.keyword) {
                var kwEl = document.getElementById(_isAdv ? 'adv-keyword' : 'searchKeyword');
                if (kwEl) kwEl.value = criteria.keyword;
            }

            // Management Company (ListOfficeName contains)
            if (criteria.management_company) {
                var mgmtEl = document.getElementById(_isAdv ? 'adv-management' : 'searchManagementCompany');
                if (mgmtEl) mgmtEl.value = criteria.management_company;
            }

            // Unit number (mirrors collectSearchCriteria adv vs basic)
            if (criteria.unit) {
                var unitInputId = _isAdv ? 'searchQuickUnit' : 'searchQuickUnit';
                var unitEl = document.getElementById(unitInputId);
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
                var pstScope = _isAdv ? document.getElementById('searchAdvancedMode') : document.getElementById('searchBasicMode');
                if (pstScope && pstValues.length > 0) {
                    pstScope.querySelectorAll('input[data-field="PropertySubType"]').forEach(function(cb) { cb.checked = false; });
                    pstValues.forEach(function(v) {
                        var cb = pstScope.querySelector('input[data-field="PropertySubType"][data-value="' + v + '"]');
                        if (cb) cb.checked = true;
                    });
                }
            }

            // SponsorUnit — independent param (Bug A11 split). Restored
            // by toggling the SponsorUnit/Yes checkbox if it exists.
            if (criteria.sponsor_unit === 'true' || criteria.sponsor_unit === true) {
                var spScope = _isAdv ? document.getElementById('searchAdvancedMode') : document.getElementById('searchBasicMode');
                if (spScope) {
                    var spCb = spScope.querySelector('input[data-field="SponsorUnit"][data-value="true"]') ||
                               spScope.querySelector('input[data-field="SponsorUnit"][data-value="Yes"]');
                    if (spCb) spCb.checked = true;
                }
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
                    var cbScope = _isAdv ? document.getElementById('searchAdvancedMode') : document.getElementById('searchBasicMode');
                    if (cbScope && cbFilters && typeof cbFilters === 'object') {
                        Object.keys(cbFilters).forEach(function(field) {
                            var values = cbFilters[field];
                            if (!Array.isArray(values)) return;
                            // First clear existing checks for this field
                            cbScope.querySelectorAll('input[data-field="' + field + '"]').forEach(function(cb) { cb.checked = false; });
                            values.forEach(function(v) {
                                var cb = cbScope.querySelector('input[data-field="' + field + '"][data-value="' + String(v).replace(/"/g, '\\"') + '"]');
                                if (cb && !cb.disabled) cb.checked = true;
                            });
                        });
                    }
                } catch (e) {
                    // Malformed JSON — silently skip restore. Saved
                    // search payloads are agent-trusted but defensive
                    // here against any future migration drift.
                }
            }
        }

        /** Helper: set a <select> value, trying exact match then closest */
        function _setSelectValue(elementId, value) {
            if (value == null) return;
            var el = document.getElementById(elementId);
            if (!el) return;
            // Try exact match
            for (var i = 0; i < el.options.length; i++) {
                if (el.options[i].value == value) {
                    el.selectedIndex = i;
                    return;
                }
            }
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

            MallanAPI.savedSearches.create(payload).then(function(result) {
                document.getElementById('savedSearchName').value = '';
                document.getElementById('savedSearchNotes').value = '';
                document.getElementById('savedSearchClientId').selectedIndex = 0;
                document.getElementById('savedSearchAlertFreq').selectedIndex = 0;
                closeSaveSearchModal();
                populateSavedSearchList();

                var msg = 'Search "' + name + '" saved!';
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

                // Clear current form
                if (typeof clearSearchForm === 'function') clearSearchForm();

                // Restore form fields from saved criteria
                _criteriaToFormFields(search.criteria);

                showToast('Loaded: ' + search.name, 'success');

                // Re-run the search with restored criteria
                setTimeout(function() {
                    if (typeof performSearch === 'function') performSearch();
                }, 100);
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

