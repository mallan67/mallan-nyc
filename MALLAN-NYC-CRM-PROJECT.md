# MALLAN NYC CRM - Master Project Document
## Ultra-Luxury Real Estate CRM Platform

> **Compliance-First · Fast · Scalable**

| | |
|---|---|
| **Status** | Active Development |
| **Stage** | **Live Production** (Next.js 16.1.6 on Vercel, real Trestle/IDX data) |
| **Jurisdiction** | New York State / NYC |
| **Policies** | NY DOS Advertising · REBNY RLS Display Rules · Fair Housing · TCPA/CTIA · CAN-SPAM · NY SHIELD · WCAG 2.1 AA |

---

## PRODUCTION STATUS

> **This system is LIVE in production at mallan.nyc on Vercel.**
>
> The platform includes a Next.js App Router frontend, 169 API route files (221 HTTP handlers), PostgreSQL on Neon (Prisma ORM, 42 models), Trestle/IDX integration, cookie-based auth with RBAC, server-side compliance enforcement, and audit logging. See CLAUDE.md for full architecture details.

---

## WHAT THIS PRODUCT IS

Mallan NYC is a **compliance-first New York brokerage platform** designed to support public listing search, lawful lead capture, and internal brokerage operations. The system prioritizes:

- **Regulatory Safety** - Full compliance with REBNY RLS, NY DOS, Fair Housing
- **Performance** - Core Web Vitals optimization
- **Accessibility** - WCAG 2.1 AA compliance
- **Scalability** - Clean architecture without fragmentation

This repository is the **single source of truth** for the Mallan NYC brokerage platform.

---

## 🚨 COMPLIANCE & LEGAL REQUIREMENTS (READ FIRST)

> **This repository handles licensed MLS / IDX data.**
>
> All contributors, contractors, automations, and AI systems interacting with this codebase must comply with the rules below.
>
> ⚠️ **Violations may expose the brokerage to immediate suspension and liquidated damages up to $40,000.**

### 📌 MLS / IDX DATA COMPLIANCE (REBNY RLS)

#### Overview
This project integrates **REBNY Residential Listing Service (RLS) IDX data** under a broker-direct license held by **Mallan Real Estate Inc.** All use of MLS/IDX data must comply with:

- REBNY RLS Rules
- Cotality Standards
- Fair Housing Act
- New York State Real Estate Advertising Law

**Non-compliance exposes the brokerage to immediate suspension and liquidated damages up to $40,000.**

#### ✅ Allowed Use (REBNY Confirmed 2026-03-27)
- MLS/IDX data may be accessed only via **authorized server-side connections** using credentials issued through Cotality/Trestle (formerly CoreLogic)
- IDX data may be used for: **(1) public website listing display, (2) internal backend dashboard with client management, and (3) reporting** — confirmed by REBNY (Michaela Parker, mparker@rebny.com, 2026-03-27)
- IDX feed is limited to the **IDX-released field set and IDX-eligible listing inventory only** — it is NOT full-market search
- Client data stays on mallan.nyc — never passes through RealPlus or third parties
- Data may be **cached locally** for performance and compliance purposes
- Media (photos) are accessed via **approved MLS media URLs** unless otherwise authorized

#### ❌ Prohibited Use (STRICT)
The following are **explicitly forbidden**:

| Violation | Description |
|-----------|-------------|
| ❌ | Client-side calls to MLS/IDX APIs |
| ❌ | Public or unsecured JSON endpoints containing MLS data |
| ❌ | Scraping, bulk export, or redistribution |
| ❌ | Resale, sublicensing, or syndication to third parties |
| ❌ | Use of MLS/IDX data for analytics resale or derivative datasets |

#### 🚫 AI / OpenAI / ML Restrictions
MLS/IDX data **MUST NOT** be used for:

- AI or LLM training
- Fine-tuning models
- Vector databases / embeddings
- Predictive analytics or valuation models
- Behavioral profiling tied to listing data

