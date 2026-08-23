# REBNY RLS — COMPLETE FIELD REFERENCE (902 IDX Plus Fields + All 79 Mandatory + All Rules)

> ⚠️ **DEPRECATED CRM FILE REFERENCE — 2026-04-28.** The "CRM File" pointer below names `public/crm/MALLAN-NYC-CRM-FINAL2.html` (the mockup), which is no longer the source of truth. Production sale-form work uses `public/crm/SALE-FORM-REDESIGN.html` per `CLAUDE.md` File Roles section. The 902 RLS field references in this doc are still valid; only the CRM file pointer is stale.

> **Single document. Every field has everything: Exhibit A ref, Cotality name, distribution, rules, sharing, cross-references.**
> **Source Data:** `data/rebny-rls-property-fields.csv` + `data/UCBA-2026-Requirements.md` + REBNY-MASTER.md Parts 1-3
> **Date:** 2026-02-09 | **CRM File:** `public/crm/SALE-FORM-REDESIGN.html` (was `public/crm/MALLAN-NYC-CRM-FINAL2.html` mockup, removed 2026-04-28)

---

## HOW TO USE THIS DOCUMENT

1. **Looking up a field?** Ctrl+F the Cotality field name (e.g., `CityRegion`) or the Exhibit A number (e.g., `[I1]`)
2. **Fields marked `[I#]`** = REBNY Exhibit A mandatory fields. The I-number and all sharing rules are embedded in the REBNY Rules column.
3. **Distribution codes** tell you who can see each field (see key below)
4. **Every rule, cross-reference, and sharing restriction** is in the REBNY Rules column — you never need another document.

---

## EXHIBIT A QUICK-REFERENCE INDEX (I1–I79 → Cotality Field → Section)

### All Listings — Location & Building (I1-I16)
| I# | Exhibit A Name | Cotality Field(s) | Section |
|---|---|---|---|
| I1 | Borough | CityRegion | B1 |
| I2 | Building & Listing Classification | PropertyType + PropertySubType + CommonInterest | B2 |
| I3 | Building Pet Policy | BuildingPetsAllowed | B14 |
| I4 | Building Sublet Policy | RentingAllowedYN | B14 |
| I5 | Have Elevator | ElevatorsTotal | B13 |
| I6 | Have Garage | GarageYN | B21 |
| I7 | Have Lobby Attendant | AttendanceType | B13 |
| I8 | Listing Full Address | StreetNumber + StreetName + UnitNumber | B1 |
| I9 | Neighborhood | SubdivisionName | B1 |
| I10 | New Development & New Construction | NewDevelopmentYN + NewConstructionYN | B24 |
| I11 | Number of Total Units | NumberOfUnitsTotal | B13 |
| I12 | Ownership Type | CommonInterest | B2 |
| I13 | Tax Block and Lot | BuildingTaxLot + TaxBlock + TaxLot | B13 |
| I14 | Total Floors in Building | StoriesTotal | B13 |
| I15 | Unit Number | UnitNumber | B1 |
| I16 | Year Built | YearBuilt | B13 |

### All Listings — Features (I17-I26)
| I# | Exhibit A Name | Cotality Field(s) | Section |
|---|---|---|---|
| I17 | Board Approval Required | SpecialListingConditions | B3 |
| I18 | Number of Bathrooms | BathroomsFull | B12 |
| I19 | Number of Baths Half | BathroomsHalf | B12 |
| I20 | Number of Bedrooms | BedroomsTotal | B12 |
| I21 | Number of Total Rooms | RoomsTotal | B12 |
| I22 | Pet Policy (Unit) | PetsAllowed | B22 |
| I23 | Photos - Sort Order | PhotosCount | B26 |
| I24 | Private Outdoor Space | PatioAndPorchFeatures | B22 |
| I25 | Property Conditions | PropertyCondition | B7 |
| I26 | Washer/Dryer Details | BuildingLaundryFeatures + LaundryFeatures | B14 |

### All Listings — Agents, Gates, Status, Dates (I27-I44)
| I# | Exhibit A Name | Cotality Field(s) | Section |
|---|---|---|---|
| I27 | Exclusive Agents & Firm | ListAgentMlsId + ListOfficeName | B8 |
| I28 | Buyer Agent and Firm | BuyerAgentMlsId + BuyerOfficeName | B10 |
| I29 | IDX Entire Listing Display | IDXEntireListingDisplayYN | B6 |
| I30 | Participant Only Listing | Permissions | B3 |
| I31 | Syndication Display | SyndicateYN | B6 |
| I32 | Closing Price | ClosePrice | B5 |
| I33 | Concessions | Concessions | B18 |
| I34 | Expiration Date | ExpirationDate | B3 |
| I35 | Listing Contract Date | ListingContractDate | B3 |
| I36 | Listing Status & Date | MlsStatus + StatusChangeTimestamp | B4 |
| I37 | Price | ListPrice | B5 |
| I38 | Purchase Contract Date | PurchaseContractDate | B4 |
| I39 | Sold or Leased Date | CloseDate | B4 |
| I40 | First Showing Date | ActivationDate | B4 |
| I41 | Open House Details | OpenHouseCount + related | B23 |
| I42 | Showing Instructions | ShowingInstructions | B7 |
| I43 | Co-Broke Agreement Type | CoBrokeAgreement | B3 |
| I44 | Listing Type | ListingAgreement | B3 |

### Sales Only — Condo/Co-op/Condop (I45-I52)
| I# | Exhibit A Name | Cotality Field(s) | Section |
|---|---|---|---|
| I45 | Flip Tax | FlipTax | B15 |
| I46 | Living Area (Condo) | LivingArea | B12 |
| I47 | Maintenance/Common Charges | AssociationFee | B15 |
| I48 | Maximum Financing | MaximumFinancingPercent | B15 |
| I49 | Number of Shares (Co-op) | NumberOfShares | B15 |
| I50 | Percent of Common Elements | PercentOfCommonElements | B15 |
| I51 | Tax Abatement | TaxAbatementYN | B15 |
| I52 | Tax Monthly Amount (Condo) | TaxMonthlyAmount | B15 |

### Sales Only — Building/Townhouse (I53-I57)
| I# | Exhibit A Name | Cotality Field(s) | Section |
|---|---|---|---|
| I53 | Building Area Total | BuildingAreaTotal | B19 |
| I54 | Garage Details | GarageYN + GarageSpaces | B21 |
| I55 | Size Dimensions | SizeDimensions | B12 |
| I56 | Tax Annual Amount | TaxAnnualAmount | B16 |
| I57 | Total Legal Rooms | LegalRoomsTotal | B12 |

### Rental Only (I58-I61)
| I# | Exhibit A Name | Cotality Field(s) | Section |
|---|---|---|---|
| I58 | Availability Date | AvailabilityDate | B27 |
| I59 | Furnished Details | Furnished | B27 |
| I60 | Lease Terms | MinLeaseMonths + MaxLeaseMonths | B27 |
| I61 | Lease Type | LeaseType | B27 |

### DOM Tracking (I62-I66) — Art. I, Sec. 11
| I# | Field | Cotality Field(s) | Section |
|---|---|---|---|
| I62 | Days on Market | DaysOnMarket | B4 |
| I63 | DOM Start Date | OriginalEntryTimestamp | B4 |
| I64 | DOM Accrual Status | (CRM workflow field) | B4 |
| I65 | Consecutive Off-Market Days | (CRM workflow field) | B4 |
| I66 | DOM Reset History | (CRM audit field) | B4 |

### Coming Soon Workflow (I67-I72) — Art. I, Sec. 16
| I# | Field | Cotality Field(s) | Section |
|---|---|---|---|
| I67 | Coming Soon Flag | MlsStatus=ComingSoon | B4 |
| I68 | Coming Soon Activation Date | ComingSoonTimestamp | B4 |
| I69 | Coming Soon Expiration Date | (CRM calculated: I68 + 14 days) | B4 |
| I70 | Coming Soon Authorization | (CRM document upload) | B30 |
| I71 | Coming Soon Prior Use Check | (CRM history check) | B30 |
| I72 | First Showing Date Lock | (CRM lock state) | B30 |

### Compliance & Workflow (I73-I79) — UCBA Rule-Derived
| I# | Field | Purpose | Section |
|---|---|---|---|
| I73 | Protected Period Names List | 6 names, 7 business days after expiry (A6) | B30 |
| I74 | Protected Period Expiry Date | I34 + 90 days (A7) | B30 |
| I75 | Owner Opt-Out Form Status | Exhibit B upload tracking, 48hr deadline (C3) | B30 |
| I76 | Buyer Rep Agreement Status | Required before showing (E7) | B30 |
| I77 | RUNDBA Document Status | Required for new dev (K1) | B30 |
| I78 | Listing Agreement Document | Must produce within 48hrs on request (G4) | B30 |
| I79 | Fair Housing Scan Result | Auto-scan all text fields (M1-M2) | B30 |

---

## DISTRIBUTION PROFILE CODES

| Code | Meaning | RLS | IDX | WWW | SYN |
|---|---|---|---|---|---|
| **PUB** | Public marketing data | YES | YES | YES | YES |
| **PUB-A** | Public but respects address display flag | YES | If InternetAddressDisplayYN=True | Same | Same |
| **AGT** | Agent/Participant view ONLY — never public | YES | **NEVER** | **NEVER** | **NEVER** |
| **HID** | Confidential — sent to RLS but restricted from display | YES (hidden) | **NEVER** | **NEVER** | **NEVER** |
| **CTL** | Control flag — controls other fields' display | YES (flag) | N/A | N/A | N/A |
| **SYS** | System-generated — read-only | Auto | N/A | N/A | N/A |
| **CLOSE** | Closing-only — required at MLSStatus=Closed | YES | After close | After close | After close |
| **INT** | Internal CRM only — NOT sent to RLS | NO | NO | NO | NO |

