    document.addEventListener('DOMContentLoaded', function() {
        var hash = window.location.hash.replace('#', '');

        // Parse hash: "main", "results", "detail/123", "my", "last", "manage"
        var parts = hash.split('/');
        var route = parts[0] || 'main';
        var routeParam = parts[1] || null;
        // #detail/<id>?type=sale|rental — the universe travels with the id.
        var _detailUniverse = null;
        if (routeParam && routeParam.indexOf('?') !== -1) {
            var _rq = routeParam.split('?');
            routeParam = decodeURIComponent(_rq[0]);
            var _tm = /(?:^|&)type=(sale|rental)(?:&|$)/.exec(_rq[1] || '');
            if (_tm) _detailUniverse = _tm[1];
        }

        // On refresh with #results: keep the route — we'll restore search state
        // after API data loads via MallanAPI.onReady() in the results handler below.

        // ── IMMEDIATE: hide the search form if we're restoring detail ──
        if (route === 'detail') {
            var sf = document.getElementById('searchFormContainer');
            if (sf) sf.style.display = 'none';
        }

        // Show the correct top-level section
        if (['my', 'last', 'manage'].indexOf(route) !== -1) {
            showSearchSection(route);
        } else {
            showSearchSection('main');
        }

        window._suppressHashUpdate = true;

        if (route === 'main') {
            // ── SEARCH PAGE ──
            // Show the form. Restore search mode (basic/advanced) and tab (sale/rent/building) from session.
            var searchFormContainer = document.getElementById('searchFormContainer');
            var searchResultsSection = document.getElementById('searchResultsSection');
            if (searchFormContainer) searchFormContainer.style.display = 'block';
            if (searchResultsSection) searchResultsSection.style.display = 'none';

            // Restore saved search mode + tab + type on refresh (mode FIRST so tab sees correct state)
            try {
                var savedMode = sessionStorage.getItem('searchMode');
                var savedTab = sessionStorage.getItem('searchTab');
                var savedType = sessionStorage.getItem('searchType');
                if (savedMode && typeof toggleSearchMode === 'function') {
                    toggleSearchMode(savedMode);
                }
                if (savedTab && typeof toggleSearchTab === 'function') {
                    toggleSearchTab(savedTab);
                }
                if (savedType && typeof toggleSearchType === 'function') {
                    toggleSearchType(savedType);
                }
            } catch(e) {}

        } else if (route === 'detail' && routeParam) {
            // ── STANDALONE DETAIL PAGE ──
            // Opened in a new tab — show only the listing detail
            // Must wait for data to load before showing detail (listings starts empty)
            // routeParam can be: sequential id (legacy: "107") or lid (stable: "RLS20059088")
            var detailId = routeParam;
            var detailIdInt = parseInt(routeParam, 10);
            var isLegacyId = !isNaN(detailIdInt) && String(detailIdInt) === routeParam;
            if (typeof showListingDetail === 'function') {
                // Hide search UI entirely
                var searchFormContainer = document.getElementById('searchFormContainer');
                var searchResultsSection = document.getElementById('searchResultsSection');
                if (searchFormContainer) searchFormContainer.style.display = 'none';
                if (searchResultsSection) searchResultsSection.style.display = 'none';

                // Show a loading indicator inside content area (preserve header DOM)
                var detailPage = document.getElementById('listingDetailPage');
                if (detailPage) {
                    detailPage.classList.remove('hidden');
                    var detailContent = document.getElementById('listingDetailContent');
                    if (detailContent) {
                        detailContent.innerHTML = '<div class="flex items-center justify-center min-h-[60vh]"><div class="text-center"><div class="animate-spin w-8 h-8 border-4 border-gray-200 border-t-blue-600 rounded-full mx-auto mb-4"></div><p class="text-gray-500 text-sm">Loading listing...</p></div></div>';
                    }
                }

                function _tryShowDetail() {
                    // Check if data is available
                    if (typeof listings !== 'undefined' && listings.length > 0) {
                        // Try lid first (stable across sessions), fall back to sequential id
                        var listing = listings.find(function(l) { return l.lid === detailId; });
                        if (!listing && isLegacyId) {
                            listing = listings.find(function(l) { return l.id === detailIdInt; });
                        }
                        if (listing) {
                            showListingDetail(listing.id);
                            _setupStandaloneDetail();
                            return true;
                        }
                    }
                    return false;
                }

                function _setupStandaloneDetail() {
                    // Check if we have search results (user navigated from search)
                    var hasResults = typeof searchResultsState !== 'undefined'
                        && searchResultsState.filteredListings
                        && searchResultsState.filteredListings.length > 1;

                    var backBtn = document.getElementById('detailBackBtn');
                    var navSep = document.getElementById('detailNavSep');
                    var prevBtn = document.getElementById('detailPrevBtn');
                    var nextBtn = document.getElementById('detailNextBtn');

                    if (hasResults) {
                        // Navigated from search — show back + prev/next
                        if (backBtn) {
                            backBtn.innerHTML = '<i class="fas fa-arrow-left text-xs"></i> Back to Results';
                            backBtn.onclick = function() { closeListingDetail(); };
                        }
                        if (navSep) navSep.style.display = '';
                        if (prevBtn) prevBtn.style.display = '';
                        if (nextBtn) nextBtn.style.display = '';
                    } else {
                        // True standalone (direct URL, no search context) — show close only
                        if (backBtn) {
                            backBtn.innerHTML = '<i class="fas fa-arrow-left text-xs"></i> Back';
                            backBtn.onclick = function() { history.back(); };
                        }
                        if (navSep) navSep.style.display = 'none';
                        if (prevBtn) prevBtn.style.display = 'none';
                        if (nextBtn) nextBtn.style.display = 'none';
                    }
                }

                // Try immediately (data might already be loaded)
                if (!_tryShowDetail()) {
                    // Strategy: try 3 paths in parallel
                    // 1) Wait for bulk data:ready event (normal flow)
                    // 2) Direct API fetch by lid (fast path for refresh)
                    // 3) Safety timeout (fallback)
                    var _detailResolved = false;

                    function _markResolved() {
                        if (_detailResolved) return true;
                        _detailResolved = true;
                        window.removeEventListener('mallan:data:ready', _detailDataHandler);
                        return false;
                    }

                    // Path 1: bulk data loads (search results arrive)
                    var _detailDataHandler = function() {
                        if (_detailResolved) return;
                        window.removeEventListener('mallan:data:ready', _detailDataHandler);
                        setTimeout(function() {
                            if (!_detailResolved && _tryShowDetail()) {
                                _detailResolved = true;
                            }
                        }, 100);
                    };
                    window.addEventListener('mallan:data:ready', _detailDataHandler);

                    // Path 2: direct API fetch by lid (doesn't need bulk search)
                    if (!isLegacyId && typeof MallanAPI !== 'undefined') {
                        // lid-based URL — fetch this single listing directly
                        MallanAPI.onReady(function() {
                            if (_detailResolved) return;
                            // The executor binds a listing to its universe. Ask in the
                            // universe the link carried; a bare link tries Sale, then Rental,
                            // each lookup universe-bound — a bare id never searches both at once.
                            var _lookup = function(type) { return MallanAPI.idx.search({ listingId: detailId, type: type, limit: 1 }); };
                            var _detailFetch = _detailUniverse
                                ? _lookup(_detailUniverse)
                                : _lookup('sale').then(function(r) { return (r && r.listings && r.listings.length > 0) ? r : _lookup('rental'); });
                            _detailFetch.then(function(result) {
                                if (_detailResolved) return;
                                if (result.listings && result.listings.length > 0) {
                                    var fetched = result.listings[0];
                                    // Add to listings so showListingDetail can find it
                                    if (typeof listings !== 'undefined') {
                                        // Assign a sequential id if missing
                                        if (!fetched.id) fetched.id = listings.length + 1;
                                        listings.push(fetched);
                                    }
                                    _markResolved();
                                    showListingDetail(fetched.id);
                                    _setupStandaloneDetail();
                                }
                            }).catch(function() { /* let other paths handle it */ });
                        });
                    } else if (isLegacyId && typeof MallanAPI !== 'undefined') {
                        // Legacy sequential ID — we need to wait for bulk data
                        // But also trigger the bulk load if it hasn't started
                        MallanAPI.onReady(function() {
                            // Bulk load will be triggered by data-loader.js MallanAPI.onReady
                            // Just wait for mallan:data:ready event (Path 1)
                        });
                    }

                    // Path 3: safety timeout — 10 seconds
                    setTimeout(function() {
                        if (_markResolved()) return;
                        var errTarget = document.getElementById('listingDetailContent') || detailPage;
                        if (errTarget) {
                            errTarget.innerHTML = '<div class="flex items-center justify-center min-h-[60vh]"><div class="text-center"><i class="fas fa-exclamation-circle text-gray-400 text-3xl mb-4"></i><p class="text-gray-500">Unable to load listing. Please try again.</p><button onclick="location.reload()" class="mt-4 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">Retry</button></div></div>';
                        }
                    }, 10000);
                }
            }

        } else if (route === 'results') {
            // ── RESULTS PAGE ──
            // Show skeleton immediately while restoring state
            _navigateToResults(true);
        }

        window._suppressHashUpdate = false;

        // Reveal page now that routing is resolved (removes body opacity:0)
        var searchRenderBlock = document.getElementById('searchRenderBlock');
        if (searchRenderBlock) searchRenderBlock.remove();

        // Safety net: reveal after 500ms even if something above failed
        setTimeout(function() {
            var rb = document.getElementById('searchRenderBlock');
            if (rb) rb.remove();
        }, 500);

        // ── Handle browser back/forward buttons ──
        window.addEventListener('hashchange', function() {
            var newHash = window.location.hash.replace('#', '');
            var newParts = newHash.split('/');
            var newRoute = newParts[0] || 'main';
            var newParam = newParts[1] || null;

            if (['my', 'last', 'manage'].indexOf(newRoute) !== -1) {
                showSearchSection(newRoute);
                return;
            }

            // All these routes are within section-main
            showSearchSection('main');

            if (newRoute === 'main') {
                _navigateToSearch();
            } else if (newRoute === 'results') {
                _navigateToResults(false);
            } else if (newRoute === 'detail' && newParam) {
                if (typeof showListingDetail === 'function' && typeof listings !== 'undefined') {
                    // Try lid first (stable), then sequential id (legacy)
                    var listing = listings.find(function(l) { return l.lid === newParam; });
                    if (!listing) {
                        var numId = parseInt(newParam, 10);
                        if (!isNaN(numId)) listing = listings.find(function(l) { return l.id === numId; });
                    }
                    if (listing) {
                        window._suppressHashUpdate = true;
                        showListingDetail(listing.id);
                        window._suppressHashUpdate = false;
                    }
                }
            }
        });
    });

    /**
     * Navigate to search form — clean transition, no blank screen
     */
    function _navigateToSearch() {
        var searchFormContainer = document.getElementById('searchFormContainer');
        var searchResultsSection = document.getElementById('searchResultsSection');
        var detailPage = document.getElementById('listingDetailPage');

        if (detailPage) detailPage.classList.add('hidden');

        // Clear saved results state so refresh returns to search form, not stale results
        try { sessionStorage.removeItem('_searchState'); } catch(e) {}

        // Fade out results, fade in form
        if (searchResultsSection) {
            searchResultsSection.style.opacity = '0';
            searchResultsSection.style.transition = 'opacity 0.15s ease';
            setTimeout(function() {
                searchResultsSection.style.display = 'none';
                searchResultsSection.style.opacity = '';
                searchResultsSection.style.transition = '';
            }, 150);
        }
        if (searchFormContainer) {
            searchFormContainer.style.display = 'block';
            searchFormContainer.style.opacity = '0';
            searchFormContainer.style.transition = 'opacity 0.2s ease';
            // Force reflow before setting opacity to 1
            searchFormContainer.offsetHeight;
            searchFormContainer.style.opacity = '1';
            setTimeout(function() {
                searchFormContainer.style.transition = '';
            }, 200);

            // Restore saved search mode on back-navigation (mode FIRST so tab sees correct state)
            try {
                var savedMode = sessionStorage.getItem('searchMode');
                var savedTab = sessionStorage.getItem('searchTab');
                var savedType = sessionStorage.getItem('searchType');
                if (savedMode && typeof toggleSearchMode === 'function') toggleSearchMode(savedMode);
                if (savedTab && typeof toggleSearchTab === 'function') toggleSearchTab(savedTab);
                if (savedType && typeof toggleSearchType === 'function') toggleSearchType(savedType);
            } catch(e) {}
        }
    }

    /**
     * Navigate to results — shows skeleton immediately, renders async
     * @param {boolean} isInitialLoad - true on page load (from hash), false on hashchange
     */
    function _navigateToResults(isInitialLoad) {
        var searchFormContainer = document.getElementById('searchFormContainer');
        var searchResultsSection = document.getElementById('searchResultsSection');
        var detailPage = document.getElementById('listingDetailPage');

        if (detailPage) detailPage.classList.add('hidden');

        // Hide search form immediately
        if (searchFormContainer) searchFormContainer.style.display = 'none';

        // Show results section with skeleton
        if (searchResultsSection) {
            searchResultsSection.style.display = 'block';
            searchResultsSection.classList.remove('hidden');
        }

        // Show loading skeleton while we restore state
        if (typeof _showResultsSkeleton === 'function') {
            _showResultsSkeleton();
        }

        // On initial page load (refresh), wait for API data before rendering
        if (isInitialLoad) {
            // Try restoring saved state first
            var restored = false;
            if (typeof _restoreSearchState === 'function') {
                restored = _restoreSearchState();
            }

            if (restored && typeof searchResultsState !== 'undefined' && searchResultsState.filteredListings && searchResultsState.filteredListings.length > 0) {
                // We have cached results — render them immediately
                if (typeof initializeSearchResults === 'function') initializeSearchResults();
                if (typeof updateResultsCount === 'function') updateResultsCount();
                if (typeof updateStickyNavActive === 'function') updateStickyNavActive();
            } else {
                // No cached results — wait for listing data to load (from Trestle API)
                // _replaceListings dispatches 'mallan:data:ready' when data arrives
                window.addEventListener('mallan:data:ready', function onDataReady() {
                    window.removeEventListener('mallan:data:ready', onDataReady);
                    // Data loaded — restore search state now that listings is populated
                    if (typeof _restoreSearchState === 'function') {
                        _restoreSearchState();
                    }
                    if (typeof searchResultsState !== 'undefined' && searchResultsState.filteredListings && searchResultsState.filteredListings.length > 0) {
                        if (typeof initializeSearchResults === 'function') initializeSearchResults();
                        if (typeof updateResultsCount === 'function') updateResultsCount();
                    } else {
                        // No saved search state — go back to search form
                        // (don't dump all 500 unfiltered listings)
                        if (typeof _hideResultsSkeleton === 'function') _hideResultsSkeleton();
                        if (searchFormContainer) searchFormContainer.style.display = 'block';
                        if (searchResultsSection) searchResultsSection.style.display = 'none';
                        history.replaceState(null, '', '#main');
                    }
                });
                // Safety timeout: if data doesn't load in 10s, go to search form
                setTimeout(function() {
                    if (typeof listings === 'undefined' || listings.length === 0) {
                        if (typeof _hideResultsSkeleton === 'function') _hideResultsSkeleton();
                        if (searchFormContainer) searchFormContainer.style.display = 'block';
                        if (searchResultsSection) searchResultsSection.style.display = 'none';
                        history.replaceState(null, '', '#main');
                    }
                }, 10000);
            }
            return;
        }

        // Non-initial (hashchange): restore state immediately
        requestAnimationFrame(function() {
            var restored = false;
            if (typeof _restoreSearchState === 'function') {
                restored = _restoreSearchState();
            }

            if (restored) {
                if (typeof initializeSearchResults === 'function') initializeSearchResults();
                if (typeof updateResultsCount === 'function') updateResultsCount();
                if (typeof updateStickyNavActive === 'function') updateStickyNavActive();
            } else {
                if (typeof _hideResultsSkeleton === 'function') _hideResultsSkeleton();
                if (searchFormContainer) searchFormContainer.style.display = 'block';
                if (searchResultsSection) searchResultsSection.style.display = 'none';
                history.replaceState(null, '', '#main');
            }
        });
    }
