# UCBA COMPLIANCE AUDIT & COMMERCIAL REORGANIZATION REPORT

> **Auditor:** Claude (REBNY RLS + UCBA Compliance Auditor)
> **Date:** 2026-02-09
> **Form Audited:** Sale Listing Intake Form (`Desktop/1/Old/MALLAN-NYC-CRM-FINAL2.html`)
> **Source Rules:** `data/UCBA-2026-Requirements.md` (UCBA January 2026 revision)
> **Source Data:** `data/rebny-rls-property-fields.csv` (448 fields) + `data/rebny-rls-property-lookup.csv` (2,066 values)

---

## STEP 1 — UCBA RULE-BY-RULE COMPLIANCE MAPPING

### 1.1 Listing Input Rules (Art. I)

| # | UCBA Rule | UCBA Ref | Applies To | In Sale Form? | Status | Notes |
|---|-----------|----------|-----------|---------------|--------|-------|
| 1 | **Exclusive Only** — RLS only accepts Exclusive Listings (inc. co-exclusive). No Open, FSBO, or Ours Alone. | Art. I, Sec. 4 | All RLS listings | **YES** | PASS | `saleListingType` radio: Exclusive, In-House, Co-Exclusive, Owner Opt-Out, Participant Only. No Open/FSBO options. |
| 2 | **Simultaneous Distribution** — Must disseminate to RLS simultaneously with ANY public dissemination or first showing | Art. I, Sec. 5 | All RLS listings | PARTIAL | NEEDS WORK | Distribution Tab 4 has channels but no auto-enforcement of simultaneous RLS submission on publish. CRM must enforce this at submission time. |
| 3 | **Owner Opt-Out** — Requires signed form (Exhibit B) within 48hrs. NO public dissemination. Exception: 1:1 personal comms. | Art. I, Sec. 5(A) | All listings (opt-out) | **YES** | PASS | `saleListingType=OwnerOptOut` triggers cascade: disables IDX/Listhub/NYMLS/Realtor/RPX, keeps WWW + RLS Participants. Warning displayed. Form upload field needed (not yet). |
| 4 | **No Pocket Listings** — Cannot promote/encourage withholding from RLS | Art. I, Sec. 5(B) | All listings | MISSING | NEEDS WORK | No compliance notice or warning about pocket listing prohibition. Should display warning when Owner Opt-Out is selected. |
| 5 | **No Agent Info in Description** — No agent name, contact, URL in description/photos/comments | Art. I, Sec. 5(C) | All listings | MISSING | BLOCKER | No text validation/scanner on description fields. Must implement before production. |
| 6 | **No "Off-Market" Language** — Cannot describe/promote as "Off-Market" | Art. I, Sec. 5(D) | All listings | MISSING | BLOCKER | No text validation on description/broker notes fields. |
| 7 | **No Compensation in Description** — No broker fees/closing costs/compensation in description/comments | Art. I, Sec. 5(E) | All listings | MISSING | BLOCKER | No text validation. |
| 8 | **Mixed-Use Applicability** — Rules apply to professional/retail units in residential properties of 5 units or less | Art. I, Sec. 5(F) | Commercial units in small residential buildings | NOT ADDRESSED | NEEDS WORK | Current form treats ALL commercial as one bucket. Must distinguish RLS-eligible commercial units from non-RLS commercial. |
| 9 | **Status Changes Within 24hrs** — Price/status changes simultaneous with public changes or within 24hrs | Art. I, Sec. 6 | All RLS listings | PARTIAL | NEEDS WORK | Status dropdown exists but no timestamp tracking or 24hr SLA enforcement. |
| 10 | **Closing Price Within 24hrs** — Must provide closing price within 24hrs of closing | Art. I, Sec. 7 | Closed listings | MISSING | NEEDS WORK | No closing workflow reminder or enforcement. |
| 11 | **Closed Listings Removed in 24hrs** — Mark closed on website within 24hrs | Art. I, Sec. 6 | All closed listings | N/A (CRM) | FRONTEND ONLY | This is a frontend display rule, not a CRM form issue. |
| 12 | **Withdrawal Constraints** — Cannot withdraw from RLS if still displayed publicly | Art. I, Sec. 9 | Withdrawn listings | MISSING | NEEDS WORK | No validation prevents RLS withdrawal while public display is active. |
| 13 | **Auction Listings** — Must include min bid, date/time/location, registration, etc. | Art. I, Sec. 15 | Auction listings | MISSING | LOW PRIORITY | No auction-specific field set. Add if/when needed. |
| 14 | **Coming Soon (Sales Only)** — Max 14 days, no showings, no OH, no rentals/new dev, once per address | Art. I, Sec. 16 | Coming Soon sales | **YES** | PASS | `handleSaleComingSoon()` disables OH tab. Status dropdown includes ComingSoon. 14-day max validation exists. |
| 15 | **Commission Negotiability Disclosure** — "Commissions are fully negotiable" in listing/buyer agreements | Art. I, Sec. 17 | All listings | PARTIAL | NEEDS WORK | No explicit disclosure checkbox or template text in the form. Should be a required acknowledgment. |
| 16 | **Buyer Rep Agreement** — Must have executed written agreement before any showing | Art. II, Sec. 16 | Showings | N/A (CRM) | WORKFLOW ONLY | This is a showing workflow gate, not a listing form field. |
| 17 | **Fair Housing** — No violating words/phrases | Exhibit C | All listing text | MISSING | BLOCKER | No AI/regex scanner on description fields. |

### 1.2 Mandatory Fields — Exhibit A Compliance

