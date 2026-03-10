        // ═══════════════════════════════════════════════════════════════════════════════
        // CUSTOM DROPDOWN HANDLER FUNCTIONS
        // ═══════════════════════════════════════════════════════════════════════════════

        // Configuration for custom dropdown prompts
        var customDropdownConfig = {
            // Sales Price
            saleMinPrice: { label: 'Minimum Price', format: 'currency', min: 0, max: 500000000 },
            saleMaxPrice: { label: 'Maximum Price', format: 'currency', min: 0, max: 500000000 },
            // Sales Beds/Baths/Rooms
            saleMinBeds: { label: 'Minimum Beds', format: 'number', min: 0, max: 20 },
            saleMaxBeds: { label: 'Maximum Beds', format: 'number', min: 0, max: 20 },
            saleMinBaths: { label: 'Minimum Baths', format: 'decimal', min: 0, max: 15 },
            saleMaxBaths: { label: 'Maximum Baths', format: 'decimal', min: 0, max: 15 },
            saleMinRooms: { label: 'Minimum Rooms', format: 'number', min: 0, max: 30 },
            saleMaxRooms: { label: 'Maximum Rooms', format: 'number', min: 0, max: 30 },
            // Sales SqFt
            saleMinSqft: { label: 'Minimum Sq Ft', format: 'number', min: 0, max: 100000 },
            saleMaxSqft: { label: 'Maximum Sq Ft', format: 'number', min: 0, max: 100000 },
            // Rental Rent
            rentalMinRent: { label: 'Minimum Rent', format: 'currency', min: 0, max: 500000 },
            rentalMaxRent: { label: 'Maximum Rent', format: 'currency', min: 0, max: 500000 },
            // Rental Beds/Baths/Rooms
            rentalMinBeds: { label: 'Minimum Beds', format: 'number', min: 0, max: 20 },
            rentalMaxBeds: { label: 'Maximum Beds', format: 'number', min: 0, max: 20 },
            rentalMinBaths: { label: 'Minimum Baths', format: 'decimal', min: 0, max: 15 },
            rentalMaxBaths: { label: 'Maximum Baths', format: 'decimal', min: 0, max: 15 },
            rentalMinRooms: { label: 'Minimum Rooms', format: 'number', min: 0, max: 30 },
            rentalMaxRooms: { label: 'Maximum Rooms', format: 'number', min: 0, max: 30 },
            // Rental SqFt
            rentalMinSqft: { label: 'Minimum Sq Ft', format: 'number', min: 0, max: 100000 },
            rentalMaxSqft: { label: 'Maximum Sq Ft', format: 'number', min: 0, max: 100000 },
            // Building Floors
            buildingMinFloors: { label: 'Minimum Floors', format: 'number', min: 1, max: 200 },
            buildingMaxFloors: { label: 'Maximum Floors', format: 'number', min: 1, max: 200 },
            // Building Year
            buildingMinYear: { label: 'Minimum Year Built', format: 'year', min: 1800, max: 2030 },
            buildingMaxYear: { label: 'Maximum Year Built', format: 'year', min: 1800, max: 2030 },
            // Building Units
            buildingMinUnits: { label: 'Minimum Units', format: 'number', min: 1, max: 5000 },
            buildingMaxUnits: { label: 'Maximum Units', format: 'number', min: 1, max: 5000 }
        };

        // Mortgage Calculator — P&I only; maint & tax pulled per listing at search time
        // Logic: co-op/condop (residential & commercial) = maint only (tax included in maintenance)
        //        condo/townhouse/commercial condo/fee simple/etc. = maint + tax
        //        land/single family home = tax only (no maintenance)
        function updateMortgageCalc() {
            var priceInput = document.getElementById('mortgagePrice');
            var downInput = document.getElementById('mortgageDownPayment');
            var rateInput = document.getElementById('mortgageRate');
            var termInput = document.getElementById('mortgageTerm');

            if (!priceInput) return;

            function parseNum(val) {
                if (!val) return 0;
                return parseFloat(val.replace(/[^0-9.]/g, '')) || 0;
            }

            var price = parseNum(priceInput.value);
            var downPct = parseNum(downInput.value) / 100;
            var rate = parseNum(rateInput.value) / 100 / 12;
            var termYears = parseNum(termInput.value);
            var termMonths = termYears * 12;

            var loanAmount = price * (1 - downPct);
            var monthlyPI = 0;
            if (loanAmount > 0 && rate > 0 && termMonths > 0) {
                monthlyPI = loanAmount * (rate * Math.pow(1 + rate, termMonths)) / (Math.pow(1 + rate, termMonths) - 1);
            }

            function fmt(n) {
                if (isNaN(n) || n === 0) return '$0';
                return '$' + Math.round(n).toLocaleString('en-US');
            }

            var estMortgage = document.getElementById('estMortgage');
            var estTotal = document.getElementById('estTotalMonthly');

            if (estMortgage) estMortgage.textContent = fmt(monthlyPI);
            // Total shown here is P&I only; full total computed per listing with maint/tax at search time
            if (estTotal) estTotal.textContent = fmt(monthlyPI) + ' + maint/tax';
        }

        // Commission Payment Request — auto-calculate amounts
        function calcCommissionRequest() {
            var priceEl = document.getElementById('commReqPrice');
            var rateEl = document.getElementById('commReqRate');
            var rateTypeEl = document.getElementById('commReqRateType');
            var splitEl = document.getElementById('commReqSplit');
            var grossEl = document.getElementById('commReqGross');
            var amountEl = document.getElementById('commReqAmount');
            if (!priceEl) return;

            function parseNum(val) {
                if (!val) return 0;
                return parseFloat(val.replace(/[^0-9.]/g, '')) || 0;
            }
            function fmt(n) {
                if (isNaN(n) || n === 0) return '$0';
                return '$' + Math.round(n).toLocaleString('en-US');
            }

            var price = parseNum(priceEl.value);
            var rateVal = parseNum(rateEl.value);
            var rateType = rateTypeEl ? rateTypeEl.value : 'percent';
            var split = parseNum(splitEl.value) / 100;

            var gross = rateType === 'flat' ? rateVal : price * (rateVal / 100);
            var agentAmount = gross * split;

            if (grossEl) grossEl.value = fmt(gross);
            if (amountEl) amountEl.textContent = fmt(agentAmount);
        }

        // Auto-fill commission request form from deal selection (API-driven)
        var _commReqDealsCache = null;

        function autoFillCommissionRequest(selectEl) {
            var dealId = selectEl.value;
            if (!dealId || !_commReqDealsCache) return;

            var addrEl = document.getElementById('commReqAddress');
            var typeEl = document.getElementById('commReqDealType');
            var dateEl = document.getElementById('commReqCloseDate');
            var roleEl = document.getElementById('commReqRole');

            var deal = null;
            for (var i = 0; i < _commReqDealsCache.length; i++) {
                if (_commReqDealsCache[i].id === dealId) { deal = _commReqDealsCache[i]; break; }
            }

            if (deal) {
                if (addrEl) addrEl.value = deal.property_address || '';
                if (typeEl) typeEl.value = deal.representation_code === 'tenant' ? 'rental' : 'sale';
                if (dateEl) dateEl.value = deal.contract_signed ? deal.contract_signed.split('T')[0] : '';
                if (roleEl) roleEl.value = deal.representation_code || 'buyer';
                updateCommReqFields();
            } else {
                if (addrEl) addrEl.value = '';
                if (dateEl) dateEl.value = '';
                if (roleEl) roleEl.value = '';
            }
        }

        // Load deals into commission request dropdown
        function loadCommReqDeals() {
            if (typeof MallanAPI === 'undefined' || !MallanAPI.deals) return;
            MallanAPI.deals.list({ limit: 50 }).then(function(res) {
                _commReqDealsCache = res.deals || [];
                var selectEl = document.getElementById('commReqDeal');
                if (!selectEl) return;
                selectEl.innerHTML = '<option value="">-- Select Deal --</option>';
                _commReqDealsCache.forEach(function(d) {
                    var opt = document.createElement('option');
                    opt.value = d.id;
                    opt.textContent = (d.property_address || 'No address') + ' (' + (d.representation_code || 'buyer') + ')';
                    selectEl.appendChild(opt);
                });
            }).catch(function() {});
        }

        // Update form fields based on agent role and commission source
        function updateCommReqFields() {
            var role = document.getElementById('commReqRole').value;
            var paidBy = document.getElementById('commReqPaidBy').value;
            var dealType = document.getElementById('commReqDealType');
            var paidByEl = document.getElementById('commReqPaidBy');
            var priceLabel = document.getElementById('commReqPriceLabel');

            // Co-broke info panel
            var coBrokeInfo = document.getElementById('commReqCoBrokeInfo');
            var buyerPaidInfo = document.getElementById('commReqBuyerPaidInfo');
            var splitInfo = document.getElementById('commReqSplitInfo');
            var buyerAgreementDoc = document.getElementById('commReqDocBuyerAgreement');

            // Hide all conditional sections first
            if (coBrokeInfo) coBrokeInfo.classList.add('hidden');
            if (buyerPaidInfo) buyerPaidInfo.classList.add('hidden');
            if (splitInfo) splitInfo.classList.add('hidden');
            if (buyerAgreementDoc) buyerAgreementDoc.classList.add('hidden');

            // Set deal type based on role
            if (role === 'listing' || role === 'buyer') {
                if (dealType) dealType.value = 'sale';
            } else if (role === 'tenant' || role === 'landlord') {
                if (dealType) dealType.value = 'rental';
            }

            // Update price label
            if (priceLabel) {
                if (role === 'tenant' || role === 'landlord') {
                    priceLabel.innerHTML = 'Annual Rent <span class="text-red-500">*</span>';
                } else {
                    priceLabel.innerHTML = 'Sale Price <span class="text-red-500">*</span>';
                }
            }

            // Set default Commission Paid By based on role
            if (role === 'listing') {
                paidByEl.value = 'seller';
            } else if (role === 'buyer') {
                // Default to co-broke for buyer's agent
                if (paidBy !== 'co-broke' && paidBy !== 'buyer') paidByEl.value = 'co-broke';
            } else if (role === 'tenant') {
                if (paidBy !== 'owner' && paidBy !== 'tenant' && paidBy !== 'split') paidByEl.value = 'owner';
            } else if (role === 'landlord') {
                paidByEl.value = 'owner';
            }

            // Re-read paidBy after defaults
            paidBy = paidByEl.value;

            // Show conditional sections
            if (paidBy === 'co-broke' && coBrokeInfo) {
                coBrokeInfo.classList.remove('hidden');
            }
            if (paidBy === 'buyer' && buyerPaidInfo) {
                buyerPaidInfo.classList.remove('hidden');
                if (buyerAgreementDoc) buyerAgreementDoc.classList.remove('hidden');
            }
            if (paidBy === 'split' && splitInfo) {
                splitInfo.classList.remove('hidden');
            }
        }

        // Submit commission payment request (mockup)
        function submitCommissionRequest() {
            var roleEl = document.getElementById('commReqRole');
            var addrEl = document.getElementById('commReqAddress');
            var emailEl = document.getElementById('commReqClientEmail');
            var phoneEl = document.getElementById('commReqClientPhone');
            var dateEl = document.getElementById('commReqCloseDate');
            var priceEl = document.getElementById('commReqPrice');
            var rateEl = document.getElementById('commReqRate');
            var splitEl = document.getElementById('commReqSplit');

            if (!roleEl.value) {
                showToast('Please select your role in this deal.', 'warning');
                return;
            }
            if (!emailEl.value || !phoneEl.value) {
                showToast('Please provide the client\'s email and phone number.', 'warning');
                return;
            }
            if (!addrEl.value || !dateEl.value || !priceEl.value || !rateEl.value || !splitEl.value) {
                showToast('Please fill in all required fields (marked with *)', 'warning');
                return;
            }

            var roleLabels = { listing: 'Listing Agent', buyer: "Buyer's Agent", tenant: "Tenant's Agent", landlord: "Landlord's Agent" };
            var roleLabel = roleLabels[roleEl.value] || roleEl.value;
            showToast('Commission payment request submitted as ' + roleLabel + '. Broker will review.', 'success');
            document.getElementById('commissionRequestForm').classList.add('hidden');
        }

        // Client Address Book — sortable table columns
        function sortClientBookTable(thEl, colIndex) {
            var table = thEl.closest('table');
            var tbody = table.querySelector('tbody');
            if (!tbody) return;
            var rows = Array.from(tbody.querySelectorAll('tr'));
            // Determine sort direction
            var currentDir = thEl.getAttribute('data-sort-dir') || 'none';
            var newDir = currentDir === 'asc' ? 'desc' : 'asc';
            // Reset all sort icons in this thead
            thEl.closest('tr').querySelectorAll('th i.fas').forEach(function(icon) {
                icon.className = 'fas fa-sort text-gray-300 ml-0.5';
            });
            // Set active icon
            var icon = thEl.querySelector('i.fas');
            if (icon) {
                icon.className = newDir === 'asc'
                    ? 'fas fa-sort-up text-blue-600 ml-0.5'
                    : 'fas fa-sort-down text-blue-600 ml-0.5';
            }
            // Reset other headers
            thEl.closest('tr').querySelectorAll('th').forEach(function(h) {
                if (h !== thEl) h.setAttribute('data-sort-dir', 'none');
            });
            thEl.setAttribute('data-sort-dir', newDir);

            rows.sort(function(a, b) {
                var aCell = a.cells[colIndex];
                var bCell = b.cells[colIndex];
                if (!aCell || !bCell) return 0;
                var aText = aCell.textContent.trim().toLowerCase();
                var bText = bCell.textContent.trim().toLowerCase();

                // Try date parsing for Closed / Lease column
                if (colIndex === 7) {
                    var aMatch = aText.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d+),?\s*(\d{4})/i);
                    var bMatch = bText.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d+),?\s*(\d{4})/i);
                    if (aMatch && bMatch) {
                        var aDate = new Date(aMatch[0]);
                        var bDate = new Date(bMatch[0]);
                        return newDir === 'asc' ? aDate - bDate : bDate - aDate;
                    }
                }

                // Try numeric sort for Bed/Bath (extract first number)
                if (colIndex === 4) {
                    var aNum = parseInt(aText) || 0;
                    var bNum = parseInt(bText) || 0;
                    if (aNum !== bNum) return newDir === 'asc' ? aNum - bNum : bNum - aNum;
                }

                // Price / Rent — parse currency ($1,750,000 or $4,500/mo)
                if (colIndex === 5) {
                    var aPrice = parseFloat(aText.replace(/[^0-9.]/g, '')) || 0;
                    var bPrice = parseFloat(bText.replace(/[^0-9.]/g, '')) || 0;
                    return newDir === 'asc' ? aPrice - bPrice : bPrice - aPrice;
                }

                // Default text sort
                if (aText < bText) return newDir === 'asc' ? -1 : 1;
                if (aText > bText) return newDir === 'asc' ? 1 : -1;
                return 0;
            });

            rows.forEach(function(row) { tbody.appendChild(row); });
        }

        // Referral Tracking Functions
        function updateReferralForm() {
            var dir = document.getElementById('refDirection').value;
            var dealType = document.getElementById('refDealType').value;
            var brokerageLabel = document.getElementById('refBrokerageLabel');
            var agentLabel = document.getElementById('refAgentLabel');
            var companyTitle = document.getElementById('refOtherCompanyTitle');
            var priceLabel = document.getElementById('refPriceLabel');
            var dateLabel = document.getElementById('refDateLabel');
            var leaseEndWrap = document.getElementById('refLeaseEndWrap');

            if (dir === 'incoming') {
                brokerageLabel.textContent = 'Referring Company Name *';
                agentLabel.textContent = 'Referring Agent Name *';
                companyTitle.innerHTML = '<i class="fas fa-handshake text-orange-600"></i> Referring Company Information';
            } else if (dir === 'outgoing') {
                brokerageLabel.textContent = 'Receiving Company Name *';
                agentLabel.textContent = 'Receiving Agent Name *';
                companyTitle.innerHTML = '<i class="fas fa-handshake text-orange-600"></i> Receiving Company Information';
            }

            if (dealType === 'rental') {
                priceLabel.textContent = 'Monthly Rent';
                dateLabel.textContent = 'Lease Start Date';
                leaseEndWrap.classList.remove('hidden');
            } else {
                priceLabel.textContent = 'Sale Price';
                dateLabel.textContent = 'Closing Date';
                leaseEndWrap.classList.add('hidden');
            }
        }

        function fillOurAgentDetails() {
            var sel = document.getElementById('refOurAgent').value;
            var titleEl = document.getElementById('refOurAgentTitle');
            var licenseEl = document.getElementById('refOurAgentLicense');
            // Agent data loaded from API via MallanAPI.agents.list()
            // Fallback removed — referral form requires authenticated session
            var agentData = (window._cachedAgentData) ? window._cachedAgentData : {};
            if (sel && agentData[sel]) {
                titleEl.value = agentData[sel].title || '';
                licenseEl.value = agentData[sel].license || '';
                // Update signer info in signature section
                var sigName = document.getElementById('refSignAgentName');
                var sigEmail = document.getElementById('refSignAgentEmail');
                if (sigName) sigName.innerHTML = escapeHtml(agentData[sel].name) + ' <span class="text-gray-400 font-normal">(' + escapeHtml(agentData[sel].title || '') + ')</span>';
                if (sigEmail) sigEmail.textContent = agentData[sel].email || '—';
            } else {
                titleEl.value = '';
                licenseEl.value = '';
                var sigName = document.getElementById('refSignAgentName');
                var sigEmail = document.getElementById('refSignAgentEmail');
                if (sigName) sigName.innerHTML = 'Select agent above <span class="text-gray-400 font-normal">(Our Agent)</span>';
                if (sigEmail) sigEmail.textContent = '—';
            }
        }

        /* ── Lead Distribution: Filter ── */
        function filterLeads(btn, filter) {
            document.querySelectorAll('.lead-tab').forEach(function(t) {
                t.className = 'lead-tab px-2.5 py-1 rounded text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200';
            });
            btn.className = 'lead-tab px-2.5 py-1 rounded text-xs font-semibold bg-gray-900 text-white';
            var rows = document.querySelectorAll('#leadTableBody .lead-row');
            rows.forEach(function(row) {
                if (filter === 'all') { row.style.display = ''; return; }
                if (filter === 'unassigned') { row.style.display = !row.getAttribute('data-agent') ? '' : 'none'; return; }
                if (['maya','jane','michael'].indexOf(filter) !== -1) { row.style.display = row.getAttribute('data-agent') === filter ? '' : 'none'; return; }
                row.style.display = row.getAttribute('data-source') === filter ? '' : 'none';
            });
        }

        /* ── CE Course History: Filter & Sort ── */
        var ceSortState = { col: null, asc: true };

        function filterCEHistory(btn, filter) {
            // Toggle active tab styling
            document.querySelectorAll('.ce-hist-tab').forEach(function(t) {
                t.className = 'ce-hist-tab px-2.5 py-1 rounded text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200';
            });
            btn.className = 'ce-hist-tab px-2.5 py-1 rounded text-xs font-semibold bg-gray-900 text-white';

            // Show/hide rows
            var rows = document.querySelectorAll('#ceHistoryBody .ce-row');
            rows.forEach(function(row) {
                if (filter === 'all') {
                    row.style.display = '';
                } else if (['maya', 'jane', 'michael'].indexOf(filter) !== -1) {
                    row.style.display = row.getAttribute('data-agent') === filter ? '' : 'none';
                } else if (['verified', 'pending'].indexOf(filter) !== -1) {
                    row.style.display = row.getAttribute('data-status') === filter ? '' : 'none';
                } else if (['mandatory', 'elective'].indexOf(filter) !== -1) {
                    row.style.display = row.getAttribute('data-type') === filter ? '' : 'none';
                } else {
                    row.style.display = '';
                }
            });
        }

        function sortCEHistory(column) {
            var tbody = document.getElementById('ceHistoryBody');
            if (!tbody) return;
            var rows = Array.from(tbody.querySelectorAll('.ce-row'));

            // Toggle direction
            if (ceSortState.col === column) {
                ceSortState.asc = !ceSortState.asc;
            } else {
                ceSortState.col = column;
                ceSortState.asc = true;
            }

            rows.sort(function(a, b) {
                var valA, valB;
                if (column === 'hours') {
                    valA = parseFloat(a.getAttribute('data-hours')) || 0;
                    valB = parseFloat(b.getAttribute('data-hours')) || 0;
                    return ceSortState.asc ? valA - valB : valB - valA;
                } else if (column === 'date') {
                    valA = a.getAttribute('data-date') || '';
                    valB = b.getAttribute('data-date') || '';
                } else if (column === 'agent') {
                    valA = a.getAttribute('data-agent') || '';
                    valB = b.getAttribute('data-agent') || '';
                } else if (column === 'status') {
                    valA = a.getAttribute('data-status') || '';
                    valB = b.getAttribute('data-status') || '';
                } else if (column === 'category') {
                    valA = a.getAttribute('data-category') || '';
                    valB = b.getAttribute('data-category') || '';
                } else if (column === 'type') {
                    valA = a.getAttribute('data-type') || '';
                    valB = b.getAttribute('data-type') || '';
                } else if (column === 'course') {
                    valA = (a.cells[1] && a.cells[1].textContent.trim()) || '';
                    valB = (b.cells[1] && b.cells[1].textContent.trim()) || '';
                } else {
                    valA = ''; valB = '';
                }
                if (column !== 'hours') {
                    var cmp = valA.localeCompare(valB);
                    return ceSortState.asc ? cmp : -cmp;
                }
                return 0;
            });

            rows.forEach(function(row) { tbody.appendChild(row); });

            // Update sort icons
            document.querySelectorAll('#ceHistoryTable thead th[onclick]').forEach(function(th) {
                var icon = th.querySelector('i.fa-sort, i.fa-sort-up, i.fa-sort-down');
                if (!icon) return;
                var col = th.getAttribute('onclick').replace("sortCEHistory('","").replace("')","");
                if (col === column) {
                    icon.className = 'fas ' + (ceSortState.asc ? 'fa-sort-up' : 'fa-sort-down') + ' text-gray-600 text-[9px] ml-0.5';
                } else {
                    icon.className = 'fas fa-sort text-gray-400 text-[9px] ml-0.5';
                }
            });
        }

        function toggleRefSignatureSection() {
            var status = document.getElementById('refAgreementStatus').value;
            var section = document.getElementById('refSignatureSection');
            if (status === 'draft' || status === 'sent' || status === '') {
                section.style.display = '';
            } else {
                section.style.display = 'none';
            }
        }

        function sendReferralForSignature() {
            var method = document.getElementById('refSignMethod').value;
            if (!method) { showToast('Please select a signature method.', 'warning'); return; }
            var signers = [];
            if (document.getElementById('refSignBroker').checked) signers.push((LOGGED_IN_AGENT.name || 'Broker') + ' (Broker)');
            if (document.getElementById('refSignAgent').checked) {
                var agentName = document.getElementById('refSignAgentName').textContent.split('(')[0].trim();
                signers.push(agentName + ' (Our Agent)');
            }
            if (document.getElementById('refSignOtherAgent').checked) signers.push('Other Company Agent');
            if (document.getElementById('refSignOtherBroker').checked) signers.push('Other Company Broker');
            if (signers.length === 0) { showToast('Please select at least one signer.', 'warning'); return; }
            var methodNames = { docusign: 'DocuSign', dotloop: 'Dotloop', hellosign: 'HelloSign (Dropbox Sign)', authentisign: 'Authentisign', other: 'E-Signature', wet: 'Print & Sign' };
            showToast('Referral agreement sent via ' + (methodNames[method] || method) + ' to ' + signers.length + ' signer(s).', 'success');
            // Update status badges to "Sent"
            var badges = document.querySelectorAll('#refSignatureSection span[id$="Status"]');
            badges.forEach(function(b) { b.textContent = 'Sent'; b.className = 'px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-[10px] font-semibold'; });
        }

        function calcReferralFee() {
            var priceStr = document.getElementById('refPrice').value.replace(/[^0-9.]/g, '');
            var pct = parseFloat(document.getElementById('refFeePercent').value) || 0;
            var price = parseFloat(priceStr) || 0;
            var fee = price * (pct / 100);
            document.getElementById('refFeeAmount').value = fee > 0 ? '$' + fee.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0}) : '';
        }

        function submitReferral() {
            var dir = document.getElementById('refDirection').value;
            if (!dir) { showToast('Please select a referral direction (Incoming or Outgoing).', 'warning'); return; }
            var dealType = document.getElementById('refDealType').value;
            if (!dealType) { showToast('Please select a deal type (Sale or Rental).', 'warning'); return; }
            var agent = document.getElementById('refOurAgent').value;
            if (!agent) { showToast('Please select our agent.', 'warning'); return; }
            var feeAmt = document.getElementById('refFeeAmount').value;
            var dirLabel = dir === 'incoming' ? 'Incoming' : 'Outgoing';
            showToast('Referral submitted: ' + dirLabel + ' ' + dealType + ' — Fee: ' + (feeAmt || 'TBD'), 'success');
            document.getElementById('addReferralForm').classList.add('hidden');
        }

        function handleCustomDropdown(selectElement) {
            if (selectElement.value !== 'custom') return;

            var config = customDropdownConfig[selectElement.id];
            var parentDiv = selectElement.closest('div');
            var labelEl = parentDiv ? parentDiv.querySelector('label, p') : null;
            var fieldName = config ? config.label : (labelEl ? labelEl.textContent.trim().replace(/[*]/g, '').trim() : 'value');

            // Hide the select, replace it with an input in the exact same spot
            selectElement.style.display = 'none';

            var wrapper = document.createElement('div');
            wrapper.style.position = 'relative';
            wrapper.dataset.customInput = 'true';

            var input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Enter ' + fieldName;
            input.className = 'w-full border-2 border-blue-400 rounded px-2 py-1.5 pr-7 text-sm bg-blue-50 focus:outline-none focus:border-blue-600';

            var cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.innerHTML = '&times;';
            cancelBtn.style.cssText = 'position:absolute;right:4px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:16px;color:#9ca3af;padding:0 2px;line-height:1;';
            cancelBtn.title = 'Cancel';
            cancelBtn.onmouseenter = function() { this.style.color = '#ef4444'; };
            cancelBtn.onmouseleave = function() { this.style.color = '#9ca3af'; };

            wrapper.appendChild(input);
            wrapper.appendChild(cancelBtn);
            selectElement.parentNode.insertBefore(wrapper, selectElement.nextSibling);
            input.focus();

            function cleanup(restoreDefault) {
                if (restoreDefault) selectElement.selectedIndex = 0;
                wrapper.remove();
                selectElement.style.display = '';
            }

            function submitValue() {
                var rawValue = input.value.trim();
                if (!rawValue) { cleanup(true); return; }

                if (config) {
                    var parsedValue = rawValue.replace(/[$,]/g, '');
                    var numericValue = parseFloat(parsedValue);

                    if (isNaN(numericValue)) {
                        input.value = '';
                        input.placeholder = 'Numbers only';
                        input.style.borderColor = '#f87171';
                        input.style.backgroundColor = '#fef2f2';
                        return;
                    }
                    if (numericValue < config.min || numericValue > config.max) {
                        input.value = '';
                        input.placeholder = config.min.toLocaleString() + ' - ' + config.max.toLocaleString();
                        input.style.borderColor = '#f87171';
                        input.style.backgroundColor = '#fef2f2';
                        return;
                    }

                    var displayLabel;
                    if (config.format === 'currency') {
                        if (numericValue >= 1000000) {
                            displayLabel = '$' + (numericValue / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
                        } else if (numericValue >= 1000) {
                            displayLabel = '$' + (numericValue / 1000).toFixed(0) + 'K';
                        } else {
                            displayLabel = '$' + numericValue.toLocaleString();
                        }
                    } else if (config.format === 'decimal') {
                        displayLabel = numericValue.toFixed(1).replace(/\.0$/, '');
                    } else {
                        displayLabel = numericValue.toLocaleString();
                    }
                    addCustomOption(selectElement, numericValue, displayLabel + ' (custom)');
                } else {
                    addCustomOption(selectElement, rawValue, rawValue + ' (custom)');
                }
                cleanup(false);
            }

            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); submitValue(); }
                else if (e.key === 'Escape') { cleanup(true); }
            });

            input.addEventListener('blur', function() {
                setTimeout(function() {
                    if (document.body.contains(wrapper)) submitValue();
                }, 150);
            });

            cancelBtn.addEventListener('mousedown', function(e) {
                e.preventDefault();
                cleanup(true);
            });
        }

        function addCustomOption(selectElement, value, label) {
            // Remove any previous custom option
            var existingCustom = selectElement.querySelector('option[data-custom="true"]');
            if (existingCustom) {
                existingCustom.remove();
            }

            // Create and add new custom option
            var customOption = document.createElement('option');
            customOption.value = value;
            customOption.textContent = label;
            customOption.dataset.custom = 'true';

            // Insert after the "Custom..." option
            var customPlaceholder = selectElement.querySelector('option[value="custom"]');
            if (customPlaceholder && customPlaceholder.nextSibling) {
                selectElement.insertBefore(customOption, customPlaceholder.nextSibling);
            } else {
                selectElement.appendChild(customOption);
            }

            // Select the new custom option
            customOption.selected = true;
        }

        // Initialize custom dropdown handlers on page load
        document.addEventListener('DOMContentLoaded', function() {
            // Use event delegation - catches ALL selects with a Custom option (current + future)
            document.addEventListener('change', function(e) {
                if (e.target.tagName === 'SELECT' && e.target.value === 'custom') {
                    handleCustomDropdown(e.target);
                }
            });
        });
