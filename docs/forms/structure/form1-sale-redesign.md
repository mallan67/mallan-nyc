# SALE-FORM-REDESIGN.html - structure read from source (origin/main)

Generated 2026-10-15. Sections are taken from the markup (tab ids, sub-tab ids, card headers, panel/modal headings); controls are listed under the last section marker above them.

Control total: 815

## (top of page)  (1 controls)

### (no sub-section)  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 251 | saleShowRequiredOnly | checkbox |  |  |

## Tab 1: LISTING INFORMATION  (194 controls)

### Sub-tab 1.1 Location > Property Address — Building Lookup  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 307 | saleStreetAddress | text | Street Address * | StreetName |
| 312 | saleUnitNumber | text | Unit / Apt | UnitNumber |
| 317 | saleBorough | select | Borough * | CityRegion |
| 331 | saleZipCode | text | Zip Code * | PostalCode |
| 335 | salePostalCity | text | Postal City * | PostalCity |
| 340 | saleNeighborhoodFromAddress | text | Neighborhood |  |
| 344 | saleCountyOrParish | text | County | CountyOrParish |

### Sub-tab 1.1 Location > Agent & Dates  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 364 | saleUpdatingAgentDisplay | text | Listing Agent |  |
| 370 | saleCreateDate | date | Create Date |  |
| 377 | saleLastUpdatedDate | date | Last Updated |  |

### Sub-tab 1.1 Location > Internal Use Only  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 388 | saleAdminComments | textarea | Administrative Comments |  |

