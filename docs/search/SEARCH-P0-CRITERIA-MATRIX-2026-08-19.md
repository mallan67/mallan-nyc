# Search P0 — live Cotality criteria matrix

**Every provider fact below came from an HTTP response received from `api.cotality.com`
on 2026-08-19 during the session that wrote this file.** No registry, CSV, `metadata.xml`,
prior audit or model memory was used as evidence. Where a link is unverified it says
`UNVERIFIED` — it is never silently filled in.

Wire contract frozen from `lib/hooks/useListings.ts` (the actual serializer both
breakpoints use). Criteria are listed by the parameter name that goes on the wire.

---

## A. What was structurally wrong (not "filters were ignored")

The original reading — "7 filters are silently ignored" — was **wrong**, and measuring
`total` is what made it wrong. The filters ran; they ran in the wrong place.

`applyPublicListingPostFilters` executed AFTER `skip`/`take`, so it filtered the fetched
page while `total` and `hasMore` still described the unfiltered population:

| request | total | items |
|---|---|---|
| `yearBuilt=pre-war&limit=10` | 8,159 | 2 |
| `yearBuilt=pre-war&limit=50` | 8,159 | 16 |
| `yearBuilt=pre-war&limit=100` | 8,159 | 41 |
| `yearBuilt=pre-war&limit=200` | 8,159 | 100 |

Items scale with page size; `total` never moves. True corpus counts: 3,460 pre-war,
2,567 co-ops. A user filtering co-ops saw **1 result labelled "8,159 found"** and could
never page to the rest.

**Fixed:** every criterion is now a Prisma `where` clause, so Postgres evaluates it over
the whole eligible universe before `skip`/`take`, and `count()` shares the identical
predicate (`prisma.listing.count({ where: dbWhere })`). The cache key is
`listings:<full query string>`, so each filter combination caches separately.

---

## B. Stale registry statements disproven by live Cotality

`npm run cotality:verify` passing (181 enums) certifies **enum material only**. It says
nothing about scalars, booleans, filterability or population. Live `$metadata` +
`$filter` probes disprove three repo claims:

| claim in repo | live truth (2026-08-19) |
|---|---|
| `NewConstructionYN` not a live member | **Boolean, `$filter` SUPPORTED, true on 950 Active** |
| `GarageYN` does not exist | **Boolean, `$filter` SUPPORTED, true on 2,630 Active** |
| `no-fee` = `ListingTerms` NoFee/OwnerPays | `ListingTerms` has 67 members; **neither is one**. `eq 'NoFee'` returns HTTP 400 |

Also newly established live: `PetsAllowedYN` is a filterable Boolean but **populated 0** —
so the `PetsAllowed` multi-enum parse must stay. Probing prevented a wrong "simplification".

---

## C. Criteria matrix

`filterable` is the result of an actual `$filter` probe, never a schema declaration —
`$metadata` over-declares what the licence grants.

