        // ═══════════════════════════════════════════════════════════════════════════════
        // CLIENT DELIVERY SYSTEM - Search Results Functions
        // ═══════════════════════════════════════════════════════════════════════════════

        // toggleResultsView(grid|list|map) was DELETED 2026-09-09. It targeted #viewGrid / #viewList /
        // #viewMap and #resultsGrid — none of which exists on this page — so it could only ever no-op, and
        // its three view WORDS are not view modes: setViewMode (render-dispatcher.js) owns the five real
        // ones (grid | gallery | shortSummary | summary | masterDetail). A stale 'list' or 'map' left in
        // localStorage by the old function used to hide every container and render a blank results page.

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
            // MUST hide by the same mechanism openReportsModal() reverses. This used to set an inline
            // style.display='none' on #reportsModal while the modal is toggled by the `hidden` CLASS
            // (reports.js openReportsModal/closeReportsModal). The Escape handler below calls this on every
            // press, and an inline style beats a class — so a single Escape press permanently killed the
            // reports modal for the rest of the session: `classList.remove('hidden')` ran, and nothing
            // rendered. Any leftover inline value from an older session is cleared too.
            var modal = document.getElementById('reportsModal');
            if (!modal) return;
            if (modal.style.display) modal.style.display = '';
            modal.classList.add('hidden');
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
                // ── Restore the TRANSACTION and the SEARCH TYPE before anything renders ──────────────
                // A recalled rental search used to be labelled "Sales · Basic" and refined as a sale,
                // because currentSearchTab was never set from the stored criteria; and if the Comparables
                // tab was showing, the recalled results appeared over the comparables form.
                var _tab = (parsed.criteria && parsed.criteria.searchTab) || 'sale';
                if (typeof toggleSearchType === 'function') toggleSearchType('general');
                if (typeof toggleSearchTab === 'function') toggleSearchTab(_tab);
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
