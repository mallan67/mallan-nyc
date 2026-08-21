# COTALITY RESOURCE / FIELD-FAMILY COVERAGE MATRIX

**The execution artifact beneath `MALLAN-PLATFORM-MASTER-PLAN.md` and `FIELD_REGISTRY`.**
Not another audit — the map that replaces the one-field loop.

Built from live `$metadata` (mechanically extracted) **plus endpoint probes**, 2026-08-21.
Evidence: `artifacts/.cotality-live-resource-inventory.json` ·
`.cotality-resource-accessibility.json` · `.customfields-key-census.json` ·
`.classification-four-surface-census.json` · `.customfields-semantics.json` ·
`.property-type-family-census.json` · `.property-subtype-live-probe{,-2}.json`.

> **Two rules govern every row.**
>
> 1. **"Not declared in `$metadata`" ≠ "not supplied by Cotality."** It may be an observed
>    extension inside an opaque declared field — that is how 52 NYC keys stayed invisible.
> 2. **"Declared in `$metadata`" ≠ "available."** `$metadata` over-declares what the licence
>    grants. Four declared resources are **not reachable at all** (below).
>
> And a third for meaning: **a populated key name is not a proven semantic.**

> **This replaces "39 controls" as the completeness claim.** 39 was *currently reachable
> authenticated UI inputs*. Coverage is measured against provider resources and field
> families. **A family is not complete because the current form has no control for it.**

---

## PART A — RESOURCE COVERAGE (all 17 declared entity types, endpoint-probed)

| resource | declared fields | collection GET | live rows | `$expand` from Property | role |
|---|---|---|---|---|---|
| **Property** | **757** | **SUPPORTED** | 591,244 | (parent) | core — Search · Result · Workspace · CMA · Report |
| **CustomProperty** | **142** + observed blob | **SUPPORTED** | 591,286 | **3/3 payload** | NYC extension — Workspace · CMA · Report; see Part C |
| **Media** | **56** | **SUPPORTED** | **1,977,836** | **3/3 payload** | first-class — every visual surface; see Part D |
| **OpenHouse** | **47** | **SUPPORTED** | 3,162 | 1/3 payload | Search (appointment/date) · Result · Workspace |
| **Member** | 91 | **SUPPORTED** | 11,152 | ListAgent 3/3 · CoListAgent 1/3 | attribution · CRM-internal (PII-gated) |
| **Office** | 80 | **SUPPORTED** | 575 | ListOffice 3/3 | attribution · suppression identity |
| **PropertyRooms** | 39 | **SUPPORTED** | **86 rows TOTAL** | **0/3 payload** | **VERIFIED_ZERO_POPULATION_CURRENT_FEED** (effectively) |
| **PropertyUnitTypes** | 52 | **SUPPORTED** | **1 row TOTAL** | **0/3 payload** | **VERIFIED_ZERO_POPULATION_CURRENT_FEED** (effectively) |
| **HistoryTransactional** | 29 | **PROVIDER_REJECTED 400** | — | n/a | **NOT AVAILABLE TO THIS LICENCE** |
| **PropertyGreenVerification** | 39 | **PROVIDER_REJECTED 404** | — | n/a | **ENDPOINT DOES NOT EXIST** |
| **Teams** | 48 | **PROVIDER_REJECTED 400** | — | n/a | **NOT AVAILABLE TO THIS LICENCE** |
| **TeamMembers** | 29 | **PROVIDER_REJECTED 400** | — | n/a | **NOT AVAILABLE TO THIS LICENCE** |
| **Building** | **1** | **PROVIDER_REJECTED 403** | — | 0/3 payload | **NOT LICENSED** — identity must be Mallan-derived |
| `Field` | 15 | SUPPORTED | 2,246 | n/a | **provider-schema support** — no brokerage consumer |
| `Lookup` | 15 | SUPPORTED | 191,323 | n/a | **provider-schema support** — no brokerage consumer |
| `Model` | 8 | SUPPORTED | 17 | n/a | **provider-schema support** — no brokerage consumer |
| `Enumeration` | 8 | **PROVIDER_REJECTED 404** | — | n/a | **provider-schema support**, endpoint absent |

