#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// AUDIT FORM FIELDS — RLS Binding Classifier
// Parses all CRM HTML files, classifies every form element as:
//   RLS_BOUND — mapped to a canonical RLS/RESO field
//   INTERNAL  — CRM-internal, no RLS equivalent
//   UNKNOWN   — cannot classify (hard error)
//
// Outputs: data/rls-form-bindings.json
// Usage:   node scripts/audit-form-fields.js
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { parse: parseHTML } = require('node-html-parser');

const REPO_ROOT = path.resolve(__dirname, '..');
const SEARCH_MODULAR = path.resolve(REPO_ROOT, 'public', 'crm');
const LOOKUP_CSV = path.join(REPO_ROOT, 'data', 'rebny-rls-property-lookup.csv');
const FIELDS_CSV = path.join(REPO_ROOT, 'data', 'rebny-rls-property-fields.csv');

const FILE_CATEGORIES = {
  saleForm:     { path: path.join(SEARCH_MODULAR, 'SALE-FORM-REDESIGN.html'),     category: 'submission' },
  rentalForm:   { path: path.join(SEARCH_MODULAR, 'RENTAL-FORM-REDESIGN.html'),   category: 'submission' },
  saleViewer:   { path: path.join(SEARCH_MODULAR, 'SALE-FORM-WITH-TOOLS.html'),   category: 'viewer' },
  rentalViewer: { path: path.join(SEARCH_MODULAR, 'RENTAL-FORM-WITH-TOOLS.html'), category: 'viewer' },
  search:       { path: path.join(SEARCH_MODULAR, 'index-built.html'),            category: 'search' },
};

// ── RESO→RLS Renames ─────────────────────────────────────────────────────

const RESO_TO_RLS_RENAMES = {
  'BuyerAgentKey':            'BuyerAgentMlsId',
  'BuyerOfficeKey':           'BuyerOfficeMlsId',
  'BuyerTeamKey':             'BuyerTeamMlsId',
  'CableTvExpense':           'CableTVExpense',
  'CeilingHeight':            'CeilingHeightFeet',
  'CoBuyerAgentKey':          'CoBuyerAgentMlsId',
  'CoBuyerOfficeKey':         'CoBuyerOfficeMlsId',
  'CoExclusiveListingKey':    'DuplicateListingIDs',
  'CoListAgent2Key':          'CoListAgent2MLSID',
  'CoListAgent3Key':          'CoListAgent3MLSID',
  'CoListAgentKey':           'CoListAgentMlsId',
  'ListAgentKey':             'ListAgentMlsId',
  'ListOfficeKey':            'ListOfficeMlsId',
  'ListTeamKey':              'ListTeamMlsId',
  'LotDimensionsSource':      'LotSizeSource',
  'StandardStatus':           'MlsStatus',
  'ShowingContactPhoneExt':   'ShowingContactPhone',
  'ListingKey':               'SourceSystemKey',
  'ModificationTimestamp':    'SourceSystemModificationTimestamp',
  'UnparsedAddress':          'UnParsedAddress',
};

// ── Comprehensive Field Aliases ──────────────────────────────────────────
// Maps remainder (after prefix stripping) → RLS field name

