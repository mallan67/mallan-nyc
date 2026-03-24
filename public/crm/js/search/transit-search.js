// ═══════════════════════════════════════════════════════════════
// TRANSIT SEARCH — Subway line proximity search
// Uses real MTA station coordinates (from data.ny.gov API)
// to find listings within walking distance of selected lines.
// ═══════════════════════════════════════════════════════════════
var TransitSearch = (function() {
  'use strict';

  var _stations = null; // line → [{name, lat, lng}]
  var _selectedLines = {};
  var _radius = 0.005; // ~0.3 miles (5 blocks) in degrees

  // Load station data
  function loadStations() {
    if (_stations) return Promise.resolve(_stations);
    return fetch('/crm/data/mta-stations-manhattan.json')
      .then(function(r) { return r.json(); })
      .then(function(data) { _stations = data; return data; })
      .catch(function() { _stations = {}; return {}; });
  }

  // Initialize: wire all subway buttons and transit checkboxes
  function init() {
    loadStations();

    // Wire all subway line circles/buttons across ALL tabs
    // They're <span> or <button> elements with subway line text (1,2,3,A,C,E, etc.)
    // Identify them by parent context (.transit-lines, or nearby "SUBWAY" label)
    document.addEventListener('click', function(e) {
      var el = e.target;
      // Match subway circle spans (rounded-full with single letter/number)
      if (el.matches('.rounded-full') && el.textContent.trim().length <= 2) {
        var line = el.textContent.trim();
        if (_stations && _stations[line] !== undefined) {
          e.preventDefault();
          toggleLine(line, el);
        }
      }
    });

    // Wire LIRR/Ferry/Bus checkboxes
    document.addEventListener('change', function(e) {
      var cb = e.target;
      if (cb.type !== 'checkbox') return;
      var label = cb.parentElement ? cb.parentElement.textContent.trim() : '';
      if (label === 'LIRR' || label === 'Ferry' || label === 'Bus Lines') {
        var key = label.replace(' Lines', '');
        if (cb.checked) _selectedLines[key] = true;
        else delete _selectedLines[key];
      }
    });
  }

  function toggleLine(line, el) {
    if (_selectedLines[line]) {
      delete _selectedLines[line];
      _unhighlight(el);
    } else {
      _selectedLines[line] = true;
      _highlight(el);
    }
  }

  function _highlight(el) {
    if (!el) return;
    el.style.outline = '3px solid #B8860B';
    el.style.outlineOffset = '2px';
    el.style.boxShadow = '0 0 0 4px rgba(184,134,11,0.25)';
  }

  function _unhighlight(el) {
    if (!el) return;
    el.style.outline = '';
    el.style.outlineOffset = '';
    el.style.boxShadow = '';
  }

  // Get the bounding box that covers all stations on selected lines
  // with a radius buffer around each station
  function getBounds() {
    if (!_stations || Object.keys(_selectedLines).length === 0) return null;

    var allStations = [];
    Object.keys(_selectedLines).forEach(function(line) {
      if (_stations[line]) {
        _stations[line].forEach(function(s) { allStations.push(s); });
      }
    });

    if (allStations.length === 0) return null;

    var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    allStations.forEach(function(s) {
      if (s.lat < minLat) minLat = s.lat;
      if (s.lat > maxLat) maxLat = s.lat;
      if (s.lng < minLng) minLng = s.lng;
      if (s.lng > maxLng) maxLng = s.lng;
    });

    // Add radius buffer
    return {
      south: minLat - _radius,
      north: maxLat + _radius,
      west: minLng - _radius,
      east: maxLng + _radius
    };
  }

  // Check if a listing is near any station on selected lines
  function isNearStation(listing) {
    if (!listing.latitude || !listing.longitude || !_stations) return true;
    if (Object.keys(_selectedLines).length === 0) return true;

    var lat = listing.latitude;
    var lng = listing.longitude;

    for (var line in _selectedLines) {
      if (!_stations[line]) continue;
      for (var i = 0; i < _stations[line].length; i++) {
        var s = _stations[line][i];
        var dLat = Math.abs(lat - s.lat);
        var dLng = Math.abs(lng - s.lng);
        if (dLat <= _radius && dLng <= _radius) return true;
      }
    }
    return false;
  }

  // Build OData filter for Trestle (bounding box approach)
  function toODataFilter() {
    var bounds = getBounds();
    if (!bounds) return [];
    return [
      'Latitude ge ' + bounds.south.toFixed(6),
      'Latitude le ' + bounds.north.toFixed(6),
      'Longitude ge ' + bounds.west.toFixed(6),
      'Longitude le ' + bounds.east.toFixed(6)
    ];
  }

  function hasSelection() {
    return Object.keys(_selectedLines).length > 0;
  }

  function getSelectedLines() {
    return Object.keys(_selectedLines);
  }

  function clear() {
    _selectedLines = {};
    // Remove all highlights
    document.querySelectorAll('.rounded-full').forEach(function(el) {
      if (el.textContent.trim().length <= 2) _unhighlight(el);
    });
  }

  // Set proximity radius (in degrees, default 0.005 ≈ 5 blocks)
  function setRadius(r) { _radius = r; }

  return {
    init: init,
    loadStations: loadStations,
    toggleLine: toggleLine,
    getBounds: getBounds,
    isNearStation: isNearStation,
    toODataFilter: toODataFilter,
    hasSelection: hasSelection,
    getSelectedLines: getSelectedLines,
    clear: clear,
    setRadius: setRadius
  };
})();