**1,456 declared fields · 185 enums (114 multi) · Property = 576 scalar / 81 enum / 100 multi-enum.**

### Four expectations this overturns

| assumption | live result |
|---|---|
| `HistoryTransactional` powers price/status history, DOM interpretation, CMA chronology, CRM timeline | **400 — "No OriginatingSystemNames available for querying given request."** Not available. History must come from another source |
| `PropertyUnitTypes` powers multifamily / building / investment analysis | **1 row in the entire feed.** Cannot power anything today |
| `PropertyRooms` is the real rooms contract beyond `RoomsTotal` | **86 rows in the entire feed.** Same |
| `PropertyGreenVerification` needs a Detail/Report classification | **404 — the endpoint does not exist.** Classified, not silently omitted |

Buyer-side navigation (`BuyerAgent` / `BuyerOffice` / `CoBuyer*`) returns 200 with 0/3
payload on Active listings, which is expected — there is no buyer yet. Re-probe on Closed
before drawing conclusions for CMA.

---

## PART B — FIELD FAMILIES

Legend for **role**: `SEARCHABLE` · `RESULT` (grid/gallery summary) · `WORKSPACE`
(detail) · `BUILDING` · `CMA` · `REPORT` · `CRM` (internal) · `COMPLIANCE` ·
`EVIDENCE` (provider identity/reconciliation only) · `UNVERIFIED`.

Legend for **state**: `VERIFIED` · `NEEDS_PROBE` · `VERIFIED_ZERO_POPULATION_CURRENT_FEED`
· `NOT_AVAILABLE` · `UNVERIFIED`.

### B1 · Identity & provenance

| fact | resource / path | kind | population | operator | role | state |
|---|---|---|---|---|---|---|
| `ListingId` | Property | scalar | 100% | `eq` | SEARCHABLE · RESULT · EVIDENCE | VERIFIED — **identity resolution, not a scalar filter** |
| `ListingKey` · `SourceSystemKey` | Property | scalar | UNVERIFIED | `eq` | EVIDENCE | UNVERIFIED |
| `SourceSystem*` / `OriginatingSystem*` | Property | scalar | Mallan-office rows: SourceSystemName 0/35 | — | **EVIDENCE only** | VERIFIED — pipeline lineage, **never authorship** |
| listing authority (local vs provider) | Mallan | derived | — | — | COMPLIANCE · EVIDENCE | VERIFIED |

### B2 · Property classification — **corrected 2026-08-21**

| fact | resource / path | kind | population (Active) | operator | role | state |
|---|---|---|---|---|---|---|
| `PropertyType` | Property | enum 13 | UNVERIFIED (census pending) | `eq` | SEARCHABLE | NEEDS_PROBE |
| `PropertySubType` | Property | **scalar** enum 75 | 8,021 non-null; 8 members carry all of it | `eq` / `in` — **`contains` is 400** | SEARCHABLE · RESULT | **VERIFIED** |
| `PropertySubTypeAdditional` | Property | **multi** enum 75 | 6,781 non-null; never disagrees with SubType | `has` | WORKSPACE | VERIFIED — **not folded into sub-type** |
| **`StructureType`** | Property | **multi** enum 23 | **7,152 non-null** | `has` | **SEARCHABLE** | **VERIFIED — sole carrier of Townhouse (610, exclusive)** |
| **Townhouse** (broker concept) | `StructureType` | — | **610** | `has` | SEARCHABLE | **VERIFIED** |
| **Multi-Family** (broker concept) | 4 surfaces | — | union **981**, none on all four | mixed | SEARCHABLE | **NEEDS_PROBE — business definition NOT made. No OR is canonical** |
| **Land** (broker concept) | 3 surfaces, 7 tokens | — | **0** on all 11 probes | — | SEARCHABLE | **VERIFIED_ZERO_POPULATION_CURRENT_FEED — capability retained** |
| `PropertyAttachedYN` | Property | bool | **null on all 610 townhouses** | — | UNVERIFIED | **cannot distinguish attached/detached** |

