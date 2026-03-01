// ═══════════════════════════════════════════════════════
// RENDER MAP — Google Maps split-view with price pins
// Dependencies: Google Maps JS API (loaded async in <head>)
// ═══════════════════════════════════════════════════════

// ── State ──
var _gmap = null;           // google.maps.Map instance
var _gmapMarkers = [];      // array of { overlay, listing, infoWindow }
var _gmapInfoWindow = null;  // shared InfoWindow
var _gmapReady = false;      // true once google.maps is available
var _gmapSelectedId = null;  // currently selected listing ID

// ── Neighborhood center coordinates ──
var NEIGHBORHOOD_CENTERS = {
    // Manhattan
    'Battery Park City': [40.7117, -73.9999], 'Carnegie Hill': [40.7842, -73.9554],
    'Central Harlem': [40.8094, -73.9500], 'Central Park South': [40.7661, -73.9773],
    'Chelsea': [40.7465, -73.9978], 'Chinatown': [40.7158, -73.9970],
    'Civic Center': [40.7134, -74.0025], 'Clinton': [40.7638, -73.9918],
    "Hell's Kitchen": [40.7638, -73.9918], 'East Harlem': [40.7957, -73.9425],
    'East Village': [40.7265, -73.9815], 'Financial District': [40.7075, -74.0089],
    'FiDi': [40.7075, -74.0089], 'Flatiron': [40.7401, -73.9903],
    'Gramercy': [40.7368, -73.9845], 'Gramercy Park': [40.7368, -73.9845],
    'Greenwich Village': [40.7336, -74.0027], 'Hamilton Heights': [40.8252, -73.9490],
    'Inwood': [40.8677, -73.9212], 'Kips Bay': [40.7422, -73.9801],
    'Lenox Hill': [40.7668, -73.9604], 'Lincoln Square': [40.7741, -73.9845],
    'Little Italy': [40.7191, -73.9973], 'Lower East Side': [40.7150, -73.9843],
    'LES': [40.7150, -73.9843], 'Manhattan Valley': [40.7976, -73.9614],
    'Marble Hill': [40.8766, -73.9106], 'Midtown': [40.7549, -73.9840],
    'Midtown East': [40.7549, -73.9711], 'Midtown South': [40.7488, -73.9857],
    'Midtown West': [40.7601, -73.9893], 'Morningside Heights': [40.8100, -73.9614],
    'Murray Hill': [40.7488, -73.9763], 'NoHo': [40.7264, -73.9927],
    'NoMad': [40.7441, -73.9877], 'Roosevelt Island': [40.7619, -73.9510],
    'SoHo': [40.7233, -73.9985], 'Sutton Place': [40.7575, -73.9612],
    'Times Square': [40.7580, -73.9855], 'Tribeca': [40.7163, -74.0086],
    'TriBeCa': [40.7163, -74.0086], 'Upper East Side': [40.7736, -73.9566],
    'UES': [40.7736, -73.9566], 'Upper West Side': [40.7870, -73.9754],
    'UWS': [40.7870, -73.9754], 'Washington Heights': [40.8417, -73.9393],
    'West Harlem': [40.8178, -73.9554], 'West Village': [40.7336, -74.0061],
    'Yorkville': [40.7768, -73.9495], 'Two Bridges': [40.7120, -73.9960],
    'Stuyvesant Town': [40.7314, -73.9784], 'Turtle Bay': [40.7527, -73.9680],
    'Hudson Yards': [40.7542, -74.0005], 'Nolita': [40.7230, -73.9953],
    'South Street Seaport': [40.7065, -74.0025],
    // Brooklyn
    'Bay Ridge': [40.6348, -74.0287], 'Bedford-Stuyvesant': [40.6861, -73.9418],
    'Bed-Stuy': [40.6861, -73.9418], 'Boerum Hill': [40.6848, -73.9846],
    'Brooklyn Heights': [40.6960, -73.9936], 'Bushwick': [40.6944, -73.9213],
    'Carroll Gardens': [40.6795, -73.9991], 'Clinton Hill': [40.6893, -73.9667],
    'Cobble Hill': [40.6870, -73.9960], 'Crown Heights': [40.6694, -73.9422],
    'DUMBO': [40.7033, -73.9882], 'Downtown Brooklyn': [40.6920, -73.9858],
    'Fort Greene': [40.6892, -73.9763], 'Greenpoint': [40.7282, -73.9517],
    'Gowanus': [40.6738, -73.9900], 'Park Slope': [40.6710, -73.9798],
    'Prospect Heights': [40.6775, -73.9692], 'Red Hook': [40.6734, -74.0097],
    'Williamsburg': [40.7081, -73.9571], 'Windsor Terrace': [40.6538, -73.9759],
    // Queens
    'Astoria': [40.7724, -73.9301], 'Flushing': [40.7627, -73.8330],
    'Forest Hills': [40.7185, -73.8448], 'Jackson Heights': [40.7557, -73.8831],
    'Long Island City': [40.7448, -73.9487], 'LIC': [40.7448, -73.9487],
    'Sunnyside': [40.7433, -73.9196], 'Woodside': [40.7454, -73.9029],
    // Bronx
    'Concourse Village': [40.8230, -73.9230], 'Mott Haven': [40.8086, -73.9226],
    'Riverdale': [40.8999, -73.9130], 'Pelham Bay': [40.8506, -73.8360],
    'Fordham': [40.8614, -73.8907],
    // Staten Island
    'St. George': [40.6433, -74.0764], 'Stapleton': [40.6266, -74.0769],
    'Todt Hill': [40.5944, -74.1014], 'Great Kills': [40.5545, -74.1518]
};

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
// Google Maps OverlayView for price label pins
// ═══════════════════════════════════════════════════════