### Required Field Codes

| Code | Meaning |
|---|---|
| **REQ** | Always required for all listings |
| **COND** | Conditionally required (see rule) |
| **OPT** | Optional |
| **SYS** | System-managed (not submittable) |

---
---

## PART A — FOUNDATIONS

### A1. DISTRIBUTION CHANNELS

| # | Channel | What It Is | Who Sees It | Controlled By |
|---|---------|-----------|-------------|---------------|
| 1 | **RLS** | REBNY Listing Service — master database | Licensed REBNY Participants only | Automatic on submission |
| 2 | **IDX** | Internet Data Exchange — other brokers' websites | General public | `IDXEntireListingDisplayYN` |
| 3 | **WWW** | Your website (mallan.nyc) | General public | `saleDist_WWW` toggle |
| 4 | **Syndication** | Third-party portals (openigloo, Samaki, TBI) | General public | `saleSyndicationOptOutYN` |
| 5 | **Listhub** | Aggregator to additional portals | General public | `saleDist_Listhub` toggle |
| 6 | **NY MLS** | New York MLS network | Agents/public | `saleDist_NYMLS` toggle |
| 7 | **Realtor.com** | Has own REBNY data license (auto) | General public | `saleDist_Realtor` toggle |
| 8 | **StreetEasy** | NOT on RLS feed. Manual upload. Sales=free, Rentals=$7+/day | General public | Manual upload |

**Channels 2-8 = "Public Dissemination" under UCBA. Channel 1 (RLS) is NOT public dissemination.**

---

### A2. LISTING TYPES

| # | Listing Type | Goes to RLS? | Goes to IDX? | Goes to WWW? | Goes to Syndication? |
|---|---|---|---|---|---|
| 1 | **Exclusive** | **YES** (mandatory) | **YES** | **YES** | **YES** |
| 2 | **Co-Exclusive** | **YES** (mandatory) | **YES** | **YES** | **YES** |
| 3 | **Owner Opt-Out** | **NO** | **NO** | **NO** | **NO** |
| 4 | **Participant Only** | **YES** (agents only) | **NO** | **NO** | **NO** |
| 5 | **Ours Alone** | **NO** | **NO** | **YES** (only) | **NO** |

> **"In-House" is NOT a listing type.** Under UCBA, same-brokerage deals are still Exclusive listings. Track via Direct Deal flag.

---

### A3. LISTING STATUSES

| # | Status | On RLS? | On IDX/WWW? | DOM Accrues? |
|---|---|---|---|---|
| 1 | **Draft** | NO | NO | NO |
| 2 | **Future** | NO | NO | NO |
| 3 | **Coming Soon** | YES | YES (with badge) | NO |
| 4 | **Active** | YES | YES | YES |
| 5 | **Back On Market** | YES | YES | YES (resumes) |
| 6 | **Offer Out** | YES | YES | YES |
| 7 | **Offer Thru Us** | YES | YES | YES |
| 8 | **Offer Accepted** | YES | YES | YES |
| 9 | **Contract Signed** | YES | YES | YES |
| 10 | **Board Approved** | YES | YES | YES |
| 11 | **Sold** | YES (update) | Remove in 24hrs | Stops (resets) |
| 12 | **Perm Off Market** | YES (update) | Remove | Paused (resets after 30d) |
| 13 | **Temp Off Market** | YES (update) | Remove | Paused |
| 14 | **Expired** | YES (update) | Remove | Stops |

---

### A4. PROPERTY TYPES

#### RLS-Eligible (PropertyType = Residential or ResidentialLease)
| # | Type | CommonInterest | PropertySubType |
|---|---|---|---|
| 1 | Condo | Condominium | Apartment/Loft/etc. |
| 2 | Co-op | StockCooperative | Apartment/Loft/etc. |
| 3 | Condop | Condop | Apartment/Loft/etc. |
| 4 | Townhouse | None | SingleFamilyTownhouse / MultiFamilyTownhouse |
| 5 | Single Family | None | SingleFamilyResidence |
| 6 | Multi-Family | None | MultiFamily/Duplex/Triplex/Quadruplex |
| 7 | Mixed Use | None | MixedUse |
| 8 | Land | None | UnimprovedLand |
| 9 | Commercial Condo | Condominium | Office / Retail |
| 10 | Commercial Co-op | StockCooperative | Office / Retail |
| 11 | Commercial Condop | Condop | Office / Retail |

#### NOT RLS-Eligible (WWW Only)
Office, Retail, Industrial, Special Use, Whole Building, Hotel/Motel — no Cotality PropertyType mapping.

---
---

## PART B — ALL RLS PROPERTY FIELDS (With Exhibit A References Embedded)

