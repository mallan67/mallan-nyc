// ═══════════════════════════════════════════════════════
// MAP SELECTION MODAL — Full-screen map popup
// One shared MapLibre map instance, opens from any search mode
// Dependencies: maplibre-gl.js, neighborhood-polygons.js
// ═══════════════════════════════════════════════════════

var _modalMap = null;         // maplibregl.Map instance
var _modalPolygons = {};      // name -> { sourceId, fillId, lineId }
var _modalMapReady = false;   // true once style loaded

// ═══════════════════════════════════════════════════════
// Open / Close
// ═══════════════════════════════════════════════════════

function openMapModal() {
    var modal = document.getElementById('mapSelectionModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    if (!_modalMap) {
        if (typeof maplibregl !== 'undefined') {
            _initModalMap();
        } else {
            var el = document.getElementById('mapModalMap');
            if (el) {
                el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
            }
            var retries = 0;
            var iv = setInterval(function() {
                retries++;
                if (typeof maplibregl !== 'undefined') {
                    clearInterval(iv);
                    if (el) el.innerHTML = '';
                    _initModalMap();
                } else if (retries > 20) {
                    clearInterval(iv);
                    if (el) {
                        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:12px;color:#9ca3af;text-align:center;padding:40px;">' +
                            '<i class="fas fa-exclamation-triangle text-3xl"></i>' +
                            '<p style="font-size:14px;font-weight:500;">Map could not load</p>' +
                        '</div>';
                    }
                }
            }, 500);
        }
    } else {
        _modalMap.resize();
    }

    _syncModalCheckboxesFromSearchForm();
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
    var selected = [];
    var tree = document.getElementById('mapModalNeighborhoodTree');
    if (tree) {
        tree.querySelectorAll('label input[type="checkbox"]:checked').forEach(function(cb) {
            var label = cb.closest('label');
            if (label) selected.push(label.textContent.trim());
        });
    }

    document.querySelectorAll('.neighborhood-tree').forEach(function(formTree) {
        if (formTree.id === 'mapModalNeighborhoodTree') return;

        formTree.querySelectorAll('label').forEach(function(label) {
            var name = label.textContent.trim();
            var cb = label.querySelector('input[type="checkbox"]');
            if (cb) {
                cb.checked = selected.indexOf(name) !== -1;
            }
        });

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
// Initialize the modal's MapLibre map
// ═══════════════════════════════════════════════════════

function _initModalMap() {
    var el = document.getElementById('mapModalMap');
    if (!el || _modalMap) return;

    _modalMap = new maplibregl.Map({
        container: el,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [-73.9855, 40.7580],
        zoom: 12,
        attributionControl: true
    });

    _modalMap.addControl(new maplibregl.NavigationControl(), 'top-right');

    _modalMap.on('load', function() {
        _modalMapReady = true;
        // Re-draw any polygons that were queued before style loaded
        var pending = Object.keys(_modalPolygons);
        _modalPolygons = {};
        pending.forEach(function(name) {
            _drawModalPolygon(name);
        });
    });

    // Wire modal neighborhood tree checkboxes
    var tree = document.getElementById('mapModalNeighborhoodTree');
    if (tree) {
        tree.addEventListener('change', function(e) {
            var cb = e.target;
            if (cb.type !== 'checkbox') return;

            var summary = cb.closest('summary');
            if (summary) {
                var details = summary.parentElement;
                if (details && details.tagName === 'DETAILS') {
                    details.querySelectorAll('input[type="checkbox"]').forEach(function(child) {
                        if (child !== cb) child.checked = cb.checked;
                    });
                    details.querySelectorAll('label').forEach(function(lbl) {
                        var name = lbl.textContent.trim();
                        _toggleModalPolygon(name, cb.checked);
                    });
                }
            }

            var label = cb.closest('label');
            if (label) {
                var nbName = label.textContent.trim();
                _toggleModalPolygon(nbName, cb.checked);

                if (cb.checked && typeof NEIGHBORHOOD_CENTERS !== 'undefined' && NEIGHBORHOOD_CENTERS[nbName]) {
                    var coords = NEIGHBORHOOD_CENTERS[nbName];
                    // NEIGHBORHOOD_CENTERS stores [lat, lng], MapLibre needs [lng, lat]
                    _modalMap.flyTo({ center: [coords[1], coords[0]], zoom: 14 });
                }
            }

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
// Modal polygon management — MapLibre GL JS
// ═══════════════════════════════════════════════════════

function _toggleModalPolygon(name, show) {
    if (show) {
        _drawModalPolygon(name);
    } else {
        _removeModalPolygon(name);
    }
}

function _drawModalPolygon(name) {
    if (!_modalMap) return;
    if (_modalPolygons[name]) return;
    if (typeof NEIGHBORHOOD_POLYGONS === 'undefined') return;

    var resolved = (typeof resolveNeighborhoodName === 'function') ? resolveNeighborhoodName(name) : name;
    var geom = NEIGHBORHOOD_POLYGONS[resolved];
    if (!geom) return;

    // If style not loaded yet, queue it
    if (!_modalMapReady) {
        _modalPolygons[name] = { pending: true };
        return;
    }

    var slug = resolved.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    var sourceId = 'modal-nb-src-' + slug;
    var fillId = 'modal-nb-fill-' + slug;
    var lineId = 'modal-nb-line-' + slug;

    try {
        _modalMap.addSource(sourceId, {
            type: 'geojson',
            data: { type: 'Feature', geometry: geom, properties: { name: resolved } }
        });
        _modalMap.addLayer({
            id: fillId, type: 'fill', source: sourceId,
            paint: { 'fill-color': 'rgba(196, 160, 82, 0.25)', 'fill-opacity': 0.6 }
        });
        _modalMap.addLayer({
            id: lineId, type: 'line', source: sourceId,
            paint: { 'line-color': '#B8860B', 'line-width': 2, 'line-opacity': 0.85 }
        });

        _modalMap.on('click', fillId, function(e) {
            new maplibregl.Popup({ closeButton: false, closeOnClick: true })
                .setLngLat(e.lngLat)
                .setHTML('<div style="font-weight:600;font-size:14px;padding:2px 6px;">' + resolved + '</div>')
                .addTo(_modalMap);
        });

        _modalPolygons[name] = { sourceId: sourceId, fillId: fillId, lineId: lineId };

        // Fit bounds to show all polygons
        if (Object.keys(_modalPolygons).length > 1) {
            var allBounds = new maplibregl.LngLatBounds();
            Object.keys(_modalPolygons).forEach(function(n) {
                var entry = _modalPolygons[n];
                if (entry && !entry.pending) {
                    var g = NEIGHBORHOOD_POLYGONS[(typeof resolveNeighborhoodName === 'function') ? resolveNeighborhoodName(n) : n];
                    if (g && g.coordinates && g.coordinates[0]) {
                        g.coordinates[0].forEach(function(coord) {
                            allBounds.extend(coord);
                        });
                    }
                }
            });
            if (!allBounds.isEmpty()) {
                _modalMap.fitBounds(allBounds, { padding: 40 });
            }
        }
    } catch(e) {
        console.warn('[ModalPolygon]', name, e.message);
    }
}

function _removeModalPolygon(name) {
    var entry = _modalPolygons[name];
    if (!entry) return;
    if (_modalMap && !entry.pending) {
        try {
            if (_modalMap.getLayer(entry.fillId)) _modalMap.removeLayer(entry.fillId);
            if (_modalMap.getLayer(entry.lineId)) _modalMap.removeLayer(entry.lineId);
            if (_modalMap.getSource(entry.sourceId)) _modalMap.removeSource(entry.sourceId);
        } catch(e) {}
    }
    delete _modalPolygons[name];
}

function clearMapModalPolygons() {
    Object.keys(_modalPolygons).forEach(function(name) {
        _removeModalPolygon(name);
    });
    _modalPolygons = {};

    var tree = document.getElementById('mapModalNeighborhoodTree');
    if (tree) {
        tree.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
            cb.checked = false;
        });
    }

    _updateModalPolygonCount();

    if (_modalMap) {
        _modalMap.flyTo({ center: [-73.9855, 40.7580], zoom: 12 });
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

    var checkedNames = {};
    activeTrees.forEach(function(tree) {
        tree.querySelectorAll('label').forEach(function(label) {
            var cb = label.querySelector('input[type="checkbox"]');
            if (cb && cb.checked) {
                checkedNames[label.textContent.trim()] = true;
            }
        });
    });

    // Clear existing modal polygons
    Object.keys(_modalPolygons).forEach(function(n) {
        _removeModalPolygon(n);
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
