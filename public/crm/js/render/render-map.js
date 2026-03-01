// ═══════════════════════════════════════════════════════
// RENDER MAP — MapLibre GL JS + OpenFreeMap Liberty vector tiles
// Dependencies: maplibre-gl.js (loaded via CDN in <head>)
// ═══════════════════════════════════════════════════════

// ── State ──
var _gmap = null;              // maplibregl.Map instance
var _gmapMarkers = [];         // array of { marker, listing }
var _gmapReady = false;        // true once MapLibre map is initialized
var _gmapSelectedId = null;    // currently selected listing ID

// ── Helpers ──

function getMarkerColor(listing) {
    if (listing.status === 'COMING_SOON') return { bg: '#f59e0b', cls: 'coming-soon' };
    if (listing.transactionType === 'rental' || listing.transactionType === 'Rental') return { bg: '#22c55e', cls: 'rental' };
    return { bg: '#3b82f6', cls: 'sale' };
}

function formatMapPrice(price) {
    if (!price) return '$--';
    if (price >= 1000000) return '$' + (price / 1000000).toFixed(price % 1000000 === 0 ? 0 : 1) + 'M';
    if (price >= 1000) return '$' + Math.round(price / 1000) + 'K';
    return '$' + price.toLocaleString();
}

function buildPopupHTML(listing) {
    var color = getMarkerColor(listing);
    var addr = listing.addressDisplayYN === false ? 'Address Available Upon Request' : (listing.address + (listing.unit ? ', ' + listing.unit : ''));
    var statusLabel = listing.status === 'COMING_SOON' ? 'COMING SOON' : listing.status;
    var photoHTML = '<div class="map-popup-photo-placeholder" style="background:' + color.bg + '20"><i class="fas fa-camera" style="color:' + color.bg + '"></i></div>';

    var perm = listing.permissions || {};
    var nsBadge = (perm.syndication === false || listing.syndicateYN === false) ? '<span style="display:inline-block;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;background:#fff7ed;color:#c2410c;margin-left:3px" data-compliance="syndication-gate" title="Not distributed to third-party portals">NS</span>' : '';
    var csBadge = (listing.status === 'COMING_SOON') ? '<div style="font-size:9px;color:#7c3aed;font-weight:600;margin-top:3px;padding:2px 4px;background:#faf5ff;border-radius:3px" data-compliance="coming-soon-showing-block"><i class="fas fa-ban" style="margin-right:2px"></i>No Showings Until ' + (listing.comingSoonDate || 'active date') + '</div>' : '';

    return '<div class="map-popup-card">' +
        photoHTML +
        '<div class="map-popup-body">' +
            '<div class="map-popup-price">$' + (listing.price ? listing.price.toLocaleString() : '--') + '</div>' +
            '<div class="map-popup-address">' + addr + '</div>' +
            '<div class="map-popup-details">' +
                '<span>' + (listing.beds || '--') + ' Beds</span>' +
                '<span>' + (listing.baths || '--') + ' Baths</span>' +
                '<span>' + (listing.intSqft || '--') + ' SqFt</span>' +
                '<span style="padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;background:' + color.bg + '20;color:' + color.bg + '">' + statusLabel + '</span>' +
                nsBadge +
            '</div>' +
            csBadge +
            '<div class="map-popup-attr" data-rebny-attribution>Courtesy of ' + (listing.company || 'Listing Broker') + '</div>' +
        '</div>' +
    '</div>';
}

// ═══════════════════════════════════════════════════════
// Core map functions — MapLibre GL JS
// ═══════════════════════════════════════════════════════

function initGoogleMap() {
    if (_gmap) return _gmap;
    if (typeof maplibregl === 'undefined') {
        console.warn('MapLibre GL JS not loaded yet');
        return null;
    }

    var el = document.getElementById('googleMap');
    if (!el) return null;

    _gmap = new maplibregl.Map({
        container: el,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [-73.9855, 40.7580],
        zoom: 13,
        attributionControl: true
    });

    _gmap.addControl(new maplibregl.NavigationControl(), 'top-right');

    _gmapReady = true;
    return _gmap;
}

function clearMapMarkers() {
    _gmapMarkers.forEach(function(m) {
        m.marker.remove();
    });
    _gmapMarkers = [];
}