> Every field marked **[I#]** is an Exhibit A mandatory field. The I-number, distribution channels, and sharing rules from Part 2 of REBNY-MASTER are embedded directly in the REBNY Rules column.

---

### B1. ADDRESS & LOCATION

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| StreetNumber | Street number | Yes | **REQ** | PUB-A | **[I8]** Exhibit A: "Listing Full Address." Public UNLESS InternetAddressDisplayYN=False (H10). |
| StreetDirPrefix | Direction prefix (N, S, E, W) | Yes | OPT | PUB-A | — |
| StreetName | Street name | Yes | **REQ** | PUB-A | **[I8]** Exhibit A: "Listing Full Address." **Rejects if not in Street Dictionary.** |
| StreetDirSuffix | Direction suffix | Yes | OPT | PUB-A | — |
| StreetSuffix | Street suffix (Ave, St) | Yes | OPT | PUB-A | **Rejects if not in Street Dictionary.** |
| UnitNumber | Apartment/unit number | Yes | **COND** | PUB-A | **[I15]** Exhibit A: "Unit Number." Required if PropertySubType = Apartment, Deeded Parking, Garden Apartment, Loft, Office, Retail, Timeshare, Unit Duplex/Triplex/Quadruplex. Not required for single-family/townhouse. Public unless address restricted. |
| UnitLine | Physical line of unit | Yes | OPT | PUB | — |
| UnParsedAddress | Full text address (no unit #) | Yes | **REQ** | PUB-A | Do NOT include unit number. |
| AlternateStreetNumber | Alternate street number | Yes | **COND** | PUB-A | Required if any AlternateStreet attribute submitted. |
| AlternateStreetDirPrefix | Alternate direction prefix | Yes | OPT | PUB-A | — |
| AlternateStreetName | Alternate street name | Yes | **COND** | PUB-A | Required if any AlternateStreet attribute submitted. **Rejects if not in Street Dictionary.** |
| AlternateStreetDirSuffix | Alternate direction suffix | Yes | OPT | PUB-A | — |
| AlternateStreetSuffix | Alternate street suffix | Yes | OPT | PUB-A | **Rejects if not in Street Dictionary.** |
| City | City | Yes | **REQ** | PUB | **ALL RLS listings must be in New York City.** |
| CityRegion | Borough | Yes | **REQ** | PUB | **[I1]** Exhibit A: "Borough." RLS+IDX+VOW+Syndication. Always required. **Must match CountyOrParish:** Kings=Brooklyn, Queens=Queens, New York=Manhattan, Richmond=Staten Island, Bronx=Bronx. |
| CountyOrParish | County | Yes | **REQ** | PUB | **Must match CityRegion** (same mapping). |
| StateOrProvince | State (always NY) | Yes | **REQ** | PUB | All listings must be New York. |
| PostalCode | Zip code | Yes | **REQ** | PUB | — |
| PostalCodePlus4 | Zip+4 | Yes | OPT | PUB | — |
| PostalCity | USPS postal city | Yes | **REQ** | PUB | May differ from City (e.g., Astoria). |
| Country | Country | No | **COND** | PUB | If submitted, must be US. |
| SubdivisionName | Neighborhood | Yes | **REQ** | PUB | **[I9]** Exhibit A: "Neighborhood." RLS+IDX+VOW+Syndication. Public. |
| CrossStreet | Nearest cross streets | Yes | OPT | PUB | — |
| Latitude | GPS latitude | Yes | OPT | PUB | Degrees/decimal. No plus symbol. Agent-entered only — the IDX Plus feed always returns `Latitude` null (not usable for map/transit filtering). |
| Longitude | GPS longitude | Yes | OPT | PUB | Same format. Agent-entered only — the IDX Plus feed always returns `Longitude` null. |
| Directions | Driving directions | Yes | OPT | PUB | — |
| ParcelNumber | Tax parcel number | Yes | OPT | HID | — |

---

### B2. CLASSIFICATION & PROPERTY TYPE

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| PropertyType | Residential or ResidentialLease | Yes | **REQ** | PUB | **[I2]** Exhibit A: "Building and Listing Classification." RLS+IDX+VOW+Syndication. **Only two values on RLS.** No "Commercial" type. Drives conditional fields. |
| PropertySubType | Unit type (Apartment, Townhouse, etc.) | Yes | **REQ** | PUB | **[I2]** Part of Exhibit A classification. See A4 for full list. Only Office and Retail are commercial subtypes. |
| CommonInterest | Ownership structure | Yes | **REQ** | PUB | **[I2, I12]** Exhibit A: "Ownership Type." RLS+IDX+VOW+Syndication. Values: Condominium, StockCooperative, Condop, None, CommunityApartment, PlannedDevelopment, RentalBuilding, Timeshare. **Drives conditional fields I45-I52.** |
| StructureType | Type of structure | Yes | **REQ** | PUB | Use PropertySubType for identification. |
| CurrentUse | Current use type | Yes | OPT | PUB | **Not to be used to identify commercial listings.** |
| PossibleUse | Potential/best use | Yes | OPT | PUB | — |
| DevelopmentStatus | Development status of land | Yes | OPT | PUB | — |
| CommercialUnitsYN | Building has commercial units | Yes | OPT | PUB | — |
| OccupantType | Owner/Tenant/Vacant | Yes | OPT | PUB | — |
| BusinessType | Business types in building | Yes | OPT | PUB | **Not to describe the listing being sold/leased.** Describes existing building mix. |

---

### B3. LISTING AGREEMENT & PERMISSIONS

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| ListingAgreement | Type of listing agreement | Yes | **REQ** | HID | **[I44]** Exhibit A: "Listing Type." RLS+IDX+VOW+Syndication. **Must be Exclusive** (C1). No Open/FSBO/Ours Alone on RLS. **If PropertyType=Residential, CANNOT submit ExclusiveRightToLease. If ResidentialLease, CANNOT submit ExclusiveRightToSell.** |
| CoBrokeAgreement | Co-brokerage agreement type | Yes | **REQ** | AGT | **[I43]** Exhibit A: "Co-Broke Agreement Type." RLS+IDX+VOW+Syndication. RUNDBA required if NewDevelopmentYN=true (K1). Searchable by agents. |
| Permissions | Access level (Private / Owner Opt-Out) | Yes | OPT | CTL | **[I30]** Exhibit A: "Participant Only Listing." **GATE FIELD.** Private=Participant Only (blocks IDX/VOW/Syndication/public). **Cannot select Private AND Owner Opt-Out together.** Sale listings with Permissions=Null cannot set InternetEntireListingDisplayYN=False. Cross-ref: Gate 2. |
| ListingContractDate | Date of listing agreement | Yes | **REQ** | HID | **[I35]** Exhibit A: "Listing Contract Date." RLS+IDX+VOW+Syndication. DOM reference point (A2). **Not editable once submitted. Max 1 year from current date.** |
| ExpirationDate | Exclusive agreement expiration | Yes | **REQ** | HID | **[I34]** Exhibit A: "Exclusive Listing Expiration Date" **(Hidden).** **NEVER public. NEVER on IDX/WWW.** Confidential — restricted to agent/managers/broker. Max 10 years. Used for protected period (A6-A7). RLS backend only. |
| ListingTerms | Financing terms | Yes | OPT | PUB | — |
| SpecialListingConditions | Sale type / board approval | Yes | **COND** | PUB | **[I17]** Exhibit A: "Board Approval Required." RLS+IDX+VOW+Syndication. Required if CommonInterest = Condominium, StockCooperative, or Condop. Typical for co-ops/condops. |
| DuplicateListingIDs | Co-exclusive or dual listing ID | Yes | OPT | AGT | Only for co-exclusive or sale+lease dual listings. |
| ManagingAgencyListingYN | Managing agency listing | Yes | OPT | AGT | — |
| ListingURL | Brokerage listing page URL | Yes | OPT | PUB | — |
| ListingSocialMediaURL | Social media URL | — | — | — | **PHANTOM — not a live Cotality field; do not bind.** |
| HomeWarrantyYN | Home warranty included | Yes | OPT | PUB | — |

---

### B4. STATUS & DATES

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| MlsStatus | RLS listing status | Yes | **REQ** | PUB | **[I36]** Exhibit A: "Listing Status & Date Change." RLS+IDX+VOW+Syndication. Must update within 24hrs (C11). Maps to StandardStatus. |
| StandardStatus | Normalized status | No | SYS | PUB | System-generated from MlsStatus. |
| PreviousStatus | Previous status | No | SYS | SYS | Auto-generated. |
| OnMarketDate | Date went on market | Yes | **COND** | HID | Required if MLSStatus=Active. |
| OffMarketDate | Date went off market | Yes | **COND** | HID | Required if MLSStatus NOT Active or ComingSoon. |
| ActivationDate | Coming Soon → Active date | Yes | **COND** | PUB | **[I40]** Exhibit A: "First Showing Date." RLS+IDX+VOW+Syndication. **Required if MLSStatus=ComingSoon.** This = Start Showing Date. Must be within 14 calendar days of RLS submission. **Cannot be changed once set (D12).** Locked after Coming Soon submission. For Coming Soon badge: "Coming Soon. No Showings or Open House until [this date]" (D7). |
| CloseDate | Date of closing | Yes | **COND** | CLOSE | **[I39]** Exhibit A: "Sold or Leased Date." RLS; public after closed. **Required when MLSStatus=Closed. Must be >= PurchaseContractDate.** Must be entered within 24hrs of closing (C12). |
| PurchaseContractDate | Contract execution date | Yes | **COND** | HID | **[I38]** Exhibit A: "Purchase Contract Signed Date." RLS+IDX+VOW+Syndication when Pending. **Required when MLSStatus=Pending. Must be >= ListingContractDate.** |
| CancellationDate | Date cancelled | Yes | **COND** | HID | Required when MLSStatus=Cancelled. |
| WithdrawnDate | Date withdrawn | Yes | **COND** | HID | **Required when MLSStatus=Withdrawn. Must equal OffMarketDate.** |
| BackOnMarketDate | Date returned to market | No | SYS | HID | System timestamp. |
| DaysOnMarket | Days on market | No | SYS | PUB | **[I62]** Exhibit A DOM tracking. RLS+IDX+VOW+Syndication. **Calculated per UCBA:** Starts at RLS transmission (A2). Resets after 30 consecutive days Withdrawn/Cancelled (A1). Resets on Close (A3). Does NOT accrue during Coming Soon or Participant Only (A4). Cannot circumvent (A5). |
| CumulativeDaysOnMarket | Cumulative DOM | No | SYS | PUB | Per RLS business rules. |
| OriginalEntryTimestamp | First entered into RLS | No | **REQ** | SYS | **[I63]** DOM Start Date anchor. Set once on initial RLS submission. Distinct from ListingContractDate. |
| StatusChangeTimestamp | Last status change | No | SYS | SYS | **[I36]** Part of status tracking. Auto-recorded. |
| ModificationTimestamp | Last modification | No | SYS | SYS | Auto-recorded. |
| SourceSystemModificationTimestamp | Last modified at LMP | Yes | SYS | SYS | — |
| MajorChangeTimestamp | Last major change | No | SYS | SYS | — |
| MajorChangeType | Type of major change | No | SYS | PUB | — |
| MlsMajorChangeType | MLS-specific change | No | SYS | SYS | — |
| OnMarketTimestamp | System on-market timestamp | No | SYS | SYS | — |
| OffMarketTimestamp | System off-market timestamp | No | SYS | SYS | — |
| ActivationTimestamp | CS→Active timestamp | No | SYS | SYS | — |
| BackOnMarketTimestamp | Back-on-market timestamp | No | SYS | SYS | — |
| ComingSoonTimestamp | Coming Soon entry timestamp | No | SYS | SYS | **[I68]** Coming Soon Activation Date. 14-day countdown starts here (D2). |
| PendingTimestamp | Pending timestamp | No | SYS | SYS | — |
| PriceChangeTimestamp | Price change timestamp | No | SYS | SYS | — |

---

### B5. PRICING

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| ListPrice | Current asking price | Yes | **REQ** | PUB | **[I37]** Exhibit A: "Price." RLS+IDX+VOW+Syndication. Changes within 24hrs (C11). **For rentals = gross monthly rent (NOT net-effective).** For auctions = minimum/reserve. |
| ClosePrice | Final sale/lease price | Yes | **COND** | CLOSE | **[I32]** Exhibit A: "Closing Price or Rental Price." RLS; public after closed. **Required when MLSStatus=Closed.** Within 24hrs of closing (C12). |
| OriginalListPrice | Initial list price | No | SYS | PUB | Auto-set on price change. |
| PreviousListPrice | Previous list price | No | SYS | PUB | Auto-updated. |
| CurrentPrice | Current price | No | SYS | PUB | System-calculated. |
| FurnishedListPrice | Price when furnished | Yes | **COND** | PUB | Required if Furnished = Furnished, Partially, or Negotiable. |
| TotalMonthlyMaintPlusTax | Monthly maintenance + tax | Yes | OPT | PUB | Calculated. |
| NetMonthlyRent | Avg monthly rent incl free months | Yes | OPT | PUB | Mathematical calculation. |

---

### B6. DISPLAY CONTROL FLAGS

**These fields control whether OTHER fields can be displayed. Violating these = UCBA violation.**

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| InternetEntireListingDisplayYN | Master internet display switch | Yes | **REQ** | CTL | **If False, AUTO-CASCADES:** IDXEntireListingDisplayYN=False, InternetAddressDisplayYN=False, InternetAutomatedValuationDisplayYN=False, InternetConsumerCommentYN=False. Listing alerts/auto-sharing disabled for non-exclusive agents. Sale listings with Permissions=Null cannot set this to False. |
| IDXEntireListingDisplayYN | IDX broker website display | Yes | **REQ** | CTL | **[I29]** Exhibit A: "IDX Entire Listing Display." **GATE FIELD.** True=IDX display. False=no IDX. **LMPs must default to True.** Cross-ref: Gate 3. If True AND ListOfficeIDXParticipationYN=True, listing sent to IDX. |
| InternetAddressDisplayYN | Internet address display | Yes | **REQ** | CTL | **Displaying address when False = UCBA violation.** Default: True. |
| InternetAutomatedValuationDisplayYN | AVM display | Yes | **REQ** | CTL | Default: True. Auto-False if InternetEntireListingDisplayYN=False. |
| InternetConsumerCommentYN | Consumer comments | Yes | **REQ** | CTL | Default: True. Auto-False if InternetEntireListingDisplayYN=False. |
| SyndicateYN | Syndication to portals | Yes | **REQ** | CTL | **[I31]** Exhibit A: "Syndication Display." **GATE FIELD.** True=syndication. False=no syndication. Independent of IDX. **LMPs must default to True.** Cross-ref: Gate 4. |
| ListOfficeIDXParticipationYN | Office IDX participation | No | SYS | CTL | Auto-generated from REBNY directory. Not editable. |

---

### B7. DESCRIPTION & REMARKS

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| PublicRemarks | Public listing description | Yes | **REQ** | PUB | **ALL FIVE CONTENT RULES:** 1) No agent info (Art. I, 5(C)). 2) No "Off-Market" (Art. I, 5(D)). 3) No compensation (Art. I, 5(E)). 4) No "free services" (Art. III, 5). 5) No Fair Housing violations (Exhibit C). |
| PrivateRemarks | Agent-to-agent notes | Yes | OPT | AGT | **RLS Participants ONLY. NEVER on IDX/WWW/SYN.** Same 5 content rules apply. |
| ShowingInstructions | Scheduling instructions | Yes | **REQ** | AGT | **[I42]** Exhibit A: "Showing/Open House Instructions." RLS+IDX+VOW+Syndication for authorized Participants. **Privileged — NOT for public viewing.** Must respond promptly (E1). Cannot deny co-broker (E2). |
| PropertyCondition | Condition of listing | Yes | **COND** | AGT | **[I25]** Exhibit A: "Property Conditions." **AGENT VIEW ONLY. NEVER shown to consumers/clients.** Required if PropertyType=Residential. **DISCLAIMER REQUIRED:** _"Property Condition information is not verified for authenticity or accuracy and is not guaranteed... ©[YEAR] The Real Estate Board of New York, Inc."_ |

