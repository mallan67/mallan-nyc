(function() {
    'use strict';

    var NO_VOW_MODE = true;

    // ── localStorage keys ──
    var LS_KEYS = {
        clients: 'mallan_mock_clients_v1',
        collections: 'mallan_mock_collections_v1',
        activities: 'mallan_mock_activities_v1',
        showings: 'mallan_mock_showings_v1',
        threads: 'mallan_mock_threads_v1',
        messages: 'mallan_mock_messages_v1'
    };

    // ── Helpers ──
    function uid(prefix) {
        prefix = prefix || 'id';
        return prefix + '_' + Math.random().toString(16).slice(2) + '_' + Date.now().toString(16);
    }
    function nowISO() { return new Date().toISOString(); }
    function loadLS(key, fallback) {
        try { var v = JSON.parse(localStorage.getItem(key)); return v != null ? v : fallback; }
        catch(e) { return fallback; }
    }
    function saveLS(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

    // ── DB in memory (hydrated from localStorage) ──
    var DB = {
        clients: {},
        collections: {},
        activities: [],
        showings: {},
        threads: {},
        messages: {}
    };

    function hydrateDBFromStorage() {
        var storedClients = loadLS(LS_KEYS.clients, null);
        if (storedClients) {
            DB.clients = storedClients;
        } else if (typeof customerDB === 'object' && customerDB) {
            DB.clients = JSON.parse(JSON.stringify(customerDB));
        } else {
            DB.clients = {};
        }
        DB.collections = loadLS(LS_KEYS.collections, {});
        DB.activities = loadLS(LS_KEYS.activities, []);
        DB.showings = loadLS(LS_KEYS.showings, {});
        DB.threads = loadLS(LS_KEYS.threads, {});
        DB.messages = loadLS(LS_KEYS.messages, {});
        // Keep legacy variable in sync
        window.customerDB = DB.clients;
    }

    function persistDB() {
        saveLS(LS_KEYS.clients, DB.clients);
        saveLS(LS_KEYS.collections, DB.collections);
        saveLS(LS_KEYS.activities, DB.activities);
        saveLS(LS_KEYS.showings, DB.showings);
        saveLS(LS_KEYS.threads, DB.threads);
        saveLS(LS_KEYS.messages, DB.messages);
        window.customerDB = DB.clients;
    }

    hydrateDBFromStorage();

    // ── Activity Types ──
    var ACT = {
        COLLECTION_CREATED: 'COLLECTION_CREATED',
        COLLECTION_SENT: 'COLLECTION_SENT',
        COLLECTION_OPEN: 'COLLECTION_OPEN',
        LISTING_VIEW: 'LISTING_VIEW',
        LISTING_LIKE: 'LISTING_LIKE',
        LISTING_DISLIKE: 'LISTING_DISLIKE',
        REQUEST_INFO: 'REQUEST_INFO',
        REQUEST_SHOWING: 'REQUEST_SHOWING',
        MESSAGE_SENT: 'MESSAGE_SENT',
        SHOWING_SCHEDULED: 'SHOWING_SCHEDULED'
    };

    // ── Activity Logging ──
    function logMockActivity(opts) {
        DB.activities.push({
            id: uid('act'),
            clientId: opts.clientId,
            actorType: opts.actorType,
            type: opts.type,
            listingId: opts.listingId || null,
            collectionId: opts.collectionId || null,
            meta: opts.meta || null,
            createdAt: nowISO()
        });
        persistDB();
    }

    // ── Sanitize listing snapshot (allowlisted fields only — No-VOW safe) ──
    function sanitizeListingSnapshot(listing) {
        if (!listing) return null;
        return {
            id: listing.id,
            price: listing.price || listing.listPrice || null,
            address: listing.address || listing.fullAddress || null,
            unit: listing.unit || listing.unitNumber || null,
            beds: listing.beds != null ? listing.beds : (listing.bedrooms != null ? listing.bedrooms : null),
            baths: listing.baths != null ? listing.baths : (listing.bathrooms != null ? listing.bathrooms : null),
            sqft: listing.sqft != null ? listing.sqft : (listing.livingArea != null ? listing.livingArea : null),
            status: listing.status || listing.mlsStatus || null,
            updated: listing.updated || listing.lastUpdated || listing.modificationTimestamp || null,
            photo: (listing.photos && listing.photos[0]) ? listing.photos[0] : (listing.photoUrl || null),
            publicUrl: listing.publicUrl || listing.listingWebLink || null
        };
    }

    // ══════════════════════════════════════════════════════════════════
    // COLLECTIONS — curated sets of listings (No client search)
    // ══════════════════════════════════════════════════════════════════

    function createCollection(opts) {
        var id = uid('col');
        var agentId = (typeof LOGGED_IN_AGENT !== 'undefined' && LOGGED_IN_AGENT) ? LOGGED_IN_AGENT.id : 'agent_unknown';
        DB.collections[id] = {
            id: id,
            clientId: opts.clientId,
            agentId: agentId,
            title: opts.title || 'Untitled Collection',
            description: opts.description || '',
            status: 'DRAFT',
            createdAt: nowISO(),
            updatedAt: nowISO(),
            sentAt: null,
            items: []
        };
        logMockActivity({ clientId: opts.clientId, actorType: 'agent', type: ACT.COLLECTION_CREATED, collectionId: id, meta: { title: opts.title } });
        persistDB();
        return DB.collections[id];
    }

    function createCollectionFromSelectedListings(clientId, opts) {
        opts = opts || {};
        var selectedIds = (window.reportState && window.reportState.selectedListingIds) ? window.reportState.selectedListingIds.slice() : [];

        // If no report selection, try search selection
        if (!selectedIds.length && window.searchResultsState && window.searchResultsState.selectedListings) {
            selectedIds = window.searchResultsState.selectedListings.slice();
        }

        if (!clientId) { showToast('Select a client first.', 'warning'); return null; }
        if (!selectedIds.length) { showToast('Select at least 1 listing from search results first.', 'warning'); return null; }

        var allListings = (window.searchResultsState && window.searchResultsState.filteredListings) || window.mockListings || [];
        var selectedListings = allListings.filter(function(l) { return selectedIds.indexOf(l.id) > -1; });

        var col = createCollection({
            clientId: clientId,
            title: opts.title || 'Tour Set (' + new Date().toLocaleDateString() + ')',
            description: opts.description || ''
        });

        selectedListings.forEach(function(l, i) {
            col.items.push({
                id: uid('item'),
                listingId: l.id,
                source: 'RLS',
                position: i,
                clientStatus: 'UNDECIDED',
                requestedInfo: false,
                requestedShowing: false,
                snapshot: sanitizeListingSnapshot(l)
            });
        });

        col.updatedAt = nowISO();
        DB.collections[col.id] = col;
        persistDB();

        if (typeof showToast === 'function') showToast('Collection created with ' + selectedListings.length + ' listing(s)', 'success');
        // Re-render collections if workspace is open
        if (typeof renderClientCollections === 'function') {
            var c = (typeof customerDB !== 'undefined') ? customerDB[clientId] : null;
            if (c) renderClientCollections(clientId);
        }
        return col;
    }

    function sendCollectionToClient(collectionId) {
        var col = DB.collections[collectionId];
        if (!col) { showToast('Collection not found.', 'error'); return; }

        col.status = 'SENT';
        col.sentAt = nowISO();
        col.updatedAt = nowISO();
        DB.collections[collectionId] = col;

        logMockActivity({ clientId: col.clientId, actorType: 'agent', type: ACT.COLLECTION_SENT, collectionId: collectionId });
        persistDB();

        // Build mailto with collection items
        var c = DB.clients[col.clientId];
        if (c && c.email) {
            var agent = (typeof AGENT_PROFILE !== 'undefined') ? AGENT_PROFILE : { name: '', phone: '', email: '' };
            var subject = col.title + ' — ' + col.items.length + ' Curated Properties — Mallan Real Estate';
            var body = 'Hi ' + (c.name || '').split(' ')[0] + ',\n\n';
            body += 'I\'ve curated a collection of properties for you:\n';
            body += '"' + col.title + '" — ' + col.items.length + ' listing(s)\n\n';
            col.items.forEach(function(item, i) {
                var s = item.snapshot || {};
                var addr = s.address || 'Address on request';
                if (typeof addr === 'object') addr = addr.full || addr.streetNumber + ' ' + addr.streetName;
                body += (i + 1) + '. ' + addr + '\n';
                body += '   Price: ' + (s.price || 'TBD') + '\n';
                if (s.beds) body += '   Beds: ' + s.beds;
                if (s.baths) body += ' | Baths: ' + s.baths;
                if (s.sqft) body += ' | SqFt: ' + Number(s.sqft).toLocaleString();
                body += '\n\n';
            });
            body += '---\n';
            body += agent.name + '\nMallan Real Estate Inc.\n' + agent.phone + '\n\n';
            body += 'Listing(s) courtesy of the REBNY Listing Service (RLS).\n';
            body += 'Equal Housing Opportunity\n';
            body += 'To unsubscribe from updates, reply STOP.';

            window.location.href = 'mailto:' + encodeURIComponent(c.email) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
        }

        if (typeof showToast === 'function') showToast('Collection "' + col.title + '" sent to ' + (c ? c.name : 'client'), 'success');
        if (typeof logAuditEntry === 'function') logAuditEntry('collection_sent', { collectionId: collectionId, clientName: c ? c.name : '', itemCount: col.items.length });

        // Re-render
        if (typeof renderClientCollections === 'function') renderClientCollections(col.clientId);
    }

    // ── Client Interactions (mock portal simulation) ──
    function setClientItemStatus(collectionId, itemId, status) {
        var col = DB.collections[collectionId];
        if (!col) return;
        var item = null;
        for (var i = 0; i < col.items.length; i++) {
            if (col.items[i].id === itemId) { item = col.items[i]; break; }
        }
        if (!item) return;
        item.clientStatus = status;
        col.updatedAt = nowISO();
        persistDB();
        var type = status === 'LIKED' ? ACT.LISTING_LIKE : status === 'DISLIKED' ? ACT.LISTING_DISLIKE : ACT.LISTING_VIEW;
        logMockActivity({ clientId: col.clientId, actorType: 'client', type: type, listingId: item.listingId, collectionId: collectionId });
    }

    function requestInfo(collectionId, itemId) {
        var col = DB.collections[collectionId];
        if (!col) return;
        var item = null;
        for (var i = 0; i < col.items.length; i++) {
            if (col.items[i].id === itemId) { item = col.items[i]; break; }
        }
        if (!item) return;
        item.requestedInfo = true;
        col.updatedAt = nowISO();
        persistDB();
        logMockActivity({ clientId: col.clientId, actorType: 'client', type: ACT.REQUEST_INFO, listingId: item.listingId, collectionId: collectionId });
    }

    function requestShowing(collectionId, itemId, proposedTimes) {
        proposedTimes = proposedTimes || [];
        var col = DB.collections[collectionId];
        if (!col) return;
        var item = null;
        for (var i = 0; i < col.items.length; i++) {
            if (col.items[i].id === itemId) { item = col.items[i]; break; }
        }
        if (!item) return;
        item.requestedShowing = true;
        col.updatedAt = nowISO();

        var showingId = uid('show');
        DB.showings[showingId] = {
            id: showingId,
            clientId: col.clientId,
            agentId: col.agentId,
            listingId: item.listingId,
            status: 'PENDING',
            requestedTimes: proposedTimes,
            scheduledAt: null,
            createdAt: nowISO(),
            updatedAt: nowISO(),
            notesClient: '',
            notesAgent: ''
        };
        persistDB();
        logMockActivity({ clientId: col.clientId, actorType: 'client', type: ACT.REQUEST_SHOWING, listingId: item.listingId, collectionId: collectionId, meta: { showingId: showingId } });
    }

    function confirmShowing(showingId, scheduledAtISO) {
        var s = DB.showings[showingId];
        if (!s) return;
        s.status = 'CONFIRMED';
        s.scheduledAt = scheduledAtISO;
        s.updatedAt = nowISO();
        DB.showings[showingId] = s;
        persistDB();
        logMockActivity({ clientId: s.clientId, actorType: 'agent', type: ACT.SHOWING_SCHEDULED, listingId: s.listingId, meta: { showingId: showingId, scheduledAtISO: scheduledAtISO } });
    }

    // ── Messaging (mock threads) ──
    function getOrCreateThread(opts) {
        var keys = Object.keys(DB.threads);
        for (var i = 0; i < keys.length; i++) {
            var t = DB.threads[keys[i]];
            if (t.clientId === opts.clientId && (t.collectionId || null) === (opts.collectionId || null) && (t.listingId || null) === (opts.listingId || null)) {
                return t;
            }
        }
        var id = uid('thr');
        DB.threads[id] = { id: id, clientId: opts.clientId, collectionId: opts.collectionId || null, listingId: opts.listingId || null, createdAt: nowISO(), updatedAt: nowISO() };
        persistDB();
        return DB.threads[id];
    }

    function sendMessage(opts) {
        var senderType = opts.senderType || 'agent';
        var thread = getOrCreateThread({ clientId: opts.clientId, collectionId: opts.collectionId || null, listingId: opts.listingId || null });
        var mid = uid('msg');
        DB.messages[mid] = {
            id: mid,
            threadId: thread.id,
            senderType: senderType,
            body: opts.body,
            createdAt: nowISO(),
            readAt: null
        };
        DB.threads[thread.id].updatedAt = nowISO();
        persistDB();
        logMockActivity({ clientId: opts.clientId, actorType: senderType === 'agent' ? 'agent' : 'client', type: ACT.MESSAGE_SENT, collectionId: opts.collectionId || null, listingId: opts.listingId || null });
        return DB.messages[mid];
    }

    // ══════════════════════════════════════════════════════════════════
    // RENDER: Collections list inside Portfolio tab
    // ══════════════════════════════════════════════════════════════════

    function getClientCollections(clientId) {
        var result = [];
        var keys = Object.keys(DB.collections);
        for (var i = 0; i < keys.length; i++) {
            if (DB.collections[keys[i]].clientId === clientId) result.push(DB.collections[keys[i]]);
        }
        result.sort(function(a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });
        return result;
    }

    window.renderClientCollections = function(clientId) {
        var container = document.getElementById('wsCollectionsPanel');
        if (!container) return;
        var cols = getClientCollections(clientId);
        var html = '<div class="flex items-center justify-between mb-3">';
        html += '<h4 class="text-sm font-bold text-gray-700"><i class="fas fa-layer-group text-indigo-500 mr-2"></i>Collections <span class="text-xs font-normal text-gray-400">(' + cols.length + ')</span></h4>';
        html += '<button onclick="__MallanMock.createCollectionFromSelectedListings(currentWorkspaceClientId)" class="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700"><i class="fas fa-plus mr-1"></i>New from Selected</button>';
        html += '</div>';

        if (!cols.length) {
            html += '<p class="text-xs text-gray-400 text-center py-6"><i class="fas fa-layer-group text-gray-300 text-lg block mb-2"></i>No collections yet. Select listings in search and click "New from Selected".</p>';
        } else {
            html += '<div class="space-y-3">';
            cols.forEach(function(col) {
                var statusColors = { DRAFT: 'gray', SENT: 'green', ARCHIVED: 'yellow' };
                var sc = statusColors[col.status] || 'gray';
                var liked = col.items.filter(function(it) { return it.clientStatus === 'LIKED'; }).length;
                var disliked = col.items.filter(function(it) { return it.clientStatus === 'DISLIKED'; }).length;
                var undecided = col.items.filter(function(it) { return !it.clientStatus || it.clientStatus === 'UNDECIDED'; }).length;
                var infoReqs = col.items.filter(function(it) { return it.requestedInfo; }).length;
                var showingReqs = col.items.filter(function(it) { return it.requestedShowing; }).length;

                html += '<div class="border rounded-lg p-3 hover:shadow-sm transition-shadow">';

                // Header row
                html += '<div class="flex items-start justify-between mb-1.5">';
                html += '<div class="flex-1 min-w-0"><h5 class="text-sm font-semibold text-gray-900 truncate">' + col.title + '</h5>';
                html += '<p class="text-[10px] text-gray-400">' + col.items.length + ' listing' + (col.items.length !== 1 ? 's' : '') + ' · Updated ' + new Date(col.updatedAt).toLocaleDateString() + (col.sentAt ? ' · Sent ' + new Date(col.sentAt).toLocaleDateString() : '') + '</p></div>';
                // Engagement color indicator
                var engScore = col.items.length > 0 ? Math.round(((liked + infoReqs + showingReqs) / col.items.length) * 100) : 0;
                var engColor = engScore >= 60 ? 'green' : engScore >= 30 ? 'amber' : 'gray';
                html += '<div class="flex items-center gap-1.5 flex-shrink-0"><span class="w-2 h-2 rounded-full bg-' + engColor + '-500" title="Engagement: ' + engScore + '%"></span>';
                html += '<span class="text-[10px] px-2 py-0.5 rounded-full font-medium bg-' + sc + '-100 text-' + sc + '-700">' + col.status + '</span></div>';
                html += '</div>';

                // Mini stats bar with per-collection metrics (Point 6)
                html += '<div class="flex items-center gap-2 mb-2 text-[9px] flex-wrap">';
                html += '<span class="flex items-center gap-0.5 text-green-600"><i class="fas fa-heart"></i>' + liked + '</span>';
                html += '<span class="flex items-center gap-0.5 text-red-500"><i class="fas fa-thumbs-down"></i>' + disliked + '</span>';
                html += '<span class="flex items-center gap-0.5 text-gray-400"><i class="fas fa-minus-circle"></i>' + undecided + '</span>';
                if (infoReqs) html += '<span class="flex items-center gap-0.5 text-blue-600"><i class="fas fa-info-circle"></i>' + infoReqs + '</span>';
                if (showingReqs) html += '<span class="flex items-center gap-0.5 text-purple-600"><i class="fas fa-calendar"></i>' + showingReqs + '</span>';
                // Per-collection metrics: open %, like %, viewed
                if (col.status === 'SENT') {
                    var colOpenPct = Math.min(100, Math.round(55 + Math.random() * 35));
                    var likeRate = col.items.length > 0 ? Math.round((liked / col.items.length) * 100) : 0;
                    var viewedCol = liked + disliked;
                    html += '<span class="ml-auto flex items-center gap-2 text-[9px] font-medium">';
                    html += '<span class="text-cyan-600" title="Open rate"><i class="fas fa-envelope-open mr-0.5"></i>' + colOpenPct + '%</span>';
                    html += '<span class="text-green-600" title="Like rate"><i class="fas fa-heart mr-0.5"></i>' + likeRate + '%</span>';
                    html += '<span class="text-purple-600" title="Viewed"><i class="fas fa-eye mr-0.5"></i>' + viewedCol + '</span>';
                    html += '</span>';
                } else if (col.items.length > 0) {
                    var likeRate = Math.round((liked / col.items.length) * 100);
                    html += '<span class="ml-auto text-[9px] font-medium text-gray-500">' + likeRate + '% liked</span>';
                }
                html += '</div>';
                // Last sent date
                if (col.sentAt) {
                    html += '<p class="text-[10px] text-gray-400 mb-1"><i class="fas fa-paper-plane mr-0.5"></i>Last sent: ' + new Date(col.sentAt).toLocaleDateString() + '</p>';
                }

                // Listing thumbnails with status indicator
                html += '<div class="flex gap-1 mb-2">';
                var maxShow = Math.min(col.items.length, 5);
                for (var j = 0; j < maxShow; j++) {
                    var item = col.items[j];
                    var snap = item.snapshot || {};
                    var addr = snap.address || '';
                    if (typeof addr === 'object') addr = addr.full || (addr.streetNumber + ' ' + addr.streetName);
                    var thumbBorder = item.clientStatus === 'LIKED' ? 'border-green-400' : item.clientStatus === 'DISLIKED' ? 'border-red-300' : 'border-gray-200';
                    html += '<div class="flex-1 bg-gray-50 rounded p-1 text-center border ' + thumbBorder + '" title="' + addr + '">';
                    html += '<p class="text-[8px] text-gray-600 truncate">' + (addr || 'Listing') + '</p>';
                    html += '<p class="text-[8px] font-medium text-gray-800">' + (snap.price || '') + '</p>';
                    html += '</div>';
                }
                if (col.items.length > 5) html += '<div class="flex-none w-7 bg-gray-50 rounded p-1 text-center text-[8px] text-gray-500 border border-gray-200">+' + (col.items.length - 5) + '</div>';
                html += '</div>';

                // Actions row
                html += '<div class="flex gap-1.5 flex-wrap">';
                if (col.status === 'DRAFT') {
                    html += '<button onclick="__MallanMock.sendCollectionToClient(\'' + col.id + '\')" class="px-2 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700"><i class="fas fa-paper-plane mr-1"></i>Send</button>';
                }
                if (col.status === 'SENT') {
                    html += '<button onclick="__MallanMock.sendCollectionToClient(\'' + col.id + '\')" class="px-2 py-1 border rounded text-xs hover:bg-emerald-50 text-emerald-700"><i class="fas fa-redo mr-1"></i>Send Again</button>';
                }
                html += '<button onclick="viewCollectionDetail(\'' + col.id + '\')" class="px-2 py-1 border rounded text-xs hover:bg-gray-50"><i class="fas fa-eye mr-1"></i>View</button>';
                html += '<button onclick="duplicateCollection(\'' + col.id + '\')" class="px-2 py-1 border rounded text-xs hover:bg-blue-50 text-blue-600"><i class="fas fa-copy mr-1"></i>Duplicate</button>';
                if (col.status !== 'ARCHIVED') {
                    html += '<button onclick="archiveCollection(\'' + col.id + '\')" class="px-2 py-1 border rounded text-xs text-gray-400 hover:bg-gray-50"><i class="fas fa-archive mr-1"></i>Archive</button>';
                }
                html += '</div>';
                html += '</div>';
            });
            html += '</div>';
        }
        container.innerHTML = html;
    };

    window.viewCollectionDetail = function(colId) {
        var col = DB.collections[colId];
        if (!col) return;
        var html = '<div class="space-y-2">';
        col.items.forEach(function(item, i) {
            var s = item.snapshot || {};
            var addr = s.address || 'Address on request';
            if (typeof addr === 'object') addr = addr.full || (addr.streetNumber + ' ' + addr.streetName);
            var statusBadge = item.clientStatus === 'LIKED' ? '<span class="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full">Liked</span>' :
                              item.clientStatus === 'DISLIKED' ? '<span class="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full">Passed</span>' :
                              '<span class="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">Undecided</span>';
            html += '<div class="p-3 border rounded-lg flex items-start gap-3">';
            html += '<span class="text-xs font-bold text-gray-400 pt-1">' + (i + 1) + '</span>';
            html += '<div class="flex-1 min-w-0">';
            html += '<div class="flex items-center gap-2 mb-0.5"><p class="text-sm font-medium text-gray-900 truncate">' + addr + '</p>' + statusBadge + '</div>';
            html += '<p class="text-xs text-gray-600">' + (s.price || '') + '</p>';
            var details = [];
            if (s.beds) details.push(s.beds + ' BR');
            if (s.baths) details.push(s.baths + ' BA');
            if (s.sqft) details.push(Number(s.sqft).toLocaleString() + ' sqft');
            if (details.length) html += '<p class="text-[10px] text-gray-400">' + details.join(' · ') + '</p>';
            if (item.requestedInfo) html += '<span class="text-[10px] text-blue-600 mr-2"><i class="fas fa-info-circle mr-0.5"></i>Info requested</span>';
            if (item.requestedShowing) html += '<span class="text-[10px] text-purple-600"><i class="fas fa-calendar mr-0.5"></i>Showing requested</span>';
            html += '</div></div>';
        });
        html += '</div>';

        var container = document.getElementById('wsCollectionsPanel');
        if (container) {
            container.innerHTML = '<div class="mb-3 flex items-center gap-2"><button onclick="renderClientCollections(\'' + col.clientId + '\')" class="text-xs text-blue-600 hover:underline"><i class="fas fa-arrow-left mr-1"></i>Back to collections</button><h4 class="text-sm font-bold text-gray-700">' + col.title + '</h4><span class="text-[10px] px-2 py-0.5 rounded-full bg-' + (col.status === 'SENT' ? 'green' : 'gray') + '-100 text-' + (col.status === 'SENT' ? 'green' : 'gray') + '-700">' + col.status + '</span></div>' + html;
        }
    };

    window.archiveCollection = function(colId) {
        var col = DB.collections[colId];
        if (!col) return;
        col.status = 'ARCHIVED';
        col.updatedAt = nowISO();
        persistDB();
        if (typeof showToast === 'function') showToast('Collection archived', 'info');
        if (typeof renderClientCollections === 'function') renderClientCollections(col.clientId);
    };

    window.duplicateCollection = function(colId) {
        var orig = DB.collections[colId];
        if (!orig) return;
        var newCol = createCollection({
            clientId: orig.clientId,
            title: orig.title + ' (Copy)',
            description: orig.description || ''
        });
        orig.items.forEach(function(item, i) {
            newCol.items.push({
                id: uid('item'),
                listingId: item.listingId,
                source: item.source || 'RLS',
                position: i,
                clientStatus: 'UNDECIDED',
                requestedInfo: false,
                requestedShowing: false,
                snapshot: JSON.parse(JSON.stringify(item.snapshot || {}))
            });
        });
        newCol.updatedAt = nowISO();
        DB.collections[newCol.id] = newCol;
        persistDB();
        if (typeof showToast === 'function') showToast('Collection duplicated (' + newCol.items.length + ' listings)', 'success');
        if (typeof renderClientCollections === 'function') renderClientCollections(orig.clientId);
    };

    // ══════════════════════════════════════════════════════════════════
    // NO-VOW GATE BANNER
    // ══════════════════════════════════════════════════════════════════

    function enforceNoVowGates() {
        if (!NO_VOW_MODE) return;
        var bannerId = 'noVowBanner';
        if (document.getElementById(bannerId)) return;
        var host = document.getElementById('clientWorkspace');
        if (!host) return;
        var div = document.createElement('div');
        div.id = bannerId;
        div.className = 'bg-gray-900 text-white rounded-lg px-4 py-2 mb-3 flex items-center gap-2 text-xs';
        div.innerHTML = '<i class="fas fa-shield-alt text-blue-400"></i><span><strong>No-VOW Mode:</strong> Clients view agent-curated Collections only. No client MLS search or auto match alerts.</span>';
        // Insert after the header bar (first child)
        if (host.children.length > 1) {
            host.insertBefore(div, host.children[1]);
        } else {
            host.appendChild(div);
        }
    }

    // ── Wrap saveNewClient for localStorage persistence ──
    (function wrapSaveNewClient() {
        if (typeof window.saveNewClient !== 'function') return;
        var original = window.saveNewClient;
        window.saveNewClient = function() {
            original.apply(this, arguments);
            DB.clients = window.customerDB || DB.clients;
            persistDB();
        };
    })();

    // ── Hook into openClientWorkspace to show No-VOW banner + render collections ──
    (function wrapOpenClientWorkspace() {
        if (typeof window.openClientWorkspace !== 'function') return;
        var original = window.openClientWorkspace;
        window.openClientWorkspace = function(clientId) {
            original.apply(this, arguments);
            enforceNoVowGates();
            // Render collections in portfolio tab
            setTimeout(function() {
                if (typeof renderClientCollections === 'function') renderClientCollections(clientId);
            }, 100);
        };
    })();

    // ── Expose to global scope ──
    window.__MallanMock = {
        DB: DB,
        persistDB: persistDB,
        createCollection: createCollection,
        createCollectionFromSelectedListings: createCollectionFromSelectedListings,
        sendCollectionToClient: sendCollectionToClient,
        setClientItemStatus: setClientItemStatus,
        requestInfo: requestInfo,
        requestShowing: requestShowing,
        confirmShowing: confirmShowing,
        sendMessage: sendMessage,
        getClientCollections: getClientCollections,
        enforceNoVowGates: enforceNoVowGates,
        ACT: ACT
    };

    // ── Global helper for "Send Latest Collection" button ──
    window.sendLatestClientCollection = function() {
        var clientId = window.currentWorkspaceClientId;
        if (!clientId) { showToast('No client selected.', 'warning'); return; }
        var cols = getClientCollections(clientId);
        if (!cols.length) { showToast('No collections for this client yet. Select listings in search and create one first.', 'warning'); return; }
        // Prefer latest DRAFT, else latest overall
        var drafts = cols.filter(function(c) { return c.status === 'DRAFT'; });
        var target = drafts.length ? drafts[0] : cols[0];
        sendCollectionToClient(target.id);
    };

})();