> Only non-MLS metadata (user behavior, UI events, internal notes) may be used for AI features unless separate written authorization is obtained from REBNY.

#### 📋 Display & Attribution Requirements
All IDX listings must:

- Display required **REBNY RLS attribution and disclaimer text**
- Include **update timestamps**
- Follow REBNY **refresh and pagination limits**
- Comply with **Fair Housing and NY advertising rules**

These requirements apply to **all environments** (production, staging, previews).

#### 🔒 Security & Audit
- MLS data access must be **logged and auditable**
- Credentials must **never be exposed in frontend code**
- REBNY reserves the right to **audit systems and access logs**
- Audit fees and suspension may apply for violations

#### ⚖️ Termination
Upon termination of license, all MLS/IDX data must be purged within the timeframe specified by REBNY RLS rules.

---

## PROJECT OVERVIEW

**Project Name:** MALLAN NYC CRM
**Type:** Full-Stack Platform (Next.js + Tailwind CSS, PostgreSQL, Trestle IDX)
**Primary File:** `public/crm/dashboard.html`
**Target Users:** Brokers, Agents, and their Clients
**Market:** NYC Ultra-Luxury Real Estate (Sales & Rentals)
**License Holder:** Mallan Real Estate Inc.

### Compliance Requirements
- Cotality Standards (Real Estate Standards Organization)
- REBNY RLS Rules (Real Estate Board of New York)
- New York State Real Estate Advertising Laws (NY DOS)
- Fair Housing Act
- TCPA/CTIA (Telephone Consumer Protection)
- CAN-SPAM Act
- NY SHIELD Act (Data Security)
- WCAG 2.1 AA (Accessibility)

### Responsive Requirements
All UI must work on: Desktop (1920px+), Laptop (1366px), Tablet (768px-1024px), Mobile (320px-767px)

---

## DATA SOURCE

**Primary Data Feed:** REBNY RLS via Cotality/Trestle (formerly CoreLogic)
**Data Dictionary:** `C:\Users\MayaAllan\Desktop\mallan nyc web\Trestle fields\Data_Migration_2025_RLS_Data_Rules.xlsx`
**Total Available Fields:** 902 IDX Plus fields across 7 resources (Property 527, CustomProperty 106, Member 72, Office 66, Media 46, PropertyUnitTypes 46, OpenHouse 39)
**Picklist Values:** 2,066 lookup values

### Extracted Data Files
| File | Contents |
|------|----------|
| `data/rebny-rls-property-fields.csv` | All 902 IDX Plus fields with descriptions |
| `data/rebny-rls-property-lookup.csv` | All 2,066 picklist values |
| `data/rebny-all-fields.txt` | Field names only (alphabetical) |

---

## CURRENT IMPLEMENTATION STATUS

### IMPLEMENTED SECTIONS

#### 1. Location Search
- [x] Borough selection (Manhattan, Brooklyn, Queens, Bronx, Staten Island)
- [x] Neighborhood tree (expandable/collapsible)
- [x] Sub-neighborhoods (e.g., UWS > Lincoln Square)
- [x] School name search
- [x] Keyword search

#### 2. Essentials Section
- [x] **Price Row:** Min/Max Price (Sale) with datalist suggestions
- [x] **Price Row:** Min/Max Rent (Rental) - toggles based on mode
- [x] **Monthly Expenses:** Min/Max with datalist
- [x] **Net Monthly Rent:** For rentals
- [x] **Mortgage Calculator:** Down Payment %, Rate, Term, Include checkbox
- [x] **Beds:** Min/Max dropdown (Studio, 1-5+)
- [x] **Baths:** Min/Max dropdown (1-4+, including half baths)
- [x] **Rooms:** Min/Max dropdown
- [x] **Sq Ft:** Min/Max text input
- [x] **$/Sq Ft:** Min/Max text input

