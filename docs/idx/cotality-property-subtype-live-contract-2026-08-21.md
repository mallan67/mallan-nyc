# `PropertySubType` — LIVE COTALITY CONTRACT

**Probed 2026-08-21T13:44:29Z and 13:46:18Z against `https://api.cotality.com/trestle`.**
Read-only, GET only, OAuth client-credentials, preview env (never production Neon).
Raw evidence: `artifacts/.property-subtype-live-probe.json` ·
`artifacts/.property-subtype-live-probe-2.json`.

Every number below is an HTTP response received in that session. Nothing here is read
from a repo constant, a `$select` list, a mapper table, `artifacts/metadata.xml`, a prior
audit, or another agent's report (CLAUDE.md §A.0). Zero probes returned `UNVERIFIED`.

---

## 1. SHAPE — what the provider declares

```
<Property Name="PropertySubType"
          Type="Cotality.DataStandard.Cotality.DD.Enums.PropertySubType" />

<Property Name="PropertySubTypeAdditional"
          Type="Cotality.DataStandard.Cotality.DD.Enums.Multi.PropertySubTypeAdditional">
```

| | `PropertySubType` | `PropertySubTypeAdditional` |
|---|---|---|
| EDM type | `…Enums.PropertySubType` | `…Enums.**Multi**.PropertySubTypeAdditional` |
| `Collection(...)` wrapper | **no** | **no** |
| shape | **scalar** | **multi** (by namespace, not by `Collection`) |
| `Nullable` attribute | not declared → OData default `true` | not declared → OData default `true` |
| declared members | **75** | **75 — byte-identical list** |

The two enums declare the *same* 75-member vocabulary. They are distinguished by the
`.Multi.` namespace segment and by their live population, **not** by their vocabulary.

> **`Collection()` is not how this feed expresses multi-valued.** A reader checking for
> `Collection(` would classify `PropertySubTypeAdditional` as scalar and be wrong. The
> namespace segment is the signal.

### The 75 declared members

```
Acreage Agriculture Apartment Attached BoatSlip Building BuildingBusiness BuildingLand
BuildingLandBusiness Business BusinessLand Cabin Chalet Cluster Commercial Condominium
CoOwnership DeededParking Detached Dockominium Duplex Earthship Farm FlexibleSpace
Fractional Garage HalfDuplex HotelMotel ImprovedLand Industrial Institutional Investment
Land LiveWork Loft ManufacturedHome ManufacturedOnLand MiningClaim MixedUse MobileHome
MobileHomePark ModularHome MultiFamily MultipleParcels NewHomeCommunity NewHomePlan
NewHomeSpecHome NoLand Office Other OwnYourOwn ParkModel Quadruplex Ranch Recreation
Residential Retail RoomingHouse RoomsForRent SemiDetached SingleFamilyResidence
SitePlanned SpecialPurpose StockCooperative Studio TenancyInCommon Timeshare ToBeBuilt
Townhouse Triplex TwoApartment UnimprovedLand Villa Warehouse WaterPositionWithLand
```

`PropertyType` (a **different** field, 13 members, do not conflate):
`BusinessOpportunity CommercialLease CommercialSale DisasterReliefRental Farm HighRise
Land ManufacturedInPark MultiFamily Residential ResidentialIncome ResidentialLease
Specialty`

---

## 2. OPERATORS — probed, not inferred

Baseline: `StandardStatus eq 'Active'` → **SUPPORTED**, 8,032.

