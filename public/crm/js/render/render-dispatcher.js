        // "Search in results": filter as the agent types (delegated, so it works whatever renders the toolbar).
        document.addEventListener('input', function(e) {
            if (!e.target || e.target.id !== 'resultsSearchInput') return;
            searchResultsState.textFilter = e.target.value;
            searchResultsState.currentPage = 1;
            clearTimeout(window._resultsTextTimer);
            window._resultsTextTimer = setTimeout(function() { renderSearchResults(); }, 200);
        });

        function initializeSearchResults() {
            // Clean stale selectedListings — remove IDs that don't exist in current results
            try {
                var currentIds = (searchResultsState.filteredListings || listings).map(function(l) { return l.id; });
                searchResultsState.selectedListings = searchResultsState.selectedListings.filter(function(id) {
                    return currentIds.indexOf(id) !== -1;
                });
                localStorage.setItem('selectedListings', JSON.stringify(searchResultsState.selectedListings));
                // Also filter out previously-removed listings from this session
                var removedKey = 'removedListings_' + LOGGED_IN_AGENT.id;
                var removed = JSON.parse(localStorage.getItem(removedKey)) || [];
                if (removed.length > 0) {
                    var removedSet = {};
                    removed.forEach(function(id) { removedSet[id] = true; });
                    var source = searchResultsState.filteredListings || listings.slice();
                    searchResultsState.filteredListings = source.filter(function(l) { return !removedSet[l.id]; });
                }
            } catch(e) { console.warn('[Search] Selection cleanup error:', e); }
            try { renderSearchResults(); } catch(e) { console.error('[Search] renderSearchResults FAILED:', e); }
            try { if (typeof initPhotoObserver === 'function') initPhotoObserver(); } catch(e) { console.warn('[Search] Photo observer init failed:', e); }
            try { updateSelectionActionBar(); } catch(e) { /* ok */ }
            try { populateClientList(); } catch(e) { /* ok */ }
            try { populateSavedSearchList(); } catch(e) { /* ok */ }
            try { populateFieldSelectionGrid(); } catch(e) { /* ok */ }
            try { populateSavedLayoutsList(); } catch(e) { /* ok */ }
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // VIEW MODE FUNCTIONS
        // ═══════════════════════════════════════════════════════════════════════════════

        // ── The Grid control: "Grid" is where the views live. The button always reads "Grid"; the
        //    current view is named next to it and ticked in the menu (owner rule 2026-10-26: "list
        //    should be list, the grid is where the different views live in"). ──
        var VIEW_ICONS  = { grid: 'fa-list', gallery: 'fa-th-large', shortSummary: 'fa-align-left', summary: 'fa-bars', masterDetail: 'fa-columns' };
        var VIEW_LABELS = { grid: 'List', gallery: 'Gallery', shortSummary: 'Short Summary', summary: 'Summary', masterDetail: 'Master Details' };

        var lastListViewMode = searchResultsState.viewMode || 'gallery';

        function toggleViewModeDropdown(event) {
            var dd = document.getElementById('viewModeDropdown');
            dd.classList.toggle('hidden');
        }

        // Keep the Grid button and its menu in step with searchResultsState.viewMode (also after a
        // reload, when the view comes back from localStorage and the static markup would say Gallery).
        function _syncViewModeControl() {
            var mode = searchResultsState.viewMode;
            var label = document.getElementById('viewModeLabel');
            if (label) label.textContent = VIEW_LABELS[mode] || '';
            var items = document.querySelectorAll('#viewModeDropdown [data-view-mode]');
            for (var i = 0; i < items.length; i++) {
                var active = items[i].getAttribute('data-view-mode') === mode;
                items[i].classList.toggle('bg-blue-50', active);
                items[i].classList.toggle('font-semibold', active);
                items[i].setAttribute('aria-checked', active ? 'true' : 'false');
                // inline display: Font Awesome's .fas {display:inline-block} outranks Tailwind's .hidden here
                var check = items[i].querySelector('.view-mode-check');
                if (check) check.style.display = active ? '' : 'none';
            }
        }

        // Called by the Grid menu items — sets the results view
        function setViewMode(mode) {
            searchResultsState.viewMode = mode;
            localStorage.setItem('searchResultsViewMode', mode);

            lastListViewMode = mode;

            // Hide dropdown
            document.getElementById('viewModeDropdown').classList.add('hidden');


            // Grid column headers
            var gch = document.getElementById('gridColumnHeaders');
            if (gch) gch.style.display = 'none';
            var avgR = document.getElementById('averagesRow');
            if (avgR) avgR.style.display = (mode === 'grid') ? 'flex' : 'none';

            // Render results in new mode
            renderSearchResults();
        }


        // Close view mode dropdown when clicking outside
        document.addEventListener('click', function(e) {
            var dd = document.getElementById('viewModeDropdown');
            var btn = document.getElementById('viewModeBtn');
            if (dd && !dd.contains(e.target) && btn && !btn.contains(e.target)) {
                dd.classList.add('hidden');
            }
        });

        // ═══════════════════════════════════════════════════════════════════════════════
        // RENDER FUNCTIONS
        // ═══════════════════════════════════════════════════════════════════════════════

        function getFilteredListings(skipPagination) {
            var listings = (searchResultsState.filteredListings || []).slice();
            // ══════════════════════════════════════════════════════════════════
            // COMPLIANCE HARD-BLOCK (Defense-in-depth)
            // ══════════════════════════════════════════════════════════════════
            // REBNY Distribution Gates: These MUST be enforced regardless of upstream filtering.
            // Gate 1: Owner Opt-Out → NEVER display (UCBA Art. I Sec. 4(A))
            // Gate 2: Participant Only → RLS participants only, NOT for IDX/public display
            // Gate 3: IDX Display Opted Out → NOT for IDX websites (InternetEntireListingDisplayYN=false)
            // Gate 4: Syndication → SyndicateYN=false → NOT for third-party portals (no filter, badge only)
            // Gate 5: Coming Soon → StandardStatus=ComingSoon → visible but no showings (no filter, badge + disable)
            // Gate 6: Closed Status → suppress after 24 hours (filtered in search-engine.js)
            //
            // ── VOW vs IDX ARCHITECTURE (Production Implementation) ──
            // Public visitors (no login) = IDX rules: limited fields, full attribution, no sold data
            // Logged-in clients (VOW) = VOW rules: fuller data, sold/leased info, requires broker-consumer ack
            // CRM agents (RLS) = Full data access, all fields, commission info (internal only)
            // Implementation: Add auth layer to toggle Gate 2/3 filtering based on user role.
            // VOW consumers must acknowledge broker relationship before viewing enhanced data.
            //
            // ── FAIR HOUSING LANGUAGE SCREENING (Production Implementation) ──
            // Existing: Description text validator (debounced real-time, ~line 20245)
            // TODO: Extend screening to search form inputs, client preference fields,
            //       and agent-entered notes. Use same patterns from description validator.
            //       Ref: REBNY "word and phrase list" per Fair Housing Act + NYS + NYC HRL.
            // Display context: IDX (public), VOW (authenticated client), CRM (agent/broker)
            var renderContext = (typeof mallanDisplayContext === 'function') ? mallanDisplayContext()
                : ((typeof searchDisplayContext !== 'undefined') ? searchDisplayContext : 'idx');
            listings = listings.filter(function(l) {
                var p = l.permissions || {};
                // Gate 1: Owner Opt-Out — NEVER display in ANY context
                if (p.ownerOptOut === true) return false;
                // Gate 2: Participant Only — CRM only
                if (p.participantOnly === true) {
                    if (renderContext !== 'crm') return false;
                }
                // Gate 3: context-aware display
                if (renderContext === 'idx') {
                    if (l.idxDisplayYN === false || p.idxDisplay === false) return false;
                    if (l.internetDisplayYN === false) return false;
                } else if (renderContext === 'vow') {
                    if (l.internetDisplayYN === false) return false;
                }
                // CRM: no Gate 3 filtering
                // Gate 6: Closed >24h — suppress on public IDX / VOW display only (UCBA Art. I Sec. 6-7).
                // The agent product shows every closing Cotality serves (closed-sale search, comps, CMA).
                if (renderContext !== 'crm' && l.status === 'CLOSED') {
                    var closedTs = l.updatedDate ? new Date(l.updatedDate) : null;
                    if (closedTs && !isNaN(closedTs.getTime())) {
                        var hoursSinceClosed = (Date.now() - closedTs.getTime()) / (1000 * 60 * 60);
                        if (hoursSinceClosed > 24) return false;
                    }
                }
                return true;
            });
            // Apply status flag filters (picked, liked, shown, etc.)
            if (typeof filterState !== 'undefined' && typeof listingFlags !== 'undefined') {
                var activeFlags = [];
                for (var fk in filterState.statusFilters) {
                    if (filterState.statusFilters[fk]) activeFlags.push(fk);
                }
                if (activeFlags.length > 0) {
                    listings = listings.filter(function(l) {
                        return activeFlags.some(function(flag) {
                            return listingFlags[l.id] && listingFlags[l.id][flag];
                        });
                    });
                }
            }
            // "Search in results" box (#resultsSearchInput): narrows the loaded results by address, unit,
            // building, neighborhood, zip, listing id, listing / co-listing agent or office.
            var textQuery = (searchResultsState.textFilter || '').trim().toLowerCase();
            if (textQuery) {
                listings = listings.filter(function(l) {
                    return [l.address, l.unit, l.buildingName, l.neighborhood, l.zip, l.id, l.lid, l.agentName, l.company]
                        .concat((l.coAgents || []).map(function(c) { return c.name; }))
                        .some(function(v) { return v && String(v).toLowerCase().indexOf(textQuery) !== -1; });
                });
            }
            // Apply sorting
            var field = searchResultsState.sortField;
            var order = searchResultsState.sortOrder;
            // Cotality already returned these results in this order (search-engine.js serverSortKey):
            // keep it, so page 1, page 2 and "Load more" continue one ordering.
            if (field && searchResultsState.serverSortKey !== field + ' ' + order) {
                // Same keys as the Cotality sort: street name then house number; ISO dates, not "10/23/2026".
                var sortKey = function(l) {
                    if (field === 'address') return [String(l.streetName || l.address || '').toLowerCase(), parseInt(l.streetNumber, 10) || 0];
                    if (field === 'listedDate') return [l.listedDateIso || ''];
                    var v = l[field];
                    return [v == null ? '' : (typeof v === 'number' ? v : String(v).toLowerCase())];
                };
                listings.sort(function(a, b) {
                    var ka = sortKey(a), kb = sortKey(b);
                    for (var i = 0; i < ka.length; i++) {
                        var va = ka[i], vb = kb[i];
                        if (va === vb) continue;
                        var c = (typeof va === 'number' && typeof vb === 'number') ? va - vb : (String(va) < String(vb) ? -1 : 1);
                        return order === 'asc' ? c : -c;
                    }
                    return 0;
                });
            }
            // Apply pagination unless explicitly skipped (e.g., for total count)
            if (!skipPagination) {
                var perPage = searchResultsState.perPage || 50;
                var page = searchResultsState.currentPage || 1;
                var start = (page - 1) * perPage;
                listings = listings.slice(start, start + perPage);
            }
            return listings;
        }

        // ── All view container IDs for visibility management ──
        var _viewContainerIds = [
            'gridViewContainer',
            'galleryViewContainer',
            'shortSummaryViewContainer',
            'summaryViewContainer',
            'masterDetailViewContainer'
        ];

        // ── Show loading skeleton ──
        function _showResultsSkeleton() {
            var skeleton = document.getElementById('resultsLoadingSkeleton');
            if (skeleton) skeleton.style.display = 'block';
            _viewContainerIds.forEach(function(id) {
                var el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        }

        // ── Hide loading skeleton ──
        function _hideResultsSkeleton() {
            var skeleton = document.getElementById('resultsLoadingSkeleton');
            if (skeleton) skeleton.style.display = 'none';
        }

        function renderSearchResults() {
            var mode = searchResultsState.viewMode;
            _syncViewModeControl();

            // Container display types: masterDetail uses flex layout, others use block
            var containerDisplay = {
                gridViewContainer: 'block',
                galleryViewContainer: 'block',
                shortSummaryViewContainer: 'block',
                summaryViewContainer: 'block',
                masterDetailViewContainer: 'flex'
            };

            // Hide all containers using style.display (NOT class toggling — avoids Tailwind !important conflicts)
            _viewContainerIds.forEach(function(id) {
                var el = document.getElementById(id);
                if (el) {
                    el.style.display = 'none';
                    // Also remove any Tailwind 'hidden' class that could override style.display
                    el.classList.remove('hidden');
                }
            });

            // Hide loading skeleton
            _hideResultsSkeleton();

            // Hide static grid column headers (replaced by dynamic <thead> in grid mode)
            var staticHeaders = document.getElementById('gridColumnHeaders');
            if (staticHeaders) staticHeaders.style.display = 'none';
            var avgRow = document.getElementById('averagesRow');
            if (avgRow) avgRow.style.display = (mode === 'grid') ? 'flex' : 'none';

            // Show and render appropriate container
            var activeContainer;
            switch(mode) {
                case 'grid':
                    activeContainer = document.getElementById('gridViewContainer');
                    if (activeContainer) activeContainer.style.display = containerDisplay.gridViewContainer;
                    renderGridView();
                    break;
                case 'gallery':
                    activeContainer = document.getElementById('galleryViewContainer');
                    if (activeContainer) activeContainer.style.display = containerDisplay.galleryViewContainer;
                    renderGalleryView();
                    break;
                case 'shortSummary':
                    activeContainer = document.getElementById('shortSummaryViewContainer');
                    if (activeContainer) activeContainer.style.display = containerDisplay.shortSummaryViewContainer;
                    renderShortSummaryView();
                    break;
                case 'summary':
                    activeContainer = document.getElementById('summaryViewContainer');
                    if (activeContainer) activeContainer.style.display = containerDisplay.summaryViewContainer;
                    renderSummaryView();
                    break;
                case 'masterDetail':
                    activeContainer = document.getElementById('masterDetailViewContainer');
                    if (activeContainer) activeContainer.style.display = containerDisplay.masterDetailViewContainer;
                    renderMasterDetailView();
                    break;
            }

            // Update counts after render
            updateResultsCount();

            // Every render builds new cards (view, page, sort, page size): photos already fetched are
            // applied now and the rest load as they scroll in. Without this only the first render had photos.
            try { if (typeof initPhotoObserver === 'function') initPhotoObserver(); } catch(e) { console.warn('[Search] Photo observer init failed:', e); }

            if (typeof updateAveragesRow === 'function') updateAveragesRow();

            // Run REBNY Test Suite after each render (non-blocking, silent)
            if (typeof REBNYTestSuite === 'function') {
                REBNYTestSuite({ verbose: false, context: 'render' });
            }
        }

        // Column definitions for grid view — maps field IDs to header labels and cell renderers