#### 3. Investment Analysis (ROI & Cash on Cash)
- [x] Rental Income: Monthly Rent, Vacancy Rate, Annual Gross Income
- [x] Annual Expenses: Maintenance/CC, RE Taxes, Insurance, Repairs %
- [x] Cash Investment: Purchase Price, Down Payment %, Closing Costs, Renovation
- [x] Results: NOI, Cap Rate, Cash on Cash Return, Annual ROI
- [x] Filter by Minimum: Cap Rate ≥, Cash on Cash ≥, ROI ≥

#### 4. NYC Closing Costs Estimator
- [x] Transaction: Property Type, Building Status
- [x] Transfer Taxes: NYC (1.425%), NYS (0.4%), Mansion Tax
- [x] Mortgage Costs: Recording Tax, Bank Attorney, Application, Appraisal
- [x] Title & Legal: Title Insurance, Title Search, Attorney Fees, Recording
- [x] Building Fees: Board Package, Move-in Deposit, Flip Tax, Working Capital
- [x] Note: Buyer pays transfer taxes on new development

#### 5. Status (Collapsible/Expandable)
**Sale Statuses:**
- [x] Active (expanded by default): Active, Back On Market, Coming Soon, Future
- [x] Offer (collapsed): Offer Out, Offer Thru Us, Offer Accepted, Offer Accepted Thru Us
- [x] Contract (collapsed): Contract Out, Contract Out Thru Us, All Contract Signed, Contract Signed, Contract Signed Thru Us, Board Approved
- [x] Sold (collapsed): All Sold, Sold, Sold Thru Us, ACRIS Verified, Financed, No Financing, Nominal Sales, Other ACRIS
- [x] Off Market (collapsed): All Off Market, Permanently Off, Temporarily Off, Expired
- [x] Listed for Rent (separator line above)

**Rental Statuses:**
- [x] Active, Lease Signed, Rented, Off Market, Expired, Future, Also For Sale

#### 6. Property Type Box
- [x] Condo
- [x] Condop
- [x] Co-op
- [x] Townhouse
- [x] Single Family
- [x] Multi-Family
- [x] Land
- [x] Commercial

#### 7. Building Status Box
- [x] Resale
- [x] New Development
- [x] Sponsor Unit
- [x] New Conversion

#### 8. Listing Activity
- [x] Listed/Updated Activity dropdown (7, 14, 30 days)
- [x] Contract Signed Date Range
- [x] Sold Date Range
- [x] Lease Signed Activity (rental)
- [x] Rented Date Range (rental)

#### 9. Price Change
- [x] Price Decrease / Price Increase checkboxes
- [x] Min/Max % change
- [x] Within Date Range

#### 10. Available Media
- [x] Photos, Floorplans, Videos, Virtual Tours

#### 11. Rental-Specific Sections (hidden for sale, shown for rent)
- [x] Listing Type: Exclusive, Co-Exclusive, Dare Alone, Limited, Open, RLS Private options
- [x] OP / Free Rent / Concessions: Owner Pays, Free Rent, OP AND Free Rent
- [x] Lease/Availability: Min/Max Lease Terms, Availability Date Range
- [x] Management Companies: Text input

#### 12. Private Outdoor Space
- [x] Balcony, Terrace, Patio, Private Roof Deck, Garden, Private Yard

#### 13. Building Amenities
**Lobby & Services:**
- [x] Doorman, 24hr Doorman, Concierge, Live-in Super, Virtual Doorman, Attended Lobby

**Common Areas:**
- [x] Gym/Fitness, Pool, Roof Deck, Common Garden, Storage, Bike Room, Children's Playroom, Laundry, Parking Garage, Elevator

**White-Glove Services (Luxury):**
- [x] Valet Parking, Private Car Service, In-Building Spa, In-Building Restaurant
- [x] Private Screening Room, Wine Storage, Cold Storage, Private Dining Room
- [x] Business Center, Pet Spa, Golf Simulator, Residents' Lounge

