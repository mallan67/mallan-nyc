# Trestle / Cotality — Complete Field Catalog

**Source:** `artifacts/metadata.xml` — Trestle OData $metadata endpoint
**Verified:** 2026-03-20 against live Trestle API `api.cotality.com/trestle`
**License:** IDX Plus - WebAPI for Mallan Real Estate Inc (Trestle-11371-20)
**Total:** 1,363 fields across 12 data resources + 5 system entities

> This is the authoritative reference for every field available on the Trestle API.
> If someone modifies field names, mappings, or removes fields — check against this catalog.
> See also: `data/RLS-FIELD-REGISTRY.md` for compliance rules and distribution gates.

---

## Summary

| Resource | Fields | IDX Plus? | Access Pattern |
|----------|--------|-----------|----------------|
| Property | 745 | YES (527 in spec) | Direct query |
| CustomProperty | 140 | YES (106 in spec) | `$expand=CustomProperty` |
| Member | 90 | YES (72 in spec) | `$expand=ListAgent` etc. |
| Office | 79 | YES (66 in spec) | `$expand=ListOffice` etc. |
| Media | 55 | YES (46 in spec) | `$expand=Media` |
| PropertyUnitTypes | 52 | YES (46 in spec) | `$expand=UnitTypes` |
| Teams | 48 | Beyond spec | `/odata/Teams` |
| OpenHouse | 47 | YES (39 in spec) | `$expand=OpenHouse` |
| PropertyRooms | 39 | Beyond spec | `$expand=Rooms` |
| PropertyGreenVerification | 39 | Beyond spec | Navigation from Property |
| TeamMembers | 29 | Beyond spec | `/odata/TeamMembers` |
| Building | 0 | Beyond spec | `$expand=Building` (empty shell) |
| **TOTAL** | **1,363** | | |

### System Entities (metadata/admin)

| Resource | Fields | Purpose |
|----------|--------|---------|
| Field | 16 | Field definitions catalog |
| Lookup | 14 | Picklist value catalog |
| Model | 8 | Resource model definitions |
| DataSystem | 6 | System metadata |
| Enumeration | 7 | Enum value definitions |

---

## Type Legend

| Type in Catalog | OData Type | Description |
|-----------------|------------|-------------|
| String | `Edm.String` | Text field (MaxLength varies) |
| Boolean | `Edm.Boolean` | True/False |
| Int32 | `Edm.Int32` | 32-bit integer |
| Int64 | `Edm.Int64` | 64-bit integer |
| Decimal | `Edm.Decimal` | Decimal number (Precision/Scale varies) |
| Date | `Edm.Date` | Date only (no time) |
| DateTime | `Edm.DateTimeOffset` | Date + time with timezone |
| Enum | `Cotality.DataStandard.RESO.DD.Enums.XXX` | Single-value picklist |
| Multi-Enum | `Cotality.DataStandard.RESO.DD.Enums.Multi.XXX` | Multi-value picklist (comma-separated) |

**Nullable:** In OData CSDL, all properties default to `Nullable=true` unless explicitly set to `false`. Only primary key fields have `Nullable=false`.

---

## Property (745 fields)

