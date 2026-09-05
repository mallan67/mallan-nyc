        // Stub: customerDB removed with client section
        var customerDB = {};
        var currentWorkspaceClientId = null;

        // Listings array — populated from API (IDX/Trestle or Prisma DB)
        var _isLocalhost = (function() {
            var h = window.location.hostname;
            return h === 'localhost' || h === '127.0.0.1' || h === '';
        })();
        var listings = [];

        // ── REBNY Distribution Gate defaults ──
        // Add default permissions to all listings that don't have explicit permissions set
        listings.forEach(function(l) {
            if (!l.permissions) {
                l.permissions = { ownerOptOut: false, participantOnly: false, idxDisplay: l.idxDisplayYN !== false, internetDisplay: l.internetDisplayYN !== false, syndication: true };
            }
        });

        // Add borough to all listings that don't have it
        listings.forEach(function(l) { if (!l.borough) l.borough = 'Manhattan'; });

        // ── NeighborhoodCanonical: resolve SubdivisionName → canonical polygon name on ingest ──
        // This runs at ingest time so every listing has a stable canonical name for map-based search.
        // Uses the alias map (loaded async) — re-resolves when aliases arrive.
        var _canonicalAliasMap = null;
        (function loadCanonicalMap() {
            var base = window.location.pathname.replace(/\/[^/]*$/, '');
            var url = (base.endsWith('/crm') ? '/geo/' : '../geo/') + 'neighborhood-aliases.json';
            fetch(url)
                .then(function(r) { return r.ok ? r.json() : null; })
                .then(function(data) {
                    if (data && data.aliases) {
                        _canonicalAliasMap = data.aliases;
                        // Resolve all existing listings
                        listings.forEach(function(l) { resolveNeighborhoodCanonical(l); });
                    }
                })
                .catch(function() { /* non-fatal — listings keep raw neighborhood */ });
        })();

        /**
         * resolveNeighborhoodCanonical(listing)
         * Sets listing.neighborhoodCanonical (string) and listing.neighborhoodCanonicals (array)
         * from listing.neighborhood using alias map.
         *
         * Alias values can be: string (single), array (multi-polygon), null (no polygon).
         * For multi-polygon (e.g. "Chelsea / Flatiron" → ["Chelsea", "Flatiron"]),
         * neighborhoodCanonical = first polygon, neighborhoodCanonicals = all polygons.
         */
        function resolveNeighborhoodCanonical(listing) {
            if (!listing.neighborhood) return;
            if (listing.neighborhoodCanonical) return; // already set
            if (!_canonicalAliasMap) {
                listing.neighborhoodCanonical = listing.neighborhood;
                return;
            }
            var val = _canonicalAliasMap[listing.neighborhood];
            if (Array.isArray(val)) {
                // Multi-polygon: first is primary, all stored in array
                listing.neighborhoodCanonical = val[0] || listing.neighborhood;
                listing.neighborhoodCanonicals = val;
            } else if (val) {
                listing.neighborhoodCanonical = val;
            } else {
                // null or not in map — passthrough (may be a polygon name itself)
                listing.neighborhoodCanonical = listing.neighborhood;
            }
        }

        // Apply to all current listings (before async aliases load — sets identity)
        listings.forEach(function(l) { resolveNeighborhoodCanonical(l); });

        // State Management
        var searchResultsState = {
            viewMode: localStorage.getItem('searchResultsViewMode') || 'gallery',
            selectedListings: JSON.parse(localStorage.getItem('selectedListings')) || [],
            workingSet: JSON.parse(localStorage.getItem('workingSet')) || [],
            clients: [],
            savedSearches: JSON.parse(localStorage.getItem('savedSearches_' + LOGGED_IN_AGENT.id)) || [],
            filteredListings: null,
            currentPage: 1,
            perPage: 50,
            sortField: 'price',
            sortOrder: 'asc',
            visibleColumns: JSON.parse(localStorage.getItem('visibleColumns')) || ['address', 'unit', 'price', 'totalMonthly', 'rooms', 'beds', 'baths', 'reTaxes', 'maintCC', 'intSqft', 'status', 'ownership'],
            reportSettings: { format: 'grid', version: null, output: null, options: [] }
        };

        // ── reportState: Single source of truth for the Reports modal ──
        var reportState = {
            selectedListingIds: [],
            format: 'grid',
            version: 'customer',
            options: {
                listingTypeCompany: false, listingContact: false, dom: false,
                updatedSoldDate: false, priceSqft: false, originalPrice: false,
                nextOpenHouse: false, mediaViewerLink: false, listingWebLink: false,
                googleMapLink: false, acrisLink: false, listingImages: false,
                listingFloorplans: false, buildingImages: false, buildingSummaryCoverPage: false,
                customAgentComments: false, importPersonalComments: false,
                commentsAboutCustomer: false, appointmentTime: false,
                fullListingAddress: true, streetNameOnly: false, crossStreets: false,
                priceRoom: false, map: false, includeAverages: false, numberListings: false,
                photoGallery: false, virtualTour: false, videoTour: false,
                factSheetPhotoCount: 4, factSheetPhotoLayout: 'vertical'
            },
            output: 'print',
            sort: { key: 'price', dir: 'asc' },
            title: 'Property Report',
            preparedFor: '',
            customDescription: '',
            originalDescription: '',
            favorites: []
        };

        // Available fields for Grid Layout selection — organized by category
        var availableFields = [
            { id: 'address', label: 'Address', locked: true, priority: 2 },
            { id: 'unit', label: 'Unit', locked: true, priority: 3 },
            { id: 'price', label: 'Price', locked: true, priority: 4 },
            { id: 'totalMonthly', label: 'Total Monthly', locked: true, priority: 5 },
            { id: 'rooms', label: 'Rooms', locked: true, priority: 6 },
            { id: 'beds', label: 'Bedrooms', locked: true, priority: 7 },
            { id: 'baths', label: 'Total Bathrooms', locked: true, priority: 8 },
            { id: 'reTaxes', label: 'RE Taxes', locked: true, priority: 9 },
            { id: 'maintCC', label: 'Maint/CC', locked: true, priority: 10 },
            { id: 'intSqft', label: 'Approx Interior SqFt', locked: true, priority: 11 },
            { id: 'status', label: 'Status', locked: true, priority: 12 },
            { id: 'ownership', label: 'Ownership', locked: true, priority: 13 },
            { id: 'openHouse', label: 'Open House Date/Time', locked: true, priority: 14 },
            { id: 'dom', label: 'Days on Market', locked: true, priority: 15 },
            // Optional fields (all categories)
            { id: 'activityHistory', label: 'Activity History', locked: false, category: 'activity' },
            { id: 'pricePerRoom', label: '$ per Room', locked: false, category: 'financial' },
            { id: 'pricePerShare', label: '$ per Share', locked: false, category: 'financial' },
            { id: 'pricePerSqft', label: '$ per Sq Ft', locked: false, category: 'financial' },
            { id: 'originalPrice', label: 'Original Price', locked: false, category: 'financial' },
            { id: 'lastAskPrice', label: 'Last Ask Price', locked: false, category: 'financial' },
            { id: 'priceChange', label: 'Price Change', locked: false, category: 'financial' },
            { id: 'financingAllowed', label: 'Financing Allowed (%)', locked: false, category: 'financial' },
            { id: 'dealFinanced', label: 'Deal Financed', locked: false, category: 'financial' },
            { id: 'shares', label: 'Shares', locked: false, category: 'financial' },
            { id: 'apartmentType', label: 'Apartment Type', locked: false, category: 'property' },
            { id: 'buildingName', label: 'Building Name', locked: false, category: 'property' },
            { id: 'coopName', label: 'Co-Op Name', locked: false, category: 'property' },
            { id: 'condition', label: 'Condition', locked: false, category: 'property' },
            { id: 'fullBathrooms', label: 'Full Bathrooms', locked: false, category: 'property' },
            { id: 'halfBathrooms', label: 'Half Bathrooms', locked: false, category: 'property' },
            { id: 'exteriorSqft', label: 'Approx Exterior Sqft', locked: false, category: 'property' },
            { id: 'privateOutdoorSpace', label: 'Private Outdoor Space', locked: false, category: 'property' },
            { id: 'attendedLobby', label: 'Attended Lobby', locked: false, category: 'property' },
            { id: 'petsAllowed', label: 'Pets Allowed', locked: false, category: 'property' },
            { id: 'preWarPostWar', label: 'Pre War/Post War', locked: false, category: 'property' },
            { id: 'washerDryerBuilding', label: 'W/D in Building', locked: false, category: 'property' },
            { id: 'washerDryerUnit', label: 'W/D in Unit', locked: false, category: 'property' },
            { id: 'sponsorUnit', label: 'Sponsor Unit', locked: false, category: 'property' },
            { id: 'resaleNewDev', label: 'Resale/New Dev', locked: false, category: 'property' },
            { id: 'floor', label: 'Floor', locked: false, category: 'property' },
            { id: 'exposures', label: 'Exposures (Facing)', locked: false, category: 'property' },
            { id: 'company', label: 'Company', locked: false, category: 'agent' },
            { id: 'primaryAgentName', label: 'Agent Name', locked: false, category: 'agent' },
            { id: 'primaryAgentEmail', label: 'Agent Email', locked: false, category: 'agent' },
            { id: 'primaryAgentPhone', label: 'Agent Phone', locked: false, category: 'agent' },
            { id: 'listingType', label: 'Listing Type', locked: false, category: 'agent' },
            { id: 'neighborhood', label: 'Neighborhood', locked: false, category: 'location' },
            { id: 'crossStreet', label: 'Cross Street', locked: false, category: 'location' },
            { id: 'zipCode', label: 'Zip Code', locked: false, category: 'location' },
            { id: 'walkScore', label: 'Walk Score', locked: false, category: 'location' },
            { id: 'latitude', label: 'Latitude', locked: false, category: 'location' },
            { id: 'longitude', label: 'Longitude', locked: false, category: 'location' },
            { id: 'listedDate', label: 'Listed Date', locked: false, category: 'history' },
            { id: 'contractSignedDate', label: 'Contract Signed Date', locked: false, category: 'history' },
            { id: 'previousSoldDate', label: 'Previous Sold Date', locked: false, category: 'history' },
            { id: 'previousSoldPrice', label: 'Previous Sold Price', locked: false, category: 'history' },
            { id: 'updatedSold', label: 'Updated/Sold', locked: false, category: 'history' },
            { id: 'cdom', label: 'Cumulative DOM', locked: false, category: 'history' },
            { id: 'yearBuilt', label: 'Year Built', locked: false, category: 'history' },
            { id: 'picked', label: 'Picked', locked: false, category: 'activity' },
            { id: 'liked', label: 'Liked', locked: false, category: 'activity' },
            { id: 'disliked', label: 'Disliked', locked: false, category: 'activity' },
            { id: 'shown', label: 'Shown', locked: false, category: 'activity' },
            { id: 'emailed', label: 'Emailed', locked: false, category: 'activity' },
            { id: 'rlsId', label: 'RLS ID', locked: false, category: 'ids' },
            { id: 'webId', label: 'Web ID', locked: false, category: 'ids' },
            { id: 'internalListingNum', label: 'Internal Listing #', locked: false, category: 'ids' },
            { id: 'acrisId', label: 'ACRIS ID', locked: false, category: 'ids' },
            { id: 'acrisDocuments', label: 'ACRIS Documents', locked: false, category: 'ids' },
            { id: 'propertyType', label: 'Property Type (RLS/RESO/IDX)', locked: false, category: 'ids' },
            { id: 'propertySubType', label: 'Property Sub-Type (RLS/RESO/IDX)', locked: false, category: 'ids' },
            { id: 'verifiedEstimated', label: 'Verified/Estimated', locked: false, category: 'ids' },
            { id: 'verifiedBuyer', label: 'Verified Buyer', locked: false, category: 'ids' },
            { id: 'verifiedSeller', label: 'Verified Seller', locked: false, category: 'ids' },
            { id: 'description', label: 'Description (Public Remarks)', locked: false, category: 'ids' }
        ];

        // Category definitions for Grid Layouts modal
        var fieldCategories = {
            financial: { label: 'Financial', icon: 'fa-dollar-sign', color: 'text-green-600' },
            property:  { label: 'Property Details', icon: 'fa-building', color: 'text-blue-600' },
            agent:     { label: 'Agent & Company', icon: 'fa-user-tie', color: 'text-purple-600' },
            location:  { label: 'Location', icon: 'fa-map-marker-alt', color: 'text-red-500' },
            history:   { label: 'Dates & History', icon: 'fa-calendar-alt', color: 'text-orange-500' },
            activity:  { label: 'Client Activity', icon: 'fa-chart-line', color: 'text-indigo-500' },
            ids:       { label: 'IDs & Data', icon: 'fa-database', color: 'text-gray-500' }
        };

        // ═══════════════════════════════════════════════════════════════════════════════
        // API FETCH — Replace listings with server data when available
        // No fallback in production — fail fast with "No listings" message
        // ═══════════════════════════════════════════════════════════════════════════════

        /**
         * Transform API listing (Prisma/RESO format) into the flat object shape
         * that 905+ search functions expect.
         */
        function transformAPIListing(apiListing, index) {
            var addr = (typeof apiListing.address === 'object' && apiListing.address) ? apiListing.address : {};
            var feat = (typeof apiListing.features === 'object' && apiListing.features) ? apiListing.features : {};
            var agent = (typeof apiListing.agent_info === 'object' && apiListing.agent_info) ? apiListing.agent_info : {};
            var media = Array.isArray(apiListing.media) ? apiListing.media : [];
            var price = parseFloat(apiListing.list_price) || 0;
            var isRental = apiListing.listing_type === 'rent';

            return {
                id: parseInt(apiListing.id) || (index + 1),
                address: (addr.StreetNumber ? addr.StreetNumber + ' ' : '') + (addr.StreetName || '') + (addr.StreetSuffix ? ' ' + addr.StreetSuffix : ''),
                unit: addr.UnitNumber || '',
                price: price,
                totalMonthly: isRental ? price : (parseFloat(feat.RealEstateTax || 0) / 12 + parseFloat(feat.AssociationFee || 0)),
                rooms: parseInt(feat.Rooms || 0) || 0,
                beds: parseInt(apiListing.bedrooms_total) || 0,
                baths: (parseInt(apiListing.bathrooms_full) || 0) + ((parseInt(apiListing.bathrooms_half) || 0) * 0.5),
                fullBaths: parseInt(apiListing.bathrooms_full) || 0,
                halfBaths: parseInt(apiListing.bathrooms_half) || 0,
                reTaxes: parseFloat(feat.RealEstateTax || 0) / 12,
                maintCC: parseFloat(feat.AssociationFee || 0),
                intSqft: parseFloat(apiListing.living_area) || null,
                status: (apiListing.status || 'ACTIVE').toUpperCase(),
                ownership: feat.CommonInterest || apiListing.property_type || '',
                propertyType: apiListing.property_type || 'Residential',
                propertySubType: apiListing.property_sub_type || '',
                neighborhood: apiListing.neighborhood || '',
                borough: apiListing.borough || 'Manhattan',
                zip: apiListing.postal_code || addr.PostalCode || '',
                yearBuilt: parseInt(feat.YearBuilt) || null,
                era: parseInt(feat.YearBuilt) >= 2015 ? 'New Construction' : parseInt(feat.YearBuilt) >= 1960 ? 'Post-War' : 'Pre-War',
                listingType: 'Exclusive',
                lid: apiListing.listing_id || '',
                dom: 0,
                cdom: 0,
                listedDate: apiListing.created_at ? new Date(apiListing.created_at).toLocaleDateString('en-US') : '',
                updatedDate: apiListing.modification_timestamp ? new Date(apiListing.modification_timestamp).toLocaleDateString('en-US') : '',
                // Phase B: typed promoted columns win, agent_info JSON fallback.
                company: apiListing.list_office_name || agent.ListOfficeName || '',
                agentName: apiListing.list_agent_full_name || agent.ListAgentFullName || '',
                agentEmail: apiListing.list_agent_email || agent.ListAgentEmail || '',
                agentPhone: apiListing.list_agent_direct_phone || agent.ListAgentDirectPhone || '',
                photoCount: media.length,
                description: feat.PublicRemarks || '',
                idxDisplayYN: apiListing.idx_display_yn !== false,
                internetDisplayYN: apiListing.internet_entire_listing_display_yn !== false,
                addressDisplayYN: apiListing.internet_address_display_yn !== false,
                listingCategory: isRental ? 'rental' : undefined,
                permissions: {
                    ownerOptOut: apiListing.owner_opt_out === true,
                    participantOnly: apiListing.participant_only === true,
                    idxDisplay: apiListing.idx_display_yn !== false,
                    internetDisplay: apiListing.internet_entire_listing_display_yn !== false,
                    syndication: true,
                },
                _apiId: apiListing.id,
                _listingId: apiListing.listing_id,
            };
        }

        // ── Load clients from API for email/reports ──────────────────────────────
        function _loadClients() {
            if (typeof MallanAPI === 'undefined') return;
            MallanAPI.onReady(function() {
                MallanAPI._fetch('/api/crm/leads?limit=200').then(function(data) {
                    var leads = data.leads || data || [];
                    if (!Array.isArray(leads)) return;
                    leads.forEach(function(cl) {
                        if (typeof ClientNormalizer !== 'undefined') ClientNormalizer.normalize(cl);
                        var id = cl.id || cl._id;
                        if (!id) return;
                        customerDB[id] = cl;
                        searchResultsState.clients.push({
                            id: id,
                            name: cl.name || cl._displayName || ((cl.first_name || '') + ' ' + (cl.last_name || '')).trim() || 'Unknown',
                            email: cl.email || '',
                            type: cl.type || cl.client_type || 'buyer',
                            agentId: cl.assigned_agent_id || cl.agentId
                        });
                    });
                    // Populate report recipient dropdown if it exists
                    if (typeof populateReportRecipientDropdown === 'function') populateReportRecipientDropdown();
                    if (typeof populateClientList === 'function') populateClientList();
                    console.log('[DataLoader] Loaded ' + searchResultsState.clients.length + ' clients');
                }).catch(function(err) {
                    console.warn('[DataLoader] Client load failed:', err && err.message);
                });
            });
        }

        // ── Data loading ─────────────────────────────────────────────────────────
        // Priority: 1) IDX/Trestle search  2) Prisma DB  3) show error
        if (typeof MallanAPI !== 'undefined') {
            _loadClients(); // Load clients for email/report recipient selectors
            MallanAPI.onReady(function() {
                // The Search contract (executable parameters + vocabularies) is the browser's ONLY
                // source; without it Search refuses to run (fail loud, no hard-coded fallback).
                if (typeof window.loadSearchContract === 'function') {
                    window.loadSearchContract().catch(function(cErr) {
                        console.error('[Search] contract load failed:', cErr && cErr.message);
                        if (typeof showToast === 'function') showToast('Search is unavailable: the Search contract did not load. Reload the page.', 'error');
                    });
                }
                _loadFromIDX().catch(function(idxErr) {
                    // IDX unavailable (503, no credentials, etc.) — fall back to Prisma DB
                    console.warn('[DataLoader] IDX unavailable, falling back to local DB:', idxErr && idxErr.message);
                    _showDataLoadBanner('IDX unavailable — trying local database...', 'warn');
                    return _loadFromPrisma();
                }).catch(function(err) {
                    // All API sources failed
                    var reason = err && err.message ? err.message : 'Unknown error';
                    console.error('[DataLoader] All data sources failed:', reason);
                    _showNoListingsMessage('Unable to load listings. Check your connection.');
                    _showDataLoadBanner('Data load failed: ' + reason, 'error');
                });
            });
        } else if (!_isLocalhost) {
            // MallanAPI not loaded — likely auth/script issue
            _showDataLoadBanner('MallanAPI not loaded — please log in or check your session.', 'error');
        }

        /**
         * Load listings from IDX/Trestle (primary source).
         * IDX response is already in CRM flat shape — push directly.
         */
        function _loadFromIDX() {
            // Respect saved search tab — load sales or rentals on refresh
            var _savedTab;
            try { _savedTab = sessionStorage.getItem('searchTab'); } catch(e) {}
            var _searchType = _savedTab === 'rent' ? 'rental' : 'sale';
            // Sync the search tab global so refine panel / filters know the active type
            if (typeof currentSearchTab !== 'undefined') {
                currentSearchTab = _savedTab === 'rent' ? 'rent' : 'sale';
            }
            return MallanAPI.idx.search({ limit: 200, type: _searchType }).then(function(result) {
                if (result.listings && result.listings.length > 0) {
                    _replaceListings(result.listings, 'IDX/Trestle');
                    // Show REBNY attribution
                    if (result.attribution) _showAttribution(result.attribution);
                    // Set initial activeSearchCriteria so refine panel works
                    return result;
                }
                return Promise.reject(new Error('IDX returned 0 listings'));
            });
        }

        /**
         * Load listings from Prisma DB (fallback — local exclusives).
         */
        function _loadFromPrisma() {
            return MallanAPI.listings.list({ limit: 200 }).then(function(result) {
                if (result.listings && result.listings.length > 0) {
                    var apiListings = result.listings.map(transformAPIListing);
                    _replaceListings(apiListings, 'local DB');
                    return result;
                }
                _showNoListingsMessage('No listings available.');
                return Promise.reject(new Error('Local DB returned 0 listings'));
            });
        }

        /**
         * Replace listings in-place and refresh view if visible.
         */
        // Flag to prevent _replaceListings from overwriting active server search results
        var _serverSearchActive = false;

        function _replaceListings(newData, source) {
            listings.length = 0;
            newData.forEach(function(l) { listings.push(l); });
            // Ensure all fields used by renderers have safe defaults
            // Presentation defaults ONLY where a renderer needs a string. No numeric provider fact,
            // status or borough is ever invented (Search Consolidation Packet 1).
            listings.forEach(function(l) {
                if (l.photoCount == null) l.photoCount = (l.images && l.images.length) || 0;
                if (!l.address) l.address = 'Address Unavailable';
                if (!l.unit) l.unit = '';
                if (!l.neighborhood) l.neighborhood = '';
                if (!l.zip) l.zip = '';
                if (!l.listedDate) l.listedDate = '--';
                if (!l.company) l.company = '';
                if (!l.permissions) {
                    l.permissions = { ownerOptOut: false, participantOnly: false, idxDisplay: l.idxDisplayYN !== false, internetDisplay: l.internetDisplayYN !== false, syndication: true };
                }
            });
            listings.forEach(function(l) { resolveNeighborhoodCanonical(l); });
            console.log('[DataLoader] Loaded ' + listings.length + ' listings from ' + source);
            // Dispatch event so other modules (e.g. hash routing) know data is ready
            window.dispatchEvent(new CustomEvent('mallan:data:ready', { detail: { count: listings.length, source: source } }));
            // The loaded rows are an INDEX for detail/photo/address lookups only. They never
            // become Search membership and are never re-filtered (Search Consolidation Packet 1).
        }

        /**
         * Show REBNY attribution text at the bottom of results.
         */
        function _showAttribution(text) {
            var existing = document.getElementById('rebnyAttribution');
            if (existing) { existing.textContent = text; return; }
            var resultsEl = document.getElementById('searchResults') || document.getElementById('listingGrid');
            if (!resultsEl || !resultsEl.parentNode) return;
            var attrDiv = document.createElement('div');
            attrDiv.id = 'rebnyAttribution';
            attrDiv.style.cssText = 'text-align:center;padding:12px 20px;color:#9ca3af;font-size:11px;border-top:1px solid #e5e7eb;margin-top:16px;';
            attrDiv.textContent = text;
            resultsEl.parentNode.insertBefore(attrDiv, resultsEl.nextSibling);
        }

        /**
         * Show a dismissible banner at the top of the search area explaining data load status.
         * @param {string} msg - Message to display
         * @param {'warn'|'error'} level - 'warn' = amber, 'error' = red
         */
        function _showDataLoadBanner(msg, level) {
            var existing = document.getElementById('dataLoadBanner');
            if (existing) existing.remove();
            var colors = level === 'error'
                ? 'background:#fef2f2;border:1px solid #fecaca;color:#991b1b;'
                : 'background:#fffbeb;border:1px solid #fde68a;color:#92400e;';
            var banner = document.createElement('div');
            banner.id = 'dataLoadBanner';
            banner.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;padding:10px 20px;border-radius:8px;font-size:13px;max-width:600px;display:flex;align-items:center;gap:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);' + colors;
            banner.innerHTML = '<i class="fas ' + (level === 'error' ? 'fa-exclamation-triangle' : 'fa-info-circle') + '"></i>' +
                '<span style="flex:1;">' + escapeHtml(msg) + '</span>' +
                '<button onclick="this.parentNode.remove()" style="background:none;border:none;cursor:pointer;font-size:16px;opacity:0.6;padding:0 4px;">&times;</button>';
            document.body.appendChild(banner);
            // Auto-dismiss warnings after 8 seconds
            if (level === 'warn') setTimeout(function() { if (banner.parentNode) banner.remove(); }, 8000);
        }

        function _showNoListingsMessage(msg) {
            var resultsEl = document.getElementById('searchResults') || document.getElementById('listingGrid');
            if (resultsEl) {
                resultsEl.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#6b7280;">' +
                    '<i class="fas fa-exclamation-circle" style="font-size:32px;margin-bottom:12px;display:block;color:#d1d5db;"></i>' +
                    '<p style="font-size:15px;font-weight:600;">' + escapeHtml(msg) + '</p></div>';
            }
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // COMPREHENSIVE FIELD DICTIONARIES FOR REPORTS - ALL REBNY RLS FIELDS
        // These dictionaries contain ALL fields present in the listing forms
