> ## ⛔ DEPRECATED / HISTORICAL SNAPSHOT — NOT FIELD AUTHORITY
>
> **Verified 2026-03-20 ONLY.** Built from the March 2026 IDX Plus spreadsheet.
>
> **NEVER use this file to establish current Cotality field existence, type, population,
> enum values, permissions, mappings, or semantics. Verify LIVE against Cotality.**
>
> Authority chain (CLAUDE.md §A.0):
> **LIVE COTALITY RAW CONTRACT → VERIFIED MAPPING → MALLAN STORAGE → MALLAN BUSINESS RULE → PUBLIC/CRM CONSUMER**
>
> A repo constant, `$select` list, mapper table, code comment, `artifacts/metadata.xml`, a prior
> audit, or this file are **NOT evidence**. Field truth comes from an HTTP response received from
> `api.cotality.com` **during the current session**, compiled via `npm run cotality:compile` and
> drift-checked by `npm run cotality:verify`.
>
> Retained as **historical evidence** of what was believed on 2026-03-20. Deprecated 2026-08-19.

---

# REBNY RLS / IDX Plus Field Registry

**Source:** REBNY — "Mallan Copy of IDX PLUS 3.15.26.xlsx" (received 2026-03-19)
**Verified Against:** Live Trestle API `api.cotality.com/trestle` metadata + live feed (2026-03-20)
**IDX Plus Coverage:** 902/902 = **100%** — every REBNY IDX Plus field found in Trestle live feed
**Total Trestle Resources:** 12 data entities + 5 system entities
**License:** IDX Plus feed for Mallan Real Estate Inc (Trestle-11371-20) — public display + internal CRM + reporting (REBNY confirmed 2026-03-27). IDX-eligible inventory only, not full-market search.

---

## Trestle Resources — Complete Map

### IDX Plus Resources (7 — covered by REBNY spec)

| Resource | REBNY Fields | Trestle Total | Match | Access |
|----------|-------------|---------------|-------|--------|
| Property | 527 | 745 | 527/527 | Direct query |
| CustomProperty | 106 | 140 | 106/106 | `$expand=CustomProperty` |
| Member | 72 | 90 | 72/72 | `$expand=ListAgent` etc. |
| Office | 66 | 79 | 66/66 | `$expand=ListOffice` etc. |
| Media | 46 | 55 | 46/46 | `$expand=Media` |
| PropertyUnitTypes | 46 | 52 | 46/46 | `$expand=UnitTypes` |
| OpenHouse | 39 | 47 | 39/39 | `$expand=OpenHouse` |
| **Subtotal** | **902** | **1,208** | **902/902** | |

### Additional Trestle Resources (5 — beyond IDX Plus spec)

| Resource | Fields | Key | Access | Use Case |
|----------|--------|-----|--------|----------|
| PropertyRooms | 39 | RoomKey | `$expand=Rooms` | Room-by-room data (area, dimensions, features, type, level) |
| Teams | 48 | TeamKey | Direct query `/odata/Teams` | Agent team info (name, lead, contact, address) |
| TeamMembers | 29 | TeamMemberKey | Direct query `/odata/TeamMembers` | Team member relationships, roles, impersonation level |
| PropertyGreenVerification | 39 | GreenBuildingVerificationKey | Navigation from Property | Green certifications (LEED, Energy Star, etc.) |
| Building | 1 (key only) | BuildingKey | `$expand=Building` | **Empty shell** — key + nav properties only, no data fields |
| **Subtotal** | **156** | | | |

### System/Metadata Resources (5)

| Resource | Purpose |
|----------|---------|
| Field | Field metadata (name, type, length, lookup) |
| Lookup | Picklist/enum value definitions |
| Model | Data model metadata |
| DataSystem | System info, transport version, data dictionary version |
| Enumeration | Enum value definitions |

**Grand Total:** 12 data resources (1,364 fields) + 5 system resources

---

## Critical Trestle Property Fields Beyond IDX Plus CSV

These fields exist on the Trestle Property entity (confirmed via `metadata.xml`) but are **NOT listed** in the REBNY IDX Plus 902-field spec. They are critical for compliance:

