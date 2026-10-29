        // Active search criteria — shared across search-engine, refine panel, and reports
        var activeSearchCriteria = null;

        // ── Neighborhood alias map: canonical polygon name → RLS variants ──
        // Alias values can be: string (single polygon), array (multi-polygon), or null (no polygon)
        var _neighborhoodAliases = null;
        var _aliasReverseMap = {};       // canonical → [variant1, variant2, ...]

        (function loadNeighborhoodAliases() {
            var base = window.location.pathname.replace(/\/[^/]*$/, '');
            var url = (base.endsWith('/crm') ? '/geo/' : '../geo/') + 'neighborhood-aliases.json';
            fetch(url)
                .then(function(r) { return r.ok ? r.json() : null; })
                .then(function(data) {
                    if (data && data.aliases) {
                        _neighborhoodAliases = data.aliases;
                        _aliasReverseMap = {};
                        Object.keys(data.aliases).forEach(function(variant) {
                            var val = data.aliases[variant];
                            if (!val) return; // null = distinct, no polygon
                            // val can be string or array
                            var canonicals = Array.isArray(val) ? val : [val];
                            canonicals.forEach(function(canonical) {
                                if (!_aliasReverseMap[canonical]) _aliasReverseMap[canonical] = [];
                                _aliasReverseMap[canonical].push(variant);
                            });
                        });
                    }
                })
                .catch(function() { /* non-fatal */ });
        })();

        /**
         * Expand canonical names to include all RLS SubdivisionName variants.
         * Used by the search query builder so the filter matches any listing
         * regardless of which variant was used in the RLS data.
         */
        // DEPRECATED: Neighborhood variant expansion handled server-side. Kept for potential future use.
        function expandCanonicalToVariants(canonicalNames) {
            if (!_aliasReverseMap || !canonicalNames) return canonicalNames;
            var expanded = [];
            canonicalNames.forEach(function(name) {
                expanded.push(name);
                if (_aliasReverseMap[name]) {
                    _aliasReverseMap[name].forEach(function(v) { expanded.push(v); });
                }
            });
            return expanded;
        }

        /**
         * openNeighborhoodMapForSearch() — bridge between map modal and search form.
         * Opens the map, receives selected neighborhoods, and populates
         * the active search form's neighborhood tags (does NOT auto-search).
         */
        window.openNeighborhoodMapForSearch = function() {
            if (typeof openNeighborhoodMap !== 'function') {
                showToast('Neighborhood map not loaded', 'error');
                return;
            }

            // Pre-populate the map with currently selected neighborhood tags
            if (typeof getSelectedNeighborhoods === 'function') {
                var tagsId = _resolveActiveNeighborhoodTagsId();
                var existing = getSelectedNeighborhoods(tagsId);
                if (existing.length > 0) {
                    if (typeof activeSearchCriteria === 'undefined' || !activeSearchCriteria) {
                        activeSearchCriteria = {};
                    }
                    activeSearchCriteria._neighborhoodCanonicals = existing;
                }
            }

            openNeighborhoodMap(function(result) {
                if (!result.selectedNeighborhoods || result.selectedNeighborhoods.length === 0) return;

                var canonicals = result.selectedNeighborhoods;

                // Determine which tags container is active based on current search mode/tab
                var tagsId = _resolveActiveNeighborhoodTagsId();

                // Add each selected neighborhood as a tag (skip duplicates)
                if (typeof selectNeighborhood === 'function') {
                    for (var i = 0; i < canonicals.length; i++) {
                        var name = canonicals[i];
                        // Find the borough for this neighborhood from the autocomplete data
                        var borough = _findBoroughForNeighborhood(name);
                        selectNeighborhood(name, borough, !borough, '', tagsId);
                    }
                }

                var label = canonicals.length === 1 ? canonicals[0] : canonicals.length + ' neighborhoods';
                if (typeof showToast === 'function') {
                    showToast(label + ' added — searching...', 'success');
                }

                // Auto-search immediately after neighborhood selection
                setTimeout(function() {
                    performSearch();
                    // Auto-open map if not already open
                    if (typeof isResultsMapOpen === 'function' && !isResultsMapOpen()) {
                        if (typeof toggleResultsMap === 'function') toggleResultsMap();
                    }
                }, 200);
            });
        };

        // Basic search is three separate forms — one per tab (Sales / Rentals / Buildings). Advanced
        // search is one form whose sale and rental sections toggleSearchTab shows per tab. Only the
        // current tab's basic form is shown and read; a hidden form's values are never applied.
        var BASIC_FORM_IDS = { sale: 'searchBasicMode', rent: 'searchBasicModeRental', building: 'searchBasicModeBuilding' };
        function activeBasicFormId() {
            var tab = (typeof currentSearchTab !== 'undefined' && currentSearchTab) || 'sale';
            return BASIC_FORM_IDS[tab] || BASIC_FORM_IDS.sale;
        }
        // Show the current tab's basic form (basic mode) or none of them (advanced mode).
        function _showBasicForms(basic) {
            var activeId = activeBasicFormId();
            Object.keys(BASIC_FORM_IDS).forEach(function (tab) {
                var el = document.getElementById(BASIC_FORM_IDS[tab]);
                if (el) el.style.display = basic && BASIC_FORM_IDS[tab] === activeId ? 'block' : 'none';
            });
        }

        /**
         * Resolve which neighborhood tags container is currently active.
         * Existing containers in this form: saleNeighborhoodTags,
         * rentalNeighborhoodTags, buildingNeighborhoodTags,
         * advancedNeighborhoodTags. Previous fallback ('searchNeighborhoodTags')
         * referenced an element that does not exist — neighborhood search
         * silently returned no results when the basic-search tab was active.
         */
        function _resolveActiveNeighborhoodTagsId() {
            var advMode = document.getElementById('searchAdvancedMode');
            if (advMode && advMode.style.display !== 'none' && !advMode.classList.contains('hidden')) {
                return 'advancedNeighborhoodTags';
            }
            // Basic search — pick the tag container for the active tab.
            var tab = (typeof currentSearchTab !== 'undefined' && currentSearchTab) || 'sale';
            if (tab === 'rent') return 'rentalNeighborhoodTags';
            if (tab === 'building') return 'buildingNeighborhoodTags';
            return 'saleNeighborhoodTags';
        }

        /**
         * Look up borough name for a neighborhood from the autocomplete's known data.
         */
        // Borough a neighborhood is filed under in live Cotality (neighborhood-autocomplete.js inventory).
        function _findBoroughForNeighborhood(name) {
            return typeof geoBoroughOf === 'function' ? geoBoroughOf(name) : '';
        }

        function normalizeAddress(str) {
            if (!str) return '';
            return str.toLowerCase()
                .replace(/\bE\b\.?/i, 'east')
                .replace(/\bW\b\.?/i, 'west')
                .replace(/\bN\b\.?/i, 'north')
                .replace(/\bS\b\.?/i, 'south')
                .replace(/\bSt\b\.?/i, 'street')
                .replace(/\bAve?\b\.?/i, 'avenue')
                .replace(/\bBlvd\b\.?/i, 'boulevard')
                .replace(/\bPl\b\.?/i, 'place')
                .replace(/\bPk\b\.?/i, 'park')
                .replace(/\bCPW\b/i, 'central park west')
                .replace(/\s+/g, ' ').trim();
        }

        // True only while performSearch() reads the form. collectSearchCriteria() also runs for the live
        // match-count probe on every keystroke; the typed-neighborhood check must not fire there (it
        // wiped "Upper E" out of the box while the agent was still typing — found 2026-10-27).
        var _explicitCollect = false;

        // The Search button: read the form, then run what it collected.
        function performSearch() {
            try {
                // Collect search criteria from the active form
                var collected;
                _explicitCollect = true;
                try { collected = collectSearchCriteria(); } finally { _explicitCollect = false; }
                var _c = collected || {};
                // A refused criterion (e.g. a misspelled neighborhood) already showed its message; the
                // search used to run anyway and bring back every sale in the city (found 2026-10-27).
                if (_c._refused) { activeSearchCriteria = _c; return; }
                var _problem = _searchCriteriaProblem(_c);
                if (_problem) { activeSearchCriteria = _c; showToast(_problem, 'warning'); return; }
                // "Custom" chosen in a box with nothing typed used to search without that bound. A box with a
                // typed amount carries it as the select's value (init-ui.js); 'custom' alone means empty.
                // Only boxes the collector reads count: the calculators in the advanced form (down payment,
                // vacancy …) also offer "Custom" and are not criteria (found 2026-10-27, G4-C1: the guard
                // refused every advanced search while the down-payment box sat on Custom).
                // Every select of every search form: a descendant combinator appended to a comma list reaches only the last form
                // (the three basic forms were never checked; found in the visible browser, 2026-10-28).
                var _formSelects = document.querySelectorAll(SEARCH_FORM_SELECTOR.split(',').map(function (f) { return f.trim() + ' select'; }).join(', '));
                var _customEmptySel = Array.prototype.filter.call(_formSelects, function (sel) {
                    var isCriterion = sel.hasAttribute('data-field') || /^(sale|rental|building|adv)[A-Za-z-]*(Min|Max|min|max)/.test(sel.id || '');
                    return isCriterion && sel.value === 'custom' && _isActiveControl(sel);
                })[0];
                if (_customEmptySel) {
                    activeSearchCriteria = _c;
                    var _customLabel = _customEmptySel.options[0] ? _customEmptySel.options[0].text : '';
                    showToast('Type the custom ' + (/^(min|max)\b/i.test(_customLabel) ? _customLabel.toLowerCase() : 'value') + ' in its box, or pick a preset.', 'warning');
                    return;
                }
                executeSearchCriteria(collected);
            } catch (err) {
                showToast('Search error: ' + err.message + '. Check browser console (F12) for details.', 'error');
            }
        }

        // Contradictory input used to run against Cotality and show a silent "0 Results"
        // (found 2026-10-26): say what is wrong instead of searching. Returns the message, or null.
        function _searchCriteriaProblem(c) {
            if (c.priceMin && c.priceMax && Number(c.priceMin) > Number(c.priceMax)) return 'Min price is above max price — fix the range before searching.';
            if (c.zip && !/^\d{5}(\s*,\s*\d{5})*$/.test(String(c.zip).trim())) return 'Zip must be 5 digits (comma-separated for several).';
            return null;
        }

        // Run one search from a criteria object. Search criteria are business data; the form is an
        // editor for them. A saved search executes its own record through this entry
        // (saved-searches.js loadSavedSearch) and is never rebuilt from the restored controls — a
        // reload from the results header, where the form is hidden, used to re-read the controls and
        // send no status at all (found 2026-10-27).
        function executeSearchCriteria(criteria) {
            try {
                activeSearchCriteria = criteria || {};
                var _c = activeSearchCriteria;
                if (_c._refused) return;
                var _problem = _searchCriteriaProblem(_c);
                if (_problem) { showToast(_problem, 'warning'); return; }

                if (typeof searchResultsState === 'undefined' || !searchResultsState) {
                    showToast('Error: Search state not initialized. Please refresh the page.', 'error');
                    return;
                }

                // Results come only from live Cotality through /api/idx/search. No
                // local pre-render: filtering the ~200 preloaded listings in the
                // browser showed a partial, sometimes false result before the
                // server answered.
                var localResults = [];
                searchResultsState.filteredListings = localResults;
                searchResultsState.serverTotal = null;
                searchResultsState.removedCount = 0;
                searchResultsState.currentPage = 1;
                _showSearchResults();
                _setResultsCountText('Searching Cotality…');

                // Always also query the server for fresh results
                if (typeof MallanAPI !== 'undefined') {
                    _serverSearch(activeSearchCriteria);
                }
            } catch (err) {
                showToast('Search error: ' + err.message + '. Check browser console (F12) for details.', 'error');
            }
        }

        function _setResultsCountText(text) {
            document.querySelectorAll('#resultsCount, #resultsCount2').forEach(function(el) { el.textContent = text; });
        }

        // The server refuses criteria Cotality cannot serve (HTTP 422) and names each one.
        function _showRefusedCriteria(refused) {
            var lines = (refused || []).map(function(r) { return '• ' + (r.field || r.criterion) + ': ' + r.reason; });
            showToast('Not searched — these criteria are not available in Cotality:\n' + lines.join('\n') + '\nClear them and search again.', 'error');
            _setResultsCountText('Search not run');
        }

        // Criteria Mallan applies after retrieval scan a capped set of Cotality matches; say so when it is incomplete.
        function _showLocalScanNotice(result) {
            // Linked resources (open houses, agents, offices …): more matching rows than one search reads.
            var partial = ((result && result.joins) || []).filter(function (j) { return !j.complete; });
            if (partial.length) {
                showToast(partial.map(function (j) { return j.resource; }).join(", ") + ": more Cotality rows match than one search reads (" +
                    partial.map(function (j) { return j.matched.toLocaleString(); }).join(", ") + " found so far). Narrow the criteria to check every match.", "warning");
            }
            if (!result || !result.localScan || result.localScan.complete) return;
            showToast('Applied by Mallan to the first ' + result.localScan.checked.toLocaleString() + ' (in the current sort order) of ' +
                result.localScan.cotalityMatches.toLocaleString() + ' Cotality matches (' + (result.localCriteria || []).join(', ') +
                '). Narrow the search to check every match.', 'warning');
        }

        // Show search results UI (extracted for reuse by server search)
        function _showSearchResults() {
            // Save for "Last Search" recall
            if (typeof saveLastSearchCriteria === 'function') saveLastSearchCriteria();

            // Hide the entire search form container
            var searchFormContainer = document.getElementById('searchFormContainer');
            if (searchFormContainer) searchFormContainer.style.display = 'none';

            // Show search results section
            var searchResultsSection = document.getElementById('searchResultsSection');
            if (searchResultsSection) {
                searchResultsSection.style.display = 'block';
                searchResultsSection.classList.remove('hidden');
                initializeSearchResults();
            }

            // Update results count
            updateResultsCount();

            // Highlight active search type on sticky nav
            updateStickyNavActive();

            // Close refine panel if open (fresh search resets it)
            var refinePanel = document.getElementById('refinePanel');
            if (refinePanel) { refinePanel.style.display = 'none'; _refinePanelOpen = false; }

            // Save search state for refresh persistence
            _saveSearchState();

            // Update hash to reflect results view
            if (!window._suppressHashUpdate) {
                history.replaceState(null, '', '#results');
            }

            // Refresh map pins if map is open (covers local-only + all search paths)
            if (typeof refreshResultsMap === 'function') refreshResultsMap();

            // Scroll to top of results
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Convert collectSearchCriteria() output -> /api/idx/search query params.
        // Shared between _serverSearch (the full search pipeline) and the
        // live "~N match" tracker badge (init-tracker.js) so the badge count
        // reflects the same Trestle filter the Search button will run. Live
        // tracker can override `limit: 1` to get a count-only response.
        // Window-attached so init-tracker.js can call it.
        window.buildIdxSearchParams = function(criteria) {
            var params = {};
            if (!criteria) return params;
            // Two mappings: sale = Cotality PropertyType Residential, rental = ResidentialLease.
            // Building search sends no type and spans both.
            if (criteria.searchTab === 'rent') params.type = 'rental';
            else if (criteria.searchTab === 'sale') params.type = 'sale';
            if (criteria.address) params.address = criteria.address;
            if (criteria.priceMin) params.minPrice = criteria.priceMin;
            if (criteria.priceMax) params.maxPrice = criteria.priceMax;
            if (criteria.bedsMin != null) params.minBeds = criteria.bedsMin;
            if (criteria.bedsMax != null) params.maxBeds = criteria.bedsMax;
            if (criteria.bathsMin) params.minBaths = criteria.bathsMin;
            if (criteria.bathsMax) params.maxBaths = criteria.bathsMax;
            if (criteria.neighborhoods && criteria.neighborhoods.length > 0) {
                params.neighborhood = criteria.neighborhoods.join(',');
            }
            if (criteria.borough) params.borough = criteria.borough;
            if (criteria.propertySubType) params.propertySubType = criteria.propertySubType;
            if (criteria.rlsId) params.listingId = criteria.rlsId;
            if (criteria.zip) params.zip = criteria.zip;
            if (criteria.unit) params.unit = criteria.unit;
            if (criteria.keyword) params.keyword = criteria.keyword;
            if (criteria.roomsMin) params.minRooms = criteria.roomsMin;
            if (criteria.roomsMax) params.maxRooms = criteria.roomsMax;
            if (criteria.sqftMin) params.minSqft = criteria.sqftMin;
            if (criteria.sqftMax) params.maxSqft = criteria.sqftMax;
            if (criteria.managementCompany) params.managementCompany = criteria.managementCompany;
            ['listAgent', 'coListAgent', 'anyAgent', 'listOffice', 'coListOffice'].forEach(function(k) { if (criteria[k]) params[k] = criteria[k]; });
            if (criteria.dateFrom) params.dateFrom = criteria.dateFrom;
            if (criteria.dateTo) params.dateTo = criteria.dateTo;
            if (criteria.dateActivityType) params.dateType = criteria.dateActivityType;
            if (criteria.openHouseDateFrom) params.openHouseDateFrom = criteria.openHouseDateFrom;
            if (criteria.openHouseDateTo) params.openHouseDateTo = criteria.openHouseDateTo;
            if (criteria.contractDateFrom) params.contractDateFrom = criteria.contractDateFrom;
            if (criteria.contractDateTo) params.contractDateTo = criteria.contractDateTo;
            if (criteria.soldDateFrom) params.closeDateFrom = criteria.soldDateFrom;
            if (criteria.soldDateTo) params.closeDateTo = criteria.soldDateTo;
            // Transit/grid bounds (when reached via a programmatic path) produce no backend OData
            // clause — Cotality suppresses Latitude/Longitude. The UI controls are disabled by
            // init-disable-dead-controls.js; strip defensively here.
            // Note: criteria._transitBounds / criteria._gridBounds are
            // SET by transit-search.js / manhattan-grid.js only when
            // the user interacts with those panels, which P1 disabled.
            // Strip defensively in case a future programmatic path
            // populates them (REBNY IDX feed has no Latitude/Longitude
            // — Lat/Lng OData clauses match zero rows at runtime).
            if (criteria._transitBounds) {
                console.warn('[CRM Search] Stripped _transitBounds — REBNY IDX feed has no Lat/Lng.');
            }
            if (criteria._gridBounds) {
                console.warn('[CRM Search] Stripped _gridBounds — REBNY IDX feed has no Lat/Lng.');
            }
            if (criteria.ownership && criteria.ownership.length > 0) {
                params.ownership = criteria.ownership.join(',');
            }
            if (criteria.yearMin) params.minYear = criteria.yearMin;
            if (criteria.yearMax) params.maxYear = criteria.yearMax;
            if (criteria.floorsMin) params.minFloors = criteria.floorsMin;
            if (criteria.floorsMax) params.maxFloors = criteria.floorsMax;
            if (criteria.unitsMin) params.minUnits = criteria.unitsMin;
            if (criteria.unitsMax) params.maxUnits = criteria.unitsMax;
            if (criteria.buildingName) params.buildingName = criteria.buildingName;
            // Status: CRM uppercase -> RESO PascalCase
            if (criteria.statuses && criteria.statuses.length > 0) {
                // In contract: live Cotality delivers these as 'Pending' (none as 'ActiveUnderContract', 2026-10-23); send both.
                var statusMap = { 'ACTIVE': 'Active', 'COMING_SOON': 'ComingSoon', 'PENDING': 'Pending,ActiveUnderContract', 'CONTRACT': 'Pending,ActiveUnderContract', 'UNDER_CONTRACT': 'Pending,ActiveUnderContract', 'CLOSED': 'Closed', 'WITHDRAWN': 'Withdrawn', 'CANCELED': 'Canceled', 'CANCELLED': 'Canceled', 'EXPIRED': 'Expired', 'HOLD': 'Hold', 'FUTURE': 'Incomplete', 'INCOMPLETE': 'Incomplete' };
                var resoStatuses = criteria.statuses.map(function(s) { return statusMap[s] || s; }).filter(function(s, i, arr) { return arr.indexOf(s) === i; });
                params.status = resoStatuses.join(',');
                // A closed-only search lists the most recent closings first unless the agent chose a sort
                // (the price order put 2013 sales ahead of this year's). CloseDate is a live Cotality sort field.
                var _closedOnly = resoStatuses.every(function (s) { return /^(Closed|Sold|SoldThruUs|Financed|NoFinancing)$/.test(s); });
                if (!searchResultsState.sortExplicit) {
                    if (_closedOnly && searchResultsState.sortField !== 'closedDate') { searchResultsState.sortField = 'closedDate'; searchResultsState.sortOrder = 'desc'; }
                    else if (!_closedOnly && searchResultsState.sortField === 'closedDate') { searchResultsState.sortField = 'price'; searchResultsState.sortOrder = 'asc'; }
                    var _sortLabel = document.getElementById('sortLabel');
                    if (_sortLabel) _sortLabel.textContent = searchResultsState.sortField === 'closedDate' ? 'Closed Date' : (searchResultsState.sortField === 'price' ? 'Price' : _sortLabel.textContent);
                }
            }
            // Bug A11 — SponsorUnit lives inside CustomProperty.CustomFields
            // (REBNY-specific JSON-string field), NOT a top-level OData
            // property. The generic checkboxFilters loop on the backend
            // (lib/search/crm-idx-filter.ts:239-277) would silently drop
            // it because "SponsorUnit" is not in the odataSafe whitelist.
            // Pull it out into a dedicated `sponsorUnit` param so the
            // route handler can apply a post-fetch filter against the
            // mapper's parsed listing.sponsorUnit field.
            if (criteria.checkboxFilters && criteria.checkboxFilters.SponsorUnit) {
                var _sp = criteria.checkboxFilters.SponsorUnit;
                if (Array.isArray(_sp) && (_sp.indexOf('true') !== -1 || _sp.indexOf('Yes') !== -1)) {
                    params.sponsorUnit = 'true';
                }
                // Remove from the JSON payload so the backend doesn't try to
                // OData-filter on it.
                delete criteria.checkboxFilters.SponsorUnit;
            }
            if (criteria.checkboxFilters) {
                var _cbJson = JSON.stringify(criteria.checkboxFilters);
                if (_cbJson !== '{}') params.checkboxFilters = _cbJson;
            }
            // Mixed-field checkbox groups (OR across fields), min/max ranges and text
            // criteria from the generated advanced controls — all by live Cotality name.
            if (criteria.checkboxGroups && Object.keys(criteria.checkboxGroups).length) params.checkboxGroups = JSON.stringify(criteria.checkboxGroups);
            var _ranges = Object.assign({}, criteria.fieldRanges || {});
            // Open houses: listings with a live Cotality OpenHouse row in the range (two steps server-side).
            if (criteria.openHouseDateFrom) _ranges['OpenHouse/OpenHouseDate'] = { min: criteria.openHouseDateFrom, max: criteria.openHouseDateTo || criteria.openHouseDateFrom };
            if (criteria.financingMin) _ranges.MaximumFinancingPercent = Object.assign({}, _ranges.MaximumFinancingPercent, { min: String(criteria.financingMin) });
            if (Object.keys(_ranges).length) params.fieldRanges = JSON.stringify(_ranges);
            if (criteria.fieldText && Object.keys(criteria.fieldText).length) params.fieldText = JSON.stringify(criteria.fieldText);
            if (criteria.availableFrom) params.availableFrom = criteria.availableFrom;
            if (criteria.availableTo) params.availableTo = criteria.availableTo;
            // ── Codex Risk P0 fix: transit/grid panels are disabled at
            //    container level (init-disable-dead-controls.js) AND
            //    the underlying REBNY IDX feed does not populate
            //    Latitude/Longitude per CLAUDE.md. The two blocks below
            //    previously turned criteria._transitBounds /
            //    criteria._gridBounds into a `gridFilter` param that
            //    matched zero Trestle rows at runtime. They are now
            //    short-circuited; the warning was emitted above. When
            //    geocoded coordinates land on the projection (master
            //    plan PR 5), restore both blocks AND remove the
            //    transit/grid entries from DEAD_CONTAINERS in
            //    init-disable-dead-controls.js. Both must move together.
            return params;
        };

        // Result sort → live Cotality $orderby, so a sort covers every match, not only the loaded page.
        // DOM ascending = most recent OnMarketDate first. Columns without a live field return null.
        var _COTALITY_SORT = { price: 'ListPrice', listedDate: 'ListingContractDate', closedDate: 'CloseDate', beds: 'BedroomsTotal', baths: 'BathroomsTotalInteger',
            rooms: 'RoomsTotal', intSqft: 'LivingArea', address: 'StreetName', reTaxes: 'TaxAnnualAmount', maintCC: 'AssociationFee', status: 'StandardStatus' };
        function _cotalitySort() {
            var field = searchResultsState.sortField, asc = searchResultsState.sortOrder !== 'desc';
            if (field === 'dom') return 'OnMarketDate ' + (asc ? 'desc' : 'asc');
            return _COTALITY_SORT[field] ? _COTALITY_SORT[field] + (asc ? ' asc' : ' desc') : null;
        }

        // Re-sort: with more matches than are loaded, run the same search again in the new order.
        // Returns true when it did; otherwise the caller sorts the loaded results (all of them, or says so).
        window.resortServerResults = function() {
            var base = searchResultsState.lastParams;
            var loaded = (searchResultsState.filteredListings || []).length;
            var total = searchResultsState.serverTotal;
            if (!base || total == null || loaded >= total) return false;
            var sort = _cotalitySort();
            if (!sort) {
                showToast('Sorted within the ' + loaded.toLocaleString() + ' loaded of ' + total.toLocaleString() + ' results — Cotality cannot sort by this column.', 'warning');
                return false;
            }
            var params = Object.assign({}, base, { sort: sort });
            delete params.skip;
            _runServerSearch(params);
            return true;
        };

        // Server-side search: query Trestle API with criteria — this is the PRIMARY data source
        function _serverSearch(criteria) {
            _runServerSearch(window.buildIdxSearchParams(criteria));
        }

        // One Cotality search with these exact params (a new search, or the same one re-sorted).
        function _runServerSearch(params) {
            if (!params.sort) { var _sort = _cotalitySort(); if (_sort) params.sort = _sort; }
            // The order Cotality returns these results in, as the page's sort field + direction
            var _serverSortKey = params.sort && params.sort === _cotalitySort() ? searchResultsState.sortField + ' ' + searchResultsState.sortOrder : null;

            // ≤200: server sends inline photos via $expand=Media (fast, one request)
            // >200: server sends listings without photos, photo-loader.js lazy-loads
            //       via /api/media/batch + IntersectionObserver
            params.limit = 200;

            console.log('[Search] Querying Cotality:', JSON.stringify(params));
            if (typeof _serverSearchActive !== 'undefined') _serverSearchActive = true;
            searchResultsState.lastParams = params;
            // "Last Search" recall stores this exact query. Saving it here (not only when the results UI
            // opens, which runs before this point) keeps the stored query current instead of one behind.
            if (typeof saveLastSearchCriteria === 'function') saveLastSearchCriteria();
            MallanAPI.idx.search(params).then(function(result) {
                if (typeof _serverSearchActive !== 'undefined') _serverSearchActive = false;
                searchResultsState.serverSortKey = _serverSortKey;
                // A new search starts unfiltered by the "Search in results" box
                searchResultsState.textFilter = '';
                var _rsi = document.getElementById('resultsSearchInput');
                if (_rsi) _rsi.value = '';
                console.log('[Search] Cotality returned:', result ? (result.listings ? result.listings.length + ' of ' + result.total + ' listings' : 'no listings array') : 'null');
                searchResultsState.serverTotal = result && typeof result.total === 'number' ? result.total : null;
                _showLocalScanNotice(result);
                if (!result || !result.listings || result.listings.length === 0) {
                    // Server returned 0. Trestle is the source of truth for IDX
                    // search — DO NOT keep the pre-display local fixture
                    // results visible, because they include cross-borough
                    // fixture rows that don't match the actual IDX query
                    // (e.g. Manhattan + 1 bed search briefly showing Bronx/
                    // Queens fixtures while server loads). Clear the display
                    // so the empty-state + toast surfaces honestly.
                    searchResultsState.filteredListings = [];
                    searchResultsState.currentPage = 1;
                    try {
                        if (typeof initializeSearchResults === 'function') initializeSearchResults();
                        if (typeof updateResultsCount === 'function') updateResultsCount();
                        if (typeof refreshResultsMap === 'function') refreshResultsMap();
                    } catch (renderErr) {
                        console.error('[Search] Render after zero-result failed:', renderErr);
                    }
                    _saveSearchState();
                    showToast('No listings found. Try broadening your search criteria.', 'warning');
                    return;
                }

                // Server results are the primary data — they're already in CRM flat shape
                var serverListings = result.listings;

                // Apply neighborhood resolution and defaults
                serverListings.forEach(function(l) {
                    if (l.price == null) l.price = 0;
                    if (l.totalMonthly == null) l.totalMonthly = 0;
                    if (l.maintCC == null) l.maintCC = 0;
                    if (l.reTaxes == null) l.reTaxes = 0;
                    if (l.beds == null) l.beds = 0;
                    if (l.baths == null) l.baths = 0;
                    if (l.rooms == null) l.rooms = 0;
                    // dom stays null when Cotality has no OnMarketDate — never a fabricated 0
                    if (l.photoCount == null) l.photoCount = (l.images && l.images.length) || 0;
                    if (!l.status) l.status = 'ACTIVE';
                    if (!l.address) l.address = 'Address Unavailable';
                    if (!l.unit) l.unit = '';
                    if (!l.neighborhood) l.neighborhood = '';
                    if (!l.zip) l.zip = '';
                    if (!l.borough) l.borough = 'Manhattan';
                    if (!l.listedDate) l.listedDate = '--';
                    if (!l.company) l.company = '';
                    if (!l.permissions) l.permissions = { ownerOptOut: false, participantOnly: false, idxDisplay: true, internetDisplay: true, syndication: true };
                    if (typeof resolveNeighborhoodCanonical === 'function') resolveNeighborhoodCanonical(l);
                });

                // Merge server results into listings (preserving existing data with photos)
                var existingById = {};
                listings.forEach(function(l) { existingById[l.id] = l; });
                var existingByLid = {};
                listings.forEach(function(l) { if (l.lid) existingByLid[l.lid] = l; });
                serverListings.forEach(function(l) {
                    var existing = existingById[l.id] || (l.lid ? existingByLid[l.lid] : null);
                    if (existing) {
                        // Update existing listing but preserve images if server has none
                        if ((!l.images || l.images.length === 0) && existing.images && existing.images.length > 0) {
                            l.images = existing.images;
                        }
                    } else {
                        listings.push(l);
                    }
                });

                // REPLACE the pre-display local fixture results with the
                // authoritative Trestle server results. Previously this
                // merged `localResults` (fixture-side filter output) with
                // `serverListings`, which polluted IDX search results with
                // cross-borough fixtures — e.g. Manhattan+1bed search would
                // render Bronx/Queens fixture rows above the actual Manhattan
                // listings because filterListings(listings, criteria) on the
                // ~126-row local fixture set is not borough/neighborhood-
                // strict and IDX search is server-authoritative anyway.
                // serverListings has been merged into the global `listings`
                // array above so existing-by-id lookups still work; we just
                // stop polluting the rendered list.
                searchResultsState.filteredListings = serverListings;
                searchResultsState.currentPage = 1;
                try {
                    if (typeof initializeSearchResults === 'function') initializeSearchResults();
                    if (typeof updateResultsCount === 'function') updateResultsCount();
                    if (typeof refreshResultsMap === 'function') refreshResultsMap();
                } catch(renderErr) {
                    console.error('[Search] Render after server search failed:', renderErr);
                }
                _saveSearchState();
                console.log('[Search] Rendered ' + serverListings.length + ' listings from Trestle');
            }).catch(function(err) {
                if (typeof _serverSearchActive !== 'undefined') _serverSearchActive = false;
                console.error('[Search] Cotality search failed:', err);
                if (err && err.status === 422 && err.data && err.data.refused) {
                    _showRefusedCriteria(err.data.refused);
                    return;
                }
                _setResultsCountText('Search failed');
                showToast((err && err.message) || 'Search temporarily unavailable. Please try again.', 'error');
            });
        }

        // Next page of the same Cotality search (results beyond the first page).
        window.loadMoreSearchResults = function() {
            var base = searchResultsState.lastParams;
            // Rows the agent removed still count toward Cotality's offset, or the next page repeats them.
            var loaded = (searchResultsState.filteredListings || []).length + (searchResultsState.removedCount || 0);
            if (!base || searchResultsState.serverTotal == null || loaded >= searchResultsState.serverTotal) return;
            var params = Object.assign({}, base, { skip: loaded });
            _setResultsCountText('Loading more from Cotality…');
            MallanAPI.idx.search(params).then(function(result) {
                (result.listings || []).forEach(function(l) {
                    if (typeof resolveNeighborhoodCanonical === 'function') resolveNeighborhoodCanonical(l);
                    searchResultsState.filteredListings.push(l);
                    listings.push(l);
                });
                if (typeof result.total === 'number') searchResultsState.serverTotal = result.total;
                if (typeof initializeSearchResults === 'function') initializeSearchResults();
                updateResultsCount();
            }).catch(function(err) {
                updateResultsCount();
                showToast((err && err.message) || 'Could not load more results.', 'error');
            });
        };

        // Quick Search — formerly gated submission on RLS/Zip/Address/
        // Neighborhood being present. Removed 2026-05-03 after telemetry +
        // user reports confirmed agents expected the quick-card Search button
        // to behave like every other Search button on the page (Basic main
        // and sticky footer both call performSearch with no validation). The
        // gate was a UX trap: clicking Search with no criterion returned a
        // blocking toast instead of the active sale listings users expected.
        // Now a thin alias for performSearch — keeps the named entry point
        // for debuggability and existing onclick wiring, removes the gate.
        // The full pipeline (collectSearchCriteria → _serverSearch) defaults
        // type=sale + status=Active when no other filter is present and
        // returns active sale listings.
        function quickSearch(_btn) {
            performSearch();
        }

        // ══════════════════════════════════════════════════════
        // ADDRESS AUTOCOMPLETE — Search forms (Sale, Rental, Building, Advanced)
        // Searches both buildingDatabase (object) and listingBuildingDB (array)
        // ══════════════════════════════════════════════════════
        // Debounce timer for server-side address search
        var _addrSearchTimer = null;

        function searchAddressAutocomplete(query, resultsDivId) {
            var resultsDiv = document.getElementById(resultsDivId);
            if (!resultsDiv) return;
            // Nothing to suggest for a short query or an RLS ID (searched exactly, not by address)
            if (!query || query.length < 2 || /^RLS\d*$/i.test(query.trim())) {
                resultsDiv.classList.add('hidden');
                if (_addrSearchTimer) { clearTimeout(_addrSearchTimer); _addrSearchTimer = null; }
                return;
            }

            var normalizedQuery = normalizeAddress(query);
            var matches = [];

            // Search object-style buildingDatabase (building search section)
            if (typeof buildingDatabase === 'object' && !Array.isArray(buildingDatabase)) {
                Object.keys(buildingDatabase).forEach(function(key) {
                    var b = buildingDatabase[key];
                    if (normalizeAddress(key).indexOf(normalizedQuery) !== -1 ||
                        normalizeAddress(b.address).indexOf(normalizedQuery) !== -1 ||
                        normalizeAddress(b.name).indexOf(normalizedQuery) !== -1) {
                        matches.push({
                            address: b.address,
                            name: b.name,
                            neighborhood: b.neighborhood,
                            borough: b.borough,
                            zip: b.zip,
                            type: b.type,
                            yearBuilt: b.yearBuilt
                        });
                    }
                });
            }

            // Search array-style listingBuildingDB (listing form IDX)
            if (typeof listingBuildingDB !== 'undefined' && Array.isArray(listingBuildingDB)) {
                listingBuildingDB.forEach(function(b) {
                    var already = matches.some(function(m) { return m.address === b.address; });
                    if (already) return;
                    if (normalizeAddress(b.address).indexOf(normalizedQuery) !== -1 ||
                        normalizeAddress(b.name).indexOf(normalizedQuery) !== -1) {
                        matches.push({
                            address: b.address,
                            name: b.name,
                            neighborhood: b.neighborhood,
                            borough: b.borough,
                            zip: b.zip,
                            type: b.model || b.type,
                            yearBuilt: b.yearBuilt
                        });
                    }
                });
            }

            // Also search listings for address matches
            if (typeof listings !== 'undefined') {
                listings.forEach(function(listing) {
                    var already = matches.some(function(m) { return m.address === listing.address; });
                    if (already) return;
                    if (normalizeAddress(listing.address).indexOf(normalizedQuery) !== -1 ||
                        (listing.buildingName && normalizeAddress(listing.buildingName).indexOf(normalizedQuery) !== -1)) {
                        matches.push({
                            address: listing.address,
                            name: listing.buildingName || '',
                            neighborhood: listing.neighborhood,
                            borough: listing.borough || '',
                            zip: listing.zip,
                            type: ownershipLabel(listing.ownership) || '',
                            yearBuilt: ''
                        });
                    }
                });
            }

            // Show local results immediately (or "Searching..." if none)
            _renderAddressResults(matches, resultsDiv, resultsDivId);

            // Always query server for more results (debounced) — local data is limited
            if (query.length >= 3 && typeof MallanAPI !== 'undefined') {
                if (_addrSearchTimer) clearTimeout(_addrSearchTimer);
                _addrSearchTimer = setTimeout(function() {
                    _serverAddressSearch(query, resultsDivId, matches);
                }, 300);
            }
        }

        function _renderAddressResults(matches, resultsDiv, resultsDivId) {
            if (matches.length === 0) {
                resultsDiv.innerHTML = '<div class="px-3 py-2 text-gray-400">Searching...</div>';
                resultsDiv.classList.remove('hidden');
                return;
            }

            resultsDiv.innerHTML = matches.slice(0, 8).map(function(b) {
                var typeColor = (b.type === 'Coop' || b.type === 'Co-op') ? 'bg-purple-100 text-purple-700' :
                                b.type === 'Condo' ? 'bg-blue-100 text-blue-700' :
                                b.type === 'Condop' ? 'bg-indigo-100 text-indigo-700' :
                                (b.type === 'Rental Bldg' || b.type === 'RentalBuilding') ? 'bg-orange-100 text-orange-700' :
                                b.type === 'Townhouse' ? 'bg-green-100 text-green-700' :
                                'bg-gray-100 text-gray-600';
                return '<div class="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b last:border-0" ' +
                    'onclick="selectSearchAddress(this, \'' + resultsDivId + '\')"' +
                    ' data-address="' + escapeHtml(b.address) + '" data-name="' + escapeHtml(b.name || '') + '" data-zip="' + escapeHtml(b.zip || '') + '" data-neighborhood="' + escapeHtml(b.neighborhood || '') +
                    '" data-borough="' + escapeHtml(b.borough || '') + '" data-type="' + escapeHtml(b.type || '') + '">' +
                    '<div class="flex justify-between items-center">' +
                    '<div>' +
                    '<p class="font-medium text-gray-800">' + escapeHtml(b.address) + '</p>' +
                    '<p class="text-gray-500">' + (b.name ? escapeHtml(b.name) + ' | ' : '') + escapeHtml(b.neighborhood) + ', ' + escapeHtml(b.borough) + '</p>' +
                    '</div>' +
                    (b.type ? '<span class="px-1.5 py-0.5 text-[10px] font-bold rounded-full ' + typeColor + ' ml-2 whitespace-nowrap">' + escapeHtml(b.type) + '</span>' : '') +
                    '</div></div>';
            }).join('');
            resultsDiv.classList.remove('hidden');
        }

        // Server-side address search via Trestle API
        function _serverAddressSearch(query, resultsDivId, localMatches) {
            var resultsDiv = document.getElementById(resultsDivId);
            if (!resultsDiv) return;
            // Call our search API with address filter
            MallanAPI.idx.search({ address: query, limit: 10 }).then(function(result) {
                if (!result || !result.listings) return;
                var serverMatches = localMatches.slice(); // start with local
                var existingAddrs = {};
                serverMatches.forEach(function(m) { existingAddrs[m.address] = true; });
                result.listings.forEach(function(l) {
                    if (existingAddrs[l.address]) return;
                    existingAddrs[l.address] = true;
                    serverMatches.push({
                        address: l.address,
                        name: l.buildingName || '',
                        neighborhood: l.neighborhood || '',
                        borough: l.borough || '',
                        zip: l.zip || '',
                        type: ownershipLabel(l.ownership) || '',
                        yearBuilt: ''
                    });
                });
                // Re-render with merged results (only if dropdown still visible)
                if (!resultsDiv.classList.contains('hidden')) {
                    if (serverMatches.length === 0) {
                        resultsDiv.innerHTML = '<div class="px-3 py-2 text-gray-400">No matching address in live Cotality — press Esc to close, or search with what you typed.</div>';
                    } else {
                        _renderAddressResults(serverMatches, resultsDiv, resultsDivId);
                    }
                }
            }).catch(function() { /* ignore server errors — local results already shown */ });
        }

        // Select an address from autocomplete results
        function selectSearchAddress(el, resultsDivId) {
            var address = el.getAttribute('data-address');
            var resultsDiv = document.getElementById(resultsDivId);
            // Find the input that triggers this dropdown
            var inputId = resultsDivId.replace('AddrResults', 'Address');
            var input = document.getElementById(inputId);
            if (input) {
                input.value = address;
                // The building behind the address, shown inside the same box (field-box.js)
                var where = [el.getAttribute('data-neighborhood'), el.getAttribute('data-borough')].filter(Boolean).join(', ');
                var note = [el.getAttribute('data-name'), where, el.getAttribute('data-type')].filter(Boolean).join(' · ');
                if (typeof fieldBoxNote === 'function') fieldBoxNote(input, note);
            }
            if (resultsDiv) resultsDiv.classList.add('hidden');
            // Consumers that act on a picked building (Subject Buildings list) listen for this
            if (input) {
                try { input.dispatchEvent(new CustomEvent('mallan:address-picked', { bubbles: true, detail: { address: address } })); } catch (e) { /* older engines */ }
            }
        }

        // Close autocomplete dropdowns when clicking outside
        document.addEventListener('click', function(e) {
            // Every address suggestion box on the page (search forms and Comparable Reports)
            document.querySelectorAll('[id$="AddrResults"]').forEach(function(dd) {
                if (dd.contains(e.target)) return;
                var input = document.getElementById(dd.id.replace('AddrResults', 'Address'));
                if (input !== e.target) dd.classList.add('hidden');
            });
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') document.querySelectorAll('[id$="AddrResults"]').forEach(function(dd) { dd.classList.add('hidden'); });
        });

        // Convert MM/DD/YYYY to YYYY-MM-DD (ISO) for OData API compatibility
        function _mdyToISO(mdyStr) {
            if (!mdyStr) return mdyStr;
            var parts = mdyStr.split('/');
            if (parts.length !== 3) return mdyStr;
            return parts[2] + '-' + parts[0].padStart(2, '0') + '-' + parts[1].padStart(2, '0');
        }

        // A control counts only when the agent can see it: the sale / rental / building
        // blocks of the shared basic form, and tab-specific advanced sections, are hidden
        // with style.display = 'none'. Collapsed <details> groups still count.
        // A control counts when its own form / section is shown. The walk stops at the search form
        // container: that container is hidden while results show, and a saved search reloaded from the
        // results header lost every status, ownership and facet box that way — the rerun sent no status
        // and Cotality answered with its default status set (found 2026-10-27, A7-rerun / G4).
        function _isActiveControl(el) {
            var top = document.getElementById('searchFormContainer');
            for (var node = el; node && node !== document.body && node !== top; node = node.parentElement) {
                if (node.style && node.style.display === 'none') return false;
            }
            return true;
        }
        function _activeOnly(nodeList) {
            return Array.prototype.filter.call(nodeList, _isActiveControl);
        }

        function collectSearchCriteria() {
            var criteria = {};
            criteria.searchTab = currentSearchTab; // 'sale', 'rent', or 'building'

            // The current tab's basic form (Sales, Rentals and Buildings are separate forms)
            var activeBasicForm = document.getElementById(activeBasicFormId());

            // Price range — use the correct IDs based on search tab and mode (basic vs advanced)
            var _advMode = document.getElementById('searchAdvancedMode');
            var _isAdvanced = _advMode && _advMode.style.display !== 'none' && !_advMode.classList.contains('hidden');
            criteria.searchMode = _isAdvanced ? 'advanced' : 'basic'; // saved searches reload into the same form
            var priceMin, priceMax;
            if (_isAdvanced) {
                if (currentSearchTab === 'rent') {
                    priceMin = document.getElementById('advRentalMinRent');
                    priceMax = document.getElementById('advRentalMaxRent');
                } else {
                    priceMin = document.getElementById('advSaleMinPrice');
                    priceMax = document.getElementById('advSaleMaxPrice');
                }
            } else if (currentSearchTab === 'rent') {
                priceMin = document.getElementById('rentalMinRent');
                priceMax = document.getElementById('rentalMaxRent');
            } else if (currentSearchTab === 'sale') {
                priceMin = document.getElementById('saleMinPrice');
                priceMax = document.getElementById('saleMaxPrice');
            }
            // The Buildings form has no unit price / bed / bath / room / size controls: nothing is read there.
            // A "Custom" box carries the typed amount as the select's value (init-ui.js); 'custom' = nothing typed.
            if (priceMin && priceMin.value && priceMin.value !== 'custom') {
                var pMin = parseInt(priceMin.value, 10);
                if (!isNaN(pMin) && pMin > 0) criteria.priceMin = pMin;
            }
            if (priceMax && priceMax.value && priceMax.value !== 'custom') {
                var pMax = parseInt(priceMax.value, 10);
                if (!isNaN(pMax) && pMax > 0) criteria.priceMax = pMax;
            }

            // Bedrooms — use the correct IDs based on search tab and mode
            var bedsMin, bedsMax;
            if (_isAdvanced) {
                bedsMin = document.getElementById('adv-min-beds');
                bedsMax = document.getElementById('adv-max-beds');
            } else if (currentSearchTab === 'rent') {
                bedsMin = document.getElementById('rentalMinBeds');
                bedsMax = document.getElementById('rentalMaxBeds');
            } else if (currentSearchTab === 'sale') {
                bedsMin = document.getElementById('saleMinBeds');
                bedsMax = document.getElementById('saleMaxBeds');
            }
            if (bedsMin && bedsMin.value !== '' && bedsMin.value !== 'custom') {
                criteria.bedsMin = parseInt(bedsMin.value);
                if (isNaN(criteria.bedsMin)) delete criteria.bedsMin;
            }
            if (bedsMax && bedsMax.value !== '' && bedsMax.value !== 'custom') {
                criteria.bedsMax = parseInt(bedsMax.value);
                if (isNaN(criteria.bedsMax)) delete criteria.bedsMax;
            }

            // Bathrooms — use correct IDs per tab and mode, parseFloat for half-baths (1.5, 2.5)
            var bathsMin, bathsMax;
            if (_isAdvanced) {
                bathsMin = document.getElementById('adv-min-baths');
                bathsMax = document.getElementById('adv-max-baths');
            } else if (currentSearchTab === 'rent') {
                bathsMin = document.getElementById('rentalMinBaths');
                bathsMax = document.getElementById('rentalMaxBaths');
            } else if (currentSearchTab === 'sale') {
                bathsMin = document.getElementById('saleMinBaths');
                bathsMax = document.getElementById('saleMaxBaths');
            }
            if (bathsMin && bathsMin.value !== '' && bathsMin.value !== 'custom') {
                criteria.bathsMin = parseFloat(bathsMin.value);
                if (isNaN(criteria.bathsMin)) delete criteria.bathsMin;
            }
            if (bathsMax && bathsMax.value !== '' && bathsMax.value !== 'custom') {
                criteria.bathsMax = parseFloat(bathsMax.value);
                if (isNaN(criteria.bathsMax)) delete criteria.bathsMax;
            }

            // Rooms — use correct IDs per tab and mode
            var roomsMin, roomsMax;
            if (_isAdvanced) {
                roomsMin = document.getElementById('adv-min-rooms');
                roomsMax = document.getElementById('adv-max-rooms');
            } else if (currentSearchTab === 'rent') {
                roomsMin = document.getElementById('rentalMinRooms');
                roomsMax = document.getElementById('rentalMaxRooms');
            } else if (currentSearchTab === 'sale') {
                roomsMin = document.getElementById('saleMinRooms');
                roomsMax = document.getElementById('saleMaxRooms');
            }
            if (roomsMin && roomsMin.value && roomsMin.value !== '' && roomsMin.value !== 'custom') {
                criteria.roomsMin = parseInt(roomsMin.value);
                if (isNaN(criteria.roomsMin)) delete criteria.roomsMin;
            }
            if (roomsMax && roomsMax.value && roomsMax.value !== '' && roomsMax.value !== 'custom') {
                criteria.roomsMax = parseInt(roomsMax.value);
                if (isNaN(criteria.roomsMax)) delete criteria.roomsMax;
            }

            // Square footage — use correct IDs per tab and mode
            var sqftMin, sqftMax;
            if (_isAdvanced) {
                sqftMin = document.getElementById('adv-min-sqft');
                sqftMax = document.getElementById('adv-max-sqft');
            } else if (currentSearchTab === 'rent') {
                sqftMin = document.getElementById('rentalMinSqft');
                sqftMax = document.getElementById('rentalMaxSqft');
            } else if (currentSearchTab === 'sale') {
                sqftMin = document.getElementById('saleMinSqft');
                sqftMax = document.getElementById('saleMaxSqft');
            }
            if (sqftMin && sqftMin.value && sqftMin.value !== '' && sqftMin.value !== 'custom') {
                criteria.sqftMin = parseInt(sqftMin.value);
                if (isNaN(criteria.sqftMin)) delete criteria.sqftMin;
            }
            if (sqftMax && sqftMax.value && sqftMax.value !== '' && sqftMax.value !== 'custom') {
                criteria.sqftMax = parseInt(sqftMax.value);
                if (isNaN(criteria.sqftMax)) delete criteria.sqftMax;
            }

            // Ownership type (CommonInterest checkboxes). Disabled controls are never collected:
            // they are criteria live Cotality cannot serve for the current sale / rental mapping.
            if (activeBasicForm) {
                var ownershipChecks = _activeOnly(activeBasicForm.querySelectorAll('[data-field="CommonInterest"]:checked:not(:disabled):not([data-group])'));
                if (ownershipChecks.length > 0) {
                    criteria.ownership = Array.from(ownershipChecks).map(function(cb) { return cb.getAttribute('data-value') || cb.value; });
                }
            }

            // PropertySubType checkboxes (Townhouse, Conversion, Single Family, etc.)
            var propertySubTypeChecked = [];
            var advModeEl = document.getElementById('searchAdvancedMode');
            var pstIsAdvanced = advModeEl && advModeEl.style.display !== 'none' && !advModeEl.classList.contains('hidden');
            var pstOnly = 'input[data-field="PropertySubType"]:checked:not(:disabled):not([data-group])';
            var pstSelector = pstIsAdvanced
                ? '#searchAdvancedMode ' + pstOnly
                : (activeBasicForm ? '#' + activeBasicForm.id + ' ' + pstOnly : pstOnly);
            _activeOnly(document.querySelectorAll(pstSelector)).forEach(function(cb) {
                propertySubTypeChecked.push(cb.getAttribute('data-value'));
            });
            if (propertySubTypeChecked.length > 0) {
                criteria.propertySubType = propertySubTypeChecked.join(',');
            }

            // Status checkboxes (Cotality StandardStatus) — collect all checked statuses.
            // MlsStatus is suppressed by Cotality; a data-sub-status control is sent only when live
            // Property fields express it (lib/search/crm-idx-filter.ts SUB_STATUSES).
            var _LIVE_SUB_STATUSES = { BackOnMarket: 1, Sold: 1, Rented: 1, SoldThruUs: 1, RentedThruUs: 1, NoFinancing: 1, Financed: 1, Future: 1 };
            // Determine which container has the status checkboxes
            var statusContainer = activeBasicForm;
            var advancedMode = document.getElementById('searchAdvancedMode');
            if (advancedMode && advancedMode.style.display !== 'none') {
                // In advanced mode, use the visible status options div
                var saleOpts = document.getElementById('saleStatusOptions');
                var rentalOpts = document.getElementById('rentalStatusOptions');
                if (rentalOpts && rentalOpts.style.display !== 'none') {
                    statusContainer = rentalOpts;
                } else if (saleOpts && saleOpts.style.display !== 'none') {
                    statusContainer = saleOpts;
                } else {
                    statusContainer = saleOpts; // default to sale
                }
            }
            if (statusContainer) {
                var statusChecks = _activeOnly(statusContainer.querySelectorAll('[data-field="StandardStatus"]:checked:not(:disabled)'));
                if (statusChecks.length > 0) {
                    criteria.statuses = [];
                    statusChecks.forEach(function(cb) {
                        var val = cb.getAttribute('data-value');
                        var sub = cb.getAttribute('data-sub-status');
                        if (sub) {
                            // Old MlsStatus sub-status: sent only when live fields express it (server SUB_STATUSES;
                            // init-disable-dead-controls.js disables the rest), never as a StandardStatus.
                            if (_LIVE_SUB_STATUSES[sub]) criteria.statuses.push(sub);
                            return;
                        } else if (val) {
                            // Handle comma-separated values (e.g., "Withdrawn,Canceled,Expired,Hold")
                            var parts = val.split(',');
                            parts.forEach(function(part) {
                                var s = part.trim();
                                // Map to uppercase
                                if (s === 'Active' || s === 'BackOnMarket') criteria.statuses.push('ACTIVE');
                                else if (s === 'ComingSoon') criteria.statuses.push('COMING_SOON');
                                else if (s === 'Future') criteria.statuses.push('FUTURE');
                                else if (s === 'Pending') criteria.statuses.push('PENDING');
                                else if (s === 'Closed') criteria.statuses.push('CLOSED');
                                else if (s === 'Withdrawn') criteria.statuses.push('WITHDRAWN');
                                else if (s === 'Canceled') criteria.statuses.push('CANCELED');
                                else if (s === 'Expired') criteria.statuses.push('EXPIRED');
                                else if (s === 'Hold') criteria.statuses.push('HOLD');
                                else if (s === 'Incomplete') criteria.statuses.push('INCOMPLETE');
                                else criteria.statuses.push(s.toUpperCase());
                            });
                        }
                    });
                }
            }

            // Address / building name — collect from whichever form is active
            var addressInputId = currentSearchTab === 'rent' ? 'rentalSearchAddress' :
                                 currentSearchTab === 'building' ? 'buildingSearchAddress' : 'saleSearchAddress';
            var addressInput = document.getElementById(addressInputId);
            // Also check advanced mode address
            var advAddr = document.getElementById('advancedSearchAddress');
            var advancedMode2 = document.getElementById('searchAdvancedMode');
            if (advancedMode2 && advancedMode2.style.display !== 'none' && advAddr && advAddr.value.trim()) {
                addressInput = advAddr;
            }
            if (addressInput && addressInput.value.trim()) {
                criteria.address = addressInput.value.trim();
            }

            // Neighborhood autocomplete tags — read from active tags container.
            // The autocomplete dropdown lists every NYC neighborhood AND each
            // borough as a top-level "Borough" chip. We must split the two so
            // borough chips drive `criteria.borough` (-> OData CityRegion) and
            // neighborhood chips drive `criteria.neighborhoods` (-> OData
            // SubdivisionName). The split happens in
            // neighborhood-autocomplete.js getSelectedNeighborhoods /
            // getSelectedBoroughs so the consumer here is unambiguous.
            if (typeof getSelectedNeighborhoods === 'function') {
                var tagsId = _resolveActiveNeighborhoodTagsId();
                var selectedNeighborhoods = getSelectedNeighborhoods(tagsId);
                // Text typed in the neighborhood box but not picked from the list used to be ignored, so
                // "Yorkville" + Search ran every sale in the city (found 2026-10-26). An exact live
                // neighborhood name becomes a tag; anything else is refused with a message.
                var _nbPrefix = currentSearchTab === 'rent' ? 'rental' : currentSearchTab === 'building' ? 'building' : 'sale';
                var _nbInput = document.getElementById(_isAdvanced ? 'advancedNeighborhoodInput' : _nbPrefix + 'NeighborhoodInput');
                var _nbText = _nbInput && _nbInput.value ? _nbInput.value.trim() : '';
                if (_nbText && _explicitCollect) {
                    var _nbKey = _nbText.toLowerCase().replace(/[^a-z0-9]/g, '');
                    var _inv = typeof liveGeography === 'function' ? liveGeography() : null;
                    var _hit = _inv && _inv.catalog ? _inv.catalog.find(function (c) { return c.key === _nbKey || (c.spellings || []).some(function (sp) { return String(sp).toLowerCase().replace(/[^a-z0-9]/g, '') === _nbKey; }); }) : null;
                    if (_hit && selectedNeighborhoods.indexOf(_hit.name) === -1 && typeof selectNeighborhood === 'function') {
                        selectNeighborhood(_hit.name, _hit.boroughDisplay, false, (_isAdvanced ? 'advanced' : _nbPrefix) + 'NeighborhoodDropdown', tagsId);
                        selectedNeighborhoods = getSelectedNeighborhoods(tagsId);
                    } else if (!_hit && selectedNeighborhoods.indexOf(_nbText) === -1) {
                        showToast('"' + _nbText + '" is not a live neighborhood name — pick it from the list.', 'warning');
                        _nbInput.value = '';
                        // Refused, not dropped: performSearch stops here instead of searching the whole city
                        criteria._refused = 'neighborhood';
                    }
                }
                if (selectedNeighborhoods.length > 0) {
                    criteria.neighborhoods = selectedNeighborhoods;
                }

                // Borough chips: exact live CityRegion values, any number of them (OR on the server).
                // A neighborhood is searched by its live name only — Cotality files some names under
                // several boroughs, so no borough is implied from a neighborhood.
                var selectedBoroughs = (typeof getSelectedBoroughs === 'function')
                    ? getSelectedBoroughs(tagsId)
                    : [];
                if (selectedBoroughs.length > 0) criteria.borough = selectedBoroughs.join(',');
            }

            // Quick Search fields — RLS ID and Zip. Each basic form has its own pair (saleQuickRls,
            // rentalQuickRls, buildingQuickRls …); advanced search has adv-rls-id / adv-zip. The basic
            // forms' Unit, Keywords and Management Company boxes carry data-field + data-text and are
            // collected by the generic scanner below (UnitNumber, PublicRemarks, ListOfficeName).
            var _quickPrefix = currentSearchTab === 'rent' ? 'rental' : currentSearchTab === 'building' ? 'building' : 'sale';
            var rlsInput = document.getElementById(_isAdvanced ? 'adv-rls-id' : _quickPrefix + 'QuickRls');
            var zipInput = document.getElementById(_isAdvanced ? 'adv-zip' : _quickPrefix + 'QuickZip');
            if (rlsInput && rlsInput.value.trim()) criteria.rlsId = rlsInput.value.trim();
            if (zipInput && zipInput.value.trim()) criteria.zip = zipInput.value.trim();

            // Advanced search: keyword (PublicRemarks contains) and management company (ListOfficeName contains)
            var keywordEl = _isAdvanced ? document.getElementById('adv-keyword') : null;
            if (keywordEl && keywordEl.value.trim()) {
                criteria.keyword = keywordEl.value.trim();
            }
            var mgmtEl = _isAdvanced ? document.getElementById('adv-management') : null;
            if (mgmtEl && mgmtEl.value.trim()) {
                criteria.managementCompany = mgmtEl.value.trim();
            }

            // Agent / office pickers (advanced mode): primary and co-list sides are separate filters over live Cotality fields.
            if (_isAdvanced && window.AgentOfficeSearch) {
                var _aoTokens = window.AgentOfficeSearch.collect();
                Object.keys(_aoTokens).forEach(function(k) { criteria[k] = _aoTokens[k]; });
                var _aoState = window.AgentOfficeSearch.getState();
                if (Object.keys(_aoState).length > 0) criteria.agentOffice = _aoState;
            }

            // Building Financing % (MaximumFinancingPercent on CRM, BuyerFinancing on Trestle)
            var finMinId = currentSearchTab === 'rent' ? 'rentalBuildingFinancingMin' :
                           currentSearchTab === 'building' ? 'buildingFinancingMin' : 'saleBuildingFinancingMin';
            var finMinEl = document.getElementById(finMinId);
            if (finMinEl && finMinEl.value) {
                var fv = parseInt(finMinEl.value);
                if (!isNaN(fv) && fv > 0) criteria.financingMin = fv;
            }

            // Date range filters — read from .drp-wrapper[data-from]/[data-to] attributes
            // Dates stored as MM/DD/YYYY, convert to YYYY-MM-DD (ISO) for OData API
            // The pickers live in the Sales and Rentals basic forms. The Buildings form has none, and
            // advanced search has its own date controls (collected by live field name below), so the
            // hidden basic-form pickers are never read for those searches.
            var drpPrefix = _isAdvanced ? null : currentSearchTab === 'rent' ? 'rental' : currentSearchTab === 'sale' ? 'sale' : null;
            var _drp = function(name) { return drpPrefix ? document.querySelector('[data-drp="' + drpPrefix + name + '"]') : null; };

            // Listed/Updated date range
            var activityTypeEl = drpPrefix ? document.getElementById(drpPrefix === 'rental' ? 'rentalListingActivityType' : 'saleListingActivityType') : null;
            var activityType = activityTypeEl ? activityTypeEl.value : '';
            var listedDrp = _drp('ListedUpdated');
            // A date range picked without an activity type was silently ignored (found 2026-10-26).
            // Default to "Listed" and show that choice in the select.
            if (listedDrp && !activityType && listedDrp.getAttribute('data-from')) {
                activityType = 'Listed';
                if (activityTypeEl) activityTypeEl.value = 'Listed';
            }
            if (listedDrp && activityType) {
                var fromStr = listedDrp.getAttribute('data-from');
                var toStr = listedDrp.getAttribute('data-to');
                if (fromStr) {
                    criteria.dateActivityType = activityType; // 'Listed', 'Updated', or 'ListedAndUpdated'
                    criteria.dateFrom = _mdyToISO(fromStr);
                    criteria.dateTo = _mdyToISO(toStr) || _mdyToISO(fromStr);
                }
            }

            // Contract/Lease Signed date range
            var signedDrp = _drp(drpPrefix === 'rental' ? 'LeaseSigned' : 'ContractSigned');
            if (signedDrp) {
                var sFrom = signedDrp.getAttribute('data-from');
                var sTo = signedDrp.getAttribute('data-to');
                if (sFrom) {
                    criteria.contractDateFrom = _mdyToISO(sFrom);
                    criteria.contractDateTo = _mdyToISO(sTo) || _mdyToISO(sFrom);
                }
            }

            // Open House date range (Cotality's OpenHouse resource: Public, Active events in the range)
            var ohDrp = document.querySelector('[data-drp="' + drpPrefix + 'OpenHouse"]');
            if (ohDrp) {
                var ohFrom = ohDrp.getAttribute('data-from');
                var ohTo = ohDrp.getAttribute('data-to');
                if (ohFrom) {
                    criteria.openHouseDateFrom = _mdyToISO(ohFrom);
                    criteria.openHouseDateTo = _mdyToISO(ohTo) || _mdyToISO(ohFrom);
                }
            }

            // Sold/Rented date range
            var soldDrp = _drp(drpPrefix === 'rental' ? 'RentedDate' : 'SoldDate');
            if (soldDrp) {
                var sdFrom = soldDrp.getAttribute('data-from');
                var sdTo = soldDrp.getAttribute('data-to');
                if (sdFrom) {
                    criteria.soldDateFrom = _mdyToISO(sdFrom);
                    criteria.soldDateTo = _mdyToISO(sdTo) || _mdyToISO(sdFrom);
                }
            }

            // Open House date range (presets fill the same picker)
            var ohDrp = _drp('OpenHouse');
            if (ohDrp && ohDrp.getAttribute('data-from')) {
                criteria.openHouseDateFrom = _mdyToISO(ohDrp.getAttribute('data-from'));
                criteria.openHouseDateTo = _mdyToISO(ohDrp.getAttribute('data-to')) || criteria.openHouseDateFrom;
            }

            // Building-specific filters (OData: YearBuilt, StoriesTotal, NumberOfUnitsTotal)
            var yearMinEl, yearMaxEl, unitsMinEl, unitsMaxEl, floorsMinEl, floorsMaxEl;
            if (_isAdvanced) {
                yearMinEl = document.getElementById('adv-year-built-from');
                yearMaxEl = document.getElementById('adv-year-built-to');
                unitsMinEl = document.getElementById('adv-bldg-units-min');
                unitsMaxEl = document.getElementById('adv-bldg-units-max');
                floorsMinEl = document.getElementById('adv-floors-min');
                floorsMaxEl = document.getElementById('adv-floors-max');
            } else if (currentSearchTab === 'building') {
                yearMinEl = document.getElementById('buildingMinYear');
                yearMaxEl = document.getElementById('buildingMaxYear');
                unitsMinEl = document.getElementById('buildingMinUnits');
                unitsMaxEl = document.getElementById('buildingMaxUnits');
                floorsMinEl = document.getElementById('buildingMinFloors');
                floorsMaxEl = document.getElementById('buildingMaxFloors');
            } else if (currentSearchTab === 'sale') {
                yearMinEl = document.getElementById('saleBuildingMinYear');
                yearMaxEl = document.getElementById('saleBuildingMaxYear');
                unitsMinEl = document.getElementById('saleBuildingMinUnits');
                unitsMaxEl = document.getElementById('saleBuildingMaxUnits');
                floorsMinEl = document.getElementById('saleBuildingMinFloors');
                floorsMaxEl = document.getElementById('saleBuildingMaxFloors');
            } else {
                yearMinEl = document.getElementById('rentalBuildingMinYear');
                yearMaxEl = document.getElementById('rentalBuildingMaxYear');
                unitsMinEl = document.getElementById('rentalBuildingMinUnits');
                unitsMaxEl = document.getElementById('rentalBuildingMaxUnits');
                floorsMinEl = document.getElementById('rentalBuildingMinFloors');
                floorsMaxEl = document.getElementById('rentalBuildingMaxFloors');
            }
            if (yearMinEl && yearMinEl.value && yearMinEl.value !== '') {
                var ym = parseInt(yearMinEl.value);
                if (!isNaN(ym)) criteria.yearMin = ym;
            }
            if (yearMaxEl && yearMaxEl.value && yearMaxEl.value !== '') {
                var ymx = parseInt(yearMaxEl.value);
                if (!isNaN(ymx)) criteria.yearMax = ymx;
            }
            if (unitsMinEl && unitsMinEl.value && unitsMinEl.value !== '') {
                var um = parseInt(unitsMinEl.value);
                if (!isNaN(um)) criteria.unitsMin = um;
            }
            if (unitsMaxEl && unitsMaxEl.value && unitsMaxEl.value !== '') {
                var umx = parseInt(unitsMaxEl.value);
                if (!isNaN(umx)) criteria.unitsMax = umx;
            }
            if (floorsMinEl && floorsMinEl.value && floorsMinEl.value !== '') {
                var fm = parseInt(floorsMinEl.value);
                if (!isNaN(fm)) criteria.floorsMin = fm;
            }
            if (floorsMaxEl && floorsMaxEl.value && floorsMaxEl.value !== '') {
                var fmx = parseInt(floorsMaxEl.value);
                if (!isNaN(fmx)) criteria.floorsMax = fmx;
            }

            // Building name search — only from a dedicated name box. The building tab's address box is
            // already collected as criteria.address above; it must not also be required as BuildingName
            // (null on more than half of live rows), or "333 E 46th Street" returns nothing. A typed name
            // without a house number ("The Dakota") still reaches BuildingName through the address clause.
            var buildingNameEl = document.getElementById('buildingNameSearch');
            if (buildingNameEl && buildingNameEl.value.trim() && currentSearchTab === 'building') {
                criteria.buildingName = buildingNameEl.value.trim();
            }

            // Transit — subway line proximity search via station coordinates

            // Manhattan Grid — bounding box search via lat/lng

            // ═══════════════════════════════════════════════════════════
            // GENERIC data-field CHECKBOX SCANNER
            // Collects ALL checked checkboxes with data-field/data-value
            // that aren't already handled above.
            // ═══════════════════════════════════════════════════════════
            // data-field is the live Cotality field (or REBNY CustomFields key); data-value is a
            // live LookupValue, "Any", or an operator value (lte:1946). data-not marks a
            // "does not allow" box (sent as not:VALUE). data-group joins boxes on different
            // fields into one OR group. Disabled controls are never collected.
            var _handledFields = { 'StandardStatus': 1, 'CommonInterest': 1, 'PropertySubType': 1 };

            // Determine container: advanced mode if visible, else active basic form
            var _scanContainer = activeBasicForm;
            var _advMode = document.getElementById('searchAdvancedMode');
            if (_advMode && _advMode.style.display !== 'none' && !_advMode.classList.contains('hidden')) {
                _scanContainer = _advMode;
            }

            if (_scanContainer) {
                var _checkboxFilters = {};
                var _checkboxGroups = {};
                var _addValue = function(target, field, val) {
                    if (!target[field]) target[field] = [];
                    if (target[field].indexOf(val) === -1) target[field].push(val);
                };
                var _allChecked = _activeOnly(_scanContainer.querySelectorAll('input[data-field]:checked:not(:disabled):not([data-range]):not([data-text])'));
                for (var _ci = 0; _ci < _allChecked.length; _ci++) {
                    var _cb = _allChecked[_ci];
                    var _field = _cb.getAttribute('data-field');
                    var _group = _cb.getAttribute('data-group');
                    if (_handledFields[_field] && !_group) continue;
                    var _not = _cb.getAttribute('data-not');
                    var _val = _not ? 'not:' + _not : (_cb.getAttribute('data-value') || '');
                    if (!_val) continue;
                    if (_group) {
                        if (!_checkboxGroups[_group]) _checkboxGroups[_group] = {};
                        _addValue(_checkboxGroups[_group], _field, _val);
                    } else {
                        _addValue(_checkboxFilters, _field, _val);
                    }
                }
                // Scan <select> elements with data-field (a chosen value; ranges are read below)
                _activeOnly(_scanContainer.querySelectorAll('select[data-field]:not(:disabled):not([data-range])')).forEach(function(sel) {
                    if (sel.selectedIndex <= 0 || sel.value === 'custom') return;
                    var _field = sel.getAttribute('data-field');
                    if (_handledFields[_field]) return;
                    if (_field && sel.value) _addValue(_checkboxFilters, _field, sel.value);
                });
                // Min / max inputs and dropdowns (data-range) and text boxes (data-text), by live field name
                var _fieldRanges = {}, _fieldText = {};
                _activeOnly(_scanContainer.querySelectorAll('[data-field][data-range]:not(:disabled)')).forEach(function(inp) {
                    var v = String(inp.value || '').replace(/[$,%\s]/g, '');
                    if (v === '' || v === 'custom') return;
                    var f = inp.getAttribute('data-field');
                    _fieldRanges[f] = _fieldRanges[f] || {};
                    _fieldRanges[f][inp.getAttribute('data-range')] = v;
                });
                _activeOnly(_scanContainer.querySelectorAll('input[data-field][data-text]:not(:disabled)')).forEach(function(inp) {
                    if (inp.value.trim()) _fieldText[inp.getAttribute('data-field')] = inp.value.trim();
                });
                // Neighborhood tree (generated from live Cotality): a ticked borough sends its exact
                // CityRegion value and covers its neighborhoods; a ticked neighborhood sends its live
                // name, which the server expands to every live spelling.
                var _tree = _scanContainer.querySelector('.neighborhood-tree');
                if (_tree) {
                    var _tickedBoroughs = [];
                    _activeOnly(_tree.querySelectorAll('summary input[data-borough]:checked')).forEach(function(cb) {
                        _tickedBoroughs.push(cb.getAttribute('data-borough'));
                    });
                    if (_tickedBoroughs.length) {
                        var _chipBoroughs = criteria.borough ? criteria.borough.split(',') : [];
                        criteria.borough = _chipBoroughs.concat(_tickedBoroughs.filter(function(b) { return _chipBoroughs.indexOf(b) === -1; })).join(',');
                    }
                    _activeOnly(_tree.querySelectorAll('label input[type="checkbox"]:checked')).forEach(function(cb) {
                        var name = cb.getAttribute('data-neighborhood') || (cb.parentElement.textContent || '').trim();
                        if (!name) return;
                        var ownBorough = cb.closest('details');
                        var boroughBox = ownBorough ? ownBorough.querySelector('summary input[data-borough]') : null;
                        if (boroughBox && boroughBox.checked) return; // the whole borough is already searched
                        criteria.neighborhoods = criteria.neighborhoods || [];
                        if (criteria.neighborhoods.indexOf(name) === -1) criteria.neighborhoods.push(name);
                    });
                }

                if (Object.keys(_checkboxFilters).length > 0) criteria.checkboxFilters = _checkboxFilters;
                if (Object.keys(_checkboxGroups).length > 0) criteria.checkboxGroups = _checkboxGroups;
                if (Object.keys(_fieldRanges).length > 0) criteria.fieldRanges = _fieldRanges;
                if (Object.keys(_fieldText).length > 0) criteria.fieldText = _fieldText;
            }


            return criteria;
        }

        function clearWorkingClient() {
            var banner = document.getElementById('workingWithClientBanner');
            if (banner) banner.classList.add('hidden');
            var label = document.getElementById('workingClientLabel');
            if (label) label.textContent = '';
            var info = document.getElementById('workingClientInfo');
            if (info) info.textContent = '';
            try { sessionStorage.removeItem('workingClient'); } catch(e) {}
        }

        function clearSearchForm() {
            // Reset every basic form (Sales, Rentals, Buildings)
            var forms = [BASIC_FORM_IDS.sale, BASIC_FORM_IDS.rent, BASIC_FORM_IDS.building];
            forms.forEach(function(formId) {
                var form = document.getElementById(formId);
                if (!form) return;

                // selectedIndex 0 also leaves a "Custom" box's typing mode (syncCustomSelects below)
                form.querySelectorAll('select').forEach(function(sel) { sel.selectedIndex = 0; });
                form.querySelectorAll('input[type="checkbox"]').forEach(function(cb) { cb.checked = false; });
                form.querySelectorAll('input[type="text"], input[type="number"], input[type="date"]').forEach(function(inp) { inp.value = ''; });
            });
            // Also clear advanced mode checkboxes
            var advMode = document.getElementById('searchAdvancedMode');
            if (advMode) {
                advMode.querySelectorAll('input[type="checkbox"]').forEach(function(cb) { cb.checked = false; });
                advMode.querySelectorAll('select').forEach(function(sel) { sel.selectedIndex = 0; });
                // Date ranges (listed / updated / contract / sold … from–to) are inputs of type date: left
                // out here they leaked into every later search as fieldRanges (found 2026-10-26).
                advMode.querySelectorAll('input[type="text"], input[type="number"], input[type="date"]').forEach(function(inp) { inp.value = ''; });
            }
            // Building-status facets back to "match all ticked" (AND) in every search form
            forms.concat(['searchAdvancedMode']).forEach(function (formId) {
                var form = document.getElementById(formId);
                if (!form) return;
                form.querySelectorAll('[data-facet-group]').forEach(function (box) { if (typeof setFacetMatch === 'function') setFacetMatch(box, 'all'); });
            });
            // Re-check the default "Active" status in each form. Status is StandardStatus (Cotality
            // suppresses MlsStatus); the first plain Active box of each form is the default one.
            ['#searchBasicMode', '#searchBasicModeRental', '#searchBasicModeBuilding', '#saleStatusOptions', '#rentalStatusOptions'].forEach(function (scope) {
                var cb = document.querySelector(scope + ' [data-field="StandardStatus"][data-value="Active"]:not([data-sub-status])');
                if (cb) cb.checked = true;
            });
            // Clear neighborhood tags and internal selection state
            if (typeof clearAllNeighborhoods === 'function') clearAllNeighborhoods();
            if (window.AgentOfficeSearch) window.AgentOfficeSearch.clear();

            // Clear all date range pickers (reset data-from/data-to, trigger text, clear buttons)
            document.querySelectorAll('.drp-wrapper').forEach(function(wrapper) {
                wrapper.removeAttribute('data-from');
                wrapper.removeAttribute('data-to');
                var textEl = wrapper.querySelector('.drp-text');
                if (textEl) {
                    textEl.textContent = 'Select Date Range';
                    textEl.classList.remove('has-value');
                }
                var clearBtn = wrapper.querySelector('.drp-clear');
                if (clearBtn) clearBtn.style.display = 'none';
            });

            // Clear Open House preset button highlighting
            document.querySelectorAll('.oh-preset').forEach(function(btn) {
                btn.classList.remove('bg-blue-100', 'border-blue-400', 'text-blue-700');
            });

            // Clear saved search state when form is cleared
            if (typeof _clearSearchState === 'function') _clearSearchState();
            // The custom dropdown boxes show the cleared selects (init-ui.js)
            if (typeof syncCustomSelects === 'function') syncCustomSelects();
            // Update filter count after clearing
            updateFilterCount();
        }

        // ── Filter count for sticky search bar ──
        function updateFilterCount() {
            var count = 0;
            var advForm = document.getElementById('searchAdvancedMode');
            var form = (advForm && advForm.style.display !== 'none' && !advForm.classList.contains('hidden'))
                ? advForm : document.getElementById(activeBasicFormId());
            if (!form) return;
            form.querySelectorAll('select').forEach(function(s) { if (s.selectedIndex > 0) count++; });
            form.querySelectorAll('input[type="text"], input[type="number"]').forEach(function(i) { if (i.value.trim()) count++; });
            form.querySelectorAll('input[type="checkbox"]:checked').forEach(function(cb) {
                if (cb.getAttribute('data-field') === 'StandardStatus' && cb.getAttribute('data-value') === 'Active') return;
                count++;
            });
            form.querySelectorAll('.drp-wrapper[data-from]').forEach(function(w) {
                if (w.getAttribute('data-from')) count++;
            });
            if (window.AgentOfficeSearch) count += window.AgentOfficeSearch.chosenCount();
            var el = document.getElementById('activeFilterCount');
            if (el) el.textContent = count === 0 ? 'No filters' : count + ' filter' + (count > 1 ? 's' : '') + ' applied';
        }

        // Wire filter count to form changes (delegated)
        var SEARCH_FORM_SELECTOR = '#searchBasicMode, #searchBasicModeRental, #searchBasicModeBuilding, #searchAdvancedMode';
        document.addEventListener('change', function(e) {
            if (e.target.closest(SEARCH_FORM_SELECTOR)) updateFilterCount();
        });
        document.addEventListener('input', function(e) {
            if (e.target.closest(SEARCH_FORM_SELECTOR) && (e.target.type === 'text' || e.target.type === 'number')) {
                clearTimeout(window._filterCountDebounce);
                window._filterCountDebounce = setTimeout(updateFilterCount, 300);
            }
        });

        // Enter key triggers search (when in search form, not textarea)
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.target.closest('textarea') && !e.target.closest('.modal, [role="dialog"]')) {
                // Enter in a neighborhood box with suggestions open picks the suggestion (neighborhood-autocomplete.js)
                var _nbDropdown = e.target.id && /NeighborhoodInput$/.test(e.target.id) ? document.getElementById(e.target.id.replace('Input', 'Dropdown')) : null;
                if (_nbDropdown && !_nbDropdown.classList.contains('hidden')) return;
                var sectionMain = document.getElementById('section-main');
                if (sectionMain && sectionMain.style.display !== 'none') {
                    var formContainer = document.getElementById('searchFormContainer');
                    if (formContainer && formContainer.style.display !== 'none') {
                        e.preventDefault();
                        performSearch();
                    }
                }
            }
        });

        // Neighborhood tree: parent-child cascade
        // Checking a borough/region auto-checks all children; unchecking clears all children
        function initNeighborhoodCascade() {
            document.querySelectorAll('.neighborhood-tree').forEach(function(tree) {
                tree.addEventListener('change', function(e) {
                    var cb = e.target;
                    if (cb.type !== 'checkbox') return;

                    // Is this a parent checkbox (inside a <summary>)?
                    var summary = cb.closest('summary');
                    if (summary) {
                        // Find the parent <details> element
                        var details = summary.parentElement;
                        if (details && details.tagName === 'DETAILS') {
                            // Check/uncheck all child checkboxes inside this <details>
                            var children = details.querySelectorAll('input[type="checkbox"]');
                            children.forEach(function(child) {
                                if (child !== cb) child.checked = cb.checked;
                            });
                        }
                    }

                    // Center map + draw/remove polygon when checked/unchecked
                    // Determine which search form map this checkbox belongs to
                    var sfType = typeof getSFMapType === 'function' ? getSFMapType(cb) : null;

                    var label = cb.closest('label');
                    if (label) {
                        var nbName = label.textContent.trim();
                        // Skip parent borough labels (they cascade to children)
                        var isBoroughParent = cb.closest('summary') !== null;
                        // Detect borough from parent <details> summary text
                        var _borough = '';
                        var _parentDetails = cb.closest('details');
                        if (_parentDetails) {
                            var _parentSummary = _parentDetails.querySelector(':scope > summary');
                            // Live tree: the borough box carries the live CityRegion value; show the display name
                            var _boroughBox = _parentSummary ? _parentSummary.querySelector('input[data-borough]') : null;
                            if (_boroughBox) _borough = (typeof geoBoroughOf === 'function' && geoBoroughOf(nbName)) || _boroughBox.getAttribute('data-borough');
                            else
                            if (_parentSummary) _borough = _parentSummary.textContent.trim().replace(/[\u25B6\u25BC▸▾►▼\s]+/g, ' ').trim();
                        }

                        if (cb.checked) {
                            if (typeof toggleNeighborhoodPolygon === 'function') {
                                toggleNeighborhoodPolygon(nbName, true);
                            }
                            // ADD to neighborhood tags so collectSearchCriteria picks it up
                            if (!isBoroughParent && typeof selectNeighborhood === 'function') {
                                var tagsId = _resolveActiveNeighborhoodTagsId();
                                var dropdownId = tagsId.replace('Tags', 'Dropdown');
                                selectNeighborhood(nbName, _borough, false, dropdownId, tagsId);
                            }
                            // Search form map
                            if (sfType && typeof toggleSFPolygon === 'function') {
                                toggleSFPolygon(sfType, nbName, true);
                                if (typeof sfMapCenterOnNeighborhood === 'function') {
                                    sfMapCenterOnNeighborhood(sfType, nbName);
                                }
                            }
                        } else {
                            if (typeof toggleNeighborhoodPolygon === 'function') {
                                toggleNeighborhoodPolygon(nbName, false);
                            }
                            // REMOVE from neighborhood tags
                            if (!isBoroughParent && typeof removeNeighborhoodTag === 'function') {
                                var tagsId = _resolveActiveNeighborhoodTagsId();
                                removeNeighborhoodTag(nbName, tagsId);
                            }
                            if (sfType && typeof toggleSFPolygon === 'function') {
                                toggleSFPolygon(sfType, nbName, false);
                            }
                        }
                    }

                    // Also handle parent checkbox toggling children polygons
                    var summary = cb.closest('summary');
                    if (summary) {
                        var details = summary.parentElement;
                        if (details && details.tagName === 'DETAILS') {
                            details.querySelectorAll('label').forEach(function(lbl) {
                                var childName = lbl.textContent.trim();
                                if (typeof toggleNeighborhoodPolygon === 'function') {
                                    toggleNeighborhoodPolygon(childName, cb.checked);
                                }
                                if (sfType && typeof toggleSFPolygon === 'function') {
                                    toggleSFPolygon(sfType, childName, cb.checked);
                                }
                            });
                        }
                    }

                    // Parent state: checked only when every child is checked (then the whole borough is
                    // searched), mixed when some are — so ticking one neighborhood never ticks its borough.
                    if (summary) cb.indeterminate = false;
                    var parentDetails = cb.closest('details');
                    if (parentDetails) {
                        var parentSummary = parentDetails.querySelector(':scope > summary > input[type="checkbox"]');
                        if (parentSummary && parentSummary !== cb) {
                            var allChildren = parentDetails.querySelectorAll('input[type="checkbox"]');
                            var anyChecked = false, allChecked = true;
                            allChildren.forEach(function(child) {
                                if (child === parentSummary) return;
                                if (child.checked) anyChecked = true; else allChecked = false;
                            });
                            parentSummary.checked = anyChecked && allChecked;
                            parentSummary.indeterminate = anyChecked && !allChecked;
                        }
                    }
                });
            });
        }
        // Initialize cascade on page load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initNeighborhoodCascade);
        } else {
            initNeighborhoodCascade();
        }

        // Building-status facets (Resale / New Development / Sponsor Unit) are independent live
        // criteria: NewConstructionYN (Cotality) and the REBNY SponsorUnitYN key. "Match all ticked"
        // (the default) AND-s them; "any ticked" joins the box's checkboxes with one data-group, so the
        // server builds a single OR group across the fields and a listing that is both appears once.
        function applyFacetMatch(radio) {
            var box = radio.closest('[data-facet-group]');
            if (!box) return;
            var any = radio.value === 'any' && radio.checked;
            var group = box.getAttribute('data-facet-group');
            box.querySelectorAll('input[type="checkbox"][data-field]').forEach(function (cb) {
                if (any) cb.setAttribute('data-group', group); else cb.removeAttribute('data-group');
            });
        }
        function setFacetMatch(box, mode) {
            var radio = box.querySelector('input[data-facet-match][value="' + mode + '"]');
            if (!radio) return;
            radio.checked = true;
            applyFacetMatch(radio);
        }
        function initFacetMatchToggles() {
            document.querySelectorAll('input[data-facet-match]').forEach(function (r) {
                r.addEventListener('change', function () { applyFacetMatch(r); });
            });
            // A sub-status box (Back On Market, Sold Thru Us …) narrows its parent status. With the plain
            // parent box still ticked the request was "parent OR sub-status" = the parent, so the tick
            // changed nothing (found 2026-10-26): untick the plain parent box when a sub-status is ticked.
            document.addEventListener('change', function (e) {
                var cb = e.target;
                if (!cb || !cb.matches || !cb.matches('input[type="checkbox"][data-field="StandardStatus"][data-sub-status]') || !cb.checked) return;
                var form = cb.closest('#searchBasicMode, #searchBasicModeRental, #searchBasicModeBuilding, #searchAdvancedMode') || document;
                form.querySelectorAll('input[type="checkbox"][data-field="StandardStatus"][data-value="' + cb.dataset.value + '"]:not([data-sub-status])').forEach(function (p) { p.checked = false; });
            });
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initFacetMatchToggles);
        } else {
            initFacetMatchToggles();
        }
        window.applyFacetMatch = applyFacetMatch;
        window.setFacetMatch = setFacetMatch;

        // Initialize transit search (subway line click handlers)
        if (typeof TransitSearch !== 'undefined') {
            TransitSearch.init();
        }

        // ── Display context ──
        // 'idx' = public IDX (default) | 'vow' = authenticated client portal | 'crm' = agent/broker.
        // Resolved at call time: the agent profile arrives asynchronously (MallanAPI.init), so a value
        // computed once at script load was 'idx' for every signed-in agent, and this variable was never
        // visible to the renderer or the compliance output (function scope). Shared through window.
        function mallanDisplayContext() {
            if (typeof LOGGED_IN_AGENT !== 'undefined' && LOGGED_IN_AGENT &&
                (LOGGED_IN_AGENT.id || LOGGED_IN_AGENT.role === 'agent' || LOGGED_IN_AGENT.role === 'broker')) return 'crm';
            try { if (localStorage.getItem('vow_display_context') === 'vow') return 'vow'; } catch (e) { /* storage blocked */ }
            return 'idx';
        }
        window.mallanDisplayContext = mallanDisplayContext;
        var searchDisplayContext = mallanDisplayContext();

        function filterListings(listings, criteria, displayContext) {
            // displayContext: 'idx' (default/public) | 'vow' (authenticated client) | 'crm' (agent/broker)
            displayContext = displayContext || mallanDisplayContext() || 'idx';

            return listings.filter(function(listing) {

                // ═══════════════════════════════════════════════════════════
                // REBNY DISTRIBUTION GATES — UCBA 2026 Art. I Sec. 4-5
                // These gates MUST be enforced BEFORE any other filter.
                // ═══════════════════════════════════════════════════════════

                var perm = listing.permissions || {};

                // Gate 1: Owner Opt-Out — NEVER display in ANY context (UCBA Art. I Sec. 4(A))
                if (perm.ownerOptOut === true) return false;

                // Gate 2: Participant Only — CRM only (authorized RLS participants)
                if (perm.participantOnly === true) {
                    if (displayContext !== 'crm') return false;
                }

                // Gate 3: Display context — IDX vs VOW vs CRM
                if (displayContext === 'idx') {
                    // IDX: both IDX and Internet gates must be true
                    if (listing.idxDisplayYN === false || perm.idxDisplay === false) return false;
                    if (listing.internetDisplayYN === false) return false;
                } else if (displayContext === 'vow') {
                    // VOW: only InternetEntireListingDisplayYN matters (IDX flag irrelevant)
                    if (listing.internetDisplayYN === false) return false;
                }
                // CRM: no Gate 3 filtering (authorized participant sees all except Owner Opt-Out)

                // Gate 4: Syndication — SyndicateYN controls third-party distribution.
                // In IDX search context, listing still appears but is flagged as non-syndicated.
                // The badge is rendered in the view layer (shared-badges.js → syndicationBadge).
                // No filtering here — syndication does NOT block IDX display.

                // Gate 5: Coming Soon — listing IS displayed in search results, but:
                // - "Coming Soon" badge is shown (view layer)
                // - Schedule Showing button is disabled (view layer)
                // - Text: "Coming Soon. No Showings or Open House until [date]" (view layer)
                // No filtering here — Coming Soon listings are visible in IDX search.

                // Gate 6 (public IDX / VOW display only): suppress listings closed > 24 hours.
                // The agent product keeps every closing Cotality serves — closed-sale search,
                // comparables and CMA depend on them (Master §5.1 Backend Agent Search).
                if (displayContext !== 'crm' && listing.status === 'CLOSED' && listing.closedDate) {
                    var closedTime = new Date(listing.closedDate).getTime();
                    var now = Date.now();
                    var hoursSinceClosed = (now - closedTime) / (1000 * 60 * 60);
                    if (hoursSinceClosed > 24) return false;
                }

                // ═══════════════════════════════════════════════════════════
                // Standard search filters
                // ═══════════════════════════════════════════════════════════

                // Search tab filter — only show sale or rental listings
                if (criteria.searchTab === 'rent' && listing.listingCategory !== 'rental') return false;
                if (criteria.searchTab === 'sale' && listing.listingCategory === 'rental') return false;

                // Price filter
                if (criteria.priceMin && listing.price < criteria.priceMin) return false;
                if (criteria.priceMax && listing.price > criteria.priceMax) return false;

                // Beds filter — explicit null check (beds=0 is valid for studios)
                if (criteria.bedsMin !== undefined && criteria.bedsMin !== null && listing.beds < criteria.bedsMin) return false;
                if (criteria.bedsMax !== undefined && criteria.bedsMax !== null && listing.beds > criteria.bedsMax) return false;

                // Baths filter — explicit null check (0 is valid)
                if (criteria.bathsMin !== undefined && criteria.bathsMin !== null && listing.baths < criteria.bathsMin) return false;
                if (criteria.bathsMax !== undefined && criteria.bathsMax !== null && listing.baths > criteria.bathsMax) return false;

                // Rooms filter — explicit null check (0 is valid)
                if (criteria.roomsMin !== undefined && criteria.roomsMin !== null && listing.rooms < criteria.roomsMin) return false;
                if (criteria.roomsMax !== undefined && criteria.roomsMax !== null && listing.rooms > criteria.roomsMax) return false;

                // Sqft filter — exclude listings with null/undefined sqft when filter is set
                if (criteria.sqftMin !== undefined && criteria.sqftMin !== null) {
                    if (!listing.intSqft && listing.intSqft !== 0) return false; // null sqft excluded
                    if (listing.intSqft < criteria.sqftMin) return false;
                }
                if (criteria.sqftMax !== undefined && criteria.sqftMax !== null) {
                    if (!listing.intSqft && listing.intSqft !== 0) return false;
                    if (listing.intSqft > criteria.sqftMax) return false;
                }

                // Ownership filter — exact raw provider match. null is not the enum value None.
                if (criteria.ownership && criteria.ownership.length > 0) {
                    if (listing.ownership === null || listing.ownership === undefined || listing.ownership === '') return false;
                    var rawOwnership = String(listing.ownership).toLowerCase();
                    var match = criteria.ownership.some(function(o) {
                        return rawOwnership === String(o).toLowerCase();
                    });
                    if (!match) return false;
                }

                // PropertySubType filter
                if (criteria.propertySubType) {
                    var pstValues = criteria.propertySubType.split(',').map(function(v) { return v.toLowerCase(); });
                    var sub = (listing.propertySubType || '').toLowerCase();
                    var pstMatch = pstValues.some(function(v) { return sub.indexOf(v) !== -1; });
                    if (!pstMatch) return false;
                }

                // Address / building name filter — partial match
                if (criteria.address) {
                    var normAddr = normalizeAddress(criteria.address);
                    var addrMatch = normalizeAddress(listing.address).indexOf(normAddr) !== -1;
                    var bldgMatch = listing.buildingName && normalizeAddress(listing.buildingName).indexOf(normAddr) !== -1;
                    if (!addrMatch && !bldgMatch) return false;
                }

                // Neighborhood filter — single value (Quick Search) or multi-select (tree/map)
                if (criteria.neighborhood) {
                    var nLower = criteria.neighborhood.toLowerCase();
                    var nHit = (listing.neighborhood && listing.neighborhood.toLowerCase().indexOf(nLower) !== -1)
                            || (listing.neighborhoodCanonical && listing.neighborhoodCanonical.toLowerCase().indexOf(nLower) !== -1);
                    if (!nHit) return false;
                }
                if (criteria.neighborhoods && criteria.neighborhoods.length > 0) {
                    var nLookup = {};
                    criteria.neighborhoods.forEach(function(n) { nLookup[n.toLowerCase()] = true; });
                    var nMatch = (listing.neighborhood && nLookup[listing.neighborhood.toLowerCase()])
                              || (listing.neighborhoodCanonical && nLookup[listing.neighborhoodCanonical.toLowerCase()]);
                    // Also check multi-canonical array (e.g. "Chelsea / Flatiron" → ["Chelsea", "Flatiron"])
                    if (!nMatch && listing.neighborhoodCanonicals) {
                        for (var nc = 0; nc < listing.neighborhoodCanonicals.length; nc++) {
                            if (nLookup[listing.neighborhoodCanonicals[nc].toLowerCase()]) { nMatch = true; break; }
                        }
                    }
                    if (!nMatch) return false;
                }

                // Status filter — check StandardStatus (listing.status) and the Mallan CRM sub-statuses
                if (criteria.statuses && criteria.statuses.length > 0) {
                    // Live-derived sub-statuses were applied exactly by the server; here they match their base status.
                    var _subBase = { BackOnMarket: 'active', Sold: 'closed', Rented: 'closed', SoldThruUs: 'closed', RentedThruUs: 'closed', NoFinancing: 'closed', Financed: 'closed', Future: 'incomplete' };
                    var statusMatch = criteria.statuses.some(function(s) {
                        var sl = (_subBase[s] || s).toLowerCase();
                        // Match against main status (ACTIVE, PENDING, CLOSED, etc.)
                        if (listing.status && listing.status.toLowerCase() === sl) return true;
                        // Match against the Mallan CRM sub-status (OfferOut, ContractSigned, BoardApproved, etc.)
                        if (listing.mlsStatus && listing.mlsStatus.toLowerCase().indexOf(sl) !== -1) return true;
                        return false;
                    });
                    if (!statusMatch) return false;
                }

                // RLS ID filter (comma-separated, check lid, wid, and id)
                if (criteria.rlsId) {
                    var ids = criteria.rlsId.split(',').map(function(s) { return s.trim().toLowerCase(); });
                    var idMatch = ids.some(function(id) {
                        return (listing.lid && listing.lid.toLowerCase() === id) ||
                               (listing.wid && listing.wid.toLowerCase() === id) ||
                               (String(listing.id) === id);
                    });
                    if (!idMatch) return false;
                }

                // Zip filter
                if (criteria.zip && listing.zip !== criteria.zip) return false;

                // Unit filter
                if (criteria.unit && listing.unit && listing.unit.toLowerCase() !== criteria.unit.toLowerCase()) return false;

                // Management Company filter — matches against ListOfficeName
                if (criteria.managementCompany) {
                    var mc = criteria.managementCompany.toLowerCase();
                    if (!listing.company || listing.company.toLowerCase().indexOf(mc) === -1) return false;
                }

                // Keyword filter — search in description (PublicRemarks)
                if (criteria.keyword) {
                    var kw = criteria.keyword.toLowerCase();
                    var desc = (listing.description || '').toLowerCase();
                    var addr = (listing.address || '').toLowerCase();
                    if (desc.indexOf(kw) === -1 && addr.indexOf(kw) === -1) return false;
                }

                // Date range filters
                if (criteria.dateFrom) {
                    var from = new Date(criteria.dateFrom);
                    var to = new Date(criteria.dateTo || criteria.dateFrom);
                    to.setHours(23, 59, 59); // include end date
                    var type = criteria.dateActivityType;
                    if (type === 'Listed' || type === 'ListedAndUpdated') {
                        var listed = listing.listedDate ? new Date(listing.listedDate) : null;
                        if (type === 'Listed') {
                            if (!listed || listed < from || listed > to) return false;
                        } else {
                            // ListedAndUpdated: either listed or updated must be in range
                            var updated = listing.updatedDate ? new Date(listing.updatedDate) : null;
                            var listedOk = listed && listed >= from && listed <= to;
                            var updatedOk = updated && updated >= from && updated <= to;
                            if (!listedOk && !updatedOk) return false;
                        }
                    } else if (type === 'Updated') {
                        var updated = listing.updatedDate ? new Date(listing.updatedDate) : null;
                        if (!updated || updated < from || updated > to) return false;
                    }
                }
                if (criteria.contractDateFrom) {
                    var cFrom = new Date(criteria.contractDateFrom);
                    var cTo = new Date(criteria.contractDateTo || criteria.contractDateFrom);
                    cTo.setHours(23, 59, 59);
                    var contractDate = listing.contractDate ? new Date(listing.contractDate) : null;
                    if (!contractDate || contractDate < cFrom || contractDate > cTo) return false;
                }
                if (criteria.soldDateFrom) {
                    var sFrom = new Date(criteria.soldDateFrom);
                    var sTo = new Date(criteria.soldDateTo || criteria.soldDateFrom);
                    sTo.setHours(23, 59, 59);
                    var closedDate = listing.closedDate ? new Date(listing.closedDate) : null;
                    if (!closedDate || closedDate < sFrom || closedDate > sTo) return false;
                }

                // Transit proximity filter — is listing near a selected subway station?

                // ═══════════════════════════════════════════════════════════
                // GENERIC CHECKBOX FILTER
                // Matches criteria.checkboxFilters against listing properties.
                // OR within a field (any value matches), AND across fields.
                // ═══════════════════════════════════════════════════════════
                if (criteria.checkboxFilters) {
                    // Map HTML data-field names → listing property names
                    // (where they differ between CRM HTML and Trestle/API)
                    var _fieldMap = {
                        'BuildingLaundryFeatures': 'LaundryFeatures',
                        'BuildingSecurityFeatures': 'SecurityFeatures',
                        'BuildingPoolFeatures': 'PoolFeatures',
                        'BuildingPetsAllowed': 'PetsAllowedYN',
                        'BuildingSmokeFreeYN': 'SmokeFree',
                        'LeaseType': 'AvailableLeaseType',
                        'ConstructionType': 'ConstructionMaterials',
                        'NewConstruction': 'NewConstructionYN',
                        'CRM': null // skip CRM-internal fields
                    };

                    // YN fields: filter checks for boolean true
                    var _ynFields = {
                        'LandLeaseYN': 1, 'CoolingYN': 1, 'GarageYN': 1,
                        'PetsAllowedYN': 1, 'NewConstructionYN': 1,
                        'BuildingSmokeFreeYN': 1, 'BuildingPetsAllowed': 1
                    };

                    for (var _fk in criteria.checkboxFilters) {
                        if (!criteria.checkboxFilters.hasOwnProperty(_fk)) continue;

                        // Skip CRM-internal or unmappable fields
                        if (_fieldMap[_fk] === null) continue;
                        // Linked-resource criteria ('OpenHouse/…') and presence / recency values are applied by the server only.
                        if (_fk.indexOf('/') !== -1) continue;
                        if ([].concat(criteria.checkboxFilters[_fk]).every(function (v) { return /^(notnull|isnull|within:|next:)/i.test(String(v)); })) continue;

                        // Skip distribution gate filters (handled above)
                        if (_fk === 'InternetEntireListingDisplayYN' || _fk === 'RLSParticipantOnly') continue;

                        var _vals = criteria.checkboxFilters[_fk];
                        var _propName = _fieldMap[_fk] || _fk;

                        // Resolve listing value — try exact prop, then lowercase first char
                        var _listVal = listing[_propName];
                        if (_listVal === undefined) {
                            var _lcProp = _propName.charAt(0).toLowerCase() + _propName.slice(1);
                            _listVal = listing[_lcProp];
                        }

                        // YN boolean fields
                        if (_ynFields[_fk]) {
                            var _wantTrue = _vals.indexOf('true') !== -1 || _vals.indexOf('Yes') !== -1;
                            var _wantFalse = _vals.indexOf('false') !== -1 || _vals.indexOf('No') !== -1;
                            if (_wantTrue && !_wantFalse) {
                                if (_listVal !== true && _listVal !== 'true' && _listVal !== 'Yes') return false;
                            } else if (_wantFalse && !_wantTrue) {
                                if (_listVal === true || _listVal === 'true' || _listVal === 'Yes') return false;
                            }
                            continue;
                        }

                        // ListOfficeMlsId — exact match for "my office" filter
                        if (_fk === 'ListOfficeMlsId') {
                            if (listing.company) {
                                // listing.company = ListOfficeName, not MlsId — skip server match
                                // This filter is best handled server-side via OData
                            }
                            continue;
                        }

                        // MaximumFinancingPercent — range filter, not checkbox match
                        if (_fk === 'MaximumFinancingPercent') continue;

                        // Skip if listing doesn't have this field (don't exclude — field may
                        // not be in API response yet; server-side OData handles it)
                        if (_listVal == null || _listVal === '') continue;

                        // Multi-value match: Trestle may return comma-separated values
                        // (e.g. "FullTimeDoorman,VirtualDoorman") or single values
                        var _listStr = String(_listVal).toLowerCase();
                        var _matched = false;
                        for (var _vi = 0; _vi < _vals.length && !_matched; _vi++) {
                            // A checkbox can carry several comma-joined values (the "Exclusive" box does): any one of them matches.
                            // ListingAgreement is a single-valued enum, so it is compared exactly ("exclusiveagency" is a substring of
                            // "coexclusiveagency"); the other fields keep their substring match.
                            var _alts = String(_vals[_vi]).toLowerCase().split(',');
                            for (var _ai = 0; _ai < _alts.length; _ai++) {
                                var _alt = _alts[_ai].trim();
                                if (!_alt) continue;
                                if (_fk === 'ListingAgreement' ? _listStr === _alt : _listStr.indexOf(_alt) !== -1) { _matched = true; break; }
                            }
                        }
                        if (!_matched) return false;
                    }
                }

                return true;
            });
        }

        function updateResultsCount() {
            // The sticky nav count is set when the results UI opens (before Cotality answers), so it read "0 results" next to "188 Results" (found 2026-10-26)
            if (typeof updateStickyNavActive === "function") setTimeout(updateStickyNavActive, 0);
            var filtered = searchResultsState.filteredListings || listings;
            var loadedCount = filtered.length;
            // "Search in results" and the flag filters narrow the loaded rows in Mallan's layer: count
            // what is on the page ("70 Results" sat over four cards — found 2026-10-27).
            var narrowed = !!(searchResultsState.textFilter && String(searchResultsState.textFilter).trim()) ||
                (typeof filterState !== 'undefined' && filterState.statusFilters && Object.keys(filterState.statusFilters).some(function(k) { return !!filterState.statusFilters[k]; }));
            var count = narrowed && typeof getFilteredListings === 'function' ? getFilteredListings(true).length : loadedCount;
            var perPage = searchResultsState.perPage || 50;
            var totalPages = Math.max(1, Math.ceil(count / perPage));

            // Update all results count elements (top + bottom). When Cotality has more
            // matches than are loaded, say so and offer the next page. Rows the agent removed
            // from the results come off the total too.
            var total = typeof searchResultsState.serverTotal === 'number'
                ? searchResultsState.serverTotal - (searchResultsState.removedCount || 0)
                : searchResultsState.serverTotal;
            var countEls = document.querySelectorAll('#resultsCount, #resultsCount2');
            countEls.forEach(function(el) {
                if (narrowed) {
                    el.textContent = count.toLocaleString() + ' of ' + loadedCount.toLocaleString() + ' Results (filtered)';
                } else if (typeof total === 'number' && total > count) {
                    el.innerHTML = count.toLocaleString() + ' of ' + total.toLocaleString() + ' Results ' +
                        '<button type="button" class="ml-2 underline text-blue-600" onclick="loadMoreSearchResults()">Load more</button>';
                } else {
                    el.textContent = count.toLocaleString() + ' Results';
                }
            });

            // Update top pagination
            var totalPagesEl = document.getElementById('totalPages');
            if (totalPagesEl) totalPagesEl.textContent = totalPages;

            var currentPageEl = document.getElementById('currentPage');
            if (currentPageEl) currentPageEl.textContent = searchResultsState.currentPage;

            // Update bottom pagination
            var bottomTotalPagesEl = document.getElementById('bottomTotalPages');
            if (bottomTotalPagesEl) bottomTotalPagesEl.textContent = totalPages;

            var bottomCurrentPageEl = document.getElementById('bottomCurrentPage');
            if (bottomCurrentPageEl) bottomCurrentPageEl.textContent = searchResultsState.currentPage;
        }

        // Back to search - show search form, hide results
        function backToSearch() {
            // Close refine panel if open
            var refinePanel = document.getElementById('refinePanel');
            if (refinePanel) { refinePanel.style.display = 'none'; _refinePanelOpen = false; }

            // Show the search form container
            var searchFormContainer = document.getElementById('searchFormContainer');
            if (searchFormContainer) searchFormContainer.style.display = 'block';

            // Restore the proper search mode display
            var _sm;
            try { _sm = sessionStorage.getItem('searchMode'); } catch(e) {}
            var isBasicMode = _sm !== 'advanced';

            var advancedMode = document.getElementById('searchAdvancedMode');

            // Show the current tab's basic form, or the advanced form
            _showBasicForms(isBasicMode);
            if (advancedMode) advancedMode.style.display = isBasicMode ? 'none' : 'block';

            // Hide search results section
            var searchResultsSection = document.getElementById('searchResultsSection');
            if (searchResultsSection) searchResultsSection.style.display = 'none';

            // Clear saved search state (user intentionally went back)
            _clearSearchState();

            // Update hash to reflect search form view
            history.pushState(null, '', '#main');

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // ─── INLINE REFINE PANEL ────────────────────────────────────────────
        // Lets users quickly adjust search criteria without leaving results.
        // Reads from activeSearchCriteria, syncs back to main form, re-runs search.
        // ─────────────────────────────────────────────────────────────────────

        var _refinePanelOpen = false;

        function toggleRefinePanel() {
            var panel = document.getElementById('refinePanel');
            if (!panel) return;
            _refinePanelOpen = !_refinePanelOpen;
            panel.style.display = _refinePanelOpen ? 'block' : 'none';
            // Update toggle button style
            var btn = document.getElementById('refineToggleBtn');
            if (btn) {
                if (_refinePanelOpen) {
                    btn.classList.add('text-blue-800');
                    btn.classList.remove('text-blue-600');
                } else {
                    btn.classList.remove('text-blue-800');
                    btn.classList.add('text-blue-600');
                }
            }
            if (_refinePanelOpen) populateRefinePanel();
        }

        var _REFINE_BOX_STATUSES = ['ACTIVE', 'COMING_SOON', 'PENDING', 'CONTRACT', 'UNDER_CONTRACT', 'CLOSED'];
        var _REFINE_STATUS_LABELS = { BackOnMarket: 'Back on Market', SoldThruUs: 'Sold Thru Us', RentedThruUs: 'Rented Thru Us', NoFinancing: 'No Financing', Financed: 'Financed', Sold: 'Sold', Rented: 'Rented', Future: 'Future' };
        function _refineKeptStatuses(c) {
            return ((c && c.statuses) || []).filter(function(s) { return _REFINE_BOX_STATUSES.indexOf(s) === -1; });
        }

        function populateRefinePanel() {
            var c = (typeof activeSearchCriteria !== 'undefined' && activeSearchCriteria) ? activeSearchCriteria : {};

            // Search type label
            var typeLabel = document.getElementById('refineSearchType');
            if (typeLabel) {
                var tab = c.searchTab || currentSearchTab || 'sale';
                typeLabel.textContent = tab === 'rent' ? 'Rentals' : tab === 'building' ? 'Buildings' : 'Sales';
            }

            // Price
            setSelectValue('refineMinPrice', c.priceMin || '');
            setSelectValue('refineMaxPrice', c.priceMax || '');

            // Beds
            setSelectValue('refineMinBeds', c.bedsMin != null ? c.bedsMin : '');
            setSelectValue('refineMaxBeds', c.bedsMax != null ? c.bedsMax : '');

            // Baths
            setSelectValue('refineMinBaths', c.bathsMin != null ? c.bathsMin : '');
            setSelectValue('refineMaxBaths', c.bathsMax != null ? c.bathsMax : '');

            // Remember what each box shows: a box the agent leaves alone keeps the criteria value even when
            // the presets cannot show it (a custom $1,234,567 floor came back from the panel as the nearest
            // preset, $1,000,000 — found 2026-10-27).
            ['refineMinPrice', 'refineMaxPrice', 'refineMinBeds', 'refineMaxBeds', 'refineMinBaths', 'refineMaxBaths'].forEach(function (id) {
                var box = document.getElementById(id);
                if (box) box.setAttribute('data-seed', box.value);
            });

            // Statuses
            var statuses = c.statuses || ['ACTIVE'];
            var el;
            el = document.getElementById('refineStatusActive');
            if (el) el.checked = statuses.indexOf('ACTIVE') !== -1;
            el = document.getElementById('refineStatusComingSoon');
            if (el) el.checked = statuses.indexOf('COMING_SOON') !== -1;
            el = document.getElementById('refineStatusPending');
            if (el) el.checked = statuses.indexOf('PENDING') !== -1;
            el = document.getElementById('refineStatusContract');
            if (el) el.checked = statuses.indexOf('CONTRACT') !== -1 || statuses.indexOf('UNDER_CONTRACT') !== -1;
            el = document.getElementById('refineStatusClosed');
            if (el) el.checked = statuses.indexOf('CLOSED') !== -1;
            // Statuses the panel has no box for are kept on apply; show them
            var kept = _refineKeptStatuses(c);
            var keptNote = document.getElementById('refineStatusKept');
            if (!keptNote && el && el.closest('label') && el.closest('label').parentElement) {
                keptNote = document.createElement('span');
                keptNote.id = 'refineStatusKept';
                keptNote.className = 'text-xs text-blue-700 font-medium';
                el.closest('label').parentElement.appendChild(keptNote);
            }
            if (keptNote) keptNote.textContent = kept.length ? 'Also searching: ' + kept.map(function(s) { return _REFINE_STATUS_LABELS[s] || s; }).join(', ') : '';

            // Build applied filters pills
            buildRefineFilterPills(c);
        }

        function setSelectValue(id, val) {
            var sel = document.getElementById(id);
            if (!sel) return;
            _setSelectIndex(sel, val);
            if (sel._csdSync) sel._csdSync(); // the custom dropdown box shows the new option (init-ui.js)
        }
        function _setSelectIndex(sel, val) {
            val = String(val);
            // Try exact match first
            for (var i = 0; i < sel.options.length; i++) {
                if (sel.options[i].value === val) { sel.selectedIndex = i; return; }
            }
            // Not a preset: a box with a "Custom" option shows the amount as typed (init-ui.js)
            if (val && !isNaN(parseFloat(val)) && sel._csdSetCustom && sel._csdSetCustom(val)) return;
            // Try closest match for price values
            if (val && !isNaN(parseFloat(val))) {
                var numVal = parseFloat(val);
                var bestIdx = 0, bestDiff = Infinity;
                for (var j = 1; j < sel.options.length; j++) {
                    var optVal = parseFloat(sel.options[j].value);
                    if (!isNaN(optVal)) {
                        var diff = Math.abs(optVal - numVal);
                        if (diff < bestDiff) { bestDiff = diff; bestIdx = j; }
                    }
                }
                sel.selectedIndex = bestIdx;
            } else {
                sel.selectedIndex = 0; // "Any"
            }
        }

        function buildRefineFilterPills(c) {
            var container = document.getElementById('refineAppliedFilters');
            if (!container) return;
            var pills = [];

            function formatPrice(v) {
                if (!v) return '';
                if (v >= 1000000) return '$' + (v / 1000000) + 'M';
                return '$' + (v / 1000) + 'K';
            }

            if (c.priceMin || c.priceMax) {
                var pLabel = (c.priceMin ? formatPrice(c.priceMin) : 'Any') + ' – ' + (c.priceMax ? formatPrice(c.priceMax) : 'Any');
                pills.push({ label: 'Price: ' + pLabel, key: 'price' });
            }
            if (c.bedsMin != null || c.bedsMax != null) {
                var bLabel = (c.bedsMin != null ? (c.bedsMin === 0 ? 'Studio' : c.bedsMin + ' BR') : 'Any') + ' – ' + (c.bedsMax != null ? c.bedsMax + ' BR' : 'Any');
                pills.push({ label: 'Beds: ' + bLabel, key: 'beds' });
            }
            if (c.bathsMin != null || c.bathsMax != null) {
                var baLabel = (c.bathsMin != null ? c.bathsMin + ' BA' : 'Any') + ' – ' + (c.bathsMax != null ? c.bathsMax + ' BA' : 'Any');
                pills.push({ label: 'Baths: ' + baLabel, key: 'baths' });
            }
            if (c.neighborhoods && c.neighborhoods.length > 0) {
                // Show canonical names in pills (cleaner than showing all 593 variants)
                var displayNames = c._neighborhoodCanonicals || c.neighborhoods;
                var nLabel = displayNames.length <= 3 ? displayNames.join(', ') : displayNames.length + ' neighborhoods';
                pills.push({ label: nLabel, key: 'neighborhoods' });
            }
            if (c.ownership && c.ownership.length > 0) {
                pills.push({ label: c.ownership.join(', '), key: 'ownership' });
            }

            if (pills.length === 0) {
                container.style.display = 'none';
                return;
            }
            container.style.display = 'flex';
            container.innerHTML = '<span class="text-[10px] text-gray-400 font-semibold mr-1">Filters:</span>' +
                pills.map(function(p) {
                    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-[11px] font-medium rounded-full">' +
                        p.label +
                        '<button onclick="removeRefineFilter(\'' + p.key + '\')" class="ml-0.5 text-blue-400 hover:text-red-500 transition-colors"><i class="fas fa-times text-[8px]"></i></button>' +
                    '</span>';
                }).join('');
        }

        function removeRefineFilter(key) {
            if (!activeSearchCriteria) return;
            if (key === 'price') { delete activeSearchCriteria.priceMin; delete activeSearchCriteria.priceMax; }
            else if (key === 'beds') { delete activeSearchCriteria.bedsMin; delete activeSearchCriteria.bedsMax; }
            else if (key === 'baths') { delete activeSearchCriteria.bathsMin; delete activeSearchCriteria.bathsMax; }
            else if (key === 'neighborhoods') { delete activeSearchCriteria.neighborhoods; }
            else if (key === 'ownership') { delete activeSearchCriteria.ownership; }
            applyRefinedSearch();
        }

        function applyRefinedSearch() {
            // Build criteria from refine panel controls
            var c = (typeof activeSearchCriteria !== 'undefined' && activeSearchCriteria) ? activeSearchCriteria : {};
            c.searchTab = c.searchTab || currentSearchTab || 'sale';

            // A box the agent did not touch (still showing what toggleRefinePanel put there) leaves the
            // criteria value alone; only a changed box rewrites it. Without the seed, a custom amount the
            // presets cannot show was replaced by the nearest preset on every Apply (found 2026-10-27).
            var _touched = function (el) { return !!el && el.getAttribute('data-seed') !== el.value; };

            // Price
            var pMin = document.getElementById('refineMinPrice');
            var pMax = document.getElementById('refineMaxPrice');
            if (_touched(pMin)) { if (pMin.value) c.priceMin = parseInt(pMin.value); else delete c.priceMin; }
            if (_touched(pMax)) { if (pMax.value) c.priceMax = parseInt(pMax.value); else delete c.priceMax; }

            // Beds
            var bMin = document.getElementById('refineMinBeds');
            var bMax = document.getElementById('refineMaxBeds');
            if (_touched(bMin)) { if (bMin.value !== '') c.bedsMin = parseInt(bMin.value); else delete c.bedsMin; }
            if (_touched(bMax)) { if (bMax.value !== '') c.bedsMax = parseInt(bMax.value); else delete c.bedsMax; }

            // Baths
            var baMin = document.getElementById('refineMinBaths');
            var baMax = document.getElementById('refineMaxBaths');
            if (_touched(baMin)) { if (baMin.value !== '') c.bathsMin = parseFloat(baMin.value); else delete c.bathsMin; }
            if (_touched(baMax)) { if (baMax.value !== '') c.bathsMax = parseFloat(baMax.value); else delete c.bathsMax; }

            // Statuses
            var statuses = [];
            if (document.getElementById('refineStatusActive') && document.getElementById('refineStatusActive').checked) statuses.push('ACTIVE');
            if (document.getElementById('refineStatusComingSoon') && document.getElementById('refineStatusComingSoon').checked) statuses.push('COMING_SOON');
            if (document.getElementById('refineStatusPending') && document.getElementById('refineStatusPending').checked) statuses.push('PENDING');
            if (document.getElementById('refineStatusContract') && document.getElementById('refineStatusContract').checked) { statuses.push('CONTRACT'); statuses.push('UNDER_CONTRACT'); }
            if (document.getElementById('refineStatusClosed') && document.getElementById('refineStatusClosed').checked) statuses.push('CLOSED');
            // Live-derived statuses from the full search (Back on Market, Sold / Rented Thru Us, financing …)
            // have no box here: keep them, so refining never silently widens the search.
            var keptStatuses = _refineKeptStatuses(c);
            if (statuses.length > 0) c.statuses = statuses.concat(keptStatuses);
            else if (keptStatuses.length) c.statuses = keptStatuses;
            else delete c.statuses;

            // Update activeSearchCriteria
            activeSearchCriteria = c;

            // Sync back to main form selects so "Full Search" stays consistent
            syncRefineToMainForm(c);

            // Re-issue search via the server-authoritative path.
            //
            // Bug A10 — user-reported 2026-05-04: refining a Queens search
            // to 1 bed produced results from "all boroughs". Root cause:
            // applyRefinedSearch previously called
            //   searchResultsState.filteredListings = filterListings(listings, c)
            // which had two compounding flaws:
            //   1) `filterListings` does not enforce criteria.borough — it
            //      checks address, price, beds, baths, neighborhoods, but
            //      not the borough field on listings. Even if borough was
            //      preserved on `c`, local filtering ignored it.
            //   2) The global `listings` array accumulates server results
            //      across all searches in the session, so cross-borough
            //      rows from prior searches leaked into refine output.
            //
            // Fix: send the refined criteria to /api/idx/search via
            // _serverSearch. Borough is forwarded as `params.borough` and
            // applied as `CityRegion eq 'X'` server-side (verified in
            // lib/search/__tests__/crm-idx-filter.test.ts). This makes
            // refine semantically equivalent to running performSearch with
            // the modified criteria — exactly what the user expects.
            //
            // _serverSearch handles its own re-render (post-A5/A6 it
            // replaces filteredListings with serverListings on success and
            // clears them on zero-result), so the local initializeSearchResults
            // / updateResultsCount calls that used to live here are no
            // longer needed — they would just paint stale local data
            // before the server response arrives.
            if (typeof searchResultsState !== 'undefined' && searchResultsState) {
                searchResultsState.currentPage = 1;
            }
            if (typeof MallanAPI !== 'undefined' && typeof _serverSearch === 'function') {
                _serverSearch(c, []);
            }

            // Update pills
            buildRefineFilterPills(c);

            // Save for Last Search recall
            if (typeof saveLastSearchCriteria === 'function') saveLastSearchCriteria();
        }

        function syncRefineToMainForm(c) {
            // Sync refine panel values back to the main form dropdowns
            var isRental = (c.searchTab === 'rent');
            var prefix = isRental ? 'rental' : 'sale';

            var minPriceId = isRental ? 'rentalMinRent' : 'saleMinPrice';
            var maxPriceId = isRental ? 'rentalMaxRent' : 'saleMaxPrice';
            setSelectValue(minPriceId, c.priceMin || '');
            setSelectValue(maxPriceId, c.priceMax || '');

            setSelectValue(prefix + 'MinBeds', c.bedsMin != null ? c.bedsMin : '');
            setSelectValue(prefix + 'MaxBeds', c.bedsMax != null ? c.bedsMax : '');
            setSelectValue(prefix + 'MinBaths', c.bathsMin != null ? c.bathsMin : '');
            setSelectValue(prefix + 'MaxBaths', c.bathsMax != null ? c.bathsMax : '');

            // Statuses: tick the boxes the search reads for this mode, so "Full Search" shows the refined
            // statuses and a later Search from the form runs the same query (the form kept the old statuses
            // after a refinement — found 2026-10-27).
            var advMode = document.getElementById('searchAdvancedMode');
            var isAdvanced = advMode && advMode.style.display !== 'none' && !advMode.classList.contains('hidden');
            var statusScope = isAdvanced ? document.getElementById(isRental ? 'rentalStatusOptions' : 'saleStatusOptions')
                                         : document.getElementById(activeBasicFormId());
            if (statusScope) {
                var boxes = Array.prototype.slice.call(statusScope.querySelectorAll('[data-field="StandardStatus"]'));
                boxes.forEach(function (cb) { cb.checked = false; });
                var plainBox = { ACTIVE: 'Active', COMING_SOON: 'ComingSoon', PENDING: 'Pending', CONTRACT: 'Pending', UNDER_CONTRACT: 'Pending',
                                 CLOSED: 'Closed', WITHDRAWN: 'Withdrawn', CANCELED: 'Canceled', EXPIRED: 'Expired', HOLD: 'Hold', INCOMPLETE: 'Incomplete' };
                (c.statuses || []).forEach(function (s) {
                    var want = plainBox[String(s).toUpperCase()] || s;
                    var cb = boxes.find(function (b) { return !b.hasAttribute('data-sub-status') && b.getAttribute('data-value') === want; })
                          || boxes.find(function (b) { return b.getAttribute('data-sub-status') === s; })
                          || boxes.find(function (b) { return !b.hasAttribute('data-sub-status') && String(b.getAttribute('data-value') || '').split(',').map(function (v) { return v.trim(); }).indexOf(want) !== -1; });
                    if (cb && !cb.disabled) cb.checked = true;
                });
            }
        }

        function clearRefinePanel() {
            // Reset all refine panel controls
            ['refineMinPrice','refineMaxPrice','refineMinBeds','refineMaxBeds','refineMinBaths','refineMaxBaths'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) el.selectedIndex = 0;
            });
            var cb = document.getElementById('refineStatusActive');
            if (cb) cb.checked = true;
            ['refineStatusComingSoon','refineStatusPending','refineStatusContract','refineStatusClosed'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) el.checked = false;
            });
            // Apply immediately
            applyRefinedSearch();
        }

        // Highlight the active search type/mode on the sticky dark nav bar
        function updateStickyNavActive() {
            // Update active label
            var label = document.getElementById('stickyNavActiveLabel');
            if (label) {
                var tab = currentSearchTab || 'sale';
                var _smode;
                try { _smode = sessionStorage.getItem('searchMode'); } catch(e) {}
                var isBasic = _smode !== 'advanced';
                var mode = isBasic ? 'Basic' : 'Advanced';
                var tabLabel = tab === 'rent' ? 'Rentals' : tab === 'building' ? 'Buildings' : 'Sales';
                label.textContent = tabLabel + ' · ' + mode;
            }

            // Highlight the matching nav button
            var ids = ['stickyNavSaleBasic','stickyNavSaleAdv','stickyNavRentBasic','stickyNavRentAdv'];
            ids.forEach(function(id) {
                var el = document.getElementById(id);
                if (!el) return;
                el.classList.remove('bg-white/15', 'text-white');
                el.classList.add('text-gray-400');
            });
            var _smode2;
            try { _smode2 = sessionStorage.getItem('searchMode'); } catch(e) {}
            var basic = _smode2 !== 'advanced';
            var activeId = null;
            if (currentSearchTab === 'sale') activeId = basic ? 'stickyNavSaleBasic' : 'stickyNavSaleAdv';
            else if (currentSearchTab === 'rent') activeId = basic ? 'stickyNavRentBasic' : 'stickyNavRentAdv';
            var activeBtn = activeId ? document.getElementById(activeId) : null;
            if (activeBtn) {
                activeBtn.classList.remove('text-gray-400');
                activeBtn.classList.add('bg-white/15', 'text-white');
            }

            // Update results count in nav
            var countEl = document.getElementById('stickyNavResultCount');
            if (countEl) {
                var total = getFilteredListings(true).length;
                countEl.textContent = total.toLocaleString() + ' results';
            }
        }

        // Jump to a specific search form from results sticky nav
        function jumpToSearch(tab, mode) {
            // Hide results
            var searchResultsSection = document.getElementById('searchResultsSection');
            if (searchResultsSection) searchResultsSection.style.display = 'none';

            // Hide detail page if open
            var detailPage = document.getElementById('listingDetailPage');
            if (detailPage) detailPage.classList.add('hidden');

            // Show search form container
            var searchFormContainer = document.getElementById('searchFormContainer');
            if (searchFormContainer) searchFormContainer.style.display = 'block';
            // Coming back from Comparable Reports: that page hides the general search section, and a
            // hidden section's ticked boxes count as inactive, so every checkbox criterion was silently
            // dropped from the next search (found 2026-10-26).
            if (typeof toggleSearchType === 'function') toggleSearchType('general');

            // Switch to the correct tab (sale, rent, building) — uses existing function
            toggleSearchTab(tab);

            // Switch to the correct mode (basic or advanced) — uses existing function
            toggleSearchMode(mode);

            // Update hash so refresh returns to search form
            history.pushState(null, '', '#main');

            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Jump to Comparables from results sticky nav
        function jumpToComparables() {
            var searchResultsSection = document.getElementById('searchResultsSection');
            if (searchResultsSection) searchResultsSection.style.display = 'none';
            var searchFormContainer = document.getElementById('searchFormContainer');
            if (searchFormContainer) searchFormContainer.style.display = 'block';
            if (typeof toggleSearchType === 'function') toggleSearchType('comparables');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // ─── SESSION PERSISTENCE ─────────────────────────────────────────────
        // Save/restore search results across page refresh via sessionStorage
        // ─────────────────────────────────────────────────────────────────────

        function _saveSearchState() {
            try {
                var filtered = searchResultsState.filteredListings || [];
                var ids = filtered.map(function(l) { return l.id; });
                // Also capture the active address input value
                var addrId = currentSearchTab === 'rent' ? 'rentalSearchAddress' :
                             currentSearchTab === 'building' ? 'buildingSearchAddress' : 'saleSearchAddress';
                var addrEl = document.getElementById(addrId);
                var adv = document.getElementById('advancedSearchAddress');
                var advMode = document.getElementById('searchAdvancedMode');
                var addr = '';
                if (advMode && advMode.style.display !== 'none' && adv && adv.value.trim()) {
                    addr = adv.value.trim();
                } else if (addrEl && addrEl.value.trim()) {
                    addr = addrEl.value.trim();
                }
                // Capture current mode (basic/advanced)
                var curMode = 'basic';
                try { curMode = sessionStorage.getItem('searchMode') || 'basic'; } catch(e2) {}
                sessionStorage.setItem('_searchState', JSON.stringify({
                    filteredIds: ids,
                    tab: currentSearchTab,
                    mode: curMode,
                    page: searchResultsState.currentPage || 1,
                    address: addr,
                    // The criteria and the exact live query: a reload restores the form from the criteria
                    // and re-runs the query, instead of filtering the first 200 preloaded rows by id
                    // (which lost the results and the price / beds choices, found 2026-10-26).
                    criteria: typeof activeSearchCriteria !== 'undefined' ? activeSearchCriteria : null,
                    params: searchResultsState.lastParams || null,
                    ts: Date.now()
                }));
            } catch (e) { /* sessionStorage full or unavailable */ }
        }

        function _clearSearchState() {
            try { sessionStorage.removeItem('_searchState'); } catch (e) {}
        }

        function _restoreSearchState() {
            try {
                var raw = sessionStorage.getItem('_searchState');
                if (!raw) return false;
                var state = JSON.parse(raw);
                if (!state || !state.filteredIds || !Array.isArray(state.filteredIds)) return false;

                // Expire saved state after 5 minutes
                if (state.ts && (Date.now() - state.ts) > 300000) {
                    sessionStorage.removeItem('_searchState');
                    return false;
                }

                // Restore the search mode (basic/advanced) FIRST so toggleSearchTab sees correct state
                if (state.mode && typeof toggleSearchMode === 'function') {
                    toggleSearchMode(state.mode);
                }

                // Restore the search tab
                if (state.tab) {
                    currentSearchTab = state.tab;
                    if (typeof toggleSearchTab === 'function') {
                        window._suppressHashUpdate = true;
                        toggleSearchTab(state.tab);
                        window._suppressHashUpdate = false;
                    }
                }

                // Saved criteria + live query (2026-10-26): refill the form and re-run the query on
                // Cotality. Returns 'live' so the caller leaves the rendering to the search itself.
                if (state.params && typeof _runServerSearch === 'function') {
                    try {
                        if (state.criteria && typeof _criteriaToFormFields === 'function' && typeof _criteriaToApiFormat === 'function') {
                            _criteriaToFormFields(_criteriaToApiFormat(state.criteria));
                        }
                    } catch (e) { console.warn('[Search] form restore after reload:', e.message); }
                    if (typeof activeSearchCriteria !== 'undefined' && state.criteria) activeSearchCriteria = state.criteria;
                    var _searchFormContainer = document.getElementById('searchFormContainer');
                    if (_searchFormContainer) _searchFormContainer.style.display = 'none';
                    var _resultsSection = document.getElementById('searchResultsSection');
                    if (_resultsSection) { _resultsSection.style.display = 'block'; _resultsSection.classList.remove('hidden'); }
                    searchResultsState.currentPage = state.page || 1;
                    _runServerSearch(Object.assign({}, state.params));
                    return 'live';
                }

                // Rebuild filteredListings from saved IDs
                var idSet = {};
                state.filteredIds.forEach(function(id) { idSet[id] = true; });
                searchResultsState.filteredListings = listings.filter(function(l) { return idSet[l.id]; });
                searchResultsState.currentPage = state.page || 1;

                return true;
            } catch (e) { return false; }
        }

        // Track current search tab mode globally (sale, rent, building)
        var currentSearchTab = 'sale';

        // New unified function for switching between Sales, Rentals, and Buildings tabs
        function toggleSearchTab(tab) {
            currentSearchTab = tab;
            try { sessionStorage.setItem('searchTab', tab); } catch(e) {}
            var btnSale = document.getElementById('btnSale');
            var btnRent = document.getElementById('btnRent');
            var btnBuilding = document.getElementById('btnBuilding');

            var advancedMode = document.getElementById('searchAdvancedMode');

            var _storedMode;
            try { _storedMode = sessionStorage.getItem('searchMode'); } catch(e) {}
            var isBasicMode = _storedMode !== 'advanced';

            // Reset all tab buttons
            [btnSale, btnRent, btnBuilding].forEach(btn => {
                if (btn) {
                    btn.classList.remove('bg-gray-900', 'text-white');
                    btn.classList.add('bg-white', 'text-gray-500', 'border', 'border-gray-200');
                }
            });

            // Show this tab's basic form (Sales, Rentals and Buildings each have one), or the advanced form
            _showBasicForms(isBasicMode);
            if (advancedMode) advancedMode.style.display = isBasicMode ? 'none' : 'block';

            // Activate selected tab button
            var activeBtn = tab === 'rent' ? btnRent : tab === 'building' ? btnBuilding : btnSale;
            if (activeBtn) {
                activeBtn.classList.remove('bg-white', 'text-gray-500', 'border', 'border-gray-200');
                activeBtn.classList.add('bg-gray-900', 'text-white');
            }

            // Toggle calculators based on mode (sale vs rent) in Advanced Search
            var saleCalc = document.getElementById('saleInvestmentCalc');
            var rentCalc = document.getElementById('rentVsBuyCalc');

            // Rental-specific sections
            var rentalStatusOptions = document.getElementById('rentalStatusOptions');
            var furnishedOptionsSection = document.getElementById('furnishedOptionsSection');
            var leaseDetailsSection = document.getElementById('leaseDetailsSection');
            var listingTypeSection = document.getElementById('listingTypeSection');
            var concessionsSection = document.getElementById('concessionsSection');
            var leaseAvailabilitySection = document.getElementById('leaseAvailabilitySection');
            var managementCompaniesSection = document.getElementById('managementCompaniesSection');

            // Sale-specific status options (the default status checkboxes)
            var saleStatusOptions = document.getElementById('saleStatusOptions');

            // Sale-specific sections
            var saleFinancialDetailsSection = document.getElementById('saleFinancialDetailsSection');
            var salePurchasingOptions = document.getElementById('salePurchasingOptions');
            var saleContractSignedDate = document.getElementById('saleContractSignedDateFilter');
            var saleSoldClosedDate = document.getElementById('saleSoldClosedDate');
            var saleCapRateSection = document.getElementById('saleCapRateSection');
            var saleNOISection = document.getElementById('saleNOISection');

            // Rental-specific date fields
            var rentalLeaseSignedDate = document.getElementById('rentalLeaseSignedDate');
            var rentalRentedDate = document.getElementById('rentalRentedDate');

            // Price fields - Sale vs Rental
            var salePriceFields = document.getElementById('salePriceFields');
            var rentPriceFields = document.getElementById('rentPriceFields');
            var salePriceExpenseRow = document.getElementById('salePriceExpenseRow');
            var rentPriceExpenseRow = document.getElementById('rentPriceExpenseRow');
            var priceLabel = document.getElementById('priceLabel');
            var monthlyExpensesFields = document.getElementById('monthlyExpensesFields');
            var netMonthlyRentFields = document.getElementById('netMonthlyRentFields');
            var monthlyLabel = document.getElementById('monthlyLabel');
            var monthlySection = document.getElementById('monthlySection');
            var mortgageCalculator = document.getElementById('mortgageCalculator');

            if (tab === 'sale') {
                if (saleCalc) saleCalc.style.display = 'block';
                if (rentCalc) rentCalc.style.display = 'none';
                // Hide rental-specific sections
                if (rentalStatusOptions) rentalStatusOptions.style.display = 'none';
                if (furnishedOptionsSection) furnishedOptionsSection.style.display = 'none';
                if (leaseDetailsSection) leaseDetailsSection.style.display = 'none';
                if (listingTypeSection) listingTypeSection.style.display = 'none';
                if (concessionsSection) concessionsSection.style.display = 'none';
                if (leaseAvailabilitySection) leaseAvailabilitySection.style.display = 'none';
                if (managementCompaniesSection) managementCompaniesSection.style.display = 'none';
                // Show sale status options
                if (saleStatusOptions) saleStatusOptions.style.display = 'block';
                // Show sale-specific sections
                if (saleFinancialDetailsSection) saleFinancialDetailsSection.style.display = 'block';
                if (salePurchasingOptions) salePurchasingOptions.style.display = 'block';
                // Show sale-specific date fields, hide rental date fields
                if (saleContractSignedDate) saleContractSignedDate.style.display = 'block';
                if (saleSoldClosedDate) saleSoldClosedDate.style.display = 'block';
                if (rentalLeaseSignedDate) rentalLeaseSignedDate.style.display = 'none';
                if (rentalRentedDate) rentalRentedDate.style.display = 'none';
                // Show sale-specific commercial fields
                if (saleCapRateSection) saleCapRateSection.style.display = 'block';
                if (saleNOISection) saleNOISection.style.display = 'block';
                // Show sale price row, hide rental price row
                if (salePriceExpenseRow) salePriceExpenseRow.style.display = 'flex';
                if (rentPriceExpenseRow) rentPriceExpenseRow.style.display = 'none';
                // Show mortgage calculator for sales
                if (mortgageCalculator) mortgageCalculator.style.display = 'block';
            } else if (tab === 'rent') {
                if (saleCalc) saleCalc.style.display = 'none';
                if (rentCalc) rentCalc.style.display = 'block';
                // Show rental-specific sections
                if (rentalStatusOptions) rentalStatusOptions.style.display = 'block';
                if (furnishedOptionsSection) furnishedOptionsSection.style.display = 'block';
                if (leaseDetailsSection) leaseDetailsSection.style.display = 'block';
                if (listingTypeSection) listingTypeSection.style.display = 'block';
                if (concessionsSection) concessionsSection.style.display = 'block';
                if (leaseAvailabilitySection) leaseAvailabilitySection.style.display = 'block';
                if (managementCompaniesSection) managementCompaniesSection.style.display = 'block';
                // Hide sale status options
                if (saleStatusOptions) saleStatusOptions.style.display = 'none';
                // Hide sale-specific sections
                if (saleFinancialDetailsSection) saleFinancialDetailsSection.style.display = 'none';
                if (salePurchasingOptions) salePurchasingOptions.style.display = 'none';
                // Hide sale-specific date fields, show rental date fields
                if (saleContractSignedDate) saleContractSignedDate.style.display = 'none';
                if (saleSoldClosedDate) saleSoldClosedDate.style.display = 'none';
                if (rentalLeaseSignedDate) rentalLeaseSignedDate.style.display = 'block';
                if (rentalRentedDate) rentalRentedDate.style.display = 'block';
                // Hide sale-specific commercial fields (Cap Rate, NOI are for investment sales)
                if (saleCapRateSection) saleCapRateSection.style.display = 'none';
                if (saleNOISection) saleNOISection.style.display = 'none';
                // Show rental price row, hide sale price row
                if (salePriceExpenseRow) salePriceExpenseRow.style.display = 'none';
                if (rentPriceExpenseRow) rentPriceExpenseRow.style.display = 'flex';
                // Hide mortgage calculator for rentals
                if (mortgageCalculator) mortgageCalculator.style.display = 'none';
            } else {
                // Building search - hide both calculators and rental sections
                if (saleCalc) saleCalc.style.display = 'none';
                if (rentCalc) rentCalc.style.display = 'none';
                if (rentalStatusOptions) rentalStatusOptions.style.display = 'none';
                if (furnishedOptionsSection) furnishedOptionsSection.style.display = 'none';
                if (leaseDetailsSection) leaseDetailsSection.style.display = 'none';
                if (listingTypeSection) listingTypeSection.style.display = 'none';
                if (concessionsSection) concessionsSection.style.display = 'none';
                if (leaseAvailabilitySection) leaseAvailabilitySection.style.display = 'none';
                if (managementCompaniesSection) managementCompaniesSection.style.display = 'none';
                if (saleStatusOptions) saleStatusOptions.style.display = 'block';
                // Show sale-specific sections for building search
                if (saleFinancialDetailsSection) saleFinancialDetailsSection.style.display = 'block';
                if (salePurchasingOptions) salePurchasingOptions.style.display = 'block';
                // Show sale-specific date fields for building search
                if (saleContractSignedDate) saleContractSignedDate.style.display = 'block';
                if (saleSoldClosedDate) saleSoldClosedDate.style.display = 'block';
                if (rentalLeaseSignedDate) rentalLeaseSignedDate.style.display = 'none';
                if (rentalRentedDate) rentalRentedDate.style.display = 'none';
                // Show sale-specific commercial fields for building search
                if (saleCapRateSection) saleCapRateSection.style.display = 'block';
                if (saleNOISection) saleNOISection.style.display = 'block';
                // Default to sale price row for building search
                if (salePriceExpenseRow) salePriceExpenseRow.style.display = 'flex';
                if (rentPriceExpenseRow) rentPriceExpenseRow.style.display = 'none';
                // Show mortgage calculator for building search
                if (mortgageCalculator) mortgageCalculator.style.display = 'block';
            }
            if (typeof updateFilterCount === 'function') updateFilterCount();
        }

        // Legacy function - now calls toggleSearchTab
        var currentSaleRentMode = 'sale';
        function toggleSaleRent(type) {
            currentSaleRentMode = type;
            toggleSearchTab(type);
        }

        function toggleSearchMode(mode) {
            var btnBasic = document.getElementById('btnSearchBasic');
            var btnAdvanced = document.getElementById('btnSearchAdvanced');
            var advancedMode = document.getElementById('searchAdvancedMode');
            var expandControls = document.getElementById('expandCollapseControls');

            try { sessionStorage.setItem('searchMode', mode); } catch(e) {}

            // The hover class must leave the active pill: hover:text-gray-700 beat text-white while the
            // pointer was still on the button just clicked, so "Advanced" read slate on black (Maya 2026-10-27).
            if (mode === 'basic') {
                btnBasic.classList.remove('text-gray-500', 'hover:text-gray-700');
                btnBasic.classList.add('bg-gray-900', 'text-white');
                btnAdvanced.classList.remove('bg-gray-900', 'text-white');
                btnAdvanced.classList.add('text-gray-500', 'hover:text-gray-700');
                if (expandControls) expandControls.classList.add('hidden');
                _showBasicForms(true);
                if (advancedMode) advancedMode.style.display = 'none';
            } else {
                btnAdvanced.classList.remove('text-gray-500', 'hover:text-gray-700');
                btnAdvanced.classList.add('bg-gray-900', 'text-white');
                btnBasic.classList.remove('bg-gray-900', 'text-white');
                btnBasic.classList.add('text-gray-500', 'hover:text-gray-700');
                if (expandControls) { expandControls.classList.remove('hidden'); expandControls.classList.add('flex'); }
                if (advancedMode) advancedMode.style.display = 'block';
                _showBasicForms(false);
            }
            if (typeof updateFilterCount === 'function') updateFilterCount();
        }

        function expandAllSections() {
            var sections = document.querySelectorAll('#searchAdvancedMode .section-content');
            var icons = document.querySelectorAll('#searchAdvancedMode .section-header i');
            sections.forEach(function(s) { s.classList.remove('collapsed'); });
            icons.forEach(function(i) { i.classList.remove('fa-plus'); i.classList.add('fa-minus'); });
        }

        function collapseAllSections() {
            var sections = document.querySelectorAll('#searchAdvancedMode .section-content');
            var icons = document.querySelectorAll('#searchAdvancedMode .section-header i');
            sections.forEach(function(s) { s.classList.add('collapsed'); });
            icons.forEach(function(i) { i.classList.remove('fa-minus'); i.classList.add('fa-plus'); });
        }

        function detectIDType(input) {
            var value = input.value.toUpperCase().trim();
            var hint = document.getElementById('idTypeHint');

            if (!value) {
                hint.textContent = '';
                return;
            }

            if (value.startsWith('RLS')) {
                hint.textContent = '🔍 Detected: RLS ID (REBNY Listing Service)';
                hint.className = 'text-xs text-blue-600 mt-2 font-semibold';
            } else if (value.startsWith('WEB')) {
                hint.textContent = '🔍 Detected: Web ID (Website Listing Reference)';
                hint.className = 'text-xs text-green-600 mt-2 font-semibold';
            } else if (/^\d{6,}$/.test(value)) {
                hint.textContent = '🔍 Detected: Internal Listing Number';
                hint.className = 'text-xs text-purple-600 mt-2 font-semibold';
            } else {
                hint.textContent = '💡 Enter RLS ID, Web ID, or Internal Listing #';
                hint.className = 'text-xs text-gray-500 mt-2';
            }
        }

        // Add new ID search row
        function addIdSearchRow() {
            var container = document.getElementById('idSearchContainer');
            var rowCount = container.querySelectorAll('.id-search-row').length;
            var newRow = document.createElement('div');
            newRow.className = 'id-search-row flex items-center gap-2 mb-2';
            newRow.innerHTML = `
                <input type="text" placeholder="Enter RLS ID, Web ID, or Internal Listing #"
                       class="flex-1 border-2 border-blue-500 rounded-lg px-4 py-3 text-sm font-mono"
                       oninput="detectIDType(this)">
                <button type="button" onclick="removeSearchRow(this, 'id-search-row')" class="w-10 h-10 bg-red-500 text-white rounded-lg hover:bg-red-600 transition flex items-center justify-center" title="Remove" aria-label="Remove">
                    <i class="fas fa-minus"></i>
                </button>
            `;
            container.appendChild(newRow);
        }

        // Add new address search row
        function addAddressSearchRow() {
            var container = document.getElementById('addressSearchContainer');
            var newRow = document.createElement('div');
            newRow.className = 'address-search-row mb-2';
            newRow.innerHTML = `
                <div class="flex items-center gap-2">
                    <input type="text" placeholder="Enter Address or Building Name" class="flex-1 border rounded-lg px-3 py-2 text-sm">
                    <input type="text" placeholder="Unit #" class="w-24 border rounded-lg px-3 py-2 text-sm">
                    <button type="button" onclick="removeSearchRow(this, 'address-search-row')" class="w-8 h-8 bg-red-500 text-white rounded-lg hover:bg-red-600 transition flex items-center justify-center text-xs flex-shrink-0" title="Remove" aria-label="Remove">
                        <i class="fas fa-minus"></i>
                    </button>
                </div>
            `;
            container.appendChild(newRow);
        }

        // Remove search row (for both ID and address)
        function removeSearchRow(button, rowClass) {
            var row = button.closest('.' + rowClass);
            if (row) row.remove();
        }

        function toggleSearchType(type) {
            try { sessionStorage.setItem('searchType', type); } catch(e) {}
            var btnGeneral = document.getElementById('btnGeneralSearch');
            var btnComparables = document.getElementById('btnComparables');
            var generalSection = document.getElementById('generalSearchSection');
            var comparablesSection = document.getElementById('comparablesSection');

            if (type === 'general') {
                btnGeneral.classList.add('border-b-3', 'border-blue-600', 'text-blue-700', 'bg-white');
                btnGeneral.classList.remove('text-gray-700', 'border-transparent', 'bg-gray-50');
                btnComparables.classList.remove('border-blue-600', 'border-purple-600', 'text-blue-700', 'text-purple-700', 'bg-white');
                btnComparables.classList.add('text-gray-700', 'border-transparent', 'bg-gray-50');

                generalSection.style.display = 'block';
                comparablesSection.style.display = 'none';
            } else {
                btnComparables.classList.add('border-b-3', 'border-purple-600', 'text-purple-700', 'bg-white');
                btnComparables.classList.remove('text-gray-700', 'border-transparent', 'bg-gray-50');
                btnGeneral.classList.remove('border-blue-600', 'text-blue-700', 'bg-white');
                btnGeneral.classList.add('text-gray-700', 'border-transparent', 'bg-gray-50');

                comparablesSection.style.display = 'block';
                generalSection.style.display = 'none';
            }
        }

        function openCompPage(method) {
            // Hide selection page
            document.getElementById('comparablesSelectionPage').style.display = 'none';

            // Show the selected page
            if (method === 'property') {
                document.getElementById('subjectPropertyPage').style.display = 'block';
            } else if (method === 'building') {
                document.getElementById('subjectBuildingsPage').style.display = 'block';
            } else if (method === 'general') {
                document.getElementById('generalCriteriaPage').style.display = 'block';
            }
            if (typeof compOnOpenPage === 'function') compOnOpenPage(method);
        }

        function backToCompSelection() {
            // Hide all comp pages
            document.querySelectorAll('.comparables-page').forEach(page => {
                page.style.display = 'none';
            });

            // Show selection page
            document.getElementById('comparablesSelectionPage').style.display = 'block';
        }

        // Comparable Reports (Sales / Rentals toggle, searches, results, CMA) live in js/search/comparables.js

        // "Custom" in any dropdown: the box itself takes the typed amount — shared component in js/init/init-ui.js (convertSelect).

