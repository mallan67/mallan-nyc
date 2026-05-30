# Field Authority — Governance Hierarchy & RLS Field Registry

> **REBNY IDX Plus is the single source of truth.** Every field decision, display rule, permission check, and validation in this project
> is governed by the REBNY RLS. No RESO standard, IDX convention, or vendor default may override an RLS rule or field.

---

## FIELD AUTHORITY ORDER (ENFORCED — NO EXCEPTIONS)

```
┌─────────────────────────────────────────────────────────┐
│  1. UCBA (Universal Co-Brokerage Agreement)             │
│     Governs: contractual obligations, agent conduct,    │
│     timing, penalties, exhibits                         │
├─────────────────────────────────────────────────────────┤
│  2. REBNY IDX Plus (902 fields)  ◄── SINGLE SOURCE       │
│     Governs: permissions, timing, statuses, mapping,    │
│     IDs, dissemination, field names, picklist values,   │
│     validation rules, rejection criteria                │
│     Source: rebny-rls-property-fields.csv (902 IDX Plus fields)  │
│     Source: rebny-rls-property-lookup.csv (1,993 values)│
├─────────────────────────────────────────────────────────┤
│  3. RLS OVERRIDES RESO/IDX                              │
│     If an RLS rule or field exists for ANY behavior,    │
│     it OVERRIDES all RESO/IDX schema, vendor defaults,  │
│     and third-party conventions. No exceptions.         │
├─────────────────────────────────────────────────────────┤
│  4. RESO/IDX FILLS GAPS ONLY                            │
│     If NO RLS rule/field exists, use RESO Data          │
│     Dictionary for naming, types, and enums.            │
│     Implement via IDX conventions.                      │
├─────────────────────────────────────────────────────────┤
│  5. INTERNAL-ONLY                                       │
│     If neither RLS nor RESO/IDX governs a data          │
│     element, it is INTERNAL-ONLY and MUST NOT           │
│     affect public display eligibility.                  │
├─────────────────────────────────────────────────────────┤
│  6. FAIL CLOSED                                         │
│     Any uncertainty or missing permission data           │
│     defaults to NON-DISPLAY. Never guess. Never assume. │
└─────────────────────────────────────────────────────────┘
```

### What "RLS Trumps" Means in Practice

| Scenario | Rule |
|----------|------|
| RESO calls it `StandardStatus`, RLS calls it `MlsStatus` | **Use `MlsStatus`** |
| RESO says field is optional, RLS says required | **It's required** |
| Vendor default shows address, `InternetAddressDisplayYN = False` | **Suppress address** |
| RESO picklist has "Quadruplex", RLS picklist has "Quadruplex" | **Use RLS value** |
| RESO defines a field that doesn't exist in RLS CSV | **INTERNAL-ONLY or omit** |
| Display flag is missing/null/undefined | **NON-DISPLAY (fail closed)** |

---

## Field Notation Convention

All field references across forms, CRM, search, and code use:

```
RLS/RESO/IDX: FieldName
```

- **RLS** = REBNY REBNY field name from IDX Plus registry (902 fields) — **PRIMARY — per REBNY IDX Plus 3.15.26**
- **RESO** = RESO Data Dictionary name (same in most cases) — **SECONDARY**
- **IDX** = IDX/VOW display feed (indicates field appears in public feeds) — **TERTIARY**

The RLS CSV (`data/rebny-rls-property-fields.csv`) is a **derived compatibility reference, NOT the field authority** — the only field-name authority is Cotality live `$metadata` (run `node scripts/get-metadata.js`; the CSV drifts from the feed).

---

## 23 RESO → RLS Name Renames

These fields have DIFFERENT names in RESO vs RLS. **Always use the RLS name.**

