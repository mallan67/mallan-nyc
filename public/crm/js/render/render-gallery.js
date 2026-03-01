        function renderGalleryView() {
            var container = document.getElementById('galleryResults');
            container.innerHTML = getFilteredListings().map(listing => {
                var stC = listing.status === 'ACTIVE' ? '#16a34a' : listing.status === 'PENDING' ? '#ea580c' : listing.status === 'COMING_SOON' ? '#7c3aed' : '#6b7280';
                var stB = listing.status === 'ACTIVE' ? '#dcfce7' : listing.status === 'PENDING' ? '#fff7ed' : listing.status === 'COMING_SOON' ? '#f5f3ff' : '#f3f4f6';
                var statusLabel = listing.status === 'COMING_SOON' ? 'COMING SOON' : listing.status;
                var displayAddress = listing.addressDisplayYN === false ? 'Address Available Upon Request' : listing.address;
                var displayUnit = listing.addressDisplayYN !== false ? listing.unit : '';
                var csGalleryBadge = listing.status === 'COMING_SOON' ? '<div class="absolute bottom-2 right-2 px-2 py-1 bg-purple-600 text-white text-[10px] font-bold rounded z-10" data-reso-field="StandardStatus" data-reso-value="ComingSoon" data-compliance="coming-soon-badge" title="UCBA D7: Coming Soon — max 14 days (D2). No showings or open houses.">Coming Soon' + (listing.comingSoonDate ? ' &mdash; No Showings Until <span' + resoData('comingSoonDate', listing.comingSoonDate) + '>' + listing.comingSoonDate + '</span>' : '') + '</div>' : '';
                return `
                <div class="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-all group ${searchResultsState.selectedListings.includes(listing.id) ? 'ring-2 ring-blue-500' : ''}" data-reso-field="ListingKey" data-reso-value="${listing.wid || listing.lid || listing.id}" data-listing-id="${listing.id}" data-source="REBNY-RLS">
                    <!-- Photo -->
                    <div class="relative cursor-pointer" onclick="openListingInNewTab(${listing.id})">
                        <div class="cm-photo-wrap cm-card-photo">
                            <img src="${getListingPhoto(listing)}" alt="${displayAddress}" class="cm-photo" loading="lazy">
                        </div>
                        <div class="absolute top-2 left-2"><input type="checkbox" class="w-4 h-4 rounded cursor-pointer" ${searchResultsState.selectedListings.includes(listing.id) ? 'checked' : ''} onclick="event.stopPropagation();toggleListingSelection(${listing.id})"></div>
                        ${listing.priceChange === 'down' ? '<div class="absolute top-2 right-2 px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded"><i class="fas fa-arrow-down mr-0.5"></i>PRICE DROP!</div>' : ''}
                        ${listing.newListing ? '<div class="absolute top-2 right-2 px-1.5 py-0.5 bg-green-500 text-white text-[10px] font-bold rounded">NEW ON THE MARKET!</div>' : ''}
                        ${csGalleryBadge}
                        <div class="absolute bottom-2 right-2 flex items-center gap-1 text-white text-[10px]"><span class="font-bold">${listing.photoCount}</span><i class="fas fa-images"></i></div>
                        <div class="absolute bottom-2 left-2"><button class="w-7 h-7 bg-white/80 backdrop-blur rounded flex items-center justify-center text-gray-600 hover:bg-white" onclick="event.stopPropagation()"><i class="fas fa-expand text-xs"></i></button></div>
                    </div>
                    <!-- Content -->
                    <div class="p-3">
                        <div class="flex items-start justify-between gap-1 mb-1">
                            <h4 class="font-bold text-sm text-gray-900 truncate">${displayAddress}${displayUnit ? ', ' + displayUnit : ''}</h4>
                            <div class="flex items-center gap-1 flex-shrink-0">
                                <button class="text-gray-400 text-xs"><i class="fas fa-info-circle"></i></button>
                                <button class="text-gray-400 text-xs"><i class="fas fa-ellipsis-v"></i></button>
                            </div>
                        </div>
                        <div class="flex items-center gap-1.5 text-[10px] text-gray-500 mb-1.5">
                            <span>${listing.era || 'Pre-War'}</span>
                            <span class="text-gray-300">|</span>
                            <span>${ownershipLabel(listing.ownership)}</span>
                            <span class="text-gray-300">|</span>
                            <span>${listing.neighborhood}</span>
                            <span class="text-gray-300">|</span>
                            <span>${listing.zip}</span>
                        </div>
                        <div class="text-xs text-gray-600 mb-1.5">
                            ${listing.beds} Beds &nbsp; ${listing.baths} Baths${listing.intSqft ? ' &nbsp; ' + listing.intSqft.toLocaleString() + ' SqFt &nbsp; ' + Math.round(listing.price / listing.intSqft).toLocaleString() + ' $ per SqFt' : ''}
                        </div>
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-1.5">
                                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold" style="background:${stB};color:${stC}"${resoData('status', listing.status)}>${statusLabel}</span>
                                ${participantOnlyBadge(listing)}
                                ${syndicationBadge(listing)}
                                <span class="text-sm font-bold text-gray-900"${resoData('price', listing.price)}>$${listing.price.toLocaleString()}</span>
                            </div>
                            <span class="text-[10px] text-gray-400"${resoData('totalMonthly', listing.totalMonthly)}>MT: $${listing.totalMonthly.toLocaleString()}</span>
                        </div>
                        <div class="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                            <div class="flex items-center gap-1">
                                ${clientFeedbackIcons(listing)}
                                <button class="p-1 hover:bg-gray-100 rounded text-gray-400"><i class="fas fa-eye text-xs"></i></button>
                                <button class="p-1 hover:bg-gray-100 rounded text-gray-400"><i class="fas fa-folder text-xs"></i></button>
                                ${isComingSoon(listing) ? '<span class="p-1 text-purple-400" title="Coming Soon — No showings until ' + (listing.comingSoonDate || 'active date') + '"><i class="fas fa-ban text-xs"></i></span>' : ''}
                            </div>
                            <button class="p-1 hover:bg-gray-100 rounded text-gray-400"><i class="fas fa-flag text-xs"></i></button>
                        </div>
                    </div>
                </div>
            `}).join('');
        }

