# TENANT-DEAL-FORM.html - structure read from source (origin/main)

Generated 2026-10-15. Sections are taken from the markup (tab ids, sub-tab ids, card headers, panel/modal headings); controls are listed under the last section marker above them.

Control total: 103

## Tab 1: LISTING SEARCH  (34 controls)

### Sub-tab 1.1 Listing Search > Find Listing — IDX / RLS Lookup  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 215 | tenantListingSearch | text | Start typing address (e.g., 200 East 66th Street,  |  |
| 219 | tenantRlsIdSearch | text | RLS ID or Web ID |  |

### Sub-tab 1.1 Listing Search > Property Address  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 245 | tenantStreetAddress | text | Street Address * |  |
| 249 | tenantUnitNumber | text | Unit / Apt |  |
| 253 | tenantBorough | select | Borough * |  |
| 264 | tenantZipCode | text | Zip Code |  |
| 265 | tenantNeighborhood | text | Neighborhood |  |
| 266 | tenantRlsId | text | RLS Listing ID |  |
| 267 | tenantWebId | text | Web ID |  |

### Sub-tab 1.1 Listing Search > Listing Side Information Auto-populated from IDX or enter manually  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 274 | tenantListingAgentName | text | Listing Agent Name |  |
| 275 | tenantListingBrokerageName | text | Listing Brokerage |  |
| 276 | tenantListingAgentPhone | tel | Listing Agent Phone |  |
| 277 | tenantListingAgentEmail | email | Listing Agent Email |  |
| 278 | tenantListingAgentMlsId | text | Listing Agent MLS ID |  |

### Sub-tab 1.1 Listing Search > Tenant's Agent (Our Side)  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 285 | tenantAgentDisplay | text | Tenant's Agent |  |
| 286 | tenantCoAgent | text | Co-Agent |  |
| 287 | tenantCreateDate | date | Create Date |  |

### Sub-tab 1.1 Listing Search > Team Information  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 297 | tenantTeamName | text | Tenant's Agent Team Name (RLS/RESO/IDX: BuyerTeamN |  |
| 302 | tenantTeamMlsId | text | Tenant's Agent Team MLS ID (RLS/RESO/IDX: BuyerTea |  |

### Sub-tab 1.1 Listing Search > Internal Use Only  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 310 | tenantAdminComments | textarea | Administrative Comments |  |

### Sub-tab 1.2 Deal Status > Deal Status & Pricing  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 320 | tenantDealStatus | select | Deal Status * |  |
| 361 | tenantListRent | number | Listed Rent |  |
| 362 | tenantOfferRent | number | Offered Rent |  |
| 363 | tenantFinalRent | number | Final Monthly Rent * |  |
| 364 | tenantLeaseTerm | number | Lease Term (Months) |  |
| 368 | tenantFirstShowingDate | date | First Showing Date |  |
| 369 | tenantAppDate | date | Application Date |  |
| 370 | tenantLeaseStartDate | date | Lease Start Date * |  |
| 371 | tenantLeaseEndDate | date | Lease End Date |  |

### Sub-tab 1.3 Agreements > Tenant Representation Agreement  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 382 | tenantRepAgreementSigned | checkbox |  |  |
| 390 | tenantCommNegotiabilityAck | checkbox |  |  |
| 397 | tenantRepStartDate | date | Agreement Start Date |  |
| 398 | tenantRepEndDate | date | Agreement End Date |  |

### Sub-tab 1.4 Notes > Deal Notes  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 408 | tenantDealNotes | textarea | Agent Notes |  |

## Tab 2: PROPERTY DETAILS  (25 controls)

### Sub-tab 2.1 Unit Details > Property Type & Unit  - 8 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 432 | tenantPropertyType | select | Property Type |  |
| 446 | tenantBedrooms | number | Bedrooms |  |
| 447 | tenantFullBaths | number | Full Bathrooms |  |
| 448 | tenantHalfBaths | number | Half Bathrooms |  |
| 451 | tenantLivingArea | number | Approx. Sq Ft |  |
| 452 | tenantTotalRooms | number | Total Rooms |  |
| 453 | tenantFloor | text | Floor |  |
| 454 | tenantExposure | text | Exposure |  |

### Sub-tab 2.1 Unit Details > Description  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 460 | tenantDescription | textarea | Listing Description |  |