### B3 · Ownership & building rules

| fact | resource / path | kind | population (Active) | operator | role | state |
|---|---|---|---|---|---|---|
| **`CommonInterest`** | Property | enum 13 | **8,015 non-null** — Condominium 3,722 · StockCooperative 2,509 · None 998 · RentalBuilding 639 · Condop 147; other 8 = 0 | `eq` | **SEARCHABLE** · RESULT · WORKSPACE | **VERIFIED — the ONE canonical condo/co-op criterion** |
| `OwnershipType` | Property | enum | UNVERIFIED | — | WORKSPACE | UNVERIFIED |
| **`Restrictions`** | CustomProperty | **multi enum 106** | UNVERIFIED | `has` | WORKSPACE · SEARCHABLE? | **NEEDS_PROBE** — carries buyer/association approval, lease & sublease rules, short-term rental, pets, smoking. **A separate structured family from `CustomFields.BuildingRules` — compare, never merge by substring** |
| `BuildingRules` | CustomFields (observed) | tokens | 10.6% | Mallan-side | WORKSPACE | NEEDS_PROBE |

### B4 · Parcel / building identity (NYC)

| fact | resource / path | kind | population | role | state |
|---|---|---|---|---|---|
| `TaxBlock` | Property | scalar | **8,014 / 8,032** | SEARCHABLE? · BUILDING · WORKSPACE | NEEDS_PROBE |
| `TaxLot` · `TaxMapNumber` · `ParcelNumber` | Property | scalar | UNVERIFIED | BUILDING · WORKSPACE | UNVERIFIED |
| `CLIP` · `UniversalParcelId` · `UniversalPropertyId` · `UniversalPropertySubId` | Property | scalar | UNVERIFIED | EVIDENCE · BUILDING | UNVERIFIED |
| **`BuildingTaxLot`** | CustomFields (observed) | string | **100%** | BUILDING | NEEDS_PROBE |
| `BuildingName` | Property | string(50) | 3,903 / 8,056 (48%) | RESULT · WORKSPACE | VERIFIED — **a name, not an identity** |
| **building identity** | Mallan-derived | computed | — | BUILDING | **NEEDS_PROBE** |

> **Open contract, not a display task.** Which of these are identity INPUTS versus display
> facts, how BBL is constructed and validated, and how disagreements are resolved must be
> settled **before** Building Search groups listings. **Identity derives from the structured
> address and parcel facts — never from a coordinate.**

### B5 · Price / transaction · dates

| fact | resource | population | role | state |
|---|---|---|---|---|
| `ListPrice` · `OriginalListPrice` · `PreviousListPrice` · `ClosePrice` | Property | UNVERIFIED | SEARCHABLE · RESULT · CMA | partly VERIFIED (price filters live) |
| `ListingContractDate` · `OnMarketDate` · `CloseDate` · `ActivationDate` | Property | UNVERIFIED | SEARCHABLE · CMA | NEEDS_PROBE |
| `DaysOnMarket` · `CumulativeDaysOnMarket` | Property | UNVERIFIED | RESULT · CMA | NEEDS_PROBE |
| **price/status change history** | ~~`HistoryTransactional`~~ | — | CMA · WORKSPACE · CRM timeline | **NOT_AVAILABLE (400)** — needs another source |

### B6 · Rooms & size

