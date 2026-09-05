# LIVE COTALITY API — SYSTEM STUDY (dated evidence, 2026-09-05)

**Evidence class:** dated live observation. Every statement below came from an HTTP response received from `api.cotality.com` on 2026-09-05 via `scripts/cotality/query-live.mjs`. This document is **evidence, not authority**: re-run the query before relying on any value. It contains no mapping decisions.

Naming: the provider is the **Cotality API**. Raw string values returned by the provider (for example `OriginatingSystemName`, `SourceSystemID`, `RESOStandardYN` as a column name) are reproduced exactly as returned and are not used as Mallan terminology.

---

## 1. What the licence serves

`service` → 18 entity sets: Property, Office, Member, Media, OpenHouse, CustomProperty, PropertyRooms, PropertyUnitTypes, Teams, TeamMembers, Field, Lookup, Model, PropertyGreenVerification, Building, HistoryTransactional, DataSystem, Enumeration.

`census` ($metadata) → 17 resources, 1,456 fields, 181 enums, 31 navigations.

| Resource | Declared fields | Navigations from it |
|---|---|---|
| Property | 757 | Media, OpenHouse, ListAgent/CoListAgent/BuyerAgent/CoBuyerAgent → Member, ListOffice/CoListOffice/BuyerOffice/CoBuyerOffice → Office, CustomProperty, Rooms → PropertyRooms, UnitTypes → PropertyUnitTypes, Building |
| Media | 56 | Property |
| OpenHouse | 47 | Property |
| CustomProperty | 142 | Property |
| PropertyRooms | 39 | Property |
| PropertyUnitTypes | 52 | Property |
| Office | 80 | Media, four Property navigations |
| Member | 91 | Media, four Property navigations |
| Field | 15 | — |
| Lookup | 15 | — |
| Model | 8 | — |
| DataSystem | — | — |
| Building | **1** | Media, Property |
| Enumeration | 8 declared | `query --resource=Enumeration` → **HTTP 404 "Page not found"** (UNVERIFIED as a queryable set) |

`DataSystem` (live): ID `Trestle-11371-20`, Name `IDX Plus feed for Mallan Real Estate Inc`, ServiceURI `https://api.cotality.com/trestle/odata`, DataDictionaryVersion `2.0`, TransportVersion `1.0.0`.

---

## 2. How the provider types a field (its own vocabulary)

`page --resource=Field --filter="ResourceName eq 'Property'"` → 810 Field rows, complete.

| Provider `Type` | Count |
|---|---|
| String | 342 |
| Number | 174 |
| String List, Multi | **101** |
| String List, Single | 92 |
| Boolean | 52 |
| Date | 19 |
| Timestamp | 18 |
| DateTime | 11 |
| GeographyPoint | 1 |

$metadata agrees on the enum split: **81 single-value enums, 100 multi-value enums** on Property.

**Multi-value fields are the "subsections":** a single field carries a set of tokens. Live multi-value Property fields include, among the 100: AccessibilityFeatures, Appliances, ArchitecturalStyle, AssociationAmenities, AssociationFeeIncludes, AvailableLeaseType, Basement, BuildingFeatures, CommonWalls, CommunityFeatures, ConstructionMaterials, Cooling, CurrentFinancing, DevelopmentStatus, Disclosures, Electric, ExistingLeaseType, Exposures, ExteriorFeatures, FireplaceFeatures, Flooring, Heating, InteriorFeatures, LaundryFeatures, LeaseTermOptions, Levels, ListingTerms, LotFeatures, **MoveInCosts, OngoingFees, OwnerPays, TenantPays, RentIncludes**, ParkingFeatures, PatioAndPorchFeatures, **Permission**, PetsAllowed, PoolFeatures, PropertyCondition, PropertySubTypeAdditional, Roof, RoomType, SecurityFeatures, ShowingRequirements, SpecialListingConditions, StructureType, **SyndicateTo**, Utilities, View, WaterfrontFeatures, WindowFeatures.

Single-value enums relevant to search include: StandardStatus, PreviousStandardStatus, MlsStatus, PropertyType, PropertySubType, CommonInterest, OwnershipType, Furnished, LeaseTerm, LeaseAmountFrequency, OccupantType, SaleOrLeaseIndicator, ListingAgreement, DirectionFaces, StreetDirPrefix/Suffix, StreetSuffix, StateOrProvince, Country.

---

## 3. The provider's mapping rule between a field and its members

