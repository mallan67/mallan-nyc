# MALLAN NYC CRM Enhancement Specification
## Comprehensive Search, Results Management & Syndication

---

## PART 1: FIELD COMPARISON - WHAT YOU HAVE vs WHAT'S AVAILABLE

### YOUR CURRENT SEARCH FIELDS

| Category | Fields You Have |
|----------|-----------------|
| **Location** | Borough, Neighborhood (tree), School, Keyword |
| **Price** | Min/Max Price (Sale), Min/Max Rent |
| **Monthly** | Min/Max Monthly Expenses, Net Monthly Rent |
| **Mortgage** | Down Payment %, Rate, Term |
| **Size** | Beds, Baths, Rooms, Sq Ft, $/Sq Ft |
| **Status** | Active, Offer, Contract, Sold, Off Market, Listed for Rent |
| **Property Type** | Condo, Condop, Co-op, Townhouse, Single Family, Multi-Family, Land, Commercial |
| **Building Status** | Resale, New Development, Sponsor Unit, New Conversion |
| **Activity** | Listed/Updated dates, Contract Signed, Sold Date, Price Change |
| **Media** | Photos, Floorplans, Videos, Virtual Tours |
| **Outdoor Space** | Balcony, Terrace, Patio, Roof Deck, Garden, Yard |
| **Building Amenities** | Doorman, Concierge, Gym, Pool, etc. |
| **Interior Features** | W/D, Dishwasher, Fireplace, High Ceilings, etc. |
| **Investment** | ROI Calculator, Cash on Cash, Cap Rate, NOI |
| **Closing Costs** | Transfer Taxes, Mortgage Costs, Title, Building Fees |
| **Rental-Specific** | Listing Type, OP/Free Rent, Lease Terms, Management Co. |

---

### MISSING HIGH-VALUE FIELDS FROM REBNY RLS (448 Total Fields)

#### CRITICAL ADDITIONS FOR POWERFUL SEARCH

**1. VIEWS & EXPOSURE (High Client Priority)**
```
- View (City, Park, River, Garden, Courtyard)
- ViewYN
- ViewRemarks
- DirectionFaces (N, S, E, W, NE, NW, SE, SW)
- Exposures (multi-select cardinal directions)
```

**2. FINANCIAL DETAILS (What Investors Need)**
```
- TaxMonthlyAmount (Monthly RE tax)
- TaxAnnualAmount (Annual RE tax)
- AssociationFee (Maintenance/Common Charges)
- AssociationFee2 (Secondary HOA)
- TotalMonthlyMaintPlusTax (Combined!)
- MaximumFinancingPercent (Critical for co-ops)
- MaximumFinancingAmount
- MaximumFinancingRemarks
- NumberOfShares (Co-op shares)
- PercentOfCommonElements (Condo %)
- FlipTax / FlipTaxType / FlipTaxRemarks
- TaxAbatementYN / TaxAbatementExpirationYear
- LandLeaseYN / LandLeaseAmount (Ground rent)
```

**3. LISTING HISTORY & DATES**
```
- DaysOnMarket (DOM - crucial!)
- CumulativeDaysOnMarket (CDOM)
- OriginalListPrice
- PreviousListPrice
- PriceChangeTimestamp
- ListingContractDate
- OnMarketDate / OnMarketTimestamp
- OffMarketDate
- BackOnMarketDate
- CloseDate / ClosePrice
- PurchaseContractDate
```

**4. BUILDING DETAILS**
```
- BuildingName
- YearBuilt
- YearRenovated
- StoriesTotal (Building floors)
- NumberOfUnitsInCommunity (Units in building)
- ElevatorsTotal
- AttendanceType (Doorman type)
- BuildingStaffType
- BuildingCondition
- BuildingFeatures
- BuildingSecurityFeatures
- BuildingLaundryFeatures
- BuildingPetsAllowed / BuildingPetsAllowedComments
- BuildingSmokeFreeYN
- GarageYN / GarageSpaces
- ArchitecturalStyle (Prewar, Art Deco, etc.)
- ArchitectName / BuilderName
- LandmarkStatusYN
```