---

### B8. AGENTS & OFFICES — LISTING SIDE

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| ListAgentMlsId | Listing agent MLS ID | Yes | **REQ** | PUB | **[I27]** Exhibit A: "Exclusive Agents & Firm." RLS+IDX+VOW+Syndication. **Only place agent info may appear** (C7). IDX/VOW must show "Listing Courtesy of [Broker]" (F6, H1). Agent info MUST NOT appear in description/photos/comments (Art. I, 5(C)). |
| ListAgentFullName | Agent name | No | SYS | PUB | Auto-populated. |
| ListAgentDirectPhone | Agent phone | No | SYS | PUB | Auto-populated. |
| ListAgentEmail | Agent email | No | SYS | PUB | Auto-populated. |
| ListAgentStateLicense | DOS license number | No | SYS | AGT | Auto-populated. |
| ListAgentURL | Agent website | No | SYS | PUB | Auto-populated. |
| ListAgentNickname | Alternate name | No | SYS | PUB | — |
| ListAgentKeyNumeric | System ID | No | SYS | SYS | — |
| ListAgentHasOwnershipInterestYN | Ownership interest | No | SYS | AGT | Must disclose per UCBA Art. IV. |
| ListOfficeMlsId | Office MLS ID | No | SYS | PUB | — |
| ListOfficeName | Brokerage legal name | Yes | OPT | PUB | **[I27]** **IDX Attribution: "Listing Courtesy of [ListOfficeName]" in reasonably prominent location, font not smaller than median (Art. III, 2(C)).** |
| ListOfficePhone | Office phone | No | SYS | PUB | — |
| ListOfficeURL | Office website | No | SYS | PUB | — |
| ListOfficeKeyNumeric | System ID | No | SYS | SYS | — |
| ListTeamMlsId | Team ID | Yes | OPT | PUB | — |
| ListTeamName | Team name | Yes | OPT | PUB | — |
| ListTeamKeyNumeric | System ID | No | SYS | SYS | — |

---

### B9. AGENTS & OFFICES — CO-LISTING SIDE

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| CoListAgentMlsId | Co-listing agent ID | Yes | OPT | PUB | For co-exclusive listings. Both brokers must be credited (Art. II, 14). |
| CoListAgentFullName | Name | No | SYS | PUB | — |
| CoListAgentDirectPhone | Phone | No | SYS | PUB | — |
| CoListAgentEmail | Email | No | SYS | PUB | — |
| CoListAgentStateLicense | License | No | SYS | AGT | — |
| CoListAgentURL | Website | No | SYS | PUB | — |
| CoListAgentNickname | Alternate name | No | SYS | PUB | — |
| CoListAgentKeyNumeric | System ID | No | SYS | SYS | — |
| CoListAgent2MLSID–CoListAgent3KeyNumeric | (Same pattern x2 more) | Mixed | OPT | PUB/SYS | Up to 3 co-listing agents supported. |

---

### B10. AGENTS & OFFICES — BUYER SIDE (Closing Only)

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| BuyerAgentMlsId | Buyer's agent MLS ID | Yes | OPT | CLOSE | **[I28]** Exhibit A: "Buyer Agent and Firm — for Closed." **CLOSED ONLY.** Identity hidden until after closing (F4, H12). If BuyerAgentRLSParticipantYN=true, used for lookup. |
| BuyerAgentRLSParticipantYN | Is buyer agent RLS Participant? | Yes | **COND** | CLOSE | **Required when MLSStatus=Closed.** |
| BuyerAgentFullName | Name | Yes | **COND** | CLOSE | **Required if BuyerAgentRLSParticipantYN=False AND any Buyer value filled.** |
| BuyerAgentDirectPhone | Phone | Yes | **COND** | CLOSE | Same conditional. |
| BuyerAgentEmail | Email | Yes | **COND** | CLOSE | Same conditional. |
| BuyerAgentStateLicense | License | Yes | **COND** | CLOSE | Same conditional. |
| BuyerAgentURL | Website | Yes | OPT | CLOSE | — |
| BuyerAgentKeyNumeric | System ID | No | SYS | SYS | — |
| BuyerOfficeMlsId | Office MLS ID | Yes | OPT | CLOSE | — |
| BuyerOfficeName | Office name | Yes | **COND** | CLOSE | **[I28]** Required if BuyerAgentRLSParticipantYN=False AND any Buyer value filled. |
| BuyerOfficePhone | Phone | Yes | **COND** | CLOSE | Same conditional. |
| BuyerOfficeEmail | Email | Yes | OPT | CLOSE | — |
| BuyerOfficeURL | Website | Yes | OPT | CLOSE | — |
| BuyerOfficeKeyNumeric | System ID | No | SYS | SYS | — |
| BuyerTeamMlsId | Team ID | Yes | OPT | CLOSE | — |
| BuyerTeamName | Team name | Yes | OPT | CLOSE | — |
| BuyerTeamKeyNumeric | System ID | No | SYS | SYS | — |
| BuyerFinancing | Financing type | Yes | OPT | CLOSE | Used when closing. |

---

### B11. AGENTS & OFFICES — CO-BUYER SIDE (Closing Only)

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| CoBuyerAgentRLSParticipantYN | Is co-buyer agent RLS Participant? | Yes | **COND** | CLOSE | Same pattern as Buyer fields. |
| CoBuyerAgentMlsId | MLS ID | Yes | **COND** | CLOSE | Required if CoBuyerAgentRLSParticipantYN=true. |
| CoBuyerAgentFullName | Name | Yes | **COND** | CLOSE | Required if Participant=False AND any CoBuyer value filled. |
| CoBuyerAgentDirectPhone–CoBuyerOfficeKeyNumeric | (Same pattern as Buyer) | Mixed | Mixed | CLOSE | Same conditional rules as B10 buyer fields. |

---