**Field → LookupName.** 243 of the 810 Property fields carry a `LookupName`. For 61 of them the lookup name differs from the field name, i.e. several fields share one member list. Live examples: `ListAOR`, `ListAgentAOR`, `ListOfficeAOR`, `BuyerAgentAOR`… → `AOR`; `Permission` → `ListingPermission`; `InteriorFeatures` → `InteriorOrRoomFeatures`; `AvailableLeaseType` → `ExistingLeaseType`; `LeaseTermOptions` → `LeaseTerm`; `PreviousStandardStatus` → `StandardStatus`; `*AreaUnits` → `AreaUnits`; `*AreaSource` → `AreaSource`; `*Frequency` → `FeeFrequency`; `*CompensationType` → `CompensationType`; `StreetDirPrefix`/`StreetDirSuffix` → `StreetDirection`; `PossibleUse` → `CurrentOrPossibleUse`; `MajorChangeType` → `ChangeType`.

Consequence: a criterion must be resolved **field → LookupName → Lookup rows**, never by assuming the lookup is named after the field.

**Lookup row columns (live):** `ModelKey, SystemReferences, ResourceName, SystemReferenceCount, LookupKey, OdataOverride, LookupName, Definition, RESOStandardYN, LegacyODataValue, ModificationTimestamp, FieldName, StandardLookupValue, FieldKey, LookupValue`.

Observed relationship between the value columns:

| Column | What it held, live |
|---|---|
| `LookupValue` | the token used in `$filter` / payloads (e.g. `StockCooperative`, `TreesWoods`) |
| `LegacyODataValue` | equal to `LookupValue` in every sampled row |
| `StandardLookupValue` | the display form (e.g. `Stock Cooperative`, `Trees/Woods`, `Mountain(s)`, `Room(s) For Rent`) |
| `OdataOverride` | `null` on every Property lookup row sampled; a non-null value appeared only on `Country` rows (`NE`, `NC`, `NA`) |
| `SystemReferenceCount` | how many source systems reference the member; **0** is possible (e.g. View `Skyline`, `Greenbelt`) and does not mean absent from this feed |

Live members: `CommonInterest` = 13 rows (Timeshare, StockCooperative, PlannedDevelopment, Other, None, Leasehold, Freehold, CoOwnership, Condop, Condominium, CommunityApartment, BareLandCondominium, RentalBuilding). `PropertySubType` = 76 Lookup rows against 75 $metadata members. `View` = 85 rows.

Rule of use: **execute with `LookupValue`; render with `StandardLookupValue`; never hand-type either.**

---

## 4. Property subsections: CustomProperty and its nested `CustomFields`

`CustomProperty` is a separate resource, joined by `ListingKey`, with 142 declared fields of which ~20 were non-null on a live sale row. Its **`CustomFields` column is a JSON string** containing a nested object; values inside are **strings** (booleans as `"1"`/`"0"`, numbers as `"74.00"`, multi tokens comma-joined such as `"DoormanFullTime,ConciergeFullTime"`).

`$filter=... and CustomFields ne null` is **SUPPORTED** (count 6,670 on the active sale universe). Keys inside the JSON are **not** addressable by `$filter`.

Nested keys observed on 200 live active sale rows (all 200 carried the JSON):

| Key | non-empty / 200 |
|---|---|
| ElevatorsTotal, BuildingTaxLot, TaxAbatementYN, AttendanceType, ListingKey | 200 |
| SponsorUnitYN | 199 |
| FlipTax | 193 · MaximumFinancingPercent 191 · PercentOfCommonElements 188 · MaximumFinancingRemarks 186 |
| TaxMonthlyAmount | 159 · FlipTaxRemarks 138 · LandmarkStatusYN 138 · CertificateOfOccupancyYN 124 · ViewRemarks 117 · TaxDeductionPercent 108 |
| CapitalReservesYN 86 · PrivateOutdoorSpaceSize 80 · UnitLine 79 · FlipTaxType 74 · FurnishedListPrice 52 · KitchenCondition 46 · BathroomCondition 33 | |
| BuildingRules, ClosetsTotal, TaxDeductionAmount, MaximumFinancingAmount 25 · BuildingStaffType 22 · BuildingSmokeFreeYN 21 · TaxDeductionRemarks 18 · CommercialUnitsYN, GuarantorsAcceptedYN 12 · BuildingParkingTotal 6 · TaxAbatementComments, TaxAbatementExpirationYear 4 · FurnishedMin/MaxLeaseMonths, CeilingHeightFeet/Inches 3 · ComingSoonTimestamp 2 · SpecialAssessmentExpirationDateTime 1 | |