| probe | state | HTTP | count |
|---|---|---|---|
| `PropertySubType eq 'Apartment'` | **SUPPORTED** | 200 | 6,625 |
| `PropertySubType eq 'Townhouse'` | **SUPPORTED** | 200 | 0 |
| `PropertySubType in ('Apartment','Loft')` | **SUPPORTED** | 200 | 6,704 |
| `(PropertySubType eq 'Office' or … eq 'Retail')` | **SUPPORTED** | 200 | 1 |
| OR of all 8 live-populated members | **SUPPORTED** | 200 | 8,021 |
| `PropertySubType ne null` | **SUPPORTED** | 200 | 8,021 |
| `PropertySubType eq null` | **SUPPORTED** | 200 | 11 |
| namespace-qualified literal `…PropertySubType'Apartment'` | **SUPPORTED** | 200 | 6,625 |
| **`contains(PropertySubType,'Apartment')`** | **PROVIDER_REJECTED** | **400** | — |
| **`contains(PropertySubType,'Townhouse')`** | **PROVIDER_REJECTED** | **400** | — |
| `PropertySubType eq 'NotARealMemberZZZ'` | **PROVIDER_REJECTED** | **400** | — |
| **`PropertySubType eq 'apartment'` (lowercase)** | **SUPPORTED** | **200** | **0** |

Provider error text, verbatim:

- `contains(...)` → *"No function signature for the function with name 'contains' matches
  the specified arguments. The function signatures considered are:
  contains(Edm.String Nullable=true, Edm.String Nullable=true)."*
  — `contains` takes strings; `PropertySubType` is an **enum**, not a string.
- invalid literal → *"The string 'NotARealMemberZZZ' is not a valid enumeration type
  constant."*

### The three consequences

1. **`contains(PropertySubType, …)` is a hard HTTP 400.** Not "partial", not "502", not
   "post-filtered by choice". Any request carrying it fails outright.
2. **`eq`, `in` and `or` are all SUPPORTED and arithmetically exact.**
   `in ('Apartment','Loft')` = 6,704 = 6,625 + 79. The 8-member OR = 8,021 = `ne null`.
   Set semantics hold; no double-counting, no residue.
3. **A mis-cased member is a SILENT ZERO, not a rejection.** `'NotARealMemberZZZ'` is
   rejected with 400, but `'apartment'` returns **200 with count 0**. So the provider's
   own validation cannot be relied on to catch a bad token — a lower-cased or
   differently-spelled-but-parseable literal comes back as a legitimate-looking empty
   result set. **Mallan must validate case-exactly, Mallan-side, before the request is
   built.**

---

## 3. POPULATION — exhaustive census, all 75 members

Every one of the 75 declared members was probed individually with `eq` against
`StandardStatus eq 'Active'`. **75/75 SUPPORTED, 0 UNVERIFIED.**

| member | Active count |
|---|---|
| `Apartment` | **6,625** |
| `MultiFamily` | **425** |
| `SingleFamilyResidence` | **402** |
| `Duplex` | **354** |
| `Loft` | **79** |
| `MixedUse` | **72** |
| `Triplex` | **63** |
| `Office` | **1** |
| *the other 67 members* | **0** |

**Sum of the eight = 8,021 = `PropertySubType ne null` exactly.** Coverage is complete;
this is a census, not a sample.

Split by `PropertyType`: `Apartment ∧ ResidentialLease` = 903 · `Apartment ∧ Residential`
= 5,722 → 6,625 exactly.

### Members the UI offers that are populated ZERO **at every status**

Probed without any `StandardStatus` restriction — i.e. the whole accessible feed,
including Closed/Expired/Withdrawn:

| member | count across ALL statuses |
|---|---|
| `Townhouse` | **0** |
| `Condominium` | **0** |
| `StockCooperative` | **0** |
| `UnimprovedLand` | **0** |
| `Retail` | **4** (0 Active) |

These are **valid enum literals that this feed has never carried**. A `Townhouse` search
is not "temporarily empty" — it can never match. This is a live capability fact and a
product problem, and it is **not** the same thing as an invalid token:
`eq 'Townhouse'` returns HTTP 200 count 0 (legitimate empty result), while
`eq 'NotARealMember'` returns HTTP 400. **Valid-and-zero and invalid must never collapse.**

> NYC townhouse inventory evidently reaches this feed as `SingleFamilyResidence` (402) or
> `MultiFamily` (425). That is an **unproven inference** and is recorded here only as a
> question. Per CLAUDE.md §E, no mapping may be built on it until it is established
> against the provider.

