        // ═══════════════════════════════════════════════════════════════════════════
        // RESO FIELD MAPPING — Maps mock field names to RESO Data Dictionary fields
        // Used for data-reso-field attributes on rendered HTML elements
        // Reference: Trestle/CoreLogic Property entity (REBNY RLS)
        //
        // VERIFIED 2026-02-19 against:
        //   data/rebny-rls-property-fields.csv (902 REBNY IDX Plus fields across 7 resources)
        //   data/trestle-dictionary/property-fields.csv (744 Trestle fields)
        //   data/trestle-excel/02_PROPERTY.csv
        //
        // KEY NOTES:
        //   - RLS "ListingKey" attr → Trestle "SourceSystemKey" (LMP's listing ID)
        //   - Trestle "ListingKey" = OData primary key (Trestle-generated)
        //   - Trestle "ListingId" = RLS listing number (Matrix-generated)
        //   - RLS "StandardStatus" attr → Trestle "MlsStatus" (detailed)
        //     Trestle also has "StandardStatus" (RESO normalized) — we use MlsStatus (RLS name)
        //   - RLS uses "SubdivisionName" for neighborhood, Trestle also has "MLSAreaMinor"
        //   - "WalkScore" exists in Trestle schema but NOT in RLS (Trestle-only)
        //   - Coming Soon: RLS uses "ActivationDate" (not FirstShowingDate)
        //     and the retired ComingSoon timestamp name (not ComingSoonOnMarketDate/ExpirationDate)
        //   - BuyerBrokerageCompensation: REMOVED from RLS feed Aug 2025 (NAR settlement)
        // ═══════════════════════════════════════════════════════════════════════════
        // DISPLAY-ANNOTATION VOCABULARY, NOT PROVIDER AUTHORITY (Packet 2 closure).
        // Maps CRM DTO keys to the live Cotality Property field they were mapped FROM, so cards can
        // carry a data-reso attribute for compliance checks. Every value is verified against the dated
        // live field pull (data/cotality-property-fields.live.json) by tests/runtime/provider-authority-census.test.ts;
        // "computed:" marks a value the mapper derives. Nothing here maps data in either direction.
        var RESO_FIELD_MAP = {
            // ── Address & Location ──
            address:        'UnparsedAddress',           // RLS: UnparsedAddress → UnParsedAddress (Matrix). Trestle OData: UnparsedAddress
            unit:           'UnitNumber',                // RLS: UnitNumber. Conditional required by PropertySubType
            zip:            'PostalCode',                // RLS: PostalCode
            neighborhood:   'SubdivisionName',           // RLS: SubdivisionName (REBNY attr). Trestle also has MLSAreaMinor (system-generated)
            latitude:       'Latitude',                  // RLS: Latitude (not searchable)
            longitude:      'Longitude',                 // RLS: Longitude (not searchable)
            crossStreet:    'CrossStreet',               // RLS: CrossStreet

            // ── Pricing ──
            price:          'ListPrice',                 // RLS: ListPrice
            totalMonthly:   'computed:AssociationFee+TaxAnnualAmount',  // COMPUTED by the mapper (monthly fee + tax/12), not a provider field
            maintCC:        'AssociationFee',            // RLS: AssociationFee (monthly maint/CC)
            reTaxes:        'TaxAnnualAmount',           // RLS: TaxAnnualAmount (annual, for townhouses/lots)
            originalPrice:  'OriginalListPrice',         // RLS: OriginalListPrice (read-only)
            previousPrice:  'PreviousListPrice',         // RLS: PreviousListPrice (auto-updated)
            priceChangeTs:  'PriceChangeTimestamp',      // RLS: PriceChangeTimestamp (system)
            closePrice:     'ClosePrice',                // RLS: ClosePrice. Required when MLSStatus=Closed
            closeDate:      'CloseDate',                 // RLS: CloseDate. Must >= PurchaseContractDate
            closedDate:     'CloseDate',                 // alias — cached data uses closedDate, RESO uses CloseDate

            // ── Unit Details ──
            rooms:          'RoomsTotal',                // RLS: RoomsTotal
            beds:           'BedroomsTotal',             // RLS: BedroomsTotal
            baths:          'BathroomsTotalInteger',     // RLS: BathroomsTotalInteger (read-only, sum)
            fullBaths:      'BathroomsFull',             // RLS: BathroomsFull (not in RLS CSV — Trestle-only)
            halfBaths:      'BathroomsHalf',             // RLS: BathroomsHalf
            intSqft:        'LivingArea',                // RLS: LivingArea. Cond required for Condo
            extSqft:        'BuildingAreaTotal',         // RLS: BuildingAreaTotal. For TH/multi-family
            floor:          'EntryLevel',                // RLS: EntryLevel (building level, not unit floor)
            stories:        'StoriesTotal',              // RLS: StoriesTotal (entire building)
            exposures:      'Exposures',                 // RLS: Exposures
            view:           'View',                      // RLS: View. Conditional: ViewYN=true

            // ── Classification ──
            status:         'MlsStatus',                 // RLS: MlsStatus (REBNY detailed status). RESO "StandardStatus" renamed to "MlsStatus" by RLS
            ownership:      'CommonInterest',            // RLS: CommonInterest
            propertyType:   'PropertyType',              // RLS: PropertyType (Residential | ResidentialLease)
            propertySubType:'PropertySubType',           // RLS: PropertySubType
            buildingName:   'BuildingName',              // RLS: BuildingName
            listingType:    'ListingAgreement',          // RLS: ListingAgreement
            era:            'YearBuilt',                 // derived from YearBuilt
            yearBuilt:      'YearBuilt',                 // RLS: YearBuilt (not in property CSV — in Building resource)
            condition:      'PropertyCondition',         // Trestle-only (not in RLS CSV)

            // ── IDs ──
            lid:            'ListingId',                 // Trestle: ListingId (Matrix-generated RLS number). Read-only
            wid:            'SourceSystemKey',            // RLS: SourceSystemKey (LMP's listing ID). RESO "ListingKey" renamed to "SourceSystemKey" by RLS

            // ── Dates & DOM ──
            dom:            'DaysOnMarket',              // RLS: DaysOnMarket (system). Reset after 30 days W/C (UCBA 2026)
            cdom:           'CumulativeDaysOnMarket',    // RLS: CumulativeDaysOnMarket (system)
            listedDate:     'OnMarketDate',              // RLS: OnMarketDate. Required if MLSStatus=Active
            updatedDate:    'ModificationTimestamp', // live Cotality field (SourceSystemModificationTimestamp is a REBNY submission-form name, not a live field)

            // ── Agent & Office ──
            company:        'ListOfficeName',            // RLS: ListOfficeName
            agentName:      'ListAgentFullName',         // RLS: ListAgentFullName (read-only)
            agentEmail:     'ListAgentEmail',            // RLS: ListAgentEmail (read-only)
            agentPhone:     'ListAgentDirectPhone',      // RLS: ListAgentDirectPhone (read-only)

            // ── Media & Description ──
            photoCount:     'PhotosCount',               // RLS: PhotosCount (read-only)
            description:    'PublicRemarks',              // RLS: PublicRemarks. Subject to UCBA content rules
            privateRemarks: 'PrivateRemarks',            // RLS: PrivateRemarks. AGENT-ONLY — never display on IDX/VOW
            virtualTourUrl: 'VirtualTourURLBranded',     // RLS: VirtualTourURLBranded

            // ── Unit Features ──
            flooring:       'Flooring',                  // RLS: Flooring
            cooling:        'Cooling',                   // RLS: Cooling. Conditional: CoolingYN=true
            heating:        'Heating',                   // RLS: Heating. Conditional: HeatingYN=true
            laundry:        'LaundryFeatures',           // RLS: LaundryFeatures (unit-level)
            parking:        'ParkingFeatures',           // RLS: ParkingFeatures
            parkingTotal:   'ParkingTotal',              // RLS: ParkingTotal
            pets:           'PetsAllowed',               // RLS: PetsAllowed (unit-level policy)
            petsYN:         'PetsAllowedYN',             // Trestle-only (not in RLS CSV)
            fireplace:      'FireplaceYN',               // RLS: FireplaceYN
            fireplaces:     'FireplacesTotal',           // RLS: FireplacesTotal
            amenities:      'AssociationAmenities',      // Trestle-only (not in RLS CSV — RLS uses AssociationFeeIncludes)
            interiorFeatures:'InteriorFeatures',         // RLS: InteriorFeatures
            security:       'SecurityFeatures',          // RLS: SecurityFeatures
            walkScore:      'WalkScore',                 // Trestle-only (not in RLS CSV)

            // ── Display Control Flags ──
            internetDisplayYN:      'InternetEntireListingDisplayYN',  // RLS: InternetEntireListingDisplayYN (master gate — cascades to addr/AVM/comment)
            addressDisplayYN:       'InternetAddressDisplayYN',       // RLS: InternetAddressDisplayYN
            syndicateTo:            'SyndicateTo',                    // Trestle: SyndicateTo (multi-enum)

            // ── Coming Soon (REBNY-specific) ──
            comingSoonDate:       'ActivationDate',                   // RLS: ActivationDate (date Coming Soon becomes Active). Required if MLSStatus=ComingSoon

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

