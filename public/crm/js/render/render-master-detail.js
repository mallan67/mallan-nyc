        function renderMasterDetailView() {
            var listPanel = document.getElementById('masterListPanel');
            listPanel.innerHTML = getFilteredListings().map(listing => {
                var displayAddress = listing.addressDisplayYN === false ? 'Address Available Upon Request' : escapeHtml(listing.address);
                var selected = searchResultsState.selectedListings.includes(listing.id);
                var selIdx = searchResultsState.selectedListings.indexOf(listing.id) + 1;
                return `
                <div class="p-2.5 border-b hover:bg-gray-50 cursor-pointer flex gap-2.5 ${selected ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}" data-source="REBNY-RLS" data-listing-id="${listing.id}" onclick="showListingInDetailPanel('${listing.id}'); if (typeof isResultsMapOpen === 'function' && isResultsMapOpen()) { if (typeof panToListing === 'function') panToListing('${listing.id}'); }">
                    <div class="relative flex-shrink-0">
                        <div class="w-[140px] h-[100px] rounded-lg cm-photo-wrap">
                            <img src="${getListingPhotoThumb(listing)}" alt="${displayAddress}" class="cm-photo rounded-lg" loading="lazy">
                            <div class="absolute bottom-0 left-0 right-0 px-1.5 py-1 flex items-center justify-between" style="background:linear-gradient(transparent,rgba(0,0,0,0.45))">
                                <span class="text-[8px] font-medium text-white/90">${escapeHtml(listing.neighborhood)}</span>
                                <span class="text-white/70 text-[8px]"><i class="fas fa-camera"></i> ${listing.photoCount}</span>
                            </div>
                        </div>
                        <div class="absolute top-1.5 left-1.5">
                            <input type="checkbox" class="w-3.5 h-3.5" ${selected ? 'checked' : ''} onclick="event.stopPropagation(); toggleListingSelection('${listing.id}')">
                        </div>
                        ${selected ? '<span class="absolute top-1.5 left-7 w-4 h-4 bg-blue-500 text-white rounded text-[9px] flex items-center justify-center font-bold">' + selIdx + '</span>' : ''}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-start justify-between gap-1">
                            <h4 class="font-bold text-xs truncate">${displayAddress}${listing.addressDisplayYN !== false && listing.unit ? ', ' + escapeHtml(listing.unit) : ''}</h4>
                            ${syndicationBadgeCompact(listing)}
                            <span class="px-1.5 py-0.5 ${getStatusBadgeClasses(listing.status)} rounded text-[10px] font-semibold flex-shrink-0">${listing.status === 'ComingSoon' ? 'CS' : listing.status}</span>
                        </div>
                        <div class="flex items-center justify-between mt-0.5">
                            <div class="flex items-center gap-1 text-[10px] text-gray-500">
                                <span>${escapeHtml(listing.era || '--')}</span>
                                <span class="text-gray-300">|</span>
                                <span>${ownershipLabel(listing.ownership)}</span>
                                <span class="text-gray-300">|</span>
                                <span>${escapeHtml(listing.neighborhood)}</span>
                                <span class="text-gray-300">|</span>
                                <span>${escapeHtml(listing.zip)}</span>
                            </div>
                            <span class="text-xs font-bold">${formatCurrency(listing.price)}</span>
                        </div>
                        <div class="text-[10px] text-gray-500 mt-0.5">CC: $${listing.maintCC} &nbsp; RET: $${listing.reTaxes}</div>
                        <div class="flex items-center gap-2 text-[11px] mt-1">
                            <span><strong>${listing.rooms != null ? listing.rooms : '—'}</strong> Rooms</span>
                            <span class="text-gray-300">|</span>
                            <span><strong>${listing.beds != null ? listing.beds : '—'}</strong> Beds</span>
                            <span class="text-gray-300">|</span>
                            <span><strong>${listing.baths != null ? listing.baths : '—'}</strong> Baths</span>
                            <span class="text-gray-300">|</span>
                            <span><strong>${listing.intSqft || '--'}</strong> SqFt</span>
                            <span class="text-gray-300">|</span>
                            <span><strong>${(listing.intSqft && listing.price != null) ? Math.round(listing.price / listing.intSqft).toLocaleString() : '—'}</strong> $/SF</span>
                        </div>
                        ${listing.priceChange === 'down' ? '<div class="mt-1"><span class="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] rounded font-bold"><i class="fas fa-arrow-down"></i> PRICE DROP!</span></div>' : ''}
                    </div>
                    <div class="flex-shrink-0 self-end">
                        <button class="p-1 hover:bg-gray-200 rounded"><i class="fas fa-flag text-gray-300 text-xs"></i></button>
                    </div>
                </div>
            `}).join('');

            // Show first listing in detail panel by default
            var filtered = getFilteredListings();
            if (filtered.length > 0) {
                showListingInDetailPanel(filtered[0].id);
            }
        }

        function showListingInDetailPanel(listingId) {
            var listing = listings.find(l => l.id === listingId);
            if (!listing) return;
            var displayAddress = listing.addressDisplayYN === false ? 'Address Available Upon Request' : escapeHtml(listing.address);
            var displayUnit = listing.addressDisplayYN !== false && listing.unit ? ', ' + escapeHtml(listing.unit) : '';
            var selected = searchResultsState.selectedListings.includes(listing.id);

            var detailPanel = document.getElementById('detailPanel');
            detailPanel.innerHTML = `
                <!-- Header -->
                <div class="flex items-center justify-between mb-1.5">
                    <div class="flex items-center gap-2">
                        <input type="checkbox" class="w-4 h-4" ${selected ? 'checked' : ''} onclick="toggleListingSelection('${listing.id}'); renderMasterDetailView();">
                        <h2 class="text-base font-bold">${displayAddress}${displayUnit}</h2>
                        <button class="text-gray-400 text-xs"><i class="fas fa-external-link-alt"></i></button>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 ${getStatusBadgeClasses(listing.status)} rounded text-xs font-semibold">${listing.status === 'ComingSoon' ? 'COMING SOON' : listing.status}</span>
                        ${comingSoonBadgeCompact(listing)}
                        ${participantOnlyBadge(listing)}
                        ${syndicationBadge(listing)}
                        <span class="text-lg font-bold">${formatCurrency(listing.price)}</span>
                    </div>
                </div>

                <!-- Sub-header: IDs + financial -->
                <div class="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-500 mb-1.5">
                    <span>L-ID: ${escapeHtml(listing.lid || '--')}</span>
                    <span>W-ID: ${escapeHtml(listing.wid || '--')}</span>
                    <span>CC: $${listing.maintCC}</span>
                    <span>RET: $${listing.reTaxes}</span>
                    <span>EST. MONTHLY: ${formatCurrency(listing.totalMonthly)}</span>
                </div>

                <!-- Tags -->
                <div class="flex items-center flex-wrap gap-1.5 mb-3">
                    <span class="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px]">${escapeHtml(listing.era || '--')}</span>
                    <span class="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px]">${ownershipLabel(listing.ownership)}</span>
                    ${listing.buildingName ? '<span class="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px]">' + escapeHtml(listing.buildingName) + '</span>' : ''}
                    <span class="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px]">${escapeHtml(listing.neighborhood)}</span>
                    ${listing.crossStreet ? '<span class="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px]"><i class="fas fa-arrows-alt-h mr-0.5 text-gray-400"></i>' + escapeHtml(listing.crossStreet) + '</span>' : ''}
                    <span class="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px]">${escapeHtml(listing.zip)}</span>
                </div>

                <!-- Photo — single large, full width -->
                <div class="rounded-xl cm-photo-wrap mb-3" style="height:320px">
                    <img src="${getListingPhoto(listing)}" alt="${displayAddress}" class="cm-photo rounded-xl" loading="lazy">
                    ${listing.priceChange === 'down' ? '<div class="absolute top-3 left-3 px-2 py-1 bg-red-500 text-white text-xs font-bold rounded"><i class="fas fa-arrow-down mr-1"></i>PRICE DROP!</div>' : ''}
                    <div class="cm-overlay rounded-b-xl px-3 py-2.5 flex items-center justify-between">
                        <button onclick="showListingDetail('${escapeHtml(listing.id)}')" class="px-3 py-1.5 bg-white/90 backdrop-blur rounded-lg text-xs shadow-sm flex items-center gap-2 text-gray-700 hover:bg-white"><i class="fas fa-th"></i> Floorplans</button>
                        <span class="text-white/90 text-xs font-semibold"><i class="fas fa-camera mr-1"></i>1 / ${listing.photoCount}</span>
                    </div>
                </div>

                <!-- Action icons -->
                <div class="flex items-center gap-1.5 mb-3 pb-3 border-b border-gray-100">
                    ${clientFeedbackIcons(listing)}
                    <button class="p-1.5 hover:bg-gray-100 rounded"><i class="fas fa-plus text-gray-500 text-sm"></i></button>
                    <button class="p-1.5 hover:bg-gray-100 rounded"><i class="fas fa-eye text-gray-500 text-sm"></i></button>
                    <button class="p-1.5 hover:bg-gray-100 rounded"><i class="fas fa-file-alt text-gray-500 text-sm"></i></button>
                    <button class="p-1.5 hover:bg-gray-100 rounded"><i class="fas fa-flag text-gray-500 text-sm"></i></button>
                    <button class="p-1.5 hover:bg-gray-100 rounded"><i class="fas fa-random text-gray-500 text-sm"></i></button>
                    ${isComingSoon(listing)
                        ? '<button class="p-1.5 bg-purple-50 rounded cursor-not-allowed" disabled title="Coming Soon — No showings permitted until ' + escapeHtml(listing.comingSoonDate || 'active date') + '"><i class="fas fa-ban text-purple-400 text-sm"></i></button>'
                        : '<button class="p-1.5 hover:bg-gray-100 rounded" title="Schedule Showing"><i class="fas fa-calendar-check text-gray-500 text-sm"></i></button>'
                    }
                    <button onclick="openListingCampaign('${escapeHtml(String(listing.lid || listing._listingId || listing.id))}')" class="ml-auto px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-semibold flex items-center gap-1.5" title="Create an investor / 1031 email campaign from this listing"><i class="fas fa-paper-plane text-[11px]"></i> Create Email Campaign</button>
                </div>
                ${comingSoonShowingNotice(listing)}

                <!-- Room specs -->
                <div class="flex items-center gap-3 text-sm mb-3">
                    <span><strong>${listing.rooms != null ? listing.rooms : '—'}</strong> Rooms</span>
                    <span class="text-gray-300">|</span>
                    <span><strong>${listing.beds != null ? listing.beds : '—'}</strong> Beds</span>
                    <span class="text-gray-300">|</span>
                    <span><strong>${listing.baths != null ? listing.baths : '—'}</strong> Baths</span>
                    <span class="text-gray-300">|</span>
                    <span><strong>${listing.intSqft ? listing.intSqft.toLocaleString() : '--'}</strong> SqFt</span>
                    <span class="text-gray-300">|</span>
                    <span><strong>${(listing.intSqft && listing.price != null) ? Math.round(listing.price / listing.intSqft).toLocaleString() : '—'}</strong> $ per SqFt</span>
                </div>

                <!-- Status / Dates grid -->
                <div class="bg-gray-50 rounded-lg p-3 mb-3">
                    <div class="grid grid-cols-4 gap-3 text-xs">
                        <div><span class="text-gray-500 block text-[10px]">STATUS</span><span class="px-1.5 py-0.5 ${getStatusBadgeClasses(listing.status)} rounded font-semibold text-[11px]">${listing.status}</span></div>
                        <div><span class="text-gray-500 block text-[10px]">UPDATED</span><span class="font-semibold">${escapeHtml(listing.updatedDate || '--')}</span> ${listingFreshness(listing)}</div>
                        <div><span class="text-gray-500 block text-[10px]">LISTED</span><span class="font-semibold">${escapeHtml(listing.listedDate)}</span></div>
                        <div><span class="text-gray-500 block text-[10px]">DOM</span><span class="font-semibold">${listing.dom != null ? listing.dom : '—'}</span></div>
                    </div>
                </div>

                <!-- Description -->
                ${listing.description ? '<div class="mb-3"><h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</h4><p class="text-sm text-gray-700 leading-relaxed">' + escapeHtml(listing.description) + '</p></div>' : ''}

                <!-- Financial Details -->
                <div class="bg-gray-50 rounded-lg p-3 mb-3">
                    <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Financial</h4>
                    <div class="grid grid-cols-3 gap-3 text-xs">
                        <div><span class="text-gray-500">List Price</span><div class="font-bold text-gray-900">${formatCurrency(listing.price)}</div></div>
                        <div><span class="text-gray-500">Common Charges</span><div class="font-semibold">$${listing.maintCC}/mo</div></div>
                        <div><span class="text-gray-500">RE Taxes</span><div class="font-semibold">$${listing.reTaxes}/mo</div></div>
                        <div><span class="text-gray-500">Est. Monthly</span><div class="font-semibold">${formatCurrency(listing.totalMonthly)}/mo</div></div>
                        <div><span class="text-gray-500">Price/SqFt</span><div class="font-semibold">${(listing.intSqft && listing.price != null) ? formatCurrency(Math.round(listing.price / listing.intSqft)) : '—'}</div></div>
                        ${listing.originalPrice ? '<div><span class="text-gray-500">Original Price</span><div class="font-semibold text-red-600">$' + listing.originalPrice.toLocaleString() + '</div></div>' : '<div><span class="text-gray-500">Price/Room</span><div class="font-semibold">' + ((listing.rooms && listing.price != null) ? formatCurrency(Math.round(listing.price / listing.rooms)) : '—') + '</div></div>'}
                    </div>
                </div>

                <!-- Unit Details -->
                <div class="bg-gray-50 rounded-lg p-3 mb-3">
                    <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Unit Details</h4>
                    <div class="grid grid-cols-3 gap-3 text-xs">
                        <div><span class="text-gray-500">Rooms</span><div class="font-semibold">${listing.rooms || '--'}</div></div>
                        <div><span class="text-gray-500">Bedrooms</span><div class="font-semibold">${listing.beds != null ? listing.beds : '—'}</div></div>
                        <div><span class="text-gray-500">Bathrooms</span><div class="font-semibold">${listing.baths != null ? listing.baths : '—'}</div></div>
                        <div><span class="text-gray-500">Int. SqFt</span><div class="font-semibold">${listing.intSqft ? listing.intSqft.toLocaleString() : '--'}</div></div>
                        <div><span class="text-gray-500">Floor</span><div class="font-semibold">${escapeHtml(listing.floor || '--')}</div></div>
                        <div><span class="text-gray-500">Exposures</span><div class="font-semibold">${escapeHtml(listing.exposures || '--')}</div></div>
                        <div><span class="text-gray-500">Condition</span><div class="font-semibold">${escapeHtml(listing.condition || '--')}</div></div>
                        <div><span class="text-gray-500">Outdoor Space</span><div class="font-semibold">--</div></div>
                        <div><span class="text-gray-500">W/D</span><div class="font-semibold">--</div></div>
                    </div>
                </div>

                <!-- Building Details -->
                <div class="bg-gray-50 rounded-lg p-3 mb-3">
                    <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Building</h4>
                    <div class="grid grid-cols-3 gap-3 text-xs">
                        <div><span class="text-gray-500">Building Name</span><div class="font-semibold">${escapeHtml(listing.buildingName || '--')}</div></div>
                        <div><span class="text-gray-500">Ownership</span><div class="font-semibold">${ownershipLabel(listing.ownership)}</div></div>
                        <div><span class="text-gray-500">Era</span><div class="font-semibold">${escapeHtml(listing.era || '--')}${listing.yearBuilt ? ' (' + listing.yearBuilt + ')' : ''}</div></div>
                        <div><span class="text-gray-500">Elevator</span><div class="font-semibold">--</div></div>
                        <div><span class="text-gray-500">Doorman</span><div class="font-semibold">--</div></div>
                        <div><span class="text-gray-500">Financing</span><div class="font-semibold">--</div></div>
                    </div>
                </div>

                <!-- Listing Broker -->
                <div class="bg-gray-50 rounded-lg p-3 mb-3">
                    <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Listing Broker</h4>
                    <div class="font-semibold text-sm">${escapeHtml(listing.company || '--')}</div>
                    <div class="text-xs text-gray-600 mt-0.5">${escapeHtml(listing.agentName || '--')}</div>
                    ${listing.agentPhone ? '<div class="text-xs text-blue-600">' + escapeHtml(listing.agentPhone) + '</div>' : ''}
                    ${listing.agentEmail ? '<div class="text-xs text-blue-600">' + escapeHtml(listing.agentEmail) + '</div>' : ''}
                </div>

                <!-- Compliance -->
                ${fareActDisclosure(listing)}
                <div class="text-[9px] text-gray-300 border-t pt-1.5 mt-2" data-rebny-attribution>Listing courtesy of ${escapeHtml(listing.company || 'REBNY RLS')} &middot; Information deemed reliable but not guaranteed</div>
            `;
        }

