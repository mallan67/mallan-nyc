/**
 * Cotality Data Dictionary Mapper
 *
 * Maps between internal listing format and Cotality Web API compliant format.
 * Supports Trestle Web API for REBNY RLS integration.
 */

import type { Listing } from '@/lib/types/listing';

/**
 * Cotality-compliant listing interface (Trestle Web API format)
 */
export interface COTALITYListing {
  // Required identification
  ListingKey: string;
  ListingId: string;
  PropertyType: 'Residential' | 'ResidentialLease' | 'Commercial' | 'Land';
  MLSStatus: 'Active' | 'ActiveUnderContract' | 'ComingSoon' | 'Pending' | 'Sold' | 'Rented' | 'Withdrawn' | 'Expired' | 'Cancelled';

  // Address
  StreetNumber: string;
  StreetName: string;
  StreetSuffix?: string;
  UnitNumber?: string;
  City: string;
  StateOrProvince: string;
  PostalCode: string;
  CountyOrParish: string;
  UnparsedAddress?: string;

  // NYC-specific
  BuildingTaxLot: string;
  SubdivisionName?: string; // Neighborhood

  // Price
  ListPrice: number;
  OriginalListPrice: number;
  ClosePrice?: number;
  PricePerSquareFoot?: number;

  // Property details
  PropertySubType?: string;
  BedroomsTotal: number;
  BathroomsFull: number;
  BathroomsHalf: number;
  BathroomsTotal: number;
  LivingArea?: number;
  LivingAreaUnits?: string;
  YearBuilt?: number;
  StoriesTotal?: number;
  Rooms?: number;

  // Ownership
  CommonInterest?: 'Condominium' | 'StockCooperative' | 'Condop' | 'FeeSimple' | 'None';

  // Fees (NYC-specific)
  AssociationFee?: number;
  AssociationFeeFrequency?: 'Monthly' | 'Quarterly' | 'Annually';
  AssociationFeeIncludes?: string[];
  RealEstateTax?: number;
  MaintenanceFee?: number; // Co-op specific
  FlipTaxYN?: boolean;
  FlipTaxAmount?: number;
  MaxFinancing?: number;
  TaxAbatementYN?: boolean;
  TaxAbatementEndDate?: string;

  // Features
  BuildingLaundryFeatures?: string[];
  BuildingPetsAllowed?: string[];
  BuildingPetsAllowedComments?: string;
  AttendanceType?: string[];
  Cooling?: string[];
  Heating?: string[];
  Flooring?: string[];
  InteriorFeatures?: string[];
  View?: string[];
  Appliances?: string[];

  // Building info
  BuildingName?: string;
  ArchitecturalStyle?: string[];

  // Policies
  PiedATerreAllowed?: boolean;
  SubletAllowed?: boolean;
  NewConstructionYN?: boolean;
  NewDevelopmentYN?: boolean;
  SponsorUnitYN?: boolean;

  // Dates
  ListingContractDate: string;
  OnMarketDate: string;
  ExpirationDate: string;
  CloseDate?: string;
  AvailabilityDate?: string;
  ModificationTimestamp: string;

  // Agent info
  ListAgentKey: string;
  ListAgentMlsId: string;
  ListAgentFullName: string;
  ListAgentEmail: string;
  ListAgentStateLicense?: string;
  ListOfficeKey: string;
  ListOfficeMlsId: string;
  ListOfficeName: string;

  // Commission fields REMOVED per NAR Settlement (Aug 2025). Do NOT re-add.
  // Any compensation data must stay out of RLS/IDX payloads. See
  // lib/compliance/rls-enforcement.ts REMOVED_FIELDS.

  // Description
  PublicRemarks: string;
  PrivateRemarks?: string;
  ShowingInstructions?: string;
  ShowingContactPhone?: string;

  // Media
  Media?: {
    MediaKey: string;
    MediaURL: string;
    MediaCategory: 'Photo' | 'FloorPlan' | 'Video' | 'VirtualTour';
    Order: number;
    ShortDescription?: string;
  }[];