const FIELD_ALIASES = {
  // Location
  'Borough':               'CityRegion',
  'State':                 'StateOrProvince',
  'Neighborhood':          'SubdivisionName',
  'Zip':                   'PostalCode',
  'ZipCode':               'PostalCode',
  'Street':                'StreetName',
  'StreetAddress':         'StreetName',
  'StreetNum':             'StreetNumber',
  'Address':               'StreetNumber',
  'Cross':                 'CrossStreet',
  'CrossStreet1':          'CrossStreet',
  'AltStreetNumber':       'AlternateStreetNumber',

  // Status / system
  'Status':                'MlsStatus',

  // Financial
  'MaintCCFreq':           'AssociationFeeFrequency',
  'MaintCC':               'AssociationFee',
  'Fee2Freq':              'AssociationFee2Frequency',
  'Price':                 'ListPrice',
  'OriginalPrice':         'OriginalListPrice',
  'SoldPrice':             'ClosePrice',
  'RETaxes':               'TaxAnnualAmount',
  'FlipTaxAmount':         'FlipTax',
  'MaxFinancing':          'MaximumFinancingAmount',
  'MaxFinancingPercent':   'MaximumFinancingPercent',
  'FinancingAmount':       'MaximumFinancingAmount',
  'FinancingPercent':      'MaximumFinancingPercent',
  'Deposit':               'DepositAmount',
  'NetRent':               'NetMonthlyRent',
  'MonthlyRent':           'NetMonthlyRent',
  'NOI':                   'NetOperatingIncome',
  'FurnishedPrice':        'FurnishedListPrice',
  'FurnishedRent':         'FurnishedListPrice',
  'FurnishedMaxLease':     'FurnishedMaxLeaseMonths',
  'FurnishedMinLease':     'FurnishedMinLeaseMonths',
  'FurnishedMaxMonths':    'FurnishedMaxLeaseMonths',
  'FurnishedMinMonths':    'FurnishedMinLeaseMonths',
  'LandLease':             'LandLeaseAmount',
  'LandLeaseAmt':          'LandLeaseAmount',
  'LandLeaseFrequency':    'LandLeaseAmountFrequency',
  'LandLeaseFreq':         'LandLeaseAmountFrequency',
  'LandLeaseExpiration':   'LandLeaseExpirationDate',
  'LandLeaseExp':          'LandLeaseExpirationDate',
  'CommonElements':        'PercentOfCommonElements',
  'PercentCommon':         'PercentOfCommonElements',
  'TaxDeduction':          'TaxDeductionPercent',
  'ConcessionAmount':      'ConcessionsAmount',

  // Agreement
  'CoBrokeAgreementType':  'CoBrokeAgreement',

  // Dates
  'ListDate':              'OnMarketDate',
  'ListedDate':            'OnMarketDate',
  'MarketDate':            'OnMarketDate',
  'DateListed':            'OnMarketDate',
  'Expiration':            'ExpirationDate',
  'ExclusiveExpires':      'ExpirationDate',
  'SoldDate':              'CloseDate',
  'ContractSignedDate':    'PurchaseContractDate',
  'AvailableOccupancy':    'PossessionDate',
  'AvailableDate':         'AvailabilityDate',
  'FirstShowingDate':      'OnMarketDate',  // no RLS FirstShowingDate — closest

  // Rooms / Units / Sizes
  'Bedrooms':              'BedroomsTotal',
  'Beds':                  'BedroomsTotal',
  'FullBathrooms':         'BathroomsFull',
  'FullBath':              'BathroomsFull',
  'FullBaths':             'BathroomsFull',
  'HalfBathrooms':         'BathroomsHalf',
  'HalfBath':              'BathroomsHalf',
  'HalfBaths':             'BathroomsHalf',
  'PartialBaths':          'BathroomsPartial',
  'TotalBaths':            'BathroomsTotal',
  'Baths':                 'BathroomsTotal',
  'Rooms':                 'RoomsTotal',
  'TotalRooms':            'RoomsTotal',
  'Floor':                 'EntryLevel',
  'FloorInBuilding':       'EntryLevel',
  'UnitSqFt':              'LivingArea',
  'InteriorSqFt':          'LivingArea',
  'SqFt':                  'LivingArea',
  'NumFloors':             'StoriesTotal',
  'TotalFloors':           'StoriesTotal',
  'TotalUnits':            'NumberOfUnitsTotal',
  'UnitsTotal':            'NumberOfUnitsTotal',
  'Elevators':             'ElevatorsTotal',
  'NumElevators':          'ElevatorsTotal',
  'Year':                  'YearBuilt',
  'TaxLot':                'TaxLot',
  'BlockLot':              'BuildingTaxLot',
  'NetSquareFootage':      'BuildingTotalNetSquareFootage',
  'TotalNetSqft':          'BuildingTotalNetSquareFootage',
  'UnitsCommunity':        'NumberOfUnitsInCommunity',
  'NumBuildings':          'NumberOfBuildings',
  'ProfUnits':             'NumberOfProfessionalUnitsTotal',
  'RetailUnits':           'NumberOfRetailUnits',
  'ParkingSpaces':         'OpenParkingSpaces',
  'LotSize':               'LotSizeArea',
  'LotDimensions':         'LotSizeDimensions',
  'BuildingArea':          'BuildingAreaTotal',
  'OverFAR':               'AreaOverFAR',
  'UnderFAR':              'AreaUnderFAR',
  'Zoning':                'ZoningDescription',
  'CapitalReserves':       'CapitalReservesTotal',
  'ReserveFund':           'CapitalReservesTotal',
  'Line':                  'UnitNumber',
  'LineInBuilding':        'UnitNumber',
  'MinLease':              'MinLeaseMonths',
  'MaxLease':              'MaxLeaseMonths',
  'SecurityDeposit':       'DepositAmount',

  // Townhouse / Building
  'DevStatus':             'DevelopmentStatus',
  'Landmark':              'LandmarkStatusYN',
  'Foundation':            'FoundationDetails',
  'AttachedGarage':        'AttachedGarageYN',
  'DocsAvailable':         'DocumentsAvailable',
  'CommercialYN':          'CommercialUnitsYN',
  'Guarantors':            'GuarantorsAcceptedYN',
  'SublettingAllowed':     'RentingAllowedYN',
  'SubleaseAllowed':       'RentingAllowedYN',
  'Subletting':            'RentingAllowedYN',
  'Type':                  'StructureType',
  'SponsorUnits':          'SponsorUnitYN',
  'Smoking':               'BuildingSmokeFreeYN',

  // Property
  'UnitType':              'PropertySubType',
  'Condition':             'PropertyCondition',
  'Description':           'PublicRemarks',
  'Remarks':               'PublicRemarks',
  'NewConstruction':       'NewConstructionYN',
  'NewDevelopment':        'NewDevelopmentYN',
  'InternetAVMDisplayYN':  'InternetAutomatedValuationDisplayYN',

  // Showing
  'ShowingContact':        'ShowingContactType',
  'ShowingEnd':            'ShowingEndTime',
  'ShowingStart':          'ShowingStartTime',
  'Showing':               'ShowingInstructions',
  'ManagingAgency':        'ManagingAgencyListingYN',

  // Media
  'VideoTourUrl':          'VirtualTourURLUnbranded',
  'MatterportUrl':         'VirtualTourURLUnbranded2',
  'VirtualTourUnbranded':  'VirtualTourURLUnbranded',
  'VirtualTourUnbranded2': 'VirtualTourURLUnbranded2',
  'VirtualTourUnbranded3': 'VirtualTourURLUnbranded3',

  // Multi-value picklist parent mappings
  'Laundry':               'LaundryFeatures',
  'Doorman':               'BuildingFeatures',
  'FullTimeDoorman':       'BuildingFeatures',
  'VirtualDoorman':        'BuildingFeatures',
  'Concierge':             'BuildingFeatures',

  // Exposure checkboxes → Exposures picklist
  'ExpNorth':              'Exposures',
  'ExpSouth':              'Exposures',
  'ExpEast':               'Exposures',
  'ExpWest':               'Exposures',

  // View checkboxes → View picklist
  'ViewCity':              'View',
  'ViewWater':             'View',
  'ViewRiver':             'View',
  'ViewPark':              'View',
  'ViewGarden':            'View',
  'ViewSkyline':           'View',
  'ViewPanoramic':         'View',
  'HasViews':              'ViewYN',

  // Building amenity checkboxes → BuildingFeatures
  'Elevator':              'BuildingFeatures',
  'Gym':                   'BuildingFeatures',
  'Pool':                  'BuildingFeatures',
  'RoofDeck':              'BuildingFeatures',
  'BikeRoom':              'BuildingFeatures',
  'Storage':               'BuildingFeatures',
  'Parking':               'BuildingFeatures',
  'Valet':                 'BuildingFeatures',
  'LiveInSuper':           'BuildingFeatures',
  'Courtyard':             'BuildingFeatures',
  'Playroom':              'BuildingFeatures',
  'Lounge':                'BuildingFeatures',
  'BusinessCenter':        'BuildingFeatures',
  'ConferenceRoom':        'BuildingFeatures',
  'PackageRoom':           'BuildingFeatures',
  'ColdStorage':           'BuildingFeatures',
  'OnSiteManager':         'BuildingFeatures',
  'WheelchairAccess':      'BuildingFeatures',
  'Spa':                   'BuildingFeatures',
  'Historic':              'BuildingFeatures',
  'LEED':                  'BuildingFeatures',
  'Conversion':            'BuildingFeatures',

  // Interior features checkboxes
  'Dishwasher':            'InteriorFeatures',
  'GraniteCounters':       'InteriorFeatures',
  'StainlessAppl':         'Appliances',
  'Microwave':             'Appliances',
  'GasStove':              'Appliances',
  'WasherDryer':           'InteriorFeatures',
  'CentralAC':             'InteriorFeatures',
  'Hardwood':              'InteriorFeatures',
  'HighCeilings':          'InteriorFeatures',
  'Fireplace':             'InteriorFeatures',
  'fireplace':             'InteriorFeatures',
  'ExposedBrick':          'InteriorFeatures',
  'Prewar':                'InteriorFeatures',
  'SmartHome':             'InteriorFeatures',
  'WalkInCloset':          'InteriorFeatures',
  'StorageRoom':           'InteriorFeatures',
  'LaundryRoom':           'InteriorFeatures',
  'Mudroom':               'InteriorFeatures',

  // Exterior features checkboxes
  'Balcony':               'ExteriorFeatures',
  'Terrace':               'ExteriorFeatures',
  'Patio':                 'ExteriorFeatures',
  'PrivateRoof':           'ExteriorFeatures',
  'PrivateGarden':         'ExteriorFeatures',
  'Backyard':              'ExteriorFeatures',

  // Room type checkboxes (no RLS RoomType but these are interior descriptors)
  'LivingRoom':            'InteriorFeatures',
  'FormalLiving':          'InteriorFeatures',
  'GreatRoom':             'InteriorFeatures',
  'DiningRoom':            'InteriorFeatures',
  'FormalDining':          'InteriorFeatures',
  'DiningArea':            'InteriorFeatures',
  'BreakfastNook':         'InteriorFeatures',
  'Den':                   'InteriorFeatures',
  'HomeOffice':            'InteriorFeatures',
  'Library':               'InteriorFeatures',
  'MaidsRoom':             'InteriorFeatures',
  'Nursery':               'InteriorFeatures',
  'RecRoom':               'InteriorFeatures',
  'MediaRoom':             'InteriorFeatures',
  'Sunroom':               'InteriorFeatures',

  // Building laundry
  'WasherDryerAllowed':    'BuildingLaundryFeatures',

  // Pets
  'Pets':                  'BuildingPetsAllowed',
  'PetsCatsOK':            'PetsAllowed',
  'PetsDogsOK':            'PetsAllowed',
  'PetsCaseByCase':        'PetsAllowed',
  'PetsNone':              'PetsAllowed',

  // Distribution / Syndication toggles
  'VOWOptOutYN':           'InternetEntireListingDisplayYN',
  'SendToAll':             'SyndicateTo',
  'Dist_IDX':              'InternetEntireListingDisplayYN',    // No IDXEntireListingDisplayYN on Trestle
  'Dist_Listhub':          'SyndicateTo',
  'Dist_NYMLS':            'SyndicateTo',
  'Dist_Realtor':          'SyndicateTo',
  'Dist_RPX':              'SyndicateTo',
  'Dist_WWW':              'InternetEntireListingDisplayYN',
  'Dist_RLS':              'SyndicateTo',

  // Building board
  'BoardApproval':         'BuildingFeatures',
  'PiedATerre':            'BuildingFeatures',
  'ParentsAllowed':        'BuildingFeatures',
  'CoBuyersAllowed':       'BuildingFeatures',
  'CorpOwnAllowed':        'BuildingFeatures',
  'GiftsAllowed':          'BuildingFeatures',

  // Direct RLS/RESO fields (on Trestle Property entity, beyond IDX Plus CSV)
  'BathroomsTotal':           'BathroomsTotalInteger',
  'InternetAddressDisplayYN': 'InternetAddressDisplayYN',       // Trestle Property, not in IDX Plus CSV
  'InternetAutomatedValuationDisplayYN': 'InternetAutomatedValuationDisplayYN', // Trestle Property, not in IDX Plus CSV
  'InternetConsumerCommentYN':'InternetConsumerCommentYN',       // Trestle Property, not in IDX Plus CSV
  'InternetEntireListingDisplayYN': 'InternetEntireListingDisplayYN', // Trestle Property, not in IDX Plus CSV
  'ShowingInstructions':      'ShowingInstructions',             // Trestle Property, not in IDX Plus CSV
  'SyndicateYN':              'SyndicateTo',
  'VideoUrl':                 'VirtualTourURLUnbranded',
  'FlipTax':                  'FlipTaxType',

  // CustomProperty.CustomFields (RLS fields, require $expand=CustomProperty)
  'TaxMonthly':               'TaxMonthlyAmount',               // CustomFields JSON
  'CapitalReservesYN':        'CapitalReservesYN',              // CustomFields JSON
  'TaxAbatementYN':           'TaxAbatementYN',                 // CustomFields JSON
  'TaxAbatementComments':     'TaxAbatementComments',           // CustomFields JSON
  'TaxAbatementExpYear':      'TaxAbatementExpirationYear',     // CustomFields JSON

  // Search-specific aliases
  'ManagementCompany':     'ManagementCompanyName',
  'KeywordSearch':         'PublicRemarks',
  'QuickRls':              'SourceSystemKey',
  'QuickZip':              'PostalCode',
  'SearchAddress':         'StreetName',
  'QuickUnit':             'UnitNumber',

  // FARE Act fields (on CustomProperty entity, requires $expand)
  'TenantPaysDescription':    'TenantPaysDescription',
  'AdditionalFeeYN':          'AdditionalFeeYN',
  'AdditionalFee':            'AdditionalFee',
  'AdditionalFeeDescription': 'AdditionalFeeDescription',
  'AdditionalFeeFrequency':   'AdditionalFeeFrequency',

  // Distribution — VOW opt-out toggle
  'Dist_VOW':                 'InternetEntireListingDisplayYN',

  // REBNY custom fields (CustomProperty entity, in CustomFields JSON)
  'LobbyAttendant':           'AttendanceType',
  'OwnershipType':            'OwnershipType',
};