| Field Name | Type | Nullable |
|------------|------|----------|
| AboveGradeFinishedArea | Decimal | true |
| AboveGradeFinishedAreaSource | Enum | true |
| AboveGradeFinishedAreaUnits | Enum | true |
| AboveGradeUnfinishedArea | Decimal | true |
| AboveGradeUnfinishedAreaSource | Enum | true |
| AboveGradeUnfinishedAreaUnits | Enum | true |
| AccessCode | String | true |
| AccessibilityFeatures | Multi-Enum | true |
| ActivationDate | Date | true |
| AdditionalParcelsDescription | String | true |
| AdditionalParcelsYN | Boolean | true |
| AnchorsCoTenants | String | true |
| Appliances | Multi-Enum | true |
| ArchitecturalStyle | Multi-Enum | true |
| AssociationAmenities | Multi-Enum | true |
| AssociationFee | Decimal | true |
| AssociationFee2 | Decimal | true |
| AssociationFee2Frequency | Enum | true |
| AssociationFee3 | Decimal | true |
| AssociationFee3Frequency | Enum | true |
| AssociationFeeFrequency | Enum | true |
| AssociationFeeIncludes | Multi-Enum | true |
| AssociationName | String | true |
| AssociationName2 | String | true |
| AssociationName3 | String | true |
| AssociationPhone | String | true |
| AssociationPhone2 | String | true |
| AssociationPhone3 | String | true |
| AssociationYN | Boolean | true |
| AttachedGarageYN | Boolean | true |
| AttributionContact | String | true |
| AvailabilityDate | Date | true |
| AvailableLeaseType | Multi-Enum | true |
| BackOnMarketDate | Date | true |
| BackOnMarketTimestamp | DateTime | true |
| Basement | Multi-Enum | true |
| BasementYN | Boolean | true |
| BathroomsFull | Int32 | true |
| BathroomsHalf | Int32 | true |
| BathroomsOneQuarter | Int32 | true |
| BathroomsPartial | Int32 | true |
| BathroomsThreeQuarter | Int32 | true |
| BathroomsTotalInteger | Int32 | true |
| BedroomsPossible | Int32 | true |
| BedroomsTotal | Int32 | true |
| BelowGradeFinishedArea | Decimal | true |
| BelowGradeFinishedAreaSource | Enum | true |
| BelowGradeFinishedAreaUnits | Enum | true |
| BelowGradeUnfinishedArea | Decimal | true |
| BelowGradeUnfinishedAreaSource | Enum | true |
| BelowGradeUnfinishedAreaUnits | Enum | true |
| BodyType | Multi-Enum | true |
| BuilderModel | String | true |
| BuilderName | String | true |
| BuildingAreaSource | Enum | true |
| BuildingAreaTotal | Decimal | true |
| BuildingAreaUnits | Enum | true |
| BuildingFeatures | Multi-Enum | true |
| BuildingKeyNumeric | Int64 | true |
| BuildingName | String | true |
| BusinessName | String | true |
| BusinessType | Multi-Enum | true |
| BuyerAgentAOR | Enum | true |
| BuyerAgentDesignation | Multi-Enum | true |
| BuyerAgentDirectPhone | String | true |
| BuyerAgentEmail | String | true |
| BuyerAgentFax | String | true |
| BuyerAgentFirstName | String | true |
| BuyerAgentFullName | String | true |
| BuyerAgentHomePhone | String | true |
| BuyerAgentKey | String | true |
| BuyerAgentKeyNumeric | Int64 | true |
| BuyerAgentLastName | String | true |
| BuyerAgentMiddleName | String | true |
| BuyerAgentMlsId | String | true |
| BuyerAgentMobilePhone | String | true |
| BuyerAgentNamePrefix | String | true |
| BuyerAgentNameSuffix | String | true |
| BuyerAgentNationalAssociationId | String | true |
| BuyerAgentOfficePhone | String | true |
| BuyerAgentOfficePhoneExt | String | true |
| BuyerAgentPager | String | true |
| BuyerAgentPreferredPhone | String | true |
| BuyerAgentPreferredPhoneExt | String | true |
| BuyerAgentStateLicense | String | true |
| BuyerAgentTollFreePhone | String | true |
| BuyerAgentURL | String | true |
| BuyerAgentVoiceMail | String | true |
| BuyerAgentVoiceMailExt | String | true |
| BuyerBrokerageCompensation | String | true |
| BuyerBrokerageCompensationType | Enum | true |
| BuyerFinancing | Multi-Enum | true |
| BuyerOfficeAOR | Enum | true |
| BuyerOfficeEmail | String | true |
| BuyerOfficeFax | String | true |
| BuyerOfficeKey | String | true |
| BuyerOfficeKeyNumeric | Int64 | true |
| BuyerOfficeMlsId | String | true |
| BuyerOfficeName | String | true |
| BuyerOfficeNationalAssociationId | String | true |
| BuyerOfficePhone | String | true |
| BuyerOfficePhoneExt | String | true |
| BuyerOfficeURL | String | true |
| BuyerTeamKey | String | true |
| BuyerTeamKeyNumeric | Int64 | true |
| BuyerTeamName | String | true |
| CableTvExpense | Decimal | true |
| CancellationDate | Date | true |
| CapRate | Decimal | true |
| CarportSpaces | Decimal | true |
| CarportYN | Boolean | true |
| CarrierRoute | String | true |
| City | String | true |
| CityRegion | String | true |
| CLIP | Int64 | true |
| CloseDate | Date | true |
| ClosePrice | Decimal | true |
| CoBuyerAgentAOR | Enum | true |
| CoBuyerAgentDesignation | Multi-Enum | true |
| CoBuyerAgentDirectPhone | String | true |
| CoBuyerAgentEmail | String | true |
| CoBuyerAgentFax | String | true |
| CoBuyerAgentFirstName | String | true |
| CoBuyerAgentFullName | String | true |
| CoBuyerAgentHomePhone | String | true |
| CoBuyerAgentKey | String | true |
| CoBuyerAgentKeyNumeric | Int64 | true |
| CoBuyerAgentLastName | String | true |
| CoBuyerAgentMiddleName | String | true |
| CoBuyerAgentMlsId | String | true |
| CoBuyerAgentMobilePhone | String | true |
| CoBuyerAgentNamePrefix | String | true |
| CoBuyerAgentNameSuffix | String | true |
| CoBuyerAgentNationalAssociationId | String | true |
| CoBuyerAgentOfficePhone | String | true |
| CoBuyerAgentOfficePhoneExt | String | true |
| CoBuyerAgentPager | String | true |
| CoBuyerAgentPreferredPhone | String | true |
| CoBuyerAgentPreferredPhoneExt | String | true |
| CoBuyerAgentStateLicense | String | true |
| CoBuyerAgentTollFreePhone | String | true |
| CoBuyerAgentURL | String | true |
| CoBuyerAgentVoiceMail | String | true |
| CoBuyerAgentVoiceMailExt | String | true |
| CoBuyerOfficeAOR | Enum | true |
| CoBuyerOfficeEmail | String | true |
| CoBuyerOfficeFax | String | true |
| CoBuyerOfficeKey | String | true |
| CoBuyerOfficeKeyNumeric | Int64 | true |
| CoBuyerOfficeMlsId | String | true |
| CoBuyerOfficeName | String | true |
| CoBuyerOfficeNationalAssociationId | String | true |
| CoBuyerOfficePhone | String | true |
| CoBuyerOfficePhoneExt | String | true |
| CoBuyerOfficeURL | String | true |
| CoListAgent2AOR | Enum | true |
| CoListAgent2DirectPhone | String | true |
| CoListAgent2Email | String | true |
| CoListAgent2FirstName | String | true |
| CoListAgent2FullName | String | true |
| CoListAgent2HomePhone | String | true |
| CoListAgent2Key | String | true |
| CoListAgent2LastName | String | true |
| CoListAgent2MiddleName | String | true |
| CoListAgent2MlsId | String | true |
| CoListAgent2MobilePhone | String | true |
| CoListAgent2NationalAssociationId | String | true |
| CoListAgent2Nickname | String | true |
| CoListAgent2OfficePhone | String | true |
| CoListAgent2PreferredPhone | String | true |
| CoListAgent2StateLicense | String | true |
| CoListAgent2URL | String | true |
| CoListAgent3AOR | Enum | true |
| CoListAgent3DirectPhone | String | true |
| CoListAgent3Email | String | true |
| CoListAgent3FirstName | String | true |
| CoListAgent3FullName | String | true |
| CoListAgent3HomePhone | String | true |
| CoListAgent3Key | String | true |
| CoListAgent3LastName | String | true |
| CoListAgent3MiddleName | String | true |
| CoListAgent3MlsId | String | true |
| CoListAgent3MobilePhone | String | true |
| CoListAgent3NationalAssociationId | String | true |
| CoListAgent3Nickname | String | true |
| CoListAgent3OfficePhone | String | true |
| CoListAgent3PreferredPhone | String | true |
| CoListAgent3StateLicense | String | true |
| CoListAgent3URL | String | true |
| CoListAgentAOR | Enum | true |
| CoListAgentDesignation | Multi-Enum | true |
| CoListAgentDirectPhone | String | true |
| CoListAgentEmail | String | true |
| CoListAgentFax | String | true |
| CoListAgentFirstName | String | true |
| CoListAgentFullName | String | true |
| CoListAgentHomePhone | String | true |
| CoListAgentKey | String | true |
| CoListAgentKeyNumeric | Int64 | true |
| CoListAgentLastName | String | true |
| CoListAgentMiddleName | String | true |
| CoListAgentMlsId | String | true |
| CoListAgentMobilePhone | String | true |
| CoListAgentNamePrefix | String | true |
| CoListAgentNameSuffix | String | true |
| CoListAgentNationalAssociationId | String | true |
| CoListAgentNickname | String | true |
| CoListAgentOfficePhone | String | true |
| CoListAgentOfficePhoneExt | String | true |
| CoListAgentPager | String | true |
| CoListAgentPreferredPhone | String | true |
| CoListAgentPreferredPhoneExt | String | true |
| CoListAgentStateLicense | String | true |
| CoListAgentTollFreePhone | String | true |
| CoListAgentURL | String | true |
| CoListAgentVoiceMail | String | true |
| CoListAgentVoiceMailExt | String | true |
| CoListOffice2AOR | Enum | true |
| CoListOffice2Email | String | true |
| CoListOffice2Key | String | true |
| CoListOffice2MlsId | String | true |
| CoListOffice2Name | String | true |
| CoListOffice2Phone | String | true |
| CoListOffice2URL | String | true |
| CoListOfficeAOR | Enum | true |
| CoListOfficeEmail | String | true |
| CoListOfficeFax | String | true |
| CoListOfficeKey | String | true |
| CoListOfficeKeyNumeric | Int64 | true |
| CoListOfficeMlsId | String | true |
| CoListOfficeName | String | true |
| CoListOfficeNationalAssociationId | String | true |
| CoListOfficePhone | String | true |
| CoListOfficePhoneExt | String | true |
| CoListOfficeURL | String | true |
| CommonInterest | Enum | true |
| CommonWalls | Multi-Enum | true |
| CommunityFeatures | Multi-Enum | true |
| CompensationComments | String | true |
| CompSaleYN | Boolean | true |
| ConcessionInPrice | Decimal | true |
| ConcessionInPriceType | Enum | true |
| Concessions | Enum | true |
| ConcessionsAmount | Int32 | true |
| ConcessionsBuyerBrokerFee | Int32 | true |
| ConcessionsClosingCosts | Int32 | true |
| ConcessionsComments | String | true |
| ConcessionsFinancingCosts | Int32 | true |
| ConcessionsOtherCosts | Int32 | true |
| ConcessionsPropertyImprovementCosts | Int32 | true |
| ConstructionMaterials | Multi-Enum | true |
| ContinentRegion | String | true |
| Contingency | String | true |
| ContingentDate | Date | true |
| ContractStatusChangeDate | Date | true |
| Cooling | Multi-Enum | true |
| CoolingYN | Boolean | true |
| CopyrightNotice | String | true |
| Country | Enum | true |
| CountryRegion | String | true |
| CountrySubdivision | String | true |
| CountyOrParish | String | true |
| CoveredSpaces | Decimal | true |
| CropsIncludedYN | Boolean | true |
| CrossStreet | String | true |
| CultivatedArea | Decimal | true |
| CumulativeDaysOnMarket | Int32 | true |
| CurrentFinancing | Multi-Enum | true |
| CurrentPrice | Decimal | true |
| CurrentUse | Multi-Enum | true |
| DaysOnMarket | Int32 | true |
| DaysOnMarketReplication | Int32 | true |
| DaysOnMarketReplicationDate | Date | true |
| DaysOnMarketReplicationIncreasingYN | Boolean | true |
| DelayedMarketingDate | Date | true |
| DelayedMarketingYN | Boolean | true |
| DevelopmentStatus | Multi-Enum | true |
| DirectionFaces | Enum | true |
| Directions | String | true |
| Disclaimer | String | true |
| Disclosures | Multi-Enum | true |
| DistanceToBusComments | String | true |
| DistanceToBusNumeric | Int32 | true |
| DistanceToBusUnits | Enum | true |
| DistanceToElectricComments | String | true |
| DistanceToElectricNumeric | Int32 | true |
| DistanceToElectricUnits | Enum | true |
| DistanceToFreewayComments | String | true |
| DistanceToFreewayNumeric | Int32 | true |
| DistanceToFreewayUnits | Enum | true |
| DistanceToGasComments | String | true |
| DistanceToGasNumeric | Int32 | true |
| DistanceToGasUnits | Enum | true |
| DistanceToPhoneServiceComments | String | true |
| DistanceToPhoneServiceNumeric | Int32 | true |
| DistanceToPhoneServiceUnits | Enum | true |
| DistanceToPlaceofWorshipComments | String | true |
| DistanceToPlaceofWorshipNumeric | Int32 | true |
| DistanceToPlaceofWorshipUnits | Enum | true |
| DistanceToSchoolBusComments | String | true |
| DistanceToSchoolBusNumeric | Int32 | true |
| DistanceToSchoolBusUnits | Enum | true |
| DistanceToSchoolsComments | String | true |
| DistanceToSchoolsNumeric | Int32 | true |
| DistanceToSchoolsUnits | Enum | true |
| DistanceToSewerComments | String | true |
| DistanceToSewerNumeric | Int32 | true |
| DistanceToSewerUnits | Enum | true |
| DistanceToShoppingComments | String | true |
| DistanceToShoppingNumeric | Int32 | true |
| DistanceToShoppingUnits | Enum | true |
| DistanceToStreetComments | String | true |
| DistanceToStreetNumeric | Int32 | true |
| DistanceToStreetUnits | Enum | true |
| DistanceToWaterComments | String | true |
| DistanceToWaterNumeric | Int32 | true |
| DistanceToWaterUnits | Enum | true |
| DocumentsAvailable | Multi-Enum | true |
| DocumentsChangeTimestamp | DateTime | true |
| DocumentsCount | Int32 | true |
| DOH1 | String | true |
| DOH2 | String | true |
| DOH3 | String | true |
| DoorFeatures | Multi-Enum | true |
| DualOrVariableRateCommissionYN | Boolean | true |
| Electric | Multi-Enum | true |
| ElectricExpense | Decimal | true |
| ElectricOnPropertyYN | Boolean | true |
| ElementarySchool | String | true |
| ElementarySchoolDistrict | String | true |
| Elevation | Int32 | true |
| ElevationUnits | Enum | true |
| EntryLevel | Int32 | true |
| EntryLocation | String | true |
| EstimatedCloseDate | Date | true |
| Exclusions | String | true |
| ExistingLeaseType | Multi-Enum | true |
| ExpirationDate | Date | true |
| Exposures | Multi-Enum | true |
| ExteriorFeatures | Multi-Enum | true |
| FarmCreditServiceInclYN | Boolean | true |
| FarmLandAreaSource | Enum | true |
| FarmLandAreaUnits | Enum | true |
| Fencing | Multi-Enum | true |
| FhaEligibility | Enum | true |
| FinancialDataSource | Multi-Enum | true |
| FireplaceFeatures | Multi-Enum | true |
| FireplacesTotal | Int32 | true |
| FireplaceYN | Boolean | true |
| Flooring | Multi-Enum | true |
| FoundationArea | Decimal | true |
| FoundationDetails | Multi-Enum | true |
| FrontageLength | String | true |
| FrontageLengthRemarks | String | true |
| FrontageLengthUnit | Enum | true |
| FrontageType | Multi-Enum | true |
| FuelExpense | Decimal | true |
| Furnished | Enum | true |
| FurnitureReplacementExpense | Decimal | true |
| GarageSpaces | Decimal | true |
| GarageYN | Boolean | true |
| GardenerExpense | Decimal | true |
| GrazingPermitsBlmYN | Boolean | true |
| GrazingPermitsForestServiceYN | Boolean | true |
| GrazingPermitsPrivateYN | Boolean | true |
| GreenBuildingVerificationType | Multi-Enum | true |
| GreenEnergyEfficient | Multi-Enum | true |
| GreenEnergyGeneration | Multi-Enum | true |
| GreenIndoorAirQuality | Multi-Enum | true |
| GreenLocation | Multi-Enum | true |
| GreenSustainability | Multi-Enum | true |
| GreenVerificationYN | Boolean | true |
| GreenWaterConservation | Multi-Enum | true |
| GrossIncome | Decimal | true |
| GrossScheduledIncome | Decimal | true |
| HabitableResidenceYN | Boolean | true |
| HeadBrokerMemberKey | String | true |
| HeadBrokerMemberMlsId | String | true |
| Heating | Multi-Enum | true |
| HeatingYN | Boolean | true |
| HighSchool | String | true |
| HighSchoolDistrict | String | true |
| HomeWarrantyYN | Boolean | true |
| HorseAmenities | Multi-Enum | true |
| HorseYN | Boolean | true |
| HoursDaysOfOperation | Multi-Enum | true |
| HoursDaysOfOperationDescription | String | true |
| HumanModifiedYN | Boolean | true |
| Inclusions | String | true |
| IncomeIncludes | Multi-Enum | true |
| InsuranceExpense | Decimal | true |
| InteriorFeatures | Multi-Enum | true |
| **InternetAddressDisplayYN** | **Boolean** | **true** |
| **InternetAutomatedValuationDisplayYN** | **Boolean** | **true** |
| **InternetConsumerCommentYN** | **Boolean** | **true** |
| **InternetEntireListingDisplayYN** | **Boolean** | **true** |
| IrrigationSource | Multi-Enum | true |
| IrrigationWaterRightsAcres | Decimal | true |
| IrrigationWaterRightsYN | Boolean | true |
| LaborInformation | Multi-Enum | true |
| LandLeaseAmount | Decimal | true |
| LandLeaseAmountFrequency | Enum | true |
| LandLeaseExpirationDate | Date | true |
| LandLeaseYN | Boolean | true |
| Latitude | Decimal | true |
| LaundryFeatures | Multi-Enum | true |
| LeasableArea | Decimal | true |
| LeasableAreaUnits | Enum | true |
| LeaseAmount | Decimal | true |
| LeaseAmountFrequency | Enum | true |
| LeaseAssignableYN | Boolean | true |
| LeaseConsideredYN | Boolean | true |
| LeaseExpiration | Date | true |
| LeaseRenewalCompensation | Multi-Enum | true |
| LeaseRenewalOptionYN | Boolean | true |
| LeaseTerm | Enum | true |
| LeaseTermOptions | Multi-Enum | true |
| Levels | Multi-Enum | true |
| License1 | String | true |
| License2 | String | true |
| License3 | String | true |
| LicensesExpense | Decimal | true |
| ListAgentAOR | Enum | true |
| ListAgentDesignation | Multi-Enum | true |
| ListAgentDirectPhone | String | true |
| ListAgentEmail | String | true |
| ListAgentFax | String | true |
| ListAgentFirstName | String | true |
| ListAgentFullName | String | true |
| ListAgentHomePhone | String | true |
| ListAgentKey | String | true |
| ListAgentKeyNumeric | Int64 | true |
| ListAgentLastName | String | true |
| ListAgentMiddleName | String | true |
| ListAgentMlsId | String | true |
| ListAgentMobilePhone | String | true |
| ListAgentNamePrefix | String | true |
| ListAgentNameSuffix | String | true |
| ListAgentNationalAssociationId | String | true |
| ListAgentNickname | String | true |
| ListAgentOfficePhone | String | true |
| ListAgentOfficePhoneExt | String | true |
| ListAgentPager | String | true |
| ListAgentPreferredPhone | String | true |
| ListAgentPreferredPhoneExt | String | true |
| ListAgentStateLicense | String | true |
| ListAgentTollFreePhone | String | true |
| ListAgentURL | String | true |
| ListAgentVoiceMail | String | true |
| ListAgentVoiceMailExt | String | true |
| ListAOR | Enum | true |
| ListingAgreement | Enum | true |
| ListingContractDate | Date | true |
| ListingId | String | true |
| ListingKey | String | **false** |
| ListingKeyNumeric | Int64 | true |
| ListingService | Enum | true |
| ListingTerms | Multi-Enum | true |
| ListingURL | String | true |
| ListingURLDescription | Enum | true |
| ListOfficeAOR | Enum | true |
| ListOfficeEmail | String | true |
| ListOfficeFax | String | true |
| ListOfficeKey | String | true |
| ListOfficeKeyNumeric | Int64 | true |
| ListOfficeMlsId | String | true |
| ListOfficeName | String | true |
| ListOfficeNationalAssociationId | String | true |
| ListOfficePhone | String | true |
| ListOfficePhoneExt | String | true |
| ListOfficeURL | String | true |
| ListPrice | Decimal | true |
| ListPriceLow | Decimal | true |
| ListTeamKey | String | true |
| ListTeamKeyNumeric | Int64 | true |
| ListTeamName | String | true |
| LivingArea | Decimal | true |
| LivingAreaSource | Enum | true |
| LivingAreaUnits | Enum | true |
| LockBoxLocation | String | true |
| LockBoxSerialNumber | String | true |
| LockBoxType | Multi-Enum | true |
| Longitude | Decimal | true |
| LotDimensionsSource | Enum | true |
| LotFeatures | Multi-Enum | true |
| LotSizeAcres | Decimal | true |
| LotSizeArea | Decimal | true |
| LotSizeDimensions | String | true |
| LotSizeSource | Enum | true |
| LotSizeSquareFeet | Decimal | true |
| LotSizeUnits | Enum | true |
| MainLevelBathrooms | Int32 | true |
| MainLevelBedrooms | Int32 | true |
| MaintenanceExpense | Decimal | true |
| MajorChangeTimestamp | DateTime | true |
| MajorChangeType | Enum | true |
| Make | String | true |
| ManagerExpense | Decimal | true |
| MapCoordinate | String | true |
| MapCoordinateSource | String | true |
| MapURL | String | true |
| MaximumNumberOfPets | Int32 | true |
| MaximumPetWeight | Int32 | true |
| MiddleOrJuniorSchool | String | true |
| MiddleOrJuniorSchoolDistrict | String | true |
| MLSAreaMajor | String | true |
| MLSAreaMinor | String | true |
| MlsStatus | Enum | true |
| MobileDimUnits | Enum | true |
| MobileHomeRemainsYN | Boolean | true |
| MobileLength | Int32 | true |
| MobileWidth | Int32 | true |
| Model | String | true |
| ModificationTimestamp | DateTime | true |
| MoveInCosts | Multi-Enum | true |
| NetOperatingIncome | Decimal | true |
| NewConstructionYN | Boolean | true |
| NewTaxesExpense | Decimal | true |
| NumberOfBuildings | Int32 | true |
| NumberOfFullTimeEmployees | Int32 | true |
| NumberOfLots | Int32 | true |
| NumberOfPads | Int32 | true |
| NumberOfPartTimeEmployees | Int32 | true |
| NumberOfSeparateElectricMeters | Int32 | true |
| NumberOfSeparateGasMeters | Int32 | true |
| NumberOfSeparateWaterMeters | Int32 | true |
| NumberOfUnitsInCommunity | Int32 | true |
| NumberOfUnitsLeased | Int32 | true |
| NumberOfUnitsMoMo | Int32 | true |
| NumberOfUnitsTotal | Int32 | true |
| NumberOfUnitsVacant | Int32 | true |
| OccupantName | String | true |
| OccupantPhone | String | true |
| OccupantType | Enum | true |
| OffMarketDate | Date | true |
| OffMarketTimestamp | DateTime | true |
| OngoingFees | Multi-Enum | true |
| OnMarketDate | Date | true |
| OnMarketTimestamp | DateTime | true |
| OpenHouseModificationTimestamp | DateTime | true |
| OpenParkingSpaces | Decimal | true |
| OpenParkingYN | Boolean | true |
| OperatingExpense | Decimal | true |
| OperatingExpenseIncludes | Multi-Enum | true |
| OriginalEntryTimestamp | DateTime | true |
| OriginalListPrice | Decimal | true |
| OriginatingSystemBuyerAgentMemberKey | String | true |
| OriginatingSystemBuyerOfficeKey | String | true |
| OriginatingSystemBuyerTeamKey | String | true |
| OriginatingSystemCoBuyerAgentMemberKey | String | true |
| OriginatingSystemCoBuyerOfficeKey | String | true |
| OriginatingSystemCoListAgent2MemberKey | String | true |
| OriginatingSystemCoListAgent3MemberKey | String | true |
| OriginatingSystemCoListAgentMemberKey | String | true |
| OriginatingSystemCoListOffice2Key | String | true |
| OriginatingSystemCoListOfficeKey | String | true |
| OriginatingSystemID | String | true |
| OriginatingSystemKey | String | true |
| OriginatingSystemListAgentMemberKey | String | true |
| OriginatingSystemListOfficeKey | String | true |
| OriginatingSystemListTeamKey | String | true |
| OriginatingSystemModificationTimestamp | DateTime | true |
| OriginatingSystemName | String | true |
| OriginatingSystemSubName | String | true |
| OtherEquipment | Multi-Enum | true |
| OtherExpense | Decimal | true |
| OtherParking | String | true |
| OtherStructures | Multi-Enum | true |
| OwnerName | String | true |
| OwnerName2 | String | true |
| OwnerPays | Multi-Enum | true |
| OwnerPhone | String | true |
| Ownership | String | true |
| OwnershipType | Enum | true |
| ParcelNumber | String | true |
| ParcelSubcomponent | String | true |
| ParkingFeatures | Multi-Enum | true |
| ParkingTotal | Decimal | true |
| ParkManagerName | String | true |
| ParkManagerPhone | String | true |
| ParkName | String | true |
| PastureArea | Decimal | true |
| PatioAndPorchFeatures | Multi-Enum | true |
| PendingTimestamp | DateTime | true |
| Permission | Multi-Enum | true |
| PestControlExpense | Decimal | true |
| PetDeposit | Decimal | true |
| PetsAllowed | Multi-Enum | true |
| PetsAllowedYN | Boolean | true |
| PetsComments | String | true |
| PhotosChangeTimestamp | DateTime | true |
| PhotosCount | Int32 | true |
| PoolExpense | Decimal | true |
| PoolFeatures | Multi-Enum | true |
| PoolPrivateYN | Boolean | true |
| Possession | Multi-Enum | true |
| PossibleUse | Multi-Enum | true |
| PostalCity | String | true |
| PostalCode | String | true |
| PostalCodePlus4 | String | true |
| PowerProductionType | Multi-Enum | true |
| PowerProductionYN | Boolean | true |
| PreviousListPrice | Decimal | true |
| PreviousStandardStatus | Enum | true |
| PriceChangeTimestamp | DateTime | true |
| PrivateOfficeRemarks | String | true |
| PrivateRemarks | String | true |
| ProfessionalManagementExpense | Decimal | true |
| PropertyAttachedYN | Boolean | true |
| PropertyCondition | Multi-Enum | true |
| PropertySubType | Enum | true |
| PropertySubTypeAdditional | Multi-Enum | true |
| PropertyType | Enum | true |
| PublicRemarks | String | true |
| PublicSurveyRange | String | true |
| PublicSurveySection | String | true |
| PublicSurveyTownship | String | true |
| PurchaseContractDate | Date | true |
| RangeArea | Decimal | true |
| RecordSignature | Int32 | true |
| RentControlYN | Boolean | true |
| RentIncludes | Multi-Enum | true |
| RoadFrontageType | Multi-Enum | true |
| RoadResponsibility | Multi-Enum | true |
| RoadSurfaceType | Multi-Enum | true |
| Roof | Multi-Enum | true |
| RoomsTotal | Int32 | true |
| RoomType | Multi-Enum | true |
| RVParkingDimensions | String | true |
| SaleOrLeaseIndicator | Enum | true |
| SeatingCapacity | Int32 | true |
| SecurityDeposit | Decimal | true |
| SecurityFeatures | Multi-Enum | true |
| SellerConsiderConcessionYN | Boolean | true |
| SeniorCommunityYN | Boolean | true |
| SerialU | String | true |
| SerialX | String | true |
| SerialXX | String | true |
| Sewer | Multi-Enum | true |
| ShowingAdvanceNotice | Int32 | true |
| ShowingAttendedYN | Boolean | true |
| ShowingConsiderations | Multi-Enum | true |
| ShowingContactName | String | true |
| ShowingContactPhone | String | true |
| ShowingContactPhoneExt | String | true |
| ShowingContactType | Multi-Enum | true |
| ShowingDays | Multi-Enum | true |
| ShowingEndTime | DateTime | true |
| ShowingInstructions | String | true |
| ShowingRequirements | Multi-Enum | true |
| ShowingServiceName | Enum | true |
| ShowingStartTime | DateTime | true |
| SignOnPropertyYN | Boolean | true |
| Skirt | Multi-Enum | true |
| SourceSystemID | String | true |
| SourceSystemKey | String | true |
| SourceSystemName | String | true |
| SpaFeatures | Multi-Enum | true |
| SpaYN | Boolean | true |
| SpecialLicenses | Multi-Enum | true |
| SpecialListingConditions | Multi-Enum | true |
| StandardStatus | Enum | true |
| StartShowingDate | Date | true |
| StateOrProvince | Enum | true |
| StateRegion | String | true |
| StatusChangeTimestamp | DateTime | true |
| Stories | Int32 | true |
| StoriesTotal | Int32 | true |
| StreetAdditionalInfo | String | true |
| StreetDirPrefix | Enum | true |
| StreetDirSuffix | Enum | true |
| StreetName | String | true |
| StreetNumber | String | true |
| StreetNumberNumeric | Int32 | true |
| StreetSuffix | Enum | true |
| StreetSuffixModifier | String | true |
| StructureType | Multi-Enum | true |
| SubAgencyCompensation | String | true |
| SubAgencyCompensationType | Enum | true |
| SubdivisionName | String | true |
| SuppliesExpense | Decimal | true |
| SyndicateTo | Multi-Enum | true |
| SyndicationRemarks | String | true |
| TaxAnnualAmount | Decimal | true |
| TaxAssessedValue | Int32 | true |
| TaxBlock | String | true |
| TaxBookNumber | String | true |
| TaxLegalDescription | String | true |
| TaxLot | String | true |
| TaxMapNumber | String | true |
| TaxOtherAnnualAssessmentAmount | Decimal | true |
| TaxParcelLetter | String | true |
| TaxStatusCurrent | Multi-Enum | true |
| TaxTract | String | true |
| TaxYear | Int32 | true |
| TenantPays | Multi-Enum | true |
| TenantPaysDescription | String | true |
| Topography | String | true |
| TotalActualRent | Decimal | true |
| Township | String | true |
| TransactionBrokerCompensation | String | true |
| TransactionBrokerCompensationType | Enum | true |
| TrashExpense | Decimal | true |
| UnitNumber | String | true |
| UnitsFurnished | Enum | true |
| UnitTypeType | Multi-Enum | true |
| UniversalParcelId | String | true |
| UniversalPropertyId | String | true |
| UniversalPropertySubId | String | true |
| UnparsedAddress | String | true |
| Utilities | Multi-Enum | true |
| UtilitiesExpense | Decimal | true |
| VacancyAllowance | Int32 | true |
| VacancyAllowanceRate | Decimal | true |
| Vegetation | Multi-Enum | true |
| VideosChangeTimestamp | DateTime | true |
| VideosCount | Int32 | true |
| View | Multi-Enum | true |
| ViewYN | Boolean | true |
| VirtualTourURLBranded | String | true |
| VirtualTourURLBranded2 | String | true |
| VirtualTourURLBranded3 | String | true |
| VirtualTourURLUnbranded | String | true |
| VirtualTourURLUnbranded2 | String | true |
| VirtualTourURLUnbranded3 | String | true |
| WalkScore | Int32 | true |
| WaterBodyName | String | true |
| WaterfrontFeatures | Multi-Enum | true |
| WaterfrontYN | Boolean | true |
| WaterHeater | Multi-Enum | true |
| WaterSewerExpense | Decimal | true |
| WaterSource | Multi-Enum | true |
| WindowFeatures | Multi-Enum | true |
| WithdrawnDate | Date | true |
| WoodedArea | Decimal | true |
| WorkmansCompensationExpense | Decimal | true |
| X_GeocodeSource | Enum | true |
| YearBuilt | Int32 | true |
| YearBuiltDetails | String | true |
| YearBuiltEffective | Int32 | true |
| YearBuiltSource | Enum | true |
| YearEstablished | Int32 | true |
| YearsCurrentOwner | Int32 | true |
| Zoning | String | true |
| ZoningDescription | String | true |

