# Cotality IDX Plus Web API — Complete Reference

> Single unified reference for every aspect of using Cotality/Trestle on mallan.nyc.
> Replaces the need to read 12+ separate files. Covers: auth, endpoints, fields,
> IDs, address model, OData patterns, mapping, media, display gates, distribution,
> attribution, UI integration, statuses, slugs, sync, compliance, and known limitations.
>
> **Brokerage:** Mallan Real Estate Inc. (#10991205323)
> **Feed license:** IDX Plus - WebAPI (Trestle-11371-20)
> **Base URL:** `https://api.cotality.com/trestle`
> **Access model:** Read-only consumption. Nothing writes back to Cotality.
> **Last verified:** 2026-05-26

---

## MANDATORY ENGINEERING RULE

Any PR touching Cotality/Trestle, address lookup, listing search, media, CRM listing forms, sync, featured listings, or public listing display **must cite this file** in the PR body and state which section it follows.

Example PR body line:
```
Cotality ref: docs/architecture/COTALITY-COMPLETE-REFERENCE.md §18 (CRM Building Lookup)
```

---

## CURRENT BUILDING LOOKUP LIMITATION

> **DO NOT promise complete address autocomplete from `/odata/Property`.**
>
> `/odata/Property` is listing/property feed data — NOT a guaranteed complete building/address master database. It can only return buildings that have or had listings in the REBNY IDX Plus feed. If a building has never had a listing, it will not appear.
>
> **For complete building/address autocomplete, identify the proper Cotality product/resource before implementing.** The correct next step is to ask Cotality support/vendor rep: *"Which IDX Plus Web API resource or product should be used for complete address autocomplete or building master lookup, given that /odata/Property is listing-feed data only?"*
>
> Until that answer exists, manual address entry must always be allowed. A form must never block on building lookup failure.

---

## SYSTEM OWNERSHIP

| System | Role |
|---|---|
| **Cotality/Trestle** | External data provider. REBNY IDX Plus feed via OData v4. Read-only consumption by mallan.nyc. |
| **RealPlus/RLS** | Listing-entry source for official REBNY listings. Maya enters listings into RealPlus; they appear in the Cotality feed as `RLS*` IDs. |
| **mallan.nyc** | Consumes Cotality data for public display, search, building reference, and media. Does NOT write back to Trestle. |
| **InHouse/local web** | Mallan-created website-only records (`SL-*` / `RL-*` IDs). Not on RLS. Must be manually reconciled when an official `RLS*` feed record arrives. |

---

## Table of Contents

1. [Auth](#1-auth)
2. [OData Resources](#2-odata-resources)
3. [The Address Model](#3-the-address-model)
4. [OData Query Patterns](#4-odata-query-patterns)
5. [Field Catalog](#5-field-catalog)
6. [IDs and Keys](#6-ids-and-keys)
7. [Status Lifecycle](#7-status-lifecycle)
8. [Distribution Gates](#8-distribution-gates)
9. [Field Distribution Profiles](#9-field-distribution-profiles)
10. [Mapping: Trestle to DB](#10-mapping-trestle-to-db)
11. [Mapping: DB to Public DTO](#11-mapping-db-to-public-dto)
12. [Media](#12-media)
13. [URL Slugs](#13-url-slugs)
14. [Attribution and Disclaimers](#14-attribution-and-disclaimers)
15. [Sync Pipeline](#15-sync-pipeline)
16. [UI Integration](#16-ui-integration)
17. [Open Houses](#17-open-houses)
18. [CRM Building Lookup](#18-crm-building-lookup)
19. [Sanitization and Security](#19-sanitization-and-security)
20. [Known Limitations and Gotchas](#20-known-limitations-and-gotchas)
21. [InHouse / Local Web Listings](#21-inhouse--local-web-listings)
22. [Featured Listings](#22-featured-listings)
23. [Debugging](#23-debugging)
24. [File Map](#24-file-map)
25. [Env Vars](#25-env-vars)

---

## 1. Auth

**Implementation:** `lib/idx/auth.ts`

| Item | Value |
|---|---|
| Grant type | OAuth2 `client_credentials` |
| Token endpoint | `{TRESTLE_API_URL}/oidc/connect/token` |
| Scope | `api` |
| Env vars | `IDX_CLIENT_ID` (or legacy `IDX_API_KEY`) + `IDX_CLIENT_SECRET` (or `IDX_API_SECRET`) |
| Content-Type | `application/x-www-form-urlencoded` |
| Token cache | In-memory per serverless instance |
| Expiry buffer | 5 minutes before actual expiry (configurable via `IDX_TOKEN_EXPIRY_BUFFER`) |
| Request timeout | 8 seconds (AbortController) |
| POST caching | `cache: "no-store"` (stale tokens cause 401 cascades) |
| 401 retry | On any 401 from a data endpoint, `invalidateToken()` then re-acquire and retry once |

**Token request body:**

```
grant_type=client_credentials
client_id={IDX_CLIENT_ID}
client_secret={IDX_CLIENT_SECRET}
scope=api
```

**Success log:** `[IDX Auth] Token acquired, expires in Ns (refresh at 300s before)`

**Error modes:**

| Error | Cause |
|---|---|
| `[IDX Auth] Missing IDX_CLIENT_ID or IDX_CLIENT_SECRET` | Env var not set |
| `[IDX Auth] Token request failed (401)` | Bad credentials |
| AbortError | Token endpoint took >8s |

**Helper functions:**

| Function | Purpose |
|---|---|
| `getAccessToken()` | Returns cached or fresh Bearer token |
| `hasCredentials()` | Checks if env vars are set (no network call) |
| `invalidateToken()` | Clears cache (call on 401 from data endpoint) |

---

## 2. OData Resources

Base URL: `https://api.cotality.com/trestle`

### Resources actively used

| Resource | Endpoint | Fields | Purpose |
|---|---|---|---|
| **Property** | `/odata/Property` | 745 (527 IDX Plus) | Listing data — the primary resource |
| **Media** | `/odata/Media` | 55 (46 IDX Plus) | Photos, floorplans, videos, virtual tours |
| **OpenHouse** | `/odata/OpenHouse` | 47 (39 IDX Plus) | Open house events |

### Resources available but not actively queried

| Resource | Endpoint | Fields | Notes |
|---|---|---|---|
| Member | `/odata/Member` | 90 (72 IDX Plus) | Agent data. Available but not queried by routes. |
| Office | `/odata/Office` | 79 (66 IDX Plus) | Office data. Available but not queried by routes. |
| CustomProperty | `$expand=CustomProperty` on Property | 140 (106 IDX Plus) | FARE Act fees. **Expansion currently rejected by Trestle with HTTP 400.** |
| PropertyUnitTypes | `$expand=UnitTypes` on Property | 52 (46 IDX Plus) | Multi-unit data |
| Teams | `/odata/Teams` | 48 | Agent teams (beyond IDX Plus spec) |
| TeamMembers | `/odata/TeamMembers` | 29 | Team member roles (beyond IDX Plus spec) |
| PropertyRooms | `$expand=Rooms` on Property | 39 | Room-by-room data (beyond IDX Plus spec) |
| PropertyGreenVerification | Navigation from Property | 39 | Green certifications (beyond IDX Plus spec) |
| Building | `$expand=Building` on Property | 1 (key only) | **Empty shell — no data fields** |

### System/metadata resources

| Resource | Purpose |
|---|---|
| Field | Field metadata (name, type, length, lookup) |
| Lookup | Picklist/enum value definitions |
| Model | Data model metadata |
| DataSystem | System info, transport version |
| Enumeration | Enum value definitions |

**Total:** 12 data resources (1,364 fields) + 5 system resources

### CRITICAL: What does NOT exist on Trestle

There is no dedicated building database, address master, geocoding service, or parcel lookup endpoint. `/odata/Property` contains **listing records**, not a comprehensive building/address database. It only returns buildings that have or had listings in the REBNY IDX Plus feed. If a building has never had a listing, it will not appear.

---

## 3. The Address Model

**Implementation:** Verified against `artifacts/metadata.xml` (live Trestle `$metadata`)

Cotality uses RESO-standard structured address fields. The address is decomposed, NOT stored as a single string.

### Address fields on Property

| Field | Type | Max Length | Example | Purpose |
|---|---|---|---|---|
| `StreetNumber` | String | 25 | `"333"` | Numeric street number |
| `StreetDirPrefix` | Enum (StreetDirection) | — | `"E"` | Directional prefix (E, W, N, S, NE, NW, SE, SW) |
| `StreetName` | String | 50 | `"46TH"` | Street name WITHOUT direction |
| `StreetSuffix` | Enum (StreetSuffix) | — | `"St"` | Street type suffix |
| `StreetDirSuffix` | Enum (StreetDirection) | — | — | Directional suffix (rare in NYC) |
| `UnitNumber` | String | 25 | `"17C"` | Apartment/unit |
| `City` | String | — | `"New York"` | City name |
| `CityRegion` | String | — | `"Manhattan"` | Borough (NYC-specific) |
| `SubdivisionName` | String | — | `"Upper East Side"` | Neighborhood (REBNY official picklist) |
| `PostalCode` | String | — | `"10017"` | ZIP code |
| `PostalCity` | String | — | — | Postal city (rarely used) |
| `StateOrProvince` | String | — | `"NY"` | State |
| `CountyOrParish` | String | — | `"New York"` | County (maps to borough) |
| `Country` | String | — | `"US"` | Country |
| `CrossStreet` | String | — | — | Cross streets |
| `Directions` | String | — | — | Directions text |
| `Latitude` | Decimal | — | `40.749` | Present in `$metadata` but **always null on the IDX Plus feed** — not usable for map/transit filtering (separate geocode backfill) |
| `Longitude` | Decimal | — | `-73.973` | Present in `$metadata` but **always null on the IDX Plus feed** — not usable for map/transit filtering |
| `UnParsedAddress` | String | 255 | `"333 E 46TH St"` | Display-only concatenation. **NOT for searching.** |
| `BuildingName` | String | — | `"The Corinthian"` | Building name (when known) |

### StreetDirection enum values

`E`, `N`, `NE`, `NW`, `S`, `SE`, `SW`, `W`

### Critical rules

1. **`StreetDirPrefix` is SEPARATE from `StreetName`.** "East" is NOT part of the street name. "333 East 46th Street" = StreetNumber `333` + StreetDirPrefix `E` + StreetName `46TH` + StreetSuffix `St`.
2. **Direction values are abbreviated:** East→`E`, West→`W`, North→`N`, South→`S`.
3. **`StreetName` contains the name portion only:** `"46TH"`, `"PARK"`, `"BROADWAY"`. Never `"East 46th"`.
4. **Case is mixed** in Trestle data — `"46TH"`, `"Park"`, `"BROADWAY"` all occur. Always use `tolower()` in OData queries.
5. **Ordinal suffixes may or may not be present.** Trestle stores both `"46TH"` and `"46"`. Strip ordinals (TH/ST/ND/RD) before searching.
6. **`UnParsedAddress` is display-only.** Never use it for OData filtering — it's a concatenation with inconsistent formatting.

### Borough ↔ County mapping

| Borough | CountyOrParish |
|---|---|
| Manhattan | New York |
| Brooklyn | Kings |
| Queens | Queens |
| Bronx | Bronx |
| Staten Island | Richmond |

This mapping is used in `lib/idx/display-adapter.ts`, `lib/idx/db-to-public-dto.ts`, `lib/search/public-listing-trestle.ts`.

---

## 4. OData Query Patterns

### Proven working address search pattern

Source: `lib/search/public-listing-trestle.ts:100-111` (the canonical public search)

```
startswith(StreetNumber,'333')
and StreetDirPrefix eq 'E'
and contains(tolower(StreetName),'46')
```

### Required elements for address queries

| Element | Pattern | Why |
|---|---|---|
| StreetNumber | `startswith(StreetNumber,'333')` | Handles partial input; `eq` for exact-only |
| StreetDirPrefix | `StreetDirPrefix eq 'E'` | Enum comparison, uppercase single letter |
| StreetName | `contains(tolower(StreetName),'46')` | **Must use `tolower()`** — mixed case |
| Strip suffixes | Remove St/Street/Ave/Avenue/Blvd etc. before searching | Not part of `StreetName` |
| Strip ordinals | Remove TH/ST/ND/RD from digits | `46TH` → `46` for reliable matching |
| Lowercase search token | Search term lowercased for `tolower()` | Case-insensitive matching |

### Forbidden patterns

| Pattern | Why |
|---|---|
| `contains(StreetName,'46TH')` without `tolower()` | Case-sensitive. Fails on mixed-case data. |
| `contains(StreetName,'EAST')` | "East" is in `StreetDirPrefix`, not `StreetName` |
| Guessing from unparsed full address | Must parse into RESO components first |
| `$filter=InternetEntireListingDisplayYN eq true` | **Trestle returns HTTP 400** — `"Results from 'RLS' has been suppressed (provider Level)"`. REBNY pre-filters this. |
| `$filter=PropertySubType eq '...'` | **Crashes Trestle with HTTP 502** for most values |
| `$filter=NewConstructionYN eq true` / `NewDevelopmentYN eq true` | **Not exposed on IDX Plus feed** — returns empty |

### Standard status filter

```
StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract'
```

### Listing type filter

| Type | OData |
|---|---|
| Sale | `PropertyType ne 'ResidentialLease'` |
| Rental | `PropertyType eq 'ResidentialLease'` |

### Price, beds, baths, sqft

| Filter | OData |
|---|---|
| Min price | `ListPrice ge {value}` |
| Max price | `ListPrice le {value}` |
| Min beds | `BedroomsTotal ge {value}` |
| Max beds | `BedroomsTotal le {value}` |
| Min baths | `BathroomsFull ge {value}` |
| Min sqft | `LivingArea ge {value}` |
| Max sqft | `LivingArea le {value}` |

### Ownership type (Condo/Co-op/Condop)

```
CommonInterest eq 'Condominium'
CommonInterest eq 'StockCooperative'
CommonInterest eq 'Condop'
```

**NOT** PropertySubType — that crashes Trestle.

### Borough (via county)

```
CountyOrParish eq 'New York'       -- Manhattan
CountyOrParish eq 'Kings'          -- Brooklyn
```

### Neighborhood (via ZIP codes)

Neighborhoods are mapped to ZIP codes in `lib/geo/neighborhood-zips.ts`. OData uses:

```
PostalCode eq '10022' or PostalCode eq '10021'
```

### Keywords (public remarks only)

```
contains(tolower(PublicRemarks),'doorman')
```

**Compliance:** Only search `PublicRemarks` (PUB-tier). Never `PrivateRemarks` or `ShowingInstructions` (HID tier).

### Building name

```
contains(tolower(BuildingName),'corinthian')
```

### Year built

| Filter | OData |
|---|---|
| Pre-war | `YearBuilt le 1946` |
| Post-war | `YearBuilt ge 1947` |

### Agent historical listings

```
(ListAgentMlsId eq '{id}' or BuyerAgentMlsId eq '{id}')
and (StandardStatus eq 'Closed' or StandardStatus eq 'Expired' or StandardStatus eq 'Hold' or StandardStatus eq 'Withdrawn')
```

### Incremental sync (dual-timestamp cursor)

```
(ModificationTimestamp gt {timestamp} or PhotosChangeTimestamp gt {timestamp})
```

Photo-only edits bump `PhotosChangeTimestamp` without bumping `ModificationTimestamp`. The dual cursor catches both.

### Pagination

Trestle uses `@odata.nextLink` for cursor-based pagination. Follow the link until null. Max `$top` is 500.

### Response format

```json
{
  "value": [ { ... }, { ... } ],
  "@odata.nextLink": "https://api.cotality.com/trestle/odata/Property?...",
  "@odata.count": 1234
}
```

---

## 5. Field Catalog

### IDX Plus fields: 29 categories (B1–B29 + B30)

The full field list lives in `lib/idx/trestle-mapper.ts`. Summary:

| Category | Code | Count | Key fields |
|---|---|---|---|
| Address | B1 | 25 | StreetNumber, StreetName, StreetDirPrefix, UnitNumber, City, PostalCode, CityRegion, SubdivisionName, Latitude, Longitude |
| Classification | B2 | 18 | ListingId, PropertyType, PropertySubType, CommonInterest, OwnershipType, StructureType, NewConstructionYN, NumberOfUnitsTotal, StoriesTotal |
| Listing Agreement | B3 | 13 | ListingAgreement, ListingContractDate, ExpirationDate, MlsStatus, InternetEntireListingDisplayYN, InternetAddressDisplayYN, Permission |
| Status & Dates | B4 | 32 | StandardStatus, ModificationTimestamp, StatusChangeTimestamp, ActivationDate, OnMarketDate, CloseDate, ClosePrice, DaysOnMarket, ListPrice, OriginalListPrice |
| Pricing Extras | B5 | 8 | SpecialListingConditions, Concessions, ConcessionsAmount, LeaseAmount |
| Display Flags | B6 | 4 | InternetAutomatedValuationDisplayYN, InternetConsumerCommentYN, SyndicateTo, ListingURL |
| Remarks | B7 | 8 | PublicRemarks, PrivateRemarks, SyndicationRemarks, ShowingInstructions, PropertyCondition |
| List Agent & Office | B8 | 18 | ListAgentMlsId, ListAgentFullName, ListAgentEmail, ListAgentDirectPhone, ListOfficeName, ListOfficeMlsId |
| Co-List Agents | B9 | 24 | CoListAgent fields |
| Buyer Agent & Office | B10 | 18 | BuyerAgentMlsId, BuyerAgentFullName, BuyerOfficeName |
| Co-Buyer Agent | B11 | 14 | CoBuyerAgent fields |
| Unit Rooms & Size | B12 | 25 | BedroomsTotal, BathroomsFull, BathroomsHalf, LivingArea, RoomsTotal |
| Building Details | B13 | 23 | BuildingName, YearBuilt, ArchitecturalStyle, Heating, Cooling, FloorNumber |
| Building Amenities | B14 | 20 | BuildingFeatures, AttendanceType, PoolFeatures, SpaFeatures, WalkScore |
| Financial — Unit | B15 | 14 | AssociationFee, AssociationFeeFrequency, TaxAnnualAmount, TaxYear |
| Financial — Building | B16 | 10 | GrossIncome, NetOperatingIncome, NumberOfUnitsTotal, CapRate |
| Expenses | B17 | 16 | ElectricExpense, InsuranceExpense, MaintenanceExpense, WaterSewerExpense |
| Concessions | B18 | 4 | Concessions, ConcessionsAmount, ConcessionsComments |
| Lot & Land | B19 | 15 | LotSizeArea, LotFeatures, FrontageLength, ZoningDescription |
| Unit Features | B20 | 19 | InteriorFeatures, ExteriorFeatures, Flooring, FireplaceYN, Appliances, Exposures, Furnished |
| Parking | B21 | 8 | ParkingFeatures, ParkingTotal, GarageSpaces, GarageYN |
| Outdoor & Pets | B22 | 8 | PetsAllowed, PetRestrictions |
| Showings | B23 | 8 | ShowingInstructions, ShowingContactName, LockBoxType |
| New Development | B24 | 6 | NewConstructionYN, NewDevelopmentYN, DevelopmentStatus |
| Green / Energy | B25 | 8 | GreenEnergyEfficient, PowerProductionType |
| Media | B26 | 17 | PhotosCount, PhotosChangeTimestamp, VirtualTourURLUnbranded, VideosCount |
| Rental-Specific | B27 | — | LeaseAmount, AvailabilityDate, Furnished, PetsAllowed, MoveInCosts, OngoingFees, TenantPaysDescription |
| Other / Misc | B29 | 12 | Disclaimer, CopyrightNotice, CountyOrParish, ListingKeyNumeric |
| FARE Act Custom | B30 | 4 | AdditionalFee, AdditionalFeeDescription, AdditionalFeeYN, FeeFrequency — **legacy CustomProperty fallback** (`$expand=CustomProperty` currently 400s). Canonical FARE public display is `MoveInCostsAmount` / `MoveInCostsComments` (live Property fields). |

### RESO-to-RLS renames (23 fields)

Trestle sends the RLS name; the mapper normalizes to canonical. Defined in `lib/idx/trestle-mapper.ts`:

| Trestle sends | We normalize to |
|---|---|
| SourceSystemKey | ListingKey |
| MlsStatus | StandardStatus |
| SourceSystemModificationTimestamp | ModificationTimestamp |
| UnParsedAddress | UnparsedAddress |
| ListAgentMlsId | ListAgentKey |
| BuyerAgentMlsId | BuyerAgentKey |
| ListOfficeMlsId | ListOfficeKey |
| BuyerOfficeMlsId | BuyerOfficeKey |
| DuplicateListingIDs | CoExclusiveListingKey |
| ... (13 more) | See `RESO_TO_RLS_RENAMES` in trestle-mapper.ts |

### Fields NOT on Trestle (code must NOT use these)

| Field | Status | Correct Equivalent |
|---|---|---|
| `IDXEntireListingDisplayYN` | Does NOT exist | `InternetEntireListingDisplayYN` |
| `SyndicateYN` (boolean) | Does NOT exist | `SyndicateTo` (String List, Multi) |
| `VOWEntireListingDisplayYN` | Does NOT exist | — |
| `VOWAutomatedValuationDisplayYN` | Does NOT exist | — |
| `VOWConsumerCommentYN` | Does NOT exist | — |
| `MoveInCostsAmountTotal` | Does NOT exist (phantom; legacy fallback only) | `MoveInCosts` is a multi-select enum; use live `MoveInCostsAmount` for the dollar amount |
| `YearRenovated` | Does NOT exist | — |
| `PossessionDate` | RESO field, Trestle ignores | `AvailabilityDate` |
| `FirstShowingDate` | Does NOT exist | `ActivationDate` |

### Fields excluded from IDX Plus feed `$select`

85 fields exist in the full RLS spec but are NOT available on the IDX Plus feed — requesting them in `$select` may cause HTTP 400. Full list in `IDX_PLUS_EXCLUDED_FIELDS` in `trestle-mapper.ts`. Key exclusions:

- All alternate address fields (`AlternateStreetName`, etc.)
- `NewDevelopmentYN` (use PublicRemarks heuristic)
- Several team/co-agent MLS IDs
- `BathroomsTotal`, `CeilingHeightFeet`, `CeilingHeightInches`
- `AttendanceType`, `ElevatorYN`, `GymYN`, `DoormanYN`, `StorageYN`
- Media navigation properties (use separate `/odata/Media` query)
- FARE Act custom property fields (need `$expand=CustomProperty` — broken)

---

## 6. IDs and Keys

| Field | Type | Uniqueness | Example | Used for |
|---|---|---|---|---|
| `ListingId` | String | Unique within MLS | `"RLS20061539"` | Primary upsert key in our DB |
| `ListingKey` | String | Unique across MLOs | `"RLS20061539"` | Mapping from `SourceSystemKey` |
| `ListingKeyNumeric` | Int64 | Unique across MLOs | `12345678` | Media lookup key fallback |
| `ListAgentMlsId` | String | Per-agent | `"39361"` | Agent identification (REBNY MLS ID, NOT NY state license) |
| `ListOfficeMlsId` | String | Per-office | `"O-1234"` | Office identification |
| `BuyerAgentMlsId` | String | Per-agent | — | Buyer-side agent on closed deals |

### ID naming on our DB

| DB column | Source |
|---|---|
| `listing_id` | Trestle `ListingId` |
| `mls_id` | Trestle `ListingKey` (via SourceSystemKey rename) |

### Local listing IDs (CRM-generated, NOT from Trestle)

| Format | Meaning |
|---|---|
| `SL-XXXX` | Sale listing (InHouse/website-only) |
| `RL-XXXX` | Rental listing (InHouse/website-only) |
| `RLS*` | Official REBNY feed listing |

These are different key spaces. No automated dedup between `SL-*` and `RLS*` — reconciliation is manual.

---

## 7. Status Lifecycle

### RESO StandardStatus values

| Status | Public Display? | IDX? | DOM Accrues? | Terminal? |
|---|---|---|---|---|
| `Active` | Yes | Yes | Yes | No |
| `ComingSoon` | Yes (with badge) | Yes | No | No |
| `ActiveUnderContract` | Yes | Yes | Yes | No |
| `Pending` | Yes | Yes | Yes | No |
| `Closed` | Remove in 24hrs | No | Stops (resets to 0) | **Yes** |
| `Sold` | No | No | — | **Yes** |
| `Leased` | No | No | — | **Yes** |
| `Rented` | No | No | — | **Yes** |
| `Withdrawn` | No | No | Paused (resets 30d) | **Yes** |
| `Expired` | No | No | — | **Yes** |
| `Cancelled` | No | No | Paused (resets 30d) | **Yes** |
| `Hold` | No | No | Paused | No |

### Terminal statuses (force `idx_display_yn = false`)

Defined in `trestle-mapper.ts`:

```ts
TERMINAL_STATUSES = new Set(['Closed', 'Sold', 'Leased', 'Rented', 'Withdrawn', 'Expired', 'Cancelled']);
```

### Status normalization

`normalizeStandardStatus()` in `trestle-mapper.ts` handles:
- Case folding: `"active"` → `"Active"`, `"CLOSED"` → `"Closed"`
- Alias resolution: `"canceled"` (single L) → `"Cancelled"` (double L, RESO canonical)
- Trim: `" Active "` → `"Active"`
- Unknown values preserved (not silently coerced)

### CRM lifecycle statuses (not from Trestle)

`Draft`, `Incomplete`, `Pending` — used for InHouse listings before they go active.

---

## 8. Distribution Gates

Six gates control whether a listing is publicly displayable. Implemented in `lib/compliance/gates.ts`.

### The 6 gates

| Gate | Field | Fail behavior | Semantics |
|---|---|---|---|
| **Gate 1: Owner Opt-Out** | `Permission = 'OwnerOptOut'` or `'Owner Opt-Out'` or `MlsStatus = 'OwnerOptOut'` | Fail closed | If owner opted out, listing is never displayed anywhere |
| **Gate 2: Participant Only** | `Permission = 'Private'` | Fail closed | Only co-brokers see it; no public/IDX display |
| **Gate 3: Internet Display** | `InternetEntireListingDisplayYN` | **IDX Plus pre-filter: null = displayable** | REBNY pre-filters non-displayable rows OUT of the feed. Null means "already gated in." Only explicit `false` blocks. |
| **Gate 4: Address Display** | `InternetAddressDisplayYN` | **IDX Plus pre-filter: null = displayable** | Same pre-filter logic as Gate 3. When `false`, address must be suppressed but listing can still display. |
| **Gate 5: AVM Display** | `InternetAutomatedValuationDisplayYN` | **Fail closed** (null = false) | Per-row opt-out. ~97% true, ~3% false in live feed. |
| **Gate 6: Consumer Comment** | `InternetConsumerCommentYN` | **Fail closed** (null = false) | Per-row opt-out. Same distribution as Gate 5. |

### CRITICAL: The IDX Plus pre-filter distinction

Gates 3 and 4 use `!== false` (null = displayable).
Gates 5 and 6 use `affirmPermission()` (null = blocked).

**Why they differ:** REBNY's policy layer pre-filters non-displayable rows BEFORE they reach the IDX Plus feed. So any row that arrives in the feed has already passed the Internet display gate — null means "REBNY already said yes." This was proven by the 2026-04-30 incident where using `affirmPermission()` on InternetEntireListingDisplayYN suppressed 7,594 rows that should have been displayable. Full incident at `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md`.

Gates 5 and 6 are per-row opt-out flags that REBNY DOES populate at the row level (~97% true), so null legitimately means "not set" = deny.

### The aggregate gate: `idx_display_yn`

```
idx_display_yn =
  rls_eligible
  AND NOT is_terminal (status not in TERMINAL_STATUSES)
  AND internet_entire_listing_display_yn (Gate 3)
  AND NOT participant_only (Gate 2)
  AND NOT owner_opt_out (Gate 1)
```

Computed by `computeGateColumns()` in `trestle-mapper.ts`. All 5 gate columns + the aggregate are written to the `listings` DB table on every upsert.

### `rls_eligible` flag

| Value | Meaning |
|---|---|
| `true` (default) | REBNY-eligible listing — all 6 gates apply |
| `false` | Website-only (InHouse/commercial) — forces `idx_display_yn = false` regardless of other gates |

---

## 9. Field Distribution Profiles

Every field has a distribution profile controlling who can see it. Implemented in `trestle-mapper.ts`.

| Profile | Meaning | Who sees it |
|---|---|---|
| `PUB` | Public display | Everyone (website visitors) |
| `PUB-A` | Public with address gate | Everyone, but only if InternetAddressDisplayYN = true |
| `AGT` | Agent-only | Logged-in agents/brokers in CRM |
| `HID` | Hidden/private | Never shown to public or external agents |
| `CTL` | Control/gate field | Internal gate evaluation only |
| `CLOSE` | Closed-transaction only | Public only after listing closes |
| `SYS` | System/internal | Internal metadata only |

### Key field classifications

**HID (never exposed):**
- PrivateRemarks, ShowingInstructions, ShowingContactPhone/Name/Type
- LockBoxType, LockBoxLocation
- ListAgentDirectPhone, ListAgentEmail, ListAgentURL
- CoListAgentDirectPhone/Email/URL

**CTL (gate evaluation only):**
- InternetEntireListingDisplayYN, InternetAddressDisplayYN
- InternetAutomatedValuationDisplayYN, InternetConsumerCommentYN
- Permission, SyndicateTo
- All legacy IDX*/VOW* field names (defensive guards)

**CLOSE (closed transactions only):**
- CloseDate, ClosePrice
- BuyerAgent/BuyerOffice name, key, MLS ID

### Private fields stripped before DB storage

`stripPrivateFields()` removes 30+ fields before persisting `raw_data`. Full list in `PRIVATE_FIELDS` set in `trestle-mapper.ts`. Includes PrivateRemarks, ShowingInstructions, agent emails/phones, LockBox data.

### Raw data slimming

`slimRawData()` from `lib/compliance/raw-data-keep-fields.ts` further reduces raw_data to only the ~75 fields actually read by consumers (of 1,457 that Trestle sends per row). This is the Neon storage shedding lever.

---

## 10. Mapping: Trestle to DB

**Implementation:** `mapTrestleToPrisma()` in `lib/idx/trestle-mapper.ts`

### Input → Output

| Input | Output |
|---|---|
| Raw Trestle OData record (745+ fields) | Prisma listing upsert object |

### Process

1. **Normalize renames** — Apply `RESO_TO_RLS_RENAMES` (23 field renames)
2. **Infer listing type** — `PropertyType` contains "lease"/"rental" → `rent`, else → `sale`
3. **Infer borough** — `CountyOrParish` or `City` → borough name
4. **Extract neighborhood** — `SubdivisionName` (not `CityRegion` which is borough)
5. **Compute distribution gates** — `computeGateColumns()` for all 5 gate columns
6. **Pick JSONB columns** — Address (B1), Features (B2+B12-B25+B27+B29+B30), Compliance (B3-B7), Agent Info (B8-B11)
7. **Normalize media** — Always produce an array (not the B26 summary object)
8. **Strip private fields** — Remove HID-tier fields from raw_data
9. **Slim raw data** — Keep only ~75 fields actually used by consumers
10. **Set timestamps** — ModificationTimestamp, ListingContractDate, last_synced_from_trestle

### DB columns written

| Column | Source |
|---|---|
| `listing_id` | `ListingId` or `ListingKey` |
| `mls_id` | `ListingKey` |
| `status` | `StandardStatus` or `MlsStatus` |
| `listing_type` | Inferred from `PropertyType` |
| `property_type` | `PropertyType` |
| `property_sub_type` | `PropertySubType` |
| `list_price` | `ListPrice` (as String for Decimal) |
| `bedrooms_total` | `BedroomsTotal` |
| `bathrooms_full` | `BathroomsFull` |
| `bathrooms_half` | `BathroomsHalf` |
| `living_area` | `LivingArea` (as String for Decimal) |
| `borough` | Inferred from `CountyOrParish`/`City` |
| `neighborhood` | `SubdivisionName` |
| `city` | `City` |
| `postal_code` | `PostalCode` |
| `idx_display_yn` | Computed aggregate gate |
| `internet_entire_listing_display_yn` | Gate 3 |
| `internet_address_display_yn` | Gate 4 |
| `internet_automated_valuation_display_yn` | Gate 5 |
| `internet_consumer_comment_yn` | Gate 6 |
| `participant_only` | Gate 2 |
| `owner_opt_out` | Gate 1 |
| `address` | JSONB — B1 fields |
| `features` | JSONB — B2+B12-B25+B27+B29+B30 fields |
| `media` | JSONB array of `{url, mediaType, order}` |
| `compliance` | JSONB — B3-B7 fields |
| `agent_info` | JSONB — B8-B11 fields |
| `raw_data` | JSONB — slimmed raw Trestle record |
| `modification_timestamp` | `ModificationTimestamp` |
| `listing_contract_date` | `ListingContractDate` |
| `last_synced_from_trestle` | `new Date()` |
| `sync_status` | `"synced"` |

---

## 11. Mapping: DB to Public DTO

**Implementation:** `toPublicDTO()` in `lib/idx/public-dto.ts`

The PublicListingDTO is the shape returned by `GET /api/listings` and `GET /api/listings/:id`. It strips private data and enforces compliance.

### What gets stripped

- `PrivateRemarks` — never included
- `ListAgentEmail`, `ListAgentDirectPhone`, `ListAgentMlsId` — agent PII
- `ShowingInstructions`, `LockBoxType`, `LockBoxLocation` — showing logistics
- Address when `InternetAddressDisplayYN = false` — replaced with "Address Undisclosed"
- Lat/Lng when address is suppressed — prevents map pin leaking location

### Property type display mapping

`mapPropertyTypeToDisplay()` in `public-dto.ts`:

| CommonInterest | Display |
|---|---|
| `Condominium` | `Condo` |
| `StockCooperative` | `Co-op` |
| `Condop` | `Condop` |
| (fallback to PropertySubType) | `Townhouse`, `House`, `Multi-Family`, `Loft`, etc. |
| (no match) | `Residential` |

### Attribution

Every public DTO includes:
```ts
_displayCompliance: {
  requiresAttribution: true,
  attributionText: `Listing courtesy of ${listOfficeName}`,
  disclaimerRequired: true,
  comingSoon: boolean,
  comingSoonDate: string,
}
```

### Co-listed siblings annotation

`annotateCoListedSiblings()` adds `_coListedCount` and `_coListedBrokerages` to listings that share the same physical address on the same results page. Used to render "Also listed by Corcoran, Douglas Elliman" badges.

---

## 12. Media

### Fetching media from Trestle

**Implementation:** `fetchListingMedia()` in `lib/idx/fetch.ts`

Endpoint: `/odata/Media`

Key fields: `MediaURL`, `MediaType`, `MediaCategory`, `Order`, `ShortDescription`, `PreferredPhotoYN`, `MediaStatus`

### CRITICAL: Use `ResourceRecordKey`, NOT `ResourceRecordID`

- `ResourceRecordKey` = always unique across MLOs (matches `Property.ListingKey`)
- `ResourceRecordKeyNumeric` = numeric, always unique
- `ResourceRecordID` = **NOT unique across MLOs** — last resort fallback only

The fetch tries keys in priority order: ResourceRecordKeyNumeric → ResourceRecordKey → ResourceRecordID (last resort).

### Filter: exclude deleted

```
$filter=ResourceRecordKey eq '{key}' and MediaStatus ne 'Deleted'
```

### `$expand=Media` is BROKEN

Trestle consistently rejects `$expand=Media` on Property queries with HTTP 400. Always use a separate `/odata/Media` query instead. This is opt-in only via `expandMedia: true` in fetch options.

### `$expand=CustomProperty` is also BROKEN

Trestle rejects the previously-default `$expand=CustomProperty($select=DownPaymentAssistanceAmount,...)` with HTTP 400. Bare `$expand=CustomProperty` may work but is untested. Opt-in only via `expandCustomProperty: true`.

### Media classification

**Implementation:** `lib/media/listing-media-resolver.ts`

Every media item is classified:

| Class | Detection |
|---|---|
| `photo` | Default. `MediaCategory` = "Photo" or no other match. |
| `floorplan` | `MediaCategory` contains "floor plan"/"floorplan", OR `ShortDescription` contains "floor plan", OR URL matches `/Media/Property/DOCUMENT-(Gif|Jpeg|Png|Pdf)/` |
| `video` | `MediaCategory` = "video", OR URL ends in `.mp4/.avi/.mov/.webm`, OR URL contains youtube/vimeo/wistia |
| `virtualTour` | `MediaCategory` contains "virtual tour"/"3d", OR URL contains matterport/iguide |

### Sort order

Photos first → Floorplans → Videos → Virtual Tours → Unknown. Within each class, original provider order preserved. `PreferredPhotoYN = true` gets order -1 (always first).

### Trestle URL proxying

Trestle media URLs require Bearer auth. URLs from `cotality.com` or `corelogic.com` are routed through `/api/media/proxy?url=` so the browser doesn't need the token.

### R2 upload pipeline

`lib/media/media-sync-service.ts` → uploads Trestle photos to Cloudflare R2 at `images.mallan.nyc`. Only processes listings that pass display gates. Skips deleted media.

---

## 13. URL Slugs

**Implementation:** `lib/listing-slug.ts`

### Format

| Condition | Slug format | Example |
|---|---|---|
| Address displayable + has listing ID | `{address}-{listingId}` | `400-east-90th-street-apt-17c-new-york-ny-10128-rls20061539` |
| Address displayable, no ID | `{address}` | `400-east-90th-street-apt-17c-new-york-ny-10128` |
| Address suppressed (`InternetAddressDisplayYN = false`) | `listing-{mlsId}` | `listing-rls20061539` |

### Detail page URL

```
/listing/{slug}?key={listingId}
```

The `?key=` parameter allows reliable server-side resolution via direct ListingId lookup. The slug alone is resolved via address parsing as a fallback.

### Unit number handling

Hyphens and spaces in unit numbers are collapsed: `"17-C"` → `"17c"`, `"8 H"` → `"8h"`.

---

## 14. Attribution and Disclaimers

### REBNY UCBA Art. III §2(C) — Listing broker attribution

Every listing displayed publicly must attribute the **actual listing broker** (not the displaying broker). The attribution text is:

```
Listing courtesy of {ListOfficeName}
```

If `ListOfficeName` is missing, fall back to `"REBNY RLS"` — never `"Mallan Real Estate Inc."` (that would falsely attribute every listing to us).

### IDX disclaimer

Required on pages showing third-party IDX data. NOT required on InHouse/website-only listings.

### Brokerage identification

| Item | Value |
|---|---|
| Brokerage name | Mallan Real Estate Inc. |
| Broker license | #10991205323 |
| Contact phone | 646-258-4460 |
| Address | 400 East 90th Street, Suite 17C, NY 10128 |
| Principal broker | Maya Allan (agent license #10311201806) |

### FARE Act disclosure (NYC rentals)

Required on all rental listings per NYC LL 119/2024. Covers move-in costs, ongoing fees, and tenant-paid expenses.

**Canonical FARE public-display fields (live Property):**
- `MoveInCosts` — multi-select enum (cost types)
- `MoveInCostsAmount` — live Property `Edm.Decimal(14,2)` (move-in dollar amount)
- `MoveInCostsComments` — live Property `Edm.String(1024)` (move-in disclosure text)
- `OngoingFees`, `TenantPays`, `TenantPaysDescription`

`AdditionalFee` / `AdditionalFeeDescription` / `AdditionalFeeYN` / `FeeFrequency` are **legacy CustomProperty fallback** only. `MoveInCostsAmountTotal` is **phantom** — does not exist on live Trestle (legacy fallback only).

---

## 15. Sync Pipeline

**Implementation:** `lib/idx/sync.ts` → called by `/api/cron/idx-sync`

### Process

1. **Read watermark** — `SyncState.last_sync_timestamp` from DB
2. **Build incremental filter** — dual-timestamp cursor (ModificationTimestamp OR PhotosChangeTimestamp > watermark)
3. **Fetch from Trestle** — `fetchFromTrestle()` with pagination
4. **For each record:**
   a. Validate required fields (`validateRequiredFields()` — 11 fields minimum)
   b. Check distribution gates (`checkDistributionGates()`)
   c. Map to Prisma (`mapTrestleToPrisma()`)
   d. Upsert to DB (`prisma.listing.upsert()`)
   e. Build listing search projection
   f. Log audit event
5. **Update watermark** — MAX(modification_timestamp) from fetched records
6. **Media backfill** — batch media fetch for listings missing photos

### Diagnostic audit events

On failure, `recordSyncDiagnostic()` persists error details (error name, message, Prisma code, stack excerpt) to the `audit_events` table for post-mortem analysis. This was added after the 2026-05-15 frozen-watermark incident where the original Prisma error aged out of Vercel's ~24h log retention.

---

## 16. UI Integration

### Display adapter

**Implementation:** `lib/idx/display-adapter.ts`

Converts API response listings to `DisplayListing` type for frontend cards. Handles two input shapes:
- `PublicListingDTO` (flat, from Trestle/IDX path) — via `fromPublicDTO()`
- Local listing shape (nested, from fallback) — via `toDisplayListing()`

### Card fields

| DisplayListing field | Source |
|---|---|
| `id` | listing_id |
| `mlsId` | mls_id |
| `slug` | Generated by `generateListingSlug()` |
| `status` | StandardStatus |
| `listingType` | sale / rent |
| `address.borough` | CountyOrParish → borough name |
| `listPrice` | ListPrice |
| `bedroomsTotal` | BedroomsTotal |
| `bathroomsFull` | BathroomsFull |
| `livingArea` | LivingArea |
| `propertyType` | mapPropertyTypeToDisplay(CommonInterest, PropertySubType) |
| `listOfficeName` | ListOfficeName |
| `media` | Resolved via listing-media-resolver |
| `_displayCompliance.attributionText` | `Listing courtesy of {ListOfficeName}` |

---

## 17. Open Houses

**Implementation:** `app/api/open-houses/route.ts`

### Trestle query

Endpoint: `/odata/OpenHouse`

```
$filter=OpenHouseDate ge {today} and OpenHouseType eq 'Public'
$expand=Property($select=ListingId,ListPrice,PropertyType,PropertySubType,
  CommonInterest,BedroomsTotal,BathroomsFull,LivingArea,StreetNumber,
  StreetName,StreetSuffix,StreetDirPrefix,UnitNumber,SubdivisionName,
  PostalCode,CityRegion,PublicRemarks,VirtualTourURLUnbranded)
$orderby=OpenHouseDate asc,OpenHouseStartTime asc
$top=100
```

Note: This is one of the few places where `$expand=Property(...)` works (expanding Property FROM OpenHouse, not the other way around).

### Compliance

- Only `OpenHouseType eq 'Public'` — broker-only and private events excluded per REBNY UCBA Art. I §16.
- Each OH record is passed through `evaluateDisplayGate()` to verify the parent listing is displayable.
- Deduplicates against local DB open houses (prefers Trestle version).

---

## 18. CRM Building Lookup

**Implementation:** `app/api/buildings/search/route.ts`

### ARCHITECTURAL LIMITATION

This route uses `/odata/Property` as a building/address lookup source. **Property contains listing records, not a building database.** It only returns buildings that have current or recent listings in the REBNY IDX Plus feed. A building with no listings will return zero results.

### Flow

1. Parse free-text query into RESO components: `parseAddressQuery(q)`
2. Search local DB first (fast, case-insensitive via raw SQL)
3. If DB returns <5 results, supplement from Trestle `/odata/Property`
4. Deduplicate by `StreetNumber-StreetName-PostalCode` key
5. Return merged list

### OData filter (same proven pattern)

```
startswith(StreetNumber,'{num}')
and StreetDirPrefix eq '{dir}'
and contains(tolower(StreetName),'{name}')
```

### Selected fields (building-relevant subset)

```
ListingId, BuildingName, YearBuilt, StoriesTotal,
NumberOfUnitsInCommunity, CommonInterest, OwnershipType,
PropertyType, PropertySubType, StructureType,
StreetNumber, StreetName, StreetSuffix, StreetDirPrefix,
PostalCode, UnitNumber, SubdivisionName,
BuildingFeatures, PetsAllowed, AttendanceType
```

### Auth

Requires `requireAgentOrBroker(request)`. Rate limited to 20 requests/minute/IP.

### Error handling

Trestle errors are caught and silently return whatever DB results were found. This means 401/500/Cotality errors look identical to "no matches" in the UI — a known diagnostic gap.

---

## 19. Sanitization and Security

**Implementation:** `lib/sanitize.ts`

### OData injection prevention

`sanitizeOData(input)`:
- Trims whitespace
- Removes all characters except: alphanumeric, space, hyphen, period, comma, apostrophe
- Escapes single quotes (doubles them for OData)

Used in all OData filter construction (building search, listing search, address lookup).

### Address slug injection prevention

`fetchListingByAddress()` in `lib/idx/fetch.ts` uses a stricter `sanitizeOData()` with a max-length cap:
```ts
function sanitizeOData(value: string, maxLength: number): string {
  return value.replace(/[^a-zA-Z0-9 .\-]/g, '').slice(0, maxLength);
}
```

### Trestle request safety

- All requests use `AbortController` with 10-second timeout
- Bearer token never exposed to client-side code
- `fetchPage()` sets `next: { revalidate: 300 }` for Next.js Data Cache (5-minute TTL)
- POST token requests use `cache: "no-store"` (never cache auth)
- Retry on 5xx (once, with 500ms delay). No retry on 4xx (except 401 which refreshes token).

---

## 20. Known Limitations and Gotchas

### `/odata/Property` is not a building database

The CRM building lookup uses Property records as a proxy for building data. This works for buildings with active listings but misses buildings with no current listings. There is no Trestle Building resource with actual data (the `Building` entity is an empty shell with only a key field).

### `$expand=Media` returns HTTP 400

Documented since 2024. Must fetch media separately via `/odata/Media?$filter=ResourceRecordKey eq '...'`.

### `$expand=CustomProperty(...)` returns HTTP 400

The inner `$select` with `DownPaymentAssistanceAmount,DownPaymentAssistanceCount,CustomFields` fails. Bare `$expand=CustomProperty` untested. FARE Act custom fields are currently inaccessible via inline expansion.

### `PropertySubType` crashes Trestle with HTTP 502

Cannot use `PropertySubType eq '...'` in OData filters for most values. Use `CommonInterest` for condo/co-op/condop filtering. Use `PublicRemarks` heuristic for new development detection.

### `InternetEntireListingDisplayYN` is not OData-filterable

Returns HTTP 400 with "Results from 'RLS' has been suppressed (provider Level)". REBNY's policy layer blocks this query because they pre-filter at the feed level.

### `NewConstructionYN` and `NewDevelopmentYN` not on IDX Plus feed

Must use PublicRemarks text search as heuristic.

### Latitude/Longitude always null on IDX Plus

`Latitude`/`Longitude` exist in Trestle `$metadata` but are **always null on the IDX Plus feed** — they are not usable for map/transit filtering. The site has a separate geocode backfill process.

### Trestle stores mixed-case street names

Always use `tolower()` in OData string comparisons.

### Ordinal suffixes inconsistent

`StreetName` may be `"46TH"` or `"46"`. Always strip ordinals before searching.

### Media order arbitrary

Trestle returns media in provider order with photos, floorplans, videos, and virtual tours interleaved. Always classify and re-sort using `listing-media-resolver.ts`.

### Token expires silently

In-memory token cache is per serverless instance. Different instances may have different token states. Each instance refreshes independently.

---

## 21. InHouse / Local Web Listings

InHouse listings are Mallan-created website-only records that exist OUTSIDE the REBNY feed.

### IDs

| Format | Meaning |
|---|---|
| `SL-XXXX` | Sale listing (InHouse/website-only) |
| `RL-XXXX` | Rental listing (InHouse/website-only) |

### Cotality lookup: ALLOWED

InHouse listings **may** use Cotality/Trestle as reference data for address verification and building field population. This is a lookup, not distribution.

### Distribution gates: ALL OFF

| Gate | Value |
|---|---|
| `IDXEntireListingDisplayYN` | `false` |
| `InternetEntireListingDisplayYN` | `false` |
| `InternetAddressDisplayYN` | `false` |
| `SyndicateYN` | `false` |
| `rls_eligible` | `false` |

### Backend enforcement

- POST `app/api/crm/listings/route.ts`: InHouse → `explicitOptOut=true` → `rls_eligible=false`
- PATCH `app/api/crm/listings/[id]/route.ts`: same

### URL routing

Uses existing `/listing/<slug>` detail route. No separate `/exclusives` route.

### Reconciliation with official feed

| Phase | Action |
|---|---|
| Before feed arrives | Show manual `SL-*` listing. Pin in FeaturedConfig. |
| After feed arrives | **Local `SL-*`/`RL-*` REMAINS CANONICAL.** The returned `RLS*` row is the Mallan RLS return-copy: retained internally for source/audit/reconciliation, SUPPRESSED from every public canonical surface. Do NOT withdraw the local row, do NOT pin `RLS*`, do NOT switch the public URL. RealPlus URL handling is OUTSIDE this system. See REPO-SOURCE-OF-TRUTH-CHARTER.md Section 1A. |

Manual process. No automated dedup. `SL-*` and `RLS*` are separate DB rows.

### Key distinction

| Concept | Purpose | Allowed for InHouse? |
|---|---|---|
| Cotality building/address reference lookup | Verify address, populate building data | **YES** |
| IDX/RLS public distribution/syndication | Send listing to public feed and portals | **NO** |

### Address overwrite rules (CRM form)

- Non-InHouse: Cotality match auto-populates address fields.
- InHouse: If Cotality match differs from typed address, show `confirm()` dialog. Cancel keeps typed address but still populates building/property fields.
- Never silently overwrite a manually entered InHouse address.

---

## 22. Featured Listings

### Source

`FeaturedListings.tsx` fetches from `/api/listings` + `/api/featured-config`

### Pinning

`FeaturedConfig.pinned_ids` array. Broker-only PATCH at `/api/featured-config`.

### InHouse pin

Add `SL-*` listing_id to `pinned_ids`. Pinned listings sort first.

### Transition

Keep the local `SL-*`/`RL-*` in `pinned_ids` when the official feed listing arrives. The returned `RLS*` copy is publicly suppressed and must NOT be pinned in its place (CHARTER Section 1A).

### Forbidden

- No fake/static listing data
- No separate `/exclusives` route
- No demo data

---

## 23. Debugging

### Debug checklist (for any Cotality/Trestle issue)

1. **Production SHA** — `gh pr view --json mergeCommit` or Vercel deployment inspector
2. **Deployment ID** — Vercel MCP `list_deployments` or inspector URL
3. **Endpoint hit?** — Check Vercel runtime logs for the path
4. **Status code** — 200 = query/data issue; 401 = session expired; 429 = rate limit; 500 = server error
5. **Response body** — `{ buildings: [] }` = empty results; `{ error: "..." }` = auth/validation
6. **Auth session** — Is `session_token` cookie present? Is `/api/auth/me` returning 200?
7. **Cotality token** — Look for `[IDX Auth] Token acquired` in logs
8. **OData filter** — Log the constructed filter string; compare against §4 patterns
9. **First 3 results** — If data returns, check normalized addresses

### Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| 401 on `/api/buildings/search` | CRM session expired | User must log out and back in |
| 200 with empty results | OData filter wrong (missing `tolower()`, wrong field, direction in StreetName) | Fix filter per §4 |
| No request in logs | Frontend not calling endpoint | Check which input field user is typing in; verify event handler |
| Token acquisition fails | Env vars missing or Cotality down | Check `IDX_CLIENT_ID`/`IDX_CLIENT_SECRET` in Vercel env |
| Stale candidates visible | Frontend not clearing results on empty response | Hide `saleBuildingSearchResults` on empty |
| Production not updated | Vercel deployment stale | Check deployment SHA matches expected commit |
| Building not found | Building has no listing in REBNY feed | This is the §LIMITATION — allow manual entry |
| 429 rate limit | Too many requests | Wait 60s; check if debounce is working |

### Error behavior by route

| Route | On auth failure | On Cotality error | On empty results |
|---|---|---|---|
| `/api/buildings/search` | Returns 401 | Returns `{ buildings: [] }` (silent) | Returns `{ buildings: [] }` |
| `/api/listings` | N/A (public) | Falls back to DB-only | Returns `{ listings: [] }` |
| `/api/listings/[id]` | N/A (public) | Returns 404 | Returns 404 |
| `/api/open-houses` | N/A (public) | Returns `{ openHouses: [] }` | Returns `{ openHouses: [] }` |

### Diagnostic gap (known)

The CRM building lookup route (`/api/buildings/search`) returns `{ buildings: [] }` for ALL non-success cases: 401, 500, Cotality error, rate limit, AND genuine "no matches." The frontend cannot distinguish these. This is documented as a known issue. Do not add more patches — the proper fix is to surface error codes to the frontend.

---

## 24. File Map

| File | Role |
|---|---|
| `lib/idx/auth.ts` | OAuth2 token management |
| `lib/idx/fetch.ts` | OData Property + Media fetching, filters, pagination |
| `lib/idx/trestle-mapper.ts` | 902 fields, 29 categories, Trestle→Prisma mapping, gate computation |
| `lib/idx/sync.ts` | Sync orchestrator (Trestle→DB) |
| `lib/idx/types.ts` | IDXListing, TrestleAuthToken, IDXFetchResult types |
| `lib/idx/public-dto.ts` | PublicListingDTO shape, toPublicDTO(), attribution |
| `lib/idx/db-to-public-dto.ts` | DB listing → PublicListingDTO (for InHouse/exclusives) |
| `lib/idx/display-adapter.ts` | DisplayListing type for frontend cards |
| `lib/idx/media-sync.ts` | Media sync to R2 |
| `lib/idx/card-fields.ts` | Card display field definitions |
| `lib/idx/watermark.ts` | Sync watermark management |
| `lib/idx/logger.ts` | IDX audit logging |
| `lib/search/public-listing-trestle.ts` | Public search OData filter builder (canonical address pattern) |
| `lib/compliance/gates.ts` | Distribution gate evaluation (6 gates) |
| `lib/media/listing-media-resolver.ts` | Media classification + photo-first ordering |
| `lib/media/media-sync-service.ts` | R2 upload pipeline |
| `lib/listing-slug.ts` | Address-based URL slug generation |
| `lib/sanitize.ts` | OData injection prevention |
| `app/api/buildings/search/route.ts` | CRM building/address lookup |
| `app/api/listings/route.ts` | Public listing search (DB + Trestle) |
| `app/api/listings/[id]/route.ts` | Single listing detail |
| `app/api/open-houses/route.ts` | Open house listings |
| `app/api/media/proxy/route.ts` | Trestle image URL proxy |
| `app/api/cron/idx-sync/route.ts` | Incremental sync cron |
| `app/api/cron/media-sync/route.ts` | Media → R2 cron |
| `docs/architecture/COTALITY-TRESTLE-OPERATIONAL-CONTRACT.md` | Operational contract |
| `artifacts/metadata.xml` + `data/rebny-rls-property-fields.csv` | Live Cotality field catalog (from `api.cotality.com/trestle`) |
| `data/RLS-FIELD-REGISTRY.md` | **DEPRECATED / HISTORICAL SNAPSHOT (2026-03-20) — NOT field authority.** Verify live against Cotality. |
| `data/rebny-rls-property-fields.csv` | 902 IDX Plus fields (CSV) |
| `data/rebny-rls-property-lookup.csv` | 2,066 picklist values |
| `artifacts/metadata.xml` | Live Trestle OData $metadata snapshot |

---

## 25. Env Vars

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `IDX_CLIENT_ID` | Yes | — | Cotality OAuth2 client ID |
| `IDX_CLIENT_SECRET` | Yes | — | Cotality OAuth2 client secret |
| `TRESTLE_API_URL` | No | `https://api.cotality.com/trestle` | Base API URL |
| `IDX_TOKEN_EXPIRY_BUFFER` | No | `300` (seconds) | How early to refresh token before expiry |
| `IDX_API_KEY` | No | — | Legacy alias for `IDX_CLIENT_ID` |
| `IDX_API_SECRET` | No | — | Legacy alias for `IDX_CLIENT_SECRET` |
| `IDX_ENDPOINT` | No | — | Legacy alias for `TRESTLE_API_URL` |