#### 14. Interior Features
- [x] Washer/Dryer in Unit, Dishwasher, Fireplace, High Ceilings
- [x] Hardwood Floors, Central AC, Loft, Walk-in Closet

#### 15. Luxury Amenities (Premium Section)
**Private Residence Features:**
- [x] Private Pool, Wine Cellar, Home Theater, Chef's Kitchen
- [x] Staff Quarters, Private Spa/Sauna, Private Gym, Safe Room/Panic Room
- [x] Private Garage, Private Elevator

---

## NOT YET IMPLEMENTED (TO ADD)

### HIGH PRIORITY - Search Fields

#### Views & Exposure Section
```
REBNY Fields:
- View (enum: City, Park, River, Water, Garden, Courtyard, Skyline, etc.)
- ViewYN (boolean)
- ViewRemarks (text)
- DirectionFaces (enum: N, S, E, W, NE, NW, SE, SW)
- Exposures (multi-select cardinal directions)
- FloorNumber (integer)
```

#### Financial Details Section
```
REBNY Fields:
- TaxMonthlyAmount (decimal) - Monthly RE tax for condos
- TaxAnnualAmount (decimal) - Annual RE tax
- TotalMonthlyMaintPlusTax (decimal) - Combined maintenance + tax
- MaximumFinancingPercent (decimal) - Critical for co-ops
- MaximumFinancingAmount (decimal)
- MaximumFinancingRemarks (text)
- NumberOfShares (integer) - Co-op shares
- PercentOfCommonElements (decimal) - Condo ownership %
- TaxAbatementYN (boolean)
- TaxAbatementExpirationYear (year)
- TaxAbatementComments (text)
- LandLeaseYN (boolean) - Ground rent indicator
- LandLeaseAmount (decimal)
```

#### Listing History Section
```
REBNY Fields:
- DaysOnMarket (integer) - DOM
- CumulativeDaysOnMarket (integer) - CDOM
- OriginalListPrice (decimal)
- PreviousListPrice (decimal)
- PriceChangeTimestamp (datetime)
- BackOnMarketDate (date)
- OnMarketDate (date)
- OffMarketDate (date)
```

#### Building Details Section
```
REBNY Fields:
- BuildingName (text)
- YearBuilt (year) - Range: 1700 to current+10
- YearRenovated (year)
- StoriesTotal (integer) - Building floors
- NumberOfUnitsInCommunity (integer)
- ElevatorsTotal (integer)
- ArchitecturalStyle (enum: Prewar, Art Deco, Brownstone, etc.)
- ArchitectName (text)
- BuilderName (text)
- LandmarkStatusYN (boolean)
- BuildingCondition (enum)
- CertificateOfOccupancyYN (boolean)
```

#### Pet Policy Section
```
REBNY Fields:
- PetsAllowed (enum: Yes, No, Restrictions, etc.)
- PetsAllowedComments (text)
- BuildingPetsAllowed (enum)
- BuildingPetsAllowedComments (text)
- PetDepositFee (decimal)
```

#### Unit Details Section
```
REBNY Fields:
- CeilingHeightFeet (integer)
- CeilingHeightInches (integer)
- LivingArea (decimal) - Interior sq ft
- PropertyCondition (enum: Excellent, Good, Fair, etc.)
- KitchenCondition (enum)
- BathroomCondition (enum)
- ClosetsTotal (integer)
- Levels (enum: One Level, Two Levels, etc.)
```

#### Enhanced Rental Fields
```
REBNY Fields:
- LeaseType (enum: Stabilized, Non-Stabilized) - CRITICAL!
- GuarantorsAcceptedYN (boolean)
- RentingAllowedYN (boolean) - Sublet policy
- MoveInCosts (enum multi-select)
- MoveInCostsAmountTotal (decimal)
```

### HIGH PRIORITY - Results & Management