---

## Office (79 fields)

| Field Name | Type | Nullable |
|------------|------|----------|
| BillingOfficeKey | String | true |
| FranchiseAffiliation | String | true |
| FranchiseNationalAssociationId | String | true |
| HumanModifiedYN | Boolean | true |
| IDXOfficeParticipationYN | Boolean | true |
| MainOfficeKey | String | true |
| MainOfficeKeyNumeric | Int64 | true |
| MainOfficeMlsId | String | true |
| ModificationTimestamp | DateTime | true |
| NumberOfBranches | Int32 | true |
| NumberOfNonMemberSalespersons | Int32 | true |
| OfficeAddress1 | String | true |
| OfficeAddress2 | String | true |
| OfficeAlternateId | String | true |
| OfficeAOR | Enum | true |
| OfficeAORkey | String | true |
| OfficeAORkeyNumeric | Int64 | true |
| OfficeAORMlsId | String | true |
| OfficeAssociationComments | String | true |
| OfficeBio | String | true |
| OfficeBranchType | Enum | true |
| OfficeBrokerKey | String | true |
| OfficeBrokerKeyNumeric | Int64 | true |
| OfficeBrokerMlsId | String | true |
| OfficeBrokerNationalAssociationId | String | true |
| OfficeCity | String | true |
| OfficeCityRegion | String | true |
| OfficeCorporateLicense | String | true |
| OfficeCountry | Enum | true |
| OfficeCountyOrParish | String | true |
| OfficeEmail | String | true |
| OfficeFax | String | true |
| OfficeKey | String | **false** |
| OfficeKeyNumeric | Int64 | true |
| OfficeMailAddress1 | String | true |
| OfficeMailAddress2 | String | true |
| OfficeMailCareOf | String | true |
| OfficeMailCity | String | true |
| OfficeMailCountry | Enum | true |
| OfficeMailCountyOrParish | String | true |
| OfficeMailPostalCode | String | true |
| OfficeMailPostalCodePlus4 | String | true |
| OfficeMailStateOrProvince | Enum | true |
| OfficeManagerKey | String | true |
| OfficeManagerKeyNumeric | Int64 | true |
| OfficeManagerMlsId | String | true |
| OfficeMlsId | String | true |
| OfficeName | String | true |
| OfficeNationalAssociationId | String | true |
| OfficeNationalAssociationIdInsertDate | Date | true |
| OfficePhone | String | true |
| OfficePhoneExt | String | true |
| OfficePostalCode | String | true |
| OfficePostalCodePlus4 | String | true |
| OfficePreferredMedia | Enum | true |
| OfficePrimaryAorId | String | true |
| OfficePrimaryStateOrProvince | Enum | true |
| OfficeStateOrProvince | Enum | true |
| OfficeStatus | Enum | true |
| OfficeStreetAdditionalInfo | String | true |
| OfficeType | Enum | true |
| OriginalEntryTimestamp | DateTime | true |
| OriginatingSystemID | String | true |
| OriginatingSystemMainOfficeKey | String | true |
| OriginatingSystemName | String | true |
| OriginatingSystemOfficeBrokerKey | String | true |
| OriginatingSystemOfficeKey | String | true |
| OriginatingSystemOfficeManagerKey | String | true |
| OriginatingSystemSubName | String | true |
| OtherPhone | String | true |
| Permission | Multi-Enum | true |
| RecordSignature | Int32 | true |
| SocialMediaType | Enum | true |
| SourceSystemID | String | true |
| SourceSystemName | String | true |
| SourceSystemOfficeKey | String | true |
| SyndicateAgentOption | Enum | true |
| SyndicateTo | Multi-Enum | true |
| VirtualOfficeWebsiteYN | Boolean | true |

