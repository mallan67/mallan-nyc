        // ═══════════════════════════════════════════════════════════════════════════════
        // CLIENT DELIVERY SYSTEM - Search Results Functions
        // ═══════════════════════════════════════════════════════════════════════════════

        // Toggle results view (grid/list/map)
        // Legacy view toggle - kept for backwards compatibility, superseded by setViewMode()
        // DEPRECATED: Superseded by setViewMode() in render-dispatcher.js. Kept for onclick compatibility.
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

        // Client delivery — route through Reports modal
        function toggleClientDeliveryMenu() {
            var ids = (typeof getSelectedListingIds === 'function') ? getSelectedListingIds() : [];
            if (ids.length === 0) {
                if (typeof showToast === 'function') showToast('Please select at least one listing first.', 'warning');
                return;
            }
            if (typeof openReportsModal === 'function') openReportsModal(ids, 'email');
        }

        function openDeliveryModal() {
            toggleClientDeliveryMenu();
        }

        function closeDeliveryModal() {
            var modal = document.getElementById('reportsModal');
            if (modal) modal.style.display = 'none';
        }

        // Select all results
        function selectAllResults() {
            if (typeof toggleSelectAll === 'function') return toggleSelectAll();
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

            // Initialize search tabs — restore saved tab + mode + type, or default to Sale/Basic/General
            var _initTab = 'sale';
            var _initMode = 'basic';
            var _initType = 'general';
            try { _initTab = sessionStorage.getItem('searchTab') || 'sale'; } catch(e) {}
            try { _initMode = sessionStorage.getItem('searchMode') || 'basic'; } catch(e) {}
            try { _initType = sessionStorage.getItem('searchType') || 'general'; } catch(e) {}
            toggleSearchMode(_initMode);
            toggleSearchTab(_initTab);
            if (typeof toggleSearchType === 'function') toggleSearchType(_initType);
        });

        // Close modal on escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                if (typeof closeDeliveryModal === 'function') closeDeliveryModal();
                if (typeof closeGridLayoutsModal === 'function') closeGridLayoutsModal();
                if (typeof closeReportsModal === 'function') closeReportsModal();
                if (typeof closeAddClientModal === 'function') closeAddClientModal();
                if (typeof closeSaveSearchModal === 'function') closeSaveSearchModal();
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
                if (typeof searchResultsState !== 'undefined') {
                    // A recalled search is re-asked of the canonical executor — never rebuilt
                    // from rows cached in the browser (Search Consolidation Packet 1).
                    searchResultsState.filteredListings = [];
                    searchResultsState.serverPaged = true;
                    searchResultsState.serverTotal = null;
                    searchResultsState.serverCountMeaning = null;
                    searchResultsState.currentPage = 1;
                    if (typeof _showSearchResults === 'function') _showSearchResults();
                    if (typeof _serverSearch === 'function') _serverSearch(parsed.criteria);
                }
                var ago = Math.round((Date.now() - parsed.timestamp) / 60000);
                var agoText = ago < 1 ? 'just now' : ago < 60 ? ago + 'm ago' : Math.round(ago / 60) + 'h ago';
                console.log('[Last Search] Recalled criteria from ' + agoText);
            } catch (e) {
                showToast('Could not recall last search: ' + e.message, 'error');
            }
        }

        // ═══════════════════════════════════════════════════════════════════════════════