// ── Internal-Only Fields ─────────────────────────────────────────────────
// Form elements that serve CRM/UI purposes, not RLS submission

const INTERNAL_ONLY_FIELDS = new Set([
  // Original from validator
  'WebDisplayAddress', 'NewOHType', 'Class', 'FuelType', 'OwnerContactMethod',
  'LeaseTerm', 'KitchenType', 'FlipTaxPaidBy', 'RentalBasis', 'CommSubtype', 'UnitType2',
  'CalcTerm', 'CalcRate', 'CalcDown',
  'MinPrice', 'MaxPrice', 'MinBeds', 'MaxBeds', 'MinBaths', 'MaxBaths',
  'MinRooms', 'MaxRooms', 'MinSqft', 'MaxSqft', 'MinRent', 'MaxRent',
  'ListingActivityType',
  'BuildingMinYear', 'BuildingMaxYear', 'BuildingMinUnits', 'BuildingMaxUnits',
  'BuildingMinFloors', 'BuildingMaxFloors',
  'refineMinPrice', 'refineMaxPrice', 'refineMinBeds', 'refineMaxBeds',
  'refineMinBaths', 'refineMaxBaths',
  'buildingMinYear', 'buildingMaxYear', 'buildingMinUnits', 'buildingMaxUnits',
  'buildingMinFloors', 'buildingMaxFloors',
  'perPageSelect',
  'calcDownPayment', 'calcRepairs', 'calcVacancy',
  'rvbAppreciation', 'rvbDownPayment', 'rvbLoanTerm', 'rvbRentIncrease',
  'roleSelector',
  'commReqRole', 'commReqDealType', 'commReqPaidBy', 'commReqRateType',
  'rlsLogFilter',
  'refDirection', 'refDealType', 'refOurAgent', 'refAgreementStatus', 'refSignMethod',
  'campaignSendingEmail', 'socialListingSelect',
  'ohListing', 'ohOverviewRepeat',
  'manageDealsFilter', 'fsPhotoCount',
  // After-strip remainders (from old validator)
  'ReqRole', 'ReqDealType', 'ReqPaidBy', 'ReqRateType',
  'Listing', 'OverviewRepeat', 'LogFilter',
  'Direction', 'OurAgent', 'AgreementStatus', 'SignMethod',
  'SendingEmail', 'ListingSelect', 'DealsFilter', 'PhotoCount',

  // System / Agent tracking
  'UpdatingAgent', 'UpdatingAgentName', 'UpdatingAgentPhone', 'UpdatingAgentEmail',
  'UpdatingAgentLicense', 'UpdatingAgentCompanyKey', 'UpdatingAgentCompanyName',
  'UpdatingAgentDisplay',
  'CreateDate', 'LastUpdatedDate',

  // UI controls
  'ShowRequiredOnly',
  'BuildingSearch', 'AddressSearch', 'NeighborhoodFromAddress',

  // Listing categorization
  'ListingType', 'DirectDeal',

  // Compliance acknowledgments
  'CommNegotiabilityAck', 'BuyerRepAgreementAck', 'FairHousingAck',
  'OptOutFormUpload',

  // Commission / Financial (CRM-internal)
  'CommissionType', 'ExclusiveCommission', 'CommissionAmount', 'CommissionPaidBy',
  'ExclusiveStart', 'FirstCoBroke',
  'TotalMonthly',
  'ConcessionComments', 'ConcessionRemarks',

  // Web / Marketing
  'WebHeadline',

  // Agent / Company search widgets
  'ListingCompanySearch', 'ListingCompany',
  'ListingAgentSearch', 'ListingAgent',
  'BuyerCompanySearch', 'BuyerCompany',
  'BuyerAgentSearch', 'BuyerAgent',
  'TenantCompanySearch', 'TenantCompany',
  'TenantAgentSearch', 'TenantAgent',

  // Broker/admin notes
  'BrokerComments', 'AdminComments', 'AgentRemarks',

  // Open house scheduling
  'NewOHDate', 'NewOHStart', 'NewOHEnd', 'NewOHNotes', 'NewOHType',

  // Board / Rules (CRM-internal, not RLS fields)
  'BoardInterview', 'MeetAndGreet', 'BoardApplication',
  'FirstRefusal', 'FilmLocation', 'CertOccupancy',
  'ParentsBuying', 'CoPurchasing',
  'OfficeRetailOwnership', 'BuildingStatus', 'CommercialOwnership', 'TenantConfig',

  // Unit details (CRM-internal)
  'OriginalRooms', 'ExteriorSqFt', 'GrossSqFt', 'NetSqFt',
  'Light', 'Layout', 'OpenSpaces',
  'LiveWorkAllowed',
  'UnitShares',

  // Heating/Cooling radio values
  'CoolingYes', 'CoolingNo', 'HeatingYes', 'HeatingNo',

  // History
  'HistoryType',

  // Rental-specific CRM
  'NetEffectiveRent', 'UnderlyingMortgage', 'Underlying',
  'FreeRent', 'OwnerPaysFreeRent', 'FreeRentMonths',
  'Students', 'GuarantorsPolicy',

  // Fields that don't exist on Trestle (CRM-internal)
  'MoveInCostsAmountTotal',    // Not on Trestle (phantom). MoveInCostsAmount + MoveInCostsComments ARE live (2026-06-04).
  'IDXEntireListingDisplayYN',                          // Not on Trestle; real field is InternetEntireListingDisplayYN
  'YearRenovated', 'BuyerAgentRLSParticipantYN',
  'TotalShares', 'AnnualTaxes',
  'AvgMaint', 'MinIncome', 'MinCreditScore', 'MaxOccupants',
  'MaxSubletYears', 'SubletFee', 'MinDownPayment', 'DTIRatio', 'PostCloseLiquidity',
  'PetWeightLimit', 'PetNotes', 'PiedATerre',
  'Website',
  'SubwayLines', 'SubwayStation', 'CrossStreet2',
  'ResidentialUnits', 'CommercialUnits',
  'VacantUnits',

  // Building management (not in RLS)
  'MgmtCompany', 'MgmtPhone', 'MgmtEmail', 'MgmtAddress',
  'SuperName', 'SuperPhone', 'SuperEmail',
  'ManagerName', 'ManagerPhone', 'ManagerEmail',
  'BoardPresident', 'BoardEmail',

  // Income/Expense fields (CRM-internal financial analysis)
  'GrossIncomeM', 'GrossIncomeA', 'TaxM', 'TaxA',
  'WaterM', 'WaterA', 'HeatM', 'HeatA',
  'MaintM', 'MaintA', 'MgmtM', 'MgmtA',
  'SuperM', 'SuperA', 'ElectricM', 'ElectricA',
  'InsuranceM', 'InsuranceA', 'TrashM', 'TrashA',
  'PestM', 'PestA', 'WorkCompM', 'WorkCompA',
  'OtherM', 'OtherA', 'OtherRemarks',
  'TotalExpM', 'TotalExpA', 'NetIncomeM', 'NetIncomeA',

  // Owner info (CRM-internal, not RLS)
  'OwnerName', 'OwnerPhone', 'OwnerEmail',

  // Address extras
  'StreetAddress2', 'UnitNumber2',

  // Media upload fields
  'PhotoInput', 'FloorplanInput', 'DocInput',

  // Financing (CRM-internal)
  'Financing',

  // FARE Act (CRM tracking)
  'FareActLandlordPays',

  // Rented/Sold price tracking (CRM-internal, not standard RLS fields)
  'RentedPrice', 'RentedDate',

  // Notes (generic)
  'Notes',

  // ── Commission Request form fields (commSale*, commRental*, Req*) ──
  'SaleRlsId', 'SaleAddress', 'SaleBorough', 'SaleListPrice', 'SaleFinalPrice',
  'SaleBedBath', 'SaleSqFt', 'SaleSellerName', 'SaleSellerAttorney',
  'SaleBuyerName', 'SaleBuyerEmail', 'SaleBuyerPhone', 'SaleBuyerAttorney',
  'SaleListingAgent', 'SaleCoListAgent', 'SaleBuyerAgent', 'SaleCoopBrokerage',
  'SaleTotalPct', 'SaleListingSidePct', 'SaleCoopSidePct', 'SaleAgentSplitPct',
  'SalePayMethod', 'SaleClosingDate', 'SaleNotes',
  'RentalRlsId', 'RentalAddress', 'RentalBorough', 'RentalListPrice', 'RentalFinalPrice',
  'RentalBedBath', 'RentalSqFt', 'RentalLandlordName', 'RentalLandlordAttorney',
  'RentalTenantName', 'RentalTenantEmail', 'RentalTenantPhone', 'RentalTenantAttorney',
  'RentalListingAgent', 'RentalCoListAgent', 'RentalTenantAgent', 'RentalCoopBrokerage',
  'RentalCommValue', 'RentalListingSidePct', 'RentalCoopSidePct', 'RentalAgentSplitPct',
  'RentalPayMethod', 'RentalLeaseStart', 'RentalNotes',
  'ReqAddress', 'ReqClient', 'ReqClientEmail', 'ReqClientPhone', 'ReqCloseDate',
  'ReqPrice', 'ReqRate', 'ReqListingBrokerage', 'ReqListingAgent', 'ReqRLSId',
  'ReqCoBrokeOffered', 'ReqGross', 'ReqSplit',
  'LeasedRent', 'LeasedDate',

  // ── CRM Admin fields ──
  'addAgentFirstName', 'addAgentMiddleName', 'addAgentLastName', 'addAgentEmail',
  'addAgentPhone', 'addAgentLicenseType', 'addAgentLicense', 'addAgentLicenseExp',
  'addAgentStartDate', 'addAgentSplit', 'addAgentSplitBrokerage',
  'setPwPassword', 'setPwConfirm', 'setPwTermsICA', 'setPwTermsFH',
  'setPwTermsREBNY', 'setPwTermsData', 'setPwAgentId',
  'agentLoginSelect', 'agentLoginPassword',
  'splitType2',
  'refOurAgentTitle', 'refOurAgentLicense', 'refPrice', 'refFeePercent',
  'refFeeAmount', 'refSignBroker', 'refSignAgent', 'refSignOtherAgent', 'refSignOtherBroker',
  'campaignType', 'campaignSubject', 'campaignTemplate', 'campaignNote',
  'campaignSchedule', 'campaignScheduleDate',
  'socialCaption', 'socialSchedule', 'socialScheduleDate',
  'emailProvider', 'reportPeriod',
  'deliveryMethod1099',

  // ── Client portal calculators ──
  'buyerPurchasePrice', 'buyerMortgageAmount',
  'renterMonthlyRent', 'renterAnnualIncome', 'renterGuarantorToggle',
  'renterCheck1', 'renterCheck2', 'renterCheck3', 'renterCheck4', 'renterCheck5',
  'renterCheck6', 'renterCheck7', 'renterCheck8', 'renterCheck9', 'renterCheck10',
  'sellerSalePrice', 'sellerCommRate', 'sellerFlipTax', 'sellerMortgagePayoff',

  // ── Search UI controls ──
  'CommuteAddress', 'PrintBranding', 'PrintLandscape',
  'EmailTo', 'EmailCC', 'EmailSubject', 'EmailMessage',
  'CalcPrice', 'ClosingPrice',
  'CoCNOI', 'CoCCash',
  'ROIPrice', 'ROIRent', 'ROIExpenses', 'ROIYears', 'ROIAppreciation',
  'RvBRent', 'RvBRentInc', 'RvBPrice', 'RvBOwn', 'RvBYears',
  'BvSValue', 'BvSAppreciation', 'BvSYears', 'BvSCarry', 'BvSProceeds', 'BvSRent', 'BvSExpenses',
  'BuildingFinancingMin', 'BuildingFinancingMax',
  'editPrice',

  // Building search in search
  'buildingQuickRls', 'buildingQuickZip', 'buildingSearchAddress', 'buildingQuickUnit',
  'advancedSearchAddress',

  // Mortgage calculator
  'mortgagePrice', 'mortgageDownPayment', 'mortgageRate', 'mortgageTerm',

  // Investment filter
  'enableInvestmentFilter',
  'calcMonthlyRent', 'calcMaintenance', 'calcTaxes', 'calcInsurance',
  'calcPurchasePrice', 'calcClosingCosts', 'calcRenovation',

  // Rent vs Buy calculator
  'enableRentVsBuy',
  'rvbMonthlyRent', 'rvbRenterInsurance', 'rvbPurchasePrice',
  'rvbInterestRate', 'rvbMaintenance', 'rvbPropertyTax', 'rvbHomeInsurance',

  // Closing costs calculator
  'showClosingCosts', 'closingPropType', 'closingBuildingStatus',

  // Back on Market filter
  'bomFilter',

  // Agent info in search (display, not submission)
  'ListAgent', 'Broker', 'ListOffice', 'ListTeam', 'AgentPhone', 'Management', 'Owner',

  // Outdoor filter
  'outdoor',

  // Select all / results
  'selectAllCheckbox', 'resultsSearchInput', 'selectAllFields',
  'refineStatusActive', 'refineStatusComingSoon', 'refineStatusPending',
  'refineStatusContract', 'refineStatusClosed',

  // Open house overview
  'OverviewListing', 'OverviewDate', 'OverviewStart', 'OverviewEnd',
  'OverviewType-public', 'OverviewType-broker', 'OverviewType-appt', 'OverviewType-virtual',
  'OverviewLink',

  // Report fields
  'reportDescriptionEditor', 'reportRecipientClient', 'reportRecipientEmail',
  'reportTitle', 'reportPreparedFor', 'reportAgentHeadshot', 'reportSort', 'reportSelection',

  // Saved search
  'savedSearchName', 'savedSearchNotes',
  'savedSearchClientId', 'savedSearchAlertFreq',

  // Client workspace filters
  'filterPicked', 'filterLiked', 'filterShown', 'filterDisliked',
  'filterNewMatches', 'filterEmailed', 'filterOpenHouses', 'filterNotSelected',
  'filterPriceMin', 'filterPriceMax', 'filterRoomsMin', 'filterRoomsMax',
  'filterBedsMin', 'filterBedsMax', 'filterBathsMin', 'filterBathsMax',

  // Delivery/email in search
  'deliveryClientSelect', 'deliveryMethod', 'deliveryEmailSubject',
  'deliveryEmailMessage', 'emailTemplate', 'printFormat',

  // Open house time fields (from search)
  'Date', 'StartTime', 'EndTime',

  // landLease checkbox (search)
  'landLease',

  // ── Form UI controls (sale/rental) ──
  'PhotoSortOrder', 'CityDisplay',

  // Search filter controls
  'clientSearchInput',
  'refineMinSqft', 'refineMaxSqft',
  'refinePropertyType', 'refineNeighborhood',

  // ── Search neighborhood/map inputs ──
  'saleNeighborhoodInput', 'rentalNeighborhoodInput',
  'buildingNeighborhoodInput', 'advancedNeighborhoodInput',
  'nbMapSearch', 'nbMapStyleSelect',
  'NeighborhoodInput',  // after prefix strip

  // ── CRM portal notes/search ──
  'cpNoteInput', 'soldSearchInput',

  // ── CRM filters ──
  'brokerPipelineFilter', 'commReqDeal', 'recentListingsFilter',
  'clientBookAgentFilter', 'ceAgentSelect', 'timelineFilter',
  'dealPipelineTypeFilter', 'dealAnalyticsAgentFilter',

  // ── CRM audit filters ──
  'auditFilterUser', 'auditFilterAction', 'auditFilterEntity',
  'auditFilterFrom', 'auditFilterTo',

  // ── CRM lead assignment ──
  'leadAssignAgent',

  // ── CRM settings ──
  'settingsBrokerName', 'settingsBrokerLicense', 'settingsBrokerPhone', 'settingsBrokerEmail',

  // ── Buyer financial planning calculator (bfp) ──
  'bfp0-dp', 'bfp0-rate', 'bfp0-term', 'bfp0-ins',
  'bfp1-dp', 'bfp1-rate', 'bfp1-term', 'bfp1-ins',
  'bfp2-dp', 'bfp2-rate', 'bfp2-term', 'bfp2-ins',

  // ── Buyer portal controls ──
  'buyerCashAvailable', 'buyerDefaultDP', 'buyerDefaultRate',
  'buyerShareUrl', 'buyerShareNote', 'buyerDealPropertySelect',

  // ── Tenant rent vs buy calculator (trvb) ──
  'trvb0-price', 'trvb0-dp', 'trvb0-rate', 'trvb0-years',
  'trvb1-price', 'trvb1-dp', 'trvb1-rate', 'trvb1-years',
  'trvb2-price', 'trvb2-dp', 'trvb2-rate', 'trvb2-years',

  // ── Tenant portal controls ──
  'tenantShareUrl', 'tenantShareNote',

  // ── Portal invite forms ──
  'buyerInviteEmail', 'buyerInviteRelationship', 'buyerInviteMessage',
  'tenantInviteEmail', 'tenantInviteRelationship', 'tenantInviteMessage',

  // ── Showing request modal (trm) ──
  'trm-listing-select', 'trmType', 'trm-date1', 'trm-time1',
  'trm-date2', 'trm-time2', 'trm-notes',

  // ── Client listing modal calculator (clm) ──
  'clm-calc-dp', 'clm-calc-rate', 'clm-calc-term', 'clm-calc-ins',
  'clm-rcalc-price', 'clm-rcalc-dp', 'clm-rcalc-rate', 'clm-rcalc-years',

  // ── CRM command palette ──
  'cmdPaletteInput',

  // ── Showing feedback form ──
  'feedbackRatingValue', 'feedbackInterestLevel', 'feedbackPros',
  'feedbackCons', 'feedbackFollowUp', 'feedbackNotes',

  // ── Dynamic template IDs (JS string concat artifacts in viewers) ──
  "coListCompanySearch' + n + '", "coListCompany' + n + '",
  "coListAgentSearch' + n + '", "coListAgentHidden' + n + '",
]);

