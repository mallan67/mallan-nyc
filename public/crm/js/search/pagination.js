        // Pagination functions — use getFilteredListings(true) to get total count without pagination
        function goToFirstPage() { searchResultsState.currentPage = 1; renderSearchResults(); }
        function goToPrevPage() { if (searchResultsState.currentPage > 1) { searchResultsState.currentPage--; renderSearchResults(); } }
        function goToNextPage() {
            var total = Math.ceil(getFilteredListings(true).length / searchResultsState.perPage);
            if (searchResultsState.currentPage < total) { searchResultsState.currentPage++; renderSearchResults(); }
        }
        function goToLastPage() { searchResultsState.currentPage = Math.ceil(getFilteredListings(true).length / searchResultsState.perPage); renderSearchResults(); }
        function changePerPage() { searchResultsState.perPage = parseInt(document.getElementById('perPageSelect').value); searchResultsState.currentPage = 1; renderSearchResults(); }

        // Column sort toggle
        function toggleColumnSort(field) {
            if (searchResultsState.sortField === field) {
                searchResultsState.sortOrder = searchResultsState.sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                searchResultsState.sortField = field;
                searchResultsState.sortOrder = 'asc';
            }
            renderSearchResults();
        }

        function toggleAveragesExpanded() {
            var row = document.getElementById('averagesRow');
            if (!row) return;
            var isHidden = row.style.display === 'none';
            row.style.display = isHidden ? '' : 'none';
            var btn = document.getElementById('toggleAveragesBtn');
            if (btn) btn.textContent = isHidden ? 'Hide Averages' : 'Show Averages';
        }

        function updateAveragesRow() {
            var filtered = (typeof getFilteredListings === 'function') ? getFilteredListings(true) : [];
            if (!filtered || filtered.length === 0) return;
            var prices = filtered.map(function(l) { return parseFloat(l.price) || 0; }).filter(function(p) { return p > 0; });
            var sqfts = filtered.map(function(l) { return parseFloat(l.sqft) || 0; }).filter(function(s) { return s > 0; });
            var ppsf = prices.length > 0 && sqfts.length > 0
                ? prices.reduce(function(a,b){return a+b;},0) / sqfts.reduce(function(a,b){return a+b;},0)
                : 0;
            var avgPrice = prices.length > 0 ? prices.reduce(function(a,b){return a+b;},0) / prices.length : 0;
            var avgSqft = sqfts.length > 0 ? sqfts.reduce(function(a,b){return a+b;},0) / sqfts.length : 0;

            var fmt = function(n) { return '$' + Math.round(n).toLocaleString(); };
            var el = function(id) { return document.getElementById(id); };
            if (el('avgPrice')) el('avgPrice').textContent = fmt(avgPrice);
            if (el('avgPpsf')) el('avgPpsf').textContent = fmt(ppsf);
            if (el('avgSqft')) el('avgSqft').textContent = Math.round(avgSqft).toLocaleString() + ' sqft';
            if (el('resultsTotalCount')) el('resultsTotalCount').textContent = filtered.length;
        }

        // Open listing detail in a standalone new browser tab
        function openListingInNewTab(listingId) {
            window.open(location.pathname + '#detail/' + listingId, '_blank');
        }

        var _detailCurrentId = null;
        var _detailPhotoIdx = 0;
        var _detailActiveTab = 'overview';

        function showListingDetail(listingId) {
            try {
            var listing = listings.find(l => l.id === listingId);
            if (!listing) return;
            // Null-safe defaults for detail view rendering
            if (listing.price == null) listing.price = 0;
            if (listing.totalMonthly == null) listing.totalMonthly = 0;
            if (listing.maintCC == null) listing.maintCC = 0;
            if (listing.reTaxes == null) listing.reTaxes = 0;
            if (listing.beds == null) listing.beds = 0;
            if (listing.baths == null) listing.baths = 0;
            if (listing.rooms == null) listing.rooms = 0;
            if (listing.dom == null) listing.dom = 0;
            if (!listing.status) listing.status = 'ACTIVE';
            if (!listing.address) listing.address = 'Address Unavailable';
            if (!listing.unit) listing.unit = '';
            if (!listing.neighborhood) listing.neighborhood = '';
            if (!listing.zip) listing.zip = '';
            if (!listing.listedDate) listing.listedDate = '--';
            if (!listing.company) listing.company = '';
            _detailCurrentId = listingId;
            _detailPhotoIdx = 0;
            _detailActiveTab = 'overview';
            // Update Prev/Next listing button state for the current
            // result-set position. Hides nav controls entirely when
            // there's <= 1 listing in the current result set; otherwise
            // shows them and disables (visually) the unreachable
            // direction (prev at idx 0, next at last idx). Spec: buttons
            // must be visible AND reliable when more than one result.
            _updateDetailNavButtons();

            // Fetch full media (floor plans, videos, virtual tours) on demand
            if (typeof fetchDetailMedia === 'function' && listing.lid) {
                fetchDetailMedia(listing.lid, function() {
                    // Re-render media sections after data arrives
                    _refreshDetailMediaSections(listing);
                });
            }
            var displayAddress = listing.addressDisplayYN === false ? 'Address Available Upon Request' : escapeHtml(listing.address);
            var displayUnit = listing.addressDisplayYN !== false && listing.unit ? ', ' + escapeHtml(listing.unit) : '';
            var statusLabel = listing.status === 'COMING_SOON' ? 'COMING SOON' : listing.status;
            var isSale = listing.listingCategory !== 'rental';
            var transitScore = computeTransitScore(listing);
            var bikeScore = computeBikeScore(listing);
            var photos = listing.images || [];

            // 4 thumbnail photos (secondary)
            var secondaryPhotos = photos.filter(function(p){ return !p.isPrimary; }).slice(0, 4);
            var thumbGrid = '';
            for (var ti = 0; ti < 4; ti++) {
                if (secondaryPhotos[ti]) {
                    thumbGrid += '<div class="cm-photo-wrap rounded-lg cursor-pointer" onclick="openPhotoLightbox(' + (ti+1) + ')"><img src="' + secondaryPhotos[ti].url + '" alt="' + escapeHtml(secondaryPhotos[ti].caption || '') + '" class="cm-photo rounded-lg" loading="lazy"></div>';
                } else {
                    thumbGrid += '<div class="bg-gray-100 rounded-lg flex items-center justify-center"><i class="fas fa-image text-gray-300"></i></div>';
                }
            }

            // Header right: status + price + financials
            document.getElementById('detailHeaderRight').innerHTML =
                '<span class="px-2 py-0.5 ' + getStatusBadgeClasses(listing.status) + ' rounded text-xs font-semibold">' + statusLabel + '</span>'
                + '<span class="text-lg font-bold ml-2">$' + listing.price.toLocaleString() + '</span>'
                + '<div class="flex items-center gap-4 ml-4 text-xs text-gray-500">'
                + '<div class="text-right"><div class="uppercase text-[10px] text-gray-400">' + (isSale ? 'Maintenance' : 'Rent') + '</div><div class="font-semibold text-gray-700">$' + listing.maintCC.toLocaleString() + '</div></div>'
                + '<div class="text-right"><div class="uppercase text-[10px] text-gray-400">Est. Monthly</div><div class="font-semibold text-gray-700">$' + listing.totalMonthly.toLocaleString() + ' <i class="fas fa-calculator text-gray-400"></i></div></div>'
                + '</div>';

            // ── Helper: only show a field row if it has real data ──
            function fld(label, value, cls) {
                if (!value || value === '---' || value === '--' || value === '—') return '';
                return '<div class="lux-field' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><span>' + value + '</span></div>';
            }
            function fldAlways(label, value) {
                return '<div class="lux-field"><span>' + label + '</span><span>' + (value || '---') + '</span></div>';
            }

            var content = document.getElementById('listingDetailContent');
            content.innerHTML = `
                <!-- Photo Gallery: hero + 2x2 thumbnails (uniform aspect ratio) -->
                <div class="grid gap-1.5 mb-4 detail-photo-grid" style="grid-template-columns:3fr 2fr; height:360px">
                    <div class="relative rounded-xl overflow-hidden cursor-pointer" onclick="openPhotoLightbox(${_detailPhotoIdx})" style="aspect-ratio:auto">
                        <img src="${getListingPhoto(listing)}" alt="${displayAddress}" class="w-full h-full object-cover" loading="lazy" id="detailMainPhotoImg">
                        ${listing.newListing ? '<div class="absolute top-3 left-3 px-3 py-1.5 bg-green-500 text-white text-xs font-bold rounded-lg shadow-lg">NEW ON MARKET</div>' : ''}
                        ${listing.priceChange === 'down' ? '<div class="absolute top-3 left-3 px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg shadow-lg"><i class="fas fa-arrow-down mr-1"></i>PRICE DROP</div>' : ''}
                        ${comingSoonBadge(listing)}
                        <button onclick="event.stopPropagation(); detailPhotoPrev()" class="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/60 transition"><i class="fas fa-chevron-left text-white text-sm"></i></button>
                        <button onclick="event.stopPropagation(); detailPhotoNext()" class="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/60 transition"><i class="fas fa-chevron-right text-white text-sm"></i></button>
                        <div class="absolute bottom-0 left-0 right-0 px-4 py-3 flex items-center justify-between" style="background:linear-gradient(transparent,rgba(0,0,0,0.55))">
                            <button onclick="event.stopPropagation(); detailSwitchTab('media')" class="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur rounded-lg text-xs font-semibold text-gray-700 hover:bg-white transition"><i class="fas fa-images"></i> All ${photos.length} photos</button>
                            <span class="text-white text-xs font-medium" id="detailPhotoCounter">1 / ${photos.length}</span>
                        </div>
                        <button onclick="event.stopPropagation(); openPhotoLightbox(0)" class="absolute top-3 right-3 w-8 h-8 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/60 transition" title="Expand photo"><i class="fas fa-expand text-white text-xs"></i></button>
                    </div>
                    <div class="grid grid-cols-2 grid-rows-2 gap-1.5 detail-thumbs">
                        ${thumbGrid}
                    </div>
                </div>

                <!-- Address & Tags -->
                <div class="flex items-center gap-2 mb-0.5">
                    <input type="checkbox" class="w-3.5 h-3.5 accent-amber-600" ${searchResultsState.selectedListings.includes(listing.id) ? 'checked' : ''} onclick="toggleListingSelection('${listing.id}')">
                    <h1 class="text-xl font-bold text-gray-900 tracking-tight">${displayAddress}${displayUnit}</h1>
                    <span class="px-1.5 py-0.5 border border-gray-200 rounded text-[9px] text-gray-400 font-mono">L-${listing.lid || listing.id}</span>
                </div>

                <div class="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
                    <span>${escapeHtml(listing.neighborhood)}</span>
                    <span class="text-gray-300">&bull;</span>
                    <span>${escapeHtml(listing.borough || 'Manhattan')}, NY ${escapeHtml(listing.zip)}</span>
                    ${listing.era ? '<span class="text-gray-300">&bull;</span><span>' + escapeHtml(listing.era) + '</span>' : ''}
                    <span class="text-gray-300">&bull;</span>
                    <span>${ownershipLabel(listing.ownership)}</span>
                    ${listing.buildingName ? '<span class="text-gray-300">&bull;</span><span>' + escapeHtml(listing.buildingName) + '</span>' : ''}
                    ${listing.crossStreet ? '<span class="text-gray-300">&bull;</span><span class="text-gray-400"><i class="fas fa-arrows-alt-h text-[10px] mr-0.5"></i>' + escapeHtml(listing.crossStreet) + '</span>' : ''}
                </div>

                <!-- Stats Bar -->
                <div class="lux-stat-bar mb-4">
                    <div class="lux-stat-item"><div class="lux-stat-value">${listing.rooms || '—'}</div><div class="lux-stat-label">Rooms</div></div>
                    <div class="lux-stat-item"><div class="lux-stat-value">${listing.beds === 0 ? 'Studio' : listing.beds}</div><div class="lux-stat-label">Beds</div></div>
                    <div class="lux-stat-item"><div class="lux-stat-value">${listing.baths}</div><div class="lux-stat-label">Baths</div></div>
                    <div class="lux-stat-item"><div class="lux-stat-value">${listing.intSqft ? listing.intSqft.toLocaleString() : '—'}</div><div class="lux-stat-label">SqFt</div></div>
                    <div class="lux-stat-item"><div class="lux-stat-value">${listing.intSqft ? '$' + Math.round(listing.price / listing.intSqft).toLocaleString() : '—'}</div><div class="lux-stat-label">$/SqFt</div></div>
                </div>

                <!-- Tab Navigation -->
                <div class="flex items-center border-b border-gray-200 mb-4 overflow-x-auto">
                    <button id="detailTabOverview" onclick="detailSwitchTab('overview')" class="detail-tab active">OVERVIEW</button>
                    <button id="detailTabDetails" onclick="detailSwitchTab('details')" class="detail-tab">DETAILS</button>
                    <button id="detailTabBuilding" onclick="detailSwitchTab('building')" class="detail-tab">BUILDING</button>
                    <button id="detailTabNeighborhood" onclick="detailSwitchTab('neighborhood')" class="detail-tab">NEIGHBORHOOD</button>
                    <button id="detailTabMedia" onclick="detailSwitchTab('media')" class="detail-tab">MEDIA</button>
                </div>

                <!-- 2-column layout -->
                <div class="flex gap-5 detail-2col">
                    <!-- LEFT column (tab content) -->
                    <div class="flex-1 min-w-0">

                        <!-- ═══ OVERVIEW TAB ═══ -->
                        <div id="detailPanelOverview">

                        <!-- Status & Dates bar -->
                        <div class="lux-card mb-4">
                            <div class="grid grid-cols-5 gap-3 text-xs">
                                <div><div class="text-gray-400 uppercase text-[9px] font-semibold mb-0.5">Status</div><span class="px-1.5 py-0.5 ${getStatusBadgeClasses(listing.status)} rounded text-[10px] font-semibold">${statusLabel}</span></div>
                                <div><div class="text-gray-400 uppercase text-[9px] font-semibold mb-0.5">DOM</div><div class="text-sm font-bold text-gray-900">${listing.dom}</div></div>
                                <div><div class="text-gray-400 uppercase text-[9px] font-semibold mb-0.5">CDOM</div><div class="text-sm font-bold text-gray-900">${listing.cdom || listing.dom}</div></div>
                                <div><div class="text-gray-400 uppercase text-[9px] font-semibold mb-0.5">Listed</div><div class="text-xs font-semibold text-gray-700">${listing.listedDate}</div></div>
                                <div><div class="text-gray-400 uppercase text-[9px] font-semibold mb-0.5">Updated</div><div class="text-xs font-semibold text-gray-700">${listing.updatedDate || '—'}</div></div>
                            </div>
                        </div>

                        <!-- Financial card -->
                        <div class="lux-card mb-4">
                            <h3 class="lux-section-title"><i class="fas fa-dollar-sign text-gray-400"></i> Financial</h3>
                            <div class="grid grid-cols-3 gap-x-6 gap-y-1 text-sm">
                                <div class="lux-field"><span>${isSale ? 'List Price' : 'Monthly Rent'}</span><span class="text-base font-bold">$${listing.price.toLocaleString()}</span></div>
                                ${listing.originalPrice && listing.originalPrice !== listing.price ? '<div class="lux-field"><span>Original Price</span><span class="text-red-600">$' + listing.originalPrice.toLocaleString() + '</span></div>' : ''}
                                <div class="lux-field"><span>${isSale ? 'Maint/CC' : 'Net Effective'}</span><span>$${listing.maintCC.toLocaleString()}/mo</span></div>
                                ${listing.reTaxes ? '<div class="lux-field"><span>RE Taxes</span><span>$' + listing.reTaxes.toLocaleString() + '/mo</span></div>' : ''}
                                <div class="lux-field"><span>Est. Total Monthly</span><span class="text-green-700 font-bold">$${listing.totalMonthly.toLocaleString()}/mo</span></div>
                                ${listing.intSqft ? '<div class="lux-field"><span>$/SqFt</span><span>$' + Math.round(listing.price / listing.intSqft).toLocaleString() + '</span></div>' : ''}
                                ${listing.rooms ? '<div class="lux-field"><span>$/Room</span><span>$' + Math.round(listing.price / listing.rooms).toLocaleString() + '</span></div>' : ''}
                                ${isSale ? '<div class="lux-field"><span>Financing</span><span>---</span></div><div class="lux-field"><span>Flip Tax</span><span>---</span></div>' : ''}
                                ${!isSale ? '<div class="lux-field"><span>Security Deposit</span><span>---</span></div>' : ''}
                            </div>
                        </div>

                        <!-- Description -->
                        ${listing.description ? '<div class="lux-card mb-4"><h3 class="lux-section-title"><i class="fas fa-align-left text-gray-400"></i> Description</h3><p class="text-sm text-gray-600 leading-relaxed">' + escapeHtml(listing.description) + '</p></div>' : ''}

                        <!-- Key Features Grid (only show items with data) -->
                        <div class="lux-card mb-4">
                            <h3 class="lux-section-title"><i class="fas fa-star text-gray-400"></i> Key Features</h3>
                            <div class="grid grid-cols-3 gap-2">
                                ${listing.propertySubType ? '<div class="lux-feature-item"><i class="fas fa-building"></i><div><div class="feature-label">Type</div><div class="feature-value">' + escapeHtml(listing.propertySubType) + '</div></div></div>' : ''}
                                ${listing.floor ? '<div class="lux-feature-item"><i class="fas fa-layer-group"></i><div><div class="feature-label">Floor</div><div class="feature-value">' + escapeHtml(listing.floor) + '</div></div></div>' : ''}
                                ${listing.exposures ? '<div class="lux-feature-item"><i class="fas fa-compass"></i><div><div class="feature-label">Exposure</div><div class="feature-value">' + escapeHtml(listing.exposures) + '</div></div></div>' : ''}
                                ${listing.condition ? '<div class="lux-feature-item"><i class="fas fa-tools"></i><div><div class="feature-label">Condition</div><div class="feature-value">' + escapeHtml(listing.condition) + '</div></div></div>' : ''}
                                ${listing.yearBuilt ? '<div class="lux-feature-item"><i class="fas fa-calendar-alt"></i><div><div class="feature-label">Year Built</div><div class="feature-value">' + listing.yearBuilt + '</div></div></div>' : ''}
                                ${listing.era ? '<div class="lux-feature-item"><i class="fas fa-landmark"></i><div><div class="feature-label">Era</div><div class="feature-value">' + escapeHtml(listing.era) + '</div></div></div>' : ''}
                                ${listing.walkScore ? '<div class="lux-feature-item"><i class="fas fa-walking"></i><div><div class="feature-label">Walk Score</div><div class="feature-value">' + listing.walkScore + '</div></div></div>' : ''}
                                <div class="lux-feature-item"><i class="fas fa-home"></i><div><div class="feature-label">Ownership</div><div class="feature-value">${ownershipLabel(listing.ownership)}</div></div></div>
                                ${listing.buildingName ? '<div class="lux-feature-item"><i class="fas fa-city"></i><div><div class="feature-label">Building</div><div class="feature-value">' + escapeHtml(listing.buildingName) + '</div></div></div>' : ''}
                            </div>
                        </div>

                        <!-- Open Houses (only show if applicable) -->
                        ${listing.nextOpenHouse ? '<div class="lux-card mb-4 border-l-4 border-blue-500"><h3 class="lux-section-title"><i class="fas fa-door-open text-blue-500"></i> Open House</h3><p class="text-sm font-semibold text-blue-700">' + (typeof listing.nextOpenHouse === 'object' ? ((function(oh){ var p=[]; if(oh.date){try{var d=new Date(oh.date);p.push(!isNaN(d.getTime())?d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}):oh.date);}catch(e){p.push(oh.date);}} if(oh.time)p.push(oh.time); return p.join(', '); })(listing.nextOpenHouse)) : listing.nextOpenHouse) + '</p></div>' : ''}

                        <!-- Media Preview (4 thumbs + link) -->
                        <div class="lux-card mb-4">
                            <div class="flex items-center justify-between mb-3">
                                <h3 class="lux-section-title mb-0"><i class="fas fa-images text-gray-400"></i> Photos</h3>
                                <button onclick="detailSwitchTab('media')" class="text-sm text-amber-700 font-semibold hover:underline">View all ${photos.length} photos &rarr;</button>
                            </div>
                            <div class="grid grid-cols-4 gap-3">
                                ${(listing.images || []).slice(0, 4).map(function(img, idx) {
                                    return '<div class="lux-media-thumb cursor-pointer" onclick="openPhotoLightbox(' + idx + ')"><img src="' + img.url.replace('w=800', 'w=400') + '" alt="' + escapeHtml(img.caption || '') + '" loading="lazy"><div class="caption">' + escapeHtml(img.caption || 'Photo ' + (idx+1)) + '</div></div>';
                                }).join('')}
                            </div>
                        </div>

                        <!-- Similar Listings: In this Neighborhood -->
                        <div class="mb-5">
                            <div class="flex items-center justify-between mb-3">
                                <h3 class="text-base font-bold text-gray-900">In this Neighborhood</h3>
                            </div>
                            <div class="grid grid-cols-3 gap-4" id="detailSimilarNeighborhood"></div>
                        </div>

                        <!-- Similar Listings: Nearby -->
                        <div class="mb-5">
                            <div class="flex items-center justify-between mb-3">
                                <h3 class="text-base font-bold text-gray-900">Nearby</h3>
                            </div>
                            <div class="grid grid-cols-3 gap-4" id="detailSimilarNearby"></div>
                        </div>

                        </div><!-- /detailPanelOverview -->

                        <!-- ═══ DETAILS TAB ═══ -->
                        <div id="detailPanelDetails" class="hidden">
                            <!-- Search + toggle -->
                            <div class="flex items-center justify-between mb-4">
                                <div class="relative"><i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i><input type="text" class="pl-9 pr-3 py-2 border rounded-lg text-sm w-64" placeholder="Search fields..." oninput="detailSearchFields(this.value)"></div>
                                <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">Hide empty fields <div class="relative"><input type="checkbox" class="sr-only peer" id="detailHideEmpty" onchange="detailToggleEmpty()"><div class="w-9 h-5 bg-gray-200 rounded-full peer-checked:bg-blue-600 transition-colors"></div><div class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform"></div></div></label>
                            </div>

                            <!-- ═══ LISTING ═══ -->
                            <div class="border-l-4 border-blue-500 rounded-r-lg px-4 py-3 mb-4 detail-field-section">
                                <div class="flex items-center gap-2 mb-4"><i class="fas fa-clipboard-list text-blue-500"></i><h3 class="text-lg font-bold text-gray-900">Listing</h3></div>
                                <div class="grid grid-cols-3 gap-x-8">
                                    <!-- Col 1: Price / Financial -->
                                    <div class="space-y-2 text-sm">
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">${isSale ? 'List Price' : 'Monthly Rent'}</span><span class="font-semibold">$${listing.price.toLocaleString()}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Original Price</span><span class="font-semibold">${listing.originalPrice ? '$' + listing.originalPrice.toLocaleString() : '$' + listing.price.toLocaleString()}</span></div>
                                        ${isSale ? '<div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Maintenance / CC</span><span class="font-semibold">$' + listing.maintCC.toLocaleString() + '</span></div>' : '<div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Net Effective Rent</span><span class="font-semibold">---</span></div>'}
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">RE Taxes</span><span class="font-semibold">${listing.reTaxes ? '$' + listing.reTaxes.toLocaleString() + '/mo' : '---'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Est. Total Monthly</span><span class="font-semibold">$${listing.totalMonthly.toLocaleString()}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">$ Per SqFt</span><span class="font-semibold">${listing.intSqft ? '$' + Math.round(listing.price / listing.intSqft).toLocaleString() : '---'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">$ Per Room</span><span class="font-semibold">${listing.rooms ? '$' + Math.round(listing.price / listing.rooms).toLocaleString() : '---'}</span></div>
                                        ${isSale ? '<div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Shares</span><span class="font-semibold">---</span></div>' : '<div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Security Deposit</span><span class="font-semibold">---</span></div>'}
                                        ${isSale ? '<div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold">Flip Tax</div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Amount</span><span class="font-semibold">---</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Type</span><span class="font-semibold">---</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Paid By</span><span class="font-semibold">---</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Remarks</span><span class="font-semibold">---</span></div>' : ''}
                                        ${isSale ? '<div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Tax Deduction %</span><span class="font-semibold">---</span></div>' : ''}
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">AVM Display</span><span class="font-semibold">---</span></div>
                                        ${(listing.downPaymentAssistanceCount || listing.downPaymentAssistanceAmount) ? '<div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold mt-2"><i class="fas fa-hand-holding-usd text-green-500 mr-1 text-xs"></i>Down Payment Assistance</div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Programs Available</span><span class="font-semibold">' + (listing.downPaymentAssistanceCount || '---') + '</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Assistance Amount</span><span class="font-semibold">' + (listing.downPaymentAssistanceAmount ? '$' + Number(listing.downPaymentAssistanceAmount).toLocaleString() : '---') + '</span></div>' : ''}
                                    </div>
                                    <!-- Col 2: Type / Classification / Requirements -->
                                    <div class="space-y-2 text-sm">
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Property Type</span><span class="font-semibold">${escapeHtml(listing.propertySubType || listing.propertyType || '---')}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Ownership</span><span class="font-semibold">${ownershipLabel(listing.ownership)}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Building Status</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Listing Type</span><span class="font-semibold">${escapeHtml(listing.listingType || '---')}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Era</span><span class="font-semibold">${escapeHtml(listing.era || '---')}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Year Built</span><span class="font-semibold">${listing.yearBuilt || '---'}</span></div>
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold mt-2">Condition</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Unit Condition</span><span class="font-semibold">${escapeHtml(listing.condition || '---')}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Kitchen Condition</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Appliance Condition</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Bathroom Condition</span><span class="font-semibold">---</span></div>
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold mt-2">Building Requirements</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Board Approval</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Board Interview</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Meet and Greet</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Board Application</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Film Location</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Live/Work</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Cert of Occupancy</span><span class="font-semibold">---</span></div>
                                        ${isSale ? '<div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold mt-2">Purchasing Options</div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Pied-a-Terre</span><span class="font-semibold">---</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Parents Buying</span><span class="font-semibold">---</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Co-Purchasing</span><span class="font-semibold">---</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Guarantors</span><span class="font-semibold">---</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Subletting</span><span class="font-semibold">---</span></div>' : ''}
                                    </div>
                                    <!-- Col 3: Status / Dates / IDs -->
                                    <div class="space-y-2 text-sm">
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Status</span><span class="px-1.5 py-0.5 ${getStatusBadgeClasses(listing.status)} rounded text-xs font-semibold">${statusLabel}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Days on Market</span><span class="font-semibold text-blue-600">${listing.dom}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Cumulative DOM</span><span class="font-semibold">${listing.cdom || listing.dom}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Updated Date</span><span class="font-semibold">${listing.updatedDate || '---'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Date Listed</span><span class="font-semibold">${listing.listedDate}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">${isSale ? 'Available for Showing' : 'Available Date'}</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Availability Comments</span><span class="font-semibold">---</span></div>
                                        ${listing.closedDate ? '<div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">' + (isSale ? 'Sold Date' : 'Rented Date') + '</span><span class="font-semibold">' + listing.closedDate + '</span></div>' : ''}
                                        ${listing.comingSoonDate ? '<div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">First Showing Date</span><span class="font-semibold">' + listing.comingSoonDate + '</span></div>' : ''}
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold mt-2">Listing IDs</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">L-ID</span><span class="font-semibold">${listing.lid || '---'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">W-ID</span><span class="font-semibold">${listing.wid || '---'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">SourceSystemKey</span><span class="font-semibold">${listing.wid || listing.lid || listing.id}</span></div>
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold mt-2">Internet Display</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Internet Entire Listing</span><span class="font-semibold">${listing.internetDisplayYN !== false ? 'Yes' : 'No'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">IDX Display</span><span class="font-semibold">${listing.idxDisplayYN !== false ? 'Yes' : 'No'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Address Display</span><span class="font-semibold">${listing.addressDisplayYN !== false ? 'Yes' : 'No'}</span></div>
                                    </div>
                                </div>
                            </div>

                            ${!isSale ? '<div class="border-l-4 border-green-500 rounded-r-lg px-4 py-3 mb-4 detail-field-section"><div class="flex items-center gap-2 mb-4"><i class="fas fa-file-contract text-green-500"></i><h3 class="text-lg font-bold text-gray-900">Rental Terms</h3></div><div class="grid grid-cols-3 gap-x-8"><div class="space-y-2 text-sm"><div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Lease Type</span><span class="font-semibold">---</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Lease Term</span><span class="font-semibold">---</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Min Lease (Months)</span><span class="font-semibold">---</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Max Lease (Months)</span><span class="font-semibold">---</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Lease Renewal</span><span class="font-semibold">---</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Furnished</span><span class="font-semibold">---</span></div></div><div class="space-y-2 text-sm"><div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold">Concessions</div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Concessions</span><span class="font-semibold">---</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Free Rent</span><span class="font-semibold">---</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Free Rent Months</span><span class="font-semibold">---</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Concession Remarks</span><span class="font-semibold">---</span></div><div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold mt-2">FARE Act Fees</div>' + (listing.fareActFees ? '<div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Broker Fee Paid By</span><span class="font-semibold">' + listing.fareActFees.brokerFeePaidBy + '</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Application Fee</span><span class="font-semibold">$' + listing.fareActFees.applicationFee + '</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Move-In Fees</span><span class="font-semibold">' + listing.fareActFees.moveInFees + '</span></div>' : '<div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Fee Details</span><span class="font-semibold">---</span></div>') + '</div><div class="space-y-2 text-sm"><div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold">Policies</div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Pets Allowed</span><span class="font-semibold">---</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Guarantors</span><span class="font-semibold">---</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Smoking Allowed</span><span class="font-semibold">---</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Students Allowed</span><span class="font-semibold">---</span></div><div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Sublease Allowed</span><span class="font-semibold">---</span></div></div></div></div>' : ''}

                            <!-- ═══ UNIT ═══ -->
                            <div class="border-l-4 border-blue-500 rounded-r-lg px-4 py-3 mb-4 detail-field-section">
                                <div class="flex items-center gap-2 mb-4"><i class="fas fa-door-open text-blue-500"></i><h3 class="text-lg font-bold text-gray-900">Unit</h3></div>
                                <div class="grid grid-cols-3 gap-x-8">
                                    <!-- Col 1: Dimensions / Room Counts -->
                                    <div class="space-y-2 text-sm">
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Unit Type</span><span class="font-semibold">${escapeHtml(listing.propertySubType || 'Residential')}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Floors in Unit</span><span class="font-semibold">Single Floor</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Approx Interior SqFt</span><span class="font-semibold">${listing.intSqft ? listing.intSqft.toLocaleString() : '---'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Approx Exterior SqFt</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Ceiling Height</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Total Rooms</span><span class="font-semibold">${listing.rooms || '---'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Bedrooms</span><span class="font-semibold">${listing.beds}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Full Bathrooms</span><span class="font-semibold">${listing.fullBaths || listing.baths}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Half Bathrooms</span><span class="font-semibold">${listing.halfBaths || 0}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Staff Bedrooms</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Staff Bathrooms</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Original # of Rooms</span><span class="font-semibold">${listing.rooms || '---'}</span></div>
                                    </div>
                                    <!-- Col 2: Kitchen / Rooms / Dining -->
                                    <div class="space-y-2 text-sm">
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold">Kitchen</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Kitchen Type</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Kitchen Features</span><span class="font-semibold">---</span></div>
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold mt-2">Dining</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Type of Dining</span><span class="font-semibold">---</span></div>
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold mt-2">Bathroom</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Bathroom Features</span><span class="font-semibold">---</span></div>
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold mt-2">Additional Rooms</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Living Room</span><span class="font-semibold">Yes</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Den / Office</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Foyer</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Library</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Media Room</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Laundry Room</span><span class="font-semibold">---</span></div>
                                    </div>
                                    <!-- Col 3: Location / Exposure / Views -->
                                    <div class="space-y-2 text-sm">
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Floor in Building</span><span class="font-semibold">${escapeHtml(listing.floor || '---')}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Line in Building</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Exposure</span><span class="font-semibold">${escapeHtml(listing.exposures || '---')}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Light</span><span class="font-semibold">---</span></div>
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold mt-2">Views</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Has Views</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">View Types</span><span class="font-semibold">---</span></div>
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold mt-2">Outdoor Space</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Private Outdoor</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Balcony</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Terrace</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Roof Deck / Rights</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Garden / Patio</span><span class="font-semibold">---</span></div>
                                    </div>
                                </div>
                            </div>

                            <!-- ═══ FEATURES ═══ -->
                            <div class="border-l-4 border-blue-500 rounded-r-lg px-4 py-3 mb-4 detail-field-section">
                                <div class="flex items-center gap-2 mb-4"><i class="fas fa-star text-blue-500"></i><h3 class="text-lg font-bold text-gray-900">Features</h3></div>
                                <div class="grid grid-cols-3 gap-x-8">
                                    <!-- Col 1: Feature Details / Windows / Ceilings / Flooring -->
                                    <div class="space-y-2 text-sm">
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Feature Details</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Ceiling Height</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Ceilings</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Flooring</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Windows</span><span class="font-semibold">---</span></div>
                                    </div>
                                    <!-- Col 2: Fireplace / Washer-Dryer -->
                                    <div class="space-y-2 text-sm">
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold">Fireplace</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Fireplace</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Decorative</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Gas</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Wood Burning</span><span class="font-semibold">---</span></div>
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold mt-2">Washer / Dryer</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">W/D Allowed</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">W/D Hookups</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">W/D in Unit</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">W/D Brand</span><span class="font-semibold">---</span></div>
                                    </div>
                                    <!-- Col 3: HVAC / Storage -->
                                    <div class="space-y-2 text-sm">
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold">Cooling</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Cooling</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Cooling Type</span><span class="font-semibold">---</span></div>
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold mt-2">Heating</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Heating</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Heating Type</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Fresh Air System</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">HVAC</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Storage</span><span class="font-semibold">---</span></div>
                                    </div>
                                </div>
                            </div>

                            <!-- ═══ BUILDING ═══ -->
                            <div class="border-l-4 border-blue-500 rounded-r-lg px-4 py-3 mb-4 detail-field-section">
                                <div class="flex items-center gap-2 mb-4"><i class="fas fa-building text-blue-500"></i><h3 class="text-lg font-bold text-gray-900">Building</h3></div>
                                <div class="grid grid-cols-3 gap-x-8">
                                    <!-- Col 1: Building Info -->
                                    <div class="space-y-2 text-sm">
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Building Name</span><span class="font-semibold">${listing.buildingName || '---'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Address</span><span class="font-semibold">${displayAddress}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Neighborhood</span><span class="font-semibold">${listing.neighborhood}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Borough</span><span class="font-semibold">${listing.borough || 'Manhattan'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Zip</span><span class="font-semibold">${listing.zip}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Cross Street</span><span class="font-semibold">${listing.crossStreet || '---'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Year Built</span><span class="font-semibold">${listing.yearBuilt || '---'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Era</span><span class="font-semibold">${listing.era || '---'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Stories</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Total Units</span><span class="font-semibold">---</span></div>
                                        ${listing.buildingKey ? '<div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Building ID</span><span class="font-semibold">' + listing.buildingKey + '</span></div>' : ''}
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5"><span class="text-gray-500">Landmark Status</span><span class="font-semibold">---</span></div>
                                    </div>
                                    <!-- Col 2: Structure / Lot -->
                                    <div class="space-y-2 text-sm">
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold">Lot</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Lot Size</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Lot Dimensions</span><span class="font-semibold">---</span></div>
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold mt-2">Structure</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Building Area</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Foundation</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Basement</span><span class="font-semibold">---</span></div>
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold mt-2">Zoning</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Zoning</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Over FAR</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Under FAR</span><span class="font-semibold">---</span></div>
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold mt-2">Land Lease</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Land Lease</span><span class="font-semibold">---</span></div>
                                    </div>
                                    <!-- Col 3: Amenities / Parking -->
                                    <div class="space-y-2 text-sm">
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold">Building Amenities</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Doorman</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Elevator</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Gym / Fitness</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Pool</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Roof Deck</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Laundry</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Bike Room</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Concierge</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Live-in Super</span><span class="font-semibold">---</span></div>
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold mt-2">Parking</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Garage</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Garage Spaces</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Open Parking</span><span class="font-semibold">---</span></div>
                                    </div>
                                </div>
                            </div>

                            <!-- ═══ AGENT / CONTACTS (Agent Only) ═══ -->
                            <div class="border border-gray-200 rounded-lg p-3 mb-4 detail-field-section">
                                <div class="flex items-center gap-2 mb-4"><i class="fas fa-user-tie text-amber-600"></i><h3 class="text-lg font-bold text-gray-900">Agent & Contacts</h3><span class="agent-only-badge ml-2"><i class="fas fa-lock text-[8px]"></i> Agent Only</span></div>
                                <div class="grid grid-cols-3 gap-x-8">
                                    <!-- Col 1: Listing Agent -->
                                    <div class="space-y-2 text-sm">
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold">Listing Agent</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Company</span><span class="font-semibold">${listing.company || '---'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Agent Name</span><span class="font-semibold">${listing.agentName || '---'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Phone</span><span class="font-semibold">${listing.agentPhone || '---'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Email</span><span class="font-semibold">${listing.agentEmail || '---'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">License #</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Listing Type</span><span class="font-semibold">${listing.listingType || '---'}</span></div>
                                    </div>
                                    <!-- Col 2: Showing / Instructions -->
                                    <div class="space-y-2 text-sm">
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold">Showing</div>
                                        ${isComingSoon(listing)
                                            ? '<div class="border-b border-gray-100 pb-1.5 pl-4"><span class="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs font-semibold"><i class="fas fa-ban mr-1"></i>Coming Soon. No Showings or Open House until ' + (listing.comingSoonDate || 'active date') + '.</span></div>'
                                            : ''
                                        }
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Showing Instructions</span><span class="font-semibold text-right max-w-[200px] truncate">${listing.showingInstructions || '(UCOM) ' + (listing.agentName || '') + ' ' + (listing.agentPhone || '')}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Broker Comments</span><span class="font-semibold">---</span></div>
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold mt-2">Co-Listing Agent</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Company</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Agent Name</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Phone</span><span class="font-semibold">---</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Email</span><span class="font-semibold">---</span></div>
                                    </div>
                                    <!-- Col 3: Distribution -->
                                    <div class="space-y-2 text-sm">
                                        <!-- Syndication is THREE states, not two. It used to render
                                             \`permissions.syndication ? 'Yes' : 'No'\` over a value that
                                             core/data-loader.js hardcoded to true, so every listing showed
                                             "Syndication: Yes" — a literal claim of portal distribution the
                                             system does not perform (no export route, no cron, and
                                             MALLAN_OFFICE_MLS_IDS empty blocks every row at Layer 1). The
                                             hardcode is gone, and absent now reads "Not configured" rather
                                             than a bare "No" that would look like a per-listing setting. -->
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold">Distribution</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Owner Opt-Out</span><span class="font-semibold">${listing.permissions && listing.permissions.ownerOptOut ? 'Yes' : 'No'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Participant Only</span><span class="font-semibold">${listing.permissions && listing.permissions.participantOnly ? 'Yes' : 'No'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Internet Entire Listing</span><span class="font-semibold">${listing.internetDisplayYN !== false ? 'Yes' : 'No'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">IDX Display</span><span class="font-semibold">${listing.idxDisplayYN !== false ? 'Yes' : 'No'}</span></div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">Syndication</span><span class="font-semibold">${listing.permissions && listing.permissions.syndication === true ? 'Yes' : listing.permissions && listing.permissions.syndication === false ? 'No' : 'Not configured'}</span></div>
                                        <div class="text-gray-500 border-b border-gray-100 pb-1.5 font-semibold mt-2">CoBroke</div>
                                        <div class="flex justify-between border-b border-gray-100 pb-1.5 pl-4"><span class="text-gray-400">CoBroke Agreement</span><span class="font-semibold">---</span></div>
                                    </div>
                                </div>
                            </div>
                        </div><!-- /detailPanelDetails -->

                        <!-- ═══ HISTORY TAB (inside Details) ═══ -->
                        <div id="detailPanelHistory" class="hidden">
                            <!-- Listing & Unit History -->
                            <div class="border rounded-lg p-4 mb-4">
                                <h3 class="text-lg font-bold text-gray-900 mb-3">Listing & Unit History</h3>
                                <div class="flex items-center justify-between mb-3">
                                    <div class="flex items-center gap-3">
                                        <div class="relative"><i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i><input type="text" class="pl-9 pr-3 py-1.5 border rounded-lg text-sm w-48" placeholder="Search"><button class="ml-1 text-gray-400"><i class="fas fa-info-circle text-xs"></i></button></div>
                                        <span class="text-sm text-blue-600 font-semibold">This Listing</span>
                                        <div class="w-9 h-5 bg-blue-600 rounded-full relative"><div class="absolute top-0.5 right-0.5 w-4 h-4 bg-white rounded-full shadow"></div></div>
                                        <span class="text-sm text-gray-500">Complete Unit History</span>
                                    </div>
                                    <div class="flex items-center gap-2 text-sm text-gray-500">
                                        <span>0 Results</span>
                                        <select class="border rounded px-2 py-1 text-xs"><option>10 per page</option></select>
                                        <div class="flex items-center gap-0.5"><button class="px-1.5 py-0.5 border rounded text-xs text-gray-400">&laquo;</button><button class="px-1.5 py-0.5 border rounded text-xs text-gray-400">&lt;</button><span class="px-2 text-xs font-semibold">1</span><button class="px-1.5 py-0.5 border rounded text-xs text-gray-400">&gt;</button><button class="px-1.5 py-0.5 border rounded text-xs text-gray-400">&raquo;</button></div>
                                    </div>
                                </div>
                                <div class="flex border-b mb-3">
                                    <button class="px-3 py-1.5 text-sm font-semibold text-blue-600 border-b-2 border-blue-600">SIGNIFICANT CHANGES</button>
                                    <button class="px-3 py-1.5 text-sm text-gray-500">ALL RECORDS</button>
                                </div>
                                <table class="w-full text-sm">
                                    <thead><tr class="border-b">
                                        <th class="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Date <i class="fas fa-arrow-down text-[10px]"></i></th>
                                        <th class="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Time <i class="fas fa-arrow-down text-[10px]"></i></th>
                                        <th class="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Price</th>
                                        <th class="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Monthly</th>
                                        <th class="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Status</th>
                                        <th class="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Updating Agent</th>
                                        <th class="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Dep</th>
                                        <th class="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Comments</th>
                                    </tr></thead>
                                    <tbody>
                                        <tr class="text-center text-gray-400 text-xs"><td colspan="8" class="py-6">No history records</td></tr>
                                    </tbody>
                                </table>
                            </div>

                            <!-- Other History -->
                            <div class="border rounded-lg p-4 mb-4">
                                <h3 class="text-lg font-bold text-gray-900 mb-3">Other History</h3>
                                <div class="flex items-center justify-between mb-3">
                                    <div class="relative"><i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i><input type="text" class="pl-9 pr-3 py-1.5 border rounded-lg text-sm w-48" placeholder="Search"><button class="ml-1 text-gray-400"><i class="fas fa-info-circle text-xs"></i></button></div>
                                    <div class="flex items-center gap-2 text-sm text-gray-500">
                                        <span>0 Results</span>
                                        <select class="border rounded px-2 py-1 text-xs"><option>10 per page</option></select>
                                        <div class="flex items-center gap-0.5"><button class="px-1.5 py-0.5 border rounded text-xs text-gray-400">&laquo;</button><button class="px-1.5 py-0.5 border rounded text-xs text-gray-400">&lt;</button><span class="px-2 text-xs font-semibold">1</span><button class="px-1.5 py-0.5 border rounded text-xs text-gray-400">&gt;</button><button class="px-1.5 py-0.5 border rounded text-xs text-gray-400">&raquo;</button></div>
                                    </div>
                                </div>
                                <div class="flex border-b mb-3">
                                    <button class="px-3 py-1.5 text-sm font-semibold text-blue-600 border-b-2 border-blue-600">CUSTOMER ACTIVITY</button>
                                    <button class="px-3 py-1.5 text-sm text-gray-500">OPEN HOUSE</button>
                                    <button class="px-3 py-1.5 text-sm text-gray-500">LISTING CREDIT</button>
                                </div>
                                <table class="w-full text-sm">
                                    <thead><tr class="border-b">
                                        <th class="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Name</th>
                                        <th class="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Date <i class="fas fa-arrow-down text-[10px]"></i></th>
                                        <th class="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Activity</th>
                                    </tr></thead>
                                    <tbody>
                                        <tr class="text-center text-gray-400 text-xs"><td colspan="3" class="py-6">No activity records</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div><!-- /detailPanelHistory -->

                        <!-- ═══════════════════════════════════════════ -->
                        <!-- BUILDING TAB                                -->
                        <!-- ═══════════════════════════════════════════ -->
                        <div id="detailPanelBuilding" class="hidden">

                        <!-- Building Header -->
                        <div class="border rounded-xl p-4 mb-4">
                            <div class="flex items-center gap-2 mb-2"><span class="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">${ownershipLabel(listing.ownership)}</span></div>
                            <h2 class="text-2xl font-bold text-gray-900 mb-1">${listing.buildingName || displayAddress}</h2>
                            <p class="text-sm text-gray-500">${displayAddress} &middot; ${listing.neighborhood}, NY ${listing.zip}</p>
                            <div class="flex items-center gap-6 mt-4 pt-4 border-t">
                                ${listing.yearBuilt ? '<div class="text-center"><div class="text-gray-900 font-bold text-xl">' + listing.yearBuilt + '</div><div class="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Year Built</div></div><div class="w-px h-10 bg-gray-200"></div>' : ''}
                                <div class="text-center"><div class="text-gray-900 font-bold text-xl">${listing.era || '---'}</div><div class="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Era</div></div>
                                <div class="w-px h-10 bg-gray-200"></div>
                                <div class="text-center"><div class="text-gray-900 font-bold text-xl">---</div><div class="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Stories</div></div>
                                <div class="w-px h-10 bg-gray-200"></div>
                                <div class="text-center"><div class="text-gray-900 font-bold text-xl">---</div><div class="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Total Units</div></div>
                                <div class="w-px h-10 bg-gray-200"></div>
                                <div class="text-center"><div class="text-gray-900 font-bold text-xl">${listing.walkScore || '---'}</div><div class="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Walk Score</div></div>
                            </div>
                        </div>

                        <!-- Building Amenities -->
                        <div class="mb-4">
                            <h3 class="lux-section-title"><i class="fas fa-concierge-bell text-gray-400"></i> Building Amenities</h3>
                            <div class="grid grid-cols-4 gap-3">
                                <div class="lux-amenity-card"><i class="fas fa-concierge-bell"></i><span>Doorman</span></div>
                                <div class="lux-amenity-card"><i class="fas fa-arrows-alt-v"></i><span>Elevator</span></div>
                                <div class="lux-amenity-card"><i class="fas fa-dumbbell"></i><span>Gym / Fitness</span></div>
                                <div class="lux-amenity-card"><i class="fas fa-swimming-pool"></i><span>Pool</span></div>
                                <div class="lux-amenity-card"><i class="fas fa-warehouse"></i><span>Roof Deck</span></div>
                                <div class="lux-amenity-card"><i class="fas fa-tshirt"></i><span>Laundry</span></div>
                                <div class="lux-amenity-card"><i class="fas fa-bicycle"></i><span>Bike Room</span></div>
                                <div class="lux-amenity-card"><i class="fas fa-box"></i><span>Storage</span></div>
                                <div class="lux-amenity-card"><i class="fas fa-user-tie"></i><span>Concierge</span></div>
                                <div class="lux-amenity-card"><i class="fas fa-user-shield"></i><span>Live-in Super</span></div>
                                <div class="lux-amenity-card"><i class="fas fa-car"></i><span>Parking</span></div>
                                <div class="lux-amenity-card"><i class="fas fa-paw"></i><span>Pet Friendly</span></div>
                            </div>
                        </div>

                        <!-- Building Details -->
                        <div class="lux-card mb-4">
                            <h3 class="lux-section-title"><i class="fas fa-building text-gray-400"></i> Building Details</h3>
                            <div class="grid grid-cols-3 gap-x-8">
                                <div class="space-y-2.5 text-sm">
                                    <div class="lux-field"><span>Building Name</span><span>${listing.buildingName || '---'}</span></div>
                                    <div class="lux-field"><span>Address</span><span>${displayAddress}</span></div>
                                    <div class="lux-field"><span>Neighborhood</span><span>${listing.neighborhood}</span></div>
                                    <div class="lux-field"><span>Borough</span><span>${listing.borough || 'Manhattan'}</span></div>
                                    <div class="lux-field"><span>Zip Code</span><span>${listing.zip}</span></div>
                                    <div class="lux-field"><span>Cross Street</span><span>${listing.crossStreet || '---'}</span></div>
                                    <div class="lux-field"><span>Year Built</span><span>${listing.yearBuilt || '---'}</span></div>
                                    <div class="lux-field"><span>Era</span><span>${listing.era || '---'}</span></div>
                                    <div class="lux-field"><span>Ownership</span><span>${ownershipLabel(listing.ownership)}</span></div>
                                    <div class="lux-field"><span>Landmark</span><span>---</span></div>
                                </div>
                                <div class="space-y-2.5 text-sm">
                                    <div class="lux-field-header">Structure</div>
                                    <div class="lux-field"><span>Stories</span><span>---</span></div>
                                    <div class="lux-field"><span>Total Units</span><span>---</span></div>
                                    <div class="lux-field"><span>Residential Units</span><span>---</span></div>
                                    <div class="lux-field"><span>Building Area</span><span>---</span></div>
                                    <div class="lux-field"><span>Gross SqFt</span><span>---</span></div>
                                    <div class="lux-field"><span>Foundation</span><span>---</span></div>
                                    <div class="lux-field"><span>Basement</span><span>---</span></div>
                                    <div class="lux-field"><span>Development Status</span><span>---</span></div>
                                </div>
                                <div class="space-y-2.5 text-sm">
                                    <div class="lux-field-header">Lot & Zoning</div>
                                    <div class="lux-field"><span>Lot Size</span><span>---</span></div>
                                    <div class="lux-field"><span>Lot Dimensions</span><span>---</span></div>
                                    <div class="lux-field"><span>Zoning</span><span>---</span></div>
                                    <div class="lux-field"><span>Over FAR</span><span>---</span></div>
                                    <div class="lux-field"><span>Under FAR</span><span>---</span></div>
                                    <div class="lux-field-header mt-3">Parking</div>
                                    <div class="lux-field"><span>Garage</span><span>---</span></div>
                                    <div class="lux-field"><span>Garage Spaces</span><span>---</span></div>
                                    <div class="lux-field"><span>Open Parking</span><span>---</span></div>
                                    <div class="lux-field-header mt-3">Land Lease</div>
                                    <div class="lux-field"><span>Land Lease</span><span>---</span></div>
                                </div>
                            </div>
                        </div>

                        <!-- Building Policies -->
                        <div class="lux-card mb-4">
                            <h3 class="lux-section-title"><i class="fas fa-shield-alt text-gray-400"></i> Policies & Requirements</h3>
                            <div class="grid grid-cols-4 gap-4">
                                <div class="lux-policy"><span class="text-gray-500">Board Approval</span><span class="font-semibold">---</span></div>
                                <div class="lux-policy"><span class="text-gray-500">Board Interview</span><span class="font-semibold">---</span></div>
                                <div class="lux-policy"><span class="text-gray-500">Board Application</span><span class="font-semibold">---</span></div>
                                <div class="lux-policy"><span class="text-gray-500">Meet & Greet</span><span class="font-semibold">---</span></div>
                                <div class="lux-policy"><span class="text-gray-500">Film Location</span><span class="font-semibold">---</span></div>
                                <div class="lux-policy"><span class="text-gray-500">Live/Work</span><span class="font-semibold">---</span></div>
                                <div class="lux-policy"><span class="text-gray-500">Subletting</span><span class="font-semibold">---</span></div>
                                <div class="lux-policy"><span class="text-gray-500">Pied-a-Terre</span><span class="font-semibold">---</span></div>
                                <div class="lux-policy"><span class="text-gray-500">Pets</span><span class="font-semibold">---</span></div>
                                <div class="lux-policy"><span class="text-gray-500">Financing Allowed</span><span class="font-semibold">---</span></div>
                                <div class="lux-policy"><span class="text-gray-500">Advertising</span><span class="font-semibold">---</span></div>
                                <div class="lux-policy"><span class="text-gray-500">Open House Allowed</span><span class="font-semibold">---</span></div>
                            </div>
                        </div>

                        <!-- Building Description -->
                        <div class="lux-card mb-4">
                            <h3 class="lux-section-title"><i class="fas fa-align-left text-gray-400"></i> Building Description</h3>
                            <p class="text-sm text-gray-500 italic">No building description available.</p>
                        </div>

                        <!-- Documents Available -->
                        <div class="lux-card mb-4">
                            <h3 class="lux-section-title"><i class="fas fa-file-alt text-gray-400"></i> Documents Available</h3>
                            <div class="grid grid-cols-3 gap-3">
                                <div class="flex items-center gap-2 p-2.5 border rounded-lg text-sm text-gray-500"><i class="far fa-file-pdf text-red-400"></i> Building Rules</div>
                                <div class="flex items-center gap-2 p-2.5 border rounded-lg text-sm text-gray-500"><i class="far fa-file-pdf text-red-400"></i> Bylaws</div>
                                <div class="flex items-center gap-2 p-2.5 border rounded-lg text-sm text-gray-500"><i class="far fa-file-pdf text-red-400"></i> Financial Statement</div>
                                <div class="flex items-center gap-2 p-2.5 border rounded-lg text-sm text-gray-500"><i class="far fa-file-pdf text-red-400"></i> Offering Plan</div>
                                <div class="flex items-center gap-2 p-2.5 border rounded-lg text-sm text-gray-500"><i class="far fa-file-pdf text-red-400"></i> Board Package</div>
                                <div class="flex items-center gap-2 p-2.5 border rounded-lg text-sm text-gray-500"><i class="far fa-file-pdf text-red-400"></i> Schedule A</div>
                            </div>
                        </div>

                        </div><!-- /detailPanelBuilding -->

                        <!-- ═══════════════════════════════════════════ -->
                        <!-- NEIGHBORHOOD & MAP TAB                      -->
                        <!-- ═══════════════════════════════════════════ -->
                        <div id="detailPanelNeighborhood" class="hidden">

                        <!-- Neighborhood Header -->
                        <div class="border rounded-xl p-4 mb-4">
                            <div class="flex items-center gap-2 mb-2"><span class="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">${listing.borough || 'Manhattan'}</span></div>
                            <h2 class="text-2xl font-bold text-gray-900 mb-1">${listing.neighborhood}</h2>
                            <p class="text-sm text-gray-500">${listing.borough || 'Manhattan'}, New York ${listing.zip}</p>
                            <div class="flex items-center gap-6 mt-4 pt-4 border-t">
                                ${listing.walkScore ? '<div class="text-center"><div class="text-gray-900 font-bold text-xl">' + listing.walkScore + '</div><div class="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Walk Score</div></div><div class="w-px h-10 bg-gray-200"></div>' : ''}
                                <div class="text-center"><div class="text-gray-900 font-bold text-xl">${transitScore || '---'}</div><div class="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Transit Score</div></div>
                                <div class="w-px h-10 bg-gray-200"></div>
                                <div class="text-center"><div class="text-gray-900 font-bold text-xl">${bikeScore || '---'}</div><div class="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Bike Score</div></div>
                            </div>
                        </div>

                        <!-- Transit (Dynamic) -->
                        <div class="lux-card mb-4">
                            <h3 class="lux-section-title"><i class="fas fa-subway text-gray-400"></i> Transportation</h3>
                            <div class="flex flex-col lg:flex-row gap-6">
                                <div class="flex-1">
                                    <h4 class="text-sm font-bold text-gray-900 mb-4">Nearby Transit</h4>
                                    <div class="space-y-3" id="detailTransitStations">
                                        ${buildTransitStationsHTML(listing)}
                                    </div>
                                    <div class="mt-3 flex items-center justify-between">
                                        <div class="flex items-center gap-2 text-[10px] text-gray-500">
                                            <span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span> Live — MTA schedule data &middot; Refreshes every 30s
                                        </div>
                                        <button onclick="refreshTransitArrivals(); this.querySelector('i').classList.add('fa-spin'); var btn=this; setTimeout(function(){btn.querySelector('i').classList.remove('fa-spin')},500)" class="text-[10px] text-blue-500 hover:text-blue-700 font-medium"><i class="fas fa-sync-alt"></i> Refresh</button>
                                    </div>
                                </div>
                                <div class="w-full lg:w-[360px] flex-shrink-0">
                                    <div class="h-[300px] bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 border">
                                        <div class="text-center"><i class="fas fa-map-marked-alt text-4xl mb-3 text-gray-300"></i><div class="text-sm font-medium">${listing.neighborhood}</div><div class="text-xs">${listing.borough || 'Manhattan'}, NY ${listing.zip}</div></div>
                                    </div>
                                    <button class="flex items-center gap-2 text-blue-600 text-sm mt-3 hover:underline font-medium"><i class="fas fa-directions"></i> Get Directions</button>
                                </div>
                            </div>
                        </div>

                        <!-- Commute Calculator -->
                        <div class="lux-card mb-4">
                            <h3 class="lux-section-title"><i class="fas fa-route text-gray-400"></i> Commute Calculator</h3>
                            <div class="flex flex-col sm:flex-row gap-3 mb-4">
                                <input type="text" id="detailCommuteAddress" class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Enter your work address...">
                                <button onclick="calculateCommute('${listing.id}')" class="px-4 py-2 bg-[#B8860B] text-white rounded-lg text-sm font-semibold hover:bg-[#9A7209] transition whitespace-nowrap"><i class="fas fa-route mr-1"></i> Calculate Commute</button>
                            </div>
                            <div id="detailCommuteResults" class="hidden">
                                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                                    <div class="bg-blue-50 rounded-xl p-4 text-center">
                                        <i class="fas fa-subway text-blue-600 text-xl mb-1"></i>
                                        <div class="text-lg font-bold text-blue-700" id="commuteSubwayTime">--</div>
                                        <div class="text-[10px] text-blue-500 font-semibold uppercase">Via Subway</div>
                                    </div>
                                    <div class="bg-green-50 rounded-xl p-4 text-center">
                                        <i class="fas fa-bus text-green-600 text-xl mb-1"></i>
                                        <div class="text-lg font-bold text-green-700" id="commuteBusTime">--</div>
                                        <div class="text-[10px] text-green-500 font-semibold uppercase">Via Bus</div>
                                    </div>
                                    <div class="bg-amber-50 rounded-xl p-4 text-center">
                                        <i class="fas fa-walking text-amber-600 text-xl mb-1"></i>
                                        <div class="text-lg font-bold text-amber-700" id="commuteWalkTime">--</div>
                                        <div class="text-[10px] text-amber-500 font-semibold uppercase">Walking</div>
                                    </div>
                                </div>
                                <p class="text-[10px] text-gray-400">Estimates based on average transit times. Actual commute times may vary.</p>
                            </div>
                        </div>

                        <!-- Scores -->
                        <div class="grid grid-cols-3 gap-4 mb-4">
                            <div class="lux-score-card">
                                <div class="flex items-center gap-3"><div class="lux-score-circle" style="background: conic-gradient(#10b981 ${(listing.walkScore || 0) * 3.6}deg, #e5e7eb 0)">${listing.walkScore || '---'}</div><div><div class="font-bold">Walk Score</div><div class="text-xs text-gray-500">${listing.walkScore >= 90 ? "Walker's Paradise" : listing.walkScore >= 70 ? 'Very Walkable' : 'Somewhat Walkable'}</div></div></div>
                            </div>
                            <div class="lux-score-card">
                                <div class="flex items-center gap-3"><div class="lux-score-circle" style="background: conic-gradient(#3b82f6 ${(transitScore || 0) * 3.6}deg, #e5e7eb 0)">${transitScore || '---'}</div><div><div class="font-bold">Transit Score</div><div class="text-xs text-gray-500">${transitScore >= 90 ? 'Rider\'s Paradise' : transitScore >= 70 ? 'Excellent Transit' : transitScore >= 50 ? 'Good Transit' : 'Some Transit'}</div></div></div>
                            </div>
                            <div class="lux-score-card">
                                <div class="flex items-center gap-3"><div class="lux-score-circle" style="background: conic-gradient(#f59e0b ${(bikeScore || 0) * 3.6}deg, #e5e7eb 0)">${bikeScore || '---'}</div><div><div class="font-bold">Bike Score</div><div class="text-xs text-gray-500">${bikeScore >= 90 ? 'Biker\'s Paradise' : bikeScore >= 70 ? 'Very Bikeable' : bikeScore >= 50 ? 'Bikeable' : 'Somewhat Bikeable'}</div></div></div>
                            </div>
                        </div>

                        <!-- Schools -->
                        <div class="lux-card mb-4">
                            <h3 class="lux-section-title"><i class="fas fa-graduation-cap text-gray-400"></i> Schools Nearby</h3>
                            <div class="space-y-3">
                                <div class="flex items-center justify-between p-3 border rounded-xl">
                                    <div class="flex items-center gap-3"><div class="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center"><i class="fas fa-school text-blue-500"></i></div><div><div class="text-sm font-semibold">PS/MS District School</div><div class="text-xs text-gray-500">Public &middot; Grades PK-5 &middot; 0.2 mi</div></div></div>
                                    <div class="text-right"><div class="text-sm font-bold text-blue-600">8/10</div><div class="text-[10px] text-gray-400">GreatSchools</div></div>
                                </div>
                                <div class="flex items-center justify-between p-3 border rounded-xl">
                                    <div class="flex items-center gap-3"><div class="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center"><i class="fas fa-school text-purple-500"></i></div><div><div class="text-sm font-semibold">Middle / Junior High</div><div class="text-xs text-gray-500">Public &middot; Grades 6-8 &middot; 0.4 mi</div></div></div>
                                    <div class="text-right"><div class="text-sm font-bold text-purple-600">7/10</div><div class="text-[10px] text-gray-400">GreatSchools</div></div>
                                </div>
                                <div class="flex items-center justify-between p-3 border rounded-xl">
                                    <div class="flex items-center gap-3"><div class="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center"><i class="fas fa-university text-emerald-500"></i></div><div><div class="text-sm font-semibold">High School</div><div class="text-xs text-gray-500">Public &middot; Grades 9-12 &middot; 0.6 mi</div></div></div>
                                    <div class="text-right"><div class="text-sm font-bold text-emerald-600">7/10</div><div class="text-[10px] text-gray-400">GreatSchools</div></div>
                                </div>
                            </div>
                        </div>

                        <!-- Points of Interest -->
                        <div class="lux-card mb-4">
                            <h3 class="lux-section-title"><i class="fas fa-map-pin text-gray-400"></i> Points of Interest</h3>
                            <div class="grid grid-cols-2 gap-3">
                                <div class="flex items-center gap-3 p-3 rounded-xl border"><i class="fas fa-tree text-green-500 w-5 text-center"></i><div><div class="text-sm font-medium">Parks & Recreation</div><div class="text-xs text-gray-500">Central Park, Riverside Park</div></div></div>
                                <div class="flex items-center gap-3 p-3 rounded-xl border"><i class="fas fa-shopping-bag text-pink-500 w-5 text-center"></i><div><div class="text-sm font-medium">Shopping</div><div class="text-xs text-gray-500">Local shops & grocery</div></div></div>
                                <div class="flex items-center gap-3 p-3 rounded-xl border"><i class="fas fa-utensils text-orange-500 w-5 text-center"></i><div><div class="text-sm font-medium">Dining</div><div class="text-xs text-gray-500">Restaurants & cafes</div></div></div>
                                <div class="flex items-center gap-3 p-3 rounded-xl border"><i class="fas fa-hospital text-red-500 w-5 text-center"></i><div><div class="text-sm font-medium">Healthcare</div><div class="text-xs text-gray-500">Hospitals & clinics</div></div></div>
                            </div>
                        </div>

                        </div><!-- /detailPanelNeighborhood -->

                        <!-- ═══════════════════════════════════════════ -->
                        <!-- MEDIA TAB                                   -->
                        <!-- ═══════════════════════════════════════════ -->
                        <div id="detailPanelMedia" class="hidden">

                        <!-- Photos Gallery -->
                        <div class="lux-card mb-4">
                            <div class="flex items-center justify-between mb-4">
                                <h3 class="lux-section-title mb-0"><i class="fas fa-camera text-gray-400"></i> Photos <span class="text-xs font-normal text-gray-400 ml-2">${photos.length} total</span></h3>
                                <div class="flex items-center gap-2">
                                    <button class="lux-btn-outline text-xs"><i class="fas fa-th"></i> Grid</button>
                                    <button class="lux-btn-outline text-xs"><i class="fas fa-list"></i> List</button>
                                </div>
                            </div>
                            <div class="grid grid-cols-3 gap-4" id="detailMediaFullGrid">
                                ${(listing.images || []).map(function(img, idx) {
                                    return '<div class="lux-media-thumb cursor-pointer" onclick="openPhotoLightbox(' + idx + ')"><img src="' + img.url + '" alt="' + (img.caption || '') + '" loading="lazy"><div class="caption"><span>' + (img.caption || 'Photo ' + (idx+1)) + '</span><span class="float-right">' + (idx+1) + '/' + photos.length + '</span></div></div>';
                                }).join('')}
                            </div>
                        </div>

                        <!-- Video & Virtual Tour -->
                        <div class="grid grid-cols-2 gap-4 mb-4">
                            <div class="lux-card">
                                <h3 class="lux-section-title"><i class="fas fa-video text-blue-500"></i> Video Tour</h3>
                                ${(function() {
                                    var vids = listing._videos || [];
                                    var videoUrl = vids.length > 0 ? vids[0].url : null;
                                    if (videoUrl) {
                                        var isEmbed = /youtube\.com|youtu\.be|vimeo\.com|wistia\.com/.test(videoUrl);
                                        if (isEmbed) {
                                            return '<div class="h-48 rounded-xl overflow-hidden"><iframe src="' + videoUrl + '" class="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen title="Video Tour"></iframe></div>';
                                        } else {
                                            return '<div class="h-48 rounded-xl overflow-hidden bg-black"><video src="' + videoUrl + '" class="w-full h-full object-contain" controls playsinline preload="metadata" title="Video Tour"></video></div>';
                                        }
                                    }
                                    return '<div class="h-48 bg-gray-50 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-200"><div class="text-center text-gray-400"><i class="fas fa-play-circle text-4xl mb-2"></i><div class="text-sm">No video available</div></div></div>';
                                })()}
                            </div>
                            <div class="lux-card">
                                <h3 class="lux-section-title"><i class="fas fa-vr-cardboard text-purple-500"></i> Virtual Tour / 3D</h3>
                                ${(function() {
                                    var vtUrl = listing.virtualTourUrl || null;
                                    var vtMedia = listing._virtualTours || [];
                                    var tourUrl = vtUrl || (vtMedia.length > 0 ? vtMedia[0].url : null);
                                    if (tourUrl) {
                                        return '<div class="h-48 rounded-xl overflow-hidden"><iframe src="' + tourUrl + '" class="w-full h-full" allow="fullscreen; xr-spatial-tracking" allowfullscreen title="3D Virtual Tour"></iframe></div>';
                                    }
                                    return '<div class="h-48 bg-gray-50 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-200"><div class="text-center text-gray-400"><i class="fas fa-cube text-4xl mb-2"></i><div class="text-sm">No virtual tour available</div></div></div>';
                                })()}
                            </div>
                        </div>

                        <!-- Floor Plans -->
                        <div class="lux-card mb-4">
                            <h3 class="lux-section-title"><i class="fas fa-layer-group text-green-500"></i> Floor Plans</h3>
                            ${(function() {
                                var fps = listing._floorPlans || [];
                                if (fps.length > 0) {
                                    return '<div class="grid grid-cols-' + Math.min(fps.length, 3) + ' gap-3">' + fps.map(function(fp, idx) {
                                        return '<div class="lux-media-thumb"><img src="' + fp.url + '" alt="Floor Plan ' + (idx+1) + '" loading="lazy" class="w-full h-36 object-contain bg-white rounded-xl border"></div>';
                                    }).join('') + '</div>';
                                }
                                return '<div class="h-36 bg-gray-50 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-200"><div class="text-center text-gray-400"><i class="fas fa-drafting-compass text-3xl mb-2"></i><div class="text-sm">No floor plans uploaded</div></div></div>';
                            })()}
                        </div>

                        <!-- Documents -->
                        <div class="lux-card mb-4">
                            <h3 class="lux-section-title"><i class="fas fa-file-alt text-gray-400"></i> Documents</h3>
                            <div class="grid grid-cols-2 gap-3">
                                <div class="flex items-center gap-3 p-3.5 border rounded-xl hover:border-amber-300 transition cursor-pointer"><i class="far fa-file-pdf text-red-400 text-lg"></i><div><div class="text-sm font-medium">Building Rules</div><div class="text-[10px] text-gray-400">Request from listing agent</div></div></div>
                                <div class="flex items-center gap-3 p-3.5 border rounded-xl hover:border-amber-300 transition cursor-pointer"><i class="far fa-file-pdf text-red-400 text-lg"></i><div><div class="text-sm font-medium">Bylaws & Amendments</div><div class="text-[10px] text-gray-400">Request from listing agent</div></div></div>
                                <div class="flex items-center gap-3 p-3.5 border rounded-xl hover:border-amber-300 transition cursor-pointer"><i class="far fa-file-pdf text-red-400 text-lg"></i><div><div class="text-sm font-medium">Financial Statement</div><div class="text-[10px] text-gray-400">Request from listing agent</div></div></div>
                                <div class="flex items-center gap-3 p-3.5 border rounded-xl hover:border-amber-300 transition cursor-pointer"><i class="far fa-file-pdf text-red-400 text-lg"></i><div><div class="text-sm font-medium">Offering Plan</div><div class="text-[10px] text-gray-400">Request from listing agent</div></div></div>
                                <div class="flex items-center gap-3 p-3.5 border rounded-xl hover:border-amber-300 transition cursor-pointer"><i class="far fa-file-pdf text-red-400 text-lg"></i><div><div class="text-sm font-medium">Board Package Template</div><div class="text-[10px] text-gray-400">Request from listing agent</div></div></div>
                                <div class="flex items-center gap-3 p-3.5 border rounded-xl hover:border-amber-300 transition cursor-pointer"><i class="far fa-file-pdf text-red-400 text-lg"></i><div><div class="text-sm font-medium">Schedule A</div><div class="text-[10px] text-gray-400">Request from listing agent</div></div></div>
                            </div>
                        </div>

                        </div><!-- /detailPanelMedia -->

                    </div>

                    <!-- RIGHT sidebar -->
                    <div class="w-[280px] flex-shrink-0 detail-sidebar print:hidden">

                        <!-- ═══ Primary Actions: Email / Print / Share ═══ -->
                        <div class="flex items-center gap-1.5 mb-4">
                            <button onclick="openReportsModal(['${listing.id}'])" class="sidebar-action-primary" title="Email report to client">
                                <i class="fas fa-envelope"></i><span>Email</span>
                            </button>
                            <button onclick="openReportsModal(['${listing.id}'], 'print')" class="sidebar-action-primary" title="Print report in new tab">
                                <i class="fas fa-print"></i><span>Print</span>
                            </button>
                            <button onclick="shareListing(event, '${listing.id}')" class="sidebar-action-primary" title="Share listing link">
                                <i class="fas fa-share-alt"></i><span>Share</span>
                            </button>
                        </div>

                        <!-- ═══ Listing Agent + Showing Instructions ═══ -->
                        <div class="sidebar-card-luxury mb-4">
                            <div class="flex items-center justify-between mb-3">
                                <span class="sidebar-section-label">Listing Agent</span>
                                <span class="sidebar-badge-agent"><i class="fas fa-lock text-[7px]"></i> Agent Only</span>
                            </div>
                            <div class="text-[14px] font-bold text-gray-900 tracking-tight">${escapeHtml(listing.agentName || '---')}</div>
                            <div class="text-xs text-gray-500 mt-0.5">${escapeHtml(listing.company || '---')}</div>
                            <div class="flex items-center gap-2 mt-2 mb-2.5">
                                <span class="px-2 py-0.5 border border-gray-200 rounded-full text-[10px] text-gray-500 font-semibold">${escapeHtml(listing.listingType || 'Exclusive')}</span>
                            </div>
                            <div class="space-y-1.5">
                                ${listing.agentPhone ? '<a href="tel:' + listing.agentPhone.replace(/[^0-9+]/g, '') + '" class="sidebar-contact-link"><i class="fas fa-phone text-[9px]"></i>' + escapeHtml(listing.agentPhone) + '</a>' : ''}
                                ${listing.agentEmail ? `<button type="button" data-agent-inquiry-listing-id="${escapeHtml(String(listing.id || listing.lid || ''))}" class="sidebar-contact-link" title="Sends an audited inquiry through Mallan Real Estate (REBNY attribution + audit trail)"><i class="fas fa-envelope text-[9px]"></i>${escapeHtml(listing.agentEmail)}</button>` : ''}
                                ${listing.agentLicense ? '<div class="flex items-center gap-2 text-[11px] text-gray-400"><i class="fas fa-id-badge text-[9px]"></i>' + escapeHtml(listing.agentLicense) + '</div>' : ''}
                            </div>
                            <!-- Codex Risk P0 fix: removed direct mailto:
                                 link to listing-agent email. The link
                                 bypassed audit trail + REBNY attribution
                                 enforcement. All listing-agent contact
                                 actions now route through the audited
                                 /api/crm/agent-inquiry endpoint via the
                                 sendAgentInquiry() function (defined
                                 elsewhere in this file). -->


                            <!-- Showing Instructions (inline, no separate card) -->
                            <div class="border-t border-gray-100 mt-3 pt-3">
                                <button class="w-full flex items-center gap-2 text-left" onclick="var c=this.nextElementSibling;c.classList.toggle('hidden');var i=this.querySelector('.si-chevron');if(i){i.classList.toggle('fa-chevron-down');i.classList.toggle('fa-chevron-up');}">
                                    <i class="fas fa-eye text-gray-300 text-[10px]"></i>
                                    <span class="sidebar-section-label" style="margin:0">Showing Instructions</span>
                                    <i class="fas fa-chevron-up si-chevron ml-auto text-gray-300 text-[9px]"></i>
                                </button>
                                <div class="mt-2 text-[12px] text-gray-600 leading-relaxed">
                                    ${escapeHtml(listing.showingInstructions || '(UCOM) ' + (listing.agentName || '---') + ' ' + (listing.agentPhone || ''))}
                                </div>
                            </div>
                        </div>

                        <!-- ═══ Client Feedback ═══ -->
                        <div class="flex items-center gap-1 mb-4 pb-3 border-b border-gray-100">
                            ${clientFeedbackIcons(listing)}
                        </div>

                        <!-- ═══ Financial Tools ═══ -->
                        <div class="mb-4">
                            <div class="sidebar-section-label mb-2">Financial Tools</div>
                            <div class="grid grid-cols-2 gap-1.5">
                                <button onclick="openCalculatorModal('mortgage', '${listing.id}')" class="sidebar-tool-btn"><i class="fas fa-calculator"></i> Mortgage</button>
                                <button onclick="openCalculatorModal('closing', '${listing.id}')" class="sidebar-tool-btn"><i class="fas fa-receipt"></i> Closing Costs</button>
                                <button onclick="openCalculatorModal('cashoncash', '${listing.id}')" class="sidebar-tool-btn"><i class="fas fa-hand-holding-dollar"></i> Cash on Cash</button>
                                <button onclick="openCalculatorModal('roi', '${listing.id}')" class="sidebar-tool-btn"><i class="fas fa-chart-line"></i> ROI</button>
                                <button onclick="openCalculatorModal('rentvsbuy', '${listing.id}')" class="sidebar-tool-btn"><i class="fas fa-scale-balanced"></i> Rent vs Buy</button>
                                <button onclick="openCalculatorModal('buyvssell', '${listing.id}')" class="sidebar-tool-btn"><i class="fas fa-house-chimney"></i> Buy vs Sell</button>
                            </div>
                        </div>

                        <!-- ═══ Comments ═══ -->
                        <div class="sidebar-card-luxury mb-4">
                            <div class="flex items-center justify-between mb-2.5">
                                <span class="sidebar-section-label">Comments</span>
                                <span class="sidebar-badge-agent"><i class="fas fa-lock text-[7px]"></i> Agent Only</span>
                            </div>
                            <div class="flex gap-1 mb-2">
                                <button class="px-2.5 py-1 text-[10px] font-semibold text-gray-700 bg-gray-100 rounded-full">In-House</button>
                                <button class="px-2.5 py-1 text-[10px] font-semibold text-gray-400 hover:bg-gray-50 rounded-full transition">Personal</button>
                            </div>
                            <textarea class="w-full border border-gray-100 rounded-lg p-2.5 text-xs resize-y bg-gray-50/50 focus:bg-white focus:border-gray-300 transition placeholder:text-gray-300" rows="2" placeholder="Leave a comment..."></textarea>
                            <div class="flex justify-end mt-1.5">
                                <button class="text-[10px] text-gray-500 font-semibold hover:text-gray-900 transition"><i class="fas fa-plus text-[8px] mr-0.5"></i>Add</button>
                            </div>
                        </div>

                        <!-- ═══ Quick Actions ═══ -->
                        <div class="mb-4">
                            <div class="sidebar-section-label mb-2">Quick Actions</div>
                            <div class="grid grid-cols-2 gap-1.5">
                                <button onclick="toggleWorkingSet('${listing.id}')" class="sidebar-tool-btn" id="workingSetBtn_${listing.id}"><i class="fas fa-folder-plus"></i> ${_isInWorkingSet(listing.id) ? 'In Set' : 'Add to Set'}</button>
                                <button onclick="runCmaFromDetail()" class="sidebar-tool-btn"><i class="fas fa-chart-bar"></i> Run CMA</button>
                                <button onclick="addToCompareAndOpen('${listing.id}')" class="sidebar-tool-btn"><i class="fas fa-balance-scale"></i> Compare</button>
                                <button onclick="toggleFlag('${listing.id}')" class="sidebar-tool-btn" id="flagBtn_${listing.id}"><i class="fas fa-flag ${_isFlagged(listing.id) ? 'text-red-500' : ''}"></i> ${_isFlagged(listing.id) ? 'Flagged' : 'Flag'}</button>
                                ${isComingSoon(listing)
                                    ? '<button class="sidebar-tool-btn opacity-50 cursor-not-allowed" disabled title="Coming Soon — No showings until ' + (listing.comingSoonDate || 'active date') + ' (UCBA Art. I Sec. 16)"><i class="fas fa-ban text-purple-400"></i> Blocked</button>'
                                    : '<button onclick="openSearchScheduleShowing()" class="sidebar-tool-btn"><i class="fas fa-calendar-plus"></i> Schedule</button>'
                                }
                                <button onclick="showListingHistory()" class="sidebar-tool-btn"><i class="fas fa-history"></i> History</button>
                            </div>
                        </div>

                        <!-- Coming Soon Showing Notice -->
                        ${comingSoonShowingNotice(listing)}

                        <!-- Syndication Notice -->
                        ${syndicationBadge(listing) ? '<div class="mb-3">' + syndicationBadge(listing) + '</div>' : ''}

                        <!-- FARE Act for rentals -->
                        ${listing.listingCategory === 'rental' ? fareActDisclosure(listing) : ''}
                    </div>
                </div>

                <!-- Attribution footer -->
                <div class="text-[9px] text-gray-300 border-t pt-2 mt-4" data-rebny-attribution>Listing courtesy of ${escapeHtml(listing.company || 'REBNY RLS')} &middot; ${escapeHtml(listing.agentName || '')} &middot; Information deemed reliable but not guaranteed &middot; Equal Housing Opportunity</div>
            `;

            // Populate similar listings (neighborhood + nearby)
            var allListings = getFilteredListings(true);
            var neighborhoodListings = allListings.filter(function(l) { return l.id !== listing.id && l.neighborhood === listing.neighborhood; }).slice(0, 3);
            var nearbyListings = allListings.filter(function(l) { return l.id !== listing.id && l.neighborhood !== listing.neighborhood; }).slice(0, 3);
            var renderMiniCard = function(l) {
                var addr = l.addressDisplayYN === false ? 'Address Available Upon Request' : escapeHtml(l.address);
                var st = l.status === 'COMING_SOON' ? 'CS' : l.status;
                return '<div class="border rounded-lg overflow-hidden cursor-pointer hover:shadow-md transition-shadow" onclick="openListingInNewTab(\'' + l.id + '\')">'
                    + '<div class="h-[140px] cm-photo-wrap"><img src="' + getListingPhoto(l) + '" alt="' + addr + '" class="cm-photo" loading="lazy"></div>'
                    + '<div class="p-3"><div class="font-semibold text-sm truncate">' + addr + (l.unit ? ', ' + escapeHtml(l.unit) : '') + '</div>'
                    + '<div class="text-xs text-gray-500 mt-0.5">' + ownershipLabel(l.ownership) + ' <span class="text-gray-300">|</span> ' + escapeHtml(l.neighborhood) + '</div>'
                    + '<div class="text-xs mt-1"><strong>' + l.beds + '</strong> Beds &nbsp; <strong>' + l.baths + '</strong> Baths</div>'
                    + '<div class="flex items-center justify-between mt-2"><div class="flex items-center gap-1.5"><span class="px-1.5 py-0.5 ' + getStatusBadgeClasses(l.status) + ' rounded text-[10px] font-semibold">' + st + '</span><span class="font-bold text-sm">$' + l.price.toLocaleString() + '</span></div>'
                    + '<div class="text-[10px] text-gray-400">Listed<br>' + l.listedDate + '</div></div></div></div>';
            };
            var nhEl = document.getElementById('detailSimilarNeighborhood');
            if (nhEl) nhEl.innerHTML = neighborhoodListings.length > 0 ? neighborhoodListings.map(renderMiniCard).join('') : '<div class="col-span-3 text-center text-gray-400 text-sm py-4">No similar listings in ' + escapeHtml(listing.neighborhood) + '</div>';
            var nbEl = document.getElementById('detailSimilarNearby');
            if (nbEl) nbEl.innerHTML = nearbyListings.length > 0 ? nearbyListings.map(renderMiniCard).join('') : '<div class="col-span-3 text-center text-gray-400 text-sm py-4">No nearby listings</div>';

            document.getElementById('listingDetailPage').classList.remove('hidden');
            document.getElementById('listingDetailPage').scrollTop = 0;

            // Update hash to reflect detail view
            if (!window._suppressHashUpdate) {
                history.pushState(null, '', '#detail/' + listingId);
            }
            } catch(e) { console.error('showListingDetail error:', e); }
        }

        // Refresh video/virtual tour/floor plan sections after detail media loads
        function _refreshDetailMediaSections(listing) {
            if (!listing) return;
            // Video section
            var videoContainer = document.querySelector('#detailPanelMedia .fa-video');
            if (videoContainer) {
                var videoCard = videoContainer.closest('.lux-card');
                if (videoCard) {
                    var vids = listing._videos || [];
                    if (vids.length > 0) {
                        var videoUrl = vids[0].url;
                        var isEmbed = /youtube\.com|youtu\.be|vimeo\.com|wistia\.com/.test(videoUrl);
                        var content = videoCard.querySelector('h3').nextElementSibling;
                        if (content) {
                            content.outerHTML = isEmbed
                                ? '<div class="h-48 rounded-xl overflow-hidden"><iframe src="' + videoUrl + '" class="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>'
                                : '<div class="h-48 rounded-xl overflow-hidden bg-black"><video src="' + videoUrl + '" class="w-full h-full object-contain" controls playsinline preload="metadata"></video></div>';
                        }
                    }
                }
            }
            // Virtual Tour section
            var vtContainer = document.querySelector('#detailPanelMedia .fa-vr-cardboard');
            if (vtContainer) {
                var vtCard = vtContainer.closest('.lux-card');
                if (vtCard) {
                    var vtMedia = listing._virtualTours || [];
                    var tourUrl = listing.virtualTourUrl || (vtMedia.length > 0 ? vtMedia[0].url : null);
                    if (tourUrl) {
                        var vtContent = vtCard.querySelector('h3').nextElementSibling;
                        if (vtContent) {
                            vtContent.outerHTML = '<div class="h-48 rounded-xl overflow-hidden"><iframe src="' + tourUrl + '" class="w-full h-full" allow="fullscreen; xr-spatial-tracking" allowfullscreen></iframe></div>';
                        }
                    }
                }
            }
            // Floor Plans section
            var fpContainer = document.querySelector('#detailPanelMedia .fa-layer-group');
            if (fpContainer) {
                var fpCard = fpContainer.closest('.lux-card');
                if (fpCard) {
                    var fps = listing._floorPlans || [];
                    if (fps.length > 0) {
                        var fpContent = fpCard.querySelector('h3').nextElementSibling;
                        if (fpContent) {
                            fpContent.outerHTML = '<div class="grid grid-cols-' + Math.min(fps.length, 3) + ' gap-3">' + fps.map(function(fp, idx) {
                                return '<div class="lux-media-thumb"><img src="' + fp.url + '" alt="Floor Plan ' + (idx+1) + '" loading="lazy" class="w-full h-36 object-contain bg-white rounded-xl border"></div>';
                            }).join('') + '</div>';
                        }
                    }
                }
            }
            // Also update photo gallery if new photos arrived
            if (listing.images && listing.images.length > 0) {
                var grid = document.getElementById('detailMediaFullGrid');
                if (grid) {
                    grid.innerHTML = listing.images.map(function(img, idx) {
                        return '<div class="lux-media-thumb cursor-pointer" onclick="openPhotoLightbox(' + idx + ')"><img src="' + img.url + '" alt="' + (img.caption || '') + '" loading="lazy"><div class="caption"><span>' + (img.caption || 'Photo ' + (idx+1)) + '</span><span class="float-right">' + (idx+1) + '/' + listing.images.length + '</span></div></div>';
                    }).join('');
                }
                // Update main photo if still on placeholder
                var mainImg = document.getElementById('detailMainPhotoImg');
                if (mainImg && mainImg.src && mainImg.src.indexOf('data:image/svg') !== -1) {
                    mainImg.src = listing.images[0].url;
                }
            }
        }

        function closeListingDetail() {
            document.getElementById('listingDetailPage').classList.add('hidden');
            _detailCurrentId = null;

            // Restore the results UI. Two arrival paths land here:
            //   1. In-page nav (click listing in results → showListingDetail).
            //      searchResultsSection stays in DOM behind the detail layer
            //      and re-showing it is idempotent.
            //   2. Direct URL paste of /crm/search#detail/X — init-hash-routing
            //      explicitly hides searchResultsSection at line 64; we MUST
            //      re-show it here or the user gets a blank page.
            //
            // Also re-render to ensure the cards + count badge are populated:
            // before this fix closeListingDetail only called pushState('#results')
            // which does NOT trigger the hashchange handler that would have
            // restored the UI. Without that the user landed on a hidden-results
            // section and an unhidden form, looking like the search was lost.
            var searchResultsSection = document.getElementById('searchResultsSection');
            var searchFormContainer = document.getElementById('searchFormContainer');

            var hasResults =
                typeof searchResultsState !== 'undefined' &&
                searchResultsState &&
                Array.isArray(searchResultsState.filteredListings) &&
                searchResultsState.filteredListings.length > 0;

            // Fallback to sessionStorage-cached state if in-memory was cleared.
            if (!hasResults && typeof _restoreSearchState === 'function') {
                if (_restoreSearchState()) {
                    hasResults =
                        typeof searchResultsState !== 'undefined' &&
                        searchResultsState &&
                        Array.isArray(searchResultsState.filteredListings) &&
                        searchResultsState.filteredListings.length > 0;
                }
            }

            if (hasResults) {
                if (searchResultsSection) {
                    searchResultsSection.style.display = 'block';
                    searchResultsSection.classList.remove('hidden');
                }
                if (searchFormContainer) searchFormContainer.style.display = 'none';
                if (typeof initializeSearchResults === 'function') initializeSearchResults();
                if (typeof updateResultsCount === 'function') updateResultsCount();
                history.pushState(null, '', '#results');
            } else {
                // No results to return to (true standalone detail / cleared state)
                // — fall back to the search form rather than leave a blank screen.
                if (searchResultsSection) searchResultsSection.style.display = 'none';
                if (searchFormContainer) searchFormContainer.style.display = 'block';
                history.pushState(null, '', '#main');
            }
        }

        // ── Build mailto body with listing thumbnail for agent inquiry ──
        // P0-B email-pipeline mandate (2026-05-04): minimum body must
        // include RLS ID, address/unit, price/status, listing link,
        // sender contact, brokerage identity, REBNY/IDX attribution.
        // Audit trail (server-side persistence of every send) is a
        // separate batch — would require new /api/crm/agent-inquiry
        // route. This function only updates body content.
        function buildAgentMailtoBody(listing) {
            var addr = (listing.address || '') + (listing.unit ? ', ' + listing.unit : '');
            var nbhd = listing.neighborhood || '';
            var borough = listing.borough || 'Manhattan';
            var price = '$' + Number(listing.price || 0).toLocaleString();
            var beds = listing.beds === 0 ? 'Studio' : (listing.beds || '—') + ' Bed';
            var baths = (listing.baths || '—') + ' Bath';
            var sqft = listing.intSqft ? listing.intSqft.toLocaleString() + ' SF' : '';
            var isSale = listing.listingCategory !== 'rental';
            var slug = addr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            var url = 'https://mallan.nyc/' + (isSale ? 'buy' : 'rent') + '/' + slug + '-' + listing.id;
            // RLS ID = ListingId (REBNY canonical); fall back to internal id
            var rlsId = listing.lid || listing.id || '';
            // Status — render the canonical mapped status (post-A14
            // mapper exhaustiveness guarantees no "OFF MARKET" string).
            var status = listing.status || 'ACTIVE';
            var statusLabel = status === 'COMING_SOON' ? 'Coming Soon'
                : status === 'PENDING' ? 'In Contract'
                : status.charAt(0) + status.slice(1).toLowerCase();
            var agent = typeof AGENT_PROFILE !== 'undefined' ? AGENT_PROFILE : {};
            var fromName = agent.name || '';
            var fromTitle = agent.licenseTitle || agent.title || 'Licensed Real Estate Broker';
            var fromCompany = agent.company || 'Mallan Real Estate Inc.';
            var fromPhone = agent.phone || '';
            var fromEmail = agent.email || '';
            var brokerageLicense = agent.brokerageLicense || '#10991205323';
            var brokerageAddress = agent.brokerageAddress || '400 East 90th Street, Suite 17C, New York, NY 10128';

            return 'Agent Inquiry — ' + addr + '\n' +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
                'RLS ID: ' + rlsId + '\n' +
                addr + '\n' +
                nbhd + ', ' + borough + '\n' +
                price + '  |  ' + beds + '  |  ' + baths + (sqft ? '  |  ' + sqft : '') + '\n' +
                'Status: ' + statusLabel + '\n\n' +
                'View Listing: ' + url + '\n\n' +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                'From: ' + fromName + '\n' +
                fromTitle + '\n' +
                fromCompany + ' · License ' + brokerageLicense + '\n' +
                brokerageAddress + '\n' +
                fromPhone + (fromEmail ? ' · ' + fromEmail : '') + '\n\n' +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
                'Listing data via REBNY RLS / IDX Plus (Cotality/Trestle).\n' +
                'Mallan Real Estate Inc. is a participating broker.\n';
        }

        // ── Share listing link (copy or native share) ──
        function shareListing(e, listingId) {
            var listing = listings.find(function(l) { return l.id == listingId; });
            if (!listing) return;
            var addr = (listing.address || '') + (listing.unit ? ', ' + listing.unit : '');
            var isSale = listing.listingCategory !== 'rental';
            var slug = addr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            var url = 'https://mallan.nyc/' + (isSale ? 'buy' : 'rent') + '/' + slug + '-' + listing.id;
            var title = addr + ' — $' + Number(listing.price || 0).toLocaleString();

            if (navigator.share) {
                navigator.share({ title: title, url: url }).catch(function() {});
            } else if (navigator.clipboard) {
                navigator.clipboard.writeText(url).then(function() {
                    var btn = e && e.currentTarget;
                    if (btn) { var orig = btn.innerHTML; btn.innerHTML = '<i class="fas fa-check text-[11px]"></i> Copied'; setTimeout(function() { btn.innerHTML = orig; }, 1500); }
                });
            }
        }

        // ── Send Agent Inquiry — emails the listing agent directly from the system ──
        function sendAgentInquiry(listingId) {
            listingId = String(listingId || '');
            var listing = listings.find(function(l) {
                return String(l.id || '') === listingId || String(l.lid || '') === listingId;
            });
            if (!listing) { showToast('Listing not found.', 'error'); return; }
            var listingAddr = listing.address + (listing.unit ? ', ' + listing.unit : '');
            var listingAgentName = listing.agentName || 'Listing Agent';
            var listingAgentEmail = listing.agentEmail || '';

            if (!listingAgentEmail) {
                showToast('No email address available for the listing agent (' + listingAgentName + '). Contact information may not be provided for this listing.', 'warning');
                return;
            }

            var isSale = listing.listingCategory !== 'rental';
            var listingSlug = listingAddr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            var listingUrl = 'https://mallan.nyc/' + (isSale ? 'buy' : 'rent') + '/' + listingSlug + '-' + listing.id;
            // P2 — Server-authoritative path via /api/crm/agent-inquiry.
            // Replaces the prior client-side mailto / sendEmailDirect path
            // which had no audit trail and no REBNY attribution. The route:
            //   - validates body fields server-side
            //   - builds the email HTML server-side (REBNY footer, brokerage
            //     identity, RLS ID, status label) — frontend cannot inject
            //   - sends via lib/email/sendgrid.ts with SMTP fail-loud
            //   - writes an AuditEvent row regardless of success/failure
            //   - returns 503 in production when SMTP is not configured
            // Sender identity comes from the broker session (not the body)
            // so an agent cannot forge a from_* field.
            //
            // We pass listing context fields the server uses to construct the
            // final HTML. The `html` variable above is no longer used — kept
            // built so the function still has a stable shape and can be
            // re-introduced if the operator wants a client-side preview.
            fetch('/api/crm/agent-inquiry', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    listing_id: listing.lid || listing.id,
                    listing_address: listing.address || '',
                    listing_unit: listing.unit || null,
                    listing_price: Number(listing.price || 0),
                    listing_status: listing.status || 'ACTIVE',
                    listing_url: listingUrl,
                    listing_neighborhood: listing.neighborhood || null,
                    listing_borough: listing.borough || 'Manhattan',
                    listing_zip: listing.zip || null,
                    agent_email: listingAgentEmail,
                    agent_name: listingAgentName,
                    message: 'I am writing to request information about the following listing, including availability for showings.',
                }),
            }).then(function (res) {
                return res.json().then(function (data) { return { status: res.status, body: data }; });
            }).then(function (result) {
                if (result.status === 200 && result.body.success) {
                    showToast('Inquiry sent to ' + listingAgentName + '.', 'success');
                } else if (result.status === 503 && result.body.code === 'SMTP_NOT_CONFIGURED') {
                    showToast('Email service unavailable. Inquiry recorded — reference ' + result.body.listingId + '.', 'warning');
                } else {
                    showToast('Could not send inquiry: ' + (result.body.error || ('HTTP ' + result.status)), 'error');
                }
            }).catch(function (err) {
                showToast('Network error sending inquiry: ' + (err && err.message ? err.message : 'unknown'), 'error');
            });
        }

        if (typeof document !== 'undefined' && !window.__mallanAgentInquiryDelegated) {
            window.__mallanAgentInquiryDelegated = true;
            document.addEventListener('click', function (event) {
                var target = event.target && event.target.closest
                    ? event.target.closest('[data-agent-inquiry-listing-id]')
                    : null;
                if (!target) return;
                event.preventDefault();
                sendAgentInquiry(target.getAttribute('data-agent-inquiry-listing-id'));
            });
        }

        function detailSetPhoto(idx) {
            var listing = listings.find(l => l.id === _detailCurrentId);
            if (!listing || !listing.images) return;
            _detailPhotoIdx = idx;
            var img = document.getElementById('detailMainPhotoImg');
            if (img && listing.images[idx]) img.src = listing.images[idx].url;
            var counter = document.getElementById('detailPhotoCounter');
            if (counter) counter.textContent = (idx + 1) + ' / ' + listing.images.length;
        }

        function detailPhotoPrev() {
            var listing = listings.find(l => l.id === _detailCurrentId);
            if (!listing || !listing.images) return;
            _detailPhotoIdx = (_detailPhotoIdx - 1 + listing.images.length) % listing.images.length;
            detailSetPhoto(_detailPhotoIdx);
        }

        function detailPhotoNext() {
            var listing = listings.find(l => l.id === _detailCurrentId);
            if (!listing || !listing.images) return;
            _detailPhotoIdx = (_detailPhotoIdx + 1) % listing.images.length;
            detailSetPhoto(_detailPhotoIdx);
        }

        // ── Photo Lightbox — full-screen photo viewer ──
        var _lightboxIdx = 0;

        function openPhotoLightbox(idx) {
            var listing = listings.find(function(l) { return l.id === _detailCurrentId; });
            if (!listing || !listing.images || !listing.images.length) return;
            _lightboxIdx = idx || 0;

            // Create lightbox if it doesn't exist
            var lb = document.getElementById('photoLightbox');
            if (!lb) {
                lb = document.createElement('div');
                lb.id = 'photoLightbox';
                lb.className = 'photo-lightbox';
                lb.innerHTML =
                    '<div class="photo-lightbox-backdrop" onclick="closePhotoLightbox()"></div>' +
                    '<div class="photo-lightbox-content">' +
                        '<img id="lightboxImg" src="" alt="" class="photo-lightbox-img">' +
                        '<div class="photo-lightbox-caption" id="lightboxCaption"></div>' +
                    '</div>' +
                    '<button onclick="closePhotoLightbox()" class="photo-lightbox-close"><i class="fas fa-times"></i></button>' +
                    '<button onclick="lightboxPrev()" class="photo-lightbox-nav photo-lightbox-prev"><i class="fas fa-chevron-left"></i></button>' +
                    '<button onclick="lightboxNext()" class="photo-lightbox-nav photo-lightbox-next"><i class="fas fa-chevron-right"></i></button>' +
                    '<div class="photo-lightbox-counter" id="lightboxCounter"></div>' +
                    '<div class="photo-lightbox-strip" id="lightboxStrip"></div>';
                document.body.appendChild(lb);
            }

            // Build thumbnail strip
            var strip = document.getElementById('lightboxStrip');
            if (strip) {
                var stripHtml = '';
                listing.images.forEach(function(img, i) {
                    stripHtml += '<div class="photo-lightbox-thumb' + (i === _lightboxIdx ? ' active' : '') + '" onclick="lightboxGoTo(' + i + ')">' +
                        '<img src="' + img.url + '" alt="' + (img.caption || '') + '">' +
                    '</div>';
                });
                strip.innerHTML = stripHtml;
            }

            updateLightbox(listing);
            lb.classList.add('open');
            document.body.style.overflow = 'hidden';

            // Keyboard listener
            document.addEventListener('keydown', lightboxKeyHandler);
        }

        function updateLightbox(listing) {
            if (!listing) listing = listings.find(function(l) { return l.id === _detailCurrentId; });
            if (!listing || !listing.images) return;
            var img = listing.images[_lightboxIdx];
            if (!img) return;
            var lbImg = document.getElementById('lightboxImg');
            var lbCaption = document.getElementById('lightboxCaption');
            var lbCounter = document.getElementById('lightboxCounter');
            if (lbImg) lbImg.src = img.url;
            if (lbCaption) lbCaption.textContent = img.caption || '';
            if (lbCounter) lbCounter.textContent = (_lightboxIdx + 1) + ' / ' + listing.images.length;

            // Update strip active state
            var thumbs = document.querySelectorAll('#lightboxStrip .photo-lightbox-thumb');
            thumbs.forEach(function(t, i) {
                t.classList.toggle('active', i === _lightboxIdx);
            });

            // Scroll active thumb into view
            if (thumbs[_lightboxIdx]) {
                thumbs[_lightboxIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }

        function lightboxPrev() {
            var listing = listings.find(function(l) { return l.id === _detailCurrentId; });
            if (!listing || !listing.images) return;
            _lightboxIdx = (_lightboxIdx - 1 + listing.images.length) % listing.images.length;
            updateLightbox(listing);
        }

        function lightboxNext() {
            var listing = listings.find(function(l) { return l.id === _detailCurrentId; });
            if (!listing || !listing.images) return;
            _lightboxIdx = (_lightboxIdx + 1) % listing.images.length;
            updateLightbox(listing);
        }

        function lightboxGoTo(idx) {
            _lightboxIdx = idx;
            updateLightbox();
        }

        function closePhotoLightbox() {
            var lb = document.getElementById('photoLightbox');
            if (lb) lb.classList.remove('open');
            document.body.style.overflow = '';
            document.removeEventListener('keydown', lightboxKeyHandler);
        }

        function lightboxKeyHandler(e) {
            if (e.key === 'Escape') closePhotoLightbox();
            if (e.key === 'ArrowLeft') lightboxPrev();
            if (e.key === 'ArrowRight') lightboxNext();
        }

        function detailPanelPrev() {
            var listings = (typeof getFilteredListings === 'function') ? getFilteredListings() : [];
            var idx = listings.findIndex(function(l) { return l.id === _detailCurrentId; });
            if (idx > 0) showListingDetail(listings[idx - 1].id);
        }

        function detailPanelNext() {
            var listings = (typeof getFilteredListings === 'function') ? getFilteredListings() : [];
            var idx = listings.findIndex(function(l) { return l.id === _detailCurrentId; });
            if (idx >= 0 && idx < listings.length - 1) showListingDetail(listings[idx + 1].id);
        }

        // Toggle Prev/Next listing button visibility + disabled state
        // based on the current filteredListings position. Called from
        // showListingDetail (P0-A, 2026-05-04). Spec: buttons must be
        // visible AND reliable when more than one listing in the
        // current result set.
        //
        //   length <= 1   → hide separator + both buttons (no nav target)
        //   idx === 0     → show buttons, disable Prev visually
        //   idx === last  → show buttons, disable Next visually
        //   middle        → both enabled
        //
        // Uses opacity-50 + pointer-events:none for the visually-disabled
        // state (matches the dead-control pattern from Batch 3 init-
        // disable-dead-controls.js). Tooltips clarify the disabled cause.
        function _updateDetailNavButtons() {
            var sep = document.getElementById('detailNavSep');
            var prevBtn = document.getElementById('detailPrevBtn');
            var nextBtn = document.getElementById('detailNextBtn');
            if (!prevBtn || !nextBtn) return;

            var listings = (typeof getFilteredListings === 'function') ? getFilteredListings() : [];
            var total = listings.length;
            var idx = listings.findIndex(function(l) { return l.id === _detailCurrentId; });

            // Single-listing or empty result set — hide entirely.
            if (total <= 1 || idx < 0) {
                if (sep) sep.style.display = 'none';
                prevBtn.style.display = 'none';
                nextBtn.style.display = 'none';
                return;
            }

            // Result set has > 1 listing — show buttons.
            if (sep) sep.style.display = '';
            prevBtn.style.display = '';
            nextBtn.style.display = '';

            // Prev — disable visually at the first listing.
            if (idx === 0) {
                prevBtn.classList.add('opacity-50', 'pointer-events-none');
                prevBtn.title = 'No previous listing';
                prevBtn.setAttribute('aria-disabled', 'true');
            } else {
                prevBtn.classList.remove('opacity-50', 'pointer-events-none');
                prevBtn.title = 'Previous listing (' + idx + ' of ' + total + ')';
                prevBtn.removeAttribute('aria-disabled');
            }

            // Next — disable visually at the last listing.
            if (idx === total - 1) {
                nextBtn.classList.add('opacity-50', 'pointer-events-none');
                nextBtn.title = 'No next listing';
                nextBtn.setAttribute('aria-disabled', 'true');
            } else {
                nextBtn.classList.remove('opacity-50', 'pointer-events-none');
                nextBtn.title = 'Next listing (' + (idx + 2) + ' of ' + total + ')';
                nextBtn.removeAttribute('aria-disabled');
            }
        }

        function detailSwitchTab(tab) {
            _detailActiveTab = tab;
            var tabs = ['overview', 'details', 'building', 'neighborhood', 'media'];
            tabs.forEach(function(t) {
                var panel = document.getElementById('detailPanel' + t.charAt(0).toUpperCase() + t.slice(1));
                var btn = document.getElementById('detailTab' + t.charAt(0).toUpperCase() + t.slice(1));
                if (panel) panel.classList.toggle('hidden', t !== tab);
                if (btn) {
                    if (t === tab) {
                        btn.className = 'detail-tab active';
                    } else {
                        btn.className = 'detail-tab';
                    }
                }
            });
            // Also show/hide History panel (it's inside Details area but separate)
            var historyPanel = document.getElementById('detailPanelHistory');
            if (historyPanel) historyPanel.classList.toggle('hidden', tab !== 'details');

            // Start/stop live transit refresh
            if (tab === 'neighborhood') {
                startTransitRefresh();
            } else if (_transitRefreshTimer) {
                clearInterval(_transitRefreshTimer);
                _transitRefreshTimer = null;
            }
        }

        // Legacy aliases for backward compatibility
        function detailSwitchMainTab(tab) {
            var map = { 'listing': 'overview', 'building': 'building', 'neighborhood': 'neighborhood', 'media': 'media' };
            detailSwitchTab(map[tab] || tab);
        }
        function detailSwitchSubTab(tab) {
            if (tab === 'general') detailSwitchTab('overview');
            else if (tab === 'details') detailSwitchTab('details');
            else if (tab === 'history') {
                // Show details panel but also toggle to history
                detailSwitchTab('details');
            }
        }

        function detailToggleEmpty() {
            var hide = document.getElementById('detailHideEmpty') && document.getElementById('detailHideEmpty').checked;
            var detailsDiv = document.getElementById('detailPanelDetails');
            if (!detailsDiv) return;
            var rows = detailsDiv.querySelectorAll('.flex.justify-between');
            rows.forEach(function(row) {
                var val = row.querySelector('.font-semibold');
                if (val && (val.textContent.trim() === '---' || val.textContent.trim() === '--' || val.textContent.trim() === '—')) {
                    row.style.display = hide ? 'none' : '';
                }
            });
        }

        function printListingDetail() {
            var listing = listings.find(function(l) { return l.id === _detailCurrentId; });
            if (!listing) return;
            var isSale = listing.listingCategory !== 'rental';
            var displayAddress = listing.addressDisplayYN === false ? 'Address Available Upon Request' : listing.address;
            var displayUnit = listing.addressDisplayYN !== false && listing.unit ? ', ' + listing.unit : '';
            var statusLabel = listing.status === 'COMING_SOON' ? 'COMING SOON' : listing.status;
            var today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            var primaryPhoto = listing.images && listing.images[0] ? listing.images[0].url : '';

            var _agent = typeof AGENT_PROFILE !== 'undefined' ? AGENT_PROFILE : { name: '', licenseTitle: 'Licensed Real Estate Broker', phone: '', email: '', company: '', companyLicense: '', license: '', address: '' };

            // Build full HTML string (CSP-safe — no document.write)
            var h = '<!DOCTYPE html><html><head><title>' + displayAddress + displayUnit + ' — Listing Detail</title>';
            h += '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">';
            h += '<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">';
            h += '<style>';
            h += '*{margin:0;padding:0;box-sizing:border-box}body{font-family:Manrope,sans-serif;color:#1a1a1a;padding:0;background:#fff}';
            h += '.print-page{max-width:780px;margin:0 auto;padding:32px 36px}';
            h += '.gold{color:#B8860B}.gold-bg{background:#B8860B}';
            h += '.print-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #B8860B;padding-bottom:16px;margin-bottom:24px}';
            h += '.print-brand{font-size:24px;font-weight:800;color:#1a1a1a}.print-brand span{color:#B8860B}';
            h += '.agent-block{text-align:right;font-size:12px;line-height:1.6}.agent-block strong{font-size:13px}';
            h += '.dual-agent{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;padding:16px;background:#faf8f5;border-radius:8px;border:1px solid #e8e0d4}';
            h += '.dual-agent .label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#B8860B;margin-bottom:4px}';
            h += '.dual-agent .name{font-size:14px;font-weight:700}.dual-agent .info{font-size:12px;color:#555;line-height:1.5}';
            h += '.print-hero{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px}';
            h += '.print-photo{width:100%;height:280px;object-fit:cover;border-radius:8px;filter:contrast(1.05) brightness(1.03)}';
            h += '.print-title{font-size:22px;font-weight:800;margin-bottom:2px}.print-subtitle{font-size:13px;color:#666;margin-bottom:12px}';
            h += '.print-price{font-size:28px;font-weight:800;color:#1a1a1a}.print-price-sub{font-size:12px;color:#666;margin-top:2px}';
            h += '.print-specs{display:flex;gap:16px;font-size:14px;margin:12px 0;padding:10px 0;border-top:1px solid #eee;border-bottom:1px solid #eee}';
            h += '.print-specs span{display:flex;align-items:center;gap:6px}.print-specs strong{font-size:16px}';
            h += '.print-status-bar{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;padding:12px 16px;background:#f8fafc;border-left:3px solid #B8860B;border-radius:0 8px 8px 0;margin-bottom:20px;font-size:12px}';
            h += '.print-status-bar .label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:2px}';
            h += '.print-section{margin-bottom:20px}.print-section h3{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#B8860B;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #f0ebe0}';
            h += '.print-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 24px;font-size:12px}';
            h += '.pf{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f5f5f5}.pf span:first-child{color:#777}.pf span:last-child{font-weight:600}';
            h += '.print-desc{font-size:13px;line-height:1.7;color:#444;margin-bottom:20px}';
            h += '.amenities-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}';
            h += '.amenity-pill{padding:5px 12px;border:1px solid #ddd;border-radius:20px;font-size:11px;font-weight:600;color:#555}';
            h += '.print-footer{border-top:2px solid #B8860B;padding-top:12px;margin-top:24px;font-size:9px;color:#999;text-align:center;line-height:1.6}';
            h += '.print-footer .eho{display:inline-block;margin-left:8px;font-weight:700}';
            h += '.print-ref{font-size:10px;color:#999;margin-top:8px;text-align:center}';
            h += '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.print-page{max-width:100%!important;padding:0!important;margin:0!important}.print-toolbar{display:none!important}.print-hero{grid-template-columns:1fr 1fr!important;gap:16px!important}.print-photo{height:220px!important}.print-grid{grid-template-columns:1fr 1fr!important;gap:4px 16px!important}.print-section{page-break-inside:avoid;margin-bottom:14px!important}.dual-agent{page-break-inside:avoid}.print-desc{page-break-inside:avoid}.print-footer{page-break-inside:avoid}.print-title{font-size:18px!important}.print-price{font-size:22px!important}@page{margin:0.4in 0.5in}}';
            h += '</style></head><body>';
            h += '<div class="print-page">';

            // Header with branding
            h += '<div class="print-header"><div><div class="print-brand">mallan<span>.nyc</span></div><div style="font-size:11px;color:#888;margin-top:2px">' + _agent.company + ' &middot; ' + (_agent.licenseTitle || _agent.title || 'Licensed Real Estate Broker') + '</div></div><div class="agent-block"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#B8860B">Prepared</div><div>' + today + '</div></div></div>';

            // Dual agent blocks — prepared by (our agent) + listing agent (from RLS)
            h += '<div class="dual-agent">';
            h += '<div><div class="label">Prepared By</div><div class="name">' + _agent.name + '</div><div class="info">' + (_agent.licenseTitle || _agent.title || 'Licensed Real Estate Broker') + '<br>' + _agent.company + ' &middot; Lic. ' + (_agent.companyLicense || '') + '<br>' + (_agent.address || '') + '<br>' + _agent.phone + ' &middot; ' + _agent.email + '<br>' + (_agent.license ? 'License ' + _agent.license : '') + '</div></div>';
            h += '<div><div class="label">Listing Agent</div><div class="name">' + escapeHtml(listing.agentName || '---') + '</div><div class="info">' + escapeHtml(listing.company || '---') + '<br>' + escapeHtml(listing.agentPhone || '') + (listing.agentEmail ? ' &middot; ' + escapeHtml(listing.agentEmail) : '') + '<br>' + escapeHtml(listing.listingType || 'Exclusive') + '</div></div>';
            h += '</div>';

            // Hero: photo + title/price
            h += '<div class="print-hero">';
            if (primaryPhoto) h += '<img class="print-photo" src="' + primaryPhoto + '" alt="' + displayAddress + '">';
            else h += '<div style="width:100%;height:280px;background:#f0f0f0;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#ccc"><i class="fas fa-camera" style="font-size:48px"></i></div>';
            h += '<div style="display:flex;flex-direction:column;justify-content:center">';
            h += '<div class="print-title">' + displayAddress + displayUnit + '</div>';
            h += '<div class="print-subtitle">' + escapeHtml(listing.era || '') + ' &middot; ' + ownershipLabel(listing.ownership) + ' &middot; ' + escapeHtml(listing.neighborhood) + ', NY ' + escapeHtml(listing.zip) + '</div>';
            h += '<div class="print-price">$' + listing.price.toLocaleString() + '</div>';
            h += '<div class="print-price-sub">' + (isSale ? 'Maint/CC: $' + listing.maintCC.toLocaleString() + '/mo' : 'Monthly Rent') + ' &middot; Est. Monthly: $' + listing.totalMonthly.toLocaleString() + '</div>';
            h += '<div class="print-specs"><span><strong>' + listing.rooms + '</strong> Rooms</span><span><strong>' + listing.beds + '</strong> Beds</span><span><strong>' + listing.baths + '</strong> Baths</span><span><strong>' + (listing.intSqft ? listing.intSqft.toLocaleString() : '---') + '</strong> SqFt</span></div>';
            h += '<div style="display:flex;gap:8px;margin-top:4px"><span style="padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;background:#dbeafe;color:#1d4ed8">' + statusLabel + '</span><span style="padding:3px 10px;border-radius:4px;font-size:11px;font-weight:600;border:1px solid #ddd;color:#666">L-ID: ' + (listing.lid || '---') + '</span><span style="padding:3px 10px;border-radius:4px;font-size:11px;font-weight:600;border:1px solid #ddd;color:#666">W-ID: ' + (listing.wid || '---') + '</span></div>';
            h += '</div></div>';

            // Status bar
            h += '<div class="print-status-bar"><div><div class="label">Status</div><strong>' + statusLabel + '</strong></div><div><div class="label">Updated</div><strong>' + (listing.updatedDate || '---') + '</strong></div><div><div class="label">Listed</div><strong>' + listing.listedDate + '</strong></div><div><div class="label">DOM</div><strong>' + listing.dom + '</strong></div><div><div class="label">CDOM</div><strong>' + (listing.cdom || listing.dom) + '</strong></div></div>';

            // Description
            if (listing.description) h += '<div class="print-desc">' + escapeHtml(listing.description) + '</div>';

            // Financial Details
            h += '<div class="print-section"><h3><i class="fas fa-dollar-sign" style="margin-right:6px"></i> Financial</h3><div class="print-grid">';
            h += '<div class="pf"><span>' + (isSale ? 'List Price' : 'Monthly Rent') + '</span><span>$' + listing.price.toLocaleString() + '</span></div>';
            if (listing.originalPrice) h += '<div class="pf"><span>Original Price</span><span>$' + listing.originalPrice.toLocaleString() + '</span></div>';
            h += '<div class="pf"><span>' + (isSale ? 'Maint/CC' : 'Net Effective') + '</span><span>$' + listing.maintCC.toLocaleString() + '</span></div>';
            h += '<div class="pf"><span>RE Taxes</span><span>' + (listing.reTaxes ? '$' + listing.reTaxes.toLocaleString() + '/mo' : '---') + '</span></div>';
            h += '<div class="pf"><span>Est. Monthly</span><span>$' + listing.totalMonthly.toLocaleString() + '</span></div>';
            h += '<div class="pf"><span>$/SqFt</span><span>' + (listing.intSqft ? '$' + Math.round(listing.price / listing.intSqft).toLocaleString() : '---') + '</span></div>';
            h += '</div></div>';

            // Unit Details
            h += '<div class="print-section"><h3><i class="fas fa-door-open" style="margin-right:6px"></i> Unit Details</h3><div class="print-grid">';
            h += '<div class="pf"><span>Type</span><span>' + (listing.propertySubType || '---') + '</span></div>';
            h += '<div class="pf"><span>Rooms</span><span>' + (listing.rooms || '---') + '</span></div>';
            h += '<div class="pf"><span>Bedrooms</span><span>' + listing.beds + '</span></div>';
            h += '<div class="pf"><span>Full Baths</span><span>' + (listing.fullBaths || listing.baths) + '</span></div>';
            h += '<div class="pf"><span>Half Baths</span><span>' + (listing.halfBaths || 0) + '</span></div>';
            h += '<div class="pf"><span>Int. SqFt</span><span>' + (listing.intSqft ? listing.intSqft.toLocaleString() : '---') + '</span></div>';
            h += '<div class="pf"><span>Floor</span><span>' + (listing.floor || '---') + '</span></div>';
            h += '<div class="pf"><span>Exposure</span><span>' + (listing.exposures || '---') + '</span></div>';
            h += '<div class="pf"><span>Condition</span><span>' + (listing.condition || '---') + '</span></div>';
            h += '</div></div>';

            // Building
            h += '<div class="print-section"><h3><i class="fas fa-building" style="margin-right:6px"></i> Building</h3><div class="print-grid">';
            h += '<div class="pf"><span>Building</span><span>' + (listing.buildingName || '---') + '</span></div>';
            h += '<div class="pf"><span>Ownership</span><span>' + ownershipLabel(listing.ownership) + '</span></div>';
            h += '<div class="pf"><span>Era</span><span>' + (listing.era || '---') + '</span></div>';
            h += '<div class="pf"><span>Year Built</span><span>' + (listing.yearBuilt || '---') + '</span></div>';
            h += '<div class="pf"><span>Neighborhood</span><span>' + listing.neighborhood + '</span></div>';
            h += '<div class="pf"><span>Cross Street</span><span>' + (listing.crossStreet || '---') + '</span></div>';
            h += '</div></div>';

            // Showing Instructions
            h += '<div class="print-section"><h3><i class="fas fa-eye" style="margin-right:6px"></i> Showing Instructions</h3><div style="font-size:13px;color:#444">' + (listing.showingInstructions || '(UCOM) ' + (listing.agentName || '') + ' ' + (listing.agentPhone || '')) + '</div></div>';

            // Reference line
            h += '<div class="print-ref">Reference: L-ID ' + (listing.lid || '---') + ' &middot; W-ID ' + (listing.wid || '---') + ' &middot; SourceSystemKey ' + (listing.wid || listing.lid || listing.id) + '</div>';

            // Footer
            h += '<div class="print-footer">Listing data courtesy of the REBNY Listing Service (RLS) via Trestle &middot; ' + _agent.company + ' ' + (_agent.companyLicense || '') + ' &middot; Information deemed reliable but not guaranteed<br>&copy; ' + new Date().getFullYear() + ' ' + _agent.company + ' &middot; ' + (_agent.address || '') + (_agent.phone ? ' &middot; ' + _agent.phone : '') + '<br>' + _agent.name + ', ' + (_agent.licenseTitle || _agent.title || 'Licensed Real Estate Broker') + (_agent.license ? ' &middot; Lic. ' + _agent.license : '') + '<span class="eho">&bull; Equal Housing Opportunity</span></div>';

            // Toolbar (hidden when printing)
            h += '<div class="print-toolbar" style="position:sticky;top:0;z-index:100;background:#1e293b;padding:10px 20px;display:flex;align-items:center;gap:16px;font-family:Manrope,sans-serif;margin:-32px -36px 20px -36px"><span style="color:#fff;font-weight:700;font-size:15px">' + displayAddress + displayUnit + '</span><span style="flex:1"></span><button onclick="window.print()" style="background:#2563eb;color:#fff;border:none;padding:8px 20px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px"><i class="fas fa-print"></i> Print</button><button onclick="window.close()" style="background:#475569;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-size:14px;cursor:pointer">Close</button></div>';
            h += '</div></body></html>';

            // Open via Blob URL (CSP-safe)
            openPrintableWindow(h);
        }

        function emailListingDetail() {
            var listing = listings.find(function(l) { return l.id === _detailCurrentId; });
            if (!listing) return;

            // REBNY compliance gate — do not email non-displayable listings
            if (listing.ownerOptOut === true || listing.internetDisplayYN === false) {
                showToast('This listing cannot be shared — owner has opted out of display.', 'error');
                return;
            }

            var _agent = typeof AGENT_PROFILE !== 'undefined' ? AGENT_PROFILE : { name: '', licenseTitle: 'Licensed Real Estate Broker', phone: '', email: '', company: 'Mallan Real Estate Inc.', companyLicense: '#10991205323', license: '' };
            var displayAddress = listing.addressDisplayYN === false ? 'Address Available Upon Request' : listing.address;
            var displayUnit = listing.addressDisplayYN !== false && listing.unit ? ', ' + listing.unit : '';
            var subject = encodeURIComponent(displayAddress + displayUnit + ' — $' + listing.price.toLocaleString() + ' — ' + listing.beds + 'BR/' + listing.baths + 'BA');

            // Use sending agent info, NOT listing agent — per UCBA Art. I Sec. 5(C)
            var agentBlock = _agent.name + '\n' +
                (_agent.licenseTitle || 'Licensed Real Estate Salesperson') + '\n' +
                (_agent.company || 'Mallan Real Estate Inc.') + '\n' +
                (_agent.phone ? 'Phone: ' + _agent.phone + '\n' : '') +
                (_agent.email ? 'Email: ' + _agent.email + '\n' : '') +
                '\nEqual Housing Opportunity';

            var body = encodeURIComponent('Hi,\n\nPlease see the following listing:\n\n' + displayAddress + displayUnit + '\n' + listing.neighborhood + ', NY ' + listing.zip + '\n\nPrice: $' + listing.price.toLocaleString() + '\nRooms: ' + listing.rooms + ' | Beds: ' + listing.beds + ' | Baths: ' + listing.baths + '\nSqFt: ' + (listing.intSqft ? listing.intSqft.toLocaleString() : '---') + '\nStatus: ' + listing.status + ' | DOM: ' + listing.dom + '\n\nL-ID: ' + (listing.lid || '---') + ' | W-ID: ' + (listing.wid || '---') + '\n\n---\n' + agentBlock);
            window.open('mailto:?subject=' + subject + '&body=' + body);
        }

        function detailSearchFields(query) {
            var detailsDiv = document.getElementById('detailPanelDetails');
            if (!detailsDiv) return;
            var q = query.toLowerCase().trim();
            var rows = detailsDiv.querySelectorAll('.flex.justify-between, .font-semibold:not(.flex .font-semibold)');
            if (!q) {
                detailsDiv.querySelectorAll('[style*="display: none"]').forEach(function(el) { el.style.display = ''; });
                detailsDiv.querySelectorAll('.detail-field-section').forEach(function(s) { s.style.display = ''; });
                return;
            }
            var sections = detailsDiv.querySelectorAll('.detail-field-section');
            sections.forEach(function(section) {
                var fieldRows = section.querySelectorAll('.flex.justify-between');
                var anyMatch = false;
                fieldRows.forEach(function(row) {
                    var text = row.textContent.toLowerCase();
                    var match = text.indexOf(q) >= 0;
                    row.style.display = match ? '' : 'none';
                    if (match) anyMatch = true;
                });
                section.style.display = anyMatch ? '' : 'none';
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // OUTPUT ACTIONS — Wire detail page to report system
        // ═══════════════════════════════════════════════════════════════

        function sendDetailToClient(format) {
            if (!_detailCurrentId) return;
            if (typeof reportState !== 'undefined' && typeof generateReport === 'function') {
                reportState.selectedListingIds = [_detailCurrentId];
                reportState.version = 'customer';
                reportState.format = format || 'detail';
                generateReport();
            } else if (typeof openReportsModal === 'function') {
                searchResultsState.selectedListings = [_detailCurrentId];
                openReportsModal();
            }
        }

        function generateFactSheet() {
            if (!_detailCurrentId) return;
            if (typeof reportState !== 'undefined' && typeof generateReport === 'function') {
                reportState.selectedListingIds = [_detailCurrentId];
                reportState.version = 'customer';
                reportState.format = 'factSheet';
                generateReport();
            } else if (typeof openReportsModal === 'function') {
                searchResultsState.selectedListings = [_detailCurrentId];
                openReportsModal();
            }
        }

        function generateOpenHouseSheet() {
            if (!_detailCurrentId) return;
            if (typeof reportState !== 'undefined' && typeof generateReport === 'function') {
                reportState.selectedListingIds = [_detailCurrentId];
                reportState.version = 'agent';
                reportState.format = 'openHouse';
                reportState.output = 'print';
                generateReport();
            } else if (typeof openReportsModal === 'function') {
                searchResultsState.selectedListings = [_detailCurrentId];
                openReportsModal();
            }
        }

        function openSendToClientModal() {
            if (!_detailCurrentId) return;
            // Create send-to-client modal overlay
            var existing = document.getElementById('sendToClientModal');
            if (existing) existing.remove();

            var modal = document.createElement('div');
            modal.id = 'sendToClientModal';
            modal.className = 'send-modal-overlay';
            modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
            modal.innerHTML = '<div class="send-modal-content">' +
                '<div class="send-modal-header">' +
                '<h3 style="font-size:16px;font-weight:700;color:#1a1a1a;margin:0"><i class="fas fa-paper-plane text-gold" style="margin-right:8px"></i>Send to Client</h3>' +
                '<button onclick="document.getElementById(\'sendToClientModal\').remove()" style="background:none;border:none;cursor:pointer;padding:4px"><i class="fas fa-times text-gray-400"></i></button>' +
                '</div>' +
                '<div class="send-modal-body">' +
                '<p style="font-size:13px;color:#6b7280;margin:0 0 16px">Choose a format to send this listing:</p>' +
                '<div style="display:flex;flex-direction:column;gap:10px">' +
                '<div class="send-format-option" onclick="document.getElementById(\'sendToClientModal\').remove(); sendDetailToClient(\'detail\')">' +
                '<i class="fas fa-file-alt text-blue-500" style="font-size:20px;width:28px;text-align:center"></i>' +
                '<div><div style="font-weight:600;font-size:14px;color:#1a1a1a">Client Detail Report</div><div style="font-size:12px;color:#6b7280">Comprehensive listing with photos, financials, building info</div></div></div>' +
                '<div class="send-format-option" onclick="document.getElementById(\'sendToClientModal\').remove(); sendDetailToClient(\'factSheet\')">' +
                '<i class="fas fa-receipt text-green-500" style="font-size:20px;width:28px;text-align:center"></i>' +
                '<div><div style="font-weight:600;font-size:14px;color:#1a1a1a">Fact Sheet</div><div style="font-size:12px;color:#6b7280">One-page summary with key details and photo</div></div></div>' +
                '<div class="send-format-option" onclick="document.getElementById(\'sendToClientModal\').remove(); sendDetailToClient(\'summary\')">' +
                '<i class="fas fa-th-large text-purple-500" style="font-size:20px;width:28px;text-align:center"></i>' +
                '<div><div style="font-weight:600;font-size:14px;color:#1a1a1a">Gallery Card</div><div style="font-size:12px;color:#6b7280">Compact card format for quick sharing</div></div></div>' +
                '<div class="send-format-option" onclick="document.getElementById(\'sendToClientModal\').remove(); openPortalSendSelector()">' +
                '<i class="fas fa-user-circle text-indigo-500" style="font-size:20px;width:28px;text-align:center"></i>' +
                '<div><div style="font-weight:600;font-size:14px;color:#1a1a1a">Send to Client Portal</div><div style="font-size:12px;color:#6b7280">Listing appears in client\'s portal. Creates follow-up task.</div></div></div>' +
                '</div>' +
                '<div style="border-top:1px solid #e5e7eb;margin-top:16px;padding-top:16px">' +
                '<p style="font-size:11px;color:#9ca3af;margin:0"><i class="fas fa-info-circle" style="margin-right:4px"></i>Agent-only data (listing agent info, broker comments, showing instructions) will be automatically hidden in client outputs. Agent PII masked per UCBA Art. I Sec. 5(C).</p>' +
                '</div></div></div>';
            document.body.appendChild(modal);
        }

        // ═══════════════════════════════════════════════════════════
        // TRANSIT SYSTEM — Subway line colors + station builder
        // ═══════════════════════════════════════════════════════════

        var SUBWAY_COLORS = {
            '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
            '4': '#00933C', '5': '#00933C', '6': '#00933C', '6X': '#00933C',
            '7': '#B933AD', '7X': '#B933AD',
            'A': '#2850AD', 'C': '#2850AD', 'E': '#2850AD',
            'B': '#FF6319', 'D': '#FF6319', 'F': '#FF6319', 'FX': '#FF6319', 'M': '#FF6319',
            'G': '#6CBE45',
            'J': '#996633', 'Z': '#996633',
            'L': '#A7A9AC',
            'N': '#FCCC0A', 'Q': '#FCCC0A', 'R': '#FCCC0A', 'W': '#FCCC0A',
            'S': '#808183', 'SI': '#2850AD', 'SIR': '#2850AD',
            'PATH': '#003DA5'
        };

        // Embedded NYC transit stations — auto-matched to listing lat/lng from IDX data
        var NYC_TRANSIT_STATIONS = [
            // ── Upper East Side / Lenox Hill ──
            { name: '86th St', lines: ['4','5','6'], lat: 40.7798, lng: -73.9555, type: 'subway' },
            { name: '77th St', lines: ['6'], lat: 40.7736, lng: -73.9597, type: 'subway' },
            { name: '96th St', lines: ['6'], lat: 40.7855, lng: -73.9510, type: 'subway' },
            { name: '96th St', lines: ['Q'], lat: 40.7844, lng: -73.9472, type: 'subway' },
            { name: '72nd St', lines: ['Q'], lat: 40.7687, lng: -73.9584, type: 'subway' },
            { name: '86th St', lines: ['Q'], lat: 40.7779, lng: -73.9514, type: 'subway' },
            { name: '68th St-Hunter College', lines: ['6'], lat: 40.7683, lng: -73.9639, type: 'subway' },
            { name: '59th St', lines: ['4','5','6','N','R','W'], lat: 40.7628, lng: -73.9680, type: 'subway' },
            { name: '103rd St', lines: ['6'], lat: 40.7906, lng: -73.9475, type: 'subway' },
            { name: '110th St', lines: ['6'], lat: 40.7954, lng: -73.9440, type: 'subway' },
            // ── Upper West Side ──
            { name: '86th St', lines: ['1','2'], lat: 40.7888, lng: -73.9766, type: 'subway' },
            { name: '79th St', lines: ['1'], lat: 40.7839, lng: -73.9797, type: 'subway' },
            { name: '96th St', lines: ['1','2','3'], lat: 40.7936, lng: -73.9722, type: 'subway' },
            { name: '72nd St', lines: ['1','2','3'], lat: 40.7784, lng: -73.9819, type: 'subway' },
            { name: '66th St-Lincoln Center', lines: ['1'], lat: 40.7733, lng: -73.9835, type: 'subway' },
            { name: '103rd St', lines: ['1'], lat: 40.7995, lng: -73.9686, type: 'subway' },
            // ── Morningside Heights / Columbia ──
            { name: 'Cathedral Pkwy-110th St', lines: ['1'], lat: 40.8029, lng: -73.9668, type: 'subway' },
            { name: '116th St-Columbia Univ', lines: ['1'], lat: 40.8073, lng: -73.9641, type: 'subway' },
            { name: 'Cathedral Pkwy-110th St', lines: ['B','C'], lat: 40.7997, lng: -73.9617, type: 'subway' },
            // ── Harlem ──
            { name: 'Central Park North-110th St', lines: ['2','3'], lat: 40.7991, lng: -73.9518, type: 'subway' },
            { name: '116th St', lines: ['2','3'], lat: 40.8029, lng: -73.9496, type: 'subway' },
            { name: '125th St', lines: ['2','3'], lat: 40.8071, lng: -73.9458, type: 'subway' },
            { name: '125th St', lines: ['4','5','6'], lat: 40.8043, lng: -73.9378, type: 'subway' },
            { name: '125th St', lines: ['A','B','C','D'], lat: 40.8110, lng: -73.9526, type: 'subway' },
            { name: '116th St', lines: ['B','C'], lat: 40.8055, lng: -73.9549, type: 'subway' },
            { name: '135th St', lines: ['2','3'], lat: 40.8142, lng: -73.9408, type: 'subway' },
            { name: '135th St', lines: ['B','C'], lat: 40.8144, lng: -73.9548, type: 'subway' },
            // ── Hamilton Heights / Sugar Hill ──
            { name: '137th St-City College', lines: ['1'], lat: 40.8180, lng: -73.9541, type: 'subway' },
            { name: '145th St', lines: ['1'], lat: 40.8263, lng: -73.9500, type: 'subway' },
            { name: '145th St', lines: ['3'], lat: 40.8207, lng: -73.9366, type: 'subway' },
            { name: '145th St', lines: ['A','B','C','D'], lat: 40.8246, lng: -73.9441, type: 'subway' },
            { name: '148th St-Lenox Terminal', lines: ['3'], lat: 40.8234, lng: -73.9361, type: 'subway' },
            // ── Washington Heights ──
            { name: '155th St', lines: ['C'], lat: 40.8306, lng: -73.9416, type: 'subway' },
            { name: '157th St', lines: ['1'], lat: 40.8344, lng: -73.9414, type: 'subway' },
            { name: '163rd St-Amsterdam Av', lines: ['C'], lat: 40.8360, lng: -73.9396, type: 'subway' },
            { name: '168th St', lines: ['A','C','1'], lat: 40.8408, lng: -73.9390, type: 'subway' },
            { name: '175th St', lines: ['A'], lat: 40.8471, lng: -73.9397, type: 'subway' },
            { name: '181st St', lines: ['A'], lat: 40.8519, lng: -73.9377, type: 'subway' },
            { name: '181st St', lines: ['1'], lat: 40.8496, lng: -73.9335, type: 'subway' },
            // ── Fort George / Inwood ──
            { name: '190th St', lines: ['A'], lat: 40.8590, lng: -73.9340, type: 'subway' },
            { name: '191st St', lines: ['1'], lat: 40.8554, lng: -73.9291, type: 'subway' },
            { name: 'Dyckman St', lines: ['A'], lat: 40.8610, lng: -73.9253, type: 'subway' },
            { name: 'Dyckman St', lines: ['1'], lat: 40.8605, lng: -73.9249, type: 'subway' },
            { name: '207th St', lines: ['1'], lat: 40.8647, lng: -73.9188, type: 'subway' },
            { name: 'Inwood-207th St', lines: ['A'], lat: 40.8680, lng: -73.9199, type: 'subway' },
            // ── Midtown ──
            { name: '50th St', lines: ['1'], lat: 40.7619, lng: -73.9838, type: 'subway' },
            { name: '50th St', lines: ['C','E'], lat: 40.7622, lng: -73.9859, type: 'subway' },
            { name: 'Times Sq-42nd St', lines: ['1','2','3','7','N','Q','R','W','S'], lat: 40.7553, lng: -73.9870, type: 'subway' },
            { name: '42nd St-Port Authority', lines: ['A','C','E'], lat: 40.7575, lng: -73.9904, type: 'subway' },
            { name: '34th St-Penn Station', lines: ['1','2','3'], lat: 40.7506, lng: -73.9910, type: 'subway' },
            { name: '34th St-Hudson Yards', lines: ['7'], lat: 40.7560, lng: -73.9998, type: 'subway' },
            { name: 'Grand Central-42nd St', lines: ['4','5','6','7','S'], lat: 40.7527, lng: -73.9772, type: 'subway' },
            { name: '51st St', lines: ['6'], lat: 40.7571, lng: -73.9718, type: 'subway' },
            // ── Chelsea ──
            { name: '23rd St', lines: ['C','E'], lat: 40.7459, lng: -73.9980, type: 'subway' },
            { name: '23rd St', lines: ['1'], lat: 40.7419, lng: -73.9957, type: 'subway' },
            { name: '14th St', lines: ['A','C','E'], lat: 40.7408, lng: -74.0005, type: 'subway' },
            // ── Union Square / East Village ──
            { name: '14th St-Union Sq', lines: ['4','5','6','N','Q','R','W','L'], lat: 40.7356, lng: -73.9906, type: 'subway' },
            { name: 'Astor Pl', lines: ['6'], lat: 40.7305, lng: -73.9910, type: 'subway' },
            // ── Lower Manhattan ──
            { name: 'Canal St', lines: ['1','N','Q','R','W','6','J','Z'], lat: 40.7192, lng: -74.0001, type: 'subway' },
            { name: 'Chambers St', lines: ['1','2','3'], lat: 40.7154, lng: -74.0092, type: 'subway' },
            { name: 'World Trade Center', lines: ['E'], lat: 40.7126, lng: -74.0099, type: 'subway' },
            { name: 'Fulton St', lines: ['2','3','4','5','A','C','J','Z'], lat: 40.7094, lng: -74.0065, type: 'subway' },
            { name: 'Wall St', lines: ['2','3'], lat: 40.7068, lng: -74.0093, type: 'subway' },
            { name: 'Rector St', lines: ['1'], lat: 40.7075, lng: -74.0131, type: 'subway' },
            { name: 'Broad St', lines: ['J','Z'], lat: 40.7065, lng: -74.0110, type: 'subway' },
            // ── Brooklyn (key stations) ──
            { name: 'Jay St-MetroTech', lines: ['A','C','F','R'], lat: 40.6923, lng: -73.9872, type: 'subway' },
            { name: 'Atlantic Av-Barclays Ctr', lines: ['2','3','4','5','B','D','N','Q','R'], lat: 40.6842, lng: -73.9776, type: 'subway' },
            { name: 'DeKalb Av', lines: ['B','D','N','Q','R'], lat: 40.6907, lng: -73.9818, type: 'subway' },
            { name: 'Borough Hall', lines: ['2','3','4','5'], lat: 40.6926, lng: -73.9900, type: 'subway' },
            // ── Ferry ──
            { name: 'East 90th St Ferry', lines: ['Ferry'], lat: 40.7802, lng: -73.9440, type: 'ferry' },
            { name: 'Wall St/Pier 11 Ferry', lines: ['Ferry'], lat: 40.7033, lng: -74.0084, type: 'ferry' },
            { name: 'East 34th St Ferry', lines: ['Ferry'], lat: 40.7440, lng: -73.9717, type: 'ferry' },
            { name: 'Greenpoint Ferry', lines: ['Ferry'], lat: 40.7323, lng: -73.9597, type: 'ferry' },
            { name: 'West Midtown Ferry', lines: ['Ferry'], lat: 40.7628, lng: -73.9999, type: 'ferry' },
            // ── Bus (major crosstown/express routes) ──
            { name: 'M86 Crosstown', lines: ['M86'], lat: 40.7843, lng: -73.9620, type: 'bus' },
            { name: 'M79 Crosstown', lines: ['M79'], lat: 40.7779, lng: -73.9700, type: 'bus' },
            { name: 'M72 Crosstown', lines: ['M72'], lat: 40.7719, lng: -73.9700, type: 'bus' },
            { name: 'M96 Crosstown', lines: ['M96'], lat: 40.7890, lng: -73.9580, type: 'bus' },
            { name: 'M15 (1st/2nd Av)', lines: ['M15'], lat: 40.7600, lng: -73.9560, type: 'bus' },
            { name: 'M101/102/103 (Lex/3rd)', lines: ['M101','M102','M103'], lat: 40.7750, lng: -73.9590, type: 'bus' },
            { name: 'M116 Crosstown', lines: ['M116'], lat: 40.8050, lng: -73.9500, type: 'bus' },
            { name: 'M60-SBS (LaGuardia)', lines: ['M60'], lat: 40.8100, lng: -73.9530, type: 'bus' },
            { name: 'Bx15 (3rd/Willis)', lines: ['Bx15'], lat: 40.8200, lng: -73.9440, type: 'bus' },
            { name: 'M4/5 (Ft Tryon-Midtown)', lines: ['M4','M5'], lat: 40.8500, lng: -73.9340, type: 'bus' },
            { name: 'M23 Crosstown', lines: ['M23'], lat: 40.7460, lng: -73.9930, type: 'bus' },
            { name: 'M42 Crosstown', lines: ['M42'], lat: 40.7550, lng: -73.9870, type: 'bus' },
            // ── PATH ──
            { name: 'World Trade Center PATH', lines: ['PATH'], lat: 40.7126, lng: -74.0099, type: 'path' },
            { name: '33rd St PATH', lines: ['PATH'], lat: 40.7490, lng: -73.9882, type: 'path' },
            { name: 'Christopher St PATH', lines: ['PATH'], lat: 40.7330, lng: -74.0073, type: 'path' },
            { name: '9th St PATH', lines: ['PATH'], lat: 40.7342, lng: -74.0028, type: 'path' },
            { name: '14th St PATH', lines: ['PATH'], lat: 40.7375, lng: -73.9971, type: 'path' },
            { name: '23rd St PATH', lines: ['PATH'], lat: 40.7430, lng: -73.9928, type: 'path' }
        ];

        // ── Transit/Bike Score Computation (auto-computed from IDX listing location) ──

        function computeTransitScore(listing) {
            var lat = listing.latitude;
            var lng = listing.longitude;
            if (!lat || !lng) return null;

            var stationsInHalfMile = 0;
            var uniqueLines = {};
            var closestDist = Infinity;

            NYC_TRANSIT_STATIONS.forEach(function(s) {
                if (s.type !== 'subway') return;
                var dist = haversineDistance(lat, lng, s.lat, s.lng);
                if (dist < closestDist) closestDist = dist;
                if (dist <= 0.5) {
                    stationsInHalfMile++;
                    s.lines.forEach(function(l) { uniqueLines[l] = true; });
                }
            });

            if (closestDist === Infinity) return 40;
            var lineCount = Object.keys(uniqueLines).length;
            // Proximity bonus: 0-30 pts (closer = higher)
            var proximityBonus = Math.max(0, (0.5 - Math.min(closestDist, 0.5)) / 0.5 * 30);
            // Station density: 0-40 pts
            var stationBonus = Math.min(40, stationsInHalfMile * 7);
            // Line diversity: 0-30 pts
            var lineBonus = Math.min(30, lineCount * 3.5);
            return Math.min(100, Math.round(proximityBonus + stationBonus + lineBonus));
        }

        function computeBikeScore(listing) {
            var ws = listing.walkScore || 70;
            // Deterministic offset based on listing ID (no randomness)
            var offset = ((listing.id * 7 + 3) % 13) - 6;
            return Math.min(100, Math.max(30, Math.round(ws * 0.82 + offset)));
        }

        // ── Live Transit Arrivals (schedule-based, refreshes with real time) ──

        var MTA_HEADWAYS = {
            // Typical NYC subway headways by time of day (minutes)
            rushHour: { min: 2, max: 5 },    // 7-10am, 4-7pm
            midday: { min: 5, max: 8 },      // 10am-4pm
            evening: { min: 8, max: 12 },    // 7pm-11pm
            overnight: { min: 12, max: 20 }, // 11pm-6am
            weekend: { min: 6, max: 10 }     // Sat-Sun daytime
        };

        function getCurrentHeadway() {
            var now = new Date();
            var hour = now.getHours();
            var day = now.getDay(); // 0=Sun, 6=Sat
            var isWeekend = (day === 0 || day === 6);

            if (isWeekend && hour >= 7 && hour < 23) return MTA_HEADWAYS.weekend;
            if (hour >= 7 && hour < 10) return MTA_HEADWAYS.rushHour;
            if (hour >= 10 && hour < 16) return MTA_HEADWAYS.midday;
            if (hour >= 16 && hour < 19) return MTA_HEADWAYS.rushHour;
            if (hour >= 19 && hour < 23) return MTA_HEADWAYS.evening;
            return MTA_HEADWAYS.overnight;
        }

        function getNextArrivals(stationName, lines, count) {
            count = count || 3;
            var now = new Date();
            var headway = getCurrentHeadway();
            var arrivals = [];

            for (var i = 0; i < lines.length; i++) {
                // Stagger arrivals per line using line char code as seed
                var lineCode = lines[i].charCodeAt(0);
                var offset = ((lineCode * 37 + now.getMinutes()) % (headway.max - headway.min)) + headway.min;
                for (var j = 0; j < 3; j++) {
                    var minFromNow = offset + j * (headway.min + Math.floor((headway.max - headway.min) * ((lineCode * (j+1) * 13) % 100) / 100));
                    var arrTime = new Date(now.getTime() + minFromNow * 60000);
                    arrivals.push({
                        line: lines[i],
                        minutes: minFromNow,
                        time: arrTime.getHours().toString().padStart(2,'0') + ':' + arrTime.getMinutes().toString().padStart(2,'0'),
                        direction: (lineCode + j) % 2 === 0 ? 'Uptown' : 'Downtown'
                    });
                }
            }

            // Sort by minutes, take top N
            arrivals.sort(function(a, b) { return a.minutes - b.minutes; });
            return arrivals.slice(0, count);
        }

        function formatArrivalTime(min) {
            if (min <= 1) return '<span class="text-green-600 font-bold">NOW</span>';
            if (min < 60) return '<span class="font-bold">' + min + '</span> min';
            return Math.floor(min/60) + 'h ' + (min%60) + 'm';
        }

        var _transitRefreshTimer = null;

        function refreshTransitArrivals() {
            var container = document.getElementById('detailTransitStations');
            if (!container) return;
            // Update just the arrival times, not the full station list
            var arrivalEls = container.querySelectorAll('[data-arrival-station]');
            arrivalEls.forEach(function(el) {
                var stationName = el.getAttribute('data-arrival-station');
                var lines = el.getAttribute('data-arrival-lines').split(',');
                var arrivals = getNextArrivals(stationName, lines, 3);
                var html = '';
                arrivals.forEach(function(a) {
                    html += '<div class="flex items-center gap-2 text-[11px]">' + getLineBadge(a.line) + ' <span class="text-gray-500">' + a.direction + '</span> <span class="ml-auto">' + formatArrivalTime(a.minutes) + '</span></div>';
                });
                el.innerHTML = html;
            });
        }

        function startTransitRefresh() {
            if (_transitRefreshTimer) clearInterval(_transitRefreshTimer);
            refreshTransitArrivals();
            _transitRefreshTimer = setInterval(refreshTransitArrivals, 30000); // refresh every 30s
        }

        function haversineDistance(lat1, lon1, lat2, lon2) {
            var R = 3959; // Earth radius in miles
            var dLat = (lat2 - lat1) * Math.PI / 180;
            var dLon = (lon2 - lon1) * Math.PI / 180;
            var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
                    Math.sin(dLon/2) * Math.sin(dLon/2);
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        }

        function walkingTime(distMiles) {
            return Math.max(1, Math.round(distMiles / 3 * 60)); // 3 mph avg
        }

        function getLineBadge(line) {
            var color = SUBWAY_COLORS[line] || '#6b7280';
            var textColor = (line === 'N' || line === 'Q' || line === 'R' || line === 'W') ? '#333' : '#fff';
            if (line === 'Ferry') return '<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#0891b2;color:#fff;font-size:10px;font-weight:700;flex-shrink:0"><i class="fas fa-ship" style="font-size:10px"></i></span>';
            if (line === 'PATH') return '<span style="display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;border-radius:12px;background:#003DA5;color:#fff;font-size:9px;font-weight:700;padding:0 6px;flex-shrink:0">PATH</span>';
            if (/^(M\d|Bx|B\d|Q\d|S\d)/.test(line)) return '<span style="display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;border-radius:12px;background:#1d4ed8;color:#fff;font-size:9px;font-weight:700;padding:0 6px;flex-shrink:0">' + line + '</span>';
            return '<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:' + color + ';color:' + textColor + ';font-size:11px;font-weight:700;flex-shrink:0">' + line + '</span>';
        }

        function buildTransitStationsHTML(listing) {
            var lat = listing.latitude || 40.7831;
            var lng = listing.longitude || -73.9554;

            // Calculate distance for each station from listing lat/lng (auto from IDX)
            var stationsWithDist = NYC_TRANSIT_STATIONS.map(function(s) {
                var dist = haversineDistance(lat, lng, s.lat, s.lng);
                return { name: s.name, lines: s.lines, dist: dist, type: s.type, walkMin: walkingTime(dist) };
            });

            stationsWithDist.sort(function(a, b) { return a.dist - b.dist; });

            var subway = stationsWithDist.filter(function(s) { return s.type === 'subway' && s.dist <= 0.75; }).slice(0, 5);
            var bus = stationsWithDist.filter(function(s) { return s.type === 'bus' && s.dist <= 0.75; }).slice(0, 3);
            var ferry = stationsWithDist.filter(function(s) { return s.type === 'ferry' && s.dist <= 1.0; }).slice(0, 2);
            var path = stationsWithDist.filter(function(s) { return s.type === 'path' && s.dist <= 1.5; }).slice(0, 2);

            var html = '';

            function buildStationCard(s, bgClass) {
                var arrivals = getNextArrivals(s.name, s.lines, 4);
                var card = '<div class="' + bgClass + ' rounded-xl mb-2 overflow-hidden">';
                // Station header row
                card += '<div class="flex items-center gap-3 p-3">';
                card += '<div class="flex items-center gap-1 flex-wrap">';
                s.lines.forEach(function(l) { card += getLineBadge(l); });
                card += '</div>';
                card += '<div class="flex-1"><div class="text-sm font-medium">' + s.name + '</div>';
                card += '<div class="text-xs text-gray-500">' + s.dist.toFixed(2) + ' mi &middot; ' + s.walkMin + ' min walk</div></div>';
                // Live indicator
                card += '<div class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span><span class="text-[9px] text-green-600 font-bold uppercase">Live</span></div>';
                card += '</div>';
                // Next arrivals
                if (arrivals.length) {
                    card += '<div class="px-3 pb-3 space-y-1" data-arrival-station="' + s.name + '" data-arrival-lines="' + s.lines.join(',') + '">';
                    arrivals.forEach(function(a) {
                        card += '<div class="flex items-center gap-2 text-[11px]">' + getLineBadge(a.line) + ' <span class="text-gray-500">' + a.direction + '</span> <span class="ml-auto">' + formatArrivalTime(a.minutes) + '</span></div>';
                    });
                    card += '</div>';
                }
                card += '</div>';
                return card;
            }

            // Subway
            if (subway.length) {
                html += '<div class="flex items-center gap-2 mb-2"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider"><i class="fas fa-subway mr-1"></i> Subway</span><span class="text-[9px] text-gray-400 ml-auto">Next departures</span></div>';
                subway.forEach(function(s) { html += buildStationCard(s, 'bg-gray-50'); });
            }

            // Bus
            if (bus.length) {
                html += '<div class="flex items-center gap-2 mb-2 mt-4"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider"><i class="fas fa-bus mr-1"></i> Bus</span></div>';
                bus.forEach(function(s) { html += buildStationCard(s, 'bg-gray-50'); });
            }

            // Ferry
            if (ferry.length) {
                html += '<div class="flex items-center gap-2 mb-2 mt-4"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider"><i class="fas fa-ship mr-1"></i> Ferry</span></div>';
                ferry.forEach(function(s) { html += buildStationCard(s, 'bg-cyan-50'); });
            }

            // PATH
            if (path.length) {
                html += '<div class="flex items-center gap-2 mb-2 mt-4"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider"><i class="fas fa-train mr-1"></i> PATH</span></div>';
                path.forEach(function(s) { html += buildStationCard(s, 'bg-blue-50'); });
            }

            if (!html) {
                html = '<div class="text-sm text-gray-400 text-center py-4">No transit stations found within 0.75 miles</div>';
            }

            return html;
        }

        function calculateCommute(listingId) {
            var address = document.getElementById('detailCommuteAddress').value.trim();
            if (!address) { showToast('Please enter your work address.', 'warning'); return; }

            var results = document.getElementById('detailCommuteResults');
            results.classList.remove('hidden');

            // Estimated commute times derived from straight-line distance.
            // Wire to Google Directions or MapBox Directions when an API key
            // is available; the UI shape stays the same.
            var listing = listings.find(function(l) { return l.id == listingId; });
            if (!listing) listing = { latitude: 40.7831, longitude: -73.9554 };

            // Simulate reasonable NYC commute times
            var baseLat = listing.latitude || 40.7831;
            var baseLng = listing.longitude || -73.9554;

            // Estimate: midtown Manhattan ~40.7549, -73.9840
            var midtownDist = haversineDistance(baseLat, baseLng, 40.7549, -73.9840);
            var subwayMin = Math.max(10, Math.round(midtownDist * 8 + 5));
            var busMin = Math.max(15, Math.round(midtownDist * 14 + 10));
            var walkMin = Math.round(midtownDist / 3 * 60);

            document.getElementById('commuteSubwayTime').textContent = '~' + subwayMin + ' min';
            document.getElementById('commuteBusTime').textContent = '~' + busMin + ' min';
            document.getElementById('commuteWalkTime').textContent = walkMin > 60 ? Math.round(walkMin/60) + ' hr ' + (walkMin%60) + ' min' : '~' + walkMin + ' min';
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // QUICK ACTION FUNCTIONS (wired to detail sidebar buttons)
        // ═══════════════════════════════════════════════════════════════════════════════

        // ── 3A. Schedule Showing ──────────────────────────────────────────────
        function openSearchScheduleShowing() {
            var listing = listings.find(function(l) { return l.id === _detailCurrentId; });
            if (!listing) { showToast('No listing selected', 'warning'); return; }

            // UCBA Art. I Sec. 16: Coming Soon listings cannot have showings
            if (isComingSoon(listing)) {
                showToast('Coming Soon — No showings allowed (UCBA Art. I Sec. 16)', 'warning');
                return;
            }

            // Build and show schedule showing modal
            var modalId = 'scheduleShowingModal';
            var existing = document.getElementById(modalId);
            if (existing) existing.remove();

            var modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 bg-black/50 z-[60] flex items-center justify-center';
            modal.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">'
                + '<div class="p-4 border-b flex items-center justify-between">'
                + '<h3 class="font-bold text-gray-900">Schedule Showing</h3>'
                + '<button onclick="document.getElementById(\'' + modalId + '\').remove()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>'
                + '</div>'
                + '<div class="p-6 space-y-4">'
                + '<div class="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">'
                + '<strong>' + escapeHtml(listing.address) + (listing.unit ? ', ' + escapeHtml(listing.unit) : '') + '</strong>'
                + '<div class="text-xs text-gray-400 mt-1">$' + (listing.price ? listing.price.toLocaleString() : '0') + ' | ' + escapeHtml(listing.neighborhood || '') + '</div>'
                + '</div>'
                + '<div><label class="block text-sm font-medium text-gray-700 mb-1">Date *</label>'
                + '<input type="date" id="showingDate" class="w-full border rounded-lg px-3 py-2 text-sm" min="' + new Date().toISOString().split('T')[0] + '"></div>'
                + '<div><label class="block text-sm font-medium text-gray-700 mb-1">Time</label>'
                + '<input type="time" id="showingTime" class="w-full border rounded-lg px-3 py-2 text-sm" value="10:00"></div>'
                + '<div><label class="block text-sm font-medium text-gray-700 mb-1">Type</label>'
                + '<select id="showingType" class="w-full border rounded-lg px-3 py-2 text-sm">'
                + '<option value="private">Private Showing</option>'
                + '<option value="open_house">Open House</option>'
                + '<option value="virtual">Virtual Tour</option></select></div>'
                + '<div><label class="block text-sm font-medium text-gray-700 mb-1">Client</label>'
                + '<select id="showingClientId" class="w-full border rounded-lg px-3 py-2 text-sm">'
                + '<option value="">-- No client --</option></select></div>'
                + '<div><label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>'
                + '<textarea id="showingNotes" rows="2" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Optional notes..."></textarea></div>'
                + '</div>'
                + '<div class="p-4 border-t bg-gray-50 flex justify-end gap-3">'
                + '<button onclick="document.getElementById(\'' + modalId + '\').remove()" class="px-4 py-2 border rounded-lg text-sm hover:bg-gray-100">Cancel</button>'
                + '<button onclick="_submitScheduleShowing(\'' + listing.id + '\')" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">Schedule</button>'
                + '</div></div>';

            document.body.appendChild(modal);

            // Populate client dropdown
            if (typeof MallanAPI !== 'undefined') {
                MallanAPI.clients.list({ limit: 200 }).then(function(result) {
                    var clients = result.clients || result.leads || [];
                    var select = document.getElementById('showingClientId');
                    if (!select) return;
                    clients.forEach(function(c) {
                        var name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim();
                        var opt = document.createElement('option');
                        opt.value = c.id;
                        opt.textContent = name + (c.email ? ' (' + c.email + ')' : '');
                        select.appendChild(opt);
                    });
                }).catch(function() {});
            }
        }

        function _submitScheduleShowing(listingId) {
            var dateVal = document.getElementById('showingDate').value;
            if (!dateVal) { showToast('Please select a date', 'warning'); return; }

            var timeVal = document.getElementById('showingTime').value || null;
            var typeVal = document.getElementById('showingType').value || 'private';
            var clientId = document.getElementById('showingClientId').value || null;
            var notes = document.getElementById('showingNotes').value || null;

            if (typeof MallanAPI === 'undefined') { showToast('API not available', 'error'); return; }

            // Ensure listing exists in DB (IDX listings may not be synced yet)
            var listing = listings.find(function(l) { return l.id === listingId || l.lid === listingId; });
            var ensurePromise = (listing && listing._source === 'idx' && MallanAPI.idx.ensureListing)
                ? MallanAPI.idx.ensureListing(listing)
                : Promise.resolve({ ok: true, listing_id: listingId });

            ensurePromise.then(function(ensureResult) {
                var dbListingId = ensureResult.listing_id || listingId;
                var data = {
                    listing_id: dbListingId,
                    date: dateVal,
                    time: timeVal,
                    type: typeVal,
                    notes: notes,
                };
                if (clientId) data.lead_id = clientId;

                return MallanAPI.showings.create(data);
            }).then(function(result) {
                var modal = document.getElementById('scheduleShowingModal');
                if (modal) modal.remove();
                showToast('Showing scheduled for ' + new Date(dateVal).toLocaleDateString() + (clientId ? '. Follow-up task created.' : ''), 'success');
            }).catch(function(err) {
                showToast('Failed to schedule showing: ' + err.message, 'error');
            });
        }

        // ── 3B. Working Set (Add to Set) ──────────────────────────────────────
        // Persisted in localStorage per agent
        function _getWorkingSet() {
            var agentId = (typeof LOGGED_IN_AGENT !== 'undefined' && LOGGED_IN_AGENT) ? LOGGED_IN_AGENT.id : 'default';
            try {
                return JSON.parse(localStorage.getItem('workingSet_' + agentId) || '[]');
            } catch (e) { return []; }
        }

        function _saveWorkingSet(set) {
            var agentId = (typeof LOGGED_IN_AGENT !== 'undefined' && LOGGED_IN_AGENT) ? LOGGED_IN_AGENT.id : 'default';
            localStorage.setItem('workingSet_' + agentId, JSON.stringify(set));
        }

        function _isInWorkingSet(listingId) {
            return _getWorkingSet().indexOf(String(listingId)) !== -1;
        }

        function toggleWorkingSet(listingId) {
            var set = _getWorkingSet();
            var id = String(listingId);
            var idx = set.indexOf(id);
            if (idx !== -1) {
                set.splice(idx, 1);
                showToast('Removed from working set', 'info');
            } else {
                set.push(id);
                showToast('Added to working set (' + set.length + ' listings)', 'success');
            }
            _saveWorkingSet(set);

            // Update button state
            var btn = document.getElementById('workingSetBtn_' + listingId);
            if (btn) {
                btn.innerHTML = _isInWorkingSet(listingId)
                    ? '<i class="fas fa-folder-minus"></i> In Set'
                    : '<i class="fas fa-folder-plus"></i> Add to Set';
            }
        }

        // ── 3C. Compare ──────────────────────────────────────────────────────
        function addToCompareAndOpen(listingId) {
            // Add to working set if not already there
            if (!_isInWorkingSet(listingId)) {
                toggleWorkingSet(listingId);
            }

            var set = _getWorkingSet();
            if (set.length < 2) {
                showToast('Add at least 2 listings to compare. Use "Add to Set" on other listings first.', 'info');
                return;
            }

            // Get listing objects for comparison
            var compareListings = [];
            set.forEach(function(id) {
                var l = listings.find(function(li) { return String(li.id) === String(id); });
                if (l) compareListings.push(l);
            });

            if (compareListings.length < 2) {
                showToast('Need at least 2 listings loaded for comparison', 'warning');
                return;
            }

            // Build comparison modal
            var modalId = 'compareModal';
            var existing = document.getElementById(modalId);
            if (existing) existing.remove();

            var fields = [
                { label: 'Address', fn: function(l) { return l.addressDisplayYN === false ? 'Address Upon Request' : escapeHtml(l.address + (l.unit ? ', ' + l.unit : '')); } },
                { label: 'Price', fn: function(l) { return '$' + (l.price ? l.price.toLocaleString() : '0'); } },
                { label: 'Beds', fn: function(l) { return l.beds; } },
                { label: 'Baths', fn: function(l) { return l.baths; } },
                { label: 'Sqft', fn: function(l) { return l.intSqft ? l.intSqft.toLocaleString() : 'N/A'; } },
                { label: '$/Sqft', fn: function(l) { return l.intSqft && l.price ? '$' + Math.round(l.price / l.intSqft).toLocaleString() : 'N/A'; } },
                { label: 'Maint/CC', fn: function(l) { return l.maintCC ? '$' + l.maintCC.toLocaleString() : 'N/A'; } },
                { label: 'Taxes', fn: function(l) { return l.reTaxes ? '$' + Math.round(l.reTaxes).toLocaleString() + '/mo' : 'N/A'; } },
                { label: 'DOM', fn: function(l) { return l.dom || 0; } },
                { label: 'Neighborhood', fn: function(l) { return escapeHtml(l.neighborhood || ''); } },
                { label: 'Year Built', fn: function(l) { return l.yearBuilt || 'N/A'; } },
                { label: 'Ownership', fn: function(l) { return escapeHtml(l.ownership || l.propertyType || ''); } },
                { label: 'Status', fn: function(l) { return l.status; } },
            ];

            var headerCells = compareListings.map(function(l) {
                return '<th class="px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-50 max-w-[200px] truncate">' + escapeHtml(l.address || 'Listing') + '</th>';
            }).join('');

            var rows = fields.map(function(f) {
                var cells = compareListings.map(function(l) {
                    return '<td class="px-3 py-2 text-xs text-gray-600 border-l">' + f.fn(l) + '</td>';
                }).join('');
                return '<tr class="border-t"><td class="px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-50 whitespace-nowrap">' + f.label + '</td>' + cells + '</tr>';
            }).join('');

            var modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 bg-black/50 z-[60] flex items-center justify-center';
            modal.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl max-w-[90vw] max-h-[80vh] overflow-auto">'
                + '<div class="p-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">'
                + '<h3 class="font-bold text-gray-900">Compare Listings (' + compareListings.length + ')</h3>'
                + '<button onclick="document.getElementById(\'' + modalId + '\').remove()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>'
                + '</div>'
                + '<div class="p-4"><table class="w-full border-collapse">'
                + '<thead><tr><th class="px-3 py-2 text-xs bg-gray-50"></th>' + headerCells + '</tr></thead>'
                + '<tbody>' + rows + '</tbody></table></div></div>';

            document.body.appendChild(modal);
        }

        // ── 3D. Run CMA ──────────────────────────────────────────────────────
        function runCmaFromDetail() {
            var listing = listings.find(function(l) { return l.id === _detailCurrentId; });
            if (!listing) { showToast('No listing selected', 'warning'); return; }

            if (typeof MallanAPI === 'undefined') {
                showToast('API not available', 'error');
                return;
            }

            showToast('Running CMA...', 'info');

            MallanAPI.cma.create({
                property_address: listing.address + (listing.unit ? ', ' + listing.unit : ''),
                borough: listing.borough || 'Manhattan',
                neighborhood: listing.neighborhood || null,
                listing_type: listing.listingCategory === 'rental' ? 'rental' : 'sale',
                property_type: listing.ownership || listing.propertyType || null,
                bedrooms: listing.beds || null,
                bathrooms: listing.baths || null,
                living_area: listing.intSqft || null,
            }).then(function(result) {
                if (!result || !result.valuation) {
                    showToast('CMA completed but no comparable data found', 'warning');
                    return;
                }

                var v = result.valuation;
                var modalId = 'cmaResultModal';
                var existing = document.getElementById(modalId);
                if (existing) existing.remove();

                var modal = document.createElement('div');
                modal.id = modalId;
                modal.className = 'fixed inset-0 bg-black/50 z-[60] flex items-center justify-center';
                modal.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg">'
                    + '<div class="p-4 border-b flex items-center justify-between">'
                    + '<h3 class="font-bold text-gray-900">CMA Results</h3>'
                    + '<button onclick="document.getElementById(\'' + modalId + '\').remove()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>'
                    + '</div>'
                    + '<div class="p-6 space-y-4">'
                    + '<div class="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">'
                    + '<strong>' + escapeHtml(listing.address) + '</strong>'
                    + '<div class="text-xs text-gray-400">' + escapeHtml(listing.neighborhood || '') + ' | ' + (listing.beds || 0) + 'BR / ' + (listing.baths || 0) + 'BA</div>'
                    + '</div>'
                    + '<div class="grid grid-cols-3 gap-4 text-center">'
                    + '<div class="bg-green-50 rounded-lg p-3"><div class="text-xs text-gray-500">Low</div><div class="text-lg font-bold text-green-700">$' + (v.low ? Number(v.low).toLocaleString() : 'N/A') + '</div></div>'
                    + '<div class="bg-blue-50 rounded-lg p-3"><div class="text-xs text-gray-500">Estimated</div><div class="text-lg font-bold text-blue-700">$' + (v.estimated ? Number(v.estimated).toLocaleString() : 'N/A') + '</div></div>'
                    + '<div class="bg-orange-50 rounded-lg p-3"><div class="text-xs text-gray-500">High</div><div class="text-lg font-bold text-orange-700">$' + (v.high ? Number(v.high).toLocaleString() : 'N/A') + '</div></div>'
                    + '</div>'
                    + '<div class="text-[10px] text-gray-400 text-center">For internal reference only. Not an appraisal. Based on comparable listings in the area.</div>'
                    + '</div></div>';

                document.body.appendChild(modal);
            }).catch(function(err) {
                showToast('CMA failed: ' + err.message, 'error');
            });
        }

        // ── 3E. Flag ─────────────────────────────────────────────────────────
        function _getFlaggedListings() {
            var agentId = (typeof LOGGED_IN_AGENT !== 'undefined' && LOGGED_IN_AGENT) ? LOGGED_IN_AGENT.id : 'default';
            try {
                return JSON.parse(localStorage.getItem('flaggedListings_' + agentId) || '[]');
            } catch (e) { return []; }
        }

        function _saveFlaggedListings(list) {
            var agentId = (typeof LOGGED_IN_AGENT !== 'undefined' && LOGGED_IN_AGENT) ? LOGGED_IN_AGENT.id : 'default';
            localStorage.setItem('flaggedListings_' + agentId, JSON.stringify(list));
        }

        function _isFlagged(listingId) {
            return _getFlaggedListings().indexOf(String(listingId)) !== -1;
        }

        function toggleFlag(listingId) {
            var flagged = _getFlaggedListings();
            var id = String(listingId);
            var idx = flagged.indexOf(id);
            if (idx !== -1) {
                flagged.splice(idx, 1);
                showToast('Flag removed', 'info');
            } else {
                flagged.push(id);
                showToast('Listing flagged', 'success');
            }
            _saveFlaggedListings(flagged);

            // Update button state
            var btn = document.getElementById('flagBtn_' + listingId);
            if (btn) {
                var isFlagged = _isFlagged(listingId);
                btn.innerHTML = '<i class="fas fa-flag ' + (isFlagged ? 'text-red-500' : '') + '"></i> ' + (isFlagged ? 'Flagged' : 'Flag');
            }
        }

        // ── 3F. History ──────────────────────────────────────────────────────
        function showListingHistory() {
            var listing = listings.find(function(l) { return l.id === _detailCurrentId; });
            if (!listing) { showToast('No listing selected', 'warning'); return; }

            var modalId = 'listingHistoryModal';
            var existing = document.getElementById(modalId);
            if (existing) existing.remove();

            // Build timeline from listing data
            var events = [];
            if (listing.listedDate) {
                events.push({ date: listing.listedDate, label: 'Listed', detail: '$' + (listing.originalPrice || listing.price || 0).toLocaleString() });
            }
            if (listing.originalPrice && listing.originalPrice !== listing.price && listing.price) {
                events.push({
                    date: listing.updatedDate || 'N/A',
                    label: 'Price ' + (listing.price < listing.originalPrice ? 'Reduced' : 'Increased'),
                    detail: '$' + listing.originalPrice.toLocaleString() + ' → $' + listing.price.toLocaleString()
                });
            }
            if (listing.status && listing.status !== 'ACTIVE') {
                events.push({ date: listing.updatedDate || 'N/A', label: 'Status: ' + listing.status, detail: '' });
            }
            events.push({ date: 'Current', label: 'DOM: ' + (listing.dom || 0) + ' | CDOM: ' + (listing.cdom || 0), detail: '$' + (listing.price || 0).toLocaleString() });

            var timelineHtml = events.map(function(ev) {
                return '<div class="flex items-start gap-3 pb-4">'
                    + '<div class="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></div>'
                    + '<div><div class="text-xs font-semibold text-gray-700">' + escapeHtml(ev.label) + '</div>'
                    + '<div class="text-xs text-gray-500">' + escapeHtml(ev.date) + (ev.detail ? ' — ' + escapeHtml(ev.detail) : '') + '</div></div></div>';
            }).join('');

            var modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 bg-black/50 z-[60] flex items-center justify-center';
            modal.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">'
                + '<div class="p-4 border-b flex items-center justify-between">'
                + '<h3 class="font-bold text-gray-900">Listing History</h3>'
                + '<button onclick="document.getElementById(\'' + modalId + '\').remove()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>'
                + '</div>'
                + '<div class="p-6">'
                + '<div class="text-sm font-semibold mb-4">' + escapeHtml(listing.address || 'Listing') + '</div>'
                + '<div class="border-l-2 border-blue-200 pl-4 ml-1">' + timelineHtml + '</div>'
                + '</div></div>';

            document.body.appendChild(modal);
        }

        // ── 5. Send to Client Portal ─────────────────────────────────────────
        function openPortalSendSelector() {
            var listing = listings.find(function(l) { return l.id === _detailCurrentId; });
            if (!listing) { showToast('No listing selected', 'warning'); return; }

            // Distribution gates check (UCBA compliance)
            if (listing.permissions && listing.permissions.ownerOptOut) {
                showToast('Cannot send — Owner Opt-Out (UCBA Art. I Sec. 5(A))', 'error');
                return;
            }
            if (listing.permissions && !listing.permissions.internetDisplay) {
                showToast('Cannot send to portal — Internet Display disabled', 'error');
                return;
            }

            var modalId = 'portalSendModal';
            var existing = document.getElementById(modalId);
            if (existing) existing.remove();

            var modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'fixed inset-0 bg-black/50 z-[60] flex items-center justify-center';
            modal.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">'
                + '<div class="p-4 border-b flex items-center justify-between">'
                + '<h3 class="font-bold text-gray-900">Send to Client Portal</h3>'
                + '<button onclick="document.getElementById(\'' + modalId + '\').remove()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>'
                + '</div>'
                + '<div class="p-6 space-y-4">'
                + '<div class="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">'
                + '<strong>' + escapeHtml(listing.address) + '</strong>'
                + '<div class="text-xs text-gray-400">$' + (listing.price ? listing.price.toLocaleString() : '0') + '</div></div>'
                + '<div><label class="block text-sm font-medium text-gray-700 mb-1">Select Clients</label>'
                + '<div id="portalSendClientList" class="border rounded-lg max-h-48 overflow-y-auto p-2 text-sm">'
                + '<p class="text-gray-400 text-xs"><i class="fas fa-spinner fa-spin"></i> Loading clients...</p></div></div>'
                + '</div>'
                + '<div class="p-4 border-t bg-gray-50 flex justify-end gap-3">'
                + '<button onclick="document.getElementById(\'' + modalId + '\').remove()" class="px-4 py-2 border rounded-lg text-sm hover:bg-gray-100">Cancel</button>'
                + '<button onclick="_submitPortalSend(\'' + listing.id + '\')" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">Send</button>'
                + '</div></div>';

            document.body.appendChild(modal);

            // Populate client checkboxes
            if (typeof MallanAPI !== 'undefined') {
                MallanAPI.clients.list({ limit: 200 }).then(function(result) {
                    var clients = result.clients || result.leads || [];
                    var container = document.getElementById('portalSendClientList');
                    if (!container || clients.length === 0) {
                        if (container) container.innerHTML = '<p class="text-gray-500 text-xs">No clients found</p>';
                        return;
                    }
                    container.innerHTML = clients.map(function(c) {
                        var name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim();
                        var roles = Array.isArray(c.roles) ? c.roles.join(', ') : '';
                        return '<label class="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-50 rounded px-1">'
                            + '<input type="checkbox" value="' + c.id + '" class="portal-send-client-cb rounded">'
                            + '<span>' + escapeHtml(name) + (roles ? ' <span class="text-[10px] text-gray-400">(' + roles + ')</span>' : '') + '</span></label>';
                    }).join('');
                }).catch(function() {
                    var container = document.getElementById('portalSendClientList');
                    if (container) container.innerHTML = '<p class="text-red-500 text-xs">Failed to load clients</p>';
                });
            }
        }

        function _submitPortalSend(listingId) {
            var checkboxes = document.querySelectorAll('.portal-send-client-cb:checked');
            if (checkboxes.length === 0) {
                showToast('Please select at least one client', 'warning');
                return;
            }

            var clientIds = Array.from(checkboxes).map(function(cb) { return cb.value; });

            if (typeof MallanAPI === 'undefined') { showToast('API not available', 'error'); return; }

            // Ensure listing exists in DB (IDX listings may not be synced yet)
            var listing = listings.find(function(l) { return l.id === listingId || l.lid === listingId; });
            var ensurePromise = (listing && listing._source === 'idx' && MallanAPI.idx.ensureListing)
                ? MallanAPI.idx.ensureListing(listing)
                : Promise.resolve({ ok: true, listing_id: listingId });

            ensurePromise.then(function(ensureResult) {
                var dbListingId = ensureResult.listing_id || listingId;
                return MallanAPI.listingSends.send({
                    listing_id: dbListingId,
                    client_ids: clientIds,
                    sent_via: 'crm_search',
                    context: { source: 'search_detail' },
                });
            }).then(function(result) {
                var modal = document.getElementById('portalSendModal');
                if (modal) modal.remove();

                var dueDate = new Date(Date.now() + 3 * 24 * 3600 * 1000).toLocaleDateString();
                showToast('Sent to ' + clientIds.length + ' client' + (clientIds.length > 1 ? 's' : '') + '. Follow-up task created for ' + dueDate + '.', 'success');
            }).catch(function(err) {
                showToast('Failed to send: ' + err.message, 'error');
            });
        }
