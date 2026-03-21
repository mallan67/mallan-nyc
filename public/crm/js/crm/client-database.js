// ============================================
// CUSTOMER MODE
// ============================================
// Client data is loaded from the API at runtime.
// No hardcoded demo/mock clients — real data only.
// Uses escapeHtml() from nav.js for XSS prevention.
// Uses ClientNormalizer from core/client-normalizer.js.
var customerDB = {};

// Agent-scoped client filtering — broker sees all, agent sees only their own
function getMyClients() {
    var clients = {};
    for (var id in customerDB) {
        var c = customerDB[id];
        if (LOGGED_IN_AGENT.role === 'broker' || c.agentId === LOGGED_IN_AGENT.id) {
            clients[id] = c;
        }
    }
    return clients;
}

// Navigate to client workspace in CRM dashboard
function openClientWorkspace(clientId) {
    if (!clientId) return;
    window.location.href = '/crm/dashboard.html#/workspace/client/' + encodeURIComponent(clientId) + '/overview';
}

// Dynamically render client card grid (replaces hardcoded HTML cards)
function renderClientGrid() {
    var tbody = document.getElementById('clientTableBody');
    if (!tbody) return;
    var clients = getMyClients();
    var E = typeof escapeHtml === 'function' ? escapeHtml : function (s) { return String(s || ''); };
    var stageLabels = { new_lead:'New Lead', qualified:'Qualified', requirements_confirmed:'Req. Confirmed', searching:'Searching', touring:'Touring', shortlist:'Shortlist', offer_prep:'Offer Prep', offer_submitted:'Offer', negotiation:'Negotiating', contract_signed:'Contract', closing_scheduled:'Closing', closed:'Closed' };
    var stageSteps = ['new_lead','qualified','requirements_confirmed','searching','touring','shortlist','offer_prep','offer_submitted','negotiation','contract_signed','closing_scheduled','closed'];
    var typeColors = { Buyer:'blue', Renter:'green', Seller:'amber', Landlord:'purple', Investor:'indigo' };

    // Apply filters
    var typeFilter = document.getElementById('clientTypeFilter') ? document.getElementById('clientTypeFilter').value : 'all';
    var stageFilter = document.getElementById('clientStageFilter') ? document.getElementById('clientStageFilter').value : 'all';
    var searchText = (document.getElementById('clientDirectorySearch') ? document.getElementById('clientDirectorySearch').value : '').toLowerCase();

    var rows = [];
    var activeCount = 0, closedCount = 0;
    for (var id in clients) {
        var c = clients[id];
        // Normalize via shared utility
        if (typeof ClientNormalizer !== 'undefined') ClientNormalizer.normalize(c);
        var cs = c.clientStatus || 'active';
        if (cs === 'active') activeCount++;
        else closedCount++;
        // Tab filtering
        if (currentClientTab === 'active' && cs !== 'active') continue;
        if (currentClientTab === 'closed' && cs !== 'closed') continue;
        // Dropdown filters
        if (typeFilter !== 'all' && (c.clientType || c.type || '').toLowerCase() !== typeFilter) continue;
        if (stageFilter !== 'all' && c.dealStage !== stageFilter) continue;
        if (searchText && (c.name || '').toLowerCase().indexOf(searchText) === -1
            && (c.email || '').toLowerCase().indexOf(searchText) === -1
            && ((c.preferences && c.preferences.neighborhoods) || []).join(',').toLowerCase().indexOf(searchText) === -1) continue;
        rows.push({ id: id, client: c });
    }

    var html = '';
    rows.forEach(function(row) {
        var c = row.client;
        var cs = c.clientStatus || 'active';
        var p = c.preferences || {};
        var dealStage = c.dealStage || 'new_lead';
        var stageIdx = stageSteps.indexOf(dealStage);
        var stageColor = stageIdx >= 9 ? 'green' : stageIdx >= 6 ? 'purple' : stageIdx >= 3 ? 'blue' : 'gray';
        var tc = typeColors[c.type] || 'gray';
        var neighborhoods = E((p.neighborhoods || []).join(', ') || '\u2014');
        var beds = p.minBeds ? (p.maxBeds && p.maxBeds !== p.minBeds ? p.minBeds + '-' + p.maxBeds : p.minBeds + '+') : '\u2014';
        var baths = p.minBaths ? (p.maxBaths && p.maxBaths !== p.minBaths ? p.minBaths + '-' + p.maxBaths : p.minBaths + '+') : '\u2014';
        var lastAct = c.lastActivity ? Math.round((new Date() - new Date(c.lastActivity)) / 86400000) : null;
        var actColor = lastAct === null ? 'gray' : lastAct > 7 ? 'red' : lastAct > 3 ? 'amber' : 'green';
        var pendingAlerts = (c.matchedListings || []).filter(function(m) { return m.status === 'queued'; }).length;
        var savedSearchCount = (c.savedSearches || []).length;
        var portfolioCount = (c.portfolio && c.portfolio.listings) ? c.portfolio.listings.length : 0;

        html += '<tr onclick="openClientWorkspace(\'' + E(row.id) + '\')" class="border-b hover:bg-blue-50/50 cursor-pointer transition-colors">';

        // Name + avatar
        html += '<td class="px-4 py-3"><div class="flex items-center gap-2.5">';
        html += '<div class="w-8 h-8 bg-' + E(c.color) + '-100 text-' + E(c.color) + '-700 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0">' + E(c.initials) + '</div>';
        html += '<div class="min-w-0"><p class="font-semibold text-gray-900 text-sm truncate">' + E(c.name) + '</p>';
        html += '<p class="text-[11px] text-gray-400 truncate">' + E(c.email) + '</p></div>';
        html += '</div></td>';

        // Role
        html += '<td class="px-4 py-3"><span class="text-[10px] px-2 py-0.5 bg-' + E(tc) + '-100 text-' + E(tc) + '-700 rounded-full font-semibold">' + E(c.type) + '</span></td>';

        // Stage
        if (cs === 'closed') {
            var closedLabels = { purchased:'Purchased', rented:'Rented', sold:'Sold', leased:'Leased' };
            html += '<td class="px-4 py-3"><span class="text-[10px] px-2 py-0.5 bg-gray-800 text-white rounded-full font-semibold">' + E(closedLabels[c.closedType] || 'Closed') + '</span></td>';
        } else {
            html += '<td class="px-4 py-3"><span class="text-xs font-medium text-' + E(stageColor) + '-700">' + E(stageLabels[dealStage] || dealStage) + '</span></td>';
        }

        // Budget
        html += '<td class="px-4 py-3 text-right text-sm font-semibold text-gray-900 whitespace-nowrap">' + E(c.budget || '\u2014') + '</td>';

        // BD / BA
        html += '<td class="px-4 py-3 text-center text-xs text-gray-700">' + E(beds) + '</td>';
        html += '<td class="px-4 py-3 text-center text-xs text-gray-700">' + E(baths) + '</td>';

        // Neighborhood
        html += '<td class="px-4 py-3 text-xs text-gray-600 max-w-[160px] truncate" title="' + neighborhoods + '">' + neighborhoods + '</td>';

        // Activity
        html += '<td class="px-4 py-3">';
        html += '<span class="text-[11px] text-' + E(actColor) + '-600">' + (lastAct === null ? '\u2014' : lastAct === 0 ? 'Today' : lastAct + 'd') + '</span>';
        if (pendingAlerts > 0) html += ' <span class="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">' + pendingAlerts + '</span>';
        html += '</td>';

        // Actions
        html += '<td class="px-4 py-3 text-center"><div class="flex items-center justify-center gap-1">';
        if (savedSearchCount > 0) html += '<span class="w-6 h-6 flex items-center justify-center text-gray-400" title="' + savedSearchCount + ' saved searches"><i class="fas fa-search text-[10px]"></i></span>';
        if (portfolioCount > 0) html += '<span class="w-6 h-6 flex items-center justify-center text-gray-400" title="' + portfolioCount + ' portfolio listings"><i class="fas fa-folder text-[10px]"></i></span>';
        html += '</div></td>';

        html += '</tr>';
    });

    tbody.innerHTML = html || '<tr><td colspan="9" class="text-center py-12 text-gray-400"><i class="fas fa-users text-3xl mb-3 block text-gray-300"></i>No clients match filters</td></tr>';

    // Update tab counts
    var activeCountEl = document.getElementById('clientTabActiveCount');
    var closedCountEl = document.getElementById('clientTabClosedCount');
    if (activeCountEl) activeCountEl.textContent = activeCount;
    if (closedCountEl) closedCountEl.textContent = closedCount;
}