| wire param | live Cotality field | type | filterable | live population (Active) | Mallan storage | DB predicate | status |
|---|---|---|---|---|---|---|---|
| `type` | `PropertyType` | enum(13) | SUPPORTED | Residential 7,077 · ResidentialLease 1,027 · **all others 0** | `listing_type` | `listing_type = sale/rent` | OK — see D.1 |
| `minPrice`/`maxPrice` | `ListPrice` | Decimal | SUPPORTED | 200/200 | `list_price` | range | OK |
| `beds`/`maxBeds` | `BedroomsTotal` | Int32 | SUPPORTED | 200/200 | `bedrooms_total` | range | OK |
| `minBaths`/`maxBaths` | `BathroomsFull` + `BathroomsHalf` | Int32 | SUPPORTED | 200/200 | `bathrooms_full`, `bathrooms_half` | **normalised total** | **FIXED** (D.2) |
| `minSqft`/`maxSqft` | `LivingArea` | Decimal | SUPPORTED | 141/200 (0 = unknown) | `living_area` | range | OK — units proven (D.3) |
| `propertySubTypes` | `PropertySubType` | enum(75) | SUPPORTED | Apartment 6,684 · MultiFamily 427 · SingleFamilyResidence 404 · Duplex 359 · Loft 83 · MixedUse 69 · Triplex 66 · **Condominium / StockCooperative / Townhouse all 0** | `property_sub_type` | `in [live members]` | **FIXED** (D.4) |
| `ownershipTypes` | `CommonInterest` | enum(13) | SUPPORTED | Condominium 3,795 · StockCooperative 2,567 · None 1,019 · RentalBuilding 630 · Condop 146 | `raw_data.CommonInterest` (8,158/8,158) | equality, OR | **FIXED** (D.5) |
| `statuses` | `StandardStatus` | enum(11) | SUPPORTED | Active | `status` | `in` allow-list | **FIXED** — fails closed (D.6) |
| `yearBuilt` | `YearBuilt` | Int32 | SUPPORTED | 8,057 number / 101 null | `raw_data.YearBuilt` (JSON number) | `lte 1946` / `gte 1947` | **FIXED** — corpus-wide |
| `furnished` | `Furnished` | enum(5) | SUPPORTED | Furnished 106 · Unfurnished 2,876 · Negotiable 12 · Partially 4 · FurnishedOrUnfurnished 0 | `raw_data.Furnished` | `equals 'Furnished'` | **FIXED** — semantics pinned (D.7) |
| `pets` | `PetsAllowed` | multi-enum | SUPPORTED | 8,156 string / 2 array | `features` + `raw_data` | **exact token** | **FIXED** — was never read (D.8) |
| `keywords` | `PublicRemarks` | String | SUPPORTED | 8,158/8,158 | `raw_data.PublicRemarks` | `string_contains` + `mode: insensitive` | **FIXED** — corpus-wide, case-insensitive |
| `zipCodes` | `PostalCode` | String | SUPPORTED | 200/200 | `postal_code` | `in` | OK |
| `borough` | `CityRegion` | String | SUPPORTED | 200/200 — `StatenIsland` has **no space** | `borough` | contains, insensitive | OK |
| `neighborhood` | `SubdivisionName` | String | SUPPORTED | 200/200 | `neighborhood` + zip expansion | equals / in | OK |
| `address` | `UnparsedAddress` | String | SUPPORTED | 200/200 live; **2/8,158 stored** | `address` jsonb parts | case-variant JSON contains | OK — stored path uses parts |
| `amenities` | 8 feature fields | multi-enum | **`/any()` PROVIDER_REJECTED_400** | see D.9 | `features.*` | token contains / boolean | **FIXED** (D.9) |
| `commercial` | `PropertyType` | enum | SUPPORTED | **0 commercial rows live** | `property_sub_type`, `commercial_sub_type` | in / not null | OK — universe is empty |
| `exclusive` | n/a (Mallan authority) | — | n/a | — | `listing_id` SL-/RL-, `rls_eligible` | prefix / flag | OK |
| `openHouse` / `openHouseDate` | `OpenHouse` resource | resource | UNVERIFIED | UNVERIFIED | separate resource | route-owned | **UNVERIFIED** |
| `propertyType` | — | — | — | — | — | **never set by any UI code** | DEAD KEY |
| `transit` | — | — | — | — | — | not mapped | **UNSUPPORTED** |
| `sort` | n/a | — | — | — | various | orderBy | see D.4 |

---

## D. Corrections applied

1. **Transaction universe.** Live `PropertyType` has 13 members; only `Residential`
   (7,077) and `ResidentialLease` (1,027) are populated in this feed. The Trestle-path
   rule `PropertyType ne 'ResidentialLease'` is *incidentally* equivalent today but is not
   an inclusion contract — `CommercialSale`, `Land`, `Farm`, `BusinessOpportunity`,
   `Specialty` and `MultiFamily` would all be admitted to Buy Residential the moment the
   feed carries one. **Remaining work:** make each tab's universe explicit on the Trestle path.
2. **Bathrooms.** `minBaths=1.5` required `full >= 1 AND half >= 1`, rejecting a
   2-full/0-half apartment; `maxBaths=1` compared only `full <= 1`, admitting a 1.5-bath
   listing. Replaced with an exact expansion of `full + half/2`, NULL half read as zero.
   Six positive/negative/boundary tests. Cotality also exposes `BathroomsOneQuarter`,
   `BathroomsThreeQuarter`, `BathroomsPartial`, `BathroomsTotalInteger` (all Int32, live);
   Mallan stores none of the quarter counts, so they cannot enter a DB predicate today.
