        // ═══════════════════════════════════════════════════════════════════════════════
        // CLIENT WORKSPACE — Navigation
        // ═══════════════════════════════════════════════════════════════════════════════

        var currentClientTab = 'active'; // 'active' | 'closed' | 'pipeline'

        function switchClientTab(tab) {
            currentClientTab = tab;
            // Clean tab styling — blue underline
            var baseTab = 'client-status-tab px-4 py-3 text-sm font-semibold border-b-2 bg-transparent transition-all';
            var activeStyle = baseTab + ' border-[#3B82F6] text-gray-900';
            var inactiveStyle = baseTab + ' border-transparent text-gray-500 hover:text-gray-700';
            document.getElementById('clientTabActive').className = (tab === 'active' ? activeStyle : inactiveStyle);
            document.getElementById('clientTabDealPipeline').className = (tab === 'dealPipeline' ? activeStyle : inactiveStyle);
            document.getElementById('clientTabClosed').className = (tab === 'closed' ? activeStyle : inactiveStyle);

            var tableView = document.getElementById('clientTableView');
            var pipelineView = document.getElementById('clientPipelineView');
            var dealPipelineView = document.getElementById('dealPipelineContainer');
            // Hide all views first
            if (tableView) tableView.style.display = 'none';
            if (pipelineView) pipelineView.classList.add('hidden');
            if (dealPipelineView) dealPipelineView.style.display = 'none';

            if (tab === 'active' || tab === 'closed') {
                if (tableView) tableView.style.display = '';
                renderClientGrid();
            } else if (tab === 'dealPipeline') {
                if (dealPipelineView) dealPipelineView.style.display = '';
                renderDealPipelineKanban();
            }
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // DEAL PIPELINE KANBAN (#9)
        // Horizontal scroll kanban board — one column per deal stage
        // Separate from Nurture Pipeline (which is for closed clients)
        // ═══════════════════════════════════════════════════════════════════════════════

        var dealStageGroups = [
            { name: 'Discovery', stages: ['new_lead','qualified','requirements_confirmed'], color: '#3b82f6' },
            { name: 'Active Search', stages: ['searching','touring','shortlist'], color: '#8b5cf6' },
            { name: 'Deal Making', stages: ['offer_prep','offer_submitted','negotiation'], color: '#f59e0b' },
            { name: 'Closing', stages: ['contract_signed','board_approval','closing'], color: '#10b981' }
        ];
        var allDealStages = [
            { id: 'new_lead', label: 'New Lead', group: 0 },
            { id: 'qualified', label: 'Qualified', group: 0 },
            { id: 'requirements_confirmed', label: 'Req. Confirmed', group: 0 },
            { id: 'searching', label: 'Searching', group: 1 },
            { id: 'touring', label: 'Touring', group: 1 },
            { id: 'shortlist', label: 'Shortlist', group: 1 },
            { id: 'offer_prep', label: 'Offer Prep', group: 2 },
            { id: 'offer_submitted', label: 'Offer Submitted', group: 2 },
            { id: 'negotiation', label: 'Negotiation', group: 2 },
            { id: 'contract_signed', label: 'Contract Signed', group: 3 },
            { id: 'board_approval', label: 'Board Approval', group: 3 },
            { id: 'closing', label: 'Closing', group: 3 }
        ];

        function renderDealPipelineKanban() {
            var board = document.getElementById('pipelineKanbanBoard');
            var summaryBar = document.getElementById('dealPipelineSummaryBar');
            if (!board) return;

            // Filter active clients only (using existing getMyClients)
            var myClients = getMyClients();
            var activeClients = [];
            for (var id in myClients) {
                var c = myClients[id];
                if (c.clientStatus !== 'closed') {
                    c._clientId = id; // stash the key for drag/drop
                    activeClients.push(c);
                }
            }

            // Group by stage
            var stageMap = {};
            allDealStages.forEach(function(s) { stageMap[s.id] = []; });
            activeClients.forEach(function(c) {
                var stage = c.dealStage || 'new_lead';
                if (stageMap[stage]) stageMap[stage].push(c);
                else stageMap['new_lead'].push(c);
            });

            // Update counts
            var totalValue = 0;
            activeClients.forEach(function(c) {
                var b = c.preferences ? (c.preferences.minPrice || 0) : 0;
                totalValue += b;
            });
            var countEl = document.getElementById('pipelineActiveCount');
            var valueEl = document.getElementById('pipelineTotalValue');
            if (countEl) countEl.textContent = activeClients.length + ' active';
            if (valueEl) valueEl.textContent = '$' + (totalValue >= 1000000 ? (totalValue / 1000000).toFixed(1) + 'M' : (totalValue / 1000).toFixed(0) + 'K') + ' pipeline';

            // Summary bar
            var summaryHtml = '';
            dealStageGroups.forEach(function(group) {
                var count = 0;
                group.stages.forEach(function(s) { count += (stageMap[s] || []).length; });
                summaryHtml += '<span class="px-2 py-1 rounded-full font-semibold whitespace-nowrap" style="background:' + group.color + '20;color:' + group.color + '">' + group.name + ': ' + count + '</span>';
            });
            if (summaryBar) summaryBar.innerHTML = summaryHtml;

            // Kanban columns
            var boardHtml = '';
            allDealStages.forEach(function(stage) {
                var group = dealStageGroups[stage.group];
                var clients = stageMap[stage.id] || [];
                boardHtml += '<div class="flex-shrink-0 w-64 bg-gray-50 rounded-xl border border-gray-200" data-deal-stage="' + stage.id + '">';
                boardHtml += '<div class="px-3 py-2 border-b border-gray-200 flex items-center justify-between">';
                boardHtml += '<span class="text-xs font-bold text-gray-700">' + stage.label + '</span>';
                boardHtml += '<span class="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style="background:' + group.color + '20;color:' + group.color + '">' + clients.length + '</span>';
                boardHtml += '</div>';
                boardHtml += '<div class="p-2 space-y-2 min-h-[300px]" ondragover="event.preventDefault();this.classList.add(\'bg-blue-50\')" ondragleave="this.classList.remove(\'bg-blue-50\')" ondrop="handlePipelineDrop(event,\'' + stage.id + '\')">';

                clients.forEach(function(client) {
                    var cId = client._clientId || '';
                    var heat = client.heat || 'warm';
                    var heatColor = heat === 'hot' ? '#ef4444' : heat === 'warm' ? '#f59e0b' : '#6b7280';
                    var heatIcon = heat === 'hot' ? 'fa-fire' : heat === 'warm' ? 'fa-temperature-half' : 'fa-snowflake';
                    var cType = (client.clientType || client.type || 'buyer').toLowerCase();
                    var typeIcon = cType === 'buyer' ? 'fa-home' : cType === 'renter' ? 'fa-key' : cType === 'seller' ? 'fa-sign' : 'fa-building';
                    var budget = client.budget || '';

                    boardHtml += '<div class="bg-white rounded-lg border border-gray-200 p-2.5 cursor-grab hover:shadow-sm transition-shadow" draggable="true" ondragstart="event.dataTransfer.setData(\'text/plain\',\'' + cId + '\')" onclick="openClientWorkspace(\'' + cId + '\')" data-client-id="' + cId + '">';
                    boardHtml += '<div class="flex items-center justify-between mb-1">';
                    boardHtml += '<span class="text-sm font-semibold text-gray-900 truncate">' + (client.name || '') + '</span>';
                    boardHtml += '<i class="fas ' + heatIcon + ' text-xs" style="color:' + heatColor + '" title="' + heat + '"></i>';
                    boardHtml += '</div>';
                    boardHtml += '<div class="flex items-center gap-1 text-[10px] text-gray-500">';
                    boardHtml += '<i class="fas ' + typeIcon + '"></i> ' + cType;
                    if (budget) boardHtml += ' &middot; ' + budget;
                    boardHtml += '</div>';
                    if (client.lastContacted) {
                        boardHtml += '<div class="text-[9px] text-gray-400 mt-1"><i class="fas fa-clock mr-0.5"></i>Last: ' + client.lastContacted + '</div>';
                    }
                    boardHtml += '</div>';
                });

                if (clients.length === 0) {
                    boardHtml += '<div class="text-center text-gray-400 text-xs py-8"><i class="fas fa-inbox text-2xl mb-2 block"></i>No clients</div>';
                }

                boardHtml += '</div></div>';
            });

            board.innerHTML = boardHtml;
        }

        function handlePipelineDrop(event, newStage) {
            event.preventDefault();
            event.currentTarget.classList.remove('bg-blue-50');
            var clientId = event.dataTransfer.getData('text/plain');
            if (!clientId) return;
            updateDealStage(clientId, newStage);
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // NURTURE PIPELINE — Long-term client lifecycle management
        // Buyers → potential sellers in 3-5 years (annual/bi-annual check-ins)
        // Renters → lease expiration tracking (60-day pre-expiration outreach)
        // ═══════════════════════════════════════════════════════════════════════════════

        function renderPipelineView() {
            var summaryBar = document.getElementById('pipelineSummaryBar');
            var content = document.getElementById('pipelineContent');
            if (!summaryBar || !content) return;

            var clients = getMyClients();
            var today = new Date();
            var todayStr = today.toISOString().slice(0, 10);

            // Categorize all closed clients into pipeline buckets
            var overdue = [];      // Check-in date is past
            var dueSoon = [];      // Check-in within 60 days
            var upcoming = [];     // Check-in within 6 months
            var longTerm = [];     // Check-in beyond 6 months
            var noPipeline = [];   // Closed but no pipeline data yet

            for (var id in clients) {
                var c = clients[id];
                if (c.clientStatus !== 'closed') continue;

                var pd = c.pipelineData;
                if (!pd || !pd.nextCheckIn) {
                    noPipeline.push({ id: id, client: c });
                    continue;
                }

                var nextDate = new Date(pd.nextCheckIn);
                var daysUntil = Math.round((nextDate - today) / (1000 * 60 * 60 * 24));
                var item = { id: id, client: c, daysUntil: daysUntil, nextCheckIn: pd.nextCheckIn };

                if (daysUntil < 0) overdue.push(item);
                else if (daysUntil <= 60) dueSoon.push(item);
                else if (daysUntil <= 180) upcoming.push(item);
                else longTerm.push(item);
            }

            // Sort each bucket by urgency (most urgent first)
            [overdue, dueSoon, upcoming, longTerm].forEach(function(arr) {
                arr.sort(function(a, b) { return a.daysUntil - b.daysUntil; });
            });

            var totalPipeline = overdue.length + dueSoon.length + upcoming.length + longTerm.length + noPipeline.length;

            // ── Summary Stats Bar ──
            var sHtml = '';
            sHtml += '<div class="bg-red-50 border border-red-200 rounded-xl p-3 text-center">';
            sHtml += '<p class="text-2xl font-bold text-red-700">' + overdue.length + '</p>';
            sHtml += '<p class="text-[10px] text-red-600 font-medium">Overdue</p></div>';
            sHtml += '<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">';
            sHtml += '<p class="text-2xl font-bold text-amber-700">' + dueSoon.length + '</p>';
            sHtml += '<p class="text-[10px] text-amber-600 font-medium">Due Soon (60d)</p></div>';
            sHtml += '<div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">';
            sHtml += '<p class="text-2xl font-bold text-blue-700">' + upcoming.length + '</p>';
            sHtml += '<p class="text-[10px] text-blue-600 font-medium">Upcoming (6mo)</p></div>';
            sHtml += '<div class="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">';
            sHtml += '<p class="text-2xl font-bold text-gray-700">' + longTerm.length + '</p>';
            sHtml += '<p class="text-[10px] text-gray-500 font-medium">Long-Term</p></div>';
            summaryBar.innerHTML = sHtml;

            // ── Pipeline Content ──
            var html = '';

            // Helper: render a pipeline client card
            function renderPipelineCard(item) {
                var c = item.client;
                var pd = c.pipelineData || {};
                var typeColors = { Buyer: 'blue', Renter: 'green', Seller: 'amber', Landlord: 'purple' };
                var tc = typeColors[c.type] || 'gray';
                var isRenter = (c.closedType === 'rented');
                var freqLabels = { annual: 'Annual', biannual: 'Bi-Annual', quarterly: 'Quarterly', '60days_before_lease': '60d Before Lease' };

                var cardHtml = '<div onclick="switchClientTab(\'closed\'); setTimeout(function(){ openClientWorkspace(\'' + item.id + '\'); }, 100);" class="bg-white rounded-xl border shadow-sm p-4 hover:shadow-md transition-shadow cursor-pointer group">';
                // Row 1: Name + Type + Urgency
                cardHtml += '<div class="flex items-start justify-between mb-2">';
                cardHtml += '<div class="flex items-center gap-3 min-w-0">';
                cardHtml += '<div class="w-10 h-10 bg-' + c.color + '-100 rounded-full flex items-center justify-center text-' + c.color + '-600 font-bold text-sm flex-shrink-0">' + c.initials + '</div>';
                cardHtml += '<div class="min-w-0">';
                cardHtml += '<p class="text-sm font-semibold text-gray-800 group-hover:text-blue-600">' + c.name + '</p>';
                cardHtml += '<p class="text-[10px] text-gray-400">' + (c.closedProperty || 'Unknown property') + '</p>';
                cardHtml += '</div></div>';
                cardHtml += '<div class="flex flex-col items-end gap-1 flex-shrink-0">';
                cardHtml += '<span class="text-[9px] px-1.5 py-0.5 bg-' + tc + '-100 text-' + tc + '-700 rounded-full font-medium">' + c.type + '</span>';
                if (item.daysUntil < 0) {
                    cardHtml += '<span class="text-[9px] px-1.5 py-0.5 bg-red-600 text-white rounded-full font-bold">' + Math.abs(item.daysUntil) + 'd OVERDUE</span>';
                } else if (item.daysUntil <= 60) {
                    cardHtml += '<span class="text-[9px] px-1.5 py-0.5 bg-amber-500 text-white rounded-full font-bold">In ' + item.daysUntil + 'd</span>';
                } else {
                    cardHtml += '<span class="text-[9px] px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded-full font-medium">In ' + item.daysUntil + 'd</span>';
                }
                cardHtml += '</div></div>';

                // Row 2: Key info
                cardHtml += '<div class="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500 mb-2">';
                cardHtml += '<span><i class="fas fa-calendar-check mr-1 text-green-500"></i>Closed: ' + (c.closedDate || '—') + '</span>';
                cardHtml += '<span><i class="fas fa-clock mr-1 text-blue-500"></i>Next: ' + (pd.nextCheckIn || '—') + '</span>';
                cardHtml += '<span><i class="fas fa-redo mr-1 text-purple-500"></i>' + (freqLabels[pd.checkInFrequency] || pd.checkInFrequency || '—') + '</span>';
                if (pd.lastCheckIn) cardHtml += '<span><i class="fas fa-phone mr-1 text-gray-400"></i>Last: ' + pd.lastCheckIn + '</span>';
                cardHtml += '</div>';

                // Row 3: Renter-specific lease info or Buyer seller potential
                if (isRenter && pd.leaseExpiration) {
                    var leaseDays = Math.round((new Date(pd.leaseExpiration) - today) / (1000 * 60 * 60 * 24));
                    var leaseColor = leaseDays <= 60 ? 'red' : leaseDays <= 120 ? 'amber' : 'green';
                    cardHtml += '<div class="flex items-center gap-2 text-[10px] px-2 py-1.5 bg-' + leaseColor + '-50 border border-' + leaseColor + '-200 rounded-lg mb-2">';
                    cardHtml += '<i class="fas fa-file-contract text-' + leaseColor + '-500"></i>';
                    cardHtml += '<span class="text-' + leaseColor + '-700 font-medium">Lease expires: ' + pd.leaseExpiration + ' (' + (leaseDays > 0 ? leaseDays + ' days' : Math.abs(leaseDays) + ' days ago') + ')</span>';
                    cardHtml += '</div>';
                } else if (!isRenter && pd.sellerPotentialYears) {
                    var yearsSince = Math.max(0, ((today - new Date(c.closedDate)) / (1000 * 60 * 60 * 24 * 365)).toFixed(1));
                    cardHtml += '<div class="flex items-center gap-2 text-[10px] px-2 py-1.5 bg-blue-50 border border-blue-200 rounded-lg mb-2">';
                    cardHtml += '<i class="fas fa-home text-blue-500"></i>';
                    cardHtml += '<span class="text-blue-700 font-medium">Seller potential: ~' + pd.sellerPotentialYears + ' years (owned ' + yearsSince + ' yr)</span>';
                    cardHtml += '</div>';
                }

                // Row 4: Pipeline notes
                if (pd.notes) {
                    cardHtml += '<p class="text-[10px] text-gray-400 italic"><i class="fas fa-sticky-note mr-1"></i>' + pd.notes + '</p>';
                }

                // Row 5: Quick actions
                cardHtml += '<div class="flex gap-2 mt-2 pt-2 border-t">';
                cardHtml += '<button onclick="event.stopPropagation(); pipelineCheckIn(\'' + item.id + '\')" class="text-[10px] px-2.5 py-1 bg-green-600 text-white rounded font-medium hover:bg-green-700"><i class="fas fa-check mr-1"></i>Log Check-In</button>';
                cardHtml += '<button onclick="event.stopPropagation(); pipelineSnooze(\'' + item.id + '\')" class="text-[10px] px-2.5 py-1 bg-gray-200 text-gray-700 rounded font-medium hover:bg-gray-300"><i class="fas fa-clock mr-1"></i>Snooze</button>';
                cardHtml += '<button onclick="event.stopPropagation(); pipelineEditSchedule(\'' + item.id + '\')" class="text-[10px] px-2.5 py-1 bg-gray-200 text-gray-700 rounded font-medium hover:bg-gray-300"><i class="fas fa-edit mr-1"></i>Edit</button>';
                cardHtml += '</div>';
                cardHtml += '</div>';
                return cardHtml;
            }

            // Section helper
            function renderSection(title, icon, color, items, emptyMsg) {
                var s = '<div class="bg-white rounded-xl shadow-sm border overflow-hidden">';
                s += '<div class="flex items-center justify-between px-4 py-3 bg-' + color + '-50 border-b border-' + color + '-200">';
                s += '<div class="flex items-center gap-2"><i class="fas ' + icon + ' text-' + color + '-500"></i>';
                s += '<span class="text-sm font-bold text-' + color + '-800">' + title + '</span>';
                s += '<span class="text-[10px] px-1.5 py-0.5 bg-' + color + '-200 text-' + color + '-800 rounded-full font-bold">' + items.length + '</span></div>';
                s += '</div>';
                s += '<div class="p-4">';
                if (items.length === 0) {
                    s += '<p class="text-center text-xs text-gray-300 py-4"><i class="fas fa-check-circle text-lg mb-1"></i><br>' + emptyMsg + '</p>';
                } else {
                    s += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-3">';
                    items.forEach(function(item) { s += renderPipelineCard(item); });
                    s += '</div>';
                }
                s += '</div></div>';
                return s;
            }

            // Overdue section
            if (overdue.length > 0) {
                html += renderSection('Overdue Check-Ins', 'fa-exclamation-circle', 'red', overdue, '');
            }

            // Due Soon section
            html += renderSection('Due Soon (Next 60 Days)', 'fa-bell', 'amber', dueSoon, 'No check-ins due in the next 60 days');

            // Upcoming section
            html += renderSection('Upcoming (Next 6 Months)', 'fa-calendar-alt', 'blue', upcoming, 'No check-ins in the next 6 months');

            // Long-Term section
            html += renderSection('Long-Term Nurture', 'fa-seedling', 'gray', longTerm, 'No long-term pipeline clients');

            // Not yet configured
            if (noPipeline.length > 0) {
                html += '<div class="bg-white rounded-xl shadow-sm border overflow-hidden">';
                html += '<div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">';
                html += '<div class="flex items-center gap-2"><i class="fas fa-cog text-gray-400"></i>';
                html += '<span class="text-sm font-bold text-gray-600">Needs Pipeline Setup</span>';
                html += '<span class="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded-full font-bold">' + noPipeline.length + '</span></div></div>';
                html += '<div class="p-4"><div class="grid grid-cols-1 lg:grid-cols-2 gap-3">';
                noPipeline.forEach(function(item) {
                    var c = item.client;
                    var tc2 = { Buyer: 'blue', Renter: 'green', Seller: 'amber', Landlord: 'purple' }[c.type] || 'gray';
                    html += '<div class="bg-gray-50 rounded-xl border p-3 flex items-center justify-between">';
                    html += '<div class="flex items-center gap-2">';
                    html += '<div class="w-8 h-8 bg-' + c.color + '-100 rounded-full flex items-center justify-center text-' + c.color + '-600 font-bold text-xs">' + c.initials + '</div>';
                    html += '<div><p class="text-xs font-semibold text-gray-700">' + c.name + '</p>';
                    html += '<p class="text-[10px] text-gray-400">' + (c.closedProperty || '') + ' · Closed ' + (c.closedDate || '') + '</p></div></div>';
                    html += '<button onclick="event.stopPropagation(); pipelineSetup(\'' + item.id + '\')" class="text-[10px] px-2.5 py-1 bg-blue-600 text-white rounded font-medium hover:bg-blue-700"><i class="fas fa-plus mr-1"></i>Setup</button>';
                    html += '</div>';
                });
                html += '</div></div></div>';
            }

            // Empty state
            if (totalPipeline === 0) {
                html += '<div class="bg-white rounded-xl shadow-sm border p-8 text-center">';
                html += '<i class="fas fa-seedling text-4xl text-gray-300 mb-3"></i>';
                html += '<p class="text-sm text-gray-500 font-medium mb-1">No Pipeline Clients Yet</p>';
                html += '<p class="text-xs text-gray-400">Closed clients appear here for long-term relationship tracking.<br>Buyers become potential sellers. Renters get lease renewal outreach.</p>';
                html += '</div>';
            }

            content.innerHTML = html;
        }

        // Pipeline action: Log a check-in (resets nextCheckIn based on frequency)
        function pipelineCheckIn(clientId) {
            var c = customerDB[clientId];
            if (!c || !c.pipelineData) return;
            var pd = c.pipelineData;
            var todayStr = new Date().toISOString().slice(0, 10);
            pd.lastCheckIn = todayStr;

            // Calculate next check-in based on frequency
            var next = new Date();
            if (pd.checkInFrequency === 'annual') next.setFullYear(next.getFullYear() + 1);
            else if (pd.checkInFrequency === 'biannual') next.setMonth(next.getMonth() + 6);
            else if (pd.checkInFrequency === 'quarterly') next.setMonth(next.getMonth() + 3);
            else if (pd.checkInFrequency === '60days_before_lease' && pd.leaseExpiration) {
                // Next lease cycle: assume 1-year renewal
                var leaseDate = new Date(pd.leaseExpiration);
                if (leaseDate < new Date()) leaseDate.setFullYear(leaseDate.getFullYear() + 1);
                pd.leaseExpiration = leaseDate.toISOString().slice(0, 10);
                next = new Date(leaseDate.getTime() - 60 * 86400000); // 60 days before
            } else {
                next.setFullYear(next.getFullYear() + 1); // default annual
            }
            pd.nextCheckIn = next.toISOString().slice(0, 10);

            logClientActivity(clientId, 'action', 'Pipeline check-in completed. Next: ' + pd.nextCheckIn);
            renderPipelineView();
            showToast('Check-in logged for ' + c.name, 'success');
        }

        // Pipeline action: Snooze (push next check-in by 30 days)
        function pipelineSnooze(clientId) {
            var c = customerDB[clientId];
            if (!c || !c.pipelineData) return;
            var current = c.pipelineData.nextCheckIn ? new Date(c.pipelineData.nextCheckIn) : new Date();
            current.setDate(current.getDate() + 30);
            c.pipelineData.nextCheckIn = current.toISOString().slice(0, 10);
            renderPipelineView();
            showToast('Snoozed 30 days — next: ' + c.pipelineData.nextCheckIn, 'info');
        }

        // Pipeline action: Edit schedule (simple prompt for mockup)
        function pipelineEditSchedule(clientId) {
            var c = customerDB[clientId];
            if (!c || !c.pipelineData) return;
            var pd = c.pipelineData;
            var newDate = prompt('Next check-in date (YYYY-MM-DD):', pd.nextCheckIn || '');
            if (!newDate) return;
            var freq = prompt('Frequency (annual / biannual / quarterly / 60days_before_lease):', pd.checkInFrequency || 'annual');
            if (freq) pd.checkInFrequency = freq;
            pd.nextCheckIn = newDate;
            renderPipelineView();
            showToast('Pipeline schedule updated', 'success');
        }

        // Pipeline action: Setup pipeline for a closed client without one
        function pipelineSetup(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            var isRenter = (c.closedType === 'rented');
            var defaultFreq = isRenter ? '60days_before_lease' : 'annual';
            var freq = prompt('Check-in frequency (' + (isRenter ? '60days_before_lease / quarterly' : 'annual / biannual') + '):', defaultFreq);
            if (!freq) return;

            var nextDate;
            if (isRenter) {
                var leaseExp = prompt('Lease expiration date (YYYY-MM-DD):', '');
                if (!leaseExp) return;
                var expDate = new Date(leaseExp);
                nextDate = new Date(expDate.getTime() - 60 * 86400000).toISOString().slice(0, 10);
                c.pipelineData = { leaseExpiration: leaseExp, checkInFrequency: freq, nextCheckIn: nextDate, lastCheckIn: c.closedDate || '', notes: '' };
            } else {
                var years = prompt('Potential seller in how many years?', '5');
                var nextCI = new Date();
                nextCI.setFullYear(nextCI.getFullYear() + 1);
                nextDate = nextCI.toISOString().slice(0, 10);
                c.pipelineData = { sellerPotentialYears: parseInt(years) || 5, checkInFrequency: freq, nextCheckIn: nextDate, lastCheckIn: c.closedDate || '', notes: '' };
            }

            renderPipelineView();
            showToast('Pipeline configured for ' + c.name, 'success');
        }

        function openClientWorkspace(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            currentWorkspaceClientId = clientId;
            // Hide all client-list chrome so workspace takes over full area
            document.getElementById('clientSectionHeader').style.display = 'none';
            document.getElementById('clientTabBar').style.display = 'none';
            document.getElementById('clientFilterBar').style.display = 'none';
            document.getElementById('clientTableView').style.display = 'none';
            document.getElementById('clientPipelineView').classList.add('hidden');
            document.getElementById('dealPipelineContainer').style.display = 'none';
            document.getElementById('clientWorkspace').classList.remove('hidden');
            document.getElementById('wsMobileActions').style.display = '';

            // Header + Breadcrumb
            document.getElementById('wsClientName').textContent = c.name;
            document.getElementById('wsBreadcrumbClientName').textContent = c.name;
            var typeColors = { Buyer: 'blue', Renter: 'green', Seller: 'amber', Landlord: 'purple' };
            var tc = typeColors[c.type] || 'gray';
            document.getElementById('wsClientTypeBadge').className = 'text-xs px-2 py-0.5 rounded-full font-medium bg-' + tc + '-100 text-' + tc + '-700';
            document.getElementById('wsClientTypeBadge').textContent = c.type;
            var isClosed = c.clientStatus === 'closed';
            var statusBadge = document.getElementById('wsClientStatusBadge');
            if (isClosed) {
                var closedLabels = { purchased: 'Purchased', rented: 'Rented', sold: 'Sold', leased: 'Leased' };
                statusBadge.className = 'text-xs px-2 py-0.5 rounded-full font-medium bg-gray-800 text-white';
                statusBadge.textContent = 'Closed — ' + (closedLabels[c.closedType] || 'Closed');
                statusBadge.classList.remove('hidden');
            } else {
                statusBadge.className = 'text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700';
                statusBadge.textContent = 'Active';
                statusBadge.classList.remove('hidden');
            }
            document.getElementById('wsClientSubtitle').innerHTML = escapeHtml(c.email) + (c.phone ? ' &bull; ' + escapeHtml(c.phone) : '');

            // Deal Stage dropdown
            var stageEl = document.getElementById('wsDealStage');
            if (stageEl) stageEl.value = c.dealStage || 'new_lead';

            // Last Activity chip (Point 1B)
            var lastActChip = document.getElementById('wsLastActivityChip');
            var lastActText = document.getElementById('wsLastActivityText');
            if (lastActChip && c.lastActivity) {
                var actDaysAgo = Math.round((new Date() - new Date(c.lastActivity)) / (1000 * 60 * 60 * 24));
                lastActText.textContent = 'Last activity: ' + (actDaysAgo === 0 ? 'today' : actDaysAgo + 'd ago');
                lastActChip.classList.remove('hidden');
                if (actDaysAgo > 7) { lastActChip.className = 'text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded-full'; }
                else if (actDaysAgo > 3) { lastActChip.className = 'text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full'; }
                else { lastActChip.className = 'text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full'; }
            } else if (lastActChip) { lastActChip.classList.add('hidden'); }

            // Last Contacted chip (Point 1B)
            var lastConChip = document.getElementById('wsLastContactedChip');
            var lastConText = document.getElementById('wsLastContactedText');
            if (lastConChip && c.lastContacted) {
                var conDaysAgo = Math.round((new Date() - new Date(c.lastContacted)) / (1000 * 60 * 60 * 24));
                lastConText.textContent = 'Last contacted: ' + (conDaysAgo === 0 ? 'today' : conDaysAgo + 'd ago');
                lastConChip.classList.remove('hidden');
                if (conDaysAgo > 7) { lastConChip.className = 'text-[10px] px-2 py-0.5 bg-red-50 text-red-600 rounded-full'; }
                else { lastConChip.className = 'text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full'; }
            } else if (lastConChip) { lastConChip.classList.add('hidden'); }

            // Toggle close/reactivate buttons
            document.getElementById('wsMarkClosedBtn').classList.toggle('hidden', isClosed);
            document.getElementById('wsReactivateBtn').classList.toggle('hidden', !isClosed);

            // Update matches badge
            var queuedCount = (c.matchedListings || []).filter(function(m) { return m.status === 'queued'; }).length;
            var badge = document.getElementById('wsAlertBadge');
            if (queuedCount > 0) { badge.textContent = queuedCount; badge.classList.remove('hidden'); }
            else { badge.classList.add('hidden'); }

            renderFullWorkspace(c);
            switchWsContentTab('overview');
        }

        function closeClientWorkspace() {
            document.getElementById('clientWorkspace').classList.add('hidden');
            document.getElementById('wsMobileActions').style.display = 'none';
            document.getElementById('wsMoreDropdown').classList.add('hidden');
            currentWorkspaceClientId = null;
            clearWorkingClient();
            // Restore client-list chrome
            document.getElementById('clientSectionHeader').style.display = '';
            document.getElementById('clientTabBar').style.display = '';
            document.getElementById('clientFilterBar').style.display = '';
            // Restore the correct view based on which tab is active
            switchClientTab(currentClientTab);
        }

        function switchWsContentTab(tab) {
            var tabMap = { overview: 'wsTabOverview', search: 'wsTabSearch', portfolio: 'wsTabPortfolio', alerts: 'wsTabAlerts', activity: 'wsTabActivity' };
            var tabLabels = { overview: 'Overview', search: 'Searches', portfolio: 'Portfolio', alerts: 'Matches', activity: 'Activity' };
            // Hide all panels
            document.querySelectorAll('.ws-tab-panel').forEach(function(p) { p.classList.add('hidden'); });
            // Show selected
            var panel = document.getElementById(tabMap[tab]);
            if (panel) panel.classList.remove('hidden');
            // Update tab styles — clean gold underline
            document.querySelectorAll('.ws-content-tab').forEach(function(btn) {
                var rel = btn.dataset.tab === 'alerts' ? ' relative' : '';
                if (btn.dataset.tab === tab) {
                    btn.className = 'ws-content-tab px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 border-[#3B82F6] text-gray-900 bg-transparent transition-all' + rel;
                } else {
                    btn.className = 'ws-content-tab px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 border-transparent text-gray-500 hover:text-gray-700 bg-transparent transition-all' + rel;
                }
            });
            // Update breadcrumb tab indicator
            var breadcrumbTab = document.getElementById('wsBreadcrumbTab');
            var breadcrumbTabSeps = document.querySelectorAll('.ws-breadcrumb-tab');
            if (tab === 'overview') {
                breadcrumbTabSeps.forEach(function(el) { el.classList.add('hidden'); });
            } else {
                breadcrumbTabSeps.forEach(function(el) { el.classList.remove('hidden'); });
                if (breadcrumbTab) breadcrumbTab.textContent = tabLabels[tab] || tab;
            }
            // Scroll to top of workspace
            var ws = document.getElementById('clientWorkspace');
            if (ws) ws.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // Keep old name as alias for backward compat
        function switchWorkspaceTab(tab) {
            var map = { profile: 'overview', searches: 'search', portfolio: 'portfolio', activity: 'activity' };
            switchWsContentTab(map[tab] || tab);
        }

        function renderFullWorkspace(c) {
            renderCommandBar(c);
            renderDealHealth(c);
            renderClientProfile(c);
            renderFinancialReadiness(c);
            renderClientPreferences(c);
            renderNotesIntelligence(c);
            renderClientCoViewers(c);
            renderClientAlertSettings(c);
            renderQuickStats(c);
            renderTasksCard(c);
            renderNextBestActions(c);
            renderCollectionsSummary(c);
            renderInviteStatusCard(c);
            renderClosedInfoCard(c);
            renderNurtureCard(c);
            renderClientSearches(c);
            renderCriteriaHistory(c);
            renderNeighborhoodHeatmap(c);
            renderClientShowings(c);
            renderClientPortfolio(c);
            renderPortfolioStats(c);
            renderPreferenceDrift(c);
            renderPortfolioTimeline(c);
            renderAlertQueue(c);
            renderResponseMetrics(c);
            renderCommunicationBreakdown(c);
            renderActivityLog(c, 'all');
            renderMessagesPanel(c);
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // DEAL STAGE + DEAL HEALTH SCORE
        // ═══════════════════════════════════════════════════════════════════════════════

        function updateDealStage(clientId, stage) {
            var c = customerDB[clientId];
            if (!c) return;
            c.dealStage = stage;
            var labels = { new_lead:'New Lead', qualified:'Qualified', requirements_confirmed:'Req. Confirmed', searching:'Searching', touring:'Touring', shortlist:'Shortlist', offer_prep:'Offer Prep', offer_submitted:'Offer Submitted', negotiation:'Negotiation', contract_signed:'Contract Signed', board_approval:'Board Approval', closing:'Closing', closing_scheduled:'Closing Scheduled', closed:'Closed' };
            logClientActivity(clientId, 'action', 'Deal stage changed to: ' + (labels[stage] || stage));
            renderDealHealth(c);
            // Re-render kanban if Deal Pipeline is visible
            if (document.getElementById('dealPipelineContainer') && document.getElementById('dealPipelineContainer').style.display !== 'none') {
                renderDealPipelineKanban();
            }
            showToast('Deal stage: ' + (labels[stage] || stage), 'info');
        }

        function renderDealHealth(c) {
            var card = document.getElementById('wsDealHealthCard');
            if (!card) return;
            var clientId = currentWorkspaceClientId;

            // Calculate Deal Health Score (0-100)
            var viewedCount = (c.viewHistory || []).length;
            var likedCount = (c.portfolio || {}).liked || 0;
            var showingCount = (c.showings || []).filter(function(s) { return s.status === 'scheduled' || s.status === 'completed'; }).length;
            var daysSinceLastActivity = 1;
            if (c.lastActivity) {
                var diff = (new Date() - new Date(c.lastActivity)) / (1000 * 60 * 60 * 24);
                daysSinceLastActivity = Math.max(1, Math.round(diff));
            }
            var engagementWeight = (likedCount * 3) + (viewedCount * 1) + (showingCount * 5);
            var recencyFactor = 1 / (daysSinceLastActivity + 1);
            var score = Math.min(100, Math.max(0, Math.round(engagementWeight * recencyFactor * 20)));

            // Heat label
            var heat, heatColor, heatIcon;
            if (score >= 70) { heat = 'Hot'; heatColor = 'red'; heatIcon = 'fa-fire'; }
            else if (score >= 40) { heat = 'Warm'; heatColor = 'amber'; heatIcon = 'fa-thermometer-half'; }
            else { heat = 'Cold'; heatColor = 'blue'; heatIcon = 'fa-snowflake'; }

            // Needs attention flag
            var needsAttention = daysSinceLastActivity > 7 || (likedCount > 0 && showingCount === 0);

            // Deal stage info
            var stageLabels = { new_lead:'New Lead', qualified:'Qualified', requirements_confirmed:'Req. Confirmed', searching:'Searching', touring:'Touring', shortlist:'Shortlist', offer_prep:'Offer Prep', offer_submitted:'Offer Submitted', negotiation:'Negotiation', contract_signed:'Contract Signed', closing_scheduled:'Closing Scheduled', closed:'Closed' };
            var stages = ['new_lead','qualified','requirements_confirmed','searching','touring','shortlist','offer_prep','offer_submitted','negotiation','contract_signed','closing_scheduled','closed'];
            var currentStage = c.dealStage || 'new_lead';
            var stageIdx = stages.indexOf(currentStage);
            var stageProgress = Math.round(((stageIdx + 1) / stages.length) * 100);

            var html = '<div class="flex items-center justify-between mb-2">';
            html += '<h4 class="text-sm font-bold text-gray-700"><i class="fas ' + heatIcon + ' text-' + heatColor + '-500 mr-2"></i>Deal Health</h4>';
            html += '<div class="flex items-center gap-1.5">';
            html += '<span class="text-xs px-2 py-0.5 bg-' + heatColor + '-100 text-' + heatColor + '-700 rounded-full font-bold">' + heat + '</span>';
            if (needsAttention) html += '<span class="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full"><i class="fas fa-exclamation-triangle mr-0.5"></i>Attention</span>';
            html += '</div></div>';

            // Score circle
            html += '<div class="flex items-center gap-3 mb-3">';
            html += '<div class="relative w-14 h-14 flex-shrink-0">';
            html += '<svg class="w-14 h-14 -rotate-90" viewBox="0 0 56 56"><circle cx="28" cy="28" r="24" fill="none" stroke="#e5e7eb" stroke-width="4"/>';
            html += '<circle cx="28" cy="28" r="24" fill="none" stroke="' + (heatColor === 'red' ? '#ef4444' : heatColor === 'amber' ? '#f59e0b' : '#3b82f6') + '" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + Math.round(150.8 * score / 100) + ' 150.8"/></svg>';
            html += '<span class="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-800">' + score + '</span>';
            html += '</div>';
            html += '<div class="flex-1 text-xs text-gray-600 space-y-0.5">';
            html += '<div class="flex justify-between"><span>Viewed</span><span class="font-medium">' + viewedCount + '</span></div>';
            html += '<div class="flex justify-between"><span>Liked</span><span class="font-medium">' + likedCount + '</span></div>';
            html += '<div class="flex justify-between"><span>Showings</span><span class="font-medium">' + showingCount + '</span></div>';
            html += '<div class="flex justify-between"><span>Days idle</span><span class="font-medium ' + (daysSinceLastActivity > 7 ? 'text-red-600' : '') + '">' + daysSinceLastActivity + '</span></div>';
            html += '</div></div>';

            // Deal value / probability / timeline
            if (c.dealValue || c.closeProbability || c.estimatedTimeline) {
                html += '<div class="grid grid-cols-3 gap-2 mb-3 text-xs">';
                if (c.dealValue) {
                    var dvFmt = c.dealValue >= 1000000 ? '$' + (c.dealValue / 1000000).toFixed(1) + 'M' : '$' + Number(c.dealValue).toLocaleString();
                    html += '<div class="bg-green-50 rounded-lg p-2 text-center"><span class="block text-[10px] text-gray-500">Deal Value</span><span class="font-bold text-green-700">' + dvFmt + '</span></div>';
                }
                if (c.closeProbability != null) {
                    var cpColor = c.closeProbability >= 70 ? 'green' : c.closeProbability >= 40 ? 'amber' : 'red';
                    html += '<div class="bg-' + cpColor + '-50 rounded-lg p-2 text-center"><span class="block text-[10px] text-gray-500">Close Prob.</span><span class="font-bold text-' + cpColor + '-700">' + c.closeProbability + '%</span></div>';
                }
                if (c.estimatedTimeline) {
                    html += '<div class="bg-blue-50 rounded-lg p-2 text-center"><span class="block text-[10px] text-gray-500">Timeline</span><span class="font-bold text-blue-700">' + c.estimatedTimeline + 'd</span></div>';
                }
                html += '</div>';
            }

            // Pipeline progress
            html += '<div class="border-t pt-2">';
            html += '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold text-gray-600">Pipeline</span><span class="text-[10px] text-gray-500">' + (stageLabels[currentStage] || 'New Lead') + '</span></div>';
            html += '<div class="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden"><div class="h-full bg-blue-500 rounded-full transition-all" style="width:' + stageProgress + '%"></div></div>';
            html += '</div>';

            card.innerHTML = html;
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // STICKY COMMAND BAR (top-right, always visible)
        // ═══════════════════════════════════════════════════════════════════════════════

        function renderCommandBar(c) {
            var bar = document.getElementById('wsCommandBar');
            if (!bar) return;
            bar.classList.remove('hidden');
        }

        // Command Bar action handlers — each produces an object in localStorage
        function cmdSendCollection() {
            var clientId = currentWorkspaceClientId;
            if (!clientId) return;
            // Check for existing collections
            var cols = (typeof getClientCollections === 'function') ? getClientCollections(clientId) : [];
            if (!cols.length) {
                showToast('No collections yet. Select listings in search first.', 'warning');
                return;
            }
            // Send latest draft if available
            var drafts = cols.filter(function(c) { return c.status === 'DRAFT'; });
            if (drafts.length) {
                if (typeof __MallanMock !== 'undefined') __MallanMock.sendCollectionToClient(drafts[0].id);
            } else {
                showToast('No draft collections. Create one from search results first.', 'info');
                switchWsContentTab('portfolio');
            }
        }

        function cmdCreateTour() {
            var clientId = currentWorkspaceClientId;
            if (!clientId) return;
            var c = customerDB[clientId];
            if (!c) return;
            // Build tour from upcoming showings
            var showings = (c.showings || []).filter(function(s) { return s.status === 'scheduled'; });
            var tour = {
                id: 'tour-' + Date.now(),
                clientId: clientId,
                clientName: c.name,
                createdAt: new Date().toISOString(),
                showings: showings.map(function(s) { return { address: s.address, date: s.date, time: s.time }; })
            };
            // Store in outbox
            var outbox = JSON.parse(localStorage.getItem('OUTBOX_' + (c.agentId || 'agent1')) || '[]');
            outbox.push({ type: 'tour', data: tour, createdAt: tour.createdAt });
            localStorage.setItem('OUTBOX_' + (c.agentId || 'agent1'), JSON.stringify(outbox));
            logClientActivity(clientId, 'action', 'Created tour itinerary (' + showings.length + ' showing' + (showings.length !== 1 ? 's' : '') + ')');
            showToast('Tour created with ' + showings.length + ' showing(s)', 'success');
        }

        function cmdGenerateReport() {
            var clientId = currentWorkspaceClientId;
            if (!clientId) return;
            var c = customerDB[clientId];
            if (!c) return;
            var p = c.portfolio || {};
            var listings = p.listings || [];
            var report = {
                id: 'rpt-' + Date.now(),
                clientId: clientId,
                clientName: c.name,
                type: 'portfolio_summary',
                createdAt: new Date().toISOString(),
                listingCount: listings.length,
                liked: p.liked || 0,
                disliked: p.disliked || 0,
                shown: p.shown || 0
            };
            var reports = JSON.parse(localStorage.getItem('REPORTS_' + (c.agentId || 'agent1')) || '[]');
            reports.push(report);
            localStorage.setItem('REPORTS_' + (c.agentId || 'agent1'), JSON.stringify(reports));
            logClientActivity(clientId, 'action', 'Generated portfolio summary report (' + listings.length + ' listings)');
            showToast('Portfolio report generated', 'success');
        }

        function cmdLogNote() {
            var clientId = currentWorkspaceClientId;
            if (!clientId) return;
            // Scroll to notes card and focus the inline input
            var card = document.getElementById('wsNotesIntelCard');
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(function() {
                    var input = document.getElementById('inlineNoteInput');
                    if (input) input.focus();
                }, 300);
            }
        }

        function cmdMessage() {
            var clientId = currentWorkspaceClientId;
            if (!clientId) return;
            // Switch to Activity tab and scroll to messages panel
            switchWsContentTab('activity');
            setTimeout(function() {
                var panel = document.getElementById('wsMessagesPanel');
                if (panel) {
                    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(function() {
                        var input = document.getElementById('msgComposeInput');
                        if (input) input.focus();
                    }, 300);
                }
            }, 100);
        }

        function sendInlineMessage(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            var input = document.getElementById('msgComposeInput');
            var msg = input ? input.value.trim() : '';
            if (!msg) { if (input) input.focus(); return; }
            if (typeof __MallanMock !== 'undefined') {
                __MallanMock.sendMessage({ clientId: clientId, body: msg, senderType: 'agent' });
            }
            logClientActivity(clientId, 'action', 'Sent message: "' + msg.substring(0, 60) + (msg.length > 60 ? '...' : '') + '"');
            renderMessagesPanel(c);
            showToast('Message sent to ' + c.name, 'success');
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // NEXT BEST ACTIONS CARD (rule-based suggestions)
        // ═══════════════════════════════════════════════════════════════════════════════

        function renderNextBestActions(c) {
            var card = document.getElementById('wsNextActionsCard');
            if (!card) return;
            var actions = [];
            var clientId = currentWorkspaceClientId;

            // Rule: queued matches need review
            var queuedCount = (c.matchedListings || []).filter(function(m) { return m.status === 'queued'; }).length;
            if (queuedCount > 0) {
                actions.push({ icon: 'fa-inbox', color: 'blue', text: queuedCount + ' queued match' + (queuedCount > 1 ? 'es' : '') + ' need review', action: "switchWsContentTab('alerts')", btn: 'Review' });
            }

            // Rule: client viewed listings recently — send follow-up
            var viewCount = (c.viewHistory || []).length;
            if (viewCount >= 3) {
                actions.push({ icon: 'fa-eye', color: 'purple', text: 'Client viewed ' + viewCount + ' listings — send follow-up', action: "cmdMessage()", btn: 'Message' });
            }

            // Rule: portfolio has liked but no showings scheduled
            var liked = (c.portfolio || {}).liked || 0;
            var scheduledShowings = (c.showings || []).filter(function(s) { return s.status === 'scheduled'; }).length;
            if (liked > 0 && scheduledShowings === 0) {
                actions.push({ icon: 'fa-calendar-plus', color: 'amber', text: liked + ' liked listing' + (liked > 1 ? 's' : '') + ' — schedule showings', action: "openScheduleShowing('" + clientId + "')", btn: 'Schedule' });
            }

            // Rule: no collections sent yet
            var cols = (typeof getClientCollections === 'function') ? getClientCollections(clientId) : [];
            var sentCols = cols.filter(function(col) { return col.status === 'SENT'; });
            if (sentCols.length === 0 && (c.portfolio && c.portfolio.listings && c.portfolio.listings.length > 0)) {
                actions.push({ icon: 'fa-layer-group', color: 'indigo', text: 'No collections sent yet — create & send one', action: "switchWsContentTab('portfolio')", btn: 'Go to Portfolio' });
            }

            // Rule: invite not sent
            if (!c.inviteStatus || c.inviteStatus === 'not_invited') {
                actions.push({ icon: 'fa-paper-plane', color: 'green', text: 'Client not yet invited to portal', action: "openInviteModal('" + clientId + "')", btn: 'Invite' });
            }

            // Rule: invite expired
            if (c.inviteStatus === 'expired') {
                actions.push({ icon: 'fa-exclamation-triangle', color: 'red', text: 'Portal invite expired — resend', action: "openInviteModal('" + clientId + "')", btn: 'Resend' });
            }

            // Rule: preferences incomplete
            var p = c.preferences || {};
            var filled = 0; var total = 6;
            if (p.minPrice || p.maxPrice) filled++;
            if (p.minBeds || p.maxBeds) filled++;
            if ((p.propertyTypes || []).length) filled++;
            if ((p.neighborhoods || []).length) filled++;
            if ((p.mustHaves || []).length) filled++;
            if (p.moveInDate) filled++;
            if (filled < 4) {
                actions.push({ icon: 'fa-clipboard-list', color: 'amber', text: 'Preferences ' + Math.round((filled/total)*100) + '% complete — add more details', action: "editClientPreferences('" + clientId + "')", btn: 'Edit' });
            }

            if (!actions.length) {
                card.classList.add('hidden');
                return;
            }
            card.classList.remove('hidden');
            var html = '<h4 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-lightbulb text-amber-500 mr-2"></i>Next Best Actions</h4>';
            html += '<div class="space-y-2">';
            actions.slice(0, 4).forEach(function(a) {
                html += '<div class="flex items-center gap-2 p-2 bg-' + a.color + '-50 rounded-lg border border-' + a.color + '-100">';
                html += '<i class="fas ' + a.icon + ' text-' + a.color + '-500 flex-shrink-0 text-xs"></i>';
                html += '<span class="text-xs text-gray-700 flex-1">' + a.text + '</span>';
                html += '<button onclick="' + a.action + '" class="text-[10px] px-2 py-1 bg-' + a.color + '-600 text-white rounded font-medium hover:bg-' + a.color + '-700 flex-shrink-0">' + a.btn + '</button>';
                html += '</div>';
            });
            html += '</div>';
            card.innerHTML = html;
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // COLLECTIONS SUMMARY CARD (Overview sidebar — links to Portfolio tab)
        // ═══════════════════════════════════════════════════════════════════════════════

        function renderCollectionsSummary(c) {
            var card = document.getElementById('wsCollectionsSummary');
            if (!card) return;
            var clientId = currentWorkspaceClientId;
            var cols = (typeof getClientCollections === 'function') ? getClientCollections(clientId) : [];

            if (!cols.length) {
                card.classList.add('hidden');
                return;
            }
            card.classList.remove('hidden');

            var drafts = cols.filter(function(col) { return col.status === 'DRAFT'; }).length;
            var sent = cols.filter(function(col) { return col.status === 'SENT'; }).length;
            var archived = cols.filter(function(col) { return col.status === 'ARCHIVED'; }).length;
            var totalItems = cols.reduce(function(sum, col) { return sum + col.items.length; }, 0);
            var totalLiked = cols.reduce(function(sum, col) { return sum + col.items.filter(function(it) { return it.clientStatus === 'LIKED'; }).length; }, 0);
            var totalInfoReqs = cols.reduce(function(sum, col) { return sum + col.items.filter(function(it) { return it.requestedInfo; }).length; }, 0);
            var totalShowingReqs = cols.reduce(function(sum, col) { return sum + col.items.filter(function(it) { return it.requestedShowing; }).length; }, 0);

            var html = '<h4 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-layer-group text-indigo-500 mr-2"></i>Collections</h4>';
            html += '<div class="grid grid-cols-3 gap-1.5 text-center mb-3">';
            html += '<div class="bg-gray-50 rounded p-1.5"><div class="text-sm font-bold text-gray-700">' + drafts + '</div><div class="text-[9px] text-gray-500">Drafts</div></div>';
            html += '<div class="bg-emerald-50 rounded p-1.5"><div class="text-sm font-bold text-emerald-700">' + sent + '</div><div class="text-[9px] text-emerald-600">Sent</div></div>';
            html += '<div class="bg-yellow-50 rounded p-1.5"><div class="text-sm font-bold text-yellow-700">' + archived + '</div><div class="text-[9px] text-yellow-600">Archived</div></div>';
            html += '</div>';

            // Client feedback summary
            if (sent > 0 && (totalLiked || totalInfoReqs || totalShowingReqs)) {
                html += '<div class="space-y-1 mb-3">';
                if (totalLiked) html += '<div class="flex items-center justify-between text-xs"><span class="text-gray-600"><i class="fas fa-heart text-green-500 mr-1"></i>Liked</span><span class="font-medium text-green-700">' + totalLiked + '/' + totalItems + '</span></div>';
                if (totalInfoReqs) html += '<div class="flex items-center justify-between text-xs"><span class="text-gray-600"><i class="fas fa-info-circle text-blue-500 mr-1"></i>Info Requests</span><span class="font-medium text-blue-700">' + totalInfoReqs + '</span></div>';
                if (totalShowingReqs) html += '<div class="flex items-center justify-between text-xs"><span class="text-gray-600"><i class="fas fa-calendar text-purple-500 mr-1"></i>Showing Requests</span><span class="font-medium text-purple-700">' + totalShowingReqs + '</span></div>';
                html += '</div>';
            }

            html += '<button onclick="switchWsContentTab(\'portfolio\')" class="w-full px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-100 border border-indigo-200"><i class="fas fa-folder-open mr-1"></i>View All Collections</button>';
            card.innerHTML = html;
        }

        // Quick Stats card (Overview right column) — Enhanced with engagement metrics (Point 2)
        function renderQuickStats(c) {
            var card = document.getElementById('wsQuickStats');
            if (!card) return;
            var p = c.portfolio || {};
            var viewedCount = (c.viewHistory || []).length;
            var likedCount = p.liked || 0;
            var dislikedCount = p.disliked || 0;
            var totalSent = (c.sendHistory || []).reduce(function(sum, s) { return sum + s.count; }, 0);
            var scheduledShowings = (c.showings || []).filter(function(s) { return s.status === 'scheduled'; }).length;

            // Compute derived engagement metrics
            var viewToLikeRatio = viewedCount > 0 ? Math.round((likedCount / viewedCount) * 100) : 0;
            var engagementRate = totalSent > 0 ? Math.round(((likedCount + viewedCount) / totalSent) * 100) : 0;
            if (engagementRate > 100) engagementRate = 100;
            // Mock open rate (would be real in production)
            var openRate = totalSent > 0 ? Math.min(100, Math.round(60 + Math.random() * 30)) : 0;

            var stats = [
                { icon: 'fa-star', label: 'Portfolio', value: (p.listings || []).length, color: 'indigo' },
                { icon: 'fa-heart', label: 'Liked', value: likedCount, color: 'green' },
                { icon: 'fa-thumbs-down', label: 'Disliked', value: dislikedCount, color: 'red' },
                { icon: 'fa-eye', label: 'Viewed', value: viewedCount, color: 'purple' },
                { icon: 'fa-calendar', label: 'Showings', value: scheduledShowings, color: 'amber' },
                { icon: 'fa-envelope', label: 'Sent', value: totalSent, color: 'blue' },
                { icon: 'fa-envelope-open', label: 'Open Rate', value: openRate + '%', color: 'cyan' }
            ];
            var html = '<h4 class="text-sm font-bold text-gray-700 mb-2"><i class="fas fa-chart-pie text-blue-500 mr-2"></i>Quick Stats</h4>';
            html += '<div class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-1.5 text-center">';
            stats.forEach(function(s) {
                html += '<div class="bg-' + s.color + '-50 rounded-lg p-1.5">';
                html += '<i class="fas ' + s.icon + ' text-' + s.color + '-500 text-xs mb-0.5 block"></i>';
                html += '<div class="text-base font-bold text-' + s.color + '-700">' + s.value + '</div>';
                html += '<div class="text-[9px] text-' + s.color + '-600">' + s.label + '</div></div>';
            });
            html += '</div>';

            // Engagement metrics row
            html += '<div class="grid grid-cols-3 gap-1.5 mt-2 text-center">';
            html += '<div class="bg-emerald-50 rounded-lg p-1.5"><div class="text-xs font-bold text-emerald-700">' + engagementRate + '%</div><div class="text-[9px] text-emerald-600">Engagement</div></div>';
            html += '<div class="bg-violet-50 rounded-lg p-1.5"><div class="text-xs font-bold text-violet-700">' + viewToLikeRatio + '%</div><div class="text-[9px] text-violet-600">View→Like</div></div>';
            var daysSinceActivity = c.lastActivity ? Math.round((new Date() - new Date(c.lastActivity)) / (1000 * 60 * 60 * 24)) : 0;
            html += '<div class="bg-gray-50 rounded-lg p-1.5"><div class="text-xs font-bold ' + (daysSinceActivity > 5 ? 'text-red-600' : 'text-gray-700') + '">' + daysSinceActivity + 'd</div><div class="text-[9px] text-gray-600">Avg Feedback</div></div>';
            html += '</div>';

            card.innerHTML = html;
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // TASK CARD — Point 4: Execution Layer
        // ═══════════════════════════════════════════════════════════════════════════════

        function renderTasksCard(c) {
            var card = document.getElementById('wsTasksCard');
            if (!card) return;
            var tasks = c.tasks || [];
            // Always show card (inline form available even with no tasks)
            card.classList.remove('hidden');

            var today = new Date().toISOString().slice(0, 10);
            // Mark overdue tasks
            tasks.forEach(function(t) { if (t.status === 'pending' && t.dueDate < today) t.overdue = true; else if (t.status !== 'pending') t.overdue = false; });

            var pending = tasks.filter(function(t) { return t.status === 'pending'; });
            var completed = tasks.filter(function(t) { return t.status === 'completed'; });
            var overdue = pending.filter(function(t) { return t.overdue; });
            var clientId = currentWorkspaceClientId;

            // Sort pending: overdue first, then by due date ascending
            pending.sort(function(a, b) {
                if (a.overdue && !b.overdue) return -1;
                if (!a.overdue && b.overdue) return 1;
                return (a.dueDate || '').localeCompare(b.dueDate || '');
            });

            var html = '<div class="flex items-center justify-between mb-2">';
            html += '<h4 class="text-sm font-bold text-gray-700"><i class="fas fa-tasks text-amber-500 mr-2"></i>Tasks <span class="text-xs font-normal text-gray-400">(' + pending.length + ' pending)</span></h4>';
            html += '<button onclick="toggleAddTaskForm(\'' + clientId + '\')" class="text-[10px] px-2 py-0.5 bg-amber-600 text-white rounded font-medium hover:bg-amber-700">+ Add</button>';
            html += '</div>';

            // Inline add-task form (hidden by default)
            var defaultDue = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
            html += '<div id="addTaskFormInline" class="hidden mb-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">';
            html += '<input type="text" id="addTaskText" placeholder="Task description..." class="w-full text-xs border rounded px-2 py-1.5 mb-1.5" onkeydown="if(event.key===\'Enter\')submitInlineTask(\'' + clientId + '\')">';
            html += '<div class="flex items-center gap-2">';
            html += '<input type="date" id="addTaskDue" value="' + defaultDue + '" class="text-xs border rounded px-2 py-1 flex-1">';
            html += '<button onclick="submitInlineTask(\'' + clientId + '\')" class="text-[10px] px-3 py-1 bg-amber-600 text-white rounded font-medium hover:bg-amber-700">Save</button>';
            html += '<button onclick="toggleAddTaskForm(\'' + clientId + '\')" class="text-[10px] px-2 py-1 text-gray-500 hover:text-gray-700">Cancel</button>';
            html += '</div></div>';

            if (overdue.length > 0) {
                html += '<div class="text-[10px] px-2 py-1 bg-red-50 text-red-600 rounded mb-2 font-medium"><i class="fas fa-exclamation-triangle mr-1"></i>' + overdue.length + ' overdue task' + (overdue.length > 1 ? 's' : '') + '</div>';
            }

            html += '<div class="space-y-1.5">';
            if (pending.length === 0 && completed.length === 0) {
                html += '<div class="text-center text-[10px] text-gray-300 py-4"><i class="fas fa-clipboard text-lg mb-1"></i><br>No tasks yet</div>';
            }
            pending.forEach(function(t) {
                html += '<div class="flex items-start gap-2 p-2 rounded-lg border ' + (t.overdue ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50') + '">';
                html += '<button onclick="toggleClientTask(\'' + clientId + '\',\'' + t.id + '\')" class="mt-0.5 w-4 h-4 rounded border-2 ' + (t.overdue ? 'border-red-400' : 'border-gray-300') + ' flex-shrink-0 hover:border-blue-500 flex items-center justify-center"></button>';
                html += '<div class="flex-1 min-w-0">';
                html += '<p class="text-xs text-gray-700 leading-tight">' + t.text + '</p>';
                html += '<div class="flex items-center gap-2 mt-0.5">';
                html += '<span class="text-[10px] ' + (t.overdue ? 'text-red-600 font-semibold' : 'text-gray-400') + '"><i class="far fa-calendar mr-0.5"></i>' + t.dueDate + '</span>';
                if (t.overdue) html += '<span class="text-[9px] px-1 py-0.5 bg-red-100 text-red-700 rounded font-bold">OVERDUE</span>';
                html += '</div></div>';
                html += '<button onclick="removeClientTask(\'' + clientId + '\',\'' + t.id + '\')" class="text-gray-300 hover:text-red-500 text-[10px] flex-shrink-0 mt-0.5"><i class="fas fa-times"></i></button>';
                html += '</div>';
            });
            if (completed.length > 0) {
                html += '<div class="border-t pt-1.5 mt-1.5">';
                html += '<p class="text-[10px] text-gray-400 mb-1">' + completed.length + ' completed</p>';
                completed.slice(0, 3).forEach(function(t) {
                    html += '<div class="flex items-center gap-2 py-0.5 text-[10px] text-gray-400 line-through">';
                    html += '<i class="fas fa-check-circle text-green-400"></i><span>' + t.text + '</span></div>';
                });
                html += '</div>';
            }
            html += '</div>';
            card.innerHTML = html;
        }

        function toggleAddTaskForm(clientId) {
            var form = document.getElementById('addTaskFormInline');
            if (!form) return;
            form.classList.toggle('hidden');
            if (!form.classList.contains('hidden')) {
                var textInput = document.getElementById('addTaskText');
                if (textInput) textInput.focus();
            }
        }

        function submitInlineTask(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            var textInput = document.getElementById('addTaskText');
            var dueInput = document.getElementById('addTaskDue');
            var text = textInput ? textInput.value.trim() : '';
            var dueStr = dueInput ? dueInput.value : '';
            if (!text) { if (textInput) textInput.focus(); return; }
            if (!dueStr) dueStr = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
            if (!c.tasks) c.tasks = [];
            c.tasks.push({ id: 'tsk-' + Date.now(), text: text, dueDate: dueStr, status: 'pending', overdue: false });
            logClientActivity(clientId, 'action', 'Added task: ' + text);
            renderTasksCard(c);
            showToast('Task added', 'success');
        }

        function addClientTask(clientId) {
            // Legacy fallback — now opens inline form
            toggleAddTaskForm(clientId);
        }

        function toggleClientTask(clientId, taskId) {
            var c = customerDB[clientId];
            if (!c || !c.tasks) return;
            var task = c.tasks.find(function(t) { return t.id === taskId; });
            if (!task) return;
            task.status = task.status === 'pending' ? 'completed' : 'pending';
            task.overdue = false;
            logClientActivity(clientId, 'action', (task.status === 'completed' ? 'Completed' : 'Reopened') + ' task: ' + task.text);
            renderTasksCard(c);
            showToast('Task ' + (task.status === 'completed' ? 'completed' : 'reopened'), 'success');
        }

        function removeClientTask(clientId, taskId) {
            var c = customerDB[clientId];
            if (!c || !c.tasks) return;
            c.tasks = c.tasks.filter(function(t) { return t.id !== taskId; });
            renderTasksCard(c);
        }

        // Invite Status card (Overview right column)
        function renderInviteStatusCard(c) {
            var card = document.getElementById('wsInviteStatusCard');
            if (!card) return;
            var clientId = currentWorkspaceClientId;
            var statusLabels = { not_invited: 'Not Invited', sent: 'Sent', opened: 'Opened', accepted: 'Accepted', active: 'Active', expired: 'Expired' };
            var statusColors = { not_invited: 'gray', sent: 'amber', opened: 'blue', accepted: 'green', active: 'green', expired: 'red' };
            var st = c.inviteStatus || 'not_invited';
            var sc = statusColors[st] || 'gray';
            var isActive = (st === 'active' || st === 'accepted');
            var isSent = (st === 'sent' || st === 'opened');

            var html = '<div class="flex items-center justify-between mb-2"><h4 class="text-sm font-bold text-gray-700"><i class="fas fa-paper-plane text-blue-500 mr-2"></i>Portal Invite</h4>';
            html += '<span class="text-xs px-2 py-0.5 bg-' + sc + '-100 text-' + sc + '-700 rounded-full font-medium">' + (statusLabels[st] || st) + '</span></div>';
            html += (c.inviteSentDate ? '<p class="text-xs text-gray-500 mb-1">Sent: ' + c.inviteSentDate + '</p>' : '<p class="text-xs text-gray-400 mb-1">Not yet invited</p>');
            html += (c.inviteResendCount > 0 ? '<p class="text-xs text-gray-400 mb-2">Resent ' + c.inviteResendCount + ' time(s)</p>' : '');

            // Action buttons row
            html += '<div class="space-y-1.5 mt-2">';
            if (st === 'not_invited') {
                html += '<button onclick="openInviteModal(\'' + clientId + '\')" class="w-full px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"><i class="fas fa-paper-plane mr-1"></i>Send Invite</button>';
            } else {
                // Resend
                html += '<button onclick="openInviteModal(\'' + clientId + '\')" class="w-full px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"><i class="fas fa-redo mr-1"></i>Resend Invite</button>';
                // Preview
                html += '<button onclick="enterViewAsClient(\'' + clientId + '\')" class="w-full px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-100 border border-purple-200"><i class="fas fa-eye mr-1"></i>Preview Portal</button>';
                // Revoke (only for active/accepted)
                if (isActive || isSent) {
                    html += '<button onclick="revokePortalAccess(\'' + clientId + '\')" class="w-full px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 border border-red-200"><i class="fas fa-ban mr-1"></i>Revoke Access</button>';
                }
            }
            html += '</div>';
            card.innerHTML = html;
        }

        function revokePortalAccess(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            if (!confirm('Revoke portal access for ' + c.name + '? They will no longer be able to view collections or listings.')) return;
            c.inviteStatus = 'expired';
            logClientActivity(clientId, 'action', 'Revoked portal access for ' + c.name);
            if (typeof logAuditEntry === 'function') logAuditEntry('portal_revoked', { clientName: c.name, email: c.email });
            renderInviteStatusCard(c);
            showToast('Portal access revoked for ' + c.name, 'info');
        }

        // Closed Info card (only shown for closed clients)
        function renderClosedInfoCard(c) {
            var card = document.getElementById('wsClosedInfoCard');
            if (!card) return;
            if (c.clientStatus !== 'closed') { card.classList.add('hidden'); return; }
            card.classList.remove('hidden');
            var closedLabels = { purchased: 'Purchased', rented: 'Rented', sold: 'Sold', leased: 'Leased' };
            var ca = c.closedAlertSettings || {};
            var freqLabels = { monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annually' };
            var typeLabels = { newsletter: 'Newsletter', market_report: 'Market Report', both: 'Both' };
            card.innerHTML = '<h4 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-archive text-gray-400 mr-2"></i>Closed Deal</h4>' +
                '<div class="grid grid-cols-2 gap-3 text-sm mb-3">' +
                    '<div><span class="text-xs text-gray-500 block">Outcome</span><span class="font-medium">' + (closedLabels[c.closedType] || 'Closed') + '</span></div>' +
                    '<div><span class="text-xs text-gray-500 block">Date</span><span class="font-medium">' + (c.closedDate || 'N/A') + '</span></div>' +
                    (c.closedProperty ? '<div class="col-span-2"><span class="text-xs text-gray-500 block">Property</span><span class="font-medium">' + c.closedProperty + '</span></div>' : '') +
                '</div>' +
                '<div class="border-t pt-3">' +
                    '<h5 class="text-xs font-bold text-gray-600 mb-2">Post-Close Communications</h5>' +
                    '<div class="flex items-center gap-3 text-xs">' +
                        '<span class="px-2 py-0.5 rounded-full ' + (ca.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500') + '">' + (ca.enabled ? 'Active' : 'Disabled') + '</span>' +
                        (ca.enabled ? '<span>' + (typeLabels[ca.type] || '') + ' &bull; ' + (freqLabels[ca.frequency] || '') + '</span>' : '') +
                    '</div>' +
                    (ca.enabled ? '<button onclick="sendMarketReport(\'' + currentWorkspaceClientId + '\')" class="mt-2 px-3 py-1.5 bg-gray-800 text-white rounded-lg text-xs hover:bg-gray-900"><i class="fas fa-chart-line mr-1"></i>Send Market Report Now</button>' : '') +
                '</div>';
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // NURTURE / FOLLOW-UP CARD — Per-client lifecycle management
        // UCBA 2026 §4.3: Participant obligations for ongoing client relationship
        // ═══════════════════════════════════════════════════════════════════════════════

        function renderNurtureCard(c) {
            var card = document.getElementById('wsNurtureCard');
            if (!card) return;
            card.classList.remove('hidden');
            var clientId = currentWorkspaceClientId;
            var pd = c.pipelineData || {};
            var today = new Date();
            var todayStr = today.toISOString().slice(0, 10);
            var isRenter = (c.clientType === 'renter' || c.closedType === 'rented');
            var isClosed = (c.clientStatus === 'closed');
            var freqLabels = { annual: 'Annual', biannual: 'Every 6 Months', quarterly: 'Quarterly', '60days_before_lease': '60 Days Before Lease Expiration', custom: 'Custom' };

            var html = '<div class="flex items-center justify-between mb-3">';
            html += '<h4 class="text-sm font-bold text-gray-700"><i class="fas fa-seedling text-emerald-500 mr-2"></i>Follow-Up & Nurture</h4>';
            html += '<span class="text-[9px] px-1.5 py-0.5 bg-gray-900 text-emerald-400 rounded-full font-medium" data-compliance="UCBA-4.3" title="UCBA 2026 §4.3 — Ongoing client relationship management"><i class="fas fa-shield-alt mr-0.5"></i>UCBA §4.3</span>';
            html += '</div>';

            // Follow-up history / upcoming
            var followUps = c._followUps || [];
            var nextFollowUp = pd.nextCheckIn ? { date: pd.nextCheckIn } : null;
            var daysUntil = nextFollowUp ? Math.round((new Date(nextFollowUp.date) - today) / (1000 * 60 * 60 * 24)) : null;

            // Status banner
            if (nextFollowUp) {
                var bannerColor = 'green';
                var bannerText = 'Next follow-up: ' + nextFollowUp.date;
                if (daysUntil < 0) { bannerColor = 'red'; bannerText = 'OVERDUE by ' + Math.abs(daysUntil) + ' days — ' + nextFollowUp.date; }
                else if (daysUntil <= 14) { bannerColor = 'amber'; bannerText = 'Due in ' + daysUntil + ' days — ' + nextFollowUp.date; }
                else if (daysUntil <= 60) { bannerColor = 'blue'; bannerText = 'Coming up in ' + daysUntil + ' days — ' + nextFollowUp.date; }
                else { bannerText = 'Scheduled: ' + nextFollowUp.date + ' (' + daysUntil + ' days)'; }

                html += '<div class="flex items-center gap-2 px-3 py-2 bg-' + bannerColor + '-50 border border-' + bannerColor + '-200 rounded-lg mb-3">';
                html += '<i class="fas fa-bell text-' + bannerColor + '-500"></i>';
                html += '<span class="text-xs font-medium text-' + bannerColor + '-700 flex-1">' + bannerText + '</span>';
                if (daysUntil !== null && daysUntil <= 14) {
                    html += '<button onclick="nurtureLogCheckIn(\'' + clientId + '\')" class="text-[10px] px-2 py-0.5 bg-' + bannerColor + '-600 text-white rounded font-medium hover:bg-' + bannerColor + '-700">Log Check-In</button>';
                }
                html += '</div>';
            }

            // Renter: Lease info
            if (isRenter && pd.leaseExpiration) {
                var leaseDays = Math.round((new Date(pd.leaseExpiration) - today) / (1000 * 60 * 60 * 24));
                var lc = leaseDays <= 60 ? 'red' : leaseDays <= 120 ? 'amber' : 'green';
                html += '<div class="flex items-center gap-2 px-3 py-2 bg-' + lc + '-50 border border-' + lc + '-200 rounded-lg mb-3" data-compliance="REBNY-RLS" title="Lease expiration tracking per RLS client management standards">';
                html += '<i class="fas fa-file-contract text-' + lc + '-500"></i>';
                html += '<span class="text-xs text-' + lc + '-700 font-medium">Lease expires: ' + pd.leaseExpiration + ' (' + (leaseDays > 0 ? leaseDays + ' days' : Math.abs(leaseDays) + ' days ago') + ')</span>';
                html += '</div>';
            }

            // Buyer/Seller: Seller potential
            if (!isRenter && isClosed && pd.sellerPotentialYears) {
                var yrOwned = ((today - new Date(c.closedDate)) / (1000 * 60 * 60 * 24 * 365)).toFixed(1);
                html += '<div class="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg mb-3">';
                html += '<i class="fas fa-home text-blue-500"></i>';
                html += '<span class="text-xs text-blue-700 font-medium">Seller potential: ~' + pd.sellerPotentialYears + ' years (owned ' + yrOwned + ' yr)</span>';
                html += '</div>';
            }

            // Current schedule info
            html += '<div class="grid grid-cols-2 gap-2 text-xs mb-3">';
            html += '<div class="bg-gray-50 rounded-lg p-2"><span class="text-[10px] text-gray-400 block">Frequency</span><span class="font-medium text-gray-700">' + (freqLabels[pd.checkInFrequency] || 'Not set') + '</span></div>';
            html += '<div class="bg-gray-50 rounded-lg p-2"><span class="text-[10px] text-gray-400 block">Last Check-In</span><span class="font-medium text-gray-700">' + (pd.lastCheckIn || 'Never') + '</span></div>';
            html += '</div>';

            // Follow-up history
            if (followUps.length > 0) {
                html += '<div class="mb-3"><p class="text-[10px] font-semibold text-gray-500 mb-1.5">Follow-Up History</p>';
                html += '<div class="space-y-1">';
                followUps.slice().reverse().slice(0, 5).forEach(function(fu) {
                    var fIcon = { call: 'fa-phone text-green-500', email: 'fa-envelope text-blue-500', meeting: 'fa-users text-purple-500', other: 'fa-check text-gray-500' };
                    html += '<div class="flex items-center gap-2 text-[10px] text-gray-500 py-1 border-b border-gray-50">';
                    html += '<i class="fas ' + (fIcon[fu.type] || fIcon.other) + '"></i>';
                    html += '<span class="flex-1">' + (fu.note || fu.type) + '</span>';
                    html += '<span class="text-gray-400">' + fu.date + '</span>';
                    html += '</div>';
                });
                html += '</div></div>';
            }

            // Schedule follow-up form
            html += '<div class="border-t pt-3">';
            html += '<p class="text-[10px] font-semibold text-gray-600 mb-2"><i class="fas fa-calendar-plus mr-1"></i>Schedule Follow-Up</p>';
            var defaultDate = new Date(); defaultDate.setMonth(defaultDate.getMonth() + 1);
            html += '<div class="space-y-2">';
            html += '<div class="flex gap-2">';
            html += '<input type="date" id="nurtureFollowUpDate" value="' + defaultDate.toISOString().slice(0, 10) + '" class="flex-1 text-xs border rounded px-2 py-1.5">';
            html += '<select id="nurtureFollowUpType" class="text-xs border rounded px-2 py-1.5">';
            html += '<option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="other">Other</option>';
            html += '</select></div>';
            html += '<input type="text" id="nurtureFollowUpNote" placeholder="Follow-up note (optional)..." class="w-full text-xs border rounded px-2 py-1.5" onkeydown="if(event.key===\'Enter\')nurtureScheduleFollowUp(\'' + clientId + '\')">';
            html += '<div class="flex gap-2">';
            html += '<button onclick="nurtureScheduleFollowUp(\'' + clientId + '\')" class="flex-1 text-[10px] px-3 py-1.5 bg-emerald-600 text-white rounded font-medium hover:bg-emerald-700"><i class="fas fa-calendar-check mr-1"></i>Schedule</button>';
            // Quick-schedule buttons
            html += '<button onclick="nurtureQuickSchedule(\'' + clientId + '\', 60)" class="text-[10px] px-2 py-1.5 bg-gray-200 text-gray-700 rounded font-medium hover:bg-gray-300" title="60 days from now">60d</button>';
            html += '<button onclick="nurtureQuickSchedule(\'' + clientId + '\', 180)" class="text-[10px] px-2 py-1.5 bg-gray-200 text-gray-700 rounded font-medium hover:bg-gray-300" title="6 months from now">6mo</button>';
            html += '<button onclick="nurtureQuickSchedule(\'' + clientId + '\', 365)" class="text-[10px] px-2 py-1.5 bg-gray-200 text-gray-700 rounded font-medium hover:bg-gray-300" title="1 year from now">1yr</button>';
            html += '</div>';

            // Frequency setting
            html += '<div class="flex items-center gap-2 mt-1">';
            html += '<label class="text-[10px] text-gray-500">Recurring:</label>';
            html += '<select id="nurtureFrequency" class="text-[10px] border rounded px-2 py-1" onchange="nurtureUpdateFrequency(\'' + clientId + '\', this.value)">';
            var freqOpts = isRenter ? ['60days_before_lease', 'quarterly', 'annual', 'custom'] : ['annual', 'biannual', 'quarterly', 'custom'];
            freqOpts.forEach(function(f) {
                html += '<option value="' + f + '"' + (pd.checkInFrequency === f ? ' selected' : '') + '>' + (freqLabels[f] || f) + '</option>';
            });
            html += '</select></div>';
            html += '</div></div>';

            // Pipeline notes
            if (pd.notes) {
                html += '<div class="mt-2 text-[10px] text-gray-400 italic"><i class="fas fa-sticky-note mr-1"></i>' + pd.notes + '</div>';
            }

            card.innerHTML = html;
        }

        function nurtureScheduleFollowUp(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            var dateInput = document.getElementById('nurtureFollowUpDate');
            var typeSelect = document.getElementById('nurtureFollowUpType');
            var noteInput = document.getElementById('nurtureFollowUpNote');
            var date = dateInput ? dateInput.value : '';
            var type = typeSelect ? typeSelect.value : 'call';
            var note = noteInput ? noteInput.value.trim() : '';
            if (!date) { showToast('Please select a date', 'error'); return; }

            if (!c.pipelineData) c.pipelineData = {};
            c.pipelineData.nextCheckIn = date;

            if (!c._followUps) c._followUps = [];
            c._followUps.push({ date: new Date().toISOString().slice(0, 10), scheduledFor: date, type: type, note: note || 'Scheduled ' + type + ' follow-up for ' + date, author: LOGGED_IN_AGENT.name });

            logClientActivity(clientId, 'action', 'Scheduled ' + type + ' follow-up for ' + date + (note ? ': ' + note : ''));
            renderNurtureCard(c);
            showToast('Follow-up scheduled for ' + date, 'success');
        }

        function nurtureQuickSchedule(clientId, days) {
            var target = new Date();
            target.setDate(target.getDate() + days);
            var dateInput = document.getElementById('nurtureFollowUpDate');
            if (dateInput) dateInput.value = target.toISOString().slice(0, 10);
        }

        function nurtureLogCheckIn(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            if (!c.pipelineData) c.pipelineData = {};
            var pd = c.pipelineData;
            var todayStr = new Date().toISOString().slice(0, 10);
            pd.lastCheckIn = todayStr;

            if (!c._followUps) c._followUps = [];
            c._followUps.push({ date: todayStr, type: 'check-in', note: 'Check-in completed', author: LOGGED_IN_AGENT.name });

            // Auto-schedule next based on frequency
            var next = new Date();
            if (pd.checkInFrequency === 'annual') next.setFullYear(next.getFullYear() + 1);
            else if (pd.checkInFrequency === 'biannual') next.setMonth(next.getMonth() + 6);
            else if (pd.checkInFrequency === 'quarterly') next.setMonth(next.getMonth() + 3);
            else if (pd.checkInFrequency === '60days_before_lease' && pd.leaseExpiration) {
                var leaseDate = new Date(pd.leaseExpiration);
                if (leaseDate < new Date()) { leaseDate.setFullYear(leaseDate.getFullYear() + 1); pd.leaseExpiration = leaseDate.toISOString().slice(0, 10); }
                next = new Date(leaseDate.getTime() - 60 * 86400000);
            } else { next.setFullYear(next.getFullYear() + 1); }
            pd.nextCheckIn = next.toISOString().slice(0, 10);

            logClientActivity(clientId, 'action', 'Check-in completed. Next: ' + pd.nextCheckIn);
            renderNurtureCard(c);
            showToast('Check-in logged. Next: ' + pd.nextCheckIn, 'success');
        }

        function nurtureUpdateFrequency(clientId, freq) {
            var c = customerDB[clientId];
            if (!c) return;
            if (!c.pipelineData) c.pipelineData = {};
            c.pipelineData.checkInFrequency = freq;
            showToast('Frequency updated to ' + freq, 'info');
        }

        function sendMarketReport(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            logClientActivity(clientId, 'action', 'Sent market report to ' + c.email);
            logAuditEntry('market_report_sent', { clientName: c.name, email: c.email });
            showToast('Market report sent to ' + c.email, 'success');
        }

        function deleteClientConfirm(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            if (!confirm('Delete client "' + c.name + '"? This cannot be undone.')) return;
            delete customerDB[clientId];
            closeClientWorkspace();
            renderClientGrid();
            populateClientSelect();
            showToast('Client deleted', 'info');
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // CLIENT WORKSPACE — Column 1: Profile & Preferences
        // ═══════════════════════════════════════════════════════════════════════════════

        function renderClientProfile(c) {
            var card = document.getElementById('wsProfileCard');
            var inviteColors = { active: 'green', accepted: 'green', sent: 'amber', opened: 'blue', not_invited: 'gray', expired: 'red' };
            var ic = inviteColors[c.inviteStatus || 'not_invited'] || 'gray';
            var loginCount = (c.loginHistory || []).length;
            var lastLoginText = c.lastLogin ? c.lastLogin : 'Never logged in';
            var lastDevice = c.loginHistory && c.loginHistory.length ? c.loginHistory[0].device : '';

            card.innerHTML = '<div class="flex items-center justify-between mb-1"><span class="text-[9px] text-gray-400 font-medium" data-compliance="RLS-Client"><i class="fas fa-shield-alt mr-0.5"></i>RLS Client Record · NY SHIELD Act Protected</span></div>' +
            '<div class="flex items-center gap-3 mb-3">' +
                '<div class="w-14 h-14 bg-' + c.color + '-100 rounded-full flex items-center justify-center text-' + c.color + '-600 font-bold text-xl">' + c.initials + '</div>' +
                '<div class="flex-1">' +
                    '<h3 class="font-bold text-gray-900">' + c.name + '</h3>' +
                    '<p class="text-xs text-gray-500"><i class="fas fa-envelope mr-1"></i><a href="mailto:' + c.email + '" class="hover:text-blue-600">' + c.email + '</a></p>' +
                    (c.phone ? '<p class="text-xs text-gray-500"><i class="fas fa-phone mr-1"></i><a href="tel:' + c.phone + '" class="hover:text-blue-600">' + c.phone + '</a></p>' : '') +
                '</div>' +
                '<span class="text-xs px-2 py-0.5 bg-' + ic + '-100 text-' + ic + '-700 rounded-full font-medium self-start"><i class="fas fa-circle text-[5px] mr-0.5"></i>' + (c.inviteStatus || 'not_invited').replace('_',' ').replace(/\b\w/g, function(l){return l.toUpperCase();}) + '</span>' +
            '</div>' +
            '<div class="grid grid-cols-2 gap-2 text-xs mb-3">' +
                '<div class="bg-gray-50 rounded-lg p-2"><span class="text-gray-500 block">Last Login</span><span class="font-medium text-gray-800">' + lastLoginText + '</span>' + (lastDevice ? '<br><span class="text-gray-400">' + lastDevice + '</span>' : '') + '</div>' +
                '<div class="bg-gray-50 rounded-lg p-2"><span class="text-gray-500 block">Logins</span><span class="font-medium text-gray-800">' + loginCount + ' total</span></div>' +
            '</div>' +
            (function() {
                var tags = c.internalTags || [];
                var tagHtml = '<div class="border-t pt-2"><div class="flex items-center justify-between mb-1.5"><span class="text-[10px] font-semibold text-gray-600"><i class="fas fa-tags mr-1"></i>Internal Tags</span><button onclick="addInternalTag(\'' + currentWorkspaceClientId + '\')" class="text-[10px] text-blue-600 hover:text-blue-800 font-medium">+ Add</button></div>';
                tagHtml += '<div class="flex flex-wrap gap-1" id="wsInternalTags">';
                if (!tags.length) { tagHtml += '<span class="text-[10px] text-gray-400 italic">No tags</span>'; }
                else { tags.forEach(function(t) { tagHtml += '<span class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium">' + t + '<button onclick="removeInternalTag(\'' + currentWorkspaceClientId + '\',\'' + t.replace(/'/g, "\\'") + '\')" class="text-indigo-400 hover:text-red-500">&times;</button></span>'; }); }
                tagHtml += '</div></div>';
                return tagHtml;
            })();
        }

        function addInternalTag(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            var tag = prompt('Enter tag name:');
            if (!tag || !tag.trim()) return;
            tag = tag.trim();
            if (!c.internalTags) c.internalTags = [];
            if (c.internalTags.indexOf(tag) !== -1) { showToast('Tag already exists', 'info'); return; }
            c.internalTags.push(tag);
            renderClientProfile(c);
            showToast('Tag "' + tag + '" added', 'success');
        }

        function removeInternalTag(clientId, tag) {
            var c = customerDB[clientId];
            if (!c || !c.internalTags) return;
            c.internalTags = c.internalTags.filter(function(t) { return t !== tag; });
            renderClientProfile(c);
            showToast('Tag removed', 'info');
        }

        function renderClientPreferences(c) {
            var card = document.getElementById('wsPreferencesCard');
            var p = c.preferences || {};
            var cid = currentWorkspaceClientId;

            // Completeness Score
            var fields = [
                { key: 'budget', filled: !!(p.minPrice || p.maxPrice), label: 'Budget' },
                { key: 'beds', filled: !!(p.minBeds || p.maxBeds), label: 'Bedrooms' },
                { key: 'baths', filled: !!(p.minBaths || p.maxBaths), label: 'Bathrooms' },
                { key: 'types', filled: (p.propertyTypes || []).length > 0, label: 'Property Types' },
                { key: 'areas', filled: (p.neighborhoods || []).length > 0, label: 'Neighborhoods' },
                { key: 'mustHaves', filled: (p.mustHaves || []).length > 0, label: 'Must-Haves' },
                { key: 'moveIn', filled: !!p.moveInDate, label: 'Move-in Date' },
                { key: 'notes', filled: !!p.notes, label: 'Notes' }
            ];
            var filledCount = fields.filter(function(f) { return f.filled; }).length;
            var score = Math.round((filledCount / fields.length) * 100);
            var scoreColor = score >= 80 ? 'green' : score >= 50 ? 'amber' : 'red';

            // Smart conflict detection
            var conflicts = [];
            var mustHavesList = (p.mustHaves || []).map(function(m) { return m.toLowerCase(); });
            if (mustHavesList.indexOf('full floor') !== -1 && p.maxPrice && p.maxPrice < 2000000) {
                conflicts.push('Full Floor + <$2M rare in selected areas');
            }
            if (mustHavesList.indexOf('doorman') !== -1 && mustHavesList.indexOf('pre-war') !== -1 && mustHavesList.indexOf('central park views') !== -1) {
                conflicts.push('Doorman + Pre-war + Central Park Views — very rare combination');
            }
            if (mustHavesList.indexOf('laundry in-unit') !== -1 && (p.propertyTypes || []).indexOf('Co-op') !== -1 && p.maxPrice && p.maxPrice < 1500000) {
                conflicts.push('In-unit laundry in Co-op under $1.5M is uncommon');
            }
            if (p.minBeds && p.minBeds >= 4 && p.maxPrice && p.maxPrice < 3000000 && c.clientType !== 'renter') {
                conflicts.push('4+ BR under $3M — limited inventory in Manhattan');
            }
            if (mustHavesList.indexOf('pet-friendly') !== -1 && (p.propertyTypes || []).indexOf('Co-op') !== -1) {
                conflicts.push('Many Co-ops have pet restrictions — verify board policies');
            }

            // Rarity indicator
            var rarityScore = 0;
            if (mustHavesList.length >= 4) rarityScore += 2;
            else if (mustHavesList.length >= 2) rarityScore += 1;
            if ((p.neighborhoods || []).length <= 1) rarityScore += 1;
            if (conflicts.length > 0) rarityScore += conflicts.length;
            if (p.maxPrice && p.minPrice && (p.maxPrice - p.minPrice) < 500000 && c.clientType !== 'renter') rarityScore += 1;
            var rarityLabels = ['Common', 'Moderate', 'Rare', 'Very Rare'];
            var rarityColors = ['green', 'blue', 'amber', 'red'];
            var rarityIdx = Math.min(3, rarityScore);
            var rarityLabel = rarityLabels[rarityIdx];
            var rarityColor = rarityColors[rarityIdx];

            // Format helpers
            var isR = c.clientType === 'renter';
            var fmtP = function(v) { return isR ? '$' + Number(v).toLocaleString() + '/mo' : '$' + (Number(v) >= 1000000 ? (Number(v)/1000000).toFixed(1) + 'M' : Number(v).toLocaleString()); };
            var budgetText = '';
            if (p.minPrice || p.maxPrice) {
                if (p.minPrice && p.maxPrice) budgetText = fmtP(p.minPrice) + ' — ' + fmtP(p.maxPrice);
                else if (p.minPrice) budgetText = fmtP(p.minPrice) + '+';
                else budgetText = 'Up to ' + fmtP(p.maxPrice);
            }
            var bedsText = '';
            if (p.minBeds && p.maxBeds) bedsText = p.minBeds + '–' + p.maxBeds;
            else if (p.minBeds) bedsText = p.minBeds + '+';
            else if (p.maxBeds) bedsText = '≤' + p.maxBeds;
            var bathsText = '';
            if (p.minBaths && p.maxBaths) bathsText = p.minBaths + '–' + p.maxBaths;
            else if (p.minBaths) bathsText = p.minBaths + '+';

            var eb = ' onclick="quickEditPref(\'' + cid + '\')"';
            var pencil = '<i class="fas fa-pen text-[8px] text-gray-300 group-hover:text-blue-500 ml-1 cursor-pointer transition-colors"></i>';

            // ── HEADER ──
            var html = '<div class="flex items-center justify-between mb-1"><span class="text-[9px] text-gray-400 font-medium" data-compliance="Fair-Housing-RESO"><i class="fas fa-balance-scale mr-0.5"></i>Fair Housing Act · NYC Human Rights Law · RESO StandardFields</span></div>';
            html += '<div class="flex items-center justify-between mb-3">';
            html += '<h4 class="text-sm font-bold text-gray-700"><i class="fas fa-sliders-h text-blue-500 mr-2"></i>Preferences</h4>';
            html += '<div class="flex items-center gap-2">';
            html += '<span class="text-[10px] px-2 py-0.5 bg-' + scoreColor + '-50 text-' + scoreColor + '-700 rounded-full font-bold border border-' + scoreColor + '-200">' + score + '% complete</span>';
            html += '<button' + eb + ' class="text-xs px-2 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"><i class="fas fa-pen mr-1"></i>Edit</button>';
            html += '</div></div>';

            // ── KEY METRICS TILES — 2×2 grid ──
            html += '<div class="grid grid-cols-2 gap-2 mb-3">';
            // Budget tile
            html += '<div class="group bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-2.5 border border-green-100 cursor-pointer hover:border-green-300 hover:shadow-sm transition-all"' + eb + '>';
            html += '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold text-green-600 uppercase tracking-wide">Budget <span class="font-mono text-[7px] text-green-400 normal-case ml-0.5">ListPrice</span></span>' + pencil + '</div>';
            html += '<span class="text-sm font-bold text-gray-900">' + (budgetText || '<span class="text-gray-400 font-normal italic">Not set</span>') + '</span>';
            html += '</div>';
            // Size tile
            html += '<div class="group bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-2.5 border border-blue-100 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"' + eb + '>';
            html += '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">Size <span class="font-mono text-[7px] text-blue-400 normal-case ml-0.5">Beds · Baths</span></span>' + pencil + '</div>';
            if (bedsText || bathsText) {
                html += '<span class="text-sm font-bold text-gray-900">' + (bedsText ? bedsText + ' BR' : '') + (bedsText && bathsText ? ' <span class="text-gray-400">/</span> ' : '') + (bathsText ? bathsText + ' BA' : '') + '</span>';
            } else {
                html += '<span class="text-sm text-gray-400 italic">Not set</span>';
            }
            html += '</div>';
            // Move-in tile
            html += '<div class="group bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl p-2.5 border border-amber-100 cursor-pointer hover:border-amber-300 hover:shadow-sm transition-all"' + eb + '>';
            html += '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Move-in <span class="font-mono text-[7px] text-amber-400 normal-case ml-0.5">AvailabilityDate</span></span>' + pencil + '</div>';
            if (p.moveInDate) {
                var daysUntil = Math.round((new Date(p.moveInDate) - new Date()) / (1000*60*60*24));
                html += '<span class="text-sm font-bold text-gray-900">' + p.moveInDate + '</span>';
                if (daysUntil > 0) html += '<span class="block text-[10px] text-amber-600 mt-0.5">' + daysUntil + ' days away</span>';
            } else {
                html += '<span class="text-sm text-gray-400 italic">Not set</span>';
            }
            html += '</div>';
            // Rarity tile
            var rarityWidth = [25, 50, 75, 100][rarityIdx];
            html += '<div class="bg-gradient-to-br from-' + rarityColor + '-50 to-' + rarityColor + '-50/50 rounded-xl p-2.5 border border-' + rarityColor + '-100">';
            html += '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-semibold text-' + rarityColor + '-600 uppercase tracking-wide">Rarity</span>';
            html += '<span class="text-[10px] font-bold text-' + rarityColor + '-700">' + rarityLabel + '</span></div>';
            html += '<div class="w-full h-1.5 bg-' + rarityColor + '-100 rounded-full overflow-hidden"><div class="h-full bg-' + rarityColor + '-500 rounded-full transition-all" style="width:' + rarityWidth + '%"></div></div>';
            html += '</div>';
            html += '</div>';

            // ── PROPERTY TYPES — inline pills with edit ──
            html += '<div class="mb-3">';
            html += '<div class="flex items-center justify-between mb-1.5"><div class="flex items-center gap-1.5"><span class="text-[10px] font-semibold text-gray-500 uppercase tracking-wide"><i class="fas fa-building text-gray-400 mr-1"></i>Property Types</span><span class="text-[8px] text-gray-300 font-mono">PropertyType · CommonInterest · PropertySubType</span></div>';
            html += '<button' + eb + ' class="text-[10px] text-blue-600 hover:text-blue-800 font-medium">+ Edit</button></div>';
            if ((p.propertyTypes || []).length) {
                html += '<div class="flex flex-wrap gap-1.5">';
                p.propertyTypes.forEach(function(t) {
                    html += '<span class="text-xs px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg font-medium border border-blue-100">' + t + '</span>';
                });
                html += '</div>';
            } else {
                html += '<p class="text-xs text-gray-400 italic pl-0.5">No types selected</p>';
            }
            html += '</div>';

            // ── NEIGHBORHOODS — inline pills with edit ──
            html += '<div class="mb-3">';
            html += '<div class="flex items-center justify-between mb-1.5"><div class="flex items-center gap-1.5"><span class="text-[10px] font-semibold text-gray-500 uppercase tracking-wide"><i class="fas fa-map-marker-alt text-gray-400 mr-1"></i>Areas</span><span class="text-[8px] text-gray-300 font-mono">SubdivisionName · PostalCode · CityRegion</span></div>';
            html += '<button' + eb + ' class="text-[10px] text-blue-600 hover:text-blue-800 font-medium">+ Edit</button></div>';
            if ((p.neighborhoods || []).length) {
                html += '<div class="flex flex-wrap gap-1.5">';
                p.neighborhoods.forEach(function(n) {
                    html += '<span class="text-xs px-2.5 py-1 bg-purple-50 text-purple-700 rounded-lg font-medium border border-purple-100">' + n + '</span>';
                });
                html += '</div>';
            } else {
                html += '<p class="text-xs text-gray-400 italic pl-0.5">No areas selected</p>';
            }
            html += '</div>';

            // ── MUST-HAVES — inline pills with edit ──
            html += '<div class="mb-3">';
            html += '<div class="flex items-center justify-between mb-1.5"><div class="flex items-center gap-1.5"><span class="text-[10px] font-semibold text-gray-500 uppercase tracking-wide"><i class="fas fa-star text-gray-400 mr-1"></i>Features & Amenities</span><span class="text-[8px] text-gray-300 font-mono">InteriorFeatures · ExteriorFeatures · View</span></div>';
            html += '<button' + eb + ' class="text-[10px] text-blue-600 hover:text-blue-800 font-medium">+ Edit</button></div>';
            if ((p.mustHaves || []).length) {
                html += '<div class="flex flex-wrap gap-1.5">';
                p.mustHaves.forEach(function(m) {
                    html += '<span class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg font-medium border border-emerald-100">' + m + '<button onclick="event.stopPropagation();removePrefItem(\'' + cid + '\',\'mustHaves\',\'' + m.replace(/'/g, "\\'") + '\')" class="text-emerald-400 hover:text-red-500 transition-colors">&times;</button></span>';
                });
                html += '</div>';
            } else {
                html += '<p class="text-xs text-gray-400 italic pl-0.5">No must-haves set</p>';
            }
            html += '</div>';

            // ── NOTES ──
            if (p.notes) {
                html += '<div class="group mb-3 p-2.5 bg-amber-50/80 rounded-xl border border-amber-100 cursor-pointer hover:border-amber-200 transition-all"' + eb + '>';
                html += '<div class="flex items-start gap-2"><i class="fas fa-sticky-note text-amber-400 mt-0.5"></i>';
                html += '<p class="text-xs text-gray-700 flex-1 leading-relaxed">' + p.notes + '</p>';
                html += pencil + '</div></div>';
            } else {
                html += '<button' + eb + ' class="mb-3 w-full py-2 text-xs text-gray-400 hover:text-blue-600 border border-dashed border-gray-200 hover:border-blue-300 rounded-xl transition-all"><i class="fas fa-plus mr-1"></i>Add notes</button>';
            }

            // ── CONFLICT ALERTS ──
            if (conflicts.length > 0) {
                html += '<div class="mb-3 p-2.5 bg-orange-50 rounded-xl border border-orange-200">';
                html += '<p class="text-[10px] font-semibold text-orange-700 mb-1.5"><i class="fas fa-exclamation-triangle mr-1"></i>' + conflicts.length + ' Conflict' + (conflicts.length > 1 ? 's' : '') + ' Detected</p>';
                conflicts.forEach(function(cf) {
                    html += '<p class="text-[10px] text-orange-600 py-0.5"><i class="fas fa-angle-right text-orange-400 mr-1"></i>' + cf + '</p>';
                });
                html += '</div>';
            }

            // ── IMPROVE BUTTON ──
            if (rarityIdx >= 2 || conflicts.length > 0 || score < 60) {
                html += '<button onclick="showImproveSuggestions(\'' + cid + '\')" class="w-full px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 rounded-xl text-xs font-medium hover:from-blue-100 hover:to-indigo-100 border border-blue-200 transition-all"><i class="fas fa-magic mr-1.5"></i>Improve Requirements</button>';
            }

            card.innerHTML = html;
        }

        // Inline Edit Mode for Preferences
        function quickEditPref(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            if (!c.preferences) c.preferences = {};
            var p = c.preferences;
            var card = document.getElementById('wsPreferencesCard');
            if (!card) return;
            var isR = c.clientType === 'renter';
            var priceLabel = isR ? 'Rent' : 'Price';

            var html = '';
            // Header
            html += '<div class="flex items-center justify-between mb-4">';
            html += '<h4 class="text-sm font-bold text-gray-700"><i class="fas fa-sliders-h text-blue-500 mr-2"></i>Edit Preferences</h4>';
            html += '<div class="flex gap-2">';
            html += '<button onclick="savePrefEdits(\'' + clientId + '\')" class="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"><i class="fas fa-check mr-1"></i>Save</button>';
            html += '<button onclick="renderClientPreferences(customerDB[\'' + clientId + '\'])" class="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 font-medium">Cancel</button>';
            html += '</div></div>';

            // Budget row
            html += '<div class="mb-3">';
            html += '<div class="flex items-center justify-between mb-1"><label class="text-[10px] font-semibold text-gray-500 uppercase tracking-wide"><i class="fas fa-dollar-sign text-gray-400 mr-1"></i>Budget (' + priceLabel + ')</label><span class="text-[8px] text-gray-300 font-mono">ListPrice</span></div>';
            html += '<div class="grid grid-cols-2 gap-2">';
            html += '<div><span class="text-[10px] text-gray-400 block mb-0.5">Min</span><input type="text" id="prefEditMinPrice" value="' + (p.minPrice || '') + '" placeholder="' + (isR ? 'e.g. 5000' : 'e.g. 1000000') + '" class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"></div>';
            html += '<div><span class="text-[10px] text-gray-400 block mb-0.5">Max</span><input type="text" id="prefEditMaxPrice" value="' + (p.maxPrice || '') + '" placeholder="' + (isR ? 'e.g. 15000' : 'e.g. 5000000') + '" class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"></div>';
            html += '</div></div>';

            // Size row
            html += '<div class="mb-3">';
            html += '<div class="flex items-center justify-between mb-1"><label class="text-[10px] font-semibold text-gray-500 uppercase tracking-wide"><i class="fas fa-ruler-combined text-gray-400 mr-1"></i>Size</label><span class="text-[8px] text-gray-300 font-mono">BedroomsTotal · BathroomsTotalDecimal</span></div>';
            html += '<div class="grid grid-cols-2 gap-2">';
            html += '<div><span class="text-[10px] text-gray-400 block mb-0.5">Min Beds</span><input type="number" id="prefEditMinBeds" value="' + (p.minBeds || '') + '" min="0" max="20" placeholder="e.g. 2" class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"></div>';
            html += '<div><span class="text-[10px] text-gray-400 block mb-0.5">Min Baths</span><input type="number" id="prefEditMinBaths" value="' + (p.minBaths || '') + '" min="0" max="20" step="0.5" placeholder="e.g. 2" class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"></div>';
            html += '</div></div>';

            // Move-in
            html += '<div class="mb-3">';
            html += '<div class="flex items-center justify-between mb-1"><label class="text-[10px] font-semibold text-gray-500 uppercase tracking-wide"><i class="fas fa-calendar text-gray-400 mr-1"></i>Move-in Date</label><span class="text-[8px] text-gray-300 font-mono">AvailabilityDate</span></div>';
            html += '<input type="date" id="prefEditMoveIn" value="' + (p.moveInDate || '') + '" class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none">';
            html += '</div>';

            // ── Tag input builder (reusable) ──
            var buildTagSection = function(id, label, icon, color, currentVals, datalistId, suggestions, placeholder, resoField) {
                var s = '';
                s += '<div class="mb-3">';
                s += '<div class="flex items-center justify-between mb-1.5">';
                s += '<label class="text-[10px] font-semibold text-gray-500 uppercase tracking-wide"><i class="fas ' + icon + ' text-gray-400 mr-1"></i>' + label + '</label>';
                if (resoField) s += '<span class="text-[8px] text-gray-300 font-mono">' + resoField + '</span>';
                s += '</div>';
                s += '<div class="flex flex-wrap gap-1.5 mb-2" id="' + id + 'Tags">';
                currentVals.forEach(function(v) {
                    s += '<span data-tag="' + v.replace(/"/g, '&quot;') + '" class="inline-flex items-center gap-1 text-xs px-2 py-1 bg-' + color + '-100 text-' + color + '-700 rounded-lg font-medium border border-' + color + '-200">' + v + '<button type="button" onclick="prefRemoveTag(\'' + id + '\',this)" class="text-' + color + '-400 hover:text-red-500 ml-0.5 text-sm leading-none">&times;</button></span>';
                });
                s += '</div>';
                s += '<div class="flex gap-1.5">';
                s += '<input type="text" list="' + datalistId + '" id="' + id + 'Input" placeholder="' + (placeholder || 'Type to add...') + '" class="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-' + color + '-200 focus:border-' + color + '-400 outline-none" onkeydown="if(event.key===\'Enter\'){event.preventDefault();prefAddTag(\'' + id + '\',\'' + color + '\')}">';
                s += '<button type="button" onclick="prefAddTag(\'' + id + '\',\'' + color + '\')" class="px-3 py-1.5 bg-' + color + '-600 text-white rounded-lg text-xs font-medium hover:bg-' + color + '-700"><i class="fas fa-plus"></i></button>';
                s += '</div>';
                s += '<datalist id="' + datalistId + '">';
                suggestions.forEach(function(sg) { s += '<option value="' + sg + '">'; });
                s += '</datalist>';
                s += '</div>';
                return s;
            };

            // ── RLS/RESO/IDX: PropertyType + CommonInterest + PropertySubType ──
            // Values from REBNY RLS property-lookup.csv picklists
            html += buildTagSection('prefTypes', 'Property Type / Classification', 'fa-building', 'blue',
                p.propertyTypes || [], 'dlPrefTypes',
                ['Condominium', 'StockCooperative', 'Condop', 'RentalBuilding', 'Apartment', 'Loft', 'Duplex', 'Triplex', 'Quadruplex', 'SingleFamilyResidence', 'SingleFamilyTownhouse', 'MultiFamilyTownhouse', 'MultiFamily', 'MixedUse', 'GardenApartment', 'UnitDuplex', 'UnitTriplex', 'UnitQuadruplex', 'UnimprovedLand', 'DeededParking', 'Office', 'Retail', 'Timeshare', 'CommunityApartment', 'PlannedDevelopment'],
                'RESO type — e.g. Condominium, StockCooperative...',
                'PropertyType · CommonInterest · PropertySubType'
            );

            // ── RLS/RESO/IDX: SubdivisionName + PostalCode + PostalCity + CityRegion ──
            // Trestle/IDX location lookup — SubdivisionName is free-text, PostalCode/PostalCity from feed
            html += '<div class="mb-3">';
            html += '<div class="flex items-center justify-between mb-1.5">';
            html += '<label class="text-[10px] font-semibold text-gray-500 uppercase tracking-wide"><i class="fas fa-map-marker-alt text-gray-400 mr-1"></i>Location — Trestle/IDX Lookup</label>';
            html += '<span class="text-[8px] text-gray-300 font-mono">SubdivisionName · PostalCode · PostalCity</span>';
            html += '</div>';
            html += '<div class="flex flex-wrap gap-1.5 mb-2" id="prefAreasTags">';
            (p.neighborhoods || []).forEach(function(v) {
                html += '<span data-tag="' + v.replace(/"/g, '&quot;') + '" class="inline-flex items-center gap-1 text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-lg font-medium border border-purple-200">' + v + '<button type="button" onclick="prefRemoveTag(\'prefAreas\',this)" class="text-purple-400 hover:text-red-500 ml-0.5 text-sm leading-none">&times;</button></span>';
            });
            html += '</div>';
            html += '<div class="flex gap-1.5">';
            html += '<div class="relative flex-1">';
            html += '<input type="text" id="prefAreasInput" placeholder="Search by neighborhood, zip, or postal city..." class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none pl-8" oninput="trestleLocationSearch(this.value)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();prefAddTag(\'prefAreas\',\'purple\')}">';
            html += '<i class="fas fa-search text-gray-300 absolute left-2.5 top-1/2 -translate-y-1/2 text-xs"></i>';
            html += '<div id="trestleDropdown" class="hidden absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"></div>';
            html += '</div>';
            html += '<button type="button" onclick="prefAddTag(\'prefAreas\',\'purple\')" class="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700"><i class="fas fa-plus"></i></button>';
            html += '</div>';
            html += '<p class="text-[9px] text-gray-400 mt-1"><i class="fas fa-database mr-0.5"></i>Source: REBNY RLS via Trestle (CoreLogic) — CityRegion · SubdivisionName · PostalCode · PostalCity</p>';
            html += '</div>';

            // ── RLS/RESO/IDX: InteriorFeatures + ExteriorFeatures + View + LaundryFeatures + ParkingFeatures + AttendanceType + SecurityFeatures ──
            // All values from REBNY RLS property-lookup.csv
            html += buildTagSection('prefMust', 'Features & Amenities', 'fa-star', 'emerald',
                p.mustHaves || [], 'dlPrefMust',
                ['DoormanFullTime', 'DoormanPartTime', 'VideoDoormanFullTime', 'VideoDoormanPartTime', 'Balcony', 'Terrace', 'RoofDeck', 'Garden', 'PrivateYard', 'PrivateEntrance', 'Courtyard', 'BasketballCourt', 'TennisCourts', 'Storage', 'HighCeilings', 'BeamedCeilings', 'CathedralCeilings', 'HomeOffice', 'WalkInClosets', 'OpenFloorplan', 'EatInKitchen', 'KitchenIsland', 'GraniteCounters', 'StoneCounters', 'Sauna', 'SoakingTub', 'Bidet', 'Elevator', 'Dumbwaiter', 'WindowedBathroom', 'WindowedKitchen', 'SmartHome', 'SmartThermostat', 'WiredForSound', 'Hardwood', 'Marble', 'Parquet', 'InUnit', 'LaundryRoom', 'WasherDryerInstallAllowed', 'Washer', 'Dryer', 'WasherDryer', 'Dishwasher', 'WineCooler', 'WineRefrigerator', 'CentralAir', 'Ductless', 'Garage', 'Valet', 'Assigned', 'Covered', 'Underground', 'SecurityGuard', 'SecuritySystem', 'Cameras', 'KeyCardEntry', 'KeyFobEntry', 'Intercom', 'FireSprinklerSystem', 'City', 'River', 'Park', 'ParkGreenbelt', 'Skyline', 'Water', 'Bridges', 'Downtown', 'Panoramic', 'Bay', 'Beach', 'Marina', 'InGround', 'Indoor', 'Lap', 'Heated', 'Infinity'],
                'RESO feature — e.g. DoormanFullTime, Balcony, HighCeilings...',
                'InteriorFeatures · ExteriorFeatures · View · LaundryFeatures · ParkingFeatures · AttendanceType'
            );

            // Notes
            html += '<div class="mb-3">';
            html += '<label class="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1"><i class="fas fa-sticky-note text-gray-400 mr-1"></i>Notes</label>';
            html += '<textarea id="prefEditNotes" rows="2" placeholder="Client notes, style preferences, deal-breakers..." class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none resize-none">' + (p.notes || '') + '</textarea>';
            html += '</div>';

            // Bottom Save/Cancel
            html += '<div class="flex gap-2 pt-2 border-t">';
            html += '<button onclick="savePrefEdits(\'' + clientId + '\')" class="flex-1 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"><i class="fas fa-check mr-1"></i>Save Changes</button>';
            html += '<button onclick="renderClientPreferences(customerDB[\'' + clientId + '\'])" class="flex-1 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-200 transition-colors">Cancel</button>';
            html += '</div>';

            card.innerHTML = html;
        }

        // ── Tag input helpers (add/remove pills in edit mode) ──
        function prefAddTag(sectionId, color) {
            var input = document.getElementById(sectionId + 'Input');
            if (!input) return;
            var val = input.value.trim();
            if (!val) return;
            var container = document.getElementById(sectionId + 'Tags');
            if (!container) return;
            // Check for duplicates
            var existing = container.querySelectorAll('span[data-tag]');
            for (var i = 0; i < existing.length; i++) {
                if (existing[i].dataset.tag.toLowerCase() === val.toLowerCase()) {
                    input.value = '';
                    return;
                }
            }
            var pill = document.createElement('span');
            pill.className = 'inline-flex items-center gap-1 text-xs px-2 py-1 bg-' + color + '-100 text-' + color + '-700 rounded-lg font-medium border border-' + color + '-200';
            pill.dataset.tag = val;
            pill.innerHTML = escapeHtml(val) + '<button type="button" onclick="prefRemoveTag(\'' + sectionId + '\',this)" class="text-' + color + '-400 hover:text-red-500 ml-0.5 text-sm leading-none">&times;</button>';
            container.appendChild(pill);
            input.value = '';
            input.focus();
        }

        function prefRemoveTag(sectionId, btn) {
            var pill = btn.closest('span');
            if (pill) pill.remove();
        }

        // Read all tags from a tag container
        function prefReadTags(sectionId) {
            var container = document.getElementById(sectionId + 'Tags');
            if (!container) return [];
            var tags = [];
            container.querySelectorAll('span[data-tag]').forEach(function(el) {
                tags.push(el.dataset.tag);
            });
            return tags;
        }

        // Save inline preference edits
        function savePrefEdits(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            if (!c.preferences) c.preferences = {};
            var p = c.preferences;
            var changes = [];

            // Budget
            var minP = document.getElementById('prefEditMinPrice');
            var maxP = document.getElementById('prefEditMaxPrice');
            if (minP) {
                var v = parseInt((minP.value || '').replace(/[^0-9]/g, ''));
                if (p.minPrice !== (v || null)) changes.push('budget');
                p.minPrice = v || null;
            }
            if (maxP) {
                var v2 = parseInt((maxP.value || '').replace(/[^0-9]/g, ''));
                if (p.maxPrice !== (v2 || null)) changes.push('budget');
                p.maxPrice = v2 || null;
            }

            // Size
            var beds = document.getElementById('prefEditMinBeds');
            var baths = document.getElementById('prefEditMinBaths');
            if (beds) {
                var bv = beds.value ? parseInt(beds.value) : null;
                if (p.minBeds !== bv) changes.push('size');
                p.minBeds = bv;
            }
            if (baths) {
                var btv = baths.value ? parseFloat(baths.value) : null;
                if (p.minBaths !== btv) changes.push('size');
                p.minBaths = btv;
            }

            // Move-in
            var moveIn = document.getElementById('prefEditMoveIn');
            if (moveIn) {
                if (p.moveInDate !== (moveIn.value || null)) changes.push('moveIn');
                p.moveInDate = moveIn.value || null;
            }

            // Property Types — read from tag container
            var oldTypes = (p.propertyTypes || []).join(',');
            p.propertyTypes = prefReadTags('prefTypes');
            if (oldTypes !== p.propertyTypes.join(',')) changes.push('types');

            // Neighborhoods — read from tag container
            var oldAreas = (p.neighborhoods || []).join(',');
            p.neighborhoods = prefReadTags('prefAreas');
            if (oldAreas !== p.neighborhoods.join(',')) changes.push('areas');

            // Must-Haves — read from tag container
            var oldMust = (p.mustHaves || []).join(',');
            p.mustHaves = prefReadTags('prefMust');
            if (oldMust !== p.mustHaves.join(',')) {
                changes.push('mustHaves');
                if (!c.criteriaHistory) c.criteriaHistory = [];
                c.criteriaHistory.push({ date: new Date().toISOString().slice(0,10), field: 'mustHaves', oldVal: oldMust || '(none)', newVal: p.mustHaves.join(', ') || '(none)', changedBy: 'agent' });
            }

            // Notes
            var notes = document.getElementById('prefEditNotes');
            if (notes) {
                if (p.notes !== (notes.value || null)) changes.push('notes');
                p.notes = notes.value || null;
            }

            // Re-render and log
            renderClientPreferences(c);
            if (changes.length) {
                logClientActivity(clientId, 'action', 'Updated preferences: ' + changes.join(', '));
                showToast('Preferences saved — ' + changes.length + ' field' + (changes.length > 1 ? 's' : '') + ' updated', 'success');
            } else {
                showToast('No changes', 'info');
            }
        }

        // Remove a single item from a preference array (mustHaves, types, areas) — view mode
        function removePrefItem(clientId, field, value) {
            var c = customerDB[clientId];
            if (!c || !c.preferences) return;
            var arr = c.preferences[field];
            if (!Array.isArray(arr)) return;
            c.preferences[field] = arr.filter(function(v) { return v !== value; });
            renderClientPreferences(c);
            logClientActivity(clientId, 'action', 'Removed ' + value + ' from ' + field);
            showToast('Removed: ' + value, 'info');
        }

        // Show improvement suggestions
        function showImproveSuggestions(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            var p = c.preferences || {};
            var suggestions = [];
            if ((p.neighborhoods || []).length <= 2) suggestions.push('Expand neighborhoods — add 1-2 adjacent areas to increase inventory');
            if (p.maxPrice && p.minPrice) suggestions.push('Widen budget range by 10-15% to capture more listings');
            if ((p.mustHaves || []).length >= 3) suggestions.push('Move 1-2 must-haves to "nice-to-have" to reduce filtering');
            if ((p.propertyTypes || []).length === 1) suggestions.push('Consider additional property types (e.g., add Condop)');
            if (!p.moveInDate) suggestions.push('Set a target move-in date to prioritize available listings');

            if (!suggestions.length) suggestions.push('Requirements look good — no changes recommended');
            var msg = 'Suggestions to improve matching:\n\n' + suggestions.map(function(s, i) { return (i + 1) + '. ' + s; }).join('\n');
            showToast(msg, 'info');
        }

        // ══════════════════════════════════════════════════════
        // Trestle/IDX Location Search — RLS/RESO/IDX: SubdivisionName · PostalCode · PostalCity · CityRegion
        // Simulates Trestle API lookup for neighborhoods, zip codes, and postal cities
        // Source: REBNY RLS via Trestle (CoreLogic)
        // ══════════════════════════════════════════════════════
        var trestleLocationIndex = [
            // CityRegion (Borough level) — RLS/RESO/IDX: CityRegion
            { label: 'Manhattan', type: 'CityRegion', value: 'Manhattan' },
            { label: 'Brooklyn', type: 'CityRegion', value: 'Brooklyn' },
            { label: 'Queens', type: 'CityRegion', value: 'Queens' },
            { label: 'Bronx', type: 'CityRegion', value: 'Bronx' },
            { label: 'Staten Island', type: 'CityRegion', value: 'StatenIsland' },
            // Manhattan SubdivisionName — RLS/RESO/IDX: SubdivisionName
            { label: 'Battery Park City', type: 'SubdivisionName', value: 'Battery Park City', region: 'Manhattan' },
            { label: 'Chelsea', type: 'SubdivisionName', value: 'Chelsea', region: 'Manhattan' },
            { label: 'Chinatown', type: 'SubdivisionName', value: 'Chinatown', region: 'Manhattan' },
            { label: 'East Harlem', type: 'SubdivisionName', value: 'East Harlem', region: 'Manhattan' },
            { label: 'East Village', type: 'SubdivisionName', value: 'East Village', region: 'Manhattan' },
            { label: 'Financial District', type: 'SubdivisionName', value: 'Financial District', region: 'Manhattan' },
            { label: 'Flatiron', type: 'SubdivisionName', value: 'Flatiron', region: 'Manhattan' },
            { label: 'Gramercy Park', type: 'SubdivisionName', value: 'Gramercy Park', region: 'Manhattan' },
            { label: 'Greenwich Village', type: 'SubdivisionName', value: 'Greenwich Village', region: 'Manhattan' },
            { label: 'Hamilton Heights', type: 'SubdivisionName', value: 'Hamilton Heights', region: 'Manhattan' },
            { label: 'Harlem', type: 'SubdivisionName', value: 'Harlem', region: 'Manhattan' },
            { label: 'Hell\'s Kitchen', type: 'SubdivisionName', value: 'Hell\'s Kitchen', region: 'Manhattan' },
            { label: 'Hudson Yards', type: 'SubdivisionName', value: 'Hudson Yards', region: 'Manhattan' },
            { label: 'Inwood', type: 'SubdivisionName', value: 'Inwood', region: 'Manhattan' },
            { label: 'Kips Bay', type: 'SubdivisionName', value: 'Kips Bay', region: 'Manhattan' },
            { label: 'Lenox Hill', type: 'SubdivisionName', value: 'Lenox Hill', region: 'Manhattan' },
            { label: 'Lincoln Square', type: 'SubdivisionName', value: 'Lincoln Square', region: 'Manhattan' },
            { label: 'Little Italy', type: 'SubdivisionName', value: 'Little Italy', region: 'Manhattan' },
            { label: 'Lower East Side', type: 'SubdivisionName', value: 'Lower East Side', region: 'Manhattan' },
            { label: 'Marble Hill', type: 'SubdivisionName', value: 'Marble Hill', region: 'Manhattan' },
            { label: 'Midtown', type: 'SubdivisionName', value: 'Midtown', region: 'Manhattan' },
            { label: 'Midtown East', type: 'SubdivisionName', value: 'Midtown East', region: 'Manhattan' },
            { label: 'Midtown South', type: 'SubdivisionName', value: 'Midtown South', region: 'Manhattan' },
            { label: 'Midtown West', type: 'SubdivisionName', value: 'Midtown West', region: 'Manhattan' },
            { label: 'Morningside Heights', type: 'SubdivisionName', value: 'Morningside Heights', region: 'Manhattan' },
            { label: 'Murray Hill', type: 'SubdivisionName', value: 'Murray Hill', region: 'Manhattan' },
            { label: 'NoHo', type: 'SubdivisionName', value: 'NoHo', region: 'Manhattan' },
            { label: 'NoLita', type: 'SubdivisionName', value: 'NoLita', region: 'Manhattan' },
            { label: 'Roosevelt Island', type: 'SubdivisionName', value: 'Roosevelt Island', region: 'Manhattan' },
            { label: 'SoHo', type: 'SubdivisionName', value: 'SoHo', region: 'Manhattan' },
            { label: 'Stuyvesant Town', type: 'SubdivisionName', value: 'Stuyvesant Town', region: 'Manhattan' },
            { label: 'Sutton Place', type: 'SubdivisionName', value: 'Sutton Place', region: 'Manhattan' },
            { label: 'Tribeca', type: 'SubdivisionName', value: 'Tribeca', region: 'Manhattan' },
            { label: 'Tudor City', type: 'SubdivisionName', value: 'Tudor City', region: 'Manhattan' },
            { label: 'Turtle Bay', type: 'SubdivisionName', value: 'Turtle Bay', region: 'Manhattan' },
            { label: 'Upper East Side', type: 'SubdivisionName', value: 'Upper East Side', region: 'Manhattan' },
            { label: 'Upper West Side', type: 'SubdivisionName', value: 'Upper West Side', region: 'Manhattan' },
            { label: 'Washington Heights', type: 'SubdivisionName', value: 'Washington Heights', region: 'Manhattan' },
            { label: 'West Village', type: 'SubdivisionName', value: 'West Village', region: 'Manhattan' },
            { label: 'Yorkville', type: 'SubdivisionName', value: 'Yorkville', region: 'Manhattan' },
            // Brooklyn SubdivisionName
            { label: 'Bay Ridge', type: 'SubdivisionName', value: 'Bay Ridge', region: 'Brooklyn' },
            { label: 'Bedford-Stuyvesant', type: 'SubdivisionName', value: 'Bedford-Stuyvesant', region: 'Brooklyn' },
            { label: 'Bensonhurst', type: 'SubdivisionName', value: 'Bensonhurst', region: 'Brooklyn' },
            { label: 'Boerum Hill', type: 'SubdivisionName', value: 'Boerum Hill', region: 'Brooklyn' },
            { label: 'Borough Park', type: 'SubdivisionName', value: 'Borough Park', region: 'Brooklyn' },
            { label: 'Brooklyn Heights', type: 'SubdivisionName', value: 'Brooklyn Heights', region: 'Brooklyn' },
            { label: 'Brownsville', type: 'SubdivisionName', value: 'Brownsville', region: 'Brooklyn' },
            { label: 'Bushwick', type: 'SubdivisionName', value: 'Bushwick', region: 'Brooklyn' },
            { label: 'Canarsie', type: 'SubdivisionName', value: 'Canarsie', region: 'Brooklyn' },
            { label: 'Carroll Gardens', type: 'SubdivisionName', value: 'Carroll Gardens', region: 'Brooklyn' },
            { label: 'Clinton Hill', type: 'SubdivisionName', value: 'Clinton Hill', region: 'Brooklyn' },
            { label: 'Cobble Hill', type: 'SubdivisionName', value: 'Cobble Hill', region: 'Brooklyn' },
            { label: 'Coney Island', type: 'SubdivisionName', value: 'Coney Island', region: 'Brooklyn' },
            { label: 'Crown Heights', type: 'SubdivisionName', value: 'Crown Heights', region: 'Brooklyn' },
            { label: 'Ditmas Park', type: 'SubdivisionName', value: 'Ditmas Park', region: 'Brooklyn' },
            { label: 'Downtown Brooklyn', type: 'SubdivisionName', value: 'Downtown Brooklyn', region: 'Brooklyn' },
            { label: 'DUMBO', type: 'SubdivisionName', value: 'DUMBO', region: 'Brooklyn' },
            { label: 'Dyker Heights', type: 'SubdivisionName', value: 'Dyker Heights', region: 'Brooklyn' },
            { label: 'East Flatbush', type: 'SubdivisionName', value: 'East Flatbush', region: 'Brooklyn' },
            { label: 'East New York', type: 'SubdivisionName', value: 'East New York', region: 'Brooklyn' },
            { label: 'Flatbush', type: 'SubdivisionName', value: 'Flatbush', region: 'Brooklyn' },
            { label: 'Flatlands', type: 'SubdivisionName', value: 'Flatlands', region: 'Brooklyn' },
            { label: 'Fort Greene', type: 'SubdivisionName', value: 'Fort Greene', region: 'Brooklyn' },
            { label: 'Gowanus', type: 'SubdivisionName', value: 'Gowanus', region: 'Brooklyn' },
            { label: 'Gravesend', type: 'SubdivisionName', value: 'Gravesend', region: 'Brooklyn' },
            { label: 'Greenpoint', type: 'SubdivisionName', value: 'Greenpoint', region: 'Brooklyn' },
            { label: 'Kensington', type: 'SubdivisionName', value: 'Kensington', region: 'Brooklyn' },
            { label: 'Marine Park', type: 'SubdivisionName', value: 'Marine Park', region: 'Brooklyn' },
            { label: 'Midwood', type: 'SubdivisionName', value: 'Midwood', region: 'Brooklyn' },
            { label: 'Mill Basin', type: 'SubdivisionName', value: 'Mill Basin', region: 'Brooklyn' },
            { label: 'Park Slope', type: 'SubdivisionName', value: 'Park Slope', region: 'Brooklyn' },
            { label: 'Prospect Heights', type: 'SubdivisionName', value: 'Prospect Heights', region: 'Brooklyn' },
            { label: 'Prospect Lefferts Gardens', type: 'SubdivisionName', value: 'Prospect Lefferts Gardens', region: 'Brooklyn' },
            { label: 'Prospect Park South', type: 'SubdivisionName', value: 'Prospect Park South', region: 'Brooklyn' },
            { label: 'Red Hook', type: 'SubdivisionName', value: 'Red Hook', region: 'Brooklyn' },
            { label: 'Sheepshead Bay', type: 'SubdivisionName', value: 'Sheepshead Bay', region: 'Brooklyn' },
            { label: 'South Slope', type: 'SubdivisionName', value: 'South Slope', region: 'Brooklyn' },
            { label: 'Sunset Park', type: 'SubdivisionName', value: 'Sunset Park', region: 'Brooklyn' },
            { label: 'Vinegar Hill', type: 'SubdivisionName', value: 'Vinegar Hill', region: 'Brooklyn' },
            { label: 'Williamsburg', type: 'SubdivisionName', value: 'Williamsburg', region: 'Brooklyn' },
            { label: 'Windsor Terrace', type: 'SubdivisionName', value: 'Windsor Terrace', region: 'Brooklyn' },
            // Queens SubdivisionName
            { label: 'Astoria', type: 'SubdivisionName', value: 'Astoria', region: 'Queens' },
            { label: 'Bayside', type: 'SubdivisionName', value: 'Bayside', region: 'Queens' },
            { label: 'Elmhurst', type: 'SubdivisionName', value: 'Elmhurst', region: 'Queens' },
            { label: 'Flushing', type: 'SubdivisionName', value: 'Flushing', region: 'Queens' },
            { label: 'Forest Hills', type: 'SubdivisionName', value: 'Forest Hills', region: 'Queens' },
            { label: 'Jackson Heights', type: 'SubdivisionName', value: 'Jackson Heights', region: 'Queens' },
            { label: 'Jamaica', type: 'SubdivisionName', value: 'Jamaica', region: 'Queens' },
            { label: 'Jamaica Estates', type: 'SubdivisionName', value: 'Jamaica Estates', region: 'Queens' },
            { label: 'Kew Gardens', type: 'SubdivisionName', value: 'Kew Gardens', region: 'Queens' },
            { label: 'Long Island City', type: 'SubdivisionName', value: 'Long Island City', region: 'Queens' },
            { label: 'Maspeth', type: 'SubdivisionName', value: 'Maspeth', region: 'Queens' },
            { label: 'Middle Village', type: 'SubdivisionName', value: 'Middle Village', region: 'Queens' },
            { label: 'Ozone Park', type: 'SubdivisionName', value: 'Ozone Park', region: 'Queens' },
            { label: 'Rego Park', type: 'SubdivisionName', value: 'Rego Park', region: 'Queens' },
            { label: 'Ridgewood', type: 'SubdivisionName', value: 'Ridgewood', region: 'Queens' },
            { label: 'Rockaway', type: 'SubdivisionName', value: 'Rockaway', region: 'Queens' },
            { label: 'Sunnyside', type: 'SubdivisionName', value: 'Sunnyside', region: 'Queens' },
            { label: 'Woodside', type: 'SubdivisionName', value: 'Woodside', region: 'Queens' },
            // Bronx SubdivisionName
            { label: 'Belmont', type: 'SubdivisionName', value: 'Belmont', region: 'Bronx' },
            { label: 'City Island', type: 'SubdivisionName', value: 'City Island', region: 'Bronx' },
            { label: 'Concourse Village', type: 'SubdivisionName', value: 'Concourse Village', region: 'Bronx' },
            { label: 'Co-op City', type: 'SubdivisionName', value: 'Co-op City', region: 'Bronx' },
            { label: 'Fordham', type: 'SubdivisionName', value: 'Fordham', region: 'Bronx' },
            { label: 'Hunts Point', type: 'SubdivisionName', value: 'Hunts Point', region: 'Bronx' },
            { label: 'Kingsbridge', type: 'SubdivisionName', value: 'Kingsbridge', region: 'Bronx' },
            { label: 'Morris Park', type: 'SubdivisionName', value: 'Morris Park', region: 'Bronx' },
            { label: 'Mott Haven', type: 'SubdivisionName', value: 'Mott Haven', region: 'Bronx' },
            { label: 'Parkchester', type: 'SubdivisionName', value: 'Parkchester', region: 'Bronx' },
            { label: 'Pelham Bay', type: 'SubdivisionName', value: 'Pelham Bay', region: 'Bronx' },
            { label: 'Pelham Gardens', type: 'SubdivisionName', value: 'Pelham Gardens', region: 'Bronx' },
            { label: 'Riverdale', type: 'SubdivisionName', value: 'Riverdale', region: 'Bronx' },
            { label: 'South Bronx', type: 'SubdivisionName', value: 'South Bronx', region: 'Bronx' },
            { label: 'Throgs Neck', type: 'SubdivisionName', value: 'Throgs Neck', region: 'Bronx' },
            { label: 'Tremont', type: 'SubdivisionName', value: 'Tremont', region: 'Bronx' },
            { label: 'University Heights', type: 'SubdivisionName', value: 'University Heights', region: 'Bronx' },
            { label: 'Wakefield', type: 'SubdivisionName', value: 'Wakefield', region: 'Bronx' },
            { label: 'Woodlawn', type: 'SubdivisionName', value: 'Woodlawn', region: 'Bronx' },
            // Staten Island SubdivisionName
            { label: 'Great Kills', type: 'SubdivisionName', value: 'Great Kills', region: 'StatenIsland' },
            { label: 'New Dorp', type: 'SubdivisionName', value: 'New Dorp', region: 'StatenIsland' },
            { label: 'St. George', type: 'SubdivisionName', value: 'St. George', region: 'StatenIsland' },
            { label: 'Stapleton', type: 'SubdivisionName', value: 'Stapleton', region: 'StatenIsland' },
            { label: 'Todt Hill', type: 'SubdivisionName', value: 'Todt Hill', region: 'StatenIsland' },
            { label: 'Tottenville', type: 'SubdivisionName', value: 'Tottenville', region: 'StatenIsland' },
            // PostalCode — RLS/RESO/IDX: PostalCode (common NYC zips by borough)
            // Manhattan
            { label: '10001 — Chelsea', type: 'PostalCode', value: '10001', region: 'Manhattan' },
            { label: '10002 — Lower East Side', type: 'PostalCode', value: '10002', region: 'Manhattan' },
            { label: '10003 — East Village', type: 'PostalCode', value: '10003', region: 'Manhattan' },
            { label: '10004 — Financial District', type: 'PostalCode', value: '10004', region: 'Manhattan' },
            { label: '10005 — Financial District', type: 'PostalCode', value: '10005', region: 'Manhattan' },
            { label: '10006 — Financial District', type: 'PostalCode', value: '10006', region: 'Manhattan' },
            { label: '10007 — Tribeca/City Hall', type: 'PostalCode', value: '10007', region: 'Manhattan' },
            { label: '10009 — East Village', type: 'PostalCode', value: '10009', region: 'Manhattan' },
            { label: '10010 — Gramercy', type: 'PostalCode', value: '10010', region: 'Manhattan' },
            { label: '10011 — Chelsea', type: 'PostalCode', value: '10011', region: 'Manhattan' },
            { label: '10012 — SoHo/NoHo', type: 'PostalCode', value: '10012', region: 'Manhattan' },
            { label: '10013 — Tribeca/SoHo', type: 'PostalCode', value: '10013', region: 'Manhattan' },
            { label: '10014 — West Village', type: 'PostalCode', value: '10014', region: 'Manhattan' },
            { label: '10016 — Murray Hill', type: 'PostalCode', value: '10016', region: 'Manhattan' },
            { label: '10017 — Midtown East', type: 'PostalCode', value: '10017', region: 'Manhattan' },
            { label: '10018 — Midtown', type: 'PostalCode', value: '10018', region: 'Manhattan' },
            { label: '10019 — Midtown West', type: 'PostalCode', value: '10019', region: 'Manhattan' },
            { label: '10021 — Upper East Side', type: 'PostalCode', value: '10021', region: 'Manhattan' },
            { label: '10022 — Midtown East', type: 'PostalCode', value: '10022', region: 'Manhattan' },
            { label: '10023 — Upper West Side', type: 'PostalCode', value: '10023', region: 'Manhattan' },
            { label: '10024 — Upper West Side', type: 'PostalCode', value: '10024', region: 'Manhattan' },
            { label: '10025 — Upper West Side', type: 'PostalCode', value: '10025', region: 'Manhattan' },
            { label: '10026 — Harlem', type: 'PostalCode', value: '10026', region: 'Manhattan' },
            { label: '10027 — Harlem', type: 'PostalCode', value: '10027', region: 'Manhattan' },
            { label: '10028 — Upper East Side', type: 'PostalCode', value: '10028', region: 'Manhattan' },
            { label: '10029 — East Harlem', type: 'PostalCode', value: '10029', region: 'Manhattan' },
            { label: '10030 — Harlem', type: 'PostalCode', value: '10030', region: 'Manhattan' },
            { label: '10031 — Hamilton Heights', type: 'PostalCode', value: '10031', region: 'Manhattan' },
            { label: '10032 — Washington Heights', type: 'PostalCode', value: '10032', region: 'Manhattan' },
            { label: '10033 — Washington Heights', type: 'PostalCode', value: '10033', region: 'Manhattan' },
            { label: '10034 — Inwood', type: 'PostalCode', value: '10034', region: 'Manhattan' },
            { label: '10035 — East Harlem', type: 'PostalCode', value: '10035', region: 'Manhattan' },
            { label: '10036 — Midtown/Times Square', type: 'PostalCode', value: '10036', region: 'Manhattan' },
            { label: '10037 — Harlem', type: 'PostalCode', value: '10037', region: 'Manhattan' },
            { label: '10038 — Financial District', type: 'PostalCode', value: '10038', region: 'Manhattan' },
            { label: '10039 — Harlem', type: 'PostalCode', value: '10039', region: 'Manhattan' },
            { label: '10040 — Washington Heights', type: 'PostalCode', value: '10040', region: 'Manhattan' },
            { label: '10044 — Roosevelt Island', type: 'PostalCode', value: '10044', region: 'Manhattan' },
            { label: '10065 — Upper East Side', type: 'PostalCode', value: '10065', region: 'Manhattan' },
            { label: '10069 — Upper West Side', type: 'PostalCode', value: '10069', region: 'Manhattan' },
            { label: '10075 — Upper East Side', type: 'PostalCode', value: '10075', region: 'Manhattan' },
            { label: '10128 — Yorkville/UES', type: 'PostalCode', value: '10128', region: 'Manhattan' },
            { label: '10280 — Battery Park City', type: 'PostalCode', value: '10280', region: 'Manhattan' },
            { label: '10282 — Battery Park City', type: 'PostalCode', value: '10282', region: 'Manhattan' },
            // Brooklyn zips
            { label: '11201 — Brooklyn Heights/DUMBO', type: 'PostalCode', value: '11201', region: 'Brooklyn' },
            { label: '11205 — Fort Greene', type: 'PostalCode', value: '11205', region: 'Brooklyn' },
            { label: '11206 — Williamsburg', type: 'PostalCode', value: '11206', region: 'Brooklyn' },
            { label: '11211 — Williamsburg', type: 'PostalCode', value: '11211', region: 'Brooklyn' },
            { label: '11215 — Park Slope', type: 'PostalCode', value: '11215', region: 'Brooklyn' },
            { label: '11217 — Boerum Hill', type: 'PostalCode', value: '11217', region: 'Brooklyn' },
            { label: '11222 — Greenpoint', type: 'PostalCode', value: '11222', region: 'Brooklyn' },
            { label: '11225 — Crown Heights', type: 'PostalCode', value: '11225', region: 'Brooklyn' },
            { label: '11231 — Carroll Gardens/Red Hook', type: 'PostalCode', value: '11231', region: 'Brooklyn' },
            { label: '11238 — Prospect Heights', type: 'PostalCode', value: '11238', region: 'Brooklyn' },
            // Queens zips
            { label: '11101 — Long Island City', type: 'PostalCode', value: '11101', region: 'Queens' },
            { label: '11102 — Astoria', type: 'PostalCode', value: '11102', region: 'Queens' },
            { label: '11103 — Astoria', type: 'PostalCode', value: '11103', region: 'Queens' },
            { label: '11106 — Astoria', type: 'PostalCode', value: '11106', region: 'Queens' },
            { label: '11354 — Flushing', type: 'PostalCode', value: '11354', region: 'Queens' },
            { label: '11375 — Forest Hills', type: 'PostalCode', value: '11375', region: 'Queens' },
            // Bronx zips
            { label: '10451 — Mott Haven', type: 'PostalCode', value: '10451', region: 'Bronx' },
            { label: '10463 — Kingsbridge/Riverdale', type: 'PostalCode', value: '10463', region: 'Bronx' },
            { label: '10471 — Riverdale', type: 'PostalCode', value: '10471', region: 'Bronx' },
            { label: '10475 — Co-op City', type: 'PostalCode', value: '10475', region: 'Bronx' },
            // Staten Island zips
            { label: '10301 — St. George', type: 'PostalCode', value: '10301', region: 'StatenIsland' },
            { label: '10304 — Stapleton', type: 'PostalCode', value: '10304', region: 'StatenIsland' },
            { label: '10308 — Great Kills', type: 'PostalCode', value: '10308', region: 'StatenIsland' },
            { label: '10314 — New Springville', type: 'PostalCode', value: '10314', region: 'StatenIsland' }
        ];

        var trestleSearchTimeout = null;
        function trestleLocationSearch(query) {
            clearTimeout(trestleSearchTimeout);
            var dropdown = document.getElementById('trestleDropdown');
            if (!dropdown) return;
            if (!query || query.length < 2) {
                dropdown.classList.add('hidden');
                dropdown.innerHTML = '';
                return;
            }
            // Debounce 150ms to simulate API latency
            trestleSearchTimeout = setTimeout(function() {
                var q = query.toLowerCase().trim();
                var results = trestleLocationIndex.filter(function(loc) {
                    return loc.label.toLowerCase().indexOf(q) !== -1 || loc.value.toLowerCase().indexOf(q) !== -1;
                });
                if (!results.length) {
                    dropdown.innerHTML = '<div class="px-3 py-2 text-xs text-gray-400 italic">No matching locations in RLS feed</div>';
                    dropdown.classList.remove('hidden');
                    return;
                }
                // Group by type for display
                var grouped = { CityRegion: [], SubdivisionName: [], PostalCode: [] };
                results.forEach(function(r) {
                    if (grouped[r.type]) grouped[r.type].push(r);
                });
                var html = '';
                // Limit to top 15 results
                var count = 0;
                var maxResults = 15;
                if (grouped.CityRegion.length && count < maxResults) {
                    html += '<div class="px-3 py-1 bg-gray-50 border-b"><span class="text-[9px] font-semibold text-gray-400 uppercase">CityRegion (Borough)</span></div>';
                    grouped.CityRegion.forEach(function(r) {
                        if (count >= maxResults) return;
                        html += '<div class="px-3 py-1.5 hover:bg-purple-50 cursor-pointer text-sm text-gray-700 flex items-center gap-2 border-b border-gray-50" onclick="trestleSelectLocation(\'' + r.value.replace(/'/g, "\\'") + '\',\'' + r.type + '\')">';
                        html += '<i class="fas fa-globe text-purple-400 text-[10px] w-4"></i>' + r.label;
                        html += '</div>';
                        count++;
                    });
                }
                if (grouped.SubdivisionName.length && count < maxResults) {
                    html += '<div class="px-3 py-1 bg-gray-50 border-b"><span class="text-[9px] font-semibold text-gray-400 uppercase">SubdivisionName (Neighborhood)</span></div>';
                    grouped.SubdivisionName.forEach(function(r) {
                        if (count >= maxResults) return;
                        html += '<div class="px-3 py-1.5 hover:bg-purple-50 cursor-pointer text-sm text-gray-700 flex items-center gap-2 border-b border-gray-50" onclick="trestleSelectLocation(\'' + r.value.replace(/'/g, "\\'") + '\',\'' + r.type + '\')">';
                        html += '<i class="fas fa-map-marker-alt text-purple-400 text-[10px] w-4"></i>' + r.label;
                        if (r.region) html += '<span class="text-[10px] text-gray-400 ml-auto">' + r.region + '</span>';
                        html += '</div>';
                        count++;
                    });
                }
                if (grouped.PostalCode.length && count < maxResults) {
                    html += '<div class="px-3 py-1 bg-gray-50 border-b"><span class="text-[9px] font-semibold text-gray-400 uppercase">PostalCode (Zip)</span></div>';
                    grouped.PostalCode.forEach(function(r) {
                        if (count >= maxResults) return;
                        html += '<div class="px-3 py-1.5 hover:bg-purple-50 cursor-pointer text-sm text-gray-700 flex items-center gap-2 border-b border-gray-50" onclick="trestleSelectLocation(\'' + r.value.replace(/'/g, "\\'") + '\',\'' + r.type + '\')">';
                        html += '<i class="fas fa-hashtag text-purple-400 text-[10px] w-4"></i>' + r.label;
                        if (r.region) html += '<span class="text-[10px] text-gray-400 ml-auto">' + r.region + '</span>';
                        html += '</div>';
                        count++;
                    });
                }
                html += '<div class="px-3 py-1 bg-gray-50 border-t"><span class="text-[9px] text-gray-300"><i class="fas fa-database mr-0.5"></i>REBNY RLS via Trestle</span></div>';
                dropdown.innerHTML = html;
                dropdown.classList.remove('hidden');
            }, 150);
        }

        function trestleSelectLocation(value, type) {
            // Add as tag in prefAreas
            var input = document.getElementById('prefAreasInput');
            if (input) input.value = value;
            prefAddTag('prefAreas', 'purple');
            // Close dropdown
            var dropdown = document.getElementById('trestleDropdown');
            if (dropdown) {
                dropdown.classList.add('hidden');
                dropdown.innerHTML = '';
            }
        }

        // Close trestle dropdown on click outside
        document.addEventListener('click', function(e) {
            var dropdown = document.getElementById('trestleDropdown');
            if (dropdown && !dropdown.contains(e.target) && e.target.id !== 'prefAreasInput') {
                dropdown.classList.add('hidden');
            }
        });

        function renderClientCoViewers(c) {
            var card = document.getElementById('wsCoViewersCard');
            var viewers = c.coViewers || [];
            var clientId = currentWorkspaceClientId;
            var html = '<div class="flex items-center justify-between mb-3"><h4 class="text-sm font-bold text-gray-700"><i class="fas fa-users text-blue-500 mr-2"></i>Co-Viewers <span class="text-xs font-normal text-gray-400">(' + viewers.length + ')</span></h4>';
            html += '<button onclick="openAddClientModal(\'' + clientId + '\')" class="text-xs text-blue-600 hover:text-blue-800">+ Add</button></div>';
            if (!viewers.length) {
                html += '<p class="text-xs text-gray-400 text-center py-2">No co-viewers added</p>';
            } else {
                var permLabels = { VIEW_ONLY: 'View Only', COMMENT: 'Can Comment', REQUEST_SHOWING: 'Can Request Showings' };
                var permColors = { VIEW_ONLY: 'gray', COMMENT: 'blue', REQUEST_SHOWING: 'purple' };
                viewers.forEach(function(cv, idx) {
                    var perm = cv.permission || 'VIEW_ONLY';
                    var pc = permColors[perm] || 'gray';
                    // Mock activity indicator
                    var cvLastActive = cv.lastActive || '';
                    var cvActiveDays = cvLastActive ? Math.round((new Date() - new Date(cvLastActive)) / (1000 * 60 * 60 * 24)) : -1;
                    var activityDot = cvActiveDays >= 0 && cvActiveDays <= 2 ? 'bg-green-500' : cvActiveDays >= 0 && cvActiveDays <= 7 ? 'bg-amber-500' : 'bg-gray-300';

                    html += '<div class="py-2 border-t">';
                    html += '<div class="flex items-center gap-2">';
                    html += '<div class="relative flex-shrink-0"><div class="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 text-xs font-bold">' + cv.name.split(' ').map(function(n){return n[0];}).join('').substring(0,2) + '</div>';
                    html += '<span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ' + activityDot + '" title="' + (cvActiveDays >= 0 ? cvActiveDays + 'd ago' : 'No activity') + '"></span></div>';
                    html += '<div class="flex-1 min-w-0">';
                    html += '<p class="text-sm font-medium text-gray-800 truncate">' + cv.name + '</p>';
                    html += '<p class="text-xs text-gray-500">' + cv.relation + (cv.email ? ' &bull; ' + cv.email : '') + '</p>';
                    if (cvActiveDays >= 0) html += '<p class="text-[10px] text-gray-400">Active ' + (cvActiveDays === 0 ? 'today' : cvActiveDays + 'd ago') + '</p>';
                    html += '</div>';
                    html += '<div class="flex gap-1 flex-shrink-0">';
                    html += '<button onclick="resendCoViewerInvite(\'' + clientId + '\',' + idx + ')" class="p-1 rounded hover:bg-blue-50 text-blue-500" title="Resend invite"><i class="fas fa-redo text-[10px]"></i></button>';
                    html += '<button onclick="removeCoViewer(\'' + clientId + '\',' + idx + ')" class="p-1 rounded hover:bg-red-50 text-red-400" title="Remove"><i class="fas fa-times text-[10px]"></i></button>';
                    html += '</div></div>';

                    // Permission toggles (Point 10)
                    html += '<div class="flex flex-wrap gap-1 mt-1.5 ml-10">';
                    html += '<button onclick="setCoViewerPermission(\'' + clientId + '\',' + idx + ',\'VIEW_ONLY\')" class="text-[9px] px-2 py-0.5 rounded-full font-medium transition-colors ' + (perm === 'VIEW_ONLY' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200') + '"><i class="fas fa-eye mr-0.5"></i>View only</button>';
                    html += '<button onclick="setCoViewerPermission(\'' + clientId + '\',' + idx + ',\'COMMENT\')" class="text-[9px] px-2 py-0.5 rounded-full font-medium transition-colors ' + (perm === 'COMMENT' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100') + '"><i class="fas fa-comment mr-0.5"></i>Can comment</button>';
                    html += '<button onclick="setCoViewerPermission(\'' + clientId + '\',' + idx + ',\'REQUEST_SHOWING\')" class="text-[9px] px-2 py-0.5 rounded-full font-medium transition-colors ' + (perm === 'REQUEST_SHOWING' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-600 hover:bg-purple-100') + '"><i class="fas fa-calendar mr-0.5"></i>Can request showings</button>';
                    html += '</div></div>';
                });
            }
            card.innerHTML = html;
        }

        function setCoViewerPermission(clientId, idx, permission) {
            var c = customerDB[clientId];
            if (!c || !c.coViewers || !c.coViewers[idx]) return;
            c.coViewers[idx].permission = permission;
            var permLabels = { VIEW_ONLY: 'View Only', COMMENT: 'Can Comment', REQUEST_SHOWING: 'Can Request Showings' };
            logClientActivity(clientId, 'action', 'Updated co-viewer ' + c.coViewers[idx].name + ' permission to: ' + (permLabels[permission] || permission));
            renderClientCoViewers(c);
            showToast('Permission updated', 'success');
        }

        function resendCoViewerInvite(clientId, idx) {
            var c = customerDB[clientId];
            if (!c || !c.coViewers || !c.coViewers[idx]) return;
            var cv = c.coViewers[idx];
            logClientActivity(clientId, 'action', 'Resent portal invite to co-viewer: ' + cv.name + (cv.email ? ' (' + cv.email + ')' : ''));
            showToast('Invite resent to ' + cv.name, 'success');
        }

        function removeCoViewer(clientId, idx) {
            var c = customerDB[clientId];
            if (!c || !c.coViewers || !c.coViewers[idx]) return;
            var name = c.coViewers[idx].name;
            if (!confirm('Remove co-viewer "' + name + '"?')) return;
            c.coViewers.splice(idx, 1);
            logClientActivity(clientId, 'action', 'Removed co-viewer: ' + name);
            renderClientCoViewers(c);
            showToast('Co-viewer removed', 'info');
        }

        function renderClientAlertSettings(c) {
            var card = document.getElementById('wsDeliveryCard');
            var a = c.alertSettings || {};
            var clientId = currentWorkspaceClientId;
            var queuedCount = (c.matchedListings || []).filter(function(x) { return x.status === 'queued'; }).length;
            var newListings = (c.matchedListings || []).filter(function(x) { return x.status === 'queued' && x.type === 'new_listing'; }).length;
            var priceChanges = (c.matchedListings || []).filter(function(x) { return x.status === 'queued' && x.type === 'price_change'; }).length;
            var checkLabels = { '5min': 'Every 5 min', '4xday': '4x/day' };
            var freqLabels = { realtime: 'Real Time', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

            var html = '';

            // Header with toggle + Run Now
            html += '<div class="flex items-center justify-between mb-2">';
            html += '<div class="flex items-center gap-2">';
            html += '<h4 class="text-sm font-bold text-gray-700"><i class="fas fa-radar text-blue-500 mr-1.5"></i>Match & Delivery</h4>';
            html += '<span class="text-[9px] px-1.5 py-0.5 bg-gray-900 text-blue-300 rounded font-medium"><i class="fas fa-shield-alt mr-0.5"></i>No-VOW</span>';
            html += '</div>';
            html += '<button onclick="toggleClientAlerts(\'' + clientId + '\')" class="relative w-9 h-[18px] rounded-full transition-colors ' + (a.enabled ? 'bg-blue-600' : 'bg-gray-300') + '">';
            html += '<span class="absolute top-[2px] ' + (a.enabled ? 'left-[18px]' : 'left-[2px]') + ' w-[14px] h-[14px] bg-white rounded-full shadow transition-all"></span></button>';
            html += '</div>';

            // Queued summary (if any)
            if (queuedCount > 0) {
                html += '<div class="p-2 bg-blue-50 rounded-lg mb-2 flex items-center justify-between">';
                html += '<div class="flex items-center gap-2 text-xs text-blue-700">';
                html += '<i class="fas fa-inbox"></i>';
                html += '<span><strong>' + queuedCount + '</strong> queued';
                if (newListings) html += ' · ' + newListings + ' new';
                if (priceChanges) html += ' · ' + priceChanges + ' price drop' + (priceChanges > 1 ? 's' : '');
                html += '</span></div>';
                html += '<button onclick="switchWsContentTab(\'alerts\')" class="text-[10px] px-2 py-0.5 bg-blue-600 text-white rounded font-medium hover:bg-blue-700">Review</button>';
                html += '</div>';
            }

            // Unified settings grid (compact)
            html += '<div class="grid grid-cols-2 gap-1.5 text-[10px] mb-2">';
            html += '<div class="flex items-center justify-between bg-gray-50 rounded px-2 py-1"><span class="text-gray-500"><i class="fas fa-sync-alt text-blue-400 mr-1"></i>Scan</span><span class="font-medium text-gray-700">' + (checkLabels[a.checkFreq] || '5 min') + '</span></div>';
            html += '<div class="flex items-center justify-between bg-gray-50 rounded px-2 py-1"><span class="text-gray-500"><i class="fas fa-tag text-green-400 mr-1"></i>Price</span><span class="font-medium ' + (a.priceAlerts ? 'text-green-700' : 'text-gray-400') + '">' + (a.priceAlerts ? 'On' : 'Off') + '</span></div>';
            html += '<div class="flex items-center justify-between bg-gray-50 rounded px-2 py-1"><span class="text-gray-500"><i class="fas fa-user-tie text-amber-400 mr-1"></i>Agent</span><span class="font-medium text-gray-700">' + (freqLabels[a.agentFreq] || 'Monthly') + '</span></div>';
            html += '<div class="flex items-center justify-between bg-gray-50 rounded px-2 py-1"><span class="text-gray-500"><i class="fas fa-clock text-purple-400 mr-1"></i>Next</span><span class="font-medium text-gray-700">' + (c.nextDelivery || 'N/A') + '</span></div>';
            html += '</div>';

            // Workflow + last scan
            html += '<div class="flex items-center gap-1 text-[8px] text-gray-400 mb-2">';
            html += '<span class="px-1 py-0.5 bg-blue-50 text-blue-700 rounded font-medium">Scan</span><i class="fas fa-arrow-right text-[6px]"></i>';
            html += '<span class="px-1 py-0.5 bg-amber-50 text-amber-700 rounded font-medium">Queue</span><i class="fas fa-arrow-right text-[6px]"></i>';
            html += '<span class="px-1 py-0.5 bg-indigo-50 text-indigo-700 rounded font-medium">Collection</span><i class="fas fa-arrow-right text-[6px]"></i>';
            html += '<span class="px-1 py-0.5 bg-emerald-50 text-emerald-700 rounded font-medium">Send</span>';
            if (c.lastDelivery) html += '<span class="ml-auto text-gray-400">Last: ' + c.lastDelivery + '</span>';
            html += '</div>';

            // Run Now button
            html += '<button onclick="scanForNewMatches(\'' + clientId + '\')" class="w-full px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"><i class="fas fa-play mr-1.5"></i>Run Now</button>';
            card.innerHTML = html;
        }

        function toggleClientAlerts(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            c.alertSettings.enabled = !c.alertSettings.enabled;
            renderClientAlertSettings(c);
            logClientActivity(clientId, 'alert', 'Alerts ' + (c.alertSettings.enabled ? 'enabled' : 'disabled'));
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // CLIENT WORKSPACE — Column 2: Searches & Showings
        // ═══════════════════════════════════════════════════════════════════════════════

        function renderClientSearches(c) {
            var card = document.getElementById('wsSavedSearches');
            var searches = c.savedSearches || [];
            var cid = currentWorkspaceClientId;

            // Header bar
            var html = '<div class="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">';
            html += '<div class="flex items-center gap-3">';
            html += '<h4 class="text-sm font-semibold text-gray-700"><i class="fas fa-search text-blue-500 mr-2"></i>Saved Searches</h4>';
            html += '<span class="text-xs text-gray-400">' + searches.length + ' saved</span>';
            html += '</div>';
            html += '<div class="flex gap-2">';
            html += '<button onclick="openSearchEditor(null)" class="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"><i class="fas fa-plus mr-1"></i>New Search</button>';
            html += '<button onclick="saveSearchForClient(\'' + cid + '\')" class="text-xs px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-100 font-medium">Save Current</button>';
            html += '</div></div>';

            // Compliance badge
            html += '<div class="px-5 pt-3"><span class="text-[9px] text-gray-400 font-medium" data-compliance="UCBA-IDX-VOW"><i class="fas fa-shield-alt mr-0.5"></i>UCBA §3.1 · IDX/VOW Search · REBNY RLS Distribution Gates Applied</span></div>';

            // Search list
            html += '<div class="p-5">';
            if (!searches.length) {
                html += '<div class="text-center py-10">';
                html += '<i class="fas fa-search text-gray-200 text-3xl mb-3 block"></i>';
                html += '<p class="text-sm text-gray-500 mb-1">No saved searches for this client</p>';
                html += '<p class="text-xs text-gray-400 mb-4">Create a search with their criteria to get started</p>';
                html += '<button onclick="openSearchEditor(null)" class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium"><i class="fas fa-plus mr-1.5"></i>Create First Search</button>';
                html += '</div>';
            } else {
                html += '<div class="space-y-3">';
                searches.forEach(function(s) {
                    var criteriaText = [];
                    if (s.criteria) {
                        if (s.criteria.beds) criteriaText.push(s.criteria.beds + ' BR');
                        if (s.criteria.baths) criteriaText.push(s.criteria.baths + '+ BA');
                        if (s.criteria.neighborhoods) criteriaText.push(s.criteria.neighborhoods.join(', '));
                        if (s.criteria.propertyType) criteriaText.push(s.criteria.propertyType);
                        if (s.criteria.minPrice) criteriaText.push('$' + (s.criteria.minPrice >= 1000000 ? (s.criteria.minPrice/1000000).toFixed(1) + 'M' : Number(s.criteria.minPrice).toLocaleString()));
                        if (s.criteria.maxPrice) criteriaText.push('– $' + (s.criteria.maxPrice >= 1000000 ? (s.criteria.maxPrice/1000000).toFixed(1) + 'M' : Number(s.criteria.maxPrice).toLocaleString()));
                    }
                    var daysSinceRun = s.lastRun ? Math.max(0, Math.round((new Date() - new Date(s.lastRun)) / (1000 * 60 * 60 * 24))) : 999;
                    var staleColor = daysSinceRun > 7 ? 'red' : daysSinceRun > 3 ? 'amber' : 'green';
                    var alertLabel = s.alertFrequency || 'daily';

                    html += '<div class="p-4 bg-gray-50 rounded-lg border border-gray-100 hover:border-gray-200 transition-all">';
                    // Row 1: Name + result count + alert badge
                    html += '<div class="flex items-center justify-between mb-2">';
                    html += '<div class="flex items-center gap-2">';
                    html += '<span class="text-sm font-semibold text-gray-900">' + s.name + '</span>';
                    html += '<span class="text-[10px] px-2 py-0.5 bg-' + staleColor + '-50 text-' + staleColor + '-700 rounded-full font-medium">' + (daysSinceRun === 0 ? 'Today' : daysSinceRun === 999 ? 'Never run' : daysSinceRun + 'd ago') + '</span>';
                    html += '</div>';
                    html += '<div class="flex items-center gap-2 text-xs text-gray-400">';
                    html += '<span><i class="fas fa-bell mr-0.5"></i>' + alertLabel.charAt(0).toUpperCase() + alertLabel.slice(1) + '</span>';
                    html += '<span>' + (s.resultCount || 0) + ' results</span>';
                    html += '</div></div>';
                    // Row 2: Criteria pills
                    if (criteriaText.length) {
                        html += '<div class="flex flex-wrap gap-1.5 mb-3">';
                        criteriaText.forEach(function(ct) {
                            html += '<span class="text-[11px] px-2 py-0.5 bg-white border border-gray-200 text-gray-600 rounded-full">' + ct + '</span>';
                        });
                        html += '</div>';
                    }
                    // Row 3: Actions
                    html += '<div class="flex items-center gap-2">';
                    html += '<button onclick="runClientSearch(\'' + cid + '\',\'' + s.id + '\')" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"><i class="fas fa-play mr-1"></i>Run Search</button>';
                    html += '<button onclick="openSearchEditor(\'' + s.id + '\')" class="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-white hover:border-gray-300"><i class="fas fa-pen mr-1"></i>Edit</button>';
                    html += '<button onclick="shareClientSearch(\'' + cid + '\',\'' + s.id + '\')" class="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-white hover:border-gray-300"><i class="fas fa-share mr-1"></i>Share</button>';
                    html += '<button onclick="duplicateClientSearch(\'' + cid + '\',\'' + s.id + '\')" class="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-white hover:border-gray-300"><i class="fas fa-copy mr-1"></i>Duplicate</button>';
                    html += '<button onclick="deleteClientSearch(\'' + cid + '\',\'' + s.id + '\')" class="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 hover:border-red-200 ml-auto"><i class="fas fa-trash mr-1"></i>Delete</button>';
                    html += '</div></div>';
                });
                html += '</div>';
            }
            html += '</div>';
            card.innerHTML = html;
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // SEARCH EDITOR — Edit / Create saved searches inline
        // ═══════════════════════════════════════════════════════════════════════════════

        function openSearchEditor(searchId) {
            var editor = document.getElementById('wsSearchEditor');
            if (!editor) return;
            editor.classList.remove('hidden');

            var c = customerDB[currentWorkspaceClientId];
            if (!c) return;

            if (searchId) {
                // Editing existing search
                var s = (c.savedSearches || []).find(function(x) { return x.id === searchId; });
                if (!s) return;
                document.getElementById('wsEditSearchId').value = searchId;
                document.getElementById('wsEditSearchName').value = s.name || '';
                document.getElementById('wsEditNeighborhoods').value = (s.criteria && s.criteria.neighborhoods) ? s.criteria.neighborhoods.join(', ') : '';
                document.getElementById('wsEditBeds').value = (s.criteria && s.criteria.beds) || '';
                document.getElementById('wsEditBaths').value = (s.criteria && s.criteria.baths) || '';
                document.getElementById('wsEditMinPrice').value = (s.criteria && s.criteria.minPrice) || '';
                document.getElementById('wsEditMaxPrice').value = (s.criteria && s.criteria.maxPrice) || '';
                document.getElementById('wsEditPropertyType').value = (s.criteria && s.criteria.propertyType) || '';
                document.getElementById('wsEditAlertFreq').value = s.alertFrequency || 'daily';
            } else {
                // New search
                document.getElementById('wsEditSearchId').value = '';
                document.getElementById('wsEditSearchName').value = '';
                document.getElementById('wsEditNeighborhoods').value = '';
                document.getElementById('wsEditBeds').value = '';
                document.getElementById('wsEditBaths').value = '';
                document.getElementById('wsEditMinPrice').value = '';
                document.getElementById('wsEditMaxPrice').value = '';
                document.getElementById('wsEditPropertyType').value = '';
                document.getElementById('wsEditAlertFreq').value = 'daily';
            }
            editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        function closeSearchEditor() {
            var editor = document.getElementById('wsSearchEditor');
            if (editor) editor.classList.add('hidden');
        }

        function saveSearchEdits() {
            var c = customerDB[currentWorkspaceClientId];
            if (!c) return;
            if (!c.savedSearches) c.savedSearches = [];

            var searchId = document.getElementById('wsEditSearchId').value;
            var name = document.getElementById('wsEditSearchName').value.trim();
            if (!name) { showToast('Please enter a search name.', 'warning'); return; }

            var neighborhoods = document.getElementById('wsEditNeighborhoods').value.trim();
            var criteria = {
                beds: document.getElementById('wsEditBeds').value || '',
                baths: document.getElementById('wsEditBaths').value || '',
                neighborhoods: neighborhoods ? neighborhoods.split(',').map(function(n) { return n.trim(); }) : [],
                minPrice: document.getElementById('wsEditMinPrice').value.replace(/[^0-9]/g, '') || '',
                maxPrice: document.getElementById('wsEditMaxPrice').value.replace(/[^0-9]/g, '') || '',
                propertyType: document.getElementById('wsEditPropertyType').value || ''
            };
            var alertFrequency = document.getElementById('wsEditAlertFreq').value;

            if (searchId) {
                // Update existing
                var s = c.savedSearches.find(function(x) { return x.id === searchId; });
                if (s) {
                    s.name = name;
                    s.criteria = criteria;
                    s.alertFrequency = alertFrequency;
                    logClientActivity(currentWorkspaceClientId, 'search', 'Updated search: ' + name);
                    showToast('Search "' + name + '" updated', 'success');
                }
            } else {
                // Create new
                c.savedSearches.push({
                    id: 'cs-' + Date.now(),
                    name: name,
                    criteria: criteria,
                    alertFrequency: alertFrequency,
                    dateCreated: new Date().toISOString().slice(0, 10),
                    lastRun: null,
                    resultCount: 0
                });
                logClientActivity(currentWorkspaceClientId, 'search', 'Created search: ' + name);
                showToast('Search "' + name + '" created for ' + c.name, 'success');
            }

            closeSearchEditor();
            renderClientSearches(c);
        }

        function duplicateClientSearch(clientId, searchId) {
            var c = customerDB[clientId];
            if (!c) return;
            var s = (c.savedSearches || []).find(function(x) { return x.id === searchId; });
            if (!s) return;
            var copy = JSON.parse(JSON.stringify(s));
            copy.id = 'cs-' + Date.now();
            copy.name = s.name + ' (copy)';
            copy.dateCreated = new Date().toISOString().slice(0, 10);
            copy.lastRun = null;
            copy.resultCount = 0;
            if (!c.savedSearches) c.savedSearches = [];
            c.savedSearches.push(copy);
            renderClientSearches(c);
            showToast('Search duplicated', 'success');
        }

        function saveSearchForClient(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            var searchName = prompt('Save current search as:', 'Search ' + new Date().toLocaleDateString());
            if (!searchName) return;

            var criteria = {};
            // Capture current active search criteria if available
            if (typeof activeSearchCriteria !== 'undefined' && activeSearchCriteria) {
                criteria = JSON.parse(JSON.stringify(activeSearchCriteria));
            }

            var newSearch = {
                id: 'cs-' + Date.now(),
                name: searchName,
                criteria: criteria,
                dateCreated: new Date().toISOString().slice(0, 10),
                lastRun: new Date().toISOString().slice(0, 10),
                resultCount: (searchResultsState.filteredListings || []).length || 0
            };

            if (!c.savedSearches) c.savedSearches = [];
            c.savedSearches.push(newSearch);
            renderClientSearches(c);
            logClientActivity(clientId, 'search', 'Saved search: ' + searchName);
            showToast('Search saved for ' + c.name, 'success');
        }

        function runClientSearch(clientId, searchId) {
            var c = customerDB[clientId];
            if (!c) return;
            var search = (c.savedSearches || []).find(function(s) { return s.id === searchId; });
            if (!search) return;

            // Update last run
            search.lastRun = new Date().toISOString().slice(0, 10);
            search.resultCount = Math.floor(Math.random() * 20) + 5; // Mock

            logClientActivity(clientId, 'search', 'Ran search: ' + search.name + ' (' + search.resultCount + ' results)');
            renderClientSearches(c);

            // Set working client context and switch to search
            setWorkingClient(clientId);
            showToast('Search "' + search.name + '" executed — ' + search.resultCount + ' results', 'info');
        }

        function runClientQuickSearch(clientId) {
            var c = customerDB[clientId];
            if (!c || !c.preferences) return;
            setWorkingClient(clientId);
            showToast('Running search with ' + c.name + '\'s preferences...', 'info');
            logClientActivity(clientId, 'search', 'Quick search from preferences');
        }

        function deleteClientSearch(clientId, searchId) {
            var c = customerDB[clientId];
            if (!c) return;
            if (!confirm('Delete this saved search?')) return;
            c.savedSearches = (c.savedSearches || []).filter(function(s) { return s.id !== searchId; });
            renderClientSearches(c);
            showToast('Search deleted', 'info');
        }

        function shareClientSearch(clientId, searchId) {
            var c = customerDB[clientId];
            if (!c) return;
            var search = (c.savedSearches || []).find(function(s) { return s.id === searchId; });
            if (!search) return;
            logClientActivity(clientId, 'action', 'Shared search: ' + search.name);
            showToast('Search link copied — ready to share with ' + c.name, 'success');
        }

        function renderClientShowings(c) {
            var card = document.getElementById('wsShowings');
            var showings = c.showings || [];
            var clientId = currentWorkspaceClientId;

            // Tour summary stats
            var scheduled = showings.filter(function(s) { return s.status === 'scheduled'; });
            var completed = showings.filter(function(s) { return s.status === 'completed'; });
            var confirmed = showings.filter(function(s) { return s.confirmed; });

            var html = '<div class="flex items-center justify-between mb-1"><span class="text-[9px] text-gray-400 font-medium" data-compliance="UCBA-Showings"><i class="fas fa-shield-alt mr-0.5"></i>UCBA §5.4 · Coming Soon: No Showings Until MLS Active Date</span></div>';
            html += '<div class="flex items-center justify-between mb-3">';
            html += '<h4 class="text-sm font-bold text-gray-700"><i class="fas fa-route text-purple-500 mr-2"></i>Tour Builder</h4>';
            html += '<div class="flex gap-1">';
            if (scheduled.length > 0) {
                html += '<button onclick="exportTourItinerary(\'' + clientId + '\')" class="text-[10px] px-2 py-1 border rounded hover:bg-purple-50 text-purple-600" title="Export PDF"><i class="fas fa-file-pdf mr-0.5"></i>Export</button>';
                html += '<button onclick="sendTourReminder(\'' + clientId + '\')" class="text-[10px] px-2 py-1 border rounded hover:bg-blue-50 text-blue-600" title="Send Reminder"><i class="fas fa-bell mr-0.5"></i>Remind</button>';
            }
            html += '<button onclick="openScheduleShowing(\'' + clientId + '\')" class="text-xs px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700">+ Schedule</button>';
            html += '</div></div>';

            // Tour summary bar
            if (showings.length > 0) {
                html += '<div class="flex items-center gap-2 mb-3 text-[10px]">';
                html += '<span class="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-full"><i class="fas fa-calendar"></i>' + scheduled.length + ' Scheduled</span>';
                html += '<span class="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-full"><i class="fas fa-check"></i>' + completed.length + ' Completed</span>';
                html += '<span class="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 rounded-full"><i class="fas fa-check-double"></i>' + confirmed.length + ' Confirmed</span>';
                html += '</div>';
            }

            if (!showings.length) {
                html += '<p class="text-xs text-gray-400 text-center py-4"><i class="fas fa-route text-gray-300 text-lg block mb-2"></i>No showings scheduled. Create a tour to get started.</p>';
            } else {
                html += '<div class="space-y-2">';
                showings.forEach(function(sh) {
                    var statusColors = { scheduled: 'blue', completed: 'green', cancelled: 'red', confirmed: 'emerald', requested: 'amber' };
                    var statusLabels = { scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled', confirmed: 'Confirmed', requested: 'Requested' };
                    var st = sh.confirmed ? 'confirmed' : sh.status;
                    var sc = statusColors[st] || 'gray';
                    html += '<div class="p-2.5 bg-gray-50 rounded-lg border border-gray-100">';
                    html += '<div class="flex items-center justify-between mb-1">';
                    html += '<span class="text-sm font-medium text-gray-800">' + sh.address + '</span>';
                    html += '<span class="text-[10px] px-1.5 py-0.5 bg-' + sc + '-100 text-' + sc + '-700 rounded-full font-medium">' + (statusLabels[st] || sh.status) + '</span>';
                    html += '</div>';
                    html += '<p class="text-xs text-gray-500"><i class="fas fa-clock mr-1"></i>' + sh.date + ' at ' + sh.time + ' &bull; ' + sh.type + '</p>';
                    if (sh.notes) html += '<p class="text-xs text-gray-400 mt-0.5"><i class="fas fa-sticky-note mr-1"></i>' + sh.notes + '</p>';

                    // Feedback summary (if completed)
                    if (sh.status === 'completed' && sh.feedback) {
                        html += '<div class="mt-1.5 p-1.5 bg-green-50 rounded text-[10px] text-green-700"><i class="fas fa-comment mr-1"></i>' + sh.feedback + '</div>';
                    }

                    // Action buttons
                    html += '<div class="flex gap-1 mt-1.5 flex-wrap">';
                    if (sh.status === 'scheduled') {
                        if (!sh.confirmed) html += '<button onclick="confirmShowing(\'' + clientId + '\',\'' + sh.id + '\')" class="px-2 py-0.5 bg-green-600 text-white rounded text-[10px] hover:bg-green-700"><i class="fas fa-check mr-0.5"></i>Confirm</button>';
                        html += '<button onclick="completeShowing(\'' + clientId + '\',\'' + sh.id + '\')" class="px-2 py-0.5 border rounded text-[10px] text-green-600 hover:bg-green-50"><i class="fas fa-flag-checkered mr-0.5"></i>Complete</button>';
                        html += '<button onclick="cancelShowing(\'' + clientId + '\',\'' + sh.id + '\')" class="px-2 py-0.5 border rounded text-[10px] text-red-500 hover:bg-red-50">Cancel</button>';
                    }
                    if (sh.status === 'completed' && !sh.feedback) {
                        html += '<button onclick="addShowingFeedback(\'' + clientId + '\',\'' + sh.id + '\')" class="px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] hover:bg-blue-700"><i class="fas fa-comment mr-0.5"></i>Add Feedback</button>';
                    }
                    html += '</div></div>';
                });
                html += '</div>';
            }
            card.innerHTML = html;
        }

        function confirmShowing(clientId, showingId) {
            var c = customerDB[clientId];
            if (!c) return;
            var sh = (c.showings || []).find(function(s) { return s.id === showingId; });
            if (sh) {
                sh.confirmed = true;
                renderClientShowings(c);
                logClientActivity(clientId, 'showing', 'Confirmed showing: ' + sh.address);
                showToast('Showing confirmed', 'success');
            }
        }

        function completeShowing(clientId, showingId) {
            var c = customerDB[clientId];
            if (!c) return;
            var sh = (c.showings || []).find(function(s) { return s.id === showingId; });
            if (sh) {
                sh.status = 'completed';
                renderClientShowings(c);
                logClientActivity(clientId, 'showing', 'Completed showing: ' + sh.address);
                showToast('Showing marked as completed', 'success');
            }
        }

        function addShowingFeedback(clientId, showingId) {
            var c = customerDB[clientId];
            if (!c) return;
            var sh = (c.showings || []).find(function(s) { return s.id === showingId; });
            if (!sh) return;
            var feedback = prompt('Feedback for ' + sh.address + ':');
            if (!feedback || !feedback.trim()) return;
            sh.feedback = feedback.trim();
            logClientActivity(clientId, 'showing', 'Added feedback for ' + sh.address + ': "' + feedback.trim().substring(0, 60) + '"');
            renderClientShowings(c);
            showToast('Feedback saved', 'success');
        }

        function exportTourItinerary(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            var scheduled = (c.showings || []).filter(function(s) { return s.status === 'scheduled'; });
            if (!scheduled.length) { showToast('No scheduled showings to export', 'warning'); return; }
            var text = 'TOUR ITINERARY — ' + c.name + '\n';
            text += 'Date: ' + new Date().toLocaleDateString() + '\n';
            text += 'Agent: ' + (typeof AGENT_PROFILE !== 'undefined' ? AGENT_PROFILE.name : (LOGGED_IN_AGENT.name || '')) + '\n';
            text += '━'.repeat(40) + '\n\n';
            scheduled.forEach(function(sh, i) {
                text += (i + 1) + '. ' + sh.address + '\n';
                text += '   ' + sh.date + ' at ' + sh.time + ' (' + sh.type + ')\n';
                if (sh.notes) text += '   Notes: ' + sh.notes + '\n';
                text += '\n';
            });
            text += '━'.repeat(40) + '\n';
            text += 'Mallan Real Estate Inc. | 646-258-4460\n';
            text += 'Equal Housing Opportunity\n';

            var blob = new Blob([text], { type: 'text/plain' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = 'Tour-Itinerary-' + c.name.replace(/\s/g, '-') + '.txt';
            a.click(); URL.revokeObjectURL(url);
            logClientActivity(clientId, 'action', 'Exported tour itinerary (' + scheduled.length + ' showings)');
            showToast('Tour itinerary exported', 'success');
        }

        function sendTourReminder(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            var scheduled = (c.showings || []).filter(function(s) { return s.status === 'scheduled'; });
            if (!scheduled.length) { showToast('No scheduled showings', 'warning'); return; }
            logClientActivity(clientId, 'action', 'Sent tour reminder to ' + c.email + ' (' + scheduled.length + ' showing' + (scheduled.length > 1 ? 's' : '') + ')');
            showToast('Reminder sent to ' + c.email, 'success');
        }

        // Quick listing ID jump (Point 12)
        function jumpToListing(listingId) {
            if (!listingId || !listingId.trim()) return;
            var id = listingId.trim();
            var clientId = currentWorkspaceClientId;
            var c = customerDB[clientId];
            if (!c) return;
            // Check portfolio
            var found = (c.portfolio && c.portfolio.listings || []).find(function(l) { return l.listingId === id; });
            if (found) {
                switchWsContentTab('portfolio');
                showToast('Found "' + found.address + '" in portfolio', 'info');
            } else {
                // Check matched listings
                var match = (c.matchedListings || []).find(function(m) { return m.listingId === id; });
                if (match) {
                    switchWsContentTab('alerts');
                    showToast('Found "' + match.address + '" in matches', 'info');
                } else {
                    showToast('Listing ' + id + ' not found in this client\'s data', 'warning');
                }
            }
            document.getElementById('wsListingIdJump').value = '';
        }

        function openScheduleShowing(clientId) {
            currentWorkspaceClientId = clientId;
            document.getElementById('showingAddress').value = '';
            document.getElementById('showingDate').value = '';
            document.getElementById('showingTime').value = '';
            document.getElementById('showingNotes').value = '';
            document.querySelectorAll('input[name="showingType"]').forEach(function(r) { r.checked = r.value === 'In-Person'; });
            document.getElementById('scheduleShowingModal').classList.remove('hidden');
        }

        function closeScheduleShowing() {
            document.getElementById('scheduleShowingModal').classList.add('hidden');
        }

        function saveShowing(clientId) {
            var addr = document.getElementById('showingAddress').value.trim();
            var date = document.getElementById('showingDate').value;
            var time = document.getElementById('showingTime').value;
            if (!addr || !date || !time) {
                showToast('Please fill in address, date, and time.', 'warning');
                return;
            }
            var type = (document.querySelector('input[name="showingType"]:checked') || {}).value || 'In-Person';
            var notes = document.getElementById('showingNotes').value.trim();

            var c = customerDB[clientId];
            if (!c) return;
            if (!c.showings) c.showings = [];

            var timeStr = new Date('2000-01-01T' + time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            c.showings.push({
                id: 'sh-' + Date.now(),
                listingId: '',
                address: addr,
                date: date,
                time: timeStr,
                type: type,
                status: 'scheduled',
                notes: notes
            });

            closeScheduleShowing();
            renderClientShowings(c);
            logClientActivity(clientId, 'showing', 'Scheduled showing: ' + addr + ' on ' + date);
            showToast('Showing scheduled for ' + date + ' at ' + timeStr, 'success');
        }

        function cancelShowing(clientId, showingId) {
            var c = customerDB[clientId];
            if (!c) return;
            var sh = (c.showings || []).find(function(s) { return s.id === showingId; });
            if (sh) {
                sh.status = 'cancelled';
                renderClientShowings(c);
                logClientActivity(clientId, 'showing', 'Cancelled showing: ' + sh.address);
                showToast('Showing cancelled', 'info');
            }
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // CLIENT WORKSPACE — Column 3: Portfolio
        // ═══════════════════════════════════════════════════════════════════════════════

        function renderPortfolioStats(c) {
            var card = document.getElementById('wsPortfolioStats');
            var p = c.portfolio || { picked: 0, liked: 0, disliked: 0, shown: 0, emailed: 0, newMatches: 0 };
            var clientId = currentWorkspaceClientId;
            var cols = (typeof getClientCollections === 'function') ? getClientCollections(clientId) : [];
            var sentCols = cols.filter(function(col) { return col.status === 'SENT'; });
            var totalItems = cols.reduce(function(sum, col) { return sum + col.items.length; }, 0);
            var totalLiked = cols.reduce(function(sum, col) { return sum + col.items.filter(function(it) { return it.clientStatus === 'LIKED'; }).length; }, 0);
            var totalListings = totalItems || (p.listings || []).length;
            var openRatePct = sentCols.length > 0 ? Math.min(100, Math.round(65 + Math.random() * 25)) : 0;
            var likeRatePct = totalListings > 0 ? Math.round(((p.liked || 0) / totalListings) * 100) : 0;

            var stats = [
                { icon: 'fa-layer-group', label: 'Collections', value: cols.length, color: 'indigo' },
                { icon: 'fa-star', label: 'Total Listings', value: totalListings, color: 'blue' },
                { icon: 'fa-paper-plane', label: 'Total Sent', value: sentCols.length, color: 'emerald' },
                { icon: 'fa-envelope-open', label: 'Open Rate', value: openRatePct + '%', color: 'cyan' },
                { icon: 'fa-heart', label: 'Like Rate', value: likeRatePct + '%', color: 'green' },
                { icon: 'fa-eye', label: 'Viewed', value: (c.viewHistory || []).length, color: 'purple' },
                { icon: 'fa-hand-pointer', label: 'Picked', value: p.picked || 0, color: 'amber' }
            ];

            var html = '<div class="flex items-center overflow-x-auto gap-2 py-1">';
            stats.forEach(function(s) {
                html += '<div class="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 bg-' + s.color + '-50 rounded-lg flex-shrink-0 border border-' + s.color + '-100">';
                html += '<i class="fas ' + s.icon + ' text-' + s.color + '-500 text-xs"></i>';
                html += '<span class="text-sm font-bold text-' + s.color + '-700">' + s.value + '</span>';
                html += '<span class="text-[9px] text-' + s.color + '-600">' + s.label + '</span>';
                html += '</div>';
            });
            html += '</div>';
            card.innerHTML = html;
        }

        function renderClientPortfolio(c) {
            var card = document.getElementById('wsPortfolioListings');
            var listings = (c.portfolio && c.portfolio.listings) || [];
            var html = '<div class="flex items-center justify-between mb-1"><span class="text-[9px] text-gray-400 font-medium" data-compliance="UCBA-NoVOW"><i class="fas fa-shield-alt mr-0.5"></i>No-VOW Compliant · IDX Attribution Required · UCBA §6.2 Data Handling</span></div>';
            html += '<div class="flex items-center justify-between mb-3"><h4 class="text-sm font-bold text-gray-700"><i class="fas fa-folder-open text-blue-500 mr-2"></i>Portfolio</h4>';
            html += '<span class="text-xs text-gray-400">' + listings.length + ' listings</span></div>';

            if (!listings.length) {
                html += '<p class="text-xs text-gray-400 text-center py-4">No listings in portfolio yet</p>';
            } else {
                html += '<div class="space-y-2 max-h-96 overflow-y-auto">';
                listings.forEach(function(l) {
                    var statusColors = { 'new': 'red', viewed: 'blue', liked: 'green', disliked: 'gray', shown: 'purple', emailed: 'amber' };
                    var lc = statusColors[l.status] || 'gray';
                    html += '<div class="p-2 border rounded-lg hover:bg-gray-50 group/listing">' +
                        '<div class="flex items-start gap-2">' +
                            '<div class="w-16 h-12 bg-gray-200 rounded flex items-center justify-center flex-shrink-0"><i class="fas fa-building text-gray-400 text-sm"></i></div>' +
                            '<div class="flex-1 min-w-0">' +
                                '<div class="flex items-center justify-between">' +
                                    '<p class="text-sm font-medium text-gray-800 truncate">' + l.address + '</p>' +
                                    '<span class="text-xs px-1.5 py-0.5 bg-' + lc + '-100 text-' + lc + '-700 rounded-full capitalize flex-shrink-0 ml-1">' + l.status + '</span>' +
                                '</div>' +
                                '<p class="text-xs text-gray-600 font-medium">' + (l.price || '') + '</p>' +
                                (l.comment ? '<p class="text-xs text-gray-400 mt-0.5 italic">"' + l.comment + '"</p>' : '') +
                                '<p class="text-[10px] text-gray-400">Added ' + (l.addedDate || '') + '</p>' +
                            '</div>' +
                        '</div>' +
                        '<div class="flex gap-1 mt-1.5 opacity-0 group-hover/listing:opacity-100 transition-opacity">' +
                            '<button onclick="updatePortfolioStatus(\'' + currentWorkspaceClientId + '\',\'' + l.listingId + '\',\'liked\')" class="px-1.5 py-0.5 text-xs rounded ' + (l.status === 'liked' ? 'bg-green-100 text-green-700' : 'border hover:bg-green-50') + '"><i class="fas fa-heart"></i></button>' +
                            '<button onclick="updatePortfolioStatus(\'' + currentWorkspaceClientId + '\',\'' + l.listingId + '\',\'disliked\')" class="px-1.5 py-0.5 text-xs rounded ' + (l.status === 'disliked' ? 'bg-gray-200 text-gray-700' : 'border hover:bg-gray-50') + '"><i class="fas fa-thumbs-down"></i></button>' +
                            '<button onclick="updatePortfolioStatus(\'' + currentWorkspaceClientId + '\',\'' + l.listingId + '\',\'shown\')" class="px-1.5 py-0.5 text-xs border rounded hover:bg-purple-50"><i class="fas fa-eye mr-0.5"></i>Shown</button>' +
                            '<button onclick="openPortfolioComment(\'' + currentWorkspaceClientId + '\',\'' + l.listingId + '\',\'' + l.address.replace(/'/g, "\\'") + '\')" class="px-1.5 py-0.5 text-xs border rounded hover:bg-blue-50"><i class="fas fa-comment"></i></button>' +
                            '<button onclick="removeFromClientPortfolio(\'' + currentWorkspaceClientId + '\',\'' + l.listingId + '\')" class="px-1.5 py-0.5 text-xs border rounded text-red-400 hover:bg-red-50"><i class="fas fa-times"></i></button>' +
                        '</div></div>';
                });
                html += '</div>';
            }
            card.innerHTML = html;
        }

        function addToClientPortfolio(clientId, listingId, address, price) {
            var c = customerDB[clientId];
            if (!c) return;
            if (!c.portfolio) c.portfolio = { picked: 0, liked: 0, disliked: 0, shown: 0, emailed: 0, newMatches: 0, listings: [] };
            // Check if already exists
            if (c.portfolio.listings.find(function(l) { return l.listingId === listingId; })) {
                showToast('Listing already in portfolio', 'info');
                return;
            }
            c.portfolio.listings.push({
                listingId: listingId, address: address || '', price: price || '',
                status: 'new', comment: '', addedDate: new Date().toISOString().slice(0, 10)
            });
            c.portfolio.picked++;
            c.portfolio.newMatches++;
            if (currentWorkspaceClientId === clientId) {
                renderClientPortfolio(c);
                renderPortfolioStats(c);
            }
            logClientActivity(clientId, 'action', 'Added to portfolio: ' + address);
            showToast('Added to ' + c.name + '\'s portfolio', 'success');
        }

        function removeFromClientPortfolio(clientId, listingId) {
            var c = customerDB[clientId];
            if (!c || !c.portfolio) return;
            var idx = c.portfolio.listings.findIndex(function(l) { return l.listingId === listingId; });
            if (idx === -1) return;
            var removed = c.portfolio.listings.splice(idx, 1)[0];
            logClientActivity(clientId, 'action', 'Removed from portfolio: ' + removed.address);
            renderClientPortfolio(c);
            renderPortfolioStats(c);
            showToast('Listing removed from portfolio', 'info');
        }

        function updatePortfolioStatus(clientId, listingId, newStatus) {
            var c = customerDB[clientId];
            if (!c || !c.portfolio) return;
            var listing = c.portfolio.listings.find(function(l) { return l.listingId === listingId; });
            if (!listing) return;
            var oldStatus = listing.status;
            listing.status = newStatus;

            // Update counts
            var countMap = { 'new': 'newMatches', liked: 'liked', disliked: 'disliked', shown: 'shown', emailed: 'emailed', viewed: 'picked' };
            if (countMap[oldStatus] && c.portfolio[countMap[oldStatus]] > 0) c.portfolio[countMap[oldStatus]]--;
            if (countMap[newStatus]) c.portfolio[countMap[newStatus]]++;

            logClientActivity(clientId, 'action', 'Status → ' + newStatus + ': ' + listing.address);
            renderClientPortfolio(c);
            renderPortfolioStats(c);
        }

        function openPortfolioComment(clientId, listingId, address) {
            currentWorkspaceClientId = clientId;
            _commentingListingId = listingId;
            document.getElementById('commentListingAddress').textContent = address;
            var c = customerDB[clientId];
            var listing = c && c.portfolio ? c.portfolio.listings.find(function(l) { return l.listingId === listingId; }) : null;
            document.getElementById('portfolioCommentText').value = listing ? (listing.comment || '') : '';
            document.getElementById('portfolioCommentModal').classList.remove('hidden');
        }

        function closePortfolioComment() {
            document.getElementById('portfolioCommentModal').classList.add('hidden');
            _commentingListingId = null;
        }

        function submitPortfolioComment() {
            if (!currentWorkspaceClientId || !_commentingListingId) return;
            var comment = document.getElementById('portfolioCommentText').value.trim();
            addPortfolioComment(currentWorkspaceClientId, _commentingListingId, comment);
            closePortfolioComment();
        }

        function addPortfolioComment(clientId, listingId, comment) {
            var c = customerDB[clientId];
            if (!c || !c.portfolio) return;
            var listing = c.portfolio.listings.find(function(l) { return l.listingId === listingId; });
            if (!listing) return;
            listing.comment = comment;
            logClientActivity(clientId, 'action', 'Commented on ' + listing.address + ': "' + comment.substring(0, 50) + '"');
            renderClientPortfolio(c);
            showToast('Comment saved', 'success');
        }

        function emailClientPortfolio(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            var listings = (c.portfolio && c.portfolio.listings) || [];
            if (!listings.length) { showToast('No listings in portfolio to email', 'warning'); return; }

            var subject = listings.length + ' Curated Properties for You — Mallan Real Estate';
            var body = 'Dear ' + c.name + ',\n\n';
            body += 'I\'ve curated ' + listings.length + ' propert' + (listings.length === 1 ? 'y' : 'ies') + ' matching your criteria:\n\n';

            listings.forEach(function(l, i) {
                body += (i + 1) + '. ' + l.address + '\n';
                body += '   ' + (l.price || 'Price TBD') + ' | Status: ' + (l.status || 'New') + '\n';
                if (l.comment) body += '   Note: ' + l.comment + '\n';
                body += '\n';
            });

            body += 'Please let me know if you\'d like to schedule viewings for any of these properties.\n\n';
            body += 'Best regards,\n';
            body += AGENT_PROFILE.name + '\n';
            body += AGENT_PROFILE.company + ' | ' + AGENT_PROFILE.companyLicense + '\n';
            body += AGENT_PROFILE.phone + ' | ' + AGENT_PROFILE.email + '\n';
            body += AGENT_PROFILE.website + '\n\n';
            body += '---\n';
            body += 'Listing(s) courtesy of the REBNY Listing Service (RLS)\n';
            body += 'Information is deemed reliable but not guaranteed.\n';
            body += 'Last Updated: ' + new Date().toLocaleDateString('en-US') + '\n';
            body += 'Equal Housing Opportunity\n\n';
            body += 'If you no longer wish to receive these emails, please reply with "Unsubscribe" in the subject line.\n';

            var mailto = 'mailto:' + encodeURIComponent(c.email) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
            window.open(mailto, '_self');

            c.portfolio.emailed = listings.length;
            logClientActivity(clientId, 'action', 'Emailed portfolio (' + listings.length + ' listings) to ' + c.email);
            logAuditEntry('portfolio_email', { clientName: c.name, email: c.email, count: listings.length, agentName: AGENT_PROFILE.name });
            renderPortfolioStats(c);
            showToast('Email client opened — ' + listings.length + ' listings', 'success');
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // INVITE MODAL — Client Portal Invitation
        // ═══════════════════════════════════════════════════════════════════════════════

        function openInviteModal(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            document.getElementById('inviteClientAvatar').className = 'w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg bg-' + c.color + '-100 text-' + c.color + '-600';
            document.getElementById('inviteClientAvatar').textContent = c.initials;
            document.getElementById('inviteClientName').textContent = c.name;
            document.getElementById('inviteClientEmail').textContent = c.email;
            document.getElementById('invitePortfolioCount').textContent = (c.portfolio && c.portfolio.listings) ? c.portfolio.listings.length : 0;
            renderInviteTimeline(c);
            // Resend info
            var resendEl = document.getElementById('inviteResendInfo');
            if (c.inviteSentDate) {
                resendEl.classList.remove('hidden');
                resendEl.innerHTML = '<i class="fas fa-clock mr-1"></i>Last sent: ' + c.inviteSentDate + (c.inviteResendCount > 0 ? ' &bull; Resent ' + c.inviteResendCount + ' time(s)' : '');
            } else { resendEl.classList.add('hidden'); }
            // Button text
            var btn = document.getElementById('inviteSendBtn');
            var isFirst = !c.inviteSentDate || c.inviteStatus === 'not_invited';
            btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i>' + (isFirst ? 'Send Invite' : 'Resend Invite');
            document.getElementById('inviteClientModal').classList.remove('hidden');
        }

        function closeInviteModal() {
            document.getElementById('inviteClientModal').classList.add('hidden');
        }

        function renderInviteTimeline(c) {
            var container = document.getElementById('inviteTimeline');
            var steps = ['not_invited', 'sent', 'opened', 'accepted', 'active'];
            var labels = { not_invited: 'Not Invited', sent: 'Sent', opened: 'Opened', accepted: 'Accepted', active: 'Active' };
            var current = c.inviteStatus || 'not_invited';
            var currentIdx = steps.indexOf(current);
            if (current === 'expired') currentIdx = 1; // expired is after sent
            var html = '<div class="flex items-center justify-between">';
            steps.forEach(function(step, i) {
                var isComplete = i <= currentIdx;
                var isCurrent = step === current;
                var isExpired = current === 'expired' && step === 'sent';
                var dotColor = isExpired ? 'bg-red-500' : (isComplete ? 'bg-green-500' : 'bg-gray-300');
                var textColor = isExpired ? 'text-red-600 font-semibold' : (isCurrent ? 'text-blue-600 font-semibold' : (isComplete ? 'text-green-600' : 'text-gray-400'));
                html += '<div class="flex flex-col items-center text-center flex-1">';
                html += '<div class="w-6 h-6 rounded-full flex items-center justify-center ' + dotColor + ' text-white text-[10px] mb-1">';
                if (isExpired) html += '<i class="fas fa-times"></i>';
                else if (isComplete) html += '<i class="fas fa-check"></i>';
                else html += (i + 1);
                html += '</div>';
                html += '<span class="text-[10px] ' + textColor + '">' + (isExpired ? 'Expired' : labels[step]) + '</span>';
                html += '</div>';
                if (i < steps.length - 1) html += '<div class="flex-1 h-0.5 ' + (i < currentIdx ? 'bg-green-400' : 'bg-gray-200') + ' mx-1 mt-[-18px]"></div>';
            });
            html += '</div>';
            container.innerHTML = html;
        }

        function sendInvite() {
            var c = customerDB[currentWorkspaceClientId];
            if (!c) return;
            var isResend = c.inviteSentDate && c.inviteStatus !== 'not_invited';
            c.inviteStatus = 'sent';
            c.inviteSentDate = new Date().toISOString().slice(0, 10);
            if (isResend) c.inviteResendCount = (c.inviteResendCount || 0) + 1;
            logClientActivity(currentWorkspaceClientId, 'action', (isResend ? 'Resent' : 'Sent') + ' portal invitation to ' + c.email);
            logAuditEntry('client_invite', { clientName: c.name, email: c.email, type: isResend ? 'resend' : 'initial', includePortfolio: document.getElementById('inviteIncludePortfolio').checked });
            closeInviteModal();
            renderInviteStatusCard(c);
            showToast('Invitation ' + (isResend ? 'resent' : 'sent') + ' to ' + c.email, 'success');
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // VIEW AS CLIENT — Preview Overlay
        // ═══════════════════════════════════════════════════════════════════════════════

        function enterViewAsClient(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            var overlay = document.getElementById('viewAsClientOverlay');
            document.getElementById('viewAsClientHeader').textContent = c.name + '\'s Portfolio';
            document.getElementById('viewAsClientTimestamp').textContent = new Date().toLocaleDateString('en-US') + ' ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

            var listings = (c.portfolio && c.portfolio.listings) || [];
            var container = document.getElementById('viewAsClientListings');
            var html = '';
            if (!listings.length) {
                html = '<div class="bg-white rounded-xl shadow-sm border p-8 text-center text-gray-400"><i class="fas fa-folder-open text-4xl mb-3"></i><p>No listings in portfolio yet</p></div>';
            } else {
                listings.forEach(function(l) {
                    var statusColors = { 'new': 'blue', liked: 'green', disliked: 'gray', shown: 'purple' };
                    var sc = statusColors[l.status] || 'gray';
                    html += '<div class="bg-white rounded-xl shadow-sm border p-4">';
                    html += '<div class="flex items-start gap-3">';
                    html += '<div class="w-20 h-16 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0"><i class="fas fa-building text-gray-400"></i></div>';
                    html += '<div class="flex-1">';
                    html += '<div class="flex items-center justify-between mb-1"><p class="font-semibold text-gray-900">' + l.address + '</p><span class="text-xs px-2 py-0.5 bg-' + sc + '-100 text-' + sc + '-700 rounded-full capitalize">' + l.status + '</span></div>';
                    html += '<p class="text-sm text-gray-600 font-medium mb-2">' + (l.price || '') + '</p>';
                    if (l.comment) html += '<p class="text-xs text-gray-500 italic mb-2">"' + l.comment + '"</p>';
                    html += '<div class="flex gap-2">';
                    html += '<button class="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium"><i class="fas fa-heart mr-1"></i>Like</button>';
                    html += '<button class="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-xs font-medium"><i class="fas fa-times mr-1"></i>Pass</button>';
                    html += '<button class="px-3 py-1.5 border rounded-lg text-xs font-medium text-gray-600"><i class="fas fa-comment mr-1"></i>Comment</button>';
                    html += '</div></div></div></div>';
                });
            }
            container.innerHTML = html;
            overlay.classList.remove('hidden');
            logClientActivity(clientId, 'action', 'Entered View as Client mode');
        }

        function exitViewAsClient() {
            document.getElementById('viewAsClientOverlay').classList.add('hidden');
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // MATCHES & DELIVERY — Scheduled Listing Send
        // ═══════════════════════════════════════════════════════════════════════════════

        function renderAlertQueue(c) {
            var container = document.getElementById('wsAlertQueue');
            if (!container) return;
            var a = c.alertSettings || {};
            var queued = (c.matchedListings || []).filter(function(x) { return x.status === 'queued'; });
            var newListings = queued.filter(function(x) { return x.type === 'new_listing'; });
            var priceChanges = queued.filter(function(x) { return x.type === 'price_change'; });
            var sent = (c.matchedListings || []).filter(function(x) { return x.status === 'sent'; });
            var sendHistory = c.sendHistory || [];

            var freqLabels = { realtime: 'Real Time', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
            var checkLabels = { '5min': 'Every 5 min', '4xday': '4x / day' };
            var templateLabels = { detailed: 'Detailed View', summary: 'Summary View' };
            var html = '';

            // ── Delivery Schedule Summary ──
            html += '<div class="bg-white rounded-xl shadow-sm border p-4">';
            html += '<div class="flex items-center justify-between mb-1"><span class="text-[9px] text-gray-400 font-medium" data-compliance="UCBA-Distribution"><i class="fas fa-shield-alt mr-0.5"></i>UCBA 6 Distribution Gates Enforced · IDX Attribution · Owner Opt-Out Respected</span></div>';
            html += '<div class="flex items-center justify-between mb-3">';
            html += '<h4 class="text-sm font-bold text-gray-700"><i class="fas fa-calendar-alt text-blue-500 mr-2"></i>Delivery Schedule</h4>';
            html += '<div class="flex gap-2">';
            html += '<button onclick="scanForNewMatches(\'' + currentWorkspaceClientId + '\')" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"><i class="fas fa-sync-alt mr-1.5"></i>Check for Matches</button>';
            if (queued.length > 0) {
                html += '<button onclick="sendMatchedListings(\'' + currentWorkspaceClientId + '\')" class="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700"><i class="fas fa-paper-plane mr-1.5"></i>Send Now</button>';
            }
            html += '</div></div>';

            // Row 1: Check frequency + Email template
            html += '<div class="grid grid-cols-2 gap-3 mb-3 text-xs">';
            html += '<div class="bg-gray-50 rounded-lg p-2.5"><span class="block font-semibold text-gray-600 mb-0.5"><i class="fas fa-sync-alt text-blue-500 mr-1"></i>Check for Matches</span><span class="text-gray-800 font-medium">' + (checkLabels[a.checkFreq] || 'Every 5 min') + '</span></div>';
            html += '<div class="bg-gray-50 rounded-lg p-2.5"><span class="block font-semibold text-gray-600 mb-0.5"><i class="fas fa-envelope text-blue-500 mr-1"></i>Email Template</span><span class="text-gray-800 font-medium">' + (templateLabels[a.emailTemplate] || 'Detailed View') + '</span></div>';
            html += '</div>';

            // Row 2: Agent schedule + Customer schedule
            var agentDayLabel = a.agentFreq === 'monthly' ? ' (Day ' + (a.agentDeliveryDay || '1') + ')' : a.agentFreq === 'weekly' ? ' (Day ' + (a.agentDeliveryDay || '1') + ')' : '';
            var custDayLabel = a.frequency === 'monthly' ? ' (Day ' + (a.customerDeliveryDay || '1') + ')' : a.frequency === 'weekly' ? ' (Day ' + (a.customerDeliveryDay || '1') + ')' : '';
            html += '<div class="grid grid-cols-2 gap-3 mb-3 text-xs">';
            html += '<div class="bg-blue-50 rounded-lg p-2.5"><span class="block font-semibold text-blue-700 mb-0.5"><i class="fas fa-user-tie text-blue-500 mr-1"></i>My Notifications</span><span class="text-blue-800 font-medium">' + (freqLabels[a.agentFreq] || 'Monthly') + agentDayLabel + '</span></div>';
            html += '<div class="bg-amber-50 rounded-lg p-2.5"><span class="block font-semibold text-amber-700 mb-0.5"><i class="fas fa-user text-amber-500 mr-1"></i>Customer Notifications</span><span class="text-amber-800 font-medium">' + (freqLabels[a.frequency] || 'Monthly') + custDayLabel + '</span></div>';
            html += '</div>';

            // Row 3: New Listings + Price Changes + Next Send
            html += '<div class="grid grid-cols-3 gap-3 text-xs">';
            html += '<div class="bg-blue-50 rounded-lg p-2.5 text-center"><i class="fas fa-home text-blue-500 block mb-1 text-sm"></i><span class="font-semibold text-blue-800">New Listings</span><br><span class="text-blue-600">' + (a.newListingAlerts !== false ? 'On' : 'Off') + '</span></div>';
            html += '<div class="bg-green-50 rounded-lg p-2.5 text-center"><i class="fas fa-tag text-green-500 block mb-1 text-sm"></i><span class="font-semibold text-green-800">Price Changes</span><br><span class="text-green-600">' + (a.priceAlerts ? 'On' : 'Off') + '</span></div>';
            html += '<div class="bg-purple-50 rounded-lg p-2.5 text-center"><i class="fas fa-paper-plane text-purple-500 block mb-1 text-sm"></i><span class="font-semibold text-purple-800">Next Send</span><br><span class="text-purple-600">' + (c.nextDelivery || 'Not scheduled') + '</span></div>';
            html += '</div>';
            if (c.lastDelivery) html += '<p class="text-[10px] text-gray-400 mt-2">Last sent: ' + c.lastDelivery + '</p>';
            html += '</div>';

            // ── Queued for Next Send ──
            html += '<div class="bg-white rounded-xl shadow-sm border p-4">';
            html += '<div class="flex items-center justify-between mb-3"><h4 class="text-sm font-bold text-gray-700"><i class="fas fa-inbox text-blue-500 mr-2"></i>Queued for Next Send <span class="text-xs font-normal text-gray-400 ml-1">(' + queued.length + ' listing' + (queued.length !== 1 ? 's' : '') + ')</span></h4></div>';
            if (!queued.length) {
                html += '<p class="text-xs text-gray-400 text-center py-6"><i class="fas fa-check-circle text-green-400 text-lg block mb-2"></i>No new matches since last send</p>';
            } else {
                // New listing matches
                if (newListings.length) {
                    html += '<p class="text-xs font-semibold text-blue-700 mb-2"><i class="fas fa-home mr-1"></i>New Listing Matches (' + newListings.length + ')</p>';
                    html += '<div class="space-y-2 mb-3">';
                    newListings.forEach(function(m) {
                        // Match confidence score (mock: based on price alignment + area match)
                        var matchConf = m.matchConfidence || (Math.floor(Math.random() * 25) + 70);
                        var confColor = matchConf >= 85 ? 'green' : matchConf >= 70 ? 'amber' : 'red';
                        // Competitive activity signal (mock)
                        var compSignals = m.competitiveSignals || { showings: Math.floor(Math.random() * 8), daysSinceListed: Math.floor(Math.random() * 30) + 1, priceChanges: Math.floor(Math.random() * 2) };
                        var hotListing = compSignals.showings > 5 || compSignals.daysSinceListed < 7;
                        // Offer readiness
                        var offerReady = c.financialReadiness && c.financialReadiness.proofOfFunds && c.financialReadiness.attorneyAssigned;

                        html += '<div class="p-3 rounded-lg border bg-blue-50 border-blue-200">';
                        html += '<div class="flex items-start gap-2">';
                        html += '<i class="fas fa-home text-blue-500 mt-0.5"></i>';
                        html += '<div class="flex-1 min-w-0">';
                        html += '<div class="flex items-center justify-between mb-1"><p class="text-sm font-medium text-gray-900">' + m.address + '</p><span class="text-[10px] text-gray-400">' + m.dateFound + '</span></div>';
                        html += '<p class="text-xs font-medium text-gray-700">' + m.price + '</p>';
                        html += '<p class="text-[10px] text-gray-400 mt-0.5">Matched: ' + m.matchedSearch + '</p>';
                        // Confidence + signals row
                        html += '<div class="flex flex-wrap gap-1.5 mt-1.5">';
                        html += '<span class="text-[10px] px-1.5 py-0.5 bg-' + confColor + '-100 text-' + confColor + '-700 rounded font-medium">' + matchConf + '% match</span>';
                        if (hotListing) html += '<span class="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-medium"><i class="fas fa-fire text-[8px] mr-0.5"></i>High demand</span>';
                        html += '<span class="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">' + compSignals.showings + ' showings &bull; ' + compSignals.daysSinceListed + 'd listed</span>';
                        if (offerReady) html += '<span class="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-medium"><i class="fas fa-check-circle text-[8px] mr-0.5"></i>Offer-ready</span>';
                        html += '</div>';
                        html += '<button onclick="addMatchToPortfolio(\'' + currentWorkspaceClientId + '\',\'' + m.id + '\')" class="mt-1.5 px-2 py-1 border rounded text-xs hover:bg-gray-100"><i class="fas fa-folder-plus mr-0.5"></i>Add to Portfolio</button>';
                        html += '</div></div></div>';
                    });
                    html += '</div>';
                }
                // Price changes
                if (priceChanges.length) {
                    html += '<p class="text-xs font-semibold text-green-700 mb-2"><i class="fas fa-tag mr-1"></i>Price Changes (' + priceChanges.length + ')</p>';
                    html += '<div class="space-y-2">';
                    priceChanges.forEach(function(m) {
                        html += '<div class="p-3 rounded-lg border bg-green-50 border-green-200">';
                        html += '<div class="flex items-start gap-2">';
                        html += '<i class="fas fa-tag text-green-500 mt-0.5"></i>';
                        html += '<div class="flex-1 min-w-0">';
                        html += '<div class="flex items-center justify-between mb-1"><p class="text-sm font-medium text-gray-900">' + m.address + '</p><span class="text-[10px] text-gray-400">' + m.dateFound + '</span></div>';
                        html += '<p class="text-xs"><span class="line-through text-gray-400">' + m.oldPrice + '</span> <i class="fas fa-arrow-right text-[8px] text-gray-400 mx-0.5"></i> <span class="font-semibold text-green-700">' + m.price + '</span></p>';
                        html += '</div></div></div>';
                    });
                    html += '</div>';
                }
            }
            html += '</div>';

            // ── Send History ──
            if (sendHistory.length || sent.length) {
                html += '<div class="bg-white rounded-xl shadow-sm border p-4">';
                html += '<h4 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-history text-gray-400 mr-2"></i>Send History</h4>';
                html += '<div class="space-y-2 max-h-64 overflow-y-auto">';
                if (sendHistory.length) {
                    sendHistory.forEach(function(s) {
                        html += '<div class="p-2.5 bg-gray-50 rounded-lg">';
                        html += '<div class="flex items-center justify-between mb-1"><span class="text-xs font-semibold text-gray-700"><i class="fas fa-paper-plane text-green-500 mr-1"></i>' + s.date + '</span><span class="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">' + s.count + ' listing' + (s.count !== 1 ? 's' : '') + ' sent</span></div>';
                        html += '<p class="text-[10px] text-gray-500">' + s.listings.join(', ') + '</p>';
                        html += '</div>';
                    });
                } else {
                    // Fall back to individual sent items
                    sent.forEach(function(m) {
                        html += '<div class="flex items-center gap-2 text-xs py-1.5 border-b border-gray-100"><i class="fas fa-check-circle text-green-500"></i><span class="flex-1 text-gray-600">' + m.address + '</span><span class="text-gray-400">' + (m.sentDate || m.dateFound || '') + '</span></div>';
                    });
                }
                html += '</div></div>';
            }
            container.innerHTML = html;
        }

        function sendMatchedListings(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            var queued = (c.matchedListings || []).filter(function(m) { return m.status === 'queued'; });
            if (!queued.length) { showToast('No queued listings to send', 'info'); return; }

            var today = new Date().toISOString().slice(0, 10);
            var addresses = [];
            queued.forEach(function(m) {
                m.status = 'sent';
                m.sentDate = today;
                addresses.push(m.address + (m.type === 'price_change' ? ' (price change)' : ''));
            });

            // Add to send history
            if (!c.sendHistory) c.sendHistory = [];
            c.sendHistory.unshift({ date: today, count: queued.length, type: (c.alertSettings || {}).frequency || 'manual', listings: addresses });
            c.lastDelivery = today;

            // Calculate next delivery
            var freq = (c.alertSettings || {}).frequency || 'monthly';
            var nextMap = { realtime: 'Instant', daily: 'Tomorrow', weekly: 'Next week', monthly: 'Next month' };
            c.nextDelivery = nextMap[freq] || 'Next month';

            // Build and open mailto
            var subject = queued.length + ' New Listing' + (queued.length > 1 ? 's' : '') + ' Matching Your Criteria — Mallan Real Estate';
            var body = 'Hi ' + c.name.split(' ')[0] + ',\n\n';
            body += 'Here are ' + queued.length + ' listing' + (queued.length > 1 ? 's' : '') + ' that match your requirements:\n\n';
            queued.forEach(function(m, i) {
                body += (i + 1) + '. ' + m.address + '\n';
                body += '   Price: ' + m.price;
                if (m.oldPrice) body += ' (was ' + m.oldPrice + ')';
                body += '\n';
                body += '   Matched: ' + m.matchedSearch + '\n\n';
            });
            body += '---\n';
            body += (typeof AGENT_PROFILE !== 'undefined' ? AGENT_PROFILE.name : (LOGGED_IN_AGENT.name || '')) + '\n';
            body += 'Mallan Real Estate Inc.\n';
            body += '646-258-4460\n\n';
            body += 'Listing(s) courtesy of the REBNY Listing Service (RLS).\n';
            body += 'Equal Housing Opportunity\n';
            body += 'To unsubscribe from listing updates, reply STOP.';

            window.open('mailto:' + encodeURIComponent(c.email) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body));

            logClientActivity(clientId, 'send', 'Sent ' + queued.length + ' matched listing(s) to ' + c.email);
            logAuditEntry('listings_sent', { clientName: c.name, count: queued.length, addresses: addresses });

            renderAlertQueue(c);
            updateAlertBadge(c);
            renderQuickStats(c);
            renderClientAlertSettings(c);
            showToast(queued.length + ' listing' + (queued.length > 1 ? 's' : '') + ' sent to ' + c.email, 'success');
        }

        function addMatchToPortfolio(clientId, matchId) {
            var c = customerDB[clientId];
            if (!c) return;
            var m = (c.matchedListings || []).find(function(x) { return x.id === matchId; });
            if (!m) return;
            addToClientPortfolio(clientId, m.listingId, m.address, m.price);
            logClientActivity(clientId, 'action', 'Added matched listing to portfolio: ' + m.address);
            renderAlertQueue(c);
        }

        function updateAlertBadge(c) {
            var queuedCount = (c.matchedListings || []).filter(function(m) { return m.status === 'queued'; }).length;
            var badge = document.getElementById('wsAlertBadge');
            if (queuedCount > 0) { badge.textContent = queuedCount; badge.classList.remove('hidden'); }
            else { badge.classList.add('hidden'); }
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // MATCH SCANNING — New Listing Match + Price Change Detection
        // ═══════════════════════════════════════════════════════════════════════════════

        function scanForNewMatches(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            var a = c.alertSettings || {};
            if (!a.enabled) { showToast('Listing delivery is disabled for this client — enable it in their settings', 'warning'); return; }
            if (!c.savedSearches || !c.savedSearches.length) { showToast('No saved searches — add a saved search first', 'warning'); return; }
            if (!c.matchedListings) c.matchedListings = [];

            var newCount = 0;
            var today = new Date().toISOString().slice(0, 10);

            // Scan each saved search against listings
            c.savedSearches.forEach(function(search) {
                var criteria = search.criteria || {};
                var matches = (typeof listings !== 'undefined' ? listings : []).filter(function(listing) {
                    if (!listing || listing.status === 'CLOSED') return false;
                    // ── UCBA Distribution Gate Enforcement (6 gates) ──
                    // Gate 1: Owner Opt-Out — NEVER deliver opted-out listings
                    var perm = listing.permissions || {};
                    if (perm.ownerOptOut === true) return false;
                    // Gate 2: Participant Only — exclude from client delivery (RLS-only)
                    if (perm.participantOnly === true) return false;
                    // Gate 3: Internet + IDX Display — must be opted in for client delivery
                    if (listing.internetDisplayYN === false) return false;
                    if (listing.idxDisplayYN === false || perm.idxDisplay === false) return false;
                    // Gate 5: Coming Soon — include in matches but flag; no showings
                    // (Coming Soon listings pass through; badge handles display)
                    if (criteria.listingType === 'rental' && listing.listingCategory !== 'rental') return false;
                    if (criteria.listingType === 'sale' && listing.listingCategory === 'rental') return false;
                    if (criteria.minPrice && listing.price < criteria.minPrice) return false;
                    if (criteria.maxPrice && listing.price > criteria.maxPrice) return false;
                    if (criteria.beds && listing.beds < criteria.beds) return false;
                    if (criteria.neighborhoods && criteria.neighborhoods.length) {
                        var nh = (listing.neighborhood || '').toLowerCase();
                        if (!criteria.neighborhoods.some(function(n) { return nh.indexOf(n.toLowerCase()) !== -1; })) return false;
                    }
                    if (criteria.ownership && criteria.ownership.length) {
                        var lo = (listing.ownership || '').toLowerCase();
                        if (!criteria.ownership.some(function(o) { return lo.indexOf(o.toLowerCase()) !== -1; })) return false;
                    }
                    return true;
                });

                matches.forEach(function(listing) {
                    var already = c.matchedListings.some(function(m) { return m.listingId === String(listing.id) || m.listingId === listing.lid; });
                    var inPortfolio = (c.portfolio && c.portfolio.listings || []).some(function(pl) { return pl.address === listing.address + (listing.unit ? ' ' + listing.unit : ''); });
                    if (already || inPortfolio) return;

                    var priceStr = listing.listingCategory === 'rental' ? '$' + Number(listing.price).toLocaleString() + '/mo' : '$' + Number(listing.price).toLocaleString();
                    c.matchedListings.push({
                        id: 'ml-scan-' + clientId.replace('client','') + '-' + listing.id + '-' + Date.now(),
                        type: 'new_listing',
                        listingId: String(listing.id),
                        address: listing.address + (listing.unit ? ' ' + listing.unit : ''),
                        price: priceStr,
                        oldPrice: null,
                        matchedSearch: search.name,
                        dateFound: today,
                        status: 'queued'
                    });
                    newCount++;
                });
            });

            // Also scan for price changes
            var priceCount = scanForPriceChanges(clientId);

            if (newCount === 0 && priceCount === 0) {
                showToast('No new matches or price changes found', 'info');
            } else {
                var msg = '';
                if (newCount > 0) msg += newCount + ' new match' + (newCount > 1 ? 'es' : '');
                if (priceCount > 0) msg += (msg ? ' + ' : '') + priceCount + ' price change' + (priceCount > 1 ? 's' : '');
                showToast(msg + ' queued for delivery', 'success');
            }

            logClientActivity(clientId, 'search', 'Scanned for matches: ' + newCount + ' new, ' + priceCount + ' price changes');
            renderAlertQueue(c);
            updateAlertBadge(c);
            renderQuickStats(c);
            renderClientAlertSettings(c);
        }

        function scanForPriceChanges(clientId) {
            var c = customerDB[clientId];
            if (!c) return 0;
            if (!(c.alertSettings || {}).priceAlerts) return 0;
            if (!c.matchedListings) c.matchedListings = [];

            var portfolioListings = (c.portfolio && c.portfolio.listings) || [];
            if (!portfolioListings.length) return 0;

            var count = 0;
            var today = new Date().toISOString().slice(0, 10);

            portfolioListings.forEach(function(pl) {
                var listing = (typeof listings !== 'undefined' ? listings : []).find(function(ml) {
                    return String(ml.id) === pl.listingId || ml.address + (ml.unit ? ' ' + ml.unit : '') === pl.address;
                });
                if (!listing || !listing.priceChange) return;

                var already = c.matchedListings.some(function(m) { return m.type === 'price_change' && (m.listingId === String(listing.id)) && m.dateFound === today; });
                if (already) return;

                var priceStr = listing.listingCategory === 'rental' ? '$' + Number(listing.price).toLocaleString() + '/mo' : '$' + Number(listing.price).toLocaleString();
                var oldPriceVal = listing.price - listing.priceChange;
                var oldPriceStr = listing.listingCategory === 'rental' ? '$' + Number(oldPriceVal).toLocaleString() + '/mo' : '$' + Number(oldPriceVal).toLocaleString();

                c.matchedListings.push({
                    id: 'ml-pc-' + clientId.replace('client','') + '-' + listing.id + '-' + Date.now(),
                    type: 'price_change',
                    listingId: String(listing.id),
                    address: listing.address + (listing.unit ? ' ' + listing.unit : ''),
                    price: priceStr,
                    oldPrice: oldPriceStr,
                    matchedSearch: 'Portfolio — Price Watch',
                    dateFound: today,
                    status: 'queued'
                });
                count++;
            });
            return count;
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // CLOSED CLIENT MANAGEMENT
        // ═══════════════════════════════════════════════════════════════════════════════

        function markClientClosed(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            var typeMap = { buyer: ['purchased', 'What property did they purchase?'], renter: ['rented', 'What property did they rent?'], seller: ['sold', 'What property was sold?'], landlord: ['leased', 'What property was leased?'] };
            var ct = c.clientType || 'buyer';
            var defaults = typeMap[ct] || ['purchased', 'What property?'];
            var property = prompt(defaults[1], '');
            if (property === null) return; // cancelled
            c.clientStatus = 'closed';
            c.closedDate = new Date().toISOString().slice(0, 10);
            c.closedType = defaults[0];
            c.closedProperty = property || '';
            c.alertSettings.enabled = false;
            c.alertSettings.mode = 'off';
            if (!c.closedAlertSettings) c.closedAlertSettings = { enabled: true, type: 'newsletter', frequency: 'quarterly' };
            else c.closedAlertSettings.enabled = true;
            logClientActivity(clientId, 'action', 'Client marked as closed — ' + defaults[0] + (property ? ': ' + property : ''));
            logAuditEntry('client_closed', { clientName: c.name, closedType: defaults[0], property: property });
            // Re-render workspace
            openClientWorkspace(clientId);
            showToast(c.name + ' marked as closed', 'success');
        }

        function markClientActive(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            if (!confirm('Reactivate ' + c.name + '?')) return;
            c.clientStatus = 'active';
            c.closedDate = null;
            c.closedType = null;
            c.closedProperty = null;
            c.alertSettings.enabled = true;
            c.alertSettings.mode = 'manual';
            if (c.closedAlertSettings) c.closedAlertSettings.enabled = false;
            logClientActivity(clientId, 'action', 'Client reactivated');
            openClientWorkspace(clientId);
            showToast(c.name + ' reactivated', 'success');
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // WORKING WITH CLIENT — Search Results Banner
        // ═══════════════════════════════════════════════════════════════════════════════

        var workingWithClientId = null;

        function setWorkingClient(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            workingWithClientId = clientId;
            var banner = document.getElementById('workingWithClientBanner');
            var label = document.getElementById('workingClientLabel');
            var info = document.getElementById('workingClientInfo');
            if (banner) {
                banner.classList.remove('hidden');
                label.textContent = c.name;
                info.textContent = c.type + (c.budget ? ', ' + c.budget : '');
            }
        }

        function clearWorkingClient() {
            workingWithClientId = null;
            var banner = document.getElementById('workingWithClientBanner');
            if (banner) banner.classList.add('hidden');
        }

        // Override runClientSearch to set working client and switch to search tab
        var _origRunClientSearch = typeof runClientSearch === 'function' ? runClientSearch : null;

        // ═══════════════════════════════════════════════════════════════════════════════
        // CLIENT WORKSPACE — Activity Log
        // ═══════════════════════════════════════════════════════════════════════════════

        function logClientActivity(clientId, type, detail) {
            var c = customerDB[clientId];
            if (!c) return;
            if (!c._activityLog) c._activityLog = [];
            c._activityLog.unshift({
                type: type, // 'login' | 'view' | 'action' | 'search' | 'showing' | 'alert'
                detail: detail,
                date: new Date().toISOString().slice(0, 10),
                time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            });
            c.lastActivity = new Date().toISOString().slice(0, 10);
            // Re-render if workspace is open
            if (currentWorkspaceClientId === clientId) {
                renderActivityLog(c, document.querySelector('.activity-filter-btn.bg-blue-600') ? document.querySelector('.activity-filter-btn.bg-blue-600').dataset.filter : 'all');
            }
        }

        function renderActivityLog(c, filter, showAll) {
            var clientId = currentWorkspaceClientId;
            var COLLAPSED_LIMIT = 6;
            // Merge all activity sources
            var allActivity = [];

            (c.loginHistory || []).forEach(function(l) {
                allActivity.push({ type: 'login', detail: 'Logged in — ' + l.device + ' (' + l.duration + ')', date: l.date, time: l.time });
            });
            (c.viewHistory || []).forEach(function(v) {
                allActivity.push({ type: 'view', detail: 'Viewed ' + v.address + ' (' + v.duration + ') — from ' + v.source, date: v.date, time: v.time, listingId: v.listingId });
            });
            (c.showings || []).forEach(function(s) {
                allActivity.push({ type: 'showing', detail: 'Showing: ' + s.address + ' (' + s.type + ') — ' + s.status, date: s.date, time: s.time || '12:00 PM', showingId: s.id });
            });
            if (typeof getClientCollections === 'function') {
                var cols = getClientCollections(clientId);
                cols.forEach(function(col) {
                    if (col.sentAt) {
                        allActivity.push({ type: 'collection', detail: 'Collection "' + col.title + '" sent (' + col.items.length + ' listings)', date: col.sentAt.slice(0, 10), time: new Date(col.sentAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), collectionId: col.id });
                    }
                    allActivity.push({ type: 'collection', detail: 'Collection "' + col.title + '" created (' + col.status + ')', date: col.createdAt.slice(0, 10), time: new Date(col.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), collectionId: col.id });
                });
            }
            if (typeof __MallanMock !== 'undefined' && __MallanMock.DB && __MallanMock.DB.messages) {
                Object.keys(__MallanMock.DB.messages).forEach(function(mk) {
                    var msg = __MallanMock.DB.messages[mk];
                    var thread = __MallanMock.DB.threads[msg.threadId];
                    if (thread && thread.clientId === clientId) {
                        allActivity.push({ type: 'message', detail: (msg.senderType === 'agent' ? 'Sent' : 'Received') + ': "' + (msg.body || '').substring(0, 80) + (msg.body && msg.body.length > 80 ? '...' : '') + '"', date: msg.createdAt.slice(0, 10), time: new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) });
                    }
                });
            }
            (c._activityLog || []).forEach(function(a) { allActivity.push(a); });

            // Sort descending
            allActivity.sort(function(a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });

            // Filter
            if (filter && filter !== 'all') {
                var filterMap = { logins: 'login', views: 'view', actions: 'action', searches: 'search', alerts: 'alert', messages: 'message', collections: 'collection', showings: 'showing', reports: 'action' };
                var ft = filterMap[filter] || filter;
                if (filter === 'reports') {
                    allActivity = allActivity.filter(function(a) { return a.type === 'action' && a.detail && a.detail.indexOf('report') > -1; });
                } else {
                    allActivity = allActivity.filter(function(a) { return a.type === ft; });
                }
            }

            var iconMap = {
                login: '<i class="fas fa-sign-in-alt text-green-500"></i>',
                view: '<i class="fas fa-eye text-blue-500"></i>',
                action: '<i class="fas fa-hand-pointer text-purple-500"></i>',
                search: '<i class="fas fa-search text-amber-500"></i>',
                showing: '<i class="fas fa-calendar text-purple-500"></i>',
                alert: '<i class="fas fa-bell text-red-500"></i>',
                message: '<i class="fas fa-comment-dots text-indigo-500"></i>',
                collection: '<i class="fas fa-layer-group text-indigo-500"></i>'
            };

            // Date grouping helper
            function getDateGroup(dateStr) {
                var today = new Date().toISOString().slice(0, 10);
                var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
                var weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
                if (dateStr === today) return 'Today';
                if (dateStr === yesterday) return 'Yesterday';
                if (dateStr >= weekAgo) return 'This Week';
                return 'Earlier';
            }

            var html = '<div class="flex items-center justify-between mb-1"><span class="text-[9px] text-gray-400 font-medium" data-compliance="UCBA-Audit"><i class="fas fa-shield-alt mr-0.5"></i>UCBA Audit Trail · NY SHIELD Act · Data Access Logging</span></div>';
            html += '<h4 class="text-sm font-bold text-gray-700 mb-2"><i class="fas fa-history text-blue-500 mr-2"></i>Activity Log <span class="text-xs font-normal text-gray-400">(' + allActivity.length + ')</span></h4>';

            // Filter tabs
            html += '<div class="flex gap-1 mb-2 flex-wrap">';
            var filterList = ['all', 'messages', 'collections', 'showings', 'views', 'logins', 'actions', 'reports'];
            filterList.forEach(function(f) {
                var count = 0;
                if (f === 'all') count = allActivity.length;
                else if (f === 'messages') count = allActivity.filter(function(a) { return a.type === 'message'; }).length;
                else if (f === 'collections') count = allActivity.filter(function(a) { return a.type === 'collection'; }).length;
                else if (f === 'reports') count = allActivity.filter(function(a) { return a.type === 'action' && a.detail && a.detail.indexOf('report') > -1; }).length;
                else {
                    var fMap = { logins: 'login', views: 'view', actions: 'action', searches: 'search', alerts: 'alert', showings: 'showing' };
                    count = allActivity.filter(function(a) { return a.type === (fMap[f] || f); }).length;
                }
                html += '<button onclick="renderActivityLog(customerDB[\'' + clientId + '\'],\'' + f + '\')" class="activity-filter-btn px-2 py-0.5 rounded text-[10px] font-medium ' + (filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200') + '" data-filter="' + f + '">' + f.charAt(0).toUpperCase() + f.slice(1) + (count > 0 && f !== 'all' ? ' (' + count + ')' : '') + '</button>';
            });
            html += '</div>';

            if (!allActivity.length) {
                html += '<p class="text-xs text-gray-400 text-center py-3">No activity yet</p>';
            } else {
                // Determine how many to show
                var displayLimit = showAll ? allActivity.length : COLLAPSED_LIMIT;
                var displayItems = allActivity.slice(0, Math.min(displayLimit, allActivity.length));
                var hasMore = allActivity.length > COLLAPSED_LIMIT && !showAll;

                // Render with date grouping
                var lastGroup = '';
                html += '<div class="space-y-0.5">';
                displayItems.forEach(function(a) {
                    var group = getDateGroup(a.date);
                    if (group !== lastGroup) {
                        lastGroup = group;
                        html += '<div class="flex items-center gap-2 pt-2 pb-1"><span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">' + group + '</span><div class="flex-1 h-px bg-gray-200"></div></div>';
                    }
                    var linkHtml = '';
                    if (a.collectionId) linkHtml = ' <button onclick="switchWsContentTab(\'portfolio\');setTimeout(function(){viewCollectionDetail(\'' + a.collectionId + '\')},200)" class="text-blue-500 hover:underline text-[10px]">[view]</button>';
                    if (a.showingId) linkHtml = ' <button onclick="switchWsContentTab(\'search\')" class="text-purple-500 hover:underline text-[10px]">[view]</button>';
                    html += '<div class="flex items-start gap-2 text-xs py-1 border-b border-gray-50">';
                    html += '<span class="mt-0.5 flex-shrink-0">' + (iconMap[a.type] || '<i class="fas fa-circle text-gray-300"></i>') + '</span>';
                    html += '<div class="flex-1 min-w-0"><span class="text-gray-700">' + a.detail + '</span>' + linkHtml + '<br><span class="text-gray-400 text-[10px]">' + a.date + ' at ' + a.time + '</span></div>';
                    html += '</div>';
                });
                html += '</div>';

                // Show more / Show less button
                if (hasMore) {
                    html += '<button onclick="renderActivityLog(customerDB[\'' + clientId + '\'],\'' + (filter || 'all') + '\',true)" class="w-full mt-2 py-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium text-center border border-blue-200 rounded-lg hover:bg-blue-50"><i class="fas fa-chevron-down mr-1"></i>Show ' + (allActivity.length - COLLAPSED_LIMIT) + ' more entries</button>';
                } else if (showAll && allActivity.length > COLLAPSED_LIMIT) {
                    html += '<button onclick="renderActivityLog(customerDB[\'' + clientId + '\'],\'' + (filter || 'all') + '\')" class="w-full mt-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium text-center border rounded-lg hover:bg-gray-50"><i class="fas fa-chevron-up mr-1"></i>Show less</button>';
                }
            }

            var desktopEl = document.getElementById('wsActivityLogDesktop');
            if (desktopEl) desktopEl.innerHTML = html;
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // FINANCIAL READINESS (Overview Tab)
        // ═══════════════════════════════════════════════════════════════════════════════

        function renderFinancialReadiness(c) {
            var card = document.getElementById('wsFinancialReadinessCard');
            if (!card) return;
            var fr = c.financialReadiness;
            if (!fr) { card.classList.add('hidden'); return; }
            card.classList.remove('hidden');

            var checks = [
                { label: 'Financing Type', value: fr.type || 'Not set', icon: 'fa-university', ok: !!fr.type },
                { label: 'Lender', value: fr.lender || (fr.type === 'Cash' ? 'N/A — Cash' : 'Not assigned'), icon: 'fa-landmark', ok: !!fr.lender || fr.type === 'Cash' },
                { label: 'Proof of Funds', value: fr.proofOfFunds ? 'Verified' : 'Pending', icon: 'fa-file-invoice-dollar', ok: fr.proofOfFunds },
                { label: 'Attorney', value: fr.attorneyAssigned ? (fr.attorneyName || 'Assigned') : 'Not assigned', icon: 'fa-gavel', ok: fr.attorneyAssigned },
                { label: 'Entity Purchase', value: fr.entityPurchase || 'Personal', icon: 'fa-building', ok: true }
            ];
            var readyCount = checks.filter(function(ck) { return ck.ok; }).length;
            var readyPct = Math.round((readyCount / checks.length) * 100);
            var readyColor = readyPct >= 80 ? 'green' : readyPct >= 60 ? 'amber' : 'red';

            var html = '<div class="flex items-center justify-between mb-3">';
            html += '<h4 class="text-sm font-bold text-gray-700"><i class="fas fa-wallet text-green-500 mr-2"></i>Financial Readiness</h4>';
            html += '<span class="text-xs px-2 py-0.5 bg-' + readyColor + '-100 text-' + readyColor + '-700 rounded-full font-bold">' + readyPct + '%</span>';
            html += '</div>';
            html += '<div class="space-y-2">';
            checks.forEach(function(ck) {
                html += '<div class="flex items-center justify-between text-xs">';
                html += '<span class="text-gray-600"><i class="fas ' + ck.icon + ' w-4 text-center mr-2 text-gray-400"></i>' + ck.label + '</span>';
                html += '<span class="font-medium flex items-center gap-1 ' + (ck.ok ? 'text-gray-800' : 'text-red-600') + '">' + ck.value + ' <i class="fas ' + (ck.ok ? 'fa-check-circle text-green-500' : 'fa-times-circle text-red-400') + ' text-[10px]"></i></span>';
                html += '</div>';
            });
            html += '</div>';

            // Broker-only: edit button
            if (typeof LOGGED_IN_AGENT !== 'undefined' && LOGGED_IN_AGENT.role === 'broker') {
                html += '<button onclick="editFinancialReadiness(\'' + currentWorkspaceClientId + '\')" class="mt-3 w-full py-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium text-center border border-blue-200 rounded-lg hover:bg-blue-50"><i class="fas fa-edit mr-1"></i>Edit Financials</button>';
            }
            card.innerHTML = html;
        }

        function editFinancialReadiness(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            if (!c.financialReadiness) c.financialReadiness = {};
            var fr = c.financialReadiness;
            var type = prompt('Financing type (Cash / Conventional / FHA / VA / Jumbo):', fr.type || '');
            if (type !== null) fr.type = type;
            var lender = prompt('Lender name:', fr.lender || '');
            if (lender !== null) fr.lender = lender;
            fr.proofOfFunds = confirm('Proof of funds verified?');
            fr.attorneyAssigned = confirm('Attorney assigned?');
            if (fr.attorneyAssigned) {
                var atty = prompt('Attorney name:', fr.attorneyName || '');
                if (atty !== null) fr.attorneyName = atty;
            }
            var entity = prompt('Entity type (LLC / Trust / Personal / Corp):', fr.entityPurchase || 'Personal');
            if (entity !== null) fr.entityPurchase = entity;
            renderFinancialReadiness(c);
            showToast('Financial readiness updated', 'success');
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // NOTES INTELLIGENCE (Overview Tab)
        // ═══════════════════════════════════════════════════════════════════════════════

        function renderNotesIntelligence(c) {
            var card = document.getElementById('wsNotesIntelCard');
            if (!card) return;
            card.classList.remove('hidden');

            var notes = c.preferences ? c.preferences.notes : '';
            var activityLog = c._activityLog || [];
            var viewCount = (c.viewHistory || []).length;
            var likedCount = (c.portfolio || {}).liked || 0;
            var showingCount = (c.showings || []).length;
            var daysSince = 1;
            if (c.lastActivity) { daysSince = Math.max(1, Math.round((new Date() - new Date(c.lastActivity)) / (1000 * 60 * 60 * 24))); }

            // AI-generated summary based on available data
            var summaryPoints = [];
            if (viewCount > 5) summaryPoints.push('Highly active browser (' + viewCount + ' views in recent period)');
            else if (viewCount > 0) summaryPoints.push('Moderate browsing activity (' + viewCount + ' views)');
            else summaryPoints.push('Low browsing activity — may need engagement');

            if (likedCount > 0 && showingCount === 0) summaryPoints.push('Has liked ' + likedCount + ' listing' + (likedCount > 1 ? 's' : '') + ' but no showings scheduled — follow up');
            if (showingCount > 0) summaryPoints.push(showingCount + ' showing' + (showingCount > 1 ? 's' : '') + ' in pipeline');
            if (daysSince > 7) summaryPoints.push('Inactive for ' + daysSince + ' days — risk of going cold');
            else if (daysSince <= 2) summaryPoints.push('Very recent activity (' + daysSince + 'd ago) — keep momentum');

            // Objections / notes analysis
            var objections = [];
            if (notes) {
                if (notes.toLowerCase().indexOf('wait') !== -1 || notes.toLowerCase().indexOf('not ready') !== -1) objections.push('Timing hesitation noted in preferences');
                if (notes.toLowerCase().indexOf('price') !== -1 || notes.toLowerCase().indexOf('budget') !== -1) objections.push('Price sensitivity flagged');
                if (notes.toLowerCase().indexOf('investment') !== -1) objections.push('Investment-focused — emphasize yield/ROI');
                if (notes.toLowerCase().indexOf('renovation') !== -1) objections.push('Renovation preferences — factor in condition');
            }

            // Urgency signals
            var urgencySignals = [];
            if (c.preferences && c.preferences.moveInDate) {
                var moveIn = new Date(c.preferences.moveInDate);
                var daysUntilMove = Math.round((moveIn - new Date()) / (1000 * 60 * 60 * 24));
                if (daysUntilMove < 30) urgencySignals.push('Move-in date in ' + daysUntilMove + ' days — URGENT');
                else if (daysUntilMove < 90) urgencySignals.push('Move-in in ' + daysUntilMove + ' days — moderate urgency');
            }
            if (c.closeProbability && c.closeProbability >= 70) urgencySignals.push('High close probability (' + c.closeProbability + '%) — prioritize');

            var clientId = currentWorkspaceClientId;

            var html = '<h4 class="text-sm font-bold text-gray-700 mb-2"><i class="fas fa-brain text-purple-500 mr-2"></i>Notes & Intelligence</h4>';

            // Inline note entry form (Item 11)
            html += '<div class="mb-3 p-2 bg-purple-50 border border-purple-200 rounded-lg">';
            html += '<div class="flex gap-2">';
            html += '<input type="text" id="inlineNoteInput" placeholder="Add a note..." class="flex-1 text-xs border rounded px-2 py-1.5" onkeydown="if(event.key===\'Enter\')submitInlineNote(\'' + clientId + '\')">';
            html += '<select id="inlineNoteType" class="text-[10px] border rounded px-1.5 py-1">';
            html += '<option value="note">Note</option><option value="call">Call</option><option value="meeting">Meeting</option><option value="email">Email</option><option value="showing">Showing</option>';
            html += '</select>';
            html += '<button onclick="submitInlineNote(\'' + clientId + '\')" class="text-[10px] px-3 py-1 bg-purple-600 text-white rounded font-medium hover:bg-purple-700">Save</button>';
            html += '</div></div>';

            html += '<div class="space-y-2">';
            // Summary
            html += '<div class="text-xs"><p class="font-semibold text-gray-600 mb-1">30-Day Summary</p>';
            summaryPoints.forEach(function(pt) {
                html += '<p class="text-gray-700 py-0.5"><i class="fas fa-circle text-[4px] text-gray-400 mr-1.5 align-middle"></i>' + pt + '</p>';
            });
            html += '</div>';

            // Objections
            if (objections.length) {
                html += '<div class="text-xs border-t pt-2"><p class="font-semibold text-amber-700 mb-1"><i class="fas fa-exclamation-triangle text-amber-500 mr-1"></i>Flags from Notes</p>';
                objections.forEach(function(ob) {
                    html += '<p class="text-amber-800 py-0.5"><i class="fas fa-angle-right text-amber-400 mr-1"></i>' + ob + '</p>';
                });
                html += '</div>';
            }

            // Urgency
            if (urgencySignals.length) {
                html += '<div class="text-xs border-t pt-2"><p class="font-semibold text-red-700 mb-1"><i class="fas fa-clock text-red-500 mr-1"></i>Urgency Signals</p>';
                urgencySignals.forEach(function(us) {
                    html += '<p class="text-red-800 py-0.5"><i class="fas fa-bolt text-red-400 mr-1"></i>' + us + '</p>';
                });
                html += '</div>';
            }

            // Chronological notes timeline (Item 11)
            var clientNotes = (c._notes || []).slice().reverse(); // newest first
            html += '<div class="text-xs border-t pt-2">';
            html += '<p class="font-semibold text-gray-600 mb-1.5"><i class="fas fa-sticky-note text-amber-500 mr-1"></i>Notes Timeline (' + clientNotes.length + ')</p>';
            if (clientNotes.length === 0) {
                html += '<p class="text-[10px] text-gray-300 text-center py-3">No notes yet — add one above</p>';
            } else {
                var noteTypeIcons = { note: 'fa-sticky-note text-amber-500', call: 'fa-phone text-green-500', meeting: 'fa-users text-blue-500', email: 'fa-envelope text-indigo-500', showing: 'fa-door-open text-purple-500' };
                clientNotes.slice(0, 10).forEach(function(n) {
                    var icon = noteTypeIcons[n.type] || noteTypeIcons.note;
                    html += '<div class="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">';
                    html += '<i class="fas ' + icon + ' text-[10px] mt-0.5 flex-shrink-0"></i>';
                    html += '<div class="flex-1 min-w-0">';
                    html += '<p class="text-gray-700 leading-tight">' + n.text + '</p>';
                    html += '<p class="text-[9px] text-gray-400 mt-0.5">' + n.date + ' ' + n.time + ' · ' + (n.type || 'note') + '</p>';
                    html += '</div>';
                    html += '<button onclick="deleteClientNote(\'' + clientId + '\',\'' + n.id + '\')" class="text-gray-200 hover:text-red-400 text-[9px] flex-shrink-0"><i class="fas fa-times"></i></button>';
                    html += '</div>';
                });
                if (clientNotes.length > 10) {
                    html += '<p class="text-[9px] text-gray-400 text-center pt-1">+ ' + (clientNotes.length - 10) + ' older notes</p>';
                }
            }
            html += '</div>';

            html += '</div>';
            card.innerHTML = html;
        }

        function submitInlineNote(clientId) {
            var c = customerDB[clientId];
            if (!c) return;
            var input = document.getElementById('inlineNoteInput');
            var typeSelect = document.getElementById('inlineNoteType');
            var text = input ? input.value.trim() : '';
            if (!text) { if (input) input.focus(); return; }
            var noteType = typeSelect ? typeSelect.value : 'note';
            if (!c._notes) c._notes = [];
            c._notes.push({
                id: 'note-' + Date.now(),
                text: text,
                type: noteType,
                date: new Date().toISOString().slice(0, 10),
                time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                author: LOGGED_IN_AGENT.name
            });
            logClientActivity(clientId, 'action', 'Note (' + noteType + '): ' + text);
            renderNotesIntelligence(c);
            showToast('Note saved', 'success');
        }

        function deleteClientNote(clientId, noteId) {
            var c = customerDB[clientId];
            if (!c || !c._notes) return;
            c._notes = c._notes.filter(function(n) { return n.id !== noteId; });
            renderNotesIntelligence(c);
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // CRITERIA VERSION HISTORY (Search & Match Tab)
        // ═══════════════════════════════════════════════════════════════════════════════

        function renderCriteriaHistory(c) {
            var card = document.getElementById('wsCriteriaHistory');
            if (!card) return;
            var history = c.criteriaHistory || [];
            if (!history.length) { card.classList.add('hidden'); return; }
            card.classList.remove('hidden');

            var html = '<h4 class="text-sm font-bold text-gray-700 mb-2"><i class="fas fa-history text-blue-500 mr-2"></i>Criteria Changes <span class="text-xs font-normal text-gray-400">(' + history.length + ')</span></h4>';
            html += '<div class="space-y-1.5">';
            // Sort newest first
            var sorted = history.slice().sort(function(a, b) { return b.date.localeCompare(a.date); });
            sorted.forEach(function(h) {
                var changedByIcon = h.changedBy === 'client' ? '<i class="fas fa-user text-blue-500 mr-1" title="Changed by client"></i>' : '<i class="fas fa-user-tie text-amber-500 mr-1" title="Changed by agent"></i>';
                html += '<div class="flex items-start gap-2 text-xs py-1.5 border-b border-gray-100">';
                html += '<span class="text-gray-400 text-[10px] flex-shrink-0 mt-0.5 w-16">' + h.date + '</span>';
                html += '<div class="flex-1 min-w-0">';
                html += '<span class="font-medium text-gray-700">' + changedByIcon + h.field + '</span>';
                html += '<div class="flex items-center gap-1 mt-0.5"><span class="line-through text-gray-400">' + h.oldVal + '</span><i class="fas fa-arrow-right text-[8px] text-gray-300"></i><span class="font-medium text-green-700">' + h.newVal + '</span></div>';
                html += '</div></div>';
            });
            html += '</div>';
            card.innerHTML = html;
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // NEIGHBORHOOD HEATMAP (Search & Match Tab)
        // ═══════════════════════════════════════════════════════════════════════════════

        function renderNeighborhoodHeatmap(c) {
            var card = document.getElementById('wsNeighborhoodHeatmap');
            if (!card) return;

            // Build area stats from view history + portfolio + showings
            var areaStats = {};
            (c.viewHistory || []).forEach(function(v) {
                var area = extractAreaFromAddress(v.address);
                if (!areaStats[area]) areaStats[area] = { views: 0, likes: 0, showings: 0 };
                areaStats[area].views++;
            });
            (c.portfolio && c.portfolio.listings || []).forEach(function(l) {
                var area = extractAreaFromAddress(l.address);
                if (!areaStats[area]) areaStats[area] = { views: 0, likes: 0, showings: 0 };
                if (l.status === 'liked') areaStats[area].likes++;
            });
            (c.showings || []).forEach(function(s) {
                var area = extractAreaFromAddress(s.address);
                if (!areaStats[area]) areaStats[area] = { views: 0, likes: 0, showings: 0 };
                areaStats[area].showings++;
            });

            // Also add preferred neighborhoods with 0 activity
            (c.preferences && c.preferences.neighborhoods || []).forEach(function(n) {
                if (!areaStats[n]) areaStats[n] = { views: 0, likes: 0, showings: 0 };
            });

            var areas = Object.keys(areaStats);
            if (!areas.length) { card.classList.add('hidden'); return; }
            card.classList.remove('hidden');

            // Calculate heat per area
            var maxScore = 1;
            areas.forEach(function(a) {
                var s = areaStats[a];
                s.score = s.views + (s.likes * 3) + (s.showings * 5);
                if (s.score > maxScore) maxScore = s.score;
            });

            var html = '<h4 class="text-sm font-bold text-gray-700 mb-2"><i class="fas fa-map-marked-alt text-red-500 mr-2"></i>Area Interest Heatmap</h4>';
            html += '<div class="space-y-1.5">';
            // Sort by score descending
            areas.sort(function(a, b) { return areaStats[b].score - areaStats[a].score; });
            areas.forEach(function(a) {
                var s = areaStats[a];
                var pct = Math.round((s.score / maxScore) * 100);
                var barColor = pct >= 70 ? 'bg-red-400' : pct >= 40 ? 'bg-amber-400' : 'bg-blue-300';
                html += '<div class="text-xs">';
                html += '<div class="flex items-center justify-between mb-0.5"><span class="font-medium text-gray-700">' + a + '</span><span class="text-gray-400">' + s.views + 'v / ' + s.likes + 'L / ' + s.showings + 's</span></div>';
                html += '<div class="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden"><div class="h-full ' + barColor + ' rounded-full transition-all" style="width:' + pct + '%"></div></div>';
                html += '</div>';
            });
            html += '</div>';
            card.innerHTML = html;
        }

        function extractAreaFromAddress(address) {
            if (!address) return 'Unknown';
            var areaMap = {
                'Park Ave': 'Upper East Side', 'Fifth Ave': 'Upper East Side', 'Madison Ave': 'Upper East Side',
                'CPW': 'Central Park West', 'CPS': 'Central Park South', 'Central Park': 'Central Park South',
                'Hudson': 'Hudson Yards', 'Tribeca': 'Tribeca', 'FiDi': 'FiDi',
                'Broadway': 'Midtown', 'Lex': 'Upper East Side', 'Sutton': 'Midtown East'
            };
            for (var key in areaMap) {
                if (address.indexOf(key) !== -1) return areaMap[key];
            }
            return 'Other';
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // PREFERENCE DRIFT DETECTION (Portfolio Tab)
        // ═══════════════════════════════════════════════════════════════════════════════

        function renderPreferenceDrift(c) {
            var card = document.getElementById('wsPreferenceDriftCard');
            if (!card) return;

            var prefs = c.preferences || {};
            var portfolio = (c.portfolio && c.portfolio.listings) || [];
            var likedListings = portfolio.filter(function(l) { return l.status === 'liked'; });

            if (!likedListings.length && !(c.viewHistory || []).length) { card.classList.add('hidden'); return; }
            card.classList.remove('hidden');

            var drifts = [];

            // Check if liked listings are outside stated price range
            if (prefs.maxPrice) {
                var overBudget = likedListings.filter(function(l) {
                    var p = parseInt(l.price.replace(/[^0-9]/g, ''));
                    return p > prefs.maxPrice * 1.1; // 10% tolerance
                });
                if (overBudget.length) drifts.push({ type: 'price', icon: 'fa-dollar-sign', color: 'amber', text: 'Liked ' + overBudget.length + ' listing' + (overBudget.length > 1 ? 's' : '') + ' above stated budget', action: 'Consider raising max price' });
            }

            // Check if viewing outside stated neighborhoods
            var statedAreas = (prefs.neighborhoods || []).map(function(n) { return n.toLowerCase(); });
            if (statedAreas.length) {
                var outsideViews = (c.viewHistory || []).filter(function(v) {
                    var area = extractAreaFromAddress(v.address).toLowerCase();
                    return statedAreas.indexOf(area) === -1;
                });
                if (outsideViews.length > 2) drifts.push({ type: 'area', icon: 'fa-map-marker-alt', color: 'blue', text: 'Viewed ' + outsideViews.length + ' listings outside stated areas', action: 'Expand neighborhood criteria' });
            }

            // Check showing pattern vs preferences
            var showings = c.showings || [];
            if (showings.length >= 2 && prefs.mustHaves && prefs.mustHaves.length) {
                drifts.push({ type: 'behavior', icon: 'fa-random', color: 'purple', text: 'Touring pattern suggests flexibility on must-haves', action: 'Reassess hard requirements' });
            }

            // If criteria changed recently but behavior didn't match
            if ((c.criteriaHistory || []).length > 2) {
                drifts.push({ type: 'criteria', icon: 'fa-redo', color: 'gray', text: 'Criteria changed ' + c.criteriaHistory.length + ' times — preferences may be evolving', action: 'Schedule preference review meeting' });
            }

            var html = '<h4 class="text-sm font-bold text-gray-700 mb-2"><i class="fas fa-exchange-alt text-purple-500 mr-2"></i>Preference Drift Detection</h4>';
            if (!drifts.length) {
                html += '<p class="text-xs text-gray-400 text-center py-3"><i class="fas fa-check-circle text-green-400 mr-1"></i>No drift detected — behavior matches stated preferences</p>';
            } else {
                html += '<div class="space-y-2">';
                drifts.forEach(function(d) {
                    html += '<div class="p-2 bg-' + d.color + '-50 rounded-lg border border-' + d.color + '-200">';
                    html += '<div class="flex items-start gap-2 text-xs">';
                    html += '<i class="fas ' + d.icon + ' text-' + d.color + '-500 mt-0.5"></i>';
                    html += '<div class="flex-1"><p class="font-medium text-' + d.color + '-800">' + d.text + '</p>';
                    html += '<p class="text-' + d.color + '-600 mt-0.5"><i class="fas fa-lightbulb text-[10px] mr-1"></i>' + d.action + '</p>';
                    html += '</div></div></div>';
                });
                html += '</div>';
            }
            card.innerHTML = html;
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // PORTFOLIO TIMELINE (Portfolio Tab)
        // ═══════════════════════════════════════════════════════════════════════════════

        function renderPortfolioTimeline(c) {
            var card = document.getElementById('wsPortfolioTimeline');
            if (!card) return;

            var portfolio = (c.portfolio && c.portfolio.listings) || [];
            if (!portfolio.length) { card.classList.add('hidden'); return; }
            card.classList.remove('hidden');

            // Build timeline events from portfolio
            var events = [];
            portfolio.forEach(function(l) {
                events.push({ date: l.addedDate || '2026-01-01', type: 'added', address: l.address, status: l.status });
                if (l.status === 'liked') events.push({ date: l.addedDate || '2026-01-01', type: 'liked', address: l.address });
                if (l.status === 'disliked') events.push({ date: l.addedDate || '2026-01-01', type: 'disliked', address: l.address });
            });
            // Add showings to timeline
            (c.showings || []).forEach(function(s) {
                events.push({ date: s.date, type: 'showing', address: s.address, status: s.status });
            });

            // Sort by date descending
            events.sort(function(a, b) { return b.date.localeCompare(a.date); });

            var typeIcons = {
                added: '<i class="fas fa-plus-circle text-blue-500"></i>',
                liked: '<i class="fas fa-heart text-red-500"></i>',
                disliked: '<i class="fas fa-thumbs-down text-gray-400"></i>',
                showing: '<i class="fas fa-calendar-check text-purple-500"></i>',
                removed: '<i class="fas fa-minus-circle text-red-400"></i>'
            };
            var typeLabels = { added: 'Added to portfolio', liked: 'Liked', disliked: 'Disliked', showing: 'Showing', removed: 'Removed' };

            var html = '<h4 class="text-sm font-bold text-gray-700 mb-2"><i class="fas fa-stream text-blue-500 mr-2"></i>Portfolio Timeline <span class="text-xs font-normal text-gray-400">(' + events.length + ')</span></h4>';
            html += '<div class="relative pl-4 border-l-2 border-gray-200 space-y-2 max-h-48 overflow-y-auto">';
            events.slice(0, 15).forEach(function(e) {
                html += '<div class="relative text-xs">';
                html += '<div class="absolute -left-[21px] top-0.5 w-3 h-3 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center text-[8px]">' + (typeIcons[e.type] ? '' : '') + '</div>';
                html += '<div class="flex items-center gap-2">';
                html += '<span class="flex-shrink-0">' + (typeIcons[e.type] || '<i class="fas fa-circle text-gray-300"></i>') + '</span>';
                html += '<span class="font-medium text-gray-700">' + (typeLabels[e.type] || e.type) + '</span>';
                html += '<span class="text-gray-500 truncate">' + e.address + '</span>';
                html += '<span class="text-gray-400 text-[10px] flex-shrink-0 ml-auto">' + e.date + '</span>';
                html += '</div></div>';
            });
            if (events.length > 15) {
                html += '<p class="text-[10px] text-gray-400 text-center pt-1">+ ' + (events.length - 15) + ' more events</p>';
            }
            html += '</div>';
            card.innerHTML = html;
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // RESPONSE TIME METRICS (Activity Tab)
        // ═══════════════════════════════════════════════════════════════════════════════

        function renderResponseMetrics(c) {
            var card = document.getElementById('wsResponseMetrics');
            if (!card) return;
            var rm = c.responseMetrics;
            if (!rm) { card.classList.add('hidden'); return; }
            card.classList.remove('hidden');

            var ghostColors = { low: 'green', medium: 'amber', high: 'red' };
            var ghostLabels = { low: 'Low Risk', medium: 'Monitor', high: 'At Risk' };
            var ghostColor = ghostColors[rm.ghostRisk] || 'gray';

            // Days since last reply
            var daysSinceReply = 0;
            if (rm.lastReplyDate) {
                daysSinceReply = Math.max(0, Math.round((new Date() - new Date(rm.lastReplyDate)) / (1000 * 60 * 60 * 24)));
            }
            var replyColor = daysSinceReply > 7 ? 'red' : daysSinceReply > 3 ? 'amber' : 'green';

            var html = '<h4 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-tachometer-alt text-blue-500 mr-2"></i>Response Metrics</h4>';
            html += '<div class="grid grid-cols-2 gap-2">';
            // Avg reply time
            html += '<div class="bg-blue-50 rounded-lg p-2.5 text-center">';
            html += '<i class="fas fa-reply text-blue-500 block mb-1 text-sm"></i>';
            html += '<span class="text-lg font-bold text-blue-700">' + rm.avgReplyHours + 'h</span>';
            html += '<span class="block text-[10px] text-blue-600">Avg Reply Time</span>';
            html += '</div>';
            // Avg feedback days
            html += '<div class="bg-purple-50 rounded-lg p-2.5 text-center">';
            html += '<i class="fas fa-comment-dots text-purple-500 block mb-1 text-sm"></i>';
            html += '<span class="text-lg font-bold text-purple-700">' + rm.avgFeedbackDays + 'd</span>';
            html += '<span class="block text-[10px] text-purple-600">Avg Feedback Time</span>';
            html += '</div>';
            // Days since last reply
            html += '<div class="bg-' + replyColor + '-50 rounded-lg p-2.5 text-center">';
            html += '<i class="fas fa-clock text-' + replyColor + '-500 block mb-1 text-sm"></i>';
            html += '<span class="text-lg font-bold text-' + replyColor + '-700">' + daysSinceReply + 'd</span>';
            html += '<span class="block text-[10px] text-' + replyColor + '-600">Since Last Reply</span>';
            html += '</div>';
            // Ghost risk
            html += '<div class="bg-' + ghostColor + '-50 rounded-lg p-2.5 text-center">';
            html += '<i class="fas fa-ghost text-' + ghostColor + '-500 block mb-1 text-sm"></i>';
            html += '<span class="text-lg font-bold text-' + ghostColor + '-700">' + (ghostLabels[rm.ghostRisk] || 'N/A') + '</span>';
            html += '<span class="block text-[10px] text-' + ghostColor + '-600">Ghost Risk</span>';
            html += '</div>';
            html += '</div>';
            card.innerHTML = html;
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // COMMUNICATION BREAKDOWN (Activity Tab)
        // ═══════════════════════════════════════════════════════════════════════════════

        function renderCommunicationBreakdown(c) {
            var card = document.getElementById('wsCommunicationBreakdown');
            if (!card) return;
            card.classList.remove('hidden');

            // Count communications by channel
            var channels = { email: 0, portal: 0, sms: 0, phone: 0 };

            // Count from activity log
            (c._activityLog || []).forEach(function(a) {
                if (a.type === 'message') {
                    if (a.detail && a.detail.indexOf('SMS') !== -1) channels.sms++;
                    else if (a.detail && a.detail.indexOf('call') !== -1) channels.phone++;
                    else channels.email++;
                }
            });

            // Count login/views as portal engagement
            channels.portal = (c.loginHistory || []).length + (c.viewHistory || []).length;

            // Count sends/collections as email
            channels.email += (c.sendHistory || []).length;

            var total = channels.email + channels.portal + channels.sms + channels.phone;
            if (total === 0) total = 1; // prevent division by zero

            var channelData = [
                { name: 'Email', count: channels.email, pct: Math.round((channels.email / total) * 100), color: 'blue', icon: 'fa-envelope' },
                { name: 'Portal', count: channels.portal, pct: Math.round((channels.portal / total) * 100), color: 'purple', icon: 'fa-globe' },
                { name: 'SMS', count: channels.sms, pct: Math.round((channels.sms / total) * 100), color: 'green', icon: 'fa-sms' },
                { name: 'Phone', count: channels.phone, pct: Math.round((channels.phone / total) * 100), color: 'amber', icon: 'fa-phone' }
            ];

            var html = '<h4 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-chart-pie text-indigo-500 mr-2"></i>Communication Breakdown</h4>';
            html += '<div class="space-y-2">';
            channelData.forEach(function(ch) {
                html += '<div class="text-xs">';
                html += '<div class="flex items-center justify-between mb-0.5">';
                html += '<span class="font-medium text-gray-700"><i class="fas ' + ch.icon + ' text-' + ch.color + '-500 mr-1.5 w-4 text-center"></i>' + ch.name + '</span>';
                html += '<span class="text-gray-500">' + ch.count + ' <span class="text-gray-400">(' + ch.pct + '%)</span></span>';
                html += '</div>';
                html += '<div class="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden"><div class="h-full bg-' + ch.color + '-400 rounded-full" style="width:' + ch.pct + '%"></div></div>';
                html += '</div>';
            });
            html += '</div>';

            // Preferred channel recommendation
            var preferred = channelData.sort(function(a, b) { return b.count - a.count; })[0];
            html += '<div class="mt-3 p-2 bg-gray-50 rounded-lg text-xs text-gray-600"><i class="fas fa-lightbulb text-amber-500 mr-1"></i>Preferred channel: <span class="font-medium">' + preferred.name + '</span> (' + preferred.pct + '% of interactions)</div>';

            card.innerHTML = html;
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // MESSAGES PANEL — Item 12: Communication threading
        // ═══════════════════════════════════════════════════════════════════════════════

        function renderMessagesPanel(c) {
            var panel = document.getElementById('wsMessagesPanel');
            if (!panel) return;
            var clientId = currentWorkspaceClientId;

            // Gather threads and messages from __MallanMock
            var threads = [];
            var allMessages = [];
            if (typeof __MallanMock !== 'undefined' && __MallanMock.DB) {
                var tKeys = Object.keys(__MallanMock.DB.threads || {});
                for (var ti = 0; ti < tKeys.length; ti++) {
                    var thread = __MallanMock.DB.threads[tKeys[ti]];
                    if (thread.clientId === clientId) threads.push(thread);
                }
                var mKeys = Object.keys(__MallanMock.DB.messages || {});
                for (var mi = 0; mi < mKeys.length; mi++) {
                    var msg = __MallanMock.DB.messages[mKeys[mi]];
                    var msgThread = __MallanMock.DB.threads[msg.threadId];
                    if (msgThread && msgThread.clientId === clientId) {
                        allMessages.push({ msg: msg, thread: msgThread });
                    }
                }
            }

            // Sort messages by date, newest first
            allMessages.sort(function(a, b) { return (b.msg.createdAt || '').localeCompare(a.msg.createdAt || ''); });

            var html = '<div class="flex items-center justify-between mb-3">';
            html += '<h4 class="text-sm font-bold text-gray-700"><i class="fas fa-comment-dots text-indigo-500 mr-2"></i>Messages <span class="text-xs font-normal text-gray-400">(' + allMessages.length + ')</span></h4>';
            html += '<span class="text-[10px] text-gray-400">' + threads.length + ' thread' + (threads.length !== 1 ? 's' : '') + '</span>';
            html += '</div>';

            // Compose form
            html += '<div class="mb-3 p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg">';
            html += '<div class="flex gap-2">';
            html += '<input type="text" id="msgComposeInput" placeholder="Type a message to ' + (c.name || 'client') + '..." class="flex-1 text-xs border rounded px-2.5 py-1.5" onkeydown="if(event.key===\'Enter\')sendInlineMessage(\'' + clientId + '\')">';
            html += '<button onclick="sendInlineMessage(\'' + clientId + '\')" class="text-[10px] px-3 py-1.5 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 flex-shrink-0"><i class="fas fa-paper-plane mr-1"></i>Send</button>';
            html += '</div></div>';

            // Message thread display
            if (allMessages.length === 0) {
                html += '<div class="text-center text-[10px] text-gray-300 py-6"><i class="fas fa-comments text-2xl mb-2"></i><br>No messages yet — send one above</div>';
            } else {
                html += '<div class="space-y-2 max-h-80 overflow-y-auto">';
                allMessages.forEach(function(item) {
                    var m = item.msg;
                    var isAgent = m.senderType === 'agent';
                    var time = m.createdAt ? new Date(m.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

                    html += '<div class="flex ' + (isAgent ? 'justify-end' : 'justify-start') + '">';
                    html += '<div class="max-w-[75%] rounded-lg p-2.5 ' + (isAgent ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-800') + '">';
                    html += '<p class="text-xs leading-relaxed">' + (m.body || '') + '</p>';
                    html += '<div class="flex items-center justify-between mt-1 gap-2">';
                    html += '<span class="text-[9px] ' + (isAgent ? 'text-indigo-200' : 'text-gray-400') + '">' + time + '</span>';
                    if (isAgent) {
                        html += '<span class="text-[9px] ' + (m.readAt ? 'text-indigo-200' : 'text-indigo-300') + '">' + (m.readAt ? '<i class="fas fa-check-double"></i> Read' : '<i class="fas fa-check"></i> Sent') + '</span>';
                    }
                    html += '</div></div></div>';
                });
                html += '</div>';
            }

            panel.innerHTML = html;
        }
