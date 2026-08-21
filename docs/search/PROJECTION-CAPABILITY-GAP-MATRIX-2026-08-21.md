# Projection capability gap matrix

**Built from the ACTUAL authenticated Sale/Rental controls, not from what the projection
already happens to contain.** Read from committed code. Production Neon was NOT queried —
the acceptance window is open — so population claims are marked UNVERIFIED.

## The two answers

**Structural: YES.** `ListingSearchProjection` is already populated from BOTH sides —
Mallan-authored create/edit via `dualWriteProjectionForListingId`, and synchronised
third-party Cotality inventory via the sync projection upsert. It is the correct existing
candidate for one canonical authenticated Search universe. Nothing new needs inventing.

**Capability: NO, not yet.** It cannot replace `/api/idx/search` today without silently
losing substantial broker Search capability. The gaps are enumerated below.

Three things that must not happen while closing them: no second Search table; no merging of
Cotality and local results in browser JavaScript; and no keeping `/api/idx/search` as a
fallback engine for criteria the projection cannot yet handle. The last is the most
tempting and the most damaging — it recreates exactly the parallel-truth architecture being
removed, and guarantees a period where some controls query the projection while others
silently hit live Trestle.

## Availability classes

| class | meaning |
|---|---|
| **A** | native projection column |
| **B** | existing `amenity_keys` / `feature_flags` |
| **C** | existing related `Listing` typed column |
| **D** | existing `Listing.address` / `features` / `raw_data` JSON |
| **E** | not stored / not yet verified |

**A–D must be exhausted before any schema growth is proposed.** Absence from the projection
is not evidence that a fact is unstored.

---

## 1. CURRENT AUTHENTICATED CONTROLS

The 29 criteria `buildCrmIdxODataFilter` accepts today.

| control | canonical key | projection | class | translator executes it? | gap |
|---|---|---|---|---|---|
| `type` | transaction_type | `listing_type` | **A** | yes | — |
| `status` | standard_status | `mls_status` | **A** | yes | — |
| `minPrice` / `maxPrice` | list_price | `list_price` | **A** | yes | — |
| `minBeds` / `maxBeds` / `beds` | bedrooms | `bedrooms` | **A** | yes | — |
| `minBaths` / `maxBaths` | bathrooms | `bathrooms` (FUSED float) | **A** | yes | — projection is *better* here: `full + half/2` is pre-computed |
| `borough` | borough | `borough` | **A** | yes | — |
| `neighborhood` | neighborhood | `neighborhood` | **A** | yes | semantics still provisional |
| `zip` | postal_code | `postal_code` | **A** | yes | — |
| `keyword` | keywords | `searchable_text` | **A** | yes | verify what the text is built from |
| `ownership` | ownership | `feature_flags.is_condo/coop/condop` | **B** | yes | — |
| **`propertySubType`** | property_sub_type | **`property_sub_type` EXISTS** | **A** | **NO** | **TRANSLATOR GAP, not storage.** The column is present and populated; `criteriaToProjectionWhere` simply does not execute this criterion |
| **`listingId`** | listing_id_mls / listing_key | `listing_id`, `listing_key` | **A** | **NO** | translator gap — both identity columns exist |
| **`unit`** | unit | — | **D** | no | `Listing.address.UnitNumber` |
| **`address`** | address | — | **D** | no | `Listing.address` structured parts; needs the address field-family contract |
| **`buildingName`** | building_name | — | **D** | no | `features/raw_data.BuildingName` (live 3,903/8,056) |
| **`contractDateFrom/To`** | listing_contract_date | — | **C** | no | `Listing.listing_contract_date` typed column |
| **`closeDateFrom/To`** | close_date | — | **D** | no | `raw_data.CloseDate`; population UNVERIFIED (CMA census) |
| **`dateFrom/dateTo/dateType`** | dom_dates | `modified_at` partial | **A/C** | no | only `modified_at` is native; other date axes are C/D |
| **`managementCompany`** | — | — | **E** | no | no verified mapping; census required |
| `checkboxFilters` | amenities + flags | `amenity_keys`, `feature_flags` | **B/E** | partial | maps `LaundryFeatures`, `SecurityFeatures`, `PoolFeatures`, `PetsAllowedYN`, `AvailableLeaseType`, `ConstructionMaterials`, `NewConstructionYN` — **`PetsAllowedYN` is live-populated ZERO**, and `SecurityFeatures`/`ConstructionMaterials`/`AvailableLeaseType` are uncensused |
| `gridFilter` | — | n/a | — | n/a | client-side result filter, not a Search criterion — must stay outside the canonical universe |

**Nine of 29 controls are translator or storage gaps.** Two of those (`propertySubType`,
`listingId`) need no storage work at all — the columns exist and are populated.

---

## 2. CRITERIA A BROKER NEEDS THAT NO PATH SUPPORTS TODAY

Not currently in `/api/idx/search` either, so these are capability gaps in **both** engines.