var PricePinOverlay = null; // Will be set once google.maps loads

function _initPricePinClass() {
    if (PricePinOverlay) return;
    if (typeof google === 'undefined' || !google.maps) return;

    PricePinOverlay = function(position, html, map) {
        this.position = position;
        this.html = html;
        this.div = null;
        this.setMap(map);
    };
    PricePinOverlay.prototype = Object.create(google.maps.OverlayView.prototype);
    PricePinOverlay.prototype.constructor = PricePinOverlay;

    PricePinOverlay.prototype.onAdd = function() {
        this.div = document.createElement('div');
        this.div.innerHTML = this.html;
        this.div.style.position = 'absolute';
        this.div.style.zIndex = '100';
        this.getPanes().overlayMouseTarget.appendChild(this.div);
    };

    PricePinOverlay.prototype.draw = function() {
        if (!this.div) return;
        var proj = this.getProjection();
        if (!proj) return;
        var pos = proj.fromLatLngToDivPixel(this.position);
        if (pos) {
            this.div.style.left = pos.x + 'px';
            this.div.style.top = pos.y + 'px';
        }
    };

    PricePinOverlay.prototype.onRemove = function() {
        if (this.div && this.div.parentNode) {
            this.div.parentNode.removeChild(this.div);
            this.div = null;
        }
    };

    PricePinOverlay.prototype.getDiv = function() {
        return this.div;
    };
}

// ═══════════════════════════════════════════════════════
// Core map functions
// ═══════════════════════════════════════════════════════

function initGoogleMap() {
    if (_gmap) return _gmap;
    if (typeof google === 'undefined' || !google.maps) {
        console.warn('Google Maps API not loaded yet');
        return null;
    }

    _initPricePinClass();

    _gmap = new google.maps.Map(document.getElementById('googleMap'), {
        center: { lat: 40.7580, lng: -73.9855 },
        zoom: 13,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
        styles: [
            { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] }
        ]
    });

    _gmapInfoWindow = new google.maps.InfoWindow({ maxWidth: 300 });
    _gmapReady = true;
    return _gmap;
}

function clearMapMarkers() {
    _gmapMarkers.forEach(function(m) {
        if (m.overlay) m.overlay.setMap(null);
    });
    _gmapMarkers = [];
    if (_gmapInfoWindow) _gmapInfoWindow.close();
}

function renderMapPins() {
    if (!_gmap) return;
    clearMapMarkers();

    var listings = getFilteredListings();
    if (!listings || listings.length === 0) return;

    var bounds = new google.maps.LatLngBounds();
    var hasValidCoords = false;

    listings.forEach(function(listing) {
        var lat = listing.latitude || (listing.location && listing.location.lat);
        var lng = listing.longitude || (listing.location && listing.location.lng);
        if (!lat || !lng) return;

        hasValidCoords = true;
        var position = new google.maps.LatLng(lat, lng);
        bounds.extend(position);

        var color = getMarkerColor(listing);
        var priceLabel = formatMapPrice(listing.price);
        var pinHTML = '<div class="map-pin-price ' + color.cls + '" data-listing-id="' + listing.id + '">' + priceLabel + '</div>';

        var overlay = new PricePinOverlay(position, pinHTML, _gmap);

        var markerObj = { overlay: overlay, listing: listing };
        _gmapMarkers.push(markerObj);

        // Wait for overlay to render, then attach events
        setTimeout(function() {
            var div = overlay.getDiv();
            if (!div) return;
            var pin = div.querySelector('.map-pin-price');
            if (!pin) return;

            pin.addEventListener('click', function(e) {
                e.stopPropagation();
                _gmapSelectedId = listing.id;
                _gmapInfoWindow.setContent(buildPopupHTML(listing));
                _gmapInfoWindow.setPosition(position);
                _gmapInfoWindow.open(_gmap);

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
                pin.classList.add('active');
            });

            pin.addEventListener('mouseenter', function() {
                var listItem = document.querySelector('.map-list-item[data-listing-id="' + listing.id + '"]');
                if (listItem) listItem.classList.add('map-hover');
            });
            pin.addEventListener('mouseleave', function() {
                var listItem = document.querySelector('.map-list-item[data-listing-id="' + listing.id + '"]');
                if (listItem) listItem.classList.remove('map-hover');
            });
        }, 100);
    });

    if (hasValidCoords) {
        _gmap.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
        // Don't zoom in too far for single listing
        google.maps.event.addListenerOnce(_gmap, 'idle', function() {
            if (_gmap.getZoom() > 16) _gmap.setZoom(16);
        });
    }
}

