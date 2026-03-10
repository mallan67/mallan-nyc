        // ═══════════════════════════════════════════════════════════════════════════════
        // SORT CLIENT GRID + CREATE SEARCH FOR CLIENT
        // ═══════════════════════════════════════════════════════════════════════════════

        function sortClientGrid() {
            var sortBy = document.getElementById('clientSortBy');
            if (!sortBy) return;
            var val = sortBy.value;
            var grid = document.getElementById('clientCardGrid');
            if (!grid) return;

            // Works with both div cards and table rows
            var items = Array.from(grid.children);
            var stages = ['new_lead','qualified','requirements_confirmed','searching','touring','shortlist','offer_prep','offer_submitted','negotiation','contract_signed','closing_scheduled','closed'];

            items.sort(function(a, b) {
                // Extract client ID from onclick
                var aId = a.getAttribute('onclick') ? (a.getAttribute('onclick').match(/'([^']+)'/) || [])[1] || '' : '';
                var bId = b.getAttribute('onclick') ? (b.getAttribute('onclick').match(/'([^']+)'/) || [])[1] || '' : '';
                var aC = customerDB[aId];
                var bC = customerDB[bId];
                switch (val) {
                    case 'pipeline':
                        return stages.indexOf(b.dataset.stage || 'new_lead') - stages.indexOf(a.dataset.stage || 'new_lead');
                    case 'dealValue':
                        return ((bC && bC.dealValue) || 0) - ((aC && aC.dealValue) || 0);
                    case 'lastActivity':
                        return ((bC && bC.lastActivity) || '').localeCompare((aC && aC.lastActivity) || '');
                    default: // name
                        return (a.dataset.name || a.textContent.trim()).localeCompare(b.dataset.name || b.textContent.trim());
                }
            });
            items.forEach(function(item) { grid.appendChild(item); });
        }

        function createSearchForClient(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            var p = c.preferences || {};

            // Set working client context
            if (typeof setWorkingClient === 'function') setWorkingClient(clientId);

            // Pre-fill search criteria from client preferences
            var criteria = {};
            if (p.minPrice) criteria.minPrice = p.minPrice;
            if (p.maxPrice) criteria.maxPrice = p.maxPrice;
            if (p.minBeds) criteria.beds = p.minBeds + '+';
            if (p.propertyTypes && p.propertyTypes.length) criteria.types = p.propertyTypes;
            if (p.neighborhoods && p.neighborhoods.length) criteria.neighborhoods = p.neighborhoods;

            // Save as a new search immediately
            var searchName = c.name.split(' ')[0] + '\'s Auto-Search — ' + new Date().toLocaleDateString();
            var newSearch = {
                id: 'cs-' + Date.now(),
                name: searchName,
                criteria: criteria,
                dateCreated: new Date().toISOString().slice(0, 10),
                lastRun: new Date().toISOString().slice(0, 10),
                resultCount: 0
            };
            if (!c.savedSearches) c.savedSearches = [];
            c.savedSearches.push(newSearch);
            renderClientSearches(c);
            logClientActivity(clientId, 'search', 'Created new search: ' + searchName);
            showToast('Search created from ' + c.name + '\'s preferences', 'success');
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // TOAST NOTIFICATION HELPER
        // ═══════════════════════════════════════════════════════════════════════════════

        function showToast(message, type) {
            var colors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-blue-600', warning: 'bg-amber-600' };
            var icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
            var existing = document.getElementById('clientToast');
            if (existing) existing.remove();

            var toast = document.createElement('div');
            toast.id = 'clientToast';
            toast.className = 'fixed bottom-20 lg:bottom-6 right-6 ' + (colors[type] || 'bg-gray-800') + ' text-white px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 text-sm transition-opacity';
            toast.innerHTML = '<i class="fas ' + (icons[type] || 'fa-info-circle') + '"></i> ' + escapeHtml(message);
            toast.style.opacity = '0';
            document.body.appendChild(toast);
            requestAnimationFrame(function() { toast.style.opacity = '1'; });
            setTimeout(function() {
                toast.style.opacity = '0';
                setTimeout(function() { toast.remove(); }, 300);
            }, 3000);
        }