| fact | resource | population | role | state |
|---|---|---|---|---|
| `BedroomsTotal` · `BathroomsFull` · `BathroomsHalf` | Property | 8,103 / 8,103 | SEARCHABLE · RESULT | VERIFIED — total is `full + half/2` |
| `LivingArea` (+ `LivingAreaUnits` SquareFeet 8,104/8,104) | Property | VERIFIED | SEARCHABLE · RESULT | VERIFIED |
| `RoomsTotal` · `StoriesTotal` · `NumberOfUnitsTotal` | Property | `NumberOfUnitsTotal` carries a **`-1` sentinel** | SEARCHABLE · WORKSPACE | NEEDS_PROBE |
| room-level detail | `PropertyRooms` | **86 rows total** | WORKSPACE | **VERIFIED_ZERO_POPULATION_CURRENT_FEED** |
| unit-type detail | `PropertyUnitTypes` | **1 row total** | BUILDING · CMA | **VERIFIED_ZERO_POPULATION_CURRENT_FEED** |
| `UnitLine` · `ClosetsTotal` · `CeilingHeightFeet/Inches/Units` | CustomFields | 38.6% · 10.5% · 4.6/4.1/0.8% | WORKSPACE | NEEDS_PROBE |
| `KitchenCondition` · `BathroomCondition` | CustomFields | 31.2% · 25.5% | WORKSPACE · REPORT | NEEDS_PROBE |
| `PrivateOutdoorSpaceSize` | CustomFields | 39.1% (`LessThan60SqFt` / `GreaterThan60SqFt`) | SEARCHABLE? · WORKSPACE | NEEDS_PROBE |

### B7 · Amenities — **UNIT and BUILDING stay separate**

The UI showing both under one "Amenities" heading is not a reason to merge them.

| fact | resource | role | state |
|---|---|---|---|
| **unit** — `InteriorFeatures` · `Appliances` · `LaundryFeatures` · `Cooling` · `Heating` · `FireplaceFeatures` · `Flooring` · `AccessibilityFeatures` | Property (multi-enums) | SEARCHABLE · WORKSPACE | partly VERIFIED |
| **building** — `BuildingFeatures` · `AssociationAmenities` · `CommunityFeatures` · `SecurityFeatures` · `PoolFeatures` · `ExteriorFeatures` · `ParkingFeatures` | Property (multi-enums) | SEARCHABLE · WORKSPACE · BUILDING | partly VERIFIED |
| `PetsAllowed` | Property | multi-enum, unit vs building tokens | SEARCHABLE | VERIFIED — exact-token, never substring |
| `GarageYN` · `FireplaceYN` · `NewConstructionYN` | Property | 2,630 / 861 / 951 | SEARCHABLE | VERIFIED |

### B8 · Building service & staff — **observed extension**

| fact | path | population | role | state |
|---|---|---|---|---|
| **`AttendanceType`** | CustomFields | **100%** — 16 tokens, 5 roles, 4 coverage levels, 84 combinations | SEARCHABLE? · RESULT · WORKSPACE | **NEEDS_PROBE on brokerage mapping.** Vocabulary VERIFIED. **Must NOT be collapsed to "doorman" — `VideoDoorman` and `ElevatorAttendance` are different facts.** Declared amenity fields miss **67%** of `DoormanFullTime` rows |
| `BuildingStaffType` | CustomFields | 16.4% (`SuperLiveIn` · `SuperOffsite` · `ResidentManagerFullTime`) | WORKSPACE | NEEDS_PROBE — **superintendent, a different concept from lobby attendance** |
| **`ElevatorsTotal`** | CustomFields | **100%** | SEARCHABLE? · WORKSPACE | NEEDS_PROBE — registry records `ElevatorYN` as ABSENT; **this is the live fact** |
| `BuildingSmokeFreeYN` · `BuildingParkingTotal` | CustomFields | 15.8% · 2.3% | WORKSPACE | NEEDS_PROBE |

### B9 · Financing — **five distinct concepts, do not merge**

