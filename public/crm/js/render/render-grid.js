        function renderGridView() {
            try {
                var cols = searchResultsState.visibleColumns.filter(function(id) { return gridColumnDefs[id]; });
                // Fallback: if no valid columns, use defaults
                if (cols.length === 0) {
                    cols = ['address', 'unit', 'price', 'beds', 'baths', 'status'];
                }
                var table = document.getElementById('resultsTable');
                if (!table) { return; }

                // Build <thead> dynamically
                var theadHTML = '<thead class="bg-gray-50 border-b border-gray-200 sticky top-0"><tr>';
                theadHTML += '<th class="px-2 py-1.5 w-8 text-left"><input type="checkbox" class="w-3.5 h-3.5" onclick="toggleSelectAll()" id="gridSelectAll"></th>';
                theadHTML += '<th class="px-1.5 py-1.5 w-10 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide"></th>';
                cols.forEach(function(colId) {
                    var def = gridColumnDefs[colId];
                    var sortIcon = '';
                    if (searchResultsState.sortField === colId) {
                        sortIcon = searchResultsState.sortOrder === 'asc' ? ' <i class="fas fa-arrow-up text-blue-500 text-[9px]"></i>' : ' <i class="fas fa-arrow-down text-blue-500 text-[9px]"></i>';
                    } else {
                        sortIcon = ' <i class="fas fa-sort text-gray-300 text-[9px]"></i>';
                    }
                    theadHTML += '<th class="px-2 py-1.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:bg-gray-100 whitespace-nowrap select-none"' + (def.reso ? ' data-reso-field="' + def.reso + '"' : '') + ' onclick="toggleColumnSort(\'' + colId + '\')">' + def.label + sortIcon + '</th>';
                });
                theadHTML += '<th class="px-1.5 py-1.5 w-16 text-right"><button onclick="openGridLayoutsModal()" class="p-1 hover:bg-gray-200 rounded text-gray-400" title="Customize columns"><i class="fas fa-sliders-h text-xs"></i></button></th>';
                theadHTML += '</tr></thead>';

                // Build <tbody>
                var listings = getFilteredListings();
                var tbodyHTML = '<tbody class="divide-y divide-gray-100">';
                if (listings.length === 0) {
                    tbodyHTML += '<tr><td colspan="' + (cols.length + 3) + '" class="px-4 py-8 text-center text-gray-400"><i class="fas fa-search text-2xl mb-2"></i><br>No results found</td></tr>';
                } else {
                    listings.forEach(function(listing) {
                        var selected = searchResultsState.selectedListings.includes(listing.id);
                        tbodyHTML += '<tr class="hover:bg-gray-50 transition-colors ' + (selected ? 'bg-blue-50' : '') + '" data-reso-field="ListingKey" data-reso-value="' + (listing.wid || listing.lid || listing.id) + '" data-listing-id="' + listing.id + '" data-source="REBNY-RLS" onclick="openListingInNewTab(' + listing.id + ')" style="cursor:pointer;">';
                        tbodyHTML += '<td class="px-2 py-1.5 w-8"><input type="checkbox" class="w-3.5 h-3.5" ' + (selected ? 'checked' : '') + ' onclick="event.stopPropagation(); toggleListingSelection(' + listing.id + ')"></td>';
                        tbodyHTML += '<td class="px-1.5 py-1.5 w-10">';
                        if (listing.priceChange === 'down') tbodyHTML += '<span class="inline-flex items-center justify-center w-5 h-5 bg-orange-100 text-orange-600 rounded text-[10px]"><i class="fas fa-arrow-down"></i></span>';
                        if (listing.newListing) tbodyHTML += '<span class="inline-flex items-center justify-center w-5 h-5 bg-green-100 text-green-600 rounded text-[9px] font-bold">NL</span>';
                        if (listing.permissions && listing.permissions.participantOnly) tbodyHTML += '<span class="inline-flex items-center justify-center w-5 h-5 bg-red-100 text-red-600 rounded text-[7px] font-bold" title="Participant Only — restricted distribution">PO</span>';
                        tbodyHTML += syndicationBadgeCompact(listing);
                        tbodyHTML += comingSoonBadgeCompact(listing);
                        tbodyHTML += '</td>';
                        cols.forEach(function(colId) {
                            tbodyHTML += '<td class="px-2 py-1.5 whitespace-nowrap text-xs">' + gridColumnDefs[colId].render(listing) + '</td>';
                        });
                        tbodyHTML += '<td class="px-1.5 py-1.5"><div class="flex items-center gap-0.5">';
                        tbodyHTML += clientFeedbackIcons(listing);
                        tbodyHTML += '<button class="p-0.5 hover:bg-gray-100 rounded text-gray-400" title="Info" onclick="event.stopPropagation();"><i class="fas fa-info-circle text-[11px]"></i></button>';
                        tbodyHTML += '<button class="p-0.5 hover:bg-gray-100 rounded text-gray-400" title="Add to set" onclick="event.stopPropagation();"><i class="fas fa-folder-plus text-[11px]"></i></button>';
                        tbodyHTML += '</div></td>';
                        tbodyHTML += '</tr>';
                    });
                }
                tbodyHTML += '</tbody>';

                // REBNY attribution footer row
                tbodyHTML += '<tfoot><tr><td colspan="' + (cols.length + 3) + '" class="px-2 py-1.5 text-[9px] text-gray-400 border-t" data-rebny-attribution>Listing data courtesy of the REBNY Listing Service (RLS) via Trestle &middot; Mallan Real Estate Inc. #10991205323 &middot; Information deemed reliable but not guaranteed &middot; Equal Housing Opportunity</td></tr></tfoot>';

                table.innerHTML = theadHTML + tbodyHTML;
            } catch(e) {
                // Silent error handling
            }
        }

        // Generate inline-style colors for listing photo placeholder (bypasses Tailwind CDN)
        function getListingColor(id) {
            var palettes = [
                { bg: '#f8fafc', accent: '#94a3b8', icon: '#cbd5e1' }, // slate
                { bg: '#eff6ff', accent: '#60a5fa', icon: '#93c5fd' }, // blue
                { bg: '#faf5ff', accent: '#a78bfa', icon: '#c4b5fd' }, // violet
                { bg: '#f0fdfa', accent: '#2dd4bf', icon: '#5eead4' }, // teal
                { bg: '#fff7ed', accent: '#fb923c', icon: '#fdba74' }, // orange
                { bg: '#fef2f2', accent: '#f87171', icon: '#fca5a5' }, // red
                { bg: '#f0fdf4', accent: '#4ade80', icon: '#86efac' }, // green
                { bg: '#fefce8', accent: '#facc15', icon: '#fde047' }, // yellow
                { bg: '#fdf4ff', accent: '#e879f9', icon: '#f0abfc' }, // fuchsia
                { bg: '#ecfeff', accent: '#22d3ee', icon: '#67e8f9' }  // cyan
            ];
            return palettes[(id - 1) % palettes.length];
        }