| # | Exhibit A Field | RESO Field | In Sale Form? | Status |
|---|----------------|------------|---------------|--------|
| 1 | Borough | — | YES (Building Modal) | PASS |
| 2 | Building and Listing Classification | PropertyType + CommonInterest + PropertySubType | YES | PASS |
| 3 | Building Pet Policy | BuildingPetsAllowed | YES (Building Modal) | PASS |
| 4 | Building Sublet Policy | — | YES (Building Modal) | PASS |
| 5 | Have Elevator | ElevatorsTotal | YES (Building Modal) | PASS |
| 6 | Have Garage | GarageYN | YES (Building Modal) | PASS |
| 7 | Have Lobby Attendant | AttendanceType | YES (Building Modal) | PASS |
| 8 | Listing Full Address | StreetNumber + StreetName + ... | YES (Building Modal auto-pop) | PASS |
| 9 | Neighborhood | — | YES (Building Modal) | PASS |
| 10 | New Development & New Construction | NewDevelopmentYN + NewConstructionYN | YES (saleBuildingStatus radio) | PASS |
| 11 | Number of Total Units | NumberOfUnitsTotal | YES (Building Modal) | PASS |
| 12 | Ownership Type | CommonInterest | YES (via PropertyType radio + Commercial Ownership) | PASS |
| 13 | Tax Block and Lot | BuildingTaxLot | YES (Building Modal) | PASS |
| 14 | Total Number of Floors | StoriesTotal | YES (Building Modal) | PASS |
| 15 | Unit Number | UnitNumber | YES | PASS |
| 16 | Year Built | YearBuilt | YES (Building Modal) | PASS |
| 17 | Board Approval Required | — | YES (Building Requirements grid) | PASS |
| 18 | Number of Bathrooms | BathroomsFull | YES (Tab 2) | PASS |
| 19 | Number of Baths Half | BathroomsHalf | YES (Tab 2) | PASS |
| 20 | Number of Bedrooms | BedroomsTotal | YES (Tab 2) | PASS |
| 21 | Number of Total Rooms | RoomsTotal | YES (saleTotalRooms, Tab 2) | PASS |
| 22 | Pet Policy | PetsAllowed | YES (Tab 2 Features) | PASS |
| 23 | Photos - Sort Order | — | PARTIAL | Media modal exists but drag sort not confirmed |
| 24 | Private Outdoor Space | PatioAndPorchFeatures | YES (Tab 2 Features) | PASS |
| 25 | Property Conditions | PropertyCondition | YES | PASS |
| 26 | Washer/Dryer Details | LaundryFeatures | YES (Tab 2 Features) | PASS |
| 27 | Exclusive Agents & Firm | ListAgentKey + ListOfficeName | YES (Updating Company/Agent) | PASS |
| 28 | Buyer Agent and Firm (Closed) | BuyerAgentKey + BuyerOfficeName | PARTIAL | Only relevant at closing status |
| 29 | IDX Entire Listing Display | IDXEntireListingDisplayYN | YES (via Listing Type cascade) | PASS |
| 30 | Participant Only (if relevant) | — | YES (saleListingType=ParticipantOnly) | PASS |
| 31 | Syndication Display | SyndicationOptOutYN | YES (Distribution Tab 4) | PASS |
| 32 | Closing/Rental Price | ClosePrice | PARTIAL | Exists for closed status |
| 33 | Concessions | Concessions | MISSING | NEEDS WORK |
| 34 | Exclusive Listing Expiration Date | ListingContractDate | YES (saleExclusiveExpires) | PASS |
| 35 | Listing Contract Date | ListingContractDate | YES (saleDateListed) | PASS |
| 36 | Listing Status & Date Change | MLSStatus + StatusChangeTimestamp | YES (saleStatus dropdown) | PASS |
| 37 | Price | ListPrice | YES | PASS |
| 38 | Purchase Contract Signed Date | PurchaseContractDate | YES (saleContractSignedDate) | PASS |
| 39 | Sold/Leased Date | CloseDate | PARTIAL | Exists for closed status |
| 40 | First Showing Date | — | MISSING | NEEDS WORK — default should be date listing entered |
| 41 | Open House Details | — | YES (Sub-tab 1.4) | PASS |
| 42 | Showing/OH Instructions | ShowingInstructions | YES | PASS |
| 43 | Co-Broke Agreement Type | CoBrokeAgreement | YES (saleCoBrokeAgreementType: REBNY-Universal / RUNDBA) | PASS |
| 44 | Listing Type | ListingAgreement | YES (saleListingType radios) | PASS |

### 1.3 Additional Sales Fields (Condo/Coop/Condop)

| # | Exhibit A Field | In Sale Form? | Status |
|---|----------------|---------------|--------|
| 1 | Flip Tax | YES (conditional Co-op/Condo/Condop) | PASS |
| 2 | Living Area (Condo) | YES (conditional Condo) | PASS |
| 3 | Maintenance Fee or Common Charges | YES (AssociationFee) | PASS |
| 4 | Maximum Financing | YES (MaximumFinancingPercent) | PASS |
| 5 | Number of Shares (Coop) | YES (conditional Co-op/Condop) | PASS |
| 6 | Percent of Common Elements (Condo) | YES (conditional Condo) | PASS |
| 7 | Tax Abatement | YES (Building Modal Financials) | PASS |
| 8 | Tax Monthly Amount (Condo) | YES (TaxMonthlyAmount) | PASS |

### 1.4 Additional Sales Fields (Building/Townhouse)

| # | Exhibit A Field | In Sale Form? | Status |
|---|----------------|---------------|--------|
| 1 | Building Area Total | YES (Tab 3 Essentials) | PASS |
| 2 | Garage | YES (Building Modal) | PASS |
| 3 | Size Dimensions | MISSING | NEEDS WORK |
| 4 | Tax Annual Amount | YES (Tab 3 Financials) | PASS |
| 5 | Total Legal Rooms | MISSING | NEEDS WORK |

### 1.5 Prohibitions (Art. III)

| # | UCBA Rule | Applies To | In Sale Form? | Status |
|---|-----------|-----------|---------------|--------|
| 1 | No unauthorized use of listing info | Data handling | N/A (backend enforcement) | WORKFLOW |
| 2 | No advertising another's listing without consent (IDX/VOW exception) | Marketing | N/A (frontend) | FRONTEND |
| 3 | IDX/VOW must include attribution | Display | N/A (frontend) | FRONTEND |
| 4 | No duplicate listings during exclusive term | Listing creation | MISSING | NEEDS WORK |
| 5 | No solicitation of owner to terminate exclusive | Operational | N/A (policy) | POLICY |
| 6 | Data accuracy — incomplete/incorrect = violation | All fields | PARTIAL | Validation exists but not all rules enforced |
| 7 | No "free services" claims | Marketing text | MISSING | NEEDS WORK — scanner needed |

### 1.6 Compensation Rules (Art. IV)

| # | UCBA Rule | In Sale Form? | Status |
|---|-----------|---------------|--------|
| 1 | RLS does NOT collect/display compensation | YES | PASS — no compensation fields displayed |
| 2 | Must provide listing agreements within 48hrs on request | N/A (policy) | POLICY |
| 3 | Disclose ownership interest in listed property | MISSING | NEEDS WORK |

### 1.7 CRITICAL FINDING: Commercial Property Type Mapping

**THE REBNY RLS HAS NO "COMMERCIAL" PropertyType.**

The official REBNY RLS (Trestle/CoreLogic) only has TWO PropertyType values:
- `Residential` (sales)
- `ResidentialLease` (rentals)

Commercial UNITS can exist on the RLS only through:
- **PropertySubType = Office** — "The property is designed to be used as office space"
- **PropertySubType = Retail** — "The property designed to be used as retail space"

Combined with a valid **CommonInterest**:
- `Condominium` → Commercial Condo
- `StockCooperative` → Commercial Co-op
- `Condop` → Commercial Condop

