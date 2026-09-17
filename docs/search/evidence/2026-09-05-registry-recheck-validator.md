# SEARCH CHECKPOINT REGISTRY — INDEPENDENT RE-CHECK (CDV) — 2026-09-05

Validator: Contract/Data Validator (independent). Evidence: ONLY HTTP responses from api.cotality.com obtained during this run via
`node scripts/cotality/query-live.mjs ...`. No repository file, registry, source, doc, or prior report was read. No git.
States never collapsed: SUPPORTED (2xx) / PROVIDER_REJECTED (4xx, quoted) / UNVERIFIED (failure, timeout, ambiguity).

## 0. Universe tokens (live picklists)

`picklist --field=StandardStatus --resource=Property` -> SUPPORTED, 11 members verbatim:
Active, ActiveUnderContract, Canceled, Closed, ComingSoon, Delete, Expired, Hold, Incomplete, Pending, Withdrawn (multiEnum=false)

`picklist --field=PropertyType --resource=Property` -> SUPPORTED, 13 members verbatim:
BusinessOpportunity, CommercialLease, CommercialSale, DisasterReliefRental, Farm, HighRise, Land, ManufacturedInPark, MultiFamily, Residential, ResidentialIncome, ResidentialLease, Specialty (multiEnum=false)

Tokens `Active`, `Residential`, `ResidentialLease` confirmed present verbatim.

## Universes (live, Property, --top=0 --count=true)

| Universe | Filter | @odata.count | state |
|---|---|---|---|
| SALE | `StandardStatus eq 'Active' and PropertyType eq 'Residential'` | **6638** | SUPPORTED |
| RENTAL | `StandardStatus eq 'Active' and PropertyType eq 'ResidentialLease'` | **917** | SUPPORTED |

## Item 1 — Sale universe is positive membership — **CONFIRMED**

`query --resource=Property --filter="StandardStatus eq 'Active' and PropertyType eq '<T>'" --top=0 --count=true`, all 13 members, all SUPPORTED:

| PropertyType | count |
|---|---|
| BusinessOpportunity | 0 |
| CommercialLease | 0 |
| CommercialSale | 0 |
| DisasterReliefRental | 0 |
| Farm | 0 |
| HighRise | 0 |
| Land | 0 |
| ManufacturedInPark | 0 |
| MultiFamily | 0 |
| **Residential** | **6638** |
| ResidentialIncome | 0 |
| **ResidentialLease** | **917** |
| Specialty | 0 |

Cross-check: 6638 + 917 = 7555 = `StandardStatus eq 'Active'` total (Item 2). Only Residential and ResidentialLease non-zero. Claim holds.

## Item 2 — Status population — **CONFIRMED**

`query --resource=Property --filter="StandardStatus eq '<S>'" --top=0 --count=true`, all 11 members, all SUPPORTED:

| StandardStatus | count |
|---|---|
| **Active** | **7555** |
| ActiveUnderContract | 0 |
| Canceled | 0 |
| **Closed** | **578373** |
| **ComingSoon** | **6** |
| Delete | 0 |
| Expired | 0 |
| Hold | 0 |
| Incomplete | 0 |
| **Pending** | **5600** |
| Withdrawn | 0 |

Exactly Active, Closed, Pending, ComingSoon non-zero; the other seven are 0. Claim holds.

## Item 3 — Bathrooms — **CONFIRMED**

(S = SALE filter; L = RENTAL filter; all `--top=0 --count=true` unless noted)

| Sub | Query | count | state |
|---|---|---|---|
| 3a | `S and BathroomsFull ne null` | 6638 (= SALE 6638) | SUPPORTED |
| 3a | `S and BathroomsHalf ne null` | 6638 (= SALE 6638) | SUPPORTED |
| 3a | `L and BathroomsFull ne null` | 917 (= RENTAL 917) | SUPPORTED |
| 3a | `L and BathroomsHalf ne null` | 917 (= RENTAL 917) | SUPPORTED |
| 3b | `S and BathroomsTotalInteger ne null` | **6623** < 6638 (15 null) | SUPPORTED |
| 3d | `S and BathroomsFull ge 2` | 3421 | SUPPORTED |
| 3d | `S and BathroomsHalf ge 1` | 1770 | SUPPORTED |
| 3d | `S`, `--select=ListingKey,BathroomsFull --orderby=BathroomsFull --top=3` | 3 rows returned (BathroomsFull 0,0,0; nextLink present) | SUPPORTED |

