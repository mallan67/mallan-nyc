# RENTAL-FORM-REDESIGN.html - structure read from source (origin/main)

Generated 2026-10-15. Sections are taken from the markup (tab ids, sub-tab ids, card headers, panel/modal headings); controls are listed under the last section marker above them.

Control total: 716

## (top of page)  (1 controls)

### (no sub-section)  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 225 | rentalShowRequiredOnly | checkbox |  |  |

## Tab 1: LISTING INFORMATION  (208 controls)

### Sub-tab 1.1 Location > Property Address — IDX Lookup  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 281 | rentalStreetAddress | text | Street Address * | StreetName |
| 286 | rentalUnitNumber | text | Unit / Apt | UnitNumber |
| 291 | rentalBorough | select | Borough * | CityRegion |
| 305 | rentalZipCode | text | Zip Code * | PostalCode |
| 309 | rentalPostalCity | text | Postal City * | PostalCity |
| 314 | rentalNeighborhoodFromAddress | text | Neighborhood |  |
| 318 | rentalCountyOrParish | text | County | CountyOrParish |

### Sub-tab 1.1 Location > Agent & Dates  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 338 | rentalUpdatingAgentDisplay | text | Listing Agent |  |
| 344 | rentalCreateDate | date | Create Date |  |
| 351 | rentalLastUpdatedDate | date | Last Updated |  |

### Sub-tab 1.1 Location > Listing Type & Classification  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 368 | rentalListingType | radio |  |  |
| 372 | rentalListingType | radio |  |  |
| 376 | rentalListingType | radio |  |  |
| 380 | rentalListingType | radio |  |  |
| 386 | rentalListingType | radio |  |  |
| 391 | rentalListingType | radio |  |  |
| 395 | rentalListingType | radio |  |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Listing Type & Classification  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 469 | (no id) | checkbox |  |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Agreements & Disclosures  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 483 | rentalCoBrokeAgreement | radio | CoBroke Agreement * |  |
| 486 | rentalCoBrokeAgreement | radio | CoBroke Agreement * |  |
| 493 | rentalCommNegotiabilityAck | checkbox |  |  |
| 505 | rentalOptOutFormUpload | file | Owner Opt-Out Form (Exhibit B) * |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Status & Pricing  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 516 | rentalStatus | select | Status * | MlsStatus |
| 586 | rentalMonthlyRent | number | Monthly Rent * |  |
| 590 | rentalNetEffectiveRent | number | Net Effective Rent |  |
| 594 | rentalSecurityDeposit | number | Security Deposit | SecurityDeposit |
| 598 | rentalRentedPrice | number | Rented Price * |  |
| 608 | rentalInternetAVMDisplayYN | radio |  | InternetAutomatedValuationDisplayYN |
| 612 | rentalInternetAVMDisplayYN | radio |  |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Property Type & Ownership  - 80 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 638 | rentalPropertyType | radio | Condo | PropertyType |
| 639 | rentalPropertyType | radio | Co-op |  |
| 640 | rentalPropertyType | radio | Condop |  |
| 641 | rentalPropertyType | radio | Single Family TH |  |
| 642 | rentalPropertyType | radio | Multi-Family TH |  |
| 643 | rentalPropertyType | radio | Single Family |  |
| 644 | rentalPropertyType | radio | Multi-Family |  |
| 645 | rentalPropertyType | radio | Mixed Use |  |
| 646 | rentalPropertyType | radio | Loft |  |
| 647 | rentalPropertyType | radio | Rental Building |  |
| 651 | rentalPropertyType | radio | Duplex (2 Unit) |  |
| 652 | rentalPropertyType | radio | Triplex (3 Unit) |  |
| 653 | rentalPropertyType | radio | Quadruplex (4 Unit) |  |
| 657 | rentalPropertyType | radio | Office |  |
| 658 | rentalPropertyType | radio | Retail |  |
| 664 | rentalOfficeRetailOwnership | radio | Condo |  |
| 665 | rentalOfficeRetailOwnership | radio | Co-op |  |
| 666 | rentalOfficeRetailOwnership | radio | Condop |  |
| 667 | rentalOfficeRetailOwnership | radio | Townhouse |  |
| 668 | rentalOfficeRetailOwnership | radio | Mixed Use |  |
| 669 | rentalOfficeRetailOwnership | radio | Fee Simple |  |
| 677 | rentalBuildingStatus | radio | Existing |  |
| 678 | rentalBuildingStatus | radio | New Development |  |
| 679 | rentalBuildingStatus | radio | New Conversion |  |
| 687 | rentalStructureType | select | Structure Type * | StructureType |
| 709 | rentalCommonInterest | select | Ownership Structure (CommonInterest) * | CommonInterest |
| 737 | rentalPropertyType | radio |  |  |
| 752 | rentalCommSubtype | checkbox | Professional Office |  |
| 753 | rentalCommSubtype | checkbox | Medical Office |  |
| 754 | rentalCommSubtype | checkbox | Dental Office |  |
| 755 | rentalCommSubtype | checkbox | Flexible Space |  |
| 761 | rentalCommSubtype | checkbox | Restaurant |  |
| 762 | rentalCommSubtype | checkbox | Grocery |  |
| 763 | rentalCommSubtype | checkbox | Showroom |  |
| 764 | rentalCommSubtype | checkbox | Strip Mall |  |
| 770 | rentalCommSubtype | checkbox | Industrial |  |
| 771 | rentalCommSubtype | checkbox | Warehouse |  |
| 772 | rentalCommSubtype | checkbox | Manufacturing |  |
| 773 | rentalCommSubtype | checkbox | Distribution |  |
| 774 | rentalCommSubtype | checkbox | Storage |  |
| 780 | rentalCommSubtype | checkbox | Mixed Use |  |
| 781 | rentalCommSubtype | checkbox | Live/Work |  |
| 782 | rentalCommSubtype | checkbox | Investment |  |
| 783 | rentalCommSubtype | checkbox | Institutional |  |
| 784 | rentalCommSubtype | checkbox | Special Use |  |
| 794 | rentalCommercialOwnership | radio | Commercial Condo |  |
| 795 | rentalCommercialOwnership | radio | Commercial Condop |  |
| 796 | rentalCommercialOwnership | radio | Commercial Co-op |  |
| 797 | rentalCommercialOwnership | radio | Whole Building |  |
| 798 | rentalCommercialOwnership | radio | Land Only |  |
| 804 | rentalTenantConfig | radio | Single Tenant |  |
| 805 | rentalTenantConfig | radio | Multi-Tenant |  |
| 815 | rentalBusinessType | checkbox | Medical | BusinessType |
| 816 | rentalBusinessType | checkbox | Dental |  |
| 817 | rentalBusinessType | checkbox | Health Services |  |
| 818 | rentalBusinessType | checkbox | Fitness |  |
| 824 | rentalBusinessType | checkbox | Restaurant |  |
| 825 | rentalBusinessType | checkbox | Food & Beverage |  |
| 826 | rentalBusinessType | checkbox | Bar/Tavern/Lounge |  |
| 827 | rentalBusinessType | checkbox | Fast Food |  |
| 828 | rentalBusinessType | checkbox | Bakery |  |
| 834 | rentalBusinessType | checkbox | Professional Service |  |
| 835 | rentalBusinessType | checkbox | Financial |  |
| 836 | rentalBusinessType | checkbox | Real Estate |  |
| 837 | rentalBusinessType | checkbox | Accounting |  |
| 838 | rentalBusinessType | checkbox | Computer/Technology |  |
| 844 | rentalBusinessType | checkbox | Barber/Beauty |  |
| 845 | rentalBusinessType | checkbox | Dry Cleaner |  |
| 846 | rentalBusinessType | checkbox | Laundromat |  |
| 847 | rentalBusinessType | checkbox | Child Care |  |
| 853 | rentalBusinessType | checkbox | Hotel/Motel |  |
| 854 | rentalBusinessType | checkbox | Bed & Breakfast |  |
| 855 | rentalBusinessType | checkbox | Hospitality |  |
| 864 | (no id) | number | Usable Sq Ft |  |
| 868 | (no id) | select | Lease Type |  |
| 880 | (no id) | select | Zoning |  |
| 897 | (no id) | number | Ceiling Height (ft) |  |
| 901 | (no id) | number | Frontage (ft) |  |
| 905 | (no id) | text | Min Lease Term |  |
| 909 | (no id) | date | Lease Expiration |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Building Requirements  - 16 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 922 | rentalBoardApproval | radio | Y | BuildingFeatures |
| 923 | rentalBoardApproval | radio | N |  |
| 927 | rentalBoardInterview | radio | Y |  |
| 928 | rentalBoardInterview | radio | N |  |
| 932 | rentalMeetAndGreet | radio | Y |  |
| 933 | rentalMeetAndGreet | radio | N |  |
| 937 | rentalBoardApplication | radio | Y |  |
| 938 | rentalBoardApplication | radio | N |  |
| 942 | rentalFirstRefusal | radio | Y |  |
| 943 | rentalFirstRefusal | radio | N |  |
| 947 | rentalFilmLocation | radio | Y |  |
| 948 | rentalFilmLocation | radio | N |  |
| 952 | rentalLiveWorkAllowed | radio | Y |  |
| 953 | rentalLiveWorkAllowed | radio | N |  |
| 957 | rentalSubleaseAllowed | radio | Y |  |
| 958 | rentalSubleaseAllowed | radio | N |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Rental Options  - 15 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 970 | rentalGuarantors | radio | Yes | GuarantorsAcceptedYN |
| 971 | rentalGuarantors | radio | No |  |
| 977 | rentalFurnished | radio | Yes |  |
| 978 | rentalFurnished | radio | No |  |
| 985 | rentalPetsAllowed | checkbox | Yes | PetsAllowed |
| 986 | rentalPetsAllowed | checkbox | Cats OK |  |
| 987 | rentalPetsAllowed | checkbox | Dogs OK |  |
| 988 | rentalPetsAllowed | checkbox | Breed Restr. |  |
| 989 | rentalPetsAllowed | checkbox | Size Limit |  |
| 990 | rentalPetsAllowed | checkbox | Number Limit |  |
| 991 | rentalPetsAllowed | checkbox | No Pets |  |
| 1000 | rentalSmoking | radio | Yes | BuildingSmokeFreeYN |
| 1001 | rentalSmoking | radio | No |  |
| 1007 | rentalStudents | radio | Yes |  |
| 1008 | rentalStudents | radio | No |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Important Dates  - 8 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1021 | rentalDateListed | date | Date Listed * | OnMarketDate |
| 1029 | rentalAvailableDate | date | Available Date * | AvailabilityDate |
| 1036 | rentalExclusiveStart | date | Exclusive Start Date * |  |
| 1043 | rentalExclusiveExpires | date | Exclusive Expires (Hidden from public) | ExpirationDate |
| 1051 | rentalFirstCoBroke | date | First Date To CoBroke |  |
| 1057 | rentalFirstShowingDate | datetime-local | First Showing Date | ActivationDate |
| 1063 | rentalOffMarketDate | date | Off Market Date | OffMarketDate |
| 1070 | rentalRentedDate | date | Rented Date * |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Fee Disclosure (FARE Act — NYC LL 119/2024)  - 11 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1084 | rentalMoveInCosts | text | Move-In Costs | MoveInCosts |
| 1089 | rentalMoveInCostsAmount | number | Move-In Cost Amount ($) | MoveInCostsAmount |
| 1095 | rentalMoveInCostsComments | textarea | Move-In Costs Comments | MoveInCostsComments |
| 1100 | rentalOngoingFees | text | Ongoing Fees | OngoingFees |
| 1105 | rentalFeeFrequency | select | Fee Frequency | AdditionalFeeFrequency |
| 1125 | rentalTenantPays | text | Tenant Pays | TenantPays |
| 1130 | rentalTenantPaysDescription | text | Tenant Pays Description | TenantPaysDescription |
| 1137 | rentalAdditionalFeeYN | select | Additional Fees? | AdditionalFeeYN |
| 1145 | rentalAdditionalFee | number | Additional Fee Amount ($) | AdditionalFee |
| 1149 | rentalAdditionalFeeFrequency | select | Additional Fee Frequency | AdditionalFeeFrequency |
| 1167 | rentalAdditionalFeeDescription | text | Additional Fee Description | AdditionalFeeDescription |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Rental Deal Fees (Co-op / Condo / Condop — Paid by Tenant)  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1187 | (no id) | select |  |  |
| 1188 | (no id) | select |  |  |
| 1189 | (no id) | select |  |  |
| 1190 | (no id) | select |  |  |
| 1191 | (no id) | select |  |  |
| 1192 | (no id) | select |  |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Concessions  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1212 | rentalConcessions | select | Concessions (RLS/RESO/IDX) | Concessions |
| 1221 | rentalConcessionAmount | number | Concession Amount | ConcessionsAmount |
| 1225 | rentalOwnerPays | checkbox | Owner Pays | OwnerPays |
| 1226 | rentalFreeRent | checkbox | Free Rent |  |
| 1227 | rentalOwnerPaysFreeRent | checkbox | Owner Pays AND Free Rent |  |
| 1232 | rentalFreeRentMonths | number | Free Rent Months |  |
| 1236 | rentalConcessionRemarks | text | Concession Remarks |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Lease Terms  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1247 | rentalLeaseTerm | select | Lease Term |  |
| 1258 | rentalLeaseType | select | Lease Type | AvailableLeaseType |
| 1266 | rentalMinLease | number | Min Lease (Months) | LeaseTerm |
| 1270 | rentalMaxLease | number | Max Lease (Months) | MaxLeaseMonths |
| 1275 | rentalLeaseRenewalOptionYN | radio | Yes | LeaseRenewalOptionYN |
| 1276 | rentalLeaseRenewalOptionYN | radio | No |  |