#### Search Results Features
```
- Customizable column views (presets + custom builder)
- View modes: Grid, List, Map, Table, Financials, History
- Sort by any column
- Per-listing actions: Save, Share, Assign, Schedule, Hide
- Bulk actions: Select All, Assign to Client, Export, Create CMA
```

#### Client Assignment
```
- Quick assign panel (search clients, recent clients)
- Assignment types: Recommendation, Scheduled Showing, Saved, Offer Submitted
- Client pipeline: Recommendations → Viewed → Shown → Interested → Offers → Contract → Closed
- Per-client dashboard with search criteria
```

#### Listing Management
```
- My Listings panel (Active, Pending, Sold counts)
- Quick edit access
- Syndication status per listing
```

#### Syndication/Upload Panel
```
Destinations:
- REBNY RLS (primary)
- Trestle IDX Partners
- StreetEasy/Zillow (via RLS automatic)
- NYS MLS / OneKey MLS (optional setup)
- Direct feeds (StreetEasy, etc.)
- Company Website IDX

Privacy Options:
- InternetEntireListingDisplayYN
- IDXEntireListingDisplayYN
- InternetAddressDisplayYN
- Permissions (Private, Owner Opt-Out)
```

---

## UI/UX SPECIFICATIONS

### Color Scheme
```css
/* Luxury Gold Accent */
--luxury-gold: #B8860B;
--luxury-gold-light: #D4AF37;

/* Status Colors */
--active: #2563EB (blue-600)
--offer: #EA580C (orange-600)
--contract: #9333EA (purple-600)
--sold: #16A34A (green-600)
--off-market: #6B7280 (gray-500)

/* Backgrounds */
--investment-calc: #EFF6FF (blue-50)
--closing-costs: #F0FDF4 (green-50)
```

### Typography
```css
/* Labels */
text-xs (12px) font-semibold text-gray-700

/* Input fields */
text-sm (14px) font-medium

/* Section headers */
text-sm font-bold text-gray-700

/* Luxury premium badges */
text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded
```

### Component Patterns

**Collapsible Section:**
```html
<div class="collapsible-section">
    <div class="section-header" onclick="toggleSection(this)">
        <i class="fas fa-minus text-xs text-gray-500"></i>
        <h3 class="font-semibold">Section Title</h3>
    </div>
    <div class="section-content">
        <!-- content -->
    </div>
</div>
```

**Status Box with Expandable Items:**
```html
<div class="border border-gray-300 rounded-lg p-4 bg-white shadow-sm">
    <p class="text-sm font-bold text-gray-700 mb-3">Status</p>
    <div class="text-xs space-y-1">
        <div>
            <div class="flex items-center gap-1.5 cursor-pointer font-semibold text-blue-600"
                 onclick="this.nextElementSibling.classList.toggle('hidden')...">
                <i class="fas fa-chevron-down text-xs w-3"></i>
                <input type="checkbox" checked class="w-3 h-3">
                <span>Category Name</span>
            </div>
            <div class="ml-6 mt-1 space-y-0.5 text-gray-700">
                <!-- sub-items -->
            </div>
        </div>
    </div>
</div>
```

**Input with Datalist (Custom + Suggestions):**
```html
<input list="optionsList" type="text" placeholder="Enter or select"
       class="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium shadow-sm">
<datalist id="optionsList">
    <option value="$500,000">
    <option value="$1,000,000">
</datalist>
```

**Calculator Box:**
```html
<div class="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
    <div class="flex items-center justify-between mb-3">
        <p class="text-sm font-bold text-blue-800">
            <i class="fas fa-calculator mr-2"></i>Calculator Title
        </p>
        <label class="flex items-center gap-1.5 text-xs font-medium text-blue-700">
            <input type="checkbox" class="w-3.5 h-3.5 rounded"> Enable Filter
        </label>
    </div>
    <div class="grid grid-cols-4 gap-4 text-xs">
        <!-- calculator sections -->
    </div>
</div>
```