| Field | Type | Purpose | Status |
|-------|------|---------|--------|
| `InternetAddressDisplayYN` | Boolean | **Distribution gate** — controls address visibility | On Trestle, NOT in IDX Plus CSV |
| `InternetEntireListingDisplayYN` | Boolean | **Distribution gate** — master internet display toggle | On Trestle Property (also in Media/UnitTypes/etc. in CSV) |
| `InternetAutomatedValuationDisplayYN` | Boolean | **Distribution gate** — AVM display control | On Trestle, NOT in IDX Plus CSV |
| `InternetConsumerCommentYN` | Boolean | **Distribution gate** — consumer comment control | On Trestle, NOT in IDX Plus CSV |
| `ShowingInstructions` | String (4000) | Showing coordination text | On Trestle, NOT in IDX Plus CSV |
| `PrivateShowingInstructions` | String (8000) | Private showing notes | On Trestle (CustomProperty), NOT in IDX Plus CSV |

### Fields NOT on Trestle (code must NOT use these)

| Field | Correct Trestle Equivalent | Notes |
|-------|---------------------------|-------|
| `IDXEntireListingDisplayYN` | `InternetEntireListingDisplayYN` | Cotality standard name; Trestle does not have IDX-prefixed gates |
| `SyndicateYN` | `SyndicateTo` (String List, Multi) | Boolean doesn't exist; use picklist field |
| `VOWEntireListingDisplayYN` | — | Does not exist on Trestle |
| `VOWAutomatedValuationDisplayYN` | — | Does not exist on Trestle |
| `VOWConsumerCommentYN` | — | Does not exist on Trestle |
| `MoveInCostsAmountTotal` | — | Phantom — does not exist on live Trestle; legacy fallback only (never written). `MoveInCosts` is a multi-select enum |
| `YearRenovated` | — | Does not exist on Trestle |
| `BuyerAgentRLSParticipantYN` | — | Does not exist on Trestle |
| `FirstShowingDate` | `ActivationDate` | Confirmed 2026-03-19: not accepted |
| `PossessionDate` | — | Cotality field, Trestle ignores |

> **Correction (2026-06-04):** `MoveInCostsComments` (live Property `Edm.String(1024)`) and
> `MoveInCostsAmount` (live Property `Edm.Decimal(14,2)`) are **live Property fields** and the
> **canonical FARE move-in disclosure** fields — they were previously (incorrectly) listed here as
> non-existent. Only `MoveInCostsAmountTotal` remains phantom / legacy fallback only.

---

## Distribution Gate Fields (6 Required)

| Field | Trestle Name | In IDX Plus CSV? | Default |
|-------|-------------|-------------------|---------|
| IDX display | `InternetEntireListingDisplayYN` | NO (Property) / YES (Media, UnitTypes) | Locked ON for standard sale permissions |
| Address display | `InternetAddressDisplayYN` | NO | — |
| AVM display | `InternetAutomatedValuationDisplayYN` | NO | — |
| Consumer comment | `InternetConsumerCommentYN` | NO | — |
| Syndication targets | `SyndicateTo` | YES (all resources) | All ON (LMP must default) |
| Internet listing | `InternetEntireListingDisplayYN` | NO (Property) | Locked ON for standard sale permissions |

**Note:** `IDXEntireListingDisplayYN` and `SyndicateYN` do NOT exist on Trestle. The codebase previously referenced these incorrectly. Fixed 2026-03-20.

### Cascade Rule

> If `InternetEntireListingDisplayYN = False` → Address, AVM, Comment all cascade to False

### Sale-Specific Rule

> Sale listings with `Permissions=Null` cannot submit `InternetEntireListingDisplayYN=False`

---

## Media, Video & 3D Tour Fields

### Property-Level Media Fields (on Trestle Property entity)

| Field | Type | In IDX Plus CSV? | Purpose |
|-------|------|-------------------|---------|
| `PhotosCount` | Int32 | YES | Total photo count |
| `PhotosChangeTimestamp` | DateTime | YES | Last photo modification |
| `VideosCount` | Int32 | YES | Total video count |
| `VideosChangeTimestamp` | DateTime | YES | Last video modification |
| `VirtualTourURLBranded` | String | YES | Branded virtual tour URL |
| `VirtualTourURLBranded2` | String | YES | Second branded tour URL |
| `VirtualTourURLBranded3` | String | YES | Third branded tour URL |
| `VirtualTourURLUnbranded` | String | YES | Unbranded virtual tour URL (for IDX) |
| `VirtualTourURLUnbranded2` | String | YES | Second unbranded tour URL |
| `VirtualTourURLUnbranded3` | String | YES | Third unbranded tour URL |

