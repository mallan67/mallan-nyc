/**
 * neighborhood-map.js — MapLibre GL neighborhood selector for CRM
 *
 * Entry point: openNeighborhoodMap(callback)
 *   callback receives: { selectedNeighborhoods: string[] }
 *
 * Loads GeoJSON from /geo/rls-neighborhoods.v1.min.geojson
 * Tiles from OpenFreeMap (Positron default, Bright/Liberty switcher)
 * Polygons: gold (#B8860B) fill 0.08 opacity, 0.16 on hover
 *
 * Sidebar is generated from GeoJSON properties — NO hardcoded arrays.
 *
 * State architecture:
 *   _selectedNames = single source of truth for selection
 *   On open: initialized from search state (_neighborhoodCanonicals) if present
 *   On apply: emits canonical names, does NOT clear _selectedNames
 *   On reopen: restores from _selectedNames (persists between opens)
 *   rehydrateSelection() re-applies feature-state after any map/style change
 */

/* global maplibregl */

(function () {
  'use strict';

  var _map = null;
  var _geojsonData = null;
  var _selectedNames = {};
  var _callback = null;
  var _loaded = false;
  var _layersAdded = false;
  var _aliasMap = null;
  var _reverseAliases = {};

  // Resolve geo file path relative to page location
  function resolveGeoBase() {
    var base = window.location.pathname.replace(/\/[^/]*$/, '');
    return base.endsWith('/crm') ? '/geo/' : '../geo/';
  }

  var STYLE_URLS = {
    positron: 'https://tiles.openfreemap.org/styles/positron',
    bright: 'https://tiles.openfreemap.org/styles/bright',
    liberty: 'https://tiles.openfreemap.org/styles/liberty',
  };

  var GOLD = '#B8860B';
  var FILL_OPACITY = 0.08;
  var FILL_HOVER_OPACITY = 0.16;
  var FILL_SELECTED_OPACITY = 0.30;

  // ── Lazy-load MapLibre GL JS + CSS ──

  function ensureMapLibre(cb) {
    if (typeof maplibregl !== 'undefined') return cb();

    if (!document.querySelector('link[href*="maplibre-gl"]')) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }

    var script = document.createElement('script');
    script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
    script.onload = cb;
    script.onerror = function () { showMapError(); };
    document.head.appendChild(script);
  }

  // ── Fetch GeoJSON + Aliases ──

  function loadAliases(cb) {
    if (_aliasMap) return cb();
    var base = resolveGeoBase();
    fetch(base + 'neighborhood-aliases.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.aliases) {
          _aliasMap = data.aliases;
          _reverseAliases = {};
          Object.keys(_aliasMap).forEach(function (variant) {
            var val = _aliasMap[variant];
            if (!val) return;
            var polys = Array.isArray(val) ? val : [val];
            polys.forEach(function (poly) {
              if (!_reverseAliases[poly]) _reverseAliases[poly] = [];
              _reverseAliases[poly].push(variant);
            });
          });
        }
        cb();
      })
      .catch(function () { cb(); });
  }

  function loadGeoJSON(cb) {
    if (_geojsonData) return cb(_geojsonData);
    var url = resolveGeoBase() + 'rls-neighborhoods.v1.min.geojson';
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        _geojsonData = data;
        loadAliases(function () { cb(data); });
      })
      .catch(function () { showMapError(); });
  }

  function showMapError() {
    var errEl = document.getElementById('nbMapError');
    var mapEl = document.getElementById('nbMapContainer');
    if (errEl) { errEl.style.display = 'flex'; }
    if (mapEl) { mapEl.style.display = 'none'; }
  }

  // ── Build sidebar from GeoJSON (no hardcoded arrays) ──

  function buildSidebar(geojson, filterText) {
    var listEl = document.getElementById('nbMapList');
    if (!listEl) return;

    var ft = (filterText || '').trim().toLowerCase();
    var byBorough = {};
    for (var i = 0; i < geojson.features.length; i++) {
      var f = geojson.features[i];
      var name = f.properties.name || '';
      if (ft && name.toLowerCase().indexOf(ft) === -1) continue;
      var borough = f.properties.borough || 'Other';
      if (!byBorough[borough]) byBorough[borough] = [];
      byBorough[borough].push(name);
    }

    var boroughs = Object.keys(byBorough).sort(function (a, b) {
      if (a === 'Manhattan') return -1;
      if (b === 'Manhattan') return 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });

    var html = '';
    for (var b = 0; b < boroughs.length; b++) {
      var bName = boroughs[b];
      var names = byBorough[bName].sort();
      var openAttr = (ft.length > 0 || bName === 'Manhattan') ? ' open' : '';
      html += '<details class="nb-borough-group" data-borough="' + bName + '"' + openAttr + '>';
      html += '<summary><span>' + bName + '</span><span class="nb-borough-meta">' + names.length + '</span></summary>';
      for (var n = 0; n < names.length; n++) {
        var nName = names[n];
        var escapedName = nName.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        var checked = _selectedNames[nName] ? ' checked' : '';
        html += '<div class="nb-item nb-sidebar-item" data-name="' + escapedName + '" onclick="toggleNeighborhoodMapItemFromRow(this,event)">';
        html += '<input type="checkbox" class="nb-sidebar-cb"' + checked + ' data-nb="' + escapedName + '" onchange="toggleNeighborhoodMapItem(\'' + escapedName.replace(/'/g, "\\'") + '\',this.checked)">';
        html += '<div class="nb-item-name">' + nName + '<div class="nb-item-borough">' + bName + '</div></div>';
        html += '<div class="nb-item-chevron">&#8250;</div>';
        html += '</div>';
      }
      html += '</details>';
    }

    if (boroughs.length === 0 && ft) {
      html = '<div style="padding:20px; text-align:center; font-size:12px; color:rgba(17,24,39,0.4);">No neighborhoods match &ldquo;' + ft.replace(/</g, '&lt;') + '&rdquo;</div>';
    }

    listEl.innerHTML = html;

    var clearBtn = document.getElementById('nbMapClearBtn');
    if (clearBtn) {
      clearBtn.style.display = Object.keys(_selectedNames).length > 0 ? '' : 'none';
    }
  }

  // ── Rehydrate selection — single function called after any map/style change ──

  function rehydrateSelection() {
    if (!_map || !_loaded || !_geojsonData) return;

    // Ensure source and layers exist
    if (!_map.getSource('nb-source')) {
      addLayers(_geojsonData);
      return; // addLayers calls rehydrateSelection at the end
    }

    // Apply feature-state for all polygons
    try {
      for (var i = 0; i < _geojsonData.features.length; i++) {
        var name = _geojsonData.features[i].properties.name;
        _map.setFeatureState(
          { source: 'nb-source', id: i },
          { selected: !!_selectedNames[name] }
        );
      }
    } catch (_) { /* source not ready yet — will retry on next event */ }
  }

  // ── Initialize map ──

  function initMap(geojson) {
    if (_map) {
      // Map already exists — rehydrate layers + selection
      rehydrateSelection();
      return;
    }

    _map = new maplibregl.Map({
      container: 'nbMapContainer',
      style: STYLE_URLS.bright,
      center: [-73.96, 40.755],
      zoom: 11.5,
      minZoom: 9,
      maxZoom: 16,
    });

    _map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    _map.on('load', function () {
      _loaded = true;
      addLayers(geojson);
    });

    // Fallback: 'idle' fires after all rendering — catches missed 'load' events
    _map.once('idle', function () {
      if (!_loaded) { _loaded = true; addLayers(geojson); }
    });
  }

  function addLayers(geojson) {
    if (!_map || !_loaded) return;

    // Remove old layers/source if they exist
    try { if (_map.getLayer('nb-fill')) _map.removeLayer('nb-fill'); } catch (_) {}
    try { if (_map.getLayer('nb-line')) _map.removeLayer('nb-line'); } catch (_) {}
    try { if (_map.getLayer('nb-label')) _map.removeLayer('nb-label'); } catch (_) {}
    try { if (_map.getSource('nb-source')) _map.removeSource('nb-source'); } catch (_) {}

    _map.addSource('nb-source', {
      type: 'geojson',
      data: geojson,
      generateId: true,
    });

    // Fill layer — all polygons, styled via feature-state
    _map.addLayer({
      id: 'nb-fill',
      type: 'fill',
      source: 'nb-source',
      paint: {
        'fill-color': GOLD,
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], FILL_SELECTED_OPACITY,
          ['boolean', ['feature-state', 'hover'], false], FILL_HOVER_OPACITY,
          FILL_OPACITY,
        ],
      },
    });

    // Outline layer
    _map.addLayer({
      id: 'nb-line',
      type: 'line',
      source: 'nb-source',
      paint: {
        'line-color': GOLD,
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 2.5,
          1,
        ],
        'line-opacity': 0.7,
      },
    });

    // Label layer
    _map.addLayer({
      id: 'nb-label',
      type: 'symbol',
      source: 'nb-source',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 11,
        'text-anchor': 'center',
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#333',
        'text-halo-color': '#fff',
        'text-halo-width': 1.5,
      },
    });

    // Hover interactions
    var hoveredId = null;

    _map.on('mousemove', 'nb-fill', function (e) {
      _map.getCanvas().style.cursor = 'pointer';
      if (e.features.length > 0) {
        if (hoveredId !== null) {
          try { _map.setFeatureState({ source: 'nb-source', id: hoveredId }, { hover: false }); } catch (_) {}
        }
        hoveredId = e.features[0].id;
        try { _map.setFeatureState({ source: 'nb-source', id: hoveredId }, { hover: true }); } catch (_) {}
      }
    });

    _map.on('mouseleave', 'nb-fill', function () {
      _map.getCanvas().style.cursor = '';
      if (hoveredId !== null) {
        try { _map.setFeatureState({ source: 'nb-source', id: hoveredId }, { hover: false }); } catch (_) {}
        hoveredId = null;
      }
    });

    // Click to toggle selection on map
    _map.on('click', 'nb-fill', function (e) {
      if (e.features.length > 0) {
        var name = e.features[0].properties.name;
        var isSelected = !!_selectedNames[name];
        window.toggleNeighborhoodMapItem(name, !isSelected);
      }
    });

    _layersAdded = true;

    // Rehydrate selection state onto new layers
    rehydrateSelection();
  }

  function updateSelectedCount() {
    var countEl = document.getElementById('nbMapSelectedCount');
    var count = Object.keys(_selectedNames).length;
    if (countEl) countEl.textContent = count + ' selected';
  }

  // ── Initialize _selectedNames from search state ──

  function initSelectionFromSearchState() {
    // If search already has _neighborhoodCanonicals, use them
    if (typeof activeSearchCriteria !== 'undefined' && activeSearchCriteria &&
        activeSearchCriteria._neighborhoodCanonicals &&
        activeSearchCriteria._neighborhoodCanonicals.length > 0) {
      _selectedNames = {};
      activeSearchCriteria._neighborhoodCanonicals.forEach(function (name) {
        _selectedNames[name] = true;
      });
    }
    // Otherwise keep existing _selectedNames (persists between opens)
  }

  // ── Public API ──

  window.openNeighborhoodMap = function (callback) {
    _callback = callback || null;

    // (A) Initialize selection from search state
    initSelectionFromSearchState();

    var modal = document.getElementById('neighborhoodMapModal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = '';
      // Prevent document-level click handlers from interfering with modal
      if (!modal._stopPropBound) {
        modal.addEventListener('click', function (e) { e.stopPropagation(); });
        modal._stopPropBound = true;
      }
    }

    ensureMapLibre(function () {
      loadGeoJSON(function (geojson) {
        buildSidebar(geojson);
        updateSelectedCount();
        requestAnimationFrame(function () {
          initMap(geojson);
          if (_map) {
            _map.resize();
            // (C) Rehydrate after modal shown + resize
            setTimeout(function () {
              _map.resize();
              rehydrateSelection();
            }, 200);
            setTimeout(function () { _map.resize(); }, 500);
          }
        });
      });
    });
  };

  // (D) Close only hides UI — does NOT clear _selectedNames
  window.closeNeighborhoodMap = function () {
    var modal = document.getElementById('neighborhoodMapModal');
    if (modal) { modal.classList.add('hidden'); modal.style.display = 'none'; }
  };

  window.confirmNeighborhoodMapSelection = function () {
    var selected = Object.keys(_selectedNames).sort();
    if (selected.length === 0) {
      if (typeof showToast === 'function') showToast('No neighborhoods selected', 'warning');
      return;
    }
    try {
      if (_callback) {
        _callback({ selectedNeighborhoods: selected });
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast('Error applying neighborhoods: ' + err.message, 'error');
      return;
    }
    window.closeNeighborhoodMap();
  };

  window.toggleNeighborhoodMapItemFromRow = function (rowEl, evt) {
    if (evt && evt.target && evt.target.tagName === 'INPUT') return;
    var cb = rowEl.querySelector('input[type="checkbox"]');
    if (!cb) return;
    var name = cb.getAttribute('data-nb');
    if (!name) return;
    cb.checked = !cb.checked;
    window.toggleNeighborhoodMapItem(name, cb.checked);
  };

  window.toggleNeighborhoodMapItem = function (name, checked) {
    if (checked) {
      _selectedNames[name] = true;
    } else {
      delete _selectedNames[name];
    }

    // Sync checkbox in sidebar
    var items = document.querySelectorAll('.nb-sidebar-item');
    for (var i = 0; i < items.length; i++) {
      if (items[i].getAttribute('data-name') === name) {
        var cb = items[i].querySelector('input[type="checkbox"]');
        if (cb) cb.checked = checked;
      }
    }

    // Sync map feature state immediately
    if (_geojsonData && _map && _loaded) {
      for (var j = 0; j < _geojsonData.features.length; j++) {
        if (_geojsonData.features[j].properties.name === name) {
          try {
            if (_map.getSource('nb-source')) {
              _map.setFeatureState(
                { source: 'nb-source', id: j },
                { selected: checked }
              );
            }
          } catch (_) { /* source not ready */ }
          break;
        }
      }
    }

    updateSelectedCount();

    var clearBtn = document.getElementById('nbMapClearBtn');
    if (clearBtn) {
      clearBtn.style.display = Object.keys(_selectedNames).length > 0 ? '' : 'none';
    }
  };

  window.clearNeighborhoodMapSelection = function () {
    _selectedNames = {};
    var cbs = document.querySelectorAll('.nb-sidebar-cb');
    for (var i = 0; i < cbs.length; i++) {
      cbs[i].checked = false;
    }
    if (_geojsonData && _map && _loaded) {
      try {
        if (_map.getSource('nb-source')) {
          for (var j = 0; j < _geojsonData.features.length; j++) {
            _map.setFeatureState({ source: 'nb-source', id: j }, { selected: false });
          }
        }
      } catch (_) {}
    }
    updateSelectedCount();
    var clearBtn = document.getElementById('nbMapClearBtn');
    if (clearBtn) clearBtn.style.display = 'none';
  };

  window.filterNeighborhoodMapSidebar = function (query) {
    if (_geojsonData) buildSidebar(_geojsonData, query);
  };

  // (C) Style switch — rehydrate selection after style reload
  window.switchNeighborhoodMapStyle = function (styleName) {
    if (!_map || !STYLE_URLS[styleName]) return;
    _loaded = false;
    _layersAdded = false;
    _map.setStyle(STYLE_URLS[styleName]);
    _map.once('style.load', function () {
      _loaded = true;
      if (_geojsonData) addLayers(_geojsonData); // addLayers calls rehydrateSelection
    });
  };

})();
