        // ═══════════════════════════════════════════════════════════════════
        // RLS LISTING TRACKER — Shows total active listings + live match count
        // Fetches total counts from Trestle API on load.
        // Updates live match estimate as user changes search criteria.
        // ═══════════════════════════════════════════════════════════════════

        var _trackerCounts = { sale: 0, rental: 0, total: 0 };
        var _trackerMatchDebounce = null;

        // Fetch total listing counts from Trestle on page load
        function _initListingTracker() {
            if (typeof MallanAPI === 'undefined') return;
            MallanAPI.onReady(function() {
                // Active sale inventory — the same executor and the same default status as Search.
                MallanAPI.idx.search({ type: 'sale', limit: 1 }).then(function(result) {
                    var count = 0;
                    if (result && result.totalCount) {
                        count = result.totalCount;
                    } else if (result && result._meta && result._meta.odataCount) {
                        count = result._meta.odataCount;
                    } else {
                        count = (result && result.total) || 0;
                    }
                    _trackerCounts.sale = count;
                    var el = document.getElementById('trackerSaleCount');
                    if (el) el.textContent = count.toLocaleString();
                    _updateTrackerTotal();
                }).catch(function() {});

                // Active rental inventory — the same executor and the same default status as Search.
                MallanAPI.idx.search({ type: 'rental', limit: 1 }).then(function(result) {
                    var count = 0;
                    if (result && result.totalCount) {
                        count = result.totalCount;
                    } else if (result && result._meta && result._meta.odataCount) {
                        count = result._meta.odataCount;
                    } else {
                        count = (result && result.total) || 0;
                    }
                    _trackerCounts.rental = count;
                    var el = document.getElementById('trackerRentalCount');
                    if (el) el.textContent = count.toLocaleString();
                    _updateTrackerTotal();
                }).catch(function() {});

                // Fetch building count from local DB
                MallanAPI._fetch('/api/crm/buildings?count_only=true').then(function(result) {
                    var count = (result && result.count) || 0;
                    _trackerCounts.buildings = count;
                    var el = document.getElementById('trackerBuildingCount');
                    if (el) el.textContent = count.toLocaleString();
                }).catch(function() {});
            });
        }

        function _updateTrackerTotal() {
            _trackerCounts.total = _trackerCounts.sale + _trackerCounts.rental;
            var el = document.getElementById('trackerTotalCount');
            if (el) el.textContent = _trackerCounts.total.toLocaleString();
            var ts = document.getElementById('trackerUpdatedAt');
            if (ts) ts.textContent = 'Updated ' + new Date().toLocaleTimeString();
        }

        // Live match estimate — count via the same Trestle filter the Search
        // button will run. Previously counted locally over the ~126 demo
        // fixtures (filterListings(listings, criteria)) which produced badge
        // numbers like "~98 match" that were nowhere near the real Trestle
        // total of ~2,099 for Manhattan + 1 bed Active sales. The badge now
        // queries /api/idx/search with limit=1 and reads back trestle's
        // $count to display the authoritative total.
        //
        // Debounce raised to 1000ms (was 200ms) to stay under Trestle's
        // 180/min rate limit when an agent types rapidly.
        var _trackerMatchInflight = 0; // increments per query so out-of-order responses are dropped
        function updateTrackerMatchEstimate() {
            if (_trackerMatchDebounce) clearTimeout(_trackerMatchDebounce);
            _trackerMatchDebounce = setTimeout(function() {
                _computeMatchEstimate();
            }, 1000);
        }

        function _computeMatchEstimate() {
            if (typeof collectSearchCriteria !== 'function') return;
            if (typeof window.buildIdxSearchParams !== 'function') return;
            if (typeof MallanAPI === 'undefined' || !MallanAPI || !MallanAPI.idx) return;

            try {
                var criteria = collectSearchCriteria();
                var hasCriteria = criteria.address || criteria.priceMin || criteria.priceMax ||
                    criteria.bedsMin != null || criteria.bedsMax != null ||
                    criteria.bathsMin || criteria.bathsMax ||
                    criteria.sqftMin || criteria.sqftMax || criteria.rlsId || criteria.zip ||
                    (criteria.neighborhoods && criteria.neighborhoods.length > 0) ||
                    criteria.borough || criteria.propertySubType ||
                    (criteria.ownership && criteria.ownership.length > 0);

                var wrapper = document.getElementById('trackerMatchEstimate');
                var countEl = document.getElementById('trackerMatchCount');
                if (!wrapper || !countEl) return;

                if (!hasCriteria) {
                    wrapper.classList.add('hidden');
                    wrapper.classList.remove('flex');
                    return;
                }

                // Build same params the Search button will use, override limit
                // to 1 so we only consume one Trestle row to read $count back.
                var params = window.buildIdxSearchParams(criteria);
                params.limit = 1;
                if (!params.type) params.type = 'sale';

                wrapper.classList.remove('hidden');
                wrapper.classList.add('flex');
                countEl.textContent = '…';

                var myToken = ++_trackerMatchInflight;
                MallanAPI.idx.search(params).then(function(result) {
                    // Drop response if a newer query has been issued.
                    if (myToken !== _trackerMatchInflight) return;
                    var count = 0;
                    if (result && typeof result.totalCount === 'number') {
                        count = result.totalCount;
                    } else if (result && result._meta && typeof result._meta.odataCount === 'number') {
                        count = result._meta.odataCount;
                    } else if (result && typeof result.total === 'number') {
                        count = result.total;
                    } else if (result && result.listings) {
                        count = result.listings.length;
                    }
                    countEl.textContent = count.toLocaleString();
                }).catch(function() {
                    if (myToken !== _trackerMatchInflight) return;
                    // On error, hide rather than show stale count.
                    countEl.textContent = '?';
                });
            } catch(e) {
                // Silently ignore — criteria collection can fail if form not ready
            }
        }

        // Attach listeners to all search form inputs for live match updates
        function _attachTrackerListeners() {
            var formContainer = document.getElementById('searchFormContainer');
            if (!formContainer) return;

            // Listen for input/change on all form elements
            formContainer.addEventListener('input', function(e) {
                var tag = e.target.tagName;
                if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
                    updateTrackerMatchEstimate();
                }
            });
            formContainer.addEventListener('change', function(e) {
                var tag = e.target.tagName;
                if (tag === 'INPUT' || tag === 'SELECT') {
                    updateTrackerMatchEstimate();
                }
            });
        }

        // Initialize on DOM ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                _initListingTracker();
                _attachTrackerListeners();
            });
        } else {
            _initListingTracker();
            _attachTrackerListeners();
        }

        // Also update tracker when data loads
        window.addEventListener('mallan:data:ready', function(e) {
            var detail = e.detail || {};
            // Update tracker with loaded count if we haven't fetched totals yet
            if (_trackerCounts.total === 0 && detail.count > 0) {
                var el = document.getElementById('trackerTotalCount');
                if (el) el.textContent = detail.count.toLocaleString() + '+';
            }
        });
