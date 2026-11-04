# BUYER-DEAL-FORM.html - structure read from source (origin/main)

Generated 2026-10-15. Sections are taken from the markup (tab ids, sub-tab ids, card headers, panel/modal headings); controls are listed under the last section marker above them.

Control total: 109

## Tab 1: LISTING SEARCH  (35 controls)

### Sub-tab 1.1 Listing Search > Find Listing — IDX / RLS Lookup  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 244 | buyerRlsIdSearch | text | RLS ID or Web ID |  |

### Sub-tab 1.1 Listing Search > Property Address  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 273 | buyerStreetAddress | text | Street Address * |  |
| 277 | buyerUnitNumber | text | Unit / Apt |  |
| 281 | buyerBorough | select | Borough * |  |
| 294 | buyerZipCode | text | Zip Code |  |
| 298 | buyerNeighborhood | text | Neighborhood |  |
| 302 | buyerRlsId | text | RLS Listing ID |  |
| 306 | buyerWebId | text | Web ID |  |

### Sub-tab 1.1 Listing Search > Listing Side Information Auto-populated from IDX or enter manually  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 317 | buyerListingAgentName | text | Listing Agent Name |  |
| 321 | buyerListingBrokerageName | text | Listing Brokerage |  |
| 325 | buyerListingAgentPhone | tel | Listing Agent Phone |  |
| 329 | buyerListingAgentEmail | email | Listing Agent Email |  |
| 333 | buyerListingAgentMlsId | text | Listing Agent MLS ID |  |

### Sub-tab 1.1 Listing Search > Buyer's Agent (Our Side)  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 344 | buyerAgentDisplay | text | Buyer's Agent |  |
| 349 | buyerCoAgent | text | Co-Buyer's Agent |  |
| 353 | buyerCreateDate | date | Create Date |  |

### Sub-tab 1.1 Listing Search > Team Information  - 2 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 365 | buyerTeamName | text | Buyer Team Name (RLS/RESO/IDX: BuyerTeamName) |  |
| 370 | buyerTeamMlsId | text | Buyer Team MLS ID (RLS/RESO/IDX: BuyerTeamMlsId) |  |

### Sub-tab 1.1 Listing Search > Internal Use Only  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 379 | buyerAdminComments | textarea | Administrative Comments |  |

### Sub-tab 1.2 Deal Status > Deal Status & Pricing  - 9 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 391 | buyerDealStatus | select | Deal Status * |  |
| 438 | buyerListPrice | number | List Price |  |
| 443 | buyerOfferPrice | number | Offer Price |  |
| 447 | buyerSoldPrice | number | Sale Price * |  |
| 451 | buyerMaintCC | number | Maint/CC |  |
| 461 | buyerFirstShowingDate | date | First Showing Date |  |
| 465 | buyerOfferDate | date | Offer Date |  |
| 469 | buyerContractDate | date | Contract Date |  |
| 473 | buyerCloseDate | date | Close Date * |  |

### Sub-tab 1.3 Agreements > Buyer Representation Agreement  - 5 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 486 | buyerRepAgreementSigned | checkbox |  |  |
| 495 | buyerCommNegotiabilityAck | checkbox |  |  |
| 504 | buyerRepStartDate | date | Agreement Start Date |  |
| 508 | buyerRepEndDate | date | Agreement End Date |  |
| 516 | buyerRepAgreementFile | file | Upload Signed Agreement |  |

### Sub-tab 1.4 Notes > Deal Notes  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 527 | buyerDealNotes | textarea | Agent Notes |  |

### Sub-tab 1.4 Notes > Deal Issues / Concerns  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 532 | buyerDealIssues | textarea | Issues |  |

## Tab 2: PROPERTY DETAILS  (25 controls)

### Sub-tab 2.1 Unit Details > Property Type & Unit  - 8 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 563 | buyerPropertyType | select | Property Type |  |
| 584 | buyerBedrooms | number | Bedrooms |  |
| 588 | buyerFullBaths | number | Full Bathrooms |  |
| 592 | buyerHalfBaths | number | Half Bathrooms |  |
| 598 | buyerLivingArea | number | Approx. Sq Ft |  |
| 602 | buyerTotalRooms | number | Total Rooms |  |
| 606 | buyerFloor | text | Floor |  |
| 610 | buyerExposure | text | Exposure |  |

### Sub-tab 2.1 Unit Details > Description  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 618 | buyerDescription | textarea | Listing Description |  |

### Sub-tab 2.2 Features > Unit Features & Amenities  - 12 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 628 | buyerFeatDoorman | checkbox | Doorman |  |
| 629 | buyerFeatElevator | checkbox | Elevator |  |
| 630 | buyerFeatGym | checkbox | Gym |  |
| 631 | buyerFeatPool | checkbox | Pool |  |
| 632 | buyerFeatLaundry | checkbox | In-Unit Laundry |  |
| 633 | buyerFeatDishwasher | checkbox | Dishwasher |  |
| 634 | buyerFeatBalcony | checkbox | Balcony/Terrace |  |
| 635 | buyerFeatParking | checkbox | Parking |  |
| 636 | buyerFeatStorage | checkbox | Storage |  |
| 637 | buyerFeatConcierge | checkbox | Concierge |  |
| 638 | buyerFeatRoofDeck | checkbox | Roof Deck |  |
| 639 | buyerFeatPetsAllowed | checkbox | Pets Allowed |  |