**5. UNIT DETAILS**
```
- FloorNumber
- UnitLine
- UnitNumber
- Levels (Duplex, Triplex, etc.)
- CeilingHeightFeet / CeilingHeightInches
- LivingArea / LivingAreaSource
- ClosetsTotal
- PropertyCondition
- KitchenCondition
- BathroomCondition
- Flooring
- InteriorFeatures
- WindowFeatures
- DoorFeatures
- Heating / HeatingYN
- Cooling / CoolingYN
- FireplacesTotal / FireplaceFeatures
- LaundryFeatures (In-unit vs building)
```

**6. PET POLICY (High Demand Filter)**
```
- PetsAllowed (Yes/No/Restrictions)
- PetsAllowedComments
- BuildingPetsAllowed
- BuildingPetsAllowedComments
- PetDepositFee
```

**7. RENTAL-SPECIFIC**
```
- LeaseType (Stabilized vs Non-Stabilized!)
- MinLeaseMonths / MaxLeaseMonths
- FurnishedMinLeaseMonths / FurnishedMaxLeaseMonths
- Furnished (Yes/No/Partial)
- FurnishedListPrice
- NetMonthlyRent (Net effective)
- AvailabilityDate
- DepositAmount
- GuarantorsAcceptedYN
- RentingAllowedYN (Sublet policy)
- MoveInCosts / MoveInCostsAmountTotal
- OwnerPays / OwnerPaysRemarks
```

**8. AGENT/BROKER INFO**
```
- ListAgentFullName / ListAgentMlsId
- ListAgentEmail / ListAgentDirectPhone
- ListOfficeName / ListOfficeMlsId
- ListTeamName
- CoListAgentFullName (Co-listing agent)
- CoBrokeAgreement (REBNY co-broke type)
- ShowingInstructions
- ShowingContactPhone / ShowingContactName
- ShowingDays / ShowingStartTime / ShowingEndTime
```

**9. CONCESSIONS & COMPENSATION**
```
- Concessions (Yes/No/Call)
- ConcessionsAmount
- ConcessionsComments
- ConcessionsBuyerBrokerFee
- ConcessionsClosingCosts
- OwnerPaysPlusConcessionsYN
```

**10. LOCATION/ADDRESS**
```
- StreetNumber / StreetName / StreetSuffix
- UnitNumber
- PostalCode / PostalCodePlus4
- CityRegion (Borough)
- CountyOrParish
- SubdivisionName (Neighborhood)
- TaxBlock / TaxLot (BBL)
- CrossStreet
- Latitude / Longitude (Map)
```

---

## PART 2: SEARCH RESULTS - FLEXIBLE VIEW OPTIONS

### CUSTOMIZABLE COLUMN VIEWS

**Default Columns (Always Shown)**
- Photo Thumbnail
- Address
- Price
- Beds/Baths
- Status

**View Preset: "Financial Analysis"**
- Address | Price | Maint | Tax | Total Monthly | $/SqFt | Max Financing

**View Preset: "Days on Market"**
- Address | Price | DOM | CDOM | Original Price | Last Price Change | % Change

**View Preset: "Outdoor/Views"**
- Address | Price | Outdoor Space | Views | Exposures | Floor

**View Preset: "Building Details"**
- Address | Price | Building | Year Built | Units | Doorman | Elevator

**View Preset: "Agent Activity"**
- Address | Price | List Agent | Office | Days Listed | Open Houses | Showings

**Custom View Builder**
- User selects which columns to display
- Save custom views for quick access
- Sort by any column (asc/desc)

### RESULTS ACTIONS

**Per-Listing Actions:**
```
[Add to Search] [Remove] [Assign to Client] [Share] [Print] [Schedule Showing]
```

**Bulk Actions:**
```
[Select All] [Assign Selected to Client] [Export CSV] [Create CMA] [Email to Client]
```

---

