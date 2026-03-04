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

  // ── Debug banner ── (temporary — shows step-by-step progress on the modal)
  var _debugLines = [];
  function _dbg(msg) {
    console.log('[NB-MAP] ' + msg);
    _debugLines.push(new Date().toLocaleTimeString() + ' — ' + msg);
    var el = document.getElementById('nbDebugBanner');
    if (el) el.textContent = _debugLines.slice(-6).join(' | ');
  }

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
    if (typeof maplibregl !== 'undefined') { _dbg('MapLibre already loaded'); return cb(); }
    _dbg('Loading MapLibre from CDN...');
    if (!document.querySelector('link[href*="maplibre-gl"]')) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }
    var script = document.createElement('script');
    script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
    script.onload = function () { _dbg('MapLibre loaded OK'); cb(); };
    script.onerror = function () { _dbg('ERROR: MapLibre failed to load'); showMapError(); };
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
    if (_geojsonData) { _dbg('GeoJSON cached (' + _geojsonData.features.length + ' features)'); return cb(_geojsonData); }
    var url = resolveGeoBase() + 'rls-neighborhoods.v1.min.geojson';
    _dbg('Fetching GeoJSON: ' + url);
    fetch(url)
      .then(function (r) {
        _dbg('GeoJSON response: ' + r.status);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        _dbg('GeoJSON parsed: ' + data.features.length + ' features');
        _geojsonData = data;
        loadAliases(function () { cb(data); });
      })
      .catch(function (err) {
        _dbg('ERROR fetching GeoJSON: ' + (err.message || err));
        showMapError();
      });
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
    if (!listEl) { _dbg('ERROR: #nbMapList not found'); return; }

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
    _dbg('Sidebar built: ' + boroughs.length + ' boroughs');

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
    if (_map) {
      _dbg('Map reused (already exists)');
      rehydrateSelection();
      return;
    }

    var container = document.getElementById('nbMapContainer');
    if (!container) { _dbg('ERROR: #nbMapContainer not found'); return; }
    var rect = container.getBoundingClientRect();
    _dbg('Container size: ' + Math.round(rect.width) + 'x' + Math.round(rect.height));

    if (rect.width < 10 || rect.height < 10) {
      _dbg('WARNING: Container too small — delaying map init');
      setTimeout(function () { initMap(geojson); }, 300);
      return;
    }

    try {
      _map = new maplibregl.Map({
        container: 'nbMapContainer',
        style: STYLES.bright,
        center: [-73.96, 40.755],
        zoom: 11.5,
        minZoom: 9,
        maxZoom: 16,
      });
      _dbg('Map created OK');
    } catch (err) {
      _dbg('ERROR creating map: ' + err.message);
      showMapError();
      return;
    }

    _map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    // Catch MapLibre errors
    _map.on('error', function (e) {
      _dbg('Map error: ' + (e.error ? e.error.message : e.message || 'unknown'));
    });

    _map.on('load', function () {
      _dbg('Map style loaded — adding layers');
      _loaded = true;
      addLayers(geojson);
    });
    _map.once('idle', function () {
      if (!_loaded) {
        _dbg('Map idle (fallback) — adding layers');
        _loaded = true;
        addLayers(geojson);
      }
    });
  }

  function addLayers(geojson) {
    if (!_map || !_loaded) { _dbg('addLayers skipped: map=' + !!_map + ' loaded=' + _loaded); return; }

    try {
      try { if (_map.getLayer('nb-fill')) _map.removeLayer('nb-fill'); } catch (_) {}
      try { if (_map.getLayer('nb-line')) _map.removeLayer('nb-line'); } catch (_) {}
      try { if (_map.getLayer('nb-label')) _map.removeLayer('nb-label'); } catch (_) {}
      try { if (_map.getSource('nb-source')) _map.removeSource('nb-source'); } catch (_) {}

      _map.addSource('nb-source', {
        type: 'geojson',
        data: geojson,
        promoteId: 'slug',
      });

      // Find first symbol layer so polygons render BELOW labels but ABOVE land
      var firstSymbol = null;
      var layers = _map.getStyle().layers;
      if (layers) {
        for (var li = 0; li < layers.length; li++) {
          if (layers[li].type === 'symbol') { firstSymbol = layers[li].id; break; }
        }
      }
      _dbg('Insert before: ' + (firstSymbol || 'top'));

      _map.addLayer({
        id: 'nb-fill', type: 'fill', source: 'nb-source',
        paint: {
          'fill-color': GOLD,
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 0.45,
            ['boolean', ['feature-state', 'hover'], false], 0.30,
            0.18,
          ],
        },
      }, firstSymbol || undefined);

      _map.addLayer({
        id: 'nb-line', type: 'line', source: 'nb-source',
        paint: {
          'line-color': GOLD,
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1.5],
          'line-opacity': 1,
        },
      }, firstSymbol || undefined);

      _map.addLayer({
        id: 'nb-label', type: 'symbol', source: 'nb-source',
        layout: { 'text-field': ['get', 'name'], 'text-size': 12, 'text-font': ['Open Sans Bold'], 'text-anchor': 'center', 'text-allow-overlap': false },
        paint: { 'text-color': '#5a3800', 'text-halo-color': '#fff', 'text-halo-width': 2 },
      });

      _dbg('Layers added OK (' + geojson.features.length + ' polygons)');
    } catch (err) {
      _dbg('ERROR adding layers: ' + err.message);
      return;
    }

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
    if (!modal) { _dbg('ERROR: #neighborhoodMapModal not found in DOM!'); return; }

    // Inject debug banner if not already present
    if (!document.getElementById('nbDebugBanner')) {
      var banner = document.createElement('div');
      banner.id = 'nbDebugBanner';
      banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:100001;background:#111;color:#0f0;font-family:monospace;font-size:10px;padding:4px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;';
      modal.appendChild(banner);
    }

    modal.classList.remove('hidden');
    modal.style.display = 'block';
    _dbg('Modal shown');
  }

  function hideModal() {
    _dbg('hideModal called');
    console.trace('[NB-MAP] hideModal trace');
    var modal = document.getElementById('neighborhoodMapModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }

  // ── Public API ──

  window.openNeighborhoodMap = function (callback) {
    _debugLines = [];
    _dbg('openNeighborhoodMap called');
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
    _dbg('closeNeighborhoodMap called');
    hideModal();
  };

  window.confirmNeighborhoodMapSelection = function () {
    var selected = Object.keys(_selectedNames).sort();
    _dbg('confirmSelection: ' + selected.length + ' selected');
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
    _dbg('Switching style to: ' + styleName);
    _loaded = false;
    _map.setStyle(STYLES[styleName]);
    _map.once('style.load', function () {
      _loaded = true;
      _dbg('Style loaded — re-adding layers');
      if (_geojsonData) addLayers(_geojsonData);
    });
  };

})();
