        function renderSummaryView() {
            var container = document.getElementById('summaryResults');
            container.innerHTML = getFilteredListings().map(listing => {
                var displayAddress = listing.addressDisplayYN === false ? 'Address Available Upon Request' : escapeHtml(listing.address);
                var displayUnit = listing.addressDisplayYN === false ? '' : (listing.unit ? ', ' + escapeHtml(listing.unit) : '');
                var statusLabel = listing.status === 'ComingSoon' ? 'COMING SOON' : listing.status;
                var stC = listing.status === 'Active' ? '#16a34a' : listing.status === 'Pending' ? '#ea580c' : listing.status === 'ComingSoon' ? '#7c3aed' : '#6b7280';
                var stB = listing.status === 'Active' ? '#dcfce7' : listing.status === 'Pending' ? '#fff7ed' : listing.status === 'ComingSoon' ? '#f5f3ff' : '#f3f4f6';
                var selected = searchResultsState.selectedListings.includes(listing.id);
                return `
                <div class="listing-card mb-4 bg-white rounded-2xl overflow-hidden ${selected ? 'ring-2 ring-blue-500' : ''}" data-source="REBNY-RLS" data-listing-id="${listing.id}" data-listing-lid="${escapeHtml(listing.lid || '')}" style="box-shadow: 0 2px 12px rgba(0,0,0,0.04);">
                    ${comingSoonBadge(listing)}
                    <div class="flex" style="min-height: 280px;">
                        <!-- Photo — large, proper aspect ratio -->
                        <div class="relative flex-shrink-0 cursor-pointer" style="width: 340px;" onclick="openListingInNewTab('${listing.id}'); if (typeof isResultsMapOpen === 'function' && isResultsMapOpen()) { if (typeof panToListing === 'function') panToListing('${listing.id}'); }">
                            <div class="cm-photo-wrap w-full h-full" style="min-height: 280px;">
                                <img src="${getListingPhoto(listing)}" alt="${displayAddress}" class="cm-photo" loading="lazy" onerror="this.style.display='none'" data-photo-lid="${escapeHtml(listing.lid || '')}">
                            </div>
                            <!-- Checkbox overlay -->
                            <div class="absolute top-3 left-3 z-10">
                                <input type="checkbox" class="w-4.5 h-4.5 rounded cursor-pointer" style="width:18px;height:18px;" ${selected ? 'checked' : ''} onclick="event.stopPropagation(); toggleListingSelection('${listing.id}')">
                            </div>
                            <!-- Photo count -->
                            <div class="absolute bottom-3 right-3 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-[11px] px-2.5 py-1 rounded-lg z-10">
                                <span class="font-medium">${listing.photoCount || 0}</span><i class="fas fa-images text-[10px]"></i>
                            </div>
                            <!-- Price drop badge -->
                            ${listing.priceChange === 'down' ? '<div class="absolute top-3 right-3 px-2 py-1 bg-red-500 text-white text-[10px] rounded-lg font-bold z-10"><i class="fas fa-arrow-down mr-0.5"></i>PRICE DROP</div>' : ''}
                            ${listing.newListing ? '<div class="absolute top-3 right-3 px-2 py-1 bg-blue-600 text-white text-[10px] rounded-lg font-bold z-10">NEW</div>' : ''}
                        </div>

                        <!-- Content -->
                        <div class="flex-1 p-5 flex flex-col justify-between min-w-0">
                            <!-- Top: Address + Status + Price -->
                            <div>
                                <div class="flex items-start justify-between gap-3 mb-2">
                                    <div class="min-w-0">
                                        <h3 class="font-bold text-[17px] text-gray-900 truncate cursor-pointer hover:text-blue-600 transition-colors" onclick="openListingInNewTab('${listing.id}'); if (typeof isResultsMapOpen === 'function' && isResultsMapOpen()) { if (typeof panToListing === 'function') panToListing('${listing.id}'); }">${displayAddress}${displayUnit}</h3>
                                        <div class="flex items-center gap-2 mt-1 flex-wrap">
                                            <span class="px-2 py-0.5 bg-gray-100 rounded text-[11px] text-gray-600 font-medium">${escapeHtml(listing.era || '--')}</span>
                                            <span class="px-2 py-0.5 bg-gray-100 rounded text-[11px] text-gray-600 font-medium">${ownershipLabel(listing.ownership)}</span>
                                            <span class="text-[11px] text-gray-500">${escapeHtml(listing.neighborhood)}</span>
                                            <span class="text-[11px] text-gray-400">${escapeHtml(listing.zip)}</span>
                                            ${listing.crossStreet ? '<span class="text-[11px] text-gray-400"><i class="fas fa-arrows-alt-h text-[9px] mr-0.5"></i>' + escapeHtml(listing.crossStreet) + '</span>' : ''}
                                        </div>
                                    </div>
                                    <div class="flex flex-col items-end flex-shrink-0">
                                        <span class="text-xl font-bold text-gray-900"${cotalityData('price', listing.price)}>$${listing.price.toLocaleString()}</span>
                                        <div class="flex items-center gap-2 mt-1">
                                            <span class="px-2 py-0.5 rounded text-[11px] font-semibold" style="background:${stB};color:${stC}"${cotalityData('status', listing.status)}>${statusLabel}</span>
                                            ${participantOnlyBadge(listing)}
                                            ${syndicationBadge(listing)}
                                        </div>
                                    </div>
                                </div>

                                <!-- Specs row -->
                                <div class="flex items-center gap-4 text-sm text-gray-700 mb-3 mt-3">
                                    <span><strong>${listing.beds}</strong> Beds</span>
                                    <span class="text-gray-300">&middot;</span>
                                    <span><strong>${listing.baths}</strong> Baths</span>
                                    <span class="text-gray-300">&middot;</span>
                                    <span><strong>${listing.intSqft ? listing.intSqft.toLocaleString() : '--'}</strong> SF</span>
                                    ${listing.intSqft ? '<span class="text-gray-300">&middot;</span><span class="text-gray-500">$' + Math.round(listing.price / listing.intSqft).toLocaleString() + '/SF</span>' : ''}
                                    <span class="text-gray-300">&middot;</span>
                                    <span class="text-gray-500">CC: $${listing.maintCC ? listing.maintCC.toLocaleString() : '--'}</span>
                                </div>

                                <!-- Dates bar -->
                                <div class="bg-gray-50 rounded-xl p-3 mb-3">
                                    <div class="grid grid-cols-4 gap-3 text-xs">
                                        <div><span class="text-gray-400 text-[10px] uppercase tracking-wide block mb-0.5">Listed</span><span class="font-semibold text-gray-800">${escapeHtml(listing.listedDate || '--')}</span></div>
                                        <div><span class="text-gray-400 text-[10px] uppercase tracking-wide block mb-0.5">Updated</span><span class="font-semibold text-gray-800">${escapeHtml(listing.updatedDate || '--')}</span> ${listingFreshness(listing)}</div>
                                        <div><span class="text-gray-400 text-[10px] uppercase tracking-wide block mb-0.5">DOM</span><span class="font-semibold text-gray-800">${listing.dom || 0}</span></div>
                                        <div><span class="text-gray-400 text-[10px] uppercase tracking-wide block mb-0.5">IDs</span><span class="text-[10px] text-gray-500">${escapeHtml(listing.lid || '--')}</span></div>
                                    </div>
                                </div>
                            </div>

                            <!-- Bottom: Agent + Actions -->
                            <div class="flex items-end justify-between">
                                <!-- Agent info -->
                                <div class="text-xs text-gray-500">
                                    <span class="font-semibold text-gray-700">${escapeHtml(listing.agentName || '--')}</span>
                                    <span class="mx-1">&middot;</span>
                                    <span>${escapeHtml(listing.company || '--')}</span>
                                    ${listing.agentPhone ? '<span class="mx-1">&middot;</span><span class="text-blue-600">' + escapeHtml(listing.agentPhone) + '</span>' : ''}
                                </div>
                                <!-- Action buttons -->
                                <div class="flex items-center gap-1" onclick="event.stopPropagation()">
                                    ${clientFeedbackIcons(listing)}
                                    <button class="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors"><i class="fas fa-eye text-xs"></i></button>
                                    <button class="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors"><i class="fas fa-folder text-xs"></i></button>
                                    <button class="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors"><i class="fas fa-flag text-xs"></i></button>
                                    ${isComingSoon(listing)
                                        ? '<button class="flex items-center gap-1 px-2 py-1 border border-purple-200 rounded-lg text-[11px] bg-purple-50 text-purple-400 cursor-not-allowed ml-2" disabled><i class="fas fa-ban text-[9px]"></i> No Showings</button>'
                                        : ''
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                    ${listing.listingCategory === 'rental' ? '<div class="px-5 py-1 border-t border-gray-50">' + fareActDisclosure(listing) + '</div>' : ''}
                    <!-- Attribution footer -->
                    <div class="px-5 py-1.5 text-[9px] text-gray-300 border-t border-gray-50" data-rebny-attribution>Listing courtesy of ${escapeHtml(listing.company || 'REBNY RLS')}</div>
                </div>
            `}).join('');
        }

