# SEARCH CHECKPOINT — LIVE COTALITY INDEPENDENT VERIFICATION (IV) — 2026-09-05

**Source of truth for every number below:** HTTP responses received from `https://api.cotality.com/trestle` during this run
(run window ≈ 2026-09-04 late UTC → 2026-09-05T02:52:57Z), obtained by executing
`node scripts/cotality/query-live.mjs <command> …`. No repository file, snapshot, CSV, metadata file, documentation,
prior audit or scratchpad report was read. The query tool's source was not opened. No sub-agents.
Raw stdout of every command is preserved under `scratchpad/audit/raw/` (paths cited per section).

**Outcome vocabulary (never collapsed):** SUPPORTED = HTTP 2xx · PROVIDER_REJECTED = 400/403/404/405/422 with the provider's
message quoted · UNVERIFIED = call failed / timed out / ambiguous. A `0` count below is always a genuine `"@odata.count": 0`
received on HTTP 200 — every failed call is listed as PROVIDER_REJECTED or UNVERIFIED, never as 0/null/[].

**Live drift notice.** The corpus moved during the run: sale universe 6639 → 6638, rental universe 916 → 918, Active 7555 → 7556,
total corpus 591531 → 591533. Each count is reported with the value the provider returned at the moment of that query.

---

## 1. Universe definitions

### 1.1 Live picklists (verbatim, `picklist --field=… --resource=Property`)

`Property.StandardStatus` — rawType `Cotality.DataStandard.RESO.DD.Enums.StandardStatus`, nullable true, multiEnum false, 11 members:
`Active, ActiveUnderContract, Canceled, Closed, ComingSoon, Delete, Expired, Hold, Incomplete, Pending, Withdrawn`

`Property.PropertyType` — rawType `Cotality.DataStandard.RESO.DD.Enums.PropertyType`, nullable true, multiEnum false, 13 members:
`BusinessOpportunity, CommercialLease, CommercialSale, DisasterReliefRental, Farm, HighRise, Land, ManufacturedInPark, MultiFamily, Residential, ResidentialIncome, ResidentialLease, Specialty`

### 1.2 Count per StandardStatus member — NO status filter (grounds "active")

| `$filter` | `@odata.count` |
|---|---|
| (none) | 591531 (later re-read by probeField as 591533) |
| `StandardStatus eq 'Active'` | 7555 (re-read at end of run: 7556) |
| `StandardStatus eq 'ActiveUnderContract'` | 0 |
| `StandardStatus eq 'Canceled'` | 0 |
| `StandardStatus eq 'Closed'` | 578373 |
| `StandardStatus eq 'ComingSoon'` | 6 |
| `StandardStatus eq 'Delete'` | 0 |
| `StandardStatus eq 'Expired'` | 0 |
| `StandardStatus eq 'Hold'` | 0 |
| `StandardStatus eq 'Incomplete'` | 0 |
| `StandardStatus eq 'Pending'` | 5597 |
| `StandardStatus eq 'Withdrawn'` | 0 |
| `StandardStatus eq null` | 0 |

Sum of populated members 7555 + 578373 + 6 + 5597 = 591531 = unfiltered total. Only 4 of 11 declared members are populated.

### 1.3 Count per PropertyType member under `StandardStatus eq 'Active'`

| `$filter` | `@odata.count` |
|---|---|
| `StandardStatus eq 'Active' and PropertyType eq 'Residential'` | **6639** (drifted to 6638 during run) |
| `StandardStatus eq 'Active' and PropertyType eq 'ResidentialLease'` | **916** (drifted to 918 during run) |
| every other member (BusinessOpportunity, CommercialLease, CommercialSale, DisasterReliefRental, Farm, HighRise, Land, ManufacturedInPark, MultiFamily, ResidentialIncome, Specialty) | 0 each |
| `PropertyType eq null` (whole corpus) | 0 |

6639 + 916 = 7555 = Active. Only two PropertyType tokens exist under Active; the universe choice is forced by data, not by name.

### 1.4 Universes used below

- **SALE** = `StandardStatus eq 'Active' and PropertyType eq 'Residential'` → **6638** (final re-read 2026-09-05T02:52Z; 6639 at start)
- **RENTAL** = `StandardStatus eq 'Active' and PropertyType eq 'ResidentialLease'` → **918** (final re-read; 916 at start)

---

## 2. Evidence tables

Column key: **Mallan criterion | resource.field | live type / nullable | live values or population (exact query) | filter / orderby states | semantic verdict**.
Verdicts are OBSERVED / NEEDS_PROBE / NOT_POPULATED / NOT_AUTHORIZED / UNVERIFIED and describe only what the data shows.

### A. StandardStatus (raw: 01-picklist-StandardStatus.json, 03-status-counts.txt, probe/StandardStatus.json)

| Criterion | Field | Type / nullable | Population | Filter / orderby | Verdict |
|---|---|---|---|---|---|
| Sale status / Rental status | Property.StandardStatus | Enums.StandardStatus, nullable true, single | See §1.2. Active 7555; Closed 578373; Pending 5597; ComingSoon 6; all other 7 members 0; null 0 | probeField: select SUPPORTED(200) · filter_non_null SUPPORTED(200) count=591533 · orderby SUPPORTED(200) · type_operator SUPPORTED(200) count=7556. My explicit `eq '<member>'` on all 11 members: SUPPORTED(200) | OBSERVED — 'Active' is the only currently-marketed status token with population |

### B. PropertyType (raw: 02-picklist-PropertyType.json, 04-proptype-active-counts.txt, probe/PropertyType.json)