### B12. UNIT DETAILS — ROOMS & SIZE

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| BedroomsTotal | Total bedrooms | Yes | **REQ** | PUB | **[I20]** Exhibit A: "Number of Bedrooms." RLS+IDX+VOW+Syndication. |
| BathroomsFull | Full bathrooms | Yes | **REQ** | PUB | **[I18]** Exhibit A: "Number of Bathrooms." RLS+IDX+VOW+Syndication. |
| BathroomsHalf | Half bathrooms | Yes | **REQ** | PUB | **[I19]** Exhibit A: "Number of Baths Half." RLS+IDX+VOW+Syndication. |
| BathroomsTotal | Total (decimal, halves as .5) | Yes | **REQ** | PUB | Sum of full + half. |
| BathroomsThreeQuarter | Three-quarter baths | Yes | OPT | PUB | — |
| BathroomsOneQuarter | One-quarter baths | Yes | OPT | PUB | — |
| BathroomsPartial | Partial baths | Yes | OPT | PUB | Do not use with OneQuarter or Half. |
| BathroomsTotalInteger | Simple sum | No | SYS | PUB | System-calculated. |
| RoomsTotal | Total rooms in unit | Yes | **REQ** | PUB | **[I21]** Exhibit A: "Number of Total Rooms." RLS+IDX+VOW+Syndication. Refer to NYC Administrative Code. |
| LegalRoomsTotal | Legal rooms in building | Yes | OPT | PUB | **[I57]** Exhibit A: "Total Legal Rooms." Required for building/townhouse. Different from unit rooms (I21). RLS+IDX+VOW+Syndication. |
| ClosetsTotal | Number of closets | Yes | OPT | PUB | — |
| LivingArea | Total livable area (sq ft) | Yes | **COND** | PUB | **[I46]** Exhibit A: "Living Area (Condo)." RLS+IDX+VOW+Syndication. **Required if PropertyType=Residential AND CommonInterest=Condominium.** |
| LivingAreaSource | Source of measurement | Yes | OPT | PUB | — |
| LivingAreaUnits | Unit of measurement | Yes | **COND** | PUB | Required if LivingArea > 0. |
| AboveGradeFinishedArea | Finished area above ground | Yes | OPT | PUB | — |
| AboveGradeFinishedAreaSource | Source | Yes | OPT | PUB | — |
| AboveGradeFinishedAreaUnits | Units | Yes | **COND** | PUB | Required if AboveGradeFinishedArea entered. |
| BelowGradeFinishedArea | Finished area below ground | Yes | OPT | PUB | — |
| BelowGradeFinishedAreaSource | Source | Yes | OPT | PUB | — |
| BelowGradeFinishedAreaUnits | Units | Yes | **COND** | PUB | Required if BelowGradeFinishedArea entered. |
| SizeDimensions | Building dimensions | Yes | OPT | PUB | **[I55]** Exhibit A: "Size Dimensions." Required for building/townhouse. RLS+IDX+VOW+Syndication. |
| FloorNumber | Floor number of unit | Yes | OPT | PUB | Main entrance floor for multi-level. |
| EntryLevel | Main entry level | Yes | OPT | PUB | Building-level. |
| Levels | Floors in unit | Yes | OPT | PUB | Values: One Level, Two Levels, Multi/Split, Loft. |
| Stories | Floors in property sold | Yes | OPT | PUB | Specific unit/property. |
| CeilingHeightFeet | Ceiling height (feet) | Yes | **COND** | PUB | Required if CeilingHeightInches not null. |
| CeilingHeightInches | Ceiling height (inches) | Yes | **COND** | PUB | Required if CeilingHeightFeet not null. |
| DirectionFaces | Building entrance direction | Yes | OPT | PUB | = building exposure. |
| Exposures | Cardinal direction exposures | Yes | OPT | PUB | — |
| ViewYN | Has a view? | Yes | OPT | PUB | — |
| View | View description | Yes | **COND** | PUB | Required if ViewYN=true. |
| ViewRemarks | Detailed view description | Yes | **COND** | PUB | Required if ViewYN=true. |

---

### B13. BUILDING DETAILS

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| BuildingName | Building/complex name | Yes | OPT | PUB | — |
| YearBuilt | Year occupancy permit granted | Yes | **REQ** | PUB | **[I16]** Exhibit A: "Year Built." RLS+IDX+VOW+Syndication. **Must be 4 chars, 1700+, max 10 years future.** |
| YearRenovated | Year renovated | Yes | OPT | PUB | If entered, must be 4 characters. |
| StoriesTotal | Total floors in building | Yes | **REQ** | PUB | **[I14]** Exhibit A: "Total Number of Floors in Building." RLS+IDX+VOW+Syndication. Entire structure. |
| NumberOfUnitsTotal | Total residential units | Yes | **REQ** | PUB | **[I11]** Exhibit A: "Number of Total Units." RLS+IDX+VOW+Syndication. |
| NumberOfUnitsInCommunity | Total units in complex | Yes | OPT | PUB | Community size. |
| NumberOfUnitsVacant | Vacant units | Yes | OPT | AGT | — |
| NumberOfBuildings | Separate buildings | Yes | OPT | PUB | — |
| NumberOfProfessionalUnitsTotal | Professional units | Yes | OPT | PUB | — |
| NumberOfRetailUnits | Retail units | Yes | OPT | PUB | — |
| ElevatorsTotal | Number of elevators | Yes | **REQ** | PUB | **[I5]** Exhibit A: "Have Elevator." RLS+IDX+VOW+Syndication. **If no elevator, enter '0'. If >0, BuildingFeatures must include "Elevator(s)."** |
| AttendanceType | Building attendant types | Yes | **REQ** | PUB | **[I7]** Exhibit A: "Have Lobby Attendant (Full/Part Time)." RLS+IDX+VOW+Syndication. |
| BuildingCondition | Building condition | Yes | OPT | PUB | — |
| ArchitecturalStyle | Prewar, Highrise, etc. | Yes | OPT | PUB | — |
| ArchitectName | Architect | Yes | OPT | PUB | — |
| BuilderName | Builder/developer | Yes | OPT | PUB | — |
| BuildingEntryLocation | Main entry type | Yes | OPT | PUB | — |
| ConstructionMaterials | Materials | Yes | OPT | PUB | — |
| FoundationDetails | Foundation types | Yes | OPT | PUB | — |
| FoundationArea | Footprint | Yes | OPT | PUB | — |
| BuildingTaxLot | Building tax block+lot | Yes | **REQ** | AGT | **[I13]** Exhibit A: "Tax Block and Lot." NYC BBL. |
| TaxBlock | Tax block | Yes | **REQ** | AGT | **[I13]** Exhibit A mandatory. |
| TaxLot | Unit tax lot (condos) | Yes | **COND** | AGT | **[I13]** Required if CommonInterest=Condominium. |
| BuildingTotalGrossFootage | Building gross sq ft | Yes | OPT | PUB | Includes core, elevators, garages. |
| BuildingTotalNetSquareFootage | Usable building sq ft | Yes | OPT | PUB | Gross minus unusable. |
| CertificateOfOccupancyYN | Has C of O | Yes | OPT | AGT | — |
| LandmarkStatusYN | Landmark designation | Yes | OPT | PUB | — |
| OriginalDetailYN | Original detail | Yes | OPT | PUB | — |
| LaborInformation | Union/Non-Union | Yes | OPT | AGT | — |
| BuildingSocialMediaURL | Building social URL | — | — | — | **PHANTOM — not a live Cotality field; do not bind.** |
| SeniorCommunityYN | Senior community | Yes | OPT | PUB | — |
| WaterfrontYN | Waterfront | Yes | OPT | PUB | — |
| BuildingSmokeFreeYN | Smoke-free | Yes | OPT | PUB | Smoke Free Air Act. |

---

### B14. BUILDING FEATURES & AMENITIES

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| BuildingFeatures | Building amenities | Yes | OPT | PUB | Must include "Elevator(s)" if ElevatorsTotal > 0. |
| BuildingAccessibilityFeatures | Accessibility | Yes | OPT | PUB | — |
| BuildingCooling | Common area cooling | Yes | OPT | PUB | — |
| BuildingHeating | Heating type | Yes | OPT | PUB | — |
| BuildingExteriorFeatures | Exterior | Yes | OPT | PUB | — |
| BuildingFencing | Fencing | Yes | OPT | PUB | — |
| BuildingLaundryFeatures | Building laundry | Yes | **REQ** | PUB | **[I26]** Exhibit A: "Washer/Dryer Details." RLS+IDX+VOW+Syndication. Building-level laundry. |
| BuildingParkingFeatures | Parking | Yes | OPT | PUB | — |
| BuildingParkingTotal | Total parking | Yes | OPT | PUB | — |
| BuildingPatioAndPorchFeatures | Terrace/roof deck | Yes | OPT | PUB | — |
| BuildingPoolFeatures | Pool | Yes | OPT | PUB | — |
| BuildingSecurityFeatures | Security | Yes | OPT | PUB | — |
| BuildingStaffType | Staff types | Yes | OPT | PUB | — |
| BuildingRules | Building rules | Yes | OPT | AGT | — |
| BuildingPetsAllowed | Building pet policy | Yes | **REQ** | PUB | **[I3]** Exhibit A: "Building Pet Policy." RLS+IDX+VOW+Syndication. Building-wide (vs. unit I22). **If No, then PetsAllowed (unit) MUST also = No.** |
| BuildingPetsAllowedComments | Pet details | Yes | **COND** | PUB | Required if BuildingPetsAllowed = SizeLimit, NumberLimit, or BreedRestrictions. |
| RentingAllowedYN | Subletting allowed | Yes | OPT | PUB | **[I4]** Exhibit A: "Building Sublet Policy." RLS+IDX+VOW+Syndication. Required for co-op/condop. |
| RoofRightsYN | Roof access | Yes | OPT | PUB | — |

---

