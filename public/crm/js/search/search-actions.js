        // ═══════════════════════════════════════════════════════════════════════════════
        // CLIENT DELIVERY SYSTEM - Search Results Functions
        // ═══════════════════════════════════════════════════════════════════════════════

        // Toggle results view (grid/list/map)
        // Legacy view toggle - kept for backwards compatibility, superseded by setViewMode()
        function toggleResultsView(view) {
            var grid = document.getElementById('resultsGrid');
            var viewGrid = document.getElementById('viewGrid');
            var viewList = document.getElementById('viewList');
            var viewMap = document.getElementById('viewMap');

            if (!grid || !viewGrid || !viewList || !viewMap) return;

            // Reset button styles
            [viewGrid, viewList, viewMap].forEach(btn => {
                if (btn) {
                    btn.classList.remove('bg-gray-900', 'text-white');
                    btn.classList.add('bg-white', 'text-gray-600');
                }
            });

            // Apply active style
            var activeBtn = document.getElementById('view' + view.charAt(0).toUpperCase() + view.slice(1));
            if (activeBtn) {
                activeBtn.classList.remove('bg-white', 'text-gray-600');
                activeBtn.classList.add('bg-gray-900', 'text-white');
            }

            // Change grid layout
            if (view === 'grid') {
                grid.classList.remove('grid-cols-1', 'grid-cols-2');
                grid.classList.add('grid-cols-3');
            } else if (view === 'list') {
                grid.classList.remove('grid-cols-2', 'grid-cols-3');
                grid.classList.add('grid-cols-1');
            } else if (view === 'map') {
                grid.classList.remove('grid-cols-1', 'grid-cols-3');
                grid.classList.add('grid-cols-2');
            }
        }

        // Client delivery stubs (client section removed)
        function toggleClientDeliveryMenu() {}
        function openDeliveryModal() {}
        function closeDeliveryModal() {}

        // Select all results (with REBNY bulk export limit)
        function selectAllResults() {
            var BULK_LIMIT = 25;
            var checkboxes = document.querySelectorAll('.listing-checkbox');
            if (checkboxes.length > BULK_LIMIT) {
                var proceed = confirm(
                    'REBNY Compliance Notice\n\n' +
                    'Selecting all ' + checkboxes.length + ' listings exceeds the bulk export limit of ' + BULK_LIMIT + '.\n\n' +
                    'Only the first ' + BULK_LIMIT + ' will be selected.\nExport in batches using filtered searches for more.'
                );
                if (!proceed) return;
                var count = 0;
                checkboxes.forEach(function(cb) {
                    cb.checked = (count < BULK_LIMIT);
                    count++;
                });
            } else {
                checkboxes.forEach(function(cb) { cb.checked = true; });
            }
            updateSelectedCount();
        }

        // Clear selection
        function clearSelection() {
            document.querySelectorAll('.listing-checkbox').forEach(cb => cb.checked = false);
            updateSelectedCount();
        }

        // Update selected count display
        function updateSelectedCount() {
            var count = document.querySelectorAll('.listing-checkbox:checked').length;
            document.getElementById('selectedCount').textContent = count;
        }

        // Add event listeners to checkboxes
        document.addEventListener('DOMContentLoaded', function() {
            document.querySelectorAll('.listing-checkbox').forEach(cb => {
                cb.addEventListener('change', updateSelectedCount);
            });

            // Initialize search tabs — restore saved tab + mode, or default to Sale/Basic
            var _initTab = 'sale';
            var _initMode = 'basic';
            try { _initTab = sessionStorage.getItem('searchTab') || 'sale'; } catch(e) {}
            try { _initMode = sessionStorage.getItem('searchMode') || 'basic'; } catch(e) {}
            toggleSearchMode(_initMode);
            toggleSearchTab(_initTab);
        });

        // Close modal on escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeDeliveryModal();
                closeGridLayoutsModal();
                closeReportsModal();
                closeAddClientModal();
                closeSaveSearchModal();
            }
        });

        // ─── LAST SEARCH RECALL ───────────────────────────────────────────────
        // Save criteria when performSearch runs; recall loads criteria + re-runs search
        function saveLastSearchCriteria() {
            try {
                var key = 'lastSearchCriteria_' + (typeof LOGGED_IN_AGENT !== 'undefined' ? LOGGED_IN_AGENT.id : 'default');
                var criteria = typeof activeSearchCriteria !== 'undefined' ? activeSearchCriteria : null;
                if (criteria) {
                    localStorage.setItem(key, JSON.stringify({ criteria: criteria, timestamp: Date.now() }));
                }
            } catch (e) { /* localStorage full or unavailable */ }
        }

        function recallLastSearch() {
            try {
                var key = 'lastSearchCriteria_' + (typeof LOGGED_IN_AGENT !== 'undefined' ? LOGGED_IN_AGENT.id : 'default');
                var data = localStorage.getItem(key);
                if (!data) {
                    showToast('No previous search found. Run a search first.', 'info');
                    return;
                }
                var parsed = JSON.parse(data);
                // Show search section if on a different tab
                showSearchSection('main');
                // Hide form, show results
                var searchFormContainer = document.getElementById('searchFormContainer');
                if (searchFormContainer) searchFormContainer.style.display = 'none';
                // Re-apply the criteria and run search
                if (typeof activeSearchCriteria !== 'undefined') {
                    activeSearchCriteria = parsed.criteria;
                }
                if (typeof searchResultsState !== 'undefined' && typeof mockListings !== 'undefined') {
                    searchResultsState.filteredListings = filterListings(mockListings, parsed.criteria);
                    searchResultsState.currentPage = 1;
                    var searchResultsSection = document.getElementById('searchResultsSection');
                    if (searchResultsSection) {
                        searchResultsSection.style.display = 'block';
                        searchResultsSection.classList.remove('hidden');
                        initializeSearchResults();
                    }
                    updateResultsCount();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
                var ago = Math.round((Date.now() - parsed.timestamp) / 60000);
                var agoText = ago < 1 ? 'just now' : ago < 60 ? ago + 'm ago' : Math.round(ago / 60) + 'h ago';
                console.log('[Last Search] Recalled criteria from ' + agoText);
            } catch (e) {
                showToast('Could not recall last search: ' + e.message, 'error');
            }
        }

        // ═══════════════════════════════════════════════════════════════════════════════