function renderMapPins() {
    if (!_gmap) return;
    clearMapMarkers();

    var listings = getFilteredListings();
    if (!listings || listings.length === 0) return;

    var bounds = new maplibregl.LngLatBounds();
    var hasValidCoords = false;

    listings.forEach(function(listing) {
        var lat = listing.latitude || (listing.location && listing.location.lat);
        var lng = listing.longitude || (listing.location && listing.location.lng);
        if (!lat || !lng) return;

        hasValidCoords = true;
        bounds.extend([lng, lat]);

        var color = getMarkerColor(listing);
        var priceLabel = formatMapPrice(listing.price);

        // Create DOM element for price pin
        var pinEl = document.createElement('div');
        pinEl.className = 'maplibre-price-pin';
        pinEl.innerHTML = '<div class="map-pin-price ' + color.cls + '" data-listing-id="' + listing.id + '">' + priceLabel + '</div>';

        // Create popup
        var popup = new maplibregl.Popup({ offset: 25, maxWidth: '320px', closeButton: true })
            .setHTML(buildPopupHTML(listing));

        // Create marker
        var marker = new maplibregl.Marker({ element: pinEl, anchor: 'bottom' })
            .setLngLat([lng, lat])
            .setPopup(popup)
            .addTo(_gmap);

        // Click handler
        pinEl.addEventListener('click', function() {
            _gmapSelectedId = listing.id;

            // Highlight in list
            document.querySelectorAll('.map-list-item').forEach(function(el) {
                el.classList.remove('map-selected');
            });
            var listItem = document.querySelector('.map-list-item[data-listing-id="' + listing.id + '"]');
            if (listItem) {
                listItem.classList.add('map-selected');
                listItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }

            // Highlight pin
            document.querySelectorAll('.map-pin-price').forEach(function(p) { p.classList.remove('active'); });
            var pin = pinEl.querySelector('.map-pin-price');
            if (pin) pin.classList.add('active');
        });

        // Hover handlers
        pinEl.addEventListener('mouseenter', function() {
            var listItem = document.querySelector('.map-list-item[data-listing-id="' + listing.id + '"]');
            if (listItem) listItem.classList.add('map-hover');
        });
        pinEl.addEventListener('mouseleave', function() {
            var listItem = document.querySelector('.map-list-item[data-listing-id="' + listing.id + '"]');
            if (listItem) listItem.classList.remove('map-hover');
        });

        _gmapMarkers.push({ marker: marker, listing: listing });
    });

    if (hasValidCoords) {
        _gmap.fitBounds(bounds, { padding: 50, maxZoom: 16 });
    }
}

function mapCenterOnNeighborhood(name) {
    if (!_gmap) return;
    var resolved = (typeof resolveNeighborhoodName === 'function') ? resolveNeighborhoodName(name) : name;
    var coords = NEIGHBORHOOD_CENTERS[resolved] || NEIGHBORHOOD_CENTERS[name];
    if (!coords) return;

    // NEIGHBORHOOD_CENTERS stores [lat, lng], MapLibre needs [lng, lat]
    _gmap.flyTo({ center: [coords[1], coords[0]], zoom: 15 });

    // Show neighborhood label
    var labelEl = document.getElementById('mapNeighborhoodLabel');
    var nameEl = document.getElementById('mapNeighborhoodName');
    if (labelEl && nameEl) {
        nameEl.textContent = name;
        labelEl.style.display = 'block';
        clearTimeout(window._nbLabelTimer);
        window._nbLabelTimer = setTimeout(function() {
            labelEl.style.display = 'none';
        }, 4000);
    }
}

function mapHighlightPin(listingId, highlight) {
    _gmapMarkers.forEach(function(m) {
        var el = m.marker.getElement();
        if (!el) return;
        var pin = el.querySelector('.map-pin-price');
        if (!pin) return;
        if (m.listing.id == listingId) {
            if (highlight) {
                pin.classList.add('active');
            } else {
                pin.classList.remove('active');
            }
        }
    });
}

// ═══════════════════════════════════════════════════════
// renderMapView — called by render-dispatcher.js
// ═══════════════════════════════════════════════════════