// ── CSV Parsers ──────────────────────────────────────────────────────────

function parseSimpleCSV(text) {
  const lines = text.split(/\r?\n/);
  return lines.map(line => {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  });
}

function loadPicklistMap() {
  const text = fs.readFileSync(LOOKUP_CSV, 'utf8');
  const rows = parseSimpleCSV(text);
  const map = {};
  const skipNames = new Set(['LookupName (Current)', 'Property Lookup', 'MatrixSelectName']);
  for (let i = 2; i < rows.length; i++) {
    const curField = (rows[i][2] || '').trim();
    const curValue = (rows[i][3] || '').trim();
    const mtxField = (rows[i][5] || '').trim();
    const mtxValue = (rows[i][6] || '').trim();
    if (curField && !skipNames.has(curField) && curField !== 'Yes' && !curField.startsWith('or ')) {
      if (!map[curField]) map[curField] = new Set();
      if (curValue) map[curField].add(curValue);
    }
    if (mtxField && !skipNames.has(mtxField) && mtxField !== 'Yes' && !mtxField.startsWith('or ')) {
      if (!curField || curField !== mtxField || !curValue) {
        if (!map[mtxField]) map[mtxField] = new Set();
        if (mtxValue) map[mtxField].add(mtxValue);
      }
    }
  }
  return map;
}