---

## REBNY RLS FIELD REFERENCE (Key Fields)

### Property Type & Status
| Field | Type | Values |
|-------|------|--------|
| PropertyType | enum | Residential, ResidentialLease |
| PropertySubType | enum | Apartment, Loft, Townhouse, etc. |
| CommonInterest | enum | Condominium, StockCooperative, Condop, RentalBuilding, None |
| StandardStatus | enum | Active, ComingSoon, Pending, Closed, Cancelled, Withdrawn, Expired |
| NewDevelopmentYN | boolean | |
| SponsorUnitYN | boolean | |
| NewConstructionYN | boolean | |

### Financial
| Field | Type | Description |
|-------|------|-------------|
| ListPrice | decimal | Current asking price |
| ClosePrice | decimal | Final sale/lease price |
| AssociationFee | decimal | Monthly maintenance (co-op) / common charges (condo) |
| TaxMonthlyAmount | decimal | Monthly RE tax (condos) |
| TaxAnnualAmount | decimal | Annual RE tax (townhouses/buildings) |
| TotalMonthlyMaintPlusTax | decimal | Combined maintenance + tax |
| MaximumFinancingPercent | decimal | Max financing allowed (co-ops) |
| FlipTax | text | Transfer fee (co-ops) |
| NumberOfShares | integer | Co-op shares for unit |

### Size
| Field | Type | Description |
|-------|------|-------------|
| BedroomsTotal | integer | Number of bedrooms |
| BathroomsTotal | decimal | Total bathrooms (with .5 for half) |
| RoomsTotal | integer | Total rooms |
| LivingArea | decimal | Interior square footage |
| LotSizeArea | decimal | Lot size (townhouses/land) |

### Building
| Field | Type | Description |
|-------|------|-------------|
| BuildingName | text | Building or complex name |
| YearBuilt | year | Year constructed |
| StoriesTotal | integer | Total building floors |
| ElevatorsTotal | integer | Number of elevators |
| AttendanceType | enum | Doorman type |
| ArchitecturalStyle | enum | Prewar, Art Deco, etc. |

### Views & Exposure
| Field | Type | Description |
|-------|------|-------------|
| View | enum | City, Park, Water, etc. |
| DirectionFaces | enum | N, S, E, W, etc. |
| Exposures | multi-enum | Multiple directions |
| FloorNumber | integer | Unit floor |

### Dates
| Field | Type | Description |
|-------|------|-------------|
| DaysOnMarket | integer | Current DOM |
| CumulativeDaysOnMarket | integer | Total DOM including relists |
| OnMarketDate | date | When listing went active |
| OriginalListPrice | decimal | First listed price |
| PriceChangeTimestamp | datetime | Last price change |

### Syndication
| Field | Type | Description |
|-------|------|-------------|
| SyndicateYN | boolean | Master syndication toggle |
| InternetEntireListingDisplayYN | boolean | Allow on internet |
| IDXEntireListingDisplayYN | boolean | Allow on IDX sites |
| Permissions | enum | Private, OwnerOptOut |

---

## IMPLEMENTATION PHASES

> **Phases 1-5 covered frontend UI development. Phases 6-10 (backend, database, auth, compliance, deployment) are complete and live in production.**

---

### PHASE 1: Enhanced Search Fields -- COMPLETE
- [x] Add Views & Exposure section (Enhanced: 10 view types, 8-direction exposure, floor number range)
- [x] Add Pet Policy section (Enhanced: building policy, weight limits, breed restrictions, pet deposit)
- [x] Add Financial Details section (Tax breakdown, Max Financing, Flip Tax, Tax Abatement)
- [x] Add Building Details section (Year Built/Renovated, Architectural Style, Landmark, Building Size)
- [x] Add DOM/Listing History fields (DOM range, CDOM, Price vs Original, Back on Market)
- [x] Add Unit Details (Ceiling Height, Property/Kitchen/Bath Condition, Closets, Unit Layout)
- [x] Add enhanced Rental fields (Lease Type already existed with Stabilized/Non-Stabilized, Guarantors comprehensive)

