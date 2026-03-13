        // ── Listing flags (per-agent, persisted to localStorage) ──
        var _listingFlagsKey = 'listingFlags_' + LOGGED_IN_AGENT.id;
        var listingFlags = JSON.parse(localStorage.getItem(_listingFlagsKey)) || {};
        // listingFlags = { "listingId": { picked: true, liked: false, ... }, ... }

        function setListingFlag(listingId, flag, value) {
            if (!listingFlags[listingId]) listingFlags[listingId] = {};
            listingFlags[listingId][flag] = value;
            localStorage.setItem(_listingFlagsKey, JSON.stringify(listingFlags));
        }

        function getListingFlag(listingId, flag) {
            return listingFlags[listingId] && listingFlags[listingId][flag];
        }

        // Toolbar button toggle: if listings selected → mark them; otherwise → toggle filter
        function togglePickedFilter() {
            _handleFlagToggle('picked');
        }

        function toggleLikedFilter() {
            _handleFlagToggle('liked');
        }

        function toggleDislikedFilter() {
            _handleFlagToggle('disliked');
        }

        function toggleShownFilter() {
            _handleFlagToggle('shown');
        }

        function toggleEmailedFilter() {
            _handleFlagToggle('emailed');
        }

        function _handleFlagToggle(flag) {
            var selected = searchResultsState.selectedListings;
            if (selected.length > 0) {
                // Mark selected listings with this flag
                var alreadyFlagged = selected.every(function(id) { return getListingFlag(id, flag); });
                selected.forEach(function(id) { setListingFlag(id, flag, !alreadyFlagged); });
                var action = alreadyFlagged ? 'Removed' : 'Marked';
                var label = flag.charAt(0).toUpperCase() + flag.slice(1);
                showFlagToast(action + ' ' + selected.length + ' listing' + (selected.length !== 1 ? 's' : '') + ' as ' + label);
            } else {
                // No selection → toggle filter view
                filterState.statusFilters[flag] = !filterState.statusFilters[flag];
                var isActive = filterState.statusFilters[flag];
                if (isActive) {
                    var count = (searchResultsState.filteredListings || listings).filter(function(l) { return getListingFlag(l.id, flag); }).length;
                    if (count === 0) {
                        showFlagToast('No listings flagged as "' + flag + '" yet. Select listings first, then click to flag them.');
                        filterState.statusFilters[flag] = false;
                    }
                }
            }
            highlightToolbarButton(flag, filterState.statusFilters[flag]);
            renderSearchResults();
        }

        function showFlagToast(msg) {
            var toast = document.getElementById('flagToast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'flagToast';
                toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.3);transition:opacity .3s;';
                document.body.appendChild(toast);
            }
            toast.textContent = msg;
            toast.style.opacity = '1';
            toast.style.display = 'block';
            clearTimeout(toast._timer);
            toast._timer = setTimeout(function() { toast.style.opacity = '0'; setTimeout(function() { toast.style.display = 'none'; }, 300); }, 3000);
        }

        function highlightToolbarButton(filterName, isActive) {
            var btn = document.getElementById('filterBtn_' + filterName);
            if (!btn) return;
            if (isActive) {
                btn.style.background = '#e0e7ff';
                btn.style.boxShadow = 'inset 0 0 0 2px #6366f1';
                btn.style.borderRadius = '6px';
            } else {
                btn.style.background = '';
                btn.style.boxShadow = '';
                btn.style.borderRadius = '';
            }
        }