---

## Member (90 fields)

| Field Name | Type | Nullable |
|------------|------|----------|
| HumanModifiedYN | Boolean | true |
| JobTitle | String | true |
| LastLoginTimestamp | DateTime | true |
| MemberAddress1 | String | true |
| MemberAddress2 | String | true |
| MemberAlternateId | String | true |
| MemberAOR | Enum | true |
| MemberAORkey | String | true |
| MemberAORkeyNumeric | Int64 | true |
| MemberAORMlsId | String | true |
| MemberAssociationComments | String | true |
| MemberBillingPreference | Enum | true |
| MemberBio | String | true |
| MemberCarrierRoute | String | true |
| MemberCity | String | true |
| MemberCityRegion | String | true |
| MemberCommitteeCount | Int32 | true |
| MemberCountry | Enum | true |
| MemberCountyOrParish | String | true |
| MemberDesignation | Multi-Enum | true |
| MemberDirectPhone | String | true |
| MemberEmail | String | true |
| MemberFax | String | true |
| MemberFirstName | String | true |
| MemberFullName | String | true |
| MemberHomePhone | String | true |
| MemberIsAssistantTo | String | true |
| MemberKey | String | **false** |
| MemberKeyNumeric | Int64 | true |
| MemberLanguages | Multi-Enum | true |
| MemberLastName | String | true |
| MemberLoginId | String | true |
| MemberMailOptOutYN | Boolean | true |
| MemberMiddleName | String | true |
| MemberMlsAccessYN | Boolean | true |
| MemberMlsId | String | true |
| MemberMlsSecurityClass | Enum | true |
| MemberMobilePhone | String | true |
| MemberNamePrefix | String | true |
| MemberNameSuffix | String | true |
| MemberNationalAssociationEntryDate | Date | true |
| MemberNationalAssociationId | String | true |
| MemberNickname | String | true |
| MemberOfficePhone | String | true |
| MemberOfficePhoneExt | String | true |
| MemberOtherPhoneType | Enum | true |
| MemberPager | String | true |
| MemberPhoneTTYTDD | String | true |
| MemberPostalCode | String | true |
| MemberPostalCodePlus4 | String | true |
| MemberPreferredMail | Enum | true |
| MemberPreferredMedia | Enum | true |
| MemberPreferredPhone | String | true |
| MemberPreferredPhoneExt | String | true |
| MemberPreferredPublication | Enum | true |
| MemberPrimaryAorId | String | true |
| MemberStateLicense | String | true |
| MemberStateLicenseExpirationDate | Date | true |
| MemberStateLicenseState | Enum | true |
| MemberStateLicenseType | String | true |
| MemberStateOrProvince | Enum | true |
| MemberStatus | Enum | true |
| MemberStreetAdditionalInfo | String | true |
| MemberTollFreePhone | String | true |
| MemberTransferDate | Date | true |
| MemberType | Enum | true |
| MemberVoiceMail | String | true |
| MemberVoiceMailExt | String | true |
| MemberVotingPrecinct | String | true |
| ModificationTimestamp | DateTime | true |
| OfficeKey | String | true |
| OfficeKeyNumeric | Int64 | true |
| OfficeMlsId | String | true |
| OfficeName | String | true |
| OfficeNationalAssociationId | String | true |
| OriginalEntryTimestamp | DateTime | true |
| OriginatingSystemID | String | true |
| OriginatingSystemMemberKey | String | true |
| OriginatingSystemMemberMlsSecurityClass | String | true |
| OriginatingSystemName | String | true |
| OriginatingSystemOfficeKey | String | true |
| OriginatingSystemSubName | String | true |
| Permission | Multi-Enum | true |
| RecordSignature | Int32 | true |
| SocialMediaType | Enum | true |
| SourceSystemID | String | true |
| SourceSystemMemberKey | String | true |
| SourceSystemName | String | true |
| SyndicateTo | Multi-Enum | true |
| UniqueLicenseeIdentifier | String | true |