// Dynamically populate client select dropdown in delivery modal
function populateClientSelect() {
    var sel = document.getElementById('clientSelect');
    if (!sel) return;
    var clients = getMyClients();
    var E = typeof escapeHtml === 'function' ? escapeHtml : function (s) { return String(s || ''); };
    var html = '<option value="">-- Choose a client --</option>';

    if (LOGGED_IN_AGENT.role === 'broker') {
        // Group by agent
        var byAgent = {};
        for (var id in clients) {
            var c = clients[id];
            var aname = c.agentName || 'Unassigned';
            if (!byAgent[aname]) byAgent[aname] = [];
            byAgent[aname].push({ id: id, client: c });
        }
        for (var agent in byAgent) {
            html += '<optgroup label="' + E(agent) + '\'s Clients">';
            byAgent[agent].forEach(function(item) {
                html += '<option value="' + E(item.id) + '">' + E(item.client.name) + ' - ' + E(item.client.type) + ' (' + E(item.client.budget) + ')</option>';
            });
            html += '</optgroup>';
        }
    } else {
        // Group by type
        var buyers = [], renters = [];
        for (var id in clients) {
            var c = clients[id];
            if (c.type === 'Buyer') buyers.push({ id: id, client: c });
            else renters.push({ id: id, client: c });
        }
        if (buyers.length) {
            html += '<optgroup label="Buyers">';
            buyers.forEach(function(item) { html += '<option value="' + E(item.id) + '">' + E(item.client.name) + ' (' + E(item.client.budget) + ')</option>'; });
            html += '</optgroup>';
        }
        if (renters.length) {
            html += '<optgroup label="Renters">';
            renters.forEach(function(item) { html += '<option value="' + E(item.id) + '">' + E(item.client.name) + ' (' + E(item.client.budget) + ')</option>'; });
            html += '</optgroup>';
        }
    }

    sel.innerHTML = html;
}

