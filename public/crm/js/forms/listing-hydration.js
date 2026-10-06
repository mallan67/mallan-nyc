// Hydration of a stored listing into the Sale / Rental form controls. The read-only Tools viewers (SALE-FORM-WITH-TOOLS.html, RENTAL-FORM-WITH-TOOLS.html) show
// the whole record with it, and the Rental Add / Edit form (RENTAL-FORM-REDESIGN.html) loads a saved listing with it (mode: 'edit').
//
// The Tools pages are forks of the Add/Edit forms: about 95% of their controls carry the same ids. A stored listing therefore already says what each control
// shows, in two ways, and this module reads both:
//
//  1. Provider / typed keys (ListPrice, BedroomsTotal, StreetName, ..., the typed list_price / bedrooms_total columns, the address and features JSON): the Sale
//     tables below are VERBATIM copies of the Sale form's own save <-> load tables (SALE_FIELD_MAP and its siblings). tests/runtime/crm-tools-viewer-hydration.test.ts
//     fails if a copy drifts from the form. The Rental form has no tables of its own: the Rental tables here are the inverse of what collectRentalFormData derives.
//  2. Control keys: both forms save by sweeping every control into the listing's raw_data under `field.id || field.name`, so the stored listing already holds each
//     control's state under that key. Anything the tables did not set is restored from there.
//
// mode 'view' (the default, the Tools viewers): a value the record does not carry stays blank (the page clears every entry-form default first: see
// viewerClearEntryDefaults), a provider value that no option on the page offers is shown as text beside the group instead of being dropped, and the page's
// classification, agent panel, co-listing list and 'Other stored fields' card are filled from the record.
// mode 'edit' (the Add / Edit form): values only. The form keeps its own classification, ownership reference, agent and co-listing sections, runs its own field
// rules and change handlers after the load, and hidden controls (the address atoms, the tenant-agent picker) are restored from the control keys too, over the
// same area its save sweeps.
//
// Nothing here writes to the CRM, and every value is written as text, never parsed as markup.
(function (global) {
  'use strict';

  // ── Sale: VERBATIM copies of the Sale form's own save <-> load tables (public/crm/SALE-FORM-REDESIGN.html) ───────────────────────
  // Do not edit here: change the form, then copy. tests/runtime/crm-tools-viewer-hydration.test.ts compares these row by row.
  var SALE_FIELD_MAP = [
    // ── Address ──
    { rls: 'StreetNumber', form: 'saleStreetNumber', type: 'text', src: 'addr' },
    { rls: 'StreetName', form: 'saleStreetName', type: 'text', src: 'addr' },
    { rls: 'StreetSuffix', form: 'saleStreetSuffix', type: 'text', src: 'addr' },
    { rls: 'StreetDirPrefix', form: 'saleStreetDirPrefix', type: 'text', src: 'addr' },
    { rls: 'UnitNumber', form: 'saleUnitNumber', type: 'text', src: 'addr' },
    { rls: 'City', form: 'saleCity', type: 'text', src: 'addr' },
    { rls: 'CityRegion', form: 'saleBorough', type: 'text', src: 'addr' },
    { rls: 'StateOrProvince', form: 'saleStateOrProvince', type: 'text', src: 'addr' },
    { rls: 'PostalCode', form: 'saleZipCode', type: 'text', src: 'addr' },
    { rls: 'PostalCity', form: 'salePostalCity', type: 'text', src: 'addr' },
    { rls: 'CountyOrParish', form: 'saleCountyOrParish', type: 'text', src: 'addr' },
    { rls: 'SubdivisionName', form: 'saleBldgNeighborhood', type: 'text', src: 'raw' },
    { rls: 'UnparsedAddress', form: 'saleUnparsedAddress', type: 'text', src: 'addr', fallbackRls: 'UnParsedAddress' },

    // ── Unit Details ──
    { rls: 'ListPrice', form: 'salePrice', type: 'number', src: 'listing', listingKey: 'list_price' },
    { rls: 'OriginalListPrice', form: 'saleOriginalPrice', type: 'number', src: 'raw' },
    { rls: 'BedroomsTotal', form: 'saleBedrooms', type: 'number', src: 'listing', listingKey: 'bedrooms_total' },
    { rls: 'BathroomsFull', form: 'saleFullBaths', type: 'number', src: 'listing', listingKey: 'bathrooms_full' },
    { rls: 'BathroomsHalf', form: 'saleHalfBaths', type: 'number', src: 'listing', listingKey: 'bathrooms_half' },
    { rls: 'LivingArea', form: 'saleUnitSqFt', type: 'number', src: 'listing', listingKey: 'living_area' },
    { rls: 'RoomsTotal', form: 'saleTotalRooms', type: 'number', src: 'raw' },
    { rls: 'EntryLevel', form: 'saleFloorInBuilding', type: 'text', src: 'raw' },

    // ── Description ──
    { rls: 'PublicRemarks', form: 'saleDescription', type: 'text', src: 'raw' },
    { rls: 'PrivateRemarks', form: 'saleBrokerComments', type: 'text', src: 'raw' },
    { rls: 'ShowingInstructions', form: 'saleShowingInstructions', type: 'text', src: 'raw' },

    // ── Financials ──
    // Unit annual real-estate tax. Hydrate features-first (features.TaxAnnualAmount — the
    // canonical bucket the public DTO + Trestle mapper write), raw_data fallback. NOT building
    // tax (saleBldgAnnualTaxes is building-level and must never fill this unit field). The real
    // Cotality field name `TaxAnnualAmount` is confirmed live (artifacts/metadata.xml). (2026-06-23)
    { rls: 'TaxAnnualAmount', form: 'saleRETaxes', type: 'number', src: 'features' },
    { rls: 'saleTaxDeduction', form: 'saleTaxDeduction', type: 'number', src: 'raw', fallbackRls: 'TaxDeductionPercent' }, // internal; TaxDeductionPercent not in Cotality
    { rls: 'FlipTax', form: 'saleFlipTaxAmount', type: 'text', src: 'raw' },
    { rls: 'AssociationFee', form: 'saleMaintCC', type: 'number', src: 'raw' },
    { rls: 'AssociationFeeFrequency', form: 'saleMaintCCFreq', type: 'text', src: 'raw' },
    { rls: 'ClosePrice', form: 'saleSoldPrice', type: 'number', src: 'raw' },
    { rls: 'Concessions', form: 'saleConcessions', type: 'text', src: 'raw' },

    // ── Dates ──
    { rls: 'OnMarketDate', form: 'saleDateListed', type: 'date', src: 'raw' },
    { rls: 'ExpirationDate', form: 'saleExclusiveExpires', type: 'date', src: 'raw' },
    { rls: 'ListingContractDate', form: 'saleExclusiveStart', type: 'date', src: 'raw' },
    { rls: 'ActivationDate', form: 'saleFirstShowingDate', type: 'date', src: 'raw', fallbackRls: 'FirstShowingDate' },
    { rls: 'OffMarketDate', form: 'saleOffMarketDate', type: 'date', src: 'raw' },
    { rls: 'WithdrawnDate', form: 'saleWithdrawnDate', type: 'date', src: 'raw' },
    { rls: 'PurchaseContractDate', form: 'saleContractSignedDate', type: 'date', src: 'raw' },
    { rls: 'CloseDate', form: 'saleSoldDate', type: 'date', src: 'raw' },
    { rls: 'Possession', form: 'saleAvailableOccupancy', type: 'date', src: 'raw', fallbackRls: 'PossessionDate' },

    // ── Building ──
    { rls: 'BuildingName', form: 'saleBldgName', type: 'text', src: 'raw' },
    { rls: 'StructureType', form: 'saleBldgType', type: 'text', src: 'raw' },
    { rls: 'YearBuilt', form: 'saleBldgYearBuilt', type: 'number', src: 'raw' },
    { rls: 'saleBldgYearRenovated', form: 'saleBldgYearRenovated', type: 'number', src: 'raw', fallbackRls: 'YearRenovated' }, // internal; YearRenovated not in Cotality
    { rls: 'StoriesTotal', form: 'saleBldgTotalFloors', type: 'number', src: 'raw' },
    { rls: 'NumberOfUnitsTotal', form: 'saleBldgTotalUnits', type: 'number', src: 'raw' },
    { rls: 'saleBldgNumElevators', form: 'saleBldgNumElevators', type: 'number', src: 'raw', fallbackRls: 'ElevatorsTotal' }, // internal; ElevatorsTotal not in Cotality
    { rls: 'CrossStreet', form: 'saleBldgCrossStreet1', type: 'text', src: 'raw' },
    { rls: 'TaxBlock', form: 'saleBldgTaxBlock', type: 'text', src: 'raw' },
    { rls: 'TaxLot', form: 'saleBldgTaxLot', type: 'text', src: 'raw', fallbackRls: 'BuildingTaxLot' },
    { rls: 'AssociationName', form: 'saleBldgAssociationName', type: 'text', src: 'raw' },
    { rls: 'NewConstructionYN', form: 'saleBldgNewConstruction', type: 'bool', src: 'raw' },
    { rls: 'saleBldgNewDevelopment', form: 'saleBldgNewDevelopment', type: 'bool', src: 'raw', fallbackRls: 'NewDevelopmentYN' }, // internal; NewDevelopmentYN not in Cotality
    { rls: 'SponsorUnitYN', form: 'saleBldgSponsorUnits', type: 'bool', src: 'raw' },
    { rls: 'TaxAbatementYN', form: 'saleBldgTaxAbatementYN', type: 'bool', src: 'raw' },
    { rls: 'TaxAbatementComments', form: 'saleBldgTaxAbatementComments', type: 'text', src: 'raw' },
    { rls: 'saleBldgSublettingAllowed', form: 'saleBldgSublettingAllowed', type: 'text', src: 'raw', fallbackRls: 'RentingAllowedYN' }, // internal select; RentingAllowedYN not in Cotality

    // ── Distribution ──
    { rls: 'saleIdxDisplayYN', form: 'saleDist_IDX', type: 'checked', src: 'listing', listingKey: 'idx_display_yn' }, // internal IDX-display control (idx_display_yn); IDXEntireListingDisplayYN is NOT a Cotality field
    { rls: 'InternetEntireListingDisplayYN', form: 'saleInternetEntireListingDisplayYN', type: 'checked', src: 'listing', listingKey: 'internet_entire_listing_display_yn' },
    { rls: 'InternetAddressDisplayYN', form: 'saleInternetAddressDisplayYN', type: 'checked', src: 'listing', listingKey: 'internet_address_display_yn' },

    // ── Agent (hidden fields populated by initLoggedInAgent) ──
    // Phase C: typedKey is the promoted typed column read FIRST (agent_info JSON is fallback).
    // ListAgentMlsId hydrates saleUpdatingAgentMlsId — the field collectSaleFormData() actually
    // SUBMITS as ListAgentMlsId (line ~7391). The internal-id field saleUpdatingAgent is seeded
    // separately by initLoggedInAgent; targeting it here meant the saved Cotality MLS id never
    // reached the submitted field, so a no-op edit re-sent the editor's session MLS id and
    // corrupted list_agent_mls_id on save. (Codex #420.)
    { rls: 'ListAgentMlsId', form: 'saleUpdatingAgentMlsId', type: 'text', src: 'agentInfo', agentKey: 'ListAgentMlsId', typedKey: 'list_agent_mls_id' },
    { rls: 'ListAgentFullName', form: 'saleUpdatingAgentName', type: 'text', src: 'agentInfo', agentKey: 'ListAgentFullName', typedKey: 'list_agent_full_name' },
    { rls: 'ListAgentEmail', form: 'saleUpdatingAgentEmail', type: 'text', src: 'agentInfo', agentKey: 'ListAgentEmail', typedKey: 'list_agent_email' },
    { rls: 'ListAgentDirectPhone', form: 'saleUpdatingAgentPhone', type: 'text', src: 'agentInfo', agentKey: 'ListAgentDirectPhone', typedKey: 'list_agent_direct_phone' },
    { rls: 'ListOfficeName', form: 'saleUpdatingAgentCompanyName', type: 'text', src: 'agentInfo', agentKey: 'ListOfficeName', typedKey: 'list_office_name' },
    { rls: 'ListAgentKey', form: 'saleUpdatingAgentKey', type: 'text', src: 'agentInfo', agentKey: 'ListAgentKey' },
    { rls: 'ListOfficeKey', form: 'saleUpdatingAgentOfficeKey', type: 'text', src: 'agentInfo', agentKey: 'ListOfficeKey' }, // the Cotality OfficeKey; the company slug lives in saleUpdatingAgentCompanyKey and is never a provider key
    { rls: 'ListOfficeMlsId', form: 'saleUpdatingAgentOfficeMlsId', type: 'text', src: 'agentInfo', agentKey: 'ListOfficeMlsId', typedKey: 'list_office_mls_id' },

    // ── Team ──
    { rls: 'ListTeamName', form: 'saleListTeamName', type: 'text', src: 'raw' },
    { rls: 'ListTeamMlsId', form: 'saleListTeamMlsId', type: 'text', src: 'raw' },

    // ── Townhouse ──
    { rls: 'Stories', form: 'saleTHStories', type: 'number', src: 'raw' },
    { rls: 'BuildingAreaTotal', form: 'saleTHBuildingArea', type: 'number', src: 'raw' },
    { rls: 'Levels', form: 'saleTHLevels', type: 'text', src: 'raw' },
    { rls: 'ZoningDescription', form: 'saleTHZoning', type: 'text', src: 'raw' },
    { rls: 'GarageYN', form: 'saleTHGarageYN', type: 'bool', src: 'raw' },
    { rls: 'GarageSpaces', form: 'saleTHGarageSpaces', type: 'number', src: 'raw' },
    { rls: 'ParkingTotal', form: 'saleTHParkingTotal', type: 'number', src: 'raw' },
    { rls: 'FoundationArea', form: 'saleTHFoundationArea', type: 'number', src: 'raw' },
    { rls: 'BasementYN', form: 'saleTHBasementYN', type: 'bool', src: 'raw' },
    { rls: 'LotSizeArea', form: 'saleTHLotSize', type: 'number', src: 'raw' },

    // ── Townhouse additional ──
    { rls: 'saleTHDescription', form: 'saleTHDescription', type: 'text', src: 'raw' },
    { rls: 'saleTHLayout', form: 'saleTHLayout', type: 'text', src: 'raw' },
    { rls: 'saleTHFinancing', form: 'saleTHFinancing', type: 'text', src: 'raw' },
    { rls: 'saleTHNotes', form: 'saleTHNotes', type: 'text', src: 'raw' },
    { rls: 'saleTHUnitsTotal', form: 'saleTHUnitsTotal', type: 'number', src: 'raw' },
    { rls: 'saleTHNumBuildings', form: 'saleTHNumBuildings', type: 'number', src: 'raw' },
    { rls: 'saleTHLotDimensions', form: 'saleTHLotDimensions', type: 'text', src: 'raw' },
    { rls: 'saleTHLotFeatures', form: 'saleTHLotFeatures', type: 'text', src: 'raw' },
    { rls: 'saleTHLotSizeUnits', form: 'saleTHLotSizeUnits', type: 'text', src: 'raw' },
    { rls: 'saleTHLotSizeSource', form: 'saleTHLotSizeSource', type: 'text', src: 'raw' },
    { rls: 'saleTHGrossSqFt', form: 'saleTHGrossSqFt', type: 'number', src: 'raw' },
    { rls: 'saleTHNetSqFt', form: 'saleTHNetSqFt', type: 'number', src: 'raw' },
    { rls: 'saleTHFoundation', form: 'saleTHFoundation', type: 'text', src: 'raw' },
    { rls: 'saleTHOverFAR', form: 'saleTHOverFAR', type: 'text', src: 'raw' },
    { rls: 'saleTHUnderFAR', form: 'saleTHUnderFAR', type: 'text', src: 'raw' },
    { rls: 'saleTHLandLeaseYN', form: 'saleTHLandLeaseYN', type: 'text', src: 'raw' },
    { rls: 'saleTHLandLeaseAmt', form: 'saleTHLandLeaseAmt', type: 'number', src: 'raw' },
    { rls: 'saleTHLandLeaseFreq', form: 'saleTHLandLeaseFreq', type: 'text', src: 'raw' },
    { rls: 'saleTHLandLeaseExp', form: 'saleTHLandLeaseExp', type: 'date', src: 'raw' },
    { rls: 'saleTHAttachedGarage', form: 'saleTHAttachedGarage', type: 'text', src: 'raw' },
    { rls: 'saleTHOpenParkingYN', form: 'saleTHOpenParkingYN', type: 'text', src: 'raw' },
    { rls: 'saleTHOpenSpaces', form: 'saleTHOpenSpaces', type: 'number', src: 'raw' },
    { rls: 'saleTHLandmark', form: 'saleTHLandmark', type: 'text', src: 'raw' },
    { rls: 'saleTHBuildingAreaUnits', form: 'saleTHBuildingAreaUnits', type: 'text', src: 'raw' },
    { rls: 'saleTHCommercialYN', form: 'saleTHCommercialYN', type: 'text', src: 'raw' },
    { rls: 'saleTHDevStatus', form: 'saleTHDevStatus', type: 'text', src: 'raw' },
    { rls: 'saleTHCapRate', form: 'saleTHCapRate', type: 'number', src: 'raw' },
    { rls: 'saleTHProfUnits', form: 'saleTHProfUnits', type: 'number', src: 'raw' },
    { rls: 'saleTHRetailUnits', form: 'saleTHRetailUnits', type: 'number', src: 'raw' },
    { rls: 'saleTHVacantUnits', form: 'saleTHVacantUnits', type: 'number', src: 'raw' },

    // ── Unit additional ──
    { rls: 'saleCondition', form: 'saleCondition', type: 'text', src: 'raw' },
    { rls: 'saleInteriorSqFt', form: 'saleInteriorSqFt', type: 'number', src: 'raw' },
    { rls: 'saleExteriorSqFt', form: 'saleExteriorSqFt', type: 'number', src: 'raw' },
    { rls: 'saleLineInBuilding', form: 'saleLineInBuilding', type: 'text', src: 'raw' },
    { rls: 'saleUnitShares', form: 'saleUnitShares', type: 'number', src: 'raw' },
    { rls: 'salePercentCommon', form: 'salePercentCommon', type: 'number', src: 'raw' },
    { rls: 'saleLivingAreaUnits', form: 'saleLivingAreaUnits', type: 'text', src: 'raw' },

    // ── Selects not yet mapped ──
    { rls: 'saleStructureType', form: 'saleStructureType', type: 'text', src: 'raw' },

    // ── Financial additional ──
    { rls: 'saleConcessionAmount', form: 'saleConcessionAmount', type: 'number', src: 'raw' },
    { rls: 'saleConcessionComments', form: 'saleConcessionComments', type: 'text', src: 'raw' },
    { rls: 'saleExclusiveCommission', form: 'saleExclusiveCommission', type: 'text', src: 'raw' },
    // %/$ type select — Cotality CompensationType enum (Percent/Dollars), internal.
    // Renamed from saleCommissionType (which collided with the payer radios and
    // was clobbered), so there is no usable legacy value to fall back to; new
    // rows default to Percent via the <option selected>. (Track 1 commission fix.)
    { rls: 'saleExclusiveCommissionType', form: 'saleExclusiveCommissionType', type: 'text', src: 'raw' },

    // ── Distribution additional ──
    { rls: 'saleListingUrl', form: 'saleListingUrl', type: 'text', src: 'raw' },
    { rls: 'saleWebDisplayAddress', form: 'saleWebDisplayAddress', type: 'text', src: 'raw' },
    { rls: 'saleWebHeadline', form: 'saleWebHeadline', type: 'text', src: 'raw' },

    // ── Building additional ──
    { rls: 'saleBldgBorough', form: 'saleBldgBorough', type: 'text', src: 'raw' },
    { rls: 'saleBldgCity', form: 'saleBldgCity', type: 'text', src: 'raw' },
    { rls: 'saleBldgState', form: 'saleBldgState', type: 'text', src: 'raw' },
    { rls: 'saleBldgZip', form: 'saleBldgZip', type: 'text', src: 'raw' },
    { rls: 'saleBldgCrossStreet2', form: 'saleBldgCrossStreet2', type: 'text', src: 'raw' },
    { rls: 'saleBldgResidentialUnits', form: 'saleBldgResidentialUnits', type: 'number', src: 'raw' },
    { rls: 'saleBldgCommercialUnits', form: 'saleBldgCommercialUnits', type: 'number', src: 'raw' },
    { rls: 'saleBldgParkingSpaces', form: 'saleBldgParkingSpaces', type: 'number', src: 'raw' },
    { rls: 'saleBldgTotalShares', form: 'saleBldgTotalShares', type: 'number', src: 'raw' },
    { rls: 'saleBldgUnderlyingMortgage', form: 'saleBldgUnderlyingMortgage', type: 'text', src: 'raw' },
    { rls: 'saleBldgCapitalReserves', form: 'saleBldgCapitalReserves', type: 'text', src: 'raw' },
    { rls: 'saleBldgAnnualTaxes', form: 'saleBldgAnnualTaxes', type: 'number', src: 'raw' },
    { rls: 'saleBldgTaxAbatementExpYear', form: 'saleBldgTaxAbatementExpYear', type: 'text', src: 'raw' },
    { rls: 'saleBldgDescription', form: 'saleBldgDescription', type: 'text', src: 'raw' },
    { rls: 'saleBldgWebsite', form: 'saleBldgWebsite', type: 'text', src: 'raw' },
    { rls: 'saleBldgMaxSubletYears', form: 'saleBldgMaxSubletYears', type: 'number', src: 'raw' },
    { rls: 'saleBldgSubletFee', form: 'saleBldgSubletFee', type: 'text', src: 'raw' },
    { rls: 'saleBldgMaxFinancing', form: 'saleBldgMaxFinancing', type: 'text', src: 'raw' },
    { rls: 'saleBldgMinDownPayment', form: 'saleBldgMinDownPayment', type: 'text', src: 'raw' },
    { rls: 'saleBldgDTIRatio', form: 'saleBldgDTIRatio', type: 'text', src: 'raw' },
    { rls: 'saleBldgPostCloseLiquidity', form: 'saleBldgPostCloseLiquidity', type: 'text', src: 'raw' },
    { rls: 'saleBldgBoardApproval', form: 'saleBldgBoardApproval', type: 'text', src: 'raw' },
    { rls: 'saleBldgPetWeightLimit', form: 'saleBldgPetWeightLimit', type: 'number', src: 'raw' },
    { rls: 'saleBldgPetNotes', form: 'saleBldgPetNotes', type: 'text', src: 'raw' },
    // ── Mallan Building Profile — internal personnel & contacts ──────────────
    // Management company, building staff (super / resident manager) and board
    // contact. NOT Cotality (the feed has no such fields); collected via the
    // building-modal sweep and persisted in raw_data. They previously had NO
    // restore entry, so they vanished on edit-load — these reload them. Never
    // emitted to IDX/feed. (2026-05-31 building-profile stabilization.)
    { rls: 'saleBldgMgmtCompany', form: 'saleBldgMgmtCompany', type: 'text', src: 'raw' },
    { rls: 'saleBldgMgmtPhone', form: 'saleBldgMgmtPhone', type: 'text', src: 'raw' },
    { rls: 'saleBldgMgmtEmail', form: 'saleBldgMgmtEmail', type: 'text', src: 'raw' },
    { rls: 'saleBldgMgmtAddress', form: 'saleBldgMgmtAddress', type: 'text', src: 'raw' },
    { rls: 'saleBldgSuperName', form: 'saleBldgSuperName', type: 'text', src: 'raw' },
    { rls: 'saleBldgSuperPhone', form: 'saleBldgSuperPhone', type: 'text', src: 'raw' },
    { rls: 'saleBldgSuperEmail', form: 'saleBldgSuperEmail', type: 'text', src: 'raw' },
    { rls: 'saleBldgManagerName', form: 'saleBldgManagerName', type: 'text', src: 'raw' },
    { rls: 'saleBldgManagerPhone', form: 'saleBldgManagerPhone', type: 'text', src: 'raw' },
    { rls: 'saleBldgManagerEmail', form: 'saleBldgManagerEmail', type: 'text', src: 'raw' },
    { rls: 'saleBldgBoardPresident', form: 'saleBldgBoardPresident', type: 'text', src: 'raw' },
    { rls: 'saleBldgBoardEmail', form: 'saleBldgBoardEmail', type: 'text', src: 'raw' },

    // ── Dates additional ──
    { rls: 'saleFirstCoBroke', form: 'saleFirstCoBroke', type: 'date', src: 'raw' },
    { rls: 'saleAvailableOccupancy', form: 'saleAvailableOccupancy', type: 'date', src: 'raw' },

    // ── Media / Virtual Tours ──
    { rls: 'VirtualTourURLUnbranded', form: 'saleVirtualTourUnbranded', type: 'text', src: 'raw' },
    { rls: 'saleVirtualTourUnbranded2', form: 'saleVirtualTourUnbranded2', type: 'text', src: 'raw' },
    { rls: 'saleVirtualTourUnbranded3', form: 'saleVirtualTourUnbranded3', type: 'text', src: 'raw' },
    { rls: 'saleVideoUrl', form: 'saleVideoUrl', type: 'text', src: 'raw' },
    { rls: 'saleVideoTourUrl', form: 'saleVideoTourUrl', type: 'text', src: 'raw' },
    { rls: 'saleMatterportUrl', form: 'saleMatterportUrl', type: 'text', src: 'raw' },

    // ── Commercial ──
    { rls: 'commercial_sub_type', form: 'saleCommSubtype', type: 'text', src: 'raw' },
    { rls: 'commercial_ownership', form: 'saleCommercialOwnership', type: 'text', src: 'raw' },
    { rls: 'LivingAreaSource', form: 'saleLivingAreaSource', type: 'text', src: 'raw' },

    // ── Auction ──
    { rls: 'auction_type', form: 'saleAuctionType', type: 'text', src: 'raw' },
    { rls: 'auction_terms_url', form: 'saleAuctionTermsUrl', type: 'text', src: 'raw' },

    // ── Class C single-id booleans (2026-05-28) ──
    // Five checkboxes that were previously unnamed are now single-id
    // booleans (one input per field, restored by setChecked on the id).
    // The HTML codemod added `name=` + `id=` attributes; populate restores
    // via type:'bool' which calls setChecked(form, val === true).
    // saleSendToRls + saleSendToWebsite may overlap semantically with the
    // existing SyndicateTo/IDXEntireListingDisplayYN distribution flags —
    // flagged in the audit for follow-up unification, persist for now to
    // avoid data loss.
    { rls: 'saleAlsoAvailableForRent', form: 'saleAlsoAvailableForRent', type: 'bool', src: 'raw' },
    { rls: 'saleSendToRls', form: 'saleSendToRls', type: 'bool', src: 'raw' },
    { rls: 'saleSendToWebsite', form: 'saleSendToWebsite', type: 'bool', src: 'raw' },
    { rls: 'saleWasherDryerHookups', form: 'saleWasherDryerHookups', type: 'bool', src: 'raw' },
    { rls: 'saleWasherDryerInUnit', form: 'saleWasherDryerInUnit', type: 'bool', src: 'raw' },

    // ── 2026-05-28 — single-id boolean checkboxes surfaced by the
    // full-coverage parametrized test that had no restore wiring before.
    // 13 building-modal policy/historic flags + 4 compliance acks +
    // saleInternetConsumerCommentYN (RESO canonical, per-row opt-out,
    // fail-CLOSED per REBNY compliance §7 — the canonical write is in
    // collectSaleFormData below mirroring the AVM pattern).
    { rls: 'saleCommNegotiabilityAck', form: 'saleCommNegotiabilityAck', type: 'bool', src: 'raw' },
    { rls: 'saleFairHousingAck', form: 'saleFairHousingAck', type: 'bool', src: 'raw' },
    // saleInternetConsumerCommentYN: form key. Canonical RESO is
    // `InternetConsumerCommentYN` (per-row opt-out, fail-CLOSED per
    // compliance index §7). Restore reads CRM raw first, falls back to
    // canonical so a Trestle-sync write still restores.
    { rls: 'saleInternetConsumerCommentYN', form: 'saleInternetConsumerCommentYN', type: 'bool', src: 'raw', fallbackRls: 'InternetConsumerCommentYN' },
    { rls: 'saleVOWOptOutYN', form: 'saleVOWOptOutYN', type: 'bool', src: 'raw' },
    // Building-modal flags (real persistence, Mallan-internal — no RESO
    // mapping for purchasing policies like "Pied-a-Terre Allowed").
    { rls: 'saleBldgLandmark', form: 'saleBldgLandmark', type: 'bool', src: 'raw' },
    { rls: 'saleBldgHistoric', form: 'saleBldgHistoric', type: 'bool', src: 'raw' },
    { rls: 'saleBldgLEED', form: 'saleBldgLEED', type: 'bool', src: 'raw' },
    { rls: 'saleBldgConversion', form: 'saleBldgConversion', type: 'bool', src: 'raw' },
    { rls: 'saleBldgCapitalReservesYN', form: 'saleBldgCapitalReservesYN', type: 'bool', src: 'raw' },
    { rls: 'saleBldgWasherDryerAllowed', form: 'saleBldgWasherDryerAllowed', type: 'bool', src: 'raw' },
    { rls: 'saleBldgPiedATerre', form: 'saleBldgPiedATerre', type: 'bool', src: 'raw' },
    { rls: 'saleBldgParentsAllowed', form: 'saleBldgParentsAllowed', type: 'bool', src: 'raw' },
    { rls: 'saleBldgCoBuyersAllowed', form: 'saleBldgCoBuyersAllowed', type: 'bool', src: 'raw' },
    { rls: 'saleBldgCorpOwnAllowed', form: 'saleBldgCorpOwnAllowed', type: 'bool', src: 'raw' },
    { rls: 'saleBldgGiftsAllowed', form: 'saleBldgGiftsAllowed', type: 'bool', src: 'raw' },
    { rls: 'saleBldgBoardInterview', form: 'saleBldgBoardInterview', type: 'bool', src: 'raw' },
  ];

  var SALE_CHECKBOX_ARRAY_MAP = [
    { rls: 'PetsAllowed', name: 'salePetsAllowed' },
    { rls: 'BuildingPetsAllowed', name: 'saleBuildingPetsAllowed' },
    { rls: 'AttendanceType', name: 'saleAttendanceType' },
    { rls: 'BuildingLaundryFeatures', name: 'saleBuildingLaundryFeatures' },
    { rls: 'Heating', name: 'saleHeating' },
    { rls: 'Cooling', name: 'saleCooling' },
    { rls: 'saleCommSubtype', name: 'saleCommSubtype' },
    // ── Class B (2026-05-28) ──
    // 5 named checkbox groups whose data was lost at save time (no array
    // collection in collect, no entry here). See audit §2.
    { rls: 'saleBldgHeating', name: 'saleBldgHeating', fallbackRls: 'BuildingHeating' }, // internal; BuildingHeating not in Cotality
    { rls: 'saleBldgCooling', name: 'saleBldgCooling', fallbackRls: 'BuildingCooling' }, // internal; BuildingCooling not in Cotality
    { rls: 'saleBldgDocsAvailable', name: 'saleBldgDocsAvailable' },
    { rls: 'saleTHDocsAvailable', name: 'saleTHDocsAvailable' },
    { rls: 'saleBusinessType', name: 'saleBusinessType' },
    // ── Class C (2026-05-28) ──
    // 17 newly-named checkbox groups, previously unnamed <input>s. The HTML
    // codemod in this same PR adds the name+value attributes; these entries
    // restore them on edit. See audit §3 for the per-section decision table.
    // (Pricing, Important Dates, Washer/Dryer hookups/in-unit — those 4
    // entries are single-id booleans and go through SALE_FIELD_MAP instead,
    // not here.)
    { rls: 'saleResidentialType', name: 'saleResidentialType' },
    { rls: 'saleCommercialFeatures', name: 'saleCommercialFeatures' },
    { rls: 'salePrivateOutdoorSpace', name: 'salePrivateOutdoorSpace' },
    { rls: 'saleExposure', name: 'saleExposure' },
    { rls: 'saleViewList', name: 'saleViewList' },
    { rls: 'saleAdditionalRooms', name: 'saleAdditionalRooms' },
    { rls: 'saleKitchenType', name: 'saleKitchenType' },
    { rls: 'saleKitchenFeatures', name: 'saleKitchenFeatures' },
    { rls: 'saleDining', name: 'saleDining' },
    { rls: 'saleBathroomFeatures', name: 'saleBathroomFeatures' },
    { rls: 'saleFeatureDetails', name: 'saleFeatureDetails' },
    { rls: 'saleWindows', name: 'saleWindows' },
    { rls: 'saleCeilings', name: 'saleCeilings' },
    { rls: 'saleFlooring', name: 'saleFlooring' }, // Mallan internal — RESO Flooring enum doesn't include "Herringbone" (Codex PR #270 review). Future migration in separate PR.
    { rls: 'saleStorage', name: 'saleStorage' },
    { rls: 'saleWasherDryerBrand', name: 'saleWasherDryerBrand' },
    { rls: 'saleFreshAirSystem', name: 'saleFreshAirSystem' },
    { rls: 'saleHvacSystem', name: 'saleHvacSystem' },
  ];

  var BUILDING_FEATURES_LABEL_TO_CANONICAL = {
    'Elevator': 'Elevators',
    'Gym/Fitness Center': 'FitnessCenter',
    "Children's Playroom": 'CommonPlayroom',
    'Resident Lounge': 'CommonLounge',
    'Bike Room': 'BikeStorage',
    'Storage Available': 'Storage',
    'Package Room': 'PackageRoom',
    'Cold Storage': 'ColdStorage',
  };

  var SALE_BUILDING_FEATURE_IDS = [
    'saleBldgElevator', 'saleBldgGym', 'saleBldgPool', 'saleBldgRoofDeck',
    'saleBldgCourtyard', 'saleBldgPlayroom', 'saleBldgLounge', 'saleBldgBusinessCenter',
    'saleBldgConferenceRoom', 'saleBldgBikeRoom', 'saleBldgStorage', 'saleBldgParking',
    'saleBldgValet', 'saleBldgPackageRoom', 'saleBldgColdStorage', 'saleBldgLiveInSuper',
    'saleBldgOnSiteManager', 'saleBldgWheelchairAccess', 'saleBldgSpa',
  ];

  var SALE_SYNDICATION_MAP = [
    { id: 'saleDist_Listhub', target: 'Listhub', cotality: 'Listhub' },
    { id: 'saleDist_NYMLS', target: 'NYMLS', cotality: null },        // not a Cotality SyndicateTo member
    { id: 'saleDist_Realtor', target: 'Realtor', cotality: 'Realtorcom' }, // Cotality member is Realtorcom
    { id: 'saleDist_RLS', target: 'RLS', cotality: null },            // not a Cotality SyndicateTo member
    { id: 'saleDist_RPX', target: 'RPX', cotality: null },            // not a Cotality SyndicateTo member
    { id: 'saleDist_WWW', target: 'WWW', cotality: null },            // not a Cotality SyndicateTo member
  ];

  var SALE_RADIO_MAP = [
    { rls: 'saleListingType', name: 'saleListingType', src: 'raw', rawKey: 'saleListingType', fallback: 'ListingAgreement' },
    // Buyer-agent payer radios (OwnerPays/BuyerPays). Renamed from saleCommissionType
    // to break the key collision with the %/$ type select. Legacy rows stored the
    // payer under the old saleCommissionType key (the radio clobbered the type), so
    // fall back to it on reload. Internal — never emitted to the IDX/feed. (Track 1.)
    { rls: 'saleBuyerAgentPays', name: 'saleBuyerAgentPays', src: 'raw', rawKey: 'saleBuyerAgentPays', fallback: 'saleCommissionType' },
    // PropertyType radio uses CRM-specific values (Condo/Coop/Condop/...) that
    // do NOT match RESO PropertySubType ("Apartment" for all three). Restore
    // from the form's own saved salePropertyType field first, falling back to
    // CommonInterest (Condominium/StockCooperative/Condop) → CRM radio value.
    { rls: 'salePropertyType', name: 'salePropertyType', src: 'raw', rawKey: 'salePropertyType', fallback: 'CommonInterest', valueMap: { Condominium: 'Condo', StockCooperative: 'Coop', Condop: 'Condop' } },
    { rls: 'saleBuildingStatus', name: 'saleBuildingStatus', src: 'raw' },
    { rls: 'saleCoolingYN', name: 'saleCoolingYN', src: 'raw' },
    { rls: 'saleWasherDryerAllowed', name: 'saleWasherDryerAllowed', src: 'raw' },
    { rls: 'saleHasViews', name: 'saleHasViews', src: 'raw' },
    { rls: 'saleGarageSpaces', name: 'saleGarageSpaces', src: 'raw' },
    { rls: 'fireplace', name: 'fireplace', src: 'raw' },
    { rls: 'saleCommercialOwnership', name: 'saleCommercialOwnership', src: 'raw' },
    // ── Class A additions (2026-05-28) — see
    // docs/crm/sales-form-radio-checkbox-roundtrip-audit-2026-05-28.md §1.
    // All 25 had `name` and were saved by the generic collector, but populate
    // had no restore entry → edit-load reverted them to HTML-default.
    // Comprehensive coverage: every radio group on the sales form now has
    // a restore mapping. Per fail-closed: src='raw' uses CRM raw key first.
    { rls: 'commSalePayMethod', name: 'commSalePayMethod', src: 'raw' },
    { rls: 'saleBoardApplication', name: 'saleBoardApplication', src: 'raw' },
    { rls: 'saleBoardApproval', name: 'saleBoardApproval', src: 'raw' },
    { rls: 'saleBoardInterview', name: 'saleBoardInterview', src: 'raw' },
    { rls: 'saleCertOccupancy', name: 'saleCertOccupancy', src: 'raw' },
    { rls: 'saleCoPurchasing', name: 'saleCoPurchasing', src: 'raw' },
    { rls: 'saleCurrentUse', name: 'saleCurrentUse', src: 'raw' },
    { rls: 'saleDirectDeal', name: 'saleDirectDeal', src: 'raw' },
    { rls: 'saleFilmLocation', name: 'saleFilmLocation', src: 'raw' },
    { rls: 'saleFirstRefusal', name: 'saleFirstRefusal', src: 'raw' },
    { rls: 'saleGuarantors', name: 'saleGuarantors', src: 'raw' },
    { rls: 'saleHeatingYN', name: 'saleHeatingYN', src: 'raw' },
    { rls: 'saleHistoryType', name: 'saleHistoryType', src: 'raw' },
    // saleInternetAVMDisplayYN: the FORM key. The canonical RESO key is
    // `InternetAutomatedValuationDisplayYN` (per-row opt-out, fail-CLOSED
    // semantics per REBNY compliance index §7). Restore reads the CRM raw
    // key first ('Yes'/'No' string), falls back to canonical (boolean
    // true/false) so a row written by Trestle sync still restores. The
    // valueMap translates both literal booleans (Trestle write) and
    // stringified 'true'/'false' (JSON serialization edge case) to the
    // radio's 'Yes'/'No' option values.
    { rls: 'saleInternetAVMDisplayYN', name: 'saleInternetAVMDisplayYN', src: 'raw', rawKey: 'saleInternetAVMDisplayYN', fallback: 'InternetAutomatedValuationDisplayYN', valueMap: { true: 'Yes', false: 'No', 'true': 'Yes', 'false': 'No' } },
    { rls: 'saleLandLease', name: 'saleLandLease', src: 'raw' },
    { rls: 'saleLight', name: 'saleLight', src: 'raw' },
    { rls: 'saleLiveWorkAllowed', name: 'saleLiveWorkAllowed', src: 'raw' },
    { rls: 'saleMeetAndGreet', name: 'saleMeetAndGreet', src: 'raw' },
    { rls: 'saleNumFloors', name: 'saleNumFloors', src: 'raw' },
    { rls: 'saleOfficeRetailOwnership', name: 'saleOfficeRetailOwnership', src: 'raw' },
    { rls: 'saleParentsBuying', name: 'saleParentsBuying', src: 'raw' },
    { rls: 'salePiedATerre', name: 'salePiedATerre', src: 'raw' },
    { rls: 'saleSubletting', name: 'saleSubletting', src: 'raw' },
    { rls: 'saleTenantConfig', name: 'saleTenantConfig', src: 'raw' },
    { rls: 'saleUnitType2', name: 'saleUnitType2', src: 'raw' },
  ];

  // ── Rental: the inverse of collectRentalFormData (RESO key -> the control that produced it) ──────────────────────────────────────
  var RENTAL_FIELD_MAP = [
    // Typed columns first (these are the source of truth for the current value), then raw_data.
    { rls: 'ListPrice', form: 'rentalMonthlyRent', type: 'number', src: 'listing', listingKey: 'list_price' },
    { rls: 'BedroomsTotal', form: 'rentalBedrooms', type: 'number', src: 'listing', listingKey: 'bedrooms_total' },
    { rls: 'BathroomsFull', form: 'rentalFullBathrooms', type: 'number', src: 'listing', listingKey: 'bathrooms_full' },
    { rls: 'BathroomsHalf', form: 'rentalHalfBathrooms', type: 'number', src: 'listing', listingKey: 'bathrooms_half' },
    { rls: 'LivingArea', form: 'rentalSqFt', type: 'number', src: 'listing', listingKey: 'living_area' },
    { rls: 'RoomsTotal', form: 'rentalTotalRooms', type: 'number', src: 'raw' },
    { rls: 'SecurityDeposit', form: 'rentalSecurityDeposit', type: 'number', src: 'raw' },
    { rls: 'EntryLevel', form: 'rentalFloor', type: 'text', src: 'raw' },
    { rls: 'Concessions', form: 'rentalConcessions', type: 'text', src: 'raw' },
    { rls: 'Furnished', form: 'rentalFurnished', type: 'text', src: 'raw' },
    // Address (the street line is composed separately)
    { rls: 'UnitNumber', form: 'rentalUnitNumber', type: 'text', src: 'addr' },
    { rls: 'City', form: 'rentalCity', type: 'text', src: 'addr' },
    { rls: 'CityRegion', form: 'rentalBorough', type: 'text', src: 'addr' },
    { rls: 'PostalCode', form: 'rentalZipCode', type: 'text', src: 'addr' },
    { rls: 'SubdivisionName', form: 'rentalNeighborhood', type: 'text', src: 'raw' },
    // Description
    { rls: 'PublicRemarks', form: 'rentalDescription', type: 'text', src: 'raw' },
    { rls: 'PrivateRemarks', form: 'rentalAgentRemarks', type: 'text', src: 'raw' },
    { rls: 'ShowingInstructions', form: 'rentalShowingInstructions', type: 'text', src: 'raw' },
    // Dates
    { rls: 'OnMarketDate', form: 'rentalDateListed', type: 'date', src: 'raw' },
    { rls: 'ExpirationDate', form: 'rentalExclusiveExpires', type: 'date', src: 'raw' },
    { rls: 'ListingContractDate', form: 'rentalExclusiveStart', type: 'date', src: 'raw' },
    { rls: 'AvailabilityDate', form: 'rentalAvailableDate', type: 'date', src: 'raw' },
    { rls: 'FirstShowingDate', form: 'rentalFirstShowingDate', type: 'date', src: 'raw' },
    { rls: 'OffMarketDate', form: 'rentalOffMarketDate', type: 'date', src: 'raw' },
    // Team
    { rls: 'ListTeamName', form: 'rentalListTeamName', type: 'text', src: 'raw' },
    { rls: 'ListTeamMlsId', form: 'rentalListTeamMlsId', type: 'text', src: 'raw' },
    // Townhouse / building detail
    { rls: 'Stories', form: 'rentalTHStories', type: 'number', src: 'raw' },
    { rls: 'BuildingAreaTotal', form: 'rentalTHBuildingArea', type: 'number', src: 'raw' },
    { rls: 'Levels', form: 'rentalTHLevels', type: 'text', src: 'raw' },
    { rls: 'ZoningDescription', form: 'rentalTHZoning', type: 'text', src: 'raw' },
    { rls: 'GarageSpaces', form: 'rentalTHGarageSpaces', type: 'number', src: 'raw' },
    { rls: 'ParkingTotal', form: 'rentalTHParkingTotal', type: 'number', src: 'raw' },
    { rls: 'FoundationArea', form: 'rentalTHFoundationArea', type: 'number', src: 'raw' },
    { rls: 'LotSizeArea', form: 'rentalTHLotSize', type: 'number', src: 'raw' },
    // Building modal
    { rls: 'BuildingName', form: 'bldgName', type: 'text', src: 'raw' },
    { rls: 'StructureType', form: 'bldgType', type: 'text', src: 'raw' },
    { rls: 'YearBuilt', form: 'bldgYearBuilt', type: 'number', src: 'raw' },
    { rls: 'YearRenovated', form: 'bldgYearRenovated', type: 'number', src: 'raw' },
    { rls: 'StoriesTotal', form: 'bldgTotalFloors', type: 'number', src: 'raw' },
    { rls: 'NumberOfUnitsTotal', form: 'bldgTotalUnits', type: 'number', src: 'raw' },
    { rls: 'ElevatorsTotal', form: 'bldgNumElevators', type: 'number', src: 'raw' },
    { rls: 'CrossStreet', form: 'bldgCrossStreet1', type: 'text', src: 'raw' },
    { rls: 'TaxBlock', form: 'bldgTaxBlock', type: 'text', src: 'raw' },
    { rls: 'TaxLot', form: 'bldgTaxLot', type: 'text', src: 'raw', fallbackRls: 'BuildingTaxLot' },   // Cotality's field is TaxLot; older rows saved BuildingTaxLot
    { rls: 'AssociationName', form: 'bldgAssociationName', type: 'text', src: 'raw' },
    { rls: 'TaxAbatementComments', form: 'bldgTaxAbatementComments', type: 'text', src: 'raw' },
    { rls: 'NewDevelopmentYN', form: 'bldgNewDevelopment', type: 'bool', src: 'raw' },
    { rls: 'TaxAbatementYN', form: 'bldgTaxAbatementYN', type: 'bool', src: 'raw' },
    { rls: 'RentingAllowedYN', form: 'bldgSublettingAllowed', type: 'bool', src: 'raw' },
    // Media
    { rls: 'VirtualTourURLUnbranded', form: 'rentalVirtualTourUnbranded', type: 'text', src: 'raw' },
    // FARE Act (NYC LL 119/2024) disclosures
    { rls: 'TenantPays', form: 'rentalTenantPays', type: 'text', src: 'raw' },
    { rls: 'TenantPaysDescription', form: 'rentalTenantPaysDescription', type: 'text', src: 'raw' },
    { rls: 'OngoingFees', form: 'rentalOngoingFees', type: 'text', src: 'raw' },
    { rls: 'FeeFrequency', form: 'rentalFeeFrequency', type: 'text', src: 'raw' },
    { rls: 'MoveInCosts', form: 'rentalMoveInCosts', type: 'text', src: 'raw' },
    { rls: 'MoveInCostsAmount', form: 'rentalMoveInCostsAmount', type: 'number', src: 'raw', fallbackRls: 'AdditionalFee' },
    { rls: 'MoveInCostsComments', form: 'rentalMoveInCostsComments', type: 'text', src: 'raw', fallbackRls: 'AdditionalFeeDescription' },
    { rls: 'AdditionalFee', form: 'rentalAdditionalFee', type: 'number', src: 'raw' },
    { rls: 'AdditionalFeeDescription', form: 'rentalAdditionalFeeDescription', type: 'text', src: 'raw' },
    { rls: 'AdditionalFeeFrequency', form: 'rentalAdditionalFeeFrequency', type: 'text', src: 'raw' },
    { rls: 'AdditionalFeeYN', form: 'rentalAdditionalFeeYN', type: 'bool', src: 'raw' },
    // Distribution (typed columns)
    { rls: 'IDXEntireListingDisplayYN', form: 'rentalIDXEntireListingDisplayYN', type: 'checked', src: 'listing', listingKey: 'idx_display_yn' },
    { rls: 'InternetEntireListingDisplayYN', form: 'rentalInternetEntireListingDisplayYN', type: 'checked', src: 'listing', listingKey: 'internet_entire_listing_display_yn' },
    { rls: 'InternetAddressDisplayYN', form: 'rentalInternetAddressDisplayYN', type: 'checked', src: 'listing', listingKey: 'internet_address_display_yn' },
  ];

  var RENTAL_RADIO_MAP = [
    { rls: 'rentalListingType', name: 'rentalListingType', src: 'raw', rawKey: 'rentalListingType', fallback: 'ListingAgreement' },
    { rls: 'rentalCoBrokeAgreement', name: 'rentalCoBrokeAgreement', src: 'raw', rawKey: 'rentalCoBrokeAgreement', fallback: 'CoBrokeAgreement' },
  ];

  var RENTAL_CHECKBOX_ARRAY_MAP = [
    { rls: 'PetsAllowed', name: 'rentalPetsAllowed' },
    { rls: 'BuildingPetsAllowed', name: 'rentalBuildingPetsAllowed' },
    { rls: 'AttendanceType', name: 'rentalAttendanceType' },
    { rls: 'BuildingLaundryFeatures', name: 'rentalBuildingLaundryFeatures' },
    // Heating and Cooling are live Cotality Property fields; the other groups are the form's own (saved under the group's name)
    { rls: 'Heating', name: 'rentalHeating' },
    { rls: 'Cooling', name: 'rentalCooling' },
    { rls: 'rentalCommSubtype', name: 'rentalCommSubtype' },
    { rls: 'rentalBusinessType', name: 'rentalBusinessType' },
    { rls: 'rentalTHDocsAvailable', name: 'rentalTHDocsAvailable' },
    { rls: 'bldgHeating', name: 'bldgHeating' },
    { rls: 'bldgCooling', name: 'bldgCooling' },
    { rls: 'bldgDocsAvailable', name: 'bldgDocsAvailable' },
  ];

  var CONFIG = {
    sale: {
      prefix: 'sale',
      zones: ['saleMainTab1', 'saleMainTab2', 'saleMainTab3', 'saleMainTab4', 'saleBuildingModal'],
      editZones: ['saleBuildingModal', 'saleMediaModal'],   // plus the form's main area (the container its save sweeps)
      fields: SALE_FIELD_MAP, radios: SALE_RADIO_MAP, arrays: SALE_CHECKBOX_ARRAY_MAP,
    },
    rental: {
      prefix: 'rental',
      zones: ['rentalMainTab1', 'rentalMainTab2', 'rentalMainTab3', 'rentalMainTab4', 'rentalBuildingModal'],
      editZones: ['rentalBuildingModal', 'rentalMediaModal'],   // plus the form's main area (the container its save sweeps)
      fields: RENTAL_FIELD_MAP, radios: RENTAL_RADIO_MAP, arrays: RENTAL_CHECKBOX_ARRAY_MAP,
    },
  };

  // ── Small helpers (all display-only) ───────────────────────────────────────────────────────────────────────────────────────────
  function isBlank(v) { return v === undefined || v === null || v === ''; }
  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function asObject(v) { return isObject(v) ? v : {}; }
  function byId(id) { return document.getElementById(id); }
  function isPrimitive(v) { return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'; }

  // Date and datetime-local controls only hold an exact format; anything else is not shown (it cannot be placed in the control).
  function dateText(v) {
    var m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v));
    return m ? m[1] : '';
  }
  function localDateTimeText(v) {
    var m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(String(v));
    return m ? m[1] : '';
  }

  function setValue(el, val) {
    if (!el || !isPrimitive(val)) return false;
    var tag = el.tagName;
    var type = (el.getAttribute('type') || '').toLowerCase();
    var s = String(val);
    if (tag === 'SELECT') {
      el.value = s;
      // A stored value the select does not list is still the record's value: show it.
      if (el.value !== s) { var opt = document.createElement('option'); opt.value = s; opt.textContent = s; el.appendChild(opt); el.value = s; }
      return true;
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      if (type === 'date') s = dateText(val);
      else if (type === 'datetime-local') s = localDateTimeText(val);
      if (s === '') return false;
      el.value = s;
      return true;
    }
    el.textContent = s;
    return true;
  }
  function setChecked(el, on) {
    if (!el) return;
    el.indeterminate = false;
    el.checked = !!on;
  }

  // A stored value that no option offers must not vanish: write it as text after the group.
  function addExtra(anchor, label, values) {
    if (!anchor || !anchor.parentNode || !values.length) return;
    var box = document.createElement('div');
    box.className = 'viewer-extra-value';
    box.style.cssText = 'font-size:12px;color:#374151;margin-top:4px;';
    box.textContent = label + ' (stored): ' + values.join(', ');
    anchor.parentNode.appendChild(box);
  }

  function radiosNamed(name) { return document.querySelectorAll('input[type="radio"][name="' + name + '"]'); }
  function setRadioGroup(name, val, label) {
    var radios = radiosNamed(name);
    if (!radios.length) return false;
    var s = String(val);
    var hit = null;
    radios.forEach(function (r) { if (r.value === s) hit = r; });
    if (hit) { radios.forEach(function (r) { r.checked = (r === hit); }); return true; }
    var last = radios[radios.length - 1];
    addExtra(last.closest('.radio-card') || last.parentNode, label || name, [s]);
    return true;
  }

  // ── The two readers ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  // The typed Listing columns that carry the same fact as a provider key. When a row finds nothing in its own bucket, the record may still
  // hold the value in one of these (a synced listing keeps its facts in typed columns and JSON buckets, not in the form's control keys).
  var TYPED_BY_RLS = {
    ListPrice: 'list_price', BedroomsTotal: 'bedrooms_total', BathroomsFull: 'bathrooms_full', BathroomsHalf: 'bathrooms_half', LivingArea: 'living_area',
    City: 'city', PostalCode: 'postal_code', CityRegion: 'borough', SubdivisionName: 'neighborhood', PropertyType: 'property_type', PropertySubType: 'property_sub_type',
    ExpirationDate: 'expiration_date', ListingContractDate: 'listing_contract_date',
  };
  function firstFilled() {
    for (var i = 0; i < arguments.length; i++) if (!isBlank(arguments[i]) && isPrimitive(arguments[i])) return arguments[i];
    return undefined;
  }
  function fieldValue(f, listing, raw, addr, features, agentInfo) {
    var val;
    if (f.src === 'listing' && f.listingKey) val = listing[f.listingKey];
    else if (f.src === 'agentInfo' && f.agentKey) val = (f.typedKey ? listing[f.typedKey] : null) || agentInfo[f.agentKey] || raw[f.rls];
    else if (f.src === 'addr') val = addr[f.rls] || raw[f.rls];
    else if (f.src === 'features') val = !isBlank(features[f.rls]) ? features[f.rls] : raw[f.rls];
    else val = raw[f.rls];
    if (isBlank(val) && f.fallbackRls) val = raw[f.fallbackRls];
    // Wherever else the record keeps that provider key, then its typed column.
    if (isBlank(val)) val = firstFilled(raw[f.rls], features[f.rls], addr[f.rls], agentInfo[f.rls]);
    if (isBlank(val) && f.fallbackRls) val = firstFilled(features[f.fallbackRls]);
    if (isBlank(val) && TYPED_BY_RLS[f.rls]) val = listing[TYPED_BY_RLS[f.rls]];
    return val;
  }

  function applyField(f, val, touched, raw) {
    var el = byId(f.form);
    if (!el) return;
    var type = (el.getAttribute('type') || '').toLowerCase();
    // A checkbox shows a yes / no whatever the table row says about it.
    if (type === 'checkbox') {
      setChecked(el, f.type === 'checked' ? val !== false : (val === true || val === 'true'));
      touched[f.form] = true;
      return;
    }
    // A yes / no that the form DERIVED from a select or radio (BasementYN from a Yes / No select, RentingAllowedYN from a sublet-policy
    // select) is a lossy summary of what the agent chose: the control's own saved value is restored by the control-keyed pass instead.
    if (f.type === 'bool' || f.type === 'checked') return;
    if (f.type === 'date') val = dateText(val);
    // The typed column holds a number ("6") where the select offers "6+": the saved control value is the more exact display of the same fact.
    var own = raw[f.form];
    if (el.tagName === 'SELECT' && typeof own === 'string' && own.replace(/\+$/, '') === String(val)) val = own;
    if (setValue(el, val)) touched[f.form] = true;
  }

  function applyRadios(radios, raw, touched) {
    radios.forEach(function (r) {
      var key = r.rawKey || r.rls;
      var val = raw[key];
      var viaFallback = false;
      if (isBlank(val) && r.fallback) { val = raw[r.fallback]; viaFallback = !isBlank(val); }
      if (isBlank(val)) return;
      // Legacy: older rows stored the non-live agreement value "CoExclusive"; live Cotality uses CoExclusiveAgency.
      if (/ListingType$/.test(r.name) && val === 'CoExclusive') val = 'CoExclusiveAgency';
      if (r.valueMap) {
        var mapped = r.valueMap[val] !== undefined ? r.valueMap[val] : r.valueMap[String(val)];
        if (mapped !== undefined) val = mapped;
      }
      if (!isPrimitive(val)) return;
      if (setRadioGroup(r.name, val, viaFallback ? r.fallback : key)) touched[r.name] = true;
    });
  }

  function applyArrays(arrays, raw, touched) {
    arrays.forEach(function (ca) {
      var vals = raw[ca.rls];
      if (!Array.isArray(vals) && ca.fallbackRls) vals = raw[ca.fallbackRls];
      if (!Array.isArray(vals)) return;
      var boxes = document.querySelectorAll('input[type="checkbox"][name="' + ca.name + '"]');
      if (!boxes.length) return;
      var shown = {};
      boxes.forEach(function (cb) { var on = vals.indexOf(cb.value) >= 0; setChecked(cb, on); if (on) shown[cb.value] = true; });
      var rest = vals.filter(function (v) { return isPrimitive(v) && !shown[String(v)]; }).map(String);
      addExtra(boxes[boxes.length - 1].closest('label') || boxes[boxes.length - 1].parentNode, ca.rls, rest);
      touched[ca.name] = true;
    });
  }

  // Building amenity checkboxes: the Sale form restores them from the canonical BuildingFeatures array plus its own internal label list;
  // the Rental form stores the visible labels.
  function applyBuildingFeatures(kind, raw) {
    var canonical = Array.isArray(raw.BuildingFeatures) ? raw.BuildingFeatures : [];
    var internal = Array.isArray(raw.saleBuildingFeaturesInternal) ? raw.saleBuildingFeaturesInternal : [];
    if (!canonical.length && !internal.length) return;
    var canonicalSet = {}; canonical.forEach(function (v) { canonicalSet[String(v)] = true; });
    var internalSet = {}; internal.forEach(function (v) { internalSet[String(v)] = true; });
    var inverse = {};
    Object.keys(BUILDING_FEATURES_LABEL_TO_CANONICAL).forEach(function (label) { inverse[label] = BUILDING_FEATURES_LABEL_TO_CANONICAL[label]; });
    var boxes = [];
    if (kind === 'sale') SALE_BUILDING_FEATURE_IDS.forEach(function (id) { var el = byId(id); if (el) boxes.push(el); });
    else document.querySelectorAll('#rentalBuildingModal input[data-rls-field="BuildingFeatures"]').forEach(function (el) { boxes.push(el); });
    boxes.forEach(function (el) {
      var label = el.parentElement ? el.parentElement.textContent.trim() : el.value;
      var canon = inverse[label];
      setChecked(el, !!((canon && canonicalSet[canon]) || internalSet[label] || canonicalSet[label] || canonicalSet[el.value]));
    });
  }

  // Sale: the six syndication destinations from SyndicateTo (verbatim from the form's restore).
  function applySyndication(raw, touched) {
    var targets = raw.SyndicateTo;
    if (Array.isArray(targets)) {
      var normalized = targets.map(function (t) { return String(t).toLowerCase(); });
      var internal = Array.isArray(raw._saleSyndicateInternal) ? raw._saleSyndicateInternal.map(function (t) { return String(t).toLowerCase(); }) : [];
      var matches = function (entry) {
        var canon = (entry.cotality || entry.target).toLowerCase();
        return normalized.indexOf(canon) >= 0 || normalized.indexOf(entry.target.toLowerCase()) >= 0 || internal.indexOf(entry.target.toLowerCase()) >= 0;
      };
      SALE_SYNDICATION_MAP.forEach(function (entry) { var el = byId(entry.id); if (el) { setChecked(el, matches(entry)); touched[entry.id] = true; } });
    }
    if (raw.SyndicateYN !== undefined && raw.SyndicateYN !== null) { var s = byId('saleSyndicateYN'); if (s) { setChecked(s, raw.SyndicateYN === true || raw.SyndicateYN === 'true'); touched.saleSyndicateYN = true; } }
    if (raw.saleDist_VOW !== undefined && raw.saleDist_VOW !== null) { var v = byId('saleDist_VOW'); if (v) { setChecked(v, raw.saleDist_VOW === true || raw.saleDist_VOW === 'true'); touched.saleDist_VOW = true; } }
  }

  // Control-keyed pass: the exact inverse of the forms' own collectors (key = field.id || field.name, radios write only when checked,
  // single checkboxes write true / false). Controls the tables already set are left alone. In 'edit' mode it covers the whole area the form's save sweeps
  // (its main container, the building modal and the media modal) and restores hidden controls too (the address atoms, the tenant-agent picker), except the
  // signed-in agent's identity, which the agent module owns.
  function passZones(cfg, edit) {
    if (!edit) return cfg.zones.map(byId);
    return [document.querySelector('.flex-1')].concat((cfg.editZones || []).map(byId));
  }
  function controlKeyedPass(cfg, raw, touched, edit) {
    passZones(cfg, edit).forEach(function (zone) {
      if (!zone) return;
      zone.querySelectorAll('input, select, textarea').forEach(function (el) {
        var type = (el.getAttribute('type') || '').toLowerCase();
        if (type === 'button' || type === 'submit' || type === 'reset' || type === 'file' || type === 'image') return;
        if (type === 'hidden' && !(edit && el.id && el.id.indexOf(cfg.prefix + 'UpdatingAgent') !== 0)) return;
        var key = el.id || el.name;
        if (!key) return;
        if (type === 'radio') {
          if (touched[el.name] || touched[key]) return;
          var stored = raw[key];
          if (isBlank(stored) || !isPrimitive(stored)) return;
          if (String(stored) === el.value) el.checked = true;
          return;
        }
        if (touched[key] || (el.name && touched[el.name])) return;
        if (type === 'checkbox') {
          if (!el.id) return;                       // a group member: groups are arrays, handled by the tables
          var on = raw[el.id];
          if (on === true || on === 'true') setChecked(el, true);
          else if (on === false || on === 'false') setChecked(el, false);
          return;
        }
        var val = raw[key];
        if (isBlank(val) || !isPrimitive(val)) return;
        setValue(el, val);
      });
    });
  }

  // Rental deal fees: a dynamic table (fee type, description, cost) that the form saves as a list under rentalDealFees. The saved rows replace the table's rows,
  // built from a copy of its first row (so the markup, the options and the delete button are the page's own); a list with nothing in it leaves the table as it is.
  // A viewer has no use for the delete button, so a viewer's rows lose it.
  function applyDealFees(raw, edit) {
    var body = byId('rentalFeesTableBody');
    var fees = raw.rentalDealFees;
    if (!body || !Array.isArray(fees) || !fees.length) return;
    var model = body.querySelector('tr');
    if (!model) return;
    var rows = fees.filter(isObject).map(function (fee) {
      var tr = model.cloneNode(true);
      var type = tr.querySelector('select');
      var description = tr.querySelector('input[type="text"]');
      var cost = tr.querySelector('input[type="number"]');
      if (type) setValue(type, fee.type);
      if (description) description.value = isBlank(fee.description) ? '' : String(fee.description);
      if (cost) cost.value = isBlank(fee.cost) ? '' : String(fee.cost);
      if (!edit) tr.querySelectorAll('button').forEach(function (b) { b.classList.add('viewer-hidden'); });
      return tr;
    });
    while (body.firstChild) body.removeChild(body.firstChild);
    rows.forEach(function (tr) { body.appendChild(tr); });
  }

  // ── Classification (Mallan's own property-type radio) from independent raw provider dimensions ──────────────────────────────────
  function classifyRental(raw, listing) {
    var byOwnership = { Condominium: 'Condo', StockCooperative: 'Coop', Condop: 'Condop', RentalBuilding: 'RentalBuilding' };
    if (byOwnership[raw.CommonInterest]) return byOwnership[raw.CommonInterest];
    var bySubType = { SingleFamilyResidence: 'SingleFamily', MultiFamily: 'MultiFamily', MixedUse: 'MixedUse', Loft: 'Loft', Duplex: 'Duplex', Triplex: 'Triplex', Office: 'Office', Retail: 'Retail' };
    return bySubType[raw.PropertySubType || listing.property_sub_type] || '';
  }
  function classifySale(raw, listing) {
    var byOwnership = { Condominium: 'Condo', StockCooperative: 'Coop', Condop: 'Condop' };
    if (byOwnership[raw.CommonInterest]) return byOwnership[raw.CommonInterest];
    // Only unambiguous provider sub-types: never PropertyType, never a guess between ownership kinds.
    var bySubType = {
      SingleFamilyTownhouse: 'SingleFamilyTownhouse', MultiFamilyTownhouse: 'MultiFamilyTownhouse', SingleFamilyResidence: 'SingleFamily', MultiFamily: 'MultiFamily',
      MixedUse: 'MixedUse', Loft: 'Loft', Duplex: 'Duplex', Triplex: 'Triplex', Quadruplex: 'Quadruplex', Office: 'Office', Retail: 'Retail',
      UnimprovedLand: 'Land', DeededParking: 'DeededParking',
    };
    return bySubType[raw.PropertySubType || listing.property_sub_type] || '';
  }

  // ── Street line, agent panel, co-listing ───────────────────────────────────────────────────────────────────────────────────────
  // Composed as the forms restore it: StreetNumber, StreetDirPrefix, StreetName, StreetSuffix, so "333 E 46th St" never collapses to
  // "333 46th St". UnparsedAddress is used only when no component exists.
  function streetLine(addr, raw) {
    var unparsed = addr.UnparsedAddress || raw.UnParsedAddress || raw.UnparsedAddress || '';
    var parts = [addr.StreetNumber || raw.StreetNumber, addr.StreetDirPrefix || raw.StreetDirPrefix, addr.StreetName || raw.StreetName, addr.StreetSuffix || raw.StreetSuffix].filter(Boolean);
    return parts.length ? parts.join(' ') : unparsed;
  }

  function text(id, val) { var el = byId(id); if (el) el.textContent = isBlank(val) ? '--' : String(val); }

  function applyAgentPanel(prefix, listing, raw, agentInfo) {
    var pick = function (typed, key) { return listing[typed] || agentInfo[key] || raw[key] || ''; };
    var panel = byId(prefix + 'ListingAgentInfo');
    var name = pick('list_agent_full_name', 'ListAgentFullName');
    var company = pick('list_office_name', 'ListOfficeName');
    var search = byId(prefix + 'ListingAgentSearch'); if (search) search.value = name;
    var companySearch = byId(prefix + 'ListingCompanySearch'); if (companySearch) companySearch.value = company;
    if (panel) {
      panel.style.display = '';
      text(prefix + 'ListingAgentId', pick('list_agent_mls_id', 'ListAgentMlsId'));
      text(prefix + 'ListingAgentPhone', pick('list_agent_direct_phone', 'ListAgentDirectPhone'));
      text(prefix + 'ListingAgentEmail', pick('list_agent_email', 'ListAgentEmail'));
      text(prefix + 'ListingAgentLicense', '');
    }
  }

  // Co-listing agents (CoListAgent, CoListAgent2, CoListAgent3) and offices (CoListOffice, CoListOffice2) stay apart from the primary
  // ListAgent* / ListOffice*. Cotality does not pair an agent with an office, so the two are shown as two lists; an office is compared
  // with the primary listing office by its MLS id only: same office, different office, or unknown.
  function coListRows(listing, raw) {
    var agents = [];
    ['', '2', '3'].forEach(function (n) {
      var mls = raw['CoListAgent' + n + 'MlsId'] || (n === '' ? listing.co_list_agent_mls_id : '') || '';
      var name = raw['CoListAgent' + n + 'FullName'] || '';
      if (mls || name) agents.push({ name: String(name), mlsId: String(mls) });
    });
    var primaryOffice = String(raw.ListOfficeMlsId || listing.list_office_mls_id || '');
    var offices = [];
    ['', '2'].forEach(function (n) {
      var mls = raw['CoListOffice' + n + 'MlsId'] || (n === '' ? listing.co_list_office_mls_id : '') || '';
      var name = raw['CoListOffice' + n + 'Name'] || '';
      if (!mls && !name) return;
      var relation = !mls || !primaryOffice ? 'unknown' : (String(mls) === primaryOffice ? 'same office' : 'different office');
      offices.push({ name: String(name), mlsId: String(mls), relation: relation });
    });
    return { agents: agents, offices: offices };
  }
  function renderCoList(containerId, listing, raw) {
    var box = byId(containerId);
    if (!box) return;
    var rows = coListRows(listing, raw);
    box.textContent = '';
    if (!rows.agents.length && !rows.offices.length) {
      var none = document.createElement('p');
      none.className = 'text-sm text-gray-500 italic';
      none.textContent = 'No co-listing agents on this listing.';
      box.appendChild(none);
      return;
    }
    var line = function (label, main, detail) {
      var p = document.createElement('p');
      p.className = 'text-sm text-gray-800';
      var b = document.createElement('span');
      b.className = 'font-semibold';
      b.textContent = label + ': ';
      p.appendChild(b);
      p.appendChild(document.createTextNode(main + (detail ? ' (' + detail + ')' : '')));
      box.appendChild(p);
    };
    rows.agents.forEach(function (a, i) { line('Co-listing agent ' + (i + 1), a.name || 'Unnamed', a.mlsId ? 'MLS ID ' + a.mlsId : ''); });
    rows.offices.forEach(function (o, i) { line('Co-listing office ' + (i + 1), o.name || 'Unnamed', [o.mlsId ? 'MLS ID ' + o.mlsId : '', o.relation].filter(Boolean).join(', ')); });
  }

  // ── Stored values this viewer has no control for ───────────────────────────────────────────────────────────────────────────────
  // The forms and this page have drifted before (a field the Add form collects that the viewer never had a control for). A stored value must
  // not vanish with its control, so every table row whose control is not on the page, and that the record has a value for, is listed here by
  // its provider key. The street atoms (shown as the street line) and the agent identity (shown in the agent panel) are not listed.
  var SHOWN_ELSEWHERE = { StreetNumber: 1, StreetDirPrefix: 1, StreetName: 1, StreetSuffix: 1, UnparsedAddress: 1, UnParsedAddress: 1 };
  // A distribution flag that the page has turned into a badge still has its place (the badge says which flag it stands for).
  function hasControl(key) { return !!byId(key) || document.getElementsByName(key).length > 0 || !!document.querySelector('[data-for="' + key + '"]'); }
  function unplacedRows(cfg, listing, raw, addr, features, agentInfo) {
    var rows = [];
    cfg.fields.forEach(function (f) {
      if (f.src === 'agentInfo' || SHOWN_ELSEWHERE[f.rls] || hasControl(f.form)) return;
      var val = fieldValue(f, listing, raw, addr, features, agentInfo);
      if (isBlank(val) || !isPrimitive(val)) return;
      rows.push([f.rls, String(val)]);
    });
    cfg.radios.forEach(function (r) {
      if (hasControl(r.name)) return;
      var val = raw[r.rawKey || r.rls];
      var label = r.rawKey || r.rls;
      if (isBlank(val) && r.fallback) { val = raw[r.fallback]; label = r.fallback; }
      if (isBlank(val) || !isPrimitive(val)) return;
      rows.push([label, String(val)]);
    });
    cfg.arrays.forEach(function (ca) {
      if (hasControl(ca.name)) return;
      var vals = raw[ca.rls];
      if (!Array.isArray(vals) && ca.fallbackRls) vals = raw[ca.fallbackRls];
      if (!Array.isArray(vals)) return;
      var shown = vals.filter(isPrimitive).map(String);
      if (shown.length) rows.push([ca.rls, shown.join(', ')]);
    });
    return rows;
  }
  function renderUnplaced(cfg, listing, raw, addr, features, agentInfo) {
    var old = byId('viewerStoredElsewhere');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var rows = unplacedRows(cfg, listing, raw, addr, features, agentInfo);
    var host = byId(cfg.prefix + 'MainTab1');
    if (!rows.length || !host) return rows;
    var card = document.createElement('div');
    card.id = 'viewerStoredElsewhere';
    card.className = 'form-card';
    var head = document.createElement('div');
    head.className = 'form-card-header';
    head.textContent = 'Other stored fields (no control for them on this viewer)';
    card.appendChild(head);
    rows.forEach(function (row) {
      var p = document.createElement('p');
      p.className = 'text-sm text-gray-800';
      var k = document.createElement('span');
      k.className = 'font-semibold';
      k.textContent = row[0] + ': ';
      p.appendChild(k);
      p.appendChild(document.createTextNode(row[1]));
      card.appendChild(p);
    });
    host.appendChild(card);
    return rows;
  }

  // ── Entry point ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  // opts.mode: 'view' (default) or 'edit' (see the header). Safe to run again: it drops what a previous run added.
  function hydrate(kind, listing, opts) {
    var cfg = CONFIG[kind];
    if (!cfg) throw new Error('MallanListingHydration: unknown kind ' + kind);
    var edit = !!(opts && opts.mode === 'edit');
    listing = asObject(listing);
    var raw = asObject(listing.raw_data);
    var addr = asObject(listing.address);
    var features = asObject(listing.features);
    var agentInfo = asObject(listing.agent_info);
    var touched = {};
    document.querySelectorAll('.viewer-extra-value').forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); });

    cfg.fields.forEach(function (f) {
      var val = fieldValue(f, listing, raw, addr, features, agentInfo);
      if (isBlank(val) || !isPrimitive(val)) return;
      applyField(f, val, touched, raw);
    });
    applyRadios(cfg.radios, raw, touched);
    applyArrays(cfg.arrays, raw, touched);
    if (kind === 'sale') applySyndication(raw, touched);
    applyBuildingFeatures(kind, raw);
    if (kind === 'rental') applyDealFees(raw, edit);

    if (!edit) {
      // Ownership (the exact provider reference) and Mallan's own classification, from independent raw dimensions.
      var own = byId(cfg.prefix + 'CommonInterest');
      if (own && !isBlank(raw.CommonInterest)) { setValue(own, raw.CommonInterest); touched[cfg.prefix + 'CommonInterest'] = true; }
      var classRadio = cfg.prefix + 'PropertyType';
      var checkedType = document.querySelector('input[type="radio"][name="' + classRadio + '"]:checked');
      if (!checkedType) {
        var guess = kind === 'sale' ? classifySale(raw, listing) : classifyRental(raw, listing);
        if (guess) { setRadioGroup(classRadio, guess, 'PropertyType'); touched[classRadio] = true; }
      }
    }

    controlKeyedPass(cfg, raw, touched, edit);

    var street = byId(cfg.prefix + 'StreetAddress');
    var line = streetLine(addr, raw);
    if (street && line) street.value = line;
    var hood = byId(cfg.prefix === 'sale' ? 'saleBldgNeighborhood' : 'rentalNeighborhood');
    var area = !isBlank(listing.neighborhood) ? listing.neighborhood : raw.MLSAreaMajor;   // MLSAreaMajor: the provider's area when no neighborhood column is filled
    if (hood && (hood.selectedIndex < 0 || hood.value === '') && isPrimitive(area) && !isBlank(area)) setValue(hood, area);

    if (!edit) {
      applyAgentPanel(cfg.prefix, listing, raw, agentInfo);
      renderCoList(cfg.prefix === 'sale' ? 'saleCoListAgentsContainer' : 'rentalCoListAgents', listing, raw);
      renderUnplaced(cfg, listing, raw, addr, features, agentInfo);
    }
  }

  global.MallanListingHydration = {
    hydrate: hydrate,
    coListRows: coListRows,
    streetLine: function (listing) { listing = asObject(listing); return streetLine(asObject(listing.address), asObject(listing.raw_data)); },
    tables: {
      sale: {
        FIELD_MAP: SALE_FIELD_MAP, CHECKBOX_ARRAY_MAP: SALE_CHECKBOX_ARRAY_MAP, RADIO_MAP: SALE_RADIO_MAP,
        BUILDING_FEATURES_LABEL_TO_CANONICAL: BUILDING_FEATURES_LABEL_TO_CANONICAL, BUILDING_FEATURE_IDS: SALE_BUILDING_FEATURE_IDS, SYNDICATION_MAP: SALE_SYNDICATION_MAP,
      },
      rental: { FIELD_MAP: RENTAL_FIELD_MAP, CHECKBOX_ARRAY_MAP: RENTAL_CHECKBOX_ARRAY_MAP, RADIO_MAP: RENTAL_RADIO_MAP },
    },
  };
})(window);