3c: `S`, `--select=ListingKey,BathroomsFull,BathroomsHalf,BathroomsTotalInteger --orderby=ListingKey --top=200` -> 200 rows, SUPPORTED.
In-sample nulls: Total 0, Full 0, Half 0. Rows with BathroomsTotalInteger != BathroomsFull + BathroomsHalf: **12 of 200**.
Examples: ListingKey 1091332633 (F4 H2 T5); 1091335738 (F8 H2 T9); 1091340652 (F4 H3 T5); 1092304475 (F7 H2 T8); 1092326424 (F7 H2 T8).
All four sub-claims (a)-(d) hold.

## Item 4 — Borough carrier — **CONFIRMED**

| Sub | Query | SALE | RENTAL | state |
|---|---|---|---|---|
| 4a | `CityRegion eq 'Manhattan'` | 4422 | 474 | SUPPORTED |
| 4a | `CityRegion eq 'Brooklyn'` | 1314 | 332 | SUPPORTED |
| 4a | `CityRegion eq 'Queens'` | 607 | 100 | SUPPORTED |
| 4a | `CityRegion eq 'Bronx'` | 268 | 8 | SUPPORTED |
| 4a | `CityRegion eq 'StatenIsland'` | 27 | 3 | SUPPORTED |
| | **Sum** | **6638 = SALE** | **917 = RENTAL** | |
| 4b | `CountyOrParish eq 'New York'` | 4422 | 474 | SUPPORTED |
| 4b | `CountyOrParish eq 'Kings'` | 1314 | 332 | SUPPORTED |
| 4b | `CountyOrParish eq 'Queens'` | 607 | 100 | SUPPORTED |
| 4b | `CountyOrParish eq 'Bronx'` | 268 | 8 | SUPPORTED |
| 4b | `CountyOrParish eq 'Richmond'` | 27 | 3 | SUPPORTED |
| 4c | `S and CityRegion eq 'Staten Island'` (with space) | **0** — SUPPORTED (2xx, not rejected) | — | SUPPORTED |
| 4d | `S`, `--select=ListingKey,CityRegion --orderby=CityRegion --top=3` | 3 rows (Bronx, Bronx, Bronx), nextLink present | — | SUPPORTED |

(a) sums exact on both universes; (b) county counts identical to the CityRegion counts pairwise; (c) the spaced form is accepted by the provider and returns 0; (d) orderby SUPPORTED.

## Item 5 — Neighborhood carrier and vocabulary — **CONFIRMED**

| Sub | Query | count | state |
|---|---|---|---|
| 5a | `S and SubdivisionName ne null` | 6638 (= SALE) | SUPPORTED |
| 5a | `L and SubdivisionName ne null` | 917 (= RENTAL) | SUPPORTED |
| 5b | `S`, `--select=ListingKey,SubdivisionName --orderby=SubdivisionName --top=3` | 3 rows ("Alphabet City", "Annadale", "Annadale"), nextLink | SUPPORTED |

5c — case variants on SALE (`S and SubdivisionName eq '<v>'`), all SUPPORTED:

| value | count |
|---|---|
| Tribeca | 109 |
| TriBeCa | 5 |
| SoHo | 35 |
| Soho | 5 |
| SOHO | 1 |
| Midtown | 175 |
| midtown | 1 |
| Dumbo | 28 |
| DUMBO | 14 |
| NoHo | 15 |
| Noho | 2 |
| NoMad | 54 |
| NOMAD | 1 |
| Nolita | 7 |
| NoLIta | 2 |

Every case variant is non-zero, i.e. `eq` is case-sensitive on the provider and the vocabulary carries case-split duplicates.

5d — `S and MLSAreaMajor ne null` (`--top=0 --count=true`) -> **PROVIDER_REJECTED** HTTP 400, verbatim:
`BadRequest[400]. TraceId: 95462cd3-5dcd-4683-94e9-93a1be5c4710` — `Results from 'RLS' has been suppressed (provider Level) as field MLSAreaMajor' cannot be used for filtering or ordering queries. No OriginatingSystemNames available for querying given request! This is an indication that you do not have access to the defined Data Provider or fields in the filtering or ordering queries not permitted by Data Provider. Please contact support.`
`S`, `--select=ListingKey --orderby=MLSAreaMajor --top=1` -> **PROVIDER_REJECTED** HTTP 400, verbatim:
`BadRequest[400]. TraceId: dd142fda-09fa-4ec9-8ec8-cfce788a23e2` — same message text as above.