## PART 3: CLIENT ASSIGNMENT & MANAGEMENT

### ASSIGN LISTINGS TO BUYERS/RENTERS

**Quick Assign Panel (Side Panel)**
```
+------------------------------------------+
| ASSIGN TO CLIENT                         |
+------------------------------------------+
| [Search Client...                      ] |
|                                          |
| Recent Clients:                          |
| [ ] John Smith (Buyer - $2M-3M UWS)     |
| [ ] Sarah Chen (Renter - $5K Tribeca)   |
| [ ] Michael Ross (Investor)              |
|                                          |
| [+ Create New Client]                    |
|                                          |
| Assignment Type:                         |
| ( ) Recommendation                       |
| ( ) Scheduled Showing                    |
| ( ) Saved for Later                      |
| ( ) Offer Submitted                      |
|                                          |
| Notes: [________________________]        |
|                                          |
| [ASSIGN] [ASSIGN & NOTIFY CLIENT]        |
+------------------------------------------+
```

### CLIENT LISTING TRACKER

**Per Client Dashboard:**
```
CLIENT: John Smith
Search Criteria: 2BR+ Condo, $2-3M, UWS/UES

PIPELINE:
[ ] Recommendations (12 new)
[ ] Viewed (8)
[ ] Scheduled Showings (3)
[ ] Shown (15)
[ ] Interested (4)
[ ] Offers Out (1)
[ ] Under Contract (0)
[ ] Closed (0)
[ ] Rejected (23)
```

---

## PART 4: LISTING UPLOAD & SYNDICATION

### TRESTLE SYNDICATION PARTNERS

Based on REBNY RLS Data Rules, the following syndication fields exist:

**Core Syndication Controls:**
```
- SyndicateYN - Master syndication toggle
- InternetEntireListingDisplayYN - Allow on any internet site
- InternetAddressDisplayYN - Show address online
- InternetAutomatedValuationDisplayYN - Allow AVM display
- InternetConsumerCommentYN - Allow comments/reviews
- IDXEntireListingDisplayYN - Allow on IDX sites
- ListOfficeIDXParticipationYN - Office participates in IDX
```

### UPLOAD DESTINATION OPTIONS

**Listing Upload Panel:**
```
+--------------------------------------------------+
| PUBLISH LISTING                                   |
+--------------------------------------------------+
| Destination                    Status   Action    |
|--------------------------------------------------|
| [x] REBNY RLS               Connected  [Upload]  |
| [x] Trestle IDX Partners    Connected  [Upload]  |
| [ ] StreetEasy/Zillow       Via RLS    Automatic |
| [ ] NYS MLS (HGAR)          Not Connected [Setup]|
| [ ] OneKey MLS              Not Connected [Setup]|
| [ ] Direct to StreetEasy    Connected  [Upload]  |
| [ ] Realtor.com             Via RLS    Automatic |
| [ ] Homes.com               Via RLS    Automatic |
| [ ] Company Website IDX     Connected  [Push]    |
+--------------------------------------------------+

Privacy Options:
( ) Full Internet Distribution
( ) RLS Participants Only (Private)
( ) Owner Opt-Out (No Internet)

[x] Show Address on Internet
[x] Allow Automated Valuations
[ ] Allow Consumer Comments

[PREVIEW] [PUBLISH NOW] [SCHEDULE PUBLISH]
```

### TRESTLE DIRECT FEEDS (Syndication Partners)

Trestle integrates with these syndication channels:
1. **IDX Broker** - Website feeds
2. **StreetEasy** - Direct NYC feed
3. **Zillow Group** - Zillow/Trulia/HotPads
4. **Realtor.com** - Move, Inc.
5. **Redfin** - Direct integration
6. **Homes.com** - CoStar Group
7. **Apartments.com** - CoStar Group (Rentals)
8. **RentPath** - Rent.com, Apartment Guide
9. **Facebook Marketplace** - Meta
10. **Company Websites** - Via IDX

---

## PART 5: RECOMMENDED ENHANCEMENTS