### Sub-tab 2.3 Building > Building Information  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 651 | buyerBuildingName | text | Building Name |  |
| 655 | buyerYearBuilt | number | Year Built |  |
| 659 | buyerTotalFloors | number | Total Floors |  |
| 663 | buyerTotalUnits | number | Total Units |  |

## Tab 3: BUYER CLIENT INFO  (23 controls)

### Sub-tab 3.1 Client Details > Buyer Information  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 687 | buyerClientName | text | Buyer Full Name * |  |
| 691 | buyerClientEmail | email | Buyer Email * |  |
| 695 | buyerClientPhone | tel | Buyer Phone * |  |
| 699 | buyerClientPhone2 | tel | Secondary Phone |  |
| 705 | buyerCoBuyerName | text | Co-Buyer Name |  |
| 709 | buyerCoBuyerEmail | email | Co-Buyer Email |  |

### Sub-tab 3.1 Client Details > Buyer Current Address  - 3 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 719 | buyerClientCurrentAddress | text | Street Address |  |
| 723 | buyerClientCurrentCity | text | City |  |
| 727 | buyerClientCurrentStateZip | text | State / Zip |  |

### Sub-tab 3.2 Financing > Financing Details  - 6 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 740 | buyerPurchaseType | select | Purchase Type |  |
| 752 | buyerPreApproval | number | Pre-Approval Amount |  |
| 758 | buyerLender | text | Lender / Bank |  |
| 762 | buyerMortgageBroker | text | Mortgage Broker |  |
| 766 | buyerDownPaymentPct | number | Down Payment % |  |
| 770 | buyerDownPaymentAmt | number | Down Payment Amount |  |

### Sub-tab 3.3 Attorney > Buyer's Attorney  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 783 | buyerAttorneyName | text | Attorney Name |  |
| 787 | buyerAttorneyFirm | text | Firm Name |  |
| 791 | buyerAttorneyPhone | tel | Attorney Phone |  |
| 795 | buyerAttorneyEmail | email | Attorney Email |  |

### Sub-tab 3.3 Attorney > Seller's Attorney  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 804 | buyerSellerAttorneyName | text | Attorney Name |  |
| 808 | buyerSellerAttorneyFirm | text | Firm Name |  |
| 812 | buyerSellerAttorneyPhone | tel | Attorney Phone |  |
| 816 | buyerSellerAttorneyEmail | email | Attorney Email |  |

## Tab 4: PHOTOS  (1 controls)

### Manual Photo Upload For off-RLS deals only  - 1 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 855 | buyerManualPhotos | file |  |  |

## Tab 7: COMMISSION REQUEST  (25 controls)

### Property Information Auto-populated from deal  - 7 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 960 | commBuyerRlsId | text | RLS / Listing ID |  |
| 964 | commBuyerAddress | text | Full Property Address |  |
| 968 | commBuyerBorough | text | Borough |  |
| 972 | commBuyerListPrice | text | Listing Price |  |
| 976 | commBuyerFinalPrice | number | Sale Price * |  |
| 981 | commBuyerBedBath | text | Bedrooms / Bathrooms |  |
| 985 | commBuyerSqFt | text | Approx. Sq Ft |  |

### Deal Parties  - 10 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 996 | commBuyerName | text | Buyer Name * |  |
| 1000 | commBuyerEmail | email | Buyer Email * |  |
| 1004 | commBuyerPhone | tel | Buyer Phone * |  |
| 1008 | commBuyerAttorney | text | Buyer Attorney |  |
| 1012 | commBuyerSellerName | text | Seller Name |  |
| 1016 | commBuyerSellerAttorney | text | Seller Attorney |  |
| 1024 | commBuyerOurAgent | text | Buyer's Agent (Our Side) |  |
| 1028 | commBuyerCoAgent | text | Co-Buyer's Agent |  |
| 1032 | commBuyerListingAgentComm | text | Listing Agent (Other Side) |  |
| 1036 | commBuyerListingBrokerageComm | text | Listing Brokerage |  |

### Commission Calculation  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1051 | commBuyerTotalPct | number | Total Commission % * |  |
| 1075 | commBuyerOurSidePct | number | 50 |  |
| 1083 | commBuyerListingSidePct | number | 50 |  |
| 1098 | commBuyerAgentSplitPct | number | Agent Split % |  |

### Payment Information  - 4 controls

| line | id | type | label | Cotality field tag |
|---|---|---|---|---|
| 1129 | commBuyerPayMethod | radio | Payment Method * |  |
| 1134 | commBuyerPayMethod | radio |  |  |
| 1142 | commBuyerClosingDate | date | Closing Date * |  |
| 1147 | commBuyerNotes | textarea | Notes / Special Instructions |  |