5e — `S`, `--select=ListingKey,SubdivisionName,CityRegion --orderby=ListingKey --top=200` -> 200 rows, SUPPORTED.
Null SubdivisionName in sample: 0. **Distinct SubdivisionName values: 53.** Values appearing under two different CityRegion values: **0**.
CityRegion distribution in sample: Manhattan 167, Brooklyn 13, Queens 11, Bronx 9.
Total distinct-token count across the universe: UNVERIFIED by rule (no walk performed).

## Item 6 — Basic property type carriers — **CONFIRMED**

| Sub | Query (on SALE unless noted) | count | claim | state |
|---|---|---|---|---|
| 6a | `PropertySubType eq 'Condominium'` | 0 | 0 | SUPPORTED |
| 6a | `PropertySubType eq 'StockCooperative'` | 0 | 0 | SUPPORTED |
| 6a | `PropertySubType eq 'Townhouse'` | 0 | 0 | SUPPORTED |
| 6a | `PropertySubType eq 'Apartment'` | 5430 | > 5000 | SUPPORTED |
| 6b | `CommonInterest eq 'Condominium'` | 3283 | > 3000 | SUPPORTED |
| 6b | `CommonInterest eq 'StockCooperative'` | 2349 | > 2000 | SUPPORTED |
| 6b | `CommonInterest eq 'Condop'` | 127 | > 100 | SUPPORTED |
| 6b | `CommonInterest eq 'None'` | 844 | > 500 | SUPPORTED |
| 6b | `CommonInterest eq 'RentalBuilding'` | 35 | > 0 | SUPPORTED |
| 6b | RENTAL `CommonInterest eq 'RentalBuilding'` | 518 | > 400 | SUPPORTED |
| 6c | `StructureType has 'Townhouse'` | 518 | > 400 | SUPPORTED |
| 6c | `StructureType has 'Townhouse' and CommonInterest eq 'None'` | 506 (= 97.7% of 518) | most | SUPPORTED |
| 6d | `StructureType eq 'Townhouse'` | 518 (= `has` count) | same | SUPPORTED |
| 6e | `OwnershipType ne null` | 0 | 0 | SUPPORTED |
| 6e | `CommonWalls ne null` | 0 | 0 | SUPPORTED |

6f: `field --field=PropertySubType --resource=Property` -> rawType `Cotality.DataStandard.RESO.DD.Enums.PropertySubType`, **multiEnum false**.
`field --field=StructureType --resource=Property` -> rawType `Cotality.DataStandard.RESO.DD.Enums.Multi.StructureType`, **multiEnum true**.
Note: 6b sum on SALE 3283+2349+127+844+35 = 6638 = SALE (observed, not part of the claim).

## Item 7 — Sort key (ListingContractDate) — **CONFIRMED**

| Query | count | state |
|---|---|---|
| `S and ListingContractDate ne null` | 6638 (= SALE 6638, drift 0) | SUPPORTED |
| `L and ListingContractDate ne null` | 917 (= RENTAL 917, drift 0) | SUPPORTED |

`S`, `--select=ListingKey,ListingContractDate --orderby="ListingContractDate desc" --top=3` -> SUPPORTED, 3 rows, all non-null, non-increasing:
1189754692 / 2026-09-04; 1189713584 / 2026-09-04; 1189690627 / 2026-09-04.

`probeField --resource=Property --field=ListingContractDate` -> declared true; select SUPPORTED (200, rowCount 1, sample 2026-07-08); filterNonNull SUPPORTED (200, count 581763 over whole resource); sort SUPPORTED (200, sample 1900-01-01); operator SUPPORTED (200, count 581763). All four SUPPORTED.

## Item 8 — Mallan office rows — **CONFIRMED**

`--select=ListingKey,ListingId,ListOfficeName,UnitNumber --count=true --top=10`, all SUPPORTED:

| Filter | @odata.count | rows |
|---|---|---|
| `S and ListOfficeMlsId eq '7041'` | **2** | ListingKey 1175519507 / ListingId **RLS20099289** / "MAllan Real Estate Inc" / Unit 4D; ListingKey 1170236599 / ListingId **RLS20093870** / "MAllan Real Estate Inc" / Unit 2G |
| `L and ListOfficeMlsId eq '7041'` | **0** | — |
| `S and ListOfficeMlsId eq '20196'` | **0** | — |
| `L and ListOfficeMlsId eq '20196'` | **0** | — |

Exactly the two claimed ListingIds on SALE; 0 on RENTAL; 20196 is 0 on both.

## Item 9 — Identity — **CONFIRMED**

| Query | count | state |
|---|---|---|
| `S and ListingId ne null` | 6638 (= SALE) | SUPPORTED |
| `S and ListingKey gt '1000000000'` | 6638 | SUPPORTED |
| `S`, `--select=ListingKey,ListingId --orderby=ListingId --top=3` | 3 rows: RLS10932034 (1092326512), RLS10932254 (1092325384), RLS10932288 (1092326424) — ascending | SUPPORTED |

## Item 10 — Media join — **CONFIRMED**

First SALE row: `S`, `--select=ListingKey,ListingId --orderby=ListingKey --top=1` -> ListingKey **1091330901**, ListingId **RLS10992949** (SUPPORTED).

| Sub | Query (resource Media, `--top=0 --count=true`) | @odata.count | state |
|---|---|---|---|
| 10a | `ResourceRecordKey eq '1091330901'` | **61** | SUPPORTED |
| 10a | `ResourceRecordID eq 'RLS10992949'` | **61** | SUPPORTED |
| 10b | `ResourceRecordKey eq 'RLS10992949'` (crossed) | 0 | SUPPORTED |
| 10b | `ResourceRecordID eq '1091330901'` (crossed) | 0 | SUPPORTED |

10c: Media `ResourceRecordKey eq '1091330901'`, `--select=MediaKey,MediaCategory,Order --top=200` -> 61 rows, SUPPORTED. Categories: Photo 59, FloorPlan 2 (two categories present).
Rows with `Order` = 1: **2** — MediaKey 2004485803507 (FloorPlan, Order 1) and MediaKey 2004485803513 (Photo, Order 1). Photo orders run 1..59; FloorPlan orders 1..2. Order restarts per category.

10d: Media `StandardStatus eq 'Active' and ResourceName eq 'Property'`, `--select=MediaKey,PreferredPhotoYN --top=200` -> 200 rows, SUPPORTED.
PreferredPhotoYN: **null 196**, true 1, false 3. Null on 98% (> half).

## Item 11 — Display flags — **CONFIRMED**

`S and InternetEntireListingDisplayYN ne null` (`--top=0 --count=true`) -> **PROVIDER_REJECTED** HTTP 400, verbatim:
`BadRequest[400]. TraceId: 103b8481-bdf3-4c44-b177-eaeab479e76d` — `Results from 'RLS' has been suppressed (provider Level) as field InternetEntireListingDisplayYN' cannot be used for filtering or ordering queries. No OriginatingSystemNames available for querying given request! This is an indication that you do not have access to the defined Data Provider or fields in the filtering or ordering queries not permitted by Data Provider. Please contact support.`

`S and InternetAddressDisplayYN ne null` -> **PROVIDER_REJECTED** HTTP 400, verbatim:
`BadRequest[400]. TraceId: fa84226c-57f2-4873-9012-69a2493ff0be` — `Results from 'RLS' has been suppressed (provider Level) as field InternetAddressDisplayYN' cannot be used for filtering or ordering queries. No OriginatingSystemNames available for querying given request! This is an indication that you do not have access to the defined Data Provider or fields in the filtering or ordering queries not permitted by Data Provider. Please contact support.`

| Query | count | % of SALE 6638 | state |
|---|---|---|---|
| `S and InternetAutomatedValuationDisplayYN eq true` | 6411 | 96.6% (> 90%) | SUPPORTED |
| `S and InternetConsumerCommentYN eq true` | 6387 | 96.2% (> 90%) | SUPPORTED |
| `S and Permission has 'IDX'` | 6638 (= SALE) | 100% | SUPPORTED |
| `L and Permission has 'IDX'` | 917 (= RENTAL) | 100% | SUPPORTED |