**UCBA Art. I, Sec. 5(F):** "These rules apply to professional/retail units within residential properties of **5 units or less**"

This means the UCBA explicitly extends its jurisdiction to commercial units within small residential buildings.

---

## STEP 2 — COMMERCIAL SECTION REORGANIZATION

### 2.1 Planned Changes Summary

**BEFORE making any edits, here is exactly what I intend to do:**

#### A) Commercial Types ALLOWED on RLS (move to Residential section)

These commercial property types map to valid RESO/Trestle fields and CAN be shared via RLS:

| Current Form Value | RESO Mapping | RLS Eligible? | How It Maps |
|---|---|---|---|
| **Commercial Condo** (CommercialCondo) | PropertyType=Residential, CommonInterest=Condominium, PropertySubType=Office or Retail | **YES** | Unit in condo building |
| **Commercial Co-op** (CommercialCoop) | PropertyType=Residential, CommonInterest=StockCooperative, PropertySubType=Office or Retail | **YES** | Unit in co-op building |
| **Commercial Condop** (CommercialCondop) | PropertyType=Residential, CommonInterest=Condop, PropertySubType=Office or Retail | **YES** | Unit in condop building |

These should be integrated into the main Property Type section as a sub-group alongside Condo/Co-op/Condop, since they use the same RESO structure.

#### B) Commercial Types NOT ALLOWED on RLS (Non-RLS Feed Only)

These have NO valid RESO PropertyType mapping and CANNOT be shared via RLS:

**Commercial Space Types (saleCommSubtype checkboxes):**

| Current Form Value | RLS Status | Reason |
|---|---|---|
| ProfessionalOffice | NOT RLS | No standalone commercial PropertyType in RESO |
| MedicalOffice | NOT RLS | No standalone commercial PropertyType |
| DentalOffice | NOT RLS | No standalone commercial PropertyType |
| FlexibleSpace | NOT RLS | No RESO field |
| Restaurant | NOT RLS | No RESO PropertySubType |
| Grocery | NOT RLS | No RESO PropertySubType |
| Showroom | NOT RLS | No RESO PropertySubType |
| StripMall | NOT RLS | No RESO PropertySubType |
| Industrial | NOT RLS | No RESO PropertySubType |
| Warehouse | NOT RLS | No RESO PropertySubType |
| Manufacturing | NOT RLS | No RESO PropertySubType |
| Distribution | NOT RLS | No RESO PropertySubType |
| Storage | NOT RLS | No RESO PropertySubType |
| MixedUseComm | NOT RLS (as standalone) | Mixed Use IS a valid PropertySubType but only under Residential PropertyType |
| LiveWork | NOT RLS | No RESO PropertySubType |
| Investment | NOT RLS | No RESO PropertySubType |
| Institutional | NOT RLS | No RESO PropertySubType |
| SpecialUse | NOT RLS | No RESO PropertySubType |

**Commercial Ownership Types (standalone):**

| Current Form Value | RLS Status | Reason |
|---|---|---|
| WholeBuilding | NOT RLS | Entire buildings don't have CommonInterest mapping |
| LandOnly | MAYBE | `UnimprovedLand` IS a valid PropertySubType, but only under Residential |

**Business Types (saleBusinessType checkboxes) — ALL NOT RLS:**
Healthcare (Medical, Dental, Health Services, Fitness), Food & Beverage (Restaurant, Cafe, Bar/Lounge, Fast Food, Bakery), Professional (Professional Svc, Financial, Real Estate, Accounting, Technology), Personal Services (Barber/Beauty, Dry Cleaner, Laundromat, Child Care), Hospitality (Hotel/Motel, B&B, Hospitality)

**IMPORTANT EXCEPTION:** `Office` and `Retail` as PropertySubType values DO exist in RESO, but ONLY when they are UNITS within a managed building (Condo/Co-op/Condop). A standalone office building or retail storefront that is NOT part of a common-interest development cannot use these RESO fields on the RLS.

### 2.2 Proposed New Structure