---

## 4. `PropertySubTypeAdditional` — a separate provider fact

| probe | state | HTTP | count |
|---|---|---|---|
| `PropertySubTypeAdditional eq 'Apartment'` | SUPPORTED | 200 | 6,625 |
| `PropertySubTypeAdditional eq 'Loft'` | SUPPORTED | 200 | 79 |
| `… has …Multi.PropertySubTypeAdditional'Apartment'` | **SUPPORTED** | 200 | 6,625 |
| `contains(PropertySubTypeAdditional,'Apartment')` | PROVIDER_REJECTED | 400 | — |
| `PropertySubTypeAdditional ne null` | SUPPORTED | 200 | **6,781** |
| `Additional eq 'Apartment' and PropertySubType ne 'Apartment'` | SUPPORTED | 200 | **0** |
| `Additional ne null and PropertySubType eq null` | SUPPORTED | 200 | **0** |

The multi-enum `has` operator works. But on today's Active inventory the field is a
**strictly narrower duplicate**: 6,781 non-null versus 8,021, never disagreeing with
`PropertySubType` and never populated where `PropertySubType` is null. A ten-row sample
shows the two fields carrying identical values.

**It is therefore not folded into the `property_sub_type` criterion.** It is a distinct
provider input; if Advanced Search later needs it, it becomes its own criterion once its
brokerage semantics are established — not before.

---

## 5. WHAT THIS OVERTURNS IN THE REPO

| repo claim | live truth |
|---|---|
| `FIELD_REGISTRY.property_sub_type` → `type: 'multi_enum'` | **scalar** nullable Enum |
| `providerMappingStatus: 'partial'` · `filterable: 'needs_probe'` | **mapped** · **filterable: yes** via `eq`/`in` |
| notes: *"cannot be pushed to `$filter` (502) → post-filtered"* | Cotality answers **400**, not 502. The 502 is **Mallan's own** `/api/idx/search` catch block converting the provider 400. The registry attributed Mallan's error code to the provider. |
| notes: *"some literals invalid (400)"* | True but mis-stated: the UI's literals are all **valid**; four of them are simply **never populated**. Separately, a *mis-cased* literal is not rejected at all — it is a silent zero. |
| `searchParam: 'subTypes'` | The authenticated collector emits **`propertySubType`**; `crm-idx-filter.ts` reads **`propertySubType`**. `subTypes` is read only by the **public** `/api/listings` route. |
| `dbColumn: null` · `projectionColumn: null` | `Listing.property_sub_type` **String?** and `ListingSearchProjection.property_sub_type` **String?** both exist (the projection column is indexed). |

---

## 6. THE CRITERION CONTRACT THIS ESTABLISHES

- provider resource — `Property`
- provider field — `PropertySubType` (never `PropertySubTypeAdditional`)
- provider shape — scalar, nullable, Enum, 75 members
- accepted values — **exact, case-sensitive** live members only
- unknown / mis-cased token — **fail loud Mallan-side.** Never substring-matched, never
  silently dropped, never forwarded to the provider
- multiple selected values — logical **OR of exact members**
- provider rendering — `PropertySubType eq 'X'`, or `(… or …)` for several
- projection rendering — `property_sub_type IN [exact members]`
- Mallan-local authority — by listing authority
- **`CommonInterest` stays separate.** Condo / co-op / condop ownership is its own
  provider fact and is not derivable from `PropertySubType` — the enum's `Condominium`
  and `StockCooperative` members are populated **zero at every status**, so using them as
  an ownership proxy would silently match nothing.

---

## 7. HOW TO RE-VERIFY

`npm run search:verify-live` reads the canonical contract module and re-checks it against
live Cotality, including the `eq` SUPPORTED / `contains` PROVIDER_REJECTED pair. It fails
(exit 1) on drift and exits 2 as `UNVERIFIED` if the provider cannot be reached — never
reporting a transport failure as zero.

---

## 8. CLOSURE PROOF