function renderMapView() {
    var listPanel = document.getElementById('mapListPanel');
    var listings = getFilteredListings();

    // Build list panel
    listPanel.innerHTML = listings.map(function(listing) {
        var color = getMarkerColor(listing);
        var addr = listing.addressDisplayYN === false ? 'Address Available Upon Request' : (listing.address + (listing.unit ? ', ' + listing.unit : ''));
        return '<div class="map-list-item p-3 border-b hover:bg-gray-50 cursor-pointer flex gap-3 ' +
            (searchResultsState.selectedListings.includes(listing.id) ? 'bg-blue-50' : '') +
            '" data-source="REBNY-RLS" data-listing-id="' + listing.id + '">' +
            '<div class="flex items-start">' +
                '<input type="checkbox" class="w-4 h-4 mt-1" ' + (searchResultsState.selectedListings.includes(listing.id) ? 'checked' : '') + ' onclick="event.stopPropagation(); toggleListingSelection(' + listing.id + ')">' +
            '</div>' +
            '<div class="w-20 h-14 rounded-lg flex-shrink-0 relative overflow-hidden flex items-center justify-center" style="background:' + getListingColor(listing.id).bg + '">' +
                '<i class="fas fa-camera" style="font-size:12px;color:' + getListingColor(listing.id).icon + '"></i>' +
                '<span class="absolute bottom-0.5 right-0.5 text-[7px]" style="color:' + getListingColor(listing.id).icon + '"><i class="fas fa-camera"></i> ' + (listing.photoCount || 0) + '</span>' +
                '<div class="absolute top-0.5 left-0.5 w-2.5 h-2.5 rounded-full" style="background:' + color.bg + '"></div>' +
            '</div>' +
            '<div class="flex-1 min-w-0">' +
                '<h4 class="font-semibold text-xs truncate">' + addr + '</h4>' +
                '<div class="flex items-center gap-1.5 text-[10px] text-gray-500 mt-0.5">' +
                    '<span class="px-1 py-0.5 ' + getStatusBadgeClasses(listing.status) + ' rounded font-semibold text-[9px]">' + (listing.status === 'COMING_SOON' ? 'COMING SOON' : listing.status) + '</span>' +
                    comingSoonBadgeCompact(listing) +
                    participantOnlyBadge(listing) +
                    '<span class="font-bold text-gray-900 text-xs">$' + listing.price.toLocaleString() + '</span>' +
                '</div>' +
                '<div class="flex items-center gap-2 text-[10px] mt-0.5">' +
                    '<span><strong>' + listing.beds + '</strong> Bd</span>' +
                    '<span><strong>' + listing.baths + '</strong> Ba</span>' +
                    '<span><strong>' + (listing.intSqft || '--') + '</strong> SF</span>' +
                '</div>' +
                fareActDisclosure(listing) +
                '<div class="text-[7px] text-gray-300 mt-0.5 truncate" data-rebny-attribution>' + (listing.company || '') + '</div>' +
            '</div>' +
        '</div>';
    }).join('');

    // Attach list-item click/hover events
    listPanel.querySelectorAll('.map-list-item').forEach(function(item) {
        var lid = item.getAttribute('data-listing-id');

        item.addEventListener('click', function(e) {
            if (e.target.type === 'checkbox') return;
            _gmapSelectedId = lid;
            document.querySelectorAll('.map-list-item').forEach(function(el) { el.classList.remove('map-selected'); });
            item.classList.add('map-selected');

            // Center map on this listing and open popup
            var markerObj = _gmapMarkers.find(function(m) { return String(m.listing.id) === String(lid); });
            if (markerObj && _gmap) {
                var lat = markerObj.listing.latitude || (markerObj.listing.location && markerObj.listing.location.lat);
                var lng = markerObj.listing.longitude || (markerObj.listing.location && markerObj.listing.location.lng);
                if (lat && lng) {
                    _gmap.flyTo({ center: [lng, lat], zoom: _gmap.getZoom() });
                    markerObj.marker.togglePopup();
                }
                // Highlight pin
                document.querySelectorAll('.map-pin-price').forEach(function(p) { p.classList.remove('active'); });
                var el = markerObj.marker.getElement();
                if (el) {
                    var pin = el.querySelector('.map-pin-price');
                    if (pin) pin.classList.add('active');
                }
            }
        });

        item.addEventListener('mouseenter', function() { mapHighlightPin(lid, true); });
        item.addEventListener('mouseleave', function() { mapHighlightPin(lid, false); });
    });

    // Initialize or update map
    if (!_gmap) {
        if (typeof maplibregl !== 'undefined') {
            initGoogleMap();
            _gmap.on('load', function() {
                renderMapPins();
            });
        } else {
            // MapLibre not loaded yet — show loading state
            var mapEl = document.getElementById('googleMap');
            if (mapEl) {
                mapEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:12px;color:#9ca3af;">' +
                    '<i class="fas fa-spinner fa-spin text-3xl"></i>' +
                    '<p style="font-size:13px;font-weight:500;">Loading map...</p>' +
                '</div>';
            }
            var _mapRetryCount = 0;
            var checkInterval = setInterval(function() {
                _mapRetryCount++;
                if (typeof maplibregl !== 'undefined') {
                    clearInterval(checkInterval);
                    var mapEl2 = document.getElementById('googleMap');
                    if (mapEl2) mapEl2.innerHTML = '';
                    initGoogleMap();
                    _gmap.on('load', function() {
                        renderMapPins();
                    });
                } else if (_mapRetryCount > 16) {
                    clearInterval(checkInterval);
                    var mapEl3 = document.getElementById('googleMap');
                    if (mapEl3) {
                        mapEl3.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:16px;padding:40px;text-align:center;">' +
                            '<i class="fas fa-map-marked-alt text-5xl text-gray-300"></i>' +
                            '<div>' +
                                '<p style="font-size:15px;font-weight:600;color:#374151;margin-bottom:6px;">Map could not load</p>' +
                                '<p style="font-size:12px;color:#6b7280;line-height:1.6;">MapLibre GL JS failed to load. Check your network connection.</p>' +
                            '</div>' +
                        '</div>';
                    }
                }
            }, 500);
        }
    } else {
        renderMapPins();
        _gmap.resize();
    }
}