| Criterion | Field | Type / nullable | Population (Active) | Filter / orderby | Verdict |
|---|---|---|---|---|---|
| Basic property type (sale vs lease split) | Property.PropertyType | Enums.PropertyType, nullable true, single | Residential 6639; ResidentialLease 916; the other 11 members 0; null 0 (§1.3) | probeField: select SUPPORTED · filter_non_null SUPPORTED count=591533 · orderby SUPPORTED · type_operator SUPPORTED count=0 (the tool's own operator probe matched 0 rows; my `eq 'Residential'` / `eq 'ResidentialLease'` returned 6639 / 916, SUPPORTED) | OBSERVED — on this feed PropertyType carries only the sale/lease split, not building form |

### C. PropertySubType (raw: 07-picklist-PropertySubType.json, 08-propsubtype-counts.txt)

Picklist verbatim (**size 75**, single-enum, rawType `Cotality.DataStandard.RESO.DD.Enums.PropertySubType`):
`Acreage, Agriculture, Apartment, Attached, BoatSlip, Building, BuildingBusiness, BuildingLand, BuildingLandBusiness, Business, BusinessLand, Cabin, Chalet, Cluster, Commercial, Condominium, CoOwnership, DeededParking, Detached, Dockominium, Duplex, Earthship, Farm, FlexibleSpace, Fractional, Garage, HalfDuplex, HotelMotel, ImprovedLand, Industrial, Institutional, Investment, Land, LiveWork, Loft, ManufacturedHome, ManufacturedOnLand, MiningClaim, MixedUse, MobileHome, MobileHomePark, ModularHome, MultiFamily, MultipleParcels, NewHomeCommunity, NewHomePlan, NewHomeSpecHome, NoLand, Office, Other, OwnYourOwn, ParkModel, Quadruplex, Ranch, Recreation, Residential, Retail, RoomingHouse, RoomsForRent, SemiDetached, SingleFamilyResidence, SitePlanned, SpecialPurpose, StockCooperative, Studio, TenancyInCommon, Timeshare, ToBeBuilt, Townhouse, Triplex, TwoApartment, UnimprovedLand, Villa, Warehouse, WaterPositionWithLand`

Populated members (all 75 were counted with `<UNIVERSE> and PropertySubType eq '<member>'`; every member not listed returned 0 on both universes):

| Member | SALE count | RENTAL count |
|---|---|---|
| Apartment | 5432 | 814 |
| MultiFamily | 380 | 23 |
| SingleFamilyResidence | 344 | 34 |
| Duplex | 291 | 29 |
| Loft | 64 | 5 |
| MixedUse | 59 | 8 |
| Triplex | 56 | 3 |
| Office | 1 | 0 |
| `PropertySubType eq null` | 12 | 0 |
| **Sum** | **6639** | **916** |
| Condominium | **0** | **0** |
| StockCooperative | **0** | **0** |
| Townhouse | **0** | **0** |

| Criterion | Field | Type / nullable | Population | Filter / orderby | Verdict |
|---|---|---|---|---|---|
| Basic property type (condo / co-op / townhouse) | Property.PropertySubType | Enums.PropertySubType, nullable true, single | 8 of 75 members populated; sums reconcile exactly to each universe | probeField: select SUPPORTED · filter_non_null SUPPORTED count=591517 (16 null corpus-wide) · orderby SUPPORTED · type_operator SUPPORTED count=0. Explicit `eq '<member>'` SUPPORTED on all 75 | OBSERVED — **by counts alone, condo / co-op / townhouse distinctions do NOT live in PropertySubType on this feed**: `Condominium`, `StockCooperative`, `Townhouse` are declared but return 0 on both universes, while 5432 sale rows sit in `Apartment` |

### D. Other declared enum fields suggesting ownership / common-interest / building-form (raw: 05-fields-enum.json, 09-*.json, 09-ownership-enums.txt, 11-multienum-counts.txt, 11-sample-enums-sale.json, 20-permission-members.txt)

Candidates discovered from `resource --resource=Property --type=enum` (195 declared enum-typed names): CommonInterest, OwnershipType, StructureType, PropertySubTypeAdditional, CommonWalls, ArchitecturalStyle, Levels. Counts on SALE unless stated.

**D.1 CommonInterest** — single-enum, 13 members: `BareLandCondominium, CommunityApartment, Condominium, Condop, CoOwnership, Freehold, Leasehold, None, Other, PlannedDevelopment, RentalBuilding, StockCooperative, Timeshare`

| Member | SALE (`SALE and CommonInterest eq '<m>'`) | RENTAL |
|---|---|---|
| Condominium | 3282 | 200 |
| StockCooperative | 2350 | 52 |
| None | 844 | 128 |
| Condop | 127 | 19 |
| RentalBuilding | 35 | 519 |
| all other 8 members | 0 | 0 |
| `eq null` | 0 | 0 |
| `ne null` | 6638 | — |
| Sum | 6638 | 918 |

probeField CommonInterest: select SUPPORTED · filter_non_null SUPPORTED count=435199 (corpus) · orderby SUPPORTED · type_operator SUPPORTED count=0 (tool's own probe); my `eq` probes SUPPORTED.
Cross-tabs (SALE): `PropertySubType eq 'Apartment' and CommonInterest eq 'Condominium'` 3028 · `… eq 'StockCooperative'` 2251 · `… eq 'None'` 18.

**D.2 OwnershipType** — single-enum, 13 members: `Common, CoOwnership, Corporation, FeeSimple, Fractional, Franchise, LimitedPartnership, Llc, Partnership, Private, Reo, SeeRemarks, SoleProprietor`. Every member 0 on SALE; `OwnershipType eq null` = 6638. **NOT_POPULATED.**

**D.3 StructureType** — multi-enum, rawType `Cotality.DataStandard.RESO.DD.Enums.Multi.StructureType`, 23 members: `Apartment, Cabin, Dock, Duplex, Flex, FreeStandingBuilding, HighRise, HotelMotel, House, Industrial, LowRise, ManufacturedHouse, MidRise, MixedUse, MultiFamily, None, Office, Other, Quadruplex, Retail, Townhouse, Triplex, Warehouse`

| Member | SALE (`SALE and StructureType has Cotality.DataStandard.RESO.DD.Enums.Multi.StructureType'<m>'`) | RENTAL (`RENT and StructureType has '<m>'`) |
|---|---|---|
| HighRise | 3826 | 320 |
| None | 814 | 357 |
| MultiFamily | 619 | 75 |
| Townhouse | 518 | 40 |
| MixedUse | 247 | 8 |
| House | 117 | 15 |
| Duplex | 41 | 15 |
| Triplex | 20 | 2 |
| HotelMotel | 17 | 0 |
| Quadruplex | 6 | 0 |
| Apartment, Cabin, Dock, Flex, FreeStandingBuilding, Industrial, LowRise, ManufacturedHouse, MidRise, Office, Other, Retail, Warehouse | 0 | 0 (those probed) |
| `eq null` / `ne null` | 707 / 5931 | 103 / — |

Cross-tabs (SALE): `StructureType has 'Townhouse' and CommonInterest eq 'None'` 506 · `… eq 'Condominium'` 7 · `… eq 'StockCooperative'` 5 · `PropertySubType eq 'SingleFamilyResidence' and StructureType has 'Townhouse'` 229.
probeField: select SUPPORTED · filter_non_null SUPPORTED count=97561 · orderby SUPPORTED · type_operator PROVIDER_REJECTED(400) (see §3 R-3).

**D.4 PropertySubTypeAdditional** — multi-enum, same 75 members as PropertySubType. Counted all 75 with the `.Multi.` `has` form on SALE: Apartment 5431 · MultiFamily 73 · Loft 64 · Office 1 · all other 71 members 0 (Condominium 0, StockCooperative 0, Townhouse 0). `eq null` 1069 · `ne null` 5569. probeField type_operator PROVIDER_REJECTED(400) (§3 R-4).

**D.5 CommonWalls** — multi-enum, 6 members `EndUnit, NoCommonWalls, NoOneAbove, NoOneBelow, OneCommonWall, TwoCommonWallsOrMore`: every member 0 on SALE; `eq null` 6638. **NOT_POPULATED.**

**D.6 ArchitecturalStyle** — multi-enum, 135 members (full list in 09-picklist-ArchitecturalStyle.json). Per-member counts were **not** run (load); `ne null` 1135 / `eq null` 5503 on SALE. 200-row SALE sample (`orderby ListingKey`): null 181, Prewar 11 (7 single + 4 in multi-values), WalkUp 5, Loft 2, ContemporaryModern 1. Sparse.

**D.7 Levels** — multi-enum, 18 members. SALE per-member (`.Multi.` has form): Two 343 · One 237 · ThreeOrMore 93 · TriLevel 45 · MultiSplit 18 · OneAndOneHalf 2 · all others 0; `ne null` 738 / `eq null` 5900. probeField type_operator PROVIDER_REJECTED(400) (§3 R-5).

200-row SALE sample tallies (`--select=ArchitecturalStyle,StructureType,PropertySubTypeAdditional,CommonInterest --orderby=ListingKey --top=200`): CommonInterest → Condominium 139, StockCooperative 42, None 18, Condop 1 · StructureType → HighRise 140, None 17, Townhouse 11, MultiFamily 11, MixedUse 6, HotelMotel 6, House 2, null 7 · PropertySubTypeAdditional → Apartment 168, null 30, MultiFamily 1, Loft 1.

| Criterion | Field | Verdict |
|---|---|---|
| ownership / common-interest form | Property.CommonInterest | OBSERVED — fully populated on both universes; carries Condominium / StockCooperative / Condop / None / RentalBuilding |
| building form | Property.StructureType | OBSERVED — 5931/6638 populated; carries HighRise / Townhouse / MultiFamily / House etc.; multi-enum |
| ownership | Property.OwnershipType | NOT_POPULATED |
| walls | Property.CommonWalls | NOT_POPULATED |
| style | Property.ArchitecturalStyle | OBSERVED (sparse, 17%) |
| levels | Property.Levels | OBSERVED (sparse, 11%) |

### E. ListPrice and rent-shaped fields (raw: 06-field-decls.txt, 12-listprice-rent.txt, 12-rent-sample20.json, 22-final.txt)

| Criterion | Field | Type / nullable | Population | Filter / orderby | Verdict |
|---|---|---|---|---|---|
| Sale list price | Property.ListPrice | Edm.Decimal(14,2), nullable true | SALE `ListPrice ne null` 6638; `eq null` 0; min 9800 (`$orderby=ListPrice asc&$top=1`), max 128000000 (`desc`); `SALE and ListPrice le 0` 0 | probeField: select / filter_non_null (591533) / orderby / type_operator (591531) all SUPPORTED. Corpus-wide `ListPrice lt 0` = 2, `le 0` = 658 (none in either universe; probeField orderby-asc sample across corpus was -6000000) | OBSERVED |
| Rent | Property.ListPrice on RENTAL | same | RENTAL `ListPrice ne null` 918; `eq null` 0; min 1800, max 170000; `le 0` 0 | same | OBSERVED — see sample below |

RENTAL 20-row sample (`--select=ListingKey,ListPrice,LeaseAmount,LeaseAmountFrequency,TotalActualRent --orderby=ListingKey --top=20`) — ListPrice values in key order:
`4400, 9000, 42000, 4650, 6000, 40000, 16500, 3450, 4750, 2700, 20000, 4395, 8150, 3500, 4821, 4645, 27500, 2500, 16000, 39500`. In all 20 rows LeaseAmount, LeaseAmountFrequency and TotalActualRent were `null`.

Other rent-shaped numerics discovered from `resource --type=numeric` (166 names) — non-null count on RENTAL:

| Field | `RENT and <F> ne null` | Note |
|---|---|---|
| LeaseAmount (Edm.Decimal 14,2) | **0** | also 0 on SALE |
| TotalActualRent (Edm.Decimal 14,2) | **0** | also 0 on SALE |
| LeaseAmountFrequency (Enums.FeeFrequency; picklist: Annually, BiMonthly, BiWeekly, Daily, FullTerm, Monthly, NotApplicable, OneTime, Other, Quarterly, Seasonal, SeeAgent, SeeRemarks, SemiAnnually, SemiMonthly, Weekly) | **0** | |
| CurrentPrice | 918 | probeField all four SUPPORTED |
| OriginalListPrice | 916 | probeField all four SUPPORTED |
| PreviousListPrice | 181 | |
| SecurityDeposit | 275 | probeField all four SUPPORTED |
| MoveInCostsAmount | 23 | |
| ListPriceLow | 0 | |
| LandLeaseAmount | 0 | |
| PetDeposit | 0 | |
| ClosePrice | 0 | |

Verdict: the only universally populated price field on RENTAL is ListPrice (plus its twin CurrentPrice). No dedicated lease-amount or frequency field is populated. Whether ListPrice is a monthly figure is left to the reader; the sample values are reported as returned.

### F. BedroomsTotal (raw: 13-bedrooms.txt)

| Criterion | Field | Type / nullable | Population | Filter / orderby | Verdict |
|---|---|---|---|---|---|
| Bedrooms | Property.BedroomsTotal | Edm.Int32, nullable true | SALE ne null 6638 / null 0 / min 0 / max 45 · RENTAL ne null 918 / null 0 / min 0 / max 8 | probeField all four SUPPORTED (filter_non_null 587663 corpus) | OBSERVED |

Per-value counts (`<U> and BedroomsTotal eq N`):

| N | SALE | RENTAL |
|---|---|---|
| 0 | 647 | 151 |
| 1 | 2096 | 297 |
| 2 | 1826 | 291 |
| 3 | 933 | 129 |
| 4 | 465 | 39 |
| 5 | 248 | 7 |
| 6 | 184 | 3 |
| `gt 6` | 239 | 1 |
| sum | 6638 | 918 |

### G. Bathrooms (raw: 05-fields-all.json, 14-baths.txt, 14-bath-sample200.json)

All declared fields containing "Bath" (from `resource --type=all`, 771 names): BathroomsFull, BathroomsHalf, BathroomsOneQuarter, BathroomsPartial, BathroomsThreeQuarter, BathroomsTotalInteger, MainLevelBathrooms — all Edm.Int32 nullable true.

| Field | SALE ne null | SALE min / max | RENTAL ne null | RENTAL min / max | probeField |
|---|---|---|---|---|---|
| BathroomsFull | 6638 | 0 / 99 | 918 | 0 / 99 | all four SUPPORTED |
| BathroomsHalf | 6638 | 0 / 8 | 918 | 0 / 3 | all four SUPPORTED |
| BathroomsTotalInteger | 6623 | 0 / 100 | 918 | 1 / 100 | all four SUPPORTED |
| BathroomsOneQuarter | 29 | 0 / 0 | 3 | 0 / 0 | all four SUPPORTED |
| BathroomsThreeQuarter | 25 | 0 / 0 | 3 | 0 / 0 | all four SUPPORTED |
| BathroomsPartial | 0 | (HTTP 200, empty value set) | 0 | (200, empty) | NOT_POPULATED |
| MainLevelBathrooms | 0 | (200, empty) | 0 | (200, empty) | NOT_POPULATED |

**Joint check** — 200 SALE rows, `--select=ListingKey,BathroomsFull,BathroomsHalf,BathroomsTotalInteger,BathroomsOneQuarter,BathroomsPartial,BathroomsThreeQuarter,MainLevelBathrooms --orderby=ListingKey --top=200`:

| Condition | Rows |
|---|---|
| all three of Full/Half/Total non-null | 200 |
| Total = Full + Half **and** Total = Full (Half = 0) | 104 |
| Total = Full + Half only (Half > 0) | 84 |
| Total = Full only (Half > 0 but Total ignores it) | **0** |
| neither | **12** |
| any of the three null | 0 |
| BathroomsOneQuarter null / ThreeQuarter null / Partial null / MainLevel null | 198 / 198 / 200 / 200 |

So Total = Full + Half holds in 188/200; 12 rows satisfy neither (top tuples among them: F=4,H=2,T=5 ×3; F=7,H=2,T=8 ×3; F=5,H=2,T=6 ×3). Most frequent tuples overall: (1,0,1) 56 · (4,1,5) 24 · (2,0,2) 22 · (3,1,4) 19 · (2,1,3) 13. No conclusion drawn on which is canonical.

### H. Borough candidates (raw: 05-fields-string.json, 15-geo.txt, 15-geo-sample-SALE.json, 15-geo-sample-RENT.json, 19-rejections-verbatim.txt)

String fields discovered by `resource --type=string` (353 names) matching Area/Region/District/City/County/Borough/Neighbo/Subdivision/Town/Village/Locale/Market: City, CityRegion, ContinentRegion, CountryRegion, CountrySubdivision, CountyOrParish, ElementarySchoolDistrict, HighSchoolDistrict, MiddleOrJuniorSchoolDistrict, MLSAreaMajor, MLSAreaMinor, PostalCity, PublicSurveyTownship, StateRegion, SubdivisionName, Township.

| Field (Edm.String, maxLength) | SALE ne null | RENTAL ne null | SALE 200-row distinct values | RENTAL 200-row distinct values | probeField | Verdict |
|---|---|---|---|---|---|---|
| City (50) | 6638 | 918 | "New York City" 200 | "New York City" 200 | all four SUPPORTED | OBSERVED — constant, not a borough |
| **CityRegion (150)** | 6638 | 918 | Manhattan 167, Brooklyn 13, Queens 11, Bronx 9 | Brooklyn 93, Manhattan 91, Queens 13, Bronx 2, StatenIsland 1 | all four SUPPORTED | **OBSERVED — carries the five boroughs** |
| PostalCity (50) | 6638 | 918 | New York 167, Brooklyn 13, Queens 10, Bronx 9, Manhattan 1 | Brooklyn 90, New York 53, Manhattan 38, Queens 13, Kings 3, Bronx 2, StatenIsland 1 | all four SUPPORTED | OBSERVED — mixed vocabulary (New York / Manhattan / Kings / Brooklyn) |
| **CountyOrParish (50)** | 6638 | 918 | New York 167, Kings 13, Queens 11, Bronx 9 | Kings 93, New York 91, Queens 13, Bronx 2, Richmond 1 | all four SUPPORTED | **OBSERVED — carries the five counties** |
| CountrySubdivision | 6638 | 914 | 36061 167, 36047 13, 36081 11, 36005 9 | 36047 93, 36061 90, 36081 13, 36005 2, 36085 1, null 1 | all four SUPPORTED | OBSERVED — 5-digit codes aligned 1:1 with CountyOrParish in the samples |
| StateOrProvince (enum) | 6638 | 918 | NY 200 | NY 200 | select/filter/orderby SUPPORTED; type_operator count=0 | OBSERVED constant |
| PostalCode | 6638 | 918 | 10022 36, 10019 18, 10023 12, … | 11211 14, 10019 12, 11206 11, … | all four SUPPORTED | OBSERVED |
| MLSAreaMajor (150) | **PROVIDER_REJECTED** | PROVIDER_REJECTED | null 200 | null 200 | select SUPPORTED; filter_non_null / orderby / type_operator PROVIDER_REJECTED(400) — §3 R-1 | NOT_AUTHORIZED for filter/orderby; null in all 400 sampled rows |
| MLSAreaMinor (150) | PROVIDER_REJECTED | PROVIDER_REJECTED | null 200 | null 200 | same as MLSAreaMajor — §3 R-2 | NOT_AUTHORIZED; null in all 400 sampled rows |
| Township / StateRegion / PublicSurveyTownship | 0 | 0 | null 200 | null 200 | — | NOT_POPULATED |

Borough counts by explicit filter (both fields sum exactly to each universe):

| Value | SALE `CityRegion eq` | SALE `CountyOrParish eq` | RENTAL `CityRegion eq` | RENTAL `CountyOrParish eq` |
|---|---|---|---|---|
| Manhattan / New York | 4422 | 4422 | 474 | 474 |
| Brooklyn / Kings | 1314 | 1314 | 333 | 333 |
| Queens / Queens | 607 | 607 | 100 | 100 |
| Bronx / Bronx | 268 | 268 | 8 | 8 |
| StatenIsland / Richmond | 27 | 27 | 3 | 3 |
| sum | 6638 | 6638 | 918 | 918 |

`City eq 'New York City'`: SALE 6638, RENTAL 918.

### I. Neighborhood candidates (same raw files)

| Field | SALE ne null | RENTAL ne null | Filter / orderby | Verdict |
|---|---|---|---|---|
| **SubdivisionName (150)** | 6638 | 918 | probeField all four SUPPORTED (filter_non_null 591533 corpus; orderby sample "ASTORIA" — case variants exist corpus-wide) | **OBSERVED — carries neighborhood names** |
| MLSAreaMajor / MLSAreaMinor | PROVIDER_REJECTED | PROVIDER_REJECTED | see R-1 / R-2 | NOT_AUTHORIZED, null in samples |

SubdivisionName — 25 most frequent in the 200-row SALE sample: Midtown East 20, Financial District 15, Lincoln Square 14, Lenox Hill 14, Midtown 13, Upper West Side 12, Tribeca 8, Sutton Place 7, Lower East Side 6, Gramercy Park 6, Chelsea 6, Central Riverdale 6, Yorkville 5, Central Park South 5, Beekman 5, Battery Park City 4, Upper East Side 3, Long Island City 3, Ditmars Steinway 3, Brooklyn Heights 3, Williamsburg 2, Two Bridges 2, Murray Hill 2, Hell's Kitchen 2, Greenwich Village 2.

SubdivisionName — 25 most frequent in the 200-row RENTAL sample: Williamsburg 25, Greenpoint 9, Bushwick 9, Upper West Side 8, Midtown 7, East Harlem 7, Bedford-Stuyvesant 7, Midtown West 6, Upper East Side 5, Ridgewood 5, Lenox Hill 5, Yorkville 4, Murray Hill 4, Harlem 4, Downtown Brooklyn 4, Crown Heights 4, Carroll Gardens 4, West Village 3, Turtle Bay 3, Sutton Place 3, Stuyvesant Heights 3, Park Slope 3, Lincoln Square 3, Greenwich Village 3, Flatbush 3.

No other sampled string field carried neighborhood-like values.

### J. Filterability and orderability (raw: 21-probefield.txt, probe/*.json, 10-multienum-syntax.txt, 11-multienum-counts.txt, 19-rejections-verbatim.txt, 20-permission-members.txt)

Note: `probeField` output reports the four states and HTTP status but does not expose the literal filter string it sent; the explicit filters I ran are cited alongside.

| Field | select | filter_non_null (`<F> ne null`) | orderby (`$orderby=<F> asc/desc`) | type_operator | Explicit forms I ran |
|---|---|---|---|---|---|
| StandardStatus | SUPPORTED | SUPPORTED 591533 | SUPPORTED | SUPPORTED 7556 | `eq '<m>'` all 11 SUPPORTED |
| PropertyType | SUPPORTED | SUPPORTED 591533 | SUPPORTED | SUPPORTED (0) | `eq '<m>'` all 13 SUPPORTED |
| PropertySubType | SUPPORTED | SUPPORTED 591517 | SUPPORTED | SUPPORTED (0) | `eq '<m>'` all 75 SUPPORTED; `eq null` SUPPORTED |
| CommonInterest | SUPPORTED | SUPPORTED 435199 | SUPPORTED | SUPPORTED (0) | `eq '<m>'` all 13 SUPPORTED |
| StructureType (multi) | SUPPORTED | SUPPORTED 97561 | SUPPORTED | PROVIDER_REJECTED 400 (R-3) | `has Cotality.DataStandard.RESO.DD.Enums.Multi.StructureType'<m>'` SUPPORTED · `has '<m>'` SUPPORTED (same counts, e.g. HighRise 3826 both ways) · `eq 'HighRise'` SUPPORTED 3826 · `has Cotality.DataStandard.RESO.DD.Enums.StructureType'<m>'` (no `.Multi.`) PROVIDER_REJECTED (R-6) · `StructureType/any(s: s eq 'Apartment')` PROVIDER_REJECTED (R-7) |
| PropertySubTypeAdditional (multi) | SUPPORTED | SUPPORTED 553643 | SUPPORTED | PROVIDER_REJECTED 400 (R-4) | `.Multi.` has form SUPPORTED on all 75; `has 'Apartment'` SUPPORTED 5431 |
| Levels (multi) | SUPPORTED | SUPPORTED 5737 | SUPPORTED | PROVIDER_REJECTED 400 (R-5) | `.Multi.` has form SUPPORTED on all 18; `has 'Two'` SUPPORTED 343 |
| ListPrice / CurrentPrice | SUPPORTED | SUPPORTED 591533 | SUPPORTED | SUPPORTED 591531 | `ne null`, `eq null`, `le 0`, `lt 0`, orderby asc/desc SUPPORTED |
| OriginalListPrice / SecurityDeposit | SUPPORTED | SUPPORTED 375640 / 161505 | SUPPORTED | SUPPORTED | `ne null` SUPPORTED |
| BedroomsTotal | SUPPORTED | SUPPORTED 587663 | SUPPORTED | SUPPORTED | `eq N`, `gt 6`, orderby SUPPORTED |
| BathroomsFull / Half / TotalInteger / OneQuarter / ThreeQuarter | SUPPORTED | SUPPORTED 481408 / 409691 / 587610 / 323 / 258 | SUPPORTED | SUPPORTED | `ne null`, orderby SUPPORTED |
| City / CityRegion / CountyOrParish / SubdivisionName / PostalCode | SUPPORTED | SUPPORTED 591533 each | SUPPORTED | SUPPORTED | `eq '<value>'` SUPPORTED (borough table above) |
| PostalCity / CountrySubdivision | SUPPORTED | SUPPORTED 590990 / 591509 | SUPPORTED | SUPPORTED | `ne null` SUPPORTED |
| StateOrProvince (enum) | SUPPORTED | SUPPORTED 591530 | SUPPORTED | SUPPORTED (0) | `ne null` SUPPORTED |
| MLSAreaMajor / MLSAreaMinor | SUPPORTED (null) | PROVIDER_REJECTED 400 | PROVIDER_REJECTED 400 | PROVIDER_REJECTED 400 | R-1 / R-2 |
| ListingKey / ListingId / ListingKeyNumeric | SUPPORTED | SUPPORTED 591533 | SUPPORTED | SUPPORTED | see K |
| ListOfficeMlsId / ListOfficeName | SUPPORTED | SUPPORTED 591533 | SUPPORTED | SUPPORTED | `eq '7565'` SUPPORTED 30 |

### K. Identity fields (raw: 06-field-decls.txt, 16-identity-paging.txt)

| Field | Live type / nullable | `StandardStatus eq 'Active' and <F> ne null` | Filterable | Orderable | Keyset |
|---|---|---|---|---|---|
| ListingKey | Edm.String, maxLength 20, **nullable false** | 7556 | SUPPORTED | SUPPORTED (asc min '1091329650' corpus; '1091330901' in SALE) | `SALE and ListingKey gt '1091330901'` SUPPORTED count 6637; `…&$orderby=ListingKey&$top=1` → '1091330953'; `gt '<page1 last 1107468614>'` → '1107610023' = page-2 first |
| ListingId | Edm.String, maxLength 255, nullable true | 7556 (`ne ''` also 7556) | SUPPORTED | SUPPORTED (asc first 'RLS10903071' on Active) | not probed |
| ListingKeyNumeric | Edm.Int64, nullable true | 7556 (`gt 0` 7556) | SUPPORTED | SUPPORTED (asc first 1091330901) | not probed |

Sample row: `{"ListingKeyNumeric":1091330901,"ListingId":"RLS10992949","ListingKey":"1091330901"}` — ListingKey and ListingKeyNumeric carry the same digits on every observed row.

### L. Pagination contract (raw: 16-page1.json, 16-page2.json, 16-rent-walk.json)

`SALE` with `--select=ListingKey,ListingId,ListingKeyNumeric --orderby=ListingKey --top=200 --count=true`:

| Check | Result |
|---|---|
| `@odata.count` | 6638 (both pages) |
| `@odata.nextLink` present | yes: `…Property?$select=ListingKey%2cListingId%2cListingKeyNumeric&$filter=StandardStatus+eq+%27Active%27+and+PropertyType+eq+%27Residential%27&$orderby=ListingKey&$top=200&$count=true&$skip=200` |
| page 1 rows / range / sorted asc | 200 / 1091330901 … 1107468614 / yes |
| page 2 (`--skip=200`) rows / range / sorted asc | 200 / 1107610023 … 1118558271 / yes |
| overlap between page-1 and page-2 ListingKey sets | **0** |
| page-1 last < page-2 first (no gap, confirmed by keyset check in K) | **yes** |
| full `page --max=5000` walk vs count | **UNVERIFIED by rule** — SALE count 6638 > 5000, walk not run. Bonus: RENTAL walk (`page --filter=RENT --select=ListingKey --orderby=ListingKey --top=200 --max=5000`) returned 918 rows / 918 distinct keys = `@odata.count` 918 |

### M. Media join (raw: 17-media-office.txt, 17-media-rows.json, 17-picklist-MediaCategory.json, 17-media-fields.json)

Listing used: first SALE row — ListingKey `1091330901`, ListingId `RLS10992949`.

| `$filter` on Media | State | `@odata.count` |
|---|---|---|
| `ResourceRecordKey eq '1091330901'` | SUPPORTED | **61** |
| `ResourceRecordID eq 'RLS10992949'` | SUPPORTED | **61** |
| `ResourceRecordKey eq 'RLS10992949'` (crossed) | SUPPORTED | 0 |
| `ResourceRecordID eq '1091330901'` (crossed) | SUPPORTED | 0 |

Rows returned (`--select=MediaKey,ResourceRecordKey,ResourceRecordID,ResourceName,Order,MediaCategory,MediaType,ImageSizeDescription,MediaURL --orderby=Order --top=200`): 61. ResourceName "Property" ×61; ResourceRecordID "RLS10992949" ×61; MediaCategory Photo 59, FloorPlan 2; MediaType Jpeg 60, Gif 1; ImageSizeDescription null ×61.
Order values present: `1,1,2,2,3,4,…,59` — i.e. 1–59 with 1 and 2 duplicated (Order 1: FloorPlan Jpeg + Photo Jpeg; Order 2: Photo Jpeg + FloorPlan Gif). Order is therefore not unique per listing across categories.
Media.MediaCategory picklist (single-enum, 18): `Addendum, AerialView, AgentPhoto, BrandedVirtualTour, Disclosure, Document, FloorPlan, Map, OfficeLogo, OfficePhoto, Other, Photo, RentalDocuments, Restriction, Survey, Topography, UnbrandedVirtualTour, Video`. Observed members: Photo, FloorPlan.
Media declares 56 fields incl. ResourceRecordKey, ResourceRecordID, ResourceRecordKeyNumeric, Order, MediaCategory, MediaType, MediaURL, InternetEntireListingDisplayYN, Permission, ListingPermission, SyndicateTo (list in 17-media-office.txt).

### N. Office identity (raw: 17-office-s1.json, 17-office-s2.json)

400 SALE rows sampled (`--select=ListingKey,ListOfficeMlsId,ListOfficeName --orderby=ListingKey --top=200` at skip 0 and skip 3000). Top 10 pairs:

| Count | ListOfficeMlsId | ListOfficeName |
|---|---|---|
| 80 | 51 | Douglas Elliman Real Estate |
| 58 | 7222 | Compass |
| 53 | 334 | Corcoran Group |
| 27 | 6182 | Corcoran Sunshine Marketing Group |
| 25 | 10325 | Serhant |
| 23 | 219 | Brown Harris Stevens Residential Sales LLC |
| 13 | 1348 | Sothebys International Realty |
| 10 | 4972 | Nest Seekers LLC |
| 8 | 538 | Leslie J Garfield & Co Inc |
| 6 | 6924 | Keller Williams NYC |

`SALE and ListOfficeMlsId ne null` 6638 · `ListOfficeName ne null` 6638 · `SALE and ListOfficeMlsId eq '7565'` **SUPPORTED, 30**. probeField both fields: all four SUPPORTED.

### O. Display-permission fields (addendum; raw: 18-display-permission.txt, 18-sample-SALE.json, 18-sample-RENT.json, 18-probe-*.json, 19-rejections-verbatim.txt, 20-permission-members.txt)

Candidates from live declaration only — `resource --type=boolean` (63 names) and `--type=enum` (195 names) filtered on Internet|Display|Permission|Syndicat|OptOut|Private:
booleans **GrazingPermitsPrivateYN, InternetAddressDisplayYN, InternetAutomatedValuationDisplayYN, InternetConsumerCommentYN, InternetEntireListingDisplayYN, PoolPrivateYN**; enums **Permission** (multi; picklist tool lists 18 members `AgentOnly, ComingSoon, CompSold, DownPaymentResourceNo, DownPaymentResourceYes, FirmOnly, History, IDX, MemberInactive, Officeidxoptout, OfficeInactive, OfficeOnly, OfficeSuspended, PhotoOptedOut, Private, Public, SyndicateOptOut, VOW`; the provider's own rejection names its runtime type `Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission`), **SyndicateTo** (multi, 26 members `Apartmentscom, Austinhomesearchcom, BrokerReciprocity, CREA, Crexi, Harcom, Homescom, Homesnap, Homestory, IdxSites, InternationalMLS, JamesEditioncom, Listhub, Naplesareacom, None, Properstarcom, Realtorcom, RealtorcomInternational, RentalBeast, RentSpree, Rpr, State27homescom, SyndicationAllowed, Terrascope, Texasrealestatecom, ZillowGroup, ZillowTrulia`).

| Field | SALE `ne null` / true / false | RENTAL `ne null` / true / false | 200-row SALE sample | 200-row RENTAL sample | probeField select · filter_non_null · orderby · type_operator |
|---|---|---|---|---|---|
| InternetEntireListingDisplayYN | **PROVIDER_REJECTED 400** (all three filters) | PROVIDER_REJECTED 400 | null ×200 | null ×200 | SUPPORTED · REJECTED · REJECTED · REJECTED (R-8) |
| InternetAddressDisplayYN | PROVIDER_REJECTED 400 | PROVIDER_REJECTED 400 | null ×200 | null ×200 | SUPPORTED · REJECTED · REJECTED · REJECTED (R-9) |
| InternetAutomatedValuationDisplayYN | 6638 / 6411 / 227 | 918 / 831 / 87 | true 193, false 7 | true 193, false 7 | all four SUPPORTED (corpus non-null 591533; operator count 445740) |
| InternetConsumerCommentYN | 6638 / 6387 / 251 | 918 / 828 / 90 | true 193, false 7 | true 194, false 6 | all four SUPPORTED (corpus 591533; operator 445573) |
| GrazingPermitsPrivateYN | PROVIDER_REJECTED 400 | PROVIDER_REJECTED 400 | null ×200 | null ×200 | SUPPORTED · REJECTED · REJECTED · REJECTED (R-10) |
| PoolPrivateYN | 0 / 0 / 0 | 0 / 0 / 0 | null ×200 | null ×200 | all four SUPPORTED (count 0) — NOT_POPULATED |
| Permission | `ne null` 6638; `has 'IDX'` **6638**; `eq 'IDX'` 6638; all 17 other members `has '<m>'` 0 | `ne null` 918; `has 'IDX'` **918**; others 0 | "IDX" ×200 | "IDX" ×200 | SUPPORTED · SUPPORTED (591533) · SUPPORTED · REJECTED (R-11). `has Cotality.DataStandard.RESO.DD.Enums.Multi.Permission'<m>'` PROVIDER_REJECTED on all 36 tries (R-12, type mismatch) |
| SyndicateTo | `ne null` 0; all 26 members (`.Multi.` has form) 0 | 0; all 26 members 0 | null ×200 | null ×200 | SUPPORTED · SUPPORTED (0) · SUPPORTED · REJECTED (R-13) — NOT_POPULATED |

Rows with **every** candidate null in the 200-row selects (`--select=ListingKey,GrazingPermitsPrivateYN,InternetAddressDisplayYN,InternetAutomatedValuationDisplayYN,InternetConsumerCommentYN,InternetEntireListingDisplayYN,PoolPrivateYN,Permission,SyndicateTo --orderby=ListingKey --top=200`): **SALE 0 / 200, RENTAL 0 / 200** (Permission, InternetAutomatedValuationDisplayYN and InternetConsumerCommentYN are non-null on every sampled row).

---

## 3. Verbatim rejection list (every filter / select / orderby the provider rejected)

All were HTTP 400. Messages are the provider's `error.message` verbatim.

- **R-1** `$filter=StandardStatus eq 'Active' and PropertyType eq 'Residential' and MLSAreaMajor ne null` (also on RENTAL) and `$orderby=MLSAreaMajor`:
  `Results from 'RLS' has been suppressed (provider Level) as field MLSAreaMajor' cannot be used for filtering or ordering queries. No OriginatingSystemNames available for querying given request! This is an indication that you do not have access to the defined Data Provider or fields in the filtering or ordering queries not permitted by Data Provider. Please contact support.` (code `BadRequest[400]. TraceId: 82d1aaef-84cf-4fb8-bb4b-8ccabdc2b884`)
- **R-2** same three forms for `MLSAreaMinor`: identical text with `field MLSAreaMinor'`.
- **R-3** probeField type_operator on StructureType: `The query specified in the URI is not valid. Could not find a property named 'Apartment' on type 'Cotality.DataStandard.RESO.DD.Property'.`
- **R-4** probeField type_operator on PropertySubTypeAdditional: `The query specified in the URI is not valid. Could not find a property named 'Acreage' on type 'Cotality.DataStandard.RESO.DD.Property'.`
- **R-5** probeField type_operator on Levels: `The query specified in the URI is not valid. Could not find a property named 'BiLevel' on type 'Cotality.DataStandard.RESO.DD.Property'.`
- **R-6** `… and StructureType has Cotality.DataStandard.RESO.DD.Enums.StructureType'<member>'` (23 members, no `.Multi.`) and the `…StructureTypes'…'` variant: `The query specified in the URI is not valid. The string 'Cotality.DataStandard.RESO.DD.Enums.StructureType'Apartment'' is not a valid enumeration type constant.` (one per member; the same form was also rejected for Levels, CommonWalls, PropertySubTypeAdditional and ArchitecturalStyle in the first D pass — 257 rejections total in 09-ownership-enums.txt before the `.Multi.` form was found)
- **R-7** `… and StructureType/any(s: s eq 'Apartment')`: `The query specified in the URI is not valid. Can only bind segments that are Navigation, Structural, Complex, or Collections. We found a segment 'StructureType' that isn't any of those. Please revise the query.`
- **R-8** `InternetEntireListingDisplayYN ne null` / `eq true` / `eq false` on both universes, `$orderby=InternetEntireListingDisplayYN`, and probeField filter/orderby/operator: `Results from 'RLS' has been suppressed (provider Level) as field InternetEntireListingDisplayYN' cannot be used for filtering or ordering queries. No OriginatingSystemNames available for querying given request! This is an indication that you do not have access to the defined Data Provider or fields in the filtering or ordering queries not permitted by Data Provider. Please contact support.`
- **R-9** same three filter forms + probeField for `InternetAddressDisplayYN`: identical text with `field InternetAddressDisplayYN'`.
- **R-10** same for `GrazingPermitsPrivateYN`: identical text with `field GrazingPermitsPrivateYN'`.
- **R-11** probeField type_operator on Permission: `The query specified in the URI is not valid. Could not find a property named 'AgentOnly' on type 'Cotality.DataStandard.RESO.DD.Property'.`
- **R-12** `… and Permission has Cotality.DataStandard.RESO.DD.Enums.Multi.Permission'<member>'` (18 members × 2 universes): `The query specified in the URI is not valid. A binary operator with incompatible types was detected. Found operand types 'Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission' and 'Cotality.DataStandard.RESO.DD.Enums.Multi.Permission' for operator kind 'Has'.`
- **R-13** probeField type_operator on SyndicateTo: `The query specified in the URI is not valid. Could not find a property named 'Apartmentscom' on type 'Cotality.DataStandard.RESO.DD.Property'.`

No `$select` was rejected in this run (every selected field, including MLSAreaMajor/Minor and the three rejected booleans, returned 200 on select).

---

## 4. Raw query log (in execution order; count or first-row result)

Prefix `Q =` `node scripts/cotality/query-live.mjs`. `SALE` / `RENT` abbreviate the two universe filters of §1.4.

1. `Q census` → 17 resources, 1456 fields, 181 enums; Property 757 fields, 14 navigations (Media, OpenHouse, …).
2. `Q picklist --field=StandardStatus --resource=Property` → 11 members (§1.1).
3. `Q picklist --field=PropertyType --resource=Property` → 13 members (§1.1).
4. `Q query --resource=Property --filter="StandardStatus eq 'Active'" --top=0 --count=true` → 7555.
5–15. same with each of the 11 StandardStatus members → §1.2.
16–28. `--filter="StandardStatus eq 'Active' and PropertyType eq '<m>'"` for 13 members → §1.3.
29. `--filter="PropertyType eq null"` → 0. 30. `--filter="StandardStatus eq null"` → 0. 31. no filter, `--top=0 --count=true` → 591531.
32–36. `Q resource --resource=Property --type=enum|string|numeric|all|boolean` → 195 / 353 / 166 / 771 / 63 names.
37–62. `Q field --field=<F> --resource=Property` for ListPrice, BedroomsTotal, BathroomsFull, BathroomsHalf, BathroomsTotalInteger, BathroomsOneQuarter, BathroomsPartial, BathroomsThreeQuarter, MainLevelBathrooms, City, CityRegion, PostalCity, CountyOrParish, SubdivisionName, MLSAreaMajor, MLSAreaMinor, Township, StateRegion, ListingKey, ListingId, ListingKeyNumeric, ListOfficeMlsId, ListOfficeName, LeaseAmount, TotalActualRent, LeaseAmountFrequency → types in §2 (06-field-decls.txt).
63. `Q picklist --field=PropertySubType` → 75 members.
64–215. `SALE and PropertySubType eq '<m>'` and `RENT and …` for all 75 + `eq null` → §C.
216–222. `Q picklist` for CommonInterest, OwnershipType, StructureType, PropertySubTypeAdditional, CommonWalls, ArchitecturalStyle, Levels.
223–526. first D pass: `SALE and <F> eq '<m>'` (single-enums) / `<F> has Cotality.DataStandard.RESO.DD.Enums.<F>'<m>'` (multi) / `eq null` / `ne null` → single-enum counts §D.1–D.2; 257 multi-enum rejections (R-6).
527. `SALE` re-count → 6638. 528. `SALE and CommonInterest eq null` → 0.
529–533. syntax probes `StructureType has 'Apartment'` 0 · `eq 'Apartment'` 0 · no-Multi has → R-6 · `/any` → R-7 · `StructureTypes` → R-6.
534. `Q probeField --resource=Property --field=StructureType` → SUPPORTED/SUPPORTED(97561)/SUPPORTED/REJECTED (R-3).
535. `SALE and StructureType has Cotality.DataStandard.RESO.DD.Enums.Multi.StructureType'Apartment'` → 0 (SUPPORTED).
536–657. `.Multi.` has form for all members of StructureType (23), Levels (18), CommonWalls (6), PropertySubTypeAdditional (75) → §D.
658. `Q query --filter=SALE --select=ArchitecturalStyle,StructureType,PropertySubTypeAdditional,CommonInterest --orderby=ListingKey --top=200` → tallies §D.
659–666. ListPrice `ne null`/`eq null`/asc/desc on SALE and RENT → §E.
667. RENT 20-row sample → §E.
668–681. `RENT and <F> ne null` for 11 rent-shaped numerics + LeaseAmountFrequency; `SALE and LeaseAmount|TotalActualRent ne null` → §E.
682. `Q picklist --field=LeaseAmountFrequency` → 16 members.
683–704. BedroomsTotal ne null / eq null / asc / desc / eq 0..6 / gt 6 on both universes → §F.
705–746. seven Bath fields × (ne null, asc, desc) × 2 universes → §G.
747. 200-row SALE bath sample → joint check §G.
748–773. 13 geo fields `ne null` on both universes → §H (MLSAreaMajor/Minor → R-1/R-2).
774–775. 200-row geo samples SALE and RENT → §H/§I.
776–778. `StandardStatus eq 'Active' and ListingKey|ListingId|ListingKeyNumeric ne null` → 7556 each.
779–780. SALE pages 1 and 2 (`--orderby=ListingKey --top=200 --count=true [--skip=200]`) → §L.
781. `SALE and ListingKey gt '1091330901'` → 6637. 782. same `--select=ListingKey --orderby=ListingKey --top=1` → 1091330953. 783. `ListingKey gt '1107468614'` top 1 → 1107610023.
784–785. `StandardStatus eq 'Active'` orderby ListingId asc / ListingKeyNumeric asc top 1 → RLS10903071 / 1091330901.
786. `… and ListingKeyNumeric gt 0` → 7556. 787. `… and ListingId ne ''` → 7556.
788. `Q page --resource=Property --filter=RENT --select=ListingKey --orderby=ListingKey --top=200 --max=5000` → 918 rows. 789. `RENT` count → 918.
790–793. Media counts for the four key forms → 61 / 61 / 0 / 0.
794. Media rows for ResourceRecordKey eq '1091330901' → 61 rows.
795. `Q picklist --field=MediaCategory --resource=Media` → 18 members. 796. `Q resource --resource=Media --type=all` → 56 fields.
797–798. SALE office samples (skip 0, skip 3000) → §N. 799–800. ListOfficeMlsId / ListOfficeName ne null → 6638. 801. `ListOfficeMlsId eq '7565'` → 30.
802–803. `Q resource --type=boolean|enum` (re-pulled for §O). 804–839. §O boolean candidates × (ne null, eq true, eq false) × 2 universes. 840–841. picklists Permission, SyndicateTo. 842–931. §O enum members with `.Multi.` has form (Permission → R-12 ×36; SyndicateTo → 0 ×52); `ne null` ×4.
932–933. §O 200-row selects SALE / RENT → every-null rows 0 / 0.
934–941. `Q probeField` for the 8 §O candidates.
942–948. verbatim re-runs: MLSAreaMajor ne null (R-1), InternetEntireListingDisplayYN ne null (R-8), Permission `.Multi.Permission` has (R-12), `Permission has 'IDX'` 6638, `Permission eq 'IDX'` 6638, `StructureType has 'HighRise'` 3826, `StructureType eq 'HighRise'` 3826.
949–950. `$orderby=MLSAreaMajor` / `=InternetEntireListingDisplayYN` → R-1 / R-8.
951–972. CityRegion / CountyOrParish / City `eq` per borough on both universes → §H table.
973–1008. `Permission has '<m>'` 18 members × 2 universes → IDX 6638 / 918, all others 0.
1009–1018. cross-tabs (§D.3) and RENT CommonInterest 13 members + null, RENT StructureType 14 members + null.
1019–1049. `Q probeField` sweep for 31 fields → §J.
1050–1056. `ListPrice lt 0` 2 · `le 0` 658 · `SALE and ListPrice le 0` 0 · `RENT and ListPrice le 0` 0 · SALE 6638 · RENT 918 · Active 7556 (2026-09-05T02:52:57Z).