| fact | projection | class | note |
|---|---|---|---|
| rooms total | — | **D** | `features.RoomsTotal`, live 8,156 |
| stories / floors | — | **D** | `features.StoriesTotal` |
| building unit count | — | **D** | `features.NumberOfUnitsTotal` |
| arbitrary year range | `year_built` | **A** | column exists; translator only does pre/post-war buckets |
| `ClosePrice` | — | **D** | CMA census pending |
| `OriginalListPrice` / previous price | — | **D** | `raw_data.OriginalListPrice`, live 8,158 |
| DOM / CDOM | — | **C** | `Listing.days_on_market`, `cumulative_days_on_market` |
| association fee **+ frequency** | — | **D** | field FAMILY — fee alone is meaningless without `AssociationFeeFrequency`, and co-op maintenance ≠ condo common charges |
| taxes | — | **D** | `features.TaxAnnualAmount`, live 3,390 |
| rental availability date | — | **D** | `features.AvailabilityDate`, live 1,566 |
| rental fees / FARE fields | — | **E** | census required |
| lease fields | — | **E** | `LeaseAmount`, `LeaseAmountFrequency`, `TotalActualRent` — census required |
| ListOffice / ListAgent criteria | — | **C** | typed columns exist on `Listing` |
| Open House criteria | — | **E** | separate resource; contract unverified |
| media capabilities | `feature_flags.has_*` | **B** | photo/floorplan/video flags derived at build time |

Every one is class **C** or **D** except five genuinely uncensused **E** rows. **No schema
growth is justified by this matrix** — the facts are stored; they are not promoted or not
translated.

---

## 3. RESULT DTO — A CAPABILITY GAP, NOT A SECOND MAPPER

`runProjectionListingSearch` hydrates `SEARCH_RESULT_LISTING_SELECT`: 17 fields sized for
Saved Search and alert replay. The broker workbench needs far more — media, agent/office,
carrying costs, dates, open houses, provider identifiers, attribution.

**Do not copy `crm-idx-mapper.ts` into a second projection mapper.** That is how two result
shapes drift.

One canonical authenticated Search result contract:

    projection candidate IDs
      -> related canonical Listing
      -> verified field mapping
      -> canonical media
      -> authenticated Search DTO

and that one contract feeds Grid, Gallery, Summary, Detail, Map, Compare and Reports.

---

## 4. SORTING IS PART OF THE SAME CONTRACT

| | current |
|---|---|
| `/api/idx/search` | passes a raw OData `$orderby` through to the provider (default `ModificationTimestamp desc`) |
| projection search | **`[{ modified_at: desc }, { id: asc }]` only** |

Required broker sorts: Newest · Price low/high · Price/SF *when verified* · Size · Bedrooms
· DOM · Recently Updated. CMA sorting is separate and comes later.

**Sorting must operate on the canonical universe BEFORE page boundaries are determined.**
Sorting a page is the same class of defect as filtering a page.

---

## 5. POPULATION READINESS — ITS OWN GATE

The code proves Mallan create/edit and Cotality sync **attempt** projection writes. It does
not prove every eligible `Listing` currently HAS a current projection row — projection-write
failures do not roll back the listing write, so a listing can exist with no projection row
and nothing surfaces it.

Not measurable during the Neon hold. Recorded as the cutover gate:

- every eligible canonical `Listing` ↔ exactly ONE projection row
- zero missing · zero orphan
- material-field parity
- freshness within the accepted sync SLA

**No provider fallback if a local Mallan projection row is missing.** A missing projection
is an integrity defect to repair, not a reason to serve the provider copy — that is the same
fail-open the suppression contract already refuses.

---

## 6. FRESHNESS BECOMES MALLAN'S PROBLEM AT CUTOVER

Today third-party inventory is as fresh as the live provider call. After cutover it is as
fresh as Mallan's synchronisation. That is architecturally correct **only once the sync
foundation proves the required cadence**:

    Cotality change -> Mallan sync -> Listing -> projection -> authenticated Search

within the approved window, with no lost tail/cursor rows. **Live parity must not be claimed
before this is proven.**

---

## 7. SEARCH-SIDE BUILDING WRITE — A DEPENDENCY TO RETIRE, NOT PRESERVE

`/api/idx/search` calls `upsertBuildingFromSearchResult()` while serving a Search GET
(route.ts:207). Search is a CONSUMER; it is not the correct owner of opportunistic canonical
Building creation, and a suppressed representation must not create building participation
merely because a broker searched.

Recorded so it does not become the reason the direct engine can never be retired. Building
must eventually be fed by the verified ingestion pipeline. **Not patched here.**

---

## 8. PROVIDER TRACKER ≠ CANONICAL SEARCH COUNT

A REBNY RLS live tracker may legitimately remain a provider-health instrument. That does not
make the provider count the authenticated Search total. Provider inventory census and Mallan
canonical Search universe are different measurements and must never be conflated.

---

## 9. ORDER OF WORK

1. **Projection suppression fix — proceed NOW.** Saved Search execute/count and alerts
   ALREADY run on the projection; they do not wait for the primary cutover. One correction
   in `buildProjectionSearchWhere` through its existing `listing` relation, reusing
   `excludeMallanRlsReturnCopies()`. No duplicated office constant. `count` and `findMany`
   share the predicate.
2. Close the translator gaps that need no storage work (`propertySubType`, `listingId`,
   year range).
3. Promote or translate the C/D facts; census the five E rows.
4. Build the one result DTO contract, then sorting.
5. Prove population readiness and freshness.
6. **Only then** cut `/api/idx/search` over — never a period where some controls use the
   projection while others silently fall back to live Trestle.