Nested keys on 200 live active **lease** rows (921 lease CustomProperty rows exist): ElevatorsTotal, **MaxLeaseMonths**, TaxAbatementYN, BuildingTaxLot, AttendanceType, ListingKey at 200; SponsorUnitYN 142; CertificateOfOccupancyYN 127; ViewRemarks 77; FlipTax 72; BuildingSmokeFreeYN 71; TaxMonthlyAmount 71; … GuarantorsAcceptedYN 45; CommercialUnitsYN 45; UnitLine 32; BuildingStaffType 21; ManagingAgencyListingYN 13; FurnishedMin/MaxLeaseMonths and FurnishedListPrice 7.

Other Property sub-resources, live: `PropertyRooms` (86 rows total; join `ListingKey`; carries RoomType, RoomLevel, RoomDimensions, RoomFeatures…), `PropertyUnitTypes` (1 row total; join `ListingKey`; carries UnitTypeBedsTotal, UnitTypeBathsTotal, UnitTypeTotalRent, UnitTypeFurnished…). Both are sparsely populated on this feed.

---

## 5. Media subsections

Media enum fields (live): ClassName, ImageOf, ListAOR, ListingPermission [multi], MediaAlteration [multi], MediaCategory, MediaClassification, MediaStatus, MediaType, Permission [multi], PropertySubType, PropertySubTypeAdditional [multi], PropertyType, ResourceName, StandardStatus, SyndicateTo [multi].

Live picklists:
- `MediaCategory`: Addendum, AerialView, AgentPhoto, BrandedVirtualTour, Disclosure, Document, FloorPlan, Map, OfficeLogo, OfficePhoto, Other, Photo, RentalDocuments, Restriction, Survey, Topography, UnbrandedVirtualTour, Video.
- `MediaType`: file-format tokens in both cases (`Jpeg`/`jpeg`, `Pdf`/`pdf`, `Mp4`/`mp4`, …).
- `MediaStatus`: Active, Deleted, Other.
- `ResourceName`: Building, Contacts, Member, Office, Property.
- `Permission` (Media): AgentOnly, ComingSoon, CompSold, DownPaymentResourceNo/Yes, FirmOnly, History, Idx, IDX, MemberInactive, Officeidxoptout, OfficeInactive, OfficeOnly, OfficeSuspended, PhotoOptedOut, Private, Public, SyndicateOptOut, Vow, VOW.
- `ImageSizeDescription`: declared as a string, **not** an enum.

Media key and structure fields (live): keys `MediaKey`, `MediaKeyNumeric`, `ResourceRecordKey`, `ResourceRecordKeyNumeric`, `ResourceRecordID`, plus `OriginatingSystem*` and `SourceSystem*` key variants; `Order`, `PreferredPhotoYN`, `ImageWidth`, `ImageHeight`, `MediaURL`, `OriginalMediaUrl`, `ShortDescription`, `LongDescription`, `MediaModificationTimestamp`, `ModificationTimestamp`, `InternetEntireListingDisplayYN`.

One live sale listing (`ListingKey 1189755039`): `$filter=ResourceRecordKey eq '1189755039'` → `@odata.count 9`: 8 × Photo/Jpeg and 1 × FloorPlan/Jpeg. **Order restarts per category** (Photo Order 1 and FloorPlan Order 1 both present). `MediaURL` pattern: `https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/<ListingKey>/…` for photos and `…/DOCUMENT-Jpeg/<ListingKey>/…` for the floor plan. `ImageSizeDescription`, `Permission` and size variants were null on these rows.

---

### 5a. Media hero, order and display flags across many listings (2026-09-05T02:31Z)

`query --resource=Media --filter="StandardStatus eq 'Active' and ResourceName eq 'Property'" --select=ResourceRecordKey,MediaCategory,Order,PreferredPhotoYN,MediaStatus,InternetEntireListingDisplayYN,Permission,ImageWidth,ImageHeight --orderby=ResourceRecordKey,Order --top=200 --count=true`

| Observation | Value |
|---|---|
| Active Property media rows, whole feed | `@odata.count` **161,482** |
| Sample of 200 rows by category | Photo 194 · FloorPlan 6 |
| `PreferredPhotoYN` | true 1 · false 19 · **null 180** — not a dependable hero marker on this feed |
| `InternetEntireListingDisplayYN` (media level) | true 200 · false 0 · null 0 in the sample; whole Media resource: non-null 1,998,097, `eq true` 1,701,619 |
| `MediaStatus` | Active 200 |
| `Permission` (media) | null 200 |
| `ImageWidth` / `ImageHeight` | populated on 0 of 200 |
| `Order` | restarts at 1 per category on 4 of the 5 multi-category listings in the sample; a photo-first hero must therefore be chosen by category, not by the lowest Order alone |