```
┌──────────────────────────────────────────────────────────────────┐
│ PROPERTY TYPE (salePropertyType) — RLS ELIGIBLE                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  RESIDENTIAL                                                     │
│  ○ Condo          ○ Co-op         ○ Condop                      │
│  ○ Townhouse      ○ Single Family  ○ Multi-Family               │
│  ○ Mixed Use      ○ Land                                         │
│                                                                  │
│  COMMERCIAL UNITS (RLS Eligible — units in managed buildings)    │
│  ○ Commercial Condo    ○ Commercial Co-op   ○ Commercial Condop │
│    └─ Office / Retail sub-selection                              │
│                                                                  │
│  All above → PropertyType=Residential in Trestle                 │
│  All above → RLS + IDX + VOW + Syndication eligible              │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ▼ COMMERCIAL — NON-RLS FEED ONLY (WWW Only)                    │
│    Market: Non-RLS Feed Only (WWW only)                          │
│                                                                  │
│    ⚠ These listings CANNOT be shared via REBNY RLS.              │
│    They will appear ONLY on mallan.nyc (WWW).                    │
│    No IDX, no VOW, no syndication, no RLS distribution.          │
│                                                                  │
│    Space Types:                                                  │
│    □ Office (standalone) □ Professional Office □ Medical Office  │
│    □ Dental Office □ Flexible Space □ Retail (standalone)        │
│    □ Restaurant □ Grocery □ Showroom □ Strip Mall                │
│    □ Industrial □ Warehouse □ Manufacturing □ Distribution       │
│    □ Storage □ Mixed Use (commercial) □ Live/Work                │
│    □ Investment □ Institutional □ Special Use                     │
│                                                                  │
│    Ownership:                                                    │
│    ○ Whole Building  ○ Land Only                                 │
│                                                                  │
│    Business Types: [Healthcare, F&B, Professional, etc.]         │
│                                                                  │
│    Distribution: WWW ONLY (all RLS channels auto-disabled)       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## STEP 3 — CLEAN MASTER PROPERTY TYPE LIST

### 3.1 Residential Property Types (RLS Eligible)

These map to **PropertyType = Residential** in Trestle/RESO.

| # | Display Label | Form Value | RESO CommonInterest | RESO PropertySubType | RLS? |
|---|---|---|---|---|---|
| 1 | Condo | Condo | Condominium | Apartment / Loft / GardenApartment / UnitDuplex / UnitTriplex / UnitQuadruplex | YES |
| 2 | Co-op | Coop | StockCooperative | Apartment / Loft / GardenApartment / UnitDuplex / UnitTriplex / UnitQuadruplex | YES |
| 3 | Condop | Condop | Condop | Apartment / Loft / GardenApartment / UnitDuplex / UnitTriplex / UnitQuadruplex | YES |
| 4 | Townhouse | Townhouse | None | SingleFamilyTownhouse / MultiFamilyTownhouse | YES |
| 5 | Single Family | SingleFamily | None | SingleFamilyResidence | YES |
| 6 | Multi-Family | MultiFamily | None | MultiFamily / Duplex / Triplex / Quadruplex | YES |
| 7 | Mixed Use | MixedUse | None | MixedUse | YES |
| 8 | Land | Land | None | UnimprovedLand | YES |

### 3.2 Commercial Property Types — RLS Shareable (Units in Managed Buildings)

These map to **PropertyType = Residential** in Trestle with commercial CommonInterest + PropertySubType.

| # | Display Label | Form Value | RESO CommonInterest | RESO PropertySubType | RLS? |
|---|---|---|---|---|---|
| 9 | Commercial Condo | CommercialCondo | Condominium | Office / Retail | YES |
| 10 | Commercial Co-op | CommercialCoop | StockCooperative | Office / Retail | YES |
| 11 | Commercial Condop | CommercialCondop | Condop | Office / Retail | YES |

> **Note:** These are commercial UNITS within residential buildings that have a condo/co-op/condop structure. They follow the same RLS rules as residential units.

### 3.3 Commercial Property Types — Non-RLS Feed Only (WWW Only)

These have **NO valid RESO PropertyType mapping** and CANNOT be distributed via RLS.

| # | Display Label | Form Value | Distribution | Notes |
|---|---|---|---|---|
| 12 | Office (Standalone) | Office | WWW ONLY | Not a unit in a managed building |
| 13 | Professional Office | ProfessionalOffice | WWW ONLY | |
| 14 | Medical Office | MedicalOffice | WWW ONLY | |
| 15 | Dental Office | DentalOffice | WWW ONLY | |
| 16 | Flexible Space | FlexibleSpace | WWW ONLY | |
| 17 | Retail (Standalone) | Retail | WWW ONLY | Not a unit in a managed building |
| 18 | Restaurant | Restaurant | WWW ONLY | |
| 19 | Grocery | Grocery | WWW ONLY | |
| 20 | Showroom | Showroom | WWW ONLY | |
| 21 | Strip Mall | StripMall | WWW ONLY | |
| 22 | Industrial | Industrial | WWW ONLY | |
| 23 | Warehouse | Warehouse | WWW ONLY | |
| 24 | Manufacturing | Manufacturing | WWW ONLY | |
| 25 | Distribution | Distribution | WWW ONLY | |
| 26 | Storage | Storage | WWW ONLY | |
| 27 | Mixed Use (Commercial) | MixedUseComm | WWW ONLY | Standalone commercial mixed-use |
| 28 | Live/Work | LiveWork | WWW ONLY | |
| 29 | Investment | Investment | WWW ONLY | |
| 30 | Institutional | Institutional | WWW ONLY | |
| 31 | Special Use | SpecialUse | WWW ONLY | |
| 32 | Whole Building | WholeBuilding | WWW ONLY | |
| 33 | Land Only (Commercial) | LandOnly | WWW ONLY | Commercial-only land parcel |
| 34 | Hotel/Motel | HotelMotel | WWW ONLY | |
| 35 | B&B | BnB | WWW ONLY | |

### 3.4 Dropdown-Ready Format (for Frontend Comparison)

```
── Residential (RLS Eligible) ──────────────────
   Condo
   Co-op
   Condop
   Townhouse
   Single Family
   Multi-Family
   Mixed Use
   Land

── Commercial Units (RLS Eligible) ─────────────
   Commercial Condo (Office/Retail Unit)
   Commercial Co-op (Office/Retail Unit)
   Commercial Condop (Office/Retail Unit)

── Commercial (Non-RLS / WWW Only) ─────────────
   ⚠ NOT distributed to RLS/IDX/VOW

   OFFICE
   · Office (Standalone)
   · Professional Office
   · Medical Office
   · Dental Office
   · Flexible Space

   RETAIL
   · Retail (Standalone)
   · Restaurant
   · Grocery
   · Showroom
   · Strip Mall

   INDUSTRIAL & STORAGE
   · Industrial
   · Warehouse
   · Manufacturing
   · Distribution
   · Storage

   MIXED & SPECIAL USE
   · Mixed Use (Commercial)
   · Live/Work
   · Investment
   · Institutional
   · Special Use

   WHOLE PROPERTY
   · Whole Building
   · Land Only (Commercial)
   · Hotel/Motel
   · B&B
