        function initializeSearchResults() {
            try {
                // SELECTION IS DURABLE BY LISTING IDENTITY, NOT BY WHAT IS ON SCREEN.
                //
                // This pruned selectedListings to the ids present in
                // `filteredListings` and PERSISTED the result. On the
                // authoritative path those rows are ONE SERVER PAGE, so paging
                // from 1 to 2 deleted every listing the broker had picked on
                // page 1 — permanently, to localStorage — while the server
                // response promises `selectionsAreDurableBy: "ListingKey"`.
                //
                // "Not on this page" is not "stale". The cleanup is only sound
                // when the rows in memory ARE the whole result set, so it now
                // runs only then, and the durable set is otherwise left alone.
                var scope = window.getResultScope();
                if (scope.isCompleteUniverse) {
                    var currentIds = (searchResultsState.filteredListings || listings).map(function(l) { return l.id; });
                    searchResultsState.selectedListings = searchResultsState.selectedListings.filter(function(id) {
                        return currentIds.indexOf(id) !== -1;
                    });
                    localStorage.setItem('selectedListings', JSON.stringify(searchResultsState.selectedListings));
                }

                // A SESSION SUPPRESSION MAY NOT SILENTLY RESIZE A COUNTED PAGE.
                //
                // Removing rows from a server page leaves a hole: the page
                // renders short, the count still describes the universe those
                // rows came from, and the next page begins where the server
                // said — so the suppressed rows are not pulled forward, they are
                // simply missing. Applied to a locally-held catalogue it is
                // sound, because there the rows and the count are the same set.
                var removedKey = 'removedListings_' + LOGGED_IN_AGENT.id;
                var removed = JSON.parse(localStorage.getItem(removedKey)) || [];
                if (removed.length > 0 && scope.isCompleteUniverse) {
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

        // ── View mode icons/labels (user-facing) ──
        var VIEW_ICONS  = { grid: 'fa-list', gallery: 'fa-th-large', shortSummary: 'fa-align-left', summary: 'fa-bars', masterDetail: 'fa-columns' };
        var VIEW_LABELS = { grid: 'List', gallery: 'Grid', shortSummary: 'Short Summary', summary: 'Summary', masterDetail: 'Master Details' };

        var lastListViewMode = searchResultsState.viewMode || 'gallery';

        function toggleViewModeDropdown(event) {
            var dd = document.getElementById('viewModeDropdown');
            dd.classList.toggle('hidden');
        }

        // Called by dropdown items — sets the list results view mode
        function setViewMode(mode) {
            searchResultsState.viewMode = mode;
            localStorage.setItem('searchResultsViewMode', mode);

            lastListViewMode = mode;

            var displayMode = mode;
            document.getElementById('viewModeIcon').className = 'fas ' + (VIEW_ICONS[displayMode] || 'fa-th-large');
            document.getElementById('viewModeLabel').textContent = VIEW_LABELS[displayMode] || 'Grid';

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
            // Gate 5: Coming Soon → MlsStatus=ComingSoon → visible but no showings (no filter, badge + disable)
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
            var renderContext = (typeof searchDisplayContext !== 'undefined') ? searchDisplayContext : 'idx';
            // COMPLIANCE STILL WINS — BUT IT NO LONGER DOES IT SILENTLY.
            //
            // The server already applies these gates inside the final-universe
            // assembly, so on an authoritative page this filter should remove
            // NOTHING. If it removes something, server and client disagree about
            // a distribution gate, which is a defect to surface, not a routine
            // filter to absorb: the page renders short while the count still
            // describes the universe those rows were cut from.
            //
            // The rows are still removed. A non-displayable listing must never
            // reach a screen, and that is not negotiable for a telemetry gap.
            // What changes is that the gap stops being invisible.
            var _beforeGates = listings.length;
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
                // Gate 6: Closed >24h — suppress (UCBA Art. I Sec. 6-7)
                if (l.status === 'Closed') {
                    var closedTs = l.updatedDate ? new Date(l.updatedDate) : null;
                    if (closedTs && !isNaN(closedTs.getTime())) {
                        var hoursSinceClosed = (Date.now() - closedTs.getTime()) / (1000 * 60 * 60);
                        if (hoursSinceClosed > 24) return false;
                    }
                }
                return true;
            });

            var _scope = (typeof window.getResultScope === 'function')
                ? window.getResultScope()
                : { isCompleteUniverse: true };
            var _gateRemovals = _beforeGates - listings.length;
            searchResultsState.clientGateRemovals = _gateRemovals;
            if (_gateRemovals > 0 && !_scope.isCompleteUniverse) {
                console.error(
                    '[Search] INTEGRITY: ' + _gateRemovals + ' row(s) on an authoritative page failed the ' +
                    'browser distribution gates. The server applies the same gates before counting, so this ' +
                    'is a server/client disagreement, not routine filtering. The page renders short while ' +
                    'the count still describes the universe those rows came from.'
                );
            }

            // A FLAG FILTER OVER ONE PAGE ANSWERS A SMALLER QUESTION.
            //
            // picked/liked/shown are the agent's own local annotations; the
            // server has no counterpart, so on a paged result this can only ever
            // filter the rows in memory. "Show me my picked listings" then
            // answers from fifty rows of several thousand.
            //
            // Recorded so the count and the note beside it can say which
            // population they describe, rather than leaving a filtered page
            // under a total that describes the whole search.
            if (typeof filterState !== 'undefined' && typeof listingFlags !== 'undefined') {
                var activeFlags = [];
                for (var fk in filterState.statusFilters) {
                    if (filterState.statusFilters[fk]) activeFlags.push(fk);
                }
                searchResultsState.flagFilterIsPageLocal =
                    activeFlags.length > 0 && !_scope.isCompleteUniverse;
                if (activeFlags.length > 0) {
                    listings = listings.filter(function(l) {
                        return activeFlags.some(function(flag) {
                            return listingFlags[l.id] && listingFlags[l.id][flag];
                        });
                    });
                }
            }
            // Apply sorting
            var field = searchResultsState.sortField;
            var order = searchResultsState.sortOrder;
            if (field) {
                listings.sort(function(a, b) {
                    var va = a[field], vb = b[field];
                    if (va == null) va = '';
                    if (vb == null) vb = '';
                    if (typeof va === 'number' && typeof vb === 'number') {
                        return order === 'asc' ? va - vb : vb - va;
                    }
                    va = String(va).toLowerCase();
                    vb = String(vb).toLowerCase();
                    if (va < vb) return order === 'asc' ? -1 : 1;
                    if (va > vb) return order === 'asc' ? 1 : -1;
                    return 0;
                });
            }
            // PAGINATE LOCALLY ONLY WHEN THE ROWS ARE NOT ALREADY A PAGE.
            //
            // An AUTHORITATIVE set is now ONE SERVER PAGE: the server cut it
            // from the final universe and filteredListings holds exactly those
            // rows. Slicing it again by currentPage would paginate a page —
            // page 3 would take rows 41-60 of a 20-row array and render nothing
            // at all, so every page after the first would look like an empty
            // search.
            //
            // A PROVISIONAL set is different and still needs this: it is a local
            // re-filter of the whole loaded catalogue, so it holds every
            // matching row and the slice is what turns it into a page.
            var serverPaged = searchResultsState.resultProvenance === 'authoritative'
                && !!searchResultsState.serverCount;
            if (!skipPagination && !serverPaged) {
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

            if (typeof updateAveragesRow === 'function') updateAveragesRow();

            // Run REBNY Test Suite after each render (non-blocking, silent)
            if (typeof REBNYTestSuite === 'function') {
                REBNYTestSuite({ verbose: false, context: 'render' });
            }
        }

        // Column definitions for grid view — maps field IDs to header labels and cell renderers
