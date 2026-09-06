/**
 * MALLAN FORM & PERSISTENCE CONTRACT — how Mallan's own listing forms are normalized and stored.
 *
 *   Provider facts → lib/cotality/live-contract.ts (dated live pulls). NOT here.
 *   REBNY / UCBA rules → lib/compliance/rebny-ucba-rules.ts. NOT here.
 *
 * aliasToCanonical  : Mallan FORM keys (camelCase inputs, legacy keys) → the field name Mallan stores.
 *                     A target is either a live Cotality Property field or a declared Mallan-internal key.
 *                     A live Cotality field is never aliased to a different live field.
 * valueAliases      : Mallan form VALUES → live enum members (or Mallan-internal values under a Mallan key).
 * persistenceMap    : which Mallan column / JSON bucket stores each fact (Mallan storage model).
 * internalKeys      : keys Mallan persists that are NOT Cotality Property fields — REBNY submission-form
 *                     facts and Mallan decisions. They are Mallan-internal and never presented as provider
 *                     facts; the Mallan-decision keys are prefixed with an underscore.
 *
 * Mallan status and permission decisions travel under `_mallanStatus`, `_crmWorkflowStatus` and
 * `_mallanPermission`; the provider field names MlsStatus / StandardStatus / Permission are never
 * written for a Mallan-authored listing (lib/listings/mallan-status.ts explains the domains).
 *
 * Split out of the former lib/compliance/rebny-field-tables.ts (Packet 2 closure, 2026-09-06).
 */

/** Mallan-internal keys that are not Cotality Property fields (REBNY submission-form facts + Mallan decisions). */
export const MALLAN_INTERNAL_KEYS: readonly string[] = [
  // Mallan decisions
  '_mallanStatus', '_crmWorkflowStatus', '_mallanPermission',
  // REBNY submission-form / Mallan facts kept under their submission names (not on the live Property resource)
  'RLSListingID', 'CoBrokeAgreement', 'BathroomsTotal', 'AttendanceType', 'BuildingLaundryFeatures',
  'BuildingPetsAllowed', 'BuildingPetsAllowedComments', 'PetsAllowedComments', 'BuildingTaxLot',
  'ElevatorsTotal', 'NewDevelopmentYN', 'FlipTax', 'FlipTaxType', 'FlipTaxRemarks', 'MaximumFinancingPercent',
  'MaximumFinancingRemarks', 'NumberOfShares', 'PercentOfCommonElements', 'TaxAbatementYN', 'TaxAbatementComments',
  'TaxAbatementExpirationYear', 'TaxMonthlyAmount', 'FurnishedListPrice', 'FurnishedMinLeaseMonths',
  'FurnishedMaxLeaseMonths', 'LeaseType', 'MinLeaseMonths', 'ViewRemarks', 'SponsorUnitYN',
  'BuyerAgentRLSParticipantYN', 'BuyerAgencyCompensation', 'BuyerAgencyCompensationType',
  // REBNY submission-form facts named by the conditional rules (collected by Mallan's forms; not live Property fields)
  'CoOwnershipInterest', 'FractionalUnitNumber', 'GarageSpacesAssignedYN', 'CoBuyerAgentRLSParticipantYN',
  'AlternateStreetDirPrefix', 'AlternateStreetName', 'AlternateStreetNumber', 'CeilingHeightFeet', 'CeilingHeightInches',
  'ChangeType', 'PrivateOutdoorSpaceSize',
];

