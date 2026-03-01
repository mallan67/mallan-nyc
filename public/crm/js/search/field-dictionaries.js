        // ═══════════════════════════════════════════════════════════════════════════════

        var salesFieldDictionary = {
            // LISTING INFORMATION - ESSENTIALS
            essentials: [
                { id: 'listingType', label: 'Listing Type', required: true },
                { id: 'status', label: 'Status', required: true },
                { id: 'price', label: 'Price', required: true },
                { id: 'maintCC', label: 'Maint/CC (Monthly)', required: true },
                { id: 'reTaxes', label: 'RE Taxes (Monthly)', required: false },
                { id: 'totalMonthly', label: 'Total Monthly', computed: true },
                { id: 'availableDate', label: 'Available Date', required: true },
                { id: 'exclusiveStartDate', label: 'Exclusive Start Date', required: true },
                { id: 'exclusiveEndDate', label: 'Exclusive End Date', required: false },
                { id: 'virtualTourUrl', label: 'Virtual Tour URL', required: false },
                { id: 'videoTourUrl', label: 'Video Tour URL', required: false },
                { id: 'coOpCorporation', label: 'Co-Op Corporation Name', required: false },
                { id: 'coOpCorporationPhone', label: 'Co-Op Corporation Phone', required: false },
                { id: 'condoAssociationName', label: 'Condo Association Name', required: false },
                { id: 'condoAssociationPhone', label: 'Condo Association Phone', required: false }
            ],
            // LISTING INFORMATION - CONTACTS
            contacts: [
                { id: 'listingAgent', label: 'Listing Agent', required: true },
                { id: 'coListingAgent', label: 'Co-Listing Agent', required: false },
                { id: 'listingOffice', label: 'Listing Office', required: false },
                { id: 'listingAgentEmail', label: 'Listing Agent Email', required: false },
                { id: 'listingAgentPhone', label: 'Listing Agent Phone', required: false },
                { id: 'showingInstructions', label: 'Showing Instructions', required: false },
                { id: 'lockboxInfo', label: 'Lockbox Info', required: false },
                { id: 'keyLocation', label: 'Key Location', required: false }
            ],
            // LISTING INFORMATION - COMMISSION & BONUSES
            commission: [
                { id: 'sellersBrokerCompensation', label: 'Seller\'s Broker Compensation', required: false },
                { id: 'buyersBrokerCompensation', label: 'Buyer\'s Broker Compensation', required: false },
                { id: 'buyersBrokerCompensationTypePercent', label: 'Commission Type (%)', required: false },
                { id: 'buyersBrokerCompensationTypeDollars', label: 'Commission Type ($)', required: false },
                { id: 'bonus', label: 'Bonus', required: false },
                { id: 'bonusType', label: 'Bonus Type', required: false },
                { id: 'bonusExpirationDate', label: 'Bonus Expiration Date', required: false },
                { id: 'bonusRemarks', label: 'Bonus Remarks', required: false }
            ],
            // LISTING INFORMATION - FINANCING
            financing: [
                { id: 'financingAllowed', label: 'Financing Allowed (%)', required: false },
                { id: 'flipTaxPercent', label: 'Flip Tax (%)', required: false },
                { id: 'flipTaxPaidBy', label: 'Flip Tax Paid By', required: false },
                { id: 'taxAbatement', label: 'Tax Abatement', required: false },
                { id: 'taxAbatementEndDate', label: 'Tax Abatement End Date', required: false },
                { id: 'pilotsOrAbatementsRemaining', label: 'PILOTs or Abatements Remaining', required: false },
                { id: 'sponsor', label: 'Sponsor', required: false },
                { id: 'sponsorUnit', label: 'Sponsor Unit', required: false },
                { id: 'shares', label: 'Shares', required: false },
                { id: 'specialAssessment', label: 'Special Assessment', required: false },
                { id: 'specialAssessmentMonthly', label: 'Special Assessment Monthly', required: false },
                { id: 'specialAssessmentExpiration', label: 'Special Assessment Expiration', required: false }
            ],
            // LISTING INFORMATION - CO-OP/CONDO REQUIREMENTS
            coopCondoRequirements: [
                { id: 'boardApprovalRequired', label: 'Board Approval Required', required: false },
                { id: 'firstRightOfRefusal', label: 'First Right of Refusal', required: false },
                { id: 'purchaseApplicationFee', label: 'Purchase Application Fee', required: false },
                { id: 'moveInFee', label: 'Move-In Fee', required: false },
                { id: 'moveOutFee', label: 'Move-Out Fee', required: false },
                { id: 'petsAllowed', label: 'Pets Allowed', required: false },
                { id: 'petPolicy', label: 'Pet Policy', required: false },
                { id: 'smokingAllowed', label: 'Smoking Allowed', required: false },
                { id: 'sublettingPolicy', label: 'Subletting Policy', required: false },
                { id: 'sublettingAllowed', label: 'Subletting Allowed', required: false },
                { id: 'sublettingFee', label: 'Subletting Fee', required: false },
                { id: 'piedATerreAllowed', label: 'Pied-a-Terre Allowed', required: false },
                { id: 'parentsAllowed', label: 'Parents Allowed', required: false },
                { id: 'guarantorsAllowed', label: 'Guarantors Allowed', required: false },
                { id: 'giftedDownPaymentAllowed', label: 'Gifted Down Payment Allowed', required: false },
                { id: 'incomeRequirement', label: 'Income Requirement', required: false },
                { id: 'minimumDownPayment', label: 'Minimum Down Payment (%)', required: false },
                { id: 'postClosingLiquidity', label: 'Post Closing Liquidity', required: false }
            ],
            // UNIT INFORMATION - ESSENTIALS
            unitEssentials: [
                { id: 'bedrooms', label: 'Bedrooms', required: true },
                { id: 'fullBathrooms', label: 'Full Bathrooms', required: true },
                { id: 'halfBathrooms', label: 'Half Bathrooms', required: false },
                { id: 'totalBathrooms', label: 'Total Bathrooms', computed: true },
                { id: 'totalRooms', label: 'Total Rooms', required: false },
                { id: 'approxInteriorSqft', label: 'Approx Interior SqFt', required: false },
                { id: 'approxExteriorSqft', label: 'Approx Exterior SqFt', required: false },
                { id: 'sqftSource', label: 'SqFt Source', required: false },
                { id: 'floor', label: 'Floor', required: false },
                { id: 'totalFloors', label: 'Total Floors', required: false },
                { id: 'unitNumber', label: 'Unit Number', required: false },
                { id: 'unitType', label: 'Unit Type', required: false },
                { id: 'condition', label: 'Condition', required: false },
                { id: 'exposures', label: 'Exposures', required: false },
                { id: 'viewType', label: 'View Type', required: false },
                { id: 'viewDescription', label: 'View Description', required: false }
            ],
            // UNIT INFORMATION - FEATURES
            unitFeatures: [
                { id: 'airConditioning', label: 'Air Conditioning', required: false },
                { id: 'heating', label: 'Heating', required: false },
                { id: 'fireplace', label: 'Fireplace', required: false },
                { id: 'fireplaceType', label: 'Fireplace Type', required: false },
                { id: 'numFireplaces', label: 'Number of Fireplaces', required: false },
                { id: 'washerDryerInUnit', label: 'Washer/Dryer in Unit', required: false },
                { id: 'dishwasher', label: 'Dishwasher', required: false },
                { id: 'privateOutdoorSpace', label: 'Private Outdoor Space', required: false },
                { id: 'outdoorSpaceType', label: 'Outdoor Space Type', required: false },
                { id: 'outdoorSpaceSqft', label: 'Outdoor Space SqFt', required: false },
                { id: 'homeOffice', label: 'Home Office', required: false },
                { id: 'ceilingHeight', label: 'Ceiling Height', required: false },
                { id: 'hardwoodFloors', label: 'Hardwood Floors', required: false },
                { id: 'privateStorage', label: 'Private Storage', required: false },
                { id: 'storageSqft', label: 'Storage SqFt', required: false },
                { id: 'parkingIncluded', label: 'Parking Included', required: false },
                { id: 'parkingSpaces', label: 'Parking Spaces', required: false },
                { id: 'parkingType', label: 'Parking Type', required: false },
                { id: 'parkingCost', label: 'Parking Cost', required: false },
                { id: 'bikeRoom', label: 'Bike Room', required: false },
                { id: 'residentialConcierge', label: 'Residential Concierge', required: false },
                { id: 'smartHome', label: 'Smart Home', required: false }
            ],
            // UNIT INFORMATION - KITCHEN
            kitchen: [
                { id: 'kitchenType', label: 'Kitchen Type', required: false },
                { id: 'appliancesBrand', label: 'Appliances Brand', required: false },
                { id: 'countertopMaterial', label: 'Countertop Material', required: false },
                { id: 'eatingArea', label: 'Eating Area', required: false },
                { id: 'pantry', label: 'Pantry', required: false },
                { id: 'gasOrElectric', label: 'Gas or Electric', required: false },
                { id: 'stainlessAppliances', label: 'Stainless Appliances', required: false },
                { id: 'wineStorage', label: 'Wine Storage', required: false }
            ],
            // UNIT INFORMATION - DESCRIPTION
            description: [
                { id: 'publicDescription', label: 'Public Description', required: false },
                { id: 'privateRemarks', label: 'Private Remarks (Agent Only)', required: false },
                { id: 'marketingHeadline', label: 'Marketing Headline', required: false },
                { id: 'highlights', label: 'Highlights', required: false },
                { id: 'keyFeatures', label: 'Key Features', required: false },
                { id: 'lifestyleDescription', label: 'Lifestyle Description', required: false }
            ],
            // AGENT/OFFICE INFORMATION
            agentInfo: [
                { id: 'primaryAgentName', label: 'Primary Agent Name', required: false },
                { id: 'primaryAgentEmail', label: 'Primary Agent Email', required: false },
                { id: 'primaryAgentPhone', label: 'Primary Agent Phone', required: false },
                { id: 'listingOfficeName', label: 'Listing Office Name', required: false },
                { id: 'coListingAgentName', label: 'Co-Listing Agent Name', required: false },
                { id: 'coListingAgentEmail', label: 'Co-Listing Agent Email', required: false },
                { id: 'coListingAgentPhone', label: 'Co-Listing Agent Phone', required: false }
            ],
            // DATES & HISTORY
            datesHistory: [
                { id: 'listedDate', label: 'Listed Date', required: false },
                { id: 'updatedDate', label: 'Updated Date', required: false },
                { id: 'contractSignedDate', label: 'Contract Signed Date', required: false },
                { id: 'closingDate', label: 'Closing Date', required: false },
                { id: 'withdrawnDate', label: 'Withdrawn Date', required: false },
                { id: 'canceledDate', label: 'Canceled Date', required: false },
                { id: 'dom', label: 'Days on Market', computed: true },
                { id: 'cdom', label: 'Cumulative Days on Market', computed: true },
                { id: 'originalPrice', label: 'Original Price', required: false },
                { id: 'priceChangeDate', label: 'Price Change Date', required: false },
                { id: 'previousSoldDate', label: 'Previous Sold Date', required: false },
                { id: 'previousSoldPrice', label: 'Previous Sold Price', required: false }
            ],
            // IDS & EXTERNAL REFERENCES
            idsReferences: [
                { id: 'rlsId', label: 'RLS ID (Listing ID)', required: false },
                { id: 'webId', label: 'Web ID', required: false },
                { id: 'mlsNumber', label: 'MLS Number', required: false },
                { id: 'internalListingNumber', label: 'Internal Listing #', required: false },
                { id: 'acrisId', label: 'ACRIS ID', required: false },
                { id: 'taxLot', label: 'Tax Lot', required: false },
                { id: 'taxBlock', label: 'Tax Block', required: false },
                { id: 'bbl', label: 'BBL (Borough Block Lot)', required: false },
                { id: 'bin', label: 'BIN (Building ID)', required: false }
            ]
        };

        var rentalFieldDictionary = {
            // LISTING INFORMATION - ESSENTIALS
            essentials: [
                { id: 'listingType', label: 'Listing Type', required: true },
                { id: 'status', label: 'Status', required: true },
                { id: 'monthlyRent', label: 'Monthly Rent', required: true },
                { id: 'availableDate', label: 'Available Date', required: true },
                { id: 'exclusiveStartDate', label: 'Exclusive Start Date', required: true },
                { id: 'exclusiveEndDate', label: 'Exclusive End Date', required: false },
                { id: 'leaseTermMin', label: 'Lease Term (Min Months)', required: false },
                { id: 'leaseTermMax', label: 'Lease Term (Max Months)', required: false },
                { id: 'furnishedUnfurnished', label: 'Furnished/Unfurnished', required: false },
                { id: 'virtualTourUrl', label: 'Virtual Tour URL', required: false },
                { id: 'videoTourUrl', label: 'Video Tour URL', required: false }
            ],
            // LISTING INFORMATION - CONTACTS
            contacts: [
                { id: 'listingAgent', label: 'Listing Agent', required: true },
                { id: 'coListingAgent', label: 'Co-Listing Agent', required: false },
                { id: 'listingOffice', label: 'Listing Office', required: false },
                { id: 'listingAgentEmail', label: 'Listing Agent Email', required: false },
                { id: 'listingAgentPhone', label: 'Listing Agent Phone', required: false },
                { id: 'showingInstructions', label: 'Showing Instructions', required: false },
                { id: 'lockboxInfo', label: 'Lockbox Info', required: false },
                { id: 'keyLocation', label: 'Key Location', required: false }
            ],
            // LISTING INFORMATION - FEES & DEPOSITS
            feesDeposits: [
                { id: 'brokerFee', label: 'Broker Fee', required: false },
                { id: 'brokerFeeAmount', label: 'Broker Fee Amount', required: false },
                { id: 'brokerFeePaidBy', label: 'Broker Fee Paid By', required: false },
                { id: 'ownerPays', label: 'Owner Pays (OP)', required: false },
                { id: 'concessions', label: 'Concessions', required: false },
                { id: 'concessionsDetail', label: 'Concessions Detail', required: false },
                { id: 'securityDeposit', label: 'Security Deposit', required: false },
                { id: 'lastMonthRequired', label: 'Last Month Required', required: false },
                { id: 'moveInCost', label: 'Total Move-In Cost', computed: true }
            ],
            // LISTING INFORMATION - RENTAL REQUIREMENTS
            rentalRequirements: [
                { id: 'incomeRequirement', label: 'Income Requirement', required: false },
                { id: 'creditScoreMinimum', label: 'Credit Score Minimum', required: false },
                { id: 'guarantorsAllowed', label: 'Guarantors Allowed', required: false },
                { id: 'guarantorRequirements', label: 'Guarantor Requirements', required: false },
                { id: 'studentsAllowed', label: 'Students Allowed', required: false },
                { id: 'employmentVerification', label: 'Employment Verification', required: false },
                { id: 'landlordReferences', label: 'Landlord References Required', required: false },
                { id: 'backgroundCheck', label: 'Background Check', required: false },
                { id: 'applicationFee', label: 'Application Fee', required: false }
            ],
            // LISTING INFORMATION - PET & SMOKING POLICY
            petSmoking: [
                { id: 'petsAllowed', label: 'Pets Allowed', required: false },
                { id: 'petPolicy', label: 'Pet Policy', required: false },
                { id: 'petDeposit', label: 'Pet Deposit', required: false },
                { id: 'petRent', label: 'Pet Rent (Monthly)', required: false },
                { id: 'dogsAllowed', label: 'Dogs Allowed', required: false },
                { id: 'catsAllowed', label: 'Cats Allowed', required: false },
                { id: 'weightLimit', label: 'Pet Weight Limit', required: false },
                { id: 'breedRestrictions', label: 'Breed Restrictions', required: false },
                { id: 'smokingAllowed', label: 'Smoking Allowed', required: false }
            ],
            // UNIT INFORMATION - ESSENTIALS
            unitEssentials: [
                { id: 'bedrooms', label: 'Bedrooms', required: true },
                { id: 'fullBathrooms', label: 'Full Bathrooms', required: true },
                { id: 'halfBathrooms', label: 'Half Bathrooms', required: false },
                { id: 'totalBathrooms', label: 'Total Bathrooms', computed: true },
                { id: 'totalRooms', label: 'Total Rooms', required: false },
                { id: 'approxInteriorSqft', label: 'Approx Interior SqFt', required: false },
                { id: 'approxExteriorSqft', label: 'Approx Exterior SqFt', required: false },
                { id: 'sqftSource', label: 'SqFt Source', required: false },
                { id: 'floor', label: 'Floor', required: false },
                { id: 'totalFloors', label: 'Total Floors', required: false },
                { id: 'unitNumber', label: 'Unit Number', required: false },
                { id: 'unitType', label: 'Unit Type', required: false },
                { id: 'condition', label: 'Condition', required: false },
                { id: 'exposures', label: 'Exposures', required: false },
                { id: 'viewType', label: 'View Type', required: false },
                { id: 'viewDescription', label: 'View Description', required: false }
            ],
            // UNIT INFORMATION - FEATURES
            unitFeatures: [
                { id: 'airConditioning', label: 'Air Conditioning', required: false },
                { id: 'heating', label: 'Heating', required: false },
                { id: 'fireplace', label: 'Fireplace', required: false },
                { id: 'fireplaceType', label: 'Fireplace Type', required: false },
                { id: 'numFireplaces', label: 'Number of Fireplaces', required: false },
                { id: 'washerDryerInUnit', label: 'Washer/Dryer in Unit', required: false },
                { id: 'dishwasher', label: 'Dishwasher', required: false },
                { id: 'privateOutdoorSpace', label: 'Private Outdoor Space', required: false },
                { id: 'outdoorSpaceType', label: 'Outdoor Space Type', required: false },
                { id: 'outdoorSpaceSqft', label: 'Outdoor Space SqFt', required: false },
                { id: 'homeOffice', label: 'Home Office', required: false },
                { id: 'ceilingHeight', label: 'Ceiling Height', required: false },
                { id: 'hardwoodFloors', label: 'Hardwood Floors', required: false },
                { id: 'privateStorage', label: 'Private Storage', required: false },
                { id: 'storageSqft', label: 'Storage SqFt', required: false }
            ],
            // UNIT INFORMATION - UTILITIES & INCLUDED
            utilities: [
                { id: 'utilitiesIncluded', label: 'Utilities Included', required: false },
                { id: 'heatIncluded', label: 'Heat Included', required: false },
                { id: 'hotWaterIncluded', label: 'Hot Water Included', required: false },
                { id: 'electricIncluded', label: 'Electric Included', required: false },
                { id: 'gasIncluded', label: 'Gas Included', required: false },
                { id: 'cableIncluded', label: 'Cable Included', required: false },
                { id: 'internetIncluded', label: 'Internet Included', required: false },
                { id: 'waterIncluded', label: 'Water Included', required: false }
            ],
            // UNIT INFORMATION - DESCRIPTION
            description: [
                { id: 'publicDescription', label: 'Public Description', required: false },
                { id: 'privateRemarks', label: 'Private Remarks (Agent Only)', required: false },
                { id: 'marketingHeadline', label: 'Marketing Headline', required: false },
                { id: 'highlights', label: 'Highlights', required: false },
                { id: 'keyFeatures', label: 'Key Features', required: false }
            ],
            // DATES & HISTORY
            datesHistory: [
                { id: 'listedDate', label: 'Listed Date', required: false },
                { id: 'updatedDate', label: 'Updated Date', required: false },
                { id: 'rentedDate', label: 'Rented Date', required: false },
                { id: 'leaseSignedDate', label: 'Lease Signed Date', required: false },
                { id: 'moveInDate', label: 'Move-In Date', required: false },
                { id: 'leaseEndDate', label: 'Lease End Date', required: false },
                { id: 'dom', label: 'Days on Market', computed: true },
                { id: 'originalRent', label: 'Original Rent', required: false },
                { id: 'priceChangeDate', label: 'Price Change Date', required: false }
            ],
            // IDS & REFERENCES
            idsReferences: [
                { id: 'rlsId', label: 'RLS ID (Listing ID)', required: false },
                { id: 'webId', label: 'Web ID', required: false },
                { id: 'internalListingNumber', label: 'Internal Listing #', required: false }
            ]
        };

        var buildingFieldDictionary = {
            // BUILDING ESSENTIALS
            essentials: [
                { id: 'buildingName', label: 'Building Name', required: false },
                { id: 'streetAddress', label: 'Street Address', required: true },
                { id: 'city', label: 'City', required: true },
                { id: 'state', label: 'State', required: true },
                { id: 'zipCode', label: 'Zip Code', required: true },
                { id: 'neighborhood', label: 'Neighborhood', required: false },
                { id: 'borough', label: 'Borough', required: false },
                { id: 'latitude', label: 'Latitude', required: false },
                { id: 'longitude', label: 'Longitude', required: false }
            ],
            // BUILDING CLASSIFICATION
            classification: [
                { id: 'ownershipType', label: 'Ownership Type', required: false, values: ['Condominium', 'StockCooperative', 'Condop', 'RentalBuilding', 'Townhouse', 'MultiFamily'] },
                { id: 'buildingClass', label: 'Building Class', required: false },
                { id: 'propertyType', label: 'Property Type', required: false },
                { id: 'preWarPostWar', label: 'Pre-War / Post-War', required: false },
                { id: 'yearBuilt', label: 'Year Built', required: false },
                { id: 'yearConverted', label: 'Year Converted', required: false },
                { id: 'architect', label: 'Architect', required: false },
                { id: 'developer', label: 'Developer', required: false },
                { id: 'managementCompany', label: 'Management Company', required: false },
                { id: 'managementPhone', label: 'Management Phone', required: false }
            ],
            // BUILDING SIZE & STRUCTURE
            sizeStructure: [
                { id: 'totalUnits', label: 'Total Units', required: false },
                { id: 'residentialUnits', label: 'Residential Units', required: false },
                { id: 'commercialUnits', label: 'Commercial Units', required: false },
                { id: 'totalFloors', label: 'Total Floors', required: false },
                { id: 'buildingSqft', label: 'Building SqFt', required: false },
                { id: 'lotSqft', label: 'Lot SqFt', required: false },
                { id: 'lotDimensions', label: 'Lot Dimensions', required: false },
                { id: 'buildingDimensions', label: 'Building Dimensions', required: false },
                { id: 'far', label: 'FAR (Floor Area Ratio)', required: false },
                { id: 'zoning', label: 'Zoning', required: false }
            ],
            // BUILDING AMENITIES
            amenities: [
                { id: 'doorman', label: 'Doorman', required: false },
                { id: 'doormanType', label: 'Doorman Type', required: false, values: ['Full-Time', 'Part-Time', 'Virtual', 'None'] },
                { id: 'concierge', label: 'Concierge', required: false },
                { id: 'elevator', label: 'Elevator', required: false },
                { id: 'numElevators', label: 'Number of Elevators', required: false },
                { id: 'laundryInBuilding', label: 'Laundry in Building', required: false },
                { id: 'fitnessCenter', label: 'Fitness Center', required: false },
                { id: 'swimmingPool', label: 'Swimming Pool', required: false },
                { id: 'roofDeck', label: 'Roof Deck', required: false },
                { id: 'courtyard', label: 'Courtyard', required: false },
                { id: 'garden', label: 'Garden', required: false },
                { id: 'playroom', label: 'Playroom', required: false },
                { id: 'kidsPlayroom', label: 'Kids Playroom', required: false },
                { id: 'lounge', label: 'Lounge', required: false },
                { id: 'residentLounge', label: 'Resident Lounge', required: false },
                { id: 'businessCenter', label: 'Business Center', required: false },
                { id: 'conferenceRoom', label: 'Conference Room', required: false },
                { id: 'coWorkingSpace', label: 'Co-Working Space', required: false },
                { id: 'mediaRoom', label: 'Media Room', required: false },
                { id: 'library', label: 'Library', required: false },
                { id: 'spa', label: 'Spa', required: false },
                { id: 'sauna', label: 'Sauna', required: false },
                { id: 'steamRoom', label: 'Steam Room', required: false },
                { id: 'hotTub', label: 'Hot Tub', required: false },
                { id: 'yogaStudio', label: 'Yoga Studio', required: false },
                { id: 'golfSimulator', label: 'Golf Simulator', required: false },
                { id: 'tennisCourt', label: 'Tennis Court', required: false },
                { id: 'basketballCourt', label: 'Basketball Court', required: false },
                { id: 'squashCourt', label: 'Squash Court', required: false },
                { id: 'petSpa', label: 'Pet Spa', required: false },
                { id: 'dogRun', label: 'Dog Run', required: false }
            ],
            // BUILDING SERVICES
            services: [
                { id: 'porterService', label: 'Porter Service', required: false },
                { id: 'superintendent', label: 'Superintendent', required: false },
                { id: 'superLive', label: 'Live-In Super', required: false },
                { id: 'packageRoom', label: 'Package Room', required: false },
                { id: 'coldStorage', label: 'Cold Storage', required: false },
                { id: 'valetParking', label: 'Valet Parking', required: false },
                { id: 'housekeeping', label: 'Housekeeping Available', required: false },
                { id: 'dryCleaningPickup', label: 'Dry Cleaning Pickup', required: false },
                { id: 'childcareServices', label: 'Childcare Services', required: false }
            ],
            // PARKING & STORAGE
            parkingStorage: [
                { id: 'parkingAvailable', label: 'Parking Available', required: false },
                { id: 'parkingType', label: 'Parking Type', required: false, values: ['Garage', 'Outdoor', 'Valet', 'Street'] },
                { id: 'parkingSpaces', label: 'Total Parking Spaces', required: false },
                { id: 'parkingMonthlyCost', label: 'Parking Monthly Cost', required: false },
                { id: 'garageType', label: 'Garage Type', required: false },
                { id: 'electricVehicleCharging', label: 'EV Charging', required: false },
                { id: 'bikeRoom', label: 'Bike Room', required: false },
                { id: 'bikeStorage', label: 'Bike Storage', required: false },
                { id: 'storageAvailable', label: 'Storage Available', required: false },
                { id: 'storageMonthlyCost', label: 'Storage Monthly Cost', required: false }
            ],
            // BUILDING POLICIES
            policies: [
                { id: 'petsAllowed', label: 'Pets Allowed', required: false },
                { id: 'petPolicy', label: 'Pet Policy', required: false },
                { id: 'smokingPolicy', label: 'Smoking Policy', required: false },
                { id: 'sublettingPolicy', label: 'Subletting Policy', required: false },
                { id: 'sublettingAllowed', label: 'Subletting Allowed', required: false },
                { id: 'piedATerreAllowed', label: 'Pied-a-Terre Allowed', required: false },
                { id: 'parentsAllowed', label: 'Parents Buying Allowed', required: false },
                { id: 'guarantorsAllowed', label: 'Guarantors Allowed', required: false },
                { id: 'financingPolicy', label: 'Financing Policy', required: false },
                { id: 'maxFinancing', label: 'Max Financing (%)', required: false }
            ],
            // BUILDING FINANCIALS (For Co-ops/Condos)
            financials: [
                { id: 'underlyingMortgage', label: 'Underlying Mortgage', required: false },
                { id: 'mortgageMaturityDate', label: 'Mortgage Maturity Date', required: false },
                { id: 'reserveFund', label: 'Reserve Fund', required: false },
                { id: 'assessments', label: 'Assessments', required: false },
                { id: 'commonCharges', label: 'Common Charges', required: false },
                { id: 'taxAbatement', label: 'Tax Abatement', required: false },
                { id: 'taxAbatementEndDate', label: 'Tax Abatement End Date', required: false },
                { id: 'j51', label: 'J-51', required: false },
                { id: 'j51ExpirationDate', label: 'J-51 Expiration', required: false },
                { id: '421a', label: '421-a', required: false },
                { id: '421aExpirationDate', label: '421-a Expiration', required: false }
            ],
            // BUILDING IDS & REFERENCES
            idsReferences: [
                { id: 'buildingId', label: 'Building ID', required: false },
                { id: 'bbl', label: 'BBL (Borough Block Lot)', required: false },
                { id: 'bin', label: 'BIN (Building ID Number)', required: false },
                { id: 'taxBlock', label: 'Tax Block', required: false },
                { id: 'taxLot', label: 'Tax Lot', required: false },
                { id: 'acrisId', label: 'ACRIS ID', required: false }
            ],
            // BUILDING DESCRIPTION
            description: [
                { id: 'buildingDescription', label: 'Building Description', required: false },
                { id: 'buildingHighlights', label: 'Building Highlights', required: false },
                { id: 'nearbyTransit', label: 'Nearby Transit', required: false },
                { id: 'nearbySchools', label: 'Nearby Schools', required: false },
                { id: 'nearbyParks', label: 'Nearby Parks', required: false },
                { id: 'walkScore', label: 'Walk Score', required: false },
                { id: 'transitScore', label: 'Transit Score', required: false },
                { id: 'bikeScore', label: 'Bike Score', required: false }
            ]
        };

        // Helper function to get all fields from a dictionary as a flat array
        function getAllFieldsFromDictionary(dictionary) {
            var allFields = [];
            Object.values(dictionary).forEach(section => {
                section.forEach(field => {
                    allFields.push(field);
                });
            });
            return allFields;
        }

        // Get fields for report based on listing type
        function getReportFieldsForType(listingType) {
            if (listingType === 'sale') {
                return getAllFieldsFromDictionary(salesFieldDictionary);
            } else if (listingType === 'rental') {
                return getAllFieldsFromDictionary(rentalFieldDictionary);
            } else if (listingType === 'building') {
                return getAllFieldsFromDictionary(buildingFieldDictionary);
            }
            return getAllFieldsFromDictionary(salesFieldDictionary); // Default to sales
        }

        // Initialize search results on page load
        document.addEventListener('DOMContentLoaded', function() {
            initializeSearchResults();
        });

