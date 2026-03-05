/**
 * results-map.js — Split-view results map with listing pins
 *
 * Shows a MapLibre GL map alongside search results. Each listing
 * with coordinates gets a pin. Clicking a pin highlights the listing card.
 * Clicking a card pans the map to that listing.
 *
 * Toggle: toggleResultsMap() — called from the toolbar map button.
 */

/* global maplibregl, mockListings, searchResultsState, getFilteredListings, showListingDetail */

(function () {
  'use strict';

  var _map = null;
  var _markers = [];
  var _isOpen = false;
  var _popup = null;

  var STYLES = {
    positron: 'https://tiles.openfreemap.org/styles/positron',
    bright: 'https://tiles.openfreemap.org/styles/bright',
  };

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
  function buildGeoJSON(listings) {
    var features = [];
    for (var i = 0; i < listings.length; i++) {
      var l = listings[i];
      var lat = l.latitude || (l.geo && l.geo.lat);
      var lng = l.longitude || (l.geo && l.geo.lng);
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
      + '<button onclick="showListingDetail(' + p.id + ')" style="margin-top:6px;width:100%;padding:5px;background:#111827;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">View Details</button>'
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
      refreshMapPins();
    });
  }

  // ── Refresh pins from current filtered listings ──
  function refreshMapPins() {
    if (!_map || !_isOpen) return;
    var listings = (typeof getFilteredListings === 'function')
      ? getFilteredListings(true) // skipPagination = true to get ALL results
      : (searchResultsState && searchResultsState.filteredListings) || mockListings || [];
    addMarkers(listings);
  }

  // ── Toggle split view ──
  window.toggleResultsMap = function () {
    _isOpen = !_isOpen;
    var wrapper = document.getElementById('resultsMapWrapper');
    var resultsContainer = document.getElementById('resultsContainer');
    var toggleBtn = document.getElementById('resultsMapToggleBtn');

    if (!wrapper || !resultsContainer) return;

    if (_isOpen) {
      // Enter split view
      wrapper.style.display = 'block';
      resultsContainer.parentElement.style.display = 'flex';
      resultsContainer.style.flex = '1';
      resultsContainer.style.minWidth = '0';
      resultsContainer.style.maxHeight = '80vh';
      resultsContainer.style.overflowY = 'auto';
      if (toggleBtn) {
        toggleBtn.classList.add('bg-blue-100', 'text-blue-700');
        toggleBtn.classList.remove('text-gray-500');
      }

      ensureMapLibre(function () {
        setTimeout(function () {
          initMap();
          if (_map) {
            _map.resize();
            refreshMapPins();
          }
        }, 100);
      });
    } else {
      // Exit split view
      wrapper.style.display = 'none';
      resultsContainer.parentElement.style.display = '';
      resultsContainer.style.flex = '';
      resultsContainer.style.minWidth = '';
      resultsContainer.style.maxHeight = '';
      resultsContainer.style.overflowY = '';
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
    var listings = (searchResultsState && searchResultsState.filteredListings) || mockListings || [];
    var l = listings.find(function (x) { return x.id === listingId; });
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
