        // ===========================================================================
        // COTALITY FIELD MAP - CRM field name -> live Cotality Property field
        //
        // Used to tag rendered elements with data-cotality-field so compliance
        // gates can find them by provider field identity.
        //
        // AUTHORITY. The live authenticated Cotality API. Every target below is
        // checked by lib/idx/__tests__/crm-cotality-field-map.test.ts against
        // data/cotality-contract/crm-field-contract.json, which is GENERATED from
        // $metadata. A field name that is not on the live Property resource fails
        // the build. Nothing here is maintained by hand against a dated CSV.
        //
        // WHAT THIS REPLACED, AND WHY IT MATTERED
        //
        // The previous map was verified against a CSV snapshot and encoded an
        // architecture in which provider fields had been "renamed". They had not.
        // Verified live 2026-08-23, three of its targets DO NOT EXIST on Cotality
        // at all and two named the wrong field:
        //
        //   status -> MlsStatus            WRONG FIELD. StandardStatus and
        //     MlsStatus are two separate Property enums, 11 values and 25 values.
        //     They are not aliases and the same label carries DIFFERENT integer
        //     codes in each: Canceled is 2 in StandardStatus and 4 in MlsStatus,
        //     Closed 3 vs 6, Pending 9 vs 16, Withdrawn 10 vs 24. Substituting one
        //     for the other corrupts the value even when the string matches.
        //     Cotality also suppresses MlsStatus for filtering and ordering.
        //
        //   updatedDate -> SourceSystemModificationTimestamp   DOES NOT EXIST.
        //     The live field is ModificationTimestamp.
        //
        //   idxDisplayYN -> IDXEntireListingDisplayYN          DOES NOT EXIST.
        //     REMOVED from this map. Cotality exposes no IDX-specific display
        //     gate; it exposes InternetEntireListingDisplayYN, already mapped
        //     below as internetDisplayYN. Mallan's IDX opt-out remains a
        //     MALLAN/REBNY COMPLIANCE CONCEPT and is still enforced in
        //     compliance-gates-and-output.js - it is simply not a provider field
        //     and must not claim to be one.
        //
        //   comingSoonTimestamp -> ComingSoonTimestamp         DOES NOT EXIST.
        //     REMOVED. It had no consumer. ActivationDate, mapped below, is real.
        //
        //   wid -> SourceSystemKey         MAPPING KEPT, CLAIM CORRECTED. The old
        //     comment said ListingKey was "renamed to" SourceSystemKey. Both exist
        //     independently and differ: ListingKey is String(20) NOT NULL, the
        //     stable provider key; SourceSystemKey is String(255) NULLABLE, the
        //     upstream system's own id. wid means the latter, so the mapping was
        //     right and only the rename claim was false. Because it is nullable,
        //     wid must never be relied on for identity - lid (ListingId) and the
        //     backend's mlsId (ListingKey) carry that.
        //
        // A NOTE ON NAMING. RLS appears below only where it names a genuine REBNY
        // compliance obligation. It is not a data source, not a feed, and not a
        // field vocabulary. Cotality is the only provider.
        // ===========================================================================
        var COTALITY_FIELD_MAP = {
            // ── Address & Location ──
            address:        'UnparsedAddress',           // Address → UnParsedAddress (Matrix). Trestle OData: UnparsedAddress
            unit:           'UnitNumber',                // Conditional required by PropertySubType
            zip:            'PostalCode',
            neighborhood:   'SubdivisionName',           // (REBNY attr). Trestle also has MLSAreaMinor (system-generated)
            latitude:       'Latitude',                  // (not searchable)
            longitude:      'Longitude',                 // (not searchable)
            crossStreet:    'CrossStreet',
            // ── Pricing ──
            price:          'ListPrice',
            totalMonthly:   'AssociationFee+TaxAnnualAmount',  // computed (not a real field)
            maintCC:        'AssociationFee',            // (monthly maint/CC)
            reTaxes:        'TaxAnnualAmount',           // (annual, for townhouses/lots)
            originalPrice:  'OriginalListPrice',         // (read-only)
            previousPrice:  'PreviousListPrice',         // (auto-updated)
            priceChangeTs:  'PriceChangeTimestamp',      // (system)
            closePrice:     'ClosePrice',                // Required when MLSStatus=Closed
            closeDate:      'CloseDate',                 // Must >= PurchaseContractDate
            closedDate:     'CloseDate',                 // alias — cached data uses closedDate, RESO uses CloseDate

            // ── Unit Details ──
            rooms:          'RoomsTotal',
            beds:           'BedroomsTotal',
            baths:          'BathroomsTotalInteger',     // (read-only, sum)
            fullBaths:      'BathroomsFull',             // (verified live on the Property resource)
            halfBaths:      'BathroomsHalf',
            intSqft:        'LivingArea',                // Cond required for Condo
            extSqft:        'BuildingAreaTotal',         // For TH/multi-family
            floor:          'EntryLevel',                // (building level, not unit floor)
            stories:        'StoriesTotal',              // (entire building)
            exposures:      'Exposures',
            view:           'View',                      // Conditional: ViewYN=true

            // ── Classification ──
            status:         'StandardStatus',           // 11-value Property enum. NOT MlsStatus - separate 25-value enum, different integer codes, provider-suppressed for filtering
            ownership:      'CommonInterest',
            propertyType:   'PropertyType',              // (Residential | ResidentialLease)
            propertySubType:'PropertySubType',
            buildingName:   'BuildingName',
            listingType:    'ListingAgreement',
            era:            'YearBuilt',                 // derived from YearBuilt
            yearBuilt:      'YearBuilt',                 // (not in property CSV — in Building resource)
            condition:      'PropertyCondition',         // verified live on the Property resource

            // ── IDs ──
            lid:            'ListingId',                 // Trestle: ListingId (Matrix-generated RLS number). Read-only
            wid:            'SourceSystemKey',           // String(255) NULLABLE - the upstream system's own id. NOT interchangeable with ListingKey and never an identity source

            // ── Dates & DOM ──
            dom:            'DaysOnMarket',              // (system). Reset after 30 days W/C (UCBA 2026)
            cdom:           'CumulativeDaysOnMarket',    // (system)
            listedDate:     'OnMarketDate',              // Required when StandardStatus is Active
            updatedDate:    'ModificationTimestamp',     // the live field; SourceSystemModificationTimestamp does not exist

            // ── Agent & Office ──
            company:        'ListOfficeName',
            agentName:      'ListAgentFullName',         // (read-only)
            agentEmail:     'ListAgentEmail',            // (read-only)
            agentPhone:     'ListAgentDirectPhone',      // (read-only)

            // ── Media & Description ──
            photoCount:     'PhotosCount',               // (read-only)
            description:    'PublicRemarks',              // Subject to UCBA content rules
            privateRemarks: 'PrivateRemarks',            // AGENT-ONLY — never display on IDX/VOW
            virtualTourUrl: 'VirtualTourURLBranded',
            // ── Unit Features ──
            flooring:       'Flooring',
            cooling:        'Cooling',                   // Conditional: CoolingYN=true
            heating:        'Heating',                   // Conditional: HeatingYN=true
            laundry:        'LaundryFeatures',           // (unit-level)
            parking:        'ParkingFeatures',
            parkingTotal:   'ParkingTotal',
            pets:           'PetsAllowed',               // (unit-level policy)
            petsYN:         'PetsAllowedYN',             // verified live on the Property resource
            fireplace:      'FireplaceYN',
            fireplaces:     'FireplacesTotal',
            amenities:      'AssociationAmenities',      // verified live on the Property resource
            interiorFeatures:'InteriorFeatures',
            security:       'SecurityFeatures',
            walkScore:      'WalkScore',                 // verified live on the Property resource

            // ── Display Control Flags ──
            internetDisplayYN:      'InternetEntireListingDisplayYN',  // (master gate — cascades to addr/AVM/comment)
            addressDisplayYN:       'InternetAddressDisplayYN',
            syndicateTo:            'SyndicateTo',                    // Trestle: SyndicateTo (multi-enum)

            // ── Coming Soon (REBNY-specific) ──
            comingSoonDate:       'ActivationDate',                   // (date Coming Soon becomes Active). Required when StandardStatus is ComingSoon

            // ── REMOVED from RLS (NAR Settlement Aug 2025) — kept for reference only ──
            // buyerComp:      'BuyerBrokerageCompensation',          // REMOVED from feed Aug 2025
            // buyerCompType:  'BuyerBrokerageCompensationType',      // REMOVED from feed Aug 2025
        };

        // ── MEDIA ENTITY FIELD MAP (Trestle Media resource) ──
        // Photos, videos, documents, floor plans are stored as separate Media records
        // linked to the listing via ResourceRecordKey → ListingKey.
        //
        // Trestle Media fields (from media-fields.csv):
        //   MediaKey (PK), MediaURL, MediaType (Jpeg/Png/etc),
        //   MediaCategory (Photo/Video/FloorPlan/Document),
        //   MediaClassification (Photo/Document/Video),
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

        // Helper: generate data-cotality-field attribute string for a field
        function cotalityAttr(fieldName) {
            var reso = COTALITY_FIELD_MAP[fieldName];
            return reso ? ' data-cotality-field="' + reso + '"' : '';
        }

        // Helper: generate data-cotality-field + data-cotality-value attribute string
        function cotalityData(fieldName, value) {
            var reso = COTALITY_FIELD_MAP[fieldName];
            if (!reso) return '';
            var safeVal = value != null ? String(value).replace(/"/g, '&quot;') : '';
            return ' data-cotality-field="' + reso + '" data-cotality-value="' + safeVal + '"';
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
        // ── Report media: the count reported is the count that exists ──
        //
        // STEP 1. `reports.js` used to build its photo grid from
        // `l.photoCount || 6` and then index the real images with `pi % len`.
        // A listing with two photos rendered six tiles — the same two cycled
        // three times, numbered 1..6 — and a listing with none rendered six
        // numbered placeholders. The badge above the grid said "6 photos".
        //
        // Explicit 0 is a fact and stays 0. Unknown is a different fact and
        // stays unknown. The grid renders the media that exists, once each.
        //
        // Lives here, in the shared field/media helper loaded at index.html:105,
        // so the two report generators cannot drift apart on the rule again.

        // REBNY RLS (Feb 2025): off-market listings display the primary photo only.
        var REPORT_OFF_MARKET_STATUSES = { CLOSED: 1, WITHDRAWN: 1, HOLD: 1, CANCELED: 1, EXPIRED: 1 };

        function reportVisiblePhotos(listing) {
            var photos = (listing && listing.images) || [];
            var status = String((listing && listing.status) || '').toUpperCase();
            if (REPORT_OFF_MARKET_STATUSES[status] === 1 && photos.length > 1) return [photos[0]];
            return photos;
        }

        /** The number to print, or null when nobody has stated one. Never a constant. */
        function reportedPhotoCount(listing) {
            if (!listing) return null;
            if (listing.photoCount != null) return listing.photoCount;
            var photos = reportVisiblePhotos(listing);
            return photos.length > 0 ? photos.length : null;
        }

        /** The tiles to render: the real media, once each, capped at the nine the layout holds. */
        function reportPhotoTiles(listing) {
            return reportVisiblePhotos(listing).slice(0, 9);
        }

        function getListingPhotoThumb(listing) {
            var url = getListingPhoto(listing);
            return url ? url.replace('w=800', 'w=400') : '';
        }

        function getStatusBadgeClasses(status) {
            switch(status) {
                case 'Active': return 'bg-green-100 text-green-700';
                case 'Pending': return 'bg-orange-100 text-orange-700';
                case 'Closed': return 'bg-gray-200 text-gray-600';
                case 'ComingSoon': case 'ComingSoon': return 'bg-purple-100 text-purple-700';
                case 'Withdrawn': case 'Withdrawn': return 'bg-red-100 text-red-600';
                default: return 'bg-gray-100 text-gray-600';
            }
        }