```

---

## STEP 4 — FIELD VISIBILITY MATRIX (FRONTEND vs BACKEND)

### 4.1 Legend

| Visibility Level | Code | Description | Who Can See |
|---|---|---|---|
| **Public Searchable** | PUB-S | Appears in public search filters AND results | Everyone (website visitors) |
| **Public Display Only** | PUB-D | Shown on listing detail page but NOT a search filter | Everyone (listing page visitors) |
| **Internal Only** | INT | Backend CRM only, never shown publicly | Broker/Agent (CRM users) |
| **RLS Participant Only** | RLS-P | Shared on RLS but NOT on public websites | Licensed REBNY Participants |
| **In-House Only** | HOUSE | Company-only, not shared externally at all | Mallan Real Estate staff only |
| **NOT ALLOWED** | BLOCKED | MUST NOT appear in this context | — |

### 4.2 Tab 1: Listing Information / Essentials

| Field | ID | Front-End Search | Front-End Display | Back-End CRM | Visibility | Why |
|---|---|---|---|---|---|---|
| Updating Company | saleUpdatingCompany | BLOCKED | BLOCKED | YES | INT | Internal brokerage field |
| Updating Agent | saleUpdatingAgent | BLOCKED | BLOCKED | YES | INT | Internal agent assignment |
| CoBroke Agreement Type | saleCoBrokeAgreementType | BLOCKED | BLOCKED | YES | RLS-P | RLS participants see via feed |
| **Property Type** | salePropertyType | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | Core search filter |
| Building Status | saleBuildingStatus | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | New Dev/Resale/Sponsor filter |
| Listing Type | saleListingType | BLOCKED | BLOCKED | YES | INT | Exclusive/OptOut/Participant—internal |
| Direct Deal | saleDirectDeal | BLOCKED | BLOCKED | YES | INT | Internal broker flag |
| Date Listed | saleDateListed | BLOCKED | **ALLOWED** | YES | PUB-D | DOM calculation, display only |
| Exclusive Start Date | saleExclusiveStart | BLOCKED | BLOCKED | YES | INT | Contract date, confidential |
| Exclusive Expires | saleExclusiveExpires | BLOCKED | BLOCKED | YES | INT | UCBA: Hidden field (Exhibit A) |
| First Date to Co-Broke | saleFirstCoBroke | BLOCKED | BLOCKED | YES | INT | Internal scheduling |
| Off Market Date | saleOffMarketDate | BLOCKED | BLOCKED | YES | INT | Internal tracking |
| Contract Signed Date | saleContractSignedDate | BLOCKED | BLOCKED | YES | RLS-P | RLS feed only (pending status) |
| **Status** | saleStatus | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | Active/ComingSoon/Sold filter |
| **Price** | saleListPrice | **ALLOWED (filter + range)** | **ALLOWED** | YES | PUB-S | Core search filter |
| Price Per Sq Ft | — | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | Calculated, searchable |
| Coming Soon Date | — | BLOCKED | **ALLOWED** | YES | PUB-D | Display "No showings until [date]" |
| Commercial Ownership | saleCommercialOwnership | BLOCKED | **ALLOWED** | YES | PUB-D | Display only for commercial units |
| Commercial Subtypes | saleCommSubtype | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Business Types | saleBusinessType | BLOCKED | **ALLOWED** | YES | PUB-D | Display only (WWW-only listings) |
| Tenant Config | saleTenantConfig | BLOCKED | **ALLOWED** | YES | PUB-D | Display only (WWW-only) |

### 4.3 Tab 1: Listing Description (Sub-tab 1.2)

| Field | ID | Front-End Search | Front-End Display | Back-End CRM | Visibility | Why |
|---|---|---|---|---|---|---|
| **Listing Description** | saleDescription | BLOCKED | **ALLOWED** | YES | PUB-D | Public marketing text |
| Web Display Address | saleWebDisplayAddress | BLOCKED | BLOCKED | YES | INT | Controls HOW address displays |
| Internet Entire Listing Display | saleInternetEntireListingDisplayYN | BLOCKED | BLOCKED | YES | INT | Gate: if False, hide entire listing |
| Internet Address Display | saleInternetAddressDisplayYN | BLOCKED | BLOCKED | YES | INT | Gate: if False, hide address |
| Web Headline | saleWebHeadline | BLOCKED | **ALLOWED** | YES | PUB-D | Public headline |
| Listing URL | saleListingUrl | BLOCKED | **ALLOWED** | YES | PUB-D | Link to listing |
| Broker Notes | — | BLOCKED | BLOCKED | YES | RLS-P | Agent-to-agent only |

### 4.4 Tab 1: Contacts (Sub-tab 1.3)

| Field | ID | Front-End Search | Front-End Display | Back-End CRM | Visibility | Why |
|---|---|---|---|---|---|---|
| Listing Agent Name | — | BLOCKED | **ALLOWED** | YES | PUB-D | Attribution required |
| Listing Agent Phone | — | BLOCKED | **ALLOWED** | YES | PUB-D | Contact info |
| Listing Agent Email | — | BLOCKED | **ALLOWED** | YES | PUB-D | Contact info |
| Listing Office Name | — | BLOCKED | **ALLOWED** | YES | PUB-D | Attribution required (IDX/VOW) |
| Co-Listing Agent | — | BLOCKED | BLOCKED | YES | RLS-P | RLS only |
| Buyer Agent (Closed) | — | BLOCKED | BLOCKED | YES | RLS-P | Closed transactions only |
| Owner Name | — | BLOCKED | BLOCKED | YES | INT | NEVER display publicly |
| Owner Phone | — | BLOCKED | BLOCKED | YES | INT | NEVER display publicly |
| Owner Email | — | BLOCKED | BLOCKED | YES | INT | NEVER display publicly |

### 4.5 Tab 2: Unit Info / Essentials

| Field | ID | Front-End Search | Front-End Display | Back-End CRM | Visibility | Why |
|---|---|---|---|---|---|---|
| **Bedrooms** | saleBedroomsTotal | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | Core search filter |
| **Bathrooms** | saleBathroomsFull | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | Core search filter |
| Half Baths | saleBathroomsHalf | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| **Total Rooms** | saleTotalRooms | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | Search filter |
| **Interior Sq Ft** | saleInteriorSqFt | **ALLOWED (filter + range)** | **ALLOWED** | YES | PUB-S | Search filter |
| Exterior Sq Ft | saleExteriorSqFt | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Floor Number | — | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Unit Number | saleUnitNumber | BLOCKED | **ALLOWED** | YES | PUB-D | Display (if address display allowed) |
| Unit Shares (Co-op) | — | BLOCKED | **ALLOWED** | YES | PUB-D | Display for Co-op/Condop |
| Unit Sq Ft (Co-op) | — | BLOCKED | **ALLOWED** | YES | PUB-D | Display for Co-op/Condop |
| Maintenance/Common Charges | saleAssociationFee | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | Search filter |
| Tax Monthly (Condo) | saleTaxMonthlyAmount | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Flip Tax | saleFlipTax | BLOCKED | **ALLOWED** | YES | PUB-D | Display for Condo/Co-op/Condop |
| Max Financing % | saleMaxFinancingPercent | BLOCKED | **ALLOWED** | YES | PUB-D | Display for managed types |
| Living Area (Condo) | saleLivingArea | BLOCKED | **ALLOWED** | YES | PUB-D | Display for Condo |
| % Common Elements (Condo) | salePercentOfCommonElements | BLOCKED | BLOCKED | YES | RLS-P | RLS data, not public display |
| Property Condition | salePropertyCondition | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Concessions | — | BLOCKED | BLOCKED | YES | RLS-P | NEVER display amounts publicly |
| Tax Deduction | — | BLOCKED | **ALLOWED** | YES | PUB-D | Co-op/Condo/Condop |
| Guarantors | saleGuarantors | BLOCKED | BLOCKED | YES | INT | Internal policy |

### 4.6 Tab 2: Features (Sub-tab 2.3)

| Field | ID | Front-End Search | Front-End Display | Back-End CRM | Visibility | Why |
|---|---|---|---|---|---|---|
| Laundry Features | — | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | W/D In-Unit popular filter |
| Outdoor Space | — | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | Terrace/Balcony filter |
| Doorman/Elevator | — | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | Building amenity filter |
| Pets Allowed | — | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | Pet policy filter |
| Parking | — | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | Parking filter |
| Accessibility Features | — | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| All other features/amenities | — | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |

### 4.7 Tab 3: Townhouse/Building Info

| Field | ID | Front-End Search | Front-End Display | Back-End CRM | Visibility | Why |
|---|---|---|---|---|---|---|
| Lot Size | saleTHLotSize | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | TH/SF search filter |
| Lot Dimensions | saleTHLotDimensions | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Building Area Total | saleTHBuildingArea | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Zoning | — | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Basement | — | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Parking Type | — | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Land Lease | — | BLOCKED | BLOCKED | YES | INT | Internal only |
| Setup Sheet (Description) | — | BLOCKED | BLOCKED | YES | INT | Agent notes |
| Setup Sheet (Layout) | — | BLOCKED | BLOCKED | YES | INT | Agent notes |
| Setup Sheet (Financing) | — | BLOCKED | BLOCKED | YES | INT | Agent notes |
| Setup Sheet (Notes) | — | BLOCKED | BLOCKED | YES | INT | Agent notes |
| NOI | — | BLOCKED | BLOCKED | YES | INT | Investment analysis |
| Cap Rate | — | BLOCKED | BLOCKED | YES | INT | Investment analysis |
| Income/Expense Grid | — | BLOCKED | BLOCKED | YES | INT | Financial details |

### 4.8 Tab 4: Listing Distribution

| Field | ID | Front-End Search | Front-End Display | Back-End CRM | Visibility | Why |
|---|---|---|---|---|---|---|
| IDX Distribution | saleDist_IDX | BLOCKED | BLOCKED | YES | INT | Distribution control |
| Listhub | saleDist_Listhub | BLOCKED | BLOCKED | YES | INT | Distribution control |
| NY MLS | saleDist_NYMLS | BLOCKED | BLOCKED | YES | INT | Distribution control |
| Realtor | saleDist_Realtor | BLOCKED | BLOCKED | YES | INT | Distribution control |
| RPeXchange | saleDist_RPX | BLOCKED | BLOCKED | YES | INT | Distribution control |
| WWW | saleDist_WWW | BLOCKED | BLOCKED | YES | INT | Distribution control |
| RLS Participants | saleDist_RLS | BLOCKED | BLOCKED | YES | INT | Distribution control |
| VOW Opt-Out | saleVOWOptOutYN | BLOCKED | BLOCKED | YES | INT | Distribution control |
| Syndication Opt-Out | saleSyndicationOptOutYN | BLOCKED | BLOCKED | YES | INT | Distribution control |
| StreetEasy Manual | — | BLOCKED | BLOCKED | YES | INT | Manual upload, not RLS |

> **ALL distribution controls are Internal Only.** They are NEVER displayed on the frontend. They control backend distribution logic only.

### 4.9 Building Modal Fields

| Field | Front-End Search | Front-End Display | Back-End CRM | Visibility | Why |
|---|---|---|---|---|---|
| **Address** | **ALLOWED (search)** | **ALLOWED** | YES | PUB-S | Core search (if InternetAddressDisplayYN=True) |
| **Neighborhood** | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | Core search filter |
| **Borough** | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | Core search filter |
| Zip Code | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | Search filter |
| Year Built | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | Search filter |
| Total Units | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Stories | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Elevator | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | Building amenity filter |
| Doorman | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | Building amenity filter |
| Building Pet Policy | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | Building-level policy |
| Tax Block/Lot | BLOCKED | BLOCKED | YES | INT | Internal identifier |
| Building Name | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Architect | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Builder/Developer | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Management Company | BLOCKED | BLOCKED | YES | INT | Internal |
| Board Approval Required | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Board Interview | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Meet and Greet | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Board Application | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| First Right of Refusal | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Film Location | BLOCKED | BLOCKED | YES | INT | Internal |
| Live/Work Allowed | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Certificate of Occupancy | BLOCKED | BLOCKED | YES | INT | Internal |
| Tax Abatement (Y/N) | **ALLOWED (filter)** | **ALLOWED** | YES | PUB-S | Valuable search filter |
| Tax Abatement Expiry | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Association Fee Frequency | BLOCKED | **ALLOWED** | YES | PUB-D | Display only |
| Capital Reserves | BLOCKED | BLOCKED | YES | INT | Financial, internal |

### 4.10 Fields That Must NEVER Appear on Frontend

These fields are BLOCKED from all public display per UCBA + REBNY rules:

| Field | Reason | UCBA Reference |
|---|---|---|
| **Owner Name** | Confidential until after closing | Art. III, Sec. 2(C) |
| **Owner Phone/Email** | Confidential | Art. III, Sec. 2(C) |
| **Compensation/Commission** | RLS does not display compensation | Art. IV, Sec. 2 |
| **Concession Amounts** | Call listing agent | Art. I, Sec. 5(E) |
| **Exclusive Expiration Date** | UCBA: Hidden field | Exhibit A |
| **Internal Broker Notes** | Agent-to-agent only | Art. VIII, Sec. 2 |
| **Seller/Buyer Identity (pre-close)** | Until after closed | Art. III, Sec. 2(C) |
| **Listing Type (Opt-Out/Part.Only)** | Internal classification | — |
| **Distribution Controls** | Internal only | — |
| **Setup Sheet** | Agent notes | — |
| **Income/Expense Details** | Investment data | — |
| **NOI / Cap Rate** | Investment analysis | — |
| **Off-Market Date** | Internal tracking | — |

---

## STEP 5 — LISTING STATUS + MARKETING RULES AUDIT

### 5.1 Status Values in Current Sale Form

The `saleStatus` dropdown contains these values:

| Status | Form Value | RESO Mapping |
|---|---|---|
| Draft | Draft | N/A (internal) |
| Future | Future | N/A (internal) |
| Coming Soon | ComingSoon | ComingSoon |
| Active | Active | Active |
| Back On Market | BackOnMarket | Active (with BackOnMarketDate) |
| Offer Out | OfferOut | Active (internal sub-status) |
| Offer Thru Us | OfferThruUs | Active (internal sub-status) |
| Offer Accepted | OfferAccepted | Pending |
| OA Thru Us | OAThruUs | Pending (internal sub-status) |
| Contract Out | ContractOut | Pending |
| CO Thru Us | COThruUs | Pending (internal sub-status) |
| Contract Signed | ContractSigned | Pending |
| CS Thru Us | ContractSignedThruUs | Pending (internal sub-status) |
| Board Approved | BoardApproved | Pending (internal sub-status) |
| Sold | Sold | Closed |
| Sold Thru Us | SoldThruUs | Closed (internal sub-status) |
| Perm Off Market | PermOffMarket | Withdrawn or Cancelled |
| Temp Off Market | TempOffMarket | TemporarilyOffMarket |
| Expired | Expired | Expired |

**Missing from form:** Withdrawn, Cancelled (as separate statuses)

### 5.2 Listing Type Marketing Rules — Section by Section

#### A) EXCLUSIVE (saleListingType = "Exclusive")

| Question | Answer | Rule Source |
|---|---|---|
| Can it appear on mallan.nyc (WWW)? | **YES** | Standard public listing |
| Can it appear on RLS? | **YES** — MUST be submitted simultaneously with any public display | Art. I, Sec. 5 |
| Can it be displayed via IDX? | **YES** (unless IDXOptOutYN=True) | Art. III, Sec. 2(C) |
| Can it be displayed via VOW? | **YES** (when activated) | — |
| Can it be emailed/marketed publicly? | **YES** — but listing must be on RLS first | Art. I, Sec. 5 |
| Can it be syndicated to portals? | **YES** (StreetEasy, Realtor, Zillow etc.) | — |
| Required disclosures | REBNY RLS attribution on IDX/VOW; "Commissions fully negotiable" in agreements | Art. I, Sec. 17; Art. III, Sec. 2(C) |
| Distribution Tab behavior | All channels enabled by default | — |

**Form Tab Behavior:**
- Tab 1 Essentials: All fields editable
- Tab 1 Description: No restrictions
- Tab 1 Contacts: Standard
- Tab 1 Open Houses: Enabled (unless Coming Soon)
- Tab 2: All fields
- Tab 3: Conditional on property type
- Tab 4 Distribution: All channels available, IDX/Listhub/NYMLS/Realtor default ON

#### B) IN-HOUSE (saleListingType = "House")

| Question | Answer | Rule Source |
|---|---|---|
| Can it appear on mallan.nyc (WWW)? | **YES** — company exclusive, but can be displayed | Internal policy |
| Can it appear on RLS? | **YES** — still an Exclusive listing, must submit to RLS per UCBA | Art. I, Sec. 5 |
| Can it be displayed via IDX? | **YES** | — |
| Can it be emailed/marketed publicly? | **YES** — but must be on RLS simultaneously | Art. I, Sec. 5 |
| Internal handling | Mallan Real Estate handles both sides internally | — |
| Distribution Tab behavior | Same as Exclusive (all channels available) | — |

> **IMPORTANT:** "In-House" is NOT the same as "Owner Opt-Out" or "Participant Only." In-House is a company workflow designation — the listing is still Exclusive and MUST go on RLS per UCBA.

**Form Tab Behavior:** Same as Exclusive.

#### C) CO-EXCLUSIVE (saleListingType = "Co-Exclusive")

| Question | Answer | Rule Source |
|---|---|---|
| Can it appear on mallan.nyc (WWW)? | **YES** | — |
| Can it appear on RLS? | **YES** — both co-exclusive brokers must be listed | Art. II, Sec. 14 |
| Can it be displayed via IDX? | **YES** | — |
| Can it be emailed/marketed publicly? | **YES** — coordinate with co-exclusive broker | Art. II, Sec. 14 |
| Special requirements | Both co-exclusive brokers included in listing; coordinate communication/offers | Art. II, Sec. 14 |
| Distribution Tab behavior | All channels available | — |

**Form Tab Behavior:** Same as Exclusive + requires co-listing agent info in Contacts sub-tab.

#### D) OWNER OPT-OUT (saleListingType = "OwnerOptOut")

| Question | Answer | Rule Source |
|---|---|---|
| Can it appear on mallan.nyc (WWW)? | **YES** — WWW stays enabled | `handleSaleListingTypeChange()` keeps WWW ON |
| Can it appear on RLS? | **NO** — owner has elected not to share | Art. I, Sec. 5(A) |
| Can it be displayed via IDX? | **NO** — IDX disabled | Art. I, Sec. 5(A) |
| Can it be displayed via VOW? | **NO** — VOW opt-out forced | Art. I, Sec. 5(A) |
| Can it be emailed/marketed publicly? | **NO** — NO public dissemination whatsoever | Art. I, Sec. 5(A) |
| Exception: personal 1:1 comms? | **YES** — non-automated phone calls and one-to-one personal emails to Participants are NOT considered public dissemination | Art. I, Sec. 5(A) |
| Can it be shared with RLS Participants? | **YES** — via 1:1 comms only (RLS Participants channel stays ON) | Art. I, Sec. 5(A) |
| Required forms | Signed Owner Opt-Out Form (Exhibit B) within 48 hours | Art. I, Sec. 5(A) |
| Required disclosures | Owner acknowledges: reduced exposure, may affect offers/price, may take longer | Exhibit B |
| Violation for advertising | **INCURABLE VIOLATION** — $250 first, $500 subsequent | Art. XI (Incurable) |
| Distribution Tab behavior | IDX=OFF, Listhub=OFF, NYMLS=OFF, Realtor=OFF, RPX=OFF (all disabled). WWW=ON, RLS Participants=ON (enabled). | `handleSaleListingTypeChange()` |

**Form Tab Behavior:**
- Tab 1 Essentials: Warning box displayed with opt-out consequences
- Tab 1 Description: Normal (for internal use)
- Tab 1 Contacts: Standard
- Tab 1 Open Houses: Enabled (private showings allowed, no public advertising of them)
- Tab 4 Distribution: IDX/Listhub/NYMLS/Realtor/RPX all disabled and unchecked; WWW and RLS Participants remain on

#### E) PARTICIPANT ONLY (saleListingType = "ParticipantOnly")

| Question | Answer | Rule Source |
|---|---|---|
| Can it appear on mallan.nyc (WWW)? | **YES** — WWW stays enabled | `handleSaleListingTypeChange()` keeps WWW ON |
| Can it appear on RLS? | **YES** — shared on RLS for authorized Participant view only | Definition (W) |
| Can it be displayed via IDX? | **NO** — not for public display | Definition (W) |
| Can it be displayed via VOW? | **NO** — not for consumer display | — |
| Can it be emailed/marketed publicly? | **NO** — no public dissemination | Definition (W) |
| Who can see it? | Only licensed REBNY RLS Participants | Definition (W) |
| DOM accrual? | **NO** — does not accrue DOM | Art. I, Sec. 11 |
| Distribution Tab behavior | Same cascade as Owner Opt-Out | `handleSaleListingTypeChange()` |

**Form Tab Behavior:** Same as Owner Opt-Out (same cascade logic in the code).

#### F) COMING SOON STATUS (saleStatus = "ComingSoon")

| Question | Answer | Rule Source |
|---|---|---|
| Can it appear on mallan.nyc (WWW)? | **YES** — with required badge | Art. I, Sec. 16(C) |
| Can it appear on RLS? | **YES** — submitted to RLS | Art. I, Sec. 16 |
| Can it be displayed via IDX? | **YES** — with Coming Soon badge | Art. I, Sec. 16(C) |
| Can there be showings? | **NO** — absolutely none, not even to own clients | Art. I, Sec. 16(B) |
| Can there be open houses? | **NO** — including broker tours | Art. I, Sec. 16(D) |
| Can there be negotiations? | **NO** — no negotiations or counteroffers until Active | Art. I, Sec. 16(E) |
| Can appointments be scheduled? | **YES** — but cannot show until Active | Art. I, Sec. 16(F) |
| Required display text | "Coming Soon. No Showings or Open House until [Start Showing Date]" | Art. I, Sec. 16(C) |
| Max duration | **14 calendar days** from RLS submission | Art. I, Sec. 16(A) |
| DOM accrual? | **NO** | Art. I, Sec. 11 |
| One-time use? | **YES** — once per address/owner (unless off-market 60+ days) | Art. I, Sec. 16(I) |
| Sales only? | **YES** — NOT rentals, NOT new developments | Art. I, Sec. 16(A) |
| Required forms | Coming Soon Owner Authorization (Exhibit G) | Art. I, Sec. 16 |
| Showing Start Date changeable? | **NO** | Art. I, Sec. 16(L) |

**Form Tab Behavior:**
- Tab 1 Essentials: Status = ComingSoon, triggers `handleSaleComingSoon()`
- Tab 1 Open Houses (Sub-tab 1.4): **DISABLED** — tab grayed out with REBNY message
- Tab 4 Distribution: Normal (Coming Soon IS shared on RLS)

### 5.3 NON-RLS COMMERCIAL Listing Status Rules

For listings in the **Non-RLS / WWW Only** commercial section, status rules are DIFFERENT because these never touch the RLS:

| Question | Answer |
|---|---|
| Can it appear on mallan.nyc (WWW)? | **YES** — this is the ONLY distribution channel |
| Can it appear on RLS? | **NO** — no valid RESO PropertyType |
| Can it be displayed via IDX? | **NO** |
| Can it be emailed/marketed publicly? | **YES** — UCBA does not govern non-RLS listings |
| Can it use "Off-Market" language? | **YES** — UCBA prohibition only applies to Exclusive Listings on RLS |
| Are Fair Housing rules required? | **YES** — Fair Housing Act applies to ALL real estate advertising regardless of RLS |
| Can it be Coming Soon? | **NO** — Coming Soon is an RLS status only |
| Required disclosures | Fair Housing, NY DOS advertising rules, brokerage identification |
| Distribution Tab behavior | **ALL RLS channels auto-disabled.** Only WWW checkbox available. |

### 5.4 Status-to-Distribution Behavior Matrix

| Status | WWW | RLS | IDX | VOW | Listhub | NYMLS | Realtor | RPX | StreetEasy |
|---|---|---|---|---|---|---|---|---|---|
| **Draft** | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| **Future** | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| **Coming Soon** | YES | YES | YES* | NO | YES | YES | YES | — | Manual |
| **Active** | YES | YES | YES | YES** | YES | YES | YES | — | Manual |
| **Offer Out/Accepted** | YES | YES | YES | YES** | YES | YES | YES | — | — |
| **Contract Signed** | YES | YES | YES | YES** | YES | YES | YES | — | — |
| **Board Approved** | YES | YES | YES | YES** | YES | YES | YES | — | — |
| **Sold** | Remove/mark in 24hrs | Update in 24hrs | Remove in 24hrs | Remove | Remove | Remove | Remove | — | Remove |
| **Temp Off Market** | Remove | Temp Off Market | Remove | Remove | Remove | Remove | Remove | — | Remove |
| **Perm Off Market** | Remove | Withdrawn/Cancelled | Remove | Remove | Remove | Remove | Remove | — | Remove |
| **Expired** | Remove | Expired | Remove | Remove | Remove | Remove | Remove | — | Remove |
| **Owner Opt-Out** | YES | NO | NO | NO | NO | NO | NO | NO | NO |
| **Participant Only** | YES | YES (P.O.) | NO | NO | NO | NO | NO | NO | NO |
| **Non-RLS Commercial** | YES | NO | NO | NO | NO | NO | NO | NO | Manual |

\* Coming Soon with "Coming Soon" badge required
\** VOW not yet activated — currently disabled

---

## SUMMARY OF FINDINGS

### Critical Blockers (Must Fix Before Production)

| # | Issue | Impact | Priority |
|---|---|---|---|
| 1 | **No text scanners** on description fields (agent info, off-market, compensation, Fair Housing) | UCBA violation risk — $250-$10K+ fines | CRITICAL |
| 2 | **Commercial section not split** into RLS-eligible vs non-RLS | Commercial units could be incorrectly submitted to RLS (or RLS-eligible ones held back) | CRITICAL |
| 3 | **No auto-disable of RLS channels** when Non-RLS commercial is selected | Agent could accidentally submit non-RLS commercial to RLS | CRITICAL |
| 4 | **Missing Concessions field** (Exhibit A mandatory) | Data quality violation — $250 fine escalating | HIGH |
| 5 | **Missing First Showing Date** (Exhibit A mandatory) | Data quality violation | HIGH |
| 6 | **Missing Size Dimensions** (Building/Townhouse) | Data quality violation | HIGH |
| 7 | **Missing Total Legal Rooms** (Building/Townhouse) | Data quality violation | HIGH |
| 8 | **No simultaneous RLS submission enforcement** | UCBA violation risk | HIGH |
| 9 | **No Owner Opt-Out form upload** field | Must submit Exhibit B within 48hrs | HIGH |
| 10 | **No commission negotiability disclosure** checkbox | Art. I, Sec. 17 requirement | MEDIUM |

### What's Working Well

- Listing Type radio group correctly limits to Exclusive types (no Open/FSBO)
- Owner Opt-Out and Participant Only cascade logic correctly disables distribution channels
- Coming Soon correctly disables Open Houses tab
- CoBroke Agreement Type present with correct options
- Property Type radio group covers all residential RESO types
- Building Modal captures most Exhibit A mandatory building fields
- Validation system exists (validateSaleTab + validateAndNextSaleTab)
- 6-tab structure is well-organized

---

## PLANNED CHANGES (PENDING YOUR APPROVAL)

Before I make ANY edits to the mockup file, here is what I intend to change:

### Change 1: Split Commercial Section

**Current:** Single "Commercial" collapsible section with all types lumped together.

**Proposed:**
1. Move CommercialCondo, CommercialCoop, CommercialCondop into the main Property Type radio group (below Land, with a "Commercial Units (RLS)" label)
2. Keep the remaining commercial types in the collapsible section, re-labeled as **"Commercial — Non-RLS Feed Only (WWW Only)"**
3. Add a clear warning banner: "These listings CANNOT be shared via REBNY RLS. They will appear ONLY on mallan.nyc (WWW). No IDX, no VOW, no syndication."
4. Add JS logic: when Non-RLS commercial is selected, auto-disable ALL distribution channels except WWW

### Change 2: Add JS cascade for Non-RLS Commercial

When `salePropertyType=Commercial` AND ownership is WholeBuilding or LandOnly (or any non-condo/coop/condop), auto-disable:
- IDX, Listhub, NYMLS, Realtor, RPX, RLS Participants, VOW, Syndication
- Keep ONLY WWW enabled

### Change 3: No other changes

I will NOT change any other part of the form in this pass. The text scanners, missing fields, and other issues identified above are documented but will be addressed separately.

**Awaiting your confirmation before proceeding with edits.**