### Sub-tab 1.1 Location > Listing Type & Classification  - 8 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 402 | saleListingType | radio |  |  |
| 406 | saleListingType | radio |  |  |
| 410 | saleListingType | radio |  |  |
| 414 | saleListingType | radio |  |  |
| 421 | saleListingType | radio |  |  |
| 425 | saleListingType | radio |  |  |
| 431 | saleListingType | radio |  |  |
| 435 | saleListingType | radio |  |  |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Listing Type & Classification  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 534 | saleDirectDeal | radio | Yes |  |
| 535 | saleDirectDeal | radio | No |  |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Agreements & Disclosures  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 546 | saleCoBrokeAgreementType | select | CoBroke Agreement Type * |  |
| 555 | saleCommNegotiabilityAck | checkbox |  |  |
| 573 | saleOptOutFormUpload | file | Owner Opt-Out Form (Exhibit B) * |  |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Status & Pricing  - 17 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 584 | saleStatus | select | Status * | MlsStatus |
| 653 | salePrice | number | Price * | ListPrice |
| 657 | saleMaintCC | number | Maint/CC * | AssociationFee |
| 661 | saleMaintCCFreq | select | Fee Frequency | AssociationFeeFrequency |
| 677 | saleRETaxes | number | RE Taxes (Annual) | TaxAnnualAmount |
| 681 | saleTaxMonthly | number | RE Taxes (Monthly) |  |
| 688 | saleTotalMonthly | text | Total Monthly |  |
| 693 | saleOriginalPrice | number | Original Price | OriginalListPrice |
| 697 | saleSoldPrice | number | Sold Price * | ClosePrice |
| 702 | saleAlsoAvailableForRent | checkbox | Sold Price * |  |
| 711 | saleInternetAVMDisplayYN | radio | Y | InternetAutomatedValuationDisplayYN |
| 712 | saleInternetAVMDisplayYN | radio | N |  |
| 728 | saleAuctionYn | checkbox |  | auction_yn |
| 734 | saleAuctionType | select | Auction type * | auction_type |
| 744 | saleAuctionStartDate | datetime-local | Auction start date | auction_start_date |
| 749 | saleAuctionEndDate | datetime-local | Auction end date * | auction_end_date |
| 754 | saleAuctionTermsUrl | url | Auction terms URL | auction_terms_url |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Property Type & Ownership  - 77 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 780 | salePropertyType | radio | Condo | PropertyType |
| 781 | salePropertyType | radio | Co-op |  |
| 782 | salePropertyType | radio | Condop |  |
| 783 | salePropertyType | radio | Single Family TH |  |
| 784 | salePropertyType | radio | Multi-Family TH |  |
| 785 | salePropertyType | radio | Single Family |  |
| 786 | salePropertyType | radio | Multi-Family |  |
| 787 | salePropertyType | radio | Mixed Use |  |
| 788 | salePropertyType | radio | Loft |  |
| 793 | salePropertyType | radio | Duplex (2 Unit) |  |
| 794 | salePropertyType | radio | Triplex (3 Unit) |  |
| 795 | salePropertyType | radio | Quadruplex (4 Unit) |  |
| 800 | salePropertyType | radio | Office |  |
| 801 | salePropertyType | radio | Retail |  |
| 806 | salePropertyType | radio | Land |  |
| 807 | salePropertyType | radio | Deeded Parking |  |
| 813 | saleOfficeRetailOwnership | radio | Condo |  |
| 814 | saleOfficeRetailOwnership | radio | Co-op |  |
| 815 | saleOfficeRetailOwnership | radio | Condop |  |
| 816 | saleOfficeRetailOwnership | radio | Townhouse |  |
| 817 | saleOfficeRetailOwnership | radio | Mixed Use |  |
| 818 | saleOfficeRetailOwnership | radio | Fee Simple |  |
| 826 | saleBuildingStatus | radio | Resale |  |
| 827 | saleBuildingStatus | radio | New Development |  |
| 828 | saleBuildingStatus | radio | Sponsor Unit |  |
| 829 | saleBuildingStatus | radio | New Conversion |  |
| 834 | saleLandLease | radio | No | LandLeaseAmount |
| 835 | saleLandLease | radio | Yes |  |
| 845 | saleStructureType | select | Structure Type * | StructureType |
| 867 | saleCommonInterest | select | Ownership Structure (CommonInterest) * | CommonInterest |
| 893 | salePropertyType | radio |  |  |
| 906 | saleCommSubtype | checkbox | Professional Office |  |
| 907 | saleCommSubtype | checkbox | Medical Office |  |
| 908 | saleCommSubtype | checkbox | Dental Office |  |
| 909 | saleCommSubtype | checkbox | Flexible Space |  |
| 915 | saleCommSubtype | checkbox | Restaurant |  |
| 916 | saleCommSubtype | checkbox | Grocery |  |
| 917 | saleCommSubtype | checkbox | Showroom |  |
| 918 | saleCommSubtype | checkbox | Strip Mall |  |
| 924 | saleCommSubtype | checkbox | Industrial |  |
| 925 | saleCommSubtype | checkbox | Warehouse |  |
| 926 | saleCommSubtype | checkbox | Manufacturing |  |
| 927 | saleCommSubtype | checkbox | Distribution |  |
| 928 | saleCommSubtype | checkbox | Storage |  |
| 934 | saleCommSubtype | checkbox | Mixed Use |  |
| 935 | saleCommSubtype | checkbox | Live/Work |  |
| 936 | saleCommSubtype | checkbox | Investment |  |
| 937 | saleCommSubtype | checkbox | Institutional |  |
| 938 | saleCommSubtype | checkbox | Special Use |  |
| 948 | saleCommercialOwnership | radio | Commercial Condo |  |
| 949 | saleCommercialOwnership | radio | Commercial Condop |  |
| 950 | saleCommercialOwnership | radio | Commercial Co-op |  |
| 951 | saleCommercialOwnership | radio | Whole Building |  |
| 952 | saleCommercialOwnership | radio | Land Only |  |
| 958 | saleTenantConfig | radio | Single Tenant |  |
| 959 | saleTenantConfig | radio | Multi-Tenant |  |
| 969 | saleBusinessType | checkbox | Medical | BusinessType |
| 970 | saleBusinessType | checkbox | Dental |  |
| 971 | saleBusinessType | checkbox | Health Services |  |
| 972 | saleBusinessType | checkbox | Fitness |  |
| 978 | saleBusinessType | checkbox | Restaurant |  |
| 979 | saleBusinessType | checkbox | Food & Beverage |  |
| 980 | saleBusinessType | checkbox | Bar/Tavern/Lounge |  |
| 981 | saleBusinessType | checkbox | Fast Food |  |
| 982 | saleBusinessType | checkbox | Bakery |  |
| 988 | saleBusinessType | checkbox | Professional Service |  |
| 989 | saleBusinessType | checkbox | Financial |  |
| 990 | saleBusinessType | checkbox | Real Estate |  |
| 991 | saleBusinessType | checkbox | Accounting |  |
| 992 | saleBusinessType | checkbox | Computer/Technology |  |
| 998 | saleBusinessType | checkbox | Barber/Beauty |  |
| 999 | saleBusinessType | checkbox | Dry Cleaner |  |
| 1000 | saleBusinessType | checkbox | Laundromat |  |
| 1001 | saleBusinessType | checkbox | Child Care |  |
| 1007 | saleBusinessType | checkbox | Hotel/Motel |  |
| 1008 | saleBusinessType | checkbox | Bed & Breakfast |  |
| 1009 | saleBusinessType | checkbox | Hospitality |  |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Important Dates  - 13 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1024 | saleDateListed | date | Date Listed * | OnMarketDate |
| 1028 | saleExclusiveStart | date | Exclusive Start * |  |
| 1033 | saleExclusiveExpires | date | Exclusive Expires (Hidden) | ExpirationDate |
| 1038 | saleFirstCoBroke | date | First Co-Broke * |  |
| 1040 | saleSendToRls | checkbox | Send to RLS |  |
| 1041 | saleSendToWebsite | checkbox | Send to Website |  |
| 1046 | saleAvailableOccupancy | date | Available for Occupancy |  |
| 1052 | saleFirstShowingDate | datetime-local | First Showing Date | ActivationDate |
| 1057 | (no id) | text | Availability Comments |  |
| 1064 | saleOffMarketDate | date | Off Market Date * | OffMarketDate |
| 1068 | saleWithdrawnDate | date | Withdrawn Date | WithdrawnDate |
| 1072 | saleContractSignedDate | date | Contract Signed Date * | PurchaseContractDate |
| 1076 | saleSoldDate | date | Sold Date * | CloseDate |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Co-op / Condop Details  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1087 | saleUnitShares | number | Unit Shares * |  |
| 1091 | saleUnitSqFt | number | Unit Sq Ft | LivingArea |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Condo Details  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1102 | salePercentCommon | number | % Common Elements |  |
| 1106 | saleLivingArea | number | Living Area (Sq Ft) * | LivingArea |
| 1110 | saleLivingAreaUnits | select | Living Area Units | LivingAreaUnits |
| 1117 | saleLivingAreaSource | select | Living Area Source | LivingAreaSource |
| 1138 | saleTaxDeduction | number | Tax Deduction % |  |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Flip Tax  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1149 | saleFlipTaxAmount | number | Flip Tax Amount * |  |
| 1153 | (no id) | select | Flip Tax Type |  |
| 1162 | (no id) | select | Paid By |  |
| 1176 | (no id) | textarea | Flip Tax Remarks |  |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Building Requirements  - 16 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1185 | saleBoardApproval | radio | Yes |  |
| 1186 | saleBoardApproval | radio | No |  |
| 1190 | saleBoardInterview | radio | Yes |  |
| 1191 | saleBoardInterview | radio | No |  |
| 1195 | saleMeetAndGreet | radio | Yes |  |
| 1196 | saleMeetAndGreet | radio | No |  |
| 1200 | saleBoardApplication | radio | Yes |  |
| 1201 | saleBoardApplication | radio | No |  |
| 1207 | saleFirstRefusal | radio | Yes |  |
| 1208 | saleFirstRefusal | radio | No |  |
| 1212 | saleFilmLocation | radio | Yes |  |
| 1213 | saleFilmLocation | radio | No |  |
| 1217 | saleLiveWorkAllowed | radio | Yes |  |
| 1218 | saleLiveWorkAllowed | radio | No |  |
| 1222 | saleCertOccupancy | radio | Yes |  |
| 1223 | saleCertOccupancy | radio | No |  |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Purchasing Options  - 10 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1235 | salePiedATerre | radio | Yes |  |
| 1236 | salePiedATerre | radio | No |  |
| 1242 | saleParentsBuying | radio | Yes |  |
| 1243 | saleParentsBuying | radio | No |  |
| 1249 | saleCoPurchasing | radio | Yes |  |
| 1250 | saleCoPurchasing | radio | No |  |
| 1256 | saleGuarantors | radio | Yes |  |
| 1257 | saleGuarantors | radio | No |  |
| 1263 | saleSubletting | radio | Yes |  |
| 1264 | saleSubletting | radio | No |  |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Commission Information  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1282 | saleExclusiveCommissionType | select |  |  |
| 1286 | saleExclusiveCommission | number | 0 |  |
| 1294 | saleBuyerAgentPays | radio | Owner Pays (to Buyer's Agent) |  |
| 1295 | saleBuyerAgentPays | radio | Buyer Pays |  |
| 1298 | (no id) | textarea | Commission Comments |  |

### Sub-tab 1.1 Location > [panel: saleListingTypeInfoModal] > Concessions  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1310 | saleConcessions | select | Concessions (RLS/RESO/IDX: Concessions) | Concessions |
| 1320 | saleConcessionAmount | number | Concession Amount (RLS/RESO/IDX: ConcessionsAmount | ConcessionsAmount |
| 1325 | saleConcessionComments | text | Concession Comments (RLS/RESO/IDX: ConcessionsComm |  |

### Sub-tab 1.2 Next: Essentials > [panel: saleListingTypeInfoModal] > Listing URL  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1349 | saleListingUrl | text | Listing URL | ListingURL |

### Sub-tab 1.2 Next: Essentials > [panel: saleListingTypeInfoModal] > Web Display Settings  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1359 | saleWebDisplayAddress | select | Web Display Address |  |
| 1376 | saleWebHeadline | text | Web Headline |  |

### Sub-tab 1.2 Next: Essentials > [panel: saleListingTypeInfoModal] > Internet Display Controls (RLS/RESO/IDX)  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1390 | saleInternetEntireListingDisplayYN | checkbox |  | InternetEntireListingDisplayYN |
| 1404 | saleInternetAddressDisplayYN | checkbox |  | InternetAddressDisplayYN |
| 1418 | saleInternetConsumerCommentYN | checkbox |  | InternetConsumerCommentYN |

### Sub-tab 1.2 Next: Essentials > [panel: saleListingTypeInfoModal] > Listing Description  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1456 | saleFairHousingAck | checkbox |  |  |

### Sub-tab 1.3 Next: Features > [panel: saleListingTypeInfoModal] > Listing Agent *  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1494 | saleListingCompanySearch | text | REBNY Company * |  |
| 1504 | saleListingAgentSearch | text | Agent/Broker Name * |  |

### Sub-tab 1.3 Next: Features > [panel: saleListingTypeInfoModal] > Team Information  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1554 | saleListTeamName | text | Listing Team Name (RLS/RESO/IDX: ListTeamName) | ListTeamName |
| 1559 | saleListTeamMlsId | text | Listing Team MLS ID (RLS/RESO/IDX: ListTeamMlsId) | ListTeamKey |

### Sub-tab 1.3 Next: Features > [panel: saleListingTypeInfoModal] > Buyer's Agent Contact (Required for Contract Signed / Sold status)  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1603 | saleBuyerCompanySearch | text | REBNY Company |  |
| 1613 | saleBuyerAgentSearch | text | Agent/Broker Name |  |

### Sub-tab 1.4 Next: Financials > [panel: saleListingTypeInfoModal] > Scheduled Open Houses  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1705 | saleNewOHDate | date | Date * |  |
| 1711 | saleNewOHStart | time | Start Time * |  |
| 1715 | saleNewOHEnd | time | End Time * |  |
| 1719 | saleNewOHType | select | Type |  |
| 1729 | saleNewOHNotes | text | Notes |  |

## Tab 2: POLICIES & REQUIREMENTS  (277 controls)

### Sub-tab 2.1 General > Number of Floors In The Unit  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1774 | saleNumFloors | radio |  | StoriesTotal |
| 1777 | saleNumFloors | radio |  |  |
| 1780 | saleNumFloors | radio |  |  |
| 1783 | saleNumFloors | radio |  |  |

### Sub-tab 2.1 General > Room Counts  - 8 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1795 | saleTotalRooms | number | Total Rooms | RoomsTotal |
| 1799 | saleBedrooms | number | Bedrooms * | BedroomsTotal |
| 1803 | saleFullBaths | number | Full Bathrooms * | BathroomsFull |
| 1807 | saleHalfBaths | number | Half Bathrooms * | BathroomsHalf |
| 1811 | saleBathroomsTotal | number | Total Bathrooms * | BathroomsTotalInteger |
| 1815 | (no id) | number | Staff Bedrooms |  |
| 1819 | (no id) | number | Staff Bathrooms |  |
| 1829 | saleCondition | select | Property Condition | PropertyCondition |

### Sub-tab 2.1 General > Square Footage & Dimensions  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1850 | saleInteriorSqFt | number | Approx Interior SqFt | LivingArea |
| 1854 | saleExteriorSqFt | number | Approx Exterior SqFt |  |
| 1858 | (no id) | text | Ceiling Height |  |

### Sub-tab 2.1 General > Floor / Line / Original Rooms  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1870 | saleOriginalRooms | number | Original Rooms |  |
| 1874 | saleFloorInBuilding | text | Floor in Building * | EntryLevel |
| 1879 | saleLineInBuilding | text | Line in Building | UnitNumber |

### Sub-tab 2.1 General > Garage  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1890 | saleGarageSpaces | radio | Garage Spaces Assigned * | GarageSpaces |
| 1893 | saleGarageSpaces | radio | Garage Spaces Assigned * |  |
| 1898 | (no id) | text | Number of Garage Spaces |  |

### Sub-tab 2.1 General > Unit Type  - 36 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1907 | saleUnitType2 | radio |  |  |
| 1910 | saleUnitType2 | radio |  |  |
| 1918 | saleResidentialType | checkbox | Alcove Studio |  |
| 1919 | saleResidentialType | checkbox | Floor Thru |  |
| 1920 | saleResidentialType | checkbox | Garden |  |
| 1921 | saleResidentialType | checkbox | Loft |  |
| 1922 | saleResidentialType | checkbox | Maisonette |  |
| 1923 | saleResidentialType | checkbox | Penthouse |  |
| 1924 | saleResidentialType | checkbox | Private Floor |  |
| 1936 | (no id) | number | Lot Size (SqFt) |  |
| 1940 | (no id) | number | Building Size (SqFt) |  |
| 1944 | (no id) | select | Zoning |  |
| 1960 | (no id) | number | FAR (Floor Area Ratio) |  |
| 1964 | (no id) | number | Air Rights (SqFt) |  |
| 1968 | (no id) | number | Ceiling Height (ft) |  |
| 1972 | (no id) | number | Frontage (ft) |  |
| 1976 | (no id) | number | Cap Rate (%) |  |
| 1980 | (no id) | number | Net Operating Income (NOI) |  |
| 1984 | (no id) | number | Number of Units (Total) |  |
| 1988 | (no id) | number | Number of Retail Units |  |
| 1997 | saleCommercialFeatures | checkbox | Drive-In Access |  |
| 1998 | saleCommercialFeatures | checkbox | Loading Dock |  |
| 1999 | saleCommercialFeatures | checkbox | Freight Elevator |  |
| 2000 | saleCommercialFeatures | checkbox | Signage Rights |  |
| 2001 | saleCommercialFeatures | checkbox | Corner Location |  |
| 2002 | saleCommercialFeatures | checkbox | Street Level |  |
| 2003 | saleCommercialFeatures | checkbox | Below Grade |  |
| 2004 | saleCommercialFeatures | checkbox | Vented |  |
| 2005 | saleCommercialFeatures | checkbox | Three Phase Power |  |
| 2006 | saleCommercialFeatures | checkbox | Heavy Power |  |
| 2007 | saleCommercialFeatures | checkbox | Open Floor Plan |  |
| 2008 | saleCommercialFeatures | checkbox | Build to Suit |  |
| 2018 | (no id) | select | Lease Type |  |
| 2030 | (no id) | text | Minimum Lease Term |  |
| 2034 | (no id) | text | Current Tenant |  |
| 2039 | (no id) | date | Lease Expiration |  |

### Sub-tab 2.1 General > Current Use  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2053 | saleCurrentUse | radio |  | CurrentUse |
| 2056 | saleCurrentUse | radio |  |  |
| 2059 | saleCurrentUse | radio |  |  |

### Sub-tab 2.1 General > Private Outdoor Space  - 11 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2068 | salePrivateOutdoorSpace | checkbox | Balcony |  |
| 2069 | salePrivateOutdoorSpace | checkbox | Deck |  |
| 2070 | salePrivateOutdoorSpace | checkbox | Garden |  |
| 2071 | salePrivateOutdoorSpace | checkbox | Green House |  |
| 2072 | salePrivateOutdoorSpace | checkbox | Juliet Balcony |  |
| 2073 | salePrivateOutdoorSpace | checkbox | Patio |  |
| 2074 | salePrivateOutdoorSpace | checkbox | Private Roof Access |  |
| 2075 | salePrivateOutdoorSpace | checkbox | Roof Deck |  |
| 2076 | salePrivateOutdoorSpace | checkbox | Roof Rights |  |
| 2077 | salePrivateOutdoorSpace | checkbox | Terrace |  |
| 2078 | salePrivateOutdoorSpace | checkbox | Wrap Terrace |  |

### Sub-tab 2.1 General > Light  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2087 | saleLight | radio |  |  |
| 2090 | saleLight | radio |  |  |
| 2093 | saleLight | radio |  |  |
| 2096 | saleLight | radio |  |  |

### Sub-tab 2.1 General > Exposure  - 8 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2105 | saleExposure | checkbox | North |  |
| 2106 | saleExposure | checkbox | South |  |
| 2107 | saleExposure | checkbox | East |  |
| 2108 | saleExposure | checkbox | West |  |
| 2109 | saleExposure | checkbox | Northeast |  |
| 2110 | saleExposure | checkbox | Northwest |  |
| 2111 | saleExposure | checkbox | Southeast |  |
| 2112 | saleExposure | checkbox | Southwest |  |

### Sub-tab 2.1 General > Views  - 14 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2122 | saleHasViews | radio | Views * | ViewYN |
| 2125 | saleHasViews | radio | Views * |  |
| 2129 | saleViewList | checkbox | Bridges |  |
| 2130 | saleViewList | checkbox | City |  |
| 2131 | saleViewList | checkbox | City Lights |  |
| 2132 | saleViewList | checkbox | Downtown |  |
| 2133 | saleViewList | checkbox | Garden |  |
| 2134 | saleViewList | checkbox | Panoramic |  |
| 2135 | saleViewList | checkbox | Park |  |
| 2136 | saleViewList | checkbox | River |  |
| 2137 | saleViewList | checkbox | Sea/Ocean |  |
| 2138 | saleViewList | checkbox | Rooftops/Sky |  |
| 2139 | saleViewList | checkbox | Skyline |  |
| 2140 | saleViewList | checkbox | Streets |  |

### Sub-tab 2.2 Next: Rental Policies > Additional Rooms  - 15 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2165 | saleAdditionalRooms | checkbox | Den/Office |  |
| 2166 | saleAdditionalRooms | checkbox | Dressing Room |  |
| 2167 | saleAdditionalRooms | checkbox | Exercise Room |  |
| 2168 | saleAdditionalRooms | checkbox | Family Room |  |
| 2169 | saleAdditionalRooms | checkbox | Foyer |  |
| 2170 | saleAdditionalRooms | checkbox | Great Room |  |
| 2171 | saleAdditionalRooms | checkbox | Laundry Room |  |
| 2172 | saleAdditionalRooms | checkbox | Library |  |
| 2173 | saleAdditionalRooms | checkbox | Living Room |  |
| 2174 | saleAdditionalRooms | checkbox | Loft Space |  |
| 2175 | saleAdditionalRooms | checkbox | Media Room |  |
| 2176 | saleAdditionalRooms | checkbox | Playroom |  |
| 2177 | saleAdditionalRooms | checkbox | Safe Room |  |
| 2178 | saleAdditionalRooms | checkbox | Sleeping Loft |  |
| 2179 | saleAdditionalRooms | checkbox | Sun Room |  |

### Sub-tab 2.2 Next: Rental Policies > Kitchen Type  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2187 | saleKitchenType | checkbox | Eat In |  |
| 2188 | saleKitchenType | checkbox | Galley |  |
| 2189 | saleKitchenType | checkbox | Open |  |
| 2190 | saleKitchenType | checkbox | Pass Through |  |
| 2191 | saleKitchenType | checkbox | Pullman |  |
| 2192 | saleKitchenType | checkbox | Second Kitchen |  |
| 2193 | saleKitchenType | checkbox | Separate |  |
| 2194 | saleKitchenType | checkbox | Traditional |  |
| 2195 | saleKitchenType | checkbox | Windowed |  |

### Sub-tab 2.2 Next: Rental Policies > Kitchen Features  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2203 | saleKitchenFeatures | checkbox | Center Island |  |
| 2204 | saleKitchenFeatures | checkbox | Chef's |  |
| 2205 | saleKitchenFeatures | checkbox | Dishwasher |  |
| 2206 | saleKitchenFeatures | checkbox | Modern Kitchen |  |
| 2207 | saleKitchenFeatures | checkbox | New Appliances |  |
| 2208 | saleKitchenFeatures | checkbox | Pantry |  |
| 2209 | saleKitchenFeatures | checkbox | Window |  |

### Sub-tab 2.2 Next: Rental Policies > Dining  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2217 | saleDining | checkbox | Dining Alcove |  |
| 2218 | saleDining | checkbox | Dining Area |  |
| 2219 | saleDining | checkbox | Dining in Foyer |  |
| 2220 | saleDining | checkbox | Dining in Living Room |  |
| 2221 | saleDining | checkbox | Dining L |  |
| 2222 | saleDining | checkbox | Formal Dining Room |  |

### Sub-tab 2.2 Next: Rental Policies > Bathroom Features  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2230 | saleBathroomFeatures | checkbox | Bidet(s) |  |
| 2231 | saleBathroomFeatures | checkbox | Jacuzzi(s) |  |
| 2232 | saleBathroomFeatures | checkbox | Marble |  |
| 2233 | saleBathroomFeatures | checkbox | En Suite(s) |  |
| 2234 | saleBathroomFeatures | checkbox | Sauna(s) |  |
| 2235 | saleBathroomFeatures | checkbox | Stall Shower(s) |  |
| 2236 | saleBathroomFeatures | checkbox | Window |  |

### Sub-tab 2.3 Next: Purchase Policies > Feature Details  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2261 | saleFeatureDetails | checkbox | Exposed Brick |  |
| 2262 | saleFeatureDetails | checkbox | Original Detail |  |
| 2263 | saleFeatureDetails | checkbox | Pre-War Charm |  |

### Sub-tab 2.3 Next: Purchase Policies > Windows  - 20 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2271 | saleWindows | checkbox | Aluminum Frames |  |
| 2272 | saleWindows | checkbox | Bay Windows |  |
| 2273 | saleWindows | checkbox | Blinds |  |
| 2274 | saleWindows | checkbox | Display Windows |  |
| 2275 | saleWindows | checkbox | Double Pane |  |
| 2276 | saleWindows | checkbox | Drapes |  |
| 2277 | saleWindows | checkbox | Energy Star |  |
| 2278 | saleWindows | checkbox | Garden Windows |  |
| 2279 | saleWindows | checkbox | Insulated |  |
| 2280 | saleWindows | checkbox | Low Emissivity |  |
| 2281 | saleWindows | checkbox | New Windows |  |
| 2282 | saleWindows | checkbox | Noise Reduction |  |
| 2283 | saleWindows | checkbox | Oversized |  |
| 2284 | saleWindows | checkbox | Screens |  |
| 2285 | saleWindows | checkbox | Skylights |  |
| 2286 | saleWindows | checkbox | Solar Screens |  |
| 2287 | saleWindows | checkbox | Tinted |  |
| 2288 | saleWindows | checkbox | Triple Pane |  |
| 2289 | saleWindows | checkbox | Window Coverings |  |
| 2290 | saleWindows | checkbox | Wood Frames |  |

### Sub-tab 2.3 Next: Purchase Policies > Ceilings  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2298 | saleCeilings | checkbox | Beamed Ceilings |  |
| 2299 | saleCeilings | checkbox | High Ceilings |  |

### Sub-tab 2.3 Next: Purchase Policies > Flooring  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2307 | saleFlooring | checkbox | Concrete |  |
| 2308 | saleFlooring | checkbox | Hardwood |  |
| 2309 | saleFlooring | checkbox | Herringbone |  |
| 2310 | saleFlooring | checkbox | Marble |  |
| 2311 | saleFlooring | checkbox | Parquet |  |

### Sub-tab 2.3 Next: Purchase Policies > Storage  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2319 | saleStorage | checkbox | Great Closet Space |  |
| 2320 | saleStorage | checkbox | Murphy Bed |  |
| 2321 | saleStorage | checkbox | Storage Loft |  |
| 2322 | saleStorage | checkbox | Storage Space |  |
| 2323 | saleStorage | checkbox | Walk In Closets |  |

### Sub-tab 2.3 Next: Purchase Policies > Unit Pet Policy *  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2332 | salePetsAllowed | checkbox | Yes (All Pets) | PetsAllowed |
| 2333 | salePetsAllowed | checkbox | Cats OK |  |
| 2334 | salePetsAllowed | checkbox | Dogs OK |  |
| 2335 | salePetsAllowed | checkbox | Breed Restrictions |  |
| 2336 | salePetsAllowed | checkbox | Size Limit |  |
| 2337 | salePetsAllowed | checkbox | Number Limit |  |
| 2338 | salePetsAllowed | checkbox | No Pets |  |

### Sub-tab 2.3 Next: Purchase Policies > Washer/Dryer  - 11 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2351 | saleWasherDryerAllowed | radio | Washer/Dryer Allowed * | LaundryFeatures |
| 2354 | saleWasherDryerAllowed | radio | Washer/Dryer Allowed * |  |
| 2358 | saleWasherDryerHookups | checkbox | Washer/Dryer Hookups |  |
| 2359 | saleWasherDryerInUnit | checkbox | Washer/Dryer in Unit |  |
| 2364 | saleWasherDryerBrand | checkbox | Bosch |  |
| 2365 | saleWasherDryerBrand | checkbox | Gaggenau |  |
| 2366 | saleWasherDryerBrand | checkbox | LG |  |
| 2367 | saleWasherDryerBrand | checkbox | Maytag |  |
| 2368 | saleWasherDryerBrand | checkbox | Miele |  |
| 2369 | saleWasherDryerBrand | checkbox | Whirlpool |  |
| 2370 | saleWasherDryerBrand | checkbox | Other |  |

### Sub-tab 2.3 Next: Purchase Policies > Cooling  - 27 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2381 | saleCoolingYes | radio | Cooling * |  |
| 2384 | saleCoolingNo | radio | Cooling * |  |
| 2391 | saleCooling | checkbox | Central Air | Cooling |
| 2392 | saleCooling | checkbox | Ductless |  |
| 2393 | saleCooling | checkbox | Wall Units |  |
| 2394 | saleCooling | checkbox | Window Units |  |
| 2395 | saleCooling | checkbox | Wall/Window Units |  |
| 2396 | saleCooling | checkbox | Electric |  |
| 2398 | saleCooling | checkbox | Heat Pump |  |
| 2399 | saleCooling | checkbox | Dual |  |
| 2400 | saleCooling | checkbox | Multi Units |  |
| 2401 | saleCooling | checkbox | Zoned |  |
| 2402 | saleCooling | checkbox | Separate Meters |  |
| 2404 | saleCooling | checkbox | Building Cooling |  |
| 2405 | saleCooling | checkbox | Whole House Fan |  |
| 2406 | saleCooling | checkbox | Attic Fan |  |
| 2407 | saleCooling | checkbox | Ceiling Fans |  |
| 2408 | saleCooling | checkbox | Roof Turbines |  |
| 2410 | saleCooling | checkbox | Gas |  |
| 2411 | saleCooling | checkbox | Geothermal |  |
| 2412 | saleCooling | checkbox | Evaporative Cooling |  |
| 2413 | saleCooling | checkbox | Exhaust Fan |  |
| 2414 | saleCooling | checkbox | Humidity Control |  |
| 2417 | saleCooling | checkbox | ENERGY STAR Equipment |  |
| 2418 | saleCooling | checkbox | Varies by Unit |  |
| 2419 | saleCooling | checkbox | None |  |
| 2420 | saleCooling | checkbox | Other |  |

### Sub-tab 2.3 Next: Purchase Policies > Heating  - 45 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2431 | saleHeatingYes | radio | Heating * |  |
| 2434 | saleHeatingNo | radio | Heating * |  |
| 2441 | saleHeating | checkbox | Steam | Heating |
| 2442 | saleHeating | checkbox | Hot Water |  |
| 2443 | saleHeating | checkbox | Central |  |
| 2444 | saleHeating | checkbox | Forced Air |  |
| 2445 | saleHeating | checkbox | Baseboard |  |
| 2446 | saleHeating | checkbox | Radiant |  |
| 2447 | saleHeating | checkbox | Radiant Floor |  |
| 2448 | saleHeating | checkbox | Electric |  |
| 2449 | saleHeating | checkbox | Natural Gas |  |
| 2450 | saleHeating | checkbox | City Steam |  |
| 2451 | saleHeating | checkbox | Heat Pump |  |
| 2452 | saleHeating | checkbox | Ductless |  |
| 2454 | saleHeating | checkbox | Geothermal |  |
| 2455 | saleHeating | checkbox | Active Solar |  |
| 2456 | saleHeating | checkbox | Solar |  |
| 2457 | saleHeating | checkbox | Passive Solar |  |
| 2459 | saleHeating | checkbox | Fireplaces |  |
| 2460 | saleHeating | checkbox | Fireplace Insert |  |
| 2461 | saleHeating | checkbox | Wood Stove |  |
| 2462 | saleHeating | checkbox | Pellet Stove |  |
| 2463 | saleHeating | checkbox | Wood |  |
| 2465 | saleHeating | checkbox | Oil |  |
| 2466 | saleHeating | checkbox | Coal |  |
| 2467 | saleHeating | checkbox | Coal Stove |  |
| 2468 | saleHeating | checkbox | Kerosene |  |
| 2469 | saleHeating | checkbox | Propane |  |
| 2470 | saleHeating | checkbox | Propane Stove |  |
| 2472 | saleHeating | checkbox | Space Heater |  |
| 2473 | saleHeating | checkbox | Wall Furnace |  |
| 2474 | saleHeating | checkbox | Floor Furnace |  |
| 2475 | saleHeating | checkbox | Gravity |  |
| 2476 | saleHeating | checkbox | Radiant Ceiling |  |
| 2477 | saleHeating | checkbox | Ceiling |  |
| 2478 | saleHeating | checkbox | Exhaust Fan |  |
| 2479 | saleHeating | checkbox | Humidity Control |  |
| 2481 | saleHeating | checkbox | Separate Meters |  |
| 2482 | saleHeating | checkbox | Zoned |  |
| 2483 | saleHeating | checkbox | Varies by Unit |  |
| 2484 | saleHeating | checkbox | ENERGY STAR ACCA/RSI |  |
| 2485 | saleHeating | checkbox | ENERGY STAR Equipment |  |
| 2486 | saleHeating | checkbox | See Remarks |  |
| 2488 | saleHeating | checkbox | None |  |
| 2489 | saleHeating | checkbox | Other |  |

### Sub-tab 2.3 Next: Purchase Policies > Fresh Air System  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2498 | saleFreshAirSystem | checkbox | VRF System |  |
| 2499 | saleFreshAirSystem | checkbox | Purification & Humidification System |  |
| 2500 | saleFreshAirSystem | checkbox | Vented from Outside |  |

### Sub-tab 2.3 Next: Purchase Policies > HVAC  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2508 | saleHvacSystem | checkbox | 4 Pipe Fan |  |
| 2509 | saleHvacSystem | checkbox | Vertical Heat Pump |  |
| 2510 | saleHvacSystem | checkbox | Split System |  |

### Sub-tab 2.3 Next: Purchase Policies > Fireplace  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2520 | fireplace | radio | Fireplace * | InteriorFeatures |
| 2523 | fireplace | radio | Fireplace * |  |
| 2529 | (no id) | number | Decorative Fireplaces |  |
| 2533 | (no id) | number | Gas Fireplaces |  |
| 2537 | (no id) | number | Woodburning Fireplaces |  |

## Tab 3: PERSONNEL & CONTACTS  (80 controls)

### Sub-tab 3.1 > Property Details  - 8 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2585 | saleTHStories | number | Stories (Property) * | Stories |
| 2589 | saleTHUnitsTotal | number | # Residential Units * | NumberOfUnitsTotal |
| 2593 | saleTHProfUnits | number | # Professional Units |  |
| 2597 | saleTHRetailUnits | number | # Retail Units |  |
| 2601 | saleTHNumBuildings | number | # Buildings | NumberOfBuildings |
| 2605 | saleTHVacantUnits | number | # Vacant Units |  |
| 2609 | saleTHCommercialYN | select | Commercial Units? |  |
| 2617 | saleTHDevStatus | select | Development Status | DevelopmentStatus |

### Sub-tab 3.1 > Lot Information  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2642 | saleTHLotSize | number | Lot Size * | LotSizeArea |
| 2646 | saleTHLotSizeUnits | select | Lot Size Units * | LotSizeUnits |
| 2654 | saleTHLotDimensions | text | Lot Dimensions * | LotSizeDimensions |
| 2658 | saleTHLotSizeSource | select | Lot Size Source | LotSizeSource |
| 2676 | saleTHLandmark | select | Landmark Status |  |
| 2684 | saleTHLotFeatures | text | Lot Features | LotFeatures |

### Sub-tab 3.1 > Building Size & Structure  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2717 | saleTHBuildingArea | number | Building Area Total * | BuildingAreaTotal |
| 2721 | saleTHBuildingAreaUnits | select | Building Area Units | BuildingAreaUnits |
| 2728 | saleTHGrossSqFt | number | Gross Square Footage |  |
| 2732 | saleTHNetSqFt | number | Net Square Footage |  |
| 2736 | saleTHFoundationArea | text | Foundation Area | FoundationArea |
| 2740 | saleTHFoundation | select | Foundation Details | FoundationDetails |
| 2758 | saleTHBasementYN | select | Basement | BasementYN |
| 2766 | (no id) | select | Basement Type |  |
| 2778 | saleTHLevels | select | Levels | Levels |

### Sub-tab 3.1 > Zoning & FAR  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2796 | saleTHZoning | text | Zoning Description | ZoningDescription |
| 2800 | saleTHOverFAR | number | Area Over FAR (sq ft) |  |
| 2804 | saleTHUnderFAR | number | Area Under FAR (sq ft) |  |

### Sub-tab 3.1 > Land Lease  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2815 | saleTHLandLeaseYN | select | Land Lease? | LandLeaseYN |
| 2823 | saleTHLandLeaseAmt | number | Land Lease Amount | LandLeaseAmount |
| 2827 | saleTHLandLeaseFreq | select | Frequency | LandLeaseAmountFrequency |
| 2844 | saleTHLandLeaseExp | date | Expiration Date | LandLeaseExpirationDate |

### Sub-tab 3.1 > Parking  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2857 | saleTHGarageYN | select | Garage? | GarageYN |
| 2865 | saleTHGarageSpaces | number | Garage Spaces | GarageSpaces |
| 2869 | saleTHAttachedGarage | select | Attached? | AttachedGarageYN |
| 2877 | saleTHOpenParkingYN | select | Open Parking? | OpenParkingYN |
| 2885 | saleTHOpenSpaces | number | Open Spaces |  |
| 2889 | saleTHParkingTotal | number | Total Parking | ParkingTotal |

### Sub-tab 3.1 > Documents Available (Upon Request)  - 8 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2899 | saleTHDocsAvailable | checkbox | Building Rules | DocumentsAvailable |
| 2900 | saleTHDocsAvailable | checkbox | Bylaws & Amendments |  |
| 2901 | saleTHDocsAvailable | checkbox | Coming Soon Owner Auth |  |
| 2902 | saleTHDocsAvailable | checkbox | Financial Statement |  |
| 2903 | saleTHDocsAvailable | checkbox | Offering Plan |  |
| 2904 | saleTHDocsAvailable | checkbox | Owner Opt-Out Auth |  |
| 2905 | saleTHDocsAvailable | checkbox | Board Package Template |  |
| 2906 | saleTHDocsAvailable | checkbox | Schedule A |  |

### Sub-tab 3.2 > Description  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2936 | saleTHDescription | textarea | Enter property description. This will be used for  | PublicRemarks |

### Sub-tab 3.2 > Layout  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2953 | saleTHLayout | textarea | Describe the property layout, floor plan, room arr |  |

### Sub-tab 3.2 > Financing  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2966 | saleTHFinancing | textarea | Describe financing terms, assumptions, seller fina |  |

### Sub-tab 3.2 > Notes  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 2979 | saleTHNotes | textarea | Internal notes, showing instructions, or additiona |  |

### Sub-tab 3.3 Next: Financials > Income & Expenses  - 27 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3017 | saleTHGrossIncomeM | number | Gross Income |  |
| 3018 | saleTHGrossIncomeA | number | Gross Income |  |
| 3024 | saleTHTaxM | number | RE Tax |  |
| 3025 | saleTHTaxA | number | RE Tax |  |
| 3031 | saleTHWaterM | number | Water and Sewer |  |
| 3032 | saleTHWaterA | number | Water and Sewer |  |
| 3038 | saleTHHeatM | number | Heat |  |
| 3039 | saleTHHeatA | number | Heat |  |
| 3045 | saleTHMaintM | number | Maintenance |  |
| 3046 | saleTHMaintA | number | Maintenance |  |
| 3052 | saleTHMgmtM | number | Management |  |
| 3053 | saleTHMgmtA | number | Management |  |
| 3059 | saleTHSuperM | number | Super / Doorman |  |
| 3060 | saleTHSuperA | number | Super / Doorman |  |
| 3074 | saleTHElectricM | number | Electric |  |
| 3075 | saleTHElectricA | number | Electric |  |
| 3081 | saleTHInsuranceM | number | Insurance |  |
| 3082 | saleTHInsuranceA | number | Insurance |  |
| 3088 | saleTHTrashM | number | Trash |  |
| 3089 | saleTHTrashA | number | Trash |  |
| 3095 | saleTHPestM | number | Pest Control |  |
| 3096 | saleTHPestA | number | Pest Control |  |
| 3102 | saleTHWorkCompM | number | Workers Comp |  |
| 3103 | saleTHWorkCompA | number | Workers Comp |  |
| 3109 | saleTHOtherM | number | Other |  |
| 3110 | saleTHOtherA | number | Other |  |
| 3115 | saleTHOtherRemarks | text | Other Expense Remarks |  |

### Sub-tab 3.3 Next: Financials > Totals & Cap Rate  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3128 | saleTHTotalExpM | number | Total Expenses |  |
| 3129 | saleTHTotalExpA | number | Total Expenses |  |
| 3135 | saleTHNetIncomeM | number | Net Income |  |
| 3136 | saleTHNetIncomeA | number | Net Income |  |
| 3143 | saleTHCapRate | number | Cap Rate (%) | CapRate |

## Tab 4: LISTING DISTRIBUTION  (11 controls)

### IDX / VOW / Syndication Controls  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3211 | saleVOWOptOutYN | checkbox |  | InternetEntireListingDisplayYN |
| 3224 | saleSyndicateYN | checkbox |  | SyndicateTo |

### Send Listing To  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3251 | saleSendToAll | checkbox |  | SyndicateTo |
| 3256 | saleDist_IDX | checkbox | IDX | InternetEntireListingDisplayYN |
| 3257 | saleDist_VOW | checkbox | VOW | InternetEntireListingDisplayYN |
| 3258 | saleDist_Listhub | checkbox | Listhub | SyndicateTo |
| 3259 | saleDist_NYMLS | checkbox | NY MLS | SyndicateTo |
| 3260 | saleDist_Realtor | checkbox | Realtor | SyndicateTo |
| 3261 | saleDist_RPX | checkbox | RPeXchange (RPX) | SyndicateTo |
| 3262 | saleDist_WWW | checkbox | Web (WWW) | InternetEntireListingDisplayYN |
| 3263 | saleDist_RLS | checkbox | RLS Participants | SyndicateTo |

## Tab 6: UPDATE HISTORY  (2 controls)

### Update History  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3572 | saleHistoryType | radio |  |  |
| 3575 | saleHistoryType | radio |  |  |

## Tab 7: COMMISSION REQUEST  (250 controls)

### Property Information Auto-populated from listing  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3632 | commSaleRlsId | text | RLS / Listing ID |  |
| 3636 | commSaleAddress | text | Full Property Address |  |
| 3640 | commSaleBorough | text | Borough |  |
| 3644 | commSaleListPrice | text | Listing Price |  |
| 3648 | commSaleFinalPrice | number | Sale Price * |  |
| 3653 | commSaleBedBath | text | Bedrooms / Bathrooms |  |
| 3657 | commSaleSqFt | text | Approx. Sq Ft |  |

### Deal Parties  - 10 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3668 | commSaleSellerName | text | Seller Name * |  |
| 3672 | commSaleSellerAttorney | text | Seller Attorney |  |
| 3676 | commSaleBuyerName | text | Buyer Name * |  |
| 3680 | commSaleBuyerEmail | email | Buyer Email * |  |
| 3684 | commSaleBuyerPhone | tel | Buyer Phone * |  |
| 3688 | commSaleBuyerAttorney | text | Buyer Attorney |  |
| 3696 | commSaleListingAgent | text | Listing Agent (Our Side) |  |
| 3700 | commSaleCoListAgent | text | Co-Listing Agent |  |
| 3704 | commSaleBuyerAgent | text | Buyer's Agent (Cooperating) |  |
| 3708 | commSaleCoopBrokerage | text | Cooperating Brokerage |  |

### Commission Calculation  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3723 | commSaleTotalPct | number | Total Commission % * |  |
| 3747 | commSaleListingSidePct | number | 50 |  |
| 3755 | commSaleCoopSidePct | number | 50 |  |
| 3770 | commSaleAgentSplitPct | number | Agent Split % |  |

### Payment Information  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3801 | commSalePayMethod | radio | Payment Method * |  |
| 3806 | commSalePayMethod | radio |  |  |
| 3814 | commSaleClosingDate | date | Closing Date * |  |
| 3819 | commSaleNotes | textarea | Notes / Special Instructions |  |

### [panel: saleMediaModal] > Payment Information  - 10 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 3898 | salePhotoInput | file |  |  |
| 3925 | salePhotoSortOrder | number | Photo Sort Order (Integer) | PhotosChangeTimestamp |
| 3938 | saleVideoUrl | url | Video URL | VirtualTourURLBranded |
| 3943 | saleVideoTourUrl | url | Video Tour URL | VirtualTourURLUnbranded |
| 3957 | saleFloorplanInput | file |  |  |
| 3969 | saleMatterportUrl | url | Branded Tour URL (with broker branding) | VirtualTourURLUnbranded2 |
| 3974 | saleVirtualTourUnbranded | url | Unbranded Tour URL (no watermark) | VirtualTourURLUnbranded |
| 3979 | saleVirtualTourUnbranded2 | url | Unbranded Tour URL 2 | VirtualTourURLUnbranded2 |
| 3984 | saleVirtualTourUnbranded3 | url | Unbranded Tour URL 3 | VirtualTourURLUnbranded3 |
| 3997 | saleDocInput | file |  |  |

### Sub-tab 1.1 Location > [panel: Building Information] > Building Address  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4080 | saleBldgStreetAddress | text | Street Address * | StreetName |
| 4084 | saleBldgName | text | Building Name | BuildingName |
| 4088 | saleBldgCity | text | City * | City |
| 4092 | saleBldgState | select | State * | StateOrProvince |
| 4100 | saleBldgZip | text | ZIP Code * | PostalCode |
| 4104 | saleBldgNeighborhood | select | Neighborhood * | SubdivisionName |
| 4161 | saleBldgBorough | select | Borough * | CityRegion |
| 4171 | saleBldgCrossStreet1 | text | Cross Street 1 | CrossStreet |
| 4175 | saleBldgCrossStreet2 | text | Cross Street 2 |  |

### Sub-tab 1.1 Location > [panel: Building Information] > Transportation  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4185 | saleBldgSubwayLines | text | Nearest Subway Lines |  |
| 4189 | saleBldgSubwayStation | text | Nearest Subway Station |  |

### Sub-tab 1.2 Next: Essentials > [panel: Building Information] > Building Details  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4206 | saleBldgType | select | Building Type * | StructureType |
| 4228 | saleBldgClass | select | Building Class |  |
| 4240 | saleBldgYearBuilt | number | Year Built * | YearBuilt |
| 4244 | saleBldgYearRenovated | number | Year Renovated |  |
| 4248 | saleBldgTotalFloors | number | Total Floors * | StoriesTotal |
| 4252 | saleBldgTotalUnits | number | Total Units * | NumberOfUnitsTotal |
| 4256 | saleBldgResidentialUnits | number | Residential Units |  |
| 4260 | saleBldgCommercialUnits | number | Commercial Units |  |
| 4264 | saleBldgParkingSpaces | number | Total Parking Spaces | OpenParkingSpaces |

### Sub-tab 1.2 Next: Essentials > [panel: Building Information] > Building Status  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4273 | saleBldgLandmark | checkbox |  |  |
| 4276 | saleBldgHistoric | checkbox |  |  |
| 4279 | saleBldgLEED | checkbox |  |  |
| 4282 | saleBldgNewConstruction | checkbox |  | NewConstructionYN |
| 4285 | saleBldgNewDevelopment | checkbox |  |  |
| 4288 | saleBldgConversion | checkbox |  |  |
| 4291 | saleBldgSponsorUnits | checkbox |  |  |

### Sub-tab 1.3 Next: Features > [panel: Building Information] > Building Attendance Type *  - 16 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4310 | saleAttendanceType | checkbox | Doorman (Full-Time) |  |
| 4311 | saleAttendanceType | checkbox | Doorman (Part-Time) |  |
| 4312 | saleAttendanceType | checkbox | Doorman (Yes) |  |
| 4314 | saleAttendanceType | checkbox | Concierge (Full-Time) |  |
| 4315 | saleAttendanceType | checkbox | Concierge (Part-Time) |  |
| 4316 | saleAttendanceType | checkbox | Concierge (Yes) |  |
| 4318 | saleAttendanceType | checkbox | Elevator Att. (Full-Time) |  |
| 4319 | saleAttendanceType | checkbox | Elevator Att. (Part-Time) |  |
| 4320 | saleAttendanceType | checkbox | Elevator Att. (Yes) |  |
| 4322 | saleAttendanceType | checkbox | Lobby Att. (Full-Time) |  |
| 4323 | saleAttendanceType | checkbox | Lobby Att. (Part-Time) |  |
| 4324 | saleAttendanceType | checkbox | Lobby Att. (Yes) |  |
| 4326 | saleAttendanceType | checkbox | Video Doorman (Full-Time) |  |
| 4327 | saleAttendanceType | checkbox | Video Doorman (Part-Time) |  |
| 4328 | saleAttendanceType | checkbox | Video Doorman (Yes) |  |
| 4330 | saleAttendanceType | checkbox | None |  |

### Sub-tab 1.3 Next: Features > [panel: Building Information] > Building Amenities  - 19 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4338 | saleBldgElevator | checkbox | Elevator | BuildingFeatures |
| 4339 | saleBldgGym | checkbox | Gym/Fitness Center | BuildingFeatures |
| 4340 | saleBldgPool | checkbox | Pool | BuildingFeatures |
| 4341 | saleBldgRoofDeck | checkbox | Roof Deck | BuildingFeatures |
| 4342 | saleBldgCourtyard | checkbox | Courtyard/Garden | BuildingFeatures |
| 4343 | saleBldgPlayroom | checkbox | Children's Playroom | BuildingFeatures |
| 4344 | saleBldgLounge | checkbox | Resident Lounge | BuildingFeatures |
| 4345 | saleBldgBusinessCenter | checkbox | Business Center | BuildingFeatures |
| 4346 | saleBldgConferenceRoom | checkbox | Conference Room | BuildingFeatures |
| 4347 | saleBldgBikeRoom | checkbox | Bike Room | BuildingFeatures |
| 4348 | saleBldgStorage | checkbox | Storage Available | BuildingFeatures |
| 4349 | saleBldgParking | checkbox | Parking Garage | BuildingFeatures |
| 4350 | saleBldgValet | checkbox | Valet Parking | BuildingFeatures |
| 4351 | saleBldgPackageRoom | checkbox | Package Room | BuildingFeatures |
| 4352 | saleBldgColdStorage | checkbox | Cold Storage | BuildingFeatures |
| 4353 | saleBldgLiveInSuper | checkbox | Live-In Super | BuildingFeatures |
| 4354 | saleBldgOnSiteManager | checkbox | On-Site Manager | BuildingFeatures |
| 4355 | saleBldgWheelchairAccess | checkbox | Wheelchair Access | BuildingFeatures |
| 4356 | saleBldgSpa | checkbox | Spa | BuildingFeatures |

### Sub-tab 1.3 Next: Features > [panel: Building Information] > Building Laundry Features *  - 23 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4365 | saleBuildingLaundryFeatures | checkbox | In Unit |  |
| 4366 | saleBuildingLaundryFeatures | checkbox | W/D Install Allowed |  |
| 4367 | saleBuildingLaundryFeatures | checkbox | Washer Hookup |  |
| 4368 | saleBuildingLaundryFeatures | checkbox | Electric Dryer Hookup |  |
| 4369 | saleBuildingLaundryFeatures | checkbox | Gas Dryer Hookup |  |
| 4370 | saleBuildingLaundryFeatures | checkbox | Common Area |  |
| 4371 | saleBuildingLaundryFeatures | checkbox | On Common Floor |  |
| 4372 | saleBuildingLaundryFeatures | checkbox | In Basement |  |
| 4373 | saleBuildingLaundryFeatures | checkbox | Coin Operated |  |
| 4374 | saleBuildingLaundryFeatures | checkbox | Drop-Off Service |  |
| 4375 | saleBuildingLaundryFeatures | checkbox | Dry Cleaning Service |  |
| 4376 | saleBuildingLaundryFeatures | checkbox | Inside |  |
| 4377 | saleBuildingLaundryFeatures | checkbox | In Hall |  |
| 4378 | saleBuildingLaundryFeatures | checkbox | In Garage |  |
| 4379 | saleBuildingLaundryFeatures | checkbox | In Carport |  |
| 4380 | saleBuildingLaundryFeatures | checkbox | Outside |  |
| 4381 | saleBuildingLaundryFeatures | checkbox | Main Level |  |
| 4382 | saleBuildingLaundryFeatures | checkbox | Upper Level |  |
| 4383 | saleBuildingLaundryFeatures | checkbox | Lower Level |  |
| 4384 | saleBuildingLaundryFeatures | checkbox | Multiple Locations |  |
| 4385 | saleBuildingLaundryFeatures | checkbox | See Remarks |  |
| 4386 | saleBuildingLaundryFeatures | checkbox | Other |  |
| 4387 | saleBuildingLaundryFeatures | checkbox | None |  |

### Sub-tab 1.3 Next: Features > [panel: Building Information] > Building Systems  - 64 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4396 | saleBldgFuelType | select | Fuel Type |  |
| 4405 | saleBldgNumElevators | number | Number of Elevators |  |
| 4413 | saleBldgHeating | checkbox | Bldg Steam |  |
| 4414 | saleBldgHeating | checkbox | Hot Water |  |
| 4415 | saleBldgHeating | checkbox | Bldg Electric |  |
| 4416 | saleBldgHeating | checkbox | Bldg Natural Gas |  |
| 4417 | saleBldgHeating | checkbox | Forced Air |  |
| 4418 | saleBldgHeating | checkbox | Radiant |  |
| 4419 | saleBldgHeating | checkbox | Bldg City Steam |  |
| 4420 | saleBldgHeating | checkbox | Heat Pump |  |
| 4421 | saleBldgHeating | checkbox | Ductless |  |
| 4422 | saleBldgHeating | checkbox | Bldg Geothermal |  |
| 4423 | saleBldgHeating | checkbox | Bldg Oil |  |
| 4424 | saleBldgHeating | checkbox | Bldg Solar |  |
| 4426 | saleBldgHeating | checkbox | Passive Solar |  |
| 4427 | saleBldgHeating | checkbox | Fireplaces |  |
| 4428 | saleBldgHeating | checkbox | Fireplace Insert |  |
| 4429 | saleBldgHeating | checkbox | Wood Stove |  |
| 4430 | saleBldgHeating | checkbox | Pellet Stove |  |
| 4431 | saleBldgHeating | checkbox | Wood |  |
| 4433 | saleBldgHeating | checkbox | Kerosene |  |
| 4434 | saleBldgHeating | checkbox | Propane |  |
| 4435 | saleBldgHeating | checkbox | Propane Stove |  |
| 4436 | saleBldgHeating | checkbox | Space Heater |  |
| 4437 | saleBldgHeating | checkbox | Wall Furnace |  |
| 4438 | saleBldgHeating | checkbox | Floor Furnace |  |
| 4439 | saleBldgHeating | checkbox | Gravity |  |
| 4440 | saleBldgHeating | checkbox | Radiant Ceiling |  |
| 4441 | saleBldgHeating | checkbox | Radiant Floor |  |
| 4443 | saleBldgHeating | checkbox | Exhaust Fan |  |
| 4444 | saleBldgHeating | checkbox | Humidity Control |  |
| 4445 | saleBldgHeating | checkbox | Separate Meters |  |
| 4446 | saleBldgHeating | checkbox | Zoned |  |
| 4447 | saleBldgHeating | checkbox | Varies by Unit |  |
| 4448 | saleBldgHeating | checkbox | ENERGY STAR ACCA/RSI |  |
| 4449 | saleBldgHeating | checkbox | ENERGY STAR Equipment |  |
| 4450 | saleBldgHeating | checkbox | See Remarks |  |
| 4451 | saleBldgHeating | checkbox | None |  |
| 4452 | saleBldgHeating | checkbox | Other |  |
| 4459 | saleBldgCooling | checkbox | Central Air |  |
| 4460 | saleBldgCooling | checkbox | Ductless |  |
| 4461 | saleBldgCooling | checkbox | Wall Units |  |
| 4462 | saleBldgCooling | checkbox | Window Units |  |
| 4463 | saleBldgCooling | checkbox | Wall/Window Units |  |
| 4464 | saleBldgCooling | checkbox | Electric |  |
| 4465 | saleBldgCooling | checkbox | Building Cooling |  |
| 4466 | saleBldgCooling | checkbox | Heat Pump |  |
| 4467 | saleBldgCooling | checkbox | Dual |  |
| 4468 | saleBldgCooling | checkbox | Multi Units |  |
| 4469 | saleBldgCooling | checkbox | Zoned |  |
| 4470 | saleBldgCooling | checkbox | Separate Meters |  |
| 4471 | saleBldgCooling | checkbox | Whole House Fan |  |
| 4472 | saleBldgCooling | checkbox | Attic Fan |  |
| 4473 | saleBldgCooling | checkbox | Ceiling Fans |  |
| 4474 | saleBldgCooling | checkbox | Roof Turbines |  |
| 4475 | saleBldgCooling | checkbox | Gas |  |
| 4476 | saleBldgCooling | checkbox | Geothermal |  |
| 4477 | saleBldgCooling | checkbox | Evaporative Cooling |  |
| 4478 | saleBldgCooling | checkbox | Exhaust Fan |  |
| 4479 | saleBldgCooling | checkbox | Humidity Control |  |
| 4480 | saleBldgCooling | checkbox | ENERGY STAR Equipment |  |
| 4481 | saleBldgCooling | checkbox | Varies by Unit |  |
| 4482 | saleBldgCooling | checkbox | None |  |
| 4483 | saleBldgCooling | checkbox | Other |  |

### Sub-tab 1.4 Next: Financials > [panel: Building Information] > Financial Information (Co-op/Condo)  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4501 | saleBldgAssociationName | text | Association/Corp Name | AssociationName |
| 4505 | saleBldgTotalShares | number | Total Shares (Co-op) |  |
| 4509 | saleBldgUnderlyingMortgage | text | Underlying Mortgage |  |
| 4513 | saleBldgCapitalReserves | text | Capital Reserves |  |
| 4517 | saleBldgCapitalReservesYN | checkbox | Capital Reserves |  |

### Sub-tab 1.4 Next: Financials > [panel: Building Information] > Tax Information  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4529 | saleBldgTaxBlock | text | Tax Block | TaxBlock |
| 4533 | saleBldgTaxLot | text | Tax Lot |  |
| 4537 | saleBldgAnnualTaxes | text | Annual RE Taxes |  |

### Sub-tab 1.4 Next: Financials > [panel: Building Information] > Tax Abatement  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4548 | saleBldgTaxAbatementYN | select | Has Tax Abatement |  |
| 4558 | saleBldgTaxAbatementExpYear | number | Abatement Expiration Year |  |
| 4562 | saleBldgTaxAbatementComments | text | Abatement Comments |  |

### Sub-tab 1.4 Next: Financials > [panel: Building Information] > Documents Available (Upon Request)  - 8 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4572 | saleBldgDocsAvailable | checkbox | Building Rules | DocumentsAvailable |
| 4573 | saleBldgDocsAvailable | checkbox | Bylaws & Amendments |  |
| 4574 | saleBldgDocsAvailable | checkbox | Coming Soon Owner Auth |  |
| 4575 | saleBldgDocsAvailable | checkbox | Financial Statement |  |
| 4576 | saleBldgDocsAvailable | checkbox | Offering Plan |  |
| 4577 | saleBldgDocsAvailable | checkbox | Owner Opt-Out Auth |  |
| 4578 | saleBldgDocsAvailable | checkbox | Board Package Template |  |
| 4579 | saleBldgDocsAvailable | checkbox | Schedule A |  |

### Sub-tab 1.5 Next: Description > [panel: Building Information] > Building Description  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4596 | saleBldgDescription | textarea | Building Description | PublicRemarks |
| 4601 | saleBldgWebsite | url | Building Website |  |

### Sub-tab 2.1 General > [panel: Building Information] > Building Pet Policy *  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4628 | saleBuildingPetsAllowed | checkbox | Yes (All Pets) |  |
| 4629 | saleBuildingPetsAllowed | checkbox | Cats OK |  |
| 4630 | saleBuildingPetsAllowed | checkbox | Dogs OK |  |
| 4631 | saleBuildingPetsAllowed | checkbox | Breed Restrictions |  |
| 4632 | saleBuildingPetsAllowed | checkbox | Size Limit |  |
| 4633 | saleBuildingPetsAllowed | checkbox | Number Limit |  |
| 4634 | saleBuildingPetsAllowed | checkbox | No Pets |  |
| 4639 | saleBldgPetWeightLimit | number | Weight Limit (lbs) |  |
| 4643 | saleBldgPetNotes | text | Pet Policy Notes |  |

### Sub-tab 2.1 General > [panel: Building Information] > General Policies  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4651 | saleBldgWasherDryerAllowed | checkbox | Washer/Dryer Allowed | LaundryFeatures |
| 4652 | saleBldgPiedATerre | checkbox | Pied-a-Terre Allowed |  |
| 4653 | saleBldgParentsAllowed | checkbox | Parents Buying Allowed |  |
| 4654 | saleBldgCoBuyersAllowed | checkbox | Co-Buyers Allowed |  |
| 4655 | saleBldgCorpOwnAllowed | checkbox | Corp/LLC Purchase Allowed |  |
| 4656 | saleBldgGiftsAllowed | checkbox | Gifts Allowed for Down Payment |  |

### Sub-tab 2.2 Next: Rental Policies > [panel: Building Information] > Subletting/Rental Policy  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4672 | saleBldgSublettingAllowed | select | Subletting Allowed |  |
| 4682 | saleBldgMaxSubletYears | number | Max Sublet Years |  |
| 4686 | saleBldgSubletFee | text | Sublet Fee |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: Building Information] > Purchase Requirements (Co-op)  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4704 | saleBldgMaxFinancing | text | Max Financing Allowed |  |
| 4708 | saleBldgMinDownPayment | text | Min Down Payment |  |
| 4712 | saleBldgDTIRatio | text | DTI Ratio Requirement |  |
| 4716 | saleBldgPostCloseLiquidity | text | Post-Close Liquidity |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: Building Information] > Board Process  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4724 | saleBldgBoardApproval | checkbox | Board Approval Required |  |
| 4725 | saleBldgBoardInterview | checkbox | Board Interview Required |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: Building Information] > Management Company  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4743 | saleBldgMgmtCompany | text | Company Name |  |
| 4747 | saleBldgMgmtPhone | tel | Phone |  |
| 4751 | saleBldgMgmtEmail | email | Email |  |
| 4755 | saleBldgMgmtAddress | text | Address |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: Building Information] > Building Staff  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4766 | saleBldgSuperName | text | Name |  |
| 4767 | saleBldgSuperPhone | tel | Phone |  |
| 4768 | saleBldgSuperEmail | email | Email |  |
| 4774 | saleBldgManagerName | text | Name |  |
| 4775 | saleBldgManagerPhone | tel | Phone |  |
| 4776 | saleBldgManagerEmail | email | Email |  |

### Sub-tab 2.3 Next: Purchase Policies > [panel: Building Information] > Board Information (Co-op/Condo)  - 11 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 4787 | saleBldgBoardPresident | text | Board President |  |
| 4791 | saleBldgBoardEmail | email | Board Contact Email |  |
| 6190 | (no id) | select |  |  |
| 6248 | coListCompanySearch' + n + ' | text | REBNY Company |  |
| 6255 | coListAgentSearch' + n + ' | text | Agent/Broker Name |  |
| 8079 | salePublicUrlInput | text | Public URL |  |
| 8082 | saleRealPlusUrlInput | text | RealPlus URL |  |
| 8857 | saleActivationDate | date | Activation Date * |  |
| 9470 | (no id) | input |  |  |
| 9676 | (no id) | select |  |  |
| 9933 | (no id) | select |  |  |

