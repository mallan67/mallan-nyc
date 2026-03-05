    document.addEventListener('DOMContentLoaded', function() {
        var hash = window.location.hash.replace('#', '');

        // Parse hash: "main", "results", "detail/123", "my", "last", "manage"
        var parts = hash.split('/');
        var route = parts[0] || 'main';
        var routeParam = parts[1] || null;

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

            // Restore saved search tab + mode on refresh
            try {
                var savedTab = sessionStorage.getItem('searchTab');
                var savedMode = sessionStorage.getItem('searchMode');
                if (savedTab && typeof toggleSearchTab === 'function') {
                    toggleSearchTab(savedTab);
                }
                if (savedMode && typeof toggleSearchMode === 'function') {
                    toggleSearchMode(savedMode);
                }
            } catch(e) {}

        } else if (route === 'detail' && routeParam) {
            // ── STANDALONE DETAIL PAGE ──
            // Opened in a new tab — show only the listing detail
            var detailId = parseInt(routeParam, 10);
            if (!isNaN(detailId) && typeof showListingDetail === 'function') {
                // Hide search UI entirely
                var searchFormContainer = document.getElementById('searchFormContainer');
                var searchResultsSection = document.getElementById('searchResultsSection');
                if (searchFormContainer) searchFormContainer.style.display = 'none';
                if (searchResultsSection) searchResultsSection.style.display = 'none';

                // Show the detail
                showListingDetail(detailId);

                // Adjust header for standalone mode:
                // - Change "Back to Results" to "Close"
                // - Hide prev/next nav (no results context)
                var backBtn = document.getElementById('detailBackBtn');
                var navSep = document.getElementById('detailNavSep');
                var prevBtn = document.getElementById('detailPrevBtn');
                var nextBtn = document.getElementById('detailNextBtn');
                if (backBtn) {
                    backBtn.innerHTML = '<i class="fas fa-times text-xs"></i> Close';
                    backBtn.onclick = function() { window.close(); };
                }
                if (navSep) navSep.style.display = 'none';
                if (prevBtn) prevBtn.style.display = 'none';
                if (nextBtn) nextBtn.style.display = 'none';
            }

        } else if (route === 'results') {
            // ── RESULTS PAGE ──
            // Show skeleton immediately while restoring state
            _navigateToResults(true);
        }

        window._suppressHashUpdate = false;

        // Remove the render-blocking styles now that routing is resolved
        var routeBlock = document.getElementById('routeBlock');
        if (routeBlock) routeBlock.remove();
        var modeBlock = document.getElementById('modeBlock');
        if (modeBlock) modeBlock.remove();

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
                var detailId = parseInt(newParam, 10);
                if (!isNaN(detailId) && typeof showListingDetail === 'function') {
                    window._suppressHashUpdate = true;
                    showListingDetail(detailId);
                    window._suppressHashUpdate = false;
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

            // Restore saved search mode on back-navigation
            try {
                var savedTab = sessionStorage.getItem('searchTab');
                var savedMode = sessionStorage.getItem('searchMode');
                if (savedTab && typeof toggleSearchTab === 'function') toggleSearchTab(savedTab);
                if (savedMode && typeof toggleSearchMode === 'function') toggleSearchMode(savedMode);
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
                    // Data loaded — restore search state now that mockListings is populated
                    if (typeof _restoreSearchState === 'function') {
                        _restoreSearchState();
                    }
                    if (typeof searchResultsState !== 'undefined' && searchResultsState.filteredListings && searchResultsState.filteredListings.length > 0) {
                        if (typeof initializeSearchResults === 'function') initializeSearchResults();
                        if (typeof updateResultsCount === 'function') updateResultsCount();
                    } else if (typeof mockListings !== 'undefined' && mockListings.length > 0) {
                        searchResultsState.filteredListings = mockListings.slice();
                        searchResultsState.currentPage = 1;
                        if (typeof initializeSearchResults === 'function') initializeSearchResults();
                        if (typeof updateResultsCount === 'function') updateResultsCount();
                    } else {
                        if (typeof _hideResultsSkeleton === 'function') _hideResultsSkeleton();
                        if (searchFormContainer) searchFormContainer.style.display = 'block';
                        if (searchResultsSection) searchResultsSection.style.display = 'none';
                        history.replaceState(null, '', '#main');
                    }
                });
                // Safety timeout: if data doesn't load in 10s, go to search form
                setTimeout(function() {
                    if (typeof mockListings === 'undefined' || mockListings.length === 0) {
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