---

## Media (55 fields)

| Field Name | Type | Nullable |
|------------|------|----------|
| ChangedByMemberID | String | true |
| ChangedByMemberKey | String | true |
| ChangedByMemberKeyNumeric | Int64 | true |
| ClassName | Enum | true |
| HumanModifiedYN | Boolean | true |
| ImageHeight | Int32 | true |
| ImageOf | Enum | true |
| ImageSizeDescription | String | true |
| ImageWidth | Int32 | true |
| InternetEntireListingDisplayYN | Boolean | true |
| ListAgentKey | String | true |
| ListAOR | Enum | true |
| ListingPermission | Multi-Enum | true |
| ListOfficeKey | String | true |
| ListOfficeMlsId | String | true |
| LongDescription | String | true |
| MediaAlteration | Multi-Enum | true |
| MediaCategory | Enum | true |
| MediaClassification | Enum | true |
| MediaHTML | String | true |
| MediaKey | String | **false** |
| MediaKeyNumeric | Int64 | true |
| MediaModificationTimestamp | DateTime | true |
| MediaObjectID | String | true |
| MediaStatus | Enum | true |
| MediaStatusDescription | String | true |
| MediaType | Enum | true |
| MediaURL | String | true |
| ModificationTimestamp | DateTime | true |
| OffMarketDate | Date | true |
| Order | Int32 | true |
| OriginatingSystemID | String | true |
| OriginatingSystemMediaKey | String | true |
| OriginatingSystemName | String | true |
| OriginatingSystemResourceRecordId | String | true |
| OriginatingSystemResourceRecordKey | String | true |
| OriginatingSystemSubName | String | true |
| Permission | Multi-Enum | true |
| PreferredPhotoYN | Boolean | true |
| PropertySubType | Enum | true |
| PropertySubTypeAdditional | Multi-Enum | true |
| PropertyType | Enum | true |
| RecordSignature | Int32 | true |
| ResourceName | Enum | true |
| ResourceRecordID | String | true |
| ResourceRecordKey | String | true |
| ResourceRecordKeyNumeric | Int64 | true |
| ShortDescription | String | true |
| SourceSystemID | String | true |
| SourceSystemMediaKey | String | true |
| SourceSystemName | String | true |
| SourceSystemResourceRecordKey | String | true |
| StandardStatus | Enum | true |
| SyndicateTo | Multi-Enum | true |
| X_MediaStream | String | true |

