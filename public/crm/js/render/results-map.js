/**
 * results-map.js — Split-view results map with listing pins
 *
 * Shows a MapLibre GL map alongside search results. Each listing
 * with coordinates gets a pin. Clicking a pin highlights the listing card.
 * Clicking a card pans the map to that listing.
 *
 * Toggle: toggleResultsMap() — called from the toolbar map button.
 */

/* global maplibregl, listings, searchResultsState, getFilteredListings, showListingDetail */

(function () {
  'use strict';

  var _map = null;
  var _markers = [];
  var _isOpen = false;
  var _popup = null;
  var _centroids = null; // neighborhood → {lat, lng} fallback

  var STYLES = {
    positron: 'https://tiles.openfreemap.org/styles/positron',
    bright: 'https://tiles.openfreemap.org/styles/bright',
  };

  // Load neighborhood centroids for listings without coordinates
  (function loadCentroids() {
    var base = window.location.pathname.replace(/\/[^/]*$/, '');
    var url = (base.endsWith('/crm') ? '/geo/' : '../geo/') + 'rls-neighborhood-centroids.v1.json';
    fetch(url).then(function(r) { return r.ok ? r.json() : null; }).then(function(data) {
      if (data) _centroids = data;
    }).catch(function() {});
  })();

  // ── Ensure MapLibre is loaded ──
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
    script.onload = function () { cb(); };
    script.onerror = function () { console.error('[ResultsMap] MapLibre failed to load'); };
    document.head.appendChild(script);
  }

  // ── Build GeoJSON from current listings ──
  // Uses listing lat/lng if available, falls back to neighborhood centroid
  // with small random offset so pins don't stack on the exact same point.
  function buildGeoJSON(listings) {
    var features = [];
    for (var i = 0; i < listings.length; i++) {
      var l = listings[i];
      var lat = l.latitude || (l.geo && l.geo.lat);
      var lng = l.longitude || (l.geo && l.geo.lng);
      var approx = false;
      // Fallback: use neighborhood centroid if listing has no coordinates
      if ((!lat || !lng) && _centroids && l.neighborhood) {
        var centroid = _centroids[l.neighborhood] || _centroids[l.neighborhoodCanonical];
        if (centroid) {
          // Add small random offset (±0.002° ≈ 1 block) so pins don't stack
          lat = centroid.lat + (Math.random() - 0.5) * 0.004;
          lng = centroid.lng + (Math.random() - 0.5) * 0.004;
          approx = true;
        }
      }
      if (!lat || !lng) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          id: l.id,
          address: l.address + (l.unit ? ', ' + l.unit : ''),
          price: l.price || l.listPrice || 0,
          beds: l.beds || l.bedroomsTotal || 0,
          baths: l.baths || l.bathroomsFull || 0,
          status: l.status || '',
          photo: (l.images && l.images[0] && l.images[0].url) || '',
          neighborhood: l.neighborhood || '',
          listingCategory: l.listingCategory || '',
          approx: approx,
        },
      });
    }
    return { type: 'FeatureCollection', features: features };
  }

  // ── Format price ──
  function fmtPrice(p) {
    if (!p) return '$0';
    if (p >= 1000000) return '$' + (p / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (p >= 1000) return '$' + Math.round(p / 1000) + 'K';
    return '$' + p.toLocaleString();
  }

  // ── Create price marker element ──
  function createMarkerEl(price, status) {
    var el = document.createElement('div');
    el.className = 'results-map-pin';
    var bg = '#1a1a1a';
    if (status === 'COMING_SOON') bg = '#d97706';
    else if (status === 'ACTIVE_UNDER_CONTRACT') bg = '#7c3aed';
    el.style.cssText = 'background:' + bg + ';color:#fff;font-size:11px;font-weight:700;padding:4px 8px;border-radius:6px;cursor:pointer;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.25);border:2px solid #fff;transition:transform 0.15s ease;';
    el.textContent = fmtPrice(price);
    el.addEventListener('mouseenter', function () { el.style.transform = 'scale(1.15)'; });
    el.addEventListener('mouseleave', function () { el.style.transform = 'scale(1)'; });
    return el;
  }

  // ── Add markers ──
  function addMarkers(listings) {
    clearMarkers();
    var geojson = buildGeoJSON(listings);
    var bounds = new maplibregl.LngLatBounds();
    var hasBounds = false;

    for (var i = 0; i < geojson.features.length; i++) {
      var f = geojson.features[i];
      var coords = f.geometry.coordinates;
      var p = f.properties;
      var el = createMarkerEl(p.price, p.status);

      var marker = new maplibregl.Marker({ element: el })
        .setLngLat(coords)
        .addTo(_map);

      // Click: show popup + highlight card
      (function (feat, mk) {
        el.addEventListener('click', function () {
          showPopup(feat);
          highlightCard(feat.properties.id);
        });
      })(f, marker);

      _markers.push(marker);
      bounds.extend(coords);
      hasBounds = true;
    }

    if (hasBounds) {
      _map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 500 });
    }
  }

  function clearMarkers() {
    for (var i = 0; i < _markers.length; i++) {
      _markers[i].remove();
    }
    _markers = [];
    if (_popup) { _popup.remove(); _popup = null; }
  }

  // ── Popup on pin click ──
  function showPopup(feature) {
    if (_popup) _popup.remove();
    var p = feature.properties;
    var photoHtml = p.photo
      ? '<img src="' + p.photo + '" style="width:100%;height:100px;object-fit:cover;border-radius:6px 6px 0 0;" loading="lazy">'
      : '<div style="width:100%;height:60px;background:#f3f4f6;border-radius:6px 6px 0 0;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:20px;">&#128247;</div>';
    var html = '<div style="width:220px;font-family:system-ui,sans-serif;">'
      + photoHtml
      + '<div style="padding:8px 10px;">'
      + '<div style="font-weight:700;font-size:14px;margin-bottom:2px;">' + fmtPrice(p.price) + (p.listingCategory === 'rental' ? '/mo' : '') + '</div>'
      + '<div style="font-size:11px;color:#6b7280;margin-bottom:4px;">' + (p.address || 'Address Undisclosed') + '</div>'
      + '<div style="font-size:11px;color:#374151;">' + p.beds + ' bd &middot; ' + p.baths + ' ba' + (p.neighborhood ? ' &middot; ' + p.neighborhood : '') + '</div>'
      + '<button onclick="showListingDetail(\'' + String(p.id).replace(/'/g, "\\'") + '\')" style="margin-top:6px;width:100%;padding:5px;background:#111827;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">View Details</button>'
      + '</div></div>';

    _popup = new maplibregl.Popup({ closeButton: true, maxWidth: '240px', offset: [0, -10] })
      .setLngLat(feature.geometry.coordinates)
      .setHTML(html)
      .addTo(_map);
  }

  // ── Highlight card in results ──
  function highlightCard(listingId) {
    // Remove previous highlights
    document.querySelectorAll('.results-map-highlight').forEach(function (el) {
      el.classList.remove('results-map-highlight');
    });
    // Find and highlight the card
    var card = document.querySelector('[data-listing-id="' + listingId + '"]') ||
               document.querySelector('[data-lid="' + listingId + '"]');
    if (card) {
      card.classList.add('results-map-highlight');
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // ── Init map ──
  function initMap() {
    var container = document.getElementById('resultsMapContainer');
    if (!container) return;

    if (_map) {
      _map.resize();
      return;
    }

    _map = new maplibregl.Map({
      container: 'resultsMapContainer',
      style: STYLES.bright,
      center: [-73.96, 40.755],
      zoom: 11.5,
      minZoom: 9,
      maxZoom: 18,
    });

    _map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    _map.on('load', function () {
      addNeighborhoodPolygons();
      refreshMapPins();
    });
  }

  // ── Neighborhood polygon overlays (click-to-select) ──
  var _neighborhoodLayerAdded = false;
  var _selectedSlugs = {};       // { slug: true } — tracks which neighborhoods are selected
  var _geojsonSource = null;     // cached for filtering

  function addNeighborhoodPolygons() {
    if (_neighborhoodLayerAdded || !_map) return;

    var geojson = (typeof window._EMBEDDED_GEOJSON !== 'undefined') ? window._EMBEDDED_GEOJSON : null;

    if (geojson) {
      _addPolygonLayers(geojson);
    } else {
      var geoBase = window.location.pathname.replace(/\/[^/]*$/, '');
      var geoUrl = geoBase.endsWith('/crm') ? '/geo/rls-neighborhoods.v1.min.geojson' : '../geo/rls-neighborhoods.v1.min.geojson';
      fetch(geoUrl).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
        if (data) _addPolygonLayers(data);
      }).catch(function () { /* non-fatal */ });
    }
  }

  function _addPolygonLayers(geojson) {
    if (!_map || _neighborhoodLayerAdded) return;
    _neighborhoodLayerAdded = true;
    _geojsonSource = geojson;

    _map.addSource('neighborhoods', {
      type: 'geojson',
      data: geojson,
      promoteId: 'slug',
    });

    // Invisible hit-test layer — detects clicks anywhere on the map to identify neighborhood
    _map.addLayer({
      id: 'neighborhood-hit',
      type: 'fill',
      source: 'neighborhoods',
      paint: {
        'fill-color': 'transparent',
        'fill-opacity': 0,
      },
    });

    // Selected fill — only visible for selected neighborhoods (feature-state driven)
    _map.addLayer({
      id: 'neighborhood-fill',
      type: 'fill',
      source: 'neighborhoods',
      paint: {
        'fill-color': [
          'match', ['get', 'borough'],
          'Manhattan', 'rgba(37, 99, 235, 0.12)',
          'Brooklyn', 'rgba(16, 185, 129, 0.12)',
          'Queens', 'rgba(245, 158, 11, 0.12)',
          'Bronx', 'rgba(239, 68, 68, 0.12)',
          'Staten Island', 'rgba(139, 92, 246, 0.12)',
          'rgba(107, 114, 128, 0.08)'
        ],
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 1,
          ['boolean', ['feature-state', 'hover'], false], 0.5,
          0
        ],
      },
    });

    // Selected borders — only visible for selected neighborhoods
    _map.addLayer({
      id: 'neighborhood-borders',
      type: 'line',
      source: 'neighborhoods',
      paint: {
        'line-color': [
          'match', ['get', 'borough'],
          'Manhattan', '#2563EB',
          'Brooklyn', '#10B981',
          'Queens', '#F59E0B',
          'Bronx', '#EF4444',
          'Staten Island', '#8B5CF6',
          '#6B7280'
        ],
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          10, 1,
          13, 2,
          16, 2.5
        ],
        'line-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 1,
          0
        ],
      },
    });

    // Selected labels — name shown only for selected neighborhoods
    _map.addLayer({
      id: 'neighborhood-labels',
      type: 'symbol',
      source: 'neighborhoods',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': [
          'interpolate', ['linear'], ['zoom'],
          10, 10,
          13, 13,
          16, 15
        ],
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        'text-anchor': 'center',
        'text-max-width': 8,
      },
      paint: {
        'text-color': [
          'match', ['get', 'borough'],
          'Manhattan', '#1D4ED8',
          'Brooklyn', '#059669',
          'Queens', '#D97706',
          'Bronx', '#DC2626',
          'Staten Island', '#7C3AED',
          '#374151'
        ],
        'text-halo-color': 'rgba(255, 255, 255, 0.9)',
        'text-halo-width': 1.5,
        'text-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 1,
          0
        ],
      },
    });

    // Hover — subtle preview of boundary before clicking
    var _hoveredId = null;
    _map.on('mousemove', 'neighborhood-hit', function (e) {
      if (e.features.length > 0) {
        if (_hoveredId !== null) {
          _map.setFeatureState({ source: 'neighborhoods', id: _hoveredId }, { hover: false });
        }
        _hoveredId = e.features[0].id;
        _map.setFeatureState({ source: 'neighborhoods', id: _hoveredId }, { hover: true });
        _map.getCanvas().style.cursor = 'pointer';
      }
    });
    _map.on('mouseleave', 'neighborhood-hit', function () {
      if (_hoveredId !== null) {
        _map.setFeatureState({ source: 'neighborhoods', id: _hoveredId }, { hover: false });
      }
      _hoveredId = null;
      _map.getCanvas().style.cursor = '';
    });

    // Click — toggle select/deselect a neighborhood polygon
    _map.on('click', 'neighborhood-hit', function (e) {
      if (e.features.length === 0) return;

      var slug = e.features[0].id;
      var name = e.features[0].properties.name;
      var borough = e.features[0].properties.borough;

      if (_selectedSlugs[slug]) {
        // Deselect
        delete _selectedSlugs[slug];
        _map.setFeatureState({ source: 'neighborhoods', id: slug }, { selected: false });
      } else {
        // Select
        _selectedSlugs[slug] = true;
        _map.setFeatureState({ source: 'neighborhoods', id: slug }, { selected: true });
      }

      // Show popup with listing count
      var mapListings = (typeof getFilteredListings === 'function') ? getFilteredListings(true) : [];
      var count = mapListings.filter(function (l) { return l.neighborhood === name; }).length;
      var isSelected = !!_selectedSlugs[slug];

      new maplibregl.Popup({ closeButton: true, maxWidth: '220px' })
        .setLngLat(e.lngLat)
        .setHTML(
          '<div style="font-family:system-ui,sans-serif;padding:4px;">' +
          '<div style="font-weight:700;font-size:13px;">' + name + '</div>' +
          '<div style="font-size:11px;color:#6b7280;">' + borough + '</div>' +
          '<div style="font-size:12px;margin-top:4px;font-weight:600;">' + count + ' listing' + (count !== 1 ? 's' : '') + '</div>' +
          '<div style="font-size:11px;margin-top:4px;color:' + (isSelected ? '#2563EB' : '#9CA3AF') + ';font-weight:600;">' +
          (isSelected ? '<i class="fas fa-check-circle"></i> Selected' : 'Deselected') + '</div>' +
          '</div>'
        )
        .addTo(_map);
    });

    // Sync with search form neighborhood tags if they exist
    _syncSelectedFromSearch();
  }

  // ── Sync selected polygons from search form neighborhood selections ──
  function _syncSelectedFromSearch() {
    if (!_map || !_neighborhoodLayerAdded || !_geojsonSource) return;

    // Get currently selected neighborhoods from search form
    var searchNeighborhoods = [];
    if (typeof getSelectedNeighborhoods === 'function' && typeof _resolveActiveNeighborhoodTagsId === 'function') {
      var tagsId = _resolveActiveNeighborhoodTagsId();
      searchNeighborhoods = getSelectedNeighborhoods(tagsId);
    }

    // Clear all selections first
    Object.keys(_selectedSlugs).forEach(function (slug) {
      _map.setFeatureState({ source: 'neighborhoods', id: slug }, { selected: false });
    });
    _selectedSlugs = {};

    // Select polygons that match search neighborhoods
    if (searchNeighborhoods.length > 0 && _geojsonSource.features) {
      _geojsonSource.features.forEach(function (f) {
        if (searchNeighborhoods.indexOf(f.properties.name) !== -1) {
          var slug = f.properties.slug;
          _selectedSlugs[slug] = true;
          _map.setFeatureState({ source: 'neighborhoods', id: slug }, { selected: true });
        }
      });
    }
  }

  // Expose sync so search form can trigger it when neighborhoods change
  window.syncResultsMapPolygons = function () {
    if (_isOpen && _map && _neighborhoodLayerAdded) {
      _syncSelectedFromSearch();
    }
  };

  // ── Refresh pins from current filtered listings ──
  function refreshMapPins() {
    if (!_map || !_isOpen) return;
    var mapListings = (typeof getFilteredListings === 'function')
      ? getFilteredListings(true) // skipPagination = true to get ALL results
      : (searchResultsState && searchResultsState.filteredListings) || [];
    addMarkers(mapListings);
  }

  // ── Toggle map view ──
  window.toggleResultsMap = function () {
    _isOpen = !_isOpen;
    var wrapper = document.getElementById('resultsMapWrapper');
    var toggleBtn = document.getElementById('resultsMapToggleBtn');

    if (!wrapper) return;

    if (_isOpen) {
      // Show map panel above results
      wrapper.style.cssText = 'display:block; width:100%; height:500px; position:relative; border:1px solid #e5e7eb; border-radius:12px; margin-bottom:16px; overflow:hidden;';
      if (toggleBtn) {
        toggleBtn.classList.add('bg-blue-100', 'text-blue-700');
        toggleBtn.classList.remove('text-gray-500');
      }

      // Move wrapper before resultsContainer for above-results layout
      var resultsContainer = document.getElementById('resultsContainer');
      if (resultsContainer && wrapper.parentElement) {
        wrapper.parentElement.insertBefore(wrapper, resultsContainer);
      }

      ensureMapLibre(function () {
        // Set container to fill wrapper
        var container = document.getElementById('resultsMapContainer');
        if (container) container.style.cssText = 'width:100%; height:100%;';
        setTimeout(function () {
          initMap();
          if (_map) {
            _map.resize();
            refreshMapPins();
          }
        }, 150);
      });
    } else {
      // Hide map
      wrapper.style.display = 'none';
      if (toggleBtn) {
        toggleBtn.classList.remove('bg-blue-100', 'text-blue-700');
        toggleBtn.classList.add('text-gray-500');
      }
      clearMarkers();
    }
  };

  // ── Pan to listing (called when clicking a card) ──
  window.panToListing = function (listingId) {
    if (!_map || !_isOpen) return;
    var panListings = (searchResultsState && searchResultsState.filteredListings) || [];
    var l = panListings.find(function (x) { return x.id === listingId || x.lid === listingId; });
    if (!l) return;
    var lat = l.latitude || (l.geo && l.geo.lat);
    var lng = l.longitude || (l.geo && l.geo.lng);
    if (lat && lng) {
      _map.flyTo({ center: [lng, lat], zoom: 15, duration: 800 });
      // Highlight the marker
      for (var i = 0; i < _markers.length; i++) {
        var el = _markers[i].getElement();
        el.style.transform = 'scale(1)';
        el.style.zIndex = '1';
      }
    }
  };

  // ── Expose refresh for re-render after search ──
  window.refreshResultsMap = function () {
    if (_isOpen && _map) {
      refreshMapPins();
    }
  };

  // ── Is map open? ──
  window.isResultsMapOpen = function () { return _isOpen; };

})();