export const MALLAN_FORM_CONTRACT = {

  aliasToCanonical: {
    // ── Address aliases ──
    Borough: 'CityRegion',              // DB/display name → RLS canonical
    borough: 'CityRegion',              // camelCase form variant
    cityRegion: 'CityRegion',           // camelCase variant
    Neighborhood: 'SubdivisionName',    // Common name → RLS canonical
    neighborhood: 'SubdivisionName',    // camelCase variant
    UnParsedAddress: 'UnparsedAddress',  // A1: legacy capital-P → canonical Cotality UnparsedAddress (lowercase p, live $metadata)
    unparsedAddress: 'UnparsedAddress',
    address: 'UnparsedAddress',
    streetName: 'StreetName',
    streetNumber: 'StreetNumber',
    unit: 'UnitNumber',
    unitNumber: 'UnitNumber',
    zip: 'PostalCode',

    // ── Numeric/unit aliases ──
    Rooms: 'RoomsTotal',               // Short name → RLS canonical
    rooms: 'RoomsTotal',
    beds: 'BedroomsTotal',
    fullBaths: 'BathroomsFull',
    halfBaths: 'BathroomsHalf',
    intSqft: 'LivingArea',
    extSqft: 'BuildingAreaTotal',

    // ── Financial aliases ──
    price: 'ListPrice',
    maintCC: 'AssociationFee',
    reTaxes: 'TaxAnnualAmount',
    Shares: 'NumberOfShares',
    shares: 'NumberOfShares',
    MaxFinancing: 'MaximumFinancingPercent',
    saleMaxFinancing: 'MaximumFinancingPercent',

    // ── Ownership aliases ──
    // OwnershipType is itself a live Cotality field with its own meaning — it is NOT an alias of CommonInterest.
    ownership: 'CommonInterest',

    // ── Status / Permission aliases ──
    status: '_mallanStatus',            // the Mallan business status — NEVER the provider's MlsStatus
    permission: '_mallanPermission',    // Mallan owner-opt-out / participant-only decision (a UCBA fact, not the provider Permission enum)
    listingPrivacy: '_mallanPermission',
    Permissions: '_mallanPermission',   // legacy form key
    Permission: '_mallanPermission',    // a legacy client that sent the provider field name: it is a Mallan decision, stored under a Mallan key
    MlsStatus: '_mallanStatus',         // a legacy client that sent the provider field name: it is a Mallan status, stored under a Mallan key
    addressDisplayYN: 'InternetAddressDisplayYN',
    // idxDisplayYN / idxEntireListingDisplayYN / IDXEntireListingDisplayYN
    // were previously aliased to IDXEntireListingDisplayYN, which does NOT
    // exist on live Trestle (verified 2026-04-19). Redirect ALL three forms
    // (short, camelCase, PascalCase) to the canonical Internet-prefixed gate
    // so any legacy form payload still normalizes correctly.
    idxDisplayYN: 'InternetEntireListingDisplayYN',
    idxEntireListingDisplayYN: 'InternetEntireListingDisplayYN',
    IDXEntireListingDisplayYN: 'InternetEntireListingDisplayYN',
    internetDisplayYN: 'InternetEntireListingDisplayYN',
    // participantOnlyYN / ParticipantOnlyYN (legacy booleans) are folded into `_mallanPermission` by the normalizer.

    // ── Content aliases ──
    description: 'PublicRemarks',
    privateRemarks: 'PrivateRemarks',

    // ── Date aliases ──
    listedDate: 'OnMarketDate',
    comingSoonDate: 'ActivationDate',

    // ── Agreement aliases ──
    listingAgreement: 'ListingAgreement',

    // ── ID aliases ──
    RLSListingId: 'RLSListingID',    // camelCase mismatch
  } as const,

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. VALUE ALIASES — Normalizes incoming field VALUES to RLS enum values.
  //    Form radios/selects may use display text or internal codes.
  // ═══════════════════════════════════════════════════════════════════════════

  valueAliases: {
    _mallanPermission: {
      // Form radio values (from SALE/RENTAL-FORM-REDESIGN.html)
      'RLS-Owner-OptOut': 'OwnerOptOut',
      'RLS-Participant': 'Private',
      // Display text variants
      'Owner Opt-Out': 'OwnerOptOut',
      'Owner Opt Out': 'OwnerOptOut',
      'OWNER_OPT_OUT': 'OwnerOptOut',
      'Participant Only': 'Private',
      'Participant Only Network': 'Private',
      'ParticipantOnly': 'Private',          // Internal legacy name → RLS canonical
      'PARTICIPANT_ONLY': 'Private',
      // Absence = a public listing. Values are MALLAN decisions ('OwnerOptOut' = signed Exhibit B; 'Private' =
      // participant-only); 'OwnerOptOut' is not a live Cotality Permission member and is never written under `Permission`.
    },
    // (no status value aliases: status is a Mallan business status, converted by lib/crm/listing-form-mapping.ts)
    CommonInterest: {
      'Stock Cooperative': 'StockCooperative',
      'Co-op': 'StockCooperative',
      'Coop': 'StockCooperative',
      'Rental Building': 'RentalBuilding',
      'Planned Development': 'PlannedDevelopment',
      'Community Apartment': 'CommunityApartment',
    },
    CityRegion: {
      'Staten Island': 'StatenIsland',
      'New York': 'Manhattan',
      // CountyOrParish → CityRegion cross-references
    },
    ListingAgreement: {
      'Exclusive Right To Sell': 'ExclusiveRightToSell',
      'Exclusive Agency': 'ExclusiveAgency',
      'Exclusive Right To Lease': 'ExclusiveRightToLease',
      'Co-Exclusive': 'CoExclusiveAgency',   // live ListingAgreement member (there is no live 'CoExclusive')
      'Co Exclusive': 'CoExclusiveAgency',
      'Exclusive Right With Exception': 'ExclusiveRightWithException',
    },
    CoBrokeAgreement: {
      'UCBA': 'Ucba',
      'ucba': 'Ucba',
      'RUNDBA': 'Rundba',
      'rundba': 'Rundba',
    },
    Concessions: {
      'Call Listing Agent': 'CallListingAgent',
      'yes': 'Yes',
      'no': 'No',
    },
  } as const,

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. CONDITIONAL RULES — From RLS CSV Requirements/Rules column
  //    Each rule: when conditions match, these additional fields are required.
  //    85 conditional fields organized into logical rule groups.
  // ═══════════════════════════════════════════════════════════════════════════

  persistenceMap: {
    // ── IDs (system-managed) ──
    SourceSystemKey: { raw: true },
    RLSListingID: { raw: true },  // Application convention; CSV calls this ListingID
    ListingId: { raw: true },
    ListingKey: { raw: true },

    // ── Property classification → top-level columns ──
    PropertyType: { db: 'property_type', raw: true },
    PropertySubType: { db: 'property_sub_type', raw: true },
    CommonInterest: { features: true, raw: true },
    StructureType: { features: true, raw: true },

    // ── Price → top-level column ──
    ListPrice: { db: 'list_price', raw: true },

    // ── Status (system-managed, top-level) ──
    // The Mallan business status lives under Mallan keys. MlsStatus / StandardStatus are Cotality fields and are
    // NEVER persisted for a Mallan-authored listing (the `status` column is set by the routes from `_mallanStatus`).
    _mallanStatus: { raw: true },
    _crmWorkflowStatus: { raw: true },

    // ── Agent / Office → agentInfo bucket ──
    ListAgentMlsId: { agentInfo: true, raw: true },
    ListAgentKey: { agentInfo: true, raw: true },
    ListAgentFullName: { agentInfo: true, raw: true },
    ListAgentEmail: { agentInfo: true, raw: true },
    ListAgentDirectPhone: { agentInfo: true, raw: true },
    ListOfficeName: { agentInfo: true, raw: true },
    ListOfficeKey: { agentInfo: true, raw: true },
    ListOfficeMlsId: { agentInfo: true, raw: true },

    // ── Agreement / Broker terms ──
    ListingAgreement: { raw: true },
    CoBrokeAgreement: { raw: true },
    Concessions: { raw: true },
    ConcessionsAmount: { raw: true },
    ConcessionsComments: { raw: true },

    // ── Address → address bucket + top-level columns ──
    StreetNumber: { address: true, raw: true },
    StreetDirPrefix: { address: true, raw: true },
    StreetName: { address: true, raw: true },
    StreetSuffix: { address: true, raw: true },
    StreetDirSuffix: { address: true, raw: true },
    UnitNumber: { address: true, raw: true },
    City: { address: true, db: 'city', raw: true },
    CityRegion: { address: true, db: 'borough', raw: true },
    SubdivisionName: { address: true, db: 'neighborhood', raw: true },
    StateOrProvince: { address: true, raw: true },
    PostalCode: { address: true, db: 'postal_code', raw: true },
    PostalCity: { address: true, raw: true },
    CountyOrParish: { address: true, raw: true },
    UnparsedAddress: { address: true, raw: true }, // A1: canonical Cotality key (lowercase p); legacy UnParsedAddress normalizes here via aliasToCanonical
    BuildingName: { address: true, raw: true },

    // ── Content → features bucket ──
    PublicRemarks: { features: true, raw: true },
    PrivateRemarks: { features: true, raw: true },
    ShowingInstructions: { features: true, raw: true },

    // ── Permission (Cotality Multi.ListingPermission) → derive booleans + raw ──
    // A2 (2026-05-30): canonical key is `Permission` (singular). Legacy `Permissions`
    // payloads are aliased to `Permission` by normalizePayload before this runs.
    // Mallan owner-opt-out / participant-only decision → the two gate columns. Not the provider Permission enum.
    _mallanPermission: {
      raw: true,
      deriveBooleans: {
        'OwnerOptOut': { db: 'owner_opt_out' },
        'Private': { db: 'participant_only' },
      },
      defaultPublic: true, // no value = public listing
    },

    // ── Distribution gates → top-level boolean columns ──
    // IDXEntireListingDisplayYN and SyndicateYN do NOT exist on live Trestle
    // (verified 2026-04-19). The legacy `idx_display_yn` DB column is left in
    // place for backwards compat but is no longer populated by submissions.
    InternetEntireListingDisplayYN: { db: 'internet_entire_listing_display_yn', raw: true },
    InternetAddressDisplayYN: { db: 'internet_address_display_yn', raw: true },
    InternetAutomatedValuationDisplayYN: { raw: true },
    InternetConsumerCommentYN: { raw: true },
    SyndicateTo: { raw: true },

    // ── Dates → top-level columns + raw ──
    OriginalEntryTimestamp: { raw: true },
    OnMarketDate: { raw: true },
    ActivationDate: { raw: true },
    ExpirationDate: { raw: true },
    ListingContractDate: { db: 'listing_contract_date', raw: true },
    OffMarketDate: { raw: true },
    CloseDate: { raw: true },
    ClosePrice: { raw: true },
    CancellationDate: { raw: true },
    WithdrawnDate: { raw: true },
    PurchaseContractDate: { raw: true },
    AvailabilityDate: { raw: true },

    // ── Unit info → top-level columns ──
    BedroomsTotal: { db: 'bedrooms_total', raw: true },
    BathroomsFull: { db: 'bathrooms_full', raw: true },
    BathroomsHalf: { db: 'bathrooms_half', raw: true },
    BathroomsTotal: { features: true, raw: true },
    RoomsTotal: { features: true, raw: true },

    // ── Area → top-level + features ──
    LivingArea: { db: 'living_area', raw: true },
    LivingAreaUnits: { features: true, raw: true },
    BuildingAreaTotal: { features: true, raw: true },
    BuildingAreaUnits: { features: true, raw: true },
    LotSizeArea: { features: true, raw: true },
    LotSizeDimensions: { features: true, raw: true },
    LotSizeUnits: { features: true, raw: true },

    // ── Building info → features bucket ──
    AttendanceType: { features: true, raw: true },
    BuildingLaundryFeatures: { features: true, raw: true },
    BuildingPetsAllowed: { features: true, raw: true },
    BuildingPetsAllowedComments: { features: true, raw: true },
    PetsAllowed: { features: true, raw: true },
    PetsAllowedComments: { features: true, raw: true },
    BuildingTaxLot: { features: true, raw: true }, // LEGACY/compatibility only — canonical Cotality field is TaxLot (below). Routes old raw_data.BuildingTaxLot on reload; NOT mandatory authority (see requiredFields H1 note).
    TaxBlock: { features: true, raw: true },
    TaxLot: { features: true, raw: true },
    ElevatorsTotal: { features: true, raw: true },
    GarageYN: { features: true, raw: true },
    GarageSpaces: { features: true, raw: true },
    NumberOfUnitsTotal: { features: true, raw: true },
    StoriesTotal: { features: true, raw: true },
    NewConstructionYN: { features: true, raw: true },
    NewDevelopmentYN: { features: true, raw: true },
    YearBuilt: { features: true, raw: true },

    // ── Financial (condo/co-op/building) → features bucket ──
    AssociationFee: { features: true, raw: true },
    AssociationFeeFrequency: { features: true, raw: true },
    // Group 4 (Cotality-clean 2026-05-30): FlipTax / FlipTaxType / FlipTaxRemarks /
    // TaxAbatementYN / TaxAbatementComments / SponsorUnitYN are REBNY-internal fields
    // ABSENT from live Cotality $metadata. They are NOT mandatory and NOT Cotality
    // canonical — but they ARE retained in the features bucket because consumers read
    // them (e.g. app/api/buildings/search reads features.SponsorUnitYN). Canonical emit
    // is intentionally NOT changed (would break those readers). Internal feature fields.
    FlipTax: { features: true, raw: true },
    FlipTaxType: { features: true, raw: true },
    FlipTaxRemarks: { features: true, raw: true },
    MaximumFinancingPercent: { features: true, raw: true },
    MaximumFinancingRemarks: { features: true, raw: true },
    NumberOfShares: { features: true, raw: true },
    PercentOfCommonElements: { features: true, raw: true },
    TaxAbatementYN: { features: true, raw: true },
    TaxAbatementComments: { features: true, raw: true },
    TaxAbatementExpirationYear: { features: true, raw: true },
    TaxMonthlyAmount: { features: true, raw: true },
    TaxAnnualAmount: { features: true, raw: true },
    SpecialListingConditions: { features: true, raw: true },

    // ── Rental-specific → features bucket ──
    Furnished: { features: true, raw: true },
    FurnishedListPrice: { features: true, raw: true },
    FurnishedMinLeaseMonths: { features: true, raw: true },
    FurnishedMaxLeaseMonths: { features: true, raw: true },
    LeaseType: { features: true, raw: true },
    MinLeaseMonths: { features: true, raw: true },

    // ── Physical features → features bucket ──
    PropertyCondition: { features: true, raw: true },
    Flooring: { features: true, raw: true },
    Heating: { features: true, raw: true },
    Cooling: { features: true, raw: true },
    Appliances: { features: true, raw: true },
    InteriorFeatures: { features: true, raw: true },
    ExteriorFeatures: { features: true, raw: true },
    FireplaceYN: { features: true, raw: true },
    FireplacesTotal: { features: true, raw: true },
    FireplaceFeatures: { features: true, raw: true },
    ArchitecturalStyle: { features: true, raw: true },
    ConstructionMaterials: { features: true, raw: true },
    View: { features: true, raw: true },
    ViewRemarks: { features: true, raw: true }, // LEGACY/internal-only — PHANTOM (absent from live Cotality $metadata); routes if present but is NOT a feed-valid or mandatory field (see VIEW-001 H2 note).
    SponsorUnitYN: { features: true, raw: true },

    // ── Showing ──
    ShowingStartTime: { raw: true },
    ShowingEndTime: { raw: true },

    // ── Buyer agent (close context) → raw only ──
    BuyerAgentMlsId: { raw: true },
    BuyerAgentRLSParticipantYN: { raw: true },
    BuyerAgentFullName: { raw: true },
    BuyerAgentDirectPhone: { raw: true },
    BuyerAgentEmail: { raw: true },
    BuyerAgentStateLicense: { raw: true },
    BuyerOfficeName: { raw: true },
    BuyerOfficePhone: { raw: true },

    // ── REMOVED FIELDS — hard block, never persist ──
    BuyerAgencyCompensation: { raw: false, removed: true },
    BuyerAgencyCompensationType: { raw: false, removed: true },
    SubAgencyCompensation: { raw: false, removed: true },
    SubAgencyCompensationType: { raw: false, removed: true },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. PUBLIC DISPLAY RULES — When to suppress from public-facing pages
  // ═══════════════════════════════════════════════════════════════════════════

  idDomains: {
    dbPrimaryId: {
      field: 'id',
      kind: 'database-primary-key' as const,
      public: false,
      description: 'Prisma BigInt auto-increment',
    },
    internalListingId: {
      field: 'listing_id',
      kind: 'crm-local-listing-id' as const,
      public: false,
      patterns: ['^SL-[0-9]{4,}$', '^RL-[0-9]{4,}$'],
      description: 'Generated by POST route: SL- for sales, RL- for rentals',
    },
    sourceSystemKey: {
      field: 'SourceSystemKey',
      kind: 'lmp-stable-submission-id' as const,
      public: false,
      required: true,
      description: 'LMP submission ID — stable across edits',
    },
    trestleListingKey: {
      field: 'ListingKey',
      kind: 'odata-primary-key' as const,
      public: false,
      description: 'Trestle OData primary key — used for API queries',
    },
    trestleListingId: {
      field: 'ListingId',
      kind: 'matrix-generated-rls-number' as const,
      public: false,
      description: 'Matrix-assigned RLS number — visible in Trestle UI',
    },
    rlsListingId: {
      field: 'RLSListingID',
      kind: 'public-syndication-id' as const,
      public: true,
      patterns: ['^RLS[0-9]+$'],
      description: 'Public-facing ID used in syndication and attribution',
    },
  },
} as const;

export type CanonicalFieldName = keyof typeof MALLAN_FORM_CONTRACT.persistenceMap;
export type AliasFieldName = keyof typeof MALLAN_FORM_CONTRACT.aliasToCanonical;