Note: the two rejections prove non-filterability only. They say nothing about whether the fields are selectable or populated (not probed here; not claimed).

---

## Verdict table

| Item | Subject | Verdict |
|---|---|---|
| 1 | Sale universe is positive membership (PropertyType under Active) | CONFIRMED |
| 2 | Status population (11 StandardStatus members) | CONFIRMED |
| 3 | Bathrooms (Full/Half full-pop, TotalInteger < SALE, Total != Full+Half rows, filter/orderby) | CONFIRMED |
| 4 | Borough carrier (CityRegion / CountyOrParish sums; 'Staten Island' = 0 accepted; orderby) | CONFIRMED |
| 5 | Neighborhood carrier and vocabulary (SubdivisionName; MLSAreaMajor rejected; case variants) | CONFIRMED |
| 6 | Basic property type carriers (PropertySubType / CommonInterest / StructureType / OwnershipType / CommonWalls / multiEnum) | CONFIRMED |
| 7 | Sort key ListingContractDate | CONFIRMED |
| 8 | Mallan office rows (ListOfficeMlsId 7041 / 20196) | CONFIRMED |
| 9 | Identity (ListingId / ListingKey) | CONFIRMED |
| 10 | Media join (ResourceRecordKey / ResourceRecordID, Order per category, PreferredPhotoYN) | CONFIRMED |
| 11 | Display flags (two rejected, two > 90%, Permission has 'IDX' = universes) | CONFIRMED |

No CONTRADICTED items. No UNVERIFIED items (the only UNVERIFIED is the by-rule universe-wide distinct SubdivisionName token count in 5e, which was explicitly excluded from the claim).

---

## Raw query log

All via `node scripts/cotality/query-live.mjs` from `/c/Users/MayaAllan/Desktop/mallan-nyc`, run 2026-09-04 (report dated 2026-09-05 per assignment). `S` = `StandardStatus eq 'Active' and PropertyType eq 'Residential'`; `L` = `StandardStatus eq 'Active' and PropertyType eq 'ResidentialLease'`. Count queries are `query --resource=Property --filter="..." --top=0 --count=true` unless stated. No call exceeded 3 s. No call timed out. GET-only.