| concept | path | population (Active) | role | state |
|---|---|---|---|---|
| 1. buyer transaction financing | `BuyerFinancing` (multi 42) | **0** | CMA · EVIDENCE | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| 2. current financing on the property | `CurrentFinancing` (multi 24) | **0** | WORKSPACE | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| 3. acceptable listing terms | `ListingTerms` | **0** | WORKSPACE | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| 4. **building financing restriction** | **`MaximumFinancingPercent`** (CustomFields) | **84.9%** | **SEARCHABLE (Advanced Sale)** · WORKSPACE · BUILDING · CMA · REPORT | **NEEDS_PROBE** — see below |
| 5. concessions | `Concessions*` (9 fields) · `ConcessionInPrice*` · `SellerConsiderConcessionYN` | UNVERIFIED | CMA · WORKSPACE | UNVERIFIED |
| — | `FhaEligibility` · `DownPaymentAssistance*` | UNVERIFIED | WORKSPACE | UNVERIFIED |

**`MaximumFinancingPercent` — measured, three constraints:**
StockCooperative 2,497/2,507 with a real board-rule spread (80 → 1,192 · 75 → 483 · 50 → 194
· 90 → 156 · 70 → 82 · 65 → 50); Condominium 3,615/3,720 clustering at 90 (2,313); Condop
139/147; RentalBuilding only 242/640 and **93% of those are `0.00`**.
1. **`0.00` is a NOT-SPECIFIED SENTINEL**, not a 0% limit.
2. **LISTING-level, not building-level** — 380 of 3,402 buildings disagree.
3. Outliers `1` / `10` / `20` / `25` / `33` need review before any range filter.

### B10 · Carrying costs / co-op-condo economics

**`AssociationFee` alone is not "maintenance."** Handling must be `CommonInterest`-aware:
co-op **maintenance** and condo **common charges** are different facts with different tax
treatment.

| fact | path | population | role | state |
|---|---|---|---|---|
| `AssociationFee` (+`2`,`3`) + frequencies · `AssociationFeeIncludes` | Property | 7,261 Active | SEARCHABLE · RESULT · CMA | NEEDS_PROBE (semantics per CommonInterest) |
| `AssociationFeeTotal` · `AdditionalFee` + freq · `ApplicationFee` | CustomProperty | UNVERIFIED | WORKSPACE | UNVERIFIED |
| `TaxAnnualAmount` · `TaxAssessedValue` · `TaxOtherAnnualAssessmentAmount` · `TaxYear` | Property | 3,316 Active (`TaxAnnualAmount`) | SEARCHABLE? · WORKSPACE · CMA | NEEDS_PROBE |
| `TaxMonthlyAmount` · `TaxAbatementYN` (+comments/expiry) · `TaxDeductionPercent/Amount/Remarks` | CustomFields | 72.2% · 99.9% · 59.3% | WORKSPACE · CMA · REPORT | NEEDS_PROBE |
| `FlipTax` · `FlipTaxType` · `FlipTaxRemarks` | CustomFields | 89% · 29.6% · 65.4% | WORKSPACE · CMA · REPORT | NEEDS_PROBE |
| `PercentOfCommonElements` | CustomFields | 86% | WORKSPACE · CMA | NEEDS_PROBE |
| `CapitalReservesYN` · `CapitalReservesTotal` · `SpecialAssessmentExpirationDateTime` | CustomFields | 55.2% · 0.7% · 0.2% | WORKSPACE | NEEDS_PROBE |
| `LandmarkStatusYN` · `CertificateOfOccupancyYN` | CustomFields | 71% · 74.3% | WORKSPACE | NEEDS_PROBE |
| investment set — `GrossIncome` · `NetOperatingIncome` · `OperatingExpense(Includes)` · `TotalActualRent` · `RentControlYN` · `VacancyAllowance(Rate)` · 17 expense lines | Property | **UNVERIFIED — census required** | CMA · REPORT · WORKSPACE | UNVERIFIED |
| `AreaOverFAR` · `AreaUnderFAR` · `RoofRightsYN` | CustomFields | 0.1% · 0.1% · ~0% | WORKSPACE (development rights) | NEEDS_PROBE |