| RESO Name | RLS Name | Notes |
|-----------|----------|-------|
| `StandardStatus` | **`MlsStatus`** | Critical — status field |
| `ListingKey` | **`SourceSystemKey`** | Critical — listing ID |
| `UnparsedAddress` | **`UnParsedAddress`** | Case difference |
| `ModificationTimestamp` | **`SourceSystemModificationTimestamp`** | Renamed |
| `BuyerAgentKey` | **`BuyerAgentMlsId`** | Foreign key |
| `BuyerOfficeKey` | **`BuyerOfficeMlsId`** | Foreign key |
| `BuyerTeamKey` | **`BuyerTeamMlsId`** | Foreign key |
| `CoBuyerAgentKey` | **`CoBuyerAgentMlsId`** | Foreign key |
| `CoBuyerOfficeKey` | **`CoBuyerOfficeMlsId`** | Foreign key |
| `CoListAgentKey` | **`CoListAgentMlsId`** | Foreign key |
| `CoListAgent2Key` | **`CoListAgent2MLSID`** | Foreign key |
| `CoListAgent3Key` | **`CoListAgent3MLSID`** | Foreign key |
| `ListAgentKey` | **`ListAgentMlsId`** | Foreign key |
| `ListOfficeKey` | **`ListOfficeMlsId`** | Foreign key |
| `ListTeamKey` | **`ListTeamMlsId`** | Foreign key |
| `CoExclusiveListingKey` | **`DuplicateListingIDs`** | Renamed |
| `BuildingSocialMedia` | **`BuildingSocialMediaURL`** | URL suffix added |
| `ListingSocialMedia` | **`ListingSocialMediaURL`** | URL suffix added |
| `CableTvExpense` | **`CableTVExpense`** | Case difference |
| `CeilingHeight` | **`CeilingHeightFeet`** | Split into 2 fields |
| `CeilingHeight` | **`CeilingHeightInches`** | Split into 2 fields |
| `LotDimensionsSource` | **`LotSizeSource`** | Renamed |
| `ShowingContactPhoneExt` | **`ShowingContactPhone`** | Merged |

---

## Field Statistics

| Metric | Count |
|--------|-------|
| **Total RLS fields** | **902** |
| Mandatory (required) | 41 |
| Conditional (required when conditions met) | 86 |
| Optional | 321 |
| Editable (LMP Add/Edit) | 355 |
| Searchable (LMP Search) | 429 |
| Read-only (system-managed) | 87 |
| Picklist (lookup) fields | 114 |
| Total picklist values | 1,993 |

---

## Mandatory Fields (41)

These fields MUST be populated for every listing submitted to the RLS. Missing any = rejection.

| # | RLS Field | Category | Notes |
|---|-----------|----------|-------|
| 1 | `AttendanceType` | Building | Picklist |
| 2 | `BathroomsFull` | Unit | Integer |
| 3 | `BathroomsHalf` | Unit | Integer |
| 4 | `BathroomsTotal` | Unit | Decimal (full + half as .5) |
| 5 | `BedroomsTotal` | Unit | Integer |
| 6 | `BuildingLaundryFeatures` | Building | Picklist |
| 7 | `BuildingPetsAllowed` | Building | Picklist |
| 8 | `BuildingTaxLot` | Building | Tax lot ID |
| 9 | `BuyerAgentMlsId` | Buyer Agent | RESO: BuyerAgentKey |
| 10 | `City` | Address | Must be in NYC |
| 11 | `CityRegion` | Address | Borough — must match CountyOrParish |
| 12 | `CoBrokeAgreement` | Compliance | REBNY/RUNDBA type |
| 13 | `CommonInterest` | Classification | Condo/Co-op/Condop/None |
| 14 | `Concessions` | Deal | |
| 15 | `CountyOrParish` | Address | Must match CityRegion |
| 16 | `ElevatorsTotal` | Building | Integer |
| 17 | `ExpirationDate` | Status | Listing expiration |
| 18 | `GarageYN` | Building | Boolean |
| 19 | `InternetEntireListingDisplayYN` | Display | **Distribution gate** *(also gates IDX — `IDXEntireListingDisplayYN` does not exist on Trestle)* |
| 20 | `InternetAddressDisplayYN` | Display | **Address suppression gate** |
| 21 | `InternetAutomatedValuationDisplayYN` | Display | AVM gate |
| 22 | `InternetConsumerCommentYN` | Display | Comment gate |
| 23 | `InternetEntireListingDisplayYN` | Display | **Master display gate / FARE Act** |
| 24 | `ListAgentMlsId` | List Agent | RESO: ListAgentKey |
| 25 | `ListingAgreement` | Compliance | Agreement type |
| 26 | `ListPrice` | Pricing | Must be > 0 |
| 27 | `MlsStatus` | Status | RESO: StandardStatus |
| 28 | `NewConstructionYN` | Property | Boolean |
| 29 | `NewDevelopmentYN` | Property | Boolean |
| 30 | `NumberOfUnitsTotal` | Building | Integer |
| 31 | `OnMarketDate` | Status | |
| 32 | `OriginalEntryTimestamp` | Status | Read-only, system-set |
| 33 | `PetsAllowed` | Unit | Picklist |
| 34 | `PostalCity` | Address | Official REBNY picklist (51 values) |
| 35 | `PostalCode` | Address | |
| 36 | `PropertySubType` | Classification | Building type |
| 37 | `PropertyType` | Classification | Residential / ResidentialLease |
| 38 | `PublicRemarks` | Description | Fair Housing scanned |
| 39 | `RoomsTotal` | Unit | Integer |
| 40 | `ShowingInstructions` | Showing | |
| 41 | `SourceSystemKey` | System | RESO: ListingKey, read-only |
| 42 | `StandardStatus` | Status | Read-only mirror of MlsStatus |
| 43 | `StateOrProvince` | Address | Always "NY" |
| 44 | `StoriesTotal` | Building | Integer |
| 45 | `StreetName` | Address | Must be in Street Dictionary |
| 46 | `StreetNumber` | Address | |
| 47 | `StructureType` | Classification | |
| 48 | `SubdivisionName` | Location | **REBNY neighborhood picklist enforced** |
| 49 | `SyndicateTo` | Distribution | *(UCBA: `SyndicateYN`)* |
| 50 | `TaxBlock` | Tax | |
| 51 | `UnParsedAddress` | Address | RESO: UnparsedAddress |
| 52 | `YearBuilt` | Building | Integer |

