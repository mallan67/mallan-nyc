// ═══════════════════════════════════════════════════════
// MAP SELECTION MODAL — Full-screen map popup
// One shared Google Map instance, opens from any search mode
// Dependencies: Google Maps JS API, neighborhood-polygons.js
// ═══════════════════════════════════════════════════════

var _modalMap = null;         // google.maps.Map instance
var _modalPolygons = {};      // name -> google.maps.Polygon
var _modalInfoWindow = null;  // shared InfoWindow

// ═══════════════════════════════════════════════════════
// Open / Close
// ═══════════════════════════════════════════════════════

function openMapModal() {
    var modal = document.getElementById('mapSelectionModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // prevent background scroll

    // Init map on first open
    if (!_modalMap) {
        if (typeof google !== 'undefined' && google.maps) {
            _initModalMap();
        } else {
            // Wait for API
            var el = document.getElementById('mapModalMap');
            if (el) {
                el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
            }
            var retries = 0;
            var iv = setInterval(function() {
                retries++;
                if (typeof google !== 'undefined' && google.maps) {
                    clearInterval(iv);
                    if (el) el.innerHTML = '';
                    _initModalMap();
                } else if (retries > 20) {
                    clearInterval(iv);
                    if (el) {
                        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:12px;color:#9ca3af;text-align:center;padding:40px;">' +
                            '<i class="fas fa-exclamation-triangle text-3xl"></i>' +
                            '<p style="font-size:14px;font-weight:500;">Google Maps could not load</p>' +
                            (window.location.protocol === 'file:' ?
                                '<p style="font-size:12px;">Serve via HTTP: <code style="background:#f3f4f6;padding:3px 8px;border-radius:4px;">npx serve .</code></p>' : '') +
                        '</div>';
                    }
                }
            }, 500);
        }
    } else {
        // Map exists — trigger resize for proper rendering
        google.maps.event.trigger(_modalMap, 'resize');
    }

    // Sync checkboxes in modal with what's already selected on the search form
    _syncModalCheckboxesFromSearchForm();

    // ESC key handler
    document.addEventListener('keydown', _mapModalEscHandler);
}

function closeMapModal() {
    var modal = document.getElementById('mapSelectionModal');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', _mapModalEscHandler);
}

function _mapModalEscHandler(e) {
    if (e.key === 'Escape') closeMapModal();
}

function applyMapSelection() {
    // Get selected neighborhoods from modal checkboxes
    var selected = [];
    var tree = document.getElementById('mapModalNeighborhoodTree');
    if (tree) {
        tree.querySelectorAll('label input[type="checkbox"]:checked').forEach(function(cb) {
            var label = cb.closest('label');
            if (label) selected.push(label.textContent.trim());
        });
    }

    // Sync selected neighborhoods to ALL search form neighborhood trees
    document.querySelectorAll('.neighborhood-tree').forEach(function(formTree) {
        // Skip the modal's own tree
        if (formTree.id === 'mapModalNeighborhoodTree') return;

        formTree.querySelectorAll('label').forEach(function(label) {
            var name = label.textContent.trim();
            var cb = label.querySelector('input[type="checkbox"]');
            if (cb) {
                cb.checked = selected.indexOf(name) !== -1;
            }
        });

        // Update parent checkboxes state
        formTree.querySelectorAll('details').forEach(function(det) {
            var parentCb = det.querySelector(':scope > summary > input[type="checkbox"]');
            if (parentCb) {
                var children = det.querySelectorAll('label input[type="checkbox"]');
                var anyChecked = false;
                children.forEach(function(c) { if (c.checked) anyChecked = true; });
                parentCb.checked = anyChecked;
            }
        });
    });

    // Also update the results map polygons
    if (typeof clearAllNeighborhoodPolygons === 'function') {
        clearAllNeighborhoodPolygons();
    }
    selected.forEach(function(name) {
        if (typeof toggleNeighborhoodPolygon === 'function') {
            toggleNeighborhoodPolygon(name, true);
        }
    });

    closeMapModal();
}

// ═══════════════════════════════════════════════════════
// Initialize the modal's Google Map
// ═══════════════════════════════════════════════════════

function _initModalMap() {
    var el = document.getElementById('mapModalMap');
    if (!el || _modalMap) return;

    _modalMap = new google.maps.Map(el, {
        center: { lat: 40.7580, lng: -73.9855 },
        zoom: 12,
        mapTypeControl: true,
        mapTypeControlOptions: {
            style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
            position: google.maps.ControlPosition.TOP_RIGHT
        },
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
        styles: [
            { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] }
        ]
    });

    _modalInfoWindow = new google.maps.InfoWindow();

    // Wire modal neighborhood tree checkboxes
    var tree = document.getElementById('mapModalNeighborhoodTree');
    if (tree) {
        tree.addEventListener('change', function(e) {
            var cb = e.target;
            if (cb.type !== 'checkbox') return;

            // Parent checkbox cascade
            var summary = cb.closest('summary');
            if (summary) {
                var details = summary.parentElement;
                if (details && details.tagName === 'DETAILS') {
                    details.querySelectorAll('input[type="checkbox"]').forEach(function(child) {
                        if (child !== cb) child.checked = cb.checked;
                    });
                    // Toggle polygons for all children
                    details.querySelectorAll('label').forEach(function(lbl) {
                        var name = lbl.textContent.trim();
                        _toggleModalPolygon(name, cb.checked);
                    });
                }
            }

            // Individual checkbox
            var label = cb.closest('label');
            if (label) {
                var nbName = label.textContent.trim();
                _toggleModalPolygon(nbName, cb.checked);

                // Center map on checked neighborhood
                if (cb.checked && typeof NEIGHBORHOOD_CENTERS !== 'undefined' && NEIGHBORHOOD_CENTERS[nbName]) {
                    var coords = NEIGHBORHOOD_CENTERS[nbName];
                    _modalMap.panTo({ lat: coords[0], lng: coords[1] });
                    _modalMap.setZoom(14);
                }
            }

            // Update parent checkbox state
            var parentDetails = cb.closest('details');
            if (parentDetails) {
                var parentCb = parentDetails.querySelector(':scope > summary > input[type="checkbox"]');
                if (parentCb && parentCb !== cb) {
                    var allChildren = parentDetails.querySelectorAll('label input[type="checkbox"]');
                    var anyChecked = false;
                    allChildren.forEach(function(c) { if (c.checked) anyChecked = true; });
                    parentCb.checked = anyChecked;
                }
            }

            _updateModalPolygonCount();
        });
    }
}