### PRIORITY 1: ADD TO SEARCH FORM

**New Section: "Views & Exposure"**
```
Views: [ ] City [ ] Park [ ] Water [ ] Garden [ ] Skyline [ ] Open
Exposure: [ ] North [ ] South [ ] East [ ] West (multi-select)
Floor: Min [___] Max [___]
```

**New Section: "Building Specifics"**
```
Year Built: [1900] - [2026]
Building Stories: Min [___] Max [___]
Units in Building: Min [___] Max [___]
Elevator: [ ] Yes [ ] No [ ] Any
Architectural Style: [Prewar ▾] (multi-select)
Landmark: [ ] Yes [ ] No [ ] Any
```

**New Section: "Pet Policy"**
```
Pets: [ ] Any Pets [ ] Dogs [ ] Cats [ ] No Pets
Weight Limit: [ ] Under 25 lbs [ ] 25-50 lbs [ ] No Limit
Breed Restrictions: [ ] Yes [ ] No
```

**New Section: "Financing & Taxes"**
```
Max Financing Required: [ ] Any [ ] 50%+ [ ] 75%+ [ ] 90%+
Tax Abatement: [ ] Yes [ ] No [ ] Expiring Soon
Ground Lease: [ ] Exclude Ground Lease
```

**Enhanced: "Listing History"**
```
Days on Market: Min [___] Max [___]
Price Changes: [ ] Reduced [ ] Increased [ ] None
Original vs Current Price: [ ] >10% below original [ ] >20% below
Back on Market: [ ] Include BOM only
```

### PRIORITY 2: SEARCH RESULTS ENHANCEMENT

**Quick Toggle View Modes:**
```
[Grid] [List] [Map] [Table] [Financials] [History]
```

**Sortable Columns (click header):**
- Price ▼
- DOM ▼
- Maint+Tax ▼
- $/SqFt ▼
- Last Updated ▼

**Inline Actions per Listing:**
```
[♥ Save] [📤 Share] [👤 Assign] [📅 Schedule] [🗑 Hide]
```

### PRIORITY 3: LISTING MANAGEMENT DASHBOARD

**My Listings Panel:**
```
+------------------------------------------+
| MY LISTINGS                    [+ New]   |
+------------------------------------------+
| Active (12) | Pending (3) | Sold (45)   |
|------------------------------------------|
| 123 Main St 4A    $2.5M    Active  [Edit]|
| 456 Park Ave 12B  $4.2M    Contract [...]|
| 789 5th Ave PH    $15M     Coming  [...]|
+------------------------------------------+
```

**Syndication Status:**
```
Listing: 123 Main St 4A

Feed              Status      Last Sync
--------------------------------------------
REBNY RLS         Live        2 min ago
StreetEasy        Live        5 min ago
Zillow            Live        1 hr ago
Company Website   Live        Instant
NYS MLS           Not Published [Publish]
```

---

## PART 6: QUICK REFERENCE - ALL 448 REBNY RLS FIELDS BY CATEGORY

### PROPERTY BASICS
BedroomsTotal, BathroomsTotal, BathroomsFull, BathroomsHalf, BathroomsPartial, RoomsTotal, LegalRoomsTotal, ClosetsTotal, Stories, Levels, FloorNumber, UnitLine, UnitNumber

### FINANCIAL
ListPrice, ClosePrice, OriginalListPrice, PreviousListPrice, AssociationFee, AssociationFee2, TaxMonthlyAmount, TaxAnnualAmount, TotalMonthlyMaintPlusTax, MaximumFinancingPercent, MaximumFinancingAmount, FlipTax, FlipTaxType, NumberOfShares, PercentOfCommonElements, CapRate, NetOperatingIncome, OperatingExpense

### SIZE & DIMENSIONS
LivingArea, BuildingAreaTotal, AboveGradeFinishedArea, BelowGradeFinishedArea, LotSizeArea, LotSizeDimensions, SizeDimensions, CeilingHeightFeet, CeilingHeightInches, PrivateOutdoorSpaceSize, FoundationArea