  // Open House
  OpenHouse?: {
    OpenHouseKey: string;
    OpenHouseDate: string;
    OpenHouseStartTime: string;
    OpenHouseEndTime: string;
    OpenHouseType: 'Public' | 'Broker' | 'Private';
    OpenHouseRemarks?: string;
  }[];

  // Compliance flags
  IDXOptOutYN?: boolean;
  VOWOptOutYN?: boolean;
  SyndicationOptOutYN?: boolean;
}

/**
 * Helper to map association fee frequency to Cotality format
 */
function mapAssociationFeeFrequency(
  freq: 'Monthly' | 'Quarterly' | 'Annual' | null
): COTALITYListing['AssociationFeeFrequency'] {
  if (!freq) return 'Monthly';
  if (freq === 'Annual') return 'Annually';
  return freq;
}

/**
 * Map internal Listing to Cotality-compliant format for Trestle Web API
 */
export function mapListingToRESO(listing: Listing): COTALITYListing {
  const isRental = listing.listingType === 'rent';

  // Calculate bathrooms total
  const bathroomsTotal =
    listing.propertyInfo.bathroomsFull + listing.propertyInfo.bathroomsHalf * 0.5;

  // Map property type
  const propertyType: COTALITYListing['PropertyType'] = isRental ? 'ResidentialLease' : 'Residential';

  // Map MLS status
  const statusMap: Record<string, COTALITYListing['MLSStatus']> = {
    Active: 'Active',
    Pending: 'Pending',
    Sold: 'Sold',
    Rented: 'Rented',
    Withdrawn: 'Withdrawn',
    Expired: 'Expired',
  };

  // Map common interest
  const commonInterestMap: Record<string, COTALITYListing['CommonInterest']> = {
    Condo: 'Condominium',
    'Co-op': 'StockCooperative',
    Condop: 'Condop',
  };

  const cotality: COTALITYListing = {
    // Identification
    ListingKey: listing.id,
    ListingId: listing.mlsId,
    PropertyType: propertyType,
    MLSStatus: statusMap[listing.mlsStatus] || 'Active',

    // Address
    StreetNumber: listing.address.streetNumber,
    StreetName: listing.address.streetName,
    UnitNumber: listing.address.unit,
    City: listing.address.borough || listing.address.city,
    StateOrProvince: listing.address.state,
    PostalCode: listing.address.zip,
    CountyOrParish: listing.address.county,
    UnparsedAddress: `${listing.address.streetNumber} ${listing.address.streetName}`,

    // NYC-specific
    BuildingTaxLot: listing.address.buildingTaxLot,
    SubdivisionName: listing.address.neighborhood,

    // Price
    ListPrice: listing.price.listPrice,
    OriginalListPrice: listing.price.originalListPrice,
    ClosePrice: listing.price.closePrice || undefined,
    PricePerSquareFoot: listing.price.pricePerSqft || undefined,

    // Property details
    PropertySubType: listing.propertyInfo.propertyType,
    BedroomsTotal: listing.propertyInfo.bedroomsTotal,
    BathroomsFull: listing.propertyInfo.bathroomsFull,
    BathroomsHalf: listing.propertyInfo.bathroomsHalf,
    BathroomsTotal: bathroomsTotal,
    LivingArea: listing.propertyInfo.aboveGradeFinishedArea || undefined,
    LivingAreaUnits: listing.propertyInfo.aboveGradeFinishedArea ? 'Square Feet' : undefined,
    YearBuilt: listing.propertyInfo.yearBuilt || undefined,
    StoriesTotal: listing.propertyInfo.floorsInBuilding || undefined,
    Rooms: listing.propertyInfo.totalRooms || undefined,

    // Ownership
    CommonInterest:
      commonInterestMap[listing.nycSpecific.coopCondo || ''] || 'Condominium',

    // Fees
    AssociationFee: listing.nycSpecific.maintenanceFee || listing.nycSpecific.commonCharges || undefined,
    AssociationFeeFrequency: mapAssociationFeeFrequency(listing.association.associationFeeFrequency),
    AssociationFeeIncludes: listing.association.associationFeeIncludes || undefined,
    RealEstateTax: listing.nycSpecific.realEstateTaxes || undefined,
    MaintenanceFee: listing.nycSpecific.maintenanceFee || undefined,
    FlipTaxYN: listing.nycSpecific.flipTax || undefined,
    FlipTaxAmount: listing.nycSpecific.flipTaxPercent || undefined,
    MaxFinancing: listing.nycSpecific.maxFinancing || undefined,

    // Features
    BuildingLaundryFeatures: listing.features.interior.laundry
      ? [listing.features.interior.laundry]
      : undefined,
    BuildingPetsAllowed: listing.features.pets.allowed
      ? [listing.features.pets.policy]
      : ['Not Allowed'],
    BuildingPetsAllowedComments: listing.features.pets.comments || undefined,
    AttendanceType: listing.features.building.attendanceType
      ? [listing.features.building.attendanceType]
      : undefined,
    Cooling: listing.features.interior.cooling || undefined,
    Heating: listing.features.interior.heating || undefined,
    Flooring: listing.features.interior.flooring || undefined,
    View: listing.features.views || undefined,
    Appliances: listing.features.interior.appliances || undefined,

    // Policies
    PiedATerreAllowed: listing.nycSpecific.piedATerre || undefined,
    SubletAllowed: listing.nycSpecific.sublettingAllowed || undefined,

    // Dates
    ListingContractDate: listing.listing.listingDate,
    OnMarketDate: listing.listing.listingDate,
    ExpirationDate: listing.listing.expirationDate,
    ModificationTimestamp: listing.listing.modificationTimestamp,

    // Agent info
    ListAgentKey: listing.agent.listAgentId,
    ListAgentMlsId: listing.agent.listAgentId,
    ListAgentFullName: listing.agent.listAgentName,
    ListAgentEmail: listing.agent.listAgentEmail,
    ListOfficeKey: listing.agent.listAgentId.split('-')[0] || 'mallan',
    ListOfficeMlsId: 'MALLAN',
    ListOfficeName: listing.agent.listOfficeName,

    // Description
    PublicRemarks: listing.description,
    PrivateRemarks: listing.privateRemarks || undefined,
    ShowingInstructions: listing.listing.showingInstructions || undefined,
    ShowingContactPhone: listing.listing.showingContactPhone || undefined,

    // Media
    Media: listing.media.images.map((img, index) => ({
      MediaKey: `${listing.id}-img-${index}`,
      MediaURL: img.url,
      MediaCategory: 'Photo' as const,
      Order: img.order,
      ShortDescription: img.caption,
    })),

    // Open House
    OpenHouse: listing.openHouse?.scheduled
      ? [
          {
            OpenHouseKey: `${listing.id}-oh-1`,
            OpenHouseDate: listing.openHouse.date,
            OpenHouseStartTime: listing.openHouse.startTime,
            OpenHouseEndTime: listing.openHouse.endTime,
            OpenHouseType: listing.openHouse.type,
            OpenHouseRemarks: listing.openHouse.remarks,
          },
        ]
      : undefined,

    // Compliance
    IDXOptOutYN: listing.compliance.idxOptOut,
    VOWOptOutYN: listing.compliance.vowOptOut,
    SyndicationOptOutYN: listing.compliance.syndicationOptOut,
  };

  return cotality;
}