function loadAllRLSFields() {
  const text = fs.readFileSync(FIELDS_CSV, 'utf8');
  const rows = parseSimpleCSV(text);
  const map = {};
  for (let i = 1; i < rows.length; i++) {
    let rlsName = (rows[i][3] || '').trim();
    const addEdit = (rows[i][5] || '').trim();
    const search = (rows[i][6] || '').trim();
    const rules = (rows[i][7] || '').trim();
    if (!rlsName || rlsName === 'MatrixFieldName') continue;
    if (RESO_TO_RLS_RENAMES[rlsName]) rlsName = RESO_TO_RLS_RENAMES[rlsName];
    const lower = rlsName.toLowerCase();
    if (!map[lower]) map[lower] = { rlsName, addEdit, search, rules };
  }
  return map;
}

// ── Field Identification ─────────────────────────────────────────────────

function createIdentifier(rlsFieldMap, picklistMap) {
  const fieldByLower = {};
  for (const fieldName of Object.keys(picklistMap)) {
    fieldByLower[fieldName.toLowerCase()] = fieldName;
  }
  const FORM_PREFIXES = ['sale', 'rental', 'bldg', 'search', 'oh', 'crm', 'comm'];

  return function identifyRLSField(elementId) {
    if (!elementId) return null;

    // Check full ID against internal list FIRST (handles full IDs like agentLoginSelect)
    if (INTERNAL_ONLY_FIELDS.has(elementId)) return { internal: true, reason: 'full-id-internal' };

    const lower = elementId.toLowerCase();

    // Exact match against RLS fields
    if (rlsFieldMap[lower]) return { field: rlsFieldMap[lower].rlsName };
    if (fieldByLower[lower]) return { field: fieldByLower[lower] };

    // Strip first-level prefix
    let remainder = elementId;
    let strippedPrefix = null;
    for (const prefix of FORM_PREFIXES) {
      if (lower.startsWith(prefix) && remainder.length > prefix.length) {
        const after = remainder.substring(prefix.length);
        if (/^[A-Z]/.test(after)) {
          if (prefix === 'bldg') {
            const buildingName = 'Building' + after;
            const buildingLower = buildingName.toLowerCase();
            if (rlsFieldMap[buildingLower]) return { field: rlsFieldMap[buildingLower].rlsName };
            if (fieldByLower[buildingLower]) return { field: fieldByLower[buildingLower] };
          }
          strippedPrefix = prefix;
          remainder = after;
          break;
        }
      }
    }

    // Strip compound prefix (Bldg or TH after first strip)
    if (remainder.startsWith('Bldg') && remainder.length > 4) {
      const afterBldg = remainder.substring(4);
      if (/^[A-Z]/.test(afterBldg)) {
        const buildingName = 'Building' + afterBldg;
        if (rlsFieldMap[buildingName.toLowerCase()]) {
          return { field: rlsFieldMap[buildingName.toLowerCase()].rlsName };
        }
        if (fieldByLower[buildingName.toLowerCase()]) {
          return { field: fieldByLower[buildingName.toLowerCase()] };
        }
        remainder = afterBldg;
      }
    }
    if (remainder.startsWith('TH') && remainder.length > 2) {
      const afterTH = remainder.substring(2);
      if (/^[A-Z]/.test(afterTH)) {
        remainder = afterTH;
      }
    }

    // Check remainder against internal list
    if (INTERNAL_ONLY_FIELDS.has(remainder)) return { internal: true, reason: 'remainder-internal' };

    // Direct match against RLS fields
    const remainderLower = remainder.toLowerCase();
    if (rlsFieldMap[remainderLower]) return { field: rlsFieldMap[remainderLower].rlsName };
    if (fieldByLower[remainderLower]) return { field: fieldByLower[remainderLower] };

    // Alias match
    const aliased = FIELD_ALIASES[remainder];
    if (aliased) {
      if (rlsFieldMap[aliased.toLowerCase()]) {
        return { field: rlsFieldMap[aliased.toLowerCase()].rlsName };
      }
      return { field: aliased };
    }

    // Not found
    return null;
  };
}

