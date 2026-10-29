        // ═══════════════════════════════════════════════════════════════════════════
        // RESO FIELD MAPPING — CRM listing keys → live Cotality Property field names
        // Used only for data-reso-field attributes on rendered HTML elements (labels for
        // compliance self-checks). Search criteria are mapped server-side in
        // lib/search/crm-idx-filter.ts against data/cotality-enums.live.json.
        //
        // Every entry is a Property field live Cotality carries (npm run cotality:pull,
        // 2026-10-23). Suppressed by Cotality and therefore absent here: MlsStatus,
        // SourceSystemKey, DaysOnMarket, CumulativeDaysOnMarket, Latitude, Longitude,
        // InternetAddressDisplayYN, PropertyCondition. Empty on every record: PetsAllowedYN,
        // AssociationAmenities, WalkScore, SyndicateTo. Status is StandardStatus; the
        // Cotality record key is ListingKey; DOM is derived by Mallan from OnMarketDate.
        // ═══════════════════════════════════════════════════════════════════════════
        var RESO_FIELD_MAP = {
            // ── Address & Location ──
            address:        'UnparsedAddress',
            unit:           'UnitNumber',
            zip:            'PostalCode',
            neighborhood:   'SubdivisionName',           // the provider's neighborhood values
            borough:        'CityRegion',
            crossStreet:    'CrossStreet',

            // ── Pricing — ListPrice is the asking price on sales and the monthly rent on rentals ──
            price:          'ListPrice',
            totalMonthly:   'AssociationFee+TaxAnnualAmount',  // computed by Mallan (not a field)
            maintCC:        'AssociationFee',
            reTaxes:        'TaxAnnualAmount',
            originalPrice:  'OriginalListPrice',
            previousPrice:  'PreviousListPrice',
            priceChangeTs:  'PriceChangeTimestamp',
            closePrice:     'ClosePrice',                // sale price (sale) / leased rent (rental)
            closeDate:      'CloseDate',
            closedDate:     'CloseDate',
            contractDate:   'PurchaseContractDate',      // contract signed (sale) / lease signed (rental)
            availabilityDate: 'AvailabilityDate',        // rentals

            // ── Unit Details ──
            rooms:          'RoomsTotal',
            beds:           'BedroomsTotal',
            baths:          'BathroomsTotalInteger',
            fullBaths:      'BathroomsFull',
            halfBaths:      'BathroomsHalf',
            intSqft:        'LivingArea',
            extSqft:        'BuildingAreaTotal',
            floor:          'EntryLevel',                // the floor the unit is on
            stories:        'StoriesTotal',
            exposures:      'Exposures',
            view:           'View',

            // ── Classification ──
            status:         'StandardStatus',
            ownership:      'CommonInterest',
            propertyType:   'PropertyType',              // Residential (sale) | ResidentialLease (rental)
            propertySubType:'PropertySubType',
            buildingName:   'BuildingName',
            listingType:    'ListingAgreement',
            era:            'YearBuilt',                 // derived from YearBuilt
            yearBuilt:      'YearBuilt',

            // ── IDs ──
            lid:            'ListingId',                 // RLS listing number
            wid:            'ListingKey',                // Cotality record key (joins Media by ResourceRecordKey)
            listingKey:     'ListingKey',

            // ── Dates & DOM ──
            dom:            'OnMarketDate',              // DOM derived by Mallan from OnMarketDate
            listedDate:     'ListingContractDate',
            updatedDate:    'ModificationTimestamp',

            // ── Agent & Office ──
            company:        'ListOfficeName',
            agentName:      'ListAgentFullName',
            agentEmail:     'ListAgentEmail',
            agentPhone:     'ListAgentDirectPhone',

            // ── Media & Description ──
            photoCount:     'PhotosCount',
            videosCount:    'VideosCount',
            description:    'PublicRemarks',             // subject to UCBA content rules
            virtualTourUrl: 'VirtualTourURLUnbranded',   // 3D tour; video and 3D links come from the VirtualTourURL* fields

            // ── Unit Features ──
            flooring:       'Flooring',
            cooling:        'Cooling',
            heating:        'Heating',
            laundry:        'LaundryFeatures',
            parking:        'ParkingFeatures',
            parkingTotal:   'ParkingTotal',
            pets:           'PetsAllowed',
            fireplace:      'FireplaceYN',
            fireplaces:     'FireplacesTotal',
            security:       'SecurityFeatures',

            // ── Display Control Flag ──
            internetDisplayYN: 'InternetEntireListingDisplayYN',

            // ── Coming Soon ──
            comingSoonDate: 'ActivationDate',            // date a Coming Soon listing becomes Active
        };

        // ── MEDIA (Cotality Media resource) ──
        // Live 2026-10-23: Media rows carry only MediaCategory Photo and FloorPlan, joined to
        // the listing by ResourceRecordKey = ListingKey; many rows have no MediaURL. Video and
        // 3D tours are NOT Media rows — they are the Property VirtualTourURL* links and
        // VideosCount, classified by lib/search/crm-idx-mapper.ts (listing.tours).
        //
        // Media fields used:
        //   MediaKey (PK), MediaURL, MediaType (Jpeg/Png/Pdf/Gif),
        //   MediaCategory (Photo / FloorPlan),
        //   ImageOf (91 RESO enum values — LivingRoom, Kitchen, Bedroom, etc),
        //   ImageHeight, ImageWidth, ImageSizeDescription,
        //   Order (sort order — MANDATORY per REBNY Exhibit A "Photos - Sort Order"),
        //   PreferredPhotoYN (primary/hero photo flag),
        //   ShortDescription, LongDescription,
        //   MediaStatus (Active/Deleted/Other),
        //   InternetEntireListingDisplayYN (display gate, inherits from listing).
        //
        // Photo upload requirements (industry MLS standard):
        //   Format: JPEG required | Resolution: min 1024x768, recommended 2048x1365
        //   File size: 100KB–3MB | Aspect ratio: 4:3 or 3:2 landscape
        //   Recommended count: 10-15 minimum, 22-27 optimal
        //   First photo: exterior/primary view (PreferredPhotoYN=true)
        //   No watermarks, agent info, logos, or text overlays (UCBA Art. I, Sec. 5(C))

        // Helper: generate data-reso-field attribute string for a field
        function resoAttr(fieldName) {
            var reso = RESO_FIELD_MAP[fieldName];
            return reso ? ' data-reso-field="' + reso + '"' : '';
        }

        // Helper: generate data-reso-field + data-reso-value attribute string
        function resoData(fieldName, value) {
            var reso = RESO_FIELD_MAP[fieldName];
            if (!reso) return '';
            var safeVal = value != null ? String(value).replace(/"/g, '&quot;') : '';
            return ' data-reso-field="' + reso + '" data-reso-value="' + safeVal + '"';
        }

        // Helper: map REBNY CommonInterest enum values to user-friendly display labels
        function ownershipLabel(val) {
            var map = { Condominium: 'Condo', StockCooperative: 'Co-op', Condop: 'Condop', RentalBuilding: 'Rental Bldg', None: 'None' };
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

