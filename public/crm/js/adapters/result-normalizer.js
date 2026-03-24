// ═══════════════════════════════════════════════════════════════
// RESULT NORMALIZER — Converts provider responses to CRM flat shape
// Trestle OData → CRM shape, Prisma → CRM shape
// ═══════════════════════════════════════════════════════════════
var ResultNormalizer = (function() {
  'use strict';

  var STATUS_MAP = {
    'Active': 'ACTIVE', 'ComingSoon': 'COMING_SOON', 'Coming Soon': 'COMING_SOON',
    'ActiveUnderContract': 'PENDING', 'Active Under Contract': 'PENDING', 'Pending': 'PENDING',
    'Closed': 'CLOSED', 'Expired': 'EXPIRED', 'Withdrawn': 'WITHDRAWN',
    'Hold': 'HOLD', 'Incomplete': 'INCOMPLETE',
    'Canceled': 'CANCELLED', 'Cancelled': 'CANCELLED'
  };

  function _mapDisplayType(raw) {
    var ci = raw.CommonInterest ? String(raw.CommonInterest) : '';
    if (ci === 'Condominium') return 'Condo';
    if (ci === 'StockCooperative') return 'Co-op';
    if (ci === 'Condop') return 'Condop';
    var sub = raw.PropertySubType ? String(raw.PropertySubType).toLowerCase() : '';
    if (sub.includes('townhouse')) return 'Townhouse';
    if (sub.includes('loft')) return 'Loft';
    if (sub.includes('single family')) return 'House';
    if (sub.includes('multi')) return 'Multi-Family';
    return String(raw.PropertyType || 'Residential');
  }

  function normalizeTrestle(raw) {
    var addrParts = [raw.StreetNumber, raw.StreetDirPrefix, raw.StreetName, raw.StreetSuffix, raw.StreetDirSuffix].filter(Boolean);
    var addrOk = raw.InternetAddressDisplayYN !== false;
    var pt = String(raw.PropertyType || '');
    var isRental = pt.toLowerCase().includes('lease');
    var price = Number(raw.ListPrice) || 0;
    var taxAn = Number(raw.TaxAnnualAmount) || 0;
    var mTax = taxAn / 12;
    var mCC = Number(raw.AssociationFee) || 0;
    var yb = raw.YearBuilt != null ? Number(raw.YearBuilt) : null;
    var era = null;
    if (yb) { era = yb >= 2015 ? 'New Construction' : yb >= 1960 ? 'Post-War' : 'Pre-War'; }
    var ms = String(raw.MlsStatus || raw.StandardStatus || 'Active');
    var origPrice = Number(raw.OriginalListPrice) || 0;
    var pc = null;
    if (origPrice > 0 && origPrice !== price) pc = price < origPrice ? 'down' : 'up';

    var r = {
      id: String(raw.ListingId || raw.SourceSystemKey || ''),
      lid: String(raw.ListingId || ''),
      wid: raw.SourceSystemKey ? String(raw.SourceSystemKey) : null,
      address: addrOk ? addrParts.join(' ').toUpperCase() : 'ADDRESS AVAILABLE UPON REQUEST',
      addressDisplayYN: addrOk,
      unit: String(raw.UnitNumber || ''),
      neighborhood: String(raw.SubdivisionName || ''),
      borough: String(raw.CityRegion || raw.CountyOrParish || 'Manhattan'),
      zip: String(raw.PostalCode || ''),
      latitude: raw.Latitude != null ? Number(raw.Latitude) : null,
      longitude: raw.Longitude != null ? Number(raw.Longitude) : null,
      crossStreet: String(raw.CrossStreet || ''),
      listingCategory: isRental ? 'rental' : undefined,
      ownership: String(raw.CommonInterest || raw.OwnershipType || ''),
      propertyType: _mapDisplayType(raw),
      propertySubType: String(raw.PropertySubType || ''),
      price: price,
      reTaxes: mTax,
      maintCC: mCC,
      totalMonthly: isRental ? price : mTax + mCC,
      beds: Number(raw.BedroomsTotal) || 0,
      baths: raw.BathroomsTotalInteger != null ? Number(raw.BathroomsTotalInteger) : (Number(raw.BathroomsFull) || 0) + (Number(raw.BathroomsHalf) || 0) * 0.5,
      fullBaths: Number(raw.BathroomsFull) || 0,
      halfBaths: Number(raw.BathroomsHalf) || 0,
      rooms: Number(raw.RoomsTotal) || 0,
      intSqft: raw.LivingArea != null ? Number(raw.LivingArea) : null,
      yearBuilt: yb, era: era,
      buildingName: raw.BuildingName ? String(raw.BuildingName) : null,
      buildingKey: raw.BuildingKeyNumeric != null ? Number(raw.BuildingKeyNumeric) : null,
      status: STATUS_MAP[ms] || ms.toUpperCase(),
      mlsStatus: ms,
      listedDate: raw.ListingContractDate ? new Date(String(raw.ListingContractDate)).toLocaleDateString('en-US') : '',
      updatedDate: raw.ModificationTimestamp ? new Date(String(raw.ModificationTimestamp)).toLocaleDateString('en-US') : '',
      closedDate: raw.CloseDate ? String(raw.CloseDate) : null,
      contractDate: raw.ListingContractDate ? String(raw.ListingContractDate) : null,
      dom: Number(raw.DaysOnMarket) || 0,
      cdom: Number(raw.CumulativeDaysOnMarket) || 0,
      company: String(raw.ListOfficeName || ''),
      agentName: String(raw.ListAgentFullName || ''),
      agentEmail: String(raw.ListAgentEmail || ''),
      agentPhone: String(raw.ListAgentDirectPhone || ''),
      priceChange: pc,
      originalPrice: origPrice > 0 && origPrice !== price ? origPrice : null,
      photoCount: Number(raw.PhotosCount) || 0,
      virtualTourUrl: raw.VirtualTourURLUnbranded ? String(raw.VirtualTourURLUnbranded) : raw.VirtualTourURLBranded ? String(raw.VirtualTourURLBranded) : null,
      images: [],
      description: String(raw.PublicRemarks || ''),
      listingType: 'Exclusive',
      idxDisplayYN: true,
      internetDisplayYN: raw.InternetEntireListingDisplayYN !== false,
      permissions: { ownerOptOut: false, participantOnly: false, idxDisplay: true, internetDisplay: raw.InternetEntireListingDisplayYN !== false, syndication: true },
      _source: 'idx',
      _listingKey: String(raw.ListingId || raw.SourceSystemKey || '')
    };

    // Pass-through searchable checkbox fields
    ['ListingAgreement','LandLeaseYN','CoolingYN','GarageYN','DirectionFaces','View','PropertyCondition','Concessions','OwnerPays','ArchitecturalStyle','StructureType','BusinessType','AccessibilityFeatures','ExteriorFeatures','BuildingFeatures','LaundryFeatures','SecurityFeatures','PoolFeatures','PetsAllowed','Furnished','ConstructionMaterials','NewConstructionYN','PriceChangeTimestamp','FireplaceYN'].forEach(function(f) {
      if (raw[f] !== undefined && raw[f] !== null) {
        r[f] = f.endsWith('YN') ? (raw[f] === true || raw[f] === 'true') : String(raw[f]);
      }
    });

    return r;
  }

  function normalizePrisma(listing) {
    return {
      id: String(listing.id), lid: listing.rls_listing_id || String(listing.id),
      address: listing.address || '', unit: listing.unit_number || '',
      price: listing.price || 0, beds: listing.beds || 0, baths: listing.baths || 0,
      rooms: listing.rooms || 0, intSqft: listing.sqft || null,
      status: (listing.status || 'ACTIVE').toUpperCase(),
      ownership: listing.ownership_type || '', propertyType: listing.property_type || '',
      neighborhood: listing.neighborhood || '', borough: listing.borough || 'Manhattan',
      zip: listing.zip || '', company: 'Mallan Real Estate Inc.',
      images: [], photoCount: 0,
      permissions: { ownerOptOut: false, participantOnly: false, idxDisplay: true, internetDisplay: true, syndication: true },
      _source: listing.rls_eligible ? 'idx' : 'exclusive'
    };
  }

  return { normalizeTrestle: normalizeTrestle, normalizePrisma: normalizePrisma };
})();
