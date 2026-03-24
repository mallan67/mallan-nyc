// ═══════════════════════════════════════════════════════════════
// MANHATTAN GRID — Street/Avenue to Lat/Lng bounding box search
// Converts "96th St to 72nd St, 5th Ave to 3rd Ave" into
// Latitude/Longitude OData filters for Trestle
// ═══════════════════════════════════════════════════════════════
var ManhattanGrid = (function() {
  'use strict';

  // Manhattan street numbers → approximate latitude
  // Manhattan runs roughly 40.700 (south) to 40.880 (north)
  // Streets are numbered 1-220, roughly 20 blocks per mile
  // 14th St ≈ 40.7360, 96th St ≈ 40.7850, 125th St ≈ 40.8090
  function streetToLat(streetStr) {
    if (!streetStr) return null;
    var num = parseInt(streetStr);
    if (isNaN(num)) return null;
    // Linear approximation: each street ≈ 0.00048 degrees latitude
    // Base: 14th St = 40.7360
    return 40.7360 + (num - 14) * 0.00048;
  }

  // Manhattan avenues → approximate longitude
  // Manhattan runs roughly -74.010 (west/Hudson) to -73.940 (east/East River)
  // Avenues: 12th Ave (west) → 1st Ave (east), then lettered (A, B, C, D)
  var AVE_TO_LNG = {
    '12th Avenue': -74.009, '11th Avenue': -74.003, '10th Avenue': -73.998,
    '9th Avenue': -73.993, '8th Avenue': -73.988, '7th Avenue': -73.983,
    'Broadway': -73.980, '6th Avenue': -73.978, '5th Avenue': -73.974,
    'Madison Avenue': -73.971, 'Park Avenue': -73.968, 'Lexington Avenue': -73.965,
    '3rd Avenue': -73.962, '2nd Avenue': -73.958, '1st Avenue': -73.955,
    'York Avenue': -73.951, 'Avenue A': -73.948, 'Avenue B': -73.945,
    'Avenue C': -73.942, 'Avenue D': -73.940,
    'FDR Drive': -73.938, 'West End Avenue': -74.001, 'Amsterdam Avenue': -73.993,
    'Columbus Avenue': -73.989, 'Central Park West': -73.976,
    'Riverside Drive': -74.005, 'St. Nicholas Avenue': -73.948,
    'Lenox Avenue': -73.944, 'Adam Clayton Powell Jr. Boulevard': -73.944,
    'Frederick Douglass Boulevard': -73.948, 'Manhattan Avenue': -73.953,
    'Morningside Drive': -73.961, 'Convent Avenue': -73.946,
    'Edgecombe Avenue': -73.941, 'Fort Washington Avenue': -73.936
  };

  function aveToLng(aveStr) {
    if (!aveStr) return null;
    return AVE_TO_LNG[aveStr] || null;
  }

  // Read grid values from the 4 selects
  function getGridBounds(prefix) {
    prefix = prefix || 'adv-grid';
    var northEl = document.getElementById(prefix + '-north');
    var southEl = document.getElementById(prefix + '-south');
    var westEl = document.getElementById(prefix + '-west');
    var eastEl = document.getElementById(prefix + '-east');

    var bounds = { north: null, south: null, west: null, east: null };

    if (northEl && northEl.value) bounds.north = streetToLat(northEl.value);
    if (southEl && southEl.value) bounds.south = streetToLat(southEl.value);
    if (westEl && westEl.value) bounds.west = aveToLng(westEl.value);
    if (eastEl && eastEl.value) bounds.east = aveToLng(eastEl.value);

    // Swap if needed (north should be > south, east should be > west in NYC)
    if (bounds.north && bounds.south && bounds.north < bounds.south) {
      var tmp = bounds.north; bounds.north = bounds.south; bounds.south = tmp;
    }
    if (bounds.west && bounds.east && bounds.west > bounds.east) {
      var tmp = bounds.west; bounds.west = bounds.east; bounds.east = tmp;
    }

    return bounds;
  }

  // Build OData filter for lat/lng bounding box
  function toODataFilter(bounds) {
    var parts = [];
    if (bounds.south) parts.push('Latitude ge ' + bounds.south.toFixed(6));
    if (bounds.north) parts.push('Latitude le ' + bounds.north.toFixed(6));
    if (bounds.west) parts.push('Longitude ge ' + bounds.west.toFixed(6));
    if (bounds.east) parts.push('Longitude le ' + bounds.east.toFixed(6));
    return parts;
  }

  // Check if a listing is within the grid bounds (client-side filter)
  function isInBounds(listing, bounds) {
    if (!listing.latitude || !listing.longitude) return true; // Don't exclude if no coords
    if (bounds.south && listing.latitude < bounds.south) return false;
    if (bounds.north && listing.latitude > bounds.north) return false;
    if (bounds.west && listing.longitude < bounds.west) return false;
    if (bounds.east && listing.longitude > bounds.east) return false;
    return true;
  }

  // Has any grid value been set?
  function hasGridValues(prefix) {
    var bounds = getGridBounds(prefix);
    return bounds.north !== null || bounds.south !== null || bounds.west !== null || bounds.east !== null;
  }

  // Clear all grid selects
  function clear(prefix) {
    prefix = prefix || 'adv-grid';
    ['north', 'south', 'west', 'east'].forEach(function(dir) {
      var el = document.getElementById(prefix + '-' + dir);
      if (el) el.selectedIndex = 0;
    });
  }

  return {
    getGridBounds: getGridBounds,
    toODataFilter: toODataFilter,
    isInBounds: isInBounds,
    hasGridValues: hasGridValues,
    clear: clear,
    streetToLat: streetToLat,
    aveToLng: aveToLng
  };
})();

// Global clear function for the Clear button
function clearManhattanGrid() {
  ManhattanGrid.clear('adv-grid');
  ManhattanGrid.clear('bldg-grid');
}
