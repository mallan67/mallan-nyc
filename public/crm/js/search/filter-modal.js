        // ═══════════════════════════════════════════════════════════════════════════════
        // FILTER MODAL FUNCTIONS
        // ═══════════════════════════════════════════════════════════════════════════════

        // Filter state
        var filterState = {
            statusFilters: {
                picked: false,
                liked: false,
                shown: false,
                disliked: false,
                newMatches: false,
                emailed: false,
                openHouses: false,
                notSelected: false
            },
            rangeFilters: {
                priceMin: 0,
                priceMax: 50000000,
                roomsMin: 0,
                roomsMax: 20,
                bedsMin: 0,
                bedsMax: 10,
                bathsMin: 0,
                bathsMax: 10
            }
        };

        function openFilterModal() {
            var modal = document.getElementById('filterModal');
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            updateFilterSummary();
            // Focus first focusable element
            var first = modal.querySelector('input, select, button');
            if (first) setTimeout(function() { first.focus(); }, 50);
        }

        function closeFilterModal() {
            document.getElementById('filterModal').classList.add('hidden');
            document.body.style.overflow = 'auto';
        }

        // ESC key to close filter modal
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                var fm = document.getElementById('filterModal');
                if (fm && !fm.classList.contains('hidden')) { closeFilterModal(); return; }
            }
        });

        function initializeFilterToggles() {
            // Add click handlers for toggle labels
            document.querySelectorAll('.filter-toggle-label').forEach(label => {
                label.addEventListener('click', function(e) {
                    if (e.target.tagName === 'INPUT') return; // Let checkbox handle itself
                    var checkbox = this.querySelector('.filter-checkbox');
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        updateToggleVisual(this, checkbox.checked);
                        var filterName = checkbox.dataset.filter;
                        filterState.statusFilters[filterName] = checkbox.checked;
                        updateFilterSummary();
                    }
                });
            });

            // Add change handlers for checkboxes
            document.querySelectorAll('.filter-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', function() {
                    var label = this.closest('.filter-toggle-label');
                    updateToggleVisual(label, this.checked);
                    filterState.statusFilters[this.dataset.filter] = this.checked;
                    updateFilterSummary();
                });
            });
        }

        function updateToggleVisual(label, isChecked) {
            var toggleBg = label.querySelector('.filter-toggle-bg');
            var toggleDot = label.querySelector('.filter-toggle-dot');
            if (isChecked) {
                toggleBg.classList.remove('bg-gray-200');
                toggleBg.classList.add('bg-blue-600');
                toggleDot.style.transform = 'translateX(16px)';
                label.classList.add('border-blue-300', 'bg-blue-50');
            } else {
                toggleBg.classList.remove('bg-blue-600');
                toggleBg.classList.add('bg-gray-200');
                toggleDot.style.transform = 'translateX(0)';
                label.classList.remove('border-blue-300', 'bg-blue-50');
            }
        }

        function updateFilterPriceDisplay() {
            var min = parseInt(document.getElementById('filterPriceMin').value);
            var max = parseInt(document.getElementById('filterPriceMax').value);
            filterState.rangeFilters.priceMin = min;
            filterState.rangeFilters.priceMax = max;
            var formatPrice = (val) => val >= 1000000 ? '$' + (val / 1000000).toFixed(1) + 'M' : '$' + (val / 1000).toFixed(0) + 'K';
            document.getElementById('filterPriceDisplay').textContent = formatPrice(min) + ' - ' + (max >= 50000000 ? '$50M+' : formatPrice(max));
            updateFilterSummary();
        }

        function updateFilterRoomsDisplay() {
            var min = parseInt(document.getElementById('filterRoomsMin').value);
            var max = parseInt(document.getElementById('filterRoomsMax').value);
            filterState.rangeFilters.roomsMin = min;
            filterState.rangeFilters.roomsMax = max;
            document.getElementById('filterRoomsDisplay').textContent = (min === 0 ? 'Any' : min) + ' - ' + (max >= 20 ? 'Any' : max);
            updateFilterSummary();
        }

        function updateFilterBedsDisplay() {
            var min = parseInt(document.getElementById('filterBedsMin').value);
            var max = parseInt(document.getElementById('filterBedsMax').value);
            filterState.rangeFilters.bedsMin = min;
            filterState.rangeFilters.bedsMax = max;
            document.getElementById('filterBedsDisplay').textContent = (min === 0 ? 'Any' : min) + ' - ' + (max >= 10 ? 'Any' : max);
            updateFilterSummary();
        }

        function updateFilterBathsDisplay() {
            var min = parseFloat(document.getElementById('filterBathsMin').value);
            var max = parseFloat(document.getElementById('filterBathsMax').value);
            filterState.rangeFilters.bathsMin = min;
            filterState.rangeFilters.bathsMax = max;
            document.getElementById('filterBathsDisplay').textContent = (min === 0 ? 'Any' : min) + ' - ' + (max >= 10 ? 'Any' : max);
            updateFilterSummary();
        }

        function updateFilterSummary() {
            var activeFilters = [];

            // Check status filters
            Object.entries(filterState.statusFilters).forEach(([key, value]) => {
                if (value) {
                    activeFilters.push({
                        type: 'status',
                        key: key,
                        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')
                    });
                }
            });

            // Check range filters
            if (filterState.rangeFilters.priceMin > 0 || filterState.rangeFilters.priceMax < 50000000) {
                activeFilters.push({ type: 'range', key: 'price', label: 'Price Range' });
            }
            if (filterState.rangeFilters.roomsMin > 0 || filterState.rangeFilters.roomsMax < 20) {
                activeFilters.push({ type: 'range', key: 'rooms', label: 'Rooms' });
            }
            if (filterState.rangeFilters.bedsMin > 0 || filterState.rangeFilters.bedsMax < 10) {
                activeFilters.push({ type: 'range', key: 'beds', label: 'Bedrooms' });
            }
            if (filterState.rangeFilters.bathsMin > 0 || filterState.rangeFilters.bathsMax < 10) {
                activeFilters.push({ type: 'range', key: 'baths', label: 'Bathrooms' });
            }

            var summaryEl = document.getElementById('activeFilterSummary');
            var tagsEl = document.getElementById('activeFilterTags');

            if (activeFilters.length > 0) {
                summaryEl.classList.remove('hidden');
                tagsEl.innerHTML = activeFilters.map(f => `
                    <span class="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                        ${f.label}
                        <button onclick="removeFilter('${f.type}', '${f.key}')" class="hover:text-blue-900" aria-label="Close">
                            <i class="fas fa-times"></i>
                        </button>
                    </span>
                `).join('');
            } else {
                summaryEl.classList.add('hidden');
            }

            // Update result count (mock)
            var resultCount = (typeof getFilteredListings === 'function') ? getFilteredListings(true).length : 0;
            document.getElementById('filterResultCount').textContent = resultCount + ' Results Match';
        }

        function removeFilter(type, key) {
            if (type === 'status') {
                filterState.statusFilters[key] = false;
                var checkbox = document.querySelector(`[data-filter="${key}"]`);
                if (checkbox) {
                    checkbox.checked = false;
                    var label = checkbox.closest('.filter-toggle-label');
                    if (label) updateToggleVisual(label, false);
                }
            } else if (type === 'range') {
                if (key === 'price') {
                    filterState.rangeFilters.priceMin = 0;
                    filterState.rangeFilters.priceMax = 50000000;
                    document.getElementById('filterPriceMin').value = 0;
                    document.getElementById('filterPriceMax').value = 50000000;
                    updateFilterPriceDisplay();
                } else if (key === 'rooms') {
                    filterState.rangeFilters.roomsMin = 0;
                    filterState.rangeFilters.roomsMax = 20;
                    document.getElementById('filterRoomsMin').value = 0;
                    document.getElementById('filterRoomsMax').value = 20;
                    updateFilterRoomsDisplay();
                } else if (key === 'beds') {
                    filterState.rangeFilters.bedsMin = 0;
                    filterState.rangeFilters.bedsMax = 10;
                    document.getElementById('filterBedsMin').value = 0;
                    document.getElementById('filterBedsMax').value = 10;
                    updateFilterBedsDisplay();
                } else if (key === 'baths') {
                    filterState.rangeFilters.bathsMin = 0;
                    filterState.rangeFilters.bathsMax = 10;
                    document.getElementById('filterBathsMin').value = 0;
                    document.getElementById('filterBathsMax').value = 10;
                    updateFilterBathsDisplay();
                }
            }
            updateFilterSummary();
        }

        function resetAllFilters() {
            // Reset status filters
            Object.keys(filterState.statusFilters).forEach(key => {
                filterState.statusFilters[key] = false;
                var checkbox = document.querySelector(`[data-filter="${key}"]`);
                if (checkbox) {
                    checkbox.checked = false;
                    var label = checkbox.closest('.filter-toggle-label');
                    if (label) updateToggleVisual(label, false);
                }
            });

            // Reset range filters
            filterState.rangeFilters = {
                priceMin: 0, priceMax: 50000000,
                roomsMin: 0, roomsMax: 20,
                bedsMin: 0, bedsMax: 10,
                bathsMin: 0, bathsMax: 10
            };

            document.getElementById('filterPriceMin').value = 0;
            document.getElementById('filterPriceMax').value = 50000000;
            document.getElementById('filterRoomsMin').value = 0;
            document.getElementById('filterRoomsMax').value = 20;
            document.getElementById('filterBedsMin').value = 0;
            document.getElementById('filterBedsMax').value = 10;
            document.getElementById('filterBathsMin').value = 0;
            document.getElementById('filterBathsMax').value = 10;

            updateFilterPriceDisplay();
            updateFilterRoomsDisplay();
            updateFilterBedsDisplay();
            updateFilterBathsDisplay();
            updateFilterSummary();
        }

        function applyFilters() {
            // Apply filters to search results
            if (typeof renderSearchResults === 'function') {
                renderSearchResults();
            }
            closeFilterModal();

            // Show notification
            var activeCount = Object.values(filterState.statusFilters).filter(v => v).length;
        }