// ═══════════════════════════════════════════════════════
// Modal polygon management
// ═══════════════════════════════════════════════════════

function _toggleModalPolygon(name, show) {
    if (show) {
        _drawModalPolygon(name);
    } else {
        _removeModalPolygon(name);
    }
}

function _drawModalPolygon(name) {
    if (!_modalMap || typeof google === 'undefined') return;
    if (_modalPolygons[name]) return;
    if (typeof NEIGHBORHOOD_POLYGONS === 'undefined') return;

    var coords = NEIGHBORHOOD_POLYGONS[name];
    if (!coords) return;

    var path = coords.map(function(c) { return { lat: c[0], lng: c[1] }; });

    var polygon = new google.maps.Polygon({
        paths: path,
        strokeColor: '#3b82f6',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#3b82f6',
        fillOpacity: 0.18,
        map: _modalMap
    });

    polygon.addListener('click', function() {
        var bounds = new google.maps.LatLngBounds();
        path.forEach(function(p) { bounds.extend(p); });
        _modalInfoWindow.setContent('<div style="font-weight:600;font-size:14px;padding:2px 6px;">' + name + '</div>');
        _modalInfoWindow.setPosition(bounds.getCenter());
        _modalInfoWindow.open(_modalMap);
    });

    _modalPolygons[name] = polygon;

    // Fit bounds to show all polygons
    var allBounds = new google.maps.LatLngBounds();
    Object.keys(_modalPolygons).forEach(function(n) {
        if (_modalPolygons[n] && _modalPolygons[n].getPath) {
            _modalPolygons[n].getPath().forEach(function(pt) { allBounds.extend(pt); });
        }
    });
    if (Object.keys(_modalPolygons).length > 1) {
        _modalMap.fitBounds(allBounds, { top: 40, right: 40, bottom: 40, left: 40 });
    }
}