### Media Entity Fields (46 IDX Plus / 55 Trestle total)

Access via `$expand=Media` on Property. Key fields:

| Field | Type | Purpose |
|-------|------|---------|
| `MediaURL` | String | Direct URL to the media asset |
| `MediaType` | Enum | Photo, Video, Document, etc. |
| `MediaCategory` | Enum | Photo categories |
| `MediaClassification` | Enum | Interior, Exterior, etc. |
| `ImageOf` | Enum | What the image depicts |
| `Order` | Int32 | Display order |
| `PreferredPhotoYN` | Boolean | Primary/hero photo |
| `ShortDescription` | String | Caption |
| `LongDescription` | String | Extended caption |
| `ImageHeight` / `ImageWidth` | Int32 | Dimensions |
| `MediaHTML` | String | Embeddable HTML (for video/3D) |
| `SyndicateTo` | String List | Distribution targets for this media |
| `InternetEntireListingDisplayYN` | Boolean | Display gate for this media |

**MediaType enum values:** Photo, Video (includes 3D tours, Matterport)
**MediaCategory enum values:** FloorPlan, Photo, Video, AgentPhoto, OfficePhoto, GroundPhoto

### Virtual Tour & 3D Integration

- **Matterport/3D tours:** Use `VirtualTourURLUnbranded` or `VirtualTourURLUnbranded2` fields
- **Video tours:** Use Media entity with `MediaType = Video`
- **Floor plans:** Use Media entity with `MediaCategory = FloorPlan`
- **IDX display:** Always use `Unbranded` URLs for IDX (branding rules)
- **Building media:** Building entity has `$expand=Media` navigation but the Building entity itself is an empty shell (key only, no data fields)

---

## PropertyRooms Resource (39 fields — beyond IDX Plus)

Access via `$expand=Rooms` on Property. Provides room-by-room detail:

| Field | Type | Purpose |
|-------|------|---------|
| `RoomType` | Enum | Bedroom, Bathroom, Kitchen, LivingRoom, etc. |
| `RoomArea` | Decimal | Square footage |
| `RoomDimensions` | String | "12x15" format |
| `RoomLength` / `RoomWidth` | Decimal | Individual measurements |
| `RoomLevel` | Enum | Floor level |
| `RoomFeatures` | Multi-enum | Interior features for this room |
| `RoomFlooring` | Multi-enum | Flooring type |
| `RoomDescription` | String | Free-text description |
| `RoomAreaSource` / `RoomAreaUnits` | Enum | Measurement source/units |
| `RoomLengthWidthSource` / `RoomLengthWidthUnits` | Enum | Dimension source/units |

Plus standard Trestle system fields (ListingKey, ModificationTimestamp, StandardStatus, SyndicateTo, etc.)

---

## Teams & TeamMembers Resources (77 fields — beyond IDX Plus)

### Teams (48 fields)

Access via `/odata/Teams`. Agent team information:

Key fields: `TeamName`, `TeamKey`, `TeamLeadKey`, `TeamLeadMlsId`, `TeamEmail`, `TeamDirectPhone`, `TeamAddress1/2`, `TeamCity`, `TeamStateOrProvince`, `TeamPostalCode`, `TeamStatus`, `TeamDescription`, `SocialMediaType`, `SocialMediaTypeUrl`

### TeamMembers (29 fields)

Access via `/odata/TeamMembers`. Relationships between members and teams:

Key fields: `TeamMemberKey`, `TeamKey`, `MemberKey`, `MemberMlsId`, `TeamMemberType`, `TeamImpersonationLevel`

---

## PropertyGreenVerification Resource (39 fields — beyond IDX Plus)

Navigation from Property. Green building certifications (LEED, Energy Star, etc.):

| Field | Type | Purpose |
|-------|------|---------|
| `GreenBuildingVerificationType` | Enum | LEED, EnergyStar, HERS, etc. |
| `GreenVerificationBody` | String | Certifying organization |
| `GreenVerificationRating` | String | Rating achieved |
| `GreenVerificationMetric` | Int32 | Score/metric value |
| `GreenVerificationSource` | Enum | Source of verification |
| `GreenVerificationStatus` | Enum | Verified, Pending, etc. |
| `GreenVerificationURL` | String | Certification URL |
| `GreenVerificationYear` | Int32 | Year certified |

---

## Building Resource (empty shell)

