/**
 * REBNY_FIELD_TABLES — CRM listing-write field tables
 *
 * Read by the CRM listing write path (lib/compliance/normalizer.ts and the
 * listing write-path enforcement gate). These tables are not provider authority.
 * Field names, enums and permissions come from the live Cotality contract
 * (data/cotality-enums.live.json is its committed copy); use and display
 * obligations come from UCBA 2026 (January revision), REBNY rules and the
 * NAR Settlement (August 2024, effective August 2025). The authority order is
 * MALLAN-PLATFORM-MASTER-PLAN.md §0 and §21.
 *
 * Every provider field name, alias target and enum value here must match the
 * live Cotality contract. A key that is not a top-level live Cotality field is
 * one of: an NYC fact the provider carries inside CustomProperty.CustomFields
 * (e.g. SponsorUnitYN); a Mallan listing field (e.g. a commercial or
 * private-listing field), which is Mallan's and never presented as provider
 * data; or a legacy entry awaiting convergence
 * (docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md §11 "Open"). Classify a
 * key before removing it; absence from Cotality alone does not make it obsolete.
 * Anything uncertain fails closed — it defaults to NON-DISPLAY.
 */

export const REBNY_FIELD_TABLES = {

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. REQUIRED FIELDS — unconditionally required when the RLS write-path gate runs
  //    on an RLS-eligible listing (website-only listings, rls_eligible === false,
  //    skip the gate). Split into agent-submitted vs system-generated.
  // ═══════════════════════════════════════════════════════════════════════════

  requiredFields: {
    /**
     * Agent-submitted: these MUST be present in the form payload.
     * Enforcement gate rejects if any are missing.
     */
    agentSubmitted: [
      // Property identification
      'PropertyType',
      'PropertySubType',
      'StructureType',
      'CommonInterest',
      'ListPrice',
      'MlsStatus',

      // Agent / Office / Agreement
      'ListAgentMlsId',
      'ListingAgreement',
      // CoBrokeAgreement reclassified (Cotality-clean sweep 2026-05-30): absent
      // from live Cotality $metadata (REBNY-internal concept, no Cotality field).
      // Not mandatory — the form still emits it to raw_data for internal use.
      // Phantom fields cannot be mandatory (authority = live $metadata).
      'Concessions',

      // Address (live Cotality names — CityRegion, not Borough; UnparsedAddress with a lowercase p)
      'StreetNumber',
      'StreetName',
      'City',
      'CityRegion',
      'StateOrProvince',
      'PostalCode',
      'PostalCity',
      'CountyOrParish',
      'SubdivisionName',
      // A1 (Cotality-clean 2026-05-30): live Cotality field is `UnparsedAddress`
      // (lowercase p). `UnParsedAddress` (capital P) was a stale spelling; it is
      // now a legacy alias only. All readers (slug/DTO/validator) use lowercase.
      'UnparsedAddress',

      // Building info
      // AttendanceType / BuildingLaundryFeatures / BuildingPetsAllowed reclassified
      // (Cotality-clean sweep 2026-05-30): absent from live Cotality $metadata
      // (REBNY-internal; no Cotality field). Not mandatory — the form still emits
      // them to the features bucket for internal use. Phantom fields cannot be
      // mandatory. (PetsAllowed IS a live Cotality field and stays required.)
      'PetsAllowed',
      // H1 (2026-05-30): TaxLot is the live Cotality field; BuildingTaxLot is a
      // PHANTOM (absent from live $metadata). The sales form emits canonical
      // TaxLot (audit F2) — the mandatory list must require TaxLot, not the
      // phantom, or an rls-eligible residential POST 422s even with a filled
      // tax lot. Legacy raw_data.BuildingTaxLot still reloads via SALE_FIELD_MAP
      // fallbackRls; it is NOT the mandatory authority.
      'TaxLot',
      'TaxBlock',
      // ElevatorsTotal and NewDevelopmentYN were reclassified the same way (2026-10-09): neither is in live Cotality $metadata (the Sale form already
      // keeps both internal and sends neither), so a gate that required them refused every Sale listing. Their values persist under the forms' own keys.
      'GarageYN',
      'NumberOfUnitsTotal',
      'StoriesTotal',
      'NewConstructionYN',
      'YearBuilt',

      // Unit info
      'BathroomsFull',
      'BathroomsHalf',
      // A3 (Cotality-clean 2026-05-30): the Cotality field is BathroomsTotalInteger
      // (Int32); the form computes a half-weighted DECIMAL total (Mallan-internal
      // display value), not that integer. The bathroom count is already covered by
      // mandatory BathroomsFull/BathroomsHalf, so internal BathroomsTotal is not
      // mandatory (phantom names can't be mandatory). It still flows to features
      // for the validator/display calc.
      'BedroomsTotal',
      'RoomsTotal',

      // Distribution gates — IDXEntireListingDisplayYN and SyndicateYN do NOT
      // exist on live Cotality (verified 2026-04-19). Use Internet-prefixed gates
      // and SyndicateTo (multi-select).
      'InternetEntireListingDisplayYN',
      'InternetAddressDisplayYN',
      'InternetAutomatedValuationDisplayYN',
      'InternetConsumerCommentYN',
      'SyndicateTo',

      // Content / Dates
      'PublicRemarks',
      'ShowingInstructions',
      'ExpirationDate',
      'ListingContractDate',
    ] as const,

    /**
     * System-generated: required by RLS but set by backend, not form payload.
     * Backend MUST populate these before RLS submission.
     */
    systemGenerated: [
      'SourceSystemKey',       // LMP-assigned stable submission ID
      'OriginalEntryTimestamp', // Set to creation timestamp
      'StandardStatus',        // Mirrors MlsStatus (backend sets)
      'BuyerAgentMlsId',      // Required unconditionally, but only relevant at close
      'OnMarketDate',          // Yes; Conditional: set when MlsStatus=Active
    ] as const,

    /**
     * Additional validation constraints on required fields.
     * Source: Requirements/Rules column notes after "Yes".
     */
    constraints: {
      YearBuilt: { min: 1700, maxYearsInFuture: 10, digits: 4 },
      ExpirationDate: { maxYearsInFuture: 10 },
      ListingContractDate: { maxYearsInFuture: 1 },
      StateOrProvince: { mustEqual: 'NY' },
      City: { mustEqual: 'NewYorkCity' },
      InternetEntireListingDisplayYN: { defaultTo: true, note: 'LMPs required to default True' },
      // SyndicateYN was removed (does not exist on live Cotality 2026-04-19); use SyndicateTo (multi-select).
      SyndicateTo: { defaultTo: 'AllOptedIn', note: 'LMPs default to opt-in to all approved vendors' },
      NewDevelopmentYN: { rejectWhen: { MlsStatus: 'ComingSoon', value: true }, note: 'Cannot be true on Coming Soon' },
      CityRegion: {
        mustMatchCounty: {
          'Bronx': 'Bronx',
          'Brooklyn': 'Kings',
          'Manhattan': 'NewYork',
          'Queens': 'Queens',
          'StatenIsland': 'Richmond',
        },
      },
      ListingAgreement: {
        conditionalRestrictions: [
          { when: { PropertyType: 'Residential' }, reject: 'ExclusiveRightToLease' },
          { when: { PropertyType: 'ResidentialLease' }, reject: 'ExclusiveRightToSell' },
        ],
      },
      PetsAllowed: {
        note: 'If BuildingPetsAllowed = BuildingNo then PetsAllowed must = No',
      },
      StreetName: { rejectIfNotInDictionary: true },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. REMOVED FIELDS — NAR Settlement (Aug 2024, effective Aug 2025)
  //    Hard block: these must NEVER appear in raw_data, DTO, or UI.
  // ═══════════════════════════════════════════════════════════════════════════

  removedFields: [
    'BuyerAgencyCompensation',
    'BuyerAgencyCompensationType',
    'SubAgencyCompensation',
    'SubAgencyCompensationType',
  ] as const,

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. ENUM VALUES — compliance-critical enums only. Full live picklists are in
  //    data/cotality-enums.live.json.
  // ═══════════════════════════════════════════════════════════════════════════

  enumValues: {
    PropertyType: ['Residential', 'ResidentialLease'] as const,
    PropertySubType: [
      'Apartment', 'DeededParking', 'Duplex', 'GardenApartment', 'Loft',
      'MixedUse', 'MultiFamily', 'MultiFamilyTownhouse', 'Office',
      'Quadruplex', 'Retail', 'SingleFamilyResidence', 'SingleFamilyTownhouse',
      'Timeshare', 'Triplex', 'UnimprovedLand', 'UnitDuplex',
      'UnitQuadruplex', 'UnitTriplex',
    ] as const,
    ListingAgreement: [
      'ExclusiveRightToSell', 'ExclusiveAgency', 'ExclusiveRightToLease',
      'CoExclusiveAgency', 'ExclusiveRightWithException',
    ] as const,
    CommonInterest: [
      'CommunityApartment', 'Condominium', 'Condop', 'None',
      'PlannedDevelopment', 'RentalBuilding', 'StockCooperative', 'Timeshare',
    ] as const,
    CoBrokeAgreement: ['Rundba', 'Ucba'] as const,
    Concessions: ['CallListingAgent', 'No', 'Yes'] as const,
    MlsStatus: [
      'Active', 'Canceled', 'Closed', 'ComingSoon', 'Expired',
      'Hold', 'Incomplete', 'Pending', 'Withdrawn',
    ] as const,
    StandardStatus: [
      'Active', 'Canceled', 'Closed', 'ComingSoon', 'Expired', 'Hold',
    ] as const,
    Permissions: ['OwnerOptOut', 'Private'] as const,
    StructureType: [
      'Duplex', 'HighRise', 'HotelMotel', 'House', 'Loft',
      'ManufacturedHouse', 'MixedUse', 'MultiFamily', 'None',
      'Quadruplex', 'Townhouse', 'Triplex', 'WalkUp',
    ] as const,
    CityRegion: ['Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'StatenIsland'] as const,
    CountyOrParish: ['Bronx', 'Kings', 'NewYork', 'Queens', 'Richmond'] as const,
    StateOrProvince: ['NY'] as const,
    AttendanceType: [
      'ConciergeFullTime', 'ConciergePartTime', 'ConciergeYes',
      'DoormanFullTime', 'DoormanPartTime', 'DoormanYes',
      'ElevatorAttendanceFullTime', 'ElevatorAttendancePartTime', 'ElevatorAttendanceYes',
      'LobbyAttendantFullTime', 'LobbyAttendantPartTime', 'LobbyAttendantYes',
      'None', 'VideoDoormanFullTime', 'VideoDoormanPartTime', 'VideoDoormanYes',
    ] as const,
    BuildingLaundryFeatures: [
      'CoinOperated', 'CommonArea', 'DryCleaningService', 'ElectricDryerHookup',
      'GasDryerHookup', 'InBasement', 'InCarport', 'InGarage', 'InHall', 'Inside',
      'InUnit', 'LaundryDropOffService', 'LowerLevel', 'MainLevel',
      'MultipleLocations', 'None', 'OnCommonFloor', 'Other', 'Outside',
      'SeeRemarks', 'UpperLevel', 'WasherDryerInstallAllowed', 'WasherHookup',
    ] as const,
    BuildingPetsAllowed: [
      'BuildingBreedRestrictions', 'BuildingCatsOK', 'BuildingDogsOK',
      'BuildingNo', 'BuildingNumberLimit', 'BuildingSizeLimit', 'BuildingYes',
    ] as const,
    // The unit-level members of the live Cotality PetsAllowed list (data/cotality-enums.live.json) the forms offer; the live list also carries Building* members and others.
    PetsAllowed: [
      'BreedRestrictions', 'CatsOk', 'DogsOk', 'No',
      'NumberLimit', 'SizeLimit', 'Yes',
    ] as const,
    Furnished: ['Furnished', 'Negotiable', 'Partially', 'Unfurnished'] as const,
    LeaseType: ['NonStabilizedLease', 'StabilizedLease'] as const,
    SpecialListingConditions: [
      'Auction', 'BankruptcyProperty', 'BoardApprovalNotRequired',
      'BoardApprovalRequired', 'HudOwned', 'InForeclosure',
      'NoticeOfDefault', 'ProbateListing', 'RealEstateOwned',
      'ShortSale', 'Standard', 'ThirdPartyApproval',
    ] as const,
    FlipTaxType: ['Dollars', 'Other', 'Percent', 'SeeRemarks'] as const,
    PropertyCondition: ['Excellent', 'Fair', 'Good', 'Poor'] as const,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. ALIAS TO CANONICAL — Normalizes incoming payload field names to
  //    canonical field names BEFORE validation or persistence.
  //    Direction: alias → canonical (the live Cotality name where the field is live)
  // ═══════════════════════════════════════════════════════════════════════════

  aliasToCanonical: {
    // ── Address aliases ──
    Borough: 'CityRegion',              // DB/display name → Cotality CityRegion
    borough: 'CityRegion',              // camelCase form variant
    cityRegion: 'CityRegion',           // camelCase variant
    Neighborhood: 'SubdivisionName',    // Common name → Cotality SubdivisionName
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
    Rooms: 'RoomsTotal',               // Short name → Cotality RoomsTotal
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
    OwnershipType: 'CommonInterest',
    ownership: 'CommonInterest',

    // ── Status / Permission aliases ──
    status: 'MlsStatus',
    permission: 'Permission',
    listingPrivacy: 'Permission',
    Permissions: 'Permission',  // A2 (2026-05-30): legacy plural → canonical Cotality Permission (singular, live $metadata Multi.ListingPermission)
    addressDisplayYN: 'InternetAddressDisplayYN',
    // idxDisplayYN / idxEntireListingDisplayYN / IDXEntireListingDisplayYN
    // were previously aliased to IDXEntireListingDisplayYN, which does NOT
    // exist on live Cotality (verified 2026-04-19). Redirect ALL three forms
    // (short, camelCase, PascalCase) to the canonical Internet-prefixed gate
    // so any legacy form payload still normalizes correctly.
    idxDisplayYN: 'InternetEntireListingDisplayYN',
    idxEntireListingDisplayYN: 'InternetEntireListingDisplayYN',
    IDXEntireListingDisplayYN: 'InternetEntireListingDisplayYN',
    internetDisplayYN: 'InternetEntireListingDisplayYN',
    // participantOnlyYN no longer exists on live Cotality — it's encoded via
    // Permission='Private'. Form payloads still ship participantOnlyYN as a
    // boolean from legacy checkboxes; the alias keeps the routing intact, but
    // downstream gate code reads `Permission` directly.
    participantOnlyYN: 'Permission',
    ParticipantOnlyYN: 'Permission',

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
  // 5. VALUE ALIASES — Normalizes incoming field VALUES to canonical enum values.
  //    Form radios/selects may use display text or internal codes.
  // ═══════════════════════════════════════════════════════════════════════════

  valueAliases: {
    Permission: {
      // Form radio values (from SALE/RENTAL-FORM-REDESIGN.html)
      'RLS-Owner-OptOut': 'OwnerOptOut',
      'RLS-Participant': 'Private',
      // Display text variants
      'Owner Opt-Out': 'OwnerOptOut',
      'Owner Opt Out': 'OwnerOptOut',
      'OWNER_OPT_OUT': 'OwnerOptOut',
      'Participant Only': 'Private',
      'Participant Only Network': 'Private',
      'ParticipantOnly': 'Private',          // Internal legacy name → Cotality Permission 'Private'
      'PARTICIPANT_ONLY': 'Private',
      // NOTE: Absence of a Permission value = public listing (handled by defaultPublic in
      // persistenceMap). The live Cotality Permission enum does carry 'Public' and has no
      // 'OwnerOptOut' (data/cotality-enums.live.json). 'OwnerOptOut' is a Mallan value that
      // drives the owner_opt_out display gate (UCBA Art. I §5(A)); it stays, failing closed,
      // until a live field or value replaces it.
    },
    MlsStatus: {
      'Coming Soon': 'ComingSoon',
      'coming_soon': 'ComingSoon',
      'Temporarily Off Market': 'Hold',
      'Active Under Contract': 'Pending',
      'Under Contract': 'Pending',
    },
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
      'Co-Exclusive': 'CoExclusiveAgency',
      'Co Exclusive': 'CoExclusiveAgency',
      // Legacy INPUT alias only: Mallan once stored this non-live value; normalize it to the live Cotality enum member.
      'CoExclusive': 'CoExclusiveAgency',
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
  // 6. CONDITIONAL RULES — field requirements that apply when a rule's conditions match.
  //    Each rule: when conditions match, these additional fields are required.
  //    A rule may name only fields of the live Cotality Property resource (data/cotality-enums.live.json): a field Cotality does not have can never be
  //    sent, so a rule that required it refused every listing it applied to (the 19 rules and the fields of 4 more that did were removed 2026-10-09).
  //    lib/compliance/__tests__/rebny-field-tables-live-parity.test.ts pins it.
  // ═══════════════════════════════════════════════════════════════════════════

  conditionalRules: [
    // ── Condo / Co-op / Condop financial fields ──
    {
      code: 'CONDO-COOP-001',
      description: 'Condo/Co-op/Condop require AssociationFee and SpecialListingConditions',
      appliesWhen: {
        PropertyType: ['Residential'],
        CommonInterest: ['Condominium', 'StockCooperative', 'Condop'],
      },
      requireFields: [
        'AssociationFee',
        'SpecialListingConditions',
      ],
    },
    {
      code: 'CONDO-COOP-002',
      description: 'AssociationFeeFrequency required if AssociationFee > 0',
      appliesWhen: {
        PropertyType: ['Residential'],
        CommonInterest: ['Condominium', 'StockCooperative', 'Condop'],
        AssociationFee: { gt: 0 },
      },
      requireFields: ['AssociationFeeFrequency'],
    },

    // ── Condo only ──
    {
      code: 'CONDO-001',
      description: 'Condo requires LivingArea, TaxLot and the annual tax',
      appliesWhen: {
        PropertyType: ['Residential'],
        CommonInterest: ['Condominium'],
      },
      // The rule asked for TaxMonthlyAmount, which is not a Cotality field (the live one is the ANNUAL TaxAnnualAmount, which both Add forms send); the 2026-10-09 trim dropped the tax
      // altogether, so a condo needed no tax figure. The live field takes its place. UNRESOLVED - LIVE COTALITY/REBNY CONTRACT EVIDENCE REQUIRED: that REBNY wants the tax of a condo is the
      // old table's statement; the rule text was not supplied.
      requireFields: [
        'LivingArea',
        'TaxLot',
        'TaxAnnualAmount',
      ],
    },

    // ── Building / Townhouse / Multi-family ──
    {
      code: 'BUILDING-001',
      description: 'Townhouse/Multi-family require BuildingAreaTotal, TaxAnnualAmount, LotSize',
      appliesWhen: {
        PropertyType: ['Residential'],
        PropertySubType: [
          'SingleFamilyTownhouse', 'MultiFamilyTownhouse',
          'SingleFamilyResidence', 'MultiFamily', 'MixedUse',
          'Duplex', 'Triplex', 'Quadruplex', 'UnimprovedLand',
        ],
      },
      requireFields: [
        'BuildingAreaTotal',
        'TaxAnnualAmount',
        'LotSizeArea',
        'LotSizeDimensions',
      ],
    },

    // ── Rental ──
    {
      code: 'RENTAL-001',
      description: 'Rentals require AvailabilityDate and Furnished',
      appliesWhen: {
        PropertyType: ['ResidentialLease'],
      },
      requireFields: [
        'AvailabilityDate',
        'Furnished',
      ],
    },

    // ── Status-dependent ──
    {
      code: 'COMINGSOON-001',
      description: 'Coming Soon requires ActivationDate',
      appliesWhen: {
        MlsStatus: ['ComingSoon'],
      },
      requireFields: ['ActivationDate'],
    },
    {
      code: 'ACTIVE-001',
      description: 'Active requires OnMarketDate',
      appliesWhen: {
        MlsStatus: ['Active'],
      },
      requireFields: ['OnMarketDate'],
    },
    {
      code: 'CLOSED-001',
      description: 'Closed requires CloseDate and ClosePrice',
      appliesWhen: {
        MlsStatus: ['Closed'],
      },
      requireFields: [
        'CloseDate',
        'ClosePrice',
      ],
    },
    {
      code: 'CANCELLED-001',
      description: 'Cancelled requires CancellationDate',
      appliesWhen: {
        MlsStatus: ['Canceled'],
      },
      requireFields: ['CancellationDate'],
    },
    {
      code: 'WITHDRAWN-001',
      description: 'Withdrawn requires WithdrawnDate (must equal OffMarketDate)',
      appliesWhen: {
        MlsStatus: ['Withdrawn'],
      },
      requireFields: ['WithdrawnDate'],
    },
    {
      code: 'PENDING-001',
      description: 'Pending requires PurchaseContractDate',
      appliesWhen: {
        MlsStatus: ['Pending'],
      },
      requireFields: ['PurchaseContractDate'],
    },
    {
      code: 'OFFMARKET-001',
      description: 'Off-market statuses require OffMarketDate',
      appliesWhen: {
        MlsStatus: ['Canceled', 'Closed', 'Expired', 'Hold', 'Incomplete', 'Pending', 'Withdrawn'],
      },
      requireFields: ['OffMarketDate'],
    },

    // ── Concessions sub-conditionals ──
    {
      code: 'CONCESSIONS-001',
      description: 'Concession details required if Concessions = Yes',
      appliesWhen: {
        Concessions: ['Yes'],
      },
      requireFields: [
        'ConcessionsAmount',
        'ConcessionsComments',
      ],
    },

    // ── Area units follow-up ──
    {
      code: 'AREA-UNITS-001',
      description: 'LivingAreaUnits required if LivingArea > 0',
      appliesWhen: {
        LivingArea: { gt: 0 },
      },
      requireFields: ['LivingAreaUnits'],
    },
    {
      code: 'AREA-UNITS-002',
      description: 'BuildingAreaUnits required if BuildingAreaTotal is entered',
      appliesWhen: {
        BuildingAreaTotal: { gt: 0 },
      },
      requireFields: ['BuildingAreaUnits'],
    },
    {
      code: 'AREA-UNITS-003',
      description: 'LotSizeUnits required if LotSizeArea >= 0',
      appliesWhen: {
        LotSizeArea: { gte: 0 },
      },
      requireFields: ['LotSizeUnits'],
    },

    // ── Fireplace sub-conditionals ──
    {
      code: 'FIREPLACE-001',
      description: 'Fireplace details required if FireplaceYN = true',
      appliesWhen: {
        FireplaceYN: [true],
      },
      requireFields: ['FireplaceFeatures', 'FireplacesTotal'],
      note: 'CSV also says "OR if FireplaceTotal > 0" — see FIREPLACE-002 for reverse',
    },

    // ── Residential property condition ──
    {
      code: 'CONDITION-001',
      description: 'PropertyCondition required for Residential',
      appliesWhen: {
        PropertyType: ['Residential'],
      },
      requireFields: ['PropertyCondition'],
    },

    // ── Sponsor unit ──
    // SponsorUnitYN and NewDevelopmentYN are not top-level Property fields. They are the NYC facts this table's header says to classify before removing (the provider carries SponsorUnitYN
    // inside CustomProperty.CustomFields; the Mallan Building Profile keeps both as features), and the Sale form sends both as booleans, so these two rules are satisfiable. They were removed
    // on 2026-10-09 with the rules that no form can answer; an independent review found these two were not of that kind.
    {
      code: 'SPONSOR-001',
      description: 'SponsorUnitYN required for new development/construction',
      appliesWhen: {
        PropertyType: ['Residential'],
        NewDevelopmentYN: [true],
      },
      requireFields: ['SponsorUnitYN'],
    },
    {
      code: 'SPONSOR-002',
      description: 'SponsorUnitYN required for new construction',
      appliesWhen: {
        PropertyType: ['Residential'],
        NewConstructionYN: [true],
      },
      requireFields: ['SponsorUnitYN'],
    },

    // ── UnitNumber conditional ──
    {
      code: 'UNIT-001',
      description: 'UnitNumber required for unit-based property types',
      appliesWhen: {
        PropertySubType: [
          'Apartment', 'DeededParking', 'GardenApartment', 'Loft',
          'Office', 'Retail', 'Timeshare', 'UnitDuplex',
          'UnitQuadruplex', 'UnitTriplex',
        ],
      },
      requireFields: ['UnitNumber'],
    },

    // ── Heating/Cooling follow-ups ──
    {
      code: 'COOLING-001',
      description: 'Cooling features required if CoolingYN = true',
      appliesWhen: { CoolingYN: [true] },
      requireFields: ['Cooling'],
    },
    {
      code: 'HEATING-001',
      description: 'Heating features required if HeatingYN = true',
      appliesWhen: { HeatingYN: [true] },
      requireFields: ['Heating'],
    },

    // ── Basement ──
    {
      code: 'BASEMENT-001',
      description: 'Basement details required if BasementYN = true',
      appliesWhen: { BasementYN: [true] },
      requireFields: ['Basement'],
    },

    // ── View ──
    {
      code: 'VIEW-001',
      description: 'View details required if ViewYN = true',
      appliesWhen: { ViewYN: [true] },
      // H2 (2026-05-30): require only canonical `View`. `ViewRemarks` is a
      // PHANTOM — absent from live Cotality $metadata — so it must NOT gate
      // submission. #280 (commit de5dd489) now emits ViewYN=true when a view is
      // selected; requiring the phantom ViewRemarks here 422'd every residential
      // sale that had a view. `View` is the canonical field and the form emits
      // it (data.View = saleViewList).
      requireFields: ['View'],
    },

    // ── Showing times ──
    {
      code: 'SHOWING-001',
      description: 'ShowingEndTime required if ShowingStartTime provided',
      appliesWhen: { ShowingStartTime: { exists: true } },
      requireFields: ['ShowingEndTime'],
    },
    {
      code: 'SHOWING-002',
      description: 'ShowingStartTime required if ShowingEndTime provided',
      appliesWhen: { ShowingEndTime: { exists: true } },
      requireFields: ['ShowingStartTime'],
    },

    // ── Area unit follow-ups ──
    {
      code: 'AREA-UNITS-004',
      description: 'AboveGradeFinishedAreaUnits required if AboveGradeFinishedArea is entered',
      appliesWhen: { AboveGradeFinishedArea: { gt: 0 } },
      requireFields: ['AboveGradeFinishedAreaUnits'],
    },
    {
      code: 'AREA-UNITS-005',
      description: 'BelowGradeFinishedAreaUnits required if BelowGradeFinishedArea is entered',
      appliesWhen: { BelowGradeFinishedArea: { gt: 0 } },
      requireFields: ['BelowGradeFinishedAreaUnits'],
    },

    // ── Fireplace reverse direction ──
    {
      code: 'FIREPLACE-002',
      description: 'FireplaceYN must be true if FireplacesTotal > 0',
      appliesWhen: { FireplacesTotal: { gt: 0 } },
      requireFields: ['FireplaceYN'],
      note: 'Reverse of FIREPLACE-001. Also requires FireplaceFeatures.',
    },

    // ── AssociationFee2 follow-up ──
    {
      code: 'ASSOCFEE2-001',
      description: 'AssociationFee2Frequency required if AssociationFee2 > 0',
      appliesWhen: { AssociationFee2: { gt: 0 } },
      requireFields: ['AssociationFee2Frequency'],
    },

    // ── Country validation ──
    {
      code: 'COUNTRY-001',
      description: 'If Country is submitted, value must be US',
      appliesWhen: { Country: { exists: true } },
      requireFields: ['Country'],
      note: 'Not a required-field rule; value constraint: must equal "US"',
    },

    // ── MoveInCosts follow-up ──
    // MOVEIN-001 was removed: MoveInCostsAmountTotal does NOT exist on live Cotality
    // (data/cotality-enums.live.json; MoveInCosts is a multi-select picklist). The
    // FARE Act fee transparency surface is captured via CustomProperty.AdditionalFee*
    // fields and the MoveInCosts picklist itself.

    // ── Open parking ──
    {
      code: 'PARKING-001',
      description: 'OpenParkingSpaces required if OpenParkingYN = true',
      appliesWhen: { OpenParkingYN: [true] },
      requireFields: ['OpenParkingSpaces'],
    },

  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. CONTENT RULES — Text scanning patterns for compliance
  //    All applied to PublicRemarks (and optionally PrivateRemarks).
  // ═══════════════════════════════════════════════════════════════════════════

  contentRules: {
    fairHousing: [
      '\\b(whites?\\s+only|no\\s+(blacks?|hispanics?|asians?|mexicans?))\\b',
      '\\b(christian\\s+(home|family|neighborhood)|no\\s+(muslims?|jews?|hindus?))\\b',
      '\\bno\\s+(children|kids|families\\s+with\\s+children)\\b',
      '\\b(no\\s+(wheelchairs?|disabled|handicapped)|able[- ]bodied\\s+only)\\b',
      '\\b(no\\s+(section\\s*8|vouchers?|housing\\s+choice))\\b',
      '\\b(citizens?\\s+only|no\\s+immigrants?|legal\\s+residents?\\s+only)\\b',
      '\\b(no\\s+criminal|background\\s+check\\s+required|felons?\\s+need\\s+not)\\b',
    ],
    agentInfo: [
      '\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b',
      '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b',
      '\\bhttps?:\\/\\/\\S+',
      '\\b(contact\\s+me|call\\s+me|listed\\s+by|exclusive\\s+with)\\b',
    ],
    offMarket: [
      '\\boff[- ]?market\\b',
      '\\bpocket\\s+listing\\b',
      '\\bwhisper\\s+listing\\b',
      '\\bquiet\\s+listing\\b',
      '\\bpre[- ]?market\\b',
    ],
    compensation: [
      '\\b\\d+(\\.\\d+)?%\\s*(commission|co-?broke?)\\b',
      '\\bbuyer\\s+pays?\\s+no\\b',
      '\\bclosing\\s+cost\\s+credit\\b',
      '\\bbonus\\s+commission\\b',
      '\\bseller\\s+concession\\b',
    ],
    freeService: [
      '\\b(no\\s*fee|no\\s*cost|free)\\b.{0,40}\\b(broker(age)?|agent|representation|service|commission|fee)\\b',
      '\\b(broker(age)?|agent|representation|service|commission|fee)\\b.{0,40}\\b(no\\s*fee|no\\s*cost|free)\\b',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. PERSISTENCE MAP — Canonical field → DB target
  //    Shows where each field lands in Prisma schema.
  //    Buckets: address (Json), features (Json), agentInfo (Json),
  //             compliance (Json), raw_data (Json), or top-level column.
  // ═══════════════════════════════════════════════════════════════════════════

  persistenceMap: {
    // ── IDs (system-managed) ──
    SourceSystemKey: { raw: true },
    RLSListingID: { raw: true },  // Application convention, not a live Cotality field (the live RLS number is ListingId)
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
    MlsStatus: { db: 'status', raw: true },
    StandardStatus: { raw: true },

    // ── Agent / Office → agentInfo bucket ──
    ListAgentMlsId: { agentInfo: true, raw: true },
    ListAgentKey: { agentInfo: true, raw: true },
    ListAgentFullName: { agentInfo: true, raw: true },
    ListAgentEmail: { agentInfo: true, raw: true },
    ListAgentDirectPhone: { agentInfo: true, raw: true },
    ListOfficeName: { agentInfo: true, raw: true },
    ListOfficeKey: { agentInfo: true, raw: true },
    ListOfficeMlsId: { agentInfo: true, raw: true },
    // Co-list side: only slot 1's two MLS IDs have typed columns (co_list_agent_mls_id, co_list_office_mls_id). Every other co-list key
    // (names, keys, CoListAgent2/3, CoListOffice2) is kept in raw_data, which stores the whole normalized payload.
    CoListAgentMlsId: { agentInfo: true, raw: true },
    CoListOfficeMlsId: { agentInfo: true, raw: true },

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
    Permission: {
      raw: true,
      deriveBooleans: {
        'OwnerOptOut': { db: 'owner_opt_out' },
        'Private': { db: 'participant_only' },
      },
      defaultPublic: true, // No Permissions value = public listing
    },

    // ── Distribution gates → top-level boolean columns ──
    // IDXEntireListingDisplayYN and SyndicateYN do NOT exist on live Cotality
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

  publicDisplay: {
    hideWhenPermissions: ['OwnerOptOut', 'Private'] as const,
    hideWhenMlsStatus: ['Closed', 'Expired'] as const,
    suppressFromPublicSearch: ['Hold', 'Incomplete', 'Withdrawn', 'Canceled'] as const,

    // IDX display gates — must be true for listing to appear on IDX. Live Cotality
    // (verified 2026-04-19) consolidates the master display flag into
    // InternetEntireListingDisplayYN. The legacy IDXEntireListingDisplayYN does
    // not exist on Cotality and was removed from this list.
    idxDisplayGates: [
      'InternetEntireListingDisplayYN',
      // 'ListOfficeIDXParticipationYN' — system-generated from REBNY membership, not in form payload
    ] as const,
    permissionsMutualExclusion: {
      note: 'Private and OwnerOptOut CANNOT be selected together. Only one or neither.',
    },
    permissionsTransitionConstraint: {
      note: 'If originally Private or null, CANNOT be changed to OwnerOptOut',
    },

    rentalPublicRule: {
      appliesWhen: { PropertyType: 'ResidentialLease' },
      field: 'InternetEntireListingDisplayYN',
      valueRequired: true,
    },
    salePermissionsConstraint: {
      note: 'Sale listings with Permissions=null CANNOT set InternetEntireListingDisplayYN to false',
    },

    addressSuppression: {
      field: 'InternetAddressDisplayYN',
      whenFalse: ['StreetNumber', 'StreetName', 'UnitNumber', 'UnParsedAddress'],
      note: 'Hide street-level address from public DTO; retain borough/zip/neighborhood',
    },

    comingSoonBadge: 'Coming Soon. No Showings or Open House until {ActivationDate}',
    comingSoonRestrictions: {
      maxDays: 14,                    // UCBA Art. I Sec. 16, Rule 2
      salesOnly: true,                // Rule 1: NOT rentals
      noNewDevelopment: true,          // Rule 2: NOT new developments
      noDomAccrual: true,              // DOM does not accrue
      noShowings: true,                // Rule 3: No showings under any circumstances
      noOpenHouses: true,              // Rule 4: No open houses (including broker tours)
      noNegotiations: true,            // Rule 5: No negotiations/counteroffers until Active
      activationDateImmutable: true,   // Rule 12: Showing Start Date cannot be changed
      oneTimePerAddress: true,         // Rule 9: One-time per address/owner
      reuseCooldownDays: 60,           // Rule 9: Unless off-market 60+ days
      requireExhibitG: true,           // Rule 10: Owner must sign Coming Soon Authorization
    },

    // Closed listing handling — UCBA Art. I Sec. 6-7
    closedListingRules: {
      removalSLAHours: 24,             // Remove or mark closed within 24 hours
      closingPriceSLAHours: 24,        // ClosePrice must be provided within 24 hours
      statusChangeSLAHours: 24,        // Status changes within 24hrs (excl weekends/postal holidays)
    },

    // Owner Opt-Out — UCBA Art. I Sec. 5(A), Exhibit B
    ownerOptOutRules: {
      requireExhibitB: true,           // Signed Exhibit B required
      exhibitBDeadlineHours: 48,       // Must be received within 48 hours
      noPublicDissemination: true,     // NO public display at any time
      exception: 'Non-automated phone calls and one-to-one personal emails are NOT public dissemination',
    },

    // Attribution — UCBA Art. III Sec. 2(C)
    attributionTemplate: 'Listing Courtesy of {ListOfficeName}',
    attributionNote: 'Must appear in reasonably prominent location, font not smaller than median used on page',

    // Statistical data disclaimer — UCBA Art. VIII Sec. 4
    statisticalDisclaimer: 'Based on information from the REBNY Listing Service for the period {startDate} through {endDate}. This information is deemed reliable but not guaranteed.',

    // Commission negotiability — UCBA Art. I Sec. 17
    commissionNegotiabilityDisclosure: 'Broker commissions are not set by law and are fully negotiable.',
    commissionDisclosureRequired: ['listing_agreement', 'buyer_agreement', 'pre_closing_docs'] as const,

    // Simultaneous distribution — UCBA Art. I Sec. 5
    simultaneousDistribution: {
      note: 'Must disseminate to RLS simultaneously with ANY public dissemination or first showing, whichever is earlier',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. VOW (Virtual Office Website) DISPLAY RULES
  //     VOW = client portal requiring login. Shows more data than IDX.
  //     Source: UCBA 2026
  // ═══════════════════════════════════════════════════════════════════════════

  vowDisplayRules: {
    requiresLogin: true,
    description: 'VOW users (logged-in clients) see additional data beyond public IDX display',
    additionalFieldsOverIDX: [
      // VOW shows these fields that IDX does not:
      'PrivateRemarks',          // Only visible to VOW users, never IDX/public
      'ShowingInstructions',     // Visible to logged-in clients
      'ListAgentDirectPhone',    // Agent contact visible to VOW users
      'ListAgentEmail',          // Agent contact visible to VOW users
    ] as const,
    restrictions: {
      noAutomatedValuation: 'InternetAutomatedValuationDisplayYN must be respected',
      noConsumerComment: 'InternetConsumerCommentYN must be respected',
      noDownload: 'Data cannot be bulk downloaded or scraped',
      noRedistribution: 'Cannot redistribute to non-registered users',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. DOM (DAYS ON MARKET) — UCBA 2026 rules
  // ═══════════════════════════════════════════════════════════════════════════

  domRules: {
    resetDays: 30,  // Was 90, changed to 30 per UCBA 2026
    accruingStatuses: ['Active', 'ActiveUnderContract', 'Pending'] as const,  // UCBA: Pending accrues DOM
    pausingStatuses: ['Hold'] as const,  // UCBA: Temporarily Off Market pauses DOM
    suppressingPermissions: ['OwnerOptOut', 'Private'] as const,
    suppressingStatuses: ['ComingSoon'] as const,
    resetOnClose: true,  // UCBA Art. I Sec. 11: DOM resets on sold/rented (Closed)
    resetTrigger: 'Withdrawn or Canceled for >= 30 consecutive days, then re-activated',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. ID DOMAINS — How listing identifiers work across systems
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

// ═══════════════════════════════════════════════════════════════════════════
// TYPE EXPORTS — For use by normalizer, validator, and persistence layer
// ═══════════════════════════════════════════════════════════════════════════

export type CanonicalFieldName = keyof typeof REBNY_FIELD_TABLES.persistenceMap;
export type AliasFieldName = keyof typeof REBNY_FIELD_TABLES.aliasToCanonical;
export type EnumFieldName = keyof typeof REBNY_FIELD_TABLES.enumValues;
export type RemovedFieldName = typeof REBNY_FIELD_TABLES.removedFields[number];
export type RequiredFieldName = typeof REBNY_FIELD_TABLES.requiredFields.agentSubmitted[number];
export type ConditionalRule = typeof REBNY_FIELD_TABLES.conditionalRules[number];