function _removeModalPolygon(name) {
    if (_modalPolygons[name]) {
        _modalPolygons[name].setMap(null);
        delete _modalPolygons[name];
    }
}

function clearMapModalPolygons() {
    Object.keys(_modalPolygons).forEach(function(name) {
        if (_modalPolygons[name]) _modalPolygons[name].setMap(null);
    });
    _modalPolygons = {};

    // Uncheck all modal checkboxes
    var tree = document.getElementById('mapModalNeighborhoodTree');
    if (tree) {
        tree.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
            cb.checked = false;
        });
    }

    _updateModalPolygonCount();

    // Reset map view
    if (_modalMap) {
        _modalMap.setCenter({ lat: 40.7580, lng: -73.9855 });
        _modalMap.setZoom(12);
    }
}

function _updateModalPolygonCount() {
    var count = Object.keys(_modalPolygons).length;
    var text = count > 0 ? count + ' area' + (count > 1 ? 's' : '') + ' selected' : '';

    var countEl = document.getElementById('mapModalPolygonCount');
    var footerEl = document.getElementById('mapModalFooterCount');
    var clearBtn = document.getElementById('mapModalClearBtn');

    if (countEl) countEl.textContent = text;
    if (footerEl) footerEl.textContent = text;
    if (clearBtn) clearBtn.classList.toggle('hidden', count === 0);
}

// ═══════════════════════════════════════════════════════
// Sync modal checkboxes from the active search form
// ═══════════════════════════════════════════════════════

function _syncModalCheckboxesFromSearchForm() {
    // Find the currently visible search form's neighborhood tree
    var activeTrees = [];
    var containers = ['searchBasicMode', 'searchBasicModeRental', 'searchBasicModeBuilding', 'searchAdvancedMode', 'generalCriteriaPage'];

    containers.forEach(function(id) {
        var el = document.getElementById(id);
        if (el && el.style.display !== 'none' && !el.classList.contains('hidden')) {
            el.querySelectorAll('.neighborhood-tree').forEach(function(t) {
                activeTrees.push(t);
            });
        }
    });

    // Collect checked neighborhoods from active search forms
    var checkedNames = {};
    activeTrees.forEach(function(tree) {
        tree.querySelectorAll('label').forEach(function(label) {
            var cb = label.querySelector('input[type="checkbox"]');
            if (cb && cb.checked) {
                checkedNames[label.textContent.trim()] = true;
            }
        });
    });

    // Clear modal state
    Object.keys(_modalPolygons).forEach(function(n) {
        if (_modalPolygons[n]) _modalPolygons[n].setMap(null);
    });
    _modalPolygons = {};

    // Set modal checkboxes and draw polygons
    var tree = document.getElementById('mapModalNeighborhoodTree');
    if (tree) {
        tree.querySelectorAll('label').forEach(function(label) {
            var name = label.textContent.trim();
            var cb = label.querySelector('input[type="checkbox"]');
            if (cb) {
                cb.checked = !!checkedNames[name];
                if (cb.checked) {
                    _drawModalPolygon(name);
                }
            }
        });

        // Update parent checkboxes
        tree.querySelectorAll('details').forEach(function(det) {
            var parentCb = det.querySelector(':scope > summary > input[type="checkbox"]');
            if (parentCb) {
                var children = det.querySelectorAll('label input[type="checkbox"]');
                var anyChecked = false;
                children.forEach(function(c) { if (c.checked) anyChecked = true; });
                parentCb.checked = anyChecked;
            }
        });
    }

    _updateModalPolygonCount();
}

// Legacy stubs for old inline map code (prevent errors if called)
function toggleBasicSearchMap() {}
function clearAllSearchFormPolygons() { clearMapModalPolygons(); }
function getSFMapType() { return null; }
function toggleSFPolygon() {}
function sfMapCenterOnNeighborhood() {}
function initSearchFormMap() {}