### B11 · Rental — **its own criteria contract, not Sale with fields bolted on**

| fact | path | population | role | state |
|---|---|---|---|---|
| `LeaseAmount` + `LeaseAmountFrequency` · `AvailabilityDate` · `AvailableLeaseType` · `ExistingLeaseType` | Property | UNVERIFIED | SEARCHABLE · RESULT | NEEDS_PROBE |
| `Furnished` | Property | 5 live members (Furnished 106 · Unfurnished 2,876 · Negotiable 12 · Partially 4) | SEARCHABLE | VERIFIED — **not a boolean** |
| `RentIncludes` · `TenantPays(Description)` · `MoveInCosts` · `OngoingFees` · `SecurityDeposit` · `PetDeposit` | Property | UNVERIFIED | SEARCHABLE? · WORKSPACE | UNVERIFIED |
| `MaxLeaseMonths` · `FurnishedMin/MaxLeaseMonths` · `FurnishedListPrice` · `GuarantorsAcceptedYN` · `LastMonthRentReqYN` · `SecurityDepositYN/Description` | CustomFields / CustomProperty | 12.7% · 1.9% · 17.5% · 8.1% | SEARCHABLE? · WORKSPACE | NEEDS_PROBE |
| achieved rent | `TotalActualRent` / `LeaseAmount` | UNVERIFIED | CMA | UNVERIFIED |

### B12 · Open House — **a resource contract, not a date checkbox**

47 declared fields, 3,162 live rows, `$expand` works.

| fact | role | state |
|---|---|---|
| **`AppointmentRequiredYN`** | SEARCHABLE · RESULT | **NEEDS_PROBE — this is the "by appointment" behaviour** |
| `OpenHouseType` · `OpenHouseStatus` | SEARCHABLE · RESULT | NEEDS_PROBE |
| date · `OpenHouseStartTime` · `OpenHouseEndTime` | SEARCHABLE · RESULT · WORKSPACE | NEEDS_PROBE — currently applied **post-pagination** (known defect) |
| livestream URL · remarks · `OpenHouseAttendedBy` / showing agent | WORKSPACE · CRM | NEEDS_PROBE |
| its own `Permission` / display flags | **COMPLIANCE** | NEEDS_PROBE |

### B13 · Documents & disclosures — **assembled family, no single resource**

| fact | path | role | state |
|---|---|---|---|
| `DocumentsAvailable` · `DocumentsCount` · `Disclosures` | Property | WORKSPACE · COMPLIANCE | UNVERIFIED |
| Media categories `Document` · `Disclosure` · `Addendum` · `RentalDocuments` · `Restriction` · `Survey` | Media | WORKSPACE · COMPLIANCE | UNVERIFIED |
| `PrivateRemarks` · `PrivateOfficeRemarks` · `PrivateShowingInstructions` | Property / CustomProperty | **CRM-INTERNAL ONLY** | **COMPLIANCE — must never reach client/public surfaces** |

### B14 · Agent / office / team

| fact | resource | live | role | state |
|---|---|---|---|---|
| `ListAgent*` · `CoListAgent*` | Property + Member | 11,152 members; expand 3/3 | attribution · CRM | VERIFIED (access) — **PII boundaries NEEDS_PROBE** |
| `ListOffice*` (incl. `ListOfficeMlsId`) | Property + Office | 575 offices | attribution · **suppression identity** | VERIFIED |
| Teams / TeamMembers | Teams · TeamMembers | **400 — not available** | CRM-internal | **NOT_AVAILABLE** |

### B15 · Permissions & attribution — **per-resource, not Property-only**