3. **Area units.** `LivingAreaUnits` is `SquareFeet` on **8,104/8,104** live Active rows
   (`SquareMeters` 0, `Acres` 0). No normalisation needed for this feed — proven, not assumed.
4. **PropertySubType literals.** `Condo` and `SingleFamilyTownhouse` are **not members** —
   the provider answers `$filter` on them with **HTTP 400**, a hard error, not an empty
   result. `NewConstruction` is not a member either, so `sort=new-development` matched
   nothing. The map now contains only live members; new development uses the
   `NewConstructionYN` boolean (950 rows).
5. **Ownership.** NYC carries condo/co-op in `CommonInterest`, not `PropertySubType`
   (where those members are all zero). Keys are normalised, so `condo`, `Condo`, `CO-OP`
   and `co op` all resolve. Previously `condo` fell through an exact-case map and returned
   **0 results with no error**. Unmappable values now fail closed.
6. **Statuses.** `statuses=Closed` dropped the constraint entirely and returned the full
   Active corpus — failing OPEN. Now returns nothing when no requested status is public.
7. **Furnished.** Five live members. `furnished=true` means strictly `Furnished` (106),
   preserving the prior contract. Whether `Partially` (4) and `Negotiable` (12) should also
   satisfy it is a **product decision — flagged, not silently changed**.
8. **Pets.** The UI emits `pets=true`; the query builder never read it, so the filter was a
   no-op returning the whole corpus. Both `pets=true` and `amenities=pet-friendly` now
   resolve to one predicate. Critically, `PetsAllowed` mixes building- and unit-level
   tokens: `"BuildingYes,No"` means the building allows pets and **the unit does not**. A
   substring test on `Yes` also matches `BuildingYes`, inflating 4,304 to 6,861 — 2,557
   listings a renter with a dog cannot actually rent. Now exact-token matched.
9. **Amenities.** Collection fields reject `/any()` lambda filters (HTTP 400), so amenity
   filtering must be Mallan-side — it cannot be pushed to the provider. Corpus-wide, five
   amenities matched **nothing**: `fireplace` (pointed at `InteriorFeatures`, which has no
   fireplace token in its 45-token live vocabulary — the real field is the `FireplaceYN`
   boolean, 861 rows), plus `no-fee`, `renovated`, `natural-light` and `quiet`, which have
   **no live provider backing at all**. Those four are now rejected with HTTP 400 and
   removed from the UI. `washer-dryer` missed `LaundryFeatures.InUnit` (4,119 rows);
   `garage` used `ParkingFeatures` (597) instead of `GarageYN` (2,630).

---

## E. Still open — explicitly not claimed as done

- **OpenHouse resource** — filterability, population and date semantics UNVERIFIED.
- **Trestle-direct path** — the live-fallback filter builder has NOT been corrected to
  match the DB path; the tab inclusion contract (D.1) lives there.
- **Attribution and permissions as search correctness** — `AttributionContact`,
  `CopyrightNotice`, `Disclaimer`, `Permission`, `InternetEntireListingDisplayYN`,
  `InternetAddressDisplayYN` are all declared live and verified present, but their
  per-surface enforcement across card / list / map / detail / saved-search / compare is
  NOT yet proven.
- **Behavioural mobile/desktop parity** — proven structurally (one `SearchFilterPanel`
  render site, no viewport-gated filters, one serializer in `useListings.ts`), NOT yet
  proven by comparing returned IDs and totals per criterion.
- **Saved-search serialization round-trip** — unproven.
- **Dedupe** — not yet examined.
- **CMA** — must not begin until the above close.

---

## F. Measurement hygiene

Production `/api/listings` probes issued during the Neon autosuspend window are recorded
in `.cache/search-p0/PRODUCTION-TRAFFIC-RECORD.md` (~27 GET requests, each executing a
Prisma query against production Neon). They are deliberate traffic and must not be read as
organic wake events. Production Search probing has **stopped**; the Neon acceptance needs a
clean >5-minute SQL-quiet period after the last entry there. Search verification continues
against live Cotality, the repo, and the isolated Preview branch.