### B15. FINANCIAL — UNIT LEVEL

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| AssociationFee | Monthly maintenance/CC | Yes | **COND** | PUB | **[I47]** Exhibit A: "Maintenance Fee or Common Charges." RLS+IDX+VOW+Syndication. **Required if CommonInterest = Condominium, StockCooperative, or Condop.** Does NOT include taxes. |
| AssociationFeeFrequency | Payment frequency | Yes | **COND** | PUB | **Required if CommonInterest = Condominium/StockCooperative/Condop AND AssociationFee > 0.** |
| AssociationFee2 | Second HOA fee | Yes | OPT | PUB | — |
| AssociationFee2Frequency | Second fee frequency | Yes | **COND** | PUB | Required if AssociationFee2 > 0. |
| AssociationFeeIncludes | What's included | Yes | OPT | PUB | — |
| AssociationName | Corporation name | Yes | OPT | PUB | — |
| AssociationYN | Has HOA? | Yes | OPT | PUB | — |
| NumberOfShares | Co-op shares | Yes | **COND** | PUB | **[I49]** Exhibit A: "Number of Shares (Co-op)." RLS+IDX+VOW+Syndication. **Required if CommonInterest = StockCooperative OR Condop.** |
| PercentOfCommonElements | Condo ownership % | Yes | **COND** | PUB | **[I50]** Exhibit A: "Percent of Common Elements (Condo)." RLS+IDX+VOW+Syndication. **Required if CommonInterest = Condominium.** 0-100 scale. |
| FlipTax | Transfer fee | Yes | **COND** | PUB | **[I45]** Exhibit A: "Flip Tax." RLS+IDX+VOW+Syndication. **Required if CommonInterest = Condominium, StockCooperative, or Condop.** Required for Co-op/Condop. |
| FlipTaxType | $ or %? | Yes | **COND** | PUB | Required if FlipTax > 0. |
| FlipTaxRemarks | Description | Yes | **COND** | PUB | Required if FlipTax > 0. |
| MaximumFinancingPercent | Max financing % | Yes | **COND** | PUB | **[I48]** Exhibit A: "Maximum Financing." RLS+IDX+VOW+Syndication. **Required if CommonInterest = Condominium, StockCooperative, or Condop.** |
| MaximumFinancingAmount | Max financing $ | Yes | OPT | PUB | — |
| MaximumFinancingRemarks | Financing remarks | Yes | **COND** | PUB | Required if CommonInterest = Condominium/StockCooperative/Condop. |
| TaxMonthlyAmount | Monthly tax (condo) | Yes | **COND** | PUB | **[I52]** Exhibit A: "Tax Monthly Amount (Condo)." RLS+IDX+VOW+Syndication. **Required if CommonInterest = Condominium.** Separate from I47. Building uses TaxAnnualAmount (I56). |
| TaxDeductionAmount | Tax deduction ($) | Yes | OPT | PUB | — |
| TaxDeductionPercent | Tax deduction (%) | Yes | OPT | PUB | — |
| TaxDeductionRemarks | Tax deduction notes | Yes | OPT | PUB | — |
| TaxAbatementYN | Has tax abatement? | Yes | **COND** | PUB | **[I51]** Exhibit A: "Tax Abatement." RLS+IDX+VOW+Syndication. **Required if CommonInterest = Condominium, Condop, or StockCooperative.** |
| TaxAbatementExpirationYear | Expiry year | Yes | **COND** | PUB | Required if TaxAbatementYN=true. |
| TaxAbatementComments | Description | Yes | **COND** | PUB | Required if TaxAbatementYN=true. |
| CapitalReservesYN | Has reserves? | Yes | OPT | AGT | — |
| CapitalReservesTotal | Reserves amount | Yes | OPT | AGT | — |
| LandAssessedValue | Assessed land value | Yes | OPT | AGT | — |
| SpecialAssessmentExpirationDateTime | Assessment expiry | Yes | OPT | AGT | — |

---

### B16. FINANCIAL — BUILDING LEVEL (Townhouse/Multi-Family)

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| TaxAnnualAmount | Annual property tax | Yes | **COND** | PUB | **[I56]** Exhibit A: "Tax Annual Amount." RLS+IDX+VOW+Syndication. **Required if PropertySubType = Duplex, Mixed Use, Multi Family, Multi Family Townhouse, Quadruplex, Single Family, Single Family Townhouse, Triplex, Unimproved Land.** vs. monthly condo (I52). |
| CapRate | Cap rate | Yes | OPT | AGT | NOI / Purchase Price. |
| NetOperatingIncome | NOI | Yes | OPT | AGT | — |
| OperatingExpense | Total operating expenses | Yes | OPT | AGT | — |

---

### B17. EXPENSES (All Annual, All Agent-Only)

All: Add/Edit=Yes, Required=OPT, Distribution=**AGT**. "Annual expense not paid by tenant, in Operating Expense calculations."

| Cotality Field | Description |
|---|---|
| CableTVExpense | Cable/TV |
| ElectricExpense | Electric |
| FuelExpense | Fuel |
| GardenerExpense | Gardener |
| InsuranceExpense | Insurance |
| LicensesExpense | Licenses |
| MaintenanceExpense | Maintenance |
| ManagerExpense | Manager |
| NewTaxesExpense | New taxes |
| PestControlExpense | Pest control |
| PoolExpense | Pool |
| ProfessionalManagementExpense | Management company |
| SuperExpense | Superintendent |
| SuppliesExpense | Supplies |
| TrashExpense | Trash |
| WaterSewerExpense | Water/sewer |
| WorkmansCompensationExpense | Workers comp |
| OtherExpense | Other |
| OtherExpenseRemarks | Other description |

---

### B18. CONCESSIONS & TERMS

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| Concessions | Are there concessions? | Yes | **REQ** | PUB | **[I33]** Exhibit A: "Concessions." RLS+IDX+VOW+Syndication. **Values: Yes, No, or Call Listing Agent.** NO compensation info (C9). **Dollar amounts NEVER public** — only Y/N/CallAgent flag. |
| ConcessionsAmount | Dollar amount | Yes | **COND** | AGT | **Required if Concessions=Yes.** Agent view only. |
| ConcessionsComments | Description | Yes | **COND** | AGT | **Required if Concessions=Yes.** Agent view only. |
| ConcessionsBuyerBrokerFee | Buyer broker fee concession | Yes | OPT | CLOSE | **Only when MLSStatus=Closed.** |
| ConcessionsClosingCosts | Closing cost concession | Yes | OPT | CLOSE | **Only when MLSStatus=Closed.** |
| ConcessionsOtherCosts | Other cost concession | Yes | OPT | CLOSE | **Only when MLSStatus=Closed.** |
| ConcessionsPropertyImprovementCosts | Improvement concession | Yes | OPT | CLOSE | **Only when MLSStatus=Closed.** |
| Exclusions | Items NOT included | Yes | OPT | PUB | — |
| Inclusions | Items included | Yes | OPT | PUB | — |

---

### B19. LOT & LAND

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| LotSizeArea | Total lot area | Yes | **COND** | PUB | **Required if PropertySubType = SF Townhouse, Duplex, Mixed Use, Multi Family, MF Townhouse, Quadruplex, SF Residence, Triplex, Unimproved Land.** |
| LotSizeDimensions | Lot dimensions | Yes | **COND** | PUB | Same conditional as LotSizeArea. |
| LotSizeUnits | Measurement unit | Yes | **COND** | PUB | Required if LotSizeArea >= 0. |
| LotSizeSource | Source | Yes | OPT | PUB | — |
| LotFeatures | Lot features | Yes | OPT | PUB | — |
| BuildingAreaTotal | Total building area | Yes | **COND** | PUB | **[I53]** Exhibit A: "Building Area Total." RLS+IDX+VOW+Syndication. **Required if PropertySubType = Duplex, Mixed Use, Multi Family, MF Townhouse, Quadruplex, Single Family, SF Townhouse, Triplex, Unimproved Land.** |
| BuildingAreaSource | Source | Yes | OPT | PUB | — |
| BuildingAreaUnits | Units | Yes | **COND** | PUB | Required if BuildingAreaTotal entered. |
| AreaOverFAR | Area over FAR | Yes | OPT | AGT | — |
| AreaUnderFAR | Area under FAR | Yes | OPT | AGT | — |
| ZoningDescription | Zoning | Yes | OPT | PUB | — |
| LandLeaseYN | Land leased? | Yes | OPT | PUB | Material fact. |
| LandLeaseAmount | Lease amount | Yes | OPT | PUB | — |
| LandLeaseAmountFrequency | Frequency | Yes | OPT | PUB | — |
| LandLeaseExpirationDate | Expiry | Yes | OPT | PUB | — |
| Possession | When possession occurs | Yes | OPT | PUB | — |

---

### B20. UNIT FEATURES

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| Appliances | Appliances | Yes | OPT | PUB | — |
| AccessibilityFeatures | Unit accessibility | Yes | OPT | PUB | — |
| BathroomCondition | Bathroom condition | Yes | OPT | PUB | — |
| KitchenCondition | Kitchen condition | Yes | OPT | PUB | — |
| CoolingYN | Has AC | Yes | OPT | PUB | — |
| Cooling | Cooling type | Yes | **COND** | PUB | Required if CoolingYN=true. |
| HeatingYN | Has heating | Yes | OPT | PUB | — |
| Heating | Heating type | Yes | **COND** | PUB | Required if HeatingYN=true. |
| Flooring | Flooring types | Yes | OPT | PUB | — |
| DoorFeatures | Doors | Yes | OPT | PUB | — |
| WindowFeatures | Windows | Yes | OPT | PUB | — |
| Electric | Electrical | Yes | OPT | PUB | — |
| ElectricOnPropertyYN | Has electric | Yes | OPT | PUB | — |
| Fencing | Fencing | Yes | OPT | PUB | — |
| FireplaceYN | Has fireplace | Yes | **COND** | PUB | **Must be true if FireplacesTotal > 0.** |
| FireplacesTotal | # fireplaces | Yes | **COND** | PUB | **Must be > 0 if FireplaceYN=true.** |
| FireplaceFeatures | Description | Yes | **COND** | PUB | Required if fireplace exists. |
| LaundryFeatures | Unit laundry | Yes | OPT | PUB | **[I26]** Unit-level. See also BuildingLaundryFeatures (B14) for building-level. |
| InteriorFeatures | Interior | Yes | OPT | PUB | — |
| ExteriorFeatures | Exterior | Yes | OPT | PUB | — |
| OtherEquipment | Equipment | Yes | OPT | PUB | — |
| DiningType | Dining type | Yes | OPT | PUB | — |
| SecurityFeatures | Security | Yes | OPT | PUB | — |

---

