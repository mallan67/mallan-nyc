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

**39 reachable controls**, extracted mechanically, not summarised by hand.

> **METHOD CORRECTION.** An earlier version of this section said "29 criteria" and then
> classified rooms, floors, building-unit count, sqft and arbitrary year range as
> capabilities "no path supports today". **All five are already implemented.** They are
> declared in a RANGE TABLE at `crm-idx-filter.ts:162-171`, not as individual
> `params.get()` calls, so a grep for the latter missed them — and a hand-written total
> then made the omission invisible.
>
> The inventory is now generated from the code: `params.get()` calls PLUS the range-table
> tuples PLUS route-level params. The lesson is the method, not the five rows: **never fix
> the code to a number decided in advance.**

### Controls I previously misclassified — all ALREADY SUPPORTED

| control | provider field | op | projection | class | translator |
|---|---|---|---|---|---|
| `minRooms` / `maxRooms` | `RoomsTotal` | ge/le | — | **D** (`features.RoomsTotal`, live 8,156) | no |
| `minSqft` / `maxSqft` | `LivingArea` | ge/le | `living_area` | **A** | **yes** |
| `minYear` / `maxYear` | `YearBuilt` | ge/le | `year_built` | **A** | **no** — translator does pre/post-war buckets only, so ARBITRARY ranges are a translator gap |
| `minFloors` / `maxFloors` | `StoriesTotal` | ge/le | — | **D** (`features.StoriesTotal`) | no |
| `minUnits` / `maxUnits` | `NumberOfUnitsTotal` | ge/le | — | **D** (`features.NumberOfUnitsTotal`, live 8,158) | no |

`sponsorUnit` is also a real Search criterion, executed as a route-level POST-FETCH filter
rather than in the OData builder (`route.ts:323-330`, where it also overwrites `finalTotal`).
**Execution mechanism does not stop it being a criterion** — and post-fetch execution is
itself the count/pagination defect pattern.

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
| **`listingId`** | listing_id_mls | `listing_id`, `listing_key` | **A** | **NO** | **NOT a translator gap — an IDENTITY-RESOLUTION capability. See §2b** |
| **`unit`** | unit | — | **D** | no | `Listing.address.UnitNumber` |
| **`address`** | address | — | **D** | no | `Listing.address` structured parts; needs the address field-family contract |
| **`buildingName`** | building_name | — | **D** | no | `features/raw_data.BuildingName` (live 3,903/8,056) |
| **`contractDateFrom/To`** | listing_contract_date | — | **C** | no | `Listing.listing_contract_date` typed column |
| **`closeDateFrom/To`** | close_date | — | **D** | no | `raw_data.CloseDate`; population UNVERIFIED (CMA census) |
| **`dateFrom/dateTo/dateType`** | dom_dates | `modified_at` partial | **A/C** | no | only `modified_at` is native; other date axes are C/D |
| **`managementCompany`** | — | — | **E** | no | no verified mapping; census required |
| `checkboxFilters` | amenities + flags | `amenity_keys`, `feature_flags` | **B/E** | partial | maps `LaundryFeatures`, `SecurityFeatures`, `PoolFeatures`, `PetsAllowedYN`, `AvailableLeaseType`, `ConstructionMaterials`, `NewConstructionYN` — **`PetsAllowedYN` is live-populated ZERO**, and `SecurityFeatures`/`ConstructionMaterials`/`AvailableLeaseType` are uncensused |
| `gridFilter` | — | n/a | — | n/a | client-side result filter, not a Search criterion — must stay outside the canonical universe |

Across all **39** controls: `propertySubType` needs no storage work (column exists,
populated, simply not translated); `listingId` is a different problem entirely (§2b); the
rest are class C/D promotions or translator work.

---

## 2b. `listingId` IS IDENTITY RESOLUTION, NOT A SCALAR FILTER

Calling this "a translator gap — the columns exist" collapses the identity problem this
workstream spent its longest stretch fixing. It cannot be closed with another
`criteriaToProjectionWhere` clause.

The broker control means **`Cotality.Property.ListingId`** — a field of the Cotality API.
(Its VALUES carry a raw `RLS…` prefix; that string is provider provenance to preserve at the
boundary, and never a reason to call the field or its source "RLS".) What it resolves to
depends on WHOSE listing it is:

| the Cotality `ListingId` belongs to | correct result |
|---|---|
| third-party inventory | that third-party canonical listing |
| **a Mallan-authored listing** | the Cotality `ListingId` belongs to the **SUPPRESSED representation**, while canonical identity is the local `SL-`/`RL-` row — so Search must return the **LOCAL** listing |

The naive implementation is actively broken:

    search projection for Cotality ListingId -> finds the provider representation
                                        -> suppression excludes it
                                        -> returns ZERO

Maya searches a Cotality `ListingId` belonging to one of her own listings and gets nothing.

Required contract:

    Cotality ListingId
      -> locate provider identity/evidence
      -> classify (third-party vs Mallan-office representation)
      -> if representation: existing canonical twin resolver
      -> exactly one local twin  -> return the LOCAL canonical listing
      -> no twin                 -> stay suppressed + integrity defect
      -> ambiguous               -> stay suppressed + integrity defect

**Never make the provider representation visible merely because the user searched its
Cotality `ListingId`.** Reuse the existing twin resolver; do not add a second one.

`ListingId` and `ListingKey` are separate identifiers — add distinct inputs only if the
product genuinely needs both, and never conflate them.

---

## 2. CRITERIA NO PATH SUPPORTS TODAY

Genuinely absent from `/api/idx/search` as well — capability gaps in **both** engines.
Rooms, floors, unit count, sqft and year range have been REMOVED from this section; they
are current controls (§1).

| fact | projection | class | note |
|---|---|---|---|
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

## 4b. SOURCE-CLASS / AUDIENCE ELIGIBILITY — A CUTOVER GAP I OVERSTATED

My commit said the projection fix keeps "local Mallan listings admitted". **That is only
true for the subset that satisfies the IDX display gates**, and the test proving it was
structural, not behavioural — it asserted that the serialized `where` CONTAINS the strings
`SL-`, `RL-` and `rls_eligible`, which demonstrates nothing about row inclusion.

`PROJECTION_DISPLAY_GATE` begins with:

    rls_eligible: true
    idx_display_yn: true
    internet_entire_listing_display_yn: true
    participant_only_yn: false

So a **Mallan website-only local listing (`rls_eligible = false`) is excluded at the top
level**, regardless of the nested return-copy predicate admitting local rows. That gate was
shaped for Saved Search alerts and public redistribution, and it structurally excludes
Mallan's own website-only canonical inventory.

**Do NOT change that gate blindly.** The distinction to establish first — the same shape as
"Search capability ≠ alert eligibility", now applied to inventory visibility:

| source class | authenticated Search eligibility |
|---|---|
| Mallan local canonical listing | Mallan BUSINESS visibility rules |
| third-party Cotality | authorized provider/IDX visibility rules |
| Mallan-office representation | suppressed |
| client alert / email / share | a SEPARATE distribution-eligibility layer applied later |

**Client-alert eligibility must not define what the broker can search.** This stays ONE
canonical query foundation with an audience policy — never two Search engines.

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
