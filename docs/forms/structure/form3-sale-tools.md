# SALE-FORM-WITH-TOOLS.html - structure read from source (origin/main)

Generated 2026-10-15. Sections are taken from the markup (tab ids, sub-tab ids, card headers, panel/modal headings); controls are listed under the last section marker above them.

Control total: 818

## (top of page)  (2 controls)

### (no sub-section)  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 108 | (no id) | select |  |  |
| 269 | saleShowRequiredOnly | checkbox |  |  |

## Tab 1: LISTING INFORMATION  (185 controls)

### Sub-tab 1.1 Location > Property Address — IDX Lookup  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 325 | saleStreetAddress | text | Street Address * | StreetName |
| 329 | saleUnitNumber | text | Unit / Apt | UnitNumber |
| 333 | saleBorough | select | Borough * | CityRegion |
| 346 | saleZipCode | text | Zip Code | PostalCode |
| 350 | saleNeighborhoodFromAddress | text | Neighborhood |  |

### Sub-tab 1.1 Location > Agent & Dates  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 361 | saleUpdatingAgentDisplay | text | Listing Agent |  |
| 367 | saleCreateDate | date | Create Date |  |
| 374 | saleLastUpdatedDate | date | Last Updated |  |

### Sub-tab 1.1 Location > Internal Use Only  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 385 | saleAdminComments | textarea | Administrative Comments |  |