### B21. PARKING

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| GarageYN | Has garage | Yes | **REQ** | PUB | **[I6, I54]** Exhibit A: "Have Garage" + "Garage." RLS+IDX+VOW+Syndication. Required for building/townhouse. |
| GarageSpaces | Assigned spaces | Yes | **COND** | PUB | Required if GarageSpacesAssignedYN=true. |
| GarageSpacesAssignedYN | Has assigned parking | Yes | OPT | PUB | — |
| AttachedGarageYN | Attached | Yes | OPT | PUB | — |
| CarportYN | Has carport | Yes | OPT | PUB | — |
| CarportSpaces | Carport spaces | Yes | OPT | PUB | — |
| OpenParkingYN | Has open parking | Yes | OPT | PUB | — |
| OpenParkingSpaces | Open spaces | Yes | **COND** | PUB | Required if OpenParkingYN=True. |
| ParkingFeatures | Features | Yes | OPT | PUB | — |
| ParkingTotal | Total spaces | Yes | OPT | PUB | — |

---

### B22. OUTDOOR SPACES & PETS

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| PatioAndPorchFeatures | Patio/terrace | Yes | OPT | PUB | **[I24]** Exhibit A: "Private Outdoor Space." RLS+IDX+VOW+Syndication. |
| PrivateOutdoorSpaceSize | Size | Yes | **COND** | PUB | Required if PatioAndPorchFeatures or ExteriorFeatures != None. |
| PrivateOutdoorSpaceRemarks | Description | Yes | OPT | PUB | — |
| PoolFeatures | Pool | Yes | OPT | PUB | — |
| SpaYN | Hot tub | Yes | OPT | PUB | — |
| SpaFeatures | Spa | Yes | OPT | PUB | — |
| PetsAllowed | Unit pet policy | Yes | **REQ** | PUB | **[I22]** Exhibit A: "Pet Policy." RLS+IDX+VOW+Syndication. **If BuildingPetsAllowed=No, MUST also = No.** |
| PetsAllowedComments | Details | Yes | **COND** | PUB | Required if PetsAllowed = BreedRestrictions, NumberLimit, or SizeLimit. |
| PetDepositFee | Pet deposit | Yes | OPT | PUB | — |
| GuarantorsAcceptedYN | Guarantors? | Yes | OPT | PUB | — |

---

### B23. SHOWINGS & OPEN HOUSES

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| ShowingContactName | Contact name | Yes | OPT | AGT | — |
| ShowingContactPhone | Phone | Yes | OPT | AGT | — |
| ShowingContactPhoneExt | Extension | Yes | OPT | AGT | — |
| ShowingContactType | Type | Yes | OPT | AGT | — |
| ShowingDays | Available days | Yes | OPT | AGT | — |
| ShowingStartTime | Start time | Yes | **COND** | AGT | Required if ShowingEndTime provided. Cannot >= ShowingEndTime. |
| ShowingEndTime | End time | Yes | **COND** | AGT | Required if ShowingStartTime provided. Cannot <= ShowingStartTime. |
| OpenHouseCount | Total OH rows | No | SYS | PUB | **[I41]** Exhibit A: "Open House(s) Details." RLS+IDX+VOW+Syndication. Disabled during Coming Soon (D4). Open to all Participants (E18). |
| OpenHousePublicCount | Public OH count | No | SYS | PUB | — |
| OpenHousePublicUpcoming | Upcoming public | No | SYS | PUB | — |
| OpenHouseUpcoming | All upcoming | No | SYS | PUB | — |
| ActiveOpenHouseCount | Active count | No | SYS | PUB | — |
| DeliveredVacantYN | Delivered vacant? | Yes | OPT | PUB | — |

---

### B24. NEW DEVELOPMENT & CONSTRUCTION

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| NewDevelopmentYN | Is new development | Yes | **REQ** | PUB | **[I10]** Exhibit A: "New Development & New Construction." RLS+IDX+VOW+Syndication. **Cannot be Coming Soon (D1).** If true, CoBrokeAgreement must = RUNDBA (K1). Triggers RUNDBA requirement. |
| NewConstructionYN | Is new construction | Yes | **REQ** | PUB | **[I10]** Part of Exhibit A "New Development & New Construction." Not previously occupied. |
| SponsorUnitYN | Sponsor unit | Yes | **COND** | PUB | Required if NewDevelopmentYN=true OR NewConstructionYN=true. **Must be pursuant to AG-approved Offering Plan.** |
| NewlyConvertedUnitYN | Newly converted | Yes | OPT | PUB | — |
| CoOwnershipInterest | Fractional interest | Yes | **COND** | PUB | Required if PropertySubType=Co Ownership. |
| CoOwnershipRemarks | Description | Yes | OPT | PUB | — |
| FractionalUnitNumber | Unit + weeks | Yes | **COND** | PUB | Required if PropertySubType=Co Ownership. |

---

### B25. GREEN BUILDING & SUSTAINABILITY

All optional, distribution = PUB.

| Cotality Field | Description |
|---|---|
| GreenBuildingYN | Certified green |
| GreenBuildingVerificationType | LEED, Energy Star, ICC-700 |
| GreenEnergyEfficient | Energy efficient features |
| GreenEnergyGeneration | Power generation |
| GreenIndoorAirQuality | Air quality |
| GreenLocation | Location efficiencies |
| GreenSustainability | Sustainable construction |
| GreenWaterConservation | Water conservation |

---

### B26. MEDIA

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| PhotosCount | Number of photos | No | SYS | PUB | **[I23]** Exhibit A: "Photos - Sort Order." Photos must NOT contain agent info (C7). RLS+IDX+VOW+Syndication. |
| PhotosChangeTimestamp | Last photo update | No | SYS | SYS | — |
| VideosCount | Videos | No | SYS | PUB | — |
| VideosChangeTimestamp | Last video update | No | SYS | SYS | — |
| VideoURL | Video URL | — | — | — | **PHANTOM — not a live field. Use `VirtualTourURLBranded`/`VirtualTourURLUnbranded`, or the Media resource with `MediaCategory=Video`.** |
| Video2URL–Video4URL | Additional videos | — | — | — | **PHANTOM — same family as `VideoURL`; not live. Use `VirtualTourURL*` / Media resource.** |
| VirtualTourURLBranded | Branded tour | Yes | OPT | PUB | — |
| VirtualTourURLUnbranded | Unbranded tour | Yes | OPT | PUB | — |
| VirtualTourURLUnbranded2 | 2nd tour | Yes | OPT | PUB | — |
| VirtualTourURLUnbranded3 | 3rd tour | Yes | OPT | PUB | — |
| DocumentsAvailable | Doc types | Yes | OPT | AGT | — |
| DocumentsCount | Doc count | No | SYS | SYS | — |
| DocumentsChangeTimestamp | Last doc update | No | SYS | SYS | — |
| TotalDocumentsCount | All docs | No | SYS | SYS | — |
| TotalPhotosCount | All photos | No | SYS | SYS | — |
| OtherStructures | Other structures | Yes | OPT | PUB | — |

---

### B27. RENTAL-SPECIFIC FIELDS

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| AvailabilityDate | Move-in date | Yes | **COND** | PUB | **[I58]** Exhibit A: "Availability Date." RLS+IDX+VOW+Syndication. **Required if PropertyType=ResidentialLease.** Required for all rentals. |
| LeaseType | Stabilized/Non-Stabilized | Yes | **COND** | PUB | **[I61]** Exhibit A: "Lease Type." RLS+IDX+VOW+Syndication. **Required if PropertyType=ResidentialLease AND CommonInterest=RentalBuilding.** NYC-specific. |
| LeaseRenewalOptionYN | Renewal option | Yes | OPT | PUB | — |
| Furnished | Furnished status | Yes | **COND** | PUB | **[I59]** Exhibit A: "Furnished Details." RLS+IDX+VOW+Syndication. **Required if PropertyType=ResidentialLease.** Values: Furnished, Unfurnished, Partially, Negotiable. |
| FurnishedListPrice | Price furnished | Yes | **COND** | PUB | Required if Furnished = Furnished/Partially/Negotiable. |
| FurnishedMinLeaseMonths | Min lease furnished | Yes | **COND** | PUB | Same conditional. |
| FurnishedMaxLeaseMonths | Max lease furnished | Yes | **COND** | PUB | Same conditional. |
| MinLeaseMonths | Minimum lease months | Yes | **COND** | PUB | **[I60]** Exhibit A: "Lease Terms." RLS+IDX+VOW+Syndication. **Required if PropertyType=ResidentialLease. Value >= 1.** |
| MaxLeaseMonths | Maximum lease months | Yes | OPT | PUB | **[I60]** Part of Exhibit A "Lease Terms." |
| DepositAmount | Security deposit | Yes | OPT | PUB | — |
| OwnerPays | Owner-paid expenses | Yes | OPT | PUB | ResidentialLease only. For individual owners or < 5 units. |
| OwnerPaysRemarks | Details | Yes | OPT | PUB | — |
| OwnerPaysPlusConcessionsYN | Owner pays + concession | Yes | OPT | PUB | — |
| MoveInCosts | Move-in fees (multi-select enum) | Yes | OPT | PUB | Live Property field. |
| MoveInCostsComments | Move-in details | Yes | OPT | PUB | Live Property `Edm.String(1024)` — canonical FARE move-in disclosure text. |
| MoveInCostsAmount | Move-in cost amount | Yes | **COND** | PUB | Live Property `Edm.Decimal(14,2)` — canonical FARE move-in dollar amount. Required if MoveInCosts have value. (`MoveInCostsAmountTotal` is **phantom** — does not exist on live Trestle; legacy fallback only.) |
| UnitsFurnished | Furnished count | No | SYS | PUB | — |
| UnitTypes | Unit type collection | Yes | OPT | PUB | For multifamily. |
| UnitTypeType | Unit types list | No | SYS | PUB | — |
| UnitCount | Unit row count | No | SYS | PUB | — |

