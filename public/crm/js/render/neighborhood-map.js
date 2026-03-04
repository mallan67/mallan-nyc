/**
 * neighborhood-map.js — MapLibre GL neighborhood selector
 *
 * Entry: openNeighborhoodMap(callback)
 *   callback receives: { selectedNeighborhoods: string[] }
 *
 * Uses promoteId:'slug' for stable feature IDs (never generateId).
 */

/* global maplibregl, activeSearchCriteria */

(function () {
  'use strict';

  var _map = null;
  var _geojsonData = null;
  var _selectedNames = {};
  var _callback = null;
  var _loaded = false;
  var _aliasMap = null;
  var _reverseAliases = {};

  function resolveGeoBase() {
    var base = window.location.pathname.replace(/\/[^/]*$/, '');
    return base.endsWith('/crm') ? '/geo/' : '../geo/';
  }

  var STYLES = {
    positron: 'https://tiles.openfreemap.org/styles/positron',
    bright:   'https://tiles.openfreemap.org/styles/bright',
    liberty:  'https://tiles.openfreemap.org/styles/liberty',
  };

  var GOLD = '#B8860B';

  // ── Load MapLibre ──

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

  // ── Load data ──

  function loadAliases(cb) {
    if (_aliasMap) return cb();
    fetch(resolveGeoBase() + 'neighborhood-aliases.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.aliases) {
          _aliasMap = data.aliases;
          _reverseAliases = {};
          Object.keys(_aliasMap).forEach(function (v) {
            var val = _aliasMap[v];
            if (!val) return;
            (Array.isArray(val) ? val : [val]).forEach(function (p) {
              if (!_reverseAliases[p]) _reverseAliases[p] = [];
              _reverseAliases[p].push(v);
            });
          });
        }
        cb();
      })
      .catch(function () { cb(); });
  }

  function loadGeoJSON(cb) {
    if (_geojsonData) return cb(_geojsonData);
    fetch(resolveGeoBase() + 'rls-neighborhoods.v1.min.geojson')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) { _geojsonData = data; loadAliases(function () { cb(data); }); })
      .catch(function () { showMapError(); });
  }

  function showMapError() {
    var e = document.getElementById('nbMapError');
    var m = document.getElementById('nbMapContainer');
    if (e) e.style.display = 'flex';
    if (m) m.style.display = 'none';
  }

  // ── Sidebar ──

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
        var esc = nName.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        var checked = _selectedNames[nName] ? ' checked' : '';
        html += '<div class="nb-item nb-sidebar-item" data-name="' + esc + '">';
        html += '<input type="checkbox" class="nb-sidebar-cb"' + checked + ' data-nb="' + esc + '">';
        html += '<div class="nb-item-name">' + nName + '<div class="nb-item-borough">' + bName + '</div></div>';
        html += '<div class="nb-item-chevron">&#8250;</div></div>';
      }
      html += '</details>';
    }

    if (!boroughs.length && ft) {
      html = '<div style="padding:20px;text-align:center;font-size:12px;color:rgba(17,24,39,0.4);">No matches for &ldquo;' + ft.replace(/</g, '&lt;') + '&rdquo;</div>';
    }

    listEl.innerHTML = html;

    // Event delegation — single handler for all sidebar clicks
    if (!listEl._bound) {
      listEl.addEventListener('click', function (e) {
        var item = e.target.closest('.nb-sidebar-item');
        if (!item) return;
        var cb = item.querySelector('input[type="checkbox"]');
        if (!cb) return;
        var name = cb.getAttribute('data-nb');
        if (!name) return;
        if (e.target.tagName !== 'INPUT') cb.checked = !cb.checked;
        toggleItem(name, cb.checked);
      });
      listEl._bound = true;
    }

    var clearBtn = document.getElementById('nbMapClearBtn');
    if (clearBtn) clearBtn.style.display = Object.keys(_selectedNames).length ? '' : 'none';
  }

  // ── Selection state ──

  function toggleItem(name, checked) {
    if (checked) { _selectedNames[name] = true; } else { delete _selectedNames[name]; }

    // Sync sidebar checkbox
    var items = document.querySelectorAll('.nb-sidebar-item');
    for (var i = 0; i < items.length; i++) {
      if (items[i].getAttribute('data-name') === name) {
        var cb = items[i].querySelector('input[type="checkbox"]');
        if (cb) cb.checked = checked;
      }
    }

    // Sync map polygon via feature-state (slug id)
    if (_geojsonData && _map && _loaded && _map.getSource('nb-source')) {
      for (var j = 0; j < _geojsonData.features.length; j++) {
        var f = _geojsonData.features[j];
        if (f.properties.name === name && f.properties.slug) {
          try { _map.setFeatureState({ source: 'nb-source', id: f.properties.slug }, { selected: checked }); } catch (_) {}
          break;
        }
      }
    }

    updateCount();
    var clearBtn = document.getElementById('nbMapClearBtn');
    if (clearBtn) clearBtn.style.display = Object.keys(_selectedNames).length ? '' : 'none';
  }

  function updateCount() {
    var el = document.getElementById('nbMapSelectedCount');
    if (el) el.textContent = Object.keys(_selectedNames).length + ' selected';
  }

  // ── Rehydrate selection after map/style changes ──

  function rehydrateSelection() {
    if (!_map || !_loaded || !_geojsonData) return;
    if (!_map.getSource('nb-source')) { addLayers(_geojsonData); return; }
    try {
      for (var i = 0; i < _geojsonData.features.length; i++) {
        var f = _geojsonData.features[i];
        if (!f.properties.slug) continue;
        _map.setFeatureState(
          { source: 'nb-source', id: f.properties.slug },
          { selected: !!_selectedNames[f.properties.name] }
        );
      }
    } catch (_) {}
  }

  // ── Initialize from search state ──

  function initFromSearchState() {
    if (typeof activeSearchCriteria !== 'undefined' && activeSearchCriteria &&
        activeSearchCriteria._neighborhoodCanonicals &&
        activeSearchCriteria._neighborhoodCanonicals.length > 0) {
      _selectedNames = {};
      activeSearchCriteria._neighborhoodCanonicals.forEach(function (n) { _selectedNames[n] = true; });
    }
  }

  // ── Map setup ──

  function initMap(geojson) {
    if (_map) { rehydrateSelection(); return; }

    _map = new maplibregl.Map({
      container: 'nbMapContainer',
      style: STYLES.bright,
      center: [-73.96, 40.755],
      zoom: 11.5,
      minZoom: 9,
      maxZoom: 16,
    });

    _map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    _map.on('load', function () { _loaded = true; addLayers(geojson); });
    _map.once('idle', function () { if (!_loaded) { _loaded = true; addLayers(geojson); } });
  }

  function addLayers(geojson) {
    if (!_map || !_loaded) return;

    try { if (_map.getLayer('nb-fill')) _map.removeLayer('nb-fill'); } catch (_) {}
    try { if (_map.getLayer('nb-line')) _map.removeLayer('nb-line'); } catch (_) {}
    try { if (_map.getLayer('nb-label')) _map.removeLayer('nb-label'); } catch (_) {}
    try { if (_map.getSource('nb-source')) _map.removeSource('nb-source'); } catch (_) {}

    _map.addSource('nb-source', {
      type: 'geojson',
      data: geojson,
      promoteId: 'slug',
    });

    _map.addLayer({
      id: 'nb-fill', type: 'fill', source: 'nb-source',
      paint: {
        'fill-color': GOLD,
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 0.30,
          ['boolean', ['feature-state', 'hover'], false], 0.16,
          0.08,
        ],
      },
    });

    _map.addLayer({
      id: 'nb-line', type: 'line', source: 'nb-source',
      paint: {
        'line-color': GOLD,
        'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 1],
        'line-opacity': 0.7,
      },
    });

    _map.addLayer({
      id: 'nb-label', type: 'symbol', source: 'nb-source',
      layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-anchor': 'center', 'text-allow-overlap': false },
      paint: { 'text-color': '#333', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
    });

    // Hover
    var hoveredId = null;
    _map.on('mousemove', 'nb-fill', function (e) {
      _map.getCanvas().style.cursor = 'pointer';
      if (e.features.length) {
        if (hoveredId !== null) try { _map.setFeatureState({ source: 'nb-source', id: hoveredId }, { hover: false }); } catch (_) {}
        hoveredId = e.features[0].id;
        try { _map.setFeatureState({ source: 'nb-source', id: hoveredId }, { hover: true }); } catch (_) {}
      }
    });
    _map.on('mouseleave', 'nb-fill', function () {
      _map.getCanvas().style.cursor = '';
      if (hoveredId !== null) { try { _map.setFeatureState({ source: 'nb-source', id: hoveredId }, { hover: false }); } catch (_) {} hoveredId = null; }
    });

    // Click to select
    _map.on('click', 'nb-fill', function (e) {
      if (e.features.length) {
        var name = e.features[0].properties.name;
        toggleItem(name, !_selectedNames[name]);
      }
    });

    rehydrateSelection();
  }

  // ── Modal show/hide ──

  function showModal() {
    var modal = document.getElementById('neighborhoodMapModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.style.display = 'block';
  }

  function hideModal() {
    var modal = document.getElementById('neighborhoodMapModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }

  // ── Public API ──

  window.openNeighborhoodMap = function (callback) {
    _callback = callback || null;
    initFromSearchState();
    showModal();

    ensureMapLibre(function () {
      loadGeoJSON(function (geojson) {
        buildSidebar(geojson);
        updateCount();
        requestAnimationFrame(function () {
          initMap(geojson);
          if (_map) {
            _map.resize();
            setTimeout(function () { _map.resize(); rehydrateSelection(); }, 200);
            setTimeout(function () { _map.resize(); }, 500);
          }
        });
      });
    });
  };

  window.closeNeighborhoodMap = function () {
    hideModal();
  };

  window.confirmNeighborhoodMapSelection = function () {
    var selected = Object.keys(_selectedNames).sort();
    if (!selected.length) {
      if (typeof showToast === 'function') showToast('No neighborhoods selected', 'warning');
      return;
    }
    if (_callback) {
      try { _callback({ selectedNeighborhoods: selected }); }
      catch (err) {
        console.error('[NB-MAP] callback error:', err);
        if (typeof showToast === 'function') showToast('Error: ' + err.message, 'error');
      }
    }
    hideModal();
  };

  window.toggleNeighborhoodMapItem = function (name, checked) {
    toggleItem(name, checked);
  };

  window.clearNeighborhoodMapSelection = function () {
    _selectedNames = {};
    document.querySelectorAll('.nb-sidebar-cb').forEach(function (cb) { cb.checked = false; });
    if (_geojsonData && _map && _loaded && _map.getSource('nb-source')) {
      try {
        for (var j = 0; j < _geojsonData.features.length; j++) {
          var slug = _geojsonData.features[j].properties.slug;
          if (slug) _map.setFeatureState({ source: 'nb-source', id: slug }, { selected: false });
        }
      } catch (_) {}
    }
    updateCount();
    var clearBtn = document.getElementById('nbMapClearBtn');
    if (clearBtn) clearBtn.style.display = 'none';
  };

  window.filterNeighborhoodMapSidebar = function (query) {
    if (_geojsonData) buildSidebar(_geojsonData, query);
  };

  window.switchNeighborhoodMapStyle = function (styleName) {
    if (!_map || !STYLES[styleName]) return;
    _loaded = false;
    _map.setStyle(STYLES[styleName]);
    _map.once('style.load', function () {
      _loaded = true;
      if (_geojsonData) addLayers(_geojsonData);
    });
  };

})();