Every link in the chain re-checked, none assumed.

| link | status | where |
|---|---|---|
| live Cotality `$metadata` | scalar Enum, 75 members | §1, probe artifact |
| exact enum vocabulary | 75/75, byte-identical to the live declaration | `property-subtype-contract.ts` |
| live operator probe | `eq`/`in`/`or` SUPPORTED · `contains` 400 · mis-cased 200/0 | §2 |
| `FIELD_REGISTRY` | corrected and pinned by test | `field-registry.ts` |
| CRM UI value | `Office,Retail` splits to two exact members | behavioural test |
| `buildIdxSearchParams` | forwards `propertySubType` unchanged | `search-engine.js:298` |
| provider OData execution | exact `eq` / OR-of-`eq`, never `contains` | `crm-idx-filter.ts` |
| projection execution | `property_sub_type IN […]`, same set | `criteria-to-prisma.ts` |
| Saved Search round-trip | value-aware capability — an unknown member is reported unsupported, not replayed | `getUnsupportedSearchCriteria` |
| local pre-render | exact-token; a failed search leaves NO universe | `search-engine.js` |
| returned IDs / count | `findMany` and `count` receive one predicate; pagination only on `findMany` | execution test |

### Required tests — all present and behavioural

| requirement | status |
|---|---|
| one exact subtype | PASS |
| multiple exact subtypes | PASS |
| invalid enum member fails loud | PASS |
| `Office,Retail` expands to two members | PASS |
| no substring false-positive | PASS (contract, projection AND browser) |
| third-party Cotality match | PASS |
| Mallan-local canonical match | PASS |
| Mallan-office representation suppressed | PASS — including when its sub-type matches |
| `findMany`/`count` same universe | PASS |

**No schema growth. No production Neon. Public Search zero-delta** — `criteriaToProjectionWhere`
and `runProjectionListingSearch` are imported only by the authenticated CRM saved-search
routes and the alerts cron; `app/search`, `/api/listings` and `SearchFilterPanel` are
untouched.

### What is NOT closed

1. **Production population.** The projection column exists and the projection writer maps
   `Listing.property_sub_type` into it. Actual eligible-row population and parity remain
   **UNVERIFIED** until the Neon cutover census. Code proves a writer, not a population.
2. **The four zero-population controls — a MAPPING question, not a dead capability.**
   `Townhouse` / `Condominium` / `StockCooperative` / `UnimprovedLand` are offered by the
   CRM and are zero on `PropertySubType` at every status.

   **That is evidence the UI label is mapped to the WRONG Cotality fact.** It is not
   evidence the brokerage capability is dead, and these controls are **NOT** to be removed
   or disabled. Townhouse and Multi-Family in particular remain first-class NYC property
   searches whatever provider expression turns out to implement them.

   The live contract declares several candidate representations for the same business
   concepts, and which one carries the inventory has to be measured, never chosen for
   convenience:

   | UI label | business meaning | candidates to census |
   |---|---|---|
   | Townhouse | structure form | `PropertySubType` · **`StructureType`** (Multi-Enum, declares `Townhouse`) |
   | Condo | **ownership structure** | **`CommonInterest eq 'Condominium'`** vs `PropertySubType eq 'Condominium'` |
   | Co-op | **ownership structure** | **`CommonInterest eq 'StockCooperative'`** vs `PropertySubType eq 'StockCooperative'` |
   | Land | general land | **`PropertyType eq 'Land'`** — NOT semantically equal to the `UnimprovedLand` sub-type the UI emits today |
   | Multi-Family | building form | `PropertyType` · `PropertySubType` · `StructureType` all declare `MultiFamily` |

   Condo and co-op are ownership facts, and the UI already uses `CommonInterest` for them
   elsewhere — so one section using `CommonInterest` and another using `PropertySubType`
   for the same business concept is a contradiction to resolve, not a pair of truths to
   preserve. Resolved in the bounded four-control census that follows this contract; the
   UI mapping changes only once live evidence names the correct field.
