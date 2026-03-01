        // ═══════════════════════════════════════════════════════════════════════════════
        // SAVED SEARCH FUNCTIONS
        // ═══════════════════════════════════════════════════════════════════════════════

        function toggleSavedSearchDropdown() {
            document.getElementById('savedSearchDropdown').classList.toggle('hidden');
        }

        function populateSavedSearchList() {
            var container = document.getElementById('savedSearchList');
            if (!container) return;

            if (searchResultsState.savedSearches.length === 0) {
                container.innerHTML = '<p class="p-3 text-sm text-gray-500 text-center">No saved searches yet</p>';
                return;
            }

            container.innerHTML = searchResultsState.savedSearches.map(search => `
                <div class="flex items-center justify-between px-3 py-2 hover:bg-gray-100">
                    <button onclick="loadSavedSearch('${search.id}')" class="text-left flex-1">
                        <div class="font-medium text-sm">${search.name}</div>
                        <div class="text-xs text-gray-500">${search.date}</div>
                    </button>
                    <button onclick="deleteSavedSearch('${search.id}')" class="p-1 text-red-500 hover:bg-red-100 rounded" aria-label="Delete">
                        <i class="fas fa-trash text-xs"></i>
                    </button>
                </div>
            `).join('');
        }

        function openSaveSearchModal() {
            document.getElementById('savedSearchDropdown').classList.add('hidden');
            document.getElementById('saveSearchModal').classList.remove('hidden');
        }

        function closeSaveSearchModal() {
            document.getElementById('saveSearchModal').classList.add('hidden');
        }

        function saveCurrentSearch() {
            var name = document.getElementById('savedSearchName').value;
            var notes = document.getElementById('savedSearchNotes').value;

            if (!name) {
                showToast('Please enter a search name.', 'warning');
                return;
            }

            var newSearch = {
                id: 's' + Date.now(),
                name,
                notes,
                date: new Date().toLocaleDateString(),
                viewMode: searchResultsState.viewMode,
                visibleColumns: searchResultsState.visibleColumns,
                sortField: searchResultsState.sortField,
                sortOrder: searchResultsState.sortOrder
            };

            searchResultsState.savedSearches.push(newSearch);
            localStorage.setItem('savedSearches_' + LOGGED_IN_AGENT.id, JSON.stringify(searchResultsState.savedSearches));

            document.getElementById('savedSearchName').value = '';
            document.getElementById('savedSearchNotes').value = '';
            closeSaveSearchModal();
            populateSavedSearchList();
            showToast('Search "' + name + '" saved successfully!', 'success');
        }

        function loadSavedSearch(searchId) {
            var search = searchResultsState.savedSearches.find(s => s.id === searchId);
            if (search) {
                searchResultsState.viewMode = search.viewMode;
                searchResultsState.visibleColumns = search.visibleColumns;
                setViewMode(search.viewMode);
                showToast('Loaded search: ' + search.name, 'success');
            }
            document.getElementById('savedSearchDropdown').classList.add('hidden');
        }

        function deleteSavedSearch(searchId) {
            if (confirm('Delete this saved search?')) {
                searchResultsState.savedSearches = searchResultsState.savedSearches.filter(s => s.id !== searchId);
                localStorage.setItem('savedSearches_' + LOGGED_IN_AGENT.id, JSON.stringify(searchResultsState.savedSearches));
                populateSavedSearchList();
            }
        }

        function reviseSearch() {
            backToSearch();
        }

