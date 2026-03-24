// ═══════════════════════════════════════════════════════════════
// SEARCH ROUTER — Routes search criteria to the correct provider
// Currently: Trestle only (via /api/idx/search). Prisma adapter later.
// ═══════════════════════════════════════════════════════════════
var SearchRouter = (function() {
  'use strict';

  // ── Map registry criteria keys to MallanAPI.idx.search() params ──
  // The server-side /api/idx/search already builds OData from named params.
  // We translate schema-driven criteria into those named params.
  var CRITERIA_TO_PARAMS = {
    // Tab → type
    '_tab': function(params, val) {
      if (val === 'rent') params.type = 'rent';
      else if (val === 'sale') params.type = 'sale';
      // building tab searches all types
    },
    // Quick search
    'rls-id': function(params, val) { params.listingId = val; },
    'address': function(params, val) { params.address = val; },
    'keyword': function(params, val) { params.keyword = val; },
    // Price
    'price_min': function(params, val) { params.minPrice = val; },
    'price_max': function(params, val) { params.maxPrice = val; },
    // Beds/Baths
    'beds_min': function(params, val) { params.minBeds = val; },
    'beds_max': function(params, val) { params.maxBeds = val; },
    'baths_min': function(params, val) { params.minBaths = val; },
    'baths_max': function(params, val) { params.maxBaths = val; },
    // Rooms/Size
    'rooms_min': function(params, val) { params.minRooms = val; },
    'rooms_max': function(params, val) { params.maxRooms = val; },
    'sqft_min': function(params, val) { params.minSqft = val; },
    'sqft_max': function(params, val) { params.maxSqft = val; },
    // Location
    'neighborhood': function(params, val) {
      if (Array.isArray(val)) params.neighborhood = val.join(',');
      else params.neighborhood = val;
    },
    'borough': function(params, val) { params.borough = val; },
    'zip': function(params, val) { params.zip = val; },
    // Status
    'status': function(params, val) {
      if (Array.isArray(val)) params.status = val.join(',');
      else params.status = val;
    },
    // Building
    'year-built_min': function(params, val) { params.minYear = val; },
    'year-built_max': function(params, val) { params.maxYear = val; },
    'stories_min': function(params, val) { params.minFloors = val; },
    'stories_max': function(params, val) { params.maxFloors = val; },
    'units_min': function(params, val) { params.minUnits = val; },
    'units_max': function(params, val) { params.maxUnits = val; },
    'building-name': function(params, val) { params.buildingName = val; },
    // Property type
    'property-sub-type': function(params, val) {
      if (Array.isArray(val)) params.propertySubType = val.join(',');
      else params.propertySubType = val;
    },
    'ownership': function(params, val) {
      if (Array.isArray(val)) params.ownership = val.join(',');
      else params.ownership = val;
    },
    // Dates
    'list-date_min': function(params, val) { params.dateFrom = val; params.dateType = 'Listed'; },
    'list-date_max': function(params, val) { params.dateTo = val; params.dateType = 'Listed'; },
    'close-date_min': function(params, val) { params.closeDateFrom = val; },
    'close-date_max': function(params, val) { params.closeDateTo = val; },
    'modification-date_min': function(params, val) { params.dateFrom = val; params.dateType = 'Updated'; },
    'modification-date_max': function(params, val) { params.dateTo = val; params.dateType = 'Updated'; }
  };

  // ── Translate criteria to API params ──────────────────────────
  function _criteriaToParams(criteria) {
    var params = { limit: 200 };

    Object.keys(criteria).forEach(function(ck) {
      var val = criteria[ck];
      if (val === null || val === undefined) return;

      // Direct mapping
      var mapper = CRITERIA_TO_PARAMS[ck];
      if (mapper) {
        mapper(params, val);
        return;
      }

      // For unmapped criteria, check if the registry field has a trestle provider
      // and fall through to server-side filtering (the server's OData builder
      // handles many more params than what we map here). For now, log and skip.
      var isMin = ck.endsWith('_min');
      var isMax = ck.endsWith('_max');
      var baseKey = isMin ? ck.slice(0, -4) : isMax ? ck.slice(0, -4) : ck;
      var field = SearchRegistry.getField(baseKey);
      if (field && field.providers && field.providers.trestle && !field.crm_internal) {
        // Known registry field not mapped to a named param — will need client-side filter
        // or server OData extension
        console.debug('[SearchRouter] Unmapped criterion (client-side filter):', ck, '=', val);
      }
    });

    return params;
  }

  // ── Client-side filter for criteria the server doesn't handle ──
  function _clientSideFilter(results, criteria) {
    if (!results || results.length === 0) return results;

    return results.filter(function(listing) {
      var pass = true;

      Object.keys(criteria).forEach(function(ck) {
        if (!pass) return;
        var val = criteria[ck];
        if (val === null || val === undefined) return;
        // Skip criteria that the server already handled
        if (CRITERIA_TO_PARAMS[ck]) return;

        var isMin = ck.endsWith('_min');
        var isMax = ck.endsWith('_max');
        var baseKey = isMin ? ck.slice(0, -4) : isMax ? ck.slice(0, -4) : ck;
        var field = SearchRegistry.getField(baseKey);
        if (!field || !field.providers || !field.providers.trestle) return;

        var tField = field.providers.trestle.field;
        var listingVal = listing[tField];

        // Boolean filter
        if (field.providers.trestle.datatype === 'boolean') {
          if (val === true && !listingVal) pass = false;
          return;
        }

        // Array/contains filter (checkbox groups with contains operator)
        if (Array.isArray(val) && field.providers.trestle.operator === 'contains') {
          var strVal = String(listingVal || '');
          var anyMatch = val.some(function(v) { return strVal.indexOf(v) !== -1; });
          if (!anyMatch) pass = false;
          return;
        }

        // Array exact match
        if (Array.isArray(val)) {
          if (val.indexOf(String(listingVal || '')) === -1) pass = false;
          return;
        }
      });

      return pass;
    });
  }

  // ── Main search function ──────────────────────────────────────
  function search(criteria) {
    if (typeof MallanAPI === 'undefined' || !MallanAPI.idx) {
      return Promise.reject(new Error('MallanAPI not available'));
    }

    var params = _criteriaToParams(criteria);
    console.log('[SearchRouter] Search params:', JSON.stringify(params));

    return MallanAPI.idx.search(params).then(function(result) {
      if (!result || !result.listings) {
        console.warn('[SearchRouter] No results from API');
        return [];
      }

      var listings = result.listings;
      console.log('[SearchRouter] API returned', listings.length, 'listings');

      // Normalize through ResultNormalizer if the listings aren't already in CRM shape
      // The /api/idx/search endpoint already returns CRM-shaped data, but we normalize
      // for consistency and to ensure all fields exist
      var normalized = listings.map(function(raw) {
        // Check if already normalized (has _source field from server mapping)
        if (raw._source) return raw;
        return ResultNormalizer.normalizeTrestle(raw);
      });

      // Apply client-side filters for criteria the server didn't handle
      var filtered = _clientSideFilter(normalized, criteria);
      console.log('[SearchRouter] After client-side filter:', filtered.length, 'listings');

      return filtered;
    });
  }

  return {
    search: search,
    _criteriaToParams: _criteriaToParams // exposed for testing
  };
})();