---

### B28. SYSTEM IDENTIFIERS

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| ListingID | Local listing ID | No | SYS | SYS | Generated by Matrix DB. |
| SourceSystemKey | LMP's unique listing ID | Yes | **REQ** | SYS | LMP's ListingID. |
| ListingKeyNumeric | Numeric ID | No | SYS | SYS | — |
| SourceSystemName | Source LMP name | No | SYS | SYS | — |
| TransferredFromKey | Previous LMP ID | No | SYS | SYS | Contact RLS Staff. |
| TransferredFromSystemName | Previous LMP | No | SYS | SYS | — |
| TransferredToSystemName | New LMP | No | SYS | SYS | — |
| ListingIssues | Issue/restriction | No | SYS | SYS | — |
| RoomCount | Room row count | No | SYS | SYS | — |
| MatrixTesting | Test flag | No | SYS | SYS | Migration testing only. |
| StreetNumberNumeric | Integer street # | No | SYS | SYS | — |

---

### B29. OTHER FIELDS

| Cotality Field | Description | Add/Edit | Required | Dist | REBNY Rules |
|---|---|---|---|---|---|
| BasementYN | Has basement | Yes | OPT | PUB | — |
| Basement | Basement features | Yes | **COND** | PUB | Required if BasementYN=true. |
| NumberOfSeparateElectricMeters | Electric meters | Yes | OPT | AGT | — |
| NumberOfSeparateGasMeters | Gas meters | Yes | OPT | AGT | — |
| NumberOfSeparateWaterMeters | Water meters | Yes | OPT | AGT | — |

---

### B30. COMPLIANCE & WORKFLOW TRACKING (CRM-Only, I70-I79)

These fields are NOT in the Cotality dictionary. They are CRM workflow fields required by UCBA operational rules.

| I# | Field | Distribution | Rules |
|---|---|---|---|
| I70 | **Coming Soon Authorization (Exhibit G)** | INT | REQUIRED before allowing Coming Soon status (D10). Owner must sign Exhibit G. Upload/digital sign before RLS submission. Without form, block CS. |
| I71 | **Coming Soon Prior Use Check** | INT | One-time use per address+owner (D9). Check history: same address AND owner within 60 days = BLOCK. Allowed again after 60+ days off-market. |
| I72 | **First Showing Date Lock Status** | INT | Once CS submitted, ActivationDate (I40) CANNOT be changed (D12). If not ready, must change status to TOM/Withdrawn. |
| I73 | **Protected Period Names List** | INT | Up to 6 names within 7 business days of I34 expiration (A6). Track 90-day window per name (A7). |
| I74 | **Protected Period Expiry Date** | INT | Auto-calculated: I34 + 90 days. Alert if submitted name goes to contract. |
| I75 | **Owner Opt-Out Form Status** | INT | Exhibit B upload. 48hr deadline from opt-out selection (C3). Must include all L1-L6 elements. |
| I76 | **Buyer Rep Agreement Status** | INT | Required before showing (E7). Showing workflow gate: cannot show without status = "On File." |
| I77 | **RUNDBA Document Status** | INT | Required for new dev (K1). Block RLS submission until submitted. Auto-triggered when I10=Yes. |
| I78 | **Listing Agreement Document** | INT | Must produce within 48hrs on RLS request (G4). Store signed listing agreement. |
| I79 | **Fair Housing Scan Result** | INT | Auto-scan text fields before RLS submission. Fail = block. $250 first, $500+termination second (M1-M2). |

---
---

## PART C — UCBA CONTENT RULES

### What Can NEVER Appear in Listings

| # | Rule | UCBA Ref | Fine |
|---|---|---|---|
| 1 | **No agent name/contact/URL** in description, photos, comments | Art. I, 5(C) | $250-$10K |
| 2 | **No "Off-Market" language** | Art. I, 5(D) | $250-$10K |
| 3 | **No compensation/broker fees/closing costs** | Art. I, 5(E) | $250-$10K |
| 4 | **No "free services" claims** (unless truly free) | Art. III, 5 | $250-$10K |
| 5 | **No Fair Housing violations** | Exhibit C | $250/$500+termination |

### What Can NEVER Be Displayed Publicly

| Data | Where Allowed |
|---|---|
| ExpirationDate [I34] | RLS (hidden), INT only — NEVER public |
| Seller/Owner identity | INT only until closed |
| Buyer identity [I28] | INT only until closed |
| PropertyCondition [I25] | RLS Participant view + disclaimer only |
| ShowingInstructions [I42] | RLS Participant view only |
| PrivateRemarks | RLS Participant view only |
| Compensation amounts | NEVER displayed anywhere |
| ConcessionsAmount | RLS agent view, INT only |
| All expense fields (B17) | RLS agent view, INT only |
| Tax Block/Lot [I13] | RLS, INT only |

### Cascade Rules

| Trigger | Effect |
|---|---|
| InternetEntireListingDisplayYN=False | AUTO: IDX=False, AddressDisplay=False, AVM=False, ConsumerComment=False. Alerts disabled. |
| BuildingPetsAllowed=No | PetsAllowed (unit) MUST = No |
| FireplaceYN=true | FireplacesTotal must be > 0 |
| FireplacesTotal > 0 | FireplaceYN must be true |
| PropertyType=Residential | Cannot submit ExclusiveRightToLease |
| PropertyType=ResidentialLease | Cannot submit ExclusiveRightToSell |
| Permissions=Private | Cannot also select OwnerOptOut |
| NewDevelopmentYN=true | Cannot be ComingSoon. Must have RUNDBA. |
| ElevatorsTotal > 0 | BuildingFeatures must include "Elevator(s)" |
| CityRegion | Must match CountyOrParish |

### Timing Rules

| Action | Deadline | UCBA Ref |
|---|---|---|
| RLS submission | Simultaneously with public dissemination or first showing | Art. I, 5 |
| Status/price changes | 24 hours (excl weekends/postal holidays) | Art. I, 6 |
| Closing price entry | 24 hours of closing | Art. I, 7 |
| Remove/mark closed on website | 24 hours | Art. I, 6 |
| Owner Opt-Out form | 48 hours via LMP | Art. I, 5(A) |
| Coming Soon max | 14 calendar days | Art. I, 16(A) |
| Protected period names | 7 business days after expiration | Art. II, 13 |
| DOM reset | After 30 consecutive days Withdrawn/Cancelled | Art. I, 11 |

### Validation Rules

| Field | Rule |
|---|---|
| StreetName, StreetSuffix, AlternateStreetName, AlternateStreetSuffix | Rejects if not in Street Dictionary |
| City | Must be New York City |
| CityRegion + CountyOrParish | Must match (Kings=Brooklyn, etc.) |
| YearBuilt | 4 chars, 1700+, max 10yr future |
| ExpirationDate | Max 10 years |
| ListingContractDate | Not editable once submitted. Max 1 year. |
| CloseDate | Must be >= PurchaseContractDate |
| PurchaseContractDate | Must be >= ListingContractDate |
| WithdrawnDate | Must equal OffMarketDate |
| MinLeaseMonths | Must be >= 1 |
| ListPrice (rental) | Must be gross monthly rent |
| PercentOfCommonElements | 0-100 scale |
| SponsorUnitYN | AG-approved Offering Plan required |

### REBNY Required Defaults

| Field | Default |
|---|---|
| IDXEntireListingDisplayYN | **True** |
| SyndicateYN | **True** |
| InternetAddressDisplayYN | True |
| InternetAutomatedValuationDisplayYN | True |
| InternetConsumerCommentYN | True |

---

## PART D — DISTRIBUTION BY LISTING TYPE

| Channel | Exclusive | Co-Exclusive | Owner Opt-Out | Participant Only | Ours Alone |
|---|---|---|---|---|---|
| **RLS** | MANDATORY | MANDATORY | BLOCKED | YES (agents only) | BLOCKED |
| **IDX** | ON | ON | BLOCKED | BLOCKED | BLOCKED |
| **WWW** | ON | ON | BLOCKED | BLOCKED | ON (only channel) |
| **Syndication** | ON | ON | BLOCKED | BLOCKED | BLOCKED |
| **Listhub** | ON | ON | BLOCKED | BLOCKED | BLOCKED |
| **NY MLS** | ON | ON | BLOCKED | BLOCKED | BLOCKED |
| **Realtor.com** | ON | ON | BLOCKED | BLOCKED | BLOCKED |
| **StreetEasy** | Manual | Manual | BLOCKED | BLOCKED | Manual |
| **1:1 Comms** | YES | YES | YES (only exception) | YES | YES |

---

## PART E — VIOLATION PENALTIES

| Category | 1st | 2nd | 3rd | 4th |
|---|---|---|---|---|
| **Fair Housing** | $250 (2 days) | $500 + RLS termination | — | — |
| **Data Quality** | $0 (3 days) | $250 (2 days) | $250 (1 day) | RLS termination |
| **Incurable** | $250 | $500 each subsequent | — | — |
| **General UCBA** | $500 | $2,000 | $10,000 + posted | 30-day suspension |
| **Quarterly >5% rejection** | $10,000 | — | — | — |
| **3 quarterly fines/year** | 30-day suspension | — | — | — |

---

*End of Comprehensive Field Reference — 902 REBNY IDX Plus fields + All 79 Exhibit A mandatory fields + All UCBA rules, merged in one document.*