| fact | role | state |
|---|---|---|
| `Permission` / `ListingPermission` (multi-enum, 20 members; no `OwnerOptOut` member) | COMPLIANCE | VERIFIED |
| `InternetEntireListingDisplayYN` · `InternetAddressDisplayYN` | COMPLIANCE | VERIFIED — REBNY pre-filtered; **null ≠ suppressed** |
| `SyndicateTo` · copyright / disclaimer obligations | COMPLIANCE | UNVERIFIED |
| **per-resource permissions on Media / OpenHouse / CustomProperty** | COMPLIANCE | **NEEDS_PROBE — the parent Property permission does NOT automatically authorise a related row** |

---

## PART C — THE OBSERVED EXTENSION FAMILY (`CustomProperty.CustomFields`)

**Model:** resource `CustomProperty` → **declared** field `CustomFields` → declared type
`Edm.String` → observed encoding JSON object → **observed extension key**.

**Census: 8,010 / 8,010 Active rows, 0 null, 0 unparsable, 52 distinct keys.**

**CAPABILITY CONSTRAINT — `$filter` cannot reach inside an `Edm.String`.** None of the 52 is
provider-filterable. Each must be read via `$expand=CustomProperty` and matched
Mallan-side, or derived onto the projection at build time the way `amenity_keys` already
is.

**Semantic state: 2 of 52 studied.** `MaximumFinancingPercent` and `AttendanceType` have
distribution + correlation evidence (B8, B9). **The other 50 are presence-proven only** —
population is not meaning. Each needs: key · population · missing rate · parse success ·
value types · value vocabulary/range · listing classes present · semantic evidence ·
authoritative path · storage path · filter strategy · display role · compliance exposure ·
state.

**High-value keys awaiting a semantic contract:** `ElevatorsTotal` (100%) ·
`BuildingTaxLot` (100%) · `TaxAbatementYN` (99.9%) · `SponsorUnitYN` (97%) · `FlipTax`
family (89%) · `PercentOfCommonElements` (86%) · `CertificateOfOccupancyYN` (74.3%) ·
`TaxMonthlyAmount` (72.2%) · `LandmarkStatusYN` (71%) · `ViewRemarks` (61%) ·
`TaxDeduction*` (59.3%) · `CapitalReserves*` (55.2%) · `PrivateOutdoorSpaceSize` (39.1%) ·
`UnitLine` (38.6%) · `Kitchen/BathroomCondition` · `FurnishedListPrice` (17.5%) ·
`BuildingStaffType` · `BuildingSmokeFreeYN` · `MaxLeaseMonths` · `BuildingRules` ·
`ClosetsTotal` · `GuarantorsAcceptedYN` · `CommercialUnitsYN` · `CeilingHeight*` ·
`BuildingParkingTotal` · `NumberOfProfessionalUnitsTotal` · `ManagingAgencyListingYN` ·
`ArchitectName` · `SpecialAssessmentExpirationDateTime` · `AreaOver/UnderFAR` ·
`RoofRightsYN`.

---

## PART D — MEDIA (56 fields, 1,977,836 live rows)

The registry still carries **one** broad `media` row. That is not a contract.

| group | fields | role |
|---|---|---|
| identity | `MediaKey` · `MediaKeyNumeric` · **`ResourceRecordKey`** · `ResourceRecordID` · `ResourceRecordKeyNumeric` | EVIDENCE — **key on `ResourceRecordKey`, never `ResourceRecordID`** |
| classification | **`MediaCategory` · `MediaClassification` · `MediaType`** | RESULT · WORKSPACE — **three DIFFERENT fields; never collapse** |
| lifecycle | `MediaStatus` · timestamps · provider lineage | COMPLIANCE · EVIDENCE |
| ordering | `Order` · **`PreferredPhotoYN`** | RESULT (hero selection) |
| payload | `MediaURL` · `OriginalMediaUrl` · `MediaHTML` · `ImageWidth` · `ImageHeight` · `ImageOf` | every visual surface |
| description | `ShortDescription` · `LongDescription` | WORKSPACE · REPORT |
| permissions | `Permission` · `ListingPermission` · `InternetEntireListingDisplayYN` · `SyndicateTo` | **COMPLIANCE — its own gate** |