---

## OpenHouse (47 fields)

| Field Name | Type | Nullable |
|------------|------|----------|
| AppointmentRequiredYN | Boolean | true |
| HumanModifiedYN | Boolean | true |
| InternetEntireListingDisplayYN | Boolean | true |
| ListAgentKey | String | true |
| ListAOR | Enum | true |
| ListingId | String | true |
| ListingKey | String | true |
| ListingKeyNumeric | Int64 | true |
| ListingPermission | Multi-Enum | true |
| ListOfficeKey | String | true |
| ListOfficeMlsId | String | true |
| LivestreamOpenHouseURL | String | true |
| ModificationTimestamp | DateTime | true |
| OffMarketDate | Date | true |
| OpenHouseAttendedBy | Enum | true |
| OpenHouseDate | Date | true |
| OpenHouseEndTime | DateTime | true |
| OpenHouseId | String | true |
| OpenHouseKey | String | **false** |
| OpenHouseKeyNumeric | Int64 | true |
| OpenHouseRemarks | String | true |
| OpenHouseStartTime | DateTime | true |
| OpenHouseStatus | Enum | true |
| OpenHouseType | Enum | true |
| OriginalEntryTimestamp | DateTime | true |
| OriginatingSystemID | String | true |
| OriginatingSystemKey | String | true |
| OriginatingSystemListingKey | String | true |
| OriginatingSystemName | String | true |
| OriginatingSystemSubName | String | true |
| Permission | Multi-Enum | true |
| PropertySubType | Enum | true |
| PropertySubTypeAdditional | Multi-Enum | true |
| PropertyType | Enum | true |
| RecordSignature | Int32 | true |
| Refreshments | String | true |
| ShowingAgentFirstName | String | true |
| ShowingAgentKey | String | true |
| ShowingAgentKeyNumeric | Int64 | true |
| ShowingAgentLastName | String | true |
| ShowingAgentMlsID | String | true |
| SourceSystemID | String | true |
| SourceSystemKey | String | true |
| SourceSystemListingKey | String | true |
| SourceSystemName | String | true |
| StandardStatus | Enum | true |
| SyndicateTo | Multi-Enum | true |

---

## CustomProperty (140 fields)

| Field Name | Type | Nullable |
|------------|------|----------|
| AboveGradeBedrooms | String | true |
| AboveGradeFinishedAreaRange | String | true |
| AboveGradeFinishedAreaRangeSource | Enum | true |
| AboveGradeFinishedAreaRangeUnits | Enum | true |
| AboveGradeUnfinishedAreaRange | String | true |
| AboveGradeUnfinishedAreaRangeSource | Enum | true |
| AboveGradeUnfinishedAreaRangeUnits | Enum | true |
| AdditionalFee | Decimal | true |
| AdditionalFeeDescription | String | true |
| AdditionalFeeFrequency | Enum | true |
| AdditionalFeeYN | Boolean | true |
| AdditionalInfo1 | String | true |
| AdditionalInfo2 | String | true |
| AdditionalInfo3 | String | true |
| ApplicationFee | Decimal | true |
| AssociationFeeTotal | Decimal | true |
| AssociationFeeTotalFrequency | Enum | true |
| Attic | Multi-Enum | true |
| AvailabilityType | Multi-Enum | true |
| BelowGradeBedrooms | String | true |
| BelowGradeFinishedAreaRange | String | true |
| BelowGradeFinishedAreaRangeSource | Enum | true |
| BelowGradeFinishedAreaRangeUnits | Enum | true |
| BelowGradeUnfinishedAreaRange | String | true |
| BelowGradeUnfinishedAreaRangeSource | Enum | true |
| BelowGradeUnfinishedAreaRangeUnits | Enum | true |
| BoatDockAccommodates | String | true |
| BoatDockHeight | Decimal | true |
| BoatDockSlipDescription | String | true |
| BoatDockSlipFeatures | Multi-Enum | true |
| BoatDockYN | Boolean | true |
| BoatSlipYN | Boolean | true |
| BonusAmount | Decimal | true |
| BuildingAreaTotalRange | String | true |
| BuildingAreaTotalRangeSource | Enum | true |
| BuildingAreaTotalRangeUnits | Enum | true |
| BuildingSizeDimensions | String | true |
| CommunityDevelopmentDistrictYN | Boolean | true |
| ComplexName | String | true |
| ConsumerRemarks | String | true |
| CustomFields | String | true |
| DevelopmentName | String | true |
| DownPaymentAssistanceAmount | Decimal | true |
| DownPaymentAssistanceCount | Int64 | true |
| FractionalShare | String | true |
| GarageArea | String | true |
| GarageAreaUnits | String | true |
| GarageDimensions | String | true |
| GuestHouseAreaTotal | Decimal | true |
| GuestHouseAreaTotalSource | Enum | true |
| GuestHouseAreaTotalUnits | Enum | true |
| GuestHouseDescription | String | true |
| GuestHouseYN | Boolean | true |
| GulfAccessType | Multi-Enum | true |
| GulfAccessYN | Boolean | true |
| HumanModifiedYN | Boolean | true |
| InternetEntireListingDisplayYN | Boolean | true |
| LakeChainName | String | true |
| LakeId | String | true |
| LakeName | String | true |
| LakeSize | String | true |
| LandTenure | Multi-Enum | true |
| Lang2_Type | String | true |
| Lang3_Type | String | true |
| LastMonthRentReqYN | Boolean | true |
| LeaseAmountPerArea | Decimal | true |
| LeaseAmountPerAreaUnit | Enum | true |
| LeaseTermsDescription | String | true |
| ListAOR | Enum | true |
| ListingId | String | true |
| ListingKey | String | **false** |
| ListingKeyNumeric | Int64 | true |
| ListOfficeKey | String | true |
| ListOfficeMlsId | String | true |
| LivingAreaRange | String | true |
| LivingAreaRangeHigh | Decimal | true |
| LivingAreaRangeLow | Decimal | true |
| LivingAreaRangeSource | Enum | true |
| LivingAreaRangeUnits | Enum | true |
| Location | String | true |
| LotSizeAreaRangeHigh | Decimal | true |
| LotSizeAreaRangeLow | Decimal | true |
| LotSizeRange | String | true |
| LotSizeRangeSource | Enum | true |
| LotSizeRangeUnits | Enum | true |
| Membership | Multi-Enum | true |
| MembershipFee | Decimal | true |
| MembershipFeeFrequency | Enum | true |
| MembershipRequiredYN | Boolean | true |
| MineralRights | Multi-Enum | true |
| ModificationTimestamp | DateTime | true |
| MonthlyRate | String | true |
| NumberOfBoatDocks | Int32 | true |
| NumberOfBoatSlips | Int32 | true |
| OffersDescription | String | true |
| OffersReviewDate | Date | true |
| OffMarketDate | Date | true |
| OffSeasonRate | String | true |
| OriginatingSystemKey | String | true |
| OriginatingSystemName | String | true |
| OriginatingSystemSubName | String | true |
| OtherExpenseDescription | String | true |
| Permission | Multi-Enum | true |
| PotentialShortSale | Enum | true |
| PricePerArea | Decimal | true |
| PricePerAreaUnit | Enum | true |
| PrivateShowingInstructions | String | true |
| ProjectName | String | true |
| PropertyAccess | Multi-Enum | true |
| PublicRemarks_lang2 | String | true |
| PublicRemarks_lang3 | String | true |
| RentSpreeURL | String | true |
| RentSpreeYN | Boolean | true |
| Restrictions | Multi-Enum | true |
| RiverName | String | true |
| SaleOrLeaseIncludes | String | true |
| SeasonRate | String | true |
| SecurityDepositDescription | String | true |
| SecurityDepositYN | Boolean | true |
| SourceSupplementPublicCount | Int32 | true |
| SourceSystemKey | String | true |
| StandardStatus | Enum | true |
| StoriesPartial | String | true |
| StoriesPartialTotal | String | true |
| StormProtection | Multi-Enum | true |
| TaxAssessedValueImprovement | String | true |
| TaxAssessedValueLand | String | true |
| TaxAuthority | String | true |
| TaxRate | Decimal | true |
| TaxYearRange | String | true |
| ThirdPartyIntegrationType | Multi-Enum | true |
| TitleCompanyAddress | String | true |
| TitleCompanyName | String | true |
| TitleCompanyPhone | String | true |
| TitleCompanyPreferred | String | true |
| UnitLocation | String | true |
| WaterAccessDescription | String | true |
| WaterAccessYN | Boolean | true |
| WeeklyRate | String | true |
| PropertyType | Enum | true |

