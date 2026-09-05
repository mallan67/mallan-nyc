        function renderGalleryView() {
            var container = document.getElementById('galleryResults');
            container.innerHTML = getFilteredListings().map(listing => {
                var stC = listing.status === 'ACTIVE' ? '#16a34a' : listing.status === 'PENDING' ? '#ea580c' : listing.status === 'COMING_SOON' ? '#7c3aed' : '#6b7280';
                var stB = listing.status === 'ACTIVE' ? '#dcfce7' : listing.status === 'PENDING' ? '#fff7ed' : listing.status === 'COMING_SOON' ? '#f5f3ff' : '#f3f4f6';
                var statusLabel = listing.status === 'COMING_SOON' ? 'COMING SOON' : listing.status;
                var displayAddress = listing.addressDisplayYN === false ? 'Address Available Upon Request' : escapeHtml(listing.address);
                var displayUnit = listing.addressDisplayYN !== false ? escapeHtml(listing.unit) : '';
                var selected = searchResultsState.selectedListings.includes(listing.id);
                var csGalleryBadge = listing.status === 'COMING_SOON' ? '<div class="absolute bottom-3 left-3 px-2.5 py-1 bg-purple-600 text-white text-[11px] font-bold rounded-lg z-10" data-reso-field="MlsStatus" data-reso-value="ComingSoon" data-compliance="coming-soon-badge" title="UCBA D7: Coming Soon — max 14 days (D2). No showings or open houses.">Coming Soon' + (listing.comingSoonDate ? ' &mdash; No Showings Until <span' + resoData('comingSoonDate', listing.comingSoonDate) + '>' + escapeHtml(listing.comingSoonDate) + '</span>' : '') + '</div>' : '';
                return `
                <div class="listing-card gallery-card bg-white rounded-2xl overflow-hidden ${selected ? 'ring-2 ring-blue-500' : ''}" data-reso-field="SourceSystemKey" data-reso-value="${escapeHtml(listing.wid || listing.lid || listing.id)}" data-listing-id="${listing.id}" data-listing-lid="${escapeHtml(listing.lid || '')}" data-source="${listing._source === 'mallan' ? 'MALLAN-LOCAL' : 'COTALITY-API'}">
                    <!-- Photo -->
                    <div class="relative cursor-pointer group" onclick="openListingInNewTab('${listing.id}'); if (typeof isResultsMapOpen === 'function' && isResultsMapOpen()) { if (typeof panToListing === 'function') panToListing('${listing.id}'); }">
                        <div class="cm-photo-wrap cm-card-photo">
                            <img src="${getListingPhoto(listing)}" alt="${displayAddress}" class="cm-photo" loading="lazy" onerror="this.style.display='none'" data-photo-lid="${escapeHtml(listing.lid || '')}">
                        </div>
                        <!-- Checkbox -->
                        <div class="absolute top-3 left-3 z-10">
                            <input type="checkbox" class="w-4 h-4 rounded cursor-pointer" ${selected ? 'checked' : ''} onclick="event.stopPropagation();toggleListingSelection('${listing.id}')">
                        </div>
                        <!-- Badges -->
                        ${listing.priceChange === 'down' ? '<div class="absolute top-3 right-3 px-2 py-1 bg-red-500 text-white text-[10px] font-bold rounded-lg z-10"><i class="fas fa-arrow-down mr-0.5"></i>PRICE DROP</div>' : ''}
                        ${listing.newListing ? '<div class="absolute top-3 right-3 px-2 py-1 bg-blue-600 text-white text-[10px] font-bold rounded-lg z-10">NEW</div>' : ''}
                        ${csGalleryBadge}
                        <!-- Photo count -->
                        <div class="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white text-[11px] px-2 py-1 rounded-lg z-10 ${listing.priceChange === 'down' || listing.newListing ? 'top-auto bottom-3' : ''}">${listing.photoCount || 0} <i class="fas fa-images text-[10px]"></i></div>
                    </div>
                    <!-- Card body -->
                    <div class="p-4">
                        <div class="flex items-start justify-between gap-2 mb-1.5">
                            <div class="min-w-0">
                                <h4 class="font-bold text-[15px] text-gray-900 truncate">${displayAddress}${displayUnit ? ', ' + displayUnit : ''}</h4>
                                <p class="text-[12px] text-gray-500 font-light mt-0.5">${escapeHtml(listing.era || '--')} &middot; ${ownershipLabel(listing.ownership)} &middot; ${escapeHtml(listing.neighborhood)}</p>
                            </div>
                            <span class="text-base font-bold text-gray-900 whitespace-nowrap"${resoData('price', listing.price)}>$${listing.price.toLocaleString()}</span>
                        </div>
                        <p class="text-[13px] text-gray-600 font-light">
                            ${listing.beds == null ? '—' : listing.beds} bd &middot; ${listing.baths == null ? '—' : listing.baths} ba${listing.intSqft ? ' &middot; ' + listing.intSqft.toLocaleString() + ' sf' : ''}
                        </p>
                        ${listing.maintCC ? '<p class="text-[11px] text-gray-400 font-light mt-0.5">CC: $' + listing.maintCC.toLocaleString() + '/mo</p>' : ''}
                        <!-- Status + Agent -->
                        <div class="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                            <div class="flex items-center gap-1.5">
                                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold" style="background:${stB};color:${stC}"${resoData('status', listing.status)}>${statusLabel}</span>
                                ${participantOnlyBadge(listing)}
                                ${syndicationBadge(listing)}
                            </div>
                            <span class="text-[10px] text-gray-400"${resoData('totalMonthly', listing.totalMonthly)}>MT: ${listing.totalMonthly == null ? '—' : '$' + listing.totalMonthly.toLocaleString()}</span>
                        </div>
                        ${listing.listingCategory === 'rental' ? fareActDisclosure(listing) : ''}
                        <!-- Attribution -->
                        <p class="text-[10px] text-gray-300 mt-2 font-light" data-rebny-attribution>Listing courtesy of ${escapeHtml(listing.company || 'REBNY RLS')}</p>
                    </div>
                </div>
            `}).join('');
        }

