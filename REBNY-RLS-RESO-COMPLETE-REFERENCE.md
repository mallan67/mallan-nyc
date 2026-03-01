# REBNY UCBA 2026 / RLS / RESO IDX — Complete Implementation Reference

> **Brokerage:** Mallan Real Estate Inc. (#10991205323)
> **Agent:** Maya Allan (#10311201806)
> **LMP:** RealPlus
> **RLS Backend:** Trestle / Cotality (formerly CoreLogic)
> **Compiled:** 2026-02-19
> **Sources:** UCBA 2026 (Jan revision), REBNY RLS Data Dictionary, RESO DD 2.0, Trestle API docs

---

## TABLE OF CONTENTS

1. [UCBA 2026 — Core Rules](#1-ucba-2026--core-rules)
2. [Listing Types & Status Lifecycle](#2-listing-types--status-lifecycle)
3. [Mandatory Fields (Exhibit A)](#3-mandatory-fields-exhibit-a)
4. [All 448 RLS Fields — 29 Categories](#4-all-448-rls-fields--29-categories)
5. [Distribution Gates — What to Share vs. Not Share](#5-distribution-gates--what-to-share-vs-not-share)
6. [IDX / VOW / Internet Display Rules](#6-idx--vow--internet-display-rules)
7. [Content Restrictions — What Can NEVER Appear](#7-content-restrictions--what-can-never-appear)
8. [RESO Data Dictionary 2.0 Standards](#8-reso-data-dictionary-20-standards)
9. [ID Structure & Field Mapping](#9-id-structure--field-mapping)
10. [Syndication & Distribution Flow](#10-syndication--distribution-flow)
11. [Cascade Rules & Validation](#11-cascade-rules--validation)
12. [Timing & SLA Requirements](#12-timing--sla-requirements)
13. [Penalties & Fines](#13-penalties--fines)
14. [FARE Act (NYC Rentals)](#14-fare-act-nyc-rentals)
15. [NAR Settlement Changes](#15-nar-settlement-changes)
16. [Coming Soon Rules](#16-coming-soon-rules)
17. [New Development (RUNDBA)](#17-new-development-rundba)
18. [Owner Opt-Out Process](#18-owner-opt-out-process)
19. [Implementation Checklist](#19-implementation-checklist)
20. [Pre-Licensed Providers & Feed Types](#20-pre-licensed-providers--feed-types)
21. [RESO Certification Requirements](#21-reso-certification-requirements)
22. [NY Source of Income Platform Obligations](#22-ny-source-of-income-platform-obligations-2025)

---

# 1. UCBA 2026 — Core Rules

## Who Must Participate
- **RBD member firms** with NYC offices/listings → MUST participate in RLS + follow UCBA + Code of Ethics
- **Non-RBD licensed firms** with NYC offices/listings → MAY participate if paying fees/dues + agreeing to rules
- **Ethics training required:** Principals + all agents within 90 days (access suspended until complete)

## Listing Input Rules

| Rule | UCBA Ref | Requirement |
|------|----------|-------------|
| **Exclusive Only** | Art. I, §4 | RLS accepts ONLY Exclusive Listings (incl. co-exclusive). No Open, FSBO, or Ours Alone |
| **Simultaneous Distribution** | Art. I, §5 | Must submit to RLS simultaneously with ANY public dissemination or first showing |
| **Owner Opt-Out** | Art. I, §5(A) | Requires signed Exhibit B within 48hrs via LMP. NO public dissemination ever. Exception: non-automated phone calls and 1:1 personal emails |
| **No Pocket Listings** | Art. I, §5(B) | Cannot promote/encourage Owner to withhold from RLS |
| **No Agent Info in Description** | Art. I, §5(C) | No agent name, contact, URL in descriptions, floorplans, photos, comments, or internet remarks |
| **No "Off-Market" Language** | Art. I, §5(D) | Cannot describe any Exclusive Listing as "Off-Market" |
| **No Compensation in Description** | Art. I, §5(E) | No broker fees, closing costs, or compensation info in description/comments |
| **Mixed-Use Applicability** | Art. I, §5(F) | Rules apply to professional/retail units in residential properties ≤5 units |
| **Status Changes** | Art. I, §6 | Price/status changes within 24hrs (excl weekends/postal holidays) |
| **Closing Price** | Art. I, §7 | Must provide closing price within 24hrs of closing |
| **Closed on Website** | Art. I, §6 | Remove or mark closed on broker website within 24hrs |
| **Withdrawal Constraints** | Art. I, §9 | Cannot withdraw from RLS if still displayed publicly anywhere |
| **Commission Disclosure** | Art. I, §17 | "Commissions are not set by law and are fully negotiable" required in listing/buyer agreements |
| **Buyer Rep Agreement** | Art. II, §16 | Co-broker must have executed written Buyer Representation Agreement before ANY showing |
| **Fair Housing** | Exhibit C | No violations of Fair Housing Act, NY State, or NYC Human Rights Law Title 8 |
| **No "Free Services"** | Art. III, §5 | Cannot claim free unless no compensation from any source |
| **Data Accuracy** | Art. III, §4 | Incomplete mandatory fields or incorrect data = violation |

## Showing & Operational Rules

- Exclusive Agent must respond promptly to showing requests
- Cannot deny co-broker appointments (limited exceptions)
- Appointments only available after listing enters RLS (except Coming Soon)
- Buyer/tenant has right to representation; exclusive side must not interfere
- Buyer names recorded at showing, deleted if cancelled/no visit
- No contacting Owner without Exclusive Agent consent
- Board packages: cover sheet with both broker contacts, no marketing logos
- Multiple bids: disclose offers to owner, may share amounts if seller authorizes

## Compensation Rules (Art. IV)
- REBNY/RLS does NOT set, recommend, or display compensation rates
- On request, must provide listing/buyer agreements to RLS staff within 48hrs for confidential inspection
- Must disclose participant ownership interest in listed property

---

# 2. Listing Types & Status Lifecycle

## Accepted Listing Types
| Type | Accepted? | Notes |
|------|-----------|-------|
| Exclusive Right to Sell | YES | Standard sale |
| Exclusive Right to Lease | YES | Standard rental |
| Exclusive Agency | YES | Owner retains right to sell themselves |
| Co-Exclusive | YES | Two brokers share exclusive |
| Open Listing | NO | Not accepted on RLS |
| FSBO | NO | Not accepted on RLS |
| Ours Alone | NO | Oral/verbal — not accepted |

## Status Lifecycle

```
DRAFT → COMING SOON (sales only, max 14 days)
     → ACTIVE (live on market)
         → PENDING (contract signed)
             → CLOSED (sold/rented — DOM resets to 0)
         → TEMPORARILY OFF-MARKET (paused — DOM paused)
         → WITHDRAWN (broker removed — DOM paused, resets after 30 days)
         → CANCELLED (listing cancelled — DOM paused, resets after 30 days)
     → PARTICIPANT ONLY (co-broke only — DOM does NOT accrue)
     → OWNER OPT-OUT (not shared anywhere)
     → EXPIRED (past expiration date)
```

| Status | DOM Accrues? | Public Display? | IDX? | VOW? |
|--------|-------------|-----------------|------|------|
| Active | Yes | Yes | Yes | Yes |
| Coming Soon | No | Yes (with badge) | Yes | Yes |
| Participant Only | No | No | No | No |
| Owner Opt-Out | N/A | No | No | No |
| Pending | Yes | Yes | Yes | Yes |
| Temp Off-Market | Paused | No | No | No |
| Withdrawn | Paused (resets 30d) | No | No | No |
| Cancelled | Paused (resets 30d) | No | No | No |
| Closed | Stops (resets to 0) | Remove in 24hrs | No | No |

### DOM Rules (2026)
- Starts when listing transmitted to RLS
- Coming Soon and Participant Only do NOT accrue DOM
- Withdrawn/Cancelled → resets after **30 consecutive days** (was 90 before 2026)
- Closed → resets to 0
- **Cannot circumvent by re-naming or re-listing**

---

# 3. Mandatory Fields (Exhibit A)

## Required for ALL Listings (79 Fields — I1 through I79)

### Location & Building
| # | Field | RESO Name | Distribution | Notes |
|---|-------|-----------|-------------|-------|
| I1 | Borough | CityRegion | PUB | Must match CountyOrParish |
| I2 | Full Address | StreetNumber + StreetName + StreetSuffix + UnitNumber | PUB | Validated against Street Dictionary |
| I3 | Neighborhood | SubdivisionName | PUB | REBNY official picklist enforced |
| I4 | Building Classification | PropertyType + PropertySubType | PUB | |
| I5 | New Development | NewDevelopmentYN + NewConstructionYN | PUB | Cannot be Coming Soon if new dev |
| I6 | Have Elevator | ElevatorsTotal | PUB | If >0, BuildingFeatures must include "Elevator(s)" |
| I7 | Have Garage | AttachedGarageYN / GarageYN | PUB | |
| I8 | Have Lobby Attendant | AttendanceType | PUB | Full/Part time |
| I9 | Ownership Type | CommonInterest | PUB | Condo, Coop, Condop, RentalBuilding |
| I10 | Tax Block and Lot | BuildingTaxLot | AGT | Internal legal identifier |
| I11 | Number of Total Units | NumberOfUnitsTotal | PUB | |
| I12 | Total Floors | StoriesTotal | PUB | |
| I13 | Year Built | YearBuilt | PUB | 4 chars, 1700+, max 10yr future |
| I14 | Building Pet Policy | BuildingPetsAllowed | PUB | If "No", unit PetsAllowed MUST = No |
| I15 | Building Sublet Policy | SubletPolicy | PUB | |
| I16 | Unit Number | UnitNumber | PUB (if address visible) | |

### Listing Features
| # | Field | RESO Name | Distribution | Notes |
|---|-------|-----------|-------------|-------|
| I17 | Board Approval Required | BoardApprovalYN | PUB | |
| I18 | Number of Bedrooms | BedroomsTotal | PUB | **REQUIRED** |
| I19 | Number of Bathrooms | BathroomsFull | PUB | **REQUIRED** |
| I20 | Number of Half Baths | BathroomsHalf | PUB | |
| I21 | Number of Total Rooms | NumberOfRoomsTotal | PUB | |
| I22 | Pet Policy (Unit) | PetsAllowed | PUB | Must agree with building policy |
| I23 | Photo Sort Order | MediaOrder | PUB | |
| I24 | Private Outdoor Space | PrivateOutdoorSpaceYN | PUB | **Required since Feb 2025** |
| I25 | Property Condition | PropertyCondition | AGT | Agent-only with mandatory disclaimer |
| I26 | Washer/Dryer | WasherDryer | PUB | |

### Agents & Firms
| # | Field | RESO Name | Distribution | Notes |
|---|-------|-----------|-------------|-------|
| I27 | Listing Agent Name | ListAgentFullName | PUB | |
| I28 | Listing Agent License | ListAgentStateLicense | PUB | |
| I29 | Listing Agent Phone | ListAgentDirectPhone | PUB | |
| I30 | Listing Agent Email | ListAgentEmail | PUB | |
| I31 | Listing Office Name | ListOfficeName | PUB | |
| I32 | Listing Office ID | ListOfficeMlsId | PUB | |
| I33 | Buyer Agent (Closed) | BuyerAgentFullName | CLOSE | Required when closing |
| I34 | Buyer Office (Closed) | BuyerOfficeName | CLOSE | Required when closing |

### Display Permissions
| # | Field | RESO Name | Distribution | Default | Notes |
|---|-------|-----------|-------------|---------|-------|
| I35 | IDX Display | IDXEntireListingDisplayYN | CTL | **True** | LMPs MUST default to True |
| I36 | Internet Display | InternetEntireListingDisplayYN | CTL | Yes | Auto-cascades when False |
| I37 | Address Display | InternetAddressDisplayYN | CTL | Yes | |
| I38 | AVM Display | InternetAutomatedValuationDisplayYN | CTL | Yes | |
| I39 | Consumer Comments | InternetConsumerCommentYN | CTL | Yes | |
| I40 | Participant Only | Permissions = Private | CTL | — | Cannot combine with Owner Opt-Out |
| I41 | Syndication | SyndicateYN | CTL | **True** | LMPs MUST default to True |

### Status, Price & Dates
| # | Field | RESO Name | Distribution | Notes |
|---|-------|-----------|-------------|-------|
| I42 | Listing Status | MLSStatus (StandardStatus) | PUB | |
| I43 | List Price | ListPrice | PUB | Rental: gross monthly, NOT net-effective |
| I44 | Listing Contract Date | ListingContractDate | PUB | Not editable once submitted. Max 1yr future |
| I45 | Expiration Date | ExpirationDate | INT (Hidden) | Max 10yr. Confidential per Exhibit A |
| I46 | First Showing Date | FirstShowingDate | PUB | Default = listing entry date |
| I47 | Close Date | CloseDate | CLOSE | Must be ≥ PurchaseContractDate |
| I48 | Close Price | ClosePrice | CLOSE | Required within 24hrs of closing |
| I49 | Contract Date | PurchaseContractDate | CLOSE | Must be ≥ ListingContractDate |
| I50 | Concessions | Concessions + ConcessionsAmount | AGT/INT | |
| I51 | Status Change Date | StatusChangeTimestamp | SYS | |

### Showing & Open House
| # | Field | RESO Name | Distribution | Notes |
|---|-------|-----------|-------------|-------|
| I52 | Open House Date/Time | OpenHouseDate + Start + End | PUB | |
| I53 | Showing Instructions | ShowingInstructions | AGT | Privileged, not public |

### Agreements
| # | Field | RESO Name | Distribution | Notes |
|---|-------|-----------|-------------|-------|
| I54 | Co-Broke Agreement | ListingAgreement | PUB | RUNDBA type |
| I55 | Listing Type | ListingAgreement | PUB | Cannot mix sale/lease types |

### Additional: Sales (Condo/Coop/Condop)
| # | Field | RESO Name | Distribution | Notes |
|---|-------|-----------|-------------|-------|
| I56 | Flip Tax | FlipTax | PUB | |
| I57 | Living Area (Condo) | LivingArea | PUB | |
| I58 | Maintenance/Common Charges | AssociationFee | PUB | Conditional on CommonInterest type |
| I59 | Max Financing | MaxFinancing | PUB | |
| I60 | Number of Shares (Coop) | NumberOfShares | PUB | |
| I61 | Percent of Common Elements | PercentOfCommonElements | PUB | 0-100 scale |
| I62 | Tax Abatement | TaxAbatementYN | PUB | |
| I63 | Tax Monthly (Condo) | TaxAnnualAmount / 12 | PUB | |

### Additional: Sales (Building/Townhouse)
| # | Field | RESO Name | Distribution | Notes |
|---|-------|-----------|-------------|-------|
| I64 | Building Area Total | BuildingAreaTotal | PUB | Required for certain subtypes |
| I65 | Garage | GarageYN | PUB | |
| I66 | Size Dimensions | LotSizeDimensions | PUB | |
| I67 | Tax Annual Amount | TaxAnnualAmount | PUB | |
| I68 | Total Legal Rooms | TotalActualRent (legal rooms) | PUB | |

### Additional: Rental/Lease
| # | Field | RESO Name | Distribution | Notes |
|---|-------|-----------|-------------|-------|
| I69 | Availability Date | AvailabilityDate | PUB | **Required** for ResidentialLease |
| I70 | Furnished | Furnished | PUB | **Required** for ResidentialLease |
| I71 | Furnished Price | FurnishedListPrice | PUB | Required if Furnished ≠ Unfurnished |
| I72 | Min Lease Months | MinLeaseMonths | PUB | Must be ≥ 1 |
| I73 | Max Lease Months | MaxLeaseMonths | PUB | Optional |
| I74 | Furnished Min Months | FurnishedMinLeaseMonths | PUB | Same conditional |
| I75 | Furnished Max Months | FurnishedMaxLeaseMonths | PUB | Same conditional |
| I76 | Lease Type | LeaseType | PUB | Stabilized or Non-Stabilized (required for RentalBuilding) |
| I77 | Deposit Amount | DepositAmount | PUB | Optional |
| I78 | Owner Pays | OwnerPays | PUB | ResidentialLease only, individual owners or <5 units |
| I79 | Move-In Costs | MoveInCosts + MoveInCostsAmountTotal | PUB | Total required if costs entered |

---

# 4. All 448 RLS Fields — 29 Categories

> Full field details in `memory/REBNY-MASTER.md` (Parts B1–B29).
> Below is the category summary with counts and key fields.

| Cat | Category | Field Count | Key Required Fields |
|-----|----------|-------------|---------------------|
| B1 | Address & Location | ~25 | StreetNumber, StreetName, StreetSuffix, City, CityRegion, CountyOrParish, PostalCode, UnitNumber |
| B2 | Property Classification | ~15 | PropertyType, PropertySubType, CommonInterest, OwnershipType |
| B3 | Building Physical | ~20 | StoriesTotal, NumberOfUnitsTotal, YearBuilt, BuildingAreaTotal |
| B4 | Unit Physical | ~18 | BedroomsTotal, BathroomsFull, BathroomsHalf, NumberOfRoomsTotal, LivingArea |
| B5 | Financial (Sale) | ~20 | ListPrice, AssociationFee, TaxAnnualAmount, FlipTax, MaxFinancing |
| B6 | Financial (Rental) | ~15 | ListPrice, DepositAmount, MoveInCosts, MoveInCostsAmountTotal |
| B7 | Listing Status & Dates | ~20 | MLSStatus, ListingContractDate, StatusChangeTimestamp, CloseDate, ClosePrice |
| B8 | Agent & Office | ~25 | ListAgent*, ListOffice*, BuyerAgent*, BuyerOffice* (names, IDs, phones, emails) |
| B9 | Teams | ~8 | ListTeamMlsId, ListTeamName, BuyerTeamMlsId, BuyerTeamName |
| B10 | Display Permissions | ~10 | IDXEntireListingDisplayYN, InternetEntireListingDisplayYN, InternetAddressDisplayYN, SyndicateYN |
| B11 | Description & Remarks | ~8 | PublicRemarks, PrivateRemarks, ShowingInstructions, Directions |
| B12 | Media & Photos | ~10 | MediaURL, MediaOrder, PhotosCount |
| B13 | Building Features | ~30 | BuildingFeatures, BuildingPetsAllowed, Laundry, Cooling, Heating, Security, Parking |
| B14 | Unit Features | ~25 | InteriorFeatures, Appliances, PetsAllowed, WasherDryer, Fireplace |
| B15 | Exterior/Land | ~15 | LotSizeArea, ExteriorFeatures, PatioAndPorchFeatures, Pool |
| B16 | Utilities | ~10 | Electric, Gas, Water, Sewer |
| B17 | Tax & Assessment | ~12 | TaxAnnualAmount, TaxBlock, TaxLot |
| B18 | HOA/Condo/Coop | ~15 | AssociationFee, NumberOfShares, PercentOfCommonElements, BoardApprovalYN |
| B19 | Open House | ~8 | OpenHouseDate, OpenHouseStartTime, OpenHouseEndTime, OpenHouseType |
| B20 | Showing | ~6 | ShowingInstructions, ShowingContactName, ShowingContactPhone |
| B21 | New Development | ~8 | NewDevelopmentYN, NewConstructionYN, SponsorUnitYN |
| B22 | Closing | ~10 | CloseDate, ClosePrice, BuyerFinancing, PurchaseContractDate |
| B23 | Room Details | ~8 | RoomType, RoomLevel, RoomDimensions, RoomDescription |
| B24 | Income/Expense | ~15 | GrossIncome, NetOperatingIncome, CapRate, OperatingExpense |
| B25 | Green/Energy | ~6 | GreenBuildingVerification, GreenEnergyEfficient |
| B26 | Structure | ~8 | Roof, Foundation, Construction, OtherStructures |
| B27 | Rental-Specific | ~18 | AvailabilityDate, LeaseType, Furnished, MinLeaseMonths, OwnerPays |
| B28 | System IDs & Metadata | ~12 | ListingID, ListingKey, SourceSystemKey, SourceSystemName |
| B29 | Other | ~5 | BasementYN, Basement, Meters |

### Distribution Profile Codes

Every field has a distribution profile controlling who sees it:

| Code | Meaning | Who Sees It |
|------|---------|------------|
| **PUB** | Public | Everyone — IDX, VOW, syndication, consumer sites |
| **PUB-A** | Public with Disclaimer | Everyone, but requires mandatory disclaimer (e.g., PropertyCondition) |
| **AGT** | Agent Only | RLS Authorized Participants only — NOT public, NOT IDX/VOW |
| **HID** | Hidden | Not displayed to anyone except internal system |
| **CTL** | Control | Display permission toggles — drive visibility of other fields |
| **SYS** | System | Auto-generated by RLS system — not editable |
| **CLOSE** | Closing Only | Only populated/visible when listing status = Closed |
| **INT** | Internal | Backend only — never displayed publicly |

---

# 5. Distribution Gates — What to Share vs. Not Share

## The 6 Distribution Gates

Every listing must pass through these gates before appearing on any channel:

### Gate 1: Owner Opt-Out
```
CHECK: Permissions ≠ OwnerOptOut
FAIL → Listing visible NOWHERE (not even RLS participants)
       Only 1:1 non-automated phone calls and personal emails allowed
```

### Gate 2: Participant Only
```
CHECK: Permissions ≠ Private
FAIL → Listing visible ONLY to RLS Authorized Participants
       No IDX, no VOW, no syndication, no public websites
       DOM does NOT accrue
```

### Gate 3: IDX Display
```
CHECK: IDXEntireListingDisplayYN = True
   AND ListOfficeIDXParticipationYN = True
   AND InternetEntireListingDisplayYN = True
FAIL → Listing excluded from IDX feeds (broker websites)
```

### Gate 4: Syndication
```
CHECK: SyndicateYN = True
   AND SyndicateTo includes target portal
FAIL → Listing excluded from syndication portals
```

### Gate 5: Coming Soon
```
CHECK: MLSStatus = ComingSoon
IF TRUE → Display "Coming Soon. No Showings or Open House until [date]"
          No negotiations, no showings, no open houses
          Max 14 calendar days
```

### Gate 6: Closed Status
```
CHECK: MLSStatus = Closed
IF TRUE → Remove/mark closed on broker website within 24hrs
          Only primary photo remains in IDX/VOW (off-market photo policy)
          BuyerAgent/BuyerOffice fields become required
```

## What Each Channel Can See

| Data Category | RLS (Participants) | IDX (Public Websites) | VOW (Registered Consumers) | Syndication (Portals) |
|---------------|-------------------|----------------------|---------------------------|----------------------|
| Address | Always | If InternetAddressDisplayYN=True | If InternetAddressDisplayYN=True | If InternetAddressDisplayYN=True |
| List Price | Always | Yes | Yes | Yes |
| Description | Always | Yes (scanned for compliance) | Yes | Yes |
| Photos | Always | Yes | Yes | Yes |
| Private Remarks | Yes | **NO** | **NO** | **NO** |
| Showing Instructions | Yes | **NO** | **NO** | **NO** |
| Property Condition | Yes (with disclaimer) | **NO** | **NO** | **NO** |
| Expiration Date | Hidden from all | **NO** | **NO** | **NO** |
| Seller/Owner Identity | Pre-close only | **NEVER** | **NEVER** | **NEVER** |
| Buyer Identity | Pre-close only | **NEVER** | **NEVER** | **NEVER** |
| Compensation Amounts | **NEVER** (removed Aug 2025) | **NEVER** | **NEVER** | **NEVER** |
| Concessions Amount | Yes | **NO** | **NO** | **NO** |
| All Expense Fields | Yes | **NO** | **NO** | **NO** |
| Tax Block/Lot | Yes | **NO** | **NO** | **NO** |
| ExpirationDate | Hidden | **NEVER** | VOW with BBO flag only | **NEVER** |
| Agent Compensation | **NEVER** | **NEVER** | **NEVER** | **NEVER** |
| DOM | Yes | Calculated | Calculated | Calculated |

---

# 6. IDX / VOW / Internet Display Rules

## IDX Display Logic (ALL must be true)

A listing appears on IDX broker websites when:
1. `IDXEntireListingDisplayYN = True` (listing-level opt-in)
2. `ListOfficeIDXParticipationYN = True` (office-level — system-generated)
3. `InternetEntireListingDisplayYN = True` (internet display master toggle)
4. `Permissions` is NOT "Private" (not Participant Only)
5. `Permissions` is NOT "OwnerOptOut" (not opted out)
6. `MLSStatus` is displayable (Active, ComingSoon, Pending — NOT Withdrawn/Cancelled/Expired)

## Required IDX Attribution (NAR Policy 7.58 — Effective Jan 1, 2022)

All IDX displays **MUST** include:

1. **Listing Brokerage Name** — on every listing, in a reasonably prominent location
2. **Listing Broker Contact** — email OR phone selected by listing participant (their choice)
3. **Displaying Broker Identification** — your own brokerage name in readily visible color and typeface
4. **MLS Attribution** — credit to the REBNY RLS data source

For REBNY specifically:
- "Courtesy of [Listing Firm Name]" or equivalent
- REBNY RLS copyright notice
- Data update timestamp

**Attribution must be:**
- In a reasonably prominent location
- In a readily visible color
- In typeface not smaller than the median used in the listing display
- Clear and legible (not hidden by small font, low contrast, or other means)

## Required Statistical Data Attribution

Any statistics derived from RLS data must include:
> "Based on information from the REBNY Listing Service for the period [start date] through [end date]. The REBNY Listing Service makes no representations or warranties with respect to the accuracy or completeness of such information and shall not be held liable for any omission or inaccuracy of such information thereof."

## IDX Display Rules (REBNY + NAR)

| # | Rule |
|---|------|
| 1 | **No Data Modification** — content must not be changed from what MLS provides. No editing remarks, changing prices, or altering photos. |
| 2 | **No Framing** — cannot frame other sites' listing content without permission |
| 3 | **Photo Integrity** — cannot remove watermarks, crop photos, or display partial images |
| 4 | **Data Freshness** — must refresh data no less than every 15 minutes (REBNY requirement) |
| 5 | **Closed Listing Removal** — must remove or mark closed within 24 hours |
| 6 | **No Scraping** — must employ reasonable efforts to prevent unauthorized data access |
| 7 | **No Deceptive Advertising** — no misleading co-branding on MLS listing pages |
| 8 | **Consumer Contact** — must provide way for consumers to contact displaying broker (email, phone, or live chat) |

## IDX vs. VOW Comparison

| Feature | IDX | VOW |
|---------|-----|-----|
| **Audience** | General public | Registered consumers only |
| **Registration Required** | No | Yes (name + valid email) |
| **Broker Relationship** | Not required | Must establish lawful broker-consumer relationship |
| **Data Available** | Active listings (public subset) | Active + additional (sold, expired, pending, DOM, history) |
| **Seller Opt-Out** | Yes (`InternetEntireListingDisplayYN`) | Yes (same field) |
| **Broker Opt-Out** | Yes (can opt out of IDX) | No (brokers cannot opt out of VOW) |
| **Terms of Use** | Not required | Required (must be affirmatively accepted) |
| **Password Policy** | N/A | Must be reconfirmed/changed every 90 days |
| **Financial Agreements** | N/A | Must be separate document, cannot be accepted by mouse click alone |
| **Attribution** | Listing broker name + contact | Listing broker name + contact |
| **Consumer Contact** | Not required | Must provide email, phone, or live chat + respond knowledgeably |

## VOW-Specific Requirements

1. **Registration:** Consumer must provide name and valid email. Broker must send confirmation email.
2. **Terms of Use:** Consumer must affirmatively agree. Must acknowledge broker-consumer relationship.
3. **Password Rotation:** Passwords must be reconfirmed or changed every 90 days minimum.
4. **Scraping Protection:** Must implement reasonable measures to prevent unauthorized data access.
5. **Display Standards:** Same attribution requirements as IDX.
6. **Financial Agreements:** Any agreement imposing financial obligation must be a separate document, prominently labeled, cannot be accepted by mouse click alone.
7. **ExpirationDate:** Available in VOW only with BBO (Back Before Offer) flag.
8. **FARE Act:** If `InternetEntireListingDisplayYN = False`, listing excluded from VOW too.

## Internet Display Fields

| Field | Default | Who Controls | Cascade |
|-------|---------|-------------|---------|
| `InternetEntireListingDisplayYN` | Yes | Seller/Owner | When False → auto-sets IDX=False, Address=False, AVM=False, Comments=False, alerts disabled |
| `InternetAddressDisplayYN` | Yes | Seller/Owner | Hides address on all internet displays |
| `InternetAutomatedValuationDisplayYN` | Yes | Seller/Owner | Hides AVM/Zestimate-type data |
| `InternetConsumerCommentYN` | Yes | Seller/Owner | Disables consumer comments/reviews |
| `IDXEntireListingDisplayYN` | **True** | LMP default (agent adjustable) | Must be True for IDX feeds |
| `SyndicateYN` | **True** | LMP default (agent adjustable) | Must be True for syndication |

### CRITICAL Default Requirements
- LMPs (including RealPlus) are **REQUIRED** to default `IDXEntireListingDisplayYN = True`
- LMPs are **REQUIRED** to default `SyndicateYN = True`
- Sale listings with `Permissions = Null` **CANNOT** set `InternetEntireListingDisplayYN = False`

---

# 7. Content Restrictions — What Can NEVER Appear

## In Descriptions, Photos, Floorplans, Comments, Internet Remarks

| # | Prohibited Content | UCBA Ref | Fine |
|---|-------------------|----------|------|
| 1 | Agent name, contact info, or URL links | Art. I, §5(C) | $250–$10K |
| 2 | "Off-Market" language about any Exclusive Listing | Art. I, §5(D) | $250–$10K |
| 3 | Compensation/broker fees/closing costs | Art. I, §5(E) | $250–$10K |
| 4 | "Free services" claims (unless truly free) | Art. III, §5 | $250–$10K |
| 5 | Fair Housing violations (Federal + NY + NYC) | Exhibit C | $250 first, $500+termination second |
| 6 | Criminal history/background check language | NYC LL 24/2023 | NYC penalty |
| 7 | Source of income discrimination language | NYC/NY State | NYC penalty |

## Data That Must NEVER Be Displayed Publicly

| Data | Where It Can Appear |
|------|--------------------|
| ExpirationDate | Internal only (marked "Hidden" in Exhibit A) |
| Seller/Owner identity | Internal only until after closing |
| Buyer identity | Internal only until after closing |
| PropertyCondition | RLS Participants + mandatory disclaimer only |
| ShowingInstructions | RLS Participants only |
| PrivateRemarks | RLS Participants only |
| Compensation amounts | **NEVER anywhere** (removed from RLS Aug 2025) |
| ConcessionsAmount (dollar) | RLS agent view + internal only |
| All expense fields | RLS agent view + internal only |
| Tax Block/Lot | RLS + internal only |

## Fair Housing Prohibited Patterns

Must scan for (minimum):
- Race/ethnicity references
- Religion references
- Family status (familial, children, adult-only, senior-only without HOPA)
- Disability language
- Gender/sexual orientation
- National origin
- Source of income ("no Section 8", "no DSS", "no SSI", "no vouchers")
- Criminal history ("arrest", "conviction", "criminal", "felon", "background check required", "ex-con")
- Steering language (implying neighborhood character by protected class)

---

# 8. RESO Data Dictionary 2.0 Standards

## Overview
- **Approved:** October 23, 2023 | **Ratified:** April 2024
- **MLS Certification Deadline:** April 15, 2025 (all DD 1.7 certs downgraded to "Certified Legacy")
- **Trestle:** Achieved RESO DD 2.0 Vendor Certification + Platinum Certification
- **API Format:** OData v4.0 (RESTful)
- **Primary change:** Stricter enforcement (not sweeping content changes). Payload data must match metadata exactly.
- **Testing:** 4 stages (up from 2): data types, synonym validation, admin review, fast track

## RESO Resource Hierarchy

The Data Dictionary is organized: **Resources > Fields > Lookups (Enumerations)**

| Resource | Primary Key | Description |
|----------|------------|-------------|
| **Property** | ListingKey | All listing data (448+ fields for REBNY) — the largest resource |
| **Member** | MemberKey | Agent/broker records |
| **Office** | OfficeKey | Brokerage office records |
| **Media** | MediaKey | Photos, videos, documents |
| **OpenHouse** | OpenHouseKey | Open house events |
| **Teams** | TeamKey | Team records (name, lead, status) |
| **TeamMembers** | TeamMemberKey | Links members to teams |
| **Contacts** | ContactKey | Contact/lead data |
| **ContactListings** | — | Association between contacts and listings |
| **Showing** | ShowingKey | Showing events (new in DD 2.0) |
| **SavedSearch** | — | Saved search criteria |
| **History** | — | Price/status change history |

**New in DD 2.0:** Association management, member/office state licensing, showings, caravans, and event sourcing resources.

## Field Naming Conventions (STRICTLY ENFORCED in DD 2.0)

RESO uses **PascalCase** (UpperCamelCase) for ALL field and lookup names:

| Pattern | Convention | Examples |
|---------|-----------|----------|
| General fields | PascalCase | `ListPrice`, `BedroomsTotal`, `StandardStatus` |
| Boolean fields | End in `YN` | `AttachedGarageYN`, `BasementYN`, `InternetAddressDisplayYN` |
| Key fields | End in `Key` | `ListingKey`, `MemberKey`, `OfficeKey` |
| ID fields | End in `Id` or `MlsId` | `ListingId`, `BuyerAgentMlsId` |
| Numeric keys | End in `KeyNumeric` | `BuyerAgentKeyNumeric`, `ListAgentKeyNumeric` |
| Timestamps | End in `Timestamp` | `ModificationTimestamp`, `StatusChangeTimestamp` |
| Dates | End in `Date` | `ListingContractDate`, `CloseDate`, `AvailabilityDate` |

**Synonym enforcement:** DD 2.0 requires removal of all non-standard field name synonyms. Providers can no longer use local names alongside standard names. This is a breaking change from DD 1.7.

## Data Types

| RESO Type | OData Equivalent | Description |
|-----------|------------------|-------------|
| String | `Edm.String` | Free text. Max length defined per field. |
| Number | `Edm.Int64` or `Edm.Decimal` | Integer or decimal. |
| Boolean | `Edm.Boolean` | True/false (YN fields). |
| Date | `Edm.Date` | Date only (e.g., `2026-02-19`). Business dates. |
| Timestamp | `Edm.DateTimeOffset` | Date + time + timezone (e.g., `2026-02-19T14:30:00-05:00`). System-generated. |
| Single Enum | `Edm.EnumType` | Fixed picklist, single value (e.g., `StandardStatus`). |
| Multi Enum | `Collection(Edm.EnumType)` | Fixed picklist, multiple values (e.g., `Appliances`). |
| String List | `Collection(Edm.String)` | Multi-value string list. |

## StandardStatus Lookups (DD 2.0)

| Value | Description |
|-------|-------------|
| `Active` | Available for showing and sale/lease |
| `Active Under Contract` | Under contract but accepting backup offers |
| `Canceled` | Listing agreement canceled |
| `Closed` | Sale/lease completed |
| `Coming Soon` | Pre-market (no showings allowed) |
| `Delete` | Record removed from system |
| `Expired` | Listing agreement expired |
| `Hold` | Temporarily off market |
| `Incomplete` | Data entry not finished |
| `Pending` | Under contract, not accepting backups |
| `Withdrawn` | Removed from active market |

## PropertyType Lookups

| Value | Description |
|-------|-------------|
| `Residential` | Residential for sale |
| `Residential Lease` | Residential rental |
| `Residential Income` | Multi-family investment |
| `Commercial Sale` | Commercial for sale |
| `Commercial Lease` | Commercial lease |
| `Land` | Vacant land |
| `Farm` | Farm/ranch |
| `Business Opportunity` | Business for sale |

## Key Changes from DD 1.x to 2.0

| Change | Old | New | Impact |
|--------|-----|-----|--------|
| PropertySubType value | "Quadraplex" | "Four Or More Units" | Update all hardcoded strings |
| PropertySubType value | "Vacant Land" | Removed (blank subtype) | Handle blank subtypes |
| Interior features | "Intercom" in InteriorFeatures | Moved to OtherEquipment | Update feature filters |
| Interior features | "Office" in InteriorFeatures | Moved to RoomType | Update feature filters |
| Interior features | "Skylights" in InteriorFeatures | Moved to WindowFeatures | Update feature filters |
| Lookup spelling | "Lightning" | "Lighting" | Update enum strings |
| Lookup spelling | "Cathedral Ceilings" | "Cathedral Ceiling(s)" | Update enum strings |
| Lookup spelling | "Track Lightning" | "Track Lighting" | Update enum strings |
| Lookup spelling | "Vaulted Ceiling" | "Vaulted Ceiling(s)" | Update enum strings |
| Lookup spelling | "Barn" | "Barn(s)" | Update enum strings |
| New fields | — | CoBuyerAgent*, CoListAgent* | Add to field map |
| New fields | — | CoBuyerOffice*, CoListOffice* | Add to field map |
| New fields | — | BackOnMarketTimestamp | Add to status tracking |
| New fields | — | ExpirationDate (VOW/BBO) | VOW display only |
| New fields | — | AttributionContact | Attribution text |
| Price separation | ListPrice included current | CurrentPrice separated | Separate tracking |
| Pagination | Relative nextLink URLs | Full URL nextLink | Update pagination logic |
| Page size | Smaller default | Default 50 | Verify batch handling |
| Synonym enforcement | Synonyms allowed | Synonyms must be removed | Breaking change |
| Testing | 2 stages | 4 stages | More rigorous certification |

## RESO DD Subsequent Patches
| Version | Date | Changes |
|---------|------|---------|
| DD 2.0 | April 2025 | Major field/lookup renames (above) |
| DD 2.1 | 2025 | Association Management + Offer Management resources |
| DD 2.2 | 2025 | `webp` MediaType + High-Speed Internet fields |
| DD 3.0 | 2026 | WaterBodyRestrictions, WaterBodyRestrictionsYN |
| Patch #185 | Sep 2025 | 66 new lookup values |
| Patch #186 | Oct 2025 | 40 new lookup values |
| Patch #187 | Nov 2025 | 52 new lookup values |
| Patch #188 | Jan 2026 | 98 new lookup values |

## REBNY-Specific Extensions (Not Standard RESO)

These fields are REBNY-specific and appear as custom/local fields in Trestle:
- **Borough** (REBNY uses 5 NYC boroughs — not standard RESO geography)
- **Neighborhood** (59 REBNY-defined neighborhoods)
- **Ownership Type "Condop"** (REBNY-specific)
- **Building Sublet Policy**
- **Board Approval Required**
- **Flip Tax** details
- **Unit Pet Policy** (separate from building pet policy)
- **Area over/under FAR**
- **Building Staff Type**

## RESO Web API Standards (OData v4.0)

### Architecture
- **Transport:** HTTP/HTTPS (TLS required)
- **Query Language:** OData v4.0
- **Response Format:** JSON (application/json)
- **Authentication:** OAuth 2.0 (Bearer token or Client Credentials)
- **Metadata:** XML (EDMX) at `/$metadata` endpoint

### Trestle API Base URLs
```
Production (old): https://api-prod.corelogic.com/trestle/odata/
Production (new): https://api.cotality.com/trestle/odata/    ← use this (Cotality rebrand)
```

### Endpoints
```
GET /odata/Property          — Query properties (listings)
GET /odata/Member            — Query agents/brokers
GET /odata/Office            — Query brokerage offices
GET /odata/Media             — Query photos/media
GET /odata/OpenHouse         — Query open house events
GET /odata/$metadata         — Get EDMX schema definition (XML)
```

### OData Query Options

| Option | Purpose | Example |
|--------|---------|---------|
| `$filter` | Filter results | `$filter=ListPrice lt 1000000 and City eq 'New York'` |
| `$select` | Choose fields | `$select=ListingKey,ListPrice,BedroomsTotal` |
| `$orderby` | Sort results | `$orderby=ListPrice desc` |
| `$top` | Limit rows | `$top=25` |
| `$skip` | Skip rows | `$skip=100` |
| `$count` | Get total count | `$count=true` |
| `$expand` | Include related | `$expand=Media` |

### Filter Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `eq` | Equals | `StandardStatus eq 'Active'` |
| `ne` | Not equals | `StandardStatus ne 'Closed'` |
| `gt` / `ge` | Greater than / or equal | `ListPrice gt 500000` |
| `lt` / `le` | Less than / or equal | `ListPrice lt 1000000` |
| `and` / `or` / `not` | Logical operators | `City eq 'New York' and ListPrice lt 500000` |
| `in` | In list | `ListingId in ('12345','67890')` |
| `contains()` | String contains | `contains(PublicRemarks,'pool')` |
| `startswith()` | String starts with | `startswith(StreetName,'Park')` |

### Real-World Trestle Queries
```
# Active NYC listings under $1M
GET /odata/Property?$filter=ListPrice lt 1000000 and City eq 'New York' and StandardStatus eq 'Active'&$orderby=ListPrice desc&$top=25&$select=ListingKey,ListPrice,BedroomsTotal,BathroomsTotalInteger,LivingArea,StreetName,UnitNumber

# Listing with photos
GET /odata/Property?$filter=ListingKey eq 'ABC123'&$expand=Media&$select=ListingKey,ListPrice,PublicRemarks

# Bulk replication (incremental sync)
GET /odata/Property?$select=ListingKey,StandardStatus,ListPrice,ModificationTimestamp&replication=true

# Get schema metadata
GET /odata/$metadata
```

### Pagination (Server-Driven)

1. Server limits response size (varies by provider, time of day, query complexity)
2. If more results exist, response includes `@odata.nextLink` at bottom of JSON
3. Client follows `@odata.nextLink` URL for next page (FULL URL in DD 2.0, not relative)
4. Last page has no `@odata.nextLink`

Custom page size via header: `Prefer: odata.maxpagesize=100`
When `$expand` is used, limits drop to ~1/4 of normal.

### Response Format
```json
{
  "@odata.context": "https://api.cotality.com/trestle/odata/$metadata#Property",
  "@odata.count": 1500,
  "value": [
    {
      "ListingKey": "abc123",
      "ListPrice": 999000,
      "StandardStatus": "Active",
      "BedroomsTotal": 2,
      "BathroomsTotalInteger": 2,
      "City": "New York",
      "ModificationTimestamp": "2026-02-19T10:30:00-05:00"
    }
  ],
  "@odata.nextLink": "https://api.cotality.com/trestle/odata/Property?$skiptoken=abc123"
}
```

### Server MUST Support
- OData XML Metadata (EDMX) for schema
- JSON response format for data
- HTTPS/TLS transport
- OAuth2 Bearer or Client Credentials auth
- `$filter`, `$select`, `$orderby`, `$top`, `$skip` query options
- `$expand`, `$count` (SHOULD support)

---

# 9. ID Structure & Field Mapping

## Listing IDs

| ID Field | Format | Source | Editable | Notes |
|----------|--------|--------|----------|-------|
| `ListingKey` | String (RESO standard key) | Trestle/RLS | No | System-generated unique identifier |
| `ListingKeyNumeric` | Integer | Trestle/RLS | No | Numeric version of ListingKey |
| `ListingID` | "RLS" + digits (e.g., RLS1234567) | RLS Matrix DB | No | New format since Jan 2025 |
| `SourceSystemKey` | String | LMP (RealPlus) | Yes | LMP's internal listing ID |
| `SourceSystemName` | String | LMP | No | "RealPlus" |

## Agent & Office IDs

| ID Field | Format | Notes |
|----------|--------|-------|
| `ListAgentMlsId` | String | Agent's RLS ID (unique per agent) |
| `ListAgentKeyNumeric` | Integer | System unique (foreign key to Member resource) |
| `ListAgentStateLicense` | String | NY DOS license number |
| `ListOfficeMlsId` | String | Office's RLS ID |
| `ListOfficeKeyNumeric` | Integer | System unique (foreign key to Office resource) |
| `BuyerAgentMlsId` | String | Buyer agent's RLS ID |
| `BuyerOfficeMlsId` | String | Buyer office's RLS ID |

## Team IDs

| ID Field | Format | Notes |
|----------|--------|-------|
| `ListTeamMlsId` | String | Team's RLS ID (optional, PUB distribution) |
| `ListTeamName` | String | Team display name (optional, PUB) |
| `ListTeamKeyNumeric` | Integer | System auto-generated |
| `BuyerTeamMlsId` | String | Buyer team's RLS ID (optional, CLOSE distribution) |
| `BuyerTeamName` | String | Buyer team display name (optional, CLOSE) |
| `BuyerTeamKeyNumeric` | Integer | System auto-generated |

## Registration Process

| Entity | How to Register |
|--------|----------------|
| **Brokerage** | REBNY membership + RLS participation agreement + LMP account |
| **Agent** | Associate with brokerage, complete ethics training within 90 days |
| **Team** | Email RLSsupport@rebny.com with: team name, members, broker of record, office info |
| **Direct Data License** | Apply via REBNY "Member Direct Data License Feed Application" |

## Field Mapping: Our Forms → RLS RESO Fields

The key mapping principle: **every form field ID must map to a RESO field name**.

For our CRM forms:
- Sale form field: `saleListPrice` → RLS field: `ListPrice`
- Sale form field: `saleBedroomsTotal` → RLS field: `BedroomsTotal`
- Rental form field: `rentalAvailabilityDate` → RLS field: `AvailabilityDate`

### ID Naming Convention in Forms
```
Format: {formType}{RESOFieldName}
Examples:
  saleListPrice           → ListPrice
  salePropertyType        → PropertyType
  rentalFurnished         → Furnished
  rentalMinLeaseMonths    → MinLeaseMonths
  saleBuildingPetsAllowed → BuildingPetsAllowed
```

### Submission to RLS via LMP
```
Form Data (HTML) → collectFormData() → JSON payload → RealPlus API → REBNY RLS (Trestle)
```

Each field in the JSON payload must use the RESO field name as the key:
```json
{
  "PropertyType": "Residential",
  "PropertySubType": "Condominium",
  "ListPrice": 1500000,
  "BedroomsTotal": 2,
  "BathroomsFull": 2,
  "BathroomsHalf": 1,
  "StreetNumber": "400",
  "StreetName": "East 90th",
  "StreetSuffix": "Street",
  "UnitNumber": "17C",
  "CityRegion": "Manhattan",
  "CountyOrParish": "New York",
  "SubdivisionName": "Upper East Side",
  "IDXEntireListingDisplayYN": true,
  "InternetEntireListingDisplayYN": true,
  "SyndicateYN": true,
  "ListAgentMlsId": "10311201806",
  "ListOfficeMlsId": "10991205323"
}
```

---

# 10. Syndication & Distribution Flow

## How Listings Flow

```
Agent → CRM Form → RealPlus (LMP) → REBNY RLS (Trestle/Cotality)
                                           ↓
              ┌────────────────────────────┼─────────────────────────┐
              ↓                            ↓                         ↓
     Direct Data Licensees          Trestle Opt-In             StreetEasy
     (auto from RLS)               (3 toggles)              (direct upload)
              ↓                            ↓                         ↓
     Realtor.com                    openigloo                 Zillow/Trulia
     Redfin                         Samaki.com               (auto from SE)
     Homes.com/Citysnap             TBI Listings
     RentHop
```

## Feed Types

| Feed | Purpose | Public? | Login? | What It Shows |
|------|---------|---------|--------|---------------|
| **RLS** | Core REBNY database | No | Yes (Participant creds) | All fields per distribution profile |
| **IDX** | Reciprocal broker display | Yes | No | PUB fields only, with attribution |
| **VOW** | Consumer portal | Yes | Yes (registration) | PUB + some extra (DOM, history) |
| **Syndication** | Third-party portals | Yes | No | PUB fields via SyndicateTo toggles |

## Syndication Portals & Costs

### Trestle Opt-In (3 portals — all opted IN for us)
| Portal | Type | Cost |
|--------|------|------|
| openigloo | Portal/Publisher | FREE |
| Samaki.com | Portal/Publisher | FREE |
| TBI Listings | Portal/Publisher | FREE |

### Direct Data Licensees (auto from RLS)
| Portal | Sales | Rentals |
|--------|-------|---------|
| Realtor.com | FREE | FREE |
| Redfin | FREE | FREE |
| Homes.com / Citysnap | FREE | FREE |
| RentHop | N/A | FREE |

### StreetEasy (NOT via RLS — direct upload)
| Type | Cost |
|------|------|
| Sales | FREE |
| Rentals (Basic) | $7/day |
| Rentals (Plus) | $10/day |
| Rentals (Premium) | $22/day |

- Zillow/Trulia: auto-syndicated from StreetEasy (Zillow owns SE)

### IDX = True is the Master Gate
`IDXEntireListingDisplayYN = True` is what allows ALL licensed partners to display your listings.

---

# 11. Cascade Rules & Validation

## Automatic Cascades

| Trigger | Effect |
|---------|--------|
| `InternetEntireListingDisplayYN = False` | AUTO: `IDXEntireListingDisplayYN=False`, `InternetAddressDisplayYN=False`, `InternetAutomatedValuationDisplayYN=False`, `InternetConsumerCommentYN=False`. Listing alerts/auto-sharing disabled for non-exclusive agents. |
| `BuildingPetsAllowed = No` | `PetsAllowed` (unit) MUST = No |
| `FireplaceYN = true` | `FireplacesTotal` must be > 0 |
| `FireplacesTotal > 0` | `FireplaceYN` must be true |
| `PropertyType = Residential` | Cannot submit `ListingAgreement = Exclusive Right To Lease` |
| `PropertyType = ResidentialLease` | Cannot submit `ListingAgreement = Exclusive Right to Sell` |
| `Permissions = Private` | Cannot also select Owner Opt-Out |
| `NewDevelopmentYN = true` | Cannot be Coming Soon. Must have RUNDBA. |
| `ElevatorsTotal > 0` | `BuildingFeatures` must include "Elevator(s)" |
| `CityRegion` | Must match `CountyOrParish` (Kings=Brooklyn, Queens=Queens, New York=Manhattan, Richmond=Staten Island, Bronx=Bronx) |

## FARE Act Cascade (Rentals Only)
| Trigger | Effect |
|---------|--------|
| Landlord does NOT pay broker fee | `InternetEntireListingDisplayYN = False` → full internet cascade above |
| Landlord DOES pay broker fee | `InternetEntireListingDisplayYN = True` (normal syndication) |

## Field-Level Validation Rules

| Field | Rule |
|-------|------|
| StreetName | Rejects if not in REBNY Street Dictionary |
| StreetSuffix | Rejects if not in REBNY Street Dictionary |
| AlternateStreetName | Rejects if not in REBNY Street Dictionary |
| AlternateStreetSuffix | Rejects if not in REBNY Street Dictionary |
| City | Must be "New York City" |
| CityRegion + CountyOrParish | Must match (see table above) |
| YearBuilt | 4 characters, ≥ 1700, max 10 years future |
| YearRenovated | If entered, must be 4 characters |
| ExpirationDate | Max 10 years from current date |
| ListingContractDate | Not editable once submitted. Max 1 year from current |
| CloseDate | Must be ≥ PurchaseContractDate |
| PurchaseContractDate | Must be ≥ ListingContractDate |
| WithdrawnDate | Must equal OffMarketDate |
| MinLeaseMonths | Must be ≥ 1 |
| ListPrice (rental) | Must be gross monthly rent, NOT net-effective |
| PercentOfCommonElements | 0–100 scale, not fractional |
| SponsorUnitYN | Must be pursuant to AG-approved Offering Plan |

## Required Defaults

| Field | Required Default |
|-------|-----------------|
| IDXEntireListingDisplayYN | **True** |
| SyndicateYN | **True** |
| InternetAddressDisplayYN | True |
| InternetAutomatedValuationDisplayYN | True |
| InternetConsumerCommentYN | True |

---

# 12. Timing & SLA Requirements

| Action | Deadline | UCBA Ref |
|--------|----------|----------|
| RLS submission | Simultaneous with any public dissemination or first showing | Art. I, §5 |
| Status/price changes | Within 24 hours (excl weekends/postal holidays) | Art. I, §6 |
| Closing price entry | Within 24 hours of closing | Art. I, §7 |
| Remove/mark closed on website | Within 24 hours of closing | Art. I, §6 |
| Owner Opt-Out form via LMP | Within 48 hours | Art. I, §5(A) |
| Coming Soon max duration | 14 calendar days from RLS submission | Art. I, §16(A) |
| Protected period delivery | 6 names within 7 business days after expiration | Art. II, §13 |
| DOM reset | After 30 consecutive days Withdrawn/Cancelled | Art. I, §11 |
| Ethics training (new) | Within 90 days of joining | Art. XII |
| Fine payment | Within 10 days of imposition | Art. XI |
| Provide agreements to RLS staff | Within 48 hours on request | Art. IV |
| Complaint statute of limitations | 90 days from discovery | Art. V–X |
| Cure data violations | 3→2→1 business days (escalating) | Exhibit C |
| Cure Fair Housing violations | 2 business days | Exhibit C |

---

# 13. Penalties & Fines

## Fair Housing Violations
| Step | Action | Fine |
|------|--------|------|
| 1st | 2 business days to correct | $250 |
| 2nd | Termination of RLS access | Additional $500 |

## Data Quality / UCBA Violations
| Step | Action | Fine |
|------|--------|------|
| 1st | 3 business days to cure | $0 (warning) |
| 2nd | 2 business days to correct | $250 |
| 3rd | 1 business day to correct | Additional $250 |
| 4th | Termination of RLS access | — |

## Incurable Violations (e.g., advertising opted-out properties)
| Offense | Fine |
|---------|------|
| 1st in calendar year | $250 |
| Each subsequent | $500 |

## General UCBA Violations (Art. XI)
| Offense | Penalty |
|---------|---------|
| 1st | $500 |
| 2nd within 12 months | Up to $2,000 |
| 3rd within 12 months | Up to $10,000 + posted on REBNY website |
| 4th within 12 months | Suspension up to 30 days + posted |

## Quarterly Reviews
- RLS performs 4 quarterly reviews per year
- **>5% rejection/violation rate = $10,000 fine** (must pay within 3 days)
- **3 quarterly fines in a calendar year = 30-day suspension**

## IDX/Data License Violations
- $40,000 damages per listing + suspension/termination of data license

---

# 14. FARE Act (NYC Rentals)

> **Fairness in Apartment Rental Expenses Act** (NYC Local Law 119 of 2024)
> **Effective:** June 11, 2025
> **RLS Updated:** August 1, 2025

## Core Rules

| Rule | Description |
|------|-------------|
| **IDX Eligibility** | If landlord pays broker fee → `InternetEntireListingDisplayYN = Yes` (full syndication). If landlord does NOT pay → `InternetEntireListingDisplayYN = No` (excluded from IDX/VOW/syndication) |
| **Fee Disclosure** | Landlords must disclose ALL tenant-payable fees conspicuously (application fees, pre-lease-signing fees) |
| **Agent Presumption** | Agent publishing rental listing is presumed to be landlord's agent — cannot collect fees from tenants |
| **Tenant Compensation** | Tenant brokers compensated only with: (1) signed tenant rep agreement AND (2) landlord offers compensation |

## Implementation

No new REBNY fields were created. Uses existing `InternetEntireListingDisplayYN` field.

### Form Toggle
```
Landlord pays broker fee? → Yes/No radio
  YES → InternetEntireListingDisplayYN = True (normal)
  NO  → InternetEntireListingDisplayYN = False → auto-cascade:
         IDXEntireListingDisplayYN = False
         InternetAddressDisplayYN = False
         InternetAutomatedValuationDisplayYN = False
         InternetConsumerCommentYN = False
         VOW opt-out = True
         Syndication opt-out = True
         Listing alerts disabled for non-exclusive agents
```

### Fee Fields (Interim)
Dedicated REBNY fee fields are planned but NOT yet live. Use:
- `MoveInCosts` — Fee category selections
- `MoveInCostsComments` — Fee details text
- `MoveInCostsAmountTotal` — Total dollar amount
- `DepositAmount` — Security deposit
- `OwnerPays` — Owner-paid expenses
- `PublicRemarks` — Enter all fees in description (REBNY confirmed: no violation for fee text)

---

# 15. NAR Settlement Changes

> **Effective:** August 17, 2024 (settlement) / August 1, 2025 (RLS implementation)

| Rule | Description | Status |
|------|-------------|--------|
| **Compensation fields removed** | All comp fields (`BuyerAgentCompensation`, `BuyerBrokerageCompensation`, `CompensationType`, etc.) removed from RLS feed Aug 1, 2025 | ✅ No comp fields in our data |
| **No compensation display on IDX** | MLSs cannot provide feeds to platforms that display/aggregate compensation from multiple brokerages | ✅ No comp display in any view |
| **Buyer Broker Agreement required** | Written buyer representation agreement required before ANY showing (in-person or virtual) | CRM must gate showings |
| **Commission negotiability disclosure** | "Commissions are not set by law and fully negotiable" in any buyer-facing interface | ✅ Present in compliance footer |

---

# 16. Coming Soon Rules

> Art. I, §16 — **Sales ONLY (NOT rentals, NOT new developments)**

| # | Rule |
|---|------|
| 1 | Maximum **14 calendar days** from RLS submission |
| 2 | **No showings** under any circumstances (including to own clients) |
| 3 | **No open houses** (including broker tours) |
| 4 | **No negotiations or counteroffers** until moved to Active |
| 5 | May schedule appointments, but cannot show until Active |
| 6 | Must display: "Coming Soon. No Showings or Open House until [Start Showing Date]" |
| 7 | Can convey unsolicited offers to Owner, but cannot facilitate acceptance |
| 8 | One-time use per address/owner (unless off-market 60+ days) |
| 9 | Owner must sign Coming Soon Authorization (Exhibit G) |
| 10 | If not ready on Showing Start Date → must move to "Temporarily Off-Market" or "Withdrawn" |
| 11 | Showing Start Date **cannot be changed** once set |
| 12 | Required field: `ActivationDate` (when Coming Soon → Active) |
| 13 | DOM does **NOT** accrue during Coming Soon |

---

# 17. New Development (RUNDBA)

> Exhibit D — Registered Uniform New Development Brokerage Agreement

| # | Rule |
|---|------|
| 1 | Executed RUNDBA must be submitted to RLS before listing New Dev Units |
| 2 | All RLS participants deemed to have accepted RUNDBA terms |
| 3 | Must register at new development/sales office |
| 4 | Registration: written record with Prospect's full name |
| 5 | Commission earned only upon closing (absolute condition) |
| 6 | Commission based on Net Purchase Price (less credits/concessions) |
| 7 | Commissions fully negotiable |
| 8 | No advertising Units except with materials from Exclusive Sales Agent |
| 9 | Outside Broker cannot attend punch list/closing without Owner's written consent |
| 10 | Change of Broker: submit "Change of New Development Brokerage/Sales Office Form" (Exhibit E) |
| 11 | **Cannot be Coming Soon** |
| 12 | `NewDevelopmentYN = true` triggers RUNDBA requirement |

---

# 18. Owner Opt-Out Process

> Art. I, §5(A) + Exhibit B

## Form Requirements
Owner Opt-Out Form must include:
1. Owner's name
2. Exclusive Property address (including unit #)
3. Agent name and brokerage
4. Owner's signature
5. Must be submitted through **LMP only** within 48 hours (no more emailing REBNY)
6. Owner acknowledges: reduced exposure, may affect offers/price, may take longer to sell/rent

## CRM Implementation
- Opt-Out checkbox in listing form
- Upload signed Exhibit B form
- Auto-block ALL syndication (IDX, VOW, portals, alerts)
- Allow ONLY: non-automated phone calls and 1:1 personal emails to Participants
- Cannot change from Private to Owner Opt-Out (or vice versa)
- If listing was ever Private or null, CANNOT later become Owner Opt-Out

---

# 19. Implementation Checklist

## CRM Backend — Must Have (Compliance Critical)

### Listing Management
- [ ] Listing type restricted to Exclusive types only (including co-exclusive)
- [ ] Simultaneous RLS submission on public dissemination
- [ ] Owner Opt-Out form upload + auto-block syndication + 1:1 comms only
- [ ] Coming Soon workflow (14-day max, no showings, date tracking, sales only)
- [ ] DOM calculation engine (start, pause, reset at 30 days, Coming Soon exempt)
- [ ] Status change timestamp tracking (24hr compliance SLAs)
- [ ] Closing Price entry within 24hrs workflow
- [ ] Withdrawal constraint: block RLS withdrawal if public display active
- [ ] Duplicate listing prevention during active exclusive term
- [ ] All Exhibit A mandatory fields present in listing forms

### Content Validation
- [ ] No agent info in descriptions/photos/floorplans/comments
- [ ] No "Off-Market" text in any listing content
- [ ] No compensation text in descriptions/comments
- [ ] No "free services" claims (unless truly free)
- [ ] Fair Housing text scanner (Federal + NY + NYC)
- [ ] Fair Chance Housing Act scanner (criminal history language)
- [ ] Source of income discrimination scanner
- [ ] FARE Act cascade (rental InternetEntireListingDisplayYN)

### Display Permissions
- [ ] IDX/Participant Only/Syndication display toggles
- [ ] Default IDXEntireListingDisplayYN = True
- [ ] Default SyndicateYN = True
- [ ] InternetEntireListingDisplayYN cascade logic
- [ ] Address suppression (InternetAddressDisplayYN)
- [ ] AVM suppression (InternetAutomatedValuationDisplayYN)
- [ ] Consumer comment suppression (InternetConsumerCommentYN)

### Agreements & Process
- [ ] Buyer Representation Agreement tracking (required before showing)
- [ ] Commission negotiability disclosure in listing/buyer agreements
- [ ] Protected period tracking (6 names, 90 days after termination)
- [ ] New Development RUNDBA upload/verification
- [ ] Multiple bids disclosure workflow
- [ ] Board package cover sheet template (both broker contacts, no logos)

### Field Mapping
- [ ] All 79 mandatory fields (I1–I79) mapped to RESO names
- [ ] All 448 RLS fields categorized by distribution profile
- [ ] Conditional fields validated (e.g., FurnishedListPrice if Furnished ≠ Unfurnished)
- [ ] Street Dictionary validation for address fields
- [ ] Borough/County matching validation
- [ ] Listing ID format: "RLS" + digits

### Audit Logging
- [ ] Status changes, price changes, publish/unpublish
- [ ] Opt-out/participant-only toggles
- [ ] Compliance scan results and correction timestamps
- [ ] Data exports (who, when, snapshot)
- [ ] Showing appointment tracking

## Frontend Website — Must Have

- [ ] REBNY RLS attribution on all IDX-displayed listings
- [ ] Statistical data REBNY disclaimer with date range
- [ ] Respect InternetEntireListingDisplayYN (hide if False)
- [ ] Respect InternetAddressDisplayYN (hide address if False)
- [ ] Respect Participant Only / Owner Opt-Out (never display)
- [ ] Coming Soon badge with "No Showings until [date]"
- [ ] Remove/mark closed listings within 24hrs
- [ ] No "Off-Market" language anywhere
- [ ] No compensation amounts displayed
- [ ] No seller/buyer identity until after closed
- [ ] NY Source of Income platform notice (V1)
- [ ] Listing poster SOI affirmation before publishing (V2)

## API Integration (Production — Trestle/Cotality)

- [ ] Base URL: `https://api.cotality.com/trestle/odata/` (new — old `api-trestle.corelogic.com` being deprecated)
- [ ] OAuth 2.0 Bearer token authentication
- [ ] OData v4.0 query syntax
- [ ] Handle DD 2.0 field renames (Quadraplex → Four Or More Units, etc.)
- [ ] Handle full-URL nextLink pagination (DD 2.0 change)
- [ ] Default page size 50 (DD 2.0)
- [ ] Periodic lookup value sync (quarterly patches)
- [ ] Error handling for Street Dictionary rejections
- [ ] Rate limiting and retry logic

---

# 20. Pre-Licensed Providers & Feed Types

## LMP (Listing Management Platforms) — 8 Total
1. BrokersNYC
2. Leadkit
3. Lofty
4. OLR (Online Residential)
5. Perchwell
6. **RealPlus** (ours)
7. RealtyMX
8. RESoft

## IDX Providers — 30 Total
blankslate, blueroof360, BoomTown, CINC, Constellation RE, Home ASAP, HomeJunction, IDX (Elm Street), iHomefinder, kvCORE, Leadkit, Lofty, Luxury Presence, MoxiWorks, OLR, propertybase, PropMiX, RE Webmasters, RealGeeks, RealPlus, RealtyMX, Realtyna, RealtyWatch, RESoft, Sierra Interactive, Smarter Agent, The House Club, TREM Group, Xome, Ylopo

## VOW Providers — 3 Total
1. Lofty
2. OLR
3. Zenlist

## Direct Network Portals — 3 Total
1. openigloo
2. Samaki.com
3. TBI Listings

## Product Providers — 10 Total
BoldTrail, brokerloop, Core Present, Espresso Agent, Haystack, LiveBy, Nancy Packes, PerryStory, UrbanDigs, Vulcan7

## NOT on Pre-Licensed Lists (own data licenses)
Realtor.com, Redfin, Homes.com, Zillow/StreetEasy, RentHop, RealtyHop, Compass

## Direct Data License Path (for mallan.nyc)

| Step | What | How |
|------|------|-----|
| 1 | Apply | "Member Direct Data License Feed Application" on REBNY site |
| 2 | Sign | Data License Agreement via Trestle — Principal Broker signs |
| 3 | Get API Access | Cotality provides API credentials |
| 4 | Comply | Site must follow all REBNY RLS display rules |
| 5 | Two feeds needed | IDX (public search) + VOW (client portal with login) |

**Contact:** rlssupport@rebny.com / 212-616-5270

---

# 21. RESO Certification Requirements

## Certification Mandate
- NAR requires all REALTOR-owned MLSs to implement RESO standards
- 500+ MLSs certified, 90%+ offer Web API feeds
- CoreLogic Trestle has RESO DD 2.0 Vendor + Platinum Certification

## Timeline

| Date | Milestone |
|------|-----------|
| Dec 2018 | DD 1.7 ratified |
| Dec 2019 | MLSs must deliver IDX Payload (219 fields) |
| Oct 2023 | DD 2.0 approved |
| Apr 2024 | DD 2.0 ratified |
| **Apr 15, 2025** | **DD 1.7 certs downgraded to "Certified Legacy"** |
| Ongoing | All MLSs must certify DD 2.0 |

## Two Certification Endorsements

1. **Web API Core 2.0.0** — must be obtained FIRST
2. **Data Dictionary 2.0** — requires Web API Core as prerequisite

## Four-Stage Testing Process (DD 2.0)

| Stage | What Is Tested |
|-------|----------------|
| Stage 1 | Data type validation — fields match standard types |
| Stage 2 | Synonym validation — non-standard field names flagged for removal |
| Stage 3 | Admin Review — RESO admins flag remaining issues |
| Stage 4 | Fast Track — subgroup suggestions must be implemented |

## What Is Tested

- Field names match RESO standard names (NO synonyms allowed)
- Data types match exactly
- Lookup values use standard OData enumeration names
- Payload data matches advertised metadata
- Date/time formatting follows ISO 8601
- String lengths within specified maximums
- Decimal precision matches specification
- IDX Payload includes all 219+ required fields

## IDX Payload (219 Minimum Fields)

RESO defines a minimum set of 219 fields that MLSs must include in IDX feeds. These cover core data needed for public-facing listing display including:
- All address fields
- Property type and characteristics
- Pricing and status
- Agent and office identification
- Internet display control fields
- Photos/media references
- Description and remarks
- Open house information

---

# 22. NY Source of Income Platform Obligations (2025)

| # | Rule | Source | Description |
|---|------|--------|-------------|
| V1 | Platform Notice | 2025 NY State bill | Online housing platforms must display notices of rights against source of income discrimination |
| V2 | Listing Affirmation | 2025 NY State bill | Listing posters must affirm awareness of/compliance with SOI laws before publishing |
| V3 | Prohibited Language | NYC Law (2008) + State (2025) | "No Section 8", "no DSS", "no SSI", "no payment programs", "not approved for vouchers/subsidies" |

---

# Appendix A: UCBA Exhibits

| Exhibit | Form | Purpose |
|---------|------|---------|
| A | Mandatory Listing Fields | Defines all required fields |
| B | Owner Opt-Out Form | Signed by owner to withhold from RLS |
| C | Listing Data Compliance Policy | Fair Housing + data quality enforcement |
| D | RUNDBA | New Development Brokerage Agreement |
| E | Change of New Dev Brokerage Form | Switch exclusive broker for new dev |
| F | RLS Appeals Process | Contest violations/fines |
| G | Coming Soon Owner Authorization | Owner consent for Coming Soon status |

# Appendix B: Key Definitions

| Term | Definition |
|------|-----------|
| **RLS** | REBNY Residential Listing Service (NYC's MLS) |
| **UCBA** | Universal Co-Brokerage Agreement |
| **RESO** | Real Estate Standards Organization |
| **IDX** | Internet Data Exchange (reciprocal broker display) |
| **VOW** | Virtual Office Website (consumer portal with login) |
| **LMP** | Listing Management Platform (e.g., RealPlus) |
| **Trestle** | RLS backend technology (Cotality, formerly CoreLogic) |
| **DOM** | Days on Market |
| **RUNDBA** | Registered Uniform New Development Brokerage Agreement |
| **Participant** | Licensed broker/agent associated with RBD member or qualifying firm |
| **Exclusive Listing** | Written exclusive agreement (right to sell/lease or exclusive agency) |
| **Co-Broker** | Participant representing Buyer/Tenant |
| **Pocket Listing** | Listing withheld from RLS (PROHIBITED) |
| **Ours Alone** | Oral/verbal listing (NOT accepted on RLS) |
| **Public Dissemination** | Broker website, social media, third-party sites, automated mass marketing |
| **FARE Act** | Fairness in Apartment Rental Expenses (NYC LL 119/2024) |
| **NAR** | National Association of Realtors |
| **BBO** | Back Before Offer (VOW display flag) |
| **OData** | Open Data Protocol (API standard used by Trestle) |

# Appendix C: Borough/County Mapping

| CityRegion (Borough) | CountyOrParish (County) |
|----------------------|------------------------|
| Manhattan | New York |
| Brooklyn | Kings |
| Queens | Queens |
| Bronx | Bronx |
| Staten Island | Richmond |

---

> **Document Version:** 1.0
> **Last Updated:** 2026-02-19
> **Source Files:** `data/UCBA-2026-Requirements.md`, `memory/REBNY-MASTER.md`, `data/RLS-Syndication-Research.md`, `memory/REBNY-UPDATES-2026-02.md`, `data/rebny-rls-property-fields.csv`
