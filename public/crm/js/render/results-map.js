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
  var _clusterMarkers = [];  // cluster count bubbles
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
  // with random offset spread across the neighborhood area so pins don't stack.
  function buildGeoJSON(listings) {
    var features = [];
    var _unplaceable = 0;
    // Track how many listings per neighborhood centroid to spiral-spread them
    var centroidCounts = {};

    for (var i = 0; i < listings.length; i++) {
      var l = listings[i];
      var lat = l.latitude || (l.geo && l.geo.lat);
      var lng = l.longitude || (l.geo && l.geo.lng);
      var approx = false;

      // Fallback: use neighborhood centroid if listing has no coordinates
      if ((!lat || !lng) && _centroids && l.neighborhood) {
        var centroid = _centroids[l.neighborhood] || _centroids[l.neighborhoodCanonical];
        if (centroid) {
          // Spiral offset: each listing gets a unique position near the centroid.
          // Radius kept tight (~2-3 blocks max) to stay on land.
          var key = l.neighborhood;
          if (!centroidCounts[key]) centroidCounts[key] = 0;
          var idx = centroidCounts[key]++;
          var angle = idx * 2.399963; // golden angle for even spread
          // Max radius ~0.005° ≈ 2-3 blocks — tight enough to stay on land
          var radius = 0.001 + Math.sqrt(idx) * 0.0005;
          if (radius > 0.005) radius = 0.005; // hard cap
          lat = centroid.lat + radius * Math.cos(angle);
          lng = centroid.lng + radius * Math.sin(angle);
          approx = true;
        }
      }
      // A LISTING THE MAP CANNOT PLACE IS COUNTED, NOT JUST SKIPPED.
      //
      // A listing with no coordinates and no resolvable neighbourhood centroid
      // is dropped here — correctly, because inventing a position for it would
      // be worse. But dropping it silently means the map shows fewer pins than
      // the search found and says nothing, so a broker reading the map as the
      // geography of their results is reading an incomplete picture presented
      // as a complete one.
      //
      // The count is recorded so the surface can state it. Placement is still
      // refused; only the silence is.
      if (!lat || !lng) { _unplaceable++; continue; }
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          id: l.id,
          address: l.address + (l.unit ? ', ' + l.unit : ''),
          // UNKNOWN IS PRESERVED, NOT ZEROED.
          //
          // These read `l.price || l.listPrice || 0` and friends. The mapper
          // deliberately returns null for an absent price, bed or bath count —
          // "Absent/unparsable is never silently zero" — and this turned every
          // one of those nulls straight back into 0, so an unknown listing
          // rendered as "$0" and "0 bd · 0 ba" on the map. That is the exact
          // defect removed from the grid and the dashboard, still live here.
          //
          // `||` is also the wrong operator even for values that ARE present: a
          // real 0-bedroom studio is falsy and fell through to the next branch.
          // The middle keys were dead regardless — no mapper in this repo emits
          // listPrice, bedroomsTotal or bathroomsFull.
          price: l.price != null ? l.price : null,
          beds: l.beds != null ? l.beds : null,
          baths: l.baths != null ? l.baths : null,
          // 'UNKNOWN' is the mapper's deliberate, readable signal. Collapsing it
          // to '' discarded the one token that says "we do not know".
          status: l.status || 'UNKNOWN',
          photo: (l.images && l.images[0] && l.images[0].url) || '',
          neighborhood: l.neighborhood || '',
          listingCategory: l.listingCategory || '',
          approx: approx,
        },
      });
    }
    // Published so the map surface can say how many results it could not place.
    if (typeof searchResultsState !== 'undefined' && searchResultsState) {
      searchResultsState.mapUnplaceableCount = _unplaceable;
    }
    // Stated on the map itself, not only in the console: a broker reading the
    // map is the person who needs to know it is missing pins.
    var _coverageEl = (typeof document !== 'undefined')
      ? document.getElementById('resultsMapCoverageNote') : null;
    if (_coverageEl) {
      if (_unplaceable > 0) {
        _coverageEl.textContent = _unplaceable + ' of ' + listings.length +
          ' listings could not be placed on the map and are not shown as pins.';
        _coverageEl.style.display = '';
      } else {
        _coverageEl.textContent = '';
        _coverageEl.style.display = 'none';
      }
    }
    if (_unplaceable > 0) {
      console.warn('[Map] ' + _unplaceable + ' listing(s) could not be placed: no coordinates and no resolvable neighbourhood centroid. The map is showing fewer pins than the search returned.');
    }
    return { type: 'FeatureCollection', features: features };
  }

  // ── Format price ──
  function fmtPrice(p) {
    // `!p` was true for null, undefined, NaN, '' AND a real 0 — all five became
    // "$0". Unknown and free are opposite facts; a real $0 is still a real fact.
    if (p === null || p === undefined || p === '') return '—';
    var _n = Number(p);
    if (isNaN(_n)) return '—';
    if (_n === 0) return '$0';
    if (p >= 1000000) return '$' + (p / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (p >= 1000) return '$' + Math.round(p / 1000) + 'K';
    return '$' + p.toLocaleString();
  }

  // ── Create price marker element ──
  /**
   * A count, or an em dash when it is unknown.
   *
   * A real 0 survives — a studio genuinely has 0 bedrooms — while an absent
   * count reads as unavailable rather than as zero.
   */
  function fmtCount(v) {
    if (v === null || v === undefined || v === '') return '—';
    var n = Number(v);
    return isNaN(n) ? '—' : String(n);
  }

  function createMarkerEl(price, status, approx) {
    var el = document.createElement('div');
    el.className = 'results-map-pin';
    var bg = '#1a1a1a';
    if (status === 'ComingSoon') bg = '#d97706';
    // THE EXACT COTALITY StandardStatus MEMBER. This read
    // 'ACTIVE_UNDER_CONTRACT', which is not a member and therefore never
    // matched — a dead branch, so every status except ComingSoon rendered in the
    // same default colour, Closed and Withdrawn and Expired included.
    //
    // "RESO spelling" was the wrong way to put it: the authority here is what
    // the live Cotality feed actually emits, not a standards document.
    else if (status === 'ActiveUnderContract') bg = '#7c3aed';
    el.style.cssText = 'background:' + bg + ';color:#fff;font-size:11px;font-weight:700;padding:4px 8px;border-radius:6px;cursor:pointer;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.25);border:2px solid #fff;';
    el.textContent = fmtPrice(price);
    // AN APPROXIMATE POSITION SAYS SO ON THE PIN.
    //
    // `approx` was computed in buildGeoJSON and then never passed here, so a
    // listing placed at a neighbourhood centroid looked exactly like one placed
    // at its real address. Provider Latitude/Longitude are null on every live
    // row, so in practice this is most of them — a dashed border and a title are
    // the difference between "here" and "somewhere in this neighbourhood".
    if (approx) {
        el.style.borderStyle = 'dashed';
        el.title = 'Approximate location - shown at the neighbourhood centre';
    }
    // Hover: change border color only — no transform, no z-index (both cause MapLibre marker reflow/shuffle)
    el.addEventListener('mouseenter', function () { el.style.borderColor = '#3b82f6'; el.style.background = '#2563EB'; });
    el.addEventListener('mouseleave', function () { el.style.borderColor = '#fff'; el.style.background = bg; });
    return el;
  }

  // ── Create cluster marker (count bubble) ──
  function createClusterEl(count, avgPrice) {
    var el = document.createElement('div');
    el.style.cssText = 'background:#2563EB;color:#fff;font-size:12px;font-weight:700;width:40px;height:40px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(37,99,235,0.4);border:3px solid #fff;cursor:pointer;line-height:1.1;';
    el.innerHTML = '<span style="font-size:14px;font-weight:800;">' + count + '</span>';
    el.addEventListener('mouseenter', function () { el.style.borderColor = '#93c5fd'; el.style.background = '#1d4ed8'; });
    el.addEventListener('mouseleave', function () { el.style.borderColor = '#fff'; el.style.background = '#2563EB'; });
    return el;
  }

  // ── Cluster nearby features ──
  // Groups features within ~0.001° of each other (same building/block)
  function clusterFeatures(features) {
    var clusters = [];
    var used = {};

    for (var i = 0; i < features.length; i++) {
      if (used[i]) continue;
      var f = features[i];
      var group = [f];
      used[i] = true;
      var clat = f.geometry.coordinates[1];
      var clng = f.geometry.coordinates[0];

      // Find nearby features
      for (var j = i + 1; j < features.length; j++) {
        if (used[j]) continue;
        var g = features[j];
        var dlat = Math.abs(g.geometry.coordinates[1] - clat);
        var dlng = Math.abs(g.geometry.coordinates[0] - clng);
        if (dlat < 0.0008 && dlng < 0.0008) { // ~1 block
          group.push(g);
          used[j] = true;
        }
      }
      clusters.push(group);
    }
    return clusters;
  }

  // ── Add markers with clustering ──
  function addMarkers(listings) {
    clearMarkers();
    var geojson = buildGeoJSON(listings);
    var bounds = new maplibregl.LngLatBounds();
    var hasBounds = false;
    var features = geojson.features;

    if (features.length === 0) return;

    // Get current zoom to decide clustering
    var zoom = _map ? _map.getZoom() : 12;
    var shouldCluster = zoom < 14 && features.length > 30;

    if (shouldCluster) {
      // Cluster mode: group nearby pins into count bubbles
      var clusters = clusterFeatures(features);
      for (var c = 0; c < clusters.length; c++) {
        var group = clusters[c];
        // Average position
        var sumLat = 0, sumLng = 0, sumPrice = 0;
        for (var gi = 0; gi < group.length; gi++) {
          sumLng += group[gi].geometry.coordinates[0];
          sumLat += group[gi].geometry.coordinates[1];
          sumPrice += group[gi].properties.price;
        }
        var avgLng = sumLng / group.length;
        var avgLat = sumLat / group.length;
        var avgPrice = sumPrice / group.length;
        var coords = [avgLng, avgLat];

        if (group.length === 1) {
          // Single pin — show price marker
          var f = group[0];
          var el = createMarkerEl(f.properties.price, f.properties.status, f.properties.approx);
          var marker = new maplibregl.Marker({ element: el }).setLngLat(f.geometry.coordinates).addTo(_map);
          (function (feat) {
            el.addEventListener('click', function () { showPopup(feat); highlightCard(feat.properties.id); });
          })(f);
          _markers.push(marker);
        } else {
          // Cluster bubble — show count
          var clEl = createClusterEl(group.length, avgPrice);
          var clMarker = new maplibregl.Marker({ element: clEl }).setLngLat(coords).addTo(_map);
          // Click cluster → zoom in
          (function (crd) {
            clEl.addEventListener('click', function () {
              _map.flyTo({ center: crd, zoom: Math.min(_map.getZoom() + 2, 16), duration: 600 });
              // After zoom, re-render pins (no longer clustered at higher zoom)
              setTimeout(function () { refreshMapPins(); }, 700);
            });
          })(coords);
          _clusterMarkers.push(clMarker);
        }

        bounds.extend(coords);
        hasBounds = true;
      }
    } else {
      // No clustering — show all individual pins
      for (var i = 0; i < features.length; i++) {
        var f = features[i];
        var coords = f.geometry.coordinates;
        var p = f.properties;
        var el = createMarkerEl(p.price, p.status, p.approx);

        var marker = new maplibregl.Marker({ element: el })
          .setLngLat(coords)
          .addTo(_map);

        (function (feat) {
          el.addEventListener('click', function () {
            showPopup(feat);
            highlightCard(feat.properties.id);
          });
        })(f);

        _markers.push(marker);
        bounds.extend(coords);
        hasBounds = true;
      }
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
    for (var j = 0; j < _clusterMarkers.length; j++) {
      _clusterMarkers[j].remove();
    }
    _clusterMarkers = [];
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
      + '<div style="font-size:11px;color:#374151;">' + fmtCount(p.beds) + ' bd &middot; ' + fmtCount(p.baths) + ' ba' + (p.neighborhood ? ' &middot; ' + p.neighborhood : '') + '</div>'
      + (p.approx ? '<div style="font-size:9px;color:#d97706;margin-top:3px;"><i class="fas fa-info-circle"></i> Approximate location</div>' : '')
      + '<button onclick="showListingDetail(\'' + String(p.id).replace(/'/g, "\\'") + '\')" style="margin-top:6px;width:100%;padding:5px;background:#111827;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">View Details</button>'
      + '</div></div>';

    _popup = new maplibregl.Popup({ closeButton: true, maxWidth: '240px', offset: [0, -10] })
      .setLngLat(feature.geometry.coordinates)
      .setHTML(html)
      .addTo(_map);
  }

  // ── Highlight card in results ──
  function highlightCard(listingId) {
    document.querySelectorAll('.results-map-highlight').forEach(function (el) {
      el.classList.remove('results-map-highlight');
    });
    var card = document.querySelector('[data-listing-id="' + listingId + '"]') ||
               document.querySelector('[data-lid="' + listingId + '"]');
    if (card) {
      card.classList.add('results-map-highlight');
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // ── Fit map to selected neighborhoods ──
  function fitToNeighborhoods() {
    if (!_map || !_centroids) return;
    var searchNeighborhoods = [];
    if (typeof getSelectedNeighborhoods === 'function' && typeof _resolveActiveNeighborhoodTagsId === 'function') {
      var tagsId = _resolveActiveNeighborhoodTagsId();
      searchNeighborhoods = getSelectedNeighborhoods(tagsId);
    }
    if (searchNeighborhoods.length === 0) return;

    var bounds = new maplibregl.LngLatBounds();
    var hasBounds = false;
    for (var i = 0; i < searchNeighborhoods.length; i++) {
      var c = _centroids[searchNeighborhoods[i]];
      if (c) {
        // Extend bounds around the centroid (±0.015° ≈ neighborhood-sized box)
        bounds.extend([c.lng - 0.015, c.lat - 0.01]);
        bounds.extend([c.lng + 0.015, c.lat + 0.01]);
        hasBounds = true;
      }
    }
    if (hasBounds) {
      _map.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 600 });
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

    // Re-cluster on zoom change
    _map.on('zoomend', function () {
      if (_isOpen) refreshMapPins();
    });
  }

  // ── Neighborhood polygon overlays (click-to-select) ──
  var _neighborhoodLayerAdded = false;
  var _selectedSlugs = {};
  var _geojsonSource = null;

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
      }).catch(function () {});
    }
  }

  function _addPolygonLayers(geojson) {
    if (!_map || _neighborhoodLayerAdded) return;
    _neighborhoodLayerAdded = true;
    _geojsonSource = geojson;

    _map.addSource('neighborhoods', { type: 'geojson', data: geojson, promoteId: 'slug' });

    _map.addLayer({ id: 'neighborhood-hit', type: 'fill', source: 'neighborhoods',
      paint: { 'fill-color': 'transparent', 'fill-opacity': 0 } });

    _map.addLayer({ id: 'neighborhood-fill', type: 'fill', source: 'neighborhoods',
      paint: {
        'fill-color': ['match', ['get', 'borough'],
          'Manhattan', 'rgba(37, 99, 235, 0.12)', 'Brooklyn', 'rgba(16, 185, 129, 0.12)',
          'Queens', 'rgba(245, 158, 11, 0.12)', 'Bronx', 'rgba(239, 68, 68, 0.12)',
          'Staten Island', 'rgba(139, 92, 246, 0.12)', 'rgba(107, 114, 128, 0.08)'],
        'fill-opacity': ['case',
          ['boolean', ['feature-state', 'selected'], false], 1,
          ['boolean', ['feature-state', 'hover'], false], 0.5, 0],
      } });

    _map.addLayer({ id: 'neighborhood-borders', type: 'line', source: 'neighborhoods',
      paint: {
        'line-color': ['match', ['get', 'borough'],
          'Manhattan', '#2563EB', 'Brooklyn', '#10B981', 'Queens', '#F59E0B',
          'Bronx', '#EF4444', 'Staten Island', '#8B5CF6', '#6B7280'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 13, 2, 16, 2.5],
        'line-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 1, 0],
      } });

    _map.addLayer({ id: 'neighborhood-labels', type: 'symbol', source: 'neighborhoods',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 13, 13, 16, 15],
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        'text-anchor': 'center', 'text-max-width': 8,
      },
      paint: {
        'text-color': ['match', ['get', 'borough'],
          'Manhattan', '#1D4ED8', 'Brooklyn', '#059669', 'Queens', '#D97706',
          'Bronx', '#DC2626', 'Staten Island', '#7C3AED', '#374151'],
        'text-halo-color': 'rgba(255, 255, 255, 0.9)', 'text-halo-width': 1.5,
        'text-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 1, 0],
      } });

    // Hover
    var _hoveredId = null;
    _map.on('mousemove', 'neighborhood-hit', function (e) {
      if (e.features.length > 0) {
        if (_hoveredId !== null) _map.setFeatureState({ source: 'neighborhoods', id: _hoveredId }, { hover: false });
        _hoveredId = e.features[0].id;
        _map.setFeatureState({ source: 'neighborhoods', id: _hoveredId }, { hover: true });
        _map.getCanvas().style.cursor = 'pointer';
      }
    });
    _map.on('mouseleave', 'neighborhood-hit', function () {
      if (_hoveredId !== null) _map.setFeatureState({ source: 'neighborhoods', id: _hoveredId }, { hover: false });
      _hoveredId = null;
      _map.getCanvas().style.cursor = '';
    });

    // Click — toggle neighborhood
    _map.on('click', 'neighborhood-hit', function (e) {
      if (e.features.length === 0) return;
      var slug = e.features[0].id;
      var name = e.features[0].properties.name;
      var borough = e.features[0].properties.borough;

      if (_selectedSlugs[slug]) {
        delete _selectedSlugs[slug];
        _map.setFeatureState({ source: 'neighborhoods', id: slug }, { selected: false });
      } else {
        _selectedSlugs[slug] = true;
        _map.setFeatureState({ source: 'neighborhoods', id: slug }, { selected: true });
      }

      // THE MAP'S OWN BOUNDED UNIVERSE, when one has been loaded.
      //
      // getFilteredListings(true) returns the rows currently on screen. Once
      // pagination became a real server round trip that is ONE PAGE, so pins
      // would have collapsed from ~200 to a page's worth. The map keeps its own
      // bounded read of the same criteria and falls back to the visible rows
      // when it has none — a preview, or a surface that never ran a search.
      var mapListings = (searchResultsState && searchResultsState.mapListings
                         && searchResultsState.mapListings.length)
        ? searchResultsState.mapListings
        : ((typeof getFilteredListings === 'function') ? getFilteredListings(true) : []);
      // A COUNT FROM A BOUNDED SAMPLE IS QUALIFIED, NOT STATED FLATLY.
      //
      // mapListings is at most one bounded read of the universe, so this is
      // "how many of the listings we loaded are in this neighbourhood", which is
      // a different claim from "how many listings are in this neighbourhood".
      // Printing the second when only the first is known is the same defect as
      // printing a fetched window as the result total.
      var _partial = !!(searchResultsState && searchResultsState.mapIsPartial);
      var count = mapListings.filter(function (l) { return l.neighborhood === name; }).length;
      var isSelected = !!_selectedSlugs[slug];

      new maplibregl.Popup({ closeButton: true, maxWidth: '220px' })
        .setLngLat(e.lngLat)
        .setHTML(
          '<div style="font-family:system-ui,sans-serif;padding:4px;">' +
          '<div style="font-weight:700;font-size:13px;">' + name + '</div>' +
          '<div style="font-size:11px;color:#6b7280;">' + borough + '</div>' +
          '<div style="font-size:12px;margin-top:4px;font-weight:600;">' + count + (_partial ? '+' : '') + ' listing' + (count !== 1 ? 's' : '') + (_partial ? ' loaded' : '') + '</div>' +
          '<div style="font-size:11px;margin-top:4px;color:' + (isSelected ? '#2563EB' : '#9CA3AF') + ';font-weight:600;">' +
          (isSelected ? '<i class="fas fa-check-circle"></i> Selected' : 'Deselected') + '</div>' +
          '</div>'
        )
        .addTo(_map);
    });

    _syncSelectedFromSearch();
  }

  // ── Sync selected polygons from search form ──
  function _syncSelectedFromSearch() {
    if (!_map || !_neighborhoodLayerAdded || !_geojsonSource) return;
    var searchNeighborhoods = [];
    if (typeof getSelectedNeighborhoods === 'function' && typeof _resolveActiveNeighborhoodTagsId === 'function') {
      var tagsId = _resolveActiveNeighborhoodTagsId();
      searchNeighborhoods = getSelectedNeighborhoods(tagsId);
    }
    Object.keys(_selectedSlugs).forEach(function (slug) {
      _map.setFeatureState({ source: 'neighborhoods', id: slug }, { selected: false });
    });
    _selectedSlugs = {};
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

  window.syncResultsMapPolygons = function () {
    if (_isOpen && _map && _neighborhoodLayerAdded) _syncSelectedFromSearch();
  };

  // ── Refresh pins from current filtered listings ──
  var _refreshDebounce = null;
  function refreshMapPins() {
    if (!_map || !_isOpen) return;

    // Debounce rapid calls (e.g., zoom events)
    if (_refreshDebounce) clearTimeout(_refreshDebounce);
    _refreshDebounce = setTimeout(function () {
      // THE PINS READ THE MAP UNIVERSE, NOT THE CURRENT PAGE.
    //
    // This read getFilteredListings(true), which returns
    // searchResultsState.filteredListings — and since pagination became a real
    // server round trip that is ONE PAGE. So the 500-row map universe was being
    // fetched, stored and then ignored by the only surface it exists for, and
    // the pins silently collapsed to whatever twenty rows were on screen.
    //
    // That was my own defect, introduced with the map-universe read. The
    // fallback to the visible rows stays for surfaces that never ran a search.
    var mapListings = (searchResultsState && searchResultsState.mapListings
                       && searchResultsState.mapListings.length)
      ? searchResultsState.mapListings
      : ((typeof getFilteredListings === 'function') ? getFilteredListings(true) : []);

      if (!_centroids) {
        var base = window.location.pathname.replace(/\/[^/]*$/, '');
        var url = (base.endsWith('/crm') ? '/geo/' : '../geo/') + 'rls-neighborhood-centroids.v1.json';
        fetch(url).then(function(r) { return r.ok ? r.json() : null; }).then(function(data) {
          if (data) _centroids = data;
          addMarkers(mapListings);
          fitToNeighborhoods();
        }).catch(function() { addMarkers(mapListings); });
      } else {
        addMarkers(mapListings);
      }
    }, 100);
  }

  // ── Toggle map view ──
  window.toggleResultsMap = function () {
    _isOpen = !_isOpen;
    var wrapper = document.getElementById('resultsMapWrapper');
    var toggleBtn = document.getElementById('resultsMapToggleBtn');

    if (!wrapper) return;

    if (_isOpen) {
      var splitWrapper = document.getElementById('resultsSplitWrapper');
      var resultsContainer = document.getElementById('resultsContainer');
      var mapContainer = document.getElementById('resultsMapContainer');

      if (splitWrapper) {
        splitWrapper.style.display = 'flex';
        splitWrapper.style.alignItems = 'stretch';
      }
      wrapper.style.display = 'block';
      wrapper.style.width = '45%';
      wrapper.style.minWidth = '360px';
      wrapper.style.flexShrink = '0';
      wrapper.style.position = 'relative';
      wrapper.style.borderLeft = '1px solid #e5e7eb';
      if (resultsContainer) {
        resultsContainer.style.flex = '1';
        resultsContainer.style.minWidth = '0';
        resultsContainer.style.overflowY = 'auto';
      }
      if (mapContainer) {
        mapContainer.style.position = 'sticky';
        mapContainer.style.top = '0';
        mapContainer.style.height = 'calc(100vh - 120px)';
      }

      if (toggleBtn) { toggleBtn.classList.add('bg-blue-100', 'text-blue-700'); toggleBtn.classList.remove('text-gray-500'); }
      var stickyToggleBtn = document.getElementById('stickyNavMapToggleBtn');
      if (stickyToggleBtn) { stickyToggleBtn.classList.add('bg-white/20', 'text-white'); stickyToggleBtn.classList.remove('text-gray-400'); }

      ensureMapLibre(function () {
        var container = document.getElementById('resultsMapContainer');
        if (container) container.style.cssText = 'position:sticky; top:0; height:calc(100vh - 120px); width:100%;';
        setTimeout(function () {
          initMap();
          if (_map) {
            _map.resize();
            refreshMapPins();
            // Fit to selected neighborhoods after pins load
            setTimeout(function () { fitToNeighborhoods(); }, 300);
          }
        }, 150);
      });
    } else {
      wrapper.style.display = 'none';
      var resultsContainer = document.getElementById('resultsContainer');
      if (resultsContainer) { resultsContainer.style.flex = ''; resultsContainer.style.minWidth = ''; resultsContainer.style.overflowY = ''; }
      if (toggleBtn) { toggleBtn.classList.remove('bg-blue-100', 'text-blue-700'); toggleBtn.classList.add('text-gray-500'); }
      var stickyToggleBtn = document.getElementById('stickyNavMapToggleBtn');
      if (stickyToggleBtn) { stickyToggleBtn.classList.remove('bg-white/20', 'text-white'); stickyToggleBtn.classList.add('text-gray-400'); }
      clearMarkers();
    }
  };

  // ── Pan to listing ──
  window.panToListing = function (listingId) {
    if (!_map || !_isOpen) return;
    var panListings = (searchResultsState && searchResultsState.filteredListings) || [];
    var l = panListings.find(function (x) { return x.id === listingId || x.lid === listingId; });
    if (!l) return;
    var lat = l.latitude || (l.geo && l.geo.lat);
    var lng = l.longitude || (l.geo && l.geo.lng);
    if (lat && lng) {
      _map.flyTo({ center: [lng, lat], zoom: 15, duration: 800 });
    }
  };

  // ── Expose refresh ──
  window.refreshResultsMap = function () {
    if (_isOpen && _map) {
      _syncSelectedFromSearch();
      refreshMapPins();
    }
  };

  window.isResultsMapOpen = function () { return _isOpen; };

})();