The Building entity exists on Trestle with `BuildingKey` as its only field. It has navigation properties to Media and Property but contains no building-level data fields.

Building-level data (name, features, amenities) is stored on the **Property** entity itself:
- `BuildingName`, `BuildingFeatures`, `BuildingAreaTotal`, `BuildingAreaSource`, `BuildingAreaUnits`
- `NumberOfBuildings`, `BuildingKeyNumeric`

Building-specific custom fields are in **CustomProperty.CustomFields** JSON:
- `BuildingParkingTotal`, `BuildingRules`, `BuildingSmokeFreeYN`, `BuildingTaxLot`

---

## CustomProperty.CustomFields (JSON String)

41 REBNY fields are embedded inside a JSON string in `CustomProperty.CustomFields`. These include:

AttendanceType, BathroomCondition, BuildingParkingTotal, BuildingRules, BuildingSmokeFreeYN, BuildingTaxLot, CapitalReservesTotal, CapitalReservesYN, CeilingHeightFeet, CeilingHeightInches, CertificateOfOccupancyYN, ClosetsTotal, CommercialUnitsYN, ElevatorsTotal, FlipTax, FlipTaxRemarks, FlipTaxType, FurnishedListPrice, FurnishedMaxLeaseMonths, FurnishedMinLeaseMonths, GuarantorsAcceptedYN, KitchenCondition, LandmarkStatusYN, ManagingAgencyListingYN, MaxLeaseMonths, MaximumFinancingAmount, MaximumFinancingPercent, MaximumFinancingRemarks, PercentOfCommonElements, PrivateOutdoorSpaceSize, SponsorUnitYN, TaxAbatementComments, TaxAbatementExpirationYear, TaxAbatementYN, TaxDeductionAmount, TaxDeductionPercent, TaxDeductionRemarks, TaxMonthlyAmount, UnitLine, ViewRemarks

Access pattern: `$expand=CustomProperty` → parse `CustomFields` JSON string → extract keys.

---

## Trestle Confirmations (2026-03-19/20)

### Fields NOT Accepted by Trestle

| Field | Status | Notes |
|-------|--------|-------|
| `FirstShowingDate` | NOT used, NOT accepted | Use `ActivationDate` for Coming Soon → Active |
| `PossessionDate` | NOT sent, NOT accepted | Cotality field, Trestle ignores |

### Remapping Applied

`FirstShowingDate` → `ActivationDate` in sale + rental forms (2026-03-19)

### New Fields (Trestle 6.17, 2026-03-04)

| Field | Resource | Type |
|-------|----------|------|
| `BuildingKeyNumeric` | Property | Number |
| `DownPaymentAssistanceAmount` | CustomProperty | Decimal |
| `DownPaymentAssistanceCount` | CustomProperty | Number |

---

## Trestle API Access — Resolved (2026-03-20)

> **Documentation:** https://trestle-documentation.corelogic.com/
> **Support:** trestlesupport@cotality.com | rlssupport@rebny.com / 212-616-5270
> **All data below is accessible via the Trestle WebAPI under our IDX Plus license.**

### Authentication

OAuth2 Client Credentials → `POST https://api.cotality.com/trestle/oidc/connect/token` → Bearer token (8hr TTL).

### How to Pull Each Resource

| Resource | Query Pattern | Notes |
|----------|--------------|-------|
| Property (527 fields) | `GET /odata/Property?$filter=...&$top=1000` | Core listing data |
| CustomProperty (106 fields) | `$expand=CustomProperty` on Property | REBNY fields in `CustomFields` JSON |
| Media (46 fields) | `$expand=Media` on Property OR `GET /odata/Media?$filter=ResourceRecordKey eq '{key}'` | Photos, floor plans, video, 3D tours |
| Member (72 fields) | `GET /odata/Member` | Agent/broker info |
| Office (66 fields) | `GET /odata/Office` | Brokerage data |
| OpenHouse (39 fields) | `GET /odata/OpenHouse` | Scheduled open houses |
| PropertyUnitTypes (46 fields) | `$expand=Units` on Property | Multi-unit data |
| PropertyRooms (39 fields) | `$expand=Rooms` on Property | Room-level detail |
| Teams (48 fields) | `GET /odata/Teams` | Agent teams |
| TeamMembers (29 fields) | `GET /odata/TeamMembers` | Team members |
| PropertyGreenVerification (39 fields) | `$expand=GreenVerification` on Property | Green certs |
| Building (key only) | `GET /odata/Building` | Key + navigation to Media/Property |