**Consumers to trace end-to-end:** search hero → gallery → floor plans → video → tours/3D →
listing detail → Building workspace → CMA → Reports → client portal → marketing → public
publication.

**Identity rule:** listing identity resolves FIRST, media follows canonical listing
identity. A suppressed Mallan-office representation never becomes a second gallery or hero.

---

## PART E — DEFECT REGISTER

| # | defect | evidence | state |
|---|---|---|---|
| D1 | `/api/idx/search` never sets `expandCustomProperty` → `CustomProperty` never expanded on the Search path | storage trace | **OPEN — blocks all 52 keys** |
| D2 | `crm-idx-mapper` accepts `true\|"true"\|"Yes"\|1`; live values are the **strings** `"1"`/`"0"` → `sponsorUnit` is `null` twice over | live sample | **OPEN** |
| D3 | `raw-data-keep-fields.ts` does not list `CustomProperty` → the blob is not preserved | storage trace | **OPEN** |
| D4 | Open House applied **post-pagination** | prior analysis §4 D1 | OPEN |
| D5 | `NumberOfUnitsTotal` carries a `-1` sentinel (64 of 610 townhouses) | census | OPEN |
| D6 | `MaximumFinancingPercent` `0.00` sentinel; 380/3,402 buildings disagree | census | OPEN |
| D7 | Registry records `ElevatorYN` / `DoormanYN` ABSENT while `ElevatorsTotal` and `AttendanceType` are 100% live in CustomFields | census | OPEN |
| D8 | In-code comment says CustomFields carries **41** keys; live says **52** | census | OPEN |
| D9 | `/api/idx/search` is provider-only while Mallan local listings are canonical — **the structural conflict none of this resolves** | prior | **OPEN — the real blocker** |

---

## PART F — ORDER OF WORK

**Nothing is implemented until the family it belongs to has a consumer decision.**

1. **Close D1–D3** — the CustomProperty storage path, end to end: provider fetch → expand →
   preserve in existing Mallan JSON → reload → mapper → projection/workspace. **No schema
   change**; exhaust the existing canonical JSON first. Fix `SponsorUnit` `"1"`/`"0"` as
   part of that family.
2. **Semantic contracts for the remaining 50 CustomFields keys**, highest population first.
3. **Business definitions**: Multi-Family · `Restrictions` vs `BuildingRules` · parcel/BBL
   identity · co-op vs condo carrying costs.
4. **UI re-pointing** — Townhouse → `StructureType`; Condo/Co-op → `CommonInterest`; Land
   retained as zero-population. **Multi-Family waits for its business definition.**
5. Then the bounded groups: identity → Sale → Rental → parcel/building → amenities/rules →
   financial/financing → OpenHouse → Media → workspace/result/report hydration.
6. **`listingId` identity resolution** — next in the identity queue, but not ahead of this map.

### Completion criteria that are NOT "the filter works"

- **One authenticated hydration contract.** ONE hydrated listing object carrying property,
  building/parcel, costs, financing, amenities, rooms, unit types, OpenHouse, Media,
  documents, office/agent and verified CustomFields. Without it every screen re-implements
  its own missing pieces.
- **The workspace is proven visually.** Open one listing and verify an agent sees every
  applicable section in one place — not that the data exists somewhere in JSON.
- **Saved Search round-trips the expanded criteria.** Save → reload → restore → edit → save
  → reload must preserve Townhouse, building rules, financing, amenities, parcel and rental
  terms, or Basic/Advanced state loss returns through Saved Searches.
- **CMA and Reports have explicit consumption mapping** — which verified facts become CMA
  criteria, which become subject/comparable detail, which appear in the premium report — so
  they are not rediscovered inside a separate CMA engine.

**No production Neon · no schema/migration/backfill · public consumer Search zero-delta.**
