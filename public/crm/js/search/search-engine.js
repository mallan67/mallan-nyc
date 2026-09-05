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
        function _findBoroughForNeighborhood(name) {
            var boroughs = {
                'Bronx': ['Allerton','Baychester','Bedford Park','Belmont','City Island','Co-op City','Fordham','Kingsbridge','Morris Park','Pelham Bay','Central Riverdale','Fieldston','North Riverdale','Spuyten Duyvil','Throgs Neck','Woodlawn'],
                'Brooklyn': ['Bath Beach','Bay Ridge','Fort Hamilton','Bedford - Stuyvesant','Ocean Hill','Stuyvesant Heights','Bensonhurst','Boerum Hill','Borough Park','Brighton Beach','Brooklyn Heights','Bushwick','Carroll Gardens','Cobble Hill','Coney Island','Crown Heights','Ditmas Park','Downtown Brooklyn','Dumbo','DUMBO','Dyker Heights','Flatbush','Fort Greene','Gowanus','Greenpoint','Park Slope','Prospect Heights','Red Hook','Sheepshead Bay','Sunset Park','Williamsburg','Windsor Terrace','South Slope'],
                'Manhattan': ['Battery Park City','Carnegie Hill','Central Harlem','Chelsea','Chinatown','Civic Center','East Harlem','East Village','Financial District','Flatiron','Gramercy Park','Gramercy','Greenwich Village','Hamilton Heights','Harlem','Hell\'s Kitchen','Hudson Square','Hudson Yards','Inwood','Kips Bay','Lenox Hill','Lincoln Square','Little Italy','Lower East Side','Manhattan Valley','Manhattanville','Marble Hill','Meatpacking District','Midtown','Midtown East','Midtown West','Morningside Heights','Mott Haven','Murray Hill','NoHo','NoMad','Nolita','Peter Cooper Village','Roosevelt Island','SoHo','Stuyvesant Town','Sugar Hill','Sutton Place','Times Square','Tribeca','Tudor City','Turtle Bay','Two Bridges','Union Square','Upper East Side','Upper West Side','Washington Heights','West Harlem','West Village','Yorkville'],
                'Queens': ['Astoria','Bayside','Corona','Elmhurst','Flushing','Forest Hills','Hunters Point','Jackson Heights','Jamaica','Kew Gardens','Long Island City','Long Island City (LIC)','Rego Park','Ridgewood','Sunnyside','Whitestone','Woodside'],
                'Staten Island': ['Annadale','Arden Heights','Dongan Hills','Great Kills','New Dorp','New Brighton','South Beach','St. George','Stapleton','Todt Hill']
            };
            for (var b in boroughs) {
                if (boroughs[b].indexOf(name) !== -1) return b;
            }
            return '';
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

        function performSearch() {
            try {
                // Collect search criteria from the active form
                activeSearchCriteria = collectSearchCriteria();
                if (typeof searchResultsState === 'undefined' || !searchResultsState) {
                    showToast('Error: Search state not initialized. Please refresh the page.', 'error');
                    return;
                }
                // ── Canonical executor contract (Search Browser Integration P0, 2026-09-05) ──
                // The browser sends criteria to /api/idx/search and renders ONLY what the
                // executor returns for the requested page: no local pre-render over rows
                // fetched earlier, no local filtering, no local pagination, no local
                // sorting. A criterion the executor does not execute is REFUSED here by
                // name (mirroring the route's 400 UNSUPPORTED_CRITERION) — never dropped
                // into a silently broader search.
                var _ser = window.serializeSearchCriteria(activeSearchCriteria);
                if (_ser.contractMissing) {
                    showToast('Search is unavailable: the Search contract did not load. Reload the page.', 'error');
                    return;
                }
                if (_ser.refused.length > 0) {
                    showToast('Not executable in this Search: ' + _ser.refused.join(', ') + '. Clear those controls and search again.', 'warning');
                    return;
                }
                // A new search establishes a NEW result set — never adds to the old one.
                searchResultsState.filteredListings = [];
                searchResultsState.serverPaged = true;
                searchResultsState.serverTotal = null;
                searchResultsState.serverCountMeaning = null;
                searchResultsState.currentPage = 1;
                _showSearchResults();
                if (typeof MallanAPI !== 'undefined') {
                    _serverSearch(activeSearchCriteria);
                }
            } catch (err) {
                showToast('Search error: ' + err.message + '. Check browser console (F12) for details.', 'error');
            }
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
        // ── Canonical criteria serializer (Search Consolidation Packet 1, 2026-09-05) ──
        // The browser carries NO vocabulary. Every member list and the executable parameter set
        // come from GET /api/idx/search/contract, which is the executor's own source verbatim
        // (data/cotality-enums.live.json → canonical/live-truth.ts → engine/criteria.ts).
        // Without a loaded contract the browser refuses to search (fail loud, no fallback).
        var _SEARCH_CONTRACT = null;
        window.loadSearchContract = function() {
            if (typeof MallanAPI === 'undefined' || !MallanAPI.idx || typeof MallanAPI.idx.contract !== 'function') {
                return Promise.reject(new Error('MallanAPI.idx.contract unavailable'));
            }
            return MallanAPI.idx.contract().then(function(c) {
                if (!c || !c.members || !c.members.StandardStatus || !Array.isArray(c.executableParams)) throw new Error('malformed Search contract');
                _SEARCH_CONTRACT = c;
                window.SEARCH_CONTRACT = c;
                return c;
            });
        };
        function _contractTokens(field) {
            var set = {};
            var m = _SEARCH_CONTRACT && _SEARCH_CONTRACT.members && _SEARCH_CONTRACT.members[field];
            (m || []).forEach(function(x) { set[x.token] = true; });
            return set;
        }
        // Shell criteria keys the executor does not execute (UI labels only — not vocabulary).
        var _NOT_EXECUTABLE = [
            ['address', 'Address / Building Name'], ['unit', 'Unit #'], ['keyword', 'Keyword'],
            ['roomsMin', 'Min Rooms'], ['roomsMax', 'Max Rooms'], ['sqftMin', 'Min SqFt'], ['sqftMax', 'Max SqFt'],
            ['managementCompany', 'Management Company'], ['dateFrom', 'Listing Activity date'], ['dateTo', 'Listing Activity date'],
            ['dateActivityType', 'Listing Activity type'], ['contractDateFrom', 'Contract date'], ['contractDateTo', 'Contract date'],
            ['soldDateFrom', 'Sold date'], ['soldDateTo', 'Sold date'], ['yearMin', 'Year Built'], ['yearMax', 'Year Built'],
            ['floorsMin', 'Floors'], ['floorsMax', 'Floors'], ['unitsMin', 'Units'], ['unitsMax', 'Units'],
            ['buildingName', 'Building Name'], ['openHouseDateFrom', 'Open House date'], ['openHouseDateTo', 'Open House date'],
            ['_transitLines', 'Transit'], ['_transitBounds', 'Transit'], ['_gridBounds', 'Map grid']
        ];
        function _isSet(v) { return !(v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)); }
        window.serializeSearchCriteria = function(criteria) {
            var params = {}; var refused = []; var seen = {};
            function refuse(label) { if (!seen[label]) { seen[label] = true; refused.push(label); } }
            if (!criteria) return { params: params, refused: refused, contractMissing: !_SEARCH_CONTRACT };
            if (!_SEARCH_CONTRACT) return { params: params, refused: ['Search contract not loaded'], contractMissing: true };
            var STATUS = _contractTokens('StandardStatus');
            var OWNERSHIP = _contractTokens('CommonInterest');
            var STRUCTURE = _contractTokens('StructureType');
            params.type = criteria.searchTab === 'rent' ? 'rental' : 'sale';
            if (criteria.searchTab === 'building') refuse('Building search');
            if (criteria.priceMin) params.minPrice = criteria.priceMin;
            if (criteria.priceMax) params.maxPrice = criteria.priceMax;
            if (criteria.bedsMin != null) params.minBeds = criteria.bedsMin;
            if (criteria.bedsMax != null) params.maxBeds = criteria.bedsMax;
            if (criteria.bathsMin) params.minBaths = criteria.bathsMin;
            if (criteria.bathsMax) params.maxBaths = criteria.bathsMax;
            if (criteria.neighborhoods && criteria.neighborhoods.length > 0) params.neighborhood = criteria.neighborhoods.join(',');
            // EVERY selected borough is sent; the executor ORs CityRegion across provider and Mallan rows.
            if (criteria.boroughs && criteria.boroughs.length > 0) params.borough = criteria.boroughs.join(',');
            else if (criteria.borough) params.borough = criteria.borough;
            if (criteria.rlsId) params.listingId = String(criteria.rlsId).split(',').map(function(s) { return s.trim(); }).filter(Boolean).join(',');
            if (criteria.zip) params.zip = criteria.zip;
            if (criteria.statuses && criteria.statuses.length > 0) {
                var st = [];
                criteria.statuses.forEach(function(s) {
                    if (typeof s === 'string' && s.indexOf('sub:') === 0) { refuse('Sub-status "' + s.slice(4) + '"'); return; }
                    if (STATUS[s]) { if (st.indexOf(s) === -1) st.push(s); } else refuse('Status "' + s + '"');
                });
                if (st.length) params.status = st.join(',');
            }
            var own = [], structure = [];
            (criteria.ownership || []).forEach(function(o) {
                if (OWNERSHIP[o]) own.push(o);
                else if (STRUCTURE[o]) structure.push(o);
                else refuse('Ownership "' + o + '"');
            });
            if (criteria.propertySubType) {
                String(criteria.propertySubType).split(',').forEach(function(v) {
                    v = v.trim(); if (!v) return;
                    if (STRUCTURE[v]) structure.push(v); else refuse('Property type "' + v + '"');
                });
            }
            if (criteria.checkboxFilters) {
                Object.keys(criteria.checkboxFilters).forEach(function(k) {
                    var v = criteria.checkboxFilters[k]; if (!_isSet(v)) return;
                    if (k === 'StructureType') {
                        (Array.isArray(v) ? v : [v]).forEach(function(m) { if (STRUCTURE[m]) structure.push(m); else refuse('Building form "' + m + '"'); });
                    } else refuse(k);
                });
            }
            if (own.length) params.ownership = own.filter(function(x, i, a) { return a.indexOf(x) === i; }).join(',');
            if (structure.length) params.StructureType = structure.filter(function(x, i, a) { return a.indexOf(x) === i; }).join(',');
            _NOT_EXECUTABLE.forEach(function(p) { if (_isSet(criteria[p[0]])) refuse(p[1]); });
            return { params: params, refused: refused, contractMissing: false };
        };
        // Kept for the live count badge (init-tracker.js) and any other caller: the
        // executable parameters only. Refusals are surfaced by performSearch.
        window.buildIdxSearchParams = function(criteria) {
            return window.serializeSearchCriteria(criteria).params;
        };
        // Server-side search: query Trestle API with criteria — this is the PRIMARY data source
        // The executor sorts the WHOLE universe (price_desc | price_asc | newest);
        // the browser never re-sorts a page. Other sort fields are not executable.
        function _serverSortKey() {
            var f = searchResultsState.sortField, o = searchResultsState.sortOrder;
            if (f === 'listedDate') return 'newest';
            if (f === 'price' && o === 'asc') return 'price_asc';
            return 'price_desc';
        }
        var _serverSearchSeq = 0;
        // Server-side search: ONE page of the executor's settled universe. The executor
        // owns the universe, the criteria, the exact total, the order and the page.
        function _serverSearch(criteria) {
            var ser = window.serializeSearchCriteria(criteria);
            if (ser.refused.length > 0) {
                showToast('Not executable in this Search: ' + ser.refused.join(', '), 'warning');
                return;
            }
            var params = ser.params;
            var perPage = Math.min(Math.max(parseInt(searchResultsState.perPage, 10) || 50, 1), 200);
            var page = Math.max(parseInt(searchResultsState.currentPage, 10) || 1, 1);
            params.limit = perPage;
            params.skip = (page - 1) * perPage;
            params.sort = _serverSortKey();
            var requestSeq = ++_serverSearchSeq;
            if (typeof _serverSearchActive !== 'undefined') _serverSearchActive = true;
            if (typeof _showResultsSkeleton === 'function') { try { _showResultsSkeleton(); } catch (e0) {} }
            MallanAPI.idx.search(params).then(function(result) {
                if (requestSeq !== _serverSearchSeq) return; // superseded by a newer search
                if (typeof _serverSearchActive !== 'undefined') _serverSearchActive = false;
                var rows = (result && Array.isArray(result.listings)) ? result.listings : [];
                rows.forEach(function(l) {
                    // Presentation defaults ONLY where renderers need a string. Numeric
                    // provider facts stay null when the executor says null: a missing
                    // carrying cost or bath count is shown as unavailable, never as 0.
                    if (l.price == null) l.price = 0;
                    if (l.photoCount == null) l.photoCount = (l.images && l.images.length) || 0;
                    if (!l.status) l.status = 'ACTIVE';
                    if (!l.address) l.address = 'Address Unavailable';
                    if (!l.unit) l.unit = '';
                    if (!l.neighborhood) l.neighborhood = '';
                    if (!l.zip) l.zip = '';
                    if (!l.borough) l.borough = '';
                    if (!l.listedDate) l.listedDate = '--';
                    if (!l.company) l.company = '';
                    if (!l.permissions) l.permissions = { ownerOptOut: false, participantOnly: false, idxDisplay: true, internetDisplay: true, syndication: true };
                    if (typeof resolveNeighborhoodCanonical === 'function') resolveNeighborhoodCanonical(l);
                });
                // The global `listings` index only serves detail/photo lookups by id.
                // It is NEVER a result set: nothing is counted or rendered from it.
                var byId = {};
                listings.forEach(function(l, i) { byId[l.id] = i; });
                rows.forEach(function(l) {
                    var i = byId[l.id];
                    if (i !== undefined) {
                        var ex = listings[i];
                        if ((!l.images || l.images.length === 0) && ex.images && ex.images.length > 0) l.images = ex.images;
                        listings[i] = l;
                    } else {
                        listings.push(l);
                    }
                });
                searchResultsState.serverPaged = true;
                searchResultsState.filteredListings = rows;
                searchResultsState.serverTotal = (result && typeof result.total === 'number') ? result.total : rows.length;
                searchResultsState.serverCountMeaning = (result && result.countMeaning) || 'exact';
                if (result && result.attribution) {
                    var _attrEl = document.getElementById('searchAttributionText');
                    if (_attrEl) _attrEl.textContent = result.attribution;
                }
                var totalPages = Math.max(1, Math.ceil(searchResultsState.serverTotal / perPage));
                if (page > totalPages) searchResultsState.currentPage = totalPages;
                try {
                    if (typeof initializeSearchResults === 'function') initializeSearchResults();
                    if (typeof updateResultsCount === 'function') updateResultsCount();
                    if (typeof refreshResultsMap === 'function') refreshResultsMap();
                } catch (renderErr) {
                    console.error('[Search] Render after executor response failed:', renderErr);
                }
                _saveSearchState();
                if (rows.length === 0 && page === 1) showToast('No listings match these criteria.', 'warning');
            }).catch(function(err) {
                if (requestSeq !== _serverSearchSeq) return;
                if (typeof _serverSearchActive !== 'undefined') _serverSearchActive = false;
                console.error('[Search] Executor request failed:', err);
                // A failed search shows NOTHING in its place — never stale or partial rows.
                searchResultsState.filteredListings = [];
                searchResultsState.serverTotal = 0;
                searchResultsState.serverCountMeaning = 'exact';
                try {
                    if (typeof initializeSearchResults === 'function') initializeSearchResults();
                    if (typeof updateResultsCount === 'function') updateResultsCount();
                } catch (e2) {}
                var d = err && err.data;
                var msg = (d && (d.code === 'UNSUPPORTED_CRITERION' || d.code === 'INVALID_CRITERION'))
                    ? 'The Search executor refused: ' + ((d.unsupported || []).concat((d.invalid || []).map(function(i) { return i.param + ' (' + i.reason + ')'; })).join(', '))
                    : 'Search failed (' + ((err && err.message) || 'error') + '). Nothing was shown in its place — try again.';
                showToast(msg, 'error');
            });
        }
        window._serverSearch = _serverSearch;
        // Page navigation asks the executor for the page. Returns false when the
        // current result set is not server-paged (legacy local sets keep their slice).
        window.goToServerPage = function(n) {
            if (!searchResultsState || !searchResultsState.serverPaged) return false;
            var perPage = Math.min(Math.max(parseInt(searchResultsState.perPage, 10) || 50, 1), 200);
            var totalPages = Math.max(1, Math.ceil((searchResultsState.serverTotal || 0) / perPage));
            n = Math.min(Math.max(parseInt(n, 10) || 1, 1), totalPages);
            if (n === searchResultsState.currentPage) return true;
            searchResultsState.currentPage = n;
            if (typeof activeSearchCriteria !== 'undefined' && activeSearchCriteria) _serverSearch(activeSearchCriteria);
            return true;
        };
        window.reissueServerSearch = function() {
            if (!searchResultsState || !searchResultsState.serverPaged) return false;
            searchResultsState.currentPage = 1;
            if (typeof activeSearchCriteria !== 'undefined' && activeSearchCriteria) _serverSearch(activeSearchCriteria);
            return true;
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
            if (!query || query.length < 2) {
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
                            borough: listing.borough || 'Manhattan',
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
                    ' data-address="' + escapeHtml(b.address) + '" data-name="' + escapeHtml(b.name || '') + '" data-zip="' + escapeHtml(b.zip || '') + '" data-neighborhood="' + escapeHtml(b.neighborhood || '') + '">' +
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
            // The Search executor executes NO address criterion (it is refused by name), so the
            // autocomplete never asks it (Search Consolidation Packet 1). Suggestions come from
            // the local building index only. Kept as a no-op shape so callers are unchanged.
            Promise.resolve({ listings: [] }).then(function(result) {
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
                        borough: l.borough || 'Manhattan',
                        zip: l.zip || '',
                        type: ownershipLabel(l.ownership) || '',
                        yearBuilt: ''
                    });
                });
                // Re-render with merged results (only if dropdown still visible)
                if (!resultsDiv.classList.contains('hidden')) {
                    _renderAddressResults(serverMatches, resultsDiv, resultsDivId);
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
            if (input) input.value = address;
            if (resultsDiv) resultsDiv.classList.add('hidden');
        }

        // Close autocomplete dropdowns when clicking outside
        document.addEventListener('click', function(e) {
            var dropdowns = ['saleSearchAddrResults', 'rentalSearchAddrResults', 'buildingSearchAddrResults', 'advancedSearchAddrResults'];
            dropdowns.forEach(function(id) {
                var dd = document.getElementById(id);
                if (dd && !dd.contains(e.target)) {
                    var inputId = id.replace('AddrResults', 'Address');
                    var input = document.getElementById(inputId);
                    if (input && input !== e.target) dd.classList.add('hidden');
                }
            });
        });

        // Convert MM/DD/YYYY to YYYY-MM-DD (ISO) for OData API compatibility
        function _mdyToISO(mdyStr) {
            if (!mdyStr) return mdyStr;
            var parts = mdyStr.split('/');
            if (parts.length !== 3) return mdyStr;
            return parts[2] + '-' + parts[0].padStart(2, '0') + '-' + parts[1].padStart(2, '0');
        }

        function collectSearchCriteria() {
            var criteria = {};
            criteria.searchTab = currentSearchTab; // 'sale', 'rent', or 'building'

            // Unified basic form (all tabs share one form, data-show-on handles visibility)
            var activeBasicForm = document.getElementById('searchBasicMode');

            // Price range — use the correct IDs based on search tab and mode (basic vs advanced)
            var _advMode = document.getElementById('searchAdvancedMode');
            var _isAdvanced = _advMode && _advMode.style.display !== 'none' && !_advMode.classList.contains('hidden');
            var priceMin, priceMax, customMinId, customMaxId;
            if (_isAdvanced) {
                if (currentSearchTab === 'rent') {
                    priceMin = document.getElementById('advRentalMinRent');
                    priceMax = document.getElementById('advRentalMaxRent');
                    customMinId = 'advRentalMinRentCustom';
                    customMaxId = 'advRentalMaxRentCustom';
                } else {
                    priceMin = document.getElementById('advSaleMinPrice');
                    priceMax = document.getElementById('advSaleMaxPrice');
                    customMinId = 'advSaleMinPriceCustom';
                    customMaxId = 'advSaleMaxPriceCustom';
                }
            } else {
                if (currentSearchTab === 'rent') {
                    priceMin = document.getElementById('rentalMinRent');
                    priceMax = document.getElementById('rentalMaxRent');
                    customMinId = 'rentalMinRentCustom';
                    customMaxId = 'rentalMaxRentCustom';
                } else {
                    priceMin = document.getElementById('saleMinPrice');
                    priceMax = document.getElementById('saleMaxPrice');
                    customMinId = 'saleMinPriceCustom';
                    customMaxId = 'saleMaxPriceCustom';
                }
            }
            if (priceMin && priceMin.value && priceMin.value !== '') {
                if (priceMin.value === 'custom') {
                    // Read from companion custom input
                    var customMinEl = document.getElementById(customMinId);
                    if (customMinEl && customMinEl.value) {
                        var pMin = parseInt(customMinEl.value);
                        if (!isNaN(pMin) && pMin > 0) criteria.priceMin = pMin;
                    }
                } else {
                    var pMin = parseInt(priceMin.value);
                    if (!isNaN(pMin)) criteria.priceMin = pMin;
                }
            }
            if (priceMax && priceMax.value && priceMax.value !== '') {
                if (priceMax.value === 'custom') {
                    // Read from companion custom input
                    var customMaxEl = document.getElementById(customMaxId);
                    if (customMaxEl && customMaxEl.value) {
                        var pMax = parseInt(customMaxEl.value);
                        if (!isNaN(pMax) && pMax > 0) criteria.priceMax = pMax;
                    }
                } else {
                    var pMax = parseInt(priceMax.value);
                    if (!isNaN(pMax)) criteria.priceMax = pMax;
                }
            }

            // Bedrooms — use the correct IDs based on search tab and mode
            var bedsMin, bedsMax;
            if (_isAdvanced) {
                bedsMin = document.getElementById('adv-min-beds');
                bedsMax = document.getElementById('adv-max-beds');
            } else if (currentSearchTab === 'rent') {
                bedsMin = document.getElementById('rentalMinBeds');
                bedsMax = document.getElementById('rentalMaxBeds');
            } else {
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
            } else {
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
            } else {
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
            } else {
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

            // Ownership type (CommonInterest checkboxes)
            if (activeBasicForm) {
                var ownershipChecks = activeBasicForm.querySelectorAll('[data-field="CommonInterest"]:checked');
                if (ownershipChecks.length > 0) {
                    criteria.ownership = Array.from(ownershipChecks).map(function(cb) { return cb.getAttribute('data-value') || cb.value; });
                }
            }

            // PropertySubType checkboxes (Townhouse, Conversion, Single Family, etc.)
            var propertySubTypeChecked = [];
            var advModeEl = document.getElementById('searchAdvancedMode');
            var pstIsAdvanced = advModeEl && advModeEl.style.display !== 'none' && !advModeEl.classList.contains('hidden');
            var pstSelector = pstIsAdvanced
                ? '#searchAdvancedMode input[data-field="PropertySubType"]:checked'
                : (activeBasicForm ? '#' + activeBasicForm.id + ' input[data-field="PropertySubType"]:checked' : 'input[data-field="PropertySubType"]:checked');
            document.querySelectorAll(pstSelector).forEach(function(cb) {
                propertySubTypeChecked.push(cb.getAttribute('data-value') || cb.value);
            });
            if (propertySubTypeChecked.length > 0) {
                criteria.propertySubType = propertySubTypeChecked.join(',');
            }

            // Status checkboxes (MlsStatus) — collect all checked statuses
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
                var statusChecks = statusContainer.querySelectorAll('[data-field="MlsStatus"]:checked');
                if (statusChecks.length > 0) {
                    criteria.statuses = [];
                    statusChecks.forEach(function(cb) {
                        var val = cb.getAttribute('data-value');
                        var sub = cb.getAttribute('data-sub-status');
                        if (sub) {
                            // A sub-status (MlsStatus detail, e.g. "Contract Out") is NOT executable by the
                            // Search executor (MlsStatus is not filterable live). It is refused by name —
                            // never silently widened to its parent status.
                            criteria.statuses.push('sub:' + sub);
                        } else if (val) {
                            // Provider StandardStatus tokens exactly as the form declares them.
                            val.split(',').forEach(function(part) {
                                var s = part.trim();
                                if (s) criteria.statuses.push(s);
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
                if (selectedNeighborhoods.length > 0) {
                    criteria.neighborhoods = selectedNeighborhoods;
                }

                var selectedBoroughs = (typeof getSelectedBoroughs === 'function')
                    ? getSelectedBoroughs(tagsId)
                    : [];

                // Borough resolution — explicit borough chip wins; otherwise
                // derive from neighborhoods only when all are in one borough.
                if (selectedBoroughs.length > 0) {
                    // ALL selected boroughs — the executor ORs CityRegion (provider) and the
                    // borough storage variants (Mallan rows). No selected borough is ever dropped.
                    criteria.boroughs = selectedBoroughs.slice();
                } else if (selectedNeighborhoods.length > 0) {
                    var boroughs = selectedNeighborhoods.map(function(n) { return _findBoroughForNeighborhood(n); }).filter(Boolean);
                    var uniqueBoroughs = boroughs.filter(function(b, i, arr) { return arr.indexOf(b) === i; });
                    if (uniqueBoroughs.length > 0) criteria.boroughs = uniqueBoroughs;
                }
                // selectedBoroughs.length > 1 (multi-borough): leave
                // criteria.borough unset — backend cannot OR multiple
                // CityRegion values via a single param. User intent is
                // clearer if they pick neighborhoods in each borough instead.
            }

            // Quick Search fields — RLS ID, Zip, Unit (advanced mode has its own IDs)
            var rlsInputId, zipInputId, unitInputId;
            if (_isAdvanced) {
                rlsInputId = 'adv-rls-id';
                zipInputId = 'adv-zip';
                unitInputId = 'searchQuickUnit';
            } else {
                // Basic form ids are per tab (saleQuick* / rentalQuick*); the old
                // 'searchQuick*' ids never existed, which left these controls inert.
                rlsInputId = currentSearchTab === 'rent' ? 'rentalQuickRls' : 'saleQuickRls';
                zipInputId = currentSearchTab === 'rent' ? 'rentalQuickZip' : 'saleQuickZip';
                unitInputId = currentSearchTab === 'rent' ? 'rentalQuickUnit' : 'saleQuickUnit';
            }
            var rlsInput = document.getElementById(rlsInputId);
            var zipInput = document.getElementById(zipInputId);
            var unitInput = document.getElementById(unitInputId);
            if (rlsInput && rlsInput.value.trim()) criteria.rlsId = rlsInput.value.trim();
            if (zipInput && zipInput.value.trim()) criteria.zip = zipInput.value.trim();
            if (unitInput && unitInput.value.trim()) criteria.unit = unitInput.value.trim();

            // Keyword search (PublicRemarks contains)
            var keywordId = _isAdvanced ? 'adv-keyword' : 'searchKeyword';
            var keywordEl = document.getElementById(keywordId);
            if (keywordEl && keywordEl.value.trim()) {
                criteria.keyword = keywordEl.value.trim();
            }

            // Management Company (search against ListOfficeName — Trestle's closest field)
            var mgmtId = _isAdvanced ? 'adv-management' : 'searchManagementCompany';
            var mgmtEl = document.getElementById(mgmtId);
            if (mgmtEl && mgmtEl.value.trim()) {
                criteria.managementCompany = mgmtEl.value.trim();
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
            var drpPrefix = currentSearchTab === 'rent' ? 'rental' : 'sale';

            // Listed/Updated date range
            var activityTypeEl = document.getElementById(drpPrefix === 'rental' ? 'rentalListingActivityType' : 'saleListingActivityType');
            var activityType = activityTypeEl ? activityTypeEl.value : '';
            var listedDrp = document.querySelector('[data-drp="' + drpPrefix + 'ListedUpdated"]');
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
            var signedDrp = document.querySelector('[data-drp="' + drpPrefix + (drpPrefix === 'rental' ? 'LeaseSigned' : 'ContractSigned') + '"]');
            if (signedDrp) {
                var sFrom = signedDrp.getAttribute('data-from');
                var sTo = signedDrp.getAttribute('data-to');
                if (sFrom) {
                    criteria.contractDateFrom = _mdyToISO(sFrom);
                    criteria.contractDateTo = _mdyToISO(sTo) || _mdyToISO(sFrom);
                }
            }

            // Sold/Rented date range
            var soldDrp = document.querySelector('[data-drp="' + drpPrefix + (drpPrefix === 'rental' ? 'RentedDate' : 'SoldDate') + '"]');
            if (soldDrp) {
                var sdFrom = soldDrp.getAttribute('data-from');
                var sdTo = soldDrp.getAttribute('data-to');
                if (sdFrom) {
                    criteria.soldDateFrom = _mdyToISO(sdFrom);
                    criteria.soldDateTo = _mdyToISO(sdTo) || _mdyToISO(sdFrom);
                }
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

            // Building name search
            var buildingNameEl = document.getElementById('buildingSearchAddress') || document.getElementById('buildingNameSearch');
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
            var _handledFields = { 'MlsStatus': 1, 'CommonInterest': 1, 'PropertySubType': 1 };

            // Determine container: advanced mode if visible, else active basic form
            var _scanContainer = activeBasicForm;
            var _advMode = document.getElementById('searchAdvancedMode');
            if (_advMode && _advMode.style.display !== 'none' && !_advMode.classList.contains('hidden')) {
                _scanContainer = _advMode;
            }

            if (_scanContainer) {
                var _allChecked = _scanContainer.querySelectorAll('input[data-field]:checked');
                var _checkboxFilters = {};
                for (var _ci = 0; _ci < _allChecked.length; _ci++) {
                    var _cb = _allChecked[_ci];
                    var _field = _cb.getAttribute('data-field');
                    if (_handledFields[_field]) continue;
                    var _val = _cb.getAttribute('data-value') || _cb.value;
                    if (!_val) continue;
                    if (!_checkboxFilters[_field]) _checkboxFilters[_field] = [];
                    if (_checkboxFilters[_field].indexOf(_val) === -1) {
                        _checkboxFilters[_field].push(_val);
                    }
                }
                // Scan <select> elements with data-field
                _scanContainer.querySelectorAll('select[data-field]').forEach(function(sel) {
                    if (sel.selectedIndex <= 0) return;
                    var _field = sel.getAttribute('data-field');
                    if (_handledFields[_field]) return;
                    var _val = sel.value;
                    if (_field && _val) {
                        if (!_checkboxFilters[_field]) _checkboxFilters[_field] = [];
                        if (_checkboxFilters[_field].indexOf(_val) === -1) {
                            _checkboxFilters[_field].push(_val);
                        }
                    }
                });

                if (Object.keys(_checkboxFilters).length > 0) {
                    criteria.checkboxFilters = _checkboxFilters;
                }
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
            // Reset all select elements in basic form (unified — one form for all tabs)
            var forms = ['searchBasicMode'];
            forms.forEach(function(formId) {
                var form = document.getElementById(formId);
                if (!form) return;

                // Restore any selects that were replaced by custom text inputs
                // (beds, baths, rooms, sqft "Custom" option replaces the select with an input)
                form.querySelectorAll('input[data-was-select="true"]').forEach(function(inp) {
                    var wrapper = inp.closest('.flex.items-center');
                    if (wrapper && inp.getAttribute('data-original-options')) {
                        var restoredSelect = document.createElement('select');
                        restoredSelect.id = inp.id;
                        restoredSelect.className = inp.className;
                        restoredSelect.innerHTML = inp.getAttribute('data-original-options');
                        wrapper.parentNode.replaceChild(restoredSelect, wrapper);
                    }
                });

                form.querySelectorAll('select').forEach(function(sel) { sel.selectedIndex = 0; });
                form.querySelectorAll('input[type="checkbox"]').forEach(function(cb) { cb.checked = false; });
                form.querySelectorAll('input[type="text"], input[type="number"]').forEach(function(inp) { inp.value = ''; });
            });
            // Also clear advanced mode checkboxes
            var advMode = document.getElementById('searchAdvancedMode');
            if (advMode) {
                // Restore replaced selects in advanced mode too
                advMode.querySelectorAll('input[data-was-select="true"]').forEach(function(inp) {
                    var wrapper = inp.closest('.flex.items-center');
                    if (wrapper && inp.getAttribute('data-original-options')) {
                        var restoredSelect = document.createElement('select');
                        restoredSelect.id = inp.id;
                        restoredSelect.className = inp.className;
                        restoredSelect.innerHTML = inp.getAttribute('data-original-options');
                        wrapper.parentNode.replaceChild(restoredSelect, wrapper);
                    }
                });

                advMode.querySelectorAll('input[type="checkbox"]').forEach(function(cb) { cb.checked = false; });
                advMode.querySelectorAll('select').forEach(function(sel) { sel.selectedIndex = 0; });
                advMode.querySelectorAll('input[type="text"], input[type="number"]').forEach(function(inp) { inp.value = ''; });
            }
            // Re-check the "Active" checkbox by default (sale basic form)
            var activeCheck = document.querySelector('#searchBasicMode [data-field="MlsStatus"][data-value="Active"]');
            if (activeCheck) activeCheck.checked = true;
            // (rental form unified — no separate re-check needed)
            // Re-check the "Active" checkbox in advanced mode (sale status)
            var advSaleActive = document.querySelector('#saleStatusOptions [data-field="MlsStatus"][data-value="Active"]');
            if (advSaleActive) advSaleActive.checked = true;
            // Re-check the "Active" checkbox in advanced mode (rental status)
            var advRentalActive = document.querySelector('#rentalStatusOptions [data-field="MlsStatus"][data-value="Active"]');
            if (advRentalActive) advRentalActive.checked = true;
            // Clear neighborhood tags and internal selection state
            if (typeof clearAllNeighborhoods === 'function') clearAllNeighborhoods();

            // Hide custom price input rows
            var saleCustomRow = document.getElementById('saleCustomPriceRow');
            if (saleCustomRow) saleCustomRow.classList.add('hidden');
            var rentalCustomRow = document.getElementById('rentalCustomPriceRow');
            if (rentalCustomRow) rentalCustomRow.classList.add('hidden');

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
            // Update filter count after clearing
            updateFilterCount();
        }

        // ── Filter count for sticky search bar ──
        function updateFilterCount() {
            var count = 0;
            var advForm = document.getElementById('searchAdvancedMode');
            var form = (advForm && advForm.style.display !== 'none' && !advForm.classList.contains('hidden'))
                ? advForm : document.getElementById('searchBasicMode');
            if (!form) return;
            form.querySelectorAll('select').forEach(function(s) { if (s.selectedIndex > 0) count++; });
            form.querySelectorAll('input[type="text"], input[type="number"]').forEach(function(i) { if (i.value.trim()) count++; });
            form.querySelectorAll('input[type="checkbox"]:checked').forEach(function(cb) {
                if (cb.getAttribute('data-field') === 'MlsStatus' && cb.getAttribute('data-value') === 'Active') return;
                count++;
            });
            form.querySelectorAll('.drp-wrapper[data-from]').forEach(function(w) {
                if (w.getAttribute('data-from')) count++;
            });
            var el = document.getElementById('activeFilterCount');
            if (el) el.textContent = count === 0 ? 'No filters' : count + ' filter' + (count > 1 ? 's' : '') + ' applied';
        }

        // Wire filter count to form changes (delegated)
        document.addEventListener('change', function(e) {
            if (e.target.closest('#searchBasicMode, #searchAdvancedMode')) updateFilterCount();
        });
        document.addEventListener('input', function(e) {
            if (e.target.closest('#searchBasicMode, #searchAdvancedMode') && (e.target.type === 'text' || e.target.type === 'number')) {
                clearTimeout(window._filterCountDebounce);
                window._filterCountDebounce = setTimeout(updateFilterCount, 300);
            }
        });

        // Enter key triggers search (when in search form, not textarea)
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.target.closest('textarea') && !e.target.closest('.modal, [role="dialog"]')) {
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

                    // Update parent state: if all siblings unchecked, uncheck parent
                    var parentDetails = cb.closest('details');
                    if (parentDetails) {
                        var parentSummary = parentDetails.querySelector(':scope > summary > input[type="checkbox"]');
                        if (parentSummary && parentSummary !== cb) {
                            var allChildren = parentDetails.querySelectorAll('input[type="checkbox"]');
                            var anyChecked = false;
                            allChildren.forEach(function(child) {
                                if (child !== parentSummary && child.checked) anyChecked = true;
                            });
                            parentSummary.checked = anyChecked;
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

        // Initialize transit search (subway line click handlers)
        if (typeof TransitSearch !== 'undefined') {
            TransitSearch.init();
        }

        // ── Display context detection ──
        // 'idx' = public IDX (default) | 'vow' = authenticated client portal | 'crm' = agent/broker
        var searchDisplayContext = 'idx';
        if (typeof LOGGED_IN_AGENT !== 'undefined' && LOGGED_IN_AGENT && LOGGED_IN_AGENT.id) {
            searchDisplayContext = 'crm';
        } else if (localStorage.getItem('vow_display_context') === 'vow') {
            searchDisplayContext = 'vow';
        }

        // filterListings() — the browser-local Search membership engine — was REMOVED
        // (Search Consolidation Packet 1, 2026-09-05). Search membership, count, order and
        // pages come from the canonical executor only.

        function updateResultsCount() {
            var perPage = searchResultsState.perPage || 50;
            var count, label;
            if (searchResultsState.serverPaged && searchResultsState.serverTotal != null) {
                count = searchResultsState.serverTotal;
                label = (searchResultsState.serverCountMeaning === 'lower_bound' ? 'At least ' : '') + count.toLocaleString() + ' Results';
            } else {
                var filtered = searchResultsState.filteredListings || listings;
                count = filtered.length;
                label = count + ' Results';
            }
            var totalPages = Math.max(1, Math.ceil(count / perPage));
            var countEls = document.querySelectorAll('#resultsCount, #resultsCount2');
            countEls.forEach(function(el) { el.textContent = label; });
            var totalPagesEl = document.getElementById('totalPages');
            if (totalPagesEl) totalPagesEl.textContent = totalPages;
            var currentPageEl = document.getElementById('currentPage');
            if (currentPageEl) currentPageEl.textContent = searchResultsState.currentPage;
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

            var basicMode = document.getElementById('searchBasicMode');
            var advancedMode = document.getElementById('searchAdvancedMode');

            // Toggle between basic (unified) and advanced mode
            if (isBasicMode) {
                if (basicMode) basicMode.style.display = 'block';
                if (advancedMode) advancedMode.style.display = 'none';
            } else {
                if (basicMode) basicMode.style.display = 'none';
                if (advancedMode) advancedMode.style.display = 'block';
            }

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

            // Build applied filters pills
            buildRefineFilterPills(c);
        }

        function setSelectValue(id, val) {
            var sel = document.getElementById(id);
            if (!sel) return;
            val = String(val);
            // Try exact match first
            for (var i = 0; i < sel.options.length; i++) {
                if (sel.options[i].value === val) { sel.selectedIndex = i; return; }
            }
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

            // Price
            var pMin = document.getElementById('refineMinPrice');
            var pMax = document.getElementById('refineMaxPrice');
            if (pMin && pMin.value) c.priceMin = parseInt(pMin.value); else delete c.priceMin;
            if (pMax && pMax.value) c.priceMax = parseInt(pMax.value); else delete c.priceMax;

            // Beds
            var bMin = document.getElementById('refineMinBeds');
            var bMax = document.getElementById('refineMaxBeds');
            if (bMin && bMin.value !== '') c.bedsMin = parseInt(bMin.value); else delete c.bedsMin;
            if (bMax && bMax.value !== '') c.bedsMax = parseInt(bMax.value); else delete c.bedsMax;

            // Baths
            var baMin = document.getElementById('refineMinBaths');
            var baMax = document.getElementById('refineMaxBaths');
            if (baMin && baMin.value !== '') c.bathsMin = parseFloat(baMin.value); else delete c.bathsMin;
            if (baMax && baMax.value !== '') c.bathsMax = parseFloat(baMax.value); else delete c.bathsMax;

            // Statuses
            var statuses = [];
            if (document.getElementById('refineStatusActive') && document.getElementById('refineStatusActive').checked) statuses.push('ACTIVE');
            if (document.getElementById('refineStatusComingSoon') && document.getElementById('refineStatusComingSoon').checked) statuses.push('COMING_SOON');
            if (document.getElementById('refineStatusPending') && document.getElementById('refineStatusPending').checked) statuses.push('PENDING');
            if (document.getElementById('refineStatusContract') && document.getElementById('refineStatusContract').checked) { statuses.push('CONTRACT'); statuses.push('UNDER_CONTRACT'); }
            if (document.getElementById('refineStatusClosed') && document.getElementById('refineStatusClosed').checked) statuses.push('CLOSED');
            if (statuses.length > 0) c.statuses = statuses; else delete c.statuses;

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
                    serverPaged: !!searchResultsState.serverPaged,
                    serverTotal: searchResultsState.serverTotal,
                    criteria: (searchResultsState.serverPaged && typeof activeSearchCriteria !== 'undefined') ? activeSearchCriteria : null,
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

                // Rebuild filteredListings from saved IDs
                if (state.serverPaged && state.criteria) {
                    // Server-paged set: the page is re-fetched from the executor, never
                    // rebuilt from whatever rows happen to be cached in the browser.
                    activeSearchCriteria = state.criteria;
                    searchResultsState.serverPaged = true;
                    searchResultsState.serverTotal = (typeof state.serverTotal === 'number') ? state.serverTotal : null;
                    searchResultsState.serverCountMeaning = null;
                    searchResultsState.filteredListings = [];
                    searchResultsState.currentPage = state.page || 1;
                    if (typeof MallanAPI !== 'undefined' && typeof MallanAPI.onReady === 'function') {
                        MallanAPI.onReady(function() { _serverSearch(activeSearchCriteria); });
                    }
                    return true;
                }
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

            // Unified basic form (data-show-on handles section visibility per tab)
            var basicMode = document.getElementById('searchBasicMode');
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

            // Show unified basic form or advanced mode
            if (isBasicMode) {
                if (basicMode) basicMode.style.display = 'block';
                if (advancedMode) advancedMode.style.display = 'none';
            } else {
                if (basicMode) basicMode.style.display = 'none';
                if (advancedMode) advancedMode.style.display = 'block';
            }

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
            var basicMode = document.getElementById('searchBasicMode');
            var advancedMode = document.getElementById('searchAdvancedMode');
            var expandControls = document.getElementById('expandCollapseControls');

            try { sessionStorage.setItem('searchMode', mode); } catch(e) {}

            if (mode === 'basic') {
                btnBasic.classList.remove('text-gray-500');
                btnBasic.classList.add('bg-gray-900', 'text-white');
                btnAdvanced.classList.remove('bg-gray-900', 'text-white');
                btnAdvanced.classList.add('text-gray-500');
                if (expandControls) expandControls.classList.add('hidden');
                if (basicMode) basicMode.style.display = 'block';
                if (advancedMode) advancedMode.style.display = 'none';
            } else {
                btnAdvanced.classList.remove('text-gray-500');
                btnAdvanced.classList.add('bg-gray-900', 'text-white');
                btnBasic.classList.remove('bg-gray-900', 'text-white');
                btnBasic.classList.add('text-gray-500');
                if (expandControls) { expandControls.classList.remove('hidden'); expandControls.classList.add('flex'); }
                if (advancedMode) advancedMode.style.display = 'block';
                if (basicMode) basicMode.style.display = 'none';
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
        }

        function backToCompSelection() {
            // Hide all comp pages
            document.querySelectorAll('.comparables-page').forEach(page => {
                page.style.display = 'none';
            });

            // Show selection page
            document.getElementById('comparablesSelectionPage').style.display = 'block';
        }

        function toggleCompSaleRent(type) {
            // Selection page elements
            var compSaleDates = document.getElementById('compSaleDates');
            var compRentalDates = document.getElementById('compRentalDates');

            // Subject Buildings page elements
            var compBuildingPriceLabel = document.getElementById('compBuildingPriceLabel');
            var compBuildingSaleDates = document.getElementById('compBuildingSaleDates');
            var compBuildingRentalDates = document.getElementById('compBuildingRentalDates');

            // General Criteria page elements
            var compGeneralPriceLabel = document.getElementById('compGeneralPriceLabel');
            var compGeneralSaleDates = document.getElementById('compGeneralSaleDates');
            var compGeneralRentalDates = document.getElementById('compGeneralRentalDates');

            // Update all sale/rent buttons in comparables
            var saleBtns = ['btnCompSale', 'btnCompPropertySale', 'btnCompBuildingSale', 'btnCompGeneralSale'];
            var rentBtns = ['btnCompRent', 'btnCompPropertyRent', 'btnCompBuildingRent', 'btnCompGeneralRent'];

            if (type === 'sale') {
                // Update button styling
                saleBtns.forEach(id => {
                    var btn = document.getElementById(id);
                    if (btn) {
                        btn.classList.remove('bg-gray-200', 'text-gray-700');
                        btn.classList.add('bg-blue-600', 'text-white');
                    }
                });
                rentBtns.forEach(id => {
                    var btn = document.getElementById(id);
                    if (btn) {
                        btn.classList.remove('bg-blue-600', 'text-white');
                        btn.classList.add('bg-gray-200', 'text-gray-700');
                    }
                });

                // Update labels to "Price"
                if (compBuildingPriceLabel) compBuildingPriceLabel.textContent = 'Price';
                if (compGeneralPriceLabel) compGeneralPriceLabel.textContent = 'Price';

                // Show sale dates, hide rental dates
                if (compSaleDates) compSaleDates.style.display = 'block';
                if (compRentalDates) compRentalDates.style.display = 'none';
                if (compBuildingSaleDates) compBuildingSaleDates.style.display = 'block';
                if (compBuildingRentalDates) compBuildingRentalDates.style.display = 'none';
                if (compGeneralSaleDates) compGeneralSaleDates.style.display = 'block';
                if (compGeneralRentalDates) compGeneralRentalDates.style.display = 'none';
            } else {
                // Update button styling
                rentBtns.forEach(id => {
                    var btn = document.getElementById(id);
                    if (btn) {
                        btn.classList.remove('bg-gray-200', 'text-gray-700');
                        btn.classList.add('bg-blue-600', 'text-white');
                    }
                });
                saleBtns.forEach(id => {
                    var btn = document.getElementById(id);
                    if (btn) {
                        btn.classList.remove('bg-blue-600', 'text-white');
                        btn.classList.add('bg-gray-200', 'text-gray-700');
                    }
                });

                // Update labels to "Rent"
                if (compBuildingPriceLabel) compBuildingPriceLabel.textContent = 'Rent';
                if (compGeneralPriceLabel) compGeneralPriceLabel.textContent = 'Rent';

                // Show rental dates, hide sale dates
                if (compRentalDates) compRentalDates.style.display = 'block';
                if (compSaleDates) compSaleDates.style.display = 'none';
                if (compBuildingRentalDates) compBuildingRentalDates.style.display = 'block';
                if (compBuildingSaleDates) compBuildingSaleDates.style.display = 'none';
                if (compGeneralRentalDates) compGeneralRentalDates.style.display = 'block';
                if (compGeneralSaleDates) compGeneralSaleDates.style.display = 'none';
            }
        }

        function showCompResults(page) {
            // Determine if we're in sale or rental mode by checking button states
            var isSaleMode = true;
            if (page === 'property') {
                var btn = document.getElementById('btnCompPropertySale');
                isSaleMode = btn && btn.classList.contains('bg-blue-600');
            } else if (page === 'building') {
                var btn = document.getElementById('btnCompBuildingSale');
                isSaleMode = btn && btn.classList.contains('bg-blue-600');
            } else if (page === 'general') {
                var btn = document.getElementById('btnCompGeneralSale');
                isSaleMode = btn && btn.classList.contains('bg-blue-600');
            }

            // Show results section and update label
            var pageKey = page.charAt(0).toUpperCase() + page.slice(1);
            var resultsDiv = document.getElementById('comp' + pageKey + 'Results');
            var resultsTypeSpan = document.getElementById('comp' + pageKey + 'ResultsType');

            if (resultsDiv) resultsDiv.style.display = 'block';
            if (resultsTypeSpan) resultsTypeSpan.textContent = isSaleMode ? 'Comps for Sale' : 'Comps for Rental';

            // ── Collect comp criteria and query the search API ──
            var params = {};
            params.type = isSaleMode ? 'sale' : 'rental';
            // Comps = Closed/Sold/Rented listings
            params.status = 'Closed';

            if (page === 'property') {
                // Subject Property: search by address for sold comps
                var addrEl = document.getElementById('compPropertyAddress');
                if (addrEl && addrEl.value.trim()) {
                    params.address = addrEl.value.trim();
                } else {
                    showToast('Please enter an address or building name.', 'warning');
                    return;
                }
            } else if (page === 'building') {
                // Subject Buildings: address + unit criteria
                var bAddrEl = document.getElementById('compBuildingAddress');
                if (bAddrEl && bAddrEl.value.trim()) {
                    params.buildingName = bAddrEl.value.trim();
                }
                var _readSelect = function(id) {
                    var el = document.getElementById(id);
                    return (el && el.value && el.value !== '' && el.value !== 'custom') ? el.value : null;
                };
                var bpMin = _readSelect('compBuildingMinPrice');
                var bpMax = _readSelect('compBuildingMaxPrice');
                if (bpMin) params.minPrice = parseInt(bpMin);
                if (bpMax) params.maxPrice = parseInt(bpMax);
                var bbMin = _readSelect('compBuildingMinBeds');
                var bbMax = _readSelect('compBuildingMaxBeds');
                if (bbMin != null) params.minBeds = parseInt(bbMin);
                if (bbMax != null) params.maxBeds = parseInt(bbMax);
                var baMin = _readSelect('compBuildingMinBaths');
                var baMax = _readSelect('compBuildingMaxBaths');
                if (baMin) params.minBaths = parseFloat(baMin);
                if (baMax) params.maxBaths = parseFloat(baMax);
                var sfMin = _readSelect('compBuildingMinSqft');
                var sfMax = _readSelect('compBuildingMaxSqft');
                if (sfMin) params.minSqft = parseInt(sfMin);
                if (sfMax) params.maxSqft = parseInt(sfMax);
            } else if (page === 'general') {
                // General Criteria: flexible search
                var gAddrEl = document.getElementById('compGeneralAddress');
                if (gAddrEl && gAddrEl.value.trim()) {
                    params.address = gAddrEl.value.trim();
                }
                var _rs = function(id) {
                    var el = document.getElementById(id);
                    return (el && el.value && el.value !== '' && el.value !== 'custom') ? el.value : null;
                };
                var gpMin = _rs('compGeneralMinPrice');
                var gpMax = _rs('compGeneralMaxPrice');
                if (gpMin) params.minPrice = parseInt(gpMin);
                if (gpMax) params.maxPrice = parseInt(gpMax);
                var gbMin = _rs('compGeneralMinBeds');
                var gbMax = _rs('compGeneralMaxBeds');
                if (gbMin != null) params.minBeds = parseInt(gbMin);
                if (gbMax != null) params.maxBeds = parseInt(gbMax);
                var gaMin = _rs('compGeneralMinBaths');
                var gaMax = _rs('compGeneralMaxBaths');
                if (gaMin) params.minBaths = parseFloat(gaMin);
                if (gaMax) params.maxBaths = parseFloat(gaMax);
                var gsMin = _rs('compGeneralMinSqft');
                var gsMax = _rs('compGeneralMaxSqft');
                if (gsMin) params.minSqft = parseInt(gsMin);
                if (gsMax) params.maxSqft = parseInt(gsMax);
            }

            params.limit = 100;

            // Show loading state
            if (resultsDiv) {
                resultsDiv.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-blue-600"></i><p class="text-sm text-gray-600 mt-2">Searching comparables...</p></div>';
            }

            console.log('[Comps] Searching:', JSON.stringify(params));
            if (typeof MallanAPI === 'undefined') {
                if (resultsDiv) resultsDiv.innerHTML = '<div class="text-center py-8 text-red-600">API not available. Please refresh.</div>';
                return;
            }

            MallanAPI.idx.search(params).then(function(result) {
                if (!result || !result.listings || result.listings.length === 0) {
                    if (resultsDiv) {
                        resultsDiv.innerHTML = '<div class="text-center py-8"><i class="fas fa-search text-3xl text-gray-400 mb-2"></i><p class="text-sm text-gray-600">No comparable listings found. Try broadening your criteria.</p></div>';
                    }
                    return;
                }
                var compListings = result.listings;
                console.log('[Comps] Found:', compListings.length, 'results');

                // Render comp results as a table
                var html = '<div class="flex items-center justify-between mb-4"><h3 class="text-lg font-semibold text-gray-900"><span>' + (isSaleMode ? 'Comps for Sale' : 'Comps for Rental') + '</span></h3><span class="text-sm text-gray-600">' + compListings.length + ' Results</span></div>';
                html += '<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b bg-gray-50 text-left">';
                html += '<th class="px-3 py-2">Address</th><th class="px-3 py-2">Unit</th>';
                html += '<th class="px-3 py-2 text-right">' + (isSaleMode ? 'Price' : 'Rent') + '</th>';
                html += '<th class="px-3 py-2">Beds</th><th class="px-3 py-2">Baths</th>';
                html += '<th class="px-3 py-2">SqFt</th><th class="px-3 py-2">Status</th>';
                html += '<th class="px-3 py-2">' + (isSaleMode ? 'Sold Date' : 'Rented Date') + '</th>';
                html += '</tr></thead><tbody>';
                compListings.forEach(function(l, i) {
                    var rowClass = i % 2 === 0 ? '' : 'bg-gray-50';
                    var priceStr = l.price ? '$' + Number(l.price).toLocaleString() : '--';
                    var sqftStr = l.intSqft ? Number(l.intSqft).toLocaleString() + ' SF' : '--';
                    var dateStr = l.updatedDate || l.listedDate || '--';
                    html += '<tr class="border-b ' + rowClass + ' hover:bg-blue-50 cursor-pointer" onclick="showListingDetail(\'' + (l.lid || l.id) + '\')">';
                    html += '<td class="px-3 py-2 font-medium">' + (l.address || '--') + '</td>';
                    html += '<td class="px-3 py-2">' + (l.unit || '--') + '</td>';
                    html += '<td class="px-3 py-2 text-right font-semibold">' + priceStr + '</td>';
                    html += '<td class="px-3 py-2">' + (l.beds != null ? l.beds : '--') + '</td>';
                    html += '<td class="px-3 py-2">' + (l.baths != null ? l.baths : '--') + '</td>';
                    html += '<td class="px-3 py-2">' + sqftStr + '</td>';
                    html += '<td class="px-3 py-2"><span class="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">' + (l.status || 'CLOSED') + '</span></td>';
                    html += '<td class="px-3 py-2">' + dateStr + '</td>';
                    html += '</tr>';
                });
                html += '</tbody></table></div>';

                if (resultsDiv) resultsDiv.innerHTML = html;
            }).catch(function(err) {
                console.error('[Comps] Error:', err);
                if (resultsDiv) resultsDiv.innerHTML = '<div class="text-center py-8 text-red-600"><i class="fas fa-exclamation-circle mr-2"></i>Error loading comparables: ' + err.message + '</div>';
            });
        }

        // ═══════════════════════════════════════════════════════
        // CUSTOM VALUE HANDLER — Converts select to text input when "Custom" is chosen
        // Works for price, beds, baths, rooms, sqft selects
        // Price selects use companion input rows instead of replacement.
        // ═══════════════════════════════════════════════════════

        // Map of price select IDs → their companion custom input row and field IDs
        var _priceCustomMap = {
            saleMinPrice:      { row: 'saleCustomPriceRow',       input: 'saleMinPriceCustom' },
            saleMaxPrice:      { row: 'saleCustomPriceRow',       input: 'saleMaxPriceCustom' },
            rentalMinRent:     { row: 'rentalCustomPriceRow',     input: 'rentalMinRentCustom' },
            rentalMaxRent:     { row: 'rentalCustomPriceRow',     input: 'rentalMaxRentCustom' },
            advSaleMinPrice:   { row: 'advSaleCustomPriceRow',    input: 'advSaleMinPriceCustom' },
            advSaleMaxPrice:   { row: 'advSaleCustomPriceRow',    input: 'advSaleMaxPriceCustom' },
            advRentalMinRent:  { row: 'advRentalCustomPriceRow',  input: 'advRentalMinRentCustom' },
            advRentalMaxRent:  { row: 'advRentalCustomPriceRow',  input: 'advRentalMaxRentCustom' }
        };

        // Pair map for price selects: each select ID → its partner select ID
        var _pricePairMap = {
            saleMinPrice:     'saleMaxPrice',
            saleMaxPrice:     'saleMinPrice',
            rentalMinRent:    'rentalMaxRent',
            rentalMaxRent:    'rentalMinRent',
            advSaleMinPrice:  'advSaleMaxPrice',
            advSaleMaxPrice:  'advSaleMinPrice',
            advRentalMinRent: 'advRentalMaxRent',
            advRentalMaxRent: 'advRentalMinRent'
        };

        // Show/hide custom price row when any price select changes
        function _handlePriceCustomToggle(sel) {
            var mapping = _priceCustomMap[sel.id];
            if (!mapping) return false; // not a price select
            var row = document.getElementById(mapping.row);
            var input = document.getElementById(mapping.input);
            if (!row) return false;

            if (sel.value === 'custom') {
                row.classList.remove('hidden');
                row.style.display = 'flex';
                if (input) input.focus();
            } else {
                // Hide row only if BOTH selects in the pair are non-custom
                var pairId = _pricePairMap[sel.id] || null;
                var pairSel = pairId ? document.getElementById(pairId) : null;
                if (!pairSel || pairSel.value !== 'custom') {
                    row.classList.add('hidden');
                    row.style.display = 'none';
                }
                // Clear the custom input when switching away from custom
                if (input) input.value = '';
            }
            return true; // handled
        }

        (function() {
            document.addEventListener('change', function(e) {
                var sel = e.target;
                if (sel.tagName !== 'SELECT') return;

                // Price selects: use companion input row instead of replacing
                if (sel.value === 'custom' && _priceCustomMap[sel.id]) {
                    _handlePriceCustomToggle(sel);
                    return;
                }
                // Non-custom value on a price select: check if we need to hide the row
                if (_priceCustomMap[sel.id]) {
                    _handlePriceCustomToggle(sel);
                    return;
                }

                if (sel.value !== 'custom') return;

                // Determine what kind of field this is (for placeholder and formatting)
                var id = sel.id || '';
                var isPrice = id.toLowerCase().indexOf('price') !== -1 || id.toLowerCase().indexOf('rent') !== -1;
                var isSqft = id.toLowerCase().indexOf('sqft') !== -1;
                var placeholder = isPrice ? 'Enter price (e.g. 1500000)' : isSqft ? 'Enter sqft' : 'Enter value';

                // Create text input to replace the select
                var input = document.createElement('input');
                input.type = 'number';
                input.id = sel.id;
                input.className = sel.className;
                input.placeholder = placeholder;
                input.style.cssText = sel.style.cssText;
                input.setAttribute('data-was-select', 'true');

                // Store the original select's options for restoration
                var optionsHTML = sel.innerHTML;
                input.setAttribute('data-original-options', optionsHTML);

                // Add a clear/restore button
                var wrapper = document.createElement('div');
                wrapper.className = 'flex items-center gap-1 flex-1 min-w-0';
                wrapper.innerHTML = '';
                var clearBtn = document.createElement('button');
                clearBtn.type = 'button';
                clearBtn.className = 'text-red-400 hover:text-red-600 text-xs flex-shrink-0';
                clearBtn.innerHTML = '<i class="fas fa-times"></i>';
                clearBtn.title = 'Back to dropdown';
                clearBtn.onclick = function() {
                    // Restore the original select
                    var restoredSelect = document.createElement('select');
                    restoredSelect.id = input.id;
                    restoredSelect.className = input.className;
                    restoredSelect.innerHTML = input.getAttribute('data-original-options');
                    wrapper.parentNode.replaceChild(restoredSelect, wrapper);
                    // Trigger tracker update
                    if (typeof updateTrackerMatchEstimate === 'function') updateTrackerMatchEstimate();
                };

                sel.parentNode.replaceChild(wrapper, sel);
                wrapper.appendChild(input);
                wrapper.appendChild(clearBtn);
                input.focus();

                // Trigger tracker update on input
                input.addEventListener('input', function() {
                    if (typeof updateTrackerMatchEstimate === 'function') updateTrackerMatchEstimate();
                });
            });
        })();