function filterClientList() {
    var searchVal = (document.getElementById('clientDirectorySearch') ? document.getElementById('clientDirectorySearch').value : '').toLowerCase();
    var typeEl = document.getElementById('clientTypeFilter');
    var typeVal = (typeEl && typeEl.value !== 'all') ? typeEl.value.toLowerCase() : '';
    var stageEl = document.getElementById('clientStageFilter');
    var stageVal = (stageEl && stageEl.value !== 'all') ? stageEl.value : '';
    var rows = document.querySelectorAll('#clientCardGrid > tr');
    rows.forEach(function(row) {
        var text = row.textContent.toLowerCase();
        var matchSearch = !searchVal || text.indexOf(searchVal) !== -1;
        var matchType = !typeVal || (row.dataset.type || '').indexOf(typeVal) !== -1;
        var matchStage = !stageVal || row.dataset.stage === stageVal;
        row.style.display = (matchSearch && matchType && matchStage) ? '' : 'none';
    });
}

// ── Column sort for client table ──
var clientSortState = { column: '', direction: 'asc' };

function sortClientColumn(col) {
    if (clientSortState.column === col) {
        clientSortState.direction = clientSortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        clientSortState.column = col;
        clientSortState.direction = 'asc';
    }
    var grid = document.getElementById('clientCardGrid');
    if (!grid) return;
    var rows = Array.from(grid.querySelectorAll('tr'));
    var stages = ['new_lead','qualified','requirements_confirmed','searching','touring','shortlist','offer_prep','offer_submitted','negotiation','contract_signed','closing_scheduled','closed'];

    rows.sort(function(a, b) {
        var dir = clientSortState.direction === 'asc' ? 1 : -1;
        switch(col) {
            case 'name':
                return dir * ((a.dataset.name || '').localeCompare(b.dataset.name || ''));
            case 'stage':
                return dir * (stages.indexOf(a.dataset.stage || 'new_lead') - stages.indexOf(b.dataset.stage || 'new_lead'));
            case 'type':
                return dir * ((a.dataset.type || '').localeCompare(b.dataset.type || ''));
            case 'budget': {
                var aB = parseBudgetValue(a.querySelectorAll('td')[3]);
                var bB = parseBudgetValue(b.querySelectorAll('td')[3]);
                return dir * (aB - bB);
            }
            case 'beds': {
                var aBd = parseInt(a.querySelectorAll('td')[5] ? a.querySelectorAll('td')[5].textContent : '0') || 0;
                var bBd = parseInt(b.querySelectorAll('td')[5] ? b.querySelectorAll('td')[5].textContent : '0') || 0;
                return dir * (aBd - bBd);
            }
            case 'baths': {
                var aBa = parseInt(a.querySelectorAll('td')[6] ? a.querySelectorAll('td')[6].textContent : '0') || 0;
                var bBa = parseInt(b.querySelectorAll('td')[6] ? b.querySelectorAll('td')[6].textContent : '0') || 0;
                return dir * (aBa - bBa);
            }
            case 'neighborhood': {
                var aN = (a.querySelectorAll('td')[7] ? a.querySelectorAll('td')[7].textContent : '').toLowerCase();
                var bN = (b.querySelectorAll('td')[7] ? b.querySelectorAll('td')[7].textContent : '').toLowerCase();
                return dir * aN.localeCompare(bN);
            }
            default:
                return dir * ((a.dataset.name || '').localeCompare(b.dataset.name || ''));
        }
    });
    rows.forEach(function(row) { grid.appendChild(row); });
}

