        // ═══════════════════════════════════════════════════════════════════
        // LAZY PHOTO LOADER — Fetches listing photos from Trestle Media
        //
        // Trestle's $expand=Media fails for bulk queries (>50 listings).
        // This module batch-fetches primary photos for visible listing cards
        // using the /api/media/batch endpoint and IntersectionObserver.
        // ═══════════════════════════════════════════════════════════════════

        var _photoCache = {};       // listingId → photoUrl (or null)
        var _photoPending = {};     // listingId → true (in-flight)
        var _photoBatchQueue = [];  // listing IDs waiting to be fetched
        var _photoBatchTimer = null;
        var _photoObserver = null;

        // Batch size and debounce
        var PHOTO_BATCH_SIZE = 50;
        var PHOTO_BATCH_DELAY = 100; // ms — wait for more cards to scroll into view

        /**
         * Queue a listing for photo loading.
         * Called when a card becomes visible via IntersectionObserver.
         */
        function queuePhotoLoad(listingId) {
            if (!listingId) return;
            var lid = String(listingId);
            if (_photoCache[lid] !== undefined || _photoPending[lid]) return;
            _photoPending[lid] = true;
            _photoBatchQueue.push(lid);
            _scheduleBatchFetch();
        }

        function _scheduleBatchFetch() {
            if (_photoBatchTimer) clearTimeout(_photoBatchTimer);
            _photoBatchTimer = setTimeout(function() {
                _fetchPhotoBatch();
            }, PHOTO_BATCH_DELAY);
        }

        function _fetchPhotoBatch() {
            if (_photoBatchQueue.length === 0) return;

            // Take up to BATCH_SIZE
            var batch = _photoBatchQueue.splice(0, PHOTO_BATCH_SIZE);

            // If more remain, schedule next batch
            if (_photoBatchQueue.length > 0) _scheduleBatchFetch();

            var idsParam = batch.join(',');
            if (typeof MallanAPI === 'undefined') return;

            fetch('/api/media/batch?ids=' + encodeURIComponent(idsParam), {
                credentials: 'same-origin'
            }).then(function(res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            }).then(function(data) {
                var photos = data.photos || {};
                batch.forEach(function(lid) {
                    _photoCache[lid] = photos[lid] || null;
                    delete _photoPending[lid];
                    _applyPhotoToCards(lid, photos[lid]);
                });
            }).catch(function(err) {
                console.warn('[PhotoLoader] Batch fetch failed:', err.message);
                batch.forEach(function(lid) {
                    _photoCache[lid] = null;
                    delete _photoPending[lid];
                });
            });
        }

        /**
         * Apply a loaded photo URL to all cards displaying this listing.
         */
        function _applyPhotoToCards(listingId, photoUrl) {
            if (!photoUrl) return;
            // Find all img elements inside cards for this listing
            var cards = document.querySelectorAll('[data-listing-lid="' + listingId + '"] .cm-photo, [data-listing-lid="' + listingId + '"] .cm-photo-wrap img');
            cards.forEach(function(img) {
                if (img.tagName === 'IMG' && img.src && img.src.indexOf('data:image/svg') !== -1) {
                    img.src = photoUrl;
                    img.style.display = '';
                }
            });
            // Also try by data-photo-lid attribute (set by renderers)
            var imgs = document.querySelectorAll('img[data-photo-lid="' + listingId + '"]');
            imgs.forEach(function(img) {
                if (img.src && img.src.indexOf('data:image/svg') !== -1) {
                    img.src = photoUrl;
                    img.style.display = '';
                }
            });
        }

        /**
         * Initialize the IntersectionObserver for lazy photo loading.
         * Call after rendering search results.
         */
        function initPhotoObserver() {
            // Clean up old observer
            if (_photoObserver) _photoObserver.disconnect();

            if (!('IntersectionObserver' in window)) {
                // Fallback: load all visible photos immediately
                _loadAllVisiblePhotos();
                return;
            }

            _photoObserver = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    if (entry.isIntersecting) {
                        var card = entry.target;
                        var lid = card.getAttribute('data-listing-lid');
                        if (lid) queuePhotoLoad(lid);
                        _photoObserver.unobserve(card);
                    }
                });
            }, {
                rootMargin: '200px 0px', // Start loading 200px before card is visible
                threshold: 0
            });

            // Observe all listing cards with an LID
            var cards = document.querySelectorAll('[data-listing-lid]');
            cards.forEach(function(card) {
                var lid = card.getAttribute('data-listing-lid');
                // Only observe if this listing doesn't already have a real photo
                if (lid && !_photoCache[lid]) {
                    _photoObserver.observe(card);
                }
            });
        }

        function _loadAllVisiblePhotos() {
            var cards = document.querySelectorAll('[data-listing-lid]');
            cards.forEach(function(card) {
                var lid = card.getAttribute('data-listing-lid');
                if (lid) queuePhotoLoad(lid);
            });
        }

        /**
         * Get cached photo URL for a listing (returns url, null, or undefined if not fetched yet).
         */
        function getCachedPhoto(listingId) {
            return _photoCache[String(listingId)];
        }