/**
 * Map Cotality-compliant format back to internal Listing format
 */
export function mapCOTALITYToListing(cotality: COTALITYListing): Partial<Listing> {
  const isRental = cotality.PropertyType === 'ResidentialLease';

  // Reverse map common interest
  const commonInterestReverseMap: Record<string, 'Condo' | 'Co-op' | 'Condop' | null> = {
    Condominium: 'Condo',
    StockCooperative: 'Co-op',
    Condop: 'Condop',
  };

  // Reverse map status
  const statusReverseMap: Record<string, Listing['mlsStatus']> = {
    Active: 'Active',
    ActiveUnderContract: 'Pending',
    ComingSoon: 'Active',
    Pending: 'Pending',
    Sold: 'Sold',
    Rented: 'Rented',
    Withdrawn: 'Withdrawn',
    Expired: 'Expired',
    Cancelled: 'Withdrawn',
  };

  return {
    id: cotality.ListingKey,
    mlsId: cotality.ListingId,
    mlsStatus: statusReverseMap[cotality.MLSStatus] || 'Active',
    listingType: isRental ? 'rent' : 'sale',
    status: cotality.MLSStatus === 'Active' ? 'active' : 'inactive',

    address: {
      streetNumber: cotality.StreetNumber,
      streetName: cotality.StreetName,
      unit: cotality.UnitNumber || '',
      city: 'New York',
      state: cotality.StateOrProvince,
      zip: cotality.PostalCode,
      county: cotality.CountyOrParish,
      borough: cotality.City as Listing['address']['borough'],
      cityRegion: cotality.City,
      neighborhood: cotality.SubdivisionName || '',
      neighborhoodDisplay: cotality.SubdivisionName || cotality.City,
      buildingTaxLot: cotality.BuildingTaxLot,
    },

    price: {
      listPrice: cotality.ListPrice,
      pricePerSqft: cotality.PricePerSquareFoot || null,
      originalListPrice: cotality.OriginalListPrice,
      closePrice: cotality.ClosePrice || null,
      closePricePerSqft: null,
    },

    propertyInfo: {
      propertyType: (cotality.PropertySubType as Listing['propertyInfo']['propertyType']) || 'Condo',
      propertySubType: cotality.PropertySubType || 'Residential',
      buildingType: '',
      architecturalStyle: cotality.ArchitecturalStyle?.[0] || '',
      yearBuilt: cotality.YearBuilt || 0,
      totalRooms: cotality.Rooms || 0,
      bedroomsTotal: cotality.BedroomsTotal,
      bathroomsFull: cotality.BathroomsFull,
      bathroomsHalf: cotality.BathroomsHalf,
      aboveGradeFinishedArea: cotality.LivingArea || 0,
      belowGradeFinishedArea: 0,
      lotSizeArea: null,
      storiesTotal: 1,
      floorsInBuilding: cotality.StoriesTotal || 1,
      unitFloor: 1,
    },

    nycSpecific: {
      coopCondo: commonInterestReverseMap[cotality.CommonInterest || ''] || null,
      maintenanceFee: cotality.MaintenanceFee || cotality.AssociationFee || null,
      commonCharges: cotality.CommonInterest === 'Condominium' ? cotality.AssociationFee || null : null,
      realEstateTaxes: cotality.RealEstateTax || null,
      taxesAnnual: cotality.RealEstateTax ? cotality.RealEstateTax * 12 : null,
      assessedValue: null,
      flipTax: cotality.FlipTaxYN || null,
      flipTaxPercent: cotality.FlipTaxAmount || null,
      percentOwned: null,
      sublettingAllowed: cotality.SubletAllowed || null,
      sublettingRestrictions: null,
      piedATerre: cotality.PiedATerreAllowed || null,
      guarantorsAllowed: null,
      giftAllowed: null,
      financingAllowed: cotality.MaxFinancing ? true : null,
      maxFinancing: cotality.MaxFinancing || null,
      boardApprovalRequired: cotality.CommonInterest !== 'Condominium',
    },

    description: cotality.PublicRemarks,
    privateRemarks: cotality.PrivateRemarks || null,
  };
}

/**
 * Validate that a listing can be exported to Cotality format
 */
export function canExportToRESO(listing: Listing): { valid: boolean; missingFields: string[] } {
  const requiredFields = [
    'id',
    'mlsId',
    'mlsStatus',
    'listingType',
    'address.streetNumber',
    'address.streetName',
    'address.city',
    'address.state',
    'address.zip',
    'address.buildingTaxLot',
    'price.listPrice',
    'propertyInfo.bedroomsTotal',
    'propertyInfo.bathroomsFull',
    'agent.listAgentId',
    'agent.listAgentName',
    'agent.listAgentEmail',
    'description',
  ];

  const missingFields: string[] = [];

  for (const field of requiredFields) {
    const parts = field.split('.');
    let value: unknown = listing;
    for (const part of parts) {
      value = (value as Record<string, unknown>)?.[part];
    }
    if (value === undefined || value === null || value === '') {
      missingFields.push(field);
    }
  }

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}