### Sub-tab 1.1 Location > Listing Type & Classification  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 399 | saleListingType | radio |  |  |
| 403 | saleListingType | radio |  |  |
| 407 | saleListingType | radio |  |  |
| 411 | saleListingType | radio |  |  |
| 417 | saleListingType | radio |  |  |
| 422 | saleListingType | radio |  |  |
| 426 | saleListingType | radio |  |  |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Listing Type & Classification  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 512 | saleDirectDeal | radio | Yes |  |
| 513 | saleDirectDeal | radio | No |  |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Agreements & Disclosures  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 524 | saleCoBrokeAgreementType | select | CoBroke Agreement Type * |  |
| 533 | saleCommNegotiabilityAck | checkbox |  |  |
| 542 | saleBuyerRepAgreementAck | checkbox |  |  |
| 554 | saleOptOutFormUpload | file | Owner Opt-Out Form (Exhibit B) * |  |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Status & Pricing  - 11 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 565 | saleStatus | select | Status * | MlsStatus |
| 634 | salePrice | number | Price * | ListPrice |
| 638 | saleMaintCC | number | Maint/CC * | AssociationFee |
| 642 | saleMaintCCFreq | select | Fee Frequency | AssociationFeeFrequency |
| 658 | saleRETaxes | number | RE Taxes (Monthly) | TaxAnnualAmount |
| 664 | saleTotalMonthly | text | Total Monthly |  |
| 669 | saleOriginalPrice | number | Original Price | OriginalListPrice |
| 673 | saleSoldPrice | number | Sold Price * | ClosePrice |
| 678 | (no id) | checkbox | Sold Price * |  |
| 687 | saleInternetAVMDisplayYN | radio | Y | InternetAutomatedValuationDisplayYN |
| 688 | saleInternetAVMDisplayYN | radio | N |  |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Property Type & Ownership  - 76 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 713 | salePropertyType | radio | Condo | PropertyType |
| 714 | salePropertyType | radio | Co-op |  |
| 715 | salePropertyType | radio | Condop |  |
| 716 | salePropertyType | radio | Single Family TH |  |
| 717 | salePropertyType | radio | Multi-Family TH |  |
| 718 | salePropertyType | radio | Single Family |  |
| 719 | salePropertyType | radio | Multi-Family |  |
| 720 | salePropertyType | radio | Mixed Use |  |
| 721 | salePropertyType | radio | Loft |  |
| 726 | salePropertyType | radio | Duplex (2 Unit) |  |
| 727 | salePropertyType | radio | Triplex (3 Unit) |  |
| 728 | salePropertyType | radio | Quadruplex (4 Unit) |  |
| 733 | salePropertyType | radio | Office |  |
| 734 | salePropertyType | radio | Retail |  |
| 739 | salePropertyType | radio | Land |  |
| 740 | salePropertyType | radio | Deeded Parking |  |
| 746 | saleOfficeRetailOwnership | radio | Condo |  |
| 747 | saleOfficeRetailOwnership | radio | Co-op |  |
| 748 | saleOfficeRetailOwnership | radio | Condop |  |
| 749 | saleOfficeRetailOwnership | radio | Townhouse |  |
| 750 | saleOfficeRetailOwnership | radio | Mixed Use |  |
| 751 | saleOfficeRetailOwnership | radio | Fee Simple |  |
| 759 | saleBuildingStatus | radio | Resale |  |
| 760 | saleBuildingStatus | radio | New Development |  |
| 761 | saleBuildingStatus | radio | Sponsor Unit |  |
| 762 | saleBuildingStatus | radio | New Conversion |  |
| 767 | saleLandLease | radio | No | LandLeaseAmount |
| 768 | saleLandLease | radio | Yes |  |
| 776 | saleCommonInterest | select | Ownership Structure * | CommonInterest |
| 803 | salePropertyType | radio |  |  |
| 816 | saleCommSubtype | checkbox | Professional Office |  |
| 817 | saleCommSubtype | checkbox | Medical Office |  |
| 818 | saleCommSubtype | checkbox | Dental Office |  |
| 819 | saleCommSubtype | checkbox | Flexible Space |  |
| 825 | saleCommSubtype | checkbox | Restaurant |  |
| 826 | saleCommSubtype | checkbox | Grocery |  |
| 827 | saleCommSubtype | checkbox | Showroom |  |
| 828 | saleCommSubtype | checkbox | Strip Mall |  |
| 834 | saleCommSubtype | checkbox | Industrial |  |
| 835 | saleCommSubtype | checkbox | Warehouse |  |
| 836 | saleCommSubtype | checkbox | Manufacturing |  |
| 837 | saleCommSubtype | checkbox | Distribution |  |
| 838 | saleCommSubtype | checkbox | Storage |  |
| 844 | saleCommSubtype | checkbox | Mixed Use |  |
| 845 | saleCommSubtype | checkbox | Live/Work |  |
| 846 | saleCommSubtype | checkbox | Investment |  |
| 847 | saleCommSubtype | checkbox | Institutional |  |
| 848 | saleCommSubtype | checkbox | Special Use |  |
| 858 | saleCommercialOwnership | radio | Commercial Condo |  |
| 859 | saleCommercialOwnership | radio | Commercial Condop |  |
| 860 | saleCommercialOwnership | radio | Commercial Co-op |  |
| 861 | saleCommercialOwnership | radio | Whole Building |  |
| 862 | saleCommercialOwnership | radio | Land Only |  |
| 868 | saleTenantConfig | radio | Single Tenant |  |
| 869 | saleTenantConfig | radio | Multi-Tenant |  |
| 879 | saleBusinessType | checkbox | Medical | BusinessType |
| 880 | saleBusinessType | checkbox | Dental |  |
| 881 | saleBusinessType | checkbox | Health Services |  |
| 882 | saleBusinessType | checkbox | Fitness |  |
| 888 | saleBusinessType | checkbox | Restaurant |  |
| 889 | saleBusinessType | checkbox | Food & Beverage |  |
| 890 | saleBusinessType | checkbox | Bar/Tavern/Lounge |  |
| 891 | saleBusinessType | checkbox | Fast Food |  |
| 892 | saleBusinessType | checkbox | Bakery |  |
| 898 | saleBusinessType | checkbox | Professional Service |  |
| 899 | saleBusinessType | checkbox | Financial |  |
| 900 | saleBusinessType | checkbox | Real Estate |  |
| 901 | saleBusinessType | checkbox | Accounting |  |
| 902 | saleBusinessType | checkbox | Computer/Technology |  |
| 908 | saleBusinessType | checkbox | Barber/Beauty |  |
| 909 | saleBusinessType | checkbox | Dry Cleaner |  |
| 910 | saleBusinessType | checkbox | Laundromat |  |
| 911 | saleBusinessType | checkbox | Child Care |  |
| 917 | saleBusinessType | checkbox | Hotel/Motel |  |
| 918 | saleBusinessType | checkbox | Bed & Breakfast |  |
| 919 | saleBusinessType | checkbox | Hospitality |  |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Important Dates  - 13 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 934 | saleDateListed | date | Date Listed * | OnMarketDate |
| 938 | saleExclusiveStart | date | Exclusive Start * |  |
| 943 | saleExclusiveExpires | date | Exclusive Expires (Hidden) | ExpirationDate |
| 947 | saleFirstCoBroke | date | First Co-Broke * |  |
| 949 | (no id) | checkbox | Send to RLS |  |
| 950 | (no id) | checkbox | Send to Website |  |
| 955 | saleAvailableOccupancy | date | Available for Occupancy |  |
| 961 | saleFirstShowingDate | date | Available for Showing | OnMarketDate |
| 965 | (no id) | text | Availability Comments |  |
| 972 | saleOffMarketDate | date | Off Market Date * | OffMarketDate |
| 976 | saleWithdrawnDate | date | Withdrawn Date | WithdrawnDate |
| 980 | saleContractSignedDate | date | Contract Signed Date * | PurchaseContractDate |
| 984 | saleSoldDate | date | Sold Date * | CloseDate |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Co-op / Condop Details  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 995 | saleUnitShares | number | Unit Shares * |  |
| 999 | saleUnitSqFt | number | Unit Sq Ft | LivingArea |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Condo Details  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1010 | salePercentCommon | number | % Common Elements | PercentOfCommonElements |
| 1014 | saleLivingArea | number | Living Area (Sq Ft) * | LivingArea |
| 1018 | saleLivingAreaUnits | select | Living Area Units | LivingAreaUnits |
| 1025 | saleLivingAreaSource | select | Living Area Source | LivingAreaSource |
| 1046 | saleTaxDeduction | number | Tax Deduction % | TaxDeductionPercent |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Flip Tax  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1057 | saleFlipTaxAmount | number | Flip Tax Amount * | FlipTax |
| 1061 | (no id) | select | Flip Tax Type |  |
| 1070 | (no id) | select | Paid By |  |
| 1084 | (no id) | textarea | Flip Tax Remarks |  |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Building Requirements  - 16 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1093 | saleBoardApproval | radio | Yes | BuildingFeatures |
| 1094 | saleBoardApproval | radio | No |  |
| 1098 | saleBoardInterview | radio | Yes |  |
| 1099 | saleBoardInterview | radio | No |  |
| 1103 | saleMeetAndGreet | radio | Yes |  |
| 1104 | saleMeetAndGreet | radio | No |  |
| 1108 | saleBoardApplication | radio | Yes |  |
| 1109 | saleBoardApplication | radio | No |  |
| 1115 | saleFirstRefusal | radio | Yes |  |
| 1116 | saleFirstRefusal | radio | No |  |
| 1120 | saleFilmLocation | radio | Yes |  |
| 1121 | saleFilmLocation | radio | No |  |
| 1125 | saleLiveWorkAllowed | radio | Yes |  |
| 1126 | saleLiveWorkAllowed | radio | No |  |
| 1130 | saleCertOccupancy | radio | Yes |  |
| 1131 | saleCertOccupancy | radio | No |  |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Purchasing Options  - 10 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1143 | salePiedATerre | radio | Yes |  |
| 1144 | salePiedATerre | radio | No |  |
| 1150 | saleParentsBuying | radio | Yes |  |
| 1151 | saleParentsBuying | radio | No |  |
| 1157 | saleCoPurchasing | radio | Yes |  |
| 1158 | saleCoPurchasing | radio | No |  |
| 1164 | saleGuarantors | radio | Yes | GuarantorsAcceptedYN |
| 1165 | saleGuarantors | radio | No |  |
| 1171 | saleSubletting | radio | Yes |  |
| 1172 | saleSubletting | radio | No |  |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Commission Information  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1185 | saleCommissionType | select |  |  |
| 1189 | saleExclusiveCommission | number | 0 |  |
| 1195 | saleCommissionType | radio | Owner Pays (to Buyer's Agent) |  |
| 1196 | saleCommissionType | radio | Buyer Pays |  |
| 1199 | (no id) | textarea | Commission Comments |  |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Concessions  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1211 | saleConcessions | select | Concessions (RLS/RESO/IDX: Concessions) | Concessions |
| 1221 | saleConcessionAmount | number | Concession Amount (RLS/RESO/IDX: ConcessionsAmount | ConcessionsAmount |
| 1226 | saleConcessionComments | text | Concession Comments (RLS/RESO/IDX: ConcessionsComm |  |

### Sub-tab 1.2 Next: Essentials > [panel: saleListingTypeInfoModal] > Listing URL  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1250 | saleListingUrl | text | Listing URL | ListingURL |

### Sub-tab 1.2 Next: Essentials > [panel: saleListingTypeInfoModal] > Web Display Settings  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1260 | saleWebDisplayAddress | select | Web Display Address |  |
| 1277 | saleWebHeadline | text | Web Headline |  |

### Sub-tab 1.2 Next: Essentials > [panel: saleListingTypeInfoModal] > Internet Display Controls (RLS/RESO/IDX)  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1291 | saleInternetEntireListingDisplayYN | checkbox |  | InternetEntireListingDisplayYN |
| 1305 | saleInternetAddressDisplayYN | checkbox |  | InternetAddressDisplayYN |
| 1319 | saleInternetConsumerCommentYN | checkbox |  | InternetConsumerCommentYN |

### Sub-tab 1.2 Next: Essentials > [panel: saleListingTypeInfoModal] > Listing Description  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1357 | saleFairHousingAck | checkbox |  |  |

### Sub-tab 1.3 Next: Features > [panel: saleListingTypeInfoModal] > Listing Agent *  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1395 | saleListingCompanySearch | text | REBNY Company * |  |
| 1405 | saleListingAgentSearch | text | Agent/Broker Name * |  |

### Sub-tab 1.3 Next: Features > [panel: saleListingTypeInfoModal] > Team Information  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1455 | saleListTeamName | text | Listing Team Name (RLS/RESO/IDX: ListTeamName) | ListTeamName |
| 1460 | saleListTeamMlsId | text | Listing Team MLS ID (RLS/RESO/IDX: ListTeamMlsId) | ListTeamKey |

### Sub-tab 1.3 Next: Features > [panel: saleListingTypeInfoModal] > Buyer's Agent Contact (Required for Contract Signed / Sold status)  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1501 | saleBuyerCompanySearch | text | REBNY Company |  |
| 1511 | saleBuyerAgentSearch | text | Agent/Broker Name |  |

### Sub-tab 1.4 Next: Financials > [panel: saleListingTypeInfoModal] > Scheduled Open Houses  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1608 | saleNewOHDate | date | Date * |  |
| 1614 | saleNewOHStart | time | Start Time * |  |
| 1618 | saleNewOHEnd | time | End Time * |  |
| 1622 | saleNewOHType | select | Type |  |
| 1632 | saleNewOHNotes | text | Notes |  |

## Tab 2: POLICIES & REQUIREMENTS  (276 controls)

### Sub-tab 2.1 General > Number of Floors In The Unit  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1677 | saleNumFloors | radio |  | StoriesTotal |
| 1680 | saleNumFloors | radio |  |  |
| 1683 | saleNumFloors | radio |  |  |
| 1686 | saleNumFloors | radio |  |  |

### Sub-tab 2.1 General > Room Counts  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1698 | saleTotalRooms | number | Total Rooms | RoomsTotal |
| 1702 | saleBedrooms | number | Bedrooms * | BedroomsTotal |
| 1706 | saleFullBaths | number | Full Bathrooms * | BathroomsFull |
| 1710 | saleHalfBaths | number | Half Bathrooms * | BathroomsHalf |
| 1714 | saleBathroomsTotal | number | Total Bathrooms * | BathroomsTotalInteger |
| 1718 | (no id) | number | Staff Bedrooms |  |
| 1722 | (no id) | number | Staff Bathrooms |  |

### Sub-tab 2.1 General > Square Footage & Dimensions  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1733 | saleInteriorSqFt | number | Approx Interior SqFt | LivingArea |
| 1737 | saleExteriorSqFt | number | Approx Exterior SqFt |  |
| 1741 | (no id) | text | Ceiling Height |  |

### Sub-tab 2.1 General > Floor / Line / Original Rooms  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1753 | saleOriginalRooms | number | Original Rooms |  |
| 1757 | saleFloorInBuilding | text | Floor in Building * | EntryLevel |
| 1762 | saleLineInBuilding | text | Line in Building | UnitNumber |

### Sub-tab 2.1 General > Garage  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1773 | saleGarageSpaces | radio | Garage Spaces Assigned * | GarageSpaces |
| 1776 | saleGarageSpaces | radio | Garage Spaces Assigned * |  |
| 1781 | (no id) | text | Number of Garage Spaces |  |

### Sub-tab 2.1 General > Unit Type  - 36 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1790 | saleUnitType2 | radio |  |  |
| 1793 | saleUnitType2 | radio |  |  |
| 1801 | (no id) | checkbox | Alcove Studio |  |
| 1802 | (no id) | checkbox | Floor Thru |  |
| 1803 | (no id) | checkbox | Garden |  |
| 1804 | (no id) | checkbox | Loft |  |
| 1805 | (no id) | checkbox | Maisonette |  |
| 1806 | (no id) | checkbox | Penthouse |  |
| 1807 | (no id) | checkbox | Private Floor |  |
| 1819 | (no id) | number | Lot Size (SqFt) |  |
| 1823 | (no id) | number | Building Size (SqFt) |  |
| 1827 | (no id) | select | Zoning |  |
| 1843 | (no id) | number | FAR (Floor Area Ratio) |  |
| 1847 | (no id) | number | Air Rights (SqFt) |  |
| 1851 | (no id) | number | Ceiling Height (ft) |  |
| 1855 | (no id) | number | Frontage (ft) |  |
| 1859 | (no id) | number | Cap Rate (%) |  |
| 1863 | (no id) | number | Net Operating Income (NOI) |  |
| 1867 | (no id) | number | Number of Units (Total) |  |
| 1871 | (no id) | number | Number of Retail Units |  |
| 1880 | (no id) | checkbox | Drive-In Access |  |
| 1881 | (no id) | checkbox | Loading Dock |  |
| 1882 | (no id) | checkbox | Freight Elevator |  |
| 1883 | (no id) | checkbox | Signage Rights |  |
| 1884 | (no id) | checkbox | Corner Location |  |
| 1885 | (no id) | checkbox | Street Level |  |
| 1886 | (no id) | checkbox | Below Grade |  |
| 1887 | (no id) | checkbox | Vented |  |
| 1888 | (no id) | checkbox | Three Phase Power |  |
| 1889 | (no id) | checkbox | Heavy Power |  |
| 1890 | (no id) | checkbox | Open Floor Plan |  |
| 1891 | (no id) | checkbox | Build to Suit |  |
| 1901 | (no id) | select | Lease Type |  |
| 1913 | (no id) | text | Minimum Lease Term |  |
| 1917 | (no id) | text | Current Tenant |  |
| 1922 | (no id) | date | Lease Expiration |  |

### Sub-tab 2.1 General > Current Use  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1936 | saleCurrentUse | radio |  | CurrentUse |
| 1939 | saleCurrentUse | radio |  |  |
| 1942 | saleCurrentUse | radio |  |  |

### Sub-tab 2.1 General > Private Outdoor Space  - 11 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1951 | (no id) | checkbox | Balcony |  |
| 1952 | (no id) | checkbox | Deck |  |
| 1953 | (no id) | checkbox | Garden |  |
| 1954 | (no id) | checkbox | Green House |  |
| 1955 | (no id) | checkbox | Juliet Balcony |  |
| 1956 | (no id) | checkbox | Patio |  |
| 1957 | (no id) | checkbox | Private Roof Access |  |
| 1958 | (no id) | checkbox | Roof Deck |  |
| 1959 | (no id) | checkbox | Roof Rights |  |
| 1960 | (no id) | checkbox | Terrace |  |
| 1961 | (no id) | checkbox | Wrap Terrace |  |

### Sub-tab 2.1 General > Light  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1970 | saleLight | radio |  |  |
| 1973 | saleLight | radio |  |  |
| 1976 | saleLight | radio |  |  |
| 1979 | saleLight | radio |  |  |

### Sub-tab 2.1 General > Exposure  - 8 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1988 | (no id) | checkbox | North |  |
| 1989 | (no id) | checkbox | South |  |
| 1990 | (no id) | checkbox | East |  |
| 1991 | (no id) | checkbox | West |  |
| 1992 | (no id) | checkbox | Northeast |  |
| 1993 | (no id) | checkbox | Northwest |  |
| 1994 | (no id) | checkbox | Southeast |  |
| 1995 | (no id) | checkbox | Southwest |  |

### Sub-tab 2.1 General > Views  - 14 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2005 | saleHasViews | radio | Views * | ViewYN |
| 2008 | saleHasViews | radio | Views * |  |
| 2012 | (no id) | checkbox | Bridges |  |
| 2013 | (no id) | checkbox | City |  |
| 2014 | (no id) | checkbox | City Lights |  |
| 2015 | (no id) | checkbox | Downtown |  |
| 2016 | (no id) | checkbox | Garden |  |
| 2017 | (no id) | checkbox | Panoramic |  |
| 2018 | (no id) | checkbox | Park |  |
| 2019 | (no id) | checkbox | River |  |
| 2020 | (no id) | checkbox | Sea/Ocean |  |
| 2021 | (no id) | checkbox | Rooftops/Sky |  |
| 2022 | (no id) | checkbox | Skyline |  |
| 2023 | (no id) | checkbox | Streets |  |

### Sub-tab 2.1 General > Unit Pet Policy *  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2032 | salePetsAllowed | checkbox | Yes (All Pets) | PetsAllowed |
| 2033 | salePetsAllowed | checkbox | Cats OK |  |
| 2034 | salePetsAllowed | checkbox | Dogs OK |  |
| 2035 | salePetsAllowed | checkbox | Breed Restrictions |  |
| 2036 | salePetsAllowed | checkbox | Size Limit |  |
| 2037 | salePetsAllowed | checkbox | Number Limit |  |
| 2038 | salePetsAllowed | checkbox | No Pets |  |

### Sub-tab 2.2 Next: Rental Policies > Additional Rooms  - 15 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2063 | (no id) | checkbox | Den/Office |  |
| 2064 | (no id) | checkbox | Dressing Room |  |
| 2065 | (no id) | checkbox | Exercise Room |  |
| 2066 | (no id) | checkbox | Family Room |  |
| 2067 | (no id) | checkbox | Foyer |  |
| 2068 | (no id) | checkbox | Great Room |  |
| 2069 | (no id) | checkbox | Laundry Room |  |
| 2070 | (no id) | checkbox | Library |  |
| 2071 | (no id) | checkbox | Living Room |  |
| 2072 | (no id) | checkbox | Loft Space |  |
| 2073 | (no id) | checkbox | Media Room |  |
| 2074 | (no id) | checkbox | Playroom |  |
| 2075 | (no id) | checkbox | Safe Room |  |
| 2076 | (no id) | checkbox | Sleeping Loft |  |
| 2077 | (no id) | checkbox | Sun Room |  |

### Sub-tab 2.2 Next: Rental Policies > Kitchen Type  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2085 | (no id) | checkbox | Eat In |  |
| 2086 | (no id) | checkbox | Galley |  |
| 2087 | (no id) | checkbox | Open |  |
| 2088 | (no id) | checkbox | Pass Through |  |
| 2089 | (no id) | checkbox | Pullman |  |
| 2090 | (no id) | checkbox | Second Kitchen |  |
| 2091 | (no id) | checkbox | Separate |  |
| 2092 | (no id) | checkbox | Traditional |  |
| 2093 | (no id) | checkbox | Windowed |  |

### Sub-tab 2.2 Next: Rental Policies > Kitchen Features  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2101 | (no id) | checkbox | Center Island |  |
| 2102 | (no id) | checkbox | Chef's |  |
| 2103 | (no id) | checkbox | Dishwasher |  |
| 2104 | (no id) | checkbox | Modern Kitchen |  |
| 2105 | (no id) | checkbox | New Appliances |  |
| 2106 | (no id) | checkbox | Pantry |  |
| 2107 | (no id) | checkbox | Window |  |

### Sub-tab 2.2 Next: Rental Policies > Dining  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2115 | (no id) | checkbox | Dining Alcove |  |
| 2116 | (no id) | checkbox | Dining Area |  |
| 2117 | (no id) | checkbox | Dining in Foyer |  |
| 2118 | (no id) | checkbox | Dining in Living Room |  |
| 2119 | (no id) | checkbox | Dining L |  |
| 2120 | (no id) | checkbox | Formal Dining Room |  |

### Sub-tab 2.2 Next: Rental Policies > Bathroom Features  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2128 | (no id) | checkbox | Bidet(s) |  |
| 2129 | (no id) | checkbox | Jacuzzi(s) |  |
| 2130 | (no id) | checkbox | Marble |  |
| 2131 | (no id) | checkbox | En Suite(s) |  |
| 2132 | (no id) | checkbox | Sauna(s) |  |
| 2133 | (no id) | checkbox | Stall Shower(s) |  |
| 2134 | (no id) | checkbox | Window |  |

### Sub-tab 2.3 Next: Purchase Policies > Feature Details  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2159 | (no id) | checkbox | Exposed Brick |  |
| 2160 | (no id) | checkbox | Original Detail |  |
| 2161 | (no id) | checkbox | Pre-War Charm |  |

### Sub-tab 2.3 Next: Purchase Policies > Windows  - 20 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2169 | (no id) | checkbox | Aluminum Frames |  |
| 2170 | (no id) | checkbox | Bay Windows |  |
| 2171 | (no id) | checkbox | Blinds |  |
| 2172 | (no id) | checkbox | Display Windows |  |
| 2173 | (no id) | checkbox | Double Pane |  |
| 2174 | (no id) | checkbox | Drapes |  |
| 2175 | (no id) | checkbox | Energy Star |  |
| 2176 | (no id) | checkbox | Garden Windows |  |
| 2177 | (no id) | checkbox | Insulated |  |
| 2178 | (no id) | checkbox | Low Emissivity |  |
| 2179 | (no id) | checkbox | New Windows |  |
| 2180 | (no id) | checkbox | Noise Reduction |  |
| 2181 | (no id) | checkbox | Oversized |  |
| 2182 | (no id) | checkbox | Screens |  |
| 2183 | (no id) | checkbox | Skylights |  |
| 2184 | (no id) | checkbox | Solar Screens |  |
| 2185 | (no id) | checkbox | Tinted |  |
| 2186 | (no id) | checkbox | Triple Pane |  |
| 2187 | (no id) | checkbox | Window Coverings |  |
| 2188 | (no id) | checkbox | Wood Frames |  |

### Sub-tab 2.3 Next: Purchase Policies > Ceilings  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2196 | (no id) | checkbox | Beamed Ceilings |  |
| 2197 | (no id) | checkbox | High Ceilings |  |

### Sub-tab 2.3 Next: Purchase Policies > Flooring  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2205 | (no id) | checkbox | Concrete |  |
| 2206 | (no id) | checkbox | Hardwood |  |
| 2207 | (no id) | checkbox | Herringbone |  |
| 2208 | (no id) | checkbox | Marble |  |
| 2209 | (no id) | checkbox | Parquet |  |

### Sub-tab 2.3 Next: Purchase Policies > Storage  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2217 | (no id) | checkbox | Great Closet Space |  |
| 2218 | (no id) | checkbox | Murphy Bed |  |
| 2219 | (no id) | checkbox | Storage Loft |  |
| 2220 | (no id) | checkbox | Storage Space |  |
| 2221 | (no id) | checkbox | Walk In Closets |  |

### Sub-tab 2.3 Next: Purchase Policies > Washer/Dryer  - 11 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2231 | saleWasherDryerAllowed | radio | Washer/Dryer Allowed * | LaundryFeatures |
| 2234 | saleWasherDryerAllowed | radio | Washer/Dryer Allowed * |  |
| 2238 | (no id) | checkbox | Washer/Dryer Hookups |  |
| 2239 | (no id) | checkbox | Washer/Dryer in Unit |  |
| 2244 | (no id) | checkbox | Bosch |  |
| 2245 | (no id) | checkbox | Gaggenau |  |
| 2246 | (no id) | checkbox | LG |  |
| 2247 | (no id) | checkbox | Maytag |  |
| 2248 | (no id) | checkbox | Miele |  |
| 2249 | (no id) | checkbox | Whirlpool |  |
| 2250 | (no id) | checkbox | Other |  |

### Sub-tab 2.3 Next: Purchase Policies > Cooling  - 27 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2261 | saleCoolingYes | radio | Cooling * |  |
| 2264 | saleCoolingNo | radio | Cooling * |  |
| 2271 | saleCooling | checkbox | Central Air | Cooling |
| 2272 | saleCooling | checkbox | Ductless |  |
| 2273 | saleCooling | checkbox | Wall Units |  |
| 2274 | saleCooling | checkbox | Window Units |  |
| 2275 | saleCooling | checkbox | Wall/Window Units |  |
| 2276 | saleCooling | checkbox | Electric |  |
| 2278 | saleCooling | checkbox | Heat Pump |  |
| 2279 | saleCooling | checkbox | Dual |  |
| 2280 | saleCooling | checkbox | Multi Units |  |
| 2281 | saleCooling | checkbox | Zoned |  |
| 2282 | saleCooling | checkbox | Separate Meters |  |
| 2284 | saleCooling | checkbox | Building Cooling |  |
| 2285 | saleCooling | checkbox | Whole House Fan |  |
| 2286 | saleCooling | checkbox | Attic Fan |  |
| 2287 | saleCooling | checkbox | Ceiling Fans |  |
| 2288 | saleCooling | checkbox | Roof Turbines |  |
| 2290 | saleCooling | checkbox | Gas |  |
| 2291 | saleCooling | checkbox | Geothermal |  |
| 2292 | saleCooling | checkbox | Evaporative Cooling |  |
| 2293 | saleCooling | checkbox | Exhaust Fan |  |
| 2294 | saleCooling | checkbox | Humidity Control |  |
| 2297 | saleCooling | checkbox | ENERGY STAR Equipment |  |
| 2298 | saleCooling | checkbox | Varies by Unit |  |
| 2299 | saleCooling | checkbox | None |  |
| 2300 | saleCooling | checkbox | Other |  |

### Sub-tab 2.3 Next: Purchase Policies > Heating  - 45 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2311 | saleHeatingYes | radio | Heating |  |
| 2314 | saleHeatingNo | radio | Heating |  |
| 2321 | saleHeating | checkbox | Steam | Heating |
| 2322 | saleHeating | checkbox | Hot Water |  |
| 2323 | saleHeating | checkbox | Central |  |
| 2324 | saleHeating | checkbox | Forced Air |  |
| 2325 | saleHeating | checkbox | Baseboard |  |
| 2326 | saleHeating | checkbox | Radiant |  |
| 2327 | saleHeating | checkbox | Radiant Floor |  |
| 2328 | saleHeating | checkbox | Electric |  |
| 2329 | saleHeating | checkbox | Natural Gas |  |
| 2330 | saleHeating | checkbox | City Steam |  |
| 2331 | saleHeating | checkbox | Heat Pump |  |
| 2332 | saleHeating | checkbox | Ductless |  |
| 2334 | saleHeating | checkbox | Geothermal |  |
| 2335 | saleHeating | checkbox | Active Solar |  |
| 2336 | saleHeating | checkbox | Solar |  |
| 2337 | saleHeating | checkbox | Passive Solar |  |
| 2339 | saleHeating | checkbox | Fireplaces |  |
| 2340 | saleHeating | checkbox | Fireplace Insert |  |
| 2341 | saleHeating | checkbox | Wood Stove |  |
| 2342 | saleHeating | checkbox | Pellet Stove |  |
| 2343 | saleHeating | checkbox | Wood |  |
| 2345 | saleHeating | checkbox | Oil |  |
| 2346 | saleHeating | checkbox | Coal |  |
| 2347 | saleHeating | checkbox | Coal Stove |  |
| 2348 | saleHeating | checkbox | Kerosene |  |
| 2349 | saleHeating | checkbox | Propane |  |
| 2350 | saleHeating | checkbox | Propane Stove |  |
| 2352 | saleHeating | checkbox | Space Heater |  |
| 2353 | saleHeating | checkbox | Wall Furnace |  |
| 2354 | saleHeating | checkbox | Floor Furnace |  |
| 2355 | saleHeating | checkbox | Gravity |  |
| 2356 | saleHeating | checkbox | Radiant Ceiling |  |
| 2357 | saleHeating | checkbox | Ceiling |  |
| 2358 | saleHeating | checkbox | Exhaust Fan |  |
| 2359 | saleHeating | checkbox | Humidity Control |  |
| 2361 | saleHeating | checkbox | Separate Meters |  |
| 2362 | saleHeating | checkbox | Zoned |  |
| 2363 | saleHeating | checkbox | Varies by Unit |  |
| 2364 | saleHeating | checkbox | ENERGY STAR ACCA/RSI |  |
| 2365 | saleHeating | checkbox | ENERGY STAR Equipment |  |
| 2366 | saleHeating | checkbox | See Remarks |  |
| 2368 | saleHeating | checkbox | None |  |
| 2369 | saleHeating | checkbox | Other |  |

### Sub-tab 2.3 Next: Purchase Policies > Fresh Air System  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2378 | (no id) | checkbox | VRF System |  |
| 2379 | (no id) | checkbox | Purification & Humidification System |  |
| 2380 | (no id) | checkbox | Vented from Outside |  |

### Sub-tab 2.3 Next: Purchase Policies > HVAC  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2388 | (no id) | checkbox | 4 Pipe Fan |  |
| 2389 | (no id) | checkbox | Vertical Heat Pump |  |
| 2390 | (no id) | checkbox | Split System |  |

### Sub-tab 2.3 Next: Purchase Policies > Fireplace  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2400 | fireplace | radio | Fireplace * | InteriorFeatures |
| 2403 | fireplace | radio | Fireplace * |  |
| 2409 | (no id) | number | Decorative Fireplaces |  |
| 2413 | (no id) | number | Gas Fireplaces |  |
| 2417 | (no id) | number | Woodburning Fireplaces |  |

## Tab 3: PERSONNEL & CONTACTS  (80 controls)

### Sub-tab 3.1 > Property Details  - 8 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2465 | saleTHStories | number | Stories (Property) * | Stories |
| 2469 | saleTHUnitsTotal | number | # Residential Units * | NumberOfUnitsTotal |
| 2473 | saleTHProfUnits | number | # Professional Units |  |
| 2477 | saleTHRetailUnits | number | # Retail Units |  |
| 2481 | saleTHNumBuildings | number | # Buildings | NumberOfBuildings |
| 2485 | saleTHVacantUnits | number | # Vacant Units |  |
| 2489 | saleTHCommercialYN | select | Commercial Units? | CommercialUnitsYN |
| 2497 | saleTHDevStatus | select | Development Status | DevelopmentStatus |

### Sub-tab 3.1 > Lot Information  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2522 | saleTHLotSize | number | Lot Size * | LotSizeArea |
| 2526 | saleTHLotSizeUnits | select | Lot Size Units * | LotSizeUnits |
| 2534 | saleTHLotDimensions | text | Lot Dimensions * | LotSizeDimensions |
| 2538 | saleTHLotSizeSource | select | Lot Size Source | LotSizeSource |
| 2556 | saleTHLandmark | select | Landmark Status | LandmarkStatusYN |
| 2564 | saleTHLotFeatures | text | Lot Features | LotFeatures |

### Sub-tab 3.1 > Building Size & Structure  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2597 | saleTHBuildingArea | number | Building Area Total * | BuildingAreaTotal |
| 2601 | saleTHBuildingAreaUnits | select | Building Area Units | BuildingAreaUnits |
| 2608 | saleTHGrossSqFt | number | Gross Square Footage |  |
| 2612 | saleTHNetSqFt | number | Net Square Footage |  |
| 2616 | saleTHFoundationArea | text | Foundation Area | FoundationArea |
| 2620 | saleTHFoundation | select | Foundation Details | FoundationDetails |
| 2638 | saleTHBasementYN | select | Basement | BasementYN |
| 2646 | (no id) | select | Basement Type |  |
| 2658 | saleTHLevels | select | Levels | Levels |

### Sub-tab 3.1 > Zoning & FAR  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2676 | saleTHZoning | text | Zoning Description | ZoningDescription |
| 2680 | saleTHOverFAR | number | Area Over FAR (sq ft) |  |
| 2684 | saleTHUnderFAR | number | Area Under FAR (sq ft) |  |

### Sub-tab 3.1 > Land Lease  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2695 | saleTHLandLeaseYN | select | Land Lease? | LandLeaseYN |
| 2703 | saleTHLandLeaseAmt | number | Land Lease Amount | LandLeaseAmount |
| 2707 | saleTHLandLeaseFreq | select | Frequency | LandLeaseAmountFrequency |
| 2724 | saleTHLandLeaseExp | date | Expiration Date | LandLeaseExpirationDate |

### Sub-tab 3.1 > Parking  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2737 | saleTHGarageYN | select | Garage? | GarageYN |
| 2745 | saleTHGarageSpaces | number | Garage Spaces | GarageSpaces |
| 2749 | saleTHAttachedGarage | select | Attached? | AttachedGarageYN |
| 2757 | saleTHOpenParkingYN | select | Open Parking? | OpenParkingYN |
| 2765 | saleTHOpenSpaces | number | Open Spaces |  |
| 2769 | saleTHParkingTotal | number | Total Parking | ParkingTotal |

### Sub-tab 3.1 > Documents Available (Upon Request)  - 8 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2779 | saleTHDocsAvailable | checkbox | Building Rules | DocumentsAvailable |
| 2780 | saleTHDocsAvailable | checkbox | Bylaws & Amendments |  |
| 2781 | saleTHDocsAvailable | checkbox | Coming Soon Owner Auth |  |
| 2782 | saleTHDocsAvailable | checkbox | Financial Statement |  |
| 2783 | saleTHDocsAvailable | checkbox | Offering Plan |  |
| 2784 | saleTHDocsAvailable | checkbox | Owner Opt-Out Auth |  |
| 2785 | saleTHDocsAvailable | checkbox | Board Package Template |  |
| 2786 | saleTHDocsAvailable | checkbox | Schedule A |  |

### Sub-tab 3.2 > Description  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2816 | saleTHDescription | textarea | Enter property description. This will be used for  | PublicRemarks |

### Sub-tab 3.2 > Layout  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2833 | saleTHLayout | textarea | Describe the property layout, floor plan, room arr |  |

### Sub-tab 3.2 > Financing  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2846 | saleTHFinancing | textarea | Describe financing terms, assumptions, seller fina |  |

### Sub-tab 3.2 > Notes  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2859 | saleTHNotes | textarea | Internal notes, showing instructions, or additiona |  |

### Sub-tab 3.3 Next: Financials > Income & Expenses  - 27 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2897 | saleTHGrossIncomeM | number | Gross Income |  |
| 2898 | saleTHGrossIncomeA | number | Gross Income |  |
| 2904 | saleTHTaxM | number | RE Tax |  |
| 2905 | saleTHTaxA | number | RE Tax |  |
| 2911 | saleTHWaterM | number | Water and Sewer |  |
| 2912 | saleTHWaterA | number | Water and Sewer |  |
| 2918 | saleTHHeatM | number | Heat |  |
| 2919 | saleTHHeatA | number | Heat |  |
| 2925 | saleTHMaintM | number | Maintenance |  |
| 2926 | saleTHMaintA | number | Maintenance |  |
| 2932 | saleTHMgmtM | number | Management |  |
| 2933 | saleTHMgmtA | number | Management |  |
| 2939 | saleTHSuperM | number | Super / Doorman |  |
| 2940 | saleTHSuperA | number | Super / Doorman |  |
| 2954 | saleTHElectricM | number | Electric |  |
| 2955 | saleTHElectricA | number | Electric |  |
| 2961 | saleTHInsuranceM | number | Insurance |  |
| 2962 | saleTHInsuranceA | number | Insurance |  |
| 2968 | saleTHTrashM | number | Trash |  |
| 2969 | saleTHTrashA | number | Trash |  |
| 2975 | saleTHPestM | number | Pest Control |  |
| 2976 | saleTHPestA | number | Pest Control |  |
| 2982 | saleTHWorkCompM | number | Workers Comp |  |
| 2983 | saleTHWorkCompA | number | Workers Comp |  |
| 2989 | saleTHOtherM | number | Other |  |
| 2990 | saleTHOtherA | number | Other |  |
| 2995 | saleTHOtherRemarks | text | Other Expense Remarks |  |

### Sub-tab 3.3 Next: Financials > Totals & Cap Rate  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3008 | saleTHTotalExpM | number | Total Expenses |  |
| 3009 | saleTHTotalExpA | number | Total Expenses |  |
| 3015 | saleTHNetIncomeM | number | Net Income |  |
| 3016 | saleTHNetIncomeA | number | Net Income |  |
| 3023 | saleTHCapRate | number | Cap Rate (%) | CapRate |

## Tab 4: LISTING DISTRIBUTION  (11 controls)

### IDX / VOW / Syndication Controls  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3080 | saleVOWOptOutYN | checkbox |  | InternetEntireListingDisplayYN |
| 3093 | saleSyndicateYN | checkbox |  | SyndicateTo |

### Send Listing To  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3120 | saleSendToAll | checkbox |  | SyndicateTo |
| 3125 | saleDist_IDX | checkbox | IDX | InternetEntireListingDisplayYN |
| 3126 | saleDist_VOW | checkbox | VOW | InternetEntireListingDisplayYN |
| 3127 | saleDist_Listhub | checkbox | Listhub | SyndicateTo |
| 3128 | saleDist_NYMLS | checkbox | NY MLS | SyndicateTo |
| 3129 | saleDist_Realtor | checkbox | Realtor | SyndicateTo |
| 3130 | saleDist_RPX | checkbox | RPeXchange (RPX) | SyndicateTo |
| 3131 | saleDist_WWW | checkbox | Web (WWW) | InternetEntireListingDisplayYN |
| 3132 | saleDist_RLS | checkbox | RLS Participants | SyndicateTo |

## Tab 5: PREVIEW  (1 controls)

### [panel: Building Amenities] > Transit & Commute  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3439 | saleCommuteAddress | text | Commute Calculator |  |

## Tab 6: UPDATE HISTORY  (2 controls)

### Update History  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3483 | saleHistoryType | radio |  |  |
| 3486 | saleHistoryType | radio |  |  |

## Tab 7: COMMISSION REQUEST  (261 controls)

### Property Information Auto-populated from listing  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3535 | commSaleRlsId | text | RLS / Listing ID |  |
| 3539 | commSaleAddress | text | Full Property Address |  |
| 3543 | commSaleBorough | text | Borough |  |
| 3547 | commSaleListPrice | text | Listing Price |  |
| 3551 | commSaleFinalPrice | number | Sale Price * |  |
| 3556 | commSaleBedBath | text | Bedrooms / Bathrooms |  |
| 3560 | commSaleSqFt | text | Approx. Sq Ft |  |

### Deal Parties  - 10 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3571 | commSaleSellerName | text | Seller Name * |  |
| 3575 | commSaleSellerAttorney | text | Seller Attorney |  |
| 3579 | commSaleBuyerName | text | Buyer Name * |  |
| 3583 | commSaleBuyerEmail | email | Buyer Email * |  |
| 3587 | commSaleBuyerPhone | tel | Buyer Phone * |  |
| 3591 | commSaleBuyerAttorney | text | Buyer Attorney |  |
| 3599 | commSaleListingAgent | text | Listing Agent (Our Side) |  |
| 3603 | commSaleCoListAgent | text | Co-Listing Agent |  |
| 3607 | commSaleBuyerAgent | text | Buyer's Agent (Cooperating) |  |
| 3611 | commSaleCoopBrokerage | text | Cooperating Brokerage |  |

### Commission Calculation  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3626 | commSaleTotalPct | number | Total Commission % * |  |
| 3650 | commSaleListingSidePct | number | 50 |  |
| 3658 | commSaleCoopSidePct | number | 50 |  |
| 3673 | commSaleAgentSplitPct | number | Agent Split % |  |

### Payment Information  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3704 | commSalePayMethod | radio | Payment Method * |  |
| 3709 | commSalePayMethod | radio |  |  |
| 3717 | commSaleClosingDate | date | Closing Date * |  |
| 3722 | commSaleNotes | textarea | Notes / Special Instructions |  |

### [panel: saleMediaModal] > Payment Information  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3801 | salePhotoInput | file |  |  |
| 3830 | saleVideoUrl | url | Video URL | VirtualTourURLBranded |
| 3835 | saleVideoTourUrl | url | Video Tour URL | VirtualTourURLUnbranded |
| 3849 | saleFloorplanInput | file |  |  |
| 3859 | saleMatterportUrl | url | Branded Tour URL (with broker branding) | VirtualTourURLUnbranded2 |
| 3864 | saleVirtualTourUnbranded | url | Unbranded Tour URL (no watermark) | VirtualTourURLUnbranded |
| 3869 | saleVirtualTourUnbranded2 | url | Unbranded Tour URL 2 | VirtualTourURLUnbranded2 |
| 3874 | saleVirtualTourUnbranded3 | url | Unbranded Tour URL 3 | VirtualTourURLUnbranded3 |
| 3887 | saleDocInput | file |  |  |

### Sub-tab 1.1 Location > [panel: Building Information] > Building Address  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3970 | saleBldgStreetAddress | text | Street Address * | StreetName |
| 3974 | saleBldgName | text | Building Name | BuildingName |
| 3978 | saleBldgCity | text | City * | City |
| 3982 | saleBldgState | select | State * | StateOrProvince |
| 3990 | saleBldgZip | text | ZIP Code * | PostalCode |
| 3994 | saleBldgNeighborhood | select | Neighborhood * | SubdivisionName |
| 4051 | saleBldgBorough | select | Borough * | CityRegion |
| 4061 | saleBldgCrossStreet1 | text | Cross Street 1 | CrossStreet |
| 4065 | saleBldgCrossStreet2 | text | Cross Street 2 |  |

### Sub-tab 1.1 Location > [panel: Building Information] > Transportation  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4075 | saleBldgSubwayLines | text | Nearest Subway Lines |  |
| 4079 | saleBldgSubwayStation | text | Nearest Subway Station |  |

### Sub-tab 1.2 Next: Essentials > [panel: Building Information] > Building Details  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4096 | saleBldgType | select | Building Type * | StructureType |
| 4118 | saleBldgClass | select | Building Class |  |
| 4130 | saleBldgYearBuilt | number | Year Built * | YearBuilt |
| 4134 | saleBldgYearRenovated | number | Year Renovated |  |
| 4138 | saleBldgTotalFloors | number | Total Floors * | StoriesTotal |
| 4142 | saleBldgTotalUnits | number | Total Units * | NumberOfUnitsTotal |
| 4146 | saleBldgResidentialUnits | number | Residential Units |  |
| 4150 | saleBldgCommercialUnits | number | Commercial Units |  |
| 4154 | saleBldgParkingSpaces | number | Total Parking Spaces | OpenParkingSpaces |

### Sub-tab 1.2 Next: Essentials > [panel: Building Information] > Building Status  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4163 | saleBldgLandmark | checkbox |  | LandmarkStatusYN |
| 4166 | saleBldgHistoric | checkbox |  | BuildingFeatures |
| 4169 | saleBldgLEED | checkbox |  | BuildingFeatures |
| 4172 | saleBldgNewConstruction | checkbox |  | NewConstructionYN |
| 4175 | saleBldgNewDevelopment | checkbox |  | NewConstructionYN |
| 4178 | saleBldgConversion | checkbox |  | BuildingFeatures |
| 4181 | saleBldgSponsorUnits | checkbox |  | SponsorUnitYN |

### Sub-tab 1.3 Next: Features > [panel: Building Information] > Building Attendance Type *  - 16 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4199 | saleAttendanceType | checkbox | Doorman (Full-Time) | AttendanceType |
| 4200 | saleAttendanceType | checkbox | Doorman (Part-Time) |  |
| 4201 | saleAttendanceType | checkbox | Doorman (Yes) |  |
| 4202 | saleAttendanceType | checkbox | Concierge (Full-Time) |  |
| 4203 | saleAttendanceType | checkbox | Concierge (Part-Time) |  |
| 4204 | saleAttendanceType | checkbox | Concierge (Yes) |  |
| 4205 | saleAttendanceType | checkbox | Elevator Att. (Full-Time) |  |
| 4206 | saleAttendanceType | checkbox | Elevator Att. (Part-Time) |  |
| 4207 | saleAttendanceType | checkbox | Elevator Att. (Yes) |  |
| 4208 | saleAttendanceType | checkbox | Lobby Att. (Full-Time) |  |
| 4209 | saleAttendanceType | checkbox | Lobby Att. (Part-Time) |  |
| 4210 | saleAttendanceType | checkbox | Lobby Att. (Yes) |  |
| 4211 | saleAttendanceType | checkbox | Video Doorman (Full-Time) |  |
| 4212 | saleAttendanceType | checkbox | Video Doorman (Part-Time) |  |
| 4213 | saleAttendanceType | checkbox | Video Doorman (Yes) |  |
| 4214 | saleAttendanceType | checkbox | None |  |

### Sub-tab 1.3 Next: Features > [panel: Building Information] > Building Amenities  - 20 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4221 | saleBldgElevator | checkbox | Elevator | BuildingFeatures |
| 4222 | saleBldgLaundry | checkbox | Laundry Room | LaundryFeatures |
| 4223 | saleBldgGym | checkbox | Gym/Fitness Center | BuildingFeatures |
| 4224 | saleBldgPool | checkbox | Pool | BuildingFeatures |
| 4225 | saleBldgRoofDeck | checkbox | Roof Deck | BuildingFeatures |
| 4226 | saleBldgCourtyard | checkbox | Courtyard/Garden | BuildingFeatures |
| 4227 | saleBldgPlayroom | checkbox | Children's Playroom | BuildingFeatures |
| 4228 | saleBldgLounge | checkbox | Resident Lounge | BuildingFeatures |
| 4229 | saleBldgBusinessCenter | checkbox | Business Center | BuildingFeatures |
| 4230 | saleBldgConferenceRoom | checkbox | Conference Room | BuildingFeatures |
| 4231 | saleBldgBikeRoom | checkbox | Bike Room | BuildingFeatures |
| 4232 | saleBldgStorage | checkbox | Storage Available | BuildingFeatures |
| 4233 | saleBldgParking | checkbox | Parking Garage | BuildingFeatures |
| 4234 | saleBldgValet | checkbox | Valet Parking | BuildingFeatures |
| 4235 | saleBldgPackageRoom | checkbox | Package Room | BuildingFeatures |
| 4236 | saleBldgColdStorage | checkbox | Cold Storage | BuildingFeatures |
| 4237 | saleBldgLiveInSuper | checkbox | Live-In Super | BuildingFeatures |
| 4238 | saleBldgOnSiteManager | checkbox | On-Site Manager | BuildingFeatures |
| 4239 | saleBldgWheelchairAccess | checkbox | Wheelchair Access | BuildingFeatures |
| 4240 | saleBldgSpa | checkbox | Spa | BuildingFeatures |

### Sub-tab 1.3 Next: Features > [panel: Building Information] > Building Systems  - 64 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4249 | saleBldgFuelType | select | Fuel Type |  |
| 4258 | saleBldgNumElevators | number | Number of Elevators | ElevatorsTotal |
| 4266 | saleBldgHeating | checkbox | Bldg Steam |  |
| 4267 | saleBldgHeating | checkbox | Hot Water |  |
| 4268 | saleBldgHeating | checkbox | Bldg Electric |  |
| 4269 | saleBldgHeating | checkbox | Bldg Natural Gas |  |
| 4270 | saleBldgHeating | checkbox | Forced Air |  |
| 4271 | saleBldgHeating | checkbox | Radiant |  |
| 4272 | saleBldgHeating | checkbox | Bldg City Steam |  |
| 4273 | saleBldgHeating | checkbox | Heat Pump |  |
| 4274 | saleBldgHeating | checkbox | Ductless |  |
| 4275 | saleBldgHeating | checkbox | Bldg Geothermal |  |
| 4276 | saleBldgHeating | checkbox | Bldg Oil |  |
| 4277 | saleBldgHeating | checkbox | Bldg Solar |  |
| 4279 | saleBldgHeating | checkbox | Passive Solar |  |
| 4280 | saleBldgHeating | checkbox | Fireplaces |  |
| 4281 | saleBldgHeating | checkbox | Fireplace Insert |  |
| 4282 | saleBldgHeating | checkbox | Wood Stove |  |
| 4283 | saleBldgHeating | checkbox | Pellet Stove |  |
| 4284 | saleBldgHeating | checkbox | Wood |  |
| 4286 | saleBldgHeating | checkbox | Kerosene |  |
| 4287 | saleBldgHeating | checkbox | Propane |  |
| 4288 | saleBldgHeating | checkbox | Propane Stove |  |
| 4289 | saleBldgHeating | checkbox | Space Heater |  |
| 4290 | saleBldgHeating | checkbox | Wall Furnace |  |
| 4291 | saleBldgHeating | checkbox | Floor Furnace |  |
| 4292 | saleBldgHeating | checkbox | Gravity |  |
| 4293 | saleBldgHeating | checkbox | Radiant Ceiling |  |
| 4294 | saleBldgHeating | checkbox | Radiant Floor |  |
| 4296 | saleBldgHeating | checkbox | Exhaust Fan |  |
| 4297 | saleBldgHeating | checkbox | Humidity Control |  |
| 4298 | saleBldgHeating | checkbox | Separate Meters |  |
| 4299 | saleBldgHeating | checkbox | Zoned |  |
| 4300 | saleBldgHeating | checkbox | Varies by Unit |  |
| 4301 | saleBldgHeating | checkbox | ENERGY STAR ACCA/RSI |  |
| 4302 | saleBldgHeating | checkbox | ENERGY STAR Equipment |  |
| 4303 | saleBldgHeating | checkbox | See Remarks |  |
| 4304 | saleBldgHeating | checkbox | None |  |
| 4305 | saleBldgHeating | checkbox | Other |  |
| 4312 | saleBldgCooling | checkbox | Central Air |  |
| 4313 | saleBldgCooling | checkbox | Ductless |  |
| 4314 | saleBldgCooling | checkbox | Wall Units |  |
| 4315 | saleBldgCooling | checkbox | Window Units |  |
| 4316 | saleBldgCooling | checkbox | Wall/Window Units |  |
| 4317 | saleBldgCooling | checkbox | Electric |  |
| 4318 | saleBldgCooling | checkbox | Building Cooling |  |
| 4319 | saleBldgCooling | checkbox | Heat Pump |  |
| 4320 | saleBldgCooling | checkbox | Dual |  |
| 4321 | saleBldgCooling | checkbox | Multi Units |  |
| 4322 | saleBldgCooling | checkbox | Zoned |  |
| 4323 | saleBldgCooling | checkbox | Separate Meters |  |
| 4324 | saleBldgCooling | checkbox | Whole House Fan |  |
| 4325 | saleBldgCooling | checkbox | Attic Fan |  |
| 4326 | saleBldgCooling | checkbox | Ceiling Fans |  |
| 4327 | saleBldgCooling | checkbox | Roof Turbines |  |
| 4328 | saleBldgCooling | checkbox | Gas |  |
| 4329 | saleBldgCooling | checkbox | Geothermal |  |
| 4330 | saleBldgCooling | checkbox | Evaporative Cooling |  |
| 4331 | saleBldgCooling | checkbox | Exhaust Fan |  |
| 4332 | saleBldgCooling | checkbox | Humidity Control |  |
| 4333 | saleBldgCooling | checkbox | ENERGY STAR Equipment |  |
| 4334 | saleBldgCooling | checkbox | Varies by Unit |  |
| 4335 | saleBldgCooling | checkbox | None |  |
| 4336 | saleBldgCooling | checkbox | Other |  |

### Sub-tab 1.4 Next: Financials > [panel: Building Information] > Financial Information (Co-op/Condo)  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4354 | saleBldgAssociationName | text | Association/Corp Name | AssociationName |
| 4358 | saleBldgTotalShares | number | Total Shares (Co-op) |  |
| 4362 | saleBldgUnderlyingMortgage | text | Underlying Mortgage |  |
| 4366 | saleBldgCapitalReserves | text | Capital Reserves | CapitalReservesTotal |
| 4370 | saleBldgCapitalReservesYN | checkbox | Capital Reserves | CapitalReservesYN |

### Sub-tab 1.4 Next: Financials > [panel: Building Information] > Tax Information  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4382 | saleBldgTaxBlock | text | Tax Block | TaxBlock |
| 4386 | saleBldgTaxLot | text | Tax Lot | BuildingTaxLot |
| 4390 | saleBldgAnnualTaxes | text | Annual RE Taxes |  |

### Sub-tab 1.4 Next: Financials > [panel: Building Information] > Tax Abatement  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4401 | saleBldgTaxAbatementYN | select | Has Tax Abatement | TaxAbatementYN |
| 4411 | saleBldgTaxAbatementExpYear | number | Abatement Expiration Year |  |
| 4415 | saleBldgTaxAbatementComments | text | Abatement Comments | TaxAbatementComments |

### Sub-tab 1.4 Next: Financials > [panel: Building Information] > Documents Available (Upon Request)  - 8 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4425 | saleBldgDocsAvailable | checkbox | Building Rules | DocumentsAvailable |
| 4426 | saleBldgDocsAvailable | checkbox | Bylaws & Amendments |  |
| 4427 | saleBldgDocsAvailable | checkbox | Coming Soon Owner Auth |  |
| 4428 | saleBldgDocsAvailable | checkbox | Financial Statement |  |
| 4429 | saleBldgDocsAvailable | checkbox | Offering Plan |  |
| 4430 | saleBldgDocsAvailable | checkbox | Owner Opt-Out Auth |  |
| 4431 | saleBldgDocsAvailable | checkbox | Board Package Template |  |
| 4432 | saleBldgDocsAvailable | checkbox | Schedule A |  |

### Sub-tab 1.5 Next: Description > [panel: Building Information] > Building Description  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4449 | saleBldgDescription | textarea | Building Description | PublicRemarks |
| 4454 | saleBldgWebsite | url | Building Website |  |

### Sub-tab 2.1 General > [panel: Building Information] > Building Pet Policy *  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4481 | saleBuildingPetsAllowed | checkbox | Yes (All Pets) |  |
| 4482 | saleBuildingPetsAllowed | checkbox | Cats OK |  |
| 4483 | saleBuildingPetsAllowed | checkbox | Dogs OK |  |
| 4484 | saleBuildingPetsAllowed | checkbox | Breed Restrictions |  |
| 4485 | saleBuildingPetsAllowed | checkbox | Size Limit |  |
| 4486 | saleBuildingPetsAllowed | checkbox | Number Limit |  |
| 4487 | saleBuildingPetsAllowed | checkbox | No Pets |  |
| 4492 | saleBldgPetWeightLimit | number | Weight Limit (lbs) |  |
| 4496 | saleBldgPetNotes | text | Pet Policy Notes |  |

### Sub-tab 2.1 General > [panel: Building Information] > General Policies  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4504 | saleBldgWasherDryerAllowed | checkbox | Washer/Dryer Allowed | LaundryFeatures |
| 4505 | saleBldgPiedATerre | checkbox | Pied-a-Terre Allowed |  |
| 4506 | saleBldgParentsAllowed | checkbox | Parents Buying Allowed | BuildingFeatures |
| 4507 | saleBldgCoBuyersAllowed | checkbox | Co-Buyers Allowed | BuildingFeatures |
| 4508 | saleBldgCorpOwnAllowed | checkbox | Corp/LLC Purchase Allowed | BuildingFeatures |
| 4509 | saleBldgGiftsAllowed | checkbox | Gifts Allowed for Down Payment | BuildingFeatures |

### Sub-tab 2.2 Next: Rental Policies > [panel: Building Information] > Subletting/Rental Policy  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4525 | saleBldgSublettingAllowed | select | Subletting Allowed |  |
| 4535 | saleBldgMaxSubletYears | number | Max Sublet Years |  |
| 4539 | saleBldgSubletFee | text | Sublet Fee |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: Building Information] > Purchase Requirements (Co-op)  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4557 | saleBldgMaxFinancing | text | Max Financing Allowed | MaximumFinancingAmount |
| 4561 | saleBldgMinDownPayment | text | Min Down Payment |  |
| 4565 | saleBldgDTIRatio | text | DTI Ratio Requirement |  |
| 4569 | saleBldgPostCloseLiquidity | text | Post-Close Liquidity |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: Building Information] > Board Process  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4577 | saleBldgBoardApproval | checkbox | Board Approval Required | BuildingFeatures |
| 4578 | saleBldgBoardInterview | checkbox | Board Interview Required |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: Building Information] > Management Company  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4596 | saleBldgMgmtCompany | text | Company Name |  |
| 4600 | saleBldgMgmtPhone | tel | Phone |  |
| 4604 | saleBldgMgmtEmail | email | Email |  |
| 4608 | saleBldgMgmtAddress | text | Address |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: Building Information] > Building Staff  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4619 | saleBldgSuperName | text | Name |  |
| 4620 | saleBldgSuperPhone | tel | Phone |  |
| 4621 | saleBldgSuperEmail | email | Email |  |
| 4627 | saleBldgManagerName | text | Name |  |
| 4628 | saleBldgManagerPhone | tel | Phone |  |
| 4629 | saleBldgManagerEmail | email | Email |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: Building Information] > Board Information (Co-op/Condo)  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4640 | saleBldgBoardPresident | text | Board President |  |
| 4644 | saleBldgBoardEmail | email | Board Contact Email |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: salePrintModal] > Board Information (Co-op/Condo)  - 15 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4714 | (no id) | checkbox | Listing Type & Agent Info |  |
| 4715 | (no id) | checkbox | Property Classification |  |
| 4716 | (no id) | checkbox | Address & Location |  |
| 4717 | (no id) | checkbox | Pricing & Financials |  |
| 4719 | (no id) | checkbox | Room Layout & Dimensions |  |
| 4720 | (no id) | checkbox | Interior Features & Condition |  |
| 4721 | (no id) | checkbox | Utilities & Systems |  |
| 4723 | (no id) | checkbox | Building Overview |  |
| 4724 | (no id) | checkbox | Amenities & Services |  |
| 4725 | (no id) | checkbox | Policies & Rules |  |
| 4727 | (no id) | checkbox | Distribution Gates & IDX Settings |  |
| 4729 | (no id) | checkbox | Listing Description |  |
| 4730 | (no id) | checkbox | Photos |  |
| 4737 | salePrintBranding | checkbox | Include Mallan Branding Header/Footer |  |
| 4738 | salePrintLandscape | checkbox | Landscape orientation |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: saleEmailModal] > Board Information (Co-op/Condo)  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4761 | saleEmailTo | email | To |  |
| 4765 | saleEmailCC | email | CC |  |
| 4769 | saleEmailSubject | text | Subject |  |
| 4773 | saleEmailMessage | textarea | Message |  |
| 5388 | (no id) | select |  |  |
| 6417 | saleActivationDate | date | Activation Date * | ActivationDate |

