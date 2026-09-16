        // ═══════════════════════════════════════════════════════════════════════════════
        // SELECTION FUNCTIONS
        // ═══════════════════════════════════════════════════════════════════════════════

        function toggleListingSelection(listingId) {
            var index = searchResultsState.selectedListings.indexOf(listingId);
            if (index > -1) {
                searchResultsState.selectedListings.splice(index, 1);
            } else {
                searchResultsState.selectedListings.push(listingId);
            }
            localStorage.setItem('selectedListings', JSON.stringify(searchResultsState.selectedListings));
            updateSelectionActionBar();
            renderSearchResults();
        }

        function toggleSelectAll() {
            var checkbox = document.getElementById('selectAllCheckbox') || document.getElementById('gridSelectAll');
            if (checkbox && checkbox.checked) {
                searchResultsState.selectedListings = getFilteredListings().map(l => l.id);
            } else {
                searchResultsState.selectedListings = [];
            }
            localStorage.setItem('selectedListings', JSON.stringify(searchResultsState.selectedListings));
            updateSelectionActionBar();
            renderSearchResults();
        }

        function updateSelectionActionBar() {
            var count = searchResultsState.selectedListings.length;
            document.querySelectorAll('#selectedCount').forEach(function(el) { el.textContent = count; });
            document.querySelectorAll('#selectedCountDisplay').forEach(function(el) { el.textContent = count; });

            var actionBar = document.getElementById('selectionActionBar');
            if (actionBar) {
                actionBar.style.display = count > 0 ? 'flex' : 'none';
            }
            // Update selection pill color
            var pill = document.getElementById('selectionPill');
            if (pill) {
                if (count > 0) {
                    pill.classList.remove('bg-gray-100', 'text-gray-600');
                    pill.classList.add('bg-blue-100', 'text-blue-700');
                } else {
                    pill.classList.remove('bg-blue-100', 'text-blue-700');
                    pill.classList.add('bg-gray-100', 'text-gray-600');
                }
            }
        }

        function removeFromResults() {
            // Validate: only keep IDs that exist in the current result set
            var currentIds = (searchResultsState.filteredListings || listings).map(function(l) { return l.id; });
            searchResultsState.selectedListings = searchResultsState.selectedListings.filter(function(id) {
                return currentIds.indexOf(id) !== -1;
            });

            if (searchResultsState.selectedListings.length === 0) {
                showToast('Please select at least one listing to remove.', 'warning');
                return;
            }

            var removeCount = searchResultsState.selectedListings.length;
            var removeSet = {};
            searchResultsState.selectedListings.forEach(function(id) { removeSet[id] = true; });

            // Actually remove from the filtered results (or create filtered copy of listings)
            var source = searchResultsState.filteredListings || listings.slice();
            searchResultsState.filteredListings = source.filter(function(l) {
                return !removeSet[l.id];
            });

            // Store removed IDs so they stay removed during this session
            var removedKey = 'removedListings_' + LOGGED_IN_AGENT.id;
            var alreadyRemoved = JSON.parse(localStorage.getItem(removedKey)) || [];
            searchResultsState.selectedListings.forEach(function(id) {
                if (alreadyRemoved.indexOf(id) === -1) alreadyRemoved.push(id);
            });
            localStorage.setItem(removedKey, JSON.stringify(alreadyRemoved));

            // Clear selection and re-render
            searchResultsState.selectedListings = [];
            localStorage.setItem('selectedListings', JSON.stringify([]));
            searchResultsState.currentPage = 1;
            updateSelectionActionBar();
            renderSearchResults();

            // Update total count display
            var totalEl = document.getElementById('totalResults');
            if (totalEl) totalEl.textContent = (searchResultsState.filteredListings || []).length + ' Results';

            if (typeof showFlagToast === 'function') {
                showFlagToast('Removed ' + removeCount + ' listing' + (removeCount !== 1 ? 's' : '') + ' from results');
            }
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // CLIENT WORKFLOW FUNCTIONS
        // ═══════════════════════════════════════════════════════════════════════════════

        // ═══════════════════════════════════════════════════════════════════════════════
        // SAVE SELECTED LISTINGS TO CLIENT PORTFOLIO
        // REBNY RLS compliance: I-29 Owner Opt-Out gate, I-28 address suppression,
        // localStorage scoped by LOGGED_IN_AGENT.id + clientId
        // ═══════════════════════════════════════════════════════════════════════════════

        // ═══════════════════════════════════════════════════════════════════════════════
        // CLIENT FEEDBACK: LIKE / DISLIKE ON LISTING CARDS
        // Agent marks on behalf of client. Stored per-agent-per-client in localStorage.
        // Like/dislike is agent-entered metadata (not RLS data) — no RESO tagging required.
        // ═══════════════════════════════════════════════════════════════════════════════
