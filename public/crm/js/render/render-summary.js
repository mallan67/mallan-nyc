        function renderSummaryView() {
            var container = document.getElementById('summaryResults');
            container.innerHTML = getFilteredListings().map(listing => {
                var displayAddress = listing.addressDisplayYN === false ? 'Address Available Upon Request' : listing.address;
                var displayUnit = listing.addressDisplayYN === false ? '' : ', ' + listing.unit;
                var statusLabel = listing.status === 'COMING_SOON' ? 'COMING SOON' : listing.status;
                return `
                <div class="border-b cursor-pointer ${searchResultsState.selectedListings.includes(listing.id) ? 'bg-blue-50' : ''}" data-source="REBNY-RLS" data-listing-id="${listing.id}" onclick="openListingInNewTab(${listing.id})">
                    ${comingSoonBadge(listing)}
                    <div class="p-4">
                    <!-- Header row -->
                    <div class="flex items-start justify-between mb-1">
                        <div class="flex items-center gap-2">
                            <input type="checkbox" class="w-4 h-4" ${searchResultsState.selectedListings.includes(listing.id) ? 'checked' : ''} onclick="event.stopPropagation(); toggleListingSelection(${listing.id})">
                            <h3 class="font-bold text-base text-gray-900">${displayAddress}${displayUnit}</h3>
                            <button class="text-gray-400 text-xs"><i class="fas fa-info-circle"></i></button>
                            <button class="text-gray-400 text-xs"><i class="fas fa-ellipsis-v"></i></button>
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0">
                            <span class="px-1.5 py-0.5 border border-gray-300 rounded text-[10px] text-gray-500">L-ID: ${listing.lid || '--'}</span>
                            <span class="px-1.5 py-0.5 border border-gray-300 rounded text-[10px] text-gray-500">W-ID: ${listing.wid || '--'}</span>
                        </div>
                    </div>
                    <!-- Tags + price row -->
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center gap-1.5 text-[11px] text-gray-500">
                            <span class="px-1.5 py-0.5 bg-gray-100 rounded">${listing.era || 'Pre-War'}</span>
                            <span class="px-1.5 py-0.5 bg-gray-100 rounded">${ownershipLabel(listing.ownership)}</span>
                            ${listing.crossStreet ? '<span class="flex items-center gap-0.5"><i class="fas fa-arrows-alt-h text-gray-400 text-[9px]"></i>' + listing.crossStreet + '</span>' : ''}
                            <span class="px-1.5 py-0.5 bg-gray-100 rounded">${listing.neighborhood}</span>
                            <span>${listing.zip}</span>
                        </div>
                        <div class="flex items-center gap-3 flex-shrink-0">
                            <span class="px-2 py-0.5 ${getStatusBadgeClasses(listing.status)} rounded text-xs font-semibold">${statusLabel}</span>
                            ${participantOnlyBadge(listing)}
                            ${syndicationBadge(listing)}
                            ${listing.priceChange === 'down' ? '<span class="text-red-500 text-sm"><i class="fas fa-arrow-down"></i></span>' : ''}
                            <span class="text-xl font-bold">$${listing.price.toLocaleString()}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 text-[10px] text-gray-500 mb-3 justify-end">
                        <span>MT: $${listing.totalMonthly.toLocaleString()}</span>
                        <span>EST. MONTHLY: $${listing.totalMonthly.toLocaleString()}</span>
                    </div>
                    <!-- Main content: photo + details + agent -->
                    <div class="flex gap-4">
                        <!-- Photo -->
                        <div class="w-[260px] flex-shrink-0">
                            <div class="rounded-lg cm-photo-wrap" style="height:220px">
                                <img src="${getListingPhoto(listing)}" alt="${displayAddress}" class="cm-photo rounded-lg" loading="lazy">
                                <div class="absolute bottom-2 right-2 flex items-center gap-1 text-white text-[10px]"><span class="font-bold">${listing.photoCount}</span><i class="fas fa-images"></i></div>
                                ${listing.priceChange === 'down' ? '<div class="absolute top-2 left-2 px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded font-bold"><i class="fas fa-arrow-down mr-0.5"></i>PRICE DROP!</div>' : ''}
                            </div>
                        </div>
                        <!-- Details center -->
                        <div class="flex-1">
                            <!-- Specs -->
                            <div class="flex items-center gap-3 text-sm mb-3">
                                <span><strong>${listing.rooms}</strong> Rooms</span>
                                <span class="text-gray-300">|</span>
                                <span><strong>${listing.beds}</strong> Beds</span>
                                <span class="text-gray-300">|</span>
                                <span><strong>${listing.baths}</strong> Baths</span>
                                <span class="text-gray-300">|</span>
                                <span><strong>${listing.intSqft ? listing.intSqft.toLocaleString() : '--'}</strong> SqFt</span>
                                <span class="text-gray-300">|</span>
                                <span><strong>${listing.intSqft ? Math.round(listing.price / listing.intSqft) : '--'}</strong> $ per SqFt</span>
                            </div>
                            <!-- Dates -->
                            <div class="bg-gray-50 rounded-lg p-2.5 mb-3">
                                <div class="grid grid-cols-4 gap-2 text-xs">
                                    <div><span class="text-gray-500 text-[10px] uppercase block">Updated</span><span class="font-semibold">${listing.updatedDate || '--'}</span> ${listingFreshness(listing)}</div>
                                    <div><span class="text-gray-500 text-[10px] uppercase block">Listed</span><span class="font-semibold">${listing.listedDate}</span></div>
                                    <div><span class="text-gray-500 text-[10px] uppercase block">Avail. for Showing</span><span class="font-semibold">--</span></div>
                                    <div><span class="text-gray-500 text-[10px] uppercase block">DOM</span><span class="font-semibold">${listing.dom}</span></div>
                                </div>
                            </div>
                            <!-- Essential Features -->
                            <div class="bg-white border rounded-lg p-2.5">
                                <h4 class="font-bold text-sm mb-2">Essential Features</h4>
                                <div class="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs text-gray-600">
                                    <div><i class="fas fa-tree mr-1.5 text-gray-400 w-4 text-center"></i>No Private Outdoor Space</div>
                                    <div><i class="fas fa-tshirt mr-1.5 text-gray-400 w-4 text-center"></i>Washer/Dryer Allowed</div>
                                    <div><i class="fas fa-wind mr-1.5 text-gray-400 w-4 text-center"></i>-- Cooling</div>
                                    <div><i class="fas fa-building mr-1.5 text-gray-400 w-4 text-center"></i>-- Elevators</div>
                                    <div><i class="fas fa-door-open mr-1.5 text-gray-400 w-4 text-center"></i>-- Doorman</div>
                                    <div><i class="fas fa-star mr-1.5 text-gray-400 w-4 text-center"></i>-- Condition</div>
                                    <div><i class="fas fa-percentage mr-1.5 text-gray-400 w-4 text-center"></i>-- Financing Allowed</div>
                                    <div><i class="fas fa-coins mr-1.5 text-gray-400 w-4 text-center"></i>-- Shares</div>
                                </div>
                            </div>
                        </div>
                        <!-- Agent panel (right) -->
                        <div class="w-[220px] flex-shrink-0 border-l pl-4">
                            <div class="font-semibold text-sm">${listing.company}</div>
                            <div class="text-xs text-gray-500 mb-2">${listing.listingType || 'Exclusive'}</div>
                            <div class="text-sm font-medium">${listing.agentName || '--'}</div>
                            <div class="text-xs text-gray-500">${listing.company}</div>
                            ${listing.agentPhone ? '<div class="text-xs text-blue-600 mt-0.5"><i class="fas fa-phone text-[9px] text-green-500 mr-1"></i>' + listing.agentPhone + '</div>' : ''}
                            ${listing.agentEmail ? '<div class="text-xs text-blue-600"><i class="fas fa-envelope text-[9px] text-gray-400 mr-1"></i>' + listing.agentEmail + '</div>' : ''}
                        </div>
                    </div>
                    <!-- Action bar -->
                    <div class="flex items-center gap-2 mt-3 pt-3 border-t" onclick="event.stopPropagation()">
                        ${clientFeedbackIcons(listing)}
                        <button class="p-2 hover:bg-gray-100 rounded"><i class="fas fa-eye text-gray-400"></i></button>
                        <button class="p-2 hover:bg-gray-100 rounded"><i class="fas fa-folder text-gray-400"></i></button>
                        <button class="p-2 hover:bg-gray-100 rounded"><i class="fas fa-flag text-gray-400"></i></button>
                        ${isComingSoon(listing)
                            ? '<button class="flex items-center gap-2 px-3 py-1.5 border border-purple-200 rounded text-sm bg-purple-50 text-purple-400 cursor-not-allowed ml-4" disabled title="Coming Soon — No showings permitted until ' + (listing.comingSoonDate || 'active date') + '"><i class="fas fa-ban"></i> Showing Blocked <i class="fas fa-lock text-xs"></i></button>'
                            : '<button class="flex items-center gap-2 px-3 py-1.5 border rounded text-sm hover:bg-gray-100 ml-4"><i class="fas fa-eye"></i> Showing Instructions <i class="fas fa-chevron-down text-xs"></i></button>'
                        }
                    </div>
                    ${comingSoonShowingNotice(listing)}
                    </div>
                    ${listing.listingCategory === 'rental' ? '<div class="px-4 py-1 border-t border-gray-50">' + fareActDisclosure(listing) + '</div>' : ''}
                    <div class="px-4 py-1 text-[8px] text-gray-300 border-t border-gray-50" data-rebny-attribution>Listing courtesy of ${listing.company || 'REBNY RLS'} &middot; ${listing.agentName || ''} ${listing.agentPhone ? '&middot; ' + listing.agentPhone : ''}</div>
                </div>
            `}).join('');
        }

