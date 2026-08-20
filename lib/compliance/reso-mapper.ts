/**
 * RESO Data Dictionary Mapper
 *
 * Maps between internal listing format and RESO Web API compliant format.
 * Supports Trestle Web API for REBNY RLS integration.
 *
 * ── REACHABILITY — READ THIS BEFORE QUOTING ANY SEVERITY FROM THIS FILE ────
 *
 * `mapListingToRESO` and `mapRESOToListing` have ZERO PRODUCTION CALL SITES.
 * Verified 2026-08-20 by grep over the whole worktree for both identifiers: the
 * only non-test hit is the re-export in `lib/compliance/index.ts:20`, and
 * nothing imports that barrel either (grep for `from '@/lib/compliance'`: no
 * hits). The remaining hits are this file, the spelling-closure test, and two
 * throwaway probes under `.cache/status-canon/`.
 *
 * THE LIVE FEED PATH IS `lib/idx/trestle-mapper.ts` (`mapTrestleToPrisma` /
 * `normalizeStandardStatus` / `computeGateColumns`) — not this module. Nothing
 * in this file has ever put a status on a public page or in an outbound feed.
 *
 * The two fail-open defaults fixed here on 2026-08-20 were real defects in real
 * code and the fail-CLOSED corrections stay: this module is exported, it is a
 * status-mapping surface, and the next caller must not inherit a `|| 'Active'`
 * landing value. But the first write-up of that fix narrated them as live
 * incidents ("a CLOSED listing was advertised outbound as ACTIVE", "a CANCELLED
 * LISTING REVERSE-MAPPED TO ACTIVE"), which asserted a reachability that does
 * not exist. Corrected here and at each site below so the repo stops carrying
 * the false claim. A latent fail-open in an uncalled exported mapper is worth
 * fixing; it is not worth over-claiming, and CLAUDE.md §F does not accept a
 * severity that was never proven against a call path.
 */

import type { Listing } from '@/lib/types/listing';

/**
 * RESO-compliant listing interface (Trestle Web API format)
 */
