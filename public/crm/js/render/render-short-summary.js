        function renderShortSummaryView() {
            var container = document.getElementById('shortSummaryResults');
            container.innerHTML = getFilteredListings().map(listing => {
                var displayAddress = listing.addressDisplayYN === false ? 'Address Available Upon Request' : escapeHtml(listing.address);
                var displayUnit = listing.addressDisplayYN === false ? '' : (listing.unit ? ', ' + escapeHtml(listing.unit) : '');
                var statusLabel = listing.status === 'ComingSoon' ? 'COMING SOON' : listing.status;
                return `
                <div class="border-b hover:bg-gray-50 cursor-pointer ${searchResultsState.selectedListings.includes(listing.id) ? 'bg-blue-50' : ''}" data-source="REBNY-RLS" data-listing-key="${escapeHtml(listing.wid || listing.id || '')}" data-listing-id="${listing.id}" onclick="openListingInNewTab('${listing.id}'); if (typeof isResultsMapOpen === 'function' && isResultsMapOpen()) { if (typeof panToListing === 'function') panToListing('${listing.id}'); }">
                    ${comingSoonBadge(listing)}
                    <div class="flex">
                    <!-- Photo (full height left) -->
                    <div class="w-[180px] flex-shrink-0 cm-photo-wrap relative">
                        <img src="${getListingPhoto(listing)}" alt="${displayAddress}" class="cm-photo" loading="lazy">
                        <div class="absolute top-2 left-2"><input type="checkbox" class="w-4 h-4" ${searchResultsState.selectedListings.includes(listing.id) ? 'checked' : ''} onclick="event.stopPropagation(); toggleListingSelection('${listing.id}')"></div>
                        <div class="absolute bottom-2 right-2 flex items-center gap-1 text-white text-[10px]"><span class="font-bold">${listing.photoCount}</span><i class="fas fa-images"></i></div>
                        ${listing.priceChange === 'down' ? '<div class="absolute top-2 right-2 px-1.5 py-0.5 bg-red-500 text-white text-[9px] rounded font-bold"><i class="fas fa-arrow-down"></i></div>' : ''}
                    </div>
                    <!-- Content -->
                    <div class="flex-1 p-3 min-w-0">
                        <!-- Header: address + IDs -->
                        <div class="flex items-start justify-between gap-2 mb-1">
                            <div class="flex items-center gap-2">
                                <h3 class="font-bold text-sm text-gray-900">${displayAddress}${displayUnit}</h3>
                                <button class="text-gray-400 text-xs"><i class="fas fa-info-circle"></i></button>
                                <button class="text-gray-400 text-xs"><i class="fas fa-ellipsis-v"></i></button>
                            </div>
                            <div class="flex items-center gap-1.5 flex-shrink-0">
                                <span class="px-1.5 py-0.5 ${getStatusBadgeClasses(listing.status)} rounded text-[10px] font-semibold">${statusLabel}</span>
                                ${participantOnlyBadge(listing)}
                                ${syndicationBadge(listing)}
                            </div>
                        </div>
                        <!-- Tags -->
                        <div class="flex items-center gap-1.5 text-[11px] text-gray-500 mb-2">
                            <span class="px-1.5 py-0.5 bg-gray-100 rounded">${escapeHtml(listing.era || '--')}</span>
                            <span class="px-1.5 py-0.5 bg-gray-100 rounded">${ownershipLabel(listing.ownership)}</span>
                            <span class="px-1.5 py-0.5 bg-gray-100 rounded">${escapeHtml(listing.neighborhood)}</span>
                            ${listing.crossStreet ? '<span class="flex items-center gap-0.5"><i class="fas fa-arrows-alt-h text-gray-400 text-[9px]"></i>' + escapeHtml(listing.crossStreet) + '</span>' : ''}
                            <span>${escapeHtml(listing.zip)}</span>
                            <span class="ml-auto text-[10px] text-gray-400">L-ID: ${escapeHtml(listing.lid || '--')}</span>
                            <span class="text-[10px] text-gray-400">W-ID: ${escapeHtml(listing.wid || '--')}</span>
                        </div>
                        <!-- 4-column data grid -->
                        <div class="grid grid-cols-4 gap-x-4 gap-y-0.5 text-xs">
                            <!-- Col 1: Price -->
                            <div>
                                <div class="flex justify-between"><span class="text-gray-500">Price:</span><span class="font-bold">${formatCurrency(listing.price)}</span></div>
                                ${listing.originalPrice ? '<div class="text-[10px] text-gray-400">(Originally $' + listing.originalPrice.toLocaleString() + ')</div>' : ''}
                                <div class="flex justify-between"><span class="text-gray-500">Rm/Bd/Bth:</span><span>${listing.rooms != null ? listing.rooms : '—'}/${listing.beds != null ? listing.beds : '—'}/${listing.baths != null ? listing.baths : '—'}</span></div>
                                <div class="flex justify-between"><span class="text-gray-500">SqFt:</span><span>${listing.intSqft ? listing.intSqft.toLocaleString() : '--'}</span></div>
                                <div class="flex justify-between"><span class="text-gray-500">$ per SqFt:</span><span>${listing.intSqft ? '$' + Math.round(listing.price / listing.intSqft) : '--'}</span></div>
                            </div>
                            <!-- Col 2: Financials -->
                            <div>
                                <div class="flex justify-between"><span class="text-gray-500">${listing.listingCategory === 'rental' ? 'Rent:' : 'Common Charges:'}</span><span>${formatCurrency(listing.maintCC)}</span></div>
                                <div class="flex justify-between"><span class="text-gray-500">RE Taxes:</span><span>${formatCurrency(listing.reTaxes)}</span></div>
                                <div class="flex justify-between"><span class="text-gray-500">Cooling:</span><span>--</span></div>
                                <div class="flex justify-between"><span class="text-gray-500">Washer/Dryer:</span><span>--</span></div>
                            </div>
                            <!-- Col 3: Features -->
                            <div>
                                <div class="flex justify-between"><span class="text-gray-500">Condition:</span><span>--</span></div>
                                <div class="flex justify-between"><span class="text-gray-500">Doorman:</span><span>--</span></div>
                                <div class="flex justify-between"><span class="text-gray-500">Elevators:</span><span>--</span></div>
                                <div class="flex justify-between"><span class="text-gray-500">Private Outdoor:</span><span>--</span></div>
                            </div>
                            <!-- Col 4: Dates -->
                            <div>
                                <div class="flex justify-between"><span class="text-gray-500">DOM:</span><span class="font-semibold">${listing.dom != null ? listing.dom : '—'}</span></div>
                                <div class="flex justify-between"><span class="text-gray-500">Listed:</span><span>${escapeHtml(listing.listedDate)}</span></div>
                                <div class="flex justify-between"><span class="text-gray-500">Updated:</span><span>${escapeHtml(listing.updatedDate || '--')}</span> ${listingFreshness(listing)}</div>
                            </div>
                        </div>
                    </div>
                    <!-- Agent panel (right) -->
                    <div class="w-[200px] flex-shrink-0 border-l p-3 text-xs">
                        <div class="font-semibold text-sm">${escapeHtml(listing.agentName || '--')}</div>
                        <div class="text-gray-500">${escapeHtml(listing.company)}</div>
                        ${listing.agentPhone ? '<div class="text-blue-600 mt-1"><i class="fas fa-phone text-[9px] text-green-500 mr-1"></i>' + escapeHtml(listing.agentPhone) + '</div>' : ''}
                        ${listing.agentEmail ? '<div class="text-blue-600 mt-0.5"><i class="fas fa-envelope text-[9px] text-gray-400 mr-1"></i>' + escapeHtml(listing.agentEmail) + '</div>' : ''}
                        <div class="flex items-center gap-1 mt-2">
                            ${clientFeedbackIcons(listing)}
                        </div>
                    </div>
                    </div>
                    ${isComingSoon(listing) ? '<div class="px-3 py-1 border-t border-gray-50">' + comingSoonShowingNotice(listing) + '</div>' : ''}
                    ${listing.listingCategory === 'rental' ? '<div class="px-3 py-1 border-t border-gray-50">' + fareActDisclosure(listing) + '</div>' : ''}
                    <div class="px-3 py-0.5 text-[8px] text-gray-300 border-t border-gray-50" data-rebny-attribution>Listing courtesy of ${escapeHtml(listing.company || 'REBNY RLS')}</div>
                </div>
            `}).join('');
        }

