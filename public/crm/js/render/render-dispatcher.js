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
            // Gate 4: Syndication → SyndicateTo empty (Mallan decision) → NOT for third-party portals (no filter, badge only)
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
                // Gate 6: Closed >24h — suppress (UCBA Art. I Sec. 6-7).
                // The token is the live Cotality member `Closed`. This gate used to compare the retired
                // uppercase word 'CLOSED', which the DTO mapper no longer emits — so the gate had gone dead.
                var _closedToken = (typeof MallanStatus !== 'undefined' && MallanStatus)
                    ? MallanStatus.token(l) === 'Closed'
                    : l.status === 'Closed';
                if (_closedToken) {
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
            // Order and page are the executor's (Search Consolidation Packet 1): no local sort, no local slice.
            return listings;
        }

        // ── All view container IDs for visibility management ──
        var _viewContainerIds = [
            'gridViewContainer',
            'galleryViewContainer',
            'shortSummaryViewContainer',
            'summaryViewContainer',
            'masterDetailViewContainer',
            // The Buildings tab renders grouped building rows into its own container.
            'buildingResultsContainer'
        ];
        /** The five listing view modes. Anything else is not a view. */
        var _VIEW_MODES = ['grid', 'gallery', 'shortSummary', 'summary', 'masterDetail'];
        var _DEFAULT_VIEW_MODE = 'gallery';

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

        /**
         * Group the executor's rows into BUILDINGS, in Mallan code.
         *
         * There is no entitled Cotality Building resource (HTTP 403 on this subscription) and
         * `BuildingKeyNumeric` is suppressed — null on every row — so the grouping key can only be the
         * building name the row carries, else its street address. The count is stated as what it is: the
         * buildings present in THIS page of the executor's answer.
         */
        function _buildingIdentity(l) {
            var name = (l.buildingName || '').trim();
            if (name) return { key: 'name:' + name.toLowerCase(), label: name, sub: l.address || '' };
            var addr = (l.address || 'Address Unavailable').trim();
            return { key: 'addr:' + addr.toLowerCase(), label: addr, sub: '' };
        }

        function renderBuildingResults() {
            var container = document.getElementById('buildingResultsContainer');
            if (!container) return;
            var rows = getFilteredListings();
            if (rows.length === 0) {
                container.innerHTML = '<div class="text-center py-10 text-gray-400"><i class="fas fa-city text-2xl mb-2"></i>'
                    + '<p class="text-sm">No buildings match these criteria.</p></div>';
                return;
            }
            var order = [];
            var groups = {};
            rows.forEach(function(l) {
                var id = _buildingIdentity(l);
                if (!groups[id.key]) { groups[id.key] = { id: id, units: [] }; order.push(id.key); }
                groups[id.key].units.push(l);
            });

            var html = '<div class="flex items-center justify-between mb-3">'
                + '<p class="text-sm font-semibold text-gray-900">' + order.length
                + (order.length === 1 ? ' building' : ' buildings') + '</p>'
                + '<p class="text-[11px] text-gray-400">grouped from ' + rows.length
                + (rows.length === 1 ? ' listing' : ' listings') + ' on this page of results</p></div>';
            html += '<div class="space-y-2">';
            order.forEach(function(key) {
                var g = groups[key];
                var prices = g.units.map(function(u) { return u.price; })
                    .filter(function(p) { return typeof p === 'number' && isFinite(p) && p > 0; });
                var range = prices.length
                    ? (prices.length === 1
                        ? '$' + Math.min.apply(null, prices).toLocaleString()
                        : '$' + Math.min.apply(null, prices).toLocaleString() + ' – $' + Math.max.apply(null, prices).toLocaleString())
                    : 'Price unavailable';
                var neighborhood = (g.units[0] && g.units[0].neighborhood) || '';
                var borough = (g.units[0] && g.units[0].borough) || '';
                var where = [neighborhood, borough].filter(Boolean).join(', ');
                html += '<div data-building-row data-building-key="' + _escBuilding(key) + '" class="border rounded-lg p-3 hover:bg-blue-50 transition-colors">'
                    + '<div class="flex items-start justify-between gap-3">'
                    + '<div><p class="text-sm font-semibold text-gray-900">' + _escBuilding(g.id.label) + '</p>'
                    + (g.id.sub ? '<p class="text-xs text-gray-500">' + _escBuilding(g.id.sub) + '</p>' : '')
                    + (where ? '<p class="text-xs text-gray-400">' + _escBuilding(where) + '</p>' : '')
                    + '</div>'
                    + '<div class="text-right"><p class="text-xs font-semibold text-gray-700">' + g.units.length
                    + (g.units.length === 1 ? ' unit' : ' units') + '</p>'
                    + '<p class="text-xs text-gray-500">' + range + '</p></div>'
                    + '</div><div class="mt-2 flex flex-wrap gap-1">';
                g.units.forEach(function(u) {
                    var label = (typeof MallanStatus !== 'undefined' && MallanStatus) ? MallanStatus.label(u) : (u.status_label || '');
                    var classes = (typeof MallanStatus !== 'undefined' && MallanStatus) ? MallanStatus.classes(u) : 'bg-gray-100 text-gray-600';
                    html += '<button type="button" onclick="openListingInNewTab(\'' + u.id + '\')" class="px-2 py-0.5 rounded text-[11px] border hover:border-blue-400">'
                        + (u.unit ? _escBuilding(u.unit) : 'Unit') + ' <span class="' + classes + ' px-1 rounded">' + _escBuilding(label) + '</span></button>';
                });
                html += '</div></div>';
            });
            html += '</div>';
            html += '<p class="text-[10px] text-gray-400 mt-3" data-rebny-attribution>Listing data courtesy of the REBNY Listing Service (RLS) via Trestle &middot; '
                + 'Mallan Real Estate Inc. #10991205323 &middot; Information deemed reliable but not guaranteed &middot; Equal Housing Opportunity</p>';
            container.innerHTML = html;
        }
        function _escBuilding(v) {
            return String(v == null ? '' : v)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }
        window.renderBuildingResults = renderBuildingResults;

        function renderSearchResults() {
            var mode = searchResultsState.viewMode;
            // A persisted mode outside the five is not a view. It used to hide every container and render
            // nothing at all (a stale 'list' / 'map' from the retired toggleResultsView did exactly that).
            if (_VIEW_MODES.indexOf(mode) === -1) {
                mode = _DEFAULT_VIEW_MODE;
                searchResultsState.viewMode = mode;
                try { localStorage.setItem('searchResultsViewMode', mode); } catch (e) {}
            }

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

            // A Building search renders buildings, not listing cards. It is a Property query grouped in
            // Mallan code — the provider publishes no Building resource on this entitlement.
            if (typeof currentSearchTab !== 'undefined' && currentSearchTab === 'building') {
                var bldg = document.getElementById('buildingResultsContainer');
                if (bldg) bldg.style.display = 'block';
                renderBuildingResults();
                updateResultsCount();
                if (typeof updateAveragesRow === 'function') updateAveragesRow();
                if (typeof REBNYTestSuite === 'function') REBNYTestSuite({ verbose: false, context: 'render' });
                return;
            }

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