### DATES & TIMELINE
ListingContractDate, OnMarketDate, OffMarketDate, BackOnMarketDate, CloseDate, PurchaseContractDate, AvailabilityDate, ExpirationDate, WithdrawnDate, CancellationDate, PriceChangeTimestamp, DaysOnMarket, CumulativeDaysOnMarket

### BUILDING
BuildingName, YearBuilt, YearRenovated, StoriesTotal, NumberOfUnitsInCommunity, NumberOfUnitsTotal, ElevatorsTotal, AttendanceType, BuildingStaffType, BuildingCondition, BuildingFeatures, BuildingSecurityFeatures, BuildingAccessibilityFeatures, BuildingLaundryFeatures, BuildingPetsAllowed, BuildingSmokeFreeYN, ArchitecturalStyle, ArchitectName, BuilderName, LandmarkStatusYN, GreenBuildingYN

### VIEWS & EXPOSURE
View, ViewYN, ViewRemarks, DirectionFaces, Exposures

### OUTDOOR SPACE
PatioAndPorchFeatures, BuildingPatioAndPorchFeatures, ExteriorFeatures, PrivateOutdoorSpaceRemarks, PrivateOutdoorSpaceSize, RoofRightsYN, PoolFeatures, BuildingPoolFeatures

### INTERIOR
InteriorFeatures, Appliances, Flooring, WindowFeatures, DoorFeatures, Heating, HeatingYN, Cooling, CoolingYN, FireplacesTotal, FireplaceFeatures, LaundryFeatures, PropertyCondition, KitchenCondition, BathroomCondition, Basement, BasementYN

### PARKING
GarageYN, GarageSpaces, GarageSpacesAssignedYN, AttachedGarageYN, ParkingFeatures, ParkingTotal, OpenParkingSpaces, CarportYN

### PETS
PetsAllowed, PetsAllowedComments, BuildingPetsAllowed, BuildingPetsAllowedComments, PetDepositFee

### RENTAL
LeaseType, MinLeaseMonths, MaxLeaseMonths, Furnished, FurnishedListPrice, NetMonthlyRent, DepositAmount, GuarantorsAcceptedYN, RentingAllowedYN, OwnerPays, MoveInCosts, MoveInCostsAmountTotal

### AGENT/OFFICE
ListAgentFullName, ListAgentMlsId, ListAgentEmail, ListAgentDirectPhone, ListOfficeName, ListOfficeMlsId, CoListAgentFullName, CoBrokeAgreement, ShowingInstructions, ShowingContactPhone

### CONCESSIONS
Concessions, ConcessionsAmount, ConcessionsComments, ConcessionsBuyerBrokerFee, ConcessionsClosingCosts, OwnerPaysPlusConcessionsYN

### STATUS
StandardStatus, MlsStatus, PreviousStatus, DevelopmentStatus, NewDevelopmentYN, NewConstructionYN, SponsorUnitYN, NewlyConvertedUnitYN

### SYNDICATION
SyndicateYN, InternetEntireListingDisplayYN, InternetAddressDisplayYN, IDXEntireListingDisplayYN, ListOfficeIDXParticipationYN, Permissions

### LOCATION
StreetNumber, StreetName, StreetSuffix, UnitNumber, City, CityRegion, CountyOrParish, PostalCode, StateOrProvince, SubdivisionName, TaxBlock, TaxLot, BuildingTaxLot, CrossStreet, Latitude, Longitude

---

## IMPLEMENTATION NOTES

This is the production specification. When implementing:

1. **Phase 1**: Add missing search fields (Views, Pets, Financing, DOM)
2. **Phase 2**: Build flexible results table with column customization
3. **Phase 3**: Add client assignment workflow
4. **Phase 4**: Build syndication panel (wired to live Trestle API)
5. **Phase 5**: Create listing management dashboard

All UI should follow the existing Tailwind CSS styling and remain responsive across all device sizes per CLAUDE.md requirements.
