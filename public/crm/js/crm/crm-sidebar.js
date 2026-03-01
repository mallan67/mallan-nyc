// ============================================
// ALL SEARCH-RELATED JS FROM MOCKUP
// ============================================
        // Market Activity Toggle Function (Sales vs Rentals)
        function toggleMarketType(type) {
            var btnSales = document.getElementById('btnMarketSales');
            var btnRentals = document.getElementById('btnMarketRentals');
            var salesResults = document.getElementById('marketSalesResults');
            var rentalResults = document.getElementById('marketRentalResults');
            var salesOptions = document.getElementById('marketSalesOptions');
            var rentalOptions = document.getElementById('marketRentalOptions');
            var priceLabel = document.getElementById('marketPriceLabel');

            if (type === 'sales') {
                // Button styling
                btnSales.classList.remove('bg-gray-200', 'text-gray-700');
                btnSales.classList.add('bg-blue-600', 'text-white');
                btnRentals.classList.remove('bg-blue-600', 'text-white');
                btnRentals.classList.add('bg-gray-200', 'text-gray-700');

                // Show sales, hide rentals
                salesResults.style.display = 'block';
                rentalResults.style.display = 'none';
                salesOptions.style.display = 'block';
                rentalOptions.style.display = 'none';

                // Update price label
                priceLabel.textContent = 'Price';
            } else {
                // Button styling
                btnRentals.classList.remove('bg-gray-200', 'text-gray-700');
                btnRentals.classList.add('bg-blue-600', 'text-white');
                btnSales.classList.remove('bg-blue-600', 'text-white');
                btnSales.classList.add('bg-gray-200', 'text-gray-700');

                // Show rentals, hide sales
                rentalResults.style.display = 'block';
                salesResults.style.display = 'none';
                rentalOptions.style.display = 'block';
                salesOptions.style.display = 'none';

                // Update price label
                priceLabel.textContent = 'Monthly Rent';
            }
        }

        // Agent Management Sub-Tab Navigation
        function showAgentSection(sectionId, btn) {
            // Hide all sections
            document.querySelectorAll('.agent-mgmt-section').forEach(s => s.style.display = 'none');
            // Show selected
            document.getElementById('section-' + sectionId).style.display = 'block';
            // Update tab styles
            document.querySelectorAll('.agent-mgmt-tab').forEach(t => {
                t.className = 'agent-mgmt-tab px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-200 flex items-center gap-2';
            });
            if (btn) btn.className = 'agent-mgmt-tab px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2';
        }

        // Called from sidebar — finds the matching tab button and activates it
        function showAgentSectionFromSidebar(sectionId) {
            setTimeout(function() {
                var tabs = document.querySelectorAll('.agent-mgmt-tab');
                var matchBtn = null;
                tabs.forEach(function(t) {
                    if (t.getAttribute('onclick') && t.getAttribute('onclick').indexOf(sectionId) !== -1) matchBtn = t;
                });
                showAgentSection(sectionId, matchBtn);
            }, 50);
        }

        // ══════ COMMISSION SPLITS — EDIT / DELETE ══════
        function editCommissionRow(btn){var row=btn.closest('tr');row.querySelectorAll('.commission-input').forEach(function(inp){inp.dataset.originalValue=inp.value;inp.disabled=false;inp.classList.remove('bg-gray-50');inp.classList.add('bg-white','ring-2','ring-blue-200')});row.classList.add('bg-blue-50');row.querySelector('.edit-comm-btn').classList.add('hidden');row.querySelector('.save-comm-btn').classList.remove('hidden');row.querySelector('.cancel-comm-btn').classList.remove('hidden')}
        function saveCommissionRow(btn){var row=btn.closest('tr');row.querySelectorAll('.commission-input').forEach(function(inp){inp.disabled=true;inp.classList.add('bg-gray-50');inp.classList.remove('bg-white','ring-2','ring-blue-200');delete inp.dataset.originalValue});row.classList.remove('bg-blue-50');row.classList.add('bg-green-50');setTimeout(function(){row.classList.remove('bg-green-50')},1500);row.querySelector('.edit-comm-btn').classList.remove('hidden');row.querySelector('.save-comm-btn').classList.add('hidden');row.querySelector('.cancel-comm-btn').classList.add('hidden')}
        function cancelCommissionEdit(btn){var row=btn.closest('tr');row.querySelectorAll('.commission-input').forEach(function(inp){if(inp.dataset.originalValue!==undefined){inp.value=inp.dataset.originalValue;delete inp.dataset.originalValue}inp.disabled=true;inp.classList.add('bg-gray-50');inp.classList.remove('bg-white','ring-2','ring-blue-200')});row.classList.remove('bg-blue-50');row.querySelector('.edit-comm-btn').classList.remove('hidden');row.querySelector('.save-comm-btn').classList.add('hidden');row.querySelector('.cancel-comm-btn').classList.add('hidden')}
        function deleteCommissionRow(btn){var row=btn.closest('tr');var name=row.querySelector('.font-semibold').textContent;var cell=row.querySelector('td:last-child');cell.dataset.originalHtml=cell.innerHTML;cell.innerHTML='<div class="flex items-center gap-2 text-xs"><span class="text-gray-700 font-medium">Remove '+name+'?</span><button onclick="confirmDeleteCommission(this)" class="px-2 py-1 bg-red-600 text-white rounded text-xs font-semibold hover:bg-red-700">Yes</button><button onclick="cancelDeleteCommission(this)" class="px-2 py-1 border rounded text-xs font-semibold hover:bg-gray-50">No</button></div>';row.classList.add('bg-red-50')}
        function confirmDeleteCommission(btn){var row=btn.closest('tr');row.style.transition='opacity 0.3s';row.style.opacity='0';setTimeout(function(){row.remove()},300)}
        function cancelDeleteCommission(btn){var row=btn.closest('tr');var cell=row.querySelector('td:last-child');cell.innerHTML=cell.dataset.originalHtml;delete cell.dataset.originalHtml;row.classList.remove('bg-red-50')}

        // ══════ REFERRAL TRACKING — DELETE ══════
        function deleteReferralRow(btn){var row=btn.closest('tr');var cell=row.querySelector('td:last-child');cell.dataset.originalHtml=cell.innerHTML;cell.innerHTML='<div class="flex items-center gap-2 text-xs"><span class="text-gray-700">Delete?</span><button onclick="confirmDeleteReferral(this)" class="px-2 py-0.5 bg-gray-800 text-white rounded text-xs font-semibold hover:bg-gray-900">Yes</button><button onclick="cancelDeleteReferral(this)" class="px-2 py-0.5 border rounded text-xs font-semibold hover:bg-gray-50">No</button></div>';row.classList.add('bg-red-50')}
        function confirmDeleteReferral(btn){var row=btn.closest('tr');row.style.transition='opacity 0.3s';row.style.opacity='0';setTimeout(function(){row.remove()},300)}
        function cancelDeleteReferral(btn){var row=btn.closest('tr');var cell=row.querySelector('td:last-child');cell.innerHTML=cell.dataset.originalHtml;delete cell.dataset.originalHtml;row.classList.remove('bg-red-50')}

        // ══════ MARKETING HUB ══════
        function showMarketingSubTab(tabId) {
            // Hide all panels
            document.querySelectorAll('.mkt-panel').forEach(function(p){ p.classList.add('hidden'); });
            // Show target
            var target = document.getElementById(tabId);
            if (target) target.classList.remove('hidden');
            // Update tab buttons
            document.querySelectorAll('.mkt-sub-tab').forEach(function(btn){
                btn.classList.remove('active','border-gray-900','text-gray-900');
                btn.classList.add('border-transparent','text-gray-500');
            });
            var suffix = tabId.replace('mkt-','');
            var activeTab = document.getElementById('mktTab-' + suffix);
            if (activeTab) {
                activeTab.classList.add('active','border-gray-900','text-gray-900');
                activeTab.classList.remove('border-transparent','text-gray-500');
            }
        }

        function selectCampaignType(type) {
            var marketPanel = document.getElementById('campaignMarketPanel');
            var listingPicker = document.getElementById('campaignListingPicker');
            if (type === 'market-conditions') {
                marketPanel.classList.remove('hidden');
                listingPicker.classList.add('hidden');
            } else if (type === 'custom') {
                marketPanel.classList.add('hidden');
                listingPicker.classList.add('hidden');
            } else {
                marketPanel.classList.add('hidden');
                listingPicker.classList.remove('hidden');
            }
        }

        function toggleAllCampaignListings(selectAll) {
            document.querySelectorAll('.campaign-listing-check').forEach(function(cb){ cb.checked = selectAll; });
            updateCampaignListingCount();
        }

        function updateCampaignListingCount() {
            var count = document.querySelectorAll('.campaign-listing-check:checked').length;
            var el = document.getElementById('campaignListingCount');
            if (el) el.textContent = count + ' selected';
        }

        function previewCampaign() {
            var subject = document.getElementById('campaignSubject').value || 'New Listing from Mallan Real Estate';
            var audiences = [];
            document.querySelectorAll('.campaign-audience:checked').forEach(function(cb){ audiences.push(cb.value); });
            var listings = document.querySelectorAll('.campaign-listing-check:checked').length;
            var tpl = document.getElementById('campaignTemplate').value;
            var msg = 'CAMPAIGN PREVIEW\n\nSubject: ' + subject + '\nTemplate: ' + tpl + '\nAudience: ' + (audiences.length ? audiences.join(', ') : 'None selected') + '\nListings: ' + listings + '\n\nIncludes:\n• Broker attribution: Mallan Real Estate Inc. #10991205323\n• Equal Housing Opportunity logo\n• REBNY RLS data attribution & last-updated timestamp\n• CAN-SPAM unsubscribe link\n• Fair Housing compliant language';
            showToast(msg, 'info');
        }

        function sendCampaign() {
            var audiences = [];
            document.querySelectorAll('.campaign-audience:checked').forEach(function(cb){ audiences.push(cb.value); });
            if (audiences.length === 0) { showToast('Please select at least one audience.', 'warning'); return; }
            var sendingEmail = document.getElementById('campaignSendingEmail').value;
            var banner = document.getElementById('campaignSentBanner');
            if (banner) {
                banner.classList.remove('hidden');
                banner.querySelector('p.text-xs').textContent = 'Sending from ' + sendingEmail + ' via SendGrid. Batch delivery in progress. Track results in the Performance tab.';
            }
            window.scrollTo({ top: banner.offsetTop - 100, behavior: 'smooth' });
        }

        function updateRecipientCount() {
            var audienceCounts = {
                'rebny-agents': 11847,
                'my-agents': 3,
                'buyers': 48,
                'sellers': 12,
                'renters': 86,
                'landlords': 22,
                'investors': 34,
                'leads': 289
            };
            var total = 0;
            var hasRebny = false;
            document.querySelectorAll('.campaign-audience:checked').forEach(function(cb){
                total += (audienceCounts[cb.value] || 0);
                if (cb.value === 'rebny-agents') hasRebny = true;
            });
            // Update recipient count displays
            var countEl = document.getElementById('campaignRecipientCount');
            var totalEl = document.getElementById('campaignTotalCount');
            var display = total.toLocaleString() + ' recipients';
            if (countEl) countEl.textContent = display;
            if (totalEl) totalEl.textContent = display;
            // Show/hide REBNY agent blast info
            var rebnyInfo = document.getElementById('rebnyAgentBlastInfo');
            if (rebnyInfo) {
                if (hasRebny) { rebnyInfo.classList.remove('hidden'); } else { rebnyInfo.classList.add('hidden'); }
            }
        }

        function updateSocialPreview() {
            var sel = document.getElementById('socialListingSelect');
            var listings = {
                '1': { img:'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=300', caption:'Just Listed! Stunning 2BR/2BA in Hell\'s Kitchen\n\n$2,450,000 | 1,200 SF | Condo\n450 W 42nd St, #28B, Manhattan\n\nFloor-to-ceiling windows, Hudson River views, chef\'s kitchen with marble countertops. Full-service building.\n\nSchedule a private showing today!\n\nMallan Real Estate Inc. | Licensed RE Broker #10991205323\nEqual Housing Opportunity\n\n#NYCRealEstate #HellsKitchen #ManhattanCondo #LuxuryLiving' },
                '2': { img:'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=300', caption:'Now Available! Sun-Drenched 1BR on the Upper East Side\n\n$4,500/mo | 850 SF | Co-op\n200 E 82nd St, #6A, Manhattan\n\nPre-war charm with hardwood floors, updated kitchen, laundry in building. Steps to Central Park.\n\nDM to schedule a viewing!\n\nMallan Real Estate Inc. | Licensed RE Broker #10991205323\nEqual Housing Opportunity\n\n#NYCRentals #UpperEastSide #NYCApartment #CentralPark' },
                '3': { img:'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=300', caption:'Coming Soon! Gracious 3BR on Park Avenue\n\n$1,850,000 | 1,650 SF | Co-op\n789 Park Ave, #12B, Manhattan\n\nGrand living room, formal dining, Central Park proximity. Private showings available before market launch.\n\nContact us for early access!\n\nMallan Real Estate Inc. | Licensed RE Broker #10991205323\nEqual Housing Opportunity\n\n#ComingSoon #ParkAvenue #NYCLuxury #PreWar' },
                '4': { img:'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=300', caption:'Luxury FiDi Rental — No Fee!\n\n$7,200/mo | 1,100 SF | Condo\n55 Wall St, #34F, Manhattan\n\nCity views, concierge, rooftop pool & fitness center. Immediate availability.\n\nSchedule your tour today!\n\nMallan Real Estate Inc. | Licensed RE Broker #10991205323\nEqual Housing Opportunity\n\n#FiDi #LuxuryRental #NoFee #ManhattanLiving' },
                '5': { img:'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=300', caption:'Museum Mile Masterpiece!\n\n$5,750,000 | 2,800 SF | Co-op\n1040 Fifth Ave, #8C, Manhattan\n\nCentral Park views, 4BR/3.5BA, library, formal dining. White-glove building, pet-friendly.\n\nPrivate showings by appointment.\n\nMallan Real Estate Inc. | Licensed RE Broker #10991205323\nEqual Housing Opportunity\n\n#FifthAvenue #MuseumMile #UltraLuxury #CentralParkViews' },
                '6': { img:'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=300', caption:'Modern Tribeca Studio!\n\n$3,200/mo | 550 SF | Condo\n101 Warren St, #22D, Manhattan\n\nIn-unit W/D, custom closets, building gym & rooftop. Doorman building in prime Tribeca.\n\nApply now!\n\nMallan Real Estate Inc. | Licensed RE Broker #10991205323\nEqual Housing Opportunity\n\n#Tribeca #NYCStudio #ManhattanRental #DoormanBuilding' }
            };
            var data = listings[sel.value];
            if (data) {
                document.getElementById('socialPreviewImg').src = data.img;
                document.getElementById('socialCaption').value = data.caption;
            }
        }

        function previewSocialPost() { showToast('Social post preview — opens in new window with platform-specific formatting.', 'info'); }
        function shareSocialPost() {
            var platforms = [];
            document.querySelectorAll('.social-platform:checked').forEach(function(cb){ platforms.push(cb.value); });
            if (platforms.length === 0) { showToast('Please select at least one platform.', 'warning'); return; }
            showToast('Post shared to: ' + platforms.join(', ') + ' with broker attribution & Equal Housing notice.', 'success');
        }

        function setupLeadMagnet(id) { showToast('Lead Magnet Setup: ' + id + ' — Customize branding, set lead capture fields, get embed code/link.', 'info'); }
        function previewLeadMagnet(id) { showToast('Preview: ' + id + ' — Opens embeddable widget preview in new window.', 'info'); }

        // Campaign schedule toggle
        document.querySelectorAll('input[name="campaignSchedule"]').forEach(function(r){
            r.addEventListener('change', function(){
                document.getElementById('campaignScheduleDate').disabled = this.value !== 'later';
            });
        });
        document.querySelectorAll('input[name="socialSchedule"]').forEach(function(r){
            r.addEventListener('change', function(){
                document.getElementById('socialScheduleDate').disabled = this.value !== 'later';
            });
        });

        // ══════ 1099 PREVIEW & GENERATION ══════
        var agent1099Data = {
            'Jane Doe': { gross: '$1,245,000', refPaid: '-$151,250', refRecv: '+$193,000', net: '$912,550', acct: 'JD-2025-001', address: '123 Main Street, New York, NY 10001' },
            'Michael Smith': { gross: '$856,000', refPaid: '-$54,000', refRecv: '+$42,000', net: '$501,600', acct: 'MS-2025-002', address: '456 Park Avenue, New York, NY 10022' }
        };

        function open1099Preview(name, tin, amount, status) {
            // Reset success banner
            document.getElementById('banner1099Success').classList.add('hidden');
            // Show generate button
            document.getElementById('btn1099Generate').style.display = '';

            document.getElementById('form1099Name').textContent = name;
            document.getElementById('form1099TIN').textContent = tin;
            document.getElementById('form1099Amount').textContent = amount;
            document.getElementById('form1099StateIncome').textContent = amount;
            var statusEl = document.getElementById('modal1099Status');
            statusEl.textContent = status;
            if (status === 'Generated') {
                statusEl.className = 'px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700';
                // Already generated — hide generate button, show banner
                document.getElementById('btn1099Generate').style.display = 'none';
                document.getElementById('banner1099Success').classList.remove('hidden');
            } else {
                statusEl.className = 'px-2 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-700';
            }
            var data = agent1099Data[name];
            if (data) {
                document.getElementById('form1099Gross').textContent = data.gross;
                document.getElementById('form1099RefPaid').textContent = data.refPaid;
                document.getElementById('form1099RefRecv').textContent = data.refRecv;
                document.getElementById('form1099Net').textContent = data.net;
                document.getElementById('form1099AcctNum').textContent = data.acct;
                document.getElementById('form1099Address').textContent = data.address;
            }
            document.getElementById('modal1099Preview').classList.remove('hidden');
        }

        function close1099Preview() {
            document.getElementById('modal1099Preview').classList.add('hidden');
        }

        function confirm1099Generate() {
            var name = document.getElementById('form1099Name').textContent;
            // Update modal status
            var statusEl = document.getElementById('modal1099Status');
            statusEl.textContent = 'Generated';
            statusEl.className = 'px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700';
            // Show success banner
            document.getElementById('banner1099Success').classList.remove('hidden');
            // Scroll to top of modal
            document.getElementById('modal1099Preview').querySelector('.overflow-y-auto').scrollTop = 0;
            // Hide generate button (already generated)
            document.getElementById('btn1099Generate').style.display = 'none';
            // Update the table row status badge
            update1099TableStatus(name, 'Generated');
        }

        function update1099TableStatus(agentName, newStatus) {
            // Find all 1099 summary tables and update the matching agent row
            var tables = document.querySelectorAll('#section-1099-summary table tbody tr');
            tables.forEach(function(row) {
                var nameCell = row.querySelector('td:first-child .font-semibold');
                if (nameCell && nameCell.textContent.trim() === agentName) {
                    // Find the status badge cell (second to last column)
                    var cells = row.querySelectorAll('td');
                    var statusCell = cells[cells.length - 2]; // Status column
                    var badge = statusCell.querySelector('span');
                    if (badge) {
                        badge.textContent = newStatus;
                        badge.className = 'px-2 py-0.5 bg-green-100 text-green-700 rounded text-[10px]';
                    }
                    // Update actions: replace "Generate" with "View / Download / Email"
                    var actionsCell = cells[cells.length - 1];
                    actionsCell.innerHTML = '<div class="flex items-center gap-2">' +
                        '<button onclick="open1099Preview(\'' + agentName + '\', \'' + row.querySelector('td:nth-child(2)').textContent.trim() + '\', \'' + row.querySelector('td:nth-child(7)').textContent.trim() + '\', \'Generated\')" class="text-blue-600 hover:underline text-xs">View</button>' +
                        '<button class="text-blue-600 hover:underline text-xs">Download</button>' +
                        '<button class="text-blue-600 hover:underline text-xs">Email</button>' +
                        '</div>';
                }
            });
        }

        function generateAll1099s() {
            var agents = Object.keys(agent1099Data);
            // Update all rows in the table
            agents.forEach(function(name) {
                update1099TableStatus(name, 'Generated');
            });
            // Show a success banner at the top of the 1099 section
            var section = document.getElementById('section-1099-summary');
            var existing = document.getElementById('banner1099AllSuccess');
            if (existing) existing.remove();
            var banner = document.createElement('div');
            banner.id = 'banner1099AllSuccess';
            banner.className = 'mb-4 p-3 bg-green-50 border border-green-300 rounded-lg flex items-center gap-3';
            banner.innerHTML = '<div class="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0"><i class="fas fa-check text-white"></i></div>' +
                '<div class="text-xs"><p class="font-semibold text-green-800">All ' + agents.length + ' 1099-NEC Forms Generated</p>' +
                '<p class="text-green-600 mt-0.5">Forms are ready to print, download, or email to agents. This is a <strong>local generation only</strong> &mdash; file with IRS separately via FIRE system or your accountant.</p></div>' +
                '<button onclick="this.closest(\'div[id]\').remove()" class="ml-auto text-green-400 hover:text-green-600"><i class="fas fa-times"></i></button>';
            // Insert after the header
            var header = section.querySelector('.flex.items-center.justify-between.mb-4');
            header.parentNode.insertBefore(banner, header.nextSibling);
        }

        // Toggle Listings / Commissions view within agent card
        // Generic table sort — works on any table
        function sortTable(th) {
            var table = th.closest('table');
            var tbody = table.querySelector('tbody');
            if (!tbody) return;
            var rows = Array.from(tbody.querySelectorAll('tr'));
            var colIdx = Array.from(th.parentElement.children).indexOf(th);
            var thead = th.closest('thead');

            // Determine sort direction
            var asc = th.dataset.sortDir !== 'asc';
            // Reset all headers in this table
            thead.querySelectorAll('th').forEach(function(h) {
                h.dataset.sortDir = '';
                var icon = h.querySelector('.sort-icon');
                if (icon) icon.className = 'sort-icon fas fa-sort text-gray-300 ml-1';
            });
            th.dataset.sortDir = asc ? 'asc' : 'desc';
            var icon = th.querySelector('.sort-icon');
            if (icon) icon.className = 'sort-icon fas ' + (asc ? 'fa-sort-up' : 'fa-sort-down') + ' text-blue-500 ml-1';

            rows.sort(function(a, b) {
                var cellA = a.children[colIdx];
                var cellB = b.children[colIdx];
                if (!cellA || !cellB) return 0;
                var valA = (cellA.textContent || '').trim();
                var valB = (cellB.textContent || '').trim();

                // Try numeric/currency parse
                var numA = parseFloat(valA.replace(/[$,%\/moMonthly\s—]/g, '').replace(/,/g, ''));
                var numB = parseFloat(valB.replace(/[$,%\/moMonthly\s—]/g, '').replace(/,/g, ''));
                if (!isNaN(numA) && !isNaN(numB)) {
                    return asc ? numA - numB : numB - numA;
                }

                // Try date parse
                var dateA = Date.parse(valA);
                var dateB = Date.parse(valB);
                if (!isNaN(dateA) && !isNaN(dateB)) {
                    return asc ? dateA - dateB : dateB - dateA;
                }

                // String compare
                return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
            });

            rows.forEach(function(r) { tbody.appendChild(r); });
        }

        function toggleAgentView(btn, viewId) {
            var card = btn.closest('.agent-roster-card') || btn.closest('.border');
            // Hide all agent views within this card
            var allViews = card.querySelectorAll('[id^="agent-view-"]');
            allViews.forEach(function(v) { v.style.display = 'none'; });
            document.getElementById('agent-view-' + viewId).style.display = 'block';
            // Update tab styles
            var tabs = btn.parentElement.querySelectorAll('.agent-view-tab');
            tabs.forEach(function(t) {
                t.className = 'agent-view-tab px-3 py-1.5 text-xs font-semibold text-gray-500 border-b-2 border-transparent hover:text-gray-700';
            });
            btn.className = 'agent-view-tab px-3 py-1.5 text-xs font-semibold border-b-2 border-blue-600 text-blue-600';
        }

        // Agent Profile Modal
        function openAgentProfile(name, role, license, email, phone, color) {
            var modal = document.getElementById('agentProfileModal');
            document.getElementById('profileAgentName').textContent = name;
            document.getElementById('profileAgentRole').textContent = role;
            document.getElementById('profileAgentLicense').textContent = 'Lic #' + license;
            document.getElementById('profileAgentEmail').textContent = email;
            document.getElementById('profileAgentPhone').textContent = phone;
            // Set avatar initials and color
            var initials = name.split(' ').map(n => n[0]).join('');
            var avatar = document.getElementById('profileAgentAvatar');
            avatar.textContent = initials;
            avatar.className = 'w-16 h-16 bg-' + color + '-100 rounded-full flex items-center justify-center text-' + color + '-700 font-bold text-xl';
            var badge = document.getElementById('profileAgentBadge');
            badge.className = 'px-3 py-1 bg-' + color + '-100 text-' + color + '-700 rounded-full text-xs font-semibold';
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }

        function closeAgentProfile() {
            document.getElementById('agentProfileModal').classList.add('hidden');
            document.body.style.overflow = 'auto';
        }

        // Add Agent Modal Functions
        function openAddAgentModal() {
            document.getElementById('addAgentModal').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }

        function closeAddAgentModal() {
            document.getElementById('addAgentModal').classList.add('hidden');
            document.body.style.overflow = 'auto';
        }

        // Edit Listing Modal Functions
        function openEditModal(type, address, price) {
            document.getElementById('editListingModal').classList.remove('hidden');
            document.getElementById('editModalAddress').textContent = address;
            document.getElementById('editPrice').value = price;
            document.body.style.overflow = 'hidden';
            // Reset to pricing tab
            showEditTab('pricing');
        }

        function closeEditModal() {
            document.getElementById('editListingModal').classList.add('hidden');
            document.body.style.overflow = 'auto';
        }

        function showEditTab(tab) {
            // Hide all sections
            document.querySelectorAll('.edit-section').forEach(section => {
                section.classList.add('hidden');
            });
            // Remove active from all tabs
            ['Pricing', 'Status', 'Details', 'Photos', 'Description'].forEach(t => {
                var tabBtn = document.getElementById('editTab' + t);
                if (tabBtn) {
                    tabBtn.classList.remove('border-b-2', 'border-blue-600', 'text-blue-600');
                    tabBtn.classList.add('text-gray-600');
                }
            });
            // Show selected section
            var section = document.getElementById('edit' + tab.charAt(0).toUpperCase() + tab.slice(1) + 'Section');
            if (section) {
                section.classList.remove('hidden');
            }
            // Highlight active tab
            var activeTab = document.getElementById('editTab' + tab.charAt(0).toUpperCase() + tab.slice(1));
            if (activeTab) {
                activeTab.classList.add('border-b-2', 'border-blue-600', 'text-blue-600');
                activeTab.classList.remove('text-gray-600');
            }
        }

        // (Old filterListings removed — actual implementation is below at collectSearchCriteria)

        // Broker View Switching - Access all features with broker context
        function switchToBrokerView(tabName) {
            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
                tab.style.display = 'none';
            });
            // Show selected tab
            var targetTab = document.getElementById(tabName);
            if (targetTab) {
                targetTab.style.display = 'block';
                targetTab.classList.add('active');
            }
            // Keep broker role indicator
            document.getElementById('currentUserName').textContent = 'Admin User';
            document.getElementById('currentUserRole').textContent = 'Broker';
            // Keep broker dropdown selected
            document.getElementById('roleSelector').value = 'broker';
        }

        // Mobile Sidebar Toggle
        function toggleMobileSidebar() {
            var sidebar = document.getElementById('mainSidebar');
            var overlay = document.getElementById('sidebarOverlay');
            sidebar.classList.toggle('open');
            overlay.classList.toggle('open');
        }

        // Close sidebar when clicking a link on mobile
        document.querySelectorAll('.sidebar-link, .sidebar-child').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth < 768) {
                    toggleMobileSidebar();
                }
            });
        });

        // Portal Switching Function
        // Track current portal for access control
        var currentPortal = 'broker';

        function switchPortal(portal) {
            currentPortal = portal;

            // Hide all portal views
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
                tab.style.display = 'none';
            });

            // Update user info display based on portal
            var userName = document.getElementById('currentUserName');
            var userRole = document.getElementById('currentUserRole');

            switch(portal) {
                case 'broker':
                    document.getElementById('broker-portal').style.display = 'block';
                    userName.textContent = 'Admin User';
                    userRole.textContent = 'Broker';
                    break;
                case 'client':
                    // Client section removed
                    break;
                case 'seller':
                    document.getElementById('seller-portal').style.display = 'block';
                    userName.textContent = 'Property Owner';
                    userRole.textContent = 'Seller';
                    break;
                case 'landlord':
                    document.getElementById('landlord-portal').style.display = 'block';
                    userName.textContent = 'Property Owner';
                    userRole.textContent = 'Landlord';
                    break;
                default: // agent
                    document.getElementById('dashboard').style.display = 'block';
                    document.getElementById('dashboard').classList.add('active');
                    userName.textContent = LOGGED_IN_AGENT.name || '--';
                    userRole.textContent = 'Agent';
            }

            // Enforce internal section visibility based on portal
            enforceInternalAccess();
            // Enforce document center access based on portal
            enforceDocumentAccess();
        }

        // Enforce: internal commission sections are ONLY visible to broker portal
        function enforceInternalAccess() {
            document.querySelectorAll('.internal-commission-section').forEach(section => {
                if (currentPortal === 'broker') {
                    section.style.display = '';
                } else {
                    // Hard lock: hide completely for all non-broker portals
                    section.style.display = 'none';
                }
            });
        }

        // Document Center: toggle admin-only vs agent-only elements based on portal
        function enforceDocumentAccess() {
            var isAdmin = (currentPortal === 'broker');
            document.querySelectorAll('.doc-admin-only').forEach(el => {
                el.style.display = isAdmin ? '' : 'none';
            });
            document.querySelectorAll('.doc-agent-only').forEach(el => {
                el.style.display = isAdmin ? 'none' : '';
            });
        }

        function showTab(tabName, evt) {
            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
                tab.style.display = 'none';
            });
            // Remove active from all sidebar links AND child items
            document.querySelectorAll('.sidebar-link, .sidebar-child').forEach(link => {
                link.classList.remove('active');
            });
            // Show selected tab
            var targetTab = document.getElementById(tabName);
            if (targetTab) {
                targetTab.classList.add('active');
                targetTab.style.display = 'block';
            }
            // Highlight active link - use passed event or fallback to window.event
            var e = evt || window.event;
            var activeBtn = null;
            if (e && e.target) {
                activeBtn = e.target.closest('button');
                if (activeBtn) activeBtn.classList.add('active');
            } else {
                // Programmatic call - find matching sidebar button by tab name
                document.querySelectorAll('.sidebar-link').forEach(link => {
                    if (link.getAttribute('onclick') && link.getAttribute('onclick').includes("'" + tabName + "'")) {
                        link.classList.add('active');
                        activeBtn = link;
                    }
                });
            }
            // Auto-expand parent group and section if the clicked item is a child
            if (activeBtn) {
                // Expand parent children container
                var childrenContainer = activeBtn.closest('.sidebar-children');
                if (childrenContainer && !childrenContainer.classList.contains('expanded')) {
                    childrenContainer.classList.add('expanded');
                    var parentBtn = childrenContainer.previousElementSibling;
                    if (parentBtn) parentBtn.classList.add('expanded');
                }
                // Expand section body
                var sectionBody = activeBtn.closest('.sidebar-section-body');
                if (sectionBody && sectionBody.classList.contains('collapsed')) {
                    sectionBody.classList.remove('collapsed');
                    sectionBody.style.maxHeight = sectionBody.scrollHeight + 'px';
                    var sectionHeader = sectionBody.previousElementSibling;
                    if (sectionHeader) sectionHeader.classList.remove('collapsed');
                }
            }

            // Always enforce internal section access on every tab switch
            enforceInternalAccess();
            // Always enforce document center access on every tab switch
            enforceDocumentAccess();
        }

        function toggleSection(header) {
            var content = header.nextElementSibling;
            var icon = header.querySelector('i');
            content.classList.toggle('collapsed');
            icon.classList.toggle('fa-minus');
            icon.classList.toggle('fa-plus');
        }