```
picklist --field=StandardStatus --resource=Property                                 -> 200, 11 members
picklist --field=PropertyType --resource=Property                                   -> 200, 13 members
S                                                                                   -> 6638
L                                                                                   -> 917
StandardStatus eq 'Active' and PropertyType eq '<each of 13>'                       -> 0 x11; Residential 6638; ResidentialLease 917
StandardStatus eq '<each of 11>'                                                    -> Active 7555; Closed 578373; ComingSoon 6; Pending 5600; others 0
S and BathroomsFull ne null                                                         -> 6638
S and BathroomsHalf ne null                                                         -> 6638
L and BathroomsFull ne null                                                         -> 917
L and BathroomsHalf ne null                                                         -> 917
S and BathroomsTotalInteger ne null                                                 -> 6623
S and BathroomsFull ge 2                                                            -> 3421
S and BathroomsHalf ge 1                                                            -> 1770
S --select=ListingKey,BathroomsFull,BathroomsHalf,BathroomsTotalInteger --orderby=ListingKey --top=200 -> 200 rows; 12 with T != F+H
S --select=ListingKey,BathroomsFull --orderby=BathroomsFull --top=3                 -> 200, 3 rows
S and CityRegion eq 'Manhattan'|'Brooklyn'|'Queens'|'Bronx'|'StatenIsland'          -> 4422 / 1314 / 607 / 268 / 27
L and CityRegion eq (same five)                                                     -> 474 / 332 / 100 / 8 / 3
S and CountyOrParish eq 'New York'|'Kings'|'Queens'|'Bronx'|'Richmond'              -> 4422 / 1314 / 607 / 268 / 27
L and CountyOrParish eq (same five)                                                 -> 474 / 332 / 100 / 8 / 3
S and CityRegion eq 'Staten Island'                                                 -> 0 (200)
S --select=ListingKey,CityRegion --orderby=CityRegion --top=3                       -> 200, 3 rows
S and SubdivisionName ne null                                                       -> 6638
L and SubdivisionName ne null                                                       -> 917
S --select=ListingKey,SubdivisionName --orderby=SubdivisionName --top=3             -> 200, 3 rows
S and SubdivisionName eq 'Tribeca'|'TriBeCa'|'SoHo'|'Soho'|'SOHO'                   -> 109 / 5 / 35 / 5 / 1
S and SubdivisionName eq 'Midtown'|'midtown'|'Dumbo'|'DUMBO'|'NoHo'|'Noho'          -> 175 / 1 / 28 / 14 / 15 / 2
S and SubdivisionName eq 'NoMad'|'NOMAD'|'Nolita'|'NoLIta'                          -> 54 / 1 / 7 / 2
S and MLSAreaMajor ne null                                                          -> 400 TraceId 95462cd3-5dcd-4683-94e9-93a1be5c4710
S --select=ListingKey --orderby=MLSAreaMajor --top=1                                -> 400 TraceId dd142fda-09fa-4ec9-8ec8-cfce788a23e2
S --select=ListingKey,SubdivisionName,CityRegion --orderby=ListingKey --top=200     -> 200 rows; 53 distinct; 0 cross-borough
S and PropertySubType eq 'Condominium'|'StockCooperative'|'Townhouse'|'Apartment'   -> 0 / 0 / 0 / 5430
S and CommonInterest eq 'Condominium'|'StockCooperative'|'Condop'|'None'|'RentalBuilding' -> 3283 / 2349 / 127 / 844 / 35
L and CommonInterest eq 'RentalBuilding'                                            -> 518
S and StructureType has 'Townhouse'                                                 -> 518
S and StructureType has 'Townhouse' and CommonInterest eq 'None'                    -> 506
S and StructureType eq 'Townhouse'                                                  -> 518
S and OwnershipType ne null                                                         -> 0
S and CommonWalls ne null                                                           -> 0
field --field=PropertySubType --resource=Property                                   -> multiEnum false
field --field=StructureType --resource=Property                                     -> multiEnum true
S and ListingContractDate ne null                                                   -> 6638
L and ListingContractDate ne null                                                   -> 917
S --select=ListingKey,ListingContractDate --orderby="ListingContractDate desc" --top=3 -> 200; 3 x 2026-09-04
probeField --resource=Property --field=ListingContractDate                          -> select/filterNonNull/sort/operator all SUPPORTED (200)
S and ListOfficeMlsId eq '7041' --select=ListingKey,ListingId,ListOfficeName,UnitNumber --count=true --top=10 -> 2 (RLS20099289, RLS20093870)
L and ListOfficeMlsId eq '7041' (same select)                                       -> 0
S and ListOfficeMlsId eq '20196' (same select)                                      -> 0
L and ListOfficeMlsId eq '20196' (same select)                                      -> 0
S and ListingId ne null                                                             -> 6638
S and ListingKey gt '1000000000'                                                    -> 6638
S --select=ListingKey,ListingId --orderby=ListingId --top=3                         -> 200, 3 rows ascending
S --select=ListingKey,ListingId --orderby=ListingKey --top=1                        -> 1091330901 / RLS10992949
Media: ResourceRecordKey eq '1091330901'                                            -> 61
Media: ResourceRecordID eq 'RLS10992949'                                            -> 61
Media: ResourceRecordKey eq 'RLS10992949'                                           -> 0
Media: ResourceRecordID eq '1091330901'                                             -> 0
Media: ResourceRecordKey eq '1091330901' --select=MediaKey,MediaCategory,Order --top=200 -> 61 rows; Photo 59 + FloorPlan 2; Order=1 x2
Media: StandardStatus eq 'Active' and ResourceName eq 'Property' --select=MediaKey,PreferredPhotoYN --top=200 -> 200 rows; null 196 / true 1 / false 3
S and InternetEntireListingDisplayYN ne null                                        -> 400 TraceId 103b8481-bdf3-4c44-b177-eaeab479e76d
S and InternetAddressDisplayYN ne null                                              -> 400 TraceId fa84226c-57f2-4873-9012-69a2493ff0be
S and InternetAutomatedValuationDisplayYN eq true                                   -> 6411
S and InternetConsumerCommentYN eq true                                             -> 6387
S and Permission has 'IDX'                                                          -> 6638
L and Permission has 'IDX'                                                          -> 917
```

End of report. Nothing was changed in the repository. No mapping recommendations are made.