---

## Fields by Category

### Display & Distribution (5 fields) — CRITICAL COMPLIANCE
| Field | Required | Description |
|-------|----------|-------------|
| **`InternetEntireListingDisplayYN`** | R | Master gate — also controls IDX feed inclusion *(no separate `IDXEntireListingDisplayYN` on Trestle)* |
| **`InternetAddressDisplayYN`** | R | Controls address display — suppress if False |
| **`InternetAutomatedValuationDisplayYN`** | R | Controls AVM display |
| **`InternetConsumerCommentYN`** | R | Controls consumer comments |
| **`InternetEntireListingDisplayYN`** | R | **Master gate** — False = no public display (FARE Act trigger for rentals) |

### Classification (4 fields)
| Field | Required | Description |
|-------|----------|-------------|
| **`PropertyType`** | R | `Residential` (sale) or `ResidentialLease` (rental) |
| **`PropertySubType`** | R | Building/unit type (Apartment, Townhouse, etc.) |
| **`CommonInterest`** | R | Ownership (Condominium, StockCooperative, Condop, None) |
| **`StructureType`** | R | Structure classification |

### Address (14 fields)
| Field | Req | Description |
|-------|-----|-------------|
| **`City`** | R | Must be in NYC |
| **`CityRegion`** | R | Borough — must match CountyOrParish |
| **`CountyOrParish`** | R | County — must match CityRegion |
| **`PostalCity`** | R | Official REBNY picklist |
| **`PostalCode`** | R | ZIP code |
| **`StateOrProvince`** | R | Always "NY" |
| **`StreetName`** | R | Must be in Street Dictionary |
| **`StreetNumber`** | R | |
| **`UnParsedAddress`** | R | Full address string |
| **`InternetAddressDisplayYN`** | R | **Suppress if False** |
| `CrossStreet` | - | |
| `Latitude` | - | |
| `Longitude` | - | |
| `Directions` | - | |

### Status & Dates (18 key fields)
| Field | Req | Editable | Description |
|-------|-----|----------|-------------|
| **`MlsStatus`** | R | Yes | Current status (RESO: StandardStatus) |
| **`StandardStatus`** | R | No | Read-only mirror |
| **`OnMarketDate`** | R | Yes | |
| **`ExpirationDate`** | R | Yes | |
| `ActivationDate` | C | Yes | Required if ComingSoon |
| `AvailabilityDate` | C | Yes | Required if ResidentialLease |
| `CloseDate` | C | Yes | Required when Closed |
| `CancellationDate` | C | Yes | Required when Cancelled |
| `OffMarketDate` | C | Yes | |
| `WithdrawnDate` | C | Yes | |
| `PurchaseContractDate` | C | Yes | |
| `DaysOnMarket` | - | No | System-calculated |
| `CumulativeDaysOnMarket` | - | No | Resets after 30 days W/C (UCBA 2026) |
| `OriginalEntryTimestamp` | R | No | System-set |
| `ListingContractDate` | - | Yes | |
| `PriceChangeTimestamp` | - | No | |
| `StatusChangeTimestamp` | - | No | |
| `ModificationTimestamp` | - | No | |

### Building (27 fields)
**Required:** `AttendanceType`, `BuildingLaundryFeatures`, `BuildingPetsAllowed`, `BuildingTaxLot`, `ElevatorsTotal`, `GarageYN`, `NumberOfUnitsTotal`, `StoriesTotal`, `YearBuilt`

**Conditional:** `BuildingAreaTotal` (townhouses/multi-family), `BuildingAreaUnits`, `BuildingPetsAllowedComments`

