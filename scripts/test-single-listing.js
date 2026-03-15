const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(function(l) {
  var idx = l.indexOf('=');
  if (idx > 0) {
    var k = l.substring(0, idx).trim();
    var v = l.substring(idx + 1).trim().replace(/^"|"$/g, '');
    process.env[k] = v;
  }
});

(async () => {
  var r = await fetch('https://api.cotality.com/trestle/oidc/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&client_id=' + process.env.IDX_CLIENT_ID + '&client_secret=' + process.env.IDX_CLIENT_SECRET + '&scope=api'
  });
  var t = await r.json();
  if (t.error || !t.access_token) { console.log('Auth failed:', JSON.stringify(t)); return; }
  console.log('Token OK');

  var listingId = process.argv[2] || 'RLS20071059';

  // Test 1: minimal fields
  console.log('\n=== Test 1: Minimal fields ===');
  var url1 = 'https://api.cotality.com/trestle/odata/Property?$filter=ListingId eq \'' + listingId + '\'&$select=ListingId,StandardStatus,ListPrice,StreetName,City&$top=1';
  var r1 = await fetch(url1, { headers: { Authorization: 'Bearer ' + t.access_token } });
  console.log('HTTP:', r1.status);
  if (r1.ok) {
    var d1 = await r1.json();
    console.log('Found:', d1.value ? d1.value.length : 0, 'listings');
    if (d1.value && d1.value[0]) console.log(JSON.stringify(d1.value[0], null, 2));
  } else {
    var err1 = await r1.text();
    console.log('Error:', err1.substring(0, 300));
  }

  // Test 2: full IDX_PLUS_SELECT_FIELDS (from production code)
  // Read them from the tsx output
  console.log('\n=== Test 2: Full select fields (first 50) ===');
  var fields50 = 'StreetNumber,StreetName,StreetDirPrefix,StreetDirSuffix,StreetSuffix,UnitNumber,City,CityRegion,PostalCity,PostalCode,StateOrProvince,CountyOrParish,Country,CrossStreet,Directions,Latitude,Longitude,MapCoordinate,ListingId,SourceSystemKey,PropertyType,PropertySubType,CommonInterest,OwnershipType,StructureType,NewConstructionYN,DevelopmentStatus,NumberOfUnitsTotal,NumberOfUnitsVacant,NumberOfUnitsLeased,NumberOfBuildings,StoriesTotal,NumberOfSeparateElectricMeters,NumberOfSeparateGasMeters,NumberOfSeparateWaterMeters,ListingAgreement,ListingContractDate,ExpirationDate,OriginalEntryTimestamp,ListingService,MlsStatus,InternetEntireListingDisplayYN,InternetAddressDisplayYN,SyndicationRemarks,StandardStatus,ModificationTimestamp,StatusChangeTimestamp,ActivationDate,OnMarketDate,OffMarketDate';
  var url2 = 'https://api.cotality.com/trestle/odata/Property?$filter=ListingId eq \'' + listingId + '\'&$select=' + fields50 + '&$top=1';
  var r2 = await fetch(url2, { headers: { Authorization: 'Bearer ' + t.access_token } });
  console.log('HTTP:', r2.status);
  if (!r2.ok) {
    var err2 = await r2.text();
    console.log('Error:', err2.substring(0, 500));
  } else {
    var d2 = await r2.json();
    console.log('Found:', d2.value ? d2.value.length : 0);
  }

  // Test 3: ALL fields from IDX_PLUS_SELECT_FIELDS
  console.log('\n=== Test 3: ALL IDX_PLUS_SELECT_FIELDS ===');
  var allFields = 'StreetNumber,StreetName,StreetDirPrefix,StreetDirSuffix,StreetSuffix,UnitNumber,City,CityRegion,PostalCity,PostalCode,StateOrProvince,CountyOrParish,Country,CrossStreet,Directions,Latitude,Longitude,MapCoordinate,ListingId,SourceSystemKey,PropertyType,PropertySubType,CommonInterest,OwnershipType,StructureType,NewConstructionYN,DevelopmentStatus,NumberOfUnitsTotal,NumberOfUnitsVacant,NumberOfUnitsLeased,NumberOfBuildings,StoriesTotal,NumberOfSeparateElectricMeters,NumberOfSeparateGasMeters,NumberOfSeparateWaterMeters,ListingAgreement,ListingContractDate,ExpirationDate,OriginalEntryTimestamp,ListingService,MlsStatus,InternetEntireListingDisplayYN,InternetAddressDisplayYN,SyndicationRemarks,StandardStatus,ModificationTimestamp,StatusChangeTimestamp,ActivationDate,OnMarketDate,OffMarketDate,OffMarketTimestamp,BackOnMarketDate,BackOnMarketTimestamp,ContractStatusChangeDate,PurchaseContractDate,CloseDate,ClosePrice,WithdrawnDate,DaysOnMarket,CumulativeDaysOnMarket,PendingTimestamp,ContingentDate,AvailabilityDate,OriginalListPrice,PreviousListPrice,ListPriceLow,ListPrice,SpecialListingConditions,Concessions,ConcessionsAmount,ConcessionsComments,LeaseAmount,LeaseAmountFrequency,SyndicateTo,PublicRemarks,PrivateRemarks,ShowingInstructions,ListingTerms,Disclaimer,CopyrightNotice,PropertyCondition,ListAgentMlsId,ListAgentKey,ListAgentFirstName,ListAgentLastName,ListAgentFullName,ListAgentEmail,ListAgentDirectPhone,ListAgentOfficePhone,ListAgentURL,ListOfficeMlsId,ListOfficeKey,ListOfficeName,ListOfficePhone,ListOfficeURL,ListOfficeEmail,ListTeamKey,ListTeamName,CoListAgentMlsId,CoListAgentKey,CoListAgentFirstName,CoListAgentLastName,CoListAgentFullName,CoListAgentEmail,CoListAgentDirectPhone,CoListAgentURL,CoListOfficeMlsId,CoListOfficeKey,CoListOfficeName,CoListOfficePhone,CoListAgent2Key,CoListAgent2FirstName,CoListAgent2LastName,CoListAgent2FullName,CoListAgent3Key,CoListAgent3FirstName,CoListAgent3LastName,CoListAgent3FullName,BuyerAgentMlsId,BuyerAgentKey,BuyerAgentFirstName,BuyerAgentLastName,BuyerAgentFullName,BuyerAgentEmail,BuyerAgentDirectPhone,BuyerAgentURL,BuyerOfficeMlsId,BuyerOfficeKey,BuyerOfficeName,BuyerOfficePhone,BuyerOfficeURL,BuyerTeamKey,BuyerTeamName,BuyerAgentOfficePhone,BuyerOfficeEmail,CoBuyerAgentMlsId,CoBuyerAgentKey,CoBuyerAgentFirstName,CoBuyerAgentLastName,CoBuyerAgentFullName,CoBuyerAgentEmail,CoBuyerAgentDirectPhone,CoBuyerAgentURL,CoBuyerOfficeMlsId,CoBuyerOfficeKey,CoBuyerOfficeName,CoBuyerOfficePhone,BedroomsTotal,BathroomsFull,BathroomsHalf,BathroomsOneQuarter,BathroomsThreeQuarter,BathroomsPartial,BathroomsTotalInteger,LivingArea,LivingAreaUnits,LivingAreaSource,AboveGradeFinishedArea,AboveGradeFinishedAreaSource,AboveGradeFinishedAreaUnits,BelowGradeFinishedArea,BelowGradeFinishedAreaSource,BelowGradeFinishedAreaUnits,BuildingAreaTotal,BuildingAreaSource,RoomsTotal,BuildingName,BuilderName,YearBuilt,YearBuiltSource,YearBuiltDetails,ArchitecturalStyle,ConstructionMaterials,Roof,Heating,Cooling,ElectricOnPropertyYN,Sewer,WaterSource,OtherStructures,BuildingFeatures,AssociationAmenities,CommunityFeatures,SecurityFeatures,AccessibilityFeatures,PoolPrivateYN,PoolFeatures,SpaYN,SpaFeatures,LaundryFeatures,WalkScore,CommonWalls,AssociationFee,AssociationFeeFrequency,AssociationFee2,AssociationFee2Frequency,AssociationFeeIncludes,AssociationName,AssociationYN,TaxAnnualAmount,TaxYear,TaxBlock,TaxLot,TaxMapNumber,GrossIncome,GrossScheduledIncome,NetOperatingIncome,OperatingExpense,OperatingExpenseIncludes,IncomeIncludes,CapRate,ElectricExpense,FuelExpense,GardenerExpense,InsuranceExpense,MaintenanceExpense,ManagerExpense,NewTaxesExpense,OtherExpense,PestControlExpense,ProfessionalManagementExpense,SuppliesExpense,TrashExpense,VacancyAllowance,WaterSewerExpense,WorkmansCompensationExpense,LotSizeArea,LotSizeUnits,LotSizeSource,LotSizeDimensions,LotDimensionsSource,LotFeatures,FrontageLength,FrontageType,RoadSurfaceType,RoadFrontageType,Topography,Vegetation,WaterfrontFeatures,InteriorFeatures,ExteriorFeatures,Flooring,WindowFeatures,FireplaceYN,FireplaceFeatures,FireplacesTotal,Appliances,PatioAndPorchFeatures,Fencing,View,ViewYN,Furnished,ParkingFeatures,ParkingTotal,GarageSpaces,GarageYN,AttachedGarageYN,CarportSpaces,CarportYN,OpenParkingSpaces,PetsAllowed,ShowingContactName,ShowingContactPhone,ShowingContactPhoneExt,ShowingContactType,ShowingRequirements,LockBoxType,LockBoxLocation,BuilderModel,GreenBuildingVerificationType,GreenEnergyEfficient,GreenEnergyGeneration,GreenWaterConservation,GreenIndoorAirQuality,GreenSustainability,PowerProductionType,PhotosCount,PhotosChangeTimestamp,VideosCount,VirtualTourURLBranded,VirtualTourURLUnbranded,DocumentsAvailable,DocumentsCount,DocumentsChangeTimestamp,MapURL,LeaseTerm,PetDeposit,SecurityDeposit,TenantPays,MoveInCosts,MoveInCostsComments,MoveInCostsAmountTotal,OngoingFees,TenantPaysDescription,OriginatingSystemID,OriginatingSystemName,OriginatingSystemKey,SourceSystemName,ListingKeyNumeric,MajorChangeType,MajorChangeTimestamp,PreviousStandardStatus,WaterfrontYN';
  var url3 = 'https://api.cotality.com/trestle/odata/Property?$filter=ListingId eq \'' + listingId + '\'&$select=' + allFields + '&$top=1';
  var r3 = await fetch(url3, { headers: { Authorization: 'Bearer ' + t.access_token } });
  console.log('HTTP:', r3.status);
  if (!r3.ok) {
    var err3 = await r3.text();
    // Extract just the problematic field from the error
    var match = err3.match(/property named '([^']+)'/);
    if (match) console.log('BAD FIELD:', match[1]);
    else console.log('Error:', err3.substring(0, 500));
  } else {
    var d3 = await r3.json();
    console.log('Found:', d3.value ? d3.value.length : 0, 'listings');
  }
})();
