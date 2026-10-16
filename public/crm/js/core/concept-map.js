        // ═══════════════════════════════════════════════════════════════
        // CONCEPT MAP — maps the search app's field keys to live Cotality fields
        // Used for the data-concept attributes on rendered HTML elements.
        //
        // Authority: the live Cotality Property resource (Property fields plus the
        // CustomFields keys reached through Property). Every value below is checked
        // against the live contract by `npm run compliance:validate`.
        // Display and masking rules are NOT defined here — they live in
        // compliance/rules/compliance-concepts.json (UCBA 2026, cited per rule).
        //
        // Location (live): borough = CityRegion, neighborhood = SubdivisionName,
        // city = City, county = CountyOrParish. Cotality carries no usable
        // latitude/longitude for the RLS feed (Latitude is empty).
        // ═══════════════════════════════════════════════════════════════
        var CONCEPT_FIELD_MAP = {
            // ── Address & Location ──
            address:        'UnparsedAddress',
            unit:           'UnitNumber',
            zip:            'PostalCode',
            borough:        'CityRegion',                // live: Manhattan | Brooklyn | Queens | Bronx | StatenIsland
            city:           'City',                      // live: New York City
            county:         'CountyOrParish',            // live: New York | Kings | Queens | Bronx | Richmond
            neighborhood:   'SubdivisionName',           // live: e.g. West Village, Upper West Side
            crossStreet:    'CrossStreet',

            // ── Pricing ──
            price:          'ListPrice',
            totalMonthly:    null,                        // computed in the app from AssociationFee and TaxAnnualAmount; not a Cotality field
            maintCC:        'AssociationFee',
            reTaxes:        'TaxAnnualAmount',
            originalPrice:  'OriginalListPrice',
            previousPrice:  'PreviousListPrice',
            priceChangeTs:  'PriceChangeTimestamp',
            closePrice:     'ClosePrice',
            closeDate:      'CloseDate',
            closedDate:     'CloseDate',

            // ── Unit Details ──
            rooms:          'RoomsTotal',
            beds:           'BedroomsTotal',
            baths:          'BathroomsTotalInteger',
            fullBaths:      'BathroomsFull',
            halfBaths:      'BathroomsHalf',
            intSqft:        'LivingArea',
            extSqft:        'BuildingAreaTotal',
            floor:          'EntryLevel',
            stories:        'StoriesTotal',
            exposures:      'Exposures',
            view:           'View',

            // ── Classification ──
            status:         'MlsStatus',
            ownership:      'CommonInterest',
            propertyType:   'PropertyType',
            propertySubType:'PropertySubType',
            buildingName:   'BuildingName',
            listingType:    'ListingAgreement',
            era:            'YearBuilt',
            yearBuilt:      'YearBuilt',
            condition:      'PropertyCondition',

            // ── IDs ──
            lid:            'ListingId',
            wid:            'SourceSystemKey',

            // ── Dates & DOM ──
            dom:            'DaysOnMarket',
            cdom:           'CumulativeDaysOnMarket',
            listedDate:     'OnMarketDate',
            updatedDate:     'ModificationTimestamp',     // live Property field

            // ── Agent & Office ──
            company:        'ListOfficeName',
            agentName:      'ListAgentFullName',
            agentEmail:     'ListAgentEmail',
            agentPhone:     'ListAgentDirectPhone',

            // ── Media & Description ──
            photoCount:     'PhotosCount',
            description:    'PublicRemarks',
            privateRemarks: 'PrivateRemarks',
            virtualTourUrl: 'VirtualTourURLBranded',

            // ── Unit Features ──
            flooring:       'Flooring',
            cooling:        'Cooling',
            heating:        'Heating',
            laundry:        'LaundryFeatures',
            parking:        'ParkingFeatures',
            parkingTotal:   'ParkingTotal',
            pets:           'PetsAllowed',
            petsYN:         'PetsAllowedYN',
            fireplace:      'FireplaceYN',
            fireplaces:     'FireplacesTotal',
            amenities:      'AssociationAmenities',
            interiorFeatures:'InteriorFeatures',
            security:       'SecurityFeatures',
            walkScore:      'WalkScore',

            // ── Display Control Flags ──
            internetDisplayYN:      'InternetEntireListingDisplayYN',
            addressDisplayYN:       'InternetAddressDisplayYN',
            syndicateTo:            'SyndicateTo',

            // ── Coming Soon (REBNY-specific) ──
            comingSoonDate:       'ActivationDate',
            comingSoonTimestamp:   'ComingSoonTimestamp',            // live CustomFields key (reached through Property)

        };

        // ── MEDIA ──
        // Photos, videos, documents and floor plans are separate live Cotality Media
        // records linked to the listing by ResourceRecordKey. Photo order (Media.Order)
        // is a mandatory display item in UCBA 2026 Exhibit A. The rule that photos may
        // not carry agent information, logos or text overlays is UCBA 2026 Art. I, Sec. 5(C).

        // Helper: generate data-concept attribute string for a field
        function conceptAttr(fieldName) {
            var reso = CONCEPT_FIELD_MAP[fieldName];
            return reso ? ' data-concept="' + reso + '"' : '';
        }

        // Helper: generate data-concept + data-concept-value attribute string
        function conceptData(fieldName, value) {
            var reso = CONCEPT_FIELD_MAP[fieldName];
            if (!reso) return '';
            var safeVal = value != null ? String(value).replace(/"/g, '&quot;') : '';
            return ' data-concept="' + reso + '" data-concept-value="' + safeVal + '"';
        }

        // Raw Cotality field key: CommonInterest. REBNY uses these current values for
        // the broker-facing Ownership Type display. The raw field name is not a Mallan category.
        function ownershipLabel(val) {
            var map = { Condominium: 'Condo', StockCooperative: 'Co-op', Condop: 'Condop', RentalBuilding: 'Rental Building', None: 'None' };
            return map[val] || val;
        }

        // Helper: get primary photo URL for a listing (Cinematic Minimalism)
        function getListingPhoto(listing) {
            if (listing.images && listing.images.length > 0) {
                var primary = listing.images.find(function(img) { return img.isPrimary; });
                var url = (primary || listing.images[0]).url;
                if (url) return url;
            }
            // SVG placeholder — matches frontend aesthetic
            return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect fill='%23f1f5f9' width='400' height='300'/%3E%3Cg transform='translate(160,110)'%3E%3Cpath d='M40 0L80 80H0z' fill='%23cbd5e1'/%3E%3Crect x='5' y='30' width='30' height='50' rx='2' fill='%23cbd5e1'/%3E%3Ccircle cx='60' cy='20' r='10' fill='%23e2e8f0'/%3E%3C/g%3E%3Ctext x='200' y='220' text-anchor='middle' fill='%2394a3b8' font-family='Inter,system-ui,sans-serif' font-size='13' font-weight='300'%3ENo Photo Available%3C/text%3E%3C/svg%3E";
        }
        function getListingPhotoThumb(listing) {
            var url = getListingPhoto(listing);
            return url ? url.replace('w=800', 'w=400') : '';
        }

        function getStatusBadgeClasses(status) {
            switch(status) {
                case 'ACTIVE': return 'bg-green-100 text-green-700';
                case 'PENDING': return 'bg-orange-100 text-orange-700';
                case 'CLOSED': return 'bg-gray-200 text-gray-600';
                case 'COMING_SOON': case 'ComingSoon': return 'bg-purple-100 text-purple-700';
                case 'WITHDRAWN': case 'Withdrawn': return 'bg-red-100 text-red-600';
                default: return 'bg-gray-100 text-gray-600';
            }
        }