### Sub-tab 2.2 Features > Unit Features & Amenities  - 12 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 469 | tenantFeatDoorman | checkbox | Doorman |  |
| 470 | tenantFeatElevator | checkbox | Elevator |  |
| 471 | tenantFeatGym | checkbox | Gym |  |
| 472 | tenantFeatPool | checkbox | Pool |  |
| 473 | tenantFeatLaundry | checkbox | In-Unit Laundry |  |
| 474 | tenantFeatDishwasher | checkbox | Dishwasher |  |
| 475 | tenantFeatBalcony | checkbox | Balcony/Terrace |  |
| 476 | tenantFeatParking | checkbox | Parking |  |
| 477 | tenantFeatStorage | checkbox | Storage |  |
| 478 | tenantFeatConcierge | checkbox | Concierge |  |
| 479 | tenantFeatRoofDeck | checkbox | Roof Deck |  |
| 480 | tenantFeatPetsAllowed | checkbox | Pets Allowed |  |

### Sub-tab 2.3 Building > Building Information  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 489 | tenantBuildingName | text | Building Name |  |
| 490 | tenantYearBuilt | number | Year Built |  |
| 491 | tenantTotalFloors | number | Total Floors |  |
| 492 | tenantTotalUnits | number | Total Units |  |

## Tab 3: TENANT CLIENT INFO  (18 controls)

### Sub-tab 3.1 Client Details > Tenant Information  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 512 | tenantClientName | text | Tenant Full Name * |  |
| 513 | tenantClientEmail | email | Tenant Email * |  |
| 514 | tenantClientPhone | tel | Tenant Phone * |  |
| 515 | tenantClientPhone2 | tel | Secondary Phone |  |
| 518 | tenantCoTenantName | text | Co-Tenant Name |  |
| 519 | tenantCoTenantEmail | email | Co-Tenant Email |  |

### Sub-tab 3.1 Client Details > Tenant Current Address  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 525 | tenantCurrentAddress | text | Street Address |  |
| 526 | tenantCurrentCity | text | City |  |
| 527 | tenantCurrentStateZip | text | State / Zip |  |

### Sub-tab 3.2 Employment > Employment Information  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 536 | tenantEmployer | text | Employer |  |
| 537 | tenantJobTitle | text | Job Title |  |
| 538 | tenantAnnualIncome | number | Annual Income |  |
| 539 | tenantEmploymentDuration | text | Employment Duration |  |

### Sub-tab 3.3 Guarantor > Guarantor Information  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 548 | tenantHasGuarantor | checkbox | Guarantor Required |  |
| 552 | tenantGuarantorName | text | Guarantor Name |  |
| 553 | tenantGuarantorPhone | tel | Guarantor Phone |  |
| 554 | tenantGuarantorEmail | email | Guarantor Email |  |
| 555 | tenantGuarantorRelationship | text | Relationship |  |

## Tab 4: PHOTOS  (1 controls)

### Manual Photo Upload For off-RLS deals only  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 588 | tenantManualPhotos | file |  |  |

## Tab 7: COMMISSION REQUEST  (25 controls)

### Property Information Auto-populated  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 679 | commTenantRlsId | text | RLS / Listing ID |  |
| 680 | commTenantAddress | text | Full Property Address |  |
| 681 | commTenantBorough | text | Borough |  |
| 682 | commTenantListRent | text | Listed Rent |  |
| 683 | commTenantFinalRent | number | Final Monthly Rent * |  |
| 684 | commTenantBedBath | text | Bedrooms / Bathrooms |  |
| 685 | commTenantSqFt | text | Approx. Sq Ft |  |

### Deal Parties  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 693 | commTenantName | text | Tenant Name * |  |
| 694 | commTenantEmail | email | Tenant Email * |  |
| 695 | commTenantPhone | tel | Tenant Phone * |  |
| 696 | commTenantLandlordName | text | Landlord Name |  |
| 697 | commTenantLandlordMgmt | text | Landlord / Mgmt Co. |  |
| 702 | commTenantOurAgent | text | Tenant's Agent (Our Side) |  |
| 703 | commTenantCoAgent | text | Co-Agent |  |
| 704 | commTenantListingAgentComm | text | Listing Agent (Other Side) |  |
| 705 | commTenantListingBrokerageComm | text | Listing Brokerage |  |

### Commission Calculation  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 715 | commTenantBasis | select | Commission Basis * |  |
| 723 | commTenantCommValue | number | Commission Amount * |  |
| 742 | commTenantOurSidePct | number | 50 |  |
| 750 | commTenantListingSidePct | number | 50 |  |
| 762 | commTenantAgentSplitPct | number | Agent Split % |  |

### Payment Information  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 781 | commTenantPayMethod | radio | Check |  |
| 782 | commTenantPayMethod | radio | Wire Transfer |  |
| 785 | commTenantLeaseStart | date | Lease Start Date * |  |
| 787 | commTenantNotes | textarea | Notes / Special Instructions |  |