### Field Name Clarifications (Resolved)

| UCBA / REBNY Name | Trestle Field | Resolution |
|--------------------|---------------|------------|
| `IDXEntireListingDisplayYN` | `InternetEntireListingDisplayYN` | No separate IDX field exists on Trestle. The master `InternetEntireListingDisplayYN` controls both internet and IDX display. |
| `SyndicateYN` (boolean) | `SyndicateTo` (multi-select) | Trestle uses `SyndicateTo` for portal selection. Valid values are the opted-in portal names. Empty = no syndication. |
| Distribution gate fields | All on Property entity | `InternetAddressDisplayYN`, `InternetEntireListingDisplayYN`, `InternetAutomatedValuationDisplayYN`, `InternetConsumerCommentYN`, `ShowingInstructions` — all accessible, all writable on listing submission. |
| `MoveInCosts` | Multi-select enum + live amount/comments | `MoveInCosts` is a multi-select enum (cost types). `MoveInCostsAmount` (live Property `Edm.Decimal(14,2)`) and `MoveInCostsComments` (live Property `Edm.String(1024)`) are **live Property fields** — the canonical FARE move-in disclosure fields. `MoveInCostsAmountTotal` remains phantom / legacy fallback only (never written). |
| VOW fields | Not on IDX Plus | `VOWEntireListingDisplayYN` etc. require Direct Data License / VOW feed — not available on current IDX Plus license. |
| Building resource | Key + nav only | Building-level data lives on Property + CustomProperty, not the Building entity. |

### Media — Video, 3D Tours, Floor Plans

> **⚠️ TRESTLE VENDOR GUIDANCE (2026-04-07, deep-audited):** Query Media by `ResourceRecordKey` (always unique across MLOs), NOT `ResourceRecordID` (can duplicate). Property.`ListingKey` = Media.`ResourceRecordKey`. Use `Media.ModificationTimestamp` for row-level change tracking and `Property.PhotosChangeTimestamp` as high-level trigger. `Media/All` endpoint is deprecated — use filtered `/odata/Media` queries directly. Enforced across 17 files (7 production, 3 utility, 7 test).

All accessible via Media resource (`$expand=Media` or direct query). Classified by `MediaCategory`:
- `Photo` — standard listing photos
- `Floor Plan` — floor plan images
- `Video` — video files or embeds
- `Virtual Tour` — 3D/Matterport tours

Virtual tour URLs also available via `VirtualTourURLUnbranded` and `VirtualTourURLBranded` on Property.

### Rate Limits

| Quota | Per Hour | Per Minute |
|-------|----------|-----------|
| WebAPI queries | 7,200 | 180 |
| Media URL requests | 18,000 | 480 |

---

## Data Files

| File | Contents |
|------|----------|
| `data/rebny-rls-property-fields.csv` | 902 REBNY IDX Plus fields (7 resources) — replaced 2026-03-19 |
| `data/rebny-rls-property-lookup.csv` | 2,066 picklist/enum values |
| `data/rebny-fields.txt` | 815 unique field names (one per line) |
| `artifacts/metadata.xml` | Full Trestle OData metadata (all 12 data + 5 system entities) |
| `data/RLS-FIELD-REGISTRY.md` | This file |

## Codebase Usage

| Where | What it does |
|-------|-------------|
| `lib/compliance/rebny-field-tables.ts` | Canonical authority table — required fields, conditional rules |
| `lib/compliance/rls-enforcement.ts` | Write-path gate — validates payloads before RLS submission |
| `lib/idx/trestle-mapper.ts` | Trestle → internal mapping (23 renames, 29 field categories) |
| `lib/idx/fetch.ts` | Trestle API fetch with `$select` and `$expand` |
| `scripts/audit-form-fields.js` | Form field → RLS binding classifier |
| `scripts/ucba-compliance-audit.js` | CI-gateable UCBA audit |
| `artifacts/` | Trestle live data (NDJSON), field catalogs, mapping reports |
| `artifacts/metadata.xml` + `data/rebny-rls-property-fields.csv` + `data/rebny-rls-property-lookup.csv` | **Live Cotality field truth** — every field name/type from the `api.cotality.com/trestle` `$metadata` (refresh with `npm run trestle:diff` / `npm run trestle:refresh-csv`) |
