/**
 * REBNY_FIELD_TABLES — Single Canonical Field Authority
 *
 * Source of truth: data/rebny-rls-property-fields.csv (902 IDX Plus fields)
 *                  data/rebny-rls-property-lookup.csv (2,066 picklist values)
 *                  UCBA 2026 (January revision)
 *                  NAR Settlement (August 2024, effective August 2025)
 *
 * Every field name, alias, enum, conditional rule, persistence target,
 * display rule, and ID domain is verified against the authoritative RLS CSV.
 *
 * FIELD AUTHORITY ORDER (from MEMORY.md):
 *   1. UCBA governs everything
 *   2. REBNY RLS rules + fields
 *   3. RLS overrides RESO/IDX
 *   4. RESO/IDX fills gaps
 *   5. INTERNAL-ONLY otherwise
 *   6. Fail closed — any uncertainty defaults to NON-DISPLAY
 */
import { withStatusSpellings } from './listing-status-vocabulary';

export const REBNY_FIELD_TABLES = {

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. REQUIRED FIELDS — Unconditionally required by RLS CSV ("Yes")
  //    53 total from CSV. Split into agent-submitted vs system-generated.
  // ═══════════════════════════════════════════════════════════════════════════

  requiredFields: {
    /**
     * Agent-submitted: these MUST be present in the form payload.
     * Enforcement gate rejects if any are missing.
     * 48 fields (53 total minus 5 system-generated).
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

      // Address (RLS canonical names — note CityRegion NOT Borough, UnParsedAddress NOT UnparsedAddress)
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
      'ElevatorsTotal',
      'GarageYN',
      'NumberOfUnitsTotal',
      'StoriesTotal',
      'NewConstructionYN',
      'NewDevelopmentYN',
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
      // exist on live Trestle (verified 2026-04-19). Use Internet-prefixed gates
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
      // SyndicateYN was removed (does not exist on live Trestle 2026-04-19); use SyndicateTo (multi-select).
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
        note: 'If BuildingPetsAllowed = BuildingNo then PetsAllowed must = UnitNo',
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
  // 3. ENUM VALUES — From data/rebny-rls-property-lookup.csv
  //    Only compliance-critical enums included here. Full picklists available
  //    in the lookup CSV for form dropdowns.
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
      'CoExclusive', 'ExclusiveRightWithException',
    ] as const,
    CommonInterest: [
      'CommunityApartment', 'Condominium', 'Condop', 'None',
      'PlannedDevelopment', 'RentalBuilding', 'StockCooperative', 'Timeshare',
    ] as const,
    CoBrokeAgreement: ['Rundba', 'Ucba'] as const,
    Concessions: ['CallListingAgent', 'No', 'Yes'] as const,
    // STATUS-SPELLING-EXEMPT: picklist VOCABULARY from the RLS lookup CSV, not a
    // predicate over stored status. Provider spellings only, by definition.
    MlsStatus: [
      'Active', 'Canceled', 'Closed', 'ComingSoon', 'Expired',
      'Hold', 'Incomplete', 'Pending', 'Withdrawn',
    ] as const,
    // CORRECTED 2026-08-19 against the LIVE provider, not the lookup CSV.
    // This list previously held 6 values and was missing 5 real members
    // (ActiveUnderContract, Delete, Incomplete, Pending, Withdrawn) — including
    // Pending, whose live population is 6,029. A short list here reads as "the
    // provider has no such status", which is a false provider claim.
    //
    // Evidence, live `api.cotality.com/trestle` on 2026-08-19 (raw + sha256 in
    // `.cache/cotality-authority-m2/raw/`): `/odata/Property/$count?$filter=
    // StandardStatus eq '<X>'` returned HTTP 200 for exactly these 11 strings
    // and HTTP 400 "not a valid enumeration type constant" for Cancelled / Sold
    // / Rented / Leased / Draft / OwnerOptOut / TemporarilyOffMarket.
    // `/odata/$metadata` declares EnumType StandardStatus with these same 11 and
    // no others (used only to prove the probed candidate list was closed).
    //
    // Live populations at that moment: Active 8,103 · Pending 6,029 ·
    // Closed 577,073 · ComingSoon 1 · every other member 0. A 0 count is a
    // POPULATION fact, never grounds for dropping a member from the vocabulary.
    //
    // NOTE the enum-level split with `MlsStatus` above. They are DIFFERENT
    // vocabularies and must not be merged — but their evidential status also
    // differs, and that difference is load-bearing:
    //   StandardStatus  every member PROBED (HTTP 200 per value). SUPPORTED.
    //   MlsStatus       members are DECLARED by `$metadata` (25 there, adding
    //                   Contingent, Terminated, Leased, CanceledRelisted, the
    //                   Pending* variants, …) but CANNOT be probed: live
    //                   2026-08-19, `$filter=MlsStatus eq 'Active'` and
    //                   `$orderby=MlsStatus` both return HTTP 400 — "Results
    //                   from 'RLS' has been suppressed (provider Level) as field
    //                   MlsStatus' cannot be used for filtering or ordering
    //                   queries". `$select` works (HTTP 200) but returned
    //                   MlsStatus: null on every sampled row.
    // So the 9-value MlsStatus list above is UNVERIFIED — a CSV snapshot that no
    // probe can confirm or refute. Do not promote it to proven, do not expand it
    // from `$metadata` (which over-declares), and do not build any query,
    // filter or gate on MlsStatus.
    // STATUS-SPELLING-EXEMPT: the live provider ENUM declaration. Only strings
    // the provider accepts belong here; `Cancelled` is HTTP 400 at the provider.
    StandardStatus: [
      'Active', 'ActiveUnderContract', 'Canceled', 'Closed', 'ComingSoon',
      'Delete', 'Expired', 'Hold', 'Incomplete', 'Pending', 'Withdrawn',
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
    PetsAllowed: [
      'UnitBreedRestrictions', 'UnitCatsOK', 'UnitDogsOK', 'UnitNo',
      'UnitNumberLimit', 'UnitSizeLimit', 'UnitYes',
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
  //    RLS canonical names BEFORE validation or persistence.
  //    Direction: alias → canonical (RLS MatrixFieldName from CSV)
  // ═══════════════════════════════════════════════════════════════════════════

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
    // exist on live Trestle (verified 2026-04-19). Redirect ALL three forms
    // (short, camelCase, PascalCase) to the canonical Internet-prefixed gate
    // so any legacy form payload still normalizes correctly.
    idxDisplayYN: 'InternetEntireListingDisplayYN',
    idxEntireListingDisplayYN: 'InternetEntireListingDisplayYN',
    IDXEntireListingDisplayYN: 'InternetEntireListingDisplayYN',
    internetDisplayYN: 'InternetEntireListingDisplayYN',
    // participantOnlyYN no longer exists on live Trestle — it's encoded via
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
  // 5. VALUE ALIASES — Normalizes incoming field VALUES to RLS enum values.
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
      'ParticipantOnly': 'Private',          // Internal legacy name → RLS canonical
      'PARTICIPANT_ONLY': 'Private',
      // NOTE: 'Public' is NOT a valid Permissions enum in RLS CSV.
      // Absence of Permissions value = public listing (handled by defaultPublic in persistenceMap).
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
      'Co-Exclusive': 'CoExclusive',
      'Co Exclusive': 'CoExclusive',
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

  conditionalRules: [
    // ── Condo / Co-op / Condop financial fields ──
    {
      code: 'CONDO-COOP-001',
      description: 'Condo/Co-op/Condop require financial disclosures',
      appliesWhen: {
        PropertyType: ['Residential'],
        CommonInterest: ['Condominium', 'StockCooperative', 'Condop'],
      },
      requireFields: [
        'AssociationFee',
        'FlipTax',
        'MaximumFinancingPercent',
        'MaximumFinancingRemarks',
        'TaxAbatementYN',
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

    // ── Co-op / Condop only ──
    {
      code: 'COOP-001',
      description: 'Co-op/Condop require NumberOfShares',
      appliesWhen: {
        PropertyType: ['Residential'],
        CommonInterest: ['StockCooperative', 'Condop'],
      },
      requireFields: ['NumberOfShares'],
    },

    // ── Condo only ──
    {
      code: 'CONDO-001',
      description: 'Condo requires PercentOfCommonElements, TaxMonthlyAmount, LivingArea, TaxLot',
      appliesWhen: {
        PropertyType: ['Residential'],
        CommonInterest: ['Condominium'],
      },
      requireFields: [
        'PercentOfCommonElements',
        'TaxMonthlyAmount',
        'LivingArea',
        'TaxLot',
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
      description: 'Rentals require AvailabilityDate, Furnished, MinLeaseMonths',
      appliesWhen: {
        PropertyType: ['ResidentialLease'],
      },
      requireFields: [
        'AvailabilityDate',
        'Furnished',
        'MinLeaseMonths',
      ],
    },
    {
      code: 'RENTAL-002',
      description: 'Rental buildings require LeaseType',
      appliesWhen: {
        PropertyType: ['ResidentialLease'],
        CommonInterest: ['RentalBuilding'],
      },
      requireFields: ['LeaseType'],
    },

    // ── Status-dependent ────────────────────────────────────────────────────
    //
    // EVERY `MlsStatus` LIST BELOW IS A LIVE PREDICATE, NOT A VOCABULARY.
    // `conditionMatches` (lib/compliance/rls-enforcement.ts §8) evaluates
    // `expected.includes(actual)` against the caller-supplied payload, so each
    // list is an exact-case test over an UNTRUSTED client string. Two Mallan
    // writers spell the cancel state differently (`Canceled` from the provider,
    // `Cancelled` from the CRM), so a hand-written literal here silently covers
    // only half the rows it means to.
    //
    // Every one is therefore built with `withStatusSpellings()` — closed BY
    // CONSTRUCTION from `STATUS_SPELLING_CLASSES`, not by the author of the next
    // rule remembering. The seed stays the single canonical spelling; the
    // closure is computed at runtime. `lib/compliance/__tests__/
    // rebny-conditional-rules-status-closure.test.ts` audits the WHOLE exported
    // table BY VALUE and fails if any list here loses its closure.
    {
      code: 'COMINGSOON-001',
      description: 'Coming Soon requires ActivationDate',
      appliesWhen: {
        MlsStatus: withStatusSpellings(['ComingSoon']),
      },
      requireFields: ['ActivationDate'],
    },
    {
      code: 'ACTIVE-001',
      description: 'Active requires OnMarketDate',
      appliesWhen: {
        MlsStatus: withStatusSpellings(['Active']),
      },
      requireFields: ['OnMarketDate'],
    },
    {
      code: 'CLOSED-001',
      description: 'Closed requires CloseDate, ClosePrice, BuyerAgentRLSParticipantYN',
      appliesWhen: {
        MlsStatus: withStatusSpellings(['Closed']),
      },
      requireFields: [
        'CloseDate',
        'ClosePrice',
        'BuyerAgentRLSParticipantYN',
      ],
    },
    {
      code: 'CANCELLED-001',
      description: 'Cancelled requires CancellationDate',
      // ── SPELLING-CLOSED (fixed 2026-08-20) ──────────────────────────────
      // This rule listed ONLY the provider spelling `Canceled`, so the BLOCKER
      // never fired for the spelling the CRM actually writes. Proven by
      // execution on the pre-fix tree, with the payload shape
      // `public/crm/SALE-FORM-REDESIGN.html` submits when an agent cancels a
      // sale listing — `OffMarketDate` filled (the form does collect that one)
      // and no `CancellationDate` (the form has no such input at all):
      //
      //   assertRlsCompliantPayload({MlsStatus:'Canceled',  OffMarketDate:…})
      //     -> [{ code:'CF-CANCELLED-001', severity:'BLOCKER', field:'CancellationDate' }]
      //   assertRlsCompliantPayload({MlsStatus:'Cancelled', OffMarketDate:…})
      //     -> []                                    <-- BLOCKER NEVER RAISED
      //
      // Reachability, end to end: `public/crm/SALE-FORM-REDESIGN.html` maps
      // `CRM_TO_RESO_STATUS['Cancelled'] = 'Cancelled'` (line 8584) and sets
      // `data.MlsStatus = getResoMlsStatus(data.saleStatus)` (line 7429); that
      // body is POSTed to `/api/crm/listings`, which hands it straight to
      // `assertRlsCompliantPayload` for every RLS-eligible listing
      // (route.ts:362). `PATCH /api/crm/listings/[id]` does the same with the
      // merged payload (route.ts:181). So the one spelling the canonical sale
      // form actually sends was the one this gate ignored.
      //
      // Same root cause and same shape as the CF-OFFMARKET-001 gap 24 lines
      // below — a hand-written literal covering one spelling of a two-spelling
      // concept — which is why the fix is the shared constructor and not a
      // second hand-typed literal.
      //
      // DOWNSTREAM, reported rather than absorbed: with this closed, a
      // `Cancelled` submission from that form now 422s on CF-CANCELLED-001 as
      // well as CF-OFFMARKET-001 — exactly as the `Canceled` spelling already
      // did before this change, so the two form variants stop disagreeing.
      // `CancellationDate` is collected by NO Mallan form (grep: zero hits in
      // `public/crm/**`), so the CRM needs a CancellationDate input before an
      // agent can cancel an RLS-eligible synced listing through the UI. That is
      // a `public/crm/**` change, which is under the CLAUDE.md §C hold —
      // flagged for Maya, not made here.
      appliesWhen: {
        MlsStatus: withStatusSpellings(['Canceled']),
      },
      requireFields: ['CancellationDate'],
    },
    {
      code: 'WITHDRAWN-001',
      description: 'Withdrawn requires WithdrawnDate (must equal OffMarketDate)',
      appliesWhen: {
        MlsStatus: withStatusSpellings(['Withdrawn']),
      },
      requireFields: ['WithdrawnDate'],
    },
    {
      code: 'PENDING-001',
      description: 'Pending requires PurchaseContractDate',
      appliesWhen: {
        MlsStatus: withStatusSpellings(['Pending']),
      },
      requireFields: ['PurchaseContractDate'],
    },
    {
      code: 'OFFMARKET-001',
      description: 'Off-market statuses require OffMarketDate',
      // ── SPELLING-CLOSED (fixed 2026-08-20) ──────────────────────────────
      // `conditionMatches` (lib/compliance/rls-enforcement.ts) evaluates
      // `expected.includes(actual)` against the CRM payload's `MlsStatus`, so
      // this list is a LIVE exact-case predicate over an untrusted client
      // string — not a vocabulary declaration.
      //
      // It listed only the PROVIDER spelling `Canceled`. The Mallan CRM's own
      // canonical value is `Cancelled` (double L — `lib/crm/status-mapping.ts`
      // `CANONICAL_STATUSES`), so this REBNY conditional-field BLOCKER silently
      // failed to fire for CRM-authored cancellations. Proven by execution
      // before the fix:
      //   assertRlsCompliantPayload({MlsStatus:'Canceled'})  -> CF-OFFMARKET-001 raised
      //   assertRlsCompliantPayload({MlsStatus:'Cancelled'}) -> NOT raised
      // i.e. an agent could cancel a listing through the CRM with no
      // OffMarketDate at all. This is the exact MIRROR of the provider-side
      // `Canceled` gap that motivated the shared vocabulary: same root cause
      // (a hand-written literal covering one spelling of a two-spelling
      // concept), opposite direction.
      appliesWhen: {
        MlsStatus: withStatusSpellings([
          'Canceled',
          'Closed',
          'Expired',
          'Hold',
          'Incomplete',
          'Pending',
          'Withdrawn',
        ]),
      },
      requireFields: ['OffMarketDate'],
    },

    // ── Buyer agent (non-RLS participant at close) ──
    {
      code: 'BUYER-NONRLS-001',
      description: 'Non-RLS buyer agent at close requires full contact info',
      appliesWhen: {
        BuyerAgentRLSParticipantYN: [false],
      },
      requireFields: [
        'BuyerAgentFullName',
        'BuyerAgentDirectPhone',
        'BuyerAgentEmail',
        'BuyerAgentStateLicense',
        'BuyerOfficeName',
        'BuyerOfficePhone',
      ],
    },

    // ── Tax abatement sub-conditionals ──
    {
      code: 'TAXABATE-001',
      description: 'Tax abatement details required if TaxAbatementYN = true',
      appliesWhen: {
        TaxAbatementYN: [true],
      },
      requireFields: [
        'TaxAbatementComments',
        'TaxAbatementExpirationYear',
      ],
    },

    // ── FlipTax sub-conditionals ──
    {
      code: 'FLIPTAX-001',
      description: 'FlipTax details required if FlipTax > 0',
      appliesWhen: {
        FlipTax: { gt: 0 },
      },
      requireFields: [
        'FlipTaxType',
        'FlipTaxRemarks',
      ],
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

    // ── Furnished sub-conditionals ──
    {
      code: 'FURNISHED-001',
      description: 'Furnished pricing/terms if Furnished, Partially, or Negotiable',
      appliesWhen: {
        Furnished: ['Furnished', 'Partially', 'Negotiable'],
      },
      requireFields: [
        'FurnishedListPrice',
        'FurnishedMinLeaseMonths',
        'FurnishedMaxLeaseMonths',
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

    // ── Co-Ownership ──
    {
      code: 'COOWN-001',
      description: 'Co-Ownership requires CoOwnershipInterest and FractionalUnitNumber',
      appliesWhen: {
        PropertySubType: ['CoOwnership'],
      },
      requireFields: ['CoOwnershipInterest', 'FractionalUnitNumber'],
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

    // ── Pets comments ──
    {
      code: 'BLDGPETS-001',
      description: 'BuildingPetsAllowedComments required if size/number/breed restrictions',
      appliesWhen: {
        BuildingPetsAllowed: ['BuildingSizeLimit', 'BuildingNumberLimit', 'BuildingBreedRestrictions'],
      },
      requireFields: ['BuildingPetsAllowedComments'],
    },
    {
      code: 'UNITPETS-001',
      description: 'PetsAllowedComments required if unit-level restrictions',
      appliesWhen: {
        PetsAllowed: ['UnitBreedRestrictions', 'UnitNumberLimit', 'UnitSizeLimit'],
      },
      requireFields: ['PetsAllowedComments'],
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

    // ── Garage ──
    {
      code: 'GARAGE-001',
      description: 'GarageSpaces required if GarageSpacesAssignedYN = true',
      appliesWhen: { GarageSpacesAssignedYN: [true] },
      requireFields: ['GarageSpaces'],
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

    // ── CoBuyer agent block (mirrors BUYER-NONRLS-001) ──
    {
      code: 'COBUYER-RLS-001',
      description: 'CoBuyer agent MlsId/OfficeMlsId required if CoBuyerAgentRLSParticipantYN = true',
      appliesWhen: {
        CoBuyerAgentRLSParticipantYN: [true],
      },
      requireFields: ['CoBuyerAgentMlsId', 'CoBuyerOfficeMlsId'],
    },
    {
      code: 'COBUYER-NONRLS-001',
      description: 'Non-RLS co-buyer agent at close requires full contact info',
      appliesWhen: {
        CoBuyerAgentRLSParticipantYN: [false],
      },
      requireFields: [
        'CoBuyerAgentFullName',
        'CoBuyerAgentDirectPhone',
        'CoBuyerAgentEmail',
        'CoBuyerAgentStateLicense',
        'CoBuyerOfficeName',
        'CoBuyerOfficePhone',
      ],
      note: 'CSV also requires "AND any CoBuyer value filled" — compound condition',
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

    // ── Alternate street mutual dependency ──
    {
      code: 'ALTSTREET-001',
      description: 'AlternateStreetName and AlternateStreetNumber required if any AlternateStreet attribute submitted',
      appliesWhen: { AlternateStreetDirPrefix: { exists: true } },
      requireFields: ['AlternateStreetName', 'AlternateStreetNumber'],
      note: 'Triggers on any AlternateStreet* attribute being submitted',
    },

    // ── Ceiling height mutual dependency ──
    {
      code: 'CEILING-001',
      description: 'CeilingHeightInches required if CeilingHeightFeet is not null',
      appliesWhen: { CeilingHeightFeet: { exists: true } },
      requireFields: ['CeilingHeightInches'],
    },
    {
      code: 'CEILING-002',
      description: 'CeilingHeightFeet required if CeilingHeightInches is not null',
      appliesWhen: { CeilingHeightInches: { exists: true } },
      requireFields: ['CeilingHeightFeet'],
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
    // MOVEIN-001 was removed: MoveInCostsAmountTotal does NOT exist on live Trestle
    // (verified 2026-04-19; CLAUDE.md notes "MoveInCosts is a picklist only"). The
    // FARE Act fee transparency surface is captured via CustomProperty.AdditionalFee*
    // fields and the MoveInCosts picklist itself.

    // ── Open parking ──
    {
      code: 'PARKING-001',
      description: 'OpenParkingSpaces required if OpenParkingYN = true',
      appliesWhen: { OpenParkingYN: [true] },
      requireFields: ['OpenParkingSpaces'],
    },

    // ── Price change ──
    {
      code: 'PRICECHANGE-001',
      description: 'OriginalListPrice required if ChangeType = PriceChange',
      appliesWhen: { ChangeType: ['PriceChange'] },
      requireFields: ['OriginalListPrice'],
    },

    // ── Private outdoor space ──
    {
      code: 'OUTDOOR-001',
      description: 'PrivateOutdoorSpaceSize required if PatioAndPorchFeatures or ExteriorFeatures have non-None value',
      appliesWhen: { PatioAndPorchFeatures: { exists: true } },
      requireFields: ['PrivateOutdoorSpaceSize'],
      note: 'Also triggers on ExteriorFeatures having any value other than None',
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

  publicDisplay: {
    hideWhenPermissions: ['OwnerOptOut', 'Private'] as const,
    hideWhenMlsStatus: ['Closed', 'Expired'] as const,
    // SPELLING-CLOSED BY CONSTRUCTION (2026-08-20). Still has no code consumer
    // (grep over lib/ app/ scripts/ tests/: only doc references in
    // `lib/idx/trestle-mapper.ts` and
    // `lib/compliance/__tests__/cotality-standard-status-vocabulary.test.ts`),
    // and until 2026-08-20 it carried a STATUS-SPELLING-EXEMPT marker resting on
    // exactly that fact, with a comment telling whoever wired it up to wrap it
    // first. A comment is not a guard — the CANCELLED-001 defect this pass fixed
    // sat under a longer one. Wrapping it now costs nothing (nothing reads it)
    // and removes the trap: whoever does wire it up gets both spellings.
    //
    // This is a MALLAN table expressing a REBNY rule over MALLAN-stored values.
    // Mallan stores one cancel state under two spellings, so listing both is not
    // a claim about REBNY's vocabulary — it is the same rule, correctly
    // projected onto the column it has to be evaluated against.
    suppressFromPublicSearch: withStatusSpellings(['Hold', 'Incomplete', 'Withdrawn', 'Canceled']),

    // IDX display gates — must be true for listing to appear on IDX. Live Trestle
    // (verified 2026-04-19) consolidates the master display flag into
    // InternetEntireListingDisplayYN. The legacy IDXEntireListingDisplayYN does
    // not exist on Trestle and was removed from this list.
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
  //     Source: UCBA 2026; RLS-Syndication-Research.md
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
