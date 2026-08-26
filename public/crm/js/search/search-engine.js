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
        /**
         * The building-fact control ids for a given tab/mode.
         *
         * ONE resolver, used by BOTH collectSearchCriteria() and Saved Search
         * restore. They previously disagreed: the collector read per-tab ids
         * while restore wrote every saved year/floor/unit value into the
         * BUILDING tab's controls, so a Sale search saved with a year range
         * reloaded with those controls empty and silently executed without it.
         * Save -> reload -> execute returned a DIFFERENT search.
         *
         * Duplicating the table is what allowed them to drift, so the table now
         * exists once.
         */
        window._resolveBuildingFieldIds = function(tab, isAdvanced) {
            if (isAdvanced) {
                return {
                    yearMin: 'adv-year-built-from', yearMax: 'adv-year-built-to',
                    unitsMin: 'adv-bldg-units-min', unitsMax: 'adv-bldg-units-max',
                    floorsMin: 'adv-floors-min',    floorsMax: 'adv-floors-max'
                };
            }
            if (tab === 'building') {
                return {
                    yearMin: 'buildingMinYear', yearMax: 'buildingMaxYear',
                    unitsMin: 'buildingMinUnits', unitsMax: 'buildingMaxUnits',
                    floorsMin: 'buildingMinFloors', floorsMax: 'buildingMaxFloors'
                };
            }
            var p = (tab === 'rent') ? 'rentalBuilding' : 'saleBuilding';
            return {
                yearMin: p + 'MinYear', yearMax: p + 'MaxYear',
                unitsMin: p + 'MinUnits', unitsMax: p + 'MaxUnits',
                floorsMin: p + 'MinFloors', floorsMax: p + 'MaxFloors'
            };
        };

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

                // ── P1 multi-borough advisory ─────────────────────────────
                // collectSearchCriteria() at search-engine.js:880-895
                // intentionally leaves criteria.borough unset when 2+
                // borough-level chips are selected, because the backend
                // OData builder cannot OR multiple CityRegion values
                // through a single param. Without this notice, the user
                // would see their two borough chips and assume the result
                // set was constrained to those boroughs — when in fact
                // the borough constraint was silently dropped, BROADENING
                // the search to all NYC. Surface the advisory once per
                // submission so the user can react before paging through.
                try {
                    var _activeTagsId = (typeof _resolveActiveNeighborhoodTagsId === 'function')
                        ? _resolveActiveNeighborhoodTagsId()
                        : 'saleNeighborhoodTags';
                    var _selectedBoroughs = (typeof getSelectedBoroughs === 'function')
                        ? getSelectedBoroughs(_activeTagsId)
                        : [];
                    if (_selectedBoroughs.length > 1) {
                    // The multi-borough advisory was REMOVED 2026-08-26. It told the agent
                    // the borough constraint had been dropped, which is now false:
                    // collectSearchCriteria sends every selected borough comma-separated
                    // and the server renders one CityRegion disjunction. A warning that
                    // states a disproven fact is worse than no warning.
                    }
                } catch (_advErr) {
                    // Non-fatal — advisory failure must not block the search.
                }

                // Filter locally loaded listings only when the criteria set is
                // fully server-honored. Programmatic callers can still pass old
                // Open House/transit/grid keys; the server strips those, so a
                // local pre-render would briefly show a narrower, false result.
                var hasLocalData = typeof listings !== 'undefined' && listings && listings.length > 0;
                var hasServerIgnoredCriteria = _hasServerIgnoredCriteria(activeSearchCriteria);
                var localResults = (hasLocalData && !hasServerIgnoredCriteria)
                    ? filterListings(listings, activeSearchCriteria)
                    : [];

                // Show results section (with local results or empty while server loads).
                // PROVISIONAL: rendered for responsiveness, not an answer yet.
                searchResultsState.filteredListings = localResults;
                searchResultsState.currentPage = 1;
                _setResultProvenance('provisional');
                _showSearchResults();

                // Always also query the server for fresh results
                if (typeof MallanAPI !== 'undefined') {
                    _serverSearch(activeSearchCriteria, localResults);
                }
            } catch (err) {
                showToast('Search error: ' + err.message + '. Check browser console (F12) for details.', 'error');
            }
        }

        // ══════════════════════════════════════════════════════════════════
        // RESULT PROVENANCE — is what is on screen an ANSWER, or a preview?
        //
        //   'none'          no result universe. Nothing has been answered.
        //   'provisional'   a local preview, rendered for responsiveness while
        //                   the authoritative request is in flight.
        //   'authoritative' the server answered. THIS is a Search result.
        //
        // WHY THIS EXISTS. `performSearch` renders a local pre-render into
        // `searchResultsState.filteredListings` before the server replies. Until
        // 2026-08-21 a server FAILURE left those rows in place and showed an
        // error only when there were none — so a failed search terminated
        // looking like a successful one.
        //
        // AND THOSE ROWS ARE NOT WHAT THEIR OLD COMMENTS CLAIMED. `listings` is
        // not a fixture and not "canonical local Mallan inventory": it is loaded
        // once at page load by `_loadFromIDX()` as the first 200 rows of an
        // UNFILTERED search (ModificationTimestamp desc), falling back to a
        // 200-row local-DB page. Capped, stale, and unrelated to the broker's
        // criteria — while looking exactly like real inventory.
        //
        // The pre-render is a latency optimisation. It is not a second search
        // engine and it may never become the final answer.
        // ══════════════════════════════════════════════════════════════════

        /** True only when the CURRENT rows came from a successful server search. */
        function hasAuthoritativeSearchResults() {
            return Boolean(
                typeof searchResultsState !== 'undefined' &&
                searchResultsState &&
                searchResultsState.resultProvenance === 'authoritative'
            );
        }

        /**
         * Gate for any broker action that consumes the result set — Compare,
         * Reports/CMA, Save Search result counts, client email/share, export.
         * Returns false and explains, rather than operating on preview rows.
         *
         * Fail-closed: an ABSENT marker is not authoritative.
         */
        function requireAuthoritativeSearchResults(actionLabel) {
            if (hasAuthoritativeSearchResults()) return true;
            var what = actionLabel || 'This action';
            showToast(
                what + ' needs a completed search. These rows are a preview, not verified ' +
                'search results — run the search again.',
                'error'
            );
            return false;
        }

        /**
         * A search WAS attempted and did not leave an authoritative universe —
         * it is still previewing, or it failed.
         *
         * Distinct from `!hasAuthoritativeSearchResults()`, which is also true
         * before any search has run at all. Downstream surfaces that may
         * legitimately operate on the loaded catalogue BEFORE a search (Reports
         * over "all results", for one) must refuse on THIS condition only —
         * refusing on the absent marker too would change untouched pre-search
         * behaviour rather than fixing the defect.
         */
        function searchResultsAreStale() {
            if (typeof searchResultsState === 'undefined' || !searchResultsState) return false;
            var provenance = searchResultsState.resultProvenance;
            // 'incomplete' belongs here too: a traversal that stopped at the
            // read budget without reaching a surviving row established nothing.
            // Letting Reports or Compare treat that as "all results" would hand
            // a broker an unproven empty set as though it were the answer.
            return provenance === 'provisional'
                || provenance === 'none'
                || provenance === 'incomplete';
        }

        window.searchResultsAreStale = searchResultsAreStale;

        function _setResultProvenance(provenance) {
            if (typeof searchResultsState === 'undefined' || !searchResultsState) return;
            searchResultsState.resultProvenance = provenance;
            // A DECLARED COUNT BELONGS TO ONE RESULT SET.
            //
            // Leaving it behind when the set stops being authoritative is how a
            // stale "4,622 Results" ends up over a local preview of the loaded
            // catalogue. The count is cleared here and re-set by whichever path
            // actually received it, so it can never outlive its own answer.
            if (provenance !== 'authoritative') {
                searchResultsState.serverCount = null;
                searchResultsState.serverTotalPages = null;
                searchResultsState.serverHasMore = false;
                searchResultsState.serverContinuation = null;
                // The map universe belongs to one set of criteria too. Leaving
                // it behind would draw the previous search's pins over a preview
                // or a failed search.
                searchResultsState.mapListings = null;
            }
        }

        window.hasAuthoritativeSearchResults = hasAuthoritativeSearchResults;
        window.requireAuthoritativeSearchResults = requireAuthoritativeSearchResults;

        /**
         * Downgrade to a preview. Exposed for any surface OUTSIDE this file that
         * writes `filteredListings` from a LOCAL filter rather than a server
         * answer — `_replaceListings` in data-loader.js does exactly that on a
         * background reload while the results view is open.
         *
         * Anything that writes the result set without a server round-trip must
         * call this, or the rows inherit the previous run's authority.
         */
        window.markSearchResultsProvisional = function() {
            _setResultProvenance('provisional');
        };

        /**
         * Restore authority after a COMPLETED server round-trip for the current
         * criteria — the sort re-fetch in toolbar-functions.js is the one caller.
         *
         * Only ever call this when the server has actually answered for the
         * criteria on screen. It exists because the re-sort path legitimately
         * re-queries and would otherwise be left permanently provisional by the
         * `_replaceListings` downgrade it triggers on the way through.
         */
        window.markSearchResultsAuthoritative = function() {
            _setResultProvenance('authoritative');
        };

        function _hasServerIgnoredCriteria(criteria) {
            return Boolean(criteria && (
                criteria.openHouseDateFrom ||
                criteria.openHouseDateTo ||
                criteria._transitLines ||
                criteria._transitBounds ||
                criteria._gridBounds
            ));
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
            if (criteria.dateFrom) params.dateFrom = criteria.dateFrom;
            if (criteria.dateTo) params.dateTo = criteria.dateTo;
            if (criteria.dateActivityType) params.dateType = criteria.dateActivityType;
            if (criteria.contractDateFrom) params.contractDateFrom = criteria.contractDateFrom;
            if (criteria.contractDateTo) params.contractDateTo = criteria.contractDateTo;
            if (criteria.soldDateFrom) params.closeDateFrom = criteria.soldDateFrom;
            if (criteria.soldDateTo) params.closeDateTo = criteria.soldDateTo;
            // ── Codex Risk P0 fix: programmatic block of unsupported params ──
            // Open House date range and (when reached via programmatic
            // path) transit/grid bounds do not produce any backend OData
            // clause — see lib/search/__tests__/crm-idx-filter.test.ts
            // BATCH 2 dead-pattern tests. The UI controls are disabled
            // by public/crm/js/init/init-disable-dead-controls.js, but
            // criteria can still arrive via saved-search reload or a
            // programmatic call. Strip the keys here and emit a console
            // warning instead of silently submitting a request whose
            // narrowing intent the backend will drop. The user-facing
            // toast on multi-borough advisory at performSearch() also
            // covers borough-multi; this block covers OH/transit/grid.
            if (criteria.openHouseDateFrom || criteria.openHouseDateTo) {
                console.warn('[CRM Search] Stripped unsupported openHouseDate criteria — backend has no OpenHouse handler. See init-disable-dead-controls.js.');
            }
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
            // Status: CRM uppercase -> the live StandardStatus member.
            //
            // STEP 2 CORRECTION 2026-08-22. 'PENDING' used to map to
            // 'ActiveUnderContract'. Cotality declares Pending and
            // ActiveUnderContract as SEPARATE StandardStatus members, and on the
            // live feed ActiveUnderContract has ZERO rows while Pending is
            // populated - so a broker ticking "Pending" asked for an empty
            // member and concluded there was no pending inventory.
            //
            // The mapper performed the exact inverse collapse
            // (ActiveUnderContract -> PENDING), so a round trip appeared to
            // preserve the value. It did not preserve it; it laundered it, which
            // is why neither end looked wrong on its own.
            //
            // CONTRACT and UNDER_CONTRACT still map to ActiveUnderContract -
            // that is the genuine contract state, and it stays DISTINCT from
            // Pending. Selecting both now yields two criteria, not one.
            if (criteria.statuses && criteria.statuses.length > 0) {
                // The browser sends EXACT COTALITY StandardStatus MEMBERS. It no
                // longer keeps a status table at all.
                //
                // There used to be a JS map here translating tokens to RESO
                // PascalCase, maintained by hand in parallel with the server's
                // contract. Two authorities for one mapping is how 'PENDING'
                // came to mean ActiveUnderContract on one side and Pending on
                // the other. It also carried FUTURE -> Incomplete: Cotality
                // declares Incomplete and does not declare Future, and one
                // existing establishes nothing about the other's meaning.
                //
                // lib/search/canonical/status-token-contract.ts is now the only
                // mapping, and it FAILS CLOSED - a token with no provider member
                // returns HTTP 400 UNSUPPORTED_CRITERION rather than being
                // dropped, which would widen the search instead of narrowing it.
                var resoStatuses = criteria.statuses.filter(function(s, i, arr) { return arr.indexOf(s) === i; });
            }
            // Bug A11 — SponsorUnit lives inside CustomProperty.CustomFields
            // (REBNY-specific JSON-string field), NOT a top-level OData
            // property. The generic checkboxFilters loop on the backend
            // (lib/search/crm-idx-filter.ts:239-277) would silently drop
            // it because "SponsorUnit" is not in the odataSafe whitelist.
            // Pull it out into a dedicated `sponsorUnit` param so the
            // route handler can apply a post-fetch filter against the
            // mapper's parsed listing.sponsorUnit field.
            //
            // LIFTED ON A COPY, NEVER DELETED FROM THE CALLER.
            //
            // This used to `delete criteria.checkboxFilters.SponsorUnit`. The
            // goal was right — SponsorUnit must not travel in the generic
            // checkbox JSON — but the object being edited is the module-level
            // `activeSearchCriteria` that _serverSearch is handed, so the delete
            // was permanent and everything downstream saw a search the broker
            // never described. Ticking Sponsor Unit, searching, then saving
            // produced a saved search with NO sponsor constraint: the checkbox
            // had been deleted, and `sponsor_unit: c.sponsorUnit` reads a key
            // nothing ever sets (the serializer sets params.sponsorUnit, a
            // different object). Both carriers empty, criterion silently gone,
            // reloads BROADER than what was saved.
            //
            // The wire payload is built from a shallow copy instead, so the
            // backend still never receives SponsorUnit and the broker's own
            // criteria object still describes their search.
            var _cbForWire = criteria.checkboxFilters;
            if (_cbForWire && _cbForWire.SponsorUnit) {
                var _sp = _cbForWire.SponsorUnit;
                if (Array.isArray(_sp) && (_sp.indexOf('true') !== -1 || _sp.indexOf('Yes') !== -1)) {
                    params.sponsorUnit = 'true';
                }
                _cbForWire = Object.assign({}, _cbForWire);
                delete _cbForWire.SponsorUnit;
            }
            if (_cbForWire) {
                var _cbJson = JSON.stringify(_cbForWire);
                if (_cbJson !== '{}') params.checkboxFilters = _cbJson;
            }
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

        /**
         * A BOUNDED READ FOR THE MAP, separate from the grid's page.
         *
         * The map answers "where is this inventory" and the grid answers "which
         * rows am I reading now". They are different questions over the same
         * criteria, so the map keeps its own bounded window instead of
         * inheriting whatever page happens to be open. Without this, making
         * pagination real would have silently cut the map from ~200 pins to one
         * page's worth — a regression in the area-scanning workflow, paid for a
         * fix it had nothing to do with.
         *
         * ⚠ THIS IS A BOUNDED HEAD SAMPLE, NOT THE MAP UNIVERSE.
         *
         * Stated plainly because an earlier version of this comment claimed
         * pins beyond 500 "add nothing a broker can read". That was an
         * assertion, not a finding, and it is wrong for a 4,622-result search:
         * the first 500 rows in PRICE order are not the geography of the
         * result set. A broker scanning an area is asking a question this read
         * cannot answer.
         *
         * WHY IT IS STILL A HEAD SAMPLE, verified live 2026-08-26 rather than
         * assumed: Cotality returns Latitude and Longitude as NULL on live
         * Active rows, and both are PROVIDER-SUPPRESSED for filtering
         * ("cannot be used"). So Mallan cannot ask the provider "which listings
         * are in this viewport" at all. A spatial provider query does not exist
         * on this subscription.
         *
         * THE REAL MAP CONTRACT therefore has to express geography in the
         * provider's OWN vocabulary and resolve coordinates on Mallan's side:
         *
         *     viewport / polygon
         *   -> the neighbourhoods and boroughs it covers
         *   -> CityRegion / SubdivisionName / PostalCode criteria (all proven
         *      filterable)
         *   -> the final universe for that geography
         *   -> pins from the existing Census-backed GeocodeCache
         *      (address_key -> lat/lng), never from provider coordinates
         *
         * That is a build, not a constant change, and it is NOT claimed here.
         * Until it lands, this read stays deliberately bounded and the UI must
         * not present it as a complete geographic answer.
         */
        function _loadMapUniverse(pageParams) {
            if (typeof MallanAPI === 'undefined') return;
            if (typeof refreshResultsMap !== 'function') return;
            var mapParams = Object.assign({}, pageParams);
            mapParams.page = 1;
            mapParams.limit = 500;
            MallanAPI.idx.search(mapParams).then(function(mapResult) {
                if (!mapResult || !mapResult.listings) return;
                searchResultsState.mapListings = mapResult.listings;
                // Records that the pins are a sample of a larger universe, so a
                // renderer can say so instead of implying completeness.
                searchResultsState.mapIsPartial = !!(mapResult.count
                    && typeof mapResult.count.value === 'number'
                    && mapResult.count.value > mapResult.listings.length);
                try { refreshResultsMap(); } catch (e) { console.error('[Search] Map refresh failed:', e); }
            }).catch(function(e) {
                // Non-fatal. The grid is the answer; the map is support, and a
                // failed map read must never take the result set down with it.
                console.warn('[Search] Map universe unavailable:', e && e.message);
            });
        }

        /**
         * FETCH ONE PAGE OF THE FINAL UNIVERSE FROM THE SERVER.
         *
         * Authoritative pagination is a SERVER round trip, never a local slice.
         * Slicing filteredListings would page correctly through whatever window
         * happened to be loaded and call it the answer — the same page-local
         * defect this workstream removed everywhere else, arriving at the last
         * hop.
         *
         * One page transition carries the whole request identity:
         *
         *     current canonical criteria   (via the ONE serializer)
         *   + canonical sort key
         *   + requested final-universe page
         *   -> server
         *   -> authoritative rows + count disposition
         *
         * SELECTION IS NOT TOUCHED. `selectedListings` lives on
         * searchResultsState and is persisted independently of
         * filteredListings, so swapping the rows on screen cannot silently
         * discard listings the broker picked on an earlier page.
         */
        function _requestResultPage(targetPage) {
            if (typeof searchResultsState === 'undefined' || !searchResultsState) return;

            // A PROVISIONAL set is a local re-filter of whatever catalogue is
            // loaded. There is no server universe behind it to page, so it
            // keeps paging locally rather than pretending otherwise.
            if (searchResultsState.resultProvenance !== 'authoritative'
                || typeof MallanAPI === 'undefined'
                || typeof window.buildIdxSearchParams !== 'function') {
                searchResultsState.currentPage = targetPage;
                if (typeof renderSearchResults === 'function') renderSearchResults();
                return;
            }

            var params = window.buildIdxSearchParams(
                (typeof activeSearchCriteria !== 'undefined' && activeSearchCriteria)
                    ? activeSearchCriteria
                    : {}
            );
            params.page = targetPage;
            params.limit = searchResultsState.perPage || 50;
            if (searchResultsState.sortKey) params.sort = searchResultsState.sortKey;

            // SEQUENTIAL NEXT RESUMES; A JUMP RESCANS.
            //
            // Moving to the immediately following page carries the server's
            // continuation, so the traversal picks up where it stopped instead
            // of re-walking the prefix and hitting the read ceiling again. Any
            // other move — First, Last, a page-size change, a jump — has no
            // position to resume from and takes a bounded rescan, which is
            // correct but costs the prefix.
            //
            // The two behaviours are deliberately distinct rather than blurred:
            // sending a continuation for a non-sequential move would return the
            // wrong page while looking like it worked.
            var _isSequentialNext = targetPage === (searchResultsState.currentPage || 1) + 1;
            if (_isSequentialNext && searchResultsState.serverContinuation) {
                params.continuation = searchResultsState.serverContinuation;
            }

            if (typeof _serverSearchActive !== 'undefined') _serverSearchActive = true;
            MallanAPI.idx.search(params).then(function(result) {
                if (typeof _serverSearchActive !== 'undefined') _serverSearchActive = false;
                if (!result || !result.listings) return;

                searchResultsState.filteredListings = result.listings;
                searchResultsState.currentPage = result.page || targetPage;
                searchResultsState.serverCount = result.count || null;
                searchResultsState.serverTotalPages =
                    (typeof result.totalPages === 'number') ? result.totalPages : null;
                searchResultsState.serverHasMore = !!result.hasMore;
                searchResultsState.serverContinuation = result.continuation || null;
                // The map universe belongs to the CRITERIA, not the page, so it
                // is deliberately left alone here: paging must not re-fetch 500
                // rows, and the pins are still answering the same question.
                _setResultProvenance('authoritative');

                try {
                    if (typeof initializeSearchResults === 'function') initializeSearchResults();
                    if (typeof updateResultsCount === 'function') updateResultsCount();
                    if (typeof refreshResultsMap === 'function') refreshResultsMap();
                } catch (renderErr) {
                    console.error('[Search] Render after page request failed:', renderErr);
                }
                _saveSearchState();
            }).catch(function(err) {
                if (typeof _serverSearchActive !== 'undefined') _serverSearchActive = false;
                console.error('[Search] Page request failed:', err);
                // FAIL CLOSED, exactly like a failed search: the rows on screen
                // belong to the PREVIOUS page, so leaving them up while the page
                // number moves would show one page's rows under another page's
                // heading.
                searchResultsState.filteredListings = [];
                _setResultProvenance('none');
                try {
                    if (typeof initializeSearchResults === 'function') initializeSearchResults();
                    if (typeof updateResultsCount === 'function') updateResultsCount();
                } catch (renderErr) {
                    console.error('[Search] Render after failed page request:', renderErr);
                }
                if (err && err.code === 'UNSUPPORTED_CRITERION' && err.criterion) {
                    showToast('Search refused: “' + err.criterion + '” is not a supported search criterion.', 'error');
                } else {
                    showToast('Could not load page ' + targetPage + '.', 'error');
                }
            });
        }
        window._requestResultPage = _requestResultPage;

        // Server-side search: query Trestle API with criteria — this is the PRIMARY data source
        function _serverSearch(criteria, localResults) {
            var params = window.buildIdxSearchParams(criteria);

            // PAGE 1 OF THE FINAL UNIVERSE, at the broker's page size.
            //
            // This used to ask for a flat 200 rows and let the browser page
            // inside them. That made "page" mean a slice of a window, so no
            // amount of navigation reached result 201 of a 4,622-match search.
            // The grid now asks the server for a real page and the controls ask
            // for the next one.
            //
            // The old comment here claimed <=200 got inline photos via
            // $expand=Media. That is stale: the route passes expandMedia:false
            // unconditionally and media is lazy-loaded through /api/media/batch,
            // so page size has not driven media for some time.
            params.page = 1;
            params.limit = searchResultsState.perPage || 50;

            console.log('[Search] Querying Trestle API:', JSON.stringify(params));
            if (typeof _serverSearchActive !== 'undefined') _serverSearchActive = true;
            MallanAPI.idx.search(params).then(function(result) {
                if (typeof _serverSearchActive !== 'undefined') _serverSearchActive = false;
                console.log('[Search] Trestle returned:', result ? (result.listings ? result.listings.length + ' listings' : 'no listings array') : 'null');
                // A BOUNDED TRAVERSAL THAT FOUND NOTHING IS NOT AN EMPTY
                // UNIVERSE.
                //
                // Zero rows used to mean "no listings found", authoritatively.
                // That is only true when the provider was EXHAUSTED. If the read
                // budget stopped the traversal first, the server says
                // BUDGET_EXHAUSTED_UNRESOLVED, and hundreds of thousands of
                // provider rows may still be unread. Telling a broker their
                // inventory does not exist because Mallan chose not to read
                // farther is the worst version of the false-universe defect this
                // whole workstream removes.
                var _more = result && result.more;
                var _zeroRows = !result || !result.listings || result.listings.length === 0;
                if (_zeroRows && _more === 'BUDGET_EXHAUSTED_UNRESOLVED') {
                    searchResultsState.filteredListings = [];
                    searchResultsState.currentPage = 1;
                    searchResultsState.serverCount = (result && result.count) || null;
                    searchResultsState.serverTotalPages = null;
                    searchResultsState.serverHasMore = true;
                    // NOT authoritative: nothing was established, so every
                    // downstream broker action stays closed rather than acting
                    // on an unproven empty set.
                    _setResultProvenance('incomplete');
                    try {
                        if (typeof initializeSearchResults === 'function') initializeSearchResults();
                        if (typeof updateResultsCount === 'function') updateResultsCount();
                    } catch (renderErr) {
                        console.error('[Search] Render after incomplete search failed:', renderErr);
                    }
                    showToast(
                        'Search incomplete — Mallan stopped reading before the provider ran out of listings. '
                        + 'Narrow the criteria, or open the next page to keep looking.',
                        'warning'
                    );
                    return;
                }

                if (_zeroRows) {
                    // Server returned 0. The server is the source of truth for
                    // this search — DO NOT keep the pre-render rows visible.
                    //
                    // (Comment corrected 2026-08-21: these were called "local
                    // fixture rows". They are not fixtures. `listings` is the
                    // 200-row UNFILTERED page loaded at startup by
                    // `_loadFromIDX()`, so the rows are real listings that
                    // simply do not answer this query — which is precisely why
                    // leaving them up would read as a result set.)
                    //
                    // Clear the display so the empty-state + toast surface honestly.
                    searchResultsState.filteredListings = [];
                    searchResultsState.currentPage = 1;
                    // A genuinely empty universe IS an answer, and reaching this
                    // line now means the provider was EXHAUSTED — the
                    // unresolved case returned above. `Townhouse` is a valid
                    // live member with zero rows; nothing failed, so this stays
                    // authoritative and downstream actions stay open.
                    _setResultProvenance('authoritative');
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
                    // STEP 1 — the unknown-to-value defaults are REMOVED.
                    // These re-invented, after the server had answered, exactly what
                    // crm-idx-mapper.ts refuses to invent: an unknown fee became $0,
                    // an unknown status became ACTIVE, an unknown borough became
                    // Manhattan. Renderers must show unknown as unavailable.
                    // A photo count is still derived from media ACTUALLY PRESENT —
                    // that is evidence, not a default. Absent both, it stays unknown.
                    if (l.photoCount == null && l.images && l.images.length > 0) l.photoCount = l.images.length;
                    if (!l.address) l.address = 'Address Unavailable';
                    if (!l.unit) l.unit = '';
                    if (!l.neighborhood) l.neighborhood = '';
                    if (!l.zip) l.zip = '';
                    // borough is NOT defaulted — a Brooklyn listing read as Manhattan is wrong on
                    // the card, the map, the report and every saved search.
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

                // REPLACE the provisional pre-render with the AUTHORITATIVE
                // server universe. Previously this MERGED `localResults` with
                // `serverListings`, so rows that answered no part of the query
                // rendered above the ones that did.
                //
                // (Comment corrected 2026-08-21. It described `listings` as a
                // "~126-row local fixture set". It is not a fixture set — that
                // number belongs to the TEST fixtures in scripts/crm-tests/.
                // At runtime `listings` is whatever `_loadFromIDX()` fetched at
                // page load: 200 unfiltered rows ordered by
                // ModificationTimestamp desc, or a 200-row local-DB page on
                // fallback. Capped, stale and criteria-independent — real rows
                // that are not an answer, which is the harder case to spot.)
                //
                // serverListings has been merged into the global `listings`
                // array above so existing-by-id lookups still work; we just
                // stop polluting the rendered list.
                searchResultsState.filteredListings = serverListings;
                searchResultsState.currentPage = 1;

                // THE SERVER'S DECLARED COUNT, CARRIED WITH ITS MEANING.
                //
                // updateResultsCount used to print filteredListings.length as
                // "N Results". That is the size of what was FETCHED, not the
                // size of the result universe: a live Manhattan Active search
                // matches 4,622 listings and the browser asks for one window of
                // them. Printing the window as the total reads to a broker as
                // "this inventory does not exist".
                //
                // `count.meaning` says whether the number is EXACT or a declared
                // LOWER BOUND, and the renderer must not flatten that back into a
                // bare number.
                searchResultsState.serverCount = (result && result.count) || null;
                searchResultsState.serverTotalPages =
                    (result && typeof result.totalPages === 'number') ? result.totalPages : null;
                searchResultsState.serverHasMore = !!(result && result.hasMore);
                searchResultsState.serverContinuation = (result && result.continuation) || null;

                // THE MAP IS A DIFFERENT QUESTION FROM THE GRID.
                //
                // Pins answer "where is this inventory", which is not the same
                // as "which twenty rows am I reading". Feeding the map the
                // current page would have cut it from ~200 pins to one page's
                // worth the moment paging became real, so it gets its own
                // bounded read of the SAME criteria and sort.
                _loadMapUniverse(params);

                _setResultProvenance('authoritative');
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
                console.error('[Search] Search failed:', err);

                // FAIL CLOSED. This used to keep the local pre-render visible and
                // show an error ONLY when `localResults.length === 0` — so a
                // failed search with rows on screen was indistinguishable from a
                // successful one. Those rows are a stale, criteria-independent
                // 200-row page from page load, and they are not an answer.
                //
                // A failed search yields NO result universe:
                //   - the rows are cleared,
                //   - the provenance drops to 'none' so every downstream broker
                //     action (Compare / Reports / client send / saved counts) is
                //     refused by requireAuthoritativeSearchResults(),
                //   - the persisted state is discarded so a refresh cannot
                //     resurrect the preview as a completed search,
                //   - and the failure is ALWAYS surfaced, whatever was on screen.
                void localResults;
                searchResultsState.filteredListings = [];
                searchResultsState.currentPage = 1;
                _setResultProvenance('none');

                try { sessionStorage.removeItem('_searchState'); } catch (storageErr) { void storageErr; }

                try {
                    if (typeof initializeSearchResults === 'function') initializeSearchResults();
                    if (typeof updateResultsCount === 'function') updateResultsCount();
                    if (typeof refreshResultsMap === 'function') refreshResultsMap();
                } catch (renderErr) {
                    console.error('[Search] Render after failed search failed:', renderErr);
                }

                // A REFUSED CRITERION IS NOT A TRANSIENT FAILURE.
                //
                // The server refuses a criterion BY NAME rather than substitute
                // a near-neighbour provider field or silently drop it. That
                // refusal is correct and it is the whole point of the criterion
                // register. But it used to arrive here as the same generic
                // "please try again" as a timeout — and retrying a refused
                // criterion fails identically, every time, forever. The one
                // instruction the broker got was the one that could not work.
                //
                // Name it instead, so the fix is obvious: remove that field.
                if (err && err.code === 'UNSUPPORTED_CRITERION' && err.criterion) {
                    var _vals = (err.unsupportedValues && err.unsupportedValues.length)
                        ? ' (' + err.unsupportedValues.join(', ') + ')'
                        : '';
                    showToast(
                        'Search refused: “' + err.criterion + '”' + _vals +
                        ' is not a supported search criterion. Clear it and search again.',
                        'error'
                    );
                    return;
                }

                showToast('Search failed — no results to show. Please try again.', 'error');
            });
        }

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
                            borough: listing.borough || null,
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
                        borough: l.borough || null,
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
                            // Sub-status checkbox (e.g., "Offer Accepted", "Contract Out")
                            criteria.statuses.push(sub);
                        } else if (val) {
                            // Handle comma-separated values (e.g., "Withdrawn,Canceled,Expired,Hold")
                            var parts = val.split(',');
                            parts.forEach(function(part) {
                                var s = part.trim();
                                // Map to uppercase
                                if (s === 'Active' || s === 'BackOnMarket') criteria.statuses.push('Active');
                                else if (s === 'ComingSoon') criteria.statuses.push('ComingSoon');
                                // 'Future' is DELIBERATELY carried through as-is.
                                // It has no proven Cotality member, so the server
                                // rejects it with a typed 400 naming the value -
                                // which tells the broker exactly what in their
                                // saved search cannot be run. Dropping it here
                                // would silently widen the restored search
                                // instead, which is the failure mode this whole
                                // status pass exists to remove.
                                // CANONICAL EXACT TOKENS ONLY (2026-08-26).
                                //
                                // These lines used to rewrite the control's own
                                // exact StandardStatus value into a Mallan
                                // uppercase spelling — Withdrawn -> WITHDRAWN,
                                // Expired -> EXPIRED — which the boundary then
                                // had to translate back. A second status
                                // vocabulary maintained in parallel with the
                                // provider's is exactly how PENDING came to mean
                                // ActiveUnderContract. The data-value on these
                                // controls IS the live member, so it is carried
                                // through unchanged.
                                //
                                // 'Future' is deliberately NOT special-cased: it
                                // has no proven Cotality member, so it travels
                                // as itself and the server rejects it by name
                                // rather than being silently dropped.
                                else criteria.statuses.push(s);
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
                    // CORRECTED 2026-08-26. Multi-borough previously left
                    // criteria.borough UNSET, on the belief that the backend
                    // "cannot OR multiple CityRegion values via a single
                    // param". The consequence was worse than the limitation:
                    // with no borough param the server applied no geography at
                    // all and answered ALL OF NYC under HTTP 200, marked
                    // authoritative. Selecting two boroughs silently widened
                    // the search instead of narrowing it.
                    //
                    // The backend now renders a comma-separated list as one
                    // parenthesised CityRegion disjunction
                    // (lib/search/canonical/geography.ts), so every selected
                    // borough is carried and the question asked is the question
                    // answered.
                    criteria.borough = selectedBoroughs.join(',');
                } else if (selectedNeighborhoods.length > 0) {
                    var boroughs = selectedNeighborhoods.map(function(n) { return _findBoroughForNeighborhood(n); }).filter(Boolean);
                    var uniqueBoroughs = boroughs.filter(function(b, i, arr) { return arr.indexOf(b) === i; });
                    if (uniqueBoroughs.length > 0) {
                        criteria.borough = uniqueBoroughs.join(',');
                    }
                }
            }

            // Quick Search fields — RLS ID, Zip, Unit (advanced mode has its own IDs)
            var rlsInputId, zipInputId, unitInputId;
            if (_isAdvanced) {
                rlsInputId = 'adv-rls-id';
                zipInputId = 'adv-zip';
                unitInputId = 'searchQuickUnit';
            } else {
                rlsInputId = 'searchQuickRls';
                zipInputId = 'searchQuickZip';
                unitInputId = 'searchQuickUnit';
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

            // Management Company. NOT ListOfficeName: Cotality declares no
            // ManagementCompany Property field, and listing office is a
            // DIFFERENT fact. The server refuses that substitution
            // (crm-idx-filter.ts throws UnsupportedSearchCriterionError), so no
            // "closest field" is chosen here either.
            var mgmtId = _isAdvanced ? 'adv-management' : 'searchManagementCompany';
            var mgmtEl = document.getElementById(mgmtId);
            if (mgmtEl && mgmtEl.value.trim()) {
                criteria.managementCompany = mgmtEl.value.trim();
            }

            // Building Financing %.
            //
            // CORRECTED 2026-08-26. This claimed "BuyerFinancing on Trestle".
            // Live probe: MaximumFinancingPercent is ABSENT from Property, and
            // BuyerFinancing/CurrentFinancing/ListingTerms are multi-enums of
            // financing TYPE (Cash, Conventional, FHA) — none expresses a
            // PERCENTAGE. There is no provider fact for this criterion, so it
            // is PROVIDER_UNAVAILABLE rather than merely unmapped.
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
            var _bIds = window._resolveBuildingFieldIds(currentSearchTab, _isAdvanced);
            var yearMinEl = document.getElementById(_bIds.yearMin);
            var yearMaxEl = document.getElementById(_bIds.yearMax);
            var unitsMinEl = document.getElementById(_bIds.unitsMin);
            var unitsMaxEl = document.getElementById(_bIds.unitsMax);
            var floorsMinEl = document.getElementById(_bIds.floorsMin);
            var floorsMaxEl = document.getElementById(_bIds.floorsMax);
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
                    // Prefer the CANONICAL Mallan criterion. `data-field` carries
                    // the provider's vocabulary and is still read by the
                    // compliance diagnostics, the dead-control guard and
                    // grid-layouts (where it means a result-column id), so it
                    // stays in the markup — but Search reads the canonical key
                    // first where one exists.
                    var _field = _cb.getAttribute('data-criterion') || _cb.getAttribute('data-field');
                    // Check BOTH identities. MlsStatus / CommonInterest /
                    // PropertySubType own dedicated contracts and must never
                    // fall through to this generic engine — which they would if
                    // someone later added a data-criterion to them and only the
                    // resolved key were tested here. Two contracts
                    // canonicalising one criterion is the drift this work removes.
                    if (_handledFields[_field] || _handledFields[_cb.getAttribute('data-field')]) continue;
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
                    var _field = sel.getAttribute('data-criterion') || sel.getAttribute('data-field');
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

        function filterListings(listings, criteria, displayContext) {
            // displayContext: 'idx' (default/public) | 'vow' (authenticated client) | 'crm' (agent/broker)
            displayContext = displayContext || searchDisplayContext || 'idx';

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

                // Gate 6: Closed Status — suppress listings closed > 24 hours
                if (listing.status === 'Closed' && listing.closedDate) {
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

                // Ownership filter — exact match (not indexOf, to prevent Condo matching Condop)
                if (criteria.ownership && criteria.ownership.length > 0) {
                    var match = criteria.ownership.some(function(o) {
                        return listing.ownership.toLowerCase() === o.toLowerCase();
                    });
                    if (!match) return false;
                }

                // PropertySubType filter — EXACT scalar-enum match.
                //
                // Was `sub.indexOf(v) !== -1` on both sides lower-cased: a
                // case-folded SUBSTRING test. `Family` swept in MultiFamily AND
                // SingleFamilyResidence; `Apart` matched Apartment.
                //
                // Cotality declares PropertySubType a SCALAR Enum (probed live
                // 2026-08-21, 75 members) where `eq` is SUPPORTED and
                // `contains()` is HTTP 400. Case is significant: `eq 'apartment'`
                // returns 200 with ZERO rows. This local predicate must mean
                // exactly what the canonical criterion means on the server —
                // exact member, case-sensitive, OR across the selected values —
                // or the preview describes a different universe than the search.
                if (criteria.propertySubType) {
                    var pstValues = String(criteria.propertySubType)
                        .split(',')
                        .map(function(v) { return v.trim(); })
                        .filter(Boolean);
                    var sub = listing.propertySubType || '';
                    if (pstValues.indexOf(sub) === -1) return false;
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

                // Status filter — check both StandardStatus (listing.status) and MlsStatus sub-statuses
                if (criteria.statuses && criteria.statuses.length > 0) {
                    var statusMatch = criteria.statuses.some(function(s) {
                        var sl = s.toLowerCase();
                        // Match against main status (ACTIVE, PENDING, CLOSED, etc.)
                        if (listing.status && listing.status.toLowerCase() === sl) return true;
                        // Match against MlsStatus sub-status (OfferOut, ContractSigned, BoardApproved, etc.)
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

                // Management Company is NOT filtered here.
                //
                // This block previously matched criteria.managementCompany
                // against listing.company — which is ListOfficeName. Listing
                // office is a different fact from management company, and the
                // server explicitly refuses that substitution. Because the
                // criterion is also never forwarded to the server, this
                // client-side match was the ONLY thing that ran: a broker
                // searching a management company silently received a listing
                // OFFICE match over the already-fetched page.
                //
                // Removing it stops this side answering a different question.
                //
                // CORRECTION (2026-08-26): the line above used to read "the
                // criterion is also never forwarded to the server". That was
                // wrong. buildIdxSearchParams DOES forward it, and the server
                // refuses it by name, so the criterion is not inert — typing a
                // management company refuses the whole search. That refusal is
                // the correct outcome (Mallan will not substitute ListOfficeName
                // for a management company) and it is now surfaced by name in
                // the failure handler below, instead of arriving as a generic
                // "please try again". Restoring the criterion for real still
                // requires a verified provider fact, not a near-neighbour field.

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
                        for (var _vi = 0; _vi < _vals.length; _vi++) {
                            if (_listStr.indexOf(_vals[_vi].toLowerCase()) !== -1) {
                                _matched = true;
                                break;
                            }
                        }
                        if (!_matched) return false;
                    }
                }

                return true;
            });
        }

        function updateResultsCount() {
            var filtered = searchResultsState.filteredListings || listings;
            var perPage = searchResultsState.perPage || 50;

            // PREFER THE SERVER'S DECLARED COUNT.
            //
            // filteredListings holds what is on screen. The server knows how big
            // the final universe is and whether that number is exact. Only an
            // AUTHORITATIVE set may use it: a provisional preview is a local
            // re-filter of whatever catalogue happens to be loaded, and pairing
            // it with a server total would describe two different sets in one
            // sentence.
            var sc = searchResultsState.serverCount;
            var isAuthoritative = searchResultsState.resultProvenance === 'authoritative';
            var useServer = !!(sc && typeof sc.value === 'number' && isAuthoritative);

            var count = useServer ? sc.value : filtered.length;

            // A LOWER BOUND CANNOT NAME THE LAST PAGE.
            //
            // These two claims contradict each other:
            //
            //     1000+ Results
            //     Page 1 of 5
            //
            // The `+` says more inventory may exist; `of 5` says page 5 is the
            // end. The server sends totalPages: null whenever the traversal
            // stopped early, and deriving one locally from the lower-bound count
            // would re-fabricate exactly the number it withheld. Navigation
            // stays open-ended until an exhausted traversal proves the final
            // page.
            var totalPages;
            if (useServer) {
                totalPages = (typeof searchResultsState.serverTotalPages === 'number')
                    ? searchResultsState.serverTotalPages
                    : null;
            } else {
                totalPages = Math.max(1, Math.ceil(count / perPage));
            }

            // A LOWER BOUND MUST NOT BE PRINTED AS A TOTAL. "200 Results" and
            // "200+ Results" are different claims, and the second one is the
            // true one when the traversal stopped early.
            var countText = useServer && sc.isExact === false
                ? count + '+ Results'
                : count + ' Results';

            // Update all results count elements (top + bottom)
            var countEls = document.querySelectorAll('#resultsCount, #resultsCount2');
            countEls.forEach(function(el) { el.textContent = countText; });

            // Update top pagination
            // '—' rather than a number the server declined to claim.
            var totalPagesText = totalPages === null ? '—' : totalPages;
            var totalPagesEl = document.getElementById('totalPages');
            if (totalPagesEl) totalPagesEl.textContent = totalPagesText;

            var currentPageEl = document.getElementById('currentPage');
            if (currentPageEl) currentPageEl.textContent = searchResultsState.currentPage;

            // Update bottom pagination
            var bottomTotalPagesEl = document.getElementById('bottomTotalPages');
            if (bottomTotalPagesEl) bottomTotalPagesEl.textContent = totalPagesText;

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
            if (el) el.checked = statuses.indexOf('Active') !== -1;
            el = document.getElementById('refineStatusComingSoon');
            if (el) el.checked = statuses.indexOf('ComingSoon') !== -1;
            el = document.getElementById('refineStatusPending');
            if (el) el.checked = statuses.indexOf('Pending') !== -1;
            el = document.getElementById('refineStatusContract');
            if (el) el.checked = statuses.indexOf('ActiveUnderContract') !== -1;
            el = document.getElementById('refineStatusClosed');
            if (el) el.checked = statuses.indexOf('Closed') !== -1;

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
            if (document.getElementById('refineStatusActive') && document.getElementById('refineStatusActive').checked) statuses.push('Active');
            if (document.getElementById('refineStatusComingSoon') && document.getElementById('refineStatusComingSoon').checked) statuses.push('ComingSoon');
            if (document.getElementById('refineStatusPending') && document.getElementById('refineStatusPending').checked) statuses.push('Pending');
            // Pushed ActiveUnderContract TWICE. Harmless in effect — the
            // serializer dedupes before the wire — but it is a copy-paste
            // artefact, and the second push was plainly meant to be a different
            // status. Which one is not recoverable from the code, and inventing
            // one would add a status the broker never asked for, so the
            // duplicate is simply removed and the question left visible.
            if (document.getElementById('refineStatusContract') && document.getElementById('refineStatusContract').checked) { statuses.push('ActiveUnderContract'); }
            if (document.getElementById('refineStatusClosed') && document.getElementById('refineStatusClosed').checked) statuses.push('Closed');
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

                // Rebuild filteredListings from saved IDs.
                //
                // This is a LOCAL reconstruction: the ids are intersected with
                // whatever `listings` holds right now, so any row that is no
                // longer in that array is silently dropped and the restored set
                // can be an unannounced subset of what the search returned. It
                // has not been re-asked of the server, so it is a preview —
                // which also keeps report delivery closed until a real search
                // runs, rather than letting a refresh re-open it.
                var idSet = {};
                state.filteredIds.forEach(function(id) { idSet[id] = true; });
                searchResultsState.filteredListings = listings.filter(function(l) { return idSet[l.id]; });
                searchResultsState.currentPage = state.page || 1;
                _setResultProvenance('provisional');

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