Filterability (`probeField` on Media): `PreferredPhotoYN` select/non-null/orderby/`eq true` all SUPPORTED (non-null 71,341; true 34,405 feed-wide). `InternetEntireListingDisplayYN` all SUPPORTED. `MediaCategory` select/non-null/orderby SUPPORTED; the type-operator probe used the first picklist member (`Addendum`) and returned **0 rows, a real count, not a rejection**.

## 6. OpenHouse

Live: 2,119 rows with `OpenHouseDate ≥ 2026-09-05`. One row carries 47 declared keys, 33 non-null, including `OpenHouseKey`, `OpenHouseId`, `ListingKey`, `ListingId`, `OpenHouseDate`, `OpenHouseStartTime`/`EndTime` (offset `-04:00`), `OpenHouseStatus`, `AppointmentRequiredYN`, `ShowingAgent*`, `ListOfficeMlsId`, `ListingPermission`, `InternetEntireListingDisplayYN`, `PropertyType`, `StandardStatus`. Join to Property is by `ListingKey`.

---

## 7. Identity and office columns are repeated on every sub-resource

`ListingKey`, `ListingKeyNumeric`, `ListingId`, `ListOfficeKey`, `ListOfficeMlsId`, `ListAgentKey`, `StandardStatus`, `PropertyType`, `ListingPermission`/`Permission`, `InternetEntireListingDisplayYN`, `SyndicateTo` appear on CustomProperty, PropertyRooms, PropertyUnitTypes, OpenHouse and Media rows as well as on Property. A sub-resource row can therefore be attributed and gated without a join, but each resource's field must be verified on that resource; nothing here proves that a field means the same thing across resources.

---

## 8. Not served or not queryable, as observed today

- `Building`: declares 1 field; not queried in this study (earlier in the session `GET /Building` returned 403).
- `Enumeration`: declared as an entity set; querying it returned HTTP 404.
- `ImageSizeDescription` on Media: declared, null on all returned rows.

---

## 9. Queries used (verbatim commands)

```
service
census
resource --resource=Property --type=enum|boolean|numeric|date|string
resource --resource=Media --type=enum|string|numeric|date|boolean
picklist --field=StandardStatus|PropertyType|PropertySubType --resource=Property
picklist --field=MediaCategory|MediaType|ImageSizeDescription|MediaStatus|ResourceName|Permission --resource=Media
query --resource=Field --top=3
query --resource=Field --filter="ResourceName eq 'Property' and (FieldName eq 'PropertySubType' or FieldName eq 'BathroomsTotalInteger' or FieldName eq 'CommonInterest')"
page  --resource=Field --filter="ResourceName eq 'Property'" --select=FieldName,Type,LookupName --top=1000 --max=2000
query --resource=Lookup --top=3
query --resource=Lookup --filter="LookupName eq 'StandardStatus'" --top=20
query --resource=Lookup --filter="LookupName eq 'CommonInterest' and ResourceName eq 'Property'" ...
query --resource=Lookup --filter="LookupName eq 'View' and ResourceName eq 'Property'" ...
query --resource=Lookup --filter="LookupName eq 'PropertySubType' and ResourceName eq 'Property'" ...
query --resource=Property --select=ListingKey,ListingId --filter="StandardStatus eq 'Active' and PropertyType eq 'Residential'" --top=1
query --resource=CustomProperty --filter="ListingKey eq '1189755039'"
query --resource=CustomProperty --filter="StandardStatus eq 'Active' and PropertyType eq 'Residential' and CustomFields ne null" --top=0 --count=true
query --resource=CustomProperty --filter="StandardStatus eq 'Active' and PropertyType eq 'Residential'" --select=ListingKey,CustomFields --top=200
query --resource=CustomProperty --filter="StandardStatus eq 'Active' and PropertyType eq 'ResidentialLease'" --select=ListingKey,CustomFields --top=200 --count=true
query --resource=PropertyRooms|PropertyUnitTypes --top=1 --count=true
query --resource=Model|Enumeration|DataSystem --top=3 --count=true
query --resource=Media --filter="ResourceRecordKey eq '1189755039'" --select=... --orderby=Order --top=60 --count=true
query --resource=OpenHouse --filter="OpenHouseDate ge 2026-09-05" --orderby=OpenHouseDate --top=1 --count=true
```