export interface RESOListing {
  // Required identification
  ListingKey: string;
  ListingId: string;
  PropertyType: 'Residential' | 'ResidentialLease' | 'Commercial' | 'Land';
  /**
   * RESO StandardStatus.
   *
   * Widened 2026-08-20 to carry the FULL live Cotality vocabulary (probe
   * 2026-08-19: `Active`, `ActiveUnderContract`, `Canceled`, `Closed`,
   * `ComingSoon`, `Delete`, `Expired`, `Hold`, `Incomplete`, `Pending`,
   * `Withdrawn`) alongside the Mallan-internal values the provider rejects with
   * HTTP 400 (`Cancelled`, `Sold`, `Rented`, `Leased`). Previously the union
   * omitted `Canceled`, `Closed`, `Delete`, `Hold` and `Incomplete`, which is
   * how two fail-open defaults in this file went unnoticed by the type checker.
   *
   * STATUS-SPELLING-EXEMPT: a type union spanning BOTH vocabularies; the
   * behavioural closure invariant is enforced on the mapper functions instead.
   */
  MLSStatus:
    | 'Active'
    | 'ActiveUnderContract'
    | 'Canceled'
    | 'Closed'
    | 'ComingSoon'
    | 'Delete'
    | 'Expired'
    | 'Hold'
    | 'Incomplete'
    | 'Pending'
    | 'Withdrawn'
    | 'Cancelled'
    | 'Sold'
    | 'Rented'
    | 'Leased';

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
 * Helper to map association fee frequency to RESO format
 */
function mapAssociationFeeFrequency(
  freq: 'Monthly' | 'Quarterly' | 'Annual' | null
): RESOListing['AssociationFeeFrequency'] {
  if (!freq) return 'Monthly';
  if (freq === 'Annual') return 'Annually';
  return freq;
}

/**
 * Map internal Listing to RESO-compliant format for Trestle Web API
 */
export function mapListingToRESO(listing: Listing): RESOListing {
  const isRental = listing.listingType === 'rent';

  // Calculate bathrooms total
  const bathroomsTotal =
    listing.propertyInfo.bathroomsFull + listing.propertyInfo.bathroomsHalf * 0.5;

  // Map property type
  const propertyType: RESOListing['PropertyType'] = isRental ? 'ResidentialLease' : 'Residential';

  // ── Map MLS status (OUTBOUND) ────────────────────────────────────────────
  //
  // SECOND FAIL-OPEN, found 2026-08-20 while fixing the inbound reverse map
  // below, and proven by execution on the pre-fix tree:
  //
  //     mapListingToRESO({ mlsStatus: 'Closed' }).MLSStatus === 'Active'
  //
  // `Listing['mlsStatus']` is the union Active|Pending|Sold|Rented|Withdrawn|
  // Expired|Closed. `Closed` was the one member with no key here, so it hit the
  // `|| 'Active'` default: a fully type-valid CLOSED input mapped to ACTIVE.
  //
  // SEVERITY, STATED HONESTLY (corrected 2026-08-20): this function has NO
  // production call site (see the file header), so no closed listing was ever
  // actually advertised as active by it. An earlier write-up said it was, and
  // that claim was wrong. What is true is narrower and still worth fixing: an
  // exported status mapper had a fail-OPEN default that the type checker could
  // not see, and the first caller to arrive would have inherited it.
  //
  // Every member of the union is now keyed, and the fallback is fail-CLOSED.
  const statusMap: Record<string, RESOListing['MLSStatus']> = {
    Active: 'Active',
    Pending: 'Pending',
    Sold: 'Sold',
    Rented: 'Rented',
    Withdrawn: 'Withdrawn',
    Expired: 'Expired',
    Closed: 'Closed',
  };

  /**
   * Fail-CLOSED default for an unmodelled outbound status. Was `'Active'`.
   * Advertising an unknown-state listing as Active is a REBNY §2.05 exposure;
   * `Withdrawn` is the safe off-market landing value.
   */
  const UNKNOWN_OUTBOUND_STATUS: RESOListing['MLSStatus'] = 'Withdrawn';

  // Map common interest
  const commonInterestMap: Record<string, RESOListing['CommonInterest']> = {
    Condo: 'Condominium',
    'Co-op': 'StockCooperative',
    Condop: 'Condop',
  };

  const reso: RESOListing = {
    // Identification
    ListingKey: listing.id,
    ListingId: listing.mlsId,
    PropertyType: propertyType,
    MLSStatus: statusMap[listing.mlsStatus] ?? UNKNOWN_OUTBOUND_STATUS,

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

  return reso;
}

/**
 * Map RESO-compliant format back to internal Listing format
 */
export function mapRESOToListing(reso: RESOListing): Partial<Listing> {
  const isRental = reso.PropertyType === 'ResidentialLease';

  // Reverse map common interest
  const commonInterestReverseMap: Record<string, 'Condo' | 'Co-op' | 'Condop' | null> = {
    Condominium: 'Condo',
    StockCooperative: 'Co-op',
    Condop: 'Condop',
  };

  // ── Reverse map status ───────────────────────────────────────────────────
  //
  // FAIL-CLOSED. Two defects were fixed here on 2026-08-20, both proven by
  // execution against the pre-fix tree:
  //
  //   1. `Canceled` (the LIVE Cotality enumeration member, single L — the
  //      spelling `mapTrestleToPrisma` stores verbatim) had no key. It fell
  //      through the `|| 'Active'` default, so:
  //          mapRESOToListing({MLSStatus:'Canceled'}).mlsStatus === 'Active'
  //      while its double-L twin `Cancelled` correctly produced 'Withdrawn'
  //      from the same input shape — the two spellings of ONE state landing on
  //      opposite sides of the display boundary.
  //
  //   2. The `|| 'Active'` default itself was fail-OPEN for EVERY unmodelled
  //      value — `Hold`, `Incomplete`, `Delete`, `Closed`, `Leased`, a typo, or
  //      a future provider member all became 'Active'. CLAUDE.md §E requires a
  //      display-affecting gate to fail CLOSED when the input is unclear.
  //
  // SEVERITY, STATED HONESTLY (corrected 2026-08-20): an earlier write-up
  // narrated defect 1 as "A CANCELLED LISTING REVERSE-MAPPED TO ACTIVE", which
  // reads as a live display exposure. It was not one. `mapRESOToListing` has no
  // production call site (see the file header) and the live inbound path is
  // `lib/idx/trestle-mapper.ts`. The defect and the fail-closed correction are
  // real; the reachability was overstated and is withdrawn here.
  //
  // Every live provider member is now keyed explicitly, and the fallback is
  // 'Withdrawn' (off-market) rather than 'Active'. `Listing['mlsStatus']` is the
  // narrow union Active|Pending|Sold|Rented|Withdrawn|Expired|Closed, so
  // 'Withdrawn' is the correct landing value for every off-market state that has
  // no dedicated member of that union.
  //
  // NOTE (2026-08-20): this map used to carry a spelling-exemption marker
  // arguing that "the closure invariant is enforced on the OUTPUT instead". That
  // marker has been REMOVED — and this note deliberately does not spell the
  // marker token out, because the scanner reads its exemption window from the
  // RAW source, so a comment merely DISCUSSING the marker would re-exempt the
  // very literal it is describing. The structural half of
  // lib/compliance/__tests__/listing-status-spelling-closure.test.ts now scans
  // object/Record literals and checks their KEYS — the input domain a map must
  // cover — so this literal is policed directly, and an exemption would have
  // gone on suppressing exactly the defect the marker was written next to.
  // Delete a key here and that test fails.
  const statusReverseMap: Record<string, Listing['mlsStatus']> = {
    // ── Live Cotality StandardStatus members (probe 2026-08-19, HTTP 200) ──
    Active: 'Active',
    ActiveUnderContract: 'Pending',
    Canceled: 'Withdrawn', //   single-L: the PROVIDER's spelling
    Closed: 'Closed',
    ComingSoon: 'Active',
    Delete: 'Withdrawn', //     provider tombstone — never displayable
    Expired: 'Expired',
    Hold: 'Withdrawn', //       off-market; no 'Hold' member in the union
    Incomplete: 'Withdrawn', // pre-publication; never displayable
    Pending: 'Pending',
    Withdrawn: 'Withdrawn',
    // ── Mallan-internal values (provider answers HTTP 400 for these) ──
    Cancelled: 'Withdrawn', //  double-L: the CRM canonical value
    Sold: 'Sold',
    Rented: 'Rented',
    Leased: 'Rented',
    Draft: 'Withdrawn', //      pre-publication; never displayable
    TemporarilyOffMarket: 'Withdrawn',
    OwnerOptOut: 'Withdrawn',
  };

  /**
   * Fail-CLOSED default for an unmodelled inbound status.
   *
   * Was `'Active'`. Never restore that: it makes any unrecognised string —
   * including a brand-new provider member nobody has mapped yet — publicly
   * displayable, which is the precise shape of the 2026-04-30 display-gate
   * incident (memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md).
   */
  const UNKNOWN_STATUS_FALLBACK: Listing['mlsStatus'] = 'Withdrawn';

  return {
    id: reso.ListingKey,
    mlsId: reso.ListingId,
    mlsStatus: statusReverseMap[reso.MLSStatus] ?? UNKNOWN_STATUS_FALLBACK,
    listingType: isRental ? 'rent' : 'sale',
    status: reso.MLSStatus === 'Active' ? 'active' : 'inactive',

    address: {
      streetNumber: reso.StreetNumber,
      streetName: reso.StreetName,
      unit: reso.UnitNumber || '',
      city: 'New York',
      state: reso.StateOrProvince,
      zip: reso.PostalCode,
      county: reso.CountyOrParish,
      borough: reso.City as Listing['address']['borough'],
      cityRegion: reso.City,
      neighborhood: reso.SubdivisionName || '',
      neighborhoodDisplay: reso.SubdivisionName || reso.City,
      buildingTaxLot: reso.BuildingTaxLot,
    },

    price: {
      listPrice: reso.ListPrice,
      pricePerSqft: reso.PricePerSquareFoot || null,
      originalListPrice: reso.OriginalListPrice,
      closePrice: reso.ClosePrice || null,
      closePricePerSqft: null,
    },

    propertyInfo: {
      propertyType: (reso.PropertySubType as Listing['propertyInfo']['propertyType']) || 'Condo',
      propertySubType: reso.PropertySubType || 'Residential',
      buildingType: '',
      architecturalStyle: reso.ArchitecturalStyle?.[0] || '',
      yearBuilt: reso.YearBuilt || 0,
      totalRooms: reso.Rooms || 0,
      bedroomsTotal: reso.BedroomsTotal,
      bathroomsFull: reso.BathroomsFull,
      bathroomsHalf: reso.BathroomsHalf,
      aboveGradeFinishedArea: reso.LivingArea || 0,
      belowGradeFinishedArea: 0,
      lotSizeArea: null,
      storiesTotal: 1,
      floorsInBuilding: reso.StoriesTotal || 1,
      unitFloor: 1,
    },

    nycSpecific: {
      coopCondo: commonInterestReverseMap[reso.CommonInterest || ''] || null,
      maintenanceFee: reso.MaintenanceFee || reso.AssociationFee || null,
      commonCharges: reso.CommonInterest === 'Condominium' ? reso.AssociationFee || null : null,
      realEstateTaxes: reso.RealEstateTax || null,
      taxesAnnual: reso.RealEstateTax ? reso.RealEstateTax * 12 : null,
      assessedValue: null,
      flipTax: reso.FlipTaxYN || null,
      flipTaxPercent: reso.FlipTaxAmount || null,
      percentOwned: null,
      sublettingAllowed: reso.SubletAllowed || null,
      sublettingRestrictions: null,
      piedATerre: reso.PiedATerreAllowed || null,
      guarantorsAllowed: null,
      giftAllowed: null,
      financingAllowed: reso.MaxFinancing ? true : null,
      maxFinancing: reso.MaxFinancing || null,
      boardApprovalRequired: reso.CommonInterest !== 'Condominium',
    },

    description: reso.PublicRemarks,
    privateRemarks: reso.PrivateRemarks || null,
  };
}

/**
 * Validate that a listing can be exported to RESO format
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