**Optional:** `BuildingAccessibilityFeatures`, `BuildingCondition`, `BuildingCooling`, `BuildingEntryLocation`, `BuildingExteriorFeatures`, `BuildingFeatures`, `BuildingFencing`, `BuildingHeating`, `BuildingName`, `BuildingParkingFeatures`, `BuildingParkingTotal`, `BuildingPatioAndPorchFeatures`, `BuildingPoolFeatures`, `BuildingRules`, `BuildingSecurityFeatures`, `BuildingSmokeFreeYN`, `BuildingSocialMediaURL`, `BuildingStaffType`, `BuildingTotalGrossFootage`, `BuildingTotalNetSquareFootage`

### Unit / Property (core fields)
**Required:** `BathroomsFull`, `BathroomsHalf`, `BathroomsTotal`, `BedroomsTotal`, `PetsAllowed`, `PublicRemarks`, `RoomsTotal`, `ShowingInstructions`

**Conditional:** `LivingArea`, `LivingAreaUnits`, `UnitNumber`, `Basement`, `Cooling`, `Heating`, `FireplaceYN`, `FireplacesTotal`, `FireplaceFeatures`, `Furnished`, `FurnishedListPrice`, `FurnishedMaxLeaseMonths`, `FurnishedMinLeaseMonths`, `GarageSpaces`, `LeaseType`, `MinLeaseMonths`, `OpenParkingSpaces`, `PercentOfCommonElements`, `PrivateOutdoorSpaceSize`, `PropertyCondition`, `View`, `ViewRemarks`, `NumberOfShares`, `MaximumFinancingPercent`, `MaximumFinancingRemarks`, `CoOwnershipInterest`, `FlipTax`, `FlipTaxType`, `FlipTaxRemarks`, `FractionalUnitNumber`, `SpecialListingConditions`, `SponsorUnitYN`, `ShowingStartTime`, `ShowingEndTime`

### Agent / Office / Team (74 fields total)
- **ListAgent** (18): `ListAgentMlsId`(R), rest read-only system fields
- **BuyerAgent** (18): `BuyerAgentMlsId`(R), conditional fields when RLS Participant = False
- **CoBuyerAgent** (14): All conditional
- **CoListAgent** (24): 3 co-list agent slots, mostly read-only

### Tax (10 fields)
**Required:** `TaxBlock`
**Conditional:** `TaxLot`, `TaxAnnualAmount`, `TaxMonthlyAmount`, `TaxAbatementYN`, `TaxAbatementExpirationYear`, `TaxAbatementComments`

### Financial / Expenses (22 fields)
All optional. Used for investment property analysis: `CapRate`, `NetOperatingIncome`, `OperatingExpense`, plus 19 individual expense categories.

### Association / HOA (7 fields)
**Conditional:** `AssociationFee` (required for Condo/Co-op/Condop), `AssociationFeeFrequency`

### Media (17 fields)
Mostly read-only system counts. Editable: `VirtualTourURLBranded`, `VirtualTourURLUnbranded` (x3), `DocumentsAvailable`

### Green / Sustainability (8 fields)
All optional: `GreenBuildingYN`, `GreenBuildingVerificationType`, `GreenEnergyEfficient`, `GreenEnergyGeneration`, `GreenIndoorAirQuality`, `GreenLocation`, `GreenSustainability`, `GreenWaterConservation`

### Land / Lot (10 fields)
**Conditional:** `LotSizeArea`, `LotSizeDimensions`, `LotSizeUnits` (for applicable property types)

---

## Removed Fields (Aug 2025 — NAR Settlement)

These fields were **permanently removed** from the RLS feed and must NEVER appear in any form, search, or display:

| Field | Removed Date | Reason |
|-------|-------------|--------|
| `BuyerAgencyCompensation` | Aug 1, 2025 | NAR Settlement |
| `BuyerAgencyCompensationType` | Aug 1, 2025 | NAR Settlement |
| `SubAgencyCompensation` | Aug 1, 2025 | NAR Settlement |
| `SubAgencyCompensationType` | Aug 1, 2025 | NAR Settlement |
| All related compensation offer fields | Aug 1, 2025 | NAR Settlement |

---

## Machine-Readable Reference

- **`fields.json`** — All 902 IDX Plus fields with required/conditional/optional, editable, searchable, category, and RESO→RLS mapping
- **`lookups.json`** — All 114 picklist fields with 1,993 official REBNY-approved values

Import in Next.js:
```typescript
import fields from '@/compliance/fields.json';
import lookups from '@/compliance/lookups.json';

// Check if field is required
if (fields.fields['BedroomsTotal'].required === 'mandatory') { ... }

// Validate picklist value
const validCities = lookups.lookups['PostalCity'].values.map(v => v.value);
if (!validCities.includes(userInput)) { reject(); }
```