---

## PropertyRooms (39 fields)

| Field Name | Type | Nullable |
|------------|------|----------|
| HumanModifiedYN | Boolean | true |
| InputEntryOrder | Int32 | true |
| InternetEntireListingDisplayYN | Boolean | true |
| ListAgentKey | String | true |
| ListAOR | Enum | true |
| ListingId | String | true |
| ListingKey | String | true |
| ListingKeyNumeric | Int64 | true |
| ListingPermission | Multi-Enum | true |
| ListOfficeKey | String | true |
| ListOfficeMlsId | String | true |
| ModificationTimestamp | DateTime | true |
| OffMarketDate | Date | true |
| OriginatingSystemListingKey | String | true |
| OriginatingSystemName | String | true |
| OriginatingSystemSubName | String | true |
| Permission | Multi-Enum | true |
| PropertySubType | Enum | true |
| PropertySubTypeAdditional | Multi-Enum | true |
| PropertyType | Enum | true |
| RecordSignature | Int32 | true |
| RoomArea | Decimal | true |
| RoomAreaSource | Enum | true |
| RoomAreaUnits | Enum | true |
| RoomDescription | String | true |
| RoomDimensions | String | true |
| RoomFeatures | Multi-Enum | true |
| RoomFlooring | Multi-Enum | true |
| RoomKey | String | **false** |
| RoomKeyNumeric | Int64 | true |
| RoomLength | Decimal | true |
| RoomLengthWidthSource | Enum | true |
| RoomLengthWidthUnits | Enum | true |
| RoomLevel | Enum | true |
| RoomType | Enum | true |
| RoomWidth | Decimal | true |
| SourceSystemID | String | true |
| StandardStatus | Enum | true |
| SyndicateTo | Multi-Enum | true |

---

## PropertyUnitTypes (52 fields)

| Field Name | Type | Nullable |
|------------|------|----------|
| HumanModifiedYN | Boolean | true |
| InputEntryOrder | Int32 | true |
| InternetEntireListingDisplayYN | Boolean | true |
| ListAgentKey | String | true |
| ListAOR | Enum | true |
| ListingId | String | true |
| ListingKey | String | true |
| ListingKeyNumeric | Int64 | true |
| ListingPermission | Multi-Enum | true |
| ListOfficeKey | String | true |
| ListOfficeMlsId | String | true |
| ModificationTimestamp | DateTime | true |
| OffMarketDate | Date | true |
| OriginatingSystemListingKey | String | true |
| OriginatingSystemName | String | true |
| OriginatingSystemSubName | String | true |
| Permission | Multi-Enum | true |
| PropertySubType | Enum | true |
| PropertySubTypeAdditional | Multi-Enum | true |
| PropertyType | Enum | true |
| RecordSignature | Int32 | true |
| SourceSystemID | String | true |
| StandardStatus | Enum | true |
| SyndicateTo | Multi-Enum | true |
| UnitTypeActualRent | Decimal | true |
| UnitTypeActualRentRange | String | true |
| UnitTypeArea | Decimal | true |
| UnitTypeAreaSource | Enum | true |
| UnitTypeAreaUnits | Enum | true |
| UnitTypeBathsTotal | Int32 | true |
| UnitTypeBedsTotal | Int32 | true |
| UnitTypeDeposit | Decimal | true |
| UnitTypeDescription | String | true |
| UnitTypeFireplaceYN | Boolean | true |
| UnitTypeFurnished | Enum | true |
| UnitTypeGarageAttachedYN | Boolean | true |
| UnitTypeGarageSpaces | Decimal | true |
| UnitTypeKey | String | **false** |
| UnitTypeKeyNumeric | Int64 | true |
| UnitTypeLeasedYN | Boolean | true |
| UnitTypeLeaseExpires | DateTime | true |
| UnitTypeMonthToMonthYN | Boolean | true |
| UnitTypeNumFullBaths | Int32 | true |
| UnitTypeNumHalfBaths | Int32 | true |
| UnitTypeOccupantType | Multi-Enum | true |
| UnitTypePetDeposit | Decimal | true |
| UnitTypePetDepositPerPetYN | Boolean | true |
| UnitTypeProForma | Int32 | true |
| UnitTypeTotalRent | Decimal | true |
| UnitTypeType | Enum | true |
| UnitTypeUnitNum | String | true |
| UnitTypeUnitsTotal | Int32 | true |

---

## Teams (48 fields)

| Field Name | Type | Nullable |
|------------|------|----------|
| HumanModifiedYN | Boolean | true |
| ModificationTimestamp | DateTime | true |
| OfficeKey | String | true |
| OriginalEntryTimestamp | DateTime | true |
| OriginatingSystemID | String | true |
| OriginatingSystemKey | String | true |
| OriginatingSystemName | String | true |
| OriginatingSystemSubName | String | true |
| OriginatingSystemTeamLeadKey | String | true |
| Permission | Multi-Enum | true |
| RecordSignature | Int32 | true |
| SocialMediaType | Enum | true |
| SocialMediaTypeUrl | String | true |
| SourceSystemID | String | true |
| SourceSystemKey | String | true |
| SourceSystemName | String | true |
| TeamAddress1 | String | true |
| TeamAddress2 | String | true |
| TeamCarrierRoute | String | true |
| TeamCity | String | true |
| TeamCountry | Enum | true |
| TeamCountyOrParish | String | true |
| TeamDescription | String | true |
| TeamDirectPhone | String | true |
| TeamEmail | String | true |
| TeamFax | String | true |
| TeamKey | String | **false** |
| TeamKeyNumeric | Int64 | true |
| TeamLeadKey | String | true |
| TeamLeadKeyNumeric | Int64 | true |
| TeamLeadLoginId | String | true |
| TeamLeadMlsId | String | true |
| TeamLeadNationalAssociationId | String | true |
| TeamLeadStateLicense | String | true |
| TeamLeadStateLicenseState | Enum | true |
| TeamMobilePhone | String | true |
| TeamName | String | true |
| TeamOfficePhone | String | true |
| TeamOfficePhoneExt | String | true |
| TeamPostalCode | String | true |
| TeamPostalCodePlus4 | String | true |
| TeamPreferredPhone | String | true |
| TeamPreferredPhoneExt | String | true |
| TeamStateOrProvince | Enum | true |
| TeamStatus | Enum | true |
| TeamTollFreePhone | String | true |
| TeamVoiceMail | String | true |
| TeamVoiceMailExt | String | true |