### Sub-tab 1.1 Location > [panel: rentalListingTypeInfoModal] > Commission Information  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1289 | rentalCommissionType | select | Tenant's Agent Commission |  |
| 1293 | rentalCommissionAmount | number | Tenant's Agent Commission |  |
| 1300 | rentalCommissionPaidBy | radio | Owner Pays (to Tenant's Agent) |  |
| 1301 | rentalCommissionPaidBy | radio | Tenant Pays |  |
| 1302 | rentalCommissionPaidBy | radio | Split |  |

### Sub-tab 1.2 Next: Essentials > [panel: rentalListingTypeInfoModal] > Listing URL & Display  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1323 | rentalListingUrl | text | Listing URL | ListingURL |
| 1329 | rentalWebDisplayAddress | select | Web Display Address |  |
| 1341 | rentalWebHeadline | text | Web Headline |  |

### Sub-tab 1.2 Next: Essentials > [panel: rentalListingTypeInfoModal] > FARE Act — Broker Fee Payment (NYC Local Law 119 of 2024)  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1353 | rentalFareActLandlordPays | radio |  |  |
| 1357 | rentalFareActLandlordPays | radio |  |  |

### Sub-tab 1.2 Next: Essentials > [panel: rentalListingTypeInfoModal] > Internet Display Controls  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1379 | rentalInternetEntireListingDisplayYN | checkbox |  | InternetEntireListingDisplayYN |
| 1386 | rentalInternetAddressDisplayYN | checkbox |  | InternetAddressDisplayYN |
| 1393 | rentalInternetConsumerCommentYN | checkbox |  | InternetConsumerCommentYN |

### Sub-tab 1.2 Next: Essentials > [panel: rentalListingTypeInfoModal] > Listing Description  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1415 | rentalDescription | textarea | Describe the property features, location highlight | PublicRemarks |

### Sub-tab 1.2 Next: Essentials > [panel: rentalListingTypeInfoModal] > Agent Remarks & Instructions  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1423 | rentalAgentRemarks | textarea | Agent Remarks (Private) |  |
| 1429 | rentalShowingInstructions | textarea | Showing Instructions | ShowingInstructions |
| 1437 | rentalFairHousingAck | checkbox |  |  |

### Sub-tab 1.3 Next: Features > [panel: rentalListingTypeInfoModal] > Listing Agent *  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1469 | rentalListingCompanySearch | text | REBNY Company * |  |
| 1476 | rentalListingAgentSearch | text | Agent/Broker Name * |  |

### Sub-tab 1.3 Next: Features > [panel: rentalListingTypeInfoModal] > Tenant's Agent (Required for Rented status)  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1509 | rentalTenantCompanySearch | text | REBNY Company |  |
| 1516 | rentalTenantAgentSearch | text | Agent/Broker Name |  |
| 1531 | rentalBuyerAgentRLSParticipantYN | checkbox | Tenant's Agent is RLS Participant |  |

### Sub-tab 1.3 Next: Features > [panel: rentalListingTypeInfoModal] > Owner / Landlord Contact  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1540 | rentalOwnerName | text | Owner Name |  |
| 1541 | rentalOwnerPhone | tel | Owner Phone |  |
| 1542 | rentalOwnerEmail | email | Owner Email |  |
| 1543 | rentalOwnerContactMethod | select | Preferred Contact |  |

### Sub-tab 1.3 Next: Features > [panel: rentalListingTypeInfoModal] > Building Contact  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1551 | rentalSuperName | text | Super/Manager Name |  |
| 1552 | rentalSuperPhone | tel | Super/Manager Phone |  |

### Sub-tab 1.3 Next: Features > [panel: rentalListingTypeInfoModal] > Team Information  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1563 | rentalListTeamName | text | Listing Team Name (RLS/RESO/IDX: ListTeamName) | ListTeamName |
| 1568 | rentalListTeamMlsId | text | Listing Team MLS ID (RLS/RESO/IDX: ListTeamMlsId) | ListTeamKey |

## Tab 2: UNIT INFORMATION --  (157 controls)

### Sub-tab 2.1 General > Property Location  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1661 | rentalStreetAddress2 | text | Street Address * |  |
| 1665 | rentalUnitNumber2 | text | Unit Number |  |
| 1669 | rentalCityDisplay | text | City * |  |
| 1673 | rentalState | select | State * | StateOrProvince |
| 1681 | rentalZip | text | ZIP Code * | PostalCode |
| 1685 | rentalNeighborhood | select | Neighborhood | SubdivisionName |

### Sub-tab 2.1 General > Unit Details  - 14 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1760 | rentalBedrooms | select | Bedrooms * | BedroomsTotal |
| 1769 | rentalFullBathrooms | select | Full Bathrooms * | BathroomsFull |
| 1777 | rentalHalfBathrooms | select | Half Bathrooms | BathroomsHalf |
| 1785 | rentalBathroomsTotal | number | Total Bathrooms * | BathroomsTotalInteger |
| 1789 | rentalTotalRooms | number | Total Rooms | RoomsTotal |
| 1795 | rentalSqFt | number | Approx. Sq Ft | LivingArea |
| 1799 | rentalFloor | text | Floor in Building | EntryLevel |
| 1803 | rentalLine | text | Unit Line | UnitNumber |
| 1807 | rentalUnitType | select | Unit Type | PropertySubType |
| 1838 | rentalCondition | select | Condition | PropertyCondition |
| 1852 | rentalFurnished | select | Furnished | Furnished |
| 1864 | rentalFurnishedRent | number | Furnished Monthly Rent | FurnishedListPrice |
| 1868 | rentalFurnishedMinMonths | number | Min Furnished Term (months) | FurnishedMinLeaseMonths |
| 1872 | rentalFurnishedMaxMonths | number | Max Furnished Term (months) | FurnishedMaxLeaseMonths |

### Sub-tab 2.1 General > Exposure & Views  - 11 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1884 | rentalExpNorth | checkbox | North | Exposures |
| 1885 | rentalExpSouth | checkbox | South | Exposures |
| 1886 | rentalExpEast | checkbox | East | Exposures |
| 1887 | rentalExpWest | checkbox | West | Exposures |
| 1893 | rentalViewCity | checkbox | City | View |
| 1894 | rentalViewWater | checkbox | Water | View |
| 1895 | rentalViewRiver | checkbox | River | View |
| 1896 | rentalViewPark | checkbox | Park | View |
| 1897 | rentalViewGarden | checkbox | Garden | View |
| 1898 | rentalViewSkyline | checkbox | Skyline | View |
| 1899 | rentalViewPanoramic | checkbox | Panoramic | View |

### Sub-tab 2.2 Next: Rental Policies > Kitchen  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1920 | rentalKitchenType | select | Kitchen Type |  |
| 1932 | rentalDishwasher | checkbox | Dishwasher | InteriorFeatures |
| 1933 | rentalGraniteCounters | checkbox | Granite Counters | InteriorFeatures |
| 1934 | rentalStainlessAppl | checkbox | Stainless Appliances | Appliances |
| 1935 | rentalMicrowave | checkbox | Microwave | Appliances |
| 1936 | rentalGasStove | checkbox | Gas Stove | Appliances |

### Sub-tab 2.2 Next: Rental Policies > Living Room  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1945 | rentalLivingRoom | checkbox | Living Room | InteriorFeatures |
| 1946 | rentalFormalLiving | checkbox | Formal Living | InteriorFeatures |
| 1947 | rentalGreatRoom | checkbox | Great Room | InteriorFeatures |

### Sub-tab 2.2 Next: Rental Policies > Dining  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1954 | rentalDiningRoom | checkbox | Dining Room | InteriorFeatures |
| 1955 | rentalFormalDining | checkbox | Formal Dining | InteriorFeatures |
| 1956 | rentalDiningArea | checkbox | Dining Area | InteriorFeatures |
| 1957 | rentalBreakfastNook | checkbox | Breakfast Nook | InteriorFeatures |

### Sub-tab 2.2 Next: Rental Policies > Additional Rooms  - 8 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1964 | rentalDen | checkbox | Den | InteriorFeatures |
| 1965 | rentalHomeOffice | checkbox | Home Office | InteriorFeatures |
| 1966 | rentalLibrary | checkbox | Library | InteriorFeatures |
| 1967 | rentalMaidsRoom | checkbox | Maid's Room | InteriorFeatures |
| 1968 | rentalNursery | checkbox | Nursery | InteriorFeatures |
| 1969 | rentalRecRoom | checkbox | Recreation Room | InteriorFeatures |
| 1970 | rentalMediaRoom | checkbox | Media Room | InteriorFeatures |
| 1971 | rentalSunroom | checkbox | Sunroom | InteriorFeatures |

### Sub-tab 2.2 Next: Rental Policies > Storage & Utility  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1978 | rentalWalkInCloset | checkbox | Walk-in Closet | InteriorFeatures |
| 1979 | rentalStorageRoom | checkbox | Storage Room | InteriorFeatures |
| 1980 | rentalLaundryRoom | checkbox | Laundry Room | InteriorFeatures |
| 1981 | rentalMudroom | checkbox | Mudroom | InteriorFeatures |

### Sub-tab 2.3 Next: Purchase Policies > Building Amenities  - 11 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1998 | rentalDoorman | checkbox | Doorman | BuildingFeatures |
| 1999 | rentalElevator | checkbox | Elevator | BuildingFeatures |
| 2000 | rentalGym | checkbox | Gym/Fitness | BuildingFeatures |
| 2002 | rentalBikeRoom | checkbox | Bike Room | BuildingFeatures |
| 2003 | rentalStorage | checkbox | Storage | BuildingFeatures |
| 2004 | rentalRoofDeck | checkbox | Roof Deck | BuildingFeatures |
| 2005 | rentalLiveInSuper | checkbox | Live-in Super | BuildingFeatures |
| 2006 | rentalParking | checkbox | Parking | BuildingFeatures |
| 2007 | rentalPool | checkbox | Pool | BuildingFeatures |
| 2008 | rentalConcierge | checkbox | Concierge | BuildingFeatures |
| 2009 | rentalValet | checkbox | Valet | BuildingFeatures |

### Sub-tab 2.3 Next: Purchase Policies > In-Unit Features  - 8 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2016 | rentalWasherDryer | checkbox | Washer/Dryer in Unit | InteriorFeatures |
| 2017 | rentalCentralAC | checkbox | Central AC | InteriorFeatures |
| 2018 | rentalHardwood | checkbox | Hardwood Floors | InteriorFeatures |
| 2019 | rentalHighCeilings | checkbox | High Ceilings | InteriorFeatures |
| 2020 | rentalFireplace | checkbox | Fireplace | InteriorFeatures |
| 2021 | rentalExposedBrick | checkbox | Exposed Brick | InteriorFeatures |
| 2022 | rentalPrewar | checkbox | Pre-War Details | InteriorFeatures |
| 2023 | rentalSmartHome | checkbox | Smart Home | InteriorFeatures |

### Sub-tab 2.3 Next: Purchase Policies > Private Outdoor Space  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2030 | rentalBalcony | checkbox | Balcony | ExteriorFeatures |
| 2031 | rentalTerrace | checkbox | Terrace | ExteriorFeatures |
| 2032 | rentalPatio | checkbox | Patio | ExteriorFeatures |
| 2033 | rentalPrivateRoof | checkbox | Private Roof Deck | ExteriorFeatures |
| 2034 | rentalPrivateGarden | checkbox | Private Garden | ExteriorFeatures |
| 2035 | rentalBackyard | checkbox | Backyard | ExteriorFeatures |

### Sub-tab 2.3 Next: Purchase Policies > Heating  - 45 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2043 | rentalHeatingYN | radio | Yes | HeatingYN |
| 2044 | rentalHeatingYN | radio | No |  |
| 2048 | rentalHeating | checkbox | Steam | Heating |
| 2049 | rentalHeating | checkbox | Hot Water |  |
| 2050 | rentalHeating | checkbox | Central |  |
| 2051 | rentalHeating | checkbox | Forced Air |  |
| 2052 | rentalHeating | checkbox | Baseboard |  |
| 2053 | rentalHeating | checkbox | Radiant |  |
| 2054 | rentalHeating | checkbox | Radiant Floor |  |
| 2055 | rentalHeating | checkbox | Electric |  |
| 2056 | rentalHeating | checkbox | Natural Gas |  |
| 2057 | rentalHeating | checkbox | City Steam |  |
| 2058 | rentalHeating | checkbox | Heat Pump |  |
| 2059 | rentalHeating | checkbox | Ductless |  |
| 2060 | rentalHeating | checkbox | Geothermal |  |
| 2061 | rentalHeating | checkbox | Active Solar |  |
| 2062 | rentalHeating | checkbox | Solar |  |
| 2063 | rentalHeating | checkbox | Passive Solar |  |
| 2064 | rentalHeating | checkbox | Fireplaces |  |
| 2065 | rentalHeating | checkbox | Fireplace Insert |  |
| 2066 | rentalHeating | checkbox | Wood Stove |  |
| 2067 | rentalHeating | checkbox | Pellet Stove |  |
| 2068 | rentalHeating | checkbox | Wood |  |
| 2069 | rentalHeating | checkbox | Oil |  |
| 2070 | rentalHeating | checkbox | Coal |  |
| 2071 | rentalHeating | checkbox | Coal Stove |  |
| 2072 | rentalHeating | checkbox | Kerosene |  |
| 2073 | rentalHeating | checkbox | Propane |  |
| 2074 | rentalHeating | checkbox | Propane Stove |  |
| 2075 | rentalHeating | checkbox | Space Heater |  |
| 2076 | rentalHeating | checkbox | Wall Furnace |  |
| 2077 | rentalHeating | checkbox | Floor Furnace |  |
| 2078 | rentalHeating | checkbox | Gravity |  |
| 2079 | rentalHeating | checkbox | Radiant Ceiling |  |
| 2080 | rentalHeating | checkbox | Ceiling |  |
| 2081 | rentalHeating | checkbox | Exhaust Fan |  |
| 2082 | rentalHeating | checkbox | Humidity Control |  |
| 2083 | rentalHeating | checkbox | Separate Meters |  |
| 2084 | rentalHeating | checkbox | Zoned |  |
| 2085 | rentalHeating | checkbox | Varies by Unit |  |
| 2086 | rentalHeating | checkbox | ENERGY STAR ACCA/RSI |  |
| 2087 | rentalHeating | checkbox | ENERGY STAR Equipment |  |
| 2088 | rentalHeating | checkbox | See Remarks |  |
| 2089 | rentalHeating | checkbox | None |  |
| 2090 | rentalHeating | checkbox | Other |  |

### Sub-tab 2.3 Next: Purchase Policies > Cooling  - 27 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2098 | rentalCoolingYN | radio | Yes | CoolingYN |
| 2099 | rentalCoolingYN | radio | No |  |
| 2103 | rentalCooling | checkbox | Central Air | Cooling |
| 2104 | rentalCooling | checkbox | Ductless |  |
| 2105 | rentalCooling | checkbox | Wall Units |  |
| 2106 | rentalCooling | checkbox | Window Units |  |
| 2107 | rentalCooling | checkbox | Wall/Window Units |  |
| 2108 | rentalCooling | checkbox | Electric |  |
| 2109 | rentalCooling | checkbox | Heat Pump |  |
| 2110 | rentalCooling | checkbox | Dual |  |
| 2111 | rentalCooling | checkbox | Multi Units |  |
| 2112 | rentalCooling | checkbox | Zoned |  |
| 2113 | rentalCooling | checkbox | Separate Meters |  |
| 2114 | rentalCooling | checkbox | Building Cooling |  |
| 2115 | rentalCooling | checkbox | Whole House Fan |  |
| 2116 | rentalCooling | checkbox | Attic Fan |  |
| 2117 | rentalCooling | checkbox | Ceiling Fans |  |
| 2118 | rentalCooling | checkbox | Roof Turbines |  |
| 2119 | rentalCooling | checkbox | Gas |  |
| 2120 | rentalCooling | checkbox | Geothermal |  |
| 2121 | rentalCooling | checkbox | Evaporative Cooling |  |
| 2122 | rentalCooling | checkbox | Exhaust Fan |  |
| 2123 | rentalCooling | checkbox | Humidity Control |  |
| 2124 | rentalCooling | checkbox | ENERGY STAR Equipment |  |
| 2125 | rentalCooling | checkbox | Varies by Unit |  |
| 2126 | rentalCooling | checkbox | None |  |
| 2127 | rentalCooling | checkbox | Other |  |

### Sub-tab 2.3 Next: Purchase Policies > Policies  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2142 | rentalGuarantorsPolicy | radio | Allowed |  |
| 2143 | rentalGuarantorsPolicy | radio | Required |  |
| 2144 | rentalGuarantorsPolicy | radio | Not Allowed |  |
| 2145 | rentalGuarantorsPolicy | radio | Case by Case |  |

## Tab 3: TOWNHOUSE / BUILDING INFO --  (77 controls)

### Sub-tab 3.1 Essentials > Property Details  - 8 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2178 | rentalTHStories | number | Stories (Property) * | Stories |
| 2182 | rentalTHUnitsTotal | number | # Residential Units * | NumberOfUnitsTotal |
| 2186 | rentalTHProfUnits | number | # Professional Units |  |
| 2190 | rentalTHRetailUnits | number | # Retail Units |  |
| 2194 | rentalTHNumBuildings | number | # Buildings | NumberOfBuildings |
| 2198 | rentalTHVacantUnits | number | # Vacant Units |  |
| 2202 | rentalTHCommercialYN | select | Commercial Units? | CommercialUnitsYN |
| 2206 | rentalTHDevStatus | select | Development Status | DevelopmentStatus |

### Sub-tab 3.1 Essentials > Lot Information  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2223 | rentalTHLotSize | number | Lot Size * | LotSizeArea |
| 2227 | rentalTHLotSizeUnits | select | Lot Size Units * | LotSizeUnits |
| 2233 | rentalTHLotDimensions | text | Lot Dimensions * | LotSizeDimensions |
| 2237 | rentalTHLotSizeSource | select | Lot Size Source | LotSizeSource |
| 2247 | rentalTHLandmark | select | Landmark Status | LandmarkStatusYN |
| 2251 | rentalTHLotFeatures | text | Lot Features | LotFeatures |

### Sub-tab 3.1 Essentials > Building Size & Structure  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2268 | rentalTHBuildingArea | number | Building Area Total * | BuildingAreaTotal |
| 2272 | rentalTHBuildingAreaUnits | select | Building Area Units | BuildingAreaUnits |
| 2276 | rentalTHGrossSqFt | number | Gross Square Footage |  |
| 2280 | rentalTHNetSqFt | number | Net Square Footage |  |
| 2284 | rentalTHFoundationArea | text | Foundation Area | FoundationArea |
| 2288 | rentalTHFoundation | select | Foundation Details | FoundationDetails |
| 2299 | rentalTHBasementYN | select | Basement | BasementYN |
| 2305 | (no id) | select | Basement Type |  |
| 2312 | rentalTHLevels | select | Levels | Levels |

### Sub-tab 3.1 Essentials > Zoning & FAR  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2325 | rentalTHZoning | text | Zoning Description | ZoningDescription |
| 2329 | rentalTHOverFAR | number | Area Over FAR (sq ft) |  |
| 2333 | rentalTHUnderFAR | number | Area Under FAR (sq ft) |  |

### Sub-tab 3.1 Essentials > Land Lease  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2343 | rentalTHLandLeaseYN | select | Land Lease? | LandLeaseYN |
| 2349 | rentalTHLandLeaseAmt | number | Land Lease Amount | LandLeaseAmount |
| 2353 | rentalTHLandLeaseFreq | select | Frequency | LandLeaseAmountFrequency |
| 2363 | rentalTHLandLeaseExp | date | Expiration Date | LandLeaseExpirationDate |

### Sub-tab 3.1 Essentials > Parking  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2373 | rentalTHGarageYN | select | Garage? | GarageYN |
| 2377 | rentalTHGarageSpaces | number | Garage Spaces | GarageSpaces |
| 2381 | rentalTHAttachedGarage | select | Attached? | AttachedGarageYN |
| 2385 | rentalTHOpenParkingYN | select | Open Parking? | OpenParkingYN |
| 2389 | rentalTHOpenSpaces | number | Open Spaces |  |
| 2393 | rentalTHParkingTotal | number | Total Parking | ParkingTotal |

### Sub-tab 3.1 Essentials > Documents Available (Upon Request)  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2403 | rentalTHDocsAvailable | checkbox | Building Rules | DocumentsAvailable |
| 2404 | rentalTHDocsAvailable | checkbox | Bylaws & Amendments |  |
| 2405 | rentalTHDocsAvailable | checkbox | Financial Statement |  |
| 2406 | rentalTHDocsAvailable | checkbox | Offering Plan |  |
| 2407 | rentalTHDocsAvailable | checkbox | Board Package Template |  |
| 2408 | rentalTHDocsAvailable | checkbox | Schedule A |  |

### Sub-tab 3.2 Next: Setup Sheet > Description  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2428 | rentalTHDescription | textarea | Enter property description. This will be used for  | PublicRemarks |

### Sub-tab 3.2 Next: Setup Sheet > Layout  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2437 | rentalTHLayout | textarea | Describe the property layout, floor plan, room arr |  |

### Sub-tab 3.2 Next: Setup Sheet > Notes  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2446 | rentalTHNotes | textarea | Internal notes, showing instructions, or additiona |  |

### Sub-tab 3.3 Next: Financials > Income & Expenses  - 27 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2469 | rentalTHGrossIncomeM | number | Gross Income |  |
| 2470 | rentalTHGrossIncomeA | number | Gross Income |  |
| 2474 | rentalTHTaxM | number | RE Tax |  |
| 2475 | rentalTHTaxA | number | RE Tax |  |
| 2479 | rentalTHWaterM | number | Water and Sewer |  |
| 2480 | rentalTHWaterA | number | Water and Sewer |  |
| 2484 | rentalTHHeatM | number | Heat |  |
| 2485 | rentalTHHeatA | number | Heat |  |
| 2489 | rentalTHMaintM | number | Maintenance |  |
| 2490 | rentalTHMaintA | number | Maintenance |  |
| 2494 | rentalTHMgmtM | number | Management |  |
| 2495 | rentalTHMgmtA | number | Management |  |
| 2499 | rentalTHSuperM | number | Super / Doorman |  |
| 2500 | rentalTHSuperA | number | Super / Doorman |  |
| 2508 | rentalTHElectricM | number | Electric |  |
| 2509 | rentalTHElectricA | number | Electric |  |
| 2513 | rentalTHInsuranceM | number | Insurance |  |
| 2514 | rentalTHInsuranceA | number | Insurance |  |
| 2518 | rentalTHTrashM | number | Trash |  |
| 2519 | rentalTHTrashA | number | Trash |  |
| 2523 | rentalTHPestM | number | Pest Control |  |
| 2524 | rentalTHPestA | number | Pest Control |  |
| 2528 | rentalTHWorkCompM | number | Workers Comp |  |
| 2529 | rentalTHWorkCompA | number | Workers Comp |  |
| 2533 | rentalTHOtherM | number | Other |  |
| 2534 | rentalTHOtherA | number | Other |  |
| 2537 | rentalTHOtherRemarks | text | Other Expense Remarks |  |

### Sub-tab 3.3 Next: Financials > Totals & Cap Rate  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2549 | rentalTHTotalExpM | number | Total Expenses |  |
| 2550 | rentalTHTotalExpA | number | Total Expenses |  |
| 2554 | rentalTHNetIncomeM | number | Net Income |  |
| 2555 | rentalTHNetIncomeA | number | Net Income |  |
| 2560 | rentalTHCapRate | number | Cap Rate (%) — NOI / (Rent x 12) | CapRate |

## Tab 4: LISTING DISTRIBUTION --  (12 controls)

### IDX / VOW / Syndication Controls  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2612 | rentalIDXEntireListingDisplayYN | checkbox |  | InternetEntireListingDisplayYN |
| 2624 | rentalVOWOptOutYN | checkbox |  | InternetEntireListingDisplayYN |
| 2636 | rentalSyndicateYN | checkbox |  | SyndicateTo |

### Send Listing To  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2652 | rentalSendToAll | checkbox |  | SyndicateTo |
| 2656 | rentalDist_IDX | checkbox | IDX | InternetEntireListingDisplayYN |
| 2657 | rentalDist_VOW | checkbox | VOW | InternetEntireListingDisplayYN |
| 2658 | rentalDist_Listhub | checkbox | Listhub | SyndicateTo |
| 2659 | rentalDist_NYMLS | checkbox | NY MLS | SyndicateTo |
| 2660 | rentalDist_Realtor | checkbox | Realtor | SyndicateTo |
| 2661 | rentalDist_RPX | checkbox | RPeXchange | SyndicateTo |
| 2662 | rentalDist_WWW | checkbox | Web (WWW) | InternetEntireListingDisplayYN |
| 2663 | rentalDist_RLS | checkbox | RLS Participants | SyndicateTo |

## Tab 7: COMMISSION REQUEST  (261 controls)

### Property Information Auto-populated from listing  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2980 | commRentalRlsId | text | RLS / Listing ID |  |
| 2984 | commRentalAddress | text | Full Property Address |  |
| 2988 | commRentalBorough | text | Borough |  |
| 2992 | commRentalListPrice | text | Listed Rent |  |
| 2996 | commRentalFinalPrice | number | Final Monthly Rent * |  |
| 3001 | commRentalBedBath | text | Bedrooms / Bathrooms |  |
| 3005 | commRentalSqFt | text | Approx. Sq Ft |  |

### Deal Parties  - 10 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3016 | commRentalLandlordName | text | Landlord Name * |  |
| 3020 | commRentalLandlordAttorney | text | Landlord Attorney / Management Co. |  |
| 3024 | commRentalTenantName | text | Tenant Name * |  |
| 3028 | commRentalTenantEmail | email | Tenant Email * |  |
| 3032 | commRentalTenantPhone | tel | Tenant Phone * |  |
| 3036 | commRentalTenantAttorney | text | Tenant Attorney |  |
| 3044 | commRentalListingAgent | text | Listing Agent (Our Side) |  |
| 3048 | commRentalCoListAgent | text | Co-Listing Agent |  |
| 3052 | commRentalTenantAgent | text | Tenant's Agent (Cooperating) |  |
| 3056 | commRentalCoopBrokerage | text | Cooperating Brokerage |  |

### Commission Calculation  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3070 | commRentalBasis | select | Commission Basis * |  |
| 3079 | commRentalCommValue | number | Commission Amount * |  |
| 3100 | commRentalListingSidePct | number | 50 |  |
| 3108 | commRentalCoopSidePct | number | 50 |  |
| 3123 | commRentalAgentSplitPct | number | Agent Split % |  |

### Payment Information  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3154 | commRentalPayMethod | radio | Payment Method * |  |
| 3159 | commRentalPayMethod | radio |  |  |
| 3167 | commRentalLeaseStart | date | Lease Start Date * |  |
| 3172 | commRentalNotes | textarea | Notes / Special Instructions |  |

### [panel: rentalMediaModal] > Payment Information  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3251 | rentalPhotoInput | file |  |  |
| 3279 | rentalVideoUrl | url | Video URL | VirtualTourURLBranded |
| 3284 | rentalVideoTourUrl | url | Video Tour URL | VirtualTourURLUnbranded |
| 3298 | rentalFloorplanInput | file |  |  |
| 3308 | rentalMatterportUrl | url | Branded Tour URL (with broker branding) | VirtualTourURLUnbranded2 |
| 3313 | rentalVirtualTourUnbranded | url | Unbranded Tour URL (no watermark) | VirtualTourURLUnbranded |
| 3318 | rentalVirtualTourUnbranded2 | url | Unbranded Tour URL 2 | VirtualTourURLUnbranded2 |
| 3323 | rentalVirtualTourUnbranded3 | url | Unbranded Tour URL 3 | VirtualTourURLUnbranded3 |
| 3336 | rentalDocInput | file |  |  |

### Sub-tab 1.1 Location > [panel: Building Information] > Building Address  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3419 | bldgStreetAddress | text | Street Address * | StreetName |
| 3423 | bldgName | text | Building Name | BuildingName |
| 3427 | bldgCity | text | City * | City |
| 3431 | bldgState | select | State * | StateOrProvince |
| 3439 | bldgZip | text | ZIP Code * | PostalCode |
| 3443 | bldgNeighborhood | select | Neighborhood * | SubdivisionName |
| 3500 | bldgBorough | select | Borough * | CityRegion |
| 3510 | bldgCrossStreet1 | text | Cross Street 1 | CrossStreet |
| 3514 | bldgCrossStreet2 | text | Cross Street 2 |  |

### Sub-tab 1.1 Location > [panel: Building Information] > Transportation  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3524 | bldgSubwayLines | text | Nearest Subway Lines |  |
| 3528 | bldgSubwayStation | text | Nearest Subway Station |  |

### Sub-tab 1.2 Next: Essentials > [panel: Building Information] > Building Details  - 11 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3545 | bldgType | select | Building Type * | StructureType |
| 3567 | bldgClass | select | Building Class |  |
| 3579 | bldgYearBuilt | number | Year Built * | YearBuilt |
| 3583 | bldgYearRenovated | number | Year Renovated |  |
| 3587 | bldgArchitecturalStyle | select | Architectural Style | ArchitecturalStyle |
| 3617 | bldgTotalFloors | number | Total Floors * | StoriesTotal |
| 3621 | bldgTotalUnits | number | Total Units * | NumberOfUnitsTotal |
| 3625 | bldgResidentialUnits | number | Residential Units |  |
| 3629 | bldgCommercialUnits | number | Commercial Units |  |
| 3633 | bldgParkingSpaces | number | Total Parking Spaces | OpenParkingSpaces |
| 3637 | rentalOwnershipType | select | Ownership Type | OwnershipType |

### Sub-tab 1.2 Next: Essentials > [panel: Building Information] > Building Status  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3652 | bldgLandmark | checkbox | Landmark Building | LandmarkStatusYN |
| 3653 | bldgHistoric | checkbox | Historic District | BuildingFeatures |
| 3654 | bldgLEED | checkbox | LEED Certified | BuildingFeatures |
| 3655 | bldgNewConstruction | checkbox | New Construction | NewConstructionYN |
| 3656 | bldgNewDevelopment | checkbox | New Development | NewConstructionYN |
| 3657 | bldgConversion | checkbox | Conversion | BuildingFeatures |
| 3658 | bldgSponsorUnits | checkbox | Has Sponsor Units | SponsorUnitYN |

### Sub-tab 1.3 Next: Features > [panel: Building Information] > Building Attendance Type *  - 16 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3675 | rentalAttendanceType | checkbox | Doorman (Full-Time) | AttendanceType |
| 3676 | rentalAttendanceType | checkbox | Doorman (Part-Time) |  |
| 3677 | rentalAttendanceType | checkbox | Doorman (Yes) |  |
| 3678 | rentalAttendanceType | checkbox | Concierge (Full-Time) |  |
| 3679 | rentalAttendanceType | checkbox | Concierge (Part-Time) |  |
| 3680 | rentalAttendanceType | checkbox | Concierge (Yes) |  |
| 3681 | rentalAttendanceType | checkbox | Elevator Att. (Full-Time) |  |
| 3682 | rentalAttendanceType | checkbox | Elevator Att. (Part-Time) |  |
| 3683 | rentalAttendanceType | checkbox | Elevator Att. (Yes) |  |
| 3684 | rentalAttendanceType | checkbox | Lobby Att. (Full-Time) |  |
| 3685 | rentalAttendanceType | checkbox | Lobby Att. (Part-Time) |  |
| 3686 | rentalAttendanceType | checkbox | Lobby Att. (Yes) |  |
| 3687 | rentalAttendanceType | checkbox | Video Doorman (Full-Time) |  |
| 3688 | rentalAttendanceType | checkbox | Video Doorman (Part-Time) |  |
| 3689 | rentalAttendanceType | checkbox | Video Doorman (Yes) |  |
| 3690 | rentalAttendanceType | checkbox | None |  |

### Sub-tab 1.3 Next: Features > [panel: Building Information] > Lobby Attendant  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3701 | rentalLobbyAttendant | select | Lobby Attendant |  |

### Sub-tab 1.3 Next: Features > [panel: Building Information] > Building Amenities  - 19 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3717 | bldgElevator | checkbox | Elevator | BuildingFeatures |
| 3718 | bldgGym | checkbox | Gym/Fitness Center | BuildingFeatures |
| 3719 | bldgPool | checkbox | Pool | BuildingFeatures |
| 3720 | bldgRoofDeck | checkbox | Roof Deck | BuildingFeatures |
| 3721 | bldgCourtyard | checkbox | Courtyard/Garden | BuildingFeatures |
| 3722 | bldgPlayroom | checkbox | Children's Playroom | BuildingFeatures |
| 3723 | bldgLounge | checkbox | Resident Lounge | BuildingFeatures |
| 3724 | bldgBusinessCenter | checkbox | Business Center | BuildingFeatures |
| 3725 | bldgConferenceRoom | checkbox | Conference Room | BuildingFeatures |
| 3726 | bldgBikeRoom | checkbox | Bike Room | BuildingFeatures |
| 3727 | bldgStorage | checkbox | Storage Available | BuildingFeatures |
| 3728 | bldgParking | checkbox | Parking Garage | BuildingFeatures |
| 3729 | bldgValet | checkbox | Valet Parking | BuildingFeatures |
| 3730 | bldgPackageRoom | checkbox | Package Room | BuildingFeatures |
| 3731 | bldgColdStorage | checkbox | Cold Storage | BuildingFeatures |
| 3732 | bldgLiveInSuper | checkbox | Live-In Super | BuildingFeatures |
| 3733 | bldgOnSiteManager | checkbox | On-Site Manager | BuildingFeatures |
| 3734 | bldgWheelchairAccess | checkbox | Wheelchair Access | BuildingFeatures |
| 3735 | bldgSpa | checkbox | Spa | BuildingFeatures |

### Sub-tab 1.3 Next: Features > [panel: Building Information] > Building Laundry Features *  - 23 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3744 | rentalBuildingLaundryFeatures | checkbox | In Unit |  |
| 3745 | rentalBuildingLaundryFeatures | checkbox | W/D Install Allowed |  |
| 3746 | rentalBuildingLaundryFeatures | checkbox | Washer Hookup |  |
| 3747 | rentalBuildingLaundryFeatures | checkbox | Electric Dryer Hookup |  |
| 3748 | rentalBuildingLaundryFeatures | checkbox | Gas Dryer Hookup |  |
| 3749 | rentalBuildingLaundryFeatures | checkbox | Common Area |  |
| 3750 | rentalBuildingLaundryFeatures | checkbox | On Common Floor |  |
| 3751 | rentalBuildingLaundryFeatures | checkbox | In Basement |  |
| 3752 | rentalBuildingLaundryFeatures | checkbox | Coin Operated |  |
| 3753 | rentalBuildingLaundryFeatures | checkbox | Drop-Off Service |  |
| 3754 | rentalBuildingLaundryFeatures | checkbox | Dry Cleaning Service |  |
| 3755 | rentalBuildingLaundryFeatures | checkbox | Inside |  |
| 3756 | rentalBuildingLaundryFeatures | checkbox | In Hall |  |
| 3757 | rentalBuildingLaundryFeatures | checkbox | In Garage |  |
| 3758 | rentalBuildingLaundryFeatures | checkbox | In Carport |  |
| 3759 | rentalBuildingLaundryFeatures | checkbox | Outside |  |
| 3760 | rentalBuildingLaundryFeatures | checkbox | Main Level |  |
| 3761 | rentalBuildingLaundryFeatures | checkbox | Upper Level |  |
| 3762 | rentalBuildingLaundryFeatures | checkbox | Lower Level |  |
| 3763 | rentalBuildingLaundryFeatures | checkbox | Multiple Locations |  |
| 3764 | rentalBuildingLaundryFeatures | checkbox | See Remarks |  |
| 3765 | rentalBuildingLaundryFeatures | checkbox | Other |  |
| 3766 | rentalBuildingLaundryFeatures | checkbox | None |  |

### Sub-tab 1.3 Next: Features > [panel: Building Information] > Building Systems  - 64 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3775 | bldgFuelType | select | Fuel Type |  |
| 3784 | bldgNumElevators | number | Number of Elevators | ElevatorsTotal |
| 3792 | bldgHeating | checkbox | Bldg Steam |  |
| 3793 | bldgHeating | checkbox | Hot Water |  |
| 3794 | bldgHeating | checkbox | Bldg Electric |  |
| 3795 | bldgHeating | checkbox | Bldg Natural Gas |  |
| 3796 | bldgHeating | checkbox | Forced Air |  |
| 3797 | bldgHeating | checkbox | Radiant |  |
| 3798 | bldgHeating | checkbox | Bldg City Steam |  |
| 3799 | bldgHeating | checkbox | Heat Pump |  |
| 3800 | bldgHeating | checkbox | Ductless |  |
| 3801 | bldgHeating | checkbox | Bldg Geothermal |  |
| 3802 | bldgHeating | checkbox | Bldg Oil |  |
| 3803 | bldgHeating | checkbox | Bldg Solar |  |
| 3805 | bldgHeating | checkbox | Passive Solar |  |
| 3806 | bldgHeating | checkbox | Fireplaces |  |
| 3807 | bldgHeating | checkbox | Fireplace Insert |  |
| 3808 | bldgHeating | checkbox | Wood Stove |  |
| 3809 | bldgHeating | checkbox | Pellet Stove |  |
| 3810 | bldgHeating | checkbox | Wood |  |
| 3812 | bldgHeating | checkbox | Kerosene |  |
| 3813 | bldgHeating | checkbox | Propane |  |
| 3814 | bldgHeating | checkbox | Propane Stove |  |
| 3815 | bldgHeating | checkbox | Space Heater |  |
| 3816 | bldgHeating | checkbox | Wall Furnace |  |
| 3817 | bldgHeating | checkbox | Floor Furnace |  |
| 3818 | bldgHeating | checkbox | Gravity |  |
| 3819 | bldgHeating | checkbox | Radiant Ceiling |  |
| 3820 | bldgHeating | checkbox | Radiant Floor |  |
| 3822 | bldgHeating | checkbox | Exhaust Fan |  |
| 3823 | bldgHeating | checkbox | Humidity Control |  |
| 3824 | bldgHeating | checkbox | Separate Meters |  |
| 3825 | bldgHeating | checkbox | Zoned |  |
| 3826 | bldgHeating | checkbox | Varies by Unit |  |
| 3827 | bldgHeating | checkbox | ENERGY STAR ACCA/RSI |  |
| 3828 | bldgHeating | checkbox | ENERGY STAR Equipment |  |
| 3829 | bldgHeating | checkbox | See Remarks |  |
| 3830 | bldgHeating | checkbox | None |  |
| 3831 | bldgHeating | checkbox | Other |  |
| 3838 | bldgCooling | checkbox | Central Air |  |
| 3839 | bldgCooling | checkbox | Ductless |  |
| 3840 | bldgCooling | checkbox | Wall Units |  |
| 3841 | bldgCooling | checkbox | Window Units |  |
| 3842 | bldgCooling | checkbox | Wall/Window Units |  |
| 3843 | bldgCooling | checkbox | Electric |  |
| 3844 | bldgCooling | checkbox | Building Cooling |  |
| 3845 | bldgCooling | checkbox | Heat Pump |  |
| 3846 | bldgCooling | checkbox | Dual |  |
| 3847 | bldgCooling | checkbox | Multi Units |  |
| 3848 | bldgCooling | checkbox | Zoned |  |
| 3849 | bldgCooling | checkbox | Separate Meters |  |
| 3850 | bldgCooling | checkbox | Whole House Fan |  |
| 3851 | bldgCooling | checkbox | Attic Fan |  |
| 3852 | bldgCooling | checkbox | Ceiling Fans |  |
| 3853 | bldgCooling | checkbox | Roof Turbines |  |
| 3854 | bldgCooling | checkbox | Gas |  |
| 3855 | bldgCooling | checkbox | Geothermal |  |
| 3856 | bldgCooling | checkbox | Evaporative Cooling |  |
| 3857 | bldgCooling | checkbox | Exhaust Fan |  |
| 3858 | bldgCooling | checkbox | Humidity Control |  |
| 3859 | bldgCooling | checkbox | ENERGY STAR Equipment |  |
| 3860 | bldgCooling | checkbox | Varies by Unit |  |
| 3861 | bldgCooling | checkbox | None |  |
| 3862 | bldgCooling | checkbox | Other |  |

### Sub-tab 1.4 0 && totalUnits > [panel: Building Information] > Financial Information (Co-op/Condo)  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3880 | bldgAssociationName | text | Association/Corp Name | AssociationName |
| 3884 | bldgTotalShares | number | Total Shares (Co-op) |  |
| 3888 | bldgUnderlying | text | Underlying Mortgage |  |
| 3892 | bldgCapitalReserves | text | Capital Reserves | CapitalReservesTotal |
| 3896 | bldgCapitalReservesYN | checkbox | Capital Reserves | CapitalReservesYN |
| 3901 | bldgReserveFund | text | Reserve Fund | CapitalReservesTotal |
| 3905 | bldgAvgMaint | text | Common Charges/Maint (Avg) |  |

### Sub-tab 1.4 0 && totalUnits > [panel: Building Information] > Tax Information  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3916 | bldgTaxBlock | text | Tax Block | TaxBlock |
| 3920 | bldgTaxLot | text | Tax Lot | BuildingTaxLot |
| 3924 | bldgAnnualTaxes | text | Annual RE Taxes |  |

### Sub-tab 1.4 0 && totalUnits > [panel: Building Information] > Tax Abatement  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3935 | bldgTaxAbatementYN | select | Has Tax Abatement | TaxAbatementYN |
| 3945 | bldgTaxAbatementExpYear | number | Abatement Expiration Year |  |
| 3949 | bldgTaxAbatementComments | text | Abatement Comments | TaxAbatementComments |

### Sub-tab 1.4 0 && totalUnits > [panel: Building Information] > Flip Tax Information  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3959 | bldgFlipTax | select | Flip Tax | FlipTax |
| 3969 | bldgFlipTaxAmount | text | Flip Tax Amount | FlipTax |
| 3973 | bldgFlipTaxPaidBy | select | Paid By |  |

### Sub-tab 1.4 0 && totalUnits > [panel: Building Information] > Documents Available (Upon Request)  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3988 | bldgDocsAvailable | checkbox | Building Rules | DocumentsAvailable |
| 3989 | bldgDocsAvailable | checkbox | Bylaws & Amendments |  |
| 3990 | bldgDocsAvailable | checkbox | Financial Statement |  |
| 3991 | bldgDocsAvailable | checkbox | Offering Plan |  |
| 3992 | bldgDocsAvailable | checkbox | Board Package Template |  |
| 3993 | bldgDocsAvailable | checkbox | Schedule A |  |

### Sub-tab 1.5 Next: Description > [panel: Building Information] > Building Description  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4010 | bldgDescription | textarea | Building Description | PublicRemarks |
| 4015 | bldgWebsite | url | Building Website |  |

### Sub-tab 2.1 General > [panel: Building Information] > Building Pet Policy *  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4042 | rentalBuildingPetsAllowed | checkbox | Yes (All Pets) |  |
| 4043 | rentalBuildingPetsAllowed | checkbox | Cats OK |  |
| 4044 | rentalBuildingPetsAllowed | checkbox | Dogs OK |  |
| 4045 | rentalBuildingPetsAllowed | checkbox | Breed Restrictions |  |
| 4046 | rentalBuildingPetsAllowed | checkbox | Size Limit |  |
| 4047 | rentalBuildingPetsAllowed | checkbox | Number Limit |  |
| 4048 | rentalBuildingPetsAllowed | checkbox | No Pets |  |
| 4053 | bldgPetWeightLimit | number | Weight Limit (lbs) |  |
| 4057 | bldgPetNotes | text | Pet Policy Notes |  |

### Sub-tab 2.1 General > [panel: Building Information] > General Policies  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4065 | bldgWasherDryerAllowed | checkbox | Washer/Dryer Allowed | LaundryFeatures |
| 4066 | bldgPiedATerre | checkbox | Pied-a-Terre Allowed |  |
| 4067 | bldgParentsAllowed | checkbox | Parents Buying Allowed | BuildingFeatures |
| 4068 | bldgCoBuyersAllowed | checkbox | Co-Buyers Allowed | BuildingFeatures |
| 4069 | bldgCorpOwnAllowed | checkbox | Corp/LLC Purchase Allowed | BuildingFeatures |
| 4070 | bldgGiftsAllowed | checkbox | Gifts Allowed for Down Payment | BuildingFeatures |

### Sub-tab 2.2 Next: Rental Policies > [panel: Building Information] > Subletting/Rental Policy  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4086 | bldgSublettingAllowed | select | Subletting Allowed |  |
| 4096 | bldgMaxSubletYears | number | Max Sublet Years |  |
| 4100 | bldgSubletFee | text | Sublet Fee |  |

### Sub-tab 2.2 Next: Rental Policies > [panel: Building Information] > Tenant Requirements  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4110 | bldgMinIncome | text | Min Income Requirement |  |
| 4114 | bldgMinCreditScore | number | Min Credit Score |  |
| 4118 | bldgGuarantors | select | Guarantors | GuarantorsAcceptedYN |
| 4128 | bldgMaxOccupants | text | Max Occupants |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: Building Information] > Purchase Requirements (Co-op)  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4146 | bldgMaxFinancing | text | Max Financing Allowed | MaximumFinancingAmount |
| 4150 | bldgMinDownPayment | text | Min Down Payment |  |
| 4154 | bldgDTIRatio | text | DTI Ratio Requirement |  |
| 4158 | bldgPostCloseLiquidity | text | Post-Close Liquidity |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: Building Information] > Board Process  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4166 | bldgBoardApproval | checkbox | Board Approval Required | BuildingFeatures |
| 4167 | bldgBoardInterview | checkbox | Board Interview Required |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: Building Information] > Management Company  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4185 | bldgMgmtCompany | text | Company Name |  |
| 4189 | bldgMgmtPhone | tel | Phone |  |
| 4193 | bldgMgmtEmail | email | Email |  |
| 4197 | bldgMgmtAddress | text | Address |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: Building Information] > Building Staff  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4208 | bldgSuperName | text | Name |  |
| 4209 | bldgSuperPhone | tel | Phone |  |
| 4210 | bldgSuperEmail | email | Email |  |
| 4216 | bldgManagerName | text | Name |  |
| 4217 | bldgManagerPhone | tel | Phone |  |
| 4218 | bldgManagerEmail | email | Email |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: Building Information] > Board Information (Co-op/Condo)  - 12 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4229 | bldgBoardPresident | text | Board President |  |
| 4233 | bldgBoardEmail | email | Board Contact Email |  |
| 5974 | (no id) | select |  |  |
| 5986 | (no id) | text | Description |  |
| 5987 | (no id) | number | $0.00 |  |
| 6128 | (no id) | date | Date |  |
| 6132 | (no id) | time | Start Time |  |
| 6136 | (no id) | time | End Time |  |
| 6140 | (no id) | select | Type |  |
| 6150 | (no id) | text | Notes |  |
| 6186 | (no id) | text | REBNY Company |  |
| 6192 | (no id) | text | Agent Name |  |

