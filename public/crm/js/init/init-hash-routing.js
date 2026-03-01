    document.addEventListener('DOMContentLoaded', function() {
        var hash = window.location.hash.replace('#', '');

        // Parse hash: "main", "results", "detail/123", "my", "last", "manage"
        var parts = hash.split('/');
        var route = parts[0] || 'main';
        var routeParam = parts[1] || null;

        // ── IMMEDIATE: hide the search form if we're restoring results/detail ──
        // This prevents the flash of the basic search form before results load.
        if (route === 'results' || route === 'detail') {
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
            // ── BASIC SEARCH PAGE ──
            // Just show the form. Do NOT call performSearch — that would flash
            // results and pollute sessionStorage. Results load when user clicks Search.
            var searchFormContainer = document.getElementById('searchFormContainer');
            var searchResultsSection = document.getElementById('searchResultsSection');
            if (searchFormContainer) searchFormContainer.style.display = 'block';
            if (searchResultsSection) searchResultsSection.style.display = 'none';

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
            // Try to restore saved search state from sessionStorage
            var restored = false;
            if (typeof _restoreSearchState === 'function') {
                restored = _restoreSearchState();
            }

            if (restored) {
                // Show results directly from saved state
                var searchFormContainer = document.getElementById('searchFormContainer');
                var searchResultsSection = document.getElementById('searchResultsSection');
                if (searchFormContainer) searchFormContainer.style.display = 'none';
                if (searchResultsSection) {
                    searchResultsSection.style.display = 'block';
                    searchResultsSection.classList.remove('hidden');
                    if (typeof initializeSearchResults === 'function') initializeSearchResults();
                }
                if (typeof updateResultsCount === 'function') updateResultsCount();
                if (typeof updateStickyNavActive === 'function') updateStickyNavActive();
            } else {
                // No saved state — fall back to a fresh search (shows all listings)
                if (typeof performSearch === 'function') {
                    performSearch();
                }
            }
        }

        window._suppressHashUpdate = false;

        // Remove the render-blocking style now that routing is resolved
        var routeBlock = document.getElementById('routeBlock');
        if (routeBlock) routeBlock.remove();

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
                var searchFormContainer = document.getElementById('searchFormContainer');
                var searchResultsSection = document.getElementById('searchResultsSection');
                var detailPage = document.getElementById('listingDetailPage');
                if (searchFormContainer) searchFormContainer.style.display = 'block';
                if (searchResultsSection) searchResultsSection.style.display = 'none';
                if (detailPage) detailPage.classList.add('hidden');
            } else if (newRoute === 'results') {
                var searchFormContainer = document.getElementById('searchFormContainer');
                var searchResultsSection = document.getElementById('searchResultsSection');
                var detailPage = document.getElementById('listingDetailPage');
                if (searchFormContainer) searchFormContainer.style.display = 'none';
                if (searchResultsSection) {
                    searchResultsSection.style.display = 'block';
                    searchResultsSection.classList.remove('hidden');
                }
                if (detailPage) detailPage.classList.add('hidden');
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