function mapCenterOnNeighborhood(name) {
    if (!_gmap) return;
    var coords = NEIGHBORHOOD_CENTERS[name];
    if (!coords) return;

    _gmap.panTo({ lat: coords[0], lng: coords[1] });
    _gmap.setZoom(15);

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
        var div = m.overlay.getDiv();
        if (!div) return;
        var pin = div.querySelector('.map-pin-price');
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
            var marker = _gmapMarkers.find(function(m) { return String(m.listing.id) === String(lid); });
            if (marker && _gmap) {
                var lat = marker.listing.latitude || (marker.listing.location && marker.listing.location.lat);
                var lng = marker.listing.longitude || (marker.listing.location && marker.listing.location.lng);
                if (lat && lng) {
                    var pos = new google.maps.LatLng(lat, lng);
                    _gmap.panTo(pos);
                    _gmapInfoWindow.setContent(buildPopupHTML(marker.listing));
                    _gmapInfoWindow.setPosition(pos);
                    _gmapInfoWindow.open(_gmap);
                }
                // Highlight pin
                document.querySelectorAll('.map-pin-price').forEach(function(p) { p.classList.remove('active'); });
                var div = marker.overlay.getDiv();
                if (div) {
                    var pin = div.querySelector('.map-pin-price');
                    if (pin) pin.classList.add('active');
                }
            }
        });

        item.addEventListener('mouseenter', function() { mapHighlightPin(lid, true); });
        item.addEventListener('mouseleave', function() { mapHighlightPin(lid, false); });
    });

    // Initialize or update map
    if (!_gmap) {
        if (typeof google !== 'undefined' && google.maps) {
            initGoogleMap();
            renderMapPins();
        } else {
            // Google Maps not loaded yet — show loading state
            var mapEl = document.getElementById('googleMap');
            if (mapEl) {
                mapEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:12px;color:#9ca3af;">' +
                    '<i class="fas fa-spinner fa-spin text-3xl"></i>' +
                    '<p style="font-size:13px;font-weight:500;">Loading Google Maps...</p>' +
                '</div>';
            }
            // Retry when API loads, with timeout
            var _mapRetryCount = 0;
            var checkInterval = setInterval(function() {
                _mapRetryCount++;
                if (typeof google !== 'undefined' && google.maps) {
                    clearInterval(checkInterval);
                    var mapEl2 = document.getElementById('googleMap');
                    if (mapEl2) mapEl2.innerHTML = '';
                    initGoogleMap();
                    renderMapPins();
                } else if (_mapRetryCount > 16) {
                    // After ~8 seconds, show helpful error
                    clearInterval(checkInterval);
                    var mapEl3 = document.getElementById('googleMap');
                    if (mapEl3) {
                        var isFileProtocol = window.location.protocol === 'file:';
                        mapEl3.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:16px;padding:40px;text-align:center;">' +
                            '<i class="fas fa-map-marked-alt text-5xl text-gray-300"></i>' +
                            '<div>' +
                                '<p style="font-size:15px;font-weight:600;color:#374151;margin-bottom:6px;">Google Maps could not load</p>' +
                                (isFileProtocol ?
                                    '<p style="font-size:12px;color:#6b7280;line-height:1.6;">Google Maps requires HTTP/HTTPS. You\'re opening this file directly.<br>' +
                                    '<strong>To fix:</strong> Serve this folder with a local server:</p>' +
                                    '<code style="display:inline-block;margin-top:8px;padding:6px 14px;background:#f3f4f6;border-radius:6px;font-size:12px;color:#1a1a1a;">npx serve .</code>' +
                                    '<p style="font-size:11px;color:#9ca3af;margin-top:8px;">Then open <strong>http://localhost:3000/index-built.html</strong></p>'
                                :
                                    '<p style="font-size:12px;color:#6b7280;line-height:1.6;">Check that the API key is valid and the domain<br>is allowed in Google Cloud Console.</p>'
                                ) +
                            '</div>' +
                        '</div>';
                    }
                }
            }, 500);
        }
    } else {
        renderMapPins();
        // Trigger resize in case container was hidden
        google.maps.event.trigger(_gmap, 'resize');
    }
}
