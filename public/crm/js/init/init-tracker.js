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
                // Fetch sale count — use totalCount (@odata.count) for real total
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

                // Fetch rental count
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
            });
        }

        function _updateTrackerTotal() {
            _trackerCounts.total = _trackerCounts.sale + _trackerCounts.rental;
            var el = document.getElementById('trackerTotalCount');
            if (el) el.textContent = _trackerCounts.total.toLocaleString();
            var ts = document.getElementById('trackerUpdatedAt');
            if (ts) ts.textContent = 'Updated ' + new Date().toLocaleTimeString();
        }

        // Live match estimate — count locally loaded listings matching current criteria
        function updateTrackerMatchEstimate() {
            if (_trackerMatchDebounce) clearTimeout(_trackerMatchDebounce);
            _trackerMatchDebounce = setTimeout(function() {
                _computeMatchEstimate();
            }, 200);
        }

        function _computeMatchEstimate() {
            if (typeof listings === 'undefined' || !listings || listings.length === 0) return;
            if (typeof collectSearchCriteria !== 'function') return;
            if (typeof filterListings !== 'function') return;

            try {
                var criteria = collectSearchCriteria();
                // Check if any criteria is actually set (beyond defaults)
                var hasCriteria = criteria.address || criteria.priceMin || criteria.priceMax ||
                    criteria.bedsMin || criteria.bedsMax || criteria.bathsMin || criteria.bathsMax ||
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

                var matched = filterListings(listings, criteria);
                countEl.textContent = matched.length.toLocaleString();
                wrapper.classList.remove('hidden');
                wrapper.classList.add('flex');
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
