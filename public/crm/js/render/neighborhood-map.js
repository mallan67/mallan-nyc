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
 */

/* global maplibregl */

(function () {
  'use strict';

  var _map = null;
  var _geojsonData = null;
  var _selectedNames = {};
  var _callback = null;
  var _loaded = false;
  var _aliasMap = null; // variant → polygon name (loaded from aliases JSON)
  var _reverseAliases = {}; // polygon name → [variant1, variant2, ...]

  var ALIAS_URL = (window.location.pathname.includes('/crm/')
    ? '/geo/'
    : '../geo/') + 'neighborhood-aliases.json';

  var GEOJSON_URL = (window.location.pathname.includes('/crm/')
    ? '/geo/'
    : '../geo/') + 'rls-neighborhoods.v1.min.geojson';

  // Resolve relative to page location — try multiple paths
  function resolveGeoURL() {
    // In built file or served from public/crm/
    var base = window.location.pathname.replace(/\/[^/]*$/, '');
    if (base.endsWith('/crm')) return '/geo/rls-neighborhoods.v1.min.geojson';
    // Fallback: relative path
    return '../geo/rls-neighborhoods.v1.min.geojson';
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

    // CSS
    if (!document.querySelector('link[href*="maplibre-gl"]')) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }

    // JS
    var script = document.createElement('script');
    script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
    script.onload = cb;
    script.onerror = function () {
      showMapError();
    };
    document.head.appendChild(script);
  }

  // ── Fetch GeoJSON ──

  function loadAliases(cb) {
    if (_aliasMap) return cb();
    var url = ALIAS_URL.replace('/geo/', resolveGeoURL().replace('rls-neighborhoods.v1.min.geojson', ''));
    // Simpler: just derive from same base
    var base = resolveGeoURL().replace('rls-neighborhoods.v1.min.geojson', '');
    fetch(base + 'neighborhood-aliases.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.aliases) {
          _aliasMap = data.aliases;
          // Build reverse map: polygon name → [variant names]
          // Alias values can be string, array, or null
          _reverseAliases = {};
          Object.keys(_aliasMap).forEach(function (variant) {
            var val = _aliasMap[variant];
            if (!val) return; // null = distinct, no polygon
            var polys = Array.isArray(val) ? val : [val];
            polys.forEach(function (poly) {
              if (!_reverseAliases[poly]) _reverseAliases[poly] = [];
              _reverseAliases[poly].push(variant);
            });
          });
        }
        cb();
      })
      .catch(function () { cb(); }); // non-fatal — map works without aliases
  }

  function loadGeoJSON(cb) {
    if (_geojsonData) return cb(_geojsonData);

    var url = resolveGeoURL();
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        _geojsonData = data;
        // Also load aliases in parallel (non-blocking)
        loadAliases(function () {
          cb(data);
        });
      })
      .catch(function () {
        showMapError();
      });
  }

  function showMapError() {
    var errEl = document.getElementById('nbMapError');
    var mapEl = document.getElementById('nbMapContainer');
    if (errEl) errEl.classList.remove('hidden');
    if (mapEl) mapEl.style.display = 'none';
  }

  // ── Build sidebar from GeoJSON (no hardcoded arrays) ──

  function buildSidebar(geojson) {
    var sidebar = document.getElementById('nbMapSidebar');
    if (!sidebar) return;

    // Group by borough
    var byBorough = {};
    for (var i = 0; i < geojson.features.length; i++) {
      var f = geojson.features[i];
      var borough = f.properties.borough || 'Other';
      if (!byBorough[borough]) byBorough[borough] = [];
      byBorough[borough].push(f.properties.name);
    }

    // Sort boroughs, neighborhoods within each
    var boroughs = Object.keys(byBorough).sort();
    var html = '';

    for (var b = 0; b < boroughs.length; b++) {
      var bName = boroughs[b];
      var names = byBorough[bName].sort();
      html += '<div class="nb-borough-group" data-borough="' + bName + '">';
      html += '<div class="px-3 py-2 bg-gray-200 text-xs font-bold text-gray-700 sticky top-0">' + bName + ' (' + names.length + ')</div>';
      for (var n = 0; n < names.length; n++) {
        var name = names[n];
        var escapedName = name.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        var checked = _selectedNames[name] ? ' checked' : '';
        html += '<label class="nb-sidebar-item flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-yellow-50" data-name="' + escapedName + '">';
        html += '<input type="checkbox" class="nb-sidebar-cb accent-yellow-700"' + checked + ' onchange="toggleNeighborhoodMapItem(\'' + escapedName.replace(/'/g, "\\'") + '\', this.checked)">';
        html += '<span class="text-xs">' + name + '</span>';
        html += '</label>';
      }
      html += '</div>';
    }

    sidebar.innerHTML = html;
  }

  // ── Initialize map ──

  function initMap(geojson) {
    if (_map) {
      // Map already exists — just re-add layers after style change
      addLayers(geojson);
      return;
    }

    _map = new maplibregl.Map({
      container: 'nbMapContainer',
      style: STYLE_URLS.positron,
      center: [-73.97, 40.75],
      zoom: 10.5,
      minZoom: 9,
      maxZoom: 16,
    });

    _map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    _map.on('load', function () {
      _loaded = true;
      addLayers(geojson);
    });
  }

  function addLayers(geojson) {
    if (!_map || !_loaded) return;

    // Remove old layers/source if they exist
    try { if (_map.getLayer('nb-fill')) _map.removeLayer('nb-fill'); } catch (_) {}
    try { if (_map.getLayer('nb-fill-hover')) _map.removeLayer('nb-fill-hover'); } catch (_) {}
    try { if (_map.getLayer('nb-line')) _map.removeLayer('nb-line'); } catch (_) {}
    try { if (_map.getLayer('nb-label')) _map.removeLayer('nb-label'); } catch (_) {}
    try { if (_map.getSource('nb-source')) _map.removeSource('nb-source'); } catch (_) {}

    _map.addSource('nb-source', {
      type: 'geojson',
      data: geojson,
      generateId: true,
    });

    // Fill layer — all polygons
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
          _map.setFeatureState({ source: 'nb-source', id: hoveredId }, { hover: false });
        }
        hoveredId = e.features[0].id;
        _map.setFeatureState({ source: 'nb-source', id: hoveredId }, { hover: true });
      }
    });

    _map.on('mouseleave', 'nb-fill', function () {
      _map.getCanvas().style.cursor = '';
      if (hoveredId !== null) {
        _map.setFeatureState({ source: 'nb-source', id: hoveredId }, { hover: false });
        hoveredId = null;
      }
    });

    // Click to toggle selection
    _map.on('click', 'nb-fill', function (e) {
      if (e.features.length > 0) {
        var name = e.features[0].properties.name;
        var isSelected = !!_selectedNames[name];
        toggleNeighborhoodMapItem(name, !isSelected);
      }
    });

    // Restore selected state
    syncFeatureStates();
  }

  function syncFeatureStates() {
    if (!_map || !_loaded || !_geojsonData) return;
    for (var i = 0; i < _geojsonData.features.length; i++) {
      var name = _geojsonData.features[i].properties.name;
      _map.setFeatureState(
        { source: 'nb-source', id: i },
        { selected: !!_selectedNames[name] }
      );
    }
  }

  function updateSelectedCount() {
    var countEl = document.getElementById('nbMapSelectedCount');
    var count = Object.keys(_selectedNames).length;
    if (countEl) countEl.textContent = count + ' selected';
  }

  // ── Public API ──

  /**
   * openNeighborhoodMap(callback)
   *   callback: function({ selectedNeighborhoods: string[] })
   *   Single entry point — one button wires to this.
   */
  window.openNeighborhoodMap = function (callback) {
    _callback = callback || null;
    var modal = document.getElementById('neighborhoodMapModal');
    if (modal) modal.classList.remove('hidden');

    ensureMapLibre(function () {
      loadGeoJSON(function (geojson) {
        buildSidebar(geojson);
        initMap(geojson);
        // If map was already loaded, resize to fit container
        if (_map) {
          setTimeout(function () { _map.resize(); }, 100);
        }
      });
    });
  };

  window.closeNeighborhoodMap = function () {
    var modal = document.getElementById('neighborhoodMapModal');
    if (modal) modal.classList.add('hidden');
  };

  window.confirmNeighborhoodMapSelection = function () {
    // Return CANONICAL polygon names only — variant expansion happens in search query builder
    var selected = Object.keys(_selectedNames).sort();
    if (_callback) {
      _callback({ selectedNeighborhoods: selected });
    }
    window.closeNeighborhoodMap();
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

    // Sync map feature state
    if (_geojsonData) {
      for (var j = 0; j < _geojsonData.features.length; j++) {
        if (_geojsonData.features[j].properties.name === name) {
          if (_map && _loaded) {
            _map.setFeatureState(
              { source: 'nb-source', id: j },
              { selected: checked }
            );
          }
          break;
        }
      }
    }

    updateSelectedCount();
  };

  window.clearNeighborhoodMapSelection = function () {
    _selectedNames = {};
    // Uncheck all sidebar checkboxes
    var cbs = document.querySelectorAll('.nb-sidebar-cb');
    for (var i = 0; i < cbs.length; i++) {
      cbs[i].checked = false;
    }
    // Clear map feature states
    if (_geojsonData && _map && _loaded) {
      for (var j = 0; j < _geojsonData.features.length; j++) {
        _map.setFeatureState({ source: 'nb-source', id: j }, { selected: false });
      }
    }
    updateSelectedCount();
  };

  window.filterNeighborhoodMapSidebar = function (query) {
    var q = (query || '').toLowerCase().trim();
    var items = document.querySelectorAll('.nb-sidebar-item');
    var groups = document.querySelectorAll('.nb-borough-group');

    // Show/hide individual items
    for (var i = 0; i < items.length; i++) {
      var name = (items[i].getAttribute('data-name') || '').toLowerCase();
      items[i].style.display = (!q || name.includes(q)) ? '' : 'none';
    }

    // Show/hide borough headers (hide if all items hidden)
    for (var g = 0; g < groups.length; g++) {
      var visibleItems = groups[g].querySelectorAll('.nb-sidebar-item:not([style*="display: none"])');
      groups[g].style.display = (!q || visibleItems.length > 0) ? '' : 'none';
    }
  };

  window.switchNeighborhoodMapStyle = function (styleName) {
    if (!_map || !STYLE_URLS[styleName]) return;
    _loaded = false;
    _map.setStyle(STYLE_URLS[styleName]);
    _map.once('style.load', function () {
      _loaded = true;
      if (_geojsonData) addLayers(_geojsonData);
    });
  };

})();
