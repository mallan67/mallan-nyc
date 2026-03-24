// ═══════════════════════════════════════════════════════════════
// TRESTLE ADAPTER — Translates registry criteria to OData queries
// Provider-agnostic: swap this for any MLS adapter
// ═══════════════════════════════════════════════════════════════
var TrestleAdapter = (function() {
  'use strict';

  function esc(value) { return String(value).replace(/'/g, "''"); }

  // OData select fields for display (core fields always needed)
  var DISPLAY_SELECT = [
    'StreetNumber','StreetName','StreetDirPrefix','StreetDirSuffix','StreetSuffix',
    'UnitNumber','City','CityRegion','SubdivisionName','PostalCity','PostalCode',
    'StateOrProvince','CountyOrParish','CrossStreet','Latitude','Longitude',
    'ListingId','SourceSystemKey','PropertyType','PropertySubType','CommonInterest',
    'OwnershipType','NewConstructionYN','StandardStatus','MlsStatus',
    'ModificationTimestamp','ListingContractDate','OnMarketDate','CloseDate',
    'ClosePrice','ActivationDate','DaysOnMarket','CumulativeDaysOnMarket',
    'OriginalListPrice','PreviousListPrice','AvailabilityDate',
    'ListPrice','LeaseAmount','LeaseAmountFrequency',
    'BedroomsTotal','BathroomsFull','BathroomsHalf','BathroomsTotalInteger',
    'LivingArea','LotSizeArea','YearBuilt','RoomsTotal','StoriesTotal',
    'BuildingName','NumberOfUnitsTotal','BuildingKeyNumeric',
    'AssociationFee','AssociationFeeFrequency','TaxAnnualAmount',
    'ListAgentMlsId','ListAgentFullName','ListAgentEmail','ListAgentDirectPhone',
    'ListOfficeMlsId','ListOfficeName',
    'PhotosCount','VirtualTourURLBranded','VirtualTourURLUnbranded',
    'PublicRemarks','InternetEntireListingDisplayYN','InternetAddressDisplayYN',
    'PetsAllowed','Furnished',
    'ListingAgreement','LandLeaseYN','CoolingYN','GarageYN',
    'DirectionFaces','View','PropertyCondition','Concessions','OwnerPays',
    'ArchitecturalStyle','StructureType','BusinessType',
    'AccessibilityFeatures','ExteriorFeatures','BuildingFeatures',
    'LaundryFeatures','SecurityFeatures','PoolFeatures',
    'PetsAllowedYN','AvailableLeaseType','ExistingLeaseType',
    'ConstructionMaterials','PriceChangeTimestamp','FireplaceYN'
  ];

  function buildQuery(criteria, registry) {
    var parts = [];
    var expandParts = [];
    var tab = criteria._tab || 'sale';

    // Listing type (sale vs rental)
    if (tab === 'rent') parts.push("PropertyType eq 'ResidentialLease'");
    else if (tab === 'sale') parts.push("PropertyType ne 'ResidentialLease'");

    // Default status if none specified
    if (!criteria.status) {
      parts.push("(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')");
    }

    // Iterate criteria keys
    Object.keys(criteria).forEach(function(ck) {
      if (ck === '_tab') return;
      var val = criteria[ck];
      if (val === null || val === undefined) return;

      // Detect range keys (key_min / key_max)
      var isMin = ck.endsWith('_min');
      var isMax = ck.endsWith('_max');
      var baseKey = isMin ? ck.slice(0, -4) : isMax ? ck.slice(0, -4) : ck;

      var field = SearchRegistry.getField(baseKey);
      if (!field) return;
      var t = field.providers && field.providers.trestle;
      if (!t || field.crm_internal) return;

      var tField = t.field;
      var resource = t.resource || 'Property';

      // Sub-resource fields go to $expand
      if (resource !== 'Property' && t.expand) {
        // Handle later in expand section
        return;
      }

      // Build OData for this criterion
      if (isMin || isMax) {
        var op = isMin ? 'ge' : 'le';
        if (t.datatype === 'string') {
          parts.push(tField + " " + op + " '" + esc(val) + "'");
        } else {
          parts.push(tField + " " + op + " " + val);
        }
      } else if (Array.isArray(val)) {
        // Multi-value (OR)
        if (baseKey === 'status') {
          // Status mapping
          var statusMap = { 'Active': 'Active', 'ComingSoon': 'ComingSoon', 'ActiveUnderContract': 'ActiveUnderContract', 'Pending': 'ActiveUnderContract', 'Closed': 'Closed', 'Withdrawn': 'Withdrawn', 'Canceled': 'Canceled', 'Expired': 'Expired', 'Hold': 'Hold', 'Incomplete': 'Incomplete' };
          var mapped = val.map(function(v) { return statusMap[v] || v; }).filter(function(v, i, arr) { return arr.indexOf(v) === i; });
          var sParts = mapped.map(function(s) { return "StandardStatus eq '" + esc(s) + "'"; });
          if (sParts.length > 0) parts.push('(' + sParts.join(' or ') + ')');
        } else if (val.length === 1) {
          if (t.operator === 'contains') parts.push("contains(" + tField + ",'" + esc(val[0]) + "')");
          else parts.push(tField + " eq '" + esc(val[0]) + "'");
        } else if (val.length > 1) {
          if (t.operator === 'contains') {
            var cParts = val.map(function(v) { return "contains(" + tField + ",'" + esc(v) + "')"; });
            parts.push('(' + cParts.join(' or ') + ')');
          } else {
            var oParts = val.map(function(v) { return tField + " eq '" + esc(v) + "'"; });
            parts.push('(' + oParts.join(' or ') + ')');
          }
        }
      } else if (typeof val === 'boolean' || t.datatype === 'boolean') {
        parts.push(tField + ' eq ' + (val ? 'true' : 'false'));
      } else if (t.operator === 'contains') {
        parts.push("contains(" + tField + ",'" + esc(val) + "')");
      } else if (t.operator === 'ne_null') {
        parts.push(tField + ' ne null');
      } else if (t.operator === 'gt') {
        parts.push(tField + ' gt ' + val);
      } else if (t.datatype === 'string' || t.datatype === 'date') {
        parts.push(tField + " eq '" + esc(val) + "'");
      } else {
        parts.push(tField + ' eq ' + val);
      }
    });

    // Build $expand for sub-resources (OpenHouse, etc.)
    var ohFilters = [];
    Object.keys(criteria).forEach(function(ck) {
      if (ck === '_tab') return;
      var val = criteria[ck];
      if (val === null || val === undefined) return;
      var isMin = ck.endsWith('_min');
      var isMax = ck.endsWith('_max');
      var baseKey = isMin ? ck.slice(0, -4) : isMax ? ck.slice(0, -4) : ck;
      var field = SearchRegistry.getField(baseKey);
      if (!field) return;
      var t = field.providers && field.providers.trestle;
      if (!t || !t.expand || t.resource === 'Property') return;

      if (t.resource === 'OpenHouse') {
        if (isMin) ohFilters.push(t.field + ' ge ' + val);
        else if (isMax) ohFilters.push(t.field + ' le ' + val);
        else if (t.datatype === 'boolean') ohFilters.push(t.field + ' eq ' + val);
        else ohFilters.push(t.field + " eq '" + esc(val) + "'");
      }
    });
    if (ohFilters.length > 0) {
      expandParts.push('OpenHouse($filter=' + ohFilters.join(' and ') + ')');
    }

    return {
      filter: parts.join(' and '),
      select: DISPLAY_SELECT.join(','),
      expand: expandParts.join(','),
      orderby: 'ModificationTimestamp desc',
      top: 200
    };
  }

  // Build address search OData (special handling)
  function buildAddressFilter(address) {
    var raw = address.trim().toUpperCase();
    var parts = [];
    var dirPattern = /^(\d+)\s+(E|W|N|S|EAST|WEST|NORTH|SOUTH)\.?\s+(.*)/i;
    var numOnly = /^(\d+)\s+(.*)/;
    var dirMatch = raw.match(dirPattern);
    if (dirMatch) {
      parts.push("startswith(StreetNumber,'" + esc(dirMatch[1]) + "')");
      var dir = dirMatch[2].charAt(0);
      parts.push("StreetDirPrefix eq '" + dir + "'");
      if (dirMatch[3]) parts.push("contains(StreetName,'" + esc(dirMatch[3].split(/\s+/)[0]) + "')");
    } else {
      var numMatch = raw.match(numOnly);
      if (numMatch) {
        parts.push("startswith(StreetNumber,'" + esc(numMatch[1]) + "')");
        if (numMatch[2]) parts.push("contains(StreetName,'" + esc(numMatch[2].split(/\s+/)[0]) + "')");
      } else {
        parts.push("contains(StreetName,'" + esc(raw.split(/\s+/)[0]) + "')");
      }
    }
    return parts.join(' and ');
  }

  return {
    buildQuery: buildQuery,
    buildAddressFilter: buildAddressFilter,
    escapeOData: esc,
    DISPLAY_SELECT: DISPLAY_SELECT
  };
})();