### Sub-tab 2.3 Next: Purchase Policies > [panel: saleFinancialCalcModal] > Board Information (Co-op/Condo)  - 22 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 7706 | saleCalcPrice | number | Purchase Price ($) |  |
| 7707 | saleCalcDown | number | Down Payment (%) |  |
| 7708 | saleCalcRate | number | Interest Rate (%) |  |
| 7709 | saleCalcTerm | select | Loan Term (years) |  |
| 7726 | saleClosingPrice | number | Sale Price ($) |  |
| 7740 | saleCoCNOI | number | Annual Net Operating Income ($) |  |
| 7741 | saleCoCCash | number | Total Cash Invested ($) |  |
| 7750 | saleROIPrice | number | Purchase Price ($) |  |
| 7751 | saleROIAppreciation | number | Annual Appreciation (%) |  |
| 7752 | saleROIRent | number | Annual Rental Income ($) |  |
| 7753 | saleROIExpenses | number | Annual Expenses ($) |  |
| 7754 | saleROIYears | number | Hold Period (years) |  |
| 7766 | saleRvBRent | number | Monthly Rent ($) |  |
| 7767 | saleRvBRentInc | number | Annual Rent Increase (%) |  |
| 7768 | saleRvBPrice | number | Purchase Price ($) |  |
| 7769 | saleRvBOwn | number | Monthly Ownership Cost ($) |  |
| 7770 | saleRvBYears | number | Comparison Period (years) |  |
| 7781 | saleBvSValue | number | Current Value ($) |  |
| 7782 | saleBvSAppreciation | number | Annual Appreciation (%) |  |
| 7783 | saleBvSCarry | number | Monthly Carrying Cost ($) |  |
| 7784 | saleBvSProceeds | number | Estimated Sale Proceeds (net) ($) |  |
| 7785 | saleBvSYears | number | Hold Period (years) |  |

