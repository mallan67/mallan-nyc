# RENTAL-FORM-WITH-TOOLS.html - structure read from source (origin/main)

Generated 2026-10-15. Sections are taken from the markup (tab ids, sub-tab ids, card headers, panel/modal headings); controls are listed under the last section marker above them.

Control total: 737

## (top of page)  (2 controls)

### (no sub-section)  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 106 | (no id) | select |  |  |
| 257 | rentalShowRequiredOnly | checkbox |  |  |

## Tab 1: LISTING INFORMATION  (204 controls)

### Sub-tab 1.1 Location > Property Address — IDX Lookup  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 313 | rentalStreetAddress | text | Street Address * | StreetName |
| 317 | rentalUnitNumber | text | Unit / Apt | UnitNumber |
| 321 | rentalBorough | select | Borough * | CityRegion |
| 334 | rentalZipCode | text | Zip Code | PostalCode |
| 338 | rentalNeighborhoodFromAddress | text | Neighborhood |  |

### Sub-tab 1.1 Location > Agent & Dates  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 349 | rentalUpdatingAgentDisplay | text | Listing Agent |  |
| 355 | rentalCreateDate | date | Create Date |  |
| 362 | rentalLastUpdatedDate | date | Last Updated |  |

### Sub-tab 1.1 Location > Listing Type & Classification  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 379 | rentalListingType | radio |  |  |
| 383 | rentalListingType | radio |  |  |
| 387 | rentalListingType | radio |  |  |
| 391 | rentalListingType | radio |  |  |
| 397 | rentalListingType | radio |  |  |
| 402 | rentalListingType | radio |  |  |
| 406 | rentalListingType | radio |  |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Listing Type & Classification  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 480 | (no id) | checkbox |  |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Agreements & Disclosures  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 494 | rentalCoBrokeAgreement | radio | CoBroke Agreement * |  |
| 497 | rentalCoBrokeAgreement | radio | CoBroke Agreement * |  |
| 504 | rentalCommNegotiabilityAck | checkbox |  |  |
| 516 | rentalOptOutFormUpload | file | Owner Opt-Out Form (Exhibit B) * |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Status & Pricing  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 527 | rentalStatus | select | Status * | MlsStatus |
| 597 | rentalMonthlyRent | number | Monthly Rent * |  |
| 601 | rentalNetEffectiveRent | number | Net Effective Rent |  |
| 605 | rentalSecurityDeposit | number | Security Deposit | SecurityDeposit |
| 609 | rentalRentedPrice | number | Rented Price * |  |
| 619 | rentalInternetAVMDisplayYN | radio |  | InternetAutomatedValuationDisplayYN |
| 623 | rentalInternetAVMDisplayYN | radio |  |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Property Type & Ownership  - 79 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 649 | rentalPropertyType | radio | Condo | PropertyType |
| 650 | rentalPropertyType | radio | Co-op |  |
| 651 | rentalPropertyType | radio | Condop |  |
| 652 | rentalPropertyType | radio | Single Family TH |  |
| 653 | rentalPropertyType | radio | Multi-Family TH |  |
| 654 | rentalPropertyType | radio | Single Family |  |
| 655 | rentalPropertyType | radio | Multi-Family |  |
| 656 | rentalPropertyType | radio | Mixed Use |  |
| 657 | rentalPropertyType | radio | Loft |  |
| 658 | rentalPropertyType | radio | Rental Building |  |
| 662 | rentalPropertyType | radio | Duplex (2 Unit) |  |
| 663 | rentalPropertyType | radio | Triplex (3 Unit) |  |
| 664 | rentalPropertyType | radio | Quadruplex (4 Unit) |  |
| 668 | rentalPropertyType | radio | Office |  |
| 669 | rentalPropertyType | radio | Retail |  |
| 675 | rentalOfficeRetailOwnership | radio | Condo |  |
| 676 | rentalOfficeRetailOwnership | radio | Co-op |  |
| 677 | rentalOfficeRetailOwnership | radio | Condop |  |
| 678 | rentalOfficeRetailOwnership | radio | Townhouse |  |
| 679 | rentalOfficeRetailOwnership | radio | Mixed Use |  |
| 680 | rentalOfficeRetailOwnership | radio | Fee Simple |  |
| 688 | rentalBuildingStatus | radio | Existing |  |
| 689 | rentalBuildingStatus | radio | New Development |  |
| 690 | rentalBuildingStatus | radio | New Conversion |  |
| 697 | rentalCommonInterest | select | Ownership Structure * | CommonInterest |
| 725 | rentalPropertyType | radio |  |  |
| 740 | rentalCommSubtype | checkbox | Professional Office |  |
| 741 | rentalCommSubtype | checkbox | Medical Office |  |
| 742 | rentalCommSubtype | checkbox | Dental Office |  |
| 743 | rentalCommSubtype | checkbox | Flexible Space |  |
| 749 | rentalCommSubtype | checkbox | Restaurant |  |
| 750 | rentalCommSubtype | checkbox | Grocery |  |
| 751 | rentalCommSubtype | checkbox | Showroom |  |
| 752 | rentalCommSubtype | checkbox | Strip Mall |  |
| 758 | rentalCommSubtype | checkbox | Industrial |  |
| 759 | rentalCommSubtype | checkbox | Warehouse |  |
| 760 | rentalCommSubtype | checkbox | Manufacturing |  |
| 761 | rentalCommSubtype | checkbox | Distribution |  |
| 762 | rentalCommSubtype | checkbox | Storage |  |
| 768 | rentalCommSubtype | checkbox | Mixed Use |  |
| 769 | rentalCommSubtype | checkbox | Live/Work |  |
| 770 | rentalCommSubtype | checkbox | Investment |  |
| 771 | rentalCommSubtype | checkbox | Institutional |  |
| 772 | rentalCommSubtype | checkbox | Special Use |  |
| 782 | rentalCommercialOwnership | radio | Commercial Condo |  |
| 783 | rentalCommercialOwnership | radio | Commercial Condop |  |
| 784 | rentalCommercialOwnership | radio | Commercial Co-op |  |
| 785 | rentalCommercialOwnership | radio | Whole Building |  |
| 786 | rentalCommercialOwnership | radio | Land Only |  |
| 792 | rentalTenantConfig | radio | Single Tenant |  |
| 793 | rentalTenantConfig | radio | Multi-Tenant |  |
| 803 | rentalBusinessType | checkbox | Medical | BusinessType |
| 804 | rentalBusinessType | checkbox | Dental |  |
| 805 | rentalBusinessType | checkbox | Health Services |  |
| 806 | rentalBusinessType | checkbox | Fitness |  |
| 812 | rentalBusinessType | checkbox | Restaurant |  |
| 813 | rentalBusinessType | checkbox | Food & Beverage |  |
| 814 | rentalBusinessType | checkbox | Bar/Tavern/Lounge |  |
| 815 | rentalBusinessType | checkbox | Fast Food |  |
| 816 | rentalBusinessType | checkbox | Bakery |  |
| 822 | rentalBusinessType | checkbox | Professional Service |  |
| 823 | rentalBusinessType | checkbox | Financial |  |
| 824 | rentalBusinessType | checkbox | Real Estate |  |
| 825 | rentalBusinessType | checkbox | Accounting |  |
| 826 | rentalBusinessType | checkbox | Computer/Technology |  |
| 832 | rentalBusinessType | checkbox | Barber/Beauty |  |
| 833 | rentalBusinessType | checkbox | Dry Cleaner |  |
| 834 | rentalBusinessType | checkbox | Laundromat |  |
| 835 | rentalBusinessType | checkbox | Child Care |  |
| 841 | rentalBusinessType | checkbox | Hotel/Motel |  |
| 842 | rentalBusinessType | checkbox | Bed & Breakfast |  |
| 843 | rentalBusinessType | checkbox | Hospitality |  |
| 852 | (no id) | number | Usable Sq Ft |  |
| 856 | (no id) | select | Lease Type |  |
| 868 | (no id) | select | Zoning |  |
| 885 | (no id) | number | Ceiling Height (ft) |  |
| 889 | (no id) | number | Frontage (ft) |  |
| 893 | (no id) | text | Min Lease Term |  |
| 897 | (no id) | date | Lease Expiration |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Building Requirements  - 16 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 910 | rentalBoardApproval | radio | Y | BuildingFeatures |
| 911 | rentalBoardApproval | radio | N |  |
| 915 | rentalBoardInterview | radio | Y |  |
| 916 | rentalBoardInterview | radio | N |  |
| 920 | rentalMeetAndGreet | radio | Y |  |
| 921 | rentalMeetAndGreet | radio | N |  |
| 925 | rentalBoardApplication | radio | Y |  |
| 926 | rentalBoardApplication | radio | N |  |
| 930 | rentalFirstRefusal | radio | Y |  |
| 931 | rentalFirstRefusal | radio | N |  |
| 935 | rentalFilmLocation | radio | Y |  |
| 936 | rentalFilmLocation | radio | N |  |
| 940 | rentalLiveWorkAllowed | radio | Y |  |
| 941 | rentalLiveWorkAllowed | radio | N |  |
| 945 | rentalSubleaseAllowed | radio | Y |  |
| 946 | rentalSubleaseAllowed | radio | N |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Rental Options  - 15 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 958 | rentalGuarantors | radio | Yes | GuarantorsAcceptedYN |
| 959 | rentalGuarantors | radio | No |  |
| 965 | rentalFurnished | radio | Yes |  |
| 966 | rentalFurnished | radio | No |  |
| 974 | rentalPetsAllowed | checkbox | Yes | PetsAllowed |
| 975 | rentalPetsAllowed | checkbox | Cats OK |  |
| 976 | rentalPetsAllowed | checkbox | Dogs OK |  |
| 977 | rentalPetsAllowed | checkbox | Breed Restr. |  |
| 978 | rentalPetsAllowed | checkbox | Size Limit |  |
| 979 | rentalPetsAllowed | checkbox | Number Limit |  |
| 980 | rentalPetsAllowed | checkbox | No Pets |  |
| 986 | rentalSmoking | radio | Yes | BuildingSmokeFreeYN |
| 987 | rentalSmoking | radio | No |  |
| 993 | rentalStudents | radio | Yes |  |
| 994 | rentalStudents | radio | No |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Important Dates  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1007 | rentalDateListed | date | Date Listed * | OnMarketDate |
| 1014 | rentalAvailableDate | date | Available Date * | AvailabilityDate |
| 1021 | rentalExclusiveStart | date | Exclusive Start Date * |  |
| 1028 | rentalExclusiveExpires | date | Exclusive Expires (Hidden from public) | ExpirationDate |
| 1035 | rentalFirstCoBroke | date | First Date To CoBroke |  |
| 1042 | rentalOffMarketDate | date | Off Market Date | OffMarketDate |
| 1049 | rentalRentedDate | date | Rented Date * |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Fee Disclosure (FARE Act — NYC LL 119/2024)  - 11 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1063 | rentalMoveInCosts | text | Move-In Costs | MoveInCosts |
| 1068 | rentalMoveInCostsAmount | number | Move-In Cost Amount ($) | MoveInCostsAmount |
| 1074 | rentalMoveInCostsComments | textarea | Move-In Costs Comments | MoveInCostsComments |
| 1079 | rentalOngoingFees | text | Ongoing Fees | OngoingFees |
| 1084 | rentalFeeFrequency | select | Fee Frequency | AdditionalFeeFrequency |
| 1098 | rentalTenantPays | text | Tenant Pays | TenantPays |
| 1103 | rentalTenantPaysDescription | text | Tenant Pays Description | TenantPaysDescription |
| 1110 | rentalAdditionalFeeYN | select | Additional Fees? | AdditionalFeeYN |
| 1118 | rentalAdditionalFee | number | Additional Fee Amount ($) | AdditionalFee |
| 1122 | rentalAdditionalFeeDescription | text | Additional Fee Description | AdditionalFeeDescription |
| 1126 | rentalAdditionalFeeFrequency | select | Additional Fee Frequency | AdditionalFeeFrequency |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Rental Deal Fees (Co-op / Condo / Condop — Paid by Tenant)  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1154 | (no id) | select |  |  |
| 1155 | (no id) | select |  |  |
| 1156 | (no id) | select |  |  |
| 1157 | (no id) | select |  |  |
| 1158 | (no id) | select |  |  |
| 1159 | (no id) | select |  |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Concessions  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1179 | rentalConcessions | select | Concessions (RLS/RESO/IDX) | Concessions |
| 1188 | rentalConcessionAmount | number | Concession Amount | ConcessionsAmount |
| 1192 | rentalOwnerPays | checkbox | Owner Pays | OwnerPays |
| 1193 | rentalFreeRent | checkbox | Free Rent |  |
| 1194 | rentalOwnerPaysFreeRent | checkbox | Owner Pays AND Free Rent |  |
| 1199 | rentalFreeRentMonths | number | Free Rent Months |  |
| 1203 | rentalConcessionRemarks | text | Concession Remarks |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Lease Terms  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1214 | rentalLeaseTerm | select | Lease Term |  |
| 1225 | rentalLeaseType | select | Lease Type | AvailableLeaseType |
| 1233 | rentalMinLease | number | Min Lease (Months) | LeaseTerm |
| 1237 | rentalMaxLease | number | Max Lease (Months) | MaxLeaseMonths |
| 1242 | rentalLeaseRenewalOptionYN | radio | Yes | LeaseRenewalOptionYN |
| 1243 | rentalLeaseRenewalOptionYN | radio | No |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Commission Information  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1256 | rentalCommissionType | select | Tenant's Agent Commission |  |
| 1260 | rentalCommissionAmount | number | Tenant's Agent Commission |  |
| 1267 | rentalCommissionPaidBy | radio | Owner Pays (to Tenant's Agent) |  |
| 1268 | rentalCommissionPaidBy | radio | Tenant Pays |  |
| 1269 | rentalCommissionPaidBy | radio | Split |  |

### Sub-tab 1.2 Next: Essentials > [panel: rentalListingTypeInfoModal] > Listing URL & Display  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1290 | rentalListingUrl | text | Listing URL | ListingURL |
| 1296 | rentalWebDisplayAddress | select | Web Display Address |  |
| 1308 | rentalWebHeadline | text | Web Headline |  |

### Sub-tab 1.2 Next: Essentials > [panel: rentalListingTypeInfoModal] > FARE Act — Broker Fee Payment (NYC Local Law 119 of 2024)  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1320 | rentalFareActLandlordPays | radio |  |  |
| 1324 | rentalFareActLandlordPays | radio |  |  |

### Sub-tab 1.2 Next: Essentials > [panel: rentalListingTypeInfoModal] > Internet Display Controls  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1346 | rentalInternetEntireListingDisplayYN | checkbox |  | InternetEntireListingDisplayYN |
| 1353 | rentalInternetAddressDisplayYN | checkbox |  | InternetAddressDisplayYN |
| 1360 | rentalInternetConsumerCommentYN | checkbox |  | InternetConsumerCommentYN |

### Sub-tab 1.2 Next: Essentials > [panel: rentalListingTypeInfoModal] > Listing Description  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1382 | rentalDescription | textarea | Describe the property features, location highlight | PublicRemarks |

### Sub-tab 1.2 Next: Essentials > [panel: rentalListingTypeInfoModal] > Agent Remarks & Instructions  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1390 | rentalAgentRemarks | textarea | Agent Remarks (Private) |  |
| 1396 | rentalShowingInstructions | textarea | Showing Instructions | ShowingInstructions |
| 1404 | rentalFairHousingAck | checkbox |  |  |

### Sub-tab 1.3 Next: Features > [panel: rentalListingTypeInfoModal] > Listing Agent *  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1436 | rentalListingCompanySearch | text | REBNY Company * |  |
| 1443 | rentalListingAgentSearch | text | Agent/Broker Name * |  |

### Sub-tab 1.3 Next: Features > [panel: rentalListingTypeInfoModal] > Tenant's Agent (Required for Rented status)  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1476 | rentalTenantCompanySearch | text | REBNY Company |  |
| 1483 | rentalTenantAgentSearch | text | Agent/Broker Name |  |
| 1498 | rentalBuyerAgentRLSParticipantYN | checkbox | Tenant's Agent is RLS Participant |  |

### Sub-tab 1.3 Next: Features > [panel: rentalListingTypeInfoModal] > Owner / Landlord Contact  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1507 | rentalOwnerName | text | Owner Name |  |
| 1508 | rentalOwnerPhone | tel | Owner Phone |  |
| 1509 | rentalOwnerEmail | email | Owner Email |  |
| 1510 | rentalOwnerContactMethod | select | Preferred Contact |  |

### Sub-tab 1.3 Next: Features > [panel: rentalListingTypeInfoModal] > Building Contact  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1518 | rentalSuperName | text | Super/Manager Name |  |
| 1519 | rentalSuperPhone | tel | Super/Manager Phone |  |

### Sub-tab 1.3 Next: Features > [panel: rentalListingTypeInfoModal] > Team Information  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1530 | rentalListTeamName | text | Listing Team Name (RLS/RESO/IDX: ListTeamName) | ListTeamName |
| 1535 | rentalListTeamMlsId | text | Listing Team MLS ID (RLS/RESO/IDX: ListTeamMlsId) | ListTeamKey |

## Tab 2: UNIT INFORMATION --  (163 controls)

### Sub-tab 2.1 General > Property Location  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1633 | rentalStreetAddress2 | text | Street Address * |  |
| 1637 | rentalUnitNumber2 | text | Unit Number |  |
| 1641 | rentalCity | text | City * | City |
| 1645 | rentalState | select | State * | StateOrProvince |
| 1653 | rentalZip | text | ZIP Code * | PostalCode |
| 1657 | rentalNeighborhood | select | Neighborhood | SubdivisionName |

### Sub-tab 2.1 General > Unit Details  - 14 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1732 | rentalBedrooms | select | Bedrooms * | BedroomsTotal |
| 1741 | rentalFullBathrooms | select | Full Bathrooms * | BathroomsFull |
| 1749 | rentalHalfBathrooms | select | Half Bathrooms | BathroomsHalf |
| 1757 | rentalBathroomsTotal | number | Total Bathrooms * | BathroomsTotalInteger |
| 1761 | rentalTotalRooms | number | Total Rooms | RoomsTotal |
| 1767 | rentalSqFt | number | Approx. Sq Ft | LivingArea |
| 1771 | rentalFloor | text | Floor in Building | EntryLevel |
| 1775 | rentalLine | text | Unit Line | UnitNumber |
| 1779 | rentalUnitType | select | Unit Type | PropertySubType |
| 1810 | rentalCondition | select | Condition | PropertyCondition |
| 1824 | rentalFurnished | select | Furnished | Furnished |
| 1836 | rentalFurnishedRent | number | Furnished Monthly Rent | FurnishedListPrice |
| 1840 | rentalFurnishedMinMonths | number | Min Furnished Term (months) | FurnishedMinLeaseMonths |
| 1844 | rentalFurnishedMaxMonths | number | Max Furnished Term (months) | FurnishedMaxLeaseMonths |

### Sub-tab 2.1 General > Exposure & Views  - 11 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1856 | rentalExpNorth | checkbox | North | Exposures |
| 1857 | rentalExpSouth | checkbox | South | Exposures |
| 1858 | rentalExpEast | checkbox | East | Exposures |
| 1859 | rentalExpWest | checkbox | West | Exposures |
| 1865 | rentalViewCity | checkbox | City | View |
| 1866 | rentalViewWater | checkbox | Water | View |
| 1867 | rentalViewRiver | checkbox | River | View |
| 1868 | rentalViewPark | checkbox | Park | View |
| 1869 | rentalViewGarden | checkbox | Garden | View |
| 1870 | rentalViewSkyline | checkbox | Skyline | View |
| 1871 | rentalViewPanoramic | checkbox | Panoramic | View |

### Sub-tab 2.2 Next: Rental Policies > Kitchen  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1892 | rentalKitchenType | select | Kitchen Type |  |
| 1904 | rentalDishwasher | checkbox | Dishwasher | InteriorFeatures |
| 1905 | rentalGraniteCounters | checkbox | Granite Counters | InteriorFeatures |
| 1906 | rentalStainlessAppl | checkbox | Stainless Appliances | Appliances |
| 1907 | rentalMicrowave | checkbox | Microwave | Appliances |
| 1908 | rentalGasStove | checkbox | Gas Stove | Appliances |

### Sub-tab 2.2 Next: Rental Policies > Living Room  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1917 | rentalLivingRoom | checkbox | Living Room | InteriorFeatures |
| 1918 | rentalFormalLiving | checkbox | Formal Living | InteriorFeatures |
| 1919 | rentalGreatRoom | checkbox | Great Room | InteriorFeatures |

### Sub-tab 2.2 Next: Rental Policies > Dining  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1926 | rentalDiningRoom | checkbox | Dining Room | InteriorFeatures |
| 1927 | rentalFormalDining | checkbox | Formal Dining | InteriorFeatures |
| 1928 | rentalDiningArea | checkbox | Dining Area | InteriorFeatures |
| 1929 | rentalBreakfastNook | checkbox | Breakfast Nook | InteriorFeatures |

### Sub-tab 2.2 Next: Rental Policies > Additional Rooms  - 8 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1936 | rentalDen | checkbox | Den | InteriorFeatures |
| 1937 | rentalHomeOffice | checkbox | Home Office | InteriorFeatures |
| 1938 | rentalLibrary | checkbox | Library | InteriorFeatures |
| 1939 | rentalMaidsRoom | checkbox | Maid's Room | InteriorFeatures |
| 1940 | rentalNursery | checkbox | Nursery | InteriorFeatures |
| 1941 | rentalRecRoom | checkbox | Recreation Room | InteriorFeatures |
| 1942 | rentalMediaRoom | checkbox | Media Room | InteriorFeatures |
| 1943 | rentalSunroom | checkbox | Sunroom | InteriorFeatures |

### Sub-tab 2.2 Next: Rental Policies > Storage & Utility  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1950 | rentalWalkInCloset | checkbox | Walk-in Closet | InteriorFeatures |
| 1951 | rentalStorageRoom | checkbox | Storage Room | InteriorFeatures |
| 1952 | rentalLaundryRoom | checkbox | Laundry Room | InteriorFeatures |
| 1953 | rentalMudroom | checkbox | Mudroom | InteriorFeatures |

### Sub-tab 2.3 Next: Purchase Policies > Building Amenities  - 12 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1970 | rentalDoorman | checkbox | Doorman | BuildingFeatures |
| 1971 | rentalElevator | checkbox | Elevator | BuildingFeatures |
| 1972 | rentalGym | checkbox | Gym/Fitness | BuildingFeatures |
| 1973 | rentalBldgLaundry | checkbox | Laundry (Building) | LaundryFeatures |
| 1974 | rentalBikeRoom | checkbox | Bike Room | BuildingFeatures |
| 1975 | rentalStorage | checkbox | Storage | BuildingFeatures |
| 1976 | rentalRoofDeck | checkbox | Roof Deck | BuildingFeatures |
| 1977 | rentalLiveInSuper | checkbox | Live-in Super | BuildingFeatures |
| 1978 | rentalParking | checkbox | Parking | BuildingFeatures |
| 1979 | rentalPool | checkbox | Pool | BuildingFeatures |
| 1980 | rentalConcierge | checkbox | Concierge | BuildingFeatures |
| 1981 | rentalValet | checkbox | Valet | BuildingFeatures |

### Sub-tab 2.3 Next: Purchase Policies > In-Unit Features  - 8 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1988 | rentalWasherDryer | checkbox | Washer/Dryer in Unit | InteriorFeatures |
| 1989 | rentalCentralAC | checkbox | Central AC | InteriorFeatures |
| 1990 | rentalHardwood | checkbox | Hardwood Floors | InteriorFeatures |
| 1991 | rentalHighCeilings | checkbox | High Ceilings | InteriorFeatures |
| 1992 | rentalFireplace | checkbox | Fireplace | InteriorFeatures |
| 1993 | rentalExposedBrick | checkbox | Exposed Brick | InteriorFeatures |
| 1994 | rentalPrewar | checkbox | Pre-War Details | InteriorFeatures |
| 1995 | rentalSmartHome | checkbox | Smart Home | InteriorFeatures |

### Sub-tab 2.3 Next: Purchase Policies > Private Outdoor Space  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2002 | rentalBalcony | checkbox | Balcony | ExteriorFeatures |
| 2003 | rentalTerrace | checkbox | Terrace | ExteriorFeatures |
| 2004 | rentalPatio | checkbox | Patio | ExteriorFeatures |
| 2005 | rentalPrivateRoof | checkbox | Private Roof Deck | ExteriorFeatures |
| 2006 | rentalPrivateGarden | checkbox | Private Garden | ExteriorFeatures |
| 2007 | rentalBackyard | checkbox | Backyard | ExteriorFeatures |

### Sub-tab 2.3 Next: Purchase Policies > Heating  - 45 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2015 | rentalHeatingYN | radio | Yes | HeatingYN |
| 2016 | rentalHeatingYN | radio | No |  |
| 2020 | rentalHeating | checkbox | Steam | Heating |
| 2021 | rentalHeating | checkbox | Hot Water |  |
| 2022 | rentalHeating | checkbox | Central |  |
| 2023 | rentalHeating | checkbox | Forced Air |  |
| 2024 | rentalHeating | checkbox | Baseboard |  |
| 2025 | rentalHeating | checkbox | Radiant |  |
| 2026 | rentalHeating | checkbox | Radiant Floor |  |
| 2027 | rentalHeating | checkbox | Electric |  |
| 2028 | rentalHeating | checkbox | Natural Gas |  |
| 2029 | rentalHeating | checkbox | City Steam |  |
| 2030 | rentalHeating | checkbox | Heat Pump |  |
| 2031 | rentalHeating | checkbox | Ductless |  |
| 2032 | rentalHeating | checkbox | Geothermal |  |
| 2033 | rentalHeating | checkbox | Active Solar |  |
| 2034 | rentalHeating | checkbox | Solar |  |
| 2035 | rentalHeating | checkbox | Passive Solar |  |
| 2036 | rentalHeating | checkbox | Fireplaces |  |
| 2037 | rentalHeating | checkbox | Fireplace Insert |  |
| 2038 | rentalHeating | checkbox | Wood Stove |  |
| 2039 | rentalHeating | checkbox | Pellet Stove |  |
| 2040 | rentalHeating | checkbox | Wood |  |
| 2041 | rentalHeating | checkbox | Oil |  |
| 2042 | rentalHeating | checkbox | Coal |  |
| 2043 | rentalHeating | checkbox | Coal Stove |  |
| 2044 | rentalHeating | checkbox | Kerosene |  |
| 2045 | rentalHeating | checkbox | Propane |  |
| 2046 | rentalHeating | checkbox | Propane Stove |  |
| 2047 | rentalHeating | checkbox | Space Heater |  |
| 2048 | rentalHeating | checkbox | Wall Furnace |  |
| 2049 | rentalHeating | checkbox | Floor Furnace |  |
| 2050 | rentalHeating | checkbox | Gravity |  |
| 2051 | rentalHeating | checkbox | Radiant Ceiling |  |
| 2052 | rentalHeating | checkbox | Ceiling |  |
| 2053 | rentalHeating | checkbox | Exhaust Fan |  |
| 2054 | rentalHeating | checkbox | Humidity Control |  |
| 2055 | rentalHeating | checkbox | Separate Meters |  |
| 2056 | rentalHeating | checkbox | Zoned |  |
| 2057 | rentalHeating | checkbox | Varies by Unit |  |
| 2058 | rentalHeating | checkbox | ENERGY STAR ACCA/RSI |  |
| 2059 | rentalHeating | checkbox | ENERGY STAR Equipment |  |
| 2060 | rentalHeating | checkbox | See Remarks |  |
| 2061 | rentalHeating | checkbox | None |  |
| 2062 | rentalHeating | checkbox | Other |  |

### Sub-tab 2.3 Next: Purchase Policies > Cooling  - 27 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2070 | rentalCoolingYN | radio | Yes | CoolingYN |
| 2071 | rentalCoolingYN | radio | No |  |
| 2075 | rentalCooling | checkbox | Central Air | Cooling |
| 2076 | rentalCooling | checkbox | Ductless |  |
| 2077 | rentalCooling | checkbox | Wall Units |  |
| 2078 | rentalCooling | checkbox | Window Units |  |
| 2079 | rentalCooling | checkbox | Wall/Window Units |  |
| 2080 | rentalCooling | checkbox | Electric |  |
| 2081 | rentalCooling | checkbox | Heat Pump |  |
| 2082 | rentalCooling | checkbox | Dual |  |
| 2083 | rentalCooling | checkbox | Multi Units |  |
| 2084 | rentalCooling | checkbox | Zoned |  |
| 2085 | rentalCooling | checkbox | Separate Meters |  |
| 2086 | rentalCooling | checkbox | Building Cooling |  |
| 2087 | rentalCooling | checkbox | Whole House Fan |  |
| 2088 | rentalCooling | checkbox | Attic Fan |  |
| 2089 | rentalCooling | checkbox | Ceiling Fans |  |
| 2090 | rentalCooling | checkbox | Roof Turbines |  |
| 2091 | rentalCooling | checkbox | Gas |  |
| 2092 | rentalCooling | checkbox | Geothermal |  |
| 2093 | rentalCooling | checkbox | Evaporative Cooling |  |
| 2094 | rentalCooling | checkbox | Exhaust Fan |  |
| 2095 | rentalCooling | checkbox | Humidity Control |  |
| 2096 | rentalCooling | checkbox | ENERGY STAR Equipment |  |
| 2097 | rentalCooling | checkbox | Varies by Unit |  |
| 2098 | rentalCooling | checkbox | None |  |
| 2099 | rentalCooling | checkbox | Other |  |

### Sub-tab 2.3 Next: Purchase Policies > Policies  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2110 | rentalPets | radio | Cats OK | PetsAllowed |
| 2111 | rentalPets | radio | Dogs OK |  |
| 2112 | rentalPets | radio | Cats & Dogs OK |  |
| 2113 | rentalPets | radio | Case by Case |  |
| 2114 | rentalPets | radio | No Pets |  |
| 2120 | rentalGuarantorsPolicy | radio | Allowed |  |
| 2121 | rentalGuarantorsPolicy | radio | Required |  |
| 2122 | rentalGuarantorsPolicy | radio | Not Allowed |  |
| 2123 | rentalGuarantorsPolicy | radio | Case by Case |  |

## Tab 3: TOWNHOUSE / BUILDING INFO --  (77 controls)

### Sub-tab 3.1 Essentials > Property Details  - 8 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2156 | rentalTHStories | number | Stories (Property) * | Stories |
| 2160 | rentalTHUnitsTotal | number | # Residential Units * | NumberOfUnitsTotal |
| 2164 | rentalTHProfUnits | number | # Professional Units |  |
| 2168 | rentalTHRetailUnits | number | # Retail Units |  |
| 2172 | rentalTHNumBuildings | number | # Buildings | NumberOfBuildings |
| 2176 | rentalTHVacantUnits | number | # Vacant Units |  |
| 2180 | rentalTHCommercialYN | select | Commercial Units? | CommercialUnitsYN |
| 2184 | rentalTHDevStatus | select | Development Status | DevelopmentStatus |

### Sub-tab 3.1 Essentials > Lot Information  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2201 | rentalTHLotSize | number | Lot Size * | LotSizeArea |
| 2205 | rentalTHLotSizeUnits | select | Lot Size Units * | LotSizeUnits |
| 2211 | rentalTHLotDimensions | text | Lot Dimensions * | LotSizeDimensions |
| 2215 | rentalTHLotSizeSource | select | Lot Size Source | LotSizeSource |
| 2225 | rentalTHLandmark | select | Landmark Status | LandmarkStatusYN |
| 2229 | rentalTHLotFeatures | text | Lot Features | LotFeatures |

### Sub-tab 3.1 Essentials > Building Size & Structure  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2246 | rentalTHBuildingArea | number | Building Area Total * | BuildingAreaTotal |
| 2250 | rentalTHBuildingAreaUnits | select | Building Area Units | BuildingAreaUnits |
| 2254 | rentalTHGrossSqFt | number | Gross Square Footage |  |
| 2258 | rentalTHNetSqFt | number | Net Square Footage |  |
| 2262 | rentalTHFoundationArea | text | Foundation Area | FoundationArea |
| 2266 | rentalTHFoundation | select | Foundation Details | FoundationDetails |
| 2277 | rentalTHBasementYN | select | Basement | BasementYN |
| 2283 | (no id) | select | Basement Type |  |
| 2290 | rentalTHLevels | select | Levels | Levels |

### Sub-tab 3.1 Essentials > Zoning & FAR  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2303 | rentalTHZoning | text | Zoning Description | ZoningDescription |
| 2307 | rentalTHOverFAR | number | Area Over FAR (sq ft) |  |
| 2311 | rentalTHUnderFAR | number | Area Under FAR (sq ft) |  |

### Sub-tab 3.1 Essentials > Land Lease  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2321 | rentalTHLandLeaseYN | select | Land Lease? | LandLeaseYN |
| 2327 | rentalTHLandLeaseAmt | number | Land Lease Amount | LandLeaseAmount |
| 2331 | rentalTHLandLeaseFreq | select | Frequency | LandLeaseAmountFrequency |
| 2341 | rentalTHLandLeaseExp | date | Expiration Date | LandLeaseExpirationDate |

### Sub-tab 3.1 Essentials > Parking  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2351 | rentalTHGarageYN | select | Garage? | GarageYN |
| 2355 | rentalTHGarageSpaces | number | Garage Spaces | GarageSpaces |
| 2359 | rentalTHAttachedGarage | select | Attached? | AttachedGarageYN |
| 2363 | rentalTHOpenParkingYN | select | Open Parking? | OpenParkingYN |
| 2367 | rentalTHOpenSpaces | number | Open Spaces |  |
| 2371 | rentalTHParkingTotal | number | Total Parking | ParkingTotal |

### Sub-tab 3.1 Essentials > Documents Available (Upon Request)  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2381 | rentalTHDocsAvailable | checkbox | Building Rules | DocumentsAvailable |
| 2382 | rentalTHDocsAvailable | checkbox | Bylaws & Amendments |  |
| 2383 | rentalTHDocsAvailable | checkbox | Financial Statement |  |
| 2384 | rentalTHDocsAvailable | checkbox | Offering Plan |  |
| 2385 | rentalTHDocsAvailable | checkbox | Board Package Template |  |
| 2386 | rentalTHDocsAvailable | checkbox | Schedule A |  |

### Sub-tab 3.2 Next: Setup Sheet > Description  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2406 | rentalTHDescription | textarea | Enter property description. This will be used for  | PublicRemarks |

### Sub-tab 3.2 Next: Setup Sheet > Layout  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2415 | rentalTHLayout | textarea | Describe the property layout, floor plan, room arr |  |

### Sub-tab 3.2 Next: Setup Sheet > Notes  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2424 | rentalTHNotes | textarea | Internal notes, showing instructions, or additiona |  |

### Sub-tab 3.3 Next: Financials > Income & Expenses  - 27 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2447 | rentalTHGrossIncomeM | number | Gross Income |  |
| 2448 | rentalTHGrossIncomeA | number | Gross Income |  |
| 2452 | rentalTHTaxM | number | RE Tax |  |
| 2453 | rentalTHTaxA | number | RE Tax |  |
| 2457 | rentalTHWaterM | number | Water and Sewer |  |
| 2458 | rentalTHWaterA | number | Water and Sewer |  |
| 2462 | rentalTHHeatM | number | Heat |  |
| 2463 | rentalTHHeatA | number | Heat |  |
| 2467 | rentalTHMaintM | number | Maintenance |  |
| 2468 | rentalTHMaintA | number | Maintenance |  |
| 2472 | rentalTHMgmtM | number | Management |  |
| 2473 | rentalTHMgmtA | number | Management |  |
| 2477 | rentalTHSuperM | number | Super / Doorman |  |
| 2478 | rentalTHSuperA | number | Super / Doorman |  |
| 2486 | rentalTHElectricM | number | Electric |  |
| 2487 | rentalTHElectricA | number | Electric |  |
| 2491 | rentalTHInsuranceM | number | Insurance |  |
| 2492 | rentalTHInsuranceA | number | Insurance |  |
| 2496 | rentalTHTrashM | number | Trash |  |
| 2497 | rentalTHTrashA | number | Trash |  |
| 2501 | rentalTHPestM | number | Pest Control |  |
| 2502 | rentalTHPestA | number | Pest Control |  |
| 2506 | rentalTHWorkCompM | number | Workers Comp |  |
| 2507 | rentalTHWorkCompA | number | Workers Comp |  |
| 2511 | rentalTHOtherM | number | Other |  |
| 2512 | rentalTHOtherA | number | Other |  |
| 2515 | rentalTHOtherRemarks | text | Other Expense Remarks |  |

### Sub-tab 3.3 Next: Financials > Totals & Cap Rate  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2527 | rentalTHTotalExpM | number | Total Expenses |  |
| 2528 | rentalTHTotalExpA | number | Total Expenses |  |
| 2532 | rentalTHNetIncomeM | number | Net Income |  |
| 2533 | rentalTHNetIncomeA | number | Net Income |  |
| 2538 | rentalTHCapRate | number | Cap Rate (%) — NOI / (Rent x 12) | CapRate |

## Tab 4: LISTING DISTRIBUTION --  (12 controls)

### IDX / VOW / Syndication Controls  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2579 | rentalIDXEntireListingDisplayYN | checkbox |  | InternetEntireListingDisplayYN |
| 2591 | rentalVOWOptOutYN | checkbox |  | InternetEntireListingDisplayYN |
| 2603 | rentalSyndicateYN | checkbox |  | SyndicateTo |

### Send Listing To  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2619 | rentalSendToAll | checkbox |  | SyndicateTo |
| 2623 | rentalDist_IDX | checkbox | IDX | InternetEntireListingDisplayYN |
| 2624 | rentalDist_VOW | checkbox | VOW | InternetEntireListingDisplayYN |
| 2625 | rentalDist_Listhub | checkbox | Listhub | SyndicateTo |
| 2626 | rentalDist_NYMLS | checkbox | NY MLS | SyndicateTo |
| 2627 | rentalDist_Realtor | checkbox | Realtor | SyndicateTo |
| 2628 | rentalDist_RPX | checkbox | RPeXchange | SyndicateTo |
| 2629 | rentalDist_WWW | checkbox | Web (WWW) | InternetEntireListingDisplayYN |
| 2630 | rentalDist_RLS | checkbox | RLS Participants | SyndicateTo |

## Tab 5: PREVIEW --  (1 controls)

### [panel: Building Amenities] > Transit & Commute  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2912 | rentalCommuteAddress | text | Commute Calculator |  |

## Tab 7: COMMISSION REQUEST  (278 controls)

### Property Information Auto-populated from listing  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2993 | commRentalRlsId | text | RLS / Listing ID |  |
| 2997 | commRentalAddress | text | Full Property Address |  |
| 3001 | commRentalBorough | text | Borough |  |
| 3005 | commRentalListPrice | text | Listed Rent |  |
| 3009 | commRentalFinalPrice | number | Final Monthly Rent * |  |
| 3014 | commRentalBedBath | text | Bedrooms / Bathrooms |  |
| 3018 | commRentalSqFt | text | Approx. Sq Ft |  |

### Deal Parties  - 10 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3029 | commRentalLandlordName | text | Landlord Name * |  |
| 3033 | commRentalLandlordAttorney | text | Landlord Attorney / Management Co. |  |
| 3037 | commRentalTenantName | text | Tenant Name * |  |
| 3041 | commRentalTenantEmail | email | Tenant Email * |  |
| 3045 | commRentalTenantPhone | tel | Tenant Phone * |  |
| 3049 | commRentalTenantAttorney | text | Tenant Attorney |  |
| 3057 | commRentalListingAgent | text | Listing Agent (Our Side) |  |
| 3061 | commRentalCoListAgent | text | Co-Listing Agent |  |
| 3065 | commRentalTenantAgent | text | Tenant's Agent (Cooperating) |  |
| 3069 | commRentalCoopBrokerage | text | Cooperating Brokerage |  |

### Commission Calculation  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3083 | commRentalBasis | select | Commission Basis * |  |
| 3092 | commRentalCommValue | number | Commission Amount * |  |
| 3113 | commRentalListingSidePct | number | 50 |  |
| 3121 | commRentalCoopSidePct | number | 50 |  |
| 3136 | commRentalAgentSplitPct | number | Agent Split % |  |

### Payment Information  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3167 | commRentalPayMethod | radio | Payment Method * |  |
| 3172 | commRentalPayMethod | radio |  |  |
| 3180 | commRentalLeaseStart | date | Lease Start Date * |  |
| 3185 | commRentalNotes | textarea | Notes / Special Instructions |  |

### [panel: rentalMediaModal] > Payment Information  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3264 | rentalPhotoInput | file |  |  |
| 3292 | rentalVideoUrl | url | Video URL | VirtualTourURLBranded |
| 3297 | rentalVideoTourUrl | url | Video Tour URL | VirtualTourURLUnbranded |
| 3311 | rentalFloorplanInput | file |  |  |
| 3321 | rentalMatterportUrl | url | Branded Tour URL (with broker branding) | VirtualTourURLUnbranded2 |
| 3326 | rentalVirtualTourUnbranded | url | Unbranded Tour URL (no watermark) | VirtualTourURLUnbranded |
| 3331 | rentalVirtualTourUnbranded2 | url | Unbranded Tour URL 2 | VirtualTourURLUnbranded2 |
| 3336 | rentalVirtualTourUnbranded3 | url | Unbranded Tour URL 3 | VirtualTourURLUnbranded3 |
| 3349 | rentalDocInput | file |  |  |

### Sub-tab 1.1 Location > [panel: Building Information] > Building Address  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3432 | bldgStreetAddress | text | Street Address * | StreetName |
| 3436 | bldgName | text | Building Name | BuildingName |
| 3440 | bldgCity | text | City * | City |
| 3444 | bldgState | select | State * | StateOrProvince |
| 3452 | bldgZip | text | ZIP Code * | PostalCode |
| 3456 | bldgNeighborhood | select | Neighborhood * | SubdivisionName |
| 3513 | bldgBorough | select | Borough * | CityRegion |
| 3523 | bldgCrossStreet1 | text | Cross Street 1 | CrossStreet |
| 3527 | bldgCrossStreet2 | text | Cross Street 2 |  |

### Sub-tab 1.1 Location > [panel: Building Information] > Transportation  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3537 | bldgSubwayLines | text | Nearest Subway Lines |  |
| 3541 | bldgSubwayStation | text | Nearest Subway Station |  |

### Sub-tab 1.2 Next: Essentials > [panel: Building Information] > Building Details  - 10 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3558 | bldgType | select | Building Type * | StructureType |
| 3580 | bldgClass | select | Building Class |  |
| 3592 | bldgYearBuilt | number | Year Built * | YearBuilt |
| 3596 | bldgYearRenovated | number | Year Renovated |  |
| 3600 | bldgArchitecturalStyle | select | Architectural Style | ArchitecturalStyle |
| 3630 | bldgTotalFloors | number | Total Floors * | StoriesTotal |
| 3634 | bldgTotalUnits | number | Total Units * | NumberOfUnitsTotal |
| 3638 | bldgResidentialUnits | number | Residential Units |  |
| 3642 | bldgCommercialUnits | number | Commercial Units |  |
| 3646 | bldgParkingSpaces | number | Total Parking Spaces | OpenParkingSpaces |

### Sub-tab 1.2 Next: Essentials > [panel: Building Information] > Building Status  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3654 | bldgLandmark | checkbox | Landmark Building | LandmarkStatusYN |
| 3655 | bldgHistoric | checkbox | Historic District | BuildingFeatures |
| 3656 | bldgLEED | checkbox | LEED Certified | BuildingFeatures |
| 3657 | bldgNewConstruction | checkbox | New Construction | NewConstructionYN |
| 3658 | bldgNewDevelopment | checkbox | New Development | NewConstructionYN |
| 3659 | bldgConversion | checkbox | Conversion | BuildingFeatures |
| 3660 | bldgSponsorUnits | checkbox | Has Sponsor Units | SponsorUnitYN |

### Sub-tab 1.3 Next: Features > [panel: Building Information] > Building Attendance Type *  - 16 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3677 | rentalAttendanceType | checkbox | Doorman (Full-Time) | AttendanceType |
| 3678 | rentalAttendanceType | checkbox | Doorman (Part-Time) |  |
| 3679 | rentalAttendanceType | checkbox | Doorman (Yes) |  |
| 3680 | rentalAttendanceType | checkbox | Concierge (Full-Time) |  |
| 3681 | rentalAttendanceType | checkbox | Concierge (Part-Time) |  |
| 3682 | rentalAttendanceType | checkbox | Concierge (Yes) |  |
| 3683 | rentalAttendanceType | checkbox | Elevator Att. (Full-Time) |  |
| 3684 | rentalAttendanceType | checkbox | Elevator Att. (Part-Time) |  |
| 3685 | rentalAttendanceType | checkbox | Elevator Att. (Yes) |  |
| 3686 | rentalAttendanceType | checkbox | Lobby Att. (Full-Time) |  |
| 3687 | rentalAttendanceType | checkbox | Lobby Att. (Part-Time) |  |
| 3688 | rentalAttendanceType | checkbox | Lobby Att. (Yes) |  |
| 3689 | rentalAttendanceType | checkbox | Video Doorman (Full-Time) |  |
| 3690 | rentalAttendanceType | checkbox | Video Doorman (Part-Time) |  |
| 3691 | rentalAttendanceType | checkbox | Video Doorman (Yes) |  |
| 3692 | rentalAttendanceType | checkbox | None |  |

### Sub-tab 1.3 Next: Features > [panel: Building Information] > Building Amenities  - 20 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3699 | bldgElevator | checkbox | Elevator | BuildingFeatures |
| 3700 | bldgLaundry | checkbox | Laundry Room | LaundryFeatures |
| 3701 | bldgGym | checkbox | Gym/Fitness Center | BuildingFeatures |
| 3702 | bldgPool | checkbox | Pool | BuildingFeatures |
| 3703 | bldgRoofDeck | checkbox | Roof Deck | BuildingFeatures |
| 3704 | bldgCourtyard | checkbox | Courtyard/Garden | BuildingFeatures |
| 3705 | bldgPlayroom | checkbox | Children's Playroom | BuildingFeatures |
| 3706 | bldgLounge | checkbox | Resident Lounge | BuildingFeatures |
| 3707 | bldgBusinessCenter | checkbox | Business Center | BuildingFeatures |
| 3708 | bldgConferenceRoom | checkbox | Conference Room | BuildingFeatures |
| 3709 | bldgBikeRoom | checkbox | Bike Room | BuildingFeatures |
| 3710 | bldgStorage | checkbox | Storage Available | BuildingFeatures |
| 3711 | bldgParking | checkbox | Parking Garage | BuildingFeatures |
| 3712 | bldgValet | checkbox | Valet Parking | BuildingFeatures |
| 3713 | bldgPackageRoom | checkbox | Package Room | BuildingFeatures |
| 3714 | bldgColdStorage | checkbox | Cold Storage | BuildingFeatures |
| 3715 | bldgLiveInSuper | checkbox | Live-In Super | BuildingFeatures |
| 3716 | bldgOnSiteManager | checkbox | On-Site Manager | BuildingFeatures |
| 3717 | bldgWheelchairAccess | checkbox | Wheelchair Access | BuildingFeatures |
| 3718 | bldgSpa | checkbox | Spa | BuildingFeatures |

### Sub-tab 1.3 Next: Features > [panel: Building Information] > Building Systems  - 64 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3727 | bldgFuelType | select | Fuel Type |  |
| 3736 | bldgNumElevators | number | Number of Elevators | ElevatorsTotal |
| 3744 | bldgHeating | checkbox | Bldg Steam |  |
| 3745 | bldgHeating | checkbox | Hot Water |  |
| 3746 | bldgHeating | checkbox | Bldg Electric |  |
| 3747 | bldgHeating | checkbox | Bldg Natural Gas |  |
| 3748 | bldgHeating | checkbox | Forced Air |  |
| 3749 | bldgHeating | checkbox | Radiant |  |
| 3750 | bldgHeating | checkbox | Bldg City Steam |  |
| 3751 | bldgHeating | checkbox | Heat Pump |  |
| 3752 | bldgHeating | checkbox | Ductless |  |
| 3753 | bldgHeating | checkbox | Bldg Geothermal |  |
| 3754 | bldgHeating | checkbox | Bldg Oil |  |
| 3755 | bldgHeating | checkbox | Bldg Solar |  |
| 3757 | bldgHeating | checkbox | Passive Solar |  |
| 3758 | bldgHeating | checkbox | Fireplaces |  |
| 3759 | bldgHeating | checkbox | Fireplace Insert |  |
| 3760 | bldgHeating | checkbox | Wood Stove |  |
| 3761 | bldgHeating | checkbox | Pellet Stove |  |
| 3762 | bldgHeating | checkbox | Wood |  |
| 3764 | bldgHeating | checkbox | Kerosene |  |
| 3765 | bldgHeating | checkbox | Propane |  |
| 3766 | bldgHeating | checkbox | Propane Stove |  |
| 3767 | bldgHeating | checkbox | Space Heater |  |
| 3768 | bldgHeating | checkbox | Wall Furnace |  |
| 3769 | bldgHeating | checkbox | Floor Furnace |  |
| 3770 | bldgHeating | checkbox | Gravity |  |
| 3771 | bldgHeating | checkbox | Radiant Ceiling |  |
| 3772 | bldgHeating | checkbox | Radiant Floor |  |
| 3774 | bldgHeating | checkbox | Exhaust Fan |  |
| 3775 | bldgHeating | checkbox | Humidity Control |  |
| 3776 | bldgHeating | checkbox | Separate Meters |  |
| 3777 | bldgHeating | checkbox | Zoned |  |
| 3778 | bldgHeating | checkbox | Varies by Unit |  |
| 3779 | bldgHeating | checkbox | ENERGY STAR ACCA/RSI |  |
| 3780 | bldgHeating | checkbox | ENERGY STAR Equipment |  |
| 3781 | bldgHeating | checkbox | See Remarks |  |
| 3782 | bldgHeating | checkbox | None |  |
| 3783 | bldgHeating | checkbox | Other |  |
| 3790 | bldgCooling | checkbox | Central Air |  |
| 3791 | bldgCooling | checkbox | Ductless |  |
| 3792 | bldgCooling | checkbox | Wall Units |  |
| 3793 | bldgCooling | checkbox | Window Units |  |
| 3794 | bldgCooling | checkbox | Wall/Window Units |  |
| 3795 | bldgCooling | checkbox | Electric |  |
| 3796 | bldgCooling | checkbox | Building Cooling |  |
| 3797 | bldgCooling | checkbox | Heat Pump |  |
| 3798 | bldgCooling | checkbox | Dual |  |
| 3799 | bldgCooling | checkbox | Multi Units |  |
| 3800 | bldgCooling | checkbox | Zoned |  |
| 3801 | bldgCooling | checkbox | Separate Meters |  |
| 3802 | bldgCooling | checkbox | Whole House Fan |  |
| 3803 | bldgCooling | checkbox | Attic Fan |  |
| 3804 | bldgCooling | checkbox | Ceiling Fans |  |
| 3805 | bldgCooling | checkbox | Roof Turbines |  |
| 3806 | bldgCooling | checkbox | Gas |  |
| 3807 | bldgCooling | checkbox | Geothermal |  |
| 3808 | bldgCooling | checkbox | Evaporative Cooling |  |
| 3809 | bldgCooling | checkbox | Exhaust Fan |  |
| 3810 | bldgCooling | checkbox | Humidity Control |  |
| 3811 | bldgCooling | checkbox | ENERGY STAR Equipment |  |
| 3812 | bldgCooling | checkbox | Varies by Unit |  |
| 3813 | bldgCooling | checkbox | None |  |
| 3814 | bldgCooling | checkbox | Other |  |

### Sub-tab 1.4 Next: Financials > [panel: Building Information] > Financial Information (Co-op/Condo)  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3832 | bldgAssociationName | text | Association/Corp Name | AssociationName |
| 3836 | bldgTotalShares | number | Total Shares (Co-op) |  |
| 3840 | bldgUnderlying | text | Underlying Mortgage |  |
| 3844 | bldgCapitalReserves | text | Capital Reserves | CapitalReservesTotal |
| 3848 | bldgCapitalReservesYN | checkbox | Capital Reserves | CapitalReservesYN |
| 3853 | bldgReserveFund | text | Reserve Fund | CapitalReservesTotal |
| 3857 | bldgAvgMaint | text | Common Charges/Maint (Avg) |  |

### Sub-tab 1.4 Next: Financials > [panel: Building Information] > Tax Information  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3868 | bldgTaxBlock | text | Tax Block | TaxBlock |
| 3872 | bldgTaxLot | text | Tax Lot | BuildingTaxLot |
| 3876 | bldgAnnualTaxes | text | Annual RE Taxes |  |

### Sub-tab 1.4 Next: Financials > [panel: Building Information] > Tax Abatement  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3887 | bldgTaxAbatementYN | select | Has Tax Abatement | TaxAbatementYN |
| 3897 | bldgTaxAbatementExpYear | number | Abatement Expiration Year |  |
| 3901 | bldgTaxAbatementComments | text | Abatement Comments | TaxAbatementComments |

### Sub-tab 1.4 Next: Financials > [panel: Building Information] > Flip Tax Information  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3911 | bldgFlipTax | select | Flip Tax | FlipTax |
| 3921 | bldgFlipTaxAmount | text | Flip Tax Amount | FlipTax |
| 3925 | bldgFlipTaxPaidBy | select | Paid By |  |

### Sub-tab 1.4 Next: Financials > [panel: Building Information] > Documents Available (Upon Request)  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3940 | bldgDocsAvailable | checkbox | Building Rules | DocumentsAvailable |
| 3941 | bldgDocsAvailable | checkbox | Bylaws & Amendments |  |
| 3942 | bldgDocsAvailable | checkbox | Financial Statement |  |
| 3943 | bldgDocsAvailable | checkbox | Offering Plan |  |
| 3944 | bldgDocsAvailable | checkbox | Board Package Template |  |
| 3945 | bldgDocsAvailable | checkbox | Schedule A |  |

### Sub-tab 1.5 Next: Description > [panel: Building Information] > Building Description  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3962 | bldgDescription | textarea | Building Description | PublicRemarks |
| 3967 | bldgWebsite | url | Building Website |  |

### Sub-tab 2.1 General > [panel: Building Information] > Building Pet Policy *  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3994 | rentalBuildingPetsAllowed | checkbox | Yes (All Pets) |  |
| 3995 | rentalBuildingPetsAllowed | checkbox | Cats OK |  |
| 3996 | rentalBuildingPetsAllowed | checkbox | Dogs OK |  |
| 3997 | rentalBuildingPetsAllowed | checkbox | Breed Restrictions |  |
| 3998 | rentalBuildingPetsAllowed | checkbox | Size Limit |  |
| 3999 | rentalBuildingPetsAllowed | checkbox | Number Limit |  |
| 4000 | rentalBuildingPetsAllowed | checkbox | No Pets |  |
| 4005 | bldgPetWeightLimit | number | Weight Limit (lbs) |  |
| 4009 | bldgPetNotes | text | Pet Policy Notes |  |

### Sub-tab 2.1 General > [panel: Building Information] > General Policies  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4017 | bldgWasherDryerAllowed | checkbox | Washer/Dryer Allowed | LaundryFeatures |
| 4018 | bldgPiedATerre | checkbox | Pied-a-Terre Allowed |  |
| 4019 | bldgParentsAllowed | checkbox | Parents Buying Allowed | BuildingFeatures |
| 4020 | bldgCoBuyersAllowed | checkbox | Co-Buyers Allowed | BuildingFeatures |
| 4021 | bldgCorpOwnAllowed | checkbox | Corp/LLC Purchase Allowed | BuildingFeatures |
| 4022 | bldgGiftsAllowed | checkbox | Gifts Allowed for Down Payment | BuildingFeatures |

### Sub-tab 2.2 Next: Rental Policies > [panel: Building Information] > Subletting/Rental Policy  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4038 | bldgSublettingAllowed | select | Subletting Allowed |  |
| 4048 | bldgMaxSubletYears | number | Max Sublet Years |  |
| 4052 | bldgSubletFee | text | Sublet Fee |  |

### Sub-tab 2.2 Next: Rental Policies > [panel: Building Information] > Tenant Requirements  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4062 | bldgMinIncome | text | Min Income Requirement |  |
| 4066 | bldgMinCreditScore | number | Min Credit Score |  |
| 4070 | bldgGuarantors | select | Guarantors | GuarantorsAcceptedYN |
| 4080 | bldgMaxOccupants | text | Max Occupants |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: Building Information] > Purchase Requirements (Co-op)  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4098 | bldgMaxFinancing | text | Max Financing Allowed | MaximumFinancingAmount |
| 4102 | bldgMinDownPayment | text | Min Down Payment |  |
| 4106 | bldgDTIRatio | text | DTI Ratio Requirement |  |
| 4110 | bldgPostCloseLiquidity | text | Post-Close Liquidity |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: Building Information] > Board Process  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4118 | bldgBoardApproval | checkbox | Board Approval Required | BuildingFeatures |
| 4119 | bldgBoardInterview | checkbox | Board Interview Required |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: Building Information] > Management Company  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4137 | bldgMgmtCompany | text | Company Name |  |
| 4141 | bldgMgmtPhone | tel | Phone |  |
| 4145 | bldgMgmtEmail | email | Email |  |
| 4149 | bldgMgmtAddress | text | Address |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: Building Information] > Building Staff  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4160 | bldgSuperName | text | Name |  |
| 4161 | bldgSuperPhone | tel | Phone |  |
| 4162 | bldgSuperEmail | email | Email |  |
| 4168 | bldgManagerName | text | Name |  |
| 4169 | bldgManagerPhone | tel | Phone |  |
| 4170 | bldgManagerEmail | email | Email |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: Building Information] > Board Information (Co-op/Condo)  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4181 | bldgBoardPresident | text | Board President |  |
| 4185 | bldgBoardEmail | email | Board Contact Email |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: rentalPrintModal] > Board Information (Co-op/Condo)  - 15 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4253 | (no id) | checkbox | Listing Type & Agent Info |  |
| 4254 | (no id) | checkbox | Property Classification |  |
| 4255 | (no id) | checkbox | Address & Location |  |
| 4256 | (no id) | checkbox | Pricing & Rental Terms |  |
| 4258 | (no id) | checkbox | Room Layout & Dimensions |  |
| 4259 | (no id) | checkbox | Interior Features & Condition |  |
| 4260 | (no id) | checkbox | Utilities & Systems |  |
| 4262 | (no id) | checkbox | Building Overview |  |
| 4263 | (no id) | checkbox | Amenities & Services |  |
| 4264 | (no id) | checkbox | Policies & Rules |  |
| 4266 | (no id) | checkbox | Distribution Gates & IDX Settings |  |
| 4268 | (no id) | checkbox | Listing Description |  |
| 4269 | (no id) | checkbox | Photos |  |
| 4275 | rentalPrintBranding | checkbox | Include Mallan Branding Header/Footer |  |
| 4276 | rentalPrintLandscape | checkbox | Landscape orientation |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: rentalEmailModal] > Board Information (Co-op/Condo)  - 15 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4299 | rentalEmailTo | email | To |  |
| 4303 | rentalEmailCC | email | CC |  |
| 4307 | rentalEmailSubject | text | Subject |  |
| 4311 | rentalEmailMessage | textarea | Message |  |
| 4793 | (no id) | select |  |  |
| 6013 | (no id) | select |  |  |
| 6025 | (no id) | text | Description |  |
| 6026 | (no id) | number | $0.00 |  |
| 6167 | (no id) | date | Date |  |
| 6171 | (no id) | time | Start Time |  |
| 6175 | (no id) | time | End Time |  |
| 6179 | (no id) | select | Type |  |
| 6189 | (no id) | text | Notes |  |
| 6343 | (no id) | text | REBNY Company |  |
| 6349 | (no id) | text | Agent Name |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: rentalFinancialCalcModal] > Board Information (Co-op/Condo)  - 21 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 7938 | rentalCalcPrice | number | Purchase Price / Investment ($) |  |
| 7939 | rentalCalcDown | number | Down Payment (%) |  |
| 7940 | rentalCalcRate | number | Interest Rate (%) |  |
| 7941 | rentalCalcTerm | select | Loan Term (years) |  |
| 7952 | rentalClosingPrice | number | Sale/Purchase Price ($) |  |
| 7965 | rentalCoCNOI | number | Annual Net Operating Income ($) |  |
| 7966 | rentalCoCCash | number | Total Cash Invested ($) |  |
| 7975 | rentalROIPrice | number | Purchase Price ($) |  |
| 7976 | rentalROIRent | number | Monthly Rent ($) |  |
| 7977 | rentalROIExpenses | number | Annual Expenses ($) |  |
| 7978 | rentalROIYears | number | Hold Period (years) |  |
| 7990 | rentalRvBRent | number | Current Monthly Rent ($) |  |
| 7991 | rentalRvBRentInc | number | Annual Rent Increase (%) |  |
| 7992 | rentalRvBPrice | number | Equivalent Purchase Price ($) |  |
| 7993 | rentalRvBOwn | number | Monthly Ownership Cost ($) |  |
| 7994 | rentalRvBYears | number | Comparison Period (years) |  |
| 8005 | rentalBvSValue | number | Current Property Value ($) |  |
| 8006 | rentalBvSAppreciation | number | Annual Appreciation (%) |  |
| 8007 | rentalBvSRent | number | Monthly Rental Income ($) |  |
| 8008 | rentalBvSExpenses | number | Monthly Expenses ($) |  |
| 8009 | rentalBvSYears | number | Hold Period (years) |  |