### PHASE 2: Search Results
- [ ] Create flexible results table component
- [ ] Add view mode toggles (Grid/List/Map/Table)
- [ ] Add view presets (Financial, History, Outdoor, Building)
- [ ] Add sortable columns
- [ ] Add per-listing action buttons
- [ ] Add bulk action bar

### PHASE 3: Client Management
- [ ] Create Quick Assign panel
- [ ] Build client pipeline tracker
- [ ] Add per-client search criteria display
- [ ] Create client dashboard view

### PHASE 4: Listing Management
- [ ] Create My Listings panel
- [ ] Build syndication status display
- [ ] Create Upload/Publish panel
- [ ] Add privacy options UI

### PHASE 5: Polish & Testing
- [ ] Responsive testing all breakpoints (Desktop, Laptop, Tablet, Mobile)
- [ ] Cross-browser testing (Chrome, Firefox, Safari, Edge)
- [ ] UI consistency review
- [ ] Accessibility review (WCAG 2.1 AA)
- [ ] Documentation update
- [ ] Stakeholder walkthrough and approval

---

### UI COMPLETION GATE

**Frontend UI completion checklist:**

| Requirement | Status |
|-------------|--------|
| All search fields implemented | ⬜ |
| All UI components responsive | ⬜ |
| All interactions working | ⬜ |
| All calculators functional | ⬜ |
| Cross-browser tested | ⬜ |
| Accessibility reviewed | ⬜ |
| Documentation complete | ⬜ |
| **Stakeholder Approval** | ⬜ |

---

### PRODUCTION PHASES -- COMPLETE AND LIVE

> **All production phases are complete. The system is deployed at mallan.nyc on Vercel.**

- Phase 6: Backend API Development -- COMPLETE (169 route files, 221 HTTP handlers)
- Phase 7: Database Schema & Trestle Integration -- COMPLETE (Prisma ORM, 42 models, Neon PostgreSQL)
- Phase 8: Authentication & Security -- COMPLETE (cookie-only auth, RBAC, audit logging)
- Phase 9: Compliance Audit -- COMPLETE (RLS enforcement, Fair Housing scanner, DOM tracker, portal DTO sanitizer)
- Phase 10: Production Deployment -- COMPLETE (Vercel, Cloudflare R2, 10 cron jobs)

---

## FILE STRUCTURE

```
mallan-nyc/
├── CLAUDE.md                    # Project instructions for Claude
├── MALLAN-NYC-CRM-PROJECT.md    # This document (master reference)
├── CRM-ENHANCEMENT-SPEC.md      # Detailed enhancement specifications
├── data/
│   ├── rebny-rls-property-fields.csv   # All 902 IDX Plus fields
│   ├── rebny-rls-property-lookup.csv   # All 2,066 picklist values
│   ├── rebny-all-fields.txt            # Field names only
│   └── trestle-dictionary/             # Original Trestle exports
└── scripts/                     # Any helper scripts

public/crm/
└── dashboard.html   # CRM hub (Broker Admin + Agent Admin + 4 Client Portals)
```

---

## NOTES & DECISIONS

1. **Production System** - Live on Vercel with real Trestle/IDX data, PostgreSQL, server-side enforcement, and RBAC
2. **Status sub-items** - Each main status has expandable sub-statuses
3. **Property Type order** - User specified: Condo, Condop, Co-op, Townhouse, Single Family, Multi-Family, Land, Commercial
4. **ACRIS under Sold** - ACRIS verified goes under Sold status (city records)
5. **Collapsible sections** - Use +/- icons, expanded by default for Essentials
6. **Datalist for prices** - Allow custom input with suggested values
7. **Luxury styling** - Gold accent (#B8860B) for premium features

---

*Last Updated: March 13, 2026*