// ── Main ─────────────────────────────────────────────────────────────────

function main() {
  console.log('Generating RLS form bindings...\n');

  const picklistMap = loadPicklistMap();
  const rlsFieldMap = loadAllRLSFields();
  const identify = createIdentifier(rlsFieldMap, picklistMap);

  const output = {
    _meta: {
      generated: new Date().toISOString().split('T')[0],
      source: 'audit-form-fields.js',
    },
    files: {},
    summary: { totalElements: 0, rlsBound: 0, internal: 0, unknown: 0 },
  };

  for (const [fileKey, config] of Object.entries(FILE_CATEGORIES)) {
    const filePath = config.path;
    if (!fs.existsSync(filePath)) {
      console.error(`  MISSING: ${path.basename(filePath)}`);
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const dom = parseHTML(content, { comment: false });
    const fname = path.basename(filePath);

    const fileResult = {
      category: config.category,
      bindings: {},
      stats: { total: 0, rlsBound: 0, internal: 0, unknown: 0 },
    };

    const elements = dom.querySelectorAll('input, select, textarea');
    const seen = new Set();

    for (const el of elements) {
      const elId = (el.getAttribute('id') || '').trim();
      const elName = (el.getAttribute('name') || '').trim();
      const elType = (el.getAttribute('type') || el.tagName.toLowerCase()).trim();
      const identifier = elId || elName;
      if (!identifier) continue;
      if (seen.has(identifier)) continue;
      seen.add(identifier);

      fileResult.stats.total++;
      const result = identify(identifier);

      if (result && result.field) {
        fileResult.bindings[identifier] = { rlsField: result.field, elementType: elType };
        fileResult.stats.rlsBound++;
      } else if (result && result.internal) {
        fileResult.bindings[identifier] = { internal: true, elementType: elType };
        fileResult.stats.internal++;
      } else {
        fileResult.bindings[identifier] = { unknown: true, elementType: elType };
        fileResult.stats.unknown++;
      }
    }

    // Radio buttons by name
    const radios = dom.querySelectorAll('input[type="radio"]');
    for (const r of radios) {
      const rName = (r.getAttribute('name') || '').trim();
      if (!rName || seen.has(rName)) continue;
      seen.add(rName);
      fileResult.stats.total++;
      const result = identify(rName);

      if (result && result.field) {
        fileResult.bindings[rName] = { rlsField: result.field, elementType: 'radio' };
        fileResult.stats.rlsBound++;
      } else if (result && result.internal) {
        fileResult.bindings[rName] = { internal: true, elementType: 'radio' };
        fileResult.stats.internal++;
      } else {
        fileResult.bindings[rName] = { unknown: true, elementType: 'radio' };
        fileResult.stats.unknown++;
      }
    }

    output.files[fname] = fileResult;
    output.summary.totalElements += fileResult.stats.total;
    output.summary.rlsBound += fileResult.stats.rlsBound;
    output.summary.internal += fileResult.stats.internal;
    output.summary.unknown += fileResult.stats.unknown;

    console.log(`  ${fname} (${config.category}): ${fileResult.stats.total} elements — ${fileResult.stats.rlsBound} RLS, ${fileResult.stats.internal} internal, ${fileResult.stats.unknown} unknown`);
  }

  // Write output
  const outputPath = path.join(REPO_ROOT, 'data', 'rls-form-bindings.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\nBinding map written to: ${outputPath}`);
  console.log(`\nSUMMARY: ${output.summary.totalElements} elements — ${output.summary.rlsBound} RLS_BOUND, ${output.summary.internal} INTERNAL, ${output.summary.unknown} UNKNOWN`);

  if (output.summary.unknown > 0) {
    console.log('\nUNKNOWN elements (must be resolved):');
    for (const [fname, fileData] of Object.entries(output.files)) {
      for (const [id, binding] of Object.entries(fileData.bindings)) {
        if (binding.unknown) {
          console.log(`  ${fname}: ${id} (${binding.elementType})`);
        }
      }
    }
  }

  return output.summary.unknown;
}

const unknowns = main();
process.exit(unknowns > 0 ? 1 : 0);