---

## TeamMembers (29 fields)

| Field Name | Type | Nullable |
|------------|------|----------|
| HumanModifiedYN | Boolean | true |
| MemberKey | String | true |
| MemberKeyNumeric | Int64 | true |
| MemberLoginId | String | true |
| MemberMlsId | String | true |
| MemberStatus | Enum | true |
| ModificationTimestamp | DateTime | true |
| OfficeKey | String | true |
| OriginalEntryTimestamp | DateTime | true |
| OriginatingSystemID | String | true |
| OriginatingSystemKey | String | true |
| OriginatingSystemMemberKey | String | true |
| OriginatingSystemName | String | true |
| OriginatingSystemSubName | String | true |
| OriginatingSystemTeamKey | String | true |
| Permission | Multi-Enum | true |
| RecordSignature | Int32 | true |
| SourceSystemID | String | true |
| SourceSystemKey | String | true |
| SourceSystemName | String | true |
| StandardName | String | true |
| TeamImpersonationLevel | Enum | true |
| TeamKey | String | true |
| TeamKeyNumeric | Int64 | true |
| TeamMemberKey | String | **false** |
| TeamMemberKeyNumeric | Int64 | true |
| TeamMemberNationalAssociationId | String | true |
| TeamMemberStateLicense | String | true |
| TeamMemberType | Enum | true |

---

## PropertyGreenVerification (39 fields)

| Field Name | Type | Nullable |
|------------|------|----------|
| GreenBuildingVerificationKey | String | **false** |
| GreenBuildingVerificationKeyNumeric | Int64 | true |
| GreenBuildingVerificationType | Enum | true |
| GreenVerificationBody | String | true |
| GreenVerificationMetric | Int32 | true |
| GreenVerificationRating | String | true |
| GreenVerificationSource | Enum | true |
| GreenVerificationStatus | Enum | true |
| GreenVerificationURL | String | true |
| GreenVerificationVersion | String | true |
| GreenVerificationYear | Int32 | true |
| HumanModifiedYN | Boolean | true |
| InputEntryOrder | Int32 | true |
| InternetEntireListingDisplayYN | Boolean | true |
| ListAgentKey | String | true |
| ListAOR | Enum | true |
| ListingId | String | true |
| ListingKey | String | true |
| ListingKeyNumeric | Int64 | true |
| ListingPermission | Multi-Enum | true |
| ListOfficeKey | String | true |
| ListOfficeMlsId | String | true |
| ModificationTimestamp | DateTime | true |
| OffMarketDate | Date | true |
| OriginalEntryTimestamp | String | true |
| OriginatingSystemGreenBuildingVerificationKey | String | true |
| OriginatingSystemID | String | true |
| OriginatingSystemKey | String | true |
| OriginatingSystemListingKey | String | true |
| OriginatingSystemName | String | true |
| OriginatingSystemSubName | String | true |
| Permission | Multi-Enum | true |
| PropertySubType | Enum | true |
| PropertySubTypeAdditional | Multi-Enum | true |
| PropertyType | Enum | true |
| RecordSignature | Int32 | true |
| SourceSystemID | String | true |
| StandardStatus | Enum | true |
| SyndicateTo | Multi-Enum | true |

---

## Building (0 data fields)

Building entity has only `BuildingKey` as its primary key plus navigation properties to Media and Property. No data fields are defined on this entity — it is an empty shell on Trestle.

---

## System Entities

### Field (16 fields)

| Field Name | Type | Nullable |
|------------|------|----------|
| Definition | String | true |
| DisplayName | String | true |
| FieldKey | String | **false** |
| FieldName | String | true |
| Length | Int64 | true |
| LookupName | String | true |
| ModelKey | String | true |
| ModificationTimestamp | DateTime | true |
| NumOccurrences | Int64 | true |
| Precision | Int64 | true |
| RESOStandardYN | Boolean | true |
| ResourceName | String | true |
| SystemReferenceCount | Int64 | true |
| SystemReferences | String | true |
| Type | String | true |

### Lookup (14 fields)

| Field Name | Type | Nullable |
|------------|------|----------|
| Definition | String | true |
| FieldKey | String | true |
| FieldName | String | true |
| LegacyODataValue | String | true |
| LookupKey | String | **false** |
| LookupName | String | true |
| LookupValue | String | true |
| ModelKey | String | true |
| ModificationTimestamp | DateTime | true |
| OdataOverride | String | true |
| RESOStandardYN | Boolean | true |
| ResourceName | String | true |
| StandardLookupValue | String | true |
| SystemReferenceCount | Int64 | true |
| SystemReferences | String | true |

### Model (8 fields)

| Field Name | Type | Nullable |
|------------|------|----------|
| Definition | String | true |
| ModelKey | String | **false** |
| ModelName | String | true |
| ModelTimestampFieldKey | String | true |
| ModificationTimestamp | DateTime | true |
| PrimaryKeyFieldKey | String | true |
| SystemReferenceCount | Int64 | true |
| SystemReferences | String | true |

### DataSystem (6 fields)

| Field Name | Type | Nullable |
|------------|------|----------|
| ID | String | **false** |
| Name | String | true |
| ServiceURI | String | true |
| DateTimeStamp | DateTime | **false** |
| TransportVersion | String | true |
| DataDictionaryVersion | String | true |

### Enumeration (7 fields)

| Field Name | Type | Nullable |
|------------|------|----------|
| ID | String | **false** |
| EnumerationName | String | true |
| EnumerationValue | String | true |
| EnumerationLongValue | String | true |
| ParentEnumerationName | String | true |
| ParentEnumerationValue | String | true |
| ModificationTimestamp | DateTime | true |
| OriginatingSystemName | String | true |

---

## Navigation Properties

| Source Entity | Navigation | Target Entity |
|--------------|------------|---------------|
| Property | Media | Media |
| Property | OpenHouse | OpenHouse |
| Property | BuyerAgent | Member |
| Property | CoBuyerAgent | Member |
| Property | CoListAgent | Member |
| Property | ListAgent | Member |
| Property | BuyerOffice | Office |
| Property | CoBuyerOffice | Office |
| Property | CoListOffice | Office |
| Property | ListOffice | Office |
| Property | CustomProperty | CustomProperty |
| Property | Rooms | PropertyRooms |
| Property | UnitTypes | PropertyUnitTypes |
| Property | Building | Building |
| Office | Media | Media |
| Office | BuyerOfficeProperties | Property |
| Office | ListOfficeProperties | Property |
| Office | CoListOfficeProperties | Property |
| Office | CoBuyerOfficeProperties | Property |
| Member | Media | Media |
| Member | ListAgentProperties | Property |
| Member | CoListAgentProperties | Property |
| Member | BuyerAgentProperties | Property |
| Member | CoBuyerAgentProperties | Property |
| Media | Property | Property |
| OpenHouse | Property | Property |
| CustomProperty | Property | Property |
| PropertyRooms | Property | Property |
| PropertyUnitTypes | Property | Property |
| Building | Media | Media |
| Building | Property | Property |

---

## Critical: Distribution Gate Fields

These 4 Boolean fields on Property control what can be displayed publicly. **All 4 must be checked BEFORE displaying any listing data.** They are on Trestle Property but NOT in the REBNY IDX Plus 902-field CSV.

| Field | Purpose | If false |
|-------|---------|----------|
| `InternetEntireListingDisplayYN` | Master display gate | Do NOT display listing anywhere on the internet |
| `InternetAddressDisplayYN` | Address display gate | Do NOT display the property address |
| `InternetAutomatedValuationDisplayYN` | AVM gate | Do NOT display automated valuations (Zestimate-type) |
| `InternetConsumerCommentYN` | Comment gate | Do NOT allow consumer comments on this listing |

Additionally, `InternetEntireListingDisplayYN` appears on: Media, OpenHouse, CustomProperty, PropertyRooms, PropertyUnitTypes, PropertyGreenVerification — as a replicated gate for sub-resources.

---

## Fields NOT on Trestle (Common Mistakes)

These fields are referenced in various RESO/RLS documentation but do NOT exist on the Trestle API:

| Field | Use Instead |
|-------|------------|
| `IDXEntireListingDisplayYN` | `InternetEntireListingDisplayYN` |
| `SyndicateYN` | `SyndicateTo` (Multi-Enum) |
| `MoveInCostsAmountTotal` | Not available — use `CustomProperty.CustomFields` |
| `MoveInCostsComments` | Not available — use `CustomProperty.CustomFields` |
| `FirstShowingDate` | `ActivationDate` (confirmed by Trestle 2026-03-19) |
| `PossessionDate` | Not accepted by Trestle |
| All `VOW`-prefixed gate fields | Not on Trestle (VOW is a separate feed type) |
