/**
 * REBNY / UCBA COMPLIANCE RULES — the compliance and business contract Mallan applies AFTER the
 * Cotality field contract.
 *
 *   Provider facts (field existence, type, nullability, enum members, spelling)
 *     → lib/cotality/live-contract.ts (the dated live pulls). NOT here.
 *   Mallan persistence (which column / bucket stores a fact, form aliases)
 *     → lib/listings/mallan-form-contract.ts. NOT here.
 *
 * What lives here: UCBA 2026 / REBNY RLS submission requirements (required-under-condition
 * fields, NAR-settlement removed fields, Coming Soon rules, status-conditional requirements,
 * content rules, public / VOW display policy, DOM rules). Field names used by these rules must be
 * live Cotality fields or declared Mallan-internal keys (guarded by
 * tests/runtime/provider-authority-census.test.ts). Status conditions are expressed in the MALLAN
 * status vocabulary (lib/listings/mallan-status.ts); the provider's StandardStatus never drives a
 * Mallan submission rule.
 *
 * Split out of the former lib/compliance/rebny-field-tables.ts (Packet 2 closure, 2026-09-06),
 * which had declared an "RLS overrides RESO/IDX" authority order — obsolete: Cotality is the sole
 * provider authority.
 */

export const REBNY_UCBA_RULES = {

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
      '_mallanStatus',            // the Mallan business status (never the provider's MlsStatus for a Mallan-authored listing)

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
      // StandardStatus is a Cotality field; a Mallan-authored listing carries `_mallanStatus` instead
      'BuyerAgentMlsId',      // Required unconditionally, but only relevant at close
      'OnMarketDate',          // Yes; Conditional: set when the Mallan status is Active
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
      NewDevelopmentYN: { rejectWhen: { _mallanStatus: 'ComingSoon', value: true }, note: 'Cannot be true on Coming Soon' },
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


  /**
   * UCBA C1 — REBNY RLS accepts only exclusive listing agreements. Every member below is a LIVE
   * Cotality ListingAgreement member (guarded); the former table listed a non-live 'CoExclusive'.
   */
  exclusiveListingAgreements: [
    'ExclusiveRightToSell', 'ExclusiveAgency', 'ExclusiveRightToLease',
    'CoExclusiveAgency', 'ExclusiveRightWithException',
  ] as const,

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
      // Evaluated on POST-MAPPING data: the live PropertySubType member is "Townhouse" (both Mallan
      // townhouse form values map to it — lib/crm/listing-form-mapping.ts). The single/multi-family
      // distinction is a Mallan form fact and is not needed by this rule.
      appliesWhen: {
        PropertyType: ['Residential'],
        PropertySubType: [
          'Townhouse',
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

    // ── Status-dependent ──
    {
      code: 'COMINGSOON-001',
      description: 'Coming Soon requires ActivationDate',
      appliesWhen: {
        _mallanStatus: ['ComingSoon'],
      },
      requireFields: ['ActivationDate'],
    },
    {
      code: 'ACTIVE-001',
      description: 'Active requires OnMarketDate',
      appliesWhen: {
        _mallanStatus: ['Active'],
      },
      requireFields: ['OnMarketDate'],
    },
    {
      code: 'CLOSED-001',
      description: 'Closed requires CloseDate, ClosePrice, BuyerAgentRLSParticipantYN',
      appliesWhen: {
        _mallanStatus: ['Closed', 'Sold', 'Rented', 'Leased'],
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
      appliesWhen: {
        _mallanStatus: ['Cancelled'],
      },
      requireFields: ['CancellationDate'],
    },
    {
      code: 'WITHDRAWN-001',
      description: 'Withdrawn requires WithdrawnDate (must equal OffMarketDate)',
      appliesWhen: {
        _mallanStatus: ['Withdrawn'],
      },
      requireFields: ['WithdrawnDate'],
    },
    {
      code: 'PENDING-001',
      description: 'Pending requires PurchaseContractDate',
      appliesWhen: {
        _mallanStatus: ['Pending'],
      },
      requireFields: ['PurchaseContractDate'],
    },
    {
      code: 'OFFMARKET-001',
      description: 'Off-market statuses require OffMarketDate',
      appliesWhen: {
        _mallanStatus: ['Cancelled', 'Closed', 'Sold', 'Rented', 'Leased', 'Expired', 'Hold', 'Incomplete', 'Pending', 'Withdrawn', 'Delete'],
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
        // live PetsAllowed members (the forms and the write path carry the live unit-level members;
        // the retired Unit* spellings are aliased to them before any rule runs)
        PetsAllowed: ['BreedRestrictions', 'NumberLimit', 'SizeLimit'],
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
    /** Plain-text prohibited terms scanned by the reporting validator (lib/compliance/rebny-validator.ts). */
    fairHousingProhibitedTerms: [
      'family-friendly', 'perfect for families', 'ideal for children', 'no children', 'adults only',
      'mature community', 'senior living', 'walking distance to church', 'near synagogue', 'close to mosque',
      'traditional neighborhood', 'exclusive neighborhood', 'safe neighborhood', 'good schools',
      'minority neighborhood', 'ethnic enclave', 'diverse area', 'integrated area', 'white neighborhood',
      'bachelor pad', 'man cave', 'perfect for single professional', 'great for couple', 'no Section 8',
      'no vouchers', 'no welfare', 'employed applicants only', 'must have good credit', 'speak English',
      'born in USA', 'US citizens only', 'able-bodied', 'wheelchair users', 'handicapped', 'disabled welcome',
    ],
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

  publicDisplay: {
    hideWhenMallanPermission: ['OwnerOptOut', 'Private'] as const,
    hideWhenMallanStatus: ['Closed', 'Sold', 'Rented', 'Leased', 'Expired'] as const,
    suppressFromPublicSearch: ['Hold', 'Incomplete', 'Withdrawn', 'Cancelled', 'Delete'] as const,

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

} as const;

export type RemovedFieldName = typeof REBNY_UCBA_RULES.removedFields[number];
export type RequiredFieldName = typeof REBNY_UCBA_RULES.requiredFields.agentSubmitted[number];
export type ConditionalRule = typeof REBNY_UCBA_RULES.conditionalRules[number];