function parseBudgetValue(td) {
    if (!td) return 0;
    var text = td.textContent.replace(/[^0-9.KMB+\-]/gi, '');
    var num = parseFloat(text) || 0;
    if (text.toUpperCase().indexOf('B') !== -1) num *= 1000000000;
    else if (text.toUpperCase().indexOf('M') !== -1) num *= 1000000;
    else if (text.toUpperCase().indexOf('K') !== -1) num *= 1000;
    return num;
}

// ── HEADER CLIENT SELECTOR ──────────────────────────────────────────
function toggleHeaderClientDropdown() {
    var dd = document.getElementById('headerClientDropdown');
    if (!dd) return;
    var isHidden = dd.classList.contains('hidden');
    dd.classList.toggle('hidden');
    if (isHidden) populateHeaderClientList();
}

function populateHeaderClientList(filter) {
    var container = document.getElementById('headerClientList');
    if (!container) return;
    var clients = Object.values(getMyClients());
    if (filter) {
        var f = filter.toLowerCase();
        clients = clients.filter(function(c) {
            return (c.name||'').toLowerCase().indexOf(f) !== -1 ||
                   (c.email||'').toLowerCase().indexOf(f) !== -1;
        });
    }
    if (clients.length === 0) {
        container.innerHTML = '<div class="px-4 py-3 text-sm text-gray-400 text-center">No clients found</div>';
        return;
    }
    var E = typeof escapeHtml === 'function' ? escapeHtml : function(s){ return String(s||''); };
    container.innerHTML = clients.map(function(c) {
        var typeColor = c.type === 'Buyer' ? 'blue' : c.type === 'Renter' ? 'green' : 'gray';
        return '<button onclick="selectHeaderClient(\'' + E(c.id||c._id) + '\')" ' +
            'class="w-full text-left px-3 py-2.5 hover:bg-blue-50 text-sm flex items-center gap-3">' +
            '<div class="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">' +
            E((c.name||'?').charAt(0)) + '</div>' +
            '<div class="flex-1 min-w-0"><div class="font-medium text-gray-900 truncate">' + E(c.name) + '</div>' +
            '<div class="text-xs text-gray-400 truncate">' + E(c.email||'') + '</div></div>' +
            '<span class="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-' + typeColor + '-100 text-' + typeColor + '-700">' +
            E(c.type||'') + '</span></button>';
    }).join('');
}

function filterHeaderClients(event) {
    populateHeaderClientList(event.target.value);
}

function selectHeaderClient(clientId) {
    var client = (typeof customerDB !== 'undefined') ? customerDB[clientId] : null;
    if (!client) return;
    // Use global bridge to set currentWorkspaceClientId inside search-engine.js closure
    if (typeof window._setCWCId === 'function') window._setCWCId(clientId);
    // Update header label
    var label = document.getElementById('headerClientLabel');
    if (label) label.textContent = client.name || 'Client';
    // Update working-with banner
    var banner = document.getElementById('workingWithClientBanner');
    var bannerLabel = document.getElementById('workingClientLabel');
    if (banner) { banner.classList.remove('hidden'); banner.style.display = ''; }
    if (bannerLabel) bannerLabel.textContent = client.name || '';
    // Close dropdown
    var dd = document.getElementById('headerClientDropdown');
    if (dd) dd.classList.add('hidden');
    // Re-render via global bridge
    if (typeof window._crmRenderSearchResults === 'function') window._crmRenderSearchResults();
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
    var wrap = document.getElementById('headerClientSelectorWrap');
    if (wrap && !wrap.contains(e.target)) {
        var dd = document.getElementById('headerClientDropdown');
        if (dd) dd.classList.add('hidden');
    }
});
