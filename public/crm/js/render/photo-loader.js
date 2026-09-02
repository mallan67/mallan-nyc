        // ═══════════════════════════════════════════════════════════════════
        // LAZY PHOTO LOADER — Fetches listing photos from Trestle Media
        //
        // Trestle's $expand=Media fails for bulk queries (>50 listings).
        // This module batch-fetches primary photos for visible listing cards
        // using the /api/media/batch endpoint and IntersectionObserver.
        // ═══════════════════════════════════════════════════════════════════

        var _photoCache = {};       // listingId → photoUrl (or null)
        var _mediaCache = {};       // listingId → [{ url, mediaType, order }]
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

            // ASK IN THE DOMAIN THE CARD CARRIES.
            //
            // These are Cotality ListingKeys, and the provider matches them on
            // Media.ResourceRecordKey. Sending them as `ids` would have them
            // matched against ResourceRecordID, whose value space does not
            // overlap - probed live 2026-09-01: cross-domain returns count 0,
            // an empty HTTP 200 that looks exactly like "no photos".
            fetch('/api/media/batch?keys=' + encodeURIComponent(idsParam), {
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
            var cards = document.querySelectorAll('[data-listing-key="' + listingId + '"] .cm-photo, [data-listing-key="' + listingId + '"] .cm-photo-wrap img');
            cards.forEach(function(img) {
                if (img.tagName === 'IMG') {
                    // Replace if: showing SVG placeholder, hidden from onerror, or empty src
                    var isSvg = img.src && img.src.indexOf('data:image/svg') !== -1;
                    var isHidden = img.style.display === 'none';
                    var isEmpty = !img.src || img.src === '' || img.src === window.location.href;
                    if (isSvg || isHidden || isEmpty) {
                        img.src = photoUrl;
                        img.style.display = '';
                    }
                }
            });
            // Also try by data-photo-lid attribute (set by renderers)
            // SAME DOMAIN AS THE REQUEST. This selected on data-photo-lid,
            // which holds the ListingId, using a listingId that is now a
            // ListingKey - so it matched nothing and the fetched photo was
            // never applied to these images. The identity moved; the selector
            // had not.
            var imgs = document.querySelectorAll('img[data-photo-key="' + listingId + '"]');
            imgs.forEach(function(img) {
                var isSvg = img.src && img.src.indexOf('data:image/svg') !== -1;
                var isHidden = img.style.display === 'none';
                var isEmpty = !img.src || img.src === '' || img.src === window.location.href;
                if (isSvg || isHidden || isEmpty) {
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
                        var lid = card.getAttribute('data-listing-key');
                        if (lid) queuePhotoLoad(lid);
                        _photoObserver.unobserve(card);
                    }
                });
            }, {
                rootMargin: '200px 0px', // Start loading 200px before card is visible
                threshold: 0
            });

            // Observe all listing cards with an LID
            var cards = document.querySelectorAll('[data-listing-key]');
            cards.forEach(function(card) {
                var lid = card.getAttribute('data-listing-key');
                // Only observe if this listing doesn't already have a real photo
                if (lid && !_photoCache[lid]) {
                    _photoObserver.observe(card);
                }
            });
        }

        function _loadAllVisiblePhotos() {
            var cards = document.querySelectorAll('[data-listing-key]');
            cards.forEach(function(card) {
                var lid = card.getAttribute('data-listing-key');
                if (lid) queuePhotoLoad(lid);
            });
        }

        /**
         * Get cached photo URL for a listing (returns url, null, or undefined if not fetched yet).
         */
        function getCachedPhoto(listingId) {
            return _photoCache[String(listingId)];
        }

        /**
         * Get cached media array for a listing (returns array of { url, mediaType, order }).
         */
        function getCachedMedia(listingId) {
            return _mediaCache[String(listingId)] || [];
        }

        /**
         * Fetch full media (all types) for a single listing on demand.
         * Called when the detail panel opens. Uses ?detail=true mode.
         * Returns a Promise that resolves when media is applied.
         */
        function fetchDetailMedia(listingId, callback) {
            var lid = String(listingId);

            // Already cached
            if (_mediaCache[lid] && _mediaCache[lid].length > 0) {
                _applyMediaToListing(lid, _mediaCache[lid]);
                if (callback) callback();
                return;
            }

            // THE DETAIL PATH ASKS IN THE SAME DOMAIN AS THE CARD.
            //
            // This sent `ids=<ListingId>` while the card beside it sent
            // `keys=<ListingKey>`. The provider answers both, but the route
            // grouped the reply by ResourceRecordKey regardless of what was
            // asked, then looked it up by the RLS id - so a provider-only
            // listing showed its thumbnail and then opened an EMPTY gallery.
            // One listing, one provider, two answers.
            fetch('/api/media/batch?keys=' + encodeURIComponent(lid) + '&detail=true', {
                credentials: 'same-origin'
            }).then(function(res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            }).then(function(data) {
                var media = (data.media && data.media[lid]) || [];
                var photo = (data.photos && data.photos[lid]) || null;
                _mediaCache[lid] = media;
                if (photo) _photoCache[lid] = photo;
                _applyMediaToListing(lid, media);
                if (callback) callback();
            }).catch(function(err) {
                console.warn('[PhotoLoader] Detail media fetch failed:', err.message);
                if (callback) callback();
            });
        }

        /**
         * Apply fetched media to the listing object in listings for detail panel use.
         */
        function _applyMediaToListing(listingId, mediaItems) {
            if (!mediaItems || !mediaItems.length) return;
            if (typeof listings === 'undefined') return;
            var listing = listings.find(function(l) { return l.lid === listingId || String(l._listingKey) === listingId; });
            if (!listing) return;

            // Build typed arrays
            // Trestle Media has 2 categories: Photo and FloorPlan.
            // Videos/VirtualTours/3D come from Property fields (VirtualTourURLUnbranded), not Media.
            var photos = [];
            var floorPlans = [];
            mediaItems.forEach(function(m) {
                var entry = { url: m.url, caption: '', order: m.order || 0, mediaType: m.mediaType };
                if (m.mediaType === 'FloorPlan') floorPlans.push(entry);
                else photos.push(entry);
            });

            // Update listing.images with photos only
            if (photos.length > 0) {
                listing.images = photos.sort(function(a, b) { return a.order - b.order; });
                // Only upgrade photoCount, never downgrade (Trestle's PhotosCount is authoritative)
                if (photos.length > (listing.photoCount || 0)) {
                    listing.photoCount = photos.length;
                }
            }
            // Store floor plans separately for detail panel
            if (floorPlans.length > 0) listing._floorPlans = floorPlans;
            // Note: Videos/VirtualTours/3D are on listing.virtualTourUrl (from Property.VirtualTourURLUnbranded)
        }
